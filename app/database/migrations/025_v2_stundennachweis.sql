-- ============================================================================
-- DANUBRA v2 — Stundennachweis (týždenný výkaz pre odberateľa)
-- ============================================================================
-- Papier, ktorý na stavbe podpisuje Kunde a ktorý je podkladom k faktúre.
-- Jeden týždeň, jedna partia.
--
-- Hodiny zostávajú v `danubra_timesheets`. Výkaz je pohľad na ne, nie druhé
-- miesto, kde sa píšu — inak by sa to rozišlo a podpísaný papier by tvrdil
-- niečo iné než faktúra.
--
-- Aplikované v produkcii ako 025 + 025b (crew_id doplnené ako povinné:
-- s prázdnym by unikátnosť neplatila a ten istý týždeň by sa dal odovzdať
-- dvakrát).
-- ============================================================================
alter table danubra_timesheets add column if not exists time_from time;
alter table danubra_timesheets add column if not exists time_to time;

comment on column danubra_timesheets.time_from is
  'Od kedy sa v ten deň robilo. Nepovinné — na faktúru stačí počet hodín, '
  'ale Stundennachweis má riadok „von – bis" a odberateľ ho chce vidieť.';

create table if not exists danubra_hour_sheets (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references danubra_crews,
  subcontract_id uuid references danubra_subcontracts,
  iso_year int not null,
  iso_week int not null,
  snapshot jsonb,
  total_hours numeric,
  signed_at timestamptz,
  signed_by_name text,
  storage_path text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users,
  constraint danubra_hour_sheets_week check (iso_week between 1 and 53),
  unique (crew_id, iso_year, iso_week)
);

create index if not exists idx_dhs_week on danubra_hour_sheets(iso_year, iso_week);
create index if not exists idx_dhs_sub on danubra_hour_sheets(subcontract_id);

comment on table danubra_hour_sheets is
  'Odovzdané týždenné výkazy (Stundennachweis). Jeden týždeň, jedna partia.';
comment on column danubra_hour_sheets.snapshot is
  'Obsah papiera v čase podpisu. Neskoršia oprava hodín ho neprepíše — '
  'Kunde podpísal to, čo tam vtedy bolo.';

create or replace function danubra_hour_sheet_frozen()
returns trigger language plpgsql as $$
begin
  if old.signed_at is not null then
    if new.snapshot is distinct from old.snapshot
       or new.total_hours is distinct from old.total_hours
       or new.iso_week is distinct from old.iso_week
       or new.iso_year is distinct from old.iso_year then
      raise exception 'Výkaz je podpísaný (%) — čo bolo na papieri, sa už nemení',
        to_char(old.signed_at, 'DD.MM.YYYY');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists danubra_hour_sheet_frozen on danubra_hour_sheets;
create trigger danubra_hour_sheet_frozen
  before update on danubra_hour_sheets
  for each row execute function danubra_hour_sheet_frozen();

drop trigger if exists set_updated_at on danubra_hour_sheets;
create trigger set_updated_at before update on danubra_hour_sheets
  for each row execute function danubra_set_updated_at();

alter table danubra_hour_sheets enable row level security;
do $$
begin
  drop policy if exists danubra_hour_sheets_read on danubra_hour_sheets;
  drop policy if exists danubra_hour_sheets_write on danubra_hour_sheets;
  drop policy if exists danubra_hour_sheets_update on danubra_hour_sheets;
  create policy danubra_hour_sheets_read on danubra_hour_sheets
    for select using (auth.role() = 'authenticated');
  create policy danubra_hour_sheets_write on danubra_hour_sheets
    for insert with check (auth.role() = 'authenticated');
  create policy danubra_hour_sheets_update on danubra_hour_sheets
    for update using (auth.role() = 'authenticated');
end $$;
