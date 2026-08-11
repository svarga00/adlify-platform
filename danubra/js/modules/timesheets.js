// ============================================================================
// DANUBRA — Evidencia odpracovaných hodín (Fáza 2)
// ============================================================================
// Oddelená evidencia dielňa vs. stavba je nutná pre pravidlo >50 % (SOKA-BAU)
// a pre dokumentáciu pracovného času podľa §19 AEntG — najneskôr do 7. dňa
// po výkone práce, v nemčine na požiadanie Finanzkontrolle Schwarzarbeit.
// ============================================================================
(function () {
  const ACTIVITY = [
    ['construction', 'Stavba', 'amber'],
    ['workshop', 'Dielňa', 'blue'],
    ['travel', 'Cesta', 'gray'],
  ];

  const Tms = {
    items: [], assignments: [], workers: [], subcontracts: [], loaded: false,
    filters: { month: '', worker_id: '', subcontract_id: '' },

    async load() {
      const [t, a, w, s] = await Promise.all([
        DB.list('timesheets', { order: { column: 'work_date', ascending: false }, limit: 2000 }),
        DB.list('assignments', { limit: 1000 }),
        DB.list('workers', { select: 'id,full_name,profession,skill_level,gross_monthly', limit: 500 }),
        DB.list('subcontracts', { select: 'id,title,work_type,charge_rate,partner_id,contract_number', limit: 500 }),
      ]);
      this.items = t.data || []; this.assignments = a.data || [];
      this.workers = w.data || []; this.subcontracts = s.data || [];
      this.loaded = true;
      if (!this.filters.month) this.filters.month = new Date().toISOString().slice(0, 7);
    },

    workerOf(id) { return this.workers.find(w => w.id === id); },
    asgOf(id) { return this.assignments.find(a => a.id === id); },
    subOf(id) { return this.subcontracts.find(s => s.id === id); },
    actMeta(a) { return ACTIVITY.find(x => x[0] === a) || ACTIVITY[0]; },

    filtered() {
      const f = this.filters;
      return this.items.filter(t => {
        if (f.month && !String(t.work_date).startsWith(f.month)) return false;
        if (f.worker_id && t.worker_id !== f.worker_id) return false;
        if (f.subcontract_id) {
          const a = this.asgOf(t.assignment_id);
          if (!a || a.subcontract_id !== f.subcontract_id) return false;
        }
        return true;
      });
    },

    async view(el) {
      Danubra.setActions(`<button class="btn btn-primary btn-sm" onclick="Tms.form()">${Icon('plus')} Zapísať hodiny</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const rows = this.filtered();
      const share = DanubraMargin.constructionShare(rows);
      const totalHours = rows.reduce((s, t) => s + Number(t.hours || 0), 0);
      const unapproved = rows.filter(t => !t.approved).length;

      // hodiny staršie ako 7 dní bez zápisu sú riziko podľa §19 AEntG
      const today = new Date();
      const late = rows.filter(t => {
        const d = new Date(t.work_date);
        return !t.approved && (today - d) / 86400000 > 7;
      }).length;

      el.innerHTML = Danubra.header('Odpracované hodiny',
        `${Math.round(totalHours)} h za ${this.filters.month || 'obdobie'} · ${unapproved} nepotvrdených`) +
        (late ? `<div class="warnbox" style="margin-bottom:14px;">
          ${Icon('alert', 14)} ${late} ${late === 1 ? 'záznam je' : 'záznamov je'} starších ako 7 dní bez potvrdenia —
          dokumentácia pracovného času sa podľa §19 AEntG vedie do 7 dní po výkone práce.</div>` : '') + `

        <div class="kpi-grid" style="margin-bottom:16px;">
          <div class="kpi"><div class="kpi-label">Hodiny spolu</div>
            <div class="kpi-value">${Math.round(totalHours)}</div>
            <div class="kpi-delta">za vybrané obdobie</div></div>
          <div class="kpi"><div class="kpi-label">Stavba</div>
            <div class="kpi-value" style="color:var(--amber);">${Math.round(share.constructionHours)}</div>
            <div class="kpi-delta">${share.pct} % z produktívnych</div></div>
          <div class="kpi"><div class="kpi-label">Dielňa</div>
            <div class="kpi-value" style="color:var(--blue);">${Math.round(share.totalHours - share.constructionHours)}</div>
            <div class="kpi-delta">bez SOKA-BAU</div></div>
          <div class="kpi"><div class="kpi-label">SOKA-BAU</div>
            <div class="kpi-value" style="color:${share.sokaRequired ? 'var(--red)' : 'var(--green)'};">${share.sokaRequired ? 'Áno' : 'Nie'}</div>
            <div class="kpi-delta">${share.sokaRequired ? 'stavba nad 50 %' : 'pod hranicou 50 %'}</div></div>
        </div>

        <div class="filterbar">
          <input type="month" value="${UI.esc(this.filters.month)}" onchange="Tms.setF('month',this.value)">
          <select onchange="Tms.setF('worker_id',this.value)">
            <option value="">Všetci pracovníci</option>
            ${this.workers.map(w => `<option value="${w.id}" ${this.filters.worker_id === w.id ? 'selected' : ''}>${UI.esc(w.full_name)}</option>`).join('')}
          </select>
          <select onchange="Tms.setF('subcontract_id',this.value)">
            <option value="">Všetky zákazky</option>
            ${this.subcontracts.map(s => `<option value="${s.id}" ${this.filters.subcontract_id === s.id ? 'selected' : ''}>${UI.esc(s.title)}</option>`).join('')}
          </select>
        </div>
        <div class="count-line">${rows.length} ZÁZNAMOV</div>
        ${rows.length === 0
          ? UI.empty('clock', 'Žiadne hodiny', 'Zapíš odpracované hodiny pre vybrané obdobie.',
              `<button class="btn btn-primary" onclick="Tms.form()">${Icon('plus')} Zapísať hodiny</button>`)
          : rows.map(t => this.row(t)).join('')}`;
    },

    row(t) {
      const w = this.workerOf(t.worker_id);
      const a = this.asgOf(t.assignment_id);
      const sc = a ? this.subOf(a.subcontract_id) : null;
      const m = this.actMeta(t.activity_type);
      return `
        <div class="list-row" style="cursor:default;">
          <span class="dot ${m[2] === 'amber' ? 'amber' : m[2] === 'blue' ? '' : ''}"
            style="${m[2] === 'blue' ? 'background:var(--blue);' : ''}"></span>
          <span style="flex:1;font-size:13px;">
            <strong>${UI.esc(w?.full_name || '—')}</strong>
            <span style="color:var(--ink-mute);"> · ${UI.date(t.work_date)}</span>
            <span style="color:var(--ink-mute);display:block;font-size:12px;">
              ${m[1]}${sc ? ` · ${UI.esc(sc.title)}` : ''}${t.description ? ` · ${UI.esc(t.description)}` : ''}</span>
          </span>
          <strong style="font-variant-numeric:tabular-nums;">${Number(t.hours).toLocaleString('sk-SK')} h</strong>
          <button class="btn btn-ghost btn-sm" onclick="Tms.toggleApprove('${t.id}')"
            title="${t.approved ? 'Potvrdené' : 'Potvrdiť'}"
            style="color:${t.approved ? 'var(--green)' : 'var(--ink-mute)'};">${Icon('check', 15)}</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="Tms.del('${t.id}')">${Icon('x', 15)}</button>
        </div>`;
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    form() {
      const active = this.assignments.filter(a => a.status !== 'cancelled');
      if (!active.length) return UI.toast('Najprv nasaď pracovníka na zákazku', 'err');
      const today = new Date().toISOString().slice(0, 10);
      const body = `
        <form id="tms-form" onsubmit="event.preventDefault();Tms.save()">
          <div class="form-grid">
            ${UI.field('assignment_id', 'Nasadenie', { required: true, options: active.map(a => {
              const w = this.workerOf(a.worker_id); const s = this.subOf(a.subcontract_id);
              return [a.id, `${w?.full_name || '—'} · ${s?.title || '—'}`];
            }) })}
            ${UI.field('work_date', 'Dátum', { type: 'date', value: today, required: true })}
            ${UI.field('hours', 'Hodiny', { type: 'number', value: 8, required: true })}
            ${UI.field('activity_type', 'Činnosť', { value: 'construction', options: ACTIVITY.map(a => [a[0], a[1]]) })}
          </div>
          ${UI.field('description', 'Popis práce', { type: 'textarea', rows: 2,
            placeholder: 'Čo sa reálne robilo — slúži aj ako doklad o výkone diela' })}
          <div class="regimebox">Cesta sa nezapočítava do pomeru stavba/dielňa,
          ale eviduje sa kvôli úplnosti dokumentácie pracovného času.</div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">Zapísať</button>
          </div>
        </form>`;
      UI.modal('Zápis hodín', body, { wide: true });
    },

    async save() {
      const d = UI.formData(document.getElementById('tms-form'));
      const a = this.asgOf(d.assignment_id);
      if (!a) return UI.toast('Vyber nasadenie', 'err');
      const payload = {
        assignment_id: d.assignment_id, worker_id: a.worker_id,
        work_date: d.work_date, hours: Number(d.hours),
        activity_type: d.activity_type, description: d.description || null,
      };
      if (!payload.hours || payload.hours <= 0) return UI.toast('Zadaj počet hodín', 'err');
      const { error } = await DB.insert('timesheets', payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal(); UI.toast('Hodiny zapísané', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    async toggleApprove(id) {
      const t = this.items.find(x => x.id === id);
      if (!t) return;
      const on = !t.approved;
      await DB.update('timesheets', id, { approved: on, approved_at: on ? new Date().toISOString() : null });
      t.approved = on;
      Danubra.renderRoute();
    },

    async del(id) {
      if (!confirm('Zmazať tento záznam?')) return;
      await DB.remove('timesheets', id);
      this.items = this.items.filter(x => x.id !== id);
      Danubra.renderRoute();
    },
  };

  window.Tms = Tms;
  Danubra.views.timesheets = function (el) { Tms.view(el); };
})();
