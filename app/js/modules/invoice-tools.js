// ============================================================================
// DANUBRA — fakturácia: upomienky, mesačná fakturácia, balík pre účtovníčku
// ============================================================================
// Tri veci, ktoré chýbali („Upomienky, Mesačná faktúra naraz, Prehľad pre
// účtovníčku"). Logika je v knižniciach s testami:
//   billing/dunning.js   ktorý stupeň upomienky je na rade a text listu
//   billing/monthly.js   čo treba pri každej zákazke spraviť za mesiac
//   billing/books.js     vydané, prijaté, náklady za mesiac/rok + CSV
//   zip.js               jeden súbor pre účtovníčku
// Tu je len obrazovka a volania do databázy.
// ============================================================================
(function () {
  // Nemecký zápis sumy do textu listu: 9.800,00
  const de = (cents) => DanubraInvoice.fmtDe(cents);

  Object.assign(Inv, {
    reminders: [],

    async loadReminders() {
      const { data } = await DB.list('invoice_reminders', { order: { column: 'sent_at', ascending: true }, limit: 3000 });
      this.reminders = data || [];
    },
    remindersOf(id) { return (this.reminders || []).filter(r => r.invoice_id === id); },
    dunQueue() { return DanubraDunning.queue(this.items, this.reminders, Danubra._dayISO()); },

    // ── Upomienky ─────────────────────────────────────────────────────────
    /** Časť detailu faktúry: čo už odišlo a čo je na rade. */
    dunningHtml(x) {
      const n = DanubraDunning.next(x, this.reminders, Danubra._dayISO());
      const sent = this.remindersOf(x.id);
      if (!sent.length && !n.due && n.reason === 'not_overdue') return '';
      return `<div class="form-section">Upomienky${UI.tip('Upomienka je list po nemecky, ktorý odberateľovi '
        + 'pripomenie nezaplatenú faktúru. Sú tri stupne: priateľská pripomienka, 1. upomienka a posledná '
        + '2. upomienka — každá s novou lehotou na zaplatenie.')}</div>
        ${sent.map(r => `<div class="js-row">${UI.badge((DanubraDunning.meta(r.level) || {}).sk || `stupeň ${r.level}`, r.level >= 3 ? 'red' : 'amber')}
          <span>${UI.date(r.sent_at)}${r.deadline ? ` · nová lehota ${UI.date(r.deadline)}` : ''}</span></div>`).join('')}
        ${n.due ? `<div class="btn-row"><button class="btn btn-outline btn-sm" onclick="Inv.remind('${x.id}')">
            ${Icon('mail', 14)} Vytvoriť: ${UI.esc(n.meta.sk)} (${UI.esc(n.meta.de)})</button>${
              UI.tip('Otvorí upomienku ako PDF (po nemecky, s QR kódom na platbu) a zapíše ju k faktúre. '
                + 'Odberateľovi ju pošlete sami — appka ju neodosiela.')}</div>
            <p class="card-note">${n.overdueDays} ${Shell.plural(n.overdueDays, 'deň', 'dni', 'dní')} po splatnosti · tón: ${UI.esc(n.meta.tone)}.</p>`
          : n.wait ? `<p class="card-note">Ďalší stupeň (${UI.esc(n.meta.sk)}) sa ponúkne ${UI.date(n.wait)} — 14 dní po poslednej.</p>`
            : n.reason === 'done' ? '<p class="card-note">Poslali sa všetky tri stupne. Ďalší krok je telefonát alebo vymáhanie.</p>' : ''}`;
    },

    /**
     * Vytvorí upomienku (PDF po nemecky) a zapíše ju. Okno sa otvára hneď
     * pri kliknutí — po čakaní na databázu by ho prehliadač zablokoval.
     */
    async remind(id) {
      const okno = window.open('', '_blank');
      const x = this.items.find(i => i.id === id);
      if (!x) { if (okno) okno.close(); return; }
      if (!Danubra.supplierReady('Upomienka')) { if (okno) okno.close(); return; }
      const n = DanubraDunning.next(x, this.reminders, Danubra._dayISO());
      if (!n.due) { if (okno) okno.close(); return UI.toast('Upomienka teraz nie je na rade', 'err'); }
      await this.loadV2();
      const p = this.v2.partners.find(z => z.id === x.partner_id) || {};
      const supplier = Danubra.supplier();
      const net = DanubraPapers.payable(x).net;
      const lehota = DanubraDunning.deadline(n.level, Danubra._dayISO());
      const paragraphs = DanubraDunning.text(n.level, { number: x.invoice_number, issueDate: x.issue_date,
        dueDate: x.due_date, amount: `${de(Money.toCents(net))} €`, newDeadline: lehota });
      let qrSvg = '';
      try {
        if (supplier.iban && supplier.name) {
          qrSvg = DanubraQR.svg(DanubraQR.sepaPayload({ name: supplier.name, iban: supplier.iban, amount: net,
            reference: String(x.invoice_number || '').replace(/\D/g, ''), note: `Rechnung ${x.invoice_number}` }), { px: 120 });
        }
      } catch (e) { /* bez QR */ }
      const client = { name: p.name, country: p.country || 'DE', vat_id: p.ust_idnr, contact_person: p.contact_person,
        address: [p.address, [p.postal_code, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') };
      const html = DanubraPapers.reminder({ invoice: x, client, supplier, title: n.meta.de, paragraphs, deadline: lehota, qrSvg });
      Docs.show(okno, html, { kind: 'mahnung', title: n.meta.de, number: x.invoice_number, who: p.name, lang: 'de',
        partner_id: x.partner_id || null, subcontract_id: x.subcontract_id || null });
      const { data, error } = await DB.insert('invoice_reminders', { invoice_id: x.id, level: n.level, deadline: lehota,
        amount: net, channel: 'pdf' });
      if (error) return UI.toast('Upomienka je otvorená, ale nezapísala sa: ' + error.message, 'err');
      this.reminders.push(data);
      UI.toast(`${n.meta.sk} je pripravená — stiahnite PDF alebo ju pošlite`, 'ok');
      if (document.getElementById('ui-modal')) this.detail(id);
    },

    /** Zoznam faktúr, ktorým treba poslať upomienku. */
    async dunningList() {
      await this.loadReminders();
      const q = this.dunQueue();
      const p = (id) => (this.partners.find(z => z.id === id) || {}).name || '—';
      UI.modal('Upomienky', `${q.length ? `<div class="pick-list">${q.map(r => `
        <div class="pick-tile is-static">
          <span class="pick-ico">${Icon('alert', 18)}</span>
          <span class="pick-txt"><b>${UI.esc(r.invoice.invoice_number || '—')} · ${UI.esc(p(r.invoice.partner_id))}</b>
            <em>${UI.money(r.invoice.total)} · ${r.overdueDays} ${Shell.plural(r.overdueDays, 'deň', 'dni', 'dní')} po splatnosti · na rade: ${UI.esc(r.meta.sk)}</em></span>
          <button class="btn btn-outline btn-sm" onclick="Inv.remind('${r.invoice.id}')">Vytvoriť</button>
        </div>`).join('')}</div>
        <p class="muted-sm">Upomienka je po nemecky, s novou lehotou a QR platbou. Ďalší stupeň sa ponúkne až 14 dní po predchádzajúcom.${
          UI.tip('„Vytvoriť" otvorí PDF upomienky a zapíše ju k faktúre. Odoslať ju musíte sami — '
            + 'e-mailom alebo poštou. Appka sama nič neposiela.')}</p>`
        : '<div class="regimebox">Žiadna faktúra nie je po splatnosti — netreba nikoho upomínať.</div>'}
        <div class="modal-actions"><button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button></div>`, { wide: true });
    },

    // ── Mesačná fakturácia naraz ──────────────────────────────────────────
    async monthly(ym) {
      const mesiac = ym || DanubraMonthly.previousMonth(Danubra._dayISO());
      UI.modal('Mesačná fakturácia', UI.loading(), { wide: true });
      const [s, a, t, per] = await Promise.all([
        DB.list('subcontracts', { select: 'id,title,status,partner_id', limit: 500 }),
        DB.list('assignments', { select: 'id,subcontract_id,worker_id,charge_rate,worker_rate,status', limit: 3000 }),
        DB.list('timesheets', { select: 'id,assignment_id,worker_id,work_date,hours,approved,period_id,activity_type,rate_used', limit: 10000 }),
        DB.list('periods', { limit: 2000 }),
      ]);
      const plan = DanubraMonthly.plan({ month: mesiac, subcontracts: s.data || [], assignments: a.data || [],
        timesheets: t.data || [], periods: per.data || [], invoices: this.items });
      this._plan = plan;
      const robit = plan.filter(r => ['create', 'close', 'invoice'].includes(r.action));
      const spolu = robit.reduce((n, r) => n + (r.cents || 0), 0);
      const CO = { create: 'založiť obdobie, uzavrieť, faktúra', close: 'uzavrieť obdobie, faktúra', invoice: 'faktúra z uzavretého obdobia',
        skip: 'preskočí sa', done: 'hotovo' };
      const body = document.querySelector('#ui-modal .modal-body') || document.querySelector('#ui-modal .modal-card');
      const html = `
        <div class="regimebox">Pri každej zákazke appka spraví, čo treba: založí obdobie za mesiac,
          uzavrie ho zo schválených hodín a pripraví <b>návrh</b> faktúry. Návrhy potom skontrolujete
          a pošlete na schválenie — schvaľuje ich admin, ako vždy.${
          UI.tip('Obdobie = úsek dní (tu celý mesiac), za ktorý sa fakturuje. Uzavrieť ho znamená zmraziť '
            + 'schválené hodiny aj sadzbu, aby sa suma faktúry už nemenila.')}</div>
        <div class="form-grid">
          <label class="fld"><span>Mesiac${UI.tip('Ktorý mesiac sa fakturuje. Predvolený je minulý — '
            + 'fakturuje sa až po skončení mesiaca.')}</span><input type="month" value="${mesiac}" onchange="Inv.monthly(this.value)"></label>
        </div>
        <div class="form-section">Zákazky${UI.tip('Pri každej zákazke je napísané, čo appka spraví, koľko hodín '
          + 'a za koľko. Odškrtnutú zákazku vynechá. Sivé riadky sa preskočia — dôvod je napísaný pri nich. '
          + 'Neschválené hodiny do faktúry nejdú.')}</div>
        <div class="mf-list">${plan.map((r, i) => {
          const da = ['create', 'close', 'invoice'].includes(r.action);
          return `<label class="mf-row${da ? '' : ' is-off'}">
            <input type="checkbox" data-i="${i}" ${da ? 'checked' : 'disabled'}>
            <span class="mf-main"><b>${UI.esc(r.subcontract.title || 'Zákazka')}</b>
              <em>${UI.esc(CO[r.action])}${r.unapproved && da ? ` · ${r.unapproved} neschválených výkazov ostane mimo` : ''}${da ? '' : ` — ${UI.esc(r.why)}`}</em></span>
            <span class="mf-sum">${r.hours ? `${r.hours} h · ` : ''}${da || r.action === 'done' ? Money.format(r.cents || 0) : ''}</span>
          </label>`;
        }).join('') || '<div class="js-empty">Žiadna zákazka.</div>'}</div>
        <div id="mf-log" class="muted-sm"></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          <button class="btn btn-primary" id="mf-go" ${robit.length ? '' : 'disabled'} onclick="Inv.runMonthly()">
            ${Icon('check', 14)} Pripraviť ${robit.length} ${Shell.plural(robit.length, 'návrh', 'návrhy', 'návrhov')} · ${Money.format(spolu)}</button>${
            UI.tip('Uzavrie obdobia zaškrtnutých zákaziek a vytvorí z nich návrhy faktúr (stav Návrh). '
              + 'Odberateľovi nič neodíde — každý návrh treba skontrolovať, poslať na schválenie a admin ho '
              + 'musí schváliť. Faktúra sa nikdy nevystaví ani neodošle bez schválenia adminom.')}
        </div>`;
      UI.modal('Mesačná fakturácia', html, { wide: true });
    },

    async runMonthly() {
      const vyber = [...document.querySelectorAll('#ui-modal .mf-row input:checked')].map(c => this._plan[Number(c.dataset.i)]).filter(Boolean);
      const log = document.getElementById('mf-log');
      const go = document.getElementById('mf-go');
      if (go) go.disabled = true;
      let ok = 0; const chyby = [];
      for (const r of vyber) {
        const meno = r.subcontract.title || 'Zákazka';
        if (log) log.textContent = `Pracujem: ${meno}…`;
        try {
          let pid = r.period && r.period.id;
          if (r.action === 'create') {
            const { data, error } = await DB.insert('periods', { subcontract_id: r.subcontract.id, period_from: r.from, period_to: r.to });
            if (error) throw error;
            pid = data.id;
          }
          if (r.action === 'create' || r.action === 'close') {
            const { error } = await DB.rpc('close_period', { p_period_id: pid });
            if (error) throw error;
          }
          const { error } = await DB.rpc('invoice_from_period', { p_period_id: pid });
          if (error) throw error;
          ok++;
        } catch (e) { chyby.push(`${meno}: ${e.message || e}`); }
      }
      this.loaded = false; this.v2.loaded = false;
      if (window.Sub) Sub.loaded = false;
      await this.load(); Danubra.renderRoute();
      UI.modal('Mesačná fakturácia', `
        <div class="${chyby.length ? 'warnbox' : 'regimebox'}">${ok
          ? `Vzniklo ${ok} ${Shell.plural(ok, 'návrh', 'návrhy', 'návrhov')} faktúr. Skontrolujte ich vo Vydaných
            faktúrach a pošlite na schválenie.${UI.tip('Návrh je len v appke — odberateľ o ňom nevie. '
              + 'V detaile faktúry skontrolujte sumu a odberateľa a kliknite „Poslať na schválenie". '
              + 'Faktúra sa nikdy nevystaví ani neodošle bez schválenia adminom.')}`
          : 'Nevznikol žiadny návrh faktúry.'}</div>
        ${chyby.length ? `<div class="form-section">Nepodarilo sa</div>${chyby.map(c => `<div class="js-row">${UI.esc(c)}</div>`).join('')}` : ''}
        <div class="modal-actions">
          ${ok ? `<button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
            <button class="btn btn-primary" onclick="UI.closeModal();Inv.filters.status='draft';Danubra.go('invoices')">${Icon('invoices', 14)} Otvoriť návrhy</button>`
            : '<button class="btn btn-primary" onclick="UI.closeModal()">Hotovo</button>'}
        </div>`, { wide: true });
    },

    // ── Prehľad pre účtovníčku ────────────────────────────────────────────
    async books(key) {
      const k = key || DanubraMonthly.previousMonth(Danubra._dayISO());
      UI.modal('Pre účtovníčku', UI.loading(), { wide: true });
      const [b, c, p, w] = await Promise.all([
        DB.list('bills', { limit: 5000 }),
        DB.list('costs', { limit: 5000 }),
        DB.list('partners', { select: 'id,name', limit: 1000 }),
        DB.list('workers', { select: 'id,full_name', limit: 2000 }),
      ]);
      const x = DanubraBooks.build({ key: k, invoices: this.items, bills: b.data || [], costs: c.data || [],
        partners: p.data || [], workers: w.data || [] });
      this._books = x;
      const rok = /^\d{4}$/.test(k);
      const tile = (ico, label, n, cents) => `<div class="pick-tile is-static">
        <span class="pick-ico">${Icon(ico, 18)}</span>
        <span class="pick-txt"><b>${label}</b><em>${n} ${Shell.plural(n, 'doklad', 'doklady', 'dokladov')} · ${Money.format(cents)}</em></span></div>`;
      UI.modal('Pre účtovníčku', `
        <div class="form-grid">
          <label class="fld"><span>Mesiac</span><input type="month" value="${rok ? '' : k}" onchange="Inv.books(this.value)"></label>
          <label class="fld"><span>alebo celý rok${UI.tip('Napíšte rok (napr. 2026) a balík bude za celý rok '
            + 'namiesto jedného mesiaca.')}</span><input type="number" min="2020" max="2100" placeholder="${new Date().getFullYear()}"
            value="${rok ? k : ''}" onchange="this.value&&Inv.books(this.value)"></label>
        </div>
        <div class="form-section">Doklady${UI.tip('Vydané = faktúry, ktoré sme vystavili my (podľa dátumu vystavenia, '
          + 'bez návrhov a stornovaných). Prijaté = faktúry od živnostníkov a dodávateľov. Ostatné náklady = '
          + 'ubytovanie, doprava a pod., zapísané bez faktúry.')}</div>
        <div class="pick-list">
          ${tile('invoices', 'Vydané faktúry', x.issued.length, x.totals.issued)}
          ${tile('receipt', 'Prijaté faktúry', x.received.length, x.totals.received)}
          ${tile('wallet', 'Ostatné náklady', x.costs.length, x.totals.costs)}
        </div>
        ${x.missingFiles.length ? `<div class="warnbox">${Icon('alert', 14)} K ${x.missingFiles.length}
          ${Shell.plural(x.missingFiles.length, 'prijatej faktúre', 'prijatým faktúram', 'prijatým faktúram')} chýba súbor: ${UI.esc(x.missingFiles.slice(0, 5).join(', '))}${x.missingFiles.length > 5 ? '…' : ''}.</div>` : ''}
        <p class="muted-sm">Balík obsahuje tabuľky pre Excel (vydané, prijaté, náklady) a súbory: PDF prijatých faktúr
          a PDF vydaných faktúr, ktoré sa už raz stiahli alebo vytlačili (sú v Dokumentoch).</p>
        <div id="bk-log" class="muted-sm"></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          <button class="btn btn-outline" onclick="Inv.booksZip(false)">${Icon('download', 14)} Len tabuľky</button>${
            UI.tip('Stiahne len tri tabuľky (CSV — otvoria sa v Exceli): vydané, prijaté a náklady. Rýchle, bez PDF.')}
          <button class="btn btn-primary" onclick="Inv.booksZip(true)">${Icon('download', 14)} Balík so súbormi (ZIP)</button>${
            UI.tip('ZIP je jeden zbalený súbor. Okrem tabuliek obsahuje aj PDF dokladov. Čo sa nepodarilo '
              + 'pribaliť, je vypísané v súbore „CHYBA" priamo v balíku.')}
        </div>`, { wide: true });
    },

    async booksZip(sSubormi) {
      const x = this._books;
      if (!x) return;
      const log = document.getElementById('bk-log');
      const files = [
        { name: 'vydane-faktury.csv', data: DanubraBooks.csv(x.issued, DanubraBooks.COLS.issued) },
        { name: 'prijate-faktury.csv', data: DanubraBooks.csv(x.received, DanubraBooks.COLS.received) },
        { name: 'naklady.csv', data: DanubraBooks.csv(x.costs, DanubraBooks.COLS.costs) },
      ];
      const chyba = [];
      if (sSubormi) {
        const stiahni = async (path) => {
          const { data, error } = await DB.client.storage.from(DB.DOCS_BUCKET).download(path);
          if (error || !data) throw error || new Error('nestiahlo sa');
          return new Uint8Array(await data.arrayBuffer());
        };
        let i = 0;
        for (const b of x.received.filter(r => r.storage_path)) {
          if (log) log.textContent = `Sťahujem prijaté faktúry… ${i + 1}`;
          const ext = (b.storage_path.split('.').pop() || 'pdf').toLowerCase();
          try { files.push({ name: DanubraBooks.fileIn('prijate', `${b.who || 'dodavatel'} ${b.bill_number || ''}.${ext}`, i), data: await stiahni(b.storage_path) }); }
          catch (e) { chyba.push(`Prijatá ${b.bill_number || b.who}: súbor sa nestiahol`); }
          i++;
        }
        const { data: arch } = await DB.list('archive', { limit: 3000 });
        const pdf = new Map();
        for (const r of (arch || []).filter(r => r.kind === 'rechnung' && !r.archived_at)
          .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) pdf.set(r.number, r);
        let j = 0;
        for (const inv of x.issued) {
          const r = pdf.get(inv.invoice_number);
          if (!r) { chyba.push(`Vydaná ${inv.invoice_number}: PDF ešte nie je v Dokumentoch — otvorte ju a dajte „Stiahnuť PDF" alebo „Tlačiť"`); continue; }
          if (log) log.textContent = `Sťahujem vydané faktúry… ${j + 1}`;
          try { files.push({ name: DanubraBooks.fileIn('vydane', r.file_name, j), data: await stiahni(r.storage_path) }); }
          catch (e) { chyba.push(`Vydaná ${inv.invoice_number}: súbor sa nestiahol`); }
          j++;
        }
      }
      if (chyba.length) files.push({ name: 'CHYBA - co nie je v balíku.txt', data: chyba.join('\r\n') + '\r\n' });
      const bytes = DanubraZip.zip(files);
      const f = new File([bytes], `Uctovnictvo ${x.slug}.zip`, { type: 'application/zip' });
      Docs.download(window, f);
      if (log) log.textContent = chyba.length ? `Stiahnuté. ${chyba.length} ${Shell.plural(chyba.length, 'vec chýba', 'veci chýbajú', 'vecí chýba')} — zoznam je v balíku.` : 'Stiahnuté.';
    },
  });
})();
