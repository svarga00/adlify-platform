-- ============================================================================
-- 063 — balík pre živnostníka a kontaktná osoba pri nasadení
-- ============================================================================
-- „Aby nedostal 5 mailov zvlášť o ubytovaní, stavbe, infolist, vzor faktúry…"
-- Balík = jedna správa (e-mail, WhatsApp alebo SMS) so všetkými papiermi na
-- nástup. E-mail ich má ako prílohy; WhatsApp a SMS jeden krátky odkaz
-- {web}/b/<token>, kde sú všetky PDF naraz. Odkaz platí 30 dní a dá sa zrušiť.
-- Stránku s odkazom skladá serverová funkcia (service role) — bez prihlásenia,
-- len s tokenom, a len dokumenty, ktoré sú v balíku.
--
-- Kontaktná osoba: keď človek nie je v partii, pri nasadení sa mu dá vybrať
-- kolega zo stavby (contact_worker_id) alebo ručne meno a telefón. Ukáže sa
-- na infoliste a v správe. Nič sa nemaže ani neprepisuje.
-- ============================================================================
set lock_timeout = '15s';

alter table danubra_assignments
  add column if not exists contact_worker_id uuid references danubra_workers(id),
  add column if not exists contact_name text,
  add column if not exists contact_phone text,
  add column if not exists contact_note text;

create table if not exists danubra_bundles (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  worker_id uuid references danubra_workers(id),
  subcontract_id uuid references danubra_subcontracts(id),
  assignment_id uuid references danubra_assignments(id),
  title text,
  items jsonb not null default '[]'::jsonb,      -- [{ archive_id, title, kind }]
  message text,
  channels text[] not null default '{}',
  lang text not null default 'sk',
  expires_at timestamptz not null default now() + interval '30 days',
  revoked_at timestamptz,
  opened_at timestamptz,
  open_count integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id)
);
create index if not exists danubra_bundles_worker on danubra_bundles(worker_id, created_at desc);
alter table danubra_bundles enable row level security;
create policy danubra_bundles_read on danubra_bundles for select using (auth.role() = 'authenticated');
create policy danubra_bundles_ins on danubra_bundles for insert with check (auth.role() = 'authenticated');
create policy danubra_bundles_upd on danubra_bundles for update using (auth.role() = 'authenticated');
