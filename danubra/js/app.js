// ============================================================================
// DANUBRA Hub — app bootstrap, auth gate, navigácia, router
// ============================================================================
window.Danubra = {
  user: null,
  route: 'dashboard',

  // Navigačné sekcie. `mobile:true` = zobraz aj v spodných taboch (max 5).
  nav: [
    { key: 'dashboard',     label: 'Dashboard',   ico: '📊', mobile: true },
    { key: 'active',        label: 'Aktívne',     ico: '🏠', mobile: true },
    { key: 'inquiries',     label: 'Dopyty',      ico: '📥', mobile: true },
    { key: 'accommodations',label: 'Ubytovania',  ico: '🛏️', mobile: true },
    { key: 'clients',       label: 'Klienti',     ico: '👥', mobile: true },
    { key: 'invoices',      label: 'Faktúry',     ico: '🧾', mobile: false },
    { key: 'marketing',     label: 'Marketing',   ico: '📣', mobile: false },
    { key: 'settings',      label: 'Nastavenia',  ico: '⚙️', mobile: false },
  ],

  async init() {
    UI._toastT = null;
    this.user = await DB.currentUser();
    DB.onAuth((user) => {
      const was = !!this.user;
      this.user = user;
      if (!!user !== was) this._render();
    });
    // login form
    document.getElementById('login-form').addEventListener('submit', (e) => this._onLogin(e));
    this._buildNav();
    this._render();
    // hash routing
    window.addEventListener('hashchange', () => this._syncRoute());
    this._syncRoute();
  },

  _render() {
    const authed = !!this.user;
    document.getElementById('login-screen').hidden = authed;
    document.getElementById('app').hidden = !authed;
    if (authed) {
      const em = document.getElementById('user-email');
      if (em) em.textContent = this.user.email || '';
      this.renderRoute();
    }
  },

  async _onLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');
    const err = document.getElementById('login-error');
    err.hidden = true;
    btn.disabled = true; btn.textContent = 'Prihlasujem…';
    const { error } = await DB.signIn(email, password);
    btn.disabled = false; btn.textContent = 'Prihlásiť sa';
    if (error) { err.textContent = 'Nesprávny e-mail alebo heslo.'; err.hidden = false; return; }
    this.user = await DB.currentUser();
    this._render();
  },

  async logout() {
    await DB.signOut();
    this.user = null;
    this._render();
  },

  _buildNav() {
    const sideHtml = this.nav.map(n => this._navItem(n, false)).join('');
    document.getElementById('sidebar-nav').innerHTML = sideHtml;
    const mobileItems = this.nav.filter(n => n.mobile).slice(0, 5);
    document.getElementById('bottom-nav').innerHTML = mobileItems.map(n => this._navItem(n, true)).join('');
  },

  _navItem(n, mobile) {
    const active = n.key === this.route ? ' active' : '';
    return `<button class="nav-item${active}" data-key="${n.key}" onclick="Danubra.go('${n.key}')">
      <span class="nav-ico">${n.ico}</span><span>${n.label}</span>
      ${!mobile && n._badge ? `<span class="nav-badge">${n._badge}</span>` : ''}
    </button>`;
  },

  go(key) {
    location.hash = '#/' + key;
  },

  _syncRoute() {
    const m = (location.hash || '').match(/^#\/([a-z-]+)/);
    const key = m ? m[1] : 'dashboard';
    if (this.nav.some(n => n.key === key)) this.route = key;
    else this.route = 'dashboard';
    this.closeSidebar();
    if (this.user) this.renderRoute();
    // sync active class
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.key === this.route);
    });
  },

  renderRoute() {
    const view = document.getElementById('view');
    const item = this.nav.find(n => n.key === this.route);
    document.getElementById('page-title').textContent = item ? item.label : 'DANUBRA';
    document.getElementById('topbar-actions').innerHTML = '';
    const fn = this.views[this.route];
    if (fn) { fn.call(this, view); }
    else { view.innerHTML = UI.empty('🚧', 'Pripravujeme', 'Táto sekcia pribudne v ďalšom milestone.'); }
  },

  toggleSidebar() {
    const sb = document.querySelector('.sidebar');
    sb.classList.toggle('open');
    this._backdrop(sb.classList.contains('open'));
  },
  closeSidebar() {
    document.querySelector('.sidebar')?.classList.remove('open');
    this._backdrop(false);
  },
  _backdrop(show) {
    let bd = document.querySelector('.sidebar-backdrop');
    if (!bd) {
      bd = document.createElement('div');
      bd.className = 'sidebar-backdrop';
      bd.onclick = () => this.closeSidebar();
      document.body.appendChild(bd);
    }
    bd.classList.toggle('show', show);
  },

  // ── VIEWS (M1 shell — dashboard je živý, ostatné placeholdery do M2+) ──────
  views: {
    async dashboard(view) {
      view.innerHTML = UI.loading();
      const [inq, active, acc, cli, overdue] = await Promise.all([
        DB.count('inquiries', { status: 'new' }),
        DB.count('orders', { status: 'in_progress' }),
        DB.count('accommodations'),
        DB.count('clients'),
        DB.count('invoices', { status: 'overdue' }),
      ]).catch(() => [0, 0, 0, 0, 0]);

      view.innerHTML = `
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:20px;">
          ${this._stat('Nové dopyty', inq, 'brand')}
          ${this._stat('Aktívne pobyty', active, 'green')}
          ${this._stat('Ubytovania', acc, 'blue')}
          ${this._stat('Klienti', cli, 'blue')}
          ${this._stat('Faktúry po splatnosti', overdue, overdue > 0 ? 'red' : 'gray')}
        </div>
        <div class="card card-pad">
          <div style="font-weight:700;margin-bottom:6px;">Vitaj v DANUBRA Hub 👋</div>
          <div style="color:var(--ink-sub);font-size:14px;line-height:1.6;">
            Základ (M1) je hotový — dátový model, prihlásenie, navigácia a otestované
            výpočtové jadro (priebežná služba, stavový automat, číselné rady, fakturačný režim).
            Obrazovky pribúdajú po milestonoch: <strong>M2 ubytovania + klienti</strong> je ďalšia.
          </div>
        </div>`;
    },
  },

  _stat(label, value, kind) {
    const colors = { brand: 'var(--brand)', green: 'var(--green)', blue: 'var(--blue)', red: 'var(--red)', gray: 'var(--navy)' };
    return `<div class="stat">
      <div class="stat-label">${UI.esc(label)}</div>
      <div class="stat-value" style="color:${colors[kind] || 'var(--navy)'}">${value}</div>
    </div>`;
  },
};

document.addEventListener('DOMContentLoaded', () => Danubra.init());
