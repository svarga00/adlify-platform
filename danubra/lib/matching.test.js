// ============================================================================
// Testy: panel zhôd (§6.5)
// Spustenie:  node danubra/lib/matching.test.js
// ============================================================================
const { scoreAccommodation, matchAccommodations, isNearby } = require('./matching');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    expected: ${e}\n    actual:   ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

console.log('matching (§6.5)');

const inq = { target_city: 'Berlin', persons: 4, budget_per_bed: 20, requirements: ['van_parking', 'kitchen'] };

// ── Ideálna zhoda: 40 + 25 + 20 + 5 + 5 + 10 = 105 → orezané na 100 ─────────
{
  const acc = { city: 'Berlin', max_persons: 6, price_per_bed_night: 18, van_parking: true,
    amenities: ['kitchen', 'wifi'], verification_status: 'verified' };
  const r = scoreAccommodation(inq, acc);
  eq(r.score, 100, 'ideálna zhoda = 100 (orezané zo 105)');
}

// ── Bez bonusu za overenie: 40+25+20+5+5 = 95 ───────────────────────────────
{
  const acc = { city: 'Berlin', max_persons: 6, price_per_bed_night: 18, van_parking: true,
    amenities: ['kitchen'], verification_status: 'new' };
  eq(scoreAccommodation(inq, acc).score, 95, 'bez overenia = 95');
}

// ── Iné mesto: 0 + 25 + 20 + 5 + 5 = 55 ─────────────────────────────────────
{
  const acc = { city: 'Hamburg', max_persons: 6, price_per_bed_night: 18, van_parking: true, amenities: ['kitchen'] };
  const r = scoreAccommodation(inq, acc);
  eq(r.score, 55, 'iné mesto stráca 40 bodov');
  ok(r.reasons.some(x => !x.ok && x.text.includes('Hamburg')), 'dôvod uvádza iné mesto');
}

// ── Okolie do 50 km (podľa súradníc) = 25 bodov ─────────────────────────────
{
  const inqGeo = { ...inq, target_city: 'Berlin', lat: 52.52, lng: 13.405 };
  const acc = { city: 'Potsdam', lat: 52.39, lng: 13.06, max_persons: 6, price_per_bed_night: 18,
    van_parking: true, amenities: ['kitchen'] };
  const r = scoreAccommodation(inqGeo, acc);
  eq(r.score, 55 + 25, 'okolie do 50 km = 25 bodov');
  ok(r.reasons.some(x => x.ok && x.text.includes('okolie')), 'dôvod uvádza okolie');
}

// ── Okolie podľa PSČ (bez súradníc) ─────────────────────────────────────────
{
  ok(isNearby({ postal_code: '10115' }, { postal_code: '10247' }), 'rovnaká oblasť PSČ = okolie');
  ok(!isNearby({ postal_code: '10115' }, { postal_code: '80331' }), 'iná oblasť PSČ ≠ okolie');
}

// ── Kapacita: presne dosť / 70 % / málo ─────────────────────────────────────
{
  const base = { city: 'Berlin', price_per_bed_night: 18, van_parking: true, amenities: ['kitchen'] };
  eq(scoreAccommodation(inq, { ...base, max_persons: 4 }).score, 95 - 0, 'kapacita presne = plných 25');
  eq(scoreAccommodation(inq, { ...base, max_persons: 3 }).score, 80, 'kapacita 3 zo 4 (75 %) = 10 bodov');
  eq(scoreAccommodation(inq, { ...base, max_persons: 2 }).score, 70, 'kapacita 2 zo 4 (50 %) = 0 bodov');
}

// ── Cena: v rozpočte / mierne nad / výrazne nad ─────────────────────────────
{
  const base = { city: 'Berlin', max_persons: 6, van_parking: true, amenities: ['kitchen'] };
  eq(scoreAccommodation(inq, { ...base, price_per_bed_night: 20 }).score, 95, 'cena = rozpočet → plných 20');
  eq(scoreAccommodation(inq, { ...base, price_per_bed_night: 21 }).score, 85, 'cena 21 pri rozpočte 20 (105 %) = 10');
  const over = scoreAccommodation(inq, { ...base, price_per_bed_night: 25 });
  eq(over.score, 75, 'cena 25 pri rozpočte 20 (125 %) = 0');
  ok(over.reasons.some(x => !x.ok && x.text.includes('5')), 'dôvod uvádza o koľko je nad rozpočet');
}

// ── Nesplnené požiadavky ────────────────────────────────────────────────────
{
  const acc = { city: 'Berlin', max_persons: 6, price_per_bed_night: 18, van_parking: false, amenities: [] };
  const r = scoreAccommodation(inq, acc);
  eq(r.score, 85, 'bez parkovania a kuchyne = −10');
  ok(r.reasons.some(x => !x.ok && x.text === 'parkovanie'), 'chýbajúce parkovanie je v dôvodoch');
  ok(r.reasons.some(x => !x.ok && x.text === 'kuchyňa'), 'chýbajúca kuchyňa je v dôvodoch');
}

// ── Diakritika a veľkosť písmen v názve mesta ───────────────────────────────
{
  const i = { target_city: 'MÜNCHEN', persons: 2 };
  const a = { city: 'münchen', max_persons: 4 };
  ok(scoreAccommodation(i, a).reasons.some(x => x.ok && x.text === 'mesto'), 'mesto sa páruje bez ohľadu na diakritiku/veľkosť');
}

// ── Zoradenie a vyradenie nespolupracujúcich ────────────────────────────────
{
  const list = [
    { id: 'a', city: 'Hamburg', max_persons: 6, price_per_bed_night: 18 },
    { id: 'b', city: 'Berlin', max_persons: 6, price_per_bed_night: 18, verification_status: 'verified' },
    { id: 'c', city: 'Berlin', max_persons: 6, price_per_bed_night: 18, verification_status: 'not_cooperating' },
  ];
  const res = matchAccommodations(inq, list);
  eq(res.map(r => r.accommodation.id), ['b', 'a'], 'zoradené zostupne, nespolupracujúci vyradený');
  ok(res[0].score > res[1].score, 'prvý má vyššie skóre');
}

// ── Limit počtu výsledkov ───────────────────────────────────────────────────
{
  const many = Array.from({ length: 25 }, (_, i) => ({ id: 'x' + i, city: 'Berlin', max_persons: 6 }));
  eq(matchAccommodations(inq, many).length, 10, 'predvolený limit je 10');
  eq(matchAccommodations(inq, many, 3).length, 3, 'vlastný limit funguje');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
