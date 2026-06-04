-- Lead email bounce tracking.
-- Resend webhook prijíma email.bounced eventy a označí lead.
-- proposal_bounced_at: kedy bounce nastal (null = email šiel v poriadku)
-- proposal_bounce_reason: dôvod (z Resend payload.bounce.subType / message)

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS proposal_bounced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS proposal_bounce_reason TEXT;

COMMENT ON COLUMN leads.proposal_bounced_at IS
'Kedy Resend ohlásil bounce pre proposal email. Null = email prešiel OK alebo ešte nedošlo k bounce. Nastavuje resend-webhook.js cez email.bounced event.';

COMMENT ON COLUMN leads.proposal_bounce_reason IS
'Dôvod bounce z Resend payloadu (hard/soft, message). Používa sa v UI ako tooltip a v history timeline.';

CREATE INDEX IF NOT EXISTS idx_leads_bounced ON leads(proposal_bounced_at) WHERE proposal_bounced_at IS NOT NULL;
