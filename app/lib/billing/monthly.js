// ============================================================================
// DANUBRA — mesačná fakturácia naraz
// ============================================================================
// „Mesačná faktúra naraz" — na konci mesiaca sa za každú zákazku musí
// založiť obdobie, uzavrieť ho a z neho vystaviť návrh faktúry. Po jednej to
// sú tri kliky na zákazku na troch rôznych miestach.
//
// Tu sa pre zvolený mesiac spočíta plán: pri každej zákazke, čo treba spraviť
// (založiť obdobie → uzavrieť → faktúra), koľko hodín a za koľko. Vykonanie
// je v `invoices.js`; sumy počíta databáza pri uzávierke, nie táto funkcia.
//
// Testy: node app/lib/billing/monthly.test.js
// ============================================================================
(function () {
  // Obdobia sa v prehliadači načítavajú až za touto knižnicou — preto až pri použití.
  const P = () => ((typeof require !== 'undefined' && typeof module !== 'undefined')
    ? require('../staffing/periods.js') : window.DanubraPeriods);
  const Money = (typeof require !== 'undefined' && typeof module !== 'undefined')
    ? require('../money.js') : window.Money;

  const day = (s) => (s ? String(s).slice(0, 10) : null);
  const prekryva = (p, from, to) => day(p.period_from) <= to && day(p.period_to) >= from;

  /** Hranice mesiaca z „2026-10" alebo z dátumu. */
  function monthRange(ym) {
    const m = String(ym || '').match(/^(\d{4})-(\d{2})/);
    const base = m ? `${m[1]}-${m[2]}-01` : new Date().toISOString().slice(0, 8) + '01';
    return { from: P().firstOfMonth(base), to: P().lastOfMonth(base) };
  }

  /** Predchádzajúci mesiac — fakturuje sa spravidla po skončení mesiaca. */
  function previousMonth(today) {
    const d = day(today) || new Date().toISOString().slice(0, 10);
    const [y, mo] = d.split('-').map(Number);
    const py = mo === 1 ? y - 1 : y, pm = mo === 1 ? 12 : mo - 1;
    return `${py}-${String(pm).padStart(2, '0')}`;
  }

  /**
   * Plán na mesiac. Pre každú zákazku jeden riadok:
   *   action: 'create'  — obdobie neexistuje, hodiny sú → založiť, uzavrieť, faktúra
   *           'close'   — obdobie je otvorené → uzavrieť, faktúra
   *           'invoice' — obdobie je uzavreté bez faktúry → faktúra
   *           'done'    — už vyfakturované
   *           'skip'    — nie je čo (žiadne schválené hodiny) alebo niečo bráni
   */
  function plan(o = {}) {
    const { from, to } = o.from && o.to ? { from: day(o.from), to: day(o.to) } : monthRange(o.month);
    const subs = (o.subcontracts || []).filter(s => s && !['lost', 'cancelled', 'draft'].includes(s.status));
    const asgBySub = new Map();
    for (const a of (o.assignments || [])) {
      if (!asgBySub.has(a.subcontract_id)) asgBySub.set(a.subcontract_id, []);
      asgBySub.get(a.subcontract_id).push(a);
    }
    const fakturovane = new Set((o.invoices || []).filter(i => i && i.status !== 'cancelled' && i.period_id).map(i => i.period_id));

    return subs.map((sc) => {
      const asg = asgBySub.get(sc.id) || [];
      const ids = new Set(asg.map(a => a.id));
      const ts = (o.timesheets || []).filter(t => ids.has(t.assignment_id));
      const per = (o.periods || []).filter(p => p.subcontract_id === sc.id && prekryva(p, from, to));
      const pv = P().preview({ timesheets: ts, assignments: asg, from, to });
      const riadok = { subcontract: sc, from, to, preview: pv, hours: pv.totalHours, cents: pv.charged,
        unapproved: pv.unapproved.length };

      const presne = per.find(p => day(p.period_from) === from && day(p.period_to) === to);
      const ine = per.filter(p => p !== presne);
      if (presne) {
        if (fakturovane.has(presne.id) || presne.status === 'invoiced') return { ...riadok, action: 'done', period: presne, why: 'Už vyfakturované.' };
        if (presne.status === 'closed') {
          return { ...riadok, action: 'invoice', period: presne, cents: Money.toCents(presne.amount_charged),
            hours: Number(presne.hours_construction || 0) + Number(presne.hours_workshop || 0) + Number(presne.hours_travel || 0),
            why: 'Obdobie je uzavreté, chýba faktúra.' };
        }
        if (!pv.totalHours) return { ...riadok, action: 'skip', period: presne, why: pv.unapproved.length ? 'Hodiny čakajú na schválenie.' : 'V mesiaci nie sú žiadne hodiny.' };
        return { ...riadok, action: 'close', period: presne, why: 'Obdobie je otvorené — uzavrie sa a vznikne faktúra.' };
      }
      if (ine.length) return { ...riadok, action: 'skip', why: 'Zákazka má v tomto mesiaci iné obdobie — rieši sa v nej ručne.' };
      if (!pv.totalHours) return { ...riadok, action: 'skip', why: pv.unapproved.length ? 'Hodiny čakajú na schválenie.' : 'V mesiaci nie sú žiadne hodiny.' };
      return { ...riadok, action: 'create', why: 'Založí sa obdobie za mesiac, uzavrie a vznikne faktúra.' };
    }).sort((a, b) => ['create', 'close', 'invoice', 'skip', 'done'].indexOf(a.action)
      - ['create', 'close', 'invoice', 'skip', 'done'].indexOf(b.action) || (b.cents - a.cents));
  }

  const API = { plan, monthRange, previousMonth };
  if (typeof window !== 'undefined') window.DanubraMonthly = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
