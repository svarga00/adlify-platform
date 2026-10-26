// ============================================================================
// punds web — odoslanie automatických e-mailov po formulári
// ============================================================================
// Z ktorej schránky sa posiela, určuje Nastavenia → Schránky → „E-maily
// z webov" (danubra_settings.web). Kým tam nič nie je, neposiela sa nič —
// prihláška sa aj tak uloží do appky.
//
// Odosiela sa cez SMTP firemnej schránky (rovnako ako zo Správ) a kópia
// ide do jej priečinka Odoslané, takže je vidieť aj v Správach.
// ============================================================================
'use strict';

const MailComposer = require('nodemailer/lib/mail-composer');
const emails = require('./emails');
const { toJob } = require('./shared/jobs');
const { rate, start, T: SKT } = require('./sk/common');

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('časový limit')), ms));

function notifier(supabase) {
  const srv = require('../app/lib/mail/server.js')(supabase);
  let cfg = null, cfgAt = 0;
  const settings = async () => {
    if (!cfg || Date.now() - cfgAt > 60000) {
      const { data } = await supabase.from('danubra_settings').select('web').limit(1).maybeSingle();
      cfg = (data && data.web) || {}; cfgAt = Date.now();
    }
    return cfg;
  };

  async function send(mb, pass, { to, subject, html, text, replyTo }) {
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

  /**
   * @param {Object} o { site, kind: apply|contact|enquiry, data (validované polia), ad (riadok inzerátu), id }
   * @returns {Promise<{ confirm: boolean, team: boolean, skipped?: string }>}
   */
  return async function notify({ site, kind, data, ad = null, id = '' }) {
    const w = await settings();
    if (!w.confirm) return { confirm: false, team: false, skipped: 'vypnuté' };
    const mbId = w[`mailbox_${site.key}`];
    const mb = mbId ? await srv.mailbox(mbId) : null;
    if (!mb || !mb.active || !mb.secret_enc) return { confirm: false, team: false, skipped: 'bez schránky' };
    const pass = srv.password(mb);
    const assets = `${process.env.URL || 'https://adlify-app.netlify.app'}/web/public`;
    const ref = String(id || '').replace(/-/g, '').slice(0, 6).toUpperCase();
    const res = { confirm: false, team: false };

    let mail = null, job = null;
    if (kind === 'enquiry') {
      mail = emails.confirmEnquiry({ lang: data.lang === 'en' ? 'en' : 'de', trades: data.trades, headcount: data.headcount,
        location: data.location, start: data.start, ref, assets, contact: { name: w.contact_eu || '', phone: w.phone_eu || '+421 910 523 958', email: mb.email } });
    } else {
      const lang = SKT[data.lang] ? data.lang : 'sk';
      if (ad) {
        const j = toJob(ad, lang);
        job = { title: j.title, city: j.city, rate: rate(j), start: start(j, SKT[lang]), image: j.image };
      }
      mail = emails.confirmApply({ lang, name: data.name, job, ref, assets });
    }
    if (data.email) {
      try { await send(mb, pass, { to: data.email, ...mail }); res.confirm = true; } catch (e) { res.confirmError = String(e.message || e).slice(0, 200); }
    }
    const teamTo = w[`notify_${site.key}`] || mb.email;
    if (teamTo) {
      const t = emails.team({ kind, data, job, appUrl: `${process.env.URL || 'https://adlify-app.netlify.app'}/app/` });
      try { await send(mb, pass, { to: teamTo, replyTo: data.email || undefined, ...t }); res.team = true; } catch (e) { res.teamError = String(e.message || e).slice(0, 200); }
    }
    return res;
  };
}

module.exports = { notifier };
