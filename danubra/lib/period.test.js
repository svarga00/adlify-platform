// ============================================================================
// Testy období
// Spustenie:  node danubra/lib/period.test.js
// ============================================================================
// Obdobie rozhoduje o tom, aké číslo človek uvidí. Keď sa pomýli hranica
// o deň, faktúra spadne do zlého mesiaca a marža nesedí s účtovníctvom.
// ============================================================================
global.window = global;
const P = require('./period');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

console.log('Obdobia');

// ── Hranice mesiaca ─────────────────────────────────────────────────────────
{
  const r = P.range('month', '2026-09-24');
  eq([r.from, r.to], ['2026-09-01', '2026-09-30'], 'september má 30 dní');
  const okt = P.range('month', '2026-10-15');
  eq([okt.from, okt.to], ['2026-10-01', '2026-10-31'], 'október 31');
  const feb = P.range('month', '2026-02-10');
  eq([feb.from, feb.to], ['2026-02-01', '2026-02-28'], 'február v nepriestupnom roku');
  const feb24 = P.range('month', '2024-02-10');
  eq([feb24.from, feb24.to], ['2024-02-01', '2024-02-29'], 'a v priestupnom má 29');
}

// ── Minulý mesiac, aj cez prelom roka ───────────────────────────────────────
{
  const r = P.range('prev_month', '2026-09-24');
  eq([r.from, r.to], ['2026-08-01', '2026-08-31'], 'minulý mesiac');
  const jan = P.range('prev_month', '2026-01-15');
  eq([jan.from, jan.to], ['2025-12-01', '2025-12-31'],
    'v januári je minulým mesiacom december minulého roka');
}

// ── Štvrťrok ────────────────────────────────────────────────────────────────
{
  eq([P.range('quarter', '2026-01-05').from, P.range('quarter', '2026-01-05').to],
    ['2026-01-01', '2026-03-31'], 'prvý štvrťrok');
  eq([P.range('quarter', '2026-09-24').from, P.range('quarter', '2026-09-24').to],
    ['2026-07-01', '2026-09-30'], 'tretí štvrťrok');
  eq([P.range('quarter', '2026-12-31').from, P.range('quarter', '2026-12-31').to],
    ['2026-10-01', '2026-12-31'], 'štvrtý končí Silvestrom');
}

// ── Rok a bez ohraničenia ───────────────────────────────────────────────────
{
  const y = P.range('year', '2026-06-06');
  eq([y.from, y.to], ['2026-01-01', '2026-12-31'], 'celý rok');
  const all = P.range('all', '2026-06-06');
  eq([all.from, all.to], [null, null], 'bez ohraničenia');
  // Neznámy kľúč nesmie vyrobiť prázdny rozsah — spadlo by na tom celé číslo.
  eq(P.range('nieco-cudzie', '2026-09-24').key, 'month',
    'neznáme obdobie padne na tento mesiac, nie na prázdno');
}

// ── Čo do obdobia patrí ─────────────────────────────────────────────────────
{
  const r = P.range('month', '2026-09-24');
  ok(P.covers(r, '2026-09-01'), 'prvý deň patrí dnu');
  ok(P.covers(r, '2026-09-30'), 'aj posledný');
  ok(!P.covers(r, '2026-08-31'), 'deň pred nie');
  ok(!P.covers(r, '2026-10-01'), 'ani deň po');
  ok(P.covers(r, '2026-09-15T10:30:00Z'), 'časová pečiatka sa oreže na dátum');
  // Záznam bez dátumu sa do obdobia nepočíta — inak by sa objavoval všade.
  ok(!P.covers(r, null), 'záznam bez dátumu do obdobia nepatrí');
  ok(P.covers(P.range('all'), null), 'ale pri „za celý čas" prejde všetko');
}

// ── Filtrovanie ─────────────────────────────────────────────────────────────
{
  const rows = [
    { id: 'a', d: '2026-08-31' },
    { id: 'b', d: '2026-09-01' },
    { id: 'c', d: '2026-09-30' },
    { id: 'd', d: '2026-10-01' },
    { id: 'e', d: null },
  ];
  const r = P.range('month', '2026-09-24');
  eq(P.filter(rows, r, 'd').map(x => x.id), ['b', 'c'], 'filtruje podľa stĺpca');
  eq(P.filter(rows, P.range('all'), 'd').length, 5, 'bez ohraničenia prejde všetko');
  eq(P.filter(rows, r, (x) => x.d).map(x => x.id), ['b', 'c'], 'dátum sa dá aj dopočítať');
  eq(P.filter(null, r, 'd'), [], 'bez riadkov prázdne pole, nie pád');
}

// ── Veta pod číslo ──────────────────────────────────────────────────────────
{
  eq(P.text(P.range('month', '2026-09-24')), 'tento mesiac (1. 9. – 30. 9.)',
    'povie, za čo to číslo je');
  eq(P.text(P.range('all')), 'za celý čas', 'aj keď je to bez ohraničenia');
  eq(P.text(null), 'za celý čas', 'a bez obdobia nepadne');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
