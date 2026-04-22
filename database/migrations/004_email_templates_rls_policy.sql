-- ============================================
-- FIX: email_templates RLS policy
-- Migration 004
--
-- Tabuľka email_templates mala RLS=ON, ale niektoré policy chýbali
-- pre authenticated team userov. Pridáme team-scope policy, ktorá
-- dovolí SELECT/INSERT/UPDATE/DELETE pre role v tíme.
-- ============================================

DROP POLICY IF EXISTS "Team can manage email templates" ON email_templates;

CREATE POLICY "Team can manage email templates" ON email_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin', 'manager', 'employee')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin', 'manager', 'employee')
    )
  );
