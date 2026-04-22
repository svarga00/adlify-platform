// Resend webhook — prijíma evente typu email.delivered, email.bounced,
// email.complained, email.opened, email.clicked, email.replied.
// Spáruje email na základe To adresy s prospectom a aktualizuje stav.
//
// Config v Resend dashboarde:
//   URL: https://adlify.eu/.netlify/functions/resend-webhook
//   Secret: RESEND_WEBHOOK_SECRET (env var — overenie podpisu HMAC)

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

function verifySignature(body, headers) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return true; // bez secretu webhook akceptujeme (dev)
  const sigHeader = headers['svix-signature'] || headers['Svix-Signature'] || headers['resend-signature'];
  if (!sigHeader) return false;
  const msgId = headers['svix-id'] || headers['Svix-Id'];
  const msgTs = headers['svix-timestamp'] || headers['Svix-Timestamp'];
  if (!msgId || !msgTs) return false;
  const toSign = `${msgId}.${msgTs}.${body}`;
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', secretBytes).update(toSign).digest('base64');
  return sigHeader.split(' ').some(pair => {
    const [, sig] = pair.split(',');
    return sig && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  });
}

async function findProspectByEmail(email) {
  if (!email) return null;
  const { data } = await supabase
    .from('prospects')
    .select('id, outreach_stage, outreach_email_replied_at')
    .ilike('email', email)
    .maybeSingle();
  return data;
}

exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*' };

  if (!verifySignature(event.body || '', event.headers || {})) {
    return { statusCode: 401, headers: cors, body: 'Invalid signature' };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: cors, body: 'Bad JSON' }; }

  const type = payload.type || payload.event;
  const data = payload.data || payload;
  const toAddrs = data.to || data.recipient || [];
  const to = (Array.isArray(toAddrs) ? toAddrs[0] : toAddrs)?.toLowerCase?.()?.trim?.();
  const now = new Date().toISOString();

  try {
    const prospect = await findProspectByEmail(to);
    if (!prospect) {
      console.log('[resend-webhook]', type, 'no prospect for', to);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, matched: false }) };
    }

    const eventType = String(type || '').toLowerCase();

    if (eventType === 'email.bounced' || eventType === 'email.complained') {
      await supabase.from('prospects').update({
        outreach_stage: eventType === 'email.complained' ? 'unsubscribed' : 'bounced',
      }).eq('id', prospect.id);
      await supabase.from('outreach_campaign_enrollments').update({
        status: 'bounced', stop_reason: eventType === 'email.bounced' ? 'bounced' : 'complained',
      }).eq('prospect_id', prospect.id).eq('status', 'active');
      await supabase.from('prospect_events').insert({
        prospect_id: prospect.id,
        event_type: eventType === 'email.bounced' ? 'email_bounced' : 'email_complained',
        meta: data,
      });
    } else if (eventType === 'email.delivered') {
      await supabase.from('prospect_events').insert({
        prospect_id: prospect.id,
        event_type: 'email_delivered',
        meta: data,
      });
    } else if (eventType === 'email.replied' || eventType === 'email.inbound' || eventType === 'email.reply') {
      if (!prospect.outreach_email_replied_at) {
        await supabase.from('prospects').update({
          outreach_email_replied_at: now,
        }).eq('id', prospect.id);
      }
      await supabase.from('outreach_campaign_enrollments').update({
        status: 'stopped', stop_reason: 'replied',
      }).eq('prospect_id', prospect.id).eq('status', 'active');
      await supabase.from('prospect_events').insert({
        prospect_id: prospect.id,
        event_type: 'email_replied',
        meta: data,
      });
      // Fire-and-forget notifikácia ownerovi
      try {
        await fetch(`${process.env.URL || 'https://adlify.eu'}/.netlify/functions/notify-outreach-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prospectId: prospect.id, event: 'email_replied' }),
        });
      } catch (e) { /* no-op */ }
    } else if (eventType === 'email.opened' || eventType === 'email.clicked') {
      // Duplicitný tracking — už máme vlastný pixel/track-click, len zalog event
      await supabase.from('prospect_events').insert({
        prospect_id: prospect.id,
        event_type: eventType === 'email.opened' ? 'email_open_resend' : 'email_click_resend',
        meta: data,
      });
    }

    console.log('[resend-webhook]', eventType, prospect.id);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, matched: true }) };
  } catch (err) {
    console.error('[resend-webhook] error:', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
