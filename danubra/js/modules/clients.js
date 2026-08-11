// ============================================================================
// DANUBRA — M2 Klienti (CRUD, filtre, fakturačný režim §6.3)
// ============================================================================
(function () {
  const TYPES = [['sole_trader', 'Živnostník'], ['crew', 'Parta'], ['company', 'Firma']];
  const LANGS = [['sk', 'SK'], ['cs', 'CS'], ['hu', 'HU']];

  // regime.js beží v prehliadači ako window.DanubraBillingRegime
  function regime(client) {
    if (window.DanubraBillingRegime) return window.DanubraBillingRegime.determineBillingRegime(client);
    return { regime: 'other', note: '', warning: null };
  }

  const Cli = {
    items: [], loaded: false,
    filters: { type: '', country: '', q: '' },

    async load() {
      const { data } = await DB.list('clients', { order: { column: 'created_at', ascending: false }, limit: 500 });
      this.items = data || [];
      this.loaded = true;
    },

    typeLabel(t) { const x = TYPES.find(y => y[0] === t); return x ? x[1] : (t || '—'); },
    typeBadge(t) {
      const kind = { sole_trader: 'blue', crew: 'amber', company: 'brand' }[t] || 'gray';
      return UI.badge(this.typeLabel(t), kind);
    },

    filtered() {
      const f = this.filters;
      return this.items.filter(c => {
        if (f.type && c.type !== f.type) return false;
        if (f.country && (c.country || '') !== f.country) return false;
        if (f.q) {
          const hay = `${c.name} ${c.contact_person || ''} ${c.email || ''} ${c.phone || ''}`.toLowerCase();
          if (!hay.includes(f.q.toLowerCase())) return false;
        }
        return true;
      });
    },

    async view(el) {
      Danubra.setActions(`<button class="btn btn-primary btn-sm" onclick="Cli.form()">+ Pridať</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const rows = this.filtered();
      const countries = [...new Set(this.items.map(c => c.country).filter(Boolean))];
      el.innerHTML = `
        <div class="filterbar">
          <input class="fb-search" placeholder="Hľadať meno, kontakt, e-mail…" value="${UI.esc(this.filters.q)}"
            oninput="Cli.setF('q',this.value)">
          <select onchange="Cli.setF('type',this.value)">
            <option value="">Všetky typy</option>
            ${TYPES.map(t => `<option value="${t[0]}" ${this.filters.type === t[0] ? 'selected' : ''}>${t[1]}</option>`).join('')}
          </select>
          <select onchange="Cli.setF('country',this.value)">
            <option value="">Všetky krajiny</option>
            ${countries.map(c => `<option value="${c}" ${this.filters.country === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div style="color:var(--ink-mute);font-size:13px;margin:2px 2px 12px;">${rows.length} klientov</div>
        ${rows.length === 0
          ? UI.empty('👥', 'Žiadni klienti', 'Pridaj prvého klienta.',
              `<button class="btn btn-primary" onclick="Cli.form()">+ Pridať klienta</button>`)
          : `<div class="cards">${rows.map(c => this.card(c)).join('')}</div>`}`;
    },

    card(c) {
      const r = regime(c);
      return `
        <div class="acc-card card" onclick="Cli.detail('${c.id}')">
          <div class="acc-card-head">
            <div>
              <div class="acc-name">${UI.esc(c.name)}</div>
              <div class="acc-loc">${c.contact_person ? UI.esc(c.contact_person) + ' · ' : ''}${c.country || ''}${c.retainer ? ' · 🔁 retainer' : ''}</div>
            </div>
            ${this.typeBadge(c.type)}
          </div>
          <div class="acc-meta">
            ${c.phone ? `<span>📞 ${UI.esc(c.phone)}</span>` : ''}
            ${c.email ? `<span>✉️ ${UI.esc(c.email)}</span>` : ''}
            <span>${UI.badge(r.regime === 'sk_no_vat' ? 'SK bez DPH' : r.regime === 'eu_reverse_charge' ? 'Reverse charge' : 'Režim ?', r.regime === 'other' ? 'amber' : 'gray')}</span>
          </div>
        </div>`;
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    async detail(id) {
      const c = this.items.find(x => x.id === id) || (await DB.getById('clients', id)).data;
      if (!c) return UI.toast('Nenájdené', 'err');
      const r = regime(c);
      const rows = [
        ['Typ', this.typeLabel(c.type)], ['Kontakt. osoba', c.contact_person],
        ['IČO', c.company_id], ['IČ DPH', c.vat_id], ['Krajina', c.country],
        ['Telefón', c.phone], ['E-mail', c.email], ['Jazyk', (c.language || '').toUpperCase()],
        ['Retainer', c.retainer ? `Áno${c.retainer_rate ? ' · ' + UI.money(c.retainer_rate) : ''}` : 'Nie'],
        ['Zdroj', c.source],
      ].filter(x => x[1] != null && x[1] !== '');
      const warn = r.warning ? `<div class="warnbox">⚠ ${UI.esc(r.warning)}</div>` : '';
      const body = `
        <div class="detail-head">${this.typeBadge(c.type)}
          ${UI.badge(r.regime === 'sk_no_vat' ? 'SK — nie sme platiteľmi DPH' : r.regime === 'eu_reverse_charge' ? 'EU reverse charge' : 'Režim na kontrolu', r.regime === 'other' ? 'amber' : 'green')}</div>
        ${warn}
        ${CommPanel.render({ contact: { phone: c.phone, email: c.email, whatsapp: c.whatsapp, name: c.name }, entity: { type: 'client', id: c.id } })}
        <div class="kv">${rows.map(x => `<div><span>${x[0]}</span><strong>${UI.esc(x[1])}</strong></div>`).join('')}</div>
        ${r.note ? `<div class="notebox" style="font-style:italic;">Fakturačná poznámka: „${UI.esc(r.note)}"</div>` : ''}
        ${c.notes ? `<div class="notebox">${UI.esc(c.notes)}</div>` : ''}
        <div class="modal-actions">
          <button class="btn btn-danger btn-sm" onclick="Cli.del('${c.id}')">Zmazať</button>
          <button class="btn btn-outline btn-sm" onclick="Cli.form('${c.id}')">Upraviť</button>
        </div>`;
      UI.modal(c.name, body, { wide: true });
    },

    form(id) {
      const c = id ? this.items.find(x => x.id === id) || {} : {};
      const body = `
        <form id="cli-form" onsubmit="event.preventDefault();Cli.save('${id || ''}')">
          <div class="form-grid">
            ${UI.field('name', 'Názov / meno', { value: c.name, required: true })}
            ${UI.field('type', 'Typ', { value: c.type, options: [['', '—'], ...TYPES] })}
            ${UI.field('contact_person', 'Kontaktná osoba', { value: c.contact_person })}
            ${UI.field('phone', 'Telefón', { value: c.phone })}
            ${UI.field('email', 'E-mail', { type: 'email', value: c.email })}
            ${UI.field('language', 'Jazyk', { value: c.language, options: [['', '—'], ...LANGS] })}
            ${UI.field('country', 'Krajina', { value: c.country, placeholder: 'SK, DE, HU…' })}
            ${UI.field('company_id', 'IČO', { value: c.company_id })}
            ${UI.field('vat_id', 'IČ DPH', { value: c.vat_id })}
            ${UI.field('source', 'Zdroj', { value: c.source })}
          </div>
          <div class="chk-row">
            ${UI.field('whatsapp', '', { type: 'checkbox', value: c.whatsapp, placeholder: 'Má WhatsApp' })}
            ${UI.field('retainer', '', { type: 'checkbox', value: c.retainer, placeholder: 'Retainer (priebežná spolupráca)' })}
          </div>
          <div class="form-grid">
            ${UI.field('retainer_rate', 'Retainer sadzba €', { type: 'number', value: c.retainer_rate })}
            ${UI.field('retainer_from', 'Retainer od', { type: 'date', value: c.retainer_from })}
            ${UI.field('retainer_to', 'Retainer do', { type: 'date', value: c.retainer_to })}
          </div>
          ${UI.field('notes', 'Poznámka', { type: 'textarea', value: c.notes })}
          <div id="regime-preview" class="regimebox"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Pridať'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť klienta' : 'Nový klient', body, { wide: true });
      const form = document.getElementById('cli-form');
      const upd = () => {
        const d = UI.formData(form);
        const r = regime(d);
        document.getElementById('regime-preview').innerHTML =
          `Fakturačný režim: <strong>${r.regime}</strong> — ${UI.esc(r.note || '')} ${r.warning ? `<span style="color:var(--amber)">⚠ ${UI.esc(r.warning)}</span>` : ''}`;
      };
      form.addEventListener('input', upd); upd();
    },

    async save(id) {
      const d = UI.formData(document.getElementById('cli-form'));
      if (!d.name) return UI.toast('Názov je povinný', 'err');
      ['retainer_rate'].forEach(k => { d[k] = d[k] === '' ? null : Number(d[k]); });
      ['retainer_from', 'retainer_to'].forEach(k => { if (d[k] === '') d[k] = null; });
      const res = id ? await DB.update('clients', id, d) : await DB.insert('clients', d);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast(id ? 'Uložené' : 'Pridané', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    async del(id) {
      if (!confirm('Zmazať tohto klienta?')) return;
      const { error } = await DB.remove('clients', id);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal(); UI.toast('Zmazané', 'ok');
      this.items = this.items.filter(x => x.id !== id); Danubra.renderRoute();
    },
  };

  window.Cli = Cli;
  Danubra.views.clients = function (el) { Cli.view(el); };
})();
