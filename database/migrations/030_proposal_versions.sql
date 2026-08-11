-- História verzií návrhu — pred regenerovaním sa spraví snapshot,
-- admin si vie pozrieť čo AI vygenerovala v predošlej verzii a porovnať.
--
-- Plní sa cez netlify generate-campaigns-background pred deleteOldDraftCampaigns().

CREATE TABLE IF NOT EXISTS proposal_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  version INT NOT NULL,

  -- Snapshot strategických dát (JSONB - rovnaké polia ako campaign_projects)
  strategy_summary TEXT,
  business_analysis JSONB,
  research_data JSONB,
  expected_results JSONB,
  timeline JSONB,
  budget_breakdown JSONB,
  next_steps JSONB,

  -- Snapshot kampaní (denormalized JSONB pole — žiadne FK, archív)
  campaigns_snapshot JSONB DEFAULT '[]',
    -- pole [{ name, platform, campaign_type, objective, budget_daily, targeting,
    --         ad_groups: [{ name, keywords, ads: [{ headlines, descriptions, ... }] }] }]

  -- Trigger meta — prečo bola vytvorená nová verzia (pripomienky admina)
  trigger TEXT DEFAULT 'regenerate',
    -- 'initial', 'regenerate', 'client_revision'
  feedback TEXT,  -- pripomienky ktoré viedli k regenerácii

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT proposal_versions_unique UNIQUE (project_id, version)
);

CREATE INDEX IF NOT EXISTS idx_proposal_versions_project
  ON proposal_versions(project_id, version DESC);

COMMENT ON TABLE proposal_versions IS
'Snapshot strategických dát a kampaní pred regenerovaním. Admin vie porovnať verzie a obnoviť staršiu (manuálnym kopírovaním JSONB).';
