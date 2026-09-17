// ============================================================================
// DANUBRA — Zákazky / Werkvertrag (Fáza 2) s compliance kontrolou
// ============================================================================
// Bez splnených blokátorov (A1, Zoll, SOKA, USt-IdNr) sa nesmie začať.
// Panel compliance je hlavná časť detailu — podľa biznis plánu je to
// najrizikovejšia oblasť celej vetvy.
// ============================================================================
(function () {
  const STATUS = [
    ['draft', 'Príprava', 'gray'], ['negotiation', 'Rokovanie', 'amber'],
    ['won', 'Získaná', 'blue'], ['active', 'Prebieha', 'green'],
    ['completed', 'Ukončená', 'gray'], ['lost', 'Prehratá', 'red'], ['cancelled', 'Zrušená', 'red'],
  ];
  const WORK_TYPE = [
    ['workshop', 'Dielňa / kovoobrábanie'],
    ['construction', 'Stavebné práce'],
  ];
  const BILLING = [['hourly', 'Po hodinách'], ['unit', 'Za jednotku'], ['fixed', 'Pevná cena']];

  const Sub = {
    items: [], partners: [], assignments: [], workers: [], workerDocs: [], compliance: [], timesheets: [], checklist: [], lodging: [], accommodations: [],
    periods: [], crews: [],
    loaded: false, filters: { status: '', work_type: '' },
    _cur: null,

    async load() {
      const [s, p, a, w, wd, c] = await Promise.all([
        DB.list('subcontracts', { order: { column: 'created_at', ascending: false }, limit: 500 }),
        DB.list('partners', { limit: 300 }),
        DB.list('assignments', { limit: 1000 }),
        DB.list('workers', { select: 'id,full_name,profession,skill_level,phone,gross_monthly,per_diem_daily,status,legal_form,hourly_cost,regulated_trade', limit: 500 }),
        DB.list('worker_documents', { limit: 2000 }),
        DB.list('compliance', { limit: 500 }),
      ]);
      this.items = s.data || []; this.partners = p.data || []; this.assignments = a.data || [];
      this.workers = w.data || []; this.workerDocs = wd.data || []; this.compliance = c.data || [];
      const [ch, sa, accs, per, ts, cr] = await Promise.all([
        DB.list('checklist_items', { order: { column: 'step_order' }, limit: 3000 }),
        DB.list('subcontract_accommodations', { limit: 1000 }),
        DB.list('accommodations', { select: 'id,name,city,address,max_persons,price_month,lat,lng', limit: 500 }),
        DB.list('periods', { order: { column: 'period_from', ascending: false }, limit: 500 }),
        DB.list('timesheets', { limit: 5000 }),
        DB.list('crews', { select: 'id,name,status,trade_key', limit: 300 }),
      ]);
      this.checklist = ch.data || [];
      this.lodging = sa.data || [];
      this.accommodations = accs.data || [];
      this.periods = per.data || [];
      this.timesheets = ts.data || [];
      this.crews = cr.data || [];
      this.loaded = true;
    },

    periodsOf(scId) { return this.periods.filter(p => p.subcontract_id === scId); },
    /** Výkazy zákazky — cez nasadenia, lebo výkaz zákazku priamo nepozná. */
    timesheetsOf(scId) {
      const ids = new Set(this.asgOf(scId).map(a => a.id));
      return this.timesheets.filter(t => ids.has(t.assignment_id));
    },

    partnerOf(id) { return this.partners.find(p => p.id === id); },
    workerOf(id) { return this.workers.find(w => w.id === id); },
    asgOf(scId) { return this.assignments.filter(a => a.subcontract_id === scId); },
    companyItems() { return this.compliance.filter(c => c.scope === 'company'); },
    badge(s) { const m = STATUS.find(x => x[0] === s) || STATUS[0]; return UI.badge(m[1], m[2]); },
    typeLabel(t) { const x = WORK_TYPE.find(y => y[0] === t); return x ? x[1] : t; },

    /** Compliance výsledok pre zákazku. */
    check(sc) {
      return DanubraCompliance.checkSubcontract({
        subcontract: sc,
        assignments: this.asgOf(sc.id),
        workers: this.workers,
        workerDocs: this.workerDocs,
        companyItems: this.companyItems(),
        settings: this._settings,
        monthlyHours: 160,
      });
    },

    async view(el) {
      Danubra.setActions(`<button class="btn btn-primary btn-sm" onclick="Sub.form()">${Icon('plus')} Nová zákazka</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      let rows = this.items;
      if (this.filters.status) rows = rows.filter(x => x.status === this.filters.status);
      if (this.filters.work_type) rows = rows.filter(x => x.work_type === this.filters.work_type);

      const active = this.items.filter(x => x.status === 'active');
      const blocked = active.filter(x => !this.check(x).ok).length;
      const deployed = this.assignments.filter(a => a.status === 'active').length;

      el.innerHTML = Danubra.header('Zákazky',
        `${this.items.length} celkom · ${active.length} prebieha · ${deployed} ľudí nasadených`) +
        (blocked ? `<div class="warnbox" style="margin-bottom:14px;">
          ${Icon('alert', 14)} ${blocked} ${blocked === 1 ? 'prebiehajúca zákazka nespĺňa' : 'prebiehajúcich zákaziek nespĺňa'}
          podmienky vyslania — otvor detail a doplň chýbajúce doklady.</div>` : '') + `
        <div class="pillbar" style="margin-bottom:10px;width:max-content;max-width:100%;overflow-x:auto;">
          <button class="pill${!this.filters.status ? ' active' : ''}" onclick="Sub.setF('status','')">Všetky</button>
          ${STATUS.map(s => {
            const n = this.items.filter(x => x.status === s[0]).length;
            return n ? `<button class="pill${this.filters.status === s[0] ? ' active' : ''}" onclick="Sub.setF('status','${s[0]}')">${s[1]} ${n}</button>` : '';
          }).join('')}
        </div>
        <div class="pillbar" style="margin-bottom:14px;width:max-content;max-width:100%;">
          <button class="pill${!this.filters.work_type ? ' active' : ''}" onclick="Sub.setF('work_type','')">Oboje</button>
          ${WORK_TYPE.map(t => `<button class="pill${this.filters.work_type === t[0] ? ' active' : ''}" onclick="Sub.setF('work_type','${t[0]}')">${t[1]}</button>`).join('')}
        </div>
        <div class="count-line">${rows.length} ZÁZNAMOV</div>
        ${rows.length === 0
          ? UI.empty('site', 'Žiadne zákazky', 'Začni dielenskou zákazkou — má najnižšiu reguláciu.',
              `<button class="btn btn-primary" onclick="Sub.form()">${Icon('plus')} Nová zákazka</button>`)
          : `<div class="cards">${rows.map(x => this.card(x)).join('')}</div>`}`;
    },

    card(sc) {
      const p = this.partnerOf(sc.partner_id);
      const asg = this.asgOf(sc.id).filter(a => a.status !== 'cancelled');
      const chk = this.check(sc);
      return `
        <div class="acc-card card" onclick="Sub.detail('${sc.id}')">
          <div class="acc-card-head">
            <div>
              <div class="acc-name">${UI.esc(sc.title)}</div>
              <div class="acc-loc">${p ? UI.esc(p.name) : '—'}${sc.site_city ? ` · ${UI.esc(sc.site_city)}` : ''}</div>
            </div>
            ${this.badge(sc.status)}
          </div>
          <div class="acc-meta">
            <span>${Icon(sc.work_type === 'construction' ? 'site' : 'wrench', 14)} ${this.typeLabel(sc.work_type)}</span>
            <span>${Icon('user', 14)} ${asg.length} ${asg.length === 1 ? 'človek' : 'ľudí'}</span>
            ${sc.charge_rate ? `<span>${Icon('euro', 14)} ${UI.money(sc.charge_rate)}/h</span>` : ''}
            ${sc.date_from ? `<span>${Icon('calendar', 14)} ${UI.dateRange(sc.date_from, sc.date_to)}</span>` : ''}
            ${!chk.ok ? `<span style="color:var(--red);font-weight:700;">${Icon('alert', 14)} ${chk.blockers.length} blokátorov</span>`
              : chk.warnings.length ? `<span style="color:var(--amber);font-weight:700;">${Icon('alert', 14)} ${chk.warnings.length} upozornení</span>` : ''}
          </div>
        </div>`;
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    // ── Detail so compliance panelom ──────────────────────────────────────
    async detail(id) {
      const sc = this.items.find(x => x.id === id);
      if (!sc) return UI.toast('Nenájdené', 'err');
      this._cur = sc;
      const p = this.partnerOf(sc.partner_id);
      const asg = this.asgOf(sc.id);
      const chk = this.check(sc);

      // ekonomika zákazky
      const eco = asg.filter(a => a.status !== 'cancelled').map(a => {
        const w = this.workerOf(a.worker_id);
        return DanubraMargin.assignmentMargin({
          charge_rate: a.charge_rate ?? sc.charge_rate,
          legal_form: w?.legal_form,
          hourly_cost: w?.hourly_cost,
          gross_monthly: a.gross_monthly ?? w?.gross_monthly,
          per_diem_daily: a.per_diem_daily ?? w?.per_diem_daily,
          accommodation_monthly: a.accommodation_monthly,
          transport_monthly: a.transport_monthly,
        }, { hours: 160, workDays: 21, workType: sc.work_type,
             freistellungOk: sc.freistellung_verified }, this._settings);
      });
      const port = DanubraMargin.portfolioSummary(eco);

      const rows = [
        ['Odberateľ', p?.name], ['Typ prác', this.typeLabel(sc.work_type)],
        ['Remeslo', sc.trade], ['Miesto', [sc.site_name, sc.site_city].filter(Boolean).join(', ')],
        ['Termín', sc.date_from ? UI.dateRange(sc.date_from, sc.date_to) : null],
        ['Fakturácia', (BILLING.find(b => b[0] === sc.billing_model) || [, sc.billing_model])[1]],
        ['Sadzba', sc.charge_rate ? `${UI.money(sc.charge_rate)} / h` : null],
        ['Hlásenie Zoll', sc.zoll_reported_at ? `${UI.date(sc.zoll_reported_at)}${sc.zoll_reference ? ` · ${sc.zoll_reference}` : ''}` : null],
      ].filter(r => r[1] != null && r[1] !== '');

      const sev = (s) => s === 'blocker' ? 'red' : s === 'warning' ? 'amber' : '';
      const complianceHtml = chk.items.length ? chk.items.map(i => `
        <div class="list-row" style="cursor:default;align-items:flex-start;">
          <span class="dot ${sev(i.severity)}" style="margin-top:5px;"></span>
          <span style="flex:1;font-size:13px;">
            <strong>${UI.esc(i.label)}</strong>
            ${i.detail ? `<span style="color:var(--ink-mute);display:block;font-size:12px;">${UI.esc(i.detail)}</span>` : ''}
            ${i.fix ? `<span style="color:var(--blue);display:block;font-size:12px;">→ ${UI.esc(i.fix)}</span>` : ''}
          </span>
        </div>`).join('')
        : `<div style="color:var(--green);font-size:13px;font-weight:600;">${Icon('check', 14)} Všetko v poriadku — zákazka je pripravená.</div>`;

      const body = `
        <div class="detail-head">
          ${this.badge(sc.status)}
          <span class="mono" style="font-size:11px;color:var(--ink-mute);letter-spacing:.1em;">${UI.esc(sc.contract_number || '')}</span>
          <select class="verif-sel" onchange="Sub.setStatus('${sc.id}',this.value)">
            ${STATUS.map(s => `<option value="${s[0]}" ${sc.status === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('')}
          </select>
        </div>

        <div class="${chk.ok ? 'regimebox' : 'warnbox'}" style="margin-bottom:14px;">
          ${chk.ok
            ? `${Icon('check', 14)} Podmienky vyslania sú splnené${chk.warnings.length ? ` — ${chk.warnings.length} upozornení nižšie` : ''}.`
            : `${Icon('alert', 14)} <strong>Nesmie sa začať:</strong> ${chk.blockers.length} ${chk.blockers.length === 1 ? 'blokátor' : 'blokátorov'} nižšie.`}
        </div>

        <div class="kv">${rows.map(r => `<div><span>${r[0]}</span><strong>${UI.esc(r[1])}</strong></div>`).join('')}</div>
        ${sc.scope ? `<div class="notebox"><strong>Dielo:</strong> ${UI.esc(sc.scope)}</div>` : ''}

        <div class="form-section">Compliance</div>
        ${complianceHtml}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
          ${sc.work_type === 'construction' && !sc.zoll_reported_at
            ? `<button class="btn btn-outline btn-sm" onclick="Sub.markZoll('${sc.id}')">${Icon('check')} Zaznamenať hlásenie Zoll</button>` : ''}
          <button class="btn btn-outline btn-sm" onclick="Sub.anuCheck('${sc.id}')">${Icon('shield')} Test rizika ANÜ</button>
        </div>

        <div class="form-section">Nasadení pracovníci (${asg.filter(a => a.status !== 'cancelled').length})</div>
        ${asg.filter(a => a.status !== 'cancelled').map(a => {
          const w = this.workerOf(a.worker_id);
          return `<div class="list-row" style="cursor:default;">
            <span style="flex:1;font-size:13px;">
              <strong>${UI.esc(w?.full_name || '—')}</strong>
              ${a.role === 'predak' ? UI.badge('predák', 'blue') : ''}
              <span style="color:var(--ink-mute);display:block;font-size:12px;">
                ${a.date_from ? UI.dateRange(a.date_from, a.date_to) : ''}
                ${a.charge_rate ? ` · ${UI.money(a.charge_rate)}/h` : ''}</span>
            </span>
            <button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="Sub.delAsg('${a.id}')">${Icon('x', 15)}</button>
          </div>`;
        }).join('') || '<div style="color:var(--ink-mute);font-size:13px;">Zatiaľ nikto nenasadený.</div>'}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
          <button class="btn btn-outline btn-sm" onclick="Sub.addAsg('${sc.id}')">${Icon('plus')} Nasadiť pracovníka</button>
          <button class="btn btn-outline btn-sm" onclick="Sub.assignCrewForm('${sc.id}')">${Icon('workers', 14)} Nasadiť celú partiu</button>
        </div>

        <div class="form-section">Obdobia a podklady</div>
        ${this.periodsHtml(sc)}

        ${asg.filter(a => a.status !== 'cancelled').map(a => {
          const w = this.workerOf(a.worker_id);
          const ch = this.checklist.filter(x => x.assignment_id === a.id);
          if (!ch.length) return '';
          const done = ch.filter(x => x.done).length;
          const blocking = ch.filter(x => x.required && !x.done).length;
          return `<div class="form-section">Pred nasadením · ${UI.esc(w?.full_name || '')}
              <span style="float:right;font-family:inherit;letter-spacing:0;text-transform:none;
                color:${blocking ? 'var(--red)' : 'var(--green)'};">${done}/${ch.length}</span></div>
            ${ch.map(x => `<div class="list-row" style="align-items:flex-start;">
              <button class="btn btn-ghost btn-sm" style="padding:2px 4px;color:${x.done ? 'var(--green)' : 'var(--ink-mute)'};"
                onclick="Sub.toggleCheck('${x.id}')">${Icon('check', 17)}</button>
              <span style="flex:1;font-size:13px;">
                <strong style="${x.done ? 'text-decoration:line-through;opacity:.55;' : ''}">${UI.esc(x.title)}</strong>
                ${x.required ? '' : UI.badge('voliteľné', 'gray')}
                ${x.description ? `<span style="display:block;color:var(--ink-mute);font-size:12px;">${UI.esc(x.description)}</span>` : ''}
              </span></div>`).join('')}`;
        }).join('')}

        <div class="form-section">Ubytovanie a doprava</div>
        ${(() => {
          const rows = this.lodging.filter(l => l.subcontract_id === sc.id);
          const people = asg.filter(a => a.status !== 'cancelled').length;
          const capacity = rows.reduce((n, l) => n + (Number(l.capacity) || 0), 0);
          const short = people - capacity;
          return `
          ${rows.length ? rows.map(l => {
            const acc = this.accommodations.find(a => a.id === l.accommodation_id);
            const name = l.name || acc?.name || 'Ubytovanie';
            const addr = [l.address || acc?.address, l.city || acc?.city].filter(Boolean).join(', ');
            const maps = l.maps_url || (acc?.lat && acc?.lng ? `https://maps.google.com/?q=${acc.lat},${acc.lng}`
              : addr ? `https://maps.google.com/?q=${encodeURIComponent(addr)}` : null);
            const full = (Number(l.occupied) || 0) >= (Number(l.capacity) || 0) && l.capacity;
            return `<div class="list-row" style="cursor:default;align-items:flex-start;">
              <span class="dot ${full ? 'amber' : 'green'}" style="margin-top:5px;"></span>
              <span style="flex:1;font-size:13px;">
                <strong>${UI.esc(name)}</strong>
                ${acc ? UI.badge('z databázy', 'blue') : ''}
                <span style="display:block;color:var(--ink-mute);font-size:12px;">
                  ${UI.esc(addr || 'bez adresy')}
                  ${l.capacity ? ` · obsadené ${l.occupied || 0} z ${l.capacity}` : ''}
                  ${l.price_monthly ? ` · ${UI.money(l.price_monthly)}/mes` : ''}
                  ${l.date_from ? ` · ${UI.dateRange(l.date_from, l.date_to)}` : ''}</span>
                ${l.note ? `<span style="display:block;color:var(--ink-sub);font-size:12px;">${UI.esc(l.note)}</span>` : ''}
              </span>
              ${maps ? `<a class="btn btn-ghost btn-sm" href="${UI.esc(maps)}" target="_blank" rel="noopener"
                title="Otvoriť v mapách">${Icon('site', 15)}</a>` : ''}
              <button class="btn btn-ghost btn-sm" style="color:var(--red);"
                onclick="Sub.delLodging('${l.id}')">${Icon('x', 15)}</button>
            </div>`;
          }).join('') : '<div style="color:var(--ink-mute);font-size:13px;">Zatiaľ žiadne ubytovanie.</div>'}
          ${rows.length && short > 0 ? `<div class="warnbox" style="margin-top:8px;">
            ${Icon('alert', 14)} Kapacita nestačí — nasadených ${people}, lôžok ${capacity}.
            Chýba miesto pre ${short} ${short === 1 ? 'človeka' : 'ľudí'}.</div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
            <button class="btn btn-outline btn-sm" onclick="Sub.addLodging('${sc.id}')">${Icon('plus')} Pridať ubytovanie</button>
            <button class="btn btn-outline btn-sm" onclick="Sub.editTransport('${sc.id}')">${Icon('van')} Doprava</button>
          </div>
          ${sc.transport_note ? `<div class="notebox" style="margin-top:8px;">
            <strong>Doprava${sc.transport_provided ? ' (zabezpečujeme)' : ''}:</strong> ${UI.esc(sc.transport_note)}</div>` : ''}`;
        })()}

        ${eco.length ? `
        <div class="form-section">Ekonomika (mesačne, orientačne pri 160 h a 21 dňoch)</div>
        <div class="service-total">
          <div><div class="code-label">Marža spolu</div>
            <div style="font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;">${UI.money(port.margin)}</div></div>
          <div style="text-align:right;"><div class="code-label">Na pracovníka</div>
            <div style="font-weight:700;">${UI.money(port.marginPerWorker)} · ${port.marginPct} %</div></div>
        </div>
        ${port.marginPerWorker < 1000 ? `<div class="warnbox" style="margin-top:8px;">
          ${Icon('alert', 14)} Marža na pracovníka je pod 1 000 € — prehodnoť sadzbu alebo segment.</div>` : ''}
        ` : ''}

        <div class="modal-actions">
          <button class="btn btn-danger btn-sm" onclick="Sub.del('${sc.id}')">Zmazať</button>
          <button class="btn btn-outline btn-sm" onclick="Sub.form('${sc.id}')">Upraviť</button>
        </div>`;
      UI.modal(sc.title, body, { wide: true });
    },

    async _settings() {
      if (this._set) return this._set;
      const { data } = await DB.list('settings', { limit: 1 });
      this._set = (data && data[0]) || {};
      return this._set;
    },

    async setStatus(id, status) {
      const sc = this.items.find(x => x.id === id);
      if (status === 'active') {
        const chk = this.check(sc);
        if (!chk.ok) {
          return UI.toast(`Nedá sa spustiť — ${chk.blockers.length} blokátorov compliance`, 'err');
        }
      }
      const patch = { status };
      if (status === 'won') patch.won_at = new Date().toISOString();
      if (status === 'completed') patch.completed_at = new Date().toISOString();
      await DB.update('subcontracts', id, patch);
      Object.assign(sc, patch);
      UI.toast('Stav uložený', 'ok');
      this.detail(id);
    },

    async markZoll(id) {
      const ref = prompt('Meldungs-ID z meldeportal-mindestlohn.de:');
      if (ref === null) return;
      const patch = { zoll_reported_at: new Date().toISOString(), zoll_reference: ref || null };
      await DB.update('subcontracts', id, patch);
      Object.assign(this.items.find(x => x.id === id), patch);
      UI.toast('Hlásenie zaznamenané', 'ok');
      this.detail(id);
    },

    /** Interaktívny test signálov skrytej Arbeitnehmerüberlassung. */
    anuCheck(id) {
      const body = `
        <p style="font-size:13px;color:var(--ink-sub);margin-top:0;">
          Zaškrtni, čo na zákazke reálne platí. Rozhoduje skutočný výkon prác, nie znenie zmluvy.</p>
        <form id="anu-form" oninput="Sub.anuUpdate()">
          ${DanubraCompliance.ANU_SIGNALS.map(([k, label]) =>
            `<label class="chk" style="padding:8px 0;border-bottom:1px solid var(--border-soft);">
              <input type="checkbox" name="${k}"> ${UI.esc(label)}</label>`).join('')}
        </form>
        <div id="anu-result" class="regimebox" style="margin-top:14px;"></div>
        <div class="modal-actions">
          <button class="btn btn-outline btn-sm" onclick="Sub.detail('${id}')">Späť na zákazku</button>
        </div>`;
      UI.modal('Test rizika skrytej ANÜ', body, { wide: true });
      this.anuUpdate();
    },

    anuUpdate() {
      const form = document.getElementById('anu-form');
      const out = document.getElementById('anu-result');
      if (!form || !out) return;
      const answers = {};
      form.querySelectorAll('input[type=checkbox]').forEach(c => { answers[c.name] = c.checked; });
      const r = DanubraCompliance.anuRisk(answers);
      const color = { nizke: 'var(--green)', zvysene: 'var(--amber)', vysoke: 'var(--red)', kriticke: 'var(--red)' }[r.level];
      out.innerHTML = `<div style="font-weight:700;color:${color};margin-bottom:4px;">
        Riziko: ${r.level.toUpperCase()} — ${r.score} z ${r.total} signálov</div>
        <div style="font-size:12.5px;">${UI.esc(r.advice)}</div>`;
      out.style.background = r.score >= 3 ? 'var(--red-50)' : r.score >= 1 ? 'var(--amber-50)' : 'var(--green-50)';
    },

    // ── Nasadenie ─────────────────────────────────────────────────────────
    addAsg(scId) {
      const sc = this.items.find(x => x.id === scId);
      const free = this.workers.filter(w => ['ready', 'deployed'].includes(w.status));
      if (!free.length) return UI.toast('Žiadni pripravení pracovníci — najprv ich pridaj a nastav stav', 'err');
      const body = `
        <form id="asg-form" onsubmit="event.preventDefault();Sub.saveAsg('${scId}')">
          <div class="form-grid">
            ${UI.field('worker_id', 'Pracovník', { required: true, options: free.map(w => [w.id, w.full_name]) })}
            ${UI.field('role', 'Rola', { value: 'pracovnik', options: [['pracovnik', 'Pracovník'], ['predak', 'Predák (vedie práce)']] })}
            ${UI.field('date_from', 'Od', { type: 'date', value: sc?.date_from })}
            ${UI.field('date_to', 'Do', { type: 'date', value: sc?.date_to })}
            ${UI.field('charge_rate', 'Fakturačná sadzba €/h', { type: 'number', value: sc?.charge_rate })}
            ${UI.field('gross_monthly', 'Hrubá mzda €/mes', { type: 'number' })}
            ${UI.field('per_diem_daily', 'Diéty €/deň', { type: 'number', value: 45 })}
            ${UI.field('accommodation_monthly', 'Ubytovanie €/mes', { type: 'number' })}
            ${UI.field('transport_monthly', 'Doprava €/mes', { type: 'number' })}
          </div>
          <div class="regimebox">Aspoň jeden nasadený má byť <strong>predák</strong> — vlastné vedenie prác
          je kľúčový dôkaz, že ide o Werkvertrag a nie o prenájom pracovnej sily.</div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="Sub.detail('${scId}')">Späť</button>
            <button type="submit" class="btn btn-primary">Nasadiť</button>
          </div>
        </form>`;
      UI.modal('Nasadiť pracovníka', body, { wide: true });
    },

    /** Ubytovanie na zákazke — buď z databázy, alebo voľne zapísané. */
    addLodging(scId) {
      const sc = this.items.find(x => x.id === scId);
      const city = sc?.site_city || '';
      // ponúkni najprv ubytovania v tom istom meste
      const sorted = [...this.accommodations].sort((a, b) => {
        const am = (a.city || '').toLowerCase() === city.toLowerCase() ? 0 : 1;
        const bm = (b.city || '').toLowerCase() === city.toLowerCase() ? 0 : 1;
        return am - bm || String(a.name).localeCompare(String(b.name));
      });
      UI.modal('Pridať ubytovanie', `
        <form id="lodg-form" onsubmit="event.preventDefault();Sub.saveLodging('${scId}')">
          ${UI.field('accommodation_id', 'Z databázy ubytovaní', {
            options: [['', '— zapíšem ručne —'], ...sorted.map(a => [a.id,
              `${a.name}${a.city ? ` · ${a.city}` : ''}${a.max_persons ? ` · ${a.max_persons} os.` : ''}`])] })}
          <div class="regimebox" style="margin:10px 0;">Ubytovanie sa berie z tej istej databázy ako
          v ubytovacej agende — čo si zháňal pre klientov, môžeš použiť aj pre vlastných ľudí.</div>
          <div class="form-grid">
            ${UI.field('name', 'Názov (ak nie je v databáze)', {})}
            ${UI.field('city', 'Mesto', { value: city })}
            ${UI.field('address', 'Adresa', {})}
            ${UI.field('maps_url', 'Odkaz na mapu', { type: 'url' })}
            ${UI.field('capacity', 'Lôžok', { type: 'number' })}
            ${UI.field('occupied', 'Obsadené', { type: 'number', value: 0 })}
            ${UI.field('price_monthly', 'Cena €/mes', { type: 'number' })}
            ${UI.field('date_from', 'Od', { type: 'date', value: sc?.date_from })}
            ${UI.field('date_to', 'Do', { type: 'date', value: sc?.date_to })}
          </div>
          ${UI.field('note', 'Poznámka', { type: 'textarea', rows: 2 })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="Sub.detail('${scId}')">Späť</button>
            <button type="submit" class="btn btn-primary">Pridať</button>
          </div>
        </form>`, { wide: true });
    },

    async saveLodging(scId) {
      const d = UI.formData(document.getElementById('lodg-form'));
      const acc = this.accommodations.find(a => a.id === d.accommodation_id);
      if (!acc && !d.name && !d.address) return UI.toast('Vyber ubytovanie alebo zapíš názov', 'err');
      const payload = {
        subcontract_id: scId,
        accommodation_id: d.accommodation_id || null,
        name: d.name || null, city: d.city || null, address: d.address || null,
        maps_url: d.maps_url || null, note: d.note || null,
        date_from: d.date_from || null, date_to: d.date_to || null,
      };
      ['capacity', 'occupied', 'price_monthly'].forEach(k => { payload[k] = d[k] === '' ? null : Number(d[k]); });
      // ak je z databázy a kapacita nie je zadaná, vezmi ju odtiaľ
      if (acc && payload.capacity == null) payload.capacity = acc.max_persons ?? null;
      if (acc && payload.price_monthly == null) payload.price_monthly = acc.price_month ?? null;
      const { error } = await DB.insert('subcontract_accommodations', payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast('Ubytovanie pridané', 'ok');
      await this.load(); this.detail(scId);
    },

    async delLodging(id) {
      const l = this.lodging.find(x => x.id === id);
      if (!confirm('Odobrať toto ubytovanie zo zákazky?')) return;
      await DB.remove('subcontract_accommodations', id);
      this.lodging = this.lodging.filter(x => x.id !== id);
      if (l) this.detail(l.subcontract_id);
    },

    editTransport(scId) {
      const sc = this.items.find(x => x.id === scId);
      UI.modal('Doprava', `
        <form id="tr-form" onsubmit="event.preventDefault();Sub.saveTransport('${scId}')">
          <div class="chk-row">
            ${UI.field('transport_provided', '', { type: 'checkbox', value: sc?.transport_provided,
              placeholder: 'Dopravu zabezpečujeme my' })}
          </div>
          ${UI.field('transport_note', 'Ako je doprava vyriešená', { type: 'textarea', rows: 3,
            value: sc?.transport_note,
            placeholder: 'Kto vezie, akým autom, kto hradí cestu tam a späť, ako sa dostávajú na stavbu…' })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="Sub.detail('${scId}')">Späť</button>
            <button type="submit" class="btn btn-primary">Uložiť</button>
          </div>
        </form>`);
    },

    async saveTransport(scId) {
      const d = UI.formData(document.getElementById('tr-form'));
      const patch = { transport_note: d.transport_note || null, transport_provided: !!d.transport_provided };
      await DB.update('subcontracts', scId, patch);
      Object.assign(this.items.find(x => x.id === scId), patch);
      UI.toast('Uložené', 'ok');
      this.detail(scId);
    },

    async toggleCheck(id) {
      const x = this.checklist.find(c => c.id === id);
      if (!x) return;
      const on = !x.done;
      await DB.update('checklist_items', id, { done: on, done_at: on ? new Date().toISOString() : null });
      x.done = on;
      this.detail(this._cur.id);
    },

    async saveAsg(scId) {
      const d = UI.formData(document.getElementById('asg-form'));
      const payload = {
        subcontract_id: scId, worker_id: d.worker_id, role: d.role,
        date_from: d.date_from || null, date_to: d.date_to || null,
        status: 'planned',
      };
      ['charge_rate', 'gross_monthly', 'per_diem_daily', 'accommodation_monthly', 'transport_monthly']
        .forEach(k => { payload[k] = d[k] === '' ? null : Number(d[k]); });
      const { data: asg, error } = await DB.insert('assignments', payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      await DB.update('workers', d.worker_id, { status: 'deployed' }).catch(() => {});

      // založ pre-deployment checklist z predvolených krokov
      try {
        const st = await this._settings();
        const steps = st?.staffing?.checklist_default || [];
        if (steps.length && asg?.id) {
          await DB.from('checklist_items').insert(steps.map((x, i) => ({
            assignment_id: asg.id, step_order: i, title: x.title,
            description: x.description || null, required: x.required !== false,
          })));
        }
      } catch (e) { console.warn('[subcontracts] checklist:', e.message); }

      UI.toast('Pracovník nasadený, checklist založený', 'ok');
      await this.load(); this.detail(scId);
    },

    async delAsg(id) {
      const a = this.assignments.find(x => x.id === id);
      if (!confirm('Zrušiť toto nasadenie?')) return;
      await DB.remove('assignments', id);
      this.assignments = this.assignments.filter(x => x.id !== id);
      if (a) this.detail(a.subcontract_id);
    },

    // ── Formulár zákazky ──────────────────────────────────────────────────
    form(id) {
      const sc = id ? this.items.find(x => x.id === id) || {} : {};
      const body = `
        <form id="sub-form" onsubmit="event.preventDefault();Sub.save('${id || ''}')">
          <div class="form-grid">
            ${UI.field('title', 'Názov zákazky', { value: sc.title, required: true })}
            ${UI.field('partner_id', 'Odberateľ', { value: sc.partner_id, options: [['', '— vyber —'], ...this.partners.map(p => [p.id, p.name])] })}
            ${UI.field('work_type', 'Typ prác', { value: sc.work_type || 'workshop', options: WORK_TYPE })}
            ${UI.field('trade', 'Remeslo', { value: sc.trade })}
            ${UI.field('date_from', 'Od', { type: 'date', value: sc.date_from })}
            ${UI.field('date_to', 'Do', { type: 'date', value: sc.date_to })}
          </div>
          <div class="form-section">Miesto výkonu</div>
          <div class="form-grid">
            ${UI.field('site_name', 'Názov stavby / dielne', { value: sc.site_name })}
            ${UI.field('site_city', 'Mesto', { value: sc.site_city })}
            ${UI.field('site_address', 'Adresa', { value: sc.site_address })}
            ${UI.field('site_postal_code', 'PSČ', { value: sc.site_postal_code })}
          </div>
          <div class="form-section">Odmena</div>
          <div class="form-grid">
            ${UI.field('billing_model', 'Model', { value: sc.billing_model || 'hourly', options: BILLING })}
            ${UI.field('charge_rate', 'Sadzba €/h alebo €/jednotku', { type: 'number', value: sc.charge_rate })}
            ${UI.field('unit_label', 'Jednotka', { value: sc.unit_label, placeholder: 'm², kus…' })}
            ${UI.field('fixed_price', 'Pevná cena €', { type: 'number', value: sc.fixed_price })}
          </div>
          ${UI.field('scope', 'Definícia diela', { type: 'textarea', rows: 3, value: sc.scope,
            placeholder: 'Konkrétny výsledok — napr. „Montáž sadrokartónových priečok, 800 m², vrátane tmelenia"' })}
          <div class="regimebox">Werkvertrag musí definovať <strong>výsledok</strong>, nie odpracované hodiny.
          Čím konkrétnejší popis diela, tým silnejší dôkaz pri kontrole.</div>
          <div class="chk-row">
            ${UI.field('freistellung_verified', '', { type: 'checkbox', value: sc.freistellung_verified, placeholder: 'Odberateľ overil našu §48b' })}
          </div>
          ${UI.field('notes', 'Poznámka', { type: 'textarea', value: sc.notes })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Vytvoriť zákazku'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť zákazku' : 'Nová zákazka', body, { wide: true });
    },

    async save(id) {
      const d = UI.formData(document.getElementById('sub-form'));
      if (!d.title) return UI.toast('Názov je povinný', 'err');
      const payload = { ...d };
      ['charge_rate', 'fixed_price'].forEach(k => { payload[k] = d[k] === '' ? null : Number(d[k]); });
      ['date_from', 'date_to'].forEach(k => { if (payload[k] === '') payload[k] = null; });
      if (payload.partner_id === '') payload.partner_id = null;

      let res;
      if (id) res = await DB.update('subcontracts', id, payload);
      else {
        try {
          const { data: num, error } = await DB.client.rpc('danubra_next_number', { p_kind: 'subcontract' });
          if (error) throw error;
          payload.contract_number = num;
        } catch (e) {
          return UI.toast('Číselný rad zákaziek nie je dostupný — spusti migráciu 003. ' + (e.message || ''), 'err');
        }
        res = await DB.insert('subcontracts', payload);
      }
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast(id ? 'Uložené' : 'Zákazka vytvorená', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    async del(id) {
      if (!confirm('Zmazať túto zákazku aj s nasadeniami?')) return;
      const { error } = await DB.remove('subcontracts', id);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal(); UI.toast('Zmazané', 'ok');
      this.items = this.items.filter(x => x.id !== id); Danubra.renderRoute();
    },
  };


  // ── Obdobia a podklady (F5) ─────────────────────────────────────────────
  // Uzávierka je bod, po ktorom sa hodiny už nemenia. Preto musí byť pred
  // kliknutím vidieť presne to isté, čo sa potom zmrazí.
  Object.assign(Sub, {
    periodsHtml(sc) {
      const periods = this.periodsOf(sc.id);
      const asg = this.asgOf(sc.id);
      const ts = this.timesheetsOf(sc.id);

      const closed = periods.map(p => {
        const margin = Money.toCents(p.amount_charged) - Money.toCents(p.amount_worker_cost);
        const canReopen = p.status === 'closed';
        return `<div class="list-row" style="cursor:default;align-items:flex-start;">
          <span class="dot ${p.status === 'invoiced' ? 'green' : p.status === 'closed' ? 'blue' : ''}"></span>
          <span style="flex:1;font-size:13px;">
            <strong>${UI.dateRange(p.period_from, p.period_to)}</strong>
            ${UI.badge(Enums.label('period_status', p.status),
              p.status === 'invoiced' ? 'green' : p.status === 'closed' ? 'blue' : 'gray')}
            <span style="display:block;color:var(--ink-mute);font-size:12px;">
              ${Number(p.hours_construction || 0) + Number(p.hours_workshop || 0) + Number(p.hours_travel || 0)} h
              · fakturujeme ${Money.format(Money.toCents(p.amount_charged))}
              · marža ${Money.format(margin)}</span>
            ${p.note ? `<span style="display:block;color:var(--ink-mute);font-size:11.5px;white-space:pre-wrap;">${UI.esc(p.note)}</span>` : ''}
          </span>
          ${p.status === 'open'
            ? `<button class="btn btn-primary btn-sm" onclick="Sub.closePeriodForm('${p.id}')">Uzavrieť</button>`
            : canReopen
              ? `<span style="display:flex;gap:6px;">
                   <button class="btn btn-ghost btn-sm" onclick="Sub.reopenPeriod('${p.id}')" title="Otvoriť späť">${Icon('repeat', 15)}</button>
                   <button class="btn btn-outline btn-sm" onclick="Inv.fromPeriod('${p.id}')">Fakturovať</button>
                 </span>`
              : ''}
        </div>`;
      }).join('');

      // Koľko hodín čaká mimo akéhokoľvek obdobia — to je to, čo sa
      // najľahšie prehliadne a zostane nevyfakturované.
      const loose = ts.filter(t => !t.period_id);
      const looseApproved = loose.filter(t => t.approved);
      const looseHours = loose.reduce((n, t) => n + (Number(t.hours) || 0), 0);

      const next = DanubraPeriods.nextPeriod(periods);
      return `
        ${periods.length ? closed
          : '<div style="color:var(--ink-mute);font-size:13px;">Zatiaľ žiadne obdobie.</div>'}
        ${looseHours ? `<div class="regimebox" style="margin-top:10px;">
          Mimo obdobia čaká ${looseHours} ${DanubraPeriods.plural(looseHours, 'hodina', 'hodiny', 'hodín')}${
            looseApproved.length < loose.length
              ? `, z toho ${loose.length - looseApproved.length} ${DanubraPeriods.plural(loose.length - looseApproved.length, 'výkaz neschválený', 'výkazy neschválené', 'výkazov neschválených')}` : ''}.
          Kým sa neuzavrú do obdobia, nedá sa z nich vystaviť faktúra.</div>` : ''}
        <button class="btn btn-outline btn-sm" style="margin-top:8px;"
          onclick="Sub.newPeriod('${sc.id}','${next.from}','${next.to}')">
          ${Icon('plus')} Nové obdobie ${UI.dateRange(next.from, next.to)}</button>`;
    },

    async newPeriod(scId, from, to) {
      const { error } = await DB.insert('periods', {
        subcontract_id: scId, period_from: from, period_to: to,
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast('Obdobie vytvorené', 'ok');
      this.loaded = false; await this.load(); this.detail(scId);
    },

    /** Náhľad pred uzavretím — to isté, čo potom zmrazí databáza. */
    closePeriodForm(periodId) {
      const p = this.periods.find(x => x.id === periodId);
      if (!p) return;
      const scId = p.subcontract_id;
      const rev = DanubraPeriods.review({
        timesheets: this.timesheetsOf(scId),
        assignments: this.asgOf(scId),
        from: p.period_from, to: p.period_to,
      });
      const pv = rev.preview;

      const body = `
        <div class="regimebox" style="margin:0 0 12px;">
          Po uzavretí sa hodiny v tomto období už nedajú zmeniť ani zmazať.
          Súčty sa uložia tak, ako sú teraz — neskoršia zmena sadzby ich
          spätne neprepíše.</div>

        <div class="kv">
          <div><span>Obdobie</span><strong>${UI.dateRange(p.period_from, p.period_to)}</strong></div>
          <div><span>Ľudí</span><strong>${pv.workers}</strong></div>
          <div><span>Hodín spolu</span><strong>${pv.totalHours}</strong></div>
        </div>
        ${DanubraPeriods.hourLines(pv).length ? `
          <div class="form-section">Hodiny</div>
          ${DanubraPeriods.hourLines(pv).map(h => `
            <div class="sum-row"><span>${UI.esc(h.label)}</span><b>${h.hours} h</b></div>`).join('')}` : ''}

        <div class="form-section">Podklad</div>
        ${Shell.sums({ lines: DanubraPeriods.sumLines(pv), totalLabel: 'Marža',
          note: pv.marginPct != null ? `${pv.marginPct} % z fakturovanej sumy` : '' })}

        ${(rev.reasons.length || rev.warnings.length)
          ? Shell.blocker({ reasons: [...rev.reasons, ...rev.warnings] })
          : ''}

        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="Sub.detail('${scId}')">Späť</button>
          ${rev.ok ? `<button class="btn btn-primary" onclick="Sub.closePeriod('${periodId}')">
            Uzavrieť obdobie</button>` : ''}
        </div>`;
      UI.modal('Uzavrieť obdobie', body, { wide: true });
    },

    async closePeriod(periodId) {
      const p = this.periods.find(x => x.id === periodId);
      const { error } = await DB.rpc('close_period', { p_period_id: periodId });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast('Obdobie uzavreté — podklad je hotový', 'ok');
      this.loaded = false; await this.load();
      if (p) this.detail(p.subcontract_id);
    },

    async reopenPeriod(periodId) {
      const p = this.periods.find(x => x.id === periodId);
      if (!p) return;
      const reason = prompt('Prečo sa obdobie otvára späť?\n\n'
        + 'Dôvod sa pripíše do poznámky obdobia a zostane tam.');
      if (!reason) return;
      const { error } = await DB.rpc('reopen_period', {
        p_period_id: periodId, p_reason: reason,
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast('Obdobie otvorené späť', 'ok');
      this.loaded = false; await this.load(); this.detail(p.subcontract_id);
    },

    // ── Nasadenie celej partie ────────────────────────────────────────────
    assignCrewForm(scId) {
      const sc = this.items.find(x => x.id === scId);
      const active = this.crews.filter(c => c.status === 'active');
      if (!active.length) {
        UI.modal('Nasadiť partiu', UI.empty('workers', 'Žiadna aktívna partia',
          'Partie sa zakladajú v ĽUDIA → Partie.')
          + `<div class="modal-actions"><button class="btn btn-ghost"
             onclick="Sub.detail('${scId}')">Späť</button></div>`);
        return;
      }
      const body = `
        <form id="ac-form" onsubmit="event.preventDefault();Sub.assignCrew('${scId}')">
          <div class="regimebox" style="margin:0 0 12px;">
            Nasadia sa všetci aktívni členovia naraz. Kto na zákazke už beží,
            ten sa preskočí — dá sa to teda spustiť znova, keď do partie niekto
            pribudne. <strong>Fakturovať bude každý sám za seba.</strong></div>
          <div class="form-grid">
            ${UI.field('crew_id', 'Partia', { value: '', required: true,
              options: [['', '— vyber —'], ...active.map(c => [c.id, c.name])] })}
            ${UI.field('date_from', 'Od', { type: 'date',
              value: sc?.date_from || new Date().toISOString().slice(0, 10) })}
            ${UI.field('date_to', 'Do', { type: 'date', value: sc?.date_to || '' })}
            ${UI.field('charge_rate', 'Fakturujeme €/h', { type: 'number', value: sc?.charge_rate ?? '' })}
            ${UI.field('worker_rate', 'Živnostníkom €/h', { type: 'number', value: '',
              placeholder: 'prázdne = sadzba z kartotéky' })}
            ${UI.field('overhead', 'Réžia €/h', { type: 'number', value: 0 })}
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="Sub.detail('${scId}')">Späť</button>
            <button type="submit" class="btn btn-primary">Nasadiť partiu</button>
          </div>
        </form>`;
      UI.modal('Nasadiť celú partiu', body);
    },

    async assignCrew(scId) {
      const d = UI.formData(document.getElementById('ac-form'));
      if (!d.crew_id) return UI.toast('Vyber partiu', 'err');
      const num = (v) => (v === '' || v == null ? null : Number(v));
      const { data, error } = await DB.rpc('assign_crew', {
        p_crew_id: d.crew_id,
        p_subcontract_id: scId,
        p_date_from: d.date_from || new Date().toISOString().slice(0, 10),
        p_date_to: d.date_to || null,
        p_worker_rate: num(d.worker_rate),
        p_charge_rate: num(d.charge_rate),
        p_overhead: num(d.overhead) ?? 0,
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast(data
        ? `Nasadených ${data} ${DanubraPeriods.plural(data, 'človek', 'ľudia', 'ľudí')}`
        : 'Všetci členovia partie už na zákazke boli', data ? 'ok' : '');
      this.loaded = false; await this.load(); this.detail(scId);
    },
  });

  window.Sub = Sub;
  Danubra.views.subcontracts = function (el) { return Sub.view(el); };
})();
