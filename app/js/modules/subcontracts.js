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
    /** Stav zákazky slovom — aj pre iné obrazovky (odberateľ). */
    statusLabel(k) { const s = STATUS.find(x => x[0] === k); return s ? s[1] : (k || ''); },
    items: [], partners: [], assignments: [], workers: [], workerDocs: [], compliance: [], timesheets: [], checklist: [], lodging: [], accommodations: [], invoices: [],
    periods: [], crews: [], stays: [], occupancy: [], overrides: [],
    assignmentChecks: [], extensions: [],
    loaded: false,
    _cur: null,

    // Zákazka je obrazovka, nie okno — je na nej mapa, ubytovania, ľudia,
    // obdobia aj compliance. Dá sa na ňu odkázať cez `#/subcontracts/<id>`.
    openId: null,

    // ── Dvojklik = jeden zápis ────────────────────────────────────────────
    // „Nasadiť", „Nastúpil", „Ubytovať", „Nasadiť partiu" zapisovali pri
    // dvojkliku dvakrát (dve nasadenia toho istého človeka, dva pobyty).
    // Kým beží jeden zápis s daným kľúčom, ďalší sa nespustí.
    _busy: {},
    async _once(key, fn) {
      if (this._busy[key]) return undefined;
      this._busy[key] = true;
      try { return await fn(); } finally { this._busy[key] = false; }
    },

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
      // Pre sedem krokov: z dopytu počet ľudí, zmluva s Nemcom a objednávky.
      // Keď niektorá tabuľka nie je dostupná (právo), krok len nepovie viac.
      const [op, con, wo, ext] = await Promise.all([
        DB.list('opportunities', { select: 'id,title,company_name,subcontract_id,headcount,status,trade_key', limit: 1000 }),
        DB.list('contracts', { select: 'id,contract_number,title,status,signed_at,partner_id,kind', limit: 1000 }),
        DB.list('work_orders', { select: 'id,kind,status,order_number,their_ref,subcontract_id,assignment_id,worker_id', limit: 3000 }),
        // Záznamy o predĺžení / zmene konca nasadení a zákaziek (migrácia 074).
        DB.list('assignment_extensions', { order: { column: 'created_at', ascending: false }, limit: 3000 }),
      ]);
      this.extensions = (ext && ext.data) || [];
      this.opportunities = (op && op.data) || [];
      this.contracts = (con && con.data) || [];
      this.workOrders = (wo && wo.data) || [];
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
    // Zákazka nemusí mať zapísaný druh práce. Dovtedy sa v karte vypísalo
    // doslova „undefined" — appka má vtedy mlčať, nie hovoriť po anglicky.
    typeLabel(t) { const x = WORK_TYPE.find(y => y[0] === t); return x ? x[1] : ''; },

    /**
     * Koľko podmienok zákazka nespĺňa, po slovensky.
     *
     * Dovtedy tu stálo „3 blokátorov" — slovo, ktoré v tejto firme nikto
     * nepoužíva, a k tomu v zlom tvare. Je to podmienka: A1, hlásenie Zoll,
     * SOKA-BAU, USt-IdNr odberateľa.
     */
    chybaText(n) {
      return `nespĺňa ${n} ${Shell.plural(n, 'podmienku', 'podmienky', 'podmienok')}`;
    },

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

    /**
     * Čo spraviť teraz na **zozname** zákaziek. Na otvorenej zákazke hovorí
     * vetu jej vlastný reťazec (`nowHtml`); tu ide o to, **ktorá zo zákaziek**
     * je na rade.
     *
     * Predtým tu bol červený pruh „n zákaziek nespĺňa podmienky vyslania" —
     * a človek musel sám hľadať, ktorá to je. Dnes je v nej meno a tlačidlo
     * ju otvorí.
     */
    nowListHtml(active) {
      const vety = (active || []).map((x) => {
        const job = this.jobSteps(x);
        const n = DanubraJob.next(job, x);
        if (!n.key) return null;
        // Nadpis je **čo spraviť**, nie ako sa volá krok.
        return {
          key: n.key, hot: n.state === 'bad', why: n.lead,
          title: n.text,
          what: `Krok ${n.n} zo 7 · ${n.title} — ${x.title || x.contract_number || 'zákazka'}`,
          id: x.id,
        };
      }).filter(Boolean);
      const n = DanubraNow.pick(vety) || {
        key: 'ok',
        title: active && active.length ? 'Zákazky bežia' : 'Žiadna zákazka nebeží',
        what: active && active.length
          ? `${active.length} ${Shell.plural(active.length, 'zákazka nemá', 'zákazky nemajú', 'zákaziek nemá')} nič otvorené.`
          : 'Zákazka vzniká z dopytu alebo z ponuky.',
        why: 'Všetko sa rieši na konkrétnej zákazke — má sedem krokov od dopytu po faktúru.',
        hot: false,
      };
      return Shell.now(n, {
        help: 'card.sub.list',
        action: n.id
          ? { label: 'Otvoriť zákazku', ico: 'site', onclick: `Sub.detail('${n.id}')` }
          : { label: 'Nová zákazka', ico: 'plus', onclick: 'Sub.form()' },
      });
    },

    async view(el) {
      Danubra.setActions(`<button class="btn btn-primary btn-sm" onclick="Sub.form()">${Icon('plus')} Nová zákazka</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      if (this.openId) return this.profile(el, this.openId);

      const active = this.items.filter(x => x.status === 'active');
      const deployed = this.assignments.filter(a => a.status === 'active').length;
      const today = Danubra._dayISO();
      const rows = this.items.map(sc => this.listRow(sc, today));

      // Zoznam je spoločný komponent (`DataList`): lišta filtrov, čipy toho,
      // čo je zapnuté, a riadky po stĺpcoch. Dovtedy tu boli pilulky stavov,
      // jeden výber a karty v troch stĺpcoch — filtrovať sa dalo len podľa
      // stavu a druhu práce a nebolo vidieť, ktorá zákazka horí.
      el.innerHTML = Danubra.header(Danubra.labelOf('subcontracts'),
        `${this.items.length} celkom · ${active.length} prebieha · ${deployed} ľudí nasadených`) +
        this.nowListHtml(active) +
        DataList.html(this.listConfig(rows));
    },

    /** Stavy, s ktorými sa ešte pracuje — predvolený filter zoznamu. */
    OPEN_STATUSES: ['draft', 'negotiation', 'won', 'active'],

    /**
     * Riadok zoznamu: zákazka a to, čo sa o nej počíta raz za vykreslenie
     * (krok, podmienky, ľudia). Výpočty sú tie isté ako v detaile zákazky
     * (`jobSteps`, `DanubraJob.next`, `check`) — zoznam len ukazuje ich výsledok.
     */
    listRow(sc, today) {
      const p = this.partnerOf(sc.partner_id);
      const chk = this.check(sc);
      const job = this.jobSteps(sc);
      const nx = DanubraJob.next(job, sc);
      const lud = job.find(s => s.key === 'ludia') || {};
      const closed = ['completed', 'lost', 'cancelled'].includes(sc.status);
      const running = ['won', 'active'].includes(sc.status);
      const left = sc.date_to ? DanubraDataList.daysBetween(today, String(sc.date_to).slice(0, 10)) : null;
      const toStart = sc.date_from ? DanubraDataList.daysBetween(today, String(sc.date_from).slice(0, 10)) : null;
      const late = sc.status === 'active' && left != null && left < 0;
      const hot = nx.state === 'bad';
      return {
        id: sc.id, sc, chk, nx, closed, late, hot,
        // „Horí": ľudia na stavbe bez papierov alebo faktúra po splatnosti
        // (krok v stave „bad"), získaná/bežiaca zákazka, ktorá nespĺňa
        // podmienky vyslania, alebo bežiaca zákazka po svojom termíne.
        problem: hot || (running && !chk.ok) || late,
        title: sc.title || sc.contract_number || 'Zákazka',
        partner: p ? p.name : '', partnerId: p ? p.id : null,
        city: sc.site_city || '',
        people: Number(lud.count) || 0, need: lud.need || null,
        left, toStart,
        step: nx.key ? nx.n : null,
        missing: nx.key ? String(nx.text || '').split(' — ')[0].replace(/\.$/, '') : '',
      };
    },

    /** Konfigurácia zoznamu zákaziek pre `DataList`. */
    listConfig(rows) {
      const L = DanubraDataList;
      const statusIdx = (k) => { const i = STATUS.findIndex(s => s[0] === k); return i < 0 ? 99 : i; };
      const shortType = { construction: 'Stavba', workshop: 'Dielňa' };
      const rate = (n) => `${Number(n).toLocaleString('sk-SK', { maximumFractionDigits: 2 })} €/h`;
      const dni = (n) => `${n} ${Shell.plural(n, 'deň', 'dni', 'dní')}`;

      const when = (r) => {
        if (r.closed) return '';
        if (r.late) return `<span class="dl-note is-red">termín uplynul pred ${dni(-r.left)}</span>`;
        if (r.left === 0) return '<span class="dl-note is-amber">končí dnes</span>';
        if (r.left != null && r.left > 0 && r.left <= 30) {
          return `<span class="dl-note ${r.left <= 7 ? 'is-amber' : 'is-mute'}">končí o ${dni(r.left)}</span>`;
        }
        if (r.toStart != null && r.toStart > 0 && r.toStart <= 30) return `<span class="dl-note is-mute">začína o ${dni(r.toStart)}</span>`;
        return '';
      };
      const stepCell = (r) => {
        if (r.nx.closed) return '<span class="dl-note is-mute">Zákazka je uzavretá</span>';
        if (r.nx.done) return `<span class="dl-ok">${Icon('check', 13)} Všetko hotové</span>`;
        if (!r.nx.key) return '<span class="dl-note is-mute">Beží, nič netreba</span>';
        return `<span class="dl-two sc-step" title="${UI.esc(r.nx.text || '')}">
          <b>${r.nx.n}/7 · ${UI.esc(r.nx.title)}</b>
          <span class="dl-note ${r.hot ? 'is-red' : 'is-amber'}">${UI.esc(r.missing)}</span></span>`;
      };
      const condCell = (r) => {
        if (r.closed) return '';
        const c = r.chk;
        if (!c.ok) {
          const why = c.blockers.map(b => b.label).filter(Boolean).join(' · ');
          return `<button type="button" class="tip-btn dl-flag" data-tip="${UI.esc(why || 'Podmienky vyslania nie sú splnené.')}"
            aria-label="${UI.esc(this.chybaText(c.blockers.length))}: ${UI.esc(why)}">${Icon('alert', 12)} nespĺňa ${c.blockers.length}</button>`;
        }
        if (c.warnings.length) {
          const why = c.warnings.map(w => w.label).filter(Boolean).join(' · ');
          return `<button type="button" class="tip-btn dl-flag is-amber" data-tip="${UI.esc(why)}"
            aria-label="Upozornenia: ${UI.esc(why)}">${c.warnings.length} ${Shell.plural(c.warnings.length, 'upozornenie', 'upozornenia', 'upozornení')}</button>`;
        }
        return `<span class="dl-ok">${Icon('check', 13)} spĺňa</span>`;
      };

      return {
        id: 'zakazky', storageKey: 'zakazky', label: 'Zákazky',
        noun: ['zákazka', 'zákazky', 'zákaziek'],
        rows,
        rowClick: (r) => Sub.detail(r.id),
        rowClass: (r) => (r.hot ? 'is-hot' : r.problem ? 'is-warn' : r.closed ? 'is-muted' : ''),
        rowLabel: (r) => `Zákazka ${r.title}`,
        rowActions: [{ ico: 'chevron', label: 'Otvoriť zákazku', run: (r) => Sub.detail(r.id) }],
        columns: [
          { key: 'zakazka', label: 'Zákazka', width: 'minmax(170px, 1.7fr)', mobile: 'title',
            render: (r) => `<span class="dl-title"><b>${UI.esc(r.title)}</b>${
              r.sc.contract_number || r.city ? `<small>${[r.sc.contract_number, r.city].filter(Boolean).map(UI.esc).join(' · ')}</small>` : ''}</span>`,
            sortValue: (r) => r.title, sortLabel: 'Názov' },
          { key: 'odberatel', label: 'Odberateľ', width: 'minmax(124px, 1fr)',
            render: (r) => (r.partnerId ? Danubra.link('partner', r.partnerId, r.partner) : ''),
            sortValue: (r) => r.partner },
          { key: 'stav', label: 'Stav', width: '88px', mobile: 'badge',
            render: (r) => this.badge(r.sc.status), sortValue: (r) => statusIdx(r.sc.status) },
          { key: 'typ', label: 'Typ prác', width: '84px', hideBelow: 1000,
            render: (r) => (shortType[r.sc.work_type]
              ? `<span class="dl-tag" title="${UI.esc(this.typeLabel(r.sc.work_type))}">${Icon(r.sc.work_type === 'construction' ? 'site' : 'wrench', 14)}${shortType[r.sc.work_type]}</span>` : ''),
            sortValue: (r) => this.typeLabel(r.sc.work_type) },
          // Ľudia a sadzba v jednom stĺpci: dva krátke čísla vedľa seba by
          // zobrali miesto názvu zákazky a vete, čo chýba.
          { key: 'ludia', label: 'Ľudia', width: '76px', mobileLabel: 'Ľudia',
            tip: 'Hore nasadení / koľko treba (z dopytu), dole sadzba pre odberateľa za hodinu.',
            render: (r) => `<span class="dl-two"><span class="dl-num" title="Nasadených ${r.people}${
              r.need ? ` z ${r.need} potrebných` : ''}"><b${r.need && r.people < r.need ? ' class="is-short"' : ''}>${
              r.people}</b>${r.need ? ` / ${r.need}` : ''}</span>${
              Number(r.sc.charge_rate) ? `<small class="dl-num">${rate(r.sc.charge_rate)}</small>` : ''}</span>`,
            sortValue: (r) => r.people, sortDir: -1, sortLabel: 'Počet ľudí' },
          { key: 'obdobie', label: 'Obdobie', width: '150px',
            render: (r) => {
              const t = L.rangeText(r.sc.date_from, r.sc.date_to);
              return t ? `<span class="dl-two is-wrap"><b>${t}</b>${when(r)}</span>` : '';
            },
            sortValue: (r) => r.sc.date_from, sortLabel: 'Začiatok' },
          { key: 'krok', label: 'Krok · čo chýba', width: 'minmax(160px, 1.5fr)', mobile: 'line',
            tip: 'Krok zo siedmich, ktorý je na rade, a čo v ňom chýba. Červené horí: ľudia sú na stavbe bez papierov alebo je faktúra po splatnosti.',
            render: stepCell,
            // Čo horí hore, potom čo má problém, potom podľa kroku; uzavreté na koniec.
            sortValue: (r) => [r.closed ? 1 : 0, r.hot ? 0 : 1, r.problem ? 0 : 1, r.step || 8, r.title],
            sortLabel: 'Čo horí (krok)' },
          { key: 'podmienky', label: 'Podmienky', width: '98px',
            tip: 'Podmienky vyslania: A1, hlásenie Zoll, SOKA-BAU, USt-IdNr odberateľa. Ukážte myšou na štítok — povie, čo chýba.',
            render: condCell, sortValue: (r) => (r.closed ? null : r.chk.ok ? 0 : r.chk.blockers.length), sortDir: -1 },
        ],
        sorts: [
          { key: 'koniec', label: 'Koniec', value: (r) => r.sc.date_to },
          { key: 'sadzba', label: 'Sadzba', value: (r) => Number(r.sc.charge_rate) || null, dir: -1 },
        ],
        sort: { key: 'krok', dir: 1 },
        groups: [{ key: 'stav', label: 'Stav', value: (r) => r.sc.status, labelOf: (k) => this.statusLabel(k),
          tone: (k) => ({ draft: 'gray', negotiation: 'amber', won: 'blue', active: 'green', completed: 'gray', lost: 'red', cancelled: 'red' }[k] || 'gray'),
          order: STATUS.map(s => s[0]) }],
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať zákazku…', label: 'Hľadať názov, číslo, mesto alebo odberateľa',
            fields: ['title', 'sc.contract_number', 'city', 'partner', 'sc.site_name', 'sc.trade'] },
          { key: 'stav', type: 'multi', label: 'Stav', value: (r) => r.sc.status, default: this.OPEN_STATUSES,
            options: STATUS.map(s => [s[0], s[1]]), sortOptions: false, allLabel: 'Všetky',
            presets: [
              { label: 'Otvorené', value: this.OPEN_STATUSES, hint: 'Príprava, Rokovanie, Získaná a Prebieha — bez ukončených, prehratých a zrušených' },
              { label: 'Bežiace', value: ['won', 'active'], hint: 'Získaná a Prebieha' },
            ] },
          { key: 'odberatel', type: 'select', label: 'Odberateľ', value: (r) => r.partnerId,
            optionLabel: (v, r) => (r ? r.partner : v), emptyLabel: 'Bez odberateľa', allLabel: 'Všetci odberatelia' },
          { key: 'typ', type: 'select', label: 'Typ prác', value: (r) => r.sc.work_type,
            options: [['construction', 'Stavba'], ['workshop', 'Dielňa']], emptyLabel: 'Nezadané', allLabel: 'Stavba aj dielňa' },
          { key: 'problem', type: 'toggle', label: 'Len s problémom', test: (r) => r.problem,
            hint: 'Zákazky, kde niečo horí: ľudia na stavbe bez papierov, faktúra po splatnosti, získaná alebo bežiaca zákazka, ktorá nespĺňa podmienky vyslania, alebo bežiaca zákazka po termíne.' },
          { key: 'mesto', type: 'select', label: 'Mesto', value: 'city', allLabel: 'Všetky mestá', more: true },
          { key: 'krok', type: 'multi', label: 'Krok', more: true, value: (r) => (r.step ? String(r.step) : ''),
            options: DanubraJob.STEPS.map(s => [String(s.n), `${s.n}. ${s.title}`]), sortOptions: false,
            emptyLabel: 'Bez otvoreného kroku' },
          { key: 'obdobie', type: 'range-date', label: 'Obdobie', more: true, start: 'sc.date_from', end: 'sc.date_to',
            hint: 'Zákazky, ktoré v zvolenom období bežia aspoň jeden deň. Zákazka bez dátumov sa neukáže.' },
        ],
        empty: { ico: 'site', title: 'Žiadne zákazky', sub: 'Začnite dielenskou zákazkou — má najnižšiu reguláciu.',
          cta: `<button class="btn btn-primary" onclick="Sub.form()">${Icon('plus')} Nová zákazka</button>` },
        export: {
          name: ['zakazky'],
          columns: [
            ['Zákazka', r => r.title], ['Číslo', r => r.sc.contract_number], ['Odberateľ', r => r.partner],
            ['Stav', r => this.statusLabel(r.sc.status)], ['Typ prác', r => this.typeLabel(r.sc.work_type)],
            ['Mesto', r => r.city], ['Nasadení', r => r.people], ['Potrebných', r => r.need],
            ['Sadzba €/h', r => r.sc.charge_rate], ['Od', r => r.sc.date_from], ['Do', r => r.sc.date_to],
            ['Krok', r => (r.step ? `${r.step}/7 ${r.nx.title}` : '')], ['Čo chýba', r => r.nx.text || ''],
            ['Podmienky', r => (r.closed ? '' : r.chk.ok ? 'spĺňa' : this.chybaText(r.chk.blockers.length))],
          ],
        },
      };
    },

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
      if (this.openId !== id) this.step = undefined;
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
          accommodation_monthly: a.accommodation_monthly,
          transport_monthly: a.transport_monthly,
        }, { hours: 160, workDays: 21, workType: sc.work_type,
             freistellungOk: sc.freistellung_verified
               || DanubraCompliance.freistellung(this.companyItems(), Danubra._dayISO()).ok }, Danubra.cfg('staffing'));
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
        <div class="list-row" style="align-items:flex-start;">
          <span class="dot ${sev(i.severity)}" style="margin-top:5px;"></span>
          <span style="flex:1;font-size:13px;">
            <strong>${UI.esc(i.label)}</strong>
            ${i.detail ? `<span style="color:var(--ink-mute);display:block;font-size:12px;">${UI.esc(i.detail)}</span>` : ''}
            ${i.fix ? `<span style="color:var(--blue);display:block;font-size:12px;">→ ${UI.esc(i.fix)}</span>` : ''}
          </span>
        </div>`).join('')
        : `<div style="color:var(--green);font-size:13px;font-weight:600;">${Icon('check', 14)} Všetko v poriadku — zákazka je pripravená.</div>`;

      // ── Sedem krokov ──────────────────────────────────────────────────────
      // „Celé je to také neprehľadné." Detail mal šesť záložiek a pod nimi
      // zoznamy; čo treba spraviť, sa človek dozvedel až keď ich preklikal.
      // Teraz je zákazka **sedem krokov pod sebou** v poradí, v akom sa robia.
      // Pri každom je jedna veta, čo chýba, a otvorí sa ten, ktorý je na rade.
      const job = this.jobSteps(sc);
      const nxt = DanubraJob.next(job, sc);
      const open = this.step === undefined ? (nxt.key || null) : this.step;
      this._openNow = open;
      const pr = DanubraJob.progress(job);
      const ctx = { sc, p, asg, chk, eco, port, complianceHtml, rows, job };

      const stepHtml = (s) => {
        const on = s.key === open;
        const ikona = s.done ? Icon('check', 16) : s.state === 'bad' ? '!' : s.n;
        return `<section class="js-step st-${s.state}${on ? ' is-open' : ''}${s.key === nxt.key ? ' is-next' : ''}" id="js-${s.key}">
          <button class="js-head" aria-expanded="${on}" onclick="Sub.openStep('${s.key}')">
            <span class="js-n">${ikona}</span>
            <span class="js-main">
              <b>${s.n}. ${UI.esc(s.title)}</b>
              <span class="js-detail">${UI.esc(s.detail || s.lead)}</span>
            </span>
            <span class="js-chev">${Icon('chevron', 16)}</span>
          </button>
          ${on ? `<div class="js-body">
            ${s.todo && s.key !== nxt.key ? `<div class="js-todo${s.state === 'bad' ? ' is-bad' : ''}">${Icon(s.state === 'bad' ? 'alert' : 'chevron', 14)}
              <span>${UI.esc(s.todo)}</span></div>` : ''}
            ${this.stepBody(s.key, ctx)}
          </div>` : ''}
        </section>`;
      };

      const body = `
        <div class="detail-head">
          ${this.badge(sc.status)}
          <span class="mono" style="font-size:11px;color:var(--ink-mute);letter-spacing:.1em;">${UI.esc(sc.contract_number || '')}</span>
          <select class="verif-sel" onchange="Sub.setStatus('${sc.id}',this.value)">
            ${STATUS.map(s => `<option value="${s[0]}" ${sc.status === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('')}
          </select>
        </div>

        <div class="js-now${nxt.state === 'bad' ? ' is-bad' : nxt.key ? '' : ' is-calm'}">
          <div class="js-now-txt">
            <span>${nxt.key ? `Teraz · krok ${nxt.n} zo 7` : `Hotových ${pr.done} zo 7`}</span>
            <b>${UI.esc(nxt.text)}</b>
          </div>
          ${nxt.key && nxt.key !== open ? `<button class="btn btn-primary btn-sm" onclick="Sub.openStep('${nxt.key}')">
            Ukázať ${Icon('chevron', 14)}</button>` : ''}
        </div>

        <div class="js-list">${job.map(stepHtml).join('')}</div>

        ${window.Tsk && Tsk.slot ? Tsk.slot('subcontract', sc.id, sc.title || sc.contract_number) : ''}

        <details class="more-block js-docs"><summary>${Icon('doc', 14)} Dokumenty zákazky</summary>
          ${window.Docs ? Docs.slot('subcontract', sc.id, { empty: 'Zatiaľ žiadne. Infolisty, objednávky a faktúry tejto zákazky sa sem uložia, keď z nich spravíte PDF.' }) : ''}
        </details>

        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px;">
          <button class="btn btn-ghost btn-sm btn-text-danger" onclick="Sub.del('${sc.id}')">${Icon('archive', 14)} Archivovať zákazku</button>
        </div>`;

      el.innerHTML = Danubra.header(sc.title,
        [p?.name, sc.site_city].filter(Boolean).map(UI.esc).join(' · '),
        '', [sc.title]) + body;

      // Mapa sa kreslí až po vložení HTML — Leaflet potrebuje prvok v strome.
      this.renderMap(sc);
    },

    /** Údaje pre sedem krokov jednej zákazky (`lib/staffing/job.js`). */
    /**
     * Kľúč prekážky pre kroky zákazky. Všetko o zmluve o dielo (chýba,
     * expirovala, nie je nahratá) patrí do piateho kroku — preto sa zlúči na
     * `missing_contract`, ktorý štvrtý krok vynecháva. Inak by sa jedna
     * zmluva hlásila dvakrát.
     */
    stepRule(r) { return r && r.kind === 'contract' ? 'missing_contract' : r.rule; },

    jobSteps(sc) {
      const asg = this.asgOf(sc.id).filter(a => a.status !== 'cancelled');
      const ids = new Set(asg.map(a => a.id));
      const missing = {};
      for (const a of asg) {
        const st = this.asgReadiness(sc.id, a.worker_id, a.date_from);
        if (!st) continue;
        missing[a.worker_id] = Shell.evaluate(st.ready.reasons,
          this.overridesOf(a.worker_id), a.date_from || undefined).open.map(this.stepRule);
      }
      const housed = asg.filter(a => this.stays.some(s => s.worker_id === a.worker_id && s.is_current
        && this.lodging.some(l => l.id === s.lodging_id && l.subcontract_id === sc.id))).length;
      return DanubraJob.steps({
        subcontract: sc,
        partner: this.partnerOf(sc.partner_id),
        opportunity: (this.opportunities || []).find(o => o.subcontract_id === sc.id) || null,
        contract: (this.contracts || []).find(c => c.id === sc.contract_id) || null,
        orders: (this.workOrders || []).filter(o => o.subcontract_id === sc.id || ids.has(o.assignment_id)),
        assignments: asg, workers: this.workers, docs: this.workerDocs, missing,
        check: this.check(sc), site: this.chain(sc), housed, today: Danubra._dayISO(),
      });
    },

    // `undefined` = otvorí sa krok, ktorý je na rade; `null` = všetky zavreté.
    step: undefined,
    openStep(k) {
      this.step = this.step === k || (this.step === undefined && this._openNow === k) ? null : k;
      Danubra.renderRoute();
      setTimeout(() => {
        const el = document.getElementById(`js-${k}`);
        if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 30);
    },

    /** Staré názvy záložiek → kroky. Volá ich „čo teraz" a vysvetlivky. */
    SEC_TO_STEP: { prehlad: 'dopyt', compliance: 'papiere', ludia: 'ludia', obdobia: 'peniaze',
      ubytovanie: 'ubytovanie', peniaze: 'peniaze' },
    setSec(k) { this.step = this.SEC_TO_STEP[k] || k; Danubra.renderRoute(); },
    scrollTo(kam) { this.openStep({ compliance: 'papiere', periods: 'peniaze' }[kam] || kam); },

    /** Čo je vnútri kroku, keď sa otvorí. */
    stepBody(key, c) {
      const { sc, p, asg, chk, eco, port, complianceHtml, rows } = c;
      // Kto na stavbe je (alebo na ňu ide). Kto odišiel, ten už papiere ani
      // objednávku nepotrebuje — v kroku 2 je vidieť zvlášť.
      const live = asg.filter(a => a.status !== 'cancelled' && a.status !== 'ended');
      const gone = asg.filter(a => a.status === 'ended');
      const b = (cls, onclick, ico, label) =>
        `<button class="btn ${cls} btn-sm" onclick="${onclick}">${Icon(ico, 14)} ${label}</button>`;
      const acts = (...x) => `<div class="js-acts">${x.filter(Boolean).join('')}</div>`;
      const mark = (ok, label) => `<span class="js-mark ${ok ? 'is-ok' : 'is-no'}">${Icon(ok ? 'check' : 'x', 12)} ${label}</span>`;
      const person = (a) => DanubraJob.person({
        assignment: a, worker: this.workerOf(a.worker_id), docs: this.workerDocs,
        orders: this.workOrders || [], today: Danubra._dayISO(),
        missing: (() => {
          const st = this.asgReadiness(sc.id, a.worker_id, a.date_from);
          return st ? Shell.evaluate(st.ready.reasons, this.overridesOf(a.worker_id),
            a.date_from || undefined).open.map(this.stepRule) : [];
        })(),
      });
      const nikto = '<div class="js-empty">Zatiaľ nikto nie je nasadený — najprv krok 2.</div>';

      if (key === 'dopyt') {
        const opp = (this.opportunities || []).find(o => o.subcontract_id === sc.id);
        return `<div class="kv">${rows.map(r => `<div><span>${r[0]}</span><strong>${UI.esc(r[1])}</strong></div>`).join('')}</div>
          ${sc.scope ? `<div class="notebox"><strong>Dielo:</strong> ${UI.esc(sc.scope)}</div>` : ''}
          <div class="link-row" style="margin-top:8px;">
            ${p ? Danubra.link('partner', p.id, p.name) : ''}
            ${sc.quote_id ? Danubra.link('quote', sc.quote_id, 'Ponuka') : ''}
            ${opp ? `<button class="link-chip" onclick="${window.Opp ? `Opp.detail('${opp.id}')` : "Danubra.go('opportunities')"}">${Icon('offers', 13)}<span>Dopyt: ${UI.esc(opp.title || opp.company_name || '')}</span></button>` : ''}
            ${DanubraGeo.valid(Number(sc.lat), Number(sc.lng))
              ? `<a class="link-chip" target="_blank" rel="noopener" href="${DanubraGeo.mapsUrl(sc.lat, sc.lng)}">${Icon('pin', 13)}<span>Poloha stavby</span></a>`
              : `<button class="link-chip" onclick="Sub.setCoords('${sc.id}')">${Icon('plus', 13)}<span>Doplniť polohu stavby</span></button>`}
          </div>
          ${this.extHistoryHtml(this.extOf(sc.id, null), 'Zmeny konca zákazky')}
          ${acts(b('btn-primary', `Sub.form('${sc.id}')`, 'edit', 'Upraviť údaje zákazky'),
            b('btn-outline', `Sub.extendSc('${sc.id}')`, 'calendar', sc.date_to ? 'Predĺžiť / zmeniť koniec' : 'Zadať koniec zákazky'))}`;
      }

      if (key === 'ludia') {
        // Nasadený = priradený na stavbu (`planned`). Nastúpil = naozaj začal
        // robiť (`active`, rovnako ako pri nasadení partie). Dovtedy jednotlivo
        // nasadený človek zostal navždy `planned` — a „Ľudia na stavbách"
        // aj kontroly na Dnes ho nevideli.
        const row = (a) => {
          const w = this.workerOf(a.worker_id);
          const ovr = DanubraOverrides.live(this.overridesOf(a.worker_id));
          const st = a.status || 'planned';
          const stav = st === 'active'
            ? UI.badge(`nastúpil${a.started_at ? ` ${UI.date(a.started_at)}` : ''}`, 'green')
            : st === 'ended' ? UI.badge(`odišiel${a.date_to ? ` ${UI.date(a.date_to)}` : ''}`, 'gray')
              : UI.badge('nasadený, ešte nenastúpil', 'amber');
          return `<div class="list-row">
            <span style="flex:1;font-size:13px;min-width:0;">
              ${Danubra.link('worker', a.worker_id, w?.full_name || '—', { inline: true })}
              ${a.role === 'predak' ? UI.badge('predák', 'blue') : ''}
              ${stav}
              ${ovr.length ? UI.badge('s výnimkou', 'amber') : ''}
              <span style="color:var(--ink-mute);display:block;font-size:12px;">
                ${a.date_from ? UI.dateRange(a.date_from, a.date_to) : ''}${a.charge_rate ? ` · ${UI.money(a.charge_rate)}/h` : ''}</span>
              ${this.extHistoryHtml(this.extOf(sc.id, a.id), 'Zmeny konca')}
            </span>
            ${st === 'planned' ? b('btn-primary', `Sub.startForm('${a.id}')`, 'check', 'Nastúpil') : ''}
            ${st !== 'ended' ? `<button class="btn btn-outline btn-sm" title="Predĺžiť alebo zmeniť koniec nasadenia — s dôvodom, zapíše sa do histórie" onclick="Sub.extendAsg('${a.id}')">${Icon('calendar', 14)} ${a.date_to ? 'Predĺžiť / zmeniť koniec' : 'Zadať koniec'}</button>` : ''}
            ${st === 'active' ? b('btn-outline', `Sub.endForm('${a.id}')`, 'logout', 'Odišiel') : ''}
            ${st !== 'ended' ? `<button class="btn btn-outline btn-sm" title="Záloha alebo platba pre neho" onclick="Sub.viaWrk('payMenu','${a.worker_id}')">${Icon('wallet', 14)} Záloha</button>` : ''}
            ${st === 'planned' ? `<button class="btn btn-ghost btn-sm btn-text-danger" title="Zrušiť nasadenie (nenastúpil)" onclick="Sub.delAsg('${a.id}')">${Icon('x', 15)}</button>` : ''}
          </div>`;
        };
        return `${live.map(row).join('') || '<div class="js-empty">Zatiaľ nikto nie je nasadený.</div>'}
          ${live.length ? `<p class="card-note">Nasadený = priradený na túto stavbu. Nastúpil = naozaj začal robiť.
            ${UI.tip('Keď človek v prvý deň naozaj príde na stavbu, kliknite pri ňom „Nastúpil". Až potom sa počíta medzi ľudí na stavbách a appka mu stráži hodiny a doklady. Keď zo stavby odíde, kliknite „Odišiel" — nič sa nezmaže, len sa zapíše posledný deň a dôvod. „Predĺžiť / zmeniť koniec" = posunie plánovaný koniec nasadenia; appka sa spýta na dôvod a zmena zostane v histórii pri človeku.')}</p>` : ''}
          ${gone.length ? `<details class="more-block"><summary>Už odišli (${gone.length})</summary>${gone.map(row).join('')}</details>` : ''}
          ${acts(b('btn-primary', `Sub.addAsg('${sc.id}')`, 'plus', 'Nasadiť človeka'),
            b('btn-outline', `Sub.assignCrewForm('${sc.id}')`, 'workers', 'Nasadiť partiu'),
            Danubra.routeAvailable('hiring') ? b('btn-outline', `Sub.hireFor('${sc.id}')`, 'zap', 'Hľadať nových ľudí') : '')}`;
      }

      if (key === 'nemec') {
        const con = (this.contracts || []).find(x => x.id === sc.contract_id);
        const ids = new Set(live.map(a => a.id));
        const od = (this.workOrders || []).filter(o => o.kind === 'customer' && o.status !== 'cancelled'
          && (o.subcontract_id === sc.id || ids.has(o.assignment_id)));
        return `<div class="js-rows">
            <div class="js-row">${mark(!!con && (!!con.signed_at || ['signed', 'active', 'completed'].includes(con.status)), 'Zmluva o dielo')}
              ${con ? Danubra.link('contract', con.id, con.contract_number || con.title || 'Zmluva') : '<em>zatiaľ nie je</em>'}</div>
            <div class="js-row">${mark(od.length > 0, 'Objednávka od odberateľa')}
              ${od.map(o => Danubra.link('order', o.id, o.their_ref || o.order_number || 'Objednávka')).join('') || '<em>nepovinné — keď ju pošle, zapíšte jej číslo</em>'}</div>
          </div>
          ${acts(!con && Danubra.routeAvailable('contracts') ? b('btn-primary', `Sub.newContract('${sc.id}')`, 'note', 'Pripraviť zmluvu o dielo') : '',
            !con && this.contractsOf(sc.partner_id).length ? b('btn-outline', `Sub.pickContract('${sc.id}')`, 'check', 'Priradiť existujúcu zmluvu') : '',
            con ? b('btn-outline', `Danubra.open('contract','${con.id}')`, 'note', 'Otvoriť zmluvu') : '',
            Danubra.routeAvailable('orders') ? b('btn-outline', `Sub.newCustomerOrder('${sc.id}')`, 'orders', 'Zapísať jeho objednávku') : '')}`;
      }

      if (key === 'papiere') {
        if (!live.length) return nikto;
        // Názov dokladu tak, ako ho volá checklist („Platné A1"), nie názov pravidla.
        const meno = (r) => ((DanubraChecks.CHECKS.find(c => c.rule === r) || {}).title
          || (window.DanubraOverrides && DanubraOverrides.meta(r)?.label) || r).replace(/^Platné /, '');
        return `<div class="js-rows">${live.map((a) => {
          const x = person(a);
          // Doklady, ktoré sú zapísané, ale nenahraté (migrácia 067). Pri
          // nasadení sa nerátajú — a vybaviť ich znamená len odfotiť papier.
          const st = this.asgReadiness(sc.id, a.worker_id, a.date_from);
          const bezSkenu = st ? st.ready.reasons.filter(r => r.rule === 'missing_scan' && r.docId
            && r.kind !== 'contract') : [];
          const gdprDoc = x.gdprBezSkenu ? this.workerDocs.find(d => d.worker_id === a.worker_id && d.kind === 'gdpr') : null;
          const chyba = x.doklady.filter(r => r !== 'missing_scan');
          return `<div class="js-row js-row-p">
            <div class="js-who">${Danubra.link('worker', a.worker_id, x.name, { inline: true })}
              ${mark(x.gdpr, x.gdprBezSkenu ? 'GDPR nie je nahratý' : 'GDPR')} ${mark(!chyba.length, chyba.length ? `chýba: ${chyba.map(meno).join(', ')}` : 'doklady')}
              ${bezSkenu.length ? mark(false, `doklad nie je nahratý: ${bezSkenu.map(r => r.label.replace(/^Nie je nahratý: /, '')).join(', ')}`) : ''}</div>
            <div class="js-row-acts">
              ${x.gdpr || x.gdprBezSkenu ? '' : b('btn-outline', `Sub.viaWrk('gdpr','${a.worker_id}')`, 'print', 'Vytlačiť GDPR')
                + b('btn-primary', `Sub.viaWrk('gdprForm','${a.worker_id}')`, 'check', 'Zapísať podpísaný')}
              ${gdprDoc ? b('btn-primary', `Sub.pickScan('${gdprDoc.id}')`, 'upload', 'Nahrať sken GDPR') : ''}
              ${bezSkenu.map(r => b('btn-primary', `Sub.pickScan('${r.docId}')`, 'upload',
                `Nahrať sken: ${UI.esc(r.label.replace(/^Nie je nahratý: /, ''))}`)).join('')}
              ${chyba.length ? b('btn-outline', `Danubra.open('worker','${a.worker_id}')`, 'plus', 'Doplniť doklad') : ''}
            </div>
          </div>`;
        }).join('')}</div>
          <div class="form-section" id="sub-compliance">Podmienky vyslania</div>
          ${complianceHtml}
          ${acts(sc.work_type === 'construction' && !sc.zoll_reported_at
              ? b('btn-primary', `Sub.markZoll('${sc.id}')`, 'check', 'Zapísať hlásenie Zoll') : '',
            b('btn-outline', `Sub.anuCheck('${sc.id}')`, 'shield', 'Test rizika ANÜ'))}
          <details class="more-block"><summary>Checklist pred nástupom (po ľuďoch)</summary>
            ${live.map(a => this.checklistHtml(sc, a)).join('')}</details>`;
      }

      if (key === 'zivnostnici') {
        if (!live.length) return nikto;
        // „Poslať všetko naraz" je tu, ale ubytovanie je až v kroku 6. Kto ho
        // poslal skôr, tomu infolist k ubytovaniu odišiel sivý — alebo vôbec.
        // Hlavné tlačidlo je preto až vtedy, keď je čo poslať.
        const lodOk = (this.lodging || []).some(l => l.subcontract_id === sc.id);
        return `${!lodOk && window.Bundle ? `<div class="warnbox" style="margin-bottom:10px;">
            ${Icon('alert', 14)} Najprv zapíšte ubytovanie — inak ľudia nedostanú infolist k ubytovaniu.
            ${UI.tip('Pri „Poslať všetko naraz" sa infolist k ubytovaniu vyrobí len vtedy, keď je pri zákazke zapísané ubytovanie (krok 6). Bez neho by ľudia nevedeli, kde budú spať. Poslať sa dá aj teraz, ale ubytovanie potom treba poslať zvlášť.')}
            <div class="js-acts">${b('btn-outline', `Sub.showStep('${sc.id}','ubytovanie')`, 'bed', 'Zapísať ubytovanie')}</div>
          </div>` : ''}
          <div class="js-rows">${live.map((a) => {
          const x = person(a);
          const ready = x.zmluva && x.objednavka && lodOk;
          const chyba = [!x.zmluva ? 'rámcová zmluva nie je zapísaná' : '',
            !x.objednavka ? 'objednávka ešte nie je vystavená (v balíku nebude)' : '',
            !lodOk ? 'chýba ubytovanie' : ''].filter(Boolean);
          return `<div class="js-row js-row-p">
            <div class="js-who">${Danubra.link('worker', a.worker_id, x.name, { inline: true })}
              ${mark(x.zmluva, 'rámcová zmluva')} ${mark(x.objednavka, 'objednávka')}</div>
            <div class="js-row-acts">
              ${x.zmluva ? '' : x.zmluvaBezSkenu
                ? (() => {
                  const z = this.workerDocs.filter(d => d.worker_id === a.worker_id && d.kind === 'contract')
                    .find(d => !DanubraDocs.hasScan(d));
                  return z ? b('btn-primary', `Sub.pickScan('${z.id}')`, 'upload', 'Nahrať sken zmluvy') : '';
                })()
                : b('btn-outline', `Sub.viaWrk('zmluva','${a.worker_id}')`, 'print', 'Vytlačiť zmluvu')
                + b('btn-primary', `Sub.viaWrk('zmluvaForm','${a.worker_id}')`, 'check', 'Zapísať podpísanú')}
              ${x.objednavka ? '' : b(x.zmluva ? 'btn-primary' : 'btn-outline', `Sub.newWorkerOrder('${a.id}')`, 'orders', 'Vystaviť objednávku')}
              ${b('btn-ghost', `Sub.siteSheet('${a.id}')`, 'doc', 'Infolist')}
              ${b('btn-ghost', `Sub.contactForm('${a.id}')`, 'phone', 'Kontakt')}
              ${window.Bundle ? b(ready ? 'btn-primary' : 'btn-outline', `Bundle.open('${a.id}')`, 'mail', 'Poslať všetko naraz') : ''}
            </div>
            ${window.Bundle && !ready ? `<div class="muted-sm">Pred odoslaním: ${UI.esc(chyba.join(', '))}.</div>` : ''}
            ${this.contactLine(a)}
          </div>`;
        }).join('')}</div>
          <p class="card-note">Infolist je papier pre živnostníka: kam prísť, kedy, za kým a kde bude bývať.
            „Poslať všetko naraz" pošle infolist na stavbu, infolist k ubytovaniu, objednávku a vzor faktúry
            v jednej správe — e-mailom, cez WhatsApp alebo SMS. ${UI.tip('Živnostník tak nedostane päť správ zvlášť. E-mail má všetky PDF ako prílohy, WhatsApp a SMS jeden krátky odkaz, kde sú všetky papiere naraz. Odkaz platí 30 dní.')}</p>`;
      }

      if (key === 'ubytovanie') {
        return `<div id="sub-map" class="map-box"></div>
          <div class="map-legend"><span><i class="lg-site"></i>stavba</span><span><i class="lg-lodging"></i>ubytovanie</span></div>
          ${this.lodgingHtml(sc, asg)}`;
      }

      if (key === 'peniaze') {
        const ts = this.timesheetsOf(sc.id);
        const neschv = ts.filter(t => !t.approved && !t.period_id);
        return `${neschv.length ? `<div class="js-row">${mark(false, `${neschv.length} ${Shell.plural(neschv.length, 'výkaz čaká', 'výkazy čakajú', 'výkazov čaká')} na schválenie`)}</div>` : ''}
          ${acts(window.HourEntry ? b('btn-primary', `HourEntry.open({ subcontractId: '${sc.id}' })`, 'upload', 'Zapísať hodiny') : '',
            Danubra.routeAvailable('timesheets') && neschv.length ? b('btn-outline', `window.Tms&&(Tms.filters.subcontract_id='${sc.id}');Danubra.go('timesheets')`, 'check', 'Schváliť hodiny') : '',
            Danubra.routeAvailable('hoursheet') ? b('btn-outline', window.HS ? `HS.openFor({ subcontractId: '${sc.id}' })` : "Danubra.go('hoursheet')", 'print', 'Výkaz pre odberateľa') : '')}
          ${UI.tip('Zapísať hodiny = Stundennachweis podpísaný majstrom, ručne alebo z fotky. Schváliť hodiny = skontrolovať, že sedia; len schválené idú do faktúry. Výkaz pre odberateľa = ten istý týždeň na tlač, po nemecky.')}
          <div class="form-section" id="sub-periods">Obdobia a faktúry</div>
          ${this.periodsHtml(sc)}
          ${eco.length ? `<div class="form-section">Zarobíme (mesačne, orientačne pri 160 h)</div>
          <div class="service-total">
            <div><div class="code-label">Marža spolu</div>
              <div style="font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;">${UI.money(port.margin)}</div></div>
            <div style="text-align:right;"><div class="code-label">Na človeka</div>
              <div style="font-weight:700;">${UI.money(port.marginPerWorker)} · ${UI.pct(port.marginPct)}</div></div>
          </div>
          ${port.marginPerWorker < 1000 ? `<div class="warnbox" style="margin-top:8px;">
            ${Icon('alert', 14)} Marža na človeka je pod 1 000 € — prehodnoťte sadzbu.</div>` : ''}` : ''}`;
      }
      return '';
    },

    /** Akcia z iného modulu, ktorý ešte nemusí mať načítané dáta. */
    async viaWrk(fn, workerId, ...rest) {
      if (!window.Wrk || typeof Wrk[fn] !== 'function') return UI.toast('Kartotéka nie je dostupná', 'err');
      if (!Wrk.loaded) await Wrk.load();
      const scId = this.openId;
      Wrk.returnTo = { workerId, at: Date.now(), fn: async () => { await this.load(); this.detail(scId); } };
      return Wrk[fn](workerId, ...rest);
    },

    /**
     * „Nahrať sken" k dokladu, ktorý je zapísaný bez neho. Výber súboru sa
     * otvorí hneď (prehliadač ho pustí len priamo po kliknutí); po nahratí
     * sa zákazka prekreslí s novými dokladmi.
     */
    pickScan(docId) {
      if (!window.Wrk || typeof Wrk.pickScanFor !== 'function') return UI.toast('Kartotéka nie je dostupná', 'err');
      Wrk.pickScanFor(docId, () => this.afterScan());
    },

    /** Po nahratí skenu: nové doklady a prekreslenie (aj otvoreného nasadenia). */
    async afterScan(scId) {
      const wd = await DB.list('worker_documents', { limit: 2000 });
      if (wd && wd.data) this.workerDocs = wd.data;
      if (scId && document.getElementById('asg-form')) { this._asgKey = null; return this.asgReady(scId); }
      Danubra.renderRoute();
    },
    async newWorkerOrder(asgId) {
      if (!window.Ord) return UI.toast('Objednávky nie sú dostupné', 'err');
      return Ord.newFor(asgId);
    },
    async newCustomerOrder(scId) {
      if (!window.Ord) return UI.toast('Objednávky nie sú dostupné', 'err');
      const sc = this.items.find(x => x.id === scId) || {};
      if (!Ord.loaded) await Ord.load();
      Ord.form(null, { kind: 'customer', partner_id: sc.partner_id, subcontract_id: sc.id,
        contract_id: sc.contract_id || null, title: sc.title || '',
        date_from: sc.date_from, date_to: sc.date_to, price_model: 'hourly', rate: sc.charge_rate });
    },
    /**
     * Nová zmluva o dielo k zákazke. Dovtedy sa zmluva založila, ale zákazke
     * sa nepriradila — `contract_id` zostal prázdny a krok 3 navždy hlásil
     * „Zmluva o dielo zatiaľ nie je". Teraz sa po uložení priradí sama.
     */
    async newContract(scId) {
      const sc = this.items.find(x => x.id === scId) || {};
      if (!window.Con) return Danubra.go('contracts');
      if (!Con.loaded) await Con.load();
      Con.form(null, { partner_id: sc.partner_id, title: sc.title, scope: sc.scope,
        date_from: sc.date_from, date_to: sc.date_to, charge_rate: sc.charge_rate,
        site_name: sc.site_name, site_city: sc.site_city, site_address: sc.site_address },
      { onSaved: (row) => this.setContract(scId, row && row.id) });
    },

    /** Priradí zákazke zmluvu (alebo ju odpojí, keď `contractId` je prázdne). */
    async setContract(scId, contractId) {
      if (!contractId) return UI.toast('Zmluva sa neuložila — zákazke sa nepriradila', 'err');
      const { error } = await DB.update('subcontracts', scId, { contract_id: contractId });
      if (error) return UI.toast('Zmluva je uložená, ale k zákazke sa nepriradila: ' + error.message, 'err');
      UI.closeModal();
      UI.toast('Zmluva o dielo je priradená k zákazke', 'ok');
      await this.load();
      this.step = 'nemec';
      if (Danubra.route === 'subcontracts' && this.openId === scId) return Danubra.renderRoute();
      return this.detail(scId);
    },

    /** Zmluvy odberateľa, ktoré sa dajú zákazke priradiť (bez zrušených). */
    contractsOf(partnerId) {
      if (!partnerId) return [];
      return (this.contracts || []).filter(c => c.partner_id === partnerId && c.status !== 'cancelled');
    },
    contractLabel(c) {
      const st = { draft: 'rozpracovaná', sent: 'odoslaná na podpis', signed: 'podpísaná',
        active: 'prebieha', ended: 'ukončená', cancelled: 'zrušená' }[c.status] || c.status || '';
      return [c.contract_number, c.title].filter(Boolean).join(' · ')
        + (c.kind === 'framework' ? ' (rámcová)' : '') + (st ? ` — ${st}` : '');
    },
    /** Možnosti výberu zmluvy vo formulári zákazky. */
    contractOptions(partnerId, current) {
      const list = this.contractsOf(partnerId);
      // Priradená zmluva musí zostať vo výbere, aj keď patrí inému odberateľovi
      // alebo sa nenačítala (právo) — inak by ju „Uložiť" potichu odpojilo.
      const cur = current && !list.some(c => c.id === current)
        ? ((this.contracts || []).find(c => c.id === current) || { id: current, title: 'Priradená zmluva' }) : null;
      return [['', partnerId ? '— zatiaľ žiadna —' : '— najprv vyberte odberateľa —'],
        ...[...(cur ? [cur] : []), ...list].map(c => [c.id, this.contractLabel(c)])];
    },
    /** Po zmene odberateľa vo formulári: ponúknuť len jeho zmluvy. */
    formContracts(partnerId) {
      const sel = document.querySelector('#sub-form select[name="contract_id"]');
      if (!sel) return;
      const keep = sel.value;
      const opts = this.contractOptions(partnerId, null);
      sel.innerHTML = opts.map(([v, l]) => `<option value="${UI.esc(v)}">${UI.esc(l)}</option>`).join('');
      sel.value = opts.some(o => o[0] === keep) ? keep : '';
    },

    /** Okno: priradiť zákazke zmluvu, ktorá už existuje. */
    pickContract(scId) {
      const sc = this.items.find(x => x.id === scId) || {};
      const list = this.contractsOf(sc.partner_id);
      if (!list.length) return UI.toast('Tento odberateľ zatiaľ nemá žiadnu zmluvu', 'err');
      UI.modal('Priradiť zmluvu o dielo', `
        <p class="modal-lead">Zmluvy odberateľa <b>${UI.esc((this.partnerOf(sc.partner_id) || {}).name || '')}</b>.
          Vyberte tú, na ktorej táto zákazka stojí.
          ${UI.tip('Zmluva o dielo (Werkvertrag) je dohoda s nemeckým odberateľom o tejto práci. Keď ju zákazke priradíte, krok 3 bude vedieť, či je podpísaná, a objednávky a faktúry sa na ňu odvolajú.')}</p>
        <div class="pick-list">${list.map(c => `
          <button type="button" class="pick-tile" onclick="Sub.setContract('${scId}','${c.id}')">
            <span class="bdl-ico">${Icon('note', 18)}</span>
            <span class="bdl-txt"><b>${UI.esc([c.contract_number, c.title].filter(Boolean).join(' · ') || 'Zmluva')}</b>
              <em>${UI.esc(this.contractLabel(c).split(' — ')[1] || '')}</em></span>
          </button>`).join('')}</div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
        </div>`);
    },

    /** Otvorí zákazku rovno na danom kroku (aj z iného okna). */
    async showStep(scId, key) {
      UI.closeModal();
      await this.detail(scId);
      this.step = key;
      if (Danubra.route === 'subcontracts') Danubra.renderRoute();
    },

    /**
     * „Hľadať nových ľudí" — nábor **pre túto zákazku**, nie zoznam náborov.
     * Keď už pre ňu nábor beží, otvorí sa ten; inak sa založí nový
     * s remeslom, mestom, termínom a počtom, ktorý ešte chýba.
     */
    async hireFor(scId) {
      if (!window.Hire) return Danubra.go('hiring');
      const sc = this.items.find(x => x.id === scId) || {};
      if (!Hire.loaded) await Hire.load();
      const plan = (Hire.plans || []).find(pl => pl.subcontract_id === scId
        && ['draft', 'active', 'paused'].includes(pl.status));
      if (plan) return Hire.detail(plan.id);
      const opp = (this.opportunities || []).find(o => o.subcontract_id === scId) || {};
      const n = this.asgOf(scId).filter(a => !['cancelled', 'ended'].includes(a.status)).length;
      const need = Number(opp.headcount || sc.headcount) || 0;
      Hire.wizard(null, 1, {
        title: [sc.title, sc.site_city].filter(Boolean).join(' — '),
        trade_key: opp.trade_key || '',
        headcount: Math.max(1, need - n),
        subcontract_id: scId,
        city: sc.site_city || '',
        start_date: sc.date_from || null,
        client_rate: sc.charge_rate != null && sc.charge_rate !== '' ? Number(sc.charge_rate) : null,
      });
    },

    /**
     * „Vybrať zákazku" z karty človeka: okno so zákazkami, kliknutím sa
     * otvorí nasadenie s ním už vybraným. Predtým to viedlo na zoznam
     * zákaziek a človek musel začať odznova.
     */
    async pickFor(workerId) {
      if (!this.loaded) await this.load();
      const w = this.workerOf(workerId);
      const open = this.items.filter(x => ['active', 'won', 'negotiation', 'draft'].includes(x.status))
        .sort((x, y) => ['active', 'won', 'negotiation', 'draft'].indexOf(x.status)
          - ['active', 'won', 'negotiation', 'draft'].indexOf(y.status));
      if (!open.length) {
        return UI.modal('Vybrať zákazku', UI.empty('site', 'Žiadna otvorená zákazka',
          'Zákazka vzniká z dopytu alebo z ponuky. Keď nejaká beží, nasadíte ho na ňu odtiaľto.')
          + `<div class="modal-actions"><button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button></div>`);
      }
      UI.modal(`Na ktorú zákazku — ${w ? w.full_name : 'pracovník'}`, `
        <p class="modal-lead">Kliknite na zákazku. Otvorí sa nasadenie s ním už vybraným a skontrolujú sa mu doklady.
          ${UI.tip('Nasadiť = priradiť na stavbu. Zatiaľ nezačal robiť — „Nastúpil" kliknete na zákazke v kroku 2, keď naozaj príde.')}</p>
        <div class="pick-list">${open.map(sc => {
          const uz = this.asgOf(sc.id).some(a => a.worker_id === workerId && !['cancelled', 'ended'].includes(a.status));
          const p = this.partnerOf(sc.partner_id);
          const sub = [p && p.name, sc.site_city, sc.date_from ? UI.dateRange(sc.date_from, sc.date_to) : '',
            this.statusLabel(sc.status)].filter(Boolean).join(' · ');
          return uz
            ? `<div class="pick-tile is-static"><span class="bdl-ico">${Icon('check', 18)}</span>
                <span class="bdl-txt"><b>${UI.esc(sc.title)}</b><em>Už je na nej nasadený · ${UI.esc(sub)}</em></span></div>`
            : `<button type="button" class="pick-tile" onclick="Sub.addAsg('${sc.id}',{worker_id:'${workerId}'})">
                <span class="bdl-ico">${Icon('site', 18)}</span>
                <span class="bdl-txt"><b>${UI.esc(sc.title)}</b><em>${UI.esc(sub)}</em></span></button>`;
        }).join('')}</div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
        </div>`, { wide: true });
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
      if (!document.getElementById('sub-map')) return;   // mapa je v záložke Prehľad
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
        <div class="list-row" style="padding-left:18px;">
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

        return `<div class="list-row" style="align-items:flex-start;flex-wrap:wrap;">
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
          <button class="btn btn-ghost btn-sm" style="color:var(--red);" title="Archivovať ubytovanie zákazky"
            aria-label="Archivovať ubytovanie zákazky"
            onclick="Sub.delLodging('${l.lodging_id}')">${Icon('archive', 15)}</button>
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
          <button class="btn btn-primary btn-sm" onclick="Sub.findLodging('${sc.id}')">${Icon('search')} Nájsť ubytovanie</button>
          <button class="btn btn-outline btn-sm" onclick="Sub.addLodging('${sc.id}')">${Icon('plus')} Zapísať ručne</button>
          <button class="btn btn-outline btn-sm" onclick="Sub.editTransport('${sc.id}')">${Icon('van')} Doprava</button>
        </div>
        ${sc.transport_note ? `<div class="notebox" style="margin-top:8px;">
          <strong>Doprava${sc.transport_provided ? ' (zabezpečujeme)' : ''}:</strong> ${UI.esc(sc.transport_note)}</div>` : ''}`;
    },

    // ── Nájsť ubytovanie pri stavbe ───────────────────────────────────────
    // Automatické hľadanie v OpenStreetMap nefungovalo spoľahlivo a našlo
    // aj tak len hotely bez cien. Robí sa to preto tak, ako sa to robí
    // naozaj: **najprv vlastné overené ubytovania** zoradené podľa
    // vzdialenosti od stavby, pod nimi hľadanie cez Google Mapy a Monteurzimmer
    // — a čo sa tam nájde, zapíše sa jedným formulárom. Uloží sa do databázy
    // ubytovaní, takže nabudúce je už medzi vlastnými.
    findLodging(scId) {
      const sc = this.items.find(x => x.id === scId);
      if (!sc) return;
      const uz = new Set(this.occupancyOf(scId).map(l => l.accommodation_id).filter(Boolean));
      const saved = DanubraJob.nearbySaved(this.accommodations.filter(a => !uz.has(a.id)), sc);
      const ludia = this.asgOf(scId).filter(a => a.status !== 'cancelled').length || 1;
      const odkazy = DanubraNearby.links({ city: sc.site_city || '', lat: Number(sc.lat), lng: Number(sc.lng),
        from: sc.date_from, to: sc.date_to, persons: ludia });
      const bezPolohy = !DanubraGeo.valid(Number(sc.lat), Number(sc.lng));
      UI.modal('Nájsť ubytovanie', `
        <div class="form-section">1. Vaše ubytovania${bezPolohy ? '' : ' v okolí stavby'}</div>
        ${bezPolohy ? `<div class="notebox">Stavba nemá polohu, preto sa nedá zoradiť podľa vzdialenosti.
          <button class="link-chip" onclick="UI.closeModal();Sub.setCoords('${scId}')">${Icon('plus', 13)}<span>Doplniť polohu</span></button></div>` : ''}
        ${saved.length ? saved.slice(0, 12).map(a => `<div class="nb-row">
          <div class="nb-main">
            <b>${UI.esc(a.name)}</b>
            <span class="nb-tags">${a.km != null ? `<em>${a.km} km</em>` : ''}
              ${a.max_persons ? UI.badge(`${a.max_persons} lôžok`, 'gray') : ''}
              ${a.price_month ? UI.badge(`${UI.money(a.price_month)}/mes`, 'gray') : ''}</span>
            <span class="nb-sub">${UI.esc([a.address, a.city].filter(Boolean).join(', ') || '')}</span>
          </div>
          <button class="btn btn-primary btn-sm" onclick="Sub.addLodging('${scId}','${a.id}')">${Icon('plus', 14)} Pridať</button>
        </div>`).join('')
          : `<div class="js-empty">${this.accommodations.length ? 'V okolí stavby zatiaľ nemáte žiadne uložené ubytovanie.'
            : 'Zatiaľ nemáte uložené žiadne ubytovanie. Čo nájdete nižšie, uloží sa sem.'}</div>`}

        <div class="form-section">2. Hľadať na internete</div>
        <div class="nb-links">${odkazy.map(l => `<a class="btn btn-outline btn-sm" target="_blank" rel="noopener" href="${UI.esc(l.url)}">
          ${Icon('search', 14)} ${UI.esc(l.label)}</a>`).join('')}</div>
        <p class="card-note">Otvorí sa nová karta. Keď nájdete niečo vhodné, skopírujte odkaz a telefón a zapíšte to nižšie.</p>

        <div class="form-section">3. Zapísať, čo ste našli</div>
        <form id="ql-form" onsubmit="event.preventDefault();Sub.saveQuickLodging('${scId}')">
          <div class="form-grid">
            ${UI.field('name', 'Názov', { required: true, placeholder: 'napr. Monteurzimmer Huber' })}
            ${UI.field('owner_phone', 'Telefón', { type: 'tel' })}
            ${UI.field('link', 'Odkaz (Google Mapy alebo web)', { placeholder: 'vložte odkaz — poloha sa z neho vytiahne' })}
            ${UI.field('city', 'Mesto', { value: sc.site_city || '' })}
            ${UI.field('max_persons', 'Lôžok', { type: 'number' })}
            ${UI.field('price_month', 'Cena za mesiac (€)', { type: 'number' })}
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${Icon('check', 14)} Uložiť a pridať k zákazke</button>
          </div>
        </form>`, { wide: true });
    },

    /** Uloží nájdené ubytovanie do databázy a hneď ho pridá k zákazke. */
    async saveQuickLodging(scId) {
      const sc = this.items.find(x => x.id === scId) || {};
      const d = UI.formData(document.getElementById('ql-form'));
      if (!String(d.name || '').trim()) return UI.toast('Zadajte názov', 'err');
      const link = String(d.link || '').trim();
      const c = DanubraGeo.parseCoords(link);
      const jeMapa = /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(link);
      const row = {
        name: d.name.trim(), country: 'DE', city: (d.city || sc.site_city || '—').trim() || '—',
        owner_phone: d.owner_phone || null,
        max_persons: d.max_persons === '' ? null : Number(d.max_persons),
        price_month: d.price_month === '' ? null : Number(d.price_month),
        lat: c ? c.lat : null, lng: c ? c.lng : null,
        source: 'manual', verification_status: 'new',
        notes: link ? `${jeMapa ? 'Mapa' : 'Web'}: ${link}` : null,
      };
      const { data: acc, error } = await DB.insert('accommodations', row);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      this.accommodations.push(acc);
      const { error: e2 } = await DB.insert('subcontract_accommodations', {
        subcontract_id: scId, accommodation_id: acc.id, name: acc.name, city: acc.city,
        maps_url: jeMapa ? link : (c ? DanubraGeo.mapsUrl(c.lat, c.lng) : null),
        capacity: acc.max_persons, price_monthly: acc.price_month,
        lat: acc.lat, lng: acc.lng, date_from: sc.date_from || null, date_to: sc.date_to || null,
      });
      if (e2) return UI.toast('Uložené do databázy, ale k zákazke sa nepridalo: ' + e2.message, 'err');
      UI.closeModal();
      UI.toast(c ? 'Ubytovanie uložené aj s polohou' : 'Ubytovanie uložené — polohu môžete doplniť neskôr', 'ok');
      await this.load(); Danubra.renderRoute();
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
          'Všetci nasadení už majú zapísané, kde bývajú.')
          + `<div class="modal-actions">
              <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button></div>`);
      }
      UI.modal('Ubytovať človeka', `
        <form id="stay-form" onsubmit="event.preventDefault();Sub.saveStay('${lodgingId}')">
          <!-- add: false — ubytúva sa ten, kto je na zákazku nasadený.
               Novo založený človek nasadený nie je, takže by sa v zozname
               aj tak neobjavil. -->
          <div class="form-grid">
            <div class="fld-full">${UI.field('worker_id', 'Kto', { options: opts, required: true, add: false })}</div>
            ${UI.field('date_from', 'Od', { type: 'date',
              value: sc?.date_from && sc.date_from > new Date().toISOString().slice(0, 10)
                ? sc.date_from : new Date().toISOString().slice(0, 10) })}
            ${UI.field('date_to', 'Do (nepovinné)', { type: 'date' })}
          </div>
          ${UI.field('note', 'Poznámka', { type: 'textarea', rows: 2 })}
          <div class="regimebox">Jeden človek nemôže bývať na dvoch miestach naraz —
            databáza to nepustí. Keď sa presúva, najprv ukončite predchádzajúci pobyt.
            ${l?.capacity ? `Tu je ${l.free_beds} ${Shell.plural(l.free_beds, 'voľné lôžko', 'voľné lôžka', 'voľných lôžok')}.` : ''}</div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">Ubytovať</button>
          </div>
        </form>`);
    },

    saveStay(lodgingId) { return this._once('stay', () => this._saveStay(lodgingId)); },
    async _saveStay(lodgingId) {
      const d = UI.formData(document.getElementById('stay-form'));
      if (!d.worker_id) return UI.toast('Vyberte človeka', 'err');
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
        return UI.toast('Dátum zapíšte v tvare RRRR-MM-DD.', 'err');
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
        `Vložte odkaz z máp na miesto ${what} — alebo rovno súradnice.\n\n`
        + 'Rozumie odkazom z Google Máp aj OpenStreetMap a dvojici čísel\n'
        + 'ako 48.7758, 9.1829.');
      if (text == null) return null;
      const c = DanubraGeo.parseCoords(text);
      if (!c) {
        UI.toast('V tom odkaze som súradnice nenašiel. Skrátené odkazy '
          + '(maps.app.goo.gl) ich neobsahujú — otvorte ich a skopírujte adresu z prehliadača.', 'err');
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
          return UI.toast(`Nedá sa spustiť — ${this.chybaText(chk.blockers.length)}`, 'err');
        }
      }
      const patch = { status };
      if (status === 'won') patch.won_at = new Date().toISOString();
      if (status === 'completed') patch.completed_at = new Date().toISOString();
      // Chyba z databázy sa doteraz zahodila a appka hlásila „Stav uložený".
      const { error } = await DB.update('subcontracts', id, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      Object.assign(sc, patch);
      UI.toast('Stav uložený', 'ok');
      this.detail(id);
    },

    async markZoll(id) {
      const ref = await UI.ask('Meldungs-ID z meldeportal-mindestlohn.de:');
      if (ref === null) return;
      const patch = { zoll_reported_at: new Date().toISOString(), zoll_reference: ref || null };
      // Hlásenie Zoll je podmienka nasadenia — keď sa neuloží, nesmie to
      // vyzerať, že je zapísané.
      const { error } = await DB.update('subcontracts', id, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      Object.assign(this.items.find(x => x.id === id), patch);
      UI.toast('Hlásenie zaznamenané', 'ok');
      this.detail(id);
    },

    /** Interaktívny test signálov skrytej Arbeitnehmerüberlassung. */
    anuCheck(id) {
      const body = `
        <p class="modal-lead">
          Zaškrtnite, čo na zákazke reálne platí. Rozhoduje skutočný výkon prác, nie znenie zmluvy.</p>
        <form id="anu-form" oninput="Sub.anuUpdate()">
          ${DanubraCompliance.ANU_SIGNALS.map(([k, label]) =>
            `<label class="chk" style="padding:8px 0;border-bottom:1px solid var(--border-soft);">
              <input type="checkbox" name="${k}"> ${UI.esc(label)}</label>`).join('')}
        </form>
        <div id="anu-result" class="regimebox"></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal();Sub.detail('${id}')">Zavrieť</button>
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
      const scan = window.Wrk && typeof Wrk.withScanActs === 'function'
        ? (list) => Wrk.withScanActs(list, `()=>Sub.afterScan('${scId}')`) : (list) => list;
      return Shell.blocker({
        reasons: scan([...r.ready.reasons, ...r.ready.warnings]),
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
      if (!r) return UI.toast('Najprv vyberte pracovníka', 'err');

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

    /**
     * Koho výber „Nasadiť človeka" neukáže a prečo. Ponúkajú sa len ľudia
     * v stave Pripravený alebo Vyslaný — ostatní predtým potichu chýbali
     * a vyzeralo to, že človek z kartotéky zmizol.
     */
    hiddenWorkersHtml(shown) {
      const ids = new Set((shown || []).map(w => w.id));
      const rest = this.workers.filter(w => !ids.has(w.id));
      if (!rest.length) return '';
      const papiere = rest.filter(w => !w.status || ['candidate', 'screening'].includes(w.status)).length;
      const neakt = rest.filter(w => w.status === 'inactive').length;
      const zakaz = rest.filter(w => w.status === 'blacklist').length;
      const ostatni = rest.length - papiere - neakt - zakaz;
      const ludia = (n) => `${n} ${Shell.plural(n, 'človek', 'ľudia', 'ľudí')}`;
      const casti = [
        papiere ? `${ludia(papiere)} ${papiere === 1 ? 'nemá' : 'nemajú'} hotové papiere (stav Kandidát alebo V preverovaní)` : '',
        neakt ? `${ludia(neakt)} v stave Neaktívny` : '',
        zakaz ? `${ludia(zakaz)} s označením Nespolupracovať` : '',
        ostatni > 0 ? `${ludia(ostatni)} v inom stave` : '',
      ].filter(Boolean);
      return `<p class="card-note" id="asg-hidden">${rest.length} ${Shell.plural(rest.length,
        'človek sa v zozname nezobrazuje', 'ľudia sa v zozname nezobrazujú', 'ľudí sa v zozname nezobrazuje')}: ${UI.esc(casti.join(', '))}.
        ${UI.tip('V zozname sú len ľudia v stave Pripravený alebo Vyslaný — tí majú papiere vybavené. Keď má niekto doklady hotové, otvorte jeho kartu v časti Ľudia, zmeňte mu stav na Pripravený a tu sa objaví.')}</p>`;
    },

    // `pre` (voliteľné) = { worker_id, date_from, onSaved(asg) } — keď sa
    // nasadzuje odinakiaľ (napr. práve prijatý kandidát). `onSaved` sa zavolá
    // až po skutočnom uložení nasadenia, nie pri otvorení okna.
    addAsg(scId, pre) {
      const sc = this.items.find(x => x.id === scId);
      const free = this.workers.filter(w => ['ready', 'deployed'].includes(w.status));
      // Vybraný vopred (z jeho karty) sa ponúkne vždy — či smie ísť, povie
      // blokátor dokladov nižšie, nie jeho stav v kartotéke.
      const preW = pre && pre.worker_id ? this.workerOf(pre.worker_id) : null;
      if (preW && !free.some(w => w.id === preW.id)) free.unshift(preW);
      if (!free.length) {
        return UI.modal('Nasadiť pracovníka', UI.empty('workers', 'Nikto nie je pripravený',
          'Nasadiť sa dajú ľudia v stave Pripravený alebo Vyslaný.')
          + this.hiddenWorkersHtml([])
          + `<div class="modal-actions">
              <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
              <button type="button" class="btn btn-primary" onclick="UI.closeModal();Danubra.go('workers')">${Icon('workers', 14)} Otvoriť Ľudí</button>
            </div>`);
      }
      const w0 = (pre && free.find(w => w.id === pre.worker_id)) || free[0];
      const od = (pre && pre.date_from) || sc?.date_from;
      this._asgDone = (pre && pre.onSaved) || null;
      this._asgKey = `${w0.id}|${od || ''}`;
      const body = `
        <form id="asg-form" oninput="Sub.asgReady('${scId}')"
              onchange="Sub.asgReady('${scId}')"
              onsubmit="event.preventDefault();Sub.saveAsg('${scId}')">
          <div class="form-grid">
            ${UI.field('worker_id', 'Pracovník', { required: true, add: 'worker', value: w0.id, options: free.map(w => [w.id, w.full_name]),
              tip: 'Ponúkajú sa ľudia v stave Pripravený alebo Vyslaný. Kto tu chýba a prečo, je napísané pod týmto poľom.' })}
            <div class="fld-full">${this.hiddenWorkersHtml(free)}</div>
            ${UI.field('role', 'Rola', { value: 'pracovnik', options: [['pracovnik', 'Pracovník'], ['predak', 'Predák (vedie práce)']] })}
            ${UI.field('date_from', 'Od', { type: 'date', value: od })}
            ${UI.field('date_to', 'Do', { type: 'date', value: sc?.date_to })}
            ${UI.field('charge_rate', 'Fakturačná sadzba €/h', { type: 'number', value: sc?.charge_rate,
              hint: 'Predvyplní sa pri každom nasadení na túto zákazku a z nej sa '
                + 'počíta, čo sa odberateľovi vyfakturuje.' })}
            ${UI.field('accommodation_monthly', 'Ubytovanie €/mes', { type: 'number' })}
            ${UI.field('transport_monthly', 'Doprava €/mes', { type: 'number' })}
          </div>
          <div class="regimebox">Aspoň jeden nasadený má byť <strong>predák</strong> — vlastné vedenie prác
          je kľúčový dôkaz, že ide o Werkvertrag a nie o prenájom pracovnej sily.</div>

          <div class="form-section">Smieme ho nasadiť?</div>
          <div id="asg-blocker">${this.asgBlockerHtml(scId, w0.id, od)}</div>

          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="${pre ? 'UI.closeModal()' : `UI.closeModal();Sub.detail('${scId}')`}">Zrušiť</button>
            <button type="submit" class="btn btn-primary">Nasadiť</button>
          </div>
        </form>`;
      UI.modal('Nasadiť pracovníka', body, { wide: true });
    },

    /** Ubytovanie na zákazke — buď z databázy, alebo voľne zapísané. */
    addLodging(scId, accId) {
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
          <div class="regimebox">Ubytovanie sa berie z tej istej databázy ako
          v ubytovacej agende — čo ste zháňali pre klientov, môžete použiť aj pre vlastných ľudí.</div>
          <div class="form-grid">
            <div class="fld-full">${UI.field('accommodation_id', 'Z databázy ubytovaní', { add: 'accommodation', value: accId || '',
              options: [['', '— zapíšem ručne —'], ...sorted.map(a => [a.id,
                `${a.name}${a.city ? ` · ${a.city}` : ''}${a.max_persons ? ` · ${a.max_persons} os.` : ''}`])] })}</div>
            ${UI.field('name', 'Názov (ak nie je v databáze)', {})}
            ${UI.field('city', 'Mesto', { value: city })}
            ${UI.field('address', 'Adresa', {})}
            ${UI.field('maps_url', 'Odkaz z máp', { placeholder: 'sem vložte odkaz — poloha sa z neho vytiahne' })}
            ${UI.field('capacity', 'Lôžok', { type: 'number' })}
            ${UI.field('price_monthly', 'Cena €/mes', { type: 'number' })}
            ${UI.field('date_from', 'Od', { type: 'date', value: sc?.date_from })}
            ${UI.field('date_to', 'Do', { type: 'date', value: sc?.date_to })}
          </div>
          ${UI.field('note', 'Poznámka', { type: 'textarea', rows: 2 })}
          <div class="regimebox">Obsadenosť sa nevypisuje ručne —
            počíta sa z toho, koho tam zapíšete. Ručné číslo sa rozišlo s realitou
            hneď, ako niekto odišiel.</div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">Pridať</button>
          </div>
        </form>`, { wide: true });
    },

    async saveLodging(scId) {
      const d = UI.formData(document.getElementById('lodg-form'));
      const acc = this.accommodations.find(a => a.id === d.accommodation_id);
      if (!acc && !d.name && !d.address) return UI.toast('Vyberte ubytovanie alebo zapíšte názov', 'err');
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
      if (!await UI.confirmArchive('Odobrať toto ubytovanie zo zákazky a presunúť ho do archívu?')) return;
      const { error } = await DB.archive('subcontract_accommodations', id);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast(UI.ARCHIVED, 'ok');
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
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal();Sub.detail('${scId}')">Zrušiť</button>
            <button type="submit" class="btn btn-primary">Uložiť</button>
          </div>
        </form>`);
    },

    async saveTransport(scId) {
      const d = UI.formData(document.getElementById('tr-form'));
      const patch = { transport_note: d.transport_note || null, transport_provided: !!d.transport_provided };
      const { error } = await DB.update('subcontracts', scId, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
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

      // Freistellung §48b je firemná — keď ju máme, platí na každej zákazke.
      const fsOk = DanubraCompliance.freistellung(this.companyItems(), Danubra._dayISO()).ok;
      const rows = DanubraChecks.build({
        assignment: a, subcontract: fsOk ? { ...sc, freistellung_verified: true } : sc, worker: w || {},
        // Expirovaný alebo nenahratý doklad má vlastný kľúč (expired_document,
        // missing_scan); checklist sa drží požiadavky (napr. „Platné A1").
        blocking: v.open.flatMap(r => [r.rule, r.baseRule].filter(Boolean)),
        waived: v.waived.flatMap(r => [r.rule, r.baseRule].filter(Boolean)),
        noScan: v.open.filter(r => r.rule === 'missing_scan').map(r => r.baseRule).filter(Boolean),
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
        return `<div class="list-row" style="align-items:flex-start;">
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
        stay: 'Číta sa z pobytov, teda z toho, koho ste zapísali na ubytovanie.',
        transport: 'Číta sa zo zákazky, zo sekcie Doprava.',
        manual: 'Toto appka vedieť nemôže, preto sa odškrtáva rukou.',
      }[c.source];
      UI.modal(c.title, `
        <p class="modal-lead">${UI.esc(c.why)}</p>
        <div class="regimebox">${UI.esc(kde)}${
        c.required ? '' : ' Tento bod nástup <strong>neblokuje</strong>.'}</div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
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

    saveAsg(scId) { return this._once('asg', () => this._saveAsg(scId)); },
    async _saveAsg(scId) {
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
      ['charge_rate', 'accommodation_monthly', 'transport_monthly']
        .forEach(k => { payload[k] = d[k] === '' ? null : Number(d[k]); });
      const { data: asg, error } = await DB.insert('assignments', payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      await DB.update('workers', d.worker_id, { status: 'deployed' }).catch(() => {});

      // Checklist sa už nezakladá. Predtým sa pri každom nasadení vložilo
      // deväť riadkov s voľným textom z nastavení — a osem z nich appka vie
      // sama z dokladov, zákazky a pobytov. Zostal jeden ručný bod a ten
      // vznikne až pri prvom odškrtnutí; dovtedy nemá čo zapisovať.
      UI.closeModal();
      UI.toast('Pracovník nasadený', 'ok');
      // Karta človeka (Ľudia) má nasadenia vlastné — nech si ich načíta znova.
      if (window.Wrk) Wrk.loaded = false;
      const done = this._asgDone; this._asgDone = null;
      if (done) { try { await done(asg); } catch (e) { console.error('[danubra] po nasadení', e); } }
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
    async siteSheet(asgId, okno) {
      const a = this.assignments.find(x => x.id === asgId);
      if (!a) { if (okno) okno.close(); return UI.toast('Nasadenie sa nenašlo.', 'err'); }
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

      if (!Danubra.supplierReady('Infolist na stavbu')) { if (okno) okno.close(); return; }
      const supplier = Danubra.supplier();
      const state = DanubraSiteSheet.check({
        worker, assignment: a, subcontract: sc || {}, partner, lodging });
      if (!state.ready) UI.toast(DanubraSiteSheet.sentence(state), 'err');

      const html = DanubraPapers.siteSheet({
        worker, assignment: a, subcontract: sc || {}, partner, lodging, supplier,
        trade: (sc || {}).trade || null, state,
      });
      Docs.show(okno || window.open('', '_blank'), html, { kind: 'infolist', title: 'Infolist na stavbu',
        who: worker && worker.full_name, lang: 'sk', worker_id: a.worker_id,
        subcontract_id: a.subcontract_id, partner_id: (sc || {}).partner_id || null });
    },

    // ── Kontaktná osoba pri nasadení ──────────────────────────────────────
    // Kto je v partii, má kolegov z partie na infoliste sám. Kto nie je,
    // tomu sa dá vybrať kolega zo stavby alebo ručne meno a telefón —
    // „chcem mať možnosť kolegovi pridať kontakt na kontaktnú osobu".
    contactOf(a) {
      if (!a) return null;
      if (a.contact_worker_id) {
        const w = this.workerOf(a.contact_worker_id) || {};
        return { name: w.full_name || 'kolega', phone: w.phone || '', note: a.contact_note || '' };
      }
      if (a.contact_name || a.contact_phone) {
        return { name: a.contact_name || '', phone: a.contact_phone || '', note: a.contact_note || '' };
      }
      return null;
    },
    contactLine(a) {
      const crew = a.crew_id ? (this.crews || []).find(c => c.id === a.crew_id) : null;
      const c = this.contactOf(a);
      if (!crew && !c) return '';
      return `<div class="js-contact muted-sm">${Icon('phone', 12)}
        ${crew ? `Partia <b>${UI.esc(crew.name)}</b> — kolegovia z partie sú na infoliste.` : ''}
        ${c ? `Kontaktná osoba: <b>${UI.esc(c.name)}</b>${c.phone ? ` · ${UI.esc(c.phone)}` : ''}` : ''}</div>`;
    },
    contactForm(asgId) {
      const a = this.assignments.find(x => x.id === asgId);
      if (!a) return;
      const me = this.workerOf(a.worker_id) || {};
      const crew = a.crew_id ? (this.crews || []).find(c => c.id === a.crew_id) : null;
      const today = new Date().toISOString().slice(0, 10);
      const kolegovia = this.assignments
        .filter(x => x.subcontract_id === a.subcontract_id && x.worker_id !== a.worker_id
          && x.status !== 'ended' && (!x.date_to || x.date_to >= today))
        .map(x => this.workerOf(x.worker_id)).filter(Boolean);
      const sel = a.contact_worker_id || (a.contact_name || a.contact_phone ? '__manual' : '');
      UI.modal('Kontaktná osoba na stavbe', `
        <form id="asg-contact" onsubmit="event.preventDefault();Sub.saveContact('${a.id}')">
          <p class="modal-lead">Komu má <b>${UI.esc(me.full_name || 'živnostník')}</b> zavolať, keď prvý deň
            nevie, kam ísť. Ukáže sa na infoliste aj v správe, ktorú mu pošlete.</p>
          ${crew ? `<div class="regimebox">Je v partii <b>${UI.esc(crew.name)}</b> — kolegov z partie s telefónmi
            uvidí na infoliste sám. Kontaktnú osobu pridajte len vtedy, keď má volať niekomu inému.</div>` : ''}
          <div class="form-grid">
            ${UI.field('who', 'Kto', { value: sel,
              options: [['', '— nikto —'], ...kolegovia.map(w => [w.id, `${w.full_name}${w.phone ? ` · ${w.phone}` : ''}`]),
                ['__manual', 'Iná osoba — napíšem ručne']],
              onchange: "document.getElementById('asg-contact-manual').hidden = this.value !== '__manual'",
              tip: 'Kolega zo stavby, ktorý tam už robí, alebo niekto iný (napr. majster). Číslo mu dajte len so súhlasom toho človeka.' })}
          </div>
          <div id="asg-contact-manual" class="form-grid"${sel === '__manual' ? '' : ' hidden'}>
            ${UI.field('contact_name', 'Meno', { value: a.contact_name || '' })}
            ${UI.field('contact_phone', 'Telefón', { type: 'tel', value: a.contact_phone || '', placeholder: '+49 …' })}
          </div>
          <div class="form-grid">
            ${UI.field('contact_note', 'Poznámka pre živnostníka', { value: a.contact_note || '',
              placeholder: 'napr. robí na 2. poschodí, hovorí po slovensky', type: 'textarea', rows: 2 })}
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${Icon('check')} Uložiť</button>
          </div>
        </form>`);
    },
    async saveContact(asgId) {
      const d = UI.formData(document.getElementById('asg-contact'));
      const manual = d.who === '__manual';
      const patch = {
        contact_worker_id: d.who && !manual ? d.who : null,
        contact_name: manual ? (d.contact_name || null) : null,
        contact_phone: manual ? (d.contact_phone || null) : null,
        contact_note: d.contact_note || null,
      };
      if (manual && !patch.contact_name && !patch.contact_phone) return UI.toast('Napíšte meno alebo telefón', 'err');
      const { error } = await DB.update('assignments', asgId, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const a = this.assignments.find(x => x.id === asgId);
      if (a) Object.assign(a, patch);
      UI.closeModal();
      UI.toast('Kontaktná osoba je uložená', 'ok');
      if (a) this.detail(a.subcontract_id);
    },

    /**
     * Zrušiť nasadenie, kým človek nenastúpil. Nič sa nemaže — nasadenie
     * dostane stav „zrušené" a zostane v histórii (pravidlo firmy).
     */
    async delAsg(id) {
      const a = this.assignments.find(x => x.id === id);
      if (!await UI.confirm('Zrušiť toto nasadenie?', {
        hint: 'Človek na túto stavbu nepôjde. Nič sa nezmaže — nasadenie zostane v histórii ako zrušené.' })) return;
      const { error } = await DB.update('assignments', id, { status: 'cancelled' });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      if (a) {
        a.status = 'cancelled';
        await this.workerBackToReady(a.worker_id);
        this.detail(a.subcontract_id);
      }
    },

    /** Keď už nikde nie je nasadený, vráti sa v kartotéke na „Pripravený". */
    async workerBackToReady(workerId) {
      const inde = this.assignments.some(x => x.worker_id === workerId
        && ['planned', 'active'].includes(x.status || 'planned'));
      const w = this.workerOf(workerId);
      if (inde || !w || w.status !== 'deployed') return;
      const { error } = await DB.update('workers', workerId, { status: 'ready' });
      if (!error) w.status = 'ready';
      if (window.Wrk) Wrk.loaded = false;
    },

    // ── Nastúpil / Odišiel ────────────────────────────────────────────────
    // Jednotlivo nasadený človek zostal navždy `planned` — aktívne nasadenie
    // vytvorilo len nasadenie partie. Preto ho nevideli „Ľudia na stavbách"
    // ani kontroly na Dnes. „Nastúpil" ho prepne na `active` (rovnaká hodnota
    // ako pri partii) a zapíše deň nástupu (`started_at`).

    /**
     * Okno „Nastúpil". Formulár má zámerne id `asg-form` a polia
     * `worker_id` / `date_from` — vďaka tomu blokátor dokladov aj zápis
     * výnimky (`asgReady`, `grantAsgOverride`) fungujú presne ako pri nasadení.
     * Doklady sa posudzujú k dňu nástupu.
     */
    startForm(asgId) {
      const a = this.assignments.find(x => x.id === asgId);
      if (!a) return UI.toast('Nasadenie sa nenašlo', 'err');
      const w = this.workerOf(a.worker_id) || {};
      const dnes = Danubra._dayISO();
      const od = a.date_from && a.date_from < dnes ? a.date_from : dnes;
      this._asgKey = `${a.worker_id}|${od}`;
      UI.modal(`Nastúpil — ${w.full_name || 'pracovník'}`, `
        <form id="asg-form" oninput="Sub.asgReady('${a.subcontract_id}')" onchange="Sub.asgReady('${a.subcontract_id}')"
              onsubmit="event.preventDefault();Sub.saveStart('${a.id}')">
          <p class="modal-lead">Potvrďte, že <b>${UI.esc(w.full_name || 'pracovník')}</b> naozaj prišiel na stavbu a začal robiť.
            ${UI.tip('Od tohto dňa sa počíta medzi ľudí na stavbách, appka mu stráži hodiny a doklady a objaví sa v kontrolách na obrazovke Dnes. Kým to nepotvrdíte, je len „nasadený" — priradený na stavbu.')}</p>
          <input type="hidden" name="worker_id" value="${UI.esc(a.worker_id)}">
          <div class="form-grid">
            ${UI.field('date_from', 'Nastúpil dňa', { type: 'date', value: od, required: true,
              tip: 'Prvý deň, keď naozaj robil na stavbe. Doklady (A1, živnosť, totožnosť) musia platiť práve k tomuto dňu.' })}
          </div>
          <div class="form-section">Smie nastúpiť?</div>
          <div id="asg-blocker">${this.asgBlockerHtml(a.subcontract_id, a.worker_id, od)}</div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${Icon('check')} Áno, nastúpil</button>
          </div>
        </form>`, { wide: true });
    },

    saveStart(asgId) { return this._once('start', () => this._saveStart(asgId)); },
    async _saveStart(asgId) {
      const a = this.assignments.find(x => x.id === asgId);
      if (!a) return UI.toast('Nasadenie sa nenašlo', 'err');
      const d = UI.formData(document.getElementById('asg-form'));
      const den = d.date_from;
      if (!den) return UI.toast('Zadajte deň nástupu', 'err');
      if (den > Danubra._dayISO()) return UI.toast('Nastúpiť sa dá najneskôr dnes — budúci nástup je ešte len nasadenie', 'err');

      // Rovnaké pravidlo ako pri nasadení: bez platných dokladov len so
      // zapísanou výnimkou administrátora. Od migrácie 071 to pri zmene na
      // „nastúpil" drží aj databáza (k dňu nástupu); tu je to preto, aby to
      // človek videl hneď a mal po ruke výnimku.
      const r = this.asgReadiness(a.subcontract_id, a.worker_id, den);
      if (r) {
        const v = Shell.evaluate([...r.ready.reasons, ...r.ready.warnings],
          this.overridesOf(a.worker_id), den);
        if (!v.ok) {
          return UI.toast(`Bez platných dokladov to nepustím: ${v.open.map(x => x.label).join(', ')}. ${
            Danubra.isAdmin() ? 'Ak to inak nejde, zapíšte výnimku s dôvodom vyššie.'
              : 'Výnimku môže zapísať len administrátor.'}`, 'err');
        }
      }

      const { error } = await DB.update('assignments', a.id, { status: 'active', started_at: den });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      await DB.update('workers', a.worker_id, { status: 'deployed' }).catch(() => {});
      if (window.Wrk) Wrk.loaded = false;
      UI.closeModal();
      UI.toast('Zapísané — nastúpil', 'ok');
      await this.load(); this.detail(a.subcontract_id);
    },

    /**
     * Okno „Odišiel". Zapíše posledný deň a dôvod; nič sa nemaže. Zmena
     * koncového dátumu je zapísaná aj s pôvodným dátumom v poznámke
     * nasadenia, aby bolo vidieť, že sa skončilo inak, než sa plánovalo.
     */
    endForm(asgId) {
      const a = this.assignments.find(x => x.id === asgId);
      if (!a) return UI.toast('Nasadenie sa nenašlo', 'err');
      const w = this.workerOf(a.worker_id) || {};
      const dnes = Danubra._dayISO();
      const den = a.date_to && a.date_to < dnes ? a.date_to : dnes;
      UI.modal(`Odišiel — ${w.full_name || 'pracovník'}`, `
        <form id="asg-end" onsubmit="event.preventDefault();Sub.saveEnd('${a.id}')">
          <p class="modal-lead">Zapíšte, že <b>${UI.esc(w.full_name || 'pracovník')}</b> na tejto stavbe skončil.
            ${UI.tip('Nič sa nezmaže. Nasadenie dostane stav „odišiel", zapíše sa posledný deň a dôvod. Hodiny, ktoré odpracoval, sa normálne vyfakturujú. Ak býval v našom ubytovaní, ukončite mu pobyt v kroku 6.')}</p>
          <div class="form-grid">
            ${UI.field('date_to', 'Posledný deň na stavbe', { type: 'date', value: den, required: true,
              tip: 'Posledný deň, keď na stavbe robil. Hodiny po tomto dni sa mu už zapisovať nemajú.' })}
            ${UI.field('reason', 'Prečo skončil', { value: 'finished', options: [
              ['finished', 'Práca pre neho skončila'], ['left', 'Odišiel sám'],
              ['moved', 'Presunutý na inú zákazku'], ['ended_by_us', 'Ukončili sme spoluprácu'],
              ['other', 'Iný dôvod']] })}
          </div>
          ${UI.field('note', 'Poznámka', { type: 'textarea', rows: 2, placeholder: 'napr. rodinné dôvody, vráti sa v marci' })}
          ${a.date_to ? `<p class="card-note">Plánovaný koniec bol ${UI.date(a.date_to)}. Pôvodný dátum sa zapíše do poznámky nasadenia.</p>` : ''}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${Icon('logout')} Zapísať odchod</button>
          </div>
        </form>`);
    },

    saveEnd(asgId) { return this._once('end', () => this._saveEnd(asgId)); },
    async _saveEnd(asgId) {
      const a = this.assignments.find(x => x.id === asgId);
      if (!a) return UI.toast('Nasadenie sa nenašlo', 'err');
      const d = UI.formData(document.getElementById('asg-end'));
      if (!d.date_to) return UI.toast('Zadajte posledný deň', 'err');
      const zac = a.started_at || a.date_from;
      if (zac && d.date_to < zac) return UI.toast(`Posledný deň nemôže byť pred nástupom (${UI.date(zac)})`, 'err');

      const neskor = (this.timesheets || []).filter(t => t.assignment_id === a.id && t.work_date > d.date_to);
      if (neskor.length && !await UI.confirm(`Po ${UI.date(d.date_to)} má zapísaných ${neskor.length} ${
        Shell.plural(neskor.length, 'deň', 'dni', 'dní')} hodín. Zapísať odchod aj tak?`, {
        ok: 'Áno, zapísať', danger: false,
        hint: 'Hodiny sa nezmažú. Skontrolujte ich v Hodinách — možno je posledný deň neskôr.' })) return;

      const DOVOD = { finished: 'Práca pre neho skončila', left: 'Odišiel sám', moved: 'Presunutý na inú zákazku',
        ended_by_us: 'Ukončili sme spoluprácu', other: 'Iný dôvod' };
      const dovod = [DOVOD[d.reason] || d.reason, String(d.note || '').trim()].filter(Boolean).join(' — ');
      const zapis = `Odišiel ${UI.date(d.date_to)}${a.date_to && a.date_to !== d.date_to
        ? ` (plánovaný koniec bol ${UI.date(a.date_to)})` : ''}: ${dovod}`;
      const { error } = await DB.update('assignments', a.id, {
        status: 'ended', date_to: d.date_to, ended_reason: dovod,
        notes: [a.notes, zapis].filter(Boolean).join('\n'),
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      a.status = 'ended';
      await this.workerBackToReady(a.worker_id);
      UI.closeModal();
      UI.toast('Odchod je zapísaný', 'ok');
      await this.load(); this.detail(a.subcontract_id);
    },

    // ── Predĺžiť / zmeniť koniec ──────────────────────────────────────────
    // Pravidlo firmy: „zmena koncového dátumu = záznam predĺženia/dodatku".
    // Koniec nasadenia ani zákazky sa preto neprepisuje vo formulári — mení
    // sa tu, s dôvodom, a databáza (migrácia 074) zapíše pôvodný aj nový
    // koniec do danubra_assignment_extensions v tej istej transakcii.
    // Otvára sa ako otázka **nad** oknom, takže rozpísaný formulár zákazky
    // pod ním zostane.

    /** Záznamy o zmene konca: `asgId` = nasadenie, `null` = celá zákazka. */
    extOf(scId, asgId) {
      return (this.extensions || []).filter(e => e.subcontract_id === scId
        && (asgId ? e.assignment_id === asgId : !e.assignment_id));
    },

    extHistoryHtml(list, title) {
      if (!list || !list.length) return '';
      const kto = (uid) => {
        const m = uid && (Danubra.members || []).find(x => x.user_id === uid);
        return m ? (m.full_name || m.email || '') : '';
      };
      const d = (x) => (x ? UI.date(x) : 'bez konca');
      return `<details class="more-block ext-history"><summary>${Icon('calendar', 13)} ${UI.esc(title)} (${list.length})</summary>
        ${list.map(e => `<div class="list-row" style="font-size:12.5px;align-items:flex-start;">
          <span style="flex:1;min-width:0;">
            <strong>${d(e.old_date_to)} → ${d(e.new_date_to)}</strong>
            <span style="display:block;color:var(--ink-mute);">${UI.esc(e.reason || '')}</span>
            <span style="display:block;color:var(--ink-mute);font-size:11.5px;">${UI.date(e.created_at)}${kto(e.created_by) ? ` · ${UI.esc(kto(e.created_by))}` : ''}</span>
          </span></div>`).join('')}
      </details>`;
    },

    _extError(error) {
      const m = String((error && error.message) || error || '');
      if (/function|schema cache|assignment_extensions/i.test(m) && /not|exist|find/i.test(m)) {
        return UI.toast('Predĺženie ešte nie je v databáze zapnuté — treba spustiť migráciu 074.', 'err');
      }
      return UI.toast('Chyba: ' + m, 'err');
    },

    async _afterExt(scId) {
      const [ext, a, s] = await Promise.all([
        DB.list('assignment_extensions', { order: { column: 'created_at', ascending: false }, limit: 3000 }),
        DB.list('assignments', { limit: 1000 }),
        DB.list('subcontracts', { order: { column: 'created_at', ascending: false }, limit: 500 }),
      ]);
      if (ext.data) this.extensions = ext.data;
      if (a.data) this.assignments = a.data;
      if (s.data) this.items = s.data;
      if (window.Wrk) Wrk.loaded = false;
      if (window.Tms) Tms.loaded = false;
      // Keď je otvorený formulár zákazky, len sa v ňom prepíše dátum —
      // rozpísané zmeny v ňom zostanú (okno je nad obrazovkou, prekreslenie
      // obrazovky pod ním ho nezavrie).
      const box = document.getElementById('sub-form-dateto');
      const sc = this.items.find(x => x.id === scId);
      if (box && sc) box.textContent = UI.date(sc.date_to);
      if (this.openId === scId) Danubra.renderRoute();
    },

    extendAsg(asgId) { return this._once('ext', () => this._extendAsg(asgId)); },
    async _extendAsg(asgId) {
      const a = this.assignments.find(x => x.id === asgId);
      if (!a) return UI.toast('Nasadenie sa nenašlo', 'err');
      const w = this.workerOf(a.worker_id) || {};
      const sc = this.items.find(x => x.id === a.subcontract_id) || {};
      const v = await UI.askFields(a.date_to ? 'Predĺžiť / zmeniť koniec nasadenia' : 'Zadať koniec nasadenia',
        `${w.full_name || 'Pracovník'}: ${a.date_to ? `doteraz koniec ${UI.date(a.date_to)}` : 'zatiaľ bez konca'}.`,
        [
          ['new_date_to', 'Nový koniec', { type: 'date', required: true, value: a.date_to || sc.date_to || '' }],
          ['reason', 'Dôvod', { required: true,
            placeholder: 'napr. odberateľ predĺžil objednávku do konca novembra',
            hint: 'Zostane v histórii nasadenia spolu s pôvodným a novým koncom.' }],
        ], { ok: 'Zapísať zmenu', hint: 'Koniec sa neprepisuje potichu — zmena sa zapíše ako záznam o predĺžení s dôvodom, kto a kedy.' });
      if (!v) return;
      if (String(v.reason || '').trim().length < 3) return UI.toast('Napíšte dôvod (aspoň pár slov)', 'err');
      const zac = a.started_at || a.date_from;
      if (zac && v.new_date_to < zac) return UI.toast(`Koniec nemôže byť pred začiatkom (${UI.date(zac)})`, 'err');
      if (v.new_date_to === a.date_to) return UI.toast('Koniec je už taký — nič sa nemení', 'err');
      const neskor = (this.timesheets || []).filter(t => t.assignment_id === a.id && t.work_date > v.new_date_to);
      if (neskor.length && !await UI.confirm(`Po ${UI.date(v.new_date_to)} má zapísaných ${neskor.length} ${
        Shell.plural(neskor.length, 'deň', 'dni', 'dní')} hodín. Skrátiť koniec aj tak?`, {
        ok: 'Áno, skrátiť', danger: false,
        hint: 'Hodiny sa nezmažú. Skontrolujte ich v Hodinách — možno má byť koniec neskôr.' })) return;

      const { error } = await DB.rpc('extend_assignment', {
        p_assignment_id: a.id, p_new_date_to: v.new_date_to, p_reason: v.reason });
      if (error) return this._extError(error);
      UI.toast(a.date_to && v.new_date_to > a.date_to ? 'Nasadenie je predĺžené' : 'Koniec nasadenia je zmenený', 'ok');
      await this._afterExt(a.subcontract_id);
    },

    extendSc(scId) { return this._once('ext', () => this._extendSc(scId)); },
    async _extendSc(scId) {
      const sc = this.items.find(x => x.id === scId);
      if (!sc) return UI.toast('Zákazka sa nenašla', 'err');
      const spolu = sc.date_to ? this.asgOf(scId).filter(a => ['planned', 'active'].includes(a.status || 'planned')
        && a.date_to === sc.date_to) : [];
      const fields = [
        ['new_date_to', 'Nový koniec zákazky', { type: 'date', required: true, value: sc.date_to || '' }],
        ['reason', 'Dôvod', { required: true,
          placeholder: 'napr. dodatok k objednávke, odberateľ pridal ďalšie poschodie',
          hint: 'Zostane v histórii zákazky spolu s pôvodným a novým koncom.' }],
      ];
      if (spolu.length) {
        fields.push(['with_asg', `Aj ${spolu.length} ${Shell.plural(spolu.length, 'nasadenie', 'nasadenia', 'nasadení')} s rovnakým koncom`, {
          value: 'yes', options: [['yes', 'Áno, zmeniť koniec aj im'], ['no', 'Nie, len zákazke']],
          hint: 'Nasadenia, ktoré končia inokedy než zákazka, sa nemenia — ten koniec niekto zadal zámerne.' }]);
      }
      const v = await UI.askFields(sc.date_to ? 'Predĺžiť / zmeniť koniec zákazky' : 'Zadať koniec zákazky',
        `${sc.title || 'Zákazka'}: ${sc.date_to ? `doteraz koniec ${UI.date(sc.date_to)}` : 'zatiaľ bez konca'}.`,
        fields, { ok: 'Zapísať zmenu', hint: 'Koniec sa neprepisuje potichu — zmena sa zapíše ako záznam o predĺžení s dôvodom, kto a kedy. Pri zmluve s odberateľom sa zmena podmienok zapisuje dodatkom zvlášť.' });
      if (!v) return;
      if (String(v.reason || '').trim().length < 3) return UI.toast('Napíšte dôvod (aspoň pár slov)', 'err');
      if (sc.date_from && v.new_date_to < sc.date_from) return UI.toast(`Koniec nemôže byť pred začiatkom (${UI.date(sc.date_from)})`, 'err');
      if (v.new_date_to === sc.date_to) return UI.toast('Koniec je už taký — nič sa nemení', 'err');

      const { data, error } = await DB.rpc('extend_subcontract', {
        p_subcontract_id: scId, p_new_date_to: v.new_date_to, p_reason: v.reason,
        p_with_assignments: v.with_asg === 'yes' });
      if (error) return this._extError(error);
      const n = Number((data && data.assignments) || 0);
      UI.toast(`Koniec zákazky je zmenený${n ? ` aj s ${n} ${Shell.plural(n, 'nasadením', 'nasadeniami', 'nasadeniami')}` : ''}`, 'ok');
      await this._afterExt(scId);
    },

    // ── Formulár zákazky ──────────────────────────────────────────────────
    // `pre` (voliteľné, len pri novej zákazke) = { values, onCreated(zákazka) }
    // — predvyplnenie odinakiaľ (napr. z dopytu) a čo spraviť po založení.
    form(id, pre) {
      const sc = id ? this.items.find(x => x.id === id) || {} : { ...((pre && pre.values) || {}) };
      this._onCreated = (!id && pre && pre.onCreated) || null;
      const body = `
        <form id="sub-form" onsubmit="event.preventDefault();Sub.save('${id || ''}')">
          <div class="form-grid">
            ${UI.field('title', 'Názov zákazky', { value: sc.title, required: true })}
            ${UI.field('partner_id', 'Odberateľ', { value: sc.partner_id, add: 'partner',
              onchange: 'Sub.formContracts(this.value)',
              options: [['', '— vyberte —'], ...this.partners.map(p => [p.id, p.name])] })}
            ${UI.field('contract_id', 'Zmluva o dielo', { value: sc.contract_id || '',
              options: this.contractOptions(sc.partner_id, sc.contract_id),
              tip: 'Zmluva s nemeckým odberateľom, na ktorej táto zákazka stojí. Ponúkajú sa zmluvy vybraného odberateľa. Ak ešte žiadna nie je, nechajte „zatiaľ žiadna" — pripravíte ju na zákazke v kroku 3 tlačidlom „Pripraviť zmluvu o dielo" a priradí sa sama.' })}
            ${UI.field('work_type', 'Typ prác', { value: sc.work_type || 'workshop', options: WORK_TYPE,
              hint: 'Stavba znamená A1, SOKA-BAU, Bau-Mindestlohn a zrážku §48b. '
                + 'Dielňa nič z toho — preto sa to nedá prepnúť „aby to prešlo".' })}
            ${UI.field('trade', 'Remeslo', { value: sc.trade })}
            ${UI.field('date_from', 'Od', { type: 'date', value: sc.date_from })}
            ${id && sc.date_to ? `<div class="fld"><span>Do${UI.tip('Koniec zákazky sa neprepisuje — mení sa tlačidlom „Predĺžiť / zmeniť koniec". Appka sa spýta na dôvod a zmena zostane v histórii zákazky (pravidlo: zmena koncového dátumu = záznam o predĺžení).')}</span>
                <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><strong id="sub-form-dateto">${UI.date(sc.date_to)}</strong>
                  <button type="button" class="btn btn-outline btn-sm" onclick="Sub.extendSc('${id}')">${Icon('calendar', 14)} Predĺžiť / zmeniť koniec</button></span></div>`
              : UI.field('date_to', 'Do', { type: 'date', value: sc.date_to,
                  hint: id ? 'Neskoršia zmena konca sa už zapisuje s dôvodom cez „Predĺžiť / zmeniť koniec".' : '' })}
          </div>
          <div class="form-section">Miesto výkonu</div>
          <div class="form-grid">
            ${UI.field('site_name', 'Názov stavby / dielne', { value: sc.site_name })}
            ${UI.field('site_city', 'Mesto', { value: sc.site_city })}
            ${UI.field('site_address', 'Adresa', { value: sc.site_address })}
            ${UI.field('map_link', 'Odkaz z máp', {
              value: DanubraGeo.valid(Number(sc.lat), Number(sc.lng))
                ? DanubraGeo.format(sc.lat, sc.lng) : '',
              placeholder: 'vložte odkaz — poloha sa z neho vytiahne' })}
            ${UI.field('site_postal_code', 'PSČ', { value: sc.site_postal_code })}
          </div>
          <div class="form-section">Odmena</div>
          <div class="form-grid">
            <!-- „Nikdy nerobíme na úkon, stále na hodinovku — aj pre Nemcov."
                 Model sa preto nevyberá; staré záznamy s iným modelom zostávajú. -->
            <input type="hidden" name="billing_model" value="hourly">
            ${UI.field('charge_rate', 'Sadzba pre odberateľa €/h', { type: 'number', step: '0.01',
              value: sc.charge_rate, hint: 'Fakturujeme vždy po hodinách.' })}
          </div>
          ${UI.field('scope', 'Definícia diela', { type: 'textarea', rows: 3, value: sc.scope,
            placeholder: 'Konkrétny výsledok — napr. „Montáž sadrokartónových priečok, 800 m², vrátane tmelenia"' })}
          <div class="regimebox">Werkvertrag musí definovať <strong>výsledok</strong>, nie odpracované hodiny.
          Čím konkrétnejší popis diela, tým silnejší dôkaz pri kontrole.</div>
          <div class="chk-row">
            ${UI.field('freistellung_verified', '', { type: 'checkbox', value: sc.freistellung_verified,
              placeholder: 'Odberateľ má kópiu našej Freistellung §48b',
              hint: 'Freistellungsbescheinigung máme ako firma — je zapísaná v Compliance a kým '
                + 'platí, zrážka 15 % sa neuplatní na žiadnej zákazke. Toto políčko len hovorí, '
                + 'že tento odberateľ kópiu dostal a overil si ju.' })}
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
      if (payload.contract_id === '' || payload.contract_id == null) payload.contract_id = null;

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
          return UI.toast('Číselný rad zákaziek nie je dostupný — spustite migráciu 003. ' + (e.message || ''), 'err');
        }
        res = await DB.insert('subcontracts', payload);
      }
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast(id ? 'Uložené' : 'Zákazka vytvorená', 'ok');
      const created = !id && this._onCreated; this._onCreated = null;
      if (created && res.data) { try { await created(res.data); } catch (e) { console.error('[danubra] po založení zákazky', e); } }
      await this.load(); Danubra.renderRoute();
    },

    async del(id) {
      if (!await UI.confirmArchive('Presunúť túto zákazku do archívu aj s nasadeniami?')) return;
      const { error } = await DB.archive('subcontracts', id);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal(); UI.toast(UI.ARCHIVED, 'ok');
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
        return `<div class="list-row" style="align-items:flex-start;">
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
        workers: this.workers,
        from: p.period_from, to: p.period_to,
      });
      const pv = rev.preview;

      const body = `
        <div class="regimebox">
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
          <button type="button" class="btn btn-ghost" onclick="UI.closeModal();Sub.detail('${scId}')">Zrušiť</button>
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
             onclick="UI.closeModal();Sub.detail('${scId}')">Zavrieť</button></div>`);
        return;
      }
      const body = `
        <form id="ac-form" onsubmit="event.preventDefault();Sub.assignCrew('${scId}')">
          <div class="regimebox">
            Nasadia sa všetci aktívni členovia naraz. Kto na zákazke už beží,
            ten sa preskočí — dá sa to teda spustiť znova, keď do partie niekto
            pribudne. <strong>Fakturovať bude každý sám za seba.</strong></div>
          <div class="form-grid">
            ${UI.field('crew_id', 'Partia', { value: '', required: true, add: 'crew',
              options: [['', '— vyberte —'], ...active.map(c => [c.id, c.name])] })}
            ${UI.field('date_from', 'Od', { type: 'date',
              value: sc?.date_from || new Date().toISOString().slice(0, 10),
              hint: 'Doklady sa posudzujú k tomuto dňu, nie k dnešku. Kto nastupuje '
                + 'o tri týždne a A1 mu príde o týždeň, prejde.' })}
            ${UI.field('date_to', 'Do', { type: 'date', value: sc?.date_to || '' })}
            ${UI.field('charge_rate', 'Fakturujeme €/h', { type: 'number', value: sc?.charge_rate ?? '',
              hint: 'Prázdne znamená sadzbu zo zákazky.' })}
            ${UI.field('worker_rate', 'Živnostníkom €/h', { type: 'number', value: '',
              placeholder: 'prázdne = sadzba z kartotéky',
              hint: 'Platí pre celú partiu naraz. Komu treba inú, opravte mu ju potom '
                + 'v jeho nasadení.' })}
            ${UI.field('overhead', 'Réžia €/h', { type: 'number', value: 0,
              hint: 'Ubytovanie a doprava prepočítané na hodinu. Na nule vyjde marža '
                + 'vyššia, než aká naozaj je.' })}
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal();Sub.detail('${scId}')">Zrušiť</button>
            <button type="submit" class="btn btn-primary">Nasadiť partiu</button>
          </div>
        </form>`;
      UI.modal('Nasadiť celú partiu', body, { wide: true });
    },

    assignCrew(scId) { return this._once('crew', () => this._assignCrew(scId)); },
    async _assignCrew(scId) {
      const d = UI.formData(document.getElementById('ac-form'));
      if (!d.crew_id) return UI.toast('Vyberte partiu', 'err');
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
          <p class="modal-lead">
            Nasadených <strong>${n}</strong>, ${
            skipped.length === 1 ? 'jeden zostal' : `${skipped.length} zostali`}
            na doklade.</p>
          <ul style="margin:0 0 12px;padding-left:20px;font-size:13px;line-height:1.7;">${list}</ul>
          <div class="regimebox">Doklad sa dá doplniť v kartotéke
            živnostníka. Ak to nejde počkať, <strong>výnimku pri nasadení môže
            zapísať administrátor</strong> — zostane v histórii s dôvodom.</div>
          <div class="modal-actions">
            <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
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
