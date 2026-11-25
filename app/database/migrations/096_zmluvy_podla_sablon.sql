-- ============================================================================
-- DANUBRA — 096 — zmluvy, objednávky a fakturácia podľa firemných šablón
-- ============================================================================
-- Appka sa zladila so šablónami firmy na Google Drive (rámcová zmluva o dielo
-- so živnostníkom, objednávka „č. N", Rahmenvertrag + Bestellung SK_DE, vzor
-- faktúry V1.3, „Stavby", ukončenie zmluvy). Táto migrácia pridáva to, čo
-- k tomu potrebuje databáza:
--
--   1. Nastavenia: stĺpce `subcontract` a `framework_de`. Obrazovka Nastavenia
--      do nich už zapisuje (oddiely „Zmluva so živnostníkom" a „Zmluva
--      s nemeckým odberateľom"), ale žiadna migrácia ich nezaložila — uloženie
--      by spadlo. Staré predvolené sumy, ak by v nich boli uložené, sa prepíšu
--      na hodnoty zo šablón (300 € / 3 000 € / 7 dní); iné, ručne zmenené
--      hodnoty ostávajú.
--   2. Odberateľ: údaje do záhlavia Rahmenvertrag a Bestellung (štatutárny
--      orgán, zastúpený, zápis v registri, Steuernummer, e-mail na faktúry)
--      a dĺžka fakturačného obdobia (predvolene 7 dní = týždeň, KW; možnosť
--      14 dní alebo mesiac). Nový odberateľ má splatnosť 7 dní (Rahmenvertrag
--      čl. III bod 2); existujúcim sa splatnosť nemení.
--   3. Objednávky: poradové číslo „č. N" **v rade živnostníka** (objednávka
--      živnostníkovi) a „Nr. N" **v rade odberateľa** (Bestellung) — prideľuje
--      ho databáza pri založení, existujúcim sa doplní podľa dátumu založenia.
--      Ďalej činnosť zo Zoznamu činností, miesta výkonu, počet pracovníkov,
--      rozsah hodín za týždeň na osobu a nemecké znenia pre Bestellung.
--   4. Živnostník: zápis v živnostenskom registri (na faktúru, V1.3 bod 4),
--      SWIFT/BIC jeho banky a činnosť zo Zoznamu činností.
--   5. Faktúra za živnostníka za 2 kalendárne týždne: obdobia odberateľa sú
--      teraz týždenné (KW), živnostník fakturuje za 2 KW. Faktúra za
--      živnostníka preto smie pokryť viac uzavretých období (`period_ids`);
--      kontrola voči hodinám (danubra_bill_check) ráta hodiny zo všetkých.
--      Nová funkcia danubra_self_bill_draft_kw; pôvodná (jedno obdobie)
--      ostáva bez zmeny.
--
-- Existujúce dáta sa nemažú ani neprepisujú (okrem bodu 1 a doplnenia
-- poradových čísel objednávok). Idempotentné.
--
-- POZOR: kód appky, ktorý ide s touto migráciou, zapisuje nové stĺpce
-- odberateľa, objednávky a živnostníka. Migráciu treba spustiť pred nasadením
-- (appka pri chýbajúcom stĺpci uloží aspoň pôvodné údaje a ohlási to).
-- ============================================================================

-- ── 1. Nastavenia ───────────────────────────────────────────────────────────
alter table danubra_settings add column if not exists subcontract jsonb default '{}'::jsonb;
alter table danubra_settings add column if not exists framework_de jsonb default '{}'::jsonb;

comment on column danubra_settings.subcontract is
  'Rámcová zmluva o dielo so živnostníkom: sumy a lehoty (pokuty, splatnosť…), '
  'zoznam činností do objednávky (cinnosti) a adresa v SR do zoznamu Stavby (miesto_sk).';
comment on column danubra_settings.framework_de is
  'Rahmenvertrag s nemeckým odberateľom: lehoty a sumy (fakturácia 7 dní, splatnosť 7 dní…).';

-- Staré predvolené hodnoty appky (250 € / 2 500 € / 14 dní) na hodnoty zo
-- šablón na Drive. Len keď je uložená presne stará predvolená hodnota.
update danubra_settings
   set subcontract = subcontract || '{"pokuta_omeskanie_den": 300}'::jsonb
 where (subcontract->>'pokuta_omeskanie_den')::numeric = 250;
update danubra_settings
   set subcontract = subcontract || '{"pokuta_nenastupenie": 3000}'::jsonb
 where (subcontract->>'pokuta_nenastupenie')::numeric = 2500;
update danubra_settings
   set framework_de = framework_de || '{"fakturacia_dni": 7}'::jsonb
 where (framework_de->>'fakturacia_dni')::numeric = 14;

-- ── 2. Odberateľ ────────────────────────────────────────────────────────────
alter table danubra_partners add column if not exists register text;
alter table danubra_partners add column if not exists tax_number text;
alter table danubra_partners add column if not exists statutory_body text;
alter table danubra_partners add column if not exists representative text;
alter table danubra_partners add column if not exists invoice_email text;
alter table danubra_partners add column if not exists billing_period_days int not null default 7;

do $$
begin
  alter table danubra_partners add constraint danubra_partner_period_chk
    check (billing_period_days between 1 and 31);
exception when duplicate_object then null;
end $$;

-- Rahmenvertrag čl. III bod 2: splatnosť 7 kalendárnych dní od vystavenia.
alter table danubra_partners alter column payment_terms_days set default 7;

comment on column danubra_partners.billing_period_days is
  'Dĺžka fakturačného obdobia: 7 = týždenne po KW (predvolené, Rahmenvertrag 7/7), '
  '14 = dva týždne (14/14), 28 až 31 = kalendárny mesiac.';
comment on column danubra_partners.statutory_body is
  'Štatutárny orgán / Statutarisches Organ — do záhlavia Rahmenvertrag a Bestellung.';
comment on column danubra_partners.representative is
  'Zastúpený / Vertreten durch. Prázdne = štatutárny orgán.';
comment on column danubra_partners.invoice_email is
  'E-mail na faktúry odberateľa (Faktúry / Rechnungen).';
comment on column danubra_partners.tax_number is 'Nemecké daňové číslo odberateľa (Steuernummer).';
comment on column danubra_partners.register is 'Zápis v registri / Eintragung im Register (Handelsregister).';

-- ── 3. Objednávky ───────────────────────────────────────────────────────────
alter table danubra_work_orders add column if not exists seq_no int;
alter table danubra_work_orders add column if not exists activity text;
alter table danubra_work_orders add column if not exists places text[];
alter table danubra_work_orders add column if not exists places_de text[];
alter table danubra_work_orders add column if not exists headcount int;
alter table danubra_work_orders add column if not exists hours_week_min numeric(6,1);
alter table danubra_work_orders add column if not exists hours_week_max numeric(6,1);
alter table danubra_work_orders add column if not exists scope_de text;
alter table danubra_work_orders add column if not exists notes_de text;

comment on column danubra_work_orders.seq_no is
  'Poradové číslo objednávky v rade živnostníka (Objednávka č. N) alebo odberateľa '
  '(Bestellung Nr. N). Prideľuje danubra_work_order_seq() pri založení.';
comment on column danubra_work_orders.activity is
  'Činnosť zo Zoznamu činností do Objednávky (presný text voľnej živnosti). '
  'Ten istý text píše živnostník na faktúru.';
comment on column danubra_work_orders.places is
  'Miesta výkonu: adresy stavieb, adresa v SR, „celé územie Nemeckej / Slovenskej republiky".';

-- Doplnenie existujúcim: poradie podľa dátumu založenia, v rade živnostníka
-- (kind = worker) alebo odberateľa (kind = customer). Kde už číslo je, nemení sa.
with x as (
  select w.id,
         coalesce(m.mx, 0) + row_number() over (
           partition by w.kind, coalesce(w.worker_id, w.partner_id)
           order by w.created_at, w.id) as n
    from danubra_work_orders w
    left join lateral (
      select max(o.seq_no) as mx from danubra_work_orders o
       where o.kind = w.kind and o.seq_no is not null
         and coalesce(o.worker_id, o.partner_id) = coalesce(w.worker_id, w.partner_id)
    ) m on true
   where w.seq_no is null
)
update danubra_work_orders w set seq_no = x.n from x where w.id = x.id;

create or replace function danubra_work_order_seq()
returns trigger
language plpgsql
as $$
declare
  v_owner uuid := case when new.kind = 'worker' then new.worker_id else new.partner_id end;
begin
  if new.seq_no is not null or v_owner is null then
    return new;
  end if;
  -- Dve objednávky tomu istému človeku naraz nesmú dostať to isté číslo.
  perform pg_advisory_xact_lock(hashtext('danubra_work_order_seq:' || new.kind || ':' || v_owner::text));
  select coalesce(max(seq_no), 0) + 1 into new.seq_no
    from danubra_work_orders
   where kind = new.kind
     and (case when new.kind = 'worker' then worker_id else partner_id end) = v_owner;
  return new;
end $$;

drop trigger if exists danubra_work_order_seq_trg on danubra_work_orders;
create trigger danubra_work_order_seq_trg before insert on danubra_work_orders
  for each row execute function danubra_work_order_seq();

comment on function danubra_work_order_seq() is
  'Objednávka č. N: poradie v rade živnostníka (kind = worker) alebo odberateľa '
  '(kind = customer). Ako v šablónach na Drive — nie globálne číslo.';

create unique index if not exists danubra_work_order_seq_worker_uniq
  on danubra_work_orders (worker_id, seq_no) where kind = 'worker' and seq_no is not null;
create unique index if not exists danubra_work_order_seq_partner_uniq
  on danubra_work_orders (partner_id, seq_no) where kind = 'customer' and seq_no is not null;

-- ── 4. Živnostník ───────────────────────────────────────────────────────────
alter table danubra_workers add column if not exists trade_register text;
alter table danubra_workers add column if not exists bank_bic text;
alter table danubra_workers add column if not exists activity text;

comment on column danubra_workers.trade_register is
  'Zápis v živnostenskom registri: okresný úrad a číslo ŽR (napr. „Okresný úrad '
  'Komárno, č. ŽR 410-12345"). Povinný údaj na jeho faktúre (vzor V1.3, bod 4).';
comment on column danubra_workers.bank_bic is 'SWIFT (BIC) jeho banky — na faktúru (vzor V1.3, bod 6).';
comment on column danubra_workers.activity is
  'Činnosť zo Zoznamu činností do Objednávky, ktorú má v živnostenskom oprávnení.';

-- ── 5. Faktúra za živnostníka za 2 kalendárne týždne ───────────────────────
alter table danubra_bills add column if not exists period_ids uuid[];

comment on column danubra_bills.period_ids is
  'Všetky obdobia, ktoré faktúra pokrýva (živnostník fakturuje za 2 KW, odberateľ '
  'týždenne). period_id je posledné z nich. Prázdne = len period_id.';

-- Kontrola voči hodinám: rovnaké pravidlá ako v 019, len hodiny sa berú zo
-- všetkých období faktúry (period_id aj period_ids).
create or replace function danubra_bill_check()
returns trigger
language plpgsql
as $$
declare
  v_expected numeric := null;
  v_hours numeric := null;
  v_periods uuid[];
begin
  -- Očakávaná suma sa dá dopočítať len vtedy, keď vieme, za ktoré obdobie
  -- a ktorého človeka faktúra je.
  if new.period_id is not null and new.worker_id is not null then
    v_periods := array(select distinct x from unnest(array[new.period_id] || coalesce(new.period_ids, '{}'::uuid[])) x
                        where x is not null);
    select
      coalesce(sum(t.hours), 0),
      coalesce(sum(t.hours * coalesce(t.rate_used, a.worker_rate,
        (select hourly_cost from danubra_workers where id = new.worker_id), 0)), 0)
    into v_hours, v_expected
    from danubra_timesheets t
    join danubra_assignments a on a.id = t.assignment_id
    where t.period_id = any (v_periods)
      and t.worker_id = new.worker_id
      and coalesce(t.approved, false) = true;
  end if;

  new.expected_hours := v_hours;
  new.expected_amount := v_expected;
  new.variance := case when v_expected is null then null
                       else round(coalesce(new.amount, 0) - v_expected, 2) end;

  -- Nenulový rozdiel = spor. Stav sa nastaví sám, nech sa to nedá prehliadnuť.
  -- Tolerancia jeden cent kryje zaokrúhľovanie, nie „skoro sedí".
  if new.variance is not null and abs(new.variance) > 0.01
     and new.status in ('received', 'checked') then
    new.status := 'disputed';
  end if;

  -- Sporná faktúra sa nedá schváliť bez poznámky. Bez toho by sa rozdiel
  -- odklikol a o pol roka by nikto nevedel, prečo.
  if new.status = 'approved' and new.variance is not null and abs(new.variance) > 0.01 then
    if length(btrim(coalesce(new.note, ''))) < 5 then
      raise exception
        'Faktúra sa líši od schválených hodín o %. Schváliť sa dá len s poznámkou, ktorá vysvetlí prečo.',
        new.variance using errcode = 'check_violation';
    end if;
  end if;

  if new.status = 'approved' then
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_by := coalesce(new.approved_by, auth.uid());
  end if;
  if new.status = 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
  end if;

  return new;
end $$;

comment on function danubra_bill_check() is
  'Dopočíta očakávanú sumu zo schválených hodín (všetkých období faktúry: period_id '
  'aj period_ids) a rozdiel. Faktúru s rozdielom preklopí do sporu a nepustí ju '
  'schváliť bez poznámky. V databáze, nie v UI — faktúry môžu prísť aj importom.';

-- Jedno obdobie = najviac jedna živá faktúra za živnostníka, aj keď ho
-- pokrýva faktúra za 2 KW (unikátny index z 052 stráži len period_id).
-- Platí pre obe cesty: danubra_self_bill_draft (jedno obdobie) aj _kw.
create or replace function danubra_self_bill_overlap_guard()
returns trigger
language plpgsql
as $$
declare
  v_mine uuid[];
begin
  if new.source is distinct from 'self_billing' or new.status = 'discarded'
     or new.worker_id is null or new.period_id is null then
    return new;
  end if;
  v_mine := array[new.period_id] || coalesce(new.period_ids, '{}'::uuid[]);
  if exists (
    select 1 from danubra_bills b
     where b.id <> new.id and b.worker_id = new.worker_id
       and b.source = 'self_billing' and b.status <> 'discarded'
       and (array[b.period_id] || coalesce(b.period_ids, '{}'::uuid[])) && v_mine
  ) then
    raise exception 'Za toto obdobie už faktúra za živnostníka existuje (aj ako súčasť faktúry za 2 týždne).'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists danubra_self_bill_overlap_trg on danubra_bills;
create trigger danubra_self_bill_overlap_trg before insert or update of period_id, period_ids, status
  on danubra_bills for each row execute function danubra_self_bill_overlap_guard();

-- Návrh faktúry za živnostníka za viac uzavretých období (2 KW). Pravidlá ako
-- danubra_self_bill_draft (052): dohoda o vyhotovení faktúry, nie platiteľ DPH,
-- len uzavreté obdobia, len schválené hodiny. Navyše: všetky obdobia sú
-- z jednej zákazky (dve stavby = dve faktúry, vzor V1.3 bod 9) a žiadne
-- z nich už nemá živú faktúru za tohto živnostníka.
create or replace function danubra_self_bill_draft_kw(p_periods uuid[], p_worker uuid)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_id uuid;
  w record;
  v_last record;
  v_subs int;
  v_open int;
  v_lines jsonb;
begin
  if p_periods is null or cardinality(p_periods) = 0 then
    raise exception 'Vyberte aspoň jedno obdobie.' using errcode = 'check_violation';
  end if;

  select * into w from danubra_workers where id = p_worker;
  if w.id is null then raise exception 'Živnostník neexistuje.'; end if;
  if not coalesce(w.self_billing, false) then
    raise exception 'S živnostníkom % nemáme dohodu, že faktúry vystavujeme za neho. Zapne sa na jeho karte.', w.full_name
      using errcode = 'check_violation';
  end if;
  if coalesce(w.vat_payer, false) then
    raise exception '% je platiteľ DPH — faktúru nech vystaví sám (od 1. 1. 2027 ako e-faktúru).', w.full_name
      using errcode = 'check_violation';
  end if;

  select count(distinct subcontract_id), count(*) filter (where status = 'open')
    into v_subs, v_open
    from danubra_periods where id = any (p_periods);
  if v_subs <> 1 then
    raise exception 'Obdobia musia byť z jednej zákazky — dve stavby sú dve faktúry.' using errcode = 'check_violation';
  end if;
  if v_open > 0 or (select count(*) from danubra_periods where id = any (p_periods)) <> cardinality(p_periods) then
    raise exception 'Faktúra sa robí z uzavretých období.' using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from danubra_bills b
     where b.worker_id = p_worker and b.source = 'self_billing' and b.status <> 'discarded'
       and (b.period_id = any (p_periods) or coalesce(b.period_ids, '{}'::uuid[]) && p_periods)
  ) then
    raise exception '% už má za niektoré z týchto období faktúru.', w.full_name using errcode = 'check_violation';
  end if;

  select * into v_last from danubra_periods where id = any (p_periods)
   order by period_to desc limit 1;

  select coalesce(jsonb_agg(x order by x->>'from'), '[]'::jsonb) into v_lines from (
    select jsonb_build_object(
      'description', coalesce(s.title, 'Práce'),
      'activity', t.activity_type,
      'hours', sum(t.hours),
      'rate', coalesce(t.rate_used, a.worker_rate, w.hourly_cost, 0),
      'total', round(sum(t.hours * coalesce(t.rate_used, a.worker_rate, w.hourly_cost, 0)), 2),
      'from', min(t.work_date), 'to', max(t.work_date)) as x
    from danubra_timesheets t
    join danubra_assignments a on a.id = t.assignment_id
    left join danubra_subcontracts s on s.id = a.subcontract_id
    where t.period_id = any (p_periods) and t.worker_id = p_worker and coalesce(t.approved, false)
    group by s.title, t.activity_type, coalesce(t.rate_used, a.worker_rate, w.hourly_cost, 0)
  ) q;

  if jsonb_array_length(v_lines) = 0 then
    raise exception '% nemá v týchto obdobiach schválené hodiny.', w.full_name using errcode = 'check_violation';
  end if;

  insert into danubra_bills (worker_id, period_id, period_ids, subcontract_id, status, source, amount,
    vat_amount, currency, delivery_date, lines, category, created_by)
  values (p_worker, v_last.id, p_periods, v_last.subcontract_id, 'self_draft', 'self_billing', 0,
    0, 'EUR', v_last.period_to, v_lines, 'work', auth.uid())
  returning id into v_id;

  -- Suma = to, čo spočíta kontrola voči hodinám (danubra_bill_check), takže
  -- rozdiel je vždy nula.
  update danubra_bills set amount = coalesce(expected_amount, 0),
    base_amount = coalesce(expected_amount, 0)
  where id = v_id;
  return v_id;
end $$;

comment on function danubra_self_bill_draft_kw(uuid[], uuid) is
  'Návrh faktúry za živnostníka za viac uzavretých období jednej zákazky (2 KW). '
  'Vystavuje ju admin cez danubra_self_bill_issue, ako pri jednom období.';

revoke execute on function danubra_self_bill_draft_kw(uuid[], uuid) from public, anon;
grant execute on function danubra_self_bill_draft_kw(uuid[], uuid) to authenticated, service_role;
