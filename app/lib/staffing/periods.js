// ============================================================================
// DANUBRA — uzávierka obdobia: čo sa zavrie a čo z toho vyjde
// ============================================================================
// Uzávierka je bod, po ktorom sa hodiny už nemenia. Preto musí byť **pred**
// kliknutím vidieť presne to isté, čo sa potom zmrazí — inak sa uzatvára
// naslepo a rozdiely sa nájdu až na faktúre.
//
// Rovnaké pravidlá ako `danubra_close_period()` v migrácii 017:
//   • do obdobia idú len **schválené** hodiny,
//   • fakturujeme sadzbou zákazky (`charge_rate`),
//   • náklad počítame sadzbou nasadenia (`worker_rate`),
//   • cesta sa počíta ako hodiny, ale vykazuje sa zvlášť — pri kontrole je
//     rozdiel medzi stavebnou hodinou a cestou podstatný.
//
// Peniaze v celých centoch (lib/money.js). Čistá logika.
//
// Testy: node app/lib/staffing/periods.test.js
// ============================================================================
(function () {
  const M = (typeof require !== 'undefined' && typeof module !== 'undefined')
    ? require('../money.js') : window.Money;

  const day = (s) => (s ? String(s).slice(0, 10) : null);

  /** Patrí výkaz do obdobia? Obe hranice vrátane. */
  function inPeriod(ts, from, to) {
    const d = day(ts && ts.work_date);
    return !!d && d >= day(from) && d <= day(to);
  }

  /**
   * Čo sa uzávierkou zavrie. Vracia to isté, čo potom uloží databáza.
   *
   * @param {Object} o
   *   timesheets   výkazy zákazky
   *   assignments  nasadenia (kvôli sadzbám)
   *   workers      kartotéka (hourly_cost — keď nasadenie sadzbu nemá)
   *   from, to     hranice obdobia
   * @returns {Object} súčty v centoch a hodinách + čo sa nezaráta a prečo
   */
  function preview(o = {}) {
    const from = day(o.from), to = day(o.to);
    const byAssignment = new Map((o.assignments || []).map(a => [a.id, a]));
    const workers = new Map((o.workers || []).map(w => [w.id, w]));

    const included = [], unapproved = [], alreadyClosed = [], noRate = [];
    let hours = { construction: 0, workshop: 0, travel: 0, other: 0 };
    let charged = 0, cost = 0;

    for (const t of (o.timesheets || [])) {
      if (!t || !inPeriod(t, from, to)) continue;

      // Hodiny, ktoré už patria inému obdobiu, sa nezarátajú dvakrát.
      if (t.period_id) { alreadyClosed.push(t); continue; }
      // Neschválené hodiny do podkladu nejdú. Zarátajú sa, keď ich niekto
      // schváli a obdobie sa uzavrie (prípadne otvorí späť a uzavrie znova).
      if (!t.approved) { unapproved.push(t); continue; }

      const a = byAssignment.get(t.assignment_id) || {};
      const h = Number(t.hours) || 0;
      const kind = t.activity_type || 'construction';
      if (kind in hours) hours[kind] += h; else hours.other += h;

      // Sadzba, ktorou sa fakturuje, a sadzba, ktorou platíme. Keď jedna
      // chýba, riadok sa zaráta do hodín, ale povie sa to — inak by podklad
      // ticho vyšiel nižší.
      // Sadzba živnostníka rovnako ako v `danubra_close_period`: zapísaná pri
      // hodinách, inak z nasadenia, inak z kartotéky. Nasadenie jednotlivca
      // (Sub.saveAsg) `worker_rate` nemá — náhľad potom ukazoval náklad 0
      // a maržu 100 %, hoci databáza pri uzavretí započítala sadzbu z kartotéky.
      const w = workers.get(t.worker_id) || {};
      const chargeRate = M.toCents(a.charge_rate);
      const workerRate = M.toCents(t.rate_used != null ? t.rate_used
        : a.worker_rate != null ? a.worker_rate : w.hourly_cost);
      if (!chargeRate || !workerRate) noRate.push(t);

      charged += M.mul(chargeRate, h);
      cost += M.mul(workerRate, h);
      included.push(t);
    }

    const totalHours = hours.construction + hours.workshop + hours.travel + hours.other;
    return {
      from, to,
      hours, totalHours,
      charged, cost, margin: charged - cost,
      marginPct: charged > 0 ? Math.round(1000 * (charged - cost) / charged) / 10 : null,
      included, unapproved, alreadyClosed, noRate,
      workers: new Set(included.map(t => t.worker_id)).size,
    };
  }

  /**
   * Dá sa obdobie uzavrieť? Neschválené hodiny nie sú prekážka — sú to
   * peniaze, ktoré sa nechávajú na stole, a človek to má vidieť skôr, než
   * podklad zmrazí.
   *
   * @returns {{ ok:boolean, reasons:Array, warnings:Array, preview:Object }}
   */
  function review(o = {}) {
    const p = preview(o);
    const reasons = [], warnings = [];

    if (p.totalHours === 0) {
      reasons.push({
        rule: 'period_empty', label: 'V období nie sú žiadne schválené hodiny',
        detail: p.unapproved.length
          ? `${p.unapproved.length} ${plural(p.unapproved.length, 'výkaz čaká', 'výkazy čakajú', 'výkazov čaká')} na schválenie.`
          : 'Nie je čo uzavrieť.',
        severity: 'block',
      });
    } else if (p.unapproved.length) {
      const h = p.unapproved.reduce((s, t) => s + (Number(t.hours) || 0), 0);
      warnings.push({
        rule: 'period_unapproved',
        label: `${p.unapproved.length} ${plural(p.unapproved.length, 'výkaz', 'výkazy', 'výkazov')} nie je schválených`,
        // Do nasledujúceho obdobia nepôjdu: každé obdobie berie len svoje dni
        // (danubra_close_period) a do uzavretého sa už nič nedopíše (071).
        detail: `${h} ${plural(h, 'hodina', 'hodiny', 'hodín')} sa do podkladu nedostane. `
          + 'Schváľte ich teraz — po uzavretí sa do faktúry dostanú, len keď sa obdobie otvorí späť.',
        severity: 'warn',
      });
    }

    if (p.noRate.length) {
      warnings.push({
        rule: 'period_missing_rate',
        label: `${p.noRate.length} ${plural(p.noRate.length, 'výkaz nemá', 'výkazy nemajú', 'výkazov nemá')} sadzbu`,
        detail: 'Hodiny sa zarátajú, ale suma z nich vyjde nižšia. Doplňte sadzbu '
          + 'na nasadení, inak bude podklad neúplný.',
        severity: 'warn',
      });
    }

    // Záporná marža na podklade znamená, že sa na zákazke reálne prerába.
    if (p.charged > 0 && p.margin < 0) {
      warnings.push({
        rule: 'period_negative_margin',
        label: `Na tomto období sa prerába ${M.format(Math.abs(p.margin))}`,
        detail: 'Fakturujeme menej, než platíme živnostníkom. Pozrite sadzby na nasadeniach.',
        severity: 'warn',
      });
    }

    if (p.alreadyClosed.length) {
      warnings.push({
        rule: 'period_overlap',
        label: `${p.alreadyClosed.length} ${plural(p.alreadyClosed.length, 'výkaz patrí', 'výkazy patria', 'výkazov patrí')} inému obdobiu`,
        detail: 'Nezarátajú sa znova. Skontrolujte, či sa obdobia neprekrývajú.',
        severity: 'warn',
      });
    }

    return { ok: reasons.length === 0, reasons, warnings, preview: p };
  }

  /** Riadky do `Shell.sums` — z čoho podklad vznikol. */
  function sumLines(p) {
    const lines = [
      { label: 'Fakturujeme odberateľovi', cents: p.charged },
      { label: 'Živnostníkom', cents: p.cost, kind: 'minus' },
    ];
    return lines;
  }

  /** Hodiny po druhoch — na výpis v podklade. */
  function hourLines(p) {
    const names = {
      construction: 'Stavebné práce', workshop: 'Dielenské práce',
      travel: 'Cesta', other: 'Iné',
    };
    return Object.entries(p.hours)
      .filter(([, h]) => h > 0)
      .map(([k, h]) => ({ key: k, label: names[k] || k, hours: h }));
  }

  /**
   * Návrh hraníc nasledujúceho obdobia.
   *
   * Podľa šablón firmy (Rahmenvertrag SK_DE čl. III bod 2) sa nemeckému
   * odberateľovi fakturuje **týždenne po kalendárnych týždňoch (KW)** —
   * obdobie je pondelok až nedeľa. Odberateľ môže mať aj 14 dní (14/14) alebo
   * mesiac (`danubra_partners.billing_period_days`).
   *
   *   days 7      → jeden KW (Po–Ne)
   *   days 14     → dva KW
   *   days ≥ 28   → kalendárny mesiac (ako doteraz)
   *
   * Prvé obdobie začína pondelkom týždňa, v ktorom je `today` (pri mesiaci
   * prvým dňom mesiaca). Ďalšie nadväzuje na posledné existujúce a končí
   * v nedeľu — aj keď predchádzajúce (napr. mesačné) skončilo v strede
   * týždňa, nové sa zarovná na koniec KW.
   */
  function nextPeriod(existing, today, opts = {}) {
    const days = Math.max(1, Math.round(Number(opts && opts.days) || 7));
    const base = today || new Date().toISOString().slice(0, 10);
    const last = (existing || [])
      .map(p => day(p.period_to)).filter(Boolean).sort().pop();
    if (days >= 28) {
      const start = last ? addDays(last, 1) : firstOfMonth(base);
      return { from: start, to: lastOfMonth(start) };
    }
    const start = last ? addDays(last, 1) : mondayOf(base);
    return { from: start, to: sundayOf(addDays(start, days - 1)) };
  }

  /** Pondelok a nedeľa ISO týždňa, v ktorom je deň. */
  function mondayOf(d) {
    const t = new Date(day(d) + 'T00:00:00Z');
    return addDays(day(d), -((t.getUTCDay() + 6) % 7));
  }
  function sundayOf(d) { return addDays(mondayOf(d), 6); }

  /** ISO kalendárny týždeň (KW) a jeho rok. */
  function isoWeek(d) {
    const thu = addDays(mondayOf(d), 3);
    const y = Number(thu.slice(0, 4));
    const jan4 = `${y}-01-04`;
    return { week: 1 + Math.round(daysBetween(mondayOf(jan4), mondayOf(d)) / 7), year: y };
  }
  function daysBetween(a, b) {
    return Math.round((new Date(day(b) + 'T00:00:00Z') - new Date(day(a) + 'T00:00:00Z')) / 864e5);
  }

  /**
   * Popis obdobia po KW: „KW 47 · 16.11.–22.11.2026", „KW 46–47 · 09.11.–22.11.2026".
   * Obdobie, ktoré nie je zarovnané na týždne (mesačné), má len dátumy.
   */
  function kwLabel(from, to) {
    const f = day(from), t = day(to);
    if (!f || !t) return '';
    const dm = (x) => `${x.slice(8, 10)}.${x.slice(5, 7)}.`;
    const dates = `${dm(f)}–${dm(t)}${t.slice(0, 4)}`;
    if (f !== mondayOf(f) || t !== sundayOf(t)) return dates;
    const a = isoWeek(f), b = isoWeek(t);
    return `KW ${a.week}${b.week !== a.week ? `–${b.week}` : ''} · ${dates}`;
  }

  /**
   * Faktúra živnostníka: **za 2 kalendárne týždne** (rámcová zmluva čl. V
   * bod 2 — každých 14 dní; vzor faktúry V1.3 — KW s dátumami). Obdobia
   * odberateľa sú týždenné, preto sa pre jedného živnostníka na jednej zákazke
   * (dve stavby = dve faktúry) spájajú za sebou idúce uzavreté obdobia do
   * okien najviac `days` dní.
   *
   * @param {Array} periods  obdobia jednej zákazky, ktoré má živnostník nevyfakturované
   * @param {Object} o       { days } — z Nastavení (subcontract.fakturacia_dni), predvolene 14
   * @returns {Array<{ from, to, periods, complete }>} `complete` = okno má plných `days` dní
   */
  function workerWindows(periods, o = {}) {
    const days = Math.max(1, Math.round(Number(o && o.days) || 14));
    const zoradene = (periods || []).filter(p => p && p.period_from && p.period_to)
      .slice().sort((a, b) => String(a.period_from).localeCompare(String(b.period_from)));
    const out = [];
    let cur = null;
    for (const p of zoradene) {
      const nadvazuje = cur && addDays(cur.to, 1) >= day(p.period_from);
      const dlzka = cur ? daysBetween(cur.from, p.period_to) + 1 : 0;
      if (cur && nadvazuje && dlzka <= days) {
        cur.periods.push(p);
        cur.to = day(p.period_to);
      } else {
        cur = { from: day(p.period_from), to: day(p.period_to), periods: [p] };
        out.push(cur);
      }
    }
    for (const w of out) w.complete = daysBetween(w.from, w.to) + 1 >= days;
    return out;
  }

  function firstOfMonth(d) { return day(d).slice(0, 8) + '01'; }
  function lastOfMonth(d) {
    const [y, m] = day(d).split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  }
  function addDays(d, n) {
    const t = new Date(day(d) + 'T00:00:00Z');
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  }

  function plural(n, one, few, many) {
    const a = Math.abs(Number(n) || 0);
    if (a === 1) return one;
    if (a >= 2 && a <= 4) return few;
    return many;
  }

  const API = {
    inPeriod, preview, review, sumLines, hourLines,
    nextPeriod, firstOfMonth, lastOfMonth, addDays, plural,
    mondayOf, sundayOf, isoWeek, daysBetween, kwLabel, workerWindows,
  };
  window.DanubraPeriods = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
