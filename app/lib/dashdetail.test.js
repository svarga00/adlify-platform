// ============================================================================
// Testy detailov za číslami na prehľade
// Spustenie:  node app/lib/dashdetail.test.js
// ============================================================================
// Hlavná vec, ktorá sa tu stráži: **číslo na dlaždici a zoznam v okne musia
// byť z toho istého výpočtu.** Keď sa raz rozídu, nikto nevie, ktoré platí,
// a prehľad prestane byť na niečo dobrý.
//
// Druhá vec: hranice. Nasadenie na ukončenej zákazke sa nepočíta, hodiny
// v uzavretom období sa nepočítajú, zaplatená faktúra nie je po splatnosti.
// Každá z tých hraníc je tu ako prípad, lebo každá sa dá omylom zmazať.
// ============================================================================
global.window = global;
const M = require('./money.js');
const D = require('./dashdetail.js');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; return; }
  failed++;
  console.error(`  ✗ ${msg}\n      čakal som: ${e}\n      dostal som: ${a}`);
}
function ok(cond, msg) { eq(!!cond, true, msg); }

const TODAY = '2026-10-05';

// ── Vzorové dáta ────────────────────────────────────────────────────────────
// Jedna aktívna zákazka, jedna ukončená. Všetko ostatné sa k nim viaže, takže
// na každom čísle je vidieť, či rešpektuje hranicu „len aktívne zákazky".
const SUBS = [
  { id: 's1', title: 'Wohnpark Feuerbach', status: 'active' },
  { id: 's2', title: 'Stará hala', status: 'completed' },
];
const ASG = [
  { id: 'a1', worker_id: 'w1', subcontract_id: 's1', status: 'active', charge_rate: '24.00', worker_rate: '18.00' },
  { id: 'a2', worker_id: 'w2', subcontract_id: 's1', status: 'active', charge_rate: '20.00', worker_rate: '20.00' },
  { id: 'a3', worker_id: 'w3', subcontract_id: 's1', status: 'active', charge_rate: null, worker_rate: '19.00' },
  // Nasadenie na ukončenej zákazke — do čísla nepatrí.
  { id: 'a4', worker_id: 'w4', subcontract_id: 's2', status: 'active', charge_rate: '30.00', worker_rate: '20.00' },
  // Ukončené nasadenie na aktívnej zákazke — tiež nie.
  { id: 'a5', worker_id: 'w5', subcontract_id: 's1', status: 'ended', charge_rate: '30.00', worker_rate: '20.00' },
];
const NAMES = { w1: 'Ján Novák', w2: 'Peter Kováč', w3: 'Milan Horváth', w4: 'Jozef Baláž', w5: 'Ivan Tóth' };

const X = {
  today: TODAY,
  subcontracts: SUBS,
  assignments: ASG,
  workerName: (id) => NAMES[id] || null,
  siteName: (id) => (SUBS.find(s => s.id === id) || {}).title || null,
  partnerName: (id) => ({ p1: 'Hartmann Bau KG', p2: 'Schmid GmbH' }[id] || null),
  docLabel: (k) => ({ a1: 'Formulár A1', trade_licence: 'Živnostenský list' }[k] || k),
  tradeLabel: (k) => ({ trockenbau: 'Sadrokartón' }[k] || k),
  timesheets: [],
  invoices: [],
  documents: [],
  plans: [],
  periodsDue: [],
};

// ── Ľudia na stavbách ───────────────────────────────────────────────────────
console.log('Ľudia na stavbách');
{
  const d = D.detail('deployed', X);
  eq(d.total, 3, 'počíta len aktívne nasadenia na aktívnych zákazkách');
  eq(d.rows.length, d.total, 'číslo na dlaždici je dĺžka zoznamu — nie iný výpočet');
  eq(d.rows.map(r => r.cells.worker), ['Ján Novák', 'Milan Horváth', 'Peter Kováč'],
    'zoradené po menách, po slovensky');

  const kovac = d.rows.find(r => r.cells.worker === 'Peter Kováč');
  eq(kovac.tone, 'bad', 'nulová marža je problém, nie detail v exporte');
  eq(kovac.cells.margin, 0, 'marža v centoch');

  const horvath = d.rows.find(r => r.cells.worker === 'Milan Horváth');
  eq(horvath.tone, 'warn', 'chýbajúca sadzba je varovanie');
  eq(horvath.cells.margin, null, 'bez sadzby sa marža nepočíta, nepredstiera sa nula');

  const novak = d.rows.find(r => r.cells.worker === 'Ján Novák');
  eq(novak.cells.margin, 600, '24,00 − 18,00 = 6,00 €');
  eq(novak.tone, '', 'nasadenie s maržou nič nehlási');
  eq(novak.open, { type: 'worker', id: 'w1' }, 'riadok sa dá otvoriť na živnostníkovi');

  eq(d.state, 'watch', 'nasadenie bez marže zdvihne stav dlaždice');
  eq(D.detail('deployed', { ...X, assignments: [ASG[0]] }).state, 'calm',
    'samé zdravé nasadenia sú pokoj');
  eq(D.detail('deployed', { ...X, assignments: [ASG[0]] }).sub, '1 zákazka',
    'podtitul povie, na koľkých zákazkách');
  eq(D.detail('deployed', { ...X, assignments: [] }).sub, 'nikto nie je nasadený',
    'prázdno sa povie slovami, nie nulou');
}

// ── Nezúčtované hodiny ──────────────────────────────────────────────────────
console.log('Nezúčtované hodiny');
{
  const ts = [
    { id: 't1', assignment_id: 'a1', worker_id: 'w1', hours: '8', work_date: '2026-09-15', period_id: null },
    { id: 't2', assignment_id: 'a1', worker_id: 'w1', hours: '8.5', work_date: '2026-09-16', period_id: null },
    { id: 't3', assignment_id: 'a1', worker_id: 'w1', hours: '8', work_date: '2026-09-16', period_id: null },
    { id: 't4', assignment_id: 'a2', worker_id: 'w2', hours: '7', work_date: '2026-10-02', period_id: null },
    // Už v uzavretom období — nezúčtované to nie je.
    { id: 't5', assignment_id: 'a1', worker_id: 'w1', hours: '100', work_date: '2026-08-01', period_id: 'p1' },
    // Na ukončenej zákazke — rovnaká hranica ako pri ľuďoch.
    { id: 't6', assignment_id: 'a4', worker_id: 'w4', hours: '50', work_date: '2026-09-01', period_id: null },
  ];
  const d = D.detail('hours', { ...X, timesheets: ts });
  eq(d.rows.length, 2, 'zoskupené podľa človeka a zákazky, nie riadok po riadku');
  eq(d.total, 32, '8 + 8,5 + 8 + 7 = 31,5 → 32 h');

  const jan = d.rows.find(r => r.cells.worker === 'Ján Novák');
  eq(jan.cells.hours, 24.5, 'hodiny sa sčítajú v rámci skupiny');
  eq(jan.cells.days, 2, 'dva rôzne dni, hoci tri výkazy');
  eq(jan.cells.oldest, '2026-09-15', 'najstarší deň v skupine');
  eq(jan.tone, 'warn', 'hodiny staršie než dva týždne sa už ťažko vysvetľujú');
  ok(/20 dní/.test(jan.why), 'povie sa, o koľko dní ide');

  const peter = d.rows.find(r => r.cells.worker === 'Peter Kováč');
  eq(peter.tone, '', 'čerstvé hodiny nič nehlásia');
  eq(d.rows[0].cells.worker, 'Ján Novák', 'najstaršie hore — to sa rieši prvé');

  eq(d.state, 'calm', 'bez čakajúceho obdobia je to len informácia');
  eq(D.detail('hours', { ...X, timesheets: ts, periodsDue: [{ id: 'p9' }] }).state, 'watch',
    'čakajúce obdobie zdvihne stav');
  eq(D.detail('hours', { ...X, timesheets: [] }).sub, 'všetko zúčtované', 'prázdno slovami');
}

// ── Faktúry na schválenie ───────────────────────────────────────────────────
console.log('Faktúry na schválenie');
{
  const inv = [
    { id: 'i1', invoice_number: '2026014', total: '5280', status: 'pending_approval', due_date: '2026-10-20', partner_id: 'p1' },
    { id: 'i2', invoice_number: '2026015', total: '1200', status: 'pending_approval', due_date: '2026-10-10', partner_id: 'p2' },
    { id: 'i3', invoice_number: '2026016', total: '900', status: 'sent', due_date: '2026-10-01', partner_id: 'p1' },
  ];
  const d = D.detail('approve', { ...X, invoices: inv });
  eq(d.total, 2, 'len tie, čo naozaj čakajú na schválenie');
  eq(d.rows[0].cells.number, '2026015', 'najbližšia splatnosť hore');
  eq(d.rows[0].cells.partner, 'Schmid GmbH', 'meno odberateľa, nie jeho id');
  eq(d.rows[0].cells.amount, 120000, 'suma v centoch');
  eq(d.sub, `spolu 6 480,00 €`, 'podtitul povie, o koľko peňazí ide');
  eq(d.state, 'watch', 'čakajúca faktúra chce pozornosť, ale nie je to pohroma');
  eq(D.detail('approve', { ...X, invoices: [inv[2]] }).state, 'calm', 'nič nečaká → pokoj');
}

// ── Po splatnosti ───────────────────────────────────────────────────────────
console.log('Po splatnosti');
{
  const inv = [
    { id: 'i1', invoice_number: '2026011', total: '3366', status: 'sent', due_date: '2026-09-20', partner_id: 'p1' },
    { id: 'i2', invoice_number: '2026012', total: '500', status: 'overdue', due_date: '2026-08-01', partner_id: 'p2' },
    // Zaplatená po termíne nie je po splatnosti — je vybavená.
    { id: 'i3', invoice_number: '2026013', total: '700', status: 'paid', due_date: '2026-07-01', partner_id: 'p1' },
    // Rozpracovaná faktúra ešte nikomu nemešká.
    { id: 'i4', invoice_number: null, total: '800', status: 'draft', due_date: '2026-07-01', partner_id: 'p1' },
    // Zrušená tiež nie.
    { id: 'i5', invoice_number: '2026010', total: '900', status: 'cancelled', due_date: '2026-07-01', partner_id: 'p1' },
    // Dnešná splatnosť ešte nemešká.
    { id: 'i6', invoice_number: '2026017', total: '100', status: 'sent', due_date: TODAY, partner_id: 'p1' },
  ];
  const d = D.detail('overdue', { ...X, invoices: inv });
  eq(d.total, 2, 'zaplatená, zrušená, rozpracovaná ani dnešná sa nepočítajú');
  eq(d.rows[0].cells.number, '2026012', 'najdlhšie meškajúca hore');
  eq(d.rows[0].cells.late, 65, 'od 1. 8. do 5. 10. je 65 dní');
  eq(d.rows[0].tone, 'bad', 'nad mesiac je to iný problém');
  eq(d.rows[1].cells.late, 15, 'od 20. 9. do 5. 10. je 15 dní');
  eq(d.rows[1].tone, 'warn', 'pätnásť dní je ešte telefonát, nie vymáhanie');
  eq(d.state, 'bad', 'čokoľvek po splatnosti je červené');
  eq(d.sub, `3 866,00 € na účte chýba`, 'podtitul povie sumu, nie počet');
  eq(D.detail('overdue', { ...X, invoices: [inv[2]] }).state, 'calm', 'nič nemešká → pokoj');
  eq(D.detail('overdue', { ...X, invoices: [inv[2]] }).sub, 'nič nemešká', 'prázdno slovami');
}

// ── Doklady ─────────────────────────────────────────────────────────────────
console.log('Doklady');
{
  const docs = [
    { id: 'd1', worker_id: 'w1', worker_name: 'Ján Novák', kind: 'a1', validity: 'expired', valid_to: '2026-09-30', days_left: -5 },
    { id: 'd2', worker_id: 'w2', worker_name: 'Peter Kováč', kind: 'trade_licence', validity: 'expiring', valid_to: '2026-10-25', days_left: 20 },
    { id: 'd3', worker_id: 'w3', worker_name: 'Milan Horváth', kind: 'a1', validity: 'expiring', valid_to: '2026-10-12', days_left: 7 },
    { id: 'd4', worker_id: 'w4', worker_name: 'Jozef Baláž', kind: 'a1', validity: 'valid', valid_to: '2027-01-01', days_left: 88 },
  ];
  const d = D.detail('docs', { ...X, documents: docs });
  eq(d.rows.length, 3, 'v zozname je aj to, čo sa blíži ku koncu');
  eq(d.total, 1, 'na dlaždici je len to, čo už neplatí');
  eq(d.rows[0].cells.worker, 'Ján Novák', 'neplatné hore');
  eq(d.rows[0].cells.doc, 'Formulár A1', 'názov dokladu, nie kľúč z číselníka');
  eq(d.rows.slice(1).map(r => r.cells.left), [7, 20], 'potom podľa toho, čo skončí skôr');
  eq(d.state, 'bad', 'doklad po platnosti je červený');
  eq(d.sub, '2 sa blížia ku koncu', 'podtitul povie o tých druhých');

  const soon = D.detail('docs', { ...X, documents: [docs[1]] });
  eq(soon.total, 0, 'blížiaci sa koniec nie je číslo na dlaždici');
  eq(soon.state, 'watch', 'ale ani to nie je pokoj');
  eq(D.detail('docs', { ...X, documents: [docs[3]] }).sub, 'všetko platí', 'prázdno slovami');
  eq(d.tile, 'Doklady po platnosti', 'na dlaždici je názov toho čísla, ktoré je na nej');
  eq(d.title, 'Doklady a ich platnosť', 'v okne širší názov, lebo je tam aj to blížiace sa');
  eq(D.detail('overdue', X).tile, D.detail('overdue', X).title,
    'kde netreba iný názov, je rovnaký');
  ok(d.note, 'okno vysvetlí, prečo je v zozname viac riadkov než na dlaždici');
}

// ── Nábor ───────────────────────────────────────────────────────────────────
console.log('Nábor');
{
  const plans = [
    { id: 'r1', status: 'active', title: 'Sadrokartonári Stuttgart', city: 'Stuttgart', trade_key: 'trockenbau', headcount: 6, deadline: '2026-10-30', subcontract_id: 's1' },
    { id: 'r2', status: 'active', title: 'Maliari Mníchov', city: 'München', trade_key: 'maler', headcount: 3, deadline: '2026-09-20', subcontract_id: null },
    { id: 'r3', status: 'done', title: 'Hotovo', city: 'Berlin', trade_key: 'maler', headcount: 9, deadline: '2026-11-01', subcontract_id: null },
  ];
  const d = D.detail('hiring', { ...X, plans });
  eq(d.total, 9, 'spočítajú sa ľudia, nie nábory');
  eq(d.rows.length, 2, 'ukončený nábor nie je bežiaci');
  eq(d.rows[0].cells.title, 'Maliari Mníchov', 'najbližší termín hore');
  eq(d.rows[0].tone, 'bad', 'termín za nami');
  eq(d.rows[0].open, null, 'nábor bez zákazky sa nemá kam otvoriť — a netvári sa, že má');
  eq(d.rows[1].cells.trade, 'Sadrokartón', 'remeslo po slovensky');
  eq(d.rows[1].open, { type: 'subcontract', id: 's1' }, 'nábor k zákazke sa otvorí na zákazke');
  eq(d.state, 'bad', 'meškajúci nábor je červený');
  eq(d.sub, '1 nábor mešká', 'podtitul povie čo');
  eq(D.detail('hiring', { ...X, plans: [plans[0]] }).sub, '1 bežiaci nábor', 'bez meškania len počet');
  eq(D.detail('hiring', { ...X, plans: [] }).state, 'calm', 'žiadny nábor → pokoj');
}

// ── Hľadanie a zoradenie v okne ─────────────────────────────────────────────
console.log('Hľadanie a zoradenie');
{
  const d = D.detail('deployed', X);
  eq(D.filter(d.rows, '').length, 3, 'prázdne hľadanie nefiltruje');
  eq(D.filter(d.rows, 'novák').map(r => r.cells.worker), ['Ján Novák'], 'hľadá sa bez ohľadu na veľkosť písmen');
  eq(D.filter(d.rows, 'feuerbach').length, 3, 'hľadá sa aj v inom stĺpci než v prvom');
  eq(D.filter(d.rows, 'novák feuerbach').length, 1, 'viac slov znamená „a zároveň"');
  eq(D.filter(d.rows, 'novák hala').length, 0, 'čo nesedí v oboch, nevyjde');

  const bySum = D.sort(d.rows, 'margin', 'desc');
  eq(bySum.map(r => r.cells.margin), [600, 0, null], 'číselné zoradenie je číselné');
  const asc = D.sort(d.rows, 'margin', 'asc');
  eq(asc.map(r => r.cells.margin), [0, 600, null], 'prázdne ostanú dole aj pri opačnom smere');
  eq(D.sort(d.rows, 'worker').map(r => r.cells.worker),
    ['Ján Novák', 'Milan Horváth', 'Peter Kováč'], 'text po slovensky');
  eq(D.sort(d.rows, null).length, 3, 'bez stĺpca sa poradie nemení');
  ok(D.sort(d.rows, 'worker') !== d.rows, 'zoradenie nemení pôvodné pole');
}

// ── Vývoz do CSV ────────────────────────────────────────────────────────────
console.log('Vývoz');
{
  const d = D.detail('overdue', {
    ...X,
    invoices: [{ id: 'i1', invoice_number: '2026011', total: '3366', status: 'sent', due_date: '2026-09-20', partner_id: 'p1' }],
  });
  const t = D.table(d);
  eq(t[0], ['Faktúra', 'Odberateľ', 'Suma', 'Splatnosť', 'Mešká'], 'prvý riadok sú názvy stĺpcov');
  const dd = D.detail('docs', { ...X, documents: [
    { id: 'd1', worker_id: 'w1', worker_name: 'Ján Novák', kind: 'a1', validity: 'expired', valid_to: '2026-09-30', days_left: -5 }] });
  eq(D.table(dd)[0], ['Živnostník', 'Doklad', 'Platí do', 'Platnosť'],
    'stĺpec o platnosti sa nevolá „Zostáva" — pri expirovanom doklade nezostáva nič');
  eq(t[1], ['2026011', 'Hartmann Bau KG', 3366, '2026-09-20', 15], 'peniaze idú do tabuľky v eurách, nie v centoch');
  eq(D.table(null), [], 'bez dát prázdna tabuľka');
}

// ── Odolnosť ────────────────────────────────────────────────────────────────
console.log('Odolnosť');
{
  eq(D.detail('neexistuje', X), null, 'neznáme číslo nevráti nič, nespadne');
  const prazdny = D.all({});
  eq(prazdny.length, D.KPIS.length, 'prázdny balík dá všetky dlaždice');
  eq(prazdny.map(d => d.total), [0, 0, 0, 0, 0, 0], 'a všetky na nule');
  eq(prazdny.every(d => d.state === 'calm'), true, 'prázdna appka nič nehlási');
  // Dáta, ktoré prídu rozbité z databázy, nesmú zhodiť celú obrazovku.
  eq(D.detail('deployed', { subcontracts: null, assignments: null }).total, 0,
    'chýbajúce polia sú prázdny zoznam, nie výnimka');
  eq(D.detail('hours', { ...X, timesheets: [{ hours: 'x', work_date: null, assignment_id: 'a1', worker_id: 'w1' }] }).total, 0,
    'nečíselné hodiny sa počítajú ako nula');
}

// ── Zmluva knižnice ─────────────────────────────────────────────────────────
// Dlaždica sa kreslí zo spoločného tvaru. Keď v jednej definícii chýba stĺpec
// alebo vysvetlenie, obrazovka to nenahlási — vykreslí prázdno. Preto to
// stráži test.
console.log('Zmluva');
{
  for (const d of D.KPIS) {
    const nazvy = d.cols.map(c => c.label);
    ok(nazvy.length === new Set(nazvy).size,
      `${d.key}: názvy stĺpcov sa neopakujú — v CSV by sa nedali rozlíšiť`);
    ok(d.key && d.title && d.lead, `${d.key}: má názov aj vysvetlenie`);
    ok(d.ico, `${d.key}: má ikonu`);
    ok(Array.isArray(d.cols) && d.cols.length, `${d.key}: má stĺpce`);
    ok(d.cols.every(c => c.k && c.label), `${d.key}: každý stĺpec má kľúč aj názov`);
    ok(typeof d.rows === 'function' && typeof d.total === 'function'
      && typeof d.state === 'function' && typeof d.sub === 'function',
      `${d.key}: má všetky štyri funkcie`);
  }
  const keys = D.KPIS.map(d => d.key);
  eq(keys.length, new Set(keys).size, 'kľúče sa neopakujú');
  // Každý stav, ktorý vieme vrátiť, musí vedieť obrazovka vyfarbiť.
  ok([D.CALM, D.WATCH, D.BAD].every(s => typeof s === 'string'), 'tri stavy, nie päť');
}

// ── Množné číslo ────────────────────────────────────────────────────────────
console.log('Množné číslo');
{
  eq(D.plural(1, 'deň', 'dni', 'dní'), 'deň', 'jeden');
  eq(D.plural(3, 'deň', 'dni', 'dní'), 'dni', 'tri');
  eq(D.plural(7, 'deň', 'dni', 'dní'), 'dní', 'sedem');
  eq(D.plural(0, 'deň', 'dni', 'dní'), 'dní', 'nula');
  eq(D.daysBetween('2026-10-05', '2026-09-20'), 15, 'dni medzi dátumami');
  eq(D.daysBetween(null, '2026-09-20'), null, 'bez dátumu nič');
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
