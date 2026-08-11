-- Suppression list — globálny opt-out zoznam emailov ktoré sa NIKDY neposielajú.
-- Použitie:
--   1. User naimportuje starý opt-out zoznam (z Brevo / iného nástroja)
--   2. Trigger / aplikačná vrstva označí všetky existujúce prospects s týmto
--      emailom ako outreach_stage='unsubscribed' + stop enrollments
--   3. Pri novom imporch (Outscraper, manuálny CSV) sa emails z tohto zoznamu
--      preskakujú alebo importujú rovno ako unsubscribed
--
-- Globálne (nie per-user) — odhlásenie platí pre celú agentúru, nie len
-- pre konkrétnu kampaň. To je legal requirement (GDPR čl. 7, CASL §11).

CREATE TABLE IF NOT EXISTS email_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  reason TEXT,                  -- 'manual_opt_out', 'unsubscribe_link', 'spam_complaint', 'bounced_hard', 'gdpr_request', 'imported_legacy'
  source TEXT,                  -- 'brevo_export', 'manual_paste', 'csv_import', 'auto_unsubscribe_endpoint'
  notes TEXT,                   -- voľný komentár
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT               -- email admina ktorý zapísal
);

CREATE INDEX IF NOT EXISTS idx_email_suppressions_email ON email_suppressions(email);
CREATE INDEX IF NOT EXISTS idx_email_suppressions_created_at ON email_suppressions(created_at DESC);

COMMENT ON TABLE email_suppressions IS
'Globálny opt-out zoznam. Email v tejto tabuľke NIKDY nedostane outreach mail.
Bránime sa pri 3 vrstvách: Compose UI, Outscraper import, scheduler. Pri novom
prospect importu sa matching email označuje ako unsubscribed, ostáva v evidencii.';

-- RLS — len authentikovaní team členovia môžu čítať/zapisovať
ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_can_read_suppressions" ON email_suppressions;
CREATE POLICY "auth_can_read_suppressions" ON email_suppressions
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "auth_can_write_suppressions" ON email_suppressions;
CREATE POLICY "auth_can_write_suppressions" ON email_suppressions
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Diagnostika
SELECT COUNT(*) AS suppression_count FROM email_suppressions;
