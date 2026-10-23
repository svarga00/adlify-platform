// Testy: mesačná fakturácia naraz — node app/lib/billing/monthly.test.js
global.window = global;
global.Money = require('../money.js');
global.DanubraPeriods = require('../staffing/periods.js');
const M = require('./monthly.js');
let passed = 0, failed = 0;
function eq(a, e, msg) { const x = JSON.stringify(a), y = JSON.stringify(e);
  if (x === y) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${y}\n    dostal:    ${x}`); } }

console.log('\nMESAČNÁ FAKTURÁCIA');
eq(M.previousMonth('2026-01-05'), '2025-12', 'v januári sa fakturuje december');
eq(M.monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' }, 'február má 28 dní');
const SUBS = [{ id: 's1', title: 'A', status: 'active' }, { id: 's2', title: 'B', status: 'active' },
  { id: 's3', title: 'C', status: 'active' }, { id: 's4', title: 'D', status: 'active' }, { id: 's5', title: 'E', status: 'lost' }];
const ASG = [{ id: 'a1', subcontract_id: 's1', charge_rate: 34, worker_rate: 22 }, { id: 'a2', subcontract_id: 's2', charge_rate: 36, worker_rate: 23 },
  { id: 'a3', subcontract_id: 's3', charge_rate: 30, worker_rate: 20 }, { id: 'a4', subcontract_id: 's4', charge_rate: 30, worker_rate: 20 }];
const TS = [
  { assignment_id: 'a1', work_date: '2026-10-05', hours: 8, approved: true },
  { assignment_id: 'a1', work_date: '2026-10-06', hours: 9, approved: true },
  { assignment_id: 'a1', work_date: '2026-11-02', hours: 8, approved: true },
  { assignment_id: 'a2', work_date: '2026-10-07', hours: 10, approved: true },
  { assignment_id: 'a3', work_date: '2026-10-08', hours: 8, approved: false },
];
const PER = [{ id: 'p2', subcontract_id: 's2', period_from: '2026-10-01', period_to: '2026-10-31', status: 'open' },
  { id: 'p4', subcontract_id: 's4', period_from: '2026-10-01', period_to: '2026-10-31', status: 'closed', amount_charged: 480, hours_construction: 16 }];
const p = M.plan({ month: '2026-10', subcontracts: SUBS, assignments: ASG, timesheets: TS, periods: PER, invoices: [] });
const by = Object.fromEntries(p.map(r => [r.subcontract.id, r]));
eq([by.s1.action, by.s1.hours, by.s1.cents], ['create', 17, 57800], 'bez obdobia: založiť, 17 h × 34 € = 578 € (novembrové hodiny nie)');
eq([by.s2.action, by.s2.cents], ['close', 36000], 'otvorené obdobie: uzavrieť a fakturovať');
eq([by.s3.action, by.s3.why], ['skip', 'Hodiny čakajú na schválenie.'], 'neschválené hodiny: preskočiť a povedať prečo');
eq([by.s4.action, by.s4.cents], ['invoice', 48000], 'uzavreté bez faktúry: len faktúra');
eq(by.s5, undefined, 'prehratá zákazka sa neponúka');
const p2 = M.plan({ month: '2026-10', subcontracts: SUBS, assignments: ASG, timesheets: TS, periods: PER, invoices: [{ period_id: 'p4', status: 'issued' }] });
eq(p2.find(r => r.subcontract.id === 's4').action, 'done', 'už vyfakturované sa nezopakuje');
eq(p.map(r => r.action), ['create', 'close', 'invoice', 'skip'], 'poradie: čo sa dá spraviť, navrchu');
console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
