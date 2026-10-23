// ============================================================================
// Testy čítania odpovede modelu
// Spustenie:  node app/lib/ai.test.js
// ============================================================================
// Tieto testy existujú kvôli chybe, ktorá bola v appke štyrikrát a ani raz sa
// neprejavila v testoch:
//
//   tool_choice: { type: 'tool', name: '…' }
//   → „tool_choice: type "tool" and "any" are not supported for this model"
//
// Všetky štyri funkcie, ktoré sa pýtajú modelu, padali hneď na prvom volaní.
// Nikto to nezistil, lebo testy sa k modelu nikdy nedostanú — a tak sa tu
// testuje aspoň **to, čo sa dá**: tvar požiadavky a čítanie odpovede.
// ============================================================================
global.window = global;
const A = require('./ai.js');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg, detail) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${detail ? `\n    ${detail}` : ''}`); }
}

console.log('Odpoveď modelu');

const TOOL = { name: 'stavby_z_dopytu', description: 'x', input_schema: { type: 'object' } };

// ── Telo požiadavky ─────────────────────────────────────────────────────────
{
  const b = A.body({ model: 'claude-sonnet-5-5', tool: TOOL, prompt: 'Rozdeľ dopyt.' });

  // **Toto je tá chyba.** Keď sa `tool_choice` vráti, celé volanie zlyhá
  // skôr, než sa model na zadanie pozrie.
  ok(!('tool_choice' in b), 'požiadavka nevynucuje nástroj — model to neprijme',
    JSON.stringify(Object.keys(b)));

  eq(b.model, 'claude-sonnet-5-5', 'model ide podľa zadania');
  eq(b.tools.length, 1, 'nástroj je jeden');
  eq(b.tools[0].name, 'stavby_z_dopytu', 'a je to ten náš');
  ok(b.messages[0].content.includes('Rozdeľ dopyt.'), 'zadanie je v správe');
  // Keď sa nástroj nedá vynútiť, treba o to aspoň poprosiť.
  ok(b.messages[0].content.includes('ODPOVEDZ CEZ NÁSTROJ stavby_z_dopytu'),
    'a v texte je povedané, že odpoveď má ísť nástrojom');
  eq(b.max_tokens, 8000, 'predvolená dĺžka odpovede');
  eq(A.body({ model: 'm', tool: TOOL, prompt: 'x', maxTokens: 16000 }).max_tokens, 16000,
    'dá sa prepísať');

  let padlo = false;
  try { A.body({ tool: TOOL, prompt: 'x' }); } catch { padlo = true; }
  ok(padlo, 'bez modelu to nezostaví tichú polovičnú požiadavku');
  padlo = false;
  try { A.body({ model: 'm', prompt: 'x' }); } catch { padlo = true; }
  ok(padlo, 'ani bez nástroja');
}

// ── Čítanie odpovede ────────────────────────────────────────────────────────
{
  const cez = { content: [{ type: 'tool_use', name: 'stavby_z_dopytu', input: { projects: [1] } }] };
  eq(A.pickTool(cez, 'stavby_z_dopytu'), { projects: [1] }, 'použitý nástroj sa prečíta');
  eq(A.pickTool(cez), { projects: [1] }, 'aj bez mena nástroja');
  eq(A.pickTool({ content: [{ type: 'tool_use', name: 'ine', input: { a: 1 } }] }, 'stavby_z_dopytu'),
    null, 'cudzí nástroj sa neberie');

  // Keď sa nástroj nedá vynútiť, model niekedy odpovie textom. Obsah je
  // v poriadku — zahodiť ho preto, že neprišiel správnou cestou, by bola škoda.
  const blok = { content: [{ type: 'text',
    text: 'Jasné, tu to máš:\n```json\n{"projects":[{"city":"Hammelburg"}]}\n```\nDúfam, že pomohlo.' }] };
  eq(A.pickTool(blok), { projects: [{ city: 'Hammelburg' }] }, 'JSON v bloku sa prečíta');

  const holy = { content: [{ type: 'text', text: '{"projects":[{"city":"Ulm"}]}' }] };
  eq(A.pickTool(holy), { projects: [{ city: 'Ulm' }] }, 'aj holý JSON');

  const vovete = { content: [{ type: 'text',
    text: 'Našiel som dve stavby. {"found": 2} Toľko.' }] };
  eq(A.pickTool(vovete), { found: 2 }, 'aj JSON uprostred vety');

  // Zátvorka v reťazci nesmie pokaziť párovanie.
  const zatvorka = { content: [{ type: 'text',
    text: '{"title":"Stavba { s zátvorkou }","n":1}' }] };
  eq(A.pickTool(zatvorka), { title: 'Stavba { s zátvorkou }', n: 1 },
    'zložená zátvorka v texte nerozbije čítanie');

  // Nástroj má prednosť pred textom, keď sú oba.
  const oboje = { content: [
    { type: 'text', text: '{"zle":true}' },
    { type: 'tool_use', name: 'x', input: { spravne: true } },
  ] };
  eq(A.pickTool(oboje), { spravne: true }, 'nástroj má prednosť pred textom');

  // Odpoveď modelu je cudzí vstup — nesmie nič zhodiť.
  eq(A.pickTool(null), null, 'prázdna odpoveď nespadne');
  eq(A.pickTool({}), null, 'odpoveď bez obsahu nespadne');
  eq(A.pickTool({ content: 'nie pole' }), null, 'obsah, ktorý nie je pole, nespadne');
  eq(A.pickTool({ content: [{ type: 'text', text: 'Neviem to spraviť.' }] }), null,
    'text bez JSON vráti nič — a volajúci povie zrozumiteľnú chybu');
  eq(A.pickTool({ content: [{ type: 'text', text: '{nie je to JSON}' }] }), null,
    'rozbitý JSON sa nevydáva za odpoveď');
  eq(A.pickTool({ content: [{ type: 'text', text: '[1,2,3]' }] }), null,
    'pole nie je odpoveď — čaká sa objekt');
  eq(A.pickTool({ content: [{ type: 'tool_use', name: 'x' }] }), null,
    'nástroj bez vstupu nie je odpoveď');
}

// ── Chybová hláška ──────────────────────────────────────────────────────────
{
  eq(A.errorText({ error: { message: 'credit balance is too low' } }, 400, 'Analýza'),
    'credit balance is too low', 'hláška od API má prednosť — je najpresnejšia');
  ok(/neplatí/.test(A.errorText({}, 401, 'Analýza')), 'pri 401 sa povie, že je to kľúč');
  ok(/zahltený/.test(A.errorText({}, 429, 'Analýza')), 'pri 429, že je zahltený');
  ok(/výpadok/.test(A.errorText({}, 503, 'Analýza')), 'pri 5xx, že má výpadok');
  ok(/Analýza — volanie modelu zlyhalo \(418\)/.test(A.errorText({}, 418, 'Analýza')),
    'inak aspoň čo a s akým kódom', A.errorText({}, 418, 'Analýza'));
  // „Analýza zlyhalo" je nezmysel — nálepka nesmie byť podmetom vety.
  ok(!/Analýza zlyhalo/.test(A.errorText({}, 418, 'Analýza')), 'a po slovensky');
}

// ── Prílohy (PDF, fotka) ────────────────────────────────────────────────────
{
  const pdf = A.attachment('JVBERi0=', 'application/pdf');
  eq(pdf.type, 'document', 'PDF ide ako dokument');
  eq(A.attachment('x', 'image/png').type, 'image', 'fotka ako obrázok');
  eq(A.attachment('x', 'application/zip'), null, 'iný súbor model neprečíta');
  eq(A.attachment('', 'application/pdf'), null, 'prázdny súbor nič');
  const b = A.body({ model: 'm', tool: { name: 't' }, prompt: 'Prečítaj', docs: [pdf] });
  const c = b.messages[0].content;
  ok(Array.isArray(c) && c[0].type === 'document' && c[1].type === 'text' && /Prečítaj/.test(c[1].text),
    'príloha je pred zadaním');
  eq(typeof A.body({ model: 'm', tool: { name: 't' }, prompt: 'x' }).messages[0].content, 'string',
    'bez prílohy zostáva obyčajný text');
}

// ── Stream (SSE) ────────────────────────────────────────────────────────────
(async () => {
  const ev = (o) => `event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`;
  const sse = [
    ev({ type: 'message_start', message: { id: 'm1', model: 'claude-opus-5-5', usage: { input_tokens: 10 } } }),
    ev({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } }),
    ev({ type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } }),
    ev({ type: 'content_block_stop', index: 0 }),
    ev({ type: 'content_block_start', index: 1, content_block: { type: 'server_tool_use', id: 's1', name: 'web_search', input: {} } }),
    ev({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"query":"Bau' } }),
    ev({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: 'firma Ulm"}' } }),
    ev({ type: 'content_block_stop', index: 1 }),
    ev({ type: 'content_block_start', index: 2, content_block: { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: 'https://x.de' }] } }),
    ev({ type: 'content_block_stop', index: 2 }),
    ev({ type: 'content_block_start', index: 3, content_block: { type: 'tool_use', id: 't1', name: 'report_leads', input: {} } }),
    ev({ type: 'content_block_delta', index: 3, delta: { type: 'input_json_delta', partial_json: '{"leads":[{"name":"Müller"}]}' } }),
    ev({ type: 'content_block_stop', index: 3 }),
    ev({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 42 } }),
    ev({ type: 'message_stop' }),
  ].join('');
  // Rozsekané na kúsky, ako to príde po sieti.
  const parts = []; for (let i = 0; i < sse.length; i += 37) parts.push(Buffer.from(sse.slice(i, i + 37)));
  async function* gen() { for (const p of parts) yield new Uint8Array(p); }
  const m = await A.readStream(gen());
  eq(m.content.map(c => c.type), ['thinking', 'server_tool_use', 'web_search_tool_result', 'tool_use'], 'stream: bloky v poradí');
  eq(m.content[0].signature, 'sig', 'podpis myslenia sa zachová (treba ho poslať späť pri pokračovaní)');
  eq(m.content[1].input, { query: 'Baufirma Ulm' }, 'vstup nástroja poskladaný z kúskov');
  eq(A.pickTool(m, 'report_leads'), { leads: [{ name: 'Müller' }] }, 'výsledok cez nástroj');
  eq([m.stop_reason, m.usage.output_tokens, m.model], ['tool_use', 42, 'claude-opus-5-5'], 'dôvod konca a spotreba');
  console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
  process.exit(failed ? 1 : 0);
})();
