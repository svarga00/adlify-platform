// ============================================================================
// DANUBRA — M3 Dopyty (zoznam, detail, panel zhôd §6.5, prvá reakcia KPI)
// ============================================================================
(function () {
  const STATUS = [
    ['new', 'Nový', 'amber'], ['qualified', 'Kvalifikovaný', 'blue'],
    ['offer_sent', 'Ponuka odoslaná', 'brand'], ['won', 'Vyhraté', 'green'],
    ['accommodated', 'Ubytovaní', 'green'], ['closed', 'Uzavretý', 'gray'],
    ['lost', 'Stratený', 'red'],
  ];
  const CHANNELS = [['web', 'Web'], ['whatsapp', 'WhatsApp'], ['fb', 'Facebook'], ['phone', 'Telefón'],
    ['email', 'E-mail'], ['b2b', 'B2B'], ['sms', 'SMS']];
  const REQS = [['van_parking', 'Parkovanie dodávky'], ['kitchen', 'Kuchyňa'], ['washing_machine', 'Práčka'],
    ['wifi', 'WiFi'], ['private_bathroom', 'Vlastná kúpeľňa'], ['invoice', 'Platba na faktúru']];

  const Inq = {
    items: [], clients: [], loaded: false,
    filters: { status: '', q: '' },

    async load() {
      const [inq, cli] = await Promise.all([
        DB.list('inquiries', { order: { column: 'received_at', ascending: false }, limit: 500 }),
        DB.list('clients', { select: 'id,name,phone,email,whatsapp,language,country', limit: 500 }),
      ]);
      this.items = inq.data || [];
      this.clients = cli.data || [];
      this.loaded = true;
    },

    clientOf(id) { return this.clients.find(c => c.id === id); },
    statusMeta(s) { return STATUS.find(x => x[0] === s) || STATUS[0]; },
    statusBadge(s) { const m = this.statusMeta(s); return UI.badge(m[1], m[2]); },

    filtered() {
      const f = this.filters;
      return this.items.filter(i => {
        if (f.status && (i.status || 'new') !== f.status) return false;
        if (f.q) {
          const c = this.clientOf(i.client_id);
          const hay = `${i.target_city || ''} ${c?.name || ''} ${i.notes || ''}`.toLowerCase();
          if (!hay.includes(f.q.toLowerCase())) return false;
        }
        return true;
      });
    },

    async view(el) {
      Danubra.setActions(`<button class="btn btn-primary btn-sm" onclick="Inq.form()">${Icon('plus')} Nový dopyt</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const rows = this.filtered();
      const open = this.items.filter(i => ['new', 'qualified'].includes(i.status || 'new')).length;
      const noReply = this.items.filter(i => !i.first_response_at && (i.status || 'new') === 'new').length;

      el.innerHTML = Danubra.header('Dopyty',
        `${this.items.length} celkom · ${open} otvorených${noReply ? ` · <strong style="color:var(--amber)">${noReply} bez reakcie</strong>` : ''}`) + `
        <div class="pillbar" style="margin-bottom:14px;width:max-content;max-width:100%;overflow-x:auto;">
          <button class="pill${!this.filters.status ? ' active' : ''}" onclick="Inq.setF('status','')">Všetky</button>
          ${STATUS.map(s => {
            const n = this.items.filter(i => (i.status || 'new') === s[0]).length;
            return `<button class="pill${this.filters.status === s[0] ? ' active' : ''}" onclick="Inq.setF('status','${s[0]}')">${s[1]}${n ? ` ${n}` : ''}</button>`;
          }).join('')}
        </div>
        <div class="filterbar">
          <input class="fb-search" placeholder="Hľadať mesto, klienta, poznámku…" value="${UI.esc(this.filters.q)}"
            oninput="Inq.setF('q',this.value)">
        </div>
        <div class="count-line">${rows.length} ZÁZNAMOV</div>
        ${rows.length === 0
          ? UI.empty('inquiries', 'Žiadne dopyty', 'Pridaj prvý dopyt alebo počkaj na webový formulár.',
              `<button class="btn btn-primary" onclick="Inq.form()">${Icon('plus')} Nový dopyt</button>`)
          : `<div class="cards">${rows.map(i => this.card(i)).join('')}</div>`}`;
    },

    card(i) {
      const c = this.clientOf(i.client_id);
      const nights = UI.nights(i.date_from, i.date_to);
      const noReply = !i.first_response_at && (i.status || 'new') === 'new';
      return `
        <div class="acc-card card" onclick="Inq.detail('${i.id}')">
          <div class="acc-card-head">
            <div>
              <div class="acc-name">${UI.esc(i.target_city || 'Bez mesta')}${i.urgent ? ` <span style="color:var(--red);">${Icon('zap', 14)}</span>` : ''}</div>
              <div class="acc-loc">${c ? UI.esc(c.name) : 'Bez klienta'} · ${UI.date(i.received_at)}</div>
            </div>
            ${this.statusBadge(i.status)}
          </div>
          <div class="acc-meta">
            <span>${Icon('user', 14)} ${i.persons || '?'} os.</span>
            ${i.date_from ? `<span>${Icon('calendar', 14)} ${UI.dateRange(i.date_from, i.date_to)}${nights ? ` (${nights} n.)` : ''}</span>` : ''}
            ${i.budget_per_bed ? `<span>${Icon('euro', 14)} do ${UI.money(i.budget_per_bed)}/lôžko</span>` : ''}
            ${noReply ? `<span style="color:var(--amber);font-weight:700;">${Icon('clock', 14)} bez reakcie</span>` : ''}
          </div>
        </div>`;
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    // ── Detail + panel zhôd ───────────────────────────────────────────────
    async detail(id) {
      const i = this.items.find(x => x.id === id) || (await DB.getById('inquiries', id)).data;
      if (!i) return UI.toast('Nenájdené', 'err');
      const c = this.clientOf(i.client_id);
      const nights = UI.nights(i.date_from, i.date_to);
      const rows = [
        ['Klient', c?.name], ['Mesto', i.target_city], ['Krajina', i.country],
        ['Termín', i.date_from ? UI.dateRange(i.date_from, i.date_to) : null],
        ['Nocí', nights || null], ['Osôb', i.persons],
        ['Rozpočet / lôžko', i.budget_per_bed ? UI.money(i.budget_per_bed) : null],
        ['Kanál', (CHANNELS.find(x => x[0] === i.channel) || [, i.channel])[1]],
        ['Prijaté', i.received_at ? new Date(i.received_at).toLocaleString('sk-SK') : null],
        ['Prvá reakcia', i.first_response_at ? new Date(i.first_response_at).toLocaleString('sk-SK') : '— zatiaľ žiadna'],
      ].filter(r => r[1] != null && r[1] !== '');

      const reqLabels = (i.requirements || []).map(r => (REQS.find(x => x[0] === r) || [, r])[1]);

      const body = `
        <div class="detail-head">
          ${this.statusBadge(i.status)}
          ${i.urgent ? UI.badge('Súrne', 'red') : ''}
          <select class="verif-sel" onchange="Inq.setStatus('${i.id}',this.value)">
            ${STATUS.map(s => `<option value="${s[0]}" ${(i.status || 'new') === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('')}
          </select>
        </div>
        ${!i.first_response_at ? `<div class="warnbox">${Icon('clock', 14)} Dopyt zatiaľ nemá zaznamenanú prvú reakciu — kontaktuj klienta.</div>` : ''}
        ${c ? CommPanel.render({ contact: { phone: c.phone, email: c.email, whatsapp: c.whatsapp, name: c.name }, entity: { type: 'inquiry', id: i.id } }) : ''}
        <div class="kv">${rows.map(r => `<div><span>${r[0]}</span><strong>${UI.esc(r[1])}</strong></div>`).join('')}</div>
        ${reqLabels.length ? `<div class="chips">${reqLabels.map(x => `<span class="chip">${UI.esc(x)}</span>`).join('')}</div>` : ''}
        ${i.notes ? `<div class="notebox">${UI.esc(i.notes)}</div>` : ''}

        <div class="form-section">Panel zhôd · najvhodnejšie ubytovania</div>
        <div id="match-panel">${UI.loading()}</div>

        <div class="modal-actions">
          <button class="btn btn-danger btn-sm" onclick="Inq.del('${i.id}')">Zmazať</button>
          <button class="btn btn-outline btn-sm" onclick="Inq.form('${i.id}')">Upraviť</button>
          <button class="btn btn-primary btn-sm" onclick="Offers.fromInquiry('${i.id}')">Vytvoriť ponuku ${Icon('chevron', 14)}</button>
        </div>`;
      UI.modal(`Dopyt · ${i.target_city || '—'}`, body, { wide: true });
      this.renderMatches(i);
    },

    async renderMatches(inquiry) {
      const box = document.getElementById('match-panel');
      if (!box) return;
      if (!window.Acc?.loaded) { if (window.Acc) await Acc.load(); }
      const list = window.Acc?.items || [];
      if (!list.length) {
        box.innerHTML = `<div style="color:var(--ink-mute);font-size:13px;">Databáza ubytovaní je prázdna.</div>`;
        return;
      }
      const matches = DanubraMatching.matchAccommodations(inquiry, list, 10);
      box.innerHTML = matches.map(m => {
        const a = m.accommodation;
        const color = m.score >= 80 ? 'var(--green)' : m.score >= 55 ? 'var(--brand)' : 'var(--ink-mute)';
        return `
          <div class="match-row">
            <div class="match-score" style="color:${color};border-color:${color};">${m.score}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:13.5px;">${UI.esc(a.name)}</div>
              <div style="font-size:12px;color:var(--ink-mute);">
                ${UI.esc(a.city || '')} · ${a.price_per_bed_night != null ? UI.money(a.price_per_bed_night) + '/lôžko' : 'bez ceny'}
                ${a.max_persons ? ` · max ${a.max_persons}` : ''}
              </div>
              <div class="match-reasons">
                ${m.reasons.map(r => `<span class="${r.ok ? 'ok' : 'no'}">${r.ok ? '✓' : '✗'} ${UI.esc(r.text)}</span>`).join('')}
              </div>
            </div>
          </div>`;
      }).join('');
    },

    async setStatus(id, status) {
      const patch = { status };
      const it = this.items.find(x => x.id === id);
      // Prvá reakcia (KPI) — zaznamená sa pri prvom posune zo stavu „nový"
      if (status !== 'new' && it && !it.first_response_at) patch.first_response_at = new Date().toISOString();
      await DB.update('inquiries', id, patch);
      if (it) Object.assign(it, patch);
      UI.toast('Stav uložený', 'ok');
    },

    // ── Formulár ──────────────────────────────────────────────────────────
    form(id) {
      const i = id ? this.items.find(x => x.id === id) || {} : {};
      const reqs = i.requirements || [];
      const body = `
        <form id="inq-form" onsubmit="event.preventDefault();Inq.save('${id || ''}')">
          <div class="form-grid">
            ${UI.field('client_id', 'Klient', { value: i.client_id, options: [['', '— bez klienta —'], ...this.clients.map(c => [c.id, c.name])] })}
            ${UI.field('channel', 'Kanál', { value: i.channel, options: [['', '—'], ...CHANNELS] })}
            ${UI.field('target_city', 'Cieľové mesto', { value: i.target_city, required: true })}
            ${UI.field('country', 'Krajina', { value: i.country, placeholder: 'DE, AT…' })}
            ${UI.field('postal_code', 'PSČ', { value: i.postal_code })}
            ${UI.field('persons', 'Počet osôb', { type: 'number', value: i.persons })}
            ${UI.field('date_from', 'Termín od', { type: 'date', value: i.date_from })}
            ${UI.field('date_to', 'Termín do', { type: 'date', value: i.date_to })}
            ${UI.field('budget_per_bed', 'Rozpočet / lôžko / noc €', { type: 'number', value: i.budget_per_bed })}
            ${UI.field('status', 'Stav', { value: i.status || 'new', options: STATUS.map(s => [s[0], s[1]]) })}
          </div>
          <div class="form-section">Požiadavky</div>
          <div class="chk-row">
            ${REQS.map(r => `<label class="chk"><input type="checkbox" name="req_${r[0]}" ${reqs.includes(r[0]) ? 'checked' : ''}> ${r[1]}</label>`).join('')}
          </div>
          <div class="chk-row">
            ${UI.field('urgent', '', { type: 'checkbox', value: i.urgent, placeholder: 'Súrny dopyt' })}
          </div>
          ${UI.field('notes', 'Poznámka', { type: 'textarea', value: i.notes })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Pridať dopyt'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť dopyt' : 'Nový dopyt', body, { wide: true });
    },

    async save(id) {
      const d = UI.formData(document.getElementById('inq-form'));
      if (!d.target_city) return UI.toast('Cieľové mesto je povinné', 'err');
      const payload = {
        client_id: d.client_id || null,
        channel: d.channel || null,
        target_city: d.target_city,
        country: d.country || null,
        postal_code: d.postal_code || null,
        persons: d.persons === '' ? null : Number(d.persons),
        date_from: d.date_from || null,
        date_to: d.date_to || null,
        budget_per_bed: d.budget_per_bed === '' ? null : Number(d.budget_per_bed),
        status: d.status || 'new',
        urgent: !!d.urgent,
        notes: d.notes || null,
        requirements: REQS.map(r => r[0]).filter(k => d['req_' + k]),
      };
      if (!id) payload.received_at = new Date().toISOString();
      const res = id ? await DB.update('inquiries', id, payload) : await DB.insert('inquiries', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast(id ? 'Uložené' : 'Dopyt pridaný', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    async del(id) {
      if (!confirm('Zmazať tento dopyt?')) return;
      const { error } = await DB.remove('inquiries', id);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal(); UI.toast('Zmazané', 'ok');
      this.items = this.items.filter(x => x.id !== id); Danubra.renderRoute();
    },
  };

  window.Inq = Inq;
  Danubra.views.inquiries = function (el) { Inq.view(el); };
})();
