// ============================================================================
// DANUBRA — Úlohy a pripomienky
// ============================================================================
// Zoznam, v ktorom je päťdesiat položiek, sa neprezerá. Prezerá sa zoznam,
// v ktorom je päť. Preto sa úlohy triedia podľa toho, **čo horí**:
//
//   malo byť hotové → dnes → tento týždeň → neskôr
//
// Väčšina úloh sem nepribúda ručne — vznikajú z pravidiel (F9, migrácia 021).
// Pravidlo je riadok v tabuľke, nie kus kódu, takže nové sa dá pridať bez
// nasadenia.
//
// Logika triedenia je v lib/tasks.js a má testy.
// ============================================================================
(function () {
  const STATUS = [['open', 'Otvorená', 'amber'], ['in_progress', 'Rozpracovaná', 'blue'],
    ['done', 'Hotová', 'green'], ['cancelled', 'Zrušená', 'gray']];
  const PRIO = [['high', 'Vysoká', 'red'], ['normal', 'Bežná', 'gray'], ['low', 'Nízka', 'gray']];
  const ENTITY = {
    inquiry: ['Dopyt', 'inquiries'], order: ['Objednávka', 'orders'],
    subcontract: ['Zákazka', 'subcontracts'], worker: ['Pracovník', 'workers'],
    client: ['Klient', 'clients'], partner: ['Odberateľ', 'partners'], invoice: ['Faktúra', 'invoices'],
    contract: ['Zmluva', 'contracts'], quote: ['Ponuka', 'quotes'],
    candidate: ['Kandidát', 'candidates'], crew: ['Partia', 'crews'],
    bill: ['Prijatá faktúra', 'costs'],
  };

  const Tsk = {
    items: [], loaded: false, filters: { status: 'open', who: '', q: '' },

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

    async view(el) {
      Danubra.setActions(
        `<button class="btn btn-outline btn-sm" onclick="Tsk.rulesView()">${Icon('rules', 14)} Pravidlá</button>
         <button class="btn btn-primary btn-sm" onclick="Tsk.form()">${Icon('plus')} Nová úloha</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }

      const head = DanubraTasks.headline(this.items);
      const c = DanubraTasks.counts(this.items);

      // Prvé, čo treba prečítať, je jedna veta — nie tabuľka.
      const banner = `<div class="headline headline-${head.tone}">
        ${Icon(head.tone === 'bad' ? 'alert' : head.tone === 'warn' ? 'clock' : 'check', 18)}
        <span>${UI.esc(head.text)}</span>
      </div>`;

      const f = this.filters.status;
      const rows = this.rows();
      const bar = Shell.filterbar({
        search: { value: this.filters.q, placeholder: 'Hľadať úlohu, záznam, meno…',
          oninput: 'Tsk.setQ(this.value)' },
        exportCsv: 'Tsk.exportCsv()',
        total: this.items.length, shown: rows.length,
      });
      const pageHead = Danubra.header('Úlohy a pripomienky',
        this.filters.who
          ? (this.filters.who === DanubraTasks.UNASSIGNED
              ? 'Úlohy, ktoré nemá nikto na starosti'
              : `Čo má na starosti ${UI.esc(this.filters.who)}`)
          : 'Kto čo má na starosti');

      // Zoradené podľa toho, čo horí — ale len vtedy, keď sa pozerá na to,
      // čo treba spraviť. V hotových a zrušených je poradie podľa termínu
      // a skupiny by tam nedávali zmysel.
      const groups = f === 'open' ? DanubraTasks.group(rows) : null;

      el.innerHTML = pageHead + banner + this.peopleStrip() + this.pills(f) + bar
        + (rows.length
          ? (groups
              ? (groups.length ? groups.map(g => `
                  <div class="task-group">
                    <span class="tg-label">${UI.esc(g.label)}</span>
                    <span class="tg-count tg-${g.tone || 'gray'}">${g.tasks.length}</span>
                  </div>
                  ${g.tasks.map(t => this.row(t)).join('')}`).join('')
                : UI.empty('check', 'Nič nehorí', 'Všetko je vybavené alebo odložené na neskôr.'))
              : rows.map(t => this.row(t)).join(''))
          : (this.items.length
              ? UI.empty('search', 'Filtru nič nesedí', 'Skús iný filter alebo iné meno.')
              : UI.empty('check', 'Nič nehorí',
                  'Všetko je vybavené alebo odložené na neskôr.',
                  `<button class="btn btn-primary" onclick="Tsk.form()">${Icon('plus')} Nová úloha</button>`)))
        + (c.snoozed && f === 'open' ? `<div class="regimebox" style="margin-top:14px;">
            ${c.snoozed} ${DanubraTasks.plural(c.snoozed, 'úloha je odložená', 'úlohy sú odložené', 'úloh je odložených')}
            na neskôr. Vrátia sa samy, keď dôjde ich deň — odloženie nie je zmazanie.</div>` : '');
    },

    exportCsv() {
      Shell.exportCsv(this.rows(), [
        ['Úloha', t => t.title],
        ['Podrobnosti', t => t.description],
        ['Termín', t => t.due_date],
        ['Stav', t => (STATUS.find(x => x[0] === t.status) || [])[1] || t.status],
        ['Priorita', t => (PRIO.find(x => x[0] === t.priority) || [])[1] || t.priority],
        ['Kto', t => t.assigned_name],
        ['Čoho sa týka', t => t.entity_label],
        ['Odkiaľ', t => (t.source === 'cron' ? 'automat' : 'ručne')],
      ], ['ulohy']);
    },

    /** Kto som ja. Meno si človek vyberie raz, drží sa v prehliadači. */
    _meKey: 'danubra_task_me',
    me() { try { return localStorage.getItem(this._meKey) || ''; } catch { return ''; } },
    setMe(v) {
      try { v ? localStorage.setItem(this._meKey, v) : localStorage.removeItem(this._meKey); } catch {}
      Danubra.renderRoute();
    },

    /**
     * Kto čo má na starosti. Toto je odpoveď na otázku, ktorú zoznam sám
     * o sebe nedá: či na niekom visí všetko a na inom nič — a či niečo
     * nevisí na nikom.
     */
    peopleStrip() {
      const rows = DanubraTasks.byPerson(this.items);
      if (!rows.length) return '';
      const me = this.me();
      const names = DanubraTasks.people(this.items);
      const card = (r) => {
        const nikto = r.name === DanubraTasks.UNASSIGNED;
        const on = this.filters.who === r.name;
        return `<button class="who-card${on ? ' on' : ''}${nikto ? ' who-none' : ''}${
            !nikto && r.name === me ? ' who-me' : ''}"
            onclick="Tsk.setWho('${nikto ? DanubraTasks.UNASSIGNED : UI.esc(r.name)}')">
          <span class="who-name">${nikto ? 'Nepriradené' : UI.esc(r.name)}${
            !nikto && r.name === me ? ' <em>ja</em>' : ''}</span>
          <span class="who-total">${r.total}</span>
          <span class="who-split">
            ${r.overdue ? `<i class="w-late">${r.overdue} po termíne</i>` : ''}
            ${r.today ? `<i class="w-today">${r.today} dnes</i>` : ''}
            ${r.week ? `<i>${r.week} tento týždeň</i>` : ''}
            ${!r.overdue && !r.today && !r.week ? `<i>${r.later} neskôr</i>` : ''}
          </span>
        </button>`;
      };
      return `<div class="who-strip">
        ${rows.map(card).join('')}
        ${this.filters.who ? `<button class="who-card who-clear" onclick="Tsk.setWho('')">
          ${Icon('x', 14)}<span>Zrušiť</span></button>` : ''}
        <label class="who-me-pick">
          <span>Ja som</span>
          <select onchange="Tsk.setMe(this.value)">
            <option value="">— vyber —</option>
            ${names.map(n => `<option value="${UI.esc(n)}"${n === me ? ' selected' : ''}>${UI.esc(n)}</option>`).join('')}
          </select>
        </label>
      </div>`;
    },

    setWho(v) { this.filters.who = this.filters.who === v ? '' : v; Danubra.renderRoute(); },
    setQ(v) { this.filters.q = v; Danubra.renderRoute(); },

    /** Úlohy po filtroch — zoznam aj počty berú to isté. */
    rows() {
      const f = this.filters;
      let rows = f.status === 'all' ? this.items
        : f.status === 'open' ? this.items.filter(t => DanubraTasks.isActive(t))
        : this.items.filter(t => t.status === f.status);
      if (f.who) rows = rows.filter(t => DanubraTasks.isFor(t, f.who));
      return Shell.filterRows(rows, {
        q: f.q, fields: ['title', 'description', 'entity_label', 'assigned_name'],
      });
    },

    pills(f) {
      return `<div class="pillbar" style="margin-bottom:14px;width:max-content;">
        <button class="pill${f === 'open' ? ' active' : ''}" onclick="Tsk.setF('open')">Čo treba spraviť</button>
        ${STATUS.map(s => `<button class="pill${f === s[0] ? ' active' : ''}" onclick="Tsk.setF('${s[0]}')">${s[1]}</button>`).join('')}
        <button class="pill${f === 'all' ? ' active' : ''}" onclick="Tsk.setF('all')">Všetky</button>
      </div>`;
    },

    // ── Pravidlá ──────────────────────────────────────────────────────────
    // v1 mala tieto pravidlá zadrôtované v crone. Tu sú to riadky, takže je
    // vidieť, čo appka sleduje, a dá sa to vypnúť bez nasadenia.
    rulesView() {
      const row = (r) => {
        const d = DanubraTasks.describeRule(r);
        const mine = this.items.filter(t => t.rule_id === r.id && t.status !== 'done').length;
        return `<div class="list-row" style="cursor:default;align-items:flex-start;">
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
        </div>`;
      };

      const body = `
        <div class="regimebox" style="margin:0 0 12px;">
          Úlohy nevznikajú náhodne — každá má pravidlo, ktoré ju vytvorilo.
          Pravidlo sa dá vypnúť a prestane úlohy robiť; tie, čo už vznikli,
          zostanú. Nové pravidlá pribúdajú ako riadky, nie ako nová verzia
          aplikácie.</div>
        ${this.rules.length ? this.rules.map(row).join('')
          : '<div style="color:var(--ink-mute);font-size:13px;">Zatiaľ žiadne pravidlá.</div>'}
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          <button class="btn btn-outline btn-sm" onclick="Tsk.runRules()">
            ${Icon('repeat', 14)} Spustiť teraz</button>
        </div>`;
      UI.modal('Pravidlá, z ktorých vznikajú úlohy', body, { wide: true });
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

    /** Iniciály do krúžku. Meno vedľa mena sa v zozname prehliadne. */
    who(name) {
      const n = (name || '').trim();
      if (!n) return `<span class="t-who t-who-none" title="Nemá to nikto na starosti">
        ${Icon('user', 13)}</span>`;
      const ini = n.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
      return `<span class="t-who" title="${UI.esc(n)}">${UI.esc(ini)}</span>`;
    },

    /**
     * Riadok úlohy. Klepnutie otvorí detail — doteraz sa dalo len odškrtnúť
     * alebo upraviť vo formulári a to, čo sa s úlohou dialo, nebolo nikde.
     */
    row(t) {
      const late = this.isLate(t);
      const done = t.status === 'done';
      const ent = t.entity_type ? ENTITY[t.entity_type] : null;
      return `
        <div class="list-row task-row${done ? ' is-done' : ''}" onclick="Tsk.detail('${t.id}')">
          <button class="t-check${done ? ' on' : ''}" onclick="event.stopPropagation();Tsk.toggle('${t.id}')"
            title="${done ? 'Označiť ako otvorenú' : 'Označiť ako hotovú'}"
            aria-label="${done ? 'Označiť ako otvorenú' : 'Označiť ako hotovú'}">${Icon('check', 15)}</button>
          <span class="t-main">
            <span class="t-title">${UI.esc(t.title)}</span>
            <span class="t-meta">
              <em class="${late ? 't-late' : ''}">${t.due_date
                ? (late ? `po termíne · ${UI.date(t.due_date)}` : UI.date(t.due_date))
                : 'bez termínu'}</em>
              ${t.priority === 'high' ? '<em class="t-high">vysoká</em>' : ''}
              ${t.source === 'cron' ? '<em class="t-auto">automat</em>' : ''}
              ${ent && t.entity_label ? `<em>${UI.esc(ent[0])}: ${UI.esc(t.entity_label)}</em>` : ''}
            </span>
          </span>
          ${this.who(t.assigned_name)}
          <span class="ico t-chev">${Icon('chevron', 15)}</span>
        </div>`;
    },

    /**
     * Detail úlohy. Na jednom mieste: čo to je, koho sa to týka, kto to má
     * a čo sa s tým dá spraviť — bez otvárania formulára.
     */
    detail(id) {
      const t = this.items.find(x => x.id === id);
      if (!t) return UI.toast('Nenájdené', 'err');
      const ent = t.entity_type ? ENTITY[t.entity_type] : null;
      const late = this.isLate(t);
      const names = DanubraTasks.people(this.items);
      const rule = t.rule_id ? this.rules.find(r => r.id === t.rule_id) : null;

      const fact = (k, v) => (v ? `<div class="dt-fact"><span>${k}</span><b>${v}</b></div>` : '');

      UI.modal(t.title, `
        <div class="detail-head">
          ${this.badge(t.status)}
          ${t.priority === 'high' ? UI.badge('vysoká priorita', 'red') : ''}
          ${late ? UI.badge('po termíne', 'red') : ''}
          ${t.source === 'cron' ? UI.badge('z pravidla', 'blue') : ''}
        </div>

        ${t.description ? `<p class="t-desc">${UI.esc(t.description)}</p>` : ''}

        <div class="kv" style="margin:12px 0;">
          ${fact('Termín', t.due_date ? UI.date(t.due_date) : 'bez termínu')}
          ${fact('Má na starosti', t.assigned_name || 'nikto')}
          ${fact('Založené', t.created_at ? UI.date(t.created_at) : '')}
          ${fact('Hotové', t.done_at ? UI.date(t.done_at) : '')}
        </div>

        ${ent ? `<div class="form-section">Čoho sa to týka</div>
          ${Danubra.canOpen(t.entity_type, t.entity_id)
            ? `<span class="link-row">${Danubra.link(t.entity_type, t.entity_id,
                t.entity_label || ent[0])}</span>`
            : `<p class="card-note">${UI.esc(ent[0])}: ${UI.esc(t.entity_label || '—')}
               — táto obrazovka je vypnutá, takže sa tam odtiaľto nedá prejsť.</p>`}` : ''}

        ${rule ? `<div class="form-section">Odkiaľ sa vzala</div>
          <p class="card-note">${UI.esc(DanubraTasks.describeRule(rule))}</p>` : ''}

        <div class="form-section">Kto to má na starosti</div>
        <div class="t-assign">
          <select onchange="Tsk.assign('${t.id}', this.value)">
            <option value="">— nikto —</option>
            ${names.map(n => `<option value="${UI.esc(n)}"${n === t.assigned_name ? ' selected' : ''}>${UI.esc(n)}</option>`).join('')}
          </select>
          <button class="btn btn-ghost btn-sm" onclick="Tsk.assignNew('${t.id}')">
            ${Icon('plus', 13)} Iné meno</button>
          ${this.me() && this.me() !== t.assigned_name
            ? `<button class="btn btn-outline btn-sm" onclick="Tsk.assign('${t.id}','${UI.esc(this.me())}')">
                 Beriem si to</button>` : ''}
        </div>

        <div class="modal-actions">
          <button class="btn btn-ghost btn-sm" onclick="Tsk.snooze('${t.id}')">
            ${Icon('clock', 14)} Odložiť o týždeň</button>
          <button class="btn btn-outline" onclick="Tsk.form('${t.id}')">
            ${Icon('edit', 14)} Upraviť</button>
          <button class="btn btn-primary" onclick="Tsk.toggle('${t.id}');UI.closeModal()">
            ${Icon('check', 14)} ${t.status === 'done' ? 'Vrátiť medzi otvorené' : 'Hotovo'}</button>
        </div>`, { wide: true });
    },

    async assign(id, name) {
      const { error } = await DB.update('tasks', id, { assigned_name: name || null });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const t = this.items.find(x => x.id === id);
      if (t) t.assigned_name = name || null;
      UI.toast(name ? `Má na starosti ${name}` : 'Úloha je bez mena', 'ok');
      Danubra.renderRoute();
      this.detail(id);
    },

    assignNew(id) {
      const name = prompt('Kto to má na starosti?');
      if (name == null || !name.trim()) return;
      this.assign(id, name.trim());
    },

    /**
     * Odloženie nie je zmazanie — úloha sa vráti sama, keď dôjde jej deň.
     * Preto sa posúva termín a nie stav.
     */
    async snooze(id) {
      const t = this.items.find(x => x.id === id);
      if (!t) return;
      const base = t.due_date && t.due_date > this.today() ? t.due_date : this.today();
      const due = DanubraTasks.addDays(base, 7);
      const { error } = await DB.update('tasks', id, { due_date: due });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      t.due_date = due;
      UI.closeModal();
      UI.toast(`Odložené na ${UI.date(due)}`, 'ok');
      Danubra.renderRoute();
    },

    setF(v) { this.filters.status = v; Danubra.renderRoute(); },

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

    form(id) {
      const t = id ? this.items.find(x => x.id === id) || {} : {};
      const body = `
        <form id="tsk-form" onsubmit="event.preventDefault();Tsk.save('${id || ''}')">
          ${UI.field('title', 'Čo treba spraviť', { value: t.title, required: true })}
          ${UI.field('description', 'Podrobnosti', { type: 'textarea', rows: 2, value: t.description })}
          <div class="form-grid">
            ${UI.field('due_date', 'Termín', { type: 'date', value: t.due_date })}
            ${UI.field('priority', 'Priorita', { value: t.priority || 'normal', options: PRIO.map(p => [p[0], p[1]]) })}
            ${UI.field('status', 'Stav', { value: t.status || 'open', options: STATUS.map(s => [s[0], s[1]]) })}
            ${UI.field('assigned_name', 'Rieši', { value: t.assigned_name, placeholder: 'Štefan / Michaela' })}
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Pridať'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť úlohu' : 'Nová úloha', body);
    },

    async save(id) {
      const d = UI.formData(document.getElementById('tsk-form'));
      if (!d.title) return UI.toast('Napíš, čo treba spraviť', 'err');
      const payload = { ...d };
      if (payload.due_date === '') payload.due_date = null;
      if (payload.status === 'done') payload.done_at = new Date().toISOString();
      const res = id ? await DB.update('tasks', id, payload) : await DB.insert('tasks', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast(id ? 'Uložené' : 'Pridané', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    async toggle(id) {
      const t = this.items.find(x => x.id === id);
      if (!t) return;
      const done = t.status === 'done';
      const patch = { status: done ? 'open' : 'done', done_at: done ? null : new Date().toISOString() };
      await DB.update('tasks', id, patch);
      Object.assign(t, patch);
      Danubra.renderRoute();
    },

    async del(id) {
      if (!confirm('Zmazať túto úlohu?')) return;
      await DB.remove('tasks', id);
      this.items = this.items.filter(x => x.id !== id);
      Danubra.renderRoute();
    },
  };

  window.Tsk = Tsk;
  Danubra.views.tasks = function (el) { return Tsk.view(el); };
})();
