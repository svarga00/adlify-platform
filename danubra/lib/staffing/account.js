// ============================================================================
// DANUBRA — účet živnostníka
// ============================================================================
// Odpovedá na otázku, ktorá sa pýta pri každej výplate: **koľko mu dlhujeme?**
//
// Rozlišujú sa štyri veci, ktoré sa v praxi pletú:
//
//   odrobil      hodiny × sadzba platná v ten deň. Je to **odhad** — kým
//                nepríde jeho faktúra, nie je to záväzok.
//   vyfakturoval čo nám poslal a my sme schválili alebo už uhradili.
//   zálohy       čo dostal dopredu a ešte sa to z faktúry neodpočítalo.
//   dlhujeme     schválené neuhradené − nevyrovnané zálohy.
//
// Sporná faktúra sa do záväzku nepočíta — ešte nie je dohodnutá. Rovnako to
// robí ekonomika zákazky (F7) aj pohľad `danubra_v_worker_account`.
//
// Sadzba sa berie v tomto poradí: `rate_used` na výkaze (zapísaná pri
// uzávierke) → `worker_rate` na nasadení → `hourly_cost` na človeku. Prvá
// vyhráva, aby neskoršia zmena sadzby neprepísala to, čo už bolo vyfakturované.
//
// Peniaze sú v centoch (rozhodnutie R2). Hodiny sú desatinné čísla.
//
// Testy: node danubra/lib/staffing/account.test.js
// ============================================================================
(function () {
  const M = (typeof module !== 'undefined' && module.exports)
    ? require('../money') : window.Money;

  const day = (s) => (s ? String(s).slice(0, 10) : null);
  const today0 = () => new Date().toISOString().slice(0, 10);

  /** Faktúry, ktoré sú už záväzkom. Sporné a zrušené sem nepatria. */
  const OWED_STATUSES = ['approved', 'paid'];

  /** Sadzba, ktorou sa má oceniť tento výkaz. */
  function rateOf(sheet, assignment, worker) {
    const candidates = [
      sheet && sheet.rate_used,
      assignment && assignment.worker_rate,
      worker && worker.hourly_cost,
    ];
    for (const c of candidates) {
      if (c != null && c !== '') return M.toCents(c);
    }
    return 0;
  }

  /** Je záloha stále nevyrovnaná? Zrušená sa neráta vôbec. */
  function isOpenAdvance(a) {
    return !!a && !a.voided_at && !a.settled_at && !a.settled_bill_id;
  }

  /**
   * Odrobené hodiny a ich hodnota.
   * @returns {{ hours: number, cents: number }}
   */
  function earned(o = {}) {
    const byAssignment = new Map((o.assignments || []).map(a => [a.id, a]));
    let hours = 0, cents = 0;
    for (const t of (o.timesheets || [])) {
      if (!t) continue;
      const h = Number(t.hours) || 0;
      hours += h;
      // Hodiny sú desatinné, sadzba je v centoch. Násobí sa cez `mul`,
      // aby sa nezaokrúhľovalo skôr, než treba.
      cents += M.mul(rateOf(t, byAssignment.get(t.assignment_id), o.worker), h);
    }
    return { hours: Math.round(hours * 100) / 100, cents };
  }

  /** Hodiny za daný mesiac ('2026-09'). Bez mesiaca berie aktuálny. */
  function month(o = {}, ym) {
    const key = ym || (o.today || today0()).slice(0, 7);
    const rows = (o.timesheets || []).filter(t => day(t && t.work_date) &&
      day(t.work_date).slice(0, 7) === key);
    const e = earned({ ...o, timesheets: rows });
    return { month: key, hours: e.hours, cents: e.cents, count: rows.length };
  }

  /**
   * Celý účet. Vstupom sú riadky tak, ako ich vracia databáza.
   *
   * @param {Object} o
   *   worker, timesheets, assignments, bills, advances, today
   */
  function summary(o = {}) {
    const e = earned(o);
    const bills = (o.bills || []).filter(Boolean);

    const billed = M.sum(bills.filter(b => OWED_STATUSES.includes(b.status))
      .map(b => M.toCents(b.amount)));
    const paid = M.sum(bills.filter(b => b.status === 'paid')
      .map(b => M.toCents(b.amount)));
    const unpaid = M.sum(bills.filter(b => b.status === 'approved')
      .map(b => M.toCents(b.amount)));
    const disputed = M.sum(bills.filter(b => b.status === 'disputed')
      .map(b => M.toCents(b.amount)));
    const toCheck = bills.filter(b => ['received', 'checked'].includes(b.status));

    const advances = (o.advances || []).filter(a => a && !a.voided_at);
    const advancesOpen = M.sum(advances.filter(isOpenAdvance).map(a => M.toCents(a.amount)));
    const advancesTotal = M.sum(advances.map(a => M.toCents(a.amount)));

    // Toto je to číslo, kvôli ktorému celý účet existuje.
    const owed = M.sub(unpaid, advancesOpen);

    // Koľko z odrobeného ešte nevyfakturoval. Záporné číslo znamená, že
    // fakturoval viac, než sedí z hodín — to je dôvod pozrieť sa na to.
    const notBilledYet = M.sub(e.cents, billed);

    return {
      hours: e.hours,
      earned: e.cents,
      billed, paid, unpaid, disputed,
      billsToCheck: toCheck.length,
      advancesOpen, advancesTotal,
      owed,
      notBilledYet,
      // Máme mu čo vyplatiť? Záporné `owed` znamená, že zálohy prevyšujú
      // schválené faktúry — vtedy sa nevypláca, odpočíta sa z ďalšej.
      payable: owed > 0 ? owed : 0,
      overpaid: owed < 0 ? -owed : 0,
      thisMonth: month(o),
    };
  }

  /**
   * Čo sa má odpočítať z konkrétnej faktúry. Záloha väčšia než faktúra
   * sa odpočíta len do jej výšky — zvyšok zostáva nevyrovnaný na ďalšiu.
   *
   * @returns {{ apply: Array, applied: number, rest: number }}
   */
  function settlement(bill, advances = []) {
    const total = M.toCents(bill && bill.amount);
    const open = advances.filter(isOpenAdvance)
      .sort((a, b) => String(a.paid_on || '').localeCompare(String(b.paid_on || '')));
    const apply = [];
    let left = total;
    for (const a of open) {
      if (left <= 0) break;
      const cents = M.toCents(a.amount);
      if (cents <= left) { apply.push(a); left = M.sub(left, cents); }
    }
    const applied = M.sub(total, left);
    return { apply, applied, rest: left };
  }

  /** Veta na kartu. Nie číslo — veta, z ktorej je jasné, či treba konať. */
  function headline(s) {
    if (!s) return { tone: 'ok', text: 'Zatiaľ žiadny pohyb.' };
    if (s.disputed > 0) {
      return { tone: 'bad',
        text: `Sporná faktúra na ${M.format(s.disputed)} — kým sa nedohodne, nie je to záväzok.` };
    }
    if (s.overpaid > 0) {
      return { tone: 'warn',
        text: `Zálohy prevyšujú schválené faktúry o ${M.format(s.overpaid)} — odpočíta sa z ďalšej.` };
    }
    if (s.payable > 0) {
      return { tone: 'warn',
        text: `Na vyplatenie ${M.format(s.payable)}${
          s.advancesOpen > 0 ? ` (už po odpočte zálohy ${M.format(s.advancesOpen)})` : ''}.` };
    }
    if (s.billsToCheck > 0) {
      return { tone: 'warn',
        text: `${s.billsToCheck} ${plural(s.billsToCheck, 'faktúra čaká', 'faktúry čakajú', 'faktúr čaká')} na kontrolu.` };
    }
    return { tone: 'ok', text: 'Vyrovnané — nič mu nedlhujeme.' };
  }

  function plural(n, one, few, many) {
    const a = Math.abs(Number(n) || 0);
    if (a === 1) return one;
    if (a >= 2 && a <= 4) return few;
    return many;
  }

  const API = {
    OWED_STATUSES, rateOf, isOpenAdvance,
    earned, month, summary, settlement, headline, plural,
  };
  if (typeof window !== 'undefined') window.DanubraAccount = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
