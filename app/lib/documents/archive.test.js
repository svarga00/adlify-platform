// ============================================================================
// Testy: archív dokumentov — názvy, cesty, triedenie
// Spustenie:  node app/lib/documents/archive.test.js
// ============================================================================
global.window = global;
const A = require('./archive.js');

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

console.log('\nNÁZOV SÚBORU');
{
  eq(A.fileName({ kind: 'ramcova', number: '2026-093', who: 'Jozef Malý', date: '2026-10-23' }),
    '2026-10-23 Rámcová zmluva 2026-093 – Jozef Malý.pdf', 'dátum, druh, číslo, komu');
  eq(A.fileName({ kind: 'werkvertrag', number: 'WV-2026-003', who: 'GU Ulm GmbH', date: '2026-10-23' }),
    '2026-10-23 Werkvertrag WV-2026-003 – GU Ulm GmbH.pdf', 'Nemcovi po nemecky');
  eq(A.fileName({ kind: 'gdpr', who: 'Peter Veľký', date: '2026-10-23' }),
    '2026-10-23 Súhlas GDPR – Peter Veľký.pdf', 'bez čísla');
  eq(A.fileName({ kind: 'objednavka', title: 'Objednávka OBJ-12', number: 'OBJ-12', who: 'Ján', date: '2026-10-23' }),
    '2026-10-23 Objednávka OBJ-12 – Ján.pdf', 'číslo sa nezopakuje, keď je už v nadpise');
  ok(!/[\\/:*?"<>|]/.test(A.fileName({ kind: 'ine', title: 'A/B: "test"?', who: 'X|Y', date: '2026-10-23' })),
    'žiadne znaky, ktoré Windows ani iPhone nedovolí');
  eq(A.label('neznamy'), 'Dokument', 'neznámy druh je „Dokument"');
}

console.log('\nKOMU PATRÍ A KAM SA ULOŽÍ');
{
  eq(A.ownerOf({ worker_id: 'w1', partner_id: 'p1', subcontract_id: 's1' }), { type: 'worker', id: 'w1' },
    'najprv človek');
  eq(A.ownerOf({ partner_id: 'p1', subcontract_id: 's1' }), { type: 'partner', id: 'p1' }, 'potom firma');
  const p = A.storagePath({ kind: 'gdpr', worker_id: 'w1', who: 'Peter Veľký', date: '2026-10-23' },
    { now: new Date('2026-10-23T10:11:12Z'), rnd: 'abcde' });
  eq(p, 'archiv/worker/w1/2026-10/2026-10-23-10-11-12-abcde-2026-10-23-suhlas-gdpr-peter-velky.pdf',
    'cesta je bez diakritiky a podľa človeka a mesiaca');
}

const ROWS = [
  { id: 1, kind: 'ramcova', number: '2026-093', worker_id: 'w1', file_name: '2026-10-01 Rámcová zmluva 2026-093 – Jozef Malý.pdf', created_at: '2026-10-01T08:00:00Z' },
  { id: 2, kind: 'ramcova', number: '2026-093', worker_id: 'w1', file_name: '2026-10-02 Rámcová zmluva 2026-093 – Jozef Malý.pdf', created_at: '2026-10-02T08:00:00Z' },
  { id: 3, kind: 'gdpr', worker_id: 'w1', file_name: '2026-10-02 Súhlas GDPR – Jozef Malý.pdf', created_at: '2026-10-02T09:00:00Z' },
  { id: 4, kind: 'werkvertrag', number: 'WV-1', partner_id: 'p1', lang: 'de', file_name: '2026-10-03 Werkvertrag WV-1 – GU Ulm GmbH.pdf', created_at: '2026-10-03T08:00:00Z' },
  { id: 5, kind: 'gdpr', worker_id: 'w2', file_name: '2026-10-04 Súhlas GDPR – Adam Bača.pdf', created_at: '2026-10-04T08:00:00Z' },
  { id: 6, kind: 'gdpr', worker_id: 'w2', file_name: 'skryté', created_at: '2026-10-05T08:00:00Z', archived_at: '2026-10-06T08:00:00Z' },
];
const NAMES = { 'worker:w1': 'Jozef Malý', 'worker:w2': 'Adam Bača', 'partner:p1': 'GU Ulm GmbH' };

console.log('\nTRIEDENIE');
{
  const l = A.latest(ROWS);
  const zmluva = l.find(r => r.kind === 'ramcova');
  ok(zmluva.id === 2 && zmluva.older.length === 1, 'tá istá zmluva dvakrát: posledná verzia + 1 staršia');
  ok(!l.some(r => r.id === 6), 'skrytý dokument v zozname nie je (nemaže sa, len sa skryje)');
  const g = A.grouped(ROWS, { names: NAMES });
  eq(g.map(x => x.name), ['Adam Bača', 'Jozef Malý', 'GU Ulm GmbH'], 'najprv ľudia podľa abecedy, potom firmy');
  eq(g[1].rows.map(r => r.id), [3, 2], 'v skupine od najnovšieho');
  eq(A.grouped(ROWS, { names: NAMES, group: 'zmluvy' }).map(x => x.name), ['Jozef Malý', 'GU Ulm GmbH'], 'filter: len zmluvy');
  eq(A.grouped(ROWS, { names: NAMES, q: 'ulm' }).map(x => x.name), ['GU Ulm GmbH'], 'hľadanie v názve');
}

console.log('\nPOSIELANIE');
{
  const t = A.shareText([ROWS[1], ROWS[2]]);
  ok(/posielame 2 dokumenty/.test(t) && /Rámcová zmluva 2026-093/.test(t) && !/\.pdf/.test(t), 'správa vymenuje, čo je v prílohe', t);
  eq(A.langOf([ROWS[3]]), 'de', 'firme po nemecky');
  ok(/Guten Tag/.test(A.shareText([ROWS[3]], { lang: 'de' })), 'nemecký text');
  eq(A.langOf([ROWS[3], ROWS[2]]), 'sk', 'zmiešané po slovensky');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
