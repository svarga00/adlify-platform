// ============================================================================
// punds.eu — Impressum (návrh 3c) · povinné podľa § 5 DDG
// ============================================================================
// Meno konateľa zatiaľ nepoznáme: kým je MD prázdne (ani v appke), ukáže sa
// „[Name folgt]" — aj naostro, nech je vidieť, že údaj chýba. Doplniť MD nižšie
// alebo v appke (Marketing → Weby → Kontakty a firma).
// ============================================================================
'use strict';

const { esc, each } = require('../../shared/h');
const { icon } = require('../../shared/icons');
const { PHONE, MAIL, tel } = require('../common');

/** Geschäftsführer — doplniť, keď ho klient potvrdí. */
const MD = '';

const T = {
  de: {
    title: 'Impressum | punds', desc: 'Impressum von punds.eu – Partner und Service s. r. o., Nové Zámky, Slowakei. Angaben gemäß § 5 DDG.',
    home: 'Startseite', h1: 'Impressum', sub: 'Angaben gemäß § 5 DDG',
    warn: 'Entwurf: Felder in eckigen Klammern vor Veröffentlichung ergänzen und den Text rechtlich prüfen lassen.',
    ph: '[Name folgt]',
    provider: 'Anbieter', contact: 'Kontakt', rep: 'Vertretung', register: 'Register', tax: 'Steuern', resp: 'Verantwortlich für den Inhalt',
    country: 'Slowakische Republik', phone: 'Telefon', mail: 'E-Mail', web: 'Web',
    md: 'Vertreten durch den Geschäftsführer', reg: 'Handelsregister: Obchodný register Okresného súdu Nitra', regNo: 'Abteilung: Sro, Einlage-Nr.: 69265/N', ico: 'IČO (Reg.-Nr.): 57553921',
    vat: 'USt-IdNr.: SK2122816839', stnr: 'Steuernummer (DE): 214/633/08265',
    respP: 'nach § 18 Abs. 2 MStV', respA: 'Anschrift wie oben',
    privK: 'Datenschutz', privH: 'Datenschutzerklärung', privP: 'Wie wir mit Ihren Daten umgehen – insbesondere bei Anfragen über das Formular –, lesen Sie in unserer Datenschutzerklärung.', privL: 'Zur Datenschutzerklärung',
    secs: [
      ['Streitbeilegung', ['Unser Angebot richtet sich ausschließlich an Unternehmen. Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.']],
      ['Haftung für Inhalte', ['Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich (§ 7 Abs. 1 DDG). Nach §§ 8 bis 10 DDG sind wir jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.',
        'Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden entsprechender Rechtsverletzungen entfernen wir diese Inhalte umgehend.']],
      ['Haftung für Links', ['Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber verantwortlich. Die verlinkten Seiten wurden zum Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße überprüft; rechtswidrige Inhalte waren nicht erkennbar.',
        'Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen entfernen wir derartige Links umgehend.']],
      ['Urheberrecht', ['Die durch uns erstellten Inhalte und Werke auf diesen Seiten unterliegen dem Urheberrecht. Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechts bedürfen unserer schriftlichen Zustimmung.',
        'Soweit Inhalte auf dieser Seite nicht von uns erstellt wurden, werden die Urheberrechte Dritter beachtet. Sollten Sie trotzdem auf eine Urheberrechtsverletzung aufmerksam werden, bitten wir um einen Hinweis; wir entfernen derartige Inhalte dann umgehend.']],
    ],
  },
  en: {
    title: 'Imprint | punds', desc: 'Imprint (legal notice) of punds.eu – Partner und Service s. r. o., Nové Zámky, Slovakia. Information pursuant to § 5 DDG.',
    home: 'Home', h1: 'Imprint', sub: 'Information pursuant to § 5 of the German Digital Services Act (DDG)',
    warn: 'Draft: complete the fields in square brackets and have the text legally reviewed before publication.',
    ph: '[name to follow]',
    provider: 'Provider', contact: 'Contact', rep: 'Represented by', register: 'Register', tax: 'Tax', resp: 'Responsible for content',
    country: 'Slovak Republic', phone: 'Phone', mail: 'Email', web: 'Web',
    md: 'Managing director', reg: 'Commercial Register: Obchodný register Okresného súdu Nitra (District Court Nitra)', regNo: 'Section: Sro, file no.: 69265/N', ico: 'Company ID (IČO): 57553921',
    vat: 'VAT ID: SK2122816839', stnr: 'German tax number: 214/633/08265',
    respP: 'pursuant to § 18 (2) MStV', respA: 'Address as above',
    privK: 'Privacy', privH: 'Privacy policy', privP: 'How we handle your data – in particular for enquiries sent via the form – is explained in our privacy policy.', privL: 'Read the privacy policy',
    secs: [
      ['Dispute resolution', ['Our services are aimed exclusively at businesses. We are neither willing nor obliged to take part in dispute resolution proceedings before a consumer arbitration board.']],
      ['Liability for content', ['As a service provider we are responsible for our own content on these pages under general law (§ 7 (1) DDG). Under §§ 8 to 10 DDG, however, we are not obliged to monitor third-party information transmitted or stored, or to investigate circumstances indicating illegal activity.',
        'Obligations to remove or block the use of information under general law remain unaffected. Liability in this respect is only possible from the time we become aware of a specific infringement. As soon as we become aware of such infringements, we will remove the content immediately.']],
      ['Liability for links', ['Our website contains links to external third-party websites over whose content we have no control. The respective provider or operator is always responsible for the content of linked pages. The linked pages were checked for possible legal violations at the time of linking; no illegal content was apparent.',
        'Permanent monitoring of linked pages is not reasonable without concrete indications of an infringement. If we become aware of any infringements, we will remove such links immediately.']],
      ['Copyright', ['The content and works created by us on these pages are subject to copyright. Reproduction, editing, distribution and any kind of use beyond the limits of copyright law require our written consent.',
        'Where content on this site was not created by us, the copyrights of third parties are respected. Should you nevertheless become aware of a copyright infringement, please let us know and we will remove such content immediately.']],
    ],
  },
};

async function render(ctx) {
  const t = T[ctx.lang];
  const ph = `<mark class="eu-mark">${esc(t.ph)}</mark>`;
  // Konateľ: z appky (Marketing → Weby → Kontakty a firma), inak MD nižšie.
  const md = (ctx.content && ctx.content.company && ctx.content.company.md) || MD;
  // § 5 DDG vyžaduje zástupcu firmy — bez mena sa karta neschová (Impressum by
  // bolo potichu neúplné), ale ukáže jasný zástupný text aj naostro.
  const who = md ? esc(md) : ph;
  const cards = [
    [t.provider, ['<b>Partner und Service s. r. o.</b>', 'Podzámska 9468/4A', '940 71 Nové Zámky', esc(t.country)]],
    [t.contact, [`<b>${esc(t.phone)}: <a href="${tel(PHONE)}">${esc(PHONE)}</a></b>`, `${esc(t.mail)}: <a href="mailto:${MAIL}">${MAIL}</a>`, `${esc(t.web)}: punds.eu`]],
    who && [t.rep, [`<b>${esc(t.md)}: ${who}</b>`]],
    [t.register, [`<b>${esc(t.reg)}</b>`, esc(t.regNo), esc(t.ico)]],
    [t.tax, [`<b>${esc(t.vat)}</b>`, esc(t.stnr)]],
    who && [`${t.resp}`, [`<b>${who}</b>`, esc(t.respA), `<small>${esc(t.respP)}</small>`]],
  ].filter(Boolean);

  const body = `
<section class="wrap eu-legal-top">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${esc(ctx.url('home'))}">${esc(t.home)}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(t.h1)}</span></nav>
  <h1 class="eu-h1-52">${esc(t.h1)}</h1>
  <span class="eu-legal-sub">${esc(t.sub)}</span>
  ${ctx.prod ? '' : `<p class="warn eu-warn">${icon('alert')}<span>${esc(t.warn)}</span></p>`}
</section>
<section class="wrap eu-imp">${each(cards, ([h, lines]) => `<div class="eu-imp-c"><span class="eyebrow">${esc(h)}</span>${each(lines, (l) => `<span>${l}</span>`)}</div>`)}</section>
<section class="wrap eu-imp-priv">
  <div><span class="eu-kick">${esc(t.privK)}</span><h2 class="h2 eu-h2-40">${esc(t.privH)}</h2><p class="eu-p">${esc(t.privP)}</p></div>
  <a class="btn btn-dark" href="${esc(ctx.url('privacy'))}">${esc(t.privL)} →</a>
</section>
<section class="wrap eu-imp-secs sec-last">${each(t.secs, ([h, ps]) => `<div class="eu-imp-s"><h2 class="h3">${esc(h)}</h2>${each(ps, (p) => `<p>${esc(p)}</p>`)}</div>`)}</section>`;
  return { title: t.title, description: t.desc, body, nav: 'imprint', css: ['css/eu-pages.css'] };
}

module.exports = render;

// Texty stránky — správa webov v appke ich môže prepísať (web/content.js).
module.exports.T = T;
