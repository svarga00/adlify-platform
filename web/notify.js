// ============================================================================
// punds web — odoslanie automatických e-mailov po formulári
// ============================================================================
// Z ktorej schránky sa posiela, určuje Nastavenia → Schránky → „E-maily
// z webov" (danubra_settings.web). Kým tam nič nie je, neposiela sa nič —
// prihláška sa aj tak uloží do appky.
//
// Odosiela sa cez SMTP firemnej schránky (rovnako ako zo Správ) a kópia
// ide do jej priečinka Odoslané, takže je vidieť aj v Správach.
//
// Dve veci, nezávisle od seba:
//   * upozornenie tímu — ide vždy, keď je zvolená schránka (adresa je
//     notify_<web>, inak samotná schránka); bez neho by o novej prihláške
//     nikto nevedel,
//   * potvrdenie odosielateľovi — len keď je zapnuté (web.confirm)
//     a odosielateľ zadal e-mail.
// Telefón a WhatsApp v potvrdení sú z Kontaktov v appke (web/content.js),
// rovnaké ako na webe.
// ============================================================================
'use strict';

const emails = require('./emails');
const content = require('./content');
const { toJob } = require('./shared/jobs');
const { rate, start, T: SKT } = require('./sk/common');

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('časový limit')), ms));

/**
 * @param {Object} supabase  klient so service role
 * @param {Object} [o]
 * @param {Function} [o.content]  async () => riadky danubra_web_content (content.loader) — inak si ho založí sám
 * @param {Object}   [o.srv]      náhrada app/lib/mail/server.js (testy)
 * @param {Function} [o.send]     náhrada odoslania (mb, pass, mail) (testy)
 */
function notifier(supabase, { content: contentRows = null, srv = null, send: sendOverride = null } = {}) {
  srv = srv || require('../app/lib/mail/server.js')(supabase);
  const rows = contentRows || content.loader(supabase);
  let cfg = null, cfgAt = 0;
  const settings = async () => {
    if (!cfg || Date.now() - cfgAt > 60000) {
      const { data } = await supabase.from('danubra_settings').select('web').limit(1).maybeSingle();
      cfg = (data && data.web) || {}; cfgAt = Date.now();
    }
    return cfg;
  };

  async function smtpSend(mb, pass, { to, subject, html, text, replyTo }) {
    const MailComposer = require('nodemailer/lib/mail-composer');
    const raw = await new MailComposer({
      from: { name: mb.display_name || 'punds', address: mb.email }, to, subject, html, text, replyTo,
    }).compile().build();
    await Promise.race([srv.smtp(mb, pass).sendMail({ envelope: { from: mb.email, to: [].concat(to).map((x) => (x.address || x)) }, raw }), timeout(9000)]);
    try {                                   // kópia do Odoslaných — keď nevyjde, e-mail je aj tak odoslaný
      const client = srv.imap(mb, pass);
      await Promise.race([client.connect(), timeout(4000)]);
      const folder = mb.sent_folder || await srv.findSent(client);
      if (folder) await Promise.race([client.append(folder, raw, ['\\Seen']), timeout(4000)]);
      await client.logout();
    } catch (e) { /* bez kópie */ }
  }
  const send = sendOverride || smtpSend;

  /**
   * @param {Object} o { site, kind: apply|contact|enquiry, data (validované polia), ad (riadok inzerátu), id }
   * @returns {Promise<{ confirm: boolean, team: boolean, skipped?: string, confirmError?: string, teamError?: string }>}
   */
  return async function notify({ site, kind, data, ad = null, id = '' }) {
    const w = await settings();
    const mbId = w[`mailbox_${site.key}`];
    const mb = mbId ? await srv.mailbox(mbId) : null;
    if (!mb || !mb.active || !mb.secret_enc) return { confirm: false, team: false, skipped: 'bez schránky' };
    const pass = srv.password(mb);
    const base = process.env.URL || 'https://adlify-app.netlify.app';
    const assets = `${base}/web/public`;
    const ref = String(id || '').replace(/-/g, '').slice(0, 6).toUpperCase();
    const res = { confirm: false, team: false };

    let job = null;
    if (kind !== 'enquiry' && ad) {
      const lang = SKT[data.lang] ? data.lang : 'sk';
      const j = toJob(ad, lang);
      job = { title: j.title, city: j.city, rate: rate(j), start: start(j, SKT[lang]), image: j.image };
    }

    const jobs = [];
    // Upozornenie tímu — vždy (nezávisí od potvrdenia odosielateľovi).
    const teamTo = w[`notify_${site.key}`] || mb.email;
    if (teamTo) {
      const t = emails.team({ kind, data, job, appUrl: `${base}/app/` });
      jobs.push(send(mb, pass, { to: teamTo, replyTo: data.email || undefined, ...t })
        .then(() => { res.team = true; }, (e) => { res.teamError = String(e.message || e).slice(0, 200); }));
    }
    // Potvrdenie odosielateľovi — len keď je zapnuté.
    if (w.confirm && data.email) {
      let c = null;
      try { c = content.contactsOf(await rows()); } catch (e) { c = content.contactsOf({}); }
      let mail;
      if (kind === 'enquiry') {
        mail = emails.confirmEnquiry({ lang: data.lang === 'en' ? 'en' : 'de', trades: data.trades, headcount: data.headcount,
          location: data.location, start: data.start, ref, assets,
          contact: { name: w.contact_eu || '', phone: String(w.phone_eu || '').trim() || c.eu.phone, email: mb.email } });
      } else {
        mail = emails.confirmApply({ lang: SKT[data.lang] ? data.lang : 'sk', name: data.name, job, ref, assets,
          phone: c.sk.phone1, whatsapp: c.whatsapp });
      }
      jobs.push(send(mb, pass, { to: data.email, ...mail })
        .then(() => { res.confirm = true; }, (e) => { res.confirmError = String(e.message || e).slice(0, 200); }));
    } else if (!w.confirm) res.skippedConfirm = 'vypnuté';
    await Promise.all(jobs);
    return res;
  };
}

module.exports = { notifier };
