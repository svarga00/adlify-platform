-- ============================================================================
-- 089 — Kalendár: udalosti a pripomienky s časom
-- ============================================================================
-- „Niekde by som chcel viditeľne zobraziť, aký je teraz KW, s preklikom do
-- kalendára, ktorý by mohol byť prepojený s poznámkami a úlohami, napr. aj
-- s pripomienkami a udalosťami."
--
--   danubra_events   stretnutie, hovor, obhliadka stavby, termín: deň (aj
--                    viac dní), čas alebo celý deň, miesto, popis, čoho sa
--                    týka (rovnako ako úlohy: entity_type / entity_id /
--                    entity_label), účastníci (id z danubra_members), farba
--                    a pripomienka (koľko minút pred začiatkom).
--   danubra_tasks    due_time — čas úlohy. Úloha s časom je v kalendári
--                    „pripomienka". Pripomienka udalosti je obyčajná úloha
--                    (source 'event', source_key 'event:<id>'), takže je
--                    v Úlohách, na Prehľade dňa aj v odznakoch — bez pushu.
--
-- Všetko ostatné v kalendári (úlohy, poznámky s termínom, ďalší krok pri
-- firme, končiace doklady, zákazky, splatnosť faktúr) sa číta z tabuliek,
-- ktoré už sú. Nič sa nemaže: pribúda tabuľka, jeden stĺpec úloh, politiky
-- a riadok v mapovaní práv. Zmazanie udalosti = archív (066). Idempotentné.
-- ============================================================================


-- ── 1. Udalosti ─────────────────────────────────────────────────────────────
create table if not exists danubra_events (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  kind              text not null default 'meeting' check (kind in ('meeting', 'call', 'site_visit', 'deadline', 'other')),
  starts_on         date not null,
  start_time        time,
  ends_on           date,
  end_time          time,
  all_day           boolean not null default false,
  place             text,
  description       text,
  entity_type       text,
  entity_id         uuid,
  entity_label      text,
  participants      uuid[] not null default '{}',
  remind_minutes    integer check (remind_minutes is null or remind_minutes between 0 and 20160),
  reminder_task_id  uuid references danubra_tasks(id) on delete set null,
  color             text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  archived_at       timestamptz,
  archived_by       uuid,
  constraint danubra_events_end_check check (ends_on is null or ends_on >= starts_on)
);

create index if not exists danubra_events_start_idx on danubra_events (starts_on) where archived_at is null;
create index if not exists danubra_events_end_idx on danubra_events (ends_on) where ends_on is not null and archived_at is null;
create index if not exists danubra_events_entity_idx on danubra_events (entity_type, entity_id) where entity_id is not null;
create index if not exists danubra_events_participants_idx on danubra_events using gin (participants);
create index if not exists danubra_events_archived_idx on danubra_events (archived_at) where archived_at is not null;

drop trigger if exists set_updated_at on danubra_events;
create trigger set_updated_at before update on danubra_events
  for each row execute function danubra_set_updated_at();

comment on table danubra_events is
  'Udalosti v kalendári (089): stretnutia, hovory, obhliadky stavieb, termíny. Pripomienka = úloha v danubra_tasks '
  '(source event, source_key event:<id>, reminder_task_id). Nič sa nemaže — archív (066).';
comment on column danubra_events.kind is 'meeting (stretnutie), call (hovor), site_visit (obhliadka stavby), deadline (termín), other.';
comment on column danubra_events.ends_on is 'Posledný deň viacdňovej udalosti. Prázdne = jednodňová.';
comment on column danubra_events.all_day is 'Celý deň — bez času. Pripomienka sa ráta od 8:00 v deň začiatku.';
comment on column danubra_events.entity_type is 'Čoho sa týka — rovnako ako pri úlohách: lead, partner, subcontract, worker, candidate…';
comment on column danubra_events.participants is 'Účastníci — id z danubra_members. „Len moje" v kalendári = som medzi nimi.';
comment on column danubra_events.remind_minutes is 'Koľko minút pred začiatkom pripomenúť (0 = v čase začiatku). Pripomienka je úloha.';
comment on column danubra_events.reminder_task_id is 'Úloha s pripomienkou (danubra_tasks). Pri zmene udalosti sa upraví, pri zrušení pripomienky zruší.';


-- ── 2. Čas úlohy ────────────────────────────────────────────────────────────
alter table danubra_tasks add column if not exists due_time time;
comment on column danubra_tasks.due_time is
  'Čas úlohy (089). Úloha s časom je v kalendári pripomienka. Prázdne = kedykoľvek v deň termínu.';
create index if not exists idx_dtask_postponed on danubra_tasks (postponed_to) where postponed_to is not null;


-- ── 3. RLS ako pri ostatných tabuľkách (069, 066, 085) ──────────────────────
alter table danubra_events enable row level security;
drop policy if exists danubra_auth_all on danubra_events;
create policy danubra_auth_all on danubra_events
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');
drop policy if exists danubra_members_only on danubra_events;
create policy danubra_members_only on danubra_events as restrictive for all
  using ((select danubra_is_member())) with check ((select danubra_is_member()));
drop policy if exists danubra_hide_archived on danubra_events;
create policy danubra_hide_archived on danubra_events as restrictive for select
  using (archived_at is null);
drop trigger if exists zz_danubra_archive on danubra_events;
create trigger zz_danubra_archive before delete on danubra_events
  for each row execute function danubra_archive_instead_of_delete();
revoke all on danubra_events from anon;


-- ── 4. Práva podľa modulu (072) ─────────────────────────────────────────────
-- Ako úlohy: udalosti vznikajú z každej obrazovky (kontakt s firmou, úloha,
-- zákazka) a kalendár je záložka Prehľadu dňa — smie každý člen.
insert into danubra_table_modules (table_name, read_modules, write_modules, note) values
  ('danubra_events', null, null, 'Udalosti v kalendári (089) — ako úlohy: zapisujú sa z každej obrazovky, kalendár vidí každý člen.')
on conflict (table_name) do update
  set read_modules = excluded.read_modules, write_modules = excluded.write_modules,
      note = excluded.note, updated_at = now();

drop policy if exists danubra_module_read on danubra_events;
drop policy if exists danubra_module_insert on danubra_events;
drop policy if exists danubra_module_update on danubra_events;
drop policy if exists danubra_module_delete on danubra_events;
create policy danubra_module_read on danubra_events as restrictive for select
  using ((select danubra_table_ok('danubra_events', false)));
create policy danubra_module_insert on danubra_events as restrictive for insert
  with check ((select danubra_table_ok('danubra_events', true)));
create policy danubra_module_update on danubra_events as restrictive for update
  using ((select danubra_table_ok('danubra_events', true)))
  with check ((select danubra_table_ok('danubra_events', true)));
create policy danubra_module_delete on danubra_events as restrictive for delete
  using ((select danubra_table_ok('danubra_events', true)));


-- ── Kontrola ────────────────────────────────────────────────────────────────
select
  (select count(*) from danubra_table_modules where table_name = 'danubra_events') as zmapovana_tabulka,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'danubra_events') as politiky,
  (select count(*) from pg_trigger where tgname = 'zz_danubra_archive' and tgrelid = 'public.danubra_events'::regclass) as archiv_namiesto_mazania,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'danubra_tasks' and column_name = 'due_time') as cas_uloh;
