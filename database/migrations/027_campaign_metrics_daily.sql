-- Real-time reporty + týždenné snapshoty kampaní.
--
-- Reťaz: platform_connections.client_id → sync funkcie nastavia campaigns.client_id
-- pri upsert-e. Portal číta campaigns where client_id = X. Pre denný/týždenný
-- trend graf máme novú campaign_metrics_daily tabuľku s jednou row per kampaň
-- per deň. Synčí sa rovnaký 2h cron, dáta sa agreguje cez UPSERT na unique
-- (campaign_id, snapshot_date).

-- 1. campaigns — istota že máme client_id a project_id na napojenie
-- (sync funkcie upsertujú cez (platform, external_id), tieto polia chýbali ako default)
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS client_id UUID,
ADD COLUMN IF NOT EXISTS project_id UUID,
ADD COLUMN IF NOT EXISTS platform_connection_id UUID;

CREATE INDEX IF NOT EXISTS idx_campaigns_client ON campaigns(client_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_project ON campaigns(project_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_platform_external
  ON campaigns(platform, external_id) WHERE external_id IS NOT NULL;

-- 2. campaign_metrics_daily — time series pre trend grafy a týždenný report
CREATE TABLE IF NOT EXISTS campaign_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL,
  client_id UUID,
  snapshot_date DATE NOT NULL,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  cost NUMERIC(12,2) DEFAULT 0,
  conversions NUMERIC(12,2) DEFAULT 0,
  ctr NUMERIC(8,4) DEFAULT 0,
  avg_cpc NUMERIC(10,2) DEFAULT 0,
  cpa NUMERIC(10,2) DEFAULT 0,
  conversion_value NUMERIC(12,2) DEFAULT 0,
  roas NUMERIC(8,2) DEFAULT 0,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT campaign_metrics_daily_unique UNIQUE (campaign_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_cmd_client_date
  ON campaign_metrics_daily(client_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_cmd_campaign_date
  ON campaign_metrics_daily(campaign_id, snapshot_date DESC);

COMMENT ON TABLE campaign_metrics_daily IS
'Denný snapshot výkonu kampaní. Plní sa cez ads-scheduled-sync (každé 2h, upsert na unique campaign_id+date). Portal číta pre trend grafy a weekly report dostáva 7-denný rolling window.';

COMMENT ON COLUMN campaign_metrics_daily.source IS
'google_ads | meta_ads | manual — odkiaľ snapshot prišiel';

-- 3. campaigns.metrics enriched s last_sync_summary (pre rýchle KPI bez agregácie)
-- (nemení JSONB schému, len doplníme komentár pre clarity)
COMMENT ON COLUMN campaigns.metrics IS
'Cache najnovšieho snapshotu (last 30 days summary). Plní sa sync funkciami. Pre denný trend použij campaign_metrics_daily.';

-- 4. RLS pre portal čítanie — klient vidí len svoje denné metriky
ALTER TABLE campaign_metrics_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cmd_client_read ON campaign_metrics_daily;
CREATE POLICY cmd_client_read ON campaign_metrics_daily
  FOR SELECT
  USING (
    client_id IN (
      SELECT client_id FROM client_users WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM team_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

DROP POLICY IF EXISTS cmd_team_write ON campaign_metrics_daily;
CREATE POLICY cmd_team_write ON campaign_metrics_daily
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND status = 'active')
  );
