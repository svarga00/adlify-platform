// ============================================================================
// DANUBRA — osloviť jednu firmu e-mailom (a sledovať, čo sa s ním stalo)
// ============================================================================
//   POST { lead_id, mailbox_id, subject, body, step, lang, to, template_key }
//     body  text z okna „Osloviť" (alebo HTML z editora — očistí sa)
//     step  1 = prvý e-mail, 2+ = pripomenutie v tom istom vlákne (Re:,
//           In-Reply-To na predchádzajúci e-mail)
//
// Jednotlivo, nie hromadne: jedna požiadavka = jeden e-mail jednej firme.
// Pred odoslaním sa overí (app/lib/marketing/outreach.js → canSend):
//   * firma má platný e-mail, neodhlásila sa (danubra_email_optout), nemá
//     stav Odhlásená / Nemá záujem — odhlásený sa znova neosloví nikdy,
//   * denný limit oslovení (Nastavenia oslovovania, predvolene 30),
//   * prvý e-mail ide firme len raz, pripomenutia najviac do max_steps,
//   * Impressum (názov, adresa, IČ DPH alebo IČO z Nastavení) je vyplnené.
//
// Do e-mailu sa vždy pridá pätička s Impressum a odkazom na odhlásenie,
// hlavička List-Unsubscribe (odhlásenie jedným klikom v poštovom programe)
// a podľa nastavení sledovací obrázok a odkazy cez podpísané presmerovanie
// (danubra-track). Odosiela sa tou istou cestou ako Správy (app/lib/mail/
// server.js → sendAndStore): SMTP schránky, kópia do Odoslaných (bez
// sledovania), riadok v danubra_mail_messages — podľa jeho Message-ID sa
// spáruje odpoveď firmy.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MAIL_SECRET (heslá schránok),
//      URL (adresa appky od Netlify; prípadne HUB_PUBLIC_URL),
//      TRACK_SECRET alebo IP_HASH_SECRET (podpis odkazov; inak MAIL_SECRET
//      alebo service-role kľúč)
// ============================================================================
const { createClient } = require('@supabase/supabase-js');
const M = require('../../app/lib/mail/mail.js');
const O = require('../../app/lib/marketing/outreach.js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);
const srv = require('../../app/lib/mail/server.js')(supabase);
const guard = require('../../app/lib/server-guard.js')(supabase);

const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const out = (code, body) => ({ statusCode: code, headers: H, body: JSON.stringify(body) });
const lower = (s) => String(s || '').trim().toLowerCase();

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return out(405, { error: 'Nepovolená metóda' });
  const g = await guard.check(event, { key: 'marketing' });
  if (!g.ok) return out(g.status, { error: g.error });
  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch { return out(400, { error: 'Neplatné telo požiadavky.' }); }

  const step = Math.max(1, Math.min(10, parseInt(b.step, 10) || 1));
  const lang = b.lang === 'en' ? 'en' : 'de';
  const subject = String(b.subject || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const bodyIn = String(b.body || '');
  if (!b.lead_id || !b.mailbox_id) return out(400, { error: 'Chýba firma alebo schránka.' });
  if (!subject || bodyIn.trim().length < 20) return out(400, { error: 'Doplňte predmet a text e-mailu.' });
  if (bodyIn.length > 50000) return out(413, { error: 'Text e-mailu je príliš dlhý.' });

  const mb = await srv.mailbox(b.mailbox_id);
  if (!mb || !mb.active) return out(404, { error: 'Schránka neexistuje.' });
  if (!await srv.canUse(g.user.id, mb.id)) return out(403, { error: 'Do tejto schránky nemáte prístup.' });

  const { data: lead } = await supabase.from('danubra_leads').select('*').eq('id', b.lead_id).is('archived_at', null).maybeSingle();
  if (!lead) return out(404, { error: 'Firma sa nenašla.' });
  const email = lower(b.to || lead.email);

  const [cfgQ, histQ, optQ, dnesQ] = await Promise.all([
    supabase.from('danubra_settings').select('supplier,marketing').order('created_at').limit(1),
    supabase.from('danubra_outreach').select('*').eq('lead_id', lead.id).is('archived_at', null),
    email ? supabase.from('danubra_email_optout').select('email').eq('email', email).limit(1) : { data: [] },
    supabase.from('danubra_outreach').select('id', { count: 'exact', head: true })
      .in('status', ['sent', 'bounced']).gte('sent_at', O.dayStart(new Date())),
  ]);
  if (histQ.error || dnesQ.error) {
    return out(503, { error: 'Oslovovanie ešte nie je pripravené v databáze (migrácia 078).' });
  }
  const row0 = (cfgQ.data && cfgQ.data[0]) || {};
  const supplier = row0.supplier || {};
  const cfg = O.settings(row0.marketing);
  const chyba = O.impressumMissing(supplier);
  if (chyba.length) {
    return out(400, { error: `V e-maile musí byť Impressum. V Nastaveniach → Fakturačné údaje doplňte: ${chyba.join(', ')}.` });
  }
  const hist = histQ.data || [];
  const check = O.canSend({ lead, email, optouts: optQ.data || [], sentToday: dnesQ.count || 0, cfg, step, history: hist });
  if (!check.ok) return out(409, { error: check.blocks[0].text, blocks: check.blocks });

  const prev = step > 1 ? O.lastSent(hist) : null;
  const inReplyTo = prev && prev.message_id ? prev.message_id : null;
  const references = prev ? [prev.in_reply_to, prev.message_id].filter(Boolean).join(' ') || null : null;
  const token = O.newToken();
  const site = O.siteUrl();
  const secret = O.secretOf();
  const tracking = { track_opens: cfg.track_opens, track_clicks: cfg.track_clicks && !!secret };

  const { data: draft, error: e1 } = await supabase.from('danubra_outreach').insert({
    lead_id: lead.id, partner_id: lead.partner_id || null, mailbox_id: mb.id, step, lang, to_email: email,
    subject, body_text: bodyIn, token, status: 'draft', in_reply_to: inReplyTo,
    template_key: b.template_key ? String(b.template_key).slice(0, 80) : null,
    ...tracking, sent_by: g.user.id, created_by: g.user.id,
  }).select('id').single();
  if (e1 || !draft) return out(500, { error: 'Oslovenie sa nepodarilo zapísať.' });

  // Text → HTML s podpisom schránky (vizitka), ako v Správach. HTML z editora sa očistí.
  const html0 = O.looksHtml(bodyIn) ? O.sanitizeHtml(bodyIn) : M.bodyHtml(bodyIn, mb, `${site}/web/public`);
  const text0 = O.looksHtml(bodyIn) ? M.htmlToText(html0) : bodyIn;
  const c = O.compose({ html: html0, text: text0, supplier, lang, site, token, secret, cfg: { ...cfg, ...tracking } });

  let r;
  try {
    r = await srv.sendAndStore(mb, {
      user: g.user, to: [{ address: email, name: lead.name || '' }], subject, text: c.text, html: c.html,
      copy: { html: c.copyHtml, text: c.text }, store: { html_body: c.copyHtml, text_body: c.text },
      inReplyTo, references,
      headers: {
        'List-Unsubscribe': `<${c.unsubscribe}>, <mailto:${mb.email}?subject=${encodeURIComponent(lang === 'en' ? 'Unsubscribe' : 'Abmelden')}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      links: { lead_id: lead.id, partner_id: lead.partner_id || null },
    });
  } catch (e) {
    const msg = srv.smtpError(e);
    await supabase.from('danubra_outreach').update({ status: 'failed', error: msg }).eq('id', draft.id);
    return out(502, { error: msg });
  }

  const next = step < cfg.max_steps ? O.nextFollowup(r.sentAt, cfg.followup_days) : null;
  await supabase.from('danubra_outreach').update({
    status: 'sent', sent_at: r.sentAt, message_id: r.messageId, mail_message_id: r.id,
    body_html: c.copyHtml, body_text: c.text, next_followup_at: next, error: null,
  }).eq('id', draft.id);
  // Pripomína sa len posledný e-mail — predchádzajúce termíny a úloha k nim končia.
  if (prev) {
    await supabase.from('danubra_outreach').update({ next_followup_at: null }).eq('lead_id', lead.id).neq('id', draft.id);
    await supabase.from('danubra_tasks').update({ status: 'done', done_at: r.sentAt })
      .eq('source_key', `outreach:${prev.id}:${Number(prev.step) || 1}`).in('status', ['open', 'in_progress']);
  }
  return out(200, {
    ok: true, id: draft.id, message_id: r.messageId, mail_message_id: r.id, sent_at: r.sentAt,
    next_followup_at: next, tracking: c.tracked, warns: check.warns,
  });
};
