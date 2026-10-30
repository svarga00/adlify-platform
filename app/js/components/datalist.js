// ============================================================================
// DANUBRA — DataList: zoznam s filtrami, zoradením a zoskupením
// ============================================================================
// Jeden komponent pre všetky zoznamy v appke (Zákazky, Dopyty, Ponuky,
// Odberatelia, Faktúry, Ľudia…). Vzhľad je ako pri Úlohách: lišta filtrov,
// pod ňou čipy toho, čo je zapnuté, a riadky po stĺpcoch. Na úzkej obrazovke
// (≤ 760 px šírky zoznamu) sa riadok prerobí na kompaktnú kartu.
//
// Čistá logika (filtre, počty, zoradenie, úložisko) je v lib/datalist.js
// a má testy. Tu je len HTML a udalosti.
//
// ── Ako ho nasadiť na ďalšiu obrazovku ──────────────────────────────────────
//
//   async view(el) {
//     if (!this.loaded) await this.load();
//     el.innerHTML = Danubra.header('Faktúry', '…') + DataList.html({
//       id: 'faktury',                       // jedinečné; DOM id je „dl-faktury"
//       storageKey: 'faktury',               // zapamätá filtre a zoradenie (localStorage)
//       noun: ['faktúra', 'faktúry', 'faktúr'],
//       rows: this.items,                    // čokoľvek, čo má `id` (alebo rowId)
//       rowClick: (r) => Inv.open(r.id),     // klik na riadok / Enter
//       rowClass: (r) => (r.overdue ? 'is-hot' : ''),   // is-hot | is-warn | is-muted
//       columns: [
//         { key: 'num', label: 'Faktúra', width: 'minmax(180px, 2fr)', mobile: 'title',
//           render: (r) => `<span class="dl-title"><b>${UI.esc(r.number)}</b><small>${UI.esc(r.partner)}</small></span>`,
//           sortValue: (r) => r.number },
//         { key: 'status', label: 'Stav', width: '110px', mobile: 'badge',
//           render: (r) => UI.badge(r.statusLabel, r.tone), sortValue: (r) => r.statusLabel },
//         { key: 'due', label: 'Splatnosť', width: '120px', mobileLabel: 'splatná',
//           render: (r) => DanubraDataList.fmtDay(r.due_date), sortValue: (r) => r.due_date },
//         { key: 'sum', label: 'Suma', width: '110px', align: 'right',
//           render: (r) => UI.money(r.total), sortValue: (r) => Number(r.total) },
//         { key: 'note', label: 'Poznámka', hideOnMobile: true, hideBelow: 1100, csv: (r) => r.note },
//       ],
//       filters: [
//         { key: 'q', type: 'search', placeholder: 'Hľadať číslo, odberateľa…', fields: ['number', 'partner'] },
//         { key: 'status', type: 'multi', label: 'Stav', default: ['sent', 'overdue'],
//           options: [['draft', 'Koncept'], ['sent', 'Odoslaná'], ['overdue', 'Po splatnosti'], ['paid', 'Zaplatená']],
//           presets: [{ label: 'Nezaplatené', value: ['sent', 'overdue'] }] },
//         { key: 'partner', type: 'select', label: 'Odberateľ', value: 'partner_id',
//           optionLabel: (id, row) => row.partner, emptyLabel: 'Bez odberateľa' },  // možnosti z dát
//         { key: 'late', type: 'toggle', label: 'Len po splatnosti', test: (r) => r.overdue },
//         { key: 'issued', type: 'range-date', label: 'Vystavená', field: 'issue_date', more: true },
//         { key: 'sum', type: 'range-number', label: 'Suma', value: 'total', unit: '€', more: true },
//       ],
//       sort: { key: 'due', dir: 1 },            // predvolené zoradenie
//       sorts: [{ key: 'created', label: 'Vytvorená', value: (r) => r.created_at, dir: -1 }],
//       groups: [{ key: 'status', label: 'Stav', value: 'status', labelOf: (k) => …, tone: (k) => 'red', order: [...] }],
//       group: '',                               // predvolene bez zoskupenia
//       rowActions: [{ ico: 'chevron', label: 'Otvoriť', run: (r) => Inv.open(r.id) }],
//                                            // ico/label smú byť aj (r) => …; show: (r) => bool
//       empty: { ico: 'invoices', title: 'Zatiaľ žiadne faktúry', sub: '…', cta: '<button …>' },
//       export: { name: ['faktury'] },           // tlačidlo Export → CSV toho, čo je vidieť
//       foot: (rows) => ({ cells: { num: 'Spolu', sum: Money.format(…) } }),  // päta so súčtami (alebo HTML)
//     });
//   }
//
// Stĺpec:  key, label, render(row) → HTML (bez neho sa vypíše hodnota `key`),
//          sortValue(row) (bez neho sa podľa stĺpca nezoraďuje; pole = viac kľúčov),
//          sortDir (-1 = prvý klik zostupne), width (CSS grid, predvolene 1fr),
//          align: 'right'|'center', tip (otáznik v hlavičke), csv(row) | false,
//          hideOnMobile, hideBelow (px šírky zoznamu, pod ktorou sa stĺpec skryje),
//          mobile: 'title' | 'badge' | 'meta' (predvolené) | 'line' (celý riadok),
//          mobileLabel (krátky nápis pred hodnotou v karte na telefóne).
// Filter:  key, type (search | select | multi | range-date | range-number | toggle),
//          label, default, more (do panelu „Ďalšie filtre"), hint (otáznik pri prepínači)
//          select/multi: value (funkcia alebo cesta, predvolene key), options
//            ([[hodnota, názov]] alebo funkcia(rows); bez nich sa vypočítajú z dát
//            s optionLabel), emptyLabel, hideEmpty, presets (multi), allLabel (select)
//          range-date: field (jeden dátum) alebo start + end (prekryv s obdobím riadku)
//          range-number: value, unit;   toggle: test(row);   ktorýkoľvek: match(row, hodnota)
// Prvé štyri filtre (bez `more`) sú v lište, ostatné v „Ďalšie filtre". Na
// telefóne sú všetky v paneli „Filtre". Hľadanie sa nepamätá, ostatné áno.
//
// Ďalej:  DataList.render(el, cfg)       vykreslí do prvku
//         DataList.refresh(id, rows?)    prekreslí zoznam (napr. po uložení)
//         DataList.set(id, key, value)   nastaví filter z kódu (odkaz z prehľadu)
//         DataList.visible(id)           čo je práve vidieť (vyfiltrované, zoradené)
//         DataList.reset(id)             predvolené filtre
//
// Pomocné triedy do `render` (štýly v app.css): .dl-title (b + small),
// .dl-two (b + small), .dl-num, .dl-tag, .dl-note.is-red|is-amber|is-green|is-mute,
// .dl-flag (tlačidlo s vysvetlením cez data-tip, napr. „nespĺňa 3").
//
// Testy: node app/lib/datalist.test.js, prehliadač v app/tests/browser.test.js
// ============================================================================
(function () {
  const L = () => window.DanubraDataList;
  const esc = (s) => (window.UI ? UI.esc(s) : String(s ?? ''));
  const ico = (n, s) => (typeof Icon === 'function' ? Icon(n, s) : '');
  const cssId = (s) => String(s).replace(/[^\w-]/g, '');
  const reg = Object.create(null);
  const STORE = 'danubra_dl_';

  function load(key) {
    if (!key) return null;
    try { const s = localStorage.getItem(STORE + key); return s ? JSON.parse(s) : null; } catch { return null; }
  }
  function save(inst) {
    if (!inst.cfg.storageKey) return;
    try { localStorage.setItem(STORE + inst.cfg.storageKey, JSON.stringify(L().persistable(inst.state, inst.cfg))); } catch {}
  }

  const searchDef = (cfg) => (cfg.filters || []).find(d => d.type === 'search') || null;
  const filterDefs = (cfg) => (cfg.filters || []).filter(d => d.type !== 'search');
  function split(cfg) {
    const defs = filterDefs(cfg);
    const max = cfg.maxPrimary == null ? 4 : cfg.maxPrimary;
    const primary = defs.filter(d => !d.more).slice(0, max);
    return { defs, primary, more: defs.filter(d => !primary.includes(d)) };
  }

  // ── Inštancia ─────────────────────────────────────────────────────────────
  function instance(cfg) {
    const id = cssId(cfg.id || 'list');
    let inst = reg[id];
    if (!inst) {
      inst = reg[id] = { id, cfg, state: L().sanitize(load(cfg.storageKey), cfg), openKey: null, panel: false };
    } else {
      // Znova vykreslená obrazovka: filtre zostanú, aj rozpísané hľadanie.
      const prev = inst.state;
      inst.cfg = cfg;
      inst.state = L().sanitize(prev, cfg);
      const s = searchDef(cfg);
      if (s && prev.f && typeof prev.f[s.key] === 'string') inst.state.f[s.key] = prev.f[s.key];
    }
    inst.rows = cfg.rows || [];
    return inst;
  }

  function compute(inst) {
    const { cfg, state, rows } = inst;
    const filtered = L().apply(rows, cfg.filters, state.f);
    return { total: rows.length, rows: L().sortRows(filtered, cfg, state.sort) };
  }

  // ── HTML ──────────────────────────────────────────────────────────────────
  function html(cfg) {
    bind();
    const inst = instance(cfg);
    const v = compute(inst);
    const s = searchDef(cfg);
    const label = cfg.label || 'Zoznam';
    return `<div class="dl" id="dl-${inst.id}" data-dl-root="${inst.id}">
      <div class="dl-bar card" role="search" aria-label="Filtre: ${esc(label)}">
        ${s ? `<label class="dl-search">${ico('search', 15)}
          <input type="search" data-dl-a="q" data-k="${esc(s.key)}" value="${esc(inst.state.f[s.key] || '')}"
            placeholder="${esc(s.placeholder || 'Hľadať…')}" aria-label="${esc(s.label || 'Hľadať')}" autocomplete="off"></label>` : ''}
        <div class="dl-filters" data-dl-part="filters">${filtersHtml(inst)}</div>
        <div class="dl-right" data-dl-part="right">${rightHtml(inst, v)}</div>
      </div>
      <div data-dl-part="panel">${panelHtml(inst)}</div>
      <div class="dl-sub" data-dl-part="sub">${subHtml(inst)}</div>
      <div data-dl-part="body">${bodyHtml(inst, v)}</div>
    </div>`;
  }

  function render(el, cfg) {
    if (!el) return null;
    el.innerHTML = html(cfg);
    return reg[cssId(cfg.id || 'list')];
  }

  function chipText(inst, d) {
    const c = L().chips([d], inst.state.f, inst.rows)[0];
    return c ? c.text : '';
  }

  function filtersHtml(inst) {
    const { cfg, state } = inst;
    const { defs, primary, more } = split(cfg);
    const allOn = L().activeCount(defs, state.f);
    const moreOn = L().activeCount(more, state.f);
    const bar = primary.map(d => (d.type === 'toggle' ? toggleHtml(inst, d) : dropdownHtml(inst, d))).join('');
    const moreBtn = defs.length ? `<button type="button" class="dl-more-btn${inst.panel ? ' on' : ''}${more.length ? '' : ' dl-only-m'}"
        data-dl-a="panel" aria-expanded="${inst.panel}" aria-controls="dl-${inst.id}-panel">
        ${ico('filter', 14)}<span class="dl-only-d">Ďalšie filtre</span><span class="dl-only-m">Filtre</span>
        ${moreOn ? `<em class="dl-only-d">${moreOn}</em>` : ''}${allOn ? `<em class="dl-only-m">${allOn}</em>` : ''}
      </button>` : '';
    return bar + moreBtn;
  }

  function dropdownHtml(inst, d) {
    const on = L().isActive(d, inst.state.f[d.key]);
    const open = inst.openKey === d.key;
    const t = on ? chipText(inst, d) : '';
    return `<details class="dl-dd${on ? ' on' : ''}" data-dl-dd="${esc(d.key)}"${open ? ' open' : ''}>
      <summary class="dl-dd-btn" aria-label="Filter ${esc(d.label)}${on ? `: ${esc(t)}` : ''}">
        <span>${esc(d.label)}</span>${on ? `<em>${esc(t)}</em>` : ''}${ico('chevron', 12)}
      </summary>
      <div class="dl-pop" role="group" aria-label="${esc(d.label)}">${controlHtml(inst, d, 'pop')}</div>
    </details>`;
  }

  function toggleHtml(inst, d) {
    const on = inst.state.f[d.key] === true;
    const n = L().toggleCount(inst.rows, d, inst.state.f, inst.cfg.filters);
    return `<button type="button" class="dl-tog${on ? ' on' : ''}" data-dl-a="tog" data-k="${esc(d.key)}"
        aria-pressed="${on}" title="${esc(d.hint || d.label)}">
        <i class="dl-sw" aria-hidden="true"></i><span>${esc(d.label)}</span><em>${n}</em></button>`;
  }

  /** Ovládanie jedného filtra — v rozbaľovacom okne (`pop`) alebo v paneli. */
  function controlHtml(inst, d, mode) {
    const { state, rows, cfg } = inst;
    const v = state.f[d.key];
    const k = esc(d.key);
    switch (d.type) {
      case 'select': {
        const opts = L().options(rows, d, state.f, cfg.filters);
        const all = d.allLabel || 'Všetko';
        if (mode === 'panel') {
          return `<select data-dl-a="sel" data-k="${k}" aria-label="${esc(d.label)}">
            <option value="">${esc(all)}</option>
            ${opts.map(o => `<option value="${esc(o.value)}"${o.on ? ' selected' : ''}>${esc(o.label)} (${o.count})</option>`).join('')}
          </select>`;
        }
        return `${opts.length > 8 ? optSearch(d) : ''}
          <button type="button" class="dl-opt${!v ? ' on' : ''}" data-dl-a="set" data-k="${k}" data-v=""
            role="menuitemradio" aria-checked="${!v}"><i class="dl-tick">${ico('check', 14)}</i><span>${esc(all)}</span></button>
          ${opts.map(o => `<button type="button" class="dl-opt${o.on ? ' on' : ''}${o.count ? '' : ' is-zero'}"
              data-dl-a="set" data-k="${k}" data-v="${esc(o.value)}" data-l="${esc(L().norm(o.label))}"
              role="menuitemradio" aria-checked="${o.on}"><i class="dl-tick">${ico('check', 14)}</i>
              <span>${esc(o.label)}</span><em>${o.count}</em></button>`).join('')}`;
      }
      case 'multi': {
        const opts = L().options(rows, d, state.f, cfg.filters);
        const presets = (d.presets || []).length ? `<div class="dl-presets">${d.presets.map((p, i) => {
          const on = L().sameValue((p.value || []).map(String), (v || []).map(String));
          return `<button type="button" class="dl-preset${on ? ' on' : ''}" data-dl-a="preset" data-k="${k}" data-i="${i}"
            aria-pressed="${on}"${p.hint ? ` title="${esc(p.hint)}"` : ''}>${esc(p.label)}</button>`;
        }).join('')}<button type="button" class="dl-preset${v && v.length ? '' : ' on'}" data-dl-a="clr" data-k="${k}"
            aria-pressed="${!(v && v.length)}">${esc(d.allLabel || 'Všetky')}</button></div>` : '';
        if (mode === 'panel') {
          return `${presets}<div class="dl-pchips">${opts.map(o => `<button type="button"
              class="dl-pchip${o.on ? ' on' : ''}${o.count ? '' : ' is-zero'}" data-dl-a="chk" data-k="${k}" data-v="${esc(o.value)}"
              aria-pressed="${o.on}">${esc(o.label)}<em>${o.count}</em></button>`).join('')}</div>`;
        }
        return `${presets}${opts.length > 8 ? optSearch(d) : ''}
          ${opts.map(o => `<label class="dl-opt dl-chk${o.on ? ' on' : ''}${o.count ? '' : ' is-zero'}" data-l="${esc(L().norm(o.label))}">
            <input type="checkbox" data-dl-a="chk" data-k="${k}" data-v="${esc(o.value)}"${o.on ? ' checked' : ''}>
            <span>${esc(o.label)}</span><em>${o.count}</em></label>`).join('')}
          ${v && v.length && !(d.presets || []).length ? `<div class="dl-pop-foot">
            <button type="button" class="dl-link" data-dl-a="clr" data-k="${k}">Zrušiť výber</button></div>` : ''}`;
      }
      case 'toggle': return toggleHtml(inst, d);
      case 'range-date': {
        const r = v || {};
        const q = quickRanges().map(x => {
          const on = r.from === x.from && r.to === x.to;
          return `<button type="button" class="dl-preset${on ? ' on' : ''}" data-dl-a="rq" data-k="${k}"
            data-from="${x.from}" data-to="${x.to}" aria-pressed="${on}">${x.label}</button>`;
        }).join('');
        return `<div class="dl-presets">${q}</div>
          <div class="dl-range">
            <label class="dl-in"><span>Od</span><input type="date" data-dl-a="range" data-k="${k}" data-edge="from" value="${esc(r.from || '')}"></label>
            <label class="dl-in"><span>Do</span><input type="date" data-dl-a="range" data-k="${k}" data-edge="to" value="${esc(r.to || '')}"></label>
          </div>
          ${d.hint ? `<p class="dl-hint">${esc(d.hint)}</p>` : ''}
          ${mode === 'pop' && (r.from || r.to) ? `<div class="dl-pop-foot"><button type="button" class="dl-link" data-dl-a="clr" data-k="${k}">Zrušiť obdobie</button></div>` : ''}`;
      }
      case 'range-number': {
        const r = v || {};
        const u = d.unit ? ` (${esc(d.unit)})` : '';
        return `<div class="dl-range">
            <label class="dl-in"><span>Od${u}</span><input type="number" step="any" inputmode="decimal" data-dl-a="range" data-k="${k}" data-edge="min" value="${esc(r.min ?? '')}"></label>
            <label class="dl-in"><span>Do${u}</span><input type="number" step="any" inputmode="decimal" data-dl-a="range" data-k="${k}" data-edge="max" value="${esc(r.max ?? '')}"></label>
          </div>
          ${mode === 'pop' && (r.min !== '' || r.max !== '') ? `<div class="dl-pop-foot"><button type="button" class="dl-link" data-dl-a="clr" data-k="${k}">Zrušiť</button></div>` : ''}`;
      }
      default: return '';
    }
  }

  function optSearch(d) {
    return `<input type="search" class="dl-opt-q" data-dl-a="optq" placeholder="Hľadať v zozname…"
      aria-label="Hľadať v možnostiach: ${esc(d.label)}" autocomplete="off">`;
  }

  /** Rýchle obdobia: tento mesiac, budúci mesiac, tento rok. */
  function quickRanges(today = new Date().toISOString().slice(0, 10)) {
    const [y, m] = today.split('-').map(Number);
    const pad = (n) => String(n).padStart(2, '0');
    const last = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
    return [
      { label: 'Tento mesiac', from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last(y, m))}` },
      { label: 'Budúci mesiac', from: `${ny}-${pad(nm)}-01`, to: `${ny}-${pad(nm)}-${pad(last(ny, nm))}` },
      { label: 'Tento rok', from: `${y}-01-01`, to: `${y}-12-31` },
    ];
  }

  function rightHtml(inst, v) {
    const { cfg } = inst;
    const shown = v.rows.length;
    const noun = cfg.noun;
    const w = (n) => (noun ? ` ${L().plural(n, noun[0], noun[1], noun[2])}` : '');
    const count = shown === v.total ? `<b>${v.total}</b>${w(v.total)}`
      : `<b>${shown}</b> z ${v.total}${w(v.total)}`;
    return `<span class="dl-count" aria-live="polite">${count}</span>
      ${cfg.export ? `<button type="button" class="btn btn-outline btn-sm dl-export" data-dl-a="export"
        title="Exportovať do CSV to, čo je práve vidieť" aria-label="Export do CSV">${ico('download', 14)}<span class="dl-only-d">Export</span></button>` : ''}`;
  }

  function panelHtml(inst) {
    if (!inst.panel) return '';
    const { cfg, state } = inst;
    const { defs, primary } = split(cfg);
    const any = L().activeCount(cfg.filters, state.f) > 0;
    return `<div class="dl-panel card" id="dl-${inst.id}-panel" role="region" aria-label="Filtre">
      <div class="dl-panel-grid">
        ${defs.map(d => `<div class="dl-pf${primary.includes(d) ? ' dl-only-m' : ''}${d.type === 'multi' || d.type === 'range-date' ? ' is-wide' : ''}">
          <div class="dl-pf-l">${esc(d.type === 'toggle' ? 'Zobraziť' : d.label)}${d.hint && d.type !== 'toggle' ? (window.UI ? UI.tip(d.hint) : '') : ''}</div>
          ${controlHtml(inst, d, 'panel')}</div>`).join('')}
      </div>
      <div class="dl-panel-foot">
        ${any ? `<button type="button" class="dl-link" data-dl-a="clear">Zrušiť filtre</button>` : ''}
        <button type="button" class="btn btn-primary btn-sm" data-dl-a="panel">Hotovo</button>
      </div>
    </div>`;
  }

  function subHtml(inst) {
    const { cfg, state, rows } = inst;
    const chips = L().chips(cfg.filters, state.f, rows);
    const d = L().defaults(cfg);
    const hasDef = filterDefs(cfg).some(x => L().isActive(x, d.f[x.key]));
    const notDef = hasDef && !L().isDefault(state, cfg);
    return `<div class="dl-chips">
        ${chips.length ? `<span class="dl-chips-l">Filtre:</span>` : `<span class="dl-chips-l">Bez filtrov — vidíte všetko.</span>`}
        ${chips.map(c => `<span class="dl-chip"><span>${esc(c.label)}${c.text ? `: <b>${esc(c.text)}</b>` : ''}</span>
          <button type="button" data-dl-a="clr" data-k="${esc(c.key)}" aria-label="Zrušiť filter ${esc(c.label)}"
            title="Zrušiť tento filter">${ico('x', 12)}</button></span>`).join('')}
        ${chips.length ? `<button type="button" class="dl-link dl-clear" data-dl-a="clear">${ico('x', 13)}Zrušiť filtre</button>` : ''}
        ${notDef ? `<button type="button" class="dl-link" data-dl-a="defaults" title="Vrátiť filtre, s ktorými sa obrazovka otvára">Predvolené filtre</button>` : ''}
      </div>
      ${sortMenuHtml(inst)}`;
  }

  function sortMenuHtml(inst) {
    const { cfg, state } = inst;
    const so = L().sortOptions(cfg);
    if (!so.length && !(cfg.groups || []).length) return '';
    const cur = state.sort && so.find(s => s.key === state.sort.key);
    const g = (cfg.groups || []).find(x => x.key === state.group);
    const open = inst.openKey === '__view';
    const dir = state.sort && state.sort.dir < 0 ? -1 : 1;
    return `<details class="dl-dd dl-view" data-dl-dd="__view"${open ? ' open' : ''}>
      <summary class="dl-dd-btn dl-viewbtn" aria-label="Zoradenie a zoskupenie">
        ${ico('sort', 14)}<span>Zoradené: <b>${esc(cur ? cur.label : '—')}</b>${g ? ` · podľa: <b>${esc(g.label)}</b>` : ''}</span>${ico('chevron', 12)}
      </summary>
      <div class="dl-pop right" role="group" aria-label="Zoradenie">
        ${so.length ? `<div class="dl-pop-h">Zoradiť podľa</div>
          ${so.map(s => `<button type="button" class="dl-opt${cur === s ? ' on' : ''}" data-dl-a="sortby" data-k="${esc(s.key)}"
              role="menuitemradio" aria-checked="${cur === s}"><i class="dl-tick">${ico('check', 14)}</i><span>${esc(s.label)}</span></button>`).join('')}
          <div class="dl-seg" role="group" aria-label="Smer">
            <button type="button" class="${dir > 0 ? 'on' : ''}" data-dl-a="sortdir" data-v="1" aria-pressed="${dir > 0}">Vzostupne</button>
            <button type="button" class="${dir < 0 ? 'on' : ''}" data-dl-a="sortdir" data-v="-1" aria-pressed="${dir < 0}">Zostupne</button>
          </div>` : ''}
        ${(cfg.groups || []).length ? `<div class="dl-pop-h">Zoskupiť</div>
          <button type="button" class="dl-opt${!g ? ' on' : ''}" data-dl-a="group" data-v="" role="menuitemradio" aria-checked="${!g}">
            <i class="dl-tick">${ico('check', 14)}</i><span>Nezoskupovať</span></button>
          ${cfg.groups.map(x => `<button type="button" class="dl-opt${g === x ? ' on' : ''}" data-dl-a="group" data-v="${esc(x.key)}"
              role="menuitemradio" aria-checked="${g === x}"><i class="dl-tick">${ico('check', 14)}</i><span>Podľa: ${esc(x.label)}</span></button>`).join('')}` : ''}
      </div>
    </details>`;
  }

  // ── Tabuľka ───────────────────────────────────────────────────────────────
  function cols(cfg) { return (cfg.columns || []).filter(Boolean); }

  function styleHtml(inst) {
    const c = cols(inst.cfg);
    const acts = (inst.cfg.rowActions || []).length;
    const tpl = (list) => [...list.map(x => x.width || 'minmax(0, 1fr)'), ...(acts ? [`${acts * 32}px`] : [])].join(' ');
    const sel = `#dl-${inst.id} .dl-table`;
    let css = `${sel} { --dl-cols: ${tpl(c)}; }`;
    const bps = [...new Set(c.filter(x => x.hideBelow).map(x => Number(x.hideBelow)))].sort((a, b) => b - a);
    for (const bp of bps) {
      const hidden = c.filter(x => x.hideBelow && Number(x.hideBelow) >= bp);
      css += `@container dl (min-width: 761px) and (max-width: ${bp}px) {
        ${sel} { --dl-cols: ${tpl(c.filter(x => !hidden.includes(x)))}; }
        ${hidden.map(x => `#dl-${inst.id} .dl-col-${cssId(x.key)}`).join(', ')} { display: none; } }`;
    }
    return `<style>${css}</style>`;
  }

  function cellHtml(c, row) {
    const raw = c.render ? c.render(row) : esc(L().pluck(row, c.key) ?? '');
    const inner = String(raw ?? '').trim();
    const mob = c.hideOnMobile ? 'hide' : (c.mobile || 'meta');
    const cls = ['dl-c', `dl-col-${cssId(c.key)}`, `dl-m-${mob}`,
      c.align === 'right' ? 'is-right' : c.align === 'center' ? 'is-center' : '', c.cls || ''].filter(Boolean).join(' ');
    const ml = inner && c.mobileLabel ? `<span class="dl-ml">${esc(c.mobileLabel)}</span>` : '';
    return `<div class="${cls}" role="cell">${ml}${inner}</div>`;
  }

  function rowHtml(inst, row) {
    const { cfg } = inst;
    const id = String((cfg.rowId ? cfg.rowId(row) : row.id) ?? '');
    inst.byId.set(id, row);
    const click = typeof cfg.rowClick === 'function';
    const extra = cfg.rowClass ? String(cfg.rowClass(row) || '') : '';
    const acts = (cfg.rowActions || []);
    const label = cfg.rowLabel ? cfg.rowLabel(row) : '';
    return `<div class="dl-row${click ? ' is-click' : ''}${extra ? ` ${esc(extra)}` : ''}" role="row" data-dl-row="${esc(id)}"${
      click ? ' tabindex="0"' : ''}${label ? ` aria-label="${esc(label)}"` : ''}>${
      cols(cfg).map(c => cellHtml(c, row)).join('')}${
      acts.length ? `<div class="dl-c dl-acts" role="cell">${acts.map((a, i) => {
        if (a.show && !a.show(row)) return '';
        // `ico` a `label` smú byť aj funkcie riadku — jedno miesto pre dve
        // opačné akcie (napr. Odstrániť / Vrátiť), nie dva stĺpce tlačidiel.
        const al = typeof a.label === 'function' ? a.label(row) : a.label;
        const ai = typeof a.ico === 'function' ? a.ico(row) : a.ico;
        return `<button type="button" class="dl-act" data-dl-a="act" data-i="${i}" title="${esc(al)}"
            aria-label="${esc(al)}">${ico(ai || 'chevron', 15)}</button>`;
      }).join('')}</div>` : ''}<i class="dl-br" aria-hidden="true"></i></div>`;
  }

  function headHtml(inst) {
    const { cfg, state } = inst;
    const so = L().sortOptions(cfg);
    return `<div class="dl-head" role="row">${cols(cfg).map(c => {
      const s = so.find(x => x.key === c.key && x.column);
      const on = s && state.sort && state.sort.key === c.key;
      const desc = on && state.sort.dir < 0;
      const aria = on ? (desc ? 'descending' : 'ascending') : 'none';
      const cls = `dl-th dl-col-${cssId(c.key)}${c.align === 'right' ? ' is-right' : c.align === 'center' ? ' is-center' : ''}`;
      const tip = c.tip && window.UI ? UI.tip(c.tip) : '';
      return s
        ? `<div class="${cls}" role="columnheader" aria-sort="${aria}"><button type="button" class="dl-sort${on ? ' on' : ''}${desc ? ' desc' : ''}"
            data-dl-a="sort" data-k="${esc(c.key)}" title="Zoradiť podľa: ${esc(c.label)}">${esc(c.label)}${ico('chevron', 11)}</button>${tip}</div>`
        : `<div class="${cls}" role="columnheader"><span>${esc(c.label || '')}</span>${tip}</div>`;
    }).join('')}${(cfg.rowActions || []).length ? '<div class="dl-th dl-acts" role="columnheader" aria-label="Akcie"></div>' : ''}</div>`;
  }

  function bodyHtml(inst, v) {
    const { cfg, state } = inst;
    inst.byId = new Map();
    if (!v.total) {
      const e = cfg.empty || {};
      return window.UI ? UI.empty(e.ico || 'inbox', e.title || 'Zatiaľ nič', e.sub || '', e.cta || '') : '';
    }
    if (!v.rows.length) {
      return `<div class="dl-empty card">${window.UI ? UI.empty('search', 'Filtrom nič nezodpovedá',
        `Zoznam má ${v.total} ${cfg.noun ? L().plural(v.total, cfg.noun[0], cfg.noun[1], cfg.noun[2]) : 'záznamov'}, ale ani jeden nesedí na zapnuté filtre.`,
        '<button type="button" class="btn btn-outline btn-sm" data-dl-a="clear">Zrušiť filtre</button>') : ''}</div>`;
    }
    const g = (cfg.groups || []).find(x => x.key === state.group) || null;
    const groups = L().groupRows(v.rows, g);
    const body = groups.map(gr => (g ? `<div class="dl-sec dl-sec-${esc(gr.tone || 'gray')}" role="row">
        <span role="cell" class="dl-sec-in"><i></i><span>${esc(gr.label)}</span> <span class="dl-sec-n">${gr.rows.length}</span></span></div>` : '')
      + gr.rows.map(r => rowHtml(inst, r)).join('')).join('');
    return `${styleHtml(inst)}<div class="dl-table card" role="table" aria-label="${esc(cfg.label || 'Zoznam')}"
        aria-rowcount="${v.rows.length}">${headHtml(inst)}${body}${footHtml(inst, v)}</div>`;
  }

  /**
   * Päta so súčtami za to, čo je práve vidieť (`foot: (rows) => …`).
   * Vráti HTML na celú šírku, alebo `{ cells: { kľúč stĺpca: HTML } }` —
   * vtedy sedí každá suma pod svojím stĺpcom. Bez `foot` sa nič nekreslí.
   */
  function footHtml(inst, v) {
    const { cfg } = inst;
    if (typeof cfg.foot !== 'function' || !v.rows.length) return '';
    const f = cfg.foot(v.rows);
    if (!f) return '';
    if (typeof f === 'string') return `<div class="dl-foot is-line" role="row"><div class="dl-c" role="cell">${f}</div></div>`;
    const cells = f.cells || {};
    return `<div class="dl-foot" role="row">${cols(cfg).map(c => `<div class="dl-c dl-col-${cssId(c.key)}${
      c.align === 'right' ? ' is-right' : c.align === 'center' ? ' is-center' : ''}" role="cell">${cells[c.key] || ''}</div>`).join('')}${
      (cfg.rowActions || []).length ? '<div class="dl-c dl-acts" role="cell"></div>' : ''}</div>`;
  }

  // ── Prekreslenie ──────────────────────────────────────────────────────────
  /** Prekreslí všetko okrem poľa hľadania — pri písaní sa nestratí kurzor. */
  function paint(inst) {
    const root = document.getElementById(`dl-${inst.id}`);
    if (!root) return;
    const ae = document.activeElement;
    let focus = null;
    if (ae && root.contains(ae) && ae.dataset && ae.dataset.dlA && ae.dataset.dlA !== 'q') {
      focus = ['dlA', 'k', 'v', 'edge', 'i'].map(a => (ae.dataset[a] != null
        ? `[data-${a === 'dlA' ? 'dl-a' : a}="${CSS.escape(ae.dataset[a])}"]` : '')).join('');
    }
    const v = compute(inst);
    const part = (name, fn) => { const el = root.querySelector(`[data-dl-part="${name}"]`); if (el) el.innerHTML = fn(); };
    part('filters', () => filtersHtml(inst));
    part('right', () => rightHtml(inst, v));
    part('panel', () => panelHtml(inst));
    part('sub', () => subHtml(inst));
    part('body', () => bodyHtml(inst, v));
    const q = searchDef(inst.cfg);
    const input = root.querySelector('[data-dl-a="q"]');
    if (q && input && input.value !== (inst.state.f[q.key] || '') && document.activeElement !== input) {
      input.value = inst.state.f[q.key] || '';
    }
    if (focus) { const el = root.querySelector(focus); if (el) el.focus(); }
    if (typeof inst.cfg.onChange === 'function') inst.cfg.onChange(inst.state, v.rows);
  }

  function commit(inst) { save(inst); paint(inst); }

  // ── Udalosti (jeden poslucháč pre všetky zoznamy) ─────────────────────────
  let bound = false;
  const timers = {};

  function ctx(el) {
    const root = el && el.closest && el.closest('[data-dl-root]');
    const inst = root && reg[root.getAttribute('data-dl-root')];
    return inst ? { root, inst } : null;
  }
  const defOf = (inst, k) => (inst.cfg.filters || []).find(d => d.key === k);
  const closeDd = (except) => document.querySelectorAll('details.dl-dd[open]')
    .forEach(d => { if (d !== except) d.open = false; });

  function openRow(inst, rowEl) {
    const row = inst.byId && inst.byId.get(rowEl.getAttribute('data-dl-row'));
    if (row && typeof inst.cfg.rowClick === 'function') inst.cfg.rowClick(row);
  }

  function act(inst, el) {
    const s = inst.state, a = el.getAttribute('data-dl-a');
    const k = el.getAttribute('data-k'), d = k ? defOf(inst, k) : null;
    switch (a) {
      case 'set': s.f[k] = el.getAttribute('data-v') || ''; inst.openKey = null; return commit(inst);
      case 'chk': {
        const val = el.getAttribute('data-v');
        const cur = new Set(s.f[k] || []);
        if (cur.has(val)) cur.delete(val); else cur.add(val);
        s.f[k] = [...cur];
        return commit(inst);
      }
      case 'preset': { const p = (d.presets || [])[Number(el.getAttribute('data-i'))]; if (p) s.f[k] = (p.value || []).map(String); return commit(inst); }
      case 'tog': s.f[k] = s.f[k] !== true; return commit(inst);
      case 'clr': s.f[k] = L().emptyValue(d); return commit(inst);
      case 'rq': s.f[k] = { from: el.getAttribute('data-from') || '', to: el.getAttribute('data-to') || '' }; return commit(inst);
      case 'clear':
        for (const x of inst.cfg.filters || []) s.f[x.key] = L().emptyValue(x);
        inst.openKey = null;
        return commit(inst);
      case 'defaults': {
        const def = L().defaults(inst.cfg);
        for (const x of filterDefs(inst.cfg)) s.f[x.key] = def.f[x.key];
        return commit(inst);
      }
      case 'panel': inst.panel = !inst.panel; inst.openKey = null; return paint(inst);
      case 'sort': {
        const o = L().sortOptions(inst.cfg).find(x => x.key === k);
        if (!o) return undefined;
        s.sort = s.sort && s.sort.key === k ? { key: k, dir: -s.sort.dir } : { key: k, dir: o.dir };
        return commit(inst);
      }
      case 'sortby': {
        const o = L().sortOptions(inst.cfg).find(x => x.key === k);
        if (o && (!s.sort || s.sort.key !== k)) s.sort = { key: k, dir: o.dir };
        inst.openKey = null;
        return commit(inst);
      }
      case 'sortdir': if (s.sort) s.sort = { key: s.sort.key, dir: Number(el.getAttribute('data-v')) < 0 ? -1 : 1 }; return commit(inst);
      case 'group': s.group = el.getAttribute('data-v') || ''; inst.openKey = null; return commit(inst);
      case 'export': return exportCsv(inst);
      case 'act': {
        const rowEl = el.closest('.dl-row');
        const row = rowEl && inst.byId.get(rowEl.getAttribute('data-dl-row'));
        const x = (inst.cfg.rowActions || [])[Number(el.getAttribute('data-i'))];
        if (row && x && typeof x.run === 'function') x.run(row);
        return undefined;
      }
      default: return undefined;
    }
  }

  function exportCsv(inst) {
    const E = window.DanubraExport;
    const rows = compute(inst).rows;
    if (!rows.length) return window.UI && UI.toast('Nie je čo exportovať — zoznam je prázdny.', 'err');
    if (!E) return undefined;
    const ex = inst.cfg.export || {};
    const name = E.download(L().csvRows(rows, inst.cfg), ex.name || [inst.cfg.id]);
    if (window.UI) UI.toast(`Uložené: ${name}`, 'ok');
    return name;
  }

  function onClick(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    closeDd(t.closest('details.dl-dd'));
    const a = t.closest('[data-dl-a]');
    if (a) {
      const c = ctx(a);
      if (!c || /^(INPUT|SELECT)$/.test(a.tagName)) return;
      act(c.inst, a);
      return;
    }
    const row = t.closest('.dl-row[data-dl-row]');
    if (!row || t.closest('a, button, input, select, textarea, label, summary, details')) return;
    const c = ctx(row);
    if (c) openRow(c.inst, row);
  }

  function onInput(e) {
    const el = e.target;
    const a = el && el.getAttribute && el.getAttribute('data-dl-a');
    if (a === 'optq') {
      const q = L().norm(el.value).trim();
      const pop = el.closest('.dl-pop');
      if (pop) pop.querySelectorAll('[data-l]').forEach(o => { o.hidden = !!q && !o.getAttribute('data-l').includes(q); });
      return;
    }
    if (a !== 'q') return;
    const c = ctx(el);
    if (!c) return;
    const k = el.getAttribute('data-k');
    clearTimeout(timers[c.inst.id]);
    timers[c.inst.id] = setTimeout(() => {
      c.inst.state.f[k] = el.value;
      paint(c.inst);
    }, 160);
  }

  function onChange(e) {
    const el = e.target;
    const a = el && el.getAttribute && el.getAttribute('data-dl-a');
    if (!a || a === 'q' || a === 'optq') return;
    const c = ctx(el);
    if (!c) return;
    const s = c.inst.state, k = el.getAttribute('data-k');
    if (a === 'chk') {
      const cur = new Set(s.f[k] || []);
      const val = el.getAttribute('data-v');
      if (el.checked) cur.add(val); else cur.delete(val);
      s.f[k] = [...cur];
    } else if (a === 'sel') {
      s.f[k] = el.value;
    } else if (a === 'range') {
      const d = defOf(c.inst, k);
      s.f[k] = L().cleanValue(d, { ...(s.f[k] || {}), [el.getAttribute('data-edge')]: el.value });
    } else return;
    commit(c.inst);
  }

  function onKey(e) {
    if (e.key === 'Escape' && document.querySelector('details.dl-dd[open]')) {
      const open = document.querySelector('details.dl-dd[open]');
      e.preventDefault(); e.stopPropagation();
      closeDd(null);
      const sum = open.querySelector('summary');
      if (sum) sum.focus();
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && e.target && e.target.matches
      && e.target.matches('.dl-row.is-click[data-dl-row]')) {
      const c = ctx(e.target);
      if (!c) return;
      e.preventDefault();
      openRow(c.inst, e.target);
    }
  }

  function onToggle(e) {
    const d = e.target;
    if (!d || !d.matches || !d.matches('details.dl-dd')) return;
    const c = ctx(d);
    const key = d.getAttribute('data-dl-dd');
    if (!d.open) { if (c && c.inst.openKey === key) c.inst.openKey = null; return; }
    closeDd(d);
    if (c) c.inst.openKey = key;
    const pop = d.querySelector('.dl-pop');
    if (!pop) return;
    if (!d.classList.contains('dl-view')) pop.classList.remove('right');
    const r = pop.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) pop.classList.add('right');
    const q = pop.querySelector('.dl-opt-q');
    if (q && window.matchMedia && matchMedia('(hover: hover)').matches) q.focus();
  }

  function bind() {
    if (bound || typeof document === 'undefined' || !document.addEventListener) return;
    bound = true;
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('toggle', onToggle, true);
  }

  // ── Verejné API ───────────────────────────────────────────────────────────
  function refresh(id, rows) {
    const inst = reg[cssId(id)];
    if (!inst) return;
    if (rows) { inst.rows = rows; inst.cfg = { ...inst.cfg, rows }; }
    paint(inst);
  }
  function set(id, key, value) {
    const inst = reg[cssId(id)];
    if (!inst) return;
    const d = defOf(inst, key);
    if (!d) return;
    inst.state.f[key] = L().cleanValue(d, value);
    commit(inst);
  }
  function reset(id) {
    const inst = reg[cssId(id)];
    if (!inst) return;
    inst.state = L().defaults(inst.cfg);
    commit(inst);
  }
  function visible(id) {
    const inst = reg[cssId(id)];
    return inst ? compute(inst).rows : [];
  }
  function state(id) {
    const inst = reg[cssId(id)];
    return inst ? JSON.parse(JSON.stringify(inst.state)) : null;
  }
  const API = { html, render, refresh, set, reset, visible, state, quickRanges, _reg: reg };
  window.DataList = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
