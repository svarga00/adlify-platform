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

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
