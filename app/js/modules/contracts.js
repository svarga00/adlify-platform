// ============================================================================
// DANUBRA — Zmluvy a dodatky
// ============================================================================
// Tvrdé pravidlo zo zadania: **zmena koncového dátumu alebo sadzby na
// podpísanej zmluve = záznam dodatku.** Drží to trigger v databáze
// (migrácia 016), nie táto obrazovka — zmluvu môže zmeniť aj import alebo
// ručný `update`. Formulár preto chránené polia na podpísanej zmluve vôbec
// needituje a odkáže na dodatok.
//
// Predmet diela sa píše ako dielo, nie ako hodiny. Pri kontrole rozhoduje
// obsah zmluvy, nie jej názov — hodinová formulácia je jeden zo znakov
// skrytej Arbeitnehmerüberlassung.
// ============================================================================
(function () {
  // Polia, ktoré po podpise chráni trigger. Zoznam sedí s migráciou 036 —
  // keby sa rozišiel, appka by ponúkla úpravu, ktorú databáza odmietne.
  const LOCKED = [
    ['date_to', 'Koniec platnosti'],
    ['charge_rate', 'Fakturovaná sadzba'],
    ['fixed_price', 'Pevná cena za dielo'],
    ['unit_price', 'Cena za jednotku'],
    ['retention_pct', 'Zádržné'],
  ];

  const Con = {
    items: [], amendments: [], partners: [], loaded: false,

    async load() {
      const [c, a, p] = await Promise.all([
        DB.list('contracts', { order: { column: 'created_at', ascending: false }, limit: 300 }),
        DB.list('contract_amendments', { limit: 1000 }),
        DB.list('partners', { select: 'id,name,payment_terms_days', limit: 300 }),
        Enums.load(),
      ]);
      this.items = c.data || []; this.amendments = a.data || []; this.partners = p.data || [];
      this.loaded = true;
      if (!Cfg.loaded) await Cfg.load();
    },

    partnerName(id) {
      const p = this.partners.find(x => x.id === id);
      return p ? p.name : '—';
    },
    amendmentsOf(id) {
      return this.amendments.filter(a => a.contract_id === id)
        .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
    },
    /** Po podpise sa chránené polia menia len cez dodatok. */
    isLocked(c) { return !['draft', 'sent'].includes(c.status); },

    /**
     * Cena jednou vetou. Zmluva môže mať pevnú cenu, cenu za jednotku alebo
     * hodinovú sadzbu — vypísať všetky tri stĺpce by znamenalo, že dve
     * z nich sú vždy prázdne a človek háda, ktorá platí.
     */
    priceText(c) {
      const m = c.price_model || 'hourly';
      if (m === 'fixed') {
        return c.fixed_price
          ? `${Money.format(Money.toCents(c.fixed_price))} za dielo`
          : 'pevná cena — nevyplnená';
      }
      if (m === 'unit') {
        return c.unit_price
          ? `${Money.format(Money.toCents(c.unit_price))} / ${UI.esc(c.unit_label || 'jednotka')}`
          : 'za jednotku — nevyplnená';
      }
      return c.charge_rate
        ? `${Money.format(Money.toCents(c.charge_rate))} / h`
        : 'hodinová — nevyplnená';
    },
    statusKind(s) {
      return { draft: 'gray', sent: 'blue', signed: 'green', active: 'green',
        ended: 'gray', cancelled: 'red' }[s] || 'gray';
    },

    // ── Zoznam ────────────────────────────────────────────────────────────
    // Spoločný komponent `DataList`. Dovtedy tu boli karty a výber stavu —
    // zmluva, ktorej sa blíži koniec platnosti alebo už skončila a ľudia
    // stále robia, sa v zozname nedala nájsť.
    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const today = Danubra._dayISO();
      const rows = this.items.map(c => this.listRow(c, today));

      Danubra.setActions(
        `<button class="btn btn-primary btn-sm" onclick="Con.form()">${Icon('plus')} Nová zmluva</button>`);
      el.innerHTML = Danubra.header(Danubra.labelOf('contracts'),
        'Dohodnuté podmienky sa neprepisujú — menia sa dodatkom')
        + DataList.html(this.listConfig(rows));
    },

    /** Kompatibilita: nastaví filter zoznamu z kódu. */
    setF(k, v) {
      if (k === 'status') return DataList.set('zmluvy', 'stav', v ? [v] : []);
      if (k === 'q') return DataList.set('zmluvy', 'q', v || '');
      return undefined;
    },

    /** Zmluvy, ktoré platia alebo sa pripravujú — predvolený filter zoznamu. */
    OPEN_STATUSES: ['draft', 'sent', 'signed', 'active'],
    /** Koľko dní pred koncom platnosti je zmluva „končí čoskoro". */
    SOON_DAYS: 30,

    STATUS: [['draft', 'Rozpracovaná'], ['sent', 'Odoslaná na podpis'], ['signed', 'Podpísaná'],
      ['active', 'Prebieha'], ['ended', 'Ukončená'], ['cancelled', 'Zrušená']],
    KIND: [['werkvertrag', 'Zmluva o dielo'], ['framework', 'Rámcová zmluva']],
    /** Názov z číselníka; keď číselník nie je načítaný, záloha tu (nie kľúč). */
    enumLabel(kind, key, list) {
      const l = window.Enums ? Enums.label(kind, key) : '';
      return l && l !== key ? l : ((list.find(x => x[0] === key) || [key, key])[1] || '');
    },
    statusLabel(s) { return this.enumLabel('contract_status', s, this.STATUS); },
    kindLabel(k) { return this.enumLabel('contract_kind', k || 'werkvertrag', this.KIND); },

    /**
     * Riadok zoznamu: zmluva, koľko dní do konca platnosti, dodatky.
     * „Po platnosti" je podpísaná alebo bežiaca zmluva, ktorej koniec už
     * prešiel — treba ju predĺžiť dodatkom alebo ukončiť.
     */
    listRow(c, today) {
      const L = DanubraDataList;
      const am = this.amendmentsOf(c.id);
      const unsigned = am.filter(a => !a.signed_at).length;
      const live = ['signed', 'active'].includes(c.status);
      const open = this.OPEN_STATUSES.includes(c.status);
      const left = c.date_to ? L.daysBetween(today, String(c.date_to).slice(0, 10)) : null;
      const toStart = c.date_from ? L.daysBetween(today, String(c.date_from).slice(0, 10)) : null;
      const expired = live && left != null && left < 0;
      const soon = live && left != null && left >= 0 && left <= this.SOON_DAYS;
      const noScope = !String(c.scope || '').trim();
      const noScan = live && !c.storage_path;
      // Čo horí: po platnosti, končí do 7 dní, bez predmetu diela (pri
      // kontrole rozhoduje obsah), nepodpísaný dodatok, končí do 30 dní,
      // čaká na podpis, rozpracovaná. Ukončené a zrušené na koniec.
      let rank = 7;
      if (!open) rank = 9;
      else if (expired) rank = 0;
      else if (soon && left <= 7) rank = 1;
      else if (noScope) rank = 2;
      else if (unsigned) rank = 3;
      else if (soon) rank = 4;
      else if (c.status === 'sent') rank = 5;
      else if (c.status === 'draft') rank = 6;
      return {
        id: c.id, c, am, unsigned, live, open, left, toStart, expired, soon, noScope, noScan, rank,
        hot: rank <= 1, problem: open && (expired || noScope || unsigned > 0 || (soon && left <= 7)),
        title: c.title || c.contract_number || 'Zmluva',
        partner: c.partner_id ? this.partnerName(c.partner_id) : '',
        city: c.site_city || '',
      };
    },

    /** Konfigurácia zoznamu zmlúv pre `DataList`. */
    listConfig(rows) {
      const L = DanubraDataList;
      const esc = UI.esc;
      const ST = this.STATUS.slice();
      for (const [k] of (window.Enums ? Enums.options('contract_status') : [])) {
        if (k && !ST.some(s => s[0] === k)) ST.push([k, this.statusLabel(k)]);
      }
      const statusIdx = (k) => { const i = ST.findIndex(s => s[0] === k); return i < 0 ? 99 : i; };
      const dni = (n) => `${n} ${Shell.plural(n, 'deň', 'dni', 'dní')}`;

      const platnostCell = (r) => {
        const t = L.rangeText(r.c.date_from, r.c.date_to);
        if (!t) return r.open ? '<span class="dl-note is-amber">bez dátumov</span>' : '';
        let note = '';
        if (r.expired) note = `<span class="dl-note is-red">skončila pred ${dni(-r.left)}</span>`;
        else if (r.live && r.left === 0) note = '<span class="dl-note is-amber">končí dnes</span>';
        else if (r.soon) note = `<span class="dl-note ${r.left <= 7 ? 'is-amber' : 'is-mute'}">končí o ${dni(r.left)}</span>`;
        else if (r.open && r.toStart != null && r.toStart > 0 && r.toStart <= 30) note = `<span class="dl-note is-mute">začína o ${dni(r.toStart)}</span>`;
        else if (r.live && !r.c.date_to) note = '<span class="dl-note is-mute">bez konca</span>';
        return `<span class="dl-two is-wrap"><b>${t}</b>${note}</span>`;
      };
      const predmetCell = (r) => (r.noScope
        ? `<span class="dl-note ${r.open ? 'is-amber' : 'is-mute'}">${Icon('alert', 12)} chýba predmet diela</span>`
        : `<span class="con-scope" title="${esc(r.c.scope)}">${esc(r.c.scope)}</span>`);
      const dodatkyCell = (r) => {
        const n = r.am.length;
        const notes = [
          r.unsigned ? `<span class="dl-note is-amber">${r.unsigned} ${Shell.plural(r.unsigned, 'nepodpísaný', 'nepodpísané', 'nepodpísaných')}</span>` : '',
          r.noScan ? '<span class="dl-note is-mute">bez skenu originálu</span>' : '',
        ].filter(Boolean).join('');
        if (!n && !notes) return '';
        return `<span class="dl-two">${n ? `<b>${n} ${Shell.plural(n, 'dodatok', 'dodatky', 'dodatkov')}</b>` : ''}${notes}</span>`;
      };

      return {
        id: 'zmluvy', storageKey: 'zmluvy', label: 'Zmluvy',
        noun: ['zmluva', 'zmluvy', 'zmlúv'],
        rows,
        rowClick: (r) => Con.detail(r.id),
        rowClass: (r) => (r.hot ? 'is-hot' : r.problem || r.soon ? 'is-warn' : !r.open ? 'is-muted' : ''),
        rowLabel: (r) => `Zmluva ${r.title}`,
        rowActions: [{ ico: 'chevron', label: 'Otvoriť zmluvu', run: (r) => Con.detail(r.id) }],
        columns: [
          { key: 'zmluva', label: 'Zmluva', width: 'minmax(170px, 1.5fr)', mobile: 'title',
            render: (r) => `<span class="dl-title"><b>${esc(r.title)}</b><small>${
              [r.c.contract_number, (r.c.kind || 'werkvertrag') === 'framework' ? 'rámcová' : 'o dielo'].filter(Boolean).map(esc).join(' · ')}</small></span>`,
            sortValue: (r) => r.title, sortLabel: 'Názov' },
          { key: 'odberatel', label: 'Odberateľ', width: 'minmax(120px, 1fr)',
            render: (r) => (r.c.partner_id ? Danubra.link('partner', r.c.partner_id, r.partner) : ''),
            sortValue: (r) => r.partner },
          { key: 'predmet', label: 'Predmet diela', width: 'minmax(150px, 1.5fr)', mobile: 'line', hideBelow: 960,
            tip: 'Čo je dielo. Pri kontrole rozhoduje obsah zmluvy, nie jej názov — bez popisu diela vyzerá ako zmluva o práci.',
            render: predmetCell, sortValue: (r) => (r.noScope ? 0 : 1), sortLabel: 'Predmet diela' },
          { key: 'platnost', label: 'Platí od – do', width: '150px', mobileLabel: 'platí',
            render: platnostCell, sortValue: (r) => r.c.date_to || null, sortLabel: 'Koniec platnosti' },
          { key: 'sadzba', label: 'Sadzba', width: '78px', align: 'right', hideBelow: 1100,
            render: (r) => {
              if ((r.c.price_model || 'hourly') === 'hourly') {
                return r.c.charge_rate ? `<span class="dl-num" title="${esc(this.priceText(r.c))}">${
                  Number(r.c.charge_rate).toLocaleString('sk-SK', { maximumFractionDigits: 2 })} €/h</span>` : '';
              }
              return r.c.fixed_price || r.c.unit_price ? `<span class="dl-num">${this.priceText(r.c)}</span>` : '';
            },
            sortValue: (r) => Number(r.c.charge_rate) || null, sortDir: -1 },
          { key: 'stav', label: 'Stav', width: '138px', mobile: 'badge',
            render: (r) => UI.badge(this.statusLabel(r.c.status), this.statusKind(r.c.status)),
            sortValue: (r) => statusIdx(r.c.status) },
          { key: 'dodatky', label: 'Dodatky', width: '118px',
            tip: 'Koľko dodatkov zmluva má a koľko z nich ešte neprišlo podpísaných. Pri podpísanej zmluve aj to, či je nahratý sken originálu.',
            render: dodatkyCell, sortValue: (r) => r.am.length || null, sortDir: -1 },
        ],
        sorts: [
          { key: 'hori', label: 'Čo horí', value: (r) => [r.rank, r.left == null ? 1e6 : r.left, r.title] },
          { key: 'podpisana', label: 'Podpísaná', value: (r) => r.c.signed_at, dir: -1 },
        ],
        sort: { key: 'hori', dir: 1 },
        groups: [
          { key: 'stav', label: 'Stav', value: (r) => r.c.status, labelOf: (k) => this.statusLabel(k), order: ST.map(s => s[0]),
            tone: (k) => this.statusKind(k) },
          { key: 'odberatel', label: 'Odberateľ', value: 'partner', emptyLabel: 'Bez odberateľa' },
        ],
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať zmluvu…', label: 'Hľadať názov, číslo, odberateľa, predmet diela alebo mesto',
            fields: ['title', 'c.contract_number', 'partner', 'c.scope', 'city', 'c.site_name', 'c.contact_name'] },
          { key: 'stav', type: 'multi', label: 'Stav', value: (r) => r.c.status, default: this.OPEN_STATUSES,
            options: ST, sortOptions: false, allLabel: 'Všetky',
            presets: [
              { label: 'Platné a rozpracované', value: this.OPEN_STATUSES, hint: 'Všetko okrem ukončených a zrušených' },
              { label: 'Podpísané', value: ['signed', 'active'], hint: 'Podpísaná a Prebieha — podmienky sa menia už len dodatkom' },
              { label: 'Uzavreté', value: ['ended', 'cancelled'] },
            ] },
          { key: 'odberatel', type: 'select', label: 'Odberateľ', value: (r) => r.c.partner_id,
            optionLabel: (v, r) => (r ? r.partner : v), emptyLabel: 'Bez odberateľa', allLabel: 'Všetci odberatelia' },
          { key: 'druh', type: 'select', label: 'Druh', value: (r) => r.c.kind || 'werkvertrag',
            options: this.KIND.map(k => [k[0], this.kindLabel(k[0])]), allLabel: 'Všetky druhy' },
          { key: 'konci', type: 'toggle', label: 'Končí čoskoro', test: (r) => r.soon || r.expired,
            hint: `Podpísané a bežiace zmluvy, ktorým platnosť skončí do ${this.SOON_DAYS} dní alebo už skončila. Predĺžte ich dodatkom alebo ukončite.` },
          { key: 'problem', type: 'toggle', label: 'Len s problémom', more: true, test: (r) => r.problem,
            hint: 'Zmluvy po platnosti alebo s koncom do 7 dní, bez predmetu diela, alebo s dodatkom, ktorý ešte neprišiel podpísaný.' },
          { key: 'bez_skenu', type: 'toggle', label: 'Bez skenu originálu', more: true, test: (r) => r.noScan,
            hint: 'Podpísané a bežiace zmluvy, ku ktorým nie je nahratý podpísaný originál.' },
          { key: 'mesto', type: 'select', label: 'Mesto stavby', value: 'city', emptyLabel: 'Bez mesta', allLabel: 'Všetky mestá', more: true },
          { key: 'obdobie', type: 'range-date', label: 'Platnosť', start: 'c.date_from', end: 'c.date_to', more: true,
            hint: 'Zmluvy, ktoré v zvolenom období platia aspoň jeden deň. Zmluva bez dátumov sa neukáže.' },
        ],
        empty: { ico: 'note', title: 'Zatiaľ žiadna zmluva',
          sub: 'Zmluva vzniká z prijatej ponuky alebo ju založíte priamo.',
          cta: `<button class="btn btn-primary" onclick="Con.form()">${Icon('plus')} Nová zmluva</button>` },
        export: {
          name: ['zmluvy'],
          columns: [
            ['Číslo', r => r.c.contract_number], ['Zmluva', r => r.title], ['Odberateľ', r => r.partner],
            ['Druh', r => this.kindLabel(r.c.kind)], ['Predmet diela', r => r.c.scope], ['Mesto', r => r.city],
            ['Od', r => r.c.date_from], ['Do', r => r.c.date_to], ['Dní do konca', r => (r.live ? r.left : '')],
            ['Sadzba €/h', r => r.c.charge_rate], ['Splatnosť dní', r => r.c.payment_terms_days || 30],
            ['Zádržné %', r => r.c.retention_pct], ['Stav', r => this.statusLabel(r.c.status)],
            ['Podpísaná', r => r.c.signed_at], ['Dodatkov', r => r.am.length], ['Nepodpísaných dodatkov', r => r.unsigned],
            ['Sken originálu', r => (r.c.storage_path ? 'áno' : 'nie')],
          ],
        },
      };
    },

    detail(id) {
      const c = this.items.find(x => x.id === id);
      if (!c) return UI.toast('Nenájdené', 'err');
      const am = this.amendmentsOf(id);
      const locked = this.isLocked(c);
      const site = [c.site_name, c.site_address, c.site_city].filter(Boolean).join(', ');
      const kontakt = [c.contact_name, c.contact_email, c.contact_phone].filter(Boolean);

      const amRow = (a) => {
        const label = (LOCKED.find(l => l[0] === a.field) || [, a.field])[1];
        // Hodnota sa ukáže v tvare, v akom bola dohodnutá — nie v tom, v akom
        // je v databáze. „48000" a „2027-06-30" v histórii zmluvy vyzerajú
        // ako výpis z tabuľky, nie ako to, na čo sa niekto podpísal.
        const fmt = (v) => {
          if (v == null || v === '') return '—';
          if (['charge_rate', 'fixed_price', 'unit_price'].includes(a.field)) {
            return Money.format(Money.toCents(v)) + (a.field === 'charge_rate' ? ' / h' : '');
          }
          if (a.field === 'retention_pct') return UI.pct(v);
          if (a.field === 'date_to') return UI.date(v);
          return v;
        };
        return `<div class="note">
          <div class="note-meta">
            <b>${UI.esc(a.amendment_number || label)}</b>
            <span>${a.created_at ? UI.date(a.created_at) : ''}</span>
            ${a.signed_at ? `<em>podpísaný ${UI.date(a.signed_at)}</em>` : '<em>nepodpísaný</em>'}
          </div>
          <div class="note-body">${UI.esc(label)}: ${UI.esc(fmt(a.old_value))}
            → <strong>${UI.esc(fmt(a.new_value))}</strong>${a.reason ? `\n${UI.esc(a.reason)}` : ''}</div>
          <span class="btn-row">
            ${a.signed_at ? '' : `<button class="link-chip"
              onclick="Con.signAmendment('${a.id}','${id}')">${Icon('check', 13)}
              <span>Prišiel podpísaný</span></button>`}
            ${a.storage_path
              ? `<button class="link-chip" onclick="Con.openAmendmentScan('${a.id}')">
                   ${Icon('doc', 13)}<span>Sken dodatku</span></button>`
              : `<label class="link-chip">${Icon('upload', 13)}
                   <span>Nahrať sken</span>
                   <input type="file" hidden accept="application/pdf,image/*"
                     onchange="Con.uploadAmendmentScan('${a.id}','${id}', this)"></label>`}
          </span>
        </div>`;
      };

      const body = `
        <div class="detail-head">
          ${UI.badge(this.statusLabel(c.status), this.statusKind(c.status))}
          ${c.contract_number ? `<span class="mono doc-no">${UI.esc(c.contract_number)}</span>` : ''}
          <select class="verif-sel" onchange="Con.setStatus('${c.id}',this.value)">
            ${Enums.options('contract_status').map(([k, l]) =>
              `<option value="${k}" ${c.status === k ? 'selected' : ''}>${UI.esc(l)}</option>`).join('')}
          </select>
          ${UI.tip('Stav zmluvy, uloží sa hneď. Rozpracovaná a Odoslaná na podpis sa dajú voľne upravovať. Od „Podpísaná" ďalej sa koniec platnosti a ceny menia už len dodatkom. Pri prepnutí na Podpísaná sa doplní dnešný dátum podpisu, ak chýba.')}
        </div>

        ${!c.scope ? `<div class="warnbox">${Icon('alert', 14)}
          Chýba predmet diela. Pri kontrole rozhoduje obsah zmluvy, nie jej názov —
          bez popisu diela to vyzerá ako zmluva o práci, nie o dielo.</div>` : ''}

        <div class="kv">
          <div><span>Odberateľ</span><strong>${UI.esc(this.partnerName(c.partner_id))}</strong></div>
          <div><span>Druh${UI.tip('Zmluva o dielo (Werkvertrag) = na jednu konkrétnu prácu (stavbu). Rámcová zmluva (Rahmenvertrag) = spoločné podmienky na dlhšiu spoluprácu, jednotlivé práce sa potom objednávajú zvlášť.')}</span><strong>${UI.esc(this.kindLabel(c.kind))}</strong></div>
          ${c.date_from ? `<div><span>Platnosť</span><strong>${UI.dateRange(c.date_from, c.date_to)}</strong></div>` : ''}
          <div><span>Cena</span><strong>${this.priceText(c)}</strong></div>
          <div><span>Splatnosť${UI.tip('Koľko dní po vystavení faktúry má odberateľ na zaplatenie. Z toho sa počíta dátum splatnosti na faktúre.')}</span><strong>${c.payment_terms_days || 30} dní</strong></div>
          ${c.retention_pct ? `<div><span>Zádržné</span><strong>${UI.pct(c.retention_pct)}</strong></div>` : ''}
          ${c.warranty_months ? `<div><span>Záruka</span><strong>${c.warranty_months} mes.</strong></div>` : ''}
          ${c.notice_days ? `<div><span>Výpovedná lehota</span><strong>${c.notice_days} dní</strong></div>` : ''}
          ${c.signed_at ? `<div><span>Podpísaná</span><strong>${UI.date(c.signed_at)}</strong></div>` : ''}
        </div>

        ${site ? `<div class="form-section">Miesto plnenia</div>
          <div>${Icon('map', 14)} ${UI.esc(site)}</div>` : ''}

        ${c.retention_pct ? `<div class="regimebox">
          Odberateľ si zadrží ${UI.pct(c.retention_pct)} až do konca
          záruky${c.warranty_months ? ` (${c.warranty_months} mesiacov od prevzatia)` : ''}.
          Tie peniaze do výhľadu cash-flow nepatria hneď.</div>` : ''}

        ${c.scope ? `
          <div class="form-section">Predmet diela</div>
          <div class="notebox">${UI.esc(c.scope)}</div>` : ''}
        ${c.penalty_note ? `<div class="form-section">Zmluvná pokuta</div>
          <div class="notebox">${UI.esc(c.penalty_note)}</div>` : ''}

        ${kontakt.length ? `<div class="form-section">Kontakt na strane odberateľa</div>
          <div>${kontakt.map(UI.esc).join(' · ')}</div>` : ''}

        ${c.notes ? `<div class="notebox">${UI.esc(c.notes)}</div>` : ''}

        <div class="form-section">Dodatky</div>
        ${locked ? `<div class="regimebox">
          Zmluva je podpísaná. Koniec platnosti a sadzba sa už neprepisujú —
          každá zmena je dodatok a zostane v histórii. Stráži to databáza,
          nie táto obrazovka.</div>` : `<div class="regimebox">
          Zmluva ešte nie je podpísaná, takže sa dá upraviť priamo. Po podpise
          budú koniec platnosti a sadzba chránené.</div>`}
        ${am.length ? `<div class="notes-list">${am.map(amRow).join('')}</div>`
          : '<div class="js-empty">Zatiaľ žiadny dodatok.</div>'}
        ${locked ? `<div class="btn-row"><button class="btn btn-outline btn-sm"
          onclick="Con.amendForm('${c.id}')">${Icon('plus')} Nový dodatok</button></div>` : ''}

        <div class="form-section">Podpísaný originál</div>
        ${this.scanHtml(c)}

        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          <span style="align-self:center;display:inline-flex;">${UI.tip('Otvorí zmluvu po nemecky (Werkvertrag) na tlač aj s dodatkami. PDF uložíte v okne tlače voľbou „Uložiť ako PDF". Podpísaný papier potom nahrajte vyššie ako sken.')}</span>
          <button class="btn btn-outline" onclick="Con.document('${c.id}')">
            ${Icon('doc', 14)} Zmluva ako dokument</button>
          <button class="btn btn-primary" onclick="Con.form('${c.id}')">Upraviť</button>
        </div>`;
      UI.modal(c.title, body, { wide: true });
    },

    // ── Sken podpísanej zmluvy ────────────────────────────────────────────
    // `storage_path` je v tabuľke od F4 a nikto ho nepoužíval. Podpísaná
    // zmluva pritom existuje na papieri — a keď ju treba pri kontrole alebo
    // spore, hľadá sa v mailoch, nie tu.

    scanHtml(c) {
      if (!c.storage_path) {
        return `<div class="js-empty">Naskenovaný originál tu zatiaľ nie je.</div>
          <div class="btn-row"><label class="link-chip">${Icon('upload', 13)}
            <span>Nahrať sken</span>
            <input type="file" hidden accept="application/pdf,image/*"
              onchange="Con.uploadScan('${c.id}', this)"></label></div>`;
      }
      return `<div class="list-row is-static">
          ${this.thumbHtml(c)}
          <span class="lr-main">
            <strong>Podpísaný originál</strong>
            <span class="lr-sub">${UI.esc(String(c.storage_path).split('/').pop())}</span>
          </span>
          <button class="link-chip" onclick="Con.preview('${c.id}')">${Icon('search', 13)}<span>Náhľad</span></button>
          <button class="link-chip" onclick="Con.openScan('${c.id}')">${Icon('doc', 13)}<span>Otvoriť</span></button>
        </div>
        <div class="btn-row"><label class="link-chip">${Icon('upload', 13)}
          <span>Nahradiť</span>
          <input type="file" hidden accept="application/pdf,image/*"
            onchange="Con.uploadScan('${c.id}', this)"></label></div>`;
    },

    /** Dlaždica vedľa riadku. Z PDF sa v malom nič neprečíta, tak tam stačí ikona. */
    thumbHtml(c) {
      const pdf = /\.pdf$/i.test(c.storage_path || '');
      const id = `conthumb-${c.id}`;
      if (!pdf) this._thumb(id, c.storage_path);
      return pdf
        ? `<span class="doc-thumb doc-thumb-pdf">${Icon('doc', 18)}</span>`
        : `<span class="doc-thumb" id="${id}"></span>`;
    },

    async _thumb(elId, path) {
      const { url } = await DB.signedDocUrl(path, 300);
      const el = document.getElementById(elId);
      if (el && url) el.innerHTML = `<img src="${url}" alt="">`;
    },

    async uploadScan(contractId, input) {
      const file = input && input.files && input.files[0];
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) {
        return UI.toast('Súbor má viac než 25 MB — zmenšite ho alebo ho odfoťte nanovo.', 'err');
      }
      UI.toast('Nahrávam…');
      const { path, error } = await DB.uploadDoc(file, { folder: 'contract', entityId: contractId });
      if (error) return UI.toast('Nahrávanie zlyhalo: ' + error.message, 'err');

      const { error: e2 } = await DB.update('contracts', contractId, { storage_path: path });
      if (e2) {
        // Súbor je nahratý, ale väzba nevznikla. Súbor v úložisku ostane
        // (nič sa nemaže) — removeDoc dnes nič nespraví.
        await DB.removeDoc(path).catch(() => {});
        return UI.toast('Sken sa nepodarilo priradiť: ' + e2.message, 'err');
      }
      const c = this.items.find(x => x.id === contractId); if (c) c.storage_path = path;
      UI.toast('Sken nahratý', 'ok');
      this.detail(contractId);
    },

    async openScan(contractId) {
      const c = this.items.find(x => x.id === contractId);
      if (!c || !c.storage_path) return UI.toast('Sken tu nie je', 'err');
      const { url, error } = await DB.signedDocUrl(c.storage_path, 300);
      if (error || !url) return UI.toast('Odkaz sa nepodarilo vytvoriť', 'err');
      window.open(url, '_blank', 'noopener');
    },

    async preview(contractId) {
      const c = this.items.find(x => x.id === contractId);
      if (!c || !c.storage_path) return UI.toast('Sken tu nie je', 'err');
      const { url, error } = await DB.signedDocUrl(c.storage_path, 300);
      if (error || !url) return UI.toast('Odkaz sa nepodarilo vytvoriť', 'err');
      // Rovnaké triedy ako pri dokladoch živnostníka — náhľad má vyzerať
      // rovnako, nech sa človek neučí dve rozhrania na tú istú vec.
      const pdf = /\.pdf$/i.test(c.storage_path);
      UI.modal(`Sken — ${c.title}`, `
        ${pdf
          ? `<iframe class="doc-view doc-view-pdf" src="${UI.esc(url)}" title="Sken zmluvy"></iframe>`
          : `<img class="doc-view" src="${UI.esc(url)}" alt="Sken zmluvy">`}
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="Con.detail('${c.id}')">Zavrieť</button>
          <button class="btn btn-primary" onclick="Con.openScan('${c.id}')">Otvoriť v novej karte</button>
        </div>`, { wide: true });
    },

    /**
     * Zmluva ako dokument — po nemecky, lebo ju číta a podpisuje odberateľ.
     * PDF sa robí tlačou prehliadača, rovnako ako pri ponuke a faktúre.
     */
    document(id) {
      const c = this.items.find(x => x.id === id);
      if (!c) return UI.toast('Nenájdené', 'err');
      if (!Danubra.supplierReady('Zmluva o dielo')) return;
      const supplier = Danubra.supplier();
      const p = this.partners.find(x => x.id === c.partner_id) || {};
      const html = window.DanubraPapers.werkvertrag({
        contract: c,
        client: { name: p.name, vat_id: p.ust_idnr, country: p.country || 'DE',
          contact_person: c.contact_name || p.contact_person },
        supplier,
        amendments: this.amendmentsOf(id).slice().reverse(),
      });
      Docs.show(window.open('', '_blank'), html, { kind: 'werkvertrag', title: 'Werkvertrag',
        number: c.contract_number, who: p.name, lang: 'de', partner_id: c.partner_id || null });
    },

    async setStatus(id, status) {
      // Podpísaná zmluva sa nevracia medzi rozpracované. Inak by sa koniec
      // platnosti a sadzba dali prepísať bez dodatku: prepnúť na
      // „Rozpracovaná", zmeniť, prepnúť späť. Drží to aj databáza (071).
      const cur = this.items.find(x => x.id === id);
      if (cur && this.isLocked(cur) && ['draft', 'sent'].includes(status)) {
        UI.toast('Podpísaná zmluva sa nevracia medzi rozpracované. Zmenu podmienok zapíšte dodatkom.', 'err');
        return this.detail(id);
      }
      const patch = { status };
      if (status === 'signed') {
        const c = this.items.find(x => x.id === id);
        if (c && !c.signed_at) patch.signed_at = new Date().toISOString().slice(0, 10);
      }
      const { error } = await DB.update('contracts', id, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const c = this.items.find(x => x.id === id); if (c) Object.assign(c, patch);
      UI.toast('Stav uložený', 'ok');
      this.detail(id);
    },

    /**
     * @param {string} id      úprava existujúcej
     * @param {Object} preset  predvyplnenie z prijatej ponuky
     * @param {Object} [opts]  { onSaved(zmluva) } — čo spraviť po založení
     *   novej zmluvy (napr. priradiť ju zákazke). Volá sa až po uložení.
     */
    form(id, preset, opts = {}) {
      const c = id ? this.items.find(x => x.id === id) || {} : (preset || {});
      const locked = id ? this.isLocked(c) : false;
      this._onSaved = !id && opts && typeof opts.onSaved === 'function' ? opts.onSaved : null;

      // Chránené pole sa nekreslí ako editovateľné. Nie „zakázané po kliknutí",
      // ale rovno bez možnosti písať — aby bolo jasné, že cesta vedie dodatkom.
      const lockedField = (name, label, value) => `
        <label class="fld fld-locked">
          <span>${label} ${Icon('lock', 12)}</span>
          <input value="${UI.esc(value ?? '')}" disabled>
          <em>Mení sa dodatkom</em>
        </label>`;

      const body = `
        <form id="con-form" onsubmit="event.preventDefault();Con.save('${id || ''}')">
          ${preset && preset.quote_id ? `<div class="regimebox">
            Zmluva vzniká z prijatej ponuky. Predmet diela sa <strong>nepredvyplnil</strong> —
            napíšte ho v reči diela („dodávka a montáž sadrokartónových priečok…"),
            nie v hodinách.</div>` : ''}
          <div class="form-grid">
            ${UI.field('title', 'Názov zmluvy', { value: c.title, required: true })}
            ${UI.field('partner_id', 'Odberateľ', { value: c.partner_id, required: true, add: 'partner',
              options: [['', '— vyberte —'], ...this.partners.map(p => [p.id, p.name])] })}
            ${UI.field('kind', 'Druh', { value: c.kind || 'werkvertrag',
              options: Enums.options('contract_kind'), tip: 'Zmluva o dielo (Werkvertrag) = na jednu konkrétnu prácu (stavbu). Rámcová zmluva (Rahmenvertrag) = spoločné podmienky na dlhšiu spoluprácu, jednotlivé práce sa potom objednávajú zvlášť.' })}
            ${UI.field('date_from', 'Platí od', { type: 'date', value: c.date_from,
              tip: 'Od kedy do kedy zmluva platí, teda kedy sa dielo robí. Koniec platnosti sa po podpise mení len dodatkom.' })}
            ${locked ? lockedField('date_to', 'Platí do', c.date_to)
              : UI.field('date_to', 'Platí do', { type: 'date', value: c.date_to })}
            ${UI.field('signed_at', 'Podpísaná dňa', { type: 'date', value: c.signed_at,
              tip: 'Deň, keď obe strany zmluvu podpísali. Nie je to začiatok platnosti — ten je v poli „Platí od".' })}
          </div>

          <div class="form-section">Predmet diela</div>
          <div class="regimebox">
            Píšte dielo, nie hodiny. Pri kontrole rozhoduje obsah zmluvy, nie jej
            názov — „4 pracovníci na 160 hodín mesačne" je znak skrytej
            Arbeitnehmerüberlassung, „dodávka a montáž priečok na 2. NP" nie je.${UI.tip('Arbeitnehmerüberlassung = požičiavanie ľudí inej firme (riadi ho nemecký zákon AÜG). Na to treba v Nemecku osobitné povolenie. Ak zmluva o dielo v skutočnosti vyzerá ako požičiavanie ľudí, hrozia vysoké pokuty.')}</div>
          ${UI.field('scope', '', { type: 'textarea', rows: 4, value: c.scope,
            placeholder: 'Dodávka a montáž sadrokartónových priečok a podhľadov na 2. a 3. NP…' })}

          <div class="form-section">Miesto plnenia</div>
          <div class="form-grid">
            ${UI.field('site_name', 'Stavba', { value: c.site_name,
              placeholder: 'Wohnpark Feuerbach' })}
            ${UI.field('site_city', 'Mesto', { value: c.site_city, placeholder: 'Stuttgart' })}
            ${UI.field('site_address', 'Adresa', { value: c.site_address })}
          </div>

          <div class="form-section">Cena</div>
          <div class="regimebox">
            Fakturujeme <strong>vždy po hodinách</strong>. Zmluva preto obsahuje vetu, že
            hodinová sadzba je podkladom na výpočet odmeny za dielo — a dielo (rozsah
            prác) musí byť v zmluve opísané. To je to, čo ju drží ako Werkvertrag.</div>
          <div class="form-grid">
            <input type="hidden" name="price_model" value="hourly">
            ${locked ? lockedField('charge_rate', 'Sadzba €/h', c.charge_rate)
              : UI.field('charge_rate', 'Sadzba €/h', { type: 'number', step: '0.01',
                value: c.charge_rate,
                hint: 'Po podpise sa už neprepisuje — zmenu ceny rieši dodatok.' })}
            ${UI.field('payment_terms_days', 'Splatnosť (dní)', { type: 'number',
              value: c.payment_terms_days ?? 30,
              hint: 'Z tohto čísla sa počíta dátum splatnosti na faktúre aj výhľad '
                + 'cash-flow. V Nemecku býva 30 až 60 dní.' })}
          </div>

          <div class="form-section">Zádržné, záruka a pokuty</div>
          <div class="form-grid">
            ${locked ? lockedField('retention_pct', 'Zádržné %', c.retention_pct)
              : UI.field('retention_pct', 'Zádržné % (Sicherheitseinbehalt)', {
                type: 'number', step: '0.1', value: c.retention_pct, placeholder: '5',
                hint: 'Časť ceny, ktorú si odberateľ nechá do konca záruky. Býva 5 %. '
                  + 'Sú to naše peniaze, ktoré roky ležia u neho — rátajte s nimi '
                  + 'až po uplynutí záruky.' })}
            ${UI.field('warranty_months', 'Záruka (mesiacov)', { type: 'number',
              value: c.warranty_months, placeholder: '48',
              tip: 'Ako dlho po odovzdaní diela ručíme za chyby. Na nemeckých stavbách býva 48 až 60 mesiacov. Dovtedy drží odberateľ zádržné.' })}
            ${UI.field('notice_days', 'Výpovedná lehota (dní)', { type: 'number',
              value: c.notice_days, tip: 'Koľko dní dopredu treba zmluvu vypovedať, kým naozaj skončí.' })}
          </div>
          <div class="regimebox">
            Zádržné býva 5 % a odberateľ si ho drží až do konca záruky. Kto
            s ním počíta ako s peniazmi na ceste, má vo výhľade o toľko viac,
            než reálne príde.</div>
          ${UI.field('penalty_note', 'Zmluvná pokuta — píšte po nemecky, ide to do zmluvy',
            { type: 'textarea', rows: 2, value: c.penalty_note,
              placeholder: '0,2 % der Auftragssumme je angefangenem Verzugstag, '
                + 'maximal 5 % der Auftragssumme.' })}

          <div class="form-section">Kontakt na strane odberateľa</div>
          <div class="form-grid">
            ${UI.field('contact_name', 'Meno', { value: c.contact_name })}
            ${UI.field('contact_email', 'E-mail', { type: 'email', value: c.contact_email })}
            ${UI.field('contact_phone', 'Telefón', { value: c.contact_phone })}
          </div>

          ${UI.field('notes', 'Poznámka', { type: 'textarea', value: c.notes })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Vytvoriť'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť zmluvu' : 'Nová zmluva', body, { wide: true });
      if (preset && preset.quote_id) this._presetQuoteId = preset.quote_id;
    },

    async save(id) {
      const d = UI.formData(document.getElementById('con-form'));
      if (!d.title) return UI.toast('Názov je povinný', 'err');
      if (!d.partner_id) return UI.toast('Vyberte odberateľa', 'err');
      const payload = { ...d };
      ['charge_rate', 'payment_terms_days', 'fixed_price', 'unit_price',
        'retention_pct', 'warranty_months', 'notice_days']
        .forEach(k => { if (k in payload) payload[k] = d[k] === '' ? null : Number(d[k]); });
      ['date_from', 'date_to', 'signed_at']
        .forEach(k => { if (payload[k] === '') payload[k] = null; });
      // Prázdny text je „nevyplnené", nie prázdny reťazec — inak by sa
      // v dokumente vykreslil prázdny paragraf.
      ['site_name', 'site_city', 'site_address', 'unit_label', 'penalty_note',
        'contact_name', 'contact_email', 'contact_phone']
        .forEach(k => { if (payload[k] === '') payload[k] = null; });

      // Zádržné nad 20 % zastaví aj databáza, ale povedať to treba skôr —
      // päťdesiatka býva preklep päťky, nie dohoda.
      if (payload.retention_pct != null
          && (payload.retention_pct < 0 || payload.retention_pct > 20)) {
        return UI.toast('Zádržné býva do 20 %. Nie je to preklep?', 'err');
      }

      // Chránené polia sa z formulára nikdy neposielajú — disabled input
      // ich neposiela sám, ale nespoliehame sa na to.
      if (id && this.isLocked(this.items.find(x => x.id === id) || {})) {
        LOCKED.forEach(([f]) => delete payload[f]);
      }
      if (!id) {
        try {
          payload.contract_number = await this.nextNumber();
        } catch (e) {
          return UI.toast('Nepodarilo sa prideliť číslo zmluvy: ' + e.message, 'err');
        }
        payload.status = payload.status || 'draft';
        if (this._presetQuoteId) { payload.quote_id = this._presetQuoteId; this._presetQuoteId = null; }
      }
      const res = id ? await DB.update('contracts', id, payload) : await DB.insert('contracts', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast(id ? 'Uložené' : 'Zmluva vytvorená', 'ok');
      const after = !id ? this._onSaved : null;
      this._onSaved = null;
      this.loaded = false; await this.load();
      // Kto zmluvu zakladal odinakiaľ (zákazka), ten si obrazovku prekreslí sám.
      if (after) {
        try { await after(res.data); return; } catch (e) { console.error('[danubra] po založení zmluvy', e); }
      }
      Danubra.renderRoute();
    },

    /** ZML-2026-0001, pridelené transakčne v databáze. */
    async nextNumber() {
      const { data, error } = await DB.client.rpc('danubra_next_number', { p_kind: 'contract' });
      if (error) throw error;
      return data;
    },

    // ── Dodatky ───────────────────────────────────────────────────────────
    amendForm(contractId) {
      const c = this.items.find(x => x.id === contractId);
      if (!c) return;
      const body = `
        <form id="am-form" onsubmit="event.preventDefault();Con.saveAmendment('${contractId}')">
          <div class="regimebox">
            Dodatok sa nedá zmazať ani prepísať. Pôvodná hodnota zostane
            v histórii zmluvy — presne preto, aby sa dalo spätne povedať, na čo
            sa odberateľ podpísal.</div>
          <div class="form-grid">
            ${UI.field('field', 'Čo sa mení', { value: 'date_to',
              options: LOCKED.map(l => [l[0], l[1]]),
              tip: 'Ponúkajú sa len údaje, ktoré po podpise chráni databáza. Ostatné (kontakt, poznámka…) sa menia obyčajným Upraviť.' })}
            ${UI.field('new_value', 'Nová hodnota', { required: true,
              placeholder: 'dátum ako 2026-12-31, sadzba ako 31.50' })}
            ${UI.field('signed_at', 'Dodatok podpísaný dňa', { type: 'date',
              tip: 'Ak odberateľ dodatok ešte nepodpísal, nechajte prázdne. Keď príde podpísaný, kliknite pri ňom „Prišiel podpísaný".' })}
            ${UI.field('amendment_number', 'Číslo dodatku', {
              value: `Dodatok č. ${this.amendmentsOf(contractId).length + 1}` })}
          </div>
          ${UI.field('reason', 'Prečo', { type: 'textarea', rows: 2,
            placeholder: 'napr. odberateľ predĺžil stavbu o štyri mesiace' })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="Con.detail('${contractId}')">Zrušiť</button>
            <button type="submit" class="btn btn-primary">Zapísať dodatok</button>
          </div>
        </form>`;
      UI.modal('Nový dodatok', body, { wide: true });
    },

    /**
     * Poradie je dôležité: najprv dodatok, potom zmluva. Trigger v databáze
     * overí, že k novej hodnote dodatok existuje — opačné poradie neprejde.
     */
    /**
     * Nová hodnota dodatku v tvare, v akom ju potom vráti databáza.
     *
     * Trigger `danubra_contract_needs_amendment` porovnáva text dodatku
     * s `to_jsonb(zmluva) ->> pole`. Sadzba zapísaná ako „31.50" (tak to
     * radí aj nápoveda) sa uloží ako číslo 31.5 a porovnanie „31.50" ≠ „31.5"
     * zlyhalo: dodatok sa zapísal (a zmazať sa nedá), zmluva sa nezmenila.
     * Rovnako „31.12.2026" pri dátume. Preto sa hodnota zjednotí vopred.
     *
     * @returns {{ value: string } | { error: string }}
     */
    amendValue(field, raw) {
      const s = String(raw == null ? '' : raw).trim();
      if (!s) return { error: 'Vyplňte novú hodnotu' };
      if (field === 'date_to') {
        let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        let y, mo, d;
        if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
        else if ((m = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
        else return { error: 'Dátum zapíšte ako 2026-12-31 alebo 31.12.2026' };
        const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const t = new Date(`${iso}T00:00:00Z`);
        if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso) return { error: 'Taký dátum neexistuje' };
        return { value: iso };
      }
      const n = Number(s.replace(/\s+/g, '').replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) return { error: 'Zapíšte číslo, napríklad 31.50' };
      if (field === 'retention_pct' && n > 20) return { error: 'Zádržné býva do 20 %. Nie je to preklep?' };
      return { value: String(n) };
    },

    // Dvojklik zapísal dva dodatky — a dodatok sa nedá zmazať ani prepísať.
    saveAmendment(contractId) {
      if (this._amending) return undefined;
      this._amending = true;
      return this._saveAmendment(contractId).finally(() => { this._amending = false; });
    },

    async _saveAmendment(contractId) {
      const c = this.items.find(x => x.id === contractId);
      const d = UI.formData(document.getElementById('am-form'));
      if (!c || !d.new_value) return UI.toast('Vyplňte novú hodnotu', 'err');

      const oldValue = c[d.field] == null ? '' : String(c[d.field]);
      const canon = this.amendValue(d.field, d.new_value);
      if (canon.error) return UI.toast(canon.error, 'err');
      const newValue = canon.value;
      if (oldValue === newValue || (d.field !== 'date_to' && oldValue !== '' && Number(oldValue) === Number(newValue))) {
        return UI.toast('Nová hodnota je rovnaká ako pôvodná', 'err');
      }

      const { error } = await DB.insert('contract_amendments', {
        contract_id: contractId, field: d.field,
        old_value: oldValue, new_value: newValue,
        reason: d.reason || null,
        signed_at: d.signed_at || null,
        amendment_number: d.amendment_number || null,
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');

      // Číselné polia idú do databázy ako číslo. Dátum zostáva textom.
      const cislo = ['charge_rate', 'fixed_price', 'unit_price', 'retention_pct'];
      const patch = { [d.field]: cislo.includes(d.field) ? Number(newValue) : newValue };
      const res = await DB.update('contracts', contractId, patch);
      if (res.error) {
        // Dodatok už je zapísaný a nemaže sa — povedz to rovno, nech je
        // jasné, čo sa stalo a čo treba spraviť.
        return UI.toast('Dodatok zapísaný, ale zmluva sa neupravila: ' + res.error.message, 'err');
      }
      Object.assign(c, patch);
      UI.toast('Dodatok zapísaný a zmluva upravená', 'ok');
      this.loaded = false; await this.load(); this.detail(contractId);
    },

    /**
     * Dodatok sa vracia podpísaný o týždeň, nie hneď. Zapísať sa to doteraz
     * nedalo vôbec: tabuľka mala `signed_at`, ale RLS nemala update politiku.
     *
     * Append-only zostáva — z riadku sa dá zmeniť len dátum podpisu a sken,
     * zvyšok stráži trigger `danubra_amendment_append_only` (migrácia 036).
     */
    async signAmendment(amendmentId, contractId) {
      const a = this.amendments.find(x => x.id === amendmentId);
      if (!a) return;
      if (a.signed_at) {
        return UI.toast('Tento dodatok už je označený ako podpísaný', 'err');
      }
      const when = await UI.ask('Kedy ho odberateľ podpísal?', {
        type: 'date', value: new Date().toISOString().slice(0, 10),
        ok: 'Zapísať podpis',
      });
      if (!when) return;
      const { error } = await DB.update('contract_amendments', amendmentId, { signed_at: when });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      a.signed_at = when;
      UI.toast('Podpis zapísaný', 'ok');
      this.detail(contractId);
    },

    async uploadAmendmentScan(amendmentId, contractId, input) {
      const file = input && input.files && input.files[0];
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) {
        return UI.toast('Súbor má viac než 25 MB — zmenšite ho alebo ho odfoťte nanovo.', 'err');
      }
      UI.toast('Nahrávam…');
      const { path, error } = await DB.uploadDoc(file, {
        folder: 'contract-amendment', entityId: amendmentId });
      if (error) return UI.toast('Nahrávanie zlyhalo: ' + error.message, 'err');
      const { error: e2 } = await DB.update('contract_amendments', amendmentId,
        { storage_path: path });
      if (e2) {
        await DB.removeDoc(path).catch(() => {});
        return UI.toast('Sken sa nepodarilo priradiť: ' + e2.message, 'err');
      }
      const a = this.amendments.find(x => x.id === amendmentId); if (a) a.storage_path = path;
      UI.toast('Sken dodatku nahratý', 'ok');
      this.detail(contractId);
    },

    async openAmendmentScan(amendmentId) {
      const a = this.amendments.find(x => x.id === amendmentId);
      if (!a || !a.storage_path) return UI.toast('Sken tu nie je', 'err');
      const { url, error } = await DB.signedDocUrl(a.storage_path, 300);
      if (error || !url) return UI.toast('Odkaz sa nepodarilo vytvoriť', 'err');
      window.open(url, '_blank', 'noopener');
    },
  };

  window.Con = Con;
  Danubra.views.contracts = function (el) { return Con.view(el); };
})();
