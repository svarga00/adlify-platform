-- Safety net: chýbajúce stĺpce na campaign_projects.
-- generate-campaigns Edge fn updatuje tieto polia po dokončení AI, ale
-- ich neexistencia spôsobuje SILENT UPDATE FAILURE (PostgREST vráti
-- 200 OK ale dáta sa nezapíšu, lebo všetky updaty sú no-op). Výsledok:
-- projekt ostane v statuse 'generating' aj keď AI dobehla úspešne.
--
-- Bug objavený pri Saturn Klima case 2026-06-15: onboarding bol submitted,
-- Edge fn dokončila generovanie, kampane vznikli v `campaigns` tabuľke,
-- ale `campaign_projects.status` ostal 'generating' a notes/strategy
-- update silently fail-li.

ALTER TABLE campaign_projects
ADD COLUMN IF NOT EXISTS onboarding_id UUID,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS strategy_summary TEXT,
ADD COLUMN IF NOT EXISTS business_analysis JSONB,
ADD COLUMN IF NOT EXISTS research_data JSONB,
ADD COLUMN IF NOT EXISTS expected_results JSONB,
ADD COLUMN IF NOT EXISTS timeline JSONB,
ADD COLUMN IF NOT EXISTS budget_breakdown JSONB,
ADD COLUMN IF NOT EXISTS next_steps JSONB,
ADD COLUMN IF NOT EXISTS ad_spend_budget NUMERIC,
ADD COLUMN IF NOT EXISTS management_fee NUMERIC,
ADD COLUMN IF NOT EXISTS total_monthly_budget NUMERIC,
ADD COLUMN IF NOT EXISTS proposal_version INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS client_portal_token TEXT,
ADD COLUMN IF NOT EXISTS internal_approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS client_approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS revision_reason TEXT,
ADD COLUMN IF NOT EXISTS actual_start_date DATE;

CREATE INDEX IF NOT EXISTS idx_campaign_projects_status ON campaign_projects(status);
CREATE INDEX IF NOT EXISTS idx_campaign_projects_onboarding ON campaign_projects(onboarding_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_projects_portal_token
  ON campaign_projects(client_portal_token) WHERE client_portal_token IS NOT NULL;

COMMENT ON COLUMN campaign_projects.notes IS
'Voľný text — najmä error notes z generate-campaigns pri zlyhaní (status reset z generating na draft + dôvod).';

COMMENT ON COLUMN campaign_projects.business_analysis IS
'JSONB output z AI: summary, key_insights, challenges, opportunities. Vykresľované klientovi v portal/proposal.html.';

-- Auto-fix: ak má projekt v stave generating už vyrobené kampane, povýš ho
-- do internal_review (Edge fn dokončila ale update statusu padol kvôli
-- chýbajúcim stĺpcom — týmto migrate-om to retroaktívne opravíme)
UPDATE campaign_projects p
SET status = 'internal_review'
WHERE status = 'generating'
  AND EXISTS (SELECT 1 FROM campaigns c WHERE c.project_id = p.id);
