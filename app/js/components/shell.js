// ============================================================================
// DANUBRA — zdieľané komponenty v2
// ============================================================================
// Päť vecí, ktoré sa v každom module opakovali a v každom vyzerali inak:
//
//   Shell.detail   detail s bočným panelom — vľavo práca, vpravo súvislosti
//   Shell.list     zoznam s filtrom, ktorý hovorí, koľko z koľkých ukazuje
//   Shell.notes    poznámky, ktoré sa dajú len pridať
//   Shell.sums     prehľad súm, kde je vidieť, z čoho sa číslo skladá
//   Shell.blocker  blokátor, ktorý povie prečo a čo s tým
//
// Funkcie vracajú HTML ako reťazec, rovnako ako zvyšok appky. Logika, ktorá
// sa dá pokaziť (filtrovanie, súčty, či sa dá pokračovať), je v čistých
// funkciách a má testy.
//
// Testy: node app/js/components/shell.test.js
// ============================================================================
(function () {
  const esc = (s) => (window.UI ? UI.esc(s) : String(s ?? ''));

  // ── Detail s bočným panelom ───────────────────────────────────────────────
  // Pravidlo z v1 praxe: pri telefonáte nesmie človek scrollovať, aby videl,
  // čo už má zaklikané. Preto bočný panel s priebežným stavom a nad ním
  // súvislosti (zákazka, odberateľ), nie naopak.

  /**
   * @param {Object} o
   *   title, subtitle   hlavička
   *   badges            [[label, kind], …]
   *   body              HTML hlavného stĺpca
   *   aside             HTML bočného panelu, alebo pole blokov
   *   asideTitle        nadpis bočného panelu
   *   actions           HTML tlačidiel v hlavičke
   *   back              { label, onclick }
   *   mini              HTML pásu, ktorý na mobile zostane vidieť dole
   */
  function detail(o = {}) {
    const asideHtml = Array.isArray(o.aside) ? o.aside.filter(Boolean).join('') : (o.aside || '');
    const badges = (o.badges || []).filter(Boolean)
      .map(([label, kind]) => (window.UI ? UI.badge(label, kind) : esc(label))).join(' ');
    return `
      <div class="dt">
        <div class="dt-head">
          ${o.back ? `<button class="dt-back" onclick="${o.back.onclick}">
            ${Icon('back', 16)}<span>${esc(o.back.label || 'Späť')}</span></button>` : ''}
          <div class="dt-title">
            <h2>${esc(o.title || '')}</h2>
            ${o.subtitle ? `<span>${esc(o.subtitle)}</span>` : ''}
          </div>
          ${badges ? `<div class="dt-badges">${badges}</div>` : ''}
          ${o.actions ? `<div class="dt-actions">${o.actions}</div>` : ''}
        </div>
        <div class="dt-cols${asideHtml ? '' : ' dt-solo'}">
          <div class="dt-main">${o.body || ''}</div>
          ${asideHtml ? `<aside class="dt-aside">
            ${o.asideTitle ? `<div class="dt-aside-head">${esc(o.asideTitle)}</div>` : ''}
            ${asideHtml}
          </aside>` : ''}
        </div>
        ${o.mini ? `<div class="dt-mini">${o.mini}</div>` : ''}
      </div>`;
  }

  /** Blok do bočného panelu. */
  function asideBlock(title, bodyHtml, { tone = '' } = {}) {
    return `<div class="dt-block${tone ? ' dt-' + tone : ''}">
      ${title ? `<div class="dt-block-head">${esc(title)}</div>` : ''}
      <div class="dt-block-body">${bodyHtml}</div>
    </div>`;
  }

  /** Riadok „názov — hodnota" do bočného panelu. Prázdna hodnota sa vynechá. */
  function fact(label, value, { mono = false } = {}) {
    if (value === null || value === undefined || value === '') return '';
    return `<div class="dt-fact"><span>${esc(label)}</span>
      <b${mono ? ' class="mono"' : ''}>${esc(value)}</b></div>`;
  }

  // ── Zoznam s filtrom ──────────────────────────────────────────────────────

  /**
   * Čisté filtrovanie. Hľadá vo zvolených poliach bez ohľadu na diakritiku
   * a veľkosť písmen — „zilina" nájde Žilinu, lebo nikto nepíše s mäkčeňmi,
   * keď hľadá.
   */
  function matches(row, query, fields) {
    const q = norm(query);
    if (!q) return true;
    const terms = q.split(/\s+/).filter(Boolean);
    // Pole môže byť aj funkcia — meno odberateľa býva v inej tabuľke a bez
    // toho by sa faktúra nedala nájsť podľa toho, komu sa fakturovala.
    const hay = (fields && fields.length ? fields : Object.keys(row || {}))
      .map(f => norm(typeof f === 'function' ? f(row) : pluck(row, f))).join(' ');
    return terms.every(t => hay.includes(t));
  }

  function norm(v) {
    return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  /** Hodnota z riadku, vrátane vnorenej cesty „partner.name". */
  function pluck(row, path) {
    return String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), row);
  }

  /**
   * Filter nad zoznamom: text + rovnostné filtre + obdobie.
   * @param {Array} rows
   * @param {Object} state
   *   q, fields        hľadanie
   *   equals           { stav: 'aktivna' } — prázdna hodnota nefiltruje
   *   period           { field, key, from, to } — `field` je dátumový stĺpec,
   *                    zvyšok je to, čo vráti pruh filtrov
   */
  function filterRows(rows, state = {}) {
    const eq = state.equals || {};
    const range = periodRange(state.period);
    return (rows || []).filter(r => {
      for (const [k, v] of Object.entries(eq)) {
        if (v === '' || v == null) continue;      // „všetko" nefiltruje
        if (String(pluck(r, k) ?? '') !== String(v)) return false;
      }
      if (range && !window.DanubraPeriod.covers(range, pluck(r, state.period.field))) return false;
      return matches(r, state.q, state.fields);
    });
  }

  /**
   * Rozsah obdobia pre zoznam. Bez knižnice období alebo bez dátumového
   * stĺpca sa nefiltruje — zoznam nemá zmiznúť preto, že sa niečo nenačítalo.
   */
  function periodRange(p) {
    if (!p || !p.field || !p.key || !window.DanubraPeriod) return null;
    const r = window.DanubraPeriod.range(p.key, null, { from: p.from, to: p.to });
    return (r.from || r.to) ? r : null;
  }

  /**
   * @param {Object} o
   *   total, shown     počty — zoznam vždy povie, koľko z koľkých ukazuje
   *   search           { value, placeholder, oninput }
   *   selects          [{ value, options: [[v,label]], onchange, label }]
   *   chips            [{ label, active, onclick, count }]
   *   period           { field, key, from, to, label, set } — `set` je názov
   *                    funkcie `(kľúč, hodnota)`, napríklad „Inv.setF"
   *   exportCsv        JS, ktorý spustí export toho, čo je práve vidieť
   *   right            HTML vpravo (napríklad „Pridať")
   */
  function filterbar(o = {}) {
    const s = o.search;
    const sel = (x) => `<select onchange="${x.onchange}" aria-label="${esc(x.label || '')}">
      ${(x.options || []).map(([v, l]) =>
        `<option value="${esc(v)}"${String(x.value ?? '') === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}
    </select>`;
    const chip = (c) => `<button class="fb-chip${c.active ? ' active' : ''}" onclick="${c.onclick}">
      ${esc(c.label)}${c.count != null ? `<em>${c.count}</em>` : ''}</button>`;
    const counted = o.total != null && o.shown != null && o.shown !== o.total;
    return `
      <div class="filterbar">
        ${s ? `<div class="fb-search"><input value="${esc(s.value || '')}"
          placeholder="${esc(s.placeholder || 'Hľadať…')}" oninput="${s.oninput}"></div>` : ''}
        ${(o.selects || []).map(sel).join('')}
        ${periodPicker(o.period)}
        ${(o.chips || []).map(chip).join('')}
        ${counted ? `<span class="fb-count">${o.shown} z ${o.total}</span>` : ''}
        ${o.exportCsv || o.right ? `<div class="fb-right">
          ${o.exportCsv ? `<button class="btn btn-outline btn-sm" onclick="${o.exportCsv}"
            title="Exportovať do CSV to, čo je práve vidieť">
            ${window.Icon ? Icon('download', 14) : ''} Export</button>` : ''}
          ${o.right || ''}
        </div>` : ''}
      </div>
      ${o.period && o.period.key === 'custom' ? `<div class="filterbar fb-dates">
        <label class="dashbar-field"><span>Od</span>
          <input type="date" value="${esc(o.period.from || '')}"
            onchange="${o.period.set}('from', this.value)"></label>
        <label class="dashbar-field"><span>Do</span>
          <input type="date" value="${esc(o.period.to || '')}"
            onchange="${o.period.set}('to', this.value)"></label>
        <span class="dashbar-hint">${
          o.period.from || o.period.to
            ? esc(window.DanubraPeriod ? DanubraPeriod.text(periodRange(o.period)) : '')
            : 'Zadaj aspoň jednu hranicu — dovtedy sa ukazuje všetko.'}</span>
      </div>` : ''}`;
  }

  /**
   * Výber obdobia. V zozname je predvolené „za celý čas" — zoznam, ktorý pri
   * otvorení schová staršie záznamy, vyzerá ako stratené dáta.
   */
  function periodPicker(p) {
    if (!p || !p.field || !window.DanubraPeriod) return '';
    return `<label class="fb-period">
      ${window.Icon ? Icon('calendar', 14) : ''}
      <span>${esc(p.label || 'Obdobie')}</span>
      <select onchange="${p.set}('period', this.value)" aria-label="${esc(p.label || 'Obdobie')}">
        ${[['all', 'za celý čas'], ...DanubraPeriod.OPTIONS.filter(x => x[0] !== 'all')]
          .map(([v, l]) => `<option value="${v}"${(p.key || 'all') === v ? ' selected' : ''}>${esc(l)}</option>`)
          .join('')}
      </select>
    </label>`;
  }

  /**
   * Zoznam ako celok. Prázdny výsledok filtra sa nesmie tváriť ako prázdna
   * databáza — sú to dve rôzne situácie a človek musí vedieť, ktorá je ktorá.
   */
  function list(o = {}) {
    const rows = o.rows || [];
    const body = rows.length
      ? `<div class="${o.layout === 'cards' ? 'cards' : 'rows'}">${rows.map(o.render).join('')}</div>`
      : (o.total
        ? (window.UI ? UI.empty('search', 'Filtru nič nesedí',
            `V databáze je ${o.total} záznamov, ale ani jeden nevyhovuje.`) : '')
        : (o.emptyHtml || (window.UI ? UI.empty(o.emptyIcon || 'inbox',
            o.emptyTitle || 'Zatiaľ nič', o.emptySub || '') : '')));
    return filterbar({ ...o.filter, total: o.total, shown: rows.length }) + body;
  }

  // ── Poznámky, ktoré sa dajú len pridať ────────────────────────────────────
  // Tvrdé pravidlo zo zadania: nič sa fyzicky nemaže. Komponent preto
  // nekreslí tlačidlo na zmazanie ani na úpravu — nie „zakázané", ale
  // neexistujúce, aby na to nikto nečakal.

  /**
   * @param {Object} o
   *   notes    [{ id, body, author, created_at, kind }]
   *   onAdd    JS, ktorý pridá poznámku (dostane text z poľa)
   *   inputId  id textového poľa
   *   title, placeholder
   */
  function notes(o = {}) {
    const rows = [...(o.notes || [])].sort(
      (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const inputId = o.inputId || 'note-input';
    return `
      <div class="card card-pad notes">
        <div class="card-head"><div class="card-title">${esc(o.title || 'Poznámky')}</div>
          <span class="notes-rule">${rows.length} ${plural(rows.length, 'záznam', 'záznamy', 'záznamov')} · nič sa nemaže</span>
        </div>
        ${o.onAdd ? `
        <div class="notes-add">
          <textarea id="${inputId}" rows="2" placeholder="${esc(o.placeholder || 'Čo sa stalo? Píš tak, aby to o mesiac dávalo zmysel.')}"></textarea>
          <button class="btn btn-primary btn-sm" onclick="${o.onAdd}">${Icon('plus', 14)} Pridať</button>
        </div>` : ''}
        ${rows.length ? `<div class="notes-list">${rows.map(noteRow).join('')}</div>`
          : `<div class="notes-empty">Zatiaľ žiadna poznámka.</div>`}
      </div>`;
  }

  function noteRow(n) {
    const when = n.created_at
      ? new Date(n.created_at).toLocaleString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    return `<div class="note${n.kind ? ' note-' + esc(n.kind) : ''}">
      <div class="note-meta">
        <b>${esc(n.author || 'neznámy')}</b>
        <span>${esc(when)}</span>
        ${n.kind ? `<em>${esc(n.kind)}</em>` : ''}
      </div>
      <div class="note-body">${esc(n.body || '')}</div>
    </div>`;
  }

  function plural(n, one, few, many) {
    const a = Math.abs(n);
    if (a === 1) return one;
    if (a >= 2 && a <= 4) return few;
    return many;
  }

  // ── Prehľad súm ───────────────────────────────────────────────────────────
  // Číslo bez toho, z čoho vzniklo, sa nedá overiť. Preto sa vždy kreslia
  // aj riadky, nielen výsledok.

  /**
   * Zosumuje riadky. Vstup aj výstup sú celé centy (lib/money.js).
   * @param {Array} lines  [{ label, cents, kind }]
   *   kind: 'plus' (predvolené) | 'minus' | 'info' (nepočíta sa)
   * @returns {{ total:number, lines:Array }}
   */
  function total(lines) {
    let t = 0;
    for (const l of (lines || [])) {
      if (!l || l.kind === 'info') continue;
      const c = l.cents || 0;
      if (!Number.isInteger(c)) throw new TypeError(`suma nie je v celých centoch: ${l.label} = ${c}`);
      t += l.kind === 'minus' ? -c : c;
    }
    return { total: t, lines: (lines || []).filter(Boolean) };
  }

  /**
   * @param {Object} o
   *   lines       [{ label, cents, kind, hint }]
   *   totalLabel  názov výsledného riadku
   *   note        vysvetlenie pod súčtom
   *   compact     bez rámu — do bočného panelu
   */
  function sums(o = {}) {
    const { total: t, lines } = total(o.lines);
    const fmt = (c) => (window.Money ? Money.format(c) : String(c));
    const row = (l) => {
      const cls = l.kind === 'minus' ? 'sum-minus' : (l.kind === 'info' ? 'sum-info' : '');
      const val = l.kind === 'minus' ? '−' + fmt(Math.abs(l.cents || 0)) : fmt(l.cents || 0);
      return `<div class="sum-row ${cls}">
        <span>${esc(l.label)}${l.hint ? `<em>${esc(l.hint)}</em>` : ''}</span>
        <b>${val}</b>
      </div>`;
    };
    return `
      <div class="sums${o.compact ? ' sums-compact' : ''}">
        ${lines.map(row).join('')}
        <div class="sum-row sum-total">
          <span>${esc(o.totalLabel || 'Spolu')}</span><b>${fmt(t)}</b>
        </div>
        ${o.note ? `<div class="sums-note">${esc(o.note)}</div>` : ''}
      </div>`;
  }

  // ── Blokátor s vysvetlením ────────────────────────────────────────────────
  // Zadanie: „nasadenie bez platných dokladov len s výnimkou admina".
  // Blokátor teda nesmie byť len červená hláška — musí povedať, čo chýba,
  // čo sa stane, a nechať zapísať výnimku s dôvodom.

  /**
   * Vyhodnotí, či sa dá pokračovať.
   * @param {Array} reasons  [{ rule, label, detail, severity }]
   *   severity: 'block' (predvolené) | 'warn'
   * @param {Array} overrides  [{ rule_key, revoked_at, valid_until }]
   * @param {string} today  ISO dátum, kvôli testovateľnosti
   */
  function evaluate(reasons, overrides = [], today = new Date().toISOString().slice(0, 10)) {
    const live = (overrides || []).filter(o =>
      !o.revoked_at && (!o.valid_until || String(o.valid_until) >= today));
    const covered = new Set(live.map(o => o.rule_key));
    const open = [], waived = [], warnings = [];
    for (const r of (reasons || [])) {
      if (!r) continue;
      if (r.severity === 'warn') { warnings.push(r); continue; }
      (covered.has(r.rule) ? waived : open).push(r);
    }
    // Nie každú prekážku vie výnimka pokryť. Chýbajúce A1 áno — riziko je
    // reálne a niekto ho môže prevziať. Faktúru bez odberateľa nie: tam nie
    // je čo prevziať, nie je komu fakturovať. Blokátor to musí rozlíšiť,
    // inak ponúkne okienko na dôvod aj tam, kde zápis dôvodu nič nevyrieši.
    const O = typeof window !== 'undefined' ? window.DanubraOverrides : null;
    const canWaive = open.filter(r => !O || O.waivable(r.rule));
    const hard = O ? open.filter(r => !O.waivable(r.rule)) : [];
    return { ok: open.length === 0, open, waived, warnings, canWaive, hard };
  }

  /** Dôvod výnimky musí prejsť aj v databáze (CHECK >= 5 znakov). */
  const REASON_MIN = 5;
  function reasonValid(text) { return String(text ?? '').trim().length >= REASON_MIN; }

  /**
   * @param {Object} o
   *   reasons, overrides, today   — vstup pre evaluate()
   *   action        { label, onclick }  čo sa má dať urobiť, keď je čisto
   *   onOverride    JS na uloženie výnimky; ak chýba, výnimka sa neponúka
   *   inputId       id poľa na dôvod
   *   okHtml        čo zobraziť, keď nič neblokuje
   *   noOvrNote     čím nahradiť vetu „výnimku môže povoliť len admin"
   */
  function blocker(o = {}) {
    const v = evaluate(o.reasons, o.overrides, o.today);
    const inputId = o.inputId || 'ovr-reason';

    const item = (r, kind) => `<li class="bl-${kind}">
      ${Icon(kind === 'waived' ? 'check' : (kind === 'warn' ? 'shield' : 'x'), 14)}
      <div><b>${esc(r.label)}</b>${r.detail ? `<span>${esc(r.detail)}</span>` : ''}
      ${kind === 'waived' ? '<em>povolené výnimkou</em>' : ''}</div></li>`;

    const warn = v.warnings.length
      ? `<ul class="bl-list">${v.warnings.map(r => item(r, 'warn')).join('')}</ul>` : '';
    const waived = v.waived.length
      ? `<ul class="bl-list">${v.waived.map(r => item(r, 'waived')).join('')}</ul>` : '';

    if (v.ok) {
      return `<div class="blocker blocker-ok">
        <div class="bl-head">${Icon('check', 16)}<b>Nič neblokuje</b></div>
        ${waived}${warn}
        ${o.okHtml || ''}
        ${o.action ? `<button class="btn btn-primary" onclick="${o.action.onclick}">${esc(o.action.label)}</button>` : ''}
      </div>`;
    }

    return `<div class="blocker blocker-stop">
      <div class="bl-head">${Icon('x', 16)}<b>Takto to nepustím</b>
        <span>${v.open.length} ${plural(v.open.length, 'vec chýba', 'veci chýbajú', 'vecí chýba')}</span>
      </div>
      <ul class="bl-list">${v.open.map(r => item(r, 'stop')).join('')}</ul>
      ${waived}${warn}
      ${overrideHtml(o, v, inputId)}
    </div>`;
  }

  /**
   * Spodok blokátora: čo sa s tým dá urobiť.
   *
   * Sú tri možnosti a je dôležité ich nepomiešať, lebo každá vedie človeka
   * inam: buď to smie povoliť (a treba mu povedať, čo tým berie na seba),
   * alebo to povoliť nemôže nikto (a treba povedať, čo namiesto toho),
   * alebo to povoliť smie len niekto iný.
   */
  function overrideHtml(o, v, inputId) {
    const O = typeof window !== 'undefined' ? window.DanubraOverrides : null;
    const hard = v.hard || [];
    const canWaive = v.canWaive || v.open;

    // Prekážky, ktoré výnimka nerieši. Pri každej je napísané, čo namiesto
    // nej — „nepustím to" bez pokračovania pošle človeka hľadať chybu
    // v appke namiesto v doklade.
    const hardHtml = (O && hard.length)
      ? `<div class="bl-hard">
          <b>${hard.length === 1 ? 'Toto výnimka nerieši' : 'Tieto výnimka nerieši'}:</b>
          <ul>${hard.map(r => `<li><b>${esc(r.label)}</b>${
            O.hardWhy(r.rule) ? ` — ${esc(O.hardWhy(r.rule))}` : ''}</li>`).join('')}</ul>
        </div>` : '';

    if (!canWaive.length) return hardHtml;
    if (!o.onOverride) {
      return hardHtml + `<p class="bl-noovr">${
        esc(o.noOvrNote || 'Výnimku môže povoliť len administrátor.')}</p>`;
    }

    // Čo tým človek na seba berie. Bez toho je výnimka len tlačidlo „áno".
    const risks = O
      ? [...new Set(canWaive.map(r => O.riskOf(r.rule)).filter(Boolean))]
      : [];

    return hardHtml + `
      <details class="bl-ovr">
        <summary>Chcem to povoliť aj tak</summary>
        <p>Výnimka sa zapíše natrvalo — kto ju povolil, kedy a prečo.
           Dôvod je povinný a musí mať aspoň ${REASON_MIN} znakov.</p>
        ${O ? `<p class="bl-ovr-sum">${esc(O.summary(v.open))}</p>` : ''}
        ${risks.length ? `<ul class="bl-risk">${
          risks.map(t => `<li>${Icon('alert', 12)} ${esc(t)}</li>`).join('')}</ul>` : ''}
        <textarea id="${inputId}" rows="2" placeholder="Prečo to ide bez toho?"></textarea>
        <button class="btn btn-danger btn-sm" onclick="${o.onOverride}">
          ${Icon('shield', 14)} Zapísať výnimku</button>
      </details>`;
  }

  /**
   * Export toho, čo je práve vidieť — nie celej tabuľky. Keď si človek
   * vyfiltruje jeden mesiac a jednu zákazku, čaká v súbore presne to.
   * @param {Array} rows
   * @param {Array} columns  [[nadpis, (riadok) => hodnota]]
   * @param {Array} nameParts  do názvu súboru
   */
  function exportCsv(rows, columns, nameParts) {
    const E = window.DanubraExport;
    if (!E) return;
    if (!rows || !rows.length) {
      return window.UI && UI.toast('Nie je čo exportovať — zoznam je prázdny.', 'err');
    }
    const out = [columns.map(c => c[0]), ...rows.map(r => columns.map(c => c[1](r)))];
    const name = E.download(out, nameParts);
    if (window.UI) UI.toast(`Uložené: ${name}`, 'ok');
  }

  /** Obdobie do názvu súboru, nech sa dva exporty nepomiešajú. */
  function periodSlug(p) {
    if (!window.DanubraPeriod) return '';
    return DanubraPeriod.slug(periodRange(p));
  }

  const API = {
    detail, asideBlock, fact,
    list, filterbar, filterRows, matches, pluck, norm,
    periodRange, periodSlug, exportCsv,
    notes, noteRow,
    sums, total,
    blocker, evaluate, reasonValid, REASON_MIN,
    plural,
  };
  window.Shell = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
