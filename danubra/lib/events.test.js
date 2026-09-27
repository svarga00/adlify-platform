// ============================================================================
// Testy udalostí (zvonček)
// Spustenie:  node danubra/lib/events.test.js
// ============================================================================
// Zvonček je jediné miesto, kde sa človek dozvie, že niečo horí, bez toho aby
// to hľadal. Keď mlčí, keď má hovoriť, prepadne doklad na stavbe. Keď hučí
// pri všetkom, prestane sa naň pozerať a je to to isté ako keby mlčal.
// ============================================================================
global.window = global;
const E = require('./events');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

const T = '2026-09-27';
const ids = (ev) => ev.map(e => e.id);
const byId = (ev, id) => ev.find(e => e.id === id);

console.log('Udalosti');

// ── Prázdno ─────────────────────────────────────────────────────────────────
{
  eq(E.build(), [], 'bez dát nič nehlási — prázdny zvonček je správna odpoveď');
  eq(E.build({ today: T, docs: [], invoices: [] }), [], 'ani s prázdnymi zoznamami');
  // Null v zozname sa stane pri každom join, ktorý nič nenašiel.
  eq(E.build({ today: T, docs: [null], invoices: [null], bills: [null] }), [],
    'null v dátach nezhodí zvonček');
}

// ── Doklady ─────────────────────────────────────────────────────────────────
// Prepadnutý doklad je jediná vec, kvôli ktorej môžu na stavbe človeka poslať
// domov, takže je to najvyššia naliehavosť.
{
  const ev = E.build({
    today: T,
    docs: [
      { id: 'd1', worker_id: 'w1', worker_name: 'Ján Novák', validity: 'expired', valid_to: '2026-09-01' },
      { id: 'd2', worker_id: 'w2', worker_name: 'Peter Dudáš', validity: 'expiring', days_left: 12 },
      { id: 'd3', worker_id: 'w3', worker_name: 'Milan Kráľ', validity: 'valid', valid_to: '2027-01-01' },
    ],
  });
  eq(ids(ev), ['doc-exp-d1', 'doc-soon-d2'], 'platný doklad nie je udalosť');
  eq(byId(ev, 'doc-exp-d1').tone, 'bad', 'prepadnutý doklad horí');
  ok(byId(ev, 'doc-exp-d1').title.includes('Ján Novák'), 'v titulku je, o koho ide');
  eq(byId(ev, 'doc-exp-d1').detail, 'platnosť skončila 1. 9. 2026', 'a odkedy');
  eq(byId(ev, 'doc-soon-d2').tone, 'warn', 'blížiaci sa koniec len upozorňuje');
  eq(byId(ev, 'doc-soon-d2').detail, 'ešte 12 dní', 's počtom dní');
  // Bez odkazu na živnostníka by sa človek nedostal tam, kde sa to rieši.
  eq(byId(ev, 'doc-exp-d1').type, 'worker', 'vedie na kartu živnostníka');
  eq(byId(ev, 'doc-exp-d1').entityId, 'w1', 'na toho správneho');
}

// ── Vydané faktúry ──────────────────────────────────────────────────────────
{
  const ev = E.build({
    today: T,
    invoices: [
      { id: 'i1', invoice_number: '2026015', status: 'sent', due_date: '2026-09-10', partner_id: 'p1' },
      { id: 'i2', invoice_number: '2026016', status: 'sent', due_date: '2026-10-10', partner_id: 'p1' },
      { id: 'i3', invoice_number: '2026017', status: 'pending_approval', issue_date: '2026-09-25' },
      { id: 'i4', invoice_number: '2026010', status: 'paid', paid_at: '2026-09-20', partner_id: 'p1' },
      { id: 'i5', invoice_number: '2026018', status: 'draft', due_date: '2026-01-01' },
      { id: 'i6', invoice_number: '2026019', status: 'cancelled', due_date: '2026-01-01' },
    ],
    partnerName: (id) => (id === 'p1' ? 'Bau Müller GmbH' : null),
  });
  ok(byId(ev, 'inv-late-i1'), 'faktúra po splatnosti sa ohlási');
  eq(byId(ev, 'inv-late-i1').tone, 'bad', 'a horí');
  eq(byId(ev, 'inv-late-i1').detail, 'Bau Müller GmbH · splatnosť bola 10. 9. 2026',
    's odberateľom aj dátumom');
  ok(!byId(ev, 'inv-late-i2'), 'faktúra pred splatnosťou nie je udalosť');
  // Návrh a zrušená faktúra nemajú splatnosť, ktorú by bolo možné prekročiť.
  ok(!byId(ev, 'inv-late-i5'), 'návrh nemôže byť po splatnosti');
  ok(!byId(ev, 'inv-late-i6'), 'ani zrušená faktúra');
  // Pravidlo appky: bez schválenia sa faktúra nevystaví. Takže čakajúce
  // schválenie je jediná vec, ktorá drží peniaze na mieste.
  ok(byId(ev, 'inv-appr-i3'), 'faktúra čakajúca na schválenie sa pripomenie');
  eq(byId(ev, 'inv-appr-i3').detail, 'bez schválenia sa nevystaví ani neodošle',
    'a povie prečo to je dôležité');
  eq(byId(ev, 'inv-paid-i4').tone, 'info', 'uhradená faktúra je dobrá správa, nie alarm');
}

// ── Prijaté faktúry od živnostníkov ─────────────────────────────────────────
{
  const ev = E.build({
    today: T,
    bills: [
      { id: 'b1', worker_id: 'w1', status: 'disputed', issue_date: '2026-09-15', note: 'hodiny nesedia o 12' },
      { id: 'b2', worker_id: 'w2', status: 'received', issue_date: '2026-09-26' },
      { id: 'b3', worker_id: 'w3', status: 'paid', issue_date: '2026-09-01' },
    ],
    workerName: (id) => ({ w1: 'Ján Novák', w2: 'Peter Dudáš' })[id] || null,
  });
  eq(ids(ev), ['bill-disp-b1', 'bill-new-b2'], 'zaplatená faktúra už nič nepotrebuje');
  // Pomlčka, nie predložka — „od Peter Kováč" je zle a skloňovať meno v kóde
  // sa spoľahlivo nedá.
  eq(byId(ev, 'bill-disp-b1').title, 'Sporná faktúra — Ján Novák', 'sporná vie od koho');
  eq(byId(ev, 'bill-disp-b1').detail, 'hodiny nesedia o 12', 'a prečo je sporná');
  eq(byId(ev, 'bill-new-b2').title, 'Prišla faktúra — Peter Dudáš', 'nová faktúra tiež');
  // Bez menovky sa udalosť nesmie stratiť — len bude bez mena.
  const anon = E.build({ today: T, bills: [{ id: 'b9', status: 'received' }] });
  eq(anon[0].title, 'Prišla faktúra', 'bez mena to nespadne');
}

// ── Obdobia ─────────────────────────────────────────────────────────────────
{
  const ev = E.build({
    today: T,
    periods: [
      { id: 'p1', status: 'open', period_to: '2026-09-15', subcontract_id: 's1' },
      { id: 'p2', status: 'open', period_to: '2026-10-15', subcontract_id: 's1' },
      { id: 'p3', status: 'closed', period_to: '2026-08-15', subcontract_id: 's1' },
    ],
    siteName: () => 'Stuttgart — Hauptbahnhof',
  });
  eq(ids(ev), ['per-p1'], 'len otvorené obdobie, ktoré už skončilo');
  eq(byId(ev, 'per-p1').detail, 'Stuttgart — Hauptbahnhof · skončilo 15. 9. 2026',
    'so stavbou, nech je jasné kde');
}

// ── Kandidáti ───────────────────────────────────────────────────────────────
// Kto sa neozve do desiatich minút, tomu zavolá konkurencia.
{
  const ev = E.build({
    today: T,
    candidates: [
      { id: 'c1', status: 'new', full_name: 'Martin Holý', created_at: '2026-09-27T08:00:00Z' },
      { id: 'c2', status: 'new', full_name: 'Ivan Rusnák', first_contact_at: '2026-09-26T09:00:00Z' },
      { id: 'c3', status: 'hired', full_name: 'Jozef Malý' },
    ],
  });
  eq(ids(ev), ['cand-c1'], 'len ten, komu sa ešte nikto neozval');
  eq(byId(ev, 'cand-c1').date, '2026-09-27', 'dátum je z prihlášky, nie z dneška');
}

// ── Banka ───────────────────────────────────────────────────────────────────
// Nespárované pohyby sa zlučujú do jednej udalosti. Dvadsať riadkov
// „pohyb nie je spárovaný" by zvonček zaplavilo a zvyšok by sa stratil.
{
  const one = E.build({
    today: T,
    transactions: [{ id: 't1', match_status: 'unmatched', booked_at: '2026-09-20' }],
  });
  eq(one[0].title, '1 pohyb na účte nie je spárovaný', 'jeden v jednotnom čísle');
  const three = E.build({
    today: T,
    transactions: [
      { id: 't1', match_status: 'unmatched', booked_at: '2026-09-20' },
      { id: 't2', match_status: 'unmatched', booked_at: '2026-09-25' },
      { id: 't3', match_status: 'unmatched', booked_at: '2026-09-22' },
      { id: 't4', match_status: 'matched', booked_at: '2026-09-26' },
    ],
  });
  eq(three.length, 1, 'zo všetkých nespárovaných je jedna udalosť');
  eq(three[0].title, '3 pohyby na účte nie sú spárované', 'dva až štyri majú svoj tvar');
  eq(three[0].date, '2026-09-25', 'dátum je z najnovšieho pohybu');
  eq(three[0].route, 'bank', 'a klikne sa to na banku');
  const many = E.build({
    today: T,
    transactions: Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, match_status: 'unmatched' })),
  });
  eq(many[0].title, '7 pohybov na účte nie je spárovaných', 'päť a viac tiež');
  eq(E.build({ today: T, transactions: [{ id: 't', match_status: 'matched' }] }), [],
    'keď je všetko spárované, banka mlčí');
}

// ── Úlohy ───────────────────────────────────────────────────────────────────
// Úlohy majú vlastnú obrazovku, takže do zvončeka patrí len to, čo je na spadnutie.
{
  const ev = E.build({
    today: T,
    tasks: [
      { id: 'k1', title: 'Predĺžiť A1 pre Jána', due_date: '2026-09-20', entity_type: 'worker', entity_id: 'w1' },
      { id: 'k2', title: 'Poslať Stundennachweis', due_date: '2026-09-30' },
      { id: 'k3', title: 'Ročná kontrola zmluvy', due_date: '2026-12-01' },
      { id: 'k4', title: 'Bez termínu' },
    ],
  });
  eq(ids(ev).sort(), ['task-k1', 'task-k2'], 'ďaleká budúcnosť ani úloha bez termínu tu nie sú');
  eq(byId(ev, 'task-k1').tone, 'bad', 'zmeškaný termín horí');
  eq(byId(ev, 'task-k1').detail, 'malo byť hotové 20. 9. 2026', 'a povie odkedy');
  eq(byId(ev, 'task-k2').tone, 'warn', 'termín do týždňa upozorňuje');
  eq(byId(ev, 'task-k2').detail, 'termín 30. 9. 2026', 'a kedy je');
  // Hranica siedmeho dňa sa nesmie posunúť — inak sa zvonček plní mesiac dopredu.
  const hranica = E.build({ today: T, tasks: [{ id: 'h', title: 'Presne za týždeň', due_date: '2026-10-04' }] });
  eq(hranica.length, 1, 'presne siedmy deň sa ešte zmestí');
  const za8 = E.build({ today: T, tasks: [{ id: 'h', title: 'Za osem dní', due_date: '2026-10-05' }] });
  eq(za8.length, 0, 'ôsmy už nie');
}

// ── Poradie ─────────────────────────────────────────────────────────────────
// Toto je celý zmysel zvončeka: hore je to, čo horí, a v rámci toho najnovšie.
{
  const ev = E.build({
    today: T,
    invoices: [
      { id: 'i4', invoice_number: 'A', status: 'paid', paid_at: '2026-09-26' },
      { id: 'i1', invoice_number: 'B', status: 'sent', due_date: '2026-09-01' },
      { id: 'i9', invoice_number: 'C', status: 'sent', due_date: '2026-09-20' },
      { id: 'i3', invoice_number: 'D', status: 'pending_approval', issue_date: '2026-09-10' },
    ],
  });
  eq(ids(ev), ['inv-late-i9', 'inv-late-i1', 'inv-appr-i3', 'inv-paid-i4'],
    'najprv to, čo horí; v rámci naliehavosti najnovšie');
}

// ── Strop ───────────────────────────────────────────────────────────────────
{
  const veľa = Array.from({ length: 50 }, (_, i) => ({
    id: `d${i}`, worker_id: `w${i}`, validity: 'expired', valid_to: '2026-09-01',
  }));
  eq(E.build({ today: T, docs: veľa }).length, 30, 'viac než tridsať sa nedá prečítať');
  eq(E.build({ today: T, docs: veľa, limit: 5 }).length, 5, 'strop sa dá zmeniť');
}

// ── Nové od poslednej návštevy ──────────────────────────────────────────────
{
  const ev = [
    { id: 'a', date: '2026-09-27' },
    { id: 'b', date: '2026-09-25' },
    { id: 'c', date: '2026-09-20' },
  ];
  eq(E.unseen(ev, '2026-09-24'), 2, 'počíta sa to, čo je novšie než posledná návšteva');
  eq(E.unseen(ev, '2026-09-27'), 0, 'po prečítaní zvonček zhasne');
  eq(E.unseen(ev, null), 3, 'kto tu ešte nebol, má nové všetko');
  eq(E.unseen([], '2026-09-01'), 0, 'bez udalostí nie je čo svietiť');
  eq(E.unseen(null, '2026-09-01'), 0, 'ani bez zoznamu');
  // Čas v pečiatke nesmie hodiť dátum porovnanie — reže sa na deň.
  eq(E.unseen(ev, '2026-09-24T23:59:00Z'), 2, 'z pečiatky sa berie len dátum');
}

// ── Všetko naraz ────────────────────────────────────────────────────────────
// Tak, ako to príde z prehľadu. Ide o to, že sa udalosti nezačnú biť.
{
  const ev = E.build({
    today: T,
    docs: [{ id: 'd1', worker_id: 'w1', worker_name: 'Ján', validity: 'expired', valid_to: '2026-09-01' }],
    invoices: [{ id: 'i1', invoice_number: '2026015', status: 'sent', due_date: '2026-09-10' }],
    bills: [{ id: 'b1', worker_id: 'w1', status: 'received', issue_date: '2026-09-26' }],
    periods: [{ id: 'p1', status: 'open', period_to: '2026-09-15', subcontract_id: 's1' }],
    candidates: [{ id: 'c1', status: 'new', full_name: 'Martin', created_at: '2026-09-27' }],
    transactions: [{ id: 't1', match_status: 'unmatched', booked_at: '2026-09-25' }],
    tasks: [{ id: 'k1', title: 'Predĺžiť A1', due_date: '2026-09-20' }],
  });
  eq(ev.length, 7, 'každý zdroj sa ozve raz');
  eq(new Set(ids(ev)).size, 7, 'a žiadne dve udalosti nemajú rovnaké id');
  eq(ev.filter(e => e.tone === 'bad').length, 3, 'tri veci horia');
  ok(ev.every(e => e.title && e.date && e.icon), 'každá udalosť má titulok, dátum aj ikonu');
  ok(ev.every(e => e.type || e.route), 'a každá vie, kam sa má kliknúť');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
