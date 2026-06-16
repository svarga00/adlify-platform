-- Predĺženie textových stĺpcov na TEXT (bez limitu).
-- Pôvodná schéma mala niektoré pole ako VARCHAR(100), ale AI generuje
-- objektívy / názvy / popis ktoré môžu byť dlhšie (najmä keď zhrnie
-- sezónnosť + regiony + USP do jednej vety).
--
-- TEXT nemá memory overhead vs VARCHAR pre malé hodnoty, takže žiadne
-- performance issue.

-- Campaigns
ALTER TABLE campaigns ALTER COLUMN name TYPE TEXT;
ALTER TABLE campaigns ALTER COLUMN type TYPE TEXT;
ALTER TABLE campaigns ALTER COLUMN external_id TYPE TEXT;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='objective') THEN
    EXECUTE 'ALTER TABLE campaigns ALTER COLUMN objective TYPE TEXT';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='campaign_type') THEN
    EXECUTE 'ALTER TABLE campaigns ALTER COLUMN campaign_type TYPE TEXT';
  END IF;
END $$;

-- Ad groups
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ad_groups' AND column_name='name') THEN
    EXECUTE 'ALTER TABLE ad_groups ALTER COLUMN name TYPE TEXT';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ad_groups' AND column_name='external_id') THEN
    EXECUTE 'ALTER TABLE ad_groups ALTER COLUMN external_id TYPE TEXT';
  END IF;
END $$;

-- Ads
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ads' AND column_name='ad_type') THEN
    EXECUTE 'ALTER TABLE ads ALTER COLUMN ad_type TYPE TEXT';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ads' AND column_name='call_to_action') THEN
    EXECUTE 'ALTER TABLE ads ALTER COLUMN call_to_action TYPE TEXT';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ads' AND column_name='external_id') THEN
    EXECUTE 'ALTER TABLE ads ALTER COLUMN external_id TYPE TEXT';
  END IF;
END $$;

-- Diagnostika — vypíše ktoré stĺpce sú stále varchar
SELECT table_name, column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name IN ('campaigns', 'ad_groups', 'ads')
  AND data_type = 'character varying'
ORDER BY table_name, column_name;
-- Ak vráti riadky, povedz ktoré sú obmedzené — doplníme ALTER pre ne.
