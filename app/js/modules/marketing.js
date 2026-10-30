// ============================================================================
// DANUBRA — M8 Marketing: inzeráty s obnovením a výdavky voči rozpočtu
// ============================================================================
(function () {
  const STATUS = [['active', 'Aktívny', 'green'], ['to_renew', 'Na obnovenie', 'amber'], ['expired', 'Expirovaný', 'red']];
  const PLATFORMS = [
    ['mein-monteurzimmer', 'mein-monteurzimmer.de'], ['deutschland-monteurzimmer', 'deutschland-monteurzimmer.de'],
    ['monteur-zimmer', 'monteur-zimmer.info'], ['auftragsbank', 'Auftragsbank.de'],
    ['subunternehmen-gesucht', 'subunternehmen-gesucht.com'], ['cocrafter', 'CoCrafter'],
    ['profesia', 'profesia.sk'], ['facebook', 'Facebook'], ['google', 'Google Ads'], ['ine', 'Iné'],
  ];
  const CHANNELS = [['portal', 'Portál / inzercia'], ['ads', 'Platená reklama'], ['referral', 'Odmena za odporúčanie'],
    ['print', 'Tlač / letáky'], ['veltrh', 'Veľtrh'], ['ine', 'Iné']];

  const Mkt = {
    listings: [], expenses: [], loaded: false, tab: 'listings',

    async load() {
      const [l, e] = await Promise.all([
        DB.list('marketing_listings', { order: { column: 'renew_at' }, limit: 300 }),
        DB.list('marketing_expenses', { order: { column: 'spent_at', ascending: false }, limit: 500 }),
      ]);
      this.listings = l.data || []; this.expenses = e.data || [];
      this.loaded = true;
      await this._markToRenew();
    },

    /** Inzeráty s obnovením do 7 dní označ (denný cron robí to isté serverovo). */
    async _markToRenew() {
      const limit = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      for (const l of this.listings) {
        if (l.status === 'active' && l.renew_at && l.renew_at <= limit) {
          await DB.update('marketing_listings', l.id, { status: 'to_renew' }).catch(() => {});
          l.status = 'to_renew';
        }
      }
    },

    platformLabel(p) { const x = PLATFORMS.find(y => y[0] === p); return x ? x[1] : (p || '—'); },
    badge(s) { const m = STATUS.find(x => x[0] === s) || STATUS[0]; return UI.badge(m[1], m[2]); },

    monthExpenses(ym) {
      return this.expenses.filter(e => String(e.spent_at || '').startsWith(ym));
    },

    async view(el) {
      Danubra.setActions(`
        <button class="btn btn-outline btn-sm" onclick="Mkt.expenseForm()">${Icon('euro')} Výdavok</button>
        <button class="btn btn-primary btn-sm" onclick="Mkt.listingForm()">${Icon('plus')} Inzerát</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }

      const s = await this._settings();
      const budget = Number(s?.marketing?.monthly_budget) || 0;
      const ym = new Date().toISOString().slice(0, 7);
      const spent = this.monthExpenses(ym).reduce((a, e) => a + Number(e.amount || 0), 0);
      const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
      const toRenew = this.listings.filter(l => l.status === 'to_renew');

      el.innerHTML = Danubra.header(Danubra.labelOf('marketing'),
        `${this.listings.filter(l => l.status !== 'expired').length} aktívnych inzerátov · `
        + `minuté ${UI.money(spent)}${budget ? ` z ${UI.money(budget)}` : ''}`) +
        // Jedna veta, čo spraviť — Marketing je teraz samostatné miesto v menu.
        Shell.now(toRenew.length
          ? { key: 'renew', hot: true, title: 'Obnoviť inzeráty',
              what: `${toRenew.length} ${Shell.plural(toRenew.length, 'inzerát treba', 'inzeráty treba', 'inzerátov treba')} obnoviť do 7 dní.`,
              why: 'Inzerát, ktorý vyprší, prestane zbierať dopyt — a nikto si to nevšimne.' }
          : { key: 'ok', hot: false, title: 'Nič nečaká',
              what: 'Žiadny inzerát netreba obnoviť.',
              why: 'Keď sa niektorý bude blížiť ku koncu, bude to tu ako prvé.' },
          { help: 'card.mkt.now', action: toRenew.length
            ? { label: 'Otvoriť inzerát', ico: 'repeat', onclick: `Mkt.listingForm('${toRenew[0].id}')` } : null }) + `

        <div class="kpi-grid" style="margin-bottom:16px;">
          <div class="kpi"><div class="kpi-label"><span>Minuté tento mesiac${UI.tip('Súčet výdavkov zo záložky Výdavky, ktoré majú dátum v tomto mesiaci. Mesačný rozpočet nastavíte v Nastaveniach (Marketing a SMS); nad 90 % sa pásik sfarbí na červeno.')}</span></div>
            <div class="kpi-value">${UI.money(spent)}</div>
            ${budget ? `<div class="kpi-delta ${pct > 90 ? 'warn' : ''}">${UI.pct(pct)} z rozpočtu</div>
              <div class="stay-bar" style="margin-top:6px;"><div class="stay-fill"
                style="width:${pct}%;background:${pct > 90 ? 'var(--red)' : 'var(--brand)'};"></div></div>` : ''}
          </div>
          <div class="kpi"><div class="kpi-label"><span>Aktívne inzeráty${UI.tip('Inzeráty so stavom Aktívny. Appka nevidí na portál — riadi sa tým, čo ste tu zapísali.')}</span></div>
            <div class="kpi-value">${this.listings.filter(l => l.status === 'active').length}</div>
            <div class="kpi-delta">zbierajú dopyt</div></div>
          <div class="kpi"><div class="kpi-label"><span>Na obnovenie${UI.tip('Inzeráty, ktorým do dátumu „Obnoviť do" ostáva 7 dní alebo menej. Appka ich označí sama, obnoviť (predĺžiť, zaplatiť) ich však treba na portáli.')}</span></div>
            <div class="kpi-value" style="color:${toRenew.length ? 'var(--amber)' : 'var(--green)'};">${toRenew.length}</div>
            <div class="kpi-delta">do 7 dní</div></div>
          <div class="kpi"><div class="kpi-label"><span>Výdavky spolu${UI.tip('Všetky zapísané výdavky od začiatku, nielen tento mesiac.')}</span></div>
            <div class="kpi-value">${UI.money(this.expenses.reduce((a, e) => a + Number(e.amount || 0), 0))}</div>
            <div class="kpi-delta">za celé obdobie</div></div>
        </div>

        ${Shell.tabs([
          ['listings', 'Inzeráty', 'marketing', this.listings.length],
          ['expenses', 'Výdavky', 'receipt', this.expenses.length],
        ], this.tab, k => `Mkt.setTab('${k}')`)}
        ${this.tab === 'listings' ? this.listingsHtml() : this.expensesHtml()}`;
      if (this.tab === 'expenses') this.paintExpenseSum();
    },

    // Zoznamy sú spoločný komponent (`DataList`): dovtedy tu boli karty
    // inzerátov a holé riadky výdavkov bez filtrov a bez exportu.
    listingsHtml() {
      return DataList.html(this.listingsConfig(this.listings.map(l => this.listingRow(l))));
    },

    /** Riadok inzerátu: koľko dní ostáva do obnovenia (záporné = po termíne). */
    listingRow(l, today = (Danubra._dayISO ? Danubra._dayISO() : new Date().toISOString().slice(0, 10))) {
      const left = l.renew_at ? DanubraDataList.daysBetween(today, String(l.renew_at).slice(0, 10)) : null;
      return { id: l.id, l, platform: this.platformLabel(l.platform), left,
        soon: l.status !== 'expired' && left != null && left <= 7 };
    },

    /** Konfigurácia zoznamu inzerátov pre `DataList`. */
    listingsConfig(rows) {
      const L = DanubraDataList;
      const dni = (n) => `${n} ${Shell.plural(n, 'deň', 'dni', 'dní')}`;
      const renewCell = (r) => {
        if (!r.l.renew_at) return '';
        let note = '';
        if (r.l.status === 'expired') note = '<small class="dl-note is-mute">skončil</small>';
        else if (r.left < 0) note = `<small class="dl-note is-red">po termíne ${dni(-r.left)}</small>`;
        else if (r.left === 0) note = '<small class="dl-note is-red">dnes</small>';
        else note = `<small class="dl-note ${r.left <= 7 ? 'is-amber' : 'is-mute'}">o ${dni(r.left)}</small>`;
        return `<span class="dl-two"><b class="dl-num">${L.fmtDay(r.l.renew_at)}</b>${note}</span>`;
      };
      const STI = (k) => { const i = STATUS.findIndex(s => s[0] === k); return i < 0 ? 9 : i; };
      return {
        id: 'inzercia', storageKey: 'inzercia', label: 'Inzeráty',
        noun: ['inzerát', 'inzeráty', 'inzerátov'],
        rows,
        rowClick: (r) => Mkt.listingForm(r.id),
        rowClass: (r) => (r.l.status === 'expired' ? 'is-muted' : r.soon && r.left <= 0 ? 'is-hot' : r.soon || r.l.status === 'to_renew' ? 'is-warn' : ''),
        rowLabel: (r) => `Inzerát ${r.platform}`,
        rowActions: [{ ico: 'edit', label: 'Upraviť inzerát', run: (r) => Mkt.listingForm(r.id) }],
        columns: [
          { key: 'portal', label: 'Portál', width: 'minmax(170px, 1.5fr)', mobile: 'title',
            render: (r) => `<span class="dl-title"><b>${UI.esc(r.platform)}</b>${UI.safeUrl(r.l.url)
              ? `<small><a href="${UI.safeUrl(r.l.url)}" target="_blank" rel="noopener">otvoriť inzerát</a></small>` : ''}</span>`,
            sortValue: (r) => r.platform, csv: (r) => r.platform },
          { key: 'co', label: 'Čo', width: 'minmax(130px, 1.2fr)', mobileLabel: '',
            render: (r) => (r.l.listing_type || r.l.language ? `<span class="dl-two"><b>${UI.esc(r.l.listing_type || '—')}</b>${
              r.l.language ? `<small>${UI.esc(String(r.l.language).toUpperCase())}</small>` : ''}</span>` : ''),
            sortValue: (r) => r.l.listing_type || null, csv: (r) => r.l.listing_type || '' },
          { key: 'od', label: 'Uverejnené', width: '104px', hideBelow: 900, mobileLabel: 'od',
            render: (r) => (r.l.published_at ? `<span class="dl-num">${L.fmtDay(r.l.published_at)}</span>` : ''),
            sortValue: (r) => r.l.published_at || null, sortDir: -1, csv: (r) => r.l.published_at || '' },
          { key: 'obnova', label: 'Obnoviť do', width: '132px', mobileLabel: 'obnoviť',
            tip: 'Deň, keď inzerát na portáli vyprší alebo ho treba znova zaplatiť, a koľko dní ostáva. Týždeň predtým appka inzerát sama označí „Na obnovenie".',
            // Expirované na koniec, inak podľa dátumu — čo treba obnoviť najskôr, je hore.
            render: renewCell, sortValue: (r) => [r.l.status === 'expired' ? 1 : 0, r.l.renew_at || null], csv: (r) => r.l.renew_at || '' },
          { key: 'stav', label: 'Stav', width: '118px', mobile: 'badge',
            render: (r) => this.badge(r.l.status), sortValue: (r) => STI(r.l.status),
            csv: (r) => (STATUS.find(s => s[0] === r.l.status) || STATUS[0])[1] },
          { key: 'pozn', label: 'Ako sa osvedčil', width: 'minmax(140px, 1.4fr)', hideBelow: 1040, hideOnMobile: true,
            render: (r) => (r.l.performance_note ? `<span class="dl-note is-mute" title="${UI.esc(r.l.performance_note)}">${UI.esc(r.l.performance_note)}</span>` : ''),
            csv: (r) => r.l.performance_note || '' },
        ],
        sort: { key: 'obnova', dir: 1 },
        groups: [{ key: 'stav', label: 'Stav', value: (r) => r.l.status || 'active', labelOf: (k) => (STATUS.find(s => s[0] === k) || [k, k])[1],
          tone: (k) => ({ active: 'green', to_renew: 'amber', expired: 'gray' }[k] || 'gray'), order: STATUS.map(s => s[0]) }],
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať portál, typ, poznámku…', label: 'Hľadať portál, typ inzerátu alebo poznámku',
            fields: ['platform', 'l.listing_type', 'l.performance_note', 'l.url'] },
          { key: 'stav', type: 'multi', label: 'Stav', value: (r) => r.l.status || 'active', sortOptions: false, allLabel: 'Všetky',
            options: STATUS.map(s => [s[0], s[1]]),
            presets: [{ label: 'Bežiace', value: ['active', 'to_renew'], hint: 'Aktívne a na obnovenie — bez expirovaných' }],
            hint: 'Na obnovenie nastaví appka sama 7 dní pred dátumom „Obnoviť do". Expirovaný = inzerát skončil a už ho neobnovíte.' },
          { key: 'portal', type: 'select', label: 'Portál', value: (r) => r.l.platform, allLabel: 'Všetky portály',
            optionLabel: (v) => this.platformLabel(v), emptyLabel: 'Nezadaný' },
          { key: 'skoro', type: 'toggle', label: 'Obnoviť do 7 dní', test: (r) => r.soon,
            hint: 'Inzeráty, ktorým do dátumu „Obnoviť do" ostáva 7 dní alebo menej, aj tie po termíne (okrem expirovaných).' },
          { key: 'jazyk', type: 'select', label: 'Jazyk', value: (r) => (r.l.language ? String(r.l.language).toUpperCase() : ''),
            allLabel: 'Všetky jazyky', emptyLabel: 'Nezadaný', more: true },
          { key: 'obnova', type: 'range-date', label: 'Obnoviť do', field: 'l.renew_at', more: true },
          { key: 'od', type: 'range-date', label: 'Uverejnené', field: 'l.published_at', more: true },
        ],
        empty: { ico: 'marketing', title: 'Žiadne inzeráty', sub: 'Pridajte prvý inzerát a nastavte dátum obnovenia.',
          cta: `<button class="btn btn-primary" onclick="Mkt.listingForm()">${Icon('plus')} Pridať inzerát</button>` },
        export: {
          name: ['inzeraty'],
          columns: [
            ['Portál', r => r.platform], ['Typ', r => r.l.listing_type || ''], ['Jazyk', r => String(r.l.language || '').toUpperCase()],
            ['Stav', r => (STATUS.find(s => s[0] === r.l.status) || STATUS[0])[1]], ['Uverejnené', r => r.l.published_at || ''],
            ['Obnoviť do', r => r.l.renew_at || ''], ['Dní do obnovenia', r => r.left], ['Odkaz', r => r.l.url || ''],
            ['Ako sa osvedčil', r => r.l.performance_note || ''],
          ],
        },
      };
    },

    channelLabel(k) { return (CHANNELS.find(c => c[0] === k) || [, k])[1] || '—'; },

    expensesHtml() {
      return `<div class="mkt-sum" id="mkt-exp-sum" aria-live="polite"></div>`
        + DataList.html(this.expensesConfig(this.expenses.map(e => ({ id: e.id, e, channel: this.channelLabel(e.channel), amount: Number(e.amount) || 0 }))));
    },

    /** Súčet výdavkov, ktoré sú práve vidieť (po filtroch). */
    paintExpenseSum(rows) {
      const el = document.getElementById('mkt-exp-sum');
      if (!el) return;
      const list = rows || (window.DataList ? DataList.visible('vydavky') : []);
      const all = this.expenses.length;
      el.innerHTML = list.length ? `Spolu za ${list.length === all ? 'všetky výdavky' : `${list.length} z ${all} výdavkov`}: <b>${UI.money(list.reduce((a, r) => a + r.amount, 0))}</b>` : '';
    },

    /** Konfigurácia zoznamu výdavkov pre `DataList`. */
    expensesConfig(rows) {
      const L = DanubraDataList;
      return {
        id: 'vydavky', storageKey: 'vydavky', label: 'Výdavky',
        noun: ['výdavok', 'výdavky', 'výdavkov'],
        rows,
        rowLabel: (r) => `Výdavok ${r.channel} ${L.fmtDay(r.e.spent_at)}`,
        rowActions: [{ ico: 'archive', label: 'Archivovať výdavok', run: (r) => Mkt.delExpense(r.id) }],
        onChange: (state, visible) => this.paintExpenseSum(visible),
        columns: [
          { key: 'datum', label: 'Dátum', width: '110px', mobileLabel: '',
            render: (r) => `<span class="dl-num">${L.fmtDay(r.e.spent_at)}</span>`, sortValue: (r) => r.e.spent_at || null, sortDir: -1,
            csv: (r) => r.e.spent_at || '' },
          { key: 'kanal', label: 'Kanál', width: 'minmax(150px, 1fr)', mobile: 'title',
            render: (r) => `<span class="dl-title"><b>${UI.esc(r.channel)}</b></span>`, sortValue: (r) => r.channel },
          { key: 'pozn', label: 'Poznámka', width: 'minmax(160px, 2fr)', mobile: 'line',
            render: (r) => (r.e.note ? `<span class="dl-note is-mute">${UI.esc(r.e.note)}</span>` : ''), csv: (r) => r.e.note || '' },
          { key: 'suma', label: 'Suma', width: '110px', align: 'right', mobile: 'badge',
            render: (r) => `<b class="dl-num">${UI.money(r.amount)}</b>`, sortValue: (r) => r.amount, sortDir: -1 },
        ],
        sort: { key: 'datum', dir: -1 },
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať v poznámke…', label: 'Hľadať v poznámke alebo kanáli', fields: ['channel', 'e.note'] },
          { key: 'kanal', type: 'multi', label: 'Kanál', value: (r) => r.e.channel, sortOptions: false, allLabel: 'Všetky',
            options: CHANNELS.map(c => [c[0], c[1]]) },
          { key: 'datum', type: 'range-date', label: 'Obdobie', field: 'e.spent_at',
            hint: 'Podľa dátumu výdavku. „Tento mesiac" = to isté, čo sa ráta do mesačného rozpočtu.' },
          { key: 'suma', type: 'range-number', label: 'Suma', value: 'amount', unit: '€', more: true },
        ],
        empty: { ico: 'euro', title: 'Žiadne výdavky', sub: 'Zapíšte, koľko a kam ide marketingový rozpočet.',
          cta: `<button class="btn btn-primary" onclick="Mkt.expenseForm()">${Icon('plus')} Pridať výdavok</button>` },
        export: { name: ['marketing-vydavky'] },
      };
    },

    setTab(t) { this.tab = t; Danubra.renderRoute(); },

    listingForm(id) {
      const l = id ? this.listings.find(x => x.id === id) || {} : {};
      const body = `
        <form id="mkt-l-form" onsubmit="event.preventDefault();Mkt.saveListing('${id || ''}')">
          <div class="form-grid">
            ${UI.field('platform', 'Platforma', { value: l.platform, options: [['', '—'], ...PLATFORMS],
              tip: 'Portál, kde inzerát visí. Monteurzimmer = ubytovanie pre robotníkov, Auftragsbank, subunternehmen-gesucht a CoCrafter = zákazky od nemeckých firiem, profesia.sk = nábor ľudí.' })}
            ${UI.field('listing_type', 'Typ inzerátu', { value: l.listing_type, placeholder: 'ubytovanie, subdodávky, nábor…',
              tip: 'Na čo inzerát je — len pre Vašu orientáciu v zozname. Nikam sa neposiela.' })}
            ${UI.field('language', 'Jazyk', { value: l.language, options: [['', '—'], ['sk', 'SK'], ['cs', 'CS'], ['hu', 'HU'], ['de', 'DE']] })}
            ${UI.field('status', 'Stav', { value: l.status || 'active', options: STATUS.map(s => [s[0], s[1]]),
              tip: 'Na obnovenie nastaví appka sama 7 dní pred dátumom „Obnoviť do". Po obnovení na portáli vráťte stav na Aktívny a posuňte dátum. Expirovaný = inzerát skončil a už ho neobnovíte.' })}
            ${UI.field('published_at', 'Uverejnené', { type: 'date', value: l.published_at })}
            ${UI.field('renew_at', 'Obnoviť do', { type: 'date', value: l.renew_at,
              tip: 'Deň, keď inzerát na portáli vyprší alebo ho treba znova zaplatiť. Týždeň predtým sa objaví hore na tejto obrazovke ako „Obnoviť inzeráty".' })}
            <div class="fld-full">${UI.field('url', 'Odkaz', { type: 'url', value: l.url })}</div>
            <div class="fld-full">${UI.field('performance_note', 'Ako sa osvedčil', { type: 'textarea', rows: 2, value: l.performance_note,
              placeholder: 'Koľko dopytov priniesol, či sa oplatí obnoviť…' })}</div>
          </div>
          <div class="modal-actions">
            ${id ? `<button type="button" class="btn btn-danger" onclick="Mkt.delListing('${id}')">${Icon('archive', 14)} Archivovať</button>` : ''}
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Pridať'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť inzerát' : 'Nový inzerát', body, { wide: true });
    },

    async saveListing(id) {
      const d = UI.formData(document.getElementById('mkt-l-form'));
      const payload = { ...d };
      ['published_at', 'renew_at'].forEach(k => { if (payload[k] === '') payload[k] = null; });
      const res = id ? await DB.update('marketing_listings', id, payload) : await DB.insert('marketing_listings', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast(id ? 'Uložené' : 'Pridané', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    async delListing(id) {
      if (!await UI.confirmArchive('Presunúť tento inzerát do archívu?')) return;
      const { error } = await DB.archive('marketing_listings', id);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      this.listings = this.listings.filter(x => x.id !== id);
      UI.closeModal(); UI.toast(UI.ARCHIVED, 'ok'); Danubra.renderRoute();
    },

    expenseForm() {
      const body = `
        <form id="mkt-e-form" onsubmit="event.preventDefault();Mkt.saveExpense()">
          <div class="form-grid">
            ${UI.field('spent_at', 'Dátum', { type: 'date', value: new Date().toISOString().slice(0, 10), required: true,
              tip: 'Podľa dátumu sa výdavok zaráta do mesiaca — a teda do mesačného rozpočtu.' })}
            ${UI.field('channel', 'Kanál', { value: 'portal', options: CHANNELS,
              tip: 'Za čo peniaze išli: portál, platená reklama, odmena za odporúčanie… V zozname výdavkov potom vidíte, kam rozpočet ide.' })}
            ${UI.field('amount', 'Suma €', { type: 'number', required: true,
              tip: 'Celá suma, ktorú ste naozaj zaplatili, v eurách. Ráta sa do „Minuté tento mesiac" aj do rozpočtu.' })}
            <div class="fld-full">${UI.field('note', 'Poznámka', { type: 'textarea', rows: 2 })}</div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">Zapísať</button>
          </div>
        </form>`;
      UI.modal('Nový výdavok', body);
    },

    async saveExpense() {
      const d = UI.formData(document.getElementById('mkt-e-form'));
      if (!d.amount) return UI.toast('Zadajte sumu', 'err');
      const { error } = await DB.insert('marketing_expenses', {
        spent_at: d.spent_at, channel: d.channel, amount: Number(d.amount), note: d.note || null,
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal(); UI.toast('Zapísané', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    async delExpense(id) {
      if (!await UI.confirmArchive('Presunúť tento výdavok do archívu?')) return;
      const { error } = await DB.archive('marketing_expenses', id);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      this.expenses = this.expenses.filter(x => x.id !== id);
      UI.toast(UI.ARCHIVED, 'ok'); Danubra.renderRoute();
    },

    /** Nastavenia z jedného miesta — `Danubra.loadCfg()`. */
    async _settings() { return Danubra.loadCfg(); },
  };

  window.Mkt = Mkt;
  Danubra.views.marketing = function (el) { return Mkt.view(el); };
})();
