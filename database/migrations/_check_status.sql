-- ============================================
-- 🔍 DIAGNOSTIKA STAVU MIGRÁCIÍ
--
-- Spusti v Supabase SQL Editor. Výsledok ti povie ktoré migrácie ti
-- chýbajú a ktoré features sú broken kým ich nepustíš.
--
-- Žiadne dáta nemení — len číta information_schema / pg_indexes.
-- ============================================

SELECT '=== TABUĽKY ===' AS section;

WITH expected (name, migration, purpose) AS (VALUES
  ('prospects',                       '001', 'Cold outreach targets (lead-finder, audit flow)'),
  ('email_templates',                 '003', 'Šablóny e-mailov (outreach editor)'),
  ('prospect_events',                 '006', 'Tracking otvorení/klikov/audit views'),
  ('tasks',                           '007', 'Úlohy (tab v Klientoch/Leads)'),
  ('outreach_campaigns',              '008', 'Campaign Builder — kampane'),
  ('outreach_campaign_steps',         '008', 'Campaign Builder — kroky sekvencie'),
  ('outreach_campaign_enrollments',   '008', 'Campaign Builder — zaradenie prospectov'),
  ('outreach_groups',                 '009', 'FB/LinkedIn skupiny (bookmarklet)'),
  ('tickets',                         '012', 'Portál — support tickety (loadTickets/submitTicket)'),
  ('documents',                       '012', 'Portál — dokumenty klienta (loadDocuments)'),
  ('campaign_projects',               '012', 'Portál — projekty klienta (loadProjects)'),
  ('reports',                         '013', 'Portál — PDF/PPTX reporty archív (loadReports)')
)
SELECT
  e.migration,
  e.name AS table_name,
  CASE WHEN t.table_name IS NULL THEN '❌ CHÝBA' ELSE '✅ OK' END AS status,
  e.purpose
FROM expected e
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = e.name
ORDER BY e.migration, e.name;

SELECT '=== STĹPCE NA `leads` ===' AS section;

WITH expected_cols (col, migration, purpose) AS (VALUES
  ('email',                       '010', 'kontaktný email lead-u'),
  ('phone',                       '010', 'telefón lead-u'),
  ('logo_url',                    '010', 'logo firmy'),
  ('industry',                    '010', 'odvetvie'),
  ('source_query',                '010', 'po čom bola firma nájdená (scraper)'),
  ('contacted_at',                '010', 'kedy bol lead kontaktovaný'),
  ('outreach_stage',              '001', 'fáza outreach pipeline'),
  ('audit_token',                 '001', 'unikátny token pre audit link'),
  ('converted_from_prospect_id',  '001', 'spätný odkaz na prospect po promote')
)
SELECT
  e.migration,
  e.col AS column_name,
  CASE WHEN c.column_name IS NULL THEN '❌ CHÝBA' ELSE '✅ OK' END AS status,
  e.purpose
FROM expected_cols e
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public' AND c.table_name = 'leads' AND c.column_name = e.col
ORDER BY e.migration, e.col;

SELECT '=== STĹPEC organizations.outreach_settings ===' AS section;
SELECT
  '001' AS migration,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'outreach_settings'
  ) THEN '✅ OK' ELSE '❌ CHÝBA' END AS status;

SELECT '=== UNIQUE INDEX leads_org_domain_uniq ===' AS section;
SELECT
  '010' AS migration,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'leads_org_domain_uniq'
  ) THEN '✅ OK — batchUpsertLeads bude fungovať'
       ELSE '❌ CHÝBA — manuálny import leadov hodí onConflict chybu' END AS status;

SELECT '=== MESSAGES — schéma stĺpcov ===' AS section;
WITH expected_msg_cols (col, migration, purpose) AS (VALUES
  ('sender_type', '011', 'team/client diskriminátor — vyžadovaný UI a indexom'),
  ('is_read',     '011', 'mark-as-read flag — vyžadovaný unread badge'),
  ('read_at',     '011', 'kedy bola správa prečítaná'),
  ('content',     '011', 'text správy')
)
SELECT
  e.migration,
  e.col AS column_name,
  CASE WHEN c.column_name IS NULL THEN '❌ CHÝBA' ELSE '✅ OK' END AS status,
  e.purpose
FROM expected_msg_cols e
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public' AND c.table_name = 'messages' AND c.column_name = e.col
ORDER BY e.col;

SELECT '=== MESSAGES — UPDATE policy pre klienta ===' AS section;
SELECT
  '011' AS migration,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'messages'
      AND policyname = 'Clients can mark own messages as read'
  ) THEN '✅ OK — klient môže označiť správy ako prečítané'
       ELSE '❌ CHÝBA — markMessagesAsRead zlyhá s RLS chybou' END AS status;

SELECT '=== MESSAGES — realtime publication ===' AS section;
SELECT
  '011' AS migration,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN '✅ OK — realtime channel posiela INSERT eventy'
       ELSE '❌ CHÝBA — nové správy sa zobrazia až po refreshi' END AS status;
