// ============================================================================
// DANUBRA — Panel zhôd: dopyt → ubytovania (§6.5)
// ============================================================================
// Skóre 0–100 + vysvetlenie prečo. Čistá funkcia, žiadny DB prístup.
//
// Body podľa zadania:
//   mesto presne ................. 40   (rovnaký región / do 50 km = 25)
//   kapacita >= počet osôb ....... 25   (menej, ale >= 70 % = 10)
//   cena <= rozpočet ............. 20   (do 110 % rozpočtu = 10)
//   splnená požiadavka ...........  5   (parkovanie, kuchyňa, faktúra…)
//   bonus verified ............... +10
// Výsledok je orezaný na 100.
// ============================================================================

const REQUIREMENT_MAP = {
  van_parking:      { label: 'parkovanie',   test: (a) => !!a.van_parking },
  parking:          { label: 'parkovanie',   test: (a) => !!a.van_parking },
  kitchen:          { label: 'kuchyňa',      test: (a) => (a.amenities || []).includes('kitchen') },
  washing_machine:  { label: 'práčka',       test: (a) => (a.amenities || []).includes('washing_machine') },
  wifi:             { label: 'wifi',         test: (a) => (a.amenities || []).includes('wifi') },
  private_bathroom: { label: 'vlastná kúpeľňa', test: (a) => (a.amenities || []).includes('private_bathroom') },
  bed_linen:        { label: 'bielizeň',     test: (a) => (a.amenities || []).includes('bed_linen') },
  tv:               { label: 'TV',           test: (a) => (a.amenities || []).includes('tv') },
  invoice:          { label: 'faktúra',      test: (a) => !!a.invoice_payment },
  invoice_payment:  { label: 'faktúra',      test: (a) => !!a.invoice_payment },
};

function norm(s) {
  return String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Vzdialenosť dvoch bodov v km (haversine). null ak chýbajú súradnice. */
function distanceKm(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Je ubytovanie „v okolí" dopytu? (do 50 km, alebo zhodná oblasť podľa PSČ) */
function isNearby(inquiry, acc) {
  const d = distanceKm(inquiry, acc);
  if (d != null) return d <= 50;
  const ip = String(inquiry.postal_code || '').replace(/\s/g, '');
  const ap = String(acc.postal_code || '').replace(/\s/g, '');
  if (ip && ap && ip.slice(0, 2) === ap.slice(0, 2)) return true;
  return false;
}

/**
 * Ohodnotí jedno ubytovanie voči dopytu.
 * @returns {{ score:number, reasons:Array<{ok:boolean,text:string}> }}
 */
function scoreAccommodation(inquiry, acc) {
  const reasons = [];
  let score = 0;

  // 1) Lokalita
  const wantCity = norm(inquiry.target_city);
  const haveCity = norm(acc.city);
  if (wantCity && haveCity && wantCity === haveCity) {
    score += 40; reasons.push({ ok: true, text: 'mesto' });
  } else if (wantCity && isNearby(inquiry, acc)) {
    score += 25; reasons.push({ ok: true, text: `okolie (${acc.city || '—'})` });
  } else {
    reasons.push({ ok: false, text: `iné mesto (${acc.city || '—'})` });
  }

  // 2) Kapacita
  const persons = Number(inquiry.persons) || 0;
  const cap = Number(acc.max_persons ?? acc.beds) || 0;
  if (persons > 0 && cap > 0) {
    if (cap >= persons) {
      score += 25; reasons.push({ ok: true, text: 'kapacita' });
    } else if (cap >= persons * 0.7) {
      score += 10; reasons.push({ ok: false, text: `kapacita len ${cap} z ${persons}` });
    } else {
      reasons.push({ ok: false, text: `málo miesta (${cap} z ${persons})` });
    }
  }

  // 3) Cena voči rozpočtu
  const budget = Number(inquiry.budget_per_bed);
  const price = Number(acc.price_per_bed_night);
  if (budget > 0 && price > 0) {
    if (price <= budget) {
      score += 20; reasons.push({ ok: true, text: 'v rozpočte' });
    } else if (price <= budget * 1.1) {
      score += 10;
      reasons.push({ ok: false, text: `mierne nad rozpočet (+${round2(price - budget)} €)` });
    } else {
      reasons.push({ ok: false, text: `nad rozpočet o ${round2(price - budget)} €` });
    }
  }

  // 4) Požiadavky
  for (const req of inquiry.requirements || []) {
    const def = REQUIREMENT_MAP[String(req).toLowerCase()];
    if (!def) continue;
    if (def.test(acc)) { score += 5; reasons.push({ ok: true, text: def.label }); }
    else { reasons.push({ ok: false, text: def.label }); }
  }

  // 5) Bonus za overené ubytovanie
  if (acc.verification_status === 'verified') {
    score += 10; reasons.push({ ok: true, text: 'overené' });
  }

  return { score: Math.min(100, score), reasons };
}

/**
 * Zoradí ubytovania podľa zhody s dopytom.
 * @returns Array<{accommodation, score, reasons}> zostupne, max `limit`
 */
function matchAccommodations(inquiry, accommodations, limit = 10) {
  return (accommodations || [])
    .filter(a => a.verification_status !== 'not_cooperating')
    .map(a => ({ accommodation: a, ...scoreAccommodation(inquiry, a) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { scoreAccommodation, matchAccommodations, distanceKm, isNearby, REQUIREMENT_MAP };
}
if (typeof window !== 'undefined') {
  window.DanubraMatching = { scoreAccommodation, matchAccommodations, REQUIREMENT_MAP };
}
