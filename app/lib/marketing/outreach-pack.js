// ============================================================================
// DANUBRA — e-mail oslovenia a prezentácia na serveri (len Node)
// ============================================================================
// Jedno miesto, kde sa z firmy, hľadania, Nastavení a schránky poskladá to,
// čo firma dostane — rovnako pri odoslaní (danubra-outreach-send) aj pri
// náhľade a stiahnutí prezentácie (danubra-outreach-preview). Keby to bolo
// v každej funkcii zvlášť, náhľad by časom ukazoval niečo iné, než odíde.
//
//   context      firma + hľadanie, z ktorého prišla + Nastavenia
//   contactOf    kto firmu oslovuje (vizitka schránky, inak člen appky)
//   presentation PDF prispôsobené remeslu a regiónu
//   email        celé HTML + text v dizajne punds (s odhlásením)
//
// Testy: node app/tests/outreach-layout.test.js
// ============================================================================
const M = require('../mail/mail.js');
const O = require('./outreach.js');
const Pitch = require('./pitch.js');
const E = require('./outreach-email.js');
const R = require('./presentation.js');

/** Firma, hľadanie a Nastavenia. Chýbajúce hľadanie (staršia firma) nevadí. */
async function context(supabase, lead) {
  const [cfgQ, sQ] = await Promise.all([
    supabase.from('danubra_settings').select('supplier,marketing').order('created_at').limit(1),
    lead && lead.seed_search_id
      ? supabase.from('danubra_lead_searches').select('id,params,seeds,created_at').eq('id', lead.seed_search_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const row0 = (cfgQ && cfgQ.data && cfgQ.data[0]) || {};
  return { supplier: row0.supplier || {}, marketing: row0.marketing || {}, search: (sQ && sQ.data) || null };
}

/** Kto firmu oslovuje — do prezentácie (meno, funkcia, telefón, e-mail). */
function contactOf(mb = {}, member = null) {
  const c = (mb && mb.signature_card) || {};
  return {
    name: String(c.name || (member && (member.full_name || '')) || '').trim(),
    role: String(c.role || '').trim(), phone: String(c.phone || '').trim(), email: String((mb && mb.email) || '').trim(),
  };
}

function pitchFor({ lead, search, marketing, lang = 'de', trade = null }) {
  return Pitch.pitch({ lead, search, marketing, lang, trade });
}

/** PDF prezentácia. @returns {{ buffer, fileName, size, pages, meta }} */
function presentation({ lead, search, marketing, supplier, contact, pitch = null, date = new Date() }) {
  const P = pitch || pitchFor({ lead, search, marketing });
  const r = R.build({ pitch: P, lead, supplier, contact, date });
  return { ...r, meta: { kind: 'presentation', name: r.fileName, size: r.size, pages: r.pages, trade: P.trade.key, region: P.region.name || null } };
}

/**
 * E-mail v dizajne punds.
 * @param {Object} o { lead, search, marketing, supplier, mb (schránka), body (text z okna, aj s „-- podpis"),
 *                     subject, lang, step, unsubscribeUrl, assets, attachment: { name, pages } | null, pitch }
 */
function email({ lead, search, marketing, supplier, mb = {}, body = '', subject = '', lang = 'de', step = 1, unsubscribeUrl = '', assets = '', attachment = null, pitch = null }) {
  const P = pitch || pitchFor({ lead, search, marketing, lang });
  const parts = E.splitSignature(body);
  const signature = E.signatureOf(mb, M, parts.signature, assets);
  return { ...E.build({ lang, subject, body: parts.text, pitch: P, supplier, signature, replyTo: mb.email || '', unsubscribeUrl, assets, attachment, step }), pitch: P };
}

/** Priložiť prezentáciu? Výslovná voľba z okna, inak k prvému e-mailu áno, k pripomenutiu nie. */
function wantsAttachment(flag, step, marketing) {
  if (flag === true || flag === false) return flag;
  return Number(step) <= 1 && Pitch.texts(marketing).attach_default;
}

module.exports = { context, contactOf, pitchFor, presentation, email, wantsAttachment, O };
