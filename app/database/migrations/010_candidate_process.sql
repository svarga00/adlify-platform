-- ============================================================================
-- DANUBRA Hub — 010 — Náborový proces kandidáta v šiestich krokoch
-- ============================================================================
-- Digitalizácia postupu od prvého kontaktu po prvý týždeň na stavbe:
--   K1 prvý kontakt · K2 telefonický pohovor · K3 overenie · K4 ponuka
--   K5 pred nástupom · K6 prvý týždeň · plus červené vlajky
--
-- Kroky a otázky sú konštanta v kóde (danubra/lib/recruiting/process.js),
-- nie v databáze — verzujú sa cez git spolu s aplikáciou. V databáze je len
-- to, čo je zaškrtnuté, kým a kedy.
--
-- Poznámky sú append-only. Nikdy sa neprepisujú, každá zmena je nový záznam —
-- rovnaký princíp ako pri predlžovaní pobytu. Kto čo sľúbil, sa musí dať
-- dohľadať aj o pol roka.
--
-- Idempotentné.
-- ============================================================================

-- ── Rozšírenie kandidáta ────────────────────────────────────────────────────
alter table danubra_candidates add column if not exists type text not null default 'individual';
alter table danubra_candidates add column if not exists crew_size integer;
alter table danubra_candidates add column if not exists german_speaker boolean;
alter table danubra_candidates add column if not exists has_car boolean;
alter table danubra_candidates add column if not exists trade_license_status text;
alter table danubra_candidates add column if not exists expected_start date;
alter table danubra_candidates add column if not exists outcome text;
alter table danubra_candidates add column if not exists outcome_reason text;
-- Nastúpený človek ide na zákazku (Werkvertrag), nie na ubytovaciu objednávku.
alter table danubra_candidates add column if not exists subcontract_id uuid references danubra_subcontracts;

do $$
begin
  alter table danubra_candidates add constraint danubra_cand_type_chk
    check (type in ('individual','crew'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table danubra_candidates add constraint danubra_cand_license_chk
    check (trade_license_status is null or trade_license_status in ('active','willing','none'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table danubra_candidates add constraint danubra_cand_outcome_chk
    check (outcome is null or outcome in ('hired','rejected'));
exception when duplicate_object then null;
end $$;

-- Nastúpený musí byť naviazaný na zákazku — inak nie je kam ho zapísať.
do $$
begin
  alter table danubra_candidates add constraint danubra_cand_hired_needs_subcontract
    check (outcome is distinct from 'hired' or subcontract_id is not null);
exception when duplicate_object then null;
end $$;

comment on column danubra_candidates.outcome is
  'NULL = kandidát je v procese. hired = nastúpil (vyžaduje subcontract_id), rejected = zamietnutý.';
comment on column danubra_candidates.type is
  'individual = jednotlivec, crew = partia (potom crew_size a otázky K2/15–16).';

create index if not exists idx_dcand_outcome on danubra_candidates(outcome);
create index if not exists idx_dcand_subcontract on danubra_candidates(subcontract_id);

-- ── Zaškrtnuté položky ──────────────────────────────────────────────────────
create table if not exists danubra_candidate_checks (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references danubra_candidates on delete cascade,
  step_key text not null,              -- 'k1'…'k6' | 'flags'
  item_index integer not null,
  checked boolean not null default false,
  checked_by uuid references auth.users,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, step_key, item_index)
);
create index if not exists idx_dcc_candidate on danubra_candidate_checks(candidate_id);
create index if not exists idx_dcc_step on danubra_candidate_checks(candidate_id, step_key);

comment on table danubra_candidate_checks is
  'Kto čo overil. checked_by a checked_at sa zapisujú pri každom zaškrtnutí.';

-- ── Poznámky ku krokom (append-only) ────────────────────────────────────────
create table if not exists danubra_candidate_notes (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references danubra_candidates on delete cascade,
  step_key text not null,
  body text not null,
  created_by uuid references auth.users,
  author_name text,                    -- meno prepísané pri zápise, nech sa nedohľadáva
  created_at timestamptz not null default now()
);
create index if not exists idx_dcn_candidate on danubra_candidate_notes(candidate_id, created_at desc);

comment on table danubra_candidate_notes is
  'Append-only. Poznámka sa nikdy neupravuje ani nemaže — oprava je nový záznam.';

-- ── Triggery a RLS ──────────────────────────────────────────────────────────
drop trigger if exists set_updated_at on danubra_candidate_checks;
create trigger set_updated_at before update on danubra_candidate_checks
  for each row execute function danubra_set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['danubra_candidate_checks','danubra_candidate_notes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists danubra_auth_all on %I', t);
    execute format($p$create policy danubra_auth_all on %I
      for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
      with check (auth.role() = 'authenticated' or auth.role() = 'service_role')$p$, t);
  end loop;
end $$;

-- Poznámka sa nesmie zmeniť ani zmazať — audit by stratil zmysel.
drop policy if exists danubra_auth_all on danubra_candidate_notes;
create policy danubra_notes_read on danubra_candidate_notes
  for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');
create policy danubra_notes_insert on danubra_candidate_notes
  for insert with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- ── Zosúladenie s existujúcou pipeline ──────────────────────────────────────
-- Kandidáti vznikli skôr než tento proces; doplň im typ a odvoď outcome
-- z doterajšieho stavu, nech zoznam nezačína prázdny.
update danubra_candidates set type = 'individual' where type is null;
update danubra_candidates set outcome = 'rejected'
  where outcome is null and status = 'rejected';

-- ── Vzorové dáta ────────────────────────────────────────────────────────────
-- Partia, ktorá vyzerá dobre v K1, ale v K3 sa jej rozsypú referencie.
do $$
declare
  c_parta uuid;
  d date := current_date;
begin
  if exists (select 1 from danubra_candidates where full_name = 'Parta Kubiš — 3 ľudia') then
    return;
  end if;

  insert into danubra_candidates
    (full_name, type, crew_size, phone, email, whatsapp, language, city, country,
     profession, skill_level, german_level, german_speaker, has_car,
     trade_license_status, legal_form, source, source_detail, status,
     expected_rate, expected_start, available_from, received_at, first_contact_at, notes)
  values ('Parta Kubiš — 3 ľudia', 'crew', 3, '+421907334455', null, true, 'sk',
          'Bardejov', 'SK', 'trockenbau', 'fachwerker', 'zaklad', true, true,
          'willing', 'szco', 'facebook', 'skupina Práca v Nemecku', 'interview',
          19, d + 30, d + 30, now() - interval '5 days',
          now() - interval '5 days' + interval '12 minutes',
          'Traja, robia spolu štyri roky. Vedúci Kubiš, po nemecky vie základ.')
  returning id into c_parta;

  -- K1 celý hotový, K2 rozrobený
  insert into danubra_candidate_checks (candidate_id, step_key, item_index, checked, checked_at)
  select c_parta, 'k1', i, true, now() - interval '5 days' from generate_series(0, 5) i;

  insert into danubra_candidate_checks (candidate_id, step_key, item_index, checked, checked_at)
  select c_parta, 'k2', i, true, now() - interval '4 days' from generate_series(0, 9) i;

  -- Overenie viazne — chýbajú fotky aj referencia
  insert into danubra_candidate_checks (candidate_id, step_key, item_index, checked, checked_at)
  values (c_parta, 'k3', 2, true, now() - interval '2 days');

  -- Dve červené vlajky
  insert into danubra_candidate_checks (candidate_id, step_key, item_index, checked, checked_at)
  values (c_parta, 'flags', 0, true, now() - interval '2 days'),
         (c_parta, 'flags', 1, true, now() - interval '2 days');

  insert into danubra_candidate_notes (candidate_id, step_key, body, author_name, created_at)
  values
    (c_parta, 'k1', 'Traja, robia spolu štyri roky. Sadrokartón a maľby. '
       || 'Živnosť má zatiaľ len vedúci, ostatní si ju vraj založia do dvoch týždňov.',
     'Štefan', now() - interval '5 days'),
    (c_parta, 'k2', 'Naposledy robili v Rakúsku, pol roka. Vedúci vie opísať konkrétnu '
       || 'rekonštrukciu aj svoju úlohu. Náradie majú vlastné vrátane lasera.',
     'Štefan', now() - interval '4 days'),
    (c_parta, 'k3', 'Fotky sľúbili tretí deň po sebe, stále nič. Bývalý objednávateľ '
       || 'v Rakúsku nedvíha. Pýtali sa na preplatenie cesty vopred — pozor.',
     'Štefan', now() - interval '2 days');
end $$;

-- Diagnostika
select 'kandidáti' t, count(*) c from danubra_candidates
union all select '  z toho partie', count(*) from danubra_candidates where type = 'crew'
union all select '  v procese', count(*) from danubra_candidates where outcome is null
union all select 'zaškrtnuté položky', count(*) from danubra_candidate_checks where checked
union all select '  z toho vlajky', count(*) from danubra_candidate_checks where checked and step_key = 'flags'
union all select 'poznámky', count(*) from danubra_candidate_notes;
