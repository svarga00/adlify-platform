-- A/B variants reklám.
-- Každá reklama má variant_label (A, B, C...) a variant_group_id ktoré spája
-- varianty patriace k tej istej kreatívnej "experimente". Varianty v rámci
-- jednej group majú rovnaký ad_group_id a final_url, ale rôzne
-- headlines/descriptions/image_prompt — testujú odlišné hook angle.
--
-- Použitie:
--   1. AI v generate-campaigns-background generuje 2 varianty per ad group
--      s odlišnými hook angles (cena vs benefity vs sociálny dôkaz)
--   2. UI v creatives wizard zobrazí Variant A / Variant B vedľa seba
--   3. Pri Google Ads Editor exporte sa varianty exportujú ako 2 RSA per
--      ad group (Google Ads to natívne podporuje — A/B test cez RSA)
--   4. Pri Meta Bulk exporte sa varianty exportujú ako 2 ads per ad set

ALTER TABLE ads
ADD COLUMN IF NOT EXISTS variant_label TEXT,         -- 'A', 'B', 'C'... default null = single ad
ADD COLUMN IF NOT EXISTS variant_group_id UUID,      -- spojuje varianty
ADD COLUMN IF NOT EXISTS variant_hook TEXT;          -- krátky popis prístupu (napr. "cena", "benefity", "sociálny dôkaz")

CREATE INDEX IF NOT EXISTS idx_ads_variant_group
  ON ads(variant_group_id) WHERE variant_group_id IS NOT NULL;

COMMENT ON COLUMN ads.variant_label IS
'Označenie variantu (A, B, C). NULL = single ad bez A/B testovania. Reklamy s rovnakým variant_group_id v rámci jednej ad group sú A/B varianty testujúce odlišné hook angles.';

COMMENT ON COLUMN ads.variant_hook IS
'Krátky popis "uhla" reklamy — napr. "Cena", "Benefity", "Sociálny dôkaz", "FOMO", "Otázka". Pomôže adminovi a klientovi rozumieť čo daná variant testuje.';
