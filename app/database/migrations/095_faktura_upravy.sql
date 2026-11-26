-- ============================================================================
-- 095 — Faktúra: zrážka §48b na zaškrtnutie, vlastný VS a ďalšie údaje
-- ============================================================================
-- 1) Zrážka §48b len na zaškrtnutie (faktúra z obdobia bez nej).
-- 2) Majiteľ: „musím vedieť editovať všetko aj číslo faktúry a VS". Návrh
--    faktúry má vlastný variabilný a konštantný symbol, číslo objednávky,
--    spôsob úhrady a text na faktúru. Číslo faktúry sa v návrhu mení priamo
--    (unikátny index nedovolí dve rovnaké).
-- 3) Po schválení sa tieto údaje nemenia (ako suma a dátumy) — inak by
--    schválenie nič neznamenalo.
-- 4) Párovanie platieb berie VS z faktúry; prázdny = číslice z čísla.
-- ============================================================================

-- Majiteľ: „stavebnú zrážkovú daň neuplatňujeme alebo nech je to na
-- zaškrtnutie a nie defaultne". Faktúra z obdobia preto vzniká bez zrážky;
-- zapína sa v návrhu faktúry (Upraviť → Zrážka §48b). Percento ostáva
-- v Nastaveniach (staffing.withholding_pct, predvolene 15).
--
-- Telo je rovnaké ako v 070, len bez automatického výpočtu zrážky.
-- Existujúce faktúry sa nemenia.
-- ============================================================================

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
  v_amount numeric;
  v_terms int;
  v_today date := (now() at time zone 'Europe/Bratislava')::date;
begin
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

  v_amount := round(coalesce(per.amount_charged, 0), 2);
  v_terms := coalesce(pt.payment_terms_days, 30);
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
    0, 0, v_amount
  ) returning * into inv;

  return inv;
end $$;

comment on function danubra_invoice_from_period(uuid) is
  'Vytvorí návrh faktúry z uzavretého obdobia. Obdobie zamkne (dve volania naraz '
  'nevytvoria dve faktúry), sumu zaokrúhli na centy, dátum vystavenia je slovenský '
  'deň. Zrážka §48b sa neráta — zapína sa zaškrtnutím v návrhu faktúry.';

-- ── 2) Údaje faktúry ─────────────────────────────────────────────────────────
alter table danubra_invoices add column if not exists variable_symbol text;
alter table danubra_invoices add column if not exists constant_symbol text;
alter table danubra_invoices add column if not exists order_reference text;
alter table danubra_invoices add column if not exists payment_method text default 'transfer';
alter table danubra_invoices add column if not exists note text;

do $x$
begin
  if not exists (select 1 from pg_constraint where conname = 'danubra_invoices_vs_chk') then
    alter table danubra_invoices add constraint danubra_invoices_vs_chk
      check (variable_symbol is null or variable_symbol ~ '^[0-9]{1,10}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'danubra_invoices_ks_chk') then
    alter table danubra_invoices add constraint danubra_invoices_ks_chk
      check (constant_symbol is null or constant_symbol ~ '^[0-9]{1,4}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'danubra_invoices_pay_chk') then
    alter table danubra_invoices add constraint danubra_invoices_pay_chk
      check (payment_method is null or payment_method in ('transfer', 'cash', 'card', 'cod', 'offset'));
  end if;
end $x$;

comment on column danubra_invoices.variable_symbol is
  'Variabilný symbol (najviac 10 číslic). Prázdny = číslice z čísla faktúry.';
comment on column danubra_invoices.note is 'Text na faktúru (vidí ho odberateľ).';

-- ── 3) Schválená faktúra sa nemení ──────────────────────────────────────────
create or replace function danubra_invoice_locked_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('postgres', 'supabase_admin') then return new; end if;
  if old.status in ('approved', 'issued', 'sent', 'paid', 'overdue')
     and (new.total is distinct from old.total
       or new.amount_net is distinct from old.amount_net
       or new.withholding_amount is distinct from old.withholding_amount
       or new.withholding_pct is distinct from old.withholding_pct
       or new.partner_id is distinct from old.partner_id
       or new.issue_date is distinct from old.issue_date
       or new.delivery_date is distinct from old.delivery_date
       or new.invoice_number is distinct from old.invoice_number
       or new.variable_symbol is distinct from old.variable_symbol
       or new.constant_symbol is distinct from old.constant_symbol
       or new.order_reference is distinct from old.order_reference
       or new.payment_method is distinct from old.payment_method
       or new.note is distinct from old.note) then
    raise exception 'Schválená faktúra sa nemení (je „%"). Vráťte ju do návrhu, alebo ju opravte dobropisom.', old.status
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- ── 4) Párovanie platieb: VS z faktúry ──────────────────────────────────────
create or replace function danubra_bank_automatch(p_batch text default null)
returns integer
language plpgsql
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
    if tx.amount > 0 and tx.variable_symbol is not null then
      select i.id into v_id
      from danubra_invoices i
      where coalesce(nullif(i.variable_symbol, ''), regexp_replace(coalesce(i.invoice_number, ''), '\D', '', 'g'))
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
