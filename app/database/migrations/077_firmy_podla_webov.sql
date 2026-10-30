-- ============================================================================
-- 077 — nové firmy podľa webov zadaných firiem
-- ============================================================================
-- „Zadám 3-5-10 URL adries firiem a nájdeš mi podobné, uložíme ich do
-- databázy a budeme ich po jednom oslovovať e-mailom…"
--
-- Hľadanie robí funkcia `danubra-leads-from-urls-background`: z webov
-- zadaných firiem urobí profil (čo robia), nájde podobné nemecké firmy a
-- z ich Impressum vytiahne e-mail, telefón, adresu, USt-IdNr a konateľa.
--
--   danubra_leads           source 'urls' + skóre podobnosti, z ktorého
--                           hľadania firma prišla, konateľ, Impressum,
--                           veľkosť, región, krátky profil, USt-IdNr
--   danubra_lead_searches   seeds — zadané adresy a ich profil
--
-- Nová tabuľka netreba. Nič sa nemaže; stĺpce sa len pridávajú.
-- ============================================================================

-- ── Zdroj firmy: pribúda „urls" (podľa webov zadaných firiem) ───────────────
-- Obmedzenie vzniklo v 057 priamo pri stĺpci, takže má predvolené meno
-- danubra_leads_source_check.
alter table danubra_leads drop constraint if exists danubra_leads_source_check;
alter table danubra_leads add constraint danubra_leads_source_check
  check (source in ('osm', 'ai', 'manual', 'urls'));

-- ── Nové údaje o firme ──────────────────────────────────────────────────────
alter table danubra_leads
  add column if not exists score int,
  add column if not exists seed_search_id uuid references public.danubra_lead_searches(id),
  add column if not exists contact_person text,
  add column if not exists impressum_url text,
  add column if not exists employees text,
  add column if not exists region text,
  add column if not exists profile jsonb,
  add column if not exists vat_id text;

alter table danubra_leads drop constraint if exists danubra_leads_score_range;
alter table danubra_leads add constraint danubra_leads_score_range
  check (score is null or (score between 0 and 100));

comment on column danubra_leads.score is
  'Podobnosť so zadanými firmami 0–100 (odhad AI). Len pri source = urls.';
comment on column danubra_leads.seed_search_id is
  'Z ktorého hľadania (danubra_lead_searches) firma prišla.';
comment on column danubra_leads.contact_person is
  'Konateľ / Geschäftsführer / Inhaber z Impressum.';
comment on column danubra_leads.impressum_url is
  'Stránka Impressum, z ktorej sú kontakty.';
comment on column danubra_leads.employees is
  'Odhad veľkosti firmy (napr. „20–50"), len orientačne.';
comment on column danubra_leads.region is
  'Spolková krajina alebo región (napr. Bayern).';
comment on column danubra_leads.profile is
  'Krátky profil od AI: summary, similar_to_url, email_source (impressum | web | ai), email_kind.';
comment on column danubra_leads.vat_id is
  'USt-IdNr z Impressum (DE + 9 číslic), ak ju firma uvádza.';

create index if not exists danubra_leads_seed_search_idx
  on public.danubra_leads (seed_search_id) where seed_search_id is not null;

-- ── Hľadanie: zadané adresy a ich profil ────────────────────────────────────
alter table danubra_lead_searches
  add column if not exists seeds jsonb;

comment on column danubra_lead_searches.seeds is
  'Hľadanie podľa webov (kind = urls): zadané adresy, či sa dali stiahnuť a profil firmy od AI.';

-- ── Anonymný prístup k funkciám (069 §8, 071, 074) ──────────────────────────
-- Táto migrácia žiadnu funkciu nezakladá ani nemení, takže nie je komu
-- odobrať `anon`. Zámerne tu nie je hromadný cyklus cez všetky danubra_*
-- funkcie: 072 dáva anon vedome danubra_can_any a danubra_table_ok (volajú
-- sa z politík) a hromadné odobratie by ich rozbilo. Keď sem pribudne
-- funkcia, pridajte blok podľa 074 s jej menom v zozname.
