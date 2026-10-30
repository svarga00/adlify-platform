// ============================================================================
// DANUBRA — M2 Ubytovania (CRUD, filtre, rýchle pridanie, CSV import)
// ============================================================================
(function () {
  const TYPES = [['zimmer', 'Izba (Zimmer)'], ['wohnung', 'Byt (Wohnung)'], ['pension', 'Penzión'], ['haus', 'Dom (Haus)'], ['hostel', 'Hostel']];
  const COUNTRIES = ['DE', 'AT', 'CH', 'LU', 'CZ', 'HU'];
  const VERIF = [
    ['new', 'Nový', 'gray'], ['contacted', 'Kontaktovaný', 'blue'],
    ['prices_confirmed', 'Ceny potvrdené', 'amber'], ['verified', 'Overený', 'green'],
    ['not_cooperating', 'Nespolupracuje', 'red'],
  ];
  const AMENITIES = [
    ['kitchen', 'Kuchyňa'], ['washing_machine', 'Práčka'], ['wifi', 'WiFi'],
    ['tv', 'TV'], ['private_bathroom', 'Vlastná kúpeľňa'], ['bed_linen', 'Posteľná bielizeň'],
  ];

  const Acc = {
    items: [],
    loaded: false,
    // Obsadenosť a väzby na zákazky (pohľad `v_lodging_occupancy` — počíta sa
    // z pobytov) a názvy zákaziek. Len na čítanie, kvôli stĺpcom zoznamu.
    occupancy: [], subs: [],
    // Staré filtre zostali kvôli `Acc.filtered()`; obrazovka má `DataList`.
    filters: { city: '', country: '', verification_status: '', q: '' },

    async load() {
      const [r, o, s] = await Promise.all([
        DB.list('accommodations', { order: { column: 'created_at', ascending: false }, limit: 500 }),
        DB.list('v_lodging_occupancy', { limit: 2000 }),
        DB.list('subcontracts', { select: 'id,title,status,site_city', limit: 500 }),
      ]);
      this.items = (r && r.data) || [];
      this.occupancy = (o && o.data) || [];
      this.subs = (s && s.data) || [];
      this.loaded = true;
    },

    verifBadge(s) {
      const v = VERIF.find(x => x[0] === s) || VERIF[0];
      return UI.badge(v[1], v[2]);
    },
    typeLabel(t) { const x = TYPES.find(y => y[0] === t); return x ? x[1] : (t || '—'); },

    filtered() {
      const f = this.filters;
      return this.items.filter(a => {
        if (f.country && a.country !== f.country) return false;
        if (f.verification_status && a.verification_status !== f.verification_status) return false;
        if (f.city && !(a.city || '').toLowerCase().includes(f.city.toLowerCase())) return false;
        if (f.q) {
          const hay = `${a.name} ${a.city} ${a.owner_name || ''}`.toLowerCase();
          if (!hay.includes(f.q.toLowerCase())) return false;
        }
        return true;
      });
    },

    async view(el) {
      Danubra.setActions(`
        <button class="btn btn-outline btn-sm" onclick="Acc.importCsv()">Import CSV</button>
        <button class="btn btn-primary btn-sm" onclick="Acc.form()">${Icon('plus')} Pridať</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const today = new Date().toISOString().slice(0, 10);
      const rows = this.items.map(a => this.listRow(a, today));
      const active = rows.filter(r => r.active).length;
      // Zoznam je spoločný komponent (`DataList`). Dovtedy tu boli karty
      // a tri filtre (krajina, stav, hľadanie) — nebolo vidieť, kde je voľné
      // miesto a ktoré ubytovanie práve slúži niektorej zákazke.
      el.innerHTML = Danubra.header('Ubytovania',
        `${this.items.length} v databáze · ${this.items.filter(a => a.verification_status === 'verified').length} overených · ${active} pri bežiacej zákazke`)
        + DataList.html(this.listConfig(rows));
    },

    /** Riadok zoznamu: ubytovanie, jeho väzby na zákazky a obsadenosť dnes. */
    listRow(a, today) {
      const links = this.occupancy.filter(o => o.accommodation_id === a.id);
      const now = links.filter(l => (!l.date_from || String(l.date_from).slice(0, 10) <= today)
        && (!l.date_to || String(l.date_to).slice(0, 10) >= today));
      const subOf = (id) => this.subs.find(s => s.id === id) || null;
      const running = now.filter(l => { const s = subOf(l.subcontract_id); return !s || ['won', 'active'].includes(s.status); });
      const capacity = Number(a.max_persons) || Number(a.beds) || null;
      const occupied = running.reduce((n, l) => n + (Number(l.occupied_now) || 0), 0);
      const subIds = [...new Set(links.map(l => l.subcontract_id).filter(Boolean))];
      const price = a.price_per_bed_night != null ? Number(a.price_per_bed_night)
        : a.price_month != null ? Number(a.price_month) / 30 : null;
      return {
        id: a.id, a, links, active: running.length > 0, occupied, capacity,
        free: capacity != null ? Math.max(capacity - occupied, 0) : null,
        subIds, subNames: subIds.map(id => (subOf(id) || {}).title).filter(Boolean),
        activeSubs: [...new Set(running.map(l => l.subcontract_id))].map(id => (subOf(id) || {}).title).filter(Boolean),
        price, city: a.city || '',
      };
    },

    /** Konfigurácia zoznamu ubytovaní pre `DataList`. */
    listConfig(rows) {
      const money = (n) => UI.money(n);
      const placeCell = (r) => {
        if (r.capacity == null) return r.occupied ? `<span class="dl-num"><b>${r.occupied}</b> býva</span>` : '';
        const full = r.free === 0 && r.active;
        return `<span class="dl-two"><span class="dl-num"><b${full ? ' class="is-short"' : ''}>${r.occupied}</b> / ${r.capacity}</span>${
          r.active ? `<small class="${full ? 'acc-full' : ''}">${full ? 'plné' : `${r.free} ${Shell.plural(r.free, 'voľné miesto', 'voľné miesta', 'voľných miest')}`}</small>`
            : `<small>${r.capacity} ${Shell.plural(r.capacity, 'miesto', 'miesta', 'miest')}</small>`}</span>`;
      };
      const priceCell = (r) => {
        const a = r.a;
        if (a.price_per_bed_night != null) return `<span class="dl-two"><b class="dl-num">${money(a.price_per_bed_night)}</b><small>lôžko / noc</small></span>`;
        if (a.price_week != null) return `<span class="dl-two"><b class="dl-num">${money(a.price_week)}</b><small>týždeň</small></span>`;
        if (a.price_month != null) return `<span class="dl-two"><b class="dl-num">${money(a.price_month)}</b><small>mesiac</small></span>`;
        return '<span class="dl-note is-mute">neuvedená</span>';
      };
      const contactCell = (r) => {
        const a = r.a;
        if (!a.owner_name && !a.owner_phone && !a.owner_email) return '';
        return `<span class="dl-two"><b>${UI.esc(a.owner_name || a.owner_email || '')}</b>${
          a.owner_phone ? `<small>${UI.esc(a.owner_phone)}${a.owner_whatsapp ? ' · WhatsApp' : ''}</small>` : a.owner_name && a.owner_email ? `<small>${UI.esc(a.owner_email)}</small>` : ''}</span>`;
      };
      const subsCell = (r) => {
        if (!r.subNames.length) return '';
        const first = r.activeSubs[0] || r.subNames[0];
        const more = r.subNames.length - 1;
        return `<span class="dl-two"><b title="${UI.esc(r.subNames.join(', '))}">${UI.esc(first)}</b><small>${
          r.active ? 'býva sa tam teraz' : 'teraz nikto'}${more > 0 ? ` · +${more}` : ''}</small></span>`;
      };
      const extras = (a) => [a.van_parking ? 'parkovanie' : '', a.invoice_payment ? 'na faktúru' : ''].filter(Boolean).join(' · ');

      return {
        id: 'ubytovania', storageKey: 'ubytovania', label: 'Ubytovania',
        noun: ['ubytovanie', 'ubytovania', 'ubytovaní'],
        rows,
        rowClick: (r) => Acc.detail(r.id),
        rowClass: (r) => (r.a.verification_status === 'not_cooperating' ? 'is-muted' : r.active && r.free === 0 ? 'is-warn' : ''),
        rowLabel: (r) => `Ubytovanie ${r.a.name}`,
        rowActions: [{ ico: 'chevron', label: 'Otvoriť ubytovanie', run: (r) => Acc.detail(r.id) }],
        columns: [
          { key: 'nazov', label: 'Ubytovanie', width: 'minmax(170px, 1.6fr)', mobile: 'title',
            render: (r) => `<span class="dl-title"><b>${UI.esc(r.a.name || '—')}</b><small>${
              UI.esc([r.a.type ? this.typeLabel(r.a.type) : '', extras(r.a)].filter(Boolean).join(' · '))}</small></span>`,
            sortValue: (r) => r.a.name, sortLabel: 'Názov' },
          { key: 'mesto', label: 'Mesto', width: 'minmax(110px, 1fr)',
            render: (r) => (r.city ? `<span class="dl-two"><b>${UI.esc(r.city)}${r.a.country ? `, ${UI.esc(r.a.country)}` : ''}</b>${
              r.a.highway_distance_km != null ? `<small>${UI.esc(r.a.highway_distance_km)} km k diaľnici</small>` : ''}</span>` : ''),
            sortValue: (r) => r.city },
          { key: 'miesta', label: 'Obsadené', width: '112px', mobileLabel: 'obsadené',
            tip: 'Koľko ľudí tam dnes býva (z pobytov pri zákazkách) z koľkých miest (max. osôb, inak lôžok).',
            render: placeCell, sortValue: (r) => [r.active ? 0 : 1, r.free == null ? null : -r.free], sortLabel: 'Voľné miesta' },
          { key: 'cena', label: 'Cena', width: '104px', align: 'right',
            render: priceCell, sortValue: (r) => r.price, csv: (r) => r.a.price_per_bed_night },
          { key: 'kontakt', label: 'Kontakt', width: 'minmax(120px, 1fr)', hideBelow: 1100, render: contactCell,
            sortValue: (r) => r.a.owner_name, csv: (r) => [r.a.owner_name, r.a.owner_phone, r.a.owner_email] },
          { key: 'zakazky', label: 'Zákazky', width: 'minmax(130px, 1.2fr)', mobile: 'line', render: subsCell,
            sortValue: (r) => [r.active ? 0 : 1, r.subNames.length ? 0 : 1, r.a.name], sortLabel: 'Pri zákazke (aktívne hore)' },
          { key: 'stav', label: 'Overenie', width: '118px', mobile: 'badge',
            render: (r) => this.verifBadge(r.a.verification_status),
            sortValue: (r) => VERIF.findIndex(v => v[0] === (r.a.verification_status || 'new')) },
        ],
        sorts: [{ key: 'pridane', label: 'Pridané', value: (r) => r.a.created_at, dir: -1 }],
        sort: { key: 'zakazky', dir: 1 },
        groups: [
          { key: 'mesto', label: 'Mesto', value: (r) => r.city, labelOf: (k) => k || 'Bez mesta' },
          { key: 'stav', label: 'Overenie', value: (r) => r.a.verification_status || 'new',
            labelOf: (k) => (VERIF.find(v => v[0] === k) || VERIF[0])[1],
            tone: (k) => (VERIF.find(v => v[0] === k) || VERIF[0])[2], order: VERIF.map(v => v[0]) },
        ],
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať názov, mesto, majiteľa…', label: 'Hľadať názov, mesto, adresu alebo majiteľa',
            fields: ['a.name', 'city', 'a.owner_name', 'a.address', 'a.postal_code', 'a.owner_phone', (r) => r.subNames.join(' ')] },
          { key: 'mesto', type: 'select', label: 'Mesto', value: 'city', allLabel: 'Všetky mestá', emptyLabel: 'Bez mesta' },
          { key: 'volne', type: 'toggle', label: 'S voľným miestom', test: (r) => r.capacity != null && r.free > 0,
            hint: 'Ubytovania, kde dnes ostáva aspoň jedno voľné miesto (kapacita mínus tí, čo tam dnes bývajú).' },
          { key: 'aktivne', type: 'toggle', label: 'Aktívne', test: (r) => r.active,
            hint: 'Ubytovania, kde sa dnes býva pri získanej alebo bežiacej zákazke.' },
          { key: 'stav', type: 'multi', label: 'Overenie', value: (r) => r.a.verification_status || 'new',
            options: VERIF.map(v => [v[0], v[1]]), sortOptions: false,
            presets: [{ label: 'Spolupracujú', value: ['new', 'contacted', 'prices_confirmed', 'verified'], hint: 'Bez tých, ktoré nespolupracujú' }] },
          { key: 'krajina', type: 'select', label: 'Krajina', value: (r) => r.a.country, more: true,
            options: COUNTRIES.map(c => [c, c]), allLabel: 'Všetky krajiny' },
          { key: 'typ', type: 'select', label: 'Typ', value: (r) => r.a.type, more: true,
            options: TYPES, emptyLabel: 'Nezadaný', allLabel: 'Všetky typy' },
          { key: 'zakazka', type: 'select', label: 'Zákazka', value: 'subIds', more: true,
            optionLabel: (v) => (this.subs.find(s => s.id === v) || {}).title || v, allLabel: 'Všetky zákazky' },
          { key: 'cena', type: 'range-number', label: 'Cena za lôžko a noc', value: (r) => r.a.price_per_bed_night, unit: '€', more: true },
          { key: 'faktura', type: 'toggle', label: 'Platba na faktúru', test: (r) => !!r.a.invoice_payment, more: true },
          { key: 'parking', type: 'toggle', label: 'Parkovanie pre dodávku', test: (r) => !!r.a.van_parking, more: true },
        ],
        empty: { ico: 'bed', title: 'Žiadne ubytovania', sub: 'Pridajte prvé alebo importujte CSV.',
          cta: `<button class="btn btn-primary" onclick="Acc.form()">${Icon('plus')} Pridať ubytovanie</button>` },
        export: {
          name: ['ubytovania'],
          columns: [
            ['Názov', r => r.a.name], ['Typ', r => this.typeLabel(r.a.type)], ['Mesto', r => r.city], ['Krajina', r => r.a.country],
            ['Adresa', r => r.a.address], ['PSČ', r => r.a.postal_code],
            ['Kapacita', r => r.capacity], ['Býva dnes', r => r.occupied], ['Voľné', r => r.free],
            ['Cena lôžko/noc', r => r.a.price_per_bed_night], ['Cena týždeň', r => r.a.price_week], ['Cena mesiac', r => r.a.price_month],
            ['Majiteľ', r => r.a.owner_name], ['Telefón', r => r.a.owner_phone], ['E-mail', r => r.a.owner_email],
            ['Zákazky', r => r.subNames.join(', ')],
            ['Overenie', r => (VERIF.find(v => v[0] === r.a.verification_status) || VERIF[0])[1]],
          ],
        },
      };
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    // ── Detail ────────────────────────────────────────────────────────────
    async detail(id) {
      const a = this.items.find(x => x.id === id) || (await DB.getById('accommodations', id)).data;
      if (!a) return UI.toast('Nenájdené', 'err');
      const rows = [
        ['Typ', this.typeLabel(a.type)], ['Mesto', `${a.city || ''}${a.country ? ', ' + a.country : ''}`],
        ['Adresa', a.address], ['PSČ', a.postal_code],
        ['Lôžka / izby', [a.beds, a.rooms].filter(x => x != null).join(' / ')],
        ['Max osôb', a.max_persons], ['Cena/lôžko/noc', a.price_per_bed_night != null ? UI.money(a.price_per_bed_night) : null],
        ['Cena/týždeň', a.price_week != null ? UI.money(a.price_week) : null],
        ['Cena/mesiac', a.price_month != null ? UI.money(a.price_month) : null],
        ['Min. nocí', a.min_nights], ['Diaľnica', a.highway_distance_km != null ? a.highway_distance_km + ' km' : null],
        ['Platba na faktúru', a.invoice_payment ? 'Áno' : 'Nie'], ['DPH režim', a.vat_regime],
        ['Majiteľ', a.owner_name], ['Tel. majiteľ', a.owner_phone], ['E-mail majiteľ', a.owner_email],
      ].filter(r => r[1] != null && r[1] !== '');

      const amen = (a.amenities || []).map(x => { const y = AMENITIES.find(z => z[0] === x); return y ? y[1] : x; });
      const body = `
        <div class="detail-head">
          ${this.verifBadge(a.verification_status)}
          <select class="verif-sel" onchange="Acc.setVerif('${a.id}',this.value)">
            ${VERIF.map(v => `<option value="${v[0]}" ${a.verification_status === v[0] ? 'selected' : ''}>${v[1]}</option>`).join('')}
          </select>
        </div>
        ${CommPanel.render({ contact: { phone: a.owner_phone, email: a.owner_email, whatsapp: a.owner_whatsapp, name: a.owner_name }, entity: { type: 'accommodation', id: a.id } })}
        <div class="kv">${rows.map(r => `<div><span>${r[0]}</span><strong>${UI.esc(r[1])}</strong></div>`).join('')}</div>
        ${amen.length ? `<div class="chips">${amen.map(x => `<span class="chip">${UI.esc(x)}</span>`).join('')}</div>` : ''}
        ${a.notes ? `<div class="notebox">${UI.esc(a.notes)}</div>` : ''}
        <div class="modal-actions">
          <button class="btn btn-danger" onclick="Acc.del('${a.id}')">${Icon('archive', 14)} Archivovať</button>
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          <button class="btn btn-primary" onclick="Acc.form('${a.id}')">Upraviť</button>
        </div>`;
      UI.modal(a.name, body, { wide: true });
    },

    async setVerif(id, status) {
      const { error } = await DB.update('accommodations', id, { verification_status: status, last_contact_at: new Date().toISOString() });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const it = this.items.find(x => x.id === id); if (it) it.verification_status = status;
      UI.toast('Stav uložený', 'ok');
    },

    // ── Formulár (plný / edit) ────────────────────────────────────────────
    form(id) {
      const a = id ? this.items.find(x => x.id === id) || {} : {};
      const body = `
        <form id="acc-form" onsubmit="event.preventDefault();Acc.save('${id || ''}')">
          <div class="form-grid">
            ${UI.field('name', 'Názov', { value: a.name, required: true })}
            ${UI.field('type', 'Typ', { value: a.type, options: [['', '—'], ...TYPES] })}
            ${UI.field('city', 'Mesto', { value: a.city, required: true })}
            ${UI.field('country', 'Krajina', { value: a.country, options: [['', '—'], ...COUNTRIES.map(c => [c, c])] })}
            ${UI.field('postal_code', 'PSČ', { value: a.postal_code })}
            ${UI.field('address', 'Adresa', { value: a.address })}
            ${UI.field('beds', 'Lôžka', { type: 'number', value: a.beds })}
            ${UI.field('rooms', 'Izby', { type: 'number', value: a.rooms })}
            ${UI.field('max_persons', 'Max osôb', { type: 'number', value: a.max_persons })}
            ${UI.field('price_per_bed_night', 'Cena/lôžko/noc €', { type: 'number', value: a.price_per_bed_night })}
            ${UI.field('price_week', 'Cena/týždeň €', { type: 'number', value: a.price_week })}
            ${UI.field('price_month', 'Cena/mesiac €', { type: 'number', value: a.price_month })}
            ${UI.field('min_nights', 'Min. nocí', { type: 'number', value: a.min_nights })}
            ${UI.field('highway_distance_km', 'Diaľnica (km)', { type: 'number', value: a.highway_distance_km })}
            ${UI.field('owner_name', 'Majiteľ', { value: a.owner_name })}
            ${UI.field('owner_phone', 'Tel. majiteľ', { value: a.owner_phone })}
            ${UI.field('owner_email', 'E-mail majiteľ', { type: 'email', value: a.owner_email })}
            ${UI.field('vat_regime', 'DPH režim', { value: a.vat_regime, options: [['', '—'], ['mwst', 'MwSt'], ['kleinunternehmer', 'Kleinunternehmer'], ['unknown', 'Neznámy']] })}
          </div>
          <div class="chk-row">
            ${UI.field('van_parking', '', { type: 'checkbox', value: a.van_parking, placeholder: 'Parkovanie pre dodávku' })}
            ${UI.field('owner_whatsapp', '', { type: 'checkbox', value: a.owner_whatsapp, placeholder: 'Majiteľ má WhatsApp' })}
            ${UI.field('invoice_payment', '', { type: 'checkbox', value: a.invoice_payment, placeholder: 'Platba na faktúru' })}
          </div>
          <div class="form-section">Prístupové údaje · skopírujú sa do spisu po platbe</div>
          <div class="form-grid">
            ${UI.field('access_door_code', 'Kód dverí', { value: a.access_door_code })}
            ${UI.field('gate_code', 'Kód brány', { value: a.gate_code })}
            ${UI.field('wifi_ssid', 'WiFi sieť', { value: a.wifi_ssid })}
            ${UI.field('wifi_password', 'WiFi heslo', { value: a.wifi_password })}
            ${UI.field('room_number', 'Číslo izby', { value: a.room_number })}
            ${UI.field('floor', 'Poschodie', { value: a.floor })}
            ${UI.field('access_key_location', 'Kde sú kľúče', { value: a.access_key_location })}
            ${UI.field('deposit_amount', 'Kaucia €', { type: 'number', value: a.deposit_amount })}
          </div>
          <div class="form-grid">
            <div class="fld-full">${UI.field('amenities_csv', 'Vybavenie (čiarkou)', { value: (a.amenities || []).join(', '), placeholder: 'kitchen, wifi, tv' })}</div>
          </div>
          ${UI.field('notes', 'Poznámka', { type: 'textarea', value: a.notes })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Pridať'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť ubytovanie' : 'Nové ubytovanie', body, { wide: true });
    },

    async save(id) {
      const d = UI.formData(document.getElementById('acc-form'));
      if (!d.name || !d.city) return UI.toast('Názov a mesto sú povinné', 'err');
      const numF = ['beds', 'rooms', 'max_persons', 'price_per_bed_night', 'price_week', 'price_month', 'min_nights', 'highway_distance_km', 'deposit_amount'];
      const payload = { ...d };
      numF.forEach(k => { payload[k] = d[k] === '' || d[k] == null ? null : Number(d[k]); });
      payload.amenities = (d.amenities_csv || '').split(',').map(s => s.trim()).filter(Boolean);
      delete payload.amenities_csv;
      const res = id ? await DB.update('accommodations', id, payload) : await DB.insert('accommodations', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal();
      UI.toast(id ? 'Uložené' : 'Pridané', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    async del(id) {
      if (!await UI.confirmArchive('Presunúť toto ubytovanie do archívu?')) return;
      const { error } = await DB.archive('accommodations', id);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal(); UI.toast(UI.ARCHIVED, 'ok');
      this.items = this.items.filter(x => x.id !== id); Danubra.renderRoute();
    },

    // ── CSV import ────────────────────────────────────────────────────────
    importCsv() {
      const body = `
        <p class="modal-lead">
          Prilepte CSV. Prvý riadok = hlavičky. Rozpoznané stĺpce: <code>name, city, country, type,
          price_per_bed_night, max_persons, beds, owner_name, owner_phone, owner_email</code></p>
        <textarea id="csv-in" rows="10" style="width:100%;font-family:monospace;font-size:12px;"
          placeholder="name,city,country,price_per_bed_night&#10;Haus Berlin,Berlin,DE,18"></textarea>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
          <button class="btn btn-primary" onclick="Acc.runImport()">Importovať</button>
        </div>`;
      UI.modal('Import ubytovaní z CSV', body, { wide: true });
    },

    async runImport() {
      const raw = document.getElementById('csv-in').value.trim();
      if (!raw) return;
      const lines = raw.split(/\r?\n/).filter(Boolean);
      const headers = lines[0].split(',').map(h => h.trim());
      const numF = ['price_per_bed_night', 'max_persons', 'beds', 'rooms', 'min_nights'];
      const rows = lines.slice(1).map(line => {
        const cells = line.split(',');
        const o = {};
        headers.forEach((h, i) => { const v = (cells[i] || '').trim(); if (v) o[h] = numF.includes(h) ? Number(v) : v; });
        return o;
      }).filter(o => o.name && o.city);
      if (rows.length === 0) return UI.toast('Žiadne platné riadky (name + city povinné)', 'err');
      const { error } = await DB.from('accommodations').insert(rows);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal(); UI.toast(`Importovaných ${rows.length}`, 'ok');
      await this.load(); Danubra.renderRoute();
    },
  };

  window.Acc = Acc;
  Danubra.views.accommodations = function (el) { return Acc.view(el); };
})();
