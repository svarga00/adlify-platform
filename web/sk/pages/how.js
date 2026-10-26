// ============================================================================
// punds.sk — Ako to funguje (návrh 2f)
// ============================================================================
'use strict';

const { esc, each } = require('../../shared/h');
const { mark } = require('../../shared/brand');
const { PHONE, tel } = require('../common');

const T = {
  sk: {
    title: 'Ako to funguje – od telefonátu po výplatu | punds', desc: 'Šesť jednoduchých krokov od prvého telefonátu po prvú výplatu. Pozrite si, čo budete potrebovať, čo vybavíme za Vás a odpovede na časté otázky.',
    home: 'Domov', crumb: 'Ako to funguje', h1: 'Od prvého telefonátu po prvú výplatu', lead: 'Celý postup je jednoduchý a vždy viete, čo bude nasledovať. Väčšinu vecí okolo práce vybavíme za Vás.',
    steps: [
      ['Ozvete sa nám', 'Zavolajte, napíšte na WhatsApp alebo vyplňte krátky formulár pri ponuke. Životopis netreba.', '5 minút'],
      ['Krátky telefonát', 'Prejdeme si Vašu prax, certifikáty, kedy môžete nastúpiť a čo od práce očakávate.', 'do 24 hodín'],
      ['Konkrétna ponuka', 'Pošleme Vám presné podmienky: miesto, sadzbu, hodiny, turnus a ubytovanie. Rozhodnete sa v pokoji.', '1–3 dni'],
      ['Dokumenty', 'Pomôžeme so živnosťou a pripravíme všetko, čo treba na prácu v Nemecku.', '1–2 týždne'],
      ['Nástup na projekt', 'Dostanete adresu ubytovania a kontakt na koordinátora. Počas projektu sme stále k dispozícii.', 'podľa ponuky'],
      ['Fakturácia a výplata', 'Každých 14 dní vyfakturujete odpracované hodiny podľa výkazu. Platby chodia načas.', 'každých 14 dní'],
    ],
    needK: 'Pripravte si', needH: 'Čo budete potrebovať', need: ['Občiansky preukaz alebo pas', 'Živnostenské oprávnenie (alebo pomôžeme založiť)', 'Certifikáty a osvedčenia k profesii', 'Bankový účet na fakturáciu'],
    weK: 'Vybavíme za Vás', weH: 'O čo sa postaráme my', we: ['Ubytovanie v blízkosti projektu', 'Dokumenty potrebné na prácu v Nemecku', 'Komunikácia s nemeckou firmou', 'Pravidelná fakturácia každých 14 dní'],
    faqH: 'Časté otázky', faqP: 'Nenašli ste odpoveď? Zavolajte na',
    faq: [
      ['Potrebujem živnosť?', 'Áno, spolupráca prebieha formou živnosti. Ak ju ešte nemáte, poradíme Vám a pomôžeme s jej založením.'],
      ['Koľko stojí Vaša pomoc?', 'Všetky podmienky vrátane prípadných poplatkov Vám povieme vopred, ešte predtým, ako sa rozhodnete. Žiadne skryté poplatky.'],
      ['Kedy a ako dostanem zaplatené?', 'Fakturuje sa každých 14 dní podľa výkazu odpracovaných hodín a platby chodia načas. Konkrétne podmienky si dohodneme pri ponuke.'],
      ['Musím vedieť po nemecky?', 'Nemčina je výhodou, ale na mnohých pozíciách nie je nevyhnutná. Záleží na konkrétnom projekte – pri každej ponuke Vám to povieme.'],
      ['Môžem ísť pracovať s kolegom?', 'Áno, radi obsadíme projekt aj celou partiou. Napíšte nám, koľko Vás je a aké profesie máte.'],
    ],
    endH: 'Pripravení? Prvý krok trvá 5 minút.', ctaJobs: 'Pozrieť ponuky', call: 'Zavolať',
  },
  cz: {
    title: 'Jak to funguje – od telefonátu po výplatu | punds', desc: 'Šest jednoduchých kroků od prvního telefonátu po první výplatu. Podívejte se, co budete potřebovat, co vyřídíme za Vás a odpovědi na časté otázky.',
    home: 'Domů', crumb: 'Jak to funguje', h1: 'Od prvního telefonátu po první výplatu', lead: 'Celý postup je jednoduchý a vždy víte, co bude následovat. Většinu věcí kolem práce vyřídíme za Vás.',
    steps: [
      ['Ozvete se nám', 'Zavolejte, napište na WhatsApp nebo vyplňte krátký formulář u nabídky. Životopis není potřeba.', '5 minut'],
      ['Krátký telefonát', 'Projdeme si Vaši praxi, certifikáty, kdy můžete nastoupit a co od práce očekáváte.', 'do 24 hodin'],
      ['Konkrétní nabídka', 'Pošleme Vám přesné podmínky: místo, sazbu, hodiny, turnus a ubytování. Rozhodnete se v klidu.', '1–3 dny'],
      ['Dokumenty', 'Pomůžeme se živností a připravíme vše, co je potřeba pro práci v Německu.', '1–2 týdny'],
      ['Nástup na projekt', 'Dostanete adresu ubytování a kontakt na koordinátora. Během projektu jsme stále k dispozici.', 'podle nabídky'],
      ['Fakturace a výplata', 'Každých 14 dní vyfakturujete odpracované hodiny podle výkazu. Platby chodí včas.', 'každých 14 dní'],
    ],
    needK: 'Připravte si', needH: 'Co budete potřebovat', need: ['Občanský průkaz nebo pas', 'Živnostenské oprávnění (nebo pomůžeme založit)', 'Certifikáty a osvědčení k profesi', 'Bankovní účet pro fakturaci'],
    weK: 'Vyřídíme za Vás', weH: 'O co se postaráme my', we: ['Ubytování v blízkosti projektu', 'Dokumenty potřebné pro práci v Německu', 'Komunikace s německou firmou', 'Pravidelná fakturace každých 14 dní'],
    faqH: 'Časté otázky', faqP: 'Nenašli jste odpověď? Zavolejte na',
    faq: [
      ['Potřebuji živnost?', 'Ano, spolupráce probíhá formou živnosti. Pokud ji ještě nemáte, poradíme Vám a pomůžeme s jejím založením.'],
      ['Kolik stojí Vaše pomoc?', 'Všechny podmínky včetně případných poplatků Vám řekneme předem, ještě než se rozhodnete. Žádné skryté poplatky.'],
      ['Kdy a jak dostanu zaplaceno?', 'Fakturuje se každých 14 dní podle výkazu odpracovaných hodin a platby chodí včas. Konkrétní podmínky domluvíme u nabídky.'],
      ['Musím umět německy?', 'Němčina je výhodou, ale na mnoha pozicích není nezbytná. Záleží na konkrétním projektu – u každé nabídky Vám to řekneme.'],
      ['Můžu jít pracovat s kolegou?', 'Ano, rádi obsadíme projekt i celou partou. Napište nám, kolik Vás je a jaké máte profese.'],
    ],
    endH: 'Připraveni? První krok trvá 5 minut.', ctaJobs: 'Zobrazit nabídky', call: 'Zavolat',
  },
  hu: {
    title: 'Hogyan működik – a hívástól a fizetésig | punds', desc: 'Hat egyszerű lépés az első hívástól az első fizetésig. Nézze meg, mire lesz szüksége, mit intézünk el Ön helyett, és a gyakori kérdésekre adott válaszokat.',
    home: 'Kezdőlap', crumb: 'Hogyan működik', h1: 'Az első hívástól az első fizetésig', lead: 'A folyamat egyszerű, és mindig tudja, mi következik. A munkával járó teendők nagy részét elintézzük Ön helyett.',
    steps: [
      ['Jelentkezik nálunk', 'Hívjon, írjon WhatsAppon, vagy töltse ki a rövid űrlapot az állásnál. Önéletrajz nem kell.', '5 perc'],
      ['Rövid telefonbeszélgetés', 'Átbeszéljük a gyakorlatát, a tanúsítványait, hogy mikor tud kezdeni, és mit vár a munkától.', '24 órán belül'],
      ['Konkrét ajánlat', 'Elküldjük a pontos feltételeket: helyszín, óradíj, munkaidő, turnus és szállás. Nyugodtan dönthet.', '1–3 nap'],
      ['Iratok', 'Segítünk a vállalkozás ügyében, és előkészítünk mindent, ami a németországi munkához kell.', '1–2 hét'],
      ['Munkakezdés', 'Megkapja a szállás címét és a koordinátor elérhetőségét. A projekt alatt végig rendelkezésre állunk.', 'ajánlat szerint'],
      ['Számlázás és fizetés', '14 naponta számlázza a ledolgozott órákat a kimutatás alapján. A kifizetések pontosan érkeznek.', '14 naponta'],
    ],
    needK: 'Készítse elő', needH: 'Amire szüksége lesz', need: ['Személyi igazolvány vagy útlevél', 'Vállalkozói engedély (vagy segítünk kiváltani)', 'A szakmához tartozó tanúsítványok', 'Bankszámla a számlázáshoz'],
    weK: 'Elintézzük Ön helyett', weH: 'Amiről mi gondoskodunk', we: ['Szállás a projekt közelében', 'A németországi munkához szükséges iratok', 'Kapcsolattartás a német céggel', 'Rendszeres számlázás 14 naponta'],
    faqH: 'Gyakori kérdések', faqP: 'Nem találta a választ? Hívja a',
    faq: [
      ['Kell vállalkozás?', 'Igen, az együttműködés egyéni vállalkozóként történik. Ha még nincs, tanácsot adunk, és segítünk az indításában.'],
      ['Mennyibe kerül a segítségük?', 'Minden feltételt, az esetleges díjakat is, előre megmondunk, még mielőtt döntene. Rejtett díjak nincsenek.'],
      ['Mikor és hogyan kapom meg a pénzem?', '14 naponta számlázunk a ledolgozott órák kimutatása alapján, és a kifizetések pontosan érkeznek. A konkrét feltételeket az ajánlatnál egyeztetjük.'],
      ['Kell tudnom németül?', 'A német nyelvtudás előny, de sok pozíciónál nem feltétel. A konkrét projekttől függ – minden ajánlatnál megmondjuk.'],
      ['Mehetek dolgozni egy kollégámmal?', 'Igen, szívesen adunk munkát egy egész brigádnak is. Írja meg, hányan vannak és milyen szakmákkal.'],
    ],
    endH: 'Készen áll? Az első lépés 5 perc.', ctaJobs: 'Állások megtekintése', call: 'Hívás',
  },
  de: {
    title: 'Ablauf – vom ersten Anruf bis zur Bezahlung | punds', desc: 'Sechs einfache Schritte vom ersten Anruf bis zur ersten Zahlung. Was Sie brauchen, was wir für Sie erledigen und Antworten auf häufige Fragen.',
    home: 'Start', crumb: 'Ablauf', h1: 'Vom ersten Anruf bis zur ersten Zahlung', lead: 'Der Ablauf ist einfach, und Sie wissen immer, was als Nächstes kommt. Das meiste rund um die Arbeit erledigen wir für Sie.',
    steps: [
      ['Sie melden sich', 'Rufen Sie an, schreiben Sie per WhatsApp oder füllen Sie das kurze Formular beim Job aus. Kein Lebenslauf nötig.', '5 Minuten'],
      ['Kurzes Telefonat', 'Wir sprechen über Ihre Erfahrung, Zertifikate, Ihren möglichen Starttermin und Ihre Erwartungen.', 'innerhalb von 24 Stunden'],
      ['Konkretes Angebot', 'Wir schicken Ihnen die genauen Konditionen: Ort, Stundensatz, Arbeitszeit, Turnus und Unterkunft. Sie entscheiden in Ruhe.', '1–3 Tage'],
      ['Dokumente', 'Wir helfen beim Gewerbe und bereiten alles vor, was Sie für die Arbeit in Deutschland brauchen.', '1–2 Wochen'],
      ['Projektstart', 'Sie bekommen die Adresse der Unterkunft und den Kontakt zum Koordinator. Während des Projekts sind wir jederzeit erreichbar.', 'je nach Angebot'],
      ['Abrechnung und Bezahlung', 'Alle 14 Tage stellen Sie die geleisteten Stunden laut Stundenzettel in Rechnung. Die Zahlungen kommen pünktlich.', 'alle 14 Tage'],
    ],
    needK: 'Bitte bereithalten', needH: 'Was Sie brauchen', need: ['Personalausweis oder Reisepass', 'Gewerbeschein (oder wir helfen bei der Anmeldung)', 'Zertifikate und Nachweise für Ihren Beruf', 'Bankkonto für die Abrechnung'],
    weK: 'Erledigen wir für Sie', weH: 'Darum kümmern wir uns', we: ['Unterkunft in der Nähe des Projekts', 'Dokumente für die Arbeit in Deutschland', 'Kommunikation mit der deutschen Firma', 'Regelmäßige Abrechnung alle 14 Tage'],
    faqH: 'Häufige Fragen', faqP: 'Keine Antwort gefunden? Rufen Sie uns an:',
    faq: [
      ['Brauche ich ein Gewerbe?', 'Ja, die Zusammenarbeit erfolgt auf selbstständiger Basis. Wenn Sie noch kein Gewerbe haben, beraten wir Sie und helfen bei der Anmeldung.'],
      ['Was kostet Ihre Hilfe?', 'Alle Konditionen, auch mögliche Gebühren, nennen wir Ihnen im Voraus – bevor Sie sich entscheiden. Keine versteckten Kosten.'],
      ['Wann und wie werde ich bezahlt?', 'Abgerechnet wird alle 14 Tage nach Stundenzettel, die Zahlungen kommen pünktlich. Die genauen Konditionen klären wir beim Angebot.'],
      ['Muss ich Deutsch können?', 'Deutsch ist von Vorteil, aber auf vielen Positionen nicht nötig. Das hängt vom Projekt ab – wir sagen es Ihnen bei jedem Angebot.'],
      ['Kann ich mit einem Kollegen arbeiten?', 'Ja, wir besetzen Projekte gern auch mit ganzen Kolonnen. Schreiben Sie uns, wie viele Sie sind und welche Berufe Sie haben.'],
    ],
    endH: 'Bereit? Der erste Schritt dauert 5 Minuten.', ctaJobs: 'Jobs ansehen', call: 'Anrufen',
  },
  en: {
    title: 'How it works – from first call to first pay | punds', desc: 'Six simple steps from your first call to your first payment. See what you’ll need, what we take care of and answers to common questions.',
    home: 'Home', crumb: 'How it works', h1: 'From your first call to your first pay', lead: 'The process is simple and you always know what comes next. We take care of most of the things around the job for you.',
    steps: [
      ['You get in touch', 'Call, message us on WhatsApp or fill in the short form on a job. No CV needed.', '5 minutes'],
      ['A short call', 'We go through your experience, certificates, when you can start and what you expect from the job.', 'within 24 hours'],
      ['A concrete offer', 'We send you the exact terms: location, rate, hours, rotation and accommodation. Take your time to decide.', '1–3 days'],
      ['Documents', 'We help with self-employment and prepare everything you need to work in Germany.', '1–2 weeks'],
      ['Starting the project', 'You get the address of your accommodation and your coordinator’s contact. We’re available throughout the project.', 'per offer'],
      ['Invoicing and pay', 'Every 14 days you invoice the hours worked according to your timesheet. Payments arrive on time.', 'every 14 days'],
    ],
    needK: 'Get ready', needH: 'What you’ll need', need: ['ID card or passport', 'Trade licence (or we’ll help you get one)', 'Certificates for your trade', 'A bank account for invoicing'],
    weK: 'We handle it', weH: 'What we take care of', we: ['Accommodation near the project', 'Documents required to work in Germany', 'Communication with the German company', 'Regular invoicing every 14 days'],
    faqH: 'Frequently asked questions', faqP: 'Didn’t find an answer? Call',
    faq: [
      ['Do I need to be self-employed?', 'Yes, we work with self-employed tradespeople. If you’re not registered yet, we’ll advise you and help you set it up.'],
      ['How much does your help cost?', 'We tell you all terms, including any fees, up front – before you decide. No hidden fees.'],
      ['When and how do I get paid?', 'Invoices go out every 14 days based on your timesheet, and payments arrive on time. We agree the exact terms with each offer.'],
      ['Do I need to speak German?', 'German is an advantage, but not required for many positions. It depends on the project – we’ll tell you with each offer.'],
      ['Can I work together with a colleague?', 'Yes, we’re happy to staff a project with a whole crew. Tell us how many of you there are and your trades.'],
    ],
    endH: 'Ready? The first step takes 5 minutes.', ctaJobs: 'See jobs', call: 'Call us',
  },
};

const pad = (i) => String(i + 1).padStart(2, '0');
const clock = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.2" stroke="currentColor" stroke-width="1.6"/><path d="M8 4.8V8l2.2 1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const checks = (list) => each(list, (x) => `<li><span class="sp-tick" aria-hidden="true">✓</span>${esc(x)}</li>`);

async function render(ctx) {
  const t = T[ctx.lang];
  const body = `
<div class="wrap sp-head">
  <nav class="crumbs" aria-label="breadcrumb"><a href="${esc(ctx.url('home'))}">${esc(t.home)}</a><span aria-hidden="true">/</span><span class="cur" aria-current="page">${esc(t.crumb)}</span></nav>
  <div class="sp-head-in rv-in"><h1 class="sp-h1">${esc(t.h1)}</h1><p class="lead sp-lead">${esc(t.lead)}</p></div>
</div>
<section class="wrap hw-steps">
  <ol>${each(t.steps, ([h, p, d], i) => `<li class="hw-step rv${i === 0 ? ' on' : ''}"><span class="hw-n" aria-hidden="true">${pad(i)}</span><div class="hw-txt"><h2>${esc(h)}</h2><p>${esc(p)}</p></div><span class="hw-time">${clock}${esc(d)}</span></li>`)}</ol>
</section>
<section class="wrap hw-two">
  <div class="ab-aud-c rv"><span class="sp-kicker">${esc(t.needK)}</span><h2 class="ab-aud-h hw-two-h">${esc(t.needH)}</h2><ul class="sp-checks">${checks(t.need)}</ul></div>
  <div class="ab-aud-c ab-aud-dark rv"><span class="sp-kicker">${esc(t.weK)}</span><h2 class="ab-aud-h hw-two-h">${esc(t.weH)}</h2><ul class="sp-checks">${checks(t.we)}</ul></div>
</section>
<section class="wrap sec hw-faq" aria-labelledby="hw-faq-h">
  <div class="hw-faq-h"><h2 class="h2 sp-h2-40" id="hw-faq-h">${esc(t.faqH)}</h2><p>${esc(t.faqP)} <a class="b or" href="${tel(PHONE)}">${PHONE}</a>.</p></div>
  <div class="hw-acc rv" data-acc-group>${each(t.faq, ([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary><span>${esc(q)}</span><span class="hw-plus" aria-hidden="true">+</span></summary><p>${esc(a)}</p></details>`)}</div>
</section>
<section class="wrap sec sec-last hw-end rv">
  ${mark({ w: 64 })}
  <h2>${esc(t.endH)}</h2>
  <div class="hm-ctas"><a class="btn btn-primary" href="${esc(ctx.url('jobs'))}">${esc(t.ctaJobs)} →</a><a class="btn btn-ghost" href="${tel(PHONE)}">${esc(t.call)} · ${PHONE}</a></div>
</section>`;
  return { title: t.title, description: t.desc, body, css: ['css/sk-pages.css'], bodyClass: 'pg-how' };
}

module.exports = render;

// Texty stránky — správa webov v appke ich môže prepísať (web/content.js).
module.exports.T = T;
