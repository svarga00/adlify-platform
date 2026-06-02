-- ============================================
-- 🚀 BUNDLE: všetky migrácie 001-010 v idempotent forme
--
-- Bezpečné pustiť aj keď si nejakú z nich už spustil. Kde sa CREATE
-- POLICY / CREATE TRIGGER nedá obaliť do IF NOT EXISTS, predchádza im
-- DROP ... IF EXISTS, aby sa nestratil idempotent charakter.
--
-- POSTUP:
--   1. Najprv pusti `_check_status.sql` a pozri si stav.
--   2. Skopíruj obsah tohto súboru do Supabase SQL Editora a Run.
--   3. Po dobehnutí pusti `_check_status.sql` znova — všetko má byť ✅.
--
-- Bundle nepúšťa žiadny DROP TABLE / TRUNCATE / DELETE FROM mimo
-- migrácie 010, ktorá deduplikuje duplicitné domény pred UNIQUE indexom.
-- ============================================


-- ============================================
-- ▶▶ 001_prospects_and_outreach_settings.sql
-- ============================================

-- ============================================
-- 📮 PROSPECTS + OUTREACH SETTINGS
-- Migration 001
--
-- Oddeľuje cold outreach targets (prospects) od kvalifikovaných leadov.
-- Flow: prospect (cold) → lead (prejavil záujem) → client (platí).
--
-- Aplikovať v Supabase SQL Editor.
-- ============================================

-- 1. NOVÁ TABUĽKA: prospects (cold outreach targets)
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',

  -- Firma
  company_name TEXT,
  domain TEXT,
  industry TEXT,
  city TEXT,

  -- Kontakt (primárny)
  contact_person TEXT,
  email TEXT,
  phone TEXT,

  -- Segmentácia / scoring
  segment TEXT,                  -- napr. 'eshopy', 'zubari', 'reality'
  score INTEGER DEFAULT 50,
  source TEXT,                   -- kde sme ho získali (FinStat, Google Maps, import, ...)
  source_url TEXT,
  tags TEXT[] DEFAULT '{}',

  -- Outreach tracking
  outreach_stage TEXT DEFAULT 'pending' CHECK (outreach_stage IN (
    'pending',          -- ešte neoslovený
    'email_sent',       -- email odoslaný
    'email_opened',     -- open pixel fired
    'email_clicked',    -- klikol v emaili (mimo audit link)
    'audit_requested',  -- klikol "Chcem audit"
    'audit_delivered',  -- audit vygenerovaný/poslaný
    'audit_viewed',     -- klient si audit pozrel
    'call_booked',      -- rezervoval 15min call (pred promote-om, ak je vypnutý auto-rule)
    'bounced',          -- email bounced
    'unsubscribed',     -- opt-out
    'converted',        -- premenený na lead
    'lost'              -- neúspešný
  )),
  outreach_email_sent_at TIMESTAMPTZ,
  outreach_email_opened_at TIMESTAMPTZ,
  outreach_email_open_count INTEGER DEFAULT 0,
  outreach_email_replied_at TIMESTAMPTZ,
  outreach_last_contacted_at TIMESTAMPTZ,

  -- Audit flow
  audit_token UUID UNIQUE DEFAULT gen_random_uuid(),
  audit_requested_at TIMESTAMPTZ,
  audit_request_data JSONB,              -- odpoveď z audit-request.html (priority, note, ...)
  audit_delivered_at TIMESTAMPTZ,
  audit_generated_at TIMESTAMPTZ,
  audit_data JSONB,                      -- raw dáta (pagespeed, seo, keywords, screenshot...)
  audit_findings JSONB,                  -- Claude synthesis výsledky
  audit_viewed_at TIMESTAMPTZ,
  audit_view_count INTEGER DEFAULT 0,

  -- Analýza (JSON) — volebné, pre outreach-scoped AI
  analysis JSONB DEFAULT '{}',

  -- Konverzia
  converted_to_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  conversion_reason TEXT,        -- napr. 'audit_clicked', 'call_booked', 'form_submitted', 'manual'

  -- Meta
  notes TEXT,
  assigned_to UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexy
CREATE INDEX IF NOT EXISTS idx_prospects_org_stage ON prospects(org_id, outreach_stage);
CREATE INDEX IF NOT EXISTS idx_prospects_domain ON prospects(domain);
CREATE INDEX IF NOT EXISTS idx_prospects_email ON prospects(email);
CREATE INDEX IF NOT EXISTS idx_prospects_audit_token ON prospects(audit_token);
CREATE INDEX IF NOT EXISTS idx_prospects_score ON prospects(org_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_prospects_segment ON prospects(org_id, segment);

-- Trigger na updated_at
DROP TRIGGER IF EXISTS update_prospects_updated_at ON prospects;
CREATE TRIGGER update_prospects_updated_at BEFORE UPDATE ON prospects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team can manage prospects" ON prospects;
CREATE POLICY "Team can manage prospects" ON prospects
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin', 'manager', 'employee')
    )
  );

-- 2. OUTREACH SETTINGS na organizáciu
-- ------------------------------------
-- Konfigurovateľné pravidlá pre auto-konverziu prospect → lead
-- Default: klik na audit, rezervácia call-u a odoslanie formulára sú ZAP.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS outreach_settings JSONB DEFAULT jsonb_build_object(
    'auto_convert', jsonb_build_object(
      'audit_clicked',   true,   -- klikol "Chcem audit"
      'call_booked',     true,   -- rezervoval call
      'form_submitted',  true,   -- odoslal kontaktný / ponuka formulár
      'email_replied',   false,  -- odpísal na email (vyžaduje Resend webhook)
      'email_opened_n',  false,  -- otvoril email N-krát
      'email_open_threshold', 3  -- N pre email_opened_n
    ),
    'cooldown_days_after_lost', 90,
    'sender_name', 'Štefan Varga',
    'sender_title', 'Adlify'
  );

-- Existujúcim orgom doplniť default ak je NULL
UPDATE organizations
SET outreach_settings = jsonb_build_object(
  'auto_convert', jsonb_build_object(
    'audit_clicked', true,
    'call_booked', true,
    'form_submitted', true,
    'email_replied', false,
    'email_opened_n', false,
    'email_open_threshold', 3
  ),
  'cooldown_days_after_lost', 90,
  'sender_name', 'Štefan Varga',
  'sender_title', 'Adlify'
)
WHERE outreach_settings IS NULL;

-- 3. V leads doplníme spätný odkaz na prospect (audit trail)
-- ----------------------------------------------------------
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS converted_from_prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_from_prospect ON leads(converted_from_prospect_id);


-- ============================================
-- ▶▶ 002_migrate_cold_leads_to_prospects.sql
-- ============================================

-- ============================================
-- 📦 MIGRÁCIA COLD LEADS → PROSPECTS
-- Migration 002 (po 001)
--
-- Presúva z `leads` do `prospects` všetky záznamy, ktoré sú čisto "cold"
-- — teda ešte neklikli audit, nerezervovali call, nemajú project/client.
--
-- Kritérium "cold":
--   - outreach_stage IN ('pending','email_sent','email_opened')
--   - AND audit_requested_at IS NULL
--   - AND converted_to_client_id IS NULL
--   - AND status IN ('new','analyzing','ready','contacted')   -- nie negotiating/converted/lost
--
-- Ak `leads` ešte nemá outreach polia (čistá schema.sql), migrácia
-- bezpečne ošetrí NULL hodnoty cez COALESCE / try-catch-alike DO block.
-- ============================================

DO $$
DECLARE
  has_outreach_cols BOOLEAN;
BEGIN
  -- zisti či leads má outreach stĺpce
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'outreach_stage'
  ) INTO has_outreach_cols;

  IF NOT has_outreach_cols THEN
    RAISE NOTICE 'leads table nemá outreach stĺpce — žiadne dáta na migráciu.';
    RETURN;
  END IF;

  -- presun cold leadov
  WITH moved AS (
    INSERT INTO prospects (
      id, org_id, company_name, domain, industry, city,
      contact_person, email, phone,
      score, source, source_url, tags,
      outreach_stage, outreach_email_sent_at, outreach_email_opened_at,
      audit_token, audit_requested_at, audit_request_data, audit_delivered_at,
      audit_generated_at, audit_data, audit_findings, audit_viewed_at, audit_view_count,
      notes, assigned_to, created_at, updated_at
    )
    SELECT
      l.id, l.org_id,
      l.company_name, l.domain,
      l.industry,
      l.city,
      l.contact_person,
      l.email::text,
      l.phone::text,
      COALESCE(l.score, 50),
      l.source, l.source_url, COALESCE(l.tags, '{}'),
      COALESCE(l.outreach_stage, 'pending'),
      l.outreach_email_sent_at,
      l.outreach_email_opened_at,
      l.audit_token,
      l.audit_requested_at,
      l.audit_request_data,
      l.audit_delivered_at,
      l.audit_generated_at,
      l.audit_data,
      l.audit_findings,
      l.audit_viewed_at,
      COALESCE(l.audit_view_count, 0),
      l.notes, l.assigned_to, l.created_at, l.updated_at
    FROM leads l
    WHERE COALESCE(l.outreach_stage, 'pending') IN ('pending','email_sent','email_opened')
      AND l.audit_requested_at IS NULL
      AND l.converted_to_client_id IS NULL
      AND COALESCE(l.status, 'new') IN ('new','analyzing','ready','contacted')
    RETURNING id
  )
  DELETE FROM leads WHERE id IN (SELECT id FROM moved);

  RAISE NOTICE 'Migrácia dokončená.';
END $$;


-- ============================================
-- ▶▶ 003_email_templates.sql
-- ============================================

-- ============================================
-- EMAIL TEMPLATES — outreach extension
-- Migration 003
--
-- Tabuľka email_templates už existuje (schéma: slug, html_content, plain_text, ...).
-- Pridáme len org_id a seed 3 outreach šablón pre default org.
-- ============================================

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001';

UPDATE email_templates SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_templates_org_slug ON email_templates(org_id, slug);
CREATE INDEX IF NOT EXISTS idx_email_templates_org_category ON email_templates(org_id, category);

-- Seed 3 outreach šablón (iba ak slug ešte neexistuje)
INSERT INTO email_templates (org_id, slug, name, description, category, subject, plain_text, variables, is_system, is_active)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'cold_outreach_audit',
  'Cold outreach – ponuka auditu',
  'Prvý kontakt s prospektom. Ponúka bezplatný mini-audit.',
  'outreach',
  '{{company}} — ponuka bezplatného mini-auditu',
  E'{{greeting}},\n\nvšimol som si {{company}}{{industry_hook}}.\n\nV týchto dňoch pripravujem 5 bezplatných mini-auditov pre vybrané firmy. Konkrétne 3 body čo zlepšiť hneď, ako to robí konkurencia, a kde sú peniaze ktoré teraz unikajú.\n\nŽiadne záväzky, žiadny predaj — len analýza ako keby som ju robil pre seba.\n\nChcem audit zadarmo: {{audit_request_url}}\n\n(Doručím do 48 hodín, 5 voľných miest)\n\nS pozdravom,\n{{sender_name}}\n{{sender_title}}\ninfo@adlify.eu | +421 944 184 045\n\nP.S. Ak nemáte záujem, ignorujte prosím tento email — nebudem písať druhýkrát.',
  '["greeting","contact_name","company","domain","industry","industry_hook","city","audit_request_url","sender_name","sender_title"]'::jsonb,
  TRUE,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE slug = 'cold_outreach_audit');

INSERT INTO email_templates (org_id, slug, name, description, category, subject, plain_text, variables, is_system, is_active)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'audit_delivered',
  'Audit hotový – doručenie',
  'Informuje prospekta že audit je pripravený a posiela link.',
  'outreach',
  'Váš mini-audit pre {{company}} je hotový',
  E'{{greeting}},\n\npodľa sľubu — váš mini-audit pre {{company}} je hotový.\n\nPozrel som sa na váš web, sociálne siete, aktuálne reklamy a porovnal vás s konkurenciou. V audite nájdete 3 konkrétne body ktoré ovplyvňujú vašu výkonnosť — a ako to riešia firmy ktorým sa darí.\n\nPozrieť audit: {{audit_url}}\n\n(Audit ostane dostupný 30 dní)\n\nS pozdravom,\n{{sender_name}}\n{{sender_title}}\ninfo@adlify.eu',
  '["greeting","contact_name","company","domain","audit_url","sender_name","sender_title"]'::jsonb,
  TRUE,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE slug = 'audit_delivered');

INSERT INTO email_templates (org_id, slug, name, description, category, subject, plain_text, variables, is_system, is_active)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'call_booking_confirmation',
  'Potvrdenie rezervácie hovoru',
  'Pošle sa automaticky po rezervácii 15-min hovoru.',
  'transactional',
  'Potvrdenie rezervácie — {{scheduled_at_formatted}}',
  E'{{greeting}},\n\nďakujem za rezerváciu hovoru.\n\nTermín: {{scheduled_at_formatted}}\nTrvanie: {{duration_minutes}} minút (telefonicky)\n{{topic_line}}\n\nPozvánka do kalendára je v prílohe (.ics). Ak potrebujete termín presunúť, jednoducho odpíšte na tento email.\n\nS pozdravom,\n{{sender_name}}\n{{sender_title}}\nAdlify',
  '["greeting","contact_name","company","scheduled_at_formatted","duration_minutes","topic","topic_line","sender_name","sender_title"]'::jsonb,
  TRUE,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE slug = 'call_booking_confirmation');


-- ============================================
-- ▶▶ 004_email_templates_rls_policy.sql
-- ============================================

-- ============================================
-- FIX: email_templates RLS policy
-- Migration 004
--
-- Tabuľka email_templates mala RLS=ON, ale niektoré policy chýbali
-- pre authenticated team userov. Pridáme team-scope policy, ktorá
-- dovolí SELECT/INSERT/UPDATE/DELETE pre role v tíme.
-- ============================================

DROP POLICY IF EXISTS "Team can manage email templates" ON email_templates;

CREATE POLICY "Team can manage email templates" ON email_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin', 'manager', 'employee')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin', 'manager', 'employee')
    )
  );


-- ============================================
-- ▶▶ 005_cold_outreach_variants.sql
-- ============================================

-- ============================================
-- COLD OUTREACH VARIANT TEMPLATES
-- Migration 005
--
-- Pridáva 5 variant cold outreach emailov (different angles).
-- Každá má svoj slug + štýl:
--   short  — 3 vety, priamy ASK
--   problem — problem-solution hook
--   case   — case study / social proof
--   friendly — otvárajúca otázka
--   local  — mesto + konkurencia
-- ============================================

INSERT INTO email_templates (org_id, slug, name, description, category, subject, plain_text, variables, is_system, is_active)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'cold_short',
  'Cold – Krátka (3 vety)',
  'Najkratšia verzia: pozdrav, hook, CTA. Vhodná keď máte málo informácií o firme.',
  'outreach',
  '{{company}} — 48h a máte mini-audit',
  E'{{greeting}},\n\nrobím bezplatné mini-audity pre vybrané firmy — čo zmeniť hneď, čo robí konkurencia, kde unikajú peniaze. Doručím do 48 hodín.\n\n[[Chcem audit zadarmo|{{audit_request_url}}]]\n\n{{sender_name}}, {{sender_title}}',
  '["greeting","contact_name","company","domain","industry","industry_hook","city","audit_request_url","sender_name","sender_title"]'::jsonb,
  TRUE,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE slug = 'cold_short');

INSERT INTO email_templates (org_id, slug, name, description, category, subject, plain_text, variables, is_system, is_active)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'cold_problem_solution',
  'Cold – Problém/riešenie',
  'Identifikuje typický problém segmentu a ponúka audit ako prvý krok.',
  'outreach',
  'Prečo {{company}} stráca zákazníkov online (a ako to zmeniť)',
  E'{{greeting}},\n\nväčšina firiem{{industry_hook}} stráca 30–60 % potenciálnych zákazníkov ešte predtým, ako sa dostanú na telefón alebo do obchodu. Pomalý web, zlé kľúčové slová, slabá ponuka na prvý pohľad.\n\nSpravil som si rýchly prehľad cez {{domain}} a našiel som 3 konkrétne veci, ktoré by som v prvom rade zmenil. Zhrniem ich v bezplatnom mini-audite — uvidíte presne čísla a priority.\n\n[[Pošlite mi audit|{{audit_request_url}}]]\n\nBez záväzku, bez predaja. Len ukážka ako pracujem.\n\n{{sender_name}}\n{{sender_title}}',
  '["greeting","contact_name","company","domain","industry","industry_hook","city","audit_request_url","sender_name","sender_title"]'::jsonb,
  TRUE,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE slug = 'cold_problem_solution');

INSERT INTO email_templates (org_id, slug, name, description, category, subject, plain_text, variables, is_system, is_active)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'cold_case_study',
  'Cold – Case study (social proof)',
  'Opiera sa o výsledok inej firmy v segmente. Najlepšie funguje keď máte reálny kejs.',
  'outreach',
  '{{company}}: ako sme podobnej firme zdvihli dopyty o 40 %',
  E'{{greeting}},\n\nminulý rok sme pomohli firme{{industry_hook}} zdvihnúť počet kvalitných dopytov z webu o 40 % za 3 mesiace — bez zvýšenia rozpočtu, len lepšími reklamami a opravou 5 vecí na stránke.\n\nKeď sa pozriem na {{domain}}, vidím podobný potenciál. Môžem vám urobiť bezplatný mini-audit, kde vám konkrétne ukážem čo zmeniť a aké výsledky môžete očakávať.\n\n[[Chcem rovnaký audit|{{audit_request_url}}]]\n\n{{sender_name}}\n{{sender_title}}',
  '["greeting","contact_name","company","domain","industry","industry_hook","city","audit_request_url","sender_name","sender_title"]'::jsonb,
  TRUE,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE slug = 'cold_case_study');

INSERT INTO email_templates (org_id, slug, name, description, category, subject, plain_text, variables, is_system, is_active)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'cold_friendly',
  'Cold – Priateľská (otázka)',
  'Neformálnejší tón, otvára otázkou. Dobré pre menšie firmy / majiteľov.',
  'outreach',
  'Rýchla otázka ohľadom {{company}}',
  E'{{greeting}},\n\nmôžem byť úprimný? Prezrel som si {{domain}} a napadlo ma pár vecí, ktoré by ste mohli chcieť vedieť — čo funguje, čo nie, a jedna vec ktorá by mohla zdvihnúť vašu výkonnosť celkom rýchlo.\n\nZhrniem to do krátkeho auditu (cca strana A4) a pošlem vám to do 48 hodín. Zadarmo. Stačí klik:\n\n[[Áno, pošlite mi to|{{audit_request_url}}]]\n\nAk vás to nezaujíma, len ignorujte tento email — nebudem vás bombardovať.\n\nDržím palce,\n{{sender_name}}',
  '["greeting","contact_name","company","domain","industry","industry_hook","city","audit_request_url","sender_name","sender_title"]'::jsonb,
  TRUE,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE slug = 'cold_friendly');

INSERT INTO email_templates (org_id, slug, name, description, category, subject, plain_text, variables, is_system, is_active)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'cold_local',
  'Cold – Lokálna konkurencia',
  'Zameriava sa na lokalitu a konkurenciu v meste. Funguje najmä pre gastro, fitness, služby.',
  'outreach',
  '{{company}} vs. konkurencia v {{city}}',
  E'{{greeting}},\n\npozeral som si lokálnu konkurenciu{{industry_hook}} v {{city}} a všimol som si jednu vec — {{company}} má priestor predbehnúť ich v tom ako vás ľudia nájdu online. Konkrétne 3 body: rýchlosť webu, čo vidí zákazník prvých 5 sekúnd, a kde ste v Google Maps.\n\nZhrniem to do bezplatného mini-auditu — presné čísla, porovnanie s 2 konkurentami, a čo zmeniť ako prvé.\n\n[[Chcem audit pre {{company}}|{{audit_request_url}}]]\n\n{{sender_name}}\n{{sender_title}}',
  '["greeting","contact_name","company","domain","industry","industry_hook","city","audit_request_url","sender_name","sender_title"]'::jsonb,
  TRUE,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE slug = 'cold_local');


-- ============================================
-- ▶▶ 006_prospect_events.sql
-- ============================================

-- ============================================
-- PROSPECT EVENTS (timeline) + tracking fields
-- Migration 006
-- ============================================

-- Nové stĺpce na prospects
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS outreach_email_last_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outreach_email_human_open BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS outreach_email_bot_open_count INTEGER DEFAULT 0;

-- Timeline udalostí pre prospekt
CREATE TABLE IF NOT EXISTS prospect_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,        -- 'email_open' | 'email_click' | 'audit_requested'
                                   -- 'audit_viewed' | 'call_booked' | 'email_sent' | 'custom'
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Net/device
  ip INET,
  user_agent TEXT,
  is_bot BOOLEAN DEFAULT FALSE,
  bot_vendor TEXT,                 -- 'gmail' | 'outlook' | 'yahoo' | 'apple-mpp' | 'other'

  -- Geo (asynchronne doplnené)
  geo_country TEXT,
  geo_region TEXT,
  geo_city TEXT,
  geo_isp TEXT,

  -- Obsah udalosti
  link_url TEXT,                   -- pre click eventy
  referrer TEXT,
  meta JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_prospect_events_prospect ON prospect_events(prospect_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_events_type ON prospect_events(event_type, occurred_at DESC);

ALTER TABLE prospect_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prospect_events_team_select" ON prospect_events;
CREATE POLICY "prospect_events_team_select" ON prospect_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('owner','admin','manager','employee'))
);

DROP POLICY IF EXISTS "prospect_events_team_write" ON prospect_events;
CREATE POLICY "prospect_events_team_write" ON prospect_events FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('owner','admin','manager','employee'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('owner','admin','manager','employee'))
);


-- ============================================
-- ▶▶ 007_tasks_outreach.sql
-- ============================================

-- ============================================
-- Migration 007: tasks.prospect_id + outreach auto-actions
-- ============================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_prospect_id ON tasks(prospect_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status ON tasks(assigned_to, status);

-- Notifikácie — aj výkonový index
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_entity ON notifications(entity_type, entity_id);

-- Activities — index pre prospect timeline
CREATE INDEX IF NOT EXISTS idx_activities_entity ON activities(entity_type, entity_id, created_at DESC);


-- ============================================
-- ▶▶ 008_outreach_campaigns.sql
-- ============================================

-- ============================================
-- Migration 008: outreach sequences / campaigns
-- ============================================

-- 1. Outreach campaigns (multi-step sequences)
CREATE TABLE IF NOT EXISTS outreach_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed','archived')),
  segment_filter JSONB DEFAULT '{}',            -- napr. { industry: 'gastro', city: 'Bratislava' }
  stop_on_reply BOOLEAN DEFAULT TRUE,
  stop_on_audit_request BOOLEAN DEFAULT TRUE,
  sender_name TEXT,
  sender_email TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_campaigns_org_status ON outreach_campaigns(org_id, status);
DROP TRIGGER IF EXISTS update_outreach_campaigns_updated_at ON outreach_campaigns;
CREATE TRIGGER update_outreach_campaigns_updated_at BEFORE UPDATE ON outreach_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. Steps v kampani
CREATE TABLE IF NOT EXISTS outreach_campaign_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,                   -- 1, 2, 3, ...
  delay_days NUMERIC NOT NULL DEFAULT 0,         -- koľko dní po predošlom kroku
  template_slug TEXT NOT NULL,                   -- ktorá šablóna sa má použiť
  send_if_stage_in TEXT[] DEFAULT NULL,          -- null = vždy; inak len ak stage ∈ tomto zozname
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (campaign_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_outreach_campaign_steps_campaign ON outreach_campaign_steps(campaign_id, step_order);

-- 3. Enrollments prospektov v kampani
CREATE TABLE IF NOT EXISTS outreach_campaign_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 0,       -- 0 = ešte nič nebolo poslané
  next_send_at TIMESTAMPTZ,                      -- kedy má ďalší step bežať
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','stopped','bounced')),
  last_sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  stop_reason TEXT,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (campaign_id, prospect_id)
);

CREATE INDEX IF NOT EXISTS idx_ocenr_campaign ON outreach_campaign_enrollments(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_ocenr_next_send ON outreach_campaign_enrollments(next_send_at) WHERE status = 'active';
DROP TRIGGER IF EXISTS update_ocenr_updated_at ON outreach_campaign_enrollments;
CREATE TRIGGER update_ocenr_updated_at BEFORE UPDATE ON outreach_campaign_enrollments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE outreach_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_campaign_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_campaign_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_campaigns" ON outreach_campaigns;
CREATE POLICY "team_campaigns" ON outreach_campaigns FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('owner','admin','manager','employee'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('owner','admin','manager','employee'))
);

DROP POLICY IF EXISTS "team_campaign_steps" ON outreach_campaign_steps;
CREATE POLICY "team_campaign_steps" ON outreach_campaign_steps FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('owner','admin','manager','employee'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('owner','admin','manager','employee'))
);

DROP POLICY IF EXISTS "team_campaign_enrollments" ON outreach_campaign_enrollments;
CREATE POLICY "team_campaign_enrollments" ON outreach_campaign_enrollments FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('owner','admin','manager','employee'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('owner','admin','manager','employee'))
);


-- ============================================
-- ▶▶ 009_outreach_groups.sql
-- ============================================

-- ============================================
-- ADLIFY PLATFORM - OUTREACH GROUPS MIGRATION
-- Date: 2026-04-27
-- Adds: outreach_groups table for FB/LinkedIn/Telegram skupiny
-- (sociálne skupiny kam sa publikujú ponuky práce / outreach)
-- ============================================

CREATE TABLE IF NOT EXISTS outreach_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',

  platform TEXT NOT NULL DEFAULT 'facebook'
    CHECK (platform IN ('facebook', 'linkedin', 'telegram', 'discord', 'reddit', 'other')),

  url TEXT NOT NULL,
  name TEXT NOT NULL,
  member_count INTEGER,
  image_url TEXT,
  category TEXT,
  description TEXT,
  tags TEXT[] DEFAULT '{}',

  is_active BOOLEAN DEFAULT true,
  last_posted_at TIMESTAMPTZ,
  post_count INTEGER DEFAULT 0,

  -- Soft delete (rieši unique-constraint kolízie pri opätovnom pridaní)
  deleted_at TIMESTAMPTZ,

  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(org_id, url)
);

CREATE INDEX IF NOT EXISTS idx_outreach_groups_org_active
  ON outreach_groups(org_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_outreach_groups_platform
  ON outreach_groups(platform);

ALTER TABLE outreach_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team can manage outreach groups" ON outreach_groups;
CREATE POLICY "Team can manage outreach groups" ON outreach_groups
  FOR ALL USING (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS update_outreach_groups_updated_at ON outreach_groups;
CREATE TRIGGER update_outreach_groups_updated_at
  BEFORE UPDATE ON outreach_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================
-- ▶▶ 010_leads_normalize_upsert.sql
-- ============================================

-- ============================================
-- MIGRÁCIA 010: Leads — doplnenie kontaktných stĺpcov + UNIQUE constraint na domain
-- ============================================
-- Účel:
--   1. Doplniť stĺpce, ktoré aplikácia už zapisuje, ale nie sú vo
--      verzovanej schéme (`email`, `phone`, `logo_url`, `industry`).
--   2. Pridať nové stĺpce pre scraper workflow: `source_query`
--      (po čom sa firma našla), `contacted_at` (kedy bol lead
--      kontaktovaný).
--   3. Dedup duplicitných leadov podľa (org_id, lower(domain))
--      a vytvoriť UNIQUE INDEX, aby `.upsert(..., { onConflict })`
--      fungoval správne.
--
-- Idempotentnosť: všetky kroky sú `IF NOT EXISTS` — bezpečné spustiť
-- opakovane.
-- ============================================

-- ───── 1. Doplnenie chýbajúcich stĺpcov ─────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_query TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ;

-- ───── 2. Dedup duplicitných doman pred UNIQUE indexom ─────
-- Necháme najnovší záznam (najvyšší created_at, pri rovnosti najvyššie id)
-- pre každú dvojicu (org_id, lower(domain)).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY org_id, lower(domain)
           ORDER BY created_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM leads
  WHERE domain IS NOT NULL AND domain <> ''
)
DELETE FROM leads
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ───── 3. UNIQUE INDEX na (org_id, lower(domain)) ─────
CREATE UNIQUE INDEX IF NOT EXISTS leads_org_domain_uniq
  ON leads (org_id, lower(domain))
  WHERE domain IS NOT NULL AND domain <> '';

-- ───── 4. Pomocný index pre lookup podľa domény ─────
CREATE INDEX IF NOT EXISTS idx_leads_domain_lower
  ON leads (lower(domain))
  WHERE domain IS NOT NULL AND domain <> '';
-- ============================================
-- MIGRÁCIA 011: Messages — schema repair + UPDATE policy pre klienta + realtime publication
-- ============================================
-- Účel:
--   0. Existujúce DB môžu mať `messages` tabuľku staršiu ako schema.sql
--      opisuje (chýbajúce stĺpce sender_type/is_read/read_at/...). Najprv
--      schema doplníme, až potom riešime RLS a indexy.
--   1. Klient potrebuje označiť tímové správy ako prečítané
--      (UPDATE is_read, read_at). Existujúce policies riešia len
--      SELECT a INSERT.
--   2. Tabuľka `messages` musí byť súčasťou `supabase_realtime`
--      publication, aby Supabase realtime channel posielal INSERT
--      eventy do portál UI.
--   3. Pomocné indexy pre rýchle filtrovanie po client_id + is_read.
--
-- Idempotentnosť: všetko `IF NOT EXISTS` / `DO` block s catchom.
-- ============================================

-- ───── 0. Schema repair — doplnenie chýbajúcich stĺpcov ─────
-- Pre prípady kedy existujúca DB má staršiu verziu `messages` tabuľky
-- (napr. bez `sender_type`, `is_read`, `read_at`). Pridávame stĺpce z
-- schema.sql aby zvyšok migrácie nepadol s "column does not exist".
ALTER TABLE messages ADD COLUMN IF NOT EXISTS org_id      UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_id   UUID REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_id   UUID REFERENCES user_profiles(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_type TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS subject     TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS content     TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read     BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at     TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ DEFAULT NOW();

-- Backfill: existujúce správy bez sender_type predpokladajme že boli od tímu
-- (najčastejší prípad pri starých záznamoch z admin tooly).
UPDATE messages SET sender_type = 'team' WHERE sender_type IS NULL;

-- CHECK constraint na sender_type (ak ešte neexistuje)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_sender_type_check'
      AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_sender_type_check
      CHECK (sender_type IN ('team', 'client'));
  END IF;
END $$;

-- NOT NULL na sender_type (po backfille je bezpečné)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages'
      AND column_name = 'sender_type' AND is_nullable = 'YES'
  ) AND NOT EXISTS (
    SELECT 1 FROM messages WHERE sender_type IS NULL
  ) THEN
    ALTER TABLE messages ALTER COLUMN sender_type SET NOT NULL;
  END IF;
END $$;

-- ───── 1. UPDATE policy pre klienta (mark as read) ─────
-- Klient môže UPDATE-ovať len správy vlastnej firmy. WITH CHECK ho viaže
-- na rovnakú podmienku, takže nemôže "presunúť" správu na cudzieho klienta.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'messages'
      AND policyname = 'Clients can mark own messages as read'
  ) THEN
    CREATE POLICY "Clients can mark own messages as read" ON messages
      FOR UPDATE
      USING (
        client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid())
      )
      WITH CHECK (
        client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- ───── 2. Realtime publication — pridať messages tabuľku ─────
-- `supabase_realtime` je default publication v Supabase. Ak už messages
-- v nej je, ALTER zlyhá s "already member"; preto wrap v DO block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    -- supabase_realtime publication neexistuje (lokálny / self-hosted setup bez Supabase realtime)
    RAISE NOTICE 'supabase_realtime publication nenájdená — preskakujem ADD TABLE messages';
END $$;

-- ───── 3. Pomocný index pre unread badge query ─────
CREATE INDEX IF NOT EXISTS idx_messages_client_unread
  ON messages (client_id, sender_type, is_read)
  WHERE is_read = false;

-- ============================================
-- MIGRÁCIA 012: Portál tabuľky — tickets, documents, campaign_projects
-- ============================================
-- Účel:
--   Portál (`/portal/index.html`) dotazuje tri tabuľky, ktoré nikdy
--   neboli v schema.sql ani v žiadnej migrácii:
--     • tickets           — support tickety (loadTickets / submitTicket)
--     • documents         — dokumenty klienta (loadDocuments)
--     • campaign_projects — projekty klienta (loadProjects)
--   Bez nich `loadTickets()` / `submitTicket()` hádžu "relation does not
--   exist" a sekcie Tickety / Dokumenty zostávajú prázdne.
--
--   Stĺpce sú odvodené z reálneho použitia v portáli:
--     tickets:           client_id, subject, description, category,
--                        priority, status, created_at
--     documents:         client_id, name, category, file_name, file_url,
--                        is_public, created_at
--     campaign_projects: client_id, name, description, status, created_at
--
-- RLS vzor kopíruje invoices/campaigns:
--   • tím (team_members) má FOR ALL nad org_id
--   • klient (client_users) má SELECT vlastných záznamov
--   • tickets navyše: klient môže INSERT vlastný ticket
--
-- Idempotentnosť: CREATE TABLE IF NOT EXISTS + policy guardy v DO blokoch.
-- ============================================

-- ───── 1. TICKETS ─────
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

  subject TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ───── 2. DOCUMENTS ─────
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  category TEXT DEFAULT 'contract',
  file_name TEXT,
  file_url TEXT,
  is_public BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ───── 3. CAMPAIGN_PROJECTS ─────
CREATE TABLE IF NOT EXISTS campaign_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ───── RLS enable ─────
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_projects ENABLE ROW LEVEL SECURITY;

-- ───── RLS policies: TICKETS ─────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tickets' AND policyname='Team can manage tickets') THEN
    CREATE POLICY "Team can manage tickets" ON tickets
      FOR ALL USING (EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tickets' AND policyname='Clients can view own tickets') THEN
    CREATE POLICY "Clients can view own tickets" ON tickets
      FOR SELECT USING (client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tickets' AND policyname='Clients can create own tickets') THEN
    CREATE POLICY "Clients can create own tickets" ON tickets
      FOR INSERT WITH CHECK (client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid()));
  END IF;
END $$;

-- ───── RLS policies: DOCUMENTS ─────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='documents' AND policyname='Team can manage documents') THEN
    CREATE POLICY "Team can manage documents" ON documents
      FOR ALL USING (EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='documents' AND policyname='Clients can view own public documents') THEN
    CREATE POLICY "Clients can view own public documents" ON documents
      FOR SELECT USING (
        client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid())
        AND is_public = true
      );
  END IF;
END $$;

-- ───── RLS policies: CAMPAIGN_PROJECTS ─────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='campaign_projects' AND policyname='Team can manage projects') THEN
    CREATE POLICY "Team can manage projects" ON campaign_projects
      FOR ALL USING (EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='campaign_projects' AND policyname='Clients can view own projects') THEN
    CREATE POLICY "Clients can view own projects" ON campaign_projects
      FOR SELECT USING (client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid()));
  END IF;
END $$;

-- ───── Indexy ─────
CREATE INDEX IF NOT EXISTS idx_tickets_client ON tickets(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_client ON documents(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_projects_client ON campaign_projects(client_id, created_at DESC);

-- ============================================
-- MIGRÁCIA 013: Reports — PDF/PPTX reporty pre klientsky portál
-- ============================================
-- Účel:
--   Klient v portáli (tab „Reporty") potrebuje archív mesačných /
--   kvartálnych PDF reportov + voliteľné highlight KPIs ako snapshot.
--   Súbory sú v Supabase Storage bucket-i (verejnom alebo signed-URL),
--   tabuľka drží metadata + odkaz.
--
-- Tabuľka:
--   • title          — názov reportu („Report · Marec 2026")
--   • period_start/end — interval ktorý report pokrýva
--   • file_url       — URL na PDF v storage (alebo external)
--   • file_name      — pôvodný názov súboru pre download
--   • file_size_bytes — pre UI zobrazenie veľkosti
--   • highlights     — JSONB snapshot KPIs (conversions, roi, spent, …)
--                      umožňuje preview metrík bez stiahnutia PDF
--
-- RLS: štandardný portál vzor (tím FOR ALL, klient SELECT vlastných).
-- ============================================

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  period_start DATE,
  period_end DATE,

  file_url TEXT,
  file_name TEXT,
  file_size_bytes BIGINT,

  highlights JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reports' AND policyname='Team can manage reports') THEN
    CREATE POLICY "Team can manage reports" ON reports
      FOR ALL USING (EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reports' AND policyname='Clients can view own reports') THEN
    CREATE POLICY "Clients can view own reports" ON reports
      FOR SELECT USING (client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reports_client ON reports(client_id, period_end DESC);

-- ============================================
-- MIGRÁCIA 014: Approvals — schvaľovanie kreatív/copy s revision chain
-- ============================================
-- Účel:
--   Tab „Schvaľovanie" v klientskom portáli. Tím nahrá kreatívu, klient
--   ju v portáli schváli alebo zamietne (s feedbackom). Pri zamietnutí
--   tím nahrá novú verziu cez `parent_approval_id` — vznikne revision
--   chain (v1 → v2 → v3 …), klient vidí celú históriu rozhodnutí.
--
-- Polia:
--   • org_id / client_id              — scoping
--   • campaign_id                     — voliteľné prepojenie na kampaň
--   • parent_approval_id              — odkaz na predchádzajúcu verziu
--   • version                         — pre rýchle zobrazenie bez traversal
--   • kind                            — creative/copy/design/video/other
--   • title / description             — popis assetu
--   • asset_url / thumbnail_url       — preview obrázok alebo file URL
--   • status                          — pending / approved / rejected
--   • feedback                        — klientov komentár (povinný pri reject)
--   • reviewed_at / reviewed_by       — kto a kedy rozhodol
--
-- RLS:
--   • Tím FOR ALL podľa org_id (môžu vytvárať, mazať, čítať všetko)
--   • Klient SELECT vlastných
--   • Klient UPDATE vlastných — obmedzené na svoj client_id (column-level
--     ohraničenie status/feedback by vyžadovalo trigger; necháme pragmatic
--     a obmedzíme len client_id scope, čo je security-safe)
--
-- Realtime:
--   ALTER PUBLICATION supabase_realtime ADD TABLE approvals
--   — keď tím nahrá novú verziu, klient ju vidí bez refreshu.
--
-- Indexy:
--   • idx_approvals_client     — najčastejší query: list per client
--   • idx_approvals_parent     — pre revision chain lookup
--   • idx_approvals_pending    — partial idx pre "čaká na klienta" badge
-- ============================================

CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,

  parent_approval_id UUID REFERENCES approvals(id) ON DELETE SET NULL,
  version INT DEFAULT 1,

  kind TEXT DEFAULT 'creative' CHECK (kind IN ('creative', 'copy', 'design', 'video', 'other')),
  title TEXT NOT NULL,
  description TEXT,
  asset_url TEXT,
  thumbnail_url TEXT,

  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  feedback TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='approvals' AND policyname='Team can manage approvals') THEN
    CREATE POLICY "Team can manage approvals" ON approvals
      FOR ALL USING (EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='approvals' AND policyname='Clients can view own approvals') THEN
    CREATE POLICY "Clients can view own approvals" ON approvals
      FOR SELECT USING (client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='approvals' AND policyname='Clients can decide own approvals') THEN
    CREATE POLICY "Clients can decide own approvals" ON approvals
      FOR UPDATE
      USING (client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid()))
      WITH CHECK (client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid()));
  END IF;
END $$;

-- Realtime publication — bez tohto klient nevidí nové verzie bez refreshu
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'approvals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE approvals;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'supabase_realtime publication nenájdená — preskakujem ADD TABLE approvals';
END $$;

CREATE INDEX IF NOT EXISTS idx_approvals_client  ON approvals (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approvals_parent  ON approvals (parent_approval_id);
CREATE INDEX IF NOT EXISTS idx_approvals_pending ON approvals (client_id, status)
  WHERE status = 'pending';

-- ============================================
-- MIGRÁCIA 015: First-time onboarding tour state
-- ============================================
-- Účel:
--   Klient po prvom prihlásení do portálu uvidí 5-6 step tour modal
--   so highlightom konkrétnej oblasti (Dashboard → Správy → Schvaľovanie
--   → Reporty → Nastavenia). Po preskočení / dokončení sa zapíše
--   timestamp, aby sa tour viac nezobrazoval.
--
--   Stĺpec: `user_profiles.tour_completed_at TIMESTAMPTZ`
--   - NULL → tour nebol dokončený → zobraziť
--   - timestamp → tour bol dokončený / preskočený
--
--   User-level (nie client-level) lebo client_users many-to-many vzťah —
--   ak by jeden klient mal viacero členov tímu, každý si tour pozrie zvlášť.
-- ============================================

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS tour_completed_at TIMESTAMPTZ;

