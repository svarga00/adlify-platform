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
// Testy: node danubra/lib/staffing/periods.test.js
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
   *   from, to     hranice obdobia
   * @returns {Object} súčty v centoch a hodinách + čo sa nezaráta a prečo
   */
  function preview(o = {}) {
    const from = day(o.from), to = day(o.to);
    const byAssignment = new Map((o.assignments || []).map(a => [a.id, a]));

    const included = [], unapproved = [], alreadyClosed = [], noRate = [];
    let hours = { construction: 0, workshop: 0, travel: 0, other: 0 };
    let charged = 0, cost = 0;

    for (const t of (o.timesheets || [])) {
      if (!t || !inPeriod(t, from, to)) continue;

      // Hodiny, ktoré už patria inému obdobiu, sa nezarátajú dvakrát.
      if (t.period_id) { alreadyClosed.push(t); continue; }
      // Neschválené hodiny do podkladu nejdú. Nie sú stratené — zarátajú sa,
      // keď ich niekto schváli, prípadne v nasledujúcom období.
      if (!t.approved) { unapproved.push(t); continue; }

      const a = byAssignment.get(t.assignment_id) || {};
      const h = Number(t.hours) || 0;
      const kind = t.activity_type || 'construction';
      if (kind in hours) hours[kind] += h; else hours.other += h;

      // Sadzba, ktorou sa fakturuje, a sadzba, ktorou platíme. Keď jedna
      // chýba, riadok sa zaráta do hodín, ale povie sa to — inak by podklad
      // ticho vyšiel nižší.
      const chargeRate = M.toCents(a.charge_rate);
      const workerRate = M.toCents(t.rate_used != null ? t.rate_used : a.worker_rate);
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
        detail: `${h} ${plural(h, 'hodina', 'hodiny', 'hodín')} sa do podkladu nedostane. `
          + 'Schváľ ich teraz, alebo pôjdu do nasledujúceho obdobia.',
        severity: 'warn',
      });
    }

    if (p.noRate.length) {
      warnings.push({
        rule: 'period_missing_rate',
        label: `${p.noRate.length} ${plural(p.noRate.length, 'výkaz nemá', 'výkazy nemajú', 'výkazov nemá')} sadzbu`,
        detail: 'Hodiny sa zarátajú, ale suma z nich vyjde nižšia. Doplň sadzbu '
          + 'na nasadení, inak bude podklad neúplný.',
        severity: 'warn',
      });
    }

    // Záporná marža na podklade znamená, že sa na zákazke reálne prerába.
    if (p.charged > 0 && p.margin < 0) {
      warnings.push({
        rule: 'period_negative_margin',
        label: `Na tomto období sa prerába ${M.format(Math.abs(p.margin))}`,
        detail: 'Fakturujeme menej, než platíme živnostníkom. Pozri sadzby na nasadeniach.',
        severity: 'warn',
      });
    }

    if (p.alreadyClosed.length) {
      warnings.push({
        rule: 'period_overlap',
        label: `${p.alreadyClosed.length} ${plural(p.alreadyClosed.length, 'výkaz patrí', 'výkazy patria', 'výkazov patrí')} inému obdobiu`,
        detail: 'Nezarátajú sa znova. Skontroluj, či sa obdobia neprekrývajú.',
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
   * Návrh hraníc nasledujúceho obdobia — celý kalendárny mesiac.
   * Mesiac je to, s čím pracuje odberateľ aj účtovníčka.
   */
  function nextPeriod(existing, today) {
    const base = today || new Date().toISOString().slice(0, 10);
    const last = (existing || [])
      .map(p => day(p.period_to)).filter(Boolean).sort().pop();
    const start = last ? addDays(last, 1) : firstOfMonth(base);
    return { from: start, to: lastOfMonth(start) };
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
  };
  window.DanubraPeriods = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
