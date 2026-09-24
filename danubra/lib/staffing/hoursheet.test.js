// ============================================================================
// Testy týždenného výkazu (Stundennachweis)
// Spustenie:  node danubra/lib/staffing/hoursheet.test.js
// ============================================================================
// KW na papieri číta nemecký odberateľ ako ISO 8601. Keď sa pomýlime
// o týždeň, podpíše výkaz za iné dni, než sa odrobili — a faktúra potom
// nesedí s podkladom.
// ============================================================================
global.window = global;
const H = require('./hoursheet');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

console.log('Stundennachweis');

// ── ISO týždeň ──────────────────────────────────────────────────────────────
{
  eq(H.isoWeek('2026-09-24'), { year: 2026, week: 39 }, 'štvrtok 24. 9. 2026 je KW 39');
  eq(H.isoWeek('2026-09-21'), { year: 2026, week: 39 }, 'pondelok toho istého týždňa tiež');
  eq(H.isoWeek('2026-09-27'), { year: 2026, week: 39 }, 'aj nedeľa — týždeň končí ňou');
  eq(H.isoWeek('2026-09-28'), { year: 2026, week: 40 }, 'ďalší pondelok je už KW 40');
}
// Prelom roka je to, na čom sa to najčastejšie pokazí.
{
  eq(H.isoWeek('2027-01-01'), { year: 2026, week: 53 },
    '1. 1. 2027 patrí do 53. týždňa roka 2026, nie do prvého týždňa 2027');
  eq(H.isoWeek('2026-01-01'), { year: 2026, week: 1 },
    '1. 1. 2026 je štvrtok, takže prvý týždeň patrí roku 2026');
  eq(H.isoWeek('2025-12-29'), { year: 2026, week: 1 },
    'a pondelok pred ním už tiež — týždeň patrí tam, kde je štvrtok');
  eq(H.weeksInYear(2026), 53, 'rok 2026 má 53 týždňov');
  // 28. december je podľa ISO vždy v poslednom týždni svojho roka.
  eq(H.weeksInYear(2025), 52, 'rok 2025 má 52 týždňov');
}

// ── Dátumy týždňa ───────────────────────────────────────────────────────────
{
  const d = H.weekDates(2026, 39);
  eq(d.length, 6, 'na papieri je šesť dní — nedeľa tam nie je');
  eq(d[0].date, '2026-09-21', 'začína pondelkom');
  eq(d[5].date, '2026-09-26', 'a končí sobotou');
  eq(d[0].de, 'Montag', 'po nemecky, lebo to číta odberateľ');
  eq(d[5].de, 'Samstag', 'vrátane soboty — na nemeckých stavbách sa robí');
}
{
  // Prelom roka musí dať dátumy z oboch rokov.
  const d = H.weekDates(2026, 53);
  eq([d[0].date, d[5].date], ['2026-12-28', '2027-01-02'],
    '53. týždeň 2026 prechádza do januára 2027');
}

// ── Posun o týždeň ──────────────────────────────────────────────────────────
{
  eq(H.shiftWeek(2026, 39, 1), { year: 2026, week: 40 }, 'ďalší týždeň');
  eq(H.shiftWeek(2026, 39, -1), { year: 2026, week: 38 }, 'predošlý týždeň');
  eq(H.shiftWeek(2026, 53, 1), { year: 2027, week: 1 }, 'z 53. týždňa sa preklopí do nového roka');
  eq(H.shiftWeek(2026, 1, -1), { year: 2025, week: 52 }, 'a späť do starého');
}

// ── Zostavenie výkazu ───────────────────────────────────────────────────────
const WORKERS = [
  { id: 'w1', full_name: 'Ján Novák' },
  { id: 'w2', full_name: 'Peter Kováč' },
];
const ts = (w, date, hours, extra = {}) =>
  ({ worker_id: w, work_date: date, hours, ...extra });

{
  const s = H.build({
    year: 2026, week: 39, workers: WORKERS,
    timesheets: [
      ts('w1', '2026-09-21', 9, { time_from: '07:00', time_to: '16:30' }),
      ts('w2', '2026-09-21', 8, { time_from: '07:00', time_to: '16:30' }),
      ts('w1', '2026-09-22', 9),
      ts('w1', '2026-09-26', 5),                       // sobota
      ts('w1', '2026-09-27', 4),                       // nedeľa — mimo papiera
      ts('w1', '2026-10-05', 8),                       // iný týždeň
      ts('w9', '2026-09-21', 8),                       // nie je v partii
    ],
  });

  eq(s.rows[0].hours, [9, 9, 0, 0, 0, 5], 'hodiny sedia na dni');
  eq(s.rows[0].total, 23, 'a spolu za človeka');
  eq(s.rows[1].total, 8, 'druhý človek má svoje');
  eq(s.perDay, [17, 9, 0, 0, 0, 5], 'súčty po dňoch');
  eq(s.total, 31, 'celkový súčet');
  ok(!s.empty, 'výkaz nie je prázdny');
  // Nedeľa, iný týždeň ani cudzí človek sa nesmú dostať na papier.
  eq(s.total, 31, 'nedeľa, iný týždeň ani cudzí človek sa nerátajú');
}
{
  const s = H.build({ year: 2026, week: 39, workers: WORKERS, timesheets: [] });
  eq(s.total, 0, 'prázdny týždeň je nula');
  ok(s.empty, 'a vie o sebe, že je prázdny');
  eq(s.rows.length, 2, 'ale riadky ľudí tam sú — papier sa tlačí aj prázdny');
}

// ── Čas od–do ───────────────────────────────────────────────────────────────
// Na papieri je jeden riadok pre celý deň. Keď sa ľudia rozchádzajú, musí
// byť vidieť, že to nie je jeden čas pre všetkých.
{
  const s = H.build({
    year: 2026, week: 39, workers: WORKERS,
    timesheets: [
      ts('w1', '2026-09-21', 9, { time_from: '07:00', time_to: '16:30' }),
      ts('w2', '2026-09-21', 9, { time_from: '07:00', time_to: '16:30' }),
    ],
  });
  eq(H.spanText(s.span[0]), '07:00 – 16:30', 'rovnaký čas sa zapíše normálne');
  ok(!s.span[0].mixed, 'a nie je označený ako rozdielny');
}
{
  const s = H.build({
    year: 2026, week: 39, workers: WORKERS,
    timesheets: [
      ts('w1', '2026-09-21', 9, { time_from: '07:00', time_to: '16:30' }),
      ts('w2', '2026-09-21', 6, { time_from: '09:00', time_to: '15:00' }),
    ],
  });
  ok(s.span[0].mixed, 'rôzne časy sa označia');
  eq(H.spanText(s.span[0]), '07:00 – 16:30 *',
    'a na papieri je najskorší začiatok a najneskorší koniec s hviezdičkou');
}
{
  eq(H.spanText(null), '', 'bez času sa nepíše nič');
  eq(H.spanText({ from: '07:00', to: null }), '07:00 – …',
    'a keď chýba koniec, je to vidieť');
}

// ── Hodiny na papieri ───────────────────────────────────────────────────────
{
  eq(H.hoursText(9), '9', 'celé hodiny bez desatín');
  eq(H.hoursText(8.5), '8,5', 'nemecká desatinná čiarka');
  eq(H.hoursText(0), '', 'nula sa na papier nepíše — prázdne políčko je čitateľnejšie');
  eq(H.hoursText(null), '', 'ani keď nič nepríde');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
