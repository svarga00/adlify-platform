// ============================================================================
// Testy serverovej funkcie danubra-leads-suggest (navrhované hľadania firiem)
// Spustenie:  node app/tests/leads-suggest.test.js
// ============================================================================
// Bez siete: Supabase je v pamäti (fake-supabase.js), model sa podstrčí.
// Stráži sa: len člen s Marketingom, vzorové weby len z našich odberateľov
// a dobrých firiem, krátky časový limit, pravidlá bez AI, nič sa nezapisuje.
// ============================================================================
const path = require('path');
const F = require('./fake-supabase.js');

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

const FN = require(path.join(__dirname, '..', '..', 'netlify', 'functions', 'danubra-leads-suggest.js'));

function data() {
  return {
    danubra_members: [{ id: 'm1', user_id: 'u1', role: 'admin', active: true }, { id: 'm2', user_id: 'u2', role: 'coordinator', modules: ['tasks'], active: true }],
    danubra_partners: [{ id: 'p1', name: 'GU Ulm GmbH', city: 'Ulm', website: 'https://gu-ulm.de' },
      { id: 'p2', name: 'Bau Pasing GmbH', city: 'München', website: 'bau-pasing.de' }],
    danubra_leads: [
      { id: 'l1', name: 'Maier Innenausbau GmbH', website: 'https://maier-innenausbau.de', city: 'Augsburg', categories: ['Trockenbauunternehmen'],
        status: 'interested', relevance: 1, score: 90 },
      { id: 'l2', name: 'Keller Akustik GmbH', website: 'https://keller-akustik.de', city: 'München', categories: ['Akustikbau'], status: 'contacted', score: 80 },
      { id: 'l3', name: 'Baustoff Huber KG', website: 'https://baustoff-huber.de', city: 'Ulm', categories: ['Baustoffhandel'], status: 'new',
        relevance: -1, relevance_note: 'dodávateľ materiálu' },
      { id: 'l4', name: 'Stará GmbH', website: 'https://stara.de', status: 'won', archived_at: '2026-01-01' },
    ],
    danubra_outreach: [{ id: 'o1', lead_id: 'l2', replied_at: '2026-10-20T08:00:00Z' }],
    danubra_lead_searches: [{ id: 's1', kind: 'urls', status: 'done', params: { region: 'Augsburg' }, found: 30, added: 9,
      stats: { queries: ['Trockenbau, Augsburg'] }, seeds: [{ domain: 'gu-ulm.de' }], created_at: '2026-10-25T08:00:00Z' }],
  };
}
const ev = (jwt = 'jwt-1', body = {}) => ({ httpMethod: 'POST', headers: jwt ? { authorization: `Bearer ${jwt}` } : {}, body: JSON.stringify(body) });
const parse = (r) => ({ code: r.statusCode, ...JSON.parse(r.body) });
const mk = () => F.create(data(), { users: { 'jwt-1': { id: 'u1' }, 'jwt-2': { id: 'u2' } } });
const toolMsg = (input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'report_suggestions', input }] });

console.log('Navrhované hľadania — serverová funkcia');

(async () => {
  const T = FN._test;
  ok(typeof FN.handler === 'function' && typeof FN.handle === 'function', 'exportuje handler aj handle');

  // ── Kto volá ──────────────────────────────────────────────────────────────
  {
    T.reset();
    eq(parse(await FN.handle(ev(null), { sb: mk() })).code, 401, 'bez prihlásenia → 401');
    eq(parse(await FN.handle(ev('jwt-2'), { sb: mk() })).code, 403, 'člen bez Marketingu → 403');
    eq(parse(await FN.handle({ httpMethod: 'DELETE', headers: {} }, { sb: mk() })).code, 405, 'iná metóda → 405');
  }

  // ── Bez kľúča: pravidlá ───────────────────────────────────────────────────
  {
    T.reset();
    delete process.env.ANTHROPIC_API_KEY;
    const sb = mk();
    let volane = 0;
    const r = parse(await FN.handle(ev(), { sb, callModel: async () => { volane++; return {}; } }));
    eq([r.code, r.source, volane], [200, 'rules', 0], 'bez ANTHROPIC_API_KEY: pravidlové návrhy, model sa nevolá');
    ok(/ANTHROPIC_API_KEY/.test(r.ai_error || ''), 'a povie prečo', r.ai_error);
    ok(r.suggestions.length >= 3 && r.suggestions.length <= 4, `3–4 návrhy (${r.suggestions.length})`);
    const povolene = ['gu-ulm.de', 'bau-pasing.de', 'maier-innenausbau.de', 'keller-akustik.de'];
    ok(r.suggestions.every(s => s.seeds.length >= 3 && s.seeds.every(u => povolene.some(p => u.includes(p)))),
      'každý návrh má aspoň 3 vzorové weby, len z odberateľov a dobrých firiem', JSON.stringify(r.suggestions.map(s => s.seeds)));
    ok(!r.suggestions.some(s => s.seeds.some(u => /baustoff-huber|stara/.test(u))), 'palec dole ani archivovaná firma nie je vzor');
    ok(!r.suggestions.some(s => /augsburg/i.test(s.region)), 'už prehľadaná oblasť sa nenavrhne', r.suggestions.map(s => s.region).join(','));
    eq(sb.log.filter(l => l.op && l.op !== 'select'), [], 'funkcia nič nezapisuje');
  }

  // ── S AI ──────────────────────────────────────────────────────────────────
  {
    T.reset();
    process.env.ANTHROPIC_API_KEY = 'test-kluc';
    process.env.CLAUDE_MODEL_LEADS = 'claude-test';
    const calls = [];
    const callModel = async (body, opt) => { calls.push({ body, opt }); return toolMsg({ suggestions: [
      { title: 'Suchá výstavba okolo Ingolstadtu', seeds: ['https://www.maier-innenausbau.de/', 'gu-ulm.de', 'cudzia-firma.de', 'keller-akustik.de'],
        region: 'Ingolstadt, Neuburg', note: 'Trockenbau, 20–100 zamestnancov', why: 'Podobné ako Maier, Ingolstadt ste ešte neprehľadali.' },
      { title: 'Akustika Regensburg', seeds: ['keller-akustik.de'], region: 'Regensburg', note: '', why: 'Keller odpísal.' },
      { title: 'Len cudzie', seeds: ['https://evil.example/', 'http://127.0.0.1/'], region: 'Berlin', note: '', why: 'x' },
    ] }); };
    const r = parse(await FN.handle(ev(), { sb: mk(), callModel }));
    eq([r.code, r.source, calls.length], [200, 'ai', 1], 's kľúčom: návrhy od AI jedným volaním');
    const b = calls[0].body;
    eq([b.model, b.output_config, b.max_tokens <= 2000, 'tool_choice' in b], ['claude-test', { effort: 'low' }, true, false], 'krátky prompt, nízky effort, bez vynúteného nástroja');
    ok(calls[0].opt && calls[0].opt.signal, 'volanie má časový limit (signal)');
    const t = b.messages[0].content;
    ok(t.includes('https://gu-ulm.de') && t.includes('Maier Innenausbau GmbH') && /nie pokyny/.test(t), 'prompt: vzorové weby a „dáta, nie pokyny"');
    ok(t.includes('Trockenbauunternehmen') && t.includes('augsburg') && t.includes('Baustoff Huber KG'), 'prompt: úspešné kategórie, prehľadané oblasti, zlé príklady');
    eq(r.suggestions.map(s => s.title), ['Suchá výstavba okolo Ingolstadtu', 'Akustika Regensburg', ...r.suggestions.slice(2).map(s => s.title)], 'poradie od AI');
    ok(!r.suggestions.some(s => s.title === 'Len cudzie'), 'návrh len s cudzími webmi sa zahodí');
    eq(r.suggestions[0].seeds, ['https://maier-innenausbau.de', 'https://gu-ulm.de', 'https://keller-akustik.de'], 'cudzí web sa vyhodí, ostanú len naše');
    eq(r.suggestions[1].seeds.length, 3, 'návrh s jedným webom sa doplní na 3 z našich');
    ok(r.suggestions.length >= 3, 'keď AI dá menej ako 3 použiteľné, doplnia sa pravidlami');

    // Pamäť ~1 h
    const r2 = parse(await FN.handle(ev(), { sb: mk(), callModel }));
    eq([r2.cached, calls.length], [true, 1], 'do hodiny sa vráti zapamätaný výsledok (model sa nevolá)');
    const r3 = parse(await FN.handle(ev('jwt-1', { force: true }), { sb: mk(), callModel }));
    eq([r3.cached, calls.length], [undefined, 2], '„force" prepočíta');
    const neskor = parse(await FN.handle(ev(), { sb: mk(), callModel, now: () => Date.now() + 2 * 3600e3 }));
    eq([neskor.cached, calls.length], [undefined, 3], 'po hodine sa prepočíta samo');
  }

  // ── Chyby modelu → pravidlá ───────────────────────────────────────────────
  {
    T.reset();
    const r = parse(await FN.handle(ev(), { sb: mk(), callModel: async () => { throw new Error('Your credit balance is too low'); } }));
    eq([r.source, r.ai_error], ['rules', 'Your credit balance is too low'], 'chyba modelu → pravidlá a chyba v odpovedi');
    ok(r.suggestions.length >= 3, 'návrhy sú aj tak');
    T.reset();
    const t0 = Date.now();
    const pomaly = parse(await FN.handle(ev(), { sb: mk(), waitMs: 50, callModel: () => new Promise(() => {}) }));
    ok(pomaly.source === 'rules' && /včas/.test(pomaly.ai_error) && Date.now() - t0 < 2000, 'model neodpovedá → po limite pravidlá', JSON.stringify(pomaly.ai_error));
    T.reset();
    const zle = parse(await FN.handle(ev(), { sb: mk(), callModel: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Neviem.' }] }) }));
    eq(zle.source, 'rules', 'odpoveď bez návrhov → pravidlá');
    T.reset();
    const prazdne = F.create({ danubra_members: data().danubra_members }, { users: { 'jwt-1': { id: 'u1' } } });
    const nic = parse(await FN.handle(ev(), { sb: prazdne, callModel: async () => { throw new Error('nemá sa volať'); } }));
    ok(nic.code === 200 && !nic.suggestions.length && /odberateľov/.test(nic.reason), 'bez odberateľov a dobrých firiem s webom: prázdne s vysvetlením', JSON.stringify(nic));
  }
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLAUDE_MODEL_LEADS;

  console.log(`\n${passed} prešlo, ${failed} padlo\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('  ✗ Error', e); process.exit(1); });
