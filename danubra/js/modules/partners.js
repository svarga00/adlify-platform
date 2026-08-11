// ============================================================================
// DANUBRA — Odberatelia v Nemecku (Generalunternehmer / Auftraggeber)
// ============================================================================
// Oddelené od ubytovacích klientov — iný biznis, iné polia (USt-IdNr,
// splatnosť, spoľahlivosť platieb). Sledujeme reálnu dobu inkasa, lebo
// podľa biznis plánu je likvidita najpravdepodobnejší dôvod zlyhania.
// ============================================================================
(function () {
  const RATING = [['a', 'A — platí spoľahlivo', 'green'], ['b', 'B — priemer', 'amber'], ['c', 'C — problémový', 'red']];

  const Prt = {
    items: [], subcontracts: [], invoices: [], loaded: false,
    filters: { q: '', is_construction: '' },

    async load() {
      const [p, s, i] = await Promise.all([
        DB.list('partners', { order: { column: 'created_at', ascending: false }, limit: 300 }),
        DB.list('subcontracts', { select: 'id,partner_id,title,status,charge_rate', limit: 500 }),
        DB.list('invoices', { select: 'id,client_id,total,status,issue_date,due_date,paid_at,type', limit: 1000 }),
      ]);
      this.items = p.data || []; this.subcontracts = s.data || []; this.invoices = i.data || [];
      this.loaded = true;
    },

    subsOf(id) { return this.subcontracts.filter(s => s.partner_id === id); },
    ratingBadge(r) { const m = RATING.find(x => x[0] === r); return m ? UI.badge(m[1], m[2]) : ''; },

    filtered() {
      const f = this.filters;
      return this.items.filter(p => {
        if (f.is_construction !== '' && String(!!p.is_construction) !== f.is_construction) return false;
        if (f.q) {
          const hay = `${p.name} ${p.city || ''} ${p.contact_person || ''} ${p.ust_idnr || ''}`.toLowerCase();
          if (!hay.includes(f.q.toLowerCase())) return false;
        }
        return true;
      });
    },

    async view(el) {
      Danubra.setActions(`<button class="btn btn-primary btn-sm" onclick="Prt.form()">${Icon('plus')} Pridať odberateľa</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const rows = this.filtered();
      const noVat = this.items.filter(p => !p.ust_idnr).length;

      el.innerHTML = Danubra.header('Odberatelia v Nemecku',
        `${this.items.length} celkom · ${this.items.filter(p => p.is_construction).length} stavebných`) +
        (noVat ? `<div class="warnbox" style="margin-bottom:14px;">
          ${Icon('alert', 14)} ${noVat} ${noVat === 1 ? 'odberateľ nemá' : 'odberateľov nemá'} USt-IdNr —
          bez neho sa nedá fakturovať v režime reverse charge §13b.</div>` : '') + `
        <div class="filterbar">
          <input class="fb-search" placeholder="Hľadať názov, mesto, kontakt, USt-IdNr…" value="${UI.esc(this.filters.q)}"
            oninput="Prt.setF('q',this.value)">
          <select onchange="Prt.setF('is_construction',this.value)">
            <option value="">Všetky typy prác</option>
            <option value="true" ${this.filters.is_construction === 'true' ? 'selected' : ''}>Stavebné</option>
            <option value="false" ${this.filters.is_construction === 'false' ? 'selected' : ''}>Dielenské</option>
          </select>
        </div>
        <div class="count-line">${rows.length} ZÁZNAMOV</div>
        ${rows.length === 0
          ? UI.empty('clients', 'Žiadni odberatelia', 'Pridaj prvého nemeckého odberateľa.',
              `<button class="btn btn-primary" onclick="Prt.form()">${Icon('plus')} Pridať odberateľa</button>`)
          : `<div class="cards">${rows.map(p => this.card(p)).join('')}</div>`}`;
    },

    card(p) {
      const subs = this.subsOf(p.id);
      return `
        <div class="acc-card card" onclick="Prt.detail('${p.id}')">
          <div class="acc-card-head">
            <div>
              <div class="acc-name">${UI.esc(p.name)}</div>
              <div class="acc-loc">${UI.esc(p.city || '')}${p.country ? `, ${p.country}` : ''}${p.contact_person ? ` · ${UI.esc(p.contact_person)}` : ''}</div>
            </div>
            ${this.ratingBadge(p.rating) || UI.badge(p.is_construction ? 'Stavba' : 'Dielňa', p.is_construction ? 'amber' : 'blue')}
          </div>
          <div class="acc-meta">
            ${p.ust_idnr ? `<span>${Icon('receipt', 14)} ${UI.esc(p.ust_idnr)}</span>`
              : `<span style="color:var(--red);font-weight:700;">${Icon('alert', 14)} bez USt-IdNr</span>`}
            <span>${Icon('clock', 14)} splatnosť ${p.payment_terms_days || 30} dní</span>
            ${subs.length ? `<span>${Icon('site', 14)} ${subs.length} ${subs.length === 1 ? 'zákazka' : 'zákaziek'}</span>` : ''}
            ${p.factoring_eligible ? `<span style="color:var(--green);">${Icon('check', 14)} faktoring</span>` : ''}
          </div>
        </div>`;
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    async detail(id) {
      const p = this.items.find(x => x.id === id);
      if (!p) return UI.toast('Nenájdené', 'err');
      const subs = this.subsOf(id);
      // doba inkasa počítaná z faktúr tomuto odberateľovi
      const inv = this.invoices.filter(i => i.client_id === id);
      const cf = DanubraCompliance.cashflowCheck({ invoices: inv, alertDays: p.payment_terms_days || 45 });

      const rows = [
        ['USt-IdNr', p.ust_idnr], ['Kontakt', p.contact_person],
        ['Telefón', p.phone], ['E-mail', p.email],
        ['Adresa', [p.address, p.postal_code, p.city].filter(Boolean).join(', ')],
        ['Typ prác', p.is_construction ? 'Stavebné (SOKA, §48b, Bau-Mindestlohn)' : 'Dielenské (nižšia regulácia)'],
        ['Splatnosť', `${p.payment_terms_days || 30} dní`],
        ['Faktoring', p.factoring_eligible ? 'Áno' : 'Nie'],
        ['Zdroj', p.source],
      ].filter(r => r[1] != null && r[1] !== '');

      const body = `
        <div class="detail-head">
          ${this.ratingBadge(p.rating)}
          ${UI.badge(p.is_construction ? 'Stavba' : 'Dielňa', p.is_construction ? 'amber' : 'blue')}
        </div>
        ${!p.ust_idnr ? `<div class="warnbox">${Icon('alert', 14)}
          Bez USt-IdNr sa nedá fakturovať v režime reverse charge §13b.</div>` : ''}
        ${CommPanel.render({ contact: { phone: p.phone, email: p.email, name: p.name }, entity: { type: 'partner', id: p.id } })}
        <div class="kv">${rows.map(r => `<div><span>${r[0]}</span><strong>${UI.esc(r[1])}</strong></div>`).join('')}</div>
        ${p.notes ? `<div class="notebox">${UI.esc(p.notes)}</div>` : ''}

        ${inv.length ? `
        <div class="form-section">Platobná disciplína</div>
        <div class="service-total" style="background:${cf.scaleSafe ? 'var(--green-50)' : 'var(--amber-50)'};border-color:${cf.scaleSafe ? '#BEE3CE' : '#F1D8A6'};">
          <div><div class="code-label">Priemerná doba inkasa</div>
            <div style="font-size:22px;font-weight:800;">${cf.dso != null ? `${cf.dso} dní` : '—'}</div></div>
          <div style="text-align:right;"><div class="code-label">Neuhradené</div>
            <div style="font-weight:700;">${UI.money(cf.outstanding)}${cf.overdueCount ? ` · ${cf.overdueCount} po splatnosti` : ''}</div></div>
        </div>` : ''}

        <div class="form-section">Zákazky (${subs.length})</div>
        ${subs.map(s => `<button class="list-row" onclick="UI.closeModal();Danubra.go('subcontracts');setTimeout(()=>Sub.detail('${s.id}'),300)">
          <span style="flex:1;font-size:13px;"><strong>${UI.esc(s.title)}</strong>
            <span style="color:var(--ink-mute);display:block;font-size:12px;">${s.status}${s.charge_rate ? ` · ${UI.money(s.charge_rate)}/h` : ''}</span></span>
          <span style="color:var(--ink-mute);display:flex;">${Icon('chevron', 15)}</span></button>`).join('')
          || '<div style="color:var(--ink-mute);font-size:13px;">Zatiaľ žiadne zákazky.</div>'}

        <div class="modal-actions">
          <button class="btn btn-danger btn-sm" onclick="Prt.del('${p.id}')">Zmazať</button>
          <button class="btn btn-outline btn-sm" onclick="Prt.form('${p.id}')">Upraviť</button>
        </div>`;
      UI.modal(p.name, body, { wide: true });
    },

    form(id) {
      const p = id ? this.items.find(x => x.id === id) || {} : {};
      const body = `
        <form id="prt-form" onsubmit="event.preventDefault();Prt.save('${id || ''}')">
          <div class="form-grid">
            ${UI.field('name', 'Názov firmy', { value: p.name, required: true })}
            ${UI.field('ust_idnr', 'USt-IdNr', { value: p.ust_idnr, placeholder: 'DE123456789' })}
            ${UI.field('contact_person', 'Kontaktná osoba', { value: p.contact_person })}
            ${UI.field('phone', 'Telefón', { value: p.phone })}
            ${UI.field('email', 'E-mail', { type: 'email', value: p.email })}
            ${UI.field('city', 'Mesto', { value: p.city })}
            ${UI.field('address', 'Adresa', { value: p.address })}
            ${UI.field('postal_code', 'PSČ', { value: p.postal_code })}
            ${UI.field('country', 'Krajina', { value: p.country || 'DE' })}
            ${UI.field('payment_terms_days', 'Splatnosť (dní)', { type: 'number', value: p.payment_terms_days ?? 30 })}
            ${UI.field('rating', 'Spoľahlivosť platieb', { value: p.rating, options: [['', '—'], ...RATING.map(r => [r[0], r[1]])] })}
            ${UI.field('source', 'Zdroj', { value: p.source, placeholder: 'Auftragsbank, referral…' })}
          </div>
          <div class="chk-row">
            ${UI.field('is_construction', '', { type: 'checkbox', value: p.is_construction !== false, placeholder: 'Stavebné práce (SOKA, §48b, Bau-Mindestlohn)' })}
            ${UI.field('factoring_eligible', '', { type: 'checkbox', value: p.factoring_eligible, placeholder: 'Vhodný na faktoring' })}
          </div>
          <div class="regimebox">Pri dielenských prácach odpadá SOKA-BAU aj Bau-Mindestlohn —
          podľa plánu je to bezpečnejší vstupný segment s rýchlejším cash-flow.</div>
          ${UI.field('notes', 'Poznámka', { type: 'textarea', value: p.notes })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Pridať'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť odberateľa' : 'Nový odberateľ', body, { wide: true });
    },

    async save(id) {
      const d = UI.formData(document.getElementById('prt-form'));
      if (!d.name) return UI.toast('Názov je povinný', 'err');
      const payload = { ...d };
      payload.payment_terms_days = d.payment_terms_days === '' ? 30 : Number(d.payment_terms_days);
      if (payload.rating === '') payload.rating = null;
      const res = id ? await DB.update('partners', id, payload) : await DB.insert('partners', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast(id ? 'Uložené' : 'Pridané', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    async del(id) {
      if (!confirm('Zmazať tohto odberateľa?')) return;
      const { error } = await DB.remove('partners', id);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal(); UI.toast('Zmazané', 'ok');
      this.items = this.items.filter(x => x.id !== id); Danubra.renderRoute();
    },
  };

  window.Prt = Prt;
  Danubra.views.partners = function (el) { Prt.view(el); };
})();
