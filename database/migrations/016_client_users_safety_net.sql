-- ============================================
-- MIGRÁCIA 016: client_users safety-net
-- ============================================
-- Účel:
--   Tabuľka `client_users` je v schema.sql definovaná (many-to-many medzi
--   auth.users a clients), ale **žiadna migrácia ju nevytvárala** — bola
--   len v schema.sql ktorý slúži ako referenčný snapshot a nikdy sa
--   nepúšťa. Tým pádom produkčné DB ju nemajú a všetky RLS policies
--   referenčujúce `(SELECT client_id FROM client_users WHERE user_id = auth.uid())`
--   padajú na "column client_id does not exist".
--
--   Táto migrácia ide v _run_all_safely.sql UPLNE NAJSKÔR (pred 001),
--   aby všetky neskoršie CREATE POLICY mali kam referenčovať.
--
-- Defenzívny prístup:
--   • CREATE TABLE IF NOT EXISTS — neprepíše ak existuje
--   • ALTER TABLE ... ADD COLUMN IF NOT EXISTS — garantuje stĺpce
--     aj keby tabuľka už existovala s odlišnou schémou
-- ============================================

-- 1. Tabuľka client_users (skopírovaná zo schema.sql)
CREATE TABLE IF NOT EXISTS client_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID,
  user_id UUID,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  permissions JSONB DEFAULT '{
    "dashboard": {"view": true},
    "campaigns": {"view": true},
    "reports": {"view": true, "export": true},
    "invoices": {"view": true},
    "messages": {"view": true, "send": true},
    "settings": {"view": true, "edit": false}
  }',
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Garantuj stĺpce aj keby tabuľka už existovala s odlišnou schémou
ALTER TABLE client_users ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE client_users ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE client_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';
ALTER TABLE client_users ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;
ALTER TABLE client_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 3. FK constraints — pridať len ak chýbajú (defenzívne cez DO $$)
DO $$
BEGIN
  -- client_id → clients(id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_users_client_id_fkey'
  ) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clients') THEN
    ALTER TABLE client_users
      ADD CONSTRAINT client_users_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  END IF;

  -- user_id → user_profiles(id) alebo auth.users(id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_users_user_id_fkey'
  ) THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_profiles') THEN
      ALTER TABLE client_users
        ADD CONSTRAINT client_users_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- 4. Indexy na rýchle lookupy
CREATE INDEX IF NOT EXISTS idx_client_users_user_id ON client_users(user_id);
CREATE INDEX IF NOT EXISTS idx_client_users_client_id ON client_users(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_users_unique_pair
  ON client_users(client_id, user_id)
  WHERE client_id IS NOT NULL AND user_id IS NOT NULL;

-- 5. RLS — klient vidí svoj záznam, tím vidí všetko
ALTER TABLE client_users ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='client_users' AND policyname='Users can view own client_users') THEN
    CREATE POLICY "Users can view own client_users" ON client_users
      FOR SELECT USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='client_users' AND policyname='Team can manage client_users') THEN
    CREATE POLICY "Team can manage client_users" ON client_users
      FOR ALL USING (EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid()));
  END IF;
END $$;
