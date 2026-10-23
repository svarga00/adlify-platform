// Testy: upomienky — node app/lib/billing/dunning.test.js
global.window = global;
const D = require('./dunning.js');
let passed = 0, failed = 0;
function eq(a, e, msg) { const x = JSON.stringify(a), y = JSON.stringify(e);
  if (x === y) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${y}\n    dostal:    ${x}`); } }
const ok = (c, m) => eq(!!c, true, m);

console.log('\nUPOMIENKY');
const INV = { id: 'i1', invoice_number: '2026088', status: 'overdue', due_date: '2026-10-01', issue_date: '2026-09-01', total: 9800 };
{
  eq(D.next({ ...INV, status: 'paid' }, [], '2026-10-23').due, false, 'zaplatená sa neupomína');
  eq(D.next({ ...INV, due_date: '2026-10-30', status: 'sent' }, [], '2026-10-23').due, false, 'pred splatnosťou nie');
  const n1 = D.next(INV, [], '2026-10-23');
  ok(n1.due && n1.level === 1 && n1.overdueDays === 22 && n1.meta.de === 'Zahlungserinnerung', 'po splatnosti: najprv priateľská pripomienka');
  const r1 = [{ invoice_id: 'i1', level: 1, sent_at: '2026-10-15T09:00:00Z' }];
  const w = D.next(INV, r1, '2026-10-23');
  ok(!w.due && w.level === 2 && w.wait === '2026-10-29', '1. Mahnung až 14 dní po pripomienke');
  const n2 = D.next(INV, r1, '2026-10-29');
  ok(n2.due && n2.level === 2 && n2.meta.de === '1. Mahnung', 'po 14 dňoch 1. Mahnung');
  const r3 = [...r1, { invoice_id: 'i1', level: 2, sent_at: '2026-10-29' }, { invoice_id: 'i1', level: 3, sent_at: '2026-11-12' }];
  eq(D.next(INV, r3, '2026-12-30').reason, 'done', 'po 2. Mahnung už appka ďalšiu neponúka');
  eq(D.deadline(1, '2026-10-23'), '2026-10-30', 'nová lehota 7 dní');
  eq(D.deadline(3, '2026-10-23'), '2026-10-28', 'pri poslednej 5 dní');
  const q = D.queue([INV, { ...INV, id: 'i2', due_date: '2026-10-20' }, { ...INV, id: 'i3', status: 'paid' }], [], '2026-10-23');
  eq(q.map(x => x.invoice.id), ['i1', 'i2'], 'zoznam na upomenutie: najstaršie navrchu, zaplatené nie');
  const t1 = D.text(1, { number: '2026088', issueDate: '2026-09-01', dueDate: '2026-10-01', amount: '9.800,00 €', newDeadline: '2026-10-30' }).join(' ');
  ok(/Rechnung Nr\. 2026088 vom 01\.09\.2026/.test(t1) && /30\.10\.2026/.test(t1) && /Versehen/.test(t1), 'pripomienka je priateľská, po nemecky, s číslom a lehotou');
  ok(/§ 288 BGB/.test(D.text(3, {}).join(' ')), 'posledná upomienka: výhrada úrokov a paušálu 40 € (§ 288 BGB)');
}
console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
