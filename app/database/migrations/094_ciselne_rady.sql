-- ============================================================================
-- DANUBRA — 094 — číselné rady: formát z nastavení, všetky doklady
-- ============================================================================
-- Majiteľ skúsil faktúru v sandboxe SuperFaktúry a chce „normálne" čísla
-- na všetkých dokladoch: **rok + dvojmiestny kód druhu dokladu + 4 číslice**,
-- bez oddeľovačov. Faktúra 2026010001, objednávka 2026020001 … Číslo samo
-- povie, čo je to za doklad, a má 10 číslic — celé je variabilný symbol.
-- Od januára sa poradie začína znova od 0001.
--
--   rad              kód  predvolené  tabuľka (kontrola duplicity)
--   invoice          01   2026010001  danubra_invoices.invoice_number
--   order            02   2026020001  danubra_orders + danubra_work_orders
--   (03 voľný — objednávka pre živnostníka je tá istá objednávka)
--   quote            04   2026040001  danubra_quotes.quote_number
--   contract         05   2026050001  danubra_contracts.contract_number
--   amendment        06   2026060001  danubra_contract_amendments.amendment_number
--   subcontract      07   2026070001  danubra_subcontracts.contract_number
--   credit_note      08   2026080001  danubra_invoices.invoice_number
--   self_bill        09   2026090001  danubra_bills.bill_number (samofakturácia)
--   worker_contract  10   2026100001  danubra_worker_documents.reference
--
-- Formát je v jsonb radu (stĺpec <rad>_series v danubra_settings) popri
-- `year` a `current`:
--   prefix      text, smie byť prázdny (písmená a číslice, najviac 10)
--   year_style  'yyyy' (2026) | 'yy' (26) | 'none' (bez roka)
--   code        '' alebo dve číslice — kód druhu dokladu, v každom rade iný
--   separator   '' | '-' | '/'   — medzi predponou, rokom, kódom a poradím
--   digits      3–7              — doplní sa nulami zľava, NIKDY sa neoreže
--   per_worker  (len self_bill) true = predpona a poradie z karty
--               živnostníka ako doteraz (NOVAK-2026-001)
-- Poradie častí: predpona, rok, kód, poradie. Chýbajúci kľúč = predvolená
-- hodnota (danubra_series_defaults). V karte sa dá prepnúť aj späť na
-- predpony (OBJ-2026-0001).
--
-- Pravidlá (drží ich databáza, nie obrazovka):
--   * číslo prideľuje danubra_next_number atomicky (FOR UPDATE nad riadkom
--     nastavení), smie si ho vypýtať len člen appky;
--   * s rokom v čísle sa rad 1. januára vynuluje; bez roka pokračuje ďalej
--     (inak by sa čísla opakovali);
--   * číslo sa nikdy nepoužije druhýkrát: keď by vyšlo číslo, ktoré už
--     v tabuľke je (ručne zapísané, vzorové), preskočí sa na ďalšie;
--   * formát a „ďalšie číslo" mení len admin cez danubra_set_series — nižšie
--     číslo, než aké už bolo použité, odmietne; kód druhu musí byť v každom
--     rade iný; zmenu zapíše do histórie. Priamy zápis do *_series
--     v danubra_settings stráži spúšťač.
--
-- Už vydané čísla zostávajú, ako sú (aj vzorové VZOR-…). Nový formát majú
-- len nové doklady.
--
-- Pri prechode na ostrú SuperFaktúru: v Nastavenia → Číselné rady nastavte
-- „Ďalšie číslo" tak, aby nadviazalo na ostrý rad (napr. 137 → 2026010137).
--
-- Opravuje aj chybu: ponuky a zmluvy volali danubra_next_number('quote')
-- a ('contract'), ktoré funkcia z 070 odmietala („Neznámy typ číselnej
-- rady") — nová ponuka ani zmluva sa preto nedala založiť.
--
-- Dátový krok (časť 10): rad faktúr sa pre aktuálny rok začne od 1 LEN
-- vtedy, keď v tomto roku nie je žiadna faktúra okrem vzorových (VZOR-…).
-- Inak počítadlo pokračuje. Vzorové faktúry sa neprečíslujú.
--
-- Idempotentné.
-- ============================================================================

-- ── 1. Stĺpce pre nové rady ─────────────────────────────────────────────────
alter table danubra_settings add column if not exists credit_note_series jsonb default '{}'::jsonb;
alter table danubra_settings add column if not exists amendment_series jsonb default '{}'::jsonb;
alter table danubra_settings add column if not exists worker_contract_series jsonb default '{}'::jsonb;
alter table danubra_settings add column if not exists self_bill_series jsonb default '{}'::jsonb;
-- Rad faktúr za živnostníka podľa jeho karty (per_worker) sa vynuluje
-- v januári — treba vedieť, v ktorom roku bolo posledné číslo.
alter table danubra_workers add column if not exists self_billing_year int;

comment on column danubra_workers.self_billing_year is
  'Rok posledného čísla v jeho vlastnom rade faktúr (samofakturácia, per_worker). '
  'V novom roku sa poradie začne od 1. Prázdne = rad pokračuje.';

-- ── 2. Predvolené formáty a skladanie čísla ─────────────────────────────────
create or replace function danubra_series_kinds()
returns text[] language sql immutable as $$
  select array['invoice', 'order', 'quote', 'contract', 'amendment', 'subcontract',
               'credit_note', 'self_bill', 'worker_contract']::text[];
$$;

create or replace function danubra_series_defaults(p_kind text)
returns jsonb language sql immutable as $$
  select case when p_kind = any (danubra_series_kinds()) then
    jsonb_build_object('prefix', '', 'year_style', 'yyyy', 'separator', '', 'digits', 4,
      'code', case p_kind
        when 'invoice' then '01' when 'order' then '02' when 'quote' then '04'
        when 'contract' then '05' when 'amendment' then '06' when 'subcontract' then '07'
        when 'credit_note' then '08' when 'self_bill' then '09' when 'worker_contract' then '10' end)
    || case when p_kind = 'self_bill' then '{"per_worker":false}'::jsonb else '{}'::jsonb end
  end;
$$;

comment on function danubra_series_defaults(text) is
  'Predvolený formát číselného radu: rok + kód druhu + 4 číslice. Faktúra 2026010001, '
  'objednávka …02…, ponuka …04…, zmluva …05…, dodatok …06…, zákazka …07…, '
  'dobropis …08…, faktúra za živnostníka …09…, zmluva so živnostníkom …10….';

-- Len formátovacie kľúče radu — `year`, `current` a `used` sú stav počítadla.
create or replace function danubra_series_format_of(p_kind text, p_series jsonb)
returns jsonb language sql immutable as $$
  select danubra_series_defaults(p_kind) || jsonb_strip_nulls(jsonb_build_object(
    'prefix',     p_series->'prefix',
    'year_style', p_series->'year_style',
    'code',       p_series->'code',
    'separator',  p_series->'separator',
    'digits',     p_series->'digits',
    'per_worker', case when p_kind = 'self_bill' then p_series->'per_worker' end));
$$;

/**
 * Číslo z formátu: [predpona] [rok] [kód] [poradie] spojené oddeľovačom.
 * Poradie sa doplní nulami zľava, dlhšie sa ponechá celé (10 000. doklad
 * pri štyroch čísliciach je …10000, nie …0000). Rovnakú logiku má
 * lib/numbering.js (náhľad v Nastaveniach).
 */
create or replace function danubra_series_format(p_fmt jsonb, p_year int, p_seq bigint, p_prefix text default null)
returns text language plpgsql immutable as $$
declare
  v_prefix text := coalesce(p_prefix, p_fmt->>'prefix', '');
  v_style  text := coalesce(p_fmt->>'year_style', 'yyyy');
  v_code   text := coalesce(p_fmt->>'code', '');
  v_sep    text := coalesce(p_fmt->>'separator', '');
  v_digits int  := coalesce((p_fmt->>'digits')::int, 4);
  v_seq    text := p_seq::text;
  v_parts  text[] := array[]::text[];
begin
  if v_prefix <> '' then v_parts := v_parts || v_prefix; end if;
  if v_style = 'yyyy' then
    v_parts := v_parts || p_year::text;
  elsif v_style = 'yy' then
    v_parts := v_parts || lpad((p_year % 100)::text, 2, '0');
  end if;
  if v_code <> '' then v_parts := v_parts || v_code; end if;
  v_parts := v_parts || lpad(v_seq, greatest(v_digits, length(v_seq)), '0');
  return array_to_string(v_parts, v_sep);
end $$;

-- Regulárny výraz na poradie v čísle daného formátu a roka (predpona, rok
-- a kód musia sedieť presne). Predpona sú len písmená a číslice, kód
-- číslice, oddeľovač „-" alebo „/" — v regexe nič neznamenajú.
create or replace function danubra_series_pattern(p_fmt jsonb, p_year int, p_prefix text default null)
returns text language plpgsql immutable as $$
declare
  v_prefix text := coalesce(p_prefix, p_fmt->>'prefix', '');
  v_style  text := coalesce(p_fmt->>'year_style', 'yyyy');
  v_parts  text[] := array[]::text[];
begin
  if v_prefix <> '' then v_parts := v_parts || v_prefix; end if;
  if v_style = 'yyyy' then
    v_parts := v_parts || p_year::text;
  elsif v_style = 'yy' then
    v_parts := v_parts || lpad((p_year % 100)::text, 2, '0');
  end if;
  if coalesce(p_fmt->>'code', '') <> '' then v_parts := v_parts || (p_fmt->>'code'); end if;
  v_parts := v_parts || '(\d+)'::text;
  return '^' || array_to_string(v_parts, coalesce(p_fmt->>'separator', '')) || '$';
end $$;

-- ── 3. Je číslo už použité? ─────────────────────────────────────────────────
create or replace function danubra_number_taken(p_kind text, p_number text)
returns bool language plpgsql stable security definer set search_path = public as $$
begin
  if p_kind in ('invoice', 'credit_note') then
    return exists (select 1 from danubra_invoices where invoice_number = p_number);
  elsif p_kind = 'order' then
    return exists (select 1 from danubra_orders where order_number = p_number)
        or exists (select 1 from danubra_work_orders where order_number = p_number);
  elsif p_kind = 'subcontract' then
    return exists (select 1 from danubra_subcontracts where contract_number = p_number);
  elsif p_kind = 'quote' then
    return exists (select 1 from danubra_quotes where quote_number = p_number);
  elsif p_kind = 'contract' then
    return exists (select 1 from danubra_contracts where contract_number = p_number);
  elsif p_kind = 'amendment' then
    return exists (select 1 from danubra_contract_amendments where amendment_number = p_number);
  elsif p_kind = 'worker_contract' then
    return exists (select 1 from danubra_worker_documents where kind = 'contract' and reference = p_number);
  elsif p_kind = 'self_bill' then
    return exists (select 1 from danubra_bills where source = 'self_billing' and bill_number = p_number);
  end if;
  return false;
end $$;

-- Najvyššie poradie, ktoré už v tabuľke dokladov je v danom formáte a roku.
create or replace function danubra_series_used_max(p_kind text, p_fmt jsonb, p_year int)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_re  text := danubra_series_pattern(p_fmt, p_year);
  v_max numeric := 0;
  v_x   numeric;
  t     record;
begin
  for t in
    select * from (values
      ('invoice', 'danubra_invoices', 'invoice_number', null),
      ('credit_note', 'danubra_invoices', 'invoice_number', null),
      ('order', 'danubra_orders', 'order_number', null),
      ('order', 'danubra_work_orders', 'order_number', null),
      ('subcontract', 'danubra_subcontracts', 'contract_number', null),
      ('quote', 'danubra_quotes', 'quote_number', null),
      ('contract', 'danubra_contracts', 'contract_number', null),
      ('amendment', 'danubra_contract_amendments', 'amendment_number', null),
      ('worker_contract', 'danubra_worker_documents', 'reference', 'kind = ''contract'''),
      ('self_bill', 'danubra_bills', 'bill_number', 'source = ''self_billing''')
    ) x(kind, tbl, col, cond)
    where x.kind = p_kind
  loop
    execute format('select max(substring(%1$I from $1)::numeric) from %2$I where %1$I ~ $1 and %3$s',
      t.col, t.tbl, coalesce(t.cond, 'true')) into v_x using v_re;
    v_max := greatest(v_max, coalesce(v_x, 0));
  end loop;
  return v_max;
end $$;

-- ── 4. Ďalšie číslo (bez zápisu) ────────────────────────────────────────────
-- Spoločné pre pridelenie (zapíše) a náhľad v Nastaveniach (nie).
create or replace function danubra_series_next(p_kind text, p_series jsonb, p_year int,
  out seq bigint, out number text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_fmt jsonb := danubra_series_format_of(p_kind, coalesce(p_series, '{}'::jsonb));
  v_n   int := 0;
begin
  -- S rokom v čísle sa rad v januári začne od 1. Bez roka pokračuje — inak by
  -- sa číslo zopakovalo každý rok.
  if v_fmt->>'year_style' <> 'none' and coalesce((p_series->>'year')::int, 0) <> p_year then
    seq := 0;
  else
    seq := coalesce((p_series->>'current')::bigint, 0);
  end if;
  loop
    seq := seq + 1;
    number := danubra_series_format(v_fmt, p_year, seq);
    exit when not danubra_number_taken(p_kind, number);
    v_n := v_n + 1;
    if v_n > 10000 then
      raise exception 'Číselný rad % sa zasekol — 10 000 čísel za sebou je už použitých. Nastavte „Ďalšie číslo" v Nastaveniach.', p_kind;
    end if;
  end loop;
end $$;

-- Pridelí číslo a zapíše počítadlo. Bez kontroly práv — volajú ju len
-- danubra_next_number (člen) a danubra_self_bill_issue (admin).
create or replace function danubra_series_take(p_kind text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_col    text := p_kind || '_series';
  v_series jsonb;
  v_year   int := extract(year from now() at time zone 'Europe/Bratislava')::int;
  v_next   record;
begin
  if p_kind is null or not (p_kind = any (danubra_series_kinds())) then
    raise exception 'Neznámy typ číselnej rady: %', p_kind;
  end if;
  -- Zámok jediného riadku nastavení: dve volania naraz sa zoradia za sebou.
  select id into v_id from danubra_settings order by created_at limit 1 for update;
  if not found then
    insert into danubra_settings default values returning id into v_id;
    perform 1 from danubra_settings where id = v_id for update;
  end if;
  execute format('select %I from danubra_settings where id = $1', v_col) into v_series using v_id;
  v_series := coalesce(v_series, '{}'::jsonb);

  select * into v_next from danubra_series_next(p_kind, v_series, v_year);

  perform set_config('danubra.series', '1', true);
  execute format('update danubra_settings set %I = $1, updated_at = now() where id = $2', v_col)
    using v_series || jsonb_build_object('year', v_year, 'current', v_next.seq), v_id;
  perform set_config('danubra.series', '', true);
  return v_next.number;
end $$;

-- ── 5. danubra_next_number ──────────────────────────────────────────────────
create or replace function danubra_next_number(p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Číslo si smie vypýtať len člen appky (069) — inak by cudzí prihlásený
  -- vedel „minúť" číslo a v rade faktúr by vznikla diera.
  if not danubra_is_member() then
    raise exception using errcode = '42501', message = 'Číslo dokladu môže prideliť len člen appky.';
  end if;
  -- Faktúru za živnostníka čísluje len jej vystavenie adminom (danubra_self_bill_issue).
  if p_kind is null or p_kind = 'self_bill' or not (p_kind = any (danubra_series_kinds())) then
    raise exception 'Neznámy typ číselnej rady: %', p_kind;
  end if;
  return danubra_series_take(p_kind);
end;
$$;

comment on function danubra_next_number(text) is
  'Atomicky pridelí ďalšie číslo v rade podľa formátu z nastavení (predvolene rok + kód '
  'druhu + 4 číslice: faktúra 2026010001, objednávka 2026020001 …). Číslo sa doplní nulami, '
  'nikdy neoreže; použité číslo sa preskočí; s rokom sa v januári začne od 1.';

-- ── 6. Náhľad a zmena radu ──────────────────────────────────────────────────
/** Ďalšie čísla všetkých radov (bez zápisu) — pre kartu Číselné rady. */
create or replace function danubra_series_preview()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_row  jsonb;
  v_year int := extract(year from now() at time zone 'Europe/Bratislava')::int;
  v_out  jsonb := '{}'::jsonb;
  v_ser  jsonb;
  k      text;
  v_next record;
begin
  if not danubra_is_member() then
    raise exception using errcode = '42501', message = 'Číselné rady vidí len člen appky.';
  end if;
  select to_jsonb(s) into v_row from danubra_settings s order by created_at limit 1;
  foreach k in array danubra_series_kinds() loop
    v_ser := coalesce(v_row->(k || '_series'), '{}'::jsonb);
    -- Rad podľa živnostníka nemá jedno ďalšie číslo.
    continue when k = 'self_bill' and coalesce((danubra_series_format_of(k, v_ser)->>'per_worker')::bool, false);
    select * into v_next from danubra_series_next(k, v_ser, v_year);
    v_out := v_out || jsonb_build_object(k, jsonb_build_object('next', v_next.number, 'seq', v_next.seq));
  end loop;
  return v_out;
end $$;

/**
 * Admin zmení formát radu a/alebo ďalšie poradové číslo.
 *   p_format  { prefix, year_style, code, separator, digits, per_worker }
 *             — chýbajúci kľúč zostane
 *   p_next    ďalšie poradové číslo (napr. 137 → 2026010137); null = nemení sa
 * Odmietne: neadmina, zlý formát, kód druhu, ktorý má už iný rad, rovnaký
 * formát ako iný rad, číslo nižšie alebo rovné už použitému, číslo, ktoré
 * už má iný doklad, variabilný symbol dlhší než 10 číslic (faktúry, dobropisy).
 */
create or replace function danubra_set_series(p_kind text, p_format jsonb default null, p_next int default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_col     text;
  v_year    int := extract(year from now() at time zone 'Europe/Bratislava')::int;
  v_row     jsonb;
  v_old     jsonb;
  v_oldfmt  jsonb;
  v_fmt     jsonb;
  v_in      jsonb := coalesce(p_format, '{}'::jsonb);
  v_used    numeric := 0;
  v_next    bigint;
  v_cnt     record;
  v_number  text;
  v_ofmt    jsonb;
  v_vs      text;
  v_before  text;
  v_hist    jsonb;
  v_perw    bool;
  k         text;
begin
  if not danubra_is_admin() then
    raise exception using errcode = '42501', message = 'Číselné rady smie meniť len administrátor.';
  end if;
  if p_kind is null or not (p_kind = any (danubra_series_kinds())) then
    raise exception 'Neznámy typ číselnej rady: %', p_kind using errcode = 'check_violation';
  end if;
  v_col := p_kind || '_series';

  -- ── Formát ──
  if v_in ? 'prefix' and not (coalesce(v_in->>'prefix', '') ~ '^[A-Za-z0-9]{0,10}$') then
    raise exception 'Predpona smie mať len písmená bez diakritiky a číslice, najviac 10 znakov.' using errcode = 'check_violation';
  end if;
  if v_in ? 'year_style' and coalesce(v_in->>'year_style', '') not in ('yyyy', 'yy', 'none') then
    raise exception 'Rok v čísle: 2026, 26 alebo bez roka.' using errcode = 'check_violation';
  end if;
  if v_in ? 'code' and not (coalesce(v_in->>'code', '') ~ '^([0-9]{2})?$') then
    raise exception 'Kód druhu dokladu sú dve číslice (01–99) alebo nič.' using errcode = 'check_violation';
  end if;
  if v_in ? 'separator' and coalesce(v_in->>'separator', '') not in ('', '-', '/') then
    raise exception 'Oddeľovač: žiadny, pomlčka alebo lomka.' using errcode = 'check_violation';
  end if;
  if v_in ? 'digits' and (jsonb_typeof(v_in->'digits') <> 'number'
      or (v_in->>'digits')::numeric not between 3 and 7 or (v_in->>'digits')::numeric % 1 <> 0) then
    raise exception 'Počet číslic poradia: 3 až 7.' using errcode = 'check_violation';
  end if;
  if v_in ? 'per_worker' and (p_kind <> 'self_bill' or jsonb_typeof(v_in->'per_worker') <> 'boolean') then
    raise exception 'Rad podľa živnostníka sa dá zapnúť len pri faktúrach za živnostníkov.' using errcode = 'check_violation';
  end if;
  if p_next is not null and p_next < 1 then
    raise exception 'Ďalšie číslo musí byť aspoň 1.' using errcode = 'check_violation';
  end if;

  select id into v_id from danubra_settings order by created_at limit 1 for update;
  if not found then
    insert into danubra_settings default values returning id into v_id;
  end if;
  select to_jsonb(s) into v_row from danubra_settings s where id = v_id for update;
  v_old := coalesce(v_row->v_col, '{}'::jsonb);
  if jsonb_typeof(v_old) <> 'object' then v_old := '{}'::jsonb; end if;
  v_oldfmt := danubra_series_format_of(p_kind, v_old);
  v_fmt := v_oldfmt || jsonb_strip_nulls(jsonb_build_object(
    'prefix', v_in->'prefix', 'year_style', v_in->'year_style', 'code', v_in->'code',
    'separator', v_in->'separator', 'per_worker', v_in->'per_worker',
    'digits', case when v_in ? 'digits' then to_jsonb((v_in->>'digits')::int) end));
  v_perw := p_kind = 'self_bill' and coalesce((v_fmt->>'per_worker')::bool, false);

  if v_perw then
    -- Predponu a poradie má každý živnostník na svojej karte.
    if coalesce(v_fmt->>'prefix', '') <> '' then
      raise exception 'Pri rade podľa živnostníka je predpona na jeho karte (Číselný rad jeho faktúr) — tu nechajte prázdnu.'
        using errcode = 'check_violation';
    end if;
    if p_next is not null then
      raise exception 'Pri rade podľa živnostníka má poradie každý svoje — ďalšie číslo sa tu nenastavuje.' using errcode = 'check_violation';
    end if;
  end if;

  -- Kód druhu a celý formát musia byť v každom rade iné — číslo samo povie,
  -- čo je to za doklad, a dva rady si nikdy neprekážajú.
  foreach k in array danubra_series_kinds() loop
    continue when k = p_kind;
    v_ofmt := danubra_series_format_of(k, coalesce(v_row->(k || '_series'), '{}'::jsonb));
    if coalesce(v_fmt->>'code', '') <> '' and v_fmt->>'code' = coalesce(v_ofmt->>'code', '') then
      raise exception 'Kód % už má rad „%". Každý druh dokladu potrebuje vlastný kód.', v_fmt->>'code', k
        using errcode = 'check_violation';
    end if;
    if (v_fmt - 'digits' - 'per_worker') = (v_ofmt - 'digits' - 'per_worker') then
      raise exception 'Formát je rovnaký ako v rade „%" — líšiť sa musí predpona alebo kód.', k
        using errcode = 'check_violation';
    end if;
  end loop;

  -- Variabilný symbol = číslice čísla faktúry; banka a SuperFaktúra berú najviac 10.
  if p_kind in ('invoice', 'credit_note') then
    v_vs := regexp_replace(danubra_series_format(v_fmt, v_year,
      (power(10, (v_fmt->>'digits')::int) - 1)::bigint), '\D', '', 'g');
    if length(v_vs) > 10 then
      raise exception 'Variabilný symbol (číslice z čísla faktúry) by mal % číslic — banka berie najviac 10. Uberte číslice poradia, kód alebo dajte kratší rok.',
        length(v_vs) using errcode = 'check_violation';
    end if;
  end if;

  -- ── Čo už bolo použité ──
  -- Poradie z počítadla platí, keď sa formát nemení a je ten istý rok (alebo
  -- rad bez roka). K tomu pamäť použitých poradí podľa formátu (`used`) —
  -- keď sa formát zmení a potom vráti, rad nezačne znova od 1: pridelené
  -- číslo mohlo odísť (napr. do SuperFaktúry), aj keď doklad v appke nie je.
  -- A najvyššie číslo, ktoré v tomto formáte a roku už v tabuľke je.
  if not v_perw then
    if (v_fmt - 'per_worker') = (v_oldfmt - 'per_worker')
       and (v_fmt->>'year_style' = 'none' or coalesce((v_old->>'year')::int, 0) = v_year) then
      v_used := coalesce((v_old->>'current')::numeric, 0);
    end if;
    v_hist := coalesce(v_old->'used', '{}'::jsonb);
    if coalesce((v_old->>'current')::numeric, 0) > 0 then
      v_hist := v_hist || jsonb_build_object(
        danubra_series_pattern(v_oldfmt, coalesce((v_old->>'year')::int, v_year)),
        greatest(coalesce((v_hist->>danubra_series_pattern(v_oldfmt, coalesce((v_old->>'year')::int, v_year)))::numeric, 0),
                 (v_old->>'current')::numeric));
    end if;
    v_used := greatest(v_used, coalesce((v_hist->>danubra_series_pattern(v_fmt, v_year))::numeric, 0),
                       danubra_series_used_max(p_kind, v_fmt, v_year));

    select * into v_cnt from danubra_series_next(p_kind, v_old, v_year);
    v_before := v_cnt.number;

    if p_next is not null then
      if p_next <= v_used then
        raise exception 'Číslo % už bolo použité (alebo je nižšie než použité). Najnižšie možné ďalšie číslo je % (%).',
          danubra_series_format(v_fmt, v_year, p_next), v_used + 1, danubra_series_format(v_fmt, v_year, (v_used + 1)::bigint)
          using errcode = 'check_violation';
      end if;
      v_number := danubra_series_format(v_fmt, v_year, p_next);
      if danubra_number_taken(p_kind, v_number) then
        raise exception 'Číslo % už má iný doklad. Zvoľte vyššie.', v_number using errcode = 'check_violation';
      end if;
      v_next := p_next;
    else
      -- Mení sa len formát: ďalšie číslo sa posunie za všetky použité.
      v_next := greatest(case when (v_fmt - 'per_worker') = (v_oldfmt - 'per_worker') then v_cnt.seq else 1 end,
                         (v_used + 1)::bigint);
    end if;
  end if;

  perform set_config('danubra.series', '1', true);
  if v_perw then
    execute format('update danubra_settings set %I = $1, updated_at = now() where id = $2', v_col)
      using v_old || v_fmt, v_id;
    v_number := danubra_series_format(v_fmt, v_year, 1, 'NOVAK');
  else
    execute format('update danubra_settings set %I = $1, updated_at = now() where id = $2', v_col)
      using v_old || v_fmt || jsonb_build_object('year', v_year, 'current', v_next - 1, 'used', v_hist), v_id;
    v_number := (select number from danubra_series_next(p_kind,
      v_fmt || jsonb_build_object('year', v_year, 'current', v_next - 1), v_year));
  end if;
  perform set_config('danubra.series', '', true);

  insert into danubra_activities (entity_type, entity_id, type, body, channel_meta, source, created_by)
  values ('settings', v_id, 'settings',
    format('Číselný rad %s: %s', case p_kind
        when 'invoice' then 'Faktúry' when 'credit_note' then 'Dobropisy' when 'order' then 'Objednávky'
        when 'subcontract' then 'Zákazky' when 'quote' then 'Ponuky' when 'contract' then 'Zmluvy s odberateľmi'
        when 'amendment' then 'Dodatky zmlúv' when 'worker_contract' then 'Zmluvy so živnostníkmi'
        else 'Faktúry za živnostníkov' end,
      case when v_perw then 'podľa živnostníka, napr. ' || v_number
           else 'ďalšie číslo ' || v_number || coalesce(' (predtým ' || v_before || ')', '') end),
    jsonb_build_object('series', p_kind, 'old', v_old, 'new', v_fmt, 'next', v_next, 'number', v_number),
    'manual', auth.uid());

  return jsonb_build_object('kind', p_kind, 'format', v_fmt, 'seq', v_next, 'next', v_number);
end $$;

comment on function danubra_set_series(text, jsonb, int) is
  'Admin zmení formát číselného radu a/alebo ďalšie poradové číslo. Nižšie než použité, '
  'číslo iného dokladu a kód druhu iného radu odmietne. Zmenu zapíše do danubra_activities.';

-- ── 7. Stráž: rady sa nemenia priamym zápisom ───────────────────────────────
create or replace function danubra_settings_series_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('postgres', 'supabase_admin')
     or coalesce(current_setting('danubra.series', true), '') = '1' then
    return new;
  end if;
  if new.invoice_series is distinct from old.invoice_series
     or new.order_series is distinct from old.order_series
     or new.subcontract_series is distinct from old.subcontract_series
     or new.quote_series is distinct from old.quote_series
     or new.contract_series is distinct from old.contract_series
     or new.amendment_series is distinct from old.amendment_series
     or new.credit_note_series is distinct from old.credit_note_series
     or new.worker_contract_series is distinct from old.worker_contract_series
     or new.self_bill_series is distinct from old.self_bill_series then
    raise exception 'Číselné rady sa menia len v Nastavenia → Číselné rady (číslo sa nesmie použiť druhýkrát).'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists danubra_settings_series_guard on danubra_settings;
create trigger danubra_settings_series_guard before update on danubra_settings
  for each row execute function danubra_settings_series_guard();

-- ── 8. Faktúra za živnostníka: číslo z radu ─────────────────────────────────
-- Rovnaká funkcia ako v 052; mení sa len skladanie čísla:
--   predvolene spoločný rad 09 (2026090001) — číslo je jedinečné pre každého
--     živnostníka aj naprieč všetkými;
--   per_worker = true — ako doteraz: predpona z karty (inak „OV") a poradie
--     u živnostníka (NOVAK-2026-005), v januári od 1.
create or replace function danubra_self_bill_issue(p_bill uuid, p_due_days int default 14)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  w record;
  v_seq int;
  v_num text;
  v_company jsonb;
  v_fmt jsonb;
  v_year int := extract(year from now() at time zone 'Europe/Bratislava')::int;
  v_n int := 0;
begin
  if not danubra_is_admin() then
    raise exception 'Faktúru za živnostníka smie schváliť a vystaviť len administrátor.'
      using errcode = 'check_violation';
  end if;

  select * into b from danubra_bills where id = p_bill for update;
  if b.id is null or b.source <> 'self_billing' or b.status <> 'self_draft' then
    raise exception 'Vystaviť sa dá len návrh faktúry za živnostníka.' using errcode = 'check_violation';
  end if;
  if coalesce(b.amount, 0) <= 0 then
    raise exception 'Faktúra nemá sumu.' using errcode = 'check_violation';
  end if;

  select * into w from danubra_workers where id = b.worker_id for update;
  if not coalesce(w.self_billing, false) then
    raise exception 'Dohoda o vystavovaní faktúr za živnostníka už neplatí.' using errcode = 'check_violation';
  end if;

  select danubra_series_format_of('self_bill', coalesce(self_bill_series, '{}'::jsonb)), supplier
    into v_fmt, v_company from danubra_settings order by created_at limit 1;
  v_fmt := coalesce(v_fmt, danubra_series_defaults('self_bill'));

  if coalesce((v_fmt->>'per_worker')::bool, false) then
    v_seq := coalesce(w.self_billing_seq, 0);
    if v_fmt->>'year_style' <> 'none' and w.self_billing_year is not null and w.self_billing_year <> v_year then
      v_seq := 0;
    end if;
    loop
      v_seq := v_seq + 1;
      v_num := danubra_series_format(v_fmt, v_year, v_seq, coalesce(nullif(btrim(w.self_billing_prefix), ''), 'OV'));
      exit when not danubra_number_taken('self_bill', v_num);
      v_n := v_n + 1;
      if v_n > 10000 then raise exception 'Rad faktúr za živnostníka % sa zasekol.', w.full_name; end if;
    end loop;
    update danubra_workers set self_billing_seq = v_seq, self_billing_year = v_year where id = w.id;
  else
    v_num := danubra_series_take('self_bill');
  end if;

  perform set_config('danubra.self_issue', '1', true);
  update danubra_bills set
    bill_number = v_num,
    variable_symbol = right(regexp_replace(v_num, '\D', '', 'g'), 10),
    status = 'self_sent',
    issue_date = current_date,
    due_date = current_date + greatest(coalesce(p_due_days, 14), 0),
    approved_by = auth.uid(), approved_at = now(),
    supplier_name = coalesce(nullif(btrim(w.company_name), ''), w.full_name),
    supplier_ico = w.company_id, supplier_dic = w.tax_id, supplier_ic_dph = w.vat_id,
    supplier_iban = nullif(replace(upper(coalesce(w.bank_iban, '')), ' ', ''), ''),
    confirm_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    extracted = coalesce(extracted, '{}'::jsonb) || jsonb_build_object('_self', jsonb_build_object(
      'worker', jsonb_build_object('full_name', w.full_name, 'company_name', w.company_name,
        'address', coalesce(w.business_address, w.address), 'city', coalesce(w.business_city, w.city),
        'zip', w.business_zip, 'company_id', w.company_id, 'tax_id', w.tax_id, 'vat_id', w.vat_id,
        'iban', w.bank_iban, 'vat_payer', coalesce(w.vat_payer, false), 'phone', w.phone),
      'company', v_company,
      'issued_at', now()))
  where id = b.id;
  perform set_config('danubra.self_issue', '', true);
  return v_num;
end $$;

-- ── 9. Práva ────────────────────────────────────────────────────────────────
-- Supabase dáva novým funkciám EXECUTE aj pre anon (069, časť 8).
do $x$
declare f text;
begin
  foreach f in array array[
    'danubra_series_kinds()', 'danubra_series_defaults(text)', 'danubra_series_format_of(text, jsonb)',
    'danubra_series_format(jsonb, int, bigint, text)', 'danubra_series_pattern(jsonb, int, text)',
    'danubra_number_taken(text, text)', 'danubra_series_used_max(text, jsonb, int)',
    'danubra_series_next(text, jsonb, int)', 'danubra_series_take(text)',
    'danubra_next_number(text)', 'danubra_series_preview()',
    'danubra_set_series(text, jsonb, int)', 'danubra_self_bill_issue(uuid, int)',
    'danubra_settings_series_guard()']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $x$;
-- Z appky: pridelenie, náhľad, zmena (kontrolu člena/admina robia samy)
-- a čisté formátovacie funkcie. Vnútornosti (čítajú tabuľky a zapisujú
-- počítadlo s právami vlastníka) prihlásený volať nesmie.
grant execute on function danubra_next_number(text) to authenticated;
grant execute on function danubra_series_preview() to authenticated;
grant execute on function danubra_set_series(text, jsonb, int) to authenticated;
grant execute on function danubra_self_bill_issue(uuid, int) to authenticated;
grant execute on function danubra_series_kinds() to authenticated;
grant execute on function danubra_series_defaults(text) to authenticated;
grant execute on function danubra_series_format(jsonb, int, bigint, text) to authenticated;
revoke execute on function danubra_number_taken(text, text) from authenticated;
revoke execute on function danubra_series_used_max(text, jsonb, int) from authenticated;
revoke execute on function danubra_series_next(text, jsonb, int) from authenticated;
revoke execute on function danubra_series_take(text) from authenticated;

-- ── 10. Dáta: formát zapísaný do radov, rad faktúr od 1 ─────────────────────
-- Robí sa ako postgres (migrácia), stráž z časti 7 to pustí.
do $x$
declare
  v_year int := extract(year from now() at time zone 'Europe/Bratislava')::int;
  v_real int;
  k text;
begin
  if not exists (select 1 from danubra_settings) then
    insert into danubra_settings default values;
  end if;

  -- Formát sa zapíše len tam, kde ešte nie je (existujúci kľúč vyhráva).
  -- Doteraz rady formát neukladali (bol napísaný vo funkcii), takže všetky
  -- dostanú nový predvolený: rok + kód + 4 číslice.
  foreach k in array danubra_series_kinds() loop
    execute format('update danubra_settings set %1$I = $1 || coalesce(%1$I, ''{}''::jsonb)', k || '_series')
      using danubra_series_defaults(k);
  end loop;

  -- Faktúry: od 1 len vtedy, keď v tomto roku nie je iná faktúra než vzorová.
  -- Vzorové (VZOR-…) zostávajú, ako sú — nečíslovali sa z radu. Inak
  -- počítadlo pokračuje (napr. po 2026005 príde 2026010006).
  select count(*) into v_real from danubra_invoices
   where invoice_number is not null and invoice_number not ilike '%VZOR%'
     and (invoice_number like v_year::text || '%'
          or extract(year from coalesce(issue_date, created_at::date)) = v_year);
  if v_real = 0 then
    update danubra_settings set invoice_series = invoice_series || jsonb_build_object('year', v_year, 'current', 0);
    raise notice 'Migrácia 094: v roku % nie je žiadna faktúra okrem vzorových — rad faktúr začne od %.',
      v_year, danubra_series_format(danubra_series_defaults('invoice'), v_year, 1);
  else
    raise notice 'Migrácia 094: v roku % je % faktúr mimo vzorových — rad faktúr pokračuje (počítadlo sa nemení).',
      v_year, v_real;
  end if;
end $x$;

-- ── Diagnostika ─────────────────────────────────────────────────────────────
-- Ďalšie číslo v každom rade (bez zápisu) — rovnaké ukáže karta Číselné rady.
select k as rad,
       (danubra_series_next(k, coalesce(to_jsonb(s)->(k || '_series'), '{}'::jsonb),
          extract(year from now() at time zone 'Europe/Bratislava')::int)).number as dalsie_cislo
  from danubra_settings s, unnest(danubra_series_kinds()) k
 order by array_position(danubra_series_kinds(), k);
