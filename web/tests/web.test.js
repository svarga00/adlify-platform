// ============================================================================
// punds web — testy smerovania a všetkých stránok oboch webov
//   node web/tests/web.test.js
// Prejde odkazy ako vyhľadávač: z hlavnej stránky každého jazyka všetky
// vnútorné odkazy, a skontroluje, že každá stránka existuje a je celá.
// ============================================================================
'use strict';

const { handle } = require('../server');
const { DEMO_ADS, toJob } = require('../shared/jobs');
const { match, path: pathOf, SITES } = require('../shared/sites');
const { plural } = require('../shared/h');

let passed = 0, failed = 0;
const ok = (c, name, detail) => { if (c) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${String(detail).slice(0, 300)}` : ''}`); } };

const deps = { ads: async ({ demoIfEmpty }) => (demoIfEmpty ? DEMO_ADS : []) };
const get = (p, o = {}) => handle({ method: 'GET', host: o.host || 'adlify-app.netlify.app', path: p.split('?')[0], query: Object.fromEntries(new URLSearchParams(p.split('?')[1] || '')), acceptLanguage: o.al || '' }, o.deps || deps);

(async () => {
  console.log('Adresy');
  ok(JSON.stringify(match(SITES.sk, '/sk/ponuky/zvarac-bremen')) === JSON.stringify({ lang: 'sk', route: 'job', params: { slug: 'zvarac-bremen' } }), 'detail ponuky sa rozpozná');
  ok(match(SITES.sk, '/cz/nabidky').route === 'jobs' && match(SITES.sk, '/sk/nabidky') === null, 'každý jazyk má vlastné slová v adrese');
  ok(pathOf(SITES.eu, 'en', 'trade', { slug: 'welding' }) === '/en/trades/welding', 'adresa remesla na punds.eu');
  ok(pathOf(SITES.sk, 'hu', 'home') === '/hu/', 'hlavná stránka jazyka končí lomkou');
  const r1 = await get('/punds-sk/');
  ok(r1.status === 302 && r1.headers.Location === '/punds-sk/sk/', 'koreň webu presmeruje na slovenčinu', r1.headers.Location);
  const r2 = await get('/punds-sk/', { al: 'cs-CZ,cs;q=0.9' });
  ok(r2.headers.Location === '/punds-sk/cz/', 'česky nastavený prehliadač ide na /cz/', r2.headers.Location);
  const r3 = await get('/punds-eu/', { al: 'sk' });
  ok(r3.headers.Location === '/punds-eu/de/', 'punds.eu bez slovenčiny ide na nemčinu', r3.headers.Location);
  ok((await get('/punds-sk/sk/neexistuje')).status === 404, 'neznáma stránka je 404');
  ok((await get('/punds-sk/sk/ponuky/neexistuje-123')).status === 404, 'neznáma ponuka je 404');
  ok((await get('/punds-xx/sk/')).status === 404, 'iný web neexistuje');

  console.log('Naostro (punds.sk, punds.eu)');
  const prod = await get('/punds-sk/sk/', { host: 'punds.sk' });
  ok(prod.status === 200 && !/href="\/punds-sk/.test(prod.body), 'na punds.sk sú odkazy bez skúšobnej predpony');
  ok(!/noindex/.test(prod.body), 'punds.sk sa smie indexovať');
  ok(/noindex/.test((await get('/punds-sk/sk/')).body), 'skúšobná adresa sa neindexuje');
  ok(!/Ukážka|ukazka-/.test(prod.body), 'naostro sa ukážkové ponuky nikdy neukážu');
  const prodRoot = await get('/punds-eu/', { host: 'www.punds.eu' });
  ok(prodRoot.headers.Location === '/de/', 'www.punds.eu → /de/', prodRoot.headers.Location);

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
    const hreflang = bodies.filter(([, r]) => (r.body.match(/hreflang="/g) || []).length < site.langs.length + 1).map(([u]) => u);
    ok(hreflang.length === 0, 'každá stránka má jazykové verzie pre vyhľadávače', hreflang.slice(0, 5).join(', '));
    for (const l of site.langs) {
      const home = seen.get(`${site.prefix}/${l}/`);
      ok(home && home.status === 200 && new RegExp(`<html lang="${l === 'cz' ? 'cs' : l}"`).test(home.body), `${site.domain}/${l}/ — správny jazyk stránky`);
    }
  }

  console.log('Ponuky');
  const j = toJob({ id: 'abc123456', title: 'Zvárač TIG', trade_key: 'zvarac', city: 'Ulm', rate_offered: 30, rate_max: 33, starts_on: '2099-12-01',
    i18n: { de: { title: 'Schweißer WIG' } } }, 'de');
  ok(j.title === 'Schweißer WIG' && j.prof === 'zvarac' && j.lat > 48 && !j.startNow, 'inzerát z appky sa prevedie na ponuku (preklad, profesia, mapa, nástup)', JSON.stringify(j).slice(0, 200));
  ok(toJob({ id: 'x', title: 'A', trade_key: 'murar' }, 'cz').prof === 'ine', 'neznáme remeslo ide medzi ďalšie remeslá');
  ok(plural('sk', 1, ['ponuka', 'ponuky', 'ponúk']) === 'ponuka' && plural('sk', 3, ['ponuka', 'ponuky', 'ponúk']) === 'ponuky'
    && plural('sk', 7, ['ponuka', 'ponuky', 'ponúk']) === 'ponúk' && plural('sk', 0, ['ponuka', 'ponuky', 'ponúk']) === 'ponúk', 'slovenské množné číslo (1 / 2–4 / 5+)');

  console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`  ✗ test spadol: ${e.stack}`); console.log('\n0 prešlo, 1 zlyhalo'); process.exit(1); });
