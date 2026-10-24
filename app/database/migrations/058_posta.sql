-- ============================================================================
-- 058 — Pošta: schránky, prístupy, e-maily
-- ============================================================================
-- „Plnohodnotný mailový klient s viacerými schránkami, podpisom atď."
--
--   danubra_mailboxes        schránka (IMAP/SMTP), podpis; heslo ZAŠIFROVANÉ
--                            kľúčom, ktorý je len na serveri (secret_enc)
--   danubra_mailbox_access   kto smie do ktorej schránky
--   danubra_mail_messages    e-maily stiahnuté zo schránok a odoslané z appky
--
-- Heslo sa do prehliadača nikdy nedostane: stĺpec secret_enc nie je čitateľný
-- pre prihláseného používateľa (práva na stĺpce) a schránky zapisuje len
-- serverová funkcia danubra-mail-account.
-- Nič sa nemaže — schránka sa vypne (active=false), e-mail zostáva.
-- ============================================================================

create table if not exists danubra_mailboxes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null,
  display_name  text,
  imap_host     text not null,
  imap_port     integer not null default 993,
  imap_secure   boolean not null default true,
  smtp_host     text not null,
  smtp_port     integer not null default 465,
  smtp_secure   boolean not null default true,
  username      text not null,
  secret_enc    text,
  signature     text,
  sent_folder   text,
  sync_state    jsonb not null default '{}'::jsonb,
  last_sync_at  timestamptz,
  sync_error    text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid()
);

create table if not exists danubra_mailbox_access (
  mailbox_id  uuid not null references public.danubra_mailboxes(id),
  user_id     uuid not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (mailbox_id, user_id)
);

create table if not exists danubra_mail_messages (
  id               uuid primary key default gen_random_uuid(),
  mailbox_id       uuid not null references public.danubra_mailboxes(id),
  folder           text not null,
  uid              bigint,
  message_id       text,
  in_reply_to      text,
  refs             text,
  thread_key       text,
  direction        text not null default 'in' check (direction in ('in', 'out')),
  from_email       text,
  from_name        text,
  to_list          jsonb not null default '[]'::jsonb,
  cc_list          jsonb not null default '[]'::jsonb,
  subject          text,
  sent_at          timestamptz,
  snippet          text,
  text_body        text,
  html_body        text,
  attachments      jsonb not null default '[]'::jsonb,
  seen             boolean not null default false,
  flagged          boolean not null default false,
  worker_id        uuid references public.danubra_workers(id),
  partner_id       uuid references public.danubra_partners(id),
  lead_id          uuid references public.danubra_leads(id),
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid()
);
create unique index if not exists danubra_mail_uid_uq on public.danubra_mail_messages (mailbox_id, folder, uid);
create index if not exists danubra_mail_box_date on public.danubra_mail_messages (mailbox_id, folder, sent_at desc);
create index if not exists danubra_mail_worker on public.danubra_mail_messages (worker_id, sent_at desc);
create index if not exists danubra_mail_partner on public.danubra_mail_messages (partner_id, sent_at desc);

-- Smie aktuálny používateľ do schránky? Admin do všetkých.
create or replace function danubra_mailbox_ok(p_mailbox uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select danubra_is_admin() or exists (
    select 1 from danubra_mailbox_access a
    where a.mailbox_id = p_mailbox and a.user_id = auth.uid() and a.active)
$$;

alter table public.danubra_mailboxes enable row level security;
alter table public.danubra_mailbox_access enable row level security;
alter table public.danubra_mail_messages enable row level security;

-- Schránky: čítať len tie, ku ktorým mám prístup; zapisuje len server.
create policy danubra_mailboxes_r on public.danubra_mailboxes for select
  using (auth.role() = 'service_role' or danubra_mailbox_ok(id));
revoke select on public.danubra_mailboxes from authenticated, anon;
grant select (id, name, email, display_name, imap_host, imap_port, imap_secure, smtp_host, smtp_port,
  smtp_secure, username, signature, sent_folder, last_sync_at, sync_error, active, created_at)
  on public.danubra_mailboxes to authenticated;
revoke insert, update, delete on public.danubra_mailboxes from authenticated, anon;

-- Prístupy: vidí každý prihlásený (kvôli zoznamu), mení admin.
create policy danubra_mbaccess_r on public.danubra_mailbox_access for select
  using (auth.role() in ('authenticated', 'service_role'));
create policy danubra_mbaccess_i on public.danubra_mailbox_access for insert
  with check (danubra_is_admin() or auth.role() = 'service_role');
create policy danubra_mbaccess_u on public.danubra_mailbox_access for update
  using (danubra_is_admin() or auth.role() = 'service_role');

-- E-maily: len zo schránok, ku ktorým mám prístup.
create policy danubra_mail_r on public.danubra_mail_messages for select
  using (auth.role() = 'service_role' or danubra_mailbox_ok(mailbox_id));
create policy danubra_mail_u on public.danubra_mail_messages for update
  using (auth.role() = 'service_role' or danubra_mailbox_ok(mailbox_id));
create policy danubra_mail_i on public.danubra_mail_messages for insert
  with check (auth.role() = 'service_role' or danubra_mailbox_ok(mailbox_id));
