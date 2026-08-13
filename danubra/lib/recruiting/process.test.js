// ============================================================================
// Testy: náborový proces kandidáta
// Spustenie:  node danubra/lib/recruiting/process.test.js
// ============================================================================
global.window = global;
const P = require('./process');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    expected: ${e}\n    actual:   ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

const IND = { type: 'individual' };
const CREW = { type: 'crew', crew_size: 3 };
const chk = (step, idx, checked = true) => ({ step_key: step, item_index: idx, checked });

/** Zaškrtne celý krok pre daný typ kandidáta. */
function allOf(stepKey, type) {
  const step = P.STEPS.find(s => s.key === stepKey);
  return P.applicableItems(step, type).map(i => chk(stepKey, i.index));
}

console.log('\nDEFINÍCIA KROKOV');
{
  eq(P.STEPS.map(s => s.key), ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'], 'šesť krokov v poradí');
  eq(P.STEPS.find(s => s.key === 'k1').items.length, 6, 'K1 má šesť otázok');
  eq(P.STEPS.find(s => s.key === 'k2').items.length, 16, 'K2 má šestnásť otázok');
  eq(P.STEPS.find(s => s.key === 'k3').items.length, 5, 'K3 má päť položiek');
  eq(P.STEPS.find(s => s.key === 'k4').items.length, 7, 'K4 má sedem položiek');
  eq(P.STEPS.find(s => s.key === 'k5').items.length, 7, 'K5 má sedem položiek');
  eq(P.STEPS.find(s => s.key === 'k6').items.length, 3, 'K6 má tri kontroly');
  eq(P.FLAGS.items.length, 5, 'päť červených vlajok');
}

console.log('\nOTÁZKY PRE PARTIU');
{
  const k2 = P.STEPS.find(s => s.key === 'k2');
  eq(P.applicableItems(k2, 'individual').length, 14, 'jednotlivec dostane štrnásť otázok');
  eq(P.applicableItems(k2, 'crew').length, 16, 'partia dostane všetkých šestnásť');
  const indexes = P.applicableItems(k2, 'crew').map(i => i.index).slice(-2);
  eq(indexes, [14, 15], 'otázky pre partiu sú posledné dve');
  ok(!P.applicableItems(k2, 'individual').some(i => i.index >= 14),
    'jednotlivcovi sa otázky o partii nezobrazia');
}

console.log('\nPOSTUP');
{
  const empty = P.candidateProgress(IND, []);
  eq(empty.percent, 0, 'bez zaškrtnutia je postup nula');
  eq(empty.currentStep.key, 'k1', 'aktuálny krok je prvý');
  ok(!empty.complete, 'nie je hotový');
  eq(empty.total, 6 + 14 + 5 + 7 + 7 + 3, 'jednotlivec má 42 položiek');
}
{
  const crewTotal = P.candidateProgress(CREW, []).total;
  eq(crewTotal, 44, 'partia má o dve položky viac');
}
{
  const checks = allOf('k1', 'individual');
  const p = P.candidateProgress(IND, checks);
  eq(p.steps[0].complete, true, 'K1 je hotový');
  eq(p.currentStep.key, 'k2', 'posunul sa na K2');
  eq(p.percent, Math.round((6 / 42) * 100), 'postup zodpovedá pomeru položiek');
}
{
  // Neúplný krok nesmie posunúť ďalej
  const checks = [...allOf('k1', 'individual'), chk('k2', 0), chk('k2', 1)];
  const p = P.candidateProgress(IND, checks);
  eq(p.currentStep.key, 'k2', 'rozrobený krok zostáva aktuálny');
  eq(p.steps[1].done, 2, 'a vie, koľko z neho je hotové');
}
{
  // Partia, ktorej chýbajú len otázky pre partie
  const checks = allOf('k2', 'individual');
  eq(P.stepProgress(P.STEPS[1], checks, 'crew').complete, false,
    'partii nestačí zodpovedať otázky pre jednotlivca');
  eq(P.stepProgress(P.STEPS[1], checks, 'individual').complete, true,
    'jednotlivcovi tie isté odpovede stačia');
}
{
  const all = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'].flatMap(k => allOf(k, 'individual'));
  const p = P.candidateProgress(IND, all);
  eq(p.percent, 100, 'všetko zaškrtnuté = sto percent');
  ok(p.complete, 'proces je hotový');
  eq(p.currentStep, null, 'nie je ďalší krok');
}
{
  // Odškrtnutá položka sa neráta
  const checks = [...allOf('k1', 'individual')];
  checks[2].checked = false;
  const p = P.candidateProgress(IND, checks);
  eq(p.steps[0].done, 5, 'odškrtnutá položka sa odráta');
  ok(!p.steps[0].complete, 'krok už nie je hotový');
}

console.log('\nČERVENÉ VLAJKY');
{
  const checks = [...allOf('k1', 'individual'), chk('flags', 0), chk('flags', 4)];
  const p = P.candidateProgress(IND, checks);
  eq(p.flagCount, 2, 'dve vlajky');
  eq(p.flags.map(f => f.index), [0, 4], 'vie, ktoré to sú');
  eq(p.steps[0].done, 6, 'vlajky nezasahujú do postupu krokov');
  eq(p.total, 42, 'ani do celkového počtu položiek');
  eq(p.percent, Math.round((6 / 42) * 100), 'postup je rovnaký ako bez vlajok');
}
{
  eq(P.candidateProgress(IND, []).flagCount, 0, 'bez vlajok je počet nula');
}

console.log('\nOTVORENÝ KROK PO NAČÍTANÍ');
{
  eq(P.initialOpenStep(IND, []), 'k1', 'prázdny kandidát otvorí prvý krok');
  eq(P.initialOpenStep(IND, allOf('k1', 'individual')), 'k2', 'inak prvý nedokončený');
  const all = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'].flatMap(k => allOf(k, 'individual'));
  eq(P.initialOpenStep(IND, all), 'k6', 'pri hotovom procese posledný krok');
}

console.log('\nOZNAČENIE ZA NASTÚPENÉHO');
{
  const all = ['k1', 'k2', 'k3', 'k4', 'k5'].flatMap(k => allOf(k, 'individual'));
  const noOrder = P.canHire(IND, all, null);
  ok(!noOrder.ok, 'bez zákazky sa nedá nastúpiť');
  ok(noOrder.blocking, 'a je to tvrdá prekážka');
  ok(P.canHire(IND, all, 'sub-1').ok, 'so zákazkou a hotovým K5 áno');
}
{
  const partial = [...allOf('k1', 'individual'), chk('k5', 0)];
  const r = P.canHire(IND, partial, 'sub-1');
  ok(!r.ok, 'nedokončené K5 je dôvod na upozornenie');
  ok(!r.blocking, 'ale nie tvrdá prekážka — rozhodnutie je na človeku');
  ok(/Pred nástupom/.test(r.reasons.join(' ')), 'dôvod pomenuje krok');
}
{
  const all = ['k1', 'k2', 'k3', 'k4', 'k5'].flatMap(k => allOf(k, 'individual'));
  const r = P.canHire(IND, [...all, chk('flags', 0)], 'sub-1');
  ok(r.ok, 'vlajka sama o sebe nastúpenie nezakazuje');
  eq(r.flagCount, 1, 'ale hlási sa, aby ju bolo vidieť pri rozhodovaní');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo\n`);
process.exit(failed ? 1 : 0);
