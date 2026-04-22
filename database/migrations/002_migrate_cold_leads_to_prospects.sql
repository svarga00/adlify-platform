-- ============================================
-- 📦 MIGRÁCIA COLD LEADS → PROSPECTS
-- Migration 002 (po 001)
--
-- Presúva z `leads` do `prospects` všetky záznamy, ktoré sú čisto "cold"
-- — teda ešte neklikli audit, nerezervovali call, nemajú project/client.
--
-- Kritérium "cold":
--   - outreach_stage IN ('pending','email_sent','email_opened')
--   - AND audit_requested_at IS NULL
--   - AND converted_to_client_id IS NULL
--   - AND status IN ('new','analyzing','ready','contacted')   -- nie negotiating/converted/lost
--
-- Ak `leads` ešte nemá outreach polia (čistá schema.sql), migrácia
-- bezpečne ošetrí NULL hodnoty cez COALESCE / try-catch-alike DO block.
-- ============================================

DO $$
DECLARE
  has_outreach_cols BOOLEAN;
BEGIN
  -- zisti či leads má outreach stĺpce
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'outreach_stage'
  ) INTO has_outreach_cols;

  IF NOT has_outreach_cols THEN
    RAISE NOTICE 'leads table nemá outreach stĺpce — žiadne dáta na migráciu.';
    RETURN;
  END IF;

  -- presun cold leadov
  WITH moved AS (
    INSERT INTO prospects (
      id, org_id, company_name, domain, industry, city,
      contact_person, email, phone,
      score, source, source_url, tags,
      outreach_stage, outreach_email_sent_at, outreach_email_opened_at,
      audit_token, audit_requested_at, audit_delivered_at, audit_viewed_at,
      notes, assigned_to, created_at, updated_at
    )
    SELECT
      l.id, l.org_id,
      l.company_name, l.domain,
      NULLIF((l.analysis->>'industry')::text, ''),
      NULLIF((l.analysis->>'city')::text, ''),
      NULLIF((l.analysis->>'contact_person')::text, ''),
      NULLIF((l.analysis->>'email')::text, ''),
      NULLIF((l.analysis->>'phone')::text, ''),
      COALESCE(l.score, 50),
      l.source, l.source_url, COALESCE(l.tags, '{}'),
      COALESCE(l.outreach_stage, 'pending'),
      l.outreach_email_sent_at,
      l.outreach_email_opened_at,
      l.audit_token,
      l.audit_requested_at,
      l.audit_delivered_at,
      l.audit_viewed_at,
      l.notes, l.assigned_to, l.created_at, l.updated_at
    FROM leads l
    WHERE COALESCE(l.outreach_stage, 'pending') IN ('pending','email_sent','email_opened')
      AND l.audit_requested_at IS NULL
      AND l.converted_to_client_id IS NULL
      AND COALESCE(l.status, 'new') IN ('new','analyzing','ready','contacted')
    RETURNING id
  )
  DELETE FROM leads WHERE id IN (SELECT id FROM moved);

  RAISE NOTICE 'Migrácia dokončená.';
END $$;
