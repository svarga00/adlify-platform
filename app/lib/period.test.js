// ============================================================================
// Testy období
// Spustenie:  node app/lib/period.test.js
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

// ── Vlastné obdobie ─────────────────────────────────────────────────────────
// Toto je tá voľba, ktorú si človek pýta, keď potrebuje presne to, čo
// mesiace a štvrťroky nepokrývajú — napríklad od podpisu zmluvy po dnešok.
{
  const r = P.range('custom', '2026-09-24', { from: '2026-08-15', to: '2026-09-10' });
  eq([r.from, r.to], ['2026-08-15', '2026-09-10'], 'presné hranice');
  eq(P.text(r), '15. 8. 2026 – 10. 9. 2026', 'a povedia sa aj s rokom');

  // Jedna hranica je zmysluplná otázka a nemá sa odmietať.
  const odkedy = P.range('custom', '2026-09-24', { from: '2026-08-15' });
  eq([odkedy.from, odkedy.to], ['2026-08-15', null], 'len „od" stačí');
  eq(P.text(odkedy), 'od 15. 8. 2026', 'a vie to povedať');
  const dokedy = P.range('custom', '2026-09-24', { to: '2026-09-10' });
  eq([dokedy.from, dokedy.to], [null, '2026-09-10'], 'len „do" tiež');

  // Obrátené hranice sú preklep, nie zámer.
  const swapped = P.range('custom', '2026-09-24', { from: '2026-09-10', to: '2026-08-15' });
  eq([swapped.from, swapped.to], ['2026-08-15', '2026-09-10'],
    'obrátené hranice sa prehodia, nevyjde prázdno');

  // Prázdne vlastné obdobie sa musí dať rozoznať od „za celý čas".
  const none = P.range('custom', '2026-09-24', {});
  ok(none.empty, 'bez hraníc to o sebe vie');

  const rows = [{ d: '2026-08-14' }, { d: '2026-08-15' }, { d: '2026-09-10' }, { d: '2026-09-11' }];
  eq(P.filter(rows, r, 'd').map(x => x.d), ['2026-08-15', '2026-09-10'],
    'filtruje presne podľa zadaných hraníc');
}

// ── Názov súboru pri exporte ────────────────────────────────────────────────
{
  eq(P.slug(P.range('month', '2026-09-24')), '2026-09-01_2026-09-30',
    'do názvu súboru ide obdobie, nech sa exporty nepomiešajú');
  eq(P.slug(P.range('all')), 'vsetko', 'bez ohraničenia je to „vsetko"');
  eq(P.slug(P.range('custom', '2026-09-24', { from: '2026-08-15' })), '2026-08-15_dnes',
    'otvorený koniec sa pomenuje, nie vynechá');
}

// ── Veta pod číslo ──────────────────────────────────────────────────────────
{
  eq(P.text(P.range('month', '2026-09-24')), 'tento mesiac (1. 9. – 30. 9.)',
    'povie, za čo to číslo je');
  eq(P.text(P.range('all')), 'za celý čas', 'aj keď je to bez ohraničenia');
  eq(P.text(null), 'za celý čas', 'a bez obdobia nepadne');
}

// ── Krátky tvar doprostred vety ─────────────────────────────────────────────
// „70 h za tento mesiac čaká na uzavretie" — tam sa zátvorky z `text()`
// nezmestia a druhý rok prekáža.
{
  eq(P.short(P.range('month', '2026-09-24')), 'tento mesiac', 'bez zátvoriek');
  eq(P.short(P.range('prev_month', '2026-09-24')), 'minulý mesiac', 'aj minulý');
  eq(P.short(P.range('all')), 'celý čas', 'predložka „za" je vo vete, nie tu');
  eq(P.short(null), 'celý čas', 'bez obdobia nepadne');
  eq(P.short(P.range('custom', '2026-09-24', { from: '2026-08-15', to: '2026-09-20' })),
    'obdobie 15. 8. – 20. 9. 2026', 'rovnaký rok sa píše raz');
  eq(P.short(P.range('custom', '2026-09-24', { from: '2025-12-20', to: '2026-01-10' })),
    'obdobie 20. 12. 2025 – 10. 1. 2026', 'cez prelom roka oba roky');
  eq(P.short(P.range('custom', '2026-09-24', { from: '2026-08-15' })), 'obdobie od 15. 8. 2026',
    'otvorený koniec');
  eq(P.short(P.range('custom', '2026-09-24', { to: '2026-09-20' })), 'obdobie do 20. 9. 2026',
    'otvorený začiatok');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
