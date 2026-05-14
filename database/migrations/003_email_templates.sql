-- ============================================
-- EMAIL TEMPLATES — outreach extension
-- Migration 003
--
-- Tabuľka email_templates už existuje (schéma: slug, html_content, plain_text, ...).
-- Pridáme len org_id a seed 3 outreach šablón pre default org.
-- ============================================

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001';

UPDATE email_templates SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_templates_org_slug ON email_templates(org_id, slug);
CREATE INDEX IF NOT EXISTS idx_email_templates_org_category ON email_templates(org_id, category);

-- Seed 3 outreach šablón (iba ak slug ešte neexistuje)
INSERT INTO email_templates (org_id, slug, name, description, category, subject, plain_text, variables, is_system, is_active)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'cold_outreach_audit',
  'Cold outreach – ponuka auditu',
  'Prvý kontakt s prospektom. Ponúka bezplatný mini-audit.',
  'outreach',
  '{{company}} — ponuka bezplatného mini-auditu',
  E'{{greeting}},\n\nvšimol som si {{company}}{{industry_hook}}.\n\nV týchto dňoch pripravujem 5 bezplatných mini-auditov pre vybrané firmy. Konkrétne 3 body čo zlepšiť hneď, ako to robí konkurencia, a kde sú peniaze ktoré teraz unikajú.\n\nŽiadne záväzky, žiadny predaj — len analýza ako keby som ju robil pre seba.\n\nChcem audit zadarmo: {{audit_request_url}}\n\n(Doručím do 48 hodín, 5 voľných miest)\n\nS pozdravom,\n{{sender_name}}\n{{sender_title}}\ninfo@adlify.eu | +421 944 184 045\n\nP.S. Ak nemáte záujem, ignorujte prosím tento email — nebudem písať druhýkrát.',
  '["greeting","contact_name","company","domain","industry","industry_hook","city","audit_request_url","sender_name","sender_title"]'::jsonb,
  TRUE,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE slug = 'cold_outreach_audit');

INSERT INTO email_templates (org_id, slug, name, description, category, subject, plain_text, variables, is_system, is_active)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'audit_delivered',
  'Audit hotový – doručenie',
  'Informuje prospekta že audit je pripravený a posiela link.',
  'outreach',
  'Váš mini-audit pre {{company}} je hotový',
  E'{{greeting}},\n\npodľa sľubu — váš mini-audit pre {{company}} je hotový.\n\nPozrel som sa na váš web, sociálne siete, aktuálne reklamy a porovnal vás s konkurenciou. V audite nájdete 3 konkrétne body ktoré ovplyvňujú vašu výkonnosť — a ako to riešia firmy ktorým sa darí.\n\nPozrieť audit: {{audit_url}}\n\n(Audit ostane dostupný 30 dní)\n\nS pozdravom,\n{{sender_name}}\n{{sender_title}}\ninfo@adlify.eu',
  '["greeting","contact_name","company","domain","audit_url","sender_name","sender_title"]'::jsonb,
  TRUE,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE slug = 'audit_delivered');

INSERT INTO email_templates (org_id, slug, name, description, category, subject, plain_text, variables, is_system, is_active)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'call_booking_confirmation',
  'Potvrdenie rezervácie hovoru',
  'Pošle sa automaticky po rezervácii 15-min hovoru.',
  'transactional',
  'Potvrdenie rezervácie — {{scheduled_at_formatted}}',
  E'{{greeting}},\n\nďakujem za rezerváciu hovoru.\n\nTermín: {{scheduled_at_formatted}}\nTrvanie: {{duration_minutes}} minút (telefonicky)\n{{topic_line}}\n\nPozvánka do kalendára je v prílohe (.ics). Ak potrebujete termín presunúť, jednoducho odpíšte na tento email.\n\nS pozdravom,\n{{sender_name}}\n{{sender_title}}\nAdlify',
  '["greeting","contact_name","company","scheduled_at_formatted","duration_minutes","topic","topic_line","sender_name","sender_title"]'::jsonb,
  TRUE,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE slug = 'call_booking_confirmation');
