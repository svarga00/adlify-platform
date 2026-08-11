// ============================================================================
// DANUBRA Hub — app bootstrap, auth gate, navigácia, router
// Dizajn podľa schváleného návrhu rozhrania (zoskupená navigácia, KPI karty).
// ============================================================================
window.Danubra = {
  user: null,
  route: 'dashboard',

  // Zoskupená navigácia podľa návrhu. [key, label, badge]
  navGroups: [
    ['PREHĽAD',  [['dashboard', 'Dashboard'], ['tasks', 'Úlohy a pripomienky'], ['active', 'Aktívne zákazky']]],
    ['PREDAJ',   [['inquiries', 'Dopyty'], ['offers', 'Ponuky'], ['orders', 'Objednávky']]],
    ['PENIAZE',  [['invoices', 'Faktúry']]],
    ['DATABÁZA', [['accommodations', 'Ubytovania'], ['clients', 'Firmy a kontakty']]],
    ['RAST',     [['marketing', 'Marketing']]],
    ['SYSTÉM',   [['rules', 'Cenník a pravidlá'], ['settings', 'Nastavenia']]],
  ],

  // Spodné taby na mobile (stred = rýchle pridanie)
  tabs: [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'active', label: 'Aktívne' },
    { key: '__plus', label: '', plus: true },
    { key: 'inquiries', label: 'Dopyty' },
    { key: 'accommodations', label: 'Viac' },
  ],

  badges: {},   // { routeKey: number } — napĺňa dashboard

  allNav() { return this.navGroups.flatMap(g => g[1]); },
  labelOf(key) { const n = this.allNav().find(x => x[0] === key); return n ? n[1] : 'DANUBRA'; },

  async init() {
    this.user = await DB.currentUser();
    DB.onAuth((user) => {
      const was = !!this.user;
      this.user = user;
      if (!!user !== was) this._render();
    });
    document.getElementById('login-form').addEventListener('submit', (e) => this._onLogin(e));
    this._buildNav();
    this._render();
    window.addEventListener('hashchange', () => this._syncRoute());
    this._syncRoute();
  },

  _render() {
    const authed = !!this.user;
    document.getElementById('login-screen').hidden = authed;
    document.getElementById('app').hidden = !authed;
    if (authed) {
      const email = this.user.email || '';
      const name = (email.split('@')[0] || '').replace(/[._-]/g, ' ');
      const nice = name.charAt(0).toUpperCase() + name.slice(1);
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set('user-name', nice || 'Používateľ');
      set('user-email', email);
      set('user-initial', (nice[0] || '·').toUpperCase());
      set('user-initial-m', (nice[0] || '·').toUpperCase());
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
    document.getElementById('sidebar-nav').innerHTML = this.navGroups.map(([glabel, items]) => `
      <div class="nav-group">${glabel}</div>
      ${items.map(([key, label]) => {
        const b = this.badges[key];
        return `<button class="nav-item${key === this.route ? ' active' : ''}" data-key="${key}" onclick="Danubra.go('${key}')">
          <span>${label}</span>${b ? `<span class="nav-badge">${b}</span>` : ''}
        </button>`;
      }).join('')}
    `).join('');

    document.getElementById('bottom-nav').innerHTML = this.tabs.map(t => t.plus
      ? `<button class="tab tab-plus" onclick="Danubra.quickAdd()" aria-label="Pridať">
           <span class="tab-ico">+</span></button>`
      : `<button class="tab${t.key === this.route ? ' active' : ''}" data-key="${t.key}" onclick="Danubra.go('${t.key}')">
           <span class="tab-ico"></span><span class="tab-label">${t.label}</span></button>`
    ).join('');
  },

  go(key) { location.hash = '#/' + key; },

  quickAdd() {
    // rýchle pridanie podľa kontextu
    if (this.route === 'clients' && window.Cli) return Cli.form();
    if (window.Acc) return Acc.form();
  },

  _syncRoute() {
    const m = (location.hash || '').match(/^#\/([a-z-]+)/);
    const key = m ? m[1] : 'dashboard';
    this.route = this.allNav().some(n => n[0] === key) ? key : 'dashboard';
    this.closeSidebar();
    if (this.user) this.renderRoute();
    document.querySelectorAll('.nav-item, .tab').forEach(el => {
      if (el.dataset.key) el.classList.toggle('active', el.dataset.key === this.route);
    });
  },

  renderRoute() {
    const view = document.getElementById('view');
    this.setActions('');
    const fn = this.views[this.route];
    if (fn) fn.call(this, view);
    else view.innerHTML = this.header(this.labelOf(this.route), 'Pripravujeme v ďalšom kroku.') +
      UI.empty('🚧', 'Táto sekcia zatiaľ nie je hotová', 'Pribudne v nasledujúcom milestone.');
  },

  // Jednotná hlavička stránky
  header(title, sub, right) {
    return `<div class="page-head">
      <div>
        <h1 class="page-title">${UI.esc(title)}</h1>
        ${sub ? `<div class="page-sub">${sub}</div>` : ''}
      </div>
      ${right || ''}
    </div>`;
  },

  setActions(html) {
    const el = document.getElementById('topbar-actions');
    if (el) el.innerHTML = html || '';
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

  // ── VIEWS ────────────────────────────────────────────────────────────────
  views: {
    async dashboard(view) {
      const today = new Date().toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
      view.innerHTML = this.header('Dashboard', UI.esc(today.charAt(0).toUpperCase() + today.slice(1))) + UI.loading();

      const [inqNew, active, acc, cli, invOverdue, invDraft] = await Promise.all([
        DB.count('inquiries', { status: 'new' }),
        DB.count('orders', { status: 'in_progress' }),
        DB.count('accommodations'),
        DB.count('clients'),
        DB.count('invoices', { status: 'overdue' }),
        DB.count('invoices', { status: 'draft_pending_approval' }),
      ]).catch(() => [0, 0, 0, 0, 0, 0]);

      this.badges = { inquiries: inqNew, active: active, invoices: invOverdue + invDraft };
      this._buildNav();

      const kpis = [
        ['Nové dopyty', inqNew, inqNew ? 'čakajú na reakciu' : 'všetko vybavené', inqNew ? 'warn' : ''],
        ['Prebiehajúce pobyty', active, 'aktívne zákazky', ''],
        ['Ubytovania v DB', acc, 'databáza', ''],
        ['Firmy a kontakty', cli, 'databáza', ''],
        ['Faktúry na schválenie', invDraft, invDraft ? 'vyžaduje potvrdenie' : 'žiadne', invDraft ? 'warn' : ''],
        ['Po splatnosti', invOverdue, invOverdue ? 'urgovať' : 'v poriadku', invOverdue ? 'warn' : 'up'],
      ];

      const actions = [];
      if (inqNew) actions.push(['red', `${inqNew} nových dopytov čaká na reakciu`, 'inquiries']);
      if (invDraft) actions.push(['amber', `${invDraft} faktúr čaká na schválenie`, 'invoices']);
      if (invOverdue) actions.push(['red', `${invOverdue} faktúr po splatnosti`, 'invoices']);
      if (!acc) actions.push(['amber', 'Databáza ubytovaní je prázdna — pridaj prvé', 'accommodations']);
      if (!cli) actions.push(['amber', 'Žiadni klienti — pridaj prvého', 'clients']);

      view.innerHTML =
        this.header('Dashboard', UI.esc(today.charAt(0).toUpperCase() + today.slice(1)) +
          ` · ${active} ${active === 1 ? 'prebiehajúci pobyt' : 'prebiehajúce pobyty'}`) + `
        <div class="kpi-grid">
          ${kpis.map(([l, v, d, k]) => `
            <div class="kpi">
              <div class="kpi-label">${l}</div>
              <div class="kpi-value">${v}</div>
              <div class="kpi-delta ${k}">${d}</div>
            </div>`).join('')}
        </div>
        <div class="panels">
          <div class="card card-pad">
            <div class="card-head">
              <div class="card-title">Vyžaduje akciu</div>
              ${actions.length ? `<span class="badge" style="background:var(--amber-50);color:var(--amber);">${actions.length}</span>` : ''}
            </div>
            ${actions.length
              ? actions.map(([dot, label, go]) => `
                  <button class="list-row" onclick="Danubra.go('${go}')">
                    <span class="dot ${dot}"></span>
                    <span style="flex:1;font-weight:500;">${UI.esc(label)}</span>
                    <span style="color:var(--ink-mute);">›</span>
                  </button>`).join('')
              : `<div style="color:var(--ink-mute);font-size:13px;padding:8px 2px;">Nič nečaká — všetko je vybavené. 👌</div>`}
          </div>
          <div class="card card-pad">
            <div class="card-head"><div class="card-title">Rýchle akcie</div></div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Acc.form()">+ Nové ubytovanie</button>
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Cli.form()">+ Nový klient</button>
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Danubra.go('accommodations')">Databáza ubytovaní ›</button>
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Danubra.go('clients')">Firmy a kontakty ›</button>
            </div>
          </div>
        </div>`;
    },
  },
};

document.addEventListener('DOMContentLoaded', () => Danubra.init());
