// ============================================================================
// DANUBRA — Prijaté faktúry a náklady
// ============================================================================
// Druhá strana peňazí. Dve veci na jednej obrazovke, lebo sa pozerajú spolu:
// čo nám fakturujú živnostníci a čo stojí všetko ostatné.
//
// Prijatá faktúra sa porovná so schválenými hodinami hneď pri zadaní.
// Rozdiel znamená spor a sporná faktúra sa nedá schváliť bez poznámky —
// drží to trigger v databáze, táto obrazovka to len ukáže včas.
//
// Logika je v lib/billing/bills.js a má testy.
// ============================================================================
(function () {
  // Otázniky — rovnaké vysvetlenie na viacerých miestach, preto raz tu.
  const TIP = {
    vs: 'Variabilný symbol je číslo, ktoré sa zadá do platobného príkazu, aby dodávateľ vedel, čo sa '
      + 'platí. Zvyčajne je to číslo jeho faktúry. Podľa neho sa platba spáruje aj v Banke.',
    iban: 'Číslo účtu dodávateľa, kam pôjdu peniaze. Z neho vznikne platobný príkaz pre banku — '
      + 'skontrolujte ho podľa faktúry.',
    ico: 'IČO je identifikačné číslo firmy alebo živnostníka z registra (na Slovensku 8 číslic). '
      + 'Podľa neho appka spozná, od koho faktúra je.',
    period: 'Za ktoré uzavreté obdobie živnostník fakturuje. Appka potom porovná jeho sumu '
      + 'so schválenými hodinami × jeho sadzba a rozdiel ukáže.',
    worker: 'Ak je to faktúra od nášho živnostníka, vyberte ho — porovná sa s jeho hodinami. '
      + 'Ak je to iný dodávateľ (benzínka, ubytovanie, obchod), nechajte prázdne.',
    category: 'Do akej skupiny náklad patrí (práca, palivo, ubytovanie…). Používa sa v prehľadoch '
      + 'a v balíku pre účtovníčku.',
  };
  // Čo znamená stav prijatej faktúry a čo bude ďalej.
  const BILL_TIP = {
    review: 'Na kontrolu: faktúra je nahratá a appka ju prečítala, ale človek ešte nepotvrdil, '
      + 'že údaje sedia.',
    received: 'Prijatá: faktúra je zapísaná, ale ešte ju nikto neskontroloval ani neschválil.',
    checked: 'Skontrolovaná: niekto ju prezrel. Zaplatiť sa dá až po schválení.',
    disputed: 'Sporná: suma nesedí so schválenými hodinami. Schváliť sa dá len s napísaným dôvodom.',
    approved: 'Schválená: faktúra je v poriadku a dá sa zaplatiť — objaví sa v „Pripraviť platby".',
    paid: 'Uhradená: peniaze odišli. Faktúra je uzavretá.',
    self_draft: 'Návrh za živnostníka: appka ho pripravila z jeho schválených hodín. Platný ešte '
      + 'nie je — vystaví ho administrátor.',
    self_sent: 'Vystavená za živnostníka: má číslo z jeho radu a čaká, kým ju živnostník cez odkaz '
      + 'potvrdí. Bez potvrdenia sa neplatí.',
    discarded: 'Zahodená: nikam sa nepočíta, ale doklad zostal uložený aj s dôvodom.',
  };

  const Cost = {
    tab: 'bills',
    bills: [], costs: [], workers: [], periods: [], timesheets: [], assignments: [],
    subcontracts: [], loaded: false,
    filters: { status: '', q: '', category: '', period: 'all', from: '', to: '' },

    async load() {
      const [b, c, w, per, ts, a, s] = await Promise.all([
        DB.list('bills', { order: { column: 'issue_date', ascending: false }, limit: 500 }),
        DB.list('costs', { order: { column: 'cost_date', ascending: false }, limit: 1000 }),
        DB.list('workers', { select: 'id,full_name,company_id,company_name,bank_iban,hourly_cost,phone,'
          + 'tax_id,vat_id,vat_payer,address,city,business_address,business_city,business_zip,'
          + 'self_billing,self_billing_prefix', limit: 500 }),
        DB.list('periods', { limit: 500 }),
        DB.list('timesheets', { limit: 5000 }),
        DB.list('assignments', { limit: 1000 }),
        DB.list('subcontracts', { select: 'id,title,contract_number', limit: 500 }),
        Enums.load(),
      ]);
      this.bills = b.data || []; this.costs = c.data || [];
      this.workers = w.data || []; this.periods = per.data || [];
      this.timesheets = ts.data || []; this.assignments = a.data || [];
      this.subcontracts = s.data || [];
      this.loaded = true;
    },

    workerOf(id) { return this.workers.find(w => w.id === id) || {}; },
    subOf(id) { return this.subcontracts.find(s => s.id === id) || {}; },
    periodLabel(id) {
      const p = this.periods.find(x => x.id === id);
      return p ? UI.dateRange(p.period_from, p.period_to) : null;
    },
    ctx(bill) {
      return {
        bill,
        worker: this.workerOf(bill.worker_id),
        timesheets: this.timesheets,
        assignments: this.assignments,
      };
    },

    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }

      // Čo na prijatých faktúrach čaká na nás. Poradie drží knižnica:
      // sporné, potom po splatnosti, potom neskontrolované.
      const q = DanubraBills.queue(this.bills, Danubra._dayISO());
      Danubra.setActions(this.tab === 'bills'
        ? `${this.selfWorkers().length ? `<button class="btn btn-outline btn-sm" onclick="Cost.selfForm()">${Icon('receipt')} Vystaviť za živnostníkov</button>` : ''}
           <button class="btn btn-outline btn-sm" onclick="Bank.payForm()">${Icon('wallet')} Pripraviť platby</button>
           <button class="btn btn-outline btn-sm" onclick="Cost.billForm()">${Icon('plus')} Zadať ručne</button>
           <button class="btn btn-primary btn-sm" onclick="Cost.pickFiles()">${Icon('upload')} Nahrať faktúry</button>`
        : `<button class="btn btn-primary btn-sm" onclick="Cost.costForm()">${Icon('plus')} Náklad</button>`);
      const head = Danubra.header(Danubra.labelOf('costs'),
        'Čo nám fakturujú živnostníci a dodávatelia a čo stojí všetko ostatné')
        + `<div class="filterbar" style="margin-bottom:12px;">
             <button class="fb-chip${this.tab === 'bills' ? ' active' : ''}" onclick="Cost.setTab('bills')">
               Faktúry a bločky<em>${this.bills.length}</em></button>
             <button class="fb-chip${this.tab === 'costs' ? ' active' : ''}" onclick="Cost.setTab('costs')">
               Ostatné náklady<em>${this.costs.length}</em></button>
           </div>`
        + (this.tab === 'bills' ? this.nowHtml(q) : '');

      el.innerHTML = head + (this.tab === 'bills'
        ? this.dropHtml() + this.reviewHtml(q) + this.billsHtml(q) : this.costsHtml());
      this.pollIfReading();
    },

    /**
     * Jedna veta a jedno tlačidlo, ktoré otvorí práve tú faktúru, čo je na
     * rade. Ostatné náklady vetu nemajú — tam sa nič neschvaľuje ani
     * neporovnáva, je to evidencia.
     */
    nowHtml(q) {
      const n = q.next || this.nicNecaka();
      const label = { disputed: 'Otvoriť spornú', pay: 'Otvoriť najstaršiu', review: 'Skontrolovať', self: 'Otvoriť návrh',
        check: 'Otvoriť na kontrolu', willpay: 'Pozrieť schválené' }[n.key] || 'Otvoriť';
      const ico = { disputed: 'alert', pay: 'wallet', check: 'check', willpay: 'calendar',
        review: 'doc', self: 'receipt' }[n.key] || 'chevron';
      const open = n.key === 'review' ? 'reviewBill' : 'billDetail';
      return Shell.now(n, {
        help: 'card.bills.now',
        action: n.bill ? { label, ico, onclick: `Cost.${open}('${n.bill.id}')` } : null,
      });
    },

    /** Aj „nič nečaká" je veta. Obrazovka nemá nikdy mlčať. */
    nicNecaka() {
      return { key: 'ok', title: 'Nič nečaká',
        what: 'Nič nie je sporné, neskontrolované ani po splatnosti.',
        why: 'Keď niečo pribudne, bude to tu napísané ako prvé.', hot: false };
    },

    setTab(t) {
      this.tab = t;
      this.filters = { status: '', q: '', category: '', period: 'all', from: '', to: '' };
      Danubra.renderRoute();
    },
    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    // ── Prijaté faktúry ───────────────────────────────────────────────────
    // Zoznam je spoločný komponent (`DataList`): stĺpce, filtre s počtami,
    // čipy, zoradenie, súčet v päte a na telefóne karty. Dovtedy tu boli karty
    // s hľadaním, výberom stavu a obdobím.
    billsHtml(q) {
      return DataList.html(this.billConfig(this.billListRows(q)));
    },

    /** Stavy, ktoré sú v zozname predvolene: bez nahratých na kontrolu (majú kartu hore) a zahodených. */
    BILL_LIST_STATUSES: ['received', 'checked', 'disputed', 'approved', 'paid', 'self_draft', 'self_sent'],

    /** Názov stavu prijatej faktúry — z číselníka, inak záloha (číselník sa nemusí načítať). */
    billStatusLabel(s) {
      const FB = { review: 'Na kontrolu', received: 'Prijatá', checked: 'Skontrolovaná', disputed: 'Sporná',
        approved: 'Schválená', paid: 'Uhradená', self_draft: 'Návrh za živnostníka',
        self_sent: 'Čaká na potvrdenie živnostníka', discarded: 'Zahodená' };
      const l = Enums.label('bill_status', s);
      return l && l !== s ? l : (FB[s] || l || '');
    },
    catLabel(c) {
      const FB = { work: 'Práca', accommodation: 'Ubytovanie', transport: 'Doprava', fuel: 'Palivo', tools: 'Náradie',
        material: 'Materiál', other: 'Iné' };
      const l = Enums.label('cost_category', c);
      return l && l !== c ? l : (FB[c] || l || '');
    },

    /**
     * Riadok zoznamu prijatých faktúr: faktúra a to, čo sa o nej počíta raz
     * za vykreslenie — porovnanie s hodinami (`DanubraBills.check`) a poradie
     * „čo je na rade" (`sortByWork`).
     */
    billListRows(q) {
      const today = Danubra._dayISO();
      const DL = DanubraDataList;
      const order = new Map(this.sortByWork(this.bills.slice(), q).map((b, i) => [b.id, i]));
      const grp = (b) => {
        if (!q) return 3;
        if (q.disputed.some(x => x.id === b.id)) return 0;
        if (q.toCheck.some(x => x.id === b.id)) return 1;
        if (q.latePay.some(x => x.id === b.id)) return 2;
        return 3;
      };
      const UNPAID = ['received', 'checked', 'disputed', 'approved', 'self_draft', 'self_sent'];
      return this.bills.map(b => {
        const w = this.workerOf(b.worker_id);
        const live = DanubraBills.check(b, this.ctx(b));
        // Bez obdobia sa naživo porovnať nedá — vtedy platí rozdiel, ktorý pri
        // uložení zapísala databáza (sporná faktúra ho má vždy).
        const c = live.variance == null && b.variance != null && b.expected_amount != null
          ? { ...live, expected: Money.toCents(b.expected_amount), variance: Money.toCents(b.variance), stored: true } : live;
        const off = c.variance != null && Math.abs(c.variance) > DanubraBills.TOLERANCE;
        const due = b.due_date ? String(b.due_date).slice(0, 10) : '';
        const unpaid = UNPAID.includes(b.status);
        const self = b.source === 'self_billing';
        const receipt = this.isReceipt(b);
        const druh = self ? 'self' : b.worker_id ? 'worker' : receipt ? 'receipt'
          : b.category === 'accommodation' ? 'accommodation' : 'other';
        return {
          id: b.id, b, c, off, self, receipt, druh, unpaid,
          who: w.full_name || b.supplier_name || (b.extracted && b.extracted._file) || '',
          whoKey: b.worker_id ? `w:${b.worker_id}` : b.supplier_name ? `s:${String(b.supplier_name).trim().toLowerCase()}` : '',
          ico: b.supplier_ico || w.company_id || '',
          subTitle: b.subcontract_id ? (this.subOf(b.subcontract_id).title || 'Zákazka') : '',
          period: this.periodLabel(b.period_id) || '',
          cents: Money.toCents(b.amount),
          days: due ? DL.daysBetween(today, due) : null,
          late: unpaid && !!due && due < today,
          work: grp(b), pos: order.get(b.id) ?? 0,
        };
      });
    },

    /** Konfigurácia zoznamu prijatých faktúr pre `DataList`. */
    billConfig(rows) {
      const DL = DanubraDataList;
      const rok = Danubra._dayISO().slice(0, 4);
      const day = (d) => DL.fmtDay(d, { year: String(d).slice(0, 4) !== rok });
      const dni = (n) => `${n} ${Shell.plural(n, 'deň', 'dni', 'dní')}`;
      const DRUH = { worker: 'Živnostník', self: 'Samofakturácia', accommodation: 'Ubytovanie', receipt: 'Bloček', other: 'Iný dodávateľ' };
      // Krátke názvy stavov do úzkeho stĺpca; celý názov je v detaile aj vo filtri.
      const SHORT = { self_sent: 'Čaká na potvrdenie', self_draft: 'Návrh za živnostníka' };
      const DRUH_ICO = { worker: 'user', self: 'receipt', accommodation: 'bed', receipt: 'receipt', other: 'invoices' };
      const statusIdx = (s) => { const i = ['self_draft', 'disputed', 'received', 'checked', 'self_sent', 'approved', 'paid', 'review', 'discarded'].indexOf(s); return i < 0 ? 99 : i; };
      const dueCell = (r) => {
        if (!r.b.due_date) return '';
        const d = `<b>${day(r.b.due_date)}</b>`;
        if (!r.unpaid || r.days == null) return `<span class="dl-two">${d}</span>`;
        const note = r.days < 0 ? `<span class="dl-note is-red">po splatnosti ${dni(-r.days)}</span>`
          : r.days === 0 ? '<span class="dl-note is-amber">splatná dnes</span>'
            : `<span class="dl-note ${r.days <= 7 ? 'is-amber' : 'is-mute'}">splatná o ${dni(r.days)}</span>`;
        return `<span class="dl-two">${d}${note}</span>`;
      };
      const checkCell = (r) => {
        if (r.off) {
          const t = r.c.variance > 0 ? `o ${Money.format(r.c.variance)} viac` : `o ${Money.format(Math.abs(r.c.variance))} menej`;
          return `<button type="button" class="tip-btn dl-flag" data-tip="${UI.esc(`${t}, než ${r.c.stored ? 'dávajú' : `dáva ${r.c.hours} h`} schválené hodiny × sadzba (${Money.format(r.c.expected)}).`)}"
            aria-label="Nesedí s hodinami: ${UI.esc(t)}">${Icon('alert', 12)} ${UI.esc(t)}</button>`;
        }
        if (r.c.variance != null) return `<span class="dl-ok">${Icon('check', 13)} sedí (${r.c.hours} h)</span>`;
        return '';
      };
      return {
        id: 'prijate', storageKey: 'prijate', label: 'Prijaté faktúry',
        noun: ['faktúra', 'faktúry', 'faktúr'],
        rows,
        rowClick: (r) => Cost.billDetail(r.id),
        rowClass: (r) => (r.work === 0 ? 'is-hot' : r.work < 3 || r.b.status === 'self_draft' ? 'is-warn'
          : ['paid', 'discarded'].includes(r.b.status) ? 'is-muted' : ''),
        rowLabel: (r) => `Faktúra ${r.b.bill_number || ''} od ${r.who || 'dodávateľa'}`,
        rowActions: [{ ico: 'chevron', label: 'Otvoriť faktúru', run: (r) => Cost.billDetail(r.id) }],
        columns: [
          { key: 'kto', label: 'Od koho', width: 'minmax(140px, 1.3fr)', mobile: 'title',
            render: (r) => {
              const sub = [r.b.worker_id ? DRUH[r.druh] : this.catLabel(r.b.category), r.ico ? `IČO ${r.ico}` : ''].filter(Boolean).join(' · ');
              return `<span class="dl-title"><b>${UI.esc(r.who || '—')}</b>${sub ? `<small>${UI.esc(sub)}</small>` : ''}</span>`;
            },
            sortValue: (r) => r.who, sortLabel: 'Dodávateľ' },
          { key: 'cislo', label: 'Číslo', width: '112px', mobileLabel: 'č.',
            render: (r) => (r.b.bill_number || r.b.variable_symbol ? `<span class="dl-two"><b class="mono">${UI.esc(r.b.bill_number || '—')}</b>${
              r.b.variable_symbol ? `<small>VS ${UI.esc(r.b.variable_symbol)}</small>` : ''}</span>` : ''),
            sortValue: (r) => r.b.bill_number || null },
          { key: 'druh', label: 'Druh', width: '112px', hideBelow: 1200,
            render: (r) => `<span class="dl-tag">${Icon(DRUH_ICO[r.druh] || 'invoices', 14)}${DRUH[r.druh]}</span>`,
            sortValue: (r) => DRUH[r.druh] },
          { key: 'zakazka', label: 'Zákazka', width: 'minmax(100px, 1fr)', hideBelow: 1020,
            render: (r) => (r.b.subcontract_id ? `<span class="dl-two">${Danubra.link('subcontract', r.b.subcontract_id, r.subTitle)}${
              r.period ? `<small>${r.period}</small>` : ''}</span>` : ''),
            sortValue: (r) => r.subTitle || null },
          { key: 'datum', label: 'Vystavená', width: '76px', mobileLabel: 'vystavená',
            render: (r) => (r.b.issue_date ? `<span class="dl-num">${day(r.b.issue_date)}</span>` : ''),
            sortValue: (r) => r.b.issue_date || null, sortDir: -1 },
          { key: 'splatnost', label: 'Splatnosť', width: '116px', mobileLabel: 'splatná',
            render: dueCell, sortValue: (r) => (r.unpaid ? r.b.due_date || null : null) },
          { key: 'suma', label: 'Suma', width: '98px', align: 'right',
            render: (r) => `<b class="dl-num dl-amt">${Money.format(r.cents)}</b>`,
            sortValue: (r) => r.cents, sortDir: -1 },
          { key: 'kontrola', label: 'S hodinami', width: '124px', hideBelow: 960,
            tip: 'Faktúra od živnostníka naviazaná na uzavreté obdobie sa porovná so schválenými hodinami × jeho sadzba. '
              + 'Rozdiel nad 1 cent je spor. Ukážte myšou na štítok — povie, o koľko.',
            render: checkCell, sortValue: (r) => (r.c.variance == null ? null : Math.abs(r.c.variance)), sortDir: -1 },
          { key: 'stav', label: 'Stav', width: '136px', mobile: 'badge',
            render: (r) => `${UI.badge(SHORT[r.b.status] || this.billStatusLabel(r.b.status), this.billKind(r.b.status))}${
              r.b.payment_ordered_at && r.b.status === 'approved' ? `<small class="dl-note is-mute" style="display:block;">príkaz ${day(r.b.payment_ordered_at)}</small>` : ''}`,
            // Predvolené poradie ako predtým: sporné, neskontrolované, po splatnosti, zvyšok.
            sortValue: (r) => [r.work, r.pos], sortLabel: 'Čo je na rade' },
        ],
        sorts: [{ key: 'stav-n', label: 'Stav', value: (r) => statusIdx(r.b.status) }],
        sort: { key: 'stav', dir: 1 },
        groups: [
          { key: 'stav', label: 'Stav', value: (r) => r.b.status, labelOf: (k) => this.billStatusLabel(k),
            tone: (k) => this.billKind(k), order: ['self_draft', 'disputed', 'received', 'checked', 'self_sent', 'approved', 'paid', 'review', 'discarded'] },
          { key: 'druh', label: 'Druh', value: 'druh', labelOf: (k) => DRUH[k] || k, order: ['worker', 'self', 'accommodation', 'receipt', 'other'] },
          { key: 'kto', label: 'Dodávateľ', value: (r) => r.who || '—' },
        ],
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať číslo, meno, dodávateľa, VS…',
            label: 'Hľadať podľa čísla, mena, dodávateľa, IČO alebo variabilného symbolu',
            fields: ['b.bill_number', 'who', 'b.variable_symbol', 'ico', 'subTitle', 'b.note'] },
          { key: 'stav', type: 'multi', label: 'Stav', value: (r) => r.b.status, default: this.BILL_LIST_STATUSES,
            options: ['received', 'checked', 'disputed', 'approved', 'paid', 'self_draft', 'self_sent', 'review', 'discarded']
              .map(k => [k, this.billStatusLabel(k)]), sortOptions: false, allLabel: 'Všetky aj zahodené',
            hint: 'Nahraté faktúry na kontrolu majú vlastnú kartu hore; zahodené sú v zozname len na vyžiadanie.',
            presets: [
              { label: 'Platné', value: this.BILL_LIST_STATUSES, hint: 'Všetko okrem nahratých na kontrolu a zahodených' },
              { label: 'Neuhradené', value: ['received', 'checked', 'disputed', 'approved', 'self_sent'], hint: 'Ešte sme ich nezaplatili' },
              { label: 'Na kontrolu', value: ['received', 'disputed', 'self_draft'], hint: 'Prijaté, sporné a návrhy za živnostníkov — čaká sa na nás' },
            ] },
          { key: 'druh', type: 'multi', label: 'Druh', value: 'druh', sortOptions: false,
            options: ['worker', 'self', 'accommodation', 'receipt', 'other'].map(k => [k, DRUH[k]]) },
          { key: 'kto', type: 'select', label: 'Dodávateľ', value: 'whoKey', optionLabel: (v, r) => (r ? r.who : v),
            allLabel: 'Všetci dodávatelia' },
          { key: 'late', type: 'toggle', label: 'Po splatnosti', test: (r) => r.late,
            hint: 'Ešte nezaplatené faktúry, ktorých splatnosť uplynula.' },
          { key: 'spor', type: 'toggle', label: 'Nesedí s hodinami', test: (r) => r.off, more: true,
            hint: 'Faktúry, ktorých suma sa líši od schválených hodín × sadzba.' },
          { key: 'zakazka', type: 'select', label: 'Zákazka', value: (r) => r.b.subcontract_id || '', more: true,
            optionLabel: (v, r) => (r ? r.subTitle : v), emptyLabel: 'Bez zákazky', allLabel: 'Všetky zákazky' },
          { key: 'vystavena', type: 'range-date', label: 'Vystavená', field: 'b.issue_date', more: true },
          { key: 'splatnost', type: 'range-date', label: 'Splatnosť', field: 'b.due_date', more: true },
          { key: 'suma', type: 'range-number', label: 'Suma', value: (r) => r.cents / 100, unit: '€', more: true },
        ],
        empty: { ico: 'invoices', title: 'Zatiaľ žiadna prijatá faktúra',
          sub: 'Nahrajte PDF faktúry — appka ju prečíta. Faktúra od živnostníka sa porovná s hodinami.' },
        // Súčet toho, čo je vidieť — v centoch.
        foot: (list) => {
          const open = list.filter(r => r.unpaid);
          return { cells: {
            kto: `<span class="dl-foot-l">Spolu <em>${list.length} ${Shell.plural(list.length, 'faktúra', 'faktúry', 'faktúr')}</em></span>`,
            suma: `<b class="dl-num" data-sum="suma">${Money.format(Money.sum(list.map(r => r.cents)))}</b>`,
            kontrola: open.length ? `<span class="dl-two"><b class="dl-num" data-sum="neuhradene">${Money.format(Money.sum(open.map(r => r.cents)))}</b><small>neuhradené</small></span>` : '',
          } };
        },
        export: {
          name: ['prijate-faktury'],
          columns: [
            ['Číslo', r => r.b.bill_number], ['Od koho', r => r.who], ['Druh', r => DRUH[r.druh]],
            ['IČO', r => r.ico], ['VS', r => r.b.variable_symbol],
            ['Zákazka', r => r.subTitle], ['Obdobie', r => r.period],
            ['Vystavená', r => r.b.issue_date], ['Splatnosť', r => r.b.due_date],
            ['Stav', r => this.billStatusLabel(r.b.status)],
            ['Suma', r => DanubraExport.num(r.b.amount)],
            ['Očakávané', r => (r.c.expected != null ? DanubraExport.num(Money.fromCents(r.c.expected)) : DanubraExport.num(r.b.expected_amount))],
            ['Rozdiel', r => (r.c.variance != null ? DanubraExport.num(Money.fromCents(r.c.variance)) : DanubraExport.num(r.b.variance))],
          ],
        },
      };
    },

    /**
     * Poradie podľa toho, čo treba spraviť: sporné, neskontrolované, po
     * splatnosti, zvyšok. V skupine zostáva pôvodné poradie.
     */
    sortByWork(rows, q) {
      if (!q) return rows;
      const skupina = (b) => {
        if (q.disputed.some(x => x.id === b.id)) return 0;
        if (q.toCheck.some(x => x.id === b.id)) return 1;
        if (q.latePay.some(x => x.id === b.id)) return 2;
        return 3;
      };
      return rows
        .map((b, i) => ({ b, i, g: skupina(b) }))
        .sort((a, c) => a.g - c.g || a.i - c.i)
        .map(x => x.b);
    },

    /** Prijaté faktúry, ktoré sú po filtroch vidieť. Export vyváža presne toto. */
    billRows() {
      const vid = window.DataList && DataList._reg.prijate ? DataList.visible('prijate') : null;
      return vid ? vid.map(r => r.b) : this.bills.filter(b => !['review', 'discarded'].includes(b.status));
    },

    /** Export do CSV — ten istý, ako tlačidlo Export v zozname. */
    exportBills() { const btn = document.querySelector('#dl-prijate [data-dl-a="export"]'); if (btn) btn.click(); },
    exportCosts() { const btn = document.querySelector('#dl-naklady [data-dl-a="export"]'); if (btn) btn.click(); },

    billKind(s) {
      return { received: 'gray', checked: 'blue', disputed: 'red', review: 'amber', self_draft: 'amber', self_sent: 'blue',
        approved: 'green', paid: 'green', discarded: 'gray' }[s] || 'gray';
    },

    // ── Nahrať faktúry zo súboru ──────────────────────────────────────────
    // „Chcem to vedieť nahrávať cez PDF, kde vyextrahuješ, čo treba."
    // Súbor ide do privátneho úložiska, faktúra vznikne „Na kontrolu" a server
    // ju na pozadí prečíta (danubra-read-bill-background). Potvrdzuje človek.

    pickFiles() { document.getElementById('bill-files')?.click(); },

    /** Bloček: nahratý cez „Odfotiť bloček" alebo ho tak prečítal model. */
    isReceipt(b) {
      const x = (b && b.extracted) || {};
      return !!(x._receipt || x.doc_type === 'receipt');
    },

    dropHtml() {
      return `<label class="bill-drop" id="bill-drop"
          ondragover="event.preventDefault();this.classList.add('over')"
          ondragleave="this.classList.remove('over')"
          ondrop="event.preventDefault();this.classList.remove('over');Cost.upload(event.dataTransfer.files)">
          <input type="file" id="bill-files" multiple hidden
            accept=".pdf,.xml,application/pdf,application/xml,text/xml,image/*"
            onchange="Cost.upload(this.files);this.value=''">
          <span class="bill-drop-ico">${Icon('upload', 22)}</span>
          <span><b class="only-desk">Pretiahnite sem faktúry alebo bločky</b><span class="only-desk"> alebo kliknite a vyberte — aj viac naraz.</span>
            <b class="only-mob">Nahrať faktúry zo súboru</b>
            <em>PDF, fotka alebo e-faktúra (XML). Appka z nich prečíta dodávateľa, sumy,
            splatnosť aj IBAN.</em></span>
        </label>
        <!-- Na telefóne rovno fotoaparát: papierovú faktúru aj bloček stačí odfotiť. -->
        <div class="bill-cams">
          <label class="btn btn-primary bill-camera only-mob">
            <input type="file" accept="image/*" capture="environment" hidden
              onchange="Cost.upload(this.files);this.value=''">
            ${Icon('upload', 16)} Odfotiť faktúru
          </label>
          <label class="btn btn-outline bill-camera bill-receipt">
            <input type="file" accept="image/*,application/pdf" capture="environment" hidden multiple
              onchange="Cost.upload(this.files,{receipt:true});this.value=''">
            ${Icon('receipt', 16)} Odfotiť bloček
          </label>
        </div>`;
    },

    async upload(files, { receipt = false } = {}) {
      const list = [...(files || [])];
      if (!list.length) return;
      if (!window.DanubraExtract) return UI.toast('Čítanie faktúr sa nenačítalo — obnovte stránku', 'err');
      let n = 0;
      UI.toast(list.length === 1 ? 'Nahrávam faktúru…' : `Nahrávam ${list.length} faktúr…`, 'ok');
      for (const file of list) {
        const kind = DanubraExtract.fileKind(file);
        if (!kind) { UI.toast(`${file.name}: tento súbor neviem prečítať (PDF, XML, JPG, PNG)`, 'err'); continue; }
        if (file.size > 25 * 1024 * 1024) { UI.toast(`${file.name}: súbor je väčší ako 25 MB`, 'err'); continue; }
        // Prehliadač niekedy typ nepovie — úložisko by súbor bez typu odmietlo.
        const typ = file.type || { pdf: 'application/pdf', xml: 'application/xml', image: 'image/jpeg' }[kind];
        let f = file.type ? file : new File([file], file.name, { type: typ });
        // Fotka z telefónu: zmenšiť a previesť na JPG (iPhone fotí v HEIC,
        // ktorý model neprečíta, a 12 Mpx fotka sa zbytočne dlho nahráva).
        if (kind === 'image') f = await this.toJpeg(f);
        const up = await DB.uploadDoc(f, { folder: 'prijate-faktury', entityId: Danubra._dayISO() });
        if (up.error || !up.path) {
          UI.toast(`${file.name}: nenahralo sa (${(up.error && up.error.message) || 'chyba úložiska'})`, 'err');
          continue;
        }
        const { data: bill, error } = await DB.insert('bills', {
          status: 'review', source: kind, storage_path: up.path, amount: 0,
          extract_status: 'pending', extracted: { _file: file.name, ...(receipt ? { _receipt: true } : {}) },
          created_by: Danubra.user?.id || null,
        });
        if (error) { UI.toast(`${file.name}: ${error.message}`, 'err'); continue; }
        this.read(bill.id);
        n++;
      }
      if (n) UI.toast(n === 1 ? 'Nahraté — appka ju číta' : `Nahraté (${n}) — appka ich číta`, 'ok');
      this.loaded = false; await this.load(); Danubra.renderRoute();
    },

    /** Fotka → JPG, dlhšia strana najviac 2200 px. Keď to nejde, ide pôvodný súbor. */
    async toJpeg(file) {
      try {
        const url = URL.createObjectURL(file);
        const img = await new Promise((ok, zle) => {
          const i = new Image(); i.onload = () => ok(i); i.onerror = zle; i.src = url;
        });
        const k = Math.min(1, 2200 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.85));
        if (!blob) return file;
        const meno = String(file.name || 'faktura').replace(/\.[^.]+$/, '') + '.jpg';
        return new File([blob], meno, { type: 'image/jpeg' });
      } catch { return file; }
    },

    /** Spustí čítanie na serveri. Odpovie hneď (202), výsledok sa zapíše k faktúre. */
    read(id) {
      const s = Danubra.supplier() || {};
      fetch('/.netlify/functions/danubra-read-bill-background', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId: id, company: { name: s.name || '', ico: s.company_id || '' } }),
      }).catch(() => {});
    },

    /** Kým sa niečo číta, každé tri sekundy sa pozrie, či je hotovo. */
    pollIfReading() {
      const citam = this.bills.some(b => b.status === 'review' && b.extract_status === 'pending');
      if (!citam || this._poll) return;
      let kolo = 0;
      const krok = async () => {
        kolo++;
        const { data } = await DB.list('bills', { order: { column: 'issue_date', ascending: false }, limit: 500 });
        if (data) this.bills = data;
        const este = this.bills.some(b => b.status === 'review' && b.extract_status === 'pending');
        if (Danubra.route === 'costs' && this.tab === 'bills') {
          const open = this._reviewOpen && this.bills.find(b => b.id === this._reviewOpen);
          if (open && open.extract_status !== 'pending' && document.getElementById('br-form-wait')) {
            this.reviewBill(open.id);
          }
          const box = document.getElementById('bill-review');
          if (box) box.outerHTML = this.reviewHtml(DanubraBills.queue(this.bills, Danubra._dayISO()));
        }
        // Po troch minútach to vzdá — niečo sa pokazilo a treba to vidieť.
        if (este && kolo < 60) this._poll = setTimeout(krok, 3000);
        else { this._poll = null; if (Danubra.route === 'costs') Danubra.renderRoute(); }
      };
      this._poll = setTimeout(krok, 3000);
    },

    /** Karta „Na kontrolu": čo je nahraté a ešte nepotvrdené. */
    reviewHtml(q) {
      const list = (q && q.review) || [];
      if (!list.length) return '<div id="bill-review"></div>';
      const s = Danubra.supplier() || {};
      const riadok = (b) => {
        const x = b.extracted || {};
        const kto = this.workerOf(b.worker_id).full_name || b.supplier_name || x._file || 'Faktúra';
        let stav;
        if (b.extract_status === 'pending') stav = `<span class="br-reading">${Icon('clock', 13)} Čítam…</span>`;
        else if (b.extract_status === 'error') stav = `<span style="color:var(--red);">${Icon('alert', 13)} Nepodarilo sa prečítať</span>`;
        else {
          const w = DanubraExtract.warnings(x, { worker: b.worker_id ? this.workerOf(b.worker_id) : null,
            company: { ico: s.company_id }, bills: this.bills, selfId: b.id });
          stav = w.length ? `<span style="color:var(--amber);">${Icon('alert', 13)} ${w.length} na overenie</span>`
            : `<span style="color:var(--green);">${Icon('check', 13)} Prečítaná</span>`;
        }
        return `<button class="list-row br-row" onclick="Cost.reviewBill('${b.id}')">
          <span style="flex:1;min-width:0;"><strong>${UI.esc(kto)}</strong>
            <span style="color:var(--ink-mute);display:block;font-size:12.5px;">
              ${b.bill_number ? `${UI.esc(b.bill_number)} · ` : ''}${Number(b.amount) ? Money.format(Money.toCents(b.amount)) : '—'}
              ${b.due_date ? ` · splatná ${UI.date(b.due_date)}` : ''}</span></span>
          <span class="br-state">${stav}</span>
          <span style="color:var(--ink-mute);display:flex;">${Icon('chevron', 15)}</span></button>`;
      };
      return `<div class="card br-card" id="bill-review">
        <div class="br-head">${Icon('doc', 15)} Na kontrolu <em>${list.length}</em>${UI.tip(BILL_TIP.review
          + ' Kliknite na riadok, porovnajte údaje s dokladom a potvrďte.')}
          <span>Appka faktúru prečítala — skontrolujte a potvrďte.</span></div>
        ${list.map(riadok).join('')}
      </div>`;
    },

    /** Kontrola nahratej faktúry: vľavo doklad, vpravo čo z neho appka prečítala. */
    reviewBill(id) {
      const b = this.bills.find(x => x.id === id);
      if (!b) return UI.toast('Nenájdené', 'err');
      this._reviewOpen = id;
      const x = b.extracted || {};
      const s = Danubra.supplier() || {};
      const worker = b.worker_id ? this.workerOf(b.worker_id) : null;
      const periods = this.periods.filter(p => p.status !== 'open')
        .map(p => [p.id, `${this.subOf(p.subcontract_id).title || 'Zákazka'} · ${UI.dateRange(p.period_from, p.period_to)}`]);

      if (b.extract_status === 'pending') {
        UI.modal('Čítam faktúru…', `
          <div id="br-form-wait" class="regimebox">${Icon('clock', 14)} Appka práve číta
            <b>${UI.esc(x._file || 'súbor')}</b>. Zvyčajne to trvá do pol minúty — okno sa
            samo obnoví, keď bude hotovo.</div>
          <div class="modal-actions"><button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button></div>`);
        return;
      }

      const warn = b.extract_status === 'done'
        ? DanubraExtract.warnings(x, { worker, company: { ico: s.company_id }, bills: this.bills, selfId: b.id }) : [];
      const how = x._match === 'ico' ? 'podľa IČO' : x._match === 'iban' ? 'podľa IBAN-u'
        : x._match === 'name' ? 'podľa mena — overte' : null;

      const body = `
        <div class="br-grid">
          <div class="br-doc" id="br-doc"><div class="br-doc-wait">${Icon('doc', 18)} Načítavam doklad…</div></div>
          <form id="br-form" onsubmit="event.preventDefault();Cost.confirmReview('${b.id}')">
            ${b.extract_status === 'error' ? `<div class="warnbox br-warn">
              <div>${Icon('alert', 14)}<span>${UI.esc(b.extract_error || 'Faktúru sa nepodarilo prečítať.')}</span></div>
              <div class="br-warn-sub">Doplňte údaje ručne podľa dokladu, alebo
              <a href="#" onclick="event.preventDefault();Cost.rereadBill('${b.id}')">skúste to znova</a>.</div></div>` : ''}
            ${warn.length ? `<div class="warnbox br-warn">
              ${warn.map(t => `<div>${Icon('alert', 13)}<span>${UI.esc(t)}</span></div>`).join('')}</div>` : ''}
            ${x.note ? `<div class="notebox">${UI.esc(x.note)}</div>` : ''}

            <div class="form-section">Od koho</div>
            <div class="form-grid">
              ${UI.field('worker_id', `Živnostník${how && b.worker_id ? ` (${how})` : ''}`, { value: b.worker_id || '', add: 'worker',
                tip: TIP.worker,
                options: [['', '— nie je živnostník (iný dodávateľ) —'], ...this.workers.map(w => [w.id, w.full_name])] })}
              ${UI.field('supplier_name', 'Dodávateľ', { value: b.supplier_name || '' })}
              ${UI.field('supplier_ico', 'IČO', { value: b.supplier_ico || '', tip: TIP.ico })}
              ${UI.field('supplier_ic_dph', 'IČ DPH', { value: b.supplier_ic_dph || '',
                tip: 'IČ DPH je číslo pre daň z pridanej hodnoty (napr. SK2020123456). Má ho len platiteľ DPH — '
                  + 'živnostník bez DPH ho nemá, vtedy nechajte prázdne.' })}
              ${UI.field('supplier_iban', 'IBAN', { value: b.supplier_iban || '', tip: TIP.iban })}
              ${UI.field('category', 'Druh nákladu', { value: b.category || '', tip: TIP.category,
                options: [['', '— vyberte —'], ...Enums.options('cost_category')] })}
            </div>

            <div class="form-section">Faktúra</div>
            <div class="form-grid">
              ${UI.field('bill_number', 'Číslo faktúry', { value: b.bill_number || '' })}
              ${UI.field('variable_symbol', 'Variabilný symbol', { value: b.variable_symbol || '', tip: TIP.vs })}
              ${UI.field('amount', 'Na úhradu € (s DPH)', { type: 'number', value: Number(b.amount) || '', required: true,
                tip: 'Celá suma, ktorú máme zaplatiť — „Spolu na úhradu" z faktúry, vrátane DPH, ak ju dodávateľ účtuje.' })}
              ${UI.field('vat_amount', 'Z toho DPH €', { type: 'number', value: Number(b.vat_amount) || 0,
                tip: 'Koľko z tej sumy je DPH. Živnostník bez DPH ju nemá — nechajte 0. Appka z toho '
                  + 'vypočíta sumu bez DPH (základ).' })}
              ${UI.field('issue_date', 'Vystavená', { type: 'date', value: b.issue_date || '' })}
              ${UI.field('due_date', 'Splatnosť', { type: 'date', value: b.due_date || '' })}
              ${UI.field('subcontract_id', 'Zákazka (nepovinné)', { value: b.subcontract_id || '', add: 'subcontract',
                tip: 'Ku ktorej stavbe náklad patrí. Keď nižšie vyberiete obdobie hodín, zákazka sa doplní sama.',
                options: [['', '— žiadna —'], ...this.subcontracts.map(z => [z.id, z.title])] })}
              ${UI.field('period_id', 'Obdobie hodín (živnostník)', { value: b.period_id || '', tip: TIP.period,
                options: [['', '— bez obdobia —'], ...periods] })}
            </div>
            ${(x.items || []).length ? `<details class="br-items"><summary>Položky na faktúre (${x.items.length})</summary>
              ${x.items.map(i => `<div><span>${UI.esc(i.description || '—')}</span>
                <b>${i.total != null ? Money.format(Money.toCents(i.total)) : ''}</b></div>`).join('')}</details>` : ''}
            <label class="chk chk-lg br-paid">
              <input type="checkbox" name="paid_now" ${this.isReceipt(b) ? 'checked' : ''}>
              <span><b>Už zaplatené</b> — bloček, karta alebo hotovosť. Nepôjde do „Zaplatiť".</span>
            </label>
            ${UI.field('note', 'Poznámka', { type: 'textarea', value: b.note || '' })}
          </form>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-danger" onclick="Cost.discardBill('${b.id}')">Zahodiť</button>
          <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
          <button type="submit" form="br-form" class="btn btn-primary">${Icon('check')} Potvrdiť faktúru</button>${
            UI.tip('Údaje sa uložia a faktúra prejde do zoznamu ako Prijatá — pri zaškrtnutom „Už zaplatené" '
              + 'rovno ako Uhradená. Potom ju ešte treba schváliť, aby sa dala zaplatiť.')}
        </div>`;
      UI.modal(`Skontrolovať ${this.isReceipt(b) ? 'bloček' : 'faktúru'}${x._file ? ` · ${x._file}` : ''}`, body, { wide: true });
      // Doklad a formulár vedľa seba — na to je bežné okno úzke.
      const cards = document.querySelectorAll('.modal-card');
      if (cards.length) cards[cards.length - 1].classList.add('modal-xl');
      this.paintDoc(b);
    },

    /** Náhľad dokladu z privátneho úložiska (krátkodobý podpísaný odkaz). */
    async paintDoc(b) {
      const el = document.getElementById('br-doc');
      if (!el) return;
      const { url } = await DB.signedDocUrl(b.storage_path, 900);
      if (!url) { el.innerHTML = `<div class="br-doc-wait">${Icon('alert', 16)} Doklad sa nedá zobraziť.</div>`; return; }
      if (b.source === 'image') el.innerHTML = `<img src="${UI.esc(url)}" alt="Faktúra">`;
      else if (b.source === 'xml') {
        el.innerHTML = `<div class="br-doc-wait">${Icon('doc', 16)} E-faktúra (XML) — údaje sa prečítali
          priamo zo súboru, bez odhadu.<br><a href="${UI.esc(url)}" target="_blank" rel="noopener">Stiahnuť XML</a></div>`;
      } else {
        el.innerHTML = `<iframe src="${UI.esc(url)}#view=FitH" title="Faktúra"></iframe>
          <a class="br-doc-open" href="${UI.esc(url)}" target="_blank" rel="noopener">${Icon('doc', 13)} Otvoriť v novom okne</a>`;
      }
    },

    async confirmReview(id) {
      const d = UI.formData(document.getElementById('br-form'));
      const amount = Number(d.amount);
      if (!(amount > 0)) return UI.toast('Doplňte sumu na úhradu', 'err');
      if (!d.worker_id && !String(d.supplier_name || '').trim()) {
        return UI.toast('Vyberte živnostníka alebo napíšte dodávateľa', 'err');
      }
      const payload = { ...d, amount, vat_amount: Number(d.vat_amount) || 0 };
      payload.base_amount = Math.round((amount - payload.vat_amount) * 100) / 100;
      payload.supplier_iban = DanubraExtract.ibanClean(d.supplier_iban) || null;
      ['worker_id', 'issue_date', 'due_date', 'period_id', 'subcontract_id', 'category',
        'supplier_name', 'supplier_ico', 'supplier_ic_dph', 'bill_number', 'variable_symbol']
        .forEach(k => { if (payload[k] === '') payload[k] = null; });
      if (payload.worker_id && !payload.category) payload.category = 'work';
      if (payload.period_id) {
        const p = this.periods.find(x => x.id === payload.period_id);
        if (p) payload.subcontract_id = p.subcontract_id;
      }
      // Bloček (alebo čo sa už zaplatilo kartou či v hotovosti) ide rovno ako
      // uhradený — do „Zaplatiť" nepatrí, do nákladov áno.
      const zaplatene = !!payload.paid_now;
      delete payload.paid_now;
      if (zaplatene && !payload.category) return UI.toast('Vyberte druh nákladu (napr. palivo, náradie)', 'err');
      Object.assign(payload, { status: zaplatene ? 'paid' : 'received', confirmed_at: new Date().toISOString(),
        confirmed_by: Danubra.user?.id || null });
      if (zaplatene) payload.paid_at = new Date(`${payload.issue_date || Danubra._dayISO()}T12:00:00`).toISOString();
      const { error } = await DB.update('bills', id, payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      this._reviewOpen = null;
      UI.closeModal();
      this.loaded = false; await this.load();
      const dalsia = this.bills.find(b => b.status === 'review' && b.extract_status !== 'pending');
      UI.toast(dalsia ? 'Potvrdená — otváram ďalšiu' : 'Faktúra potvrdená', 'ok');
      Danubra.renderRoute();
      if (dalsia) setTimeout(() => this.reviewBill(dalsia.id), 150);
    },

    /** Zahodená sa nemaže — doklad zostane, len sa nepočíta. */
    async discardBill(id) {
      const why = await UI.ask('Prečo ju zahadzujete? (napr. „nahratá dvakrát", „nie je to faktúra")');
      if (why == null) return;
      const b = this.bills.find(x => x.id === id) || {};
      const note = [b.note, `Zahodená: ${why.trim() || 'bez dôvodu'}`].filter(Boolean).join('\n');
      const { error } = await DB.update('bills', id, { status: 'discarded', note });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      this._reviewOpen = null;
      UI.closeModal(); UI.toast('Zahodená', 'ok');
      this.loaded = false; await this.load(); Danubra.renderRoute();
    },

    async rereadBill(id) {
      const { error } = await DB.update('bills', id, { extract_status: 'pending', extract_error: null });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      this.read(id);
      const b = this.bills.find(x => x.id === id);
      if (b) { b.extract_status = 'pending'; b.extract_error = null; }
      this.reviewBill(id);
      this.pollIfReading();
    },

    async openDoc(id) {
      const b = this.bills.find(x => x.id === id);
      if (!b || !b.storage_path) return;
      const { url } = await DB.signedDocUrl(b.storage_path, 900);
      if (url) window.open(url, '_blank', 'noopener'); else UI.toast('Doklad sa nedá otvoriť', 'err');
    },

    // ── Faktúry, ktoré vystavujeme za živnostníkov ────────────────────────
    // „V niektorých prípadoch potrebujeme vystavovať faktúry aj za
    // živnostníkov nám." Návrh vznikne zo schválených hodín uzavretého
    // obdobia (danubra_self_bill_draft), vystaví ho admin
    // (danubra_self_bill_issue) a živnostník ho potvrdí cez odkaz.

    selfWorkers() { return this.workers.filter(w => w.self_billing && !w.vat_payer); },

    /** Kto má v ktorom uzavretom období schválené hodiny a ešte nemá faktúru. */
    selfCandidates() {
      const ludia = new Map(this.selfWorkers().map(w => [w.id, w]));
      const out = new Map();
      for (const t of this.timesheets) {
        if (!t.approved || !t.period_id || !ludia.has(t.worker_id)) continue;
        const p = this.periods.find(x => x.id === t.period_id);
        if (!p || p.status === 'open') continue;
        const k = `${t.period_id}|${t.worker_id}`;
        const o = out.get(k) || { period: p, worker: ludia.get(t.worker_id), hours: 0 };
        o.hours += Number(t.hours) || 0;
        out.set(k, o);
      }
      // Už má faktúru za toto obdobie (našu alebo svoju) — druhú nerobíme.
      const ma = new Set(this.bills.filter(b => b.status !== 'discarded' && b.period_id)
        .map(b => `${b.period_id}|${b.worker_id}`));
      return [...out.entries()].filter(([k]) => !ma.has(k)).map(([, v]) => v)
        .sort((a, b) => String(b.period.period_to).localeCompare(String(a.period.period_to)));
    },

    selfForm() {
      const list = this.selfCandidates();
      this._selfList = list;
      if (!this.selfWorkers().length) {
        return UI.modal('Faktúry za živnostníkov', `
          <div class="regimebox">Zatiaľ nemáte žiadneho živnostníka, za ktorého
            vystavujeme faktúry. Zapína sa na jeho karte (Upraviť → „Faktúry zaňho vystavujeme my")
            a platí od podpisu rámcovej zmluvy s touto dohodou.</div>
          <div class="modal-actions"><button class="btn btn-primary" onclick="UI.closeModal()">Rozumiem</button></div>`);
      }
      if (!list.length) {
        return UI.modal('Faktúry za živnostníkov', `
          <div class="regimebox">Nie je z čoho — v uzavretých obdobiach nemá nikto
            zo živnostníkov, za ktorých fakturujeme, schválené hodiny bez faktúry.</div>
          <div class="modal-actions"><button class="btn btn-primary" onclick="UI.closeModal()">Rozumiem</button></div>`);
      }
      UI.modal('Pripraviť faktúry za živnostníkov', `
        <div class="regimebox">Appka pripraví návrh faktúry v mene živnostníka
          zo <b>schválených hodín</b> uzavretého obdobia. Vystaví ho až administrátor; potom sa pošle
          živnostníkovi na potvrdenie.${UI.tip('Samofakturácia: faktúru, ktorú by inak písal živnostník nám, '
            + 'vystavíme za neho my. Musí to byť dohodnuté v rámcovej zmluve a živnostník ju vždy potvrdí cez odkaz.')}</div>
        <div class="pay-list">${list.map((c, i) => `
          <label class="pay-row">
            <input type="checkbox" name="self" value="${i}" checked>
            <span class="pay-who"><b>${UI.esc(c.worker.full_name)}</b>
              <em>${UI.esc(this.subOf(c.period.subcontract_id).title || 'Zákazka')} ·
                ${UI.dateRange(c.period.period_from, c.period.period_to)}</em></span>
            <strong>${Math.round(c.hours * 100) / 100} h</strong>
          </label>`).join('')}</div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
          <button class="btn btn-primary" id="self-go" onclick="Cost.selfDrafts()">Pripraviť návrhy</button>${
            UI.tip('Vzniknú len návrhy — bez čísla a zatiaľ neplatné. Platnými ich spraví administrátor '
              + 'tlačidlom „Schváliť a vystaviť".')}
        </div>`, { wide: true });
    },

    async selfDrafts() {
      const vyber = [...document.querySelectorAll('input[name="self"]:checked')]
        .map(i => this._selfList[Number(i.value)]).filter(Boolean);
      if (!vyber.length) return UI.toast('Nič nie je vybrané', 'err');
      const btn = document.getElementById('self-go');
      if (btn) { btn.disabled = true; btn.textContent = 'Pripravujem…'; }
      let ok = 0;
      for (const c of vyber) {
        const { error } = await DB.rpc('self_bill_draft', { p_period: c.period.id, p_worker: c.worker.id });
        if (error) UI.toast(`${c.worker.full_name}: ${error.message}`, 'err'); else ok++;
      }
      UI.closeModal();
      if (ok) UI.toast(ok === 1 ? 'Návrh je pripravený — čaká na schválenie' : `Pripravených ${ok} návrhov — čakajú na schválenie`, 'ok');
      this.loaded = false; await this.load(); Danubra.renderRoute();
    },

    /** Faktúra za živnostníka ako dokument — návrh aj vystavená. */
    selfDoc(id) {
      const b = this.bills.find(x => x.id === id);
      if (!b) return;
      const w = this.workerOf(b.worker_id);
      const p = this.periods.find(x => x.id === b.period_id) || null;
      const html = DanubraPapers.selfInvoice({ bill: b, worker: {
        ...w, address: w.business_address || w.address, city: w.business_city || w.city, zip: w.business_zip,
        iban: w.bank_iban }, company: Danubra.supplier(), period: p });
      Docs.show(window.open('', '_blank'), html, { kind: 'self_invoice', title: 'Faktúra',
        number: b.bill_number, who: w.full_name, lang: 'sk', worker_id: b.worker_id || null });
    },

    /** Schváliť a vystaviť — číslo z radu živnostníka. Smie len admin (stráži databáza). */
    async selfIssue(id) {
      const b = this.bills.find(x => x.id === id);
      if (!b) return;
      const w = this.workerOf(b.worker_id);
      if (!await UI.confirm(`Vystaviť faktúru v mene ${w.full_name || 'živnostníka'} na `
        + `${Money.format(Money.toCents(b.amount))}?\n\nDostane číslo z jeho radu a pošlete mu ju na potvrdenie.`)) return;
      const due = Number((Danubra.cfg('subcontract') || {}).splatnost_dni) || 14;
      const { data, error } = await DB.rpc('self_bill_issue', { p_bill: id, p_due_days: due });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast(`Vystavená ${data || ''} — pošlite ju živnostníkovi na potvrdenie`, 'ok');
      this.loaded = false; await this.load(); this.billDetail(id);
    },

    selfLink(b) {
      return `${location.origin}/app/potvrdenie.html?t=${b.confirm_token}`;
    },

    selfMessage(b) {
      const w = this.workerOf(b.worker_id);
      const s = Danubra.supplier() || {};
      return `Dobrý deň${w.full_name ? `, ${w.full_name.split(' ')[0]}` : ''}, za odpracované hodiny sme `
        + `za Vás vystavili faktúru ${b.bill_number} na ${Money.format(Money.toCents(b.amount))}. `
        + `Skontrolujte ju prosím a potvrďte: ${this.selfLink(b)} — ${s.name || ''}`.trim();
    },

    async selfSend(id, how) {
      const b = this.bills.find(x => x.id === id);
      if (!b || !b.confirm_token) return;
      const w = this.workerOf(b.worker_id);
      const text = this.selfMessage(b);
      const tel = String(w.phone || '').replace(/[^\d+]/g, '');
      if (how === 'copy') {
        try { await navigator.clipboard.writeText(text); UI.toast('Správa s odkazom je skopírovaná', 'ok'); }
        catch { UI.ask('Skopírujte si správu:', text); }
      } else if (how === 'wa') {
        if (!tel) return UI.toast('Živnostník nemá telefón', 'err');
        window.open(`https://wa.me/${tel.replace(/^\+/, '')}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      } else if (how === 'sms') {
        if (!tel) return UI.toast('Živnostník nemá telefón', 'err');
        location.href = `sms:${tel}?body=${encodeURIComponent(text)}`;
      }
      if (!b.sent_to_worker_at) {
        await DB.update('bills', id, { sent_to_worker_at: new Date().toISOString() });
        b.sent_to_worker_at = new Date().toISOString();
      }
    },

    selfHtml(b) {
      const w = this.workerOf(b.worker_id);
      const riadky = (b.lines || []).map(l => `<div><span>${UI.esc(l.description || 'Práce')}</span>
        <span>${Number(l.hours || 0)} h × ${Money.format(Money.toCents(l.rate))}</span>
        <b>${Money.format(Money.toCents(l.total))}</b></div>`).join('');
      let stav = '';
      if (b.status === 'self_draft') {
        stav = `<div class="regimebox">Návrh zo schválených hodín. Po schválení
          dostane číslo z radu živnostníka a pošlete mu ho na potvrdenie.</div>`;
      } else if (b.status === 'self_sent') {
        stav = `<div class="regimebox">${b.sent_to_worker_at
          ? `Poslané ${UI.date(b.sent_to_worker_at)} — čaká, kým ju ${UI.esc(w.full_name || 'živnostník')} potvrdí.`
          : `Vystavená. <b>Pošlite ju živnostníkovi na potvrdenie</b> — bez potvrdenia sa neplatí.`}
          <div class="btn-row">
            <button class="btn btn-outline btn-sm" onclick="Cost.selfSend('${b.id}','wa')">${Icon('whatsapp', 14)} WhatsApp</button>
            <button class="btn btn-outline btn-sm" onclick="Cost.selfSend('${b.id}','sms')">${Icon('phone', 14)} SMS</button>
            <button class="btn btn-outline btn-sm" onclick="Cost.selfSend('${b.id}','copy')">${Icon('copy', 14)} Kopírovať odkaz</button>${
              UI.tip('Pošle živnostníkovi správu s odkazom. Na odkaze si faktúru pozrie a potvrdí ju, alebo '
                + 'napíše, s čím nesúhlasí.')}
          </div></div>`;
      } else if (b.worker_confirmed_at) {
        stav = `<div class="regimebox">${Icon('check', 14)} Živnostník ju potvrdil
          ${UI.date(b.worker_confirmed_at)}.</div>`;
      } else if (b.worker_note) {
        stav = `<div class="warnbox br-warn"><div>${Icon('alert', 14)}<span>Živnostník nesúhlasí:
          ${UI.esc(b.worker_note)}</span></div></div>`;
      }
      return `${stav}<div class="self-lines">${riadky}</div>`;
    },

    billDetail(id) {
      const b = this.bills.find(x => x.id === id);
      if (!b) return UI.toast('Nenájdené', 'err');
      // Nahratá z PDF a nepotvrdená sa otvára na kontrolu, nie ako hotová.
      if (b.status === 'review') return this.reviewBill(id);
      const w = this.workerOf(b.worker_id);
      const self = b.source === 'self_billing';
      const rev = DanubraBills.review(this.ctx(b));
      const c = rev.check;

      // Za živnostníka: schvaľuje sa vystavením (admin), potom potvrdí on.
      const next = self && ['self_draft', 'self_sent'].includes(b.status) ? null
        : { received: 'checked', checked: 'approved', disputed: 'approved', approved: 'paid' }[b.status];
      const nextLabel = { checked: 'Označiť skontrolovanú', approved: 'Schváliť',
        paid: 'Označiť uhradenú' }[next];
      const nextTip = {
        checked: 'Potvrdíte, že ste faktúru prezreli. Zaplatiť sa ešte nedá — ďalší krok je schválenie.',
        approved: 'Faktúra pôjde na zaplatenie — objaví sa v „Pripraviť platby". Keď suma nesedí '
          + 's hodinami, appka si vypýta dôvod a zapíše ho k faktúre.',
        paid: 'Kliknite, keď peniaze odišli z účtu. Keď platbu spárujete v Banke, stane sa to samo.',
      }[next];

      const body = `
        <div class="detail-head">
          ${UI.badge(Enums.label('bill_status', b.status), this.billKind(b.status))}${UI.tip(BILL_TIP[b.status] || '')}
          ${b.bill_number ? `<span class="mono doc-no">${UI.esc(b.bill_number)}</span>` : ''}
        </div>

        ${self ? `<div class="form-section">Faktúra, ktorú vystavujeme za živnostníka</div>${this.selfHtml(b)}` : ''}

        <div class="form-section">Porovnanie s hodinami${UI.tip('Appka vypočíta, koľko by malo byť na faktúre: '
          + 'schválené hodiny v období × sadzba živnostníka. Rozdiel do 1 centu sa prehliadne, väčší znamená spor.')}</div>
        ${Shell.sums({ lines: DanubraBills.sumLines(c),
          totalLabel: 'Na úhradu',
          note: c.variance == null
            ? 'Faktúra nie je naviazaná na uzavreté obdobie, takže sa nedá porovnať.'
            : (Math.abs(c.variance) <= DanubraBills.TOLERANCE
              ? 'Sedí so schválenými hodinami.'
              : `Rozdiel ${Money.format(c.variance)} oproti podkladu.`) })}

        ${(rev.reasons.length || rev.warnings.length)
          ? Shell.blocker({ reasons: [...rev.reasons, ...rev.warnings] })
          : '<div class="regimebox">Faktúra sedí a má všetko, čo treba.</div>'}

        <div class="kv">
          ${b.worker_id ? `<div><span>Živnostník</span><strong>${UI.esc(w.full_name || '—')}</strong></div>`
            : `<div><span>Dodávateľ</span><strong>${UI.esc(b.supplier_name || '—')}</strong></div>`}
          ${(w.company_id || b.supplier_ico) ? `<div><span>IČO</span><strong>${UI.esc(w.company_id || b.supplier_ico)}</strong></div>` : ''}
          ${b.category ? `<div><span>Druh</span><strong>${UI.esc(Enums.label('cost_category', b.category))}</strong></div>` : ''}
          ${b.variable_symbol ? `<div><span>VS${UI.tip(TIP.vs)}</span><strong class="mono">${UI.esc(b.variable_symbol)}</strong></div>` : ''}
          ${b.supplier_iban ? `<div><span>IBAN${UI.tip(TIP.iban)}</span><strong class="mono">${UI.esc(b.supplier_iban)}</strong></div>` : ''}
          ${b.issue_date ? `<div><span>Vystavená</span><strong>${UI.date(b.issue_date)}</strong></div>` : ''}
          ${b.due_date ? `<div><span>Splatnosť</span><strong>${UI.date(b.due_date)}</strong></div>` : ''}
          ${this.periodLabel(b.period_id) ? `<div><span>Obdobie</span><strong>${this.periodLabel(b.period_id)}</strong></div>` : ''}
          ${b.subcontract_id ? `<div><span>Zákazka</span><strong>${UI.esc(this.subOf(b.subcontract_id).title || '')}</strong></div>` : ''}
        </div>
        ${b.note ? `<div class="notebox">${UI.esc(b.note)}</div>` : ''}

        <div class="modal-actions">
          ${self && ['self_draft', 'self_sent', 'disputed'].includes(b.status)
            ? `<button class="btn btn-danger" onclick="Cost.discardBill('${b.id}')">Zahodiť</button>` : ''}
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          ${b.storage_path ? `<button class="btn btn-outline" onclick="Cost.openDoc('${b.id}')">${Icon('doc')} Doklad</button>` : ''}
          ${self ? `<button class="btn btn-outline" onclick="Cost.selfDoc('${b.id}')">${Icon('doc')} ${b.bill_number ? 'Faktúra' : 'Náhľad návrhu'}</button>` : ''}
          ${self ? '' : `<button class="btn ${next ? 'btn-outline' : 'btn-primary'}" onclick="Cost.billForm('${b.id}')">Upraviť</button>`}
          ${self && b.status === 'self_draft'
            ? `<button class="btn btn-primary" onclick="Cost.selfIssue('${b.id}')">${Icon('check')} Schváliť a vystaviť</button>${
              UI.tip('Faktúra dostane číslo z radu živnostníka a stane sa platnou. Smie to len administrátor. '
                + 'Potom ju pošlete živnostníkovi na potvrdenie.')}` : ''}
          ${next ? `<button class="btn btn-primary" onclick="Cost.setBillStatus('${b.id}','${next}')">${nextLabel}</button>${UI.tip(nextTip)}` : ''}
        </div>`;
      UI.modal(`Faktúra od ${w.full_name || b.supplier_name || 'dodávateľa'}`, body, { wide: true });
    },

    /**
     * Sporná faktúra sa nedá schváliť bez poznámky. Pýta sa na ňu tu, ale
     * pravdu drží trigger — keby sa poznámka obišla, databáza to odmietne.
     */
    async setBillStatus(id, to) {
      const b = this.bills.find(x => x.id === id);
      if (!b) return;
      const c = DanubraBills.check(b, this.ctx(b));
      const patch = { status: to };

      if (to === 'approved' && c.variance != null
          && Math.abs(c.variance) > DanubraBills.TOLERANCE) {
        const why = await UI.ask(
          `Faktúra sa líši od schválených hodín o ${Money.format(c.variance)}.\n\n`
          + 'Napíšte, prečo ju schvaľujete. Zostane to pri faktúre.');
        if (!why || why.trim().length < 5) {
          return UI.toast('Bez vysvetlenia sa sporná faktúra schváliť nedá', 'err');
        }
        patch.note = b.note ? `${b.note}\n${why}` : why;
      }
      if (to === 'checked') patch.checked_at = new Date().toISOString();

      const { error } = await DB.update('bills', id, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast('Uložené', 'ok');
      this.loaded = false; await this.load(); this.billDetail(id);
    },

    billForm(id, preset) {
      const b = id ? this.bills.find(x => x.id === id) || {} : (preset || {});
      // Ponúkame len uzavreté obdobia — z otvoreného sa porovnávať nedá.
      const periods = this.periods
        .filter(p => p.status !== 'open')
        .map(p => [p.id, `${this.subOf(p.subcontract_id).title || 'Zákazka'} · ${UI.dateRange(p.period_from, p.period_to)}`]);

      const body = `
        <form id="bill-form" onsubmit="event.preventDefault();Cost.saveBill('${id || ''}')">
          <div class="regimebox">
            Keď faktúru naviažete na uzavreté obdobie, appka ju hneď porovná
            so schválenými hodinami. Bez obdobia sa schvaľuje naslepo.</div>
          <div class="form-grid">
            ${UI.field('worker_id', 'Živnostník', { value: b.worker_id, add: 'worker', tip: TIP.worker,
              options: [['', '— nie je živnostník (iný dodávateľ) —'], ...this.workers.map(w => [w.id, w.full_name])] })}
            ${UI.field('supplier_name', 'Dodávateľ (ak nie je živnostník)', { value: b.supplier_name })}
            ${UI.field('category', 'Druh nákladu', { value: b.category || '', tip: TIP.category,
              options: [['', '— vyberte —'], ...Enums.options('cost_category')] })}
            ${UI.field('variable_symbol', 'Variabilný symbol', { value: b.variable_symbol, tip: TIP.vs })}
            ${UI.field('bill_number', 'Ich číslo faktúry', { value: b.bill_number,
              tip: 'Číslo, ktoré faktúre dal dodávateľ — nie naše. Je hore na jeho faktúre.' })}
            ${UI.field('amount', 'Suma €', { type: 'number', value: b.amount, required: true,
              tip: 'Celá suma na úhradu z faktúry (čo máme zaplatiť).' })}
            ${UI.field('period_id', 'Obdobie', { value: b.period_id, tip: TIP.period,
              options: [['', '— bez obdobia —'], ...periods] })}
            ${UI.field('issue_date', 'Vystavená', { type: 'date', value: b.issue_date })}
            ${UI.field('due_date', 'Splatnosť', { type: 'date', value: b.due_date })}
          </div>
          <div id="bill-live" hidden></div>
          ${UI.field('note', 'Poznámka', { type: 'textarea', value: b.note })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Pridať'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť prijatú faktúru' : 'Prijatá faktúra', body, { wide: true });

      // Rozdiel sa ukáže pri písaní, nie až po uložení.
      const form = document.getElementById('bill-form');
      const live = () => this.billLive();
      ['worker_id', 'amount', 'period_id'].forEach(n => {
        const el = form.querySelector(`[name="${n}"]`);
        if (el) { el.addEventListener('input', live); el.addEventListener('change', live); }
      });
      live();
    },

    billLive() {
      const box = document.getElementById('bill-live');
      if (!box) return;
      const d = UI.formData(document.getElementById('bill-form'));
      const hide = () => { box.hidden = true; box.className = ''; box.innerHTML = ''; };
      if (!d.worker_id || !d.period_id) return hide();
      const c = DanubraBills.check(d, this.ctx(d));
      if (c.expected == null) return hide();
      const off = Math.abs(c.variance) > DanubraBills.TOLERANCE;
      // Rámček je sám `#bill-live` — priamo vo formulári, takže medzery mu dá
      // stavebnica okna ako každému inému rámčeku.
      box.hidden = false;
      box.className = off ? 'warnbox' : 'regimebox';
      box.innerHTML = `
        ${off ? Icon('alert', 14) : Icon('check', 14)}
        Podľa ${c.hours} ${DanubraBills.plural(c.hours, 'schválenej hodiny', 'schválených hodín', 'schválených hodín')}
        by malo prísť <strong>${Money.format(c.expected)}</strong>.
        ${off ? `Rozdiel <strong>${Money.format(c.variance)}</strong> — faktúra pôjde do sporu.`
          : 'Sedí.'}`;
    },

    async saveBill(id) {
      const d = UI.formData(document.getElementById('bill-form'));
      if (!d.worker_id && !String(d.supplier_name || '').trim()) {
        return UI.toast('Vyberte živnostníka alebo napíšte dodávateľa', 'err');
      }
      if (!d.amount) return UI.toast('Zadajte sumu', 'err');
      const payload = { ...d };
      payload.amount = Number(d.amount);
      ['worker_id', 'issue_date', 'due_date', 'period_id', 'category', 'supplier_name', 'variable_symbol']
        .forEach(k => { if (payload[k] === '') payload[k] = null; });
      if (payload.worker_id && !payload.category) payload.category = 'work';
      // Zákazku odvodíme z obdobia — nech sa nezadáva dvakrát.
      if (payload.period_id) {
        const p = this.periods.find(x => x.id === payload.period_id);
        if (p) payload.subcontract_id = p.subcontract_id;
      }
      const res = id ? await DB.update('bills', id, payload) : await DB.insert('bills', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast(id ? 'Uložené' : 'Faktúra zadaná', 'ok');
      this.loaded = false; await this.load(); Danubra.renderRoute();
    },

    // ── Ostatné náklady ───────────────────────────────────────────────────
    // Zoznam je `DataList`; pod ním súčty po kategóriách za to, čo je
    // práve vyfiltrované (prekreslia sa pri každej zmene filtra).
    costsHtml() {
      return DataList.html(this.costConfig(this.costListRows()))
        + `<div id="cost-bycat">${this.byCatHtml(null)}</div>`;
    },

    /** Súčty po kategóriách — za riadky, ktoré sú vo filtri vidieť. */
    byCatHtml(rows) {
      const list = rows || (window.DataList && DataList._reg.naklady ? DataList.visible('naklady') : this.costListRows());
      if (!list.length) return '';
      const by = DanubraBills.byCategory(list.map(r => r.c));
      return `<div class="form-section">Po kategóriách</div>
        ${Shell.sums({
          lines: by.map(x => ({ label: this.catLabel(x.category), cents: x.cents })),
          totalLabel: 'Spolu',
        })}`;
    },
    paintByCat(rows) {
      const box = document.getElementById('cost-bycat');
      if (box) box.innerHTML = this.byCatHtml(rows);
    },

    costListRows() {
      return this.costs.map(c => ({
        id: c.id, c,
        title: c.description || this.catLabel(c.category) || 'Náklad',
        cat: this.catLabel(c.category),
        subTitle: c.subcontract_id ? (this.subOf(c.subcontract_id).title || 'Zákazka') : '',
        person: c.worker_id ? (this.workerOf(c.worker_id).full_name || '') : '',
        cents: Money.toCents(c.amount),
      }));
    },

    /** Konfigurácia zoznamu ostatných nákladov pre `DataList`. */
    costConfig(rows) {
      const DL = DanubraDataList;
      const rok = Danubra._dayISO().slice(0, 4);
      const day = (d) => DL.fmtDay(d, { year: String(d).slice(0, 4) !== rok });
      const flags = (r) => [
        r.c.recurring ? UI.badge('opakovaný', 'blue') : '',
        r.c.rebilled_invoice_id ? UI.badge('refakturovaný', 'green') : r.c.rebillable ? UI.badge('na refaktúru', 'amber') : '',
      ].filter(Boolean).join(' ');
      return {
        id: 'naklady', storageKey: 'naklady', label: 'Ostatné náklady',
        noun: ['náklad', 'náklady', 'nákladov'],
        rows,
        rowClick: (r) => Cost.costForm(r.id),
        rowClass: (r) => (r.c.parent_cost_id ? 'is-muted' : ''),
        rowLabel: (r) => `Náklad ${r.title}`,
        rowActions: [{ ico: 'edit', label: 'Upraviť náklad', run: (r) => Cost.costForm(r.id) }],
        onChange: (st, list) => this.paintByCat(list),
        columns: [
          { key: 'popis', label: 'Náklad', width: 'minmax(170px, 1.8fr)', mobile: 'title',
            render: (r) => `<span class="dl-title"><b>${UI.esc(r.title)}</b>${r.c.supplier ? `<small>${UI.esc(r.c.supplier)}</small>` : ''}</span>`,
            sortValue: (r) => r.title, sortLabel: 'Popis' },
          { key: 'kategoria', label: 'Kategória', width: '118px',
            render: (r) => `<span class="dl-tag">${UI.esc(r.cat)}</span>`, sortValue: (r) => r.cat },
          { key: 'datum', label: 'Dátum', width: '80px', mobileLabel: '',
            render: (r) => (r.c.cost_date ? `<span class="dl-num">${day(r.c.cost_date)}</span>` : ''),
            sortValue: (r) => r.c.cost_date || null, sortDir: -1 },
          { key: 'zakazka', label: 'Zákazka', width: 'minmax(110px, 1fr)',
            render: (r) => (r.c.subcontract_id ? Danubra.link('subcontract', r.c.subcontract_id, r.subTitle) : ''),
            sortValue: (r) => r.subTitle || null },
          { key: 'koho', label: 'Koho sa týka', width: 'minmax(100px, .8fr)', hideBelow: 1000,
            render: (r) => (r.c.worker_id ? Danubra.link('worker', r.c.worker_id, r.person) : ''),
            sortValue: (r) => r.person || null },
          { key: 'znaky', label: 'Opakovanie · refaktúra', width: '204px', hideBelow: 1100, mobile: 'line',
            tip: 'Opakovaný = vzniká každý mesiac sám. Na refaktúru = má sa vrátiť na faktúre odberateľovi; refakturovaný = už je na faktúre.',
            render: flags, csv: false },
          { key: 'suma', label: 'Suma', width: '108px', align: 'right',
            render: (r) => `<b class="dl-num dl-amt">${Money.format(r.cents)}</b>`,
            sortValue: (r) => r.cents, sortDir: -1 },
        ],
        sort: { key: 'datum', dir: -1 },
        groups: [
          { key: 'kategoria', label: 'Kategória', value: 'cat' },
          { key: 'zakazka', label: 'Zákazka', value: (r) => r.subTitle || 'Bez zákazky (réžia)' },
        ],
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať náklad, dodávateľa…', label: 'Hľadať popis, dodávateľa alebo zákazku',
            fields: ['title', 'c.supplier', 'subTitle', 'person'] },
          { key: 'kategoria', type: 'multi', label: 'Kategória', value: (r) => r.c.category || '',
            optionLabel: (v) => this.catLabel(v) },
          { key: 'zakazka', type: 'select', label: 'Zákazka', value: (r) => r.c.subcontract_id || '',
            optionLabel: (v, r) => (r ? r.subTitle : v), emptyLabel: 'Bez zákazky (réžia)', allLabel: 'Všetky zákazky' },
          { key: 'datum', type: 'range-date', label: 'Dátum', field: 'c.cost_date' },
          { key: 'opak', type: 'toggle', label: 'Opakované', test: (r) => !!r.c.recurring, more: true,
            hint: 'Náklady, ktoré vznikajú každý mesiac samy (napr. ubytovanie).' },
          { key: 'refa', type: 'toggle', label: 'Na refaktúru, ešte nie na faktúre', more: true,
            test: (r) => !!r.c.rebillable && !r.c.rebilled_invoice_id,
            hint: 'Zaplatili sme ich my a majú sa vrátiť na faktúre odberateľovi — zatiaľ nie sú na žiadnej.' },
          { key: 'koho', type: 'select', label: 'Koho sa týka', value: (r) => r.c.worker_id || '', more: true,
            optionLabel: (v, r) => (r ? r.person : v), allLabel: 'Všetci' },
          { key: 'suma', type: 'range-number', label: 'Suma', value: (r) => r.cents / 100, unit: '€', more: true },
        ],
        empty: { ico: 'invoices', title: 'Zatiaľ žiadne náklady',
          sub: 'Ubytovanie, doprava, náradie — všetko, čo nie je faktúra od živnostníka.',
          cta: `<button class="btn btn-primary" onclick="Cost.costForm()">${Icon('plus')} Náklad</button>` },
        foot: (list) => ({ cells: {
          popis: `<span class="dl-foot-l">Spolu <em>${list.length} ${Shell.plural(list.length, 'náklad', 'náklady', 'nákladov')}</em></span>`,
          suma: `<b class="dl-num" data-sum="suma">${Money.format(Money.sum(list.map(r => r.cents)))}</b>`,
        } }),
        export: {
          name: ['naklady'],
          columns: [
            ['Popis', r => r.c.description], ['Kategória', r => r.cat], ['Dátum', r => r.c.cost_date],
            ['Dodávateľ', r => r.c.supplier], ['Zákazka', r => r.subTitle], ['Koho sa týka', r => r.person],
            ['Opakovaný', r => (r.c.recurring ? 'áno' : 'nie')],
            ['Refakturovateľný', r => (r.c.rebillable ? 'áno' : 'nie')],
            ['Už refakturovaný', r => (r.c.rebilled_invoice_id ? 'áno' : 'nie')],
            ['Suma', r => DanubraExport.num(r.c.amount)],
          ],
        },
      };
    },

    /** Ostatné náklady, ktoré sú po filtroch vidieť. */
    costRows() {
      const vid = window.DataList && DataList._reg.naklady ? DataList.visible('naklady') : null;
      return vid ? vid.map(r => r.c) : this.costs.slice();
    },

    costForm(id, preset) {
      const c = id ? this.costs.find(x => x.id === id) || {} : (preset || {});
      const body = `
        <form id="cost-form" onsubmit="event.preventDefault();Cost.saveCost('${id || ''}')">
          <div class="form-grid">
            ${UI.field('category', 'Kategória', { value: c.category || 'accommodation',
              required: true, options: Enums.options('cost_category') })}
            ${UI.field('amount', 'Suma €', { type: 'number', value: c.amount, required: true })}
            ${UI.field('cost_date', 'Dátum', { type: 'date',
              value: c.cost_date || new Date().toISOString().slice(0, 10) })}
            ${UI.field('supplier', 'Dodávateľ', { value: c.supplier })}
            ${UI.field('subcontract_id', 'Zákazka', { value: c.subcontract_id, add: 'subcontract',
              tip: 'Ku ktorej stavbe náklad patrí. Bez zákazky je to réžia celej firmy.',
              options: [['', '— bez zákazky —'], ...this.subcontracts.map(s => [s.id, s.title])] })}
            ${UI.field('worker_id', 'Koho sa týka', { value: c.worker_id, add: 'worker',
              tip: 'Ktorého človeka sa náklad týka, napr. jeho ubytovanie. Je to len na prehľad.',
              options: [['', '— nikoho konkrétneho —'], ...this.workers.map(w => [w.id, w.full_name])] })}
          </div>
          ${UI.field('description', 'Popis', { value: c.description })}
          <div class="form-section">Opakovanie</div>
          <div class="regimebox">
            Mesačné ubytovanie sa nezadáva dvanásťkrát. Zapnite opakovanie a
            ďalšie mesiace vzniknú samy — vždy k tomu istému dňu.</div>
          <div class="chk-row">
            ${UI.field('recurring', '', { type: 'checkbox', value: c.recurring,
              placeholder: 'Opakuje sa každý mesiac' })}
          </div>
          ${UI.field('recurring_until', 'Opakovať do (nepovinné)', { type: 'date',
            value: c.recurring_until,
            tip: 'Do tohto dňa vznikajú ďalšie mesiace. Prázdne = opakuje sa, kým opakovanie nevypnete.' })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Pridať'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť náklad' : 'Nový náklad', body, { wide: true });
    },

    async saveCost(id) {
      const d = UI.formData(document.getElementById('cost-form'));
      if (!d.amount) return UI.toast('Zadajte sumu', 'err');
      const payload = { ...d };
      payload.amount = Number(d.amount);
      ['subcontract_id', 'worker_id', 'recurring_until'].forEach(k => {
        if (payload[k] === '') payload[k] = null;
      });
      const res = id ? await DB.update('costs', id, payload) : await DB.insert('costs', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast(id ? 'Uložené' : 'Náklad pridaný', 'ok');
      this.loaded = false; await this.load(); Danubra.renderRoute();
    },
  };

  window.Cost = Cost;
  Danubra.views.costs = function (el) { return Cost.view(el); };
})();
