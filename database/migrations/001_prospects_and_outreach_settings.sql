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
  audit_token TEXT UNIQUE,
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
CREATE TRIGGER update_prospects_updated_at BEFORE UPDATE ON prospects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

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
