// ============================================================================
// DANUBRA — Objednávky
// ============================================================================
// Dve veci na jednej obrazovke, lebo sú to dve strany tej istej práce:
//
//   **Od odberateľa** — čo si u nás objednal. Nemecký generál pošle
//   Bestellung; má svoje číslo a to číslo patrí na našu faktúru. Bez neho ju
//   účtovné oddelenie často neprepustí a platba sa posunie o mesiac. K jeho
//   objednávke vieme vystaviť naše potvrdenie (Auftragsbestätigung).
//
//   **Živnostníkovi** — čo sme objednali u neho. Jedna na nasadenie. Toto nie
//   je papierovačka: Werkvertrag znamená, že si objednávame dielo, nie hodiny,
//   a keď sa kontrola opýta, čo presne mal ten človek urobiť, odpoveď „bol tam
//   a robil, čo bolo treba" je presne tá, po ktorej sa z Werkvertrag stane
//   prenájom pracovnej sily.
//
// Pozor na názov: objednávky z v1 (ubytovanie) sú niečo iné a sú v archíve.
// ============================================================================
(function () {
  const KIND = [
    ['customer', 'Od odberateľa'],
    ['worker', 'Živnostníkovi'],
  ];
  const STATUS = [
    ['draft', 'Rozpracovaná', 'gray'],
    ['sent', 'Odoslaná', 'blue'],
    ['confirmed', 'Potvrdená', 'green'],
    ['done', 'Vybavená', 'green'],
    ['cancelled', 'Zrušená', 'red'],
  ];
  const PRICE = [
    ['hourly', 'Za hodinu'],
    ['unit', 'Za jednotku'],
    ['fixed', 'Pevná cena'],
  ];

  const Ord = {
    rows: [], partners: [], workers: [], workerDocs: [], subcontracts: [], contracts: [],
    assignments: [], loaded: false,
    kind: 'customer', q: '',

    async load() {
      const [o, p, w, wd, sc, c, a] = await Promise.all([
        DB.list('work_orders', { order: { column: 'created_at', ascending: false }, limit: 500 }),
        DB.list('partners', {
          select: 'id,name,address,postal_code,city,country,registration_no,ust_idnr,contact_person',
          limit: 300 }),
        // Na objednávke musí byť zhotoviteľ identifikovateľný — meno nestačí.
        DB.list('workers', {
          select: 'id,full_name,company_id,tax_id,address,business_address,phone,email,hourly_cost',
          limit: 500 }),
        // Rámcové zmluvy: objednávka sa na ne musí odvolať, inak to nie je
        // individuálna zmluva o dielo (čl. III. rámcovej zmluvy).
        DB.list('worker_documents', {
          select: 'id,worker_id,kind,reference,valid_from', limit: 2000 }),
        DB.list('subcontracts', { select: 'id,title,contract_number,charge_rate', limit: 300 }),
        DB.list('contracts', {
          select: 'id,contract_number,title,partner_id,signed_at', limit: 300 }),
        DB.list('assignments', {
          select: 'id,subcontract_id,worker_id,status,date_from,date_to,worker_rate', limit: 2000 }),
      ]);
      this.rows = o.data || []; this.partners = p.data || []; this.workers = w.data || [];
      this.workerDocs = wd.data || [];
      this.subcontracts = sc.data || []; this.contracts = c.data || [];
      this.assignments = a.data || [];
      this.loaded = true;
    },

    partnerOf(id) { return this.partners.find(x => x.id === id) || {}; },
    workerOf(id) { return this.workers.find(x => x.id === id) || {}; },

    /**
     * Rámcová zmluva živnostníka. Objednávka sa na ňu musí odvolať — článok
     * III. rámcovej zmluvy hovorí, že individuálna zmluva o dielo vzniká
     * práve vystavením objednávky a jej akceptáciou.
     */
    ramcovaOf(workerId) {
      const d = (this.workerDocs || [])
        .filter(x => x.worker_id === workerId && x.kind === 'contract')
        .sort((a, b) => String(b.valid_from || '').localeCompare(String(a.valid_from || '')))[0];
      return d ? { number: d.reference || '', signedAt: d.valid_from || '' } : null;
    },
    subOf(id) { return this.subcontracts.find(x => x.id === id) || {}; },
    badge(s) { const m = STATUS.find(x => x[0] === s) || STATUS[0]; return UI.badge(m[1], m[2]); },

    /** Cena jednou vetou — podľa modelu, nie tri prázdne polia vedľa seba. */
    priceText(o) {
      if (o.price_model === 'fixed') {
        return o.fixed_price ? `${UI.money(o.fixed_price)} pevne` : '';
      }
      if (o.price_model === 'unit') {
        return o.unit_price ? `${UI.money(o.unit_price)}/${o.unit_label || 'jednotku'}` : '';
      }
      return o.rate ? `${UI.money(o.rate)}/h` : '';
    },

    setKind(k) { this.kind = k; Danubra.renderRoute(); },
    setQ(v) { this.q = v; this.paint(); },

    list() {
      const q = String(this.q || '').trim().toLowerCase();
      return this.rows.filter(o => o.kind === this.kind).filter((o) => {
        if (!q) return true;
        const kto = o.kind === 'customer'
          ? this.partnerOf(o.partner_id).name : this.workerOf(o.worker_id).full_name;
        return [o.order_number, o.their_ref, o.title, kto]
          .filter(Boolean).join(' ').toLowerCase().includes(q);
      });
    },

    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      Danubra.setActions(`<button class="btn btn-primary btn-sm" onclick="Ord.form()">
        ${Icon('plus')} Objednávka</button>`);
      el.innerHTML = Danubra.header('Objednávky',
        `${this.rows.filter(o => o.kind === 'customer').length} od odberateľov · `
        + `${this.rows.filter(o => o.kind === 'worker').length} živnostníkom`)
        + `<p class="fl-intro">Dve strany tej istej práce. <strong>Od odberateľa</strong> —
            čo si u nás objednal; jeho číslo patrí na našu faktúru.
            <strong>Živnostníkovi</strong> — čo sme objednali u neho, jedna na nasadenie.
            Tá druhá je doklad, ktorý pri kontrole obháji, že ide o dielo a nie
            o prenájom pracovnej sily.</p>
          <div class="fb-row no-print">
            ${KIND.map(([k, l]) => `<button class="fb-chip${this.kind === k ? ' active' : ''}"
              onclick="Ord.setKind('${k}')">${UI.esc(l)}
              <em>${this.rows.filter(o => o.kind === k).length}</em></button>`).join('')}
            <label class="kpi-search" style="max-width:280px;margin-left:auto;">
              ${Icon('search', 14)}
              <input type="search" value="${UI.esc(this.q)}" placeholder="Hľadať…"
                oninput="Ord.setQ(this.value)">
            </label>
          </div>
          <div id="ord-list"></div>`;
      this.paint();
    },

    paint() {
      const el = document.getElementById('ord-list');
      if (!el) return;
      const rows = this.list();
      if (!rows.length) {
        el.innerHTML = UI.empty('orders',
          this.q ? 'Nič také tu nie je' : 'Zatiaľ žiadna objednávka',
          this.kind === 'customer'
            ? 'Keď odberateľ pošle objednávku, zapíšte ju aj s jeho číslom — to potom ide na faktúru.'
            : 'Objednávka živnostníkovi vzniká k nasadeniu. Je to doklad, ktorý obháji Werkvertrag.',
          `<button class="btn btn-primary" onclick="Ord.form()">${Icon('plus')} Objednávka</button>`);
        return;
      }
      el.innerHTML = `<div class="panels panels-2">${rows.map(o => this.card(o)).join('')}</div>`;
    },

    card(o) {
      const kto = o.kind === 'customer'
        ? this.partnerOf(o.partner_id).name : this.workerOf(o.worker_id).full_name;
      const sc = this.subOf(o.subcontract_id);
      const cena = this.priceText(o);
      return `<div class="card card-pad" style="cursor:pointer;" onclick="Ord.detail('${o.id}')">
        <div class="card-head">
          <div class="card-title">${UI.esc(o.title || '—')}</div>
          ${this.badge(o.status)}
        </div>
        <div style="font-size:12.5px;color:var(--ink-mute);">
          ${o.order_number ? UI.esc(o.order_number) : '<em>bez čísla</em>'}
          ${kto ? ` · ${UI.esc(kto)}` : ''}
        </div>
        ${o.their_ref ? `<div style="margin-top:6px;font-size:12.5px;">
          <strong>Ich číslo: ${UI.esc(o.their_ref)}</strong>
          <span style="color:var(--ink-mute);"> — ide na faktúru</span></div>` : ''}
        <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px 14px;
          font-size:12.5px;color:var(--ink-sub);">
          ${sc.title ? `<span>${Icon('site', 13)} ${UI.esc(sc.title)}</span>` : ''}
          ${cena ? `<span>${Icon('euro', 13)} ${UI.esc(cena)}</span>` : ''}
          ${o.date_from ? `<span>${Icon('calendar', 13)}
            ${UI.esc(UI.dateRange(o.date_from, o.date_to))}</span>` : ''}
        </div>
        ${!o.scope ? `<p class="ms-lead" style="margin-top:8px;color:var(--amber);">
          ${Icon('alert', 12)} Nie je napísané, čo je dielo${o.kind === 'worker'
            ? ' — práve na to sa pýta kontrola' : ''}.</p>` : ''}
      </div>`;
    },

    // ── Formulár ──────────────────────────────────────────────────────────
    /**
     * Nová objednávka živnostníkovi rovno k nasadeniu — z karty človeka
     * („Vystaviť objednávku"). Stavba, termín a sadzba sa vyplnia z nasadenia,
     * aby sa nič neprepisovalo druhýkrát.
     */
    async newFor(assignmentId) {
      if (!this.loaded) await this.load();
      const a = this.assignments.find(x => x.id === assignmentId);
      if (!a) return UI.toast('Nasadenie sa nenašlo', 'err');
      const sc = this.subOf(a.subcontract_id);
      this.form(null, {
        kind: 'worker', assignment_id: a.id,
        title: sc.title || sc.contract_number || '',
        date_from: a.date_from, date_to: a.date_to,
        // Sadzba z nasadenia; keď tam nie je, jeho bežná sadzba z karty.
        price_model: 'hourly', rate: a.worker_rate || this.workerOf(a.worker_id).hourly_cost,
      });
    },

    form(id, preset) {
      const o = id ? (this.rows.find(x => x.id === id) || {})
        : { kind: this.kind, ...(preset || {}) };
      const k = o.kind || this.kind;
      // Objednávka patrí pred nástup, nie po ňom — preto aj plánované
      // nasadenia. Dovtedy sa ponúkali len tie, čo už bežali.
      const voľné = this.assignments.filter(a => ['planned', 'active'].includes(a.status)
        && (a.id === o.assignment_id || !this.rows.some(r => r.assignment_id === a.id)));

      const strana = k === 'customer'
        ? `${UI.field('partner_id', 'Odberateľ', { value: o.partner_id, required: true,
             add: 'partner', options: [['', '— vyberte —'],
               ...this.partners.map(p => [p.id, p.name])] })}
           ${UI.field('subcontract_id', 'Na ktorú zákazku', { value: o.subcontract_id,
             add: 'subcontract', options: [['', '— zatiaľ žiadna —'],
               ...this.subcontracts.map(s => [s.id, s.title || s.contract_number])] })}
           ${UI.field('their_ref', 'Jeho číslo objednávky', { value: o.their_ref,
             placeholder: 'napr. 4500123456',
             hint: 'Číslo z jeho Bestellung. Ide na našu faktúru — bez neho ju '
               + 'účtovné oddelenie odberateľa často neprepustí.' })}
           ${UI.field('received_at', 'Kedy prišla', { type: 'date', value: o.received_at })}`
        : `${UI.field('assignment_id', 'Na ktoré nasadenie', { value: o.assignment_id,
             required: true, add: false,
             options: [['', '— vyberte —'], ...voľné.map((a) => {
               const w = this.workerOf(a.worker_id), s = this.subOf(a.subcontract_id);
               return [a.id, `${w.full_name || '?'} · ${s.title || s.contract_number || '?'}`];
             })],
             hint: 'Jedno nasadenie, jedna objednávka. Nasadenia, ktoré ju už majú, '
               + 'sa tu neponúkajú.' })}`;

      UI.modal(id ? 'Upraviť objednávku' : 'Nová objednávka', `
        <form onsubmit="event.preventDefault();Ord.save('${id || ''}','${k}',this)">
          ${!id ? `<div class="form-section">Čo to je</div>
            ${UI.field('kind', 'Strana', { value: k, options: KIND_OPTS,
              hint: 'Od odberateľa je to, čo si objednal u nás. Živnostníkovi je to, '
                + 'čo sme objednali u neho.' })}` : ''}
          <div class="form-section">Strany</div>
          <div class="form-grid">${strana}</div>

          <div class="form-section">Čo je dielo</div>
          ${UI.field('title', 'Krátky názov', { value: o.title, required: true,
            placeholder: 'napr. Sadrokartón 2. NP, blok B' })}
          ${UI.field('scope', 'Popis diela', { type: 'textarea', rows: 4, value: o.scope,
            hint: k === 'worker'
              ? 'Toto je to, na čo sa pýta kontrola. „Robil, čo bolo treba" je zlá '
                + 'odpoveď — napíšte, čo presne má byť hotové.'
              : 'Čo presne si odberateľ objednal. Podľa toho sa potom kontroluje faktúra.' })}
          <div class="form-grid">
            ${UI.field('date_from', 'Od', { type: 'date', value: o.date_from })}
            ${UI.field('date_to', 'Do', { type: 'date', value: o.date_to })}
          </div>

          <div class="form-section">Cena</div>
          <div class="form-grid">
            <!-- Vždy po hodinách — model sa nevyberá. -->
            <input type="hidden" name="price_model" value="hourly">
            ${UI.field('rate', 'Sadzba €/h', { type: 'number', step: '0.01', value: o.rate,
              hint: k === 'worker'
                ? 'Na stavbe musí byť aspoň Bau-Mindestlohn.' : 'Fakturujeme vždy po hodinách.' })}
            ${UI.field('status', 'Stav', { value: o.status || 'draft', options: STATUS_OPTS })}
          </div>
          ${UI.field('notes', 'Poznámka', { type: 'textarea', value: o.notes })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Založiť'}</button>
          </div>
        </form>`, { wide: true });
    },

    async save(id, kind, form) {
      const v = UI.formData(form);
      const k = v.kind || kind;
      const num = (x) => (x === '' || x == null ? null : Number(x));
      const payload = {
        kind: k,
        title: v.title, scope: v.scope || null,
        date_from: v.date_from || null, date_to: v.date_to || null,
        price_model: v.price_model || 'hourly',
        rate: num(v.rate), unit_price: num(v.unit_price),
        unit_label: v.unit_label || null, fixed_price: num(v.fixed_price),
        status: v.status || 'draft', notes: v.notes || null,
      };
      if (k === 'customer') {
        payload.partner_id = v.partner_id || null;
        payload.subcontract_id = v.subcontract_id || null;
        payload.their_ref = v.their_ref || null;
        payload.received_at = v.received_at || null;
        payload.worker_id = null; payload.assignment_id = null;
      } else {
        const a = this.assignments.find(x => x.id === v.assignment_id);
        if (!a) return UI.toast('Vyberte nasadenie.', 'err');
        payload.assignment_id = a.id;
        payload.worker_id = a.worker_id;
        payload.subcontract_id = a.subcontract_id;
        payload.partner_id = null;
      }

      // Číslo sa prideľuje až pri založení — a transakčne, takže v rade
      // nikdy nevznikne diera ani duplicita.
      if (!id) {
        const { data: n, error: ne } = await DB.rpc('next_number', { p_kind: 'order' });
        if (ne) return UI.toast('Číslo sa nepodarilo prideliť: ' + ne.message, 'err');
        payload.order_number = n;
      }

      const { error } = id
        ? await DB.update('work_orders', id, payload)
        : await DB.insert('work_orders', payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal();
      UI.toast(id ? 'Uložené' : 'Objednávka založená', 'ok');
      this.loaded = false;
      // Karta človeka sa pýta „má objednávku?" — musí to vedieť hneď.
      if (window.Wrk) Wrk.loaded = false;
      // Aj zákazka — objednávka sa vystavuje priamo z jej piateho kroku.
      if (window.Sub) Sub.loaded = false;
      Danubra.renderRoute();
    },

    // ── Detail ────────────────────────────────────────────────────────────
    detail(id) {
      const o = this.rows.find(x => x.id === id);
      if (!o) return;
      const kto = o.kind === 'customer'
        ? this.partnerOf(o.partner_id).name : this.workerOf(o.worker_id).full_name;
      const sc = this.subOf(o.subcontract_id);
      const kv = (l, v) => (v ? `<div><span>${UI.esc(l)}</span><strong>${v}</strong></div>` : '');

      UI.modal(o.title || 'Objednávka', `
        <div class="detail-head">
          ${this.badge(o.status)}
          <span class="muted">
            ${o.order_number ? UI.esc(o.order_number) : 'bez čísla'} ·
            ${o.kind === 'customer' ? 'od odberateľa' : 'živnostníkovi'}</span>
        </div>
        <div class="kv">
          ${kv(o.kind === 'customer' ? 'Odberateľ' : 'Živnostník', UI.esc(kto || '—'))}
          ${kv('Ich číslo', o.their_ref ? UI.esc(o.their_ref) : '')}
          ${kv('Zákazka', sc.title ? UI.esc(sc.title) : '')}
          ${kv('Termín', o.date_from ? UI.esc(UI.dateRange(o.date_from, o.date_to)) : '')}
          ${kv('Cena', UI.esc(this.priceText(o)))}
        </div>
        ${o.scope
          ? `<div class="form-section">Čo je dielo</div>
             <div class="notebox">${UI.esc(o.scope)}</div>`
          : `<div class="warnbox">${Icon('alert', 14)}
              <strong>Nie je napísané, čo je dielo.</strong>
              ${o.kind === 'worker'
                ? 'Práve na to sa pýta kontrola — bez toho je Werkvertrag len na papieri.'
                : 'Bez toho sa nedá skontrolovať, či faktúra sedí s objednávkou.'}</div>`}
        ${o.notes ? `<div class="form-section">Poznámka</div>
          <div class="notebox">${UI.esc(o.notes)}</div>` : ''}
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          <button class="btn btn-outline" onclick="Ord.form('${o.id}')">${Icon('edit', 14)} Upraviť</button>
          ${o.kind === 'customer' ? `
            <!-- Potvrdenie je papier, ktorý posielame my. Objednávka SK/DE je
                 dokument, ktorý podpisujú obe strany a ktorým vzniká
                 individuálna zmluva o dielo. -->
            <button class="btn btn-outline" onclick="Ord.bestellung('${o.id}')">
              ${Icon('doc', 14)} Objednávka SK/DE</button>` : ''}
          <button class="btn btn-primary" onclick="Ord.document('${o.id}')">
            ${Icon('doc', 14)} ${o.kind === 'customer' ? 'Potvrdenie objednávky' : 'Objednávka'}</button>
        </div>`, { wide: true });
    },

    /**
     * Dvojjazyčná objednávka pre nemeckého odberateľa.
     *
     * `Auftragsbestätigung` je **potvrdenie** jeho objednávky — papier, ktorý
     * posielame my. Toto je tá objednávka samotná: dokument, ktorý sa odvoláva
     * na rámcovú zmluvu a podpisujú ho obe strany. Práve ňou vzniká
     * individuálna zmluva o dielo.
     */
    async bestellung(id) {
      const o = this.rows.find(x => x.id === id);
      if (!o) return;
      if (!Danubra.supplierReady('Objednávka')) return;
      const supplier = Danubra.supplier();
      const p = this.partnerOf(o.partner_id);
      // Rámcová zmluva s týmto odberateľom. Bez nej sa to na papier napíše.
      const c = this.contracts.find(x => x.partner_id === o.partner_id);

      const html = DanubraPapers.bestellung({
        order: {
          number: o.order_number, scope_sk: o.scope, scope_de: o.scope_de || o.scope,
          rate: o.rate, currency: o.currency,
          hours_week: o.hours_week, hours_week_de: o.hours_week_de,
          date_from: o.date_from, date_to: o.date_to, extendable: !!o.extendable,
          places: o.places || [], places_de: o.places_de || [],
          special_sk: o.notes, special_de: o.notes_de,
          signed_at: o.received_at,
        },
        supplier,
        client: {
          name: p.name,
          address: [p.address, p.postal_code, p.city, p.country].filter(Boolean).join(', '),
          registration_no: p.registration_no, ust_idnr: p.ust_idnr,
          contact_person: p.contact_person,
        },
        ramcova: c ? { number: c.contract_number, signedAt: c.signed_at } : null,
      });
      Docs.show(window.open('', '_blank'), html, { kind: 'objednavka', title: 'Bestellung',
        number: o.order_number, who: p.name, lang: 'de', partner_id: o.partner_id || null,
        subcontract_id: o.subcontract_id || null });
    },

    /** Doklad. Odberateľovi po nemecky, živnostníkovi po slovensky. */
    async document(id, okno) {
      const o = this.rows.find(x => x.id === id);
      if (!o) { if (okno) okno.close(); return; }
      if (!Danubra.supplierReady('Objednávka')) { if (okno) okno.close(); return; }
      const supplier = Danubra.supplier();
      const html = DanubraPapers.workOrder({
        order: o, supplier,
        partner: o.partner_id ? this.partnerOf(o.partner_id) : null,
        worker: o.worker_id ? this.workerOf(o.worker_id) : null,
        subcontract: this.subOf(o.subcontract_id),
        ramcova: o.worker_id ? this.ramcovaOf(o.worker_id) : null,
      });
      // `okno` je otvorené vopred, keď sa pred papierom ešte načítavalo.
      const odNemca = o.kind === 'customer';
      Docs.show(okno || window.open('', '_blank'), html, {
        kind: odNemca ? 'auftrag' : 'objednavka', title: odNemca ? 'Auftragsbestätigung' : 'Objednávka',
        number: o.order_number, lang: odNemca ? 'de' : 'sk',
        who: odNemca ? this.partnerOf(o.partner_id).name : this.workerOf(o.worker_id).full_name,
        worker_id: o.worker_id || null, partner_id: o.partner_id || null,
        subcontract_id: o.subcontract_id || null });
    },
  };

  // Číselníky pre `UI.field` — musia byť dostupné aj v šablóne formulára.
  const KIND_OPTS = KIND;
  const STATUS_OPTS = STATUS.map(s => [s[0], s[1]]);
  const PRICE_OPTS = PRICE;

  window.Ord = Ord;
  Danubra.views.orders = function (el) { return Ord.view(el); };
})();
