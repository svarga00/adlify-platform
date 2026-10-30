-- ============================================================================
-- 079 — nové firmy z Google Máp (Outscraper) a aktuálnosť údajov
-- ============================================================================
-- „Ako to hľadá? Už sme také riešili cez Outscraper… chcem, aby bolo všetko
-- relevantné a aktuálne."
--
-- Hľadanie podľa webov (`danubra-leads-from-urls-background`) berie firmy
-- z Google Máp cez Outscraper API, keď je v Netlify OUTSCRAPER_API_KEY.
-- Bez kľúča hľadá ako doteraz cez AI s web search.
--
-- Aktuálnosť: `danubra-leads-refresh-background` raz týždenne (z denného
-- cronu) a na tlačidlo „Overiť znova" overí, či firma na Mapách stále
-- funguje, či jej web odpovedá a či doména e-mailu má poštový server (MX).
--
--   danubra_leads           source 'outscraper', google_place_id (jedinečné),
--                           hodnotenie a počet recenzií, stav na Mapách,
--                           kategórie, kedy overené, kedy zatvorená, či web
--                           funguje, či má e-mail MX, odkiaľ ktorý údaj je
--   danubra_lead_searches   source ('outscraper' | 'ai') a stats (koľko
--                           vrátil Outscraper, koľko vyradené a prečo, koľko
--                           uložené, odhad spotreby záznamov)
--
-- Nič sa nemaže; stĺpce sa len pridávajú. Žiadna nová funkcia v databáze.
-- ============================================================================

-- ── Zdroj firmy: pribúda „outscraper" (Google Mapy) ─────────────────────────
alter table danubra_leads drop constraint if exists danubra_leads_source_check;
alter table danubra_leads add constraint danubra_leads_source_check
  check (source in ('osm', 'ai', 'manual', 'urls', 'outscraper'));

-- ── Údaje z Google Máp a overenie ───────────────────────────────────────────
alter table danubra_leads
  add column if not exists google_place_id text,
  add column if not exists rating numeric,
  add column if not exists reviews_count int,
  add column if not exists business_status text,
  add column if not exists categories jsonb,
  add column if not exists verified_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists web_ok boolean,
  add column if not exists email_mx_ok boolean,
  add column if not exists data_source jsonb;

alter table danubra_leads drop constraint if exists danubra_leads_rating_range;
alter table danubra_leads add constraint danubra_leads_rating_range
  check (rating is null or (rating >= 0 and rating <= 5));
alter table danubra_leads drop constraint if exists danubra_leads_reviews_nonneg;
alter table danubra_leads add constraint danubra_leads_reviews_nonneg
  check (reviews_count is null or reviews_count >= 0);
alter table danubra_leads drop constraint if exists danubra_leads_business_status_check;
alter table danubra_leads add constraint danubra_leads_business_status_check
  check (business_status is null or business_status in ('OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY'));

-- Jedna firma z Máp = jeden riadok. Zámerne aj s archivovanými: firmu, ktorú
-- sme už mali, hľadanie nesmie založiť znova (rovnako ako dedup podľa domény).
create unique index if not exists danubra_leads_google_place_uidx
  on public.danubra_leads (google_place_id) where google_place_id is not null;

-- Overovanie berie najdlhšie neoverené firmy.
create index if not exists danubra_leads_verified_idx
  on public.danubra_leads (verified_at nulls first) where archived_at is null;

comment on column danubra_leads.google_place_id is
  'Google Maps place_id (prípadne google_id) z Outscraperu. Jedinečné — tá istá firma sa neuloží dvakrát.';
comment on column danubra_leads.rating is
  'Hodnotenie na Google Mapách 0–5 (pri poslednom overení).';
comment on column danubra_leads.reviews_count is
  'Počet recenzií na Google Mapách (pri poslednom overení).';
comment on column danubra_leads.business_status is
  'Stav na Google Mapách: OPERATIONAL (funguje), CLOSED_TEMPORARILY (dočasne zatvorená), CLOSED_PERMANENTLY (zatvorená).';
comment on column danubra_leads.categories is
  'Kategórie z Google Máp (pole textov, napr. ["Trockenbauunternehmen", "Bauunternehmen"]).';
comment on column danubra_leads.verified_at is
  'Kedy sme naposledy overili na Google Mapách, že firma existuje a údaje sedia.';
comment on column danubra_leads.closed_at is
  'Kedy sme zistili, že je firma natrvalo zatvorená. Takú firmu appka neosloví (outreach-send ju odmietne). Stav firmy sa nemení.';
comment on column danubra_leads.web_ok is
  'Web firmy pri poslednej kontrole odpovedal (true) / neodpovedal (false) / nekontrolované (null).';
comment on column danubra_leads.email_mx_ok is
  'Doména e-mailu má poštový server (MX záznam). false = e-mail sa pravdepodobne nedoručí. Nič sa pri tom neposiela.';
comment on column danubra_leads.data_source is
  'Odkiaľ ktorý údaj je: maps (Google Mapy), impressum (web firmy), outscraper_contacts; dotaz, odkaz na Mapy, kedy overené.';

-- ── Hľadanie: odkiaľ firmy prišli a počty ───────────────────────────────────
alter table danubra_lead_searches
  add column if not exists source text,
  add column if not exists stats jsonb;

alter table danubra_lead_searches drop constraint if exists danubra_lead_searches_source_check;
alter table danubra_lead_searches add constraint danubra_lead_searches_source_check
  check (source is null or source in ('outscraper', 'ai'));

comment on column danubra_lead_searches.source is
  'Odkiaľ hľadanie bralo firmy: outscraper (Google Mapy) alebo ai (Claude web search, keď chýba OUTSCRAPER_API_KEY).';
comment on column danubra_lead_searches.stats is
  'Počty: dotazy, koľko vrátil Outscraper (= odhad účtovaných záznamov), vyradené podľa dôvodu, nízke skóre, uložené.';

-- ── Anonymný prístup k funkciám (069 §8, 074, 077) ──────────────────────────
-- Táto migrácia žiadnu funkciu nezakladá ani nemení, takže nie je komu
-- odobrať `anon`. Práva k stĺpcom sa dedia z tabuliek (RLS z 057/072/074).

-- ── Kontrola ────────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns where table_name = 'danubra_leads'
     and column_name in ('google_place_id', 'rating', 'reviews_count', 'business_status', 'categories',
                         'verified_at', 'closed_at', 'web_ok', 'email_mx_ok', 'data_source')) as nove_stlpce_firiem,
  (select count(*) from information_schema.columns where table_name = 'danubra_lead_searches'
     and column_name in ('source', 'stats')) as nove_stlpce_hladania;
