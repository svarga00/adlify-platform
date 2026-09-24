// ============================================================================
// DANUBRA — platobná disciplína odberateľa
// ============================================================================
// Odpovedá na otázku, ktorú treba položiť **skôr**, než sa vezme ďalšia
// zákazka: platí tento odberateľ načas, a koľko u neho práve visí?
//
// Pravidlá sú tie isté, ako v pohľade `danubra_v_partner_payment`
// (migrácia 015). Keby sa rozišli, dashboard by ukazoval iné čísla než
// detail odberateľa a nikto by nevedel, ktoré platia.
//
// Peniaze sú v celých centoch (lib/money.js). Čistá logika.
//
// Testy: node danubra/lib/partners/payment.test.js
// ============================================================================
(function () {
  const M = (typeof require !== 'undefined' && typeof module !== 'undefined')
    ? require('../money.js') : window.Money;

  const day = (s) => (s ? String(s).slice(0, 10) : null);
  const today0 = () => new Date().toISOString().slice(0, 10);
  const daysBetween = (a, b) =>
    Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);

  /**
   * @param {Array} invoices  faktúry jedného odberateľa
   *   { total, status, issue_date, due_date, paid_at }
   * @param {Object} o { today }
   * @returns {Object} súhrn v centoch a dňoch
   */
  function discipline(invoices, o = {}) {
    const today = o.today || today0();
    const rows = (invoices || []).filter(Boolean);

    const paid = rows.filter(i => i.status === 'paid');
    const open = rows.filter(i => i.status !== 'paid');
    const overdue = open.filter(i => day(i.due_date) && day(i.due_date) < today);

    const cents = (i) => M.toCents(i.total);

    // Priemer len z toho, čo naozaj zaplatili a čo sa dá zmerať.
    const measurable = paid.filter(i => i.paid_at && i.issue_date);
    const avgDaysToPay = measurable.length
      ? round1(measurable.reduce((s, i) =>
          s + daysBetween(day(i.issue_date), day(i.paid_at)), 0) / measurable.length)
      : null;

    const withDue = paid.filter(i => i.paid_at && i.due_date);
    const onTime = withDue.filter(i => day(i.paid_at) <= day(i.due_date));
    const onTimePct = withDue.length
      ? Math.round(100 * onTime.length / withDue.length) : null;

    // Najdlhšie visiaca faktúra — to je to, čo sa rieši ako prvé.
    let oldestOverdueDays = null;
    for (const i of overdue) {
      const d = daysBetween(day(i.due_date), today);
      if (oldestOverdueDays == null || d > oldestOverdueDays) oldestOverdueDays = d;
    }

    return {
      total: rows.length,
      paid: paid.length,
      open: open.length,
      overdue: overdue.length,
      outstanding: M.sum(open.map(cents)),
      overdueAmount: M.sum(overdue.map(cents)),
      turnover: M.sum(rows.map(cents)),
      avgDaysToPay,
      onTimePct,
      oldestOverdueDays,
    };
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  /**
   * Návrh hodnotenia. Nie je to automatické prepísanie — hodnotenie je
   * obchodné rozhodnutie a človek ho môže prebiť. Funkcia len povie, čo
   * z čísel vychádza, a **prečo**, aby sa to dalo overiť.
   *
   * @param {Object} d  výstup z discipline()
   * @param {Object} o { termsDays }
   * @returns {{ rating:'a'|'b'|'c'|null, reason:string, confident:boolean }}
   */
  function suggestRating(d, o = {}) {
    const terms = Number(o.termsDays) || 30;
    if (!d || d.paid === 0) {
      // Bez uhradenej faktúry sa o disciplíne nedá povedať nič. Nula
      // uhradených nie je zlé hodnotenie — je to žiadne hodnotenie.
      return {
        rating: null, confident: false,
        reason: d && d.overdue
          ? `Zatiaľ nič neuhradil a ${d.overdue} ${plural(d.overdue, 'faktúra je', 'faktúry sú', 'faktúr je')} po splatnosti.`
          : 'Zatiaľ žiadna uhradená faktúra — na hodnotenie je skoro.',
      };
    }

    const confident = d.paid >= 3;

    if (d.overdue > 0 && d.oldestOverdueDays > 30) {
      return {
        rating: 'c', confident,
        reason: `Faktúra po splatnosti ${d.oldestOverdueDays} dní.`,
      };
    }
    if (d.onTimePct != null && d.onTimePct < 50) {
      return {
        rating: 'c', confident,
        reason: `Do splatnosti prišlo len ${d.onTimePct} % úhrad.`,
      };
    }
    if (d.overdue > 0 || (d.onTimePct != null && d.onTimePct < 85)
        || (d.avgDaysToPay != null && d.avgDaysToPay > terms + 7)) {
      const why = d.overdue > 0
        ? `${d.overdue} ${plural(d.overdue, 'faktúra je', 'faktúry sú', 'faktúr je')} po splatnosti.`
        : (d.avgDaysToPay > terms + 7
          ? `Platí priemerne za ${d.avgDaysToPay} dní pri splatnosti ${terms}.`
          : `Do splatnosti prišlo ${d.onTimePct} % úhrad.`);
      return { rating: 'b', confident, reason: why };
    }

    return {
      rating: 'a', confident,
      reason: d.avgDaysToPay != null
        ? `Platí priemerne za ${d.avgDaysToPay} ${plural(d.avgDaysToPay, 'deň', 'dni', 'dní')} pri splatnosti ${terms}.`
        : 'Všetko uhradené do splatnosti.',
    };
  }

  /**
   * Riadky do `Shell.sums` — koľko u odberateľa visí a koľko z toho je
   * po splatnosti.
   */
  function sumLines(d) {
    const lines = [
      { label: 'Vyfakturované spolu', cents: d.turnover, kind: 'info' },
      { label: 'Neuhradené', cents: d.outstanding },
    ];
    if (d.overdueAmount) {
      lines.push({
        label: 'z toho po splatnosti', cents: d.overdueAmount, kind: 'info',
        hint: d.oldestOverdueDays != null
          ? `najdlhšie ${d.oldestOverdueDays} ${plural(d.oldestOverdueDays, 'deň', 'dni', 'dní')}` : '',
      });
    }
    return lines;
  }

  function plural(n, one, few, many) {
    const a = Math.abs(Number(n) || 0);
    if (a === 1) return one;
    if (a >= 2 && a <= 4) return few;
    return many;
  }

  const API = { discipline, suggestRating, sumLines, plural };
  window.DanubraPayment = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
