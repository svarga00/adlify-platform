// ============================================================================
// DANUBRA — Možnosti: potenciálne zákazky, ktoré ešte nie sú zákazkami
// ============================================================================
// Príde telefonát: „máme stavbu pri Mníchove, potrebujeme štyroch zváračov."
// Doteraz to žilo v e-maile a v hlave toho, kto to prijal — a keď z toho nič
// nebolo, nikde nezostalo, že to vôbec bolo.
//
// Celá obrazovka je postavená na jednej veci: **prah musí byť nízky**. Kto to
// prijal, nemá dopisovať formulár s pätnástimi poliami. Zapíše názov, čo
// potrebujú a telefón — a zvyšok doplní ten, kto to bude riešiť. Preto má
// formulár štyri polia a všetko ostatné sa dopĺňa až na otvorenej možnosti.
//
// Z možnosti vznikne **nábor** (zadanie sa prenesie a analýza z neho spraví
// podklady, otázky aj polia náboru) alebo **zákazka**, keď sa dohodne.
// ============================================================================
(function () {
  const O = window.DanubraOpp;

  const Opp = {
    items: [], trades: [], loaded: false, openId: null,
    filters: { status: '', q: '' },

    async load() {
      const [o, t] = await Promise.all([
        DB.list('opportunities', { order: { column: 'created_at', ascending: false }, limit: 300 }),
        DB.list('trades', { select: 'key,name_sk', limit: 100 }),
      ]);
      this.items = o.data || [];
      this.trades = t.data || [];
      this.loaded = true;
    },

    tradeName(key) {
      const t = this.trades.find(x => x.key === key);
      if (t) return t.name_sk;
      if (!key) return '—';
      return String(key).charAt(0).toUpperCase() + String(key).slice(1);
    },
    badge(s) { const m = O.status(s); return UI.badge(m[1], m[2]); },

    // ── Zoznam ────────────────────────────────────────────────────────────
    async view(el) {
      Danubra.setActions(
        `<button class="btn btn-primary btn-sm" onclick="Opp.form()">${Icon('plus')} Pridať možnosť</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      if (this.openId) return this.profile(el, this.openId);

      const q = O.nowNext(this.items, Danubra._dayISO());
      const s = O.summary(this.items);
      const rows = this.rows();

      el.innerHTML = Danubra.header('Možnosti',
        `${s.live} ${Shell.plural(s.live, 'rozpracovaná', 'rozpracované', 'rozpracovaných')}`
        + (s.rate != null ? ` · úspešnosť ${UI.pct(s.rate)}` : ''))
        + this.nowHtml(q) + `
        <div class="pillbar" style="margin-bottom:12px;width:max-content;max-width:100%;overflow-x:auto;">
          <button class="pill${!this.filters.status ? ' active' : ''}"
            onclick="Opp.setF('status','')">Všetky</button>
          ${O.STATUS.map(st => {
            const n = this.items.filter(x => x.status === st[0]).length;
            return n ? `<button class="pill${this.filters.status === st[0] ? ' active' : ''}"
              onclick="Opp.setF('status','${st[0]}')">${st[1]} ${n}</button>` : '';
          }).join('')}
        </div>
        ${rows.length === 0
          ? (this.items.length
              ? UI.empty('search', 'Filtru nič nesedí', 'Skús iný stav.')
              : UI.empty('offers', 'Zatiaľ žiadne možnosti',
                  'Keď sa niekto ozve, zapíš to sem — aj keď o tom vieš málo. '
                  + 'Možnosť, ktorá nie je zapísaná, neexistuje.',
                  `<button class="btn btn-primary" onclick="Opp.form()">${Icon('plus')} Pridať možnosť</button>`))
          : `<div class="cards">${rows.map(x => this.card(x)).join('')}</div>`}`;
    },

    rows() {
      const f = this.filters;
      return Shell.filterRows(this.items, {
        q: f.q, fields: ['title', 'company_name', 'city'],
        equals: { status: f.status },
      });
    },
    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    nowHtml(n) {
      const kam = n.opp ? `Opp.detail('${n.opp.id}')` : 'Opp.form()';
      const label = { new: 'Otvoriť možnosť', verify: 'Otvoriť a preveriť',
        fill: 'Otvoriť a doplniť', followup: 'Otvoriť ponuku',
        ok: 'Pridať možnosť' }[n.key] || 'Otvoriť';
      return `<div class="nowbox${n.hot ? ' nowbox-hot' : ''}">
        <div class="nowbox-label">Čo spraviť teraz</div>
        <div class="nowbox-title">${UI.esc(n.title)} ${Help.btn('card.opp.now', { size: 14 })}</div>
        <div class="nowbox-sub">${UI.esc(n.what)}</div>
        <div class="nowbox-why">${UI.esc(n.why)}</div>
        <button type="button" class="btn btn-primary btn-block" style="margin-top:10px;"
          onclick="${kam}">${Icon(n.key === 'new' ? 'phone' : 'chevron', 17)} ${label}</button>
      </div>`;
    },

    card(x) {
      const v = O.verification(x);
      const chyba = O.missing(x);
      const m = O.margin(x);
      return `
        <div class="acc-card card" onclick="Opp.detail('${x.id}')">
          <div class="acc-card-head">
            <div style="min-width:0;">
              <div class="acc-name">${UI.esc(x.title)}</div>
              <div class="acc-loc">${UI.esc(x.company_name || 'firma nezadaná')}</div>
            </div>
            ${this.badge(x.status)}
          </div>
          <div class="acc-meta">
            ${x.trade_key ? `<span>${Icon('wrench', 14)} ${UI.esc(this.tradeName(x.trade_key))}</span>` : ''}
            ${x.headcount ? `<span>${Icon('user', 14)} ${x.headcount}</span>` : ''}
            ${x.city ? `<span>${Icon('site', 14)} ${UI.esc(x.city)}</span>` : ''}
            ${m.perHour != null ? `<span>${Icon('euro', 14)} marža ${Money.format(m.perHour)}/h</span>` : ''}
          </div>
          <div class="card-now${v.state === 'invalid' ? ' card-now-hot' : ''}">
            <b>${UI.esc(v.label)}</b>
            <span>${UI.esc(chyba.length
              ? `Chýba: ${chyba.slice(0, 3).map(c => c.title).join(', ')}`
              : 'Všetko potrebné je doplnené.')}</span>
          </div>
        </div>`;
    },

    // ── Pridanie: štyri polia, nič viac ───────────────────────────────────
    /**
     * Formulár má zámerne štyri polia. Kto telefonát prijal, nemá dopisovať
     * pätnásť — zvyšok doplní ten, kto to bude riešiť. Vysoký prah znamená,
     * že sa možnosť nezapíše vôbec, a to je najhoršie, čo sa môže stať.
     */
    form() {
      UI.modal('Nová možnosť', `
        <form id="opp-form" onsubmit="event.preventDefault();Opp.save()">
          <div class="regimebox">Stačí to, čo vieš z telefonátu. Ostatné sa dopĺňa potom —
            možnosť, ktorá nie je zapísaná, neexistuje.</div>
          ${UI.field('title', 'O čo ide', { required: true,
            placeholder: 'napr. Kotolňa Wörthsee — zvárači',
            hint: 'Krátko, aby sa to dalo nájsť v zozname.' })}
          ${UI.field('company_name', 'Firma', { placeholder: 'kto sa ozval' })}
          ${UI.field('contact_phone', 'Telefón', {
            hint: 'E-mail môže ležať tri dni. Telefón je to, čím sa možnosť pohne.' })}
          ${UI.field('brief', 'Čo potrebujú', { type: 'textarea', rows: 4,
            placeholder: 'Čo sa stavia, koľko ľudí, aké remeslo, odkedy, za koľko — '
              + 'aj neučesane, pokojne skopírovaný e-mail.' })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${Icon('check')} Zapísať</button>
          </div>
        </form>`);
    },

    async save() {
      const d = UI.formData(document.getElementById('opp-form'));
      if (!d.title) return UI.toast('Napíš aspoň, o čo ide', 'err');
      const { data, error } = await DB.insert('opportunities', {
        title: d.title,
        company_name: d.company_name || null,
        contact_phone: d.contact_phone || null,
        brief: d.brief || null,
        status: 'new',
        created_by: Danubra.user?.id || null,
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      if (data) this.items.unshift(data);
      UI.closeModal();
      UI.toast('Zapísané — doplniť sa to dá kedykoľvek', 'ok');
      Danubra.renderRoute();
    },

    // ── Otvorená možnosť ──────────────────────────────────────────────────
    async detail(id) {
      if (!this.items.find(x => x.id === id)) {
        if (!this.loaded) await this.load();
        if (!this.items.find(x => x.id === id)) return UI.toast('Nenájdené', 'err');
      }
      this.openId = id;
      UI.closeModal();
      if (Danubra.route !== 'opportunities') { Danubra.go('opportunities'); return; }
      return Danubra.renderRoute();
    },

    closeProfile() { this.openId = null; Danubra.renderRoute(); },

    async profile(el, id) {
      const x = this.items.find(o => o.id === id);
      if (!x) { this.openId = null; return UI.toast('Nenájdené', 'err'); }

      Danubra.setActions(`
        <button class="btn btn-ghost btn-sm" onclick="Opp.closeProfile()">${Icon('back', 15)} Späť</button>`);

      const v = O.verification(x);
      const chyba = O.missing(x);
      const m = O.margin(x);
      const TONE = { valid: 'green', invalid: 'red', unavailable: 'amber', unchecked: 'gray' };

      el.innerHTML = Danubra.header(x.title,
        [x.company_name, x.city].filter(Boolean).map(UI.esc).join(' · '), '', [x.title]) + `
        <div class="detail-head">
          ${this.badge(x.status)}
          <select class="verif-sel" onchange="Opp.setStatus('${x.id}',this.value)">
            ${O.STATUS.map(s => `<option value="${s[0]}" ${x.status === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('')}
          </select>
        </div>

        <div class="nowbox${v.state === 'invalid' ? ' nowbox-hot' : ''}">
          <div class="nowbox-label">Firma</div>
          <div class="nowbox-title">${UI.esc(v.label)} ${Help.btn('card.opp.verify', { size: 14 })}</div>
          <div class="nowbox-sub">${UI.esc(v.detail)}</div>
          ${x.verified_at ? `<div class="nowbox-why">Pýtali sme sa ${UI.date(x.verified_at)}.
            Staré overenie nie je overenie — pri zmene firmy to zopakuj.</div>` : ''}
          ${x.company_vat ? `<button type="button" class="btn btn-primary btn-block" style="margin-top:10px;"
            onclick="Opp.verify('${x.id}')">${Icon('shield', 17)}
            ${x.verify_result ? 'Preveriť znova' : 'Preveriť v registri'}</button>` : ''}
        </div>

        ${chyba.length ? `<div class="form-section">Čo doplniť</div>
          ${chyba.map(c => `<div class="list-row" style="cursor:default;align-items:flex-start;">
            <span class="dot amber" style="margin-top:5px;"></span>
            <span style="flex:1;font-size:13px;"><strong>${UI.esc(c.title)}</strong>
              <span style="display:block;color:var(--ink-mute);font-size:12px;">${UI.esc(c.why)}</span>
            </span></div>`).join('')}` : ''}

        <div class="form-section">Údaje</div>
        <div class="kit-facts">
          ${this.fieldHtml(x, 'company_name', 'Firma')}
          ${this.fieldHtml(x, 'company_vat', 'USt-IdNr')}
          ${this.fieldHtml(x, 'contact_name', 'Kontakt')}
          ${this.fieldHtml(x, 'contact_phone', 'Telefón')}
          ${this.fieldHtml(x, 'contact_email', 'E-mail')}
          ${this.fieldHtml(x, 'city', 'Mesto')}
          ${this.fieldHtml(x, 'headcount', 'Koľko ľudí', 'number')}
          ${this.fieldHtml(x, 'rate_client', 'Platia €/h', 'number')}
          ${this.fieldHtml(x, 'rate_worker', 'Dáme €/h', 'number')}
          ${this.fieldHtml(x, 'start_date', 'Nástup', 'date')}
          <label class="kit-fact"><span>Remeslo</span>
            <select onchange="Opp.setField('${x.id}','trade_key',this.value)">
              <option value="">—</option>
              ${this.trades.map(t => `<option value="${t.key}" ${x.trade_key === t.key ? 'selected' : ''}>${UI.esc(t.name_sk)}</option>`).join('')}
            </select></label>
        </div>
        ${m.perHour != null ? `<div class="kit-sum ${m.pct >= 25 ? 'kit-ok' : 'kit-warn'}">
          Marža ${Money.format(m.perHour)}/h · ${UI.pct(m.pct)} zo sadzby odberateľa</div>` : ''}

        <div class="form-section">Čo o tom vieme</div>
        <div class="kit-brief">
          <textarea id="opp-brief" rows="6"
            placeholder="Všetko, čo vieš — aj neučesané.">${UI.esc(x.brief || '')}</textarea>
          <div class="kit-brief-acts">
            <button class="btn btn-outline btn-sm" onclick="Opp.saveBrief('${x.id}')">
              ${Icon('check', 14)} Uložiť</button>
            <span class="kit-note">Toto sa prenesie do náboru ako zadanie.</span>
          </div>
        </div>

        <div class="form-section">Čo z toho spraviť</div>
        ${x.plan_id ? `<div class="regimebox">${Icon('check', 14)}
          Nábor je založený. ${Danubra.link('plan', x.plan_id, 'Otvoriť nábor')}</div>`
          : `<button class="btn btn-primary btn-block" onclick="Opp.makePlan('${x.id}')">
              ${Icon('zap', 17)} Spraviť z toho nábor</button>
             <div class="kit-note" style="margin-top:6px;">Zadanie sa prenesie a analýza
               z neho spraví podklady, otázky do hovoru aj polia náboru.</div>`}`;
    },

    /** Jedno pole, ktoré sa ukladá hneď po zmene — bez tlačidla „uložiť". */
    fieldHtml(x, key, label, type = 'text') {
      return `<label class="kit-fact"><span>${UI.esc(label)}</span>
        <input type="${type}" value="${UI.esc(x[key] == null ? '' : x[key])}"
          onchange="Opp.setField('${x.id}','${key}',this.value)"></label>`;
    },

    async setField(id, key, value) {
      const x = this.items.find(o => o.id === id);
      const num = ['headcount', 'rate_client', 'rate_worker'].includes(key);
      const val = value === '' ? null : (num ? Number(value) : value);
      const { error } = await DB.update('opportunities', id, { [key]: val });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      if (x) x[key] = val;
      Danubra.renderRoute();
    },

    async saveBrief(id) {
      const el = document.getElementById('opp-brief');
      if (!el) return;
      const { error } = await DB.update('opportunities', id, { brief: el.value });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const x = this.items.find(o => o.id === id); if (x) x.brief = el.value;
      UI.toast('Uložené', 'ok');
    },

    async setStatus(id, status) {
      const x = this.items.find(o => o.id === id);
      // Stratená možnosť bez dôvodu je o pol roka nanič — vtedy sa tá istá
      // firma ozve znova a nikto nebude vedieť, čo bolo naposledy.
      let lost_reason = x ? x.lost_reason : null;
      if (status === 'lost') {
        lost_reason = await UI.ask('Prečo z toho nič nebolo? (zapíše sa)');
        if (lost_reason === null) return Danubra.renderRoute();
      }
      const { error } = await DB.update('opportunities', id, { status, lost_reason });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      if (x) { x.status = status; x.lost_reason = lost_reason; }
      UI.toast('Uložené', 'ok');
      Danubra.renderRoute();
    },

    // ── Overenie firmy ────────────────────────────────────────────────────
    /**
     * Pýta sa oficiálneho registra EU (VIES) cez server. Keď register
     * neodpovie, povie sa to tak — nie ako „firma neexistuje".
     */
    async verify(id) {
      const x = this.items.find(o => o.id === id);
      if (!x || !x.company_vat) return UI.toast('Najprv doplň USt-IdNr', 'err');
      UI.toast('Pýtam sa registra…', 'ok');
      let res;
      try {
        res = await fetch('/.netlify/functions/danubra-verify-company', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vat: x.company_vat, opportunityId: id }),
        });
      } catch (e) {
        return UI.toast('Server neodpovedal: ' + (e.message || e), 'err');
      }
      const out = await res.json().catch(() => ({}));
      if (!res.ok) return UI.toast(`Overenie sa nepodarilo: ${out.error || res.status}`, 'err');

      x.verify_result = out;
      x.verified_at = new Date().toISOString();
      // Názov z registra je presnejší než to, čo si niekto zapísal z telefónu —
      // ale prepisovať sa nesmie bez toho, aby to človek videl.
      if (out.valid && out.name && out.name !== x.company_name) {
        if (await UI.confirm(`Register firmu pozná ako „${out.name}". Prepísať názov?`)) {
          await this.setField(id, 'company_name', out.name);
        }
      }
      const v = O.verification(x);
      UI.toast(v.label, v.state === 'valid' ? 'ok' : 'err');
      Danubra.renderRoute();
    },

    // ── Z možnosti nábor ──────────────────────────────────────────────────
    /**
     * Založí nábor a prenesie doň zadanie. Samotnú analýzu nespúšťa — to je
     * rozhodnutie, ktoré patrí človeku, a na obrazovke náboru je na to
     * tlačidlo.
     */
    async makePlan(id) {
      const x = this.items.find(o => o.id === id);
      if (!x) return;
      if (!x.brief || !x.brief.trim()) {
        return UI.toast('Najprv napíš, čo o tom vieme — to sa prenesie ako zadanie', 'err');
      }
      const { data, error } = await DB.insert('recruitment_plans', {
        title: x.title,
        trade_key: x.trade_key || null,
        headcount: x.headcount || null,
        city: x.city || null,
        country: x.country || 'DE',
        start_date: x.start_date || null,
        offer_rate: x.rate_worker || null,
        client_rate: x.rate_client || null,
        legal_form: 'szco',
        status: 'draft',
        brief: x.brief,
        created_by: Danubra.user?.id || null,
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');

      await DB.update('opportunities', id, { plan_id: data.id, status: 'checking' });
      x.plan_id = data.id; x.status = 'checking';
      if (window.Hire) Hire.loaded = false;
      UI.toast('Nábor založený — zadanie je v ňom', 'ok');
      Danubra.go('hiring');
      setTimeout(() => window.Hire && Hire.detail(data.id), 300);
    },
  };

  window.Opp = Opp;
  Danubra.views.opportunities = function (el) { return Opp.view(el); };
})();
