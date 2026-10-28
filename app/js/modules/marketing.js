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
    },

    listingsHtml() {
      if (!this.listings.length) {
        return UI.empty('marketing', 'Žiadne inzeráty', 'Pridajte prvý inzerát a nastavte dátum obnovenia.',
          `<button class="btn btn-primary" onclick="Mkt.listingForm()">${Icon('plus')} Pridať inzerát</button>`);
      }
      return `<div class="cards">${this.listings.map(l => `
        <div class="acc-card card" role="button" tabindex="0" onclick="Mkt.listingForm('${l.id}')">
          <div class="acc-card-head">
            <div>
              <div class="acc-name">${UI.esc(this.platformLabel(l.platform))}</div>
              <div class="acc-loc">${UI.esc(l.listing_type || '')}${l.language ? ` · ${l.language.toUpperCase()}` : ''}</div>
            </div>
            ${this.badge(l.status)}
          </div>
          <div class="acc-meta">
            ${l.published_at ? `<span>${Icon('calendar', 14)} od ${UI.date(l.published_at)}</span>` : ''}
            ${l.renew_at ? `<span style="${l.status === 'to_renew' ? 'color:var(--amber);font-weight:700;' : ''}">
              ${Icon('repeat', 14)} obnoviť ${UI.date(l.renew_at)}</span>` : ''}
            ${UI.safeUrl(l.url) ? `<a href="${UI.safeUrl(l.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">otvoriť</a>` : ''}
          </div>
          ${l.performance_note ? `<div style="font-size:12px;color:var(--ink-sub);margin-top:6px;">${UI.esc(l.performance_note)}</div>` : ''}
        </div>`).join('')}</div>`;
    },

    expensesHtml() {
      if (!this.expenses.length) {
        return UI.empty('euro', 'Žiadne výdavky', 'Zapíšte, koľko a kam ide marketingový rozpočet.',
          `<button class="btn btn-primary" onclick="Mkt.expenseForm()">${Icon('plus')} Pridať výdavok</button>`);
      }
      return this.expenses.map(e => `
        <div class="list-row">
          <span style="flex:1;font-size:13px;">
            <strong>${UI.esc((CHANNELS.find(c => c[0] === e.channel) || [, e.channel])[1] || '—')}</strong>
            <span style="color:var(--ink-mute);"> · ${UI.date(e.spent_at)}</span>
            ${e.note ? `<span style="color:var(--ink-mute);display:block;font-size:12px;">${UI.esc(e.note)}</span>` : ''}
          </span>
          <strong style="font-variant-numeric:tabular-nums;">${UI.money(e.amount)}</strong>
          <button class="btn btn-ghost btn-sm" style="color:var(--red);" title="Archivovať výdavok" aria-label="Archivovať výdavok" onclick="Mkt.delExpense('${e.id}')">${Icon('archive', 15)}</button>
        </div>`).join('');
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
