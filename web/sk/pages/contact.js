// ============================================================================
// punds.sk — Kontakt (návrh 2g)
// ============================================================================
// Súbor exportuje aj kontaktný formulár a pár drobností, ktoré používajú
// ďalšie stránky (home, about): contactForm(), F (texty formulára), ghost(),
// office(), MAPS.
// Mapa: namiesto vloženej Google mapy je statická plocha a odkaz
// „Otvoriť v mapách" (bez cudzích vložených služieb bez súhlasu).
// ============================================================================
'use strict';

const { esc, each } = require('../../shared/h');
const PROF = require('../../shared/professions');
const { PHONE, PHONE2, MAIL, tel } = require('../common');

const ADDR = 'Podzámska 9468/4A, 940 71 Nové Zámky';
const MAPS = 'https://maps.google.com/?q=Podz%C3%A1mska+9468/4A,+940+71+Nov%C3%A9+Z%C3%A1mky';
const ROUTE = 'https://www.google.com/maps/dir/?api=1&destination=Podz%C3%A1mska+9468%2F4A+Nov%C3%A9+Z%C3%A1mky';
const WA = `https://wa.me/${PHONE.replace(/\D/g, '')}`;
const COMPANY = { name: 'Partner und Service s. r. o.', ico: '57553921', dic: '2122816839', icdph: 'SK2122816839' };

/** Texty kontaktného formulára (home, kontakt). */
const F = {
  sk: { name: 'Meno a priezvisko', phone: 'Telefón', email: 'E-mail', prof: 'Profesia', msg: 'Správa', req: 'povinné',
    consent: ['Súhlasím so ', 'spracovaním osobných údajov', ''], send: 'Odoslať', sendMsg: 'Odoslať správu',
    topic: 'Píšem kvôli', topics: ['Hľadám prácu', 'Otázka k ponuke', 'Dokumenty / živnosť', 'Iné'],
    okH: 'Ďakujeme!', okP: 'Správu sme dostali. Ozveme sa Vám do 24 hodín v pracovné dni.', okCall: 'Ak sa ponáhľate, zavolajte nám' },
  cz: { name: 'Jméno a příjmení', phone: 'Telefon', email: 'E-mail', prof: 'Profese', msg: 'Zpráva', req: 'povinné',
    consent: ['Souhlasím se ', 'zpracováním osobních údajů', ''], send: 'Odeslat', sendMsg: 'Odeslat zprávu',
    topic: 'Píšu kvůli', topics: ['Hledám práci', 'Dotaz k nabídce', 'Dokumenty / živnost', 'Jiné'],
    okH: 'Děkujeme!', okP: 'Zprávu jsme dostali. Ozveme se Vám do 24 hodin v pracovní dny.', okCall: 'Pokud spěcháte, zavolejte nám' },
  hu: { name: 'Teljes név', phone: 'Telefon', email: 'E-mail', prof: 'Szakma', msg: 'Üzenet', req: 'kötelező',
    consent: ['Hozzájárulok ', 'személyes adataim kezeléséhez', ''], send: 'Küldés', sendMsg: 'Üzenet küldése',
    topic: 'Miért ír nekünk?', topics: ['Munkát keresek', 'Kérdés egy állásról', 'Iratok / vállalkozás', 'Egyéb'],
    okH: 'Köszönjük!', okP: 'Üzenetét megkaptuk. Munkanapokon 24 órán belül jelentkezünk.', okCall: 'Ha sürgős, hívjon minket' },
  de: { name: 'Vor- und Nachname', phone: 'Telefon', email: 'E-Mail', prof: 'Beruf', msg: 'Nachricht', req: 'Pflichtfeld',
    consent: ['Ich stimme der ', 'Verarbeitung meiner Daten', ' zu'], send: 'Absenden', sendMsg: 'Nachricht senden',
    topic: 'Mein Anliegen', topics: ['Ich suche Arbeit', 'Frage zu einem Job', 'Dokumente / Gewerbe', 'Sonstiges'],
    okH: 'Vielen Dank!', okP: 'Wir haben Ihre Nachricht erhalten und melden uns an Werktagen innerhalb von 24 Stunden.', okCall: 'Wenn es eilt, rufen Sie uns an' },
  en: { name: 'Full name', phone: 'Phone', email: 'Email', prof: 'Trade', msg: 'Message', req: 'required',
    consent: ['I agree to the ', 'processing of my personal data', ''], send: 'Send', sendMsg: 'Send message',
    topic: 'I’m writing about', topics: ['Looking for work', 'Question about a job', 'Documents / self-employment', 'Something else'],
    okH: 'Thank you!', okP: 'We’ve received your message and will get back to you within 24 hours on working days.', okCall: 'In a hurry? Give us a call' },
};
const TOPIC_KEYS = ['work', 'job', 'docs', 'other'];

/** Znak „∩∪" v jednej farbe (dekorácia v pozadí). */
const ghost = (w, color = '#fff') => `<svg class="ghost-mark" width="${w}" height="${Math.round(w * 33.5 / 43.5)}" viewBox="2.25 7.25 43.5 33.5" fill="none" aria-hidden="true">`
  + `<path d="M6 34 V20 A9 9 0 0 1 24 20 V28" stroke="${color}" stroke-width="7.5" stroke-linecap="round"/><path d="M24 28 A9 9 0 0 0 42 28 V14" stroke="${color}" stroke-width="7.5" stroke-linecap="round"/></svg>`;

const ICO = {
  phone: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 3.5h3.2l1.6 4.2-2 1.3a11 11 0 0 0 5.2 5.2l1.3-2 4.2 1.6V17a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 3 5.7 2 2 0 0 1 5 3.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  wa: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20l1.2-3.6A8 8 0 1 1 8 19.1L4 20Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 9.2c.3 2.3 2.3 4.4 4.7 4.8l1-1.2 1.6.8c-.2 1-1 1.6-2 1.6-3.2 0-6.2-3-6.2-6.2 0-1 .6-1.8 1.6-2l.8 1.6L9 9.2Z" fill="currentColor"/></svg>',
  mail: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="m4 7 8 6 8-6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  pin: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 14.5s5-4.6 5-8.3a5 5 0 1 0-10 0c0 3.7 5 8.3 5 8.3Z" stroke="currentColor" stroke-width="1.8"/><circle cx="8" cy="6.2" r="1.8" fill="currentColor"/></svg>',
};

/**
 * Kontaktný formulár (data-form="contact").
 * @param {Object} o { title, sub, email: bool, topic: bool, send }
 */
function contactForm(ctx, o = {}) {
  const f = F[ctx.lang];
  const id = (k) => `cf-${k}`;
  const field = (k, input) => `<div class="fld"><label class="sr" for="${id(k)}">${esc(f[k])}</label>${input}</div>`;
  const profOpts = each(PROF.PROFESSIONS, (p) => `<option value="${esc(PROF.nameOf(p, 'sk', p.key !== 'ine'))}">${esc(PROF.nameOf(p, ctx.lang, p.key !== 'ine'))}</option>`);
  return `<form class="form sp-form" data-form="contact" id="form" aria-label="${esc(o.title || f.send)}">
    ${o.title ? `<h2 class="sp-form-h">${esc(o.title)}</h2>` : ''}${o.sub ? `<p class="sp-form-sub">${esc(o.sub)}</p>` : ''}
    <div class="row2">
      ${field('name', `<input id="${id('name')}" name="name" required autocomplete="name" placeholder="${esc(f.name)} *">`)}
      ${field('phone', `<input id="${id('phone')}" name="phone" type="tel" required autocomplete="tel" inputmode="tel" placeholder="${esc(f.phone)} *">`)}
    </div>
    ${o.email ? field('email', `<input id="${id('email')}" name="email" type="email" autocomplete="email" placeholder="${esc(f.email)}">`) : ''}
    ${field('prof', `<select id="${id('prof')}" name="profession" class="sp-select"><option value="">${esc(f.prof)}</option>${profOpts}</select>`)}
    ${o.topic ? `<fieldset class="sp-topics"><legend>${esc(f.topic)}</legend><div class="sp-topic-list">${each(f.topics, (t, i) => `<label class="sp-topic"><input type="radio" name="topic" value="${TOPIC_KEYS[i]}"${i === 0 ? ' checked' : ''}><span>${esc(t)}</span></label>`)}</div></fieldset>` : ''}
    ${field('msg', `<textarea id="${id('msg')}" name="message" rows="${o.topic ? 4 : 3}" placeholder="${esc(f.msg)}"></textarea>`)}
    <label class="check"><input type="checkbox" name="consent" required><span>${esc(f.consent[0])}<a href="${esc(ctx.url('privacy'))}">${esc(f.consent[1])}</a>${esc(f.consent[2])} *</span></label>
    <div class="hp" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>
    <div class="form-msg" role="alert"></div>
    <button type="submit" class="btn btn-primary btn-block sp-send">${esc(o.send || f.send)} →</button>
    <template data-ok><div class="ok-ico">✓</div><h3>${esc(f.okH)}</h3><p>${esc(f.okP)}</p><p>${esc(f.okCall)}: <a class="sp-ok-tel" href="${tel(PHONE)}">${PHONE}</a></p></template>
  </form>`;
}

/** Statická „mapa" kancelárie s odkazom do máp. */
function mapBox(t, cls = '') {
  return `<div class="sp-map ${cls}">
    <div class="sp-map-grid" aria-hidden="true"></div>
    <span class="sp-map-pin" aria-hidden="true">${ICO.pin}</span>
    <a class="btn btn-dark btn-sm sp-map-btn" href="${MAPS}" target="_blank" rel="noopener">${ICO.pin}${esc(t.openMap)}</a>
  </div>`;
}

const T = {
  sk: {
    title: 'Kontakt – telefón, WhatsApp, e-mail | punds', desc: 'Zavolajte, napíšte na WhatsApp alebo pošlite správu. Kancelária Nové Zámky, Po–Pia 8:00–16:00. Hovoríme po slovensky, česky, maďarsky aj nemecky.',
    home: 'Domov', crumb: 'Kontakt',
    h1: 'Sme tu pre Vás', lead: 'Najrýchlejšie nás zastihnete telefonicky alebo na WhatsApp. Hovoríme po slovensky, česky, maďarsky aj nemecky.',
    phone: 'Telefón', or: 'alebo', wa: 'WhatsApp', waH: 'Napíšte nám', waP: 'Pošlite správu kedykoľvek', mail: 'E-mail', mailP: 'Odpoveď do 24 hodín',
    fH: 'Napíšte nám', fSub: 'Vyplňte, čo viete. Zvyšok doladíme po telefóne.',
    office: 'Kancelária Nové Zámky', route: 'Trasa', openMap: 'Otvoriť v mapách',
    hoursH: 'Otváracie hodiny', days: [['Po – Pia', '8:00 – 16:00'], ['Sobota', 'na telefóne'], ['Nedeľa', 'zatvorené']],
    company: 'Firemné údaje', ico: 'IČO', dic: 'DIČ', icdph: 'IČ DPH',
    b2bH: 'Ste firma v Nemecku a hľadáte ľudí?', b2bP: 'Pre firmy máme samostatný web v nemčine a angličtine.', b2bCta: 'Prejsť na punds.eu',
  },
  cz: {
    title: 'Kontakt – telefon, WhatsApp, e-mail | punds', desc: 'Zavolejte, napište na WhatsApp nebo pošlete zprávu. Kancelář Nové Zámky, Po–Pá 8:00–16:00. Mluvíme slovensky, česky, maďarsky i německy.',
    home: 'Domů', crumb: 'Kontakt',
    h1: 'Jsme tu pro Vás', lead: 'Nejrychleji nás zastihnete telefonicky nebo na WhatsApp. Mluvíme slovensky, česky, maďarsky i německy.',
    phone: 'Telefon', or: 'nebo', wa: 'WhatsApp', waH: 'Napište nám', waP: 'Pošlete zprávu kdykoli', mail: 'E-mail', mailP: 'Odpověď do 24 hodin',
    fH: 'Napište nám', fSub: 'Vyplňte, co víte. Zbytek doladíme po telefonu.',
    office: 'Kancelář Nové Zámky', route: 'Trasa', openMap: 'Otevřít v mapách',
    hoursH: 'Otevírací doba', days: [['Po – Pá', '8:00 – 16:00'], ['Sobota', 'na telefonu'], ['Neděle', 'zavřeno']],
    company: 'Firemní údaje', ico: 'IČO', dic: 'DIČ', icdph: 'IČ DPH',
    b2bH: 'Jste firma v Německu a hledáte lidi?', b2bP: 'Pro firmy máme samostatný web v němčině a angličtině.', b2bCta: 'Přejít na punds.eu',
  },
  hu: {
    title: 'Kapcsolat – telefon, WhatsApp, e-mail | punds', desc: 'Hívjon, írjon WhatsAppon vagy küldjön üzenetet. Iroda: Érsekújvár (Nové Zámky), H–P 8:00–16:00. Beszélünk szlovákul, csehül, magyarul és németül.',
    home: 'Kezdőlap', crumb: 'Kapcsolat',
    h1: 'Itt vagyunk Önért', lead: 'Telefonon vagy WhatsAppon ér el minket a leggyorsabban. Beszélünk szlovákul, csehül, magyarul és németül.',
    phone: 'Telefon', or: 'vagy', wa: 'WhatsApp', waH: 'Írjon nekünk', waP: 'Üzenjen bármikor', mail: 'E-mail', mailP: 'Válasz 24 órán belül',
    fH: 'Írjon nekünk', fSub: 'Töltse ki, amit tud. A többit telefonon pontosítjuk.',
    office: 'Iroda, Érsekújvár (Nové Zámky)', route: 'Útvonal', openMap: 'Megnyitás térképen',
    hoursH: 'Nyitvatartás', days: [['H – P', '8:00 – 16:00'], ['Szombat', 'telefonon'], ['Vasárnap', 'zárva']],
    company: 'Cégadatok', ico: 'Cégazonosító (IČO)', dic: 'Adószám (DIČ)', icdph: 'Közösségi adószám',
    b2bH: 'Németországi cég, és munkaerőt keres?', b2bP: 'A cégeknek külön weboldalunk van német és angol nyelven.', b2bCta: 'Tovább a punds.eu oldalra',
  },
  de: {
    title: 'Kontakt – Telefon, WhatsApp, E-Mail | punds', desc: 'Rufen Sie an, schreiben Sie per WhatsApp oder senden Sie eine Nachricht. Büro Nové Zámky, Mo–Fr 8:00–16:00. Wir sprechen Slowakisch, Tschechisch, Ungarisch und Deutsch.',
    home: 'Start', crumb: 'Kontakt',
    h1: 'Wir sind für Sie da', lead: 'Am schnellsten erreichen Sie uns telefonisch oder per WhatsApp. Wir sprechen Slowakisch, Tschechisch, Ungarisch und Deutsch.',
    phone: 'Telefon', or: 'oder', wa: 'WhatsApp', waH: 'Schreiben Sie uns', waP: 'Nachricht jederzeit möglich', mail: 'E-Mail', mailP: 'Antwort innerhalb von 24 Stunden',
    fH: 'Schreiben Sie uns', fSub: 'Füllen Sie aus, was Sie wissen. Den Rest klären wir am Telefon.',
    office: 'Büro Nové Zámky', route: 'Route', openMap: 'In Karten öffnen',
    hoursH: 'Öffnungszeiten', days: [['Mo – Fr', '8:00 – 16:00'], ['Samstag', 'telefonisch'], ['Sonntag', 'geschlossen']],
    company: 'Firmendaten', ico: 'IČO (Firmennummer)', dic: 'DIČ (Steuernummer)', icdph: 'USt-IdNr.',
    b2bH: 'Sie sind eine Firma in Deutschland und suchen Fachkräfte?', b2bP: 'Für Unternehmen haben wir eine eigene Website auf Deutsch und Englisch.', b2bCta: 'Zu punds.eu',
  },
  en: {
    title: 'Contact – phone, WhatsApp, email | punds', desc: 'Call us, message us on WhatsApp or send an enquiry. Office in Nové Zámky, Mon–Fri 8:00–16:00. We speak Slovak, Czech, Hungarian and German.',
    home: 'Home', crumb: 'Contact',
    h1: 'We’re here for you', lead: 'The quickest way to reach us is by phone or WhatsApp. We speak Slovak, Czech, Hungarian and German.',
    phone: 'Phone', or: 'or', wa: 'WhatsApp', waH: 'Message us', waP: 'Send a message any time', mail: 'Email', mailP: 'Reply within 24 hours',
    fH: 'Write to us', fSub: 'Fill in what you know. We’ll sort out the rest by phone.',
    office: 'Office in Nové Zámky', route: 'Directions', openMap: 'Open in Maps',
    hoursH: 'Opening hours', days: [['Mon – Fri', '8:00 – 16:00'], ['Saturday', 'by phone'], ['Sunday', 'closed']],
    company: 'Company details', ico: 'Company ID (IČO)', dic: 'Tax ID (DIČ)', icdph: 'VAT ID',
    b2bH: 'A company in Germany looking for tradespeople?', b2bP: 'We have a separate website for companies, in German and English.', b2bCta: 'Go to punds.eu',
  },
};

/** Odkaz na punds.eu (rovnako ako päta webu). */
const euUrl = (ctx) => (ctx.prod ? `https://punds.eu/${ctx.lang === 'en' ? 'en' : 'de'}/` : `/punds-eu/${ctx.lang === 'en' ? 'en' : 'de'}/`);

async function render(ctx) {
  const t = T[ctx.lang];
  const body = `
<div class="wrap sp-head">
  <nav class="crumbs" aria-label="breadcrumb"><a href="${esc(ctx.url('home'))}">${esc(t.home)}</a><span aria-hidden="true">/</span><span class="cur" aria-current="page">${esc(t.crumb)}</span></nav>
  <div class="sp-head-in rv-in"><h1 class="sp-h1">${esc(t.h1)}</h1><p class="lead sp-lead">${esc(t.lead)}</p></div>
</div>
<section class="wrap ct-cards">
  <a class="ct-card ct-card-phone lift rv" href="${tel(PHONE)}"><span class="ct-ico">${ICO.phone}</span><span class="ct-k">${esc(t.phone)}</span><strong class="ct-v">${PHONE}</strong><span class="ct-s">${esc(t.or)} ${PHONE2}</span></a>
  <a class="ct-card ct-card-wa lift rv" href="${WA}" target="_blank" rel="noopener"><span class="ct-ico">${ICO.wa}</span><span class="ct-k">${esc(t.wa)}</span><strong class="ct-v">${esc(t.waH)}</strong><span class="ct-s">${esc(t.waP)}</span></a>
  <a class="ct-card ct-card-mail lift rv" href="mailto:${MAIL}"><span class="ct-ico">${ICO.mail}</span><span class="ct-k">${esc(t.mail)}</span><strong class="ct-v">${MAIL}</strong><span class="ct-s">${esc(t.mailP)}</span></a>
</section>
<section class="wrap ct-main">
  <div class="card sp-formcard rv">${contactForm(ctx, { title: t.fH, sub: t.fSub, email: true, topic: true, send: F[ctx.lang].sendMsg })}</div>
  <div class="ct-side">
    <div class="ct-office rv">
      ${mapBox(t)}
      <div class="ct-office-in"><div><strong>${esc(t.office)}</strong><span>${esc(ADDR)}</span></div><a class="ct-route" href="${ROUTE}" target="_blank" rel="noopener">${esc(t.route)} →</a></div>
    </div>
    <div class="ct-info rv">
      <div class="ct-hours"><span class="eyebrow">${esc(t.hoursH)}</span>${each(t.days, ([d, h]) => `<div class="ct-row"><span>${esc(d)}</span><strong>${esc(h)}</strong></div>`)}</div>
      <div class="ct-co"><span class="eyebrow">${esc(t.company)}</span><strong>${COMPANY.name}</strong><span>${esc(t.ico)} ${COMPANY.ico}</span><span>${esc(t.dic)} ${COMPANY.dic}</span><span>${esc(t.icdph)} ${COMPANY.icdph}</span></div>
    </div>
  </div>
</section>
<section class="wrap sec-last ct-b2b-wrap">
  <div class="ct-b2b rv"><div><strong>${esc(t.b2bH)}</strong><span>${esc(t.b2bP)}</span></div><a class="btn btn-dark" href="${esc(euUrl(ctx))}">${esc(t.b2bCta)} →</a></div>
</section>`;
  return { title: t.title, description: t.desc, body, css: ['css/sk-pages.css'], bodyClass: 'pg-contact' };
}

module.exports = render;
module.exports.contactForm = contactForm;
module.exports.F = F;
module.exports.ghost = ghost;
module.exports.mapBox = mapBox;
module.exports.euUrl = euUrl;
module.exports.ICO = ICO;
module.exports.ADDR = ADDR;
module.exports.WA = WA;
module.exports.MAPS = MAPS;
module.exports.COMPANY = COMPANY;
