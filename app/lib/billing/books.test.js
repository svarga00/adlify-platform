// Testy: prehľad pre účtovníčku — node app/lib/billing/books.test.js
global.window = global;
const B = require('./books.js');
let passed = 0, failed = 0;
function eq(a, e, msg) { const x = JSON.stringify(a), y = JSON.stringify(e);
  if (x === y) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${y}\n    dostal:    ${x}`); } }
const ok = (c, m) => eq(!!c, true, m);

console.log('\nPREHĽAD PRE ÚČTOVNÍČKU');
eq(B.range('2026-02'), { from: '2026-02-01', to: '2026-02-28', label: '2/2026', slug: '2026-02' }, 'mesiac');
eq(B.range('2026').from + '…' + B.range('2026').to, '2026-01-01…2026-12-31', 'rok');
const x = B.build({ key: '2026-10',
  partners: [{ id: 'p1', name: 'GU Ulm GmbH' }], workers: [{ id: 'w1', full_name: 'Jozef Malý' }],
  invoices: [
    { invoice_number: '2026091', issue_date: '2026-10-01', status: 'issued', total: 12400, amount_net: 12400, partner_id: 'p1', vat_regime: 'reverse_charge' },
    { invoice_number: '2026092', issue_date: '2026-10-15', status: 'draft', total: 100 },
    { invoice_number: '2026080', issue_date: '2026-09-30', status: 'paid', total: 500 }],
  bills: [{ id: 'b1', worker_id: 'w1', bill_number: 'F-1', amount: 3200, issue_date: '2026-10-05', status: 'approved', storage_path: 'x.pdf' },
    { id: 'b2', supplier_name: 'Shell', amount: 80.5, issue_date: '2026-10-07', status: 'paid' },
    { id: 'b3', supplier_name: 'Zahodená', amount: 1, issue_date: '2026-10-07', status: 'discarded' }],
  costs: [{ cost_date: '2026-10-10', category: 'accommodation', amount: 900, description: 'Monteurzimmer' }],
});
eq(x.issued.map(i => i.invoice_number), ['2026091'], 'vydané: len vystavené v mesiaci, návrh nie');
eq(x.received.map(b => b.who), ['Jozef Malý', 'Shell'], 'prijaté: živnostník menom, zahodená nie');
eq(x.totals, { issued: 1240000, issuedNet: 1240000, received: 328050, costs: 90000 }, 'súčty v centoch');
eq(x.missingFiles, ['Shell'], 'povie, ku ktorej prijatej faktúre chýba súbor');
const c = B.csv(x.issued, B.COLS.issued);
ok(c.startsWith('﻿Číslo;Vystavená') && /2026091;2026-10-01;;GU Ulm GmbH;reverse charge §13b;12400,00/.test(c), 'CSV pre Excel: stredník, desatinná čiarka, BOM');
ok(c.split('\r\n')[1].includes(';Vystavená;'), 'stav v CSV je po slovensky (Vystavená, nie issued)');
ok(B.csv([{ status: 'paid' }, { status: 'draft' }], B.COLS.issued).includes(';Zaplatená;'), 'zaplatená sa volá Zaplatená');
ok(/"a;b"/.test(B.csv([{ x: 'a;b' }], [['X', r => r.x]])), 'stredník v hodnote sa uzavrie do úvodzoviek');
eq(B.fileIn('prijate', 'Faktúra č. 5/2026.pdf', 0), 'prijate/001 Faktura c. 5-2026.pdf', 'názov súboru v balíku bez diakritiky a lomiek');
console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
