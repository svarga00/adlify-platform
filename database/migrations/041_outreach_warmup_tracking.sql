-- Tracking stĺpce pre auto warm-up rampu (netlify/outreach-warmup-rampa.js).
-- Cron beží raz denne ráno, posunie warmup_current o +20% (alebo zníži o 50%
-- pri vysokom bounce rate).
--
-- Idempotent.

ALTER TABLE outreach_senders
  ADD COLUMN IF NOT EXISTS warmup_last_rampup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS warmup_paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS warmup_pause_reason TEXT;

COMMENT ON COLUMN outreach_senders.warmup_last_rampup_at IS
'Posledný auto-rampup (warmup_current bol zvýšený). Cron outreach-warmup-rampa.';

COMMENT ON COLUMN outreach_senders.warmup_paused_at IS
'Auto-pause time keď bounce rate >= 5% za posledných 7 dní. Cron znižuje warmup_current namiesto rampu-up.';

-- Diagnostika
SELECT
  email,
  warmup_current,
  daily_limit,
  warmup_last_rampup_at,
  warmup_paused_at,
  warmup_pause_reason,
  is_active
FROM outreach_senders
ORDER BY is_active DESC, email;
