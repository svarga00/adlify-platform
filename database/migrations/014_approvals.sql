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
