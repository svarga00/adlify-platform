// ============================================================================
// DANUBRA — Kalendár (route `kalendar`, záložka Prehľadu dňa) a KW v hornom pruhu
// ============================================================================
// „Niekde by som chcel viditeľne zobraziť, aký je teraz KW, s preklikom do
// kalendára, ktorý by mohol byť prepojený s poznámkami a úlohami, napr. aj
// s pripomienkami a udalosťami."
//
//   horný pruh   „KW 45" (na počítači aj na mobile), bublinka „Kalendárny
//                týždeň 45 · 2.–8. 11. 2026", klik → Kalendár
//   Týždeň       pondelok až nedeľa pod sebou v stĺpcoch, šípky na predošlý
//                a ďalší KW, „Dnes". Úlohu sa dá chytiť a pustiť na iný deň
//                (zmení sa jej termín); na mobile je to zoznam dní, listuje
//                sa potiahnutím a úloha má „Presunúť" s výberom dňa
//   Mesiac       mriežka s číslom KW vľavo; klik na KW otvorí ten týždeň
//   Agenda       najbližších 30 dní po KW, prázdne dni vynechané
//
// Položky (lib/calendar.js): úlohy, pripomienky (úlohy s časom), udalosti
// (danubra_events, migrácia 089), poznámky s termínom a ďalšie kroky pri
// firmách, a termíny len na čítanie — končiace doklady, začiatok a koniec
// zákazky, splatnosť faktúr. Každá vrstva sa dá vypnúť; voľba sa pamätá
// v prehliadači pre každého používateľa zvlášť. Klik na položku otvorí to,
// odkiaľ je (úlohu, firmu, zákazku, človeka, faktúru).
//
// Pripomienka udalosti je obyčajná úloha v Úlohách (source 'event') — je
// tak v odznakoch aj na Prehľade dňa a netreba žiadne notifikácie.
// ============================================================================
(function () {
  const C = () => window.DanubraCal;
  const T = () => window.DanubraTasks;
  const esc = (s) => UI.esc(s == null ? '' : s);
  const MODES = [['week', 'Týždeň', 'calendar'], ['month', 'Mesiac', 'columns'], ['agenda', 'Agenda', 'note']];
  const TASK_SEL = 'id,title,description,status,priority,due_date,due_time,postponed_to,assigned_to,assigned_name,'
    + 'entity_type,entity_id,entity_label,source,source_key,created_at,updated_at,done_at,rule_id,level,created_by';
  // Čoho sa udalosť môže týkať: [typ, názov, tabuľka, stĺpec s menom]
  const ENT = [
    ['lead', 'Firma (marketing)', 'leads', 'name'],
    ['partner', 'Odberateľ', 'partners', 'name'],
    ['subcontract', 'Zákazka', 'subcontracts', 'title'],
    ['worker', 'Živnostník', 'workers', 'full_name'],
    ['candidate', 'Kandidát', 'candidates', 'full_name'],
  ];
  const AGENDA_DAYS = 30;

  const Kal = {
    mode: 'week', anchor: null, sel: null, mine: false, member: '', showDone: false, layers: null,
    raw: { tasks: [], events: [] }, items: [], overdue: [], range: null,
    noEvents: false, noTime: false, openId: null, _prefsFor: null,
    /** Hodiny. V teste sa dajú podvrhnúť (`Kal.clock = () => new Date(…)`). */
    clock: null,
    now() { return this.clock ? this.clock() : new Date(); },
    today() { return C().todayIn(this.now()); },
    narrow() { return !!(window.matchMedia && matchMedia('(max-width: 760px)').matches); },

    // ── Voľby (len pohodlie, nie dáta) ──────────────────────────────────
    _lsKey() { return `danubra_kal_${(Danubra.user && Danubra.user.id) || 'x'}`; },
    _prefs() {
      const key = this._lsKey();
      if (this._prefsFor === key) return;
      this._prefsFor = key;
      let v = {};
      try { v = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { v = {}; }
      this.layers = C().normalizeLayers(v.layers);
      if (MODES.some(m => m[0] === v.mode)) this.mode = v.mode;
      this.mine = !!v.mine;
    },
    _save() {
      try { localStorage.setItem(this._lsKey(), JSON.stringify({ layers: this.layers, mode: this.mode, mine: this.mine })); } catch (e) { /* nič */ }
    },

    // ── Kto som ─────────────────────────────────────────────────────────
    members() {
      return (Danubra.members || []).filter(m => m && m.active !== false && (m.full_name || m.email))
        .sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email), 'sk'));
    },
    memberName(m) { return String((m && (m.full_name || m.email)) || '').trim(); },
    personOf(m) { return m ? { memberId: m.id || null, userId: m.user_id || null, name: this.memberName(m) } : null; },
    me() {
      const me = Danubra.me;
      if (me && me.id) return me;
      const uid = Danubra.user && Danubra.user.id;
      return uid ? { id: null, user_id: uid, full_name: '' } : null;
    },
    person() {
      if (this.member) return this.personOf((Danubra.members || []).find(m => String(m.id) === String(this.member)));
      return this.mine ? this.personOf(this.me()) : null;
    },

    // ── Obdobie ─────────────────────────────────────────────────────────
    span() {
      const a = this.anchor || this.today();
      if (this.mode === 'month') {
        const { year, month } = C().monthOf(a);
        const g = C().monthGrid(year, month);
        return { from: g.from, to: g.to, grid: g, year, month };
      }
      if (this.mode === 'agenda') return { from: a, to: C().addDays(a, AGENDA_DAYS - 1) };
      const w = C().weekOf(a);
      return { from: w.from, to: w.to, week: w };
    },
    shift(dir) {
      const a = this.anchor || this.today();
      if (this.mode === 'month') {
        const { year, month } = C().monthOf(a);
        const m = C().shiftMonth(year, month, dir);
        this.anchor = `${m.year}-${String(m.month).padStart(2, '0')}-01`;
      } else this.anchor = C().addDays(a, dir * (this.mode === 'agenda' ? AGENDA_DAYS : 7));
      this.sel = null;
      return Danubra.renderRoute();
    },
    goToday() { this.anchor = this.today(); this.sel = this.today(); return Danubra.renderRoute(); },
    setMode(m) {
      if (!MODES.some(x => x[0] === m)) return;
      this.mode = m; this._save();
      if (m === 'agenda') this.anchor = this.today();
      return Danubra.renderRoute();
    },
    openWeek(date) { this.mode = 'week'; this.anchor = date; this._save(); return Danubra.renderRoute(); },

    // ── Dáta ────────────────────────────────────────────────────────────
    /** Bez migrácie 089 nie je stĺpec due_time — úlohy sa načítajú aj bez neho. */
    async _tasks(o) {
      if (!this.noTime) {
        const r = await DB.list('tasks', { select: TASK_SEL, ...o });
        if (!r.error || !/due_time/.test(r.error.message || '')) return r;
        this.noTime = true;
        this._forget('due_time');
      }
      return DB.list('tasks', { select: TASK_SEL.replace(',due_time', ''), ...o });
    },
    _forget(what) {
      DB.failures = (DB.failures || []).filter(f => !`${f.table} ${f.message}`.includes(what));
    },
    _isMissing(err) {
      return !!err && /danubra_events|due_time|does not exist|schema cache|relation/i.test(err.message || '');
    },
    async _events(from, to) {
      // Viacdňová udalosť mohla začať skôr — berie sa aj dva mesiace dozadu.
      const r = await DB.list('events', { gte: { starts_on: C().addDays(from, -62) }, lte: { starts_on: to }, limit: 1000 });
      if (r.error && this._isMissing(r.error)) { this.noEvents = true; this._forget('danubra_events'); return { data: [] }; }
      if (!r.error) this.noEvents = false;
      return r;
    },

    async load(from, to) {
      const today = this.today();
      const can = (keys) => keys.some(k => Danubra.can(k));
      const none = Promise.resolve({ data: [], error: null });
      const when = (ok, run) => (ok ? run() : none);
      const tz = (d, end) => `${d}T${end ? '23:59:59' : '00:00:00'}Z`;
      const [t1, t2, ov, ev, act, leads, outr, docs, j1, j2, inv] = await Promise.all([
        this._tasks({ gte: { due_date: from }, lte: { due_date: to }, limit: 1000 }),
        this._tasks({ gte: { postponed_to: from }, lte: { postponed_to: to }, limit: 500 }),
        this._tasks({ filters: { status: ['open', 'in_progress'] }, lte: { due_date: C().addDays(today, -1) }, limit: 500 }),
        this._events(from, to),
        DB.list('activities', { select: 'id,entity_type,entity_id,type,body,follow_up_at,done,created_by',
          filters: { done: false }, gte: { follow_up_at: tz(C().addDays(from, -1)) }, lte: { follow_up_at: tz(C().addDays(to, 1), true) }, limit: 500 }),
        when(can(['marketing']), () => DB.list('leads', { select: 'id,name,status,next_step_at,next_step_text',
          gte: { next_step_at: from }, lte: { next_step_at: to }, limit: 500 })),
        when(can(['marketing']), () => DB.list('outreach', { select: 'id,lead_id,status,replied_at,to_email,next_followup_at',
          filters: { status: 'sent' }, gte: { next_followup_at: tz(C().addDays(from, -1)) }, lte: { next_followup_at: tz(C().addDays(to, 1), true) }, limit: 500 })),
        when(can(['workers', 'compliance']), () => DB.list('v_worker_documents', { select: 'id,worker_id,worker_name,kind,valid_to',
          gte: { valid_to: from }, lte: { valid_to: to }, limit: 500 })),
        when(can(['subcontracts']), () => DB.list('subcontracts', { select: 'id,title,status,date_from,date_to',
          gte: { date_from: from }, lte: { date_from: to }, limit: 300 })),
        when(can(['subcontracts']), () => DB.list('subcontracts', { select: 'id,title,status,date_from,date_to',
          gte: { date_to: from }, lte: { date_to: to }, limit: 300 })),
        when(can(['invoices', 'bank']), () => DB.list('invoices', { select: 'id,invoice_number,status,due_date,partner_id',
          gte: { due_date: from }, lte: { due_date: to }, limit: 500 })),
      ]);
      const S = (r) => (r && r.data) || [];
      const byId = new Map();
      for (const t of [...S(t1), ...S(t2)]) byId.set(t.id, t);

      // Mená firiem pri pripomenutí e-mailom.
      const names = new Map(S(leads).map(l => [l.id, l.name]));
      for (const l of ((window.Lead && Array.isArray(Lead.rows)) ? Lead.rows : [])) if (l && l.id) names.set(l.id, l.name);
      const missing = [...new Set(S(outr).map(o => o.lead_id).filter(id => id && !names.has(id)))];
      if (missing.length) {
        const r = await DB.list('leads', { select: 'id,name', filters: { id: missing }, limit: 500 });
        for (const l of S(r)) names.set(l.id, l.name);
      }

      const jobs = new Map();
      for (const s of [...S(j1), ...S(j2)]) jobs.set(s.id, s);
      this.raw = {
        tasks: [...byId.values()], events: S(ev), activities: S(act), leads: S(leads), outreach: S(outr),
        docs: S(docs), jobs: [...jobs.values()], invoices: S(inv),
      };
      this._names = names;
      this.overdue = S(ov).filter(t => T().isActive(t, today) && t.due_date && t.due_date < today);
      this.range = { from, to };
      this.rebuild();
    },

    rebuild() {
      const { from, to } = this.range || this.span();
      this.items = C().build(this.raw, { today: this.today(), from, to, leadName: (id) => (this._names || new Map()).get(id) || null });
    },
    task(id) { return (this.raw.tasks || []).find(t => t.id === id) || null; },
    shown() { return C().filter(this.items, { layers: this.layers, showDone: this.showDone, person: this.person() }); },

    // ── Obrazovka ───────────────────────────────────────────────────────
    async view(el) {
      this._prefs();
      this._css();
      Danubra.setActions(`
        <button class="btn btn-outline btn-sm" onclick="Danubra.go('tasks')">${Icon('tasks', 14)} Úlohy</button>
        <button class="btn btn-primary btn-sm" onclick="Kal.addMenu()">${Icon('plus')} Pridať</button>`);
      if (!this.anchor) this.anchor = this.today();
      const sp = this.span();
      if (!el.querySelector('.kal')) el.innerHTML = Danubra.header('Kalendár', this._sub()) + UI.loading();
      await this.load(sp.from, sp.to);
      if (Danubra.route !== 'kalendar') return;
      this.paint(el);
    },

    _sub() {
      const t = this.today();
      return `Dnes je ${esc(C().dayLong(t))} · <b>${esc(C().kw(t).label)}</b>`;
    },

    /** Prekreslí obrazovku z načítaných dát — prepínače nemusia čítať databázu znova. */
    paint(el) {
      el = el || document.getElementById('view');
      if (!el) return;
      const sp = this.span();
      const narrow = this.narrow();
      this._narrow = narrow;
      el.innerHTML = Danubra.header('Kalendár', this._sub()) + `
        <div class="kal kal-m-${this.mode}${narrow ? ' is-narrow' : ''}">
          ${this.barHtml(sp)}
          ${this.layersHtml()}
          ${this.notesHtml()}
          <div class="kal-body" id="kal-body">${this.bodyHtml(sp, narrow)}</div>
        </div>`;
      this._bind(el);
    },
    paintBody() {
      const b = document.getElementById('kal-body');
      if (!b) return;
      b.innerHTML = this.bodyHtml(this.span(), this.narrow());
    },

    titleHtml(sp) {
      if (this.mode === 'month') return `<b>${esc(C().monthTitle(sp.year, sp.month))}</b>`;
      if (this.mode === 'agenda') return `<b>Najbližších ${AGENDA_DAYS} dní</b> · od ${esc(C().dayText(sp.from, this.today()))}`;
      const k = C().kw(sp.from);
      return `<b>KW ${k.week}</b> · ${esc(k.range)}`;
    },

    barHtml(sp) {
      const what = this.mode === 'month' ? 'mesiac' : this.mode === 'agenda' ? `${AGENDA_DAYS} dní` : 'týždeň';
      const prev = this.mode === 'month' ? 'Predošlý mesiac' : this.mode === 'agenda' ? 'Predošlých 30 dní' : 'Predošlý týždeň';
      const next = this.mode === 'month' ? 'Ďalší mesiac' : this.mode === 'agenda' ? 'Ďalších 30 dní' : 'Ďalší týždeň';
      const mem = this.members();
      const me = this.me();
      return `<div class="kal-bar">
        <div class="kal-nav">
          <button class="kal-arrow" onclick="Kal.shift(-1)" aria-label="${prev}" title="${prev}">${Icon('back', 16)}</button>
          <button class="btn btn-outline btn-sm" onclick="Kal.goToday()" title="Späť na dnešok">Dnes</button>
          <button class="kal-arrow" onclick="Kal.shift(1)" aria-label="${next}" title="${next}">${Icon('chevron', 16)}</button>
          <h2 class="kal-title" aria-live="polite" title="Zobrazený ${what}">${this.titleHtml(sp)}</h2>
        </div>
        <div class="kal-modes" role="tablist" aria-label="Pohľad">
          ${MODES.map(([k, l, ic]) => `<button class="kal-mode${this.mode === k ? ' on' : ''}" role="tab" aria-selected="${this.mode === k}"
            data-mode="${k}" onclick="Kal.setMode('${k}')">${Icon(ic, 14)}<span>${l}</span></button>`).join('')}
        </div>
        <div class="kal-filters">
          ${me ? `<button class="kal-tog${this.mine && !this.member ? ' on' : ''}" aria-pressed="${this.mine && !this.member}"
            onclick="Kal.toggleMine()" title="Len úlohy, ktoré riešite, a udalosti, kde ste účastník">${Icon('user', 14)} Len moje</button>` : ''}
          ${mem.length > 1 ? `<label class="kal-sel">${Icon('workers', 14)}
            <select onchange="Kal.setMember(this.value)" aria-label="Kolega">
              <option value="">Všetci</option>
              ${mem.map(m => `<option value="${esc(m.id)}"${String(this.member) === String(m.id) ? ' selected' : ''}>${esc(this.memberName(m))}</option>`).join('')}
            </select></label>` : ''}
          <button class="kal-tog${this.showDone ? ' on' : ''}" aria-pressed="${this.showDone}" onclick="Kal.toggleDone()"
            title="Ukázať aj hotové a zrušené úlohy (prečiarknuté)">${Icon('check', 14)} Hotové</button>
          ${UI.tip('„Len moje" = úlohy a pripomienky, ktoré riešite, udalosti, kde ste účastník, a Vaše poznámky. Termíny (doklady, zákazky, faktúry) a ďalšie kroky pri firmách nie sú nikoho — ostávajú vždy.')}
        </div>
      </div>`;
    },

    layersHtml() {
      const n = C().counts(this.items, { showDone: this.showDone, person: this.person() });
      const chip = ([k, label, ic, color]) => `<button class="kal-lay${this.layers[k] ? ' on' : ''}" data-layer="${k}"
          aria-pressed="${!!this.layers[k]}" style="--c:${color}" onclick="Kal.toggleLayer('${k}')"
          title="${this.layers[k] ? 'Skryť' : 'Ukázať'}: ${esc(label)}"><i></i>${Icon(ic, 13)}<span>${esc(label)}</span><em>${n[k] || 0}</em></button>`;
      const own = C().LAYERS.filter(l => !l[4]);
      const dl = C().LAYERS.filter(l => l[4]);
      return `<div class="kal-layers" role="group" aria-label="Čo ukázať">
        ${own.map(chip).join('')}
        <span class="kal-lay-sep">Termíny${UI.tip('Len na čítanie: kedy končí A1 alebo iný doklad, kedy začína a končí zákazka a kedy je splatná vydaná faktúra. Mení sa to na ich obrazovkách.')}</span>
        ${dl.map(chip).join('')}
      </div>`;
    },

    notesHtml() {
      const out = [];
      const p = this.person();
      // Len tie spred zobrazeného obdobia — novšie sú v kalendári červené samy.
      const from = (this.range && this.range.from) || this.today();
      const late = this.overdue.filter(t => (C().taskDate(t) || '') < from
        && (!p || C().isFor(C().fromTask(t, this.today()) || {}, p))).length;
      if (late) {
        out.push(`<div class="kal-late">${Icon('alert', 14)} <span><b>${late}</b> ${C().plural(late, 'úloha je', 'úlohy sú', 'úloh je')}
          po termíne z minulých dní.</span> <button class="link-inline" onclick="Danubra.go('tasks')">Otvoriť Úlohy</button></div>`);
      }
      if (this.noEvents || this.noTime) {
        out.push(`<div class="notebox">${Icon('alert', 14)} Udalosti a pripomienky s časom ešte nie sú pripravené v databáze
          (migrácia 089). Úlohy, poznámky a termíny sa ukazujú normálne.</div>`);
      }
      return out.join('');
    },

    bodyHtml(sp, narrow) {
      if (this.mode === 'month') return this.monthHtml(sp, narrow);
      if (this.mode === 'agenda') return this.agendaHtml(sp);
      return narrow ? this.dayListHtml(sp) : this.weekHtml(sp);
    },

    /** Položka. Úloha sa na počítači dá ťahať; na mobile má „Presunúť". */
    itemHtml(it, o = {}) {
      const L = C().LAYER[it.layer];
      const today = this.today();
      const tip = [
        `${L.label}: ${it.title}`, it.sub,
        it.time ? `${it.time}${it.endTime ? `–${it.endTime}` : ''}` : '',
        it.end ? `do ${C().dayText(it.end, today)}` : '',
        it.overdue ? 'po termíne' : '', it.snoozedFrom ? `odložené z ${C().dayText(it.snoozedFrom, today)}` : '',
        it.movable && !this._narrow ? 'ťahom presuniete na iný deň' : '',
      ].filter(Boolean).join(' · ');
      const cls = ['kal-it', `l-${it.layer}`, it.overdue ? 'is-late' : '', it.done || it.cancelled ? 'is-done' : '',
        it.past ? 'is-past' : '', it.cont ? 'is-cont' : '', it.more ? 'is-more' : '', it.high ? 'is-high' : ''].filter(Boolean).join(' ');
      const drag = it.movable && !this._narrow ? ` draggable="true" data-move="${esc(it.id)}"` : '';
      return `<div class="${cls}" role="button" tabindex="0" data-key="${esc(it.key)}" style="--c:${esc(it.color)}"
          title="${esc(tip)}"${drag} onclick="event.stopPropagation();Kal.openItem('${esc(it.key)}')">
        <span class="kal-ico">${Icon(it.icon, 12)}</span>
        <span class="kal-txt">${it.time && !it.cont ? `<time>${esc(it.time)}</time>` : ''}<b>${esc(it.title)}</b>${
          it.sub && o.sub !== false ? `<small>${esc(it.sub)}</small>` : ''}</span>
        ${it.movable && o.move ? `<button class="kal-mv" onclick="event.stopPropagation();Kal.moveAsk('${esc(it.id)}')"
          title="Presunúť na iný deň" aria-label="Presunúť: ${esc(it.title)}">${Icon('calendar', 13)}<span>Presunúť</span></button>` : ''}
      </div>`;
    },

    dayHead(d, i) {
      const today = this.today();
      const rel = C().dayRel(d, today);
      return `<header class="kal-dh"><span>${C().DAYS_SHORT[i]}</span><b>${esc(C().dayText(d, today))}</b>${rel ? `<em>${rel}</em>` : ''}</header>`;
    },

    weekHtml(sp) {
      const today = this.today();
      const map = C().byDay(this.shown(), sp.from, sp.to);
      return `<div class="kal-week" role="grid" aria-label="${esc(C().kw(sp.from).title)}">
        ${sp.week.days.map((d, i) => {
          const list = map.get(d) || [];
          return `<section class="kal-day${d === today ? ' is-today' : ''}${i > 4 ? ' is-we' : ''}${d < today ? ' is-past' : ''}"
              data-date="${d}" onclick="Kal.dayClick(event,'${d}')" aria-label="${esc(C().dayLong(d, today))}">
            ${this.dayHead(d, i)}
            <div class="kal-dl">${list.map(it => this.itemHtml(it, { sub: true })).join('')}</div>
            <button class="kal-add" onclick="event.stopPropagation();Kal.addMenu('${d}')"
              title="Pridať na ${esc(C().dayLong(d, today))}" aria-label="Pridať na ${esc(C().dayLong(d, today))}">${Icon('plus', 13)}</button>
          </section>`;
        }).join('')}
      </div>`;
    },

    /** Mobil: týždeň ako zoznam dní. Listuje sa potiahnutím doľava a doprava. */
    dayListHtml(sp) {
      const today = this.today();
      const map = C().byDay(this.shown(), sp.from, sp.to);
      return `<div class="kal-days">
        ${sp.week.days.map((d, i) => {
          const list = map.get(d) || [];
          return `<section class="kal-dayrow${d === today ? ' is-today' : ''}" data-date="${d}">
            <div class="kal-drh">${this.dayHead(d, i)}
              <button class="kal-add-m" onclick="Kal.addMenu('${d}')" aria-label="Pridať na ${esc(C().dayLong(d, today))}">${Icon('plus', 15)}</button></div>
            ${list.length ? `<div class="kal-dl">${list.map(it => this.itemHtml(it, { sub: true, move: true })).join('')}</div>`
              : '<div class="kal-free">Voľno</div>'}
          </section>`;
        }).join('')}
        <p class="kal-swipe">${Icon('repeat', 12)} Potiahnutím doľava a doprava prejdete na ďalší a predošlý týždeň.</p>
      </div>`;
    },

    monthHtml(sp, narrow) {
      const today = this.today();
      const map = C().byDay(this.shown(), sp.from, sp.to);
      const MAX = 3;
      const cell = (c) => {
        const list = map.get(c.date) || [];
        const body = narrow
          ? (list.length ? `<span class="kal-dots">${[...new Set(list.map(it => it.color))].slice(0, 4)
              .map(col => `<i style="background:${esc(col)}"></i>`).join('')}</span><span class="kal-cn">${list.length}</span>` : '')
          : `${list.slice(0, MAX).map(it => this.itemHtml(it, { sub: false })).join('')}${list.length > MAX
              ? `<button class="kal-more" onclick="event.stopPropagation();Kal.openWeek('${c.date}')">+${list.length - MAX} ďalšie</button>` : ''}`;
        return `<div class="kal-cell${c.inMonth ? '' : ' is-out'}${c.date === today ? ' is-today' : ''}${this.sel === c.date && narrow ? ' is-sel' : ''}"
            data-date="${c.date}" role="button" tabindex="0" onclick="Kal.dayClick(event,'${c.date}')"
            aria-label="${esc(C().dayLong(c.date, today))}: ${list.length} ${C().plural(list.length, 'položka', 'položky', 'položiek')}">
          <span class="kal-dn">${c.d}</span>${body}</div>`;
      };
      return `<div class="kal-month">
          <div class="kal-mh"><span class="kal-kwh" title="Kalendárny týždeň">KW</span>${C().DAYS_SHORT.map(d => `<span>${d}</span>`).join('')}</div>
          ${sp.grid.rows.map(r => `<div class="kal-mr">
            <button class="kal-kw" onclick="Kal.openWeek('${r.days[0].date}')" title="${esc(C().kw(r.days[0].date).title)} — otvoriť týždeň">${r.week}</button>
            ${r.days.map(cell).join('')}</div>`).join('')}
        </div>
        ${narrow ? `<div class="kal-mday" id="kal-mday">${this.mdayHtml(map)}</div>` : ''}`;
    },

    /** Mobil, mesiac: zoznam vybraného dňa pod mriežkou. */
    mdayHtml(map) {
      const today = this.today();
      const sp = this.span();
      const d = this.sel && this.sel >= sp.from && this.sel <= sp.to ? this.sel
        : (today >= sp.from && today <= sp.to ? today : sp.grid.rows[0].days.find(x => x.inMonth).date);
      const list = (map || C().byDay(this.shown(), sp.from, sp.to)).get(d) || [];
      return `<div class="kal-mdh"><b>${esc(C().dayLong(d, today))}</b><span>${esc(C().kw(d).short)}</span>
          <button class="btn btn-outline btn-sm" onclick="Kal.addMenu('${d}')">${Icon('plus', 13)} Pridať</button></div>
        ${list.length ? `<div class="kal-dl">${list.map(it => this.itemHtml(it, { sub: true, move: true })).join('')}</div>`
          : '<div class="kal-free">V tento deň nič nie je.</div>'}`;
    },

    agendaHtml(sp) {
      const today = this.today();
      const weeks = C().agenda(this.shown(), sp.from, AGENDA_DAYS);
      if (!weeks.length) {
        return UI.empty('calendar', `Na najbližších ${AGENDA_DAYS} dní nič nie je`,
          'Udalosť alebo úlohu pridáte tlačidlom „Pridať" hore.');
      }
      return `<div class="kal-agenda">${weeks.map(w => `
        <section class="kal-aw">
          <h3 class="kal-awh">${Icon('calendar', 14)} <b>KW ${w.week}</b> · ${esc(C().rangeText(w.from, w.to))}</h3>
          ${w.days.map(d => {
            const rel = C().dayRel(d.date, today);
            return `<div class="kal-ad${d.date === today ? ' is-today' : ''}" data-date="${d.date}">
              <div class="kal-adh"><b>${C().DAYS_SHORT[C().weekday(d.date) - 1]} ${esc(C().dayText(d.date, today))}</b>${rel ? `<em>${rel}</em>` : ''}</div>
              <div class="kal-dl">${d.items.map(it => this.itemHtml(it, { sub: true, move: true })).join('')}</div>
            </div>`;
          }).join('')}
        </section>`).join('')}</div>`;
    },

    // ── Ovládanie ───────────────────────────────────────────────────────
    toggleLayer(k) { this.layers[k] = !this.layers[k]; this._save(); this.paint(); },
    toggleMine() { this.mine = !this.mine || !!this.member; this.member = ''; this._save(); this.paint(); },
    setMember(v) { this.member = v || ''; this.paint(); },
    toggleDone() { this.showDone = !this.showDone; this.paint(); },

    dayClick(e, date) {
      if (e && e.target && e.target.closest && e.target.closest('.kal-it, button, a, select, input')) return;
      if (this.mode === 'month' && this.narrow()) {
        this.sel = date;
        document.querySelectorAll('.kal-cell.is-sel').forEach(c => c.classList.remove('is-sel'));
        const c = document.querySelector(`.kal-cell[data-date="${date}"]`);
        if (c) c.classList.add('is-sel');
        const box = document.getElementById('kal-mday');
        if (box) box.innerHTML = this.mdayHtml();
        return;
      }
      this.addMenu(date);
    },

    _bind(el) {
      const body = el.querySelector('#kal-body');
      if (!body) return;
      // Ťahanie úlohy na iný deň (počítač).
      body.addEventListener('dragstart', (e) => {
        const it = e.target.closest && e.target.closest('[data-move]');
        if (!it) return;
        this._drag = it.dataset.move;
        try { e.dataTransfer.setData('text/plain', this._drag); e.dataTransfer.effectAllowed = 'move'; } catch (err) { /* nič */ }
        it.classList.add('is-drag');
        body.classList.add('is-dragging');
      });
      body.addEventListener('dragend', () => {
        body.classList.remove('is-dragging');
        body.querySelectorAll('.is-drag, .is-over').forEach(x => x.classList.remove('is-drag', 'is-over'));
      });
      body.addEventListener('dragover', (e) => {
        const c = e.target.closest && e.target.closest('[data-date]');
        if (!c || !this._drag) return;
        e.preventDefault();
        body.querySelectorAll('.is-over').forEach(x => { if (x !== c) x.classList.remove('is-over'); });
        c.classList.add('is-over');
      });
      body.addEventListener('drop', (e) => {
        const c = e.target.closest && e.target.closest('[data-date]');
        if (!c) return;
        e.preventDefault();
        let id = this._drag;
        try { id = e.dataTransfer.getData('text/plain') || id; } catch (err) { /* nič */ }
        this.moveTask(id, c.dataset.date);
      });
      // Potiahnutie prstom (mobil): ďalší / predošlý týždeň alebo mesiac.
      let sx = null, sy = null;
      body.addEventListener('touchstart', (e) => { const t = e.touches && e.touches[0]; if (t) { sx = t.clientX; sy = t.clientY; } }, { passive: true });
      body.addEventListener('touchend', (e) => {
        const t = e.changedTouches && e.changedTouches[0];
        if (!t || sx == null || this.mode === 'agenda') return;
        const dx = t.clientX - sx, dy = t.clientY - sy;
        sx = null;
        if (Math.abs(dx) > 60 && Math.abs(dy) < 45) this.shift(dx < 0 ? 1 : -1);
      }, { passive: true });
      if (!this._resizeBound) {
        this._resizeBound = true;
        window.addEventListener('resize', () => {
          if (Danubra.route === 'kalendar' && this.narrow() !== this._narrow && document.querySelector('.kal')) this.paint();
        });
      }
    },

    // ── Presunutie úlohy ────────────────────────────────────────────────
    async moveTask(id, date) {
      this._drag = null;
      const t = this.task(id);
      if (!t || !C().isDate(date)) return;
      if (C().taskDate(t) === date) return;
      const patch = C().movePatch(t, date);
      const before = {};
      for (const k of Object.keys(patch)) before[k] = t[k] == null ? null : t[k];
      const { error } = await DB.update('tasks', id, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const sync = (p) => {
        Object.assign(t, p);
        const tk = window.Tsk && typeof Tsk.find === 'function' ? Tsk.find(id) : null;
        if (tk) Object.assign(tk, p);
        this.rebuild(); this.paint();
      };
      sync(patch);
      if (window.Tsk && typeof Tsk._log === 'function') {
        Tsk._log(id, `Presunutá v kalendári na ${UI.date(date)}${before.due_date ? ` (pôvodne ${UI.date(before.due_date)})` : ''}`);
      }
      UI.toast(`Presunuté na ${C().dayLong(date, this.today())}`, 'ok', {
        action: 'Vrátiť',
        run: async () => {
          const r = await DB.update('tasks', id, before);
          if (r.error) return UI.toast('Chyba: ' + r.error.message, 'err');
          sync(before); UI.toast('Vrátené', 'ok');
        },
      });
    },
    async moveAsk(id) {
      const t = this.task(id);
      if (!t) return;
      const d = await UI.ask('Na ktorý deň úlohu presunúť?', { type: 'date', value: C().taskDate(t) || this.today(),
        ok: 'Presunúť', hint: 'Termín úlohy sa zmení na tento deň. Úloha sa nemaže.' });
      if (d) await this.moveTask(id, d);
    },

    // ── Otvorenie položky ───────────────────────────────────────────────
    find(key) { return this.items.find(i => i.key === key) || null; },
    openItem(key) {
      const it = this.find(key);
      if (!it) return;
      const o = it.open;
      if (o && o.type === 'task') {
        if (!window.Tsk) return;
        const t = this.task(o.id);
        if (t && !Tsk.find(o.id)) Tsk.items.push({ ...t });
        return Tsk.detail(o.id);
      }
      if (o && o.type === 'event') return this.detail(o.id);
      if (it.kind === 'activity' && (!o || o.type === 'activity' || !Danubra.canOpen(o.type, o.id))) return this.noteDetail(it);
      if (o && o.type && Danubra.canOpen(o.type, o.id)) return Danubra.open(o.type, o.id);
      UI.toast('Na tento záznam sa odtiaľto nedá prekliknúť.', 'err');
    },
    noteDetail(it) {
      UI.modal('Poznámka s termínom', `
        <p class="kal-p">${esc(it.body || it.title)}</p>
        <p class="td-muted">Termín: ${esc(C().dayLong(it.date, this.today()))}${it.time ? ` o ${esc(it.time)}` : ''}</p>
        <div class="modal-actions"><button class="btn btn-primary" onclick="UI.closeModal()">Zavrieť</button></div>`);
    },

    // ── Udalosti ────────────────────────────────────────────────────────
    async findEvent(id) {
      const e = (this.raw.events || []).find(x => x.id === id);
      if (e) return e;
      const r = await DB.list('events', { filters: { id }, limit: 1 });
      return ((r && r.data) || []).find(x => x.id === id) || null;
    },

    whenText(e) {
      const today = this.today();
      const d1 = C().dayLong(e.starts_on, today);
      const t = (x) => (x ? String(x).slice(0, 5) : '');
      if (e.ends_on && e.ends_on > e.starts_on) {
        return `${d1}${!e.all_day && e.start_time ? ` ${t(e.start_time)}` : ''} – ${C().dayLong(e.ends_on, today)}${!e.all_day && e.end_time ? ` ${t(e.end_time)}` : ''}`;
      }
      if (e.all_day || !e.start_time) return `${d1}, celý deň`;
      return `${d1}, ${t(e.start_time)}${e.end_time ? `–${t(e.end_time)}` : ''}`;
    },

    async detail(id) {
      this._css();
      const e = await this.findEvent(id);
      if (!e) return UI.toast('Udalosť sa nenašla (možno je v archíve).', 'err');
      this.openId = id;
      const k = C().kindOf(e.kind);
      const names = (e.participants || []).map(pid => this.memberName((Danubra.members || []).find(m => String(m.id) === String(pid)))).filter(Boolean);
      const rm = C().REMIND.find(r => r[0] === (e.remind_minutes == null ? null : Number(e.remind_minutes)));
      const link = e.entity_type && e.entity_id ? Danubra.link(e.entity_type, e.entity_id, e.entity_label || 'Záznam') : '';
      const row = (ic, label, val) => (val ? `<div class="kal-dr">${Icon(ic, 14)}<span>${label}</span><div>${val}</div></div>` : '');
      UI.modal(e.title || k[1], `
        <div class="kal-detail" style="--c:${esc(e.color || C().LAYER.events.color)}">
          <div class="kal-dtop"><span class="kal-kind">${Icon(k[2], 13)} ${esc(k[1])}</span>
            <span class="kal-kwtag">${esc(C().kw(e.starts_on).short)}</span></div>
          ${row('clock', 'Kedy', esc(this.whenText(e)))}
          ${row('pin', 'Kde', esc(e.place || ''))}
          ${row('note', 'Týka sa', link)}
          ${row('workers', 'Účastníci', esc(names.join(', ')))}
          ${row('bell', 'Pripomienka', rm && rm[0] != null ? `${esc(rm[1])} — je v Úlohách` : '')}
          ${e.description ? `<p class="kal-p">${esc(e.description)}</p>` : ''}
        </div>
        <div class="modal-actions">
          <button class="btn btn-danger" onclick="Kal.archiveEvent('${esc(e.id)}')">${Icon('archive', 14)} Archivovať</button>
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          <button class="btn btn-primary" onclick="Kal.eventForm(null,'${esc(e.id)}')">${Icon('edit', 14)} Upraviť</button>
        </div>`, { wide: false });
    },

    /**
     * Formulár udalosti. `preset` = predvyplnené hodnoty (deň, čoho sa týka,
     * názov — z úlohy, z kontaktu s firmou). `id` = úprava existujúcej.
     */
    async eventForm(preset, id) {
      this._css();
      const me = this.me();
      const e = id ? { ...(await this.findEvent(id) || {}) } : {
        kind: 'meeting', starts_on: this.today(), all_day: false, remind_minutes: null,
        participants: me && me.id ? [me.id] : [], ...(preset || {}),
      };
      if (id && !e.id) return UI.toast('Udalosť sa nenašla.', 'err');
      this._editing = { id: id || null, entity: e.entity_type ? { type: e.entity_type, id: e.entity_id, label: e.entity_label || '' } : null };
      const t = (x) => (x ? String(x).slice(0, 5) : '');
      const allDay = !!e.all_day;
      const types = ENT.filter(x => Danubra.routeAvailable((Danubra.entities[x[0]] || {}).route));
      const curType = e.entity_type && types.some(x => x[0] === e.entity_type) ? e.entity_type : (e.entity_type || '');
      const mem = this.members();
      const parts = new Set((e.participants || []).map(String));
      const rmVal = e.remind_minutes == null ? '' : String(e.remind_minutes);
      const color = e.color || '';
      UI.modal(id ? 'Upraviť udalosť' : 'Nová udalosť', `
        <form id="kal-ev-form" class="kal-form" onsubmit="event.preventDefault();Kal.saveEvent()" autocomplete="off">
          <div class="form-grid">
            <div class="fld-full">${UI.field('title', 'Čo to je', { value: e.title || '', required: true,
              placeholder: 'napr. Stretnutie s Bauleiterom, obhliadka stavby Ulm' })}</div>
            ${UI.field('kind', 'Druh', { value: e.kind || 'meeting', options: C().EVENT_KINDS.map(k => [k[0], k[1]]) })}
            ${UI.field('place', 'Kde', { value: e.place || '', placeholder: 'adresa, stavba, telefonicky…' })}
          </div>
          <div class="kal-when">
            ${UI.field('starts_on', 'Deň', { type: 'date', value: e.starts_on || '', required: true })}
            <label class="fld kal-t"><span>Od</span><input type="time" name="start_time" value="${esc(t(e.start_time))}"${allDay ? ' disabled' : ''}></label>
            <label class="fld kal-t"><span>Do</span><input type="time" name="end_time" value="${esc(t(e.end_time))}"${allDay ? ' disabled' : ''}></label>
            ${UI.field('ends_on', 'Posledný deň', { type: 'date', value: e.ends_on || '',
              tip: 'Len pri udalosti na viac dní (montáž, školenie). Inak nechajte prázdne.' })}
            <label class="kal-chk"><input type="checkbox" name="all_day"${allDay ? ' checked' : ''}
              onchange="Kal.allDayChanged(this)"> Celý deň</label>
          </div>
          <div class="form-grid">
            <label class="fld"><span>Týka sa${UI.tip('Záznam, ku ktorému udalosť patrí — firma, odberateľ, zákazka, živnostník alebo kandidát. Z udalosti sa naň dá prekliknúť.')}</span>
              <select name="entity_type" onchange="Kal.entityTypeChanged(this.value)">
                <option value="">— ničoho —</option>
                ${types.map(x => `<option value="${x[0]}"${curType === x[0] ? ' selected' : ''}>${esc(x[1])}</option>`).join('')}
                ${curType && !types.some(x => x[0] === curType) ? `<option value="${esc(curType)}" selected>${esc((Danubra.entities[curType] || {}).what || curType)}</option>` : ''}
              </select></label>
            <label class="fld"><span>Ktorý záznam</span>
              <input name="entity_label" list="kal-ent-list" value="${esc(e.entity_label || '')}" placeholder="začnite písať meno…"${curType ? '' : ' disabled'}>
              <datalist id="kal-ent-list"></datalist></label>
          </div>
          ${mem.length ? `<div class="fld"><span>Účastníci${UI.tip('Kto z kolegov tam bude. „Len moje" v kalendári ukáže udalosti, kde ste medzi nimi.')}</span>
            <div class="kal-parts">${mem.map(m => `<label class="kal-part${parts.has(String(m.id)) ? ' on' : ''}">
              <input type="checkbox" name="participants" value="${esc(m.id)}"${parts.has(String(m.id)) ? ' checked' : ''}
                onchange="this.parentNode.classList.toggle('on', this.checked)"> ${esc(this.memberName(m))}${me && me.id === m.id ? ' <em>ja</em>' : ''}</label>`).join('')}</div></div>` : ''}
          <div class="form-grid">
            <label class="fld"><span>Pripomienka${UI.tip('Pripomienka sa založí ako úloha v Úlohách na deň a čas pred začiatkom — je tak v odznakoch aj na Prehľade dňa. Dostane ju prvý účastník (Vy, ak ste medzi nimi).')}</span>
              <select name="remind_minutes">${C().REMIND.map(([v, l]) => `<option value="${v == null ? '' : v}"${String(v == null ? '' : v) === rmVal ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            <div class="fld"><span>Farba</span>
              <div class="kal-colors" role="radiogroup" aria-label="Farba">
                <label class="kal-color${color ? '' : ' on'}" title="Podľa druhu"><input type="radio" name="color" value=""${color ? '' : ' checked'}
                  onchange="Kal.colorPicked(this)"><i style="background:${C().LAYER.events.color}"></i></label>
                ${C().COLORS.slice(1).map(c => `<label class="kal-color${color === c ? ' on' : ''}"><input type="radio" name="color" value="${c}"${color === c ? ' checked' : ''}
                  onchange="Kal.colorPicked(this)"><i style="background:${c}"></i></label>`).join('')}
              </div></div>
          </div>
          ${UI.field('description', 'Poznámka', { type: 'textarea', rows: 2, value: e.description || '', placeholder: 'čo pripraviť, kto je kontakt na stavbe…' })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${Icon('check', 14)} ${id ? 'Uložiť' : 'Pridať do kalendára'}</button>
          </div>
        </form>`, { wide: true });
      if (curType) this.entityTypeChanged(curType, true);
    },

    allDayChanged(cb) {
      const f = cb.form;
      for (const n of ['start_time', 'end_time']) { const i = f.querySelector(`[name=${n}]`); if (i) i.disabled = cb.checked; }
    },
    colorPicked(r) {
      r.closest('.kal-colors').querySelectorAll('.kal-color').forEach(l => l.classList.toggle('on', l.contains(r)));
    },
    async entityTypeChanged(type, keep) {
      const f = document.getElementById('kal-ev-form');
      if (!f) return;
      const inp = f.querySelector('[name=entity_label]');
      const list = document.getElementById('kal-ent-list');
      inp.disabled = !type;
      if (!keep) inp.value = '';
      this._entOpts = [];
      if (list) list.innerHTML = '';
      const def = ENT.find(x => x[0] === type);
      if (!def) return;
      if (type === 'lead' && !Danubra.can('marketing')) return;
      const r = await DB.list(def[2], { select: `id,${def[3]}`, limit: 1000 });
      this._entOpts = ((r && r.data) || []).map(x => ({ id: x.id, label: String(x[def[3]] || '').trim() })).filter(x => x.label);
      if (list && document.getElementById('kal-ev-form') === f) {
        list.innerHTML = this._entOpts.map(o => `<option value="${esc(o.label)}"></option>`).join('');
      }
    },

    async saveEvent() {
      const f = document.getElementById('kal-ev-form');
      if (!f || this._saving) return;
      const d = UI.formData(f);
      d.participants = [...f.querySelectorAll('input[name=participants]:checked')].map(x => x.value);
      d.all_day = !!(f.querySelector('[name=all_day]') || {}).checked;
      // Čoho sa týka: vybraté zo zoznamu, alebo to, čo tam už bolo.
      const ed = this._editing || {};
      const label = String(d.entity_label || '').trim();
      d.entity_id = null;
      if (!d.entity_type || !label) { d.entity_type = null; d.entity_label = null; }
      else {
        const hit = (this._entOpts || []).find(o => o.label === label)
          || (this._entOpts || []).find(o => o.label.toLowerCase() === label.toLowerCase());
        if (hit) { d.entity_id = hit.id; d.entity_label = hit.label; }
        else if (ed.entity && ed.entity.type === d.entity_type && ed.entity.label === label) d.entity_id = ed.entity.id;
        else return UI.toast('Vyberte záznam zo zoznamu, alebo pole „Ktorý záznam" vymažte.', 'err');
      }
      const row = C().eventRow(d);
      const v = C().validateEvent(row);
      if (!v.ok) return UI.toast(v.errors[0], 'err');
      this._saving = true;
      const id = ed.id;
      const prev = id ? await this.findEvent(id) : null;
      const res = id ? await DB.update('events', id, row) : await DB.insert('events', row);
      this._saving = false;
      if (res.error) {
        return UI.toast(this._isMissing(res.error) ? 'Udalosti ešte nie sú pripravené v databáze (migrácia 089).'
          : 'Chyba: ' + res.error.message, 'err');
      }
      const ev = { ...(prev || {}), ...row, ...(res.data || {}), id: (res.data && res.data.id) || id };
      const rem = await this.syncReminder(ev);
      UI.closeModal();
      UI.toast(`${id ? 'Udalosť je uložená' : 'Udalosť je v kalendári'}${rem ? ` — pripomienka ${UI.date(rem.due_date)} o ${String(rem.due_time).slice(0, 5)} je v Úlohách` : ''}`, 'ok');
      if (window.Tsk && rem) Tsk.loaded = false;
      if (Danubra.route === 'kalendar') { this.anchor = row.starts_on; this.sel = row.starts_on; await Danubra.renderRoute(); }
    },

    /** Kto dostane pripomienku: ja, ak som účastník; inak prvý účastník; inak ja. */
    _reminderMember(ev) {
      const all = Danubra.members || [];
      const me = Danubra.me;
      const ids = (ev.participants || []).map(String);
      if (me && me.id && (!ids.length || ids.includes(String(me.id)))) return me;
      return all.find(m => String(m.id) === ids[0]) || me || null;
    },

    /**
     * Pripomienka udalosti = úloha. Založí sa, upraví (iný čas, iný názov)
     * alebo zruší (bez pripomienky). Nemaže sa nič.
     * @returns {Object|null} úloha s pripomienkou
     */
    async syncReminder(ev) {
      const rem = C().reminderFor(ev, ev.remind_minutes);
      const rid = ev.reminder_task_id;
      if (!rem) {
        if (rid) await DB.update('tasks', rid, { status: 'cancelled' });
        return null;
      }
      const who = this._reminderMember(ev);
      const payload = {
        title: rem.title,
        description: [ev.place ? `Kde: ${ev.place}` : '', ev.entity_label ? `Týka sa: ${ev.entity_label}` : '', ev.description || '']
          .filter(Boolean).join('\n') || null,
        due_date: rem.due_date, due_time: rem.due_time, status: 'open', done_at: null, priority: 'normal',
        source: 'event', source_key: `event:${ev.id}`, entity_type: 'event', entity_id: ev.id, entity_label: ev.title,
        ...(who && T() ? T().assignPatch(who) : {}),
      };
      if (rid) {
        const r = await DB.update('tasks', rid, payload);
        if (!r.error) return r.data || payload;
      }
      let r = await DB.insert('tasks', payload);
      if (r.error && /duplicate|23505|source_key/i.test(`${r.error.code || ''} ${r.error.message || ''}`)) {
        const { source_key, ...rest } = payload;
        r = await DB.insert('tasks', rest);
      }
      if (r.error) { UI.toast('Udalosť je uložená, ale pripomienku sa nepodarilo založiť: ' + r.error.message, 'err'); return null; }
      if (r.data && r.data.id) await DB.update('events', ev.id, { reminder_task_id: r.data.id });
      return r.data || payload;
    },

    async archiveEvent(id) {
      const e = await this.findEvent(id);
      if (!await UI.confirmArchive('Presunúť túto udalosť do archívu?')) return;
      const { error } = await DB.archive('events', id);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      if (e && e.reminder_task_id) await DB.update('tasks', e.reminder_task_id, { status: 'cancelled' });
      this.raw.events = (this.raw.events || []).filter(x => x.id !== id);
      this.openId = null;
      UI.closeModal();
      UI.toast(UI.ARCHIVED || 'Presunuté do archívu', 'ok');
      if (Danubra.route === 'kalendar') { this.rebuild(); this.paint(); }
    },

    // ── Pridať ──────────────────────────────────────────────────────────
    addMenu(date) {
      this._css();
      const d = C().isDate(date) ? date : (this.sel || this.today());
      const tile = (k, ic, title, sub) => `<button type="button" class="kal-addt" data-add="${k}" onclick="Kal.addKind('${k}')">
          <span class="kal-addi">${Icon(ic, 18)}</span><span><b>${title}</b><em>${sub}</em></span>${Icon('chevron', 14)}</button>`;
      UI.modal('Pridať do kalendára', `
        <label class="fld kal-addd"><span>Deň</span><input type="date" id="kal-add-date" value="${esc(d)}"></label>
        <div class="kal-addl">
          ${tile('event', 'calendar', 'Udalosť', 'Stretnutie, hovor, obhliadka stavby, termín — s časom a miestom')}
          ${window.Tsk && Danubra.routeAvailable('tasks') ? tile('task', 'tasks', 'Úloha', 'Čo treba spraviť do toho dňa — bude v Úlohách') : ''}
          ${tile('reminder', 'bell', 'Pripomienka', 'Úloha s presným časom — napr. „o 9:00 zavolať do Ulmu"')}
        </div>`);
    },
    addKind(kind) {
      const inp = document.getElementById('kal-add-date');
      const d = inp && C().isDate(inp.value) ? inp.value : this.today();
      UI.closeModal();
      if (kind === 'event') return this.eventForm({ starts_on: d });
      if (kind === 'task') return window.Tsk && Tsk.form('', { due_date: d });
      return this.reminderForm({ due_date: d });
    },

    reminderForm(preset = {}) {
      this._css();
      const me = Danubra.me;
      const mem = this.members();
      UI.modal('Nová pripomienka', `
        <form id="kal-rem-form" onsubmit="event.preventDefault();Kal.saveReminder()" autocomplete="off">
          ${preset.entity_type && preset.entity_id ? `<div class="tk-form-ent">${Icon('note', 13)} Týka sa: ${Danubra.link(preset.entity_type, preset.entity_id, preset.entity_label || 'záznam')}
            <input type="hidden" name="entity_type" value="${esc(preset.entity_type)}"><input type="hidden" name="entity_id" value="${esc(preset.entity_id)}">
            <input type="hidden" name="entity_label" value="${esc(preset.entity_label || '')}"></div>` : ''}
          <div class="form-grid">
            <div class="fld-full">${UI.field('title', 'Čo pripomenúť', { value: preset.title || '', required: true, placeholder: 'napr. Zavolať Bauleiterovi do Ulmu' })}</div>
            ${UI.field('due_date', 'Deň', { type: 'date', value: preset.due_date || this.today(), required: true })}
            ${UI.field('due_time', 'Čas', { type: 'time', value: preset.due_time || '09:00', required: true })}
            ${mem.length ? UI.field('who', 'Komu', { value: (me && me.id) || '', options: [['', '— nikomu —'], ...mem.map(m => [m.id, this.memberName(m)])] }) : ''}
          </div>
          <p class="td-muted">Pripomienka je úloha s časom — nájdete ju v Úlohách, na Prehľade dňa aj tu v kalendári.</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${Icon('bell', 14)} Pridať pripomienku</button>
          </div>
        </form>`);
    },
    async saveReminder() {
      const f = document.getElementById('kal-rem-form');
      if (!f) return;
      const d = UI.formData(f);
      if (!String(d.title || '').trim()) return UI.toast('Napíšte, čo pripomenúť', 'err');
      if (!C().isDate(d.due_date) || !C().isTime(d.due_time)) return UI.toast('Vyberte deň a čas', 'err');
      const m = d.who ? (Danubra.members || []).find(x => String(x.id) === String(d.who)) : null;
      const payload = {
        title: d.title.trim(), due_date: d.due_date, due_time: d.due_time, status: 'open', priority: 'normal', source: 'reminder',
        entity_type: d.entity_type || null, entity_id: d.entity_id || null, entity_label: d.entity_label || null,
        ...(T() ? T().assignPatch(m) : {}),
      };
      const r = await DB.insert('tasks', payload);
      if (r.error) {
        return UI.toast(this._isMissing(r.error) ? 'Pripomienky s časom ešte nie sú pripravené v databáze (migrácia 089).'
          : 'Chyba: ' + r.error.message, 'err');
      }
      UI.closeModal();
      UI.toast(`Pripomienka ${UI.date(d.due_date)} o ${d.due_time} je v Úlohách`, 'ok');
      if (window.Tsk) Tsk.loaded = false;
      if (Danubra.route === 'kalendar') { this.anchor = d.due_date; await Danubra.renderRoute(); }
    },

    /** „Pridať do kalendára" odinakiaľ (úloha, kontakt s firmou). */
    fromTask(t) {
      if (!t) return;
      return this.eventForm({ title: t.title || '', starts_on: t.due_date || this.today(), description: t.description || '',
        entity_type: t.entity_type || null, entity_id: t.entity_id || null, entity_label: t.entity_label || null });
    },

    // ── KW v hornom pruhu ───────────────────────────────────────────────
    paintBadge() {
      if (!C() || typeof document === 'undefined') return;
      const k = C().kw(this.today());
      for (const id of ['kw-badge', 'kw-badge-m']) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.innerHTML = `${window.Icon ? Icon('calendar', 15) : ''}<span>${k.short}</span>`;
        el.title = `${k.title} — otvoriť kalendár`;
        if (el.setAttribute) el.setAttribute('aria-label', `${k.title}. Otvoriť kalendár`);
        if (el.dataset) el.dataset.kw = String(k.week);
      }
    },
    _tick() {
      try { this._css(); this.paintBadge(); } catch (e) { /* nič */ }
      // Prelom týždňa o polnoci: stačí pozrieť raz za minútu.
      if (typeof setTimeout === 'function') this._t = setTimeout(() => this._tick(), 60000);
    },
    openFromBadge() {
      this.mode = this.mode || 'week';
      this.anchor = this.today();
      this.sel = this.today();
      if (Danubra.route === 'kalendar') return Danubra.renderRoute();
      return Danubra.go('kalendar');
    },

    // ── Prehľad dňa: „Tento týždeň (KW 45)" ─────────────────────────────
    dashHtml() {
      if (!Danubra.routeAvailable('kalendar') || !C()) return '';
      const k = C().kw(this.today());
      if (typeof setTimeout === 'function') setTimeout(() => this.fillDash(), 0);
      return `<div class="kal-dash" id="kal-dash">
        <div class="kal-dash-h">${Icon('calendar', 14)} <b>Tento týždeň (${k.short})</b><span>${esc(k.range)}</span></div>
        <div class="kal-dash-n" id="kal-dash-n">Načítavam…</div>
        <button class="btn btn-outline btn-sm" onclick="Kal.openFromBadge()">${Icon('calendar', 13)} Otvoriť kalendár</button>
      </div>`;
    },
    async fillDash(again) {
      const box = document.getElementById('kal-dash-n');
      if (!box) { if (!again && typeof setTimeout === 'function') setTimeout(() => this.fillDash(true), 300); return; }
      const today = this.today();
      const w = C().weekOf(today);
      try {
        const [t1, t2, ev] = await Promise.all([
          this._tasks({ gte: { due_date: w.from }, lte: { due_date: w.to }, limit: 500 }),
          this._tasks({ gte: { postponed_to: w.from }, lte: { postponed_to: w.to }, limit: 300 }),
          this._events(w.from, w.to),
        ]);
        const items = C().build({ tasks: [...((t1 && t1.data) || []), ...((t2 && t2.data) || [])], events: (ev && ev.data) || [] },
          { today, from: w.from, to: w.to });
        const me = this.personOf(Danubra.me && Danubra.me.id ? Danubra.me : null);
        const s = C().weekSummary(C().filter(items, { person: me }), today);
        const P = C().plural;
        const n = (x, one, few, many) => `<b>${x}</b> ${P(x, one, few, many)}`;
        if (!document.body.contains(box)) return;
        box.innerHTML = `${me ? 'Vaše: ' : ''}dnes ${n(s.today.tasks, 'úloha', 'úlohy', 'úloh')} a ${n(s.today.events, 'udalosť', 'udalosti', 'udalostí')}
          · celý týždeň ${n(s.week.tasks, 'úloha', 'úlohy', 'úloh')} a ${n(s.week.events, 'udalosť', 'udalosti', 'udalostí')}`;
      } catch (e) { box.textContent = ''; }
    },

    // ── Štýly (raz) ─────────────────────────────────────────────────────
    _css() {
      if (typeof document === 'undefined' || !document.head || document.getElementById('kal-css')) return;
      const st = document.createElement('style');
      st.id = 'kal-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    },
  };

  const CSS = `
.kw-badge{flex:none;display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 11px;border:1px solid var(--border);border-radius:var(--radius-sm);background:#fff;color:var(--ink);font:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;font-variant-numeric:tabular-nums;}
.kw-badge .ico{color:var(--brand);}
.kw-badge:hover{border-color:var(--brand);background:var(--brand-50);}
.mobile-head .kw-badge{height:34px;padding:0 8px;gap:4px;background:var(--navy-2);border-color:var(--navy-line);color:#fff;font-size:12.5px;}
.mobile-head .kw-badge:hover{background:var(--navy-line);}
.kal{display:flex;flex-direction:column;gap:12px;}
.kal-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;}
.kal-nav{display:flex;align-items:center;gap:6px;flex:1 1 360px;min-width:0;}
.kal-arrow{width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:var(--radius-sm);background:#fff;color:var(--ink);cursor:pointer;}
.kal-arrow:hover{border-color:var(--blue);color:var(--blue);}
.kal-title{margin:0 0 0 8px;font-size:18px;font-weight:600;color:var(--ink-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.kal-title b{color:var(--ink);font-weight:800;}
.kal-modes{display:inline-flex;border:1px solid var(--border);border-radius:var(--radius);background:var(--field);padding:2px;}
.kal-mode{display:inline-flex;align-items:center;gap:6px;border:0;background:none;padding:6px 12px;border-radius:var(--radius-sm);font:inherit;font-size:13px;font-weight:600;color:var(--ink-sub);cursor:pointer;}
.kal-mode.on{background:#fff;color:var(--ink);box-shadow:0 1px 2px rgba(10,27,61,.12);}
.kal-filters{display:flex;flex-wrap:wrap;align-items:center;gap:6px;}
.kal-tog{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:#fff;font:inherit;font-size:12.5px;font-weight:600;color:var(--ink-sub);cursor:pointer;}
.kal-tog.on{border-color:var(--blue);background:var(--blue-50);color:var(--blue);}
.kal-sel{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:#fff;color:var(--ink-sub);}
.kal-sel select{border:0;background:transparent;font:inherit;font-size:12.5px;color:var(--ink);outline:none;max-width:150px;}
.kal-layers{display:flex;flex-wrap:wrap;align-items:center;gap:6px;}
.kal-lay{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid var(--border);border-radius:999px;background:#fff;font:inherit;font-size:12.5px;color:var(--ink-mute);cursor:pointer;}
.kal-lay i{width:9px;height:9px;border-radius:50%;background:transparent;border:2px solid var(--c);flex:none;}
.kal-lay.on{color:var(--ink);border-color:color-mix(in srgb,var(--c) 45%,var(--border));}
.kal-lay.on i{background:var(--c);}
.kal-lay .ico{color:var(--c);}
.kal-lay em{font-style:normal;font-weight:700;font-size:11.5px;color:var(--ink-sub);background:var(--field);border-radius:999px;padding:0 6px;}
.kal-lay:not(.on){text-decoration:line-through;text-decoration-color:var(--ink-mute);}
.kal-lay-sep{display:inline-flex;align-items:center;gap:4px;margin-left:8px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-sub);}
.kal-late{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 12px;border-radius:var(--radius);background:var(--red-50);color:var(--red);font-size:13px;}
.kal-late .ico{flex:none;}
.kal-it{position:relative;display:flex;align-items:flex-start;gap:6px;padding:5px 7px 5px 8px;border-radius:var(--radius-sm);background:color-mix(in srgb,var(--c) 9%,#fff);border-left:3px solid var(--c);font-size:12.5px;line-height:1.3;color:var(--ink);cursor:pointer;min-width:0;}
.kal-it:hover{background:color-mix(in srgb,var(--c) 16%,#fff);}
.kal-it .kal-ico{flex:none;color:var(--c);margin-top:1px;}
.kal-txt{display:flex;flex-direction:column;min-width:0;flex:1;}
.kal-txt b{font-weight:600;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
.kal-txt time{font-size:11px;font-weight:700;color:var(--c);font-variant-numeric:tabular-nums;}
.kal-txt small{font-size:11.5px;color:var(--ink-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.kal-it.is-late{background:var(--red-50);border-left-color:var(--red);}
.kal-it.is-late .kal-ico,.kal-it.is-late time{color:var(--red);}
.kal-it.is-late b::after{content:' · po termíne';font-weight:600;color:var(--red);font-size:11px;}
.kal-it.is-done{opacity:.6;} .kal-it.is-past{opacity:.65;} .kal-it.is-done b{text-decoration:line-through;}
.kal-it.is-high b{color:var(--red);}
.kal-it.is-cont{border-top-left-radius:0;border-bottom-left-radius:0;border-left-style:dashed;}
.kal-it[draggable="true"]{cursor:grab;}
.kal-it.is-drag{opacity:.4;}
.kal-mv{flex:none;display:inline-flex;align-items:center;gap:4px;margin-left:auto;padding:3px 7px;border:1px solid var(--border);border-radius:var(--radius-sm);background:#fff;font:inherit;font-size:11.5px;font-weight:600;color:var(--ink-sub);cursor:pointer;}
.kal-dl{display:flex;flex-direction:column;gap:4px;min-width:0;}
.kal-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--card);overflow:hidden;}
.kal-day{position:relative;display:flex;flex-direction:column;gap:6px;min-height:420px;padding:8px 6px 34px;border-left:1px solid var(--border-soft);min-width:0;}
.kal-day:first-child{border-left:0;}
.kal-day.is-we{background:var(--bg);}
.kal-day.is-today{background:color-mix(in srgb,var(--brand) 5%,#fff);box-shadow:inset 0 3px 0 var(--brand);}
.kal-day.is-over,.kal-cell.is-over{background:var(--blue-50);box-shadow:inset 0 0 0 2px var(--blue);}
.kal-dh{display:flex;align-items:baseline;gap:6px;padding:0 2px 6px;border-bottom:1px solid var(--border-soft);}
.kal-dh span{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-sub);}
.kal-dh b{font-size:15px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;}
.kal-dh em{margin-left:auto;font-style:normal;font-size:11px;font-weight:700;color:var(--brand-dark);}
.kal-day.is-past .kal-dh b{color:var(--ink-sub);}
.kal-add{position:absolute;left:6px;right:6px;bottom:6px;height:24px;display:flex;align-items:center;justify-content:center;border:1px dashed transparent;border-radius:var(--radius-sm);background:none;color:var(--ink-mute);cursor:pointer;opacity:0;}
.kal-day:hover .kal-add,.kal-add:focus{opacity:1;border-color:var(--border);}
.kal-add:hover{color:var(--brand);border-color:var(--brand);}
.kal-month{border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--card);overflow:hidden;}
.kal-mh,.kal-mr{display:grid;grid-template-columns:44px repeat(7,minmax(0,1fr));}
.kal-mh span{padding:7px 8px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-sub);border-bottom:1px solid var(--border);}
.kal-mh .kal-kwh{text-align:center;background:var(--field);}
.kal-mr+.kal-mr{border-top:1px solid var(--border-soft);}
.kal-kw{border:0;border-right:1px solid var(--border);background:var(--field);font:inherit;font-size:12.5px;font-weight:800;color:var(--ink-sub);cursor:pointer;font-variant-numeric:tabular-nums;}
.kal-kw:hover{color:var(--brand);background:var(--brand-50);}
.kal-cell{display:flex;flex-direction:column;gap:3px;min-height:112px;padding:5px;border-left:1px solid var(--border-soft);min-width:0;cursor:pointer;}
.kal-mr .kal-cell:nth-child(2){border-left:0;}
.kal-cell.is-out{background:var(--bg);} .kal-cell.is-out .kal-dn{color:var(--ink-mute);}
.kal-dn{font-size:12.5px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;}
.kal-cell.is-today .kal-dn{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--brand);color:#fff;}
.kal-cell .kal-it{padding:2px 5px;font-size:11.5px;}
.kal-cell .kal-it b{-webkit-line-clamp:1;}
.kal-more{border:0;background:none;padding:1px 4px;font:inherit;font-size:11.5px;font-weight:600;color:var(--blue);cursor:pointer;text-align:left;}
.kal-agenda{display:flex;flex-direction:column;gap:14px;}
.kal-aw{border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--card);overflow:hidden;}
.kal-awh{display:flex;align-items:center;gap:6px;margin:0;padding:9px 14px;background:var(--field);border-bottom:1px solid var(--border);font-size:13.5px;font-weight:500;color:var(--ink-sub);}
.kal-awh b{color:var(--ink);font-weight:800;} .kal-awh .ico{color:var(--brand);}
.kal-ad{display:grid;grid-template-columns:120px minmax(0,1fr);gap:12px;padding:10px 14px;border-top:1px solid var(--border-soft);}
.kal-ad:first-of-type{border-top:0;}
.kal-ad.is-today{background:color-mix(in srgb,var(--brand) 5%,#fff);}
.kal-adh{display:flex;flex-direction:column;font-size:13px;} .kal-adh em{font-style:normal;font-size:11.5px;font-weight:700;color:var(--brand-dark);}
.kal-days{display:flex;flex-direction:column;gap:8px;}
.kal-dayrow{border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--card);padding:8px 10px;}
.kal-dayrow.is-today{border-color:var(--brand);box-shadow:inset 3px 0 0 var(--brand);}
.kal-drh{display:flex;align-items:center;gap:8px;} .kal-drh .kal-dh{flex:1;border:0;padding:0;}
.kal-dayrow .kal-dl{margin-top:6px;}
.kal-add-m{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:var(--radius-sm);background:#fff;color:var(--ink-sub);}
.kal-free{font-size:12px;color:var(--ink-mute);padding:2px 0;}
.kal-swipe{display:flex;align-items:center;gap:6px;margin:2px 0 0;font-size:12px;color:var(--ink-mute);}
.is-narrow .kal-month .kal-mh,.is-narrow .kal-month .kal-mr{grid-template-columns:30px repeat(7,minmax(0,1fr));}
.is-narrow .kal-mh span{padding:6px 2px;text-align:center;font-size:10.5px;}
.is-narrow .kal-cell{min-height:50px;align-items:center;padding:4px 1px;gap:2px;}
.is-narrow .kal-cell.is-sel{box-shadow:inset 0 0 0 2px var(--blue);}
.kal-dots{display:flex;gap:2px;} .kal-dots i{width:6px;height:6px;border-radius:50%;}
.kal-cn{font-size:10.5px;color:var(--ink-sub);font-weight:600;}
.kal-mday{margin-top:10px;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--card);padding:10px;}
.kal-mdh{display:flex;align-items:center;gap:8px;margin-bottom:8px;} .kal-mdh span{font-size:12px;color:var(--ink-sub);font-weight:700;} .kal-mdh .btn{margin-left:auto;}
.kal-form .kal-when{display:grid;grid-template-columns:1.3fr .8fr .8fr 1.3fr auto;gap:8px 12px;align-items:end;margin:4px 0 8px;}
.kal-chk{display:inline-flex;align-items:center;gap:6px;font-size:13px;padding-bottom:9px;white-space:nowrap;}
.kal-parts{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;}
.kal-part{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid var(--border);border-radius:999px;font-size:12.5px;cursor:pointer;background:var(--field);}
.kal-part.on{border-color:var(--blue);background:var(--blue-50);color:var(--blue);font-weight:600;}
.kal-part input{margin:0;} .kal-part em{font-style:normal;font-size:11px;color:var(--ink-sub);}
.kal-colors{display:flex;gap:6px;margin-top:6px;}
.kal-color{position:relative;cursor:pointer;} .kal-color input{position:absolute;opacity:0;pointer-events:none;}
.kal-color i{display:block;width:24px;height:24px;border-radius:50%;box-shadow:inset 0 0 0 2px rgba(255,255,255,.6);}
.kal-color.on i{outline:2px solid var(--ink);outline-offset:2px;}
.kal-detail{border-left:4px solid var(--c);padding-left:12px;display:flex;flex-direction:column;gap:8px;}
.kal-dtop{display:flex;align-items:center;gap:8px;}
.kal-kind{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;background:color-mix(in srgb,var(--c) 14%,#fff);color:var(--ink);font-size:12.5px;font-weight:600;}
.kal-kind .ico{color:var(--c);}
.kal-kwtag{font-size:12px;font-weight:800;color:var(--ink-sub);}
.kal-dr{display:grid;grid-template-columns:18px 90px minmax(0,1fr);gap:8px;align-items:start;font-size:13.5px;}
.kal-dr>.ico{color:var(--ink-mute);margin-top:2px;} .kal-dr span{color:var(--ink-sub);}
.kal-p{font-size:13.5px;line-height:1.5;white-space:pre-wrap;margin:4px 0;}
.kal-addd{max-width:220px;margin-bottom:12px;}
.kal-addl{display:flex;flex-direction:column;gap:8px;}
.kal-addt{display:flex;align-items:center;gap:12px;text-align:left;padding:12px 14px;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--card);font:inherit;color:var(--ink);cursor:pointer;}
.kal-addt:hover{border-color:var(--brand);background:var(--brand-50);}
.kal-addt>span:nth-child(2){flex:1;display:flex;flex-direction:column;gap:2px;} .kal-addt b{font-size:14.5px;} .kal-addt em{font-style:normal;font-size:12.5px;color:var(--ink-sub);}
.kal-addi{flex:none;width:38px;height:38px;border-radius:10px;display:grid;place-items:center;background:var(--brand-50);color:var(--brand-dark);}
.kal-dash{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin-top:12px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg);}
.kal-dash-h{display:flex;align-items:center;gap:6px;font-size:13px;} .kal-dash-h .ico{color:var(--brand);} .kal-dash-h span{color:var(--ink-sub);font-size:12.5px;}
.kal-dash-n{flex:1 1 100%;font-size:12.5px;color:var(--ink-sub);}
.kal-dash-n b{color:var(--ink);}
@media (max-width:1100px){.kal-day{min-height:340px;}.kal-title{font-size:16px;}}
@media (max-width:760px){
  .kal-bar{gap:8px;} .kal-nav{flex-basis:100%;} .kal-title{font-size:15px;margin-left:4px;}
  .kal-modes{flex:1;} .kal-mode{flex:1;justify-content:center;padding:6px 6px;}
  .kal-layers{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px;margin:0 -16px;padding-left:16px;padding-right:16px;scrollbar-width:none;}
  .kal-lay{flex:none;}
  .kal-ad{grid-template-columns:1fr;gap:6px;}
  .kal-form .kal-when{grid-template-columns:1fr 1fr;}
  .kal-form .kal-when .fld:first-child{grid-column:1/-1;}
  .kal-dr{grid-template-columns:18px 80px minmax(0,1fr);}
}`;

  window.Kal = Kal;
  Danubra.views.kalendar = function (el) { return Kal.view(el); };
  Kal._tick();
})();
