// ============================================================================
// DANUBRA — náhľad e-mailu oslovenia a prezentácia PDF na stiahnutie
// ============================================================================
//   POST { lead_id, kind: 'pdf' }
//     → { file_name, size, pages, trade, region, pdf_base64 }
//   POST { lead_id, kind: 'email', mailbox_id, subject, body, step, lang, attach_presentation }
//     → { html, text, trade, headline, attachment }
//
// Skladá presne to isté ako odoslanie (app/lib/marketing/outreach-pack.js):
// e-mail v dizajne punds a prezentáciu podľa remesla a regiónu firmy
// a hľadania, z ktorého prišla. Nič neposiela ani nezapisuje. Sledovací
// obrázok ani prepis odkazov v náhľade nie sú (tie pridá až odoslanie),
// odkaz na odhlásenie je ukážkový.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, URL / HUB_PUBLIC_URL
// ============================================================================
const { createClient } = require('@supabase/supabase-js');
const O = require('../../app/lib/marketing/outreach.js');
const Pack = require('../../app/lib/marketing/outreach-pack.js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);
const guard = require('../../app/lib/server-guard.js')(supabase);
const srv = require('../../app/lib/mail/server.js')(supabase);

const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const out = (code, body) => ({ statusCode: code, headers: H, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return out(405, { error: 'Nepovolená metóda' });
  const g = await guard.check(event, { key: 'marketing' });
  if (!g.ok) return out(g.status, { error: g.error });
  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch { return out(400, { error: 'Neplatné telo požiadavky.' }); }
  if (!b.lead_id) return out(400, { error: 'Chýba firma.' });
  if (String(b.body || '').length > 50000) return out(413, { error: 'Text e-mailu je príliš dlhý.' });

  const { data: lead } = await supabase.from('danubra_leads').select('*').eq('id', b.lead_id).is('archived_at', null).maybeSingle();
  if (!lead) return out(404, { error: 'Firma sa nenašla.' });
  const ctx = await Pack.context(supabase, lead);
  const lang = b.lang === 'en' ? 'en' : 'de';
  const step = Math.max(1, Math.min(10, parseInt(b.step, 10) || 1));

  // Schránka len tá, do ktorej človek smie (podpis a meno na prezentácii).
  let mb = {};
  if (b.mailbox_id) {
    const box = await srv.mailbox(b.mailbox_id);
    if (box && box.active && await srv.canUse(g.user.id, box.id)) mb = box;
  }
  const pitch = Pack.pitchFor({ lead, search: ctx.search, marketing: ctx.marketing, lang });
  const contact = Pack.contactOf(mb, { full_name: (g.user.user_metadata && g.user.user_metadata.full_name) || '' });

  if (b.kind === 'pdf') {
    let pdf;
    try { pdf = Pack.presentation({ lead, search: ctx.search, marketing: ctx.marketing, supplier: ctx.supplier, contact, pitch }); }
    catch (e) { return out(500, { error: `Prezentácia sa nepodarila: ${String((e && e.message) || e).slice(0, 200)}` }); }
    return out(200, { file_name: pdf.fileName, size: pdf.size, pages: pdf.pages, trade: pitch.trade.key, region: pitch.region.name || null,
      pdf_base64: pdf.buffer.toString('base64') });
  }

  const site = O.siteUrl();
  const attach = Pack.wantsAttachment(b.attach_presentation, step, ctx.marketing);
  const mail = Pack.email({ lead, search: ctx.search, marketing: ctx.marketing, supplier: ctx.supplier, mb, body: String(b.body || ''),
    subject: String(b.subject || '').slice(0, 300), lang, step, pitch, unsubscribeUrl: `${site}/.netlify/functions/danubra-unsubscribe?t=…`,
    assets: `${site}/web/public`, attachment: attach ? { name: pitch.fileName, pages: 4 } : null });
  return out(200, { html: mail.html, text: mail.text, trade: pitch.trade.key, headline: pitch.headline,
    attachment: attach ? { name: pitch.fileName } : null });
};
