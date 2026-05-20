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
    org_id IN (SELECT org_id FROM team_members WHERE user_id = auth.uid())
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
-- MIGRÁCIA 011: Messages — UPDATE policy pre klienta + realtime publication
-- ============================================
-- Účel:
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

