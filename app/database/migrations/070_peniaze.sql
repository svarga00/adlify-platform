-- ============================================================================
-- DANUBRA — 070 — peniaze a faktúry: čo musí držať databáza, nie obrazovka
-- ============================================================================
-- Kontrola pred ostrou prevádzkou našla miesta, kde pravidlo firmy držalo
-- len tlačidlo. Toto ich presúva do databázy:
--
--   1. Číselný rad faktúr: `lpad(…, 3)` číslo 1000 ORÉŽE na „100" —
--      od tisícej faktúry v roku by každé ďalšie číslo narazilo na
--      existujúce (unikátny index) a fakturácia by stála do konca roka.
--   2. Z obdobia jedna faktúra: kontrola „už existuje" nebola chránená
--      zámkom — dve volania naraz (dvojklik, mesačná fakturácia v dvoch
--      oknách) vytvorili dve faktúry z toho istého obdobia. Teraz zámok
--      obdobia + unikátny index.
--   3. Suma faktúry z obdobia na centy: hodiny × sadzba dávali 279,125 €
--      a tá suma išla do faktúry nezaokrúhlená (SuperFaktúra a banka
--      počítajú 279,13 €). Dátum vystavenia podľa Slovenska, nie podľa UTC.
--   4. Schválenie faktúry odberateľovi (v2): suma > 0, číslo, reverse charge
--      §13b a USt-IdNr odberateľa, uzavreté obdobie, položky = suma. Doteraz
--      to kontrolovalo len okno — priamy update to obišiel.
--   5. Obdobie sa po vzniku faktúry neotvára: otvoriť späť sa dalo uzavreté
--      obdobie, z ktorého už bol návrh alebo schválená faktúra. Hodiny sa
--      potom zmenili a faktúra (už zamknutá schválením) nesedela s podkladom.
--   6. Párovanie príjmov: platba sa spárovala len podľa variabilného
--      symbolu — záloha 1 000 € na faktúru za 8 736 € ju označila ako
--      zaplatenú a upomienky prestali. Teraz musí sedieť aj suma.
--   7. Príkaz na úhradu: `payment_ordered_at` — faktúra, na ktorú už
--      odišiel príkaz do banky, sa v ďalšom súbore sama nezaškrtne.
--
-- Dáta sa nemenia. Idempotentné.
-- ============================================================================

-- ── 1. Číselný rad bez orezania ─────────────────────────────────────────────
-- Rovnaká funkcia ako v 003, mení sa len dĺžka doplnenia nulami: číslo sa
-- nuluje zľava na 3 (4) cifry, dlhšie číslo sa ponechá celé.
create or replace function danubra_next_number(p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings danubra_settings%rowtype;
  v_series   jsonb;
  v_year     int := extract(year from now() at time zone 'Europe/Bratislava')::int;
  v_current  int;
  v_col      text;
  v_result   text;
  v_seq      text;
begin
  -- Číslo si smie vypýtať len člen appky (069) — inak by cudzí prihlásený
  -- vedel „minúť" číslo a v rade faktúr by vznikla diera.
  if not danubra_is_member() then
    raise exception using errcode = '42501', message = 'Číslo dokladu môže prideliť len člen appky.';
  end if;
  if p_kind not in ('order', 'invoice', 'subcontract') then
    raise exception 'Neznámy typ číselnej rady: %', p_kind;
  end if;

  select * into v_settings from danubra_settings order by created_at limit 1 for update;
  if not found then
    insert into danubra_settings default values returning * into v_settings;
    select * into v_settings from danubra_settings where id = v_settings.id for update;
  end if;

  if p_kind = 'order' then
    v_col := 'order_series'; v_series := v_settings.order_series;
  elsif p_kind = 'invoice' then
    v_col := 'invoice_series'; v_series := v_settings.invoice_series;
  else
    v_col := 'subcontract_series'; v_series := v_settings.subcontract_series;
  end if;
  v_series := coalesce(v_series, '{}'::jsonb);

  if coalesce((v_series->>'year')::int, 0) <> v_year then
    v_current := 1;
  else
    v_current := coalesce((v_series->>'current')::int, 0) + 1;
  end if;
  v_series := v_series || jsonb_build_object('year', v_year, 'current', v_current);

  execute format('update danubra_settings set %I = $1, updated_at = now() where id = $2', v_col)
    using v_series, v_settings.id;

  v_seq := v_current::text;
  if p_kind = 'order' then
    v_result := 'OBJ-' || v_year || '-' || lpad(v_seq, greatest(4, length(v_seq)), '0');
  elsif p_kind = 'invoice' then
    v_result := v_year::text || lpad(v_seq, greatest(3, length(v_seq)), '0');
  else
    v_result := 'ZAK-' || v_year || '-' || lpad(v_seq, greatest(4, length(v_seq)), '0');
  end if;

  return v_result;
end;
$$;

comment on function danubra_next_number(text) is
  'Atomicky pridelí ďalšie číslo v rade (OBJ-2026-0042, 2026001, ZAK-2026-0007). '
  'Číslo sa doplní nulami zľava, ale nikdy sa neoreže — 1000. faktúra je 20261000.';

grant execute on function danubra_next_number(text) to authenticated, service_role;

-- ── 2. + 3. Faktúra z obdobia: zámok, centy, slovenský dátum ───────────────
create or replace function danubra_invoice_from_period(p_period_id uuid)
returns danubra_invoices
language plpgsql
security invoker
as $$
declare
  per danubra_periods;
  sc  danubra_subcontracts;
  pt  danubra_partners;
  inv danubra_invoices;
  v_number text;
  v_withholding_pct numeric := 0;
  v_amount numeric;
  v_wh numeric;
  v_terms int;
  v_today date := (now() at time zone 'Europe/Bratislava')::date;
begin
  -- Zámok obdobia: druhé volanie počká, kým prvé skončí, a potom už
  -- faktúru uvidí. Bez neho prešli kontrolou obe.
  select * into per from danubra_periods where id = p_period_id for update;
  if not found then
    raise exception 'obdobie % neexistuje', p_period_id;
  end if;
  if per.status <> 'closed' then
    raise exception 'faktúra sa robí z uzavretého obdobia; toto je „%"', per.status;
  end if;
  if exists (select 1 from danubra_invoices where period_id = p_period_id
             and status <> 'cancelled') then
    raise exception 'z tohto obdobia už faktúra existuje';
  end if;

  select * into sc from danubra_subcontracts where id = per.subcontract_id;
  select * into pt from danubra_partners where id = sc.partner_id;
  if pt.id is null then
    raise exception 'zákazka nemá odberateľa — nie je komu fakturovať';
  end if;

  -- Faktúra je v centoch. Súčet hodín × sadzba môže mať tri a viac
  -- desatinných miest (7,25 h × 38,50 € = 279,125 €).
  v_amount := round(coalesce(per.amount_charged, 0), 2);
  v_terms := coalesce(pt.payment_terms_days, 30);

  -- §48b: pri stavebných prácach zrazí odberateľ 15 % — ale len vtedy, keď
  -- nemáme platnú Freistellungsbescheinigung (firemná, v registri compliance).
  if sc.work_type = 'construction'
     and coalesce(sc.freistellung_verified, false) = false
     and not danubra_freistellung_ok(v_today) then
    v_withholding_pct := coalesce(
      (select (staffing->>'withholding_pct')::numeric from danubra_settings limit 1), 15);
  end if;
  v_wh := round(v_amount * v_withholding_pct / 100, 2);

  v_number := danubra_next_number('invoice');

  insert into danubra_invoices (
    invoice_number, partner_id, subcontract_id, period_id, contract_id,
    type, issue_date, due_date, delivery_date,
    billing_period_from, billing_period_to,
    total, currency, vat_regime, status,
    withholding_pct, withholding_amount, amount_net
  ) values (
    v_number, pt.id, sc.id, per.id, sc.contract_id,
    'standard', v_today, v_today + v_terms, per.period_to,
    per.period_from, per.period_to,
    v_amount, 'EUR',
    case when coalesce(pt.reverse_charge, true) then 'reverse_charge' else 'standard' end,
    'draft',
    v_withholding_pct, v_wh, v_amount - v_wh
  ) returning * into inv;

  return inv;
end $$;

comment on function danubra_invoice_from_period(uuid) is
  'Vytvorí návrh faktúry z uzavretého obdobia. Obdobie zamkne (dve volania naraz '
  'nevytvoria dve faktúry), sumu zaokrúhli na centy, dátum vystavenia je slovenský '
  'deň. Zrážku §48b ráta len pri stavebných prácach bez platnej Freistellung.';

-- Unikátny index: z jedného obdobia najviac jedna živá faktúra. Ak by už
-- v databáze dvojica bola, index sa nezaloží a migrácia to povie — dvojicu
-- treba najprv stornovať ručne (nič sa nemaže).
do $x$
begin
  if exists (
    select period_id from danubra_invoices
     where period_id is not null and status <> 'cancelled' and archived_at is null
     group by period_id having count(*) > 1
  ) then
    raise notice 'POZOR: niektoré obdobie má viac živých faktúr — idx_dinv_period_one sa nezaložil. '
      'Nájdete ich: select period_id, count(*) from danubra_invoices where period_id is not null '
      'and status <> ''cancelled'' and archived_at is null group by 1 having count(*) > 1;';
  else
    create unique index if not exists idx_dinv_period_one on danubra_invoices(period_id)
      where period_id is not null and status <> 'cancelled' and archived_at is null;
  end if;
end $x$;

-- ── 4. Čo musí platiť pri schválení faktúry odberateľovi ───────────────────
-- Rovnaké tvrdé pravidlá ako DanubraInvoice.reviewBeforeApproval (tie, ktoré
-- sa nedajú obísť výnimkou). Rozdiel sumy voči podkladu sa výnimkou povoliť
-- dá, preto tu nie je.
create or replace function danubra_invoice_approve_rules()
returns trigger language plpgsql as $$
declare
  v_ust text;
  v_per text;
  v_items numeric;
  v_n int;
begin
  if current_user in ('postgres', 'supabase_admin') then return new; end if;
  if new.status is not distinct from old.status or new.status <> 'approved'
     or new.partner_id is null then
    return new;
  end if;

  if coalesce(new.total, 0) <= 0 then
    raise exception 'Faktúra je na nulu — schváliť sa nedá.' using errcode = 'check_violation';
  end if;
  if btrim(coalesce(new.invoice_number, '')) = '' then
    raise exception 'Faktúra nemá číslo — schváliť sa nedá.' using errcode = 'check_violation';
  end if;
  if coalesce(new.vat_regime, '') <> 'reverse_charge' then
    raise exception 'Nemeckému odberateľovi fakturujeme len v režime reverse charge §13b. '
      'Zapnite odberateľovi reverse charge a uložte návrh znova.' using errcode = 'check_violation';
  end if;
  select ust_idnr into v_ust from danubra_partners where id = new.partner_id;
  if btrim(coalesce(v_ust, '')) = '' then
    raise exception 'Odberateľ nemá USt-IdNr — reverse charge §13b sa bez neho neuznáva. '
      'Doplňte ho na karte odberateľa.' using errcode = 'check_violation';
  end if;
  if new.period_id is not null then
    select status into v_per from danubra_periods where id = new.period_id;
    if v_per = 'open' then
      raise exception 'Obdobie tejto faktúry je otvorené — hodiny sa ešte môžu zmeniť. Uzavrite ho.'
        using errcode = 'check_violation';
    end if;
  end if;
  -- Voľná faktúra: súčet živých položiek musí byť suma faktúry.
  select count(*), coalesce(sum(round(coalesce(quantity, 0) * round(coalesce(unit_price, 0), 2), 2)), 0)
    into v_n, v_items
    from danubra_invoice_items where invoice_id = new.id and removed_at is null;
  if v_n > 0 and v_items <> round(new.total, 2) then
    raise exception 'Položky dávajú % €, faktúra % €. Otvorte „Upraviť návrh" a uložte znova.',
      v_items, round(new.total, 2) using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists danubra_invoice_approve_rules on danubra_invoices;
create trigger danubra_invoice_approve_rules before update on danubra_invoices
  for each row execute function danubra_invoice_approve_rules();

comment on function danubra_invoice_approve_rules() is
  'Schválenie faktúry odberateľovi: suma > 0, číslo, reverse charge §13b, USt-IdNr '
  'odberateľa, uzavreté obdobie a položky = suma. Drží to databáza, nie okno.';

-- ── 5. Obdobie s faktúrou sa neotvára ───────────────────────────────────────
-- Samostatný spúšťač, nie úprava danubra_reopen_period — platí aj pre
-- priamy update stavu obdobia.
create or replace function danubra_period_reopen_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('postgres', 'supabase_admin') then return new; end if;
  if old.status in ('closed', 'invoiced') and new.status = 'open' then
    if exists (select 1 from danubra_invoices
                where period_id = new.id and status <> 'cancelled' and archived_at is null) then
      raise exception 'Z obdobia už je faktúra (aj návrh). Otvoriť späť sa nedá — najprv faktúru '
        'stornujte alebo opravte rozdiel v nasledujúcom období.' using errcode = 'check_violation';
    end if;
    if exists (select 1 from danubra_bills
                where period_id = new.id and source = 'self_billing'
                  and status <> 'discarded' and archived_at is null) then
      raise exception 'Z obdobia už je faktúra za živnostníka. Otvoriť späť sa nedá — najprv ju zahoďte.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists danubra_period_reopen_guard on danubra_periods;
create trigger danubra_period_reopen_guard before update on danubra_periods
  for each row execute function danubra_period_reopen_guard();

comment on function danubra_period_reopen_guard() is
  'Uzavreté obdobie, z ktorého už je faktúra odberateľovi (aj návrh) alebo faktúra '
  'za živnostníka, sa neotvorí späť — inak by sa hodiny zmenili pod faktúrou.';

-- ── 6. Párovanie príjmov: VS aj suma ────────────────────────────────────────
-- Rovnaká funkcia ako v 051; pri príjme pribudla podmienka na sumu. Sedieť
-- môže suma na úhradu po zrážke §48b (amount_net) alebo celá suma.
create or replace function danubra_bank_automatch(p_batch text default null)
returns int
language plpgsql
security invoker
as $$
declare
  tx record;
  v_id uuid;
  v_count int := 0;
  v_iban text;
  v_vs text;
begin
  for tx in
    select * from danubra_bank_transactions
    where match_status = 'unmatched'
      and (p_batch is null or import_batch = p_batch)
    order by booked_at
  loop
    v_id := null;

    -- Príjem: variabilný symbol musí sedieť s číslom faktúry a suma tiež.
    -- Čiastočná platba sa nespáruje sama — rozhodne o nej človek.
    if tx.amount > 0 and tx.variable_symbol is not null then
      select i.id into v_id
      from danubra_invoices i
      where regexp_replace(coalesce(i.invoice_number, ''), '\D', '', 'g')
            = regexp_replace(tx.variable_symbol, '\D', '', 'g')
        and i.status in ('issued', 'sent', 'overdue')
        and (abs(coalesce(i.amount_net, i.total) - tx.amount) <= 0.01
             or abs(coalesce(i.total, 0) - tx.amount) <= 0.01)
        and not exists (
          select 1 from danubra_bank_transactions b
          where b.matched_invoice_id = i.id and b.match_status <> 'ignored'
        )
      limit 1;

      if v_id is not null then
        update danubra_bank_transactions
        set matched_invoice_id = v_id, match_status = 'auto', matched_at = now()
        where id = tx.id;
        v_count := v_count + 1;
        continue;
      end if;
    end if;

    -- Výdaj: suma a k tomu VS alebo IBAN (z faktúry, inak zo živnostníka).
    if tx.amount < 0 then
      v_iban := nullif(replace(upper(coalesce(tx.counterparty_iban, '')), ' ', ''), '');
      v_vs := nullif(ltrim(regexp_replace(coalesce(tx.variable_symbol, ''), '\D', '', 'g'), '0'), '');

      select bl.id into v_id
      from danubra_bills bl
      left join danubra_workers w on w.id = bl.worker_id
      where abs(bl.amount - abs(tx.amount)) <= 0.01
        and bl.status in ('approved', 'checked')
        and (
          (v_vs is not null and ltrim(regexp_replace(coalesce(bl.variable_symbol, ''), '\D', '', 'g'), '0') = v_vs)
          or (v_iban is not null and replace(upper(coalesce(bl.supplier_iban, '')), ' ', '') = v_iban)
          or (v_iban is not null and replace(upper(coalesce(w.bank_iban, '')), ' ', '') = v_iban)
        )
        and not exists (
          select 1 from danubra_bank_transactions b
          where b.matched_bill_id = bl.id and b.match_status <> 'ignored'
        )
      order by
        ((v_vs is not null and ltrim(regexp_replace(coalesce(bl.variable_symbol, ''), '\D', '', 'g'), '0') = v_vs)::int
         + (v_iban is not null and v_iban in (replace(upper(coalesce(bl.supplier_iban, '')), ' ', ''),
                                              replace(upper(coalesce(w.bank_iban, '')), ' ', '')))::int) desc,
        bl.due_date nulls last
      limit 1;

      if v_id is not null then
        update danubra_bank_transactions
        set matched_bill_id = v_id, match_status = 'auto', matched_at = now()
        where id = tx.id;
        v_count := v_count + 1;
      end if;
    end if;
  end loop;

  return v_count;
end $$;

comment on function danubra_bank_automatch(text) is
  'Spáruje príjmy podľa variabilného symbolu A sumy (po zrážke §48b alebo celej), '
  'výdaje podľa sumy + VS alebo IBAN-u. Čiastočnú platbu nechá človeku. Vracia '
  'počet spárovaných.';

-- ── 7. Príkaz na úhradu už odišiel ──────────────────────────────────────────
alter table danubra_bills add column if not exists payment_ordered_at timestamptz;

comment on column danubra_bills.payment_ordered_at is
  'Kedy sa na faktúru naposledy pripravil príkaz na úhradu (SEPA XML). Faktúra '
  'zostáva schválená, kým sa nespáruje s výpisom — bez tejto značky by ju ďalší '
  'súbor ponúkol zaplatiť druhýkrát.';

-- ── Diagnostika ─────────────────────────────────────────────────────────────
-- Návrhy faktúr odberateľom, ktoré by po tejto migrácii schválením neprešli
-- (bez reverse charge alebo bez USt-IdNr). Treba ich opraviť na karte
-- odberateľa a návrh uložiť znova.
select i.invoice_number, i.status, i.vat_regime, p.name as odberatel, p.ust_idnr
  from danubra_invoices i
  join danubra_partners p on p.id = i.partner_id
 where i.status in ('draft', 'pending_approval')
   and (coalesce(i.vat_regime, '') <> 'reverse_charge' or btrim(coalesce(p.ust_idnr, '')) = '');
