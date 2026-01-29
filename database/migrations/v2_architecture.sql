-- ============================================
-- ADLIFY V2 - COMPLETE ARCHITECTURE
-- ============================================
-- Run this migration in Supabase SQL Editor
-- Backward compatible - keeps existing tables
-- ============================================

-- ============================================
-- 1. CONTACTS (ľudia - oddelené od firiem)
-- ============================================

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
    
    -- Vlastné polia
    custom_fields JSONB DEFAULT '{}',
    
    -- Zdroj
    source TEXT,
    
    -- Meta
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(org_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_search ON contacts USING GIN (
    to_tsvector('simple', COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') || ' ' || COALESCE(email, ''))
);

-- ============================================
-- 2. COMPANIES (firmy)
-- ============================================

CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
    
    -- Základné info
    name TEXT NOT NULL,
    domain TEXT,
    logo_url TEXT,
    
    -- Firemné údaje (SK)
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
    employee_count TEXT,
    annual_revenue TEXT,
    
    -- Poznámky a tagy
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    
    -- Vlastné polia
    custom_fields JSONB DEFAULT '{}',
    
    -- Meta
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_org ON companies(org_id);
CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain);
CREATE INDEX IF NOT EXISTS idx_companies_search ON companies USING GIN (
    to_tsvector('simple', COALESCE(name, '') || ' ' || COALESCE(domain, ''))
);

-- ============================================
-- 3. CONTACT_COMPANY_LINKS (many-to-many)
-- ============================================

CREATE TABLE IF NOT EXISTS contact_company_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
    
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Rola vo firme
    role TEXT,
    job_title TEXT,
    
    -- Flagy
    is_primary BOOLEAN DEFAULT false,
    is_decision_maker BOOLEAN DEFAULT false,
    is_billing_contact BOOLEAN DEFAULT false,
    
    -- Meta
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(contact_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_ccl_contact ON contact_company_links(contact_id);
CREATE INDEX IF NOT EXISTS idx_ccl_company ON contact_company_links(company_id);

-- ============================================
-- 4. DEALS (pipeline)
-- ============================================

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
        'new',
        'qualified',
        'proposal',
        'negotiation',
        'won',
        'lost'
    )),
    
    -- Pravdepodobnosť a priorita
    probability INTEGER DEFAULT 50 CHECK (probability >= 0 AND probability <= 100),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    
    -- Dátumy
    expected_close_date DATE,
    actual_close_date DATE,
    
    -- Dôvod zatvorenia
    close_reason TEXT,
    
    -- Zdroj
    source TEXT,
    
    -- Priradenie
    assigned_to UUID REFERENCES user_profiles(id),
    
    -- AI Analýza (z prospectingu)
    analysis JSONB DEFAULT '{}',
    
    -- Proposal link
    proposal_token TEXT UNIQUE,
    proposal_sent_at TIMESTAMPTZ,
    proposal_viewed_at TIMESTAMPTZ,
    proposal_response TEXT CHECK (proposal_response IN ('interested', 'not_interested', 'later')),
    proposal_response_at TIMESTAMPTZ,
    
    -- Poznámky
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    
    -- Meta
    stage_changed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deals_org ON deals(org_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_company ON deals(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_assigned ON deals(assigned_to);
CREATE INDEX IF NOT EXISTS idx_deals_proposal_token ON deals(proposal_token);

-- ============================================
-- 5. ENGAGEMENTS (aktívne spolupráce)
-- ============================================

CREATE TABLE IF NOT EXISTS engagements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
    
    -- Prepojenia
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
    
    -- Info
    name TEXT NOT NULL,
    
    -- Balíček
    package TEXT CHECK (package IN ('starter', 'growth', 'professional', 'enterprise', 'custom')),
    platforms TEXT[] DEFAULT '{}',
    
    -- Ceny
    monthly_fee DECIMAL(10,2),
    setup_fee DECIMAL(10,2) DEFAULT 0,
    ad_budget_monthly DECIMAL(10,2),
    
    -- Stav
    status TEXT DEFAULT 'onboarding' CHECK (status IN (
        'onboarding',
        'active',
        'paused',
        'cancelled'
    )),
    
    -- Dátumy
    start_date DATE,
    end_date DATE,
    billing_day INTEGER DEFAULT 1,
    next_billing_date DATE,
    
    -- Onboarding progress
    onboarding_step INTEGER DEFAULT 1,
    onboarding_data JSONB DEFAULT '{}',
    onboarding_completed_at TIMESTAMPTZ,
    
    -- Priradenie
    assigned_to UUID REFERENCES user_profiles(id),
    
    -- Poznámky
    notes TEXT,
    
    -- Meta
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagements_org ON engagements(org_id);
CREATE INDEX IF NOT EXISTS idx_engagements_company ON engagements(company_id);
CREATE INDEX IF NOT EXISTS idx_engagements_status ON engagements(status);

-- ============================================
-- 6. CONVERSATIONS (unified inbox)
-- ============================================

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
    
    -- Prepojenia (môže byť viac)
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
    engagement_id UUID REFERENCES engagements(id) ON DELETE SET NULL,
    
    -- Typ kanálu
    channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'chat', 'sms', 'whatsapp', 'facebook', 'instagram', 'phone')),
    
    -- Stav
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'spam')),
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    
    -- Ticket
    is_ticket BOOLEAN DEFAULT false,
    ticket_number TEXT,
    
    -- Priradenie
    assigned_to UUID REFERENCES user_profiles(id),
    
    -- Sentiment (AI)
    sentiment DECIMAL(3,2),
    
    -- Subject (pre emaily)
    subject TEXT,
    
    -- Štatistiky
    message_count INTEGER DEFAULT 0,
    unread_count INTEGER DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    last_message_preview TEXT,
    last_sender_type TEXT,
    
    -- Meta
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_org ON conversations(org_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_company ON conversations(company_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);

-- ============================================
-- 7. CONVERSATION_MESSAGES
-- ============================================

CREATE TABLE IF NOT EXISTS conversation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    
    -- Odosielateľ
    sender_type TEXT NOT NULL CHECK (sender_type IN ('contact', 'agent', 'bot', 'system')),
    sender_id UUID,
    sender_name TEXT,
    sender_email TEXT,
    
    -- Obsah
    content TEXT NOT NULL,
    content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'html', 'markdown')),
    
    -- Prílohy
    attachments JSONB DEFAULT '[]',
    
    -- Pre emaily
    email_message_id TEXT,
    email_subject TEXT,
    email_in_reply_to TEXT,
    
    -- Interné poznámky
    is_internal BOOLEAN DEFAULT false,
    
    -- AI
    is_ai_generated BOOLEAN DEFAULT false,
    is_ai_draft BOOLEAN DEFAULT false,
    ai_confidence DECIMAL(3,2),
    ai_approved_by UUID REFERENCES user_profiles(id),
    ai_approved_at TIMESTAMPTZ,
    
    -- Prečítanie
    read_at TIMESTAMPTZ,
    
    -- Meta
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_messages_conv ON conversation_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_messages_sender ON conversation_messages(sender_type, sender_id);
CREATE INDEX IF NOT EXISTS idx_conv_messages_ai_draft ON conversation_messages(is_ai_draft) WHERE is_ai_draft = true;

-- ============================================
-- 8. DEAL_ACTIVITIES (história dealu)
-- ============================================

CREATE TABLE IF NOT EXISTS deal_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    
    -- Typ
    activity_type TEXT NOT NULL CHECK (activity_type IN (
        'stage_change',
        'note',
        'email',
        'call',
        'meeting',
        'task',
        'proposal_sent',
        'proposal_viewed',
        'proposal_response',
        'system'
    )),
    
    -- Obsah
    title TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Kto
    user_id UUID REFERENCES user_profiles(id),
    user_name TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_activities_deal ON deal_activities(deal_id, created_at DESC);

-- ============================================
-- 9. APPROVALS (schválenia)
-- ============================================

CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
    
    -- Prepojenia
    engagement_id UUID REFERENCES engagements(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    
    -- Typ
    approval_type TEXT NOT NULL CHECK (approval_type IN (
        'campaign',
        'creative',
        'budget_change',
        'strategy'
    )),
    
    -- Obsah
    title TEXT NOT NULL,
    description TEXT,
    content JSONB DEFAULT '{}',
    
    -- Stav
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'revision_requested')),
    
    -- Feedback od klienta
    client_comment TEXT,
    
    -- Kto vytvoril
    created_by UUID REFERENCES user_profiles(id),
    
    -- Kto schválil
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    
    -- Meta
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approvals_engagement ON approvals(engagement_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);

-- ============================================
-- 10. ALERTS (systémové alerty)
-- ============================================

CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
    
    -- Prepojenia
    engagement_id UUID REFERENCES engagements(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    
    -- Typ a závažnosť
    alert_type TEXT NOT NULL CHECK (alert_type IN (
        'performance',
        'budget',
        'payment',
        'sentiment',
        'response_time',
        'churn_risk',
        'system'
    )),
    severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
    
    -- Obsah
    title TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Stav
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
    
    -- Akcie
    acknowledged_by UUID REFERENCES user_profiles(id),
    acknowledged_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES user_profiles(id),
    resolved_at TIMESTAMPTZ,
    
    -- Meta
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status, severity);
CREATE INDEX IF NOT EXISTS idx_alerts_engagement ON alerts(engagement_id);

-- ============================================
-- UPDATE EXISTING TABLES
-- ============================================

-- Pridať company_id a contact_id do campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS engagement_id UUID REFERENCES engagements(id) ON DELETE SET NULL;

-- Pridať engagement_id do invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS engagement_id UUID REFERENCES engagements(id) ON DELETE SET NULL;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_company_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Authenticated users môžu všetko
CREATE POLICY "contacts_all" ON contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "companies_all" ON companies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ccl_all" ON contact_company_links FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "deals_all" ON deals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "deal_activities_all" ON deal_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "engagements_all" ON engagements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "conversations_all" ON conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "conv_messages_all" ON conversation_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "approvals_all" ON approvals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "alerts_all" ON alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon pre proposals
CREATE POLICY "deals_anon_proposal" ON deals FOR SELECT TO anon 
    USING (proposal_token IS NOT NULL);

CREATE POLICY "deals_anon_update" ON deals FOR UPDATE TO anon 
    USING (proposal_token IS NOT NULL)
    WITH CHECK (proposal_token IS NOT NULL);

-- ============================================
-- VIEWS
-- ============================================

-- Pipeline stats
CREATE OR REPLACE VIEW v_pipeline_stats AS
SELECT 
    stage,
    COUNT(*) as count,
    COALESCE(SUM(value), 0) as total_value,
    COALESCE(AVG(value), 0) as avg_value,
    COALESCE(AVG(probability), 0) as avg_probability
FROM deals
WHERE stage NOT IN ('won', 'lost')
GROUP BY stage;

-- Engagement overview
CREATE OR REPLACE VIEW v_engagement_overview AS
SELECT 
    e.*,
    c.name as company_name,
    c.domain as company_domain,
    (SELECT COUNT(*) FROM campaigns WHERE engagement_id = e.id) as campaign_count,
    (SELECT COUNT(*) FROM conversations WHERE engagement_id = e.id AND status = 'open') as open_conversations
FROM engagements e
LEFT JOIN companies c ON e.company_id = c.id;

-- Inbox overview
CREATE OR REPLACE VIEW v_inbox_overview AS
SELECT 
    cv.*,
    ct.first_name || ' ' || COALESCE(ct.last_name, '') as contact_name,
    ct.email as contact_email,
    co.name as company_name
FROM conversations cv
LEFT JOIN contacts ct ON cv.contact_id = ct.id
LEFT JOIN companies co ON cv.company_id = co.id;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Update conversation stats after message
CREATE OR REPLACE FUNCTION update_conversation_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations SET
        message_count = (SELECT COUNT(*) FROM conversation_messages WHERE conversation_id = NEW.conversation_id),
        last_message_at = NEW.created_at,
        last_message_preview = LEFT(NEW.content, 100),
        last_sender_type = NEW.sender_type,
        unread_count = CASE 
            WHEN NEW.sender_type = 'contact' THEN unread_count + 1 
            ELSE unread_count 
        END,
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conversation_message ON conversation_messages;
CREATE TRIGGER trg_conversation_message
    AFTER INSERT ON conversation_messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_stats();

-- Log deal stage changes
CREATE OR REPLACE FUNCTION log_deal_stage_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.stage IS DISTINCT FROM NEW.stage THEN
        NEW.stage_changed_at = NOW();
        INSERT INTO deal_activities (deal_id, activity_type, title, metadata)
        VALUES (
            NEW.id, 
            'stage_change', 
            'Stage zmenený z ' || OLD.stage || ' na ' || NEW.stage,
            jsonb_build_object('from', OLD.stage, 'to', NEW.stage)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deal_stage_change ON deals;
CREATE TRIGGER trg_deal_stage_change
    BEFORE UPDATE ON deals
    FOR EACH ROW EXECUTE FUNCTION log_deal_stage_change();

-- ============================================
-- MIGRATE EXISTING DATA
-- ============================================

-- Leads → Deals (ak ešte nie sú)
INSERT INTO deals (id, org_id, title, stage, source, analysis, assigned_to, notes, tags, created_at, updated_at)
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
    l.created_at,
    l.updated_at
FROM leads l
WHERE NOT EXISTS (SELECT 1 FROM deals d WHERE d.id = l.id);

-- Clients → Companies + Engagements
INSERT INTO companies (id, org_id, name, domain, ico, dic, ic_dph, street, city, zip, country, industry, notes, tags, created_at, updated_at)
SELECT 
    id,
    org_id,
    company_name,
    website,
    ico,
    dic,
    ic_dph,
    street,
    city,
    zip,
    country,
    industry,
    notes,
    tags,
    created_at,
    updated_at
FROM clients
WHERE company_name IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM companies WHERE companies.id = clients.id);

-- Create engagements from clients
INSERT INTO engagements (org_id, company_id, name, package, monthly_fee, status, start_date, end_date, billing_day, assigned_to, created_at, updated_at)
SELECT 
    org_id,
    id as company_id,
    company_name || ' - Spolupráca',
    package,
    monthly_fee,
    CASE status
        WHEN 'trial' THEN 'onboarding'
        WHEN 'active' THEN 'active'
        WHEN 'paused' THEN 'paused'
        WHEN 'cancelled' THEN 'cancelled'
        ELSE 'onboarding'
    END,
    contract_start,
    contract_end,
    billing_day,
    assigned_to,
    created_at,
    updated_at
FROM clients
WHERE company_name IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM engagements WHERE engagements.company_id = clients.id);

-- Create contacts from clients
INSERT INTO contacts (org_id, first_name, email, phone, source, created_at)
SELECT 
    org_id,
    COALESCE(contact_person, 'Kontakt'),
    email,
    phone,
    'migrated_from_clients',
    created_at
FROM clients
WHERE (contact_person IS NOT NULL OR email IS NOT NULL)
AND NOT EXISTS (SELECT 1 FROM contacts WHERE contacts.email = clients.email AND clients.email IS NOT NULL);

-- ============================================
-- DONE
-- ============================================

COMMENT ON TABLE contacts IS 'Kontaktné osoby - ľudia';
COMMENT ON TABLE companies IS 'Firmy';
COMMENT ON TABLE contact_company_links IS 'Prepojenie kontakt-firma (many-to-many)';
COMMENT ON TABLE deals IS 'Obchodné príležitosti v pipeline';
COMMENT ON TABLE engagements IS 'Aktívne spolupráce s klientmi';
COMMENT ON TABLE conversations IS 'Unified inbox - všetky konverzácie';
COMMENT ON TABLE conversation_messages IS 'Správy v konverzáciách';
COMMENT ON TABLE approvals IS 'Schválenia od klientov';
COMMENT ON TABLE alerts IS 'Systémové alerty a upozornenia';
