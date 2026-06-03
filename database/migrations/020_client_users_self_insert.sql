-- ============================================
-- MIGRÁCIA 020: client_users INSERT policy + signup self-link
-- ============================================
-- Účel:
--   Pri portal/register.html → db.auth.signUp() klient vytvorí auth user
--   a hneď vykoná INSERT do client_users (client_id, user_id, ...).
--   ALE: policy "Team can manage client_users" (z migrácie 016) povoľuje
--   FOR ALL iba team_members. Klient sa nepovažuje za team member →
--   INSERT zlyhá → klient sa nemôže prihlásiť ("účet nie je prepojený
--   so žiadnou firmou").
--
--   Fix: pridať INSERT policy ktorá povolí každému authenticated userovi
--   vytvoriť client_users záznam **pre seba** (user_id = auth.uid()).
--   Toto je bezpečné — nemôžeš sa pripojiť k cudziemu klientovi bez
--   poznania ich UUID, a aj keby si poznal, vidíš iba svoje vlastné
--   záznamy (existujúca SELECT policy "Users can view own client_users").
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='client_users' AND policyname='Users can insert own client_users') THEN
    CREATE POLICY "Users can insert own client_users" ON client_users
      FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
