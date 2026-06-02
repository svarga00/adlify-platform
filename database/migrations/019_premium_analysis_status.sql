-- ============================================
-- MIGRÁCIA 019: premium_analysis status tracking
-- ============================================
-- Účel:
--   Background mode generácia: Edge function vráti 202 hneď a pokračuje
--   v background workeri. Frontend musí vedieť stav (pending/done/error)
--   bez čakania na sync response.
--
--   premium_analysis_status: 'idle' | 'generating' | 'done' | 'error'
--   premium_analysis_started_at: kedy začalo
--   premium_analysis_error: error message ak status='error'
--
--   Supabase realtime subscription na leads UPDATE → frontend vie keď
--   status sa zmení na 'done' a otvor proposal.
-- ============================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS premium_analysis_status TEXT
  CHECK (premium_analysis_status IN ('idle', 'generating', 'done', 'error'))
  DEFAULT 'idle';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS premium_analysis_started_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS premium_analysis_error TEXT;
