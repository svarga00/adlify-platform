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
