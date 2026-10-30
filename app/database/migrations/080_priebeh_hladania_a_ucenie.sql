-- ============================================================================
-- 080 — priebeh hľadania firiem, zastavenie a učenie z hodnotení
-- ============================================================================
-- „Šlo by niekde spraviť aj progress bar, kde by sa zobrazovalo, ako hľadanie
-- prebieha? Medzitým by sa AI mohla aj učiť a dať odporúčania na podobné
-- firmy a našepkávať vyhľadávanie."
--
--   danubra_lead_searches   priebeh: percentá (0–100), kľúč kroku, veta pre
--                           človeka, posledných ~50 udalostí (log), žiadosť
--                           o zastavenie, kedy hľadanie začalo a kedy sa
--                           naposledy ozvalo (heartbeat). Nový stav
--                           'cancelled' (zastavené človekom).
--   danubra_leads           hodnotenie palcom: 1 = relevantná, -1 = nie,
--                           0/null = nehodnotená; krátky dôvod, kedy a kto.
--                           Hľadanie z hodnotení berie príklady do promptu
--                           („podobné ako dobré, nie ako zlé").
--
-- Funkcia `danubra-leads-from-urls-background` zapisuje priebeh najviac raz
-- za ~1,5 s a pri každom kroku sa pozrie na cancel_requested. Appka ho číta
-- každé 2 s. Bez tejto migrácie hľadanie beží ako doteraz, len bez priebehu
-- (zápis priebehu sa po prvej chybe „stĺpec nie je" vypne).
--
-- Nič sa nemaže; stĺpce sa len pridávajú. Žiadna nová funkcia v databáze.
-- ============================================================================

-- ── Hľadanie: priebeh a zastavenie ──────────────────────────────────────────
alter table danubra_lead_searches
  add column if not exists progress int,
  add column if not exists stage text,
  add column if not exists stage_label text,
  add column if not exists log jsonb,
  add column if not exists cancel_requested boolean not null default false,
  add column if not exists started_at timestamptz,
  add column if not exists heartbeat_at timestamptz;

alter table danubra_lead_searches drop constraint if exists danubra_lead_searches_progress_range;
alter table danubra_lead_searches add constraint danubra_lead_searches_progress_range
  check (progress is null or (progress between 0 and 100));

-- Stav: pribúda 'cancelled'. Obmedzenie vzniklo v 057 priamo pri stĺpci,
-- takže má predvolené meno danubra_lead_searches_status_check.
alter table danubra_lead_searches drop constraint if exists danubra_lead_searches_status_check;
alter table danubra_lead_searches add constraint danubra_lead_searches_status_check
  check (status in ('pending', 'running', 'done', 'error', 'cancelled'));

comment on column danubra_lead_searches.progress is
  'Priebeh hľadania 0–100 % (zapisuje funkcia na pozadí najviac raz za ~1,5 s).';
comment on column danubra_lead_searches.stage is
  'Kľúč kroku: read_seeds, plan, maps, filter, impressum, score, contacts, save, done (pozri app/lib/marketing/progress.js).';
comment on column danubra_lead_searches.stage_label is
  'Veta pre človeka, čo hľadanie práve robí (napr. „Overujem Impressum 12 z 40").';
comment on column danubra_lead_searches.log is
  'Posledných ~50 udalostí hľadania: [{ at, text }].';
comment on column danubra_lead_searches.cancel_requested is
  'Človek klikol „Zastaviť". Funkcia skončí pri najbližšom kroku, uloží hotové a dá stav cancelled.';
comment on column danubra_lead_searches.started_at is
  'Kedy funkcia na pozadí hľadanie naozaj začala (created_at = kedy ho appka založila).';
comment on column danubra_lead_searches.heartbeat_at is
  'Kedy sa funkcia naposledy ozvala. Beží a je to dlhšie ako 3 min → appka ukáže „hľadanie sa zrejme prerušilo".';

-- ── Firmy: hodnotenie palcom (AI sa z neho učí) ─────────────────────────────
alter table danubra_leads
  add column if not exists relevance smallint,
  add column if not exists relevance_note text,
  add column if not exists relevance_at timestamptz,
  add column if not exists relevance_by uuid;

alter table danubra_leads drop constraint if exists danubra_leads_relevance_range;
alter table danubra_leads add constraint danubra_leads_relevance_range
  check (relevance is null or relevance in (-1, 0, 1));

comment on column danubra_leads.relevance is
  'Hodnotenie človekom: 1 = relevantná (palec hore), -1 = nerelevantná (palec dole), 0 alebo null = nehodnotená.';
comment on column danubra_leads.relevance_note is
  'Krátky dôvod pri palci dole (napr. „príliš malá", „iný odbor", „dodávateľ materiálu" alebo vlastný text).';
comment on column danubra_leads.relevance_at is
  'Kedy firmu niekto ohodnotil.';
comment on column danubra_leads.relevance_by is
  'Kto firmu ohodnotil (auth.users.id).';

-- Hľadanie berie najnovšie hodnotené firmy ako príklady.
create index if not exists danubra_leads_relevance_idx
  on public.danubra_leads (relevance, relevance_at desc) where relevance is not null and relevance <> 0;

-- ── Anonymný prístup k funkciám (069 §8, 074, 077, 079) ─────────────────────
-- Táto migrácia žiadnu funkciu nezakladá ani nemení, takže nie je komu
-- odobrať `anon`. Práva k stĺpcom sa dedia z tabuliek (RLS z 057/072/074).

-- ── Kontrola ────────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns where table_name = 'danubra_lead_searches'
     and column_name in ('progress', 'stage', 'stage_label', 'log', 'cancel_requested', 'started_at', 'heartbeat_at')) as nove_stlpce_hladania,
  (select count(*) from information_schema.columns where table_name = 'danubra_leads'
     and column_name in ('relevance', 'relevance_note', 'relevance_at', 'relevance_by')) as nove_stlpce_firiem;
