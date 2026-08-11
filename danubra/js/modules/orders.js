// ============================================================================
// DANUBRA — M4 Objednávky + M5 SPIS ZÁKAZKY (najdôležitejšia obrazovka)
// ============================================================================
// Spis obsahuje: stav a postup, časovú os pobytu, prístupové údaje (až po
// úhrade §5.1), osoby, priebežnú službu so segmentmi (§6.4), požiadavky
// (mini-ticketing), komunikáciu a dokumenty.
// ============================================================================
(function () {
  const FLOW = ['new', 'awaiting_payment', 'paid', 'owner_confirmed', 'in_progress', 'ending_soon', 'completed'];
  const LABEL = {
    new: 'Nová', awaiting_payment: 'Čaká na platbu', paid: 'Uhradené',
    owner_confirmed: 'Potvrdené majiteľom', in_progress: 'Prebieha',
    ending_soon: 'Končí čoskoro', completed: 'Ukončená', cancelled: 'Zrušená',
  };
  const KIND = {
    new: 'gray', awaiting_payment: 'amber', paid: 'blue', owner_confirmed: 'blue',
    in_progress: 'green', ending_soon: 'amber', completed: 'gray', cancelled: 'red',
  };
  const PRIO = [['low', 'Nízka'], ['normal', 'Bežná'], ['high', 'Vysoká']];

  const Ord = {
    items: [], clients: [], accs: [], loaded: false,
    filters: { status: '', q: '' },
    // detail state
    _cur: null, _persons: [], _segments: [], _requests: [], _acts: [], _docs: [], _exts: [],

    async load() {
      const [o, c] = await Promise.all([
        DB.list('orders', { order: { column: 'date_from', ascending: false }, limit: 500 }),
        DB.list('clients', { select: 'id,name,phone,email,whatsapp,country,vat_id,language', limit: 500 }),
      ]);
      this.items = o.data || []; this.clients = c.data || [];
      if (window.Acc && !Acc.loaded) await Acc.load();
      this.accs = window.Acc?.items || [];
      this.loaded = true;
    },

    clientOf(id) { return this.clients.find(x => x.id === id); },
    accOf(id) { return this.accs.find(x => x.id === id); },
    badge(s) { return UI.badge(LABEL[s] || s, KIND[s] || 'gray'); },

    // ── Zoznam (Objednávky) ───────────────────────────────────────────────
    async view(el, opts = {}) {
      const activeOnly = !!opts.activeOnly;
      Danubra.setActions('');
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }

      let rows = this.items;
      if (activeOnly) rows = rows.filter(o => ['paid', 'owner_confirmed', 'in_progress', 'ending_soon'].includes(o.status));
      if (this.filters.status) rows = rows.filter(o => o.status === this.filters.status);
      if (this.filters.q) {
        const q = this.filters.q.toLowerCase();
        rows = rows.filter(o => {
          const c = this.clientOf(o.client_id); const a = this.accOf(o.accommodation_id);
          return `${o.order_number || ''} ${c?.name || ''} ${a?.city || ''}`.toLowerCase().includes(q);
        });
      }

      const title = activeOnly ? 'Aktívne zákazky' : 'Objednávky';
      const inProgress = this.items.filter(o => o.status === 'in_progress').length;
      const people = this.items.filter(o => ['in_progress', 'ending_soon'].includes(o.status))
        .reduce((s, o) => s + (o.persons || 0), 0);

      el.innerHTML = Danubra.header(title,
        activeOnly ? `${inProgress} prebieha · ${people} osôb ubytovaných`
                   : `${this.items.length} celkom · ${inProgress} prebieha`) +
        (activeOnly ? '' : `
        <div class="pillbar" style="margin-bottom:14px;width:max-content;max-width:100%;overflow-x:auto;">
          <button class="pill${!this.filters.status ? ' active' : ''}" onclick="Ord.setF('status','')">Všetky</button>
          ${FLOW.concat('cancelled').map(s => {
            const n = this.items.filter(o => o.status === s).length;
            return n ? `<button class="pill${this.filters.status === s ? ' active' : ''}" onclick="Ord.setF('status','${s}')">${LABEL[s]} ${n}</button>` : '';
          }).join('')}
        </div>
        <div class="filterbar">
          <input class="fb-search" placeholder="Hľadať číslo, klienta, mesto…" value="${UI.esc(this.filters.q)}"
            oninput="Ord.setF('q',this.value)">
        </div>`) + `
        <div class="count-line">${rows.length} ZÁZNAMOV</div>
        ${rows.length === 0
          ? UI.empty('🏠', activeOnly ? 'Žiadne aktívne zákazky' : 'Žiadne objednávky',
              'Objednávka vznikne akceptovaním ponuky.',
              `<button class="btn btn-outline" onclick="Danubra.go('offers')">Prejsť na ponuky</button>`)
          : `<div class="cards">${rows.map(o => this.card(o)).join('')}</div>`}`;
    },

    card(o) {
      const c = this.clientOf(o.client_id), a = this.accOf(o.accommodation_id);
      return `
        <div class="acc-card card" onclick="Ord.spis('${o.id}')">
          <div class="acc-card-head">
            <div>
              <div class="acc-name mono" style="font-size:13px;letter-spacing:.02em;">${UI.esc(o.order_number || '—')}</div>
              <div class="acc-loc">${c ? UI.esc(c.name) : '—'} · ${a ? UI.esc(a.city || '') : ''}</div>
            </div>
            ${this.badge(o.status)}
          </div>
          ${this.timeline(o)}
          <div class="acc-meta" style="margin-top:8px;">
            <span>👤 ${o.persons || '?'} os.</span>
            <span>📅 ${UI.dateRange(o.date_from, o.date_to)}</span>
            ${o.ongoing_service_enabled ? `<span>🔁 ${UI.money(o.ongoing_service_rate || 0)}/os./deň</span>` : ''}
          </div>
        </div>`;
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    // Časová os pobytu — použiteľná v zozname aj v spise (§11)
    timeline(o) {
      const from = new Date(o.date_from), to = new Date(o.date_to), now = new Date();
      const total = Math.max(1, to - from);
      const pct = Math.max(0, Math.min(100, ((now - from) / total) * 100));
      const done = now > to, started = now >= from;
      const color = done ? 'var(--ink-mute)' : started ? 'var(--green)' : 'var(--blue)';
      const daysLeft = Math.ceil((to - now) / 86400000);
      const note = !started ? `začína o ${Math.ceil((from - now) / 86400000)} dní`
        : done ? 'ukončené' : `ostáva ${daysLeft} ${daysLeft === 1 ? 'deň' : 'dní'}`;
      return `
        <div class="stay-bar" title="${UI.esc(note)}">
          <div class="stay-fill" style="width:${pct}%;background:${color};"></div>
        </div>
        <div class="stay-note">${note}</div>`;
    },

    // ── SPIS ZÁKAZKY ⭐⭐ ──────────────────────────────────────────────────
    async spis(id) {
      if (!this.loaded) await this.load();
      const o = this.items.find(x => x.id === id);
      if (!o) return UI.toast('Nenájdené', 'err');
      this._cur = o;
      UI.modal(`Spis ${o.order_number || ''}`, `<div id="spis-body">${UI.loading()}</div>`, { wide: true });
      await this._loadSpis(o.id);
      this._renderSpis();
    },

    async _loadSpis(orderId) {
      const [p, s, r, a, d, e] = await Promise.all([
        DB.list('order_persons', { filters: { order_id: orderId } }),
        DB.list('order_service_periods', { filters: { order_id: orderId }, order: { column: 'period_from' } }),
        DB.list('order_requests', { filters: { order_id: orderId }, order: { column: 'created_at', ascending: false } }),
        DB.list('activities', { filters: { entity_type: 'order', entity_id: orderId }, order: { column: 'created_at', ascending: false }, limit: 50 }),
        DB.list('documents', { filters: { order_id: orderId } }),
        DB.list('order_extensions', { filters: { order_id: orderId }, order: { column: 'created_at' } }),
      ]);
      this._persons = p.data || []; this._segments = s.data || []; this._requests = r.data || [];
      this._acts = a.data || []; this._docs = d.data || []; this._exts = e.data || [];
    },

    async _refresh() { await this._loadSpis(this._cur.id); this._renderSpis(); },

    _renderSpis() {
      const box = document.getElementById('spis-body');
      if (!box) return;
      const o = this._cur;
      const c = this.clientOf(o.client_id), a = this.accOf(o.accommodation_id);
      const unlocked = FLOW.indexOf(o.status) >= FLOW.indexOf('paid') && o.status !== 'cancelled';
      const handover = this._docs.find(d => d.type === 'handover');
      const acc = handover?.payload || (unlocked ? a : null);

      box.innerHTML = `
        <!-- 1. Stav a postup -->
        <div class="detail-head">
          ${this.badge(o.status)}
          <span class="mono" style="font-size:11px;color:var(--ink-mute);letter-spacing:.1em;">${UI.esc(o.order_number || '')}</span>
        </div>
        ${this._stepper(o)}
        ${this._nextAction(o)}

        <!-- 2. Prehľad -->
        <div class="kv">
          <div><span>Klient</span><strong>${UI.esc(c?.name || '—')}</strong></div>
          <div><span>Ubytovanie</span><strong>${UI.esc(a?.name || '—')}${a?.city ? ` · ${UI.esc(a.city)}` : ''}</strong></div>
          <div><span>Termín</span><strong>${UI.dateRange(o.date_from, o.date_to)}${o.nights ? ` · ${o.nights} n.` : ''}</strong></div>
          <div><span>Osôb</span><strong>${o.persons || '—'}</strong></div>
          <div><span>Ubytovanie spolu</span><strong>${UI.money(o.total_accommodation || 0)}</strong></div>
          <div><span>Poplatok</span><strong>${UI.money(o.service_fee || 0)}${o.urgent_surcharge ? ` + ${UI.money(o.urgent_surcharge)} súrne` : ''}</strong></div>
        </div>
        ${this.timeline(o)}

        <!-- 3. Časová os pobytu / predĺženia -->
        ${this._exts.length ? `<div class="form-section">Predĺženia</div>
          ${this._exts.map(e => `<div class="list-row" style="cursor:default;">
            <span class="dot amber"></span>
            <span style="flex:1;">${UI.date(e.previous_date_to)} → <strong>${UI.date(e.new_date_to)}</strong>
            ${e.reason ? `<span style="color:var(--ink-mute);"> · ${UI.esc(e.reason)}</span>` : ''}</span>
          </div>`).join('')}` : ''}

        <!-- 4. Prístupové údaje (§5.1) -->
        <div class="form-section">Prístupové údaje</div>
        ${unlocked && acc ? this._accessBlock(acc) : `
          <div class="warnbox">🔒 Adresa a kontakt na ubytovateľa sú uzamknuté, kým nie je uhradený poplatok.
            Klientovi sa nesmú poslať skôr.</div>`}

        <!-- 5. Osoby -->
        <div class="form-section">Osoby (${this._persons.length}${o.persons ? ` z ${o.persons}` : ''})</div>
        ${this._persons.map(p => `<div class="list-row" style="cursor:default;">
          <span style="flex:1;"><strong>${UI.esc(p.full_name || '—')}</strong>
          ${p.phone ? `<span style="color:var(--ink-mute);"> · ${UI.esc(p.phone)}</span>` : ''}</span>
          ${p.phone ? `<a class="btn btn-ghost btn-sm" href="tel:${UI.esc(p.phone.replace(/\\s/g, ''))}">📞</a>` : ''}
          <button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="Ord.delPerson('${p.id}')">✕</button>
        </div>`).join('') || '<div style="color:var(--ink-mute);font-size:13px;">Zatiaľ nikto nezapísaný.</div>'}
        <button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="Ord.addPerson()">+ Pridať osobu</button>

        <!-- 6. Priebežná služba (§6.4) -->
        ${o.ongoing_service_enabled ? this._serviceBlock(o) : ''}

        <!-- 7. Požiadavky (mini-ticketing) -->
        <div class="form-section">Požiadavky počas pobytu</div>
        ${this._requests.map(r => this._reqRow(r)).join('') || '<div style="color:var(--ink-mute);font-size:13px;">Žiadne požiadavky.</div>'}
        <button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="Ord.addRequest()">+ Nová požiadavka</button>

        <!-- 8. Komunikácia -->
        <div class="form-section">Komunikácia a záznamy</div>
        ${c ? CommPanel.render({ contact: { phone: c.phone, email: c.email, whatsapp: c.whatsapp, name: c.name }, entity: { type: 'order', id: o.id } }) : ''}
        ${this._acts.slice(0, 12).map(x => `<div class="list-row" style="cursor:default;">
          <span class="dot ${x.type === 'system' ? '' : 'green'}"></span>
          <span style="flex:1;font-size:13px;">${UI.esc(x.body || x.type)}</span>
          <span style="color:var(--ink-mute);font-size:11.5px;">${UI.date(x.created_at)}</span>
        </div>`).join('') || '<div style="color:var(--ink-mute);font-size:13px;">Zatiaľ žiadne záznamy.</div>'}

        <div class="modal-actions">
          ${o.status !== 'cancelled' && o.status !== 'completed'
            ? `<button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="Ord.cancel()">Zrušiť zákazku</button>` : ''}
          <button class="btn btn-outline btn-sm" onclick="Ord.extend()">Predĺžiť pobyt</button>
        </div>`;
    },

    _stepper(o) {
      if (o.status === 'cancelled') return `<div class="warnbox">Zákazka bola zrušená${o.cancellation_reason ? `: ${UI.esc(o.cancellation_reason)}` : ''}.</div>`;
      const cur = FLOW.indexOf(o.status);
      return `<div class="stepper">${FLOW.map((s, i) => `
        <div class="step ${i < cur ? 'done' : i === cur ? 'now' : ''}" title="${LABEL[s]}">
          <span class="step-dot"></span><span class="step-label">${LABEL[s]}</span>
        </div>`).join('')}</div>`;
    },

    _nextAction(o) {
      const sm = window.DanubraOrderSM;
      const next = sm.nextNaturalState(o.status);
      if (!next || o.status === 'cancelled') return '';
      const cta = {
        awaiting_payment: 'Odoslať výzvu na platbu',
        paid: 'Označiť ako uhradené',
        owner_confirmed: 'Majiteľ potvrdil termín',
        in_progress: 'Pobyt začal',
        ending_soon: 'Označiť „končí čoskoro"',
        completed: 'Ukončiť zákazku',
      }[next] || `Posunúť na ${LABEL[next]}`;
      return `<button class="btn btn-primary btn-block" style="margin-bottom:14px;"
        onclick="Ord.advance('${next}')">${cta} →</button>`;
    },

    _accessBlock(acc) {
      const code = (label, val) => val ? `
        <div class="code-item">
          <div class="code-label">${label}</div>
          <div class="code-row"><span class="code-val">${UI.esc(val)}</span>
            <button class="btn btn-ghost btn-sm" onclick="Ord.copy('${UI.esc(String(val)).replace(/'/g, "\\'")}')">kopírovať</button></div>
        </div>` : '';
      return `
        <div class="access-box">
          ${acc.address ? `<div class="code-item"><div class="code-label">Adresa</div>
            <div class="code-row"><span style="font-weight:600;">${UI.esc(acc.address)}${acc.city ? `, ${UI.esc(acc.city)}` : ''}</span>
            <button class="btn btn-ghost btn-sm" onclick="Ord.copy('${UI.esc((acc.address || '') + ', ' + (acc.city || '')).replace(/'/g, "\\'")}')">kopírovať</button></div></div>` : ''}
          ${code('Kód dverí', acc.access_door_code)}
          ${code('Kód brány', acc.gate_code)}
          ${code('WiFi sieť', acc.wifi_ssid)}
          ${code('WiFi heslo', acc.wifi_password)}
          ${code('Izba', acc.room_number)}
          ${code('Poschodie', acc.floor)}
          ${acc.access_key_location ? `<div class="code-item"><div class="code-label">Kľúče</div><div style="font-size:13px;">${UI.esc(acc.access_key_location)}</div></div>` : ''}
          ${acc.owner_phone ? `<div class="code-item"><div class="code-label">Majiteľ</div>
            <div class="code-row"><span style="font-weight:600;">${UI.esc(acc.owner_name || '')} ${UI.esc(acc.owner_phone)}</span>
            <a class="btn btn-ghost btn-sm" href="tel:${UI.esc(acc.owner_phone.replace(/\s/g, ''))}">volať</a></div></div>` : ''}
          ${acc.deposit_amount ? `<div class="code-item"><div class="code-label">Kaucia</div><div style="font-size:13px;font-weight:600;">${UI.money(acc.deposit_amount)}</div></div>` : ''}
        </div>`;
    },

    _serviceBlock(o) {
      const today = new Date().toISOString().slice(0, 10);
      const now = new Date();
      const per = window.DanubraBilling.monthlyBillingPeriod(now.getFullYear(), now.getMonth() + 1, o);
      const calc = window.DanubraBilling.calculateOngoingService(o, this._segments, per.periodFrom, per.periodTo, today);
      const openSeg = this._segments.find(s => s.period_to == null);
      return `
        <div class="form-section">Priebežná služba · aktuálny mesiac</div>
        <div class="service-total">
          <div><div class="code-label">Za ${per.periodFrom.slice(5, 7)}/${per.periodFrom.slice(0, 4)} zatiaľ</div>
            <div style="font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;">${UI.money(calc.total)}</div></div>
          ${openSeg ? `<div style="text-align:right;"><div class="code-label">Aktuálne</div>
            <div style="font-weight:700;">${openSeg.persons} os. × ${UI.money(openSeg.rate)}${openSeg.paused ? ' · pozastavené' : ''}</div></div>` : ''}
        </div>
        ${calc.breakdown.map(b => `<div class="list-row" style="cursor:default;font-size:12.5px;">
          <span style="flex:1;">${UI.date(b.from)} – ${UI.date(b.to)} · ${b.days} dní × ${b.persons} os. × ${UI.money(b.rate)}</span>
          <strong>${UI.money(b.amount)}</strong></div>`).join('')}
        ${this._segments.filter(s => s.paused).map(s => `<div class="list-row" style="cursor:default;">
          <span class="dot amber"></span><span style="flex:1;font-size:12.5px;color:var(--ink-mute);">
          Pozastavené od ${UI.date(s.period_from)}${s.pause_reason ? ` · ${UI.esc(s.pause_reason)}` : ''}</span></div>`).join('')}
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" onclick="Ord.changeService()">Zmeniť osoby / sadzbu</button>
          ${openSeg && !openSeg.paused
            ? `<button class="btn btn-outline btn-sm" onclick="Ord.pauseService()">Pozastaviť</button>`
            : `<button class="btn btn-outline btn-sm" onclick="Ord.resumeService()">Obnoviť</button>`}
        </div>`;
    },

    _reqRow(r) {
      const dot = r.status === 'resolved' ? 'green' : r.priority === 'high' ? 'red' : 'amber';
      return `<div class="list-row" onclick="Ord.toggleRequest('${r.id}')">
        <span class="dot ${dot}"></span>
        <span style="flex:1;">
          <strong style="${r.status === 'resolved' ? 'text-decoration:line-through;opacity:.6;' : ''}">${UI.esc(r.title || '—')}</strong>
          ${r.description ? `<span style="color:var(--ink-mute);font-size:12.5px;display:block;">${UI.esc(r.description)}</span>` : ''}
        </span>
        <span style="font-size:11.5px;color:var(--ink-mute);">${r.status === 'resolved' ? 'vyriešené' : 'otvorené'}</span>
      </div>`;
    },

    // ── Akcie ─────────────────────────────────────────────────────────────
    async advance(to) {
      const res = await OrdersService.transition(this._cur, to);
      if (!res.ok) return;
      UI.toast(`Stav: ${LABEL[to]}`, 'ok');
      await this._refresh();
      await this.load();
    },

    async cancel() {
      const reason = prompt('Dôvod zrušenia:');
      if (reason === null) return;
      await DB.update('orders', this._cur.id, { cancellation_reason: reason || null });
      this._cur.cancellation_reason = reason;
      const res = await OrdersService.transition(this._cur, 'cancelled', { force: true });
      if (res.ok) { UI.toast('Zákazka zrušená', 'ok'); await this._refresh(); await this.load(); }
    },

    async extend() {
      const d = prompt('Nový dátum odchodu (RRRR-MM-DD):', this._cur.date_to);
      if (!d) return;
      const reason = prompt('Dôvod predĺženia (nepovinné):') || null;
      const res = await OrdersService.extend(this._cur, d, reason);
      if (res.ok) { UI.toast('Pobyt predĺžený', 'ok'); await this._refresh(); await this.load(); }
    },

    async addPerson() {
      const name = prompt('Meno a priezvisko:');
      if (!name) return;
      const phone = prompt('Telefón (nepovinné):') || null;
      await DB.insert('order_persons', {
        order_id: this._cur.id, full_name: name, phone,
        date_from: this._cur.date_from, date_to: this._cur.date_to,
      });
      await this._refresh();
    },

    async delPerson(id) {
      if (!confirm('Odstrániť osobu zo zákazky?')) return;
      await DB.remove('order_persons', id);
      await this._refresh();
    },

    async addRequest() {
      const title = prompt('Čo treba vyriešiť?');
      if (!title) return;
      const description = prompt('Podrobnosti (nepovinné):') || null;
      await DB.insert('order_requests', {
        order_id: this._cur.id, title, description, status: 'new', priority: 'normal',
      });
      await this._refresh();
    },

    async toggleRequest(id) {
      const r = this._requests.find(x => x.id === id);
      if (!r) return;
      const done = r.status === 'resolved';
      await DB.update('order_requests', id, {
        status: done ? 'new' : 'resolved',
        resolved_at: done ? null : new Date().toISOString(),
      });
      await this._refresh();
    },

    async changeService() {
      const persons = prompt('Počet osôb od dnes:', this._cur.persons);
      if (persons === null) return;
      const rate = prompt('Sadzba € / osoba / deň:', this._cur.ongoing_service_rate || 1.5);
      if (rate === null) return;
      const res = await OrdersService.changeServiceSegment(this._cur, {
        persons: Number(persons), rate: Number(rate),
      });
      if (res.ok) { UI.toast('Segment aktualizovaný', 'ok'); await this._refresh(); }
    },

    async pauseService() {
      const reason = prompt('Dôvod pozastavenia:') || null;
      const res = await OrdersService.changeServiceSegment(this._cur, { paused: true, pauseReason: reason });
      if (res.ok) { UI.toast('Služba pozastavená', 'ok'); await this._refresh(); }
    },

    async resumeService() {
      const res = await OrdersService.changeServiceSegment(this._cur, { paused: false });
      if (res.ok) { UI.toast('Služba obnovená', 'ok'); await this._refresh(); }
    },

    copy(text) {
      navigator.clipboard?.writeText(text).then(
        () => UI.toast('Skopírované', 'ok'), () => UI.toast('Nepodarilo sa skopírovať', 'err'));
    },
  };

  window.Ord = Ord;
  Danubra.views.orders = function (el) { Ord.view(el); };
  Danubra.views.active = function (el) { Ord.view(el, { activeOnly: true }); };
})();
