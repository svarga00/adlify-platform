// ============================================================================
// Testy výhľadu
// Spustenie:  node danubra/lib/outlook.test.js
// ============================================================================
// Čísla na prehľade rozhodujú o tom, či sa berú ďalší ľudia a či sa nakúpi
// materiál. Každé z nich tu má prípad, na ktorom je vidieť, čo znamená —
// najmä tie, ktoré sa v praxi zlievajú do jedného.
// ============================================================================
global.window = global;
const M = require('./money.js');
const O = require('./outlook');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

const TODAY = '2026-09-21';        // pondelok

console.log('Výhľad');

// ── Čo čakáme na účet ───────────────────────────────────────────────────────
{
  const inv = [
    { id: 'i1', status: 'sent', total: 5280, withholding_amount: 792,
      amount_net: 4488, due_date: '2026-10-20' },
    { id: 'i2', status: 'sent', total: 3960, withholding_amount: 594,
      amount_net: 3366, due_date: '2026-09-10' },        // po splatnosti
    { id: 'i3', status: 'paid', total: 6120, withholding_amount: 918 },
    { id: 'i4', status: 'draft', total: 1000 },
    { id: 'i5', status: 'cancelled', total: 9999 },
  ];
  const r = O.receivable(inv, TODAY);
  eq(r.count, 2, 'uhradená, rozpracovaná ani stornovaná sa nečaká');
  eq(r.gross, 924000, 'hrubá suma faktúr, ktoré ešte neprišli');
  // Toto je ten rozdiel, na ktorom sa dá popáliť: §48b odvedie odberateľ
  // finančnému úradu a nám príde o 15 % menej.
  eq(r.withheld, 138600, 'zrážka §48b sa počíta zvlášť');
  eq(r.net, 785400, 'na účet príde čistá suma, nie fakturovaná');
  eq(r.overdue, 336600, 'a po splatnosti visí 3 366 €');
  eq(r.overdueCount, 1, 'jedna faktúra po splatnosti');
}
{
  eq(O.receivable([], TODAY).net, 0, 'bez faktúr sa nečaká nič');
  eq(O.receivable(null, TODAY).count, 0, 'ani keď nepríde pole');
}

// ── Odrobené, ale nevyfakturované ───────────────────────────────────────────
{
  const o = {
    subcontracts: [{ id: 's1', title: 'Feuerbach', charge_rate: 34 }],
    assignments: [
      { id: 'a1', subcontract_id: 's1', charge_rate: 34, worker_rate: 18 },
      { id: 'a2', subcontract_id: 's1', charge_rate: 34, worker_rate: 20 },
    ],
    timesheets: [
      { assignment_id: 'a1', hours: 10, period_id: null },
      { assignment_id: 'a2', hours: 10, period_id: null },
      { assignment_id: 'a1', hours: 40, period_id: 'p1' },     // už zúčtované
    ],
  };
  const u = O.unbilled(o);
  eq(u.hours, 20, 'zúčtované hodiny sa už nepočítajú');
  eq(u.charge, 68000, 'fakturovali by sme 680 €');
  eq(u.cost, 38000, 'zaplatili by sme 380 €');
  eq(u.margin, 30000, 'marža 300 € nikde inde nefiguruje');
  eq(u.rows.length, 1, 'zhrnuté po zákazkách');
  eq(u.rows[0].title, 'Feuerbach', 'aj s názvom, nech je jasné kde');
}
{
  // Sadzba zapísaná na výkaze má prednosť — uzávierka ju tam zapíše, aby
  // neskoršia zmena cenníka neprepísala, čo už bolo vyfakturované.
  const u = O.unbilled({
    subcontracts: [{ id: 's1', charge_rate: 34 }],
    assignments: [{ id: 'a1', subcontract_id: 's1', worker_rate: 20 }],
    timesheets: [{ assignment_id: 'a1', hours: 10, rate_used: 18, period_id: null }],
  });
  eq(u.cost, 18000, 'sadzba z výkazu má prednosť pred sadzbou nasadenia');
}
{
  const u = O.unbilled({});
  eq([u.hours, u.charge, u.margin], [0, 0, 0], 'bez dát sú to nuly, nie NaN');
}

// ── Peniaze viazané v ubytovaní ─────────────────────────────────────────────
{
  const costs = [
    { category: 'accommodation', amount: 960, rebillable: true, rebilled_invoice_id: null },
    { category: 'accommodation', amount: 520, rebillable: true, rebilled_invoice_id: null },
    { category: 'travel', amount: 218, rebillable: true, rebilled_invoice_id: null },
    { category: 'accommodation', amount: 900, rebillable: true, rebilled_invoice_id: 'i1' },
    { category: 'tools', amount: 300, rebillable: false, rebilled_invoice_id: null },
  ];
  const t = O.tied(costs);
  eq(t.total, 169800, 'viazne 1 698 € — refakturované ani vlastné náklady sa nerátajú');
  eq(t.count, 3, 'tri položky');
  eq(t.byCategory[0], { category: 'accommodation', cents: 148000 },
    'najviac viazne v ubytovaní');
  eq(O.tied([]).total, 0, 'bez nákladov neviazne nič');
}

// ── Pracovné dni ────────────────────────────────────────────────────────────
{
  // Pondelok 21. 9. – piatok 25. 9. 2026 = 5 pracovných dní.
  eq(O.workdaysBetween('2026-09-21', '2026-09-25'), 5, 'týždeň má päť pracovných dní');
  eq(O.workdaysBetween('2026-09-21', '2026-09-27'), 5, 'víkend sa neráta');
  eq(O.workdaysBetween('2026-09-21', '2026-09-21'), 1, 'jeden deň je jeden deň');
  eq(O.workdaysBetween('2026-09-26', '2026-09-27'), 0, 'samá sobota a nedeľa je nula');
}

// ── Čo máme v objednávkach ──────────────────────────────────────────────────
{
  const o = {
    today: TODAY,
    subcontracts: [
      { id: 's1', title: 'Feuerbach', status: 'active', charge_rate: 34, date_to: '2026-09-25' },
      { id: 's2', title: 'Schulzentrum', status: 'active', charge_rate: 36, date_to: '2026-09-18' },
      { id: 's3', title: 'Hotovo', status: 'completed', charge_rate: 34, date_to: '2027-01-01' },
    ],
    assignments: [
      { id: 'a1', subcontract_id: 's1', status: 'active' },
      { id: 'a2', subcontract_id: 's1', status: 'active' },
      { id: 'a3', subcontract_id: 's2', status: 'active' },
    ],
  };
  const b = O.orderBook(o);
  eq(b.sites, 2, 'ukončená zákazka v objednávkach nie je');
  // 2 ľudia × 5 pracovných dní × 8 h × 34 € = 2 720 €
  eq(b.rows[0].remaining, 272000, 'zostáva odrobiť za 2 720 €');
  eq(b.rows[0].days, 5, 'a je vidieť, z koľkých dní to vyšlo');
  eq(b.rows[0].people, 2, 'aj z koľkých ľudí');
  // Zákazka, ktorej termín už uplynul, nemá čo dorobiť.
  const past = b.rows.find(r => r.id === 's2');
  eq([past.days, past.remaining], [0, 0], 'zákazka po termíne už nič nesľubuje');
  eq(b.remaining, 272000, 'spolu v objednávkach');
}

// ── Týždenný výhľad ─────────────────────────────────────────────────────────
{
  const items = [
    { expected_on: '2026-09-10', amount: 3366 },     // po splatnosti
    { expected_on: '2026-09-23', amount: -1512 },    // 1. týždeň
    { expected_on: '2026-09-30', amount: -960 },     // 2. týždeň
    { expected_on: '2026-10-16', amount: 4488 },     // 4. týždeň
    { expected_on: '2027-01-01', amount: 9999 },     // mimo výhľadu
  ];
  const w = O.weeks({ today: TODAY, weeks: 4, balance: 1000000, items });

  eq(w.weeks.length, 4, 'štyri týždne');
  eq(w.afterOverdue, 1336600, 'po splatnosti sa započíta hneď na začiatku');
  eq(w.weeks[0].out, -151200, 'prvý týždeň odíde 1 512 €');
  eq(w.weeks[0].balance, 1185400, 'a zostatok klesne');
  eq(w.weeks[3].in, 448800, 'vo štvrtom týždni príde 4 488 €');
  // 1 336 600 − 1 512 − 960 + 4 488 (v centoch)
  eq(w.endBalance, 1538200, 'na konci výhľadu');
  eq(w.afterOverdue + w.diff, w.endBalance, 'a sedí to so súčtom rozdielov');
  eq(w.totalIn, 448800, 'príjmy za štyri týždne');
  eq(w.totalOut, -247200, 'výdaje za štyri týždne');
  eq(w.diff, 201600, 'rozdiel je plus 2 016 €');
  ok(!w.negativeFrom, 'do mínusu to nejde');
}
{
  // Keď to spadne pod nulu, musí to byť vidieť a musí sa povedať kedy.
  const w = O.weeks({
    today: TODAY, weeks: 4, balance: 50000,
    items: [{ expected_on: '2026-09-23', amount: -1500 }],
  });
  ok(w.negativeFrom, 'mínus sa ohlási');
  eq(w.negativeFrom.week, 1, 'a povie sa, v ktorom týždni');
  eq(w.lowest.balance, -100000, 'aj ako hlboko to klesne');
}
{
  const w = O.weeks({ today: TODAY, weeks: 1, balance: 0, items: [] });
  eq([w.totalIn, w.totalOut, w.diff], [0, 0, 0], 'prázdny výhľad je nula, nie NaN');
}

// ── Koho a kam treba zohnať ─────────────────────────────────────────────────
{
  const o = {
    today: TODAY,
    subcontracts: [{ id: 's1', title: 'Feuerbach', site_city: 'Stuttgart' }],
    plans: [
      { id: 'p1', status: 'active', headcount: 4, city: 'Stuttgart', start_date: '2026-09-28' },
      { id: 'p2', status: 'active', headcount: 2, subcontract_id: 's1', start_date: '2026-11-01' },
      { id: 'p3', status: 'active', headcount: 3, city: 'München', start_date: '2026-12-01' },
      { id: 'p4', status: 'done', headcount: 9, city: 'Berlín' },
    ],
  };
  const h = O.hiring(o);
  eq(h.headcount, 9, 'ukončený nábor sa neráta');
  eq(h.rows[0].city, 'Stuttgart', 'najviac ľudí treba do Stuttgartu');
  eq(h.rows[0].headcount, 6, 'plán bez mesta si ho vezme zo zákazky');
  eq(h.urgent, 4, 'súrne je to, čo nastupuje do dvoch týždňov');
  eq(h.rows.length, 2, 'zhrnuté po mestách');
}

// ── Očakávaný zisk ──────────────────────────────────────────────────────────
// Tri vrstvy podľa istoty. Zliať ich do jedného čísla znamená tešiť sa
// z ponuky, ktorú nikto neprijal.
{
  const subcontracts = [{ id: 's1', title: 'Feuerbach', status: 'active',
    charge_rate: 34, date_to: '2026-09-25' }];
  const assignments = [
    { id: 'a1', subcontract_id: 's1', status: 'active', charge_rate: 34, worker_rate: 18 },
  ];
  const book = O.orderBook({ today: TODAY, subcontracts, assignments });
  const u = O.unbilled({
    subcontracts, assignments,
    timesheets: [{ assignment_id: 'a1', hours: 10, period_id: null }],
  });
  const p = O.expectedProfit({
    subcontracts, assignments, orderBook: book, unbilled: u,
    quotes: [
      { status: 'sent', margin_per_month: 2000 },
      { status: 'draft', margin_per_month: 5000 },
      { status: 'rejected', margin_per_month: 9000 },
    ],
  });
  eq(p.done, 16000, 'z odrobeného 160 € — to je najistejšie');
  // 1 človek × 5 dní × 8 h × (34 − 18) = 640 €
  eq(p.contracted, 64000, 'z bežiacej zákazky ešte 640 €');
  eq(p.pipeline, 200000, 'a z odoslanej ponuky 2 000 €, ak ju prijmú');
  eq(p.likely, 80000, 'pravdepodobné je len odrobené plus zazmluvnené');
  eq(p.all, 280000, 'so všetkým vrátane ponúk');
  eq(p.quotesSent, 1, 'rozpracovaná ani odmietnutá ponuka sa neráta');
}
{
  // Nasadenie bez sadzby sa vynechá — radšej nižšie číslo než vymyslené.
  const subcontracts = [{ id: 's1', status: 'active', charge_rate: 34, date_to: '2026-09-25' }];
  const assignments = [{ id: 'a1', subcontract_id: 's1', status: 'active' }];
  const p = O.expectedProfit({
    subcontracts, assignments,
    orderBook: O.orderBook({ today: TODAY, subcontracts, assignments }),
    unbilled: O.unbilled({}),
  });
  eq(p.contracted, 0, 'bez zapísanej sadzby sa marža nehádže');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
