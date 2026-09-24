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
    ['PREHĽAD',    [['dashboard', 'Prehľad', 'dashboard'], ['tasks', 'Úlohy a pripomienky', 'tasks']]],
    ['ZÁKAZKY',    [['active', 'Aktívne pobyty', 'active', 'accommodation'],
                    ['inquiries', 'Dopyty', 'inquiries', 'accommodation'],
                    ['offers', 'Ponuky', 'offers', 'accommodation'],
                    ['orders', 'Objednávky', 'orders', 'accommodation'],
                    ['quotes', 'Ponuky', 'offers', 'staffing', 'contracts'],
                    ['contracts', 'Zmluvy', 'note', 'staffing', 'contracts'],
                    ['subcontracts', 'Zákazky', 'site', 'staffing', 'contracts'],
                    ['timesheets', 'Odpracované hodiny', 'clock', 'staffing', 'contracts'],
                    ['hoursheet', 'Výkaz pre odberateľa', 'doc', 'staffing', 'contracts']]],
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
    ['PENIAZE',    [['invoices', 'Vydané faktúry', 'invoices', 'staffing', 'finance'],
                    ['costs', 'Náklady', 'invoices', 'staffing', 'finance'],
                    ['bank', 'Banka a cash-flow', 'invoices', 'staffing', 'finance']]],
    ['RAST',       [['marketing', 'Marketing', 'marketing']]],
    ['SYSTÉM',     [['compliance', 'Compliance', 'shield', 'staffing', null],
                    ['rules', 'Cenník a pravidlá', 'rules'],
                    ['settings', 'Nastavenia', 'settings']]],
  ],

  // ── Čo ktorá obrazovka robí ──────────────────────────────────────────────
  // Jedna veta ku každej položke. Ukazuje sa v mega menu, aby človek, ktorý
  // appku nepostavil, nemusel hádať, čo sa pod názvom skrýva.
  navHints: {
    dashboard: 'Čo dnes treba spraviť, či bude na výplaty a či sa na tom zarába',
    tasks: 'Všetky úlohy a pripomienky na jednom mieste',
    quotes: 'Ponuky odberateľom — marža je vidieť skôr, než ponuka odíde',
    contracts: 'Zmluvy o dielo a dodatky. Dohodnuté podmienky sa neprepisujú',
    subcontracts: 'Konkrétne stavby: kto tam je, koľko odrobil, čo sa fakturuje',
    timesheets: 'Odpracované hodiny — z nich vzniká podklad na faktúru',
    hoursheet: 'Stundennachweis: týždenný papier, ktorý podpisuje odberateľ',
    hiring: 'Čo a koho práve naberáš, krok za krokom',
    candidates: 'Ľudia, ktorí sa ozvali. Odtiaľto sa volá a preveruje',
    workers: 'Kartotéka živnostníkov: doklady, sadzby, fakturačné údaje',
    crews: 'Partie, ktoré chodia na stavby spolu',
    trades: 'Čo sa má pýtať pri ktorom remesle, vrátane overovacích otázok',
    recruiting: 'Zápisy z náborových hovorov',
    partners: 'Nemecké firmy, ktorým fakturuješ',
    accommodations: 'Databáza ubytovaní — náklad zákazky, nie obchod',
    clients: 'Firmy a kontakty z ubytovacej agendy',
    invoices: 'Faktúry odberateľom. Bez schválenia sa žiadna nevystaví',
    costs: 'Faktúry od živnostníkov a ostatné náklady',
    bank: 'Výpis z účtu, párovanie a či bude na výplaty',
    marketing: 'Inzeráty a odkiaľ chodia ľudia',
    compliance: 'A1, Zoll, SOKA-BAU — čo treba mať vybavené',
    rules: 'Sadzby a prahy, ktoré vstupujú do výpočtov',
    settings: 'Fakturačné údaje, zapnuté agendy, číselné rady',
    active: 'Prebiehajúce pobyty',
    inquiries: 'Dopyty na ubytovanie',
    offers: 'Ponuky na ubytovanie',
    orders: 'Objednávky ubytovania',
  },

  hintOf(key) { return this.navHints[key] || ''; },

  // ── Prepojenia medzi obrazovkami ─────────────────────────────────────────
  // Appka bola dovtedy sada samostatných zoznamov: z človeka sa nedalo dostať
  // na jeho partiu, z partie na stavbu, zo stavby na faktúru. Kto chcel vedieť
  // súvislosť, musel si ju pamätať a vyhľadať ručne.
  //
  // Tabuľka nižšie je jediné miesto, kde je zapísané, ktorý modul vie otvoriť
  // ktorý typ záznamu. `link()` z toho spraví odkaz, `open()` ho otvorí.
  // Keď modul chýba alebo ešte nie je načítaný, odkaz sa jednoducho nevykreslí
  // — nikdy nevznikne tlačidlo, ktoré nič nespraví.
  entities: {
    worker:     { route: 'workers',      handle: 'Wrk',   ico: 'workers',   what: 'Živnostník' },
    crew:       { route: 'crews',        handle: 'Crews', ico: 'workers',   what: 'Partia' },
    subcontract:{ route: 'subcontracts', handle: 'Sub',   ico: 'site',      what: 'Zákazka' },
    partner:    { route: 'partners',     handle: 'Prt',   ico: 'clients',   what: 'Odberateľ' },
    invoice:    { route: 'invoices',     handle: 'Inv',   ico: 'invoices',  what: 'Faktúra' },
    // Náklady majú dve karty v jednom module, preto vlastný názov metódy.
    bill:       { route: 'costs',        handle: 'Cost',  ico: 'receipt',   what: 'Prijatá faktúra', method: 'billDetail' },
    candidate:  { route: 'candidates',   handle: 'Cand',  ico: 'user',      what: 'Kandidát' },
    quote:      { route: 'quotes',       handle: 'Quo',   ico: 'offers',    what: 'Ponuka' },
    contract:   { route: 'contracts',    handle: 'Con',   ico: 'note',      what: 'Zmluva' },
    // Úloha nemá „detail" — otvára sa rovno formulár, v ktorom sa dá upraviť.
    task:       { route: 'tasks',        handle: 'Tsk',   ico: 'tasks',     what: 'Úloha', method: 'form' },
    accommodation: { route: 'accommodations', handle: 'Acc', ico: 'bed',    what: 'Ubytovanie' },
    // Ubytovacia agenda. Kým je modul vypnutý, `canOpen()` ich nepustí
    // a odkaz sa vykreslí ako obyčajný štítok — archivovaná obrazovka sa
    // nesmie otvoriť ani prekliknutím zo susednej.
    inquiry:    { route: 'inquiries',    handle: 'Inq',   ico: 'inquiries', what: 'Dopyt' },
    // Objednávka má „spis", nie detail — starý kód to riešil tichým `else if`.
    order:      { route: 'orders',       handle: 'Ord',   ico: 'orders',    what: 'Objednávka', method: 'spis' },
    client:     { route: 'clients',      handle: 'Cli',   ico: 'clients',   what: 'Klient' },
  },

  /** Vie sa na tento typ záznamu vôbec preklikať? */
  canOpen(type, id) {
    const e = this.entities[type];
    if (!e || !id || !this.routeAvailable(e.route)) return false;
    const mod = window[e.handle];
    return !!(mod && typeof mod[e.method || 'detail'] === 'function');
  },

  /**
   * Otvorí konkrétny záznam, aj keď je na inej obrazovke. Najprv sa prepne
   * obrazovka (a ak treba, aj agenda), počká sa na jej dáta a až potom sa
   * otvorí detail — inak by modul otváral kartu nad prázdnym zoznamom.
   */
  async open(type, id) {
    const e = this.entities[type];
    if (!this.canOpen(type, id)) return;

    // Ide sa rovno na adresu záznamu, nie na zoznam. Keby sa najprv prepla
    // obrazovka na `#/workers`, router by to prečítal ako „bez id" a otvorený
    // záznam by hneď zavrel — a klik z prehľadu by skončil na zozname.
    const target = `#/${e.route}/${id}`;
    if (location.hash !== target) { location.hash = target; return; }

    try { await window[e.handle][e.method || 'detail'](id); } catch (err) {
      console.error('[danubra] detail sa nepodarilo otvoriť', type, id, err);
      UI.toast('Záznam sa nepodarilo otvoriť.', 'err');
    }
  },

  /** Odkaz na záznam ako „čip". Keď sa naň nedá kliknúť, vráti len text. */
  link(type, id, label, opts = {}) {
    const text = UI.esc(label || '');
    if (!text) return '';
    // Keď sa na záznam kliknúť nedá, vyzerá to ako štítok — nie ako odkaz,
    // ktorý nič nespraví. (`.chip` sa nepoužíva zámerne: to je iná vec
    // z náborového modulu a má vlastnú veľkosť.)
    if (!this.canOpen(type, id)) return `<span class="link-chip is-static">${text}</span>`;
    const e = this.entities[type];
    const cls = opts.inline ? 'link-inline' : 'link-chip';
    const ico = opts.inline ? '' : Icon(opts.ico || e.ico, 13);
    return `<button class="${cls}" title="${UI.esc(e.what)}: ${text}"
      onclick="event.stopPropagation();Danubra.open('${type}','${id}')">${ico}<span>${text}</span></button>`;
  },

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

    const nav = document.getElementById('sidebar-nav');
    if (nav && !nav._overflowBound) {
      nav.addEventListener('scroll', () => this._navOverflow());
      window.addEventListener('resize', () => this._navOverflow());
      nav._overflowBound = true;
    }
    this._navOverflow();

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
    const item = ([key, label, ico]) => {
      const b = this.badges[key];
      const hint = this.hintOf(key);
      return `<button class="mega-item${key === this.route ? ' active' : ''}"
        onclick="Danubra.goFromMega('${key}')">
        ${Icon(ico, 16)}
        <span class="mega-text">
          <b>${label}</b>
          ${hint ? `<em>${UI.esc(hint)}</em>` : ''}
        </span>
        ${b ? `<span class="nav-badge">${b}</span>` : ''}
      </button>`;
    };

    // Stĺpec za agendu. Má zmysel len vtedy, keď sú agendy dve — inak by sa
    // skupiny ako DATABÁZA rozpadli medzi „Nábor a stavby" a „Spoločné"
    // a nikto by nevedel, kde čo hľadať.
    const areaColumn = (areaKey) => {
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
            ${items.map(item).join('')}`).join('')}
        </div>`;
    };

    // Stĺpec za skupinu. Toto sa používa pri jedinej agende: každá skupina
    // je jeden blok a všetko je na jednej obrazovke naraz.
    const groupColumn = ([glabel, items]) => {
      const visible = items.filter(i => this.inArea(i));
      if (!visible.length) return '';
      return `
        <div class="mega-col">
          <div class="mega-col-head"><span>${UI.esc(glabel)}</span></div>
          ${visible.map(item).join('')}
        </div>`;
    };

    const multiArea = this.visibleAreas().length > 1;
    const cols = multiArea
      ? this.visibleAreas().map(a => areaColumn(a[0])).join('') + areaColumn(null)
      : this.navGroups.map(groupColumn).join('');

    const email = this.user?.email || '';
    return `
      <div class="mega-head">
        <strong>Kam chceš ísť?</strong>
        <button class="mega-x" onclick="Danubra.toggleMega(false)" aria-label="Zavrieť">${Icon('x', 18)}</button>
      </div>
      ${multiArea ? `
      <div class="mega-areas">
        ${this.visibleAreas().map(([key, label, ico]) => `
          <button class="mega-area${this.area === key ? ' active' : ''}"
            onclick="Danubra.setAreaFromMega('${key}')">
            ${Icon(ico, 17)}<span>${label}</span></button>`).join('')}
      </div>` : ''}
      <div class="mega-cols">${cols}</div>
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

  // Prázdny hash na tej istej obrazovke nevyvolá `hashchange`, takže sa
  // otvorený záznam treba zavrieť rovno tu — inak by „Späť" na zozname
  // nespravilo nič.
  go(key) {
    const target = '#/' + key;
    if (location.hash === target) { this._closeOpenRecord(key); this.renderRoute(); return; }
    location.hash = target;
  },

  /** Adresa bez id znamená zoznam. Modul si otvorený záznam nesmie pamätať. */
  _closeOpenRecord(route) {
    const type = Object.keys(this.entities).find(k => this.entities[k].route === route);
    const mod = type && window[this.entities[type].handle];
    if (mod && 'openId' in mod) mod.openId = null;
  },

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
    // `#/workers` otvorí zoznam, `#/workers/<id>` rovno ten záznam. Odkaz na
    // konkrétneho človeka sa tak dá poslať alebo uložiť do záložiek.
    const m = (location.hash || '').match(/^#\/([a-z-]+)(?:\/([\w-]+))?/);
    const key = m ? m[1] : 'dashboard';
    const wantId = m && m[2] ? m[2] : null;
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
    if (!wantId) this._closeOpenRecord(this.route);
    if (this.user) {
      const done = this.renderRoute();
      if (wantId) {
        const type = Object.keys(this.entities)
          .find(k => this.entities[k].route === this.route);
        const mod = type && window[this.entities[type].handle];
        if (mod && typeof mod.detail === 'function') {
          Promise.resolve(done).then(() => mod.detail(wantId)).catch((e) =>
            console.error('[danubra] odkaz na záznam sa nepodarilo otvoriť', e));
        }
      }
    }
    document.querySelectorAll('.nav-item, .tab').forEach(el => {
      if (el.dataset.key) el.classList.toggle('active', el.dataset.key === this.route);
    });
    this._navOverflow();
  },

  /** Ukáž tieň na spodku menu, keď pokračuje pod okrajom. */
  _navOverflow() {
    const box = document.getElementById('sidebar-scroll');
    const nav = document.getElementById('sidebar-nav');
    if (!box || !nav) return;
    const more = nav.scrollHeight - nav.clientHeight - nav.scrollTop > 6;
    box.classList.toggle('has-more', more);
  },

  renderRoute() {
    const view = document.getElementById('view');
    this.setActions('');
    const fn = this.views[this.route];

    if (!fn) {
      view.innerHTML = this.header(this.labelOf(this.route), 'Pripravujeme v ďalšom kroku.')
        + UI.empty('wrench', 'Táto sekcia zatiaľ nie je hotová', 'Pribudne v nasledujúcom milestone.');
      return;
    }

    // Obrazovka môže spadnúť alebo sa jej nemusia načítať dáta. Ani jedno
    // sa nesmie stratiť potichu — prázdny zoznam vyzerá ako „nemáš žiadne
    // záznamy", hoci v skutočnosti zlyhal dotaz do databázy.
    DB.clearFailures();
    const started = this.route;

    // Prísľub si necháme: `open()` naň čaká, aby detail neotváral nad
    // zoznamom, ktorý sa ešte nenačítal.
    return (this._routeReady = Promise.resolve()
      .then(() => fn.call(this, view))
      .then(() => {
        if (this.route !== started) return;      // medzitým sa prepla obrazovka
        this._showLoadFailures(view);
      })
      .catch((e) => {
        if (this.route !== started) return;
        console.error('[danubra] obrazovka spadla', e);
        view.innerHTML = this.header(this.labelOf(this.route), '')
          + this._screenError('Túto obrazovku sa nepodarilo zobraziť.', e && (e.message || e));
      }));
  },

  /** Keď sa časť dát nenačítala, povedz to — nevydávaj to za prázdno. */
  _showLoadFailures(view) {
    const fails = DB.failures;
    if (!fails.length) return;
    const list = fails.slice(0, 5)
      .map(f => `<li><strong>${UI.esc(f.table)}</strong> — ${UI.esc(f.message)}</li>`).join('');
    const box = document.createElement('div');
    box.innerHTML = `<div class="warnbox" style="margin-bottom:14px;">
      ${Icon('alert', 14)} <strong>Časť údajov sa nenačítala.</strong>
      Čo je nižšie, nemusí byť úplné — prázdny zoznam tu neznamená, že nemáš záznamy.
      <ul style="margin:8px 0 0 18px;font-size:12.5px;">${list}</ul>
      <button class="btn btn-outline btn-sm" style="margin-top:10px;"
        onclick="location.reload()">Skúsiť znova</button>
    </div>`;
    view.insertBefore(box.firstElementChild, view.firstChild);
  },

  _screenError(what, detail) {
    return `<div class="warnbox">
      ${Icon('alert', 14)} <strong>${UI.esc(what)}</strong>
      ${detail ? `<pre style="margin:8px 0 0;font-size:12px;white-space:pre-wrap;">${UI.esc(String(detail).slice(0, 300))}</pre>` : ''}
      <div style="margin-top:10px;display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" onclick="location.reload()">Načítať znova</button>
        <button class="btn btn-ghost btn-sm" onclick="Danubra.go('dashboard')">Späť na prehľad</button>
      </div>
    </div>`;
  },

  /** Skupina, do ktorej obrazovka patrí — „ĽUDIA", „PENIAZE"… */
  groupOf(key) {
    for (const [glabel, items] of this.navGroups) {
      if (items.some(x => x[0] === key)) return glabel;
    }
    return null;
  },

  /**
   * Cesta nad nadpisom. Bez nej sa po prekliknutí z upozornenia nedá povedať,
   * kde človek skončil — každá obrazovka vyzerá rovnako.
   */
  crumbs(trail = []) {
    const parts = [
      `<button onclick="Danubra.go('dashboard')">Prehľad</button>`,
      ...(this.route === 'dashboard' ? [] : [
        `<span>${UI.esc(this.groupOf(this.route) || '')}</span>`,
        trail.length
          ? `<button onclick="Danubra.go('${this.route}')">${UI.esc(this.labelOf(this.route))}</button>`
          : `<span>${UI.esc(this.labelOf(this.route))}</span>`,
      ].filter(x => !/>\s*<\/span>$/.test(x))),
      ...trail.map(x => `<span>${UI.esc(x)}</span>`),
    ];
    return `<div class="crumbs">${parts.join('<span class="crumb-sep">/</span>')}</div>`;
  },

  // Jednotná hlavička stránky. `trail` je cesta pod obrazovkou (napríklad meno
  // otvoreného človeka) — vtedy sa názov obrazovky stane odkazom späť na
  // zoznam. Na mobile je to jediná cesta späť, lebo horný pruh tam nie je.
  header(title, sub, right, trail) {
    return `<div class="page-head">
      <div style="min-width:0;">
        ${this.crumbs(trail)}
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

  // ── Prehľad: dáta ──────────────────────────────────────────────────────────
  // Prvá obrazovka po prihlásení nemá byť prehliadka databázy. Má odpovedať
  // na tri otázky, ktoré sa v tomto biznise pýtajú každý deň:
  //
  //   1. Čo dnes treba spraviť?
  //   2. Bude na výplaty?
  //   3. Zarábame na tom?
  //
  // Všetko ostatné je až za nimi. Preto sa počíta z v2 dát — obdobia, prijaté
  // faktúry, banka, doklady — nie z počtov riadkov v tabuľkách.

  _dayISO() { return new Date().toISOString().slice(0, 10); },

  /**
   * Jeden Promise.all, nech obrazovka naskočí naraz. `DB.list` chyby nehádže,
   * ale zbiera — router ich pod hlavičkou vypíše, takže prázdny prehľad sa
   * nikdy netvári ako „nič tu nemáš".
   */
  async _dashLoad() {
    const [today, subs, per, inv, bills, costs, docs, cands, plans, tx, cf,
      wrk, prt, scAll, asgAll, tsAll, quotesAll] = await Promise.all([
      DB.list('v_today', { limit: 200 }),
      DB.list('v_subcontract_status', { limit: 200 }),
      DB.list('periods', { select: 'id,subcontract_id,period_from,period_to,status', limit: 300 }),
      DB.list('invoices', {
        select: 'id,invoice_number,total,amount_net,withholding_amount,status,due_date,partner_id',
        limit: 500,
      }),
      DB.list('bills', { select: 'id,bill_number,amount,status,due_date,worker_id', limit: 500 }),
      // `rebillable` a `rebilled_invoice_id` sú tu kvôli otázke „koľko nám
      // viazne v ubytovaní" — bez nich sa nedá rozlíšiť náš výdavok od
      // peňazí, ktoré sa vrátia.
      DB.list('costs', {
        select: 'id,amount,cost_date,category,subcontract_id,rebillable,rebilled_invoice_id',
        limit: 1000 }),
      DB.list('v_worker_documents', {
        select: 'id,worker_id,worker_name,doc_type,validity,days_left,valid_to', limit: 1000,
      }),
      DB.list('candidates', { select: 'id,status,first_contact_at', limit: 500 }),
      DB.list('recruitment_plans', {
        select: 'id,status,headcount,title,city,trade_key,subcontract_id,start_date,deadline',
        limit: 200 }),
      DB.list('bank_transactions', { select: 'amount', limit: 2000 }),
      DB.list('v_cashflow', { limit: 1000 }),
      // Mená. Bez nich by upozornenie povedalo „1 doklad je po platnosti"
      // a človek by musel hádať, čí. Sú to dva malé dotazy.
      DB.list('workers', { select: 'id,full_name', limit: 500 }),
      DB.list('partners', { select: 'id,name', limit: 200 }),
      // Podklad pre „čo máme v objednávkach" a „nevyfakturované".
      DB.list('subcontracts', {
        select: 'id,title,status,charge_rate,date_from,date_to,partner_id,site_city', limit: 300 }),
      DB.list('assignments', {
        select: 'id,worker_id,subcontract_id,status,charge_rate,worker_rate', limit: 1000 }),
      DB.list('timesheets', {
        select: 'id,assignment_id,worker_id,hours,work_date,period_id,rate_used', limit: 5000 }),
      DB.list('v_quote_margin', {
        select: 'id,status,total,margin_per_month,partner_name,valid_until', limit: 200 }),
    ]);
    if (window.Cfg && !Cfg.loaded) { try { await Cfg.load(); } catch {} }

    const d = this._dayISO();
    const S = (r) => r.data || [];
    const openInv = (i) => !['paid', 'cancelled', 'draft'].includes(i.status);

    const subsAll = S(subs);
    const sites = subsAll.filter(s => s.status === 'active');
    const invoices = S(inv);
    const billsAll = S(bills);
    const documents = S(docs);
    const periods = S(per);
    const candidates = S(cands);
    const activePlans = S(plans).filter(p => p.status === 'active');

    const f = DanubraBank.forecast({
      balance: Money.sum(S(tx).map(t => Money.toCents(t.amount))),
      items: S(cf), weeks: 8,
    });

    // Vyhľadávacie tabuľky pre mená v upozorneniach.
    const nameOf = (rows, key) => {
      const m = new Map(rows.map(r => [r.id, r[key]]));
      return (id) => m.get(id) || null;
    };
    const workerName = nameOf(S(wrk), 'full_name');
    const partnerName = nameOf(S(prt), 'name');
    const siteName = (id) => {
      const s = subsAll.find(x => x.id === id);
      return s ? (s.title || s.contract_number) : null;
    };

    // ── Peniaze ───────────────────────────────────────────────────────────
    // Štyri veci, ktoré sa v praxi zlievajú do jednej: čo čakáme (má termín),
    // čo je odrobené a nevyfakturované (termín nemá), čo je v objednávkach
    // (ešte sa to neodrobilo) a čo nám viazne v refakturovateľných nákladoch.
    const subcontracts = S(scAll);
    const assignments = S(asgAll);
    const timesheets = S(tsAll);
    const allCosts = S(costs);

    const receivable = DanubraOutlook.receivable(invoices, d);
    const unbilled = DanubraOutlook.unbilled({ subcontracts, assignments, timesheets });
    const tied = DanubraOutlook.tied(allCosts);
    const book = DanubraOutlook.orderBook({ today: d, subcontracts, assignments });
    const hiringNeed = DanubraOutlook.hiring({ today: d, subcontracts, plans: S(plans) });
    const profit = DanubraOutlook.expectedProfit({
      subcontracts, assignments, orderBook: book, unbilled, quotes: S(quotesAll),
    });
    const balanceNow = Money.sum(S(tx).map(t => Money.toCents(t.amount)));

    return {
      today: d,
      tasks: S(today),
      workerName, partnerName, siteName,
      subcontracts, assignments, timesheets,
      cashflowItems: S(cf),
      balanceNow,
      receivable, unbilled, tied, book, hiringNeed, profit,
      quotes: S(quotesAll),
      sites,
      deployed: sites.reduce((s, x) => s + Number(x.active_assignments || 0), 0),
      crewsOut: sites.reduce((s, x) => s + Number(x.crews || 0), 0),
      hoursOpen: sites.reduce((s, x) => s + Number(x.hours_open || 0), 0),
      periodsDue: periods.filter(p => p.status === 'open' && p.period_to < d),
      periodsClosed: periods.filter(p => p.status === 'closed'),
      invApprove: invoices.filter(i => i.status === 'pending_approval'),
      invOverdue: invoices.filter(i => openInv(i) && i.due_date && i.due_date < d),
      billsToCheck: billsAll.filter(b => ['received', 'checked'].includes(b.status)),
      billsDisputed: billsAll.filter(b => b.status === 'disputed'),
      docsExpired: documents.filter(x => x.validity === 'expired'),
      docsExpiring: documents.filter(x => x.validity === 'expiring'),
      candWaiting: candidates.filter(c => c.status === 'new' && !c.first_contact_at),
      plansActive: activePlans.length,
      needPeople: activePlans.reduce((s, p) => s + (p.headcount || 0), 0),
      forecast: f,
      scale: DanubraBank.scaleCheck(f, window.Cfg ? Cfg.j('staffing') : {}),
      econ: DanubraBills.economics({ invoices, bills: billsAll, costs: S(costs) }),
    };
  },

  /**
   * Veci, ktoré sa nedajú prehliadnuť. Úlohy sem nepatria — tie majú vlastnú
   * kartu. Sem patrí len to, čo vypočítame z dát a na čo sa dá kliknúť.
   */
  _dashAlerts(x) {
    const a = [];
    /**
     * @param rows  záznamy, ktorých sa to týka
     * @param who   ako sa z jedného záznamu dostane typ, id a meno
     *              → { type, id, label }
     */
    const push = (dot, rows, label, why, go, who) => {
      if (!rows.length) return;
      a.push({
        dot, label, why, go,
        items: rows.slice(0, 4).map(who).filter(r => r && r.label),
        more: Math.max(0, rows.length - 4),
      });
    };

    push('red', x.docsExpired,
      `${x.docsExpired.length} ${Shell.plural(x.docsExpired.length, 'doklad je', 'doklady sú', 'dokladov je')} po platnosti`,
      'Bez platného A1 alebo živnostenského nesmie nikto na stavbu.', 'workers',
      (r) => ({ type: 'worker', id: r.worker_id, label: r.worker_name }));
    push('red', x.periodsDue,
      `${x.periodsDue.length} ${Shell.plural(x.periodsDue.length, 'obdobie čaká', 'obdobia čakajú', 'období čaká')} na uzavretie`,
      'Kým sa obdobie neuzavrie, nevznikne podklad na faktúru.', 'subcontracts',
      (r) => ({ type: 'subcontract', id: r.subcontract_id, label: x.siteName(r.subcontract_id) }));
    push('amber', x.invApprove,
      `${x.invApprove.length} ${Shell.plural(x.invApprove.length, 'faktúra čaká', 'faktúry čakajú', 'faktúr čaká')} na schválenie`,
      'Bez schválenia sa nevystaví ani neodošle.', 'invoices',
      (r) => ({ type: 'invoice', id: r.id, label: r.invoice_number || x.partnerName(r.partner_id) }));
    push('red', x.invOverdue,
      `${x.invOverdue.length} ${Shell.plural(x.invOverdue.length, 'faktúra je', 'faktúry sú', 'faktúr je')} po splatnosti`,
      'Zavolať skôr, než sa to natiahne na ďalší mesiac.', 'invoices',
      (r) => ({ type: 'invoice', id: r.id,
        label: [r.invoice_number, x.partnerName(r.partner_id)].filter(Boolean).join(' · ') }));
    push('red', x.billsDisputed,
      `${x.billsDisputed.length} ${Shell.plural(x.billsDisputed.length, 'prijatá faktúra je', 'prijaté faktúry sú', 'prijatých faktúr je')} sporná`,
      'Rozdiel oproti hodinám treba dohodnúť so živnostníkom.', 'costs',
      (r) => ({ type: 'bill', id: r.id,
        label: [r.bill_number, x.workerName(r.worker_id)].filter(Boolean).join(' · ') }));
    push('amber', x.billsToCheck,
      `${x.billsToCheck.length} ${Shell.plural(x.billsToCheck.length, 'prijatá faktúra čaká', 'prijaté faktúry čakajú', 'prijatých faktúr čaká')} na kontrolu`,
      'Porovnať s odpracovanými hodinami, potom schváliť.', 'costs',
      (r) => ({ type: 'bill', id: r.id,
        label: [r.bill_number, x.workerName(r.worker_id)].filter(Boolean).join(' · ') }));
    push('amber', x.docsExpiring,
      `${x.docsExpiring.length} ${Shell.plural(x.docsExpiring.length, 'dokladu čoskoro skončí', 'dokladom čoskoro skončí', 'dokladom čoskoro skončí')} platnosť`,
      'Vybaviť teraz, nie v deň, keď vyprší.', 'workers',
      (r) => ({ type: 'worker', id: r.worker_id,
        label: r.days_left != null ? `${r.worker_name} · ${r.days_left} dní` : r.worker_name }));
    push('red', x.candWaiting,
      `${x.candWaiting.length} ${Shell.plural(x.candWaiting.length, 'kandidát čaká', 'kandidáti čakajú', 'kandidátov čaká')} na prvý telefonát`,
      'Cieľ je do desiatich minút — potom už berie prácu inde.', 'candidates',
      (r) => ({ type: 'candidate', id: r.id, label: r.full_name }));
    return a;
  },


  // ── Prehľad: peniaze ───────────────────────────────────────────────────
  // Koľko týždňov ukazuje výhľad. Drží sa to tu, aby prepnutie prežilo
  // prekreslenie obrazovky.
  dashWeeks: 4,
  setDashWeeks(n) { this.dashWeeks = Number(n) || 4; this.renderRoute(); },

  /** „Čakáme na účet" — a hneď aj to, koľko z toho reálne príde. */
  _dashMoneyCard(x) {
    const r = x.receivable;
    const u = x.unbilled;
    return `<div class="card card-pad">
      <div class="card-head">
        <div class="card-title">Koľko peňazí čakáme</div>
        ${r.overdueCount ? UI.badge(`${r.overdueCount} po splatnosti`, 'red') : ''}
      </div>
      <div class="big-number">
        <button class="link-inline" style="font:inherit;color:inherit;"
          onclick="Danubra.go('invoices')">${Money.format(r.net)}</button>
      </div>
      <p class="big-note">na účet z ${r.count} ${Shell.plural(r.count, 'vystavenej faktúry', 'vystavených faktúr', 'vystavených faktúr')}${
        r.withheld ? ` — fakturované je ${Money.format(r.gross)}, zrážka §48b ${Money.format(r.withheld)} ide nemeckému úradu` : ''}.</p>
      <div class="kv" style="margin:12px 0 0;">
        ${r.overdue ? `<div><span>Po splatnosti</span><strong style="color:var(--red);">${
          Money.format(r.overdue)}</strong></div>` : ''}
        <div><span>Odrobené, nevyfakturované</span><strong>${Money.format(u.charge)}</strong></div>
      </div>
      ${u.hours ? `<p style="margin:10px 0 0;font-size:12.5px;color:var(--ink-mute);">
        ${String(u.hours).replace('.', ',')} h čaká na uzavretie obdobia. Termín to nemá —
        do týždenného výhľadu sa to preto neráta.</p>` : ''}
    </div>`;
  },

  /** Interaktívny výhľad: príjmy, výdaje a rozdiel na 1–4 týždne. */
  _dashWeeksCard(x) {
    const n = this.dashWeeks;
    const w = DanubraOutlook.weeks({
      today: x.today, weeks: n, balance: x.balanceNow, items: x.cashflowItems,
    });
    const tone = w.negativeFrom ? 'red' : (w.diff < 0 ? 'amber' : 'green');

    const row = (b) => `
      <div class="wk-row${b.balance < 0 ? ' wk-neg' : ''}">
        <div class="wk-when">${b.week}. týždeň<span>${UI.date(b.from)}</span></div>
        <div class="wk-in">${b.in ? `+${Money.format(b.in, { currency: '' })}` : '—'}</div>
        <div class="wk-out">${b.out ? `−${Money.format(Math.abs(b.out), { currency: '' })}` : '—'}</div>
        <div class="wk-diff ${b.diff > 0 ? 'up' : b.diff < 0 ? 'down' : ''}">${
          b.diff ? `${b.diff > 0 ? '+' : '−'}${Money.format(Math.abs(b.diff), { currency: '' })}` : '—'}</div>
        <div class="wk-bal">${Money.format(b.balance)}</div>
      </div>`;

    return `<div class="card card-pad">
      <div class="card-head">
        <div class="card-title">Príjmy a výdaje</div>
        <div class="pillbar" style="padding:2px;">
          ${[1, 2, 3, 4].map(k => `<button class="pill${k === n ? ' active' : ''}"
            style="padding:4px 10px;font-size:12px;"
            onclick="Danubra.setDashWeeks(${k})">${k} ${k === 1 ? 'týždeň' : 'týždne'}</button>`).join('')}
        </div>
      </div>
      ${w.overdue.in || w.overdue.out ? `<p class="big-note" style="margin:0 0 8px;">
        Po splatnosti ${Money.format(w.overdue.in + w.overdue.out)} sa počíta hneď —
        sú to peniaze, ktoré mali prísť dávno, nie budúcnosť.</p>` : ''}
      <div class="wk-table">
        <div class="wk-row wk-head">
          <div>Kedy</div><div>Príde</div><div>Odíde</div><div>Rozdiel</div><div>Zostatok</div>
        </div>
        ${w.weeks.map(row).join('')}
      </div>
      <div class="kv" style="margin:12px 0 0;">
        <div><span>Spolu príde</span><strong style="color:var(--green);">${Money.format(w.totalIn)}</strong></div>
        <div><span>Spolu odíde</span><strong style="color:var(--red);">${Money.format(Math.abs(w.totalOut))}</strong></div>
        <div><span>Rozdiel za ${n} ${Shell.plural(n, 'týždeň', 'týždne', 'týždňov')}</span>
          <strong style="color:var(--${tone === 'green' ? 'green' : tone === 'amber' ? 'amber' : 'red'});">${
            w.diff > 0 ? '+' : ''}${Money.format(w.diff)}</strong></div>
        <div><span>Zostatok na konci</span><strong>${Money.format(w.endBalance)}</strong></div>
      </div>
      ${w.negativeFrom ? `<div class="warnbox" style="margin-top:10px;">
        ${Icon('alert', 14)} Podľa výhľadu spadne účet do mínusu v ${w.negativeFrom.week}. týždni
        (${UI.date(w.negativeFrom.from)}). Výplaty sa odložiť nedajú.</div>` : ''}
      <button class="btn btn-outline btn-sm" style="margin-top:10px;"
        onclick="Danubra.go('bank')">Celý výhľad na osem týždňov</button>
    </div>`;
  },

  /** Očakávaný zisk v troch vrstvách podľa istoty. */
  _dashProfitCard(x) {
    const p = x.profit;
    const bar = (label, cents, cls, note) => `
      <div class="pf-row">
        <div class="pf-label">${label}<span>${note}</span></div>
        <div class="pf-value ${cls}">${Money.format(cents)}</div>
      </div>`;
    return `<div class="card card-pad">
      <div class="card-head">
        <div class="card-title">Očakávaný zisk</div>
        ${UI.badge(`pravdepodobne ${Money.format(p.likely)}`, p.likely > 0 ? 'green' : 'gray')}
      </div>
      ${bar('Z odrobeného', p.done, 'pf-sure', 'hotové, len sa to ešte nevyfakturovalo')}
      ${bar('Z bežiacich zákaziek', p.contracted, 'pf-likely', 'dohodnuté, ešte sa to neodrobilo')}
      ${bar('Z odoslaných ponúk', p.pipeline, 'pf-maybe',
        p.quotesSent ? `${p.quotesSent} ${Shell.plural(p.quotesSent, 'ponuka čaká', 'ponuky čakajú', 'ponúk čaká')} na odpoveď` : 'žiadna ponuka nevisí')}
      <p style="margin:10px 0 0;font-size:12.5px;color:var(--ink-mute);">
        Vrstvy sa nesčítavajú do jedného čísla zámerne — z ponuky, ktorú nikto
        neprijal, sa zisk počítať nedá.</p>
    </div>`;
  },

  /** Čo máme v objednávkach — dohodnuté, ešte neodrobené. */
  _dashOrderBookCard(x) {
    const b = x.book;
    if (!b.rows.length) {
      return `<div class="card card-pad">
        <div class="card-head"><div class="card-title">Čo máme v objednávkach</div></div>
        <div style="color:var(--ink-mute);font-size:13px;">Žiadna bežiaca zákazka.</div>
      </div>`;
    }
    return `<div class="card card-pad">
      <div class="card-head">
        <div class="card-title">Čo máme v objednávkach</div>
        <button class="btn btn-ghost btn-sm" onclick="Danubra.go('subcontracts')">Zákazky</button>
      </div>
      <div class="big-number">${Money.format(b.remaining)}</div>
      <p class="big-note">zostáva odrobiť na ${b.sites} ${
        Shell.plural(b.sites, 'zákazke', 'zákazkách', 'zákazkách')} s ${b.people} ${
        Shell.plural(b.people, 'človekom', 'ľuďmi', 'ľuďmi')}.</p>
      ${b.rows.slice(0, 5).map(r => `
        <div class="list-row" style="cursor:default;">
          <span class="dot ${r.days ? 'green' : 'amber'}"></span>
          <span style="flex:1;min-width:0;">
            ${Danubra.link('subcontract', r.id, r.title)}
            <span style="color:var(--ink-mute);display:block;font-size:12px;margin-top:3px;">
              ${r.people} ${Shell.plural(r.people, 'človek', 'ľudia', 'ľudí')} ·
              ${r.days ? `${r.days} ${Shell.plural(r.days, 'pracovný deň', 'pracovné dni', 'pracovných dní')} do konca`
                : 'termín už uplynul'}</span>
          </span>
          <strong style="font-variant-numeric:tabular-nums;">${Money.format(r.remaining)}</strong>
        </div>`).join('')}
      <p style="margin:10px 0 0;font-size:12.5px;color:var(--ink-mute);">
        Odhad z ${b.hoursPerDay} h na deň a z ľudí, ktorí sú na zákazke nasadení.
        Víkendy sa nerátajú.</p>
    </div>`;
  },

  /** Peniaze viazané v refakturovateľných nákladoch. */
  _dashTiedCard(x) {
    const t = x.tied;
    if (!t.total) {
      return `<div class="card card-pad">
        <div class="card-head"><div class="card-title">Viazne v nákladoch</div></div>
        <div style="color:var(--ink-mute);font-size:13px;">
          Nič nevisí — všetko refakturovateľné je už vrátené.</div>
      </div>`;
    }
    const CAT = { accommodation: 'Ubytovanie', travel: 'Cestovné', transport: 'Doprava' };
    return `<div class="card card-pad">
      <div class="card-head">
        <div class="card-title">Viazne v nákladoch</div>
        <button class="btn btn-ghost btn-sm" onclick="Danubra.go('costs')">Náklady</button>
      </div>
      <div class="big-number" style="color:var(--amber);">${Money.format(t.total)}</div>
      <p class="big-note">naše peniaze v ${t.count} ${
        Shell.plural(t.count, 'položke', 'položkách', 'položkách')}, ktoré sa majú vrátiť.
        Nie je to strata — ale teraz v cash-flow chýbajú.</p>
      ${t.byCategory.map(c => `
        <div class="list-row" style="cursor:default;">
          <span class="dot amber"></span>
          <span style="flex:1;">${UI.esc(CAT[c.category] || c.category)}</span>
          <strong style="font-variant-numeric:tabular-nums;">${Money.format(c.cents)}</strong>
        </div>`).join('')}
    </div>`;
  },

  /** Koho a kam treba zohnať. */
  _dashHiringCard(x) {
    const h = x.hiringNeed;
    if (!h.headcount) {
      return `<div class="card card-pad">
        <div class="card-head"><div class="card-title">Koho treba zohnať</div></div>
        <div style="color:var(--ink-mute);font-size:13px;">
          Žiadny bežiaci nábor. ${x.candWaiting.length ? `${x.candWaiting.length} ${
            Shell.plural(x.candWaiting.length, 'kandidát čaká', 'kandidáti čakajú', 'kandidátov čaká')} na telefonát.` : ''}</div>
      </div>`;
    }
    return `<div class="card card-pad">
      <div class="card-head">
        <div class="card-title">Koho a kam treba zohnať</div>
        ${h.urgent ? UI.badge(`${h.urgent} súrne`, 'red') : ''}
      </div>
      <div class="big-number">${h.headcount}</div>
      <p class="big-note">${Shell.plural(h.headcount, 'človek', 'ľudia', 'ľudí')} v ${h.plans} ${
        Shell.plural(h.plans, 'bežiacom nábore', 'bežiacich náboroch', 'bežiacich náboroch')}${
        h.urgent ? `, z toho ${h.urgent} s nástupom do dvoch týždňov` : ''}.</p>
      ${h.rows.map(r => `
        <div class="list-row" style="cursor:default;" onclick="Danubra.go('hiring')">
          <span class="dot ${r.urgent ? 'red' : 'amber'}"></span>
          <span style="flex:1;min-width:0;">
            <strong>${UI.esc(r.city)}</strong>
            <span style="color:var(--ink-mute);display:block;font-size:12px;">
              ${r.plans.map(p => UI.esc(p.title || p.site || 'nábor')).join(' · ')}</span>
          </span>
          <strong style="font-variant-numeric:tabular-nums;">${r.headcount}</strong>
        </div>`).join('')}
    </div>`;
  },

  _dashAlertsHtml(alerts) {
    if (!alerts.length) {
      return `<div class="card card-pad">
        <div class="card-head"><div class="card-title">Vyžaduje pozornosť</div></div>
        <div style="color:var(--ink-mute);font-size:13px;padding:8px 2px;">
          Doklady platia, obdobia sú uzavreté, faktúry vybavené. Nič tu nevisí.
        </div></div>`;
    }
    // Zoznam, v ktorom je osem položiek, sa neprezerá. Prvé štyri sú tie,
    // ktoré horia — zvyšok sa dá rozbaliť.
    const TOP = 4;
    const head = alerts.slice(0, TOP);
    const rest = alerts.slice(TOP);

    return `<div class="card card-pad">
      <div class="card-head">
        <div class="card-title">Vyžaduje pozornosť</div>
        <span class="badge" style="background:var(--amber-50);color:var(--amber);">${alerts.length}</span>
      </div>
      ${head.map(r => `
        <div class="list-row" style="align-items:flex-start;cursor:default;">
          <span class="dot ${r.dot}" style="margin-top:6px;"></span>
          <span style="flex:1;min-width:0;">
            <button class="link-inline" style="color:var(--ink);font-weight:600;display:block;text-align:left;"
              onclick="Danubra.go('${r.go}')">${UI.esc(r.label)}</button>
            <span style="color:var(--ink-mute);font-size:12.5px;display:block;">${UI.esc(r.why)}</span>
            ${r.items.length ? `<span class="link-row" style="margin-top:7px;">
              ${r.items.map(i => Danubra.link(i.type, i.id, i.label)).join('')}
              ${r.more ? `<span class="link-chip is-static">+${r.more} ďalších</span>` : ''}
            </span>` : ''}
          </span>
        </div>`).join('')}
      ${rest.length ? `<details class="more-block">
        <summary>Ďalších ${rest.length} ${Shell.plural(rest.length, 'vec', 'veci', 'vecí')}</summary>
        ${rest.map(r => `
          <div class="list-row" style="align-items:flex-start;cursor:default;">
            <span class="dot ${r.dot}" style="margin-top:6px;"></span>
            <span style="flex:1;min-width:0;">
              <button class="link-inline" style="color:var(--ink);font-weight:600;display:block;text-align:left;"
                onclick="Danubra.go('${r.go}')">${UI.esc(r.label)}</button>
              <span style="color:var(--ink-mute);font-size:12.5px;display:block;">${UI.esc(r.why)}</span>
              ${r.items.length ? `<span class="link-row" style="margin-top:7px;">
                ${r.items.map(i => Danubra.link(i.type, i.id, i.label)).join('')}
                ${r.more ? `<span class="link-chip is-static">+${r.more} ďalších</span>` : ''}
              </span>` : ''}
            </span>
          </div>`).join('')}
      </details>` : ''}
    </div>`;
  },

  /** Úlohy z pravidiel (F9). Zobrazuje sa len to, čo horí — zvyšok je v Úlohách. */
  _dashTasksHtml(x) {
    const groups = DanubraTasks.group(x.tasks, x.today)
      .filter(g => g.key === 'overdue' || g.key === 'today' || g.key === 'week');
    let left = 6;
    const shown = [];
    for (const g of groups) {
      if (left <= 0) break;
      shown.push({ ...g, tasks: g.tasks.slice(0, left) });
      left -= shown[shown.length - 1].tasks.length;
    }
    const rest = DanubraTasks.counts(x.tasks, x.today).total - (6 - Math.max(left, 0));

    return `<div class="card card-pad">
      <div class="card-head">
        <div class="card-title">Čo treba spraviť</div>
        <button class="btn btn-ghost btn-sm" onclick="Danubra.go('tasks')">Všetky úlohy</button>
      </div>
      ${shown.length ? shown.map(g => `
        <div class="form-section" style="margin-top:10px;">${UI.esc(g.label)}</div>
        ${g.tasks.map(t => `
          <div class="list-row" style="align-items:flex-start;cursor:default;">
            <span class="dot ${g.tone === 'red' ? 'red' : g.tone === 'amber' ? 'amber' : ''}"
                  style="margin-top:6px;"></span>
            <span style="flex:1;min-width:0;">
              <button class="link-inline" style="color:var(--ink);font-weight:600;display:block;text-align:left;"
                onclick="Danubra.go('tasks')">${UI.esc(t.title || 'Úloha')}</button>
              <span style="color:var(--ink-mute);font-size:12.5px;display:block;">
                ${t.due_date ? UI.date(t.due_date) : 'bez termínu'}
              </span>
              ${Danubra.canOpen(t.entity_type, t.entity_id) ? `<span class="link-row" style="margin-top:6px;">
                ${Danubra.link(t.entity_type, t.entity_id, t.entity_label)}</span>` : ''}
            </span>
          </div>`).join('')}`).join('')
        : `<div style="color:var(--ink-mute);font-size:13px;padding:8px 2px;">
             Žiadna úloha na dnes ani na tento týždeň.
           </div>`}
      ${rest > 0 ? `<div style="color:var(--ink-mute);font-size:12.5px;padding:8px 2px 0;">
        a ${rest} ${Shell.plural(rest, 'ďalšia neskôr', 'ďalšie neskôr', 'ďalších neskôr')}</div>` : ''}
    </div>`;
  },

  /** „Bude na výplaty?" — otázka, ktorá sa inak rieši pocitom. */
  _dashCashHtml(x) {
    const f = x.forecast, s = x.scale;
    const tone = s.reasons.length ? 'red' : (s.warnings.length ? 'amber' : 'green');
    const verdict = s.reasons.length
      ? 'Ďalších ľudí zatiaľ neber'
      : (s.warnings.length ? 'Vyjde to, ale tesne' : 'Na výplaty aj na ďalších ľudí to vyjde');

    return `<div class="card card-pad">
      <div class="card-head">
        <div class="card-title">Bude na výplaty?</div>
        ${UI.badge(verdict, tone)}
      </div>
      <div class="kv" style="margin:0 0 10px;">
        <div><span>Na účte dnes</span><strong>${Money.format(f.startBalance)}</strong></div>
        <div><span>Najnižší bod (8 týždňov)</span><strong style="${f.lowest.balance < 0 ? 'color:var(--red);' : ''}">${
          Money.format(f.lowest.balance)}</strong></div>
        <div><span>Po splatnosti čaká</span><strong>${Money.format(f.overdue.in)}</strong></div>
        <div><span>O osem týždňov</span><strong>${Money.format(f.endBalance)}</strong></div>
      </div>
      ${[...s.reasons, ...s.warnings].slice(0, 3).map(r => `
        <div class="list-row" style="cursor:default;align-items:flex-start;">
          <span class="dot ${r.severity === 'block' ? 'red' : 'amber'}" style="margin-top:5px;"></span>
          <span style="flex:1;font-size:12.5px;"><strong>${UI.esc(r.label)}</strong>
            <span style="color:var(--ink-mute);display:block;">${UI.esc(r.detail || '')}</span></span>
        </div>`).join('')}
      <button class="btn btn-outline btn-sm" style="margin-top:10px;"
        onclick="Danubra.go('bank')">Celý výhľad</button>
    </div>`;
  },

  /** „Zarábame na tom?" — fakturované mínus to, čo sa na to minulo. */
  _dashMarginHtml(x) {
    const e = x.econ;
    return `<div class="card card-pad">
      <div class="card-head">
        <div class="card-title">Zarábame na tom?</div>
        ${e.marginPct != null ? UI.badge(`marža ${UI.pct(e.marginPct)}`,
          e.marginPct >= 15 ? 'green' : (e.marginPct >= 8 ? 'amber' : 'red')) : ''}
      </div>
      <div class="kv" style="margin:0;">
        <div><span>Vyfakturované odberateľom</span><strong>${Money.format(e.invoiced)}</strong></div>
        <div><span>Faktúry od živnostníkov</span><strong>−${Money.format(e.bills)}</strong></div>
        <div><span>Ostatné náklady</span><strong>−${Money.format(e.costs)}</strong></div>
        <div><span>Zostáva</span><strong style="${e.margin < 0 ? 'color:var(--red);' : ''}">${
          Money.format(e.margin)}</strong></div>
      </div>
      <p style="margin:10px 0 0;font-size:12.5px;color:var(--ink-mute);">
        Za celé obdobie. Sporné prijaté faktúry sa sem nerátajú${
          x.billsDisputed.length ? ` (${x.billsDisputed.length} ${
            Shell.plural(x.billsDisputed.length, 'je sporná', 'sú sporné', 'je sporných')})` : ''}.
        ${e.withheld ? `Zrážka §48b ${Money.format(e.withheld)} je vo fakturovanom, na účet nepríde.` : ''}
      </p>
    </div>`;
  },

  // ── VIEWS ────────────────────────────────────────────────────────────────
  views: {
    async dashboard(view) {
      const today = new Date().toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
      const datum = UI.esc(today.charAt(0).toUpperCase() + today.slice(1));
      view.innerHTML = this.header('Prehľad', datum) + UI.loading();

      if (this.area === 'accommodation') return this._dashAccommodation(view, datum);

      const x = await this._dashLoad();

      // Odznaky v navigácii sa napĺňajú tu — prehľad je jediná obrazovka,
      // ktorá vidí naraz na všetko.
      const tc = DanubraTasks.counts(x.tasks, x.today);
      this.badges = {
        tasks: tc.overdue + tc.today,
        invoices: x.invApprove.length + x.invOverdue.length,
        costs: x.billsToCheck.length + x.billsDisputed.length,
        workers: x.docsExpired.length,
        candidates: x.candWaiting.length,
        subcontracts: x.periodsDue.length,
      };
      this._buildNav();

      // Prvá veta na obrazovke. Nie graf, nie číslo — veta.
      const head = DanubraTasks.headline(x.tasks, x.today);
      const alerts = this._dashAlerts(x);
      const line = alerts.length && head.tone === 'ok'
        ? { tone: 'warn', text: `Úlohy sú vybavené, ale ${alerts.length} ${
            Shell.plural(alerts.length, 'vec potrebuje', 'veci potrebujú', 'vecí potrebuje')} pozornosť.` }
        : head;

      const kpis = [
        ['Ľudia na stavbách', x.deployed,
          `${x.sites.length} ${Shell.plural(x.sites.length, 'zákazka', 'zákazky', 'zákaziek')}${
            x.crewsOut ? ` · ${x.crewsOut} ${Shell.plural(x.crewsOut, 'partia', 'partie', 'partií')}` : ''}`, ''],
        ['Nezúčtované hodiny', Math.round(x.hoursOpen),
          x.hoursOpen ? 'čakajú na uzavretie obdobia' : 'všetko zúčtované', x.periodsDue.length ? 'warn' : ''],
        ['Faktúry na schválenie', x.invApprove.length,
          x.invApprove.length ? 'bez schválenia neodídu' : 'žiadne', x.invApprove.length ? 'warn' : ''],
        ['Po splatnosti', x.invOverdue.length,
          x.invOverdue.length ? 'urgovať' : 'v poriadku', x.invOverdue.length ? 'warn' : 'up'],
        ['Doklady po platnosti', x.docsExpired.length,
          x.docsExpiring.length ? `${x.docsExpiring.length} sa blíži ku koncu` : 'všetko platí',
          x.docsExpired.length ? 'warn' : 'up'],
        ['Treba dobrať ľudí', x.needPeople,
          `${x.plansActive} ${Shell.plural(x.plansActive, 'bežiaci nábor', 'bežiace nábory', 'bežiacich náborov')}`,
          x.needPeople ? 'warn' : ''],
      ];

      view.innerHTML =
        this.header('Prehľad', `${datum} · ${x.deployed} ${
          Shell.plural(x.deployed, 'človek na stavbách', 'ľudia na stavbách', 'ľudí na stavbách')}`) + `
        <div class="headline headline-${line.tone === 'bad' ? 'bad' : line.tone === 'warn' ? 'warn' : 'ok'}">
          ${Icon(line.tone === 'bad' ? 'alert' : line.tone === 'warn' ? 'clock' : 'check', 18)}
          <span>${UI.esc(line.text)}</span>
        </div>
        <div class="kpi-grid">
          ${kpis.map(([l, v, d, k]) => `
            <div class="kpi">
              <div class="kpi-label">${l}</div>
              <div class="kpi-value">${v}</div>
              <div class="kpi-delta ${k}">${d}</div>
            </div>`).join('')}
        </div>
        <div class="form-section">Peniaze</div>
        <div class="profile-cols">
          ${this._dashMoneyCard(x)}
          ${this._dashWeeksCard(x)}
          ${this._dashProfitCard(x)}
          ${this._dashTiedCard(x)}
          ${this._dashCashHtml(x)}
          ${this._dashMarginHtml(x)}
        </div>

        <div class="form-section">Práca a ľudia</div>
        <div class="profile-cols">
          ${this._dashOrderBookCard(x)}
          ${this._dashHiringCard(x)}
        </div>

        <div class="form-section">Čo dnes treba spraviť</div>
        <div class="panels">
          ${this._dashTasksHtml(x)}
          ${this._dashAlertsHtml(alerts)}
          <div class="card card-pad">
            <div class="card-head"><div class="card-title">Rýchle akcie</div></div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <button class="btn btn-primary" style="justify-content:flex-start;" onclick="Guide.startCall()">${Icon('phone')} Zdvihol som telefón</button>
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Danubra.go('timesheets')">${Icon('clock')} Zapísať hodiny</button>
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Danubra.go('quotes')">${Icon('offers')} Nová ponuka odberateľovi</button>
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Danubra.go('bank')">${Icon('upload')} Načítať výpis z účtu</button>
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Hire.wizard()">${Icon('zap')} Nový nábor</button>
              <button class="btn btn-outline" style="justify-content:flex-start;" onclick="Danubra.go('compliance')">${Icon('shield')} Compliance pred nasadením</button>
            </div>
          </div>
        </div>`;
    },
  },

  // ── Prehľad archivovanej ubytovacej agendy ───────────────────────────────
  // Zostáva tak, ako bol. Agenda je vypnutá príznakom, nie zmazaná (R4), a keď
  // sa zapne, má dávať zmysel to isté, čo dávalo predtým.
  async _dashAccommodation(view, datum) {
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

    const kpis = [
      ['Nové dopyty', inqNew, inqNew ? 'čakajú na reakciu' : 'všetko vybavené', inqNew ? 'warn' : ''],
      ['Prebiehajúce pobyty', active, 'ubytovanie', ''],
      ['Ľudia vonku', deployed, `${subsActive} ${subsActive === 1 ? 'zákazka' : 'zákaziek'}`, ''],
      ['Ubytovania v DB', acc, 'databáza', ''],
      ['Faktúry na schválenie', invDraft, invDraft ? 'vyžaduje potvrdenie' : 'žiadne', invDraft ? 'warn' : ''],
      ['Po splatnosti', invOverdue, invOverdue ? 'urgovať' : 'v poriadku', invOverdue ? 'warn' : 'up'],
    ];

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
      this.header('Prehľad', `${datum} · ${active} ${
        active === 1 ? 'prebiehajúci pobyt' : 'prebiehajúce pobyty'}`) + `
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
};

// ── Štart ───────────────────────────────────────────────────────────────────
// Prihlasovacia obrazovka aj samotná appka sú v HTML skryté a odkrýva ich až
// `_render()`. Keď sa dovtedy čokoľvek pokazí, stránka zostane **úplne biela
// a bez hlášky** — človek nevie, či sa načítava, či je rozbitá, ani čo má
// spraviť. Stalo sa to v prevádzke, keď sa nenačítal klient Supabase z cudzieho
// CDN.
//
// Preto sa štart zabalí a každé zlyhanie sa ukáže po ľudsky.
function danubraFatal(what, detail) {
  const box = document.createElement('div');
  box.className = 'fatal';
  box.innerHTML = `
    <div class="fatal-card">
      <h1>Aplikácia sa nespustila</h1>
      <p>${what}</p>
      ${detail ? `<pre>${String(detail).slice(0, 400)
        .replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>` : ''}
      <p class="fatal-what">Skús stránku načítať znova. Ak to nepomôže,
         pošli mi text vyššie — je v ňom napísané, čo sa pokazilo.</p>
      <button onclick="location.reload()">Načítať znova</button>
    </div>`;
  document.body.appendChild(box);
}

document.addEventListener('DOMContentLoaded', () => {
  // Bez klienta Supabase sa nedá ani prihlásiť. Toto je presne ten prípad,
  // keď appka predtým zostala biela.
  if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
    return danubraFatal(
      'Nenačítala sa knižnica, cez ktorú appka hovorí s databázou.',
      'Chýba supabase-js. Skontroluj, či sa stiahol súbor '
      + 'vendor/supabase-js-2.116.0.js — mohol ho zablokovať blokátor reklám '
      + 'alebo sieť.');
  }

  Promise.resolve()
    .then(() => Danubra.init())
    .catch((e) => {
      console.error('[danubra] štart zlyhal', e);
      danubraFatal('Pri spúšťaní nastala chyba.', e && (e.message || e));
    });
});
