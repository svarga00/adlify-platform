// ============================================================================
// DANUBRA — Banka a cash-flow
// ============================================================================
// Podľa biznis plánu je likvidita najpravdepodobnejší dôvod zlyhania — nie
// nedostatok dopytu. Odberateľ platí za 30–60 dní, živnostníkom sa platí do
// 14. Preto je prvé, čo na tejto obrazovke vidíš, odpoveď na otázku
// „bude na výplaty?".
//
// Import je tolerantný k formátu výpisu a riadky, ktoré sa nedali prečítať,
// sa vypíšu — nezahodia sa ticho. Ten istý výpis sa nenaimportuje dvakrát,
// drží to unikátny odtlačok v databáze.
//
// Logika je v lib/bank.js a má testy.
// ============================================================================
(function () {
  const Bank = {
    tab: 'cashflow',
    txs: [], cashflow: [], invoices: [], bills: [], loaded: false,
    filters: { status: 'unmatched', q: '' },
    pending: null,          // rozparsovaný výpis pred uložením

    async load() {
      const [t, cf, i, b] = await Promise.all([
        DB.list('bank_transactions', { order: { column: 'booked_at', ascending: false }, limit: 1000 }),
        DB.list('v_cashflow', { limit: 1000 }),
        DB.list('invoices', { select: 'id,invoice_number,total,amount_net,status,due_date,partner_id', limit: 500 }),
        DB.list('bills', { select: 'id,bill_number,amount,status,worker_id,due_date', limit: 500 }),
        Enums.load(),
      ]);
      this.txs = t.data || []; this.cashflow = cf.data || [];
      this.invoices = i.data || []; this.bills = b.data || [];
      this.loaded = true;
      if (!Cfg.loaded) await Cfg.load();
    },

    /** Dnešný zostatok — súčet všetkého, čo prešlo účtom. */
    balance() { return Money.sum(this.txs.map(t => Money.toCents(t.amount))); },
    thresholds() { return Cfg.j('staffing'); },

    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const unmatched = this.txs.filter(t => t.match_status === 'unmatched').length;

      Danubra.setActions(`<button class="btn btn-outline btn-sm" onclick="Bank.payForm()">
        ${Icon('wallet', 14)} Pripraviť platby</button>
        <button class="btn btn-primary btn-sm" onclick="Bank.importForm()">
        ${Icon('upload', 14)} Načítať výpis</button>`);
      el.innerHTML = Danubra.header(Danubra.labelOf('bank'),
        'Čo príde, čo odíde a či to vyjde')
        + `<div class="filterbar" style="margin-bottom:12px;">
             <button class="fb-chip${this.tab === 'cashflow' ? ' active' : ''}" onclick="Bank.setTab('cashflow')">
               Cash-flow</button>
             <button class="fb-chip${this.tab === 'txs' ? ' active' : ''}" onclick="Bank.setTab('txs')">
               Pohyby<em>${this.txs.length}</em></button>
             ${unmatched ? `<span class="fb-count" style="color:var(--amber);">
               ${unmatched} nespárovaných</span>` : ''}
           </div>`
        + (this.tab === 'cashflow' ? this.cashflowHtml() : this.txsHtml());
    },

    setTab(t) { this.tab = t; Danubra.renderRoute(); },
    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    // ── Cash-flow ─────────────────────────────────────────────────────────
    cashflowHtml() {
      const f = DanubraBank.forecast({
        balance: this.balance(), items: this.cashflow, weeks: 8,
      });
      const scale = DanubraBank.scaleCheck(f, this.thresholds());

      const week = (b, i) => `<div class="cf-week${b.balance < 0 ? ' cf-neg' : ''}">
          <div class="cf-when">${UI.date(b.from)}<span>${i + 1}. týždeň</span></div>
          <div class="cf-flows">
            ${b.in ? `<span class="cf-in">+${Money.format(b.in, { currency: '' })}</span>` : ''}
            ${b.out ? `<span class="cf-out">−${Money.format(Math.abs(b.out), { currency: '' })}</span>` : ''}
            ${!b.in && !b.out ? '<span class="cf-quiet">nič</span>' : ''}
          </div>
          <div class="cf-balance">${Money.format(b.balance)}</div>
        </div>`;

      return `
        ${this.nowHtml(f, scale)}
        ${Shell.blocker({
          reasons: [...scale.reasons, ...scale.warnings],
          okHtml: `<p style="margin:6px 0 0;font-size:13px;color:var(--ink-sub);">
            Najnižší bod výhľadu je ${Money.format(f.lowest.balance)} — nad rezervou
            ${Money.format(scale.buffer)}. Na výplaty aj na ďalších ľudí to vyjde.</p>`,
        })}

        <div class="kv" style="margin-top:14px;">
          <div><span>Na účte dnes</span><strong>${Money.format(f.startBalance)}</strong></div>
          ${f.overdue.in || f.overdue.out ? `<div><span>Po splatnosti</span><strong>${
            Money.format(f.overdue.in + f.overdue.out)}</strong></div>` : ''}
          <div><span>Najnižší bod</span><strong style="${f.lowest.balance < 0 ? 'color:var(--red);' : ''}">${
            Money.format(f.lowest.balance)}</strong></div>
          <div><span>Za osem týždňov</span><strong>${Money.format(f.endBalance)}</strong></div>
        </div>

        <div class="form-section">Výhľad po týždňoch</div>
        <div class="cf-list">${f.buckets.map(week).join('')}</div>

        ${this.upcomingHtml(f)}`;
    },

    /**
     * Čo spraviť teraz. Poradie drží knižnica (`DanubraBank.nowNext`):
     * najprv starý výpis, pretože bez neho je celý výhľad výpočet
     * z nesprávneho čísla, potom mínus na účte, potom nespárované pohyby.
     */
    nowHtml(f, scale) {
      const n = DanubraBank.nowNext({
        forecast: f, scale, txs: this.txs, today: Danubra._dayISO(),
      });
      const AKCIA = {
        import: { label: 'Načítať výpis', onclick: 'Bank.importForm()', ico: 'upload' },
        negative: { label: 'Pozrieť vydané faktúry', onclick: "Danubra.go('invoices')", ico: 'invoices' },
        match: { label: 'Spárovať pohyby', onclick: "Bank.setTab('txs')", ico: 'check' },
      };
      return Shell.now(n, { help: 'card.bank.now', action: AKCIA[n.key] });
    },

    /** Čo konkrétne sa čaká — bez toho je výhľad len graf. */
    upcomingHtml(f) {
      const all = [...f.overdue.items, ...f.buckets.flatMap(b => b.items)]
        .sort((a, b) => String(a.expected_on).localeCompare(String(b.expected_on)))
        .slice(0, 25);
      if (!all.length) return '';
      // Pohľad `v_cashflow` nesie, z čoho riadok vznikol — dá sa teda otvoriť
      // presne tá faktúra, na ktorú sa čaká, nie len zoznam faktúr.
      const TYPE = { invoice: 'invoice', bill: 'bill' };
      const row = (it) => `
        <div class="list-row" style="cursor:default;align-items:flex-start;">
          <span class="dot ${it.overdue ? 'red' : Money.toCents(it.amount) > 0 ? 'green' : ''}"
                style="margin-top:6px;"></span>
          <span style="flex:1;font-size:13px;min-width:0;">
            <strong>${UI.esc(it.counterparty || it.label || '—')}</strong>
            ${it.overdue ? UI.badge('po splatnosti', 'red') : ''}
            <span style="display:block;color:var(--ink-mute);font-size:12px;">
              ${UI.esc(it.label || '')} · ${UI.date(it.expected_on)}
              ${it.source === 'invoice' ? ' · vydaná faktúra'
                : it.source === 'bill' ? ' · faktúra od živnostníka' : ' · náklad'}</span>
            ${Danubra.canOpen(TYPE[it.source], it.source_id) ? `<span class="link-row" style="margin-top:6px;">
              ${Danubra.link(TYPE[it.source], it.source_id, it.label || 'Otvoriť')}</span>` : ''}
          </span>
          <strong style="${Money.toCents(it.amount) < 0 ? 'color:var(--red);' : ''}">${
            Money.format(Money.toCents(it.amount), { sign: true })}</strong>
        </div>`;
      return `<div class="form-section">Čo sa čaká</div>${all.map(row).join('')}`;
    },

    // ── Pohyby ────────────────────────────────────────────────────────────
    txsHtml() {
      const rows = Shell.filterRows(this.txs, {
        q: this.filters.q, fields: ['counterparty_name', 'variable_symbol', 'message'],
        equals: { match_status: this.filters.status },
      });

      const row = (t) => {
        const cents = Money.toCents(t.amount);
        const matched = t.matched_invoice_id || t.matched_bill_id || t.matched_cost_id;
        return `<div class="list-row" onclick="Bank.txDetail('${t.id}')">
          <span class="dot ${t.match_status === 'unmatched' ? 'amber'
            : t.match_status === 'ignored' ? '' : 'green'}"></span>
          <span style="flex:1;font-size:13px;">
            <strong>${UI.esc(t.counterparty_name || '—')}</strong>
            ${UI.badge(Enums.label('match_status', t.match_status),
              t.match_status === 'unmatched' ? 'amber' : t.match_status === 'ignored' ? 'gray' : 'green')}
            <span style="display:block;color:var(--ink-mute);font-size:12px;">
              ${UI.date(t.booked_at)}
              ${t.variable_symbol ? ' · VS ' + UI.esc(t.variable_symbol) : ''}
              ${t.message ? ' · ' + UI.esc(String(t.message).slice(0, 60)) : ''}
              ${matched ? ' · spárované' : ''}</span>
          </span>
          <strong style="${cents < 0 ? 'color:var(--red);' : ''}">${Money.format(cents, { sign: true })}</strong>
        </div>`;
      };

      return Shell.list({
        rows, total: this.txs.length, render: row,
        emptyIcon: 'invoices', emptyTitle: 'Zatiaľ žiadne pohyby',
        emptySub: 'Načítaj výpis z banky — CSV z internet bankingu stačí.',
        filter: {
          search: { value: this.filters.q, placeholder: 'Hľadať protistranu, symbol, správu…',
            oninput: 'Bank.setF("q", this.value)' },
          selects: [{
            value: this.filters.status, label: 'Stav párovania',
            onchange: 'Bank.setF("status", this.value)',
            options: [['', 'Všetky'], ...Enums.options('match_status')],
          }],
          right: `<button class="btn btn-outline btn-sm" onclick="Bank.automatch()">
            ${Icon('repeat', 14)} Spárovať automaticky</button>`,
        },
      });
    },

    txDetail(id) {
      const t = this.txs.find(x => x.id === id);
      if (!t) return UI.toast('Nenájdené', 'err');
      const cents = Money.toCents(t.amount);
      const income = cents > 0;

      // Ponúkame len to, čo sa k pohybu dá naozaj priradiť.
      const candidates = income
        ? this.invoices.filter(i => ['issued', 'sent', 'overdue'].includes(i.status))
          .map(i => [i.id, `${i.invoice_number || '—'} · ${Money.format(Money.toCents(i.total))}`])
        : this.bills.filter(b => ['approved', 'checked'].includes(b.status))
          .map(b => [b.id, `${b.bill_number || '—'} · ${Money.format(Money.toCents(b.amount))}`]);

      const body = `
        <div class="detail-head">
          ${UI.badge(Enums.label('match_status', t.match_status),
            t.match_status === 'unmatched' ? 'amber' : t.match_status === 'ignored' ? 'gray' : 'green')}
          <strong style="font-size:20px;${cents < 0 ? 'color:var(--red);' : ''}">${
            Money.format(cents, { sign: true })}</strong>
        </div>

        <div class="kv">
          <div><span>Dátum</span><strong>${UI.date(t.booked_at)}</strong></div>
          <div><span>Protistrana</span><strong>${UI.esc(t.counterparty_name || '—')}</strong></div>
          ${t.counterparty_iban ? `<div><span>IBAN</span><strong class="mono">${UI.esc(t.counterparty_iban)}</strong></div>` : ''}
          ${t.variable_symbol ? `<div><span>Variabilný symbol</span><strong class="mono">${UI.esc(t.variable_symbol)}</strong></div>` : ''}
        </div>
        ${t.message ? `<div class="notebox">${UI.esc(t.message)}</div>` : ''}

        ${t.match_status === 'unmatched' ? `
          <div class="form-section">Priradiť ${income ? 'k vydanej faktúre' : 'k prijatej faktúre'}</div>
          ${candidates.length ? `
            <div class="form-grid">
              ${UI.field('target', '', { value: '', options: [['', '— vyber —'], ...candidates] })}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
              <button class="btn btn-primary btn-sm" onclick="Bank.matchManual('${t.id}', ${income})">
                Spárovať</button>
              <button class="btn btn-ghost btn-sm" onclick="Bank.ignore('${t.id}')">
                Nezaujíma nás</button>
            </div>`
            : `<div class="regimebox">Niet s čím párovať —
               ${income ? 'žiadna vystavená faktúra nečaká na úhradu'
                 : 'žiadna schválená prijatá faktúra nečaká na zaplatenie'}.
               <div style="margin-top:8px;">
                 <button class="btn btn-ghost btn-sm" onclick="Bank.ignore('${t.id}')">Nezaujíma nás</button>
               </div></div>`}`
          : `<div class="regimebox" style="margin-top:12px;">
              ${t.match_status === 'ignored' ? 'Pohyb je označený ako nezaujímavý.'
                : 'Pohyb je spárovaný a doklad sa tým označil ako uhradený.'}
            </div>`}`;
      UI.modal('Pohyb na účte', body, { wide: true });
    },

    async matchManual(id, income) {
      const sel = document.querySelector('#modal [name="target"]');
      const target = sel && sel.value;
      if (!target) return UI.toast('Vyber, k čomu to patrí', 'err');
      const patch = {
        match_status: 'manual', matched_at: new Date().toISOString(),
        [income ? 'matched_invoice_id' : 'matched_bill_id']: target,
      };
      const { error } = await DB.update('bank_transactions', id, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast('Spárované — doklad je označený ako uhradený', 'ok');
      this.loaded = false; await this.load(); UI.closeModal(); Danubra.renderRoute();
    },

    async ignore(id) {
      const { error } = await DB.update('bank_transactions', id, {
        match_status: 'ignored', matched_at: new Date().toISOString(),
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast('Označené', 'ok');
      this.loaded = false; await this.load(); UI.closeModal(); Danubra.renderRoute();
    },

    async automatch() {
      UI.toast('Párujem…');
      const { data, error } = await DB.rpc('bank_automatch', {});
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast(data ? `Spárovaných ${data}` : 'Nič nové sa spárovať nedalo',
        data ? 'ok' : '');
      this.loaded = false; await this.load(); Danubra.renderRoute();
    },

    // ── Import výpisu ─────────────────────────────────────────────────────
    importForm() {
      const body = `
        <div class="regimebox" style="margin:0 0 12px;">
          Najlepšie je <b>výpis vo formáte XML (camt.053)</b> — v Business Bankingu Tatra banky
          ho stiahnete pri výpisoch z účtu, keď ako formát zvolíte XML. Ide aj CSV z internet
          bankingu, netreba ho upravovať. Ten istý výpis sa nenaimportuje dvakrát.</div>
        <label class="fld">
          <span>Súbor s výpisom (XML alebo CSV)</span>
          <input type="file" id="bank-file" accept=".xml,.csv,.txt,text/csv,application/xml,text/xml"
            onchange="Bank.readFile(this)">
        </label>
        <div style="text-align:center;color:var(--ink-mute);font-size:12px;margin:10px 0;">
          alebo vlož obsah rovno sem</div>
        <label class="fld">
          <textarea id="bank-paste" rows="5" placeholder="Dátum;Suma;VS;…"
            oninput="Bank.parsePasted()"></textarea>
        </label>
        <div id="bank-preview"></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
          <button class="btn btn-primary" id="bank-save" onclick="Bank.saveImport()" disabled>
            Uložiť pohyby</button>
        </div>`;
      UI.modal('Načítať výpis', body, { wide: true });
      this.pending = null;
    },

    readFile(input) {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        // Kódovanie (UTF-8 alebo Windows-1250) sa rozpozná samo — inak by sa
        // rozsypali mená s diakritikou.
        const { text } = DanubraSepa.decode(reader.result);
        if (DanubraSepa.isCamt(text)) return this.showParsed(DanubraSepa.parseCamt(text), 'XML výpis (camt.053)');
        const box = document.getElementById('bank-paste');
        if (box) box.value = text;
        this.parsePasted();
      };
      reader.readAsArrayBuffer(file);
    },

    parsePasted() {
      const text = (document.getElementById('bank-paste') || {}).value || '';
      const box = document.getElementById('bank-preview');
      const btn = document.getElementById('bank-save');
      if (!box) return;
      if (!text.trim()) { box.innerHTML = ''; if (btn) btn.disabled = true; this.pending = null; return; }

      if (DanubraSepa.isCamt(text)) return this.showParsed(DanubraSepa.parseCamt(text), 'XML výpis (camt.053)');
      this.showParsed(DanubraBank.parseCsv(text), 'CSV');
    },

    showParsed(r, kind) {
      const box = document.getElementById('bank-preview');
      const btn = document.getElementById('bank-save');
      if (!box) return;
      if (r.error) {
        box.innerHTML = `<div class="warnbox">${Icon('alert', 14)} ${UI.esc(r.error)}</div>`;
        if (btn) btn.disabled = true; this.pending = null; return;
      }
      this.pending = r;
      const s = DanubraBank.summary(r.rows);

      box.innerHTML = `
        <div class="form-section">Čo sa naimportuje</div>
        ${Shell.sums({
          lines: [
            { label: 'Príjmy', cents: s.income },
            { label: 'Výdaje', cents: Math.abs(s.expense), kind: 'minus' },
          ],
          totalLabel: 'Rozdiel',
          note: `${kind}: ${s.count} ${s.count === 1 ? 'pohyb' : s.count < 5 ? 'pohyby' : 'pohybov'}`
            + (s.from ? ` za obdobie ${UI.dateRange(s.from, s.to)}` : ''),
        })}
        ${r.closing ? `<div class="regimebox">Zostatok na účte podľa výpisu k ${UI.date(r.closing.date)}:
          <b>${Money.format(r.closing.cents)}</b></div>` : ''}
        ${r.skipped.length ? `<div class="warnbox" style="margin-top:10px;">
          ${Icon('alert', 14)} ${r.skipped.length}
          ${r.skipped.length === 1 ? 'riadok sa nedal prečítať' : 'riadkov sa nedalo prečítať'}:
          <ul style="margin:6px 0 0 16px;font-size:12.5px;">
            ${r.skipped.slice(0, 8).map(x => `<li>${x.line ? 'riadok ' + x.line + ' — ' : ''}${UI.esc(x.why)}</li>`).join('')}
          </ul></div>` : ''}`;
      if (btn) btn.disabled = r.rows.length === 0;
    },

    async saveImport() {
      if (!this.pending || !this.pending.rows.length) return;
      const batch = `imp-${Date.now()}`;
      // Do databázy ide suma v eurách — stĺpec je numeric.
      const payload = this.pending.rows.map(r => ({
        ...r,
        amount: Money.toNumeric(r.amount),
        import_batch: batch,
      }));

      // Duplicity odmietne unikátny index. Vkladáme po jednom, aby jeden
      // opakovaný pohyb nezhodil celý import.
      let added = 0, dupes = 0, failed = 0;
      for (const row of payload) {
        const { error } = await DB.insert('bank_transactions', row);
        if (!error) { added++; continue; }
        if (String(error.message || '').includes('duplicate key')) dupes++;
        else { failed++; console.warn('[bank import]', error.message); }
      }

      UI.closeModal();
      UI.toast(`Naimportované ${added}`
        + (dupes ? `, ${dupes} už bolo v systéme` : '')
        + (failed ? `, ${failed} sa nepodarilo` : ''), failed ? 'err' : 'ok');

      if (added) {
        const { data } = await DB.rpc('bank_automatch', { p_batch: batch });
        if (data) UI.toast(`Automaticky spárovaných ${data}`, 'ok');
      }
      this.pending = null;
      this.loaded = false; await this.load(); Danubra.renderRoute();
    },
  };

  // ── Príkazy na úhradu ─────────────────────────────────────────────────
  // Appka pripraví súbor SEPA XML (pain.001) so schválenými prijatými
  // faktúrami. V Business Bankingu Tatra banky sa nahrá a podpíše naraz —
  // appka sama nič neodošle. Logika je v lib/bank/sepa.js.
  Object.assign(Bank, {
    async payForm() {
      const [{ data: bills }, { data: workers }] = await Promise.all([
        DB.list('bills', { limit: 1000 }),
        DB.list('workers', { select: 'id,full_name,company_name,bank_iban', limit: 1000 }),
      ]);
      const list = DanubraSepa.billPayments(bills || [], workers || [])
        .sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')));
      this._pay = list;
      const s = Danubra.supplier() || {};
      const today = Danubra._dayISO();
      if (!list.length) {
        return UI.modal('Pripraviť platby', `
          <div class="regimebox" style="margin:0;">Nie je čo platiť — žiadna prijatá faktúra nie je
            <b>schválená</b>. Platiť sa dá len schválená faktúra; schvaľuje sa v Prijatých faktúrach.</div>
          <div class="modal-actions"><button class="btn btn-primary" onclick="UI.closeModal();Danubra.go('costs')">
            Otvoriť prijaté faktúry</button></div>`);
      }
      const riadok = (p, i) => `
        <label class="pay-row${p.problems.length ? ' is-bad' : ''}">
          <input type="checkbox" name="pay" value="${i}" ${p.problems.length ? 'disabled' : 'checked'}
            onchange="Bank.payTotal()">
          <span class="pay-who"><b>${UI.esc(p.name || '—')}</b>
            <em>${UI.esc(p.iban || 'bez IBAN-u')}${p.vs ? ` · VS ${UI.esc(p.vs)}` : ''}${p.due ? ` · splatná ${UI.date(p.due)}` : ''}</em>
            ${p.problems.length ? `<em class="pay-bad">${Icon('alert', 12)} ${UI.esc(p.problems.join(', '))} — doplňte v prijatej faktúre</em>` : ''}
            ${p.ibanDiffers ? `<em class="pay-bad">${Icon('alert', 12)} IBAN na faktúre je iný než u živnostníka v appke — overte si ho</em>` : ''}</span>
          <strong>${Money.format(p.cents)}</strong>
        </label>`;
      UI.modal('Pripraviť platby', `
        <div class="regimebox" style="margin:0 0 12px;">Appka pripraví súbor s príkazmi
          (SEPA XML). V Business Bankingu Tatra banky ho nahráte ako dávku platieb
          (import súboru s platbami) a podpíšete naraz. Appka sama nič neodošle.</div>
        ${!s.iban ? `<div class="warnbox br-warn"><div>${Icon('alert', 14)}<span>Chýba IBAN našej firmy —
          doplňte ho v Nastaveniach → Fakturačné údaje.</span></div></div>` : ''}
        <div class="pay-list">${list.map(riadok).join('')}</div>
        <div class="form-grid" style="margin-top:12px;">
          ${UI.field('pay_date', 'Dátum platby', { type: 'date', value: today })}
          <div class="fld"><span>Spolu</span><strong id="pay-total" style="font-size:20px;"></strong></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
          <button class="btn btn-primary" onclick="Bank.payDownload()">${Icon('download')} Stiahnuť súbor pre banku</button>
        </div>`, { wide: true });
      this.payTotal();
    },

    paySelected() {
      return [...document.querySelectorAll('input[name="pay"]:checked')]
        .map(i => this._pay[Number(i.value)]).filter(Boolean);
    },

    payTotal() {
      const el = document.getElementById('pay-total');
      const sel = this.paySelected();
      if (el) el.textContent = `${Money.format(sel.reduce((t, p) => t + p.cents, 0))} · ${sel.length} ${Shell.plural(sel.length, 'platba', 'platby', 'platieb')}`;
    },

    payDownload() {
      const s = Danubra.supplier() || {};
      const sel = this.paySelected();
      const date = document.querySelector('[name="pay_date"]')?.value || Danubra._dayISO();
      const r = DanubraSepa.pain001({ debtor: { name: s.name, iban: s.iban }, payments: sel, date });
      if (!r.xml) return UI.toast(r.errors[0] || 'Súbor sa nedal pripraviť', 'err');
      const blob = new Blob([r.xml], { type: 'application/xml' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `platby-${date}.xml`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      UI.closeModal();
      UI.toast(`Súbor s ${r.count} ${Shell.plural(r.count, 'platbou', 'platbami', 'platbami')} (${Money.format(r.cents)}) je stiahnutý — nahrajte ho v banke`, 'ok');
    },
  });

  window.Bank = Bank;
  Danubra.views.bank = function (el) { return Bank.view(el); };
})();
