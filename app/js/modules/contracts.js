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
    filters: { status: '', q: '' },

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

    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }

      const withPartner = this.items.map(c => ({ ...c, partner_name: this.partnerName(c.partner_id) }));
      const rows = Shell.filterRows(withPartner, {
        q: this.filters.q,
        fields: ['title', 'contract_number', 'partner_name'],
        equals: { status: this.filters.status },
      });

      const card = (c) => {
        const am = this.amendmentsOf(c.id);
        return `
          <div class="card card-pad list-card" onclick="Con.detail('${c.id}')">
            <div class="card-head">
              <div class="card-title">${UI.esc(c.title)}</div>
              ${UI.badge(Enums.label('contract_status', c.status), this.statusKind(c.status))}
            </div>
            <div class="meta-row">
              <span>${Icon('clients', 14)} ${UI.esc(c.partner_name)}</span>
              <span>${Icon('note', 14)} ${UI.esc(Enums.label('contract_kind', c.kind))}</span>
              ${c.date_from ? `<span>${Icon('clock', 14)} ${UI.dateRange(c.date_from, c.date_to)}</span>` : ''}
              ${c.charge_rate ? `<span>${Icon('invoices', 14)} ${Money.format(Money.toCents(c.charge_rate))}/h</span>` : ''}
              ${am.length ? `<span>${Icon('repeat', 14)} ${am.length} ${DanubraQuotes.plural(am.length, 'dodatok', 'dodatky', 'dodatkov')}</span>` : ''}
            </div>
            ${!c.scope ? `<div class="meta-row" style="color:var(--amber);">
              ${Icon('alert', 14)} chýba predmet diela</div>` : ''}
          </div>`;
      };

      Danubra.setActions(
        `<button class="btn btn-primary btn-sm" onclick="Con.form()">${Icon('plus')} Nová zmluva</button>`);
      el.innerHTML = Danubra.header(Danubra.labelOf('contracts'),
        'Dohodnuté podmienky sa neprepisujú — menia sa dodatkom')
        + Shell.list({
          rows, total: this.items.length, render: card, layout: 'cards',
          emptyIcon: 'note', emptyTitle: 'Zatiaľ žiadna zmluva',
          emptySub: 'Zmluva vzniká z prijatej ponuky alebo sa založí priamo.',
          filter: {
            search: { value: this.filters.q, placeholder: 'Hľadať zmluvu, odberateľa…',
              oninput: 'Con.setF("q", this.value)' },
            selects: [{
              value: this.filters.status, label: 'Stav',
              onchange: 'Con.setF("status", this.value)',
              options: [['', 'Všetky stavy'], ...Enums.options('contract_status')],
            }],
          },
        });
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

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
          <span class="link-row" style="margin-top:6px;">
            ${a.signed_at ? '' : `<button class="link-chip"
              onclick="Con.signAmendment('${a.id}','${id}')">${Icon('check', 13)}
              <span>Prišiel podpísaný</span></button>`}
            ${a.storage_path
              ? `<button class="link-chip" onclick="Con.openAmendmentScan('${a.id}')">
                   ${Icon('doc', 13)}<span>Sken dodatku</span></button>`
              : `<label class="link-chip" style="cursor:pointer;">${Icon('upload', 13)}
                   <span>Nahrať sken</span>
                   <input type="file" hidden accept="application/pdf,image/*"
                     onchange="Con.uploadAmendmentScan('${a.id}','${id}', this)"></label>`}
          </span>
        </div>`;
      };

      const body = `
        <div class="detail-head">
          ${UI.badge(Enums.label('contract_status', c.status), this.statusKind(c.status))}
          ${c.contract_number ? `<span class="mono" style="color:var(--ink-mute);">${UI.esc(c.contract_number)}</span>` : ''}
          <select class="verif-sel" onchange="Con.setStatus('${c.id}',this.value)">
            ${Enums.options('contract_status').map(([k, l]) =>
              `<option value="${k}" ${c.status === k ? 'selected' : ''}>${UI.esc(l)}</option>`).join('')}
          </select>
        </div>

        ${!c.scope ? `<div class="warnbox">${Icon('alert', 14)}
          Chýba predmet diela. Pri kontrole rozhoduje obsah zmluvy, nie jej názov —
          bez popisu diela to vyzerá ako zmluva o práci, nie o dielo.</div>` : ''}

        <div class="kv">
          <div><span>Odberateľ</span><strong>${UI.esc(this.partnerName(c.partner_id))}</strong></div>
          <div><span>Druh</span><strong>${UI.esc(Enums.label('contract_kind', c.kind))}</strong></div>
          ${c.date_from ? `<div><span>Platnosť</span><strong>${UI.dateRange(c.date_from, c.date_to)}</strong></div>` : ''}
          <div><span>Cena</span><strong>${this.priceText(c)}</strong></div>
          <div><span>Splatnosť</span><strong>${c.payment_terms_days || 30} dní</strong></div>
          ${c.retention_pct ? `<div><span>Zádržné</span><strong>${UI.pct(c.retention_pct)}</strong></div>` : ''}
          ${c.warranty_months ? `<div><span>Záruka</span><strong>${c.warranty_months} mes.</strong></div>` : ''}
          ${c.notice_days ? `<div><span>Výpovedná lehota</span><strong>${c.notice_days} dní</strong></div>` : ''}
          ${c.signed_at ? `<div><span>Podpísaná</span><strong>${UI.date(c.signed_at)}</strong></div>` : ''}
        </div>

        ${site ? `<div class="form-section">Miesto plnenia</div>
          <div style="font-size:13px;">${Icon('map', 14)} ${UI.esc(site)}</div>` : ''}

        ${c.price_model === 'hourly' && c.charge_rate ? `<div class="warnbox" style="margin-top:10px;">
          ${Icon('alert', 14)} Cena je dohodnutá <strong>za hodinu</strong>. Pri zmluve
          o dielo je to jeden zo znakov skrytej Arbeitnehmerüberlassung — ak sa dá,
          prepni to na pevnú cenu alebo cenu za jednotku.</div>` : ''}

        ${c.retention_pct ? `<div class="regimebox" style="margin-top:10px;">
          Odberateľ si zadrží ${UI.pct(c.retention_pct)} až do konca
          záruky${c.warranty_months ? ` (${c.warranty_months} mesiacov od prevzatia)` : ''}.
          Tie peniaze do výhľadu cash-flow nepatria hneď.</div>` : ''}

        ${c.scope ? `
          <div class="form-section">Predmet diela</div>
          <div class="notebox">${UI.esc(c.scope)}</div>` : ''}
        ${c.penalty_note ? `<div class="form-section">Zmluvná pokuta</div>
          <div class="notebox">${UI.esc(c.penalty_note)}</div>` : ''}

        ${kontakt.length ? `<div class="form-section">Kontakt na strane odberateľa</div>
          <div style="font-size:13px;">${kontakt.map(UI.esc).join(' · ')}</div>` : ''}

        ${c.notes ? `<div class="notebox">${UI.esc(c.notes)}</div>` : ''}

        <div class="form-section">Dodatky</div>
        ${locked ? `<div class="regimebox" style="margin:0 0 10px;">
          Zmluva je podpísaná. Koniec platnosti a sadzba sa už neprepisujú —
          každá zmena je dodatok a zostane v histórii. Stráži to databáza,
          nie táto obrazovka.</div>` : `<div class="regimebox" style="margin:0 0 10px;">
          Zmluva ešte nie je podpísaná, takže sa dá upraviť priamo. Po podpise
          budú koniec platnosti a sadzba chránené.</div>`}
        ${am.length ? `<div class="notes-list">${am.map(amRow).join('')}</div>`
          : '<div style="color:var(--ink-mute);font-size:13px;">Zatiaľ žiadny dodatok.</div>'}
        ${locked ? `<button class="btn btn-outline btn-sm" style="margin-top:8px;"
          onclick="Con.amendForm('${c.id}')">${Icon('plus')} Nový dodatok</button>` : ''}

        <div class="form-section">Podpísaný originál</div>
        ${this.scanHtml(c)}

        <div class="modal-actions">
          <button class="btn btn-outline btn-sm" onclick="Con.document('${c.id}')">
            ${Icon('doc', 14)} Zmluva ako dokument</button>
          <button class="btn btn-outline btn-sm" onclick="Con.form('${c.id}')">Upraviť</button>
        </div>`;
      UI.modal(c.title, body, { wide: true });
    },

    // ── Sken podpísanej zmluvy ────────────────────────────────────────────
    // `storage_path` je v tabuľke od F4 a nikto ho nepoužíval. Podpísaná
    // zmluva pritom existuje na papieri — a keď ju treba pri kontrole alebo
    // spore, hľadá sa v mailoch, nie tu.

    scanHtml(c) {
      if (!c.storage_path) {
        return `<div style="font-size:13px;color:var(--ink-mute);margin-bottom:6px;">
            Naskenovaný originál tu zatiaľ nie je.</div>
          <label class="link-chip" style="cursor:pointer;">${Icon('upload', 13)}
            <span>Nahrať sken</span>
            <input type="file" hidden accept="application/pdf,image/*"
              onchange="Con.uploadScan('${c.id}', this)"></label>`;
      }
      return `<div class="list-row" style="cursor:default;align-items:center;">
          ${this.thumbHtml(c)}
          <span style="flex:1;font-size:13px;">
            <strong>Podpísaný originál</strong>
            <span style="display:block;color:var(--ink-mute);font-size:12px;">
              ${UI.esc(String(c.storage_path).split('/').pop())}</span>
          </span>
          <button class="link-chip" onclick="Con.preview('${c.id}')">${Icon('search', 13)}<span>Náhľad</span></button>
          <button class="link-chip" onclick="Con.openScan('${c.id}')">${Icon('doc', 13)}<span>Otvoriť</span></button>
        </div>
        <label class="link-chip" style="cursor:pointer;margin-top:6px;">${Icon('upload', 13)}
          <span>Nahradiť</span>
          <input type="file" hidden accept="application/pdf,image/*"
            onchange="Con.uploadScan('${c.id}', this)"></label>`;
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
        return UI.toast('Súbor má viac než 25 MB — zmenši ho alebo odfoť nanovo.', 'err');
      }
      UI.toast('Nahrávam…');
      const { path, error } = await DB.uploadDoc(file, { folder: 'contract', entityId: contractId });
      if (error) return UI.toast('Nahrávanie zlyhalo: ' + error.message, 'err');

      const { error: e2 } = await DB.update('contracts', contractId, { storage_path: path });
      if (e2) {
        // Súbor je nahratý, ale väzba nevznikla — nenechávaj v úložisku smeti.
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
          <button class="btn btn-ghost" onclick="Con.detail('${c.id}')">Späť</button>
          <button class="btn btn-outline" onclick="Con.openScan('${c.id}')">Otvoriť v novej karte</button>
        </div>`, { wide: true });
    },

    /**
     * Zmluva ako dokument — po nemecky, lebo ju číta a podpisuje odberateľ.
     * PDF sa robí tlačou prehliadača, rovnako ako pri ponuke a faktúre.
     */
    document(id) {
      const c = this.items.find(x => x.id === id);
      if (!c) return UI.toast('Nenájdené', 'err');
      const supplier = (window.Cfg && Cfg.j('supplier')) || {};
      const p = this.partners.find(x => x.id === c.partner_id) || {};
      const html = window.DanubraPapers.werkvertrag({
        contract: c,
        client: { name: p.name, vat_id: p.ust_idnr, country: p.country || 'DE',
          contact_person: c.contact_name || p.contact_person },
        supplier,
        amendments: this.amendmentsOf(id).slice().reverse(),
      });
      const w = window.open('', '_blank');
      if (!w) return UI.toast('Povoľ vyskakovacie okná pre zobrazenie dokumentu', 'err');
      w.document.open(); w.document.write(html); w.document.close();
    },

    async setStatus(id, status) {
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
     */
    form(id, preset) {
      const c = id ? this.items.find(x => x.id === id) || {} : (preset || {});
      const locked = id ? this.isLocked(c) : false;

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
          ${preset && preset.quote_id ? `<div class="regimebox" style="margin:0 0 12px;">
            Zmluva vzniká z prijatej ponuky. Predmet diela sa <strong>nepredvyplnil</strong> —
            napíš ho v reči diela („dodávka a montáž sadrokartónových priečok…"),
            nie v hodinách.</div>` : ''}
          <div class="form-grid">
            ${UI.field('title', 'Názov zmluvy', { value: c.title, required: true })}
            ${UI.field('partner_id', 'Odberateľ', { value: c.partner_id, required: true,
              options: [['', '— vyber —'], ...this.partners.map(p => [p.id, p.name])] })}
            ${UI.field('kind', 'Druh', { value: c.kind || 'werkvertrag',
              options: Enums.options('contract_kind') })}
            ${UI.field('date_from', 'Platí od', { type: 'date', value: c.date_from })}
            ${locked ? lockedField('date_to', 'Platí do', c.date_to)
              : UI.field('date_to', 'Platí do', { type: 'date', value: c.date_to })}
            ${UI.field('signed_at', 'Podpísaná dňa', { type: 'date', value: c.signed_at })}
          </div>

          <div class="form-section">Predmet diela</div>
          <div class="regimebox" style="margin:0 0 12px;">
            Píš dielo, nie hodiny. Pri kontrole rozhoduje obsah zmluvy, nie jej
            názov — „4 pracovníci na 160 hodín mesačne" je znak skrytej
            Arbeitnehmerüberlassung, „dodávka a montáž priečok na 2. NP" nie je.</div>
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
          <div class="regimebox" style="margin:0 0 12px;">
            Dielo sa platí za dielo. <strong>Hodinová cena v zmluve o dielo je
            jeden z hlavných znakov skrytej Arbeitnehmerüberlassung</strong> —
            pevná cena alebo cena za jednotku je to, čo zmluvu drží. Ak to inak
            nejde, nechaj hodinovú; dokument potom doplní vetu, že sadzba je
            len podkladom na výpočet odmeny za dielo.</div>
          <div class="form-grid">
            ${UI.field('price_model', 'Ako je cena dohodnutá', {
              value: c.price_model || 'hourly', options: Enums.options('price_model') })}
            ${locked ? lockedField('fixed_price', 'Pevná cena €', c.fixed_price)
              : UI.field('fixed_price', 'Pevná cena €', { type: 'number', step: '0.01',
                value: c.fixed_price })}
            ${UI.field('unit_label', 'Jednotka', { value: c.unit_label,
              placeholder: 'm², bm, kus' })}
            ${locked ? lockedField('unit_price', 'Cena za jednotku €', c.unit_price)
              : UI.field('unit_price', 'Cena za jednotku €', { type: 'number', step: '0.01',
                value: c.unit_price })}
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
                  + 'Sú to naše peniaze, ktoré roky ležia u neho — rátaj s nimi '
                  + 'až po uplynutí záruky.' })}
            ${UI.field('warranty_months', 'Záruka (mesiacov)', { type: 'number',
              value: c.warranty_months, placeholder: '48' })}
            ${UI.field('notice_days', 'Výpovedná lehota (dní)', { type: 'number',
              value: c.notice_days })}
          </div>
          <div class="regimebox" style="margin:10px 0;">
            Zádržné býva 5 % a odberateľ si ho drží až do konca záruky. Kto
            s ním počíta ako s peniazmi na ceste, má vo výhľade o toľko viac,
            než reálne príde.</div>
          ${UI.field('penalty_note', 'Zmluvná pokuta — píš po nemecky, ide to do zmluvy',
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
      if (!d.partner_id) return UI.toast('Vyber odberateľa', 'err');
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
      this.loaded = false; await this.load(); Danubra.renderRoute();
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
          <div class="regimebox" style="margin:0 0 12px;">
            Dodatok sa nedá zmazať ani prepísať. Pôvodná hodnota zostane
            v histórii zmluvy — presne preto, aby sa dalo spätne povedať, na čo
            sa odberateľ podpísal.</div>
          <div class="form-grid">
            ${UI.field('field', 'Čo sa mení', { value: 'date_to',
              options: LOCKED.map(l => [l[0], l[1]]) })}
            ${UI.field('new_value', 'Nová hodnota', { required: true,
              placeholder: 'dátum ako 2026-12-31, sadzba ako 31.50' })}
            ${UI.field('signed_at', 'Dodatok podpísaný dňa', { type: 'date' })}
            ${UI.field('amendment_number', 'Číslo dodatku', {
              value: `Dodatok č. ${this.amendmentsOf(contractId).length + 1}` })}
          </div>
          ${UI.field('reason', 'Prečo', { type: 'textarea', rows: 2,
            placeholder: 'napr. odberateľ predĺžil stavbu o štyri mesiace' })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="Con.detail('${contractId}')">Späť</button>
            <button type="submit" class="btn btn-primary">Zapísať dodatok</button>
          </div>
        </form>`;
      UI.modal('Nový dodatok', body);
    },

    /**
     * Poradie je dôležité: najprv dodatok, potom zmluva. Trigger v databáze
     * overí, že k novej hodnote dodatok existuje — opačné poradie neprejde.
     */
    async saveAmendment(contractId) {
      const c = this.items.find(x => x.id === contractId);
      const d = UI.formData(document.getElementById('am-form'));
      if (!c || !d.new_value) return UI.toast('Vyplň novú hodnotu', 'err');

      const oldValue = c[d.field] == null ? '' : String(c[d.field]);
      const newValue = String(d.new_value).trim();
      if (oldValue === newValue) return UI.toast('Nová hodnota je rovnaká ako pôvodná', 'err');

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
        return UI.toast('Súbor má viac než 25 MB — zmenši ho alebo odfoť nanovo.', 'err');
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
