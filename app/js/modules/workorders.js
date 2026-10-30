// ============================================================================
// DANUBRA — Objednávky
// ============================================================================
// Dve veci na jednej obrazovke, lebo sú to dve strany tej istej práce:
//
//   **Od odberateľa** — čo si u nás objednal. Nemecký generál pošle
//   Bestellung; má svoje číslo a to číslo patrí na našu faktúru. Bez neho ju
//   účtovné oddelenie často neprepustí a platba sa posunie o mesiac. K jeho
//   objednávke vieme vystaviť naše potvrdenie (Auftragsbestätigung).
//
//   **Živnostníkovi** — čo sme objednali u neho. Jedna na nasadenie. Toto nie
//   je papierovačka: Werkvertrag znamená, že si objednávame dielo, nie hodiny,
//   a keď sa kontrola opýta, čo presne mal ten človek urobiť, odpoveď „bol tam
//   a robil, čo bolo treba" je presne tá, po ktorej sa z Werkvertrag stane
//   prenájom pracovnej sily.
//
// Pozor na názov: objednávky z v1 (ubytovanie) sú niečo iné a sú v archíve.
// ============================================================================
(function () {
  const KIND = [
    ['customer', 'Od odberateľa'],
    ['worker', 'Živnostníkovi'],
  ];
  const STATUS = [
    ['draft', 'Rozpracovaná', 'gray'],
    ['sent', 'Odoslaná', 'blue'],
    ['confirmed', 'Potvrdená', 'green'],
    ['done', 'Vybavená', 'green'],
    ['cancelled', 'Zrušená', 'red'],
  ];
  const PRICE = [
    ['hourly', 'Za hodinu'],
    ['unit', 'Za jednotku'],
    ['fixed', 'Pevná cena'],
  ];

  const Ord = {
    rows: [], partners: [], workers: [], workerDocs: [], subcontracts: [], contracts: [],
    assignments: [], loaded: false,
    kind: 'customer', q: '',

    async load() {
      const [o, p, w, wd, sc, c, a] = await Promise.all([
        DB.list('work_orders', { order: { column: 'created_at', ascending: false }, limit: 500 }),
        DB.list('partners', {
          select: 'id,name,address,postal_code,city,country,registration_no,ust_idnr,contact_person',
          limit: 300 }),
        // Na objednávke musí byť zhotoviteľ identifikovateľný — meno nestačí.
        DB.list('workers', {
          select: 'id,full_name,company_id,tax_id,address,business_address,phone,email,hourly_cost',
          limit: 500 }),
        // Rámcové zmluvy: objednávka sa na ne musí odvolať, inak to nie je
        // individuálna zmluva o dielo (čl. III. rámcovej zmluvy).
        DB.list('worker_documents', {
          select: 'id,worker_id,kind,reference,valid_from', limit: 2000 }),
        DB.list('subcontracts', { select: 'id,title,contract_number,charge_rate', limit: 300 }),
        DB.list('contracts', {
          select: 'id,contract_number,title,partner_id,signed_at', limit: 300 }),
        DB.list('assignments', {
          select: 'id,subcontract_id,worker_id,status,date_from,date_to,worker_rate', limit: 2000 }),
      ]);
      this.rows = o.data || []; this.partners = p.data || []; this.workers = w.data || [];
      this.workerDocs = wd.data || [];
      this.subcontracts = sc.data || []; this.contracts = c.data || [];
      this.assignments = a.data || [];
      this.loaded = true;
    },

    partnerOf(id) { return this.partners.find(x => x.id === id) || {}; },
    workerOf(id) { return this.workers.find(x => x.id === id) || {}; },

    /**
     * Rámcová zmluva živnostníka. Objednávka sa na ňu musí odvolať — článok
     * III. rámcovej zmluvy hovorí, že individuálna zmluva o dielo vzniká
     * práve vystavením objednávky a jej akceptáciou.
     */
    ramcovaOf(workerId) {
      const d = (this.workerDocs || [])
        .filter(x => x.worker_id === workerId && x.kind === 'contract')
        .sort((a, b) => String(b.valid_from || '').localeCompare(String(a.valid_from || '')))[0];
      return d ? { number: d.reference || '', signedAt: d.valid_from || '' } : null;
    },
    subOf(id) { return this.subcontracts.find(x => x.id === id) || {}; },
    badge(s) { const m = STATUS.find(x => x[0] === s) || STATUS[0]; return UI.badge(m[1], m[2]); },

    /** Cena jednou vetou — podľa modelu, nie tri prázdne polia vedľa seba. */
    priceText(o) {
      if (o.price_model === 'fixed') {
        return o.fixed_price ? `${UI.money(o.fixed_price)} pevne` : '';
      }
      if (o.price_model === 'unit') {
        return o.unit_price ? `${UI.money(o.unit_price)}/${o.unit_label || 'jednotku'}` : '';
      }
      return o.rate ? `${UI.money(o.rate)}/h` : '';
    },

    /**
     * Prepne zoznam na jednu stranu (filter „Druh"). Nová objednávka sa
     * potom zakladá pre tú stranu, ktorá je vybraná.
     */
    setKind(k) {
      this.kind = k || 'customer';
      if (window.DataList && DataList.state('objednavky')) return DataList.set('objednavky', 'druh', k || '');
      return Danubra.renderRoute();
    },
    setQ(v) { this.q = v; if (window.DataList) DataList.set('objednavky', 'q', v || ''); },

    // ── Zoznam ────────────────────────────────────────────────────────────
    // Spoločný komponent `DataList`. Dovtedy dve tlačidlá strán, hľadanie
    // a karty v dvoch stĺpcoch — objednávka bez popisu diela alebo bez
    // čísla odberateľa sa dala nájsť len prezretím všetkých.
    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      Danubra.setActions(`<button class="btn btn-primary btn-sm" onclick="Ord.form()">
        ${Icon('plus')} Objednávka</button>`);
      const today = Danubra._dayISO();
      const rows = this.rows.map(o => this.listRow(o, today));
      el.innerHTML = Danubra.header('Objednávky',
        `${this.rows.filter(o => o.kind === 'customer').length} od odberateľov · `
        + `${this.rows.filter(o => o.kind === 'worker').length} živnostníkom`)
        + `<p class="fl-intro">Dve strany tej istej práce. <strong>Od odberateľa</strong> —
            čo si u nás objednal; jeho číslo patrí na našu faktúru.
            <strong>Živnostníkovi</strong> — čo sme objednali u neho, jedna na nasadenie.
            Tá druhá je doklad, ktorý pri kontrole obháji, že ide o dielo a nie
            o prenájom pracovnej sily.</p>`
        + DataList.html(this.listConfig(rows));
      const st = DataList.state('objednavky');
      if (st && st.f.druh) this.kind = st.f.druh;
    },

    /** Stavy, s ktorými sa ešte pracuje — predvolený filter zoznamu. */
    OPEN_STATUSES: ['draft', 'sent', 'confirmed'],

    /**
     * Riadok zoznamu. „Problém" je to, na čo sa pýta kontrola alebo účtovné
     * oddelenie odberateľa: chýbajúci popis diela, chýbajúce číslo
     * odberateľa (ide na faktúru) a objednávka živnostníkovi, ktorá ešte
     * nie je odoslaná, hoci nástup už je alebo bude do týždňa.
     */
    listRow(o, today) {
      const L = DanubraDataList;
      const cust = o.kind === 'customer';
      const p = cust ? this.partnerOf(o.partner_id) : {};
      const w = cust ? {} : this.workerOf(o.worker_id);
      const sc = this.subOf(o.subcontract_id);
      const open = this.OPEN_STATUSES.includes(o.status || 'draft');
      const left = o.date_to ? L.daysBetween(today, String(o.date_to).slice(0, 10)) : null;
      const toStart = o.date_from ? L.daysBetween(today, String(o.date_from).slice(0, 10)) : null;
      const noScope = !String(o.scope || '').trim();
      const noRef = cust && !String(o.their_ref || '').trim();
      const late = !cust && (o.status || 'draft') === 'draft' && toStart != null && toStart <= 7;
      const ram = cust ? null : this.ramcovaOf(o.worker_id);
      let rank = 6;
      if (!open) rank = 9;
      else if (noScope && !cust) rank = 0;
      else if (late) rank = 1;
      else if (noRef) rank = 2;
      else if (noScope) rank = 3;
      else if ((o.status || 'draft') === 'draft') rank = 4;
      else if (o.status === 'sent') rank = 5;
      return {
        id: o.id, o, cust, sc, open, left, toStart, noScope, noRef, late, ram, rank,
        hot: open && rank <= 1, problem: open && (noScope || noRef || late),
        title: o.title || o.order_number || 'Objednávka',
        whoId: cust ? o.partner_id : o.worker_id,
        who: (cust ? p.name : w.full_name) || '',
        job: sc.title || sc.contract_number || '',
      };
    },

    /** Konfigurácia zoznamu objednávok pre `DataList`. */
    listConfig(rows) {
      const L = DanubraDataList;
      const esc = UI.esc;
      const ST = STATUS.map(s => [s[0], s[1]]);
      const statusIdx = (k) => { const i = ST.findIndex(s => s[0] === k); return i < 0 ? 99 : i; };
      const kindLabel = (k) => (KIND.find(x => x[0] === k) || [k, k])[1];
      const dni = (n) => `${n} ${Shell.plural(n, 'deň', 'dni', 'dní')}`;

      const titleCell = (r) => {
        const warn = r.noScope && r.open
          ? `<span class="dl-note ${r.cust ? 'is-amber' : 'is-red'}" title="${r.cust
            ? 'Bez popisu diela sa nedá skontrolovať, či faktúra sedí s objednávkou.'
            : 'Práve na to sa pýta kontrola — bez toho je Werkvertrag len na papieri.'}">${Icon('alert', 11)} nie je napísané, čo je dielo</span>` : '';
        return `<span class="dl-title"><b>${esc(r.title)}</b><small>${
          r.o.order_number ? esc(r.o.order_number) : '<em>bez čísla</em>'}${r.job ? ` · ${esc(r.job)}` : ''}</small>${warn}</span>`;
      };
      const refCell = (r) => {
        if (r.cust) {
          if (r.o.their_ref) return `<span class="dl-two"><b class="prt-vat">${esc(r.o.their_ref)}</b><small>ide na faktúru</small></span>`;
          return r.open ? '<span class="dl-two is-wrap"><span class="dl-note is-amber">chýba ich číslo</span><small>bez neho faktúru nepustia</small></span>' : '';
        }
        if (r.ram) return `<span class="dl-two"><b>rámcová ${esc(r.ram.number || '')}</b><small>${r.ram.signedAt ? `od ${L.fmtDay(r.ram.signedAt)}` : 'živnostník'}</small></span>`;
        return r.open ? '<span class="dl-note is-mute">bez rámcovej zmluvy</span>' : '';
      };
      const obdobieCell = (r) => {
        const t = L.rangeText(r.o.date_from, r.o.date_to);
        if (!t) return '';
        let note = '';
        if (r.open) {
          if (r.late && r.toStart < 0) note = `<span class="dl-note is-red">nástup bol pred ${dni(-r.toStart)}</span>`;
          else if (r.late) note = `<span class="dl-note is-amber">nástup ${r.toStart === 0 ? 'dnes' : `o ${dni(r.toStart)}`}</span>`;
          else if (r.toStart != null && r.toStart > 0 && r.toStart <= 30) note = `<span class="dl-note is-mute">začína o ${dni(r.toStart)}</span>`;
          else if (r.left != null && r.left >= 0 && r.left <= 30) note = `<span class="dl-note ${r.left <= 7 ? 'is-amber' : 'is-mute'}">končí o ${dni(r.left)}</span>`;
          else if (r.left != null && r.left < 0) note = `<span class="dl-note is-mute">skončilo pred ${dni(-r.left)}</span>`;
        }
        return `<span class="dl-two is-wrap"><b>${t}</b>${note}</span>`;
      };

      return {
        id: 'objednavky', storageKey: 'objednavky', label: 'Objednávky',
        noun: ['objednávka', 'objednávky', 'objednávok'],
        rows,
        rowClick: (r) => Ord.detail(r.id),
        rowClass: (r) => (r.hot ? 'is-hot' : r.problem ? 'is-warn' : !r.open ? 'is-muted' : ''),
        rowLabel: (r) => `Objednávka ${r.title}`,
        rowActions: [{ ico: 'chevron', label: 'Otvoriť objednávku', run: (r) => Ord.detail(r.id) }],
        onChange: (state) => {
          // Nová objednávka sa zakladá pre stranu, ktorá je práve vybraná.
          if (state && state.f && state.f.druh) this.kind = state.f.druh;
        },
        columns: [
          { key: 'objednavka', label: 'Objednávka', width: 'minmax(180px, 1.7fr)', mobile: 'title',
            render: titleCell, sortValue: (r) => r.o.order_number || r.title, sortLabel: 'Číslo' },
          { key: 'druh', label: 'Druh', width: '118px', mobile: 'meta', hideBelow: 1000,
            render: (r) => `<span class="ord-kind${r.cust ? '' : ' is-worker'}">${Icon(r.cust ? 'clients' : 'user', 13)}${esc(kindLabel(r.o.kind))}</span>`,
            sortValue: (r) => kindLabel(r.o.kind) },
          { key: 'komu', label: 'Odberateľ · živnostník', width: 'minmax(130px, 1fr)',
            render: (r) => (r.whoId && r.who ? Danubra.link(r.cust ? 'partner' : 'worker', r.whoId, r.who) : ''),
            sortValue: (r) => r.who },
          { key: 'ref', label: 'Ich číslo · rámcová', width: '160px', hideBelow: 880,
            tip: 'Od odberateľa: číslo jeho objednávky (Bestellung) — ide na našu faktúru, bez neho ju jeho účtovné oddelenie často neprepustí. Živnostníkovi: rámcová zmluva, na ktorú sa objednávka odvoláva.',
            render: refCell, sortValue: (r) => r.o.their_ref || (r.ram && r.ram.number) || null },
          { key: 'obdobie', label: 'Obdobie', width: '150px',
            render: obdobieCell, sortValue: (r) => r.o.date_from || null, sortLabel: 'Začiatok' },
          { key: 'sadzba', label: 'Sadzba', width: '82px', align: 'right', hideBelow: 1180,
            render: (r) => { const t = this.priceText(r.o); return t ? `<span class="dl-num">${esc(t)}</span>` : ''; },
            sortValue: (r) => Number(r.o.rate) || null, sortDir: -1 },
          { key: 'stav', label: 'Stav', width: '108px', mobile: 'badge',
            render: (r) => this.badge(r.o.status), sortValue: (r) => statusIdx(r.o.status || 'draft') },
        ],
        sorts: [
          { key: 'hori', label: 'Čo horí', value: (r) => [r.rank, r.toStart == null ? 1e6 : r.toStart, r.o.order_number || r.title] },
          { key: 'zalozena', label: 'Založená', value: (r) => r.o.created_at, dir: -1 },
        ],
        sort: { key: 'hori', dir: 1 },
        groups: [
          { key: 'druh', label: 'Druh', value: (r) => r.o.kind, labelOf: kindLabel, order: KIND.map(k => k[0]),
            tone: (k) => (k === 'worker' ? 'blue' : 'amber') },
          { key: 'stav', label: 'Stav', value: (r) => r.o.status || 'draft', labelOf: (k) => (STATUS.find(s => s[0] === k) || [k, k])[1],
            order: ST.map(s => s[0]), tone: (k) => (STATUS.find(s => s[0] === k) || [])[2] || 'gray' },
          { key: 'zakazka', label: 'Zákazka', value: 'job', emptyLabel: 'Bez zákazky' },
        ],
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať objednávku…', label: 'Hľadať číslo, ich číslo, názov, odberateľa, živnostníka alebo zákazku',
            fields: ['o.order_number', 'o.their_ref', 'title', 'who', 'job', 'o.scope'] },
          { key: 'druh', type: 'select', label: 'Druh', value: (r) => r.o.kind, options: KIND, allLabel: 'Obe strany',
            hint: 'Od odberateľa = čo si u nás objednal nemecký odberateľ. Živnostníkovi = čo sme objednali u neho.' },
          { key: 'stav', type: 'multi', label: 'Stav', value: (r) => r.o.status || 'draft', default: this.OPEN_STATUSES,
            options: ST, sortOptions: false, allLabel: 'Všetky',
            presets: [
              { label: 'Otvorené', value: this.OPEN_STATUSES, hint: 'Rozpracované, odoslané a potvrdené — bez vybavených a zrušených' },
              { label: 'Uzavreté', value: ['done', 'cancelled'] },
            ] },
          { key: 'komu', type: 'select', label: 'Komu · od koho', value: 'whoId',
            optionLabel: (v, r) => (r ? `${r.who}${r.cust ? '' : ' (živnostník)'}` : v), emptyLabel: 'Nezadané', allLabel: 'Všetci' },
          { key: 'problem', type: 'toggle', label: 'Len s problémom', test: (r) => r.problem,
            hint: 'Objednávky bez popisu diela, objednávky od odberateľa bez jeho čísla (ide na faktúru) a objednávky živnostníkovi, ktoré ešte nie sú odoslané, hoci nástup je do týždňa alebo už bol.' },
          { key: 'zakazka', type: 'select', label: 'Zákazka', value: (r) => r.o.subcontract_id, more: true,
            optionLabel: (v, r) => (r ? r.job || v : v), emptyLabel: 'Bez zákazky', allLabel: 'Všetky zákazky' },
          { key: 'obdobie', type: 'range-date', label: 'Obdobie', start: 'o.date_from', end: 'o.date_to', more: true,
            hint: 'Objednávky, ktorých obdobie sa prekrýva so zvoleným. Objednávka bez dátumov sa neukáže.' },
        ],
        empty: { ico: 'orders', title: 'Zatiaľ žiadna objednávka',
          sub: 'Keď odberateľ pošle objednávku, zapíšte ju aj s jeho číslom — to potom ide na faktúru. Objednávka živnostníkovi vzniká k nasadeniu a obháji Werkvertrag.',
          cta: `<button class="btn btn-primary" onclick="Ord.form()">${Icon('plus')} Objednávka</button>` },
        export: {
          name: ['objednavky'],
          columns: [
            ['Číslo', r => r.o.order_number], ['Druh', r => kindLabel(r.o.kind)], ['Názov', r => r.title],
            ['Odberateľ / živnostník', r => r.who],
            ['Ich číslo', r => r.o.their_ref], ['Zákazka', r => r.job],
            ['Od', r => r.o.date_from], ['Do', r => r.o.date_to], ['Sadzba', r => this.priceText(r.o)],
            ['Stav', r => (STATUS.find(s => s[0] === (r.o.status || 'draft')) || [, ''])[1]],
            ['Popis diela', r => r.o.scope],
          ],
        },
      };
    },

    // ── Formulár ──────────────────────────────────────────────────────────
    /**
     * Nová objednávka živnostníkovi rovno k nasadeniu — z karty človeka
     * („Vystaviť objednávku"). Stavba, termín a sadzba sa vyplnia z nasadenia,
     * aby sa nič neprepisovalo druhýkrát.
     */
    async newFor(assignmentId) {
      if (!this.loaded) await this.load();
      const a = this.assignments.find(x => x.id === assignmentId);
      if (!a) return UI.toast('Nasadenie sa nenašlo', 'err');
      const sc = this.subOf(a.subcontract_id);
      this.form(null, {
        kind: 'worker', assignment_id: a.id,
        title: sc.title || sc.contract_number || '',
        date_from: a.date_from, date_to: a.date_to,
        // Sadzba z nasadenia; keď tam nie je, jeho bežná sadzba z karty.
        price_model: 'hourly', rate: a.worker_rate || this.workerOf(a.worker_id).hourly_cost,
      });
    },

    form(id, preset) {
      const o = id ? (this.rows.find(x => x.id === id) || {})
        : { kind: this.kind, ...(preset || {}) };
      const k = o.kind || this.kind;
      // Objednávka patrí pred nástup, nie po ňom — preto aj plánované
      // nasadenia. Dovtedy sa ponúkali len tie, čo už bežali.
      const voľné = this.assignments.filter(a => ['planned', 'active'].includes(a.status)
        && (a.id === o.assignment_id || !this.rows.some(r => r.assignment_id === a.id)));

      const strana = k === 'customer'
        ? `${UI.field('partner_id', 'Odberateľ', { value: o.partner_id, required: true,
             add: 'partner', options: [['', '— vyberte —'],
               ...this.partners.map(p => [p.id, p.name])] })}
           ${UI.field('subcontract_id', 'Na ktorú zákazku', { value: o.subcontract_id,
             add: 'subcontract', options: [['', '— zatiaľ žiadna —'],
               ...this.subcontracts.map(s => [s.id, s.title || s.contract_number])] })}
           ${UI.field('their_ref', 'Jeho číslo objednávky', { value: o.their_ref,
             placeholder: 'napr. 4500123456',
             tip: 'Bestellung = objednávka po nemecky. Nemecká firma ju posiela s vlastným číslom (často dlhé, napr. 4500…). Opíšte ho presne.',
             hint: 'Číslo z jeho Bestellung. Ide na našu faktúru — bez neho ju '
               + 'účtovné oddelenie odberateľa často neprepustí.' })}
           ${UI.field('received_at', 'Kedy prišla', { type: 'date', value: o.received_at })}`
        : `${UI.field('assignment_id', 'Na ktoré nasadenie', { value: o.assignment_id,
             required: true, add: false,
             options: [['', '— vyberte —'], ...voľné.map((a) => {
               const w = this.workerOf(a.worker_id), s = this.subOf(a.subcontract_id);
               return [a.id, `${w.full_name || '?'} · ${s.title || s.contract_number || '?'}`];
             })],
             hint: 'Jedno nasadenie, jedna objednávka. Nasadenia, ktoré ju už majú, '
               + 'sa tu neponúkajú.' })}`;

      UI.modal(id ? 'Upraviť objednávku' : 'Nová objednávka', `
        <form onsubmit="event.preventDefault();Ord.save('${id || ''}','${k}',this)">
          ${!id ? `<div class="form-section">Čo to je</div>
            ${UI.field('kind', 'Strana', { value: k, options: KIND_OPTS,
              hint: 'Od odberateľa je to, čo si objednal u nás. Živnostníkovi je to, '
                + 'čo sme objednali u neho.' })}` : ''}
          <div class="form-section">Strany</div>
          <div class="form-grid">${strana}</div>

          <div class="form-section">Čo je dielo</div>
          ${UI.field('title', 'Krátky názov', { value: o.title, required: true,
            placeholder: 'napr. Sadrokartón 2. NP, blok B' })}
          ${UI.field('scope', 'Popis diela', { type: 'textarea', rows: 4, value: o.scope,
            hint: k === 'worker'
              ? 'Toto je to, na čo sa pýta kontrola. „Robil, čo bolo treba" je zlá '
                + 'odpoveď — napíšte, čo presne má byť hotové.'
              : 'Čo presne si odberateľ objednal. Podľa toho sa potom kontroluje faktúra.' })}
          <div class="form-grid">
            ${UI.field('date_from', 'Od', { type: 'date', value: o.date_from,
              tip: 'Obdobie, kedy sa dielo robí — od nástupu po plánované dokončenie.' })}
            ${UI.field('date_to', 'Do', { type: 'date', value: o.date_to })}
          </div>

          <div class="form-section">Cena</div>
          <div class="form-grid">
            <!-- Vždy po hodinách — model sa nevyberá. -->
            <input type="hidden" name="price_model" value="hourly">
            ${UI.field('rate', 'Sadzba €/h', { type: 'number', step: '0.01', value: o.rate,
              tip: k === 'worker'
                ? 'Koľko zaplatíme živnostníkovi za jednu jeho hodinu, bez DPH. Predvyplní sa z nasadenia.'
                : 'Koľko nám odberateľ zaplatí za jednu hodinu práce jedného človeka, bez DPH.',
              hint: k === 'worker'
                ? 'Na stavbe musí byť aspoň Bau-Mindestlohn.' : 'Fakturujeme vždy po hodinách.' })}
            ${UI.field('status', 'Stav', { value: o.status || 'draft', options: STATUS_OPTS,
              tip: 'Rozpracovaná = ešte sa dopĺňa. Odoslaná = poslali sme ju druhej strane. Potvrdená = druhá strana súhlasí (podpísala). Vybavená = dielo je hotové. Zrušená = neplatí.' })}
          </div>
          ${UI.field('notes', 'Poznámka', { type: 'textarea', value: o.notes })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Založiť'}</button>
          </div>
        </form>`, { wide: true });
    },

    // Dvojklik na „Založiť" pridelil dve čísla a založil dve objednávky.
    save(id, kind, form) {
      if (this._saving) return undefined;
      this._saving = true;
      return this._save(id, kind, form).finally(() => { this._saving = false; });
    },

    async _save(id, kind, form) {
      const v = UI.formData(form);
      const k = v.kind || kind;
      const num = (x) => (x === '' || x == null ? null : Number(x));
      const payload = {
        kind: k,
        title: v.title, scope: v.scope || null,
        date_from: v.date_from || null, date_to: v.date_to || null,
        price_model: v.price_model || 'hourly',
        rate: num(v.rate), unit_price: num(v.unit_price),
        unit_label: v.unit_label || null, fixed_price: num(v.fixed_price),
        status: v.status || 'draft', notes: v.notes || null,
      };
      if (k === 'customer') {
        payload.partner_id = v.partner_id || null;
        payload.subcontract_id = v.subcontract_id || null;
        payload.their_ref = v.their_ref || null;
        payload.received_at = v.received_at || null;
        payload.worker_id = null; payload.assignment_id = null;
      } else {
        const a = this.assignments.find(x => x.id === v.assignment_id);
        if (!a) return UI.toast('Vyberte nasadenie.', 'err');
        payload.assignment_id = a.id;
        payload.worker_id = a.worker_id;
        payload.subcontract_id = a.subcontract_id;
        payload.partner_id = null;
      }

      // Číslo sa prideľuje až pri založení — a transakčne, takže v rade
      // nikdy nevznikne diera ani duplicita.
      if (!id) {
        const { data: n, error: ne } = await DB.rpc('next_number', { p_kind: 'order' });
        if (ne) return UI.toast('Číslo sa nepodarilo prideliť: ' + ne.message, 'err');
        payload.order_number = n;
      }

      const { error } = id
        ? await DB.update('work_orders', id, payload)
        : await DB.insert('work_orders', payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal();
      UI.toast(id ? 'Uložené' : 'Objednávka založená', 'ok');
      this.loaded = false;
      // Karta človeka sa pýta „má objednávku?" — musí to vedieť hneď.
      if (window.Wrk) Wrk.loaded = false;
      // Aj zákazka — objednávka sa vystavuje priamo z jej piateho kroku.
      if (window.Sub) Sub.loaded = false;
      Danubra.renderRoute();
    },

    // ── Detail ────────────────────────────────────────────────────────────
    detail(id) {
      const o = this.rows.find(x => x.id === id);
      if (!o) return;
      const kto = o.kind === 'customer'
        ? this.partnerOf(o.partner_id).name : this.workerOf(o.worker_id).full_name;
      const sc = this.subOf(o.subcontract_id);
      const kv = (l, v) => (v ? `<div><span>${UI.esc(l)}</span><strong>${v}</strong></div>` : '');

      UI.modal(o.title || 'Objednávka', `
        <div class="detail-head">
          ${this.badge(o.status)}
          <span class="muted">
            ${o.order_number ? UI.esc(o.order_number) : 'bez čísla'} ·
            ${o.kind === 'customer' ? 'od odberateľa' : 'živnostníkovi'}</span>
        </div>
        <div class="kv">
          ${kv(o.kind === 'customer' ? 'Odberateľ' : 'Živnostník', UI.esc(kto || '—'))}
          ${kv('Ich číslo', o.their_ref ? UI.esc(o.their_ref) : '')}
          ${kv('Zákazka', sc.title ? UI.esc(sc.title) : '')}
          ${kv('Termín', o.date_from ? UI.esc(UI.dateRange(o.date_from, o.date_to)) : '')}
          ${kv('Cena', UI.esc(this.priceText(o)))}
        </div>
        ${o.scope
          ? `<div class="form-section">Čo je dielo</div>
             <div class="notebox">${UI.esc(o.scope)}</div>`
          : `<div class="warnbox">${Icon('alert', 14)}
              <strong>Nie je napísané, čo je dielo.</strong>
              ${o.kind === 'worker'
                ? 'Práve na to sa pýta kontrola — bez toho je Werkvertrag len na papieri.'
                : 'Bez toho sa nedá skontrolovať, či faktúra sedí s objednávkou.'}</div>`}
        ${o.notes ? `<div class="form-section">Poznámka</div>
          <div class="notebox">${UI.esc(o.notes)}</div>` : ''}
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          <button class="btn btn-outline" onclick="Ord.form('${o.id}')">${Icon('edit', 14)} Upraviť</button>
          <span style="align-self:center;display:inline-flex;">${UI.tip(o.kind === 'customer'
            ? 'Objednávka SK/DE = dvojjazyčný dokument, ktorý podpisujú obe strany; ním vzniká zmluva o dielo k rámcovej zmluve. Potvrdenie objednávky (Auftragsbestätigung) = náš krátky papier po nemecky, že jeho objednávku prijímame.'
            : 'Objednávka = dokument po slovensky pre živnostníka: čo presne má urobiť, kde, kedy a za koľko. Odvoláva sa na jeho rámcovú zmluvu.')}</span>
          ${o.kind === 'customer' ? `
            <!-- Potvrdenie je papier, ktorý posielame my. Objednávka SK/DE je
                 dokument, ktorý podpisujú obe strany a ktorým vzniká
                 individuálna zmluva o dielo. -->
            <button class="btn btn-outline" onclick="Ord.bestellung('${o.id}')">
              ${Icon('doc', 14)} Objednávka SK/DE</button>` : ''}
          <button class="btn btn-primary" onclick="Ord.document('${o.id}')">
            ${Icon('doc', 14)} ${o.kind === 'customer' ? 'Potvrdenie objednávky' : 'Objednávka'}</button>
        </div>`, { wide: true });
    },

    /**
     * Dvojjazyčná objednávka pre nemeckého odberateľa.
     *
     * `Auftragsbestätigung` je **potvrdenie** jeho objednávky — papier, ktorý
     * posielame my. Toto je tá objednávka samotná: dokument, ktorý sa odvoláva
     * na rámcovú zmluvu a podpisujú ho obe strany. Práve ňou vzniká
     * individuálna zmluva o dielo.
     */
    async bestellung(id) {
      const o = this.rows.find(x => x.id === id);
      if (!o) return;
      if (!Danubra.supplierReady('Objednávka')) return;
      const supplier = Danubra.supplier();
      const p = this.partnerOf(o.partner_id);
      // Rámcová zmluva s týmto odberateľom. Bez nej sa to na papier napíše.
      const c = this.contracts.find(x => x.partner_id === o.partner_id);

      const html = DanubraPapers.bestellung({
        order: {
          number: o.order_number, scope_sk: o.scope, scope_de: o.scope_de || o.scope,
          rate: o.rate, currency: o.currency,
          hours_week: o.hours_week, hours_week_de: o.hours_week_de,
          date_from: o.date_from, date_to: o.date_to, extendable: !!o.extendable,
          places: o.places || [], places_de: o.places_de || [],
          special_sk: o.notes, special_de: o.notes_de,
          signed_at: o.received_at,
        },
        supplier,
        client: {
          name: p.name,
          address: [p.address, p.postal_code, p.city, p.country].filter(Boolean).join(', '),
          registration_no: p.registration_no, ust_idnr: p.ust_idnr,
          contact_person: p.contact_person,
        },
        ramcova: c ? { number: c.contract_number, signedAt: c.signed_at } : null,
      });
      Docs.show(window.open('', '_blank'), html, { kind: 'objednavka', title: 'Bestellung',
        number: o.order_number, who: p.name, lang: 'de', partner_id: o.partner_id || null,
        subcontract_id: o.subcontract_id || null });
    },

    /** Doklad. Odberateľovi po nemecky, živnostníkovi po slovensky. */
    async document(id, okno) {
      const o = this.rows.find(x => x.id === id);
      if (!o) { if (okno) okno.close(); return; }
      if (!Danubra.supplierReady('Objednávka')) { if (okno) okno.close(); return; }
      const supplier = Danubra.supplier();
      const html = DanubraPapers.workOrder({
        order: o, supplier,
        partner: o.partner_id ? this.partnerOf(o.partner_id) : null,
        worker: o.worker_id ? this.workerOf(o.worker_id) : null,
        subcontract: this.subOf(o.subcontract_id),
        ramcova: o.worker_id ? this.ramcovaOf(o.worker_id) : null,
      });
      // `okno` je otvorené vopred, keď sa pred papierom ešte načítavalo.
      const odNemca = o.kind === 'customer';
      Docs.show(okno || window.open('', '_blank'), html, {
        kind: odNemca ? 'auftrag' : 'objednavka', title: odNemca ? 'Auftragsbestätigung' : 'Objednávka',
        number: o.order_number, lang: odNemca ? 'de' : 'sk',
        who: odNemca ? this.partnerOf(o.partner_id).name : this.workerOf(o.worker_id).full_name,
        worker_id: o.worker_id || null, partner_id: o.partner_id || null,
        subcontract_id: o.subcontract_id || null });
    },
  };

  // Číselníky pre `UI.field` — musia byť dostupné aj v šablóne formulára.
  const KIND_OPTS = KIND;
  const STATUS_OPTS = STATUS.map(s => [s[0], s[1]]);
  const PRICE_OPTS = PRICE;

  window.Ord = Ord;
  Danubra.views.orders = function (el) { return Ord.view(el); };
})();
