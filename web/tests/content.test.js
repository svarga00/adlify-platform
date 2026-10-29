// ============================================================================
// punds web — testy obsahu spravovaného v appke (texty, kontakty, fotky, tím)
//   node web/tests/content.test.js
// ============================================================================
'use strict';

const { handle } = require('../server');
const C = require('../content');
const { DEMO_ADS, IMG } = require('../shared/jobs');

let passed = 0, failed = 0;
const ok = (c, name, detail) => { if (c) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${String(detail).slice(0, 300)}` : ''}`); } };
const get = (p, rows, host = 'adlify-app.netlify.app') => handle({ method: 'GET', host, path: p, query: {} },
  { ads: async ({ demoIfEmpty }) => (demoIfEmpty ? DEMO_ADS : []), content: async () => rows });

(async () => {
  console.log('Popis textov pre appku');
  const sch = C.schema();
  ok(sch.sites.sk.home && sch.sites.sk.home.langs.join() === 'sk,cz,hu,de,en' && Object.keys(sch.sites.sk.home.fields.sk).length > 10,
    'punds.sk: úvodná stránka má texty vo všetkých 5 jazykoch');
  ok(sch.sites.eu['trade:zvarac'] && sch.sites.eu['trade:zvarac'].fields.de && sch.sites.eu.common, 'punds.eu: remeslá aj spoločné texty');
  ok(sch.images.some((i) => i.url === IMG.weld) && sch.defaults.contacts.sk.phone1, 'zoznam fotiek a pôvodné kontakty');
  const r = await get('/punds-sk/api/schema', {});
  ok(r.status === 200 && JSON.parse(r.body).sites.sk, 'popis je na adrese /api/schema');

  console.log('Prepísaný text');
  const path = Object.entries(sch.sites.sk.home.fields.sk).find(([, v]) => /Bývanie|papiere/.test(v));
  ok(!!path, 'text nadpisu sa dá nájsť', JSON.stringify(path));
  const rows = { [`texts:sk:home`]: { sk: { [path[0]]: 'Nový nadpis z appky' } } };
  const a = await get('/punds-sk/sk/', rows);
  ok(a.body.includes('Nový nadpis z appky') && !a.body.includes(path[1]), 'zmena z appky je na stránke');
  const b = await get('/punds-sk/cz/', rows);
  ok(!b.body.includes('Nový nadpis z appky'), 'iný jazyk zostane pôvodný');
  const c = await get('/punds-sk/sk/', {});
  ok(c.body.includes(path[1]) && !c.body.includes('Nový nadpis z appky'), 'po zrušení zmeny je späť pôvodný text');
  ok(C.setPath({ a: { b: ['x'] } }, 'a.b.0', 'y') && !C.setPath({ a: { b: 1 } }, 'a.b', 'y') && !C.setPath({}, 'a.b', 'y'), 'prepísať sa dá len existujúci text');

  console.log('Kontakty, fotky, tím');
  const rows2 = {
    contacts: { sk: { phone1: '+421 999 111 222', email: 'praca@punds.sk' }, eu: { phone: '+49 151 000 000' }, whatsapp: '+421 999 111 222' },
    images: { [IMG.weld]: 'https://example.supabase.co/storage/v1/object/public/punds-web/zvarac.jpg' },
    team: [{ id: 't1', name: 'Štefan Varga', role: { sk: 'Konateľ', de: 'Geschäftsführer' }, langs: 'SK · DE', sites: ['sk', 'eu'] },
      { id: 't2', name: 'Skrytý', role: { sk: 'X' }, active: false }],
    company: { md: 'Štefan Varga' },
  };
  const h = await get('/punds-sk/sk/', rows2);
  ok(h.body.includes('+421 999 111 222') && h.body.includes('tel:+421999111222') && !h.body.includes('+421 910 523 858'), 'nový telefón na punds.sk (text aj odkaz)');
  ok(h.body.includes('wa.me/421999111222'), 'nové číslo na WhatsApp');
  ok(h.body.includes('punds-web/zvarac.jpg') && !h.body.includes(IMG.weld), 'vymenená fotka');
  const ab = await get('/punds-sk/sk/o-nas', rows2);
  ok(ab.body.includes('Štefan Varga') && ab.body.includes('Konateľ') && !ab.body.includes('Skrytý'), 'tím na O nás (vypnutý člen sa neukáže)');
  const eu = await get('/punds-eu/de/ueber-uns', rows2);
  ok(eu.body.includes('Štefan Varga') && eu.body.includes('Geschäftsführer'), 'tím na Über uns po nemecky');
  const imp = await get('/punds-eu/de/impressum', rows2, 'punds.eu');
  ok(imp.body.includes('Štefan Varga') && !imp.body.includes('[Name folgt]'), 'konateľ v Impressum');
  const eh = await get('/punds-eu/de/', rows2);
  ok(eh.body.includes('+49 151 000 000'), 'nový telefón na punds.eu');
  const imp0 = await get('/punds-eu/de/impressum', {}, 'punds.eu');
  ok(imp0.body.includes('[Name folgt]'), 'bez konateľa je v Impressum aj naostro zástupný text (nie prázdne miesto)');

  console.log('Obsah z appky nevloží HTML ani skript');
  const evil = '<img src=x onerror=alert(1)>';
  const bad = {
    contacts: { sk: { phone1: `+421 1${evil}`, email: `a@b.sk"${evil}` }, whatsapp: '+421"><x>' },
    images: { [IMG.weld]: `https://x.y/a.jpg" onerror="alert(1)` },
    'texts:eu:privacy': { de: { 'secs.0.1.0': `Text ${evil} <b>fett</b>` } },
    'texts:eu:about': { de: { 'flags.0.0': 'de" onerror="alert(1)' } },
  };
  const x1 = await get('/punds-sk/sk/kontakt', bad), x2 = await get('/punds-eu/de/datenschutz', bad), x3 = await get('/punds-eu/de/ueber-uns', bad);
  ok(![x1, x2, x3].some((r) => /<img src=x onerror|onerror="alert/.test(r.body)) && x2.body.includes('<b>fett</b>'), 'kontakty, fotky a právne texty z appky sa escapujú (<b> zostane)');
  ok(/script-src 'self' 'sha256-/.test(x1.headers['Content-Security-Policy'] || '') && x1.headers['X-Frame-Options'] === 'DENY', 'stránka má CSP s odtlačkami vložených skriptov a zákaz rámcov');

  console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`  ✗ test spadol: ${e.stack}`); console.log('\n0 prešlo, 1 zlyhalo'); process.exit(1); });
