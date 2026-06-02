-- ============================================
-- MIGRÁCIA 012: Portál tabuľky — tickets, documents, campaign_projects
-- ============================================
-- Účel:
--   Portál (`/portal/index.html`) dotazuje tri tabuľky, ktoré nikdy
--   neboli v schema.sql ani v žiadnej migrácii:
--     • tickets           — support tickety (loadTickets / submitTicket)
--     • documents         — dokumenty klienta (loadDocuments)
--     • campaign_projects — projekty klienta (loadProjects)
--   Bez nich `loadTickets()` / `submitTicket()` hádžu "relation does not
--   exist" a sekcie Tickety / Dokumenty zostávajú prázdne.
--
--   Stĺpce sú odvodené z reálneho použitia v portáli:
--     tickets:           client_id, subject, description, category,
--                        priority, status, created_at
--     documents:         client_id, name, category, file_name, file_url,
--                        is_public, created_at
--     campaign_projects: client_id, name, description, status, created_at
--
-- RLS vzor kopíruje invoices/campaigns:
--   • tím (team_members) má FOR ALL nad org_id
--   • klient (client_users) má SELECT vlastných záznamov
--   • tickets navyše: klient môže INSERT vlastný ticket
--
-- Idempotentnosť: CREATE TABLE IF NOT EXISTS + policy guardy v DO blokoch.
-- ============================================

-- ───── 1. TICKETS ─────
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

  subject TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ───── 2. DOCUMENTS ─────
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  category TEXT DEFAULT 'contract',
  file_name TEXT,
  file_url TEXT,
  is_public BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ───── 3. CAMPAIGN_PROJECTS ─────
CREATE TABLE IF NOT EXISTS campaign_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ───── RLS enable ─────
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_projects ENABLE ROW LEVEL SECURITY;

-- ───── RLS policies: TICKETS ─────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tickets' AND policyname='Team can manage tickets') THEN
    CREATE POLICY "Team can manage tickets" ON tickets
      FOR ALL USING (EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tickets' AND policyname='Clients can view own tickets') THEN
    CREATE POLICY "Clients can view own tickets" ON tickets
      FOR SELECT USING (client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tickets' AND policyname='Clients can create own tickets') THEN
    CREATE POLICY "Clients can create own tickets" ON tickets
      FOR INSERT WITH CHECK (client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid()));
  END IF;
END $$;

-- ───── RLS policies: DOCUMENTS ─────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='documents' AND policyname='Team can manage documents') THEN
    CREATE POLICY "Team can manage documents" ON documents
      FOR ALL USING (EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='documents' AND policyname='Clients can view own public documents') THEN
    CREATE POLICY "Clients can view own public documents" ON documents
      FOR SELECT USING (
        client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid())
        AND is_public = true
      );
  END IF;
END $$;

-- ───── RLS policies: CAMPAIGN_PROJECTS ─────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='campaign_projects' AND policyname='Team can manage projects') THEN
    CREATE POLICY "Team can manage projects" ON campaign_projects
      FOR ALL USING (EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='campaign_projects' AND policyname='Clients can view own projects') THEN
    CREATE POLICY "Clients can view own projects" ON campaign_projects
      FOR SELECT USING (client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid()));
  END IF;
END $$;

-- ───── Indexy ─────
CREATE INDEX IF NOT EXISTS idx_tickets_client ON tickets(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_client ON documents(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_projects_client ON campaign_projects(client_id, created_at DESC);
