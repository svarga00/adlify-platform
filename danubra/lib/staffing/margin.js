// ============================================================================
// DANUBRA — Jednotková ekonomika nasadeného pracovníka (Fáza 2)
// ============================================================================
// Podľa biznis plánu:
//   tržba   = odpracované hodiny × fakturačná sadzba
//   náklady = hrubá mzda × (1 + odvody) + diéty × dni + ubytovanie + doprava
//             + SOKA-BAU (len pri stavebných prácach, % z hrubej mzdy)
//   marža   = tržba − náklady
//
// Peniaze zaokrúhľujeme až na výstupe. Čistá funkcia, žiadny DB prístup.
// ============================================================================
(function () {
  const DEFAULTS = {
    employer_contrib_pct: 36.2,   // odvody zamestnávateľa SR
    soka_pct: 14.7,               // ULAK od 1.7.2026 (len stavba)
    per_diem_de: 45,              // diéty €/deň
    bau_min_lg1: 15.86,           // Bau-Mindestlohn LG1 €/h
    bau_min_lg2: 17.34,           // LG2 od 1.4.2026 (West)
    general_min_wage: 13.90,      // všeobecný Mindestlohn od 1.1.2026
    withholding_pct: 15,          // Bauabzugsteuer bez §48b
  };

  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const num = (v, d = 0) => (v == null || v === '' || isNaN(Number(v)) ? d : Number(v));

  /**
   * Spočíta ekonomiku jedného nasadenia za obdobie.
   *
   * @param {Object} a  nasadenie: { charge_rate, gross_monthly, per_diem_daily,
   *                                 accommodation_monthly, transport_monthly }
   * @param {Object} p  obdobie:  { hours, workDays, workType: 'construction'|'workshop',
   *                                freistellungOk: bool }
   * @param {Object} s  nastavenia (nepovinné, dopĺňajú sa predvolenými)
   * @returns {{ revenue, costs:{...}, totalCost, margin, marginPct,
   *             withholding, netAfterWithholding, breakdown:[] }}
   */
  function assignmentMargin(a = {}, p = {}, s = {}) {
    const cfg = { ...DEFAULTS, ...(s || {}) };
    const hours = num(p.hours);
    const workDays = num(p.workDays);
    const isConstruction = p.workType === 'construction';

    // ── Tržba ────────────────────────────────────────────────────────────────
    const rate = num(a.charge_rate);
    const revenue = hours * rate;

    // ── Náklady ──────────────────────────────────────────────────────────────
    const gross = num(a.gross_monthly);
    const contrib = gross * (num(cfg.employer_contrib_pct) / 100);
    const perDiemRate = a.per_diem_daily != null ? num(a.per_diem_daily) : num(cfg.per_diem_de);
    const perDiem = perDiemRate * workDays;
    const accommodation = num(a.accommodation_monthly);
    const transport = num(a.transport_monthly);
    // SOKA-BAU sa platí len pri stavebných prácach spadajúcich pod VTV
    const soka = isConstruction ? gross * (num(cfg.soka_pct) / 100) : 0;

    const costs = {
      gross: r2(gross),
      contributions: r2(contrib),
      perDiem: r2(perDiem),
      accommodation: r2(accommodation),
      transport: r2(transport),
      soka: r2(soka),
    };
    const totalCost = gross + contrib + perDiem + accommodation + transport + soka;
    const margin = revenue - totalCost;

    // ── Zrážka 15 % bez Freistellungsbescheinigung §48b ──────────────────────
    // Týka sa len stavebných prác; objednávateľ zrazí z fakturovanej sumy.
    const withholdingApplies = isConstruction && p.freistellungOk === false;
    const withholding = withholdingApplies ? revenue * (num(cfg.withholding_pct) / 100) : 0;

    const breakdown = [
      ['Tržba', `${hours} h × ${r2(rate)} €`, r2(revenue)],
      ['Hrubá mzda', '', -costs.gross],
      ['Odvody zamestnávateľa', `${cfg.employer_contrib_pct} %`, -costs.contributions],
      ['Diéty', `${workDays} dní × ${r2(perDiemRate)} €`, -costs.perDiem],
    ];
    if (accommodation) breakdown.push(['Ubytovanie', '', -costs.accommodation]);
    if (transport) breakdown.push(['Doprava', '', -costs.transport]);
    if (soka) breakdown.push(['SOKA-BAU', `${cfg.soka_pct} % z hrubej`, -costs.soka]);

    return {
      revenue: r2(revenue),
      costs,
      totalCost: r2(totalCost),
      margin: r2(margin),
      marginPct: revenue > 0 ? r2((margin / revenue) * 100) : 0,
      withholding: r2(withholding),
      netAfterWithholding: r2(margin - withholding),
      breakdown,
    };
  }

  /**
   * Kontrola nemeckej minimálnej mzdy (§AEntG).
   * Porovnáva efektívnu hodinovú hrubú mzdu s odvetvovým minimom.
   *
   * @param {Object} o { grossMonthly, hours, workType, skillLevel:'werker'|'fachwerker' }
   * @returns {{ required:number, effective:number, ok:boolean, shortfall:number, basis:string }}
   */
  function minWageCheck(o = {}, s = {}) {
    const cfg = { ...DEFAULTS, ...(s || {}) };
    const hours = num(o.hours);
    const gross = num(o.grossMonthly);
    const effective = hours > 0 ? gross / hours : 0;

    let required, basis;
    if (o.workType === 'construction') {
      if (o.skillLevel === 'fachwerker') { required = num(cfg.bau_min_lg2); basis = 'Bau-Mindestlohn LG2'; }
      else { required = num(cfg.bau_min_lg1); basis = 'Bau-Mindestlohn LG1'; }
    } else {
      required = num(cfg.general_min_wage); basis = 'všeobecný Mindestlohn';
    }

    const ok = effective >= required;
    return {
      required: r2(required),
      effective: r2(effective),
      ok,
      shortfall: ok ? 0 : r2((required - effective) * hours),
      basis,
    };
  }

  /**
   * Podiel stavebných hodín — rozhoduje o povinnej účasti v SOKA-BAU (>50 %).
   * @param {Array} timesheets [{ hours, activity_type }]
   */
  function constructionShare(timesheets = []) {
    let construction = 0, total = 0;
    for (const t of timesheets) {
      const h = num(t.hours);
      if (t.activity_type === 'travel') continue;   // cesta sa do pomeru nepočíta
      total += h;
      if (t.activity_type === 'construction') construction += h;
    }
    const pct = total > 0 ? (construction / total) * 100 : 0;
    return {
      constructionHours: r2(construction),
      totalHours: r2(total),
      pct: r2(pct),
      sokaRequired: pct > 50,
    };
  }

  /**
   * Súhrn za viac nasadení — na dashboard a rozhodovanie o škálovaní.
   */
  function portfolioSummary(rows = []) {
    const sum = rows.reduce((acc, r) => {
      acc.revenue += num(r.revenue);
      acc.cost += num(r.totalCost);
      acc.margin += num(r.margin);
      return acc;
    }, { revenue: 0, cost: 0, margin: 0 });
    const count = rows.length;
    return {
      workers: count,
      revenue: r2(sum.revenue),
      cost: r2(sum.cost),
      margin: r2(sum.margin),
      marginPerWorker: count ? r2(sum.margin / count) : 0,
      marginPct: sum.revenue > 0 ? r2((sum.margin / sum.revenue) * 100) : 0,
    };
  }

  const API = { assignmentMargin, minWageCheck, constructionShare, portfolioSummary, DEFAULTS };
  if (typeof window !== 'undefined') window.DanubraMargin = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
