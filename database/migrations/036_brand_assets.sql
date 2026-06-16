-- Brand assets — farby, logo, font, custom notes per klient.
-- Použité v AI generovaní image_prompt-ov (color palette) a image_text_overlay
-- (odporúčaná farba textu), plus v PDF/proposal mockupoch ako brand layer.
--
-- Per-client lebo brand je atribút klienta (nie projektu). Ak by klient
-- mal viacero sub-brándov, vytvorí sa nový "klient" pre každý.

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS brand_colors JSONB DEFAULT NULL,
  -- Pole hex farieb: ["#FF6B35", "#14120e", "#fafaf8"] — primary, secondary, accent
ADD COLUMN IF NOT EXISTS brand_font TEXT,
  -- Google Font name alebo voľný text: "Inter", "Poppins, Bold", "vlastný custom"
ADD COLUMN IF NOT EXISTS brand_logo_url TEXT,
  -- URL na logo klienta (z Supabase Storage alebo externý)
ADD COLUMN IF NOT EXISTS brand_voice_notes TEXT;
  -- Voľný text: "Vykáme, profesionálne ale nie korporátne, emoji NIE"

COMMENT ON COLUMN clients.brand_colors IS
'JSONB array hex farieb, prvá = primary, druhá = secondary, tretia = accent. Použije sa v AI image promptoch ako "color palette of #FF6B35, #14120e" + v overlay color="brand"';

COMMENT ON COLUMN clients.brand_voice_notes IS
'Doplnkové brand poznámky ktoré nie sú v onboardingu — napr. zakázané témy, slovník, špecifické inštrukcie pre copywriting.';
