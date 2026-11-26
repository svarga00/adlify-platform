// ============================================================================
// DANUBRA — Číselné rady (§6.1)
// ============================================================================
// Číslo prideľuje databáza (`danubra_next_number`, migrácia 094) — atomicky,
// nikdy dvakrát, s rokom v čísle od januára znova od 1. Formát každého radu
// je v nastaveniach (`<rad>_series`):
//
//   prefix      text (môže byť prázdny)         „OBJ", „D", „"
//   year_style  'yyyy' | 'yy' | 'none'          2026 / 26 / bez roka
//   code        '' alebo dve číslice             kód druhu dokladu, v každom rade iný
//   separator   '' | '-' | '/'                   medzi predponou, rokom, kódom a poradím
//   digits      3–7                              doplní sa nulami, NIKDY sa neoreže
//
// Predvolené (majiteľ): rok + kód druhu + 4 číslice, bez oddeľovačov — číslo
// samo povie, čo je to za doklad, a celé je variabilný symbol (10 číslic):
//
//   01 faktúry      2026010001     02 objednávky   2026020001
//   04 ponuky       2026040001     05 zmluvy       2026050001
//   06 dodatky      2026060001     07 zákazky      2026070001
//   08 dobropisy    2026080001     09 faktúry za živnostníkov 2026090001
//   10 zmluvy so živnostníkmi 2026100001
//
// Tu je tá istá logika ako v SQL (danubra_series_format, danubra_series_next)
// — pre náhľad v Nastaveniach a pre testy bez databázy. Či číslo už nemá iný
// doklad, vie len databáza; náhľad z nej sa dočíta (danubra_series_preview).
// ============================================================================
(function () {
  const D = (code) => ({ prefix: '', year_style: 'yyyy', code, separator: '', digits: 4 });
  /** Rady v poradí kódov. Musí sedieť s danubra_series_defaults (094). */
  const SERIES = [
    { kind: 'invoice', label: 'Faktúry', next: 'Ďalšia faktúra', defaults: D('01'),
      note: 'Vydané faktúry odberateľom. Celé číslo je zároveň variabilný symbol pri platbe (najviac 10 číslic).' },
    { kind: 'order', label: 'Objednávky', next: 'Ďalšia objednávka', defaults: D('02'),
      note: 'Objednávky od odberateľov (aj objednávka pre živnostníka je tá istá objednávka) a objednávky ubytovania.' },
    { kind: 'quote', label: 'Ponuky', next: 'Ďalšia ponuka', defaults: D('04') },
    { kind: 'contract', label: 'Zmluvy s odberateľmi', next: 'Ďalšia zmluva', defaults: D('05'),
      note: 'Rámcové zmluvy a zmluvy o dielo s nemeckými firmami.' },
    { kind: 'amendment', label: 'Dodatky zmlúv', next: 'Ďalší dodatok', defaults: D('06'),
      note: 'Číslo sa pridelí pri zápise dodatku, keď pole „Číslo dodatku" necháte prázdne.' },
    { kind: 'subcontract', label: 'Zákazky', next: 'Ďalšia zákazka', defaults: D('07') },
    { kind: 'credit_note', label: 'Dobropisy', next: 'Ďalší dobropis', defaults: D('08'),
      note: 'Opravné faktúry (storno faktúry). Celé číslo je variabilný symbol.' },
    { kind: 'self_bill', label: 'Faktúry za živnostníkov', next: 'Ďalšia faktúra za živnostníka', defaults: { ...D('09'), per_worker: false },
      perWorkerOption: true,
      note: 'Samofakturácia: faktúry, ktoré vystavujeme v mene živnostníka. Predvolene jeden spoločný rad; '
        + 'dá sa prepnúť na rad podľa živnostníka (predpona z jeho karty, napr. NOVAK-2026-001).' },
    { kind: 'worker_contract', label: 'Zmluvy so živnostníkmi', next: 'Ďalšia zmluva so živnostníkom', defaults: D('10'),
      note: 'Rámcová zmluva o dielo. Číslo sa pridelí pri prvej tlači zmluvy.' },
  ];
  const BY_KIND = Object.fromEntries(SERIES.map(s => [s.kind, s]));
  const YEAR_STYLES = [['yyyy', '2026'], ['yy', '26'], ['none', 'bez roka']];
  const SEPARATORS = [['', 'žiadny'], ['-', 'pomlčka -'], ['/', 'lomka /']];
  const VS_MAX = 10;

  /** Formát radu: predvolené hodnoty + to, čo je uložené. */
  function formatOf(kind, series) {
    const d = (BY_KIND[kind] || BY_KIND.order).defaults;
    const s = series || {};
    const pick = (k) => (s[k] === undefined || s[k] === null ? d[k] : s[k]);
    const out = { prefix: String(pick('prefix') ?? ''), year_style: pick('year_style'), code: String(pick('code') ?? ''),
      separator: String(pick('separator') ?? ''), digits: Number(pick('digits')) };
    if ('per_worker' in d) out.per_worker = !!pick('per_worker');
    return out;
  }

  /** Číslo z formátu: predpona, rok, kód, poradie. Rovnaké ako danubra_series_format v SQL. */
  function format(fmt, year, seq, prefix) {
    const f = fmt || {};
    const pre = prefix != null ? String(prefix) : String(f.prefix || '');
    const parts = [];
    if (pre) parts.push(pre);
    if ((f.year_style || 'yyyy') === 'yyyy') parts.push(String(year));
    else if (f.year_style === 'yy') parts.push(String(Number(year) % 100).padStart(2, '0'));
    if (f.code) parts.push(String(f.code));
    const s = String(seq);
    parts.push(s.padStart(Math.max(Number(f.digits) || 4, s.length), '0'));
    return parts.join(f.separator || '');
  }

  /**
   * Ďalšie poradie bez zápisu (bez kontroly obsadených čísel — tú robí
   * databáza). S rokom v čísle sa v novom roku začne od 1.
   */
  function nextSeq(kind, series, year) {
    const fmt = formatOf(kind, series);
    const s = series || {};
    if (fmt.year_style !== 'none' && Number(s.year || 0) !== Number(year)) return 1;
    return (Number(s.current) || 0) + 1;
  }

  /** Ďalšie číslo radu (náhľad). */
  function preview(kind, series, year, prefix) {
    const fmt = formatOf(kind, series);
    const pre = fmt.per_worker ? (prefix || 'NOVAK') : prefix;
    return format(fmt, year, nextSeq(kind, series, year), pre);
  }

  /** Variabilný symbol = číslice z čísla faktúry. */
  const vsOf = (number) => String(number || '').replace(/\D/g, '');

  /**
   * Chyby formátu pred uložením. Tie isté pravidlá stráži danubra_set_series —
   * tu sú len preto, aby admin videl vetu hneď pri písaní.
   * @param {Object} all  formáty ostatných radov { kind: fmt } (kód a formát musia byť iné)
   * @returns {string[]}
   */
  function validate(kind, fmt, { next, all = {}, year = new Date().getFullYear() } = {}) {
    const out = [];
    const f = fmt || {};
    if (!/^[A-Za-z0-9]{0,10}$/.test(String(f.prefix || ''))) out.push('Predpona smie mať len písmená bez diakritiky a číslice, najviac 10 znakov.');
    if (f.per_worker && f.prefix) out.push('Pri rade podľa živnostníka je predpona na jeho karte — tu nechajte prázdnu.');
    if (!['yyyy', 'yy', 'none'].includes(f.year_style)) out.push('Rok v čísle: 2026, 26 alebo bez roka.');
    if (!/^(\d{2})?$/.test(String(f.code || ''))) out.push('Kód druhu dokladu sú dve číslice (01–99) alebo nič.');
    if (!['', '-', '/'].includes(f.separator)) out.push('Oddeľovač: žiadny, pomlčka alebo lomka.');
    const d = Number(f.digits);
    if (!Number.isInteger(d) || d < 3 || d > 7) out.push('Počet číslic poradia: 3 až 7.');
    if (next != null && next !== '' && (!Number.isInteger(Number(next)) || Number(next) < 1)) out.push('Ďalšie číslo musí byť celé číslo, aspoň 1.');
    if (f.per_worker && next != null && next !== '') out.push('Pri rade podľa živnostníka má poradie každý svoje.');
    const head = (x) => [x.prefix || '', x.year_style, x.code || '', x.separator || ''].join('|');
    for (const [k, o] of Object.entries(all)) {
      if (k === kind || !o) continue;
      const lbl = (BY_KIND[k] || {}).label || k;
      if (f.code && String(o.code || '') === String(f.code)) out.push(`Kód ${f.code} už má rad „${lbl}". Každý druh dokladu potrebuje vlastný kód.`);
      else if (head(o) === head(f)) out.push(`Formát je rovnaký ako v rade „${lbl}" — líšiť sa musí predpona alebo kód.`);
    }
    if ((kind === 'invoice' || kind === 'credit_note') && Number.isInteger(d) && d >= 3 && d <= 7) {
      const vs = vsOf(format(f, year, Number('9'.repeat(d))));
      if (vs.length > VS_MAX) out.push(`Variabilný symbol by mal ${vs.length} číslic — banka berie najviac ${VS_MAX}.`);
    }
    return out;
  }

  // ── Staré názvy (testy a volania spred 094) ───────────────────────────────

  /** Výsledok kroku radu: { year, current, seq }. Čistá funkcia. */
  function nextInSeries(series, currentYear, kind = 'order') {
    const seq = nextSeq(kind, series, currentYear);
    return { year: currentYear, current: seq, seq };
  }
  function formatOrderNumber(year, seq) { return format(formatOf('order'), year, seq); }
  function formatInvoiceNumber(year, seq) { return format(formatOf('invoice'), year, seq); }
  function nextNumber(kind, series, currentYear) {
    const { year, current, seq } = nextInSeries(series, currentYear, kind);
    return { number: format(formatOf(kind, series), year, seq), newSeries: { ...(series || {}), year, current } };
  }
  const nextOrderNumber = (series, y) => nextNumber('order', series, y);
  const nextInvoiceNumber = (series, y) => nextNumber('invoice', series, y);

  const API = {
    SERIES, BY_KIND, YEAR_STYLES, SEPARATORS, VS_MAX,
    formatOf, format, nextSeq, preview, vsOf, validate,
    nextInSeries, nextNumber, nextOrderNumber, nextInvoiceNumber, formatOrderNumber, formatInvoiceNumber,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.DanubraNumbering = API;
})();
