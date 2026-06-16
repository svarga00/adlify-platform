-- Predĺženie textových stĺpcov na TEXT (bez limitu).
-- Pôvodná schéma mala niektoré pole ako VARCHAR(100), ale AI generuje
-- objektívy / názvy / popis ktoré môžu byť dlhšie.
--
-- Komplikácia: existuje view `v_campaigns` ktorý drží referenciu na
-- stĺpec campaigns.name → PostgreSQL nedovolí ALTER kým view existuje.
-- Riešenie: uložíme view definíciu, drop-neme ho, alteruje stĺpce,
-- recreate view s pôvodnou definíciou.

DO $$
DECLARE
  v_campaigns_def TEXT := NULL;
BEGIN
  -- 1. Uloží definíciu view ak existuje
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'v_campaigns') THEN
    SELECT pg_get_viewdef('v_campaigns'::regclass, true) INTO v_campaigns_def;
    EXECUTE 'DROP VIEW v_campaigns CASCADE';
    RAISE NOTICE 'Dropped view v_campaigns (uložená definícia, znovu vytvorím na konci)';
  END IF;

  -- 2. Alter columns na TEXT
  ALTER TABLE campaigns ALTER COLUMN name TYPE TEXT;
  ALTER TABLE campaigns ALTER COLUMN type TYPE TEXT;
  ALTER TABLE campaigns ALTER COLUMN external_id TYPE TEXT;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='objective') THEN
    EXECUTE 'ALTER TABLE campaigns ALTER COLUMN objective TYPE TEXT';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='campaign_type') THEN
    EXECUTE 'ALTER TABLE campaigns ALTER COLUMN campaign_type TYPE TEXT';
  END IF;

  -- ad_groups
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ad_groups' AND column_name='name') THEN
    EXECUTE 'ALTER TABLE ad_groups ALTER COLUMN name TYPE TEXT';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ad_groups' AND column_name='external_id') THEN
    EXECUTE 'ALTER TABLE ad_groups ALTER COLUMN external_id TYPE TEXT';
  END IF;

  -- ads
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ads' AND column_name='ad_type') THEN
    EXECUTE 'ALTER TABLE ads ALTER COLUMN ad_type TYPE TEXT';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ads' AND column_name='call_to_action') THEN
    EXECUTE 'ALTER TABLE ads ALTER COLUMN call_to_action TYPE TEXT';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ads' AND column_name='external_id') THEN
    EXECUTE 'ALTER TABLE ads ALTER COLUMN external_id TYPE TEXT';
  END IF;

  -- 3. Recreate view s pôvodnou definíciou
  IF v_campaigns_def IS NOT NULL THEN
    EXECUTE 'CREATE VIEW v_campaigns AS ' || v_campaigns_def;
    RAISE NOTICE 'Recreated view v_campaigns z uloženej definície';
  END IF;
END $$;

-- Diagnostika — vypíše ktoré stĺpce sú stále varchar (mal by vrátiť 0 riadkov)
SELECT table_name, column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name IN ('campaigns', 'ad_groups', 'ads')
  AND data_type = 'character varying'
ORDER BY table_name, column_name;
