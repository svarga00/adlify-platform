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

CREATE POLICY "Team can manage outreach groups" ON outreach_groups
  FOR ALL USING (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid())
  );

CREATE TRIGGER update_outreach_groups_updated_at
  BEFORE UPDATE ON outreach_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
