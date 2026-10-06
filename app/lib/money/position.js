// ============================================================================
// DANUBRA — kde čakajú peniaze a koľko sa dá minúť
// ============================================================================
// Appka vedela povedať „čakáme na účet 7 854 €". To je jedno číslo zlepené
// zo šiestich veľmi rôznych vecí — a každá z nich sa rieši inak:
//
//   odrobené, ale obdobie je otvorené   → uzavrieť obdobie
//   obdobie uzavreté, faktúra nie je    → vystaviť faktúru
//   faktúra čaká na schválenie          → schváliť (len administrátor)
//   vystavená, v splatnosti             → nič, čaká sa
//   po splatnosti                       → zavolať
//   zrazené podľa §48b                  → vráti sa cez daňové priznanie
//
// Zlepené dokopy to vyzerá, že peniaze sú na ceste. Pritom prvé tri položky
// na ceste nie sú — stoja na nás. Preto sa tu nepočíta jedno číslo, ale
// **reťazec štádií**, a pri každom je napísané, čo s ním treba spraviť.
//
// Druhá otázka je praktickejšia: **koľko môžem minúť a dokedy.** Odpoveď nie
// je zostatok na účte. Je to najnižší bod výhľadu po odrátaní všetkého, čo
// musí odísť — lebo peniaze sa míňajú dnes, ale záväzky dobehnú o tri týždne.
//
// Dve pravidlá, podľa ktorých sa to počíta, a obe sú zámerne opatrné:
//
//   * **Faktúra po splatnosti sa do príjmu neráta.** Mala prísť a neprišla;
//     stavať na nej rozpočet znamená minúť peniaze, ktoré možno nikdy
//     neprídu. Je vidieť zvlášť.
//   * **Odrobené a nevyfakturované sa neráta vôbec.** Nemá termín, takže
//     v týždennom výhľade nemá kde stáť.
//
// Peniaze sú v centoch (rozhodnutie R2).
//
// Testy: node app/lib/money/position.test.js
// ============================================================================
(function () {
  const M = (typeof module !== 'undefined' && module.exports)
    ? require('../money') : window.Money;

  const day = (s) => (s ? String(s).slice(0, 10) : null);
  const arr = (v) => (Array.isArray(v) ? v : []);
  const CALM = 'calm', WATCH = 'watch', BAD = 'bad';

  function addDays(d, n) {
    const t = new Date(String(d).slice(0, 10) + 'T00:00:00Z');
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  }
  function dni(a, b) {
    if (!a || !b) return null;
    const t = (s) => Date.parse(String(s).slice(0, 10) + 'T00:00:00Z');
    const x = t(a), y = t(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return Math.round((x - y) / 86400000);
  }
  /** Bezpečný prevod na centy — rozbitá hodnota z databázy nesmie zhodiť stránku. */
  function cents(v) {
    try { return M.toCents(v); } catch { return 0; }
  }

  const SETTLED = ['paid', 'cancelled', 'draft'];
  const openInvoice = (i) => !!i && !SETTLED.includes(i.status);

  // ── Kde čakajú naše peniaze ───────────────────────────────────────────────
  // Poradie je poradie reťazca: čím vyššie, tým skôr v ceste — a tým skôr sa
  // to dá pohnúť vlastnou rukou.
  const STAGES = [
    {
      key: 'unbilled',
      label: 'Odrobené, obdobie otvorené',
      lead: 'Hodiny sú zapísané, ale obdobie sa ešte neuzavrelo. Faktúra z nich zatiaľ nevznikne.',
      todo: 'Uzavrieť obdobie na zákazke.',
      dated: false,
      rows(x) {
        const bezia = new Map(arr(x.subcontracts)
          .filter(s => s.status === 'active').map(s => [s.id, s]));
        const asg = new Map(arr(x.assignments).map(a => [a.id, a]));
        const podla = new Map();
        for (const t of arr(x.timesheets)) {
          if (t.period_id) continue;
          const a = asg.get(t.assignment_id);
          const sc = a ? bezia.get(a.subcontract_id) : null;
          if (!sc) continue;
          const sadzba = cents(a.charge_rate != null ? a.charge_rate : sc.charge_rate);
          const hodin = Number(t.hours) || 0;
          let g = podla.get(sc.id);
          if (!g) { g = { sc, hodin: 0, suma: 0, najstarsi: null }; podla.set(sc.id, g); }
          g.hodin += hodin;
          g.suma += Math.round(sadzba * hodin);
          const d = day(t.work_date);
          if (d && (!g.najstarsi || d < g.najstarsi)) g.najstarsi = d;
        }
        return [...podla.values()].map(g => ({
          id: g.sc.id,
          open: { type: 'subcontract', id: g.sc.id },
          title: g.sc.title || g.sc.contract_number || '—',
          sub: `${Math.round(g.hodin * 10) / 10} h`,
          cents: g.suma,
          date: g.najstarsi,
          tone: (x.today && g.najstarsi && dni(x.today, g.najstarsi) >= 30) ? 'warn' : '',
        })).sort((a, b) => b.cents - a.cents);
      },
    },
    {
      key: 'toinvoice',
      label: 'Obdobie uzavreté, faktúra nie je',
      lead: 'Podklad je hotový a zmrazený. Chýba už len faktúra.',
      todo: 'Vystaviť faktúru z uzavretého obdobia.',
      dated: false,
      rows(x) {
        const fakturovane = new Set(arr(x.invoices).map(i => i.period_id).filter(Boolean));
        const site = (id) => arr(x.subcontracts).find(s => s.id === id);
        return arr(x.periods)
          .filter(p => p.status === 'closed' && !fakturovane.has(p.id))
          .map((p) => {
            const sc = site(p.subcontract_id);
            return {
              id: p.id,
              open: sc ? { type: 'subcontract', id: sc.id } : null,
              title: sc ? (sc.title || sc.contract_number || '—') : '—',
              sub: `${p.period_from || '?'} – ${p.period_to || '?'}`,
              cents: cents(p.amount_charged),
              date: day(p.period_to),
              tone: 'warn',
            };
          })
          .sort((a, b) => b.cents - a.cents);
      },
    },
    {
      key: 'approval',
      label: 'Faktúra čaká na schválenie',
      lead: 'Bez schválenia sa nevystaví ani neodošle. Toto je jediné miesto, kde to viazne na nás.',
      todo: 'Schváliť faktúru (môže len administrátor).',
      dated: false,
      rows(x) {
        return arr(x.invoices).filter(i => i.status === 'pending_approval').map(i => ({
          id: i.id,
          open: { type: 'invoice', id: i.id },
          title: i.invoice_number || '(bez čísla)',
          sub: x.partnerName ? (x.partnerName(i.partner_id) || '') : '',
          cents: cents(i.total),
          date: day(i.due_date),
          tone: 'warn',
        })).sort((a, b) => b.cents - a.cents);
      },
    },
    {
      key: 'due',
      label: 'Vystavená, v splatnosti',
      lead: 'Odišla odberateľovi a termín ešte neuplynul. Tu sa nerobí nič, len čaká.',
      todo: '',
      dated: true,
      rows(x) {
        const dnes = x.today;
        return arr(x.invoices)
          .filter(i => openInvoice(i) && i.status !== 'pending_approval'
            && i.due_date && day(i.due_date) >= dnes)
          .map(i => ({
            id: i.id,
            open: { type: 'invoice', id: i.id },
            title: i.invoice_number || '(bez čísla)',
            sub: x.partnerName ? (x.partnerName(i.partner_id) || '') : '',
            // To, čo naozaj príde na účet — po zrážke §48b.
            cents: cents(i.amount_net != null ? i.amount_net : i.total),
            date: day(i.due_date),
            tone: '',
          }))
          .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      },
    },
    {
      key: 'overdue',
      label: 'Po splatnosti',
      lead: 'Malo prísť a neprišlo. Do výhľadu sa to neráta — rozpočet sa na tom stavať nedá.',
      todo: 'Zavolať odberateľovi.',
      dated: true,
      rows(x) {
        const dnes = x.today;
        return arr(x.invoices)
          .filter(i => openInvoice(i) && i.due_date && day(i.due_date) < dnes)
          .map((i) => {
            const meska = dni(dnes, i.due_date);
            return {
              id: i.id,
              open: { type: 'invoice', id: i.id },
              title: i.invoice_number || '(bez čísla)',
              sub: [x.partnerName ? x.partnerName(i.partner_id) : '',
                meska != null ? `mešká ${meska} dní` : ''].filter(Boolean).join(' · '),
              cents: cents(i.amount_net != null ? i.amount_net : i.total),
              date: day(i.due_date),
              tone: meska != null && meska >= 30 ? 'bad' : 'warn',
            };
          })
          .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      },
    },
    {
      key: 'withheld',
      label: 'Zrazené odberateľom (§48b)',
      lead: 'Pätnásť percent z faktúry, ktoré odberateľ odviedol nemeckému úradu namiesto nám. '
        + 'Nie sú stratené — vracajú sa cez daňové priznanie, ale nie tento mesiac.',
      todo: 'Vybaviť Freistellungsbescheinigung a zrážka prestane.',
      dated: false,
      rows(x) {
        return arr(x.invoices)
          .filter(i => openInvoice(i) && cents(i.withholding_amount) > 0)
          .map(i => ({
            id: i.id,
            open: { type: 'invoice', id: i.id },
            title: i.invoice_number || '(bez čísla)',
            sub: x.partnerName ? (x.partnerName(i.partner_id) || '') : '',
            cents: cents(i.withholding_amount),
            date: day(i.due_date),
            tone: '',
          }))
          .sort((a, b) => b.cents - a.cents);
      },
    },
    {
      key: 'tied',
      label: 'Viazne v refakturovateľných nákladoch',
      lead: 'Zaplatili sme to my a má sa to vrátiť refakturáciou. Kým to nie je na faktúre, '
        + 'sú to naše peniaze u niekoho iného.',
      todo: 'Dať náklad na vydanú faktúru.',
      dated: false,
      rows(x) {
        return arr(x.costs)
          .filter(c => c.rebillable && !c.rebilled_invoice_id)
          .map(c => ({
            id: c.id,
            open: c.subcontract_id ? { type: 'subcontract', id: c.subcontract_id } : null,
            title: c.description || c.category || '—',
            sub: x.siteName ? (x.siteName(c.subcontract_id) || '') : '',
            cents: cents(c.amount),
            date: day(c.cost_date),
            tone: '',
          }))
          .sort((a, b) => b.cents - a.cents);
      },
    },
  ];

  /** Štádiá aj so sumami. Prázdne štádium zostáva — nula je tiež odpoveď. */
  function stages(x) {
    const data = x || {};
    return STAGES.map((s) => {
      let rows = [];
      try { rows = s.rows(data) || []; } catch { rows = []; }
      const suma = M.sum(rows.map(r => r.cents || 0));
      return {
        key: s.key, label: s.label, lead: s.lead, todo: s.todo, dated: s.dated,
        rows, count: rows.length, cents: suma,
        state: rows.some(r => r.tone === 'bad') ? BAD
          : rows.some(r => r.tone === 'warn') ? WATCH : CALM,
      };
    });
  }

  /**
   * Súhrn štádií. `ours` je to, čo stojí na nás — a práve to je číslo, ktoré
   * sa dá pohnúť bez toho, aby niekto iný čokoľvek spravil.
   */
  function summary(list) {
    const s = list || [];
    const get = (k) => (s.find(x => x.key === k) || { cents: 0, count: 0 });
    const ours = ['unbilled', 'toinvoice', 'approval'].reduce((a, k) => a + get(k).cents, 0);
    const theirs = get('due').cents + get('overdue').cents;
    return {
      total: s.reduce((a, x) => a + x.cents, 0),
      ours, theirs,
      overdue: get('overdue').cents,
      withheld: get('withheld').cents,
      tied: get('tied').cents,
      // Koľko jednotlivých vecí stojí na nás — nie suma, počet krokov.
      oursCount: ['unbilled', 'toinvoice', 'approval'].reduce((a, k) => a + get(k).count, 0),
    };
  }

  // ── Koľko sa dá minúť a dokedy ────────────────────────────────────────────
  /**
   * Týždenný výhľad voľných peňazí.
   *
   * @param {Object} o { today, balance, items (v_cashflow), weeks, reserve }
   * @returns {{ rows, free, worst, reserve, horizon }}
   *
   * `free` je **najnižší** bod celého výhľadu po odrátaní rezervy, nie
   * zostatok na konci. Peniaze sa míňajú dnes a záväzok dobehne o tri
   * týždne — kto sa pozerá na koniec, minie to, čo bude v treťom týždni
   * chýbať.
   */
  function spendable(o = {}) {
    const today = day(o.today) || new Date().toISOString().slice(0, 10);
    const horizon = Number(o.weeks) || 8;
    const reserve = o.reserve || 0;
    const start = o.balance || 0;
    const items = arr(o.items).filter(Boolean);

    let zostatok = start;
    const rows = [];
    for (let w = 0; w < horizon; w++) {
      const od = addDays(today, w * 7);
      const doD = addDays(today, w * 7 + 6);
      let pride = 0, odide = 0, nespolahlive = 0;
      for (const it of items) {
        const kedy = day(it.expected_on);
        if (!kedy) continue;
        // Čo malo prísť už dávno, spadne do prvého týždňa — ale ako
        // nespoľahlivé. Čo malo dávno odísť, odíde: dlh nezmizne.
        const vTomtoTyzdni = w === 0 ? kedy <= doD : (kedy >= od && kedy <= doD);
        if (!vTomtoTyzdni) continue;
        const c = cents(it.amount);
        if (c >= 0) {
          if (kedy < today) nespolahlive += c;      // po splatnosti
          else pride += c;
        } else {
          odide += c;
        }
      }
      zostatok = zostatok + pride + odide;
      rows.push({
        week: w + 1, from: od, to: doD,
        in: pride, out: odide, unreliable: nespolahlive,
        balance: zostatok,
        free: zostatok - reserve,
      });
    }

    const worst = rows.reduce((m, r) => (m === null || r.free < m.free ? r : m), null);
    return {
      today, horizon, reserve, start, rows,
      worst,
      // Koľko sa dá minúť dnes, aby to vyšlo po celý horizont.
      free: worst ? Math.min(start - reserve, worst.free) : start - reserve,
      end: rows.length ? rows[rows.length - 1].balance : start,
      unreliable: rows.reduce((a, r) => a + r.unreliable, 0),
    };
  }

  /**
   * Jedna veta, ktorá sa dá povedať nahlas. Nie šesť čísel — jedna veta
   * a za ňou dôvod.
   */
  function verdict(sp) {
    if (!sp) return { tone: CALM, text: '' };
    const w = sp.worst;
    if (sp.free < 0) {
      return {
        tone: BAD,
        text: w && w.balance < 0
          ? `Na účte to nevyjde — v ${w.week}. týždni chýba ${M.format(-w.balance)}.`
          : `Voľné nie je nič. Najnižší bod je ${M.format(w ? w.balance : sp.start)} `
            + `a rezerva je ${M.format(sp.reserve)}.`,
        week: w ? w.week : null,
      };
    }
    return {
      tone: sp.free < sp.reserve ? WATCH : CALM,
      text: `Minúť sa dá najviac ${M.format(sp.free)}. `
        + (w ? `Najnižšie to bude v ${w.week}. týždni — ${M.format(w.balance)}.` : ''),
      week: w ? w.week : null,
    };
  }

  const API = {
    STAGES, CALM, WATCH, BAD,
    stages, summary, spendable, verdict,
    addDays, dni, openInvoice,
  };
  if (typeof window !== 'undefined') window.DanubraPosition = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
