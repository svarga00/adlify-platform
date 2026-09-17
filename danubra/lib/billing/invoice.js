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
// Testy: node danubra/lib/billing/invoice.test.js
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

  /** Má sa zrážka uplatniť? Stavebné práce bez Freistellungsbescheinigung. */
  function withholdingApplies(subcontract = {}) {
    return subcontract.work_type === 'construction'
      && !subcontract.freistellung_verified;
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
    if (withholdingApplies(sub) && !w.withheld) {
      warnings.push({
        rule: 'invoice_missing_withholding',
        label: 'Stavebné práce bez Freistellungsbescheinigung, ale zrážka je nulová',
        detail: 'Odberateľ pravdepodobne zrazí 15 % a na účet príde menej, '
          + 'než faktúra hovorí. Skontroluj §48b.',
        severity: 'warn',
      });
    }
    if (w.withheld) {
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
    }
    if (inv.note) comments.push(String(inv.note));

    // Položky vznikajú z obdobia, nie z ručného písania.
    const hours = round2(Number(period.hours_construction || 0)
      + Number(period.hours_workshop || 0) + Number(period.hours_travel || 0));
    const tax = reverse ? 0 : 20;
    const items = [buildItem(w.gross, hours, tax, sub, period)];

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
  /** Nemecký zápis čísla pre poznámku na doklade. */
  function fmtDe(cents) {
    return M.fromCents(cents).toFixed(2).replace('.', ',')
      .replace(/\B(?=(\d{3})+(?!\d),)/g, '.');
  }

  const API = {
    FLOW, canGo, nextSteps,
    withholding, withholdingApplies, sumLines,
    reviewBeforeApproval,
    sfPayload, COUNTRY_ID, fmtDe,
  };
  window.DanubraInvoice = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
