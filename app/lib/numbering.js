// ============================================================================
// DANUBRA — Číselné rady (§6.1)
// ============================================================================
// Číslo prideľuje databáza (`danubra_next_number`, migrácia 094) — atomicky,
// nikdy dvakrát, s rokom v čísle od januára znova od 1. Formát každého radu
// je v nastaveniach (`<rad>_series`):
//
//   prefix      text (môže byť prázdny)         „OBJ", „D", „"
//   year_style  'yyyy' | 'yy' | 'none'          2026 / 26 / bez roka
//   separator   '' | '-' | '/'                   medzi predponou, rokom a poradím
//   digits      3–7                              doplní sa nulami, NIKDY sa neoreže
//
//   faktúry            202600001      dobropisy            D202600001
//   objednávky         OBJ-2026-0001  zákazky              ZAK-2026-0001
//   ponuky             PON-2026-0001  zmluvy s odberateľmi ZML-2026-0001
//   zmluvy so živn.    2026-001       faktúry za živn.     NOVAK-2026-001
//
// Tu je tá istá logika ako v SQL (danubra_series_format, danubra_series_next)
// — pre náhľad v Nastaveniach a pre testy bez databázy. Či číslo už nemá iný
// doklad, vie len databáza; náhľad z nej sa dočíta (danubra_series_preview).
// ============================================================================
(function () {
  /** Rady v poradí, v akom ich ukazuje karta Číselné rady. Musí sedieť s 094. */
  const SERIES = [
    { kind: 'invoice', label: 'Faktúry', doc: 'faktúra', defaults: { prefix: '', year_style: 'yyyy', separator: '', digits: 5 },
      note: 'Číslice z čísla sú zároveň variabilný symbol pri platbe (najviac 10).' },
    { kind: 'credit_note', label: 'Dobropisy', doc: 'dobropis', defaults: { prefix: 'D', year_style: 'yyyy', separator: '', digits: 5 },
      note: 'Opravné faktúry (storno). Predpona sa musí líšiť od faktúr.' },
    { kind: 'order', label: 'Objednávky', doc: 'objednávka', defaults: { prefix: 'OBJ', year_style: 'yyyy', separator: '-', digits: 4 },
      note: 'Objednávky od odberateľov aj objednávky ubytovania.' },
    { kind: 'subcontract', label: 'Zákazky', doc: 'zákazka', defaults: { prefix: 'ZAK', year_style: 'yyyy', separator: '-', digits: 4 } },
    { kind: 'quote', label: 'Ponuky', doc: 'ponuka', defaults: { prefix: 'PON', year_style: 'yyyy', separator: '-', digits: 4 } },
    { kind: 'contract', label: 'Zmluvy s odberateľmi', doc: 'zmluva', defaults: { prefix: 'ZML', year_style: 'yyyy', separator: '-', digits: 4 },
      note: 'Rámcové zmluvy a zmluvy o dielo s nemeckými firmami. Dodatky sa číslujú v rámci zmluvy (Dodatok č. 1, 2…).' },
    { kind: 'worker_contract', label: 'Zmluvy so živnostníkmi', doc: 'zmluva', defaults: { prefix: '', year_style: 'yyyy', separator: '-', digits: 3 },
      note: 'Rámcová zmluva o dielo. Číslo sa pridelí pri prvej tlači zmluvy.' },
    { kind: 'self_bill', label: 'Faktúry za živnostníkov', doc: 'faktúra', defaults: { prefix: '', year_style: 'yyyy', separator: '-', digits: 3 },
      perWorker: true,
      note: 'Samofakturácia: predponu a poradie má každý živnostník svoje (na jeho karte, inak „OV").' },
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
    return { prefix: String(pick('prefix') ?? ''), year_style: pick('year_style'),
      separator: String(pick('separator') ?? ''), digits: Number(pick('digits')) };
  }

  /** Číslo z formátu. Rovnaké ako danubra_series_format v SQL. */
  function format(fmt, year, seq, prefix) {
    const f = fmt || {};
    const pre = prefix != null ? String(prefix) : String(f.prefix || '');
    const parts = [];
    if (pre) parts.push(pre);
    if ((f.year_style || 'yyyy') === 'yyyy') parts.push(String(year));
    else if (f.year_style === 'yy') parts.push(String(Number(year) % 100).padStart(2, '0'));
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
    const pre = BY_KIND[kind] && BY_KIND[kind].perWorker ? (prefix || 'NOVAK') : prefix;
    return format(fmt, year, nextSeq(kind, series, year), pre);
  }

  /** Variabilný symbol = číslice z čísla faktúry. */
  const vsOf = (number) => String(number || '').replace(/\D/g, '');

  /**
   * Chyby formátu pred uložením. Tie isté pravidlá stráži danubra_set_series —
   * tu sú len preto, aby admin videl vetu hneď pri písaní.
   * @returns {string[]}
   */
  function validate(kind, fmt, { next, other, year = new Date().getFullYear() } = {}) {
    const out = [];
    const f = fmt || {};
    if (!/^[A-Za-z0-9]{0,10}$/.test(String(f.prefix || ''))) out.push('Predpona smie mať len písmená bez diakritiky a číslice, najviac 10 znakov.');
    if (BY_KIND[kind] && BY_KIND[kind].perWorker && f.prefix) out.push('Predponu faktúr za živnostníka má každý na svojej karte.');
    if (!['yyyy', 'yy', 'none'].includes(f.year_style)) out.push('Rok v čísle: 2026, 26 alebo bez roka.');
    if (!['', '-', '/'].includes(f.separator)) out.push('Oddeľovač: žiadny, pomlčka alebo lomka.');
    const d = Number(f.digits);
    if (!Number.isInteger(d) || d < 3 || d > 7) out.push('Počet číslic poradia: 3 až 7.');
    if (next != null && next !== '' && (!Number.isInteger(Number(next)) || Number(next) < 1)) out.push('Ďalšie číslo musí byť celé číslo, aspoň 1.');
    if ((kind === 'invoice' || kind === 'credit_note') && Number.isInteger(d) && d >= 3 && d <= 7) {
      const vs = vsOf(format(f, year, Number('9'.repeat(d))));
      if (vs.length > VS_MAX) out.push(`Variabilný symbol by mal ${vs.length} číslic — banka berie najviac ${VS_MAX}.`);
      if (other && String(other.prefix || '') === String(f.prefix || '')) out.push('Faktúry a dobropisy musia mať rozdielnu predponu.');
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
