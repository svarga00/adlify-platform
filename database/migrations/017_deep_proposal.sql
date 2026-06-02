-- ============================================
-- MIGRÁCIA 017: deep_proposal cache na leads
-- ============================================
-- Účel:
--   Cache pre AI generovaný detailný proposal (Claude Opus, 30-60s
--   generácia). Bez cache by user musel pri každom otvorení PDF/HTML
--   znova platiť API call ($0.30-0.80/proposal).
--
--   Štruktúra deep_proposal JSONB obsahuje 12 sekcií:
--   executive_summary, situation_analysis, competitive_landscape,
--   target_audience, keywords (array s VL+CPC), strategy (kanály),
--   campaigns (jednotlivé), budget_breakdown, kpi_targets, timeline,
--   risks, next_steps
--
--   deep_proposal_generated_at — kedy bol generovaný (pre "regenerate
--   if older than 30 days" logika v UI)
--
--   deep_proposal_model — ktorý model bol použitý (claude-opus-4-8 /
--   claude-sonnet-4-6), pre traceability ak user zmení nastavenie
-- ============================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS deep_proposal JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deep_proposal_generated_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deep_proposal_model TEXT;
