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
    filters: { city: '', country: '', verification_status: '', q: '' },

    async load() {
      const { data } = await DB.list('accommodations', { order: { column: 'created_at', ascending: false }, limit: 500 });
      this.items = data || [];
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
        <button class="btn btn-primary btn-sm" onclick="Acc.form()">+ Pridať</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const rows = this.filtered();
      el.innerHTML = Danubra.header('Ubytovania', `${this.items.length} v databáze · ${this.items.filter(a => a.verification_status === 'verified').length} overených`) + `
        <div class="filterbar">
          <input class="fb-search" placeholder="Hľadať názov, mesto, majiteľ…" value="${UI.esc(this.filters.q)}"
            oninput="Acc.setF('q',this.value)">
          <select onchange="Acc.setF('country',this.value)">
            <option value="">Všetky krajiny</option>
            ${COUNTRIES.map(c => `<option value="${c}" ${this.filters.country === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
          <select onchange="Acc.setF('verification_status',this.value)">
            <option value="">Všetky stavy</option>
            ${VERIF.map(v => `<option value="${v[0]}" ${this.filters.verification_status === v[0] ? 'selected' : ''}>${v[1]}</option>`).join('')}
          </select>
        </div>
        <div class="count-line">${rows.length} ZÁZNAMOV</div>
        ${rows.length === 0
          ? UI.empty('🛏️', 'Žiadne ubytovania', 'Pridaj prvé alebo importuj CSV.',
              `<button class="btn btn-primary" onclick="Acc.form()">+ Pridať ubytovanie</button>`)
          : `<div class="cards">${rows.map(a => this.card(a)).join('')}</div>`}`;
    },

    card(a) {
      const price = a.price_per_bed_night != null ? `${UI.money(a.price_per_bed_night)}/lôžko/noc` : 'cena neuvedená';
      return `
        <div class="acc-card card" onclick="Acc.detail('${a.id}')">
          <div class="acc-card-head">
            <div>
              <div class="acc-name">${UI.esc(a.name)}</div>
              <div class="acc-loc">${UI.esc(a.city)}${a.country ? ', ' + a.country : ''} · ${this.typeLabel(a.type)}</div>
            </div>
            ${this.verifBadge(a.verification_status)}
          </div>
          <div class="acc-meta">
            <span>💶 ${price}</span>
            ${a.max_persons ? `<span>👤 max ${a.max_persons}</span>` : ''}
            ${a.beds ? `<span>🛏️ ${a.beds} lôžok</span>` : ''}
            ${a.van_parking ? '<span>🚐 parkovanie</span>' : ''}
            ${a.invoice_payment ? '<span>🧾 na faktúru</span>' : ''}
          </div>
        </div>`;
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
          <button class="btn btn-danger btn-sm" onclick="Acc.del('${a.id}')">Zmazať</button>
          <button class="btn btn-outline btn-sm" onclick="Acc.form('${a.id}')">Upraviť</button>
        </div>`;
      UI.modal(a.name, body, { wide: true });
    },

    async setVerif(id, status) {
      await DB.update('accommodations', id, { verification_status: status, last_contact_at: new Date().toISOString() });
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
          ${UI.field('amenities_csv', 'Vybavenie (čiarkou)', { value: (a.amenities || []).join(', '), placeholder: 'kitchen, wifi, tv' })}
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
      if (!confirm('Zmazať toto ubytovanie?')) return;
      const { error } = await DB.remove('accommodations', id);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal(); UI.toast('Zmazané', 'ok');
      this.items = this.items.filter(x => x.id !== id); Danubra.renderRoute();
    },

    // ── CSV import ────────────────────────────────────────────────────────
    importCsv() {
      const body = `
        <p style="font-size:13px;color:var(--ink-sub);margin-top:0;">
          Prilep CSV. Prvý riadok = hlavičky. Rozpoznané stĺpce: <code>name, city, country, type,
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
  Danubra.views.accommodations = function (el) { Acc.view(el); };
})();
