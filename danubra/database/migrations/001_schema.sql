-- ============================================================================
-- DANUBRA Hub — 001 — Kompletná DB schéma (§2 zadania)
-- ============================================================================
-- Interná appka pre sprostredkovanie ubytovania (2 používatelia).
-- Beží na spoločnom Supabase projekte s Adlify, ale všetky tabuľky sú
-- prefixované logicky (danubra doména) a oddelené — žiadny konflikt.
--
-- Konvencie:
--   - id uuid pk default gen_random_uuid()
--   - created_at, updated_at (updated_at cez trigger)
--   - created_by uuid references auth.users
--   - peniaze VŽDY numeric, nikdy float (§5.6)
--   - RLS zapnuté na všetkom, politika authenticated (§2 RLS)
--
-- Idempotentné — bezpečné spustiť opakovane.
-- ============================================================================

-- ── Helper: updated_at trigger ──────────────────────────────────────────────
create or replace function danubra_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Helper makro pre RLS + trigger (aplikované per tabuľka nižšie) ───────────

-- ============================================================================
-- 2.1  accommodations
-- ============================================================================
create table if not exists accommodations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text,                       -- 'zimmer'|'wohnung'|'pension'|'haus'|'hostel'
  country text,                    -- 'DE'|'AT'|'CH'|'LU'|'CZ'|'HU'
  city text not null,
  postal_code text,
  address text,
  lat numeric,
  lng numeric,
  beds int,
  rooms int,
  max_persons int,
  price_per_bed_night numeric,
  price_week numeric,
  price_month numeric,
  min_nights int,
  amenities text[],                -- kitchen, washing_machine, wifi, tv, private_bathroom, bed_linen
  van_parking bool default false,
  highway_distance_km numeric,
  invoice_payment bool default false,
  vat_regime text,                 -- 'mwst'|'kleinunternehmer'|'unknown'
  owner_name text,
  owner_phone text,
  owner_whatsapp bool default false,
  owner_email text,
  owner_language text,
  verification_status text default 'new',  -- new|contacted|prices_confirmed|verified|not_cooperating
  source text,
  last_contact_at timestamptz,
  notes text,
  -- prístupové údaje (kopírujú sa do order_files pri založení spisu)
  access_door_code text,
  access_key_location text,
  wifi_ssid text,
  wifi_password text,
  gate_code text,
  room_number text,
  floor text,
  house_rules text,
  deposit_amount numeric,
  deposit_holder text,
  checkin_info text,
  checkout_info text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_acc_city on accommodations(city);
create index if not exists idx_acc_country_city on accommodations(country, city);
create index if not exists idx_acc_verification on accommodations(verification_status);
create index if not exists idx_acc_price on accommodations(price_per_bed_night);

-- ============================================================================
-- 2.2  clients
-- ============================================================================
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  type text,                       -- 'sole_trader'|'crew'|'company'
  name text not null,
  company_id text,
  vat_id text,
  country text,                    -- riadi fakturačný režim (§6.3)
  contact_person text,
  phone text,
  whatsapp bool default false,
  email text,
  language text,                   -- 'sk'|'cs'|'hu'
  retainer bool default false,
  retainer_rate numeric,
  retainer_from date,
  retainer_to date,
  source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_clients_email on clients(email);
create index if not exists idx_clients_phone on clients(phone);
create index if not exists idx_clients_country on clients(country);

-- ============================================================================
-- 2.3  inquiries
-- ============================================================================
create table if not exists inquiries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients,
  target_city text,
  postal_code text,
  country text,
  date_from date,
  date_to date,
  persons int,
  budget_per_bed numeric,
  requirements text[],
  urgent bool default false,
  channel text,                    -- web|whatsapp|fb|phone|email|b2b|sms
  status text default 'new',       -- new|qualified|offer_sent|won|accommodated|closed|lost
  lost_reason text,
  received_at timestamptz default now(),
  first_response_at timestamptz,   -- KPI: čas prvej reakcie
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_inq_status on inquiries(status);
create index if not exists idx_inq_client on inquiries(client_id);
create index if not exists idx_inq_city on inquiries(target_city);

-- ============================================================================
-- 2.4  offers + offer_variants
-- ============================================================================
create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid references inquiries,
  client_id uuid references clients,
  language text,
  service_fee numeric,
  urgent_surcharge bool default false,
  ongoing_service_enabled bool default false,
  ongoing_service_rate numeric,    -- €/os./deň
  valid_until date,
  status text default 'draft',     -- draft|sent|accepted|expired
  sent_at timestamptz,
  sent_channel text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_offers_inquiry on offers(inquiry_id);
create index if not exists idx_offers_client on offers(client_id);
create index if not exists idx_offers_status on offers(status);

create table if not exists offer_variants (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid references offers on delete cascade,
  accommodation_id uuid references accommodations,
  price_per_bed_night numeric,
  nights int,
  total_accommodation numeric,
  sort_order int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_offer_variants_offer on offer_variants(offer_id);

-- ============================================================================
-- 2.5  orders  ⭐ jadro
-- ============================================================================
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique,        -- OBJ-2026-0042 (§6.1)
  offer_id uuid references offers,
  inquiry_id uuid references inquiries,
  client_id uuid references clients,
  accommodation_id uuid references accommodations,
  date_from date not null,
  date_to date not null,
  persons int not null,
  nights int generated always as (date_to - date_from) stored,
  price_per_bed_night numeric,
  total_accommodation numeric,
  service_fee numeric,
  urgent_surcharge numeric,
  ongoing_service_enabled bool default false,
  ongoing_service_rate numeric,
  status text not null default 'new',   -- §6.2 automat
  accepted_at timestamptz,
  fee_paid_at timestamptz,
  payment_method text,
  owner_confirmed_at timestamptz,
  cancellation_reason text,
  terms_version text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_client on orders(client_id);
create index if not exists idx_orders_dates on orders(date_from, date_to);
create index if not exists idx_orders_number on orders(order_number);

-- ============================================================================
-- 2.6  order_extensions (história predĺžení — nikdy neprepisuj date_to)
-- ============================================================================
create table if not exists order_extensions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders on delete cascade,
  previous_date_to date,
  new_date_to date,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_order_ext_order on order_extensions(order_id);

-- ============================================================================
-- 2.7  order_persons
-- ============================================================================
create table if not exists order_persons (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders on delete cascade,
  full_name text,
  phone text,
  date_from date,
  date_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_order_persons_order on order_persons(order_id);

-- ============================================================================
-- 2.8  order_service_periods — segmenty priebežnej služby  ⭐
-- ============================================================================
create table if not exists order_service_periods (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders on delete cascade,
  period_from date not null,
  period_to date,                  -- null = otvorený segment
  persons int not null,
  rate numeric not null,           -- €/os./deň
  paused bool default false,
  pause_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_osp_order on order_service_periods(order_id);
create index if not exists idx_osp_period on order_service_periods(period_from, period_to);

-- ============================================================================
-- 2.9  order_requests (mini-ticketing počas pobytu)
-- ============================================================================
create table if not exists order_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders on delete cascade,
  title text,
  description text,
  reported_by text,
  priority text default 'normal',  -- low|normal|high
  status text default 'new',       -- new|in_progress|resolved
  assigned_to uuid references auth.users,
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_order_req_order on order_requests(order_id);
create index if not exists idx_order_req_status on order_requests(status);

-- ============================================================================
-- 2.10  invoices + invoice_items
-- ============================================================================
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique,      -- 2026001 (§6.1)
  client_id uuid references clients,
  order_id uuid references orders,
  type text,                       -- service_fee|ongoing_service|retainer|other
  issue_date date,
  due_date date,
  delivery_date date,
  total numeric,
  currency text default 'EUR',
  vat_regime text,                 -- sk_no_vat|eu_reverse_charge|other
  status text default 'draft_pending_approval', -- draft_pending_approval|issued|paid|overdue|cancelled
  paid_at timestamptz,
  billing_period_from date,        -- pri ongoing_service
  billing_period_to date,
  pdf_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_invoices_client on invoices(client_id);
create index if not exists idx_invoices_order on invoices(order_id);
create index if not exists idx_invoices_status on invoices(status);
create index if not exists idx_invoices_period on invoices(billing_period_from, billing_period_to);

create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices on delete cascade,
  description text,
  quantity numeric,
  unit text,
  unit_price numeric,
  total numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_invoice_items_invoice on invoice_items(invoice_id);

-- ============================================================================
-- 2.11  activities (jednotná komunikačná os)
-- ============================================================================
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  entity_type text,                -- accommodation|client|inquiry|order
  entity_id uuid,
  type text,                       -- call|sms|whatsapp|email|note|system
  direction text,                  -- in|out|null
  body text,
  channel_meta jsonb,              -- delivery status, message id
  follow_up_at timestamptz,
  done bool default false,
  -- pripravené pre budúcu AI vrstvu (NEIMPLEMENTOVAŤ teraz):
  recording_url text,
  transcript text,
  source text default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_activities_entity on activities(entity_type, entity_id, created_at desc);
create index if not exists idx_activities_followup on activities(follow_up_at) where follow_up_at is not null and done = false;

-- ============================================================================
-- 2.12  documents
-- ============================================================================
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders on delete cascade,
  type text,                       -- order_confirmation|payment_request|owner_confirmation|handover|offer|invoice
  language text,
  file_url text,
  sent_at timestamptz,
  sent_channel text,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_documents_order on documents(order_id);

-- ============================================================================
-- 2.13  marketing_listings + marketing_expenses
-- ============================================================================
create table if not exists marketing_listings (
  id uuid primary key default gen_random_uuid(),
  platform text,
  listing_type text,
  url text,
  language text,
  published_at date,
  renew_at date,
  status text default 'active',    -- active|to_renew|expired
  performance_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_mkt_listings_status on marketing_listings(status);
create index if not exists idx_mkt_listings_renew on marketing_listings(renew_at);

create table if not exists marketing_expenses (
  id uuid primary key default gen_random_uuid(),
  spent_at date,
  channel text,
  amount numeric,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_mkt_expenses_date on marketing_expenses(spent_at);

-- ============================================================================
-- 2.14  settings (jeden riadok)
-- ============================================================================
create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  pricing jsonb default '{}'::jsonb,
  supplier jsonb default '{}'::jsonb,
  invoice_series jsonb default '{}'::jsonb,
  order_series jsonb default '{}'::jsonb,
  automations jsonb default '{}'::jsonb,
  marketing jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);

-- ============================================================================
-- 2.15  message_templates
-- ============================================================================
create table if not exists message_templates (
  id uuid primary key default gen_random_uuid(),
  key text,
  language text,
  channel text,                    -- sms|email|whatsapp
  subject text,
  body text,                       -- premenné {{client_name}}, {{order_number}}, ...
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users,
  unique (key, language, channel)
);

-- ============================================================================
-- updated_at triggery pre všetky tabuľky
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'accommodations','clients','inquiries','offers','offer_variants','orders',
    'order_extensions','order_persons','order_service_periods','order_requests',
    'invoices','invoice_items','activities','documents','marketing_listings',
    'marketing_expenses','settings','message_templates'
  ] loop
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format('create trigger set_updated_at before update on %I
                    for each row execute function danubra_set_updated_at()', t);
  end loop;
end $$;

-- ============================================================================
-- RLS — zapni na všetkých, politika: authenticated (2 interní používatelia)
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'accommodations','clients','inquiries','offers','offer_variants','orders',
    'order_extensions','order_persons','order_service_periods','order_requests',
    'invoices','invoice_items','activities','documents','marketing_listings',
    'marketing_expenses','settings','message_templates'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists danubra_auth_all on %I', t);
    execute format($p$create policy danubra_auth_all on %I
      for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
      with check (auth.role() = 'authenticated' or auth.role() = 'service_role')$p$, t);
  end loop;
end $$;

-- ============================================================================
-- Seed: jeden settings riadok s default hodnotami (§2.14)
-- ============================================================================
insert into settings (pricing, supplier, invoice_series, order_series, automations, marketing)
select
  jsonb_build_object(
    'fee_individual', 150, 'fee_crew', 250, 'fee_company', 400,
    'urgent_percent', 20, 'ongoing_service_rate_default', 1.5,
    'retainer_individual', 50, 'retainer_company', 200
  ),
  jsonb_build_object(
    'name', 'DANUBRA s.r.o.', 'iban', 'SK00 0000 0000 0000 0000 0000',
    'vat_note', 'Nie sme platiteľmi DPH.'
  ),
  jsonb_build_object('prefix', '', 'year', extract(year from now())::int, 'current', 0),
  jsonb_build_object('prefix', 'OBJ', 'year', extract(year from now())::int, 'current', 0),
  jsonb_build_object(
    'sms_pre_arrival', false, 'payment_reminders', true,
    'ending_soon_alert', true, 'review_request', false
  ),
  jsonb_build_object('monthly_budget', 300, 'sms_monthly_limit', 200)
where not exists (select 1 from settings);
