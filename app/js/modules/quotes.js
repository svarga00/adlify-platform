// ============================================================================
// DANUBRA — Ponuky
// ============================================================================
// Ponuka ukazuje maržu už pri písaní. v1 sa dalo zistiť, že sa na zákazke
// prerába, až z faktúr — teda o tri mesiace neskôr.
//
// Dve veci sú blokátory, nie odporúčania: záporná marža a sadzba pre
// živnostníka pod nemeckou minimálnou mzdou. Prvé je obchodná samovražda,
// druhé je pokuta.
//
// Logika je v lib/quotes.js a má testy.
// ============================================================================
(function () {
  const Quo = {
    items: [], partners: [], opportunities: [], loaded: false,

    async load() {
      const [q, p, o] = await Promise.all([
        DB.list('quotes', { order: { column: 'created_at', ascending: false }, limit: 300 }),
        DB.list('partners', { select: 'id,name,payment_terms_days,default_charge_rate,'
          // Do dokumentu treba aj nemecké IČ DPH a kontaktnú osobu.
          + 'is_construction,ust_idnr,country,contact_person,address,city', limit: 300 }),
        // Dopyty len kvôli názvu pri odkaze „Z dopytu" (migrácia 074).
        Danubra.can('opportunities')
          ? DB.list('opportunities', { select: 'id,title,company_name', limit: 1000 })
          : Promise.resolve({ data: [] }),
        Enums.load(),
      ]);
      this.items = q.data || []; this.partners = p.data || [];
      this.opportunities = (o && o.data) || [];
      this.loaded = true;
      if (!Cfg.loaded) await Cfg.load();
    },

    partnerName(id) {
      const p = this.partners.find(x => x.id === id);
      return p ? p.name : '—';
    },
    /**
     * Odkaz späť na dopyt, z ktorého ponuka vznikla. Keď na dopyty človek
     * nemá právo, je to len štítok — nie tlačidlo, ktoré nič nespraví.
     */
    oppLink(q) {
      if (!q || !q.opportunity_id) return '';
      const o = this.opportunities.find(x => x.id === q.opportunity_id);
      const label = o ? (o.title || o.company_name || 'Dopyt') : 'Dopyt';
      if (!window.Opp || !Danubra.routeAvailable('opportunities')) {
        return `<span class="link-chip is-static">${Icon('offers', 13)}<span>${UI.esc(label)}</span></span>`;
      }
      return `<button class="link-chip" title="Dopyt: ${UI.esc(label)}"
        onclick="Opp.detail('${UI.esc(q.opportunity_id)}')">${Icon('offers', 13)}<span>${UI.esc(label)}</span></button>`;
    },

    /** Prahy z Nastavení → Cenník a pravidlá. */
    thresholds() { return Cfg.j('staffing'); },

    // ── Zoznam ────────────────────────────────────────────────────────────
    // Spoločný komponent `DataList`. Dovtedy tu boli karty a jeden výber
    // stavu — ponuka po platnosti alebo so zápornou maržou sa v zozname
    // nedala nájsť inak než preklikaním.
    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const today = Danubra._dayISO();
      const rows = this.items.map(q => this.listRow(q, today));

      Danubra.setActions(
        `<button class="btn btn-primary btn-sm" onclick="Quo.form()">${Icon('plus')} Nová ponuka</button>`);
      el.innerHTML = Danubra.header(Danubra.labelOf('quotes'),
        'Marža je vidieť skôr, než ponuka odíde')
        + DataList.html(this.listConfig(rows));
    },

    /** Kompatibilita: nastaví filter zoznamu z kódu. */
    setF(k, v) {
      if (k === 'status') return DataList.set('ponuky', 'stav', v ? [v] : []);
      if (k === 'q') return DataList.set('ponuky', 'q', v || '');
      return undefined;
    },

    /** Stavy, s ktorými sa ešte pracuje — predvolený filter zoznamu. */
    OPEN_STATUSES: ['draft', 'sent'],

    /** Stavy v poradí, v akom ponuka ide. Názvy z číselníka, záloha tu. */
    STATUS: [['draft', 'Rozpracovaná'], ['sent', 'Odoslaná'], ['accepted', 'Prijatá'],
      ['rejected', 'Odmietnutá'], ['expired', 'Prepadla']],
    statusLabel(s) {
      const l = window.Enums ? Enums.label('quote_status', s) : '';
      return l && l !== s ? l : ((this.STATUS.find(x => x[0] === s) || [s, s])[1]);
    },

    /**
     * Riadok zoznamu. Kontrola (`DanubraQuotes.review`) je tá istá ako
     * v detaile ponuky — zoznam len ukazuje jej výsledok.
     */
    listRow(q, today) {
      const rev = DanubraQuotes.review(q, this.thresholds(), { today });
      const open = this.OPEN_STATUSES.includes(q.status);
      const valid = q.valid_until ? String(q.valid_until).slice(0, 10) : '';
      const left = valid ? DanubraDataList.daysBetween(today, valid) : null;
      const expired = open && left != null && left < 0;
      const blockers = rev.reasons;
      // Čo horí: odoslaná po platnosti (treba sa rozhodnúť), ponuka s chybou,
      // ktorá by nemala odísť, končiaca platnosť, koncept, ktorý čaká na
      // odoslanie, upozornenia. Uzavreté na koniec.
      let rank = 6;
      if (!open) rank = 9;
      else if (expired) rank = 0;
      else if (blockers.length) rank = 1;
      else if (left != null && left <= 7) rank = 2;
      else if (q.status === 'draft') rank = 3;
      else if (rev.warnings.length) rank = 4;
      return {
        id: q.id, q, rev, open, left, expired, rank, blockers,
        hot: rank <= 1, warn: open && (rank === 2 || rev.warnings.length > 0),
        problem: open && (expired || blockers.length > 0),
        title: q.title || q.quote_number || 'Ponuka',
        partner: q.partner_id ? this.partnerName(q.partner_id) : '',
        trade: q.trade_key && window.Wrk ? Wrk.professionLabel(q.trade_key) : (q.trade_key || ''),
        city: q.site_city || '',
        marza: rev.margin.perHour / 100,
      };
    },

    /** Konfigurácia zoznamu ponúk pre `DataList`. */
    listConfig(rows) {
      const L = DanubraDataList;
      const esc = UI.esc;
      const ST = this.STATUS.slice();
      for (const [k] of (window.Enums ? Enums.options('quote_status') : [])) {
        if (k && !ST.some(s => s[0] === k)) ST.push([k, this.statusLabel(k)]);
      }
      const statusIdx = (k) => { const i = ST.findIndex(s => s[0] === k); return i < 0 ? 99 : i; };
      const dni = (n) => `${n} ${Shell.plural(n, 'deň', 'dni', 'dní')}`;
      const rate = (n) => `${Number(n).toLocaleString('sk-SK', { maximumFractionDigits: 2 })} €/h`;

      const sadzbaCell = (r) => {
        const m = r.rev.margin;
        if (!r.q.charge_rate) return '<span class="dl-note is-red">bez sadzby</span>';
        const tone = m.perHour < 0 ? 'is-red' : r.rev.warnings.some(w => /margin|below_target/.test(w.rule)) ? 'is-amber' : 'is-green';
        return `<span class="dl-two" title="${esc(m.perMonth ? `${Money.format(m.perMonth)} mesačne pri ${r.q.headcount || 1} ľuďoch a ${r.q.hours_per_month || 0} h` : '')}">
          <b class="dl-num">${esc(rate(r.q.charge_rate))}</b>
          <span class="dl-note ${tone}">marža ${esc(Money.format(m.perHour))}/h${m.pct != null ? ` · ${esc(UI.pct(Math.round(m.pct)))}` : ''}</span></span>`;
      };
      const platiCell = (r) => {
        if (!r.q.valid_until) return r.open ? '<span class="dl-note is-amber">bez platnosti</span>' : '';
        let note = '';
        if (r.open && r.left != null) {
          if (r.left < 0) note = `<span class="dl-note is-red">po platnosti ${dni(-r.left)}</span>`;
          else if (r.left === 0) note = '<span class="dl-note is-amber">platí len dnes</span>';
          else if (r.left <= 30) note = `<span class="dl-note ${r.left <= 7 ? 'is-amber' : 'is-mute'}">ešte ${dni(r.left)}</span>`;
        }
        return `<span class="dl-two"><b>${L.fmtDay(r.q.valid_until)}</b>${note}</span>`;
      };
      const kontrolaCell = (r) => {
        if (!r.open) {
          if (r.q.status === 'rejected' && r.q.reject_reason) {
            return `<span class="dl-note is-mute" title="${esc(r.q.reject_reason)}">${esc(r.q.reject_reason)}</span>`;
          }
          return r.q.decided_at ? `<span class="dl-note is-mute">${L.fmtDay(r.q.decided_at)}</span>` : '';
        }
        if (r.blockers.length) {
          const why = r.blockers.map(b => b.label).join(' · ');
          return `<button type="button" class="tip-btn dl-flag" data-tip="${esc(why)}" aria-label="Chyby: ${esc(why)}">${
            Icon('alert', 12)} ${r.blockers.length} ${Shell.plural(r.blockers.length, 'chyba', 'chyby', 'chýb')}</button>`;
        }
        if (r.rev.warnings.length) {
          const why = r.rev.warnings.map(w => w.label).join(' · ');
          return `<button type="button" class="tip-btn dl-flag is-amber" data-tip="${esc(why)}" aria-label="Upozornenia: ${esc(why)}">${
            r.rev.warnings.length} ${Shell.plural(r.rev.warnings.length, 'upozornenie', 'upozornenia', 'upozornení')}</button>`;
        }
        return `<span class="dl-ok">${Icon('check', 13)} v poriadku</span>`;
      };

      return {
        id: 'ponuky', storageKey: 'ponuky', label: 'Ponuky',
        noun: ['ponuka', 'ponuky', 'ponúk'],
        rows,
        rowClick: (r) => Quo.detail(r.id),
        rowClass: (r) => (r.hot ? 'is-hot' : r.warn ? 'is-warn' : !r.open ? 'is-muted' : ''),
        rowLabel: (r) => `Ponuka ${r.title}`,
        rowActions: [{ ico: 'chevron', label: 'Otvoriť ponuku', run: (r) => Quo.detail(r.id) }],
        columns: [
          { key: 'ponuka', label: 'Ponuka', width: 'minmax(170px, 1.6fr)', mobile: 'title',
            render: (r) => `<span class="dl-title"><b>${esc(r.title)}</b><small>${
              [r.q.quote_number, r.city].filter(Boolean).map(esc).join(' · ')}</small></span>`,
            sortValue: (r) => r.title, sortLabel: 'Názov' },
          { key: 'odberatel', label: 'Odberateľ', width: 'minmax(124px, 1fr)',
            render: (r) => (r.q.partner_id ? Danubra.link('partner', r.q.partner_id, r.partner) : '<span class="dl-note is-red">bez odberateľa</span>'),
            sortValue: (r) => r.partner },
          { key: 'remeslo', label: 'Remeslo · ľudia', width: '124px', hideBelow: 980,
            render: (r) => `<span class="dl-two">${r.trade ? `<b>${esc(r.trade)}</b>` : '<b class="opp-none">remeslo?</b>'}<small>${
              r.q.headcount || 1} ${Shell.plural(Number(r.q.headcount) || 1, 'človek', 'ľudia', 'ľudí')} · ${r.q.work_type === 'workshop' ? 'dielňa' : 'stavba'}</small></span>`,
            sortValue: (r) => r.trade },
          { key: 'sadzba', label: 'Sadzba · marža', width: '150px', mobileLabel: 'sadzba',
            tip: 'Hore sadzba, ktorú fakturujeme odberateľovi za hodinu (bez DPH). Dole marža na hodinu po odpočítaní živnostníka a réžie, a jej percento z fakturovanej sumy. Mesačnú maržu ukáže myš.',
            render: sadzbaCell, sortValue: (r) => r.rev.margin.perHour, sortDir: -1, sortLabel: 'Marža' },
          { key: 'plati', label: 'Platí do', width: '118px', mobileLabel: 'platí do', render: platiCell,
            sortValue: (r) => r.q.valid_until || null },
          { key: 'stav', label: 'Stav', width: '108px', mobile: 'badge',
            render: (r) => UI.badge(this.statusLabel(r.q.status), this.statusKind(r.q.status)),
            sortValue: (r) => statusIdx(r.q.status) },
          { key: 'kontrola', label: 'Kontrola', width: '128px',
            tip: 'Kontrola pred odoslaním: chyba (červená) = ponuka by nemala odísť — záporná marža, sadzba pod minimálnou mzdou, chýba sadzba. Upozornenie (oranžová) = tenká marža, nulová réžia, chýba platnosť. Ukážte myšou na štítok.',
            render: kontrolaCell,
            sortValue: (r) => [r.rank, r.rank <= 2 ? (r.q.valid_until || '') : '', r.title], sortLabel: 'Čo horí' },
        ],
        sorts: [{ key: 'vytvorena', label: 'Vytvorená', value: (r) => r.q.created_at, dir: -1 }],
        sort: { key: 'kontrola', dir: 1 },
        groups: [
          { key: 'stav', label: 'Stav', value: (r) => r.q.status, labelOf: (k) => this.statusLabel(k), order: ST.map(s => s[0]),
            tone: (k) => ({ draft: 'gray', sent: 'blue', accepted: 'green', rejected: 'red', expired: 'amber' }[k] || 'gray') },
          { key: 'odberatel', label: 'Odberateľ', value: 'partner', emptyLabel: 'Bez odberateľa' },
        ],
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať ponuku…', label: 'Hľadať názov, číslo, odberateľa, mesto alebo remeslo',
            fields: ['title', 'q.quote_number', 'partner', 'city', 'trade', 'q.site_address', 'q.notes'] },
          { key: 'stav', type: 'multi', label: 'Stav', value: (r) => r.q.status, default: this.OPEN_STATUSES,
            options: ST, sortOptions: false, allLabel: 'Všetky',
            presets: [
              { label: 'Otvorené', value: this.OPEN_STATUSES, hint: 'Rozpracované a odoslané — čakajú na nás alebo na odberateľa' },
              { label: 'Uzavreté', value: ['accepted', 'rejected', 'expired'], hint: 'Prijaté, odmietnuté a prepadnuté' },
            ] },
          { key: 'odberatel', type: 'select', label: 'Odberateľ', value: (r) => r.q.partner_id,
            optionLabel: (v, r) => (r ? r.partner : v), emptyLabel: 'Bez odberateľa', allLabel: 'Všetci odberatelia' },
          { key: 'remeslo', type: 'select', label: 'Remeslo', value: (r) => r.q.trade_key,
            optionLabel: (v, r) => (r ? r.trade : v), emptyLabel: 'Nezadané', allLabel: 'Všetky remeslá' },
          { key: 'po_platnosti', type: 'toggle', label: 'Po platnosti', test: (r) => r.expired,
            hint: 'Rozpracované a odoslané ponuky, ktorým už uplynul dátum „Platí do". Treba ich označiť ako prepadnuté alebo poslať znova s novou platnosťou.' },
          { key: 'problem', type: 'toggle', label: 'Len s problémom', more: true, test: (r) => r.problem,
            hint: 'Otvorené ponuky po platnosti alebo s chybou, pre ktorú by nemali odísť (záporná marža, sadzba pod minimálnou mzdou, chýba sadzba).' },
          { key: 'typ', type: 'select', label: 'Typ prác', value: (r) => (r.q.work_type === 'workshop' ? 'workshop' : 'construction'),
            options: [['construction', 'Stavebné'], ['workshop', 'Dielenské']], allLabel: 'Stavebné aj dielenské', more: true },
          { key: 'mesto', type: 'select', label: 'Mesto', value: 'city', emptyLabel: 'Bez mesta', allLabel: 'Všetky mestá', more: true },
          { key: 'plati', type: 'range-date', label: 'Platí do', field: 'q.valid_until', more: true },
          { key: 'obdobie', type: 'range-date', label: 'Termín prác', start: 'q.date_from', end: 'q.date_to', more: true,
            hint: 'Ponuky, ktorých termín nasadenia sa prekrýva so zvoleným obdobím. Ponuka bez termínu sa neukáže.' },
          { key: 'marza', type: 'range-number', label: 'Marža €/h', value: 'marza', unit: '€', more: true },
        ],
        empty: { ico: 'offers', title: 'Zatiaľ žiadna ponuka',
          sub: 'Ponuka je prvý krok — z prijatej sa spraví zmluva. Vytvoríte ju tu alebo z dopytu.',
          cta: `<button class="btn btn-primary" onclick="Quo.form()">${Icon('plus')} Nová ponuka</button>` },
        export: {
          name: ['ponuky'],
          columns: [
            ['Číslo', r => r.q.quote_number], ['Ponuka', r => r.title], ['Odberateľ', r => r.partner],
            ['Remeslo', r => r.trade], ['Ľudí', r => r.q.headcount || 1],
            ['Typ prác', r => (r.q.work_type === 'workshop' ? 'Dielenské' : 'Stavebné')], ['Mesto', r => r.city],
            ['Sadzba €/h', r => r.q.charge_rate], ['Živnostníkovi €/h', r => r.q.worker_rate], ['Réžia €/h', r => r.q.overhead_per_hour],
            ['Marža €/h', r => r.marza], ['Marža %', r => r.rev.margin.pct], ['Marža mesačne €', r => r.rev.margin.perMonth / 100],
            ['Platí do', r => r.q.valid_until], ['Stav', r => this.statusLabel(r.q.status)],
            ['Kontrola', r => [...r.blockers, ...r.rev.warnings].map(x => x.label).join('; ')],
          ],
        },
      };
    },

    statusKind(s) {
      return { draft: 'gray', sent: 'blue', accepted: 'green',
        rejected: 'red', expired: 'amber' }[s] || 'gray';
    },

    detail(id) {
      const q = this.items.find(x => x.id === id);
      if (!q) return UI.toast('Nenájdené', 'err');
      const today = new Date().toISOString().slice(0, 10);
      const rev = DanubraQuotes.review(q, this.thresholds(), { today });
      const m = rev.margin;

      const nextStates = (DanubraQuotes.FLOW[q.status] || []);
      const actionBtn = (to) => {
        const label = { sent: 'Označiť ako odoslanú', accepted: 'Odberateľ prijal',
          rejected: 'Odberateľ odmietol', expired: 'Prepadla' }[to];
        const kind = to === 'accepted' ? 'btn-primary' : 'btn-outline';
        return `<button class="btn ${kind}" onclick="Quo.setStatus('${q.id}','${to}')">${label}</button>`;
      };
      // Hlavný krok (prijatie) je v päte posledný, ostatné pred ním.
      const kroky = nextStates.slice().sort((a, b) => (a === 'accepted') - (b === 'accepted'));

      const body = `
        <div class="detail-head">
          ${UI.badge(this.statusLabel(q.status), this.statusKind(q.status))}
          ${q.quote_number ? `<span class="mono doc-no">${UI.esc(q.quote_number)}</span>` : ''}
        </div>

        <div class="form-section">Marža</div>
        ${Shell.sums({
          lines: DanubraQuotes.sumLines(q),
          totalLabel: 'Zostane nám na hodinu',
          note: m.perMonth
            ? `Pri ${q.headcount || 1} ${DanubraQuotes.plural(q.headcount || 1, 'človeku', 'ľuďoch', 'ľuďoch')} `
              + `a ${q.hours_per_month || 0} hodinách mesačne to je ${Money.format(m.perMonth)} `
              + `mesačne${m.pct != null ? `, teda ${UI.pct(m.pct)} z fakturovanej sumy` : ''}.`
            : '',
        })}

        ${(rev.reasons.length || rev.warnings.length) ? `
          <div class="form-section">Pred odoslaním</div>
          ${Shell.blocker({ reasons: [...rev.reasons, ...rev.warnings] })}`
          : `<div class="regimebox">Ponuka je v poriadku — marža sedí
             a sadzba je nad minimálnou mzdou.</div>`}

        <div class="kv">
          <div><span>Odberateľ</span><strong>${UI.esc(this.partnerName(q.partner_id))}</strong></div>
          ${q.trade_key ? `<div><span>Remeslo</span><strong>${UI.esc(Wrk.professionLabel(q.trade_key))}</strong></div>` : ''}
          <div><span>Ľudí</span><strong>${q.headcount || 1}</strong></div>
          <div><span>Typ prác${UI.tip('Stavebné = práca na stavenisku, platia prísnejšie pravidlá (SOKA-BAU, zrážka §48b, stavebná minimálna mzda). Dielenské = výroba mimo stavby, regulácia je nižšia.')}</span><strong>${q.work_type === 'workshop' ? 'Dielenské' : 'Stavebné'}</strong></div>
          ${q.site_city ? `<div><span>Miesto</span><strong>${UI.esc([q.site_address, q.site_city].filter(Boolean).join(', '))}</strong></div>` : ''}
          ${q.date_from ? `<div><span>Termín</span><strong>${UI.dateRange(q.date_from, q.date_to)}</strong></div>` : ''}
          ${q.opportunity_id ? `<div><span>Z dopytu${UI.tip('Ponuka vznikla tlačidlom „Spraviť ponuku" pri tomto dopyte. Pri dopyte je vidieť, aké ponuky z neho vznikli a v akom sú stave.')}</span><strong>${this.oppLink(q)}</strong></div>` : ''}
          ${q.valid_until ? `<div><span>Platí do${UI.tip('Do tohto dňa je odberateľ viazaný na naše ceny. Potom ponuka prepadne a dá sa poslať znova s novou platnosťou.')}</span><strong>${UI.date(q.valid_until)}</strong></div>` : ''}
        </div>
        ${q.notes ? `<div class="notebox">${UI.esc(q.notes)}</div>` : ''}
        ${q.reject_reason ? `<div class="warnbox">
          ${Icon('alert', 14)} Odmietnuté: ${UI.esc(q.reject_reason)}</div>` : ''}

        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          <span style="align-self:center;display:inline-flex;">${UI.tip([
            'Angebot (PDF) = ponuka po nemecky na tlač; v okne tlače vyberte „Uložiť ako PDF".',
            kroky.includes('sent') ? 'Označiť ako odoslanú = zapíše sa dátum odoslania. Nedá sa, kým má ponuka vážnu chybu (napr. zápornú maržu alebo sadzbu pod minimálnou mzdou).' : '',
            kroky.includes('accepted') ? 'Prijal / odmietol / prepadla = odpoveď odberateľa; pri odmietnutí sa appka spýta prečo.' : '',
            q.status === 'accepted' ? 'Spraviť zmluvu = otvorí sa nová zmluva predvyplnená z tejto ponuky.' : '',
          ].filter(Boolean).join(' '))}</span>
          <button class="btn btn-outline" onclick="Quo.document('${q.id}')">
            ${Icon('doc', 14)} Angebot (PDF)</button>
          <button class="btn btn-outline" onclick="Quo.form('${q.id}')">Upraviť</button>
          ${kroky.map(actionBtn).join('')}
          ${q.status === 'accepted' ? `
            <button class="btn btn-primary" onclick="Quo.toContract('${q.id}')">
              ${Icon('note', 14)} Spraviť zmluvu</button>` : ''}
        </div>`;
      UI.modal(q.title, body, { wide: true });
    },

    /**
     * Ponuka ako dokument — po nemecky, lebo ju číta a rozhoduje sa podľa nej
     * odberateľ. PDF sa robí tlačou prehliadača: v dialógu treba vybrať
     * „Uložiť ako PDF". Bez knižnice, rovnako ako pri faktúre.
     */
    document(id) {
      const q = this.items.find(x => x.id === id);
      if (!q) return UI.toast('Nenájdené', 'err');
      if (!Danubra.supplierReady('Ponuka')) return;
      const supplier = Danubra.supplier();
      const partner = this.partners.find(p => p.id === q.partner_id) || {};

      const html = window.DanubraPapers.quote({
        quote: q,
        // Odberateľ má v dokumente nemecké označenie IČ DPH.
        client: { name: partner.name, vat_id: partner.ust_idnr,
          country: partner.country || 'DE', contact_person: partner.contact_person },
        supplier,
        trade: q.trade_key ? Wrk.professionLabel(q.trade_key) : null,
        note: q.notes || null,
      });
      Docs.show(window.open('', '_blank'), html, { kind: 'angebot', title: 'Angebot',
        number: q.quote_number, who: partner.name, lang: 'de', partner_id: q.partner_id || null,
        subcontract_id: q.subcontract_id || null });
    },

    async setStatus(id, to) {
      const q = this.items.find(x => x.id === id);
      if (!q) return;
      if (!DanubraQuotes.canGo(q.status, to)) {
        return UI.toast(`Z „${this.statusLabel(q.status)}" sa nedá prejsť ďalej`, 'err');
      }
      // Ponuku, na ktorej sa prerába alebo je pod minimálnou mzdou, nemá
      // zmysel poslať — a hlavne sa to nemá dať prehliadnuť.
      if (to === 'sent') {
        const rev = DanubraQuotes.review(q, this.thresholds());
        if (!rev.ok) {
          return UI.toast(rev.reasons[0].label, 'err');
        }
      }
      const patch = { status: to };
      if (to === 'sent') patch.sent_at = new Date().toISOString();
      if (['accepted', 'rejected'].includes(to)) patch.decided_at = new Date().toISOString();
      if (to === 'rejected') {
        const why = await UI.ask('Prečo odmietol? (hodí sa o pol roka)');
        if (why) patch.reject_reason = why;
      }
      const { error } = await DB.update('quotes', id, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      Object.assign(q, patch);
      UI.toast('Stav uložený', 'ok');
      this.detail(id);
    },

    /**
     * Nová ponuka odkiaľkoľvek — z prehľadu (rýchla akcia) aj z dopytu.
     * Prepne na Ponuky, počká na odberateľov (bez nich by bol výber prázdny)
     * a otvorí rovno formulár, nie zoznam.
     *
     * `pre` = predvyplnené polia (napr. z `DanubraOpp.toQuote`).
     */
    async create(pre) {
      UI.closeModal();
      if (Danubra.route !== 'quotes') Danubra.go('quotes');
      if (!this.loaded) await this.load();
      this.form(null, pre || {});
    },

    form(id, pre) {
      const q = id ? this.items.find(x => x.id === id) || {} : { ...(pre || {}) };
      const body = `
        <form id="quo-form" onsubmit="event.preventDefault();Quo.save('${id || ''}')">
          ${!id && pre && pre._fromOpp ? `<div class="regimebox">
            ${Icon('offers', 14)} Predvyplnené z dopytu — skontrolujte sadzby a doplňte réžiu.${UI.tip('Z dopytu sa prenieslo, čo v ňom bolo zapísané: odberateľ, remeslo, počet ľudí, mesto, termín a sadzby. Čo v dopyte chýbalo, ostalo prázdne. Ponuka sa uloží ako koncept — nikam sa neodošle sama.')}</div>` : ''}
          ${q.opportunity_id ? `<input type="hidden" name="opportunity_id" value="${UI.esc(q.opportunity_id)}">` : ''}
          ${!id && pre && pre._company && !pre.partner_id ? `<div class="warnbox">
            ${Icon('alert', 14)} Firma „${UI.esc(pre._company)}" z dopytu ešte nie je medzi odberateľmi. Pridajte ju tlačidlom „+" pri poli Odberateľ.</div>` : ''}
          <div class="form-grid">
            ${UI.field('title', 'Názov ponuky', { value: q.title, required: true,
              placeholder: 'napr. Sadrokartón — Leipzig, 4 ľudia' })}
            ${UI.field('partner_id', 'Odberateľ', { value: q.partner_id, required: true, add: 'partner',
              options: [['', '— vyberte —'], ...this.partners.map(p => [p.id, p.name])] })}
            ${UI.field('trade_key', 'Remeslo', { value: q.trade_key, add: 'trade',
              options: [['', '—'], ...Wrk.professions()] })}
            ${UI.field('headcount', 'Koľko ľudí', { type: 'number', value: q.headcount ?? 1 })}
            ${UI.field('work_type', 'Typ prác', { value: q.work_type || 'construction',
              options: [['construction', 'Stavebné (SOKA, §48b, Bau-Mindestlohn)'],
                        ['workshop', 'Dielenské (nižšia regulácia)']],
              tip: 'SOKA = nemecká stavebná pokladnica, kam sa platia príspevky. §48b = stavebná daň: odberateľ si z faktúry strhne 15 %, ak nemáme platné potvrdenie o oslobodení (Freistellungsbescheinigung). Bau-Mindestlohn = minimálna hodinová mzda v stavebníctve.',
              hint: 'Stavba znamená vyššie odvody aj zrážku 15 % z faktúry. Pri '
                + 'rovnakej sadzbe je z nej podstatne menšia marža než z dielne.' })}
            ${UI.field('site_city', 'Mesto', { value: q.site_city })}
            ${UI.field('site_address', 'Adresa stavby', { value: q.site_address })}
            ${UI.field('date_from', 'Od', { type: 'date', value: q.date_from })}
            ${UI.field('date_to', 'Do', { type: 'date', value: q.date_to })}
            ${UI.field('valid_until', 'Ponuka platí do', { type: 'date', value: q.valid_until,
              hint: 'Po tomto dni ponuka prepadne a na prehľade sa to zobrazí ako '
                + 'červené. Bez platnosti sa o pol roka niekto odvolá na sadzbu, '
                + 'ktorá už neplatí.' })}
          </div>

          <div class="form-section">Peniaze</div>
          <div class="regimebox">
            Réžia je ubytovanie, doprava a všetko ostatné prepočítané na hodinu.
            Keď ju necháte na nule, marža bude vyzerať lepšie, než je.</div>
          <div class="form-grid">
            ${UI.field('charge_rate', 'Fakturujeme €/h', { type: 'number', value: q.charge_rate,
              hint: 'Sadzba bez DPH, ktorú uvidí odberateľ v ponuke aj na faktúre.' })}
            ${UI.field('worker_rate', 'Živnostníkovi €/h', { type: 'number', value: q.worker_rate,
              hint: 'Čo zaplatíme jemu. Na stavbe musí byť aspoň Bau-Mindestlohn — '
                + 'pod ním to databáza pustí len s výnimkou.' })}
            ${UI.field('overhead_per_hour', 'Réžia €/h', { type: 'number', value: q.overhead_per_hour ?? 0,
              hint: 'Ubytovanie, doprava a réžia prepočítané na hodinu. Na nule '
                + 'vyjde marža vyššia, než aká naozaj je.' })}
            ${UI.field('hours_per_month', 'Hodín na človeka/mesiac', { type: 'number',
              value: q.hours_per_month ?? 168,
              hint: '168 je bežný mesiac. Z tohto čísla sa počíta mesačná marža '
                + 'v ponuke — nie je to záväzok odpracovať ich.' })}
          </div>
          <div id="quo-live"></div>

          ${UI.field('notes', 'Poznámka', { type: 'textarea', value: q.notes })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Vytvoriť'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť ponuku' : 'Nová ponuka', body, { wide: true });
      // Marža sa prepočítava pri písaní — inak by sa zlá sadzba zistila
      // až po uložení.
      const form = document.getElementById('quo-form');
      const live = () => this.renderLive();
      ['charge_rate', 'worker_rate', 'overhead_per_hour', 'hours_per_month', 'headcount', 'work_type']
        .forEach(n => { const el = form.querySelector(`[name="${n}"]`); if (el) el.addEventListener('input', live); });
      live();
    },

    /** Živý prepočet marže vo formulári. */
    renderLive() {
      const box = document.getElementById('quo-live');
      if (!box) return;
      const d = UI.formData(document.getElementById('quo-form'));
      const rev = DanubraQuotes.review({ ...d, partner_id: d.partner_id || 'x' },
        this.thresholds());
      box.innerHTML = Shell.sums({
        lines: DanubraQuotes.sumLines(d), compact: true,
        totalLabel: 'Zostane nám na hodinu',
        note: rev.margin.perMonth ? `${Money.format(rev.margin.perMonth)} mesačne` : '',
      }) + (rev.reasons.length || rev.warnings.length
        ? Shell.blocker({ reasons: [...rev.reasons.filter(r => r.rule !== 'quote_no_partner'),
                                    ...rev.warnings] })
        : '');
    },

    async save(id) {
      const d = UI.formData(document.getElementById('quo-form'));
      if (!d.title) return UI.toast('Názov je povinný', 'err');
      if (!d.partner_id) return UI.toast('Vyberte odberateľa', 'err');
      const payload = { ...d };
      ['charge_rate', 'worker_rate', 'overhead_per_hour', 'hours_per_month', 'headcount']
        .forEach(k => { payload[k] = d[k] === '' ? null : Number(d[k]); });
      ['date_from', 'date_to', 'valid_until']
        .forEach(k => { if (payload[k] === '') payload[k] = null; });

      if (!id) {
        try {
          payload.quote_number = await this.nextNumber();
        } catch (e) {
          return UI.toast('Nepodarilo sa prideliť číslo ponuky: ' + e.message, 'err');
        }
        payload.status = 'draft';
      }
      const res = id ? await DB.update('quotes', id, payload) : await DB.insert('quotes', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast(id ? 'Uložené' : 'Ponuka vytvorená', 'ok');
      this.loaded = false; await this.load(); Danubra.renderRoute();
    },

    /**
     * PON-2026-0001. Číslo prideľuje databáza transakčne (`danubra_next_number`),
     * nie prehliadač — inak by pri dvoch ľuďoch naraz vznikla diera alebo
     * duplicita. Rad sa vynuluje pri zmene roka.
     */
    async nextNumber() {
      const { data, error } = await DB.client.rpc('danubra_next_number', { p_kind: 'quote' });
      if (error) throw error;
      return data;
    },

    /** Z prijatej ponuky sa spraví zmluva. Predmet diela sa dopisuje ručne. */
    async toContract(id) {
      const q = this.items.find(x => x.id === id);
      if (!q) return;
      UI.closeModal();
      Danubra.go('contracts');
      setTimeout(() => Con.form(null, DanubraQuotes.toContract(q)), 300);
    },
  };

  window.Quo = Quo;
  Danubra.views.quotes = function (el) { return Quo.view(el); };
})();
