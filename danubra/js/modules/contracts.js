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
  // Polia, ktoré po podpise chráni trigger.
  const LOCKED = [
    ['date_to', 'Koniec platnosti'],
    ['charge_rate', 'Fakturovaná sadzba'],
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

      const amRow = (a) => {
        const label = (LOCKED.find(l => l[0] === a.field) || [, a.field])[1];
        const fmt = (v) => (a.field === 'charge_rate' && v
          ? Money.format(Money.toCents(v)) : (v || '—'));
        return `<div class="note">
          <div class="note-meta">
            <b>${UI.esc(a.amendment_number || label)}</b>
            <span>${a.created_at ? UI.date(a.created_at) : ''}</span>
            ${a.signed_at ? `<em>podpísaný ${UI.date(a.signed_at)}</em>` : '<em>nepodpísaný</em>'}
          </div>
          <div class="note-body">${UI.esc(label)}: ${UI.esc(fmt(a.old_value))}
            → <strong>${UI.esc(fmt(a.new_value))}</strong>${a.reason ? `\n${UI.esc(a.reason)}` : ''}</div>
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
          ${c.charge_rate ? `<div><span>Sadzba</span><strong>${Money.format(Money.toCents(c.charge_rate))} / h</strong></div>` : ''}
          <div><span>Splatnosť</span><strong>${c.payment_terms_days || 30} dní</strong></div>
          ${c.signed_at ? `<div><span>Podpísaná</span><strong>${UI.date(c.signed_at)}</strong></div>` : ''}
        </div>

        ${c.scope ? `
          <div class="form-section">Predmet diela</div>
          <div class="notebox">${UI.esc(c.scope)}</div>` : ''}
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

        <div class="modal-actions">
          <button class="btn btn-outline btn-sm" onclick="Con.form('${c.id}')">Upraviť</button>
        </div>`;
      UI.modal(c.title, body, { wide: true });
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
            ${locked ? lockedField('charge_rate', 'Sadzba €/h', c.charge_rate)
              : UI.field('charge_rate', 'Sadzba €/h', { type: 'number', value: c.charge_rate })}
            ${UI.field('payment_terms_days', 'Splatnosť (dní)', { type: 'number',
              value: c.payment_terms_days ?? 30 })}
            ${UI.field('signed_at', 'Podpísaná dňa', { type: 'date', value: c.signed_at })}
          </div>

          <div class="form-section">Predmet diela</div>
          <div class="regimebox" style="margin:0 0 12px;">
            Píš dielo, nie hodiny. Pri kontrole rozhoduje obsah zmluvy, nie jej
            názov — „4 pracovníci na 160 hodín mesačne" je znak skrytej
            Arbeitnehmerüberlassung, „dodávka a montáž priečok na 2. NP" nie je.</div>
          ${UI.field('scope', '', { type: 'textarea', rows: 4, value: c.scope,
            placeholder: 'Dodávka a montáž sadrokartónových priečok a podhľadov na 2. a 3. NP…' })}

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
      ['charge_rate', 'payment_terms_days']
        .forEach(k => { if (k in payload) payload[k] = d[k] === '' ? null : Number(d[k]); });
      ['date_from', 'date_to', 'signed_at']
        .forEach(k => { if (payload[k] === '') payload[k] = null; });

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

      const patch = { [d.field]: d.field === 'charge_rate' ? Number(newValue) : newValue };
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
  };

  window.Con = Con;
  Danubra.views.contracts = function (el) { return Con.view(el); };
})();
