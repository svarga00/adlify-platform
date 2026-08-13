// ============================================================================
// Testy: scenár živého náborového hovoru
// Spustenie:  node danubra/lib/recruiting/call-script.test.js
// ============================================================================
global.window = global;
const C = require('./call-script');
const S = require('./screening');
const P = require('./process');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    expected: ${e}\n    actual:   ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

const QUESTIONS = [
  { id: 'sdk1', trade_key: 'trockenbau', phase: 'phone', kind: 'hidden', weight: 3, sort_order: 1, question_sk: 'Rozteč profilov?' },
  { id: 'sdk2', trade_key: 'trockenbau', phase: 'phone', kind: 'knowledge', weight: 2, sort_order: 2, question_sk: 'Doska do kúpeľne?' },
  { id: 'sdk3', trade_key: 'trockenbau', phase: 'interview', kind: 'knowledge', weight: 1, sort_order: 3, question_sk: 'Q2 a Q3?' },
  { id: 'mal1', trade_key: 'maliar', phase: 'phone', kind: 'hidden', weight: 3, sort_order: 1, question_sk: 'Koľko vrstiev?' },
  { id: 'u_pol', trade_key: null, phase: 'phone', kind: 'hidden', weight: 3, sort_order: 10, question_sk: 'Kto bol polier?' },
  { id: 'u_a1', trade_key: null, phase: 'phone', kind: 'legal', weight: 3, sort_order: 2, question_sk: 'Máte A1?' },
  { id: 'u_ziv', trade_key: null, phase: 'phone', kind: 'legal', weight: 3, sort_order: 1, question_sk: 'Máte živnosť?' },
  { id: 'u_nas', trade_key: null, phase: 'phone', kind: 'logistics', weight: 2, sort_order: 20, question_sk: 'Kedy nastúpite?' },
  { id: 'u_zal', trade_key: null, phase: 'phone', kind: 'motivation', weight: 2, sort_order: 31, question_sk: 'Chcete zálohu?' },
  { id: 'u_int', trade_key: null, phase: 'interview', kind: 'motivation', weight: 1, sort_order: 32, question_sk: 'Ako doma?' },
];
const INTRO = P.applicableItems(P.STEPS[0], 'individual');

function build(tradeKey = 'trockenbau') {
  return C.buildCallScript({ tradeKey, questions: QUESTIONS, processItems: INTRO });
}

console.log('\nPORADIE SCENÁRA');
{
  const s = build();
  const segs = [...new Set(s.map(x => x.segment))];
  eq(segs, ['intro', 'trade', 'verify', 'legal', 'logistics', 'money'],
    'hovor ide úvod → remeslo → overenie → papiere → logistika → peniaze');
}
{
  const s = build();
  const iTrade = s.findIndex(x => x.segment === 'trade');
  const iLegal = s.findIndex(x => x.segment === 'legal');
  ok(iTrade < iLegal, 'odbornosť sa pýta skôr než papiere');
}
{
  const s = build();
  eq(s.filter(x => x.type === 'process').length, 6, 'úvod má šesť položiek z K1');
  eq(s[0].text, INTRO[0].text, 'začína prvou otázkou z K1');
}

console.log('\nOTÁZKY PODĽA REMESLA');
{
  const s = build('trockenbau');
  const trade = s.filter(x => x.segment === 'trade').map(x => x.question.id);
  eq(trade, ['sdk1', 'sdk2'], 'zoberie len otázky na sadrokartón');
  ok(!trade.includes('mal1'), 'otázky na maliara sa nepýtajú');
  ok(!trade.includes('sdk3'), 'otázky mimo telefonátu sa nepýtajú');
}
{
  const s = build('maliar');
  eq(s.filter(x => x.segment === 'trade').map(x => x.question.id), ['mal1'],
    'pri inom remesle sa scenár zmení');
}
{
  const s = build('neexistuje');
  eq(s.filter(x => x.segment === 'trade').length, 0, 'neznáme remeslo nespadne');
  ok(s.filter(x => x.segment === 'legal').length > 0, 'univerzálne otázky ostanú');
}
{
  const s = build();
  eq(s.filter(x => x.segment === 'legal').map(x => x.question.id), ['u_ziv', 'u_a1'],
    'v segmente sa radí podľa poradia');
}
{
  // otázka s neznámym typom sa nesmie stratiť
  const qs = [...QUESTIONS, { id: 'divna', trade_key: null, phase: 'phone', kind: 'ine', question_sk: '?' }];
  const s = C.buildCallScript({ tradeKey: 'trockenbau', questions: qs, processItems: [] });
  ok(s.some(x => x.question?.id === 'divna'), 'otázka mimo známych typov sa doplní na koniec');
}
{
  const s = C.buildCallScript({ tradeKey: 'trockenbau', questions: QUESTIONS, processItems: [] });
  eq(s.filter(x => x.type === 'process').length, 0, 'bez úvodných položiek scenár funguje');
}

console.log('\nSEGMENTY');
{
  const sum = C.segmentSummary(build());
  eq(sum.map(s => s.key), ['intro', 'trade', 'verify', 'legal', 'logistics', 'money'], 'zhrnutie má všetky segmenty');
  eq(sum.find(s => s.key === 'trade').count, 2, 'a počty otázok');
  eq(C.segmentTitle('legal'), 'Papiere', 'názov segmentu po slovensky');
  eq(C.segmentTitle('nieco'), 'nieco', 'neznámy segment vráti kľúč');
}
{
  const empty = C.segmentSummary([]);
  eq(empty.length, 0, 'prázdny scenár nemá segmenty');
}

console.log('\nVÝSLEDOK HOVORU');
const outcome = (answers) => C.callOutcome({ script: build(), answers, scoreFn: S.scoreScreening });
{
  const a = new Map();
  for (const id of ['sdk1', 'sdk2', 'u_pol', 'u_a1', 'u_ziv', 'u_nas', 'u_zal']) a.set(id, { value: 3 });
  for (const it of INTRO) a.set(`p${it.index}`, { value: true });
  const r = outcome(a);
  eq(r.verdict, 'strong', 'samé presné odpovede → sedí');
  eq(r.nextAction.key, 'advance', 'ďalší krok je overenie');
  eq(r.introDone, 6, 'úvod je zodpovedaný');
}
{
  const a = new Map([['u_a1', { value: 0 }], ['sdk1', { value: 3 }], ['sdk2', { value: 3 }],
    ['u_ziv', { value: 3 }], ['u_pol', { value: 3 }], ['u_nas', { value: 3 }], ['u_zal', { value: 3 }]]);
  const r = outcome(a);
  eq(r.verdict, 'reject', 'chýbajúce A1 zamieta');
  eq(r.nextAction.key, 'reject', 'a ďalší krok je zamietnutie');
  ok(/pol roka/.test(r.nextAction.hint), 'rada hovorí, čo s dôvodom');
}
{
  const r = outcome(new Map([['sdk1', { value: 3 }]]));
  eq(r.verdict, 'unknown', 'jedna odpoveď na rozhodnutie nestačí');
  eq(r.nextAction.key, 'continue', 'ponúkne dokončiť neskôr');
}
{
  const a = new Map();
  for (const id of ['sdk1', 'sdk2', 'u_pol', 'u_a1', 'u_ziv', 'u_nas', 'u_zal']) a.set(id, { value: 2 });
  const r = outcome(a);
  eq(r.verdict, 'ok', 'priemerné odpovede sú použiteľné');
  ok(/over/.test(r.nextAction.hint), 'rada pripomína overenie');
}
{
  const r = outcome(new Map());
  eq(r.answered, 0, 'bez odpovedí nič nezapočíta');
  eq(r.introDone, 0, 'ani úvod');
  eq(r.verdict, 'unknown', 'a nerozhoduje');
}
{
  // označená varovná odpoveď sa dostane do výsledku, aj keď nie je hodnotenie
  const a = new Map([['u_zal', { value: null, flagged: true }], ['sdk1', { value: 3 }]]);
  const r = outcome(a);
  eq(r.redFlags.length, 1, 'varovanie sa započíta aj bez hodnotenia');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo\n`);
process.exit(failed ? 1 : 0);
