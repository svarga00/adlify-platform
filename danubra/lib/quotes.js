// ============================================================================
// DANUBRA — ponuky: marža a čo skontrolovať pred odoslaním
// ============================================================================
// v1 sa dalo zistiť, že sa na zákazke prerába, až z faktúr — teda o tri
// mesiace neskôr. Ponuka preto pozná svoju maržu už pri písaní.
//
// Marža sa počíta **po odpočítaní réžie**, nie len ako rozdiel sadzieb.
// Ubytovanie a doprava sú najväčšia položka po tom, čo dostane živnostník;
// keď sa nerátajú, ponuka vyzerá o niekoľko eur na hodinu lepšie, než je.
//
// Druhá vec, ktorú ponuka musí zachytiť: sadzba pre živnostníka pod nemeckou
// minimálnou mzdou. To nie je otázka marže, ale pokuty — rozhoduje tarifný
// nárok, aj keď sa reálne dohodlo menej.
//
// Peniaze v celých centoch (lib/money.js). Čistá logika.
//
// Testy: node danubra/lib/quotes.test.js
// ============================================================================
(function () {
  const M = (typeof require !== 'undefined' && typeof module !== 'undefined')
    ? require('./money.js') : window.Money;

  const day = (s) => (s ? String(s).slice(0, 10) : null);
  const today0 = () => new Date().toISOString().slice(0, 10);

  // Prahy sa dajú prepísať z Nastavení → Cenník a pravidlá.
  const DEFAULTS = {
    bau_min_lg1: 15.86,      // Bau-Mindestlohn, stavebné práce
    bau_min_lg2: 17.34,
    general_min_wage: 13.90, // všeobecný Mindestlohn
    target_margin_pct: 20,   // pod týmto sa oplatí sa zamyslieť
    min_margin_per_hour: 3,  // absolútne dno na hodinu
  };

  /**
   * Prepočet marže. Všetko vstupuje ako sadzba v eurách (tak, ako to je
   * v databáze) a vracia sa v celých centoch.
   *
   * @param {Object} q { charge_rate, worker_rate, overhead_per_hour,
   *                     hours_per_month, headcount }
   */
  function margin(q = {}) {
    const charge = M.toCents(q.charge_rate);
    const worker = M.toCents(q.worker_rate);
    const overhead = M.toCents(q.overhead_per_hour);
    const perHour = charge - worker - overhead;

    const hours = Number(q.hours_per_month) || 0;
    const heads = Number(q.headcount) || 1;

    return {
      chargeRate: charge,
      workerRate: worker,
      overhead,
      perHour,
      // Podiel z fakturovanej sumy. Bez sadzby sa nedá počítať percento —
      // null je poctivejšie než nula.
      pct: charge > 0 ? Math.round(1000 * perHour / charge) / 10 : null,
      perPersonMonth: M.mul(perHour, hours),
      perMonth: M.mul(perHour, hours * heads),
      revenueMonth: M.mul(charge, hours * heads),
      costMonth: M.mul(worker + overhead, hours * heads),
    };
  }

  /** Riadky do `Shell.sums` — z čoho sa marža skladá. */
  function sumLines(q = {}) {
    const m = margin(q);
    return [
      { label: 'Fakturujeme', cents: m.chargeRate, hint: 'za hodinu' },
      { label: 'Živnostníkovi', cents: m.workerRate, kind: 'minus', hint: 'za hodinu' },
      { label: 'Réžia', cents: m.overhead, kind: 'minus',
        hint: 'ubytovanie, doprava, réžia na hodinu' },
    ];
  }

  // ── Čo skontrolovať pred odoslaním ────────────────────────────────────────

  /**
   * @param {Object} q  ponuka
   * @param {Object} s  prahy z nastavení (staffing)
   * @param {Object} o  { today }
   * @returns {{ ok:boolean, reasons:Array, warnings:Array, margin:Object }}
   *   `reasons` idú priamo do Shell.blocker.
   */
  function review(q = {}, s = {}, o = {}) {
    const today = o.today || today0();
    const cfg = { ...DEFAULTS, ...(s || {}) };
    const m = margin(q);
    const reasons = [], warnings = [];

    if (!q.partner_id) {
      reasons.push({
        rule: 'quote_no_partner', label: 'Ponuka nemá odberateľa',
        detail: 'Bez odberateľa sa nedá odoslať ani z nej spraviť zmluva.',
        severity: 'block',
      });
    }
    if (!q.charge_rate) {
      reasons.push({
        rule: 'quote_no_rate', label: 'Chýba sadzba pre odberateľa',
        detail: 'Bez nej nie je čo ponúkať.', severity: 'block',
      });
    }

    // Toto je dôvod, prečo ponuka pozná maržu.
    if (q.charge_rate && m.perHour < 0) {
      reasons.push({
        rule: 'quote_negative_margin',
        label: `Na tejto ponuke sa prerába ${M.format(Math.abs(m.perHour))} na hodinu`,
        detail: 'Fakturovaná sadzba nepokryje ani to, čo dostane živnostník a réžia.',
        severity: 'block',
      });
    } else if (q.charge_rate && m.perHour < M.toCents(cfg.min_margin_per_hour)) {
      warnings.push({
        rule: 'quote_thin_margin',
        label: `Marža je len ${M.format(m.perHour)} na hodinu`,
        detail: `Dno je ${M.format(M.toCents(cfg.min_margin_per_hour))}. Jeden chorý človek a je to v mínuse.`,
        severity: 'warn',
      });
    } else if (m.pct != null && m.pct < Number(cfg.target_margin_pct)) {
      warnings.push({
        rule: 'quote_below_target',
        label: `Marža ${m.pct} % je pod cieľom ${cfg.target_margin_pct} %`,
        detail: `Mesačne to je ${M.format(m.perMonth)} pri ${q.headcount || 1} ${plural(q.headcount || 1, 'človeku', 'ľuďoch', 'ľuďoch')}.`,
        severity: 'warn',
      });
    }

    // Réžia sa zabúda a bez nej marža klame.
    if (q.charge_rate && !q.overhead_per_hour) {
      warnings.push({
        rule: 'quote_no_overhead', label: 'Réžia je nulová',
        detail: 'Ubytovanie a doprava sú najväčšia položka po tom, čo dostane '
          + 'živnostník. Bez nich marža vyzerá lepšie, než je.',
        severity: 'warn',
      });
    }

    // Minimálna mzda nie je otázka marže, ale pokuty.
    if (q.worker_rate) {
      const isConstruction = q.work_type !== 'workshop';
      const floor = isConstruction
        ? Number(cfg.bau_min_lg1) : Number(cfg.general_min_wage);
      const floorName = isConstruction
        ? 'stavebnou minimálnou mzdou LG1' : 'všeobecným Mindestlohnom';
      if (m.workerRate < M.toCents(floor)) {
        reasons.push({
          rule: 'below_min_wage',
          label: `Sadzba ${M.format(m.workerRate)} je pod ${floorName}`,
          detail: `Minimum je ${M.format(M.toCents(floor))}. Rozhoduje obsah práce, `
            + 'nie názov zmluvy — pri kontrole Zoll hrozí pokuta.',
          severity: 'block',
        });
      }
    }

    // Platnosť
    if (!q.valid_until) {
      warnings.push({
        rule: 'quote_no_validity', label: 'Ponuka nemá platnosť do',
        detail: 'Bez nej sa o pol roka nedá povedať, či ešte platí.',
        severity: 'warn',
      });
    } else if (day(q.valid_until) < today && ['draft', 'sent'].includes(q.status)) {
      warnings.push({
        rule: 'quote_expired', label: 'Ponuke uplynula platnosť',
        detail: `Platila do ${q.valid_until}.`, severity: 'warn',
      });
    }

    if (q.date_from && q.date_to && day(q.date_to) < day(q.date_from)) {
      reasons.push({
        rule: 'quote_bad_dates', label: 'Koniec je skôr než začiatok',
        detail: 'Skontroluj dátumy nasadenia.', severity: 'block',
      });
    }

    return { ok: reasons.length === 0, reasons, warnings, margin: m };
  }

  // ── Stavy ─────────────────────────────────────────────────────────────────
  // Ponuka, ktorú odberateľ odmietol, sa nevracia do rozpracovaných — to by
  // zahladilo, že raz odišla. Namiesto toho sa spraví nová.
  const FLOW = {
    draft: ['sent'],
    sent: ['accepted', 'rejected', 'expired'],
    accepted: [],
    rejected: [],
    expired: ['sent'],          // predĺžená platnosť sa dá poslať znova
  };

  function canGo(from, to) {
    return (FLOW[from] || []).includes(to);
  }

  /** Čo z ponuky prechádza do zmluvy. */
  function toContract(q = {}) {
    return {
      partner_id: q.partner_id || null,
      quote_id: q.id || null,
      title: q.title || null,
      date_from: q.date_from || null,
      date_to: q.date_to || null,
      charge_rate: q.charge_rate ?? null,
      // Predmet sa píše ako dielo, nie ako hodiny. Predvyplní sa z ponuky,
      // ale musí sa prepísať do reči diela — pri kontrole rozhoduje obsah
      // zmluvy, nie jej názov.
      scope: null,
      kind: 'werkvertrag',
      status: 'draft',
    };
  }

  function plural(n, one, few, many) {
    const a = Math.abs(Number(n) || 0);
    if (a === 1) return one;
    if (a >= 2 && a <= 4) return few;
    return many;
  }

  const API = { margin, sumLines, review, canGo, toContract, FLOW, DEFAULTS, plural };
  window.DanubraQuotes = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
