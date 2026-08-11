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
    items: [], partners: [], assignments: [], workers: [], workerDocs: [], compliance: [], timesheets: [],
    loaded: false, filters: { status: '', work_type: '' },
    _cur: null,

    async load() {
      const [s, p, a, w, wd, c] = await Promise.all([
        DB.list('subcontracts', { order: { column: 'created_at', ascending: false }, limit: 500 }),
        DB.list('partners', { limit: 300 }),
        DB.list('assignments', { limit: 1000 }),
        DB.list('workers', { select: 'id,full_name,profession,skill_level,phone,gross_monthly,per_diem_daily,status', limit: 500 }),
        DB.list('worker_documents', { limit: 2000 }),
        DB.list('compliance', { limit: 500 }),
      ]);
      this.items = s.data || []; this.partners = p.data || []; this.assignments = a.data || [];
      this.workers = w.data || []; this.workerDocs = wd.data || []; this.compliance = c.data || [];
      this.loaded = true;
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
        <button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="Sub.addAsg('${sc.id}')">${Icon('plus')} Nasadiť pracovníka</button>

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

    async saveAsg(scId) {
      const d = UI.formData(document.getElementById('asg-form'));
      const payload = {
        subcontract_id: scId, worker_id: d.worker_id, role: d.role,
        date_from: d.date_from || null, date_to: d.date_to || null,
        status: 'planned',
      };
      ['charge_rate', 'gross_monthly', 'per_diem_daily', 'accommodation_monthly', 'transport_monthly']
        .forEach(k => { payload[k] = d[k] === '' ? null : Number(d[k]); });
      const { error } = await DB.insert('assignments', payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      await DB.update('workers', d.worker_id, { status: 'deployed' }).catch(() => {});
      UI.toast('Pracovník nasadený', 'ok');
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

  window.Sub = Sub;
  Danubra.views.subcontracts = function (el) { Sub.view(el); };
})();
