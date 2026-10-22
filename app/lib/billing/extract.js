// ============================================================================
// DANUBRA — prijatá faktúra zo súboru: čo sa z nej prečíta a čo s tým
// ============================================================================
// „Chcem to vedieť nahrávať cez PDF, kde vyextrahuješ, čo treba."
//
// Súbor prečíta model (PDF, fotka) alebo táto knižnica (e-faktúra v XML —
// od 1. 1. 2027 tak prídu tuzemské faktúry od platiteľov DPH). Výsledok má
// v oboch prípadoch rovnaký tvar a ide cez `normalize`:
//
//   • sumy na dve desatinné, dátumy na RRRR-MM-DD, IBAN bez medzier,
//   • IČO a VS len číslice,
//   • čo chýba a dá sa dopočítať (základ + DPH = spolu), sa dopočíta.
//
// Potom sa faktúra priradí — k živnostníkovi podľa IČO, IBAN-u alebo mena,
// inak zostane od dodávateľa — a povie sa, čo si treba overiť: dvakrát
// nahratá faktúra, iný IBAN, než má živnostník v appke (klasický podvod
// s „novým číslom účtu"), faktúra nie na nás, sumy, čo nesedia.
//
// Model sa nemýli často, ale mýli sa. Preto nič z toho sa neuloží ako
// potvrdené — faktúra čaká v stave „Na kontrolu", kým ju človek neodklikne.
//
// Čisté funkcie, bez siete. Testy: node app/lib/billing/extract.test.js
// ============================================================================
(function () {
  // ── Čo sa od modelu pýta ──────────────────────────────────────────────────
  const strana = (popis) => ({
    type: 'object', description: popis,
    properties: {
      name: { type: 'string', description: 'Obchodné meno' },
      ico: { type: 'string', description: 'IČO (SK/CZ 8 číslic) alebo iné registračné číslo' },
      dic: { type: 'string', description: 'DIČ' },
      ic_dph: { type: 'string', description: 'IČ DPH / USt-IdNr, napr. SK2020123456' },
      iban: { type: 'string', description: 'IBAN, kam sa má platiť' },
      country: { type: 'string', description: 'Krajina, dvojpísmenový kód (SK, CZ, DE…)' },
      address: { type: 'string', description: 'Adresa jedným riadkom' },
    },
  });

  const TOOL = {
    name: 'zapis_fakturu',
    description: 'Zapíše údaje prečítané z prijatej faktúry.',
    input_schema: {
      type: 'object',
      properties: {
        doc_type: { type: 'string', enum: ['invoice', 'credit_note', 'proforma', 'receipt', 'other'],
          description: 'faktúra, dobropis, zálohová (proforma), pokladničný doklad, iné' },
        number: { type: 'string', description: 'Číslo faktúry tak, ako je na nej' },
        variable_symbol: { type: 'string', description: 'Variabilný symbol (často = číslo faktúry)' },
        issue_date: { type: 'string', description: 'Dátum vystavenia, RRRR-MM-DD' },
        delivery_date: { type: 'string', description: 'Dátum dodania / zdaniteľného plnenia, RRRR-MM-DD' },
        due_date: { type: 'string', description: 'Dátum splatnosti, RRRR-MM-DD' },
        currency: { type: 'string', description: 'Mena, napr. EUR' },
        total: { type: 'number', description: 'Suma na úhradu spolu (s DPH)' },
        vat: { type: 'number', description: 'DPH spolu (0, ak nie je platiteľ alebo prenesenie)' },
        base: { type: 'number', description: 'Základ dane / suma bez DPH' },
        reverse_charge: { type: 'boolean', description: 'Prenesenie daňovej povinnosti' },
        supplier: strana('Dodávateľ — kto faktúru vystavil a komu sa platí'),
        customer: strana('Odberateľ — komu je faktúra adresovaná'),
        period_from: { type: 'string', description: 'Fakturované obdobie od, RRRR-MM-DD' },
        period_to: { type: 'string', description: 'Fakturované obdobie do, RRRR-MM-DD' },
        hours: { type: 'number', description: 'Počet hodín, ak sa fakturuje za hodiny' },
        rate: { type: 'number', description: 'Sadzba za hodinu, ak je' },
        category: { type: 'string', description: 'Kategória nákladu — jeden z kľúčov zo zadania' },
        items: {
          type: 'array', description: 'Položky (najviac 20)',
          items: { type: 'object', properties: {
            description: { type: 'string' }, quantity: { type: 'number' }, unit: { type: 'string' },
            unit_price: { type: 'number' }, total: { type: 'number' } } },
        },
        uncertain: { type: 'array', items: { type: 'string' },
          description: 'Názvy polí, ktoré sú nečitateľné alebo si nimi nie si istý' },
        note: { type: 'string', description: 'Čokoľvek dôležité, čo sa inam nezmestí (krátko, po slovensky)' },
      },
      required: ['number', 'total', 'supplier'],
    },
  };

  /**
   * Zadanie pre model. `company` je naša firma (aby vedel, kto je odberateľ),
   * `categories` sú kľúče nákladov [[kľúč, názov]].
   */
  function instructions({ company = {}, categories = [] } = {}) {
    return [
      'Si účtovník. Prečítaj priloženú prijatú faktúru (doklad od dodávateľa) a zapíš jej údaje.',
      '',
      `Odberateľ by mala byť naša firma: ${company.name || '—'}${company.ico ? `, IČO ${company.ico}` : ''}.`,
      'Dodávateľ je ten, kto faktúru vystavil a komu sa platí — nie my.',
      '',
      'PRAVIDLÁ',
      '- Prepisuj presne, nič si nevymýšľaj. Čo na doklade nie je, vynechaj.',
      '- Dátumy ako RRRR-MM-DD. Sumy ako čísla s bodkou (1234.56), bez meny a medzier.',
      '- total = suma na úhradu. Ak je na doklade záloha už odpočítaná, total je to, čo zostáva zaplatiť.',
      '- IBAN prepíš celý, presne (z textu alebo z QR kódu, ak je čitateľný).',
      '- Variabilný symbol hľadaj ako „VS", „Variabilný symbol", „Verwendungszweck"; ak chýba, nechaj prázdny.',
      '- Ak je to faktúra od živnostníka za prácu na hodiny, vyplň hours a rate.',
      `- category vyber z: ${categories.map(([k, l]) => `${k} (${l})`).join(', ') || 'other'}.`,
      '- Do uncertain daj polia, ktoré sú rozmazané, zakryté alebo si nimi nie si istý.',
      '- note po slovensky, jednou vetou, len ak je niečo dôležité (napr. „zálohová faktúra", „sumy sa nedajú prečítať").',
    ].join('\n');
  }

  // ── Čistenie ──────────────────────────────────────────────────────────────
  const str = (v) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();

  /** „1 234,56 €" / 1234.567 / „1.234,56" → 1234.56; nezmysel → null. */
  function money(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
    let s = String(v).replace(/[^\d,.\-]/g, '');
    if (!s) return null;
    const ciarka = s.lastIndexOf(','), bodka = s.lastIndexOf('.');
    if (ciarka > bodka) s = s.replace(/\./g, '').replace(',', '.');   // 1.234,56
    else s = s.replace(/,/g, '');                                      // 1,234.56
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }

  /** „2026-10-21" / „21.10.2026" / „21. 10. 2026" → „2026-10-21"; inak null. */
  function date(v) {
    const s = str(v);
    if (!s) return null;
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    let y, mo, d;
    if (m) [, y, mo, d] = m;
    else if ((m = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/))) [, d, mo, y] = m;
    else return null;
    const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const t = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso ? null : iso;
  }

  const digits = (v) => str(v).replace(/\D/g, '');

  function ibanClean(v) {
    return str(v).toUpperCase().replace(/^IBAN:?\s*/, '').replace(/[^A-Z0-9]/g, '');
  }

  /** Kontrolný súčet IBAN (mod 97). Preklep v jednej číslici neprejde. */
  function ibanValid(v) {
    const s = ibanClean(v);
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
    const r = s.slice(4) + s.slice(0, 4);
    let mod = 0;
    for (const ch of r) {
      const n = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
      for (const c of n) mod = (mod * 10 + Number(c)) % 97;
    }
    return mod === 1;
  }

  function party(p) {
    p = p || {};
    const icDph = str(p.ic_dph).toUpperCase().replace(/\s/g, '');
    return {
      name: str(p.name), ico: digits(p.ico), dic: digits(p.dic), ic_dph: icDph,
      iban: ibanClean(p.iban), country: str(p.country).toUpperCase().slice(0, 2),
      address: str(p.address),
    };
  }

  const DOC_TYPES = ['invoice', 'credit_note', 'proforma', 'receipt', 'other'];

  /** Surový výsledok (model alebo XML) → jednotný tvar. */
  function normalize(raw) {
    const r = raw || {};
    let total = money(r.total), vat = money(r.vat), base = money(r.base);
    if (total == null && base != null) total = Math.round((base + (vat || 0)) * 100) / 100;
    if (base == null && total != null && vat != null) base = Math.round((total - vat) * 100) / 100;
    if (vat == null && total != null && base != null) vat = Math.round((total - base) * 100) / 100;
    const items = (Array.isArray(r.items) ? r.items : []).slice(0, 20).map(i => ({
      description: str(i && i.description), quantity: money(i && i.quantity),
      unit: str(i && i.unit), unit_price: money(i && i.unit_price), total: money(i && i.total),
    })).filter(i => i.description || i.total != null);
    const number = str(r.number);
    let vs = digits(r.variable_symbol).slice(0, 10);
    return {
      doc_type: DOC_TYPES.includes(r.doc_type) ? r.doc_type : 'invoice',
      number,
      variable_symbol: vs || null,
      issue_date: date(r.issue_date), delivery_date: date(r.delivery_date), due_date: date(r.due_date),
      currency: (str(r.currency).toUpperCase().match(/[A-Z]{3}/) || ['EUR'])[0],
      total, vat, base,
      reverse_charge: !!r.reverse_charge,
      supplier: party(r.supplier), customer: party(r.customer),
      period_from: date(r.period_from), period_to: date(r.period_to),
      hours: money(r.hours), rate: money(r.rate),
      category: str(r.category) || null,
      items,
      uncertain: (Array.isArray(r.uncertain) ? r.uncertain : []).map(str).filter(Boolean),
      note: str(r.note) || null,
    };
  }

  // ── Komu faktúra patrí ────────────────────────────────────────────────────
  const meno = (s) => str(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  /**
   * Živnostník, od ktorého faktúra je: podľa IČO, potom IBAN-u, potom mena.
   * Meno sa berie len celé — „Ján Novák" nesmie trafiť „Ján Nováková".
   */
  function matchWorker(f, workers = []) {
    const s = (f && f.supplier) || {};
    if (s.ico) {
      const w = workers.find(x => digits(x.company_id) === s.ico);
      if (w) return { worker: w, by: 'ico' };
    }
    if (s.iban) {
      const w = workers.find(x => ibanClean(x.bank_iban) && ibanClean(x.bank_iban) === s.iban);
      if (w) return { worker: w, by: 'iban' };
    }
    const n = meno(s.name);
    if (n) {
      const w = workers.find(x => [x.full_name, x.company_name].some(v => {
        const m = meno(v);
        return m && (m === n || ` ${n} `.includes(` ${m} `));
      }));
      if (w) return { worker: w, by: 'name' };
    }
    return { worker: null, by: null };
  }

  /**
   * Čo si treba overiť, kým sa faktúra potvrdí. Každá veta hovorí, čo
   * spraviť — nie len, čo je zle.
   */
  function warnings(f, { worker = null, company = {}, bills = [], selfId = null } = {}) {
    const out = [];
    if (!f) return out;
    if (f.doc_type === 'credit_note') out.push('Je to dobropis, nie faktúra — suma nám ide späť.');
    if (f.doc_type === 'proforma') out.push('Je to zálohová faktúra — nie je daňový doklad, po zaplatení príde ostrá.');
    if (f.doc_type === 'other') out.push('Nevyzerá to ako faktúra ani bloček — skontrolujte, čo ste nahrali.');
    if (f.total == null) out.push('Suma sa nedala prečítať — doplňte ju.');
    // Bloček je zaplatený na mieste — splatnosť nemá.
    if (!f.due_date && f.doc_type !== 'receipt') {
      out.push('Chýba splatnosť — doplňte ju, inak sa v prehľade platieb ráta 14 dní od vystavenia.');
    }
    if (f.currency && f.currency !== 'EUR') out.push(`Faktúra je v mene ${f.currency}, nie v eurách.`);
    if (f.base != null && f.vat != null && f.total != null
        && Math.abs(f.base + f.vat - f.total) > 0.02) {
      out.push('Základ a DPH nedávajú dokopy sumu na úhradu — pozrite sa, či nie je odpočítaná záloha.');
    }
    const iban = f.supplier && f.supplier.iban;
    if (iban && !ibanValid(iban)) out.push('IBAN na faktúre nemá správny kontrolný súčet — je v ňom preklep.');
    if (worker && iban && ibanClean(worker.bank_iban) && ibanClean(worker.bank_iban) !== iban) {
      out.push('IBAN na faktúre je iný, než má živnostník v appke. Než zaplatíte, overte si to u neho telefonicky.');
    }
    const naNas = digits(company.ico);
    const odb = f.customer || {};
    if (naNas && odb.ico && odb.ico !== naNas) out.push('Faktúra nie je vystavená na našu firmu (iné IČO odberateľa).');
    // Dvakrát nahratá: rovnaký dodávateľ a rovnaké číslo.
    if (f.number) {
      const kto = (b) => (worker && b.worker_id === worker.id)
        || (f.supplier && f.supplier.ico && digits(b.supplier_ico) === f.supplier.ico);
      const dvakrat = bills.find(b => b && b.id !== selfId && b.status !== 'discarded'
        && str(b.bill_number) === f.number && kto(b));
      if (dvakrat) out.push(`Faktúru ${f.number} od tohto dodávateľa už máme — možno je nahratá dvakrát.`);
    }
    if ((f.uncertain || []).length) {
      const nazov = (k) => POLIA[String(k).replace(/^supplier\.|^customer\./, '')] || k;
      out.push(`Nie celkom čitateľné: ${[...new Set(f.uncertain.map(nazov))].join(', ')} — skontrolujte to.`);
    }
    return out;
  }

  // Názvy polí po slovensky — do upozornenia, nie „variable_symbol".
  const POLIA = { number: 'číslo faktúry', variable_symbol: 'variabilný symbol', issue_date: 'dátum vystavenia',
    delivery_date: 'dátum dodania', due_date: 'splatnosť', total: 'suma', vat: 'DPH', base: 'základ',
    iban: 'IBAN', ico: 'IČO', dic: 'DIČ', ic_dph: 'IČ DPH', name: 'meno dodávateľa', currency: 'mena',
    hours: 'hodiny', rate: 'sadzba', items: 'položky', supplier: 'dodávateľ', customer: 'odberateľ' };

  /** Stĺpce prijatej faktúry z prečítaných údajov (pred potvrdením). */
  function billPatch(f, { worker = null } = {}) {
    const s = f.supplier || {};
    return {
      bill_number: f.number || null,
      variable_symbol: f.variable_symbol || null,
      issue_date: f.issue_date, delivery_date: f.delivery_date || f.period_to || null,
      due_date: f.due_date,
      amount: f.total == null ? 0 : f.total,
      vat_amount: f.vat == null ? 0 : f.vat,
      base_amount: f.base,
      currency: f.currency || 'EUR',
      worker_id: worker ? worker.id : null,
      supplier_name: s.name || null, supplier_ico: s.ico || null, supplier_dic: s.dic || null,
      supplier_ic_dph: s.ic_dph || null, supplier_iban: s.iban || null,
      category: worker ? 'work' : (f.category || null),
    };
  }

  // ── E-faktúra (UBL 2.1 / Peppol BIS 3) ────────────────────────────────────
  // Malý čítač XML: prvky bez menného priestoru, atribúty, text. Na faktúru
  // stačí — knižnica by sa do prehliadača aj na server niesla zbytočne.
  function xmlTree(xml) {
    const root = { name: '#root', attrs: {}, children: [], text: '' };
    const stack = [root];
    const src = String(xml || '')
      .replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, t) => t.replace(/</g, '&lt;'));
    const re = /<(\/?)([\w.-]+:)?([\w.-]+)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
    const ent = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&amp;/g, '&');
    let m;
    while ((m = re.exec(src))) {
      const top = stack[stack.length - 1];
      if (m[6] != null) { top.text += ent(m[6]); continue; }
      if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
      const attrs = {};
      String(m[4] || '').replace(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_, k, a, b) => {
        attrs[k.replace(/^[\w.-]+:/, '')] = ent(a != null ? a : b);
      });
      const el = { name: m[3], attrs, children: [], text: '' };
      top.children.push(el);
      if (!m[5]) stack.push(el);
    }
    return root;
  }

  const kid = (el, name) => (el && el.children.find(c => c.name === name)) || null;
  const kids = (el, name) => (el ? el.children.filter(c => c.name === name) : []);
  const at = (el, path) => path.split('/').reduce((e, n) => kid(e, n), el);
  const txt = (el, path) => { const e = path ? at(el, path) : el; return e ? e.text.trim() : ''; };

  function ublParty(p) {
    if (!p) return {};
    const party = kid(p, 'Party');
    const tax = kids(party, 'PartyTaxScheme').map(t => txt(t, 'CompanyID')).filter(Boolean);
    const legal = kid(party, 'PartyLegalEntity');
    const icDph = tax.find(t => /^[A-Z]{2}/.test(t)) || '';
    const ids = kids(party, 'PartyIdentification').map(i => txt(i, 'ID')).filter(Boolean);
    return {
      name: txt(party, 'PartyName/Name') || txt(legal, 'RegistrationName'),
      ico: txt(legal, 'CompanyID') || ids.find(i => /^\d{6,8}$/.test(i)) || '',
      dic: tax.find(t => /^\d{10}$/.test(t)) || ids.find(i => /^\d{10}$/.test(i)) || '',
      ic_dph: icDph,
      country: txt(party, 'PostalAddress/Country/IdentificationCode'),
      address: [txt(party, 'PostalAddress/StreetName'), txt(party, 'PostalAddress/CityName')]
        .filter(Boolean).join(', '),
    };
  }

  /** Je to e-faktúra v UBL? (Invoice alebo CreditNote ako koreň.) */
  function isUbl(xml) {
    const r = xmlTree(xml).children[0];
    return !!r && ['Invoice', 'CreditNote'].includes(r.name);
  }

  /** UBL → surový tvar ako od modelu (ide potom cez `normalize`). */
  function parseUbl(xml) {
    const doc = xmlTree(xml).children[0];
    if (!doc || !['Invoice', 'CreditNote'].includes(doc.name)) return null;
    const pay = kids(doc, 'PaymentMeans');
    const iban = pay.map(p => txt(p, 'PayeeFinancialAccount/ID')).find(Boolean) || '';
    const vs = pay.map(p => txt(p, 'PaymentID')).find(Boolean) || '';
    const tot = kid(doc, 'LegalMonetaryTotal');
    const taxTotals = kids(doc, 'TaxTotal');
    const vat = taxTotals.map(t => money(txt(t, 'TaxAmount'))).find(v => v != null);
    const rc = taxTotals.some(t => kids(t, 'TaxSubtotal')
      .some(s => txt(s, 'TaxCategory/ID') === 'AE'));
    const lineName = doc.name === 'CreditNote' ? 'CreditNoteLine' : 'InvoiceLine';
    const qtyName = doc.name === 'CreditNote' ? 'CreditedQuantity' : 'InvoicedQuantity';
    const supplier = ublParty(kid(doc, 'AccountingSupplierParty'));
    return {
      doc_type: doc.name === 'CreditNote' ? 'credit_note' : 'invoice',
      number: txt(doc, 'ID'),
      variable_symbol: vs,
      issue_date: txt(doc, 'IssueDate'),
      delivery_date: txt(doc, 'Delivery/ActualDeliveryDate') || txt(doc, 'TaxPointDate'),
      due_date: txt(doc, 'DueDate') || pay.map(p => txt(p, 'PaymentDueDate')).find(Boolean) || '',
      currency: txt(doc, 'DocumentCurrencyCode'),
      total: txt(tot, 'PayableAmount') || txt(tot, 'TaxInclusiveAmount'),
      base: txt(tot, 'TaxExclusiveAmount'),
      vat: vat == null ? null : vat,
      reverse_charge: rc,
      supplier: { ...supplier, iban },
      customer: ublParty(kid(doc, 'AccountingCustomerParty')),
      period_from: txt(doc, 'InvoicePeriod/StartDate'),
      period_to: txt(doc, 'InvoicePeriod/EndDate'),
      items: kids(doc, lineName).map(l => ({
        description: txt(l, 'Item/Name') || txt(l, 'Item/Description'),
        quantity: txt(l, qtyName), unit: (at(l, qtyName) || { attrs: {} }).attrs.unitCode || '',
        unit_price: txt(l, 'Price/PriceAmount'), total: txt(l, 'LineExtensionAmount'),
      })),
    };
  }

  /** Druh nahratého súboru podľa typu a prípony. */
  function fileKind(file) {
    const t = String((file && file.type) || '').toLowerCase();
    const n = String((file && file.name) || '').toLowerCase();
    if (t === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
    if (t.includes('xml') || n.endsWith('.xml')) return 'xml';
    if (t.startsWith('image/') || /\.(jpe?g|png|heic|webp|tiff?)$/.test(n)) return 'image';
    return null;
  }

  const API = { TOOL, instructions, money, date, ibanClean, ibanValid, normalize, matchWorker,
    warnings, billPatch, xmlTree, isUbl, parseUbl, fileKind };
  if (typeof window !== 'undefined') window.DanubraExtract = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
