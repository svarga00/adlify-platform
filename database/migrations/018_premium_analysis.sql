-- ============================================
-- MIGRÁCIA 018: premium_analysis (rozšírený analysis schema)
-- ============================================
-- Účel:
--   Claude Opus generuje rozšírený analysis JSON kompatibilný
--   s existing buildProposalHTML template. Uloží sa do
--   leads.premium_analysis (nie do leads.analysis, aby sa zachoval
--   pôvodný analysis pre backwards compat).
--
--   buildProposalHTML preferuje premium_analysis ak existuje.
-- ============================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS premium_analysis JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS premium_analysis_generated_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS premium_analysis_model TEXT;
