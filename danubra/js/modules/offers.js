// ============================================================================
// DANUBRA — M3 Ponuky (wizard z dopytu, varianty, text pre WhatsApp, akceptácia)
// ============================================================================
// KRITICKÉ (§5.1): v ponuke sa NIKDY neuvádza adresa ani kontakt na ubytovateľa
// — len mesto a typ. Adresa sa odomkne až keď je objednávka v stave `paid`.
// ============================================================================
(function () {
  const STATUS = [['draft', 'Koncept', 'gray'], ['sent', 'Odoslaná', 'blue'],
    ['accepted', 'Akceptovaná', 'green'], ['expired', 'Expirovaná', 'red']];
  const TYPE_LABEL = { zimmer: 'izba', wohnung: 'byt', pension: 'penzión', haus: 'dom', hostel: 'hostel' };

  const Offers = {
    items: [], variants: [], clients: [], inquiries: [], loaded: false,
    filters: { status: '' },

    async load() {
      const [off, vars, cli, inq] = await Promise.all([
        DB.list('offers', { order: { column: 'created_at', ascending: false }, limit: 500 }),
        DB.list('offer_variants', { limit: 2000 }),
        DB.list('clients', { select: 'id,name,phone,email,whatsapp,language', limit: 500 }),
        DB.list('inquiries', { select: 'id,target_city,persons,date_from,date_to,client_id,urgent,budget_per_bed,requirements,postal_code,country', limit: 500 }),
      ]);
      this.items = off.data || []; this.variants = vars.data || [];
      this.clients = cli.data || []; this.inquiries = inq.data || [];
      this.loaded = true;
    },

    clientOf(id) { return this.clients.find(c => c.id === id); },
    variantsOf(offerId) { return this.variants.filter(v => v.offer_id === offerId).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)); },
    statusBadge(s) { const m = STATUS.find(x => x[0] === s) || STATUS[0]; return UI.badge(m[1], m[2]); },

    isExpired(o) { return o.valid_until && o.status === 'sent' && new Date(o.valid_until) < new Date(); },

    async view(el) {
      Danubra.setActions(`<button class="btn btn-primary btn-sm" onclick="Offers.pickInquiry()">+ Nová ponuka</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const rows = this.filters.status ? this.items.filter(o => o.status === this.filters.status) : this.items;

      el.innerHTML = Danubra.header('Ponuky',
        `${this.items.length} celkom · ${this.items.filter(o => o.status === 'sent').length} čaká na odpoveď`) + `
        <div class="pillbar" style="margin-bottom:14px;width:max-content;max-width:100%;">
          <button class="pill${!this.filters.status ? ' active' : ''}" onclick="Offers.setF('')">Všetky</button>
          ${STATUS.map(s => {
            const n = this.items.filter(o => o.status === s[0]).length;
            return `<button class="pill${this.filters.status === s[0] ? ' active' : ''}" onclick="Offers.setF('${s[0]}')">${s[1]}${n ? ` ${n}` : ''}</button>`;
          }).join('')}
        </div>
        <div class="count-line">${rows.length} ZÁZNAMOV</div>
        ${rows.length === 0
          ? UI.empty('📄', 'Žiadne ponuky', 'Ponuku vytvoríš z dopytu.',
              `<button class="btn btn-primary" onclick="Offers.pickInquiry()">+ Nová ponuka</button>`)
          : `<div class="cards">${rows.map(o => this.card(o)).join('')}</div>`}`;
    },

    card(o) {
      const c = this.clientOf(o.client_id);
      const vs = this.variantsOf(o.id);
      const expired = this.isExpired(o);
      return `
        <div class="acc-card card" onclick="Offers.detail('${o.id}')">
          <div class="acc-card-head">
            <div>
              <div class="acc-name">${c ? UI.esc(c.name) : 'Bez klienta'}</div>
              <div class="acc-loc">${vs.length} ${vs.length === 1 ? 'variant' : 'varianty'} · ${UI.date(o.created_at)}</div>
            </div>
            ${expired ? UI.badge('Expirovaná', 'red') : this.statusBadge(o.status)}
          </div>
          <div class="acc-meta">
            ${o.service_fee != null ? `<span>💼 poplatok ${UI.money(o.service_fee)}</span>` : ''}
            ${o.ongoing_service_enabled ? `<span>🔁 ${UI.money(o.ongoing_service_rate || 0)}/os./deň</span>` : ''}
            ${o.valid_until ? `<span>⏳ do ${UI.date(o.valid_until)}</span>` : ''}
          </div>
        </div>`;
    },

    setF(v) { this.filters.status = v; Danubra.renderRoute(); },

    // ── Výber dopytu ──────────────────────────────────────────────────────
    async pickInquiry() {
      if (!this.loaded) await this.load();
      const open = this.inquiries.filter(i => !['lost', 'closed'].includes(i.status));
      if (!open.length) return UI.toast('Žiadne otvorené dopyty — najprv pridaj dopyt', 'err');
      UI.modal('Ponuka z ktorého dopytu?', `
        <div style="display:flex;flex-direction:column;gap:2px;">
          ${open.map(i => {
            const c = this.clientOf(i.client_id);
            return `<button class="list-row" onclick="UI.closeModal();Offers.fromInquiry('${i.id}')">
              <span style="flex:1;">
                <strong>${UI.esc(i.target_city || '—')}</strong>
                <span style="color:var(--ink-mute);"> · ${c ? UI.esc(c.name) : 'bez klienta'} · ${i.persons || '?'} os.</span>
              </span><span style="color:var(--ink-mute);">›</span></button>`;
          }).join('')}
        </div>`);
    },

    // ── Wizard: ponuka z dopytu ───────────────────────────────────────────
    async fromInquiry(inquiryId) {
      if (!this.loaded) await this.load();
      if (!window.Acc?.loaded && window.Acc) await Acc.load();
      const inq = this.inquiries.find(i => i.id === inquiryId) || (await DB.getById('inquiries', inquiryId)).data;
      if (!inq) return UI.toast('Dopyt nenájdený', 'err');
      const matches = DanubraMatching.matchAccommodations(inq, window.Acc?.items || [], 8);
      const nights = UI.nights(inq.date_from, inq.date_to) || 0;
      const settings = await this._settings();
      const feeDefault = settings?.pricing?.fee_individual ?? 150;
      const rateDefault = settings?.pricing?.ongoing_service_rate_default ?? 1.5;

      this._wizard = { inquiryId, inq, nights, selected: new Set() };

      UI.modal('Nová ponuka', `
        <div class="notebox" style="margin:0 0 14px;">
          <strong>${UI.esc(inq.target_city || '—')}</strong> · ${inq.persons || '?'} osôb ·
          ${inq.date_from ? UI.dateRange(inq.date_from, inq.date_to) : 'termín neurčený'}${nights ? ` (${nights} nocí)` : ''}
        </div>
        <div class="form-section">Vyber ubytovania do ponuky (1–3)</div>
        ${matches.length ? `<div id="wz-list">${matches.map(m => this._wizardRow(m, nights, inq)).join('')}</div>`
          : `<div style="color:var(--ink-mute);font-size:13px;">Žiadne vhodné ubytovania v databáze.</div>`}
        <div class="form-section">Podmienky</div>
        <form id="offer-form" onsubmit="event.preventDefault();Offers.saveWizard()">
          <div class="form-grid">
            ${UI.field('service_fee', 'Sprostredkovateľský poplatok €', { type: 'number', value: feeDefault })}
            ${UI.field('valid_until', 'Platnosť do', { type: 'date', value: this._plusDays(7) })}
            ${UI.field('ongoing_service_rate', 'Priebežná služba €/os./deň', { type: 'number', value: rateDefault })}
            ${UI.field('language', 'Jazyk ponuky', { value: this.clientOf(inq.client_id)?.language || 'sk', options: [['sk', 'SK'], ['cs', 'CS'], ['hu', 'HU']] })}
          </div>
          <div class="chk-row">
            ${UI.field('ongoing_service_enabled', '', { type: 'checkbox', value: true, placeholder: 'Zahrnúť priebežnú službu' })}
            ${UI.field('urgent_surcharge', '', { type: 'checkbox', value: !!inq.urgent, placeholder: '⚡ Príplatok za súrnosť' })}
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">Vytvoriť ponuku</button>
          </div>
        </form>`, { wide: true });
    },

    _wizardRow(m, nights, inq) {
      const a = m.accommodation;
      const total = (a.price_per_bed_night || 0) * (inq.persons || 1) * (nights || 1);
      const color = m.score >= 80 ? 'var(--green)' : m.score >= 55 ? 'var(--brand)' : 'var(--ink-mute)';
      return `
        <label class="match-row" style="cursor:pointer;">
          <input type="checkbox" value="${a.id}" onchange="Offers.toggleVariant('${a.id}',this.checked)"
            style="width:18px;height:18px;accent-color:var(--brand);flex-shrink:0;">
          <div class="match-score" style="color:${color};border-color:${color};">${m.score}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:13.5px;">${UI.esc(a.name)}</div>
            <div style="font-size:12px;color:var(--ink-mute);">
              ${UI.esc(a.city || '')} · ${a.price_per_bed_night != null ? UI.money(a.price_per_bed_night) + '/lôžko/noc' : 'bez ceny'}
              ${total ? ` · spolu ${UI.money(total)}` : ''}
            </div>
            <div class="match-reasons">
              ${m.reasons.slice(0, 5).map(r => `<span class="${r.ok ? 'ok' : 'no'}">${r.ok ? '✓' : '✗'} ${UI.esc(r.text)}</span>`).join('')}
            </div>
          </div>
        </label>`;
    },

    toggleVariant(accId, on) {
      if (!this._wizard) return;
      if (on) {
        if (this._wizard.selected.size >= 3) {
          UI.toast('Maximálne 3 varianty', 'err');
          const box = document.querySelector(`#wz-list input[value="${accId}"]`);
          if (box) box.checked = false;
          return;
        }
        this._wizard.selected.add(accId);
      } else this._wizard.selected.delete(accId);
    },

    async saveWizard() {
      const w = this._wizard;
      if (!w) return;
      if (w.selected.size === 0) return UI.toast('Vyber aspoň jedno ubytovanie', 'err');
      const d = UI.formData(document.getElementById('offer-form'));

      const offerPayload = {
        inquiry_id: w.inquiryId,
        client_id: w.inq.client_id || null,
        language: d.language || 'sk',
        service_fee: d.service_fee === '' ? null : Number(d.service_fee),
        urgent_surcharge: !!d.urgent_surcharge,
        ongoing_service_enabled: !!d.ongoing_service_enabled,
        ongoing_service_rate: d.ongoing_service_rate === '' ? null : Number(d.ongoing_service_rate),
        valid_until: d.valid_until || null,
        status: 'draft',
      };
      const { data: offer, error } = await DB.insert('offers', offerPayload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');

      const accs = window.Acc?.items || [];
      const rows = [...w.selected].map((accId, idx) => {
        const a = accs.find(x => x.id === accId) || {};
        const price = a.price_per_bed_night || 0;
        return {
          offer_id: offer.id, accommodation_id: accId,
          price_per_bed_night: price, nights: w.nights || null,
          total_accommodation: price * (w.inq.persons || 1) * (w.nights || 1),
          sort_order: idx,
        };
      });
      const { error: e2 } = await DB.from('offer_variants').insert(rows);
      if (e2) return UI.toast('Ponuka vytvorená, varianty zlyhali: ' + e2.message, 'err');

      // dopyt posuň na „ponuka odoslaná" a zaznač prvú reakciu
      await DB.update('inquiries', w.inquiryId, {
        status: 'offer_sent', first_response_at: new Date().toISOString(),
      }).catch(() => {});

      UI.closeModal(); UI.toast('Ponuka vytvorená', 'ok');
      this._wizard = null;
      await this.load();
      Danubra.go('offers');
      setTimeout(() => this.detail(offer.id), 250);
    },

    // ── Detail ────────────────────────────────────────────────────────────
    async detail(id) {
      if (!this.loaded) await this.load();
      const o = this.items.find(x => x.id === id);
      if (!o) return UI.toast('Nenájdené', 'err');
      const c = this.clientOf(o.client_id);
      const vs = this.variantsOf(o.id);
      const accs = window.Acc?.items || [];
      const inq = this.inquiries.find(i => i.id === o.inquiry_id);

      const varHtml = vs.map((v, idx) => {
        const a = accs.find(x => x.id === v.accommodation_id) || {};
        return `<div class="match-row">
          <div class="match-score" style="color:var(--blue);border-color:var(--blue);">${idx + 1}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:13.5px;">${UI.esc(a.name || 'Ubytovanie')}</div>
            <div style="font-size:12px;color:var(--ink-mute);">
              ${UI.esc(a.city || '')}${a.type ? ' · ' + (TYPE_LABEL[a.type] || a.type) : ''} ·
              ${UI.money(v.price_per_bed_night || 0)}/lôžko/noc${v.nights ? ` × ${v.nights} n.` : ''}
            </div>
          </div>
          <strong style="font-size:14px;">${UI.money(v.total_accommodation || 0)}</strong>
        </div>`;
      }).join('');

      const rows = [
        ['Klient', c?.name], ['Jazyk', (o.language || '').toUpperCase()],
        ['Poplatok', o.service_fee != null ? UI.money(o.service_fee) : null],
        ['Príplatok za súrnosť', o.urgent_surcharge ? 'Áno' : null],
        ['Priebežná služba', o.ongoing_service_enabled ? `${UI.money(o.ongoing_service_rate || 0)} / os. / deň` : 'nezahrnutá'],
        ['Platnosť do', o.valid_until ? UI.date(o.valid_until) : null],
        ['Odoslaná', o.sent_at ? new Date(o.sent_at).toLocaleString('sk-SK') : null],
      ].filter(r => r[1] != null && r[1] !== '');

      const body = `
        <div class="detail-head">
          ${this.isExpired(o) ? UI.badge('Expirovaná', 'red') : this.statusBadge(o.status)}
          <select class="verif-sel" onchange="Offers.setStatus('${o.id}',this.value)">
            ${STATUS.map(s => `<option value="${s[0]}" ${o.status === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('')}
          </select>
        </div>
        <div class="warnbox" style="background:var(--blue-50);border-color:#C3D3FA;color:var(--blue);">
          🔒 V ponuke sa uvádza len mesto a typ ubytovania. Adresa a kontakt na ubytovateľa
          sa klientovi sprístupnia až po úhrade poplatku.
        </div>
        ${c ? CommPanel.render({ contact: { phone: c.phone, email: c.email, whatsapp: c.whatsapp, name: c.name }, entity: { type: 'inquiry', id: o.inquiry_id } }) : ''}
        <div class="kv">${rows.map(r => `<div><span>${r[0]}</span><strong>${UI.esc(r[1])}</strong></div>`).join('')}</div>
        <div class="form-section">Varianty</div>
        ${varHtml || '<div style="color:var(--ink-mute);font-size:13px;">Bez variantov.</div>'}
        <div class="form-section">Text pre klienta (WhatsApp / e-mail)</div>
        <textarea id="offer-text" rows="12" readonly
          style="width:100%;padding:12px;border:1px solid var(--border);border-radius:10px;font-size:12.5px;line-height:1.6;background:var(--field);resize:vertical;">${UI.esc(this.buildText(o, vs, accs, c, inq))}</textarea>
        <button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="Offers.copyText()">📋 Skopírovať text</button>
        <div class="modal-actions">
          <button class="btn btn-danger btn-sm" onclick="Offers.del('${o.id}')">Zmazať</button>
          ${o.status !== 'accepted'
            ? `<button class="btn btn-primary btn-sm" onclick="Offers.accept('${o.id}')">Akceptovaná → objednávka</button>`
            : ''}
        </div>`;
      UI.modal('Ponuka', body, { wide: true });
    },

    // Text ponuky pre klienta — §5.1: len mesto a typ, žiadna adresa!
    buildText(o, vs, accs, c, inq) {
      const L = [];
      L.push(`Dobrý deň${c?.name ? ', ' + c.name : ''},`);
      L.push('');
      L.push(`ponúkame ubytovanie${inq?.target_city ? ' v meste ' + inq.target_city : ''}${inq?.date_from ? ` na termín ${UI.date(inq.date_from)} – ${UI.date(inq.date_to)}` : ''}${inq?.persons ? ` pre ${inq.persons} osôb` : ''}:`);
      L.push('');
      vs.forEach((v, i) => {
        const a = accs.find(x => x.id === v.accommodation_id) || {};
        // ⚠ zámerne BEZ adresy a kontaktu (§5.1)
        L.push(`${i + 1}) ${a.city || '—'}${a.type ? ` – ${TYPE_LABEL[a.type] || a.type}` : ''}`);
        L.push(`   ${UI.money(v.price_per_bed_night || 0)} / lôžko / noc${v.nights ? ` × ${v.nights} nocí` : ''} = ${UI.money(v.total_accommodation || 0)}`);
      });
      L.push('');
      if (o.service_fee != null) L.push(`Sprostredkovateľský poplatok: ${UI.money(o.service_fee)}`);
      if (o.urgent_surcharge) L.push('Vrátane príplatku za súrne vybavenie.');
      if (o.ongoing_service_enabled) {
        L.push(`Priebežná služba počas pobytu: ${UI.money(o.ongoing_service_rate || 0)} / osoba / deň`);
        L.push('(riešenie problémov s ubytovaním, komunikácia s majiteľom, predĺženia)');
      }
      if (o.valid_until) { L.push(''); L.push(`Ponuka platí do ${UI.date(o.valid_until)}.`); }
      L.push('');
      L.push('Presnú adresu a kontakt odovzdávame po úhrade poplatku.');
      L.push('');
      L.push('S pozdravom,');
      L.push('DANUBRA');
      return L.join('\n');
    },

    copyText() {
      const t = document.getElementById('offer-text');
      if (!t) return;
      t.select();
      navigator.clipboard?.writeText(t.value).then(
        () => UI.toast('Text skopírovaný', 'ok'),
        () => UI.toast('Skopíruj ručne (Ctrl+C)', 'err'));
    },

    async setStatus(id, status) {
      const patch = { status };
      if (status === 'sent') patch.sent_at = new Date().toISOString();
      await DB.update('offers', id, patch);
      const it = this.items.find(x => x.id === id); if (it) Object.assign(it, patch);
      UI.toast('Stav uložený', 'ok');
    },

    // ── Akceptácia → objednávka (§6.2 stav `new`) ─────────────────────────
    async accept(offerId) {
      const o = this.items.find(x => x.id === offerId);
      const vs = this.variantsOf(offerId);
      if (!vs.length) return UI.toast('Ponuka nemá varianty', 'err');
      const inq = this.inquiries.find(i => i.id === o.inquiry_id);
      const accs = window.Acc?.items || [];

      // ktorý variant si klient vybral
      const pick = vs.length === 1 ? vs[0] : await this._pickVariant(vs, accs);
      if (!pick) return;

      let number = null;
      try {
        const { data, error } = await DB.client.rpc('danubra_next_number', { p_kind: 'order' });
        if (error) throw error;
        number = data;
      } catch (e) {
        return UI.toast('Nepodarilo sa prideliť číslo objednávky — spusti migráciu 002. ' + (e.message || ''), 'err');
      }

      const persons = inq?.persons || 1;
      const nights = pick.nights || UI.nights(inq?.date_from, inq?.date_to) || 0;
      const payload = {
        order_number: number,
        offer_id: offerId, inquiry_id: o.inquiry_id, client_id: o.client_id,
        accommodation_id: pick.accommodation_id,
        date_from: inq?.date_from, date_to: inq?.date_to,
        persons, nights,
        price_per_bed_night: pick.price_per_bed_night,
        total_accommodation: pick.total_accommodation,
        service_fee: o.service_fee,
        urgent_surcharge: o.urgent_surcharge ? (o.service_fee || 0) * 0.2 : null,
        ongoing_service_enabled: o.ongoing_service_enabled,
        ongoing_service_rate: o.ongoing_service_rate,
        status: 'new',
        accepted_at: new Date().toISOString(),
      };
      if (!payload.date_from || !payload.date_to) {
        return UI.toast('Dopyt nemá termín — doplň dátumy pred akceptáciou', 'err');
      }
      const { data: order, error } = await DB.insert('orders', payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');

      await DB.update('offers', offerId, { status: 'accepted' }).catch(() => {});
      if (o.inquiry_id) await DB.update('inquiries', o.inquiry_id, { status: 'won' }).catch(() => {});

      UI.closeModal();
      UI.toast(`Objednávka ${order.order_number} vytvorená`, 'ok');
      await this.load();
      Danubra.renderRoute();
    },

    _pickVariant(vs, accs) {
      return new Promise(resolve => {
        UI.modal('Ktorý variant si klient vybral?', `
          <div style="display:flex;flex-direction:column;gap:2px;">
            ${vs.map((v, i) => {
              const a = accs.find(x => x.id === v.accommodation_id) || {};
              return `<button class="list-row" onclick="Offers._resolvePick('${v.id}')">
                <span style="flex:1;"><strong>${i + 1}) ${UI.esc(a.name || '—')}</strong>
                <span style="color:var(--ink-mute);"> · ${UI.money(v.total_accommodation || 0)}</span></span>
                <span style="color:var(--ink-mute);">›</span></button>`;
            }).join('')}
          </div>`);
        this._pickResolver = (id) => { UI.closeModal(); resolve(vs.find(v => v.id === id) || null); };
      });
    },
    _resolvePick(id) { this._pickResolver?.(id); },

    async del(id) {
      if (!confirm('Zmazať túto ponuku aj s variantmi?')) return;
      const { error } = await DB.remove('offers', id);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal(); UI.toast('Zmazané', 'ok');
      this.items = this.items.filter(x => x.id !== id); Danubra.renderRoute();
    },

    async _settings() {
      if (this._set) return this._set;
      const { data } = await DB.list('settings', { limit: 1 });
      this._set = (data && data[0]) || null;
      return this._set;
    },
    _plusDays(n) {
      const d = new Date(); d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    },
  };

  window.Offers = Offers;
  Danubra.views.offers = function (el) { Offers.view(el); };
})();
