// ============================================================================
// Testy checklistu pred nasadením
// Spustenie:  node app/lib/staffing/checks.test.js
// ============================================================================
// Najdôležitejšie sú dva testy. Prvý: **odškrtnúť sa dá jedine to, čo appka
// vedieť nemôže.** Keby sa dalo odškrtnúť „Platné A1", mala by appka dve
// odpovede na tú istú otázku a tá nesprávna by svietila nazeleno. Druhý:
// kľúče dokladových bodov musia sedieť s pravidlami blokátora — inak by
// checklist hlásil chýbajúci doklad, ktorý je povolený výnimkou.
// ============================================================================
global.window = global;
const C = require('./checks');
const Docs = require('./documents');
const O = require('../overrides');

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

const asg = { id: 'a1', worker_id: 'w1', date_from: '2026-10-01', date_to: '2026-12-31' };
const sc = { id: 'sc1', work_type: 'construction' };
const stav = (rows, key) => (rows.find(r => r.key === key) || {}).state;

console.log('Checklist pred nasadením');

// ── Odškrtáva sa len to, čo appka vedieť nemôže ─────────────────────────────
{
  const rucne = C.CHECKS.filter(c => c.canTick !== false && c.source === 'manual');
  eq(rucne.map(c => c.key), ['instructions'],
    'ručne sa odškrtáva jediný bod — odovzdané pokyny');

  const rows = C.build({ assignment: asg, subcontract: sc, worker: {} });
  const tick = rows.filter(r => r.canTick).map(r => r.key);
  eq(tick, ['instructions'], 'a v zloženom checkliste to platí tiež');
  ok(rows.every(r => r.detail), 'pri každom bode je napísané, odkiaľ sa berie');
  ok(C.CHECKS.every(c => c.why && c.why.length > 30),
    'a prečo tam vôbec je');
}

// ── Doklady sa čítajú z kartotéky ───────────────────────────────────────────
{
  const bez = C.build({ assignment: asg, subcontract: sc, worker: {},
    blocking: ['missing_a1', 'missing_document'] });
  eq(stav(bez, 'a1'), 'open', 'chýbajúce A1 je otvorené');
  eq(stav(bez, 'id'), 'open', 'aj chýbajúci doklad totožnosti');
  eq(stav(bez, 'contract'), 'ok', 'zmluva, ktorá neblokuje, je hotová');

  // Výnimka nie je to isté ako splnené — a nesmie sa tak ukázať.
  const vynimka = C.build({ assignment: asg, subcontract: sc, worker: {},
    waived: ['missing_a1'] });
  eq(stav(vynimka, 'a1'), 'waived', 'povolené výnimkou má vlastný stav');
  ok(vynimka.find(r => r.key === 'a1').detail.includes('výnimkou'),
    'a je to pri ňom napísané');
  ok(!vynimka.filter(r => r.required && r.state === 'open').some(r => r.key === 'a1'),
    'a A1 už medzi tým, čo blokuje, nie je');
}

// ── Body, ktoré na daný prípad nesedia, sa vynechajú ────────────────────────
{
  const bezny = C.build({ assignment: asg, subcontract: sc, worker: {} });
  ok(!bezny.some(r => r.key === 'hwo'),
    'pri neregulovanom remesle §9 HwO v zozname nie je');

  const regulovany = C.build({ assignment: asg, subcontract: sc,
    worker: { regulated_trade: true } });
  ok(regulovany.some(r => r.key === 'hwo'), 'pri regulovanom áno');

  const dielna = C.build({ assignment: asg, worker: {},
    subcontract: { id: 'sc2', work_type: 'workshop' } });
  ok(!dielna.some(r => r.key === 'zoll'), 'v dielni sa Zoll nehlási');
  ok(bezny.some(r => r.key === 'zoll'), 'na stavbe áno');
}

// ── §48b, Zoll a doprava zo zákazky ─────────────────────────────────────────
{
  const hotovo = C.build({ assignment: asg, worker: {}, subcontract: {
    ...sc, zoll_reported_at: '2026-09-20T10:00:00Z', freistellung_verified: true,
    transport_provided: true,
  } });
  eq(stav(hotovo, 'zoll'), 'ok', 'zapísané hlásenie Zoll je hotové');
  eq(stav(hotovo, 'freistellung'), 'ok', 'aj overená §48b');
  eq(stav(hotovo, 'transport'), 'ok', 'aj doprava');

  // Popis dopravy stačí — nie každú vozíme my.
  const popis = C.build({ assignment: asg, worker: {},
    subcontract: { ...sc, transport_note: 'Ide vlastným autom, cestu hradí sám.' } });
  eq(stav(popis, 'transport'), 'ok', 'popis dopravy stačí, nemusíme voziť my');
  const nic = C.build({ assignment: asg, worker: {},
    subcontract: { ...sc, transport_note: '   ' } });
  eq(stav(nic, 'transport'), 'open', 'ale prázdny popis nie');
}

// ── Ubytovanie sa číta z pobytov ────────────────────────────────────────────
{
  const stays = [{ worker_id: 'w1', subcontract_id: 'sc1',
    date_from: '2026-09-28', date_to: null }];
  eq(stav(C.build({ assignment: asg, subcontract: sc, worker: {}, stays }), 'lodging'),
    'ok', 'pobyt bez konca prekrýva nasadenie');

  // Ubytovanie, ktoré skončilo pred nástupom, nie je zabezpečené ubytovanie.
  const skoncil = [{ worker_id: 'w1', subcontract_id: 'sc1',
    date_from: '2026-08-01', date_to: '2026-09-15' }];
  eq(stav(C.build({ assignment: asg, subcontract: sc, worker: {}, stays: skoncil }), 'lodging'),
    'open', 'pobyt, ktorý skončil pred nástupom, sa neráta');

  const cudzi = [{ worker_id: 'w2', subcontract_id: 'sc1', date_from: '2026-09-28' }];
  eq(stav(C.build({ assignment: asg, subcontract: sc, worker: {}, stays: cudzi }), 'lodging'),
    'open', 'ani pobyt niekoho iného');

  const inazakazka = [{ worker_id: 'w1', subcontract_id: 'sc9', date_from: '2026-09-28' }];
  eq(stav(C.build({ assignment: asg, subcontract: sc, worker: {}, stays: inazakazka }), 'lodging'),
    'open', 'ani ubytovanie na inej zákazke');
}

// ── Ručný bod z databázy ────────────────────────────────────────────────────
{
  const checks = [{ assignment_id: 'a1', rule_key: 'instructions', done: true,
    done_at: '2026-09-29T08:00:00Z' }];
  const rows = C.build({ assignment: asg, subcontract: sc, worker: {}, checks });
  eq(stav(rows, 'instructions'), 'ok', 'odškrtnuté pokyny sú hotové');
  ok(rows.find(r => r.key === 'instructions').detail.includes('2026-09-29'),
    'a je vidieť, kedy sa to stalo');

  // Riadok patriaci inému nasadeniu sa nesmie počítať.
  const cudzi = [{ assignment_id: 'a9', rule_key: 'instructions', done: true }];
  eq(stav(C.build({ assignment: asg, subcontract: sc, worker: {}, checks: cudzi }),
    'instructions'), 'open', 'odškrtnutie pri inom nasadení sa neráta');
}

// ── Postup a veta pre človeka ───────────────────────────────────────────────
{
  const prazdny = C.build({ assignment: asg, subcontract: sc, worker: {},
    blocking: ['missing_a1', 'missing_document', 'missing_contract'] });
  const p = C.progress(prazdny);
  eq(p.total, 9, 'deväť bodov pri neregulovanom remesle na stavbe');
  eq(p.blocking >= 3, true, 'a aspoň tri z nich blokujú');
  ok(C.sentence(prazdny).startsWith('Nástup blokuje'), 'veta začne tým, čo blokuje');
  ok(C.sentence(prazdny).includes('platné a1'), 'a vymenuje čo');

  const hotovy = C.build({
    assignment: asg, worker: {},
    subcontract: { ...sc, zoll_reported_at: 'x', freistellung_verified: true,
      transport_provided: true },
    stays: [{ worker_id: 'w1', subcontract_id: 'sc1', date_from: '2026-09-01' }],
    checks: [{ assignment_id: 'a1', rule_key: 'instructions', done: true }],
  });
  eq(C.progress(hotovy).blocking, 0, 'keď je všetko, nič neblokuje');
  ok(C.sentence(hotovy).includes('všetko hotové'), 'a povie sa to');

  // Nepovinný bod nesmie blokovať nástup.
  const bezFrei = C.build({
    assignment: asg, worker: {},
    subcontract: { ...sc, zoll_reported_at: 'x', transport_provided: true },
    stays: [{ worker_id: 'w1', subcontract_id: 'sc1', date_from: '2026-09-01' }],
    checks: [{ assignment_id: 'a1', rule_key: 'instructions', done: true }],
  });
  eq(C.progress(bezFrei).blocking, 0, 'chýbajúca §48b nástup neblokuje');
  ok(C.sentence(bezFrei).includes('nepovinn'), 'ale je vidieť, že nie je hotová');

  eq(C.sentence([]), '', 'prázdny checklist nemá čo povedať');
}

// ── Checklist a blokátor musia hovoriť o tom istom ──────────────────────────
// Keby sa kľúče rozišli, checklist by hlásil chýbajúci doklad, ktorý je
// povolený výnimkou — a človek by hľadal, prečo mu nesedia dve obrazovky.
{
  const docRules = new Set();
  for (const ctx of ['assignment', 'construction', 'workshop', 'regulated']) {
    for (const req of Docs.requirementsFor([ctx])) if (req.blocks) docRules.add(req.rule);
  }
  const mine = C.CHECKS.filter(c => c.source === 'doc').map(c => c.rule);
  const chybne = mine.filter(r => !docRules.has(r));
  ok(chybne.length === 0, 'každý dokladový bod má pravidlo, ktoré blokátor pozná',
    `neznáme: ${chybne.join(', ')}`);

  const zabudnute = [...docRules].filter(r => !mine.includes(r));
  ok(zabudnute.length === 0, 'a žiadne blokujúce pravidlo v checkliste nechýba',
    `chýba v checkliste: ${zabudnute.join(', ')}`);

  // A to isté pravidlo sa musí dať povoliť výnimkou — inak by bod zostal
  // otvorený navždy.
  ok(mine.every(r => O.waivable(r)), 'a každé z nich sa dá povoliť výnimkou');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
