-- Druhá doména pre cold outreach: adlify-agency.online.
-- adlify.eu zostáva LEN pre transakčné maily klientom (Onboarding, Proposal,
-- Notifikácie). Cold maily idú výhradne cez agency doménu — ak nás niektorý
-- príjemca označí ako spam, ochráni to reputáciu hlavnej domény.
--
-- Pred spustením migrácie:
-- 1. V Resend pridať doménu adlify-agency.online a overiť SPF/DKIM/DMARC
-- 2. Reply-to nastavený na info@adlify.eu lebo tam reálne čítame poštu
-- 3. Daily limit nízky (20) na rozbeh, warmup_current 5 — postupne zvyšovať
--    manuálne (UPDATE outreach_senders SET daily_limit = 40 ...).

-- Idempotent insert — bez ON CONFLICT, lebo unique constraint na email
-- v outreach_senders nie je v repe definovaný. Ak by si chcel,
-- pridaj predtým: ALTER TABLE outreach_senders ADD CONSTRAINT outreach_senders_email_unique UNIQUE (email);
INSERT INTO outreach_senders (
  provider, email, reply_to, is_active,
  daily_limit, warmup_current, sent_today
)
SELECT 'resend', 'info@adlify-agency.online', 'info@adlify.eu', true, 20, 5, 0
WHERE NOT EXISTS (
  SELECT 1 FROM outreach_senders WHERE email = 'info@adlify-agency.online'
);

-- Ak sender už existuje (z predošlého behu), aktualizuj kľúčové polia
UPDATE outreach_senders
SET is_active = true,
    reply_to = 'info@adlify.eu',
    daily_limit = COALESCE(daily_limit, 20)
WHERE email = 'info@adlify-agency.online';

-- Safety check: deaktivuj akýkoľvek sender na adlify.eu (cold mail tam NIKDY)
UPDATE outreach_senders
SET is_active = false
WHERE email LIKE '%@adlify.eu';

-- Diagnostika — výpis všetkých aktívnych senderov
SELECT email, provider, is_active, daily_limit, warmup_current, sent_today, reply_to
FROM outreach_senders
ORDER BY is_active DESC, email;
