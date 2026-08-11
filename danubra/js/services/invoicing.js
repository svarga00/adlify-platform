// ============================================================================
// DANUBRA — Fakturačná služba (§6.3, §6.4, §5.2)
// ============================================================================
// KRITICKÉ (§5.2): faktúry za priebežnú službu sa NIKDY neodosielajú
// automaticky — vznikajú vždy ako `draft_pending_approval` a odoslanie
// vyžaduje ľudské potvrdenie.
// ============================================================================
window.Invoicing = {
  async settings() {
    if (this._set) return this._set;
    const { data } = await DB.list('settings', { limit: 1 });
    this._set = (data && data[0]) || {};
    return this._set;
  },

  /** Pridelí ďalšie číslo faktúry (atomicky, migrácia 002). */
  async nextNumber() {
    const { data, error } = await DB.client.rpc('danubra_next_number', { p_kind: 'invoice' });
    if (error) throw new Error('Číselný rad faktúr nie je dostupný — spusti migráciu 002. ' + error.message);
    return data;
  },

  _plusDays(n, from) {
    const d = from ? new Date(from) : new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  },

  /** Spoločné polia podľa fakturačného režimu klienta (§6.3). */
  regimeFor(client) {
    return window.DanubraBillingRegime.determineBillingRegime(client || {});
  },

  /**
   * Faktúra za sprostredkovateľský poplatok z objednávky.
   * Vzniká ako `issued` — je to priama fakturácia, nie automatický návrh.
   */
  async createServiceFee(order, client) {
    const r = this.regimeFor(client);
    const items = [{
      description: `Sprostredkovanie ubytovania · objednávka ${order.order_number}`,
      quantity: 1, unit: 'ks', unit_price: Number(order.service_fee) || 0,
      total: Number(order.service_fee) || 0,
    }];
    if (order.urgent_surcharge) {
      items.push({
        description: 'Príplatok za súrne vybavenie',
        quantity: 1, unit: 'ks', unit_price: Number(order.urgent_surcharge),
        total: Number(order.urgent_surcharge),
      });
    }
    const total = items.reduce((s, i) => s + i.total, 0);
    return this._create({
      order, client, type: 'service_fee', items, total, regime: r.regime,
      status: 'issued',
    });
  },

  /**
   * Návrh faktúry za priebežnú službu za obdobie (§6.4).
   * VŽDY `draft_pending_approval` (§5.2).
   */
  async createOngoingService(order, client, periodFrom, periodTo, segments) {
    const today = new Date().toISOString().slice(0, 10);
    const calc = window.DanubraBilling.calculateOngoingService(order, segments, periodFrom, periodTo, today);
    if (calc.total <= 0) return { skipped: 'nulová suma' };

    const items = calc.breakdown.map(b => ({
      description: `Priebežná služba ${window.DanubraDocs.date(b.from)} – ${window.DanubraDocs.date(b.to)} · ${b.persons} os.`,
      quantity: b.days * b.persons, unit: 'os./deň',
      unit_price: b.rate, total: b.amount,
    }));
    const r = this.regimeFor(client);
    return this._create({
      order, client, type: 'ongoing_service', items, total: calc.total, regime: r.regime,
      status: 'draft_pending_approval',
      billing_period_from: periodFrom, billing_period_to: periodTo,
    });
  },

  /**
   * Voľná faktúra s vlastnými položkami — nie je viazaná na objednávku.
   * Zdrojom môže byť klient, dopyt alebo nič (úplne ručná).
   * @param {Object} opts { client, items, type, dueDays, note, order?, inquiry? }
   */
  async createManual({ client, items, type = 'other', dueDays = 14, order = null, inquiry = null }) {
    const clean = (items || [])
      .filter(i => i.description && Number(i.quantity) > 0)
      .map(i => ({
        description: String(i.description).trim(),
        quantity: Number(i.quantity) || 0,
        unit: i.unit || 'ks',
        unit_price: Number(i.unit_price) || 0,
        total: Math.round(((Number(i.quantity) || 0) * (Number(i.unit_price) || 0) + Number.EPSILON) * 100) / 100,
      }));
    if (!clean.length) throw new Error('Faktúra musí mať aspoň jednu položku');
    const total = Math.round((clean.reduce((s, i) => s + i.total, 0) + Number.EPSILON) * 100) / 100;
    const r = this.regimeFor(client);
    return this._create({
      order, inquiry, client, type, items: clean, total,
      regime: r.regime, status: 'issued', dueDays,
    });
  },

  async _create({ order, inquiry, client, type, items, total, regime, status, billing_period_from, billing_period_to, dueDays = 14 }) {
    const number = await this.nextNumber();
    const issue = new Date().toISOString().slice(0, 10);
    const { data: inv, error } = await DB.insert('invoices', {
      invoice_number: number,
      client_id: client?.id || order?.client_id || null,
      order_id: order?.id || null,
      type, issue_date: issue, due_date: this._plusDays(dueDays, issue),
      delivery_date: billing_period_to || issue,
      total, currency: 'EUR', vat_regime: regime,
      status, billing_period_from: billing_period_from || null,
      billing_period_to: billing_period_to || null,
    });
    if (error) throw new Error(error.message);

    const rows = items.map(i => ({ ...i, invoice_id: inv.id }));
    await DB.from('invoice_items').insert(rows);

    // Záznam do osi tam, kde faktúra vznikla (objednávka, dopyt alebo klient)
    const note = `Vystavená faktúra ${number} na ${window.DanubraDocs.money(total)}`
      + (status === 'draft_pending_approval' ? ' (čaká na schválenie)' : '');
    const target = order?.id ? ['order', order.id]
      : inquiry?.id ? ['inquiry', inquiry.id]
      : client?.id ? ['client', client.id] : null;
    if (target) {
      await DB.insert('activities', {
        entity_type: target[0], entity_id: target[1], type: 'system', body: note,
      }).catch(() => {});
    }
    return { invoice: inv, items: rows };
  },

  /** Vykreslí faktúru ako dokument s QR platbou a otvorí na tlač. */
  async openDocument(inv, items, client) {
    const s = await this.settings();
    const supplier = s.supplier || {};
    const r = this.regimeFor(client);
    const vs = String(inv.invoice_number || '').replace(/\D/g, '');
    let qrSvg = '';
    try {
      if (supplier.iban) {
        const payload = window.DanubraQR.sepaPayload({
          name: supplier.name || 'DANUBRA', iban: supplier.iban,
          amount: inv.total, reference: vs, note: `Faktura ${inv.invoice_number}`,
        });
        qrSvg = window.DanubraQR.svg(payload, { px: 132 });
      }
    } catch (e) { console.warn('[invoicing] QR sa nepodarilo vytvoriť:', e.message); }

    const html = window.DanubraDocs.invoice({
      invoice: inv, items, client, supplier, qrSvg, vatNote: r.note,
    });
    this._openHtml(html);
  },

  _openHtml(html) {
    const w = window.open('', '_blank');
    if (!w) { UI.toast('Povoľ vyskakovacie okná pre zobrazenie dokumentu', 'err'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  },

  /** Otvorí ľubovoľný dokument objednávky (§8). */
  async openOrderDocument(kind, { order, client, accommodation, persons, payload }) {
    const s = await this.settings();
    const supplier = s.supplier || {};
    let html;
    if (kind === 'order_confirmation') {
      html = window.DanubraDocs.orderConfirmation({ order, client, accommodation, supplier });
    } else if (kind === 'payment_request') {
      const amount = (Number(order.service_fee) || 0) + (Number(order.urgent_surcharge) || 0);
      const due = this._plusDays(7);
      let qrSvg = '';
      try {
        if (supplier.iban) {
          const p = window.DanubraQR.sepaPayload({
            name: supplier.name || 'DANUBRA', iban: supplier.iban, amount,
            reference: String(order.order_number || '').replace(/\D/g, ''),
            note: `Objednavka ${order.order_number}`,
          });
          qrSvg = window.DanubraQR.svg(p, { px: 132 });
        }
      } catch (e) { console.warn('[invoicing] QR:', e.message); }
      html = window.DanubraDocs.paymentRequest({ order, client, supplier, qrSvg, dueDate: due });
    } else if (kind === 'owner_confirmation') {
      html = window.DanubraDocs.ownerConfirmation({ order, accommodation, persons, supplier });
    } else if (kind === 'handover') {
      html = window.DanubraDocs.handover({ order, client, data: payload, supplier });
    } else {
      return UI.toast('Neznámy typ dokumentu', 'err');
    }
    this._openHtml(html);

    await DB.insert('documents', {
      order_id: order.id, type: kind, language: kind === 'owner_confirmation' ? 'de' : 'sk',
    }).catch(() => {});
  },
};
