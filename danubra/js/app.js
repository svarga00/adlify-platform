// ============================================================================
// DANUBRA Hub — app bootstrap, auth gate, navigácia, router
// Dizajn podľa schváleného návrhu rozhrania (zoskupená navigácia, KPI karty).
// ============================================================================
window.Danubra = {
  user: null,
  route: 'dashboard',

  // Dve hlavné oblasti — prepínač pod logom. Navigácia sa podľa nich filtruje.
  areas: [
    ['accommodation', 'Ubytovanie', 'bed'],
    ['staffing', 'Rekruting', 'workers'],
  ],
  area: 'accommodation',

  // Navigácia. Položka bez oblasti je spoločná pre obe.
  // [key, label, ikona, oblasť?]
  navGroups: [
    ['PREHĽAD',    [['dashboard', 'Dashboard', 'dashboard'], ['tasks', 'Úlohy a pripomienky', 'tasks']]],
    ['ZÁKAZKY',    [['active', 'Aktívne pobyty', 'active', 'accommodation'],
                    ['inquiries', 'Dopyty', 'inquiries', 'accommodation'],
                    ['offers', 'Ponuky', 'offers', 'accommodation'],
                    ['orders', 'Objednávky', 'orders', 'accommodation'],
                    ['subcontracts', 'Zákazky', 'site', 'staffing'],
                    ['timesheets', 'Odpracované hodiny', 'clock', 'staffing']]],
    ['ĽUDIA',      [['candidates', 'Nábor', 'user', 'staffing'],
                    ['workers', 'Pracovníci', 'workers', 'staffing'],
                    ['recruiting', 'Zápisy z hovorov', 'note', 'staffing']]],
    ['DATABÁZA',   [['accommodations', 'Ubytovania', 'bed', 'accommodation'],
                    ['clients', 'Firmy a kontakty', 'clients', 'accommodation'],
                    ['partners', 'Odberatelia v Nemecku', 'clients', 'staffing']]],
    ['PENIAZE',    [['invoices', 'Faktúry', 'invoices']]],
    ['RAST',       [['marketing', 'Marketing', 'marketing']]],
    ['SYSTÉM',     [['compliance', 'Compliance', 'shield', 'staffing'],
                    ['rules', 'Cenník a pravidlá', 'rules'],
                    ['settings', 'Nastavenia', 'settings']]],
  ],

  /** Patrí položka do práve zvolenej oblasti? */
  inArea(item) { return !item[3] || item[3] === this.area; },

  /** Oblasť, do ktorej patrí daná obrazovka (null = spoločná). */
  areaOf(key) {
    for (const [, items] of this.navGroups) {
      const it = items.find(x => x[0] === key);
      if (it) return it[3] || null;
    }
    return null;
  },

  setArea(a) {
    if (this.area === a) return;
    this.area = a;
    try { localStorage.setItem('danubra_area', a); } catch {}
    // ak práve otvorená obrazovka do novej oblasti nepatrí, vráť sa na prehľad
    const cur = this.areaOf(this.route);
    this._buildNav();
    if (cur && cur !== a) this.go('dashboard');
    else this.renderRoute();
  },

  // Spodné taby na mobile (stred = rýchle pridanie)
  tabsByArea: {
    accommodation: [
      { key: 'dashboard', label: 'Prehľad', ico: 'dashboard' },
      { key: 'active', label: 'Aktívne', ico: 'active' },
      { key: '__plus', label: '', plus: true },
      { key: 'inquiries', label: 'Dopyty', ico: 'inquiries' },
      { key: 'accommodations', label: 'Ubytovania', ico: 'bed' },
    ],
    staffing: [
      { key: 'dashboard', label: 'Prehľad', ico: 'dashboard' },
      { key: 'subcontracts', label: 'Zákazky', ico: 'site' },
      { key: '__plus', label: '', plus: true },
      { key: 'timesheets', label: 'Hodiny', ico: 'clock' },
      { key: 'candidates', label: 'Nábor', ico: 'user' },
    ],
  },

  badges: {},   // { routeKey: number } — napĺňa dashboard

  allNav() { return this.navGroups.flatMap(g => g[1]); },
  visibleNav() { return this.allNav().filter(i => this.inArea(i)); },
  labelOf(key) { const n = this.allNav().find(x => x[0] === key); return n ? n[1] : 'DANUBRA'; },

  async init() {
    try {
      const saved = localStorage.getItem('danubra_area');
      if (saved && this.areas.some(a => a[0] === saved)) this.area = saved;
    } catch {}
    this.user = await DB.currentUser();
    DB.onAuth((user) => {
      const was = !!this.user;
      this.user = user;
      if (!!user !== was) this._render();
    });
    document.getElementById('login-form').addEventListener('submit', (e) => this._onLogin(e));
    document.querySelectorAll('.search-ico').forEach(el => { el.innerHTML = Icon('search', 15); });
    const lo = document.getElementById('btn-logout'); if (lo) lo.innerHTML = Icon('logout', 16);
    const mn = document.getElementById('btn-menu'); if (mn) mn.innerHTML = Icon('menu', 20);
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
    // prepínač oblastí
    const sw = document.getElementById('area-switch');
    if (sw) sw.innerHTML = this.areas.map(([key, label, ico]) =>
      `<button class="area-btn${this.area === key ? ' active' : ''}" onclick="Danubra.setArea('${key}')">
        ${Icon(ico, 16)}<span>${label}</span></button>`).join('');

    document.getElementById('sidebar-nav').innerHTML = this.navGroups.map(([glabel, items]) => {
      const visible = items.filter(i => this.inArea(i));
      if (!visible.length) return '';
      return `<div class="nav-group">${glabel}</div>
      ${visible.map(([key, label, ico]) => {
        const b = this.badges[key];
        return `<button class="nav-item${key === this.route ? ' active' : ''}" data-key="${key}" onclick="Danubra.go('${key}')">
          ${Icon(ico, 17)}<span class="nav-text">${label}</span>${b ? `<span class="nav-badge">${b}</span>` : ''}
        </button>`;
      }).join('')}`;
    }).join('');

    const tabs = this.tabsByArea[this.area] || this.tabsByArea.accommodation;
    document.getElementById('bottom-nav').innerHTML = tabs.map(t => t.plus
      ? `<button class="tab tab-plus" onclick="Danubra.quickAdd()" aria-label="Pridať">
           <span class="tab-ico">${Icon('plus', 22)}</span></button>`
      : `<button class="tab${t.key === this.route ? ' active' : ''}" data-key="${t.key}" onclick="Danubra.go('${t.key}')">
           <span class="tab-ico">${Icon(t.ico, 20)}</span><span class="tab-label">${t.label}</span></button>`
    ).join('');
  },

  go(key) { location.hash = '#/' + key; },

  quickAdd() {
    // rýchle pridanie podľa toho, kde práve stojíme
    const map = {
      clients: () => Cli.form(), accommodations: () => Acc.form(),
      inquiries: () => Inq.form(), workers: () => Wrk.form(),
      subcontracts: () => Sub.form(), partners: () => Prt.form(),
      timesheets: () => Tms.form(), tasks: () => Tsk.form(),
      invoices: () => Inv.newInvoice(), marketing: () => Mkt.listingForm(),
    };
    if (map[this.route]) return map[this.route]();
    return this.area === 'staffing' ? Wrk.form() : Acc.form();
  },

  _syncRoute() {
    const m = (location.hash || '').match(/^#\/([a-z-]+)/);
    const key = m ? m[1] : 'dashboard';
    this.route = this.allNav().some(n => n[0] === key) ? key : 'dashboard';
    // odkaz na obrazovku z druhej oblasti prepne aj prepínač
    const ar = this.areaOf(this.route);
    if (ar && ar !== this.area) {
      this.area = ar;
      try { localStorage.setItem('danubra_area', ar); } catch {}
      this._buildNav();
    }
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
      UI.empty('wrench', 'Táto sekcia zatiaľ nie je hotová', 'Pribudne v nasledujúcom milestone.');
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

      const [inqNew, active, acc, cli, invOverdue, invDraft, deployed, subsActive] = await Promise.all([
        DB.count('inquiries', { status: 'new' }),
        DB.count('orders', { status: 'in_progress' }),
        DB.count('accommodations'),
        DB.count('clients'),
        DB.count('invoices', { status: 'overdue' }),
        DB.count('invoices', { status: 'draft_pending_approval' }),
        DB.count('assignments', { status: 'active' }),
        DB.count('subcontracts', { status: 'active' }),
      ]).catch(() => [0, 0, 0, 0, 0, 0, 0, 0]);

      // cash-flow — podľa plánu najpravdepodobnejší dôvod zlyhania
      let cf = null, payroll = 0;
      try {
        const [{ data: invAll }, { data: asg }] = await Promise.all([
          DB.list('invoices', { select: 'id,total,status,issue_date,due_date,paid_at', limit: 1000 }),
          DB.list('assignments', { select: 'gross_monthly,status', limit: 500 }),
        ]);
        payroll = (asg || []).filter(a => a.status === 'active')
          .reduce((s, a) => s + Number(a.gross_monthly || 0) * 1.362, 0);
        cf = DanubraCompliance.cashflowCheck({
          invoices: invAll || [], monthlyPayroll: payroll, factoring: false,
        });
      } catch (e) { /* subdodávky ešte nemusia byť namigrované */ }

      this.badges = { inquiries: inqNew, active: active, invoices: invOverdue + invDraft };
      this._buildNav();

      const kpis = [
        ['Nové dopyty', inqNew, inqNew ? 'čakajú na reakciu' : 'všetko vybavené', inqNew ? 'warn' : ''],
        ['Prebiehajúce pobyty', active, 'ubytovanie', ''],
        ['Ľudia vonku', deployed, `${subsActive} ${subsActive === 1 ? 'zákazka' : 'zákaziek'}`, ''],
        ['Ubytovania v DB', acc, 'databáza', ''],
        ['Faktúry na schválenie', invDraft, invDraft ? 'vyžaduje potvrdenie' : 'žiadne', invDraft ? 'warn' : ''],
        ['Po splatnosti', invOverdue, invOverdue ? 'urgovať' : 'v poriadku', invOverdue ? 'warn' : 'up'],
      ];

      const actions = [];
      if (inqNew) actions.push(['red', `${inqNew} nových dopytov čaká na reakciu`, 'inquiries']);
      if (invDraft) actions.push(['amber', `${invDraft} faktúr čaká na schválenie`, 'invoices']);
      if (invOverdue) actions.push(['red', `${invOverdue} faktúr po splatnosti`, 'invoices']);
      if (!acc) actions.push(['amber', 'Databáza ubytovaní je prázdna — pridaj prvé', 'accommodations']);
      if (!cli) actions.push(['amber', 'Žiadni klienti — pridaj prvého', 'clients']);
      for (const w of (cf?.warnings || [])) {
        if (w.severity === 'blocker') actions.push(['red', w.label, 'invoices']);
      }

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
                    <span style="color:var(--ink-mute);display:flex;">${Icon('chevron', 15)}</span>
                  </button>`).join('')
              : `<div style="color:var(--ink-mute);font-size:13px;padding:8px 2px;">Nič nečaká — všetko je vybavené.</div>`}
          </div>
          ${cf ? `<div class="card card-pad">
            <div class="card-head">
              <div class="card-title">Cash-flow</div>
              ${UI.badge(cf.scaleSafe ? 'možno škálovať' : 'nezvyšovať počty', cf.scaleSafe ? 'green' : 'red')}
            </div>
            <div class="kv" style="margin:0 0 10px;">
              <div><span>Doba inkasa</span><strong>${cf.dso != null ? `${cf.dso} dní` : 'zatiaľ bez dát'}</strong></div>
              <div><span>Neuhradené</span><strong>${UI.money(cf.outstanding)}</strong></div>
              <div><span>Po splatnosti</span><strong style="color:${cf.overdueSum ? 'var(--red)' : 'inherit'};">${UI.money(cf.overdueSum)}</strong></div>
              <div><span>Potrebný kapitál</span><strong>${UI.money(cf.workingCapitalNeeded)}</strong></div>
            </div>
            ${cf.warnings.filter(w => w.severity !== 'info').map(w => `
              <div class="list-row" style="cursor:default;align-items:flex-start;">
                <span class="dot ${w.severity === 'blocker' ? 'red' : 'amber'}" style="margin-top:5px;"></span>
                <span style="flex:1;font-size:12.5px;"><strong>${UI.esc(w.label)}</strong>
                  <span style="color:var(--ink-mute);display:block;">${UI.esc(w.fix)}</span></span>
              </div>`).join('') || `<div style="color:var(--ink-mute);font-size:12.5px;">Splatnosti sú v poriadku.</div>`}
          </div>` : ''}
          <div class="card card-pad">
            <div class="card-head"><div class="card-title">Rýchle akcie</div></div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Acc.form()">${Icon('plus')} Nové ubytovanie</button>
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Cli.form()">${Icon('plus')} Nový klient</button>
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Danubra.go('accommodations')">${Icon('bed')} Databáza ubytovaní</button>
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Danubra.go('subcontracts')">${Icon('site')} Zákazky subdodávok</button>
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Danubra.go('timesheets')">${Icon('clock')} Zapísať hodiny</button>
            </div>
          </div>
        </div>`;
    },
  },
};

document.addEventListener('DOMContentLoaded', () => Danubra.init());
