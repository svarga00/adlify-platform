-- ============================================================================
-- 057 — marketing: nové firmy, hľadanie, e-mailové kampane, odhlásenia
-- ============================================================================
-- „Modul marketing, kde budeme robiť rozosielanie e-mailov a hľadanie nových
-- firiem podľa firiem, s ktorými už spolupracujeme."
--
--   danubra_leads            nemecké firmy, ktoré ešte nie sú odberateľmi
--   danubra_lead_searches    hľadanie cez AI na pozadí (stav, koľko našlo)
--   danubra_campaigns        e-mail (predmet, text) a jeho priebeh
--   danubra_campaign_sends   komu konkrétne, stav, kľúč na odhlásenie
--   danubra_email_optout     kto sa odhlásil — tomu už nič nepôjde
--
-- Nič sa nemaže — preto tu nie sú politiky na DELETE.
-- ============================================================================

create table if not exists danubra_leads (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  city            text,
  postal_code     text,
  address         text,
  country         text default 'DE',
  website         text,
  email           text,
  phone           text,
  trade           text,
  why             text,
  source          text not null default 'manual' check (source in ('osm', 'ai', 'manual')),
  source_ref      text,
  similar_to      uuid references public.danubra_partners(id),
  status          text not null default 'new'
                  check (status in ('new', 'contacted', 'replied', 'interested', 'won', 'rejected', 'unsubscribed')),
  notes           text,
  last_contact_at timestamptz,
  partner_id      uuid references public.danubra_partners(id),
  lat             double precision,
  lng             double precision,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid()
);
create unique index if not exists danubra_leads_name_city_uq
  on public.danubra_leads (lower(name), coalesce(lower(city), ''));

create table if not exists danubra_lead_searches (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default 'ai',
  params       jsonb,
  status       text not null default 'pending' check (status in ('pending', 'running', 'done', 'error')),
  found        integer,
  added        integer,
  error        text,
  finished_at  timestamptz,
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid()
);

create table if not exists danubra_campaigns (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  subject       text not null,
  body          text not null,
  lang          text default 'de',
  status        text not null default 'draft' check (status in ('draft', 'sending', 'done', 'paused', 'error')),
  sent_count    integer not null default 0,
  failed_count  integer not null default 0,
  error         text,
  last_run_at   timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid()
);

create table if not exists danubra_campaign_sends (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.danubra_campaigns(id),
  lead_id      uuid references public.danubra_leads(id),
  partner_id   uuid references public.danubra_partners(id),
  email        text not null,
  name         text,
  token        text not null unique,
  status       text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  error        text,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists danubra_campaign_sends_c_idx on public.danubra_campaign_sends (campaign_id, status);

create table if not exists danubra_email_optout (
  email       text primary key,
  source      text,
  created_at  timestamptz not null default now()
);

alter table public.danubra_leads enable row level security;
alter table public.danubra_lead_searches enable row level security;
alter table public.danubra_campaigns enable row level security;
alter table public.danubra_campaign_sends enable row level security;
alter table public.danubra_email_optout enable row level security;

create policy danubra_leads_rw on public.danubra_leads for select using (auth.role() in ('authenticated', 'service_role'));
create policy danubra_leads_ins on public.danubra_leads for insert with check (auth.role() in ('authenticated', 'service_role'));
create policy danubra_leads_upd on public.danubra_leads for update using (auth.role() in ('authenticated', 'service_role'));
create policy danubra_lsearch_r on public.danubra_lead_searches for select using (auth.role() in ('authenticated', 'service_role'));
create policy danubra_lsearch_i on public.danubra_lead_searches for insert with check (auth.role() in ('authenticated', 'service_role'));
create policy danubra_lsearch_u on public.danubra_lead_searches for update using (auth.role() in ('authenticated', 'service_role'));
create policy danubra_camp_r on public.danubra_campaigns for select using (auth.role() in ('authenticated', 'service_role'));
create policy danubra_camp_i on public.danubra_campaigns for insert with check (auth.role() in ('authenticated', 'service_role'));
create policy danubra_camp_u on public.danubra_campaigns for update using (auth.role() in ('authenticated', 'service_role'));
create policy danubra_csend_r on public.danubra_campaign_sends for select using (auth.role() in ('authenticated', 'service_role'));
create policy danubra_csend_i on public.danubra_campaign_sends for insert with check (auth.role() in ('authenticated', 'service_role'));
create policy danubra_csend_u on public.danubra_campaign_sends for update using (auth.role() in ('authenticated', 'service_role'));
create policy danubra_optout_r on public.danubra_email_optout for select using (auth.role() in ('authenticated', 'service_role'));
create policy danubra_optout_i on public.danubra_email_optout for insert with check (auth.role() in ('authenticated', 'service_role'));
