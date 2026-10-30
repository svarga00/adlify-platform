// ============================================================================
// DANUBRA — zoznam s filtrami: čistá logika (bez DOM)
// ============================================================================
// „Chýbajú mi všade filtre, aby sme vedeli filtrovať."
//
// Každý zoznam v appke (Zákazky, Dopyty, Ponuky, Faktúry…) mal vlastné
// pilulky a vlastný výber a každý sa správal trochu inak. Toto je jedna
// logika pre všetky: čo filter prepustí, koľko čoho je, ako sa zoradí,
// ako sa zoskupí a čo sa zapamätá. Vykresľuje ju `js/components/datalist.js`
// (`DataList`) — tam je aj návod, ako ho nasadiť na ďalšiu obrazovku.
//
// Typy filtrov (`type`):
//   search        text v poliach `fields` (reťazec = cesta „partner.name",
//                 alebo funkcia); bez ohľadu na diakritiku a veľkosť písmen
//   select        jedna hodnota; '' = všetko
//   multi         viac hodnôt; [] = všetko
//   range-date    { from, to } — nad jedným dátumom (`field`) alebo prekryv
//                 s obdobím riadku (`start` + `end`)
//   range-number  { min, max } nad číslom (`value`)
//   toggle        true/false — riadok prejde, keď `test(row)` vráti true
//
// Hodnota riadku pre select/multi je `value` (funkcia alebo cesta, predvolene
// `key`). Smie byť aj pole — riadok s viacerými štítkami.
//
// Testy: node app/lib/datalist.test.js
// ============================================================================
(function () {
  /** Prázdna hodnota „bez hodnoty" vo výbere (riadok nemá odberateľa…). */
  const NONE = '__none__';

  function norm(v) {
    return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  function pluck(row, path) {
    return String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), row);
  }
  const day = (s) => (s ? String(s).slice(0, 10) : '');
  const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(day(s));
  const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

  /** Hodnota riadku pre filter — vždy pole (kvôli riadkom s viacerými štítkami). */
  function rowValues(def, row) {
    const src = def.value != null ? def.value : def.key;
    const v = typeof src === 'function' ? src(row) : pluck(row, src);
    const list = Array.isArray(v) ? v : [v];
    const out = list.map(x => (x === '' || x == null ? (def.emptyLabel ? NONE : null) : String(x)))
      .filter(x => x != null);
    return out;
  }

  // ── Hodnoty filtrov ───────────────────────────────────────────────────────
  function emptyValue(def) {
    switch (def && def.type) {
      case 'multi': return [];
      case 'toggle': return false;
      case 'range-date': return { from: '', to: '' };
      case 'range-number': return { min: '', max: '' };
      default: return '';
    }
  }

  /** Hodnota z úložiska alebo z kódu, upravená na tvar, aký filter čaká. */
  function cleanValue(def, v) {
    const e = emptyValue(def);
    if (v == null) return e;
    switch (def.type) {
      case 'multi': return Array.isArray(v) ? [...new Set(v.map(String))] : e;
      case 'toggle': return v === true;
      case 'range-date': return typeof v === 'object'
        ? { from: isDay(v.from) ? day(v.from) : '', to: isDay(v.to) ? day(v.to) : '' } : e;
      case 'range-number': return typeof v === 'object'
        ? { min: num(v.min) == null ? '' : num(v.min), max: num(v.max) == null ? '' : num(v.max) } : e;
      default: return typeof v === 'string' || typeof v === 'number' ? String(v) : e;
    }
  }

  /** Filtruje niečo? Prázdne hodnoty („všetko") nie. */
  function isActive(def, v) {
    if (!def) return false;
    switch (def.type) {
      case 'multi': return Array.isArray(v) && v.length > 0;
      case 'toggle': return v === true;
      case 'range-date': return !!(v && (v.from || v.to));
      case 'range-number': return !!(v && (num(v.min) != null || num(v.max) != null));
      default: return v != null && String(v).trim() !== '';
    }
  }

  // ── Stav zoznamu ──────────────────────────────────────────────────────────
  /** Kľúče, podľa ktorých sa dá zoradiť: stĺpce + `sorts` navyše. */
  function sortOptions(cfg) {
    const out = [];
    for (const c of (cfg && cfg.columns) || []) {
      if (c.sort === false || (!c.sortValue && c.sort !== true)) continue;
      out.push({ key: c.key, label: c.sortLabel || c.label, value: c.sortValue || ((r) => pluck(r, c.key)),
        dir: c.sortDir || 1, column: true });
    }
    for (const s of (cfg && cfg.sorts) || []) {
      if (out.some(o => o.key === s.key)) continue;
      out.push({ key: s.key, label: s.label, value: s.value || ((r) => pluck(r, s.key)), dir: s.dir || 1, column: false });
    }
    return out;
  }

  function defaults(cfg) {
    const f = {};
    for (const d of (cfg && cfg.filters) || []) f[d.key] = cleanValue(d, d.default);
    const so = sortOptions(cfg);
    const want = cfg && cfg.sort;
    const pick = (want && so.find(s => s.key === want.key)) || so[0] || null;
    return {
      f,
      sort: pick ? { key: pick.key, dir: want && want.key === pick.key && want.dir ? (want.dir < 0 ? -1 : 1) : pick.dir } : null,
      group: (cfg && cfg.group && ((cfg.groups || []).some(g => g.key === cfg.group)) ? cfg.group : ''),
    };
  }

  /**
   * Stav zo zapamätaného (localStorage) — čo nesedí na dnešné filtre, sa
   * zahodí. Filter, ktorý medzičasom pribudol, dostane predvolenú hodnotu.
   */
  function sanitize(saved, cfg) {
    const d = defaults(cfg);
    if (!saved || typeof saved !== 'object') return d;
    const f = {};
    for (const def of (cfg.filters || [])) {
      // Hľadanie sa nepamätá: zoznam, ktorý sa po návrate otvorí vyfiltrovaný
      // starým slovom, vyzerá ako stratené dáta.
      if (def.type === 'search') { f[def.key] = d.f[def.key]; continue; }
      f[def.key] = saved.f && def.key in saved.f ? cleanValue(def, saved.f[def.key]) : d.f[def.key];
    }
    const so = sortOptions(cfg);
    const s = saved.sort && so.find(o => o.key === saved.sort.key);
    return {
      f,
      sort: s ? { key: s.key, dir: saved.sort.dir < 0 ? -1 : 1 } : d.sort,
      group: saved.group === '' || (cfg.groups || []).some(g => g.key === saved.group) ? (saved.group || '') : d.group,
    };
  }

  /** Čo sa uloží — bez hľadania. */
  function persistable(state, cfg) {
    const f = {};
    for (const def of (cfg.filters || [])) if (def.type !== 'search') f[def.key] = state.f[def.key];
    return { v: 1, f, sort: state.sort, group: state.group || '' };
  }

  function sameValue(a, b) {
    return JSON.stringify(Array.isArray(a) ? [...a].sort() : a) === JSON.stringify(Array.isArray(b) ? [...b].sort() : b);
  }

  /** Sú filtre také, ako ich obrazovka otvára? (Zoradenie sa nepočíta.) */
  function isDefault(state, cfg) {
    const d = defaults(cfg);
    return (cfg.filters || []).every(def => sameValue(state.f[def.key], d.f[def.key]));
  }

  // ── Filtrovanie ───────────────────────────────────────────────────────────
  function matchSearch(row, q, fields) {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    const hay = (fields && fields.length ? fields : Object.keys(row || {}))
      .map(f => norm(typeof f === 'function' ? f(row) : pluck(row, f))).join(' ');
    return terms.every(t => hay.includes(t));
  }

  /** Prekryv dvoch období; chýbajúci koniec = beží ďalej. */
  function overlaps(start, end, from, to) {
    const s = day(start), e = day(end);
    if (!s && !e) return false;
    if (to && s && s > to) return false;
    if (from && e && e < from) return false;
    return true;
  }

  function matchOne(def, row, v) {
    if (!isActive(def, v)) return true;
    if (typeof def.match === 'function') return !!def.match(row, v);
    switch (def.type) {
      case 'search': return matchSearch(row, v, def.fields);
      case 'select': return rowValues(def, row).includes(String(v));
      case 'multi': { const rv = rowValues(def, row); return v.some(x => rv.includes(String(x))); }
      case 'toggle': return !!(def.test && def.test(row));
      case 'range-date': {
        const from = v.from || '', to = v.to || '';
        if (def.start || def.end) {
          const get = (src) => (typeof src === 'function' ? src(row) : src ? pluck(row, src) : null);
          return overlaps(get(def.start), get(def.end), from, to);
        }
        const src = def.field || def.value || def.key;
        const d = day(typeof src === 'function' ? src(row) : pluck(row, src));
        if (!d) return false;
        return (!from || d >= from) && (!to || d <= to);
      }
      case 'range-number': {
        const src = def.value || def.field || def.key;
        const n = num(typeof src === 'function' ? src(row) : pluck(row, src));
        if (n == null) return false;
        const mn = num(v.min), mx = num(v.max);
        return (mn == null || n >= mn) && (mx == null || n <= mx);
      }
      default: return true;
    }
  }

  /**
   * Riadky, ktoré prejdú všetkými filtrami. `except` vynechá jeden filter —
   * na počty pri jeho možnostiach („koľko by ich bolo, keby som vybral toto").
   */
  function apply(rows, filters, f, { except } = {}) {
    const defs = (filters || []).filter(d => d.key !== except && isActive(d, f && f[d.key]));
    if (!defs.length) return (rows || []).slice();
    return (rows || []).filter(r => defs.every(d => matchOne(d, r, f[d.key])));
  }

  // ── Možnosti a počty ──────────────────────────────────────────────────────
  /**
   * Možnosti výberu s počtami. Počet je pri ostatných filtroch (fazetovo):
   * koľko riadkov pribudne, keď ju vyberiete. `total` je za celý zoznam.
   * Možnosť, ktorá nemá v celom zozname ani jeden riadok, sa skryje
   * (`hideEmpty`, predvolene áno) — okrem vybranej.
   */
  function options(rows, def, f, filters) {
    const base = apply(rows, filters, f, { except: def.key });
    const cnt = new Map(), tot = new Map(), labelFrom = new Map();
    for (const r of rows || []) {
      for (const v of new Set(rowValues(def, r))) {
        tot.set(v, (tot.get(v) || 0) + 1);
        if (!labelFrom.has(v)) labelFrom.set(v, r);
      }
    }
    for (const r of base) for (const v of new Set(rowValues(def, r))) cnt.set(v, (cnt.get(v) || 0) + 1);

    let list;
    const stat = typeof def.options === 'function' ? def.options(rows) : def.options;
    if (Array.isArray(stat)) {
      list = stat.map(o => (Array.isArray(o) ? { value: String(o[0]), label: String(o[1]), tone: o[2] || '' }
        : { value: String(o.value), label: String(o.label), tone: o.tone || '' }));
    } else {
      list = [...tot.keys()].filter(v => v !== NONE).map(v => ({
        value: v, tone: '',
        label: String(def.optionLabel ? def.optionLabel(v, labelFrom.get(v)) : v),
      }));
      if (def.sortOptions !== false) list.sort((a, b) => a.label.localeCompare(b.label, 'sk'));
    }
    if (def.emptyLabel && tot.has(NONE) && !list.some(o => o.value === NONE)) {
      list.push({ value: NONE, label: def.emptyLabel, tone: '', none: true });
    }
    const sel = def.type === 'multi' ? (f[def.key] || []).map(String) : [String(f[def.key] ?? '')];
    return list
      .map(o => ({ ...o, count: cnt.get(o.value) || 0, total: tot.get(o.value) || 0, on: sel.includes(o.value) }))
      .filter(o => o.on || def.hideEmpty === false || o.total > 0);
  }

  /** Koľko riadkov prepustí prepínač (pri ostatných filtroch). */
  function toggleCount(rows, def, f, filters) {
    return apply(rows, filters, f, { except: def.key }).filter(r => def.test && def.test(r)).length;
  }

  function labelOf(def, value, rows) {
    const v = String(value);
    if (v === NONE) return def.emptyLabel || '—';
    const stat = typeof def.options === 'function' ? def.options(rows || []) : def.options;
    if (Array.isArray(stat)) {
      const o = stat.find(x => String(Array.isArray(x) ? x[0] : x.value) === v);
      if (o) return String(Array.isArray(o) ? o[1] : o.label);
    }
    if (def.optionLabel) {
      const r = (rows || []).find(x => rowValues(def, x).includes(v));
      return String(def.optionLabel(v, r));
    }
    return v;
  }

  /** Predvoľba multi-filtra, ktorej hodnota sa presne zhoduje (napr. „Otvorené"). */
  function presetOf(def, v) {
    return (def.presets || []).find(p => sameValue((p.value || []).map(String), (v || []).map(String))) || null;
  }

  // ── Dátumy po slovensky ───────────────────────────────────────────────────
  function fmtDay(s, { year = true } = {}) {
    const d = day(s);
    if (!isDay(d)) return '';
    const [y, m, dd] = d.split('-').map(Number);
    return year ? `${dd}. ${m}. ${y}` : `${dd}. ${m}.`;
  }
  /** „1. 9. – 31. 12. 2026", „od 1. 9. 2026", „do 31. 12. 2026". */
  function rangeText(from, to) {
    const a = day(from), b = day(to);
    if (isDay(a) && isDay(b)) {
      return a.slice(0, 4) === b.slice(0, 4) ? `${fmtDay(a, { year: false })} – ${fmtDay(b)}` : `${fmtDay(a)} – ${fmtDay(b)}`;
    }
    if (isDay(a)) return `od ${fmtDay(a)}`;
    if (isDay(b)) return `do ${fmtDay(b)}`;
    return '';
  }
  /** Počet dní z `a` do `b` (b − a), UTC, bez posunov času. */
  function daysBetween(a, b) {
    if (!isDay(a) || !isDay(b)) return null;
    const t = (s) => { const [y, m, d] = day(s).split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((t(b) - t(a)) / 86400000);
  }

  // ── Čipy aktívnych filtrov ────────────────────────────────────────────────
  /**
   * Jeden čip za každý aktívny filter: „Stav: Otvorené", „Odberateľ: GU Ulm",
   * „Len s problémom". Krížik na čipe zruší ten jeden filter.
   */
  function chips(filters, f, rows) {
    const out = [];
    for (const def of filters || []) {
      const v = f[def.key];
      if (!isActive(def, v)) continue;
      const name = def.chipLabel || def.label || '';
      let text = '';
      switch (def.type) {
        case 'search': text = `„${String(v).trim()}"`; break;
        case 'select': text = labelOf(def, v, rows); break;
        case 'multi': {
          const p = presetOf(def, v);
          if (p) { text = p.label; break; }
          const labels = v.map(x => labelOf(def, x, rows));
          text = labels.length <= 2 ? labels.join(', ') : `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
          break;
        }
        case 'toggle': out.push({ key: def.key, label: def.label, text: '', toggle: true }); continue;
        case 'range-date': text = v.from && v.to ? `${fmtDay(v.from)} – ${fmtDay(v.to)}`
          : v.from ? `od ${fmtDay(v.from)}` : `do ${fmtDay(v.to)}`; break;
        case 'range-number': {
          const mn = num(v.min), mx = num(v.max), u = def.unit ? ` ${def.unit}` : '';
          text = mn != null && mx != null ? `${mn} – ${mx}${u}` : mn != null ? `od ${mn}${u}` : `do ${mx}${u}`;
          break;
        }
        default: text = String(v);
      }
      out.push({ key: def.key, label: def.type === 'search' ? (def.chipLabel || 'Hľadanie') : name, text });
    }
    return out;
  }

  function activeCount(filters, f, pred) {
    return (filters || []).filter(d => (!pred || pred(d)) && isActive(d, f[d.key])).length;
  }

  // ── Zoradenie a zoskupenie ────────────────────────────────────────────────
  const blank = (v) => v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v));
  /**
   * Porovnanie dvoch hodnôt. Čísla ako čísla, text podľa slovenskej abecedy,
   * prázdne vždy na koniec (aj pri zostupnom poradí). Pole = viac kľúčov
   * za sebou (napr. [horí, krok, názov]).
   */
  function compare(a, b, dir = 1) {
    if (Array.isArray(a) || Array.isArray(b)) {
      const x = Array.isArray(a) ? a : [a], y = Array.isArray(b) ? b : [b];
      for (let i = 0; i < Math.max(x.length, y.length); i++) {
        const c = compare(x[i], y[i], dir);
        if (c) return c;
      }
      return 0;
    }
    const ea = blank(a), eb = blank(b);
    if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
    if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir;
    if (typeof a === 'boolean' || typeof b === 'boolean') return ((a ? 1 : 0) - (b ? 1 : 0)) * dir;
    return String(a).localeCompare(String(b), 'sk', { sensitivity: 'base', numeric: true }) * dir;
  }

  /** Zoradí podľa `sort` ({ key, dir }); pri zhode drží pôvodné poradie. */
  function sortRows(rows, cfg, sort) {
    const so = sortOptions(cfg);
    const s = sort && so.find(o => o.key === sort.key);
    const list = (rows || []).map((r, i) => ({ r, i }));
    if (!s) return list.map(x => x.r);
    const dir = sort.dir < 0 ? -1 : 1;
    const val = new Map(list.map(x => [x, s.value(x.r)]));
    list.sort((a, b) => compare(val.get(a), val.get(b), dir) || a.i - b.i);
    return list.map(x => x.r);
  }

  /**
   * Zoskupenie do sekcií (ako pri Úlohách). Poradie sekcií podľa `order`,
   * neznáme na koniec v poradí, v akom sa objavili. Vnútri sekcie zostáva
   * zoradenie zoznamu.
   * @returns [{ key, label, tone, rows }]
   */
  function groupRows(rows, g) {
    if (!g) return [{ key: '', label: '', tone: '', rows: (rows || []).slice() }];
    const map = new Map();
    for (const r of rows || []) {
      const k = String((typeof g.value === 'function' ? g.value(r) : pluck(r, g.value || g.key)) ?? '');
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    const order = (g.order || []).map(String);
    const keys = [...map.keys()].sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
    });
    return keys.map(k => ({
      key: k,
      label: g.labelOf ? String(g.labelOf(k)) : (k || g.emptyLabel || '—'),
      tone: g.tone ? (g.tone(k) || '') : '',
      rows: map.get(k),
    }));
  }

  // ── Celý výpočet ──────────────────────────────────────────────────────────
  /** Vyfiltrované a zoradené riadky — zoznam aj export berú to isté. */
  function visible(rows, cfg, state) {
    return sortRows(apply(rows, cfg.filters, state.f), cfg, state.sort);
  }

  /**
   * Riadky do CSV. Stĺpec exportu je `[nadpis, (riadok) => hodnota]`;
   * bez nich sa vezmú stĺpce zoznamu, ktoré majú `csv` alebo `sortValue`.
   */
  function csvRows(rows, cfg) {
    const ex = cfg.export && Array.isArray(cfg.export.columns) ? cfg.export.columns
      : (cfg.columns || []).filter(c => c.csv || c.sortValue || c.key)
        .filter(c => c.csv !== false && c.label)
        .map(c => [c.label, c.csv || c.sortValue || ((r) => pluck(r, c.key))]);
    const cell = (v) => (Array.isArray(v) ? v.filter(x => !blank(x)).join(' ') : v == null ? '' : v);
    return [ex.map(c => c[0]), ...(rows || []).map(r => ex.map(c => cell(c[1](r))))];
  }

  function plural(n, one, few, many) {
    const a = Math.abs(n);
    if (a === 1) return one;
    if (a >= 2 && a <= 4) return few;
    return many;
  }

  /** „12 z 40 zákaziek", „všetkých 40 zákaziek", „1 zákazka". */
  function countText(shown, total, noun) {
    const w = (n) => (noun ? ` ${plural(n, noun[0], noun[1], noun[2])}` : '');
    if (shown === total) return `${total}${w(total)}`;
    return `${shown} z ${total}${w(total)}`;
  }

  const API = {
    NONE, norm, pluck, rowValues,
    emptyValue, cleanValue, isActive, sameValue,
    sortOptions, defaults, sanitize, persistable, isDefault,
    matchSearch, overlaps, matchOne, apply,
    options, toggleCount, labelOf, presetOf, chips, activeCount,
    compare, sortRows, groupRows, visible, csvRows,
    fmtDay, rangeText, daysBetween, plural, countText,
  };
  if (typeof window !== 'undefined') window.DanubraDataList = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
