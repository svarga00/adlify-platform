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
      FOR ALL USING (org_id IN (SELECT org_id FROM team_members WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reports' AND policyname='Clients can view own reports') THEN
    CREATE POLICY "Clients can view own reports" ON reports
      FOR SELECT USING (client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reports_client ON reports(client_id, period_end DESC);
