-- ============================================================================
-- 085 — Odkazy od kolegov (bojová úloha)
-- ============================================================================
-- „Potrebujem formulár, kde kolegovia aj bez prihlásenia pridajú odkazy na
-- firmy, a v appke sa to zbiera — v Oslovovaní ako ‚Odkazy od kolegov'."
--
--   danubra_lead_tips   jeden riadok = jedna firma od kolegu z verejného
--                       formulára app/odkazy.html: názov, odkaz (web, Mapy
--                       alebo profil — nepovinný), mesto, vzťah (spolupracovali
--                       sme / robilo sa u Denisa / len relevantná), čo sme
--                       spolu robili, kto bol kontakt, „nie som si istý",
--                       kto poslal; stav (nový, pridaný, duplicita,
--                       zamietnutý), odkaz na firmu v Nových firmách alebo na
--                       to, čo už máme, a čo sa o firme zistilo z jej webu
--                       (meta: titulok, logo, e-mail, telefón, adresa, konateľ).
--   danubra_leads       source 'kolega', source_tip_id (z ktorého odkazu),
--                       tip_by (kto poslal — „Tip od: Jano, 31. 10.")
--
-- Zapisuje verejná funkcia danubra-lead-tip (service role, overí tajný kľúč
-- z danubra_settings.marketing.tips, pascu na roboty a limit z jednej siete;
-- IP sa neukladá, len jej odtlačok HMAC) a funkcia na pozadí
-- danubra-lead-tips-enrich-background (web firmy + Impressum). Anonym do
-- tabuľky nesmie nič — formulár ide výhradne cez server. Appka číta
-- a spracúva (Marketing).
--
-- Nič sa nemaže: pribúda tabuľka, dva stĺpce firiem, politiky a riadok
-- v mapovaní práv. Zmazanie = archív (066). Idempotentné.
-- ============================================================================


-- ── 1. Odkazy od kolegov ────────────────────────────────────────────────────
create table if not exists danubra_lead_tips (
  id                       uuid primary key default gen_random_uuid(),
  batch_id                 uuid,
  company_name             text not null,
  url                      text,
  kind                     text not null default 'none' check (kind in ('web', 'maps', 'profile', 'none')),
  website                  text,
  domain                   text,
  profile_url              text,
  city                     text,
  relation                 text check (relation is null or relation in ('past_partner', 'via_denis', 'relevant')),
  what_we_did              text,
  contact                  text,
  unsure                   boolean not null default false,
  submitted_by_name        text not null,
  status                   text not null default 'new' check (status in ('new', 'added', 'duplicate', 'rejected')),
  reject_reason            text,
  lead_id                  uuid references danubra_leads(id),
  duplicate_of_lead_id     uuid references danubra_leads(id),
  duplicate_of_partner_id  uuid references danubra_partners(id),
  duplicate_of_tip_id      uuid references danubra_lead_tips(id),
  meta                     jsonb,
  checked_at               timestamptz,
  ip_hash                  text,
  created_at               timestamptz not null default now(),
  reviewed_at              timestamptz,
  reviewed_by              uuid,
  archived_at              timestamptz,
  archived_by              uuid
);

create index if not exists danubra_lead_tips_domain_idx on danubra_lead_tips (domain) where domain is not null;
create index if not exists danubra_lead_tips_name_idx on danubra_lead_tips (lower(company_name));
create index if not exists danubra_lead_tips_status_idx on danubra_lead_tips (status) where archived_at is null;
create index if not exists danubra_lead_tips_created_idx on danubra_lead_tips (created_at desc);
create index if not exists danubra_lead_tips_ip_idx on danubra_lead_tips (ip_hash, created_at) where ip_hash is not null;
create index if not exists danubra_lead_tips_lead_idx on danubra_lead_tips (lead_id) where lead_id is not null;
create index if not exists danubra_lead_tips_unchecked_idx on danubra_lead_tips (created_at) where checked_at is null and website is not null;
create index if not exists danubra_lead_tips_archived_idx on danubra_lead_tips (archived_at) where archived_at is not null;

comment on table danubra_lead_tips is
  'Odkazy od kolegov: firma z verejného formulára app/odkazy.html (bez prihlásenia, tajný kľúč v odkaze). '
  'Zapisuje server danubra-lead-tip, údaje z webu dopĺňa danubra-lead-tips-enrich-background. Nič sa nemaže.';
comment on column danubra_lead_tips.kind is
  'Čo je odkaz: web (web firmy, sťahuje sa úvodná stránka a Impressum), maps (Google/Apple Mapy, OpenStreetMap — '
  'meno a súradnice z adresy), profile (LinkedIn, Facebook, Xing, northdata… — nesťahuje sa), none (bez odkazu).';
comment on column danubra_lead_tips.website is
  'Web firmy (https://firma.de): z odkazu alebo ho doplnil človek v appke („Nájsť web"). Len z neho sa sťahujú údaje.';
comment on column danubra_lead_tips.domain is 'Doména webu firmy bez www (na porovnanie s novými firmami a odberateľmi).';
comment on column danubra_lead_tips.relation is
  'past_partner (spolupracovali sme), via_denis (robilo sa u Denisa), relevant (len relevantná / poznám ich).';
comment on column danubra_lead_tips.status is
  'new (čaká), added (pridaná do Nových firiem, lead_id), duplicate (už ju máme — duplicate_of_*), rejected (zamietnutá, reject_reason).';
comment on column danubra_lead_tips.meta is
  'Čo sa zistilo z webu firmy: title, description, logo, og_image, embeddable, company, email, phone, address, '
  'postal_code, city, konatel, vat_id, impressum_url, final_url, checked, error; pri Mapách name, lat, lng.';
comment on column danubra_lead_tips.ip_hash is
  'HMAC odtlačok IP adresy (IP_HASH_SECRET) — len na limit odoslaní z jednej siete. Samotná IP sa neukladá.';


-- ── 2. Nová firma z odkazu ──────────────────────────────────────────────────
alter table danubra_leads drop constraint if exists danubra_leads_source_check;
alter table danubra_leads add constraint danubra_leads_source_check
  check (source in ('osm', 'ai', 'manual', 'urls', 'outscraper', 'kolega'));

alter table danubra_leads
  add column if not exists source_tip_id uuid references danubra_lead_tips(id),
  add column if not exists tip_by text;

create index if not exists danubra_leads_source_tip_idx on danubra_leads (source_tip_id) where source_tip_id is not null;

comment on column danubra_leads.source_tip_id is 'Z ktorého odkazu od kolegu (danubra_lead_tips) firma vznikla.';
comment on column danubra_leads.tip_by is 'Kto z kolegov firmu poslal (meno z formulára) — „Tip od: Jano, 31. 10.".';


-- ── 3. RLS ako pri ostatných tabuľkách (069, 066, 081) ──────────────────────
alter table danubra_lead_tips enable row level security;
drop policy if exists danubra_auth_all on danubra_lead_tips;
create policy danubra_auth_all on danubra_lead_tips
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');
drop policy if exists danubra_members_only on danubra_lead_tips;
create policy danubra_members_only on danubra_lead_tips as restrictive for all
  using ((select danubra_is_member())) with check ((select danubra_is_member()));
drop policy if exists danubra_hide_archived on danubra_lead_tips;
create policy danubra_hide_archived on danubra_lead_tips as restrictive for select
  using (archived_at is null);
drop trigger if exists zz_danubra_archive on danubra_lead_tips;
create trigger zz_danubra_archive before delete on danubra_lead_tips
  for each row execute function danubra_archive_instead_of_delete();
revoke all on danubra_lead_tips from anon;


-- ── 4. Práva podľa modulu (072) ─────────────────────────────────────────────
insert into danubra_table_modules (table_name, read_modules, write_modules, note) values
  ('danubra_lead_tips', '{marketing}', '{marketing}', 'Odkazy od kolegov z verejného formulára (085). Zapisuje hlavne server danubra-lead-tip.')
on conflict (table_name) do update
  set read_modules = excluded.read_modules, write_modules = excluded.write_modules,
      note = excluded.note, updated_at = now();

drop policy if exists danubra_module_read on danubra_lead_tips;
drop policy if exists danubra_module_insert on danubra_lead_tips;
drop policy if exists danubra_module_update on danubra_lead_tips;
drop policy if exists danubra_module_delete on danubra_lead_tips;
create policy danubra_module_read on danubra_lead_tips as restrictive for select
  using ((select danubra_table_ok('danubra_lead_tips', false)));
create policy danubra_module_insert on danubra_lead_tips as restrictive for insert
  with check ((select danubra_table_ok('danubra_lead_tips', true)));
create policy danubra_module_update on danubra_lead_tips as restrictive for update
  using ((select danubra_table_ok('danubra_lead_tips', true)))
  with check ((select danubra_table_ok('danubra_lead_tips', true)));
create policy danubra_module_delete on danubra_lead_tips as restrictive for delete
  using ((select danubra_table_ok('danubra_lead_tips', true)));


-- ── Kontrola ────────────────────────────────────────────────────────────────
select
  (select count(*) from danubra_table_modules where table_name = 'danubra_lead_tips') as zmapovana_tabulka,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'danubra_lead_tips') as politiky,
  (select count(*) from information_schema.columns where table_name = 'danubra_leads'
     and column_name in ('source_tip_id', 'tip_by')) as nove_stlpce_firiem,
  (select count(*) from pg_trigger where tgname = 'zz_danubra_archive' and not tgisinternal
     and tgrelid = 'danubra_lead_tips'::regclass) as archiv;
