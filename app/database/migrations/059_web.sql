-- ============================================================================
-- 059 — weby punds.sk a punds.eu
-- ============================================================================
-- 1. Inzerát sa dá zverejniť na punds.sk. Polia pre web sú pri inzeráte —
--    ponuka sa píše raz, v appke, a na webe je do pár minút.
-- 2. Prihláška z punds.sk ide do Kandidátov, dopyt z punds.eu do Dopytov;
--    ku každému sa zapíše čas súhlasu so spracovaním údajov.
-- 3. Každé odoslanie formulára z webu sa zapíše (ochrana proti spamu,
--    dohľadanie, čo presne prišlo). Prístup len zo servera.
-- Len pridáva stĺpce a tabuľku, nič nemení ani nemaže.
-- ============================================================================
set lock_timeout = '15s';

alter table danubra_ads
  add column if not exists web_published boolean not null default false,
  add column if not exists web_title text,
  add column if not exists web_slug text,
  add column if not exists web_prof text,
  add column if not exists web_body text,
  add column if not exists rate_max numeric(10,2),
  add column if not exists start_now boolean not null default false,
  add column if not exists duration text,
  add column if not exists hours_week integer,
  add column if not exists rotation text,
  add column if not exists accommodation boolean not null default true,
  add column if not exists headcount integer,
  add column if not exists lat numeric(9,6),
  add column if not exists lng numeric(9,6),
  add column if not exists image_url text,
  add column if not exists duties text[] not null default '{}',
  add column if not exists requirements text[] not null default '{}',
  add column if not exists benefits text[] not null default '{}',
  add column if not exists faq jsonb not null default '[]'::jsonb,
  add column if not exists i18n jsonb not null default '{}'::jsonb,
  add column if not exists published_at timestamptz;

create unique index if not exists danubra_ads_web_slug_uq on danubra_ads (web_slug) where web_slug is not null;
create index if not exists danubra_ads_web_idx on danubra_ads (web_published, active);

alter table danubra_candidates add column if not exists consent_at timestamptz;
alter table danubra_opportunities add column if not exists consent_at timestamptz;

create table if not exists danubra_web_submissions (
  id uuid primary key default gen_random_uuid(),
  site text not null,                 -- 'sk' | 'eu'
  form text not null,                 -- 'apply' | 'contact' | 'enquiry'
  lang text,
  page text,
  payload jsonb not null default '{}'::jsonb,
  ip_hash text,
  user_agent text,
  spam boolean not null default false,
  candidate_id uuid references danubra_candidates(id),
  opportunity_id uuid references danubra_opportunities(id),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists danubra_web_submissions_ip_idx on danubra_web_submissions (ip_hash, created_at desc);
alter table danubra_web_submissions enable row level security;
-- Žiadna politika pre prihlásených: zapisuje a číta len server (service role).
revoke all on danubra_web_submissions from anon, authenticated;

-- Fotky ponúk pre web — verejné (web ich zobrazuje), nahrávať smú len prihlásení.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('punds-web', 'punds-web', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='punds_web_write') then
    create policy punds_web_write on storage.objects for insert to authenticated with check (bucket_id = 'punds-web');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='punds_web_update') then
    create policy punds_web_update on storage.objects for update to authenticated using (bucket_id = 'punds-web');
  end if;
end $$;
