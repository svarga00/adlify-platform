// ============================================================================
// DANUBRA — Číselné rady (§6.1)
// ============================================================================
//   OBJ-{rok}-{4 číslice}  pre objednávky  → OBJ-2026-0042
//   {rok}{3 číslice}       pre faktúry      → 2026001
//   Reset pri zmene roka. Nikdy diera ani duplicita.
//
// DB transakčnú časť (select ... for update nad settings) rieši data vrstva.
// Tu je čistá logika inkrementu + formátovania (testovateľná bez DB).
// ============================================================================

/** Formát čísla objednávky. */
function formatOrderNumber(year, seq) {
  return `OBJ-${year}-${String(seq).padStart(4, '0')}`;
}

/** Formát čísla faktúry. */
function formatInvoiceNumber(year, seq) {
  return `${year}${String(seq).padStart(3, '0')}`;
}

/**
 * Vypočíta ďalšiu hodnotu série. Čistá funkcia — vstup je uložený stav série
 * a aktuálny rok, výstup je nový stav + poradové číslo.
 *
 * @param {Object} series      - { year:number, current:number }
 * @param {number} currentYear
 * @returns {{ year:number, current:number, seq:number }}
 *   seq = poradové číslo ktoré sa má použiť (1-based)
 *   {year,current} = nový stav série na uloženie späť
 */
function nextInSeries(series, currentYear) {
  const storedYear = Number(series?.year) || currentYear;
  const storedCurrent = Number(series?.current) || 0;
  // Reset pri zmene roka
  if (storedYear !== currentYear) {
    return { year: currentYear, current: 1, seq: 1 };
  }
  const seq = storedCurrent + 1;
  return { year: currentYear, current: seq, seq };
}

/** Kompletný krok pre objednávku: vráti { number, newSeries }. */
function nextOrderNumber(series, currentYear) {
  const { year, current, seq } = nextInSeries(series, currentYear);
  return {
    number: formatOrderNumber(year, seq),
    newSeries: { ...(series || {}), year, current },
  };
}

/** Kompletný krok pre faktúru: vráti { number, newSeries }. */
function nextInvoiceNumber(series, currentYear) {
  const { year, current, seq } = nextInSeries(series, currentYear);
  return {
    number: formatInvoiceNumber(year, seq),
    newSeries: { ...(series || {}), year, current },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatOrderNumber, formatInvoiceNumber, nextInSeries,
    nextOrderNumber, nextInvoiceNumber,
  };
}
if (typeof window !== 'undefined') {
  window.DanubraNumbering = { nextOrderNumber, nextInvoiceNumber, formatOrderNumber, formatInvoiceNumber };
}
