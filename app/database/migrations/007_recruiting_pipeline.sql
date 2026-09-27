-- ============================================================================
-- DANUBRA Hub — 007 — Náborová pipeline, checklisty, automatické pripomienky
-- ============================================================================
-- Doplnenie rekrutingovej časti na rozsah, ktorý zvláda PUNDS App, a ďalej:
--   - kandidáti ako samostatná pipeline so zdrojom a časom prvej reakcie
--   - konverzia kandidáta na pracovníka bez straty histórie
--   - podpora SZČO aj zamestnancov (mení sa tým výpočet nákladu)
--   - pre-deployment checklist pred nasadením
--   - ubytovanie a doprava naviazané na zákazku
--   - pripomienky v dvoch úrovniach: ručné a automaticky generované z dátumov
--
-- Idempotentné.
-- ============================================================================

-- ── Kandidáti (náborová pipeline) ───────────────────────────────────────────
create table if not exists danubra_candidates (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text, email text, whatsapp bool default false,
  language text, city text, country text default 'SK',
  profession text,
  skill_level text,                    -- 'werker' | 'fachwerker'
  german_level text,
  driving_licence bool default false,
  own_tools bool default false,
  legal_form text default 'szco',      -- 'szco' (živnostník) | 'employee'
  -- odkiaľ prišiel — kľúčové pre vyhodnotenie kanálov
  source text,                         -- 'meta_ads'|'referral'|'profesia'|'facebook'|'web'|'ine'
  source_detail text,
  referred_by uuid references danubra_workers,
  -- pipeline
  status text not null default 'new',
    -- new | contacted | interview | documents | ready | placed | rejected | lost
  reject_reason text,
  expected_rate numeric,               -- akú sadzbu si predstavuje
  available_from date,
  -- rýchlosť reakcie (pravidlo: ozvať sa do 10 minút)
  received_at timestamptz default now(),
  first_contact_at timestamptz,
  -- po konverzii
  converted_worker_id uuid references danubra_workers,
  converted_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dcand_status on danubra_candidates(status);
create index if not exists idx_dcand_source on danubra_candidates(source);
create index if not exists idx_dcand_received on danubra_candidates(received_at desc);

-- ── Rozšírenie pracovníkov ──────────────────────────────────────────────────
alter table danubra_workers add column if not exists legal_form text default 'employee';
  -- 'employee' = TPP so mzdou a odvodmi | 'szco' = živnostník, fakturuje nám
alter table danubra_workers add column if not exists hourly_cost numeric;
  -- pri SZČO: koľko nám fakturuje za hodinu (namiesto hrubej mzdy a odvodov)
alter table danubra_workers add column if not exists cooperating_since date;
  -- začiatok spolupráce — z toho sa počíta jej dĺžka
alter table danubra_workers add column if not exists candidate_id uuid references danubra_candidates;
alter table danubra_workers add column if not exists regulated_trade bool default false;
  -- regulované remeslo (elektrikár a pod.) → nutné oznámenie Handwerkskammer §9 HwO

comment on column danubra_workers.legal_form is
  'employee = zamestnanec (hrubá mzda + odvody), szco = živnostník (fakturuje hodinovú sadzbu)';

-- ── Pre-deployment checklist ────────────────────────────────────────────────
-- Kroky, ktoré musia byť hotové pred nasadením človeka na zákazku.
create table if not exists danubra_checklist_items (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references danubra_assignments on delete cascade,
  step_order int not null default 0,
  title text not null,
  description text,
  required bool default true,
  done bool default false,
  done_at timestamptz,
  done_by text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dchk_assignment on danubra_checklist_items(assignment_id);
create index if not exists idx_dchk_done on danubra_checklist_items(done);

-- ── Ubytovanie a doprava naviazané na zákazku ───────────────────────────────
-- Na jednu zákazku môže byť viac ubytovaní. Využíva sa tá istá databáza
-- ubytovaní ako v ubytovacej agende — to je hlavná synergia oboch biznisov.
create table if not exists danubra_subcontract_accommodations (
  id uuid primary key default gen_random_uuid(),
  subcontract_id uuid references danubra_subcontracts on delete cascade,
  accommodation_id uuid references danubra_accommodations,
  -- alebo voľne zapísané, ak nie je v databáze
  name text, address text, city text, maps_url text,
  capacity int, occupied int default 0,
  price_monthly numeric,
  date_from date, date_to date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dsa_subcontract on danubra_subcontract_accommodations(subcontract_id);

alter table danubra_subcontracts add column if not exists transport_note text;
alter table danubra_subcontracts add column if not exists transport_provided bool default false;

-- ── Pripomienky: dve úrovne ─────────────────────────────────────────────────
-- Ručné zakladá používateľ, automatické generuje denný cron z dátumových polí
-- (platnosti A1, §48b, koniec pobytu, obnovenie inzerátu…).
alter table danubra_tasks add column if not exists level text default 'manual';
  -- 'manual' | 'auto'
alter table danubra_tasks add column if not exists source_field text;
  -- z ktorého poľa pripomienka vznikla, napr. 'worker_documents.valid_to'
alter table danubra_tasks add column if not exists source_key text;
  -- jednoznačný kľúč pre idempotenciu cronu
alter table danubra_tasks add column if not exists postponed_to date;

create unique index if not exists idx_dtask_source_key
  on danubra_tasks(source_key) where source_key is not null;

-- 'postponed' je štvrtý stav popri open / done / cancelled
comment on column danubra_tasks.status is
  'open | in_progress | done | cancelled | postponed';

-- ── Triggery a RLS pre nové tabuľky ─────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'danubra_candidates','danubra_checklist_items','danubra_subcontract_accommodations'
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

-- ── Predvolený checklist pred nasadením ─────────────────────────────────────
update danubra_settings
set staffing = coalesce(staffing, '{}'::jsonb) || jsonb_build_object(
  'checklist_default', jsonb_build_array(
    jsonb_build_object('title', 'Podpísaná zmluva o dielo', 'required', true,
      'description', 'Werkvertrag s definovaným dielom, nie hodinami.'),
    jsonb_build_object('title', 'Platné A1', 'required', true,
      'description', 'Vystavuje Sociálna poisťovňa do 45 dní, platí najviac 24 mesiacov.'),
    jsonb_build_object('title', 'Doklad totožnosti a kópia', 'required', true,
      'description', null),
    jsonb_build_object('title', 'Freistellungsbescheinigung §48b', 'required', false,
      'description', 'Bez nej odberateľ zrazí 15 % z faktúry.'),
    jsonb_build_object('title', 'Oznámenie Handwerkskammer §9 HwO', 'required', false,
      'description', 'Len pri regulovaných remeslách, napríklad elektrikári.'),
    jsonb_build_object('title', 'Hlásenie Zoll pred začiatkom prác', 'required', false,
      'description', 'Pri stavebných prácach cez meldeportal-mindestlohn.de.'),
    jsonb_build_object('title', 'Zabezpečené ubytovanie', 'required', true,
      'description', 'Adresa, kontakt a spôsob prevzatia kľúčov.'),
    jsonb_build_object('title', 'Vyriešená doprava na miesto', 'required', true,
      'description', null),
    jsonb_build_object('title', 'Odovzdané pokyny pracovníkovi', 'required', true,
      'description', 'Adresa, kontakt na predáka, čas nástupu, čo si priniesť.')
  )
)
where staffing is null or not (staffing ? 'checklist_default');

-- ── Zdroje kandidátov pre vyhodnocovanie kanálov ────────────────────────────
update danubra_settings
set recruiting = coalesce(recruiting, '{}'::jsonb) || jsonb_build_object(
  'response_target_minutes', 10,       -- ozvať sa kandidátovi do 10 minút
  'sources', jsonb_build_array('referral','meta_ads','profesia','facebook','web','ine')
)
where recruiting is null or not (recruiting ? 'response_target_minutes');

select 'kandidáti' t, count(*) from danubra_candidates
union all select 'checklist položky', count(*) from danubra_checklist_items
union all select 'ubytovanie na zákazkách', count(*) from danubra_subcontract_accommodations;
