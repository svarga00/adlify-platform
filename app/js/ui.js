// DANUBRA — UI utility (toast, esc, formátovanie, mobil-first helpery).
window.UI = {
  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  toast(msg, kind = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast' + (kind ? ` toast-${kind}` : '');
    el.hidden = false;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { el.hidden = true; }, 2800);
  },

  money(n, currency = 'EUR') {
    const v = Number(n || 0);
    return v.toLocaleString('sk-SK', { style: 'currency', currency, minimumFractionDigits: 2 });
  },

  /**
   * Percentá po slovensky — s čiarkou, nie s bodkou. JavaScript vypíše
   * `27.48`, čo v slovenskom texte vyzerá ako cudzie číslo. Bolo to
   * rozsypané na šiestich miestach, každé s vlastným riešením.
   */
  pct(n, digits) {
    if (n == null || n === '' || !Number.isFinite(Number(n))) return '—';
    const v = Number(n);
    const d = digits != null ? digits : (Number.isInteger(v) ? 0 : 2);
    return `${v.toLocaleString('sk-SK', { minimumFractionDigits: d, maximumFractionDigits: d })} %`;
  },

  date(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch { return String(d); }
  },

  /**
   * Obdobie. Zákazka často nemá koniec — dovtedy sa kreslilo „01. 09. 2026 – —",
   * čo vyzerá ako chýbajúci údaj, hoci je to zámer: beží, kým sa neukončí.
   */
  dateRange(from, to) {
    if (from && to) return `${this.date(from)} – ${this.date(to)}`;
    if (from) return `od ${this.date(from)}`;
    if (to) return `do ${this.date(to)}`;
    return '—';
  },

  // Počet nocí medzi dvoma dátumami (UTC, bez DST posunov)
  nights(from, to) {
    if (!from || !to) return 0;
    const a = new Date(from), b = new Date(to);
    return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
      Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
  },

  badge(label, kind) {
    const map = {
      green: 'background:var(--green-50);color:var(--green);',
      blue:  'background:var(--blue-50);color:var(--blue);',
      amber: 'background:var(--amber-50);color:var(--amber);',
      red:   'background:var(--red-50);color:var(--red);',
      gray:  'background:var(--bg);color:var(--ink-sub);',
      brand: 'background:var(--brand-50);color:var(--brand-dark);',
    };
    return `<span class="badge" style="${map[kind] || map.gray}">${this.esc(label)}</span>`;
  },

  empty(ico, title, sub, cta) {
    return `<div class="empty">
      <div class="empty-ico">${window.Icon && Icon.has(ico) ? Icon(ico, 34) : ''}</div>
      <div style="font-size:15px;font-weight:600;color:var(--ink-sub);margin-bottom:4px;">${this.esc(title)}</div>
      ${sub ? `<div style="font-size:13px;margin-bottom:14px;">${this.esc(sub)}</div>` : ''}
      ${cta || ''}
    </div>`;
  },

  loading() {
    return `<div class="empty"><div class="empty-ico">${window.Icon ? Icon('clock', 30) : ''}</div><div>Načítavam…</div></div>`;
  },

  // ── Modal ─────────────────────────────────────────────────────────────────
  modal(title, bodyHtml, { wide = false } = {}) {
    this.closeModal();
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.id = 'ui-modal';
    el.innerHTML = `
      <div class="modal-card${wide ? ' modal-wide' : ''}">
        <div class="modal-head">
          <h3>${this.esc(title)}</h3>
          <button class="modal-x" onclick="UI.closeModal()" aria-label="Zavrieť">${window.Icon ? Icon("x", 17) : ""}</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
      </div>`;
    el.addEventListener('click', (e) => { if (e.target === el) this.closeModal(); });
    document.body.appendChild(el);
    document.body.style.overflow = 'hidden';
    return el;
  },
  closeModal() {
    document.getElementById('ui-modal')?.remove();
    if (!document.getElementById('ui-ask')) document.body.style.overflow = '';
  },

  // ── Otázka a potvrdenie ───────────────────────────────────────────────────
  // Natívne `prompt()` a `confirm()` vyzerajú ako chyba stránky: sivé okno
  // s adresou webu v nadpise, cudzie písmo, na mobile úplne inak. Navyše sa
  // v nich nedá nič vysvetliť — a pri mazaní alebo rušení je vysvetlenie to
  // najdôležitejšie.
  //
  // Toto okno sa otvára **nad** prípadným otvoreným oknom, takže detail
  // záznamu pod ním zostane. Vracia `Promise`, takže sa volá s `await`.

  /** @returns {Promise<string|null>} `null` = zrušené */
  ask(question, o = {}) {
    return this._sheet({
      ...o,
      question,
      field: o.multiline
        ? `<textarea id="ui-ask-input" rows="${o.rows || 4}"
             placeholder="${this.esc(o.placeholder || '')}">${this.esc(o.value || '')}</textarea>`
        : `<input id="ui-ask-input" type="${o.type || 'text'}"
             value="${this.esc(o.value ?? '')}" placeholder="${this.esc(o.placeholder || '')}">`,
      okLabel: o.ok || 'Uložiť',
      read: () => {
        const el = document.getElementById('ui-ask-input');
        return el ? el.value : null;
      },
      // Prázdna odpoveď je odpoveď „nič" — nie zrušenie. Rozlišuje sa to,
      // lebo niekde je prázdno v poriadku a inde je to chyba.
      empty: null,
    });
  },

  /**
   * Niekoľko polí naraz, v okne **nad** otvoreným formulárom.
   *
   * `ask()` zvládne jedno pole, a to na založenie záznamu nestačí: odberateľ
   * potrebuje aspoň meno a krajinu. Zároveň sa to nesmie otvoriť ako obyčajné
   * okno — to by zavrelo rozrobený formulár a prišlo by sa o to, čo už je
   * vypísané. Práve kvôli tomu to celé vzniklo.
   *
   * @param {Array} fields  [[name, label, { type, options, required, placeholder, hint }]]
   * @returns {Promise<Object|null>} `null` = zrušené
   */
  askFields(title, question, fields, o = {}) {
    const id = (n) => `ask-f-${n}`;
    const html = (fields || []).map(([name, label, f = {}]) => {
      const req = f.required ? ' required' : '';
      if (f.options) {
        return `<label class="fld"><span>${this.esc(label)}${f.required ? ' *' : ''}</span>
          <select id="${id(name)}"${req}>${f.options.map((op) => {
            const [v, l] = Array.isArray(op) ? op : [op, op];
            return `<option value="${this.esc(v)}" ${
              String(v) === String(f.value ?? '') ? 'selected' : ''}>${this.esc(l)}</option>`;
          }).join('')}</select>${this.hint(f.hint)}</label>`;
      }
      return `<label class="fld"><span>${this.esc(label)}${f.required ? ' *' : ''}</span>
        <input id="${id(name)}" type="${f.type || 'text'}" value="${this.esc(f.value ?? '')}"
          placeholder="${this.esc(f.placeholder || '')}"${req}>${this.hint(f.hint)}</label>`;
    }).join('');

    return this._sheet({
      ...o,
      question,
      field: `<div class="ask-fields">${html}</div>`,
      okLabel: o.ok || 'Založiť',
      read: () => {
        const out = {};
        for (const [name, label, f = {}] of fields) {
          const el = document.getElementById(id(name));
          const v = el ? String(el.value || '').trim() : '';
          // Povinné pole sa nedá obísť tichým uložením prázdna — vznikol by
          // záznam, ktorý sa potom hľadá, prečo nemá meno.
          if (f.required && !v) { UI.toast(`Vyplňte: ${label}`, 'err'); return undefined; }
          if (v) out[name] = v;
        }
        return out;
      },
      empty: null,
    });
  },

  /** @returns {Promise<boolean>} */
  confirm(question, o = {}) {
    return this._sheet({
      ...o,
      question,
      field: '',
      okLabel: o.ok || 'Áno',
      danger: o.danger !== false,
      read: () => true,
      empty: false,
    }).then(v => v === true);
  },

  _sheet(o) {
    return new Promise((resolve) => {
      this._closeAsk();
      const el = document.createElement('div');
      el.className = 'modal-backdrop ask-backdrop';
      el.id = 'ui-ask';
      el.innerHTML = `
        <div class="modal-card ask-card">
          <div class="ask-body">
            ${o.title ? `<h3>${this.esc(o.title)}</h3>` : ''}
            <p class="ask-q">${this.esc(o.question)}</p>
            ${o.hint ? `<p class="ask-hint">${this.esc(o.hint)}</p>` : ''}
            ${o.field}
          </div>
          <div class="ask-actions">
            <button class="btn btn-ghost" data-ask="cancel">${this.esc(o.cancel || 'Zrušiť')}</button>
            <button class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}" data-ask="ok">
              ${this.esc(o.okLabel)}</button>
          </div>
        </div>`;

      const done = (val) => {
        document.removeEventListener('keydown', keys);
        el.remove();
        if (!document.getElementById('ui-modal')) document.body.style.overflow = '';
        resolve(val);
      };
      const keys = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); done(o.empty); }
        // V jednoriadkovom poli je Enter potvrdenie; vo viacriadkovom je to
        // nový riadok, tam sa potvrdzuje tlačidlom.
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          const v = o.read();
          if (v !== undefined) done(v);
        }
      };

      el.addEventListener('click', (e) => {
        const what = e.target.closest('[data-ask]');
        if (what) {
          if (what.dataset.ask !== 'ok') return done(o.empty);
          // `read()` smie vrátiť `undefined` a tým povedať „takto to neberiem".
          // Okno vtedy zostane otvorené aj s tým, čo je už vypísané — zavrieť
          // ho a nechať človeka písať odznova by bolo horšie než chyba sama.
          const v = o.read();
          return v === undefined ? undefined : done(v);
        }
        if (e.target === el) done(o.empty);
      });
      document.addEventListener('keydown', keys);
      document.body.appendChild(el);
      document.body.style.overflow = 'hidden';
      setTimeout(() => {
        const f = document.getElementById('ui-ask-input');
        if (f) { f.focus(); if (f.select) f.select(); }
        else el.querySelector('[data-ask=ok]')?.focus();
      }, 20);
    });
  },

  _closeAsk() { document.getElementById('ui-ask')?.remove(); },

  // Form field helper
  // `step` je tu kvôli peniazom. `<input type="number">` má bez neho krok 1,
  // takže sadzba 18,50 €/h neprejde validáciou a formulár sa ticho neodošle.
  // Preto je pri číslach predvolené `any`.
  // `hint` je veta pod poľom. Nie opis toho, čo je v názve („Sadzba — sem
  // napíš sadzbu"), ale to, čo sa stane, keď sa to vyplní zle: v akej
  // jednotke to je, čo z toho appka počíta a kde sa to potom objaví.
  // Dáva sa len tam, kde zlá hodnota niečo pokazí — pri každom poli by
  // z toho bola stena textu, ktorú nikto nečíta.
  field(name, label, { type = 'text', value = '', required = false, placeholder = '', options, rows, step, hint, add, onchange, tip } = {}) {
    // `tip` = otáznik pri názve poľa s krátkym vysvetlením (`UI.tip`).
    const tipHtml = tip ? ` ${this.tip(tip)}` : '';
    const v = this.esc(value);
    // `onchange` je tu pre polia, ktoré **prekresľujú formulár** — napríklad
    // výber týždňa v zápise hodín. Bez neho by sa taký formulár musel písať
    // ručne a stratil by vysvetlivku aj zarovnanie.
    const ev = onchange ? ` onchange="${this.esc(onchange)}"` : '';
    let input;
    if (options) {
      input = `<select name="${name}"${ev} ${required ? 'required' : ''}>${options.map(o => {
        const [val, lbl] = Array.isArray(o) ? o : [o, o];
        return `<option value="${this.esc(val)}" ${String(val) === String(value) ? 'selected' : ''}>${this.esc(lbl)}</option>`;
      }).join('')}</select>`;
    } else if (type === 'textarea') {
      input = `<textarea name="${name}" rows="${rows || 3}" placeholder="${this.esc(placeholder)}">${v}</textarea>`;
    } else if (type === 'checkbox') {
      input = `<label class="chk"><input type="checkbox" name="${name}" ${value ? 'checked' : ''}> ${this.esc(placeholder || label)}</label>${tipHtml}`;
      return `<div class="fld fld-chk">${input}${this.hint(hint)}</div>`;
    } else {
      const stepAttr = type === 'number' ? ` step="${this.esc(step || 'any')}"` : '';
      input = `<input type="${type}" name="${name}" value="${v}"${stepAttr}${ev} ${required ? 'required' : ''} placeholder="${this.esc(placeholder)}">`;
    }
    // `add` je kľúč z `Danubra.NEW` — výber, pri ktorom sa dá rovno založiť
    // nový záznam. Bez neho sa dá vybrať len to, čo už existuje, takže keď
    // odberateľ ešte nie je v databáze, treba zavrieť rozpísaný formulár,
    // ísť inam, založiť ho a vrátiť sa — a rozpísané sa stratí.
    if (add && options) {
      return `<label class="fld fld-pick"><span>${this.esc(label)}${required ? ' *' : ''}${tipHtml}</span>
        <span class="pick">${input}
          <button type="button" class="pick-add"
            onclick="Danubra.quickAdd('${add}','${name}')"
            title="Založiť nový záznam" aria-label="Založiť nový záznam">
            ${window.Icon ? Icon('plus', 15) : '+'}</button>
        </span>${this.hint(hint)}</label>`;
    }
    return `<label class="fld"><span>${this.esc(label)}${required ? ' *' : ''}${tipHtml}</span>${input}${this.hint(hint)}</label>`;
  },

  // ── Otáznik s krátkym vysvetlením ─────────────────────────────────────────
  // „Ku všetkému, čo môže spôsobiť minimálne pochyby, priložte otáznik
  // s vysvetlením." Na rozdiel od `Help.btn` (celá vysvetlivka v okne) je to
  // jedna-dve vety priamo pri poli alebo tlačidle: čo to je a čo sa stane.
  // Na počítači sa ukáže pri nabehnutí myšou, na mobile po ťuknutí.
  /** @param {string} text  vysvetlenie obyčajnou rečou (bez HTML) */
  tip(text, { size = 13 } = {}) {
    const t = String(text || '').trim();
    if (!t) return '';
    return `<button type="button" class="tip-btn no-print" data-tip="${this.esc(t)}"
      aria-label="Vysvetlenie: ${this.esc(t)}">${window.Icon ? Icon('help', size) : '?'}</button>`;
  },
  _tipShow(btn) {
    this._tipHide();
    const box = document.createElement('div');
    box.id = 'ui-tip'; box.className = 'tip-pop'; box.setAttribute('role', 'tooltip');
    box.textContent = btn.dataset.tip;
    document.body.appendChild(box);
    const r = btn.getBoundingClientRect();
    const w = box.offsetWidth, h = box.offsetHeight;
    let left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    let top = r.top - h - 8;
    if (top < 8) { top = r.bottom + 8; box.classList.add('is-below'); }
    box.style.left = `${left}px`; box.style.top = `${top}px`;
    box.style.setProperty('--tip-x', `${r.left + r.width / 2 - left}px`);
    this._tipBtn = btn;
  },
  _tipHide() { document.getElementById('ui-tip')?.remove(); this._tipBtn = null; },
  _tipBind() {
    if (this._tipBound || typeof document === 'undefined') return;
    this._tipBound = true;
    const hover = () => window.matchMedia && matchMedia('(hover: hover)').matches;
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('.tip-btn');
      if (b) {
        // Klik na otáznik v názve poľa nesmie preklopiť zaškrtávačku ani
        // odoslať formulár.
        e.preventDefault(); e.stopPropagation();
        if (this._tipBtn === b) this._tipHide(); else this._tipShow(b);
        return;
      }
      if (this._tipBtn) this._tipHide();
    }, true);
    document.addEventListener('mouseover', (e) => {
      const b = e.target.closest && e.target.closest('.tip-btn');
      if (b && hover() && this._tipBtn !== b) this._tipShow(b);
    });
    document.addEventListener('mouseout', (e) => {
      const b = e.target.closest && e.target.closest('.tip-btn');
      if (b && hover() && !b.contains(e.relatedTarget)) this._tipHide();
    });
    document.addEventListener('focusin', (e) => {
      if (e.target.classList && e.target.classList.contains('tip-btn')) this._tipShow(e.target);
    });
    document.addEventListener('focusout', (e) => {
      if (e.target.classList && e.target.classList.contains('tip-btn')) this._tipHide();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._tipHide(); });
    window.addEventListener('scroll', () => this._tipHide(), true);
  },

  /** Veta pod poľom. Prázdne `hint` nič nevykreslí — nie prázdny prvok. */
  hint(text) {
    const t = String(text || '').trim();
    return t ? `<small class="fld-hint">${this.esc(t)}</small>` : '';
  },

  formData(form) {
    const fd = new FormData(form);
    const out = {};
    for (const [k, v] of fd.entries()) out[k] = typeof v === 'string' ? v.trim() : v;
    // checkboxy: nezaškrtnuté nie sú v FormData → doplň false
    form.querySelectorAll('input[type=checkbox]').forEach(c => { out[c.name] = c.checked; });
    return out;
  },
};
window.UI._tipBind();

// Klikateľný <div>/<span>/<tr> s role="button" sa dá stlačiť aj z klávesnice
// (Enter, medzerník) — rovnako ako skutočné tlačidlo. Len keď je fokus priamo
// na ňom; tlačidlo alebo pole vnútri karty si klávesy rieši samo.
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || e.defaultPrevented || e.repeat) return;
    const el = e.target;
    if (!el || !el.matches || !el.matches('[role="button"][onclick]')
      || /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
    e.preventDefault();
    el.click();
  });
}
