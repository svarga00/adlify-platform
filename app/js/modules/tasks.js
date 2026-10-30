// ============================================================================
// DANUBRA — Úlohy a pripomienky
// ============================================================================
// Agenda podľa času. Hore sa vyberie, koho úlohy (Moje · Všetky ·
// Nepriradené · kolega), pod tým jeden riadok na rýchle zapísanie a súhrn
// „X po termíne · X dnes · X tento týždeň". Zoznam je tabuľka po sekciách:
//
//   po termíne → dnes → zajtra → tento týždeň → neskôr → bez termínu
//
// Ľudia sú **používatelia appky** (danubra_members), nie mená, ktoré sa
// kedysi napísali do úloh. Meno v úlohe, ktoré medzi nimi nie je, sa ukáže
// sivo „mimo appky" a dá sa prehodiť na člena.
//
// Väčšina úloh sem nepribúda ručne — vznikajú z pravidiel (F9, migrácia 021).
// Pravidlo je riadok v tabuľke, nie kus kódu, takže nové sa dá pridať bez
// nasadenia.
//
// Logika (sekcie, termín po ľudsky, rýchle zapísanie, kto je kto) je
// v lib/tasks.js a má testy.
// ============================================================================
(function () {
  const STATUS = [['open', 'Otvorená', 'amber'], ['in_progress', 'Rozpracovaná', 'blue'],
    ['done', 'Hotová', 'green'], ['cancelled', 'Zrušená', 'gray']];
  const PRIO = [['high', 'Vysoká', 'red'], ['normal', 'Bežná', 'gray'], ['low', 'Nízka', 'gray']];
  const PRIO_LABEL = { urgent: 'Súrne', high: 'Vysoká', normal: 'Bežná', low: 'Nízka' };
  const ENTITY = {
    inquiry: ['Dopyt', 'inquiries'], order: ['Objednávka', 'orders'],
    subcontract: ['Zákazka', 'subcontracts'], worker: ['Pracovník', 'workers'],
    client: ['Klient', 'clients'], partner: ['Odberateľ', 'partners'], invoice: ['Faktúra', 'invoices'],
    contract: ['Zmluva', 'contracts'], quote: ['Ponuka', 'quotes'],
    candidate: ['Kandidát', 'candidates'], crew: ['Partia', 'crews'],
    bill: ['Prijatá faktúra', 'costs'],
  };
  // Filter stavu. „Na riešenie" je predvolený: otvorené a rozpracované,
  // ktoré nie sú odložené. Zrušené sa ukážu len tu, nech zoznam nezahlcujú.
  const SHOW = [['active', 'Na riešenie'], ['open', 'Len otvorené'], ['in_progress', 'Len rozpracované'],
    ['done', 'Hotové'], ['cancelled', 'Zrušené'], ['all', 'Všetky stavy']];
  // Farba krúžku s iniciálami — z mena, takže ten istý človek má vždy tú istú.
  const AV_COLORS = ['#1E4FD8', '#1F9D57', '#C25C0C', '#6B4FC8', '#0E7C86', '#B8336A', '#41557F', '#8A6A12'];

  const T = () => window.DanubraTasks;

  const Tsk = {
    items: [], loaded: false,
    filters: { status: 'active', scope: null, q: '', sort: 'prio', dir: 1 },
    showDone: false,

    rules: [],

    async load() {
      const [t, r] = await Promise.all([
        DB.list('tasks', { order: { column: 'due_date' }, limit: 500 }),
        DB.list('task_rules', { order: { column: 'key' }, limit: 100 }),
      ]);
      this.items = t.data || [];
      this.rules = r.data || [];
      this.loaded = true;
    },

    badge(s) { const m = STATUS.find(x => x[0] === s) || STATUS[0]; return UI.badge(m[1], m[2]); },
    today() { return new Date().toISOString().slice(0, 10); },
    isLate(t) { return t.status !== 'done' && t.status !== 'cancelled' && t.due_date && t.due_date < this.today(); },
    isAuto(t) { return ['cron', 'rule', 'system'].includes(t.source) || t.level === 'auto'; },
    find(id) { return this.items.find(x => x.id === id); },

    // ── Ľudia ─────────────────────────────────────────────────────────────
    /** Všetci členovia (aj neaktívni — aby sa stará úloha nepriradila „mimo appky"). */
    allMembers() {
      const list = (Danubra.members || []).filter(Boolean);
      const me = Danubra.me;
      return me && me.id && !list.some(m => m.id === me.id) ? [...list, me] : list;
    },
    /** Komu sa dá úloha priradiť: aktívni členovia s menom alebo e-mailom. */
    members() {
      return this.allMembers()
        .filter(m => m.active !== false && T().memberName(m))
        .sort((a, b) => T().memberName(a).localeCompare(T().memberName(b), 'sk'));
    },
    owner(t) { return T().ownerOf(t, this.allMembers()); },

    /**
     * Kto som ja. Predvolene prihlásený člen; v malom menu „Vy:" sa dá
     * zmeniť (pamätá si to len tento prehliadač).
     */
    _meKey: 'danubra_task_me_id',
    meMember() {
      const act = this.members();
      let id = '';
      try { id = localStorage.getItem(this._meKey) || ''; } catch {}
      const pick = id && act.find(m => String(m.id) === id);
      if (pick) return pick;
      const me = Danubra.me;
      return me && me.id && T().memberName(me) ? me : null;
    },
    me() { return T().memberName(this.meMember()); },
    setMe(id) {
      try { id ? localStorage.setItem(this._meKey, id) : localStorage.removeItem(this._meKey); } catch {}
      this.filters.scope = null;
      Danubra.renderRoute();
    },
    isMine(t) {
      const me = this.meMember(), o = this.owner(t);
      return !!(me && o.member && o.member.id === me.id);
    },

    /** Čo ukázať pri „Čoho sa týka". Interné číslo (uuid) nikomu nič nepovie. */
    entityText(t) {
      const s = String(t && t.entity_label || '').trim();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s) ? '' : s;
    },

    // ── Rozsah a filtre ───────────────────────────────────────────────────
    /** 'all' | 'none' | 'm:<člen>' | 'x:<meno mimo appky>'. Predvolene „Moje". */
    scope() {
      if (this.filters.scope) return this.filters.scope;
      const me = this.meMember();
      return me ? `m:${me.id}` : 'all';
    },
    setScope(v) { this.filters.scope = v || 'all'; Danubra.renderRoute(); },
    scoped() { return this.items.filter(t => T().inScope(t, this.scope(), this.allMembers())); },
    setQ(v) { this.filters.q = v; this.paintList(); },
    setF(v) { this.filters.status = v; Danubra.renderRoute(); },
    sortBy(k) {
      const f = this.filters;
      if (f.sort === k) f.dir = -f.dir; else { f.sort = k; f.dir = 1; }
      this.paintList();
    },
    toggleDone() { this.showDone = !this.showDone; this.paintList(); },

    /** Úlohy po filtroch — zoznam aj export berú to isté. */
    rows() {
      const f = this.filters, today = this.today();
      let rows = this.scoped();
      if (f.status === 'active') rows = rows.filter(t => T().isActive(t, today));
      else if (f.status === 'open' || f.status === 'in_progress') {
        rows = rows.filter(t => t.status === f.status && T().isActive(t, today));
      } else if (f.status !== 'all') rows = rows.filter(t => t.status === f.status);
      return this._search(rows);
    },
    _search(rows) {
      return Shell.filterRows(rows, {
        q: this.filters.q, fields: ['title', 'description', 'entity_label', 'assigned_name'],
      });
    },

    // ── Obrazovka ─────────────────────────────────────────────────────────
    async view(el) {
      Danubra.setActions(
        `<button class="btn btn-outline btn-sm" onclick="Tsk.exportCsv()" title="Exportovať do CSV to, čo je práve vidieť">${Icon('download', 14)} Export</button>
         <button class="btn btn-outline btn-sm" onclick="Tsk.rulesView()">${Icon('rules', 14)} Pravidlá</button>
         <button class="btn btn-primary btn-sm" onclick="Tsk.form()">${Icon('plus')} Nová úloha</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      this._badge();

      el.innerHTML = Danubra.header('Úlohy a pripomienky', this._sub())
        + `<div class="tk">
            ${this.topHtml()}
            ${this.toolsHtml()}
            <div id="tk-list">${this.listHtml()}</div>
          </div>`;
      this._bindMenus();
    },

    /** Prekreslí len zoznam — pole hľadania tak nestratí kurzor pri písaní. */
    paintList() {
      const box = document.getElementById('tk-list');
      if (!box) return Danubra.renderRoute();
      box.innerHTML = this.listHtml();
    },

    _sub() {
      const s = this.scope(), me = this.meMember();
      if (me && s === `m:${me.id}`) return 'Vaše úlohy podľa toho, čo horí';
      if (s === 'all') return 'Úlohy celej firmy podľa toho, čo horí';
      if (s === 'none') return 'Úlohy, ktoré nemá nikto na starosti';
      if (s.startsWith('m:')) {
        const m = this.allMembers().find(x => `m:${x.id}` === s);
        return `Čo má na starosti ${UI.esc(T().memberName(m) || 'kolega')}`;
      }
      return `Úlohy s menom ${UI.esc(s.slice(2))} — toto meno nie je medzi používateľmi appky`;
    },

    /**
     * Odznak pri „Úlohy" v menu: po termíne + dnes za celú firmu, rovnako ako
     * ho počíta prehľad. Po zmene na tejto obrazovke sa hneď prepočíta.
     */
    _badge() {
      if (!Danubra.badges) return;
      const c = T().counts(this.items, this.today());
      const n = c.overdue + c.today;
      if ((Danubra.badges.tasks || 0) !== n) {
        Danubra.badges.tasks = n;
        if (typeof Danubra._buildNav === 'function') Danubra._buildNav();
      }
    },

    /** Prepínač Moje · Všetky · Nepriradené, rýchle zapísanie a súhrn. */
    topHtml() {
      const scope = this.scope(), me = this.meMember(), mem = this.allMembers();
      const today = this.today();
      const active = this.items.filter(t => T().isActive(t, today));
      const n = (s) => active.filter(t => T().inScope(t, s, mem)).length;
      const seg = (v, label, ico) => `<button class="tk-seg${scope === v ? ' on' : ''}"
          aria-pressed="${scope === v}" onclick="Tsk.setScope('${UI.esc(v)}')">
          ${Icon(ico, 15)}<span>${label}</span><em>${n(v)}</em></button>`;

      const others = this.members().filter(m => !me || m.id !== me.id);
      const outside = T().outsideNames(this.items, mem);
      const isOther = (scope.startsWith('m:') && !(me && scope === `m:${me.id}`)) || scope.startsWith('x:');
      const colleague = others.length || outside.length ? `
        <label class="tk-colleague${isOther ? ' on' : ''}">
          ${Icon('workers', 15)}
          <select onchange="Tsk.setScope(this.value || 'all')" aria-label="Úlohy kolegu">
            <option value="">Kolega…</option>
            ${others.map(m => `<option value="m:${UI.esc(m.id)}"${scope === `m:${m.id}` ? ' selected' : ''}>${
              UI.esc(T().memberName(m))} (${n(`m:${m.id}`)})</option>`).join('')}
            ${outside.length ? `<optgroup label="Mimo appky">
              ${outside.map(x => `<option value="x:${UI.esc(x)}"${scope === `x:${x}` ? ' selected' : ''}>${
                UI.esc(x)} (${n(`x:${x}`)})</option>`).join('')}</optgroup>` : ''}
          </select>
        </label>` : '';

      const s = T().summary(this.scoped(), today);
      const chip = (key, count, label, tone) => count
        ? `<button class="tk-chip tk-chip-${tone}" onclick="Tsk.jump('${key}')"
             title="Skočiť na sekciu"><i></i><b>${count}</b> ${label}</button>`
        : `<span class="tk-chip tk-chip-${tone} is-zero"><i></i><b>0</b> ${label}</span>`;
      const calm = !s.overdue && !s.today
        ? `<span class="tk-calm">${Icon('check', 15)} Na dnes máte hotovo.</span>` : '';

      return `<div class="tk-top card">
        <div class="tk-scope">
          <div class="tk-segs" role="group" aria-label="Koho úlohy">
            ${me ? seg(`m:${me.id}`, 'Moje', 'user') : ''}
            ${seg('all', 'Všetky', 'tasks')}
            ${seg('none', 'Nepriradené', 'inbox')}
          </div>
          ${colleague}
          ${this.meMenu()}
        </div>
        <form class="tk-quick" onsubmit="event.preventDefault();Tsk.quickAdd()" autocomplete="off">
          <span class="tk-quick-ico">${Icon('plus', 17)}</span>
          <input id="tk-quick" type="text" enterkeyhint="done" maxlength="300"
            placeholder="Napíšte úlohu a stlačte Enter…" aria-label="Nová úloha — napíšte a stlačte Enter"
            oninput="Tsk.quickHint(this.value)">
          <span id="tk-quick-hint" class="tk-quick-hint" aria-live="polite"></span>
          ${UI.tip(T().QUICK_HELP)}
          <button type="button" class="btn btn-ghost btn-sm tk-more" onclick="Tsk.formFromQuick()"
            title="Otvoriť celý formulár — podrobnosti, termín, priorita, riešiteľ">Viac…</button>
        </form>
        <div class="tk-sum">
          ${chip('overdue', s.overdue, 'po termíne', 'red')}
          ${chip('today', s.today, 'dnes', 'amber')}
          ${chip('week', s.week, 'tento týždeň', 'gray')}
          ${calm}
        </div>
      </div>`;
    },

    /** Malé menu „Vy: meno". Nie veľký prvok — väčšinou netreba nič meniť. */
    meMenu() {
      const list = this.members();
      if (!list.length) return '';
      const me = this.meMember();
      return `<details class="tk-menu tk-me">
        <summary title="Za koho sa rátajú „Moje" úlohy">
          <span class="tk-me-l">Vy:</span> <b>${UI.esc(me ? T().memberName(me) : 'vyberte sa')}</b>${Icon('chevron', 12)}
        </summary>
        <div class="tk-pop">
          <div class="tk-pop-h">Kto ste?</div>
          ${list.map(m => `<button type="button" class="tk-pop-i${me && me.id === m.id ? ' on' : ''}"
              onclick="Tsk.setMe('${UI.esc(m.id)}')">${this.avatar({ kind: 'member', name: T().memberName(m) })}
              <span>${UI.esc(T().memberName(m))}</span></button>`).join('')}
          <p class="tk-pop-note">Predvolene ste to Vy — prihlásený používateľ. Zmena platí len
            v tomto prehliadači.</p>
        </div>
      </details>`;
    },

    /** Hľadanie a filter stavu — jeden nenápadný riadok nad zoznamom. */
    toolsHtml() {
      const f = this.filters;
      return `<div class="tk-tools">
        <label class="tk-search">${Icon('search', 15)}
          <input type="search" value="${UI.esc(f.q)}" placeholder="Hľadať úlohu, záznam, meno…"
            oninput="Tsk.setQ(this.value)" aria-label="Hľadať v úlohách"></label>
        <label class="tk-filter">${Icon('filter', 14)}
          <select onchange="Tsk.setF(this.value)" aria-label="Stav úloh">
            ${SHOW.map(([v, l]) => `<option value="${v}"${f.status === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select></label>
        ${UI.tip('„Na riešenie" = otvorené a rozpracované úlohy, ktoré nie sú odložené. Hotové za posledný týždeň sú zbalené na konci zoznamu, zrušené nájdete vo filtri „Zrušené". Úlohy so štítkom „automat" založila appka sama podľa pravidiel (napr. končí A1).')}
      </div>`;
    },

    /** Skok na sekciu po kliknutí na čip v súhrne. */
    jump(key) {
      if (!['active', 'all'].includes(this.filters.status) || this.filters.q) {
        this.filters.status = 'active'; this.filters.q = '';
        Danubra.renderRoute();
      }
      const keys = key === 'week' ? ['tomorrow', 'week'] : [key];
      setTimeout(() => {
        const el = keys.map(k => document.getElementById(`tk-sec-${k}`)).find(Boolean);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash');
      }, 30);
    },

    // ── Zoznam ────────────────────────────────────────────────────────────
    listHtml() {
      const f = this.filters, today = this.today();
      const rows = this.rows();
      const nameOf = (t) => this.owner(t).name;
      let body = '', count = 0;

      if (['active', 'open', 'in_progress', 'all'].includes(f.status)) {
        const secs = T().agenda(rows, today, { sort: f.sort, dir: f.dir, nameOf });
        body = secs.map(s => this.secHtml(s.key, s.label, s.tone, s.tasks)).join('');
        count = secs.reduce((a, s) => a + s.tasks.length, 0);

        if (f.status === 'all') {
          const snoozed = rows.filter(t => t.status !== 'done' && t.status !== 'cancelled' && !T().isActive(t, today));
          const done = rows.filter(t => t.status === 'done')
            .sort((a, b) => String(b.done_at || '').localeCompare(String(a.done_at || '')));
          const canc = T().sortTasks(rows.filter(t => t.status === 'cancelled'), 'due', -1);
          if (snoozed.length) body += this.secHtml('snoozed', 'Odložené', 'gray', T().sortTasks(snoozed, 'due'));
          if (done.length) body += this.secHtml('done', 'Hotové', 'green', done);
          if (canc.length) body += this.secHtml('cancelled', 'Zrušené', 'gray', canc);
          count = rows.length;
        }
      } else {
        const list = f.status === 'done'
          ? rows.slice().sort((a, b) => String(b.done_at || '').localeCompare(String(a.done_at || '')))
          : T().sortTasks(rows, f.sort, f.dir, nameOf);
        const label = (SHOW.find(x => x[0] === f.status) || [])[1] || '';
        if (list.length) body = this.secHtml(f.status, label, f.status === 'done' ? 'green' : 'gray', list);
        count = list.length;
      }

      // Hotové za posledný týždeň — zbalené na konci, nech je vidieť, čo sa
      // spravilo, ale nezavadzia to.
      let doneBox = '';
      if (f.status === 'active') {
        const done = this._search(T().recentDone(this.scoped(), today, 7));
        if (done.length) {
          doneBox = `<button class="tk-sec tk-sec-fold${this.showDone ? ' open' : ''}" id="tk-sec-done"
              onclick="Tsk.toggleDone()" aria-expanded="${this.showDone}">
              ${Icon('chevron', 13)}<span class="tk-sec-l">Hotové (posledných 7 dní)</span>
              <span class="tk-sec-n">${done.length}</span>
              <span class="tk-sec-hint">${this.showDone ? 'Skryť' : 'Ukázať'}</span></button>
            ${this.showDone ? done.map(t => this.row(t)).join('') : ''}`;
        }
      }

      const snoozedNote = this._snoozedNote();
      if (!count && !doneBox) return this._empty() + snoozedNote;
      return `<div class="tk-table card" role="table" aria-label="Úlohy">
          ${count ? this.headHtml() : ''}
          ${count ? body : `<div class="tk-empty-in">${this._empty()}</div>`}
          ${doneBox}
        </div>${snoozedNote}`;
    },

    _empty() {
      const f = this.filters, s = this.scope(), me = this.meMember();
      if (f.q) return UI.empty('search', 'Hľadaniu nič nezodpovedá', 'Skúste iné slovo alebo iný filter stavu.');
      if (f.status === 'done') return UI.empty('check', 'Zatiaľ nič hotové', 'Keď úlohu odškrtnete, nájdete ju tu.');
      if (f.status === 'cancelled') return UI.empty('archive', 'Žiadne zrušené úlohy', 'Zrušené úlohy sa nemažú — keď nejaká bude, nájdete ju tu.');
      if (s === 'none') return UI.empty('check', 'Každá úloha má riešiteľa', 'Nič nevisí na nikom.');
      if (me && s === `m:${me.id}`) {
        return UI.empty('check', 'Na dnes máte hotovo.',
          'Nič Vám nehorí. Novú úlohu napíšte do riadku vyššie a stlačte Enter.');
      }
      return UI.empty('check', 'Všetko je vybavené.', 'Nikde nič nehorí. Novú úlohu napíšte do riadku vyššie.');
    },

    _snoozedNote() {
      if (this.filters.status !== 'active') return '';
      const today = this.today();
      const n = this.scoped().filter(t => t.status !== 'done' && t.status !== 'cancelled'
        && !T().isActive(t, today)).length;
      if (!n) return '';
      return `<p class="tk-note">${Icon('clock', 13)}
        ${n} ${T().plural(n, 'úloha je odložená', 'úlohy sú odložené', 'úloh je odložených')} na neskôr —
        vrátia sa samy, keď dôjde ich deň.
        <button class="tk-link" onclick="Tsk.setF('all')">Ukázať</button></p>`;
    },

    headHtml() {
      const f = this.filters;
      const th = (cls, label, key) => key
        ? `<button class="tk-th ${cls} tk-sort${f.sort === key ? ` on${f.dir < 0 ? ' desc' : ''}` : ''}"
             onclick="Tsk.sortBy('${key}')" title="Zoradiť podľa: ${label}">${label}${Icon('chevron', 11)}</button>`
        : `<span class="tk-th ${cls}">${label}</span>`;
      return `<div class="tk-head" role="row">
        ${th('c-chk', '')}
        ${th('c-title', 'Úloha')}
        ${th('c-ent', 'Čoho sa týka')}
        ${th('c-due', 'Termín', 'due')}
        ${th('c-prio', 'Priorita', 'prio')}
        ${th('c-st', 'Stav')}
        ${th('c-who', 'Rieši', 'who')}
        ${th('c-src', 'Zdroj')}
        ${th('c-acts', '')}
      </div>`;
    },

    secHtml(key, label, tone, tasks) {
      return `<div class="tk-sec tk-sec-${tone}" id="tk-sec-${key}" role="row">
          <i></i><span class="tk-sec-l">${UI.esc(label)}</span><span class="tk-sec-n">${tasks.length}</span>
        </div>${tasks.map(t => this.row(t)).join('')}`;
    },

    /** Krúžok s iniciálami. Prázdny „–" = nikto; čiarkovaný = meno mimo appky. */
    avatar(o) {
      if (!o || o.kind === 'none') return '<span class="tk-av is-none" aria-hidden="true">–</span>';
      const ini = T().initials(o.name) || '?';
      if (o.kind === 'outside') return `<span class="tk-av is-out" aria-hidden="true">${UI.esc(ini)}</span>`;
      let h = 0;
      for (const ch of String(o.name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      return `<span class="tk-av" style="--av:${AV_COLORS[h % AV_COLORS.length]}" aria-hidden="true">${UI.esc(ini)}</span>`;
    },

    /**
     * Pod relatívnym termínom: dátum a nenápadný odpočet („zostáva 2 d 4 h"),
     * pod tým tenký pruh, koľko času od založenia už ubehlo. Nebliká nič.
     */
    dueSmall(t, rel, open) {
      if (!t.due_date) return '';
      const cd = open ? T().countdown(t) : null;
      const date = rel.days != null && Math.abs(rel.days) <= 60 ? this.shortDate(t.due_date) : '';
      const txt = cd && cd.tone !== 'late' ? cd.text : '';
      const bar = cd && cd.pct != null
        ? `<i class="tk-bar${cd.tone === 'late' ? ' is-late' : cd.pct >= 0.75 ? ' is-near' : ''}" aria-hidden="true">
            <i style="width:${Math.round(cd.pct * 100)}%"></i></i>` : '';
      return `${date ? `<small>${UI.esc(date)}</small>` : ''}${
        txt || bar ? `<span class="tk-cd">${bar}${UI.esc(txt)}</span>` : ''}`;
    },

    shortDate(d) {
      const [y, m, dd] = String(d || '').slice(0, 10).split('-');
      return dd ? `${Number(dd)}. ${Number(m)}.${y !== this.today().slice(0, 4) ? ` ${y}` : ''}` : '';
    },

    /**
     * Riadok úlohy. Klik na riadok otvorí detail; krúžok vľavo ju odškrtne,
     * krúžok s iniciálami vpravo ju priradí.
     */
    row(t) {
      const today = this.today();
      const done = t.status === 'done', canc = t.status === 'cancelled', open = !done && !canc;
      const rel = T().relDue(t.due_date, today);
      const late = open && rel.tone === 'late';
      const ent = t.entity_type ? ENTITY[t.entity_type] : null;
      const chip = Danubra.link(t.entity_type, t.entity_id, this.entityText(t) || (ent && ent[0]) || '');
      const desc = String(t.description || '').trim().split('\n')[0];
      const prio = t.priority || 'normal';
      const hi = prio === 'high' || prio === 'urgent';
      const me = this.meMember();
      const id = UI.esc(t.id);

      const dueCell = done
        ? `<b>hotové</b><small>${t.done_at ? this.shortDate(t.done_at) : ''}</small>`
        : `<b>${UI.esc(rel.text)}</b>${this.dueSmall(t, rel, open)}`;

      const st = t.status === 'in_progress'
        ? `<button class="tk-st is-prog" onclick="event.stopPropagation();Tsk.setStatus('${id}','open')"
             title="Rozpracovaná — kliknutím vrátite na Otvorená">Rozpracovaná</button>`
        : open
          ? `<button class="tk-st tk-quiet" onclick="event.stopPropagation();Tsk.setStatus('${id}','in_progress')"
               title="Otvorená — kliknutím označíte, že na nej pracujete">Otvorená</button>`
          : `<span class="tk-st is-${t.status}">${done ? 'Hotová' : 'Zrušená'}</span>`;

      return `
        <div class="tk-row${done ? ' is-done' : ''}${canc ? ' is-cancelled' : ''}${late ? ' is-late' : ''}"
          role="button" tabindex="0" data-id="${id}" onclick="Tsk.detail('${id}')">
          <span class="tk-c c-chk">
            <button class="tk-check${done ? ' on' : ''}" onclick="event.stopPropagation();Tsk.done('${id}',this)"
              title="${done ? 'Vrátiť medzi otvorené' : 'Hotovo'}"
              aria-label="${done ? 'Vrátiť medzi otvorené' : 'Označiť ako hotovú'}">${Icon('check', 14)}</button>
          </span>
          <span class="tk-c c-title">
            <b>${UI.esc(t.title)}</b>
            ${desc ? `<small>${UI.esc(desc)}</small>` : ''}
          </span>
          <span class="tk-c c-who">${this.whoMenu(t)}</span>
          <span class="tk-rest">
            <span class="tk-c c-ent${chip ? '' : ' tk-quiet'}">${chip || '<span class="tk-dash">—</span>'}</span>
            <span class="tk-c c-due tk-due-${late ? 'late' : (open ? rel.tone || 'far' : 'none')}"
              title="${t.due_date ? `Termín: ${UI.date(t.due_date)}` : 'Bez termínu'}">
              ${Icon('calendar', 12)}${dueCell}</span>
            <span class="tk-c c-prio${hi ? '' : ' tk-quiet'}">${hi
              ? `<span class="tk-prio is-high">${PRIO_LABEL[prio]}</span>`
              : `<span class="tk-prio">${PRIO_LABEL[prio] || UI.esc(prio)}</span>`}</span>
            <span class="tk-c c-st${t.status === 'open' ? ' tk-quiet' : ''}">${st}</span>
            <span class="tk-c c-src${this.isAuto(t) ? '' : ' tk-quiet'}">${this.isAuto(t)
              ? `<span class="tk-auto" title="Založila appka sama podľa pravidla">${Icon('zap', 11)} automat</span>`
              : '<span class="tk-manual">ručne</span>'}</span>
            <span class="tk-c c-acts">
              ${open ? `<button class="tk-act tk-act-done" onclick="event.stopPropagation();Tsk.done('${id}',this)"
                  title="Hotovo" aria-label="Hotovo">${Icon('check', 15)}</button>
                ${this.snoozeMenu(t)}
                ${me && !this.isMine(t) ? `<button class="tk-act" onclick="event.stopPropagation();Tsk.assign('${id}','${UI.esc(me.id)}')"
                  title="Beriem si to" aria-label="Beriem si to">${Icon('user', 15)}</button>` : ''}` : ''}
              <button class="tk-act" onclick="event.stopPropagation();Tsk.detail('${id}')"
                title="Otvoriť detail" aria-label="Otvoriť detail">${Icon('chevron', 15)}</button>
            </span>
          </span>
        </div>`;
    },

    /** Riešiteľ: krúžok + meno. Klik otvorí malé menu „Priradiť mne / komu". */
    whoMenu(t) {
      const o = this.owner(t), me = this.meMember(), id = UI.esc(t.id);
      const label = o.kind === 'none' ? '<span class="tk-who-n is-none">Nepriradené</span>'
        : o.kind === 'outside' ? `<span class="tk-who-n is-out">${UI.esc(o.name)}<em>mimo appky</em></span>`
          : `<span class="tk-who-n">${UI.esc(o.name)}</span>`;
      const title = o.kind === 'none' ? 'Nikto — kliknutím priradíte'
        : o.kind === 'outside' ? `${o.name} — nie je medzi používateľmi appky, kliknutím prehodíte`
          : `${o.name} — kliknutím zmeníte`;
      const mine = this.isMine(t);
      return `<details class="tk-menu tk-who" onclick="event.stopPropagation()">
        <summary title="${UI.esc(title)}" aria-label="Rieši: ${UI.esc(o.name || 'nikto')}">${this.avatar(o)}${label}</summary>
        <div class="tk-pop">
          <div class="tk-pop-h">Kto to rieši</div>
          ${o.kind === 'outside' ? `<p class="tk-pop-note">„${UI.esc(o.name)}" nie je medzi používateľmi
            appky. Vyberte, komu úlohu prehodiť.</p>` : ''}
          ${me && !mine ? `<button type="button" class="tk-pop-i tk-pop-me"
              onclick="Tsk.assign('${id}','${UI.esc(me.id)}')">${Icon('user', 14)}<span>Priradiť mne</span></button>` : ''}
          ${this.members().map(m => `<button type="button" class="tk-pop-i${o.member && o.member.id === m.id ? ' on' : ''}"
              onclick="Tsk.assign('${id}','${UI.esc(m.id)}')">${this.avatar({ kind: 'member', name: T().memberName(m) })}
              <span>${UI.esc(T().memberName(m))}</span>${o.member && o.member.id === m.id ? Icon('check', 13) : ''}</button>`).join('')}
          ${o.kind !== 'none' ? `<button type="button" class="tk-pop-i" onclick="Tsk.assign('${id}','')">
              ${this.avatar(null)}<span>Nikto</span></button>` : ''}
        </div>
      </details>`;
    },

    snoozeMenu(t) {
      const today = this.today(), id = UI.esc(t.id);
      return `<details class="tk-menu tk-snz" onclick="event.stopPropagation()">
        <summary class="tk-act" title="Odložiť" aria-label="Odložiť">${Icon('clock', 15)}</summary>
        <div class="tk-pop">
          <div class="tk-pop-h">Odložiť na</div>
          ${[['1d', '+1 deň'], ['3d', '+3 dni'], ['monday', 'Budúci pondelok']].map(([k, l]) =>
            `<button type="button" class="tk-pop-i" onclick="Tsk.snooze('${id}','${k}')">
              <span>${l}</span><em>${this.shortDate(T().snoozeDate(t, k, today))}</em></button>`).join('')}
          <button type="button" class="tk-pop-i" onclick="Tsk.snooze('${id}','pick')">
            ${Icon('calendar', 13)}<span>Vybrať dátum…</span></button>
        </div>
      </details>`;
    },

    /**
     * Menu v riadkoch sú `<details>`. Otvorené sa zavrie klikom inde alebo
     * Esc; naraz je otvorené len jedno. Pri spodnom okraji sa otvorí nahor.
     */
    _bindMenus() {
      if (this._menusBound) return;
      this._menusBound = true;
      const closeAll = (except) => document.querySelectorAll('details.tk-menu[open]')
        .forEach(d => { if (d !== except) d.open = false; });
      document.addEventListener('click', (e) => {
        const d = e.target.closest && e.target.closest('details.tk-menu');
        closeAll(d);
        // Po výbere položky sa menu zavrie.
        if (d && e.target.closest('.tk-pop-i')) d.open = false;
      });
      document.addEventListener('toggle', (e) => {
        const d = e.target;
        if (!d.matches || !d.matches('details.tk-menu') || !d.open) return;
        closeAll(d);
        const pop = d.querySelector('.tk-pop');
        if (!pop) return;
        pop.classList.remove('up', 'left');
        const r = pop.getBoundingClientRect();
        if (r.bottom > window.innerHeight - 8 && r.height < d.getBoundingClientRect().top - 8) pop.classList.add('up');
        if (r.left < 8) pop.classList.add('left');
      }, true);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.querySelector('details.tk-menu[open]')) {
          e.preventDefault(); e.stopPropagation(); closeAll(null);
        }
      }, true);
    },

    // ── Rýchle zapísanie ──────────────────────────────────────────────────
    quickHint(v) {
      const box = document.getElementById('tk-quick-hint');
      if (!box) return;
      if (!String(v || '').trim()) { box.innerHTML = ''; return; }
      const p = T().parseQuick(v, this.today());
      const rel = T().relDue(p.due_date, this.today());
      box.innerHTML = `${Icon('calendar', 12)} ${UI.esc(rel.text)}${p.high ? ' · <b>vysoká</b>' : ''}`;
    },

    /**
     * Enter v poli založí úlohu: na mňa, termín dnes (alebo čo je v texte),
     * bežná priorita (alebo vysoká s „!"). Zapisuje sa rovnako ako z formulára.
     */
    async quickAdd() {
      const inp = document.getElementById('tk-quick');
      if (!inp || this._adding) return;
      const today = this.today();
      const p = T().parseQuick(inp.value, today);
      if (!p.title) { UI.toast('Napíšte, čo treba spraviť', 'err'); inp.focus(); return; }
      const me = this.meMember();
      // `level` ani `source` sa neposielajú — rovnako ako pri formulári ich
      // doplní databáza (ručne založená úloha).
      const payload = {
        title: p.title, status: 'open', priority: p.priority, due_date: p.due_date,
        ...(me ? T().assignPatch(me) : {}),
      };
      this._adding = true;
      const res = await DB.insert('tasks', payload);
      this._adding = false;
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      await this.load();
      await Danubra.renderRoute();
      const again = document.getElementById('tk-quick');
      if (again) again.focus();
      UI.toast(`Pridané: ${p.title} — ${T().relDue(p.due_date, today).text}${p.high ? ', vysoká priorita' : ''}`, 'ok');
    },

    exportCsv() {
      Shell.exportCsv(this.rows(), [
        ['Úloha', t => t.title],
        ['Podrobnosti', t => t.description],
        ['Termín', t => t.due_date],
        ['Stav', t => (STATUS.find(x => x[0] === t.status) || [])[1] || t.status],
        ['Priorita', t => PRIO_LABEL[t.priority] || t.priority],
        ['Kto', t => this.owner(t).name],
        ['Čoho sa týka', t => this.entityText(t)],
        ['Odkiaľ', t => (this.isAuto(t) ? 'automat' : 'ručne')],
      ], ['ulohy']);
    },

    // ── Pravidlá ──────────────────────────────────────────────────────────
    // v1 mala tieto pravidlá zadrôtované v crone. Tu sú to riadky, takže je
    // vidieť, čo appka sleduje, a dá sa to vypnúť bez nasadenia.
    rulesView() {
      const row = (r) => {
        const d = DanubraTasks.describeRule(r);
        const mine = this.items.filter(t => t.rule_id === r.id && t.status !== 'done').length;
        return `<div class="list-row" style="align-items:flex-start;">
          <button class="btn btn-ghost btn-sm" style="padding:2px 4px;color:${r.active ? 'var(--green)' : 'var(--ink-mute)'};"
            onclick="Tsk.toggleRule('${r.id}', ${!r.active})"
            title="${r.active ? 'Vypnúť pravidlo' : 'Zapnúť pravidlo'}">${Icon(r.active ? 'check' : 'x', 17)}</button>
          <span style="flex:1;font-size:13px;">
            <strong style="${r.active ? '' : 'opacity:.55;'}">${UI.esc(r.title)}</strong>
            ${mine ? UI.badge(`${mine} otvorených`, 'amber') : ''}
            <span style="display:block;color:var(--ink-mute);font-size:12px;">
              Sleduje ${UI.esc(d.what)}, ${UI.esc(d.when)}${d.filters ? ` (${UI.esc(d.filters)})` : ''}.</span>
            <span style="display:block;color:var(--ink-sub);font-size:12px;margin-top:2px;">
              Vytvorí: „${UI.esc(d.example)}"</span>
            ${r.description ? `<span style="display:block;color:var(--ink-mute);font-size:11.5px;margin-top:2px;">
              ${UI.esc(r.description)}</span>` : ''}
          </span>
          ${Danubra.isAdmin() ? `<button class="btn btn-ghost btn-sm"
            onclick="Tsk.ruleForm('${r.id}')" title="Upraviť">${Icon('edit', 15)}</button>` : ''}
        </div>`;
      };

      const body = `
        <div class="regimebox">
          Úlohy nevznikajú náhodne — každá má pravidlo, ktoré ju vytvorilo.
          Pravidlo sa dá vypnúť a prestane úlohy robiť; tie, čo už vznikli,
          zostanú. Nové pravidlá pribúdajú ako riadky, nie ako nová verzia
          aplikácie.</div>
        ${this.rules.length ? this.rules.map(row).join('')
          : '<div class="js-empty">Zatiaľ žiadne pravidlá.</div>'}
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          <span style="align-self:center;display:inline-flex;">${UI.tip('Appka pravidlá prechádza sama raz denne. „Spustiť teraz" to spraví hneď a založí úlohy, ktoré chýbajú. Úloha, ktorá už existuje, sa nezdvojí.')}</span>
          <button class="btn btn-outline" onclick="Tsk.runRules()">
            ${Icon('repeat', 14)} Spustiť teraz</button>
          ${Danubra.isAdmin() ? `<button class="btn btn-primary" onclick="Tsk.ruleForm()">
            ${Icon('plus', 14)} Nové pravidlo</button>` : ''}
        </div>`;
      UI.modal('Pravidlá, z ktorých vznikajú úlohy', body, { wide: true });
    },

    // ── Nové pravidlo ─────────────────────────────────────────────────────
    // Pravidlo sa doteraz pridávalo riadkom v SQL editore. Dôvod bol dobrý:
    // motor skladá SQL z hodnôt v tom riadku, takže pole, do ktorého by sa
    // názov stĺpca písal voľne, by bola cesta k spusteniu čohokoľvek.
    //
    // Preto formulár nič nevymýšľa — **zoznam tabuliek aj stĺpcov dáva
    // databáza** (`danubra_rule_tables`, `danubra_rule_fields` z migrácie
    // 035). Nedá sa tak vybrať tabuľka, ktorú CHECK odmietne, ani stĺpec,
    // ktorý neexistuje.

    /** Stĺpce tabuľky. Držia sa v pamäti, nech sa to nepýta pri každom písmene. */
    async fieldsOf(table) {
      this._fields = this._fields || {};
      if (this._fields[table]) return this._fields[table];
      const { data, error } = await DB.rpc('rule_fields', { p_table: table });
      if (error) { UI.toast('Chyba: ' + error.message, 'err'); return []; }
      this._fields[table] = data || [];
      return this._fields[table];
    },

    async ruleForm(id) {
      if (!Danubra.isAdmin()) return UI.toast('Pravidlá spravuje administrátor', 'err');
      const r = id ? this.rules.find(x => x.id === id) || {} : {};
      const { data: tables, error } = await DB.rpc('rule_tables', {});
      if (error) return UI.toast('Chyba: ' + error.message, 'err');

      const list = (tables || []).map(t => (typeof t === 'string' ? t : t.danubra_rule_tables))
        .filter(Boolean);
      this._ruleTable = r.source_table || list[0];
      const fields = await this.fieldsOf(this._ruleTable);
      this._rule = { ...r };

      UI.modal(id ? 'Upraviť pravidlo' : 'Nové pravidlo', `
        <form id="rule-form" onsubmit="event.preventDefault();Tsk.saveRule('${id || ''}')"
              oninput="Tsk.ruleChanged()" onchange="Tsk.ruleChanged()">
          <div class="regimebox">
            Pravidlo sleduje jeden dátum v jednej tabuľke a pred jeho dosiahnutím
            vytvorí úlohu. Tabuľky aj stĺpce ponúka databáza — nedá sa tu napísať
            niečo, čo neexistuje.</div>

          <div class="form-grid">
            ${UI.field('title', 'Ako sa pravidlo volá', { value: r.title, required: true,
              placeholder: 'Končí platnosť A1' })}
            ${UI.field('key', 'Kľúč', { value: r.key, required: true,
              placeholder: 'a1_konci', tip: 'Krátky technický názov pravidla bez medzier a diakritiky (napr. a1_konci). Musí byť jedinečný.' })}
          </div>

          <div class="form-section">Čo sleduje</div>
          <div class="form-grid">
            ${UI.field('source_table', 'Tabuľka', { value: this._ruleTable,
              options: list.map(t => [t, DanubraTasks.tableLabel(t)]),
              tip: 'Aký druh záznamov pravidlo sleduje, napr. doklady živnostníkov alebo zmluvy.' })}
            <label class="fld"><span>Dátumový stĺpec *${UI.tip('Ktorý dátum v zázname sa sleduje, napr. „valid_to" = platnosť do. Úloha vznikne, keď sa tento deň blíži.')}</span>
              <select name="date_field" id="rule-date-field" required>
                ${this._fieldOptions(fields, 'date', r.date_field)}
              </select></label>
            <label class="fld"><span>Čím sa záznam pomenuje${UI.tip('Ktorý údaj sa dosadí do textu úlohy ako {label}, aby bolo jasné, koho alebo čoho sa týka (napr. meno).')}</span>
              <select name="label_field" id="rule-label-field">
                ${this._fieldOptions(fields, 'label', r.label_field || 'name')}
              </select></label>
            ${UI.field('days_before', 'Koľko dní dopredu', { type: 'number',
              value: r.days_before ?? 30, step: '1',
              tip: 'Koľko dní pred sledovaným dátumom má úloha vzniknúť. Napr. 30 = mesiac vopred, aby bol čas to vybaviť.' })}
          </div>

          <div class="form-section">Akú úlohu vytvorí</div>
          <div class="form-grid">
            <div class="fld fld-full">
              ${UI.field('task_title_template', 'Text úlohy', {
                value: r.task_title_template, required: true,
                placeholder: 'Vybaviť nové A1 pre {label} — končí {date}' })}
              <div class="muted-sm">
                ${DanubraTasks.RULE_VARS.map(([v, t]) =>
                  `<div><code>${v}</code> — ${UI.esc(t)}</div>`).join('')}
              </div>
            </div>
            ${UI.field('priority', 'Dôležitosť', { value: r.priority || 'normal',
              options: [['low', 'Nízka'], ['normal', 'Bežná'], ['high', 'Vysoká'],
                ['urgent', 'Súrne']] })}
            ${UI.field('assigned_name', 'Komu sa priradí', { value: r.assigned_name || '',
              options: this._ruleWho(r.assigned_name),
              tip: 'Používateľ appky, ktorému sa každá úloha z tohto pravidla automaticky dá na starosť. „Nikto" = úlohy budú nepriradené.' })}
          </div>
          ${UI.field('description', 'Poznámka k pravidlu', { type: 'textarea', rows: 2,
            value: r.description })}

          <div class="form-section">Skúška naprázdno</div>
          <div id="rule-try">
            <div class="muted">
              Klepnite na <strong>Skúsiť</strong> a appka spočíta, koľko úloh by
              z tohto pravidla dnes vzniklo — bez toho, aby čokoľvek zapísala.</div>
          </div>
          <div class="btn-row">
            <button type="button" class="btn btn-outline btn-sm"
              onclick="Tsk.tryRule()">${Icon('search', 14)} Skúsiť</button>
          </div>

          <div id="rule-problems" style="margin-top:12px;"></div>

          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="Tsk.rulesView()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Pridať pravidlo'}</button>
          </div>
        </form>`, { wide: true });
      this.ruleChanged();
    },

    /** Komu môže pravidlo dávať úlohy: aktívni používatelia (+ doterajšie meno, aj keď je mimo appky). */
    _ruleWho(current) {
      const list = this.members().map(m => [T().memberName(m), T().memberName(m)]);
      const cur = String(current || '').trim();
      if (cur && !list.some(([v]) => v === cur)) list.unshift([cur, `${cur} (mimo appky)`]);
      return [['', '— nikto (nepriradené) —'], ...list];
    },

    _fieldOptions(fields, kind, selected) {
      // Pomenovať záznam sa dá aj textovým stĺpcom, ktorý sa inak používa na
      // filtrovanie — „kind" pri doklade je práve taký prípad.
      const use = kind === 'label'
        ? fields.filter(f => f.kind === 'label'
          || (f.kind === 'filter' && String(f.data_type).includes('char'))
          || f.data_type === 'text')
        : fields.filter(f => f.kind === kind);
      if (!use.length) return '<option value="">— tabuľka nemá taký stĺpec —</option>';
      return use.map(f => `<option value="${UI.esc(f.column_name)}"${
        f.column_name === selected ? ' selected' : ''}>${UI.esc(f.column_name)}</option>`).join('');
    },

    /** Po zmene tabuľky sa musia prebrať stĺpce; inak sa kontroluje, čo nesedí. */
    async ruleChanged() {
      const form = document.getElementById('rule-form');
      if (!form) return;
      const d = UI.formData(form);

      if (d.source_table && d.source_table !== this._ruleTable) {
        this._ruleTable = d.source_table;
        const fields = await this.fieldsOf(d.source_table);
        const df = document.getElementById('rule-date-field');
        const lf = document.getElementById('rule-label-field');
        if (df) df.innerHTML = this._fieldOptions(fields, 'date', d.date_field);
        if (lf) lf.innerHTML = this._fieldOptions(fields, 'label', d.label_field);
      }

      const box = document.getElementById('rule-problems');
      if (!box) return;
      const v = DanubraTasks.reviewRule(d);
      box.innerHTML = (v.reasons.length || v.warnings.length)
        ? Shell.blocker({ reasons: [...v.reasons, ...v.warnings] })
        : '';
    },

    /** Skúška naprázdno — presne to, čo spraví motor, ale bez zápisu. */
    async tryRule() {
      const form = document.getElementById('rule-form');
      const box = document.getElementById('rule-try');
      if (!form || !box) return;
      const d = UI.formData(form);
      if (!d.source_table || !d.date_field) {
        return UI.toast('Najprv vyberte tabuľku a dátumový stĺpec', 'err');
      }
      box.innerHTML = '<p style="font-size:13px;color:var(--ink-mute);margin:0;">Skúšam…</p>';
      const { data, error } = await DB.rpc('preview_task_rule', {
        p_source_table: d.source_table,
        p_date_field: d.date_field,
        p_label_field: d.label_field || 'id',
        p_filter: {},
        p_days_before: Number(d.days_before) || 30,
        p_title_template: d.task_title_template || '{label}',
      });
      if (error) {
        box.innerHTML = `<div class="warnbox" style="margin:0;">${Icon('alert', 14)}
          ${UI.esc(error.message)}</div>`;
        return;
      }
      const n = Number(data?.count || 0);
      const s = Array.isArray(data?.samples) ? data.samples : [];
      box.innerHTML = `
        <p style="font-size:13px;margin:0 0 6px;">
          Dnes by z tohto pravidla vzniklo <strong>${n}</strong>
          ${DanubraTasks.plural(n, 'úloha', 'úlohy', 'úloh')}.</p>
        ${s.length ? `<ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.7;">
          ${s.map(x => `<li>${UI.esc(x)}</li>`).join('')}</ul>` : ''}
        ${n > 50 ? `<div class="warnbox" style="margin:8px 0 0;">${Icon('alert', 14)}
          To je veľa naraz. Skúste menej dní dopredu — zoznam, v ktorom je
          päťdesiat položiek, sa neprezerá.</div>` : ''}`;
    },

    async saveRule(id) {
      const d = UI.formData(document.getElementById('rule-form'));
      const v = DanubraTasks.reviewRule(d);
      if (!v.ok) return UI.toast(v.reasons[0].label, 'err');

      const payload = {
        key: d.key, title: d.title, description: d.description || null,
        source_table: d.source_table, date_field: d.date_field,
        label_field: d.label_field || 'name',
        days_before: Number(d.days_before) || 30,
        task_title_template: d.task_title_template,
        priority: d.priority || 'normal',
        assigned_name: d.assigned_name || null,
      };
      const { error } = id
        ? await DB.update('task_rules', id, payload)
        : await DB.insert('task_rules', { ...payload, active: true });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');

      UI.toast(id ? 'Pravidlo uložené' : 'Pravidlo pridané — spustite ho, nech je vidieť', 'ok');
      this.loaded = false; await this.load();
      this.rulesView();
    },

    async toggleRule(id, active) {
      const { error } = await DB.update('task_rules', id, { active });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const r = this.rules.find(x => x.id === id); if (r) r.active = active;
      UI.toast(active ? 'Pravidlo zapnuté' : 'Pravidlo vypnuté — existujúce úlohy zostávajú', 'ok');
      this.rulesView();
    },

    /**
     * Pravidlá inak beží denný cron. Toto je na to, aby sa dalo pozrieť,
     * čo z nich vypadne, bez čakania do rána.
     */
    async runRules() {
      UI.toast('Prechádzam pravidlá…');
      const { data, error } = await DB.rpc('run_task_rules', {});
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal();
      UI.toast(data
        ? `Pribudlo ${data} ${DanubraTasks.plural(data, 'úloha', 'úlohy', 'úloh')}`
        : 'Nič nové — všetko, čo pravidlá sledujú, už úlohu má', data ? 'ok' : '');
      this.loaded = false; await this.load(); Danubra.renderRoute();
    },


    /**
     * Kto úlohu rieši — výber z používateľov appky ako krúžky s iniciálami
     * (do detailu aj formulára). Voľne sa meno písať nedá; meno mimo appky
     * sa len ukáže, aby bolo vidieť, čo tam bolo.
     */
    whoPicker(t, name, onchange) {
      const o = t ? this.owner(t) : { kind: 'none' };
      const list = this.members();
      const inList = o.member && list.some(m => m.id === o.member.id);
      const me = this.meMember();
      const opt = (value, on, av, label, extra = '') => `<label class="tk-pick-i${on ? ' on' : ''}${extra}">
          <input type="radio" name="${name}" value="${UI.esc(value)}"${on ? ' checked' : ''}${onchange ? ` onchange="${onchange}"` : ''}>
          ${av}<span>${label}</span></label>`;
      return `<div class="tk-pick" role="radiogroup" aria-label="Kto to rieši">
        ${o.kind === 'outside' ? opt('__keep', true, this.avatar(o), `${UI.esc(o.name)} <em>mimo appky</em>`, ' is-out') : ''}
        ${o.kind === 'member' && !inList ? opt('__keep', true, this.avatar(o), `${UI.esc(o.name)} <em>neaktívny</em>`, ' is-out') : ''}
        ${list.map(m => opt(m.id, !!(o.member && o.member.id === m.id), this.avatar({ kind: 'member', name: T().memberName(m) }),
          `${UI.esc(T().memberName(m))}${me && me.id === m.id ? ' <em>ja</em>' : ''}`)).join('')}
        ${opt('', o.kind === 'none', this.avatar(null), 'Nikto')}
      </div>
      ${list.length ? '' : '<p class="td-muted">V appke zatiaľ nie sú používatelia (Nastavenia → Používatelia).</p>'}`;
    },

    /**
     * Detail úlohy. Na jednom mieste: termín s odpočtom, kto ju rieši, čoho
     * sa týka (s odkazom a pár údajmi o zázname), popis, odkiaľ sa vzala
     * a história s poznámkami. Všetko sa dá spraviť priamo tu.
     */
    detail(id) {
      const t = this.find(id);
      if (!t) return UI.toast('Nenájdené', 'err');
      this._detailId = id;
      this._bindMenus();
      const today = this.today();
      const done = t.status === 'done', canc = t.status === 'cancelled', open = !done && !canc;
      const rel = T().relDue(t.due_date, today);
      const cd = open ? T().countdown(t) : null;
      const late = open && rel.tone === 'late';
      const o = this.owner(t), me = this.meMember();
      const tid = UI.esc(t.id);
      const ent = t.entity_type ? ENTITY[t.entity_type] : null;
      const entLabel = this.entityText(t) || (ent && ent[0]) || '';
      const rule = t.rule_id ? this.rules.find(r => r.id === t.rule_id) : null;
      const hi = t.priority === 'high' || t.priority === 'urgent';
      const longDate = (d) => {
        try {
          return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('sk-SK',
            { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        } catch { return UI.date(d); }
      };
      const box = (cls, ico, title, body, extra = '') => `<section class="td-box ${cls}">
          <h4>${Icon(ico, 14)} ${title}${extra}</h4>${body}</section>`;

      const head = `<div class="td-head">
          ${this.badge(t.status)}
          ${hi ? UI.badge(`${PRIO_LABEL[t.priority]} priorita`, 'red') : ''}
          ${late ? UI.badge('po termíne', 'red') : ''}
          ${this.isAuto(t) ? `<span class="tk-auto">${Icon('zap', 11)} automat</span>` : ''}
          ${cd ? `<span class="td-cd td-cd-${cd.tone || 'far'}">${Icon('clock', 12)} ${UI.esc(cd.text)}</span>` : ''}
        </div>`;

      const due = box('td-due', 'calendar', 'Termín', `
          <div class="td-big tk-due-${late ? 'late' : open ? rel.tone || 'far' : 'none'}">${
            done ? 'hotové' : UI.esc(rel.text)}</div>
          <div class="td-sub">${t.due_date ? UI.esc(longDate(t.due_date)) : 'Termín nie je zadaný'}${
            done && t.done_at ? ` · hotové ${UI.esc(UI.date(t.done_at))}` : ''}</div>
          ${cd && cd.pct != null ? `<i class="tk-bar td-bar${cd.tone === 'late' ? ' is-late' : cd.pct >= 0.75 ? ' is-near' : ''}">
            <i style="width:${Math.round(cd.pct * 100)}%"></i></i>` : ''}
          ${open ? `<div class="td-snz">
            <span>Odložiť:</span>
            ${[['1d', '+1 deň'], ['3d', '+3 dni'], ['monday', 'pondelok']].map(([k, l]) =>
              `<button class="td-pill" onclick="Tsk.snooze('${tid}','${k}')"
                title="Na ${UI.esc(UI.date(T().snoozeDate(t, k, today)))}">${l}</button>`).join('')}
            <button class="td-pill" onclick="Tsk.snooze('${tid}','pick')">${Icon('calendar', 12)} dátum…</button>
          </div>` : ''}`);

      const who = box('td-who', 'user', 'Rieši', `
          <div class="td-person">
            ${this.avatar(o)}
            <div><b>${UI.esc(o.name || 'Nikto')}</b>
              <span>${o.kind === 'outside' ? 'meno mimo appky — prehoďte na používateľa'
                : o.kind === 'none' ? 'úloha zatiaľ nemá riešiteľa'
                  : UI.esc(o.member.email || (o.member.active === false ? 'neaktívny používateľ' : 'používateľ appky'))}</span></div>
          </div>
          ${me && !this.isMine(t) ? `<button class="btn btn-outline btn-sm td-take" onclick="Tsk.assign('${tid}','${UI.esc(me.id)}')">
            ${Icon('user', 13)} Beriem si to</button>` : ''}
          <details class="td-change"${o.kind === 'outside' ? ' open' : ''}><summary>${Icon('workers', 13)} Zmeniť riešiteľa</summary>
            ${this.whoPicker(t, `td-who-${tid}`, `if(this.value!=='__keep')Tsk.assign('${tid}',this.value)`)}
          </details>`);

      const rec = entLabel ? box('td-rec', (Danubra.entities[t.entity_type] || {}).ico || 'note', 'Čoho sa týka', `
          <div class="td-recard">
            <div class="td-rec-top">
              ${Danubra.link(t.entity_type, t.entity_id, entLabel)}
              ${ent ? `<span class="td-kind">${UI.esc(ent[0])}</span>` : ''}
            </div>
            <dl class="td-facts" id="td-facts"></dl>
            ${t.entity_type && !Danubra.canOpen(t.entity_type, t.entity_id) && ent
              ? '<p class="td-muted">Na tento záznam sa odtiaľto nedá prekliknúť (obrazovka je vypnutá alebo záznam nemá odkaz).</p>' : ''}
          </div>`) : '';

      const src = box('td-src', this.isAuto(t) ? 'zap' : 'edit', 'Odkiaľ je', this.isAuto(t)
        ? `<p class="td-p">Založila ju appka sama${rule ? ` podľa pravidla <b>„${UI.esc(rule.title || rule.key)}"</b>` : ' podľa pravidla'}.</p>
           ${rule ? `<p class="td-muted">${UI.esc(this._ruleText(rule))}</p>` : ''}
           <button class="tk-link" onclick="Tsk.rulesView()">${Icon('rules', 12)} Pravidlá</button>`
        : `<p class="td-p">Založená ručne${t.created_at ? ` ${UI.esc(UI.date(t.created_at))}` : ''}.</p>`);

      const desc = t.description
        ? box('td-desc', 'note', 'Popis', `<p class="td-p">${UI.esc(t.description)}</p>`) : '';

      const hist = box('td-hist', 'clock', 'História a poznámky', `
          <form class="td-note" onsubmit="event.preventDefault();Tsk.addNote('${tid}', this)">
            <input name="note" placeholder="Pridať poznámku k úlohe…" maxlength="1000" autocomplete="off"
              aria-label="Poznámka k úlohe">
            <button class="btn btn-outline btn-sm" type="submit">${Icon('plus', 13)} Pridať</button>
          </form>
          <ol class="td-tl" id="td-tl">${this._histHtml(t, null)}</ol>`,
        UI.tip('Poznámky sa len pridávajú — nedajú sa prepísať ani zmazať, aby bolo vidieť, čo sa s úlohou dialo. Zmeny stavu, riešiteľa a termínu sa sem zapisujú samy.'));

      UI.modal(t.title, `
        ${head}
        <div class="td-grid">${due}${who}${rec}${src}</div>
        ${desc}
        ${hist}
        <div class="modal-actions td-actions">
          <button class="btn btn-danger" onclick="Tsk.del('${tid}')">${Icon('archive', 14)} Archivovať</button>
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          <button class="btn btn-outline" onclick="Tsk.form('${tid}')">${Icon('edit', 14)} Upraviť</button>
          ${open ? `<button class="btn btn-outline" onclick="Tsk.snooze('${tid}')"
              title="Posunie termín o 7 dní. Kratšie odloženie je vyššie pri termíne.">${Icon('clock', 14)} Odložiť o týždeň</button>` : ''}
          ${t.status === 'open' ? `<button class="btn btn-outline" onclick="Tsk.setStatus('${tid}','in_progress')">
              ${Icon('repeat', 14)} Rozpracovať</button>` : ''}
          ${t.status === 'in_progress' ? `<button class="btn btn-outline" onclick="Tsk.setStatus('${tid}','open')">
              ${Icon('undo', 14)} Späť na otvorenú</button>` : ''}
          <button class="btn btn-primary" onclick="UI.closeModal();Tsk.done('${tid}')">
            ${Icon('check', 14)} ${done ? 'Vrátiť medzi otvorené' : canc ? 'Označiť ako hotovú' : 'Hotovo'}</button>
        </div>`, { wide: true });

      this._detailExtras(t);
    },

    /**
     * Čo sa o zázname, ktorého sa úloha týka, oplatí vidieť bez preklikávania.
     * Číta sa jedným malým dotazom; keď sa nepodarí, karta ostane len s odkazom.
     */
    FACTS: {
      worker: ['workers', 'id,full_name,phone,status,profession', (r) => [
        ['Telefón', r.phone], ['Stav', { candidate: 'Kandidát', screening: 'V preverovaní', ready: 'Pripravený',
          deployed: 'Vyslaný', inactive: 'Neaktívny', blacklist: 'Nespolupracovať' }[r.status] || r.status]]],
      candidate: ['candidates', 'id,full_name,phone,status', (r) => [['Telefón', r.phone]]],
      partner: ['partners', 'id,name,city,ust_idnr', (r) => [['Mesto', r.city], ['DIČ', r.ust_idnr]]],
      subcontract: ['subcontracts', 'id,title,contract_number,site_city,partner_id,status', (r, x) => [
        ['Miesto', r.site_city], ['Odberateľ', x.partner], ['Číslo', r.contract_number]]],
      invoice: ['invoices', 'id,invoice_number,total,currency,status,due_date', (r) => [
        ['Suma', r.total != null ? UI.money(r.total, r.currency || 'EUR') : null],
        ['Stav', window.DanubraInvoice ? DanubraInvoice.statusLabel(r.status) : r.status],
        ['Splatná', r.due_date ? UI.date(r.due_date) : null]]],
    },

    async _detailExtras(t) {
      const same = () => this._detailId === t.id && document.getElementById('ui-modal');
      // Údaje o zázname.
      const f = this.FACTS[t.entity_type];
      if (f && t.entity_id) {
        try {
          const { data } = await DB.list(f[0], { select: f[1], filters: { id: t.entity_id }, limit: 1 });
          const r = (data || []).find(x => x.id === t.entity_id);
          const extra = {};
          if (r && r.partner_id) {
            const p = await DB.list('partners', { select: 'id,name', filters: { id: r.partner_id }, limit: 1 });
            extra.partner = ((p.data || []).find(x => x.id === r.partner_id) || {}).name;
          }
          const box = same() && document.getElementById('td-facts');
          if (r && box) {
            box.innerHTML = f[2](r, extra).filter(([, v]) => v)
              .map(([k, v]) => `<div><dt>${UI.esc(k)}</dt><dd>${UI.esc(v)}</dd></div>`).join('');
          }
        } catch { /* karta ostane len s odkazom */ }
      }
      // História: poznámky a zmeny zapísané pri úlohe.
      try {
        const { data } = await DB.list('activities', {
          select: 'id,type,body,created_at,created_by', filters: { entity_type: 'task', entity_id: t.id },
          order: { column: 'created_at', ascending: false }, limit: 60,
        });
        const tl = same() && document.getElementById('td-tl');
        if (tl) tl.innerHTML = this._histHtml(t, (data || []).filter(a => a.entity_type == null || a.entity_type === 'task'));
      } catch { /* ostane základná história */ }
    },

    /** Časová os úlohy: založenie, zmeny, poznámky, dokončenie — najnovšie hore. */
    _histHtml(t, acts) {
      const who = (uid) => {
        const m = uid && this.allMembers().find(x => x.user_id === uid);
        return m ? T().memberName(m) : '';
      };
      const ev = [];
      if (t.created_at) {
        ev.push({ at: t.created_at, ico: this.isAuto(t) ? 'zap' : 'plus', cls: '',
          text: this.isAuto(t) ? 'Založila ju appka podľa pravidla' : `Založená${who(t.created_by) ? ` — ${who(t.created_by)}` : ''}` });
      }
      for (const a of (acts || [])) {
        const note = a.type === 'note';
        ev.push({ at: a.created_at, ico: note ? 'note' : 'repeat', cls: note ? 'is-note' : '',
          text: a.body || '', by: who(a.created_by) });
      }
      if (t.done_at && !(acts || []).some(a => /hotov/i.test(a.body || ''))) {
        ev.push({ at: t.done_at, ico: 'check', cls: 'is-done', text: 'Označená ako hotová' });
      }
      if (acts && !acts.length && t.updated_at && t.created_at
        && String(t.updated_at).slice(0, 16) !== String(t.created_at).slice(0, 16)) {
        ev.push({ at: t.updated_at, ico: 'edit', cls: '', text: 'Naposledy zmenená' });
      }
      ev.sort((a, b) => String(b.at).localeCompare(String(a.at)));
      if (!ev.length) return '<li class="td-muted">Zatiaľ bez záznamov.</li>';
      const when = (d) => {
        try {
          return new Date(d).toLocaleString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { return UI.date(d); }
      };
      return ev.map(e => `<li class="${e.cls}">
          <span class="td-tl-ico">${Icon(e.ico, 12)}</span>
          <div><p>${UI.esc(e.text)}</p><time>${UI.esc(when(e.at))}${e.by ? ` · ${UI.esc(e.by)}` : ''}</time></div>
        </li>`).join('');
    },

    /** Poznámka k úlohe. Len pribúda — neprepisuje sa ani nemaže. */
    async addNote(id, form) {
      const inp = form && form.elements.note;
      const body = inp ? inp.value.trim() : '';
      if (!body) return UI.toast('Napíšte poznámku', 'err');
      const { error } = await DB.insert('activities', {
        entity_type: 'task', entity_id: id, type: 'note', body, source: 'manual',
        created_by: (Danubra.user && Danubra.user.id) || null,
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      inp.value = '';
      UI.toast('Poznámka pridaná', 'ok');
      const t = this.find(id);
      if (t) this._detailExtras(t);
    },

    /**
     * Zmena sa zapíše aj do histórie úlohy (danubra_activities, entity_type
     * 'task'). Keď sa zápis nepodarí, úloha sa tým nezastaví — je to záznam,
     * nie podmienka.
     */
    _log(id, body) {
      try {
        Promise.resolve(DB.insert('activities', {
          entity_type: 'task', entity_id: id, type: 'change', body, source: 'app',
          created_by: (Danubra.user && Danubra.user.id) || null,
        })).catch(() => {});
      } catch { /* nič */ }
    },

    // ── Úlohy pri zázname ─────────────────────────────────────────────────
    // Na karte človeka, zákazky, odberateľa a kandidáta je malý blok
    // „Úlohy": otvorené úlohy k tomu záznamu a „Pridať úlohu" s predvyplneným
    // záznamom. Vkladá sa ako prázdny `slot` a doplní ho `fill` (rovnako ako
    // Dokumenty a E-maily) — karta sa tak nezdrží načítaním úloh.

    slot(type, id, label) {
      if (!type || !id) return '';
      if (Danubra.routeAvailable && !Danubra.routeAvailable('tasks')) return '';
      return `<div class="tsk-slot card card-pad" data-type="${UI.esc(type)}" data-id="${UI.esc(id)}"
        data-label="${UI.esc(label || '')}"><div class="js-empty">Načítavam úlohy…</div></div>`;
    },

    async fill(root) {
      const slots = [...(root || document).querySelectorAll('.tsk-slot')];
      if (!slots.length) return;
      if (!this.loaded) { try { await this.load(); } catch { return; } }
      for (const s of slots) s.innerHTML = this.miniList(s.dataset.type, s.dataset.id, s.dataset.label);
    },

    /** Otvorené úlohy k jednému záznamu — krátky zoznam na karte. */
    miniList(type, id, label) {
      const today = this.today();
      const list = T().sortTasks(this.items.filter(t => t.entity_type === type && t.entity_id === id
        && t.status !== 'done' && t.status !== 'cancelled'), 'due');
      const doneN = this.items.filter(t => t.entity_type === type && t.entity_id === id && t.status === 'done').length;
      const shown = list.slice(0, 5);
      const add = `<button class="btn btn-outline btn-sm" data-label="${UI.esc(label || '')}"
          onclick="Tsk.formFor('${UI.esc(type)}','${UI.esc(id)}',this.dataset.label)">${Icon('plus', 13)} Pridať úlohu</button>`;
      return `<div class="card-head"><div class="card-title">${Icon('tasks', 15)} Úlohy
          ${list.length ? `<span class="tk-sec-n">${list.length}</span>` : ''}</div>
          <div class="card-acts">${add}</div></div>
        ${shown.length ? `<div class="tsk-mini">${shown.map((t) => {
          const rel = T().relDue(t.due_date, today);
          const late = rel.tone === 'late';
          const o = this.owner(t);
          return `<div class="tsk-mini-row${late ? ' is-late' : ''}" role="button" tabindex="0"
              onclick="Tsk.detail('${UI.esc(t.id)}')">
              <button class="tk-check" onclick="event.stopPropagation();Tsk.done('${UI.esc(t.id)}')"
                title="Hotovo" aria-label="Označiť ako hotovú">${Icon('check', 12)}</button>
              <span class="tsk-mini-t"><b>${UI.esc(t.title)}</b>
                <small class="tk-due-${late ? 'late' : rel.tone || 'far'}">${UI.esc(rel.text)}${
                  t.status === 'in_progress' ? ' · rozpracovaná' : ''}${
                  t.priority === 'high' || t.priority === 'urgent' ? ' · vysoká' : ''}</small></span>
              ${this.avatar(o)}
            </div>`;
        }).join('')}</div>`
          : '<div class="js-empty">Žiadne otvorené úlohy.</div>'}
        ${list.length > shown.length || doneN ? `<p class="td-muted" style="margin:8px 0 0;">${
          list.length > shown.length ? `a ďalšie ${list.length - shown.length} · ` : ''}${
          doneN ? `${doneN} ${T().plural(doneN, 'hotová', 'hotové', 'hotových')} · ` : ''}<button class="tk-link"
            onclick="UI.closeModal();Danubra.go('tasks')">Všetky úlohy</button></p>` : ''}`;
    },

    /** „Pridať úlohu" z karty záznamu — formulár s predvyplneným záznamom. */
    formFor(type, id, label) {
      return this.form('', { entity_type: type, entity_id: id, entity_label: label || '' });
    },

    _ruleText(rule) {
      const d = T().describeRule(rule);
      return `Pravidlo „${rule.title || rule.key}" sleduje ${d.what}, ${d.when}${d.filters ? ` (${d.filters})` : ''}.`;
    },

    /** Zapíše zmenu úlohy a prekreslí. Spoločné pre priradenie, stav aj odloženie. */
    async _patch(id, patch) {
      const t = this.find(id);
      const { error } = await DB.update('tasks', id, patch);
      if (error) { UI.toast('Chyba: ' + error.message, 'err'); return false; }
      if (t) Object.assign(t, patch);
      await Danubra.renderRoute();
      return true;
    },
    _before(t, keys) {
      const o = {};
      for (const k of keys) o[k] = t[k] == null ? null : t[k];
      return o;
    },
    _undo(id, before) {
      return () => this._patch(id, before).then(ok => ok && UI.toast('Vrátené', 'ok'));
    },

    /** Priradí úlohu členovi appky (`memberId` prázdne = nikomu). */
    async assign(id, memberId) {
      const t = this.find(id);
      if (!t) return;
      const m = memberId ? this.allMembers().find(x => String(x.id) === String(memberId)) : null;
      if (memberId && !m) return UI.toast('Tento používateľ v appke nie je', 'err');
      const before = this._before(t, ['assigned_name', 'assigned_to']);
      const inDetail = !!document.getElementById('ui-modal') && this._detailId === id;
      if (!await this._patch(id, T().assignPatch(m))) return;
      this._log(id, m ? `Riešiteľ: ${T().memberName(m)}` : 'Riešiteľ odobratý — nepriradené');
      UI.toast(m ? `Má na starosti ${T().memberName(m)}` : 'Úloha je bez riešiteľa', 'ok',
        { action: 'Vrátiť', run: this._undo(id, before) });
      if (inDetail) this.detail(id);
    },

    /** Otvorená a Rozpracovaná priamo v riadku. */
    async setStatus(id, status) {
      const t = this.find(id);
      if (!t) return;
      const before = this._before(t, ['status']);
      const inDetail = !!document.getElementById('ui-modal') && this._detailId === id;
      if (!await this._patch(id, { status })) return;
      this._log(id, status === 'in_progress' ? 'Stav: Rozpracovaná' : 'Stav: Otvorená');
      if (inDetail) this.detail(id);
      UI.toast(status === 'in_progress' ? 'Označené ako rozpracované' : 'Vrátené na otvorené', 'ok',
        { action: 'Vrátiť', run: this._undo(id, before) });
    },

    /**
     * Odloženie nie je zmazanie — úloha sa vráti sama, keď dôjde jej deň.
     * Preto sa posúva termín a nie stav.
     * @param {'1d'|'3d'|'week'|'monday'|'pick'} kind  bez neho o týždeň
     */
    async snooze(id, kind = 'week') {
      const t = this.find(id);
      if (!t) return;
      let due;
      if (kind === 'pick') {
        due = await UI.ask('Na kedy úlohu odložiť?', {
          type: 'date', value: T().snoozeDate(t, '1d', this.today()), ok: 'Odložiť',
          hint: 'Termín sa posunie na tento deň. Úloha sa nemaže.',
        });
        if (!due) return;
      } else {
        due = T().snoozeDate(t, kind, this.today());
      }
      const before = this._before(t, ['due_date']);
      if (document.getElementById('ui-modal') && this._detailId === id) UI.closeModal();
      if (!await this._patch(id, { due_date: due })) return;
      this._log(id, `Odložená na ${UI.date(due)}${before.due_date ? ` (pôvodne ${UI.date(before.due_date)})` : ''}`);
      UI.toast(`Odložené na ${UI.date(due)}`, 'ok', { action: 'Vrátiť', run: this._undo(id, before) });
    },

    /**
     * Odškrtnutie. Krúžok sa vyplní, riadok krátko zbledne a zmizne do
     * „Hotové". V toaste je „Vrátiť" — preklik sa dá hneď opraviť.
     */
    async done(id, btn) {
      const t = this.find(id);
      if (!t) return;
      const toDone = t.status !== 'done';
      const before = this._before(t, ['status', 'done_at']);
      const patch = toDone
        ? { status: 'done', done_at: new Date().toISOString() }
        : { status: 'open', done_at: null };
      const row = btn && btn.closest ? btn.closest('.tk-row') : null;
      if (row && toDone) row.classList.add('is-completing');
      const { error } = await DB.update('tasks', id, patch);
      if (error) {
        if (row) row.classList.remove('is-completing');
        return UI.toast('Chyba: ' + error.message, 'err');
      }
      Object.assign(t, patch);
      this._log(id, toDone ? 'Označená ako hotová' : 'Vrátená medzi otvorené');
      const quiet = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      setTimeout(() => Danubra.renderRoute(), row && toDone && !quiet ? 420 : 0);
      UI.toast(toDone ? `Hotovo: ${t.title}` : 'Vrátené medzi otvorené', 'ok',
        { action: 'Vrátiť', run: this._undo(id, before) });
    },

    /** Kedysi jediný spôsob odškrtnutia — ostáva pre prípadné staré volania. */
    toggle(id) { return this.done(id); },

    /**
     * Otvorí záznam, ktorého sa úloha týka.
     *
     * Kedysi to bola druhá, vlastná kópia prepájania: menší zoznam typov
     * (nepoznala partie, ponuky, zmluvy, prijaté faktúry ani kandidátov)
     * a čakanie 400 ms naslepo, či sa zoznam medzitým načítal. Keď sa
     * nenačítal, kliknutie ticho nespravilo nič.
     *
     * Teraz je jediné miesto, kde je zapísané, čo sa dá otvoriť —
     * `Danubra.entities` — a čaká sa na skutočné dobehnutie obrazovky.
     */
    openEntity(type, id) { return Danubra.open(type, id); },

    /** „Viac…" vedľa rýchleho poľa: plný formulár s tým, čo už je napísané. */
    formFromQuick() {
      const inp = document.getElementById('tk-quick');
      const v = inp ? inp.value.trim() : '';
      return this.form('', v ? T().parseQuick(v, this.today()) : null);
    },

    form(id, preset) {
      const t = id ? this.find(id) || {} : (preset || {});
      const me = this.meMember();
      // Nová úloha je predvolene moja — rovnako ako pri rýchlom zapísaní.
      const who = id ? t : (me ? T().assignPatch(me) : {});
      const ent = t.entity_type ? ENTITY[t.entity_type] : null;
      const entLabel = this.entityText(t) || (ent && ent[0]) || '';
      // Záznam, ku ktorému úloha patrí. Pri novej úlohe z karty záznamu sa
      // posiela so sebou; pri úprave sa nemení.
      const entBox = entLabel ? `<div class="tk-form-ent">${Icon('note', 13)} Týka sa:
          ${Danubra.link(t.entity_type, t.entity_id, entLabel)}${ent ? ` <span class="td-kind">${UI.esc(ent[0])}</span>` : ''}
          ${!id ? `<input type="hidden" name="entity_type" value="${UI.esc(t.entity_type || '')}">
            <input type="hidden" name="entity_id" value="${UI.esc(t.entity_id || '')}">
            <input type="hidden" name="entity_label" value="${UI.esc(t.entity_label || '')}">` : ''}
        </div>` : '';
      const body = `
        <form id="tsk-form" onsubmit="event.preventDefault();Tsk.save('${UI.esc(id || '')}')">
          ${entBox}
          <div class="form-grid">
            <div class="fld-full">${UI.field('title', 'Čo treba spraviť', { value: t.title, required: true })}</div>
          </div>
          ${UI.field('description', 'Podrobnosti', { type: 'textarea', rows: 2, value: t.description })}
          <div class="form-grid">
            ${UI.field('due_date', 'Termín', { type: 'date', value: t.due_date })}
            ${UI.field('priority', 'Priorita', { value: t.priority || 'normal', options: PRIO.map(p => [p[0], p[1]]),
              tip: 'Vysoká sa v zozname označí červeným štítkom „Vysoká" a v sekcii je navrchu.' })}
            ${UI.field('status', 'Stav', { value: t.status || 'open', options: STATUS.map(s => [s[0], s[1]]),
              tip: 'Otvorená = ešte sa na nej nezačalo. Rozpracovaná = niekto na nej robí. Hotová = vybavené. Zrušená = netreba ju robiť.' })}
          </div>
          <div class="fld"><span>Rieši${UI.tip('Kto má úlohu na starosti. Ponúkajú sa používatelia appky (Nastavenia → Používatelia), predvolene Vy. Meno, ktoré medzi nimi nie je, je označené „mimo appky" — vyberte, komu úlohu prehodiť.')}</span>
            ${this.whoPicker(who, 'who')}</div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Pridať'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť úlohu' : 'Nová úloha', body, { wide: true });
    },

    async save(id) {
      const d = UI.formData(document.getElementById('tsk-form'));
      if (!d.title) return UI.toast('Napíšte, čo treba spraviť', 'err');
      const who = d.who == null ? '__keep' : d.who;
      delete d.who;
      const payload = { ...d };
      for (const k of ['entity_type', 'entity_id', 'entity_label']) if (payload[k] === '') payload[k] = null;
      if (who !== '__keep') {
        const m = who ? this.allMembers().find(x => String(x.id) === String(who)) : null;
        Object.assign(payload, T().assignPatch(m));
      }
      if (payload.due_date === '') payload.due_date = null;
      if (payload.status === 'done') payload.done_at = new Date().toISOString();
      const res = id ? await DB.update('tasks', id, payload) : await DB.insert('tasks', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      if (id) this._log(id, 'Upravená vo formulári');
      UI.closeModal(); UI.toast(id ? 'Uložené' : 'Pridané', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    async del(id) {
      if (!await UI.confirmArchive('Presunúť túto úlohu do archívu?')) return;
      const { error } = await DB.archive('tasks', id);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      this.items = this.items.filter(x => x.id !== id);
      UI.toast(UI.ARCHIVED, 'ok'); Danubra.renderRoute();
    },
  };

  window.Tsk = Tsk;
  Danubra.views.tasks = function (el) { return Tsk.view(el); };
})();
