// netlify/functions/send-template-to-prospect.js
//
// Odošle konkrétnu šablónu (template_slug) jednému prospectu.
// Volá sa napr. z automation-run (akcia type='send_template') alebo z admin
// UI (ad-hoc send). Reuse-uje logiku z outreach-scheduler cez require.
//
// Body JSON:
//   { prospectId: uuid, templateSlug: string, senderId?: uuid, dryRun?: boolean }
//
// Behavior:
//   1. Načíta prospect + templát
//   2. Vyberie sender (explicitne cez senderId alebo pickSender())
//   3. Renderuje email s premennými prospectu
//   4. Odošle cez sender providera (Gmail API alebo Resend)
//   5. Loguje prospect_event('email_sent') + bump counters
//   6. Ak je toto prvý outreach email, aktualizuje prospect.outreach_stage='email_sent'
//
// Response: 200 { ok: true, ... } alebo 4xx/5xx s { error }.

const { createClient } = require('@supabase/supabase-js');
const {
  renderEmailFromTemplate,
  sendEmail,
  pickSender,
  bumpSenderCounters,
} = require('./outreach-scheduler');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Invalid JSON body' }); }

  const { prospectId, templateSlug, senderId, dryRun } = body;
  if (!prospectId || !templateSlug) {
    return json(400, { error: 'prospectId and templateSlug required' });
  }

  // 1. Prospect
  const { data: prospect, error: pErr } = await supabase
    .from('prospects')
    .select('id, email, company_name, domain, contact_person, industry, city, audit_token, outreach_stage, outreach_email_sent_at')
    .eq('id', prospectId)
    .maybeSingle();
  if (pErr || !prospect) return json(404, { error: 'Prospect not found' });
  if (!prospect.email) return json(400, { error: 'Prospect has no email' });

  // Stop-guards
  if (['bounced', 'unsubscribed', 'converted', 'lost'].includes(prospect.outreach_stage)) {
    return json(409, { error: `Prospect stage is ${prospect.outreach_stage}, skipping` });
  }

  // 2. Sender
  let sender = null;
  if (senderId) {
    const { data: s } = await supabase
      .from('outreach_senders').select('*').eq('id', senderId).maybeSingle();
    if (!s) return json(404, { error: 'Sender not found' });
    if (!s.is_active) return json(409, { error: 'Sender is inactive' });
    sender = s;
  } else {
    sender = await pickSender();
    const { count: activeCount } = await supabase
      .from('outreach_senders').select('id', { count: 'exact', head: true }).eq('is_active', true);
    if ((activeCount || 0) > 0 && !sender) {
      return json(429, { error: 'All senders throttled or at daily limit' });
    }
  }

  // 3. Render
  let email;
  try {
    email = await renderEmailFromTemplate(templateSlug, prospect);
  } catch (e) {
    return json(400, { error: `Template render failed: ${e.message}` });
  }

  if (dryRun) {
    return json(200, { ok: true, dryRun: true, subject: email.subject, sender: sender?.email || null });
  }

  // 4. Send
  try {
    await sendEmail(prospect.email, email.subject, email.html, email.text, sender);
  } catch (e) {
    console.error('[send-template-to-prospect] send failed:', e.message);
    return json(502, { error: `Send failed: ${e.message}` });
  }

  // 5. Bump counters + log
  if (sender?.id) {
    try { await bumpSenderCounters(sender.id); } catch (e) { console.warn('bump failed:', e.message); }
  }

  try {
    await supabase.from('prospect_events').insert({
      prospect_id: prospect.id,
      event_type: 'email_sent',
      sender_id: sender?.id || null,
      meta: {
        source: 'send-template-to-prospect',
        template_slug: templateSlug,
        sender_email: sender?.email || null,
      },
    });
  } catch (e) { console.warn('event log failed:', e.message); }

  // 6. Prospect patch — ak je to prvý outreach email
  const nowIso = new Date().toISOString();
  const patch = { outreach_last_contacted_at: nowIso };
  if (!prospect.outreach_email_sent_at) {
    patch.outreach_email_sent_at = nowIso;
    patch.outreach_stage = 'email_sent';
  }
  await supabase.from('prospects').update(patch).eq('id', prospect.id);

  return json(200, {
    ok: true,
    prospect_id: prospect.id,
    sender_id: sender?.id || null,
    subject: email.subject,
  });
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
function json(status, obj) {
  return {
    statusCode: status,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
