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

// Týždenne po KW (Rahmenvertrag 7/7), odberateľ 14/14 dva týždne, mesačný sa preskočí.
eq(M.weekRange('2026-W41'), { from: '2026-10-05', to: '2026-10-11', week: 41, year: 2026 }, 'KW 41 je 5. až 11. 10. 2026');
eq(M.previousWeek('2026-10-14'), '2026-W41', 'fakturuje sa predchádzajúci týždeň');
eq(M.previousWeek('2027-01-06'), '2026-W53', 'cez prelom roka KW 53');
eq(M.rangeForWeek('2026-W41', 14), { from: '2026-09-28', to: '2026-10-11' }, '14/14: zvolený KW a predchádzajúci');
eq(M.rangeForWeek('2026-W41', 30).skip.length > 10, true, 'mesačný odberateľ sa v týždennom behu preskočí');
const DNI = { s1: 7, s2: 14, s3: 30, s4: 7 };
const tyz = M.plan({ subcontracts: SUBS, assignments: ASG, timesheets: TS, periods: [], invoices: [],
  rangeOf: (sc) => M.rangeForWeek('2026-W41', DNI[sc.id]) });
const tb = Object.fromEntries(tyz.map(r => [r.subcontract.id, r]));
eq([tb.s1.action, tb.s1.from, tb.s1.to, tb.s1.hours], ['create', '2026-10-05', '2026-10-11', 17], 'týždenný odberateľ: obdobie KW 41, 17 h');
eq([tb.s2.from, tb.s2.to, tb.s2.hours], ['2026-09-28', '2026-10-11', 10], '14-dňový odberateľ: dva KW');
eq(tb.s3.action, 'skip', 'mesačný odberateľ v týždennom behu nie');
console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
