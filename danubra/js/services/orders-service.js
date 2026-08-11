// ============================================================================
// DANUBRA — Servisná vrstva objednávok: stavové prechody + vedľajšie efekty
// ============================================================================
// Stavový automat je čistá logika v lib/orders/state-machine.js.
// Tu sú DB efekty, ktoré prechod spúšťa (§6.2):
//   → paid            odomkni adresu, skopíruj prístupové údaje do spisu,
//                     založ prvý segment priebežnej služby
//   → completed       uzavri otvorené segmenty
// Každá zmena stavu sa loguje do activities ako type='system'.
// ============================================================================
window.OrdersService = {
  /**
   * Zmení stav objednávky vrátane vedľajších efektov.
   * @param {Object} order  aktuálny záznam
   * @param {string} to     cieľový stav
   * @param {Object} opts   { force:boolean } — ručný override (§6.2)
   */
  async transition(order, to, opts = {}) {
    const sm = window.DanubraOrderSM;
    const from = order.status || 'new';
    const ev = sm.evaluateTransition(from, to);

    if (!ev.ok && !opts.force) {
      if (ev.reason === 'no_change') return { ok: false, reason: 'no_change' };
      if (ev.reason === 'source_terminal') {
        UI.toast('Objednávka je uzavretá — stav sa už nedá meniť', 'err');
        return { ok: false, reason: ev.reason };
      }
      if (ev.requiresOverride) {
        const ok = confirm(`Prechod ${from} → ${to} nie je bežný postup.\nNaozaj ho vykonať ručne?`);
        if (!ok) return { ok: false, reason: 'cancelled' };
      }
    }

    const patch = { status: to };
    const now = new Date().toISOString();
    if (to === 'paid' && !order.fee_paid_at) patch.fee_paid_at = now;
    if (to === 'owner_confirmed' && !order.owner_confirmed_at) patch.owner_confirmed_at = now;

    const { error } = await DB.update('orders', order.id, patch);
    if (error) { UI.toast('Chyba: ' + error.message, 'err'); return { ok: false, reason: 'db', error }; }
    Object.assign(order, patch);

    // Vedľajšie efekty
    try {
      if (to === 'paid') await this._onPaid(order);
      if (to === 'completed') await this._onCompleted(order);
    } catch (e) {
      console.warn('[orders-service] side effect failed:', e);
    }

    // Audit záznam (§6.2 — ručný override musí zanechať stopu)
    await DB.insert('activities', {
      entity_type: 'order', entity_id: order.id, type: 'system',
      body: `Stav: ${from} → ${to}${!ev.ok ? ' (ručný zásah)' : ''}`,
      channel_meta: { from, to, manual: !ev.ok },
    }).catch(() => {});

    return { ok: true, sideEffects: ev.sideEffects };
  },

  // → paid: skopíruj prístupové údaje a založ prvý segment priebežnej služby
  async _onPaid(order) {
    if (order.accommodation_id) {
      const { data: acc } = await DB.getById('accommodations', order.accommodation_id);
      if (acc) {
        await DB.insert('documents', {
          order_id: order.id, type: 'handover', language: 'sk',
          payload: {
            address: acc.address, city: acc.city, postal_code: acc.postal_code,
            lat: acc.lat, lng: acc.lng,
            owner_name: acc.owner_name, owner_phone: acc.owner_phone, owner_email: acc.owner_email,
            access_door_code: acc.access_door_code, gate_code: acc.gate_code,
            access_key_location: acc.access_key_location,
            wifi_ssid: acc.wifi_ssid, wifi_password: acc.wifi_password,
            room_number: acc.room_number, floor: acc.floor,
            house_rules: acc.house_rules, deposit_amount: acc.deposit_amount,
            checkin_info: acc.checkin_info, checkout_info: acc.checkout_info,
          },
        }).catch(() => {});
      }
    }
    if (order.ongoing_service_enabled) {
      const { data: existing } = await DB.list('order_service_periods', { filters: { order_id: order.id }, limit: 1 });
      if (!existing || existing.length === 0) {
        await DB.insert('order_service_periods', {
          order_id: order.id,
          period_from: order.date_from,
          period_to: null,
          persons: order.persons,
          rate: order.ongoing_service_rate || 0,
          paused: false,
        }).catch(() => {});
      }
    }
  },

  // → completed: uzavri otvorené segmenty ku dňu odchodu
  async _onCompleted(order) {
    const { data: segs } = await DB.list('order_service_periods', { filters: { order_id: order.id } });
    for (const s of (segs || [])) {
      if (s.period_to == null) {
        await DB.update('order_service_periods', s.id, { period_to: order.date_to }).catch(() => {});
      }
    }
  },

  /**
   * Predĺženie pobytu (§5.3) — date_to sa mení VÝHRADNE cez order_extensions.
   */
  async extend(order, newDateTo, reason) {
    if (!newDateTo || newDateTo <= order.date_to) {
      UI.toast('Nový dátum musí byť neskorší ako súčasný', 'err');
      return { ok: false };
    }
    const previous = order.date_to;
    const { error } = await DB.insert('order_extensions', {
      order_id: order.id, previous_date_to: previous, new_date_to: newDateTo, reason: reason || null,
    });
    if (error) { UI.toast('Chyba: ' + error.message, 'err'); return { ok: false }; }

    const nights = UI.nights(order.date_from, newDateTo);
    await DB.update('orders', order.id, { date_to: newDateTo, nights });
    order.date_to = newDateTo; order.nights = nights;

    // ak bola objednávka „končí čoskoro", vráť ju do prebiehajúcich
    if (order.status === 'ending_soon') {
      await DB.update('orders', order.id, { status: 'in_progress' }).catch(() => {});
      order.status = 'in_progress';
    }

    await DB.insert('activities', {
      entity_type: 'order', entity_id: order.id, type: 'system',
      body: `Predĺženie pobytu: ${UI.date(previous)} → ${UI.date(newDateTo)}${reason ? ` (${reason})` : ''}`,
    }).catch(() => {});

    return { ok: true };
  },

  /**
   * Zmena počtu osôb alebo sadzby → uzavri aktuálny segment a založ nový (§2.8).
   */
  async changeServiceSegment(order, { persons, rate, paused, pauseReason, effectiveFrom }) {
    const from = effectiveFrom || new Date().toISOString().slice(0, 10);
    const dayBefore = (d) => {
      const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - 1);
      return x.toISOString().slice(0, 10);
    };
    const { data: segs } = await DB.list('order_service_periods', { filters: { order_id: order.id } });
    const open = (segs || []).find(s => s.period_to == null);
    if (open) {
      await DB.update('order_service_periods', open.id, { period_to: dayBefore(from) }).catch(() => {});
    }
    const { error } = await DB.insert('order_service_periods', {
      order_id: order.id, period_from: from, period_to: null,
      persons: persons ?? order.persons,
      rate: rate ?? order.ongoing_service_rate ?? 0,
      paused: !!paused, pause_reason: paused ? (pauseReason || null) : null,
    });
    if (error) { UI.toast('Chyba: ' + error.message, 'err'); return { ok: false }; }

    await DB.insert('activities', {
      entity_type: 'order', entity_id: order.id, type: 'system',
      body: paused
        ? `Priebežná služba pozastavená od ${UI.date(from)}${pauseReason ? ` (${pauseReason})` : ''}`
        : `Priebežná služba od ${UI.date(from)}: ${persons ?? order.persons} os. × ${rate ?? order.ongoing_service_rate} €`,
    }).catch(() => {});
    return { ok: true };
  },
};
