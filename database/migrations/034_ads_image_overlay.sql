-- Image text overlay polia pre reklamy.
-- Užívateľské scenáre:
--   1. AI vygeneruje obrázok cez Nano Banana 2 (bez textu — "no text in image")
--   2. AI tiež navrhne KRÁTKY text ktorý sa má pridať NA OBRÁZOK ako overlay
--      (hook + CTA, 2-6 slov spolu) — typicky pre Display/Meta bannery
--   3. Admin vidí v Creatives wizard image preview + návrh overlay textu
--   4. Pri exporte / klient PDF sa overlay vykreslí cez canvas alebo CSS
--      (zatiaľ len ako návrh v JSONB poli, vykresľovanie príde neskôr)
--
-- Tiež image_style_notes — voľný text kde AI dáva tipy pre úpravy
-- (napr. "pre lepší impact pridať light leak efekt v ľavom hornom rohu",
-- "uistite sa že product je v pravej tretine kompozície").

ALTER TABLE ads
ADD COLUMN IF NOT EXISTS image_text_overlay JSONB DEFAULT NULL,
  -- { "headline": "Zľava 30%", "cta": "Kúpte teraz", "position": "top-right" | "bottom-left" | "center", "color": "#FFFFFF" | "auto" }
ADD COLUMN IF NOT EXISTS image_style_notes TEXT,
  -- Voľný text návrhy pre úpravy/efekty: "Light leak v rohu", "Pridať color grading: tmavý zelený tieň"
ADD COLUMN IF NOT EXISTS image_format TEXT DEFAULT 'photo';
  -- 'photo' | 'illustration' | '3d_render' | 'minimal_banner' | 'cinematic' | 'lifestyle'

COMMENT ON COLUMN ads.image_text_overlay IS
'JSONB { headline, cta, position, color } — krátky text ktorý sa pridá ako overlay NA obrázok pri post-processingu. Obrázok samotný negeneruje text (no text in image), text sa nakladá zvlášť cez canvas / Photoshop / Figma.';

COMMENT ON COLUMN ads.image_style_notes IS
'Tipy pre admin alebo dizajnéra na úpravy obrázka po vygenerovaní — color grading, efekty, retouching.';

COMMENT ON COLUMN ads.image_format IS
'Voliteľný klasifikátor formátu kreatívy. Slúži na filtrovanie a A/B testovanie po formáte (photo vs illustration vs minimal banner).';
