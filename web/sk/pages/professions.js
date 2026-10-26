// ============================================================================
// punds.sk — Profesie (návrh 2e)
// ============================================================================
// Zoznam profesií zo shared/professions.js. Pri každej počet otvorených
// ponúk a rozpätie sadzieb z aktuálnych ponúk; bez ponuky „Pýtajte sa".
// Odkaz vedie na zoznam ponúk s filtrom ?prof=<kľúč>.
// ============================================================================
'use strict';

const { esc, each, plural } = require('../../shared/h');
const PROF = require('../../shared/professions');
const { IMG } = require('../../shared/jobs');
const { PHONE, tel, rate } = require('../common');
const { ghost } = require('./contact');
const { DRY } = require('./about');

const PIC = { elektrikar: IMG.elec, zvarac: IMG.weld, zamocnik: IMG.mont, sadrokarton: DRY, maliar: IMG.paint, zateplovac: DRY,
  okna: IMG.mont, nabytok: IMG.paint, vzduchotechnik: IMG.elec, pomocnik: DRY };

/** Krátky popis profesie. */
const ABOUT = {
  elektrikar: { sk: 'Rozvody, rozvádzače, priemyselné inštalácie', cz: 'Rozvody, rozvaděče, průmyslové instalace', hu: 'Hálózatok, elosztószekrények, ipari szerelés', de: 'Leitungen, Schaltschränke, Industrieinstallationen', en: 'Wiring, switchboards, industrial installations' },
  zvarac: { sk: 'MIG/MAG (135), TIG (141), certifikáty ISO 9606', cz: 'MIG/MAG (135), TIG (141), certifikáty ISO 9606', hu: 'MIG/MAG (135), TIG (141), ISO 9606 tanúsítvány', de: 'MAG (135), WIG (141), Zertifikate nach ISO 9606', en: 'MIG/MAG (135), TIG (141), ISO 9606 certificates' },
  zamocnik: { sk: 'Oceľové konštrukcie, montáž, ohýbanie', cz: 'Ocelové konstrukce, montáž, ohýbání', hu: 'Acélszerkezetek, szerelés, hajlítás', de: 'Stahlkonstruktionen, Montage, Biegen', en: 'Steel structures, assembly, bending' },
  sadrokarton: { sk: 'Trockenbau, priečky, podhľady', cz: 'Trockenbau, příčky, podhledy', hu: 'Szárazépítés, válaszfalak, álmennyezetek', de: 'Trennwände, Unterdecken, Vorsatzschalen', en: 'Partition walls, suspended ceilings' },
  maliar: { sk: 'Interiéry, fasády, tapetovanie', cz: 'Interiéry, fasády, tapetování', hu: 'Belső terek, homlokzatok, tapétázás', de: 'Innenräume, Fassaden, Tapezieren', en: 'Interiors, facades, wallpapering' },
  zateplovac: { sk: 'WDVS, kontaktné zatepľovacie systémy', cz: 'WDVS, kontaktní zateplovací systémy', hu: 'WDVS, homlokzati hőszigetelő rendszerek', de: 'WDVS, Wärmedämm-Verbundsysteme', en: 'ETICS, external wall insulation' },
  okna: { sk: 'Osadzovanie, tesnenie, servis', cz: 'Osazování, těsnění, servis', hu: 'Beépítés, tömítés, szerviz', de: 'Einbau, Abdichtung, Service', en: 'Installation, sealing, servicing' },
  nabytok: { sk: 'Kancelárie, hotely, kuchyne', cz: 'Kanceláře, hotely, kuchyně', hu: 'Irodák, szállodák, konyhák', de: 'Büros, Hotels, Küchen', en: 'Offices, hotels, kitchens' },
  vzduchotechnik: { sk: 'Vzduchotechnika, potrubia, montáž jednotiek', cz: 'Vzduchotechnika, potrubí, montáž jednotek', hu: 'Légtechnika, csővezetékek, egységek szerelése', de: 'Lüftungsanlagen, Kanäle, Gerätemontage', en: 'Ventilation, ductwork, unit installation' },
  pomocnik: { sk: 'Pomocné práce na stavbe, príprava, upratovanie', cz: 'Pomocné práce na stavbě, příprava, úklid', hu: 'Segédmunka az építkezésen, előkészítés, takarítás', de: 'Helfertätigkeiten, Vorbereitung, Baustellenreinigung', en: 'Site support, preparation, clean-up' },
  ine: { sk: 'Murári, betonári, tesári, obkladači a ďalší. Napíšte nám, čo robíte – radi Vám dáme vedieť o vhodnom projekte.', cz: 'Zedníci, betonáři, tesaři, obkladači a další. Napište nám, co děláte – rádi Vám dáme vědět o vhodném projektu.', hu: 'Kőművesek, betonozók, ácsok, burkolók és mások. Írja meg, mivel foglalkozik – szívesen szólunk, ha lesz megfelelő projekt.', de: 'Maurer, Betonbauer, Zimmerer, Fliesenleger und mehr. Schreiben Sie uns, was Sie machen – wir melden uns, wenn ein passendes Projekt kommt.', en: 'Bricklayers, concrete workers, carpenters, tilers and more. Tell us what you do – we’ll let you know when a suitable project comes up.' },
};

const T = {
  sk: {
    title: 'Profesie – práca v Nemecku pre remeselníkov | punds', desc: 'Hľadáme elektrikárov, zváračov, zámočníkov, sadrokartonistov, maliarov, zatepľovačov, montérov a ďalších remeselníkov na projekty v Nemecku a Rakúsku.',
    home: 'Domov', crumb: 'Profesie', h1: 'Profesie, pre ktoré hľadáme ľudí', lead: 'Zameriavame sa na remeslá na stavbách a v priemysle. Vyberte si svoje a pozrite si aktuálne ponuky.',
    n: ['ponuka', 'ponuky', 'ponúk'], ask: 'Pýtajte sa', noRate: 'Sadzba podľa projektu', see: 'Zobraziť ponuky',
    reqK: 'Čo potrebujete', reqH: 'Čo od Vás očakávame', reqP: 'Na každý projekt hľadáme ľudí s praxou. Konkrétne požiadavky sú vždy uvedené pri ponuke.',
    req: [['Prax v odbore', 'Najčastejšie aspoň 2 roky na podobných projektoch.'], ['Živnosť', 'Ak ju nemáte, pomôžeme s jej založením.'], ['Certifikáty', 'Pri zváračoch a elektrikároch platné osvedčenia.'], ['Spoľahlivosť', 'Dochvíľnosť a zodpovedný prístup k práci.']],
    ctaH: 'Nenašli ste svoju profesiu?', ctaP: 'Pošlite nám nezáväzný kontakt. Keď sa objaví vhodný projekt, ozveme sa Vám ako prvým.', ctaBtn: 'Nechať kontakt', call: 'Zavolať',
  },
  cz: {
    title: 'Profese – práce v Německu pro řemeslníky | punds', desc: 'Hledáme elektrikáře, svářeče, zámečníky, sádrokartonáře, malíře, zateplovače, montéry a další řemeslníky na projekty v Německu a Rakousku.',
    home: 'Domů', crumb: 'Profese', h1: 'Profese, pro které hledáme lidi', lead: 'Zaměřujeme se na řemesla na stavbách a v průmyslu. Vyberte si to své a podívejte se na aktuální nabídky.',
    n: ['nabídka', 'nabídky', 'nabídek'], ask: 'Zeptejte se', noRate: 'Sazba podle projektu', see: 'Zobrazit nabídky',
    reqK: 'Co potřebujete', reqH: 'Co od Vás očekáváme', reqP: 'Na každý projekt hledáme lidi s praxí. Konkrétní požadavky jsou vždy uvedeny u nabídky.',
    req: [['Praxe v oboru', 'Nejčastěji alespoň 2 roky na podobných projektech.'], ['Živnost', 'Pokud ji nemáte, pomůžeme s jejím založením.'], ['Certifikáty', 'U svářečů a elektrikářů platná osvědčení.'], ['Spolehlivost', 'Dochvilnost a zodpovědný přístup k práci.']],
    ctaH: 'Nenašli jste svou profesi?', ctaP: 'Pošlete nám nezávazný kontakt. Až se objeví vhodný projekt, ozveme se Vám jako prvním.', ctaBtn: 'Nechat kontakt', call: 'Zavolat',
  },
  hu: {
    title: 'Szakmák – munka Németországban szakembereknek | punds', desc: 'Villanyszerelőket, hegesztőket, lakatosokat, gipszkartonozókat, festőket, hőszigetelőket, szerelőket és más szakembereket keresünk németországi és ausztriai projektekre.',
    home: 'Kezdőlap', crumb: 'Szakmák', h1: 'Szakmák, amelyekbe embereket keresünk', lead: 'Építőipari és ipari szakmákra összpontosítunk. Válassza ki a sajátját, és nézze meg az aktuális állásokat.',
    n: ['állás', 'állás', 'állás'], ask: 'Érdeklődjön', noRate: 'Óradíj projekt szerint', see: 'Állások megtekintése',
    reqK: 'Amire szüksége lesz', reqH: 'Amit elvárunk', reqP: 'Minden projektre gyakorlott embereket keresünk. A konkrét követelmények mindig az állásnál szerepelnek.',
    req: [['Szakmai gyakorlat', 'Általában legalább 2 év hasonló projekteken.'], ['Egyéni vállalkozás', 'Ha még nincs, segítünk az indításában.'], ['Tanúsítványok', 'Hegesztőknél és villanyszerelőknél érvényes képesítés.'], ['Megbízhatóság', 'Pontosság és felelősségteljes munkavégzés.']],
    ctaH: 'Nem találta a szakmáját?', ctaP: 'Hagyja meg elérhetőségét kötelezettség nélkül. Ha lesz megfelelő projekt, elsőként Önnek szólunk.', ctaBtn: 'Elérhetőség megadása', call: 'Hívás',
  },
  de: {
    title: 'Berufe – Jobs in Deutschland für Handwerker | punds', desc: 'Wir suchen Elektriker, Schweißer, Schlosser, Trockenbauer, Maler, WDVS-Monteure, Monteure und weitere Handwerker für Projekte in Deutschland und Österreich.',
    home: 'Start', crumb: 'Berufe', h1: 'Berufe, für die wir Leute suchen', lead: 'Wir konzentrieren uns auf Handwerksberufe auf Baustellen und in der Industrie. Wählen Sie Ihren Beruf und sehen Sie sich die aktuellen Jobs an.',
    n: ['Job', 'Jobs'], ask: 'Fragen Sie uns', noRate: 'Satz je nach Projekt', see: 'Jobs ansehen',
    reqK: 'Was Sie brauchen', reqH: 'Was wir erwarten', reqP: 'Für jedes Projekt suchen wir Leute mit Erfahrung. Die genauen Anforderungen stehen immer beim Job.',
    req: [['Berufserfahrung', 'Meist mindestens 2 Jahre auf ähnlichen Projekten.'], ['Gewerbe', 'Wenn Sie noch keins haben, helfen wir bei der Anmeldung.'], ['Zertifikate', 'Bei Schweißern und Elektrikern gültige Nachweise.'], ['Zuverlässigkeit', 'Pünktlichkeit und verantwortungsvolles Arbeiten.']],
    ctaH: 'Ihr Beruf ist nicht dabei?', ctaP: 'Hinterlassen Sie uns unverbindlich Ihren Kontakt. Sobald ein passendes Projekt kommt, melden wir uns zuerst bei Ihnen.', ctaBtn: 'Kontakt hinterlassen', call: 'Anrufen',
  },
  en: {
    title: 'Trades – jobs in Germany for tradespeople | punds', desc: 'We recruit electricians, welders, metalworkers, drywall installers, painters, insulation installers, fitters and other tradespeople for projects in Germany and Austria.',
    home: 'Home', crumb: 'Trades', h1: 'Trades we recruit for', lead: 'We focus on construction and industrial trades. Pick yours and see the current openings.',
    n: ['job', 'jobs'], ask: 'Ask us', noRate: 'Rate depends on project', see: 'See jobs',
    reqK: 'What you need', reqH: 'What we expect from you', reqP: 'For every project we look for experienced people. The exact requirements are always listed with the job.',
    req: [['Experience in the trade', 'Usually at least 2 years on similar projects.'], ['Self-employment', 'If you’re not registered yet, we’ll help you set it up.'], ['Certificates', 'Valid certificates for welders and electricians.'], ['Reliability', 'Punctuality and a responsible attitude to work.']],
    ctaH: 'Didn’t find your trade?', ctaP: 'Leave us your contact, no strings attached. When a suitable project comes up, you’ll be the first to hear.', ctaBtn: 'Leave your contact', call: 'Call us',
  },
};

async function render(ctx) {
  const t = T[ctx.lang];
  const c = ctx.t;
  const jobs = await ctx.jobs();
  const jobsUrl = ctx.url('jobs');
  const info = (key) => {
    const js = jobs.filter((j) => j.prof === key);
    const lo = js.map((j) => j.rateMin).filter((n) => n != null);
    const hi = js.map((j) => j.rateMax).filter((n) => n != null);
    return { n: js.length, rate: lo.length ? rate({ rateMin: Math.min(...lo), rateMax: Math.max(...hi, ...lo) }) : '' };
  };
  const badge = (n) => (n ? `<span class="pf-badge">${n} ${esc(plural(ctx.lang, n, t.n))}</span>` : `<span class="pf-badge pf-badge-ask">${esc(t.ask)}</span>`);
  const card = (p) => {
    const x = info(p.key);
    return `<a class="pf-card lift rv" href="${esc(`${jobsUrl}?prof=${p.key}`)}">
      <span class="pf-img"><img src="${esc(PIC[p.key] || IMG.mont)}" alt="" loading="lazy" width="480" height="360">${badge(x.n)}</span>
      <div class="pf-txt"><h2 class="pf-h">${esc(PROF.nameOf(p, ctx.lang))}</h2><span class="pf-p">${esc(ABOUT[p.key][ctx.lang])}</span>
      <span class="pf-foot">${x.rate ? `<span class="pf-rate">${esc(x.rate)} <span>${esc(c.perH)}</span></span>` : `<span class="pf-norate">${esc(t.noRate)}</span>`}<span class="pf-arr" aria-hidden="true">→</span></span></div>
    </a>`;
  };
  const other = PROF.byKey('ine');
  const ox = info('ine');
  const body = `
<div class="wrap sp-head">
  <nav class="crumbs" aria-label="breadcrumb"><a href="${esc(ctx.url('home'))}">${esc(t.home)}</a><span aria-hidden="true">/</span><span class="cur" aria-current="page">${esc(t.crumb)}</span></nav>
  <div class="sp-head-in rv-in"><h1 class="sp-h1">${esc(t.h1)}</h1><p class="lead sp-lead">${esc(t.lead)}</p></div>
</div>
<section class="wrap pf-grid">
  ${each(PROF.PROFESSIONS.filter((p) => p.key !== 'ine'), card)}
  <a class="pf-card pf-other lift rv" href="${esc(`${jobsUrl}?prof=ine`)}">
    <span class="sp-dark-mark">${ghost(220)}</span>
    <span class="pf-other-top">${badge(ox.n)}</span>
    <div class="pf-txt"><h2 class="pf-h">${esc(PROF.nameOf(other, ctx.lang))}</h2><span class="pf-p">${esc(ABOUT.ine[ctx.lang])}</span>
    <span class="pf-foot"><span class="pf-see">${esc(t.see)}</span><span class="pf-arr" aria-hidden="true">→</span></span></div>
  </a>
</section>
<section class="wrap sec pf-req">
  <div class="pf-req-h rv"><span class="sp-kicker">${esc(t.reqK)}</span><h2 class="h2 sp-h2-40">${esc(t.reqH)}</h2><p>${esc(t.reqP)}</p></div>
  <div class="pf-req-grid">${each(t.req, ([h, p]) => `<div class="pf-req-c rv"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`)}</div>
</section>
<section class="wrap sec sec-last">
  <div class="sp-dark sp-banner rv"><span class="sp-dark-mark">${ghost(360)}</span>
    <div class="sp-banner-txt"><h2>${esc(t.ctaH)}</h2><p>${esc(t.ctaP)}</p></div>
    <div class="sp-banner-btns"><a class="btn btn-primary" href="${esc(ctx.url('contact'))}#form">${esc(t.ctaBtn)} →</a><a class="btn sp-btn-line" href="${tel(PHONE)}">${esc(t.call)}</a></div>
  </div>
</section>`;
  return { title: t.title, description: t.desc, body, css: ['css/sk-pages.css'], bodyClass: 'pg-prof' };
}

module.exports = render;

// Texty stránky — správa webov v appke ich môže prepísať (web/content.js).
module.exports.T = T;
