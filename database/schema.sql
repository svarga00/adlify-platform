-- ============================================
-- ADLIFY PLATFORM - DATABASE SCHEMA
-- Version: 1.0.0
-- Date: 2024-12-28
-- ============================================

-- ============================================
-- 🏢 ORGANIZATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default organization (Adlify)
INSERT INTO organizations (id, name, slug) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Adlify', 'adlify')
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 👤 USER PROFILES
-- ============================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('owner', 'admin', 'employee', 'client')),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 👥 TEAM MEMBERS (zamestnanci)
-- ============================================

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('owner', 'admin', 'employee')),
  department TEXT,
  permissions JSONB DEFAULT '{
    "dashboard": {"view": true},
    "leads": {"view": true, "create": true, "edit": true, "delete": false},
    "clients": {"view": true, "create": true, "edit": true, "delete": false},
    "campaigns": {"view": true, "create": true, "edit": true, "delete": false},
    "invoices": {"view": false, "create": false, "edit": false, "delete": false},
    "reports": {"view": true, "export": false},
    "settings": {"view": false, "edit": false},
    "team": {"view": false, "manage": false}
  }',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(org_id, user_id)
);

-- ============================================
-- 🏪 CLIENTS (firmy - klienti)
-- ============================================

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  
  -- Základné info
  company_name TEXT NOT NULL,
  ico TEXT,
  dic TEXT,
  ic_dph TEXT,
  
  -- Kontakt
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  
  -- Adresa
  street TEXT,
  city TEXT,
  zip TEXT,
  country TEXT DEFAULT 'SK',
  
  -- Biznis info
  website TEXT,
  industry TEXT,
  
  -- Zmluva
  package TEXT CHECK (package IN ('starter', 'pro', 'enterprise')),
  monthly_fee DECIMAL(10,2),
  contract_start DATE,
  contract_end DATE,
  billing_day INTEGER DEFAULT 1,
  
  -- Stav
  status TEXT DEFAULT 'active' CHECK (status IN ('trial', 'active', 'paused', 'cancelled')),
  
  -- Prepojenie
  lead_id UUID,
  assigned_to UUID REFERENCES user_profiles(id),
  
  -- Meta
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 👤 CLIENT USERS (prihlásenia klientov)
-- ============================================

CREATE TABLE IF NOT EXISTS client_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  permissions JSONB DEFAULT '{
    "dashboard": {"view": true},
    "campaigns": {"view": true},
    "reports": {"view": true, "export": true},
    "invoices": {"view": true},
    "messages": {"view": true, "send": true},
    "settings": {"view": true, "edit": false}
  }',
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(client_id, user_id)
);

-- ============================================
-- 📋 LEADS
-- ============================================

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  
  -- Základné info
  domain TEXT,
  company_name TEXT,
  
  -- Stav
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'analyzing', 'ready', 'contacted', 'negotiating', 'converted', 'lost')),
  score INTEGER DEFAULT 50,
  
  -- Analýza (JSON)
  analysis JSONB DEFAULT '{}',
  
  -- Prepojenie
  assigned_to UUID REFERENCES user_profiles(id),
  converted_to_client_id UUID REFERENCES clients(id),
  
  -- Meta
  source TEXT,
  source_url TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 💼 CLIENT SERVICES
-- ============================================

CREATE TABLE IF NOT EXISTS client_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  
  service_type TEXT NOT NULL CHECK (service_type IN ('google_ads', 'meta_ads', 'tiktok_ads', 'linkedin_ads', 'seo', 'content', 'web', 'consulting', 'other')),
  name TEXT,
  
  status TEXT DEFAULT 'setup' CHECK (status IN ('setup', 'active', 'paused', 'cancelled')),
  
  -- Financie
  setup_fee DECIMAL(10,2) DEFAULT 0,
  monthly_fee DECIMAL(10,2),
  ad_budget_monthly DECIMAL(10,2),
  
  -- Externé prepojenie
  external_account_id TEXT,
  external_config JSONB DEFAULT '{}',
  
  -- Dátumy
  start_date DATE,
  end_date DATE,
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 📊 CAMPAIGNS
-- ============================================

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  service_id UUID REFERENCES client_services(id) ON DELETE SET NULL,
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  
  platform TEXT NOT NULL CHECK (platform IN ('google', 'meta', 'tiktok', 'linkedin', 'other')),
  external_id TEXT,
  
  name TEXT NOT NULL,
  type TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'ended', 'deleted')),
  
  budget_daily DECIMAL(10,2),
  budget_total DECIMAL(10,2),
  
  -- Metriky (cache)
  metrics JSONB DEFAULT '{
    "impressions": 0,
    "clicks": 0,
    "ctr": 0,
    "conversions": 0,
    "cost": 0,
    "cpc": 0,
    "cpa": 0,
    "roas": 0
  }',
  metrics_updated_at TIMESTAMPTZ,
  
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 📜 ACTIVITIES (timeline)
-- ============================================

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  
  -- Čoho sa týka
  entity_type TEXT NOT NULL CHECK (entity_type IN ('lead', 'client', 'campaign', 'service', 'invoice', 'user')),
  entity_id UUID NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Čo sa stalo
  action TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Kto
  user_id UUID REFERENCES user_profiles(id),
  user_name TEXT,
  
  -- Viditeľnosť
  is_visible_to_client BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 💰 INVOICES
-- ============================================

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  
  -- Číslovanie
  invoice_number TEXT NOT NULL,
  
  -- Externý systém
  external_id TEXT,
  external_url TEXT,
  
  -- Sumy
  subtotal DECIMAL(10,2) NOT NULL,
  tax_rate DECIMAL(4,2) DEFAULT 20,
  tax_amount DECIMAL(10,2),
  total DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  
  -- Stav
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  
  -- Dátumy
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  
  -- Položky
  items JSONB NOT NULL DEFAULT '[]',
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(org_id, invoice_number)
);

-- ============================================
-- ✅ TASKS
-- ============================================

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  
  title TEXT NOT NULL,
  description TEXT,
  
  -- Prepojenie
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Priradenie
  assignee UUID REFERENCES user_profiles(id),
  created_by UUID REFERENCES user_profiles(id),
  
  -- Stav
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'waiting', 'done', 'cancelled')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  
  -- Termín
  due_date DATE,
  completed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 💬 MESSAGES (interná komunikácia s klientom)
-- ============================================

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Odosielateľ
  sender_id UUID REFERENCES user_profiles(id),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('team', 'client')),
  
  -- Obsah
  subject TEXT,
  content TEXT NOT NULL,
  
  -- Stav
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ⚙️ INTEGRATIONS CONFIG
-- ============================================

CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  
  type TEXT NOT NULL CHECK (type IN ('google_ads', 'meta_ads', 'tiktok_ads', 'linkedin_ads', 'analytics', 'search_console', 'superfaktura', 'smtp', 'imap', 'marketing_miner', 'claude')),
  name TEXT NOT NULL,
  
  is_active BOOLEAN DEFAULT true,
  
  -- Credentials (encrypted ideally)
  config JSONB DEFAULT '{}',
  
  -- Status
  last_sync TIMESTAMPTZ,
  last_error TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(org_id, type)
);

-- ============================================
-- 📄 TEMPLATES (prezentácie, emaily)
-- ============================================

CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  
  type TEXT NOT NULL CHECK (type IN ('presentation', 'email', 'report', 'contract')),
  name TEXT NOT NULL,
  description TEXT,
  
  -- Obsah
  content TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  
  -- Meta
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 🔢 SEQUENCES (pre číslovanie faktúr)
-- ============================================

CREATE TABLE IF NOT EXISTS sequences (
  id TEXT PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  prefix TEXT NOT NULL,
  current_value INTEGER DEFAULT 0,
  year INTEGER DEFAULT EXTRACT(YEAR FROM NOW())
);

-- Initialize invoice sequence
INSERT INTO sequences (id, prefix, current_value, year)
VALUES ('invoice', 'FA', 0, 2024)
ON CONFLICT (id) DO NOTHING;

-- Function to get next invoice number
CREATE OR REPLACE FUNCTION get_next_invoice_number()
RETURNS TEXT AS $$
DECLARE
  seq RECORD;
  next_num INTEGER;
BEGIN
  SELECT * INTO seq FROM sequences WHERE id = 'invoice' FOR UPDATE;
  
  -- Reset if new year
  IF seq.year < EXTRACT(YEAR FROM NOW()) THEN
    UPDATE sequences SET current_value = 0, year = EXTRACT(YEAR FROM NOW()) WHERE id = 'invoice';
    next_num := 1;
  ELSE
    next_num := seq.current_value + 1;
  END IF;
  
  UPDATE sequences SET current_value = next_num WHERE id = 'invoice';
  
  RETURN seq.prefix || EXTRACT(YEAR FROM NOW())::TEXT || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 🔒 ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- User Profiles
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Team members can view all profiles in org
CREATE POLICY "Team can view org profiles" ON user_profiles
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM team_members WHERE user_id = auth.uid())
  );

-- Team Members
CREATE POLICY "Team members visible to org" ON team_members
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM team_members WHERE user_id = auth.uid())
  );

-- Clients - Team Access
CREATE POLICY "Team can view all clients" ON clients
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Team can insert clients" ON clients
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Team can update clients" ON clients
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM team_members WHERE user_id = auth.uid())
  );

-- Clients - Client Access (only their own)
CREATE POLICY "Clients can view own company" ON clients
  FOR SELECT USING (
    id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid())
  );

-- Leads
CREATE POLICY "Team can manage leads" ON leads
  FOR ALL USING (
    org_id IN (SELECT org_id FROM team_members WHERE user_id = auth.uid())
  );

-- Client Services
CREATE POLICY "Team can manage services" ON client_services
  FOR ALL USING (
    org_id IN (SELECT org_id FROM team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Clients can view own services" ON client_services
  FOR SELECT USING (
    client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid())
  );

-- Campaigns
CREATE POLICY "Team can manage campaigns" ON campaigns
  FOR ALL USING (
    org_id IN (SELECT org_id FROM team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Clients can view own campaigns" ON campaigns
  FOR SELECT USING (
    client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid())
  );

-- Activities
CREATE POLICY "Team can view all activities" ON activities
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Team can create activities" ON activities
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Clients can view visible activities" ON activities
  FOR SELECT USING (
    client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid())
    AND is_visible_to_client = true
  );

-- Invoices
CREATE POLICY "Team can manage invoices" ON invoices
  FOR ALL USING (
    org_id IN (SELECT org_id FROM team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Clients can view own invoices" ON invoices
  FOR SELECT USING (
    client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid())
  );

-- Tasks
CREATE POLICY "Team can manage tasks" ON tasks
  FOR ALL USING (
    org_id IN (SELECT org_id FROM team_members WHERE user_id = auth.uid())
  );

-- Messages
CREATE POLICY "Team can manage messages" ON messages
  FOR ALL USING (
    org_id IN (SELECT org_id FROM team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Clients can view own messages" ON messages
  FOR SELECT USING (
    client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Clients can send messages" ON messages
  FOR INSERT WITH CHECK (
    client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid())
    AND sender_type = 'client'
  );

-- Integrations
CREATE POLICY "Team admins can manage integrations" ON integrations
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM team_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Templates
CREATE POLICY "Team can view templates" ON templates
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Team admins can manage templates" ON templates
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM team_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ============================================
-- 🔧 TRIGGERS
-- ============================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_client_services_updated_at BEFORE UPDATE ON client_services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- 📊 INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_leads_org_status ON leads(org_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_clients_org_status ON clients(org_id, status);
CREATE INDEX IF NOT EXISTS idx_clients_assigned ON clients(assigned_to);
CREATE INDEX IF NOT EXISTS idx_campaigns_client ON campaigns(client_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_platform ON campaigns(platform);
CREATE INDEX IF NOT EXISTS idx_activities_entity ON activities(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activities_client ON activities(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date) WHERE status != 'done';
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_messages_client ON messages(client_id, created_at DESC);

-- ============================================
-- ✅ DONE
-- ============================================
