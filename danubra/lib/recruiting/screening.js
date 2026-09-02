// ============================================================================
// DANUBRA — vyhodnotenie skríningu kandidáta a náborového plánu
// ============================================================================
// Čisté funkcie bez závislostí, aby sa dali otestovať.
//
// Vyhodnotenie samotného hovoru sa presunulo do chips.js — tam sa neznámkuje,
// ale odškrtáva. Tu zostalo to, čo počíta peniaze a kroky náborového plánu.
// ============================================================================
(function () {
  function r1(n) { return Math.round(n * 10) / 10; }

  /**
   * Hodinová marža plánu — či sa nábor vôbec oplatí.
   * Pri SZČO je náklad priamo fakturovaná sadzba, pri zamestnancovi
   * treba prirátať odvody a réžiu (koeficient).
   */
  function planMargin(plan, opts = {}) {
    const employerCoef = opts.employerCoef ?? 1.352;   // odvody zamestnávateľa SR
    const overheadPerHour = opts.overheadPerHour ?? 0; // ubytovanie, doprava, réžia
    const offer = Number(plan.offer_rate) || 0;
    const client = Number(plan.client_rate) || 0;
    const cost = (plan.legal_form === 'employee' ? offer * employerCoef : offer) + overheadPerHour;
    const margin = client - cost;
    const people = Math.max(1, Number(plan.headcount) || 1);
    const hoursPerMonth = opts.hoursPerMonth ?? 174;
    return {
      costPerHour: r1(cost),
      marginPerHour: r1(margin),
      marginPct: client > 0 ? r1((margin / client) * 100) : 0,
      monthlyMargin: Math.round(margin * hoursPerMonth * people),
      healthy: margin > 0 && client > 0 && (margin / client) >= 0.15,
    };
  }

  /** Kroky sprievodcu — čo v pláne ešte chýba, aby sa dal spustiť. */
  const PLAN_STEPS = [
    { step: 1, title: 'Koho a koľko', check: p => !!p.trade_key && (p.headcount || 0) > 0 },
    { step: 2, title: 'Kam a kedy', check: p => !!p.city && !!p.start_date },
    { step: 3, title: 'Za koľko', check: p => (p.offer_rate || 0) > 0 && (p.client_rate || 0) > 0 },
    { step: 4, title: 'Čo overím', check: p => (p.screening_count || 0) > 0 },
    { step: 5, title: 'Kde to zverejním', check: p => (p.channels || []).length > 0 && !!p.ad_text },
  ];

  function planProgress(plan) {
    const steps = PLAN_STEPS.map(s => ({ step: s.step, title: s.title, done: !!s.check(plan || {}) }));
    const done = steps.filter(s => s.done).length;
    const next = steps.find(s => !s.done) || null;
    return { steps, done, total: steps.length, percent: Math.round((done / steps.length) * 100), next, ready: done === steps.length };
  }

  /**
   * Minimálna mzda: pod Bau-Mindestlohn sa ísť nedá ani cez živnosť —
   * pri kontrole sa skúma obsah práce, nie názov zmluvy.
   */
  const MIN_WAGE = { LG1: 15.86, LG2: 17.34, general: 13.90 };

  function checkOfferRate(plan, trade) {
    const rate = Number(plan.offer_rate) || 0;
    const lg = (trade && trade.lohngruppe) || plan.lohngruppe || 'LG1';
    const floor = MIN_WAGE[lg] ?? MIN_WAGE.general;
    if (!rate) return { ok: false, floor, message: 'Sadzba nie je zadaná.' };
    if (rate < floor) {
      return { ok: false, floor,
        message: `Ponúkaná sadzba ${rate} €/h je pod stavebnou minimálnou mzdou ${floor} €/h (${lg}). `
          + 'Pri kontrole to nezachráni ani živnosť — rozhoduje skutočný obsah práce.' };
    }
    return { ok: true, floor, message: null };
  }

  /** Text inzerátu — to, čo ľudí naozaj zaujíma, hneď v prvých riadkoch. */
  function adText(plan, trade) {
    const name = (trade && trade.name_sk) || 'Pracovník na stavbu';
    const where = [plan.city, plan.country === 'DE' ? 'Nemecko' : plan.country].filter(Boolean).join(', ');
    const lines = [];
    lines.push(`${name} — ${where}`);
    lines.push('');
    if (plan.offer_rate) lines.push(`Sadzba: ${plan.offer_rate} €/h${plan.legal_form === 'szco' ? ' (živnosť)' : ' (zamestnanecký pomer)'}`);
    if (plan.start_date) {
      const [y, m, d] = String(plan.start_date).slice(0, 10).split('-');
      lines.push(`Nástup: ${d}.${m}.${y}`);
    }
    if (plan.headcount) lines.push(`Hľadáme ${plan.headcount} ${plan.headcount === 1 ? 'človeka' : 'ľudí'}`);
    lines.push('');
    if (plan.accommodation_provided) lines.push('· Ubytovanie zabezpečíme a platíme my');
    if (plan.transport_provided) lines.push('· Dopravu zabezpečíme');
    if (plan.advance_possible) lines.push('· Záloha pred prvou výplatou po dohode');
    lines.push('· Výplata načas, každý mesiac — bez výnimky');
    lines.push('· Papierovačky (A1, prihlášky) vybavíme za vás');
    if (trade && (trade.work_scope || []).length) {
      lines.push('');
      lines.push('Práca:');
      for (const w of trade.work_scope.slice(0, 4)) lines.push(`· ${w}`);
    }
    if (trade && (trade.certificates || []).length) {
      lines.push('');
      lines.push(`Potrebujete: ${trade.certificates.join(', ')}.`);
    }
    lines.push('');
    lines.push('Napíšte alebo zavolajte — ozveme sa do desiatich minút.');
    return lines.join('\n');
  }

  const API = { planMargin, planProgress, checkOfferRate, adText, PLAN_STEPS, MIN_WAGE };
  if (typeof window !== 'undefined') window.DanubraScreening = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
