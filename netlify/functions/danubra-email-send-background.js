// ============================================================================
// DANUBRA — rozoslať e-mail kampane cez SMTP vašej schránky (na pozadí)
// ============================================================================
// Appka založí kampaň a zoznam adresátov (`danubra_campaign_sends`, queued)
// a zavolá túto funkciu. Tá pošle najviac `limit` e-mailov (predvolene 40),
// každý zvlášť a s pauzou, aby schránka neskončila v spame. Zvyšok čaká na
// ďalšie spustenie („Pokračovať").
//
// Každý e-mail má pätičku s odosielateľom (Impressum) a odkazom na
// odhlásenie — v Nemecku je to pri obchodnom e-maile povinné. Kto sa
// odhlási, tomu už nič nepôjde (`danubra_email_optout`).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//      SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_FROM,
//      SMTP_SECURE ("true" pri porte 465), SMTP_REPLY_TO (voliteľné)
// ============================================================================
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const L = require('../../app/lib/marketing/leads.js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);
const PAUZA_MS = 2500;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function smtpReady() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
}

function transport() {
  const port = Number(process.env.SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST, port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function campaignError(id, msg) {
  await supabase.from('danubra_campaigns').update({ status: 'error', error: String(msg).slice(0, 500),
    last_run_at: new Date().toISOString() }).eq('id', id);
}

exports.handler = async (event) => {
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return; }
  const id = body.campaign_id;
  if (!id) return;
  const limit = Math.min(Math.max(Number(body.limit) || 40, 1), 100);

  const jwt = String((event.headers && (event.headers.authorization || event.headers.Authorization)) || '').replace(/^Bearer\s+/i, '');
  const { data: who } = jwt ? await supabase.auth.getUser(jwt) : { data: null };
  if (!who || !who.user) return campaignError(id, 'Neprihlásený používateľ.');
  if (!smtpReady()) {
    return campaignError(id, 'SMTP nie je nastavené. V Netlify doplňte SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS a SMTP_FROM.');
  }

  const { data: c } = await supabase.from('danubra_campaigns').select('*').eq('id', id).maybeSingle();
  if (!c) return;
  await supabase.from('danubra_campaigns').update({ status: 'sending', error: null, last_run_at: new Date().toISOString() }).eq('id', id);

  const [{ data: sends }, { data: optout }, { data: cfg }] = await Promise.all([
    supabase.from('danubra_campaign_sends').select('*').eq('campaign_id', id).eq('status', 'queued').limit(limit),
    supabase.from('danubra_email_optout').select('email').limit(20000),
    supabase.from('danubra_settings').select('supplier').limit(1),
  ]);
  const von = new Set((optout || []).map(o => String(o.email).toLowerCase()));
  const supplier = (cfg && cfg[0] && cfg[0].supplier) || {};
  const site = process.env.URL || 'https://adlify-app.netlify.app';

  const leadIds = (sends || []).map(s => s.lead_id).filter(Boolean);
  const partnerIds = (sends || []).map(s => s.partner_id).filter(Boolean);
  const [{ data: leads }, { data: partners }] = await Promise.all([
    leadIds.length ? supabase.from('danubra_leads').select('id,name,city,trade').in('id', leadIds) : { data: [] },
    partnerIds.length ? supabase.from('danubra_partners').select('id,name,city').in('id', partnerIds) : { data: [] },
  ]);
  const ludia = new Map([...(leads || []), ...(partners || [])].map(x => [x.id, x]));

  let sent = 0, failed = 0;
  let tr;
  try { tr = transport(); } catch (e) { return campaignError(id, `SMTP: ${e.message}`); }
  for (const s of sends || []) {
    const kto = ludia.get(s.lead_id || s.partner_id) || { name: s.name };
    if (von.has(String(s.email).toLowerCase())) {
      await supabase.from('danubra_campaign_sends').update({ status: 'skipped', error: 'odhlásený' }).eq('id', s.id);
      continue;
    }
    const odhlasit = `${site}/.netlify/functions/danubra-unsubscribe?t=${encodeURIComponent(s.token)}`;
    const r = { ...kto, unsubscribe: odhlasit };
    const text = `${L.fill(c.body, r, supplier)}\n${L.footer(supplier, odhlasit)}`;
    try {
      await tr.sendMail({
        from: process.env.SMTP_FROM, to: s.email, replyTo: process.env.SMTP_REPLY_TO || undefined,
        subject: L.fill(c.subject, r, supplier), text,
        headers: { 'List-Unsubscribe': `<${odhlasit}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      });
      sent++;
      const at = new Date().toISOString();
      await supabase.from('danubra_campaign_sends').update({ status: 'sent', sent_at: at, error: null }).eq('id', s.id);
      if (s.lead_id) {
        await supabase.from('danubra_leads').update({ last_contact_at: at }).eq('id', s.lead_id);
        await supabase.from('danubra_leads').update({ status: 'contacted' }).eq('id', s.lead_id).eq('status', 'new');
      }
    } catch (e) {
      failed++;
      await supabase.from('danubra_campaign_sends').update({ status: 'failed', error: String(e.message || e).slice(0, 300) }).eq('id', s.id);
      // Zlé prihlásenie do schránky platí pre všetkých — nemá zmysel skúšať ďalej.
      if (/auth|login|535|534|credentials/i.test(String(e.message || ''))) {
        return campaignError(id, `Schránka odmietla prihlásenie (${String(e.message).slice(0, 120)}). Skontrolujte SMTP_USER a SMTP_PASS.`);
      }
    }
    await sleep(PAUZA_MS);
  }

  const { count } = await supabase.from('danubra_campaign_sends').select('id', { count: 'exact', head: true })
    .eq('campaign_id', id).eq('status', 'queued');
  await supabase.from('danubra_campaigns').update({
    status: count ? 'paused' : 'done',
    sent_count: (c.sent_count || 0) + sent, failed_count: (c.failed_count || 0) + failed,
    last_run_at: new Date().toISOString(),
  }).eq('id', id);
};
