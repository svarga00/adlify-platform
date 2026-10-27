// ============================================================================
// Testy čítania Stundennachweisu z fotky
// Spustenie:  node app/lib/staffing/hourscan.test.js
// ============================================================================
// Z tohto listu sa fakturuje. Hodina navyše je faktúra, ktorú odberateľ
// vráti; hodina menej sú peniaze, ktoré nikto nevymáha. Preto sa tu
// skúšajú dva skutočné listy z KW 43/2026 — partia aj jednotlivec.
// ============================================================================
global.window = global;
const S = require('./hourscan');

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
const codes = (w) => w.map((x) => x.code);

// ── Skutočné listy (tak, ako by ich vrátil model) ───────────────────────────
// Partia, KW 19.–24. 10. 2026: spoločný čas od–do, pauza „/", štyri mená.
const GROUP = {
  kw_from: null,
  days: [
    { weekday: 1, date_text: '19.10.', date: null, from: '6:00', to: '16:00', pause_text: '/' },
    { weekday: 2, date_text: '20.10.', from: '8:00', to: '15:00', pause_text: '/' },
    { weekday: 3, date_text: '21.10.', from: '6:00', to: '15:00', pause_text: '/' },
    { weekday: 4, date_text: '22.10.', from: '6:00', to: '15:00', pause_text: '/' },
    { weekday: 5, date_text: '23.10.', from: '6:00', to: '15:00', pause_text: '/' },
    { weekday: 6, date_text: '24.10.', from: '6:00', to: '12:00', pause_text: '/' },
  ],
  rows: [
    ['Pesbousky S.', ['10', '/', '9', '9', '9', '6'], '43'],
    ['Mynárik P.', ['10', '7', '9', '9', '9', '6'], '50'],
    ['Ákos P.', ['10', '7', '9', '9', '9', '6'], '50'],
    ['Bokros M.', ['10', '7', '9', '9', '9', '6'], '50'],
  ].map(([name_raw, h, total_text]) => ({
    name_raw, total_text,
    per_day: h.map((hours_text, i) => ({ weekday: i + 1, hours_text })),
  })),
  total_text: '193',
  signed: true, signer_name: null, confidence: 'high', unclear: [],
};

// Jednotlivec, ten istý týždeň: vlastný čas, pauza 45 min, piatok „10 STD/15 min".
const SINGLE = {
  kw_from: '2026-10-19',
  days: [
    ['19.10.2026', '07:00', '17:45', 45], ['20.10.2026', '06:00', '16:45', 45],
    ['21.10.2026', '06:00', '16:45', 45], ['22.10.2026', '06:00', '16:45', 45],
    ['23.10.2026', '06:00', '17:00', 45], ['24.10.2026', '06:00', '12:15', 15],
  ].map(([date_text, from, to, pause_min], i) => ({ weekday: i + 1, date_text, date: null, from, to, pause_min })),
  rows: [{
    name_raw: 'Tihomir Popović',
    per_day: [
      { weekday: 1, hours_text: '10 STD', minutes: 600 },
      { weekday: 2, hours_text: '10', minutes: 600 },
      { weekday: 3, hours_text: '10', minutes: 600 },
      { weekday: 4, hours_text: '10', minutes: 600 },
      { weekday: 5, hours_text: '10 STD/15 min', minutes: 615 },
      { weekday: 6, hours_text: '6 STD', minutes: 360 },
    ],
    total_text: '56 STD/15 min', total_minutes: 3375,
  }],
  total_text: '56 STD/15 min', total_minutes: 3375,
  signed: true, signer_name: 'K. Vogel', confidence: 'high', unclear: [],
};

const WORKERS = [
  { id: 'w1', full_name: 'Stanislav Pešbouský' },
  { id: 'w2', full_name: 'Peter Mynárik' },
  { id: 'w3', full_name: 'Ákos Papp' },
  { id: 'w4', full_name: 'Milan Bokros' },
  { id: 'w5', full_name: 'Tihomir Popović' },
  { id: 'w6', full_name: 'Jozef Malý' },
];

console.log('Stundennachweis z fotky');

// ── Nástroj a zadanie ───────────────────────────────────────────────────────
{
  eq(S.TOOL.name, 'stundennachweis', 'nástroj sa volá stundennachweis');
  const p = S.TOOL.input_schema.properties;
  ok(p.days && p.rows && p.signed && p.confidence && p.unclear && p.kw_from, 'nástroj pýta dni, riadky, podpis, istotu a nejasné políčka');
  ok(p.rows.items.properties.per_day.items.properties.minutes, 'pri políčku sa pýtajú minúty');
  const t = S.instructions({ year: 2026, workers: ['Peter Mynárik', { full_name: 'Ákos Papp' }], site: 'Lixenried' });
  ok(/10 STD\/15 min" = 615/.test(t), 'zadanie vysvetľuje „10 STD/15 min" = 10:15');
  ok(/„\/", „-"/.test(t) && /minutes = 0/.test(t), 'zadanie hovorí, že „/" a „-" je nula');
  ok(/rok 2026/.test(t), 'zadanie doplní rok k dátumom bez roka');
  ok(/Peter Mynárik, Ákos Papp/.test(t) && /Lixenried/.test(t), 'zadanie pozná ľudí a stavbu');
  ok(/nič si nevymýšľaj/.test(t) && /unclear/.test(t), 'zadanie zakazuje vymýšľať a pýta nejasné políčka');
  ok(/NEdopočítavaj/.test(t), 'hodiny sa nedopočítavajú zo spoločného času od–do');
}

// ── Políčka ─────────────────────────────────────────────────────────────────
{
  const cases = [
    ['10', 600], ['10,5', 630], ['10.5', 630], ['9½', 570], ['9 ½', 570], ['10 1/4', 615],
    ['10 STD/15 min', 615], ['10 Std. 15 Min.', 615], ['10h15', 615], ['10:15', 615], ['8 h 30', 510],
    ['10 STD', 600], ['6 STD', 360], ['45 min', 45], ['10,25', 615], ['8,75', 525], ['10,0', 600],
    ['/', 0], ['-', 0], ['—', 0], ['', 0], ['0', 0], [null, 0], ['56 STD/15 min', 3375],
    ['abc', null], ['10:75', null],
  ];
  for (const [t, m] of cases) eq(S.parseHours(t), m, `„${t}" → ${m}`);
}
{
  eq(S.minutesFrom('06:00', '16:00', 0), 600, 'od 6 do 16 bez pauzy je 10 h');
  eq(S.minutesFrom('6:00', '17:00', 45), 615, '6–17 mínus 45 min je 10:15');
  eq(S.minutesFrom('07:00', '17:45', 45), 600, '7–17:45 mínus 45 je 10 h');
  eq(S.minutesFrom('22:00', '06:00', 30), 450, 'nočná zmena cez polnoc');
  eq(S.minutesFrom('06:00', null, 0), null, 'bez konca sa nepočíta');
  eq(S.parsePause(null, '45 min'), 45, 'pauza „45 min"');
  eq(S.parsePause(null, '/'), 0, 'pauza „/" je nula');
  eq(S.parsePause(null, '0,5'), 30, 'pauza „0,5" sú hodiny');
  eq(S.parsePause(null, '30'), 30, 'pauza „30" sú minúty');
  eq(S.parsePause(null, ''), null, 'prázdna pauza nie je nula — nevieme');
  eq(S.hoursDecimal(615), '10.25', '615 min → „10.25"');
  eq(S.hoursDecimal(610), '10.17', '610 min → „10.17"');
  eq(S.hoursDecimal(600), '10.00', '600 min → „10.00"');
  eq(S.hoursDe(615), '10,25', 'na doklade 10,25');
  eq(S.hoursDe(630), '10,5', 'na doklade 10,5');
  eq(S.hoursDe(600), '10', 'na doklade 10');
}

// ── Partia ──────────────────────────────────────────────────────────────────
{
  const n = S.normalize(GROUP, { year: 2026 });
  eq(n.kw_from, '2026-10-19', 'týždeň sa určí z dátumov bez roka');
  eq([n.year, n.week], [2026, 43], 'je to KW 43/2026');
  eq(n.days.map((d) => d.date), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'],
    'dni Po–So s dátumami');
  eq(n.days.length, 6, 'nedeľa tam nie je, keď sa v nej nerobilo');
  eq(n.days.map((d) => d.span_minutes), [600, 420, 540, 540, 540, 360], 'od–do po dňoch v minútach');
  eq(n.days[0].pause_min, 0, 'pauza „/" je nula');
  eq(n.rows.map((r) => r.sum_minutes), [43 * 60, 50 * 60, 50 * 60, 50 * 60], 'súčty riadkov 43, 50, 50, 50 h');
  eq(n.rows[0].per_day[1].minutes, 0, 'Pesbousky v utorok „/" = 0');
  eq(n.sum_minutes, 193 * 60, 'spolu 193 hodín');
  eq(n.total_minutes, 193 * 60, 'na papieri je 193');
  eq(n.rows[0].per_day[0].date, '2026-10-19', 'políčko má dátum');

  const rows = S.matchWorkers(n.rows, WORKERS);
  eq(rows.map((r) => r.worker_id), ['w1', 'w2', 'w3', 'w4'], 'mená z papiera sa priradia (aj bez diakritiky a s iniciálou)');
  ok(rows[2].score >= S.MATCH_MIN, '„Ákos P." sa priradí podľa krstného mena', JSON.stringify(rows[2]));
  const sheet = { ...n, rows };
  eq(codes(S.check(sheet)), [], 'podpísaný list, ktorý sedí, nemá žiadne upozornenie');

  let asked = [];
  const t = S.toTimesheets(sheet, { assignmentFor: (w, d) => { asked.push(d); return w === 'w4' ? null : { id: `a-${w}` }; } });
  eq(t.rows.length, 5 + 6 * 2, 'Pesbousky má 5 dní (utorok je nula), dvaja ďalší po 6');
  eq(t.missing.length, 6, 'Bokros nemá nasadenie — jeho dni sa nahlásia');
  eq(t.missing[0].reason, 'no_assignment', '… s dôvodom no_assignment');
  eq(t.rows[0], { worker_id: 'w1', assignment_id: 'a-w1', work_date: '2026-10-19', hours: '10.00',
    time_from: '06:00', time_to: '16:00', activity_type: 'construction', source: 'stundennachweis', approved: true },
  'riadok do evidencie hodín');
  const pesUt = t.rows.find((r) => r.worker_id === 'w1' && r.work_date === '2026-10-20');
  ok(!pesUt, 'nulový deň sa nezapíše');
  const sum = t.rows.reduce((a, r) => a + Math.round(Number(r.hours) * 100), 0);
  eq(sum, (43 + 50 + 50) * 100, 'zapísané hodiny dajú 143 h (bez Bokrosa)');
}

// ── Jednotlivec ─────────────────────────────────────────────────────────────
{
  const n = S.normalize(SINGLE, { year: 2026 });
  eq(n.kw_from, '2026-10-19', 'týždeň z kw_from');
  eq(n.rows[0].per_day.map((c) => c.minutes), [600, 600, 600, 600, 615, 360], 'hodiny po dňoch, piatok 10:15');
  eq(n.rows[0].sum_minutes, 56 * 60 + 15, 'spolu 56 h 15 min');
  eq(n.total_minutes, 3375, 'aj na papieri 56 h 15 min');
  eq(n.days.map((d) => d.span_minutes), [600, 600, 600, 600, 615, 360], 'od–do mínus pauza sedí s hodinami každý deň');
  const rows = S.matchWorkers(n.rows, WORKERS);
  eq(rows[0].worker_id, 'w5', 'Tihomir Popović sa priradí');
  eq(rows[0].score, 1, 'celé meno = istota 1');
  eq(codes(S.check({ ...n, rows })), [], 'bez upozornení');
  const t = S.toTimesheets({ ...n, rows }, { assignmentFor: () => 'asg-1' });
  eq(t.rows.map((r) => r.hours), ['10.00', '10.00', '10.00', '10.00', '10.25', '6.00'], 'hodiny ako „10.25"');
  eq([t.rows[4].time_from, t.rows[4].time_to], ['06:00', '17:00'], 'čas od–do sa zapíše, keď presne sedí');
  eq(t.rows[0].assignment_id, 'asg-1', 'nasadenie môže prísť aj ako id');
}

// ── Kontroly ────────────────────────────────────────────────────────────────
{
  // Zlý súčet v riadku aj celkový, prečiarknutý podpis, nedeľa, 13 h.
  const bad = JSON.parse(JSON.stringify(GROUP));
  bad.rows[1].total_text = '51';
  bad.total_text = '194';
  bad.signed = false;
  bad.rows[2].per_day[0].hours_text = '13';
  bad.rows[3].per_day.push({ weekday: 7, hours_text: '4' });
  bad.days.push({ weekday: 7, date_text: '25.10.', from: '8:00', to: '12:00' });
  const n = S.normalize(bad, { year: 2026 });
  eq(n.days.length, 7, 'nedeľa sa ukáže, keď sa v nej robilo');
  const w = S.check({ ...n, rows: S.matchWorkers(n.rows, WORKERS) });
  const c = codes(w);
  ok(c.includes('row_total'), 'nesedí súčet riadku', c.join(','));
  ok(c.includes('grand_total'), 'nesedí celkový súčet');
  ok(c.includes('unsigned'), 'nepodpísaný list');
  ok(c.includes('over_12h'), 'viac než 12 hodín za deň');
  ok(c.includes('over_span'), 'viac hodín, než dovoľuje od–do');
  ok(c.includes('sunday'), 'práca v nedeľu');
  ok(w.every((x) => typeof x.text === 'string' && x.text.length > 10 && ['error', 'warn', 'info'].includes(x.level)),
    'každé upozornenie má vetu a úroveň');
  const rt = w.find((x) => x.code === 'row_total');
  ok(/Mynárik P\./.test(rt.text) && /50 h/.test(rt.text) && /51 h/.test(rt.text), 'veta povie kto a aké čísla', rt.text);
}
{
  // Bratia Mynárikovci: priezvisko a iniciála sedia na oboch — nepriradí sa nič.
  const r = S.matchWorkers([{ name_raw: 'Mynárik P.' }], [
    { id: 'a', full_name: 'Peter Mynárik' }, { id: 'b', full_name: 'Pavol Mynárik' }]);
  eq(r[0].worker_id, null, 'dvaja rovnako dobrí kandidáti → nikto');
  eq(r[0].candidates.length, 2, '… ale obaja sú na výber');
  const w = S.check({ rows: r, days: [], signed: true });
  ok(codes(w).includes('unmatched'), 'nepriradené meno sa hlási');
  ok(!codes(S.check({ rows: [{ name_raw: 'X', per_day: [] }], days: [], signed: true })).includes('unmatched'),
    'pred priradením sa nepriradené nehlásia');
}
{
  const r = S.matchWorkers([{ name_raw: 'Mynárik J.' }, { name_raw: 'Novák' }, { name_raw: 'Mynarlk P.' }],
    [{ id: 'a', full_name: 'Peter Mynárik' }, { id: 'n', full_name: 'Marek Hudák' }]);
  eq(r[0].worker_id, null, 'iniciála nesedí → nepriradí sa');
  eq(r[1].worker_id, null, 'cudzie meno sa nepriradí');
  eq(r[2].worker_id, 'a', 'preklep v rukopise („Mynarlk") sa ešte priradí');
  const d = S.matchWorkers([{ name_raw: 'Peter Mynárik' }, { name_raw: 'Mynárik P.' }], [{ id: 'a', full_name: 'Peter Mynárik' }]);
  eq(d.map((x) => x.worker_id), ['a', null], 'ten istý človek sa nepriradí dvom riadkom');
}
{
  // Nečitateľné políčko, nejednoznačné „10,15" a model, ktorý sa pomýlil v minútach.
  const raw = JSON.parse(JSON.stringify(SINGLE));
  raw.rows[0].per_day[0] = { weekday: 1, hours_text: '1?', minutes: null };
  raw.rows[0].per_day[1] = { weekday: 2, hours_text: '10,15', minutes: 615 };
  raw.unclear = ['Popović, Po: 1? alebo 10'];
  raw.confidence = 'low';
  const n = S.normalize(raw, { year: 2026 });
  eq(n.rows[0].per_day[0].minutes, null, 'nečitateľné políčko je null, nie nula');
  eq(n.rows[0].per_day[1].minutes, 609, '„10,15" sa počíta ako desatinné hodiny');
  const c = codes(S.check(n));
  ok(c.includes('unreadable') && c.includes('ambiguous') && c.includes('cell_disagree') && c.includes('unclear') && c.includes('low_confidence'),
    'nečitateľné, nejednoznačné, nesúlad s modelom, nejasné a slabá istota sa hlásia', c.join(','));
  const t = S.toTimesheets({ ...n, rows: S.matchWorkers(n.rows, WORKERS) }, { assignmentFor: () => 'x' });
  eq(t.missing.map((m) => m.reason), ['unreadable'], 'nečitateľný deň sa nezapíše, nahlási sa');
}

// ── Dátumy a týždeň ─────────────────────────────────────────────────────────
{
  eq(S.parseDate('19.10.', { year: 2026, weekday: 1 }), '2026-10-19', '„19.10." s rokom zo zadania');
  eq(S.parseDate('19.10.2026'), '2026-10-19', 'celý dátum');
  eq(S.parseDate('19.10.26'), '2026-10-19', 'dvojciferný rok');
  eq(S.parseDate('1.1.', { year: 2026, weekday: 5 }), '2027-01-01', 'prelom rokov: 1. 1. v piatok je 2027, nie 2026');
  eq(S.parseDate('29.12.', { year: 2026, weekday: 2 }), '2026-12-29', '… a 29. 12. v utorok zostáva 2026');
  // Týždeň cez Nový rok, dátumy bez roka.
  const n = S.normalize({ days: [{ weekday: 1, date_text: '28.12.' }, { weekday: 5, date_text: '01.01.' }], rows: [], signed: true, confidence: 'high' }, { year: 2026 });
  eq([n.kw_from, n.week, n.days[4].date], ['2026-12-28', 53, '2027-01-01'], 'KW 53/2026 cez Nový rok');
  const k = S.normalize({ kw: 43, days: [], rows: [], signed: true, confidence: 'high' }, { year: 2026 });
  eq(k.kw_from, '2026-10-19', 'bez dátumov z čísla KW');
  const none = S.normalize({ days: [], rows: [], signed: true, confidence: 'high' }, { year: 2026 });
  eq(none.kw_from, null, 'bez dátumov aj bez KW týždeň nie je');
  ok(codes(S.check(none)).includes('no_week'), '… a hlási sa to');
  const conflict = S.normalize({ ...GROUP, days: GROUP.days.map((d, i) => (i === 2 ? { ...d, date_text: '22.10.' } : d)) }, { year: 2026 });
  ok(codes(S.check(conflict)).includes('date_conflict'), 'dátum, ktorý nesedí s týždňom, sa hlási');
  const junk = S.normalize(null);
  eq([junk.rows.length, junk.signed, junk.confidence], [0, false, 'low'], 'prázdny vstup nespadne');
}

// ── Podpis majstra: jeden zdroj pravdy ──────────────────────────────────────
// Okno hodín ukladalo výkaz podľa zákazky, Výkaz pre odberateľa podľa partie —
// podpis z jedného miesta druhé nevidelo. Teraz sa číta jedným pravidlom.
console.log('Výkaz k zákazke a týždňu');
{
  const R = [
    { id: 'old', crew_id: 'c1', subcontract_id: null, iso_year: 2026, iso_week: 43, signed_at: '2026-10-23T12:00:00Z', signed_by_name: 'Brandl' },
    { id: 'new', crew_id: null, subcontract_id: 's1', iso_year: 2026, iso_week: 43, signed_at: null },
    { id: 'cudzi', crew_id: 'c2', subcontract_id: 's2', iso_year: 2026, iso_week: 43, signed_at: '2026-10-23T12:00:00Z' },
    { id: 'iny-tyzden', crew_id: null, subcontract_id: 's1', iso_year: 2026, iso_week: 42, signed_at: '2026-10-16T12:00:00Z' },
  ];
  eq((S.pickSheet(R, { subcontractId: 's1', crewIds: ['c1'], year: 2026, week: 43 }) || {}).id, 'old',
    'starý podpísaný riadok partie (bez zákazky) sa nájde — podpis sa nestratí');
  eq((S.pickSheet(R, { subcontractId: 's1', crewIds: [], year: 2026, week: 43 }) || {}).id, 'new',
    'bez partie sa vezme riadok zákazky');
  eq(S.pickSheet(R, { subcontractId: 's9', crewIds: [], year: 2026, week: 43 }), null,
    'cudzia zákazka sa nikdy nevezme');
  eq((S.pickSheet(R, { subcontractId: 's2', crewIds: ['c1'], year: 2026, week: 43 }) || {}).id, 'cudzi',
    'riadok inej partie so zákazkou patrí tej zákazke');
  eq((S.pickSheet(R, { subcontractId: 's1', year: '2026', week: '42' }) || {}).id, 'iny-tyzden',
    'týždeň aj ako text');
  eq(S.pickSheet(null, { subcontractId: 's1', year: 2026, week: 43 }), null, 'bez riadkov nespadne');
  const dva = [
    { id: 'a', crew_id: 'c1', subcontract_id: 's1', iso_year: 2026, iso_week: 43, updated_at: '2026-10-20' },
    { id: 'b', crew_id: 'c2', subcontract_id: 's1', iso_year: 2026, iso_week: 43, updated_at: '2026-10-21' },
  ];
  eq(S.pickSheet(dva, { subcontractId: 's1', crewId: 'c1', year: 2026, week: 43 }).id, 'a',
    'keď sa pýta partia, jej riadok má prednosť');

  const snap = S.sheetSnapshot({
    dates: [{ date: '2026-10-19' }, { date: '2026-10-20' }],
    rows: [{ worker_id: 'w1', name: 'Ján Novák', cells: { '2026-10-19': 600, '2026-10-20': 510 } },
      { worker_id: 'w2', name: 'Peter Kováč', cells: { '2026-10-19': 615 } }],
    project: 'ZAK-1', site: 'Ulm', customer: 'GU Ulm', source: 'scan',
  });
  eq(snap.dni, ['2026-10-19', '2026-10-20'], 'dni výkazu');
  eq(snap.riadky.map(r => [r.meno, r.hodiny, r.spolu]),
    [['Ján Novák', ['10.00', '8.50'], '18.50'], ['Peter Kováč', ['10.25', '0.00'], '10.25']],
    'hodiny po dňoch bez desatinných chýb (z minút)');
  eq([snap.po_dnoch, snap.spolu], [['20.25', '8.50'], '28.75'], 'súčty po dňoch a spolu');
  eq([snap.projekt, snap.baustelle, snap.kunde, snap.zdroj], ['ZAK-1', 'Ulm', 'GU Ulm', 'scan'],
    'hlavička papiera je v snímke');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
