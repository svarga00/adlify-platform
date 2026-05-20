-- ============================================
-- MIGRÁCIA 011: Messages — UPDATE policy pre klienta + realtime publication
-- ============================================
-- Účel:
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
