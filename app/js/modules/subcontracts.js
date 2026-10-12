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
    items: [], partners: [], assignments: [], workers: [], workerDocs: [], compliance: [], timesheets: [], checklist: [], lodging: [], accommodations: [], invoices: [],
    periods: [], crews: [], stays: [], occupancy: [], overrides: [],
    assignmentChecks: [],
    loaded: false, filters: { status: '', work_type: '' },
    _cur: null,

    // Zákazka je obrazovka, nie okno — je na nej mapa, ubytovania, ľudia,
    // obdobia aj compliance. Dá sa na ňu odkázať cez `#/subcontracts/<id>`.
    openId: null,

    async load() {
      const [s, p, a, w, wd, c, ovr] = await Promise.all([
        DB.list('subcontracts', { order: { column: 'created_at', ascending: false }, limit: 500 }),
        DB.list('partners', { limit: 300 }),
        DB.list('assignments', { limit: 1000 }),
        DB.list('workers', { select: 'id,full_name,profession,skill_level,phone,gross_monthly,per_diem_daily,status,legal_form,hourly_cost,regulated_trade', limit: 500 }),
        DB.list('worker_documents', { limit: 2000 }),
        DB.list('compliance', { limit: 500 }),
        // Zapísané výnimky. Bez nich by blokátor pri nasadení ukazoval
        // prekážku, ktorú niekto pred týždňom vedome povolil — a človek by
        // ju povoľoval znova.
        DB.list('overrides', { limit: 1000 }),
      ]);
      this.items = s.data || []; this.partners = p.data || []; this.assignments = a.data || [];
      this.workers = w.data || []; this.workerDocs = wd.data || []; this.compliance = c.data || [];
      this.overrides = ovr.data || [];
      const [ch, sa, accs, per, ts, cr, occ, st, inv] = await Promise.all([
        // v2 tabuľka: body sú viazané na kľúč pravidla, nie na voľný text,
        // ktorý sa pri preklepe rozdvojí (migrácia 017).
        DB.list('assignment_checks', { limit: 3000 }),
        DB.list('subcontract_accommodations', { limit: 1000 }),
        DB.list('accommodations', { select: 'id,name,city,address,max_persons,price_month,lat,lng', limit: 500 }),
        DB.list('periods', { order: { column: 'period_from', ascending: false }, limit: 500 }),
        DB.list('timesheets', { limit: 5000 }),
        DB.list('crews', { select: 'id,name,status,trade_key', limit: 300 }),
        // Obsadenosť sa počíta z pobytov (migrácia 023), nie z ručne
        // vypísaného čísla — to sa rozišlo hneď, ako niekto odišiel.
        DB.list('v_lodging_occupancy', { limit: 1000 }),
        DB.list('v_worker_stay', { limit: 2000 }),
        // Faktúry: bez nich sa nedá povedať, že uzavreté obdobie nikto
        // nevyfakturoval — a to je najtichšia diera v celom reťazci.
        DB.list('invoices', { select: 'id,subcontract_id,period_id,status,total,due_date', limit: 1000 }),
      ]);
      this.assignmentChecks = ch.data || [];
      this.lodging = sa.data || [];
      this.accommodations = accs.data || [];
      this.periods = per.data || [];
      this.timesheets = ts.data || [];
      this.crews = cr.data || [];
      this.occupancy = occ.data || [];
      this.stays = st.data || [];
      this.invoices = inv.data || [];
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

    /**
     * Reťazec zákazky: dohodnuté → smie sa začať → ľudia → hodiny → peniaze.
     *
     * Profil má deväť sekcií a všetko potrebné v nich je — ale nikde nebolo
     * napísané, **čo treba spraviť teraz**. Toto to spočíta a obrazovka to
     * ukáže jednou vetou nad všetkým ostatným.
     *
     * Chýbajúce doklady sa počítajú rovnako ako v zozname nasadených ľudí
     * nižšie: po uplatnení zapísaných výnimiek. Inak by appka na jednej
     * obrazovke tvrdila dve rôzne veci.
     */
    chain(sc) {
      const asg = this.asgOf(sc.id).filter(a => a.status !== 'cancelled');
      const missingDocs = {};
      for (const a of asg) {
        const st = this.asgReadiness(sc.id, a.worker_id, a.date_from);
        if (!st) continue;
        missingDocs[a.worker_id] = Shell.evaluate(st.ready.reasons,
          this.overridesOf(a.worker_id), a.date_from || undefined).open.length;
      }
      const housed = this.occupancyOf(sc.id)
        .reduce((n, l) => n + (Number(l.occupied_now) || 0), 0);

      return DanubraSite.state({
        subcontract: sc,
        partner: this.partnerOf(sc.partner_id),
        check: this.check(sc),
        assignments: asg,
        missingDocs,
        housed: this.occupancyOf(sc.id).length ? housed : null,
        timesheets: this.timesheetsOf(sc.id),
        periods: this.periodsOf(sc.id),
        invoices: (this.invoices || []).filter(i => i.subcontract_id === sc.id),
      });
    },

    /** Compliance výsledok pre zákazku. */
    check(sc) {
      return DanubraCompliance.checkSubcontract({
        subcontract: sc,
        assignments: this.asgOf(sc.id),
        workers: this.workers,
        workerDocs: this.workerDocs,
        companyItems: this.companyItems(),
        // `this._settings` je **funkcia**. Keď sa tu posielala ona namiesto
        // svojho výsledku, compliance aj marža si z nej nemali čo prečítať
        // a potichu počítali s predvolenými hodnotami — Cenník a pravidlá
        // teda na túto obrazovku nemali žiadny vplyv.
        settings: Danubra.cfg('staffing'),
        monthlyHours: 160,
      });
    },

    async view(el) {
      Danubra.setActions(`<button class="btn btn-primary btn-sm" onclick="Sub.form()">${Icon('plus')} Nová zákazka</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      if (this.openId) return this.profile(el, this.openId);
      let rows = this.items;
      if (this.filters.status) rows = rows.filter(x => x.status === this.filters.status);
      if (this.filters.work_type) rows = rows.filter(x => x.work_type === this.filters.work_type);

      const active = this.items.filter(x => x.status === 'active');
      const blocked = active.filter(x => !this.check(x).ok).length;
      const deployed = this.assignments.filter(a => a.status === 'active').length;

      el.innerHTML = Danubra.header(Danubra.labelOf('subcontracts'),
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
            <div style="min-width:0;">
              <div class="acc-name">${UI.esc(sc.title)}</div>
              <div class="acc-loc">${sc.contract_number ? UI.esc(sc.contract_number) : ''}${
                sc.site_city ? `${sc.contract_number ? ' · ' : ''}${UI.esc(sc.site_city)}` : ''}</div>
            </div>
            ${this.badge(sc.status)}
          </div>
          ${p ? `<div class="link-row" style="margin-bottom:9px;">
            ${Danubra.link('partner', p.id, p.name)}
            ${sc.contract_id ? Danubra.link('contract', sc.contract_id, 'Zmluva o dielo') : ''}
          </div>` : ''}
          <div class="acc-meta">
            <span>${Icon(sc.work_type === 'construction' ? 'site' : 'wrench', 14)} ${this.typeLabel(sc.work_type)}</span>
            <span>${Icon('user', 14)} ${asg.length} ${asg.length === 1 ? 'človek' : 'ľudí'}</span>
            ${sc.charge_rate ? `<span>${Icon('euro', 14)} ${UI.money(sc.charge_rate)}/h</span>` : ''}
            ${sc.date_from ? `<span>${Icon('calendar', 14)} ${UI.dateRange(sc.date_from, sc.date_to)}</span>` : ''}
            ${!chk.ok ? `<span style="color:var(--red);font-weight:700;">${Icon('alert', 14)} ${chk.blockers.length} blokátorov</span>`
              : chk.warnings.length ? `<span style="color:var(--amber);font-weight:700;">${Icon('alert', 14)} ${chk.warnings.length} upozornení</span>` : ''}
          </div>
          ${this.cardNow(sc)}
        </div>`;
    },

    /**
     * V karte zoznamu: v ktorom kroku zákazka stojí a čo treba spraviť.
     *
     * Predtým tu bol len počet blokátorov. Zákazka, ktorá mesiac beží
     * a nikto ju nevyfakturoval, vyzerala v zozname úplne v poriadku.
     */
    cardNow(sc) {
      const steps = this.chain(sc);
      const n = DanubraSite.next(steps, sc);
      if (n.key === 'closed' || n.key === 'done') return '';
      return `<div class="card-now${n.hot ? ' card-now-hot' : ''}">
        <b>${UI.esc(DanubraSite.line(steps, sc))}</b>
        <span>${UI.esc(n.what)}</span>
      </div>`;
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    // ── Detail so compliance panelom ──────────────────────────────────────
    /**
     * Vstupný bod z celej appky (Danubra.entities, prehľad, faktúry).
     * Neotvára okno — prepne obrazovku na profil zákazky.
     */
    async detail(id) {
      if (!this.items.find(x => x.id === id)) {
        if (!this.loaded) await this.load();
        if (!this.items.find(x => x.id === id)) return UI.toast('Nenájdené', 'err');
      }
      this.openId = id;
      // Adresa musí niesť aj id. `Danubra.go('subcontracts')` by router prečítal
      // ako „bez id" a práve otvorený záznam by hneď zavrel.
      if (Danubra.route !== 'subcontracts') { location.hash = `#/subcontracts/${id}`; return; }
      try { history.replaceState(null, '', `#/subcontracts/${id}`); } catch {}
      return Danubra.renderRoute();
    },

    closeProfile() {
      this.openId = null;
      try { history.replaceState(null, '', '#/subcontracts'); } catch {}
      Danubra.renderRoute();
    },

    async profile(el, id) {
      const sc = this.items.find(x => x.id === id);
      if (!sc) { this.openId = null; return UI.toast('Nenájdené', 'err'); }
      this._cur = sc;
      Danubra.setActions(`
        <button class="btn btn-ghost btn-sm" onclick="Sub.closeProfile()">${Icon('back', 15)} Späť</button>
        <button class="btn btn-outline btn-sm" onclick="Sub.form('${sc.id}')">${Icon('edit', 14)} Upraviť</button>`);
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
             freistellungOk: sc.freistellung_verified }, Danubra.cfg('staffing'));
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

        ${this.nowHtml(sc)}

        <div class="${chk.ok ? 'regimebox' : 'warnbox'}" style="margin-bottom:14px;">
          ${chk.ok
            ? `${Icon('check', 14)} Podmienky vyslania sú splnené${chk.warnings.length ? ` — ${chk.warnings.length} upozornení nižšie` : ''}.`
            : `${Icon('alert', 14)} <strong>Nesmie sa začať:</strong> ${chk.blockers.length} ${chk.blockers.length === 1 ? 'blokátor' : 'blokátorov'} nižšie.`}
        </div>

        <div class="kv">${rows.map(r => `<div><span>${r[0]}</span><strong>${UI.esc(r[1])}</strong></div>`).join('')}</div>
        ${sc.scope ? `<div class="notebox"><strong>Dielo:</strong> ${UI.esc(sc.scope)}</div>` : ''}

        <div class="form-section">Kde to je</div>
        <div id="sub-map" class="map-box"></div>
        <div class="map-legend">
          <span><i class="lg-site"></i>stavba</span>
          <span><i class="lg-lodging"></i>ubytovanie</span>
          ${DanubraGeo.valid(Number(sc.lat), Number(sc.lng))
            ? `<a class="link-chip" target="_blank" rel="noopener"
                 href="${DanubraGeo.mapsUrl(sc.lat, sc.lng)}">${Icon('site', 13)}
                 <span>Poslať polohu stavby</span></a>`
            : `<button class="link-chip" onclick="Sub.setCoords('${sc.id}')">${Icon('plus', 13)}
                 <span>Doplniť polohu stavby</span></button>`}
        </div>

        <div class="form-section" id="sub-compliance">Compliance</div>
        ${complianceHtml}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
          ${sc.work_type === 'construction' && !sc.zoll_reported_at
            ? `<button class="btn btn-outline btn-sm" onclick="Sub.markZoll('${sc.id}')">${Icon('check')} Zaznamenať hlásenie Zoll</button>` : ''}
          <button class="btn btn-outline btn-sm" onclick="Sub.anuCheck('${sc.id}')">${Icon('shield')} Test rizika ANÜ</button>
        </div>

        <div class="form-section">Nasadení pracovníci (${asg.filter(a => a.status !== 'cancelled').length})</div>
        ${asg.filter(a => a.status !== 'cancelled').map(a => {
          const w = this.workerOf(a.worker_id);
          // Kto je na stavbe s výnimkou, musí byť vidieť tu — nie až v jeho
          // kartotéke. Toto je obrazovka, na ktorej sa človek pýta „koho tam
          // mám", a odpoveď „jedného bez A1" patrí k tomu.
          const live = DanubraOverrides.live(this.overridesOf(a.worker_id));
          const st = this.asgReadiness(sc.id, a.worker_id, a.date_from);
          const open = st ? Shell.evaluate(st.ready.reasons,
            this.overridesOf(a.worker_id), a.date_from || undefined).open : [];
          return `<div class="list-row" style="cursor:default;">
            <span style="flex:1;font-size:13px;">
              <strong>${UI.esc(w?.full_name || '—')}</strong>
              ${a.role === 'predak' ? UI.badge('predák', 'blue') : ''}
              ${live.length ? UI.badge('s výnimkou', 'amber') : ''}
              ${open.length ? UI.badge(`chýba ${open.length}`, 'red') : ''}
              <span style="color:var(--ink-mute);display:block;font-size:12px;">
                ${a.date_from ? UI.dateRange(a.date_from, a.date_to) : ''}
                ${a.charge_rate ? ` · ${UI.money(a.charge_rate)}/h` : ''}</span>
              ${live.length ? `<span style="display:block;font-size:12px;color:var(--amber-ink,var(--amber));">
                ${Icon('shield', 12)} ${UI.esc(live.map(o =>
                  DanubraOverrides.meta(o.rule_key)?.label || o.rule_key).join(', '))}
                — ${UI.esc(live[0].reason || '')}</span>` : ''}
            </span>
            <button class="btn btn-ghost btn-sm" onclick="Sub.siteSheet('${a.id}')"
              title="Infolist na stavbu — kam prísť, kedy a za kým">${Icon('doc', 15)}</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="Sub.delAsg('${a.id}')">${Icon('x', 15)}</button>
          </div>`;
        }).join('') || '<div style="color:var(--ink-mute);font-size:13px;">Zatiaľ nikto nenasadený.</div>'}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
          <button class="btn btn-outline btn-sm" onclick="Sub.addAsg('${sc.id}')">${Icon('plus')} Nasadiť pracovníka</button>
          <button class="btn btn-outline btn-sm" onclick="Sub.assignCrewForm('${sc.id}')">${Icon('workers', 14)} Nasadiť celú partiu</button>
        </div>

        <div class="form-section" id="sub-periods">Obdobia a podklady</div>
        ${this.periodsHtml(sc)}

        ${asg.filter(a => a.status !== 'cancelled')
          .map(a => this.checklistHtml(sc, a)).join('')}

        <div class="form-section">Ubytovanie a doprava</div>
        ${this.lodgingHtml(sc, asg)}

        ${eco.length ? `
        <div class="form-section">Ekonomika (mesačne, orientačne pri 160 h a 21 dňoch)</div>
        <div class="service-total">
          <div><div class="code-label">Marža spolu</div>
            <div style="font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;">${UI.money(port.margin)}</div></div>
          <div style="text-align:right;"><div class="code-label">Na pracovníka</div>
            <div style="font-weight:700;">${UI.money(port.marginPerWorker)} · ${UI.pct(port.marginPct)}</div></div>
        </div>
        ${port.marginPerWorker < 1000 ? `<div class="warnbox" style="margin-top:8px;">
          ${Icon('alert', 14)} Marža na pracovníka je pod 1 000 € — prehodnoť sadzbu alebo segment.</div>` : ''}
        ` : ''}

        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px;">
          <button class="btn btn-danger btn-sm" onclick="Sub.del('${sc.id}')">Zmazať</button>
        </div>`;

      el.innerHTML = Danubra.header(sc.title,
        [p?.name, sc.site_city].filter(Boolean).map(UI.esc).join(' · '),
        '', [sc.title]) + body;

      // Mapa sa kreslí až po vložení HTML — Leaflet potrebuje prvok v strome.
      this.renderMap(sc);
    },

    /**
     * Čo spraviť teraz — jedna veta, jedno tlačidlo a pod tým päť krokov.
     *
     * Nie je to prvý nehotový krok, ale ten, ktorý najviac horí: ľudia na
     * stavbe bez papierov sú drahší problém než nedoplnený termín.
     */
    nowHtml(sc) {
      const steps = this.chain(sc);
      const n = DanubraSite.next(steps, sc);
      const pr = DanubraSite.progress(steps);
      const ACTION = {
        deal: { label: 'Doplniť zákazku', onclick: `Sub.form('${sc.id}')`, ico: 'edit' },
        green: { label: 'Pozrieť compliance', onclick: 'Sub.scrollTo(\'compliance\')', ico: 'shield' },
        people: { label: 'Nasadiť pracovníka', onclick: `Sub.addAsg('${sc.id}')`, ico: 'plus' },
        hours: { label: 'Odpracované hodiny', onclick: "Danubra.go('timesheets')", ico: 'clock' },
        money: { label: 'Obdobia a podklady', onclick: 'Sub.scrollTo(\'periods\')', ico: 'wallet' },
      };
      const a = ACTION[n.key];

      return `
        <div class="nowbox${n.hot ? ' nowbox-hot' : ''}">
          <div class="nowbox-label">Čo spraviť teraz${n.n ? ` · krok ${n.n} z 5` : ''}</div>
          <div class="nowbox-title">${UI.esc(n.title)}
            ${n.key !== 'closed' && n.key !== 'done' && n.key !== 'wait'
              ? Help.btn(`sub.step.${n.key}`, { size: 14 }) : ''}</div>
          <div class="nowbox-sub">${UI.esc(n.what)}</div>
          ${n.why ? `<div class="nowbox-why">${UI.esc(n.why)}</div>` : ''}
          ${a ? `<button type="button" class="btn btn-primary btn-block" style="margin-top:10px;"
            onclick="${a.onclick}">${Icon(a.ico, 17)} ${a.label}</button>` : ''}
          <div class="chainbar">
            ${steps.map(s => `<span class="chainbar-step cb-${s.state}${
              s.key === n.key ? ' is-now' : ''}" title="${UI.esc(`${s.title} — ${s.detail}`)}">
              <b>${s.n}</b><span>${UI.esc(s.title)}</span></span>`).join('')}
          </div>
          <div class="nowbox-why">${pr.done} z ${pr.total} krokov hotových.</div>
        </div>`;
    },

    /** Posun na sekciu profilu. Z vety „čo teraz" sa musí dať ísť tam, kde sa to rieši. */
    scrollTo(kam) {
      const el = document.getElementById(`sub-${kam}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    /** Body na mape: stavba oranžovo, ubytovania modro. */
    mapPoints(sc) {
      const pts = [];
      if (DanubraGeo.valid(Number(sc.lat), Number(sc.lng))) {
        pts.push({ lat: sc.lat, lng: sc.lng, kind: 'site',
          label: sc.title, sub: [sc.site_name, sc.site_city].filter(Boolean).join(', ') });
      }
      for (const l of this.occupancyOf(sc.id)) {
        if (!DanubraGeo.valid(Number(l.lat), Number(l.lng))) continue;
        const d = DanubraGeo.distanceKm(sc, l);
        pts.push({ lat: l.lat, lng: l.lng, kind: 'lodging',
          label: l.name || 'Ubytovanie',
          sub: [l.address, l.capacity ? `${l.occupied_now}/${l.capacity} obsadené` : null,
            DanubraGeo.distanceText(d)].filter(Boolean).join(' · ') });
      }
      return pts;
    },

    renderMap(sc) {
      try { DanubraMap.render('sub-map', this.mapPoints(sc)); }
      catch (e) { console.error('[danubra] mapa sa nevykreslila', e); }
    },

    occupancyOf(scId) { return this.occupancy.filter(o => o.subcontract_id === scId); },
    /**
     * Ubytovania zákazky. Obsadenosť sa **počíta z pobytov**, nie z ručne
     * vypísaného čísla — to sa rozišlo hneď, ako niekto odišiel a nikto to
     * neprepísal. Pri každom ubytovaní je vidieť, kto tam naozaj spí.
     */
    lodgingHtml(sc, asg) {
      const rows = this.occupancyOf(sc.id);
      const people = asg.filter(a => a.status !== 'cancelled').length;
      const capacity = rows.reduce((n, l) => n + (Number(l.capacity) || 0), 0);
      const housed = rows.reduce((n, l) => n + (Number(l.occupied_now) || 0), 0);
      const short = people - capacity;

      const stayRow = (st) => `
        <div class="list-row" style="cursor:default;padding-left:18px;">
          <span class="dot ${st.is_current ? 'green' : ''}"></span>
          <span style="flex:1;font-size:12.5px;min-width:0;">
            ${Danubra.link('worker', st.worker_id, st.full_name)}
            <span style="color:var(--ink-mute);display:block;font-size:12px;margin-top:3px;">
              od ${UI.date(st.date_from)}${st.date_to ? ` do ${UI.date(st.date_to)}` : ''}
              ${st.is_current ? '' : ' · ukončené'}</span>
          </span>
          ${st.is_current ? `<button class="btn btn-ghost btn-sm" title="Ukončiť pobyt"
            onclick="Sub.endStay('${st.stay_id}')">${Icon('logout', 15)}</button>` : ''}
        </div>`;

      const lodgingRow = (l) => {
        const stays = this.staysOf(l.lodging_id);
        const current = stays.filter(x => x.is_current);
        const past = stays.filter(x => !x.is_current);
        const full = l.capacity && Number(l.occupied_now) >= Number(l.capacity);
        const dist = DanubraGeo.distanceKm(sc, l);
        // `Money.split` rozdelí sumu na presné časti, ktoré sa spolu rovnajú
        // celku. (`divRound` počíta v BigInt-och a je to vnútorná pomôcka —
        // zmiešať ju s obyčajnými číslami znamená pád obrazovky.)
        const perBed = l.price_monthly && Number(l.occupied_now) > 0
          ? Money.split(Money.toCents(l.price_monthly), Number(l.occupied_now))[0] : null;

        return `<div class="list-row" style="cursor:default;align-items:flex-start;flex-wrap:wrap;">
          <span class="dot ${full ? 'amber' : 'green'}" style="margin-top:6px;"></span>
          <span style="flex:1;font-size:13px;min-width:0;">
            <strong>${UI.esc(l.name || 'Ubytovanie')}</strong>
            ${l.accommodation_id ? UI.badge('z databázy', 'blue') : ''}
            ${full ? UI.badge('plné', 'amber') : ''}
            <span style="display:block;color:var(--ink-mute);font-size:12px;">
              ${UI.esc([l.address, l.city].filter(Boolean).join(', ') || 'bez adresy')}
              ${l.capacity ? ` · obsadené ${l.occupied_now} z ${l.capacity}` : ` · ${l.occupied_now} ubytovaných`}
              ${l.price_monthly ? ` · ${UI.money(l.price_monthly)}/mes` : ''}
              ${perBed ? ` (${Money.format(perBed)} na človeka)` : ''}
              ${dist != null ? ` · ${DanubraGeo.distanceText(dist)}` : ''}</span>
            <span class="link-row" style="margin-top:7px;">
              <button class="link-chip" onclick="Sub.addStay('${l.lodging_id}')">${Icon('plus', 13)}
                <span>Ubytovať človeka</span></button>
              ${DanubraGeo.valid(Number(l.lat), Number(l.lng))
                ? `<a class="link-chip" target="_blank" rel="noopener"
                     href="${DanubraGeo.mapsUrl(l.lat, l.lng)}">${Icon('site', 13)}<span>Na mape</span></a>`
                : `<button class="link-chip" onclick="Sub.setLodgingCoords('${l.lodging_id}')">${Icon('plus', 13)}
                     <span>Doplniť polohu</span></button>`}
            </span>
          </span>
          <button class="btn btn-ghost btn-sm" style="color:var(--red);"
            onclick="Sub.delLodging('${l.lodging_id}')">${Icon('x', 15)}</button>
          <div style="flex-basis:100%;">
            ${current.map(stayRow).join('')}
            ${past.length ? `<details class="more-block" style="margin-left:18px;">
              <summary>${past.length} ${Shell.plural(past.length, 'ukončený pobyt', 'ukončené pobyty', 'ukončených pobytov')}</summary>
              ${past.map(stayRow).join('')}</details>` : ''}
          </div>
        </div>`;
      };

      return `
        ${rows.length ? rows.map(lodgingRow).join('')
          : '<div style="color:var(--ink-mute);font-size:13px;">Zatiaľ žiadne ubytovanie.</div>'}
        ${rows.length ? `<div class="kv" style="margin:12px 0 0;">
          <div><span>Nasadených ľudí</span><strong>${people}</strong></div>
          <div><span>Ubytovaných</span><strong style="${
            housed < people ? 'color:var(--amber);' : ''}">${housed}</strong></div>
        </div>` : ''}
        ${rows.length && short > 0 ? `<div class="warnbox" style="margin-top:8px;">
          ${Icon('alert', 14)} Kapacita nestačí — nasadených ${people}, lôžok ${capacity}.
          Chýba miesto pre ${short} ${short === 1 ? 'človeka' : 'ľudí'}.</div>` : ''}
        ${rows.length && short <= 0 && housed < people ? `<div class="warnbox" style="margin-top:8px;">
          ${Icon('alert', 14)} Lôžok je dosť, ale ${people - housed} ${
            people - housed === 1 ? 'človek nemá' : 'ľudí nemá'} zapísané, kde býva.</div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
          <button class="btn btn-outline btn-sm" onclick="Sub.addLodging('${sc.id}')">${Icon('plus')} Pridať ubytovanie</button>
          <button class="btn btn-outline btn-sm" onclick="Sub.editTransport('${sc.id}')">${Icon('van')} Doprava</button>
        </div>
        ${sc.transport_note ? `<div class="notebox" style="margin-top:8px;">
          <strong>Doprava${sc.transport_provided ? ' (zabezpečujeme)' : ''}:</strong> ${UI.esc(sc.transport_note)}</div>` : ''}`;
    },

    staysOf(lodgingId) { return this.stays.filter(s => s.lodging_id === lodgingId); },
    // ── Kto kde býva ──────────────────────────────────────────────────────
    addStay(lodgingId) {
      const l = this.occupancy.find(o => o.lodging_id === lodgingId);
      const sc = this.items.find(x => x.id === l?.subcontract_id);
      // Ponúkni najprv tých, ktorí sú na tejto zákazke nasadení a nikde
      // nebývajú — to je ten bežný prípad.
      const housed = new Set(this.stays.filter(s => s.is_current).map(s => s.worker_id));
      const onSite = this.asgOf(l?.subcontract_id || '')
        .filter(a => a.status !== 'cancelled')
        .map(a => this.workerOf(a.worker_id)).filter(Boolean);
      const free = onSite.filter(w => !housed.has(w.id));
      const rest = this.workers.filter(w => !onSite.some(x => x.id === w.id) && !housed.has(w.id));

      const opts = [
        ...(free.length ? [['', `— na zákazke, bez ubytovania (${free.length}) —`]] : []),
        ...free.map(w => [w.id, w.full_name]),
        ...(rest.length ? [['', '— ostatní —']] : []),
        ...rest.map(w => [w.id, w.full_name]),
      ];

      if (!opts.length) {
        return UI.modal('Ubytovať človeka', UI.empty('workers', 'Niet koho ubytovať',
          'Všetci nasadení už majú zapísané, kde bývajú.'));
      }
      UI.modal('Ubytovať človeka', `
        <form id="stay-form" onsubmit="event.preventDefault();Sub.saveStay('${lodgingId}')">
          <!-- add: false — ubytúva sa ten, kto je na zákazku nasadený.
               Novo založený človek nasadený nie je, takže by sa v zozname
               aj tak neobjavil. -->
          ${UI.field('worker_id', 'Kto', { options: opts, required: true, add: false })}
          <div class="form-grid">
            ${UI.field('date_from', 'Od', { type: 'date',
              value: sc?.date_from && sc.date_from > new Date().toISOString().slice(0, 10)
                ? sc.date_from : new Date().toISOString().slice(0, 10) })}
            ${UI.field('date_to', 'Do (nepovinné)', { type: 'date' })}
          </div>
          ${UI.field('note', 'Poznámka', { type: 'textarea', rows: 2 })}
          <div class="regimebox">Jeden človek nemôže bývať na dvoch miestach naraz —
            databáza to nepustí. Keď sa presúva, najprv ukonči predchádzajúci pobyt.
            ${l?.capacity ? `Tu je ${l.free_beds} ${Shell.plural(l.free_beds, 'voľné lôžko', 'voľné lôžka', 'voľných lôžok')}.` : ''}</div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Späť</button>
            <button type="submit" class="btn btn-primary">Ubytovať</button>
          </div>
        </form>`);
    },

    async saveStay(lodgingId) {
      const d = UI.formData(document.getElementById('stay-form'));
      if (!d.worker_id) return UI.toast('Vyber človeka', 'err');
      const { error } = await DB.insert('stays', {
        worker_id: d.worker_id, lodging_id: lodgingId,
        date_from: d.date_from || new Date().toISOString().slice(0, 10),
        date_to: d.date_to || null, note: d.note || null,
      });
      // Databáza povie po slovensky, prečo to nejde (napríklad že ten človek
      // už v tom čase býva inde). Netreba to prekladať znova.
      if (error) return UI.toast(error.message, 'err');
      UI.closeModal();
      UI.toast('Ubytovaný', 'ok');
      await this.reloadStays();
    },

    /**
     * Pobyt sa nemaže — ukončuje sa dátumom. Inak by sa spätne nedalo
     * povedať, kto kde v ktorom mesiaci spal.
     */
    async endStay(stayId) {
      const st = this.stays.find(x => x.stay_id === stayId);
      const today = new Date().toISOString().slice(0, 10);
      const answer = await UI.ask(
        `Kedy sa ${st ? st.full_name : 'človek'} odsťahoval? (RRRR-MM-DD)`, today);
      if (answer == null) return;
      const date = String(answer).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return UI.toast('Dátum zapíš v tvare RRRR-MM-DD.', 'err');
      }
      const { error } = await DB.update('stays', stayId, { date_to: date });
      if (error) return UI.toast(error.message, 'err');
      UI.toast('Pobyt ukončený', 'ok');
      await this.reloadStays();
    },

    async reloadStays() {
      const [occ, st] = await Promise.all([
        DB.list('v_lodging_occupancy', { limit: 1000 }),
        DB.list('v_worker_stay', { limit: 2000 }),
      ]);
      this.occupancy = occ.data || [];
      this.stays = st.data || [];
      Danubra.renderRoute();
    },

    // ── Poloha ────────────────────────────────────────────────────────────
    // Appka sama nikam nevolá. Súradnice sa vytiahnu z odkazu, ktorý človek
    // aj tak posiela vodičovi.
    async setCoords(scId) {
      const c = await this._askCoords('stavby');
      if (!c) return;
      const { error } = await DB.update('subcontracts', scId, { lat: c.lat, lng: c.lng });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const sc = this.items.find(x => x.id === scId);
      if (sc) { sc.lat = c.lat; sc.lng = c.lng; }
      UI.toast('Poloha uložená', 'ok');
      Danubra.renderRoute();
    },

    async setLodgingCoords(lodgingId) {
      const c = await this._askCoords('ubytovania');
      if (!c) return;
      const { error } = await DB.update('subcontract_accommodations', lodgingId,
        { lat: c.lat, lng: c.lng });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast('Poloha uložená', 'ok');
      await this.reloadStays();
    },

    async _askCoords(what) {
      const text = await UI.ask(
        `Vlož odkaz z máp na miesto ${what} — alebo rovno súradnice.\n\n`
        + 'Rozumie odkazom z Google Máp aj OpenStreetMap a dvojici čísel\n'
        + 'ako 48.7758, 9.1829.');
      if (text == null) return null;
      const c = DanubraGeo.parseCoords(text);
      if (!c) {
        UI.toast('V tom odkaze som súradnice nenašiel. Skrátené odkazy '
          + '(maps.app.goo.gl) ich neobsahujú — otvor ich a skopíruj adresu z prehliadača.', 'err');
        return null;
      }
      return c;
    },


    /** Nastavenia z jedného miesta — `Danubra.loadCfg()`. */
    async _settings() { return Danubra.loadCfg(); },

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
      const ref = await UI.ask('Meldungs-ID z meldeportal-mindestlohn.de:');
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
    // Zadanie: „nasadenie bez platných dokladov len s výnimkou admina".
    // Drží to trigger `danubra_assignment_docs_guard` (migrácia 033), takže
    // to platí aj pre import. Tu je to preto, aby človek nedostal chybu
    // z databázy po tom, čo vyplnil deväť polí — má to vidieť hneď, ako
    // vyberie človeka, a má mať po ruke cestu von.

    /** Doklady vybraného človeka k prvému dňu nasadenia. */
    asgReadiness(scId, workerId, dateFrom) {
      const sc = this.items.find(x => x.id === scId);
      const w = this.workers.find(x => x.id === workerId);
      if (!w) return null;
      const ready = DanubraDocs.readiness({
        docs: this.workerDocs.filter(d => d.worker_id === workerId),
        workType: sc?.work_type === 'workshop' ? 'workshop' : 'construction',
        regulated: !!w.regulated_trade,
        // Posudzuje sa k nástupu, nie k dnešku — rovnako ako v databáze.
        // Doklad, ktorý dnes platí a do nástupu vyprší, nesmie prejsť.
        today: dateFrom || new Date().toISOString().slice(0, 10),
      });
      return { worker: w, ready };
    },

    /** Výnimky daného človeka — tie sa držia jeho, nie jednej stavby. */
    overridesOf(workerId) {
      return DanubraOverrides.forEntity(this.overrides, 'worker', workerId);
    },

    asgBlockerHtml(scId, workerId, dateFrom) {
      const r = this.asgReadiness(scId, workerId, dateFrom);
      if (!r) return '';
      const admin = Danubra.isAdmin();
      return Shell.blocker({
        reasons: [...r.ready.reasons, ...r.ready.warnings],
        overrides: this.overridesOf(workerId),
        today: dateFrom || undefined,
        onOverride: admin ? `Sub.grantAsgOverride('${scId}')` : '',
        inputId: 'asg-ovr-reason',
        noOvrNote: 'Nasadiť ho bez dokladov môže povoliť len administrátor.',
        okHtml: '<p style="margin:6px 0 0;font-size:13px;color:var(--ink-sub);">'
          + 'Doklady sú platné aj k prvému dňu nasadenia.</p>',
      });
    },

    /** Prekreslí blokátor po zmene človeka alebo dátumu. */
    asgReady(scId) {
      const form = document.getElementById('asg-form');
      const box = document.getElementById('asg-blocker');
      if (!form || !box) return;
      const d = UI.formData(form);
      // Prekresliť pri každom stlačení klávesy by zmazalo rozpísaný dôvod
      // výnimky — je to jedno z polí vo formulári. Preto len keď sa zmenilo
      // to, od čoho blokátor závisí.
      const key = `${d.worker_id}|${d.date_from}`;
      if (key === this._asgKey) return;
      this._asgKey = key;
      box.innerHTML = this.asgBlockerHtml(scId, d.worker_id, d.date_from);
    },

    /**
     * Zapíše výnimku na doklady vybraného človeka. Robí sa to pred samotným
     * nasadením, nie po ňom — databáza bez nej nasadenie nepustí a dva zápisy
     * z prehliadača sa nedajú spraviť naraz, takže poradie je jediná záruka,
     * že nezostane nasadenie bez zapísaného dôvodu.
     */
    async grantAsgOverride(scId) {
      const form = document.getElementById('asg-form');
      if (!form) return;
      const d = UI.formData(form);
      const box = document.getElementById('asg-ovr-reason');
      const reason = box ? box.value : '';
      if (!Shell.reasonValid(reason)) {
        return UI.toast(`Dôvod musí mať aspoň ${Shell.REASON_MIN} znakov`, 'err');
      }
      const r = this.asgReadiness(scId, d.worker_id, d.date_from);
      if (!r) return UI.toast('Najprv vyber pracovníka', 'err');

      const open = Shell.evaluate([...r.ready.reasons, ...r.ready.warnings],
        this.overridesOf(d.worker_id), d.date_from || undefined).open;
      const { rows, skipped } = DanubraOverrides.rowsFor(open, {
        entityType: 'worker', entityId: d.worker_id, reason,
      });
      if (!rows.length) return UI.toast('Niet čo povoliť — nič neblokuje', 'err');

      const { error } = await DB.from('overrides').insert(rows);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');

      const ovr = await DB.list('overrides', { limit: 1000 });
      this.overrides = ovr.data || this.overrides;
      this._asgKey = null;
      this.asgReady(scId);
      UI.toast(skipped.length
        ? `Výnimka zapísaná, ale ${skipped.length} prekážka zostáva`
        : `Zapísaná výnimka na ${rows.length} ${
          rows.length === 1 ? 'pravidlo' : rows.length < 5 ? 'pravidlá' : 'pravidiel'}`,
        skipped.length ? 'err' : 'ok');
    },

    addAsg(scId) {
      const sc = this.items.find(x => x.id === scId);
      const free = this.workers.filter(w => ['ready', 'deployed'].includes(w.status));
      if (!free.length) return UI.toast('Žiadni pripravení pracovníci — najprv ich pridaj a nastav stav', 'err');
      this._asgKey = `${free[0].id}|${sc?.date_from || ''}`;
      const body = `
        <form id="asg-form" oninput="Sub.asgReady('${scId}')"
              onchange="Sub.asgReady('${scId}')"
              onsubmit="event.preventDefault();Sub.saveAsg('${scId}')">
          <div class="form-grid">
            ${UI.field('worker_id', 'Pracovník', { required: true, add: 'worker', options: free.map(w => [w.id, w.full_name]) })}
            ${UI.field('role', 'Rola', { value: 'pracovnik', options: [['pracovnik', 'Pracovník'], ['predak', 'Predák (vedie práce)']] })}
            ${UI.field('date_from', 'Od', { type: 'date', value: sc?.date_from })}
            ${UI.field('date_to', 'Do', { type: 'date', value: sc?.date_to })}
            ${UI.field('charge_rate', 'Fakturačná sadzba €/h', { type: 'number', value: sc?.charge_rate,
              hint: 'Predvyplní sa pri každom nasadení na túto zákazku a z nej sa '
                + 'počíta, čo sa odberateľovi vyfakturuje.' })}
            ${UI.field('gross_monthly', 'Hrubá mzda €/mes', { type: 'number' })}
            ${UI.field('per_diem_daily', 'Diéty €/deň', { type: 'number', value: 45 })}
            ${UI.field('accommodation_monthly', 'Ubytovanie €/mes', { type: 'number' })}
            ${UI.field('transport_monthly', 'Doprava €/mes', { type: 'number' })}
          </div>
          <div class="regimebox">Aspoň jeden nasadený má byť <strong>predák</strong> — vlastné vedenie prác
          je kľúčový dôkaz, že ide o Werkvertrag a nie o prenájom pracovnej sily.</div>

          <div class="form-section">Smieme ho nasadiť?</div>
          <div id="asg-blocker">${this.asgBlockerHtml(scId, free[0].id, sc?.date_from)}</div>

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
          ${UI.field('accommodation_id', 'Z databázy ubytovaní', { add: 'accommodation',
            options: [['', '— zapíšem ručne —'], ...sorted.map(a => [a.id,
              `${a.name}${a.city ? ` · ${a.city}` : ''}${a.max_persons ? ` · ${a.max_persons} os.` : ''}`])] })}
          <div class="regimebox" style="margin:10px 0;">Ubytovanie sa berie z tej istej databázy ako
          v ubytovacej agende — čo si zháňal pre klientov, môžeš použiť aj pre vlastných ľudí.</div>
          <div class="form-grid">
            ${UI.field('name', 'Názov (ak nie je v databáze)', {})}
            ${UI.field('city', 'Mesto', { value: city })}
            ${UI.field('address', 'Adresa', {})}
            ${UI.field('maps_url', 'Odkaz z máp', { placeholder: 'sem vlož odkaz — vytiahnem z neho polohu' })}
            ${UI.field('capacity', 'Lôžok', { type: 'number' })}
            ${UI.field('price_monthly', 'Cena €/mes', { type: 'number' })}
            ${UI.field('date_from', 'Od', { type: 'date', value: sc?.date_from })}
            ${UI.field('date_to', 'Do', { type: 'date', value: sc?.date_to })}
          </div>
          ${UI.field('note', 'Poznámka', { type: 'textarea', rows: 2 })}
          <div class="regimebox" style="margin-top:10px;">Obsadenosť sa nevypisuje ručne —
            počíta sa z toho, koho tam zapíšeš. Ručné číslo sa rozišlo s realitou
            hneď, ako niekto odišiel.</div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Späť</button>
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
      ['capacity', 'price_monthly'].forEach(k => { payload[k] = d[k] === '' ? null : Number(d[k]); });
      // ak je z databázy a kapacita nie je zadaná, vezmi ju odtiaľ
      if (acc && payload.capacity == null) payload.capacity = acc.max_persons ?? null;
      if (acc && payload.price_monthly == null) payload.price_monthly = acc.price_month ?? null;

      // Poloha z vloženého odkazu. Keď v ňom nie je, nič sa nedeje —
      // doplniť sa dá neskôr priamo z obrazovky.
      const c = DanubraGeo.parseCoords(d.maps_url);
      if (c) { payload.lat = c.lat; payload.lng = c.lng; }

      const { error } = await DB.insert('subcontract_accommodations', payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal();
      UI.toast(c ? 'Ubytovanie pridané aj s polohou' : 'Ubytovanie pridané', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    async delLodging(id) {
      const l = this.lodging.find(x => x.id === id);
      if (!await UI.confirm('Odobrať toto ubytovanie zo zákazky?')) return;
      await DB.remove('subcontract_accommodations', id);
      this.lodging = this.lodging.filter(x => x.id !== id);
      await this.reloadStays();
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

    // ── Checklist pred nasadením ──────────────────────────────────────────
    // Osem z deviatich bodov appka vie sama: doklady z kartotéky, §48b a Zoll
    // zo zákazky, ubytovanie z pobytov, dopravu zo zákazky. Ručne sa
    // odškrtáva jediný — odovzdané pokyny, ktoré nikde inde nie sú.
    //
    // Predtým sa odškrtávalo všetkých deväť. „Platné A1" sa dalo odškrtnúť
    // aj vtedy, keď A1 v kartotéke nebolo, a appka tak mala dve odpovede na
    // tú istú otázku — pričom tá nesprávna svietila nazeleno.

    checklistHtml(sc, a) {
      const w = this.workerOf(a.worker_id);
      const st = this.asgReadiness(sc.id, a.worker_id, a.date_from);
      const ovr = this.overridesOf(a.worker_id);
      const v = st
        ? Shell.evaluate(st.ready.reasons, ovr, a.date_from || undefined)
        : { open: [], waived: [] };

      const rows = DanubraChecks.build({
        assignment: a, subcontract: sc, worker: w || {},
        blocking: v.open.map(r => r.rule),
        waived: v.waived.map(r => r.rule),
        stays: this.stays, checks: this.assignmentChecks,
      });
      const p = DanubraChecks.progress(rows);

      const row = (r) => {
        const color = r.state === 'ok' ? 'var(--green)'
          : r.state === 'waived' ? 'var(--amber)' : 'var(--ink-mute)';
        const ico = r.state === 'waived' ? 'shield' : 'check';
        // Odškrtávacie tlačidlo len tam, kde sa odškrtáva. Inde je to značka
        // stavu — klikanie na ňu by sľubovalo niečo, čo sa nestane.
        const mark = r.canTick
          ? `<button class="btn btn-ghost btn-sm" style="padding:2px 4px;color:${color};"
               title="Odškrtnúť" onclick="Sub.toggleCheck('${a.id}','${r.key}')">${Icon(ico, 17)}</button>`
          : `<span style="padding:2px 4px;color:${color};line-height:1;">${Icon(ico, 17)}</span>`;
        return `<div class="list-row" style="align-items:flex-start;cursor:default;">
          ${mark}
          <span style="flex:1;font-size:13px;min-width:0;">
            <strong style="${r.state !== 'open' ? 'text-decoration:line-through;opacity:.55;' : ''}">${
              UI.esc(r.title)}</strong>
            ${r.required ? '' : UI.badge('nepovinné', 'gray')}
            ${r.state === 'waived' ? UI.badge('výnimka', 'amber') : ''}
            ${r.canTick ? UI.badge('odškrtáva človek', 'blue') : ''}
            <span style="display:block;color:var(--ink-mute);font-size:12px;">${UI.esc(r.detail)}</span>
          </span>
          <button class="icon-btn" title="Prečo to tu je" style="flex:0 0 auto;"
            onclick="Sub.whyCheck('${r.key}')">?</button>
        </div>`;
      };

      return `<div class="form-section">Pred nasadením · ${UI.esc(w?.full_name || '')}
          <span style="float:right;font-family:inherit;letter-spacing:0;text-transform:none;
            color:${p.blocking ? 'var(--red)' : 'var(--green)'};">${p.done}/${p.total}</span></div>
        <div style="font-size:13px;margin:0 0 6px;color:${p.blocking ? 'var(--red)' : 'var(--ink-sub)'};">
          ${UI.esc(DanubraChecks.sentence(rows))}</div>
        ${rows.map(row).join('')}`;
    },

    /**
     * Prečo je ten bod v checkliste. Text je v `lib/staffing/checks.js`, teda
     * na jedinom mieste — nie v registri vysvetliviek, kde by sa pri zmene
     * pravidla musel opraviť druhýkrát.
     */
    whyCheck(key) {
      const c = DanubraChecks.CHECKS.find(x => x.key === key);
      if (!c) return;
      const kde = {
        doc: 'Číta sa z kartotéky živnostníka — z dokladov a ich platnosti.',
        subcontract: 'Číta sa zo zákazky.',
        stay: 'Číta sa z pobytov, teda z toho, koho si zapísal na ubytovanie.',
        transport: 'Číta sa zo zákazky, zo sekcie Doprava.',
        manual: 'Toto appka vedieť nemôže, preto sa odškrtáva rukou.',
      }[c.source];
      UI.modal(c.title, `
        <p style="margin:0 0 10px;font-size:14px;line-height:1.6;">${UI.esc(c.why)}</p>
        <div class="regimebox" style="margin:0;">${UI.esc(kde)}${
        c.required ? '' : ' Tento bod nástup <strong>neblokuje</strong>.'}</div>
        <div class="modal-actions">
          <button class="btn btn-primary" onclick="UI.closeModal()">Rozumiem</button>
        </div>`);
    },

    /**
     * Odškrtne ručný bod. Riadok sa zakladá až pri prvom kliknutí — zakladať
     * ho pri nasadení by znamenalo deväť riadkov, z ktorých osem appka
     * aj tak vie sama.
     */
    async toggleCheck(assignmentId, key) {
      if (!DanubraChecks.MANUAL.includes(key)) {
        return UI.toast('Toto sa neodškrtáva — appka to vie sama', 'err');
      }
      const have = this.assignmentChecks.find(x =>
        x.assignment_id === assignmentId && x.rule_key === key);
      const on = !(have && have.done);
      const patch = { done: on, done_at: on ? new Date().toISOString() : null };

      const { error } = have
        ? await DB.update('assignment_checks', have.id, patch)
        : await DB.insert('assignment_checks', {
          assignment_id: assignmentId, rule_key: key, required: true, ...patch });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');

      const ch = await DB.list('assignment_checks', { limit: 3000 });
      this.assignmentChecks = ch.data || this.assignmentChecks;
      if (this._cur) this.detail(this._cur.id);
    },

    async saveAsg(scId) {
      const d = UI.formData(document.getElementById('asg-form'));

      // Databáza to odmietne aj tak (trigger z migrácie 033). Zastaviť to už
      // tu má jediný dôvod: povedať to slovami, ktoré niečo znamenajú, a mať
      // pri tom po ruke tlačidlo na výnimku.
      const r = this.asgReadiness(scId, d.worker_id, d.date_from);
      if (r) {
        const v = Shell.evaluate([...r.ready.reasons, ...r.ready.warnings],
          this.overridesOf(d.worker_id), d.date_from || undefined);
        if (!v.ok) {
          return UI.toast(`Bez platných dokladov to nepustím: ${
            v.open.map(x => x.label).join(', ')}`, 'err');
        }
      }

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

      // Checklist sa už nezakladá. Predtým sa pri každom nasadení vložilo
      // deväť riadkov s voľným textom z nastavení — a osem z nich appka vie
      // sama z dokladov, zákazky a pobytov. Zostal jeden ručný bod a ten
      // vznikne až pri prvom odškrtnutí; dovtedy nemá čo zapisovať.
      UI.toast('Pracovník nasadený', 'ok');
      await this.load(); this.detail(scId);
    },

    /**
     * Infolist na stavbu. Otvorí sa pre konkrétne nasadenie, lebo adresa je
     * zo zákazky, termín z nasadenia a ubytovanie z toho, kde ten človek býva.
     *
     * Keď nejaký údaj chýba, dokument sa aj tak otvorí — ale je v ňom
     * napísané, čo chýba, a appka to povie ešte pred odoslaním. Zistiť to
     * v kancelárii je lacnejšie než v pondelok ráno pred bránou.
     */
    async siteSheet(asgId) {
      const a = this.assignments.find(x => x.id === asgId);
      if (!a) return UI.toast('Nasadenie sa nenašlo.', 'err');
      const sc = this.items.find(x => x.id === a.subcontract_id);
      const worker = this.workerOf(a.worker_id);
      const partner = (this.partners || []).find(p => p.id === (sc || {}).partner_id) || null;

      // Ubytovanie: kde ten človek na tejto zákazke býva. Keď pobyt nie je
      // zapísaný, vezme sa ubytovanie zákazky — je to lepší odhad než nič,
      // ale nevymýšľa sa: keď nie je ani to, infolist to povie.
      const lod = (this.lodging || []).filter(l => l.subcontract_id === a.subcontract_id);
      const mine = (this.stays || []).find(st => st.worker_id === a.worker_id
        && lod.some(l => l.id === st.lodging_id));
      const lodging = mine ? lod.find(l => l.id === mine.lodging_id) : (lod[0] || null);

      if (!Danubra.supplierReady('Infolist na stavbu')) return;
      const supplier = Danubra.supplier();
      const state = DanubraSiteSheet.check({
        worker, assignment: a, subcontract: sc || {}, partner, lodging });
      if (!state.ready) UI.toast(DanubraSiteSheet.sentence(state), 'err');

      const html = DanubraPapers.siteSheet({
        worker, assignment: a, subcontract: sc || {}, partner, lodging, supplier,
        trade: (sc || {}).trade || null, state,
      });
      const w = window.open('', '_blank');
      if (!w) return UI.toast('Povoľ vyskakovacie okná pre zobrazenie dokumentu', 'err');
      w.document.open(); w.document.write(html); w.document.close();
    },

    async delAsg(id) {
      const a = this.assignments.find(x => x.id === id);
      if (!await UI.confirm('Zrušiť toto nasadenie?')) return;
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
            ${UI.field('partner_id', 'Odberateľ', { value: sc.partner_id, add: 'partner', options: [['', '— vyber —'], ...this.partners.map(p => [p.id, p.name])] })}
            ${UI.field('work_type', 'Typ prác', { value: sc.work_type || 'workshop', options: WORK_TYPE,
              hint: 'Stavba znamená A1, SOKA-BAU, Bau-Mindestlohn a zrážku §48b. '
                + 'Dielňa nič z toho — preto sa to nedá prepnúť „aby to prešlo".' })}
            ${UI.field('trade', 'Remeslo', { value: sc.trade })}
            ${UI.field('date_from', 'Od', { type: 'date', value: sc.date_from })}
            ${UI.field('date_to', 'Do', { type: 'date', value: sc.date_to })}
          </div>
          <div class="form-section">Miesto výkonu</div>
          <div class="form-grid">
            ${UI.field('site_name', 'Názov stavby / dielne', { value: sc.site_name })}
            ${UI.field('site_city', 'Mesto', { value: sc.site_city })}
            ${UI.field('site_address', 'Adresa', { value: sc.site_address })}
            ${UI.field('map_link', 'Odkaz z máp', {
              value: DanubraGeo.valid(Number(sc.lat), Number(sc.lng))
                ? DanubraGeo.format(sc.lat, sc.lng) : '',
              placeholder: 'vlož odkaz — vytiahnem z neho polohu' })}
            ${UI.field('site_postal_code', 'PSČ', { value: sc.site_postal_code })}
          </div>
          <div class="form-section">Odmena</div>
          <div class="form-grid">
            ${UI.field('billing_model', 'Model', { value: sc.billing_model || 'hourly', options: BILLING })}
            ${UI.field('charge_rate', 'Sadzba €/h alebo €/jednotku', { type: 'number',
              value: sc.charge_rate,
              hint: 'Podľa modelu vyššie: pri hodinovom je to €/h, pri jednotkovom '
                + 'cena za jednotku.' })}
            ${UI.field('unit_label', 'Jednotka', { value: sc.unit_label, placeholder: 'm², kus…' })}
            ${UI.field('fixed_price', 'Pevná cena €', { type: 'number', value: sc.fixed_price })}
          </div>
          ${UI.field('scope', 'Definícia diela', { type: 'textarea', rows: 3, value: sc.scope,
            placeholder: 'Konkrétny výsledok — napr. „Montáž sadrokartónových priečok, 800 m², vrátane tmelenia"' })}
          <div class="regimebox">Werkvertrag musí definovať <strong>výsledok</strong>, nie odpracované hodiny.
          Čím konkrétnejší popis diela, tým silnejší dôkaz pri kontrole.</div>
          <div class="chk-row">
            ${UI.field('freistellung_verified', '', { type: 'checkbox', value: sc.freistellung_verified,
              placeholder: 'Odberateľ overil našu §48b',
              hint: 'Keď nie je zaškrtnuté, z každej faktúry na tejto zákazke sa '
                + 'zrazí 15 % a odvedie ich odberateľ nemeckému úradu. Zaškrtni len '
                + 'vtedy, keď Freistellungsbescheinigung naozaj máme a odberateľ si ju overil.' })}
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

      // Pole na odkaz nie je stĺpec v databáze — vytiahne sa z neho poloha
      // a samo sa nikam neukladá. Prázdne pole polohu nemaže; na to je
      // „Doplniť polohu" priamo na obrazovke.
      const link = payload.map_link;
      delete payload.map_link;
      if (String(link || '').trim()) {
        const c = DanubraGeo.parseCoords(link);
        if (!c) return UI.toast('V tom odkaze som súradnice nenašiel. '
          + 'Skrátené odkazy (maps.app.goo.gl) ich neobsahujú.', 'err');
        payload.lat = c.lat; payload.lng = c.lng;
      }

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
      if (!await UI.confirm('Zmazať túto zákazku aj s nasadeniami?')) return;
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
          note: pv.marginPct != null ? `${UI.pct(pv.marginPct)} z fakturovanej sumy` : '' })}

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
      const reason = await UI.ask('Prečo sa obdobie otvára späť?\n\n'
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
            ${UI.field('crew_id', 'Partia', { value: '', required: true, add: 'crew',
              options: [['', '— vyber —'], ...active.map(c => [c.id, c.name])] })}
            ${UI.field('date_from', 'Od', { type: 'date',
              value: sc?.date_from || new Date().toISOString().slice(0, 10),
              hint: 'Doklady sa posudzujú k tomuto dňu, nie k dnešku. Kto nastupuje '
                + 'o tri týždne a A1 mu príde o týždeň, prejde.' })}
            ${UI.field('date_to', 'Do', { type: 'date', value: sc?.date_to || '' })}
            ${UI.field('charge_rate', 'Fakturujeme €/h', { type: 'number', value: sc?.charge_rate ?? '',
              hint: 'Prázdne znamená sadzbu zo zákazky.' })}
            ${UI.field('worker_rate', 'Živnostníkom €/h', { type: 'number', value: '',
              placeholder: 'prázdne = sadzba z kartotéky',
              hint: 'Platí pre celú partiu naraz. Komu treba inú, oprav mu ju potom '
                + 'v jeho nasadení.' })}
            ${UI.field('overhead', 'Réžia €/h', { type: 'number', value: 0,
              hint: 'Ubytovanie a doprava prepočítané na hodinu. Na nule vyjde marža '
                + 'vyššia, než aká naozaj je.' })}
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

      // Funkcia vracia {deployed, already, skipped[]} — jeden človek bez
      // dokladov nezhodí celú partiu, ale musí byť vidieť, že na stavbu
      // nejde. Tiché preskočenie by bola tá najhoršia možnosť: partia by
      // odišla o jedného menšia a nikto by nevedel prečo.
      const res = data || {};
      const n = Number(res.deployed || 0);
      const skipped = Array.isArray(res.skipped) ? res.skipped : [];
      this.loaded = false; await this.load(); this.detail(scId);

      if (skipped.length) {
        const list = skipped.map(s => `<li><b>${UI.esc(s.name)}</b> — ${
          (Array.isArray(s.labels) ? s.labels : []).map(UI.esc).join(', ')
            .replace(/Nasadenie /g, '') || 'chýbajú doklady'}</li>`).join('');
        UI.modal('Nasadení nie všetci', `
          <p style="margin:0 0 10px;font-size:14px;">
            Nasadených <strong>${n}</strong>, ${
            skipped.length === 1 ? 'jeden zostal' : `${skipped.length} zostali`}
            na doklade.</p>
          <ul style="margin:0 0 12px;padding-left:20px;font-size:13px;line-height:1.7;">${list}</ul>
          <div class="regimebox" style="margin:0;">Doklad sa dá doplniť v kartotéke
            živnostníka. Ak to nejde počkať, <strong>výnimku pri nasadení môže
            zapísať administrátor</strong> — zostane v histórii s dôvodom.</div>
          <div class="modal-actions">
            <button class="btn btn-primary" onclick="UI.closeModal()">Rozumiem</button>
          </div>`, { wide: true });
        return;
      }

      UI.toast(n
        ? `Nasadených ${n} ${DanubraPeriods.plural(n, 'človek', 'ľudia', 'ľudí')}`
        : 'Všetci členovia partie už na zákazke boli', n ? 'ok' : '');
    },
  });

  window.Sub = Sub;
  Danubra.views.subcontracts = function (el) { return Sub.view(el); };
})();
