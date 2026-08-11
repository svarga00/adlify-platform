// ============================================================================
// DANUBRA — Úlohy a pripomienky
// ============================================================================
(function () {
  const STATUS = [['open', 'Otvorená', 'amber'], ['in_progress', 'Rozpracovaná', 'blue'],
    ['done', 'Hotová', 'green'], ['cancelled', 'Zrušená', 'gray']];
  const PRIO = [['high', 'Vysoká', 'red'], ['normal', 'Bežná', 'gray'], ['low', 'Nízka', 'gray']];
  const ENTITY = {
    inquiry: ['Dopyt', 'inquiries'], order: ['Objednávka', 'orders'],
    subcontract: ['Zákazka', 'subcontracts'], worker: ['Pracovník', 'workers'],
    client: ['Klient', 'clients'], partner: ['Odberateľ', 'partners'], invoice: ['Faktúra', 'invoices'],
  };

  const Tsk = {
    items: [], loaded: false, filters: { status: 'open' },

    async load() {
      const { data } = await DB.list('tasks', { order: { column: 'due_date' }, limit: 500 });
      this.items = data || [];
      this.loaded = true;
    },

    badge(s) { const m = STATUS.find(x => x[0] === s) || STATUS[0]; return UI.badge(m[1], m[2]); },
    today() { return new Date().toISOString().slice(0, 10); },
    isLate(t) { return t.status !== 'done' && t.status !== 'cancelled' && t.due_date && t.due_date < this.today(); },

    async view(el) {
      Danubra.setActions(`<button class="btn btn-primary btn-sm" onclick="Tsk.form()">${Icon('plus')} Nová úloha</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }

      const f = this.filters.status;
      const rows = f === 'all' ? this.items
        : f === 'open' ? this.items.filter(t => ['open', 'in_progress'].includes(t.status))
        : this.items.filter(t => t.status === f);
      const late = this.items.filter(t => this.isLate(t));
      const todayTasks = this.items.filter(t => t.due_date === this.today() && t.status !== 'done');

      el.innerHTML = Danubra.header('Úlohy a pripomienky',
        `${this.items.filter(t => ['open', 'in_progress'].includes(t.status)).length} otvorených`
        + (todayTasks.length ? ` · ${todayTasks.length} na dnes` : '')) +
        (late.length ? `<div class="warnbox" style="margin-bottom:14px;">
          ${Icon('alert', 14)} ${late.length} ${late.length === 1 ? 'úloha je' : 'úloh je'} po termíne.</div>` : '') + `
        <div class="pillbar" style="margin-bottom:14px;width:max-content;">
          <button class="pill${f === 'open' ? ' active' : ''}" onclick="Tsk.setF('open')">Otvorené</button>
          ${STATUS.map(s => `<button class="pill${f === s[0] ? ' active' : ''}" onclick="Tsk.setF('${s[0]}')">${s[1]}</button>`).join('')}
          <button class="pill${f === 'all' ? ' active' : ''}" onclick="Tsk.setF('all')">Všetky</button>
        </div>
        <div class="count-line">${rows.length} ZÁZNAMOV</div>
        ${rows.length === 0
          ? UI.empty('tasks', 'Žiadne úlohy', 'Pridaj úlohu alebo pripomienku.',
              `<button class="btn btn-primary" onclick="Tsk.form()">${Icon('plus')} Nová úloha</button>`)
          : rows.map(t => this.row(t)).join('')}`;
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

    openEntity(type, id) {
      const map = { inquiry: ['inquiries', 'Inq'], order: ['orders', 'Ord'], subcontract: ['subcontracts', 'Sub'],
        worker: ['workers', 'Wrk'], client: ['clients', 'Cli'], partner: ['partners', 'Prt'], invoice: ['invoices', 'Inv'] };
      const m = map[type];
      if (!m) return;
      Danubra.go(m[0]);
      setTimeout(() => {
        const mod = window[m[1]];
        if (mod?.detail) mod.detail(id);
        else if (mod?.spis) mod.spis(id);
      }, 400);
    },

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
  Danubra.views.tasks = function (el) { Tsk.view(el); };
})();
