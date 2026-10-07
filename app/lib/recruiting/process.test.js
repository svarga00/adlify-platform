// ============================================================================
// Testy: jeden nábor — päť krokov od ozvania po stavbu
// Spustenie:  node app/lib/recruiting/process.test.js
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

/** Zaškrtne celý krok pre daný typ kandidáta — len to, čo sa dá zaškrtnúť. */
function allOf(stepKey, type) {
  const step = P.STEPS.find(s => s.key === stepKey);
  return P.applicableItems(step, type)
    .filter(i => P.itemManual(step, i.index))
    .map(i => chk(stepKey, i.index));
}

/** Kandidát, ktorý prešiel všetkým — aj odvodenými vecami. */
const HOTOVY = {
  type: 'individual', first_contact_at: '2026-10-01T09:00:00Z',
  screening_score: 80, status: 'placed',
};
const VSETKO = ['proof', 'deal', 'papers', 'site'].flatMap(k => allOf(k, 'individual'));

console.log('\nJEDEN REŤAZEC');
{
  eq(P.STEPS.map(s => s.key), ['call', 'proof', 'deal', 'papers', 'site'],
    'päť krokov v poradí, v akom sa robia');
  eq(P.STEPS.map(s => s.n), [1, 2, 3, 4, 5], 'a sú očíslované');
  eq(P.STEPS.map(s => s.title),
    ['Zavolať', 'Preveriť', 'Dohodnúť', 'Papiere', 'Na stavbu'],
    'každý krok je jedno slovo, ktoré hovorí, čo sa robí');

  // Toto je celý zmysel zjednodušenia: človek, ktorý nábor nikdy nerobil,
  // musí z obrazovky vedieť, **prečo** krok existuje. Bez vety „prečo" je
  // z toho len ďalší zoznam na odklikanie.
  ok(P.STEPS.every(s => s.lead && s.why), 'každý krok povie, čo to je aj prečo to je');
  ok(P.STEPS.every(s => s.items.length <= 5), 'a žiadny nemá viac než päť odrážok');

  const spolu = P.candidateProgress(IND, []).total;
  eq(spolu, 17, 'jednotlivec má sedemnásť odrážok (predtým ich bolo 42)');
  eq(P.candidateProgress(CREW, []).total, 18, 'partia jednu navyše');
  eq(P.FLAGS.items.length, 5, 'päť červených vlajok');
  eq(P.AFTER.items.length, 3, 'a tri telefonáty v prvom týždni');
}

console.log('\nSLOVO „OVERENIE" JE PREČ');
{
  // Predtým sa „overenie" volal krok K3 **aj** časť telefonátu. Kto sa učil
  // nábor, nevedel, o ktorom sa práve hovorí. Krok sa volá „Preveriť".
  const titulky = P.STEPS.map(s => s.title).join(' ');
  ok(!/overen/i.test(titulky), 'žiadny krok sa nevolá „overenie"');
  const krok = P.STEPS.find(s => s.key === 'proof');
  eq(krok.title, 'Preveriť', 'druhý krok je „Preveriť"');
  ok(/overenie/.test(krok.why), 'a sám povie, že toto bolo predtým „overenie"');
}

console.log('\nODVODENÉ ODRÁŽKY SA NEZAŠKRTÁVAJÚ RUČNE');
{
  const call = P.STEPS.find(s => s.key === 'call');
  ok(!P.itemManual(call, 0), 'že sa zavolalo, sa nekliká — vyplýva to z hovoru');
  ok(!P.itemDone(call, 0, IND, []), 'bez hovoru nie je hotové');
  ok(P.itemDone(call, 0, { first_contact_at: '2026-10-01T09:00:00Z' }, []),
    'po prvom hovore je hotové samo');
  ok(P.itemDone(call, 1, { screening_score: 62 }, []),
    'a zápis z hovoru tiež');

  const site = P.STEPS.find(s => s.key === 'site');
  ok(!P.itemManual(site, 0), 'nasadenie sa tiež nekliká');
  ok(P.itemDone(site, 0, { status: 'placed' }, []), 'nasadený človek ho má hotové');
  ok(P.itemDone(site, 0, { subcontract_id: 'sc1' }, []), 'aj ten, kto má zákazku');
  ok(P.itemManual(site, 1), 'ale infolist áno — ten treba naozaj poslať');
}

console.log('\nSTARÉ ZAŠKRTNUTIA PLATIA ĎALEJ');
{
  // Kroky sa preskládali, ale v databáze sú zaškrtnutia zo starých K1–K6.
  // Keby prestali platiť, každému, kto už nábor rozrobil, by appka ukázala
  // nulu — a to je horšie než neprehľadný zoznam.
  const proof = P.STEPS.find(s => s.key === 'proof');
  ok(P.itemDone(proof, 0, IND, [chk('k3', 0)]), 'fotky zo starého K3 platia');
  ok(P.itemDone(proof, 1, IND, [chk('k3', 1)]), 'referencia tiež');
  const papers = P.STEPS.find(s => s.key === 'papers');
  ok(P.itemDone(papers, 2, IND, [chk('k5', 1)]), 'A1 zo starého K5 platí');
  const deal = P.STEPS.find(s => s.key === 'deal');
  ok(P.itemDone(deal, 2, IND, [chk('k4', 6)]), 'písomné potvrdenie zo K4 platí');
  const call = P.STEPS.find(s => s.key === 'call');
  ok(P.itemDone(call, 0, IND, [chk('k1', 3)]), 'hocijaká odpoveď z K1 znamená, že sa volalo');

  // Pozor na opačnú chybu: zaškrtnutie, ktoré s odrážkou nesúvisí, platiť nesmie.
  ok(!P.itemDone(proof, 0, IND, [chk('k5', 0)]), 'cudzie zaškrtnutie krok nesplní');
  ok(!P.itemDone(papers, 3, IND, [chk('k3', 0)]), 'ani naopak');

  // Stav sa po preskládaní nevynuloval: starý postup sa počíta.
  const stary = [chk('k3', 0), chk('k3', 1), chk('k3', 2), chk('k3', 4)];
  eq(P.candidateProgress(IND, stary).steps[1].complete, true,
    'celý starý K3 znamená hotové „Preveriť"');
}

console.log('\nODRÁŽKY PRE PARTIU');
{
  const proof = P.STEPS.find(s => s.key === 'proof');
  eq(P.applicableItems(proof, 'individual').length, 4, 'jednotlivec má štyri');
  eq(P.applicableItems(proof, 'crew').length, 5, 'partia päť');
  eq(P.applicableItems(proof, 'crew').map(i => i.index).slice(-1), [4],
    'otázka o partii je posledná');
  ok(!P.applicableItems(proof, 'individual').some(i => i.index === 4),
    'jednotlivcovi sa nezobrazí');
  eq(P.stepProgress(proof, allOf('proof', 'individual'), 'crew', CREW).complete, false,
    'partii nestačí to, čo stačí jednotlivcovi');
  eq(P.stepProgress(proof, allOf('proof', 'individual'), 'individual', IND).complete, true,
    'jednotlivcovi tie isté odpovede stačia');
}

console.log('\nPOSTUP');
{
  const empty = P.candidateProgress(IND, []);
  eq(empty.percent, 0, 'bez ničoho je postup nula');
  eq(empty.currentStep.key, 'call', 'a stojí sa na prvom kroku');
  ok(!empty.complete, 'nie je hotový');
}
{
  const p = P.candidateProgress({ ...IND, first_contact_at: '2026-10-01T09:00:00Z', screening_score: 70 }, []);
  eq(p.steps[0].complete, true, 'po hovore je prvý krok hotový bez jediného kliknutia');
  eq(p.currentStep.key, 'proof', 'a stojí sa na preverovaní');
}
{
  const checks = [chk('proof', 0), chk('proof', 1)];
  const p = P.candidateProgress(IND, checks);
  eq(p.currentStep.key, 'call', 'rozrobený neskorší krok neposunie ten prvý');
  eq(p.steps[1].done, 2, 'ale vie, koľko z neho je hotové');
}
{
  const p = P.candidateProgress(HOTOVY, VSETKO);
  eq(p.percent, 100, 'všetko hotové = sto percent');
  ok(p.complete, 'reťazec je hotový');
  eq(p.currentStep, null, 'nie je ďalší krok');
}
{
  const checks = allOf('proof', 'individual');
  checks[2].checked = false;
  const p = P.candidateProgress(IND, checks);
  eq(p.steps[1].done, 3, 'odškrtnutá odrážka sa odráta');
  ok(!p.steps[1].complete, 'krok už nie je hotový');
}

console.log('\nČO SPRAVIŤ TERAZ');
{
  // Jedna vec, nie zoznam. Toto je to, čo človek na obrazovke prečíta prvé.
  const n = P.candidateProgress(IND, []).next;
  eq(n.key, 'call', 'prázdny kandidát má zavolať');
  ok(n.hot, 'a horí to — ozval sa aj niekde inde');
  ok(n.what && n.why, 'povie, čo spraviť, aj prečo');
}
{
  const n = P.candidateProgress({ ...IND, first_contact_at: 'x', screening_score: 50 }, []).next;
  eq(n.key, 'proof', 'po hovore sa preveruje');
  ok(!n.hot, 'a to už nehorí na minúty');
}
{
  const n = P.candidateProgress(IND, [chk('flags', 0), chk('flags', 2)]).next;
  eq(n.key, 'flags', 'dve červené vlajky majú prednosť pred postupom');
  ok(n.hot, 'a horia');
  ok(/vlajky/.test(n.what), 'a je povedané, prečo');
}
{
  const n = P.candidateProgress(IND, [chk('flags', 0)]).next;
  eq(n.key, 'call', 'jedna vlajka postup nezastaví');
}
{
  const n = P.candidateProgress({ ...IND, outcome: 'rejected' }, []).next;
  eq(n.key, 'closed', 'zamietnutý kandidát nemá čo riešiť');
}
{
  const n = P.candidateProgress(HOTOVY, VSETKO).next;
  eq(n.key, 'done', 'hotový reťazec');
  ok(/prvý týždeň/i.test(n.what), 'a ostáva prvý týždeň');
}
{
  // Všetko odškrtnuté, ale nikde nenasadený — to nie je hotové.
  const p = P.candidateProgress({ type: 'individual', first_contact_at: 'x', screening_score: 9 },
    VSETKO);
  ok(!p.complete, 'bez nasadenia reťazec hotový nie je');
  eq(p.next.key, 'site', 'a ďalší krok je nasadiť ho');
}

console.log('\nPRVÝ TÝŽDEŇ');
{
  const p = P.candidateProgress(IND, []);
  ok(!p.afterPlacement.show, 'pred nasadením sa prvý týždeň neukazuje');
  eq(p.total, 17, 'a do postupu náboru sa nepočíta');

  const nasadeny = P.candidateProgress({ ...IND, status: 'placed' }, [chk('first_week', 0)]);
  ok(nasadeny.afterPlacement.show, 'po nasadení sa ukáže');
  eq(nasadeny.afterPlacement.done, 1, 'a vie, koľko z neho je hotové');
  const stary = P.candidateProgress({ ...IND, status: 'placed' }, [chk('k6', 1), chk('k6', 2)]);
  eq(stary.afterPlacement.done, 2, 'staré zaškrtnutia z K6 platia tiež');
}

console.log('\nČERVENÉ VLAJKY');
{
  const checks = [...allOf('proof', 'individual'), chk('flags', 0), chk('flags', 4)];
  const p = P.candidateProgress(IND, checks);
  eq(p.flagCount, 2, 'dve vlajky');
  eq(p.flags.map(f => f.index), [0, 4], 'vie, ktoré to sú');
  eq(p.steps[1].done, 4, 'vlajky nezasahujú do postupu krokov');
  eq(p.total, 17, 'ani do celkového počtu odrážok');
}
{
  eq(P.candidateProgress(IND, []).flagCount, 0, 'bez vlajok je počet nula');
}

console.log('\nV KTOROM KROKU ČLOVEK STOJÍ');
{
  eq(P.stageOf(IND, []).title, 'Zavolať', 'nový kandidát');
  eq(P.stageOf({ ...IND, first_contact_at: 'x', screening_score: 1 }, []).title, 'Preveriť',
    'po hovore');
  eq(P.stageOf(HOTOVY, VSETKO).title, 'Na stavbe', 'hotový človek');
  eq(P.stageOf({ ...IND, outcome: 'rejected' }, []).title, 'Zamietnutý', 'zamietnutý');
  eq(P.stageOf(IND, []).percent, 0, 'odznak nesie aj postup');
}

console.log('\nOTVORENÝ KROK PO NAČÍTANÍ');
{
  eq(P.initialOpenStep(IND, []), 'call', 'prázdny kandidát otvorí prvý krok');
  eq(P.initialOpenStep({ ...IND, first_contact_at: 'x', screening_score: 1 }, []), 'proof',
    'inak prvý nedokončený');
  eq(P.initialOpenStep(HOTOVY, VSETKO), 'site', 'pri hotovom reťazci posledný krok');
}

console.log('\nOZNAČENIE ZA NASTÚPENÉHO');
{
  const papiere = allOf('papers', 'individual');
  const noOrder = P.canHire(IND, papiere, null);
  ok(!noOrder.ok, 'bez zákazky sa nedá nastúpiť');
  ok(noOrder.blocking, 'a je to tvrdá prekážka');
  ok(P.canHire(IND, papiere, 'sub-1').ok, 'so zákazkou a hotovými papiermi áno');
}
{
  const partial = [chk('papers', 0), chk('papers', 1)];
  const r = P.canHire(IND, partial, 'sub-1');
  ok(!r.ok, 'nedokončené papiere sú dôvod na upozornenie');
  ok(!r.blocking, 'ale nie tvrdá prekážka — rozhodnutie je na človeku');
  ok(/Papiere/.test(r.reasons.join(' ')), 'dôvod pomenuje krok');
}
{
  const r = P.canHire(IND, [...allOf('papers', 'individual'), chk('flags', 0)], 'sub-1');
  ok(r.ok, 'vlajka sama o sebe nastúpenie nezakazuje');
  eq(r.flagCount, 1, 'ale hlási sa, aby ju bolo vidieť pri rozhodovaní');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo\n`);
process.exit(failed ? 1 : 0);
