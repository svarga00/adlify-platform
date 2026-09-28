-- ============================================================================
-- DANUBRA Hub — 003 — Subdodávky do Nemecka (Fáza 2)
-- ============================================================================
-- Druhá biznis vetva: vysielanie vlastných zamestnancov ako Werkvertrag.
-- Oddelená od ubytovacej agendy (vlastné tabuľky, vlastní odberatelia),
-- ale v tej istej aplikácii a s tými istými nastaveniami.
--
-- Compliance je prvotriedny občan — bez A1, §48b, SOKA a hlásenia Zoll
-- sa nesmie vyslať nikto. Preto samostatný register s platnosťami.
--
-- Idempotentné.
-- ============================================================================

-- ── Pracovníci (vlastní zamestnanci) ────────────────────────────────────────
create table if not exists danubra_workers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text, email text, whatsapp bool default false,
  language text,                       -- 'sk'|'hu'|'cs'|'ua'…
  birth_date date,
  address text, city text, country text default 'SK',
  -- profesia a schopnosti
  profession text,                     -- 'trockenbau'|'maliar'|'obkladac'|'zamocnik'|'zvarac'|'cnc'…
  skill_level text,                    -- 'werker'|'fachwerker'  (LG1 / LG2 podľa Bau-Mindestlohn)
  skills text[],                       -- voľné značky
  languages text[],                    -- ktorými jazykmi hovorí
  german_level text,                   -- 'ziadny'|'zaklad'|'dobry'
  driving_licence bool default false,
  own_tools bool default false,
  -- pracovný pomer a odmeňovanie
  employment_type text,                -- 'tpp'|'dohoda'|'zivnost'
  gross_monthly numeric,               -- hrubá mzda SR
  hourly_gross numeric,                -- ak hodinová
  per_diem_daily numeric,              -- diéty €/deň (DE 45 €)
  bank_iban text,
  -- dostupnosť a stav
  status text default 'candidate',     -- candidate|screening|ready|deployed|inactive|blacklist
  available_from date,
  source text,                         -- odkiaľ prišiel (referral, profesia.sk, FB…)
  referred_by uuid references danubra_workers,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dw_status on danubra_workers(status);
create index if not exists idx_dw_profession on danubra_workers(profession);
create index if not exists idx_dw_available on danubra_workers(available_from);

-- ── Doklady pracovníka (platnosti — kritické pre vyslanie) ──────────────────
create table if not exists danubra_worker_documents (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid references danubra_workers on delete cascade,
  kind text not null,                  -- 'a1'|'passport'|'id_card'|'medical'|'certificate'|'training'|'contract'
  reference text,                      -- číslo dokladu
  valid_from date, valid_to date,
  file_url text,
  status text default 'valid',         -- valid|expiring|expired|requested|missing
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dwd_worker on danubra_worker_documents(worker_id);
create index if not exists idx_dwd_valid_to on danubra_worker_documents(valid_to);
create index if not exists idx_dwd_kind on danubra_worker_documents(kind);

-- ── Odberatelia v Nemecku (Generalunternehmer / Auftraggeber) ───────────────
-- Zámerne oddelené od danubra_clients (ubytovanie) — iný biznis, iné polia.
create table if not exists danubra_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ust_idnr text,                       -- USt-IdNr (nutné pre reverse charge §13b)
  registration_no text,                -- Handelsregister
  address text, city text, postal_code text, country text default 'DE',
  contact_person text, phone text, email text,
  language text default 'de',
  payment_terms_days int default 30,   -- splatnosť — vstup do sledovania DSO
  is_construction bool default true,   -- stavebné práce → SOKA-BAU, §48b, Bau-Mindestlohn
  factoring_eligible bool default false,
  rating text,                         -- 'a'|'b'|'c' — spoľahlivosť platieb
  source text, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dp_country on danubra_partners(country);
create index if not exists idx_dp_construction on danubra_partners(is_construction);

-- ── Zákazky / Werkvertrag ───────────────────────────────────────────────────
create table if not exists danubra_subcontracts (
  id uuid primary key default gen_random_uuid(),
  contract_number text unique,         -- ZAK-2026-0001
  partner_id uuid references danubra_partners,
  title text not null,
  work_type text not null default 'workshop',  -- 'workshop' (dielňa/kov) | 'construction' (stavba)
  trade text,                          -- konkrétne remeslo (trockenbau, obklady, zvaranie…)
  -- miesto výkonu
  site_name text, site_address text, site_city text, site_postal_code text,
  -- termín a rozsah
  date_from date, date_to date,
  scope text,                          -- definícia diela (výsledok, nie hodiny — §Werkvertrag)
  -- odmena
  billing_model text default 'hourly', -- 'hourly' | 'unit' | 'fixed'
  charge_rate numeric,                 -- €/h fakturované odberateľovi (alebo €/jednotku)
  unit_label text,                     -- m², kus…
  fixed_price numeric,
  -- compliance stavy (§48b, Zoll, SOKA) — bez nich sa nesmie začať
  zoll_reported_at timestamptz,        -- meldeportal-mindestlohn.de
  zoll_reference text,                 -- Meldungs-ID
  freistellung_verified bool default false,   -- §48b overená pred fakturáciou
  soka_relevant bool,                  -- spadá pod VTV (rozhoduje >50 % stavebných hodín)
  status text not null default 'draft',-- draft|negotiation|won|active|completed|cancelled|lost
  won_at timestamptz, completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dsc_status on danubra_subcontracts(status);
create index if not exists idx_dsc_partner on danubra_subcontracts(partner_id);
create index if not exists idx_dsc_dates on danubra_subcontracts(date_from, date_to);
create index if not exists idx_dsc_worktype on danubra_subcontracts(work_type);

-- ── Nasadenie pracovníka na zákazku ─────────────────────────────────────────
create table if not exists danubra_assignments (
  id uuid primary key default gen_random_uuid(),
  subcontract_id uuid references danubra_subcontracts on delete cascade,
  worker_id uuid references danubra_workers,
  date_from date not null, date_to date,
  role text,                           -- 'predak' (vedie práce — dôkaz proti ANÜ) | 'pracovnik'
  charge_rate numeric,                 -- €/h fakturované za tohto človeka
  gross_monthly numeric,               -- hrubá mzda počas nasadenia
  per_diem_daily numeric,              -- diéty €/deň
  accommodation_monthly numeric,       -- náklad na ubytovanie
  transport_monthly numeric,
  -- prepojenie na ubytovaciu agendu (ak sme mu zháňali ubytovanie aj my)
  accommodation_order_id uuid references danubra_orders,
  status text default 'planned',       -- planned|active|ended|cancelled
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_da_subcontract on danubra_assignments(subcontract_id);
create index if not exists idx_da_worker on danubra_assignments(worker_id);
create index if not exists idx_da_status on danubra_assignments(status);

-- ── Odpracované hodiny ──────────────────────────────────────────────────────
-- Oddelená evidencia dielňa vs. stavba je nutná pre pravidlo >50 % (SOKA-BAU)
-- a pre dokumentáciu pracovného času podľa §19 AEntG (do 7 dní).
create table if not exists danubra_timesheets (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references danubra_assignments on delete cascade,
  worker_id uuid references danubra_workers,
  work_date date not null,
  hours numeric not null,
  activity_type text not null default 'construction', -- 'workshop' | 'construction' | 'travel'
  description text,
  approved bool default false,
  approved_at timestamptz,
  invoiced_at timestamptz,             -- už zahrnuté vo faktúre
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dts_assignment on danubra_timesheets(assignment_id);
create index if not exists idx_dts_worker_date on danubra_timesheets(worker_id, work_date);
create index if not exists idx_dts_date on danubra_timesheets(work_date);

-- ── Register compliance položiek (firemné aj per pracovník/zákazka) ─────────
create table if not exists danubra_compliance (
  id uuid primary key default gen_random_uuid(),
  scope text not null,                 -- 'company' | 'worker' | 'subcontract'
  entity_id uuid,                      -- null pre firemné
  kind text not null,                  -- 'freistellung_48b'|'ust_idnr'|'soka_registration'|
                                       -- 'zoll_meldung'|'handwerksrolle'|'a1'|'insurance'|'other'
  reference text,
  valid_from date, valid_to date,
  status text default 'active',        -- active|pending|expiring|expired|not_required
  responsible text,
  file_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dc_scope on danubra_compliance(scope, entity_id);
create index if not exists idx_dc_kind on danubra_compliance(kind);
create index if not exists idx_dc_valid_to on danubra_compliance(valid_to);

-- ── Triggery a RLS ──────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'danubra_workers','danubra_worker_documents','danubra_partners','danubra_subcontracts',
    'danubra_assignments','danubra_timesheets','danubra_compliance'
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

-- ── Číselný rad pre zákazky (ZAK-2026-0001) ─────────────────────────────────
-- Rozšírenie funkcie z migrácie 002 o typ 'subcontract'.
create or replace function danubra_next_number(p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings danubra_settings%rowtype;
  v_series   jsonb;
  v_year     int := extract(year from now() at time zone 'Europe/Bratislava')::int;
  v_current  int;
  v_col      text;
  v_result   text;
begin
  if p_kind not in ('order', 'invoice', 'subcontract') then
    raise exception 'Neznámy typ číselnej rady: %', p_kind;
  end if;

  select * into v_settings from danubra_settings order by created_at limit 1 for update;
  if not found then
    insert into danubra_settings default values returning * into v_settings;
    select * into v_settings from danubra_settings where id = v_settings.id for update;
  end if;

  if p_kind = 'order' then
    v_col := 'order_series'; v_series := v_settings.order_series;
  elsif p_kind = 'invoice' then
    v_col := 'invoice_series'; v_series := v_settings.invoice_series;
  else
    -- zákazky si držíme v samostatnom kľúči vnútri order_series
    v_col := 'subcontract_series'; v_series := v_settings.subcontract_series;
  end if;
  v_series := coalesce(v_series, '{}'::jsonb);

  if coalesce((v_series->>'year')::int, 0) <> v_year then
    v_current := 1;
  else
    v_current := coalesce((v_series->>'current')::int, 0) + 1;
  end if;
  v_series := v_series || jsonb_build_object('year', v_year, 'current', v_current);

  execute format('update danubra_settings set %I = $1, updated_at = now() where id = $2', v_col)
    using v_series, v_settings.id;

  if p_kind = 'order' then
    v_result := 'OBJ-' || v_year || '-' || lpad(v_current::text, 4, '0');
  elsif p_kind = 'invoice' then
    v_result := v_year::text || lpad(v_current::text, 3, '0');
  else
    v_result := 'ZAK-' || v_year || '-' || lpad(v_current::text, 4, '0');
  end if;

  return v_result;
end;
$$;

alter table danubra_settings add column if not exists subcontract_series jsonb default '{}'::jsonb;
alter table danubra_settings add column if not exists staffing jsonb default '{}'::jsonb;

grant execute on function danubra_next_number(text) to authenticated, service_role;

-- ── Predvolené sadzby a limity pre subdodávky ───────────────────────────────
update danubra_settings
set staffing = coalesce(staffing, '{}'::jsonb) || jsonb_build_object(
  'employer_contrib_pct', 36.2,        -- odvody zamestnávateľa SR
  'per_diem_de', 45,                   -- diéty DE €/deň
  'soka_pct', 14.7,                    -- ULAK od 1.7.2026
  'bau_min_lg1', 15.86,                -- Bau-Mindestlohn LG1 €/h
  'bau_min_lg2', 17.34,                -- LG2 od 1.4.2026 (West)
  'general_min_wage', 13.90,           -- všeobecný Mindestlohn od 1.1.2026
  'target_margin_per_worker', 1000,    -- prah, pod ktorý netreba klesnúť
  'dso_alert_days', 45,                -- nad túto splatnosť neškálovať bez faktoringu
  'withholding_pct', 15                -- Bauabzugsteuer bez §48b
)
where staffing is null or not (staffing ? 'per_diem_de');

-- Diagnostika
select 'workers' t, count(*) from danubra_workers
union all select 'partners', count(*) from danubra_partners
union all select 'subcontracts', count(*) from danubra_subcontracts
union all select 'assignments', count(*) from danubra_assignments
union all select 'timesheets', count(*) from danubra_timesheets
union all select 'compliance', count(*) from danubra_compliance;
