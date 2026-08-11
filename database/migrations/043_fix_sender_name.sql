-- HOTFIX: opraviť názov sendera "Adlify Agency (cold outreach)" → "Adlify Agency"
--
-- Migrácia 039 nastavila name = 'Adlify Agency (cold outreach)' čo sa zobrazuje
-- príjemcovi v hlavičke mailu (FROM field) ako:
--   "Adlify Agency (cold outreach) <info@adlify-agency.online>"
-- Slovo "cold outreach" je silný spam signál — Gmail/Outlook to ihneď odmietnu
-- (Generic Temporary Delivery Failure).
--
-- Profesionálny názov bez spam triggers: "Adlify Agency".
-- Idempotent.

UPDATE outreach_senders
SET name = 'Adlify Agency'
WHERE name = 'Adlify Agency (cold outreach)'
   OR name LIKE '%cold outreach%'
   OR name LIKE '%cold mail%';

-- Diagnostika
SELECT id, name, email, is_active, reply_to
FROM outreach_senders
WHERE email LIKE '%adlify%'
ORDER BY is_active DESC, email;
