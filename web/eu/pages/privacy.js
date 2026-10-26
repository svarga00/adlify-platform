// ============================================================================
// punds.eu — Datenschutzerklärung / Privacy policy (DSGVO)
// ============================================================================
// Návrh textu pre web pre firmy (dopytový formulár, hosting Netlify, bez
// sledovacích cookies, písma u nás). Pred zverejnením právne preveriť.
// ============================================================================
'use strict';

const { esc, each } = require('../../shared/h');
const { PHONE, MAIL, tel } = require('../common');

const T = {
  de: {
    title: 'Datenschutzerklärung | punds', desc: 'Datenschutzerklärung von punds.eu: welche Daten wir bei Anfragen verarbeiten, auf welcher Rechtsgrundlage, wie lange und welche Rechte Sie haben.',
    home: 'Startseite', h1: 'Datenschutzerklärung', sub: 'Stand: Oktober 2026', toc: 'Inhalt',
    warn: 'Entwurf – vor Veröffentlichung rechtlich prüfen.',
    secs: [
      ['Verantwortlicher', [
        'Verantwortlich für die Datenverarbeitung auf dieser Website im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:',
        '<b>Partner und Service s. r. o.</b><br>Podzámska 9468/4A, 940 71 Nové Zámky, Slowakische Republik<br>IČO: 57553921 · USt-IdNr.: SK2122816839<br>E-Mail: {MAIL} · Telefon: {PHONE}',
        'Bei Fragen zum Datenschutz erreichen Sie uns unter den oben genannten Kontaktdaten.']],
      ['Überblick', [
        'Wir verarbeiten personenbezogene Daten nur, soweit dies für den Betrieb dieser Website und die Bearbeitung Ihrer Anfragen erforderlich ist. Wir setzen keine Analyse- oder Werbe-Tools ein, verwenden keine Tracking-Cookies und verkaufen keine Daten.']],
      ['Hosting und Server-Logfiles', [
        'Diese Website wird bei Netlify, Inc. (512 2nd Street, Suite 200, San Francisco, CA 94107, USA) gehostet. Beim Aufruf der Seiten werden technisch notwendige Daten verarbeitet: IP-Adresse, Datum und Uhrzeit des Abrufs, aufgerufene Adresse, Referrer-URL sowie Browser und Betriebssystem.',
        'Die Verarbeitung erfolgt auf Grundlage unseres berechtigten Interesses an einem sicheren und stabilen Betrieb der Website (Art. 6 Abs. 1 lit. f DSGVO). Die Logdaten werden nur so lange gespeichert, wie es für Betrieb und Sicherheit erforderlich ist.',
        'Mit Netlify besteht ein Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO). Soweit Daten in die USA übermittelt werden, erfolgt dies auf Grundlage des Angemessenheitsbeschlusses der EU-Kommission (EU-U.S. Data Privacy Framework), soweit der Anbieter zertifiziert ist, bzw. der EU-Standardvertragsklauseln.']],
      ['Anfrageformular, E-Mail und Telefon', [
        'Wenn Sie uns über das Anfrageformular, per E-Mail oder telefonisch kontaktieren, verarbeiten wir die von Ihnen angegebenen Daten: Firma, Ansprechpartner, E-Mail-Adresse, Telefonnummer (freiwillig), gewünschte Gewerke, Anzahl der Personen, Einsatzort, Starttermin, gewünschte Form der Zusammenarbeit und Ihre Nachricht. Zusätzlich speichern wir die Sprache und die Seite, von der die Anfrage gesendet wurde.',
        'Zweck ist die Bearbeitung Ihrer Anfrage, die Erstellung eines Angebots und gegebenenfalls die Durchführung des Vertrags. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (vorvertragliche Maßnahmen und Vertragserfüllung) sowie Art. 6 Abs. 1 lit. f DSGVO (unser berechtigtes Interesse an der effizienten Bearbeitung geschäftlicher Anfragen).',
        'Die Anfragen werden in unserem internen System gespeichert, das von einem Auftragsverarbeiter auf Grundlage eines Vertrags nach Art. 28 DSGVO betrieben wird. Ein Feld zum Schutz vor automatisierten Spam-Einsendungen ist für Menschen unsichtbar und wird nicht ausgewertet.']],
      ['Speicherdauer', [
        'Kommt kein Vertrag zustande, löschen wir Ihre Anfrage, sobald sie für den Zweck nicht mehr erforderlich ist, spätestens 24 Monate nach dem letzten Kontakt. Kommt ein Vertrag zustande, speichern wir die Daten für die Dauer der Geschäftsbeziehung und darüber hinaus, soweit gesetzliche Aufbewahrungspflichten (insbesondere handels- und steuerrechtliche) bestehen.']],
      ['Empfänger', [
        'Ihre Daten erhalten nur die Mitarbeitenden, die Ihre Anfrage bearbeiten, sowie unsere technischen Dienstleister (Hosting, IT-Betrieb) als Auftragsverarbeiter. Eine Weitergabe an sonstige Dritte erfolgt nur, wenn dies zur Vertragsdurchführung erforderlich ist oder wir gesetzlich dazu verpflichtet sind.']],
      ['Cookies, Schriften und externe Inhalte', [
        'Diese Website verwendet keine Tracking- oder Marketing-Cookies und keine Analyse-Tools. Schriftarten und Flaggen werden von unserem eigenen Server geladen; es findet keine Verbindung zu Google Fonts oder anderen Schriftanbietern statt.',
        'Projektfotos werden derzeit von unserem bisherigen Webauftritt unter punds.eu geladen. Der Link zu Google Maps auf der Kontaktseite öffnet Google erst, wenn Sie ihn anklicken; es ist keine Karte eingebettet.']],
      ['Ihre Rechte', [
        'Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) sowie das Recht, der Verarbeitung auf Grundlage berechtigter Interessen zu widersprechen (Art. 21 DSGVO). Eine erteilte Einwilligung können Sie jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO).',
        'Wenden Sie sich dazu einfach per E-Mail an {MAIL}.']],
      ['Beschwerderecht', [
        'Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren. Zuständig für uns ist: <b>Úrad na ochranu osobných údajov Slovenskej republiky</b>, Hraničná 12, 820 07 Bratislava 27, Slowakei, dataprotection.gov.sk. Sie können sich auch an die Aufsichtsbehörde Ihres Aufenthaltsorts, Arbeitsplatzes oder des Orts des mutmaßlichen Verstoßes wenden.']],
      ['Pflicht zur Bereitstellung, keine automatisierten Entscheidungen', [
        'Die Angabe Ihrer Daten ist freiwillig. Ohne die als Pflichtfelder gekennzeichneten Angaben können wir Ihre Anfrage jedoch nicht bearbeiten. Eine automatisierte Entscheidungsfindung einschließlich Profiling (Art. 22 DSGVO) findet nicht statt.']],
      ['Änderungen', [
        'Wir passen diese Datenschutzerklärung an, wenn sich die Website oder die rechtlichen Anforderungen ändern. Es gilt die jeweils hier veröffentlichte Fassung.']],
    ],
  },
  en: {
    title: 'Privacy policy | punds', desc: 'Privacy policy of punds.eu: what data we process for enquiries, on what legal basis, for how long, and what rights you have.',
    home: 'Home', h1: 'Privacy policy', sub: 'Last updated: October 2026', toc: 'Contents',
    warn: 'Draft – legal review required before publication.',
    secs: [
      ['Controller', [
        'The controller responsible for data processing on this website within the meaning of the General Data Protection Regulation (GDPR) is:',
        '<b>Partner und Service s. r. o.</b><br>Podzámska 9468/4A, 940 71 Nové Zámky, Slovak Republic<br>Company ID (IČO): 57553921 · VAT ID: SK2122816839<br>Email: {MAIL} · Phone: {PHONE}',
        'If you have any questions about data protection, please contact us using the details above.']],
      ['Overview', [
        'We process personal data only to the extent necessary to operate this website and handle your enquiries. We do not use analytics or advertising tools, do not use tracking cookies and do not sell any data.']],
      ['Hosting and server log files', [
        'This website is hosted by Netlify, Inc. (512 2nd Street, Suite 200, San Francisco, CA 94107, USA). When you visit the pages, technically necessary data is processed: IP address, date and time of access, requested address, referrer URL, browser and operating system.',
        'Processing is based on our legitimate interest in the secure and stable operation of the website (Art. 6(1)(f) GDPR). Log data is stored only for as long as necessary for operation and security.',
        'We have a data processing agreement with Netlify (Art. 28 GDPR). Where data is transferred to the USA, this is based on the European Commission’s adequacy decision (EU-U.S. Data Privacy Framework) where the provider is certified, or on the EU Standard Contractual Clauses.']],
      ['Enquiry form, email and phone', [
        'When you contact us via the enquiry form, by email or by phone, we process the data you provide: company, contact person, email address, phone number (optional), requested trades, number of people, site location, start date, preferred type of collaboration and your message. We also store the language and the page from which the enquiry was sent.',
        'The purpose is to handle your enquiry, prepare a proposal and, where applicable, perform the contract. The legal basis is Art. 6(1)(b) GDPR (pre-contractual measures and performance of a contract) and Art. 6(1)(f) GDPR (our legitimate interest in handling business enquiries efficiently).',
        'Enquiries are stored in our internal system, which is operated by a processor under a contract pursuant to Art. 28 GDPR. A field that protects against automated spam submissions is invisible to people and is not evaluated.']],
      ['Retention period', [
        'If no contract is concluded, we delete your enquiry as soon as it is no longer needed for its purpose, at the latest 24 months after the last contact. If a contract is concluded, we store the data for the duration of the business relationship and beyond where statutory retention obligations apply (in particular under commercial and tax law).']],
      ['Recipients', [
        'Your data is accessible only to the staff handling your enquiry and to our technical service providers (hosting, IT operations) acting as processors. It is passed on to other third parties only where necessary to perform the contract or where we are legally obliged to do so.']],
      ['Cookies, fonts and external content', [
        'This website does not use tracking or marketing cookies or analytics tools. Fonts and flags are loaded from our own server; there is no connection to Google Fonts or other font providers.',
        'Project photos are currently loaded from our previous website at punds.eu. The Google Maps link on the contact page only opens Google when you click it; no map is embedded.']],
      ['Your rights', [
        'You have the right of access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18), data portability (Art. 20) and the right to object to processing based on legitimate interests (Art. 21 GDPR). You may withdraw any consent given at any time with effect for the future (Art. 7(3) GDPR).',
        'To exercise these rights, simply email us at {MAIL}.']],
      ['Right to lodge a complaint', [
        'You have the right to lodge a complaint with a data protection supervisory authority. The authority responsible for us is the <b>Úrad na ochranu osobných údajov Slovenskej republiky</b> (Office for Personal Data Protection of the Slovak Republic), Hraničná 12, 820 07 Bratislava 27, Slovakia, dataprotection.gov.sk. You may also contact the authority in your place of residence, place of work or the place of the alleged infringement.']],
      ['Obligation to provide data, no automated decisions', [
        'Providing your data is voluntary. Without the information marked as mandatory, however, we cannot process your enquiry. No automated decision-making, including profiling (Art. 22 GDPR), takes place.']],
      ['Changes', [
        'We update this privacy policy when the website or legal requirements change. The version published here applies.']],
    ],
  },
};

async function render(ctx) {
  const t = T[ctx.lang];
  // Texty sú naše (nie z dát) — HTML v nich je zámerný, kontakty sa doplnia bezpečne.
  const fill = (s) => s.replace(/\{MAIL\}/g, `<a href="mailto:${MAIL}">${MAIL}</a>`).replace(/\{PHONE\}/g, `<a href="${tel(PHONE)}">${esc(PHONE)}</a>`);
  const body = `
<section class="wrap eu-legal-top">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${esc(ctx.url('home'))}">${esc(t.home)}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(t.h1)}</span></nav>
  <h1 class="eu-h1-52">${esc(t.h1)}</h1>
  <span class="eu-legal-sub">${esc(t.sub)}</span>
  ${ctx.prod ? '' : `<p class="warn eu-warn"><span aria-hidden="true">⚠️</span> ${esc(t.warn)}</p>`}
</section>
<div class="wrap eu-priv sec-last">
  <nav class="eu-toc" aria-label="${esc(t.toc)}"><span class="eyebrow">${esc(t.toc)}</span><ol>${each(t.secs, ([h], i) => `<li><a href="#ds-${i + 1}">${esc(h)}</a></li>`)}</ol></nav>
  <div class="eu-priv-c">${each(t.secs, ([h, ps], i) => `<section class="eu-priv-s" id="ds-${i + 1}"><h2><span>${String(i + 1).padStart(2, '0')}</span>${esc(h)}</h2>${each(ps, (p) => `<p>${fill(p)}</p>`)}</section>`)}</div>
</div>`;
  return { title: t.title, description: t.desc, body, nav: 'privacy', css: ['css/eu-pages.css'] };
}

module.exports = render;

// Texty stránky — správa webov v appke ich môže prepísať (web/content.js).
module.exports.T = T;
