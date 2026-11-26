// ============================================================================
// DANUBRA web — testy smerovania a všetkých stránok oboch webov
//   node web/tests/web.test.js
// Prejde odkazy ako vyhľadávač: z hlavnej stránky každého jazyka všetky
// vnútorné odkazy, a skontroluje, že každá stránka existuje a je celá.
// ============================================================================
'use strict';

const fs = require('fs'), pth = require('path');
const { handle } = require('../server');
const { DEMO_ADS, toJob } = require('../shared/jobs');
const { match, path: pathOf, SITES, LANGS, SPOKEN } = require('../shared/sites');
const { plural } = require('../shared/h');
const PROF = require('../shared/professions');

let passed = 0, failed = 0;
const ok = (c, name, detail) => { if (c) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${String(detail).slice(0, 300)}` : ''}`); } };

// Emoji a piktogramy (📍 ✓ ⚠️ ↗ ← …); šípka → v texte tlačidiel je dovolená.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{25A0}-\u{25FF}\u{2190}\u{2191}\u{2193}-\u{21FF}\u{FE0F}]/u;
const deps = { ads: async ({ demoIfEmpty }) => (demoIfEmpty ? DEMO_ADS : []) };
const get = (p, o = {}) => handle({ method: 'GET', host: o.host || 'adlify-app.netlify.app', path: p.split('?')[0], query: Object.fromEntries(new URLSearchParams(p.split('?')[1] || '')), acceptLanguage: o.al || '' }, o.deps || deps);

(async () => {
  console.log('Adresy');
  ok(JSON.stringify(match(SITES.sk, '/sk/ponuky/zvarac-bremen')) === JSON.stringify({ lang: 'sk', route: 'job', params: { slug: 'zvarac-bremen' } }), 'detail ponuky sa rozpozná');
  ok(match(SITES.sk, '/cz/nabidky').route === 'jobs' && match(SITES.sk, '/sk/nabidky') === null, 'každý jazyk má vlastné slová v adrese');
  ok(pathOf(SITES.eu, 'en', 'trade', { slug: 'welding' }) === '/en/trades/welding', 'adresa remesla na danubra.eu');
  ok(pathOf(SITES.sk, 'hu', 'home') === '/hu/', 'hlavná stránka jazyka končí lomkou');
  const r1 = await get('/danubra-sk/');
  ok(r1.status === 302 && r1.headers.Location === '/danubra-sk/sk/', 'koreň webu presmeruje na slovenčinu', r1.headers.Location);
  const r2 = await get('/danubra-sk/', { al: 'cs-CZ,cs;q=0.9' });
  ok(r2.headers.Location === '/danubra-sk/cz/', 'česky nastavený prehliadač ide na /cz/', r2.headers.Location);
  const r3 = await get('/danubra-eu/', { al: 'sk' });
  ok(r3.headers.Location === '/danubra-eu/de/', 'danubra.eu bez slovenčiny ide na nemčinu', r3.headers.Location);
  ok(match(SITES.sk, '/ro/locuri-de-munca/zvarac-bremen').route === 'job' && match(SITES.sk, '/pl/oferty').route === 'jobs' && match(SITES.sk, '/bg/rabota').route === 'jobs'
    && match(SITES.sk, '/ro/despre-noi').route === 'about' && match(SITES.sk, '/pl/jak-to-dziala').route === 'how' && match(SITES.sk, '/bg/lichni-danni').route === 'privacy'
    && match(SITES.sk, '/bg/ponuky') === null, 'rumunské, poľské a bulharské adresy sa rozpoznajú (bulharské v latinke)');
  const r4 = await get('/danubra-sk/', { al: 'ro-RO,ro;q=0.9,en;q=0.5' });
  ok(r4.headers.Location === '/danubra-sk/ro/', 'rumunsky nastavený prehliadač ide na /ro/', r4.headers.Location);
  ok((await get('/danubra-sk/sk/neexistuje')).status === 404, 'neznáma stránka je 404');
  ok((await get('/danubra-sk/sk/ponuky/neexistuje-123')).status === 404, 'neznáma ponuka je 404');
  ok((await get('/danubra-xx/sk/')).status === 404, 'iný web neexistuje');

  console.log('Naostro (danubra.sk, danubra.eu)');
  const prod = await get('/danubra-sk/sk/', { host: 'danubra.sk' });
  ok(prod.status === 200 && !/href="\/danubra-sk/.test(prod.body), 'na danubra.sk sú odkazy bez skúšobnej predpony');
  ok(!/noindex/.test(prod.body), 'danubra.sk sa smie indexovať');
  ok(/noindex/.test((await get('/danubra-sk/sk/')).body), 'skúšobná adresa sa neindexuje');
  ok(!/Ukážka|ukazka-/.test(prod.body), 'naostro sa ukážkové ponuky nikdy neukážu');
  const robots = await get('/danubra-sk/robots.txt', { host: 'danubra.sk' });
  ok(robots.status === 200 && /Sitemap: https:\/\/danubra\.sk\/sitemap\.xml/.test(robots.body), 'danubra.sk má robots.txt s mapou stránok');
  const sm = await get('/danubra-eu/sitemap.xml', { host: 'danubra.eu' });
  ok(sm.status === 200 && /<loc>https:\/\/danubra\.eu\/de\/impressum<\/loc>/.test(sm.body) && /gewerke\/schweissen/.test(sm.body), 'danubra.eu má sitemap.xml so stránkami aj remeslami');
  const prodRoot = await get('/danubra-eu/', { host: 'www.danubra.eu' });
  ok(prodRoot.headers.Location === '/de/', 'www.danubra.eu → /de/', prodRoot.headers.Location);
  const smSk = await get('/danubra-sk/sitemap.xml', { host: 'danubra.sk', deps: { ads: async () => DEMO_ADS.slice(0, 1) } });
  ok(['ro/locuri-de-munca', 'pl/oferty', 'bg/rabota', 'ro/locuri-de-munca/ukazka-', 'bg/lichni-danni'].every((p) => smSk.body.includes(`https://danubra.sk/${p}`)),
    'sitemap danubra.sk má stránky aj ponuky v rumunčine, poľštine a bulharčine');
  ok((prod.body.match(/<link rel="alternate" hreflang="/g) || []).length === SITES.sk.langs.length + 1 && /hreflang="bg" href="https:\/\/danubra\.sk\/bg\/"/.test(prod.body), 'hreflang má všetkých 8 jazykov aj x-default');

  console.log('Slovníky — každý jazyk má každý kľúč slovenčiny');
  // Kľúče, ktoré smú byť len v niektorých jazykoch (podmienka pre ro/pl/bg).
  const OPTIONAL = { langReq: ['ro', 'pl', 'bg'] };
  /** Cesty k reťazcom a funkciám: { 'a.b': 'string' | 'function' } (polia len podľa prvku 0, dĺžka sa môže líšiť). */
  const paths = (o, pre = '', out = {}) => {
    if (typeof o === 'string' || typeof o === 'function') { out[pre] = typeof o; return out; }
    if (Array.isArray(o)) { if (o.length) paths(o[0], pre ? `${pre}.0` : '0', out); return out; }
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) paths(v, pre ? `${pre}.${k}` : k, out);
    return out;
  };
  const dummy = (x) => x;
  const resolve = (dict, l) => (typeof dict[l] === 'function' ? dict[l](dummy, dummy) : dict[l]);
  const groups = { 'sk/common': require('../sk/common').T, 'contact.F': require('../sk/pages/contact').F, 'professions.ABOUT': require('../sk/pages/professions').ABOUT, 'emails.L': require('../emails').L };
  for (const [route, mod] of Object.entries(require('../sk/pages'))) if (mod.T) groups[`sk/pages/${route}`] = mod.T;
  const problems = [];
  for (const [name, dict] of Object.entries(groups)) {
    const isByKey = name === 'professions.ABOUT';           // { elektrikar: { sk, cz… } } — jazyky sú o úroveň nižšie
    const entries = isByKey ? Object.entries(dict) : [['', dict]];
    for (const [sub, d] of entries) {
      const base = resolve(d, 'sk');
      if (!base) { problems.push(`${name}${sub ? `.${sub}` : ''}: chýba sk`); continue; }
      const want = paths(base);
      for (const l of SITES.sk.langs) {
        const cur = resolve(d, l);
        if (!cur) { problems.push(`${name}${sub ? `.${sub}` : ''}: chýba jazyk ${l}`); continue; }
        if (typeof base === 'string') { if (typeof cur !== 'string' || !cur.trim()) problems.push(`${name}.${sub} ${l}: chýba text`); continue; }
        const got = paths(cur);
        for (const [p, type] of Object.entries(want)) {
          if (got[p] !== type) problems.push(`${name}${sub ? `.${sub}` : ''} ${l}: chýba „${p}"`);
          else if (type === 'string' && !p.split('.').pop().match(/^\d+$/) && !cur[p.split('.')[0]]) problems.push(`${name} ${l}: prázdne „${p}"`);
        }
        for (const p of Object.keys(got)) {
          const top = p.split('.')[0];
          if (!(top in (typeof base === 'object' ? base : {})) && !(OPTIONAL[top] || []).includes(l)) problems.push(`${name} ${l}: kľúč „${p}" navyše (sk ho nemá)`);
        }
      }
    }
  }
  ok(problems.length === 0, `všetky slovníky webu majú každý kľúč vo všetkých ${SITES.sk.langs.length} jazykoch (${Object.keys(groups).length} skupín)`, problems.slice(0, 8).join(' | '));
  const profMissing = PROF.PROFESSIONS.flatMap((p) => SITES.sk.langs.filter((l) => !p.name[l] || !p.one[l]).map((l) => `${p.key}:${l}`));
  ok(profMissing.length === 0, 'každá profesia má názov v každom jazyku', profMissing.join(', '));
  const flagsMissing = SITES.sk.langs.filter((l) => !LANGS[l] || !fs.existsSync(pth.join(__dirname, '..', 'public', 'flags', `${LANGS[l].flag}.svg`)));
  ok(flagsMissing.length === 0, 'každý jazyk má záznam v LANGS a vlajku v public/flags', flagsMissing.join(', '));
  const spokenMissing = SITES.sk.langs.filter((l) => SPOKEN.some((k) => !require('../sk/common').T[l].spoken[k]));
  ok(spokenMissing.length === 0, 'názvy jazykov pre pole „Ktorými jazykmi hovoríte?" sú vo všetkých jazykoch', spokenMissing.join(', '));

  console.log('Rumunčina, poľština, bulharčina — podmienka a formulár');
  const slug = toJob(DEMO_ADS[0], 'sk').slug;
  for (const l of SITES.sk.langs) {
    const pages = await Promise.all([get(`${SITES.sk.prefix}/${l}/`), get(pathOf(SITES.sk, l, 'how').replace(/^/, SITES.sk.prefix)), get(pathOf(SITES.sk, l, 'job', { slug }).replace(/^/, SITES.sk.prefix)), get(pathOf(SITES.sk, l, 'contact').replace(/^/, SITES.sk.prefix))]);
    const needBox = ['ro', 'pl', 'bg'].includes(l);
    const boxes = pages.slice(0, 3).map((r) => (r.body.match(/class="req-box"/g) || []).length);
    ok(pages.every((r) => r.status === 200) && boxes.every((n) => (needBox ? n === 1 : n === 0)),
      needBox ? `${l}: úvod, postup a ponuka majú práve jeden box „vedúci partie hovorí po nemecky alebo anglicky"` : `${l}: box o nemčine sa neukazuje (tím sa dohovorí)`, `${boxes.join('/')}`);
    const forms = [[pages[2], 2], [pages[3], 1]];     // ponuka: bočný panel + výsuvný panel; kontakt: jeden formulár
    ok(forms.every(([r, n]) => (r.body.match(/<fieldset class="lang-pick" data-required-group>/g) || []).length === n
      && (r.body.match(/name="languages\[\]"/g) || []).length === n * SPOKEN.length), `${l}: prihláška aj kontakt majú povinné pole „Ktorými jazykmi hovoríte?" s ${SPOKEN.length} jazykmi`);
  }
  const roJob = await get(`${SITES.sk.prefix}/ro/locuri-de-munca/${slug}`);
  ok(/germană sau engleză/.test(roJob.body) && /Ce limbi vorbiți\?/.test(roJob.body) && /Germană<\/span>/.test(roJob.body), 'rumunská ponuka: podmienka aj pole jazykov sú po rumunsky');

  for (const site of Object.values(SITES)) {
    console.log(`Stránky ${site.domain}`);
    const seen = new Map();
    const queue = site.langs.map((l) => `${site.prefix}/${l}/`);
    while (queue.length && seen.size < 400) {
      const url = queue.shift();
      if (seen.has(url)) continue;
      const r = await get(url);
      seen.set(url, r);
      if (r.status !== 200) continue;
      for (const m of r.body.matchAll(/href="([^"#?]+)(?:[?#][^"]*)?"/g)) {
        const h = m[1];
        if (h.startsWith(site.prefix + '/') && !seen.has(h) && !queue.includes(h)) queue.push(h);
      }
    }
    const zle = [...seen].filter(([, r]) => r.status !== 200).map(([u, r]) => `${u} ${r.status}`);
    ok(zle.length === 0, `všetky odkazy vedú na existujúce stránky (${seen.size} stránok)`, zle.join(', '));
    const bodies = [...seen].filter(([, r]) => r.status === 200);
    const pokazene = bodies.filter(([, r]) => /undefined|NaN|\[object Object\]|\{\{/.test(r.body.replace(/<script[\s\S]*?<\/script>/g, '')))
      .map(([u, r]) => `${u}: ${(r.body.match(/.{0,40}(undefined|NaN|\[object Object\]|\{\{).{0,40}/) || [''])[0]}`);
    ok(pokazene.length === 0, 'v stránkach nie je „undefined", „NaN" ani nevyplnené {{…}}', pokazene.slice(0, 3).join(' | '));
    const bezNadpisu = bodies.filter(([, r]) => !/<h1[\s>]/.test(r.body)).map(([u]) => u);
    ok(bezNadpisu.length === 0, 'každá stránka má nadpis h1', bezNadpisu.slice(0, 5).join(', '));
    const bezTitle = bodies.filter(([, r]) => !/<title>[^<]{3,}<\/title>/.test(r.body)).map(([u]) => u);
    ok(bezTitle.length === 0, 'každá stránka má titulok', bezTitle.slice(0, 5).join(', '));
    const emoji = bodies.filter(([, r]) => EMOJI.test(r.body)).map(([u, r]) => `${u}: ${(r.body.match(new RegExp(`.{0,40}${EMOJI.source}.{0,20}`, 'u')) || [''])[0]}`);
    ok(emoji.length === 0, 'v stránkach nie sú emoji ani piktogramy (len SVG ikony)', emoji.slice(0, 3).join(' | '));
    const hreflang = bodies.filter(([, r]) => (r.body.match(/hreflang="/g) || []).length < site.langs.length + 1).map(([u]) => u);
    ok(hreflang.length === 0, 'každá stránka má jazykové verzie pre vyhľadávače', hreflang.slice(0, 5).join(', '));
    // Značka DANUBRA: stará značka punds sa nesmie ukázať nikde. Výnimka sú
    // fotky z doterajšieho WordPressu (punds.eu/wp-content) a veta o nich
    // v ochrane údajov punds.eu → danubra.eu.
    const stara = bodies.filter(([, r]) => /punds/i.test(r.body.replace(/https:\/\/punds\.eu\/wp-content\/[^"' )]+/g, '')
      .replace(/(Webauftritt unter|website at) punds\.eu/g, ''))).map(([u, r]) => `${u}: ${(r.body.match(/.{0,40}punds.{0,40}/i) || [''])[0]}`);
    ok(stara.length === 0, 'na stránkach nie je stará značka punds (len DANUBRA)', stara.slice(0, 3).join(' | '));
    // Logo = znak D (oranžová pilulka, modrý oblúk) + písmená ANUBRA ako krivky.
    // Znak je písmeno D, takže za ním nesmie byť slovo DANUBRA (DDANUBRA).
    const logo = bodies.filter(([, r]) => {
      const a = (r.body.match(/<a class="logo[^"]*"[^>]*>[\s\S]*?<\/a>/) || [''])[0];
      return !/<svg[^>]*class="lg-logo[^"]*"[^>]*viewBox="32 32 2044 264"/.test(a) || !a.includes('stroke="#F07E22"') || !a.includes('stroke="#1E4FD8"')
        || !/fill="#(0A1B3D|fff)" fill-rule="evenodd"/.test(a) || /<\/svg>\s*(<[^>]+>\s*)*DANUBRA/.test(a) || /logo-word|PARTNER UND SERVICE/.test(r.body);
    }).map(([u]) => u);
    ok(logo.length === 0, 'logo je znak D + písmená ANUBRA (jedno SVG), bez slova DANUBRA za znakom a bez podtitulku', logo.slice(0, 5).join(', '));
    const vlna = bodies.filter(([, r]) => /M6 34 V20|M24 28 A9 9/.test(r.body)).map(([u]) => u);
    ok(vlna.length === 0, 'starý znak (vlna) nie je na žiadnej stránke', vlna.slice(0, 5).join(', '));
    for (const l of site.langs) {
      const home = seen.get(`${site.prefix}/${l}/`);
      ok(home && home.status === 200 && new RegExp(`<html lang="${l === 'cz' ? 'cs' : l}"`).test(home.body), `${site.domain}/${l}/ — správny jazyk stránky`);
    }
  }

  console.log('Bez emoji');
  const pub = (d) => fs.readdirSync(pth.join(__dirname, '..', 'public', d)).map((f) => pth.join(__dirname, '..', 'public', d, f));
  const files = [...pub('js'), ...pub('css'), pth.join(__dirname, '..', 'emails.js')];
  const sEmoji = files.filter((f) => EMOJI.test(fs.readFileSync(f, 'utf8'))).map((f) => pth.relative(pth.join(__dirname, '..'), f));
  ok(sEmoji.length === 0, 'skripty, štýly a e-maily sú bez emoji', sEmoji.join(', '));

  console.log('Ponuky');
  const j = toJob({ id: 'abc123456', title: 'Zvárač TIG', trade_key: 'zvarac', city: 'Ulm', rate_offered: 30, rate_max: 33, starts_on: '2099-12-01',
    i18n: { de: { title: 'Schweißer WIG' } } }, 'de');
  ok(j.title === 'Schweißer WIG' && j.prof === 'zvarac' && j.lat > 48 && !j.startNow, 'inzerát z appky sa prevedie na ponuku (preklad, profesia, mapa, nástup)', JSON.stringify(j).slice(0, 200));
  ok(toJob({ id: 'x', title: 'A', trade_key: 'murar' }, 'cz').prof === 'ine', 'neznáme remeslo ide medzi ďalšie remeslá');
  const adI18n = { id: 'abc123456', title: 'Zvárač TIG', trade_key: 'zvarac', city: 'Ulm', duties: ['Zváranie'], i18n: { en: { title: 'TIG welder', duties: ['Welding'] }, pl: { title: 'Spawacz TIG' } } };
  ok(toJob(adI18n, 'ro').title === 'TIG welder' && toJob(adI18n, 'ro').duties[0] === 'Welding' && toJob(adI18n, 'bg').title === 'TIG welder'
    && toJob(adI18n, 'pl').title === 'Spawacz TIG' && toJob(adI18n, 'pl').duties[0] === 'Welding' && toJob(adI18n, 'cz').title === 'Zvárač TIG'
    && toJob({ ...adI18n, i18n: {} }, 'ro').title === 'Zvárač TIG', 'ponuka bez prekladu: ro/pl/bg vezmú anglický text, potom slovenský; cz slovenský');
  ok(plural('sk', 1, ['ponuka', 'ponuky', 'ponúk']) === 'ponuka' && plural('sk', 3, ['ponuka', 'ponuky', 'ponúk']) === 'ponuky'
    && plural('sk', 7, ['ponuka', 'ponuky', 'ponúk']) === 'ponúk' && plural('sk', 0, ['ponuka', 'ponuky', 'ponúk']) === 'ponúk', 'slovenské množné číslo (1 / 2–4 / 5+)');
  const PL = ['oferta', 'oferty', 'ofert'], RO = ['ofertă', 'oferte', 'de oferte'];
  ok(plural('pl', 1, PL) === 'oferta' && plural('pl', 3, PL) === 'oferty' && plural('pl', 5, PL) === 'ofert' && plural('pl', 12, PL) === 'ofert' && plural('pl', 22, PL) === 'oferty' && plural('pl', 0, PL) === 'ofert', 'poľské množné číslo (1 / 2–4 okrem 12–14 / ostatné)');
  ok(plural('ro', 1, RO) === 'ofertă' && plural('ro', 5, RO) === 'oferte' && plural('ro', 19, RO) === 'oferte' && plural('ro', 20, RO) === 'de oferte' && plural('ro', 0, RO) === 'oferte', 'rumunské množné číslo (1 / 2–19 / 20+ „de")');
  ok(plural('bg', 1, ['обява', 'обяви']) === 'обява' && plural('bg', 4, ['обява', 'обяви']) === 'обяви', 'bulharské množné číslo');

  console.log('Značka DANUBRA: domény a staré adresy');
  ok(/Partner und Service s\. r\. o\./.test((await get('/danubra-eu/de/impressum')).body)
    && /DANUBRA ist eine Marke der Partner und Service s\. r\. o\./.test((await get('/danubra-eu/de/impressum')).body), 'Impressum: firma zostáva, DANUBRA je jej značka');
  ok(/DANUBRA je obchodná značka tejto spoločnosti/.test((await get('/danubra-sk/sk/ochrana-osobnych-udajov')).body), 'ochrana údajov: prevádzkovateľ je firma, DANUBRA jej značka');
  ok(/"hiringOrganization":\{"@type":"Organization","name":"DANUBRA","legalName":"Partner und Service s\. r\. o\."/.test((await get(`${SITES.sk.prefix}/sk/ponuky/${slug}`, { deps: { ads: async () => [{ ...DEMO_ADS[0], demo: false }] } })).body),
    'štruktúrované dáta ponuky: DANUBRA, právne meno firmy');
  // Edge funkcia (naostro): nové domény sa prepíšu na web, staré punds.* presmerujú 301 na danubra.*.
  const edgeSrc = fs.readFileSync(pth.join(__dirname, '..', 'edge', 'danubra-host.js'), 'utf8');
  const edge = await import(`data:text/javascript,${encodeURIComponent(edgeSrc)}`);
  const run = async (u) => {
    let rew = null;
    const r = await edge.default(new Request(u), { rewrite: (x) => { rew = x; return 'REWRITE'; } });
    return { rew, status: r && r.status, loc: r && r.headers && r.headers.get ? r.headers.get('location') : null };
  };
  ok((await run('https://danubra.sk/sk/ponuky?p=zvarac')).rew === '/danubra-sk/sk/ponuky?p=zvarac' && (await run('https://danubra.eu/de/')).rew === '/danubra-eu/de/',
    'danubra.sk a danubra.eu sa prepíšu na web');
  const w = await run('https://www.danubra.eu/de/kontakt');
  ok(w.status === 301 && w.loc === 'https://danubra.eu/de/kontakt', 'www.danubra.eu → danubra.eu (301)', JSON.stringify(w));
  const old = await Promise.all(['https://punds.sk/sk/ponuky/zvarac-bremen?utm=fb', 'https://www.punds.sk/cz/', 'https://punds.eu/de/impressum', 'https://www.punds.eu/en/trades/welding'].map(run));
  ok(old.every((r) => r.status === 301) && old.map((r) => r.loc).join(' ') === 'https://danubra.sk/sk/ponuky/zvarac-bremen?utm=fb https://danubra.sk/cz/ https://danubra.eu/de/impressum https://danubra.eu/en/trades/welding',
    'staré domény punds.sk / punds.eu (aj www) → rovnaká adresa na danubra.* (301)', JSON.stringify(old));
  const cudzie = await Promise.all(['https://punds.sk.evil.com/sk/', 'https://danubra.sk.evil.com/sk/', 'https://evil-danubra.sk/', 'https://xpunds.eu/', 'https://adlify-app.netlify.app/app/'].map(run));
  ok(cudzie.every((r) => r.rew === null && !r.status), 'cudzie domény (danubra.sk.evil.com, punds.sk.evil.com) a appka sa nedotknú', JSON.stringify(cudzie));
  ok((await run('https://danubra.sk/web/public/css/base.css')).rew === null && (await run('https://danubra.sk/danubra-sk/sk/')).rew === null, 'statické súbory a už prepísané adresy bez zmeny');
  // netlify.toml: nové trasy, staré /punds-* presmerované 301, funkcie existujú.
  const toml = fs.readFileSync(pth.join(__dirname, '..', '..', 'netlify.toml'), 'utf8');
  const rules = [...toml.matchAll(/\[\[redirects\]\][^[]*?from\s*=\s*"([^"]+)"[^[]*?to\s*=\s*"([^"]+)"[^[]*?status\s*=\s*(\d+)/g)].map((m) => ({ from: m[1], to: m[2], status: +m[3] }));
  const rule = (f) => rules.find((r) => r.from === f) || {};
  ok(['/danubra-sk', '/danubra-sk/*', '/danubra-eu', '/danubra-eu/*'].every((f) => rule(f).to === '/.netlify/functions/danubra-web' && rule(f).status === 200), 'netlify.toml: /danubra-sk a /danubra-eu obsluhuje funkcia danubra-web');
  ok(rule('/punds-sk/*').to === '/danubra-sk/:splat' && rule('/punds-eu/*').to === '/danubra-eu/:splat' && rule('/punds-sk').to === '/danubra-sk' && rule('/punds-eu').to === '/danubra-eu'
    && ['/punds-sk', '/punds-sk/*', '/punds-eu', '/punds-eu/*'].every((f) => rule(f).status === 301), 'netlify.toml: staré /punds-sk/… a /punds-eu/… → 301 na /danubra-…');
  ok(rule('/b/*').to === '/.netlify/functions/danubra-bundle/:splat', 'netlify.toml: /b/* ide na funkciu danubra-bundle');
  const fns = rules.map((r) => (r.to.match(/^\/\.netlify\/functions\/([a-z0-9-]+)/) || [])[1]).filter(Boolean);
  const chyba = fns.filter((f) => !fs.existsSync(pth.join(__dirname, '..', '..', 'netlify', 'functions', `${f}.js`)));
  ok(chyba.length === 0, 'netlify.toml: každá funkcia z presmerovaní existuje', chyba.join(', '));
  const img = (f) => fs.existsSync(pth.join(__dirname, '..', 'public', 'img', f));
  ok(['logo/danubra-logo.svg', 'logo/danubra-logo-white.svg', 'logo/danubra-icon.svg', 'logo/danubra-mark.svg', 'logo/danubra-mark-white.svg', 'logo/danubra-mark-black.svg',
    'email/danubra-mark.png', 'email/danubra-mark-white.png', 'email/danubra-logo.png', 'email/danubra-logo-white.png'].every(img)
    && rule('/web/public/img/email/punds-mark-white.png').to === '/web/public/img/email/danubra-mark-white.png', 'logá DANUBRA existujú; staré logo v odoslaných e-mailoch sa presmeruje');
  const svgs = ['danubra-logo', 'danubra-logo-white', 'danubra-mark', 'danubra-mark-white', 'danubra-mark-black', 'danubra-icon']
    .map((n) => [n, fs.readFileSync(pth.join(__dirname, '..', 'public', 'img', 'logo', `${n}.svg`), 'utf8')]);
  ok(svgs.every(([, x]) => x.includes('M56.5 57V266.5') && x.includes('M117 59H189.5A102.5 102.5 0 0 1 189.5 264H117') && !/M6 34 V20|M24 28 A9 9/.test(x)),
    'súbory loga majú nový znak D, nie starú vlnu');
  ok(svgs.filter(([n]) => n !== 'danubra-mark-black').every(([, x]) => x.includes('#F07E22') && x.includes('#1E4FD8'))
    && /fill="#0A1B3D" fill-rule="evenodd"/.test(svgs[0][1]) && /fill="#FFFFFF" fill-rule="evenodd"/.test(svgs[1][1]) && !/>DANUBRA</.test(svgs[0][1]),
    'farby značky: oranžová #F07E22, modrá #1E4FD8, písmená tmavomodré alebo biele');

  console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`  ✗ test spadol: ${e.stack}`); console.log('\n0 prešlo, 1 zlyhalo'); process.exit(1); });
