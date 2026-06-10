-- Reklamné kreatívy + image prompts pre AI generované reklamy.
--
-- generate-campaigns LLM teraz vyrobí aj image_prompt pre Display/Meta reklamy
-- (Search ads obrázok nemajú). Admin si vygeneruje obrázok externe (DALL·E,
-- Midjourney, Flux) a uploadne URL — Display/Meta export potom má v CSV
-- skutočnú cestu k obrázku.
--
-- image_status flow:
--   pending  → AI vygenerovala prompt, čaká na obrázok
--   uploaded → admin pridal image_url, čaká na review
--   approved → schválené pre export do Ads Manageru
--   skipped  → reklama je Search-only alebo manuálne preskočená

-- ads tabuľka môže existovať v Supabase (vytvorená ad-hoc bez migration v repe).
-- Safety net: CREATE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_group_id UUID,
  ad_type TEXT DEFAULT 'responsive',
  headlines JSONB DEFAULT '[]',
  descriptions JSONB DEFAULT '[]',
  call_to_action TEXT,
  status TEXT DEFAULT 'draft',
  external_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ads
ADD COLUMN IF NOT EXISTS image_prompt TEXT,
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS image_alt_text TEXT,
ADD COLUMN IF NOT EXISTS image_aspect_ratio TEXT,
ADD COLUMN IF NOT EXISTS image_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS final_url TEXT,
ADD COLUMN IF NOT EXISTS path1 TEXT,
ADD COLUMN IF NOT EXISTS path2 TEXT;

COMMENT ON COLUMN ads.image_prompt IS
'AI-generovaný prompt pre obrazové generátory (DALL·E, Midjourney, Flux). Admin si ho skopíruje, vygeneruje obrázok externe a uploadne výsledok do image_url.';

COMMENT ON COLUMN ads.image_status IS
'pending = čaká na obrázok | uploaded = admin pridal URL | approved = pripravené na export | skipped = Search-only ad';

COMMENT ON COLUMN ads.image_aspect_ratio IS
'Preferovaný pomer strán pre platforma: 1:1 (Meta feed), 1.91:1 (Meta link/Google Display), 4:5 (Meta vertical), 9:16 (Stories/Reels)';

-- Ak ad_groups neexistuje, vytvor s minimálnou schémou
CREATE TABLE IF NOT EXISTS ad_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID,
  name TEXT,
  keywords JSONB DEFAULT '[]',
  negative_keywords JSONB DEFAULT '[]',
  status TEXT DEFAULT 'draft',
  external_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ad_groups
ADD COLUMN IF NOT EXISTS max_cpc NUMERIC,
ADD COLUMN IF NOT EXISTS default_final_url TEXT;

-- Index pre rýchle filtre podľa kreatívy
CREATE INDEX IF NOT EXISTS idx_ads_ad_group ON ads(ad_group_id);
CREATE INDEX IF NOT EXISTS idx_ads_image_status ON ads(image_status) WHERE image_status != 'approved';
CREATE INDEX IF NOT EXISTS idx_ad_groups_campaign ON ad_groups(campaign_id);
