// ============================================================================
// Testy serverovej funkcie danubra-read-hours (Stundennachweis z fotky)
// Spustenie:  node app/tests/read-hours.test.js
// ============================================================================
// Bez siete a bez kľúča k modelu: používateľ, úložisko, model aj knižnica
// hourscan sa podstrčia cez `handle(event, deps)`. Skutočné API sa nevolá.
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

const F = require(path.join(__dirname, '..', '..', 'netlify', 'functions', 'danubra-read-hours.js'));

// ── Podstrčená knižnica hourscan (skutočnú píše niekto iný) ────────────────
const calls = { instructions: [], normalize: [], model: [], download: [] };
const hs = {
  TOOL: { name: 'stundennachweis', description: 'test', input_schema: { type: 'object', properties: {} } },
  instructions(ctx) { calls.instructions.push(ctx); return `ZADANIE ${ctx.site} ${ctx.workers.join('|')}`; },
  normalize(raw, opt) { calls.normalize.push({ raw, opt }); return { normalized: true, week: raw.week, rows: raw.rows || [] }; },
};
const USER = { id: 'u1' };
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const toolReply = (input) => ({
  ok: true, status: 200,
  data: {
    model: 'claude-sonnet-5-5', stop_reason: 'tool_use',
    usage: { input_tokens: 1500, output_tokens: 300 },
    content: [{ type: 'tool_use', id: 't1', name: 'stundennachweis', input }],
  },
});
const deps = (over = {}) => ({
  user: async () => USER,
  download: async (p) => { calls.download.push(p); return { buf: PNG, type: 'image/png' }; },
  callModel: async (body) => { calls.model.push(body); return toolReply({ week: 43, rows: [{ name: 'Ján Novák' }] }); },
  hs,
  ...over,
});
const ev = (body, method = 'POST') => ({
  httpMethod: method, headers: { authorization: 'Bearer x' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const parse = (r) => ({ code: r.statusCode, ...JSON.parse(r.body) });

console.log('Čítanie hodín z fotky — serverová funkcia');

(async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  delete process.env.CLAUDE_MODEL_VISION;
  delete process.env.CLAUDE_MODEL_TEXT;

  ok(typeof F.handler === 'function' && typeof F.handle === 'function', 'exportuje handler aj handle');

  // ── Metóda a prihlásenie ──────────────────────────────────────────────────
  {
    const r = parse(await F.handle(ev({}, 'GET'), deps()));
    eq(r.code, 405, 'GET → 405');
  }
  {
    let modelCalled = false;
    const r = parse(await F.handle(ev({ base64: PNG.toString('base64'), media_type: 'image/png' }),
      deps({ user: async () => null, callModel: async () => { modelCalled = true; } })));
    eq(r.code, 401, 'bez prihláseného používateľa → 401');
    ok(!modelCalled, 'a model sa nevolá');
  }

  // ── Bez kľúča ─────────────────────────────────────────────────────────────
  {
    delete process.env.ANTHROPIC_API_KEY;
    const r = parse(await F.handle(ev({ base64: PNG.toString('base64'), media_type: 'image/png' }), deps()));
    eq(r.code, 400, 'bez ANTHROPIC_API_KEY → 400');
    eq(r.error, 'Čítanie hodín z fotky nie je zapnuté — chýba ANTHROPIC_API_KEY v Netlify.', 'a povie prečo');
    process.env.ANTHROPIC_API_KEY = 'test-key';
  }

  // ── Zlé vstupy ────────────────────────────────────────────────────────────
  {
    const r = parse(await F.handle(ev('{nie json'), deps()));
    eq(r.code, 400, 'neplatný JSON → 400');
  }
  {
    const r = parse(await F.handle(ev({ year: 2026 }), deps()));
    eq(r.code, 400, 'bez súboru → 400');
  }
  {
    const r = parse(await F.handle(ev({ base64: 'YWJj', media_type: 'text/plain' }), deps()));
    eq(r.code, 415, 'nepodporovaný typ → 415');
    ok(/JPG|PNG|PDF/.test(r.error), 'a hláška povie, čo nahrať');
  }
  {
    const r = parse(await F.handle(ev({ storage_path: 'hours/sheet.heic' }),
      deps({ download: async () => ({ buf: PNG, type: 'image/heic' }) })));
    eq(r.code, 415, 'HEIC z úložiska → 415');
  }
  {
    const r = parse(await F.handle(ev({ storage_path: '../secret/x.pdf' }), deps()));
    eq(r.code, 400, 'cesta s „..“ → 400');
  }

  // ── Príliš veľké ──────────────────────────────────────────────────────────
  {
    const big = 'A'.repeat(6 * 1024 * 1024 + 4);
    const r = parse(await F.handle(ev({ base64: big, media_type: 'application/pdf' }), deps()));
    eq(r.code, 413, 'base64 nad 6 MB → 413');
    ok(/6 MB/.test(r.error), 'a hláška povie limit');
  }
  {
    const img = 'A'.repeat(Math.ceil(5.5 * 1024 * 1024 * 4 / 3));
    const r = parse(await F.handle(ev({ base64: img, media_type: 'image/jpeg' }), deps()));
    eq(r.code, 413, 'fotka nad 5 MB (limit modelu) → 413');
  }
  {
    const r = parse(await F.handle(ev({ storage_path: 'hours/big.pdf' }),
      deps({ download: async () => ({ buf: Buffer.alloc(6 * 1024 * 1024 + 1), type: 'application/pdf' }) })));
    eq(r.code, 413, 'stiahnutý súbor nad 6 MB → 413');
  }

  // ── Súbor z úložiska ──────────────────────────────────────────────────────
  {
    calls.download.length = 0; calls.model.length = 0; calls.instructions.length = 0; calls.normalize.length = 0;
    const r = parse(await F.handle(ev({
      storage_path: 'hours/2026/kw43.png', year: 2026, site: 'Lixenried',
      workers: ['Ján Novák', ' Peter Horváth ', '', null], week_hint: 43,
    }), deps()));
    eq(r.code, 200, 'storage_path → 200');
    eq(calls.download, ['hours/2026/kw43.png'], 'súbor sa stiahol z úložiska podľa cesty');
    const body = calls.model[0] || {};
    const content = (body.messages && body.messages[0] && body.messages[0].content) || [];
    eq(content[0] && content[0].type, 'image', 'fotka ide modelu ako obrázok');
    eq(content[0] && content[0].source, { type: 'base64', media_type: 'image/png', data: PNG.toString('base64') },
      'v base64 so správnym typom');
    eq(body.model, 'claude-sonnet-5-5', 'predvolený model');
    eq(body.max_tokens, 4000, 'max_tokens 4000');
    eq((body.tools || []).map(t => t.name), ['stundennachweis'], 's nástrojom stundennachweis');
    ok(!('tool_choice' in body), 'bez tool_choice');
    eq(calls.instructions[0], { year: 2026, workers: ['Ján Novák', 'Peter Horváth'], site: 'Lixenried' },
      'zadanie dostane rok, stavbu a očistené mená');
    const text = (content[1] && content[1].text) || '';
    ok(/ZADANIE Lixenried/.test(text) && /otočená o 90°/.test(text) && /KW 43\/2026/.test(text),
      'v texte je zadanie, upozornenie na otočenú fotku a tip na týždeň', text);
  }

  // ── Úspešné prečítanie z base64 ───────────────────────────────────────────
  {
    calls.normalize.length = 0; calls.model.length = 0;
    process.env.CLAUDE_MODEL_VISION = 'claude-vision-x';
    const r = parse(await F.handle(ev({
      base64: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4').toString('base64'),
      year: 2026, workers: ['Ján Novák'],
    }), deps()));
    delete process.env.CLAUDE_MODEL_VISION;
    eq(r.code, 200, 'base64 (data URL s PDF) → 200');
    eq(calls.model[0].messages[0].content[0].type, 'document', 'PDF ide modelu ako dokument');
    eq(calls.model[0].model, 'claude-vision-x', 'CLAUDE_MODEL_VISION má prednosť');
    eq(calls.normalize[0], { raw: { week: 43, rows: [{ name: 'Ján Novák' }] }, opt: { year: 2026 } },
      'normalize dostane vstup nástroja a rok');
    eq(r.sheet, { normalized: true, week: 43, rows: [{ name: 'Ján Novák' }] }, 'odpoveď nesie normalizovaný výkaz');
    eq(r.model, 'claude-sonnet-5-5', 'a model z odpovede');
    eq(r.usage, { input_tokens: 1500, output_tokens: 300 }, 'a spotrebu tokenov');
  }
  {
    // Model odpovie textom s JSON namiesto nástroja — aj tak sa to prečíta.
    const r = parse(await F.handle(ev({ base64: PNG.toString('base64'), media_type: 'image/png' }), deps({
      callModel: async () => ({ ok: true, status: 200, data: { content: [{ type: 'text', text: '```json\n{"week":44}\n```' }] } }),
    })));
    eq(r.code, 200, 'JSON v texte namiesto nástroja → 200');
    eq(r.sheet.week, 44, 'a obsah sa použije');
  }

  // ── Chyby modelu ──────────────────────────────────────────────────────────
  {
    const r = parse(await F.handle(ev({ base64: PNG.toString('base64'), media_type: 'image/png' }), deps({
      callModel: async () => ({ ok: false, status: 400, data: { error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } } }),
    })));
    eq(r.code, 502, 'chyba modelu → 502');
    eq(r.error, 'Your credit balance is too low', 'a hláška z API sa odovzdá');
  }
  {
    const r = parse(await F.handle(ev({ base64: PNG.toString('base64'), media_type: 'image/png' }), deps({
      callModel: async () => ({ ok: false, status: 429, data: {} }),
    })));
    eq(r.error, 'Model je práve zahltený — skúste o chvíľu.', '429 bez správy → veta cez AI.errorText');
  }
  {
    const r = parse(await F.handle(ev({ base64: PNG.toString('base64'), media_type: 'image/png' }), deps({
      callModel: async () => ({ ok: true, status: 200, data: { content: [{ type: 'text', text: 'Neviem.' }] } }),
    })));
    eq(r.code, 502, 'odpoveď bez údajov → 502');
  }
  {
    const r = parse(await F.handle(ev({ base64: PNG.toString('base64'), media_type: 'image/png' }), deps({
      callModel: async () => ({ ok: true, status: 200, data: { stop_reason: 'max_tokens', content: [] } }),
    })));
    eq(r.code, 502, 'nedokončená odpoveď (max_tokens) → 502');
  }
  {
    const r = parse(await F.handle(ev({ base64: PNG.toString('base64'), media_type: 'image/png' }), deps({
      callModel: async () => { const e = new Error('timeout'); e.name = 'TimeoutError'; throw e; },
    })));
    eq(r.code, 504, 'model neodpovie včas → 504 s vetou');
  }
  {
    const r = parse(await F.handle(ev({ storage_path: 'hours/x.jpg' }), deps({
      download: async () => { throw new Error('not found'); },
    })));
    eq(r.code, 404, 'súbor sa nedá stiahnuť → 404');
  }

  console.log(`\n${passed} prešlo, ${failed} padlo\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('  ✗ Error', e); process.exit(1); });
