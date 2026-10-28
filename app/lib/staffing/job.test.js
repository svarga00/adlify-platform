// ============================================================================
// Testy: zákazka ako sedem krokov
// Spustenie:  node app/lib/staffing/job.test.js
// ============================================================================
global.window = global;
const J = require('./job');
const S = require('./site');

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

const TODAY = '2026-10-23';
const SC = { id: 'sc1', status: 'active', partner_id: 'p1', scope: 'Sadrokartón 1. NP, 420 m²',
  charge_rate: 34, date_from: '2026-11-02', work_type: 'construction',
  transport_note: 'Ide dodávka z Trnavy', contract_id: 'c1' };
const ASG = [
  { id: 'a1', worker_id: 'w1', status: 'planned' },
  { id: 'a2', worker_id: 'w2', status: 'planned' },
];
const WORKERS = [{ id: 'w1', full_name: 'Ján Novák' }, { id: 'w2', full_name: 'Peter Kováč' }];
const DOCS = [
  { worker_id: 'w1', kind: 'gdpr', status: 'valid' }, { worker_id: 'w2', kind: 'gdpr', status: 'valid' },
  { worker_id: 'w1', kind: 'contract', status: 'valid', valid_to: '2027-12-31' },
  { worker_id: 'w2', kind: 'contract', status: 'valid' },
];
const ORDERS = [
  { kind: 'customer', status: 'confirmed', their_ref: 'BE-4711' },
  { kind: 'worker', status: 'sent', assignment_id: 'a1' },
  { kind: 'worker', status: 'sent', assignment_id: 'a2' },
];
const HOTOVO = {
  subcontract: SC, opportunity: { headcount: 2 },
  contract: { id: 'c1', status: 'signed', signed_at: '2026-10-20' },
  orders: ORDERS, assignments: ASG, workers: WORKERS, docs: DOCS, missing: {},
  check: { ok: true, blockers: [], warnings: [] }, housed: 2, today: TODAY,
  site: S.state({ subcontract: SC, partner: { name: 'GU Ulm' }, check: { ok: true, blockers: [] },
    assignments: ASG, housed: 2,
    timesheets: [{ assignment_id: 'a1', hours: 8, approved: true, period_id: 'per1' }],
    periods: [{ id: 'per1', status: 'closed' }], invoices: [{ id: 'f1', period_id: 'per1', status: 'paid' }] }),
};
const krok = (steps, key) => steps.find(s => s.key === key);
const s = (patch) => J.steps({ ...HOTOVO, ...patch });

console.log('\nSEDEM KROKOV');
{
  eq(J.STEPS.map(x => x.n), [1, 2, 3, 4, 5, 6, 7], 'sedem krokov, očíslované');
  eq(J.STEPS.map(x => x.title), ['Dopyt a ponuka', 'Ľudia na stavbu', 'Zmluva s Nemcom', 'Papiere ľudí',
    'Zmluvy a objednávky živnostníkom', 'Ubytovanie a doprava', 'Hodiny a faktúra'],
  'v poradí, v akom sa robia');
  eq(J.STEPS.map(x => x.key), ['dopyt', 'ludia', 'nemec', 'papiere', 'zivnostnici', 'ubytovanie', 'peniaze'],
    'kľúče krokov — viažu sa na ne vysvetlivky a Papiere');
  ok(J.STEPS.every(x => x.lead && x.ico), 'každý krok povie jednou vetou, čo to je');
  ok(Object.isFrozen(J.STEPS) && J.STEPS.every(x => Object.isFrozen(x)),
    'zoznam krokov je jeden pre celú appku a nikto si ho potichu neprepíše');
  eq(J.stepByKey('zivnostnici').n, 5, 'objednávka živnostníkovi je krok 5 — všade');
  eq(J.stepByKey('ubytovanie').n, 6, 'ubytovanie je krok 6 — všade');
  eq(J.stepByKey('neexistuje'), null, 'neznámy kľúč nevráti nič');
  eq(J.steps(HOTOVO).map(x => x.title), J.STEPS.map(x => x.title),
    'zákazka kreslí presne tie isté názvy');
  const all = J.steps(HOTOVO);
  ok(all.every(x => x.done), 'zákazka, na ktorej je všetko, má všetko hotové',
    all.filter(x => !x.done).map(x => `${x.key}: ${x.detail}`).join(' | '));
  eq(J.next(all, SC).done, true, 'a nič nečaká');
  eq(J.progress(all), { done: 7, total: 7 }, '7 zo 7');
}

console.log('\n2 · ĽUDIA');
{
  const l = krok(s({ assignments: [ASG[0]], opportunity: { headcount: 5 } }), 'ludia');
  ok(!l.done && l.detail === '1 z 5 ľudí', 'počet z dopytu: 1 z 5', l.detail);
  eq(l.todo, 'Chýbajú ešte 4 ľudia.', 'koľko ešte chýba');
  const prazdna = krok(s({ assignments: [], opportunity: null }), 'ludia');
  ok(!prazdna.done && /nábore/.test(prazdna.todo), 'bez ľudí: nasadiť alebo nájsť v nábore');
}

console.log('\n3 · ZMLUVA S NEMCOM');
{
  ok(/BE-4711/.test(krok(s({}), 'nemec').detail), 'číslo jeho objednávky je vo vete');
  const bez = krok(s({ contract: null }), 'nemec');
  ok(!bez.done && /Pripravte zmluvu/.test(bez.todo), 'bez zmluvy: pripraviť');
  const draft = krok(s({ contract: { status: 'sent' } }), 'nemec');
  ok(!draft.done && /podpis/.test(draft.todo), 'odoslaná, nepodpísaná: čaká na podpis');
}

console.log('\n4 · PAPIERE ĽUDÍ');
{
  const g = krok(s({ docs: DOCS.filter(d => !(d.worker_id === 'w2' && d.kind === 'gdpr')) }), 'papiere');
  ok(!g.done && /Kováč/.test(g.detail) && /GDPR/.test(g.todo), 'kto nemá GDPR, je menovite', g.detail);
  const a1 = krok(s({ missing: { w1: ['missing_a1'] } }), 'papiere');
  ok(!a1.done && /Novák/.test(a1.detail) && /doklad/.test(a1.todo), 'chýbajúce A1 je pri mene');
  ok(a1.state === 'bad', 'a horí — ľudia sú na stavbu naplánovaní');
  const len = krok(s({ missing: { w1: ['missing_contract'] } }), 'papiere');
  ok(len.done, 'zmluva o dielo sa tu nehlási — patrí do piateho kroku');
  const zoll = krok(s({ check: { ok: false, blockers: [{ label: 'Zákazka nie je ohlásená na Zoll',
    fix: 'meldeportal-mindestlohn.de → uložiť Meldungs-ID' }] } }), 'papiere');
  ok(!zoll.done && /Zoll/.test(zoll.detail) && /meldeportal/.test(zoll.todo), 'firemná podmienka (Zoll) je tu tiež');
  const jehoA1 = krok(s({ check: { ok: false, blockers: [{ label: 'Ján Novák: chýba A1', worker_id: 'w1' }] } }), 'papiere');
  ok(!/chýba A1/.test(jehoA1.detail), 'položka o človeku sa medzi firemné nepočíta dvakrát', jehoA1.detail);

  // Migrácia 067: zapísaný, ale nenahratý doklad nepustí — a povie sa to inak
  // než „chýba doklad", lebo stačí ho odfotiť.
  const sken = krok(s({ missing: { w1: ['missing_scan'] } }), 'papiere');
  ok(!sken.done && /nie je nahratý: Ján Novák/.test(sken.detail), 'doklad bez skenu je pri mene', sken.detail);
  ok(!/chýba doklad/.test(sken.detail), 'a nepíše sa ako chýbajúci', sken.detail);
  ok(/nahrajte sken/.test(sken.todo), 'úloha je nahrať sken', sken.todo);
  eq(sken.state, 'bad', 'a horí rovnako ako chýbajúci doklad');
  const gBez = krok(s({ docs: DOCS.map(d => (d.worker_id === 'w2' && d.kind === 'gdpr')
    ? { ...d, storage_path: null, file_url: null } : d) }), 'papiere');
  ok(!gBez.done && /nie je nahratý: .*Kováč/.test(gBez.detail), 'súhlas GDPR bez skenu nie je hotový', gBez.detail);
  ok(!/bez GDPR/.test(gBez.detail), 'ale nepíše sa „bez GDPR" — podpísaný je');
}

console.log('\n5 · ZMLUVY A OBJEDNÁVKY ŽIVNOSTNÍKOM');
{
  const z = krok(s({ docs: DOCS.filter(d => !(d.worker_id === 'w1' && d.kind === 'contract')) }), 'zivnostnici');
  ok(!z.done && /bez zmluvy: Ján Novák/.test(z.detail), 'kto nemá zmluvu', z.detail);
  const stara = krok(s({ docs: DOCS.map(d => (d.worker_id === 'w1' && d.kind === 'contract') ? { ...d, valid_to: '2025-01-01' } : d) }), 'zivnostnici');
  ok(!stara.done, 'skončená zmluva neplatí');
  const zBez = krok(s({ docs: DOCS.map(d => (d.worker_id === 'w1' && d.kind === 'contract')
    ? { ...d, storage_path: null } : d) }), 'zivnostnici');
  ok(!zBez.done && /zmluva nie je nahratá: Ján Novák/.test(zBez.detail), 'zmluva bez skenu nie je hotová', zBez.detail);
  ok(/Nahrajte sken/.test(zBez.todo), 'a úloha je nahrať sken, nie tlačiť novú', zBez.todo);
  eq(J.person({ assignment: { worker_id: 'w1' }, docs: [{ worker_id: 'w1', kind: 'gdpr' }] }).gdpr, true,
    'riadok bez stĺpcov so súborom sa za nenahratý nepovažuje');
  const o = krok(s({ orders: ORDERS.filter(x => x.assignment_id !== 'a2') }), 'zivnostnici');
  ok(!o.done && /Vystavte objednávku \(Peter Kováč\)/.test(o.todo), 'komu vystaviť objednávku', o.todo);
}

console.log('\n6 · UBYTOVANIE A DOPRAVA');
{
  const u = krok(s({ housed: 0 }), 'ubytovanie');
  ok(!u.done && u.todo === 'Nájdite ubytovanie pre 2 ľudí.' && /ubytovaní 0 z 2/.test(u.detail), 'koľkým chýba ubytovanie', u.todo);
  const d = krok(s({ subcontract: { ...SC, transport_note: null } }), 'ubytovanie');
  ok(!d.done && /kto ľudí vezie/.test(d.todo), 'bez dopravy');
}

console.log('\n7 · HODINY A FAKTÚRA + ČO JE NA RADE');
{
  const site = S.state({ subcontract: SC, check: { ok: true, blockers: [] }, assignments: ASG,
    timesheets: [], periods: [{ id: 'per1', status: 'closed' }], invoices: [{ id: 'f1', period_id: 'per1', status: 'overdue' }] });
  const all = s({ site });
  const p = krok(all, 'peniaze');
  ok(p.state === 'bad' && /splatnosti/.test(p.todo), 'faktúra po splatnosti horí');
  eq(J.next(all, SC).key, 'peniaze', 'a je na rade, aj keď je posledná');
  const zaciatok = s({ contract: null, housed: 0 });
  eq(J.next(zaciatok, SC).key, 'nemec', 'inak prvý nehotový krok zhora');
  ok(J.next(zaciatok, { ...SC, status: 'completed' }).closed, 'uzavretá zákazka nič nechce');
}

console.log('\nVYKÁ SA');
{
  eq(J.vykat('Schváľ 2 výkazy — neschválené hodiny do podkladu nejdú.'), 'Schváľte 2 výkazy — neschválené hodiny do podkladu nejdú.', 'Schváľ → Schváľte');
  eq(J.vykat('Doplň sadzba, termín — bez toho sa nedá fakturovať.'), 'Doplňte sadzba, termín — bez toho sa nedá fakturovať.', 'Doplň → Doplňte');
  eq(J.vykat('Obdobie je otvorené. Uzavri ho a fakturuj.'), 'Obdobie je otvorené. Uzavrite ho a fakturuj.', 'len celé slovo');
  const bez = { ...SC, charge_rate: null };
  const all = J.steps({ ...HOTOVO, subcontract: bez,
    site: S.state({ subcontract: bez, check: { ok: true, blockers: [] }, assignments: ASG }) });
  ok(/^Doplňte/.test(krok(all, 'dopyt').todo), 'prvý krok vyká', krok(all, 'dopyt').todo);
}

console.log('\nULOŽENÉ UBYTOVANIA V OKOLÍ');
{
  const site = { lat: 49.3108, lng: 12.8456 };
  const r = J.nearbySaved([
    { id: 'far', name: 'Mníchov', lat: 48.137, lng: 11.575 },
    { id: 'near', name: 'Furth', lat: 49.2654, lng: 12.8517 },
    { id: 'nopos', name: 'Bez polohy' },
    { id: 'mid', name: 'Cham', lat: 49.22, lng: 12.66 },
  ], site);
  eq(r.map(x => x.id), ['near', 'mid', 'nopos'], 'najbližšie hore, ďaleké preč, bez polohy na koniec');
  eq(r[0].km, 5.1, 'vzdialenosť v km');
  eq(J.nearbySaved([{ id: 'x' }], {}).map(x => x.km), [null], 'stavba bez polohy: zoznam bez vzdialeností');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
