// ============================================================================
// Testy: čo zaplatiť a na čo čakáme
// Spustenie:  node app/lib/money/dues.test.js
// ============================================================================
global.window = global;
const D = require('./dues.js');

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

console.log('Čo zaplatiť a na čo čakáme');
const DNES = '2026-10-21';

{
  eq(['2026-10-20', '2026-10-21', '2026-10-28', '2026-10-29', null].map(d => D.skupina(d, DNES)),
    ['late', 'week', 'week', 'later', 'none'], 'skupiny podľa splatnosti: včera, dnes, o 7 dní, o 8 dní, bez');
}

const BILLS = [
  { id: 'b1', status: 'approved', amount: 1000, due_date: '2026-10-10', worker_id: 'w1', supplier_iban: 'SK31' },
  { id: 'b2', status: 'received', amount: 250.5, due_date: '2026-10-25', supplier_name: 'Hotel Krone' },
  { id: 'b3', status: 'disputed', amount: 300, issue_date: '2026-10-01' },
  { id: 'b4', status: 'paid', amount: 999, due_date: '2026-10-01' },
  { id: 'b5', status: 'review', amount: 0 },
  { id: 'b6', status: 'discarded', amount: 777 },
];
const INVOICES = [
  { id: 'i1', status: 'sent', total: 5000, amount_net: 4260, due_date: '2026-10-11', partner_id: 'p1', invoice_number: 'F-1' },
  { id: 'i2', status: 'issued', total: 2000, due_date: '2026-11-30', partner_id: 'p1' },
  { id: 'i3', status: 'paid', total: 100, due_date: '2026-10-01' },
  { id: 'i4', status: 'pending_approval', total: 100, due_date: '2026-10-01' },
];

{
  const d = D.dues({ bills: BILLS, invoices: INVOICES, today: DNES,
    workerName: id => (id === 'w1' ? 'Ján Novák' : null), partnerName: () => 'GU Ulm GmbH' });

  eq(d.pay.count, 3, 'zaplatiť: prijatá, schválená, sporná — nie uhradená, nahratá ani zahodená');
  eq(d.pay.total, 155050, 'súčet v centoch');
  eq(d.pay.groups.map(g => [g.key, g.rows.map(r => r.id)]),
    [['late', ['b1', 'b3']], ['week', ['b2']], ['later', []], ['none', []]],
    'sporná bez splatnosti sa ráta 14 dní od vystavenia');
  eq(d.pay.groups[0].rows[0].late, 11, 'koľko dní po splatnosti');
  eq(d.pay.groups[0].rows[0].who, 'Ján Novák', 'meno živnostníka');
  eq(d.pay.groups[1].rows[0].who, 'Hotel Krone', 'alebo dodávateľa');
  ok(d.pay.groups[0].rows.find(r => r.id === 'b3').guessedDue, 'odhadnutá splatnosť je označená');
  eq(d.pay.ready.map(r => r.id), ['b1'], 'pripravené na platbu sú len schválené');
  eq(d.pay.review, 1, 'nahraté na kontrolu sa spočítajú zvlášť');

  eq(d.wait.count, 2, 'čakáme: vystavené a odoslané — nie návrh ani uhradená');
  eq(d.wait.groups[0].rows[0].cents, 426000, 'ráta sa, čo reálne príde (po §48b)');
  eq(d.wait.late, 426000, 'po splatnosti');
  eq(d.week, 426000 - (130000 + 25050), 'týždeň: čo príde mínus čo treba zaplatiť');
}

{
  const d = D.dues({ bills: BILLS, invoices: INVOICES, today: DNES });
  const s = D.sentence(d);
  ok(/Zaplatiť po splatnosti/.test(s) && /odberatelia meškajú/.test(s) && /1 nahratá faktúra čaká/.test(s),
    'veta povie, čo je naliehavé', s);
  eq(D.sentence(D.dues({ today: DNES })), 'Nič nečaká na zaplatenie ani na úhradu.', 'prázdne');
  eq(D.sentence(D.dues({ today: DNES, bills: [{ id: 'x', status: 'approved', amount: 1, due_date: '2026-12-01' }] })),
    'Nič nie je po splatnosti.', 'nič po splatnosti');
  eq(D.dues({}).pay.count, 0, 'bez vstupu nespadne');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
