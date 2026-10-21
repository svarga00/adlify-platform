-- ============================================================================
-- DANUBRA — prijaté faktúry z PDF (a od kohokoľvek, nielen od živnostníka)
-- ============================================================================
-- „Chcem to vedieť nahrávať cez PDF, kde vyextrahuješ, čo treba."
--
-- Doteraz sa prijatá faktúra dala len ručne prepísať a len od živnostníka.
-- Odteraz:
--
--   nahrám PDF / fotku / e-faktúru (XML)
--        ↓
--   review   — appka prečíta dodávateľa, sumy, dátumy, IBAN, VS
--        ↓      (extract_status pending → done | error)
--   človek skontroluje a potvrdí
--        ↓
--   received → checked → approved → paid   (ako doteraz)
--
-- Faktúra môže byť od živnostníka (worker_id) alebo od hocikoho iného
-- (supplier_*: ubytovanie, nafta, náradie…). Zahodená sa nemaže — dostane
-- stav `discarded` (doklad sa fyzicky nemaže).
--
-- Dáta sa nemenia. Idempotentné.
-- ============================================================================

-- ── Dodávateľ, ktorý nie je živnostník ──────────────────────────────────────
alter table danubra_bills alter column worker_id drop not null;

alter table danubra_bills add column if not exists supplier_name text;
alter table danubra_bills add column if not exists supplier_ico text;
alter table danubra_bills add column if not exists supplier_dic text;
alter table danubra_bills add column if not exists supplier_ic_dph text;
alter table danubra_bills add column if not exists supplier_iban text;
alter table danubra_bills add column if not exists variable_symbol text;
alter table danubra_bills add column if not exists category text;
alter table danubra_bills add column if not exists base_amount numeric;

comment on column danubra_bills.amount is
  'Suma na úhradu (s DPH). Základ je base_amount, DPH vat_amount.';
comment on column danubra_bills.category is
  'Pri faktúre, ktorá nie je od živnostníka: kľúč z číselníka cost_category.';

-- ── Odkiaľ faktúra prišla a čo z nej appka prečítala ────────────────────────
alter table danubra_bills add column if not exists source text not null default 'manual';
alter table danubra_bills add column if not exists extract_status text;
alter table danubra_bills add column if not exists extract_error text;
alter table danubra_bills add column if not exists extracted jsonb;
alter table danubra_bills add column if not exists extracted_at timestamptz;
alter table danubra_bills add column if not exists confirmed_at timestamptz;
alter table danubra_bills add column if not exists confirmed_by uuid references auth.users;

comment on column danubra_bills.source is
  'manual | pdf | image | xml (e-faktúra) | self_billing (vystavili sme ju za živnostníka).';
comment on column danubra_bills.extract_status is
  'Čítanie nahraného súboru: pending | done | error. NULL pri ručnom zadaní.';
comment on column danubra_bills.extracted is
  'Čo appka zo súboru prečítala, celé a nezmenené — aby sa dalo spätne '
  'porovnať s tým, čo človek potvrdil.';

do $$ begin
  alter table danubra_bills add constraint danubra_bills_source_chk
    check (source in ('manual', 'pdf', 'image', 'xml', 'self_billing'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table danubra_bills add constraint danubra_bills_extract_chk
    check (extract_status is null or extract_status in ('pending', 'done', 'error'));
exception when duplicate_object then null; end $$;

-- Potvrdená faktúra musí vedieť, od koho je. Na kontrole ešte nemusí.
do $$ begin
  alter table danubra_bills add constraint danubra_bills_who_chk
    check (status in ('review', 'discarded') or worker_id is not null
           or nullif(btrim(coalesce(supplier_name, '')), '') is not null);
exception when duplicate_object then null; end $$;

create index if not exists idx_dbill_supplier on danubra_bills(supplier_ico, bill_number)
  where supplier_ico is not null;
create index if not exists idx_dbill_review on danubra_bills(status)
  where status = 'review';

-- ── Stavy ───────────────────────────────────────────────────────────────────
insert into danubra_enums (kind, key, label_sk, label_de, hint, sort_order) values
('bill_status','review','Na kontrolu','Zu prüfen',
 'Nahratá z PDF — appka ju prečítala, treba ju skontrolovať a potvrdiť.',0),
('bill_status','discarded','Zahodená','Verworfen',
 'Nahratá omylom alebo dvakrát. Nemaže sa, len sa nepočíta.',9)
on conflict (kind, key) do update set
  label_sk = excluded.label_sk, label_de = excluded.label_de,
  hint = excluded.hint, sort_order = excluded.sort_order;

insert into danubra_enums (kind, key, label_sk, label_de, hint, sort_order) values
('cost_category','work','Práca (subdodávka)','Fremdleistung',
 'Faktúra od firmy alebo živnostníka za prácu.',0),
('cost_category','fuel','Palivo','Kraftstoff',null,2)
on conflict (kind, key) do update set
  label_sk = excluded.label_sk, label_de = excluded.label_de,
  hint = excluded.hint, sort_order = excluded.sort_order;

-- ── E-faktúra (XML) do úložiska ─────────────────────────────────────────────
-- Od 1. 1. 2027 prídu tuzemské faktúry od platiteľov DPH ako XML (Peppol).
do $$
begin
  update storage.buckets
     set allowed_mime_types = array['application/pdf','image/jpeg','image/png',
           'image/heic','image/webp','image/tiff','application/xml','text/xml']
   where id = 'danubra-docs';
exception when insufficient_privilege then
  raise notice 'Bucket danubra-docs: povoľ ručne typy application/xml a text/xml.';
end $$;

-- ── Cash-flow: aj faktúry od dodávateľov, nielen od živnostníkov ────────────
create or replace view danubra_v_cashflow as
select
  'in'::text                      as direction,
  i.id                            as source_id,
  'invoice'::text                 as source,
  i.invoice_number                as label,
  p.name                          as counterparty,
  i.due_date                      as expected_on,
  coalesce(i.amount_net, i.total) as amount,
  i.status                        as status,
  (i.due_date < current_date)     as overdue
from danubra_invoices i
left join danubra_partners p on p.id = i.partner_id
where i.status in ('issued', 'sent', 'overdue')

union all

select
  'out', bl.id, 'bill', bl.bill_number, coalesce(w.full_name, bl.supplier_name),
  coalesce(bl.due_date, bl.issue_date + 14),
  -bl.amount, bl.status,
  (coalesce(bl.due_date, bl.issue_date + 14) < current_date)
from danubra_bills bl
left join danubra_workers w on w.id = bl.worker_id
where bl.status in ('received', 'approved', 'checked')

union all

select
  'out', c.id, 'cost', c.description, c.supplier,
  c.cost_date, -c.amount, 'planned', (c.cost_date < current_date)
from danubra_costs c
where not exists (
  select 1 from danubra_bank_transactions b
  where b.matched_cost_id = c.id and b.match_status <> 'ignored'
)
and c.cost_date >= current_date - 60;
