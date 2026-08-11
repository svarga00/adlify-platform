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

  date(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch { return String(d); }
  },

  dateRange(from, to) {
    return `${this.date(from)} – ${this.date(to)}`;
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
    document.body.style.overflow = '';
  },

  // Form field helper
  field(name, label, { type = 'text', value = '', required = false, placeholder = '', options, rows } = {}) {
    const v = this.esc(value);
    let input;
    if (options) {
      input = `<select name="${name}" ${required ? 'required' : ''}>${options.map(o => {
        const [val, lbl] = Array.isArray(o) ? o : [o, o];
        return `<option value="${this.esc(val)}" ${String(val) === String(value) ? 'selected' : ''}>${this.esc(lbl)}</option>`;
      }).join('')}</select>`;
    } else if (type === 'textarea') {
      input = `<textarea name="${name}" rows="${rows || 3}" placeholder="${this.esc(placeholder)}">${v}</textarea>`;
    } else if (type === 'checkbox') {
      input = `<label class="chk"><input type="checkbox" name="${name}" ${value ? 'checked' : ''}> ${this.esc(placeholder || label)}</label>`;
      return `<div class="fld fld-chk">${input}</div>`;
    } else {
      input = `<input type="${type}" name="${name}" value="${v}" ${required ? 'required' : ''} placeholder="${this.esc(placeholder)}">`;
    }
    return `<label class="fld"><span>${this.esc(label)}${required ? ' *' : ''}</span>${input}</label>`;
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
