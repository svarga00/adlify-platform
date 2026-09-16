-- ============================================================================
-- DANUBRA Hub v2 — cieľový dátový model
-- ============================================================================
-- Toto NIE JE migrácia na spustenie. Je to cieľový stav, proti ktorému sa píšu
-- migrácie 013+ po fázach. Migrácie sa budú robiť po častiach v poradí F1–F9,
-- každá samostatne a idempotentne, ako doteraz.
--
-- Konvencie z v1, ktoré zostávajú:
--   - všetky tabuľky majú prefix `danubra_` (databáza je zdieľaná)
--   - id uuid, created_at/updated_at timestamptz, created_by → auth.users
--   - peniaze `numeric`, nikdy float
--   - RLS: prihlásený používateľ alebo service_role
--   - trigger `danubra_set_updated_at()` na každej tabuľke so zmenami
--
-- Legenda:
--   [NOVÁ]      tabuľka v v2 nevzniká z ničoho existujúceho
--   [ROZŠÍRIŤ]  existujúca tabuľka, pribúdajú stĺpce
--   [ARCHÍV]    zostáva v databáze, mizne z navigácie
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- F1 — ZÁKLAD
-- ════════════════════════════════════════════════════════════════════════════

-- Archivácia modulov [ROZŠÍRIŤ danubra_settings]
-- Ktoré agendy sú aktívne. Ubytovanie sa nevymaže, len vypne.
alter table danubra_settings add column if not exists modules jsonb default
  '{"recruiting":true,"contracts":true,"finance":true,"accommodation":false}'::jsonb;

-- Číselníky, ktoré sa dnes opakujú ako reťazce po moduloch [NOVÁ]
create table if not exists danubra_enums (
  id uuid primary key default gen_random_uuid(),
  kind text not null,              -- 'document_type' | 'cost_category' | 'unit'
  key text not null,
  label_sk text not null,
  label_de text,
  sort_order int default 0,
  active bool default true,
  unique (kind, key)
);


-- ════════════════════════════════════════════════════════════════════════════
-- F2 — ŽIVNOSTNÍCI A DOKLADY
-- ════════════════════════════════════════════════════════════════════════════

-- [ROZŠÍRIŤ danubra_workers]
-- Dnes tam je mzdový model (gross_monthly, employment_type). v2 je živnostnícky:
-- človek nám fakturuje. Staré stĺpce zostávajú pre historické záznamy.
alter table danubra_workers add column if not exists company_name text;     -- meno na živnosti
alter table danubra_workers add column if not exists company_id text;       -- IČO
alter table danubra_workers add column if not exists tax_id text;           -- DIČ
alter table danubra_workers add column if not exists vat_id text;           -- IČ DPH, ak je platiteľ
alter table danubra_workers add column if not exists business_address text;
alter table danubra_workers add column if not exists business_city text;
alter table danubra_workers add column if not exists business_zip text;
alter table danubra_workers add column if not exists trade_licence_from date;
alter table danubra_workers add column if not exists trade_licence_scopes text[];  -- odbory
alter table danubra_workers add column if not exists vat_payer bool default false;
alter table danubra_workers add column if not exists sf_client_id int;      -- id v SuperFaktúre
alter table danubra_workers add column if not exists crew_id uuid;          -- FK doplní F3

comment on column danubra_workers.hourly_cost is
  'Čo nám fakturuje za hodinu. Pri zamestnancovi sa namiesto toho počíta z gross_monthly.';

-- [ROZŠÍRIŤ danubra_worker_documents]
-- Dnes: kind, reference, valid_from/to, file_url, status.
-- Pribúda upozorňovanie a väzba na úložisko.
alter table danubra_worker_documents add column if not exists storage_path text;
alter table danubra_worker_documents add column if not exists notify_days_before int default 30;
alter table danubra_worker_documents add column if not exists required_for text[];
  -- napr. {'assignment','construction'} — na čo je doklad podmienkou

-- Výnimky z blokátorov [NOVÁ]
-- Admin smie nasadiť človeka bez dokladu, ale musí povedať prečo a zostane to zapísané.
create table if not exists danubra_overrides (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,       -- 'assignment' | 'subcontract' | 'invoice'
  entity_id uuid not null,
  rule_key text not null,          -- ktoré pravidlo sa obišlo
  reason text not null,            -- povinné
  granted_by uuid references auth.users,
  granted_at timestamptz not null default now(),
  valid_until date
);
create index if not exists idx_dovr_entity on danubra_overrides(entity_type, entity_id);


-- ════════════════════════════════════════════════════════════════════════════
-- F3 — PARTIE A ODBERATELIA
-- ════════════════════════════════════════════════════════════════════════════

-- [NOVÁ] Partia — chodia spolu, ale fakturuje každý sám za seba.
-- Spoločná fakturácia by pri kontrole vyzerala ako zamestnávanie.
create table if not exists danubra_crews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  leader_worker_id uuid references danubra_workers,
  trade_key text,
  usual_size int,
  phone text,
  language text default 'sk',
  status text not null default 'active',   -- active | paused | disbanded
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);

-- [NOVÁ] Členstvo v partii má trvanie — ľudia odchádzajú a vracajú sa.
create table if not exists danubra_crew_members (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references danubra_crews on delete cascade,
  worker_id uuid not null references danubra_workers on delete cascade,
  role text default 'member',              -- leader | member
  joined_at date not null default current_date,
  left_at date,
  created_at timestamptz not null default now()
);
create index if not exists idx_dcm_crew on danubra_crew_members(crew_id);
create unique index if not exists idx_dcm_active
  on danubra_crew_members(crew_id, worker_id) where left_at is null;

-- [ROZŠÍRIŤ danubra_partners]
alter table danubra_partners add column if not exists sf_client_id int;
alter table danubra_partners add column if not exists default_charge_rate numeric;
alter table danubra_partners add column if not exists invoice_language text default 'de';
alter table danubra_partners add column if not exists reverse_charge bool default true;
alter table danubra_partners add column if not exists avg_days_to_pay numeric;  -- počíta sa
alter table danubra_partners add column if not exists status text default 'active';


-- ════════════════════════════════════════════════════════════════════════════
-- F4 — PONUKY A ZMLUVY
-- ════════════════════════════════════════════════════════════════════════════

-- [NOVÁ] Ponuka odberateľovi
create table if not exists danubra_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text unique,                -- PON-2026-0001
  partner_id uuid references danubra_partners,
  title text not null,
  trade_key text,
  headcount int not null default 1,
  work_type text default 'construction',   -- construction | workshop
  site_city text, site_address text, country text default 'DE',
  date_from date, date_to date,
  -- peniaze
  charge_rate numeric,                     -- čo fakturujeme za hodinu
  worker_rate numeric,                     -- čo platíme živnostníkovi
  overhead_per_hour numeric default 0,     -- ubytovanie, doprava, réžia
  currency text default 'EUR',
  -- platnosť a stav
  valid_until date,
  status text not null default 'draft',    -- draft|sent|accepted|rejected|expired
  sent_at timestamptz, decided_at timestamptz,
  reject_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dq_status on danubra_quotes(status);

-- [NOVÁ] Zmluva s odberateľom
create table if not exists danubra_contracts (
  id uuid primary key default gen_random_uuid(),
  contract_number text unique,             -- ZML-2026-0001
  partner_id uuid not null references danubra_partners,
  quote_id uuid references danubra_quotes, -- z ktorej ponuky vznikla
  title text not null,
  kind text default 'werkvertrag',         -- werkvertrag | framework
  scope text,                              -- dielo, nie hodiny
  date_from date, date_to date,
  charge_rate numeric,
  payment_terms_days int default 30,
  signed_at date,
  storage_path text,                       -- podpísané PDF
  status text not null default 'draft',    -- draft|sent|signed|active|ended|cancelled
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);

-- [NOVÁ] Dodatok — zmena dátumu alebo sadzby nikdy neprepíše pôvodnú hodnotu
create table if not exists danubra_contract_amendments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references danubra_contracts on delete cascade,
  amendment_number text,
  field text not null,                     -- 'date_to' | 'charge_rate' | ...
  old_value text not null,
  new_value text not null,
  reason text,
  signed_at date,
  storage_path text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dca_contract on danubra_contract_amendments(contract_id);


-- ════════════════════════════════════════════════════════════════════════════
-- F5 — ZÁKAZKY, NASADENIA, VÝKAZY
-- ════════════════════════════════════════════════════════════════════════════

-- [ROZŠÍRIŤ danubra_subcontracts]
alter table danubra_subcontracts add column if not exists contract_id uuid references danubra_contracts;
alter table danubra_subcontracts add column if not exists quote_id uuid references danubra_quotes;
alter table danubra_subcontracts add column if not exists hwo_notified_at date;   -- §9 HwO
alter table danubra_subcontracts add column if not exists soka_registered_at date;

-- [ROZŠÍRIŤ danubra_assignments]
alter table danubra_assignments add column if not exists crew_id uuid references danubra_crews;
alter table danubra_assignments add column if not exists worker_rate numeric;
  -- čo platíme; charge_rate zostáva ako to, čo fakturujeme
alter table danubra_assignments add column if not exists overhead_per_hour numeric default 0;
alter table danubra_assignments add column if not exists started_at date;
alter table danubra_assignments add column if not exists ended_reason text;

comment on column danubra_assignments.accommodation_order_id is
  'Historická väzba na ubytovaciu objednávku z v1. Nové záznamy ju nepoužívajú.';

-- [ROZŠÍRIŤ danubra_timesheets]
alter table danubra_timesheets add column if not exists period_id uuid;  -- FK nižšie
alter table danubra_timesheets add column if not exists rate_used numeric;
alter table danubra_timesheets add column if not exists source text default 'manual';
  -- manual | import | worker_app

-- [NOVÁ] Uzávierka obdobia — z hodín vznikne podklad, ktorý sa už nemení
create table if not exists danubra_periods (
  id uuid primary key default gen_random_uuid(),
  subcontract_id uuid not null references danubra_subcontracts,
  period_from date not null,
  period_to date not null,
  status text not null default 'open',     -- open | closed | invoiced
  closed_at timestamptz, closed_by uuid references auth.users,
  -- súčty sa uložia pri uzavretí, nech sa spätne nemenia
  hours_construction numeric default 0,
  hours_workshop numeric default 0,
  hours_travel numeric default 0,
  amount_charged numeric default 0,        -- čo fakturujeme odberateľovi
  amount_worker_cost numeric default 0,    -- čo dlhujeme živnostníkom
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_dper_unique
  on danubra_periods(subcontract_id, period_from, period_to);

alter table danubra_timesheets
  add constraint danubra_ts_period_fk foreign key (period_id) references danubra_periods;

-- [NOVÁ] Checklist pred nasadením — v1 mal danubra_checklist_items, nepoužil sa.
-- v2 ho viaže na pravidlá, nie na voľný text.
create table if not exists danubra_assignment_checks (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references danubra_assignments on delete cascade,
  rule_key text not null,                  -- 'a1' | 'trade_licence' | 'contract' | ...
  required bool default true,
  done bool default false,
  done_at timestamptz, done_by uuid references auth.users,
  note text,
  unique (assignment_id, rule_key)
);


-- ════════════════════════════════════════════════════════════════════════════
-- F6 — VYDANÉ FAKTÚRY
-- ════════════════════════════════════════════════════════════════════════════

-- [ROZŠÍRIŤ danubra_invoices]
-- v1 vie len faktúry za ubytovanie (client_id + order_id). v2 fakturuje
-- odberateľom za zákazky a vystavuje cez SuperFaktúru.
alter table danubra_invoices add column if not exists partner_id uuid references danubra_partners;
alter table danubra_invoices add column if not exists subcontract_id uuid references danubra_subcontracts;
alter table danubra_invoices add column if not exists period_id uuid references danubra_periods;
alter table danubra_invoices add column if not exists contract_id uuid references danubra_contracts;
-- schvaľovanie — bez toho sa nevystaví
alter table danubra_invoices add column if not exists approved_by uuid references auth.users;
alter table danubra_invoices add column if not exists approved_at timestamptz;
alter table danubra_invoices add column if not exists sent_at timestamptz;
-- §48b zrážka
alter table danubra_invoices add column if not exists withholding_pct numeric default 0;
alter table danubra_invoices add column if not exists withholding_amount numeric default 0;
alter table danubra_invoices add column if not exists amount_net numeric;   -- po zrážke
-- SuperFaktúra
alter table danubra_invoices add column if not exists sf_invoice_id int;
alter table danubra_invoices add column if not exists sf_token text;
alter table danubra_invoices add column if not exists sf_synced_at timestamptz;
alter table danubra_invoices add column if not exists sf_environment text;  -- sandbox | production

comment on column danubra_invoices.status is
  'draft | pending_approval | approved | issued | sent | paid | overdue | cancelled. '
  'Z pending_approval ďalej len rukou admina — nikdy automaticky.';

comment on column danubra_invoices.client_id is
  'Historická väzba na ubytovacieho klienta z v1. Nové faktúry používajú partner_id.';


-- ════════════════════════════════════════════════════════════════════════════
-- F7 — PRIJATÉ FAKTÚRY A NÁKLADY
-- ════════════════════════════════════════════════════════════════════════════

-- [NOVÁ] Faktúra od živnostníka nám
create table if not exists danubra_bills (
  id uuid primary key default gen_random_uuid(),
  bill_number text,                        -- ich číslo faktúry
  worker_id uuid not null references danubra_workers,
  assignment_id uuid references danubra_assignments,
  period_id uuid references danubra_periods,
  subcontract_id uuid references danubra_subcontracts,
  issue_date date, due_date date, delivery_date date,
  amount numeric not null,
  vat_amount numeric default 0,
  currency text default 'EUR',
  -- kontrola voči schváleným hodinám
  expected_amount numeric,                 -- čo by podľa hodín malo prísť
  variance numeric,                        -- rozdiel; nenulový = pozrieť sa
  status text not null default 'received', -- received|checked|approved|paid|disputed
  checked_at timestamptz, checked_by uuid references auth.users,
  approved_at timestamptz, approved_by uuid references auth.users,
  paid_at timestamptz,
  storage_path text,                       -- sken faktúry
  sf_expense_id int,                       -- výdavok v SuperFaktúre
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dbill_worker on danubra_bills(worker_id);
create index if not exists idx_dbill_status on danubra_bills(status);

-- [NOVÁ] Ostatné náklady
create table if not exists danubra_costs (
  id uuid primary key default gen_random_uuid(),
  category text not null,                  -- accommodation|transport|tools|insurance|soka|fees|other
  subcontract_id uuid references danubra_subcontracts,
  worker_id uuid references danubra_workers,
  supplier text,
  description text,
  amount numeric not null,
  currency text default 'EUR',
  cost_date date not null default current_date,
  -- opakované náklady (mesačné ubytovanie)
  recurring bool default false,
  recurring_until date,
  parent_cost_id uuid references danubra_costs,
  storage_path text,
  sf_expense_id int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dcost_sub on danubra_costs(subcontract_id);
create index if not exists idx_dcost_date on danubra_costs(cost_date desc);


-- ════════════════════════════════════════════════════════════════════════════
-- F8 — BANKA
-- ════════════════════════════════════════════════════════════════════════════

-- [NOVÁ] Pohyb na účte
create table if not exists danubra_bank_transactions (
  id uuid primary key default gen_random_uuid(),
  booked_at date not null,
  amount numeric not null,                 -- kladné príjem, záporné výdaj
  currency text default 'EUR',
  counterparty_name text,
  counterparty_iban text,
  variable_symbol text,
  message text,
  -- párovanie
  matched_invoice_id uuid references danubra_invoices,
  matched_bill_id uuid references danubra_bills,
  matched_cost_id uuid references danubra_costs,
  match_status text not null default 'unmatched',  -- unmatched|auto|manual|ignored
  matched_at timestamptz, matched_by uuid references auth.users,
  -- aby sa import nedal spraviť dvakrát
  import_hash text unique,
  import_batch text,
  created_at timestamptz not null default now()
);
create index if not exists idx_dbank_vs on danubra_bank_transactions(variable_symbol);
create index if not exists idx_dbank_status on danubra_bank_transactions(match_status);


-- ════════════════════════════════════════════════════════════════════════════
-- F9 — ÚLOHY AKO PRAVIDLÁ
-- ════════════════════════════════════════════════════════════════════════════

-- [NOVÁ] Pravidlo, z ktorého vznikajú úlohy.
-- v1 mal pravidlá zadrôtované v crone; tu sa dá pridať bez zásahu do kódu.
create table if not exists danubra_task_rules (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  description text,
  -- čo sledovať
  source_table text not null,              -- napr. danubra_worker_documents
  date_field text not null,                -- napr. valid_to
  filter jsonb default '{}'::jsonb,        -- napr. {"kind":"a1"}
  days_before int default 30,
  -- akú úlohu vytvoriť
  task_title_template text not null,       -- „Vybaviť nové A1 pre {label}"
  priority text default 'normal',
  assigned_name text,
  active bool default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- [ROZŠÍRIŤ danubra_tasks]
alter table danubra_tasks add column if not exists rule_id uuid references danubra_task_rules;
alter table danubra_tasks add column if not exists snoozed_until date;


-- ════════════════════════════════════════════════════════════════════════════
-- ARCHÍV — ubytovanie
-- ════════════════════════════════════════════════════════════════════════════
-- Tabuľky zostávajú, dáta zostávajú, väzby zostávajú. Mení sa len to, že sa
-- neobjavujú v navigácii a nové záznamy do nich nevznikajú.
--
--   danubra_inquiries, danubra_offers, danubra_offer_variants
--   danubra_orders, danubra_order_persons, danubra_order_requests,
--   danubra_order_service_periods, danubra_order_extensions
--   danubra_clients
--
-- danubra_accommodations a danubra_subcontract_accommodations ZOSTÁVAJÚ AKTÍVNE
-- — ubytovanie je naďalej náklad zákazky.


-- ════════════════════════════════════════════════════════════════════════════
-- POHĽADY NA VÝPOČTY
-- ════════════════════════════════════════════════════════════════════════════
-- Sumy sa počítajú v SQL, nie v prehliadači — nech sedia bez ohľadu na to,
-- odkiaľ sa na ne pozerá.

-- Marža zákazky: čo sme vyfakturovali mínus čo nás stála
create or replace view danubra_v_subcontract_margin as
select s.id as subcontract_id,
       s.contract_number,
       coalesce(inv.charged, 0)      as fakturovane,
       coalesce(b.worker_cost, 0)    as naklad_zivnostnici,
       coalesce(c.other_cost, 0)     as naklad_ostatne,
       coalesce(inv.charged, 0) - coalesce(b.worker_cost, 0) - coalesce(c.other_cost, 0) as marza
from danubra_subcontracts s
left join (select subcontract_id, sum(total) charged from danubra_invoices
           where status in ('issued','sent','paid') group by 1) inv on inv.subcontract_id = s.id
left join (select subcontract_id, sum(amount) worker_cost from danubra_bills
           where status in ('approved','paid') group by 1) b on b.subcontract_id = s.id
left join (select subcontract_id, sum(amount) other_cost from danubra_costs
           group by 1) c on c.subcontract_id = s.id;

-- Podiel stavebných hodín — nad 50 % je SOKA povinná
create or replace view danubra_v_construction_share as
select subcontract_id,
       sum(case when activity_type = 'construction' then hours else 0 end) as stavba,
       sum(case when activity_type = 'workshop' then hours else 0 end)     as dielna,
       case when sum(case when activity_type in ('construction','workshop') then hours else 0 end) > 0
            then round(100.0 * sum(case when activity_type = 'construction' then hours else 0 end)
                 / sum(case when activity_type in ('construction','workshop') then hours else 0 end), 1)
            else null end as podiel_stavby_pct
from danubra_timesheets t
join danubra_assignments a on a.id = t.assignment_id
group by subcontract_id;
