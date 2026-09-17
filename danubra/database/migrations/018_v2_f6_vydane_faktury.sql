-- ============================================================================
-- DANUBRA Hub v2 — F6 — Vydané faktúry a schvaľovací tok
-- ============================================================================
-- Tvrdé pravidlo zo zadania: **faktúra sa nikdy nevystaví ani neodošle bez
-- schválenia adminom.** Drží to trigger, nie obrazovka — a hlavne to platí
-- aj pre cron.
--
-- Cron beží pod service_role, ktorý nemá `auth.uid()`. Trigger preto žiada
-- pri schválení skutočného prihláseného človeka. Automat tak faktúru fyzicky
-- nemá ako schváliť, aj keby to niekto do cronu napísal.
--
-- Schválenie a odoslanie sú **dve samostatné rozhodnutia**. Schválená faktúra
-- sa neodošle sama.
--
--   podklad (uzavreté obdobie)
--         ↓
--     draft → pending_approval → approved → issued → sent → paid
--                    ↑                ↑
--              tu to STOJÍ      človek klikne
--
-- Idempotentné.
-- ============================================================================

-- ── Väzby na to, z čoho faktúra vznikla ─────────────────────────────────────
alter table danubra_invoices add column if not exists subcontract_id uuid
  references danubra_subcontracts;
alter table danubra_invoices add column if not exists period_id uuid
  references danubra_periods;
alter table danubra_invoices add column if not exists contract_id uuid
  references danubra_contracts;

-- ── Schvaľovanie ────────────────────────────────────────────────────────────
alter table danubra_invoices add column if not exists approved_by uuid
  references auth.users;
alter table danubra_invoices add column if not exists approved_at timestamptz;
alter table danubra_invoices add column if not exists sent_at timestamptz;

-- ── §48b zrážka ─────────────────────────────────────────────────────────────
alter table danubra_invoices add column if not exists withholding_pct numeric default 0;
alter table danubra_invoices add column if not exists withholding_amount numeric default 0;
alter table danubra_invoices add column if not exists amount_net numeric;

comment on column danubra_invoices.withholding_amount is
  'Zrážka §48b, ktorú odberateľ odvedie nemeckému finančnému úradu. Do '
  'SuperFaktúry ide plná suma — zrážka nie je zľava, je to daňová povinnosť '
  'odberateľa.';
comment on column danubra_invoices.amount_net is
  'Čo reálne príde na účet po zrážke §48b. Slúži na cash-flow, nie na doklad.';

-- ── SuperFaktúra ────────────────────────────────────────────────────────────
alter table danubra_invoices add column if not exists sf_invoice_id int;
alter table danubra_invoices add column if not exists sf_token text;
alter table danubra_invoices add column if not exists sf_synced_at timestamptz;
alter table danubra_invoices add column if not exists sf_environment text;
alter table danubra_invoices add column if not exists sf_error text;

comment on column danubra_invoices.sf_environment is
  'sandbox | production. Ukladá sa pri vystavení, aby sa spätne dalo '
  'povedať, či doklad vznikol na ostro.';
comment on column danubra_invoices.sf_error is
  'Posledná chyba zo SuperFaktúry, celá. Faktúra zostane v approved a dá sa '
  'skúsiť znova — nikdy sa nesmie stať, že doklad vznikol a appka o tom nevie.';

comment on column danubra_invoices.status is
  'draft | pending_approval | approved | issued | sent | paid | overdue | '
  'cancelled. Z pending_approval ďalej len rukou prihláseného človeka — '
  'nikdy automaticky.';

create index if not exists idx_dinv_status on danubra_invoices(status);
create index if not exists idx_dinv_period on danubra_invoices(period_id)
  where period_id is not null;
create unique index if not exists idx_dinv_sf
  on danubra_invoices(sf_invoice_id, sf_environment)
  where sf_invoice_id is not null;

-- ── Schvaľovací tok ─────────────────────────────────────────────────────────
-- Toto je jadro fázy.
create or replace function danubra_invoice_approval_flow()
returns trigger
language plpgsql
as $$
declare
  -- Ktoré prechody vôbec dávajú zmysel.
  allowed jsonb := '{
    "draft":            ["pending_approval", "cancelled"],
    "pending_approval": ["approved", "draft", "cancelled"],
    "approved":         ["issued", "pending_approval", "cancelled"],
    "issued":           ["sent", "paid", "overdue", "cancelled"],
    "sent":             ["paid", "overdue", "cancelled"],
    "overdue":          ["paid", "cancelled"],
    "paid":             [],
    "cancelled":        []
  }'::jsonb;
  is_v2 bool;
begin
  -- Vystavený doklad sa neprepisuje, nech je faktúra z v1 alebo z v2.
  if old.sf_invoice_id is not null
     and new.sf_invoice_id is distinct from old.sf_invoice_id then
    raise exception 'Faktúra už je vystavená v SuperFaktúre (id %). Druhé vystavenie sa odmieta.',
      old.sf_invoice_id using errcode = 'check_violation';
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Faktúry z v1 (ubytovanie, priebežná služba) majú vlastný tok so stavom
  -- `draft_pending_approval` a bežia v prevádzke. Nové pravidlá sa na ne
  -- nevzťahujú — inak by sa rozbilo to, čo funguje.
  is_v2 := new.partner_id is not null or new.period_id is not null
        or new.subcontract_id is not null;
  if not is_v2 then
    return new;
  end if;

  if not coalesce((allowed -> old.status) ? new.status, false) then
    raise exception 'Faktúru nemožno presunúť z „%" do „%".', old.status, new.status
      using errcode = 'check_violation';
  end if;

  -- Schválenie: musí ho spraviť prihlásený človek. Cron beží pod
  -- service_role bez auth.uid(), takže automat sem nedosiahne.
  if new.status = 'approved' then
    if auth.uid() is null then
      raise exception 'Faktúru môže schváliť len prihlásený človek. Automat schvaľovať nesmie.'
        using errcode = 'check_violation';
    end if;
    new.approved_by := coalesce(new.approved_by, auth.uid());
    new.approved_at := coalesce(new.approved_at, now());
  end if;

  -- Vystavenie: len zo schválenej, a len keď je zapísané kto a kedy schválil.
  if new.status = 'issued' then
    if old.status <> 'approved' then
      raise exception 'Vystaviť sa dá len schválená faktúra (teraz je „%").', old.status
        using errcode = 'check_violation';
    end if;
    if new.approved_by is null or new.approved_at is null then
      raise exception 'Faktúra nemá zapísané, kto a kedy ju schválil.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Odoslanie je samostatné rozhodnutie, nie pokračovanie vystavenia.
  if new.status = 'sent' then
    if old.status <> 'issued' then
      raise exception 'Odoslať sa dá len vystavená faktúra (teraz je „%").', old.status
        using errcode = 'check_violation';
    end if;
    new.sent_at := coalesce(new.sent_at, now());
  end if;

  if new.status = 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
  end if;

  -- Vrátenie na prepracovanie zmaže schválenie — inak by sa zmenená faktúra
  -- tvárila, že ju niekto schválil v tejto podobe.
  if new.status in ('draft', 'pending_approval')
     and old.status in ('approved', 'pending_approval') then
    new.approved_by := null;
    new.approved_at := null;
  end if;

  return new;
end $$;

drop trigger if exists danubra_invoice_flow_trg on danubra_invoices;
create trigger danubra_invoice_flow_trg before update on danubra_invoices
  for each row execute function danubra_invoice_approval_flow();

comment on function danubra_invoice_approval_flow() is
  'Schvaľovací tok faktúry v2. Schváliť môže len prihlásený človek (cron pod '
  'service_role nemá auth.uid()), vystaviť sa dá len schválená a odoslanie '
  'je samostatné rozhodnutie. Vystavenú faktúru nemožno vystaviť druhýkrát. '
  'Faktúry z v1 (bez partner_id a period_id) si ponechávajú pôvodný tok.';

-- ── Obdobie sa označí ako vyfakturované ─────────────────────────────────────
-- A tým sa uzamkne natrvalo: `danubra_reopen_period` vyfakturované obdobie
-- neotvorí.
create or replace function danubra_invoice_marks_period()
returns trigger
language plpgsql
as $$
begin
  if new.period_id is not null and new.status = 'issued'
     and (tg_op = 'INSERT' or old.status is distinct from 'issued') then
    update danubra_periods set status = 'invoiced', updated_at = now()
    where id = new.period_id and status = 'closed';
  end if;
  return new;
end $$;

drop trigger if exists danubra_invoice_period_trg on danubra_invoices;
create trigger danubra_invoice_period_trg after insert or update on danubra_invoices
  for each row execute function danubra_invoice_marks_period();

comment on function danubra_invoice_marks_period() is
  'Po vystavení faktúry sa jej obdobie označí ako vyfakturované a tým sa '
  'uzamkne natrvalo — otvoriť späť sa už nedá.';

-- ── Faktúra z uzavretého podkladu ───────────────────────────────────────────
-- Položky vznikajú z obdobia, nie ručným písaním. Ručne písaná faktúra je
-- miesto, kde sa strácajú peniaze.
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

  -- §48b: pri stavebných prácach bez Freistellungsbescheinigung zrazí
  -- odberateľ 15 % a odvedie ich nemeckému finančnému úradu.
  if sc.work_type = 'construction' and coalesce(sc.freistellung_verified, false) = false then
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
  'Vytvorí faktúru z uzavretého obdobia. Sumy pochádzajú z podkladu, nie '
  'z ručného písania. Dopočíta zrážku §48b pri stavebných prácach bez '
  'Freistellungsbescheinigung. Vzniká ako draft — schváliť ju musí človek.';

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Faktúra sa nemaže. Zlá faktúra sa stornuje, nie zahladí.
alter table danubra_invoices enable row level security;
drop policy if exists danubra_auth_all on danubra_invoices;
drop policy if exists danubra_inv_read on danubra_invoices;
drop policy if exists danubra_inv_insert on danubra_invoices;
drop policy if exists danubra_inv_update on danubra_invoices;
create policy danubra_inv_read on danubra_invoices
  for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');
create policy danubra_inv_insert on danubra_invoices
  for insert with check (auth.role() = 'authenticated' or auth.role() = 'service_role');
create policy danubra_inv_update on danubra_invoices
  for update using (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- ── Číselník stavov ─────────────────────────────────────────────────────────
insert into danubra_enums (kind, key, label_sk, label_de, hint, sort_order) values
('invoice_status','draft','Rozpracovaná','Entwurf',null,1),
('invoice_status','pending_approval','Čaká na schválenie','Zur Freigabe',
 'Ďalej sa dostane len rukou prihláseného človeka.',2),
('invoice_status','approved','Schválená','Freigegeben','Ešte nie je vystavená.',3),
('invoice_status','issued','Vystavená','Ausgestellt','Doklad existuje v SuperFaktúre.',4),
('invoice_status','sent','Odoslaná','Versendet',null,5),
('invoice_status','paid','Uhradená','Bezahlt',null,6),
('invoice_status','overdue','Po splatnosti','Überfällig',null,7),
('invoice_status','cancelled','Stornovaná','Storniert',null,8)
on conflict (kind, key) do update set
  label_sk = excluded.label_sk, label_de = excluded.label_de,
  hint = excluded.hint, sort_order = excluded.sort_order;

-- Diagnostika
select status, count(*) from danubra_invoices group by status;
