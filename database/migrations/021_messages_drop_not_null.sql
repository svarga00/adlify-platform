-- ============================================
-- MIGRÁCIA 021: messages legacy columns DROP NOT NULL
-- ============================================
-- Účel:
--   Produkčné DB ktoré boli založené pred týmto repom môžu mať na
--   messages tabuľke legacy stĺpce s NOT NULL constraintom (napríklad
--   from_email, from_name, atď.) z pôvodnej staršej schémy.
--
--   Nový kód (portal/index.html) tieto polia neposiela pri INSERT do
--   messages → "null value in column from_email violates not-null
--   constraint" chyba.
--
--   Fix: DROP NOT NULL constraint defenzívne pre stĺpce ak existujú.
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='from_email') THEN
    ALTER TABLE messages ALTER COLUMN from_email DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='from_name') THEN
    ALTER TABLE messages ALTER COLUMN from_name DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='to_email') THEN
    ALTER TABLE messages ALTER COLUMN to_email DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='message_type') THEN
    ALTER TABLE messages ALTER COLUMN message_type DROP NOT NULL;
  END IF;
END $$;
