// ============================================================================
// Testy: vyhodnotenie skríningu a náborového plánu
// Spustenie:  node danubra/lib/recruiting/screening.test.js
// ============================================================================
global.window = global;
const S = require('./screening');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    expected: ${e}\n    actual:   ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

const Q = {
  know: { id: 'q1', kind: 'knowledge', weight: 1, question_sk: 'Q2 a Q3?' },
  hidden: { id: 'q2', kind: 'hidden', weight: 3, question_sk: 'Rozteč profilov?' },
  legal: { id: 'q3', kind: 'legal', weight: 3, question_sk: 'A1?' },
  log: { id: 'q4', kind: 'logistics', weight: 1, question_sk: 'Nástup?' },
  mot: { id: 'q5', kind: 'motivation', weight: 2, question_sk: 'Záloha?' },
};
const ALL = Object.values(Q);

console.log('\nSKÓRE SKRÍNINGU');
{
  const r = S.scoreScreening(ALL, []);
  eq(r.verdict, 'unknown', 'bez odpovedí sa nedá rozhodnúť');
  eq(r.percent, 0, 'skóre je nula, nie NaN');
}
{
  // všetko na tri → 100 %
  const answers = ALL.map(q => ({ question_id: q.id, rating: 3 }));
  const r = S.scoreScreening(ALL, answers);
  eq(r.percent, 100, 'samé presné odpovede = 100 %');
  eq(r.verdict, 'strong', 'verdikt strong');
  eq(r.redFlags.length, 0, 'žiadne varovania');
}
{
  // váha sa počíta: nula na váhu 3 stiahne viac než nula na váhu 1
  const a1 = [{ question_id: 'q1', rating: 0 }, { question_id: 'q4', rating: 3 }];
  const a2 = [{ question_id: 'q1', rating: 3 }, { question_id: 'q4', rating: 0 }];
  eq(S.scoreScreening([Q.know, Q.log], a1).percent, 50, 'rovnaké váhy dajú 50 %');
  eq(S.scoreScreening([Q.know, Q.log], a2).percent, 50, 'symetricky rovnako');
  const heavy = S.scoreScreening([Q.know, Q.hidden],
    [{ question_id: 'q1', rating: 3 }, { question_id: 'q2', rating: 0 }]);
  eq(heavy.percent, 25, 'nula na trojnásobnej váhe stiahne skóre na 25 %');
}
{
  // nezodpovedané otázky skóre neznižujú, len znižujú pokrytie
  const r = S.scoreScreening(ALL, [{ question_id: 'q1', rating: 3 }]);
  eq(r.percent, 100, 'jedna dobrá odpoveď = 100 % z toho, čo sa pýtalo');
  eq(r.coverage, 20, 'pokrytie je 20 %');
  eq(r.verdict, 'unknown', 'pri nízkom pokrytí sa nerozhoduje');
}

console.log('\nVAROVANIA');
{
  const r = S.scoreScreening(ALL, [
    { question_id: 'q2', rating: 0 },                      // kritická overovacia
    { question_id: 'q1', rating: 3 }, { question_id: 'q4', rating: 3 },
    { question_id: 'q5', rating: 3 },
  ]);
  eq(r.redFlags.length, 1, 'nula na kritickej otázke je varovanie');
  eq(r.verdict, 'weak', 'jedno varovanie = weak, nie reject');
}
{
  const r = S.scoreScreening(ALL, [
    { question_id: 'q3', rating: 0 },                      // chýba A1
    { question_id: 'q1', rating: 3 }, { question_id: 'q4', rating: 3 },
  ]);
  eq(r.verdict, 'reject', 'právne varovanie je tvrdé zamietnutie');
  ok(/predpoklad/.test(r.reason), 'dôvod hovorí o právnom predpoklade');
}
{
  // vysoké skóre nezachráni právny problém
  const r = S.scoreScreening(ALL, [
    { question_id: 'q1', rating: 3 }, { question_id: 'q2', rating: 3 },
    { question_id: 'q4', rating: 3 }, { question_id: 'q5', rating: 3 },
    { question_id: 'q3', rating: 0 },
  ]);
  eq(r.percent, 70, 'skóre je slušných 70 %');
  eq(r.verdict, 'reject', 'a napriek tomu zamietnutý');
}
{
  const r = S.scoreScreening(ALL, [
    { question_id: 'q1', rating: 2, flagged: true },
    { question_id: 'q4', rating: 2, flagged: true },
    { question_id: 'q5', rating: 2 },
  ]);
  eq(r.redFlags.length, 2, 'ručne označené varovania sa počítajú');
  eq(r.verdict, 'reject', 'dve varovania = zamietnutie');
}
{
  const r = S.scoreScreening(ALL, ALL.map(q => ({ question_id: q.id, rating: 2 })));
  eq(r.verdict, 'ok', 'samé dvojky sú použiteľný kandidát');
  const w = S.scoreScreening(ALL, ALL.map(q => ({ question_id: q.id, rating: 1 })));
  eq(w.verdict, 'weak', 'samé jednotky sú slabé');
}
{
  const r = S.scoreScreening(ALL, ALL.map(q => ({ question_id: q.id, rating: 3 })));
  eq(r.byKind.hidden.percent, 100, 'rozpad podľa typu otázky funguje');
  eq(r.byKind.legal.max, 9, 'maximum za právne otázky je váha × 3');
}
{
  // odpoveď na otázku, ktorá v zozname nie je, sa ignoruje
  const r = S.scoreScreening([Q.know], [{ question_id: 'neexistuje', rating: 3 }]);
  eq(r.answered, 0, 'cudzia odpoveď sa nezapočíta');
}
{
  // varovanie označené bez hodnotenia sa nesmie stratiť
  const r = S.scoreScreening(ALL, [{ question_id: 'q1', flagged: true }]);
  eq(r.redFlags.length, 1, 'varovanie bez hodnotenia sa započíta');
  eq(r.answered, 0, 'ale ako zodpovedaná otázka sa neráta');
  eq(r.max, 0, 'a neskresľuje skóre');
}
{
  // hodnotenie mimo rozsahu sa oreže
  const r = S.scoreScreening([Q.know], [{ question_id: 'q1', rating: 9 }]);
  eq(r.percent, 100, 'rating nad 3 sa oreže na 3');
  const n = S.scoreScreening([Q.know], [{ question_id: 'q1', rating: -5 }]);
  eq(n.percent, 0, 'záporný rating sa oreže na 0');
}

console.log('\nMARŽA PLÁNU');
{
  const p = { legal_form: 'szco', offer_rate: 18, client_rate: 28, headcount: 3 };
  const m = S.planMargin(p);
  eq(m.costPerHour, 18, 'pri živnostníkovi je náklad priamo sadzba');
  eq(m.marginPerHour, 10, 'marža 10 €/h');
  eq(m.marginPct, 35.7, 'marža 35,7 %');
  eq(m.monthlyMargin, 5220, 'mesačne 10 € × 174 h × 3 ľudia');
  ok(m.healthy, 'zdravá marža');
}
{
  const p = { legal_form: 'employee', offer_rate: 18, client_rate: 28, headcount: 1 };
  const m = S.planMargin(p);
  eq(m.costPerHour, 24.3, 'pri zamestnancovi sa prirátajú odvody');
  ok(m.marginPerHour < 4, 'marža je podstatne nižšia');
}
{
  const p = { legal_form: 'szco', offer_rate: 20, client_rate: 26, headcount: 1 };
  const m = S.planMargin(p, { overheadPerHour: 3 });
  eq(m.costPerHour, 23, 'réžia na hodinu sa priráta');
  eq(m.marginPerHour, 3, 'zostane 3 €/h');
  ok(!m.healthy, 'pod 15 % nie je zdravé');
}
{
  const m = S.planMargin({ offer_rate: 0, client_rate: 0 });
  eq(m.marginPct, 0, 'prázdny plán nedelí nulou');
}

console.log('\nMINIMÁLNA MZDA');
{
  const r = S.checkOfferRate({ offer_rate: 15 }, { lohngruppe: 'LG2' });
  ok(!r.ok, '15 €/h je pod LG2');
  ok(/17.34/.test(r.message), 'v hláške je konkrétna hranica');
  ok(S.checkOfferRate({ offer_rate: 18 }, { lohngruppe: 'LG2' }).ok, '18 €/h prejde');
  ok(S.checkOfferRate({ offer_rate: 16 }, { lohngruppe: 'LG1' }).ok, '16 €/h prejde pre LG1');
  ok(!S.checkOfferRate({ offer_rate: 16 }, { lohngruppe: 'LG2' }).ok, 'ale nie pre LG2');
  ok(!S.checkOfferRate({}, {}).ok, 'chýbajúca sadzba neprejde');
}

console.log('\nKROKY PLÁNU');
{
  const empty = S.planProgress({});
  eq(empty.done, 0, 'prázdny plán nemá hotový krok');
  eq(empty.next.step, 1, 'ďalší krok je prvý');
  ok(!empty.ready, 'nedá sa spustiť');

  const full = S.planProgress({
    trade_key: 'trockenbau', headcount: 3, city: 'München', start_date: '2026-09-01',
    offer_rate: 18, client_rate: 28, screening_count: 12,
    channels: ['meta_ads'], ad_text: 'text',
  });
  eq(full.done, 5, 'vyplnený plán má všetkých päť krokov');
  eq(full.percent, 100, 'sto percent');
  ok(full.ready, 'dá sa spustiť');
  eq(full.next, null, 'nič ďalšie nechýba');

  const half = S.planProgress({ trade_key: 'maliar', headcount: 2, city: 'Berlin', start_date: '2026-09-01' });
  eq(half.next.step, 3, 'chýba krok so sadzbami');
}

console.log('\nINZERÁT');
{
  const t = { name_sk: 'Sadrokartonár', work_scope: ['montáž priečok', 'podhľady'], certificates: ['prax'] };
  const p = { city: 'München', country: 'DE', offer_rate: 18, legal_form: 'szco',
    start_date: '2026-09-01', headcount: 3, accommodation_provided: true };
  const txt = S.adText(p, t);
  ok(txt.startsWith('Sadrokartonár — München, Nemecko'), 'prvý riadok je remeslo a miesto');
  ok(txt.includes('18 €/h'), 'sadzba je v texte');
  ok(txt.includes('Ubytovanie'), 'ubytovanie je v texte');
  ok(!txt.includes('Dopravu zabezpečíme'), 'čo neponúkame, tam nie je');
  ok(txt.includes('montáž priečok'), 'popis práce z remesla');
  ok(txt.includes('Nástup: 01.09.2026'), 'dátum je v slovenskom tvare');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo\n`);
process.exit(failed ? 1 : 0);
