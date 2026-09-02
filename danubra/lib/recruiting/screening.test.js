// ============================================================================
// Testy: náborový plán — marža, minimálna mzda, kroky, inzerát
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
