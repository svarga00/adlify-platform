// ============================================================================
// Testy číselných radov (náhľad a pravidlá ako v migrácii 094)
// Spustenie:  node app/lib/numbering.test.js
// ============================================================================
// Databázovú časť (zámok, preskočenie obsadeného čísla, nižšie číslo než
// použité, kolízia s dokladom, práva) stráži schema.test.js nad textom
// migrácie a bola overená na skutočnom Postgres. Tu je logika formátu,
// ktorú appka ukazuje v Nastaveniach ako náhľad — musí dať presne to isté
// číslo ako databáza.
// ============================================================================
const N = require('./numbering.js');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
const ok = (c, msg) => eq(!!c, true, msg);

console.log('predvolené formáty: rok + kód druhu + 4 číslice');
{
  const want = { invoice: '2026010001', order: '2026020001', quote: '2026040001', contract: '2026050001',
    amendment: '2026060001', subcontract: '2026070001', credit_note: '2026080001', self_bill: '2026090001',
    worker_contract: '2026100001' };
  for (const [k, v] of Object.entries(want)) eq(N.preview(k, {}, 2026), v, `${N.BY_KIND[k].label}: ${v}`);
  const codes = N.SERIES.map(s => s.defaults.code);
  eq(new Set(codes).size, codes.length, 'kódy druhov sú jedinečné');
  ok(N.SERIES.every(s => N.vsOf(N.preview(s.kind, {}, 2026)).length === 10), 'každé číslo má 10 číslic (celé je variabilný symbol)');
}

console.log('\nďalšie číslo a nový rok');
{
  eq(N.preview('invoice', { year: 2026, current: 136 }, 2026), '2026010137', 'pokračuje po 136 → 137');
  eq(N.preview('invoice', { year: 2025, current: 900 }, 2026), '2026010001', 'v januári od 1');
  eq(N.preview('quote', { year: 2025, current: 41, prefix: 'PON', separator: '-', code: '', year_style: 'none' }, 2026), 'PON-0042',
    'bez roka v čísle sa rad v januári nevynuluje (inak by sa čísla opakovali)');
  eq(N.preview('invoice', { year: 2026, current: 9999 }, 2026), '20260110000', '10 000. faktúra sa neoreže');
  eq(N.preview('invoice', { current: 5 }, 2026), '2026010001', 'rad bez roka v stave začne od 1 (ako databáza)');
}

console.log('\nformát sa dá prepnúť späť na predpony');
{
  const old = { prefix: 'OBJ', year_style: 'yyyy', code: '', separator: '-', digits: 4 };
  eq(N.format(old, 2026, 42), 'OBJ-2026-0042', 'OBJ-2026-0042');
  eq(N.format({ prefix: 'ZML', year_style: 'yy', code: '', separator: '/', digits: 3 }, 2026, 7), 'ZML/26/007', 'krátky rok a lomka');
  eq(N.format({ prefix: 'FA', year_style: 'yyyy', code: '01', separator: '', digits: 5 }, 2026, 3), 'FA20260100003', 'predpona + rok + kód + poradie');
  eq(N.format({ prefix: '', year_style: 'yyyy', code: '09', separator: '-', digits: 3 }, 2026, 5, 'NOVAK'), 'NOVAK-2026-09-005',
    'faktúra za živnostníka s predponou z jeho karty');
  eq(N.preview('self_bill', { per_worker: true, code: '', separator: '-', digits: 3 }, 2026), 'NOVAK-2026-001',
    'rad podľa živnostníka: príklad s predponou NOVAK');
  eq(N.formatOf('invoice', { prefix: 'F', current: 3, year: 2026 }),
    { prefix: 'F', year_style: 'yyyy', code: '01', separator: '', digits: 4 }, 'formát = predvolený + uložené kľúče (bez počítadla)');
}

console.log('\nkontrola formátu pred uložením (to isté stráži danubra_set_series)');
{
  const all = Object.fromEntries(N.SERIES.map(s => [s.kind, N.formatOf(s.kind, {})]));
  const f = (o) => ({ ...N.formatOf('invoice', {}), ...o });
  eq(N.validate('invoice', f({}), { all, year: 2026 }), [], 'predvolený formát faktúr je v poriadku');
  ok(N.validate('invoice', f({ code: '02' }), { all })[0].includes('Kód 02 už má rad „Objednávky"'), 'kód iného radu nie');
  ok(N.validate('invoice', f({ code: '1' }), { all })[0].includes('dve číslice'), 'kód má dve číslice');
  ok(N.validate('invoice', f({ digits: 5 }), { all, year: 2026 }).some(e => /Variabilný symbol by mal 11/.test(e)),
    'variabilný symbol by mal 11 číslic → nie');
  ok(N.validate('invoice', f({ digits: 2 }), { all }).some(e => /3 až 7/.test(e)), 'menej ako 3 číslice nie');
  ok(N.validate('invoice', f({ prefix: 'FÁ' }), { all }).some(e => /Predpona/.test(e)), 'predpona bez diakritiky');
  ok(N.validate('invoice', f({ separator: '_' }), { all }).some(e => /Oddeľovač/.test(e)), 'len -, / alebo nič');
  ok(N.validate('invoice', f({ year_style: 'x' }), { all }).some(e => /Rok/.test(e)), 'rok 2026, 26 alebo bez');
  ok(N.validate('invoice', f({}), { all, next: 0 }).some(e => /aspoň 1/.test(e)), 'ďalšie číslo aspoň 1');
  ok(N.validate('credit_note', { ...N.formatOf('credit_note', {}), code: '' }, { all: { ...all, quote: { ...all.quote, code: '' } } }).some(e => /rovnaký ako v rade/.test(e)),
    'dva rady s rovnakým formátom nie (číslo by neprezradilo druh)');
  eq(N.validate('order', { prefix: 'OBJ', year_style: 'yyyy', code: '', separator: '-', digits: 4 }, { all }), [],
    'späť na OBJ-2026-0001 sa dá');
  ok(N.validate('self_bill', { ...N.formatOf('self_bill', {}), per_worker: true, prefix: 'X' }, { all }).some(e => /karte/.test(e)),
    'rad podľa živnostníka: predpona je na jeho karte');
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
