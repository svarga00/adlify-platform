// ============================================================================
// Testy: zaškrtávacie polia živého náboru
// Spustenie:  node danubra/lib/recruiting/chips.test.js
// ============================================================================
global.window = global;
const C = require('./chips');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    expected: ${e}\n    actual:   ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

const chip = (label, polarity, weight = 1, extra = {}) =>
  ({ id: label, label, polarity, weight, ...extra });

const CHIPS = [
  { id: 'a', trade_key: null, segment: 'intro', label: 'Má aktívnu živnosť', polarity: 'plus', weight: 3, use_count: 5 },
  { id: 'b', trade_key: null, segment: 'intro', label: 'Má vlastné auto', polarity: 'plus', weight: 2, use_count: 12 },
  { id: 'c', trade_key: null, segment: 'intro', label: 'Nemá živnosť', polarity: 'flag', weight: 3, use_count: 0 },
  { id: 'd', trade_key: 'trockenbau', segment: 'trade', label: 'Vie rozteč 625', polarity: 'plus', weight: 3, use_count: 8 },
  { id: 'e', trade_key: 'maliar', segment: 'trade', label: 'Robil Airlessom', polarity: 'plus', weight: 2, use_count: 4 },
  { id: 'f', trade_key: null, segment: 'money', label: 'Pýtal zálohu vopred', polarity: 'flag', weight: 3, use_count: 2 },
  { id: 'g', trade_key: null, segment: 'trade', label: 'Neaktívne pole', polarity: 'plus', weight: 1, active: false },
];

console.log('\nSKLADANIE OBRAZOVIEK');
{
  const segs = C.buildCallSegments({ tradeKey: 'trockenbau', chips: CHIPS });
  eq(segs.map(s => s.key), ['intro', 'trade', 'money'], 'prázdne segmenty sa vynechajú');
  eq(segs.find(s => s.key === 'trade').chips.map(c => c.id), ['d'],
    'v remesle sú len polia na to remeslo');
  ok(!segs.find(s => s.key === 'trade').chips.some(c => c.id === 'e'),
    'polia iného remesla sa nezobrazia');
  ok(!segs.some(s => s.chips.some(c => c.id === 'g')), 'neaktívne pole sa nezobrazí');
}
{
  const segs = C.buildCallSegments({ tradeKey: 'maliar', chips: CHIPS });
  eq(segs.find(s => s.key === 'trade').chips.map(c => c.id), ['e'], 'pri inom remesle iné polia');
}
{
  const segs = C.buildCallSegments({ tradeKey: 'neznáme', chips: CHIPS });
  ok(!segs.some(s => s.key === 'trade'), 'neznáme remeslo nemá segment remesla');
  ok(segs.some(s => s.key === 'legal') === false, 'a segment bez polí tam tiež nie je');
  ok(segs.some(s => s.key === 'intro'), 'univerzálne polia ostanú');
}
{
  eq(C.buildCallSegments({ tradeKey: 'x', chips: [] }), [], 'bez polí niet čo zobraziť');
}

console.log('\nPORADIE — UČENIE Z POUŽITIA');
{
  const intro = C.buildCallSegments({ tradeKey: 'trockenbau', chips: CHIPS })
    .find(s => s.key === 'intro').chips.map(c => c.id);
  eq(intro, ['b', 'a', 'c'], 'čo zaškrtávaš častejšie, je vyššie');
}
{
  // rovnaké použitie → rozhodne váha
  const same = [chip('ľahké', 'plus', 1, { use_count: 3, segment: 'intro' }),
                chip('ťažké', 'plus', 3, { use_count: 3, segment: 'intro' })];
  eq(C.orderChips(same).map(c => c.label), ['ťažké', 'ľahké'], 'pri zhode ide hore ťažšie pole');
}
{
  const noUse = [chip('bé', 'plus', 1, { segment: 'intro' }), chip('á', 'plus', 1, { segment: 'intro' })];
  eq(C.orderChips(noUse).map(c => c.label), ['á', 'bé'], 'bez použitia sa radí podľa abecedy');
}
{
  const orig = [chip('x', 'plus', 1, { use_count: 1 })];
  C.orderChips(orig);
  eq(orig.map(c => c.label), ['x'], 'radenie nemení pôvodné pole');
}

console.log('\nSKÓRE');
{
  const r = C.scoreChips([]);
  eq(r.verdict, 'unknown', 'bez zaškrtnutia sa nerozhoduje');
  eq(r.percent, null, 'a percento je prázdne, nie nula');
}
{
  const r = C.scoreChips([chip('a', 'plus', 3), chip('b', 'plus', 2),
    chip('c', 'plus', 2), chip('d', 'plus', 1)]);
  eq(r.percent, 100, 'samé plusy sú sto percent');
  eq(r.verdict, 'strong', 'a verdikt sedí');
  eq(r.plus, 8, 'plusy sa sčítajú podľa váhy');
}
{
  const r = C.scoreChips([chip('a', 'plus', 3), chip('b', 'plus', 3),
    chip('c', 'minus', 2), chip('d', 'neutral', 5)]);
  eq(r.percent, 75, 'pomer dobrých a zlých znamení');
  eq(r.verdict, 'strong', '75 % bez varovaní je dobré');
  eq(r.minus, 2, 'neutrálne pole do skóre nevstupuje');
}
{
  const r = C.scoreChips([chip('a', 'plus', 1), chip('b', 'minus', 1),
    chip('c', 'minus', 1), chip('d', 'plus', 1)]);
  eq(r.percent, 50, 'polovica na polovicu');
  eq(r.verdict, 'ok', '50 % je ešte použiteľný');
}
{
  const r = C.scoreChips([chip('a', 'plus', 1), chip('b', 'minus', 3),
    chip('c', 'minus', 2), chip('d', 'minus', 1)]);
  ok(r.percent < 50, 'prevaha mínusov stlačí skóre');
  eq(r.verdict, 'weak', 'a verdikt je slabý');
}
{
  const r = C.scoreChips([chip('a', 'plus', 3), chip('b', 'plus', 3), chip('c', 'plus', 3)]);
  eq(r.verdict, 'unknown', 'menej než štyri polia na rozhodnutie nestačia');
  eq(r.percent, 100, 'skóre sa aj tak spočíta');
}

console.log('\nVAROVANIA');
{
  const r = C.scoreChips([chip('a', 'plus', 3), chip('b', 'plus', 3), chip('c', 'plus', 2),
    chip('d', 'plus', 2), chip('Tvrdí, že A1 netreba', 'flag', 3)]);
  eq(r.verdict, 'reject', 'rozhodujúce varovanie zamieta aj pri samých plusoch');
  ok(/A1/.test(r.reason), 'dôvod pomenuje konkrétne varovanie');
  ok(r.percent > 60, 'a skóre je pritom stále slušné');
}
{
  const r = C.scoreChips([chip('a', 'plus', 3), chip('b', 'plus', 3), chip('c', 'plus', 3),
    chip('x', 'flag', 1), chip('y', 'flag', 1)]);
  eq(r.verdict, 'reject', 'dve slabšie varovania tiež zamietajú');
  eq(r.flags.length, 2, 'obe sa vrátia');
}
{
  const r = C.scoreChips([chip('a', 'plus', 3), chip('b', 'plus', 3), chip('c', 'plus', 2),
    chip('x', 'flag', 1)]);
  eq(r.verdict, 'weak', 'jedno slabšie varovanie znamená opatrnosť, nie zamietnutie');
  ok(/over/.test(r.reason), 'a rada je overiť');
}
{
  const r = C.scoreChips([chip('x', 'flag', 2), chip('a', 'plus', 1)]);
  ok(r.minus >= 2, 'varovanie sa započíta aj do mínusov');
}

console.log('\nODPORÚČANIE ĎALŠIEHO KROKU');
{
  eq(C.callOutcome([]).nextAction.key, 'continue', 'bez dát ponúkne dokončiť neskôr');
  eq(C.callOutcome([chip('a', 'plus', 3), chip('b', 'plus', 3),
    chip('c', 'plus', 2), chip('d', 'plus', 2)]).nextAction.key, 'advance', 'dobrý hovor → overenie');
  const rej = C.callOutcome([chip('a', 'plus', 1), chip('b', 'plus', 1),
    chip('c', 'plus', 1), chip('Nemá živnosť', 'flag', 3)]);
  eq(rej.nextAction.key, 'reject', 'rozhodujúce varovanie → zamietnuť');
  ok(/pol roka/.test(rej.nextAction.hint), 'rada hovorí, načo je dôvod');
}

console.log('\nZHRNUTIE DO ZÁPISU');
{
  const s = C.summarize([chip('Vie rozteč 625', 'plus', 3), chip('Airless nerobil', 'minus', 2),
    chip('Pýtal zálohu', 'flag', 3), chip('Je to partia', 'neutral', 1)]);
  eq(s.good, ['Vie rozteč 625'], 'dobré znamenia');
  eq(s.bad, ['Airless nerobil'], 'zlé znamenia');
  eq(s.flags, ['Pýtal zálohu'], 'varovania zvlášť');
  eq(s.notes, ['Je to partia'], 'neutrálne informácie zvlášť');
}
{
  eq(C.summarize([]), { good: [], bad: [], flags: [], notes: [] }, 'prázdny hovor dá prázdne zhrnutie');
}

console.log('\nNÁZVY SEGMENTOV');
{
  eq(C.segmentTitle('legal'), 'Papiere', 'po slovensky');
  eq(C.segmentTitle('xy'), 'xy', 'neznámy segment vráti kľúč');
  eq(C.SEGMENTS.map(s => s.key), ['intro', 'trade', 'verify', 'legal', 'logistics', 'money'],
    'poradie segmentov je poradie hovoru');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo\n`);
process.exit(failed ? 1 : 0);
