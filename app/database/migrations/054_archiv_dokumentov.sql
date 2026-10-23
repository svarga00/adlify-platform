-- ============================================================================
-- 054 — archív dokumentov
-- ============================================================================
-- Každé PDF, ktoré appka spraví (zmluva, GDPR, objednávka, infolist,
-- Werkvertrag, ponuka, faktúra), sa uloží do privátneho úložiska
-- `danubra-docs` a zapíše sem — k človeku, k firme a k zákazke.
--
-- Nič sa fyzicky nemaže: dokument sa dá len skryť (`archived_at`). Preto
-- tu nie je politika na DELETE.
-- ============================================================================

create table if not exists danubra_archive (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null,
  title          text not null,
  number         text,
  file_name      text not null,
  storage_path   text not null unique,
  size_bytes     integer,
  lang           text check (lang in ('sk', 'de')),
  worker_id      uuid references public.danubra_workers(id),
  partner_id     uuid references public.danubra_partners(id),
  subcontract_id uuid references public.danubra_subcontracts(id),
  sent_at        timestamptz,
  sent_note      text,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid()
);

create index if not exists danubra_archive_worker_idx on public.danubra_archive (worker_id, created_at desc);
create index if not exists danubra_archive_partner_idx on public.danubra_archive (partner_id, created_at desc);
create index if not exists danubra_archive_sub_idx on public.danubra_archive (subcontract_id, created_at desc);

alter table public.danubra_archive enable row level security;

create policy danubra_archive_read on public.danubra_archive for select
  using (auth.role() = 'authenticated' or auth.role() = 'service_role');
create policy danubra_archive_insert on public.danubra_archive for insert
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');
create policy danubra_archive_update on public.danubra_archive for update
  using (auth.role() = 'authenticated' or auth.role() = 'service_role');
