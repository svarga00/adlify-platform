-- ============================================================================
-- DANUBRA — faktúry, ktoré vystavujeme za živnostníkov (samofakturácia)
-- ============================================================================
-- „V niektorých prípadoch potrebujeme vystavovať faktúry aj za živnostníkov
-- nám." Zákon to dovoľuje, keď je so živnostníkom písomná dohoda
-- (vyhotovenie faktúry odberateľom) — tá je v rámcovej zmluve o dielo,
-- článok V., keď má živnostník zapnuté `self_billing`.
--
--   uzavreté obdobie + schválené hodiny
--        ↓  danubra_self_bill_draft()          — ktokoľvek
--   self_draft    návrh, suma = schválené hodiny × sadzba
--        ↓  danubra_self_bill_issue()          — LEN ADMIN (tvrdé pravidlo)
--   self_sent     číslo z radu živnostníka, odkaz na potvrdenie
--        ↓  živnostník cez odkaz (danubra-self-bill)
--   approved      potvrdil → pripravená na platbu
--   disputed      namietol → treba doriešiť
--
-- Údaje živnostníka aj našej firmy sa pri vystavení zapíšu k faktúre
-- (extracted._self) — vystavený doklad sa nesmie zmeniť tým, že niekto
-- neskôr opraví adresu na karte.
--
-- Platiteľ DPH sa takto nefakturuje: od 1. 1. 2027 by to musela byť
-- e-faktúra. Dáta sa nemenia. Idempotentné.
-- ============================================================================

-- ── Dohoda so živnostníkom ──────────────────────────────────────────────────
alter table danubra_workers add column if not exists self_billing bool not null default false;
alter table danubra_workers add column if not exists self_billing_since date;
alter table danubra_workers add column if not exists self_billing_prefix text;
alter table danubra_workers add column if not exists self_billing_seq int not null default 0;

comment on column danubra_workers.self_billing is
  'Faktúry za neho vystavujeme my (vyhotovenie faktúry odberateľom). Platí '
  'len s podpísanou rámcovou zmluvou, v ktorej je táto dohoda (článok V.).';
comment on column danubra_workers.self_billing_seq is
  'Posledné použité poradové číslo v jeho číselnom rade. Zvyšuje ho len '
  'danubra_self_bill_issue().';

-- ── Faktúra za živnostníka ──────────────────────────────────────────────────
alter table danubra_bills add column if not exists lines jsonb;
alter table danubra_bills add column if not exists confirm_token text;
alter table danubra_bills add column if not exists sent_to_worker_at timestamptz;
alter table danubra_bills add column if not exists worker_confirmed_at timestamptz;
alter table danubra_bills add column if not exists worker_note text;

create unique index if not exists idx_dbill_token on danubra_bills(confirm_token)
  where confirm_token is not null;
-- Za jedno obdobie jedna faktúra za živnostníka (zahodená sa nepočíta).
create unique index if not exists idx_dbill_self_one on danubra_bills(worker_id, period_id)
  where source = 'self_billing' and status <> 'discarded';

insert into danubra_enums (kind, key, label_sk, label_de, hint, sort_order) values
('bill_status','self_draft','Návrh za živnostníka','Gutschrift-Entwurf',
 'Faktúru za živnostníka pripravila appka zo schválených hodín. Vystaví ju admin.',1),
('bill_status','self_sent','Čaká na potvrdenie živnostníka','Wartet auf Bestätigung',
 'Vystavená v mene živnostníka, poslaná mu na potvrdenie.',2)
on conflict (kind, key) do update set
  label_sk = excluded.label_sk, label_de = excluded.label_de,
  hint = excluded.hint, sort_order = excluded.sort_order;

-- ── Návrh zo schválených hodín ──────────────────────────────────────────────
create or replace function danubra_self_bill_draft(p_period uuid, p_worker uuid)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_id uuid;
  w record;
  per record;
  v_lines jsonb;
begin
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

  select * into per from danubra_periods where id = p_period;
  if per.id is null or per.status = 'open' then
    raise exception 'Faktúra sa robí z uzavretého obdobia.' using errcode = 'check_violation';
  end if;

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
    where t.period_id = p_period and t.worker_id = p_worker and coalesce(t.approved, false)
    group by s.title, t.activity_type, coalesce(t.rate_used, a.worker_rate, w.hourly_cost, 0)
  ) q;

  if jsonb_array_length(v_lines) = 0 then
    raise exception '% nemá v tomto období schválené hodiny.', w.full_name using errcode = 'check_violation';
  end if;

  insert into danubra_bills (worker_id, period_id, subcontract_id, status, source, amount,
    vat_amount, currency, delivery_date, lines, category, created_by)
  values (p_worker, p_period, per.subcontract_id, 'self_draft', 'self_billing', 0,
    0, 'EUR', per.period_to, v_lines, 'work', auth.uid())
  returning id into v_id;

  -- Suma = to, čo spočíta kontrola voči hodinám (danubra_bill_check), takže
  -- rozdiel je vždy nula.
  update danubra_bills set amount = coalesce(expected_amount, 0),
    base_amount = coalesce(expected_amount, 0)
  where id = v_id;
  return v_id;
end $$;

-- ── Vystavenie: len admin ───────────────────────────────────────────────────
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

  select * into w from danubra_workers where id = b.worker_id;
  if not coalesce(w.self_billing, false) then
    raise exception 'Dohoda o vystavovaní faktúr za živnostníka už neplatí.' using errcode = 'check_violation';
  end if;

  update danubra_workers set self_billing_seq = coalesce(self_billing_seq, 0) + 1
  where id = w.id returning self_billing_seq into v_seq;
  v_num := coalesce(nullif(btrim(w.self_billing_prefix), ''), 'OV') || '-'
    || to_char(current_date, 'YYYY') || '-' || lpad(v_seq::text, 3, '0');

  select supplier into v_company from danubra_settings order by created_at limit 1;

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

-- ── Stráž ───────────────────────────────────────────────────────────────────
-- Návrh za živnostníka sa vystaví len cez danubra_self_bill_issue (admin).
-- Vystavená faktúra sa už neprepisuje — suma, číslo ani položky.
create or replace function danubra_self_bill_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('postgres', 'supabase_admin') then return new; end if;
  if tg_op = 'INSERT' then
    if new.source = 'self_billing' and new.status <> 'self_draft' then
      raise exception 'Faktúra za živnostníka vzniká len ako návrh.' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if (old.source = 'self_billing') is distinct from (new.source = 'self_billing') then
    raise exception 'Druh faktúry (za živnostníka) sa meniť nedá.' using errcode = 'check_violation';
  end if;
  if old.source = 'self_billing' then
    if old.status = 'self_draft' and new.status not in ('self_draft', 'discarded')
       and coalesce(current_setting('danubra.self_issue', true), '') <> '1' then
      raise exception 'Faktúru za živnostníka vystaví len administrátor (Schváliť a vystaviť).'
        using errcode = 'check_violation';
    end if;
    if old.status <> 'self_draft' and (new.amount is distinct from old.amount
        or new.bill_number is distinct from old.bill_number or new.lines is distinct from old.lines) then
      raise exception 'Vystavená faktúra za živnostníka sa nemení. Zahoďte ju a pripravte novú.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists danubra_self_bill_guard on danubra_bills;
create trigger danubra_self_bill_guard before insert or update on danubra_bills
  for each row execute function danubra_self_bill_guard();
