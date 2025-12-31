-- =====================================================
-- ADLIFY - Templates Module (Šablóny)
-- =====================================================

-- Tabuľka šablón
CREATE TABLE IF NOT EXISTS templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Základné info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Typ a kategória
    type VARCHAR(50) NOT NULL CHECK (type IN ('email', 'sms', 'ad_text', 'report', 'proposal', 'other')),
    category VARCHAR(50),
    
    -- Obsah
    subject VARCHAR(255), -- pre emaily
    content TEXT NOT NULL,
    
    -- Premenné použité v šablóne
    variables JSONB DEFAULT '[]',
    
    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    usage_count INTEGER DEFAULT 0,
    
    -- Vlastník
    created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexy
CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(type);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_is_active ON templates(is_active);

-- RLS
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Templates viewable by team" ON templates;
CREATE POLICY "Templates viewable by team" ON templates 
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Templates insertable by team" ON templates;
CREATE POLICY "Templates insertable by team" ON templates 
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Templates updatable by team" ON templates;
CREATE POLICY "Templates updatable by team" ON templates 
    FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Templates deletable by team" ON templates;
CREATE POLICY "Templates deletable by team" ON templates 
    FOR DELETE TO authenticated USING (true);

-- Trigger pre updated_at
CREATE OR REPLACE FUNCTION update_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS templates_updated_at ON templates;
CREATE TRIGGER templates_updated_at
    BEFORE UPDATE ON templates
    FOR EACH ROW
    EXECUTE FUNCTION update_templates_updated_at();

-- Vložiť základné šablóny
INSERT INTO templates (name, type, category, subject, content, variables, is_default) VALUES
(
    'Úvodná ponuka',
    'email',
    'sales',
    'Ponuka marketingových služieb pre {company_name}',
    'Dobrý deň {contact_name},

ďakujem za Váš záujem o naše služby. Na základe analýzy Vášho webu {website} som pripravil ponuku na mieru.

**Odporúčaný balíček: {package_name}**
Cena: {package_price} €/mesiac

Čo získate:
- Profesionálnu správu reklamných kampaní
- Mesačné reporty a optimalizáciu
- Osobný prístup a konzultácie

Rád Vám ponuku predstavím osobne. Máte čas na krátky call tento týždeň?

S pozdravom,
{my_name}
{my_email}
{my_phone}',
    '["company_name", "contact_name", "website", "package_name", "package_price", "my_name", "my_email", "my_phone"]',
    true
),
(
    'Follow-up po 3 dňoch',
    'email',
    'sales',
    'Dobrý deň {contact_name} - otázka k ponuke',
    'Dobrý deň {contact_name},

chcel som sa opýtať, či ste mali príležitosť pozrieť si ponuku, ktorú som Vám posielal.

Ak máte akékoľvek otázky, rád ich zodpoviem. Môžeme sa spojiť na krátky 15-minútový call.

S pozdravom,
{my_name}',
    '["contact_name", "my_name"]',
    true
),
(
    'Follow-up po 7 dňoch',
    'email',
    'sales',
    'Posledná správa - {company_name}',
    'Dobrý deň {contact_name},

posielam poslednú správu ohľadom našej ponuky. Rozumiem, že ste zaneprázdnení.

Ak by ste mali záujem v budúcnosti, neváhajte sa ozvať. Rád pomôžem.

S pozdravom,
{my_name}',
    '["contact_name", "company_name", "my_name"]',
    true
),
(
    'Ďakovný email po schválení',
    'email',
    'onboarding',
    'Vitajte v Adlify! 🎉',
    'Dobrý deň {contact_name},

ďakujeme za dôveru a vitajte medzi našimi klientmi!

**Čo bude nasledovať:**
1. Do 24 hodín Vás budem kontaktovať ohľadom onboardingu
2. Pripravíme prístupy do klientského portálu
3. Začneme pracovať na Vašich kampaniach

Ak máte medzitým akékoľvek otázky, som k dispozícii.

S pozdravom,
{my_name}
{my_phone}',
    '["contact_name", "my_name", "my_phone"]',
    true
),
(
    'Upomienka faktúry',
    'email',
    'billing',
    'Upomienka - faktúra {invoice_number}',
    'Dobrý deň {contact_name},

dovoľujem si Vás upozorniť, že faktúra č. {invoice_number} vo výške {invoice_amount} € je po splatnosti.

Dátum splatnosti: {due_date}

Prosím o úhradu na účet uvedený vo faktúre. Ak ste už platbu realizovali, prosím ignorujte túto správu.

Ďakujem,
{my_name}',
    '["contact_name", "invoice_number", "invoice_amount", "due_date", "my_name"]',
    true
),
(
    'Google Search Ad - Základný',
    'ad_text',
    'google_ads',
    NULL,
    'Headline 1: {headline_1}
Headline 2: {headline_2}
Headline 3: {headline_3}
Description 1: {description_1}
Description 2: {description_2}
Path: {display_url}',
    '["headline_1", "headline_2", "headline_3", "description_1", "description_2", "display_url"]',
    true
)
ON CONFLICT DO NOTHING;

SELECT 'Templates module created successfully!' as status;
