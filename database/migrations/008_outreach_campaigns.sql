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
