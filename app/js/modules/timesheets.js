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

  // Stav záznamu hodín v zozname. Uzavreté obdobie a faktúra sa už nemenia —
  // schváliť, zrušiť schválenie ani archivovať sa tam nedá (stráži to aj
  // trigger v databáze, tu sa na to ani neponúka tlačidlo).
  const STATE = [
    ['open', 'Neschválené', 'amber'],
    ['approved', 'Schválené', 'green'],
    ['closed', 'Uzavreté obdobie', 'blue'],
    ['invoiced', 'Vo faktúre', 'gray'],
  ];

  const Tms = {
    items: [], assignments: [], workers: [], subcontracts: [], loaded: false,
    periods: [], sheets: [], crews: [], crewMembers: [],
    // Odovzdanie z inej obrazovky (napr. zákazka → „Schváliť hodiny"):
    // `subcontract_id` / `worker_id` sa pri vykreslení prenesú do filtrov
    // zoznamu. Ostatné kľúče zostali kvôli `Tms.filtered()` bez zoznamu.
    filters: { month: '', worker_id: '', subcontract_id: '', q: '', period: 'all', from: '', to: '' },

    async load() {
      const [t, a, w, s, p, sh, c, cm] = await Promise.all([
        DB.list('timesheets', { order: { column: 'work_date', ascending: false }, limit: 2000 }),
        DB.list('assignments', { limit: 1000 }),
        DB.list('workers', { select: 'id,full_name,profession,skill_level,gross_monthly', limit: 500 }),
        DB.list('subcontracts', { select: 'id,title,work_type,charge_rate,partner_id,contract_number', limit: 500 }),
        // Kvôli stĺpcom Stav (uzavreté obdobie, faktúra), Podpis majstra a Partia.
        DB.list('periods', { select: 'id,subcontract_id,status,period_from,period_to', limit: 2000 }),
        DB.list('hour_sheets', { limit: 2000 }),
        DB.list('crews', { select: 'id,name,status', limit: 300 }),
        DB.list('crew_members', { limit: 3000 }),
      ]);
      this.items = t.data || []; this.assignments = a.data || [];
      this.workers = w.data || []; this.subcontracts = s.data || [];
      this.periods = (p && p.data) || []; this.sheets = (sh && sh.data) || [];
      this.crews = (c && c.data) || []; this.crewMembers = (cm && cm.data) || [];
      this.loaded = true;
    },

    workerOf(id) { return this.workers.find(w => w.id === id); },
    asgOf(id) { return this.assignments.find(a => a.id === id); },
    subOf(id) { return this.subcontracts.find(s => s.id === id); },
    actMeta(a) { return ACTIVITY.find(x => x[0] === a) || ACTIVITY[0]; },

    /**
     * Záznamy, ktoré sú práve vidieť. Keď je vykreslený zoznam, sú to presne
     * jeho riadky (filtre, zoradenie) — schválenie a export berú to isté, čo
     * človek vidí. Bez zoznamu (napr. z inej obrazovky) starý filter.
     */
    filtered() {
      if (window.DataList && DataList._reg && DataList._reg.hodiny) {
        return DataList.visible('hodiny').map(r => r.t);
      }
      const f = this.filters;
      const pre = this.items.filter(t => {
        if (f.month && !String(t.work_date).startsWith(f.month)) return false;
        if (f.worker_id && t.worker_id !== f.worker_id) return false;
        if (f.subcontract_id) {
          const a = this.asgOf(t.assignment_id);
          if (!a || a.subcontract_id !== f.subcontract_id) return false;
        }
        return true;
      });
      // Mesiac je rýchla voľba, obdobie je presná — dajú sa kombinovať, lebo
      // „september, ale len prvý týždeň" je bežná otázka.
      return Shell.filterRows(pre, {
        q: f.q,
        fields: ['description', (t) => (this.workerOf(t.worker_id) || {}).full_name,
          (t) => { const a = this.asgOf(t.assignment_id);
            return a ? (this.subOf(a.subcontract_id) || {}).title : ''; }],
        period: { field: 'work_date', key: f.period, from: f.from, to: f.to },
      });
    },

    exportCsv() {
      const f = this.filters;
      Shell.exportCsv(this.filtered(), [
        ['Dátum', t => t.work_date],
        ['Živnostník', t => (this.workerOf(t.worker_id) || {}).full_name],
        ['Zákazka', t => { const a = this.asgOf(t.assignment_id);
          return a ? (this.subOf(a.subcontract_id) || {}).title : ''; }],
        ['Činnosť', t => this.actMeta(t.activity_type)[1]],
        ['Od', t => t.time_from],
        ['Do', t => t.time_to],
        ['Hodiny', t => DanubraExport.num(t.hours, 2)],
        ['Sadzba', t => DanubraExport.num(t.rate_used)],
        ['Schválené', t => (t.approved ? 'áno' : 'nie')],
        ['Popis', t => t.description],
      ], ['hodiny',
        Shell.periodSlug({ field: 'work_date', key: f.period, from: f.from, to: f.to })]);
    },

    /**
     * Jediné tlačidlo na zápis hodín. Stundennachweis je 99 % prípadov: list
     * s hodinami celej partie alebo jedného človeka za týždeň, podpísaný
     * majstrom — ručne alebo z fotky (components/hourentry.js). Dovtedy tu
     * boli tri tlačidlá („Stundennachweis", „Zapísať týždeň", „Jeden deň")
     * a v appke ďalšie tri inak pomenované; „Jeden deň" je teraz voľba
     * v tom istom okne. Zákazka z filtra sa predvyplní.
     */
    entryCall() {
      const st = window.DataList ? DataList.state('hodiny') : null;
      const fz = st && st.f ? st.f.zakazka : '';
      const sub = this.filters.subcontract_id
        || (fz && fz !== DanubraDataList.NONE && /^[\w-]+$/.test(fz) ? fz : '');
      return window.HourEntry
        ? `HourEntry.open(${sub ? `{ subcontractId: '${sub}' }` : ''})` : 'Tms.form()';
    },

    actionsHtml() {
      return `
        <button class="btn btn-primary btn-sm" onclick="${this.entryCall()}">${Icon('upload', 14)} Zapísať hodiny</button>
        ${UI.tip('Hodiny sa zapisujú zo Stundennachweisu, ktorý podpísal majster: natukáte ich do tabuľky zákazky a týždňa, alebo nahráte fotku listu. Deň inej práce (cesta, dielňa) je v tom istom okne ako „Jeden deň inej práce". Schvaľuje sa zvlášť — fajkou pri riadku alebo „Schváliť" hore.')}`;
    },

    async view(el) {
      Danubra.setActions(this.actionsHtml());
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const today = new Date().toISOString().slice(0, 10);
      const rows = this.items.map(t => this.listRow(t, today));

      // Zoznam je spoločný komponent (`DataList`): lišta filtrov, čipy toho,
      // čo je zapnuté, a riadky po stĺpcoch. Dovtedy tu bol riadok s menom
      // a fajkou, filter len podľa človeka, zákazky a obdobia a mesiac, ktorý
      // sa nedal zmeniť. Prehľad hore (veta, varovanie, súčty) sa počíta
      // z toho, čo je práve vo filtri, a prepočíta sa pri každej zmene.
      const list = DataList.html(this.listConfig(rows));
      const shown = DataList.visible('hodiny').map(r => r.t);
      el.innerHTML = Danubra.header('Odpracované hodiny',
        `<span id="tms-sum">${this.sumText(shown)}</span>${UI.tip('Schválené = niekto skontroloval, že hodiny sedia. Len schválené hodiny idú do podkladu na faktúru. Fajka pri riadku záznam schváli (zelená), ďalší klik schválenie zruší. Hodiny v uzavretom období alebo vo faktúre sa už nemenia.')}`)
        + `<div id="tms-top">${this.topHtml(shown)}</div>` + list;

      // Odovzdanie z inej obrazovky (zákazka → „Schváliť hodiny").
      const hand = { zakazka: this.filters.subcontract_id, clovek: this.filters.worker_id };
      this.filters.subcontract_id = ''; this.filters.worker_id = '';
      for (const [k, v] of Object.entries(hand)) if (v) DataList.set('hodiny', k, v);
    },

    /** „120 h · 3 neschválené" za to, čo je vo filtri. */
    sumText(rows) {
      const h = rows.reduce((s, t) => s + Number(t.hours || 0), 0);
      const n = rows.filter(t => !t.approved).length;
      return `${Math.round(h)} h vo filtri · ${n} ${Shell.plural(n, 'neschválený', 'neschválené', 'neschválených')}`;
    },

    /** Veta „čo spraviť teraz", varovanie §19 AEntG a súčty — za riadky vo filtri. */
    topHtml(rows) {
      const share = DanubraMargin.constructionShare(rows);
      const totalHours = rows.reduce((s, t) => s + Number(t.hours || 0), 0);
      // hodiny staršie ako 7 dní bez zápisu sú riziko podľa §19 AEntG
      const today = new Date();
      const late = rows.filter(t => {
        const d = new Date(t.work_date);
        return !t.approved && (today - d) / 86400000 > 7;
      }).length;
      return this.nowHtml(rows) +
        (late ? `<div class="warnbox" style="margin-bottom:14px;">
          ${Icon('alert', 14)} ${late} ${late === 1 ? 'záznam je' : 'záznamov je'} starších ako 7 dní bez schválenia —
          dokumentácia pracovného času sa podľa §19 AEntG vedie do 7 dní po výkone práce.${UI.tip('AEntG je nemecký zákon o ľuďoch vyslaných na prácu do Nemecka. Podľa §19 musí byť začiatok, koniec a dĺžka práce zapísaná najneskôr do 7 dní. Kontroluje to colná správa (Zoll).')}
          <button type="button" class="dl-link" onclick="DataList.set('hodiny','late',true)">Ukázať ich</button></div>` : '') + `

        <div class="kpi-grid" style="margin-bottom:16px;">
          <div class="kpi"><div class="kpi-label">Hodiny spolu</div>
            <div class="kpi-value">${Math.round(totalHours)}</div>
            <div class="kpi-delta">za to, čo je vo filtri</div></div>
          <div class="kpi"><div class="kpi-label">Stavba${UI.tip('Hodiny priamo na stavenisku. Percento je z produktívnych hodín, teda stavba + dielňa (cesta sa nepočíta).')}</div>
            <div class="kpi-value" style="color:var(--amber);">${Math.round(share.constructionHours)}</div>
            <div class="kpi-delta">${UI.pct(share.pct)} z produktívnych</div></div>
          <div class="kpi"><div class="kpi-label">Dielňa</div>
            <div class="kpi-value" style="color:var(--blue);">${Math.round(share.totalHours - share.constructionHours)}</div>
            <div class="kpi-delta">bez SOKA-BAU</div></div>
          <div class="kpi"><div class="kpi-label">SOKA-BAU${UI.tip('SOKA-BAU je nemecká stavebná pokladnica (dovolenky a dôchodky stavbárov). Keď je viac ako polovica produktívnych hodín na stavbe, vzťahuje sa na nás a treba do nej hlásiť a platiť. Počíta sa z hodín, ktoré sú práve vo filtri.')}</div>
            <div class="kpi-value" style="color:${share.sokaRequired ? 'var(--red)' : 'var(--green)'};">${share.sokaRequired ? 'Áno' : 'Nie'}</div>
            <div class="kpi-delta">${share.sokaRequired ? 'stavba nad 50 %' : 'pod hranicou 50 %'}</div></div>
        </div>`;
    },

    /** Prehľad hore a tlačidlo „Zapísať hodiny" po zmene filtra. */
    onListChange(rows) {
      const shown = rows.map(r => r.t);
      const top = document.getElementById('tms-top');
      if (top) top.innerHTML = this.topHtml(shown);
      const sum = document.getElementById('tms-sum');
      if (sum) sum.textContent = this.sumText(shown);
      if (Danubra.route === 'timesheets') Danubra.setActions(this.actionsHtml());
    },

    // ── Zoznam (DataList) ─────────────────────────────────────────────────
    /** Obdobie, do ktorého deň patrí (podľa `period_id`, inak podľa dátumu zákazky). */
    periodOf(t, subId) {
      if (t.period_id) {
        const p = this.periods.find(x => x.id === t.period_id);
        if (p) return p;
      }
      const d = String(t.work_date || '').slice(0, 10);
      return this.periods.find(p => p.subcontract_id === subId && ['closed', 'invoiced'].includes(p.status)
        && String(p.period_from).slice(0, 10) <= d && String(p.period_to).slice(0, 10) >= d) || null;
    },

    /** Stav pre zoznam: open | approved | closed | invoiced. */
    stateOf(t, period) {
      if (period && period.status === 'invoiced') return 'invoiced';
      if (period && period.status === 'closed') return 'closed';
      return t.approved ? 'approved' : 'open';
    },

    /** Partie, v ktorých bol človek v ten deň. */
    crewsOf(workerId, date) {
      return this.crewMembers.filter(m => m.worker_id === workerId
        && (!m.joined_at || String(m.joined_at).slice(0, 10) <= date)
        && (!m.left_at || String(m.left_at).slice(0, 10) >= date)).map(m => m.crew_id);
    },

    listRow(t, today) {
      const w = this.workerOf(t.worker_id);
      const a = this.asgOf(t.assignment_id);
      const sc = a ? this.subOf(a.subcontract_id) : null;
      const date = String(t.work_date || '').slice(0, 10);
      const kw = date && window.DanubraHourSheet ? DanubraHourSheet.isoWeek(date) : null;
      const period = this.periodOf(t, sc ? sc.id : null);
      const state = this.stateOf(t, period);
      const age = date ? DanubraDataList.daysBetween(date, today) : null;
      const late = state === 'open' && age != null && age > 7;
      const sheet = kw && sc && window.DanubraHourScan && DanubraHourScan.pickSheet
        ? DanubraHourScan.pickSheet(this.sheets, { subcontractId: sc.id, year: kw.year, week: kw.week }) : null;
      const crews = this.crewsOf(t.worker_id, date);
      return {
        id: t.id, t, w, sc, date, kw, period, state, late, age,
        locked: state === 'closed' || state === 'invoiced',
        signed: !!(sheet && sheet.signed_at), sheet,
        name: w ? w.full_name : '', sub: sc ? sc.title : '',
        crews, crewNames: crews.map(id => (this.crews.find(c => c.id === id) || {}).name).filter(Boolean),
        week: kw ? `${kw.year}-${String(kw.week).padStart(2, '0')}` : '',
        hours: Number(t.hours) || 0,
      };
    },

    weekLabel(key) {
      const [y, w] = String(key).split('-').map(Number);
      if (!y || !w || !window.DanubraHourSheet) return key;
      const d = DanubraHourSheet.weekDates(y, w);
      return `KW ${w}/${y} · ${DanubraDataList.rangeText(d[0].date, d[d.length - 1].date)}`;
    },

    /** Konfigurácia zoznamu hodín pre `DataList`. */
    listConfig(rows) {
      const L = DanubraDataList;
      const h = (n) => `${Number(n).toLocaleString('sk-SK', { maximumFractionDigits: 2 })} h`;
      const stateMeta = (k) => STATE.find(s => s[0] === k) || STATE[0];
      const stateIdx = (k) => STATE.findIndex(s => s[0] === k);
      const tm = (x) => (x ? String(x).slice(0, 5) : '');
      const lockTip = 'Obdobie je uzavreté alebo vo faktúre — hodiny sa už nemenia. Oprava ide ako nový záznam na zákazke.';

      const stateCell = (r) => {
        const m = stateMeta(r.state);
        const extra = r.late ? `<span class="dl-note is-red">${r.age} ${Shell.plural(r.age, 'deň', 'dni', 'dní')} bez schválenia</span>`
          : r.state === 'approved' && r.t.approved_at ? `<small>${L.fmtDay(r.t.approved_at, { year: false })}</small>` : '';
        return `<span class="dl-two ts-state">${UI.badge(m[1], r.late ? 'red' : m[2])}${extra}</span>`;
      };
      const actsCell = (r) => {
        if (r.locked) {
          return `<span class="ts-acts"><span class="ts-lock" title="${UI.esc(lockTip)}" aria-label="${UI.esc(lockTip)}">${Icon('lock', 14)}</span></span>`;
        }
        return `<span class="ts-acts">
          <button type="button" class="ts-btn${r.t.approved ? ' is-on' : ''}" onclick="Tms.toggleApprove('${r.id}')"
            aria-pressed="${!!r.t.approved}" title="${r.t.approved ? 'Schválené — kliknutím schválenie zrušíte' : 'Schváliť'}"
            aria-label="${r.t.approved ? 'Zrušiť schválenie' : 'Schváliť'}: ${UI.esc(r.name)} ${UI.esc(L.fmtDay(r.date))}">${Icon('check', 15)}</button>
          <button type="button" class="ts-btn is-arch" onclick="Tms.del('${r.id}')"
            title="Archivovať" aria-label="Archivovať záznam hodín">${Icon('archive', 15)}</button></span>`;
      };

      return {
        id: 'hodiny', storageKey: 'hodiny', label: 'Odpracované hodiny',
        noun: ['záznam', 'záznamy', 'záznamov'],
        rows,
        // Klik na riadok otvorí týždeň tej zákazky v okne „Zapísať hodiny" —
        // tam sa hodiny opravujú aj podpisujú (uzavreté dni okno nezmení).
        rowClick: window.HourEntry
          ? (r) => HourEntry.open({ subcontractId: r.sc ? r.sc.id : undefined, year: r.kw && r.kw.year, week: r.kw && r.kw.week })
          : null,
        rowClass: (r) => (r.late ? 'is-hot' : r.state === 'open' ? 'is-warn' : r.locked ? 'is-muted' : ''),
        rowLabel: (r) => `Hodiny ${r.name} ${L.fmtDay(r.date)}`,
        onChange: (_s, vis) => this.onListChange(vis),
        foot: (vis) => ({ cells: {
          clovek: `<b>Spolu</b> <span class="dl-note is-mute">${vis.length} ${Shell.plural(vis.length, 'záznam', 'záznamy', 'záznamov')}</span>`,
          hodiny: `<b class="dl-num">${h(vis.reduce((n, r) => n + r.hours, 0))}</b>` } }),
        columns: [
          { key: 'clovek', label: 'Človek', width: 'minmax(150px, 1.3fr)', mobile: 'title',
            render: (r) => `<span class="dl-title"><b>${UI.esc(r.name || '—')}</b>${
              r.crewNames.length ? `<small>${UI.esc(r.crewNames.join(', '))}</small>` : ''}</span>`,
            sortValue: (r) => r.name },
          // Druh práce je bodka a slovo pod zákazkou — samostatný stĺpec by
          // na bežnej šírke vytlačil podpis majstra.
          { key: 'zakazka', label: 'Zákazka · druh práce', width: 'minmax(150px, 1.4fr)',
            render: (r) => { const m = this.actMeta(r.t.activity_type);
              return `<span class="dl-two"><b title="${UI.esc(r.sub)}">${UI.esc(r.sub || '—')}</b><small class="ts-act-${m[0]}"><i class="ts-dot" aria-hidden="true"></i>${
                m[1]}${r.sc && r.sc.contract_number ? ` · ${UI.esc(r.sc.contract_number)}` : ''}</small></span>`; },
            sortValue: (r) => r.sub, sortLabel: 'Zákazka', csv: (r) => r.sub },
          { key: 'den', label: 'Deň', width: '118px',
            render: (r) => `<span class="dl-two"><b>${UI.esc(L.fmtDay(r.date))}</b>${r.kw ? `<small>KW ${r.kw.week}</small>` : ''}</span>`,
            sortValue: (r) => r.date, sortDir: -1, sortLabel: 'Deň' },
          { key: 'hodiny', label: 'Hodiny', width: '92px', align: 'right',
            render: (r) => `<span class="dl-two ts-h"><b class="dl-num">${h(r.hours)}</b>${
              r.t.time_from || r.t.time_to ? `<small class="dl-num">${tm(r.t.time_from)}–${tm(r.t.time_to)}</small>` : ''}</span>`,
            sortValue: (r) => r.hours, sortDir: -1 },
          { key: 'stav', label: 'Stav', width: '138px', mobile: 'line',
            tip: 'Neschválené → Schválené → Uzavreté obdobie → Vo faktúre. Červené sú neschválené staršie ako 7 dní (§19 AEntG).',
            render: stateCell,
            // Čo horí hore: neschválené staršie ako 7 dní, potom neschválené,
            // potom schválené; uzavreté a vo faktúre na koniec.
            sortValue: (r) => [r.late ? 0 : 1, stateIdx(r.state), r.late ? -r.age : 0],
            sortLabel: 'Čo horí (stav)' },
          { key: 'podpis', label: 'Podpis majstra', width: '128px', mobileLabel: 'podpis',
            tip: 'Stundennachweis za tento týždeň a zákazku: podpísal ho majster? Zapisuje sa v okne „Zapísať hodiny".',
            render: (r) => (r.signed
              ? `<span class="dl-ok">${Icon('check', 13)} ${UI.esc(L.fmtDay(r.sheet.signed_at, { year: false }))}</span>`
              : '<span class="dl-note is-mute">nepodpísaný</span>'),
            sortValue: (r) => (r.signed ? 1 : 0), csv: (r) => (r.signed ? `podpísaný ${L.fmtDay(r.sheet.signed_at)}` : 'nepodpísaný') },
          { key: 'akcie', label: '', width: '76px', align: 'right', mobile: 'badge', csv: false, render: actsCell },
        ],
        sorts: [
          { key: 'zapisane', label: 'Zapísané', value: (r) => r.t.created_at, dir: -1 },
          { key: 'druh', label: 'Druh práce', value: (r) => this.actMeta(r.t.activity_type)[1] },
        ],
        sort: { key: 'stav', dir: 1 },
        groups: [
          { key: 'tyzden', label: 'Týždeň', value: 'week', labelOf: (k) => (k ? this.weekLabel(k) : 'Bez dátumu'),
            order: [...new Set(rows.map(r => r.week))].sort().reverse() },
          { key: 'zakazka', label: 'Zákazka', value: (r) => r.sub || '', labelOf: (k) => k || 'Bez zákazky' },
          { key: 'clovek', label: 'Človek', value: 'name', labelOf: (k) => k || 'Bez mena' },
          { key: 'stav', label: 'Stav', value: 'state', labelOf: (k) => stateMeta(k)[1],
            tone: (k) => ({ open: 'amber', approved: 'green', closed: 'blue', invoiced: 'gray' }[k]), order: STATE.map(s => s[0]) },
        ],
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať meno, zákazku, popis…', label: 'Hľadať meno, zákazku alebo popis',
            fields: ['name', 'sub', 't.description', 'sc.contract_number', (r) => r.crewNames.join(' ')] },
          { key: 'zakazka', type: 'select', label: 'Zákazka', value: (r) => (r.sc ? r.sc.id : ''),
            optionLabel: (v, r) => (r && r.sc ? r.sc.title : v), emptyLabel: 'Bez zákazky', allLabel: 'Všetky zákazky' },
          { key: 'clovek', type: 'select', label: 'Človek', value: (r) => r.t.worker_id,
            optionLabel: (v, r) => (r ? r.name || v : v), allLabel: 'Všetci ľudia' },
          { key: 'obdobie', type: 'range-date', label: 'Obdobie', field: 'date', default: DataList.quickRanges()[0],
            hint: 'Predvolene tento mesiac. Rýchla voľba alebo presné dni od–do.' },
          { key: 'stav', type: 'multi', label: 'Stav', value: 'state', options: STATE.map(s => [s[0], s[1]]), sortOptions: false,
            presets: [
              { label: 'Na schválenie', value: ['open'], hint: 'Len neschválené' },
              { label: 'Dá sa meniť', value: ['open', 'approved'], hint: 'Bez uzavretých období a faktúr' },
            ] },
          { key: 'late', type: 'toggle', label: 'Neschválené 7+ dní', chipLabel: 'Neschválené staršie ako 7 dní', test: (r) => r.late,
            hint: 'Podľa §19 AEntG sa pracovný čas zapisuje najneskôr do 7 dní po výkone práce.' },
          { key: 'partia', type: 'select', label: 'Partia', value: (r) => (r.crews.length ? r.crews : ''), more: true,
            optionLabel: (v) => (this.crews.find(c => c.id === v) || {}).name || v, emptyLabel: 'Bez partie', allLabel: 'Všetky partie' },
          { key: 'tyzden', type: 'select', label: 'Týždeň', value: 'week', more: true, allLabel: 'Všetky týždne',
            options: (rs) => [...new Set(rs.map(r => r.week).filter(Boolean))].sort().reverse().map(k => [k, this.weekLabel(k)]) },
          { key: 'druh', type: 'multi', label: 'Druh práce', value: (r) => r.t.activity_type || 'construction', more: true,
            options: ACTIVITY.map(a => [a[0], a[1]]), sortOptions: false },
          { key: 'podpis', type: 'select', label: 'Podpis majstra', value: (r) => (r.signed ? 'yes' : 'no'), more: true,
            options: [['yes', 'Podpísaný'], ['no', 'Nepodpísaný']], allLabel: 'Podpísané aj nie' },
        ],
        maxPrimary: 5,
        empty: { ico: 'clock', title: 'Žiadne hodiny', sub: 'Zapíšte odpracované hodiny — zo Stundennachweisu ručne alebo z fotky.',
          cta: `<button class="btn btn-primary" onclick="${this.entryCall()}">${Icon('upload')} Zapísať hodiny</button>` },
        export: {
          name: ['hodiny'],
          columns: [
            ['Dátum', r => r.date],
            ['Týždeň', r => (r.kw ? `KW ${r.kw.week}/${r.kw.year}` : '')],
            ['Živnostník', r => r.name],
            ['Partia', r => r.crewNames.join(', ')],
            ['Zákazka', r => r.sub],
            ['Činnosť', r => this.actMeta(r.t.activity_type)[1]],
            ['Od', r => r.t.time_from],
            ['Do', r => r.t.time_to],
            ['Hodiny', r => DanubraExport.num(r.t.hours, 2)],
            ['Sadzba', r => DanubraExport.num(r.t.rate_used)],
            ['Schválené', r => (r.t.approved ? 'áno' : 'nie')],
            ['Stav', r => stateMeta(r.state)[1]],
            ['Podpis majstra', r => (r.signed ? `podpísaný ${L.fmtDay(r.sheet.signed_at)}` : 'nepodpísaný')],
            ['Popis', r => r.t.description],
          ],
        },
      };
    },

    /**
     * Čo spraviť teraz — jedna veta a jedno tlačidlo, rovnako ako na nábore
     * a na zákazke.
     *
     * Na tejto obrazovke sú tri možnosti: buď niečo visí na schválení (a sú to
     * peniaze, ktoré sa nedostanú do podkladu), alebo za vybrané obdobie nie sú
     * zapísané hodiny, alebo je to v poriadku. Aj tretia možnosť má vetu —
     * obrazovka, ktorá raz mlčí a raz nie, vyzerá každý deň inak.
     */
    nowHtml(rows) {
      const nesch = rows.filter(t => !t.approved && !this.isLocked(t));
      if (nesch.length) {
        const h = Math.round(nesch.reduce((s, t) => s + Number(t.hours || 0), 0));
        return Shell.now({
          title: 'Schváliť hodiny', hot: true,
          what: `${nesch.length} ${Shell.plural(nesch.length, 'výkaz', 'výkazy', 'výkazov')} `
            + `za ${h} ${Shell.plural(h, 'hodinu', 'hodiny', 'hodín')} čaká na schválenie.`,
          why: 'Neschválené hodiny sa do podkladu na faktúru nedostanú — nie sú '
            + 'stratené, ale v tomto mesiaci sa za ne nevyfakturuje.',
        }, {
          help: 'card.hours.approve',
          action: { label: `Schváliť všetkých ${nesch.length}`, ico: 'check',
            onclick: 'Tms.approveShown()' },
        });
      }
      // Bez nasadení sa hodiny zapísať nedajú, takže vyzvať na to je nezmysel.
      const asg = this.assignments.filter(a => a.status !== 'cancelled');
      if (!rows.length && asg.length) {
        return Shell.now({
          title: 'Zapísať hodiny',
          what: 'Za vybrané obdobie nie je zapísaná ani jedna hodina.',
          why: 'Hodiny, ktoré nikto nezapísal, sa nevyfakturujú — a nikto si to '
            + 'nevšimne, nie je s čím porovnať.',
        }, {
          help: 'card.hours.approve',
          action: { label: 'Zapísať hodiny', ico: 'upload', onclick: this.entryCall() },
        });
      }
      const h = Math.round(rows.reduce((s, t) => s + Number(t.hours || 0), 0));
      return Shell.now({
        title: asg.length ? 'Hodiny sú schválené' : 'Nikto nie je nasadený',
        what: asg.length
          ? `${h} ${Shell.plural(h, 'hodina', 'hodiny', 'hodín')} za vybrané obdobie `
            + 'ide do podkladu na faktúru.'
          : 'Kým nie je nikto na stavbe, nie je čo zapisovať.',
        why: asg.length
          ? 'Schválené hodiny sa už nemenia. Oprava ide ako nový záznam, aby bolo '
            + 'vidieť, čo odberateľ podpísal.'
          : 'Nasadenie sa robí na zákazke — hodiny sa potom zapisujú tu.',
      }, { help: 'card.hours.approve' });
    },

    /**
     * Schváli to, čo je práve vo filtri — nie všetko v databáze.
     *
     * Toto je rozdiel, ktorý sa nedá uhádnuť, preto to potvrdenie hovorí
     * nahlas: schvaľuje sa presne toľko záznamov, koľko je vidieť.
     */
    async approveShown() {
      // Uzavreté obdobie a faktúra sa nemenia — tie sa ani neponúkajú.
      const nesch = this.filtered().filter(t => !t.approved && !this.isLocked(t));
      if (!nesch.length) return;
      const h = Math.round(nesch.reduce((s, t) => s + Number(t.hours || 0), 0));
      const ok = await UI.confirm(`Schváliť ${nesch.length} `
        + `${Shell.plural(nesch.length, 'výkaz', 'výkazy', 'výkazov')} za ${h} `
        + `${Shell.plural(h, 'hodinu', 'hodiny', 'hodín')}? Schvaľuje sa to, čo je vo filtri vidieť.`);
      if (!ok) return;

      const at = new Date().toISOString();
      let chyby = 0;
      for (const t of nesch) {
        const { error } = await DB.update('timesheets', t.id, { approved: true, approved_at: at });
        if (error) { chyby++; continue; }
        t.approved = true; t.approved_at = at;
      }
      UI.toast(chyby
        ? `Schválených ${nesch.length - chyby} z ${nesch.length} — ${chyby} sa nepodarilo`
        : `Schválené: ${nesch.length}`, chyby ? 'err' : 'ok');
      Danubra.renderRoute();
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    // ── Zápis týždňa ──────────────────────────────────────────────────────
    // Človek na turnuse odrobí šesť dní. Predtým sa to zapisovalo šesťkrát:
    // otvor okno, vyber nasadenie, vyber dátum, zapíš, zatvor. Pri partii
    // štyroch ľudí to bolo dvadsaťštyri okien za týždeň — a práve preto sa
    // hodiny zapisovali s týždňovým sklzom, čo je riziko podľa §19 AEntG.
    //
    // Tu je to jedna obrazovka: jeden človek, jeden týždeň, sedem riadkov.
    // Deň s prázdnymi hodinami sa jednoducho nezapíše.
    DAYS: ['Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota', 'Nedeľa'],

    /** Monday of the week containing `iso`. ISO 8601 — týždeň začína pondelkom. */
    mondayOf(iso) {
      const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) return null;
      const shift = (d.getUTCDay() + 6) % 7;        // nedeľa = 6, nie 0
      d.setUTCDate(d.getUTCDate() - shift);
      return d.toISOString().slice(0, 10);
    },

    addDays(iso, n) {
      const d = new Date(`${iso}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    },

    /** Hodnota poľa v zápise týždňa. `UI.field` dáva poliam `name`, nie `id`. */
    weekField(name) {
      const el = document.querySelector(`#tms-week [name="${name}"]`);
      return el ? el.value : '';
    },

    weekForm(assignmentId, weekFrom) {
      const active = this.assignments.filter(a => a.status !== 'cancelled');
      if (!active.length) return UI.toast('Najprv nasaďte pracovníka na zákazku', 'err');
      // Dátum sa vždy zarovná na pondelok — inak by „týždeň od stredy" zapísal
      // dva kusy dvoch týždňov a výkaz pre odberateľa (kalendárny týždeň) by
      // nesedel s tým, čo je v appke.
      const from = this.mondayOf(weekFrom || new Date().toISOString().slice(0, 10));
      const asgId = assignmentId || active[0].id;

      // Čo je za ten týždeň už zapísané, sa nesmie zapísať druhýkrát. Preto
      // sa to načíta a ukáže ako hotový deň, nie ako prázdne pole.
      const uz = new Map();
      for (const t of this.items) {
        if (t.assignment_id !== asgId) continue;
        const d = String(t.work_date).slice(0, 10);
        if (d >= from && d <= this.addDays(from, 6)) uz.set(d, t);
      }

      const rowHtml = (i) => {
        const date = this.addDays(from, i);
        const hotovy = uz.get(date);
        const vikend = i >= 5;
        return `
          <div class="week-row${vikend ? ' is-weekend' : ''}">
            <span class="week-day"><b>${this.DAYS[i]}</b><em>${UI.date(date)}</em></span>
            ${hotovy
              ? `<span class="week-done">${Icon('check', 14)}
                   ${Number(hotovy.hours).toLocaleString('sk-SK')} h už zapísaných</span>`
              : `<input type="number" step="0.25" min="0" max="24" class="week-h"
                   data-date="${date}" placeholder="${vikend ? '' : '0'}"
                   aria-label="Hodiny ${this.DAYS[i]}">
                 <input type="time" class="week-from" data-date="${date}"
                   aria-label="Od ${this.DAYS[i]}">
                 <input type="time" class="week-to" data-date="${date}"
                   aria-label="Do ${this.DAYS[i]}">`}
          </div>`;
      };

      const body = `
        <form id="tms-week" onsubmit="event.preventDefault();Tms.saveWeek()">
          <div class="form-grid">
            ${UI.field('assignment_id', 'Kto a na ktorej zákazke', { value: asgId,
              hint: 'Zmena prepíše týždeň — už zapísané dni sa ukážu ako hotové.',
              onchange: 'Tms.weekForm(this.value, Tms.weekField("week_from"))',
              options: active.map(a => {
                const w = this.workerOf(a.worker_id); const s = this.subOf(a.subcontract_id);
                return [a.id, `${w?.full_name || '—'} · ${s?.title || '—'}`];
              }) })}
            ${UI.field('week_from', 'Týždeň od (pondelok)', { type: 'date', value: from,
              hint: 'Dátum sa sám zarovná na pondelok toho týždňa.',
              onchange: 'Tms.weekForm(Tms.weekField("assignment_id"), this.value)' })}
            ${UI.field('activity_type', 'Činnosť', { value: 'construction',
              hint: 'Platí pre celý týždeň. Jeden deň iného druhu dopíšte cez „Zapísať hodiny" → „Jeden deň inej práce".',
              options: ACTIVITY.map(a => [a[0], a[1]]), tip: 'Stavba = práca priamo na stavenisku. Dielňa = výroba alebo príprava mimo stavby (napr. v hale). Cesta = presun, do pomeru stavba/dielňa sa nepočíta. Pomer rozhoduje, či treba platiť SOKA-BAU.' })}
          </div>

          <div class="week-head">
            <span>Deň</span><span>Hodiny</span><span>Od${UI.tip('Od a Do = čas začiatku a konca práce v ten deň. Nepovinné, ale tlačia sa vo výkaze hodín pre odberateľa (Stundennachweis). Prázdny deň sa nezapíše.')}</span><span>Do</span>
          </div>
          ${[0, 1, 2, 3, 4, 5, 6].map(rowHtml).join('')}

          <div class="week-tools">
            <button type="button" class="btn btn-outline btn-sm"
              onclick="Tms.fillWeek(8)">Po–Pia po 8 h</button>
            <button type="button" class="btn btn-outline btn-sm"
              onclick="Tms.fillWeek(10)">Po–Pia po 10 h</button>
            <button type="button" class="btn btn-ghost btn-sm"
              onclick="Tms.fillWeek(null)">Vymazať</button>
            <span class="week-sum" id="week-sum"></span>
          </div>

          ${UI.field('description', 'Popis práce', { type: 'textarea', rows: 2,
            hint: 'Platí pre všetky zapísané dni. Pri Werkvertrag je to doklad o diele.',
            tip: 'Werkvertrag = zmluva o dielo: odberateľ si objednáva hotovú prácu, nie ľudí na hodiny. Popis toho, čo sa robilo, pri kontrole dokazuje, že ide o dielo a nie o požičiavanie ľudí.',
            placeholder: 'Čo sa reálne robilo' })}

          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${Icon('check')} Zapísať týždeň</button>
          </div>
        </form>`;
      UI.modal('Zápis týždňa', body, { wide: true });
      this.weekSum();
      for (const el of document.querySelectorAll('#tms-week .week-h')) {
        el.addEventListener('input', () => this.weekSum());
      }
    },

    /** Predvyplní pracovné dni. Víkend zámerne nie — to nie je norma. */
    fillWeek(hours) {
      const fields = [...document.querySelectorAll('#tms-week .week-h')];
      fields.forEach((el, i) => {
        // `i` je poradie **prázdnych** polí, nie dní — hotové dni medzi nimi
        // nie sú. Deň sa preto berie z dátumu, nie z indexu.
        const d = new Date(`${el.dataset.date}T00:00:00Z`);
        const vikend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
        el.value = (hours == null || vikend) ? '' : String(hours);
      });
      this.weekSum();
    },

    weekSum() {
      const el = document.getElementById('week-sum');
      if (!el) return;
      const h = [...document.querySelectorAll('#tms-week .week-h')]
        .reduce((s, x) => s + (Number(x.value) || 0), 0);
      el.textContent = h
        ? `${h.toLocaleString('sk-SK')} ${Shell.plural(h, 'hodina', 'hodiny', 'hodín')} spolu`
        : '';
    },

    async saveWeek() {
      const d = UI.formData(document.getElementById('tms-week'));
      const a = this.asgOf(d.assignment_id);
      if (!a) return UI.toast('Vyberte nasadenie', 'err');

      const rows = [];
      for (const el of document.querySelectorAll('#tms-week .week-h')) {
        const hours = Number(el.value);
        if (!hours || hours <= 0) continue;
        if (hours > 24) return UI.toast(`${UI.date(el.dataset.date)}: viac ako 24 hodín`, 'err');
        const date = el.dataset.date;
        const pick = (sel) => {
          const x = document.querySelector(`#tms-week ${sel}[data-date="${date}"]`);
          return x && x.value ? x.value : null;
        };
        rows.push({
          assignment_id: d.assignment_id, worker_id: a.worker_id,
          work_date: date, hours,
          activity_type: d.activity_type || 'construction',
          time_from: pick('.week-from'), time_to: pick('.week-to'),
          description: d.description || null,
        });
      }
      if (!rows.length) return UI.toast('Nie je čo zapísať — doplňte hodiny', 'err');

      const { error } = await DB.insertMany('timesheets', rows);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const h = rows.reduce((s, r) => s + r.hours, 0);
      UI.closeModal();
      UI.toast(`Zapísaných ${rows.length} ${Shell.plural(rows.length, 'deň', 'dni', 'dní')}`
        + ` · ${h.toLocaleString('sk-SK')} h`, 'ok');
      await this.load(); Danubra.renderRoute();
    },

    /**
     * Jeden deň jedného človeka — výnimka (cesta, dielňa, popis práce).
     * Otvára sa z okna „Zapísať hodiny"; `o.subcontractId` obmedzí výber na
     * nasadenia tej zákazky, `o.date` predvyplní deň.
     */
    form(o = {}) {
      const all = this.assignments.filter(a => a.status !== 'cancelled');
      const onSub = o.subcontractId ? all.filter(a => a.subcontract_id === o.subcontractId) : [];
      const active = onSub.length ? onSub : all;
      if (!active.length) return UI.toast('Najprv nasaďte pracovníka na zákazku', 'err');
      const today = o.date || new Date().toISOString().slice(0, 10);
      const body = `
        <form id="tms-form" onsubmit="event.preventDefault();Tms.save()">
          <div class="form-grid">
            ${UI.field('assignment_id', 'Nasadenie', { required: true,
              tip: 'Nasadenie = konkrétny živnostník na konkrétnej zákazke. Zakladá sa na zákazke; podľa neho sa vie, komu a za akú sadzbu sa hodiny fakturujú.',
              options: active.map(a => {
              const w = this.workerOf(a.worker_id); const s = this.subOf(a.subcontract_id);
              return [a.id, `${w?.full_name || '—'} · ${s?.title || '—'}`];
            }) })}
            ${UI.field('work_date', 'Dátum', { type: 'date', value: today, required: true })}
            ${UI.field('hours', 'Hodiny', { type: 'number', value: 8, required: true })}
            ${UI.field('activity_type', 'Činnosť', { value: 'construction', options: ACTIVITY.map(a => [a[0], a[1]]), tip: 'Stavba = práca priamo na stavenisku. Dielňa = výroba alebo príprava mimo stavby (napr. v hale). Cesta = presun, do pomeru stavba/dielňa sa nepočíta. Pomer rozhoduje, či treba platiť SOKA-BAU.' })}
            ${UI.field('time_from', 'Od', { type: 'time',
              tip: 'Stundennachweis = výkaz odpracovaných hodín v nemčine, ktorý dostane odberateľ a podľa ktorého fakturujeme.',
              hint: 'Nepovinné. Výkaz pre odberateľa (Stundennachweis) ich tlačí — bez nich tam je „—".' })}
            ${UI.field('time_to', 'Do', { type: 'time' })}
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
      UI.modal('Jeden deň inej práce', body, { wide: true });
    },

    // Dvojklik na „Zapísať" vložil ten istý deň dvakrát. Kým beží zápis,
    // druhý sa nespustí.
    async save() {
      if (this._saving) return;
      this._saving = true;
      try { await this._save(); } finally { this._saving = false; }
    },

    async _save() {
      const d = UI.formData(document.getElementById('tms-form'));
      const a = this.asgOf(d.assignment_id);
      if (!a) return UI.toast('Vyberte nasadenie', 'err');
      if (Number(d.hours) > 24) return UI.toast('Viac ako 24 hodín za deň sa zapísať nedá', 'err');
      // Hodiny mimo nasadenia patria inému nasadeniu (alebo žiadnemu) — inak
      // sa fakturujú sadzbou nasadenia, ktoré v ten deň neplatilo.
      if (d.work_date && ((a.date_from && d.work_date < a.date_from) || (a.date_to && d.work_date > a.date_to))) {
        return UI.toast(`Dátum je mimo nasadenia (${UI.dateRange(a.date_from, a.date_to)})`, 'err');
      }
      const payload = {
        assignment_id: d.assignment_id, worker_id: a.worker_id,
        work_date: d.work_date, hours: Number(d.hours),
        activity_type: d.activity_type, description: d.description || null,
        // Prázdne pole je `''`, nie `null` — a prázdny reťazeč databáza pri
        // type `time` odmietne. Výkaz si potom myslí, že časy sú zmiešané.
        time_from: d.time_from || null, time_to: d.time_to || null,
      };
      if (!payload.hours || payload.hours <= 0) return UI.toast('Zadajte počet hodín', 'err');
      const { error } = await DB.insert('timesheets', payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal(); UI.toast('Hodiny zapísané', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    /** Je deň v uzavretom období alebo vo faktúre? Tam sa hodiny nemenia. */
    isLocked(t) {
      const a = this.asgOf(t.assignment_id);
      const p = this.periodOf(t, a ? a.subcontract_id : null);
      return !!(p && ['closed', 'invoiced'].includes(p.status));
    },

    async toggleApprove(id) {
      const t = this.items.find(x => x.id === id);
      if (!t) return;
      if (this.isLocked(t)) return UI.toast('Obdobie je uzavreté — tieto hodiny sa už nemenia.', 'warn');
      const on = !t.approved;
      // Chyba z databázy (napr. hodiny v uzavretom období) sa doteraz zahodila
      // a fajka sa prepla, hoci sa nič neuložilo.
      const { error } = await DB.update('timesheets', id, { approved: on, approved_at: on ? new Date().toISOString() : null });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      t.approved = on;
      Danubra.renderRoute();
    },

    async del(id) {
      const t = this.items.find(x => x.id === id);
      if (t && this.isLocked(t)) return UI.toast('Obdobie je uzavreté — tieto hodiny sa už nemenia.', 'warn');
      if (!await UI.confirmArchive('Presunúť tento záznam hodín do archívu?')) return;
      // Hodiny v uzavretom období stráži trigger v databáze — jeho hláška
      // ide človeku tak, ako je, aby vedel, prečo sa nič nestalo.
      const { error } = await DB.archive('timesheets', id);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      this.items = this.items.filter(x => x.id !== id);
      UI.toast(UI.ARCHIVED, 'ok'); Danubra.renderRoute();
    },
  };

  window.Tms = Tms;
  Danubra.views.timesheets = function (el) { return Tms.view(el); };
})();
