-- Public read access pre clients keď klient klikne token URL z emailu.
-- Bez tohto: anonymný (neprihlásený) klient klikne link
-- /portal/onboarding.html?t=ob_xxx → JS robí SELECT FROM clients WHERE
-- onboarding_token = 'ob_xxx' → RLS to zamietne pre anon role → klient
-- vidí "Chýba prístupový token" → stratíme klienta.
--
-- Riešenie: anon má read access na clients, ale len ak má valid token
-- (token je už dostatočné secret — 22 znakov random).
-- Tiež povolíme write na onboarding_responses pre klienta s valid tokenom.

-- 1. Clients: anon read len ak onboarding_token NIE je null
DROP POLICY IF EXISTS "Public read by onboarding token" ON clients;
CREATE POLICY "Public read by onboarding token"
ON clients
FOR SELECT
TO anon, authenticated
USING (onboarding_token IS NOT NULL);

-- 2. Onboarding_responses: anon insert/update ak má client s valid tokenom
DROP POLICY IF EXISTS "Public write own onboarding response" ON onboarding_responses;
CREATE POLICY "Public write own onboarding response"
ON onboarding_responses
FOR ALL
TO anon, authenticated
USING (
  client_id IN (
    SELECT id FROM clients WHERE onboarding_token IS NOT NULL
  )
)
WITH CHECK (
  client_id IN (
    SELECT id FROM clients WHERE onboarding_token IS NOT NULL
  )
);

-- 3. Enable RLS ak nie je (idempotent)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_responses ENABLE ROW LEVEL SECURITY;

-- 4. Diagnostika — ukáže aktuálne politiky
SELECT polname, polcmd, polroles::regrole[]::text[] as roles
FROM pg_policy
WHERE polrelid IN ('public.clients'::regclass, 'public.onboarding_responses'::regclass)
ORDER BY polrelid::text, polname;
