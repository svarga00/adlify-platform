// ============================================================================
// DANUBRA — Inzeráty
// ============================================================================
// Prvá vec, ktorú treba pri telefonáte vedieť, nie je meno. Je to **na ktorý
// inzerát človek volá**. Od toho sa odvíja zvyšok hovoru: aké remeslo, do
// akého mesta, akú sadzbu sme sľúbili a na čo sa treba pýtať.
//
// Preto tu nie je len zoznam textov, ale aj to, čo inzerát sľuboval. Keď sa
// o mesiac na stavbe povie „veď ste písali 18 €", musí byť po ruke, čo tam
// naozaj bolo — v znení, v akom to bežalo.
//
// Druhá vec, ktorú to rieši: **ktorý inzerát prináša ľudí.** Bez toho sa za
// dosah platí naslepo.
// ============================================================================
(function () {
  const A = () => window.DanubraAds;

  const Ads = {
    items: [], perf: [], trades: [], plans: [], subcontracts: [], loaded: false,
    filters: { q: '', channel: '', state: 'running' },

    async load() {
      const [a, p, t, pl, s] = await Promise.all([
        DB.list('ads', { order: { column: 'created_at', ascending: false }, limit: 300 }),
        DB.list('v_ad_performance', { limit: 300 }),
        DB.list('trades', { select: 'key,name_sk', limit: 100 }),
        DB.list('recruitment_plans', { select: 'id,title,trade_key,city,status', limit: 200 }),
        DB.list('subcontracts', { select: 'id,title,site_city,status', limit: 200 }),
      ]);
      this.items = a.data || []; this.perf = p.data || [];
      this.trades = t.data || []; this.plans = pl.data || [];
      this.subcontracts = s.data || [];
      this.loaded = true;
    },

    perfOf(id) { return A().performance(this.perf.find(x => x.id === id) || {}); },
    tradeName(key) {
      const t = this.trades.find(x => x.key === key);
      return t ? t.name_sk : (key || '');
    },

    /** Čo je po filtroch vidieť. Export aj zoznam berú to isté. */
    rows() {
      const f = this.filters;
      const today = new Date().toISOString().slice(0, 10);
      const withState = this.items.map(x => ({
        ...x,
        running: A().isRunning(x, today),
        trade_name: this.tradeName(x.trade_key),
      }));
      const byState = f.state === 'running' ? withState.filter(x => x.running)
        : (f.state === 'ended' ? withState.filter(x => !x.running) : withState);
      return Shell.filterRows(byState, {
        q: f.q,
        fields: ['title', 'channel_detail', 'city', 'trade_name', 'body'],
        equals: { channel: f.channel },
      });
    },

    /** Filter z kódu (staré volania). Filtre drží `DataList`. */
    setF(k, v) {
      this.filters[k] = v;
      const map = { q: ['q', v || ''], state: ['stav', v || ''], channel: ['kanal', v || ''] };
      if (map[k] && DataList._reg.inzeraty) { DataList.set('inzeraty', map[k][0], map[k][1]); return; }
      Danubra.renderRoute();
    },

    exportCsv() {
      // Keď je zoznam na obrazovke, exportuje sa to, čo je v ňom vidieť.
      const shown = DataList._reg.inzeraty
        ? DataList.visible('inzeraty').map(r => ({ ...r.x, running: r.running, trade_name: r.trade }))
        : this.rows();
      Shell.exportCsv(shown, [
        ['Inzerát', x => x.title],
        ['Kanál', x => A().channelLabel(x.channel)],
        ['Kde', x => x.channel_detail],
        ['Remeslo', x => x.trade_name],
        ['Mesto', x => x.city],
        ['Sadzba €/h', x => DanubraExport.num(x.rate_offered)],
        ['Beží', x => (x.running ? 'áno' : 'nie')],
        ['Od', x => x.starts_on],
        ['Do', x => x.ends_on],
        ['Ozvalo sa', x => this.perfOf(x.id).candidates],
        ['Ozvali sme sa', x => this.perfOf(x.id).contacted],
        ['Nastúpilo', x => this.perfOf(x.id).hired],
      ], ['inzeraty']);
    },

    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      Danubra.setActions(
        `<button class="btn btn-primary btn-sm" onclick="Ads.form()">${Icon('plus')} Nový inzerát</button>`);
      // Zoznam je spoločný komponent (`DataList`). Dovtedy tu boli karty
      // s hľadaním a dvoma výbermi; dnes sú to riadky so stĺpcami — kanál,
      // nábor, dokedy beží a koľko ľudí sa ozvalo.
      const today = new Date().toISOString().slice(0, 10);
      el.innerHTML = Danubra.header(Danubra.labelOf('ads'),
        'Na čo ľudia volajú — a čo sme im v tom sľúbili')
        + DataList.html(this.listConfig(this.items.map(x => this.listRow(x, today))));
    },

    // ── Zoznam inzerátov (DataList) ───────────────────────────────────────
    /** Riadok zoznamu: inzerát a to, čo sa o ňom počíta raz za vykreslenie. */
    listRow(x, today) {
      const p = this.perfOf(x.id);
      const running = A().isRunning(x, today);
      const plan = (this.plans || []).find(pl => pl.id === x.plan_id) || null;
      const left = x.ends_on ? DanubraDataList.daysBetween(today, String(x.ends_on).slice(0, 10)) : null;
      // Komu sme sa ešte neozvali — to je to, čo pri inzeráte horí.
      const waiting = Math.max(0, (Number(p.candidates) || 0) - (Number(p.contacted) || 0));
      return {
        id: x.id, x, p, running, plan, left, waiting,
        title: x.title || 'Inzerát', city: x.city || '', trade: this.tradeName(x.trade_key),
        channel: A().channelLabel(x.channel),
        state: running ? 'running' : 'ended',
      };
    },

    /** Konfigurácia zoznamu inzerátov pre `DataList`. */
    listConfig(rows) {
      const L = DanubraDataList;
      const dni = (n) => `${n} ${Shell.plural(n, 'deň', 'dni', 'dní')}`;
      const endCell = (r) => {
        if (!r.x.ends_on) return r.running ? '<span class="dl-note is-mute">bez konca</span>' : '';
        let note = '';
        if (r.running) {
          note = r.left === 0 ? '<span class="dl-note is-amber">končí dnes</span>'
            : `<span class="dl-note ${r.left <= 7 ? 'is-amber' : 'is-mute'}">ešte ${dni(r.left)}</span>`;
        } else if (r.left != null && r.left < 0) {
          note = `<span class="dl-note is-mute">pred ${dni(-r.left)}</span>`;
        }
        return `<span class="dl-two"><b>${L.fmtDay(r.x.ends_on)}</b>${note}</span>`;
      };
      const perfCell = (r) => {
        const p = r.p;
        if (!p.candidates) return '<span class="dl-note is-mute">zatiaľ nikto</span>';
        return `<span class="pl-perf" title="${UI.esc(`Ozvalo sa ${p.candidates}, ozvali sme sa ${p.contacted}, nastúpilo ${p.hired}`)}">
          <span><b>${p.candidates}</b> ozvalo sa · <b>${p.hired}</b> nastúpilo</span>
          ${r.waiting ? `<span class="dl-note is-red">${r.waiting} ${Shell.plural(r.waiting, 'čaká', 'čakajú', 'čaká')} na telefonát</span>`
            : `<span class="dl-note is-green">všetkým sme sa ozvali</span>`}</span>`;
      };
      return {
        id: 'inzeraty', storageKey: 'inzeraty', label: 'Inzeráty',
        noun: ['inzerát', 'inzeráty', 'inzerátov'],
        rows,
        rowClick: (r) => Ads.detail(r.id),
        rowClass: (r) => (r.running && r.waiting ? 'is-hot' : r.running && r.left != null && r.left <= 3 ? 'is-warn' : !r.running ? 'is-muted' : ''),
        rowLabel: (r) => `Inzerát ${r.title}`,
        rowActions: [{ ico: 'chevron', label: 'Otvoriť inzerát', run: (r) => Ads.detail(r.id) }],
        columns: [
          { key: 'nazov', label: 'Inzerát', width: 'minmax(190px, 1.7fr)', mobile: 'title',
            render: (r) => {
              const sub = [r.trade, r.city, r.x.rate_offered ? `${String(r.x.rate_offered).replace('.', ',')} €/h` : '']
                .filter(Boolean).map(UI.esc).join(' · ');
              return `<span class="dl-title"><b>${UI.esc(r.title)}</b>${sub ? `<small>${sub}</small>` : ''}</span>`;
            },
            sortValue: (r) => r.title, sortLabel: 'Názov' },
          { key: 'kanal', label: 'Kanál', width: 'minmax(110px, .9fr)',
            render: (r) => `<span class="dl-two"><b>${UI.esc(r.channel)}${r.x.web_published ? ' <span class="pl-crew">na webe</span>' : ''}</b>${
              r.x.channel_detail ? `<small>${UI.esc(r.x.channel_detail)}</small>` : ''}</span>`,
            sortValue: (r) => r.channel },
          { key: 'nabor', label: 'Nábor', width: 'minmax(120px, 1fr)',
            render: (r) => (r.plan ? Danubra.link('plan', r.plan.id, r.plan.title) : '<span class="dl-note is-mute">bez náboru</span>'),
            sortValue: (r) => (r.plan ? r.plan.title : null) },
          { key: 'stav', label: 'Stav', width: '92px', mobile: 'badge',
            tip: 'Inzerát „beží", keď nie je ukončený a dnešok je medzi dátumom od a do.',
            render: (r) => (r.running ? UI.badge('beží', 'green') : UI.badge('dobehol', 'gray')),
            sortValue: (r) => (r.running ? 0 : 1) },
          { key: 'do', label: 'Platí do', width: '116px', mobileLabel: 'do',
            render: endCell, sortValue: (r) => r.x.ends_on },
          { key: 'reakcie', label: 'Reakcie', width: 'minmax(170px, 1.2fr)', mobile: 'line',
            tip: 'Koľko ľudí sa na inzerát ozvalo a koľko nastúpilo. Červené: komu sme sa ešte neozvali — každý, komu nezavoláme, je stratený človek.',
            render: perfCell,
            // Čo horí hore: bežiace, kde niekto čaká na telefonát, potom čo
            // čoskoro končí; dobehnuté na koniec.
            sortValue: (r) => [r.running ? 0 : 1, -r.waiting, r.running && r.left != null ? r.left : 9999, -(Number(r.p.candidates) || 0)],
            sortLabel: 'Čo horí' },
        ],
        sort: { key: 'reakcie', dir: 1 },
        sorts: [
          { key: 'ozvalo', label: 'Najviac reakcií', value: (r) => Number(r.p.candidates) || 0, dir: -1 },
          { key: 'od', label: 'Beží od', value: (r) => r.x.starts_on || r.x.created_at, dir: -1 },
        ],
        groups: [{ key: 'kanal', label: 'Kanál', value: (r) => r.channel }],
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať názov, skupinu, mesto, text…',
            label: 'Hľadať názov, skupinu, mesto, remeslo alebo text inzerátu',
            fields: ['title', 'x.channel_detail', 'city', 'trade', 'x.body'] },
          { key: 'stav', type: 'select', label: 'Stav', value: 'state', default: 'running',
            options: [['running', 'Bežiace'], ['ended', 'Dobehnuté']], allLabel: 'Všetky' },
          { key: 'kanal', type: 'select', label: 'Kanál', value: (r) => r.x.channel,
            options: A().CHANNELS, allLabel: 'Všetky kanály' },
          { key: 'nabor', type: 'select', label: 'Nábor', value: (r) => r.x.plan_id,
            optionLabel: (v, r) => (r && r.plan ? r.plan.title : 'Nábor'), emptyLabel: 'Bez náboru', allLabel: 'Všetky nábory' },
          { key: 'caka', type: 'toggle', label: 'Niekto čaká na telefonát', test: (r) => r.waiting > 0,
            hint: 'Inzeráty, na ktoré sa niekto ozval a my sme mu ešte nezavolali späť.' },
          { key: 'remeslo', type: 'select', label: 'Remeslo', more: true, value: (r) => r.x.trade_key,
            optionLabel: (v) => this.tradeName(v), emptyLabel: 'Viac remesiel', allLabel: 'Všetky remeslá' },
          { key: 'mesto', type: 'select', label: 'Mesto', more: true, value: 'city', allLabel: 'Všetky mestá' },
          { key: 'web', type: 'toggle', label: 'Zverejnené na webe', more: true, test: (r) => !!r.x.web_published },
          { key: 'obdobie', type: 'range-date', label: 'Beží v období', more: true, start: (r) => r.x.starts_on || r.x.created_at, end: 'x.ends_on',
            hint: 'Inzeráty, ktoré v zvolenom období viseli aspoň jeden deň.' },
        ],
        empty: { ico: 'marketing', title: 'Zatiaľ žiadny inzerát',
          sub: 'Založte inzerát skôr, než ho vyvesíte — hovor sa potom začína tým, na čo človek volá, nie otázkou „a čo hľadáte?".',
          cta: `<button class="btn btn-primary" onclick="Ads.form()">${Icon('plus')} Nový inzerát</button>` },
        export: {
          name: ['inzeraty'],
          columns: [
            ['Inzerát', r => r.x.title], ['Kanál', r => r.channel], ['Kde', r => r.x.channel_detail],
            ['Remeslo', r => r.trade], ['Mesto', r => r.x.city], ['Sadzba €/h', r => DanubraExport.num(r.x.rate_offered)],
            ['Nábor', r => (r.plan ? r.plan.title : '')], ['Beží', r => (r.running ? 'áno' : 'nie')],
            ['Od', r => r.x.starts_on], ['Do', r => r.x.ends_on],
            ['Ozvalo sa', r => r.p.candidates], ['Ozvali sme sa', r => r.p.contacted], ['Nastúpilo', r => r.p.hired],
          ],
        },
      };
    },

    detail(id) {
      const x = this.items.find(i => i.id === id);
      if (!x) return UI.toast('Nenájdené', 'err');
      const p = this.perfOf(id);
      const promise = A().promiseLines(x);

      UI.modal(x.title, `
        <div class="detail-head">
          ${A().isRunning(x) ? UI.badge('beží', 'green') : UI.badge('dobehol', 'gray')}
          <span class="muted-sm">
            ${UI.esc(A().subtitle(x))}</span>
        </div>

        <div class="kv">
          <div><span>Ozvalo sa</span><strong>${p.candidates}</strong></div>
          <div><span>Ozvali sme sa${UI.tip('Koľkým z tých, čo sa ozvali, sme už zavolali alebo napísali späť. V zátvorke je to v percentách.')}</span><strong>${p.contacted}${
            p.contactRate != null ? ` (${p.contactRate} %)` : ''}</strong></div>
          <div><span>Nastúpilo</span><strong>${p.hired}</strong></div>
          <div><span>Beží${UI.tip('Inzerát „beží", keď nie je ukončený a dnešok je medzi dátumom od a do. Prázdny dátum znamená bez obmedzenia.')}</span><strong>${x.starts_on ? UI.date(x.starts_on) : 'odkedy'} – ${
            x.ends_on ? UI.date(x.ends_on) : 'dokedy'}</strong></div>
        </div>

        ${promise.length ? `<div class="form-section">Čo sme sľúbili</div>
          <div class="ad-promise">${promise.map(t => `<span>${UI.esc(t)}</span>`).join('')}</div>
          <p class="card-note">
            Toto je vidieť počas celého hovoru. Nesľubujte nič, čo tu nie je.</p>` : ''}

        ${x.body ? `<div class="form-section">Znenie inzerátu</div>
          <pre class="ad-body">${UI.esc(x.body)}</pre>` : ''}
        ${UI.safeUrl(x.url) ? `<p style="margin:10px 0 0;"><a href="${UI.safeUrl(x.url)}"
          target="_blank" rel="noopener noreferrer">${Icon('chevron', 13)} Otvoriť inzerát</a></p>` : ''}
        ${x.note ? `<div class="notebox">${UI.esc(x.note)}</div>` : ''}
        ${x.web_published ? `<div class="form-section">Web punds.sk</div>
          <p style="margin:0;font-size:13px;">${Icon('check', 13)} Zverejnené ako <strong>${UI.esc(x.web_title || x.title)}</strong>
            ${x.web_slug ? ` · <a href="${UI.esc(this.webUrl(x))}" target="_blank" rel="noopener">otvoriť na webe</a>` : ''}</p>` : ''}

        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          <span style="align-self:center;display:inline-flex;">${UI.tip(x.active
            ? 'Ukončiť = inzerát sa označí ako dobehnutý a pri hovoroch sa už neponúka. Nič sa nemaže — kandidáti ostanú naviazaní na to, čo v ňom čítali. Na samotnom Facebooku či Bazoši ho treba stiahnuť ručne.'
            : 'Znova spustiť = inzerát sa znova ponúkne pri hovoroch (ak to dovolia dátumy od – do).')}</span>
          <button class="btn btn-outline" onclick="Ads.toggle('${x.id}')">
            ${Icon(x.active ? 'x' : 'check', 14)} ${x.active ? 'Ukončiť inzerát' : 'Znova spustiť'}</button>
          <button class="btn btn-primary" onclick="Ads.form('${x.id}')">
            ${Icon('edit', 14)} Upraviť</button>
        </div>`, { wide: true });
    },

    form(id) {
      const x = id ? this.items.find(i => i.id === id) || {} : {};
      UI.modal(id ? 'Upraviť inzerát' : 'Nový inzerát', `
        <form id="ad-form" onsubmit="event.preventDefault();Ads.save('${id || ''}')">
          <div class="form-grid">
            ${UI.field('title', 'Názov (interný)', { value: x.title, required: true,
              placeholder: 'Murári Stuttgart — FB skupina',
              tip: 'Názov len pre nás, ľudia ho nevidia. Podľa neho inzerát vyberiete pri telefonáte („na ktorý inzerát volá?"), tak nech je jasné, ktorý to je.' })}
            ${UI.field('channel', 'Kanál', { value: x.channel || 'facebook',
              options: A().CHANNELS, tip: 'Kde inzerát beží. Podľa toho sa potom porovnáva, ktorý kanál prináša ľudí.' })}
            ${UI.field('channel_detail', 'Kde presne', { value: x.channel_detail,
              placeholder: 'Práca v Nemecku — skupina', tip: 'Napr. názov facebookovej skupiny alebo rubrika na Bazoši — aby sa dalo nájsť, kde presne visí.' })}
            ${UI.field('url', 'Odkaz na inzerát', { value: x.url, placeholder: 'https://…' })}
            ${UI.field('trade_key', 'Remeslo', { value: x.trade_key, add: 'trade',
              options: [['', 'viac remesiel'], ...this.trades.map(t => [t.key, t.name_sk])],
              tip: 'Pre aké remeslo inzerát hľadá. Podľa toho sa pri telefonáte ukážu odborné otázky.' })}
            ${UI.field('city', 'Mesto', { value: x.city })}
            ${UI.field('rate_offered', 'Sľúbená sadzba €/h', { type: 'number', value: x.rate_offered,
              tip: 'Koľko za hodinu sme v inzeráte sľúbili živnostníkovi, bez DPH. Pri hovore sa ukáže medzi sľubmi a predvyplní sa kandidátovi.' })}
            ${UI.field('plan_id', 'Náborový plán', { value: x.plan_id, add: 'plan',
              options: [['', '— žiadny —'], ...this.plans.filter(p => p.status === 'active')
                .map(p => [p.id, p.title])],
              tip: 'Pre ktorý nábor (konkrétnu potrebu ľudí) inzerát beží. Ponúkajú sa len spustené nábory. Kto zavolá, zapíše sa rovno k nemu.' })}
            ${UI.field('subcontract_id', 'Zákazka', { value: x.subcontract_id, add: 'subcontract',
              options: [['', '— žiadna —'], ...this.subcontracts.filter(s => s.status === 'active')
                .map(s => [s.id, s.title])],
              tip: 'Ak inzerát hľadá ľudí na konkrétnu stavbu, ktorá už je dohodnutá, vyberte ju. Ponúkajú sa len aktívne zákazky.' })}
            ${UI.field('starts_on', 'Beží od', { type: 'date', value: x.starts_on,
              tip: 'Odkedy a dokedy inzerát visí. Mimo týchto dní sa pri hovore ukazuje ako „dobehol". Prázdne = bez obmedzenia.' })}
            ${UI.field('ends_on', 'Beží do', { type: 'date', value: x.ends_on })}
          </div>

          <div class="form-section">Čo inzerát sľubuje</div>
          <p class="muted-sm" style="margin:0 0 8px;">
            Jeden sľub na riadok. Počas hovoru je to vpravo na očiach, aby sa
            nesľúbilo niečo iné, než čo bolo v inzeráte.</p>
          ${UI.field('promise', '', { type: 'textarea', rows: 4,
            value: (x.promise || []).join('\n'),
            placeholder: 'ubytovanie platíme\nvýplata do 10. dňa\ndoprava zo Slovenska' })}

          <div class="form-section">Presné znenie</div>
          ${UI.field('body', '', { type: 'textarea', rows: 6, value: x.body,
            placeholder: 'Skopírujte sem text inzerátu tak, ako beží.' })}
          ${UI.field('note', 'Interná poznámka', { type: 'textarea', rows: 2, value: x.note })}

          ${this.webSection(x)}

          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">Uložiť</button>
          </div>
        </form>`, { wide: true });
    },

    async save(id) {
      const d = UI.formData(document.getElementById('ad-form'));
      if (!d.title) return UI.toast('Názov je povinný', 'err');
      const payload = {
        ...d,
        rate_offered: d.rate_offered === '' ? null : Number(d.rate_offered),
        plan_id: d.plan_id || null,
        subcontract_id: d.subcontract_id || null,
        trade_key: d.trade_key || null,
        starts_on: d.starts_on || null,
        ends_on: d.ends_on || null,
        promise: String(d.promise || '').split('\n').map(s => s.trim()).filter(Boolean),
      };
      // Časť pre web punds.sk — polia web_*, preklady, adresa ponuky.
      const W = window.DanubraWebAd;
      const x = id ? this.items.find(i => i.id === id) || {} : {};
      if (W) {
        if (d.web_published && W.missing(d).length) {
          return UI.toast(`Na web chýba: ${W.missing(d).join(', ')}`, 'err');
        }
        Object.assign(payload, W.payload(d, x, { i18n: this.webI18n(x) }));
        for (const k of Object.keys(d)) if (/^tr_/.test(k)) delete payload[k];
        // Súradnice pre mapu na webe — pri zverejnení, keď ich ešte nemá alebo sa zmenilo mesto.
        if (payload.web_published && d.city && (payload.lat === null || x.lat == null)) {
          Object.assign(payload, await this.geocode(d.city, payload.country));
        }
      }
      const { error } = id
        ? await DB.update('ads', id, payload)
        : await DB.insert('ads', payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal();
      UI.toast(id ? 'Inzerát upravený' : 'Inzerát založený', 'ok');
      this.loaded = false;
      Danubra.renderRoute();
    },

    // ── Web punds.sk ────────────────────────────────────────────────────
    /** Časť formulára: zverejnenie inzerátu ako ponuky na punds.sk. */
    webSection(x) {
      const W = window.DanubraWebAd;
      if (!W) return '';
      this._i18n = JSON.parse(JSON.stringify(x.i18n || {}));
      const tr = W.translated(this._i18n);
      return `<div class="form-section">Web punds.sk</div>
        <div class="regimebox">Zverejnená ponuka je na punds.sk do pár minút po uložení.
          Prihlášky z nej prídu do Kandidátov pri tomto inzeráte.</div>
        ${UI.field('web_published', 'Zverejniť na punds.sk', { type: 'checkbox', value: !!x.web_published,
          tip: 'Po zaškrtnutí a uložení sa ponuka do pár minút objaví na našom webe punds.sk. Odškrtnutím ju z webu stiahnete. Musia byť vyplnené povinné polia nižšie.' })}
        <div class="form-grid">
          ${UI.field('web_title', 'Verejný názov pozície', { value: x.web_title || '', placeholder: 'Zvárač MIG/MAG (135)' })}
          ${UI.field('web_prof', 'Profesia na webe', { value: x.web_prof || W.FROM_TRADE[x.trade_key] || '',
            options: [['', '— podľa remesla —'], ...W.WEB_PROFESSIONS],
            tip: 'Do ktorej kategórie sa ponuka na webe zaradí (podľa nej sa dá filtrovať a vyberie sa fotka).' })}
          ${UI.field('country', 'Krajina', { value: x.country || 'DE', options: [['DE', 'Nemecko'], ['AT', 'Rakúsko']] })}
          ${UI.field('rate_max', 'Sadzba do €/h', { type: 'number', value: x.rate_max, hint: '„Sľúbená sadzba" hore je od.' })}
          ${UI.field('hours_week', 'Hodín týždenne', { type: 'number', value: x.hours_week, placeholder: '50' })}
          ${UI.field('rotation', 'Turnus', { value: x.rotation || '', placeholder: '4+1',
            tip: 'Ako sa strieda práca a voľno, napr. 4+1 = štyri týždne na stavbe, jeden týždeň doma.' })}
          ${UI.field('headcount', 'Koľko ľudí hľadáme', { type: 'number', value: x.headcount })}
          ${UI.field('duration', 'Dĺžka projektu', { value: x.duration || '', placeholder: '6 mesiacov / dlhodobo' })}
        </div>
        <div class="form-grid">
          ${UI.field('start_now', 'Nástup ihneď', { type: 'checkbox', value: !!x.start_now,
            tip: 'Na webe sa pri ponuke ukáže „nástup ihneď".' })}
          ${UI.field('accommodation', 'Ubytovanie zabezpečené', { type: 'checkbox', value: x.accommodation !== false })}
        </div>
        ${UI.field('web_body', 'Popis pozície na web', { type: 'textarea', rows: 4, value: x.web_body || '',
          placeholder: 'Hľadáme skúsených zváračov MIG/MAG na oceľové konštrukcie pre halu v Bremene…' })}
        <div class="form-grid">
          ${UI.field('duties', 'Náplň práce (riadok = bod)', { type: 'textarea', rows: 4, value: (x.duties || []).join('\n') })}
          ${UI.field('requirements', 'Požiadavky (riadok = bod)', { type: 'textarea', rows: 4, value: (x.requirements || []).join('\n') })}
          ${UI.field('benefits', 'Čo ponúkame (riadok = bod)', { type: 'textarea', rows: 4, value: (x.benefits || []).join('\n') })}
          ${UI.field('faq', 'Otázky (Otázka? | Odpoveď)', { type: 'textarea', rows: 4, value: W.faqText(x.faq),
            placeholder: 'Potrebujem živnosť? | Áno, pomôžeme Vám ju založiť.',
            tip: 'Časté otázky na webe. Každá na samostatný riadok: najprv otázka, potom zvislá čiara | a odpoveď.' })}
        </div>
        <div class="form-grid">
          ${UI.field('image_url', 'Fotka (adresa)', { value: x.image_url || '', placeholder: 'prázdne = fotka podľa profesie',
            tip: 'Internetová adresa fotky k ponuke. Keď fotku nahráte vedľa, adresa sa doplní sama. Prázdne = použije sa všeobecná fotka podľa profesie.' })}
          <label class="fld"><span>Nahrať fotku</span><input type="file" accept="image/jpeg,image/png,image/webp" onchange="Ads.uploadImage(this)"></label>
        </div>
        <div class="btn-row">
          <button type="button" class="btn btn-outline btn-sm" id="ad-tr-btn" onclick="Ads.translate()">${Icon('repeat', 14)} Preložiť do ${W.LANGS.map(([l]) => l.toUpperCase()).join(', ')}</button>
          ${UI.tip('Appka preloží názov, popis, náplň, požiadavky, ponuku a otázky do češtiny, maďarčiny, nemčiny, angličtiny, rumunčiny, poľštiny a bulharčiny. Preklady sa ukážu nižšie na kontrolu a uložia sa až tlačidlom Uložiť. Kým preklad nie je, web ukáže slovenský text (po rumunsky, poľsky a bulharsky najprv anglický, ak je).')}
          <span class="card-note" id="ad-tr-st">${tr.length ? `Preložené: ${tr.map(l => l.toUpperCase()).join(', ')}` : 'Bez prekladu — v ostatných jazykoch sa ukáže slovenský text.'}</span>
          ${x.web_published && x.web_slug ? `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${UI.esc(this.webUrl(x))}">${Icon('chevron', 14)} Otvoriť na webe</a>` : ''}
        </div>
        <div id="ad-tr-edit">${this.trEditor()}</div>`;
    },

    webUrl(x) { return `${location.origin}/punds-sk/sk/ponuky/${encodeURIComponent(x.web_slug || '')}`; },

    /** Preklady na úpravu — po jazykoch, rozbalí sa len na požiadanie. */
    trEditor() {
      const W = window.DanubraWebAd;
      const i = this._i18n || {};
      return W.LANGS.filter(([l]) => i[l]).map(([l, name]) => `<details class="more-block"><summary>${UI.esc(name)} — upraviť preklad</summary>
        <div class="form-grid">
          ${UI.field(`tr_${l}_title`, 'Názov', { value: i[l].title || '' })}
          ${UI.field(`tr_${l}_duration`, 'Dĺžka projektu', { value: i[l].duration || '' })}
        </div>
        ${UI.field(`tr_${l}_body`, 'Popis', { type: 'textarea', rows: 3, value: i[l].body || '' })}
        <div class="form-grid">
          ${UI.field(`tr_${l}_duties`, 'Náplň práce', { type: 'textarea', rows: 3, value: (i[l].duties || []).join('\n') })}
          ${UI.field(`tr_${l}_requirements`, 'Požiadavky', { type: 'textarea', rows: 3, value: (i[l].requirements || []).join('\n') })}
          ${UI.field(`tr_${l}_benefits`, 'Čo ponúkame', { type: 'textarea', rows: 3, value: (i[l].benefits || []).join('\n') })}
          ${UI.field(`tr_${l}_faq`, 'Otázky (Otázka? | Odpoveď)', { type: 'textarea', rows: 3, value: W.faqText(i[l].faq) })}
        </div></details>`).join('');
    },

    /** Preklady z formulára (ručné opravy majú prednosť). */
    webI18n(x) {
      const W = window.DanubraWebAd;
      const f = document.getElementById('ad-form');
      const i = JSON.parse(JSON.stringify(this._i18n || x.i18n || {}));
      if (!f) return i;
      const d = UI.formData(f);
      for (const [l] of W.LANGS) {
        if (!i[l]) continue;
        if (d[`tr_${l}_title`] != null) i[l].title = d[`tr_${l}_title`];
        if (d[`tr_${l}_duration`] != null) i[l].duration = d[`tr_${l}_duration`];
        if (d[`tr_${l}_body`] != null) i[l].body = d[`tr_${l}_body`];
        for (const k of ['duties', 'requirements', 'benefits']) if (d[`tr_${l}_${k}`] != null) i[l][k] = W.lines(d[`tr_${l}_${k}`]);
        if (d[`tr_${l}_faq`] != null) i[l].faq = W.faqParse(d[`tr_${l}_faq`]);
      }
      return i;
    },

    async translate() {
      const W = window.DanubraWebAd;
      const f = document.getElementById('ad-form');
      const d = UI.formData(f);
      if (!d.web_title) return UI.toast('Najprv vyplňte verejný názov pozície', 'err');
      const btn = document.getElementById('ad-tr-btn'), st = document.getElementById('ad-tr-st');
      btn.disabled = true; st.textContent = 'Prekladám… (asi pol minúty)';
      try {
        const { data: s } = await DB.client.auth.getSession();
        const res = await fetch('/.netlify/functions/punds-translate', { method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(s && s.session && s.session.access_token) || ''}` },
          body: JSON.stringify({ ad: { web_title: d.web_title, web_body: d.web_body, duration: d.duration,
            duties: W.lines(d.duties), requirements: W.lines(d.requirements), benefits: W.lines(d.benefits), faq: W.faqParse(d.faq) } }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.i18n) throw new Error(j.error || `Chyba ${res.status}`);
        this._i18n = { ...(this._i18n || {}), ...j.i18n };
        document.getElementById('ad-tr-edit').innerHTML = this.trEditor();
        st.textContent = `Preložené: ${W.translated(this._i18n).map(l => l.toUpperCase()).join(', ')} — skontrolujte a uložte.`;
      } catch (e) {
        st.textContent = e.message;
        UI.toast(e.message, 'err');
      } finally { btn.disabled = false; }
    },

    async uploadImage(input) {
      const file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) return UI.toast('Fotka môže mať najviac 5 MB', 'err');
      const ext = (file.name.match(/\.(jpe?g|png|webp)$/i) || ['.jpg'])[0].toLowerCase();
      const path = `ponuky/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}${ext}`;
      const { error } = await DB.client.storage.from('punds-web').upload(path, file, { contentType: file.type, upsert: false });
      if (error) return UI.toast('Fotka sa nenahrala: ' + error.message, 'err');
      const { data } = DB.client.storage.from('punds-web').getPublicUrl(path);
      const f = document.getElementById('ad-form');
      f.querySelector('[name=image_url]').value = data.publicUrl;
      UI.toast('Fotka nahratá', 'ok');
    },

    /** Súradnice mesta pre mapu na webe (OpenStreetMap). Keď sa nepodarí, web použije známe mestá. */
    async geocode(city, country) {
      if (!city) return {};
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=${(country || 'de').toLowerCase()}&q=${encodeURIComponent(city)}`,
          { headers: { 'Accept-Language': 'de' } });
        const j = await r.json();
        return j && j[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : {};
      } catch (e) { return {}; }
    },

    /**
     * Dobehnutý inzerát sa vypína, nie maže. Kandidáti, ktorí sa naň ozvali,
     * musia zostať naviazaní na to, čo čítali.
     */
    async toggle(id) {
      const x = this.items.find(i => i.id === id);
      if (!x) return;
      const { error } = await DB.update('ads', id, { active: !x.active });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal();
      UI.toast(x.active ? 'Inzerát ukončený' : 'Inzerát znova beží', 'ok');
      this.loaded = false;
      Danubra.renderRoute();
    },
  };

  window.Ads = Ads;
  Danubra.views.ads = function (el) { return Ads.view(el); };
})();
