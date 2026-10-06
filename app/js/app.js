// ============================================================================
// DANUBRA — app bootstrap, auth gate, navigácia, router
// ============================================================================
// Hlavný biznis je posielanie slovenských živnostníkov na nemecké stavby.
//
// Sprostredkovanie ubytovania bolo v v1 druhá agenda. Od v2 bola vypnutá
// príznakom a teraz je z appky preč celá: nebolo sa jej kto venovať a držala
// v menu päť položiek, ktoré nikam neviedli. **Tabuľky ani dáta sa nemazali**
// — appka sa na ne len neodkazuje, takže sa z nich dá kedykoľvek čítať.
//
// Databáza ubytovaní zostáva: nie je to obchod, ale náklad zákazky a údaj,
// ktorý potrebuje infolist na stavbu (rozhodnutie R4).
// ============================================================================
window.Danubra = {
  user: null,
  route: 'dashboard',

  // Agendy. Ubytovacia tu bola od v1 a bola vypnutá príznakom; teraz je preč
  // celá — nebolo sa jej kto venovať a držala v menu päť položiek, ktoré
  // nikam neviedli. Tabuľky ani dáta sa nemažú, len sa na ne appka
  // neodkazuje.
  //
  // Ubytovania zostávajú: nie sú obchod, ale **náklad zákazky** a berie ich
  // infolist na stavbu.
  areas: [
    ['staffing', 'Nábor a stavby', 'workers'],
  ],
  area: 'staffing',
  areaTitle(key) { const a = this.areas.find(x => x[0] === key); return a ? a[1] : 'Spoločné'; },

  // ── Zapnuté moduly ───────────────────────────────────────────────────────
  // Predvolené hodnoty sedia s tým, čo migrácia 013 zapísala do databázy,
  // aby navigácia vyzerala správne už pri prvom vykreslení a neposkočila,
  // keď dobehne dotaz.
  modules: { recruiting: true, contracts: true, finance: true },

  /** Je modul zapnutý? Položka bez modulu je zapnutá vždy. */
  moduleOn(key) { return key == null || this.modules[key] !== false; },

  /** Modul, ktorý danú položku zapína. Nezapísaný znamená „vždy". */
  moduleOf(item) {
    return item[4] !== undefined ? item[4] : null;
  },

  async _loadModules() {
    try {
      const { data } = await DB.list('settings', { select: 'modules', limit: 1 });
      const m = data && data[0] && data[0].modules;
      if (m && typeof m === 'object') this.modules = { ...this.modules, ...m };
    } catch {
      // Bez nastavení sa appka nezasekne — zostanú predvolené moduly.
    }
    await this._loadMembers();
  },

  // ── Kto som a na čo mám ───────────────────────────────────────────────────
  // Skrývanie v menu **nie je ochrana** — tá je v databáze (migrácia 030).
  // Toto je o tom, aby človek nevidel obrazovky, na ktoré aj tak nemá.
  members: [], me: null,

  async _loadMembers() {
    try {
      const { data } = await DB.list('members', {
        select: 'id,user_id,email,full_name,role,modules,active', limit: 200 });
      this.members = data || [];
      const uid = this.user && this.user.id;
      this.me = this.members.find(m => m.user_id === uid) || null;
    } catch {
      // Keď sa zoznam nenačíta, appka sa nezamkne — ochranu drží databáza.
      this.members = []; this.me = null;
    }
  },

  /** Smiem na túto obrazovku alebo právomoc? */
  can(key) {
    if (!window.DanubraPerm) return true;
    return DanubraPerm.can(this.me, key, this.members);
  },
  isAdmin() {
    return !window.DanubraPerm || DanubraPerm.isAdmin(this.me, this.members);
  },

  /** Agendy, ktoré sa majú zobraziť. Agenda vypnutého modulu zmizne celá. */
  visibleAreas() { return this.areas.filter(([key]) => this.moduleOn(key)); },

  // Navigácia. Položka bez oblasti je spoločná pre všetky agendy.
  // [key, label, ikona, oblasť?, modul?]
  // Modul sa dá zapísať piatym prvkom; `null` znamená „nikdy sa neskrýva".
  navGroups: [
    ['PREHĽAD',    [['dashboard', 'Prehľad', 'dashboard'], ['flow', 'Ako to ide', 'repeat'],
                    ['tasks', 'Úlohy a pripomienky', 'tasks'],
                    ['messages', 'Správy', 'mail']]],
    ['ZÁKAZKY',    [['quotes', 'Ponuky', 'offers', 'staffing', 'contracts'],
                    ['orders', 'Objednávky', 'orders', 'staffing', 'contracts'],
                    ['contracts', 'Zmluvy', 'note', 'staffing', 'contracts'],
                    ['subcontracts', 'Zákazky', 'site', 'staffing', 'contracts'],
                    ['timesheets', 'Odpracované hodiny', 'clock', 'staffing', 'contracts'],
                    ['hoursheet', 'Výkaz pre odberateľa', 'doc', 'staffing', 'contracts']]],
    // Nábor bol rozsypaný na šesť položiek a kto naberal, musel vedieť, na
    // ktorej má byť. „Nábor" je teraz vstup: čo treba teraz, čo beží, koho
    // hľadám — a odtiaľ sa chodí na zvyšok.
    ['ĽUDIA',      [['hiring', 'Nábor', 'zap', 'staffing', 'recruiting'],
                    ['candidates', 'Kandidáti', 'user', 'staffing', 'recruiting'],
                    ['ads', 'Inzeráty', 'marketing', 'staffing', 'recruiting'],
                    ['workers', 'Živnostníci', 'workers', 'staffing', null],
                    ['crews', 'Partie', 'workers', 'staffing', null],
                    ['trades', 'Remeslá a otázky', 'wrench', 'staffing', 'recruiting'],
                    ['recruiting', 'Zápisy z hovorov', 'note', 'staffing', 'recruiting']]],
    // Ubytovania sú bez agendy zámerne — po archivácii obchodnej časti
    // zostávajú dostupné ako náklad zákazky (R4).
    ['DATABÁZA',   [['partners', 'Odberatelia v Nemecku', 'clients', 'staffing', null],
                    ['accommodations', 'Ubytovania', 'bed', undefined, null]]],
    // „Náklady" sa volali Náklady, hoci prvá záložka na nich sú **prijaté
    // faktúry**. Kto ich hľadal podľa mena, nenašiel ich — názov v menu
    // o nich nehovoril nič.
    ['PENIAZE',    [['money', 'Kde sú peniaze', 'wallet', 'staffing', 'finance'],
                    ['invoices', 'Vydané faktúry', 'invoices', 'staffing', 'finance'],
                    ['costs', 'Prijaté faktúry a náklady', 'receipt', 'staffing', 'finance'],
                    ['bank', 'Banka a cash-flow', 'invoices', 'staffing', 'finance']]],
    ['RAST',       [['marketing', 'Marketing', 'marketing']]],
    ['SYSTÉM',     [['compliance', 'Compliance', 'shield', 'staffing', null],
                    ['members', 'Používatelia', 'clients'],
                    ['rules', 'Cenník a pravidlá', 'rules'],
                    ['settings', 'Nastavenia', 'settings']]],
  ],

  // ── Čo ktorá obrazovka robí ──────────────────────────────────────────────
  // Jedna veta ku každej položke. Ukazuje sa v mega menu, aby človek, ktorý
  // appku nepostavil, nemusel hádať, čo sa pod názvom skrýva.
  navHints: {
    dashboard: 'Čo dnes treba spraviť, či bude na výplaty a či sa na tom zarába',
    flow: 'Celá cesta od telefonátu po peniaze — a kde sa to práve zastavilo',
    money: 'Kde stoja naše peniaze a koľko sa z nich dá minúť a dokedy',
    tasks: 'Všetky úlohy a pripomienky na jednom mieste',
    messages: 'Komunikácia pri zázname, ktorého sa týka',
    quotes: 'Ponuky odberateľom — marža je vidieť skôr, než ponuka odíde',
    orders: 'Čo si objednal odberateľ a čo sme objednali u živnostníka',
    contracts: 'Zmluvy o dielo a dodatky. Dohodnuté podmienky sa neprepisujú',
    subcontracts: 'Konkrétne stavby: kto tam je, koľko odrobil, čo sa fakturuje',
    timesheets: 'Odpracované hodiny — z nich vzniká podklad na faktúru',
    hoursheet: 'Stundennachweis: týždenný papier, ktorý podpisuje odberateľ',
    ads: 'Na čo ľudia volajú a čo sme im v tom sľúbili',
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
    members: 'Kto smie do appky a na čo',
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
    ad:         { route: 'ads',          handle: 'Ads',   ico: 'marketing', what: 'Inzerát' },
    quote:      { route: 'quotes',       handle: 'Quo',   ico: 'offers',    what: 'Ponuka' },
    contract:   { route: 'contracts',    handle: 'Con',   ico: 'note',      what: 'Zmluva' },
    // Úloha nemá „detail" — otvára sa rovno formulár, v ktorom sa dá upraviť.
    task:       { route: 'tasks',        handle: 'Tsk',   ico: 'tasks',     what: 'Úloha', method: 'form' },
    accommodation: { route: 'accommodations', handle: 'Acc', ico: 'bed',    what: 'Ubytovanie' },
    order:      { route: 'orders',       handle: 'Ord',   ico: 'orders',    what: 'Objednávka' },
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
    return !!it && this.moduleOn(this.moduleOf(it)) && this.can(key);
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
  labelOf(key) { const n = this.allNav().find(x => x[0] === key); return n ? n[1] : 'Prehľad'; },

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
    for (const id of ['btn-help', 'btn-help-m']) {
      const h = document.getElementById(id); if (h) h.innerHTML = Icon('help', 18);
    }
    this._buildNav();
    this._render();
    window.addEventListener('hashchange', () => this._syncRoute());
    this._syncRoute();
    // Zvonček sa napĺňa až po zvyšku — obrazovka nemá na čo čakať.
    this.loadEvents();
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
    this.loadEvents(true);
  },

  async logout() {
    await DB.signOut();
    this.user = null;
    // Udalosti sú o dátach, ku ktorým už odhlásený človek nemá prístup.
    this.events = []; this.eventsAt = 0; this.bellOpen = false;
    this.renderBell();
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
      accommodations: () => Acc.form(), workers: () => Wrk.form(),
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
  //
  // Vysvetlivka sa pripája sama podľa obrazovky. Tým ju má každý modul, bez
  // toho aby sa o ňu musel starať — a nová obrazovka ju dostane tým, že sa
  // k nej dopíše text.
  header(title, sub, right, trail, lead) {
    const help = window.Help ? Help.btn(`screen.${this.route}`, { size: 15 }) : '';
    return `<div class="page-head">
      <div style="min-width:0;">
        ${this.crumbs(trail)}
        <div class="page-title-row">
          ${lead || ''}
          <div style="min-width:0;">
            <h1 class="page-title">${UI.esc(title)}${help}</h1>
            ${sub ? `<div class="page-sub">${sub}</div>` : ''}
          </div>
        </div>
      </div>
      ${right || ''}
    </div>`;
  },

  setActions(html) {
    const el = document.getElementById('topbar-actions');
    if (el) el.innerHTML = html || '';
  },

  // ── Zvonček: čo sa stalo ───────────────────────────────────────────────────
  // Prehľad odpovedá na „čo mám robiť". Zvonček odpovedá na inú otázku — „čo
  // sa stalo, kým som sa nepozeral". Preto je v hornom pruhu, viditeľný
  // z každej obrazovky, nie zakopaný v prehľade.
  //
  // Čítanie sa drží v prehliadači, nie v databáze. Je to údaj o tom, čo videl
  // tento človek na tomto zariadení — do spoločnej tabuľky nepatrí a nemá
  // zmysel kvôli nemu robiť zápis pri každom otvorení.

  events: [],
  eventsAt: 0,
  bellOpen: false,
  _seenKey: 'danubra_events_seen',

  _lastSeen() { try { return localStorage.getItem(this._seenKey) || ''; } catch { return ''; } },

  /**
   * Načíta udalosti. Sedem malých dotazov, výsledok drží dve minúty — zvonček
   * sa otvára často a nemá zmysel pri každom kliknutí ťahať to isté.
   */
  async loadEvents(force) {
    if (!this.user) return;
    if (!force && this.eventsAt && Date.now() - this.eventsAt < 120000) return;
    // Aby sa dva kliky za sebou nepretekali.
    if (this._eventsLoading) return this._eventsLoading;
    this._eventsLoading = (async () => {
      const [docs, inv, bills, per, cands, tx, tasks, wrk, prt, subs] = await Promise.all([
        DB.list('v_worker_documents', {
          select: 'id,worker_id,worker_name,kind,validity,days_left,valid_to', limit: 500 }),
        DB.list('invoices', {
          select: 'id,invoice_number,status,issue_date,due_date,paid_at,partner_id', limit: 300 }),
        DB.list('bills', { select: 'id,worker_id,status,issue_date,note', limit: 300 }),
        DB.list('periods', { select: 'id,subcontract_id,period_to,status', limit: 200 }),
        DB.list('candidates', { select: 'id,status,full_name,created_at,first_contact_at', limit: 200 }),
        DB.list('bank_transactions', { select: 'id,match_status,booked_at', limit: 500 }),
        DB.list('v_today', { limit: 100 }),
        DB.list('workers', { select: 'id,full_name', limit: 500 }),
        DB.list('partners', { select: 'id,name', limit: 200 }),
        DB.list('subcontracts', { select: 'id,title', limit: 300 }),
      ]);
      const S = (r) => (r && r.data) || [];
      const lookup = (rows, key) => {
        const m = new Map(rows.map(r => [r.id, r[key]]));
        return (id) => m.get(id) || null;
      };
      this.events = DanubraEvents.build({
        today: this._dayISO(),
        docs: S(docs), invoices: S(inv), bills: S(bills), periods: S(per),
        candidates: S(cands), transactions: S(tx), tasks: S(tasks),
        workerName: lookup(S(wrk), 'full_name'),
        partnerName: lookup(S(prt), 'name'),
        siteName: lookup(S(subs), 'title'),
      });
      this.eventsAt = Date.now();
      this.renderBell();
    })().catch((e) => {
      // Zvonček nie je dôvod, aby sa rozsypala obrazovka. Keď sa nenačíta,
      // zostane tichý a v konzole je napísané prečo.
      console.error('[danubra] udalosti sa nenačítali', e);
    }).finally(() => { this._eventsLoading = null; });
    return this._eventsLoading;
  },

  renderBell() {
    const unseen = window.DanubraEvents
      ? DanubraEvents.unseen(this.events, this._lastSeen()) : 0;
    const html = this.events.length || this.bellOpen ? this._bellHtml(unseen) : '';
    for (const id of ['bell-slot', 'bell-slot-m']) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    }
  },

  _bellHtml(unseen) {
    return `<button class="bell-btn${unseen ? ' has-new' : ''}"
        onclick="Danubra.toggleBell()" aria-expanded="${this.bellOpen ? 'true' : 'false'}"
        aria-label="Udalosti${unseen ? ` — ${unseen} ${Shell.plural(unseen, 'nová', 'nové', 'nových')}` : ''}"
        title="Čo sa stalo">
        ${Icon('bell', 18)}
        ${unseen ? `<span class="bell-count">${unseen > 9 ? '9+' : unseen}</span>` : ''}
      </button>
      ${this.bellOpen ? this._bellPanel(unseen) : ''}`;
  },

  _bellPanel(unseen) {
    const seen = this._lastSeen();
    const ev = this.events;
    const rows = ev.map((e, i) => {
      const isNew = !seen || String(e.date || '') > seen;
      return `<button class="ev-row${isNew ? ' is-new' : ''}" onclick="Danubra.openEvent(${i})">
        <span class="ev-ico ev-${e.tone}">${Icon(Icon.has(e.icon) ? e.icon : 'clock', 14)}</span>
        <span class="ev-text">
          <span class="ev-title">${UI.esc(e.title)}</span>
          ${e.detail ? `<span class="ev-detail">${UI.esc(e.detail)}</span>` : ''}
        </span>
        <span class="ev-when">${UI.esc(this._ago(e.date))}</span>
      </button>`;
    }).join('');

    return `<div class="bell-panel" role="dialog" aria-label="Udalosti">
      <div class="bell-head">
        <strong>Čo sa stalo</strong>
        ${Help.btn('dash.events', { size: 13 })}
        ${ev.length ? `<span class="bell-of">${ev.length} ${
          Shell.plural(ev.length, 'udalosť', 'udalosti', 'udalostí')}${
          unseen ? `, ${unseen} ${Shell.plural(unseen, 'nová', 'nové', 'nových')}` : ''}</span>` : ''}
        ${unseen ? `<button class="link-inline" onclick="Danubra.markEventsSeen()">Všetko prečítané</button>` : ''}
      </div>
      <div class="bell-list">
        ${rows || `<div class="bell-empty">${Icon('check', 18)}
          <span>Nič nové. Doklady platia, faktúry sú vybavené, banka sedí.</span></div>`}
      </div>
      <div class="bell-foot">
        <button class="btn btn-ghost btn-sm" onclick="Danubra.toggleBell(false);Danubra.go('tasks')">
          ${Icon('tasks', 14)} Úlohy</button>
        <button class="btn btn-ghost btn-sm" onclick="Danubra.loadEvents(true)">
          ${Icon('repeat', 14)} Načítať znova</button>
      </div>
    </div>`;
  },

  /** „dnes", „včera", „pred 3 dňami", inak dátum. Pri udalosti je to čitateľnejšie. */
  _ago(date) {
    const d = date ? String(date).slice(0, 10) : '';
    if (!d) return '';
    const t = this._dayISO();
    const diff = Math.round(
      (Date.parse(t + 'T00:00:00Z') - Date.parse(d + 'T00:00:00Z')) / 86400000);
    if (!Number.isFinite(diff)) return '';
    if (diff === 0) return 'dnes';
    if (diff === 1) return 'včera';
    if (diff > 1 && diff <= 6) return `pred ${diff} dňami`;
    if (diff === -1) return 'zajtra';
    if (diff < -1 && diff >= -6) return `za ${-diff} dní`;
    return UI.date(d);
  },

  toggleBell(force) {
    const open = force != null ? force : !this.bellOpen;
    this.bellOpen = open;
    if (open) {
      this.loadEvents();
      this._bellAway = this._bellAway || ((e) => {
        if (!e.target.closest('.bell-wrap')) this.toggleBell(false);
      });
      this._bellEsc = this._bellEsc || ((e) => { if (e.key === 'Escape') this.toggleBell(false); });
      // O tik neskôr, inak by ten istý klik, ktorý zvonček otvoril, hneď
      // dobehol k dokumentu a zavrel ho.
      setTimeout(() => document.addEventListener('click', this._bellAway), 0);
      document.addEventListener('keydown', this._bellEsc);
    } else {
      if (this._bellAway) document.removeEventListener('click', this._bellAway);
      if (this._bellEsc) document.removeEventListener('keydown', this._bellEsc);
    }
    this.renderBell();
  },

  /** Prečítané = všetko, čo je v zozname teraz. Nič sa tým nemaže. */
  markEventsSeen() {
    const top = this.events.reduce(
      (m, e) => (String(e.date || '') > m ? String(e.date).slice(0, 10) : m), '');
    try { localStorage.setItem(this._seenKey, top || this._dayISO()); } catch {}
    this.renderBell();
  },

  /** Klik na udalosť vedie tam, kde sa to rieši — nie na zoznam „všetkého". */
  openEvent(i) {
    const e = this.events[Number(i)];
    if (!e) return;
    this.markEventsSeen();
    this.toggleBell(false);
    if (this.canOpen(e.type, e.entityId)) return this.open(e.type, e.entityId);
    if (e.route && this.routeAvailable(e.route)) return this.go(e.route);
    const ent = this.entities[e.type];
    if (ent && this.routeAvailable(ent.route)) return this.go(ent.route);
    UI.toast('Túto udalosť nie je kam otvoriť.', 'err');
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
      wrk, prt, scAll, asgAll, tsAll, quotesAll, demo, trd] = await Promise.all([
      DB.list('v_today', { limit: 200 }),
      DB.list('v_subcontract_status', { limit: 200 }),
      DB.list('periods', { select: 'id,subcontract_id,period_from,period_to,status', limit: 300 }),
      DB.list('invoices', {
        // `subcontract_id` je tu kvôli filtru podľa zákazky. Bez neho sa
        // porovnávalo `undefined === id`, takže po výbere zákazky zmizli
        // z prehľadu všetky faktúry a peniaze padli na nulu.
        select: 'id,invoice_number,total,amount_net,withholding_amount,status,due_date,partner_id,subcontract_id',
        limit: 500,
      }),
      DB.list('bills', { select: 'id,bill_number,amount,status,due_date,worker_id,subcontract_id', limit: 500 }),
      // `rebillable` a `rebilled_invoice_id` sú tu kvôli otázke „koľko nám
      // viazne v ubytovaní" — bez nich sa nedá rozlíšiť náš výdavok od
      // peňazí, ktoré sa vrátia.
      DB.list('costs', {
        select: 'id,amount,cost_date,category,subcontract_id,rebillable,rebilled_invoice_id',
        limit: 1000 }),
      DB.list('v_worker_documents', {
        // `kind`, nie `doc_type` — pohľad preberá stĺpce z danubra_worker_documents.
        select: 'id,worker_id,worker_name,kind,validity,days_left,valid_to', limit: 1000,
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
      // Ponuka nemá stĺpec `total` — suma sa ráta zo sadzby a hodín.
      DB.list('v_quote_margin', {
        select: 'id,status,charge_rate,hours_per_month,headcount,margin_per_month,partner_name,valid_until',
        limit: 200 }),
      DB.list('demo_ledger', { select: 'seq', limit: 1000 }),
      // Názvy remesiel. Bez nich by v detaile náboru svietil kľúč
      // `trockenbau` namiesto „Sadrokartón".
      DB.list('trades', { select: 'key,name_sk', limit: 100 }),
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

    // ── Filter ────────────────────────────────────────────────────────────
    // Obdobie sa uplatní na to, čo sa **stalo** (hodiny, faktúry, náklady).
    // Na to, ako to vyzerá **teraz** (čakáme na účet, viazne, treba dobrať),
    // obdobie nesadá — to nie je vec mesiaca, ale stavu.
    const periodRange = this._dashRange(d);
    const siteId = this.dashFilter.site || null;
    const partnerId = this.dashFilter.partner || null;
    // Odberateľ sa prejaví cez jeho zákazky — faktúra má odberateľa aj sama,
    // ale hodiny a náklady ho poznajú len cez zákazku.
    const partnerSites = new Set(subcontracts
      .filter(s => !partnerId || s.partner_id === partnerId).map(s => s.id));
    const onSite = (row, field = 'subcontract_id') =>
      (!siteId || row[field] === siteId)
      && (!partnerId || partnerSites.has(row[field]));

    const asgIds = new Set(assignments.filter(a => onSite(a)).map(a => a.id));
    const tsFiltered = DanubraPeriod.filter(
      timesheets.filter(t => asgIds.has(t.assignment_id) || (!siteId && !partnerId)),
      periodRange, 'work_date');
    // Faktúra sa k odberateľovi viaže priamo — netreba ísť cez zákazku.
    const invFiltered = invoices.filter(i =>
      (!siteId || i.subcontract_id === siteId)
      && (!partnerId || i.partner_id === partnerId));
    const billsFiltered = billsAll.filter(onSite);
    const costsFiltered = allCosts.filter(onSite);
    const subsFiltered = subcontracts.filter(s =>
      (!siteId || s.id === siteId) && (!partnerId || s.partner_id === partnerId));

    const receivable = DanubraOutlook.receivable(invFiltered, d);
    const unbilled = DanubraOutlook.unbilled({
      subcontracts, assignments, timesheets: tsFiltered });
    const tied = DanubraOutlook.tied(costsFiltered);
    const book = DanubraOutlook.orderBook({
      today: d, subcontracts: subsFiltered, assignments });
    // Doklad sa k zákazke neviaže — viaže sa k človeku. Pri vybranej zákazke
    // sú teda „jej" doklady tie, ktoré patria ľuďom na nej nasadeným.
    const workersHere = new Set(assignments.filter(a => onSite(a)).map(a => a.worker_id));
    const docsFiltered = (siteId || this.dashFilter.partner)
      ? documents.filter(x2 => workersHere.has(x2.worker_id)) : documents;

    const plansFiltered = S(plans).filter(p =>
      (!siteId || p.subcontract_id === siteId)
      && (!partnerId || !p.subcontract_id || partnerSites.has(p.subcontract_id)));
    const hiringNeed = DanubraOutlook.hiring({
      today: d, subcontracts, plans: plansFiltered });
    const profit = DanubraOutlook.expectedProfit({
      subcontracts: subsFiltered, assignments, orderBook: book, unbilled,
      quotes: S(quotesAll),
    });
    const balanceNow = Money.sum(S(tx).map(t => Money.toCents(t.amount)));

    // Celý obraz peňazí naraz. Rezerva je z Nastavení — pod ňou je to tesné,
    // aj keď účet nespadne pod nulu.
    const cash = DanubraOutlook.cashPosition({
      today: d, balance: balanceNow, items: S(cf), weeks: 8,
      unbilled: unbilled.charge, tied: tied.total,
      reserve: Money.toCents((window.Cfg ? Cfg.j('staffing') : {}).cash_buffer_min ?? 5000),
    });

    // Názov remesla. `DanubraDetail` ho dostane ako funkciu, nech knižnica
    // nemusí vedieť nič o tom, odkiaľ sa číselníky berú.
    const tradeMap = new Map(S(trd).map(t => [t.key, t.name_sk]));

    return {
      today: d,
      tasks: S(today),
      workerName, partnerName, siteName,
      // Balík pre dlaždice. Čísla na nich aj zoznamy za nimi sa počítajú
      // z týchto polí — jeden výpočet, nie dva, ktoré sa raz rozídu.
      //
      // Zákazka a odberateľ sem sadajú (keď si vyberieš jednu stavbu, chceš
      // jej čísla), obdobie nie: „doklad po platnosti" nie je vec mesiaca.
      kpiData: {
        today: d,
        subcontracts: subsFiltered,
        assignments,
        timesheets,
        invoices: invFiltered,
        documents: docsFiltered,
        plans: plansFiltered,
        periodsDue: periods.filter(p => p.status === 'open' && p.period_to < d
          && (!siteId || p.subcontract_id === siteId)
          && (!partnerId || partnerSites.has(p.subcontract_id))),
        crewsOut: subsFiltered.reduce((s2, x2) => {
          const v = subsAll.find(y => y.id === x2.id);
          return s2 + Number((v && v.crews) || 0);
        }, 0),
        workerName, partnerName, siteName,
        tradeLabel: (k) => tradeMap.get(k) || k || '',
        docLabel: (k) => (window.Enums ? Enums.label('worker_document', k) : k),
      },
      subcontracts, assignments, timesheets,
      cashflowItems: S(cf),
      balanceNow,
      receivable, unbilled, tied, book, hiringNeed, profit, cash,
      quotes: S(quotesAll),
      period: periodRange,
      siteId,
      siteName2: siteId ? (subcontracts.find(x => x.id === siteId) || {}).title : null,
      invoicesFiltered: invFiltered,
      billsFiltered, costsFiltered,
      demoRows: S(demo).length,
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
      // Ekonomika už rešpektuje filter — „za celý čas" je len jedna z volieb,
      // nie jediná pravda.
      econ: DanubraBills.economics({
        invoices: DanubraPeriod.filter(invFiltered, periodRange, 'issue_date'),
        bills: DanubraPeriod.filter(billsFiltered, periodRange, 'issue_date'),
        costs: DanubraPeriod.filter(costsFiltered, periodRange, 'cost_date'),
      }),
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


  /**
   * Kým sú v systéme vzorové dáta, musí to byť vidieť. Inak sa raz vystaví
   * faktúra vymyslenému odberateľovi.
   */
  _demoBanner(x) {
    if (!x.demoRows) return '';
    return `<div class="warnbox" style="margin-bottom:14px;display:flex;
      align-items:center;gap:12px;flex-wrap:wrap;">
      ${Icon('alert', 14)}
      <span style="flex:1;min-width:220px;">
        <strong>V systéme sú vzorové dáta</strong> — ${x.demoRows} ${
          Shell.plural(x.demoRows, 'záznam', 'záznamy', 'záznamov')}.
        Sú tu preto, aby bolo vidieť, ako appka vyzerá naplnená.
        Keď ideš naostro, vymaž ich; ostrých dát sa to nedotkne.
      </span>
      ${Help.btn('dash.demo')}
      <button class="btn btn-danger btn-sm" onclick="Danubra.purgeDemo()">
        ${Icon('trash', 14)} Vymazať vzorové dáta</button>
    </div>`;
  },

  /**
   * Zmaže vzorové dáta. Maže sa **len** to, čo je v evidencii — preto sa to
   * dá spustiť aj vtedy, keď už v systéme sú ostré záznamy.
   */
  async purgeDemo() {
    const answer = await UI.ask(
      'Vymažú sa všetky vzorové dáta. Ostrých záznamov sa to nedotkne — '
      + 'maže sa len to, čo appka sama vložila.\n\n'
      + 'Napíš VYMAZAŤ a potvrď.');
    if (answer == null) return;
    if (String(answer).trim().toUpperCase() !== 'VYMAZAŤ') {
      return UI.toast('Nič sa nezmazalo — potvrdenie nesedelo.', 'err');
    }
    UI.toast('Mažem…');
    const { data, error } = await DB.rpc('demo_purge', {});
    if (error) return UI.toast('Nepodarilo sa: ' + error.message, 'err');
    const total = (data || []).reduce((n, r) => n + (r.zmazanych || 0), 0);
    UI.toast(`Vzorové dáta zmazané (${total} záznamov).`, 'ok');
    this.renderRoute();
  },

  // ── Prehľad: peniaze ───────────────────────────────────────────────────
  // Koľko týždňov ukazuje výhľad. Drží sa to tu, aby prepnutie prežilo
  // prekreslenie obrazovky.
  dashWeeks: 4,
  setDashWeeks(n) { this.dashWeeks = Number(n) || 4; this.renderRoute(); },

  // ── Rozloženie prehľadu ────────────────────────────────────────────────
  // Každý používa prehľad inak: kto rieši peniaze, chce hore cash-flow; kto
  // naberá ľudí, chce hore nábor. Jedno poradie, ktoré sedí obom, neexistuje.
  //
  // Drží sa to v prehliadači — je to údaj o tom, ako sa pozerá tento človek
  // na tomto zariadení, nie o firme.
  _dashKey: 'danubra_dash_layout',
  _dashPrefs: null,

  dashPrefs() {
    if (!this._dashPrefs) {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(this._dashKey) || 'null'); } catch {}
      this._dashPrefs = DanubraDash.normalize(saved);
    }
    return this._dashPrefs;
  },

  _saveDash(p) {
    this._dashPrefs = p;
    try { localStorage.setItem(this._dashKey, JSON.stringify(p)); } catch {}
  },

  setDashTab(tab) { this._saveDash(DanubraDash.setTab(this.dashPrefs(), tab)); this.renderRoute(); },
  toggleDashCard(key) { this._saveDash(DanubraDash.toggle(this.dashPrefs(), key)); this.renderRoute(); },
  moveDashCard(key, dir) { this._saveDash(DanubraDash.move(this.dashPrefs(), key, dir)); this.renderRoute(); },
  resetDash() { this._saveDash(DanubraDash.reset()); this.renderRoute(); this.editDash(); },

  /** Panel na skladanie: čo je vidieť a v akom poradí. */
  editDash() {
    const p = this.dashPrefs();
    const hid = new Set(p.hidden);
    const block = ([g, label]) => {
      const cards = p.order.map(DanubraDash.byKey).filter(c => c && c.group === g);
      return `<div class="form-section">${UI.esc(label)}</div>
        ${cards.map((c, i) => `
          <div class="dl-row${hid.has(c.key) ? ' is-off' : ''}">
            <label class="dl-check">
              <input type="checkbox" ${hid.has(c.key) ? '' : 'checked'}
                ${c.fixed ? 'disabled' : ''}
                onchange="Danubra.toggleDashCard('${c.key}')">
              <span>${UI.esc(c.title)}${c.fixed ? ' <em>vždy</em>' : ''}</span>
            </label>
            <button class="icon-btn" ${i === 0 ? 'disabled' : ''} aria-label="Vyššie"
              onclick="Danubra.moveDashCard('${c.key}','up');Danubra.editDash()">${Icon('chevron', 13)}</button>
            <button class="icon-btn" ${i === cards.length - 1 ? 'disabled' : ''} aria-label="Nižšie"
              onclick="Danubra.moveDashCard('${c.key}','down');Danubra.editDash()">${Icon('chevron', 13)}</button>
          </div>`).join('')}`;
    };
    UI.modal('Poskladaj si prehľad', `
      <p class="hx-lead" style="margin-bottom:14px;">Odškrtni, čo nepoužívaš, a posuň
        hore to, na čo sa pozeráš prvé. Platí to len pre teba a pre toto zariadenie.</p>
      <div class="dl-list">${DanubraDash.GROUPS.map(block).join('')}</div>
      <div class="modal-actions">
        ${DanubraDash.isCustom(this.dashPrefs())
          ? `<button class="btn btn-ghost" onclick="Danubra.resetDash()">
               ${Icon('repeat', 14)} Vrátiť predvolené</button>` : ''}
        <button class="btn btn-primary" onclick="UI.closeModal()">Hotovo</button>
      </div>`, { wide: true });
  },

  /** Jedna karta podľa kľúča. */
  _dashCard(key, x, alerts) {
    switch (key) {
      case 'cashflow': return this._dashCashflowCard(x);
      case 'money': return this._dashMoneyCard(x);
      case 'weeks': return this._dashWeeksCard(x);
      case 'margin': return this._dashMarginHtml(x);
      case 'profit': return this._dashProfitCard(x);
      case 'tied': return this._dashTiedCard(x);
      case 'cash': return this._dashCashHtml(x);
      case 'book': return this._dashOrderBookCard(x);
      case 'hiring': return this._dashHiringCard(x);
      case 'tasks': return this._dashTasksHtml(x);
      case 'alerts': return this._dashAlertsHtml(alerts);
      case 'actions': return this._dashActionsCard();
      default: return '';
    }
  },

  /**
   * Záložky namiesto dlhého stĺpca. Predtým bolo na prehľade jedenásť kariet
   * pod sebou a na spodné sa nikto nedopozeral — obrazovka, ktorá sa musí
   * skrolovať, sa ráno nepozerá celá.
   *
   * Prvá karta záložky „Peniaze" je cash-flow a ide cez celú šírku: je to
   * jediné číslo, ktoré odpovedá na otázku „ako na tom sme".
   */
  _dashTabsHtml(x, alerts) {
    const prefs = this.dashPrefs();
    const tabs = DanubraDash.tabs(prefs);
    if (!tabs.length) {
      return `${DanubraDash.pinned(prefs).map(c => this._dashCard(c.key, x, alerts)).join('')}
        <div class="card card-pad">Ostatné karty sú skryté.
        <button class="link-inline" onclick="Danubra.editDash()">Vrátiť späť</button></div>`;
    }
    const active = DanubraDash.activeTab(prefs);
    const cards = DanubraDash.inGroup(prefs, active);
    const wide = cards.filter(c => c.wide);
    const rest = cards.filter(c => !c.wide);
    // Karty nad záložkami sú vidieť vždy — cash-flow nie je vec jednej
    // záložky, je to odpoveď na „ako na tom sme".
    const top = DanubraDash.pinned(prefs);

    return `${top.map(c => this._dashCard(c.key, x, alerts)).join('')}
      <div class="dash-tabs no-print">
        <div class="pillbar">
          ${tabs.map(t => `<button class="pill${t.key === active ? ' active' : ''}"
            onclick="Danubra.setDashTab('${t.key}')">${UI.esc(t.label)}<em>${t.count}</em></button>`).join('')}
        </div>
        <button class="btn btn-ghost btn-sm" onclick="Danubra.editDash()"
          title="Vybrať karty a poradie">${Icon('rules', 14)} Poskladať</button>
      </div>
      ${wide.map(c => this._dashCard(c.key, x, alerts)).join('')}
      ${rest.length ? `<div class="panels">
        ${rest.map(c => this._dashCard(c.key, x, alerts)).join('')}
      </div>` : ''}`;
  },

  _dashActionsCard() {
    const act = (fn, ico, label, primary) => `
      <button class="btn ${primary ? 'btn-primary' : 'btn-outline'}"
        style="justify-content:flex-start;" onclick="${fn}">${Icon(ico)} ${label}</button>`;
    return `<div class="card card-pad no-print">
      ${this._cardHead('zap', 'Rýchle akcie', '', '', '', 'card.actions')}
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${act('Guide.startCall()', 'phone', 'Zdvihol som telefón', true)}
        ${act("Danubra.go('timesheets')", 'clock', 'Zapísať hodiny')}
        ${act("Danubra.go('quotes')", 'offers', 'Nová ponuka odberateľovi')}
        ${act("Danubra.go('bank')", 'upload', 'Načítať výpis z účtu')}
        ${act('Hire.wizard()', 'zap', 'Nový nábor')}
        ${act("Danubra.go('compliance')", 'shield', 'Compliance pred nasadením')}
      </div>
    </div>`;
  },

  // Filter prehľadu. „Zarábame na tom?" bez obdobia je otázka bez odpovede —
  // za celý čas to vyzerá inak než za tento mesiac a rozhodnutie sa robí
  // podľa toho druhého.
  dashFilter: { period: 'month', site: '', partner: '', from: '', to: '', onlyIssues: false },
  setDashFilter(key, value) {
    const f = { ...this.dashFilter, [key]: value };
    // Keď človek zadá dátum, obdobie je tým dané. Inak by dátum zadal a nič
    // by sa nestalo, kým si nevšimne, že treba ešte kliknúť na „Od–do".
    if (key === 'from' || key === 'to') f.period = 'custom';
    // Zákazka patrí jednému odberateľovi. Keby sa dalo nastaviť oboje
    // nezávisle, vyšla by kombinácia, na ktorú nesedí nič — a prázdna
    // obrazovka bez vysvetlenia vyzerá ako chyba.
    if (key === 'partner') f.site = '';
    this.dashFilter = f;
    this.renderRoute();
  },
  toggleDashIssues() {
    this.dashFilter = { ...this.dashFilter, onlyIssues: !this.dashFilter.onlyIssues };
    this.renderRoute();
  },
  resetDashFilter() {
    this.dashFilter = { period: 'month', site: '', partner: '', from: '', to: '', onlyIssues: false };
    this.renderRoute();
  },
  /** Obdobie prehľadu vrátane vlastných hraníc. */
  _dashRange(today) {
    const f = this.dashFilter;
    return DanubraPeriod.range(f.period, today, { from: f.from, to: f.to });
  },

  /**
   * Pruh s filtrami. Jeden riadok nad číslami, nie schovaný v nastaveniach.
   * Napravo export — obdobie a export patria k sebe, lebo exportuje sa vždy
   * to, čo je práve na obrazovke.
   */
  _dashFilterBar(x) {
    const f = this.dashFilter;
    // Zoznam zákaziek sa zúži podľa odberateľa — ponúkať zákazky, ktoré by
    // po výbere nič neukázali, je horšie než ich neponúknuť vôbec.
    const sites = x.subcontracts.filter(s => s.status === 'active'
      && (!f.partner || s.partner_id === f.partner));
    const partners = [...new Map(x.subcontracts
      .filter(s => s.partner_id)
      .map(s => [s.partner_id, x.partnerName(s.partner_id) || '—']))]
      .sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'sk'));
    const custom = f.period === 'custom';
    const dirty = f.period !== 'month' || f.site || f.partner || f.from || f.to || f.onlyIssues;
    const ICO = { month: 'calendar', prev_month: 'back', quarter: 'chart',
      year: 'trend', custom: 'edit', all: 'clock' };

    return `<div class="dashbar no-print">
      <div class="dashbar-row">
        <span class="dashbar-lead">${Icon('filter', 14)} Obdobie
          ${Help.btn('dash.filter', { size: 13 })}</span>
        <div class="pillbar">
          ${DanubraPeriod.OPTIONS.map(([k, label]) => `
            <button class="pill${f.period === k ? ' active' : ''}"
              onclick="Danubra.setDashFilter('period','${k}')">
              ${Icon(ICO[k] || 'calendar', 13)}<span>${label}</span></button>`).join('')}
        </div>
        ${partners.length > 1 ? `<label class="dashbar-field">
          <span>${Icon('clients', 14)}</span>
          <select onchange="Danubra.setDashFilter('partner',this.value)" aria-label="Odberateľ">
            <option value="">Všetci odberatelia</option>
            ${partners.map(([id, name]) => `<option value="${id}" ${f.partner === id ? 'selected' : ''}>
              ${UI.esc(name)}</option>`).join('')}
          </select></label>` : ''}
        ${sites.length > 1 ? `<label class="dashbar-field">
          <span>${Icon('site', 14)}</span>
          <select onchange="Danubra.setDashFilter('site',this.value)" aria-label="Zákazka">
            <option value="">Všetky zákazky</option>
            ${sites.map(s => `<option value="${s.id}" ${f.site === s.id ? 'selected' : ''}>
              ${UI.esc(s.title)}</option>`).join('')}
          </select></label>` : ''}
        <div class="dashbar-actions">
          <button class="btn btn-sm ${f.onlyIssues ? 'btn-primary' : 'btn-outline'}"
            onclick="Danubra.toggleDashIssues()" aria-pressed="${f.onlyIssues}"
            title="Nechať na obrazovke len čísla, ktoré si pýtajú pozornosť">
            ${Icon(f.onlyIssues ? 'check' : 'alert', 14)} Len čo treba riešiť</button>
          <button class="btn btn-outline btn-sm" onclick="Danubra.exportDash('all')"
            title="Celý prehľad ako tabuľka do Excelu">${Icon('download', 14)} CSV</button>
          <button class="btn btn-outline btn-sm" onclick="Danubra.printDash()"
            title="Vytlačiť alebo uložiť ako PDF">${Icon('print', 14)} PDF</button>
          ${Help.btn('dash.export')}
          ${dirty ? `<button class="btn btn-ghost btn-sm" onclick="Danubra.resetDashFilter()"
            title="Späť na tento mesiac a všetky zákazky">${Icon('x', 14)} Zrušiť</button>` : ''}
        </div>
      </div>
      ${custom ? `<div class="dashbar-row dashbar-custom">
        <label class="dashbar-field"><span>Od</span>
          <input type="date" value="${UI.esc(f.from || '')}" max="${UI.esc(f.to || '')}"
            onchange="Danubra.setDashFilter('from',this.value)"></label>
        <label class="dashbar-field"><span>Do</span>
          <input type="date" value="${UI.esc(f.to || '')}" min="${UI.esc(f.from || '')}"
            onchange="Danubra.setDashFilter('to',this.value)"></label>
        ${f.from || f.to ? `<button class="btn btn-ghost btn-sm"
          onclick="Danubra.setDashFilter('from','');Danubra.setDashFilter('to','')">
          ${Icon('x', 13)} Vyprázdniť</button>` : ''}
        ${x.period.empty ? `<span class="dashbar-hint">${Icon('alert', 13)}
          Zadaj aspoň jednu hranicu — kým tam nie je, počíta sa za celý čas.</span>`
          : `<span class="dashbar-hint">${Icon('check', 13)}
          ${UI.esc(DanubraPeriod.text(x.period))}</span>`}
      </div>` : ''}
      <div class="dashbar-note">
        Sumy za obdobie sú ${UI.esc(DanubraPeriod.text(x.period))}${
          x.siteName2 ? `, zákazka ${UI.esc(x.siteName2)}` : ''}.
        Stavové čísla — čakáme na účet, viazne v nákladoch, treba dobrať ľudí —
        obdobie neberú; tie sú vždy „teraz".
      </div>
    </div>`;
  },

  // ── Založiť nový záznam rovno pri výbere ──────────────────────────────────
  // Vo formulári sa dá vybrať len to, čo už existuje. Keď odberateľ, zákazka
  // alebo partia ešte nie sú založené, znamenalo to: zavri rozpísaný formulár,
  // choď inam, založ to, vráť sa a napíš všetko odznova.
  //
  // Preto sa zakladá **z toho istého miesta**, v okne nad formulárom. Pýta sa
  // len to, bez čoho záznam nedáva zmysel; zvyšok sa doplní v jeho module.
  // Lepšie je mať odberateľa s menom a doplniť mu USt-IdNr neskôr, než prísť
  // o rozpísanú ponuku.
  //
  // `stale` je modul, ktorého zoznam týmto zastaral. Nastaví sa mu
  // `loaded = false`, aby si pri najbližšom otvorení dotiahol aj nový záznam —
  // inak by tam chýbal, kým sa appka neobnoví.
  NEW: {
    partner: {
      table: 'partners', what: 'odberateľa', stale: ['Prt', 'Quo', 'Con', 'Sub'],
      lead: 'Stačí meno. IČ DPH, splatnosť a kontakt doplníš v Odberateľoch.',
      label: (r) => r.name,
      fields: () => [
        ['name', 'Názov firmy', { required: true, placeholder: 'napr. Bauunternehmen Vogel GmbH' }],
        ['city', 'Mesto', {}],
        ['country', 'Krajina', { value: 'DE', options: [['DE', 'Nemecko'], ['AT', 'Rakúsko'], ['SK', 'Slovensko']] }],
      ],
    },
    worker: {
      table: 'workers', what: 'živnostníka', stale: ['Wrk', 'Sub', 'Crews', 'Cost'],
      lead: 'Stačí meno a telefón. Doklady a fakturačné údaje doplníš v kartotéke — '
        + 'bez nich sa aj tak nasadiť nedá.',
      label: (r) => r.full_name,
      fields: () => [
        ['full_name', 'Meno a priezvisko', { required: true }],
        ['phone', 'Telefón', { type: 'tel', placeholder: '+421 …' }],
      ],
    },
    crew: {
      table: 'crews', what: 'partiu', stale: ['Crews', 'Sub', 'HS'],
      lead: 'Partia je skupina, ktorá chodí spolu a má jeden výkaz hodín. '
        + 'Členov pridáš v Partiách.',
      label: (r) => r.name,
      fields: () => [
        ['name', 'Názov partie', { required: true, placeholder: 'napr. Partia Nitra' }],
      ],
    },
    accommodation: {
      table: 'accommodations', what: 'ubytovanie', stale: ['Acc', 'Sub'],
      lead: 'Stačí názov a mesto. Kapacitu a cenu doplníš v Ubytovaniach.',
      label: (r) => r.name,
      fields: () => [
        ['name', 'Názov', { required: true }],
        ['city', 'Mesto', {}],
        ['address', 'Adresa', {}],
      ],
    },
    subcontract: {
      table: 'subcontracts', what: 'zákazku', stale: ['Sub', 'Hire', 'Cost', 'Wrk', 'Ads', 'HS'],
      lead: 'Stačí názov a odberateľ. Termín, sadzbu a typ prác doplníš v Zákazkách — '
        + 'bez nich sa aj tak nedá nasadiť ani fakturovať.',
      label: (r) => r.title,
      // Odberatelia sa doťahujú až pri otvorení okna. Brať ich z pamäte modulu
      // by znamenalo, že v zozname chýba ten, ktorý práve vznikol vedľa.
      load: async () => {
        const { data } = await DB.list('partners', { select: 'id,name', limit: 300 });
        return { partners: data || [] };
      },
      fields: (d) => [
        ['title', 'Názov zákazky', { required: true, placeholder: 'napr. Wohnpark Feuerbach' }],
        ['partner_id', 'Odberateľ', { options: [['', '— doplním neskôr —'],
          ...(d.partners || []).map(x => [x.id, x.name])] }],
        ['site_city', 'Mesto', {}],
      ],
    },
    plan: {
      table: 'recruitment_plans', what: 'nábor', stale: ['Hire', 'Ads', 'Cand'],
      lead: 'Stačí názov a koľko ľudí treba. Remeslo, mesto a termín doplníš v Nábore.',
      label: (r) => r.title,
      fields: () => [
        ['title', 'Názov náboru', { required: true, placeholder: 'napr. Sadrokartonári Stuttgart' }],
        ['headcount', 'Koľko ľudí', { type: 'number', value: '1' }],
      ],
    },
    ad: {
      table: 'ads', what: 'inzerát', stale: ['Ads', 'Hire', 'Cand', 'Trades'],
      lead: 'Stačí názov. Znenie, kanál a sľúbenú sadzbu doplníš v Inzerátoch — '
        + 'a práve podľa nich sa potom pri hovore vie, čo sme sľúbili.',
      label: (r) => r.title,
      fields: () => [
        ['title', 'Názov inzerátu', { required: true }],
      ],
    },
    trade: {
      table: 'trades', what: 'remeslo', stale: ['Trades', 'Quo', 'Hire', 'Crews', 'Ads'],
      lead: 'Kľúč je krátky názov bez diakritiky — používa sa v inzerátoch a otázkach.',
      label: (r) => r.name_sk,
      fields: () => [
        ['name_sk', 'Názov po slovensky', { required: true, placeholder: 'napr. Sadrokartón' }],
        ['key', 'Kľúč', { required: true, placeholder: 'napr. trockenbau',
          hint: 'Malými písmenami, bez medzier a diakritiky. Už sa nemení.' }],
      ],
    },
  },

  /**
   * Otvorí okno nad formulárom, založí záznam a **rovno ho vyberie** v tom
   * poli, od ktorého sa to spustilo.
   */
  async quickAdd(kind, fieldName) {
    const def = this.NEW[kind];
    if (!def) return UI.toast('Toto sa takto založiť nedá.', 'err');
    let ctx = {};
    if (def.load) {
      try { ctx = await def.load() || {}; }
      catch { return UI.toast('Nepodarilo sa načítať zoznam.', 'err'); }
    }
    const values = await UI.askFields(`Nový ${def.what}`, def.lead, def.fields(ctx),
      { ok: 'Založiť' });
    if (!values) return;

    const { data, error } = await DB.insert(def.table, values);
    if (error) return UI.toast('Nepodarilo sa: ' + error.message, 'err');

    // Doplň do otvoreného formulára a vyber. Keby sa tu len prekreslilo, prišlo
    // by sa o to, čo je vo formulári už vypísané — a to je celý dôvod, prečo
    // sa to zakladá odtiaľto.
    const sel = document.querySelector(`#ui-modal select[name="${fieldName}"]`)
      || document.querySelector(`select[name="${fieldName}"]`);
    if (sel) {
      const opt = document.createElement('option');
      opt.value = data.id;
      opt.textContent = def.label(data) || '—';
      sel.appendChild(opt);
      sel.value = data.id;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    for (const g of (def.stale || [])) {
      if (window[g]) window[g].loaded = false;
    }
    UI.toast(`${def.what[0].toUpperCase()}${def.what.slice(1)} je založený. `
      + 'Zvyšok doplníš neskôr.', 'ok');
  },

  // ── Detail za číslom ──────────────────────────────────────────────────────
  // Dlaždica doteraz po kliknutí odišla na iný modul. Otázka pritom znie
  // „ktoré?", nie „kde sa to rieši" — a na novom module si ten istý filter
  // musel človek nastaviť znova.
  //
  // Zoznam aj číslo počíta `DanubraDetail` z tých istých riadkov, takže sa
  // nemôžu rozísť. Keby číslo brala dlaždica z pohľadu v databáze a zoznam
  // z tabuľky, raz sa to rozíde a nikto nebude vedieť, ktoré platí.

  /** Stav otvoreného okna. Hľadanie a zoradenie prežijú prekreslenie zoznamu. */
  _kpi: { key: null, q: '', sort: null, dir: 'asc' },

  kpiDetail(key) {
    const x = this._dashData;
    if (!x) return UI.toast('Prehľad sa ešte nenačítal.', 'err');
    const d = DanubraDetail.detail(key, x.kpiData);
    if (!d) return;
    this._kpi = { key, q: '', sort: null, dir: 'asc' };
    UI.modal(d.title, `
      <p class="kpi-lead">${UI.esc(d.lead)}</p>
      ${d.note ? `<p class="kpi-note">${Icon('info', 13)} ${UI.esc(d.note)}</p>` : ''}
      <div class="kpi-tools no-print">
        <label class="kpi-search">
          ${Icon('search', 14)}
          <input type="search" id="kpi-q" placeholder="Hľadať v zozname…"
            autocomplete="off" oninput="Danubra.kpiSearch(this.value)">
        </label>
        <label class="kpi-sortm" title="Zoradiť">
          <span>${Icon('sort', 14)}</span>
          <select onchange="Danubra.kpiSort(this.value)" aria-label="Zoradiť podľa">
            <option value="">Zoradiť…</option>
            ${d.cols.map(c => `<option value="${c.k}">${UI.esc(c.label)}</option>`).join('')}
          </select>
        </label>
        <button class="btn btn-outline btn-sm" onclick="Danubra.kpiExport()"
          title="Presne tento zoznam do Excelu">${Icon('download', 14)} CSV</button>
        ${d.go && this.routeAvailable(d.go)
          ? `<button class="btn btn-ghost btn-sm" onclick="UI.closeModal();Danubra.go('${d.go}')">
               ${Icon('chevron', 14)} ${UI.esc(this.labelOf(d.go))}</button>` : ''}
      </div>
      <div id="kpi-list">${this._kpiListHtml(d)}</div>`, { wide: true });
  },

  kpiSearch(q) {
    this._kpi = { ...this._kpi, q };
    this._kpiRedraw();
  },

  /** Druhý klik na ten istý stĺpec otočí smer — tak to robí každá tabuľka. */
  kpiSort(col) {
    const k = this._kpi;
    this._kpi = { ...k, sort: col, dir: k.sort === col && k.dir === 'asc' ? 'desc' : 'asc' };
    this._kpiRedraw();
  },

  _kpiRedraw() {
    const el = document.getElementById('kpi-list');
    if (!el || !this._dashData) return;
    const d = DanubraDetail.detail(this._kpi.key, this._dashData.kpiData);
    if (d) el.innerHTML = this._kpiListHtml(d);
  },

  /** Otvorí záznam a okno zavrie — inak zostane visieť nad novou obrazovkou. */
  kpiOpen(type, id) {
    UI.closeModal();
    this.open(type, id);
  },

  kpiExport() {
    const x = this._dashData;
    if (!x) return;
    const d = DanubraDetail.detail(this._kpi.key, x.kpiData);
    if (!d) return;
    // Vyváža sa to, čo je na obrazovke — aj s hľadaním a zoradením.
    const rows = DanubraDetail.sort(
      DanubraDetail.filter(d.rows, this._kpi.q), this._kpi.sort, this._kpi.dir);
    DanubraExport.download(DanubraDetail.table({ ...d, rows }),
      [d.key, DanubraPeriod.slug(x.period)]);
  },

  _kpiListHtml(d) {
    const k = this._kpi;
    const rows = DanubraDetail.sort(DanubraDetail.filter(d.rows, k.q), k.sort, k.dir);
    if (!rows.length) {
      return UI.empty('check', k.q ? 'Nič také tu nie je' : 'Prázdne',
        k.q ? `Hľadaniu „${k.q}" nič nezodpovedá.` : d.sub);
    }
    const fmt = (v, col) => {
      if (v == null || v === '') return '<span class="dim">—</span>';
      if (col.kind === 'money') return UI.esc(Money.format(v));
      if (col.kind === 'date') return UI.esc(UI.date(v));
      if (col.kind === 'validity') {
        const n = Number(v);
        if (n === 0) return 'končí dnes';
        const a2 = Math.abs(n);
        return UI.esc(n < 0
          ? `skončila pred ${a2} ${DanubraDetail.plural(a2, 'dňom', 'dňami', 'dňami')}`
          : `skončí o ${a2} ${DanubraDetail.plural(a2, 'deň', 'dni', 'dní')}`);
      }
      if (col.kind === 'days') {
        // Záporný počet dní je čas, ktorý ubehol, nie čas, ktorý zostáva.
        // „−12 dní" si človek prečíta ako chybu výpočtu.
        const n = Number(v);
        if (n === 0) return 'dnes';
        const a2 = Math.abs(n);
        return UI.esc(n < 0
          ? `pred ${a2} ${DanubraDetail.plural(a2, 'dňom', 'dňami', 'dňami')}`
          : `${a2} ${DanubraDetail.plural(a2, 'deň', 'dni', 'dní')}`);
      }
      if (col.kind === 'num') return UI.esc(String(v).replace('.', ','));
      return UI.esc(v);
    };
    const arrow = (col) => (k.sort === col ? (k.dir === 'asc' ? ' ▲' : ' ▼') : '');
    return `<div class="kpi-table-wrap">
      <table class="kpi-table">
        <thead><tr>
          ${d.cols.map(c => `<th class="${c.align === 'right' ? 'ta-r' : ''}">
            <button class="kpi-th" onclick="Danubra.kpiSort('${c.k}')"
              title="Zoradiť podľa ${UI.esc(c.label)}">${UI.esc(c.label)}${arrow(c.k)}</button>
          </th>`).join('')}
        </tr></thead>
        <tbody>
          ${rows.map((r) => {
            const can = r.open && this.canOpen(r.open.type, r.open.id);
            return `<tr class="${r.tone ? `tone-${r.tone}` : ''}${can ? ' is-open' : ''}"
              ${can ? `onclick="Danubra.kpiOpen('${r.open.type}','${r.open.id}')"
                 tabindex="0" role="button"` : ''}>
              ${d.cols.map((c, i) => `<td class="${c.align === 'right' ? 'ta-r' : ''}"
                data-l="${UI.esc(c.label)}">
                ${i === 0 && r.tone ? `<span class="kpi-dot kpi-dot-${r.tone}"></span>` : ''}
                ${fmt(r.cells[c.k], c)}
                ${i === 0 && r.why ? `<span class="kpi-why">${UI.esc(r.why)}</span>` : ''}
              </td>`).join('')}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <p class="card-note">${rows.length === d.rows.length
      ? `${rows.length} ${Shell.plural(rows.length, 'riadok', 'riadky', 'riadkov')}.`
      : `${rows.length} z ${d.rows.length}.`}
      ${rows.some(r => r.open && this.canOpen(r.open.type, r.open.id))
        ? ' Klikni na riadok a otvorí sa záznam.' : ''}</p>`;
  },

  // ── Karty prehľadu: hlavička, export, tlač ────────────────────────────────
  // Každá karta má tri veci: ikonu (aby sa v mriežke našla očami), odkaz tam,
  // kde sa to rieši, a export. Bez exportu sa číslo z appky nedá poslať
  // účtovníčke a skončí to prepisovaním do Excelu ručne.

  /**
   * Hlavička karty.
   * @param icon    názov ikony
   * @param title   názov karty
   * @param right   to, čo má byť napravo (štítok, prepínač)
   * @param exp     kľúč exportu, keď sa karta dá vyviezť do CSV
   * @param go      obrazovka, na ktorú sa dá z karty prekliknúť
   * @param help    kľúč vysvetlivky; keď sa nezadá, odvodí sa z exportu
   */
  _cardHead(icon, title, right, exp, go, help) {
    const hk = help || (exp ? `card.${exp}` : null);
    const acts = [
      right || '',
      hk && window.Help ? Help.btn(hk) : '',
      go && this.routeAvailable(go)
        ? `<button class="icon-btn no-print" onclick="Danubra.go('${go}')"
            title="Otvoriť ${UI.esc(this.labelOf(go))}"
            aria-label="Otvoriť ${UI.esc(this.labelOf(go))}">${Icon('chevron', 15)}</button>` : '',
      exp ? `<button class="icon-btn no-print" onclick="Danubra.exportDash('${exp}')"
            title="Exportovať do CSV" aria-label="Exportovať „${UI.esc(title)}" do CSV">
            ${Icon('download', 14)}</button>` : '',
    ].filter(Boolean).join('');
    return `<div class="card-head">
      <div class="card-title"><span class="card-ico">${Icon(icon, 15)}</span>${UI.esc(title)}</div>
      ${acts ? `<div class="card-acts">${acts}</div>` : ''}
    </div>`;
  },

  // Filtre na jednotlivých kartách. Obdobie je spoločné pre celý prehľad, ale
  // „ktorá kategória" a „podľa čoho zoradiť" má zmysel len v jednej karte.
  dashCard: { tiedCat: '', bookSort: 'remaining' },
  setDashCard(key, value) {
    this.dashCard = { ...this.dashCard, [key]: value };
    this.renderRoute();
  },

  /** Malý prepínač do hlavičky karty. */
  _cardPills(key, options, current) {
    return `<div class="pillbar pillbar-xs no-print">
      ${options.map(([v, label]) => `<button class="pill${v === current ? ' active' : ''}"
        onclick="Danubra.setDashCard('${key}','${v}')">${UI.esc(label)}</button>`).join('')}
    </div>`;
  },

  /**
   * Čo sa z ktorej karty exportuje. Prvý riadok sú hlavičky — tak to čaká
   * Excel aj účtovný softvér.
   */
  _dashExports: {
    all: {
      name: 'prehlad',
      rows: (x, E) => {
        const p = x.profit, w = DanubraOutlook.weeks({
          today: x.today, weeks: Danubra.dashWeeks, balance: x.balanceNow, items: x.cashflowItems });
        return [
          ['Ukazovateľ', 'Hodnota', 'Jednotka'],
          ['Obdobie', DanubraPeriod.text(x.period), ''],
          ['Zákazka', x.siteName2 || 'všetky', ''],
          ['Čakáme na účet', E.money(x.receivable.net), 'EUR'],
          ['Z toho po splatnosti', E.money(x.receivable.overdue), 'EUR'],
          ['Zrážka §48b vo faktúrach', E.money(x.receivable.withheld), 'EUR'],
          ['Odrobené, nevyfakturované', E.money(x.unbilled.charge), 'EUR'],
          ['Odrobené hodiny bez faktúry', E.num(x.unbilled.hours, 1), 'h'],
          ['V objednávkach zostáva', E.money(x.book.remaining), 'EUR'],
          ['Viazne v nákladoch', E.money(x.tied.total), 'EUR'],
          ['Zisk z odrobeného', E.money(p.done), 'EUR'],
          ['Zisk z bežiacich zákaziek', E.money(p.contracted), 'EUR'],
          ['Zisk z odoslaných ponúk', E.money(p.pipeline), 'EUR'],
          ['Zisk pravdepodobne', E.money(p.likely), 'EUR'],
          ['Na účte dnes', E.money(x.balanceNow), 'EUR'],
          [`Príde do ${Danubra.dashWeeks} týždňov`, E.money(w.totalIn), 'EUR'],
          [`Odíde do ${Danubra.dashWeeks} týždňov`, E.money(Math.abs(w.totalOut)), 'EUR'],
          ['Rozdiel', E.money(w.diff), 'EUR'],
          ['Zostatok na konci', E.money(w.endBalance), 'EUR'],
          ['Vyfakturované odberateľom', E.money(x.econ.invoiced), 'EUR'],
          ['Faktúry od živnostníkov', E.money(-x.econ.bills), 'EUR'],
          ['Ostatné náklady', E.money(-x.econ.costs), 'EUR'],
          ['Zostáva (marža)', E.money(x.econ.margin), 'EUR'],
          ['Marža', x.econ.marginPct != null ? E.num(x.econ.marginPct, 1) : '', '%'],
          ['Ľudia na stavbách', x.deployed, 'osôb'],
          ['Partie na stavbách', x.crewsOut, 'partií'],
          ['Nezúčtované hodiny', E.num(x.hoursOpen, 1), 'h'],
          ['Obdobia na uzavretie', x.periodsDue.length, ''],
          ['Faktúry na schválenie', x.invApprove.length, ''],
          ['Faktúry po splatnosti', x.invOverdue.length, ''],
          ['Doklady po platnosti', x.docsExpired.length, ''],
          ['Dokladom sa blíži koniec', x.docsExpiring.length, ''],
          ['Treba dobrať ľudí', x.needPeople, 'osôb'],
        ];
      },
    },
    cashflow: {
      name: 'cash-flow',
      rows: (x, E) => {
        const c = x.cash;
        return [
          ['Položka', 'Suma', 'Poznámka'],
          ['Na účte dnes', E.money(c.start), ''],
          ['Po splatnosti — príde', E.money(c.late.in), 'malo prísť dávno'],
          ['Po splatnosti — odíde', E.money(c.late.out), 'malo odísť dávno'],
          ['Vystavené faktúry v splatnosti', E.money(c.in.invoices), ''],
          ['Ostatné príjmy', E.money(c.in.other), ''],
          ['Faktúry živnostníkov', E.money(c.out.bills), ''],
          ['Ostatné náklady', E.money(c.out.costs), 'ubytovanie, doprava, réžia'],
          [`Zostatok o ${c.horizon} týždňov`, E.money(c.end), ''],
          ['Najnižší bod', E.money(c.lowest.balance),
            c.lowest.week ? `${c.lowest.week}. týždeň` : 'dnes'],
          [],
          ['Mimo výhľadu — bez termínu', '', ''],
          ['Odrobené, nevyfakturované', E.money(c.later.unbilled), 'chýba uzavreté obdobie'],
          ['Viazne v nákladoch', E.money(c.later.tied), 'vráti sa refakturáciou'],
        ];
      },
    },
    money: {
      name: 'cakame-na-ucet',
      rows: (x, E) => [
        ['Faktúra', 'Odberateľ', 'Splatnosť', 'Stav', 'Suma', 'Po splatnosti'],
        ...x.invoicesFiltered
          .filter(i => !['paid', 'cancelled', 'draft'].includes(i.status))
          .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')))
          .map(i => [
            i.invoice_number || '', x.partnerName(i.partner_id) || '', i.due_date || '',
            // Stav sa v CSV píše po slovensky — účtovníčka nečíta `pending_approval`.
            ({ draft: 'Rozpracovaná', pending_approval: 'Čaká na schválenie',
              draft_pending_approval: 'Čaká na schválenie', approved: 'Schválená',
              issued: 'Vystavená', sent: 'Odoslaná', paid: 'Uhradená',
              overdue: 'Po splatnosti', cancelled: 'Stornovaná' }[i.status] || i.status),
            E.money(Money.toCents(i.total)),
            i.due_date && i.due_date < x.today ? 'áno' : 'nie',
          ]),
      ],
    },
    weeks: {
      name: 'prijmy-vydaje',
      rows: (x, E) => {
        const w = DanubraOutlook.weeks({
          today: x.today, weeks: Danubra.dashWeeks, balance: x.balanceNow, items: x.cashflowItems });
        return [
          ['Týždeň', 'Od', 'Príde', 'Odíde', 'Rozdiel', 'Zostatok'],
          ...w.weeks.map(b => [b.week, b.from, E.money(b.in), E.money(Math.abs(b.out)),
            E.money(b.diff), E.money(b.balance)]),
          [],
          ['Spolu', '', E.money(w.totalIn), E.money(Math.abs(w.totalOut)),
            E.money(w.diff), E.money(w.endBalance)],
        ];
      },
    },
    profit: {
      name: 'ocakavany-zisk',
      rows: (x, E) => [
        ['Vrstva', 'Zisk', 'Istota'],
        ['Z odrobeného', E.money(x.profit.done), 'hotové, nevyfakturované'],
        ['Z bežiacich zákaziek', E.money(x.profit.contracted), 'dohodnuté, neodrobené'],
        ['Z odoslaných ponúk', E.money(x.profit.pipeline), 'čaká na odpoveď'],
        ['Pravdepodobne', E.money(x.profit.likely), ''],
      ],
    },
    tied: {
      name: 'viazne-v-nakladoch',
      rows: (x, E) => [
        ['Kategória', 'Suma', 'Položiek'],
        ...x.tied.byCategory.map(c => [
          ({ accommodation: 'Ubytovanie', travel: 'Cestovné', transport: 'Doprava' }[c.category]
            || c.category), E.money(c.cents), c.count != null ? c.count : '']),
        [],
        ['Spolu', E.money(x.tied.total), x.tied.count],
      ],
    },
    book: {
      name: 'objednavky',
      rows: (x, E) => [
        ['Zákazka', 'Ľudia', 'Dní do konca', 'Zostáva odrobiť'],
        ...Danubra._bookRows(x).map(r => [r.title, r.people, r.days, E.money(r.remaining)]),
        [],
        ['Spolu', x.book.people, '', E.money(x.book.remaining)],
      ],
    },
    hiring: {
      name: 'nabor',
      rows: (x) => [
        ['Mesto', 'Ľudí', 'Súrne', 'Nábory'],
        ...x.hiringNeed.rows.map(r => [r.city, r.headcount, r.urgent ? 'áno' : 'nie',
          r.plans.map(p => p.title || p.site || 'nábor').join(' · ')]),
      ],
    },
    cash: {
      name: 'vyhlad-8-tyzdnov',
      rows: (x, E) => [
        ['Týždeň', 'Od', 'Do', 'Príde', 'Odíde', 'Zostatok'],
        // Po splatnosti je vo výhľade zvlášť — sú to peniaze, ktoré mali prísť
        // dávno, nie budúcnosť.
        ['po splatnosti', '', '', E.money(x.forecast.overdue.in),
          E.money(Math.abs(x.forecast.overdue.out)), E.money(x.forecast.afterOverdue)],
        ...x.forecast.buckets.map((b, i) => [i + 1, b.from, b.to, E.money(b.in),
          E.money(Math.abs(b.out)), E.money(b.balance)]),
        [],
        ['Na účte dnes', '', '', '', '', E.money(x.forecast.startBalance)],
        ['O osem týždňov', '', '', '', '', E.money(x.forecast.endBalance)],
      ],
    },
    margin: {
      name: 'marza',
      rows: (x, E) => [
        ['Položka', 'Suma'],
        ['Vyfakturované odberateľom', E.money(x.econ.invoiced)],
        ['Faktúry od živnostníkov', E.money(-x.econ.bills)],
        ['Ostatné náklady', E.money(-x.econ.costs)],
        ['Zostáva', E.money(x.econ.margin)],
        ['Marža v %', x.econ.marginPct != null ? E.num(x.econ.marginPct, 1) : ''],
        ['Zrážka §48b vo fakturovanom', E.money(x.econ.withheld)],
      ],
    },
    tasks: {
      name: 'ulohy',
      rows: (x) => [
        ['Termín', 'Úloha', 'Čoho sa to týka', 'Priorita'],
        ...x.tasks
          .slice()
          .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')))
          .map(t => [t.due_date || '', t.title || '', t.entity_label || '', t.priority || '']),
      ],
    },
    alerts: {
      name: 'vyzaduje-pozornost',
      rows: (x) => [
        ['Čo', 'Prečo', 'Koho sa to týka'],
        ...Danubra._dashAlerts(x).map(a => [a.label, a.why,
          a.items.map(i => i.label).join(' · ') + (a.more ? ` + ${a.more} ďalších` : '')]),
      ],
    },
  },

  /** Riadky objednávok podľa zvoleného poradia. */
  _bookRows(x) {
    const rows = x.book.rows.slice();
    if (this.dashCard.bookSort === 'days') {
      rows.sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));
    } else {
      rows.sort((a, b) => b.remaining - a.remaining);
    }
    return rows;
  },

  /** Export jednej karty alebo celého prehľadu. */
  exportDash(key) {
    const x = this._dashData;
    const spec = this._dashExports[key];
    if (!x || !spec) return UI.toast('Prehľad sa ešte nenačítal.', 'err');
    let rows;
    try { rows = spec.rows(x, DanubraExport); } catch (e) {
      console.error('[danubra] export sa nepodaril', key, e);
      return UI.toast('Export sa nepodaril.', 'err');
    }
    // Jeden riadok znamená len hlavičku — prázdny súbor nikomu nepomôže.
    if (!rows || rows.filter(r => r && r.length).length < 2) {
      return UI.toast('Nie je čo exportovať — tabuľka je prázdna.', 'err');
    }
    const name = DanubraExport.download(rows,
      [spec.name, DanubraPeriod.slug(x.period)]);
    UI.toast(`Uložené: ${name}`, 'ok');
  },

  /**
   * PDF. Robí to tlač prehliadača — v dialógu treba vybrať „Uložiť ako PDF".
   * Bez knižnice, takže to vyzerá presne tak, ako obrazovka.
   */
  printDash() {
    this.toggleBell(false);
    UI.toast('V dialógu tlače vyber „Uložiť ako PDF".');
    // Toast nech je vidieť skôr, než tlač zamrzne stránku.
    setTimeout(() => DanubraExport.printArea('print-dash'), 120);
  },

  /**
   * Kompletný cash-flow — prvá karta na obrazovke. Zodpovedá otázku „ako na
   * tom sme" jedným pohľadom: čo je na účte, čo príde, čo odíde, čo zostane.
   *
   * Zvlášť je to, čo **nemá termín** — odrobené hodiny bez faktúry
   * a refakturovateľné náklady. Sú to takmer isté peniaze, ale nikto nevie
   * kedy prídu. Keby sa prirátali do zostatku, výhľad by vyzeral pokojnejšie,
   * než aký je; keby sa zamlčali, firma by vyzerala chudobnejšia. Preto sú
   * vedľa seba a oddelene.
   */
  _dashCashflowCard(x) {
    const c = x.cash;
    const tone = c.verdict === 'bad' ? 'red' : (c.verdict === 'tight' ? 'amber' : 'green');
    const verdict = c.verdict === 'bad'
      ? `Účet spadne pod nulu v ${c.negativeFrom.week}. týždni`
      : (c.verdict === 'tight' ? 'Vyjde to, ale tesne' : 'Peniaze vychádzajú');

    const row = (label, value, note, cls) => `
      <div class="cf-row${cls ? ' ' + cls : ''}">
        <div class="cf-label">${label}${note ? `<span>${note}</span>` : ''}</div>
        <div class="cf-value">${value}</div>
      </div>`;
    const money = (v, sign) => `${sign && v > 0 ? '+' : ''}${Money.format(v)}`;

    return `<div class="card card-pad cf-card">
      ${this._cardHead('wallet', 'Kompletný cash-flow',
        UI.badge(verdict, tone), 'cashflow', 'bank', 'card.cashflow')}

      <div class="cf-top">
        <div class="cf-now">
          <div class="cf-now-label">Na účte dnes</div>
          <div class="big-number">${Money.format(c.start)}</div>
          <div class="cf-now-note">o ${c.horizon} týždňov ${Money.format(c.end)}${
            c.net ? ` (${c.net > 0 ? '+' : '−'}${Money.format(Math.abs(c.net), { currency: '' })})` : ''}</div>
        </div>
        <div class="cf-chart">
          ${DanubraChart.waterfall({
            steps: c.steps.map(st => ({ ...st, label: st.label })),
            height: 200,
            aria: `Od stavu účtu cez pohyby k zostatku o ${c.horizon} týždňov`,
          })}
        </div>
      </div>

      <div class="cf-cols">
        <div class="cf-col">
          <div class="form-section" style="margin:0 0 4px;">Čo príde</div>
          ${c.late.in ? row('Po splatnosti', money(c.late.in, true),
            'malo prísť dávno', 'cf-in cf-late') : ''}
          ${c.in.invoices ? row('Vystavené faktúry', money(c.in.invoices, true),
            'v splatnosti', 'cf-in') : ''}
          ${c.in.other ? row('Ostatné príjmy', money(c.in.other, true), '', 'cf-in') : ''}
          ${!c.late.in && !c.in.total ? `<div class="cf-none">Nič s termínom.</div>` : ''}
        </div>
        <div class="cf-col">
          <div class="form-section" style="margin:0 0 4px;">Čo odíde</div>
          ${c.late.out ? row('Po splatnosti', Money.format(c.late.out),
            'malo odísť dávno', 'cf-out cf-late') : ''}
          ${c.out.bills ? row('Faktúry živnostníkov', Money.format(c.out.bills), '', 'cf-out') : ''}
          ${c.out.costs ? row('Náklady', Money.format(c.out.costs),
            'ubytovanie, doprava, réžia', 'cf-out') : ''}
          ${!c.late.out && !c.out.total ? `<div class="cf-none">Nič s termínom.</div>` : ''}
        </div>
        <div class="cf-col">
          <div class="form-section" style="margin:0 0 4px;">Mimo výhľadu</div>
          ${c.later.unbilled ? row('Odrobené, nevyfakturované', Money.format(c.later.unbilled),
            'chýba uzavreté obdobie', 'cf-later') : ''}
          ${c.later.tied ? row('Viazne v nákladoch', Money.format(c.later.tied),
            'vráti sa refakturáciou', 'cf-later') : ''}
          ${c.later.total
            ? `<p class="cf-note">Bez termínu, preto mimo zostatku.
               Spolu ${Money.format(c.later.total)}.</p>`
            : `<div class="cf-none">Všetko má termín.</div>`}
        </div>
      </div>

      <div class="cf-foot">
        <div><span>Najnižší bod</span><strong style="${c.lowest.balance < 0 ? 'color:var(--red);' : ''}">${
          Money.format(c.lowest.balance)}${c.lowest.week ? ` · ${c.lowest.week}. týždeň` : ' · dnes'}</strong></div>
        <div><span>Zmena za ${c.horizon} týždňov</span><strong style="color:var(--${c.net < 0 ? 'red' : 'green'});">${
          money(c.net, true)}</strong></div>
        <button class="btn btn-outline btn-sm no-print" onclick="Danubra.go('bank')">
          ${Icon('invoices', 14)} Banka a cash-flow</button>
      </div>
      ${c.negativeFrom ? `<div class="warnbox" style="margin-top:10px;">
        ${Icon('alert', 14)} Podľa výhľadu spadne účet do mínusu v ${c.negativeFrom.week}. týždni
        (${UI.date(c.negativeFrom.from)}). Výplaty sa odložiť nedajú — buď skôr vyfakturovať,
        alebo neskôr zaplatiť.</div>` : ''}
    </div>`;
  },

  /** „Čakáme na účet" — a hneď aj to, koľko z toho reálne príde. */
  _dashMoneyCard(x) {
    const r = x.receivable;
    const u = x.unbilled;
    return `<div class="card card-pad">
      ${this._cardHead('wallet', 'Koľko peňazí čakáme',
        r.overdueCount ? UI.badge(`${r.overdueCount} po splatnosti`, 'red') : '',
        'money', 'invoices')}
      <div class="big-number">
        <button class="link-inline" style="font:inherit;color:inherit;"
          onclick="Danubra.go('invoices')">${Money.format(r.net)}</button>
      </div>
      <p class="big-note">na účet z ${r.count} ${Shell.plural(r.count, 'vystavenej faktúry', 'vystavených faktúr', 'vystavených faktúr')}${
        r.withheld ? ` — fakturované je ${Money.format(r.gross)}, zrážka §48b ${Money.format(r.withheld)} ide nemeckému úradu` : ''}.</p>
      ${DanubraChart.split({
        parts: [
          { label: 'Po splatnosti', value: r.overdue, color: 'var(--red)' },
          { label: 'V splatnosti', value: Math.max(0, r.net - r.overdue) },
          { label: 'Nevyfakturované', value: u.charge, color: DanubraChart.PALETTE[5] },
        ],
        aria: 'Z čoho sa skladajú peniaze, ktoré čakáme',
      })}
      ${u.hours ? `<p class="card-note">${String(u.hours).replace('.', ',')} h
        za ${UI.esc(DanubraPeriod.short(x.period))} čaká na uzavretie obdobia.</p>` : ''}
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
      ${this._cardHead('chart', 'Príjmy a výdaje',
        `<div class="pillbar pillbar-xs no-print">
          ${[1, 2, 3, 4].map(k => `<button class="pill${k === n ? ' active' : ''}"
            onclick="Danubra.setDashWeeks(${k})">${k} ${k === 1 ? 'týždeň' : 't.'}</button>`).join('')}
        </div>`, 'weeks')}
      ${w.overdue.in || w.overdue.out ? `<p class="card-note" style="margin:0 0 8px;">
        Po splatnosti ${Money.format(w.overdue.in + w.overdue.out)} sa počíta hneď.</p>` : ''}
      ${DanubraChart.diverging({
        rows: w.weeks.map(b => ({
          label: `${b.week}. t`, sub: UI.date(b.from),
          in: b.in, out: b.out,
        })),
        height: 170, labelIn: 'Príde', labelOut: 'Odíde',
        aria: `Príjmy a výdaje na ${n} ${Shell.plural(n, 'týždeň', 'týždne', 'týždňov')}`,
      })}
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
      ${this._cardHead('trend', 'Očakávaný zisk',
        UI.badge(`pravdepodobne ${Money.format(p.likely)}`, p.likely > 0 ? 'green' : 'gray'),
        'profit')}
      ${bar('Z odrobeného', p.done, 'pf-sure', 'hotové, len sa to ešte nevyfakturovalo')}
      ${bar('Z bežiacich zákaziek', p.contracted, 'pf-likely', 'dohodnuté, ešte sa to neodrobilo')}
      ${bar('Z odoslaných ponúk', p.pipeline, 'pf-maybe',
        p.quotesSent ? `${p.quotesSent} ${Shell.plural(p.quotesSent, 'ponuka čaká', 'ponuky čakajú', 'ponúk čaká')} na odpoveď` : 'žiadna ponuka nevisí')}
      ${DanubraChart.split({
        parts: [
          { label: 'Odrobené', value: p.done },
          { label: 'Zazmluvnené', value: p.contracted },
          { label: 'Ponuky', value: p.pipeline, color: DanubraChart.PALETTE[5] },
        ],
        aria: 'Vrstvy očakávaného zisku podľa istoty',
      })}
    </div>`;
  },

  /** Čo máme v objednávkach — dohodnuté, ešte neodrobené. */
  _dashOrderBookCard(x) {
    const b = x.book;
    if (!b.rows.length) {
      return `<div class="card card-pad">
        ${this._cardHead('briefcase', 'Čo máme v objednávkach', '', '', 'subcontracts', 'card.book')}
        <div style="color:var(--ink-mute);font-size:13px;">Žiadna bežiaca zákazka.</div>
      </div>`;
    }
    return `<div class="card card-pad">
      ${this._cardHead('briefcase', 'Čo máme v objednávkach',
        this._cardPills('bookSort', [['remaining', 'podľa sumy'], ['days', 'podľa termínu']],
          this.dashCard.bookSort), 'book', 'subcontracts')}
      <div class="big-number">${Money.format(b.remaining)}</div>
      <p class="big-note">zostáva odrobiť na ${b.sites} ${
        Shell.plural(b.sites, 'zákazke', 'zákazkách', 'zákazkách')} s ${b.people} ${
        Shell.plural(b.people, 'človekom', 'ľuďmi', 'ľuďmi')}.</p>
      ${this._bookRows(x).slice(0, 5).map(r => `
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
      ${DanubraChart.split({
        parts: this._bookRows(x).slice(0, 5).map(r => ({ label: r.title, value: r.remaining })),
        aria: 'Koľko zostáva odrobiť na jednotlivých zákazkách',
      })}
    </div>`;
  },

  /** Peniaze viazané v refakturovateľných nákladoch. */
  _dashTiedCard(x) {
    const t = x.tied;
    if (!t.total) {
      return `<div class="card card-pad">
        ${this._cardHead('bed', 'Viazne v nákladoch', '', '', 'costs', 'card.tied')}
        <div style="color:var(--ink-mute);font-size:13px;">
          Nič nevisí — všetko refakturovateľné je už vrátené.</div>
      </div>`;
    }
    const CAT = { accommodation: 'Ubytovanie', travel: 'Cestovné', transport: 'Doprava' };
    // Vlastný filter karty: ubytovanie býva väčšina sumy a občas treba vidieť
    // len ten zvyšok. Obdobie prehľadu to nerieši — je to iná otázka.
    const pick = this.dashCard.tiedCat;
    const cats = t.byCategory.filter(c => !pick || c.category === pick);
    const shownTotal = cats.reduce((s, c) => s + c.cents, 0);
    return `<div class="card card-pad">
      ${this._cardHead('bed', 'Viazne v nákladoch',
        t.byCategory.length > 1 ? this._cardPills('tiedCat',
          [['', 'všetko'], ...t.byCategory.map(c => [c.category, CAT[c.category] || c.category])],
          pick) : '', 'tied', 'costs')}
      <div class="big-number" style="color:var(--amber);">${Money.format(shownTotal)}</div>
      <p class="big-note">${pick
        ? `${UI.esc(CAT[pick] || pick)} z celkových ${Money.format(t.total)}`
        : `naše peniaze v ${t.count} ${
          Shell.plural(t.count, 'položke', 'položkách', 'položkách')}`}, ktoré sa majú vrátiť${
        x.siteName2 ? ` — zákazka ${UI.esc(x.siteName2)}` : ''}.
        Nie je to strata — ale teraz v cash-flow chýbajú.</p>
      ${DanubraChart.split({
        parts: cats.map(c => ({ label: CAT[c.category] || c.category, value: c.cents })),
        aria: 'Z čoho sa skladá to, čo viazne v nákladoch',
      })}
    </div>`;
  },

  /** Koho a kam treba zohnať. */
  _dashHiringCard(x) {
    const h = x.hiringNeed;
    if (!h.headcount) {
      return `<div class="card card-pad">
        ${this._cardHead('workers', 'Koho treba zohnať', '', '', 'hiring', 'card.hiring')}
        <div style="color:var(--ink-mute);font-size:13px;">
          Žiadny bežiaci nábor. ${x.candWaiting.length ? `${x.candWaiting.length} ${
            Shell.plural(x.candWaiting.length, 'kandidát čaká', 'kandidáti čakajú', 'kandidátov čaká')} na telefonát.` : ''}</div>
      </div>`;
    }
    return `<div class="card card-pad">
      ${this._cardHead('workers', 'Koho a kam treba zohnať',
        h.urgent ? UI.badge(`${h.urgent} súrne`, 'red') : '', 'hiring', 'hiring')}
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
        ${this._cardHead('shield', 'Vyžaduje pozornosť', '', '', '', 'card.alerts')}
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
      ${this._cardHead('shield', 'Vyžaduje pozornosť',
        `<span class="badge" style="background:var(--amber-50);color:var(--amber);">${alerts.length}</span>`,
        'alerts')}
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
      ${this._cardHead('tasks', 'Čo treba spraviť', '', 'tasks', 'tasks')}
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
      ${this._cardHead('euro', 'Bude na výplaty?', UI.badge(verdict, tone), 'cash', 'bank')}
      <div class="kv" style="margin:0 0 10px;">
        <div><span>Na účte dnes</span><strong>${Money.format(f.startBalance)}</strong></div>
        <div><span>Najnižší bod (8 týždňov)</span><strong style="${f.lowest.balance < 0 ? 'color:var(--red);' : ''}">${
          Money.format(f.lowest.balance)}</strong></div>
        <div><span>Po splatnosti čaká</span><strong>${Money.format(f.overdue.in)}</strong></div>
        <div><span>O osem týždňov</span><strong>${Money.format(f.endBalance)}</strong></div>
      </div>
      ${DanubraChart.spark(f.buckets.map(bk => bk.balance),
        { aria: 'Priebeh zostatku na osem týždňov',
          color: f.negativeFrom ? DanubraChart.OUT : DanubraChart.IN })}
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
      ${this._cardHead('receipt', 'Zarábame na tom?',
        e.marginPct != null ? UI.badge(`marža ${UI.pct(e.marginPct)}`,
          e.marginPct >= 15 ? 'green' : (e.marginPct >= 8 ? 'amber' : 'red')) : '',
        'margin')}
      ${DanubraChart.waterfall({
        steps: [
          { label: 'Fakturované', value: e.invoiced, kind: 'level' },
          { label: 'Živnostníkom', value: -e.bills, kind: 'delta' },
          { label: 'Náklady', value: -e.costs, kind: 'delta' },
          { label: 'Zostáva', value: e.margin, kind: 'level' },
        ],
        height: 170,
        aria: 'Od vyfakturovaného cez náklady k tomu, čo zostáva',
      })}
      <p class="card-note">Za ${UI.esc(DanubraPeriod.short(x.period))}${
        x.siteName2 ? `, ${UI.esc(x.siteName2)}` : ''}.${
        x.billsDisputed.length ? ` ${x.billsDisputed.length} ${
          Shell.plural(x.billsDisputed.length, 'sporná faktúra sa neráta', 'sporné faktúry sa nerátajú', 'sporných faktúr sa neráta')}.` : ''}</p>
    </div>`;
  },

  // ── Ako to ide ────────────────────────────────────────────────────────────
  // Menu je zoradené podľa toho, čo je v databáze. Poradie práce z neho
  // prečítať nejde — a pritom je to tá prvá vec, ktorú sa nový človek musí
  // naučiť. V `docs/FLOW.md` to napísané je, lenže dokument si nikto neotvorí.
  //
  // Táto obrazovka je ten istý reťazec so živými číslami. Počíta ich
  // `DanubraChain`; tu sa len kreslí.

  async _flowLoad() {
    const [ads, plans, cands, wrk, docs, prt, quo, con, subs, asg, ts, per, inv, bills] =
      await Promise.all([
        DB.list('ads', { select: 'id,active', limit: 300 }),
        DB.list('recruitment_plans', { select: 'id,status,headcount', limit: 200 }),
        DB.list('candidates', {
          select: 'id,status,first_contact_at,converted_worker_id', limit: 1000 }),
        DB.list('workers', { select: 'id', limit: 1000 }),
        DB.list('v_worker_documents', { select: 'id,worker_id,validity', limit: 2000 }),
        DB.list('partners', { select: 'id,country,ust_idnr', limit: 300 }),
        DB.list('quotes', { select: 'id,status,valid_until', limit: 300 }),
        DB.list('contracts', { select: 'id,status,signed_at', limit: 300 }),
        DB.list('subcontracts', { select: 'id,status,contract_id', limit: 300 }),
        DB.list('assignments', { select: 'id,subcontract_id,status', limit: 2000 }),
        DB.list('timesheets', { select: 'id,hours,work_date,period_id', limit: 5000 }),
        DB.list('periods', { select: 'id,status,period_to', limit: 500 }),
        DB.list('invoices', { select: 'id,status,due_date', limit: 1000 }),
        DB.list('bills', { select: 'id,status', limit: 1000 }),
      ]);
    const S = (r) => r.data || [];
    return {
      today: this._dayISO(),
      ads: S(ads), plans: S(plans), candidates: S(cands), workers: S(wrk),
      documents: S(docs), partners: S(prt), quotes: S(quo), contracts: S(con),
      subcontracts: S(subs), assignments: S(asg), timesheets: S(ts),
      periods: S(per), invoices: S(inv), bills: S(bills),
    };
  },

  /** Jeden krok reťazca. */
  _flowStep(s) {
    const ide = this.routeAvailable(s.route);
    return `<div class="fl-step fl-${s.state}">
      <div class="fl-n">${s.n}</div>
      <div class="fl-body">
        <div class="fl-head">
          <span class="fl-ico">${Icon(s.ico, 15)}</span>
          <strong class="fl-title">${UI.esc(s.title)}</strong>
          ${Help.btn(`flow.${s.key}`, { size: 13 })}
        </div>
        <p class="fl-lead">${UI.esc(s.lead)}</p>
        <div class="fl-nums">
          <span class="fl-have">${UI.esc(s.haveText)}</span>
          <span class="fl-todo${s.todo ? '' : ' is-clear'}">
            ${s.todo ? Icon(s.state === 'bad' ? 'alert' : 'clock', 13) : Icon('check', 13)}
            ${UI.esc(s.todoText)}</span>
        </div>
        <p class="fl-next">${Icon('chevron', 12)} ${UI.esc(s.next)}</p>
      </div>
      ${ide ? `<button class="fl-go" onclick="Danubra.go('${s.route}')"
        aria-label="Otvoriť ${UI.esc(this.labelOf(s.route))}"
        title="Otvoriť ${UI.esc(this.labelOf(s.route))}">${Icon('chevron', 16)}</button>` : ''}
    </div>`;
  },

  // ── VIEWS ────────────────────────────────────────────────────────────────
  views: {
    async flow(view) {
      view.innerHTML = this.header('Ako to ide') + UI.loading();
      const x = await this._flowLoad();
      const lanes = DanubraChain.lanes(x);
      const kroky = DanubraChain.all(x);
      const head = DanubraChain.headline(kroky);
      const sum = DanubraChain.summary(kroky);

      view.innerHTML = this.header('Ako to ide',
        `${sum.total} krokov · ${sum.blocked
          ? `${sum.blocked} ${Shell.plural(sum.blocked, 'stojí', 'stoja', 'stojí')}`
          : 'nič nestojí'}`) + `
        <div class="headline headline-${head.tone === 'bad' ? 'bad'
          : head.tone === 'watch' ? 'warn' : 'ok'}">
          ${Icon(head.tone === 'bad' ? 'alert' : head.tone === 'watch' ? 'clock' : 'check', 18)}
          <span>${UI.esc(head.text)}</span>
          ${head.step ? `<button class="link-inline"
            onclick="Danubra.go('${head.step.route}')">Otvoriť</button>` : ''}
          ${Help.btn('screen.flow')}
        </div>
        <p class="fl-intro">Takto ide práca od začiatku po koniec. Ľavá dráha sú
          ľudia, pravá zákazky — stretnú sa v nasadení a odtiaľ je to už jedna
          cesta na účet. Pri každom kroku je vľavo, koľko toho tam je, a vpravo,
          koľko čaká na teba.</p>
        <div class="fl-lanes">
          ${lanes.map(l => `<section class="fl-lane fl-lane-${l.key}">
            <div class="fl-lane-head">
              <h2>${UI.esc(l.label)}</h2>
              <p>${UI.esc(l.lead)}</p>
            </div>
            ${l.steps.map(s => this._flowStep(s)).join('')}
          </section>`).join('')}
        </div>`;
    },

    async dashboard(view) {
      const today = new Date().toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
      const datum = UI.esc(today.charAt(0).toUpperCase() + today.slice(1));
      view.innerHTML = this.header('Prehľad', datum) + UI.loading();

      const x = await this._dashLoad();
      // Export si dáta neťahá znova — vyváža presne to, čo je na obrazovke.
      this._dashData = x;

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

      // Šesť čísel. Číslo aj zoznam za ním počíta `DanubraDetail` z tých istých
      // riadkov — preto sa tu už nič neráta druhýkrát.
      const kpis = DanubraDetail.all(x.kpiData);
      // „Len čo treba riešiť" necháva na obrazovke dlaždice, ktoré nie sú
      // v pokoji. Nemení to čísla — mení to, koľko ich treba prejsť očami.
      const vidno = this.dashFilter.onlyIssues
        ? kpis.filter(d => d.state !== DanubraDetail.CALM) : kpis;

      // Číslo v hlavičke je to isté, ktoré je na dlaždici — nie druhý výpočet.
      const naStavbach = (kpis.find(d => d.key === 'deployed') || {}).total || 0;
      view.innerHTML =
        this.header('Prehľad', `${datum} · ${naStavbach} ${
          Shell.plural(naStavbach, 'človek na stavbách', 'ľudia na stavbách', 'ľudí na stavbách')}`) + `
        <!-- Vidieť len na papieri. Bez toho by v PDF nebolo napísané, čoho
             sa tie čísla týkajú, a o týždeň by to nikto nevedel. -->
        <!-- Na papieri je meno firmy z Nastavení, nie názov appky. Tento
             súbor ide účtovníčke alebo do šanónu a tam je podstatné, čia
             firma to je. -->
        <div class="print-head">
          <strong>${UI.esc((window.Cfg && (Cfg.j('supplier') || {}).name) || 'Prehľad')}${
            (window.Cfg && (Cfg.j('supplier') || {}).name) ? ' — Prehľad' : ''}</strong>
          <span>${UI.esc(DanubraPeriod.text(x.period))}${
            x.siteName2 ? ` · zákazka ${UI.esc(x.siteName2)}` : ''} ·
            vytlačené ${UI.esc(today)}</span>
        </div>
        <div class="headline headline-${line.tone === 'bad' ? 'bad' : line.tone === 'warn' ? 'warn' : 'ok'}">
          ${Icon(line.tone === 'bad' ? 'alert' : line.tone === 'warn' ? 'clock' : 'check', 18)}
          <span>${UI.esc(line.text)}</span>
          ${Help.btn('dash.headline')}
        </div>
        ${vidno.length ? `<div class="kpi-grid">
          ${vidno.map(d => `
            <div class="kpi kpi-${d.state}">
              <div class="kpi-top">
                <span class="kpi-ico">${Icon(d.ico, 14)}</span>
                <span class="kpi-label">${UI.esc(d.tile)}</span>
                ${Help.btn(`kpi.${d.key}`, { size: 13 })}
              </div>
              <button class="kpi-hit no-print" onclick="Danubra.kpiDetail('${d.key}')"
                aria-label="${UI.esc(d.tile)}: ukázať, ktoré">
                <span class="kpi-value">${d.total}${
                  d.unit ? `<em>${UI.esc(d.unit)}</em>` : ''}</span>
                <span class="kpi-sub">${UI.esc(d.sub)}</span>
              </button>
            </div>`).join('')}
        </div>` : `<div class="headline headline-ok">${Icon('check', 18)}
          <span>Žiadne z čísel si dnes nepýta pozornosť.</span>
          <button class="link-inline" onclick="Danubra.toggleDashIssues()">Ukázať všetky</button>
        </div>`}
        ${this._demoBanner(x)}
        ${this._dashFilterBar(x)}
        ${this._dashTabsHtml(x, alerts)}`;
    },
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
