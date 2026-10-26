// ============================================================================
// punds.sk — úvodná stránka (návrh 1a, mobil 1a)
// ============================================================================
'use strict';

const { esc, each } = require('../../shared/h');
const { mark } = require('../../shared/brand');
const PROF = require('../../shared/professions');
const { IMG } = require('../../shared/jobs');
const { PHONE, PHONE2, MAIL, tel, rate } = require('../common');
const { contactForm, ICO, WA, ADDR } = require('./contact');

const T = {
  sk: {
    title: 'Práca v Nemecku pre remeselníkov | punds',
    desc: 'Dobre platená práca na stavbách v Nemecku pre remeselníkov zo Slovenska. Overené firmy, ubytovanie, platba každých 14 dní a pomoc s papiermi.',
    eyebrow: 'Práca v Nemecku pre remeselníkov', h1: 'Dobre platená práca na stavbách v Nemecku.', h1b: 'Bývanie aj papiere vybavíme my.',
    sub: 'Spájame skúsených remeselníkov s overenými nemeckými firmami. Pomôžeme s A1, Steuernummer, Freistellung aj ubytovaním.',
    ctaJobs: 'Pozrieť ponuky', call: 'Zavolať', heroAlt: 'Zvárač pri práci na stavbe v Nemecku', heroBadge: 'podľa profesie a projektu',
    marq: 'Profesie, pre ktoré hľadáme ľudí',
    ben: [['Overení partneri', 'Pracujete len pre preverené firmy.'], ['Ubytovanie', 'Zabezpečíme bývanie pri projekte.'], ['Platba každých 14 dní', 'Pravidelná fakturácia bez čakania.'], ['Pomoc s papiermi', 'Živnosť, A1 a ďalšie, aby ste riešili len prácu.']],
    jobsH: 'Aktuálne ponuky', jobsAll: 'Všetky ponuky', jobsAllS: 'Všetky',
    procH: 'Ako to funguje', procMore: 'Celý postup',
    proc: [['Ozvite sa', 'Zavolajte, napíšte alebo reagujte na ponuku.'], ['Overíme profil', 'Kvalifikácia, skúsenosti, preferencie.'], ['Ponuka a dokumenty', 'Konkrétne podmienky, pomôžeme s A1 a papiermi.'], ['Nástup', 'Ubytovanie, doprava a podpora počas projektu.']],
    conH: 'Ozvite sa nám', conSub: 'Odpovieme do 24 hodín v pracovné dni.', hours: 'Po–Pia 8:00–16:00', wa: 'Napísať na WhatsApp',
  },
  cz: {
    title: 'Práce v Německu pro řemeslníky | punds',
    desc: 'Dobře placená práce na stavbách v Německu pro řemeslníky z Česka a Slovenska. Ověřené firmy, ubytování, platba každých 14 dní a pomoc s papíry.',
    eyebrow: 'Práce v Německu pro řemeslníky', h1: 'Dobře placená práce na stavbách v Německu.', h1b: 'Ubytování i papíry vyřídíme my.',
    sub: 'Spojujeme zkušené řemeslníky s ověřenými německými firmami. Pomůžeme s A1, Steuernummer, Freistellung i ubytováním.',
    ctaJobs: 'Zobrazit nabídky', call: 'Zavolat', heroAlt: 'Svářeč při práci na stavbě v Německu', heroBadge: 'podle profese a projektu',
    marq: 'Profese, pro které hledáme lidi',
    ben: [['Ověření partneři', 'Pracujete jen pro prověřené firmy.'], ['Ubytování', 'Zajistíme bydlení u projektu.'], ['Platba každých 14 dní', 'Pravidelná fakturace bez čekání.'], ['Pomoc s papíry', 'Živnost, A1 a další, abyste řešili jen práci.']],
    jobsH: 'Aktuální nabídky', jobsAll: 'Všechny nabídky', jobsAllS: 'Všechny',
    procH: 'Jak to funguje', procMore: 'Celý postup',
    proc: [['Ozvěte se', 'Zavolejte, napište nebo reagujte na nabídku.'], ['Ověříme profil', 'Kvalifikace, zkušenosti, preference.'], ['Nabídka a dokumenty', 'Konkrétní podmínky, pomůžeme s A1 a papíry.'], ['Nástup', 'Ubytování, doprava a podpora během projektu.']],
    conH: 'Ozvěte se nám', conSub: 'Odpovíme do 24 hodin v pracovní dny.', hours: 'Po–Pá 8:00–16:00', wa: 'Napsat na WhatsApp',
  },
  hu: {
    title: 'Munka Németországban szakembereknek | punds',
    desc: 'Jól fizető építőipari munka Németországban szlovákiai és magyarországi szakembereknek. Ellenőrzött cégek, szállás, fizetés 14 naponta és segítség az iratokkal.',
    eyebrow: 'Munka Németországban szakembereknek', h1: 'Jól fizető építőipari munka Németországban.', h1b: 'A szállást és a papírokat mi intézzük.',
    sub: 'Tapasztalt szakembereket kötünk össze ellenőrzött német cégekkel. Segítünk az A1, a Steuernummer, a Freistellung és a szállás ügyében.',
    ctaJobs: 'Állások megtekintése', call: 'Hívás', heroAlt: 'Hegesztő munka közben egy németországi építkezésen', heroBadge: 'szakma és projekt szerint',
    marq: 'Szakmák, amelyekbe embereket keresünk',
    ben: [['Ellenőrzött partnerek', 'Csak megbízható cégeknek dolgozik.'], ['Szállás', 'Lakhatás a projekt közelében.'], ['Fizetés 14 naponta', 'Rendszeres számlázás, várakozás nélkül.'], ['Segítség az iratokkal', 'Vállalkozás, A1 és a többi – Önnek csak a munkával kell foglalkoznia.']],
    jobsH: 'Aktuális állások', jobsAll: 'Összes állás', jobsAllS: 'Összes',
    procH: 'Hogyan működik', procMore: 'A teljes folyamat',
    proc: [['Jelentkezzen', 'Hívjon, írjon, vagy válaszoljon egy hirdetésre.'], ['Profil ellenőrzése', 'Képesítés, tapasztalat, elvárások.'], ['Ajánlat és iratok', 'Konkrét feltételek, segítünk az A1-gyel és a papírokkal.'], ['Munkakezdés', 'Szállás, utazás és támogatás a projekt alatt.']],
    conH: 'Írjon nekünk', conSub: 'Munkanapokon 24 órán belül válaszolunk.', hours: 'H–P 8:00–16:00', wa: 'Írás WhatsAppon',
  },
  de: {
    title: 'Jobs in Deutschland für Handwerker | punds',
    desc: 'Gut bezahlte Arbeit auf deutschen Baustellen für Handwerker aus der Slowakei, Tschechien und Ungarn. Geprüfte Firmen, Unterkunft, Zahlung alle 14 Tage und Hilfe mit den Papieren.',
    eyebrow: 'Jobs in Deutschland für Handwerker', h1: 'Gut bezahlte Arbeit auf deutschen Baustellen.', h1b: 'Unterkunft und Papiere übernehmen wir.',
    sub: 'Wir verbinden erfahrene Handwerker mit geprüften deutschen Firmen und helfen bei A1, Steuernummer, Freistellung und Unterkunft.',
    ctaJobs: 'Jobs ansehen', call: 'Anrufen', heroAlt: 'Schweißer bei der Arbeit auf einer Baustelle in Deutschland', heroBadge: 'je nach Beruf und Projekt',
    marq: 'Berufe, für die wir Leute suchen',
    ben: [['Geprüfte Partner', 'Sie arbeiten nur für verlässliche Firmen.'], ['Unterkunft', 'Wir organisieren das Wohnen am Projekt.'], ['Zahlung alle 14 Tage', 'Regelmäßige Abrechnung ohne Wartezeit.'], ['Hilfe mit Papieren', 'Gewerbe, A1 und mehr – Sie kümmern sich nur um die Arbeit.']],
    jobsH: 'Aktuelle Jobs', jobsAll: 'Alle Jobs', jobsAllS: 'Alle',
    procH: 'So funktioniert’s', procMore: 'Der ganze Ablauf',
    proc: [['Melden Sie sich', 'Anrufen, schreiben oder auf eine Anzeige reagieren.'], ['Profilprüfung', 'Qualifikation, Erfahrung, Wünsche.'], ['Angebot und Dokumente', 'Konkrete Konditionen, wir helfen bei A1 und Papieren.'], ['Projektstart', 'Unterkunft, Anreise und Betreuung vor Ort.']],
    conH: 'Schreiben Sie uns', conSub: 'Antwort innerhalb von 24 Stunden an Werktagen.', hours: 'Mo–Fr 8:00–16:00', wa: 'Per WhatsApp schreiben',
  },
  en: {
    title: 'Jobs in Germany for tradespeople | punds',
    desc: 'Well-paid construction work in Germany for tradespeople from Slovakia, Czechia and Hungary. Vetted companies, accommodation, paid every 14 days and help with paperwork.',
    eyebrow: 'Jobs in Germany for tradespeople', h1: 'Well-paid construction work in Germany.', h1b: 'We handle housing and paperwork.',
    sub: 'We connect skilled tradespeople with vetted German companies, and help with A1, Steuernummer, Freistellung and accommodation.',
    ctaJobs: 'See jobs', call: 'Call us', heroAlt: 'Welder at work on a construction site in Germany', heroBadge: 'depending on trade and project',
    marq: 'Trades we recruit for',
    ben: [['Vetted partners', 'You only work for companies we’ve checked.'], ['Accommodation', 'Housing arranged near the site.'], ['Paid every 14 days', 'Regular invoicing, no waiting.'], ['Help with paperwork', 'Self-employment, A1 and more – so you can focus on the job.']],
    jobsH: 'Open positions', jobsAll: 'All jobs', jobsAllS: 'All',
    procH: 'How it works', procMore: 'The full process',
    proc: [['Get in touch', 'Call, write or reply to a job ad.'], ['Profile check', 'Qualifications, experience, preferences.'], ['Offer and documents', 'Clear terms; we help with A1 and paperwork.'], ['Start', 'Housing, travel and support on site.']],
    conH: 'Get in touch', conSub: 'We reply within 24 hours on working days.', hours: 'Mon–Fri 8:00–16:00', wa: 'Message us on WhatsApp',
  },
};

const pad = (i) => String(i + 1).padStart(2, '0');
const callIco = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 3.5h3.2l1.6 4.2-2 1.3a11 11 0 0 0 5.2 5.2l1.3-2 4.2 1.6V17a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 3 5.7 2 2 0 0 1 5 3.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

/** Rozpätie sadzieb zo všetkých ponúk (pre odznak v hlavičke); bez ponúk podľa návrhu. */
function heroRate(jobs) {
  const lo = jobs.map((j) => j.rateMin).filter((n) => n != null);
  const hi = jobs.map((j) => j.rateMax).filter((n) => n != null);
  if (!lo.length) return '24–30 €';
  return rate({ rateMin: Math.min(...lo), rateMax: Math.max(...hi, ...lo) });
}

/** Karta ponuky (úvod). */
function jobCard(ctx, j) {
  const c = ctx.t;
  const r = rate(j);
  return `<a class="hm-job lift rv" href="${esc(ctx.url('job', { slug: j.slug }))}">
    <span class="hm-job-img"><img src="${esc(j.image)}" alt="" loading="lazy" width="480" height="360">${r ? `<span class="hm-rate">${esc(r)} <span>${esc(c.perH)}</span></span>` : ''}</span>
    <span class="hm-job-txt"><strong>${esc(j.title)}</strong><span>${esc(j.city)}${j.city ? ' · ' : ''}${esc(c.trade)}</span>${j.demo ? `<span class="demo-tag">${esc(c.demo)}</span>` : ''}</span>
  </a>`;
}

async function render(ctx) {
  const t = T[ctx.lang];
  const c = ctx.t;
  const jobs = await ctx.jobs();
  const jobsUrl = ctx.url('jobs');
  const profs = PROF.PROFESSIONS.filter((p) => p.key !== 'ine').map((p) => PROF.nameOf(p, ctx.lang));
  const marqItem = (n) => `<span class="hm-marq-i">${esc(n)}<span class="hm-dot"></span></span>`;

  const body = `
<section class="wrap hm-hero">
  <div class="hm-hero-txt rv-in">
    <span class="pill"><span class="pill-mark">${mark({ w: 13, light: true })}</span>${esc(t.eyebrow)}</span>
    <h1 class="h1 hm-h1">${esc(t.h1)} <span class="or">${esc(t.h1b)}</span></h1>
    <p class="lead hm-sub">${esc(t.sub)}</p>
    <div class="hm-ctas"><a class="btn btn-primary" href="${esc(jobsUrl)}">${esc(t.ctaJobs)} →</a><a class="btn btn-ghost" href="${tel(PHONE)}">${esc(t.call)} · ${PHONE}</a></div>
  </div>
  <div class="hm-hero-img rv-in d1">
    <img src="${IMG.weld}" alt="${esc(t.heroAlt)}" width="960" height="680" fetchpriority="high">
    <div class="hm-badge floaty"><strong>${esc(heroRate(jobs))} ${esc(c.perH)}</strong><span>${esc(t.heroBadge)}</span></div>
  </div>
</section>
<div class="hm-marq" role="region" aria-label="${esc(t.marq)}">
  <div class="hm-marq-track"><div class="hm-marq-set">${each(profs, marqItem)}</div><div class="hm-marq-set" aria-hidden="true">${each(profs, marqItem)}</div></div>
</div>
<section class="wrap hm-ben">
  ${each(t.ben, ([h, p], i) => `<div class="card lift rv hm-ben-c"><span class="hm-n">${pad(i)}</span><h3 class="h3">${esc(h)}</h3><p>${esc(p)}</p></div>`)}
</section>
${jobs.length ? `<section class="wrap sec hm-jobs" aria-labelledby="hm-jobs-h">
  <div class="sec-head"><h2 class="h2" id="hm-jobs-h">${esc(t.jobsH)}</h2><a class="link-u hm-all" href="${esc(jobsUrl)}"><span class="hm-all-l">${esc(t.jobsAll)}</span><span class="hm-all-s">${esc(t.jobsAllS)}</span> →</a></div>
  <div class="hm-jobs-grid">${each(jobs.slice(0, 4), (j) => jobCard(ctx, j))}</div>
</section>` : ''}
<section class="wrap sec hm-proc" aria-labelledby="hm-proc-h">
  <div class="sec-head"><h2 class="h2" id="hm-proc-h">${esc(t.procH)}</h2><a class="link-u hm-proc-more" href="${esc(ctx.url('how'))}">${esc(t.procMore)} →</a></div>
  <ol class="hm-steps">${each(t.proc, ([h, p], i) => `<li class="hm-step rv"><span class="hm-step-top"><span class="hm-step-n">${i + 1}</span><span class="hm-step-line"></span></span><span class="hm-step-txt"><strong>${esc(h)}</strong><span>${esc(p)}</span></span></li>`)}</ol>
</section>
<section class="wrap sec sec-last hm-con" id="kontakt" aria-labelledby="hm-con-h">
  <div class="hm-con-info rv">
    <h2 class="h2" id="hm-con-h">${esc(t.conH)}</h2>
    <p class="hm-con-sub">${esc(t.conSub)}</p>
    <a class="hm-tel" href="${tel(PHONE)}">${PHONE}</a>
    <a class="hm-tel" href="${tel(PHONE2)}">${PHONE2}</a>
    <div class="hm-con-btns"><a class="btn hm-btn-white" href="${tel(PHONE)}">${callIco}${PHONE}</a><a class="btn btn-wa" href="${WA}" target="_blank" rel="noopener">${ICO.wa}${esc(t.wa)}</a></div>
    <a class="hm-mail" href="mailto:${MAIL}">${MAIL}</a>
    <p class="hm-addr">Partner und Service s. r. o.<br>${esc(ADDR)}<br>${esc(t.hours)}</p>
  </div>
  <div class="card sp-formcard hm-formcard rv">${contactForm(ctx)}</div>
</section>`;

  const after = `<div class="mcta"><a class="btn btn-primary" href="${esc(jobsUrl)}">${esc(t.ctaJobs)} →</a><a class="btn btn-dark btn-call" href="${tel(PHONE)}" aria-label="${esc(t.call)} ${PHONE}">${callIco}</a></div>`;
  return { title: t.title, description: t.desc, body, after, css: ['css/sk-pages.css'], bodyClass: 'has-mcta pg-home', image: IMG.weld };
}

module.exports = render;

// Texty stránky — správa webov v appke ich môže prepísať (web/content.js).
module.exports.T = T;
