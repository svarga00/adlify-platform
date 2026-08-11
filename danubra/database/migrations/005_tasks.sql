-- ============================================================================
-- DANUBRA Hub — 005 — Úlohy a pripomienky
-- ============================================================================
-- Jednoduchý zoznam úloh naviazateľný na ľubovoľnú entitu (dopyt, objednávku,
-- zákazku, pracovníka, klienta). Denný cron sem môže zakladať pripomienky.
-- Idempotentné.
-- ============================================================================

create table if not exists danubra_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  -- naviazanie na entitu (nepovinné)
  entity_type text,                    -- 'inquiry'|'order'|'subcontract'|'worker'|'client'|'partner'|'invoice'
  entity_id uuid,
  entity_label text,                   -- čitateľný popis, nech netreba dohľadávať
  -- riadenie
  priority text default 'normal',      -- 'low'|'normal'|'high'
  status text not null default 'open', -- 'open'|'in_progress'|'done'|'cancelled'
  due_date date,
  assigned_to uuid references auth.users,
  assigned_name text,                  -- keď priraďujeme menom (2 ľudia vo firme)
  source text default 'manual',        -- 'manual'|'cron'|'system'
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create index if not exists idx_dtask_status on danubra_tasks(status);
create index if not exists idx_dtask_due on danubra_tasks(due_date);
create index if not exists idx_dtask_entity on danubra_tasks(entity_type, entity_id);

drop trigger if exists set_updated_at on danubra_tasks;
create trigger set_updated_at before update on danubra_tasks
  for each row execute function danubra_set_updated_at();

alter table danubra_tasks enable row level security;
drop policy if exists danubra_auth_all on danubra_tasks;
create policy danubra_auth_all on danubra_tasks
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

select count(*) as tasks from danubra_tasks;
