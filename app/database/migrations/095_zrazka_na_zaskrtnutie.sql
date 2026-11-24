-- ============================================================================
-- 095 — Zrážka §48b (Bauabzugsteuer) len na zaškrtnutie
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
