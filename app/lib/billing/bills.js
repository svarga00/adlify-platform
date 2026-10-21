// ============================================================================
// DANUBRA — prijaté faktúry od živnostníkov a náklady
// ============================================================================
// Toto je miesto, kde sa v tomto biznise najčastejšie strácajú peniaze:
// človek vyfakturuje viac hodín, než odrobil, a pri desiatich ľuďoch to nikto
// nezachytí. Appka vie, koľko schválených hodín má za obdobie, takže rozdiel
// dopočíta sama.
//
// Rovnaké pravidlá ako trigger `danubra_bill_check()` (migrácia 019). Tam je
// pravda — tu je to preto, aby sa rozdiel ukázal ešte pri písaní a aby sa to
// dalo testovať bez databázy.
//
// Tolerancia je jeden cent. Kryje zaokrúhľovanie, nie „skoro sedí".
//
// Peniaze v celých centoch (lib/money.js). Čistá logika.
//
// Testy: node app/lib/billing/bills.test.js
// ============================================================================
(function () {
  const M = (typeof require !== 'undefined' && typeof module !== 'undefined')
    ? require('../money.js') : window.Money;

  const TOLERANCE = 1;   // cent

  /**
   * Čo by podľa schválených hodín malo prísť.
   *
   * @param {Object} o { worker_id, period_id, timesheets, assignments, worker }
   * @returns {{ hours:number, expected:number|null }}
   *   `expected` je null, keď sa to nedá zistiť — a to je iná situácia než nula.
   */
  function expected(o = {}) {
    if (!o.period_id || !o.worker_id) return { hours: null, expected: null };
    const byId = new Map((o.assignments || []).map(a => [a.id, a]));
    let hours = 0, cents = 0;

    for (const t of (o.timesheets || [])) {
      if (!t || t.period_id !== o.period_id || t.worker_id !== o.worker_id) continue;
      if (!t.approved) continue;
      const a = byId.get(t.assignment_id) || {};
      const rate = M.toCents(
        t.rate_used != null ? t.rate_used
          : (a.worker_rate != null ? a.worker_rate : (o.worker && o.worker.hourly_cost)));
      const h = Number(t.hours) || 0;
      hours += h;
      cents += M.mul(rate, h);
    }
    return { hours, expected: cents };
  }

  /**
   * Porovná faktúru so schválenými hodinami.
   * @returns {{ hours, expected, amount, variance, status, matches }}
   */
  function check(bill = {}, o = {}) {
    const e = expected({ ...o, worker_id: bill.worker_id, period_id: bill.period_id });
    const amount = M.toCents(bill.amount);
    const variance = e.expected == null ? null : amount - e.expected;
    return {
      hours: e.hours,
      expected: e.expected,
      amount,
      variance,
      matches: variance == null ? null : Math.abs(variance) <= TOLERANCE,
      // Stav, ktorý z toho vyjde. Trigger ho nastaví rovnako.
      status: (variance != null && Math.abs(variance) > TOLERANCE)
        && ['received', 'checked'].includes(bill.status || 'received')
        ? 'disputed' : (bill.status || 'received'),
    };
  }

  /**
   * Čo bráni schváleniu prijatej faktúry.
   * @param {Object} o { bill, worker, timesheets, assignments }
   */
  function review(o = {}) {
    const bill = o.bill || {};
    const worker = o.worker || {};
    const c = check(bill, { ...o, worker });
    const reasons = [], warnings = [];

    if (c.amount <= 0) {
      reasons.push({
        rule: 'bill_zero', label: 'Faktúra je na nulu alebo zápornú sumu',
        detail: 'Skontroluj, čo prišlo.', severity: 'block',
      });
    }

    // Jadro fázy: rozdiel voči odrobeným hodinám.
    if (c.variance != null && Math.abs(c.variance) > TOLERANCE) {
      const more = c.variance > 0;
      reasons.push({
        rule: 'bill_variance',
        label: more
          ? `Fakturuje o ${M.format(c.variance)} viac, než má schválených hodín`
          : `Fakturuje o ${M.format(Math.abs(c.variance))} menej, než odrobil`,
        detail: `Podľa ${c.hours} ${plural(c.hours, 'schválenej hodiny', 'schválených hodín', 'schválených hodín')} `
          + `by malo prísť ${M.format(c.expected)}, prišlo ${M.format(c.amount)}. `
          + (more
            ? 'Schváliť sa to dá len s poznámkou, ktorá vysvetlí prečo.'
            : 'Možno zabudol na časť hodín — over to s ním skôr, než to schváliš.'),
        severity: 'block',
      });
    }

    if (c.variance == null) {
      warnings.push({
        rule: 'bill_no_period',
        label: 'Faktúra nie je naviazaná na uzavreté obdobie',
        detail: 'Bez neho sa nedá porovnať s odrobenými hodinami a schvaľuje '
          + 'sa naslepo.',
        severity: 'warn',
      });
    }

    // Bez fakturačných údajov sa doklad nedá zaúčtovať.
    if (!String(worker.company_id || '').trim()) {
      warnings.push({
        rule: 'missing_billing_data', label: 'Živnostník nemá v kartotéke IČO',
        detail: 'Doplň fakturačné údaje, inak sa faktúra nedá zapísať '
          + 'do účtovníctva.', severity: 'warn',
      });
    }
    if (!String(worker.bank_iban || '').trim()) {
      warnings.push({
        rule: 'missing_billing_data', label: 'Živnostník nemá IBAN',
        detail: 'Nebude sa dať uhradiť ani spárovať s výpisom.', severity: 'warn',
      });
    }

    if (!bill.storage_path) {
      warnings.push({
        rule: 'bill_no_scan', label: 'Chýba sken faktúry',
        detail: 'Bez dokladu to účtovníčka nezaúčtuje.', severity: 'warn',
      });
    }

    return { ok: reasons.length === 0, reasons, warnings, check: c };
  }

  // ── Čo na prijatých faktúrach čaká na nás ─────────────────────────────────

  /**
   * Prijaté faktúry rozdelené podľa toho, čo s nimi treba spraviť — a jedna
   * vec, ktorá je na rade.
   *
   * Poradie je iné než pri vydaných faktúrach, a zámerne:
   *
   *   1. **nesedí s hodinami** (`disputed`) — tu ide o peniaze, ktoré by sme
   *      zaplatili zbytočne. Rozdiel treba doriešiť s človekom, nie schváliť.
   *   2. **po splatnosti a schválená** — živnostník čaká na peniaze. Toto je
   *      jediná vec na tejto obrazovke, ktorá kazí vzťah: kto nedostane
   *      zaplatené načas, naberie sa inde.
   *   3. **neskontrolovaná** (`received`) — prišla a nikto ju neprešiel.
   *   4. **schválená, nezaplatená** — čaká na úhradu, ale ešte je čas.
   */
  const SPORNE = 'disputed';
  const NESKONTROLOVANE = ['received'];
  const PRED_UHRADOU = ['checked', 'approved'];

  function den(x) { return x ? String(x).slice(0, 10) : null; }

  function queue(bills = [], today) {
    const dnes = den(today) || new Date().toISOString().slice(0, 10);
    const live = (bills || []).filter(b => b && b.status !== 'cancelled' && b.status !== 'discarded');

    // Nahraté z PDF, ešte nepotvrdené. Kým ich človek neodklikne, nie sú
    // záväzok — ale treba ich prejsť, inak sa na ne zabudne.
    const review = live.filter(b => b.status === 'review');
    const disputed = live.filter(b => b.status === SPORNE);
    const toCheck = live.filter(b => NESKONTROLOVANE.includes(b.status));
    const toPay = live.filter(b => PRED_UHRADOU.includes(b.status));
    const latePay = toPay.filter(b => den(b.due_date) && den(b.due_date) < dnes);

    const suma = (list) => list.reduce((s, b) => s + M.toCents(b.amount), 0);
    const prvy = (list) => list.slice().sort((a, b) =>
      String(den(a.due_date) || '9999').localeCompare(String(den(b.due_date) || '9999')))[0] || null;

    let next = null;
    if (disputed.length) {
      next = {
        key: 'disputed',
        title: disputed.length === 1 ? 'Doriešiť faktúru, ktorá nesedí' : 'Doriešiť faktúry, ktoré nesedia',
        what: `${disputed.length} ${plural(disputed.length, 'faktúra nesedí', 'faktúry nesedia', 'faktúr nesedí')} `
          + `so schválenými hodinami · ${M.format(suma(disputed))}`,
        why: 'Rozdiel treba doriešiť s človekom, nie schváliť. Bez poznámky, ktorá vysvetlí '
          + 'prečo, sa schváliť ani nedá.',
        hot: true, bill: prvy(disputed), count: disputed.length, cents: suma(disputed),
      };
    } else if (review.length) {
      const citam = review.filter(b => b.extract_status === 'pending').length;
      next = {
        key: 'review',
        title: review.length === 1 ? 'Potvrdiť nahratú faktúru' : 'Potvrdiť nahraté faktúry',
        what: `${review.length} ${plural(review.length, 'faktúra čaká', 'faktúry čakajú', 'faktúr čaká')} `
          + `na kontrolu${citam ? ` · ${citam} sa ešte číta` : ''}`,
        why: 'Appka ich prečítala, ale potvrdiť musí človek — model sa občas pomýli v čísle '
          + 'alebo v IBAN-e.',
        hot: false, bill: review.find(b => b.extract_status !== 'pending') || review[0],
        count: review.length, cents: suma(review),
      };
    } else if (latePay.length) {
      next = {
        key: 'pay',
        title: 'Zaplatiť faktúry po splatnosti',
        what: `${latePay.length} ${plural(latePay.length, 'faktúra je', 'faktúry sú', 'faktúr je')} `
          + `po splatnosti · ${M.format(suma(latePay))}`,
        why: 'Kto nedostane zaplatené načas, naberie sa inde — a povie to ďalším. '
          + 'Toto je na tejto obrazovke to jediné, čo kazí vzťah.',
        hot: true, bill: prvy(latePay), count: latePay.length, cents: suma(latePay),
      };
    } else if (toCheck.length) {
      next = {
        key: 'check',
        title: toCheck.length === 1 ? 'Skontrolovať faktúru' : 'Skontrolovať faktúry',
        what: `${toCheck.length} ${plural(toCheck.length, 'faktúra prišla', 'faktúry prišli', 'faktúr prišlo')} `
          + `a nikto ich neprešiel · ${M.format(suma(toCheck))}`,
        why: 'Appka ju porovná so schválenými hodinami sama — treba len otvoriť a pozrieť, '
          + 'či rozdiel niečo znamená.',
        hot: false, bill: prvy(toCheck), count: toCheck.length, cents: suma(toCheck),
      };
    } else if (toPay.length) {
      next = {
        key: 'willpay',
        title: 'Pripravené na úhradu',
        what: `${toPay.length} ${plural(toPay.length, 'schválená faktúra', 'schválené faktúry', 'schválených faktúr')} `
          + `· ${M.format(suma(toPay))}`,
        why: 'Ešte je čas. Dátum splatnosti je pri každej z nich.',
        hot: false, bill: prvy(toPay), count: toPay.length, cents: suma(toPay),
      };
    }

    return {
      review, disputed, toCheck, toPay, latePay, next,
      disputedCents: suma(disputed), toCheckCents: suma(toCheck),
      toPayCents: suma(toPay), latePayCents: suma(latePay),
      // Čo čaká na nás dokopy: sporné a neskontrolované.
      waiting: review.length + disputed.length + toCheck.length,
    };
  }

  /** Riadky do `Shell.sums` — porovnanie faktúry s podkladom. */
  function sumLines(c) {
    const lines = [{ label: 'Fakturuje', cents: c.amount }];
    if (c.expected != null) {
      lines.push({
        label: 'Podľa schválených hodín', cents: c.expected, kind: 'info',
        hint: c.hours != null ? `${c.hours} h` : '',
      });
    }
    return lines;
  }

  // ── Náklady ───────────────────────────────────────────────────────────────

  /** Súčty po kategóriách, najväčšia položka prvá. */
  function byCategory(costs) {
    const map = new Map();
    for (const c of (costs || [])) {
      if (!c) continue;
      const k = c.category || 'other';
      map.set(k, (map.get(k) || 0) + M.toCents(c.amount));
    }
    return [...map.entries()]
      .map(([category, cents]) => ({ category, cents }))
      .sort((a, b) => b.cents - a.cents);
  }

  /**
   * Ktoré dátumy by opakovaný náklad vygeneroval. Slúži na náhľad — samotné
   * generovanie robí databáza, aby sa to dalo spustiť aj z cronu.
   */
  function recurringDates(cost = {}, until) {
    const out = [];
    if (!cost.recurring || !cost.cost_date) return out;
    const limit = until || addMonths(cost.cost_date, 12);
    const day = Number(String(cost.cost_date).slice(8, 10));
    let d = cost.cost_date;
    for (let i = 0; i < 120; i++) {
      d = addMonths(d, 1, day);
      if (d > limit) break;
      if (cost.recurring_until && d > cost.recurring_until) break;
      out.push(d);
    }
    return out;
  }

  function addMonths(date, n, forceDay) {
    const [y, m] = String(date).slice(0, 10).split('-').map(Number);
    const day = forceDay || Number(String(date).slice(8, 10));
    const total = (y * 12) + (m - 1) + n;
    const ny = Math.floor(total / 12), nm = (total % 12) + 1;
    // Krátky mesiac: 31. v mesiaci, ktorý ho nemá, spadne na posledný deň.
    const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
    const nd = Math.min(day, last);
    return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
  }

  /**
   * Ekonomika zákazky. Sporné faktúry sa do nákladov nepočítajú — ešte nie
   * sú záväzok a započítať ich by znamenalo tváriť sa, že marža je nižšia,
   * než je.
   */
  function economics(o = {}) {
    const invoiced = M.sum((o.invoices || [])
      .filter(i => i && !['cancelled', 'draft'].includes(i.status))
      .map(i => M.toCents(i.total)));
    const withheld = M.sum((o.invoices || [])
      .filter(i => i && !['cancelled', 'draft'].includes(i.status))
      .map(i => M.toCents(i.withholding_amount)));
    const bills = M.sum((o.bills || [])
      .filter(b => b && ['approved', 'paid'].includes(b.status))
      .map(b => M.toCents(b.amount)));
    const disputed = M.sum((o.bills || [])
      .filter(b => b && b.status === 'disputed')
      .map(b => M.toCents(b.amount)));
    const costs = M.sum((o.costs || []).map(c => M.toCents(c && c.amount)));

    const margin = invoiced - bills - costs;
    return {
      invoiced, bills, costs, disputed, withheld, margin,
      marginPct: invoiced > 0 ? Math.round(1000 * margin / invoiced) / 10 : null,
      cashIn: invoiced - withheld,
    };
  }

  function plural(n, one, few, many) {
    const a = Math.abs(Number(n) || 0);
    if (a === 1) return one;
    if (a >= 2 && a <= 4) return few;
    return many;
  }

  const API = {
    TOLERANCE, expected, check, review, sumLines, queue,
    byCategory, recurringDates, addMonths, economics, plural,
  };
  window.DanubraBills = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
