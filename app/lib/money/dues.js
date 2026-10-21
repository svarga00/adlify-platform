// ============================================================================
// DANUBRA — čo zaplatiť a na čo čakáme
// ============================================================================
// „Chcem mať poriadok v prijatých a vydaných faktúrach — čo máme platiť
// a čo čakáme."
//
// Dve kolónky vedľa seba, každá po termínoch:
//
//   ZAPLATIŤ (prijaté faktúry)        ČAKÁME (vydané faktúry)
//   po splatnosti                     po splatnosti — koľko dní
//   tento týždeň (do 7 dní)           tento týždeň
//   neskôr                            neskôr
//   bez splatnosti                    bez splatnosti
//
// Čo sa ráta:
//   • zaplatiť: prijatá, skontrolovaná, schválená, sporná (sporná je tiež
//     dlh, len ešte nie v správnej výške). Nahratá na kontrolu sa nepočíta
//     do súm, ale povie sa, koľko ich čaká — kým ich človek nepotvrdí, nie
//     je isté, že sú správne.
//   • čakáme: vystavená, odoslaná, po splatnosti. Ráta sa suma, ktorá
//     reálne príde (po zrážke §48b).
//
// Peniaze v centoch (lib/money.js). Čisté funkcie, testy:
//   node app/lib/money/dues.test.js
// ============================================================================
(function () {
  const M = (typeof module !== 'undefined' && module.exports)
    ? require('../money') : window.Money;

  const den = (d) => (d ? String(d).slice(0, 10) : null);
  const plusDni = (iso, n) => {
    const t = new Date(`${iso}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  const dniMedzi = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

  const SKUPINY = [
    { key: 'late', label: 'Po splatnosti' },
    { key: 'week', label: 'Tento týždeň' },
    { key: 'later', label: 'Neskôr' },
    { key: 'none', label: 'Bez splatnosti' },
  ];

  const PLATIT = ['received', 'checked', 'approved', 'disputed'];
  const CAKAT = ['issued', 'sent', 'overdue'];

  /** Do ktorej skupiny riadok patrí podľa splatnosti. */
  function skupina(due, today) {
    if (!due) return 'none';
    if (due < today) return 'late';
    if (due <= plusDni(today, 7)) return 'week';
    return 'later';
  }

  function zoskup(rows, today) {
    const groups = SKUPINY.map(g => ({ ...g, rows: [], cents: 0 }));
    const by = new Map(groups.map(g => [g.key, g]));
    for (const r of rows) {
      const g = by.get(skupina(r.due, today));
      g.rows.push(r); g.cents += r.cents;
    }
    for (const g of groups) {
      g.rows.sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')) || b.cents - a.cents);
    }
    return groups;
  }

  /**
   * @param {Object} o
   *   bills, invoices — riadky z databázy
   *   today           — RRRR-MM-DD
   *   workerName(id), partnerName(id) — mená (nepovinné)
   */
  function dues(o = {}) {
    const today = den(o.today) || new Date().toISOString().slice(0, 10);
    const wn = o.workerName || (() => null);
    const pn = o.partnerName || (() => null);

    const pay = (o.bills || []).filter(b => b && PLATIT.includes(b.status)).map(b => {
      const due = den(b.due_date) || (den(b.issue_date) ? plusDni(den(b.issue_date), 14) : null);
      return {
        type: 'bill', id: b.id, who: wn(b.worker_id) || b.supplier_name || 'Dodávateľ',
        number: b.bill_number || null, due, guessedDue: !den(b.due_date) && !!due,
        cents: M.toCents(b.amount), status: b.status,
        late: due && due < today ? dniMedzi(due, today) : 0,
        iban: b.supplier_iban || null, vs: b.variable_symbol || null,
        ready: b.status === 'approved',
      };
    });

    const wait = (o.invoices || []).filter(i => i && CAKAT.includes(i.status)).map(i => {
      const due = den(i.due_date);
      return {
        type: 'invoice', id: i.id, who: pn(i.partner_id) || i.client_name || 'Odberateľ',
        number: i.invoice_number || null, due,
        cents: M.toCents(i.amount_net != null ? i.amount_net : i.total), status: i.status,
        late: due && due < today ? dniMedzi(due, today) : 0,
      };
    });

    const review = (o.bills || []).filter(b => b && b.status === 'review').length;
    const sum = (rows) => rows.reduce((s, r) => s + r.cents, 0);
    const payGroups = zoskup(pay, today), waitGroups = zoskup(wait, today);

    return {
      today,
      pay: { groups: payGroups, total: sum(pay), count: pay.length,
        late: payGroups[0].cents, ready: pay.filter(r => r.ready), review },
      wait: { groups: waitGroups, total: sum(wait), count: wait.length, late: waitGroups[0].cents },
      // Čo z toho vyplýva na najbližší týždeň: čo príde mínus čo treba zaplatiť.
      week: (waitGroups[0].cents + waitGroups[1].cents) - (payGroups[0].cents + payGroups[1].cents),
    };
  }

  /** Jedna veta k prehľadu — čo je najnaliehavejšie. */
  function sentence(d) {
    if (!d) return '';
    const casti = [];
    if (d.pay.late) casti.push(`zaplatiť po splatnosti ${M.format(d.pay.late)}`);
    if (d.wait.late) casti.push(`odberatelia meškajú s ${M.format(d.wait.late)}`);
    if (d.pay.review) casti.push(`${d.pay.review} ${d.pay.review === 1 ? 'nahratá faktúra čaká' : d.pay.review < 5 ? 'nahraté faktúry čakajú' : 'nahratých faktúr čaká'} na kontrolu`);
    if (!casti.length) {
      return d.pay.count || d.wait.count ? 'Nič nie je po splatnosti.' : 'Nič nečaká na zaplatenie ani na úhradu.';
    }
    const s = casti.join(', ');
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  }

  const API = { SKUPINY, skupina, dues, sentence };
  if (typeof window !== 'undefined') window.DanubraDues = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
