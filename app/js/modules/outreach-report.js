// ============================================================================
// DANUBRA — Marketing → Prehľad pre vedenie (route `vedenie`, záložka Marketingu)
// ============================================================================
// „Prehľad oslovovania pre vedenie": koľko firiem sme našli a oslovili, kto
// reagoval, kde je záujem, stretnutia, ponuky a noví odberatelia — za zvolené
// obdobie a v porovnaní s predošlým; lievik, trend po KW, kolegovia,
// remeslá, regióny, zdroje a hľadania; a čo treba riešiť teraz.
//
//   Obdobie        Tento KW, Minulý KW, Posledné 4 KW, Tento mesiac,
//                  Posledné 3 mesiace, Vlastné (od–do); porovnanie s rovnako
//                  dlhým začiatkom predošlého obdobia (šípka a rozdiel)
//   Dlaždice       klik = zoznam firiem, ktoré sa do čísla zarátali (s logom),
//                  odtiaľ sa firma otvorí
//   Lievik         firmy prvýkrát oslovené v období a kam sa doteraz dostali
//                  (prepínač: firmy nájdené v období)
//   Trend          posledných 12 KW: oslovené, reakcie, stretnutia (SVG,
//                  tabuľka s číslami pod ním)
//   Tabuľky        kolegovia, remeslá, regióny (krajina / mesto), zdroje,
//                  hľadania — DataList s exportom
//   Čo treba riešiť  kroky po termíne, záujem bez ďalšieho kroku, stretnutia
//                  tento týždeň, odpovede bez reakcie
//   Export         celý prehľad do CSV (sekcie pod sebou), Tlačiť / PDF (A4)
//
// Počíta sa v lib/marketing/report.js (testy, aj definície čísel). Tu sa len
// načítajú potrebné stĺpce (s obmedzením dátumu, kde sa dá) a kreslí sa.
// Právo: modul Marketing (perm.js ROUTE_ALIAS vedenie → marketing).
// ============================================================================
(function () {
  const R = () => window.DanubraReport;
  const C = () => window.DanubraCal;
  const TR = () => window.DanubraTrades;
  const esc = (s) => UI.esc(s == null ? '' : s);
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const LEAD_COLS = 'id,name,city,postal_code,region,country,website,logo_url,email,status,status_changed_at,status_changed_by,'
    + 'source,tip_by,seed_search_id,created_at,partner_id,next_step_at,next_step_text,last_contact_at,trade_keys,trade,categories,'
    + 'site_title,site_description,why,profile_summary:profile->>summary,archived_at';
  const OUT_COLS = 'id,lead_id,step,status,sent_at,sent_by,opened_at,auto_opened_at,clicked_at,replied_at,bounced_at,unsubscribed_at,archived_at';
  const CON_COLS = 'id,lead_id,kind,direction,outcome,our_member_id,our_user_id,our_member_name,happened_at,duration_min,corrects_id,created_at,archived_at';
  const TRASH = /lead_contacts|danubra_events|lead_tips|mail_messages|danubra_trades/;
  const SERIES = [['contacted', 'Oslovené', 'var(--rp-c1)'], ['replied', 'Reakcie', 'var(--rp-c2)'], ['meeting', 'Stretnutia', 'var(--rp-c3)']];

  const COHORT_TIP = 'Lievik ukazuje jednu skupinu firiem: tie, ktoré sme v zvolenom období oslovili prvýkrát (prvý e-mail alebo prvý hovor či stretnutie), '
    + 'a kam sa doteraz dostali — aj keď sa to stalo až po konci obdobia. Krok „aspoň po": firma s ponukou sa ráta aj do Záujmu a Stretnutia. '
    + 'Nájdené je pre porovnanie počet firiem pridaných v období a pod ním, koľko z nich je už oslovených. '
    + 'Prepínačom „Nájdené v období" je skupinou každá firma pridaná v období.';
  const PERIOD_TIP = 'Čísla sú za zvolené obdobie do dneška. Porovnáva sa s rovnako dlhým začiatkom predošlého obdobia — '
    + 'pondelok až piatok tohto KW s pondelkom až piatkom minulého, 1.–6. 11. s 1.–6. 10. Bežiaci týždeň sa tak neporovnáva s celým.';

  const Rep = {
    data: null, loadedFrom: null, rep: null, missing: [],
    period: 'kw', custom: { from: '', to: '' }, funnelMode: 'contacted', regionMode: 'land',
    /** Hodiny. V teste sa dajú podvrhnúť (`Rep.clock = () => new Date(…)`). */
    clock: null,
    now() { return this.clock ? this.clock() : new Date(); },
    today() { return C().todayIn(this.now()); },
    narrow() { return !!(window.matchMedia && matchMedia('(max-width: 760px)').matches); },

    // ── Voľby (len pohodlie) ────────────────────────────────────────────
    _lsKey() { return `danubra_rep_${(Danubra.user && Danubra.user.id) || 'x'}`; },
    _prefs() {
      if (this._prefsFor === this._lsKey()) return;
      this._prefsFor = this._lsKey();
      try {
        const v = JSON.parse(localStorage.getItem(this._lsKey()) || '{}') || {};
        if (R().PRESETS.some(p => p[0] === v.period)) this.period = v.period;
        if (v.custom && typeof v.custom === 'object') this.custom = { from: String(v.custom.from || ''), to: String(v.custom.to || '') };
        if (v.funnel === 'found') this.funnelMode = 'found';
        if (v.region === 'city') this.regionMode = 'city';
      } catch (e) { /* bez pamäte */ }
    },
    _save() {
      try { localStorage.setItem(this._lsKey(), JSON.stringify({ period: this.period, custom: this.custom, funnel: this.funnelMode, region: this.regionMode })); } catch (e) { /* bez pamäte */ }
    },

    // ── Dáta ────────────────────────────────────────────────────────────
    /** Od kedy treba dáta: predošlé obdobie a 12 KW trendu. */
    windowStart() {
      const p = R().period(this.period, this.today(), this.custom);
      const prev = R().previous(p);
      const wk = R().weeksBack(p.to, 12)[0].from;
      return C().addDays([p.from, prev.from, wk].sort()[0], -1);
    },
    async _list(table, o, optional) {
      try {
        const r = await DB.list(table, o);
        if (r && r.error && optional && Array.isArray(DB.failures)) DB.failures = DB.failures.filter(f => !TRASH.test(f.table));
        if (r && r.error && optional) this.missing.push(table);
        return (r && !r.error && r.data) || [];
      } catch (e) { if (optional) this.missing.push(table); return []; }
    },
    async load(force) {
      const from = this.windowStart();
      if (!force && this.data && this.loadedFrom && this.loadedFrom <= from) return;
      this.missing = [];
      const since = `${from}T00:00:00`;
      const leadsP = window.Lead && Lead.loaded && Lead.rows ? Promise.resolve(Lead.rows) : (async () => {
        const r = await DB.list('leads', { select: LEAD_COLS, order: { column: 'created_at', ascending: false }, limit: 10000 });
        if (r && r.error) {
          // Staršia databáza (bez trade_keys) — všetky stĺpce.
          if (Array.isArray(DB.failures)) DB.failures = DB.failures.filter(f => !/danubra_leads/.test(f.table));
          const all = await DB.list('leads', { order: { column: 'created_at', ascending: false }, limit: 10000 });
          return (all && all.data) || [];
        }
        return ((r && r.data) || []).map(l => (l.profile_summary != null && !l.profile ? { ...l, profile: { summary: l.profile_summary } } : l));
      })();
      const outP = window.Outreach && Outreach.loaded && !Outreach.missing ? Promise.resolve([Outreach.rows]) : Promise.all([
        // Prvé e-maily od začiatku (kedy bola firma oslovená prvýkrát), ostatné od začiatku okna.
        this._list('outreach', { select: OUT_COLS, filters: { step: 1 }, limit: 20000 }),
        this._list('outreach', { select: OUT_COLS, gte: { sent_at: since }, limit: 20000 }),
        this._list('outreach', { select: OUT_COLS, gte: { replied_at: since }, limit: 20000 }),
      ]);
      const [leads, outs, contacts, activities, events, tasks, tips, searches, mails, trades] = await Promise.all([
        leadsP, outP,
        this._list('lead_contacts', { select: CON_COLS, order: { column: 'happened_at', ascending: true }, limit: 20000 }, true),
        this._list('activities', { select: 'id,entity_type,entity_id,body,source,created_at,created_by,archived_at',
          filters: { entity_type: 'lead', source: 'lead_status' }, limit: 20000 }),
        this._list('events', { select: 'id,entity_type,entity_id,kind,title,starts_on,start_time,place,created_at,created_by,archived_at',
          filters: { entity_type: 'lead' }, gte: { starts_on: from }, limit: 5000 }, true),
        this._list('tasks', { select: 'id,entity_type,entity_id,status,title,due_date,postponed_to,assigned_to,assigned_name',
          filters: { entity_type: 'lead', status: ['open', 'in_progress'] }, limit: 5000 }),
        this._list('lead_tips', { select: 'id,submitted_by_name,status,lead_id,created_at,archived_at', gte: { created_at: since }, limit: 5000 }, true),
        this._list('lead_searches', { select: 'id,kind,source,status,params,seeds,found,added,created_at', order: { column: 'created_at', ascending: false }, limit: 500 }),
        this._list('mail_messages', { select: 'id,lead_id,direction,sent_at', filters: { direction: 'out' }, gte: { sent_at: since }, limit: 10000 }, true),
        window.Lead && Lead.trades ? Promise.resolve(Lead.trades) : this._list('trades', { select: 'key,name_sk,name_de,active,sort_order', limit: 100 }, true),
      ]);
      const byId = new Map();
      for (const list of outs) for (const o of list || []) byId.set(o.id, { ...(byId.get(o.id) || {}), ...o });
      this.trades = trades || [];
      this.data = { leads: (leads || []).filter(l => !l.archived_at), outreach: [...byId.values()].filter(o => !o.archived_at),
        contacts, activities, events, tasks, tips, searches, mails: (mails || []).filter(m => m.lead_id),
        members: Danubra.members || [] };
      this.leadById = new Map(this.data.leads.map(l => [l.id, l]));
      if (window.CompanyLogo) CompanyLogo.remember('lead', this.data.leads);
      this.loadedFrom = from;
    },
    compute() {
      this.rep = R().build(this.data, { period: this.period, custom: this.custom, today: this.today(),
        funnel: this.funnelMode, region: this.regionMode });
      return this.rep;
    },

    // ── Obrazovka ───────────────────────────────────────────────────────
    async view(el) {
      this._css();
      this._prefs();
      Danubra.setActions(`
        <button class="btn btn-ghost btn-sm" onclick="Rep.refresh()" title="Načítať čísla znova z databázy">${Icon('repeat', 14)} Obnoviť</button>
        <button class="btn btn-outline btn-sm" onclick="Rep.exportCsv()" title="Celý prehľad do jedného CSV pre Excel (sekcie pod sebou)">${Icon('download', 14)} Export CSV</button>
        <button class="btn btn-outline btn-sm" onclick="Rep.print()" title="Prehľad na A4 — v dialógu tlače vyberte „Uložiť ako PDF“">${Icon('print', 14)} Tlačiť / PDF</button>`);
      if (!this.data || (this.loadedFrom && this.windowStart() < this.loadedFrom)) { el.innerHTML = UI.loading(); await this.load(true); }
      const r = this.compute();
      const p = r.period;
      el.innerHTML = Danubra.header(Danubra.itemLabelOf('vedenie'),
        `${esc(p.title)} · do ${esc(UI.date(p.to))} · porovnanie s ${esc(C().rangeText(r.prev.from, r.prev.to))}`)
        + `<div class="print-head"><strong>Prehľad oslovovania pre vedenie</strong><span>${esc(p.label)}: ${esc(p.title)} (do ${esc(UI.date(p.to))}) · porovnanie s ${esc(C().rangeText(r.prev.from, r.prev.to))} · vytlačené ${esc(UI.date(this.today()))}</span></div>`
        + `<div class="rp" id="rp">`
        + this.periodHtml(r)
        + (this.missing.length ? `<div class="notebox no-print">${Icon('info', 14)} Časť údajov v databáze ešte nie je (${esc(this.missing.join(', '))}) — tie čísla budú nulové, kým sa nespustia migrácie.</div>` : '')
        + this.tilesHtml(r)
        + `<div class="rp-two">${this.funnelHtml(r)}${this.trendHtml(r)}</div>`
        + this.todoHtml(r)
        + this.section('kolegovia', 'Po kolegoch', 'Kto koľko oslovil, prevolal a napísal a čo z toho bolo. E-mail sa pripíše tomu, kto ho poslal, hovor tomu, kto ho zapísal ako „kto od nás", zmena kategórie (záujem, stretnutie, ponuka, odberateľ) tomu, kto ju zmenil. Reakcia na e-mail patrí tomu, kto e-mail poslal. Ďalšie kroky po termíne sú dnešný stav podľa riešiteľa úlohy. Tipy = odkazy od kolegov v období (poslané / pridané do Nových firiem).',
          this.table(this.membersConfig(r)))
        + this.section('remesla', 'Po remeslách', 'Remeslá firmy (ručne určené, inak zistené z údajov firmy — to isté ako stĺpec Remeslo v Nových firmách). Firma s dvoma remeslami sa ráta v oboch. Nájdené = pridané v období; Oslovené a ďalej = firmy prvýkrát oslovené v období a kam sa doteraz dostali. „Najlepšie" je skupina s najvyšším podielom záujmu (aspoň 3 oslovené).',
          this.table(this.groupConfig('rp-remesla', 'Remeslo', r.trades, (k) => this.tradeName(k), ['prehlad-remesla'])))
        + this.section('regiony', this.regionMode === 'city' ? 'Po mestách' : 'Po regiónoch', 'Spolková krajina podľa regiónu firmy (aj slovenského, napr. „Bavorsko"), inak odhad podľa PSČ, inak podľa mesta. Prepínačom sa dá pozrieť po mestách. Čísla ako pri remeslách.',
          `<div class="rp-seg no-print" role="group" aria-label="Zoskupiť podľa">${[['land', 'Spolková krajina'], ['city', 'Mesto']].map(([k, l]) =>
            `<button type="button" class="${this.regionMode === k ? 'on' : ''}" aria-pressed="${this.regionMode === k}" onclick="Rep.setRegion('${k}')">${l}</button>`).join('')}</div>`
          + this.table(this.groupConfig('rp-regiony', this.regionMode === 'city' ? 'Mesto' : 'Región', r.regions, (k) => k || 'Neurčené', ['prehlad-regiony'])))
        + this.section('zdroje', 'Podľa zdroja', 'Odkiaľ firma prišla: Google Mapy (hľadanie cez Outscraper), podľa webov firiem, AI na webe, mapa OpenStreetMap, ručne alebo od kolegov. Čísla ako pri remeslách.',
          this.table(this.groupConfig('rp-zdroje', 'Zdroj', r.sources, (k) => R().SOURCE_LABEL[k] || k, ['prehlad-zdroje'])))
        + this.section('hladania', 'Najlepšie hľadania', 'Každé hľadanie firiem od začiatku (nie len v období): koľko firiem z neho je, koľko sme oslovili, koľko reagovalo, malo záujem a stalo sa odberateľom. Hore sú hľadania s najviac firmami so záujmom. Klik otvorí Nové firmy s filtrom na to hľadanie.',
          this.table(this.searchConfig(r)))
        + `</div>`;
      this.bindTrend();
    },

    /** DataList na obrazovke a obyčajná tabuľka na papier (karty zoznamu sa na A4 nehodia). */
    table(cfg) { return DataList.html(cfg) + this.printTable(cfg); },
    printTable(cfg) {
      const cols = (cfg.columns || []).filter(c => c.csv !== false);
      const val = (c, r) => (c.csv ? c.csv(r) : r[c.key]);
      const foot = cfg.foot ? cfg.foot(cfg.rows) : null;
      return `<table class="rp-ptable"><thead><tr>${cols.map((c, i) => `<th${i ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${(cfg.rows || []).map(r => `<tr>${cols.map((c, i) => `<td${i ? ' class="num"' : ''}>${esc(val(c, r))}</td>`).join('')}</tr>`).join('')}</tbody>${
        foot && foot.cells ? `<tfoot><tr>${cols.map((c, i) => `<td${i ? ' class="num"' : ''}>${esc(foot.cells[c.key] == null ? '' : foot.cells[c.key])}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
    },

    section(id, title, tip, body) {
      return `<section class="card card-pad rp-sec" id="rp-${id}"><div class="card-head"><div class="card-title">${esc(title)}${UI.tip(tip)}</div></div>${body}</section>`;
    },

    async refresh() { this.data = null; this.loadedFrom = null; await Danubra.renderRoute(); },
    setPeriod(k) { this.period = k; this._save(); Danubra.renderRoute(); },
    setCustom() {
      const a = document.getElementById('rp-from'), b = document.getElementById('rp-to');
      if (!a || !b || !a.value || !b.value) return UI.toast('Vyberte dátum od a do', 'err');
      this.custom = { from: a.value, to: b.value }; this.period = 'custom'; this._save(); Danubra.renderRoute();
    },
    setFunnel(m) { this.funnelMode = m === 'found' ? 'found' : 'contacted'; this._save(); Danubra.renderRoute(); },
    setRegion(m) { this.regionMode = m === 'city' ? 'city' : 'land'; this._save(); Danubra.renderRoute(); },

    periodHtml(r) {
      const p = r.period;
      const c = this.period === 'custom' ? p : { from: this.custom.from || C().addDays(this.today(), -29), to: this.custom.to || this.today() };
      return `<div class="rp-bar no-print">
        <div class="rp-seg" role="group" aria-label="Obdobie">${R().PRESETS.map(([k, l]) =>
          `<button type="button" class="${this.period === k ? 'on' : ''}" aria-pressed="${this.period === k}" data-period="${k}" onclick="${k === 'custom' ? 'Rep.showCustom()' : `Rep.setPeriod('${k}')`}">${esc(l)}</button>`).join('')}</div>
        <div class="rp-custom" id="rp-custom"${this.period === 'custom' ? '' : ' hidden'}>
          <label>od <input type="date" id="rp-from" value="${esc(c.from)}" max="${esc(this.today())}"></label>
          <label>do <input type="date" id="rp-to" value="${esc(this.period === 'custom' ? p.end : c.to)}"></label>
          <button type="button" class="btn btn-primary btn-sm" onclick="Rep.setCustom()">Použiť</button>
        </div>
        <span class="rp-cmp">porovnanie s ${esc(C().rangeText(r.prev.from, r.prev.to))}${UI.tip(PERIOD_TIP)}</span>
      </div>`;
    },
    showCustom() { const b = document.getElementById('rp-custom'); if (b) { b.hidden = false; const i = document.getElementById('rp-from'); if (i) i.focus(); } },

    // ── Dlaždice ────────────────────────────────────────────────────────
    arrow(dir) {
      if (dir === 'same') return '';
      const d = dir === 'up' ? 'M6 2 L10.5 8 H7.5 V11 H4.5 V8 H1.5 Z' : 'M6 11 L10.5 5 H7.5 V2 H4.5 V5 H1.5 Z';
      return `<svg class="rp-arr" viewBox="0 0 12 13" width="11" height="12" aria-hidden="true"><path d="${d}" fill="currentColor"/></svg>`;
    },
    deltaHtml(d, unit = '') {
      if (!d) return '';
      const n = (x) => String(x).replace('.', ',');
      if (d.dir === 'same') return `<span class="rp-d is-same">rovnako ako predtým (${n(d.prev)}${unit})</span>`;
      const word = d.dir === 'up' ? 'viac' : 'menej';
      return `<span class="rp-d is-${d.tone}" aria-label="o ${n(Math.abs(d.diff))}${unit} ${word} ako predtým">${this.arrow(d.dir)}${d.diff > 0 ? '+' : ''}${n(d.diff)}${unit}</span>
        <span class="rp-d-was">predtým ${n(d.prev)}${unit}</span>`;
    },
    tilesHtml(r) {
      const k = r.kpi, d = r.deltas, e = k.emails;
      const p1 = (v) => (v == null ? '—' : `${String(v).replace('.', ',')} %`);
      const T = [
        ['found', 'Nové firmy', k.found.n, 'pridané do Nových firiem', d.found,
          'Firmy pridané v období do Nových firiem — z hľadania, ručne alebo od kolegov.'],
        ['contacted', 'Oslovené', k.contacted.n, 'prvýkrát, e-mailom alebo hovorom', d.contacted,
          'Firmy, ktoré sme v období oslovili prvýkrát: prvý doručený e-mail oslovenia alebo prvý zapísaný hovor, e-mail, stretnutie či LinkedIn. Pripomenutie ani ďalší hovor tej istej firme sa nerátajú znova. Nedoručený e-mail nie je oslovenie.'],
        ['calls', 'Hovory', k.calls.calls, `${k.calls.minutes} min · dovolali sme sa ${k.calls.connected}×`, d.calls,
          'Hovory zapísané pri firmách v období (záznam hovoru, oprava platí namiesto pôvodného). Minúty sú súčet dĺžky hovorov. „Dovolali sme sa" = výsledok iný než Nedvíha, Obsadené a Zlé číslo.'],
        ['emails', 'E-maily', e.sent, `otvorené ${p1(e.openRate)} · klik ${p1(e.clickRate)} · odpoveď ${p1(e.replyRate)} · nedoručené ${p1(e.bounceRate)}`, d.emails,
          `E-maily oslovenia odoslané v období (prvé aj pripomenutia: ${e.first} + ${e.followups}) a čo sa s nimi doteraz stalo: otvorené ${e.opened}, klik ${e.clicked}, odpoveď ${e.replied}, nedoručené ${e.bounced}, odhlásené ${e.unsubscribed}. Percentá sú z odoslaných. Otvorenie programom (Apple Mail, Gmail, skener) sa nepočíta — takých bolo ${e.autoOnly}.`],
        ['replied', 'Reagovali', k.replied.n, 'odpísali, zdvihli a bavili sa, ozvali sa', d.replied,
          'Firmy, ktoré v období prvýkrát reagovali: odpísali na e-mail, pri hovore sme sa bavili (aj „Zavolať neskôr" a „Nemá záujem"), ozvali sa samy, alebo sa kategória zmenila na Odpísala či ďalej.'],
        ['interested', 'Záujem', k.interested.n, 'Má záujem alebo ďalej', d.interested,
          'Firmy, ktoré sa v období prvýkrát dostali do kroku Má záujem alebo ďalej (Stretnutie, Ponuka, Odberateľ) — podľa kategórie alebo výsledku hovoru.'],
        ['meeting', 'Stretnutia', k.meeting.n, `${k.meetingsCal} ${Shell.plural(k.meetingsCal, 'stretnutie', 'stretnutia', 'stretnutí')} v kalendári`, d.meeting,
          'Firmy, ktoré sa v období prvýkrát dostali do kroku Stretnutie alebo ďalej: hovor „Stretnutie dohodnuté", zapísané stretnutie, kategória Stretnutie alebo stretnutie pri firme v kalendári. Pod číslom je, koľko stretnutí s firmami je v kalendári v období.'],
        ['offer', 'Ponuky', k.offer.n, 'ponuka alebo odberateľ', d.offer,
          'Firmy, ktoré sa v období prvýkrát dostali do kroku Ponuka (kategória Ponuka alebo hovor „Poslať ponuku") alebo sa rovno stali odberateľom.'],
        ['won', 'Noví odberatelia', k.won.n, 'kategória Je odberateľ', d.won,
          'Firmy, ktoré sa v období stali odberateľom (kategória Je odberateľ alebo „Urobiť odberateľa").'],
        ['rejected', 'Nemá záujem', k.rejected.n, 'po hovore alebo kategória', d.rejected,
          'Firmy, ktoré v období povedali, že nemajú záujem (výsledok hovoru alebo kategória Nemá záujem).'],
        ['overdue', 'Ďalšie kroky po termíne', r.todo.overdue.length, 'dnes, nie za obdobie', null,
          'Dohodnuté ďalšie kroky s firmami, ktorých termín už prešiel: otvorená úloha pri firme po termíne (odložená úloha nie) alebo dátum ďalšieho kroku pri firme bez úlohy. Firmy „Nemá záujem", odhlásené a odberatelia sa nerátajú. Je to dnešný stav.'],
      ];
      return `<div class="rp-kpis">${T.map(([key, label, val, sub, dd, tip]) => {
        const hot = key === 'overdue' && val > 0;
        return `<div class="rp-kpi${hot ? ' is-hot' : ''}" data-kpi="${key}">
          <div class="rp-kpi-l"><span>${esc(label)}</span>${UI.tip(tip)}</div>
          <button type="button" class="rp-kpi-v" onclick="Rep.list('${key}')" aria-label="${esc(label)}: ${val} — ukázať firmy">${val}</button>
          <div class="rp-kpi-s">${esc(sub)}</div>
          <div class="rp-kpi-d">${dd ? this.deltaHtml(dd) : `<span class="rp-d-was">${hot ? 'treba sa ozvať' : 'nič nemešká'}</span>`}</div>
        </div>`;
      }).join('')}</div>`;
    },

    // ── Lievik ──────────────────────────────────────────────────────────
    funnelHtml(r) {
      const f = r.funnel;
      const max = Math.max(1, ...f.steps.map(s => s.n));
      const p1 = (v) => (v == null ? '' : `${String(v).replace('.', ',')} %`);
      return `<section class="card card-pad rp-sec rp-funnel" id="rp-lievik">
        <div class="card-head"><div class="card-title">Lievik${UI.tip(COHORT_TIP)}</div>
          <div class="rp-seg rp-seg-s no-print" role="group" aria-label="Skupina firiem">${[['contacted', 'Oslovené v období'], ['found', 'Nájdené v období']].map(([k, l]) =>
            `<button type="button" class="${f.mode === k ? 'on' : ''}" aria-pressed="${f.mode === k}" onclick="Rep.setFunnel('${k}')">${l}</button>`).join('')}</div></div>
        <p class="rp-note">${f.mode === 'found' ? 'Firmy pridané v období a kam sa doteraz dostali.' : 'Firmy prvýkrát oslovené v období a kam sa doteraz dostali.'}</p>
        <ol class="rp-fun">${f.steps.map((s, i) => `<li class="rp-fs${s.key === 'found' && f.mode !== 'found' ? ' is-ctx' : ''}">
          <button type="button" onclick="Rep.list('f:${s.key}')" aria-label="${esc(s.label)}: ${s.n} firiem — ukázať">
            <span class="rp-fs-l">${esc(s.label)}</span>
            <span class="rp-fs-bar" aria-hidden="true"><i style="width:${Math.max(s.n ? 2 : 0, Math.round((s.n / max) * 100))}%"></i></span>
            <b class="rp-fs-n">${s.n}</b>
            <span class="rp-fs-c">${i === 0 ? '' : s.conv == null ? '—' : i === 1 && f.mode !== 'found' ? `${p1(s.conv)} z nájdených` : `${p1(s.conv)} z predošlého`}</span>
          </button></li>`).join('')}</ol>
      </section>`;
    },

    // ── Trend po KW (SVG) ───────────────────────────────────────────────
    trendHtml(r) {
      const t = r.trend;
      const narrow = this.narrow();
      const W = narrow ? 360 : 640, H = narrow ? 200 : 220;
      const pl = 30, pr = 6, pt = 12, pb = 26;
      const pw = W - pl - pr, ph = H - pt - pb;
      const max = Math.max(1, ...t.flatMap(w => SERIES.map(s => w[s[0]])));
      const step = this.niceStep(max);
      const top = Math.ceil(max / step) * step;
      const y = (v) => pt + ph - (v / top) * ph;
      const gw = pw / t.length;
      const bw = Math.max(3, Math.min(12, (gw - 6) / SERIES.length - 2));
      const grid = [];
      for (let v = 0; v <= top; v += step) {
        grid.push(`<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="rp-grid${v === 0 ? ' is-base' : ''}"/>`
          + `<text x="${pl - 6}" y="${y(v) + 3.5}" text-anchor="end" class="rp-ax">${v}</text>`);
      }
      const bar = (x, v, cls) => {
        if (!v) return '';
        const h = Math.max(1.5, (v / top) * ph), yy = pt + ph - h, rr = Math.min(2.5, h / 2, bw / 2);
        return `<path class="${cls}" d="M${x},${pt + ph} V${yy + rr} Q${x},${yy} ${x + rr},${yy} H${x + bw - rr} Q${x + bw},${yy} ${x + bw},${yy + rr} V${pt + ph} Z"/>`;
      };
      const groups = t.map((w, i) => {
        const x0 = pl + i * gw + (gw - (SERIES.length * bw + (SERIES.length - 1) * 2)) / 2;
        const bars = SERIES.map((s, j) => bar(x0 + j * (bw + 2), w[s[0]], `rp-b rp-b${j + 1}`)).join('');
        const lbl = !narrow || i % 2 === 1 || i === t.length - 1 ? `<text x="${pl + i * gw + gw / 2}" y="${H - 8}" text-anchor="middle" class="rp-ax${i === t.length - 1 ? ' is-now' : ''}">${narrow ? w.week : `KW ${w.week}`}</text>` : '';
        return `<g class="rp-g" data-i="${i}">${bars}${lbl}<rect class="rp-hit" x="${pl + i * gw}" y="${pt}" width="${gw}" height="${ph}" fill="transparent">
          <title>KW ${w.week}/${w.year} (${C().rangeText(w.from, w.to)}): oslovené ${w.contacted}, reakcie ${w.replied}, stretnutia ${w.meeting}</title></rect></g>`;
      }).join('');
      const sum = (k) => t.reduce((a, w) => a + w[k], 0);
      return `<section class="card card-pad rp-sec rp-trend" id="rp-trend">
        <div class="card-head"><div class="card-title">Trend po KW${UI.tip('Posledných 12 kalendárnych týždňov (ISO, ako na Stundennachweis) až po týždeň, v ktorom obdobie končí. Za každý KW: koľko firiem sme prvýkrát oslovili, koľko prvýkrát reagovalo a koľko sa prvýkrát dostalo do kroku Stretnutie. Presné čísla sú v tabuľke pod grafom.')}</div></div>
        <div class="rp-legend">${SERIES.map(s => `<span><i style="background:${s[2]}"></i>${s[1]} <b>${sum(s[0])}</b></span>`).join('')}</div>
        <div class="rp-chart" id="rp-chart">
          <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend po KW za posledných 12 týždňov: oslovené ${sum('contacted')}, reakcie ${sum('replied')}, stretnutia ${sum('meeting')}">${grid.join('')}${groups}</svg>
          <div class="rp-tip" id="rp-tip" hidden></div>
        </div>
        <details class="rp-tbl"><summary>Čísla po týždňoch</summary>
          <table><thead><tr><th>KW</th>${SERIES.map(s => `<th class="num">${s[1]}</th>`).join('')}<th class="num">E-maily</th></tr></thead>
          <tbody>${t.slice().reverse().map(w => `<tr><td>KW ${w.week}/${w.year} <small>${esc(C().rangeText(w.from, w.to))}</small></td>${SERIES.map(s => `<td class="num">${w[s[0]]}</td>`).join('')}<td class="num">${w.emails}</td></tr>`).join('')}</tbody></table>
        </details>
      </section>`;
    },
    niceStep(max) {
      const raw = max / 4;
      const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
      for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return Math.max(1, Math.round(m * mag));
      return 10 * mag;
    },
    bindTrend() {
      const box = document.getElementById('rp-chart');
      const tip = document.getElementById('rp-tip');
      if (!box || !tip || !this.rep) return;
      const show = (g) => {
        const w = this.rep.trend[Number(g.dataset.i)];
        if (!w) return;
        box.querySelectorAll('.rp-g.on').forEach(x => x.classList.remove('on'));
        g.classList.add('on');
        tip.innerHTML = `<b>KW ${w.week}/${w.year}</b><small>${esc(C().rangeText(w.from, w.to))}</small>${SERIES.map(s =>
          `<span><i style="background:${s[2]}"></i>${s[1]}<b>${w[s[0]]}</b></span>`).join('')}<span class="rp-tip-m">E-maily<b>${w.emails}</b></span>`;
        tip.hidden = false;
        const br = box.getBoundingClientRect(), gr = g.getBoundingClientRect();
        const left = Math.min(Math.max(0, gr.left - br.left + gr.width / 2 - tip.offsetWidth / 2), br.width - tip.offsetWidth);
        tip.style.left = `${left}px`;
      };
      box.addEventListener('mouseover', (e) => { const g = e.target.closest && e.target.closest('.rp-g'); if (g) show(g); });
      box.addEventListener('mouseleave', () => { tip.hidden = true; box.querySelectorAll('.rp-g.on').forEach(x => x.classList.remove('on')); });
    },

    // ── Tabuľky (DataList) ──────────────────────────────────────────────
    pctCell(v, best) {
      if (v == null) return '<span class="dl-note is-mute">—</span>';
      return `<span class="dl-num${best ? ' rp-best-n' : ''}">${String(v).replace('.', ',')} %</span>`;
    },
    numCol(key, label, o = {}) {
      return { key, label, width: o.width || '82px', align: 'right', mobileLabel: o.mobileLabel || label.toLowerCase(), tip: o.tip, hideBelow: o.hideBelow,
        render: (r) => (r[key] ? `<span class="dl-num">${r[key]}</span>` : '<span class="dl-note is-mute">0</span>'),
        sortValue: (r) => r[key], sortDir: -1, csv: (r) => r[key] };
    },
    slug() { const p = this.rep.period; return [p.from, p.to]; },
    membersConfig(r) {
      const n = (k) => (rows) => rows.reduce((a, x) => a + (x[k] || 0), 0);
      return {
        id: 'rp-kolegovia', storageKey: 'rp-kolegovia', label: 'Po kolegoch', noun: ['kolega', 'kolegovia', 'kolegov'],
        rows: r.members.map(m => ({ ...m, id: m.key || 'none', tips: `${m.tipsSent} / ${m.tipsAdded}` })),
        rowClick: (x) => this.listIds(`Oslovené — ${x.name}`, x.ids.contacted, 'contacted'),
        rowLabel: (x) => `Kolega ${x.name}`,
        columns: [
          { key: 'name', label: 'Kolega', width: 'minmax(160px, 1.6fr)', mobile: 'title',
            render: (x) => `<span class="dl-title"><b>${esc(x.name)}</b>${x.member ? '' : `<small>${x.key ? 'mimo appky' : 'kto to bol, nie je zapísané'}</small>`}</span>`,
            sortValue: (x) => x.name, csv: (x) => x.name },
          this.numCol('contacted', 'Oslovené', { tip: 'Firmy, ktoré tento kolega oslovil prvýkrát (prvý e-mail alebo prvý hovor).' }),
          this.numCol('calls', 'Hovory'),
          this.numCol('minutes', 'Minúty', { hideBelow: 900 }),
          this.numCol('emails', 'E-maily', { tip: 'E-maily oslovenia, ktoré odoslal (aj pripomenutia).' }),
          this.numCol('replied', 'Reakcie', { tip: 'Firmy, ktoré prvýkrát reagovali na jeho e-mail alebo hovor, alebo im zmenil kategóriu na Odpísala či ďalej.' }),
          this.numCol('meeting', 'Stretnutia'),
          this.numCol('offer', 'Ponuky', { hideBelow: 1000 }),
          this.numCol('won', 'Odberatelia'),
          { ...this.numCol('overdue', 'Po termíne', { tip: 'Ďalšie kroky s firmami po termíne — dnes, podľa riešiteľa úlohy.' }),
            render: (x) => (x.overdue ? `<span class="dl-note is-red"><b class="dl-num">${x.overdue}</b></span>` : '<span class="dl-note is-mute">0</span>') },
          { key: 'tips', label: 'Tipy', width: '84px', align: 'right', mobileLabel: 'tipy', hideBelow: 1100,
            tip: 'Odkazy od kolegov v období: poslané / pridané do Nových firiem. Meno z formulára sa spáruje s používateľom appky (aj len krstné meno, keď je v tíme jediné).',
            render: (x) => `<span class="dl-num">${x.tipsSent}</span><small class="dl-note is-mute"> / ${x.tipsAdded}</small>`,
            sortValue: (x) => x.tipsSent, sortDir: -1, csv: (x) => `${x.tipsSent} / ${x.tipsAdded}` },
        ],
        sort: { key: 'contacted', dir: -1 },
        foot: (rows) => ({ cells: { name: 'Spolu', contacted: n('contacted')(rows), calls: n('calls')(rows), minutes: n('minutes')(rows), emails: n('emails')(rows),
          replied: n('replied')(rows), meeting: n('meeting')(rows), offer: n('offer')(rows), won: n('won')(rows), overdue: n('overdue')(rows),
          tips: `${n('tipsSent')(rows)} / ${n('tipsAdded')(rows)}` } }),
        empty: { ico: 'clients', title: 'Zatiaľ nikto', sub: 'V období nikto nikoho neoslovil.' },
        export: { name: ['prehlad-kolegovia', ...this.slug()] },
      };
    },
    groupConfig(id, label, rows, nameOf, exportName) {
      return {
        id, storageKey: id, label, noun: ['skupina', 'skupiny', 'skupín'],
        rows: rows.map(g => ({ ...g, id: g.key || 'none', name: nameOf(g.key) })),
        rowClick: (g) => this.listIds(`${label}: ${g.name}`, g.ids, 'contacted'),
        rowClass: (g) => (g.best ? 'rp-best' : ''),
        rowLabel: (g) => `${label} ${g.name}`,
        columns: [
          { key: 'name', label, width: 'minmax(150px, 1.6fr)', mobile: 'title',
            render: (g) => `<span class="dl-title"><b>${esc(g.name)}</b>${g.best ? `<small class="rp-best-t">${Icon('star', 12)} najlepšie</small>` : ''}</span>`,
            sortValue: (g) => g.name, csv: (g) => (g.best ? `${g.name} (najlepšie)` : g.name) },
          this.numCol('found', 'Nájdené', { width: '74px' }),
          this.numCol('contacted', 'Oslovené', { width: '76px' }),
          this.numCol('replied', 'Reakcie', { width: '72px', hideBelow: 700 }),
          this.numCol('interested', 'Záujem', { width: '70px' }),
          this.numCol('meeting', 'Stretnutie', { width: '82px', hideBelow: 820 }),
          this.numCol('offer', 'Ponuka', { width: '70px', hideBelow: 900 }),
          this.numCol('won', 'Odberateľ', { width: '82px', mobileLabel: 'odberatelia' }),
          { key: 'interestRate', label: 'Záujem %', width: '82px', align: 'right', mobileLabel: 'záujem %',
            tip: 'Koľko percent oslovených firiem má záujem alebo je ďalej. Pri malom počte oslovených je to skôr náhoda.',
            render: (g) => this.pctCell(g.interestRate, g.best), sortValue: (g) => g.interestRate, sortDir: -1, csv: (g) => (g.interestRate == null ? '' : String(g.interestRate).replace('.', ',')) },
        ],
        sort: { key: 'contacted', dir: -1 },
        columnsChooser: false,
        filters: [{ key: 'q', type: 'search', placeholder: `Hľadať: ${label.toLowerCase()}…`, fields: ['name'] },
          { key: 'oslovene', type: 'toggle', label: 'Len s oslovenými', test: (g) => g.contacted > 0,
            hint: 'Skryje skupiny, v ktorých sme v období žiadnu firmu neoslovili (len nájdené).' }],
        empty: { ico: 'chart', title: 'V období nič', sub: 'V zvolenom období sme nenašli ani neoslovili žiadnu firmu.' },
        export: { name: [...exportName, ...this.slug()], columns: [['Skupina', g => g.name], ['Nájdené', g => g.found], ['Oslovené', g => g.contacted],
          ['Reagovali', g => g.replied], ['Záujem', g => g.interested], ['Stretnutie', g => g.meeting], ['Ponuka', g => g.offer], ['Odberateľ', g => g.won],
          ['Nemá záujem', g => g.rejected], ['Reakcia %', g => (g.replyRate == null ? '' : String(g.replyRate).replace('.', ','))],
          ['Záujem %', g => (g.interestRate == null ? '' : String(g.interestRate).replace('.', ','))]] },
      };
    },
    searchConfig(r) {
      return {
        id: 'rp-hladania', storageKey: 'rp-hladania', label: 'Hľadania', noun: ['hľadanie', 'hľadania', 'hľadaní'],
        rows: r.searches.map(s => ({ ...s, id: s.key })),
        rowClick: (s) => this.openSearch(s.key),
        rowLabel: (s) => `Hľadanie ${s.label}`,
        columns: [
          { key: 'label', label: 'Hľadanie', width: 'minmax(160px, 1.8fr)', mobile: 'title',
            render: (s) => `<span class="dl-title"><b>${esc(s.label)}</b><small>${esc(s.search && s.search.source === 'outscraper' ? 'Google Mapy' : s.search && s.search.kind === 'ai' ? 'AI' : s.search ? 'podľa webov' : '')}</small></span>`,
            sortValue: (s) => s.at || null, sortDir: -1, csv: (s) => s.label },
          this.numCol('leads', 'Firiem', { width: '66px' }),
          this.numCol('contacted', 'Oslovené', { width: '76px' }),
          this.numCol('replied', 'Reakcie', { width: '70px', hideBelow: 700 }),
          this.numCol('interested', 'Záujem', { width: '68px' }),
          this.numCol('won', 'Odberatelia', { width: '86px' }),
          { key: 'interestRate', label: 'Záujem %', width: '82px', align: 'right', mobileLabel: 'záujem %',
            render: (s) => this.pctCell(s.interestRate), sortValue: (s) => s.interestRate, sortDir: -1, csv: (s) => (s.interestRate == null ? '' : String(s.interestRate).replace('.', ',')) },
        ],
        sort: { key: 'interested', dir: -1 },
        columnsChooser: false,
        empty: { ico: 'search', title: 'Zatiaľ žiadne hľadanie', sub: 'Firmy z hľadania podľa webov alebo Google Máp sa tu ukážu s tým, čo z nich bolo.' },
        export: { name: ['prehlad-hladania'] },
      };
    },
    /** Nové firmy s filtrom na jedno hľadanie (filter sa nastaví, keď je zoznam vykreslený). */
    async openSearch(id) {
      if (!Danubra.routeAvailable('leads')) return;
      Danubra.go('leads');
      await new Promise(r => setTimeout(r, 30));
      try { await Danubra._routeReady; DataList.set('leads', 'hladanie', id); } catch (e) { /* zoznam sa nevykreslil */ }
    },
    tradeName(k) { return k ? (TR() ? TR().labelSk(k, this.trades) : k) : 'Neurčené'; },

    // ── Čo treba riešiť ─────────────────────────────────────────────────
    todoHtml(r) {
      const td = r.todo;
      const dni = (n) => `${n} ${Shell.plural(n, 'deň', 'dni', 'dní')}`;
      const L = DanubraDataList;
      const item = (x, detail, right, tone = '') => {
        const l = this.leadById.get(x.leadId) || { id: x.leadId, name: 'Firma' };
        return `<li><button type="button" class="rp-it" onclick="Rep.openLead('${esc(x.leadId)}')">
          ${window.CompanyLogo ? CompanyLogo.html(l, { size: 28 }) : ''}
          <span class="rp-it-t"><b>${esc(l.name)}</b><small>${esc(detail)}</small></span>
          <span class="rp-it-r ${tone}">${right}</span></button></li>`;
      };
      const box = (key, title, tip, list, render, emptyText) => {
        const MAX = 6;
        return `<div class="rp-todo-c" data-todo="${key}"><div class="rp-todo-h"><b>${esc(title)}</b>${UI.tip(tip)}<em class="${list.length ? 'is-on' : ''}">${list.length}</em></div>
          ${list.length ? `<ul>${list.slice(0, MAX).map(render).join('')}</ul>${list.length > MAX
            ? `<button type="button" class="rp-more no-print" onclick="Rep.list('todo:${key}')">a ${list.length - MAX} ${Shell.plural(list.length - MAX, 'ďalšia', 'ďalšie', 'ďalších')}</button>` : ''}`
            : `<p class="rp-todo-ok">${Icon('check', 14)} ${esc(emptyText)}</p>`}</div>`;
      };
      const KIND = { meeting: 'Stretnutie', call: 'Hovor', site_visit: 'Obhliadka', deadline: 'Termín', other: 'Udalosť' };
      const stage = (k) => ((window.DanubraContacts && DanubraContacts.stageOf(k)) || [k, k])[1];
      return `<section class="card card-pad rp-sec rp-todo" id="rp-riesit">
        <div class="card-head"><div class="card-title">Čo treba riešiť${UI.tip('Dnešný stav, nie za obdobie. Klik na firmu otvorí jej detail — tam zapíšete hovor, ďalší krok alebo zmeníte kategóriu.')}
          <span class="rp-todo-n">${td.count ? `${td.count} ${Shell.plural(td.count, 'vec', 'veci', 'vecí')}` : 'nič nečaká'}</span></div></div>
        <div class="rp-todo-g">
          ${box('overdue', 'Ďalšie kroky po termíne', 'Otvorená úloha pri firme po termíne (odložená nie) alebo dátum ďalšieho kroku pri firme bez úlohy. Najstaršie hore.',
            td.overdue, (x) => item(x, `${x.text}${x.who ? ` · ${this.rep.people.label(x.who, x.whoName)}` : ''}`, `<b>${esc(L.fmtDay(x.due))}</b><small>pred ${dni(x.days)}</small>`, 'is-red'),
            'Žiadny dohodnutý krok nemešká.')}
          ${box('noStep', 'Záujem bez ďalšieho kroku', 'Firmy v kategórii Má záujem, Stretnutie alebo Ponuka, ktoré nemajú dohodnutý ďalší krok ani otvorenú úlohu. Hrozí, že na ne zabudneme.',
            td.noStep, (x) => item(x, stage(x.status), x.days != null ? `<small>${esc(dni(x.days))}</small>` : '', 'is-amber'),
            'Každá firma so záujmom má ďalší krok.')}
          ${box('meetings', `Stretnutia ${C().kw(td.today).short}`, 'Udalosti v kalendári pri firmách v tomto kalendárnom týždni (pondelok až nedeľa).',
            td.meetings, (x) => item(x, `${x.title && fold(x.title).startsWith(fold(KIND[x.kind] || 'Udalosť')) ? x.title : `${KIND[x.kind] || 'Udalosť'}: ${x.title}`}${x.place ? ` · ${x.place}` : ''}`,
              `<b>${esc(C().dayText(x.date, td.today))}</b>${x.time ? `<small>${esc(x.time)}</small>` : ''}`, x.past ? 'is-mute' : ''),
            'Tento týždeň nie je pri firmách žiadne stretnutie.')}
          ${box('unanswered', 'Odpísali, bez reakcie', 'Firma odpísala na e-mail oslovenia a odvtedy sme jej nezavolali, nenapísali (ani zo Správ), nezapísali kontakt ani nezmenili kategóriu.',
            td.unanswered, (x) => item(x, `odpísali ${L.fmtDay(x.date)}`, `<small>pred ${dni(x.days)}</small>`, x.days >= 2 ? 'is-red' : 'is-amber'),
            'Na každú odpoveď sme reagovali.')}
        </div></section>`;
    },

    // ── Zoznam firiem za číslom ─────────────────────────────────────────
    list(key) {
      const r = this.rep;
      if (!r) return;
      const k = r.kpi;
      const step = { contacted: 1, replied: 2, interested: 3, meeting: 4, offer: 5, won: 6 };
      if (key.startsWith('todo:') || key === 'overdue') {
        const which = key === 'overdue' ? 'overdue' : key.slice(5);
        const titles = { overdue: 'Ďalšie kroky po termíne', noStep: 'Záujem bez ďalšieho kroku', meetings: 'Stretnutia tento týždeň', unanswered: 'Odpísali, bez reakcie' };
        const items = r.todo[which] || [];
        return this.listIds(titles[which], items.map(x => x.leadId), null, new Map(items.map(x => [x.leadId, x.due || x.date || x.since || ''])));
      }
      if (key.startsWith('f:')) {
        const s = r.funnel.steps.find(x => x.key === key.slice(2));
        return s && this.listIds(`Lievik: ${s.label}`, s.ids, s.key === 'found' ? 'found' : s.key);
      }
      const T = { found: ['Nové firmy', k.found.ids, 'found'], contacted: ['Oslovené', k.contacted.ids, 'contacted'],
        calls: ['Firmy, s ktorými sme hovorili', k.calls.leadIds, null], emails: ['Firmy, ktorým odišiel e-mail', k.emails.leadIds, null],
        rejected: ['Nemá záujem', k.rejected.ids, 'rejected'] };
      for (const s of Object.keys(step)) T[s] = T[s] || [({ replied: 'Reagovali', interested: 'Záujem', meeting: 'Stretnutia', offer: 'Ponuky', won: 'Noví odberatelia' })[s] || s, k[s].ids, s];
      const x = T[key];
      if (x) this.listIds(`${x[0]} · ${r.period.title}`, x[1], x[2]);
    },
    /** Okno so zoznamom firiem (logo, remeslo, stav, kedy, kto). */
    listIds(title, ids, stepKey, dates) {
      const r = this.rep;
      const step = R().RANK[stepKey];
      const rows = [...new Set(ids || [])].map(id => {
        const l = this.leadById.get(id) || { id, name: 'Firma' };
        const t = r.timelines.get(id);
        const hit = stepKey === 'found' ? { date: R().dayOf(l.created_at), actor: '' } : stepKey === 'rejected' ? t && t.rejected : step && t ? t.reach[step] : null;
        return { id, l, when: (dates && dates.get(id)) || (hit && hit.date) || '', who: hit && hit.actor ? r.people.label(hit.actor) : '' };
      });
      const L = DanubraDataList;
      const st = (s) => (window.DanubraLeads && DanubraLeads.STATUS ? DanubraLeads.STATUS.find(x => x[0] === s) : null) || [s, s || '—', 'gray'];
      UI.modal(title, rows.length ? DataList.html({
        id: 'rp-list', label: title, noun: ['firma', 'firmy', 'firiem'], rows,
        rowClick: (x) => this.openLead(x.id), rowLabel: (x) => `Firma ${x.l.name}`,
        columns: [
          { key: 'firma', label: 'Firma', width: 'minmax(200px, 2fr)', mobile: 'title',
            render: (x) => `<span class="ld-who">${window.CompanyLogo ? CompanyLogo.html(x.l, { size: 28 }) : ''}<span class="dl-title"><b>${esc(x.l.name)}</b><small>${esc([x.l.postal_code, x.l.city].filter(Boolean).join(' ') || '—')}</small></span></span>`,
            sortValue: (x) => x.l.name, csv: (x) => x.l.name },
          { key: 'remeslo', label: 'Remeslo', width: 'minmax(110px, 1fr)', hideBelow: 700, mobileLabel: 'remeslo',
            render: (x) => esc(R().tradesOf(x.l, new Map((this.data.searches || []).map(s => [s.id, s]))).map(k2 => this.tradeName(k2)).slice(0, 2).join(', ')),
            csv: (x) => R().tradesOf(x.l, new Map((this.data.searches || []).map(s => [s.id, s]))).map(k2 => this.tradeName(k2)).join(', ') },
          { key: 'stav', label: 'Stav', width: '112px', mobile: 'badge', render: (x) => { const s = st(x.l.status); return UI.badge(s[1], s[2]); },
            sortValue: (x) => st(x.l.status)[1], csv: (x) => st(x.l.status)[1] },
          { key: 'kedy', label: 'Kedy', width: '96px', mobileLabel: 'kedy', render: (x) => (x.when ? `<span class="dl-num">${esc(L.fmtDay(x.when))}</span>` : ''),
            sortValue: (x) => x.when || null, sortDir: -1, csv: (x) => x.when },
          { key: 'kto', label: 'Kto', width: 'minmax(100px, .9fr)', hideBelow: 600, mobileLabel: 'kto', render: (x) => esc(x.who), sortValue: (x) => x.who || null, csv: (x) => x.who },
        ],
        sort: { key: 'kedy', dir: -1 }, columnsChooser: false,
        export: { name: ['prehlad', title, ...this.slug()] },
      }) : UI.empty('search', 'Žiadna firma', 'Do tohto čísla sa v období nezarátala žiadna firma.'), { wide: true });
    },

    /** Detail firmy nad prehľadom (bez odchodu z obrazovky); inak cez odkaz. */
    async openLead(id) {
      try {
        if (window.Lead && Danubra.can('leads')) {
          if (!Lead.loaded) await Lead.load();
          if (window.Outreach && !Outreach.loaded) await Outreach.ensure();
          if (Lead.rows.some(x => x.id === id)) { Lead.detail(id); return; }
        }
      } catch (e) { console.error('[danubra] firmu sa nepodarilo otvoriť', e); }
      Danubra.open('lead', id);
    },

    // ── Export a tlač ───────────────────────────────────────────────────
    exportCsv() {
      if (!this.rep) return UI.toast('Prehľad sa ešte nenačítal.', 'err');
      const rows = R().csvRows(this.rep, { lead: (id) => (this.leadById.get(id) || {}).name || id, trade: (k) => this.tradeName(k) });
      const name = DanubraExport.download(rows, ['prehlad-oslovovania', ...this.slug()]);
      UI.toast(`Uložené: ${name}`, 'ok');
      return name;
    },
    print() {
      UI.toast('V dialógu tlače vyberte „Uložiť ako PDF".');
      setTimeout(() => DanubraExport.printArea('print-rp'), 120);
    },

    // ── Štýly (raz) ─────────────────────────────────────────────────────
    _css() {
      if (typeof document === 'undefined' || !document.head || document.getElementById('rp-css')) return;
      const st = document.createElement('style');
      st.id = 'rp-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    },
  };

  const CSS = `
.rp{display:flex;flex-direction:column;gap:14px;--rp-c1:#7BA0F0;--rp-c2:#F07E22;--rp-c3:#1E4FD8;}
.rp-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;}
.rp-seg{display:inline-flex;flex-wrap:wrap;border:1px solid var(--border);border-radius:var(--radius);background:var(--field);padding:2px;gap:2px;}
.rp-seg button{border:0;background:none;padding:6px 11px;border-radius:var(--radius-sm);font:inherit;font-size:13px;font-weight:600;color:var(--ink-sub);cursor:pointer;white-space:nowrap;}
.rp-seg button.on{background:var(--card);color:var(--ink);box-shadow:0 1px 2px rgba(10,27,61,.12);}
.rp-seg button:focus-visible{outline:2px solid var(--blue);outline-offset:1px;}
.rp-seg-s button{padding:4px 9px;font-size:12px;}
.rp-custom{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12.5px;color:var(--ink-sub);}
.rp-custom[hidden]{display:none;}
.rp-custom input{height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);padding:0 6px;font:inherit;font-size:13px;background:var(--card);color:var(--ink);}
.rp-cmp{font-size:12.5px;color:var(--ink-mute);display:inline-flex;align-items:center;gap:2px;}
.rp-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(178px,1fr));gap:10px;}
.rp-kpi{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:11px 12px 10px;display:flex;flex-direction:column;min-width:0;}
.rp-kpi.is-hot{border-color:color-mix(in srgb,var(--red) 40%,var(--border));background:color-mix(in srgb,var(--red) 4%,var(--card));}
.rp-kpi-l{display:flex;align-items:center;gap:2px;font-size:12px;font-weight:700;color:var(--ink-sub);text-transform:uppercase;letter-spacing:.04em;}
.rp-kpi-v{align-self:flex-start;border:0;background:none;padding:0;margin:4px 0 2px;font:inherit;font-size:28px;font-weight:800;line-height:1.1;color:var(--ink);cursor:pointer;font-variant-numeric:tabular-nums;border-bottom:2px solid transparent;}
.rp-kpi-v:hover,.rp-kpi-v:focus-visible{border-bottom-color:var(--brand);outline:none;}
.rp-kpi.is-hot .rp-kpi-v{color:var(--red);}
.rp-kpi-s{font-size:12px;color:var(--ink-sub);line-height:1.35;min-height:16px;}
.rp-kpi-d{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin-top:6px;font-size:12px;}
.rp-d{display:inline-flex;align-items:center;gap:3px;font-weight:700;font-variant-numeric:tabular-nums;padding:1px 6px;border-radius:999px;}
.rp-d.is-good{color:var(--green);background:var(--green-50);}
.rp-d.is-bad{color:var(--red);background:var(--red-50);}
.rp-d.is-same{color:var(--ink-mute);font-weight:600;padding:0;}
.rp-d-was{color:var(--ink-mute);}
.rp-arr{flex:none;}
.rp-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:14px;align-items:start;}
.rp-two-eq{grid-template-columns:minmax(0,1fr) minmax(0,1fr);}
.rp-sec{min-width:0;}
.rp-sec .card-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;}
.rp-note{margin:-2px 0 10px;font-size:12.5px;color:var(--ink-sub);}
.rp-fun{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;}
.rp-fs button{width:100%;display:grid;grid-template-columns:96px minmax(0,1fr) 44px 128px;align-items:center;gap:10px;border:0;background:none;padding:6px 4px;border-radius:var(--radius-sm);font:inherit;color:var(--ink);cursor:pointer;text-align:left;}
.rp-fs button:hover,.rp-fs button:focus-visible{background:var(--field);outline:none;}
.rp-fs-l{font-size:13px;font-weight:600;}
.rp-fs-bar{height:16px;background:var(--field);border-radius:var(--radius-sm);overflow:hidden;}
.rp-fs-bar i{display:block;height:100%;background:var(--rp-c3);border-radius:0 4px 4px 0;}
.rp-fs.is-ctx .rp-fs-bar i{background:var(--rp-c1);}
.rp-fs-n{font-size:15px;text-align:right;font-variant-numeric:tabular-nums;}
.rp-fs-c{font-size:12px;color:var(--ink-sub);font-variant-numeric:tabular-nums;}
.rp-legend{display:flex;flex-wrap:wrap;gap:14px;font-size:12.5px;color:var(--ink-sub);margin:-2px 0 6px;}
.rp-legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px;}
.rp-legend b{color:var(--ink);margin-left:3px;font-variant-numeric:tabular-nums;}
.rp-chart{position:relative;}
.rp-chart svg{display:block;width:100%;height:auto;overflow:visible;}
.rp-grid{stroke:var(--border-soft);stroke-width:1;}
.rp-grid.is-base{stroke:var(--border);}
.rp-ax{font-size:10.5px;fill:var(--ink-mute);font-variant-numeric:tabular-nums;}
.rp-ax.is-now{fill:var(--ink);font-weight:700;}
.rp-b1{fill:var(--rp-c1);} .rp-b2{fill:var(--rp-c2);} .rp-b3{fill:var(--rp-c3);}
.rp-g.on .rp-hit{fill:color-mix(in srgb,var(--ink) 5%,transparent);}
.rp-hit{cursor:default;}
.rp-tip{position:absolute;top:0;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-md);padding:8px 10px;font-size:12px;min-width:150px;pointer-events:none;z-index:2;display:flex;flex-direction:column;gap:2px;}
.rp-tip[hidden]{display:none;}
.rp-tip small{color:var(--ink-mute);margin-bottom:3px;}
.rp-tip span{display:flex;align-items:center;gap:6px;color:var(--ink-sub);}
.rp-tip span b{margin-left:auto;color:var(--ink);font-variant-numeric:tabular-nums;}
.rp-tip i{width:9px;height:9px;border-radius:2px;flex:none;}
.rp-tip-m{padding-left:15px;}
.rp-tbl{margin-top:8px;font-size:12.5px;}
.rp-tbl summary{cursor:pointer;color:var(--ink-sub);font-weight:600;}
.rp-tbl table{width:100%;border-collapse:collapse;margin-top:6px;}
.rp-tbl th,.rp-tbl td{padding:4px 6px;border-bottom:1px solid var(--border-soft);text-align:left;}
.rp-tbl .num{text-align:right;font-variant-numeric:tabular-nums;}
.rp-tbl small{color:var(--ink-mute);}
.rp-todo-n{margin-left:10px;font-size:12.5px;font-weight:600;color:var(--ink-sub);}
.rp-todo-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;}
.rp-todo-c{border:1px solid var(--border-soft);border-radius:var(--radius);padding:10px;min-width:0;}
.rp-todo-h{display:flex;align-items:center;gap:4px;font-size:13px;margin-bottom:6px;}
.rp-todo-h em{margin-left:auto;font-style:normal;font-weight:700;font-size:12px;padding:0 8px;border-radius:999px;background:var(--field);color:var(--ink-mute);}
.rp-todo-h em.is-on{background:var(--brand-50);color:var(--brand-dark);}
.rp-todo-c ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px;}
.rp-it{width:100%;display:flex;align-items:center;gap:9px;border:0;background:none;padding:5px 4px;border-radius:var(--radius-sm);font:inherit;color:var(--ink);cursor:pointer;text-align:left;}
.rp-it:hover,.rp-it:focus-visible{background:var(--field);outline:none;}
.rp-it-t{display:flex;flex-direction:column;min-width:0;flex:1;}
.rp-it-t b{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.rp-it-t small{font-size:11.5px;color:var(--ink-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.rp-it-r{flex:none;display:flex;flex-direction:column;align-items:flex-end;font-size:12px;font-variant-numeric:tabular-nums;}
.rp-it-r small{color:var(--ink-mute);font-size:11px;}
.rp-it-r.is-red b,.rp-it-r.is-red small{color:var(--red);}
.rp-it-r.is-amber small{color:var(--amber);}
.rp-it-r.is-mute b{color:var(--ink-mute);}
.rp-todo-ok{margin:4px 0 0;font-size:12.5px;color:var(--ink-mute);display:flex;align-items:center;gap:6px;}
.rp-todo-ok .ico{color:var(--green);}
.rp-more{border:0;background:none;padding:4px;font:inherit;font-size:12.5px;font-weight:600;color:var(--blue);cursor:pointer;}
.rp-sec .rp-seg{margin:0 0 8px;}
.rp-ptable{display:none;}
.rp-best-t{color:var(--green) !important;display:inline-flex;align-items:center;gap:3px;font-weight:700;}
.rp-best-n{color:var(--green);font-weight:800;}
@media (max-width:1100px){.rp-two,.rp-two-eq{grid-template-columns:minmax(0,1fr);}}
@media (max-width:760px){
  .rp-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}
  .rp-kpi{padding:9px 10px;}
  .rp-kpi-v{font-size:24px;}
  .rp-kpi-l{font-size:11px;}
  .rp-fs button{grid-template-columns:76px minmax(0,1fr) 34px;gap:8px;}
  .rp-fs-c{grid-column:2 / 4;margin-top:-4px;}
  .rp-bar .rp-seg button{padding:5px 8px;font-size:12.5px;}
}
@media print{
  html.print-rp .rp-bar, html.print-rp .rp .dl-bar, html.print-rp .rp .dl-sub, html.print-rp .rp [data-dl-part="panel"],
  html.print-rp .rp [data-dl-part="cols"], html.print-rp .rp .dl-acts, html.print-rp .subtabs, html.print-rp .rp-seg, html.print-rp .rp-more,
  html.print-rp .page-head, html.print-rp .notebox, html.print-rp .tip-btn { display:none !important; }
  html.print-rp .rp{gap:8px;font-size:11px;}
  html.print-rp .rp-kpis{grid-template-columns:repeat(4,minmax(0,1fr)) !important;gap:6px;}
  html.print-rp .rp .dl{display:none !important;}
  html.print-rp .rp-ptable{display:table;width:100%;border-collapse:collapse;font-size:10.5px;}
  html.print-rp .rp-ptable th{text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.03em;color:#555;border-bottom:1.5px solid #0A1B3D;padding:3px 5px;}
  html.print-rp .rp-ptable td{padding:3px 5px;border-bottom:1px solid #E3EAF7;}
  html.print-rp .rp-ptable .num{text-align:right;font-variant-numeric:tabular-nums;}
  html.print-rp .rp-ptable tfoot td{font-weight:700;border-top:1.5px solid #0A1B3D;}
  html.print-rp .rp-ptable tr{break-inside:avoid;}
  html.print-rp .rp-fs button{grid-template-columns:70px minmax(0,1fr) 30px 92px;gap:6px;padding:3px 2px;}
  html.print-rp .rp-fs-c{font-size:10px;}
  html.print-rp .rp-kpi{padding:6px 8px;break-inside:avoid;}
  html.print-rp .rp-kpi-v{font-size:20px;}
  html.print-rp .rp-two,html.print-rp .rp-two-eq{grid-template-columns:1fr 1fr !important;gap:8px;}
  html.print-rp .rp-sec{break-inside:auto;padding:8px !important;}
  html.print-rp .rp-funnel, html.print-rp .rp-trend, html.print-rp .rp-todo-c{break-inside:avoid;}
  html.print-rp .rp-sec .card-head{break-after:avoid;}
  html.print-rp .rp-tbl{display:none;}
  html.print-rp .rp-todo-g{grid-template-columns:1fr 1fr;}
  html.print-rp .rp, html.print-rp .rp *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  html.print-rp .dl-table{min-width:0 !important;}
}`;

  window.Rep = Rep;
  Danubra.views.vedenie = function (el) { return Rep.view(el); };
})();
