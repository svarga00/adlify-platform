// ============================================================================
// punds web — automatické e-maily po odoslaní formulára (návrh 3c, 3d)
// ============================================================================
//   apply / contact (punds.sk) → potvrdenie uchádzačovi v jeho jazyku
//   enquiry (punds.eu)         → potvrdenie firme (de/en)
//   team                       → upozornenie nám (po slovensky)
// HTML je tabuľkové s inline štýlmi — tak to vykreslí Gmail, Outlook aj
// mobil. Logo je PNG (SVG e-mailové programy neukážu).
// ============================================================================
'use strict';

const { esc } = require('./shared/h');
const PROF = require('./shared/professions');

const INK = '#0E1626', OR = '#F07F1A', T2 = '#4A5570', T3 = '#6F7A92', CHALK = '#F4F4F1', LINE = '#E6E8EC';
const FONT = "'Hanken Grotesk',Arial,Helvetica,sans-serif", HEAD = "'Outfit',Arial,Helvetica,sans-serif";
const ADDR = 'Partner und Service s. r. o. · Podzámska 9468/4A, 940 71 Nové Zámky';

const L = {
  sk: { subj: 'Prihlášku sme dostali', ref: 'Prihláška', thanks: (n) => `Ďakujeme${n ? `, ${n}` : ''}. Prihlášku sme dostali.`,
    sub: 'Ozveme sa Vám do 24 hodín v pracovné dni, aby sme si prešli podmienky a termín nástupu. Životopis netreba.',
    next: 'Čo bude nasledovať', steps: [['Zavoláme Vám', 'Overíme prax a certifikáty.'], ['Pošleme ponuku', 'Presné podmienky, ubytovanie, turnus.'], ['Nástup', 'Pomôžeme s dokumentmi aj cestou.']],
    wa: 'Napísať nám na WhatsApp', q: (p) => `Máte otázku? Zavolajte na <b style="color:${INK}">${p}</b> alebo odpíšte na tento e-mail.`, perH: '/ hod.', web: 'punds.sk' },
  cz: { subj: 'Přihlášku jsme obdrželi', ref: 'Přihláška', thanks: (n) => `Děkujeme${n ? `, ${n}` : ''}. Přihlášku jsme obdrželi.`,
    sub: 'Ozveme se Vám do 24 hodin v pracovní dny, abychom probrali podmínky a termín nástupu. Životopis není potřeba.',
    next: 'Co bude následovat', steps: [['Zavoláme Vám', 'Ověříme praxi a certifikáty.'], ['Pošleme nabídku', 'Přesné podmínky, ubytování, turnus.'], ['Nástup', 'Pomůžeme s dokumenty i cestou.']],
    wa: 'Napsat nám na WhatsApp', q: (p) => `Máte otázku? Zavolejte na <b style="color:${INK}">${p}</b> nebo odpovězte na tento e-mail.`, perH: '/ hod.', web: 'punds.sk' },
  hu: { subj: 'Megkaptuk a jelentkezését', ref: 'Jelentkezés', thanks: (n) => `Köszönjük${n ? `, ${n}` : ''}! Megkaptuk a jelentkezését.`,
    sub: 'Munkanapokon 24 órán belül felvesszük Önnel a kapcsolatot, hogy átbeszéljük a feltételeket és a kezdés időpontját. Önéletrajzra nincs szükség.',
    next: 'Hogyan tovább', steps: [['Felhívjuk Önt', 'Ellenőrizzük a gyakorlatot és a tanúsítványokat.'], ['Ajánlatot küldünk', 'Pontos feltételek, szállás, turnus.'], ['Kezdés', 'Segítünk az iratokkal és az utazással.']],
    wa: 'Írjon nekünk WhatsAppon', q: (p) => `Kérdése van? Hívja a <b style="color:${INK}">${p}</b> számot, vagy válaszoljon erre az e-mailre.`, perH: '/ óra', web: 'punds.sk' },
  de: { subj: 'Ihre Bewerbung ist eingegangen', ref: 'Bewerbung', thanks: (n) => `Vielen Dank${n ? `, ${n}` : ''}. Ihre Bewerbung ist bei uns eingegangen.`,
    sub: 'Wir melden uns an Werktagen innerhalb von 24 Stunden, um Konditionen und Starttermin zu besprechen. Ein Lebenslauf ist nicht nötig.',
    next: 'Wie es weitergeht', steps: [['Wir rufen Sie an', 'Wir prüfen Erfahrung und Zertifikate.'], ['Wir senden ein Angebot', 'Genaue Konditionen, Unterkunft, Turnus.'], ['Start', 'Wir helfen bei Unterlagen und Anreise.']],
    wa: 'Per WhatsApp schreiben', q: (p) => `Fragen? Rufen Sie uns an unter <b style="color:${INK}">${p}</b> oder antworten Sie auf diese E-Mail.`, perH: '/ Std.', web: 'punds.sk' },
  en: { subj: 'We have received your application', ref: 'Application', thanks: (n) => `Thank you${n ? `, ${n}` : ''}. We have received your application.`,
    sub: 'We will get back to you within 24 hours on working days to go through the terms and start date. No CV needed.',
    next: 'What happens next', steps: [['We call you', 'We check your experience and certificates.'], ['We send an offer', 'Exact terms, accommodation, rotation.'], ['Start', 'We help with paperwork and travel.']],
    wa: 'Message us on WhatsApp', q: (p) => `Questions? Call <b style="color:${INK}">${p}</b> or reply to this email.`, perH: '/ hr', web: 'punds.sk' },
};
const LE = {
  de: { subj: 'Ihre Anfrage bei punds', ref: 'Anfrage', h: 'Vielen Dank für Ihre Anfrage.', sub: 'Wir melden uns innerhalb eines Werktages mit passenden Profilen und Konditionen.',
    f: { trade: 'Gewerk', n: 'Anzahl', loc: 'Einsatzort', start: 'Start' }, persons: (n) => `${n} ${n === 1 ? 'Person' : 'Personen'}`,
    contact: 'Ihr Ansprechpartner', team: 'Team punds', web: 'punds.eu', country: 'Slowakei' },
  en: { subj: 'Your enquiry with punds', ref: 'Enquiry', h: 'Thank you for your enquiry.', sub: 'We will get back to you within one working day with matching profiles and terms.',
    f: { trade: 'Trade', n: 'Headcount', loc: 'Location', start: 'Start' }, persons: (n) => `${n} ${n === 1 ? 'person' : 'people'}`,
    contact: 'Your contact', team: 'punds team', web: 'punds.eu', country: 'Slovakia' },
};

function shell({ assets, ref, inner, foot }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>punds</title></head>
<body style="margin:0;padding:0;background:#E9EAEC;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E9EAEC;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;font-family:${FONT};color:${INK};">
<tr><td style="background:${INK};padding:22px 28px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:10px;vertical-align:middle;"><img src="${assets}/img/email/punds-mark-white.png" width="34" height="26" alt="" style="display:block;border:0;"></td>
      <td style="vertical-align:middle;"><div style="font:700 22px/1 ${HEAD};letter-spacing:-1px;color:#ffffff;">punds</div>
        <div style="font:500 6px/1 ${FONT};letter-spacing:1.6px;color:#8C97AD;padding-top:5px;">PARTNER UND SERVICE</div></td></tr></table></td>
    <td align="right" style="vertical-align:middle;font:500 12px ${FONT};color:#8C97AD;">${esc(ref)}</td>
  </tr></table></td></tr>
${inner}
<tr><td style="background:${CHALK};padding:18px 28px;font:400 12px/1.6 ${FONT};color:${T3};">${foot}</td></tr>
</table></td></tr></table></body></html>`;
}

const btn = (href, label, bg = OR) => `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${bg};border-radius:999px;">
  <a href="${esc(href)}" style="display:inline-block;padding:13px 22px;font:600 14.5px ${FONT};color:#ffffff;text-decoration:none;">${esc(label)} →</a></td></tr></table>`;

/**
 * Potvrdenie prihlášky (punds.sk).
 * @param {Object} o { lang, name, job: { title, city, rate, start, image }, ref, assets, phone, whatsapp }
 */
function confirmApply({ lang = 'sk', name = '', job = null, ref = '', assets, phone = '+421 910 523 958', whatsapp = '421910523858' } = {}) {
  const t = L[lang] || L.sk;
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const card = job ? `<tr><td style="padding:6px 28px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:16px;overflow:hidden;"><tr>
    ${job.image ? `<td width="150" style="width:150px;vertical-align:top;"><img src="${esc(job.image)}" width="150" height="112" alt="" style="display:block;width:150px;height:112px;object-fit:cover;border:0;"></td>` : ''}
    <td style="padding:14px 18px;vertical-align:middle;"><div style="font:600 17px/1.25 ${HEAD};color:${INK};">${esc(job.title)}</div>
      <div style="font:400 13.5px/1.5 ${FONT};color:${T3};padding-top:3px;">${esc([job.city, job.start].filter(Boolean).join(' · '))}</div>
      ${job.rate ? `<div style="font:700 18px ${HEAD};color:${OR};padding-top:6px;">${esc(job.rate)} ${esc(t.perH)}</div>` : ''}</td></tr></table></td></tr>` : '';
  const steps = t.steps.map(([h, p], i) => `<tr><td style="padding:6px 0;vertical-align:top;width:38px;">
      <div style="width:26px;height:26px;border-radius:13px;background:${CHALK};text-align:center;font:700 12px/26px ${HEAD};color:${OR};">${i + 1}</div></td>
    <td style="padding:6px 0;font:400 14.5px/1.5 ${FONT};color:${T2};"><b style="color:${INK};">${esc(h)}</b> – ${esc(p)}</td></tr>`).join('');
  const inner = `<tr><td style="padding:32px 28px 8px;">
    <div style="width:52px;height:52px;border-radius:26px;background:${OR};color:#ffffff;text-align:center;font:400 24px/52px ${FONT};">✓</div>
    <h1 style="margin:16px 0 10px;font:700 28px/1.12 ${HEAD};letter-spacing:-1px;color:${INK};">${esc(t.thanks(first))}</h1>
    <p style="margin:0;font:400 15.5px/1.65 ${FONT};color:${T2};">${esc(t.sub)}</p></td></tr>
  ${card}
  <tr><td style="padding:16px 28px 26px;"><div style="font:600 15px ${HEAD};color:${INK};padding-bottom:6px;">${esc(t.next)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0">${steps}</table>
    <div style="height:16px;"></div>${btn(`https://wa.me/${whatsapp}`, t.wa)}</td></tr>`;
  const foot = `${t.q(esc(phone))}<br>${esc(ADDR)} · ${t.web}`;
  const text = [t.thanks(first), '', t.sub, job ? `\n${job.title}${job.city ? ` · ${job.city}` : ''}${job.rate ? ` · ${job.rate} ${t.perH}` : ''}` : '',
    '', `${t.next}:`, ...t.steps.map(([h, p], i) => `${i + 1}. ${h} – ${p}`), '', t.q(phone).replace(/<[^>]+>/g, ''), ADDR].join('\n');
  return { subject: `${t.subj}${job ? ` – ${job.title}` : ''} | punds`, html: shell({ assets, ref: `${t.ref} ${ref}`, inner, foot }), text };
}

/**
 * Potvrdenie dopytu (punds.eu).
 * @param {Object} o { lang, company, name, trades[keys], headcount, location, start, ref, assets, contact: { name, phone, email } }
 */
function confirmEnquiry({ lang = 'de', trades = [], headcount = null, location = '', start = '', ref = '', assets, contact = {} } = {}) {
  const t = LE[lang] || LE.de;
  const tradeNames = trades.map((k) => PROF.byKey(k)).filter(Boolean).map((p) => (p.eu ? p.eu.name[lang] || p.eu.name.de : PROF.nameOf(p, lang))).join(', ');
  const cells = [[t.f.trade, tradeNames], [t.f.n, headcount ? t.persons(headcount) : ''], [t.f.loc, location], [t.f.start, start]].filter(([, v]) => v);
  const grid = cells.length ? `<tr><td style="padding:8px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CHALK};border-radius:16px;">
    ${cells.reduce((rows, c, i) => (i % 2 ? (rows[rows.length - 1].push(c), rows) : (rows.push([c]), rows)), []).map((r) => `<tr>${r.map(([k, v]) => `<td width="50%" style="padding:14px 20px;vertical-align:top;">
      <div style="font:400 12px ${FONT};color:${T3};">${esc(k)}</div><div style="font:600 16px/1.3 ${HEAD};color:${INK};padding-top:2px;">${esc(v)}</div></td>`).join('')}${r.length === 1 ? '<td></td>' : ''}</tr>`).join('')}
    </table></td></tr>` : '';
  const who = contact.name || t.team;
  const inner = `<tr><td style="padding:34px 28px 8px;">
    <h1 style="margin:0 0 10px;font:700 28px/1.12 ${HEAD};letter-spacing:-1px;color:${INK};">${esc(t.h)}</h1>
    <p style="margin:0;font:400 15.5px/1.65 ${FONT};color:${T2};">${esc(t.sub)}</p></td></tr>
  ${grid}
  <tr><td style="padding:14px 28px 26px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:14px;vertical-align:middle;"><div style="width:52px;height:52px;border-radius:26px;background:${INK};text-align:center;">
      <img src="${assets}/img/email/punds-mark-white.png" width="30" height="23" alt="" style="display:inline-block;margin-top:15px;border:0;"></div></td>
    <td style="vertical-align:middle;font:400 14px/1.5 ${FONT};color:${T2};"><b style="color:${INK};">${esc(t.contact)}: ${esc(who)}</b><br>${esc([contact.phone, contact.email].filter(Boolean).join(' · '))}</td>
  </tr></table></td></tr>`;
  const foot = `Partner und Service s. r. o. · Podzámska 9468/4A, 940 71 Nové Zámky, ${t.country} · ${t.web}`;
  const text = [t.h, '', t.sub, '', ...cells.map(([k, v]) => `${k}: ${v}`), '', `${t.contact}: ${who}${contact.phone ? ` · ${contact.phone}` : ''}${contact.email ? ` · ${contact.email}` : ''}`, '', foot].join('\n');
  return { subject: `${t.subj}${tradeNames ? ` – ${tradeNames}` : ''}`, html: shell({ assets, ref: `${t.ref} ${ref}`, inner, foot: esc(foot) }), text };
}

/** Upozornenie pre nás — krátke, po slovensky, s odkazom do appky. */
function team({ kind, data = {}, job = null, appUrl = '' } = {}) {
  const lines = kind === 'enquiry'
    ? [`Nový dopyt z punds.eu: ${data.company}`, `Kontakt: ${data.name} · ${data.email}${data.phone ? ` · ${data.phone}` : ''}`,
      data.trades && data.trades.length ? `Remeslá: ${data.trades.map((k) => PROF.nameOf(PROF.byKey(k), 'sk')).join(', ')}` : '',
      data.headcount ? `Počet: ${data.headcount}` : '', data.location ? `Miesto: ${data.location}` : '', data.start ? `Začiatok: ${data.start}` : '',
      data.note ? `\n${data.note}` : '', appUrl ? `\nV appke: ${appUrl}#/opportunities` : '']
    : [`Nová ${kind === 'apply' ? 'prihláška' : 'správa'} z punds.sk: ${data.name}`, `Telefón: ${data.phone}${data.email ? ` · ${data.email}` : ''}`,
      job ? `Ponuka: ${job.title}${job.city ? ` · ${job.city}` : ''}` : (data.profession ? `Profesia: ${data.profession}` : ''),
      data.lang ? `Jazyk: ${data.lang}` : '', data.note ? `\n${data.note}` : '', appUrl ? `\nV appke: ${appUrl}#/candidates` : ''];
  const text = lines.filter(Boolean).join('\n');
  return { subject: lines[0], text, html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(text)}</div>` };
}

module.exports = { confirmApply, confirmEnquiry, team, L, LE };
