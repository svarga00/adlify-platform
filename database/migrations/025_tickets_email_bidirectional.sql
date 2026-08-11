-- Email-bidirectional ticket flow.
-- Admin reply v UI → email klientovi cez Resend.
-- Klient odpovie na email → Resend inbound webhook → nová reply v ticket.
--
-- Threading: subject obsahuje "[Adlify #<8-char-shortid>]" pre párovanie inbound emailu
-- na ticket. Short id = prvých 8 znakov UUID-u (rovnako ako v UI badge).

-- 1. tickets — kontakt klienta + safety net pre stĺpce ktoré UI očakáva
-- (assigned_to, first_response_at, resolved_at, closed_at boli pridané ad-hoc
-- v Supabase, tu ich zaisťujeme pre čisté nasadenie)
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS contact_email TEXT,
ADD COLUMN IF NOT EXISTS contact_name TEXT,
ADD COLUMN IF NOT EXISTS contact_phone TEXT,
ADD COLUMN IF NOT EXISTS assigned_to UUID,
ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

COMMENT ON COLUMN tickets.contact_email IS
'Email kontaktnej osoby pre ticket. Použije sa pre odoslanie odpovedí z admin UI cez Resend. Ak NULL, fallback na clients.email.';

-- 2. ticket_replies — email tracking polia
ALTER TABLE ticket_replies
ADD COLUMN IF NOT EXISTS is_from_client BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS from_email TEXT,
ADD COLUMN IF NOT EXISTS email_message_id TEXT,
ADD COLUMN IF NOT EXISTS email_in_reply_to TEXT;

COMMENT ON COLUMN ticket_replies.is_from_client IS
'TRUE = odpoveď prišla od klienta cez email (ticket-inbound.js webhook). FALSE = napísal admin v UI.';

COMMENT ON COLUMN ticket_replies.email_message_id IS
'Resend message ID po odoslaní (alebo Message-ID hlavička pri inbound). Slúži na dedup a vlákno.';

-- Index na dedup inbound emailov
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_replies_email_msg_id
  ON ticket_replies(email_message_id) WHERE email_message_id IS NOT NULL;

-- Generated short_id (prvých 8 znakov UUID-u) pre rýchle párovanie inbound emailov
-- cez subject "[Adlify #abc12345]". UUID nepodporuje ILIKE, preto generujeme text.
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS short_id TEXT GENERATED ALWAYS AS (substring(id::text from 1 for 8)) STORED;

CREATE INDEX IF NOT EXISTS idx_tickets_short_id ON tickets(short_id);

-- 3. Backfill contact_email pre staré tickety z description (formát "Email: x@y.z")
UPDATE tickets
SET contact_email = LOWER(TRIM((regexp_match(description, 'Email:\s*([^\s<>]+@[^\s<>]+)', 'i'))[1]))
WHERE contact_email IS NULL
  AND description ~* 'Email:\s*[^\s<>]+@[^\s<>]+';

-- 4. Backfill contact_name z description (formát "Kontakt: <meno>")
UPDATE tickets
SET contact_name = TRIM((regexp_match(description, 'Kontakt:\s*([^\n\r]+)', 'i'))[1])
WHERE contact_name IS NULL
  AND description ~* 'Kontakt:\s*[^\n\r]+';
