// ============================================================================
// DANUBRA — app bootstrap, auth gate, navigácia, router
// ============================================================================
// Hlavný biznis je posielanie slovenských živnostníkov na nemecké stavby.
// Sprostredkovanie ubytovania bolo v v1 druhá agenda; od v2 je archivované —
// vypína sa príznakom `settings.modules.accommodation`, nie mazaním, takže
// dáta aj väzby zostávajú a agenda sa dá kedykoľvek vrátiť.
//
// Databáza ubytovaní zostáva zapnutá vždy: ubytovanie je naďalej náklad
// zákazky a argument v náborovom inzeráte (rozhodnutie R4).
// ============================================================================
window.Danubra = {
  user: null,
  route: 'dashboard',

  // Agendy — prepínač pod logom. Navigácia sa podľa nich filtruje.
  // Kľúče zostávajú pôvodné, menia sa len názvy — inak by sa stratilo, čo má
  // človek uložené v prehliadači.
  areas: [
    ['staffing', 'Nábor a stavby', 'workers'],
    ['accommodation', 'Ubytovanie', 'bed'],
  ],
  area: 'staffing',
  areaTitle(key) { const a = this.areas.find(x => x[0] === key); return a ? a[1] : 'Spoločné'; },

  // ── Zapnuté moduly ───────────────────────────────────────────────────────
  // Predvolené hodnoty sedia s tým, čo migrácia 013 zapísala do databázy,
  // aby navigácia vyzerala správne už pri prvom vykreslení a neposkočila,
  // keď dobehne dotaz.
  modules: { recruiting: true, contracts: true, finance: true, accommodation: false },

  /** Je modul zapnutý? Položka bez modulu je zapnutá vždy. */
  moduleOn(key) { return key == null || this.modules[key] !== false; },

  /** Modul, ktorý danú položku zapína — buď zapísaný, alebo podľa agendy. */
  moduleOf(item) {
    if (item[4] !== undefined) return item[4];
    return item[3] === 'accommodation' ? 'accommodation' : null;
  },

  async _loadModules() {
    try {
      const { data } = await DB.list('settings', { select: 'modules', limit: 1 });
      const m = data && data[0] && data[0].modules;
      if (m && typeof m === 'object') this.modules = { ...this.modules, ...m };
    } catch {
      // Bez nastavení sa appka nezasekne — zostanú predvolené moduly.
    }
  },

  /** Agendy, ktoré sa majú zobraziť. Agenda vypnutého modulu zmizne celá. */
  visibleAreas() { return this.areas.filter(([key]) => this.moduleOn(key)); },

  // Navigácia. Položka bez oblasti je spoločná pre všetky agendy.
  // [key, label, ikona, oblasť?, modul?]
  // Modul sa dá zapísať piatym prvkom; `null` znamená „nikdy sa neskrýva".
  navGroups: [
    ['PREHĽAD',    [['dashboard', 'Dashboard', 'dashboard'], ['tasks', 'Úlohy a pripomienky', 'tasks']]],
    ['ZÁKAZKY',    [['active', 'Aktívne pobyty', 'active', 'accommodation'],
                    ['inquiries', 'Dopyty', 'inquiries', 'accommodation'],
                    ['offers', 'Ponuky', 'offers', 'accommodation'],
                    ['orders', 'Objednávky', 'orders', 'accommodation'],
                    ['quotes', 'Ponuky', 'offers', 'staffing', 'contracts'],
                    ['contracts', 'Zmluvy', 'note', 'staffing', 'contracts'],
                    ['subcontracts', 'Zákazky', 'site', 'staffing', 'contracts'],
                    ['timesheets', 'Odpracované hodiny', 'clock', 'staffing', 'contracts']]],
    ['ĽUDIA',      [['hiring', 'Náborové plány', 'zap', 'staffing', 'recruiting'],
                    ['candidates', 'Kandidáti', 'user', 'staffing', 'recruiting'],
                    ['workers', 'Živnostníci', 'workers', 'staffing', null],
                    ['crews', 'Partie', 'workers', 'staffing', null],
                    ['trades', 'Remeslá a otázky', 'wrench', 'staffing', 'recruiting'],
                    ['recruiting', 'Zápisy z hovorov', 'note', 'staffing', 'recruiting']]],
    // Ubytovania sú bez agendy zámerne — po archivácii obchodnej časti
    // zostávajú dostupné ako náklad zákazky (R4).
    ['DATABÁZA',   [['partners', 'Odberatelia v Nemecku', 'clients', 'staffing', null],
                    ['accommodations', 'Ubytovania', 'bed', undefined, null],
                    ['clients', 'Firmy a kontakty', 'clients', 'accommodation']]],
    ['PENIAZE',    [['invoices', 'Faktúry', 'invoices', undefined, 'finance']]],
    ['RAST',       [['marketing', 'Marketing', 'marketing']]],
    ['SYSTÉM',     [['compliance', 'Compliance', 'shield', 'staffing', null],
                    ['rules', 'Cenník a pravidlá', 'rules'],
                    ['settings', 'Nastavenia', 'settings']]],
  ],

  /** Patrí položka do práve zvolenej oblasti a je jej modul zapnutý? */
  inArea(item) {
    if (!this.moduleOn(this.moduleOf(item))) return false;
    return !item[3] || item[3] === this.area;
  },

  /** Oblasť, do ktorej patrí daná obrazovka (null = spoločná). */
  areaOf(key) {
    for (const [, items] of this.navGroups) {
      const it = items.find(x => x[0] === key);
      if (it) return it[3] || null;
    }
    return null;
  },

  /** Je obrazovka dostupná? Archivovaná obrazovka sa nesmie otvoriť ani z odkazu. */
  routeAvailable(key) {
    const it = this.allNav().find(x => x[0] === key);
    return !!it && this.moduleOn(this.moduleOf(it));
  },

  setArea(a) {
    if (this.area === a || !this.moduleOn(a)) return;
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
      { key: 'hiring', label: 'Nábor', ico: 'zap' },
      { key: 'candidates', label: 'Kandidáti', ico: 'user' },
    ],
  },

  badges: {},   // { routeKey: number } — napĺňa dashboard

  allNav() { return this.navGroups.flatMap(g => g[1]); },
  visibleNav() { return this.allNav().filter(i => this.inArea(i)); },
  labelOf(key) { const n = this.allNav().find(x => x[0] === key); return n ? n[1] : 'DANUBRA'; },

  async init() {
    this.user = await DB.currentUser();
    if (this.user) await this._loadModules();
    try {
      const saved = localStorage.getItem('danubra_area');
      if (saved && this.visibleAreas().some(a => a[0] === saved)) this.area = saved;
    } catch {}
    // Uložená agenda mohla medzitým zmiznúť — stoj na prvej zapnutej.
    if (!this.moduleOn(this.area)) this.area = (this.visibleAreas()[0] || ['staffing'])[0];
    DB.onAuth((user) => {
      const was = !!this.user;
      this.user = user;
      if (!!user !== was) this._render();
    });
    document.getElementById('login-form').addEventListener('submit', (e) => this._onLogin(e));
    document.querySelectorAll('.search-ico').forEach(el => { el.innerHTML = Icon('search', 15); });
    const lo = document.getElementById('btn-logout'); if (lo) lo.innerHTML = Icon('logout', 16);
    const mn = document.getElementById('btn-menu'); if (mn) mn.innerHTML = Icon('menu', 20);
    const mi = document.querySelector('.mega-btn-ico'); if (mi) mi.innerHTML = Icon('menu', 16);
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
    // Nastavenia sa dajú prečítať až po prihlásení — dovtedy platia predvolené
    // moduly. Preto sa navigácia po prihlásení postaví znova.
    await this._loadModules();
    if (!this.moduleOn(this.area)) this.area = (this.visibleAreas()[0] || ['staffing'])[0];
    this._buildNav();
    this._render();
  },

  async logout() {
    await DB.signOut();
    this.user = null;
    this._render();
  },

  _buildNav() {
    // Prepínač oblastí. Pri jedinej zapnutej agende nemá čo prepínať — zmizne,
    // aby sa nad navigáciou nevisel mŕtvy ovládač.
    const sw = document.getElementById('area-switch');
    const areas = this.visibleAreas();
    if (sw) {
      sw.hidden = areas.length < 2;
      sw.innerHTML = areas.length < 2 ? '' : areas.map(([key, label, ico]) =>
        `<button class="area-btn${this.area === key ? ' active' : ''}" onclick="Danubra.setArea('${key}')">
          ${Icon(ico, 16)}<span>${label}</span></button>`).join('');
    }

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

    const tabs = this.tabsByArea[this.area] || this.tabsByArea.staffing;
    document.getElementById('bottom-nav').innerHTML = tabs.map(t => t.plus
      ? `<button class="tab tab-plus" onclick="Danubra.quickAdd()" aria-label="Pridať">
           <span class="tab-ico">${Icon('plus', 22)}</span></button>`
      : `<button class="tab${t.key === this.route ? ' active' : ''}" data-key="${t.key}" onclick="Danubra.go('${t.key}')">
           <span class="tab-ico">${Icon(t.ico, 20)}</span><span class="tab-label">${t.label}</span></button>`
    ).join('');
  },

  // ── Mega menu ─────────────────────────────────────────────────────────────
  // Prepínač agend zobrazuje vždy len polovicu appky. Toto ukáže obe naraz,
  // aby sa nemuselo hádať, kde čo je.
  toggleMega(force) {
    const open = force != null ? force : !document.getElementById('mega');
    document.getElementById('mega')?.remove();
    if (!open) { document.body.style.overflow = ''; this._megaKeys && document.removeEventListener('keydown', this._megaKeys); return; }

    const el = document.createElement('div');
    el.id = 'mega';
    el.className = 'mega';
    el.innerHTML = `<div class="mega-inner">${this.megaHtml()}</div>`;
    el.addEventListener('click', (e) => { if (e.target === el) this.toggleMega(false); });
    document.body.appendChild(el);
    document.body.style.overflow = 'hidden';
    this._megaKeys = (e) => { if (e.key === 'Escape') this.toggleMega(false); };
    document.addEventListener('keydown', this._megaKeys);
  },

  megaHtml() {
    const column = (areaKey) => {
      const groups = this.navGroups
        .map(([glabel, items]) => [glabel, items.filter(i =>
          (i[3] || null) === areaKey && this.moduleOn(this.moduleOf(i)))])
        .filter(([, items]) => items.length);
      if (!groups.length) return '';
      const isCurrent = areaKey && areaKey === this.area;
      return `
        <div class="mega-col${isCurrent ? ' current' : ''}">
          <div class="mega-col-head">
            ${areaKey ? Icon(this.areas.find(a => a[0] === areaKey)[2], 16) : Icon('rules', 16)}
            <span>${UI.esc(this.areaTitle(areaKey))}</span>
            ${isCurrent ? '<em>práve tu</em>' : ''}
          </div>
          ${groups.map(([glabel, items]) => `
            <div class="mega-group">${glabel}</div>
            ${items.map(([key, label, ico]) => {
              const b = this.badges[key];
              return `<button class="mega-item${key === this.route ? ' active' : ''}"
                onclick="Danubra.goFromMega('${key}')">
                ${Icon(ico, 16)}<span>${label}</span>${b ? `<span class="nav-badge">${b}</span>` : ''}
              </button>`;
            }).join('')}`).join('')}
        </div>`;
    };
    const email = this.user?.email || '';
    return `
      <div class="mega-head">
        <strong>Kam chceš ísť?</strong>
        <button class="mega-x" onclick="Danubra.toggleMega(false)" aria-label="Zavrieť">${Icon('x', 18)}</button>
      </div>
      ${this.visibleAreas().length < 2 ? '' : `
      <div class="mega-areas">
        ${this.visibleAreas().map(([key, label, ico]) => `
          <button class="mega-area${this.area === key ? ' active' : ''}"
            onclick="Danubra.setAreaFromMega('${key}')">
            ${Icon(ico, 17)}<span>${label}</span></button>`).join('')}
      </div>`}
      <div class="mega-cols">
        ${this.visibleAreas().map(a => column(a[0])).join('')}
        ${column(null)}
      </div>
      <div class="mega-foot">
        <span>${UI.esc(email)}</span>
        <button class="btn btn-ghost btn-sm" onclick="Danubra.logout()">
          ${Icon('logout', 15)} Odhlásiť sa</button>
      </div>`;
  },

  /** Skok z mega menu — ak obrazovka patrí druhej agende, prepne aj ju. */
  goFromMega(key) {
    this.toggleMega(false);
    this.go(key);
  },

  /** Prepnutie agendy z mega menu — menu zostane otvorené, nech je vidieť zmenu. */
  setAreaFromMega(key) {
    this.setArea(key);
    const inner = document.querySelector('#mega .mega-inner');
    if (inner) inner.innerHTML = this.megaHtml();
  },

  go(key) { location.hash = '#/' + key; },

  quickAdd() {
    // rýchle pridanie podľa toho, kde práve stojíme
    const map = {
      clients: () => Cli.form(), accommodations: () => Acc.form(),
      inquiries: () => Inq.form(), workers: () => Wrk.form(),
      subcontracts: () => Sub.form(), partners: () => Prt.form(),
      timesheets: () => Tms.form(), tasks: () => Tsk.form(),
      candidates: () => Cand.form(), hiring: () => Hire.wizard(),
      trades: () => Trades.tForm(),
      invoices: () => Inv.newInvoice(), marketing: () => Mkt.listingForm(),
    };
    if (map[this.route]) return map[this.route]();
    return this.area === 'staffing' ? Wrk.form() : Acc.form();
  },

  _syncRoute() {
    const m = (location.hash || '').match(/^#\/([a-z-]+)/);
    const key = m ? m[1] : 'dashboard';
    // Archivovaná obrazovka sa nesmie otvoriť ani starým odkazom alebo
    // záložkou — inak by sa vypnutý modul dal obísť adresným riadkom.
    this.route = this.routeAvailable(key) ? key : 'dashboard';
    // odkaz na obrazovku z druhej oblasti prepne aj prepínač
    const ar = this.areaOf(this.route);
    if (ar && ar !== this.area && this.moduleOn(ar)) {
      this.area = ar;
      try { localStorage.setItem('danubra_area', ar); } catch {}
      this._buildNav();
    }
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

      // Nábor: koľko ľudí ešte treba a kto čaká na prvý telefonát
      let candWaiting = 0, plansActive = 0, needPeople = 0;
      try {
        const [{ data: cands }, { data: plans }] = await Promise.all([
          DB.list('candidates', { select: 'id,status,first_contact_at', limit: 500 }),
          DB.list('recruitment_plans', { select: 'id,status,headcount', limit: 200 }),
        ]);
        candWaiting = (cands || []).filter(c => c.status === 'new' && !c.first_contact_at).length;
        const act = (plans || []).filter(p => p.status === 'active');
        plansActive = act.length;
        needPeople = act.reduce((s, p) => s + (p.headcount || 0), 0);
      } catch (e) { /* náborový playbook ešte nemusí byť namigrovaný */ }

      const staffingKpis = [
        ['Ľudia vonku', deployed, `${subsActive} ${subsActive === 1 ? 'zákazka' : 'zákaziek'}`, ''],
        ['Treba dobrať', needPeople, `${plansActive} ${plansActive === 1 ? 'bežiaci nábor' : 'bežiacich náborov'}`, needPeople ? 'warn' : ''],
        ['Čaká na prvý telefonát', candWaiting, candWaiting ? 'cieľ do 10 minút' : 'nikto nečaká', candWaiting ? 'warn' : 'up'],
        ['Po splatnosti', invOverdue, invOverdue ? 'urgovať' : 'v poriadku', invOverdue ? 'warn' : 'up'],
        ['Faktúry na schválenie', invDraft, invDraft ? 'vyžaduje potvrdenie' : 'žiadne', invDraft ? 'warn' : ''],
        ['Prebiehajúce pobyty', active, 'ubytovacia agenda', ''],
      ];
      const accommodationKpis = [
        ['Nové dopyty', inqNew, inqNew ? 'čakajú na reakciu' : 'všetko vybavené', inqNew ? 'warn' : ''],
        ['Prebiehajúce pobyty', active, 'ubytovanie', ''],
        ['Ľudia vonku', deployed, `${subsActive} ${subsActive === 1 ? 'zákazka' : 'zákaziek'}`, ''],
        ['Ubytovania v DB', acc, 'databáza', ''],
        ['Faktúry na schválenie', invDraft, invDraft ? 'vyžaduje potvrdenie' : 'žiadne', invDraft ? 'warn' : ''],
        ['Po splatnosti', invOverdue, invOverdue ? 'urgovať' : 'v poriadku', invOverdue ? 'warn' : 'up'],
      ];
      const kpis = this.area === 'staffing' ? staffingKpis : accommodationKpis;

      const actions = [];
      if (candWaiting) actions.push(['red',
        `${candWaiting} ${candWaiting === 1 ? 'kandidát čaká' : 'kandidátov čaká'} na prvý telefonát`, 'candidates']);
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
              ${this.area === 'staffing' ? `
              <button class="btn btn-primary" style="justify-content:flex-start;" onclick="Guide.startCall()">${Icon('phone')} Zdvihol som telefón</button>
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Hire.wizard()">${Icon('plus')} Nový nábor</button>
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Cand.form()">${Icon('plus')} Nový kandidát</button>
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Danubra.go('trades')">${Icon('wrench')} Príručka remesiel a otázok</button>
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Danubra.go('compliance')">${Icon('shield')} Compliance pred nasadením</button>
              ` : `
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Acc.form()">${Icon('plus')} Nové ubytovanie</button>
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Cli.form()">${Icon('plus')} Nový klient</button>
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Danubra.go('accommodations')">${Icon('bed')} Databáza ubytovaní</button>
              `}
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Danubra.go('subcontracts')">${Icon('site')} Zákazky subdodávok</button>
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Danubra.go('timesheets')">${Icon('clock')} Zapísať hodiny</button>
            </div>
          </div>
        </div>`;
    },
  },
};

document.addEventListener('DOMContentLoaded', () => Danubra.init());
