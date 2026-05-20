-- ============================================
-- MIGRÁCIA 011: Messages — schema repair + UPDATE policy pre klienta + realtime publication
-- ============================================
-- Účel:
--   0. Existujúce DB môžu mať `messages` tabuľku staršiu ako schema.sql
--      opisuje (chýbajúce stĺpce sender_type/is_read/read_at/...). Najprv
--      schema doplníme, až potom riešime RLS a indexy.
--   1. Klient potrebuje označiť tímové správy ako prečítané
--      (UPDATE is_read, read_at). Existujúce policies riešia len
--      SELECT a INSERT.
--   2. Tabuľka `messages` musí byť súčasťou `supabase_realtime`
--      publication, aby Supabase realtime channel posielal INSERT
--      eventy do portál UI.
--   3. Pomocné indexy pre rýchle filtrovanie po client_id + is_read.
--
-- Idempotentnosť: všetko `IF NOT EXISTS` / `DO` block s catchom.
-- ============================================

-- ───── 0. Schema repair — doplnenie chýbajúcich stĺpcov ─────
-- Pre prípady kedy existujúca DB má staršiu verziu `messages` tabuľky
-- (napr. bez `sender_type`, `is_read`, `read_at`). Pridávame stĺpce z
-- schema.sql aby zvyšok migrácie nepadol s "column does not exist".
ALTER TABLE messages ADD COLUMN IF NOT EXISTS org_id      UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_id   UUID REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_id   UUID REFERENCES user_profiles(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_type TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS subject     TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS content     TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read     BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at     TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ DEFAULT NOW();

-- Backfill: existujúce správy bez sender_type predpokladajme že boli od tímu
-- (najčastejší prípad pri starých záznamoch z admin tooly).
UPDATE messages SET sender_type = 'team' WHERE sender_type IS NULL;

-- CHECK constraint na sender_type (ak ešte neexistuje)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_sender_type_check'
      AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_sender_type_check
      CHECK (sender_type IN ('team', 'client'));
  END IF;
END $$;

-- NOT NULL na sender_type (po backfille je bezpečné)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages'
      AND column_name = 'sender_type' AND is_nullable = 'YES'
  ) AND NOT EXISTS (
    SELECT 1 FROM messages WHERE sender_type IS NULL
  ) THEN
    ALTER TABLE messages ALTER COLUMN sender_type SET NOT NULL;
  END IF;
END $$;

-- ───── 1. UPDATE policy pre klienta (mark as read) ─────
-- Klient môže UPDATE-ovať len správy vlastnej firmy. WITH CHECK ho viaže
-- na rovnakú podmienku, takže nemôže "presunúť" správu na cudzieho klienta.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'messages'
      AND policyname = 'Clients can mark own messages as read'
  ) THEN
    CREATE POLICY "Clients can mark own messages as read" ON messages
      FOR UPDATE
      USING (
        client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid())
      )
      WITH CHECK (
        client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- ───── 2. Realtime publication — pridať messages tabuľku ─────
-- `supabase_realtime` je default publication v Supabase. Ak už messages
-- v nej je, ALTER zlyhá s "already member"; preto wrap v DO block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    -- supabase_realtime publication neexistuje (lokálny / self-hosted setup bez Supabase realtime)
    RAISE NOTICE 'supabase_realtime publication nenájdená — preskakujem ADD TABLE messages';
END $$;

-- ───── 3. Pomocný index pre unread badge query ─────
CREATE INDEX IF NOT EXISTS idx_messages_client_unread
  ON messages (client_id, sender_type, is_read)
  WHERE is_read = false;
