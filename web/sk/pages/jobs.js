// ============================================================================
// punds.sk — zoznam ponúk s filtrom a mapou (návrh 2a, mobil 1c)
// ============================================================================
// Server vykreslí celý zoznam (funguje aj bez JS a pre vyhľadávače) už
// prefiltrovaný podľa adresy: ?prof=zvarac,elektrikar&city=Bremen&now=1
// &min=25&sort=rate&view=map&mapcity=Bremen. Odkazy z mega menu (?prof=,
// ?city=, ?view=map) teda fungujú hneď. Filtrovanie bez načítania stránky
// robí public/js/sk-jobs.js nad dátami v <script id="jobs-data">.
// Počty pri možnostiach filtra = ponuky, ktoré spĺňajú všetky OSTATNÉ filtre.
// ============================================================================
'use strict';

const { esc, each, cls, plural, LOCALE } = require('../../shared/h');
const PROF = require('../../shared/professions');
const { icon } = require('../../shared/icons');
const { T: C, rate, start, facets } = require('../common');

const MIN = 20, MAX = 33;

const T = {
  sk: {
    title: 'Ponuky práce v Nemecku pre remeselníkov | punds',
    desc: 'Aktuálne ponuky práce v Nemecku pre elektrikárov, zváračov, sadrokartonistov, maliarov a ďalšie remeslá. Ubytovanie a papiere vybavíme za Vás.',
    home: 'Domov', h1: 'Práca v Nemecku', sub: 'Overené projekty pre remeselníkov. Ubytovanie a papiere riešime za Vás.',
    list: 'Zoznam', map: 'Mapa', views: 'Zobrazenie', filter: 'Filter', reset: 'Zrušiť všetko',
    prof: 'Profesia', city: 'Lokalita', cityM: 'Mesto', start: 'Nástup', any: 'Kedykoľvek', now: 'Ihneď',
    minRate: 'Minimálna sadzba', noLimit: 'Bez obmedzenia', from: (n) => `od ${n} €`,
    sort: 'Zoradiť:', sortNew: 'Najnovšie', sortRate: 'Najvyššia sadzba', sortStart: 'Najskorší nástup',
    accom: 'Ubytovanie zabezpečené', detail: 'Detail',
    emptyH: 'Na tento výber momentálne nemáme ponuku', emptyP: 'Nechajte nám kontakt a ozveme sa, keď sa niečo objaví.', emptyBtn: 'Zrušiť filter', emptyC: 'Nechať kontakt',
    emptyHm: 'Nič sme nenašli', emptyPm: 'Skúste zmeniť filter.',
    mapHint: 'Kliknite na mesto a zobrazia sa ponuky z neho', mapHintM: 'Ťuknite na mesto', mapAll: 'Všetky ponuky na mape', allCities: 'Všetky mestá', mapLabel: 'Mapa ponúk',
    show: (s) => `Zobraziť ${s}`, apply: 'Použiť filter', remove: 'Odstrániť',
    ctaH: 'Nenašli ste svoju profesiu?', ctaP: 'Pošlite nám kontakt. Nové projekty pribúdajú každý týždeň.', ctaB: 'Nechať kontakt',
  },
  cz: {
    title: 'Nabídky práce v Německu pro řemeslníky | punds',
    desc: 'Aktuální nabídky práce v Německu pro elektrikáře, svářeče, sádrokartonáře, malíře a další řemesla. Ubytování a papíry vyřídíme za Vás.',
    home: 'Domů', h1: 'Práce v Německu', sub: 'Ověřené projekty pro řemeslníky. Ubytování a papíry řešíme za Vás.',
    list: 'Seznam', map: 'Mapa', views: 'Zobrazení', filter: 'Filtr', reset: 'Zrušit vše',
    prof: 'Profese', city: 'Lokalita', cityM: 'Město', start: 'Nástup', any: 'Kdykoli', now: 'Ihned',
    minRate: 'Minimální sazba', noLimit: 'Bez omezení', from: (n) => `od ${n} €`,
    sort: 'Řadit:', sortNew: 'Nejnovější', sortRate: 'Nejvyšší sazba', sortStart: 'Nejdřívější nástup',
    accom: 'Ubytování zajištěno', detail: 'Detail',
    emptyH: 'Pro tento výběr momentálně nemáme nabídku', emptyP: 'Nechte nám kontakt a ozveme se, jakmile se něco objeví.', emptyBtn: 'Zrušit filtr', emptyC: 'Nechat kontakt',
    emptyHm: 'Nic jsme nenašli', emptyPm: 'Zkuste změnit filtr.',
    mapHint: 'Klikněte na město a zobrazí se jeho nabídky', mapHintM: 'Klepněte na město', mapAll: 'Všechny nabídky na mapě', allCities: 'Všechna města', mapLabel: 'Mapa nabídek',
    show: (s) => `Zobrazit ${s}`, apply: 'Použít filtr', remove: 'Odebrat',
    ctaH: 'Nenašli jste svou profesi?', ctaP: 'Pošlete nám kontakt. Nové projekty přibývají každý týden.', ctaB: 'Nechat kontakt',
  },
  hu: {
    title: 'Munka Németországban szakembereknek | punds',
    desc: 'Aktuális németországi állások villanyszerelőknek, hegesztőknek, gipszkartonozóknak, festőknek és más szakembereknek. A szállást és a papírokat mi intézzük.',
    home: 'Főoldal', h1: 'Munka Németországban', sub: 'Ellenőrzött projektek szakembereknek. A szállást és a papírokat mi intézzük Ön helyett.',
    list: 'Lista', map: 'Térkép', views: 'Nézet', filter: 'Szűrő', reset: 'Összes törlése',
    prof: 'Szakma', city: 'Helyszín', cityM: 'Város', start: 'Kezdés', any: 'Bármikor', now: 'Azonnal',
    minRate: 'Minimális óradíj', noLimit: 'Nincs korlát', from: (n) => `${n} €-tól`,
    sort: 'Rendezés:', sortNew: 'Legújabb', sortRate: 'Legmagasabb óradíj', sortStart: 'Legkorábbi kezdés',
    accom: 'Szállás biztosítva', detail: 'Részletek',
    emptyH: 'Erre a szűrésre jelenleg nincs állásunk', emptyP: 'Hagyja meg elérhetőségét, és jelentkezünk, amint lesz megfelelő ajánlat.', emptyBtn: 'Szűrő törlése', emptyC: 'Kapcsolatfelvétel',
    emptyHm: 'Nincs találat', emptyPm: 'Próbálja módosítani a szűrőt.',
    mapHint: 'Kattintson egy városra az ottani állásokért', mapHintM: 'Koppintson egy városra', mapAll: 'Összes állás a térképen', allCities: 'Összes város', mapLabel: 'Állások térképe',
    show: (s) => `${s} megjelenítése`, apply: 'Szűrés', remove: 'Eltávolítás',
    ctaH: 'Nem találta a szakmáját?', ctaP: 'Küldje el elérhetőségét. Hetente érkeznek új projektek.', ctaB: 'Kapcsolatfelvétel',
  },
  de: {
    title: 'Jobs in Deutschland für Handwerker | punds',
    desc: 'Aktuelle Jobs in Deutschland für Elektriker, Schweißer, Trockenbauer, Maler und weitere Gewerke. Unterkunft und Papiere übernehmen wir für Sie.',
    home: 'Startseite', h1: 'Arbeit in Deutschland', sub: 'Geprüfte Projekte für Handwerker. Unterkunft und Papiere übernehmen wir für Sie.',
    list: 'Liste', map: 'Karte', views: 'Ansicht', filter: 'Filter', reset: 'Alle zurücksetzen',
    prof: 'Beruf', city: 'Ort', cityM: 'Stadt', start: 'Start', any: 'Jederzeit', now: 'Sofort',
    minRate: 'Mindeststundensatz', noLimit: 'Ohne Begrenzung', from: (n) => `ab ${n} €`,
    sort: 'Sortieren:', sortNew: 'Neueste', sortRate: 'Höchster Satz', sortStart: 'Frühester Start',
    accom: 'Unterkunft gestellt', detail: 'Details',
    emptyH: 'Für diese Auswahl haben wir derzeit kein Angebot', emptyP: 'Hinterlassen Sie uns Ihren Kontakt – wir melden uns, sobald etwas frei wird.', emptyBtn: 'Filter zurücksetzen', emptyC: 'Kontakt hinterlassen',
    emptyHm: 'Nichts gefunden', emptyPm: 'Ändern Sie bitte den Filter.',
    mapHint: 'Klicken Sie auf eine Stadt, um ihre Jobs zu sehen', mapHintM: 'Tippen Sie auf eine Stadt', mapAll: 'Alle Jobs auf der Karte', allCities: 'Alle Städte', mapLabel: 'Jobkarte',
    show: (s) => `${s} anzeigen`, apply: 'Filter anwenden', remove: 'Entfernen',
    ctaH: 'Ihren Beruf nicht gefunden?', ctaP: 'Senden Sie uns Ihren Kontakt. Jede Woche kommen neue Projekte dazu.', ctaB: 'Kontakt hinterlassen',
  },
  en: {
    title: 'Jobs in Germany for tradespeople | punds',
    desc: 'Current jobs in Germany for electricians, welders, drywall installers, painters and other trades. We take care of housing and paperwork for you.',
    home: 'Home', h1: 'Work in Germany', sub: 'Vetted projects for tradespeople. We take care of housing and paperwork for you.',
    list: 'List', map: 'Map', views: 'View', filter: 'Filter', reset: 'Clear all',
    prof: 'Trade', city: 'Location', cityM: 'City', start: 'Start', any: 'Any time', now: 'Now',
    minRate: 'Minimum rate', noLimit: 'No limit', from: (n) => `from ${n} €`,
    sort: 'Sort:', sortNew: 'Newest', sortRate: 'Highest rate', sortStart: 'Earliest start',
    accom: 'Accommodation provided', detail: 'Details',
    emptyH: 'No jobs match this selection right now', emptyP: 'Leave us your details and we’ll get in touch when something comes up.', emptyBtn: 'Clear filter', emptyC: 'Leave your details',
    emptyHm: 'Nothing found', emptyPm: 'Try changing the filter.',
    mapHint: 'Click a city to see its jobs', mapHintM: 'Tap a city', mapAll: 'All jobs on the map', allCities: 'All cities', mapLabel: 'Job map',
    show: (s) => `Show ${s}`, apply: 'Apply filter', remove: 'Remove',
    ctaH: 'Didn’t find your trade?', ctaP: 'Send us your details. New projects come in every week.', ctaB: 'Leave your details',
  },
};

const ICON = {
  list: 'M5 4h8M5 8h8M5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01',
  map: 'M8 14.5s5-4.6 5-8.3a5 5 0 1 0-10 0c0 3.7 5 8.3 5 8.3ZM8 7.8a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z',
};
const svg = (d) => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="${d}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const chevron = '<svg class="jl-sel-chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const PIN = icon('pin', 'ico-city');

const splitList = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

/** Stav filtra z adresy — rovnaké pravidlá ako v sk-jobs.js. */
function stateFrom(q, cityNames) {
  const keys = new Set(PROF.PROFESSIONS.map((p) => p.key));
  const city = (c) => cityNames.find((x) => x.toLowerCase() === String(c).toLowerCase()) || null;
  const min = parseInt(q.min, 10);
  return {
    prof: [...new Set(splitList(q.prof).filter((k) => keys.has(k)))],
    city: [...new Set(splitList(q.city).map(city).filter(Boolean))],
    now: q.now === '1' || q.now === 'true',
    min: Number.isFinite(min) ? Math.min(MAX, Math.max(MIN, min)) : MIN,
    sort: ['new', 'rate', 'start'].includes(q.sort) ? q.sort : 'new',
    view: q.view === 'map' ? 'map' : 'list',
    mapcity: q.mapcity ? city(q.mapcity) : null,
  };
}

/** Ponuka spĺňa filter (skip = filter, ktorý sa pri počte možností vynechá). */
function matches(j, s, skip) {
  return (skip === 'prof' || !s.prof.length || s.prof.includes(j.prof))
    && (skip === 'city' || !s.city.length || s.city.includes(j.city))
    && (skip === 'now' || !s.now || j.startNow)
    && (skip === 'min' || s.min <= MIN || (j.rateMax != null && j.rateMax >= s.min));
}

const ts = (d) => (d ? Date.parse(d) || 0 : 0);
function sorted(list, sort) {
  const L = list.map((j, o) => ({ j, o }));
  const by = {
    new: (a, b) => ts(b.j.publishedAt) - ts(a.j.publishedAt) || a.o - b.o,
    rate: (a, b) => (b.j.rateMax || 0) - (a.j.rateMax || 0) || (b.j.rateMin || 0) - (a.j.rateMin || 0) || a.o - b.o,
    start: (a, b) => (b.j.startNow ? 1 : 0) - (a.j.startNow ? 1 : 0) || ts(a.j.startDate) - ts(b.j.startDate) || a.o - b.o,
  }[sort];
  return L.sort(by).map((x) => x.j);
}

/** Krátky nástup na mobilnú kartu: „Ihneď" / „3. 11." */
function startShort(j, t, lang) {
  if (j.startNow || !j.startDate) return t.now;
  return new Date(j.startDate).toLocaleDateString(LOCALE[lang], lang === 'en' ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'numeric' });
}

module.exports = async function render(ctx) {
  const lang = ctx.lang, t = T[lang], c = C[lang];
  const jobs = await ctx.jobs();
  const fc = facets(jobs, lang);
  const S = stateFrom(ctx.query || {}, fc.cities.map((x) => x.key));
  const jobsN = (n) => `${n} ${plural(lang, n, c.jobsN)}`;
  const visible = jobs.filter((j) => matches(j, S));
  const order = sorted(jobs, S.sort);
  if (S.mapcity && !visible.some((j) => j.city === S.mapcity)) S.mapcity = null;

  // Možnosti filtra: profesie a mestá s ponukami (+ zvolené, aj keď sú prázdne).
  const profOpts = [...fc.prof, ...S.prof.filter((k) => !fc.prof.some((p) => p.key === k))
    .map((k) => ({ key: k, name: PROF.nameOf(PROF.byKey(k), lang) }))];
  const cityOpts = fc.cities;
  const count = (field, skip, v) => jobs.filter((j) => j[field] === v && matches(j, S, skip)).length;
  const profName = (k) => (profOpts.find((p) => p.key === k) || {}).name || k;

  const chips = () => [
    ...S.prof.map((k) => ({ rm: `prof:${k}`, t: profName(k) })),
    ...S.city.map((k) => ({ rm: `city:${k}`, t: k, city: true })),
    ...(S.now ? [{ rm: 'now', t: c.now }] : []),
    ...(S.min > MIN ? [{ rm: 'min', t: t.from(S.min) }] : []),
  ];
  const active = chips();
  const chipHtml = (kind) => each(active, (x) => `<button type="button" class="${kind}" data-rm="${esc(x.rm)}" aria-label="${esc(t.remove)}: ${esc(x.t)}">${x.city ? PIN : ''}${esc(x.t)}<span class="chip-x">${icon('close')}</span></button>`);
  const quick = [
    { q: 'now', t: t.now }, { q: 'min:25', t: t.from(25) },
    ...[...fc.prof].sort((a, b) => b.n - a.n).slice(0, 2).map((p) => ({ q: `prof:${p.key}`, t: p.name })),
  ];
  const mchips = active.length ? chipHtml('jl-mchip') : each(quick, (x) => `<button type="button" class="jl-qchip" data-quick="${esc(x.q)}">${esc(x.t)}</button>`);

  // ── Možnosť filtra: zaškrtávanie (desktop) a čip (spodný panel) ────────
  const opt = (field, skip, o, sel, chip) => {
    const on = sel.includes(o.key), n = count(field, skip, o.key);
    const input = `<input type="checkbox" class="sr" ${chip ? '' : `name="${field}" `}value="${esc(o.key)}" data-f="${field}"${on ? ' checked' : ''}>`;
    return chip
      ? `<label class="${cls('fch', on && 'on', !n && !on && 'dim')}" data-opt="${field}" data-v="${esc(o.key)}">${input}<span>${esc(o.name)}</span><span class="fch-n" data-n>${n}</span></label>`
      : `<label class="${cls('fo', !n && !on && 'dim')}" data-opt="${field}" data-v="${esc(o.key)}">${input}<span class="fo-box" aria-hidden="true">${icon('check')}</span><span class="fo-t">${esc(o.name)}</span><span class="fo-n" data-n>${n}</span></label>`;
  };
  const seg = (name, chip) => `<div class="${chip ? 'seg seg-m' : 'seg'}" role="radiogroup" aria-label="${esc(t.start)}">
      ${each([[false, t.any], [true, t.now]], ([v, label]) => `<label class="${cls('seg-o', S.now === v && 'on')}"><input type="radio" class="sr" name="${name}" value="${v ? '1' : ''}" data-f="now"${S.now === v ? ' checked' : ''}><span>${esc(label)}</span></label>`)}
    </div>`;
  const minLabel = S.min <= MIN ? t.noLimit : `${t.from(S.min)} ${c.perH}`;
  const range = (chip) => `<input type="range" min="${MIN}" max="${MAX}" step="1" value="${S.min}" ${chip ? '' : 'name="min" '}data-f="min" aria-label="${esc(t.minRate)}" class="jl-range">`;

  // ── Karty ──────────────────────────────────────────────────────────────
  const idx = new Map(jobs.map((j, i) => [j, i]));
  const card = (j) => {
    const i = idx.get(j), r = rate(j);
    return `<a class="jc" href="${esc(ctx.url('job', { slug: j.slug }))}" data-card="${i}"${matches(j, S) ? '' : ' hidden'}>
  <span class="jc-img"><img src="${esc(j.image)}" alt="" loading="lazy" width="480" height="300">${r ? `<span class="jc-rate">${esc(r)} <span>${esc(c.perH)}</span></span>` : ''}${j.startNow ? `<span class="jc-now">${esc(c.now)}</span>` : ''}</span>
  <span class="jc-body">
    <strong class="jc-title">${esc(j.title)}${j.demo ? ` <span class="demo-tag">${esc(c.demo)}</span>` : ''}</strong>
    <span class="jc-tags"><span>${PIN}${esc(j.city)}</span><span>${esc(start(j, c))}</span>${j.duration ? `<span>${esc(j.duration)}</span>` : ''}</span>
    <span class="jc-foot"><span>${j.accommodation ? esc(t.accom) : esc(j.profName)}</span><span class="jc-more">${esc(t.detail)} →</span></span>
    <span class="jc-m"><span class="jc-mrate">${esc(r)}</span><span class="jc-mstart">${esc(startShort(j, t, lang))}</span></span>
  </span>
</a>`;
  };
  const mapRow = (j) => {
    const i = idx.get(j), show = matches(j, S) && (!S.mapcity || j.city === S.mapcity);
    return `<a class="${cls('mr', S.mapcity && j.city === S.mapcity && 'hl')}" href="${esc(ctx.url('job', { slug: j.slug }))}" data-mrow="${i}"${show ? '' : ' hidden'}>
  <img src="${esc(j.image)}" alt="" loading="lazy" width="68" height="52">
  <span class="mr-txt"><strong>${esc(j.title)}</strong><span>${PIN}${esc(j.city)} · ${esc(start(j, c))}</span></span>
  <span class="mr-rate">${esc(rate(j))}</span>
</a>`;
  };
  const mapVisible = S.mapcity ? visible.filter((j) => j.city === S.mapcity) : visible;
  const mapTitle = S.mapcity ? `${S.mapcity} · ${jobsN(mapVisible.length)}` : t.mapAll;
  const isMap = S.view === 'map';
  const jobsUrl = ctx.url('jobs');
  const viewBtn = (k) => `<a href="${esc(jobsUrl)}${k === 'map' ? '?view=map' : ''}" class="${cls('vt-b', S.view === k && 'on')}" data-view="${k}" aria-pressed="${S.view === k}">${svg(ICON[k])}${esc(t[k])}</a>`;

  // ── Dáta pre sk-jobs.js ────────────────────────────────────────────────
  const data = {
    lang, min: MIN, max: MAX, state: S, forms: c.jobsN,
    jobs: jobs.map((j, i) => ({ i, prof: j.prof, city: j.city, lat: j.lat, lng: j.lng, rmin: j.rateMin, rmax: j.rateMax, now: j.startNow, sd: j.startDate, pub: j.publishedAt })),
    profs: Object.fromEntries(PROF.PROFESSIONS.map((p) => [p.key, PROF.nameOf(p, lang)])),
    t: { now: c.now, nowShort: t.now, perH: c.perH, noLimit: t.noLimit, from: t.from('{n}'), mapAll: t.mapAll, remove: t.remove, show: t.show('{s}'), mapLabel: t.mapLabel },
    quick,
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  const body = `<div class="jl">
<section class="wrap jl-head">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="${esc(ctx.url('home'))}">${esc(t.home)}</a><span aria-hidden="true">/</span><span class="crumb-cur" aria-current="page">${esc(c.nav.jobs)}</span></nav>
  <div class="jl-top">
    <div class="jl-titles"><h1 class="jl-h1">${esc(t.h1)}</h1><p class="jl-sub">${esc(t.sub)}</p></div>
    <div class="vt" role="group" aria-label="${esc(t.views)}">${viewBtn('list')}${viewBtn('map')}</div>
  </div>
  <div class="jl-mbar">
    <div class="jl-mchips">
      <button type="button" class="jl-fbtn" data-sheet-open="filter-sheet" aria-controls="filter-sheet"><svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M4.5 8h7M7 12h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>${esc(t.filter)}<span class="jl-fbadge" data-fbadge${active.length ? '' : ' hidden'}>${active.length}</span></button>
      <span class="jl-mchips-in" data-mchips>${mchips}</span>
    </div>
    <span class="jl-mcount" data-count aria-live="polite">${esc(jobsN(visible.length))}</span>
  </div>
</section>

<div class="wrap jl-body">
  <form class="jl-filter" method="get" action="${esc(jobsUrl)}" aria-label="${esc(t.filter)}">
    <div class="jl-fhead"><strong>${esc(t.filter)}</strong><button type="button" class="${cls('jl-reset', !active.length && 'off')}" data-reset>${esc(t.reset)}</button></div>
    <fieldset class="jl-fs"><legend class="jl-lbl">${esc(t.prof)}</legend><div class="fo-list">${each(profOpts, (o) => opt('prof', 'prof', o, S.prof, false))}</div></fieldset>
    <fieldset class="jl-fs"><legend class="jl-lbl">${esc(t.city)}</legend><div class="fo-list">${each(cityOpts, (o) => opt('city', 'city', o, S.city, false))}</div></fieldset>
    <fieldset class="jl-fs"><legend class="jl-lbl">${esc(t.start)}</legend>${seg('now', false)}</fieldset>
    <fieldset class="jl-fs"><legend class="jl-lbl">${esc(t.minRate)}</legend>
      <strong class="jl-minl" data-minlabel>${esc(minLabel)}</strong>${range(false)}
      <span class="jl-rlims"><span>${MIN} €</span><span>${MAX} €</span></span></fieldset>
    <noscript><button type="submit" class="btn btn-dark btn-sm">${esc(t.apply)}</button></noscript>
  </form>

  <div class="jl-res">
    <div class="jl-rhead">
      <strong class="jl-count" data-count aria-live="polite">${esc(jobsN(visible.length))}</strong>
      <span class="jl-chips" data-chips>${chipHtml('jl-chip')}</span>
      <label class="jl-sort"><span class="jl-sort-l">${esc(t.sort)}</span><select data-f="sort" name="sort">${each([['new', t.sortNew], ['rate', t.sortRate], ['start', t.sortStart]], ([v, l]) => `<option value="${v}"${S.sort === v ? ' selected' : ''}>${esc(l)}</option>`)}</select>${chevron}</label>
    </div>
    <div class="jl-grid" data-list${isMap ? ' hidden' : ''}>
      ${each(order, card)}
      <div class="jl-empty" data-empty${visible.length ? ' hidden' : ''}>
        <strong class="jl-empty-h"><span class="d">${esc(t.emptyH)}</span><span class="m">${esc(t.emptyHm)}</span></strong>
        <p><span class="d">${esc(t.emptyP)}</span><span class="m">${esc(t.emptyPm)}</span></p>
        <span class="jl-empty-acts"><button type="button" class="btn btn-dark btn-sm" data-reset>${esc(t.emptyBtn)}</button><a class="btn btn-ghost btn-sm d" href="${esc(ctx.url('contact'))}#form">${esc(t.emptyC)} →</a></span>
      </div>
    </div>
    <div class="jl-mapv" data-mapview${isMap ? '' : ' hidden'}>
      <div class="jl-mapbox"><div id="jl-map" class="jl-map" role="region" aria-label="${esc(t.mapLabel)}"></div><span class="jl-maphint"><span class="d">${esc(t.mapHint)}</span><span class="m">${esc(t.mapHintM)}</span></span></div>
      <div class="jl-maplist">
        <div class="jl-maplist-h"><strong data-maptitle>${esc(mapTitle)}</strong><button type="button" class="jl-mapall" data-mapall${S.mapcity ? '' : ' hidden'}>${esc(t.allCities)}</button></div>
        ${each(order, mapRow)}
      </div>
    </div>
  </div>
</div>

<section class="wrap jl-cta-wrap">
  <div class="jl-cta rv"><div><strong>${esc(t.ctaH)}</strong><span>${esc(t.ctaP)}</span></div><a class="btn btn-primary" href="${esc(ctx.url('contact'))}#form">${esc(t.ctaB)} →</a></div>
</section>

<div class="sheet-wrap" id="filter-sheet" hidden>
  <div class="sheet-back"></div>
  <div class="sheet jl-sheet" role="dialog" aria-modal="true" aria-labelledby="fs-title">
    <div class="sheet-grab"></div>
    <div class="jl-sh-head"><strong id="fs-title">${esc(t.filter)}</strong><button type="button" class="jl-reset" data-reset>${esc(t.reset)}</button></div>
    <div class="jl-sh-body">
      <div class="jl-sh-sec"><span class="jl-lbl">${esc(t.prof)}</span><div class="fch-list">${each(profOpts, (o) => opt('prof', 'prof', o, S.prof, true))}</div></div>
      <div class="jl-sh-sec"><span class="jl-lbl">${esc(t.cityM)}</span><div class="fch-list">${each(cityOpts, (o) => opt('city', 'city', o, S.city, true))}</div></div>
      <div class="jl-sh-sec"><span class="jl-lbl">${esc(t.start)}</span>${seg('now_m', true)}</div>
      <div class="jl-sh-sec"><span class="jl-sh-row"><span class="jl-lbl">${esc(t.minRate)}</span><strong class="jl-minl" data-minlabel>${esc(minLabel)}</strong></span>${range(true)}</div>
    </div>
    <div class="jl-sh-foot"><button type="button" class="btn btn-primary btn-block" data-sheet-close data-showlabel>${esc(t.show(jobsN(visible.length)))}</button></div>
  </div>
</div>
<script type="application/json" id="jobs-data">${json}</script>
</div>`;

  return {
    title: t.title, description: t.desc, body, nav: 'jobs',
    css: ['vendor/leaflet-1.9.4.css', 'css/sk-jobs.css'],
    js: ['vendor/leaflet-1.9.4.js', 'js/sk-jobs.js'],
    image: jobs[0] && jobs[0].image,
  };
};

module.exports.matches = matches;
module.exports.stateFrom = stateFrom;

// Texty stránky — správa webov v appke ich môže prepísať (web/content.js).
module.exports.T = T;
