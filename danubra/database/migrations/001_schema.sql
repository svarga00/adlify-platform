-- ============================================================================
-- DANUBRA Hub — 001 — Kompletná DB schéma (§2 zadania)
-- ============================================================================
-- Interná appka pre sprostredkovanie ubytovania (2 používatelia).
-- Beží na SPOLOČNOM Supabase projekte s Adlify → všetky tabuľky majú prefix
-- `danubra_` aby nekolidovali s Adlify tabuľkami (clients, settings, orders…).
--
-- Konvencie:
--   - id uuid pk default gen_random_uuid()
--   - created_at, updated_at (updated_at cez trigger)
--   - created_by uuid references auth.users
--   - peniaze VŽDY numeric (§5.6)
--   - RLS zapnuté, politika authenticated
--
-- Idempotentné — bezpečné spustiť opakovane.
-- ============================================================================

create or replace function danubra_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── 2.1  danubra_accommodations ─────────────────────────────────────────────
create table if not exists danubra_accommodations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text,
  country text,
  city text not null,
  postal_code text, address text, lat numeric, lng numeric,
  beds int, rooms int, max_persons int,
  price_per_bed_night numeric, price_week numeric, price_month numeric, min_nights int,
  amenities text[],
  van_parking bool default false,
  highway_distance_km numeric,
  invoice_payment bool default false,
  vat_regime text,
  owner_name text, owner_phone text, owner_whatsapp bool default false,
  owner_email text, owner_language text,
  verification_status text default 'new',
  source text, last_contact_at timestamptz, notes text,
  access_door_code text, access_key_location text, wifi_ssid text, wifi_password text,
  gate_code text, room_number text, floor text,
  house_rules text, deposit_amount numeric, deposit_holder text,
  checkin_info text, checkout_info text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dacc_city on danubra_accommodations(city);
create index if not exists idx_dacc_country_city on danubra_accommodations(country, city);
create index if not exists idx_dacc_verif on danubra_accommodations(verification_status);
create index if not exists idx_dacc_price on danubra_accommodations(price_per_bed_night);

-- ── 2.2  danubra_clients ────────────────────────────────────────────────────
create table if not exists danubra_clients (
  id uuid primary key default gen_random_uuid(),
  type text,
  name text not null,
  company_id text, vat_id text, country text,
  contact_person text, phone text, whatsapp bool default false, email text, language text,
  retainer bool default false, retainer_rate numeric, retainer_from date, retainer_to date,
  source text, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dcli_email on danubra_clients(email);
create index if not exists idx_dcli_phone on danubra_clients(phone);
create index if not exists idx_dcli_country on danubra_clients(country);

-- ── 2.3  danubra_inquiries ──────────────────────────────────────────────────
create table if not exists danubra_inquiries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references danubra_clients,
  target_city text, postal_code text, country text,
  date_from date, date_to date, persons int,
  budget_per_bed numeric, requirements text[], urgent bool default false,
  channel text, status text default 'new', lost_reason text,
  received_at timestamptz default now(), first_response_at timestamptz, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dinq_status on danubra_inquiries(status);
create index if not exists idx_dinq_client on danubra_inquiries(client_id);
create index if not exists idx_dinq_city on danubra_inquiries(target_city);

-- ── 2.4  danubra_offers + danubra_offer_variants ────────────────────────────
create table if not exists danubra_offers (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid references danubra_inquiries,
  client_id uuid references danubra_clients,
  language text,
  service_fee numeric, urgent_surcharge bool default false,
  ongoing_service_enabled bool default false, ongoing_service_rate numeric,
  valid_until date, status text default 'draft',
  sent_at timestamptz, sent_channel text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_doff_inquiry on danubra_offers(inquiry_id);
create index if not exists idx_doff_client on danubra_offers(client_id);
create index if not exists idx_doff_status on danubra_offers(status);

create table if not exists danubra_offer_variants (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid references danubra_offers on delete cascade,
  accommodation_id uuid references danubra_accommodations,
  price_per_bed_night numeric, nights int, total_accommodation numeric, sort_order int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dov_offer on danubra_offer_variants(offer_id);

-- ── 2.5  danubra_orders  ⭐ ──────────────────────────────────────────────────
-- nights je obyčajný int (appka počíta date_to - date_from) — bez generated
-- column, aby migrácia nikde nezlyhala.
create table if not exists danubra_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique,
  offer_id uuid references danubra_offers,
  inquiry_id uuid references danubra_inquiries,
  client_id uuid references danubra_clients,
  accommodation_id uuid references danubra_accommodations,
  date_from date not null,
  date_to date not null,
  persons int not null,
  nights int,
  price_per_bed_night numeric, total_accommodation numeric,
  service_fee numeric, urgent_surcharge numeric,
  ongoing_service_enabled bool default false, ongoing_service_rate numeric,
  status text not null default 'new',
  accepted_at timestamptz, fee_paid_at timestamptz, payment_method text,
  owner_confirmed_at timestamptz, cancellation_reason text, terms_version text, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dord_status on danubra_orders(status);
create index if not exists idx_dord_client on danubra_orders(client_id);
create index if not exists idx_dord_dates on danubra_orders(date_from, date_to);
create index if not exists idx_dord_number on danubra_orders(order_number);

-- ── 2.6  danubra_order_extensions ───────────────────────────────────────────
create table if not exists danubra_order_extensions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references danubra_orders on delete cascade,
  previous_date_to date, new_date_to date, reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dext_order on danubra_order_extensions(order_id);

-- ── 2.7  danubra_order_persons ──────────────────────────────────────────────
create table if not exists danubra_order_persons (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references danubra_orders on delete cascade,
  full_name text, phone text, date_from date, date_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dop_order on danubra_order_persons(order_id);

-- ── 2.8  danubra_order_service_periods  ⭐ ───────────────────────────────────
create table if not exists danubra_order_service_periods (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references danubra_orders on delete cascade,
  period_from date not null, period_to date,
  persons int not null, rate numeric not null,
  paused bool default false, pause_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dosp_order on danubra_order_service_periods(order_id);
create index if not exists idx_dosp_period on danubra_order_service_periods(period_from, period_to);

-- ── 2.9  danubra_order_requests ─────────────────────────────────────────────
create table if not exists danubra_order_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references danubra_orders on delete cascade,
  title text, description text, reported_by text,
  priority text default 'normal', status text default 'new',
  assigned_to uuid references auth.users, resolution text, resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dor_order on danubra_order_requests(order_id);
create index if not exists idx_dor_status on danubra_order_requests(status);

-- ── 2.10  danubra_invoices + danubra_invoice_items ──────────────────────────
create table if not exists danubra_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique,
  client_id uuid references danubra_clients,
  order_id uuid references danubra_orders,
  type text, issue_date date, due_date date, delivery_date date,
  total numeric, currency text default 'EUR', vat_regime text,
  status text default 'draft_pending_approval', paid_at timestamptz,
  billing_period_from date, billing_period_to date, pdf_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dinv_client on danubra_invoices(client_id);
create index if not exists idx_dinv_order on danubra_invoices(order_id);
create index if not exists idx_dinv_status on danubra_invoices(status);
create index if not exists idx_dinv_period on danubra_invoices(billing_period_from, billing_period_to);

create table if not exists danubra_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references danubra_invoices on delete cascade,
  description text, quantity numeric, unit text, unit_price numeric, total numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dii_invoice on danubra_invoice_items(invoice_id);

-- ── 2.11  danubra_activities ────────────────────────────────────────────────
create table if not exists danubra_activities (
  id uuid primary key default gen_random_uuid(),
  entity_type text, entity_id uuid,
  type text, direction text, body text, channel_meta jsonb,
  follow_up_at timestamptz, done bool default false,
  recording_url text, transcript text, source text default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dact_entity on danubra_activities(entity_type, entity_id, created_at desc);
create index if not exists idx_dact_followup on danubra_activities(follow_up_at) where follow_up_at is not null and done = false;

-- ── 2.12  danubra_documents ─────────────────────────────────────────────────
create table if not exists danubra_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references danubra_orders on delete cascade,
  type text, language text, file_url text, sent_at timestamptz, sent_channel text, payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_ddoc_order on danubra_documents(order_id);

-- ── 2.13  danubra_marketing_listings + danubra_marketing_expenses ───────────
create table if not exists danubra_marketing_listings (
  id uuid primary key default gen_random_uuid(),
  platform text, listing_type text, url text, language text,
  published_at date, renew_at date, status text default 'active', performance_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dml_status on danubra_marketing_listings(status);
create index if not exists idx_dml_renew on danubra_marketing_listings(renew_at);

create table if not exists danubra_marketing_expenses (
  id uuid primary key default gen_random_uuid(),
  spent_at date, channel text, amount numeric, note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dme_date on danubra_marketing_expenses(spent_at);

-- ── 2.14  danubra_settings ──────────────────────────────────────────────────
create table if not exists danubra_settings (
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

-- ── 2.15  danubra_message_templates ─────────────────────────────────────────
create table if not exists danubra_message_templates (
  id uuid primary key default gen_random_uuid(),
  key text, language text, channel text, subject text, body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users,
  unique (key, language, channel)
);

-- ── updated_at triggery + RLS pre všetky danubra_ tabuľky ───────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'danubra_accommodations','danubra_clients','danubra_inquiries','danubra_offers',
    'danubra_offer_variants','danubra_orders','danubra_order_extensions','danubra_order_persons',
    'danubra_order_service_periods','danubra_order_requests','danubra_invoices','danubra_invoice_items',
    'danubra_activities','danubra_documents','danubra_marketing_listings','danubra_marketing_expenses',
    'danubra_settings','danubra_message_templates'
  ] loop
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format('create trigger set_updated_at before update on %I
                    for each row execute function danubra_set_updated_at()', t);
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists danubra_auth_all on %I', t);
    execute format($p$create policy danubra_auth_all on %I
      for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
      with check (auth.role() = 'authenticated' or auth.role() = 'service_role')$p$, t);
  end loop;
end $$;

-- ── Seed: default settings riadok ───────────────────────────────────────────
insert into danubra_settings (pricing, supplier, invoice_series, order_series, automations, marketing)
select
  jsonb_build_object('fee_individual', 150, 'fee_crew', 250, 'fee_company', 400,
    'urgent_percent', 20, 'ongoing_service_rate_default', 1.5,
    'retainer_individual', 50, 'retainer_company', 200),
  jsonb_build_object('name', 'DANUBRA s.r.o.', 'iban', 'SK00 0000 0000 0000 0000 0000',
    'vat_note', 'Nie sme platiteľmi DPH.'),
  jsonb_build_object('prefix', '', 'year', extract(year from now())::int, 'current', 0),
  jsonb_build_object('prefix', 'OBJ', 'year', extract(year from now())::int, 'current', 0),
  jsonb_build_object('sms_pre_arrival', false, 'payment_reminders', true,
    'ending_soon_alert', true, 'review_request', false),
  jsonb_build_object('monthly_budget', 300, 'sms_monthly_limit', 200)
where not exists (select 1 from danubra_settings);
