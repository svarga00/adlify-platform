-- ============================================================================
-- DANUBRA Hub — 004 — AI nábor: hovory, súhlasy, zachytené dohody
-- ============================================================================
-- Rieši problém „povedalo sa, ale nezapísalo sa" — sľuby o mzde, ubytovaní
-- a termíne nástupu sa strácajú medzi náborom a nástupom.
--
-- PRÁVNY ZÁKLAD (kritické):
--   Nahrávanie hovoru je zákonné len s výslovným, informovaným a dobrovoľným
--   súhlasom OBOCH strán, udeleným PRED začiatkom hovoru.
--   SR: §377 Trestného zákona + GDPR čl. 6/1a
--   DE: §201 StGB (bez súhlasu trestné) + DSGVO čl. 6/1a
--   Samotné oznámenie „hovor môže byť nahrávaný" nestačí — treba aktívny súhlas.
--
-- Preto je súhlas samostatná tabuľka s dôkazom a možnosťou odvolania,
-- a nahrávka bez potvrdeného súhlasu sa nesmie spracovať.
--
-- Idempotentné.
-- ============================================================================

-- ── Súhlasy so spracovaním ──────────────────────────────────────────────────
create table if not exists danubra_consents (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null,          -- 'worker' | 'client' | 'partner' | 'other'
  subject_id uuid,
  subject_name text,                   -- keď osoba ešte nie je v databáze
  subject_phone text,
  kind text not null default 'call_recording',  -- 'call_recording' | 'data_processing' | 'marketing'
  granted bool not null default false,
  granted_at timestamptz,
  method text,                         -- 'verbal_recorded' | 'sms' | 'email' | 'written' | 'app'
  evidence_url text,                   -- nahrávka súhlasu, podpísaný dokument
  evidence_note text,                  -- napr. presná formulácia, ktorou bol súhlas daný
  language text default 'sk',
  revoked_at timestamptz,              -- odvolanie je právo, musí byť možné
  revoke_reason text,
  retention_until date,                -- dokedy sa smie uchovávať
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dcon_subject on danubra_consents(subject_type, subject_id);
create index if not exists idx_dcon_phone on danubra_consents(subject_phone);
create index if not exists idx_dcon_kind on danubra_consents(kind);

-- ── Nahrávky hovorov a ich spracovanie ──────────────────────────────────────
create table if not exists danubra_call_recordings (
  id uuid primary key default gen_random_uuid(),
  -- s kým sa hovorilo
  subject_type text default 'worker',  -- 'worker' | 'client' | 'partner'
  subject_id uuid,
  subject_name text,
  subject_phone text,
  -- súhlas — bez neho sa nespracúva
  consent_id uuid references danubra_consents,
  consent_confirmed bool not null default false,
  -- samotná nahrávka
  audio_url text,
  duration_seconds int,
  language text default 'sk',
  recorded_at timestamptz default now(),
  -- spracovanie
  status text not null default 'awaiting_consent',
    -- awaiting_consent | uploaded | transcribing | transcribed | extracting
    -- | done | failed | deleted
  transcript text,
  transcript_provider text,            -- 'whisper' | 'deepgram'
  summary text,
  extraction jsonb,                    -- štruktúrované dohody z hovoru
  error text,
  processed_at timestamptz,
  -- retencia (GDPR)
  delete_after date,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dcr_subject on danubra_call_recordings(subject_type, subject_id);
create index if not exists idx_dcr_status on danubra_call_recordings(status);
create index if not exists idx_dcr_recorded on danubra_call_recordings(recorded_at desc);
create index if not exists idx_dcr_delete_after on danubra_call_recordings(delete_after);

-- ── Zachytené dohody a sľuby ────────────────────────────────────────────────
-- Toto je jadro hodnoty: „čo sme sľúbili, to máme zapísané a platí".
create table if not exists danubra_promises (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid references danubra_call_recordings on delete set null,
  subject_type text default 'worker',
  subject_id uuid,
  kind text not null,                  -- 'wage' | 'accommodation' | 'start_date' | 'transport'
                                       -- | 'per_diem' | 'working_hours' | 'equipment' | 'other'
  statement text not null,             -- čo presne bolo sľúbené (citát alebo zhrnutie)
  value_text text,                     -- hodnota v pôvodnom znení (napr. „2000 € hrubého")
  value_number numeric,                -- ak sa dá vyčísliť
  value_date date,                     -- ak ide o termín
  confidence numeric,                  -- istota extrakcie 0–1
  status text not null default 'open', -- open | fulfilled | broken | cancelled | disputed
  due_date date,
  fulfilled_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dpr_subject on danubra_promises(subject_type, subject_id);
create index if not exists idx_dpr_status on danubra_promises(status);
create index if not exists idx_dpr_due on danubra_promises(due_date);
create index if not exists idx_dpr_recording on danubra_promises(recording_id);

-- ── Triggery a RLS ──────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['danubra_consents','danubra_call_recordings','danubra_promises'] loop
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

-- ── Nastavenia AI náboru ────────────────────────────────────────────────────
alter table danubra_settings add column if not exists recruiting jsonb default '{}'::jsonb;

update danubra_settings
set recruiting = coalesce(recruiting, '{}'::jsonb) || jsonb_build_object(
  'retention_days', 180,               -- dokedy sa uchovávajú nahrávky
  'require_consent', true,             -- bez súhlasu sa nespracúva (nemeniť)
  'consent_script_sk',
    'Dobrý deň, volám z DANUBRA. Tento hovor by sme si radi nahrali, aby sme mali '
    'presne zapísané, na čom sa dohodneme — mzda, ubytovanie a termín nástupu. '
    'Nahrávku uchovávame šesť mesiacov a kedykoľvek ju na požiadanie zmažeme. '
    'Súhlasíte s nahrávaním?',
  'consent_script_de',
    'Guten Tag, hier ist DANUBRA. Wir würden dieses Gespräch gerne aufzeichnen, '
    'damit die Vereinbarungen zu Lohn, Unterkunft und Arbeitsbeginn schriftlich '
    'festgehalten sind. Die Aufnahme wird sechs Monate gespeichert und auf Wunsch '
    'jederzeit gelöscht. Sind Sie mit der Aufzeichnung einverstanden?'
)
where recruiting is null or not (recruiting ? 'retention_days');

-- Diagnostika
select 'consents' t, count(*) from danubra_consents
union all select 'recordings', count(*) from danubra_call_recordings
union all select 'promises', count(*) from danubra_promises;
