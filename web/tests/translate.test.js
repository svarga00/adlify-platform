// ============================================================================
// punds web — preklad ponuky do jazykov webu (netlify/functions/punds-translate)
//   node web/tests/translate.test.js
// Jazyky prekladu musia sedieť s jazykmi webu (shared/sites.js) a s appkou
// (app/lib/recruiting/web-ad.js). Volanie Claude je podvrhnuté (fetch),
// prihlásenie (server-guard) aj databáza tiež — test ide bez siete.
// ============================================================================
'use strict';

const path = require('path');

let passed = 0, failed = 0;
const ok = (c, name, detail) => { if (c) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${String(detail).slice(0, 300)}` : ''}`); } };

const FN = path.join(__dirname, '..', '..', 'netlify', 'functions', 'punds-translate.js');
const stub = (req, exports) => { const p = require.resolve(req, { paths: [path.dirname(FN)] }); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
stub('@supabase/supabase-js', { createClient: () => ({}) });
stub('../../app/lib/server-guard.js', () => ({ check: async () => ({ ok: true }) }));
process.env.ANTHROPIC_API_KEY = 'test';

const T = require(FN);
const { SITES } = require('../shared/sites');
const WebAd = require('../../app/lib/recruiting/web-ad.js');
const others = SITES.sk.langs.filter((l) => l !== 'sk');

(async () => {
  console.log('Jazyky prekladu');
  ok(Object.keys(T.NAMES).join() === others.join(), 'funkcia prekladá do všetkých jazykov webu okrem slovenčiny', Object.keys(T.NAMES).join());
  ok(WebAd.LANGS.map(([l]) => l).join() === others.join(), 'appka (web-ad.js) pozná tie isté jazyky v tom istom poradí', WebAd.LANGS.map(([l]) => l).join());
  ok(Object.keys(T.LANG_NAMES).join() === SITES.sk.langs.join(), 'preklad textov stránok pozná všetky jazyky webu vrátane slovenčiny');

  console.log('Zadanie pre model');
  const p = T.adPrompt({ title: 'Zvárač', body: 'Prvý odsek.\n\nDruhý odsek.', duties: ['a'] }, others);
  ok(/ro = rumunčina/.test(p) && /pl = poľština/.test(p) && /bg = bulharčina/.test(p), 'v zadaní sú rumunčina, poľština a bulharčina');
  ok(/rodeného hovoriaceho/.test(p) && /diakritik/.test(p) && /ș ț/.test(p) && /ą ć ę ł/.test(p), 'žiada kvalitu rodeného hovoriaceho a správnu diakritiku');
  ok(/Zachovaj formátovanie/.test(p) && /odsek/.test(p) && /poradie položiek/.test(p), 'žiada zachovať formátovanie (odseky, zoznamy, otázky)');
  ok(/dumneavoastră/.test(p) && /Państwo/.test(p) && /Вие/.test(p), 'vykanie aj v nových jazykoch');

  console.log('Preklad ponuky');
  let sent = null;
  global.fetch = async (url, o) => {
    sent = JSON.parse(o.body);
    const langs = Object.keys(sent.tools[0].input_schema.properties);
    const input = Object.fromEntries(langs.map((l) => [l, { title: `T-${l}`, body: `B-${l}\n\nB2-${l}`, duration: '', duties: ['d'], requirements: [], benefits: [], faq: [{ q: 'q', a: 'a' }] }]));
    return { ok: true, json: async () => ({ content: [{ type: 'tool_use', name: 'preklady', input }] }) };
  };
  const res = await T.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ ad: { web_title: 'Zvárač MIG/MAG', web_body: 'Text', duties: ['Zváranie'] } }) });
  const j = JSON.parse(res.body);
  ok(res.statusCode === 200 && j.i18n && others.every((l) => j.i18n[l] && j.i18n[l].title === `T-${l}`), 'bez zoznamu jazykov sa preloží do všetkých jazykov webu', res.body);
  ok(j.i18n.bg.body === 'B-bg\n\nB2-bg' && j.i18n.ro.faq[0].q === 'q', 'odseky a otázky zostanú zachované');
  ok(sent && Object.keys(sent.tools[0].input_schema.properties).join() === others.join() && sent.tools[0].input_schema.required.join() === others.join(), 'model dostane schému s každým jazykom ako povinným');
  const res2 = await T.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ ad: { web_title: 'X' }, langs: ['ro', 'xx', 'bg'] }) });
  const j2 = JSON.parse(res2.body);
  ok(res2.statusCode === 200 && Object.keys(j2.i18n).join() === 'ro,bg', 'neznámy jazyk sa vyhodí, zostanú len jazyky webu', res2.body);

  console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`  ✗ test spadol: ${e.stack}`); console.log('\n0 prešlo, 1 zlyhalo'); process.exit(1); });
