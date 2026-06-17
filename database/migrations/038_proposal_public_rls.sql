-- Public read access pre campaign_projects keď klient klikne proposal link.
-- Bez tohto: anonymný klient klikne /portal/proposal.html?t=cp_xxx → JS
-- robí SELECT FROM campaign_projects WHERE client_portal_token = '...' →
-- RLS zamietne pre anon → "Návrh nebol nájdený" → stratíme schválenie.

-- 1. campaign_projects: anon read len ak má client_portal_token (token je secret)
DROP POLICY IF EXISTS "Public read campaign by portal token" ON campaign_projects;
CREATE POLICY "Public read campaign by portal token"
ON campaign_projects FOR SELECT
TO anon, authenticated
USING (client_portal_token IS NOT NULL);

-- 2. campaign_projects update — klient môže schváliť/požiadať revíziu
DROP POLICY IF EXISTS "Public update campaign by portal token" ON campaign_projects;
CREATE POLICY "Public update campaign by portal token"
ON campaign_projects FOR UPDATE
TO anon, authenticated
USING (client_portal_token IS NOT NULL)
WITH CHECK (client_portal_token IS NOT NULL);

-- 3. campaigns, ad_groups, ads — public read keď príslušný projekt má token
DROP POLICY IF EXISTS "Public read campaigns of public proposal" ON campaigns;
CREATE POLICY "Public read campaigns of public proposal"
ON campaigns FOR SELECT
TO anon, authenticated
USING (
  project_id IN (
    SELECT id FROM campaign_projects WHERE client_portal_token IS NOT NULL
  )
);

DROP POLICY IF EXISTS "Public read ad_groups of public proposal" ON ad_groups;
CREATE POLICY "Public read ad_groups of public proposal"
ON ad_groups FOR SELECT
TO anon, authenticated
USING (
  campaign_id IN (
    SELECT c.id FROM campaigns c
    JOIN campaign_projects p ON p.id = c.project_id
    WHERE p.client_portal_token IS NOT NULL
  )
);

DROP POLICY IF EXISTS "Public read ads of public proposal" ON ads;
CREATE POLICY "Public read ads of public proposal"
ON ads FOR SELECT
TO anon, authenticated
USING (
  ad_group_id IN (
    SELECT ag.id FROM ad_groups ag
    JOIN campaigns c ON c.id = ag.campaign_id
    JOIN campaign_projects p ON p.id = c.project_id
    WHERE p.client_portal_token IS NOT NULL
  )
);

-- 4. RLS enable (idempotent)
ALTER TABLE campaign_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads ENABLE ROW LEVEL SECURITY;

-- Diagnostika
SELECT polname, polcmd, polroles::regrole[]::text[] as roles
FROM pg_policy
WHERE polrelid IN (
  'public.campaign_projects'::regclass,
  'public.campaigns'::regclass,
  'public.ad_groups'::regclass,
  'public.ads'::regclass
)
ORDER BY polrelid::text, polname;
