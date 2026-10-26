// ============================================================================
// punds.sk — spoločné texty, hlavička a päta
// ============================================================================
// Oslovujeme vykaním (Vy) vo všetkých jazykoch, ktoré ho majú.
// ============================================================================
'use strict';

const { esc, each, plural } = require('../shared/h');
const { logo } = require('../shared/brand');
const { LANGS } = require('../shared/sites');
const PROF = require('../shared/professions');
const { icon } = require('../shared/icons');

const PHONE = '+421 910 523 858', PHONE2 = '+421 910 523 958', MAIL = 'info@punds.sk';
const tel = (p) => `tel:${p.replace(/\s+/g, '')}`;

const T = {
  sk: {
    skip: 'Preskočiť na obsah', menu: 'Menu', close: 'Zavrieť',
    nav: { jobs: 'Ponuky', professions: 'Profesie', about: 'O nás', how: 'Ako to funguje', contact: 'Kontakt' },
    cta: 'Mám záujem', call: 'Zavolať',
    mega: { prof: 'Podľa profesie', city: 'Podľa lokality', top: 'Najnovšie ponuky', all: 'Všetky ponuky', map: 'Zobraziť na mape', note: 'Nové projekty pribúdajú každý týždeň.' },
    perH: '/ hod.', trade: 'Živnosť', now: 'Nástup ihneď', from: 'Od', demo: 'Ukážka',
    jobsN: ['ponuka', 'ponuky', 'ponúk'],
    foot: { privacy: 'Ochrana osobných údajov', cookies: 'Cookies', b2b: 'Pre firmy v Nemecku' },
    lang: 'Jazyk',
    js: { sending: 'Odosielam…', error: 'Niečo sa nepodarilo. Skúste to prosím znova alebo nám zavolajte.', required: 'Vyplňte prosím toto pole.', consent: 'Bez súhlasu so spracovaním údajov to nevieme prijať.', phone: 'Skontrolujte prosím telefónne číslo.', email: 'Skontrolujte prosím e-mail.', copied: 'Skopírované' },
  },
  cz: {
    skip: 'Přeskočit na obsah', menu: 'Menu', close: 'Zavřít',
    nav: { jobs: 'Nabídky', professions: 'Profese', about: 'O nás', how: 'Jak to funguje', contact: 'Kontakt' },
    cta: 'Mám zájem', call: 'Zavolat',
    mega: { prof: 'Podle profese', city: 'Podle lokality', top: 'Nejnovější nabídky', all: 'Všechny nabídky', map: 'Zobrazit na mapě', note: 'Nové projekty přibývají každý týden.' },
    perH: '/ hod.', trade: 'Živnost', now: 'Nástup ihned', from: 'Od', demo: 'Ukázka',
    jobsN: ['nabídka', 'nabídky', 'nabídek'],
    foot: { privacy: 'Ochrana osobních údajů', cookies: 'Cookies', b2b: 'Pro firmy v Německu' },
    lang: 'Jazyk',
    js: { sending: 'Odesílám…', error: 'Něco se nepovedlo. Zkuste to prosím znovu nebo nám zavolejte.', required: 'Vyplňte prosím toto pole.', consent: 'Bez souhlasu se zpracováním údajů to nemůžeme přijmout.', phone: 'Zkontrolujte prosím telefonní číslo.', email: 'Zkontrolujte prosím e-mail.', copied: 'Zkopírováno' },
  },
  hu: {
    skip: 'Ugrás a tartalomra', menu: 'Menü', close: 'Bezárás',
    nav: { jobs: 'Állások', professions: 'Szakmák', about: 'Rólunk', how: 'Hogyan működik', contact: 'Kapcsolat' },
    cta: 'Érdekel', call: 'Hívás',
    mega: { prof: 'Szakma szerint', city: 'Helyszín szerint', top: 'Legújabb állások', all: 'Összes állás', map: 'Térképen', note: 'Hetente érkeznek új projektek.' },
    perH: '/ óra', trade: 'Egyéni vállalkozó', now: 'Azonnali kezdés', from: 'Kezdés:', demo: 'Minta',
    jobsN: ['állás', 'állás', 'állás'],
    foot: { privacy: 'Adatvédelem', cookies: 'Cookie-k', b2b: 'Németországi cégeknek' },
    lang: 'Nyelv',
    js: { sending: 'Küldés…', error: 'Valami nem sikerült. Kérjük, próbálja újra, vagy hívjon minket.', required: 'Kérjük, töltse ki ezt a mezőt.', consent: 'Az adatkezelési hozzájárulás nélkül nem tudjuk fogadni.', phone: 'Kérjük, ellenőrizze a telefonszámot.', email: 'Kérjük, ellenőrizze az e-mail-címet.', copied: 'Másolva' },
  },
  de: {
    skip: 'Zum Inhalt springen', menu: 'Menü', close: 'Schließen',
    nav: { jobs: 'Jobs', professions: 'Berufe', about: 'Über uns', how: 'Ablauf', contact: 'Kontakt' },
    cta: 'Jetzt bewerben', call: 'Anrufen',
    mega: { prof: 'Nach Beruf', city: 'Nach Ort', top: 'Neueste Jobs', all: 'Alle Jobs', map: 'Auf der Karte', note: 'Jede Woche kommen neue Projekte dazu.' },
    perH: '/ Std.', trade: 'Selbstständig', now: 'Sofortiger Start', from: 'Ab', demo: 'Beispiel',
    jobsN: ['Job', 'Jobs', 'Jobs'],
    foot: { privacy: 'Datenschutz', cookies: 'Cookies', b2b: 'Für Firmen in Deutschland' },
    lang: 'Sprache',
    js: { sending: 'Wird gesendet…', error: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut oder rufen Sie uns an.', required: 'Bitte füllen Sie dieses Feld aus.', consent: 'Ohne Einwilligung in die Datenverarbeitung können wir das nicht annehmen.', phone: 'Bitte prüfen Sie die Telefonnummer.', email: 'Bitte prüfen Sie die E-Mail-Adresse.', copied: 'Kopiert' },
  },
  en: {
    skip: 'Skip to content', menu: 'Menu', close: 'Close',
    nav: { jobs: 'Jobs', professions: 'Trades', about: 'About us', how: 'How it works', contact: 'Contact' },
    cta: 'Apply now', call: 'Call us',
    mega: { prof: 'By trade', city: 'By location', top: 'Latest jobs', all: 'All jobs', map: 'View on map', note: 'New projects every week.' },
    perH: '/ hr', trade: 'Self-employed', now: 'Start now', from: 'From', demo: 'Example',
    jobsN: ['job', 'jobs', 'jobs'],
    foot: { privacy: 'Privacy policy', cookies: 'Cookies', b2b: 'For companies in Germany' },
    lang: 'Language',
    js: { sending: 'Sending…', error: 'Something went wrong. Please try again or give us a call.', required: 'Please fill in this field.', consent: 'We can’t accept this without your consent to data processing.', phone: 'Please check the phone number.', email: 'Please check the email address.', copied: 'Copied' },
  },
};

/** Sadzba: „24–27 €" (bez „/ hod."). */
function rate(job) {
  if (job.rateMin == null) return '';
  const f = (n) => String(n).replace('.', ',');
  return job.rateMax != null && job.rateMax !== job.rateMin ? `${f(job.rateMin)}–${f(job.rateMax)} €` : `${f(job.rateMin)} €`;
}
/** Nástup: „Nástup ihneď" alebo dátum v tvare jazyka — „Od 3. 11.", „Kezdés: 11. 3.", „Ab 3.11.", „From 3 Nov". */
function start(job, t, lang) {
  if (job.startNow || !job.startDate) return t.now;
  const d = new Date(job.startDate);
  const D = d.getDate(), M = d.getMonth() + 1;
  const l = lang || (t === T.hu ? 'hu' : t === T.de ? 'de' : t === T.en ? 'en' : 'sk');
  if (l === 'hu') return `${t.from} ${M}. ${D}.`;
  if (l === 'de') return `${t.from} ${D}.${M}.`;
  if (l === 'en') return `${t.from} ${D} ${d.toLocaleString('en-GB', { month: 'short' })}`;
  return `${t.from} ${D}. ${M}.`;
}

/** Profesie a mestá so súčtom ponúk — pre mega menu a filter. */
function facets(jobs, lang) {
  const prof = PROF.PROFESSIONS.map((p) => ({ key: p.key, name: PROF.nameOf(p, lang), n: jobs.filter((j) => j.prof === p.key).length }))
    .filter((x) => x.n);
  const cities = [...new Set(jobs.map((j) => j.city).filter(Boolean))].map((c) => ({ key: c, name: c, n: jobs.filter((j) => j.city === c).length }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  return { prof, cities };
}

const chev = '<svg class="chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const flag = (ctx, l) => `<img class="flag" src="${ctx.asset(`flags/${LANGS[l].flag}.svg`)}" alt="" width="22" height="16">`;

/** Výber jazyka — rovnaký na oboch weboch. */
function langMenu(ctx, { dark = false } = {}) {
  const cur = LANGS[ctx.lang];
  return `<div class="lang${dark ? ' lang-dark' : ''}" data-dropdown>
    <button type="button" class="lang-btn" aria-haspopup="true" aria-expanded="false" aria-label="${esc((ctx.t || {}).lang || 'Language')}: ${esc(cur.name)}">${flag(ctx, ctx.lang)}<span>${cur.label}</span>${chev}</button>
    <div class="lang-panel" role="menu">${each(ctx.site.langs, (l) => {
      const href = ctx.url(ctx.route, ctx.paramsIn(l), l) || ctx.url('home', {}, l);
      return `<a role="menuitem" class="lang-item${l === ctx.lang ? ' on' : ''}" href="${esc(href)}" hreflang="${LANGS[l].html}" lang="${LANGS[l].html}">${flag(ctx, l)}<span class="lang-name">${esc(LANGS[l].name)}</span><span class="lang-code">${LANGS[l].label}</span><span class="lang-chk" aria-hidden="true">${icon('check')}</span></a>`;
    })}</div>
  </div>`;
}

async function header(ctx, page) {
  const t = T[ctx.lang];
  const jobs = await ctx.jobs();
  const fc = facets(jobs, ctx.lang);
  const jobsUrl = ctx.url('jobs');
  const active = page.nav || ctx.route;
  const link = (route) => `<a href="${esc(ctx.url(route))}" class="nav-a${active === route ? ' on' : ''}">${esc(t.nav[route])}</a>`;
  const q = (k, v) => `${jobsUrl}?${k}=${encodeURIComponent(v)}`;
  return `<header class="hdr hdr-sk" data-header>
  <div class="hdr-in">
    ${logo({ href: ctx.url('home') })}
    <nav class="nav" aria-label="Menu">
      <button type="button" class="nav-a nav-mega${active === 'jobs' || active === 'job' ? ' on' : ''}" data-mega-btn aria-expanded="false" aria-controls="mega">${esc(t.nav.jobs)}${chev}</button>
      ${link('professions')}${link('about')}${link('how')}${link('contact')}
    </nav>
    ${langMenu(ctx)}
    <a class="btn btn-dark btn-hdr" href="${esc(ctx.url('contact'))}#form">${esc(t.cta)} →</a>
    <button type="button" class="burger" data-burger aria-label="${esc(t.menu)}" aria-expanded="false"><span></span><span></span><span></span></button>
  </div>
  <div class="mega" id="mega" data-mega hidden>
    <div class="mega-card">
      <div class="mega-grid">
        <div class="mega-col"><span class="eyebrow">${esc(t.mega.prof)}</span>
          <div class="mega-list">${each(fc.prof, (p) => `<a href="${esc(q('prof', p.key))}"><span>${esc(p.name)}</span><span class="count">${p.n}</span></a>`)}</div></div>
        <div class="mega-col"><span class="eyebrow">${esc(t.mega.city)}</span>
          <div class="mega-list">${each(fc.cities.slice(0, 8), (c) => `<a href="${esc(q('city', c.key))}"><span>${esc(c.name)}</span><span class="count">${c.n}</span></a>`)}</div></div>
        <div class="mega-col"><span class="eyebrow">${esc(t.mega.top)}</span>
          ${each(jobs.slice(0, 3), (j) => `<a class="mega-job" href="${esc(ctx.url('job', { slug: j.slug }))}"><img src="${esc(j.image)}" alt="" loading="lazy" width="84" height="62"><span class="mega-job-txt"><strong>${esc(j.title)}</strong><span>${esc(j.city)} · ${esc(start(j, t))}</span></span><span class="mega-rate">${esc(rate(j))}</span></a>`)}
        </div>
      </div>
      <div class="mega-bar"><span>${esc(t.mega.note)}</span>
        <span class="mega-bar-acts"><a class="btn btn-ghost btn-sm" href="${esc(jobsUrl)}?view=map"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 14.5s5-4.6 5-8.3a5 5 0 1 0-10 0c0 3.7 5 8.3 5 8.3Z" stroke="#F07F1A" stroke-width="1.8"/><circle cx="8" cy="6.2" r="1.8" fill="#F07F1A"/></svg>${esc(t.mega.map)}</a>
        <a class="btn btn-dark btn-sm" href="${esc(jobsUrl)}">${esc(t.mega.all)} →</a></span></div>
    </div>
  </div>
</header>
  <div class="mnav mnav-sk" data-mnav hidden>
    <div class="mnav-in">
      <details class="mnav-acc" open><summary>${esc(t.nav.jobs)}${chev}</summary>
        <div class="chips">${each(fc.prof, (p) => `<a class="chip" href="${esc(q('prof', p.key))}">${esc(p.name)} <span class="count">${p.n}</span></a>`)}</div>
        <div class="chips">${each(fc.cities.slice(0, 8), (c) => `<a class="chip" href="${esc(q('city', c.key))}">${esc(c.name)} <span class="count">${c.n}</span></a>`)}</div>
        <a class="mnav-all" href="${esc(jobsUrl)}">${esc(t.mega.all)} →</a>
      </details>
      ${each(['professions', 'about', 'how', 'contact'], (r) => `<a class="mnav-a" href="${esc(ctx.url(r))}">${esc(t.nav[r])}</a>`)}
      <div class="mnav-langs">${each(ctx.site.langs, (l) => `<a class="${l === ctx.lang ? 'on' : ''}" href="${esc(ctx.url(ctx.route, ctx.paramsIn(l), l) || ctx.url('home', {}, l))}">${flag(ctx, l)}${esc(LANGS[l].name)}</a>`)}</div>
      <div class="mnav-ctas"><a class="btn btn-primary" href="${esc(jobsUrl)}">${esc(t.mega.all)} →</a><a class="btn btn-ghost" href="${tel(PHONE)}">${esc(t.call)} · ${PHONE}</a></div>
    </div>
  </div>
`;
}

function footer(ctx) {
  const t = T[ctx.lang];
  const eu = ctx.prod ? 'https://punds.eu/' + (ctx.lang === 'en' ? 'en/' : 'de/') : `/punds-eu/${ctx.lang === 'en' ? 'en' : 'de'}/`;
  return `<footer class="ftr">
  <div class="ftr-in">
    ${logo({ href: ctx.url('home'), light: true, draw: false })}
    <nav class="ftr-links"><a href="${esc(ctx.url('privacy'))}">${esc(t.foot.privacy)}</a><a href="${esc(ctx.url('cookies'))}">${esc(t.foot.cookies)}</a></nav>
    <span class="ftr-copy">© ${new Date().getFullYear()} Partner und Service s. r. o. · IČO 57553921</span>
    <a class="ftr-x" href="${esc(eu)}">${esc(t.foot.b2b)} → <span>punds.eu</span></a>
  </div>
</footer>`;
}

module.exports = { T, PHONE, PHONE2, MAIL, tel, rate, start, facets, header, footer, langMenu, chev, flag, plural };
