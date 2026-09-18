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
    items: [], loaded: false, filters: { status: 'open' },

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
      if (f !== 'open') {
        // Filtrovaný pohľad zostáva plochý — človek tam už niečo hľadá.
        const rows = f === 'all' ? this.items : this.items.filter(t => t.status === f);
        el.innerHTML = Danubra.header('Úlohy a pripomienky', 'Čo treba spraviť')
          + banner + this.pills(f)
          + `<div class="count-line">${rows.length} ZÁZNAMOV</div>`
          + (rows.length ? rows.map(t => this.row(t)).join('')
            : UI.empty('tasks', 'Nič tu nie je', 'Skús iný filter.'));
        return;
      }

      const groups = DanubraTasks.group(this.items);
      el.innerHTML = Danubra.header('Úlohy a pripomienky', 'Čo treba spraviť')
        + banner + this.pills(f)
        + (groups.length
          ? groups.map(g => `
              <div class="form-section">${UI.esc(g.label)}
                <span style="float:right;font-family:inherit;letter-spacing:0;text-transform:none;
                  color:var(--${g.tone === 'red' ? 'red' : g.tone === 'amber' ? 'amber' : 'ink-mute'});">
                  ${g.tasks.length}</span></div>
              ${g.tasks.map(t => this.row(t)).join('')}`).join('')
          : UI.empty('check', 'Nič nehorí',
              'Všetko je vybavené alebo odložené na neskôr.',
              `<button class="btn btn-primary" onclick="Tsk.form()">${Icon('plus')} Nová úloha</button>`))
        + (c.snoozed ? `<div class="regimebox" style="margin-top:14px;">
            ${c.snoozed} ${DanubraTasks.plural(c.snoozed, 'úloha je odložená', 'úlohy sú odložené', 'úloh je odložených')}
            na neskôr. Vrátia sa samy, keď dôjde ich deň — odloženie nie je zmazanie.</div>` : '');
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

    row(t) {
      const late = this.isLate(t);
      const done = t.status === 'done';
      const ent = t.entity_type ? ENTITY[t.entity_type] : null;
      const prio = PRIO.find(p => p[0] === t.priority);
      return `
        <div class="list-row" style="align-items:flex-start;cursor:default;">
          <button class="btn btn-ghost btn-sm" style="padding:2px 4px;color:${done ? 'var(--green)' : 'var(--ink-mute)'};"
            onclick="Tsk.toggle('${t.id}')" title="${done ? 'Označiť ako otvorenú' : 'Označiť ako hotovú'}">${Icon('check', 17)}</button>
          <span style="flex:1;font-size:13px;">
            <strong style="${done ? 'text-decoration:line-through;opacity:.55;' : ''}">${UI.esc(t.title)}</strong>
            ${t.priority === 'high' ? UI.badge('vysoká', 'red') : ''}
            ${late ? UI.badge('po termíne', 'red') : ''}
            ${t.source === 'cron' ? UI.badge('automat', 'blue') : ''}
            ${t.description ? `<span style="display:block;color:var(--ink-sub);">${UI.esc(t.description)}</span>` : ''}
            <span style="display:block;color:var(--ink-mute);font-size:12px;">
              ${t.due_date ? `termín ${UI.date(t.due_date)}` : 'bez termínu'}
              ${t.assigned_name ? ` · ${UI.esc(t.assigned_name)}` : ''}
              ${ent ? ` · ${ent[0]}${t.entity_label ? `: ${UI.esc(t.entity_label)}` : ''}` : ''}</span>
          </span>
          ${ent && t.entity_id ? `<button class="btn btn-ghost btn-sm" title="Otvoriť"
            onclick="Tsk.openEntity('${t.entity_type}','${t.entity_id}')">${Icon('chevron', 15)}</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="Tsk.form('${t.id}')">${Icon('edit', 15)}</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="Tsk.del('${t.id}')">${Icon('x', 15)}</button>
        </div>`;
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
