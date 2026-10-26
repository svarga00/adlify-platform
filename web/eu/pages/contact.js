// ============================================================================
// punds.eu — Kontakt / Anfrage (návrh 3b) + spoločný dopytový formulár
// ============================================================================
// enquiryForm() používajú aj home.js a trade.js:
//   require('./contact').enquiryForm(ctx, { variant, trade, stepper, … })
// Polia (web/README.md → enquiry): company, name, email, phone, trades[],
// headcount, location, start, model (werkvertrag|aueg|open), message,
// consent, trade (slug remesla, ak sa pýta z detailu remesla).
// ============================================================================
'use strict';

const { esc, each } = require('../../shared/h');
const { mark } = require('../../shared/brand');
const PROF = require('../../shared/professions');
const { PHONE, MAIL, tel } = require('../common');

/** Krátke názvy remesiel pre čipy vo formulári (podľa návrhu 3b). */
const SHORT = {
  de: { zvarac: 'Schweißen', zamocnik: 'Metallbau', sadrokarton: 'Trockenbau', maliar: 'Maler', zateplovac: 'WDVS', okna: 'Fenster & Türen', nabytok: 'Möbelmontage', pomocnik: 'Bauhelfer' },
  en: { zvarac: 'Welding', zamocnik: 'Metalwork', sadrokarton: 'Drywall', maliar: 'Painting', zateplovac: 'ETICS', okna: 'Windows & doors', nabytok: 'Furniture assembly', pomocnik: 'Construction helpers' },
};

/** Texty formulára. */
const F = {
  de: {
    trades: 'Gewerk', headcount: 'Anzahl Personen', headcountPh: 'z. B. 4', location: 'Einsatzort', locationPh: 'PLZ / Stadt',
    start: 'Start ab', startPh: 'KW / Datum', model: 'Form der Zusammenarbeit',
    models: [['werkvertrag', 'Werkvertrag'], ['aueg', 'Arbeitnehmer­überlassung'], ['open', 'Noch offen']],
    aueg: 'Arbeitnehmerüberlassung nur mit gültiger Erlaubnis nach AÜG – wir klären das vor Projektbeginn mit Ihnen.',
    company: 'Firma', companyPh: 'Musterbau GmbH', name: 'Ansprechpartner', namePh: 'Vor- und Nachname',
    email: 'E-Mail', emailPh: 'name@firma.de', phone: 'Telefon', phonePh: '+49 …',
    message: 'Weitere Angaben', messagePh: 'Projekt, Anforderungen, Zertifikate …',
    consent: (href) => `Ich habe die <a href="${esc(href)}">Datenschutzerklärung</a> gelesen und bin mit der Verarbeitung meiner Angaben zur Bearbeitung der Anfrage einverstanden.`,
    send: 'Anfrage senden', less: 'Weniger', more: 'Mehr',
    okH: 'Vielen Dank für Ihre Anfrage', okP: 'Wir haben Ihre Angaben erhalten und melden uns innerhalb eines Werktages – per E-Mail oder telefonisch.',
    okFor: (x) => `Wir haben Ihre Anfrage für <b>${esc(x)}</b> erhalten und melden uns innerhalb eines Werktages mit passenden Profilen.`,
    okHome: 'Zur Startseite',
  },
  en: {
    trades: 'Trade', headcount: 'Number of people', headcountPh: 'e.g. 4', location: 'Site location', locationPh: 'Postcode / city',
    start: 'Start from', startPh: 'Week / date', model: 'Type of collaboration',
    models: [['werkvertrag', 'Subcontracting'], ['aueg', 'Temporary staffing'], ['open', 'Not decided yet']],
    aueg: 'Temporary staffing (Arbeitnehmerüberlassung) only with a valid licence under the German AÜG – we clarify this with you before the project starts.',
    company: 'Company', companyPh: 'Example Construction Ltd', name: 'Contact person', namePh: 'First and last name',
    email: 'Email', emailPh: 'name@company.com', phone: 'Phone', phonePh: '+49 …',
    message: 'Further details', messagePh: 'Project, requirements, certificates …',
    consent: (href) => `I have read the <a href="${esc(href)}">privacy policy</a> and agree to my details being processed to handle this enquiry.`,
    send: 'Send enquiry', less: 'Fewer', more: 'More',
    okH: 'Thank you for your enquiry', okP: 'We have received your details and will get back to you within one working day – by email or phone.',
    okFor: (x) => `We have received your enquiry for <b>${esc(x)}</b> and will get back to you within one working day with matching profiles.`,
    okHome: 'Back to the home page',
  },
};

/**
 * Dopytový formulár.
 * @param {Object} ctx
 * @param {Object} o { variant: 'full'|'compact', id, trade (profesia), stepper, ctaOne, ctaMany, messagePh }
 */
function enquiryForm(ctx, o = {}) {
  const f = F[ctx.lang];
  const id = o.id || 'enq';
  const compact = o.variant === 'compact';
  const sel = o.trade ? o.trade.key : null;
  const lbl = (text, req) => `<span class="eu-lbl${compact ? ' sr' : ''}">${esc(text)}${req ? ' *' : ''}</span>`;
  const ph = (label, p, req) => (compact ? `${label}${req ? ' *' : ''}` : p);
  const input = (name, type, label, p, req, extra = '') => `<label class="eu-fld">${lbl(label, req)}<input type="${type}" name="${name}" placeholder="${esc(ph(label, p, req))}"${req ? ' required' : ''}${extra}></label>`;

  const chips = `<fieldset class="eu-fs"><legend class="eu-lbl">${esc(f.trades)}</legend><div class="eu-chips">${each(PROF.euTrades(), (p) =>
    `<label class="eu-chip"><input type="checkbox" name="trades[]" value="${esc(p.key)}"${p.key === sel ? ' checked' : ''}><span>${esc(SHORT[ctx.lang][p.key] || p.eu.name[ctx.lang])}</span></label>`)}</div></fieldset>`;

  const count = o.stepper
    ? `<div class="eu-fld"><label class="eu-lbl${compact ? ' sr' : ''}" for="${id}-hc">${esc(f.headcount)}</label>
      <div class="eu-step" data-step><button type="button" data-d="-1" aria-label="${esc(f.less)}">−</button><input id="${id}-hc" type="number" name="headcount" value="2" min="1" max="99" inputmode="numeric"><button type="button" data-d="1" aria-label="${esc(f.more)}">+</button></div></div>`
    : input('headcount', 'number', f.headcount, f.headcountPh, false, ' min="1" max="999" inputmode="numeric"');
  const need = `<div class="eu-row3">${count}${input('location', 'text', f.location, f.locationPh, false, ' autocomplete="address-level2"')}${input('start', 'text', f.start, f.startPh)}</div>`;

  const model = `<fieldset class="eu-fs"><legend class="eu-lbl">${esc(f.model)}</legend>
    <div class="eu-seg">${each(f.models, ([v, t]) => `<label><input type="radio" name="model" value="${v}"${v === 'open' ? ' checked' : ''}><span>${esc(t)}</span></label>`)}</div>
    <p class="eu-note">${esc(f.aueg)}</p></fieldset>`;

  const who = `<div class="row2">${input('company', 'text', f.company, f.companyPh, true, ' autocomplete="organization"')}${input('name', 'text', f.name, f.namePh, true, ' autocomplete="name"')}${input('email', 'email', f.email, f.emailPh, true, ' autocomplete="email"')}${input('phone', 'tel', f.phone, f.phonePh, false, ' autocomplete="tel"')}</div>`;
  const msgPh = o.messagePh || f.messagePh;
  const msg = `<label class="eu-fld">${lbl(f.message)}<textarea name="message" rows="${compact ? 4 : 3}" placeholder="${esc(msgPh)}"></textarea></label>`;

  const tradeName = o.trade ? o.trade.eu.name[ctx.lang] : '';
  const cta = o.ctaMany ? ` data-cta-one="${esc(o.ctaOne)}" data-cta-many="${esc(o.ctaMany)}"` : '';
  const ctaText = o.ctaMany ? o.ctaMany.replace('{n}', '2') : `${f.send} →`;

  return `<form class="form eu-form${compact ? ' eu-form-compact' : ''}" data-form="enquiry"${o.attrs || ''}>
  ${o.trade ? `<input type="hidden" name="trade" value="${esc(o.trade.eu.slug[ctx.lang])}">` : ''}
  ${compact ? `${who}${chips}${need}${model}${msg}` : `${chips}${need}${model}<div class="eu-div" role="presentation"></div>${who}${msg}`}
  <label class="check"><input type="checkbox" name="consent" required><span>${f.consent(ctx.url('privacy'))}</span></label>
  <div class="hp" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>
  <div class="form-msg" role="alert"></div>
  <button type="submit" class="btn btn-primary btn-block eu-send"${cta}>${esc(ctaText)}</button>
  <template data-ok><div class="ok-ico" aria-hidden="true">✓</div><h3>${esc(f.okH)}</h3><p>${o.trade ? f.okFor(tradeName) : esc(f.okP)}</p><a class="link-u" href="${esc(ctx.url('home'))}">${esc(f.okHome)}</a></template>
</form>`;
}

const T = {
  de: {
    title: 'Kontakt & Anfrage – Fachkräfte aus der Slowakei | punds',
    desc: 'Fachkräfte für Ihre Baustelle anfragen: Gewerk, Einsatzort, Start und Anzahl angeben – wir melden uns innerhalb eines Werktages mit passenden Profilen.',
    home: 'Startseite', crumb: 'Kontakt', h1: 'Fachkräfte anfragen',
    sub: 'Beschreiben Sie kurz Ihren Bedarf. Wir melden uns innerhalb eines Werktages mit passenden Profilen und Konditionen.',
    person: 'Ihr Ansprechpartner', role: 'Projektkoordination Deutschland', hours: 'Mo–Fr 8:00–16:00 · Antwort auf Deutsch',
    nextH: 'So geht es weiter',
    next: [['Anfrage', 'Wir prüfen Ihren Bedarf.'], ['Angebot', 'Passende Profile und Konditionen, meist innerhalb von 1–3 Tagen.'], ['Einsatz', 'Anreise, Unterkunft und Start auf der Baustelle.']],
    seat: 'Firmensitz', addr: 'Podzámska 9468/4A, 940 71 Nové Zámky, Slowakei', route: 'In Google Maps öffnen',
    dataH: 'Firmendaten', data: [['Firma', 'Partner und Service s. r. o.'], ['IČO (Reg.-Nr.)', '57553921'], ['USt-IdNr.', 'SK2122816839'],
      ['Register', 'Obchodný register Okresného súdu Nitra, Abt. Sro, Nr. 69265/N']],
    md: 'Geschäftsführer', mdPh: '[Name folgt]', imprint: 'Zum Impressum',
  },
  en: {
    title: 'Contact & enquiry – skilled tradespeople from Slovakia | punds',
    desc: 'Request tradespeople for your site: tell us the trade, location, start date and headcount – we will reply within one working day with matching profiles.',
    home: 'Home', crumb: 'Contact', h1: 'Request tradespeople',
    sub: 'Briefly describe what you need. We will get back to you within one working day with matching profiles and terms.',
    person: 'Your contact person', role: 'Project coordination Germany', hours: 'Mon–Fri 8:00–16:00 · German and English',
    nextH: 'What happens next',
    next: [['Enquiry', 'We review your requirements.'], ['Proposal', 'Matching profiles and terms, usually within 1–3 days.'], ['Deployment', 'Travel, accommodation and start on site.']],
    seat: 'Registered office', addr: 'Podzámska 9468/4A, 940 71 Nové Zámky, Slovakia', route: 'Open in Google Maps',
    dataH: 'Company details', data: [['Company', 'Partner und Service s. r. o.'], ['Company ID (IČO)', '57553921'], ['VAT ID', 'SK2122816839'],
      ['Register', 'Commercial Register of the District Court Nitra, section Sro, file no. 69265/N']],
    md: 'Managing director', mdPh: '[name to follow]', imprint: 'View imprint',
  },
};

const phoneIco = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

async function render(ctx) {
  const t = T[ctx.lang];
  const maps = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Podzámska 9468/4A, 940 71 Nové Zámky');
  const data = ctx.prod ? t.data : [...t.data, [t.md, t.mdPh]];
  const body = `
<section class="eu-chero">
  <div class="wrap eu-chero-in rv-in">
    <nav class="crumbs eu-crumbs-dark" aria-label="Breadcrumb"><a href="${esc(ctx.url('home'))}">${esc(t.home)}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(t.crumb)}</span></nav>
    <h1 class="eu-h1 eu-h1-60">${esc(t.h1)}</h1>
    <p class="eu-hero-sub">${esc(t.sub)}</p>
  </div>
</section>
<div class="wrap eu-cgrid">
  <div class="eu-cform" id="form">${enquiryForm(ctx, { variant: 'full', id: 'c' })}</div>
  <aside class="eu-caside">
    <div class="eu-person">
      <div class="eu-person-h"><span class="eu-avatar">${mark({ w: 30 })}</span><div><strong>${esc(t.person)}</strong><span>${esc(t.role)}</span></div></div>
      <a class="btn btn-dark btn-block" href="${tel(PHONE)}">${phoneIco}${esc(PHONE)}</a>
      <a class="btn btn-ghost btn-block" href="mailto:${MAIL}">${esc(MAIL)}</a>
      <span class="eu-person-note">${esc(t.hours)}</span>
    </div>
    <div class="eu-next">
      <span class="eu-kick">${esc(t.nextH)}</span>
      ${each(t.next, ([h, p], i) => `<div class="eu-next-i"><span>${i + 1}</span><div><strong>${esc(h)}</strong>${esc(p)}</div></div>`)}
    </div>
  </aside>
</div>
<section class="wrap eu-cinfo sec-last">
  <div class="eu-map rv">
    <a class="eu-map-art" href="${esc(maps)}" target="_blank" rel="noopener" aria-label="${esc(t.route)}">
      <span class="eu-map-grid" aria-hidden="true"></span>
      <span class="eu-map-pin" aria-hidden="true">${mark({ w: 30, light: true })}</span>
      <span class="eu-map-link">${esc(t.route)} ↗</span>
    </a>
    <div class="eu-map-txt"><strong>${esc(t.seat)}</strong><span>${esc(t.addr)}</span></div>
  </div>
  <div class="eu-firm rv">
    <span class="eu-kick">${esc(t.dataH)}</span>
    <dl>${each(data, ([k, v]) => `<dt>${esc(k)}</dt><dd${v.startsWith('[') ? ' class="eu-ph"' : ''}>${esc(v)}</dd>`)}</dl>
    <a class="link-u" href="${esc(ctx.url('imprint'))}">${esc(t.imprint)}</a>
  </div>
</section>`;
  return { title: t.title, description: t.desc, body, nav: 'contact', css: ['css/eu-pages.css'] };
}

module.exports = render;
module.exports.enquiryForm = enquiryForm;
module.exports.SHORT = SHORT;
module.exports.phoneIco = phoneIco;

// Texty stránky — správa webov v appke ich môže prepísať (web/content.js).
module.exports.T = T;
