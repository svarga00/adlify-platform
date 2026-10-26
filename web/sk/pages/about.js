// ============================================================================
// punds.sk — O nás (návrh 2d)
// ============================================================================
// Tím: mená a fotky zatiaľ nemáme — na skúšobnej adrese sa ukážu zástupné
// karty s poznámkou, naostro sa sekcia skryje, kým TEAM nie je vyplnený.
// ============================================================================
'use strict';

const { esc, each } = require('../../shared/h');
const { mark } = require('../../shared/brand');
const { IMG } = require('../../shared/jobs');
const { PHONE, PHONE2, MAIL, tel } = require('../common');
const { ghost, mapBox, euUrl, COMPANY } = require('./contact');

const DRY = 'https://punds.eu/wp-content/uploads/2026/06/magnific_professional-photograph-o_CHcaWF8EEy-960x680.jpeg';

/** Tím — doplní klient: { name, role: {sk,…}, langs: 'SK · DE', photo }. */
const TEAM = [];
const TEAM_DEMO = [
  { role: { sk: 'Konateľ', cz: 'Jednatel', hu: 'Ügyvezető', de: 'Geschäftsführer', en: 'Managing director' }, langs: 'SK · DE' },
  { role: { sk: 'Koordinátor projektov', cz: 'Koordinátor projektů', hu: 'Projektkoordinátor', de: 'Projektkoordinator', en: 'Project coordinator' }, langs: 'SK · CZ · DE' },
  { role: { sk: 'Administratíva a fakturácia', cz: 'Administrativa a fakturace', hu: 'Adminisztráció és számlázás', de: 'Verwaltung und Abrechnung', en: 'Admin and invoicing' }, langs: 'SK · HU' },
];

const T = {
  sk: {
    title: 'O nás – Partner und Service s. r. o. | punds', desc: 'Sme slovenská firma z Nových Zámkov. Remeselníkom pomáhame nájsť férovú prácu v Nemecku a Rakúsku – s ubytovaním, papiermi aj fakturáciou.',
    home: 'Domov', crumb: 'O nás',
    h1: 'Spájame dobrých remeselníkov s dobrými', h1b: 'stavbami.',
    lead: 'Sme slovenská firma z Nových Zámkov. Remeselníkom zo Slovenska, Česka a Maďarska pomáhame nájsť férovú prácu v Nemecku a Rakúsku a nemeckým firmám hľadáme spoľahlivých ľudí. Ubytovanie, papiere aj fakturáciu riešime my, Vy sa môžete venovať svojej práci.',
    ctaJobs: 'Pozrieť ponuky', ctaCon: 'Kontaktovať nás', badgeP: 'komunikujeme vo Vašom jazyku', imgAlt: ['Remeselník pri montáži na stavbe', 'Zvárač pri práci'],
    whoK: 'Kto sme', whoH: 'Partner, nie agentúra.',
    who: ['Remeselníkov nevnímame ako položku v tabuľke. Každého poznáme osobne, vieme, čo vie a kde sa mu bude dariť. Firmám v Nemecku posielame len ľudí, za ktorých sa vieme zaručiť.', 'Pomôžeme so všetkým okolo práce: živnosť, A1, Freistellung, nemecké daňové číslo, ubytovanie aj pravidelná fakturácia. Na stavbe tak riešite len stavbu.'],
    misK: 'Naša misia', mis: 'Aby sa každý remeselník u nás cítil ako partner a každá firma vedela, že sa na nás môže spoľahnúť.',
    valH: 'Na čom nám záleží',
    val: [['Férové podmienky', 'Jasná sadzba vopred, žiadne skryté poplatky. Platba každých 14 dní.'], ['Spoľahlivosť', 'Pracujeme len s overenými firmami a dodržiavame, čo sľúbime.'], ['Váš jazyk', 'Komunikujeme po slovensky, česky, maďarsky aj nemecky.'], ['Dlhodobá spolupráca', 'Po skončení projektu Vám radi ponúkneme ďalší.']],
    forK: 'Pre remeselníkov', forH: 'Práca v Nemecku bez starostí', forL: ['Overené projekty s jasnou sadzbou', 'Ubytovanie pri stavbe', 'Pomoc so živnosťou a dokumentmi'],
    b2bK: 'Pre firmy v Nemecku', b2bH: 'Spoľahliví ľudia na Vašu stavbu', b2bL: ['Jednotlivci aj celé partie', 'Kompletné doklady pred nástupom', 'Jeden kontakt pre celý projekt'],
    teamH: 'Ľudia, s ktorými budete hovoriť', teamNote: 'Fotky a mená doplníme', photo: 'Fotka', speaks: 'Hovorí', name: 'Meno Priezvisko',
    coK: 'Firemné údaje', seat: 'Sídlo', ico: 'IČO', phone: 'Telefón', mail: 'E-mail', open: 'Otvorené', hours: 'Po–Pia 8:00–16:00', openMap: 'Otvoriť v mapách',
  },
  cz: {
    title: 'O nás – Partner und Service s. r. o. | punds', desc: 'Jsme slovenská firma z Nových Zámků. Řemeslníkům pomáháme najít férovou práci v Německu a Rakousku – s ubytováním, papíry i fakturací.',
    home: 'Domů', crumb: 'O nás',
    h1: 'Spojujeme dobré řemeslníky s dobrými', h1b: 'stavbami.',
    lead: 'Jsme slovenská firma z Nových Zámků. Řemeslníkům ze Slovenska, Česka a Maďarska pomáháme najít férovou práci v Německu a Rakousku a německým firmám hledáme spolehlivé lidi. Ubytování, papíry i fakturaci řešíme my, Vy se můžete věnovat své práci.',
    ctaJobs: 'Zobrazit nabídky', ctaCon: 'Kontaktovat nás', badgeP: 'komunikujeme ve Vašem jazyce', imgAlt: ['Řemeslník při montáži na stavbě', 'Svářeč při práci'],
    whoK: 'Kdo jsme', whoH: 'Partner, ne agentura.',
    who: ['Řemeslníky nevnímáme jako položku v tabulce. Každého známe osobně, víme, co umí a kde se mu bude dařit. Firmám v Německu posíláme jen lidi, za které se můžeme zaručit.', 'Pomůžeme se vším kolem práce: živnost, A1, Freistellung, německé daňové číslo, ubytování i pravidelná fakturace. Na stavbě tak řešíte jen stavbu.'],
    misK: 'Naše mise', mis: 'Aby se každý řemeslník u nás cítil jako partner a každá firma věděla, že se na nás může spolehnout.',
    valH: 'Na čem nám záleží',
    val: [['Férové podmínky', 'Jasná sazba předem, žádné skryté poplatky. Platba každých 14 dní.'], ['Spolehlivost', 'Pracujeme jen s ověřenými firmami a dodržujeme, co slíbíme.'], ['Váš jazyk', 'Komunikujeme slovensky, česky, maďarsky i německy.'], ['Dlouhodobá spolupráce', 'Po skončení projektu Vám rádi nabídneme další.']],
    forK: 'Pro řemeslníky', forH: 'Práce v Německu bez starostí', forL: ['Ověřené projekty s jasnou sazbou', 'Ubytování u stavby', 'Pomoc se živností a dokumenty'],
    b2bK: 'Pro firmy v Německu', b2bH: 'Spolehliví lidé na Vaši stavbu', b2bL: ['Jednotlivci i celé party', 'Kompletní doklady před nástupem', 'Jeden kontakt pro celý projekt'],
    teamH: 'Lidé, se kterými budete mluvit', teamNote: 'Fotky a jména doplníme', photo: 'Fotka', speaks: 'Mluví', name: 'Jméno Příjmení',
    coK: 'Firemní údaje', seat: 'Sídlo', ico: 'IČO', phone: 'Telefon', mail: 'E-mail', open: 'Otevřeno', hours: 'Po–Pá 8:00–16:00', openMap: 'Otevřít v mapách',
  },
  hu: {
    title: 'Rólunk – Partner und Service s. r. o. | punds', desc: 'Érsekújvári (Nové Zámky) szlovák cég vagyunk. Szakembereknek segítünk tisztességes munkát találni Németországban és Ausztriában – szállással, iratokkal és számlázással.',
    home: 'Kezdőlap', crumb: 'Rólunk',
    h1: 'Jó szakembereket kötünk össze jó', h1b: 'építkezésekkel.',
    lead: 'Érsekújvári (Nové Zámky) szlovák cég vagyunk. Szlovákiai, csehországi és magyarországi szakembereknek segítünk tisztességes munkát találni Németországban és Ausztriában, a német cégeknek pedig megbízható embereket keresünk. A szállást, a papírokat és a számlázást mi intézzük, Ön a munkájára koncentrálhat.',
    ctaJobs: 'Állások megtekintése', ctaCon: 'Kapcsolatfelvétel', badgeP: 'az Ön nyelvén beszélünk', imgAlt: ['Szakember szerelés közben az építkezésen', 'Hegesztő munka közben'],
    whoK: 'Kik vagyunk', whoH: 'Partner, nem ügynökség.',
    who: ['A szakembereket nem egy táblázat sorainak tekintjük. Mindenkit személyesen ismerünk, tudjuk, mihez ért és hol fog jól boldogulni. A német cégekhez csak olyan embereket küldünk, akikért kezességet tudunk vállalni.', 'Segítünk mindenben, ami a munkával jár: vállalkozás, A1, Freistellung, német adószám, szállás és rendszeres számlázás. Így az építkezésen csak az építkezéssel kell foglalkoznia.'],
    misK: 'Küldetésünk', mis: 'Hogy nálunk minden szakember partnernek érezze magát, és minden cég tudja, hogy számíthat ránk.',
    valH: 'Ami fontos nekünk',
    val: [['Tisztességes feltételek', 'Előre tiszta óradíj, rejtett díjak nélkül. Fizetés 14 naponta.'], ['Megbízhatóság', 'Csak ellenőrzött cégekkel dolgozunk, és betartjuk, amit ígérünk.'], ['Az Ön nyelve', 'Beszélünk szlovákul, csehül, magyarul és németül.'], ['Hosszú távú együttműködés', 'A projekt végén szívesen ajánlunk Önnek újabbat.']],
    forK: 'Szakembereknek', forH: 'Gondtalan munka Németországban', forL: ['Ellenőrzött projektek tiszta óradíjjal', 'Szállás az építkezés közelében', 'Segítség a vállalkozással és az iratokkal'],
    b2bK: 'Németországi cégeknek', b2bH: 'Megbízható emberek az építkezésére', b2bL: ['Egyének és teljes brigádok', 'Minden irat a munkakezdés előtt', 'Egy kapcsolattartó a teljes projektre'],
    teamH: 'Akikkel beszélni fog', teamNote: 'A fotókat és neveket hamarosan pótoljuk', photo: 'Fotó', speaks: 'Nyelvek', name: 'Név',
    coK: 'Cégadatok', seat: 'Székhely', ico: 'Cégazonosító (IČO)', phone: 'Telefon', mail: 'E-mail', open: 'Nyitvatartás', hours: 'H–P 8:00–16:00', openMap: 'Megnyitás térképen',
  },
  de: {
    title: 'Über uns – Partner und Service s. r. o. | punds', desc: 'Wir sind ein slowakisches Unternehmen aus Nové Zámky. Wir helfen Handwerkern, faire Arbeit in Deutschland und Österreich zu finden – mit Unterkunft, Papieren und Abrechnung.',
    home: 'Start', crumb: 'Über uns',
    h1: 'Wir bringen gute Handwerker und gute', h1b: 'Baustellen zusammen.',
    lead: 'Wir sind ein slowakisches Unternehmen aus Nové Zámky. Wir helfen Handwerkern aus der Slowakei, Tschechien und Ungarn, faire Arbeit in Deutschland und Österreich zu finden, und suchen für deutsche Firmen zuverlässige Leute. Unterkunft, Papiere und Abrechnung übernehmen wir – Sie können sich auf Ihre Arbeit konzentrieren.',
    ctaJobs: 'Jobs ansehen', ctaCon: 'Kontakt aufnehmen', badgeP: 'wir sprechen Ihre Sprache', imgAlt: ['Handwerker bei der Montage auf der Baustelle', 'Schweißer bei der Arbeit'],
    whoK: 'Wer wir sind', whoH: 'Partner, keine Agentur.',
    who: ['Handwerker sind für uns keine Zeile in einer Tabelle. Wir kennen jeden persönlich und wissen, was er kann und wo er gut aufgehoben ist. Zu Firmen in Deutschland schicken wir nur Leute, für die wir uns verbürgen können.', 'Wir helfen bei allem rund um die Arbeit: Gewerbe, A1, Freistellung, deutsche Steuernummer, Unterkunft und regelmäßige Abrechnung. So kümmern Sie sich auf der Baustelle nur um die Baustelle.'],
    misK: 'Unsere Mission', mis: 'Dass sich jeder Handwerker bei uns als Partner fühlt und jede Firma weiß, dass sie sich auf uns verlassen kann.',
    valH: 'Was uns wichtig ist',
    val: [['Faire Konditionen', 'Klarer Stundensatz im Voraus, keine versteckten Gebühren. Zahlung alle 14 Tage.'], ['Verlässlichkeit', 'Wir arbeiten nur mit geprüften Firmen und halten, was wir versprechen.'], ['Ihre Sprache', 'Wir sprechen Slowakisch, Tschechisch, Ungarisch und Deutsch.'], ['Langfristige Zusammenarbeit', 'Nach dem Projekt bieten wir Ihnen gern das nächste an.']],
    forK: 'Für Handwerker', forH: 'Arbeit in Deutschland ohne Sorgen', forL: ['Geprüfte Projekte mit klarem Stundensatz', 'Unterkunft nahe der Baustelle', 'Hilfe mit Gewerbe und Dokumenten'],
    b2bK: 'Für Firmen in Deutschland', b2bH: 'Zuverlässige Leute für Ihre Baustelle', b2bL: ['Einzelne Fachkräfte und ganze Kolonnen', 'Vollständige Unterlagen vor Arbeitsbeginn', 'Ein Ansprechpartner für das ganze Projekt'],
    teamH: 'Mit diesen Menschen sprechen Sie', teamNote: 'Fotos und Namen folgen', photo: 'Foto', speaks: 'Spricht', name: 'Vorname Nachname',
    coK: 'Firmendaten', seat: 'Sitz', ico: 'IČO (Firmennummer)', phone: 'Telefon', mail: 'E-Mail', open: 'Geöffnet', hours: 'Mo–Fr 8:00–16:00', openMap: 'In Karten öffnen',
  },
  en: {
    title: 'About us – Partner und Service s. r. o. | punds', desc: 'We are a Slovak company based in Nové Zámky. We help tradespeople find fair work in Germany and Austria – with housing, paperwork and invoicing taken care of.',
    home: 'Home', crumb: 'About us',
    h1: 'We connect good tradespeople with good', h1b: 'construction sites.',
    lead: 'We are a Slovak company based in Nové Zámky. We help tradespeople from Slovakia, Czechia and Hungary find fair work in Germany and Austria, and we find reliable people for German companies. We take care of housing, paperwork and invoicing, so you can focus on your work.',
    ctaJobs: 'See jobs', ctaCon: 'Contact us', badgeP: 'we speak your language', imgAlt: ['Tradesperson fitting on a construction site', 'Welder at work'],
    whoK: 'Who we are', whoH: 'A partner, not an agency.',
    who: ['To us, tradespeople aren’t a line in a spreadsheet. We know everyone personally – what they can do and where they’ll do well. We only send people to German companies we can vouch for.', 'We help with everything around the job: self-employment, A1, Freistellung, a German tax number, housing and regular invoicing. On site, you only deal with the site.'],
    misK: 'Our mission', mis: 'That every tradesperson feels like a partner with us, and every company knows it can rely on us.',
    valH: 'What matters to us',
    val: [['Fair terms', 'A clear rate up front, no hidden fees. Paid every 14 days.'], ['Reliability', 'We only work with vetted companies and keep our promises.'], ['Your language', 'We speak Slovak, Czech, Hungarian and German.'], ['Long-term cooperation', 'When a project ends, we’ll be glad to offer you the next one.']],
    forK: 'For tradespeople', forH: 'Work in Germany, worry-free', forL: ['Vetted projects with a clear rate', 'Housing near the site', 'Help with self-employment and documents'],
    b2bK: 'For companies in Germany', b2bH: 'Reliable people for your site', b2bL: ['Individuals and whole crews', 'Complete documents before day one', 'One contact for the whole project'],
    teamH: 'The people you’ll talk to', teamNote: 'Photos and names coming soon', photo: 'Photo', speaks: 'Speaks', name: 'First Last',
    coK: 'Company details', seat: 'Registered office', ico: 'Company ID (IČO)', phone: 'Phone', mail: 'Email', open: 'Open', hours: 'Mon–Fri 8:00–16:00', openMap: 'Open in Maps',
  },
};

const pad = (i) => String(i + 1).padStart(2, '0');
const checks = (list) => each(list, (x) => `<li><span class="sp-tick" aria-hidden="true">✓</span>${esc(x)}</li>`);

async function render(ctx) {
  const t = T[ctx.lang];
  // Tím z appky (Marketing → Weby → Tím); kým je prázdny, skúšobne ukážka.
  const real = ((ctx.content && ctx.content.team) || []).length ? ctx.content.team : TEAM;
  const team = real.length ? real : (ctx.prod ? [] : TEAM_DEMO);
  const demoTeam = !real.length;
  const body = `
<div class="wrap sp-head ab-crumbs">
  <nav class="crumbs" aria-label="breadcrumb"><a href="${esc(ctx.url('home'))}">${esc(t.home)}</a><span aria-hidden="true">/</span><span class="cur" aria-current="page">${esc(t.crumb)}</span></nav>
</div>
<section class="wrap ab-hero">
  <div class="ab-hero-txt rv-in">
    <span class="pill"><span class="pill-mark">${mark({ w: 13, light: true })}</span>Partner und Service s. r. o. · Nové Zámky</span>
    <h1 class="h1">${esc(t.h1)} <span class="or">${esc(t.h1b)}</span></h1>
    <p class="lead">${esc(t.lead)}</p>
    <div class="hm-ctas"><a class="btn btn-primary" href="${esc(ctx.url('jobs'))}">${esc(t.ctaJobs)} →</a><a class="btn btn-ghost" href="#firma">${esc(t.ctaCon)}</a></div>
  </div>
  <div class="ab-hero-img rv-in d1">
    <img class="ab-img1" src="${DRY}" alt="${esc(t.imgAlt[0])}" width="960" height="680">
    <img class="ab-img2" src="${IMG.weld}" alt="${esc(t.imgAlt[1])}" width="960" height="680" loading="lazy">
    <div class="ab-badge floaty">${mark({ w: 34 })}<span><strong>SK · CZ · HU · DE</strong><span>${esc(t.badgeP)}</span></span></div>
  </div>
</section>
<section class="wrap ab-who">
  <div class="ab-who-h rv"><span class="sp-kicker">${esc(t.whoK)}</span><h2 class="h2">${esc(t.whoH)}</h2></div>
  <div class="ab-who-txt rv">
    ${each(t.who, (p) => `<p>${esc(p)}</p>`)}
    <div class="sp-dark ab-mission"><span class="sp-dark-mark">${ghost(200)}</span><span class="sp-kicker">${esc(t.misK)}</span><p>${esc(t.mis)}</p></div>
  </div>
</section>
<section class="wrap ab-sec" aria-labelledby="ab-val-h">
  <h2 class="h2" id="ab-val-h">${esc(t.valH)}</h2>
  <div class="hm-ben ab-val">${each(t.val, ([h, p], i) => `<div class="card lift rv hm-ben-c"><span class="hm-n">${pad(i)}</span><h3 class="h3">${esc(h)}</h3><p>${esc(p)}</p></div>`)}</div>
</section>
<section class="wrap ab-aud">
  <div class="ab-aud-c rv"><span class="sp-kicker">${esc(t.forK)}</span><h2 class="ab-aud-h">${esc(t.forH)}</h2><ul class="sp-checks">${checks(t.forL)}</ul><a class="btn btn-primary ab-aud-btn" href="${esc(ctx.url('jobs'))}">${esc(t.ctaJobs)} →</a></div>
  <div class="ab-aud-c ab-aud-dark rv"><span class="sp-kicker">${esc(t.b2bK)}</span><h2 class="ab-aud-h">${esc(t.b2bH)}</h2><ul class="sp-checks">${checks(t.b2bL)}</ul><a class="btn ab-aud-btn ab-btn-white" href="${esc(euUrl(ctx))}">punds.eu →</a></div>
</section>
${team.length ? `<section class="wrap ab-sec" aria-labelledby="ab-team-h">
  <div class="ab-team-head"><h2 class="h2" id="ab-team-h">${esc(t.teamH)}</h2>${demoTeam ? `<span class="warn">${esc(t.teamNote)}</span>` : ''}</div>
  <div class="ab-team">${each(team, (m) => `<div class="ab-person rv">
    <div class="ab-photo">${m.photo ? `<img src="${esc(m.photo)}" alt="${esc(m.name)}" loading="lazy">` : `<span class="ab-photo-mark">${ghost(150, '#0E1626')}</span><span class="ab-photo-tag">${esc(t.photo)}</span>`}</div>
    <div class="ab-person-txt"><strong>${esc(m.name || t.name)}</strong><span class="ab-role">${esc(m.role[ctx.lang] || m.role.sk)}</span><span class="ab-langs">${esc(t.speaks)}: ${esc(m.langs)}</span></div>
  </div>`)}</div>
</section>` : ''}
<section class="wrap ab-sec sec-last" id="firma">
  <div class="ab-co rv">
    <div class="ab-co-in">
      <span class="sp-kicker">${esc(t.coK)}</span><h2 class="ab-aud-h">${COMPANY.name}</h2>
      <dl class="ab-dl">
        <dt>${esc(t.seat)}</dt><dd>Podzámska 9468/4A<br>940 71 Nové Zámky</dd>
        <dt>${esc(t.ico)}</dt><dd>${COMPANY.ico}</dd>
        <dt>${esc(t.phone)}</dt><dd><a class="b" href="${tel(PHONE)}">${PHONE}</a><br><a class="b" href="${tel(PHONE2)}">${PHONE2}</a></dd>
        <dt>${esc(t.mail)}</dt><dd><a class="b or" href="mailto:${MAIL}">${MAIL}</a></dd>
        <dt>${esc(t.open)}</dt><dd>${esc(t.hours)}</dd>
      </dl>
    </div>
    ${mapBox(t, 'ab-map')}
  </div>
</section>`;
  return { title: t.title, description: t.desc, body, css: ['css/sk-pages.css'], bodyClass: 'pg-about', image: DRY };
}

module.exports = render;
module.exports.DRY = DRY;

// Texty stránky — správa webov v appke ich môže prepísať (web/content.js).
module.exports.T = T;
