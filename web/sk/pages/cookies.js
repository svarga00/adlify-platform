// ============================================================================
// punds.sk — Cookies
// ============================================================================
// Web nepoužíva analytické, reklamné ani sledovacie cookies (site.js nič do
// prehliadača neukladá, mapy a WhatsApp sú len odkazy). Ak by sa to zmenilo,
// treba lištu so súhlasom a upraviť tento text.
// ============================================================================
'use strict';

const { esc } = require('../../shared/h');
const { legalPage } = require('./privacy');

const T = {
  sk: (L) => ({
    title: 'Cookies | punds', desc: 'Web punds.sk nepoužíva analytické, reklamné ani sledovacie cookies. Ukladáme len to, čo je technicky nevyhnutné na fungovanie stránky.',
    home: 'Domov', crumb: 'Cookies', h1: 'Cookies', updated: 'Posledná aktualizácia: október 2026', read: 'Čítanie na 2 minúty', toc: 'Obsah', ask: 'Otázky:', back: 'Ochrana osobných údajov',
    s: [
      ['Čo sú cookies', 'Cookies sú malé súbory, ktoré si web môže uložiť vo Vašom prehliadači – napríklad aby si zapamätal nastavenia alebo aby mohol merať návštevnosť.'],
      ['Čo používame', 'Tento web nepoužíva analytické, reklamné ani sledovacie cookies a nikomu neposiela informácie o tom, čo si na ňom prezeráte. Využívať môže len technicky nevyhnutné ukladanie, bez ktorého by stránka nefungovala (napríklad pri bezpečnom doručení stránky naším poskytovateľom hostingu).'],
      ['Preto nemáme cookie lištu', 'Na technicky nevyhnutné ukladanie súhlas netreba. Keďže nič iné nepoužívame, nezobrazujeme Vám lištu so súhlasom s cookies.'],
      ['Mapy a WhatsApp', 'Mapu ani WhatsApp do stránky nevkladáme. Sú to len odkazy – až keď na ne kliknete, otvorí sa stránka Google Maps alebo WhatsApp, kde platia pravidlá ich prevádzkovateľov.'],
      ['Ako cookies vymazať', 'Uložené cookies môžete kedykoľvek vymazať alebo zablokovať v nastaveniach svojho prehliadača.'],
      ['Zmeny', `Ak by sme v budúcnosti chceli používať napríklad analytické cookies, vopred Vás požiadame o súhlas a túto stránku aktualizujeme. Ako spracúvame osobné údaje, nájdete na stránke ${L('privacy', 'Ochrana osobných údajov')}.`],
    ],
  }),
  cz: (L) => ({
    title: 'Cookies | punds', desc: 'Web punds.sk nepoužívá analytické, reklamní ani sledovací cookies. Ukládáme jen to, co je technicky nezbytné pro fungování stránky.',
    home: 'Domů', crumb: 'Cookies', h1: 'Cookies', updated: 'Poslední aktualizace: říjen 2026', read: 'Čtení na 2 minuty', toc: 'Obsah', ask: 'Dotazy:', back: 'Ochrana osobních údajů',
    s: [
      ['Co jsou cookies', 'Cookies jsou malé soubory, které si web může uložit ve Vašem prohlížeči – například aby si zapamatoval nastavení nebo aby mohl měřit návštěvnost.'],
      ['Co používáme', 'Tento web nepoužívá analytické, reklamní ani sledovací cookies a nikomu neposílá informace o tom, co si na něm prohlížíte. Využívat může jen technicky nezbytné ukládání, bez kterého by stránka nefungovala (například při bezpečném doručení stránky naším poskytovatelem hostingu).'],
      ['Proto nemáme cookie lištu', 'Na technicky nezbytné ukládání souhlas není potřeba. Protože nic jiného nepoužíváme, nezobrazujeme Vám lištu se souhlasem s cookies.'],
      ['Mapy a WhatsApp', 'Mapu ani WhatsApp do stránky nevkládáme. Jsou to jen odkazy – teprve když na ně kliknete, otevře se stránka Google Maps nebo WhatsApp, kde platí pravidla jejich provozovatelů.'],
      ['Jak cookies smazat', 'Uložené cookies můžete kdykoli smazat nebo zablokovat v nastavení svého prohlížeče.'],
      ['Změny', `Pokud bychom v budoucnu chtěli používat například analytické cookies, předem Vás požádáme o souhlas a tuto stránku aktualizujeme. Jak zpracováváme osobní údaje, najdete na stránce ${L('privacy', 'Ochrana osobních údajů')}.`],
    ],
  }),
  hu: (L) => ({
    title: 'Cookie-k | punds', desc: 'A punds.sk nem használ elemző, hirdetési vagy követő cookie-kat. Csak azt tároljuk, ami az oldal működéséhez technikailag feltétlenül szükséges.',
    home: 'Kezdőlap', crumb: 'Cookie-k', h1: 'Cookie-k', updated: 'Utolsó frissítés: 2026. október', read: '2 perc olvasás', toc: 'Tartalom', ask: 'Kérdések:', back: 'Adatvédelem',
    s: [
      ['Mik azok a cookie-k', 'A cookie-k kis fájlok, amelyeket egy weboldal a böngészőjében tárolhat – például a beállítások megjegyzésére vagy a látogatottság mérésére.'],
      ['Mit használunk', 'Ez a weboldal nem használ elemző, hirdetési vagy követő cookie-kat, és senkinek nem küld információt arról, mit néz meg rajta. Legfeljebb technikailag feltétlenül szükséges tárolást használhat, amely nélkül az oldal nem működne (például az oldal biztonságos kiszolgálásához tárhelyszolgáltatónknál).'],
      ['Ezért nincs cookie-sáv', 'A technikailag szükséges tároláshoz nem kell hozzájárulás. Mivel mást nem használunk, nem jelenítünk meg cookie-hozzájárulási sávot.'],
      ['Térkép és WhatsApp', 'Sem térképet, sem WhatsAppot nem ágyazunk be az oldalba. Ezek csak hivatkozások – csak akkor nyílik meg a Google Térkép vagy a WhatsApp oldala, ha rákattint, és ott az üzemeltetőik szabályai érvényesek.'],
      ['Cookie-k törlése', 'A tárolt cookie-kat bármikor törölheti vagy letilthatja a böngésző beállításaiban.'],
      ['Változások', `Ha a jövőben például elemző cookie-kat szeretnénk használni, előbb a hozzájárulását kérjük, és frissítjük ezt az oldalt. A személyes adatok kezeléséről az ${L('privacy', 'Adatvédelem')} oldalon olvashat.`],
    ],
  }),
  de: (L) => ({
    title: 'Cookies | punds', desc: 'punds.sk verwendet keine Analyse-, Werbe- oder Tracking-Cookies. Gespeichert wird nur, was für den Betrieb der Seite technisch notwendig ist.',
    home: 'Start', crumb: 'Cookies', h1: 'Cookies', updated: 'Zuletzt aktualisiert: Oktober 2026', read: '2 Minuten Lesezeit', toc: 'Inhalt', ask: 'Fragen:', back: 'Datenschutz',
    s: [
      ['Was sind Cookies?', 'Cookies sind kleine Dateien, die eine Website in Ihrem Browser speichern kann – zum Beispiel, um Einstellungen zu merken oder Besuche zu messen.'],
      ['Was wir verwenden', 'Diese Website verwendet keine Analyse-, Werbe- oder Tracking-Cookies und gibt keine Informationen darüber weiter, was Sie sich ansehen. Sie nutzt höchstens technisch notwendige Speicherung, ohne die die Seite nicht funktionieren würde (etwa für die sichere Auslieferung durch unseren Hosting-Anbieter).'],
      ['Deshalb kein Cookie-Banner', 'Für technisch notwendige Speicherung ist keine Einwilligung nötig. Da wir nichts anderes verwenden, zeigen wir Ihnen kein Cookie-Banner.'],
      ['Karten und WhatsApp', 'Karten und WhatsApp binden wir nicht in die Seite ein. Es sind nur Links – erst wenn Sie darauf klicken, öffnet sich Google Maps bzw. WhatsApp, wo die Regeln der jeweiligen Anbieter gelten.'],
      ['Cookies löschen', 'Gespeicherte Cookies können Sie jederzeit in den Einstellungen Ihres Browsers löschen oder blockieren.'],
      ['Änderungen', `Sollten wir künftig zum Beispiel Analyse-Cookies einsetzen wollen, bitten wir Sie vorher um Ihre Einwilligung und aktualisieren diese Seite. Wie wir personenbezogene Daten verarbeiten, lesen Sie unter ${L('privacy', 'Datenschutz')}.`],
    ],
  }),
  en: (L) => ({
    title: 'Cookies | punds', desc: 'punds.sk does not use analytics, advertising or tracking cookies. We only store what is technically necessary for the site to work.',
    home: 'Home', crumb: 'Cookies', h1: 'Cookies', updated: 'Last updated: October 2026', read: '2-minute read', toc: 'Contents', ask: 'Questions:', back: 'Privacy policy',
    s: [
      ['What are cookies?', 'Cookies are small files a website can store in your browser – for example to remember settings or to measure visits.'],
      ['What we use', 'This website does not use analytics, advertising or tracking cookies, and it does not pass on information about what you look at. At most it may use technically necessary storage without which the site would not work (for example for secure delivery of the page by our hosting provider).'],
      ['That’s why there’s no cookie banner', 'Technically necessary storage does not require consent. As we use nothing else, we don’t show you a cookie consent banner.'],
      ['Maps and WhatsApp', 'We don’t embed maps or WhatsApp in our pages. They are only links – Google Maps or WhatsApp opens only when you click, and their operators’ rules apply there.'],
      ['Deleting cookies', 'You can delete or block stored cookies at any time in your browser settings.'],
      ['Changes', `If we ever want to use analytics cookies, for example, we will ask for your consent first and update this page. How we process personal data is explained in our ${L('privacy', 'privacy policy')}.`],
    ],
  }),
};

async function render(ctx) {
  const L = (route, text) => `<a class="b or" href="${esc(ctx.url(route))}">${esc(text)}</a>`;
  const t = T[ctx.lang](L);
  t.footBtn = `<a class="btn btn-ghost btn-sm" href="${esc(ctx.url('privacy'))}">${esc(t.back)}</a>`;
  return { title: t.title, description: t.desc, body: legalPage(ctx, t, { toc: false }), css: ['css/sk-pages.css'], bodyClass: 'pg-legal' };
}

module.exports = render;

// Texty stránky — správa webov v appke ich môže prepísať (web/content.js).
module.exports.T = T;
