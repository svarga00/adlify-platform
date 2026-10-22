-- ============================================================================
-- DANUBRA — Freistellung §48b je firemná: s platnou sa zrážka neuplatňuje
-- ============================================================================
-- „Máme Freistellung, neuplatňuje sa voči nám zrážková stavebná daň."
--
-- Návrh faktúry z obdobia doteraz rátal zrážku 15 % pri každej stavebnej
-- zákazke, na ktorej nebolo zaškrtnuté „freistellung_verified". Freistellungs-
-- bescheinigung ale nevydáva finančný úrad na zákazku — vydáva ju firme.
-- Zdroj pravdy je register compliance (kind = freistellung_48b, scope =
-- company): kým je platná (nie pending/expired, v rozsahu platnosti),
-- zrážka sa neuplatňuje na žiadnej zákazke.
--
-- Dáta sa nemenia. Idempotentné.
-- ============================================================================

create or replace function danubra_freistellung_ok(p_day date default current_date)
returns bool
language sql
stable
as $$
  select exists (
    select 1 from danubra_compliance
    where kind = 'freistellung_48b' and scope = 'company'
      and coalesce(status, 'active') not in ('pending', 'expired', 'not_required')
      and (valid_from is null or valid_from <= p_day)
      and (valid_to is null or valid_to >= p_day)
  );
$$;

comment on function danubra_freistellung_ok(date) is
  'Máme v daný deň platnú Freistellungsbescheinigung §48b (firemná položka '
  'v registri compliance)? S ňou sa zrážková stavebná daň neuplatňuje.';

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
begin
  select * into per from danubra_periods where id = p_period_id;
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

  v_amount := coalesce(per.amount_charged, 0);
  v_terms := coalesce(pt.payment_terms_days, 30);

  -- §48b: pri stavebných prácach zrazí odberateľ 15 % — ale len vtedy, keď
  -- nemáme platnú Freistellungsbescheinigung (firemná, v registri compliance).
  if sc.work_type = 'construction'
     and coalesce(sc.freistellung_verified, false) = false
     and not danubra_freistellung_ok(current_date) then
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
    'standard', current_date, current_date + v_terms, per.period_to,
    per.period_from, per.period_to,
    v_amount, 'EUR',
    case when coalesce(pt.reverse_charge, true) then 'reverse_charge' else 'standard' end,
    'draft',
    v_withholding_pct, v_wh, v_amount - v_wh
  ) returning * into inv;

  return inv;
end $$;

comment on function danubra_invoice_from_period(uuid) is
  'Vytvorí faktúru z uzavretého obdobia. Zrážku §48b ráta len pri stavebných '
  'prácach a len keď nemáme platnú Freistellungsbescheinigung (register '
  'compliance). Vzniká ako draft — schváliť ju musí človek.';
