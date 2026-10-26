// Testy: inzerát → ponuka na punds.sk.   node app/lib/recruiting/web-ad.test.js
const W = require('./web-ad.js');
let passed = 0, failed = 0;
const ok = (c, n, d) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };

ok(JSON.stringify(W.lines('- a\n\n• b\n c ')) === '["a","b","c"]', 'zoznam z riadkov (bez odrážok a prázdnych)');
ok(JSON.stringify(W.faqParse('Potrebujem živnosť? | Áno.\nbez odpovede')) === '[{"q":"Potrebujem živnosť?","a":"Áno."}]', 'otázky „Otázka? | Odpoveď"');
ok(W.faqText([{ q: 'A?', a: 'B' }]) === 'A? | B', 'otázky späť do textu');
ok(W.slugFor('Zvárač MIG/MAG (135)', 'Bremen', 'ab12cd34') === 'zvarac-mig-mag-135-bremen-ab12', 'adresa ponuky bez diakritiky, s kúskom id');

const now = new Date('2026-10-26T10:00:00Z');
const p = W.payload({ web_published: true, web_title: 'Zvárač MIG/MAG', city: 'Bremen', trade_key: 'zvarac', rate_max: '30,5', hours_week: '50',
  duties: 'zváranie\nkontrola', faq: 'A? | B', accommodation: true, start_now: false }, { id: 'abcd1234-x', city: 'Ulm' }, { now, i18n: { de: { title: 'Schweißer' } } });
ok(p.web_slug === 'zvarac-mig-mag-bremen-abcd' && p.published_at === now.toISOString(), 'pri zverejnení vznikne adresa a dátum zverejnenia', JSON.stringify(p));
ok(p.web_prof === 'zvarac' && p.rate_max === 30.5 && p.hours_week === 50 && p.duties.length === 2 && p.faq[0].a === 'B' && p.i18n.de.title === 'Schweißer', 'polia pre web sú očistené');
ok(p.lat === null && p.lng === null, 'zmenené mesto zmaže staré súradnice');
const q = W.payload({ web_published: true, web_title: 'Nový názov', city: 'Bremen' }, { id: 'x', city: 'Bremen', web_slug: 'stara-adresa', published_at: '2026-01-01' });
ok(!('web_slug' in q) && !('published_at' in q) && !('lat' in q), 'zverejnená ponuka si adresu ani dátum nemení');
ok(W.payload({ trade_key: 'trockenbau' }, {}).web_prof === 'sadrokarton', 'profesia na webe podľa remesla v appke');
ok(W.missing({ web_title: '', city: 'Ulm', rate_offered: '' }).join() === 'verejný názov pozície,sadzba', 'čo chýba na zverejnenie');

// Kľúče profesií musia sedieť s webom.
const WEB = require('../../../web/shared/professions.js');
ok(JSON.stringify(W.WEB_PROFESSIONS.map(x => x[0]).sort()) === JSON.stringify(WEB.PROFESSIONS.map(x => x.key).sort()), 'profesie v appke = profesie na webe');

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
