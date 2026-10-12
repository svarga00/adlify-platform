// ============================================================================
// DANUBRA — Ponuky
// ============================================================================
// Ponuka ukazuje maržu už pri písaní. v1 sa dalo zistiť, že sa na zákazke
// prerába, až z faktúr — teda o tri mesiace neskôr.
//
// Dve veci sú blokátory, nie odporúčania: záporná marža a sadzba pre
// živnostníka pod nemeckou minimálnou mzdou. Prvé je obchodná samovražda,
// druhé je pokuta.
//
// Logika je v lib/quotes.js a má testy.
// ============================================================================
(function () {
  const Quo = {
    items: [], partners: [], loaded: false,
    filters: { status: '', q: '' },

    async load() {
      const [q, p] = await Promise.all([
        DB.list('quotes', { order: { column: 'created_at', ascending: false }, limit: 300 }),
        DB.list('partners', { select: 'id,name,payment_terms_days,default_charge_rate,'
          // Do dokumentu treba aj nemecké IČ DPH a kontaktnú osobu.
          + 'is_construction,ust_idnr,country,contact_person,address,city', limit: 300 }),
        Enums.load(),
      ]);
      this.items = q.data || []; this.partners = p.data || [];
      this.loaded = true;
      if (!Cfg.loaded) await Cfg.load();
    },

    partnerName(id) {
      const p = this.partners.find(x => x.id === id);
      return p ? p.name : '—';
    },
    /** Prahy z Nastavení → Cenník a pravidlá. */
    thresholds() { return Cfg.j('staffing'); },

    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const today = new Date().toISOString().slice(0, 10);

      const withPartner = this.items.map(q => ({ ...q, partner_name: this.partnerName(q.partner_id) }));
      const rows = Shell.filterRows(withPartner, {
        q: this.filters.q,
        fields: ['title', 'quote_number', 'partner_name', 'site_city'],
        equals: { status: this.filters.status },
      });

      const card = (q) => {
        const rev = DanubraQuotes.review(q, this.thresholds(), { today });
        const m = rev.margin;
        const tone = m.perHour < 0 ? 'red' : (rev.warnings.length ? 'amber' : 'green');
        return `
          <div class="card card-pad list-card" onclick="Quo.detail('${q.id}')">
            <div class="card-head">
              <div class="card-title">${UI.esc(q.title)}</div>
              ${UI.badge(Enums.label('quote_status', q.status), this.statusKind(q.status))}
            </div>
            <div class="meta-row">
              <span>${Icon('clients', 14)} ${UI.esc(q.partner_name)}</span>
              ${q.site_city ? `<span>${Icon('site', 14)} ${UI.esc(q.site_city)}</span>` : ''}
              <span>${Icon('workers', 14)} ${q.headcount || 1}</span>
              ${q.charge_rate ? `<span>${Icon('invoices', 14)} ${Money.format(Money.toCents(q.charge_rate))}/h</span>` : ''}
            </div>
            <div class="meta-row" style="color:var(--${tone === 'red' ? 'red' : tone === 'amber' ? 'amber' : 'green'});">
              ${Icon(m.perHour < 0 ? 'alert' : 'check', 14)}
              marža ${Money.format(m.perHour)}/h${m.pct != null ? ` · ${UI.pct(m.pct)}` : ''}
              ${m.perMonth ? ` · ${Money.format(m.perMonth)} mesačne` : ''}
            </div>
          </div>`;
      };

      Danubra.setActions(
        `<button class="btn btn-primary btn-sm" onclick="Quo.form()">${Icon('plus')} Nová ponuka</button>`);
      el.innerHTML = Danubra.header(Danubra.labelOf('quotes'),
        'Marža je vidieť skôr, než ponuka odíde')
        + Shell.list({
          rows, total: this.items.length, render: card, layout: 'cards',
          emptyIcon: 'offers', emptyTitle: 'Zatiaľ žiadna ponuka',
          emptySub: 'Ponuka je prvý krok — z prijatej sa spraví zmluva.',
          filter: {
            search: { value: this.filters.q, placeholder: 'Hľadať ponuku, odberateľa, mesto…',
              oninput: 'Quo.setF("q", this.value)' },
            selects: [{
              value: this.filters.status, label: 'Stav',
              onchange: 'Quo.setF("status", this.value)',
              options: [['', 'Všetky stavy'], ...Enums.options('quote_status')],
            }],
          },
        });
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    statusKind(s) {
      return { draft: 'gray', sent: 'blue', accepted: 'green',
        rejected: 'red', expired: 'amber' }[s] || 'gray';
    },

    detail(id) {
      const q = this.items.find(x => x.id === id);
      if (!q) return UI.toast('Nenájdené', 'err');
      const today = new Date().toISOString().slice(0, 10);
      const rev = DanubraQuotes.review(q, this.thresholds(), { today });
      const m = rev.margin;

      const nextStates = (DanubraQuotes.FLOW[q.status] || []);
      const actionBtn = (to) => {
        const label = { sent: 'Označiť ako odoslanú', accepted: 'Odberateľ prijal',
          rejected: 'Odberateľ odmietol', expired: 'Prepadla' }[to];
        const kind = to === 'accepted' ? 'btn-primary' : 'btn-outline';
        return `<button class="btn ${kind} btn-sm" onclick="Quo.setStatus('${q.id}','${to}')">${label}</button>`;
      };

      const body = `
        <div class="detail-head">
          ${UI.badge(Enums.label('quote_status', q.status), this.statusKind(q.status))}
          ${q.quote_number ? `<span class="mono" style="color:var(--ink-mute);">${UI.esc(q.quote_number)}</span>` : ''}
        </div>

        <div class="form-section">Marža</div>
        ${Shell.sums({
          lines: DanubraQuotes.sumLines(q),
          totalLabel: 'Zostane nám na hodinu',
          note: m.perMonth
            ? `Pri ${q.headcount || 1} ${DanubraQuotes.plural(q.headcount || 1, 'človeku', 'ľuďoch', 'ľuďoch')} `
              + `a ${q.hours_per_month || 0} hodinách mesačne to je ${Money.format(m.perMonth)} `
              + `mesačne${m.pct != null ? `, teda ${UI.pct(m.pct)} z fakturovanej sumy` : ''}.`
            : '',
        })}

        ${(rev.reasons.length || rev.warnings.length) ? `
          <div class="form-section">Pred odoslaním</div>
          ${Shell.blocker({ reasons: [...rev.reasons, ...rev.warnings] })}`
          : `<div class="regimebox" style="margin-top:12px;">Ponuka je v poriadku — marža sedí
             a sadzba je nad minimálnou mzdou.</div>`}

        <div class="kv" style="margin-top:14px;">
          <div><span>Odberateľ</span><strong>${UI.esc(this.partnerName(q.partner_id))}</strong></div>
          ${q.trade_key ? `<div><span>Remeslo</span><strong>${UI.esc(Wrk.professionLabel(q.trade_key))}</strong></div>` : ''}
          <div><span>Ľudí</span><strong>${q.headcount || 1}</strong></div>
          <div><span>Typ prác</span><strong>${q.work_type === 'workshop' ? 'Dielenské' : 'Stavebné'}</strong></div>
          ${q.site_city ? `<div><span>Miesto</span><strong>${UI.esc([q.site_address, q.site_city].filter(Boolean).join(', '))}</strong></div>` : ''}
          ${q.date_from ? `<div><span>Termín</span><strong>${UI.dateRange(q.date_from, q.date_to)}</strong></div>` : ''}
          ${q.valid_until ? `<div><span>Platí do</span><strong>${UI.date(q.valid_until)}</strong></div>` : ''}
        </div>
        ${q.notes ? `<div class="notebox">${UI.esc(q.notes)}</div>` : ''}
        ${q.reject_reason ? `<div class="warnbox" style="margin-top:10px;">
          ${Icon('alert', 14)} Odmietnuté: ${UI.esc(q.reject_reason)}</div>` : ''}

        <div class="modal-actions" style="flex-wrap:wrap;gap:8px;">
          <button class="btn btn-outline btn-sm" onclick="Quo.document('${q.id}')">
            ${Icon('doc', 14)} Angebot (PDF)</button>
          <button class="btn btn-outline btn-sm" onclick="Quo.form('${q.id}')">Upraviť</button>
          ${nextStates.map(actionBtn).join('')}
          ${q.status === 'accepted' ? `
            <button class="btn btn-primary btn-sm" onclick="Quo.toContract('${q.id}')">
              ${Icon('note', 14)} Spraviť zmluvu</button>` : ''}
        </div>`;
      UI.modal(q.title, body, { wide: true });
    },

    /**
     * Ponuka ako dokument — po nemecky, lebo ju číta a rozhoduje sa podľa nej
     * odberateľ. PDF sa robí tlačou prehliadača: v dialógu treba vybrať
     * „Uložiť ako PDF". Bez knižnice, rovnako ako pri faktúre.
     */
    document(id) {
      const q = this.items.find(x => x.id === id);
      if (!q) return UI.toast('Nenájdené', 'err');
      if (!Danubra.supplierReady('Ponuka')) return;
      const supplier = Danubra.supplier();
      const partner = this.partners.find(p => p.id === q.partner_id) || {};

      const html = window.DanubraPapers.quote({
        quote: q,
        // Odberateľ má v dokumente nemecké označenie IČ DPH.
        client: { name: partner.name, vat_id: partner.ust_idnr,
          country: partner.country || 'DE', contact_person: partner.contact_person },
        supplier,
        trade: q.trade_key ? Wrk.professionLabel(q.trade_key) : null,
        note: q.notes || null,
      });
      const w = window.open('', '_blank');
      if (!w) return UI.toast('Povoľ vyskakovacie okná pre zobrazenie dokumentu', 'err');
      w.document.open(); w.document.write(html); w.document.close();
    },

    async setStatus(id, to) {
      const q = this.items.find(x => x.id === id);
      if (!q) return;
      if (!DanubraQuotes.canGo(q.status, to)) {
        return UI.toast(`Z „${Enums.label('quote_status', q.status)}" sa nedá prejsť ďalej`, 'err');
      }
      // Ponuku, na ktorej sa prerába alebo je pod minimálnou mzdou, nemá
      // zmysel poslať — a hlavne sa to nemá dať prehliadnuť.
      if (to === 'sent') {
        const rev = DanubraQuotes.review(q, this.thresholds());
        if (!rev.ok) {
          return UI.toast(rev.reasons[0].label, 'err');
        }
      }
      const patch = { status: to };
      if (to === 'sent') patch.sent_at = new Date().toISOString();
      if (['accepted', 'rejected'].includes(to)) patch.decided_at = new Date().toISOString();
      if (to === 'rejected') {
        const why = await UI.ask('Prečo odmietol? (hodí sa o pol roka)');
        if (why) patch.reject_reason = why;
      }
      const { error } = await DB.update('quotes', id, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      Object.assign(q, patch);
      UI.toast('Stav uložený', 'ok');
      this.detail(id);
    },

    form(id) {
      const q = id ? this.items.find(x => x.id === id) || {} : {};
      const body = `
        <form id="quo-form" onsubmit="event.preventDefault();Quo.save('${id || ''}')">
          <div class="form-grid">
            ${UI.field('title', 'Názov ponuky', { value: q.title, required: true,
              placeholder: 'napr. Sadrokartón — Leipzig, 4 ľudia' })}
            ${UI.field('partner_id', 'Odberateľ', { value: q.partner_id, required: true, add: 'partner',
              options: [['', '— vyber —'], ...this.partners.map(p => [p.id, p.name])] })}
            ${UI.field('trade_key', 'Remeslo', { value: q.trade_key, add: 'trade',
              options: [['', '—'], ...Wrk.professions()] })}
            ${UI.field('headcount', 'Koľko ľudí', { type: 'number', value: q.headcount ?? 1 })}
            ${UI.field('work_type', 'Typ prác', { value: q.work_type || 'construction',
              options: [['construction', 'Stavebné (SOKA, §48b, Bau-Mindestlohn)'],
                        ['workshop', 'Dielenské (nižšia regulácia)']],
              hint: 'Stavba znamená vyššie odvody aj zrážku 15 % z faktúry. Pri '
                + 'rovnakej sadzbe je z nej podstatne menšia marža než z dielne.' })}
            ${UI.field('site_city', 'Mesto', { value: q.site_city })}
            ${UI.field('site_address', 'Adresa stavby', { value: q.site_address })}
            ${UI.field('date_from', 'Od', { type: 'date', value: q.date_from })}
            ${UI.field('date_to', 'Do', { type: 'date', value: q.date_to })}
            ${UI.field('valid_until', 'Ponuka platí do', { type: 'date', value: q.valid_until,
              hint: 'Po tomto dni ponuka prepadne a na prehľade sa to zobrazí ako '
                + 'červené. Bez platnosti sa o pol roka niekto odvolá na sadzbu, '
                + 'ktorá už neplatí.' })}
          </div>

          <div class="form-section">Peniaze</div>
          <div class="regimebox" style="margin:0 0 12px;">
            Réžia je ubytovanie, doprava a všetko ostatné prepočítané na hodinu.
            Keď ju necháš na nule, marža bude vyzerať lepšie, než je.</div>
          <div class="form-grid">
            ${UI.field('charge_rate', 'Fakturujeme €/h', { type: 'number', value: q.charge_rate,
              hint: 'Sadzba bez DPH, ktorú uvidí odberateľ v ponuke aj na faktúre.' })}
            ${UI.field('worker_rate', 'Živnostníkovi €/h', { type: 'number', value: q.worker_rate,
              hint: 'Čo zaplatíme jemu. Na stavbe musí byť aspoň Bau-Mindestlohn — '
                + 'pod ním to databáza pustí len s výnimkou.' })}
            ${UI.field('overhead_per_hour', 'Réžia €/h', { type: 'number', value: q.overhead_per_hour ?? 0,
              hint: 'Ubytovanie, doprava a réžia prepočítané na hodinu. Na nule '
                + 'vyjde marža vyššia, než aká naozaj je.' })}
            ${UI.field('hours_per_month', 'Hodín na človeka/mesiac', { type: 'number',
              value: q.hours_per_month ?? 168,
              hint: '168 je bežný mesiac. Z tohto čísla sa počíta mesačná marža '
                + 'v ponuke — nie je to záväzok odpracovať ich.' })}
          </div>
          <div id="quo-live"></div>

          ${UI.field('notes', 'Poznámka', { type: 'textarea', value: q.notes })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Vytvoriť'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť ponuku' : 'Nová ponuka', body, { wide: true });
      // Marža sa prepočítava pri písaní — inak by sa zlá sadzba zistila
      // až po uložení.
      const form = document.getElementById('quo-form');
      const live = () => this.renderLive();
      ['charge_rate', 'worker_rate', 'overhead_per_hour', 'hours_per_month', 'headcount', 'work_type']
        .forEach(n => { const el = form.querySelector(`[name="${n}"]`); if (el) el.addEventListener('input', live); });
      live();
    },

    /** Živý prepočet marže vo formulári. */
    renderLive() {
      const box = document.getElementById('quo-live');
      if (!box) return;
      const d = UI.formData(document.getElementById('quo-form'));
      const rev = DanubraQuotes.review({ ...d, partner_id: d.partner_id || 'x' },
        this.thresholds());
      box.innerHTML = Shell.sums({
        lines: DanubraQuotes.sumLines(d), compact: true,
        totalLabel: 'Zostane nám na hodinu',
        note: rev.margin.perMonth ? `${Money.format(rev.margin.perMonth)} mesačne` : '',
      }) + (rev.reasons.length || rev.warnings.length
        ? Shell.blocker({ reasons: [...rev.reasons.filter(r => r.rule !== 'quote_no_partner'),
                                    ...rev.warnings] })
        : '');
    },

    async save(id) {
      const d = UI.formData(document.getElementById('quo-form'));
      if (!d.title) return UI.toast('Názov je povinný', 'err');
      if (!d.partner_id) return UI.toast('Vyber odberateľa', 'err');
      const payload = { ...d };
      ['charge_rate', 'worker_rate', 'overhead_per_hour', 'hours_per_month', 'headcount']
        .forEach(k => { payload[k] = d[k] === '' ? null : Number(d[k]); });
      ['date_from', 'date_to', 'valid_until']
        .forEach(k => { if (payload[k] === '') payload[k] = null; });

      if (!id) {
        try {
          payload.quote_number = await this.nextNumber();
        } catch (e) {
          return UI.toast('Nepodarilo sa prideliť číslo ponuky: ' + e.message, 'err');
        }
        payload.status = 'draft';
      }
      const res = id ? await DB.update('quotes', id, payload) : await DB.insert('quotes', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast(id ? 'Uložené' : 'Ponuka vytvorená', 'ok');
      this.loaded = false; await this.load(); Danubra.renderRoute();
    },

    /**
     * PON-2026-0001. Číslo prideľuje databáza transakčne (`danubra_next_number`),
     * nie prehliadač — inak by pri dvoch ľuďoch naraz vznikla diera alebo
     * duplicita. Rad sa vynuluje pri zmene roka.
     */
    async nextNumber() {
      const { data, error } = await DB.client.rpc('danubra_next_number', { p_kind: 'quote' });
      if (error) throw error;
      return data;
    },

    /** Z prijatej ponuky sa spraví zmluva. Predmet diela sa dopisuje ručne. */
    async toContract(id) {
      const q = this.items.find(x => x.id === id);
      if (!q) return;
      UI.closeModal();
      Danubra.go('contracts');
      setTimeout(() => Con.form(null, DanubraQuotes.toContract(q)), 300);
    },
  };

  window.Quo = Quo;
  Danubra.views.quotes = function (el) { return Quo.view(el); };
})();
