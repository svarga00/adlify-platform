// ============================================================================
// Testy serverovej funkcie danubra-read-doc (doklad živnostníka z fotky)
// Spustenie:  node app/tests/read-doc.test.js
// ============================================================================
// Bez siete a bez kľúča k modelu: používateľ, úložisko a model sa podstrčia
// cez `handle(event, deps)`. Knižnica docscan je skutočná — výstup funkcie
// je presne to, čo dostane formulár. Skutočné API sa nevolá.
//
// Test zámerne NEleží v `netlify/functions/` — Netlify by z neho robil
// funkciu a bodka v názve zhodí deploy (pozri sf-invoice.test.js).
// ============================================================================
const path = require('path');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}

const F = require(path.join(__dirname, '..', '..', 'netlify', 'functions', 'danubra-read-doc.js'));

const calls = { model: [], download: [] };
const USER = { id: 'u1' };
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const TODAY = '2026-10-28';
const A1 = { kind: 'a1', reference: 'SK-A1-2026-0815', valid_from: '01.09.2026', valid_to: '2027-08-31',
  holder_name: 'NOVÁK JÁN', issuer: 'Sociálna poisťovňa', confidence: 0.92, notes: '' };
const toolReply = (input) => ({
  ok: true, status: 200,
  data: {
    model: 'claude-sonnet-5-5', stop_reason: 'tool_use',
    usage: { input_tokens: 1200, output_tokens: 150 },
    content: [{ type: 'tool_use', id: 't1', name: 'doklad', input }],
  },
});
const deps = (over = {}) => ({
  user: async () => USER,
  download: async (p) => { calls.download.push(p); return { buf: PNG, type: 'image/png' }; },
  callModel: async (body) => { calls.model.push(body); return toolReply(A1); },
  today: () => TODAY,
  ...over,
});
const ev = (body, method = 'POST') => ({
  httpMethod: method, headers: { authorization: 'Bearer x' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const parse = (r) => ({ code: r.statusCode, ...JSON.parse(r.body) });
const img = { base64: PNG.toString('base64'), media_type: 'image/png' };

console.log('Doklad z fotky — serverová funkcia');

(async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  delete process.env.CLAUDE_MODEL_VISION;
  delete process.env.CLAUDE_MODEL_TEXT;

  ok(typeof F.handler === 'function' && typeof F.handle === 'function', 'exportuje handler aj handle');

  // ── Metóda a prihlásenie ──────────────────────────────────────────────────
  eq(parse(await F.handle(ev({}, 'GET'), deps())).code, 405, 'GET → 405');
  {
    let modelCalled = false;
    const r = parse(await F.handle(ev(img), deps({ user: async () => null, callModel: async () => { modelCalled = true; } })));
    eq(r.code, 401, 'bez prihláseného používateľa → 401');
    ok(!modelCalled, 'a model sa nevolá');
  }

  // ── Bez kľúča ─────────────────────────────────────────────────────────────
  {
    delete process.env.ANTHROPIC_API_KEY;
    const r = parse(await F.handle(ev(img), deps()));
    eq(r.code, 400, 'bez ANTHROPIC_API_KEY → 400');
    ok(/ANTHROPIC_API_KEY/.test(r.error) && /ručne/.test(r.error), 'a povie prečo aj čo robiť', r.error);
    process.env.ANTHROPIC_API_KEY = 'test-key';
  }

  // ── Zlé vstupy ────────────────────────────────────────────────────────────
  eq(parse(await F.handle(ev('{nie json'), deps())).code, 400, 'neplatný JSON → 400');
  eq(parse(await F.handle(ev({ worker_name: 'Ján' }), deps())).code, 400, 'bez súboru → 400');
  {
    const r = parse(await F.handle(ev({ base64: 'YWJj', media_type: 'text/plain' }), deps()));
    eq(r.code, 415, 'nepodporovaný typ → 415');
    ok(/JPG|PNG|PDF/.test(r.error), 'a hláška povie, čo nahrať');
  }
  eq(parse(await F.handle(ev({ storage_path: 'worker/w1/a1.heic' }),
    deps({ download: async () => ({ buf: PNG, type: 'image/heic' }) }))).code, 415, 'HEIC z úložiska → 415');
  eq(parse(await F.handle(ev({ storage_path: 'worker/../secret/x.pdf' }), deps())).code, 400, 'cesta s „..“ → 400');
  {
    calls.download.length = 0;
    const r = parse(await F.handle(ev({ storage_path: 'prijate-faktury/2026/x.pdf' }), deps()));
    eq(r.code, 400, 'súbor mimo priečinka dokladov ľudí → 400');
    eq(calls.download, [], 'a nič sa nestiahne');
  }

  // ── Príliš veľké ──────────────────────────────────────────────────────────
  {
    const r = parse(await F.handle(ev({ base64: 'A'.repeat(6 * 1024 * 1024 + 4), media_type: 'application/pdf' }), deps()));
    eq(r.code, 413, 'base64 nad 6 MB → 413');
    ok(/6 MB/.test(r.error), 'a hláška povie limit');
  }
  eq(parse(await F.handle(ev({ base64: 'A'.repeat(Math.ceil(5.5 * 1024 * 1024 * 4 / 3)), media_type: 'image/jpeg' }),
    deps())).code, 413, 'fotka nad 5 MB (limit modelu) → 413');
  {
    const r = parse(await F.handle(ev({ storage_path: 'worker/w1/big.pdf' }),
      deps({ download: async () => ({ buf: Buffer.alloc(10 * 1024 * 1024 + 1), type: 'application/pdf' }) })));
    eq(r.code, 413, 'stiahnuté PDF nad 10 MB → 413');
    ok(/ručne/.test(r.error), 'a povie, že doklad sa dá vyplniť ručne');
  }

  // ── Súbor z úložiska ──────────────────────────────────────────────────────
  {
    calls.download.length = 0; calls.model.length = 0;
    const r = parse(await F.handle(ev({
      storage_path: 'worker/w1/2026-10-28-a1.png', worker_name: ' Ján Novák\n', expected_kind: 'a1',
    }), deps()));
    eq(r.code, 200, 'storage_path → 200');
    eq(calls.download, ['worker/w1/2026-10-28-a1.png'], 'súbor sa stiahol z úložiska podľa cesty');
    const body = calls.model[0] || {};
    const content = (body.messages && body.messages[0] && body.messages[0].content) || [];
    eq(content[0] && content[0].type, 'image', 'fotka ide modelu ako obrázok');
    eq(content[0] && content[0].source, { type: 'base64', media_type: 'image/png', data: PNG.toString('base64') },
      'v base64 so správnym typom');
    eq(body.model, 'claude-sonnet-5-5', 'predvolený model');
    eq(body.max_tokens, 1200, 'max_tokens 1200 — doklad je krátky');
    eq((body.tools || []).map(t => t.name), ['doklad'], 's nástrojom doklad');
    ok(!('tool_choice' in body), 'bez tool_choice');
    const text = (content[1] && content[1].text) || '';
    ok(/„Ján Novák"/.test(text) && /formulár A1/.test(text) && /otočená o 90°/.test(text) && /2026-10-28/.test(text),
      'zadanie má očistené meno, očakávaný druh, dnešok a upozornenie na otočenú fotku', text);

    eq(r.read, { kind: 'a1', reference: 'SK-A1-2026-0815', valid_from: '2026-09-01', valid_to: '2027-08-31',
      holder_name: 'NOVÁK JÁN', issuer: 'Sociálna poisťovňa', confidence: 0.92, notes: '' },
    'odpoveď nesie normalizovaný doklad (dátumy RRRR-MM-DD)');
    eq(r.warnings, [], 'meno sedí aj v opačnom poradí — bez upozornení');
    eq(r.model, 'claude-sonnet-5-5', 'a model z odpovede');
    eq(r.usage, { input_tokens: 1200, output_tokens: 150 }, 'a spotrebu tokenov');
  }

  // ── Upozornenia ───────────────────────────────────────────────────────────
  {
    const r = parse(await F.handle(ev({ ...img, worker_name: 'Peter Horváth', expected_kind: 'a1' }), deps({
      callModel: async () => toolReply({ ...A1, valid_to: '2026-10-01', confidence: 0.4 }),
    })));
    eq(r.code, 200, 'doklad s problémami → 200 (rozhoduje kolega)');
    eq(r.warnings.map(w => w.code), ['name_mismatch', 'expired', 'unsure'],
      'cudzie meno, neplatný doklad a neistá AI');
  }
  {
    const r = parse(await F.handle(ev({ ...img, expected_kind: 'vodicak' }), deps()));
    const text = (calls.model[calls.model.length - 1].messages[0].content[1] || {}).text || '';
    eq(r.code, 200, 'neznámy očakávaný druh nevadí');
    ok(!/by mal byť/.test(text), 'a do zadania sa nedostane');
  }

  // ── Base64 a PDF ──────────────────────────────────────────────────────────
  {
    calls.model.length = 0;
    process.env.CLAUDE_MODEL_VISION = 'claude-vision-x';
    const r = parse(await F.handle(ev({
      base64: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4').toString('base64'), worker_name: 'Ján Novák',
    }), deps()));
    delete process.env.CLAUDE_MODEL_VISION;
    eq(r.code, 200, 'base64 (data URL s PDF) → 200');
    eq(calls.model[0].messages[0].content[0].type, 'document', 'PDF ide modelu ako dokument');
    eq(calls.model[0].model, 'claude-vision-x', 'CLAUDE_MODEL_VISION má prednosť');
  }
  {
    const r = parse(await F.handle(ev(img), deps({
      callModel: async () => ({ ok: true, status: 200, data: { content: [{ type: 'text', text: '```json\n{"kind":"passport","confidence":0.8}\n```' }] } }),
    })));
    eq(r.code, 200, 'JSON v texte namiesto nástroja → 200');
    eq(r.read.kind, 'passport', 'a obsah sa použije');
  }

  // ── Chyby modelu ──────────────────────────────────────────────────────────
  {
    const r = parse(await F.handle(ev(img), deps({
      callModel: async () => ({ ok: false, status: 400, data: { error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } } }),
    })));
    eq(r.code, 502, 'chyba modelu → 502');
    eq(r.error, 'Your credit balance is too low', 'a hláška z API sa odovzdá');
  }
  eq(parse(await F.handle(ev(img), deps({ callModel: async () => ({ ok: false, status: 429, data: {} }) }))).error,
    'Model je práve zahltený — skúste o chvíľu.', '429 bez správy → veta cez AI.errorText');
  {
    const r = parse(await F.handle(ev(img), deps({
      callModel: async () => ({ ok: true, status: 200, data: { content: [{ type: 'text', text: 'Neviem.' }] } }),
    })));
    eq(r.code, 502, 'odpoveď bez údajov → 502');
    ok(/ručne/.test(r.error), 'a povie, že údaje sa dajú vyplniť ručne');
  }
  eq(parse(await F.handle(ev(img), deps({
    callModel: async () => ({ ok: true, status: 200, data: { stop_reason: 'max_tokens', content: [] } }),
  }))).code, 502, 'nedokončená odpoveď (max_tokens) → 502');
  {
    const r = parse(await F.handle(ev(img), deps({
      callModel: async () => { const e = new Error('timeout'); e.name = 'TimeoutError'; throw e; },
    })));
    eq(r.code, 504, 'model neodpovie včas → 504');
    ok(/príliš dlho/.test(r.error), 's vetou po slovensky');
  }
  eq(parse(await F.handle(ev({ storage_path: 'worker/w1/x.jpg' }), deps({
    download: async () => { throw new Error('not found'); },
  }))).code, 404, 'súbor sa nedá stiahnuť → 404');
  {
    const r = parse(await F.handle(ev(img), deps({ ds: { TOOL: null } })));
    eq(r.code, 500, 'chýbajúca knižnica → 500 s vetou');
  }

  console.log(`\n${passed} prešlo, ${failed} padlo\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('  ✗ Error', e); process.exit(1); });
