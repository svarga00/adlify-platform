-- ============================================
-- ADLIFY PLATFORM - COMPLETE NEW ARCHITECTURE
-- Migration: 020_complete_new_architecture.sql
-- Date: 2025-01-28
-- 
-- Nová architektúra:
-- • Contacts (ľudia) ↔ Companies (firmy) - many-to-many
-- • Deals (pipeline) → Engagements (aktívne spolupráce)
-- • Conversations (unified inbox) - email/chat/ticket
-- ============================================

-- ============================================
-- PHASE 1: CREATE TABLES
-- ============================================

-- 👤 CONTACTS (ľudia - oddelené od firiem)
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
    
    -- Základné info
    first_name TEXT NOT NULL,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    
    -- Sociálne siete
    linkedin_url TEXT,
    
    -- Avatar
    avatar_url TEXT,
    
    -- Poznámky a tagy
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    
    -- Vlastné polia (flexibilné)
    custom_fields JSONB DEFAULT '{}',
    
    -- Meta
    source TEXT,  -- odkiaľ prišiel kontakt (marketing_miner, website, referral)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 🏢 COMPANIES (firmy)
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
    
    -- Základné info
    name TEXT NOT NULL,
    domain TEXT,
    logo_url TEXT,
    
    -- Firemné údaje
    ico TEXT,
    dic TEXT,
    ic_dph TEXT,
    
    -- Adresa
    street TEXT,
    city TEXT,
    zip TEXT,
    country TEXT DEFAULT 'SK',
    
    -- Biznis info
    industry TEXT,
    employee_count TEXT,  -- '1-10', '11-50', '51-200', '200+'
    annual_revenue TEXT,
    website TEXT,
    
    -- Poznámky a tagy  
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    
    -- Vlastné polia
    custom_fields JSONB DEFAULT '{}',
    
    -- Meta
    source TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 🔗 CONTACT ↔ COMPANY (many-to-many prepojenie)
CREATE TABLE IF NOT EXISTS contact_company_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
    
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Vzťah
    role TEXT,  -- 'CEO', 'Marketing Manager', 'Asistent'
    is_primary BOOLEAN DEFAULT false,  -- primárny kontakt pre firmu
    is_decision_maker BOOLEAN DEFAULT false,
    is_billing_contact BOOLEAN DEFAULT false,
    
    -- Meta
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(org_id, contact_id, company_id)
);

-- 📊 DEALS (obchodné príležitosti v pipeline)
CREATE TABLE IF NOT EXISTS deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
    
    -- Prepojenia
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    
    -- Deal info
    title TEXT NOT NULL,
    value DECIMAL(12,2),
    currency TEXT DEFAULT 'EUR',
    
    -- Pipeline stage
    stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN (
        'new',           -- Nový lead
        'qualified',     -- Kvalifikovaný
        'proposal',      -- Odoslaná ponuka
        'negotiation',   -- Vyjednávanie
        'won',           -- Vyhratý
        'lost'           -- Prehratý
    )),
    
    -- Pravdepodobnosť a priority
    probability INTEGER DEFAULT 50 CHECK (probability >= 0 AND probability <= 100),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    
    -- Dátumy
    expected_close_date DATE,
    actual_close_date DATE,
    
    -- Dôvod prehry/výhry
    close_reason TEXT,
    
    -- Zdroj
    source TEXT,  -- 'marketing_miner', 'referral', 'website', 'cold_outreach'
    
    -- Priradenie
    assigned_to UUID REFERENCES user_profiles(id),
    
    -- Poznámky
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    
    -- AI analýza (z leads modulu)
    analysis JSONB DEFAULT '{}',
    
    -- Proposal tracking
    proposal_sent_at TIMESTAMPTZ,
    proposal_viewed_at TIMESTAMPTZ,
    proposal_response TEXT, -- 'interested', 'not_interested', 'later'
    
    -- Meta
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    stage_changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 📜 DEAL ACTIVITIES (história dealu)
CREATE TABLE IF NOT EXISTS deal_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    
    -- Typ aktivity
    activity_type TEXT NOT NULL CHECK (activity_type IN (
        'stage_change',  -- Zmena stage
        'note',          -- Poznámka
        'email',         -- Email
        'call',          -- Hovor
        'meeting',       -- Schôdzka
        'proposal',      -- Ponuka odoslaná
        'system'         -- Systémová správa
    )),
    
    -- Obsah
    title TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',  -- stage_from, stage_to, atď
    
    -- Kto
    user_id UUID REFERENCES user_profiles(id),
    user_name TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 🤝 ENGAGEMENTS (aktívne spolupráce - keď deal = won)
CREATE TABLE IF NOT EXISTS engagements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
    
    -- Prepojenia
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
    primary_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    
    -- Info
    name TEXT NOT NULL,  -- napr. "Google Ads Management 2025"
    
    -- Balíček a ceny
    package TEXT CHECK (package IN ('starter', 'growth', 'professional', 'enterprise', 'custom')),
    monthly_fee DECIMAL(10,2),
    setup_fee DECIMAL(10,2) DEFAULT 0,
    ad_budget_monthly DECIMAL(10,2),
    
    -- Stav
    status TEXT DEFAULT 'onboarding' CHECK (status IN (
        'onboarding',    -- Nastavuje sa
        'active',        -- Aktívna spolupráca
        'paused',        -- Pozastavená
        'cancelled'      -- Ukončená
    )),
    
    -- Dátumy
    start_date DATE,
    end_date DATE,
    billing_day INTEGER DEFAULT 1,
    next_billing_date DATE,
    
    -- Služby (čo poskytujeme)
    services JSONB DEFAULT '[]', -- [{type: 'google_ads', account_id: 'xxx'}, ...]
    
    -- Priradenie
    assigned_to UUID REFERENCES user_profiles(id),
    
    -- Onboarding progress
    onboarding_completed_at TIMESTAMPTZ,
    onboarding_data JSONB DEFAULT '{}',
    
    -- Zdravie klienta (pre churn prediction)
    health_score INTEGER DEFAULT 100,
    last_interaction_at TIMESTAMPTZ,
    
    -- Poznámky
    notes TEXT,
    
    -- Meta
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 💬 CONVERSATIONS (unified inbox)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
    
    -- Prepojenia (môže byť jedno alebo viac)
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
    engagement_id UUID REFERENCES engagements(id) ON DELETE SET NULL,
    
    -- Typ konverzácie
    channel TEXT NOT NULL CHECK (channel IN ('email', 'chat', 'sms', 'whatsapp', 'facebook', 'instagram', 'phone', 'internal')),
    
    -- Stav
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'spam')),
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    
    -- Je to ticket?
    is_ticket BOOLEAN DEFAULT false,
    ticket_number TEXT,
    
    -- Subject (pre emaily)
    subject TEXT,
    
    -- Priradenie
    assigned_to UUID REFERENCES user_profiles(id),
    
    -- AI
    ai_sentiment DECIMAL(3,2), -- -1.0 až +1.0
    ai_intent TEXT,
    ai_can_auto_respond BOOLEAN DEFAULT false,
    
    -- Štatistiky
    message_count INTEGER DEFAULT 0,
    unread_count INTEGER DEFAULT 0,
    
    -- Posledná správa
    last_message_at TIMESTAMPTZ,
    last_message_preview TEXT,
    last_message_sender TEXT, -- 'contact', 'agent', 'bot'
    
    -- SLA tracking
    first_response_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    
    -- Meta
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 💬 MESSAGES (správy v konverzáciách)
CREATE TABLE IF NOT EXISTS conversation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    
    -- Odosielateľ
    sender_type TEXT NOT NULL CHECK (sender_type IN ('contact', 'agent', 'bot', 'system')),
    sender_id UUID,  -- contact_id alebo user_id
    sender_name TEXT,
    sender_email TEXT,
    
    -- Obsah
    content TEXT NOT NULL,
    content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'html', 'markdown')),
    
    -- Prílohy
    attachments JSONB DEFAULT '[]',  -- [{name, url, type, size}]
    
    -- Pre emaily
    email_message_id TEXT,
    email_subject TEXT,
    email_in_reply_to TEXT,
    
    -- Interné poznámky (klient nevidí)
    is_internal BOOLEAN DEFAULT false,
    
    -- AI
    is_ai_generated BOOLEAN DEFAULT false,
    is_ai_draft BOOLEAN DEFAULT false,  -- čaká na schválenie
    ai_confidence DECIMAL(3,2),
    ai_approved_by UUID REFERENCES user_profiles(id),
    ai_approved_at TIMESTAMPTZ,
    
    -- Prečítanie
    read_at TIMESTAMPTZ,
    
    -- Meta
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 🔔 ALERTS (pre DESK - čo vyžaduje pozornosť)
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
    
    -- Typ
    alert_type TEXT NOT NULL CHECK (alert_type IN (
        'unhappy_client',      -- Nespokojný klient (sentiment)
        'overdue_invoice',     -- Faktúra po splatnosti
        'low_performance',     -- Slabý výkon kampane
        'awaiting_response',   -- Čaká na odpoveď
        'awaiting_approval',   -- Schválenie čaká
        'churn_risk',          -- Riziko odchodu
        'system'               -- Systémový alert
    )),
    
    -- Urgencia
    severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    
    -- Prepojenia
    entity_type TEXT, -- 'conversation', 'engagement', 'campaign', 'invoice'
    entity_id UUID,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Obsah
    title TEXT NOT NULL,
    description TEXT,
    action_url TEXT,
    
    -- Stav
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
    
    -- Kto to riešil
    resolved_by UUID REFERENCES user_profiles(id),
    resolved_at TIMESTAMPTZ,
    
    -- Meta
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- ============================================
-- PHASE 2: INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(org_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_search ON contacts USING GIN (to_tsvector('simple', coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(email,'')));

CREATE INDEX IF NOT EXISTS idx_companies_org ON companies(org_id);
CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain);
CREATE INDEX IF NOT EXISTS idx_companies_search ON companies USING GIN (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(domain,'')));

CREATE INDEX IF NOT EXISTS idx_contact_company_contact ON contact_company_links(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_company_company ON contact_company_links(company_id);

CREATE INDEX IF NOT EXISTS idx_deals_org ON deals(org_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_company ON deals(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_assigned ON deals(assigned_to);
CREATE INDEX IF NOT EXISTS idx_deals_created ON deals(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deal_activities_deal ON deal_activities(deal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_engagements_org ON engagements(org_id);
CREATE INDEX IF NOT EXISTS idx_engagements_company ON engagements(company_id);
CREATE INDEX IF NOT EXISTS idx_engagements_status ON engagements(status);

CREATE INDEX IF NOT EXISTS idx_conversations_org ON conversations(org_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_company ON conversations(company_id);
CREATE INDEX IF NOT EXISTS idx_conversations_engagement ON conversations(engagement_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON conversations(assigned_to);

CREATE INDEX IF NOT EXISTS idx_conv_messages_conv ON conversation_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_messages_draft ON conversation_messages(is_ai_draft) WHERE is_ai_draft = true;

CREATE INDEX IF NOT EXISTS idx_alerts_org ON alerts(org_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(org_id) WHERE status = 'active';

-- ============================================
-- PHASE 3: MIGRATE EXISTING DATA
-- ============================================

-- Migrácia existujúcich leadov do deals
INSERT INTO deals (
    id, org_id, title, stage, source, analysis, 
    assigned_to, notes, tags, probability, priority,
    created_at, updated_at
)
SELECT 
    l.id,
    l.org_id,
    COALESCE(l.company_name, l.domain, 'Neznámy lead'),
    CASE l.status
        WHEN 'new' THEN 'new'
        WHEN 'analyzing' THEN 'new'
        WHEN 'ready' THEN 'qualified'
        WHEN 'contacted' THEN 'qualified'
        WHEN 'negotiating' THEN 'negotiation'
        WHEN 'converted' THEN 'won'
        WHEN 'lost' THEN 'lost'
        ELSE 'new'
    END,
    l.source,
    l.analysis,
    l.assigned_to,
    l.notes,
    l.tags,
    COALESCE(l.score, 50),
    CASE 
        WHEN l.score > 70 THEN 'high'
        WHEN l.score > 40 THEN 'medium'
        ELSE 'low'
    END,
    l.created_at,
    l.updated_at
FROM leads l
WHERE NOT EXISTS (SELECT 1 FROM deals WHERE deals.id = l.id)
ON CONFLICT (id) DO NOTHING;

-- Vytvor companies z existujúcich clients
INSERT INTO companies (
    id, org_id, name, domain, ico, dic, ic_dph,
    street, city, zip, country, industry, website, notes, tags,
    created_at, updated_at
)
SELECT
    c.id,
    c.org_id,
    c.company_name,
    c.website,
    c.ico,
    c.dic,
    c.ic_dph,
    c.street,
    c.city,
    c.zip,
    c.country,
    c.industry,
    c.website,
    c.notes,
    c.tags,
    c.created_at,
    c.updated_at
FROM clients c
WHERE c.company_name IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM companies WHERE companies.id = c.id)
ON CONFLICT (id) DO NOTHING;

-- Vytvor contacts z existujúcich clients
INSERT INTO contacts (
    org_id, first_name, email, phone, source, created_at
)
SELECT 
    c.org_id,
    COALESCE(c.contact_person, 'Kontakt'),
    c.email,
    c.phone,
    'migrated_from_clients',
    c.created_at
FROM clients c
WHERE (c.contact_person IS NOT NULL OR c.email IS NOT NULL)
AND NOT EXISTS (
    SELECT 1 FROM contacts 
    WHERE contacts.email = c.email 
    AND contacts.org_id = c.org_id
)
ON CONFLICT DO NOTHING;

-- Vytvor engagements z existujúcich aktívnych clients
INSERT INTO engagements (
    org_id, company_id, name, package, monthly_fee,
    status, start_date, billing_day, assigned_to, notes,
    created_at, updated_at
)
SELECT
    c.org_id,
    c.id, -- company_id = client.id (migrated above)
    c.company_name || ' - Spolupráca',
    c.package,
    c.monthly_fee,
    CASE c.status
        WHEN 'active' THEN 'active'
        WHEN 'trial' THEN 'onboarding'
        WHEN 'paused' THEN 'paused'
        WHEN 'cancelled' THEN 'cancelled'
        ELSE 'active'
    END,
    c.contract_start,
    c.billing_day,
    c.assigned_to,
    c.notes,
    c.created_at,
    c.updated_at
FROM clients c
WHERE c.status IN ('active', 'trial', 'paused')
AND EXISTS (SELECT 1 FROM companies WHERE companies.id = c.id)
AND NOT EXISTS (SELECT 1 FROM engagements WHERE engagements.company_id = c.id)
ON CONFLICT DO NOTHING;

-- ============================================
-- PHASE 4: RLS POLICIES
-- ============================================

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_company_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if exist
DROP POLICY IF EXISTS "contacts_all" ON contacts;
DROP POLICY IF EXISTS "companies_all" ON companies;
DROP POLICY IF EXISTS "contact_company_links_all" ON contact_company_links;
DROP POLICY IF EXISTS "deals_all" ON deals;
DROP POLICY IF EXISTS "deal_activities_all" ON deal_activities;
DROP POLICY IF EXISTS "engagements_all" ON engagements;
DROP POLICY IF EXISTS "conversations_all" ON conversations;
DROP POLICY IF EXISTS "conversation_messages_all" ON conversation_messages;
DROP POLICY IF EXISTS "alerts_all" ON alerts;

-- Policies pre authenticated users
CREATE POLICY "contacts_all" ON contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "companies_all" ON companies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "contact_company_links_all" ON contact_company_links FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "deals_all" ON deals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "deal_activities_all" ON deal_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "engagements_all" ON engagements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "conversations_all" ON conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "conversation_messages_all" ON conversation_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "alerts_all" ON alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================
-- PHASE 5: HELPER FUNCTIONS
-- ============================================

-- Funkcia pre aktualizáciu conversation stats
CREATE OR REPLACE FUNCTION update_conversation_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations SET
        message_count = (SELECT COUNT(*) FROM conversation_messages WHERE conversation_id = NEW.conversation_id),
        last_message_at = NEW.created_at,
        last_message_preview = LEFT(NEW.content, 100),
        last_message_sender = NEW.sender_type,
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_conversation_stats ON conversation_messages;
CREATE TRIGGER trigger_update_conversation_stats
    AFTER INSERT ON conversation_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_stats();

-- Funkcia pre stage change logging
CREATE OR REPLACE FUNCTION log_deal_stage_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.stage IS DISTINCT FROM NEW.stage THEN
        INSERT INTO deal_activities (deal_id, activity_type, title, metadata)
        VALUES (
            NEW.id,
            'stage_change',
            'Zmena stavu: ' || OLD.stage || ' → ' || NEW.stage,
            jsonb_build_object('stage_from', OLD.stage, 'stage_to', NEW.stage)
        );
        NEW.stage_changed_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_deal_stage_change ON deals;
CREATE TRIGGER trigger_log_deal_stage_change
    BEFORE UPDATE ON deals
    FOR EACH ROW
    EXECUTE FUNCTION log_deal_stage_change();

-- ============================================
-- PHASE 6: VIEWS pre jednoduchšie query
-- ============================================

-- View pre aktívne engagements s company info
CREATE OR REPLACE VIEW v_active_engagements AS
SELECT 
    e.*,
    c.name as company_name,
    c.domain as company_domain,
    c.logo_url as company_logo,
    u.full_name as assigned_to_name
FROM engagements e
LEFT JOIN companies c ON c.id = e.company_id
LEFT JOIN user_profiles u ON u.id = e.assigned_to
WHERE e.status IN ('active', 'onboarding');

-- View pre open conversations
CREATE OR REPLACE VIEW v_open_conversations AS
SELECT 
    conv.*,
    co.first_name || ' ' || COALESCE(co.last_name, '') as contact_name,
    co.email as contact_email,
    comp.name as company_name,
    e.name as engagement_name,
    u.full_name as assigned_to_name
FROM conversations conv
LEFT JOIN contacts co ON co.id = conv.contact_id
LEFT JOIN companies comp ON comp.id = conv.company_id
LEFT JOIN engagements e ON e.id = conv.engagement_id
LEFT JOIN user_profiles u ON u.id = conv.assigned_to
WHERE conv.status IN ('open', 'pending');

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE contacts IS 'Kontaktné osoby - oddelené od firiem (many-to-many)';
COMMENT ON TABLE companies IS 'Firmy - môžu mať viacero kontaktov';
COMMENT ON TABLE contact_company_links IS 'Prepojenie kontakt-firma s rolou';
COMMENT ON TABLE deals IS 'Obchodné príležitosti v pipeline';
COMMENT ON TABLE deal_activities IS 'História aktivít na deale';
COMMENT ON TABLE engagements IS 'Aktívne spolupráce s klientmi';
COMMENT ON TABLE conversations IS 'Unified inbox - všetky konverzácie';
COMMENT ON TABLE conversation_messages IS 'Správy v konverzáciách';
COMMENT ON TABLE alerts IS 'Upozornenia pre DESK dashboard';

-- ============================================
-- DONE
-- ============================================
