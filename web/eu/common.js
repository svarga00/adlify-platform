// ============================================================================
// punds.eu — spoločné texty, hlavička a päta (pre nemecké firmy)
// ============================================================================
'use strict';

const { esc, each } = require('../shared/h');
const { logo } = require('../shared/brand');
const PROF = require('../shared/professions');
const { langMenu, chev, flag } = require('../sk/common');
const { LANGS } = require('../shared/sites');

const PHONE = '+421 910 523 958', MAIL = 'info@punds.eu';
const tel = (p) => `tel:${p.replace(/\s+/g, '')}`;

const T = {
  de: {
    skip: 'Zum Inhalt springen', menu: 'Menü', close: 'Schließen', lang: 'Sprache',
    nav: { trades: 'Gewerke', models: 'Zusammenarbeit', process: 'Ablauf', about: 'Über uns', contact: 'Kontakt' },
    cta: 'Anfrage senden', call: 'Anrufen',
    mega: { trades: 'Gewerke', models: 'Zusammenarbeit', cta: 'Fachkräfte anfragen' },
    models: [['Werkvertrag', 'Selbstständige Handwerker und Teams als Subunternehmer – Abrechnung nach Leistung oder Stunde.'],
      ['Arbeitnehmerüberlassung', 'Fachkräfte zur Verstärkung Ihres Teams, eingesetzt unter Ihrer Bauleitung.']],
    aueg: 'Arbeitnehmerüberlassung nur mit gültiger Erlaubnis nach AÜG – wir klären das vor Projektbeginn mit Ihnen.',
    foot: { imprint: 'Impressum', privacy: 'Datenschutz', jobs: 'Sie suchen Arbeit?' },
    js: { sending: 'Wird gesendet…', error: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut oder rufen Sie uns an.', required: 'Bitte füllen Sie dieses Feld aus.', consent: 'Bitte stimmen Sie der Datenverarbeitung zu.', phone: 'Bitte prüfen Sie die Telefonnummer.', email: 'Bitte prüfen Sie die E-Mail-Adresse.', copied: 'Kopiert ✓' },
  },
  en: {
    skip: 'Skip to content', menu: 'Menu', close: 'Close', lang: 'Language',
    nav: { trades: 'Trades', models: 'Ways to work', process: 'Process', about: 'About us', contact: 'Contact' },
    cta: 'Send enquiry', call: 'Call us',
    mega: { trades: 'Trades', models: 'Ways to work together', cta: 'Request tradespeople' },
    models: [['Subcontracting', 'Self-employed tradespeople and crews as subcontractors (Werkvertrag) – billed per job or per hour.'],
      ['Temporary staffing', 'Skilled workers to reinforce your team (Arbeitnehmerüberlassung), working under your site management.']],
    aueg: 'Temporary staffing only with a valid licence under the German AÜG – we clarify this with you before the project starts.',
    foot: { imprint: 'Imprint', privacy: 'Privacy policy', jobs: 'Looking for work?' },
    js: { sending: 'Sending…', error: 'Something went wrong. Please try again or give us a call.', required: 'Please fill in this field.', consent: 'Please agree to the processing of your data.', phone: 'Please check the phone number.', email: 'Please check the email address.', copied: 'Copied ✓' },
  },
};

async function header(ctx, page) {
  const t = T[ctx.lang];
  const home = ctx.url('home');
  const active = page.nav || ctx.route;
  const trades = PROF.euTrades();
  return `<header class="hdr hdr-eu" data-header>
  <div class="hdr-in">
    ${logo({ href: home, light: true })}
    <nav class="nav" aria-label="Menu">
      <button type="button" class="nav-a nav-mega${active === 'trade' ? ' on' : ''}" data-mega-btn aria-expanded="false" aria-controls="mega">${esc(t.nav.trades)}${chev}</button>
      <a class="nav-a" href="${esc(home)}#modelle">${esc(t.nav.models)}</a>
      <a class="nav-a" href="${esc(home)}#ablauf">${esc(t.nav.process)}</a>
      <a class="nav-a${active === 'about' ? ' on' : ''}" href="${esc(ctx.url('about'))}">${esc(t.nav.about)}</a>
      <a class="nav-a${active === 'contact' ? ' on' : ''}" href="${esc(ctx.url('contact'))}">${esc(t.nav.contact)}</a>
    </nav>
    ${langMenu(ctx, { dark: true })}
    <a class="btn btn-primary btn-hdr" href="${esc(ctx.url('contact'))}#form">${esc(t.cta)} →</a>
    <button type="button" class="burger" data-burger aria-label="${esc(t.menu)}" aria-expanded="false"><span></span><span></span><span></span></button>
  </div>
  <div class="mega" id="mega" data-mega hidden>
    <div class="mega-card mega-eu">
      <div class="mega-col"><span class="eyebrow">${esc(t.mega.trades)}</span>
        <div class="mega-list mega-2col">${each(trades, (p) => `<a href="${esc(ctx.url('trade', { slug: p.eu.slug[ctx.lang] }))}"><span>${esc(p.eu.name[ctx.lang])}</span><span class="arr" aria-hidden="true">→</span></a>`)}</div></div>
      <div class="mega-col"><span class="eyebrow">${esc(t.mega.models)}</span>
        ${each(t.models, ([h, p]) => `<a class="mega-model" href="${esc(home)}#modelle"><strong>${esc(h)}</strong><span>${esc(p)}</span></a>`)}
        <span class="mega-note">${esc(t.aueg)}</span>
        <a class="btn btn-primary btn-sm mega-cta" href="${esc(ctx.url('contact'))}#form">${esc(t.mega.cta)} →</a></div>
    </div>
  </div>
</header>
  <div class="mnav mnav-eu" data-mnav hidden>
    <div class="mnav-in">
      <details class="mnav-acc" open><summary>${esc(t.nav.trades)}${chev}</summary>
        <div class="chips">${each(trades, (p) => `<a class="chip" href="${esc(ctx.url('trade', { slug: p.eu.slug[ctx.lang] }))}">${esc(p.eu.name[ctx.lang])}</a>`)}</div>
      </details>
      <a class="mnav-a" href="${esc(home)}#modelle">${esc(t.nav.models)}</a>
      <a class="mnav-a" href="${esc(home)}#ablauf">${esc(t.nav.process)}</a>
      <a class="mnav-a" href="${esc(ctx.url('about'))}">${esc(t.nav.about)}</a>
      <a class="mnav-a" href="${esc(ctx.url('contact'))}">${esc(t.nav.contact)}</a>
      <div class="mnav-langs">${each(ctx.site.langs, (l) => `<a class="${l === ctx.lang ? 'on' : ''}" href="${esc(ctx.url(ctx.route, ctx.paramsIn(l), l) || ctx.url('home', {}, l))}">${flag(ctx, l)}${esc(LANGS[l].name)}</a>`)}</div>
      <div class="mnav-ctas"><a class="btn btn-primary" href="${esc(ctx.url('contact'))}#form">${esc(t.cta)} →</a><a class="btn btn-ghost" href="${tel(PHONE)}">${esc(t.call)} · ${PHONE}</a></div>
    </div>
  </div>
`;
}

function footer(ctx) {
  const t = T[ctx.lang];
  const sk = ctx.prod ? 'https://punds.sk/sk/' : '/punds-sk/sk/';
  return `<footer class="ftr">
  <div class="ftr-in">
    ${logo({ href: ctx.url('home'), light: true, draw: false })}
    <nav class="ftr-links"><a href="${esc(ctx.url('imprint'))}">${esc(t.foot.imprint)}</a><a href="${esc(ctx.url('privacy'))}">${esc(t.foot.privacy)}</a></nav>
    <span class="ftr-copy">© ${new Date().getFullYear()} Partner und Service s. r. o. · Nové Zámky, SK</span>
    <a class="ftr-x" href="${esc(sk)}">${esc(t.foot.jobs)} → <span>punds.sk</span></a>
  </div>
</footer>`;
}

module.exports = { T, PHONE, MAIL, tel, header, footer };
