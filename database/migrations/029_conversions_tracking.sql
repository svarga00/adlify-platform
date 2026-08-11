-- Konverzné tracking — log udalostí ktoré klient pixel posiela cez
-- /.netlify/functions/track-conversion. Plní campaign_metrics_daily
-- (aggregácia) + slúži ako source of truth pre real-time reports.

CREATE TABLE IF NOT EXISTS conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  client_id UUID,
  campaign_id UUID,  -- voliteľné — ak vieme spárovať (cez gclid/fbclid)

  event_type TEXT DEFAULT 'conversion',
    -- 'lead', 'purchase', 'signup', 'call', 'form_submit', 'page_view', 'engagement'
  event_value NUMERIC(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'EUR',

  -- Atribučné parametre
  source TEXT,
  medium TEXT,
  campaign TEXT,
  term TEXT,
  content TEXT,

  -- Click IDs pre presnú atribúciu
  gclid TEXT,    -- Google click ID
  fbclid TEXT,   -- Facebook click ID

  -- Kontext
  page_url TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip TEXT,
  client_ref TEXT,  -- voľný identifikátor klienta (napr. order_id)
  meta JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversions_project ON conversions(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversions_client ON conversions(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversions_event_type ON conversions(event_type);
CREATE INDEX IF NOT EXISTS idx_conversions_gclid ON conversions(gclid) WHERE gclid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversions_fbclid ON conversions(fbclid) WHERE fbclid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversions_created ON conversions(created_at DESC);

COMMENT ON TABLE conversions IS
'Log konverzných udalostí z klientovho webu. Posielané cez Adlify pixel (track-conversion.js). Doplnok ku Google Ads / Meta tracking — náš vlastný first-party event log.';

COMMENT ON COLUMN conversions.event_value IS
'Hodnota konverzie (napr. order value, lead score). 0 pre konverzie bez hodnoty (formuláre).';

-- RLS — klient vidí len svoje konverzie cez portál
ALTER TABLE conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversions_client_read ON conversions;
CREATE POLICY conversions_client_read ON conversions
  FOR SELECT USING (
    client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid() AND status = 'active')
  );

-- Service role insert je vždy povolený (track-conversion.js používa
-- service key, RLS sa neaplikuje)
