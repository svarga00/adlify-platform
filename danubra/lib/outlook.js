// ============================================================================
// DANUBRA — výhľad: čo máme, čo príde, čo odíde a čo z toho zostane
// ============================================================================
// Prehľad dovtedy ukazoval počty. Počet faktúr nie je odpoveď na otázku,
// ktorá sa pýta každý týždeň: **koľko peňazí čakáme a vyjde to?**
//
// Rozlišujú sa štyri veci, ktoré sa v praxi zlievajú do jednej:
//
//   čakáme        vystavené faktúry, ktoré ešte neprišli. Má dátum
//                 splatnosti, takže sa dá dať do výhľadu.
//   nevyfakturované  hodiny, ktoré sú odrobené, ale faktúra z nich ešte
//                 nevznikla. Sú to naše peniaze, ale **termín nemajú** —
//                 do týždenného výhľadu preto nepatria.
//   v objednávkach  čo je dohodnuté a ešte sa to neodrobilo.
//   viazne        náklady, ktoré sa vrátia refakturáciou. Nie je to
//                 strata, ale teraz nám tie peniaze chýbajú.
//
// Miešať ich znamená buď sa tešiť predčasne, alebo sa zbytočne báť.
//
// Peniaze sú v centoch (rozhodnutie R2).
//
// Testy: node danubra/lib/outlook.test.js
// ============================================================================
(function () {
  const M = (typeof module !== 'undefined' && module.exports)
    ? require('./money') : window.Money;

  const day = (s) => (s ? String(s).slice(0, 10) : null);
  const today0 = () => new Date().toISOString().slice(0, 10);

  /** Faktúra, ktorá ešte nie je vybavená. */
  const SETTLED = ['paid', 'cancelled', 'draft'];
  const isOpenInvoice = (i) => !!i && !SETTLED.includes(i.status);

  function addDays(d, n) {
    const t = new Date(String(d).slice(0, 10) + 'T00:00:00Z');
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  }

  // ── Čo čakáme na účet ─────────────────────────────────────────────────────
  /**
   * Vystavené faktúry, ktoré ešte neprišli.
   *
   * `net` je to, čo naozaj pristane na účte — po zrážke §48b. Odberateľ ju
   * odvedie nemeckému finančnému úradu a nám príde menej. Tešiť sa na
   * hrubú sumu je najčastejší omyl v tomto biznise.
   */
  function receivable(invoices, today = today0()) {
    const open = (invoices || []).filter(isOpenInvoice);
    const gross = M.sum(open.map(i => M.toCents(i.total)));
    const withheld = M.sum(open.map(i => M.toCents(i.withholding_amount)));
    const overdueRows = open.filter(i => day(i.due_date) && day(i.due_date) < today);
    return {
      gross,
      withheld,
      net: M.sub(gross, withheld),
      overdue: M.sum(overdueRows.map(i => M.toCents(i.amount_net ?? i.total))),
      count: open.length,
      overdueCount: overdueRows.length,
      rows: open,
    };
  }

  // ── Odrobené, ale nevyfakturované ─────────────────────────────────────────
  /**
   * Hodiny bez uzavretého obdobia. Ocenené tým, čo za ne fakturujeme
   * odberateľovi, a tým, čo za ne platíme živnostníkovi — rozdiel je marža,
   * ktorá ešte nikde nefiguruje.
   *
   * Termín to nemá: kým sa obdobie neuzavrie a faktúra nevystaví, nedá sa
   * povedať, kedy peniaze prídu. Preto sa to do týždenného výhľadu nedáva.
   */
  function unbilled(o = {}) {
    const asg = new Map((o.assignments || []).map(a => [a.id, a]));
    const subs = new Map((o.subcontracts || []).map(s => [s.id, s]));
    let hours = 0, charge = 0, cost = 0;
    const bySite = new Map();

    for (const t of (o.timesheets || [])) {
      if (!t || t.period_id) continue;             // už zúčtované
      const h = Number(t.hours) || 0;
      if (!h) continue;
      const a = asg.get(t.assignment_id);
      const s = a ? subs.get(a.subcontract_id) : null;

      const chargeRate = M.toCents((a && a.charge_rate) ?? (s && s.charge_rate) ?? 0);
      const workerRate = M.toCents((t.rate_used) ?? (a && a.worker_rate) ?? 0);

      hours += h;
      const c = M.mul(chargeRate, h);
      const w = M.mul(workerRate, h);
      charge += c; cost += w;

      if (s) {
        const cur = bySite.get(s.id) || { id: s.id, title: s.title, hours: 0, charge: 0, cost: 0 };
        cur.hours += h; cur.charge += c; cur.cost += w;
        bySite.set(s.id, cur);
      }
    }
    const rows = [...bySite.values()]
      .map(r => ({ ...r, hours: Math.round(r.hours * 100) / 100, margin: M.sub(r.charge, r.cost) }))
      .sort((a, b) => b.charge - a.charge);

    return {
      hours: Math.round(hours * 100) / 100,
      charge, cost, margin: M.sub(charge, cost), rows,
    };
  }

  // ── Peniaze viazané v refakturovateľných nákladoch ────────────────────────
  /**
   * Ubytovanie a doprava, ktoré sa vrátia, ale zatiaľ sú von. Nie je to
   * strata — ale v cash-flow tie peniaze teraz chýbajú a treba to vedieť.
   */
  function tied(costs) {
    const open = (costs || []).filter(c => c && c.rebillable && !c.rebilled_invoice_id);
    const byCategory = new Map();
    for (const c of open) {
      const k = c.category || 'other';
      byCategory.set(k, M.add(byCategory.get(k) || 0, M.toCents(c.amount)));
    }
    return {
      total: M.sum(open.map(c => M.toCents(c.amount))),
      count: open.length,
      byCategory: [...byCategory.entries()]
        .map(([category, cents]) => ({ category, cents }))
        .sort((a, b) => b.cents - a.cents),
    };
  }

  // ── Čo máme v objednávkach ────────────────────────────────────────────────
  /**
   * Dohodnutá práca, ktorá sa ešte neodrobila ani nevyfakturovala.
   *
   * Počíta sa z **pracovných dní, ktoré na zákazke zostávajú**, a z ľudí,
   * ktorí sú na nej nasadení. Je to odhad a treba ho tak aj čítať — preto
   * vracia aj `days` a `people`, aby bolo vidieť, z čoho vyšiel.
   */
  function orderBook(o = {}) {
    const today = o.today || today0();
    const hoursPerDay = Number(o.hoursPerDay) || 8;
    const active = (o.subcontracts || []).filter(s => s && s.status === 'active');
    const rows = [];

    for (const s of active) {
      const people = (o.assignments || [])
        .filter(a => a.subcontract_id === s.id && a.status === 'active').length;
      const end = day(s.date_to);
      const days = end && end > today ? workdaysBetween(today, end) : 0;

      const chargeRate = M.toCents(s.charge_rate);
      const remaining = people && days && chargeRate
        ? M.mul(chargeRate, people * days * hoursPerDay) : 0;

      rows.push({
        id: s.id, title: s.title, partner_id: s.partner_id,
        people, days, remaining, date_to: end,
      });
    }
    rows.sort((a, b) => b.remaining - a.remaining);
    return {
      rows,
      remaining: M.sum(rows.map(r => r.remaining)),
      sites: rows.length,
      people: rows.reduce((n, r) => n + r.people, 0),
      hoursPerDay,
    };
  }

  /** Pracovné dni medzi dátumami (vrátane konca). Víkendy sa nerátajú. */
  function workdaysBetween(from, to) {
    let n = 0;
    const end = new Date(String(to).slice(0, 10) + 'T00:00:00Z');
    const cur = new Date(String(from).slice(0, 10) + 'T00:00:00Z');
    // Poistka proti nezmyselnému rozsahu — päť rokov dopredu nikto neplánuje.
    let guard = 0;
    while (cur <= end && guard++ < 2000) {
      const d = cur.getUTCDay();
      if (d !== 0 && d !== 6) n++;
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return n;
  }

  // ── Týždenný výhľad ───────────────────────────────────────────────────────
  /**
   * Príjmy, výdaje a rozdiel po týždňoch. Vstupom je pohľad `v_cashflow`,
   * takže sú v tom len veci, ktoré **majú dátum**: vystavené faktúry,
   * prijaté faktúry a plánované náklady.
   *
   * Po splatnosti sa počíta do prvého týždňa — sú to peniaze, ktoré mali
   * prísť dávno, nie budúcnosť.
   */
  function weeks(o = {}) {
    const today = o.today || today0();
    const n = Number(o.weeks) || 4;
    let balance = o.balance || 0;

    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        week: i + 1,
        from: addDays(today, i * 7),
        to: addDays(today, (i + 1) * 7 - 1),
        in: 0, out: 0, items: [],
      });
    }
    const overdue = { in: 0, out: 0, items: [] };

    for (const it of (o.items || [])) {
      if (!it) continue;
      const cents = M.toCents(it.amount);
      const when = day(it.expected_on);
      const target = when && when < today
        ? overdue
        : out.find(b => when >= b.from && when <= b.to);
      if (!target) continue;                       // mimo výhľadu
      if (cents >= 0) target.in += cents; else target.out += cents;
      target.items.push(it);
    }

    balance += overdue.in + overdue.out;
    let running = balance;
    let lowest = { balance: running, week: 0 };
    for (const b of out) {
      b.diff = b.in + b.out;                       // `out` je záporné
      running += b.diff;
      b.balance = running;
      if (running < lowest.balance) lowest = { balance: running, week: b.week };
    }

    return {
      today, weeks: out, overdue,
      startBalance: o.balance || 0,
      afterOverdue: balance,
      endBalance: running,
      totalIn: M.sum(out.map(b => b.in)),
      totalOut: M.sum(out.map(b => b.out)),
      diff: M.sub(M.sum(out.map(b => b.in)), -M.sum(out.map(b => b.out))),
      lowest,
      negativeFrom: out.find(b => b.balance < 0) || null,
    };
  }

  // ── Koho a kam treba zohnať ───────────────────────────────────────────────
  /**
   * Otvorené nábory zhrnuté podľa mesta. „Treba 4 ľudí" je menej užitočné
   * než „4 do Stuttgartu, z toho 2 do konca mesiaca".
   */
  function hiring(o = {}) {
    const today = o.today || today0();
    const active = (o.plans || []).filter(p => p && p.status === 'active');
    const subs = new Map((o.subcontracts || []).map(s => [s.id, s]));
    const byCity = new Map();

    for (const p of active) {
      const s = p.subcontract_id ? subs.get(p.subcontract_id) : null;
      const city = p.city || (s && s.site_city) || 'bez miesta';
      const cur = byCity.get(city) || { city, headcount: 0, plans: [], urgent: 0 };
      cur.headcount += Number(p.headcount) || 0;
      // „Súrne" znamená, že nástup je do dvoch týždňov alebo je po termíne.
      const when = day(p.start_date) || day(p.deadline);
      if (when && when <= addDays(today, 14)) cur.urgent += Number(p.headcount) || 0;
      cur.plans.push({ ...p, site: s ? s.title : null });
      byCity.set(city, cur);
    }
    const rows = [...byCity.values()].sort((a, b) => b.headcount - a.headcount);
    return {
      rows,
      headcount: rows.reduce((n, r) => n + r.headcount, 0),
      urgent: rows.reduce((n, r) => n + r.urgent, 0),
      plans: active.length,
    };
  }

  // ── Očakávaný zisk ────────────────────────────────────────────────────────
  /**
   * Skladá sa z troch vrstiev podľa toho, **ako isté to je**. Miešať ich do
   * jedného čísla by znamenalo tešiť sa z ponuky, ktorú nikto neprijal.
   *
   *   done        marža z odrobeného a nevyfakturovaného — najistejšia
   *   contracted  marža z bežiacich zákaziek, ktoré sa ešte neodrobili
   *   pipeline    marža z odoslaných ponúk, ktoré nikto neprijal
   */
  function expectedProfit(o = {}) {
    const done = (o.unbilled && o.unbilled.margin) || 0;

    // Bežiace zákazky: marža na hodinu × zostávajúce hodiny. Marža sa berie
    // z **nasadení**, nie z odhadu — tam je zapísané, čo komu naozaj
    // platíme. Nasadenie bez sadzby sa vynechá; radšej nižšie číslo než
    // vymyslené.
    const book = o.orderBook || { rows: [], hoursPerDay: 8 };
    const subs = new Map((o.subcontracts || []).map(s => [s.id, s]));
    let contracted = 0;
    for (const r of book.rows) {
      const s = subs.get(r.id);
      if (!s || !r.days) continue;
      const crew = (o.assignments || []).filter(a =>
        a.subcontract_id === r.id && a.status === 'active' && a.worker_rate != null);
      for (const a of crew) {
        const charge = M.toCents(a.charge_rate ?? s.charge_rate);
        const per = M.sub(charge, M.toCents(a.worker_rate));
        contracted += M.mul(per, r.days * book.hoursPerDay);
      }
    }

    const sent = (o.quotes || []).filter(q => q && q.status === 'sent');
    const pipeline = M.sum(sent.map(q => M.toCents(q.margin_per_month)));

    return {
      done, contracted, pipeline,
      likely: M.add(done, contracted),
      all: M.add(M.add(done, contracted), pipeline),
      quotesSent: sent.length,
    };
  }

  const API = {
    isOpenInvoice, addDays, workdaysBetween,
    receivable, unbilled, tied, orderBook, weeks, hiring, expectedProfit,
  };
  if (typeof window !== 'undefined') window.DanubraOutlook = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
