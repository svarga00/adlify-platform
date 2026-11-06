// ============================================================================
// DANUBRA — SuperFaktúra: payload, čítanie odpovedí, chyby, stav dokladu
// ============================================================================
// Čisté funkcie bez siete. Sieť a databáza sú v `sf-service.js` (len server).
// V prehliadači sa odtiaľto berú len popisky stavu (`chips`).
//
// Na čom to stojí:
//
//   * **Zákonné číslo faktúry prideľuje appka.** Do SuperFaktúry ide ako
//     `invoice_no_formatted`, variabilný symbol sú jeho číslice. Keď by
//     SuperFaktúra zapísala iné číslo, doklad „nesúhlasí so SuperFaktúrou"
//     a neodošle sa.
//   * **Peniaze v celých centoch** (lib/money.js). Do SuperFaktúry ide
//     číslo s dvoma desatinnými miestami až na konci; späť sa číta cez
//     `Money.toCents` z reťazca, nikdy cez float súčty.
//   * **Reverse charge §13b:** sadzba 0 %, `vat_transfer = 1` (prenesenie
//     daňovej povinnosti) a nemecká veta na doklade.
//   * **Prostredie:** predvolene sandbox. Ostrý účet len pri SF_ENV=production
//     (presne tak, žiadne „prod", „live").
//
// Testy: node app/lib/billing/superfaktura.test.js
// ============================================================================
(function () {
  const M = (typeof require !== 'undefined' && typeof module !== 'undefined')
    ? require('../money.js') : window.Money;
  // Preklad merných jednotiek (mes → Monat) je jeden pre SuperFaktúru aj PDF z appky.
  const IV = (typeof require !== 'undefined' && typeof module !== 'undefined')
    ? require('./invoice.js') : window.DanubraInvoice;
  const unitFor = (u, lang) => (IV && IV.unitFor ? IV.unitFor(u, lang) : u);

  // ── Prostredie ────────────────────────────────────────────────────────────
  const BASE = {
    sandbox: 'https://sandbox.superfaktura.sk',
    production: 'https://moja.superfaktura.sk',
  };
  /** Ostrý účet len pri presnom `production`. Čokoľvek iné je sandbox. */
  function envOf(v) { return String(v || '').trim().toLowerCase() === 'production' ? 'production' : 'sandbox'; }
  function baseUrl(env) { return BASE[envOf(env)]; }

  /** „stefan@punds.eu" → „s…@punds.eu". E-mail účtu sa celý nevypisuje. */
  function maskEmail(e) {
    const m = String(e || '').match(/^(.)[^@]*(@.+)$/);
    return m ? `${m[1]}…${m[2]}` : '';
  }

  // ── Jazyk dokladu ─────────────────────────────────────────────────────────
  // Odberateľ má v appke `invoice_language` ako dvojpísmenový kód („de").
  // SuperFaktúra chce trojpísmenový („deu"). Predtým išlo do SuperFaktúry
  // rovno „de" — taký jazyk nepozná.
  const LANG = {
    de: 'deu', deu: 'deu', ger: 'deu', sk: 'slo', slo: 'slo', svk: 'slo', en: 'eng', eng: 'eng',
    cs: 'cze', cz: 'cze', cze: 'cze', hu: 'hun', hun: 'hun', pl: 'pol', pol: 'pol',
    ru: 'rus', rus: 'rus', uk: 'ukr', ua: 'ukr', ukr: 'ukr', ro: 'rom', rom: 'rom',
    hr: 'hrv', hrv: 'hrv', sl: 'slv', slv: 'slv', es: 'spa', spa: 'spa', it: 'ita', ita: 'ita',
  };
  const LANGS = [['deu', 'nemecky'], ['slo', 'slovensky'], ['eng', 'anglicky']];
  function sfLang(code, fallback = 'deu') {
    const k = String(code || '').trim().toLowerCase();
    return LANG[k] || LANG[String(fallback || '').toLowerCase()] || 'deu';
  }

  // Texty na doklad. Nemecké právne vety (§13b, §48b) zostávajú po nemecky
  // v každom jazyku — odvoláva sa na ne nemecký odberateľ a jeho daňový úrad.
  const TXT = {
    deu: { service: 'Subunternehmerleistungen', perHours: 'Gemäß Stundennachweis (Anlage)',
      hoursIn: (h) => `${de(h)} Std. gemäß Stundennachweis (Anlage)`, unitH: 'Std.', unitFlat: 'Pauschale',
      storno: (n) => `Stornorechnung zur Rechnung Nr. ${n}`, reason: 'Grund',
      subject: (n) => `Rechnung ${n}`, subjectCn: (n) => `Stornorechnung ${n}`,
      message: 'Sehr geehrte Damen und Herren,\n\nanbei senden wir Ihnen unsere Rechnung.\n\nMit freundlichen Grüßen',
      messageCn: 'Sehr geehrte Damen und Herren,\n\nanbei senden wir Ihnen die Stornorechnung.\n\nMit freundlichen Grüßen' },
    slo: { service: 'Subdodávateľské práce', perHours: 'Podľa výkazu hodín (príloha)',
      hoursIn: (h) => `${de(h)} h podľa výkazu hodín (príloha)`, unitH: 'h', unitFlat: 'paušál',
      storno: (n) => `Dobropis k faktúre č. ${n}`, reason: 'Dôvod',
      subject: (n) => `Faktúra ${n}`, subjectCn: (n) => `Dobropis ${n}`,
      message: 'Dobrý deň,\n\nv prílohe Vám posielame faktúru.\n\nS pozdravom',
      messageCn: 'Dobrý deň,\n\nv prílohe Vám posielame dobropis.\n\nS pozdravom' },
    eng: { service: 'Subcontracting services', perHours: 'According to the timesheet (attached)',
      hoursIn: (h) => `${String(h)} h according to the timesheet (attached)`, unitH: 'h', unitFlat: 'lump sum',
      storno: (n) => `Credit note for invoice no. ${n}`, reason: 'Reason',
      subject: (n) => `Invoice ${n}`, subjectCn: (n) => `Credit note ${n}`,
      message: 'Dear Sir or Madam,\n\nplease find attached our invoice.\n\nKind regards',
      messageCn: 'Dear Sir or Madam,\n\nplease find attached the credit note.\n\nKind regards' },
  };
  const txt = (lang) => TXT[lang] || TXT.deu;

  /** Veta k reverse charge. Nemecký odberateľ §13b UStG, iný z EÚ čl. 196 smernice. */
  const RC_DE = 'Steuerschuldnerschaft des Leistungsempfängers (§13b UStG).';
  const RC_EU = 'Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge, Art. 196 MwStSystRL 2006/112/EG).';
  function reverseChargeNote(partner = {}, settings = {}) {
    if (settings && String(settings.reverse_charge_note || '').trim()) return String(settings.reverse_charge_note).trim();
    return String(partner.country || 'DE').toUpperCase() === 'DE' ? RC_DE : RC_EU;
  }

  function de(n) { return String(n).replace('.', ','); }
  function deCents(c) {
    return M.fromCents(c).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d),)/g, '.');
  }
  /** Centy → číslo pre SuperFaktúru (100.5 → 100.5, nikdy 100.49999). */
  const amount = (cents) => Number(M.toNumeric(cents));
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const day = (x) => { const m = String(x || '').match(/^\d{4}-\d{2}-\d{2}/); return m ? m[0] : null; };
  function plusDays(d, n) {
    const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + Number(n || 0));
    return x.toISOString().slice(0, 10);
  }

  // ── Položky ───────────────────────────────────────────────────────────────

  const isCreditNote = (inv) => !!inv && inv.kind === 'credit_note';
  const liveItems = (items) => (items || []).filter(i => i && !i.removed_at);
  /** Suma faktúry v centoch tak, ako ju musí ukázať aj SuperFaktúra. */
  function expectedCents(inv = {}) { return M.toCents(inv.total || 0); }

  /**
   * Položky dokladu. Voľná faktúra a dobropis majú vlastné položky
   * v databáze. Faktúra z podkladu má jednu: hodiny × sadzba, ak to vyjde
   * presne na cent (najprv sadzba zo zákazky, potom dopočítaná), inak
   * paušál s hodinami v popise — SuperFaktúra by inak vyrátala inú sumu.
   */
  function buildItems({ invoice = {}, subcontract = {}, period = {}, items = [], lang = 'deu' } = {}) {
    const t = txt(lang);
    const tax = 0;
    const own = liveItems(items);
    if (own.length) {
      return own.map(i => ({
        name: String(i.description || '').slice(0, 250) || t.service,
        quantity: Number(i.quantity) || 0,
        // Uložené je, čo človek napísal („mes"); na nemecký doklad ide „Monat".
        unit: unitFor(i.unit || 'ks', lang),
        unit_price: amount(M.toCents(i.unit_price || 0)),
        tax,
      }));
    }
    const gross = expectedCents(invoice);
    const name = itemName(subcontract, period, lang);
    const hoursMicro = ['hours_construction', 'hours_workshop', 'hours_travel']
      .reduce((s, k) => s + Math.round(Number(period[k] || 0) * 100), 0);
    const hours = hoursMicro / 100;
    if (hours > 0) {
      const candidates = [];
      if (subcontract.charge_rate != null && subcontract.charge_rate !== '') candidates.push(M.toCents(subcontract.charge_rate));
      candidates.push(Number(M.divRound(BigInt(gross) * 100n, BigInt(hoursMicro))));
      // Len keď súčin vyjde presne, bez zaokrúhlenia. 7,25 h × 38,50 € = 279,125 € —
      // to by SuperFaktúra zaokrúhlila po svojom a cent by sa rozišiel.
      const rate = candidates.find(c => c > 0 && BigInt(c) * BigInt(hoursMicro) === BigInt(gross) * 100n);
      if (rate != null) {
        return [{ name, description: t.perHours, quantity: hours, unit: t.unitH, unit_price: amount(rate), tax }];
      }
      return [{ name, description: t.hoursIn(hours), quantity: 1, unit: t.unitFlat, unit_price: amount(gross), tax }];
    }
    return [{ name, quantity: 1, unit: t.unitFlat, unit_price: amount(gross), tax }];
  }

  /** Súčet položiek v centoch — rovnako ako ho ráta SuperFaktúra (bez DPH). */
  function itemsCents(list) {
    return M.sum((list || []).map(i => M.mul(M.toCents(i.unit_price || 0), Number(i.quantity) || 0)));
  }

  function itemName(sub = {}, period = {}, lang = 'deu') {
    const what = sub.title || txt(lang).service;
    if (period && period.period_from) {
      const [y, m] = String(period.period_from).split('-');
      return `${what} — ${m}/${y}`;
    }
    return what;
  }

  // ── Dodávateľ na doklade (MyData) ─────────────────────────────────────────
  // SuperFaktúra berie údaje dodávateľa (blok „Lieferant") z profilu účtu
  // (Nastavenia → Moja firma). Sandbox má profil vygenerovaný náhodne — na
  // skúšobnej faktúre preto stálo nezmyselné meno a adresa. `MyData`
  // v /invoices/create ich prebije údajmi z appky (Nastavenia → Fakturačné
  // údaje), takže doklad má našu firmu bez ohľadu na profil účtu. Vypína sa
  // nastavením `send_my_data: false`. Logo, telefón, e-mail a web zostávajú
  // z profilu SuperFaktúry.

  /** „Hlavná 12, 949 01 Nitra" → { address, zip, city }. Bez PSČ len address. */
  function splitAddress(addr) {
    const a = String(addr || '').replace(/\s+/g, ' ').trim();
    if (!a) return {};
    const m = a.match(/^(.*?)[,\s]+(\d{3} ?\d{2})\s+([^,]+?)(?:\s*,\s*(?:Slovensko|Slovakia|Slowakei|Slovenská republika|SK))?\s*$/i);
    if (!m || !m[1].trim()) return { address: a };
    return { address: m[1].replace(/,\s*$/, '').trim(), zip: m[2].replace(/\s/g, '').replace(/^(\d{3})(\d{2})$/, '$1 $2'), city: m[3].trim() };
  }

  /** MyData z Fakturačných údajov. Bez názvu firmy nič (radšej profil SF než prázdny blok). */
  function myData(sup = {}) {
    const name = String(sup.name || '').trim();
    if (!name) return null;
    const adr = { ...splitAddress(sup.address), ...(sup.city ? { city: sup.city } : {}), ...(sup.zip ? { zip: sup.zip } : {}) };
    const country = String(sup.country || 'SK').toUpperCase();
    return strip({
      company_name: name,
      address: adr.address, city: adr.city, zip: adr.zip,
      country_id: IV && IV.COUNTRY_ID ? IV.COUNTRY_ID[country] : undefined,
      ico: sup.company_id, dic: sup.tax_id, ic_dph: sup.vat_id,
      business_register: sup.register,
    });
  }

  // ── Payload pre POST /invoices/create ─────────────────────────────────────

  /**
   * @param {Object} o {
   *   invoice, partner, subcontract, period, items, freistellung,
   *   settings  — danubra_settings.superfaktura,
   *   supplier  — danubra_settings.supplier (IBAN, BIC, kto vystavil),
   *   sfClientId — id klienta v SuperFaktúre (rovnaké prostredie),
   *   parent    — pri dobropise pôvodná faktúra (sf_invoice_id, invoice_number),
   *   key       — kľúč pokusu (idempotencia), ide do internej poznámky
   * }
   */
  function buildInvoice(o = {}) {
    const inv = o.invoice || {};
    const partner = o.partner || {};
    const sub = o.subcontract || {};
    const period = o.period || {};
    const s = o.settings || {};
    const sup = o.supplier || {};
    const lang = sfLang(partner.invoice_language || partner.language, s.default_language || 'deu');
    const t = txt(lang);
    const credit = isCreditNote(inv);
    const reverse = inv.vat_regime === 'reverse_charge';
    const gross = expectedCents(inv);
    const withheld = M.toCents(inv.withholding_amount || 0);

    const comments = [];
    if (credit && o.parent) {
      comments.push(`${t.storno(o.parent.invoice_number || '')}.`);
      if (inv.cancel_reason) comments.push(`${t.reason}: ${String(inv.cancel_reason).trim()}`);
    }
    if (reverse) comments.push(reverseChargeNote(partner, s));
    if (!credit && withheld > 0) {
      comments.push(`Bauabzugsteuer gemäß §48b EStG: ${deCents(withheld)} EUR `
        + `(${de(Number(inv.withholding_pct) || 0)} %). Auszahlungsbetrag: ${deCents(gross - withheld)} EUR.`);
    } else if (!credit && sub.work_type === 'construction' && o.freistellung) {
      const f = o.freistellung;
      const dd = (x) => { const m = String(x || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : ''; };
      comments.push('Freistellungsbescheinigung gemäß §48b EStG liegt vor'
        + (f.reference ? ` (Nr. ${f.reference}${f.valid_to ? `, gültig bis ${dd(f.valid_to)}` : ''})`
          : (f.valid_to ? ` (gültig bis ${dd(f.valid_to)})` : ''))
        + ' — kein Steuerabzug.');
    }
    if (inv.note) comments.push(String(inv.note));

    const created = day(inv.issue_date) || undefined;
    const due = credit ? created
      : (day(inv.due_date) || (created ? plusDays(created, Number(s.due_days) || Number(partner.payment_terms_days) || 30) : undefined));

    const Invoice = {
      name: credit ? t.storno(o.parent ? o.parent.invoice_number : '') : itemName(sub, period, lang),
      type: credit ? 'cancel' : 'regular',
      invoice_currency: inv.currency || 'EUR',
      variable: digits(inv.invoice_number) || undefined,
      created,
      due,
      delivery: day(inv.delivery_date) || created,
      payment_type: s.payment_type || 'transfer',
      comment: comments.join(' ') || undefined,
      internal_comment: o.key ? `HUB-KEY ${o.key}` : undefined,
      vat_transfer: reverse ? 1 : 0,
      issued_by: sup.issued_by || sup.contact_person || undefined,
    };
    // Zákonné číslo je naše. Bez neho by SuperFaktúra pridelila vlastné
    // z číselného radu a doklad by mal iné číslo než appka, banka a upomienky.
    if (s.use_own_number !== false && inv.invoice_number) Invoice.invoice_no_formatted = String(inv.invoice_number);
    if (s.sequence_id) Invoice.sequence_id = Number(s.sequence_id) || s.sequence_id;
    if (credit && o.parent && o.parent.sf_invoice_id) Invoice.parent_id = Number(o.parent.sf_invoice_id);
    // Bankový účet na doklade: id účtu zo SuperFaktúry, inak IBAN z nastavení.
    const iban = String(s.iban || sup.iban || '').replace(/\s+/g, '');
    if (s.bank_account_id) Invoice.bank_accounts = [{ id: Number(s.bank_account_id) || s.bank_account_id }];
    else if (iban) Invoice.bank_accounts = [{ iban, swift: s.swift || sup.bic || undefined }];

    const Client = {
      name: partner.name,
      ico: partner.registration_no || undefined,
      ic_dph: partner.ust_idnr || undefined,
      address: partner.address || undefined,
      city: partner.city || undefined,
      zip: partner.postal_code || undefined,
      country_iso_id: String(partner.country || 'DE').toUpperCase(),
      email: partner.email || undefined,
      phone: partner.phone || undefined,
      update_addressbook: 1,
    };
    if (o.sfClientId) Client.id = Number(o.sfClientId) || o.sfClientId;

    const out = {
      Invoice: strip(Invoice),
      Client: strip(Client),
      InvoiceItem: buildItems({ invoice: inv, subcontract: sub, period, items: o.items, lang }),
      InvoiceSetting: { language: lang, bysquare: 1, payment_info: 1, online_payment: 0 },
    };
    // Dodávateľ z appky, nie z profilu účtu SuperFaktúry (predvolene zapnuté).
    const md = s.send_my_data === false ? null : myData(sup);
    if (md) out.MyData = md;
    return out;
  }

  /** Klient pre POST /clients/create — tie isté údaje ako v doklade. */
  function buildClient(partner = {}) {
    const p = buildInvoice({ partner }).Client;
    delete p.update_addressbook;
    return { Client: p };
  }

  function strip(o) {
    const out = {};
    for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') out[k] = v;
    return out;
  }

  // ── Čítanie odpovedí ──────────────────────────────────────────────────────

  /** Suma z odpovede („1234.50", 1234.5) na centy; nič → null. */
  function cents(v) {
    if (v === undefined || v === null || v === '') return null;
    try { return M.toCents(typeof v === 'number' ? v : String(v)); } catch (e) { return null; }
  }
  const first = (...v) => v.find(x => x !== undefined && x !== null && x !== '');

  /** Telo odpovede s dokladom: `data: {...}` pri create, rovno pri view. */
  function docOf(json) {
    if (!json || typeof json !== 'object') return {};
    if (json.Invoice) return json;
    if (json.data && json.data.Invoice) return json.data;
    if (Array.isArray(json) && json[0] && json[0].Invoice) return json[0];
    return {};
  }

  /**
   * Doklad zo SuperFaktúry (create aj view) → to, čo appka potrebuje.
   * Polia, ktoré SuperFaktúra nevráti, sú null — nikdy nie „0".
   */
  function readInvoice(json) {
    const d = docOf(json);
    const I = d.Invoice || {};
    const pays = Array.isArray(d.InvoicePayment) ? d.InvoicePayment : [];
    const paysCents = pays.length ? M.sum(pays.map(p => cents((p.InvoicePayment || p).amount) || 0)) : null;
    const lastPay = pays.map(p => day((p.InvoicePayment || p).created) || day((p.InvoicePayment || p).payment_date))
      .filter(Boolean).sort().pop() || day(I.paydate) || null;
    const summary = d.Summary || {};
    const emails = Array.isArray(d.InvoiceEmail) ? d.InvoiceEmail : [];
    return {
      id: I.id != null ? Number(I.id) || I.id : null,
      token: I.token || null,
      number: I.invoice_no_formatted || null,
      type: I.type || null,
      variable: I.variable != null ? String(I.variable) : null,
      // Zoznam (index.json) a getInvoiceDetails nemajú `Invoice.total` — suma je
      // v `Summary.invoice_total`, prípadne v nepomenovanom kľúči „0".
      totalCents: cents(first(I.total, summary.invoice_total, I.amount_with_vat, (d['0'] || {}).total)),
      paidCents: cents(first(I.amount_paid, I.paid)) ?? paysCents,
      status: I.status != null ? String(I.status) : null,
      due: day(I.due),
      sent: emails.length > 0 || String(I.sent || '') === '1' || String(I.mark_sent || '') === '1',
      paidOn: lastPay,
      clientId: (d.Client && d.Client.id != null) ? (Number(d.Client.id) || d.Client.id) : (I.client_id ? Number(I.client_id) || I.client_id : null),
    };
  }

  /**
   * Stav úhrady podľa SuperFaktúry. Rozhodujú sumy; kód stavu
   * (1 čaká, 2 čiastočne, 3 uhradená) len vtedy, keď suma chýba.
   */
  function paymentState(doc = {}, today) {
    const total = doc.totalCents;
    const paid = doc.paidCents;
    let st;
    if (total != null && paid != null) {
      st = total > 0 && paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    } else {
      st = doc.status === '3' ? 'paid' : doc.status === '2' ? 'partial' : 'unpaid';
    }
    if (st === 'unpaid' && doc.due && today && doc.due < String(today).slice(0, 10)) st = 'overdue';
    return st;
  }

  /**
   * Sedí doklad v SuperFaktúre s appkou? Suma na cent a číslo (keď
   * appka posiela vlastné). Chýbajúca suma v odpovedi nie je zhoda —
   * vtedy sa doklad dočíta cez view.
   */
  function reconcile({ invoice = {}, doc = {}, settings = {} } = {}) {
    const problems = [];
    const app = expectedCents(invoice);
    if (doc.totalCents == null) problems.push({ key: 'no_total', text: 'SuperFaktúra nevrátila sumu dokladu.' });
    else if (doc.totalCents !== app) {
      problems.push({ key: 'total', text: `Suma v SuperFaktúre je ${M.format(doc.totalCents)}, v appke ${M.format(app)}.` });
    }
    if (settings.use_own_number !== false && doc.number && invoice.invoice_number
      && String(doc.number) !== String(invoice.invoice_number)) {
      problems.push({ key: 'number', text: `SuperFaktúra zapísala číslo ${doc.number}, appka ${invoice.invoice_number}.` });
    }
    return { ok: problems.length === 0, problems };
  }

  /**
   * Doklad podľa čísla v zozname (GET /invoices/index.json). Po neistom
   * pokuse (vypršal čas) sa najprv hľadá, či doklad nevznikol — až potom
   * sa smie zakladať.
   */
  function findInList(json, { number, key } = {}) {
    const list = Array.isArray(json) ? json : (json && (json.items || json.data || json.invoices)) || [];
    for (const row of (Array.isArray(list) ? list : [])) {
      const I = (row && (row.Invoice || row)) || {};
      const byNo = number && String(I.invoice_no_formatted || '') === String(number);
      const byKey = key && String(I.internal_comment || '').includes(`HUB-KEY ${key}`);
      if (byNo || byKey) return readInvoice({ Invoice: I, Client: row.Client, InvoicePayment: row.InvoicePayment });
    }
    return null;
  }

  /**
   * Strana zoznamu faktúr (GET /invoices/index.json/listinfo:1/…) → doklady
   * v tvare readInvoice + stránkovanie. Jedna požiadavka = až 100 dokladov,
   * namiesto jednej požiadavky /invoices/view na každý.
   * @returns {{ items:Array, page:number, pageCount:number|null, itemCount:number|null }}
   */
  function readList(json) {
    const list = Array.isArray(json) ? json : (json && (json.items || json.data || json.invoices)) || [];
    const items = (Array.isArray(list) ? list : []).filter(r => r && r.Invoice).map(r => readInvoice(r));
    const num = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    return { items, page: num(json && json.page), pageCount: num(json && json.pageCount), itemCount: num(json && json.itemCount) };
  }

  // ── Denný limit požiadaviek (sf-budget.js) ────────────────────────────────
  /**
   * „Dnes použité: 123 z 1000 (synchronizácia 80 z 300)". Prázdne, keď stav
   * počítadla nie je známy.
   */
  function usageText(u) {
    if (!u || u.available === false || u.used == null) return '';
    return `Dnes použité: ${u.used} z ${u.limit} (synchronizácia ${u.sync_used} z ${u.sync_budget})`;
  }
  /** Koľko percent denného limitu je použitých (0–100). */
  function usagePct(u) {
    if (!u || !u.limit) return 0;
    return Math.max(0, Math.min(100, Math.round((Number(u.used) || 0) * 100 / u.limit)));
  }
  /** Synchronizácia je na dnes vyčerpaná? */
  function syncExhausted(u) { return !!(u && u.available !== false && u.sync_remaining != null && u.sync_remaining <= 0); }

  /** Klient podľa USt-IdNr / názvu v zozname (GET /clients/index.json). */
  function findClient(json, partner = {}) {
    const list = Array.isArray(json) ? json : (json && (json.items || json.data || json.clients)) || [];
    const norm = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();
    for (const row of (Array.isArray(list) ? list : [])) {
      const C = (row && (row.Client || row)) || {};
      if (partner.ust_idnr && norm(C.ic_dph) === norm(partner.ust_idnr)) return Number(C.id) || C.id;
    }
    return null;
  }

  // ── Chyby SuperFaktúry ────────────────────────────────────────────────────
  // SuperFaktúra vracia `{ error: 1, error_message: … }` — reťazec, pole
  // alebo objekt { pole: [hlášky] }. Tu sa to len zloží do jednej vety;
  // čo s chybou spraviť, rozhoduje server (sf-service.js).

  function flatMessage(m) {
    if (m == null) return '';
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) return m.map(flatMessage).filter(Boolean).join('; ');
    if (typeof m === 'object') {
      return Object.entries(m).map(([k, v]) => `${k}: ${flatMessage(v)}`).filter(Boolean).join('; ');
    }
    return String(m);
  }

  function clip(s, n = 400) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }

  // ── Stav pre obrazovku ────────────────────────────────────────────────────
  /**
   * Čipy „V SuperFaktúre: …" pri faktúre. Prázdne, kým doklad v SuperFaktúre
   * nie je.
   * @returns {Array<{key,label,tone,tip}>}
   */
  function chips(inv = {}) {
    if (!inv || !inv.sf_invoice_id) return [];
    const out = [];
    const credit = isCreditNote(inv);
    out.push({ key: 'issued', label: credit ? 'dobropis vystavený' : 'vystavená', tone: 'blue',
      tip: `Doklad v SuperFaktúre${inv.sf_number ? ` č. ${inv.sf_number}` : ''} (id ${inv.sf_invoice_id}).` });
    if (inv.sf_sent_at || inv.status === 'sent' || inv.sf_status === 'sent') {
      out.push({ key: 'sent', label: 'odoslaná', tone: 'blue', tip: 'Faktúra odišla odberateľovi e-mailom.' });
    }
    if (inv.sf_status === 'paid' || inv.sf_paid_at) {
      out.push({ key: 'paid', label: 'uhradená', tone: 'green', tip: 'Úhrada je zapísaná aj v SuperFaktúre.' });
    } else if (inv.sf_status === 'partial') {
      out.push({ key: 'partial', label: 'čiastočne uhradená', tone: 'amber',
        tip: `V SuperFaktúre je zapísaných ${inv.sf_paid_amount != null ? M.format(M.toCents(inv.sf_paid_amount)) : 'len časť sumy'}.` });
    } else if (inv.status === 'paid' && !credit) {
      out.push({ key: 'unpaid_sf', label: 'úhrada nie je v SF', tone: 'amber',
        tip: 'V appke je faktúra zaplatená, v SuperFaktúre úhrada chýba. Kliknite „Zapísať úhradu do SuperFaktúry".' });
    }
    if (inv.sf_check === 'mismatch') {
      out.push({ key: 'mismatch', label: 'nesúhlasí so SuperFaktúrou', tone: 'red',
        tip: inv.sf_check_note || 'Suma alebo číslo v SuperFaktúre nesedí s appkou. Faktúra sa neodošle, kým sa to nevyrieši.' });
    }
    if (envOf(inv.sf_environment) !== 'production') {
      out.push({ key: 'sandbox', label: 'SANDBOX', tone: 'amber',
        tip: 'Doklad vznikol v skúšobnom účte SuperFaktúry (sandbox). Nie je to ostrý doklad.' });
    }
    return out;
  }

  /** Kľúč pokusu o vystavenie: faktúra + prostredie. */
  function idempotencyKey(inv = {}, env) { return `${inv.id}:${envOf(env)}`; }

  /**
   * Base64 pre parametre zoznamov SuperFaktúry (search:…). Funguje v Node aj v prehliadači.
   * SuperFaktúra chce variant bezpečný v adrese: „+" → „-", „/" → „_", „=" → „,".
   * Bez toho číslo ako „2026042" (končí na „==") vyhľadávanie nenájde.
   */
  function b64(s) {
    const raw = typeof Buffer !== 'undefined'
      ? Buffer.from(String(s), 'utf8').toString('base64')
      : btoa(unescape(encodeURIComponent(String(s))));
    return raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ',');
  }

  const API = {
    BASE, envOf, baseUrl, maskEmail,
    LANG, LANGS, sfLang, TXT, txt, reverseChargeNote, RC_DE, RC_EU,
    isCreditNote, expectedCents, buildItems, itemsCents, buildInvoice, buildClient, splitAddress, myData, unitFor,
    readInvoice, readList, paymentState, reconcile, findInList, findClient,
    flatMessage, clip, chips, idempotencyKey, b64, usageText, usagePct, syncExhausted,
  };
  if (typeof window !== 'undefined') window.DanubraSF = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
