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
      <div class="empty-ico">${ico}</div>
      <div style="font-size:15px;font-weight:600;color:var(--ink-sub);margin-bottom:4px;">${this.esc(title)}</div>
      ${sub ? `<div style="font-size:13px;margin-bottom:14px;">${this.esc(sub)}</div>` : ''}
      ${cta || ''}
    </div>`;
  },

  loading() {
    return `<div class="empty"><div class="empty-ico">⏳</div><div>Načítavam…</div></div>`;
  },
};
