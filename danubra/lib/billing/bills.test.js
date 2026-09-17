// ============================================================================
// Testy prijatých faktúr a nákladov
// Spustenie:  node danubra/lib/billing/bills.test.js
// ============================================================================
global.window = global;
const M = require('../money.js');
const B = require('./bills');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

const ASG = [{ id: 'a1', worker_id: 'w1', worker_rate: 26, charge_rate: 34 }];
const WORKER = { id: 'w1', company_id: '12345678', bank_iban: 'SK31', hourly_cost: 26 };
// 100 schválených hodín × 26 € = 2 600 €
const TS = [
  { id: 't1', assignment_id: 'a1', worker_id: 'w1', period_id: 'per1', hours: 60, approved: true },
  { id: 't2', assignment_id: 'a1', worker_id: 'w1', period_id: 'per1', hours: 40, approved: true },
  { id: 't3', assignment_id: 'a1', worker_id: 'w1', period_id: 'per1', hours: 20, approved: false },
  { id: 't4', assignment_id: 'a1', worker_id: 'w2', period_id: 'per1', hours: 50, approved: true },
  { id: 't5', assignment_id: 'a1', worker_id: 'w1', period_id: 'per2', hours: 30, approved: true },
];
const ctx = { timesheets: TS, assignments: ASG, worker: WORKER };

console.log('Prijaté faktúry a náklady');

// ── Čo by malo prísť ────────────────────────────────────────────────────────
{
  const e = B.expected({ ...ctx, worker_id: 'w1', period_id: 'per1' });
  eq(e.hours, 100, 'len schválené hodiny tohto človeka a tohto obdobia');
  eq(M.format(e.expected), '2 600,00 €', 'suma podľa sadzby nasadenia');

  // Bez obdobia sa to nedá zistiť — a to je iná situácia než nula.
  eq(B.expected({ ...ctx, worker_id: 'w1' }).expected, null, 'bez obdobia sa nedá počítať');
  eq(B.expected({ ...ctx, period_id: 'per1' }).expected, null, 'ani bez človeka');
  eq(B.expected({ ...ctx, worker_id: 'w9', period_id: 'per1' }).expected, 0,
    'cudzí človek má nulu, nie null');

  // Zmrazená sadzba z uzávierky má prednosť.
  eq(M.format(B.expected({
    ...ctx, worker_id: 'w1', period_id: 'per1',
    timesheets: [{ assignment_id: 'a1', worker_id: 'w1', period_id: 'per1',
      hours: 10, approved: true, rate_used: 20 }],
  }).expected), '200,00 €', 'rate_used prebije sadzbu nasadenia');

  // Bez nasadenia padne na sadzbu z kartotéky.
  eq(M.format(B.expected({
    ...ctx, worker_id: 'w1', period_id: 'per1', assignments: [],
    timesheets: [{ assignment_id: 'x', worker_id: 'w1', period_id: 'per1',
      hours: 10, approved: true }],
  }).expected), '260,00 €', 'bez nasadenia platí sadzba z kartotéky');
}

// ── Porovnanie faktúry ──────────────────────────────────────────────────────
{
  // Sedí
  const okBill = B.check({ worker_id: 'w1', period_id: 'per1', amount: 2600 }, ctx);
  eq(okBill.variance, 0, 'sediaca faktúra má nulový rozdiel');
  eq(okBill.matches, true, 'a sedí');
  eq(okBill.status, 'received', 'stav sa nemení');

  // Fakturuje viac — toto je ten prípad, kvôli ktorému celá kontrola existuje.
  const more = B.check({ worker_id: 'w1', period_id: 'per1', amount: 3200 }, ctx);
  eq(M.format(more.variance), '600,00 €', 'rozdiel sa dopočíta');
  eq(more.matches, false, 'nesedí');
  eq(more.status, 'disputed', 'a faktúra sa sama preklopí do sporu');

  // Fakturuje menej — tiež sa oplatí vedieť.
  const less = B.check({ worker_id: 'w1', period_id: 'per1', amount: 2000 }, ctx);
  eq(less.variance, -60000, 'menej je záporný rozdiel');
  eq(less.status, 'disputed', 'aj to je spor');

  // Tolerancia kryje zaokrúhľovanie, nie „skoro sedí".
  eq(B.check({ worker_id: 'w1', period_id: 'per1', amount: 2600.01 }, ctx).matches, true,
    'cent rozdielu prejde');
  eq(B.check({ worker_id: 'w1', period_id: 'per1', amount: 2600.02 }, ctx).matches, false,
    'dva centy už nie');
  eq(B.TOLERANCE, 1, 'tolerancia je jeden cent');

  // Už schválenú faktúru stav nezhadzuje späť do sporu.
  eq(B.check({ worker_id: 'w1', period_id: 'per1', amount: 3200, status: 'approved' }, ctx).status,
    'approved', 'schválenej sa stav nemení');
  eq(B.check({ worker_id: 'w1', period_id: 'per1', amount: 3200, status: 'paid' }, ctx).status,
    'paid', 'ani uhradenej');

  // Bez obdobia sa neporovnáva
  const noPeriod = B.check({ worker_id: 'w1', amount: 3200 }, ctx);
  eq(noPeriod.variance, null, 'bez obdobia niet s čím porovnať');
  eq(noPeriod.matches, null, 'a nedá sa povedať, či sedí');
  eq(noPeriod.status, 'received', 'stav zostáva');
}

// ── Čo bráni schváleniu ─────────────────────────────────────────────────────
{
  const clean = B.review({
    bill: { worker_id: 'w1', period_id: 'per1', amount: 2600, storage_path: 'x.pdf' },
    ...ctx,
  });
  eq(clean.ok, true, 'sediaca faktúra so skenom sa dá schváliť');
  eq(clean.warnings, [], 'bez upozornení');

  const more = B.review({
    bill: { worker_id: 'w1', period_id: 'per1', amount: 3200, storage_path: 'x.pdf' },
    ...ctx,
  });
  eq(more.ok, false, 'faktúra na viac hodín sa nedá len tak schváliť');
  eq(more.reasons.map(r => r.rule), ['bill_variance'], 'a povie sa prečo');
  ok(more.reasons[0].label.includes('600,00'), 'aj o koľko');
  ok(more.reasons[0].detail.includes('100 schválených hodín'), 'aj z čoho to vychádza');
  ok(more.reasons[0].detail.includes('poznámkou'), 'a čo treba spraviť');

  // Keď fakturuje menej, rada je iná — možno na hodiny zabudol.
  const less = B.review({
    bill: { worker_id: 'w1', period_id: 'per1', amount: 2000, storage_path: 'x.pdf' },
    ...ctx,
  });
  ok(less.reasons[0].label.includes('menej'), 'menej sa pomenuje ako menej');
  ok(less.reasons[0].detail.includes('zabudol'), 'a poradí sa overiť to s ním');

  // Bez obdobia sa schvaľuje naslepo — upozornenie, nie prekážka.
  const blind = B.review({ bill: { worker_id: 'w1', amount: 2600, storage_path: 'x.pdf' }, ...ctx });
  eq(blind.ok, true, 'bez obdobia to neblokuje');
  ok(blind.warnings.some(w => w.rule === 'bill_no_period'), 'ale upozorní');
  ok(blind.warnings.find(w => w.rule === 'bill_no_period').detail.includes('naslepo'),
    'a povie, čo to znamená');

  // Chýbajúce fakturačné údaje a sken
  const noData = B.review({
    bill: { worker_id: 'w1', period_id: 'per1', amount: 2600 },
    ...ctx, worker: { id: 'w1', hourly_cost: 26 },
  });
  eq(noData.warnings.map(w => w.rule).sort(),
    ['bill_no_scan', 'missing_billing_data', 'missing_billing_data'],
    'chýbajúce IČO, IBAN a sken sa pripomenú');
  eq(noData.ok, true, 'ale schváleniu nebránia');

  eq(B.review({ bill: { amount: 0 }, ...ctx }).reasons.map(r => r.rule), ['bill_zero'],
    'faktúra na nulu blokuje');
  eq(B.review({ bill: { amount: -5 }, ...ctx }).reasons.map(r => r.rule), ['bill_zero'],
    'záporná tiež');
  eq(B.review({}).ok, false, 'prázdny vstup nie je v poriadku');
}

// ── Riadky do prehľadu ──────────────────────────────────────────────────────
{
  const c = B.check({ worker_id: 'w1', period_id: 'per1', amount: 3200 }, ctx);
  const lines = B.sumLines(c);
  eq(lines.length, 2, 'fakturované aj očakávané');
  eq(lines[1].kind, 'info', 'očakávané sa do súčtu nepočíta');
  ok(lines[1].hint.includes('100 h'), 'a je vidieť, z koľkých hodín');
  eq(B.sumLines(B.check({ worker_id: 'w1', amount: 100 }, ctx)).length, 1,
    'bez podkladu je riadok jeden');
}

// ── Náklady po kategóriách ──────────────────────────────────────────────────
{
  const costs = [
    { category: 'accommodation', amount: 1450 },
    { category: 'transport', amount: 320 },
    { category: 'accommodation', amount: 1450 },
    { category: 'tools', amount: 89.9 },
    { amount: 50 },
  ];
  const by = B.byCategory(costs);
  eq(by.map(x => x.category), ['accommodation', 'transport', 'tools', 'other'],
    'najväčšia položka prvá, chýbajúca kategória je „iné"');
  eq(M.format(by[0].cents), '2 900,00 €', 'ubytovanie sa sčíta');
  eq(M.format(by[2].cents), '89,90 €', 'desatiny sedia');
  eq(B.byCategory([]), [], 'prázdny zoznam');
  eq(B.byCategory(null), [], 'chýbajúci zoznam nezhodí');
  eq(B.byCategory([null, { category: 'x', amount: 1 }]).length, 1, 'prázdny riadok sa preskočí');
}

// ── Opakované náklady ───────────────────────────────────────────────────────
{
  const cost = { recurring: true, cost_date: '2026-09-15', amount: 1450 };
  eq(B.recurringDates(cost, '2026-12-31'),
    ['2026-10-15', '2026-11-15', '2026-12-15'], 'mesačne od nasledujúceho mesiaca');

  eq(B.recurringDates({ ...cost, recurring_until: '2026-11-30' }, '2027-12-31'),
    ['2026-10-15', '2026-11-15'], 'koniec platnosti sa rešpektuje');
  eq(B.recurringDates({ ...cost, recurring: false }, '2026-12-31'), [],
    'neopakovaný náklad nič negeneruje');
  eq(B.recurringDates({ recurring: true }, '2026-12-31'), [], 'bez dátumu nič');

  // Krátky mesiac: 31. januára → 28. februára, ale v marci zase 31.
  eq(B.recurringDates({ recurring: true, cost_date: '2026-01-31' }, '2026-04-30'),
    ['2026-02-28', '2026-03-31', '2026-04-30'],
    'krátky mesiac spadne na posledný deň a ďalší sa vráti');
  eq(B.addMonths('2028-01-31', 1), '2028-02-29', 'prestupný február');
  eq(B.addMonths('2026-12-15', 1), '2027-01-15', 'prechod cez nový rok');
}

// ── Ekonomika zákazky ───────────────────────────────────────────────────────
{
  const e = B.economics({
    invoices: [
      { total: 8736, withholding_amount: 1310.40, status: 'issued' },
      { total: 5000, withholding_amount: 750, status: 'paid' },
      { total: 9999, withholding_amount: 0, status: 'draft' },      // nezaráta sa
      { total: 1111, withholding_amount: 0, status: 'cancelled' },  // ani stornovaná
    ],
    bills: [
      { amount: 6000, status: 'approved' },
      { amount: 2000, status: 'paid' },
      { amount: 3000, status: 'disputed' },   // sporná ešte nie je záväzok
      { amount: 500, status: 'received' },
    ],
    costs: [{ amount: 1450 }, { amount: 320 }],
  });

  eq(M.format(e.invoiced), '13 736,00 €', 'vyfakturované bez draftov a stornov');
  eq(M.format(e.bills), '8 000,00 €', 'len schválené a uhradené faktúry živnostníkov');
  eq(M.format(e.disputed), '3 000,00 €', 'sporné zvlášť');
  eq(M.format(e.costs), '1 770,00 €', 'ostatné náklady');
  eq(M.format(e.margin), '3 966,00 €', 'marža');
  eq(e.marginPct, 28.9, 'marža v percentách');
  // Zrážka §48b mení cash-flow, nie maržu.
  eq(M.format(e.withheld), '2 060,40 €', 'zrazené podľa §48b');
  eq(M.format(e.cashIn), '11 675,60 €', 'čo reálne príde na účet');

  eq(B.economics({}).margin, 0, 'prázdna zákazka');
  eq(B.economics({}).marginPct, null, 'bez fakturácie sa percento nepočíta');
  eq(B.economics({ invoices: [null], bills: [null], costs: [null] }).margin, 0,
    'prázdne riadky nezhodia');
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
