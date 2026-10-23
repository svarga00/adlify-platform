// ============================================================================
// DANUBRA — vydaná faktúra: schvaľovanie, §48b a payload pre SuperFaktúru
// ============================================================================
// Tvrdé pravidlo zo zadania: faktúra sa nikdy nevystaví ani neodošle bez
// schválenia. Pravdu o tom drží trigger v databáze (migrácia 018); tu je tá
// istá logika ešte raz, aby UI nemohlo ponúknuť tlačidlo, ktoré databáza
// odmietne, a aby sa to dalo testovať bez databázy.
//
// Druhá vec, ktorú tento súbor rieši: **§48b.** Pri stavebných prácach bez
// Freistellungsbescheinigung zrazí nemecký odberateľ 15 % a odvedie ich
// svojmu finančnému úradu. Do SuperFaktúry ide **plná suma** — zrážka nie je
// zľava, je to daňová povinnosť odberateľa. Appka ju musí ukázať skôr, než
// faktúru schváliš, lebo mení to, koľko reálne príde na účet.
//
// Peniaze v celých centoch (lib/money.js). Čistá logika, žiadna sieť.
//
// Testy: node app/lib/billing/invoice.test.js
// ============================================================================
(function () {
  const M = (typeof require !== 'undefined' && typeof module !== 'undefined')
    ? require('../money.js') : window.Money;

  // Musí sedieť s `allowed` v danubra_invoice_approval_flow().
  const FLOW = {
    draft: ['pending_approval', 'cancelled'],
    pending_approval: ['approved', 'draft', 'cancelled'],
    approved: ['issued', 'pending_approval', 'cancelled'],
    issued: ['sent', 'paid', 'overdue', 'cancelled'],
    sent: ['paid', 'overdue', 'cancelled'],
    overdue: ['paid', 'cancelled'],
    paid: [],
    cancelled: [],
  };

  function canGo(from, to) { return (FLOW[from] || []).includes(to); }

  /** Čo sa dá s faktúrou práve teraz spraviť. Vstup pre tlačidlá. */
  function nextSteps(inv = {}) {
    return (FLOW[inv.status] || []).filter(s => s !== 'cancelled');
  }

  // ── §48b ──────────────────────────────────────────────────────────────────

  /**
   * Rozpad sumy podľa §48b.
   * @param {Object} inv { total, withholding_pct }
   * @returns {{ gross:number, withheld:number, net:number, pct:number }}
   */
  function withholding(inv = {}) {
    const gross = M.toCents(inv.total);
    const pct = Number(inv.withholding_pct) || 0;
    const withheld = pct ? M.pct(gross, pct) : 0;
    return { gross, withheld, net: gross - withheld, pct };
  }

  // ── Čo na faktúrach čaká na nás ───────────────────────────────────────────

  /**
   * Faktúry rozdelené podľa toho, čo s nimi treba spraviť — a jedna vec,
   * ktorá je na rade.
   *
   * Obrazovka faktúr bola zoznam s filtrami. „Čo mám teraz spraviť" sa z nej
   * dalo vyčítať, len keď človek vedel, ktorý stav čo znamená — a stavy sú
   * dva razy dva, lebo v1 a v2 ich pomenovali inak.
   *
   * Poradie je zámerné:
   *
   *   1. **schválenie** — jediná vec, ktorá stojí len na nás. Faktúra bez
   *      schválenia neodíde, takže tu peniaze stoja kvôli nám.
   *   2. **po splatnosti** — peniaze, ktoré mali byť na účte. Stojí to na
   *      odberateľovi, ale zavolať mu musíme my.
   *   3. **rozpracované** — podklad, ktorý ešte nikto neposlal na schválenie.
   *
   * Po splatnosti sa neberie len podľa stavu: stav prepisuje nočná úloha,
   * takže faktúra so zajtrajším dátumom a dnešnou splatnosťou by sa inak
   * dva dni nikde neukázala.
   */
  const SCHVALENIE = ['pending_approval', 'draft_pending_approval'];
  const NEUHRADENE = ['issued', 'sent', 'overdue'];

  function den(x) { return x ? String(x).slice(0, 10) : null; }

  function queue(invoices = [], today) {
    const dnes = den(today) || new Date().toISOString().slice(0, 10);
    const live = (invoices || []).filter(x => x && x.status !== 'cancelled');

    const pending = live.filter(x => SCHVALENIE.includes(x.status));
    const overdue = live.filter(x => x.status === 'overdue'
      || (NEUHRADENE.includes(x.status) && den(x.due_date) && den(x.due_date) < dnes));
    const drafts = live.filter(x => x.status === 'draft');

    const suma = (list) => list.reduce((s, x) => s + M.toCents(x.total), 0);
    const prvy = (list) => list.slice().sort((a, b) =>
      String(den(a.due_date) || '9999').localeCompare(String(den(b.due_date) || '9999')))[0] || null;

    let next = null;
    if (pending.length) {
      next = {
        key: 'approve', title: pending.length === 1 ? 'Schváliť faktúru' : 'Schváliť faktúry',
        what: `${pending.length} ${plural(pending.length, 'faktúra čaká', 'faktúry čakajú', 'faktúr čaká')} `
          + `na schválenie · ${M.format(suma(pending))}`,
        why: 'Bez schválenia faktúra neodíde. Toto je jediná vec na tejto obrazovke, '
          + 'ktorá stojí len na nás.',
        hot: false, invoice: prvy(pending), count: pending.length, cents: suma(pending),
      };
    } else if (overdue.length) {
      next = {
        key: 'overdue', title: 'Zavolať odberateľovi',
        what: `${overdue.length} ${plural(overdue.length, 'faktúra je', 'faktúry sú', 'faktúr je')} `
          + `po splatnosti · ${M.format(suma(overdue))}`,
        why: 'Appka s týmito peniazmi prestala počítať v cash-flow — radšej opatrne. '
          + 'Späť sa započítajú, keď prídu.',
        hot: true, invoice: prvy(overdue), count: overdue.length, cents: suma(overdue),
      };
    } else if (drafts.length) {
      next = {
        key: 'draft', title: 'Dokončiť rozpracované',
        what: `${drafts.length} ${plural(drafts.length, 'podklad', 'podklady', 'podkladov')} `
          + 'nikto neposlal na schválenie',
        why: 'Rozpracovaná faktúra je hotová práca, za ktorú ešte nikto nezaplatil.',
        hot: false, invoice: prvy(drafts), count: drafts.length, cents: suma(drafts),
      };
    }

    return {
      pending, overdue, drafts, next,
      pendingCents: suma(pending), overdueCents: suma(overdue),
      // Čo čaká na nás dokopy — do jednej vety nad zoznamom.
      waiting: pending.length + drafts.length,
    };
  }

  function plural(n, one, few, many) {
    const a = Math.abs(n);
    if (a === 1) return one;
    if (a >= 2 && a <= 4) return few;
    return many;
  }

  /** Riadky do `Shell.sums` — presne to, čo treba vidieť pred schválením. */
  function sumLines(inv = {}) {
    const w = withholding(inv);
    const lines = [{ label: 'Fakturovaná suma', cents: w.gross }];
    if (w.withheld) {
      lines.push({
        label: `Zrážka §48b (${w.pct} %)`, cents: w.withheld, kind: 'minus',
        hint: 'odvedie odberateľ nemeckému finančnému úradu',
      });
    }
    return lines;
  }

  /**
   * Má sa zrážka uplatniť? Stavebné práce bez Freistellungsbescheinigung.
   * Freistellung máme ako firma (register compliance) — keď je platná,
   * zrážka sa neuplatňuje na žiadnej zákazke.
   * @param {Object} fs  výsledok DanubraCompliance.freistellung() — { ok }
   */
  function withholdingApplies(subcontract = {}, fs = null) {
    return subcontract.work_type === 'construction'
      && !subcontract.freistellung_verified
      && !(fs && fs.ok);
  }

  // ── Čo musí platiť pred schválením ────────────────────────────────────────

  /**
   * @param {Object} o { invoice, partner, subcontract, period, today }
   * @returns {{ ok:boolean, reasons:Array, warnings:Array }}
   */
  function reviewBeforeApproval(o = {}) {
    const inv = o.invoice || {};
    const partner = o.partner || {};
    const sub = o.subcontract || {};
    const period = o.period || {};
    const reasons = [], warnings = [];
    const w = withholding(inv);

    if (!inv.partner_id && !partner.id) {
      reasons.push({
        rule: 'invoice_no_partner', label: 'Faktúra nemá odberateľa',
        detail: 'Nie je komu fakturovať.', severity: 'block',
      });
    }
    if (w.gross <= 0) {
      reasons.push({
        rule: 'invoice_zero', label: 'Faktúra je na nulu',
        detail: 'Skontroluj podklad — z uzavretého obdobia nevyšli žiadne peniaze.',
        severity: 'block',
      });
    }
    if (!inv.invoice_number) {
      reasons.push({
        rule: 'invoice_no_number', label: 'Faktúra nemá číslo',
        detail: 'Číslo prideľuje databáza pri vytvorení z podkladu.',
        severity: 'block',
      });
    }

    // Reverse charge bez USt-IdNr nie je reverse charge.
    if (inv.vat_regime === 'reverse_charge' && !String(partner.ust_idnr || '').trim()) {
      reasons.push({
        rule: 'invoice_no_ustidnr',
        label: 'Reverse charge §13b bez USt-IdNr odberateľa',
        detail: 'Bez daňového čísla odberateľa sa nulová sadzba neuznáva. '
          + 'Doplň USt-IdNr, alebo prepni režim.',
        severity: 'block',
      });
    }

    // Podklad musí byť uzavretý — inak sa hodiny ešte môžu zmeniť.
    if (inv.period_id && period.status && period.status === 'open') {
      reasons.push({
        rule: 'invoice_period_open', label: 'Obdobie ešte nie je uzavreté',
        detail: 'Hodiny sa môžu zmeniť a faktúra by potom nesedela s podkladom.',
        severity: 'block',
      });
    }

    // Voľná faktúra: súčet položiek musí byť suma faktúry. Rozdiel vznikne,
    // keď sa položka upraví a suma nie — a doklad by si protirečil.
    if (liveItems(o.items).length && itemsTotal(o.items) !== w.gross) {
      reasons.push({
        rule: 'invoice_items_mismatch', label: 'Položky nesedia so sumou faktúry',
        detail: `Položky dávajú ${M.format(itemsTotal(o.items))}, faktúra ${M.format(w.gross)}. Otvorte „Upraviť" a uložte znova.`,
        severity: 'block',
      });
    }

    // Suma faktúry musí sedieť s podkladom. Rozdiel znamená, že sa niekde
    // písalo ručne — a to je miesto, kde sa strácajú peniaze.
    if (period.amount_charged != null) {
      const fromPeriod = M.toCents(period.amount_charged);
      if (fromPeriod !== w.gross) {
        reasons.push({
          rule: 'invoice_amount_mismatch',
          label: 'Suma faktúry nesedí s podkladom',
          detail: `Podklad hovorí ${M.format(fromPeriod)}, faktúra ${M.format(w.gross)}. `
            + `Rozdiel ${M.format(Math.abs(fromPeriod - w.gross))}.`,
          severity: 'block',
        });
      }
    }

    // §48b — nie je to prekážka, ale musí to byť vidieť pred kliknutím.
    if (withholdingApplies(sub, o.freistellung) && !w.withheld) {
      warnings.push({
        rule: 'invoice_missing_withholding',
        label: 'Stavebné práce bez Freistellungsbescheinigung, ale zrážka je nulová',
        detail: 'Odberateľ pravdepodobne zrazí 15 % a na účet príde menej, '
          + 'než faktúra hovorí. Skontroluj §48b.',
        severity: 'warn',
      });
    }
    // Máme platnú Freistellung, ale faktúra zrážku ráta — to je chyba v sume.
    if (w.withheld && o.freistellung && o.freistellung.ok) {
      warnings.push({
        rule: 'invoice_withholding_not_due',
        label: 'Máme platnú Freistellungsbescheinigung — zrážka sa neuplatňuje',
        detail: `Faktúra ráta zrážku ${M.format(w.withheld)}, hoci odberateľ má zaplatiť celú sumu. `
          + 'Pošlite mu kópiu Freistellung, ak ju ešte nemá.',
        severity: 'warn',
      });
    } else if (w.withheld) {
      warnings.push({
        rule: 'invoice_withholding',
        label: `Na účet príde ${M.format(w.net)}, nie ${M.format(w.gross)}`,
        detail: `Odberateľ zrazí ${M.format(w.withheld)} podľa §48b a odvedie ich `
          + 'nemeckému finančnému úradu. Do faktúry ide plná suma.',
        severity: 'warn',
      });
    }

    if (!partner.email) {
      warnings.push({
        rule: 'invoice_no_email', label: 'Odberateľ nemá e-mail',
        detail: 'Faktúru sa nebude dať odoslať z appky.', severity: 'warn',
      });
    }

    return { ok: reasons.length === 0, reasons, warnings, withholding: w };
  }

  /** Veta pre nemeckého odberateľa: Freistellung máme, zrážka sa neuplatní. */
  function freistellungNote(doc = {}) {
    const d = doc || {};
    const datum = (x) => { const m = String(x || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : ''; };
    return 'Freistellungsbescheinigung gemäß §48b EStG liegt vor'
      + (d.reference ? ` (Nr. ${d.reference}` + (d.valid_to ? `, gültig bis ${datum(d.valid_to)})` : ')')
        : (d.valid_to ? ` (gültig bis ${datum(d.valid_to)})` : ''))
      + ' — kein Steuerabzug.';
  }

  // ── Payload pre SuperFaktúru ──────────────────────────────────────────────
  // Čistá funkcia — dá sa otestovať bez siete a bez kľúča.

  const COUNTRY_ID = { SK: 191, CZ: 57, DE: 63, AT: 15, PL: 168, HU: 97 };

  /**
   * @param {Object} o { invoice, partner, subcontract, period, supplier }
   * @returns {Object} telo pre POST /invoices/create
   */
  function sfPayload(o = {}) {
    const inv = o.invoice || {};
    const partner = o.partner || {};
    const sub = o.subcontract || {};
    const period = o.period || {};
    const w = withholding(inv);
    const reverse = inv.vat_regime === 'reverse_charge';

    const comments = [];
    if (reverse) {
      comments.push('Steuerschuldnerschaft des Leistungsempfängers (§13b UStG).');
    }
    if (w.withheld) {
      // Poznámka po nemecky — dokument ide partnerovi.
      comments.push(
        `Bauabzugsteuer gemäß §48b EStG: ${fmtDe(w.withheld)} EUR (${w.pct} %). `
        + `Auszahlungsbetrag: ${fmtDe(w.net)} EUR.`);
    } else if (sub.work_type === 'construction' && o.freistellung && o.freistellung.ok) {
      comments.push(freistellungNote(o.freistellung.doc));
    }
    if (inv.note) comments.push(String(inv.note));

    // Položky vznikajú z obdobia, nie z ručného písania.
    const hours = round2(Number(period.hours_construction || 0)
      + Number(period.hours_workshop || 0) + Number(period.hours_travel || 0));
    const tax = reverse ? 0 : 20;
    // Voľná faktúra má vlastné položky; faktúra z podkladu jednu — z obdobia.
    const vlastne = liveItems(o.items);
    const items = vlastne.length
      ? vlastne.map(i => ({ name: String(i.description || '').slice(0, 250) || 'Leistung',
        quantity: Number(i.quantity) || 0, unit: i.unit || 'ks', unit_price: round2(i.unit_price), tax }))
      : [buildItem(w.gross, hours, tax, sub, period)];

    return {
      Invoice: {
        name: itemName(sub, period),
        type: 'regular',
        invoice_currency: inv.currency || 'EUR',
        variable: String(inv.invoice_number || '').replace(/\D/g, '') || undefined,
        created: inv.issue_date || undefined,
        due: inv.due_date || undefined,
        delivery: inv.delivery_date || undefined,
        payment_type: 'transfer',
        issued_by: (o.supplier && o.supplier.name) || undefined,
        comment: comments.join(' ') || undefined,
      },
      Client: {
        name: partner.name,
        ic_dph: partner.ust_idnr || undefined,
        ico: partner.registration_no || undefined,
        address: partner.address || undefined,
        city: partner.city || undefined,
        zip: partner.postal_code || undefined,
        country_id: COUNTRY_ID[String(partner.country || 'DE').toUpperCase()],
        email: partner.email || undefined,
        update_addressbook: 1,
      },
      InvoiceItem: items,
      InvoiceSetting: {
        language: partner.invoice_language || 'deu',
        bysquare: 1,
        online_payment: 0,
      },
    };
  }

  /**
   * Jedna položka faktúry. Pri hodinovej fakturácii sa jednotková cena
   * dopočíta z celkovej sumy — ale len ak súčet vyjde na cent. Keby
   * zaokrúhlenie rozhodilo celok, SuperFaktúra by vyrátala inú sumu než
   * podklad, a to je presne ten rozdiel, ktorý potom nikto nevie vysvetliť.
   * Vtedy ide jedna paušálna položka s presnou sumou a hodinami v popise.
   */
  function buildItem(grossCents, hours, tax, sub, period) {
    const name = itemName(sub, period);
    const total = round2(M.fromCents(grossCents));

    if (hours > 0) {
      const unitPrice = round2(total / hours);
      if (Math.round(unitPrice * hours * 100) === grossCents) {
        return {
          name, description: 'Podľa výkazu hodín, príloha',
          quantity: hours, unit: 'h', unit_price: unitPrice, tax,
        };
      }
      return {
        name, description: `${hours} h podľa výkazu hodín, príloha`,
        quantity: 1, unit: 'pausal', unit_price: total, tax,
      };
    }
    return { name, quantity: 1, unit: 'pausal', unit_price: total, tax };
  }

  function itemName(sub, period) {
    const what = sub.title || 'Subdodávateľské práce';
    if (period && period.period_from) {
      const [y, m] = String(period.period_from).split('-');
      return `${what} — ${m}/${y}`;
    }
    return what;
  }

  function round2(n) { return Math.round(Number(n) * 100) / 100; }

  // ── Položky: voľná faktúra, dokument, úprava návrhu ───────────────────────

  /** Položky, ktoré platia — vyhodené z návrhu (`removed_at`) sa nerátajú. */
  function liveItems(items) {
    return (items || []).filter(i => i && !i.removed_at);
  }

  /** Súčet položiek v centoch. Množstvo môže byť desatinné (312,5 h). */
  function itemsTotal(items) {
    return M.sum(liveItems(items).map(i => M.mul(M.toCents(i.unit_price || 0), Number(i.quantity) || 0)));
  }

  /**
   * Riadky na dokument faktúry. Faktúra z podkladu nemá položky v databáze —
   * riadok sa poskladá z obdobia rovnako ako pre SuperFaktúru, aby PDF
   * a SuperFaktúra hovorili to isté.
   */
  function docItems(o = {}) {
    const vlastne = liveItems(o.items);
    if (vlastne.length) {
      return vlastne.map(i => ({ description: i.description, quantity: Number(i.quantity) || 0,
        unit: i.unit || '', unit_price: Number(i.unit_price) || 0,
        total: M.fromCents(M.mul(M.toCents(i.unit_price || 0), Number(i.quantity) || 0)) }));
    }
    const inv = o.invoice || {};
    const w = withholding(inv);
    if (!w.gross) return [];
    const period = o.period || {};
    const hours = round2(Number(period.hours_construction || 0)
      + Number(period.hours_workshop || 0) + Number(period.hours_travel || 0));
    const it = buildItem(w.gross, hours, 0, o.subcontract || {}, period);
    return [{ description: it.description ? `${it.name} — ${it.description}` : it.name,
      quantity: it.quantity, unit: it.unit === 'pausal' ? 'paušál' : it.unit,
      unit_price: it.unit_price, total: M.fromCents(w.gross) }];
  }

  /** Návrh sa dá upraviť, kým ho nikto neschválil. Vystavený doklad sa nemení. */
  const UPRAVITELNA = ['draft', 'pending_approval', 'draft_pending_approval'];
  function editable(inv = {}) {
    return UPRAVITELNA.includes(inv.status) && !inv.approved_at && !inv.sf_invoice_id;
  }

  /**
   * Voľná faktúra nemeckej firme — vlastné položky, bez podkladu z hodín.
   * Vzniká ako návrh (databáza iný stav ani nepustí) a schvaľuje ju admin.
   * Reverse charge §13b, keď ho odberateľ nemá vypnutý.
   *
   * @returns {{ invoice: Object, items: Array, cents: number }}
   */
  function freeInvoice({ partner = {}, items = [], today, dueDays, number, subcontractId = null } = {}) {
    const dnes = today || new Date().toISOString().slice(0, 10);
    const dni = Number(dueDays) || Number(partner.payment_terms_days) || 30;
    const plus = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
    const rows = liveItems(items).filter(i => String(i.description || '').trim() && Number(i.quantity));
    const cents = itemsTotal(rows);
    const total = M.fromCents(cents);
    return {
      cents,
      invoice: {
        invoice_number: number || null, partner_id: partner.id || null, subcontract_id: subcontractId,
        type: 'standard', issue_date: dnes, due_date: plus(dnes, dni), delivery_date: dnes,
        total, currency: 'EUR', amount_net: total, withholding_pct: 0, withholding_amount: 0,
        vat_regime: partner.reverse_charge === false ? 'standard' : 'reverse_charge',
        status: 'draft',
      },
      items: rows.map(i => ({ description: String(i.description).trim(), quantity: Number(i.quantity) || 0,
        unit: i.unit || 'ks', unit_price: Number(i.unit_price) || 0,
        total: M.fromCents(M.mul(M.toCents(i.unit_price || 0), Number(i.quantity) || 0)) })),
    };
  }
  /** Nemecký zápis čísla pre poznámku na doklade. */
  function fmtDe(cents) {
    return M.fromCents(cents).toFixed(2).replace('.', ',')
      .replace(/\B(?=(\d{3})+(?!\d),)/g, '.');
  }

  const API = {
    FLOW, canGo, nextSteps, queue, SCHVALENIE,
    withholding, withholdingApplies, sumLines,
    reviewBeforeApproval,
    sfPayload, freistellungNote, COUNTRY_ID, fmtDe,
    liveItems, itemsTotal, docItems, editable, freeInvoice,
  };
  window.DanubraInvoice = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
