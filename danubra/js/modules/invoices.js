// ============================================================================
// DANUBRA — M6 Faktúry (zoznam, schvaľovanie návrhov, dokument s QR, úhrada)
// ============================================================================
// §5.2: návrhy za priebežnú službu vyžadujú ľudské schválenie pred odoslaním.
// ============================================================================
(function () {
  const STATUS = [
    ['draft_pending_approval', 'Čaká na schválenie', 'amber'],
    ['issued', 'Vystavená', 'blue'],
    ['paid', 'Uhradená', 'green'],
    ['overdue', 'Po splatnosti', 'red'],
    ['cancelled', 'Stornovaná', 'gray'],
  ];
  const TYPE = {
    service_fee: 'Sprostredkovanie', ongoing_service: 'Priebežná služba',
    retainer: 'Retainer', other: 'Iné',
  };
  const REGIME = {
    sk_no_vat: 'SK bez DPH', eu_reverse_charge: 'Reverse charge', other: 'Na kontrolu',
  };

  const Inv = {
    items: [], lines: [], clients: [], orders: [], loaded: false,
    filters: { status: '' },

    async load() {
      const [i, l, c, o] = await Promise.all([
        DB.list('invoices', { order: { column: 'issue_date', ascending: false }, limit: 500 }),
        DB.list('invoice_items', { limit: 3000 }),
        DB.list('clients', { select: 'id,name,country,vat_id,company_id,contact_person,phone,email,whatsapp', limit: 500 }),
        DB.list('orders', { select: 'id,order_number,client_id,service_fee,urgent_surcharge,date_from,date_to,persons,ongoing_service_enabled,ongoing_service_rate,status', limit: 500 }),
      ]);
      this.items = i.data || []; this.lines = l.data || [];
      this.clients = c.data || []; this.orders = o.data || [];
      this.loaded = true;
      await this._markOverdue();
    },

    /** Faktúry po splatnosti označ automaticky (§7 denný cron robí to isté serverovo). */
    async _markOverdue() {
      const today = new Date().toISOString().slice(0, 10);
      const late = this.items.filter(x => x.status === 'issued' && x.due_date && x.due_date < today);
      for (const x of late) {
        await DB.update('invoices', x.id, { status: 'overdue' }).catch(() => {});
        x.status = 'overdue';
      }
    },

    clientOf(id) { return this.clients.find(c => c.id === id); },
    linesOf(id) { return this.lines.filter(l => l.invoice_id === id); },
    badge(s) { const m = STATUS.find(x => x[0] === s) || STATUS[1]; return UI.badge(m[1], m[2]); },

    async view(el) {
      Danubra.setActions(`<button class="btn btn-primary btn-sm" onclick="Inv.newInvoice()">${Icon('plus')} Nová faktúra</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const rows = this.filters.status ? this.items.filter(x => x.status === this.filters.status) : this.items;

      const pending = this.items.filter(x => x.status === 'draft_pending_approval');
      const unpaid = this.items.filter(x => ['issued', 'overdue'].includes(x.status));
      const unpaidSum = unpaid.reduce((s, x) => s + Number(x.total || 0), 0);

      el.innerHTML = Danubra.header('Faktúry',
        `${this.items.length} celkom · neuhradené ${UI.money(unpaidSum)}`) +
        (pending.length ? `<div class="warnbox" style="margin-bottom:14px;">
          ${Icon('alert', 14)} ${pending.length} ${pending.length === 1 ? 'návrh čaká' : 'návrhov čaká'} na schválenie —
          faktúry za priebežnú službu sa neodosielajú automaticky.</div>` : '') + `
        <div class="pillbar" style="margin-bottom:14px;width:max-content;max-width:100%;overflow-x:auto;">
          <button class="pill${!this.filters.status ? ' active' : ''}" onclick="Inv.setF('')">Všetky</button>
          ${STATUS.map(s => {
            const n = this.items.filter(x => x.status === s[0]).length;
            return n ? `<button class="pill${this.filters.status === s[0] ? ' active' : ''}" onclick="Inv.setF('${s[0]}')">${s[1]} ${n}</button>` : '';
          }).join('')}
        </div>
        <div class="count-line">${rows.length} ZÁZNAMOV</div>
        ${rows.length === 0
          ? UI.empty('invoices', 'Žiadne faktúry', 'Vystaviť sa dá z objednávky, z dopytu alebo úplne voľne.',
              `<button class="btn btn-primary" onclick="Inv.newInvoice()">${Icon('plus')} Nová faktúra</button>`)
          : `<div class="cards">${rows.map(x => this.card(x)).join('')}</div>`}`;
    },

    card(x) {
      const c = this.clientOf(x.client_id);
      const late = x.status === 'overdue';
      return `
        <div class="acc-card card" onclick="Inv.detail('${x.id}')">
          <div class="acc-card-head">
            <div>
              <div class="acc-name mono" style="font-size:13px;letter-spacing:.02em;">${UI.esc(x.invoice_number || '—')}</div>
              <div class="acc-loc">${c ? UI.esc(c.name) : '—'} · ${TYPE[x.type] || x.type || ''}</div>
            </div>
            ${this.badge(x.status)}
          </div>
          <div class="acc-meta">
            <span style="font-weight:700;color:var(--navy);">${UI.money(x.total, x.currency)}</span>
            <span>${Icon('calendar', 14)} splatnosť ${UI.date(x.due_date)}</span>
            ${late ? `<span style="color:var(--red);font-weight:700;">${Icon('alert', 14)} po splatnosti</span>` : ''}
            ${x.billing_period_from ? `<span>${Icon('repeat', 14)} ${UI.date(x.billing_period_from)}–${UI.date(x.billing_period_to)}</span>` : ''}
          </div>
        </div>`;
    },

    setF(v) { this.filters.status = v; Danubra.renderRoute(); },

    async detail(id) {
      const x = this.items.find(i => i.id === id);
      if (!x) return UI.toast('Nenájdené', 'err');
      const c = this.clientOf(x.client_id);
      const items = this.linesOf(id);
      const ord = this.orders.find(o => o.id === x.order_id);
      const regime = REGIME[x.vat_regime] || x.vat_regime || '—';

      const rows = [
        ['Klient', c?.name], ['Typ', TYPE[x.type] || x.type],
        ['Objednávka', ord?.order_number], ['Vystavená', UI.date(x.issue_date)],
        ['Splatnosť', UI.date(x.due_date)], ['Režim DPH', regime],
        ['Obdobie', x.billing_period_from ? `${UI.date(x.billing_period_from)} – ${UI.date(x.billing_period_to)}` : null],
        ['Uhradená', x.paid_at ? new Date(x.paid_at).toLocaleString('sk-SK') : null],
      ].filter(r => r[1] != null && r[1] !== '');

      const body = `
        <div class="detail-head">${this.badge(x.status)}
          <span class="mono" style="font-size:11px;color:var(--ink-mute);letter-spacing:.1em;">${UI.esc(x.invoice_number || '')}</span>
        </div>
        ${x.status === 'draft_pending_approval' ? `<div class="warnbox">
          ${Icon('alert', 14)} Toto je návrh — pred odoslaním klientovi ho musíš schváliť.</div>` : ''}
        ${c ? CommPanel.render({ contact: { phone: c.phone, email: c.email, whatsapp: c.whatsapp, name: c.name }, entity: { type: 'client', id: c.id } }) : ''}
        <div class="kv">${rows.map(r => `<div><span>${r[0]}</span><strong>${UI.esc(r[1])}</strong></div>`).join('')}</div>

        <div class="form-section">Položky</div>
        ${items.map(i => `<div class="list-row" style="cursor:default;">
          <span style="flex:1;font-size:13px;">${UI.esc(i.description)}
            <span style="color:var(--ink-mute);font-size:12px;display:block;">
              ${Number(i.quantity || 0).toLocaleString('sk-SK')} ${UI.esc(i.unit || '')} × ${UI.money(i.unit_price)}</span>
          </span>
          <strong>${UI.money(i.total)}</strong></div>`).join('') || '<div style="color:var(--ink-mute);font-size:13px;">Bez položiek.</div>'}
        <div class="service-total" style="background:var(--field);border-color:var(--border);">
          <div style="font-weight:700;">Na úhradu</div>
          <div style="font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;">${UI.money(x.total, x.currency)}</div>
        </div>

        <div class="modal-actions">
          ${x.status === 'draft_pending_approval'
            ? `<button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="Inv.del('${x.id}')">Zahodiť návrh</button>
               <button class="btn btn-primary btn-sm" onclick="Inv.approve('${x.id}')">${Icon('check')} Schváliť a vystaviť</button>`
            : `<button class="btn btn-outline btn-sm" onclick="Inv.openDoc('${x.id}')">${Icon('doc')} Dokument s QR</button>
               ${x.status !== 'paid'
                 ? `<button class="btn btn-primary btn-sm" onclick="Inv.markPaid('${x.id}')">${Icon('check')} Označiť uhradenú</button>`
                 : ''}`}
        </div>`;
      UI.modal(`Faktúra ${x.invoice_number || ''}`, body, { wide: true });
    },

    async approve(id) {
      const x = this.items.find(i => i.id === id);
      if (!x) return;
      await DB.update('invoices', id, { status: 'issued' });
      x.status = 'issued';
      UI.toast('Faktúra vystavená', 'ok');
      this.detail(id);
      Danubra.renderRoute();
    },

    async markPaid(id) {
      const x = this.items.find(i => i.id === id);
      if (!x) return;
      const now = new Date().toISOString();
      await DB.update('invoices', id, { status: 'paid', paid_at: now });
      Object.assign(x, { status: 'paid', paid_at: now });
      UI.toast('Označená ako uhradená', 'ok');
      this.detail(id);
      Danubra.renderRoute();
    },

    async openDoc(id) {
      const x = this.items.find(i => i.id === id);
      if (!x) return;
      await Invoicing.openDocument(x, this.linesOf(id), this.clientOf(x.client_id));
    },

    async del(id) {
      if (!confirm('Zahodiť tento návrh faktúry?')) return;
      await DB.remove('invoices', id);
      this.items = this.items.filter(i => i.id !== id);
      UI.closeModal(); UI.toast('Návrh zahodený', 'ok');
      Danubra.renderRoute();
    },

    // ── Nová faktúra: voľba zdroja ────────────────────────────────────────
    // Faktúra nie je viazaná na predchádzajúci doklad — vystaviť sa dá
    // z objednávky, z dopytu, alebo úplne voľne pre klienta.
    async newInvoice() {
      if (!this.loaded) await this.load();
      const opt = (ico, title, sub, action) => `
        <button class="list-row" onclick="${action}">
          <span style="color:var(--ink-mute);display:flex;">${Icon(ico, 18)}</span>
          <span style="flex:1;"><strong>${title}</strong>
            <span style="color:var(--ink-mute);display:block;font-size:12.5px;">${sub}</span></span>
          <span style="color:var(--ink-mute);display:flex;">${Icon('chevron', 15)}</span></button>`;
      UI.modal('Z čoho vystaviť faktúru?', `
        <div style="display:flex;flex-direction:column;gap:2px;">
          ${opt('orders', 'Z objednávky', 'Poplatok za sprostredkovanie alebo priebežná služba', 'Inv.pickOrder()')}
          ${opt('inquiries', 'Z dopytu', 'Ešte pred objednávkou — napríklad záloha alebo rezervácia', 'Inv.pickInquiry()')}
          ${opt('clients', 'Voľná faktúra', 'Vlastné položky pre ľubovoľného klienta', 'Inv.manual()')}
        </div>`);
    },

    async pickOrder() {
      const cand = this.orders.filter(o => !['cancelled'].includes(o.status));
      if (!cand.length) return UI.toast('Žiadne objednávky na fakturáciu', 'err');
      UI.modal('Z ktorej objednávky?', `
        <div style="display:flex;flex-direction:column;gap:2px;">
          ${cand.map(o => {
            const c = this.clientOf(o.client_id);
            return `<button class="list-row" onclick="Inv.chooseType('${o.id}')">
              <span style="flex:1;"><strong class="mono" style="font-size:12.5px;">${UI.esc(o.order_number || '—')}</strong>
              <span style="color:var(--ink-mute);"> · ${c ? UI.esc(c.name) : '—'} · ${UI.money(o.service_fee || 0)}</span></span>
              <span style="color:var(--ink-mute);display:flex;">${Icon('chevron', 15)}</span></button>`;
          }).join('')}
        </div>`);
    },

    async chooseType(orderId) {
      const o = this.orders.find(x => x.id === orderId);
      const canOngoing = o?.ongoing_service_enabled;
      UI.modal('Za čo fakturujeme?', `
        <div style="display:flex;flex-direction:column;gap:2px;">
          <button class="list-row" onclick="Inv.create('${orderId}','service_fee')">
            <span style="flex:1;"><strong>Sprostredkovateľský poplatok</strong>
            <span style="color:var(--ink-mute);display:block;font-size:12.5px;">${UI.money(o?.service_fee || 0)}${o?.urgent_surcharge ? ` + ${UI.money(o.urgent_surcharge)} súrne` : ''}</span></span>
            <span style="color:var(--ink-mute);display:flex;">${Icon('chevron', 15)}</span></button>
          ${canOngoing ? `<button class="list-row" onclick="Inv.create('${orderId}','ongoing_service')">
            <span style="flex:1;"><strong>Priebežná služba za aktuálny mesiac</strong>
            <span style="color:var(--ink-mute);display:block;font-size:12.5px;">Vytvorí sa ako návrh na schválenie</span></span>
            <span style="color:var(--ink-mute);display:flex;">${Icon('chevron', 15)}</span></button>` : ''}
          <button class="list-row" onclick="Inv.manual(null,'${orderId}')">
            <span style="flex:1;"><strong>Vlastné položky</strong>
            <span style="color:var(--ink-mute);display:block;font-size:12.5px;">Faktúra naviazaná na objednávku, obsah si určíš sám</span></span>
            <span style="color:var(--ink-mute);display:flex;">${Icon('chevron', 15)}</span></button>
        </div>`);
    },

    async pickInquiry() {
      const { data: inqs } = await DB.list('inquiries', {
        select: 'id,target_city,persons,date_from,date_to,client_id,budget_per_bed,status',
        order: { column: 'received_at', ascending: false }, limit: 200 });
      const open = (inqs || []).filter(i => !['lost'].includes(i.status));
      if (!open.length) return UI.toast('Žiadne dopyty', 'err');
      UI.modal('Z ktorého dopytu?', `
        <div style="display:flex;flex-direction:column;gap:2px;">
          ${open.map(i => {
            const c = this.clientOf(i.client_id);
            return `<button class="list-row" onclick="Inv.manualFromInquiry('${i.id}')">
              <span style="flex:1;"><strong>${UI.esc(i.target_city || '—')}</strong>
              <span style="color:var(--ink-mute);"> · ${c ? UI.esc(c.name) : 'bez klienta'} · ${i.persons || '?'} os.</span></span>
              <span style="color:var(--ink-mute);display:flex;">${Icon('chevron', 15)}</span></button>`;
          }).join('')}
        </div>`);
    },

    async manualFromInquiry(inquiryId) {
      const { data: inq } = await DB.getById('inquiries', inquiryId);
      if (!inq) return UI.toast('Dopyt nenájdený', 'err');
      this._srcInquiry = inq;
      const nights = UI.nights(inq.date_from, inq.date_to);
      const desc = `Ubytovanie ${inq.target_city || ''}`
        + (inq.date_from ? ` · ${UI.date(inq.date_from)} – ${UI.date(inq.date_to)}` : '')
        + (nights ? ` · ${nights} nocí` : '');
      this.manual(inq.client_id, null, [{
        description: desc.trim(), quantity: inq.persons || 1, unit: 'os.',
        unit_price: inq.budget_per_bed && nights ? Number(inq.budget_per_bed) * nights : 0,
      }]);
    },

    /** Editor voľnej faktúry s vlastnými položkami. */
    manual(clientId, orderId, prefill) {
      this._srcOrder = orderId || null;
      this._rows = (prefill && prefill.length) ? prefill.slice()
        : [{ description: '', quantity: 1, unit: 'ks', unit_price: 0 }];
      const c = clientId || '';
      UI.modal('Voľná faktúra', `
        <form id="man-form" onsubmit="event.preventDefault();Inv.saveManual()">
          <div class="form-grid">
            ${UI.field('client_id', 'Klient', { value: c, required: true,
              options: [['', '— vyber klienta —'], ...this.clients.map(x => [x.id, x.name])] })}
            ${UI.field('type', 'Typ', { value: 'other', options: [
              ['other', 'Iné'], ['service_fee', 'Sprostredkovanie'],
              ['ongoing_service', 'Priebežná služba'], ['retainer', 'Retainer']] })}
            ${UI.field('due_days', 'Splatnosť (dní)', { type: 'number', value: 14 })}
          </div>
          <div id="regime-hint" class="regimebox" style="margin-bottom:6px;"></div>
          <div class="form-section">Položky</div>
          <div id="item-rows"></div>
          <button type="button" class="btn btn-outline btn-sm" onclick="Inv.addRow()">${Icon('plus')} Pridať položku</button>
          <div class="service-total" style="background:var(--field);border-color:var(--border);margin-top:14px;">
            <div style="font-weight:700;">Spolu</div>
            <div id="man-total" style="font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;">0,00 €</div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${Icon('check')} Vystaviť faktúru</button>
          </div>
        </form>`, { wide: true });
      this.renderRows();
      const form = document.getElementById('man-form');
      form.addEventListener('input', () => { this.syncRows(); this.updateRegime(); });
      this.updateRegime();
    },

    renderRows() {
      const box = document.getElementById('item-rows');
      if (!box) return;
      box.innerHTML = this._rows.map((r, i) => `
        <div class="item-row">
          <input placeholder="Popis položky" data-i="${i}" data-f="description" value="${UI.esc(r.description)}">
          <input type="number" step="0.01" placeholder="Množ." data-i="${i}" data-f="quantity" value="${r.quantity}">
          <input placeholder="MJ" data-i="${i}" data-f="unit" value="${UI.esc(r.unit)}">
          <input type="number" step="0.01" placeholder="Cena" data-i="${i}" data-f="unit_price" value="${r.unit_price}">
          <span class="item-sum">${UI.money((Number(r.quantity) || 0) * (Number(r.unit_price) || 0))}</span>
          <button type="button" class="btn btn-ghost btn-sm" style="color:var(--red);"
            onclick="Inv.delRow(${i})" ${this._rows.length === 1 ? 'disabled' : ''}>${Icon('x', 15)}</button>
        </div>`).join('');
      this.updateTotal();
    },

    syncRows() {
      document.querySelectorAll('#item-rows [data-i]').forEach(el => {
        const i = Number(el.dataset.i), f = el.dataset.f;
        if (this._rows[i]) this._rows[i][f] = el.value;
      });
      document.querySelectorAll('#item-rows .item-row').forEach((row, i) => {
        const r = this._rows[i];
        const sum = row.querySelector('.item-sum');
        if (sum && r) sum.textContent = UI.money((Number(r.quantity) || 0) * (Number(r.unit_price) || 0));
      });
      this.updateTotal();
    },

    updateTotal() {
      const t = this._rows.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0), 0);
      const el = document.getElementById('man-total');
      if (el) el.textContent = UI.money(t);
    },

    updateRegime() {
      const sel = document.querySelector('#man-form [name=client_id]');
      const el = document.getElementById('regime-hint');
      if (!sel || !el) return;
      const c = this.clientOf(sel.value);
      if (!c) { el.textContent = 'Vyber klienta — podľa jeho krajiny a IČ DPH sa určí režim.'; return; }
      const r = Invoicing.regimeFor(c);
      el.innerHTML = `Režim: <strong>${REGIME[r.regime] || r.regime}</strong> — ${UI.esc(r.note || '')}`
        + (r.warning ? ` <span style="color:var(--amber);">${UI.esc(r.warning)}</span>` : '');
    },

    addRow() { this.syncRows(); this._rows.push({ description: '', quantity: 1, unit: 'ks', unit_price: 0 }); this.renderRows(); },
    delRow(i) { this.syncRows(); this._rows.splice(i, 1); this.renderRows(); },

    async saveManual() {
      this.syncRows();
      const d = UI.formData(document.getElementById('man-form'));
      const client = this.clientOf(d.client_id);
      if (!client) return UI.toast('Vyber klienta', 'err');
      let order = null;
      if (this._srcOrder) { const { data } = await DB.getById('orders', this._srcOrder); order = data; }
      try {
        const { invoice } = await Invoicing.createManual({
          client, items: this._rows, type: d.type || 'other',
          dueDays: Number(d.due_days) || 14,
          order, inquiry: this._srcInquiry || null,
        });
        UI.closeModal();
        UI.toast(`Faktúra ${invoice.invoice_number} vystavená`, 'ok');
        this._srcOrder = null; this._srcInquiry = null;
        await this.load(); Danubra.renderRoute();
      } catch (e) { UI.toast('Chyba: ' + e.message, 'err'); }
    },

    async create(orderId, type) {
      UI.closeModal();
      const { data: order } = await DB.getById('orders', orderId);
      if (!order) return UI.toast('Objednávka nenájdená', 'err');
      const client = this.clientOf(order.client_id);
      try {
        if (type === 'service_fee') {
          const { invoice } = await Invoicing.createServiceFee(order, client);
          UI.toast(`Faktúra ${invoice.invoice_number} vystavená`, 'ok');
        } else {
          const { data: segs } = await DB.list('order_service_periods', { filters: { order_id: orderId } });
          const now = new Date();
          const per = window.DanubraBilling.monthlyBillingPeriod(now.getFullYear(), now.getMonth() + 1, order);
          const res = await Invoicing.createOngoingService(order, client, per.periodFrom, per.periodTo, segs || []);
          if (res.skipped) return UI.toast('Za toto obdobie nie je čo fakturovať', 'err');
          UI.toast(`Návrh ${res.invoice.invoice_number} čaká na schválenie`, 'ok');
        }
        await this.load();
        Danubra.go('invoices');
        Danubra.renderRoute();
      } catch (e) {
        UI.toast('Chyba: ' + e.message, 'err');
      }
    },
  };

  window.Inv = Inv;
  Danubra.views.invoices = function (el) { Inv.view(el); };
})();
