-- ============================================
-- MIGRÁCIA 022: messages legacy NOT NULL fixes
-- ============================================
-- Účel:
--   Produkčná DB má messages.subject ako NOT NULL (legacy email schema),
--   ale klient cez portál nemá ako zadať subject. Frontend síce defensively
--   posiela subject z prvých 80 znakov content, ale dropom NOT NULL
--   garantujeme že INSERT prejde aj keby frontend zabudol.
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='subject' AND is_nullable='NO') THEN
    ALTER TABLE messages ALTER COLUMN subject DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='sender_type' AND is_nullable='NO') THEN
    -- sender_type ostáva NOT NULL — je business logic dôležitý
    NULL;
  END IF;
END $$;
