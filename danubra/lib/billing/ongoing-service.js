// ============================================================================
// DANUBRA — Výpočet priebežnej služby (§6.4)
// ============================================================================
// Čistá funkcia — všetky vstupy sa injektujú (order, segments, obdobie, today),
// žiadny DB prístup tu. Vrstva ktorá načíta segmenty je oddelená (data.js).
//
// Kritické pravidlá (§5):
//   - služba sa počíta LEN z nepozastavených segmentov (paused = true → skip)
//   - fakturuje sa prienik segmentu s obdobím, orezaný o order.date_from/date_to
//     a o dnešný deň (nikdy nefakturuj budúcnosť)
//   - dni sa rátajú VRÁTANE oboch krajných dní (differenceInDays + 1)
//   - všetko numeric, zaokrúhľovanie AŽ pri výstupe (§5.6)
//
// Dátumy sú 'YYYY-MM-DD' reťazce. Interne UTC → žiadne DST posuny.
// ============================================================================

/** Parse 'YYYY-MM-DD' na UTC timestamp (polnoc). */
function parseDay(s) {
  if (!s) return null;
  if (s instanceof Date) {
    return Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
  }
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Počet celých dní medzi dvoma dňami (b - a). */
function diffDays(aMs, bMs) {
  return Math.round((bMs - aMs) / 86400000);
}

/** Formát UTC timestamp späť na 'YYYY-MM-DD'. */
function fmtDay(ms) {
  const d = new Date(ms);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

const MAX_MS = Number.POSITIVE_INFINITY;

/**
 * Vypočíta priebežnú službu za obdobie.
 *
 * @param {Object} order           - { date_from, date_to }
 * @param {Array}  segments        - order_service_periods:
 *                                    { period_from, period_to|null, persons, rate, paused }
 * @param {string} periodFrom      - 'YYYY-MM-DD' začiatok fakturačného obdobia
 * @param {string} periodTo        - 'YYYY-MM-DD' koniec fakturačného obdobia
 * @param {string} [today]         - 'YYYY-MM-DD' dnešok (default: nefiltruje budúcnosť
 *                                    ak nie je zadaný — pre deterministické testy zadaj)
 * @returns {{ total:number, breakdown:Array }}
 */
function calculateOngoingService(order, segments, periodFrom, periodTo, today) {
  const orderFrom = parseDay(order.date_from);
  const orderTo = parseDay(order.date_to);
  const pFrom = parseDay(periodFrom);
  const pTo = parseDay(periodTo);
  const todayMs = today ? parseDay(today) : MAX_MS;

  const breakdown = [];
  let total = 0;

  for (const seg of segments || []) {
    if (seg.paused) continue;

    const segFrom = parseDay(seg.period_from);
    const segTo = seg.period_to != null ? parseDay(seg.period_to) : MAX_MS;

    // effFrom = max(segFrom, periodFrom, orderFrom)
    const effFrom = Math.max(segFrom, pFrom, orderFrom);
    // effTo = min(segTo, periodTo, orderTo, today)
    const effTo = Math.min(segTo, pTo, orderTo, todayMs);

    if (effTo < effFrom) continue;

    const days = diffDays(effFrom, effTo) + 1; // vrátane oboch dní
    if (days <= 0) continue;

    const persons = Number(seg.persons) || 0;
    const rate = Number(seg.rate) || 0;
    const amount = days * persons * rate;
    if (amount === 0 && days === 0) continue;

    total += amount;
    breakdown.push({
      from: fmtDay(effFrom),
      to: fmtDay(effTo),
      days,
      persons,
      rate,
      amount: round2(amount),
    });
  }

  return { total: round2(total), breakdown };
}

/** Zaokrúhli na 2 desatinné miesta (až pri výstupe, §5.6). */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Fakturačné obdobie pre mesačný cron (§6.4):
 * 1. deň mesiaca → min(posledný deň mesiaca, order.date_to).
 * @param {number} year
 * @param {number} month  - 1-12
 * @param {Object} order  - { date_to }
 */
function monthlyBillingPeriod(year, month, order) {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate(); // posledný deň mesiaca
  const monthEnd = parseDay(`${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);
  const orderTo = parseDay(order.date_to);
  const to = Math.min(monthEnd, orderTo);
  return { periodFrom: first, periodTo: fmtDay(to) };
}

// UMD-ish export: node aj browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculateOngoingService, monthlyBillingPeriod, round2, parseDay, diffDays, fmtDay };
}
if (typeof window !== 'undefined') {
  window.DanubraBilling = { calculateOngoingService, monthlyBillingPeriod, round2 };
}
