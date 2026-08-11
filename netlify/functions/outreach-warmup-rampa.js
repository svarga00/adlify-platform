// netlify/functions/outreach-warmup-rampa.js
//
// Samostatný cron — raz denne ráno (7:00 UTC = 8:00 SK zima / 9:00 leto)
// posunie warmup_current o +20% pre každého aktívneho sendera, kým nedosiahne
// daily_limit. Ochrana proti spamu: ak má sender bounce rate > 5% v posledných
// 7 dňoch → namiesto rampe ZNÍŽI warmup_current o 50% (pause-like) a nastaví
// is_active = false ak by warmup_current klesol pod 1.
//
// Dáva nám "growth + safety" — nemusíme manuálne klikať každý deň ale aj sa
// nevyhneme katastrofe ak doména začne dostať bounces.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const RAMP_UP_PCT = 0.20;     // +20% denne
const PAUSE_PCT = 0.50;       // -50% pri vysokom bounce rate
const BOUNCE_THRESHOLD = 0.05; // 5% bounce rate spustí pause
const LOOKBACK_DAYS = 7;

async function getBounceRate(senderId) {
  // Predpokladám tabuľku prospect_events s event_type='email_bounced' a sender_id.
  // Ak neexistuje (nemáme bounce tracking), funkcia vráti 0 a rampa pokračuje.
  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const [sentRes, bounceRes] = await Promise.all([
      supabase.from('prospect_events').select('id', { count: 'exact', head: true })
        .eq('sender_id', senderId).eq('event_type', 'email_sent').gte('occurred_at', since),
      supabase.from('prospect_events').select('id', { count: 'exact', head: true })
        .eq('sender_id', senderId).eq('event_type', 'email_bounced').gte('occurred_at', since),
    ]);
    const sent = sentRes.count || 0;
    const bounced = bounceRes.count || 0;
    if (sent < 20) return 0; // nedostatočný sample
    return bounced / sent;
  } catch (e) {
    console.warn('[warmup-rampa] bounce check skipped:', e.message);
    return 0;
  }
}

exports.handler = async () => {
  const started = Date.now();
  const summary = { processed: 0, rampedUp: 0, paused: 0, atTarget: 0 };

  try {
    const { data: senders, error } = await supabase
      .from('outreach_senders')
      .select('*')
      .eq('is_active', true);
    if (error) throw error;

    for (const s of (senders || [])) {
      summary.processed++;
      const target = s.daily_limit || 40;
      const current = s.warmup_current || 0;

      const bounceRate = await getBounceRate(s.id);
      if (bounceRate >= BOUNCE_THRESHOLD) {
        const newCurrent = Math.max(1, Math.floor(current * (1 - PAUSE_PCT)));
        await supabase.from('outreach_senders').update({
          warmup_current: newCurrent,
          warmup_paused_at: new Date().toISOString(),
          warmup_pause_reason: `bounce_rate_${(bounceRate * 100).toFixed(1)}%`,
        }).eq('id', s.id);
        console.warn(`[warmup-rampa] PAUSE ${s.email}: bounce ${(bounceRate * 100).toFixed(1)}% → warmup_current ${current} → ${newCurrent}`);
        summary.paused++;
        continue;
      }

      if (current >= target) {
        summary.atTarget++;
        continue;
      }

      // Ramp up: +20% (min +1)
      const increment = Math.max(1, Math.floor(current * RAMP_UP_PCT));
      const newCurrent = Math.min(target, current + increment);
      await supabase.from('outreach_senders').update({
        warmup_current: newCurrent,
        warmup_last_rampup_at: new Date().toISOString(),
      }).eq('id', s.id);
      console.log(`[warmup-rampa] RAMP ${s.email}: ${current} → ${newCurrent} (target ${target})`);
      summary.rampedUp++;
    }
  } catch (err) {
    console.error('[warmup-rampa] fatal:', err);
    summary.fatal = err.message;
  }

  summary.duration_ms = Date.now() - started;
  console.log('[outreach-warmup-rampa]', JSON.stringify(summary));
  return { statusCode: 200, body: JSON.stringify(summary) };
};

// Beží raz denne o 7:00 UTC (≈ 8-9 ráno SK podľa DST)
exports.config = {
  schedule: '0 7 * * *',
};
