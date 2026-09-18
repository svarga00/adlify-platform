// ============================================================================
// DANUBRA — Prijaté faktúry a náklady
// ============================================================================
// Druhá strana peňazí. Dve veci na jednej obrazovke, lebo sa pozerajú spolu:
// čo nám fakturujú živnostníci a čo stojí všetko ostatné.
//
// Prijatá faktúra sa porovná so schválenými hodinami hneď pri zadaní.
// Rozdiel znamená spor a sporná faktúra sa nedá schváliť bez poznámky —
// drží to trigger v databáze, táto obrazovka to len ukáže včas.
//
// Logika je v lib/billing/bills.js a má testy.
// ============================================================================
(function () {
  const Cost = {
    tab: 'bills',
    bills: [], costs: [], workers: [], periods: [], timesheets: [], assignments: [],
    subcontracts: [], loaded: false,
    filters: { status: '', q: '', category: '' },

    async load() {
      const [b, c, w, per, ts, a, s] = await Promise.all([
        DB.list('bills', { order: { column: 'issue_date', ascending: false }, limit: 500 }),
        DB.list('costs', { order: { column: 'cost_date', ascending: false }, limit: 1000 }),
        DB.list('workers', { select: 'id,full_name,company_id,company_name,bank_iban,hourly_cost', limit: 500 }),
        DB.list('periods', { limit: 500 }),
        DB.list('timesheets', { limit: 5000 }),
        DB.list('assignments', { limit: 1000 }),
        DB.list('subcontracts', { select: 'id,title,contract_number', limit: 500 }),
        Enums.load(),
      ]);
      this.bills = b.data || []; this.costs = c.data || [];
      this.workers = w.data || []; this.periods = per.data || [];
      this.timesheets = ts.data || []; this.assignments = a.data || [];
      this.subcontracts = s.data || [];
      this.loaded = true;
    },

    workerOf(id) { return this.workers.find(w => w.id === id) || {}; },
    subOf(id) { return this.subcontracts.find(s => s.id === id) || {}; },
    periodLabel(id) {
      const p = this.periods.find(x => x.id === id);
      return p ? UI.dateRange(p.period_from, p.period_to) : null;
    },
    ctx(bill) {
      return {
        bill,
        worker: this.workerOf(bill.worker_id),
        timesheets: this.timesheets,
        assignments: this.assignments,
      };
    },

    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }

      const disputed = this.bills.filter(b => b.status === 'disputed');
      Danubra.setActions(
        `<button class="btn btn-primary btn-sm" onclick="Cost.${this.tab === 'bills' ? 'billForm' : 'costForm'}()">
          ${Icon('plus')} ${this.tab === 'bills' ? 'Prijatá faktúra' : 'Náklad'}</button>`);
      const head = Danubra.header(Danubra.labelOf('costs'),
        'Čo nám fakturujú živnostníci a čo stojí všetko ostatné')
        + `<div class="filterbar" style="margin-bottom:12px;">
             <button class="fb-chip${this.tab === 'bills' ? ' active' : ''}" onclick="Cost.setTab('bills')">
               Prijaté faktúry<em>${this.bills.length}</em></button>
             <button class="fb-chip${this.tab === 'costs' ? ' active' : ''}" onclick="Cost.setTab('costs')">
               Ostatné náklady<em>${this.costs.length}</em></button>
           </div>`
        + (disputed.length ? `<div class="warnbox" style="margin-bottom:12px;">
             ${Icon('alert', 14)} ${disputed.length}
             ${DanubraBills.plural(disputed.length, 'faktúra nesedí', 'faktúry nesedia', 'faktúr nesedí')}
             so schválenými hodinami. Bez poznámky sa nedajú schváliť.</div>` : '');

      el.innerHTML = head + (this.tab === 'bills' ? this.billsHtml() : this.costsHtml());
    },

    setTab(t) { this.tab = t; this.filters = { status: '', q: '', category: '' }; Danubra.renderRoute(); },
    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    // ── Prijaté faktúry ───────────────────────────────────────────────────
    billsHtml() {
      const rows = Shell.filterRows(
        this.bills.map(b => ({ ...b, worker_name: this.workerOf(b.worker_id).full_name || '' })),
        { q: this.filters.q, fields: ['bill_number', 'worker_name'],
          equals: { status: this.filters.status } });

      const card = (b) => {
        const c = DanubraBills.check(b, this.ctx(b));
        const off = c.variance != null && Math.abs(c.variance) > DanubraBills.TOLERANCE;
        return `
          <div class="card card-pad list-card" onclick="Cost.billDetail('${b.id}')">
            <div class="card-head">
              <div class="card-title">${UI.esc(b.worker_name || '—')}</div>
              ${UI.badge(Enums.label('bill_status', b.status), this.billKind(b.status))}
            </div>
            <div class="meta-row">
              ${b.bill_number ? `<span>${Icon('invoices', 14)} ${UI.esc(b.bill_number)}</span>` : ''}
              <span><strong>${Money.format(Money.toCents(b.amount))}</strong></span>
              ${b.issue_date ? `<span>${Icon('clock', 14)} ${UI.date(b.issue_date)}</span>` : ''}
              ${this.periodLabel(b.period_id) ? `<span>${this.periodLabel(b.period_id)}</span>` : ''}
            </div>
            ${off ? `<div class="meta-row" style="color:var(--red);">
              ${Icon('alert', 14)} ${c.variance > 0 ? 'o ' + Money.format(c.variance) + ' viac'
                : 'o ' + Money.format(Math.abs(c.variance)) + ' menej'},
              než má schválených hodín (${c.hours} h)</div>` : ''}
          </div>`;
      };

      return Shell.list({
        rows, total: this.bills.length, render: card, layout: 'cards',
        emptyIcon: 'invoices', emptyTitle: 'Zatiaľ žiadna prijatá faktúra',
        emptySub: 'Keď živnostník pošle faktúru, zadaj ju sem — porovná sa s hodinami.',
        filter: {
          search: { value: this.filters.q, placeholder: 'Hľadať podľa čísla alebo mena…',
            oninput: 'Cost.setF("q", this.value)' },
          selects: [{
            value: this.filters.status, label: 'Stav',
            onchange: 'Cost.setF("status", this.value)',
            options: [['', 'Všetky stavy'], ...Enums.options('bill_status')],
          }],
        },
      });
    },

    billKind(s) {
      return { received: 'gray', checked: 'blue', disputed: 'red',
        approved: 'green', paid: 'green' }[s] || 'gray';
    },

    billDetail(id) {
      const b = this.bills.find(x => x.id === id);
      if (!b) return UI.toast('Nenájdené', 'err');
      const w = this.workerOf(b.worker_id);
      const rev = DanubraBills.review(this.ctx(b));
      const c = rev.check;

      const next = { received: 'checked', checked: 'approved', disputed: 'approved',
        approved: 'paid' }[b.status];
      const nextLabel = { checked: 'Označiť skontrolovanú', approved: 'Schváliť',
        paid: 'Označiť uhradenú' }[next];

      const body = `
        <div class="detail-head">
          ${UI.badge(Enums.label('bill_status', b.status), this.billKind(b.status))}
          ${b.bill_number ? `<span class="mono" style="color:var(--ink-mute);">${UI.esc(b.bill_number)}</span>` : ''}
        </div>

        <div class="form-section">Porovnanie s hodinami</div>
        ${Shell.sums({ lines: DanubraBills.sumLines(c),
          totalLabel: 'Na úhradu',
          note: c.variance == null
            ? 'Faktúra nie je naviazaná na uzavreté obdobie, takže sa nedá porovnať.'
            : (Math.abs(c.variance) <= DanubraBills.TOLERANCE
              ? 'Sedí so schválenými hodinami.'
              : `Rozdiel ${Money.format(c.variance)} oproti podkladu.`) })}

        ${(rev.reasons.length || rev.warnings.length)
          ? Shell.blocker({ reasons: [...rev.reasons, ...rev.warnings] })
          : '<div class="regimebox" style="margin-top:12px;">Faktúra sedí a má všetko, čo treba.</div>'}

        <div class="kv" style="margin-top:14px;">
          <div><span>Živnostník</span><strong>${UI.esc(w.full_name || '—')}</strong></div>
          ${w.company_id ? `<div><span>IČO</span><strong>${UI.esc(w.company_id)}</strong></div>` : ''}
          ${b.issue_date ? `<div><span>Vystavená</span><strong>${UI.date(b.issue_date)}</strong></div>` : ''}
          ${b.due_date ? `<div><span>Splatnosť</span><strong>${UI.date(b.due_date)}</strong></div>` : ''}
          ${this.periodLabel(b.period_id) ? `<div><span>Obdobie</span><strong>${this.periodLabel(b.period_id)}</strong></div>` : ''}
          ${b.subcontract_id ? `<div><span>Zákazka</span><strong>${UI.esc(this.subOf(b.subcontract_id).title || '')}</strong></div>` : ''}
        </div>
        ${b.note ? `<div class="notebox">${UI.esc(b.note)}</div>` : ''}

        <div class="modal-actions" style="flex-wrap:wrap;gap:8px;">
          <button class="btn btn-outline btn-sm" onclick="Cost.billForm('${b.id}')">Upraviť</button>
          ${next ? `<button class="btn btn-primary btn-sm" onclick="Cost.setBillStatus('${b.id}','${next}')">${nextLabel}</button>` : ''}
        </div>`;
      UI.modal(`Faktúra od ${w.full_name || 'živnostníka'}`, body, { wide: true });
    },

    /**
     * Sporná faktúra sa nedá schváliť bez poznámky. Pýta sa na ňu tu, ale
     * pravdu drží trigger — keby sa poznámka obišla, databáza to odmietne.
     */
    async setBillStatus(id, to) {
      const b = this.bills.find(x => x.id === id);
      if (!b) return;
      const c = DanubraBills.check(b, this.ctx(b));
      const patch = { status: to };

      if (to === 'approved' && c.variance != null
          && Math.abs(c.variance) > DanubraBills.TOLERANCE) {
        const why = prompt(
          `Faktúra sa líši od schválených hodín o ${Money.format(c.variance)}.\n\n`
          + 'Napíš prečo ju schvaľuješ. Zostane to pri faktúre.');
        if (!why || why.trim().length < 5) {
          return UI.toast('Bez vysvetlenia sa sporná faktúra schváliť nedá', 'err');
        }
        patch.note = b.note ? `${b.note}\n${why}` : why;
      }
      if (to === 'checked') patch.checked_at = new Date().toISOString();

      const { error } = await DB.update('bills', id, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast('Uložené', 'ok');
      this.loaded = false; await this.load(); this.billDetail(id);
    },

    billForm(id) {
      const b = id ? this.bills.find(x => x.id === id) || {} : {};
      // Ponúkame len uzavreté obdobia — z otvoreného sa porovnávať nedá.
      const periods = this.periods
        .filter(p => p.status !== 'open')
        .map(p => [p.id, `${this.subOf(p.subcontract_id).title || 'Zákazka'} · ${UI.dateRange(p.period_from, p.period_to)}`]);

      const body = `
        <form id="bill-form" onsubmit="event.preventDefault();Cost.saveBill('${id || ''}')">
          <div class="regimebox" style="margin:0 0 12px;">
            Keď faktúru naviažeš na uzavreté obdobie, appka ju hneď porovná
            so schválenými hodinami. Bez obdobia sa schvaľuje naslepo.</div>
          <div class="form-grid">
            ${UI.field('worker_id', 'Od koho', { value: b.worker_id, required: true,
              options: [['', '— vyber —'], ...this.workers.map(w => [w.id, w.full_name])] })}
            ${UI.field('bill_number', 'Ich číslo faktúry', { value: b.bill_number })}
            ${UI.field('amount', 'Suma €', { type: 'number', value: b.amount, required: true })}
            ${UI.field('period_id', 'Obdobie', { value: b.period_id,
              options: [['', '— bez obdobia —'], ...periods] })}
            ${UI.field('issue_date', 'Vystavená', { type: 'date', value: b.issue_date })}
            ${UI.field('due_date', 'Splatnosť', { type: 'date', value: b.due_date })}
          </div>
          <div id="bill-live"></div>
          ${UI.field('note', 'Poznámka', { type: 'textarea', value: b.note })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Pridať'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť prijatú faktúru' : 'Prijatá faktúra', body, { wide: true });

      // Rozdiel sa ukáže pri písaní, nie až po uložení.
      const form = document.getElementById('bill-form');
      const live = () => this.billLive();
      ['worker_id', 'amount', 'period_id'].forEach(n => {
        const el = form.querySelector(`[name="${n}"]`);
        if (el) { el.addEventListener('input', live); el.addEventListener('change', live); }
      });
      live();
    },

    billLive() {
      const box = document.getElementById('bill-live');
      if (!box) return;
      const d = UI.formData(document.getElementById('bill-form'));
      if (!d.worker_id || !d.period_id) { box.innerHTML = ''; return; }
      const c = DanubraBills.check(d, this.ctx(d));
      if (c.expected == null) { box.innerHTML = ''; return; }
      const off = Math.abs(c.variance) > DanubraBills.TOLERANCE;
      box.innerHTML = `<div class="${off ? 'warnbox' : 'regimebox'}" style="margin:0 0 12px;">
        ${off ? Icon('alert', 14) : Icon('check', 14)}
        Podľa ${c.hours} ${DanubraBills.plural(c.hours, 'schválenej hodiny', 'schválených hodín', 'schválených hodín')}
        by malo prísť <strong>${Money.format(c.expected)}</strong>.
        ${off ? `Rozdiel <strong>${Money.format(c.variance)}</strong> — faktúra pôjde do sporu.`
          : 'Sedí.'}</div>`;
    },

    async saveBill(id) {
      const d = UI.formData(document.getElementById('bill-form'));
      if (!d.worker_id) return UI.toast('Vyber, od koho faktúra je', 'err');
      if (!d.amount) return UI.toast('Zadaj sumu', 'err');
      const payload = { ...d };
      payload.amount = Number(d.amount);
      ['issue_date', 'due_date', 'period_id'].forEach(k => { if (payload[k] === '') payload[k] = null; });
      // Zákazku odvodíme z obdobia — nech sa nezadáva dvakrát.
      if (payload.period_id) {
        const p = this.periods.find(x => x.id === payload.period_id);
        if (p) payload.subcontract_id = p.subcontract_id;
      }
      const res = id ? await DB.update('bills', id, payload) : await DB.insert('bills', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast(id ? 'Uložené' : 'Faktúra zadaná', 'ok');
      this.loaded = false; await this.load(); Danubra.renderRoute();
    },

    // ── Ostatné náklady ───────────────────────────────────────────────────
    costsHtml() {
      const rows = Shell.filterRows(this.costs, {
        q: this.filters.q, fields: ['description', 'supplier'],
        equals: { category: this.filters.category },
      });
      const by = DanubraBills.byCategory(rows);
      const total = Money.sum(rows.map(c => Money.toCents(c.amount)));

      const row = (c) => `
        <div class="list-row" onclick="Cost.costForm('${c.id}')">
          <span class="dot ${c.parent_cost_id ? '' : c.recurring ? 'blue' : ''}"></span>
          <span style="flex:1;font-size:13px;">
            <strong>${UI.esc(c.description || Enums.label('cost_category', c.category))}</strong>
            ${c.recurring ? UI.badge('opakovaný', 'blue') : ''}
            <span style="display:block;color:var(--ink-mute);font-size:12px;">
              ${UI.esc(Enums.label('cost_category', c.category))}
              · ${UI.date(c.cost_date)}
              ${c.supplier ? ' · ' + UI.esc(c.supplier) : ''}
              ${c.subcontract_id ? ' · ' + UI.esc(this.subOf(c.subcontract_id).title || '') : ''}</span>
          </span>
          <strong>${Money.format(Money.toCents(c.amount))}</strong>
        </div>`;

      return Shell.list({
        rows, total: this.costs.length, render: row,
        emptyIcon: 'invoices', emptyTitle: 'Zatiaľ žiadne náklady',
        emptySub: 'Ubytovanie, doprava, náradie — všetko, čo nie je faktúra od živnostníka.',
        filter: {
          search: { value: this.filters.q, placeholder: 'Hľadať náklad, dodávateľa…',
            oninput: 'Cost.setF("q", this.value)' },
          selects: [{
            value: this.filters.category, label: 'Kategória',
            onchange: 'Cost.setF("category", this.value)',
            options: [['', 'Všetky kategórie'], ...Enums.options('cost_category')],
          }],
        },
      }) + (rows.length ? `
        <div class="form-section">Po kategóriách</div>
        ${Shell.sums({
          lines: by.map(x => ({ label: Enums.label('cost_category', x.category), cents: x.cents })),
          totalLabel: 'Spolu',
        })}` : '');
    },

    costForm(id) {
      const c = id ? this.costs.find(x => x.id === id) || {} : {};
      const body = `
        <form id="cost-form" onsubmit="event.preventDefault();Cost.saveCost('${id || ''}')">
          <div class="form-grid">
            ${UI.field('category', 'Kategória', { value: c.category || 'accommodation',
              required: true, options: Enums.options('cost_category') })}
            ${UI.field('amount', 'Suma €', { type: 'number', value: c.amount, required: true })}
            ${UI.field('cost_date', 'Dátum', { type: 'date',
              value: c.cost_date || new Date().toISOString().slice(0, 10) })}
            ${UI.field('supplier', 'Dodávateľ', { value: c.supplier })}
            ${UI.field('subcontract_id', 'Zákazka', { value: c.subcontract_id,
              options: [['', '— bez zákazky —'], ...this.subcontracts.map(s => [s.id, s.title])] })}
            ${UI.field('worker_id', 'Koho sa týka', { value: c.worker_id,
              options: [['', '— nikoho konkrétneho —'], ...this.workers.map(w => [w.id, w.full_name])] })}
          </div>
          ${UI.field('description', 'Popis', { value: c.description })}
          <div class="form-section">Opakovanie</div>
          <div class="regimebox" style="margin:0 0 12px;">
            Mesačné ubytovanie sa nezadáva dvanásťkrát. Zapni opakovanie a
            ďalšie mesiace vzniknú samy — vždy k tomu istému dňu.</div>
          <div class="chk-row">
            ${UI.field('recurring', '', { type: 'checkbox', value: c.recurring,
              placeholder: 'Opakuje sa každý mesiac' })}
          </div>
          ${UI.field('recurring_until', 'Opakovať do (nepovinné)', { type: 'date',
            value: c.recurring_until })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Pridať'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť náklad' : 'Nový náklad', body, { wide: true });
    },

    async saveCost(id) {
      const d = UI.formData(document.getElementById('cost-form'));
      if (!d.amount) return UI.toast('Zadaj sumu', 'err');
      const payload = { ...d };
      payload.amount = Number(d.amount);
      ['subcontract_id', 'worker_id', 'recurring_until'].forEach(k => {
        if (payload[k] === '') payload[k] = null;
      });
      const res = id ? await DB.update('costs', id, payload) : await DB.insert('costs', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast(id ? 'Uložené' : 'Náklad pridaný', 'ok');
      this.loaded = false; await this.load(); Danubra.renderRoute();
    },
  };

  window.Cost = Cost;
  Danubra.views.costs = function (el) { return Cost.view(el); };
})();
