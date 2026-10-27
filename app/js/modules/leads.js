// ============================================================================
// DANUBRA — Marketing: nové firmy a e-maily
// ============================================================================
// „Modul marketing, kde budeme robiť rozosielanie e-mailov a hľadanie nových
// firiem podľa firiem, s ktorými už spolupracujeme."
//
//   Nové firmy   nemecké firmy, ktoré ešte nie sú odberateľmi: nájdené na
//                mape (zadarmo) alebo cez AI na webe (s e-mailmi), stav
//                oslovenia, poznámky, prevod na odberateľa.
//   E-maily      text po nemecky s doplnenými údajmi, výber adresátov,
//                rozoslanie cez Vašu schránku (SMTP) po dávkach, odhlásenia.
//
// Logika je v `lib/marketing/leads.js` (testy), posielanie na serveri
// (`danubra-email-send-background`), hľadanie cez AI tiež
// (`danubra-find-leads-background`) — kľúče nikdy nie sú v prehliadači.
// ============================================================================
(function () {
  const LL = () => window.DanubraLeads;
  const statusOf = (k) => LL().STATUS.find(s => s[0] === k) || LL().STATUS[0];

  async function token() {
    try { const { data } = await DB.client.auth.getSession(); return (data && data.session && data.session.access_token) || ''; }
    catch (e) { return ''; }
  }

  const Lead = {
    rows: [], partners: [], subcontracts: [], searches: [], loaded: false,
    filters: { status: '', q: '' }, found: [],

    async load() {
      const [l, p, s, ls] = await Promise.all([
        DB.list('leads', { order: { column: 'created_at', ascending: false }, limit: 3000 }),
        DB.list('partners', { select: 'id,name,city,country,email,status', limit: 1000 }),
        DB.list('subcontracts', { select: 'id,partner_id,trade,title', limit: 1000 }),
        DB.list('lead_searches', { order: { column: 'created_at', ascending: false }, limit: 10 }),
      ]);
      this.rows = (l.data || []).filter(x => !x.archived_at);
      this.partners = p.data || []; this.subcontracts = s.data || []; this.searches = ls.data || [];
      this.loaded = true;
    },

    partnerName(id) { return (this.partners.find(p => p.id === id) || {}).name || ''; },
    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    visible() {
      const q = String(this.filters.q || '').toLowerCase();
      return this.rows.filter(r => (!this.filters.status || r.status === this.filters.status)
        && (!q || `${r.name} ${r.city || ''} ${r.trade || ''} ${r.email || ''}`.toLowerCase().includes(q)));
    },

    async view(el) {
      Danubra.setActions(`
        <button class="btn btn-outline btn-sm" onclick="Lead.form()">${Icon('plus', 14)} Pridať ručne</button>
        <button class="btn btn-primary btn-sm" onclick="Lead.findForm()">${Icon('search', 14)} Hľadať podobné firmy</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const rows = this.visible();
      const sEmailom = this.rows.filter(r => r.status === 'new' && LL().emailOk(r.email));
      const bezi = this.searches.find(s => ['pending', 'running'].includes(s.status));
      const posledne = this.searches[0];
      const n = bezi
        ? { key: 'run', hot: false, title: 'Hľadám nové firmy…', what: 'AI prehľadáva web. Trvá to 1–3 minúty — výsledky sa objavia samy.',
            why: 'Hľadá sa podľa Vašich odberateľov: podobný druh prác, veľkosť a región.' }
        : sEmailom.length
          ? { key: 'mail', hot: false, title: 'Osloviť nové firmy e-mailom',
              what: `${sEmailom.length} ${Shell.plural(sEmailom.length, 'nová firma má', 'nové firmy majú', 'nových firiem má')} e-mail a ešte sme im nepísali.`,
              why: 'Prvý e-mail je krátke predstavenie — kto sme, čo robíme a že fakturujeme po hodinách.' }
          : { key: 'find', hot: false, title: 'Nájsť nové firmy',
              what: this.rows.length ? 'Všetky nové firmy s e-mailom sú oslovené.' : 'Zatiaľ tu nie je žiadna firma.',
              why: 'Hľadá sa podľa firiem, s ktorými už spolupracujete — na mape zadarmo, alebo cez AI aj s e-mailmi.' };
      el.innerHTML = Danubra.header(Danubra.labelOf('leads'),
        `${this.rows.length} ${Shell.plural(this.rows.length, 'firma', 'firmy', 'firiem')} · ${
          this.rows.filter(r => r.status === 'interested').length} má záujem · ${this.rows.filter(r => r.status === 'won').length} sú odberatelia`)
        + Shell.now(n, { help: 'screen.leads', action: n.key === 'mail' ? { label: 'Pripraviť e-mail', ico: 'mail', onclick: "Danubra.go('campaigns');setTimeout(()=>Camp.form(),350)" }
          : n.key === 'find' ? { label: 'Hľadať podobné firmy', ico: 'search', onclick: 'Lead.findForm()' } : null })
        + (posledne && posledne.status === 'error' ? `<div class="warnbox">${Icon('alert', 14)} Posledné hľadanie cez AI zlyhalo: ${UI.esc(posledne.error || '')}</div>` : '')
        + (posledne && posledne.status === 'done' && posledne.finished_at && Date.now() - Date.parse(posledne.finished_at) < 3600e3
          ? `<div class="regimebox">${Icon('check', 14)} Hľadanie cez AI našlo ${posledne.found || 0} firiem, nových ${posledne.added || 0}.</div>` : '')
        + `<div class="filterbar">
            <div class="pillbar pillbar-xs">
              <button class="pill${!this.filters.status ? ' active' : ''}" onclick="Lead.setF('status','')">Všetky ${this.rows.length}</button>
              ${LL().STATUS.map(([k, l]) => { const c = this.rows.filter(r => r.status === k).length;
                return c ? `<button class="pill${this.filters.status === k ? ' active' : ''}" onclick="Lead.setF('status','${k}')">${l} ${c}</button>` : ''; }).join('')}
            </div>
            ${UI.tip('Nová = ešte sme jej nepísali. Oslovená = odišiel jej e-mail (prepne sa samo po odoslaní). Odpísala, Má záujem a Nemá záujem nastavujete Vy. Odhlásená = v e-maile klikla na odhlásenie a už jej nič nepôjde.')}
            <input type="search" placeholder="Hľadať meno, mesto, remeslo…" value="${UI.esc(this.filters.q)}" onchange="Lead.setF('q', this.value)">
          </div>
          ${rows.length ? `<div class="cards">${rows.map(r => this.card(r)).join('')}</div>`
            : UI.empty('search', 'Zatiaľ žiadne firmy', 'Kliknite na „Hľadať podobné firmy" — appka ich nájde podľa Vašich odberateľov.',
              `<button class="btn btn-primary" onclick="Lead.findForm()">${Icon('search')} Hľadať podobné firmy</button>`)}`;
      if (bezi) this.poll();
    },

    card(r) {
      const st = statusOf(r.status);
      const web = r.website ? (/^https?:/i.test(r.website) ? r.website : `https://${r.website}`) : '';
      return `<div class="acc-card card">
        <div class="acc-card-head">
          <div style="min-width:0;"><div class="acc-name">${UI.esc(r.name)}</div>
            <div class="acc-loc">${UI.esc([r.postal_code, r.city].filter(Boolean).join(' ') || '—')}${r.trade ? ` · ${UI.esc(r.trade)}` : ''}</div></div>
          <span style="display:inline-flex;align-items:center;flex:none;">${UI.badge(st[1], st[2])}</span>
        </div>
        ${r.why ? `<div style="font-size:12.5px;color:var(--ink-sub);margin:0 0 8px;">${UI.esc(r.why)}${UI.tip('Prečo túto firmu navrhla AI: v čom sa podobá na Vašich odberateľov. Je to len odhad AI, pred oslovením si pozrite jej web.')}</div>` : ''}
        <div class="link-row" style="margin-bottom:8px;">
          ${r.email ? `<a class="link-chip" href="mailto:${UI.esc(r.email)}">${Icon('mail', 13)}<span>${UI.esc(r.email)}</span></a>` : `<span class="link-chip is-static">bez e-mailu</span>${UI.tip('Firme bez e-mailu appka hromadný e-mail nepošle. Osloviť ju môžete telefonicky alebo cez formulár na jej webe; e-mail potom doplňte, keď ho zistíte.')}`}
          ${r.phone ? `<a class="link-chip" href="tel:${UI.esc(r.phone.replace(/[^\d+]/g, ''))}">${Icon('phone', 13)}<span>${UI.esc(r.phone)}</span></a>` : ''}
          ${web ? `<a class="link-chip" target="_blank" rel="noopener" href="${UI.esc(web)}">${Icon('site', 13)}<span>Web</span></a>` : ''}
          ${r.similar_to ? `<span class="link-chip is-static">ako ${UI.esc(this.partnerName(r.similar_to))}</span>` : ''}
          <span class="link-chip is-static">${r.source === 'ai' ? 'AI' : r.source === 'osm' ? 'mapa' : 'ručne'}</span>${UI.tip(
            'Odkiaľ sa firma vzala. Mapa = OpenStreetMap, verejná mapa (zadarmo, e-mail býva zriedka). AI = umelá inteligencia ju našla na internete, e-mail vzala z Impressum na webe firmy. Ručne = pridali ste ju Vy. „ako …" = firma sa podobá na tohto Vášho odberateľa.')}
        </div>
        ${r.notes ? `<div class="notebox" style="white-space:pre-wrap;font-size:12.5px;">${UI.esc(r.notes)}</div>` : ''}
        <div class="js-acts" style="margin-top:6px;">
          <select class="verif-sel" onchange="Lead.setStatus('${r.id}', this.value)">
            ${LL().STATUS.filter(s => s[0] !== 'won').map(([k, l]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${l}</option>`).join('')}
            ${r.status === 'won' ? '<option value="won" selected>Je odberateľ</option>' : ''}
          </select>${UI.tip('Stav meníte Vy podľa toho, ako firma reagovala. Podľa stavu potom pri e-maile vyberáte, komu ho poslať. „Je odberateľ" sa nastaví samo tlačidlom Urobiť odberateľa.')}
          <button class="btn btn-ghost btn-sm" onclick="Lead.note('${r.id}')">${Icon('note', 14)} Poznámka</button>
          ${r.partner_id ? Danubra.link('partner', r.partner_id, 'Odberateľ')
            : `<button class="btn btn-outline btn-sm" onclick="Lead.toPartner('${r.id}')">${Icon('clients', 14)} Urobiť odberateľa</button>${UI.tip('Založí firmu v Odberateľoch s jej menom, adresou, e-mailom, telefónom a poznámkami. Tu zostane so stavom Je odberateľ. USt-IdNr a kontaktnú osobu doplníte v Odberateľoch.')}`}
        </div>
      </div>`;
    },

    async setStatus(id, status) {
      const { error } = await DB.update('leads', id, { status });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const r = this.rows.find(x => x.id === id); if (r) r.status = status;
      Danubra.renderRoute();
    },

    /** Poznámky sa len pridávajú — staré sa neprepisujú. */
    note(id) {
      UI.modal('Poznámka k firme', `<form id="ln-form" onsubmit="event.preventDefault();Lead.saveNote('${id}')">
        ${UI.field('text', 'Čo sa stalo', { type: 'textarea', rows: 3, required: true, placeholder: 'napr. volal som, ozvú sa v januári',
          tip: 'Pridá sa na koniec poznámok s dnešným dátumom a zmení sa dátum posledného kontaktu. Staršie poznámky sa neprepisujú ani nemažú.' })}
        <div class="modal-actions"><button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
          <button type="submit" class="btn btn-primary">Pridať</button></div></form>`);
    },
    async saveNote(id) {
      const d = UI.formData(document.getElementById('ln-form'));
      const r = this.rows.find(x => x.id === id);
      if (!r || !String(d.text || '').trim()) return;
      const notes = `${r.notes ? `${r.notes}\n` : ''}${new Date().toLocaleDateString('sk-SK')}: ${d.text.trim()}`;
      const { error } = await DB.update('leads', id, { notes, last_contact_at: new Date().toISOString() });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      r.notes = notes; UI.closeModal(); Danubra.renderRoute();
    },

    /** Firma, ktorá prejavila záujem, sa stane odberateľom — údaje sa prenesú. */
    async toPartner(id) {
      const r = this.rows.find(x => x.id === id);
      if (!r) return;
      if (!await UI.confirm(`Založiť „${r.name}" ako odberateľa?`)) return;
      const { data, error } = await DB.insert('partners', { name: r.name, city: r.city, postal_code: r.postal_code,
        address: r.address, country: r.country || 'DE', email: r.email, phone: r.phone, website: r.website,
        source: 'marketing', notes: r.notes || null });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      await DB.update('leads', id, { status: 'won', partner_id: data.id });
      Object.assign(r, { status: 'won', partner_id: data.id });
      UI.toast('Odberateľ založený — doplňte USt-IdNr a kontakt', 'ok');
      Danubra.renderRoute();
    },

    form() {
      UI.modal('Pridať firmu', `<form id="lf-form" onsubmit="event.preventDefault();Lead.saveForm()">
        <div class="form-grid">
          ${UI.field('name', 'Názov firmy', { required: true,
            tip: 'Ak už firmu s rovnakým názvom máte medzi novými firmami alebo odberateľmi, druhýkrát sa neuloží. GmbH, KG, bodky a pomlčky sa pri porovnaní nerátajú.' })}
          ${UI.field('city', 'Mesto', { tip: 'Do e-mailu sa dosadí namiesto {mesto}. Bez mesta by v texte ostalo prázdne miesto.' })}
          ${UI.field('email', 'E-mail', { type: 'email' })}
          ${UI.field('phone', 'Telefón')}
          ${UI.field('website', 'Web')}
          ${UI.field('trade', 'Čím sa zaoberá', { placeholder: 'napr. Trockenbau', tip: 'Remeslo firmy. Do e-mailu sa dosadí namiesto {remeslo}.' })}
        </div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
          <button type="submit" class="btn btn-primary">Uložiť</button></div></form>`, { wide: true });
    },
    async saveForm() {
      const d = UI.formData(document.getElementById('lf-form'));
      const { fresh } = LL().dedupe([{ name: d.name }], { leads: this.rows, partners: this.partners });
      if (!fresh.length) return UI.toast('Táto firma už je medzi firmami alebo odberateľmi', 'err');
      const { error } = await DB.insert('leads', { name: d.name.trim(), city: d.city || null, email: (d.email || '').toLowerCase() || null,
        phone: d.phone || null, website: d.website || null, trade: d.trade || null, source: 'manual' });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal(); this.loaded = false; Danubra.renderRoute();
    },

    // ── Hľadanie podobných firiem ─────────────────────────────────────────
    findForm() {
      if (!this.partners.length) return UI.toast('Najprv treba mať aspoň jedného odberateľa', 'err');
      const crafts = Object.entries(LL().CRAFTS);
      const zaklad = ['builder', 'plasterer', 'tiler', 'painter', 'metal_construction', 'electrician', 'carpenter'];
      UI.modal('Hľadať podobné firmy', `
        <form id="find-form" onsubmit="event.preventDefault()">
          <div class="form-section">Podobné ako${UI.tip('Zaškrtnutí odberatelia sú vzor. Mapa hľadá firmy v okolí ich miest, AI hľadá firmy s podobnou prácou (berie prvých 15 zaškrtnutých).')}</div>
          <div class="chk-grid">${this.partners.slice(0, 40).map(p => `<label class="chk"><input type="checkbox" name="p" value="${p.id}" checked>
            <span>${UI.esc(p.name)}${p.city ? ` <em>· ${UI.esc(p.city)}</em>` : ''}</span></label>`).join('')}</div>
          <div class="form-grid">
            ${UI.field('radius', 'Okruh okolo ich miest', { value: '50', options: [['25', '25 km'], ['50', '50 km'], ['100', '100 km']],
              tip: 'Len pre hľadanie na mape: ako ďaleko od miest Vašich odberateľov sa hľadá. Berie sa najviac 6 rôznych miest.' })}
            ${UI.field('region', 'Alebo región (pre AI)', { placeholder: 'napr. Bayern, okolie Mníchova',
              tip: 'Len pre AI. Keď ho vyplníte, AI hľadá v tomto regióne. Keď je prázdny, hľadá v okolí miest Vašich odberateľov.' })}
            ${UI.field('count', 'Koľko firiem (AI)', { value: '15', options: [['10', '10'], ['15', '15'], ['25', '25']],
              tip: 'Koľko firiem má AI najviac nájsť. Viac firiem = dlhšie hľadanie a o niečo vyššia cena. Firmy, ktoré už máte, sa neuložia znova.' })}
            <div class="fld-full">${UI.field('note', 'Čo hľadáme (pre AI, nepovinné)', { placeholder: 'napr. firmy na sadrokartón a suchú výstavbu, 20–200 zamestnancov',
              tip: 'Vlastnými slovami, aké firmy chcete. AI to zoberie do úvahy. Môžete písať po slovensky.' })}</div>
          </div>
          <div class="form-section">Remeslá (pre mapu)${UI.tip('Druhy firiem, ktoré sa hľadajú na mape. Na hľadanie cez AI nemajú vplyv — tam rozhoduje, čo robia Vaši odberatelia.')}</div>
          <div class="chk-grid">${crafts.map(([k, l]) => `<label class="chk"><input type="checkbox" name="c" value="${k}" ${zaklad.includes(k) ? 'checked' : ''}><span>${UI.esc(l)}</span></label>`).join('')}</div>
          <p class="card-note">Mapa (OpenStreetMap) je zadarmo, ale e-mail tam býva zriedka. AI prehľadá weby firiem
            a e-mail vezme len z ich Impressum/Kontaktu — jedno hľadanie stojí rádovo centy.${UI.tip('Na mape: výsledky sa ukážu hneď tu dole a sami vyberiete, ktoré uložiť. Cez AI: hľadá sa na pozadí 1–3 minúty, nájdené firmy sa uložia samy a okno môžete zavrieť. Impressum = povinná stránka nemeckého webu s údajmi o firme.')}</p>
          <div id="find-out"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="button" class="btn btn-outline" onclick="Lead.searchMap()">${Icon('pin', 14)} Na mape (zadarmo)</button>
            <button type="button" class="btn btn-primary" onclick="Lead.searchAi()">${Icon('search', 14)} Cez AI (aj e-maily)</button>
          </div>
        </form>`, { wide: true });
    },

    findParams() {
      const f = document.getElementById('find-form');
      const val = (n) => [...f.querySelectorAll(`input[name=${n}]:checked`)].map(i => i.value);
      const d = UI.formData(f);
      return { partner_ids: val('p'), crafts: val('c'), radiusKm: Number(d.radius) || 50,
        region: (d.region || '').trim(), count: Number(d.count) || 15, note: (d.note || '').trim() };
    },

    async searchAi() {
      const p = this.findParams();
      if (!p.partner_ids.length) return UI.toast('Vyberte aspoň jedného odberateľa', 'err');
      const { data, error } = await DB.insert('lead_searches', { kind: 'ai', params: p });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const t = await token();
      fetch('/.netlify/functions/danubra-find-leads-background', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ search_id: data.id }) }).catch(() => {});
      UI.closeModal();
      UI.toast('Hľadám cez AI — potrvá to 1–3 minúty', 'ok');
      this.searches.unshift(data);
      Danubra.renderRoute();
    },

    /** Kým hľadanie beží, pozerá sa naň každých 8 sekúnd. */
    poll() {
      clearTimeout(this._poll);
      this._poll = setTimeout(async () => {
        if (Danubra.route !== 'leads') return;
        const { data } = await DB.list('lead_searches', { order: { column: 'created_at', ascending: false }, limit: 10 });
        const bezi = (data || []).some(s => ['pending', 'running'].includes(s.status));
        if (!bezi) { this.loaded = false; Danubra.renderRoute(); } else this.poll();
      }, 8000);
    },

    async geocode(city) {
      const R = window.DanubraRoute;
      for (const q of R.variants(`${city}, Deutschland`).slice(0, 2)) {
        try {
          const res = await fetch(R.geocodeUrl(q), { headers: { 'Accept-Language': 'de' } });
          const p = res.ok ? R.pickPlace(await res.json()) : null;
          if (p) return p;
        } catch (e) { /* skúsi sa ďalšia podoba */ }
        await new Promise(r => setTimeout(r, 1100));
      }
      return null;
    },

    async searchMap() {
      const p = this.findParams();
      const out = document.getElementById('find-out');
      const ps = this.partners.filter(x => p.partner_ids.includes(x.id) && x.city);
      if (!ps.length) return UI.toast('Vybraní odberatelia nemajú zapísané mesto', 'err');
      if (out) out.innerHTML = `<div class="nb-wait">${Icon('search', 16)} Hľadám mestá odberateľov na mape…</div>`;
      const mesta = [...new Set(ps.map(x => x.city))].slice(0, 6);
      const body = [];
      for (const m of mesta) { const g = await this.geocode(m); if (g) body.push(g); await new Promise(r => setTimeout(r, 1100)); }
      if (!body.length) { if (out) out.innerHTML = '<div class="warnbox">Mestá odberateľov sa na mape nenašli.</div>'; return; }
      if (out) out.innerHTML = `<div class="nb-wait">${Icon('search', 16)} Hľadám firmy v okruhu ${p.radiusKm} km…</div>`;
      const q = LL().overpassQuery({ points: body, radiusKm: p.radiusKm, crafts: p.crafts, timeout: 25 });
      const ctrl = new AbortController(); const stop = setTimeout(() => ctrl.abort(), 30000);
      let json;
      try {
        json = await Promise.any(LL().OVERPASS.map(async (u) => {
          const r = await fetch(u, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(q)}` });
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        }));
      } catch (e) {
        if (out) out.innerHTML = '<div class="warnbox">Mapa teraz neodpovedá. Skúste o chvíľu, alebo hľadanie cez AI.</div>';
        return;
      } finally { clearTimeout(stop); ctrl.abort(); }
      const { fresh, known } = LL().dedupe(LL().parse(json), { leads: this.rows, partners: this.partners });
      this.found = fresh;
      if (out) out.innerHTML = fresh.length ? `
        <div class="form-section">Našlo sa ${fresh.length} nových firiem${known.length ? ` (${known.length} už máte)` : ''}${UI.tip('Vopred sú zaškrtnuté firmy, ktoré majú e-mail alebo web. Firmy, ktoré už máte, sa tu neukazujú. Uloží sa len to, čo je zaškrtnuté.')}</div>
        <div class="mf-list">${fresh.map((f, i) => `<label class="mf-row"><input type="checkbox" data-i="${i}" ${f.email || f.website ? 'checked' : ''}>
          <span class="mf-main"><b>${UI.esc(f.name)}</b><em>${UI.esc([f.city, f.trade, f.email || (f.website ? 'web' : 'bez kontaktu')].filter(Boolean).join(' · '))}</em></span></label>`).join('')}</div>
        <div class="btn-row"><button type="button" class="btn btn-primary" onclick="Lead.saveFound()">${Icon('check', 14)} Uložiť vybrané</button></div>`
        : '<div class="regimebox">Na mape sa nenašla žiadna nová firma. Skúste väčší okruh, iné remeslá alebo hľadanie cez AI.</div>';
    },

    async saveFound() {
      const vyber = [...document.querySelectorAll('#find-out .mf-row input:checked')].map(c => this.found[Number(c.dataset.i)]).filter(Boolean);
      if (!vyber.length) return UI.toast('Nič nie je vybrané', 'err');
      let ok = 0;
      for (const f of vyber) { const { error } = await DB.insert('leads', f); if (!error) ok++; }
      UI.closeModal(); UI.toast(`Uložených ${ok} ${Shell.plural(ok, 'firma', 'firmy', 'firiem')}`, 'ok');
      this.loaded = false; Danubra.renderRoute();
    },
  };

  // ── E-maily (kampane) ───────────────────────────────────────────────────
  const Camp = {
    rows: [], sends: [], loaded: false, status: null,

    async load() {
      const [c, s] = await Promise.all([
        DB.list('campaigns', { order: { column: 'created_at', ascending: false }, limit: 200 }),
        DB.list('campaign_sends', { select: 'id,campaign_id,status,email,name,error,sent_at', limit: 20000 }),
      ]);
      this.rows = c.data || []; this.sends = s.data || []; this.loaded = true;
      if (!this.status) {
        try { const r = await fetch('/.netlify/functions/danubra-email-status'); this.status = r.ok ? await r.json() : { smtp: false }; }
        catch (e) { this.status = { smtp: false }; }
      }
    },
    sendsOf(id) { return this.sends.filter(s => s.campaign_id === id); },

    async view(el) {
      Danubra.setActions(`<button class="btn btn-primary btn-sm" onclick="Camp.form()">${Icon('plus', 14)} Nový e-mail</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const st = this.status || {};
      const caka = this.rows.find(c => ['paused', 'sending'].includes(c.status));
      el.innerHTML = Danubra.header(Danubra.labelOf('campaigns'), `${this.rows.length} ${Shell.plural(this.rows.length, 'e-mail', 'e-maily', 'e-mailov')} · odoslaných ${
        this.sends.filter(s => s.status === 'sent').length}`)
        + Shell.now(caka
          ? { key: 'cont', hot: false, title: 'Dokončiť rozosielanie', what: `„${caka.name}" — ${this.sendsOf(caka.id).filter(s => s.status === 'queued').length} adresátov ešte čaká.`,
              why: 'Posiela sa po dávkach (40 naraz), aby schránka neskončila v spame.' }
          : { key: 'new', hot: false, title: 'Napísať e-mail firmám', what: 'Text po nemecky, mená firiem sa doplnia samy.',
              why: 'Každý e-mail odíde zvlášť z Vašej schránky, s odosielateľom a odkazom na odhlásenie.' },
          { help: 'screen.campaigns', action: caka ? { label: 'Pokračovať', ico: 'mail', onclick: `Camp.run('${caka.id}')` }
            : { label: 'Nový e-mail', ico: 'plus', onclick: 'Camp.form()' } })
        + (st.smtp ? `<div class="regimebox">${Icon('check', 14)} Posiela sa z adresy <b>${UI.esc(st.from || '')}</b>.${UI.tip('Z tejto schránky odchádza každý e-mail. Odpovede firiem prídu e-mailom do tejto schránky, v appke sa samy neukážu — stav firmy (Odpísala, Má záujem) potom zmeňte v Nových firmách.')}</div>`
          : `<div class="warnbox">${Icon('alert', 14)} Posielanie ešte nie je zapnuté. V Netlify (Site configuration → Environment variables) treba doplniť
              <b>SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS</b> a <b>SMTP_FROM</b> (napr. „Partner und Service &lt;info@punds.eu&gt;"). Kým to nie je,
              e-maily sa dajú pripraviť, ale neodídu.${UI.tip('SMTP = prihlasovacie údaje k e-mailovej schránke (server, port, meno, heslo, adresa odosielateľa). Zadáva ich ten, kto spravuje Netlify — zámerne nie sú v appke, aby sa heslo nedostalo do prehliadača.')}</div>`)
        + (this.rows.length ? `<div class="cards">${this.rows.map(c => this.card(c)).join('')}</div>`
          : UI.empty('mail', 'Zatiaľ žiadny e-mail', 'Napíšte prvý — šablóna po nemecky je pripravená.',
            `<button class="btn btn-primary" onclick="Camp.form()">${Icon('plus')} Nový e-mail</button>`));
      if (this.rows.some(c => c.status === 'sending')) this.poll();
    },

    card(c) {
      const s = this.sendsOf(c.id);
      const n = (k) => s.filter(x => x.status === k).length;
      const ST = { draft: ['Návrh', 'gray'], sending: ['Posiela sa', 'blue'], paused: ['Čaká na pokračovanie', 'amber'],
        done: ['Odoslané', 'green'], error: ['Chyba', 'red'] }[c.status] || ['—', 'gray'];
      return `<div class="acc-card card">
        <div class="acc-card-head"><div style="min-width:0;"><div class="acc-name">${UI.esc(c.name)}</div>
          <div class="acc-loc">${UI.esc(c.subject)}</div></div><span style="display:inline-flex;align-items:center;flex:none;">${UI.badge(ST[0], ST[1])}${UI.tip(
          'Návrh = uložené, nič neodišlo. Posiela sa = server práve posiela. Čaká na pokračovanie = odišla jedna dávka, zvyšok pošlete tlačidlom Pokračovať. Odoslané = odišlo všetkým.')}</span></div>
        <div class="acc-meta"><span>${Icon('check', 14)} odoslané ${n('sent')}</span><span>${Icon('clock', 14)} čaká ${n('queued')}</span>
          ${n('failed') ? `<span style="color:var(--red);">${Icon('alert', 14)} chyba ${n('failed')}</span>` : ''}
          ${n('skipped') ? `<span>${Icon('x', 14)} preskočené ${n('skipped')}</span>` : ''}${n('failed') || n('skipped')
            ? UI.tip('Chyba = schránka e-mail neprijala (napr. zlá adresa); dôvod uvidíte v Adresátoch. Preskočené = adresa sa medzitým odhlásila, tak sa jej nič neposlalo.') : ''}</div>
        ${c.error ? `<div class="warnbox" style="margin-top:8px;">${UI.esc(c.error)}</div>` : ''}
        <div class="js-acts">
          ${n('queued') ? `<button class="btn btn-primary btn-sm" onclick="Camp.run('${c.id}')">${Icon('mail', 14)} ${c.status === 'draft' ? 'Odoslať' : 'Pokračovať'} (${n('queued')})</button>${UI.tip(
            'Naraz odíde najviac 40 e-mailov, každý zvlášť a s pauzou pár sekúnd, aby Vaša schránka neskončila v spame. Ak čaká viac adresátov, po dávke kliknite znova na Pokračovať.')}` : ''}
          <button class="btn btn-ghost btn-sm" onclick="Camp.detail('${c.id}')">Adresáti</button>
        </div></div>`;
    },

    detail(id) {
      const s = this.sendsOf(id);
      const T = { queued: 'čaká', sent: 'odoslané', failed: 'chyba', skipped: 'preskočené' };
      UI.modal('Adresáti', `<div class="mf-list">${s.map(x => `<div class="mf-row">
        <span class="mf-main"><b>${UI.esc(x.name || x.email)}</b><em>${UI.esc(x.email)}${x.error ? ` · ${UI.esc(x.error)}` : ''}</em></span>
        <span class="mf-sum">${T[x.status] || x.status}${x.sent_at ? ` · ${UI.date(x.sent_at)}` : ''}</span></div>`).join('') || '<div class="js-empty">Bez adresátov.</div>'}</div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button></div>`, { wide: true });
    },

    async form() {
      if (!Lead.loaded) await Lead.load();
      if (!this.loaded) await this.load();
      const T = LL().TEMPLATE_DE;
      UI.modal('Nový e-mail', `<form id="cf-form" onsubmit="event.preventDefault()" oninput="Camp.preview()" onchange="Camp.preview()">
        <div class="form-grid">
          ${UI.field('name', 'Názov (len pre Vás)', { value: `Predstavenie ${new Date().toLocaleDateString('sk-SK')}`, required: true })}
          ${UI.field('subject', 'Predmet', { value: T.subject, required: true,
            tip: 'Nadpis e-mailu, ktorý firma uvidí v schránke. {firma} sa každej firme nahradí jej názvom.' })}
          <div class="fld-full">${UI.field('body', 'Text', { type: 'textarea', rows: 12, value: T.body,
            tip: 'Píšte po nemecky — firmy sú v Nemecku. Slová v zložených zátvorkách, napr. {mesto}, sa každej firme nahradia jej údajmi; keď firma údaj nemá, ostane tam prázdne miesto.' })}</div>
        </div>
        <p class="card-note">Doplní sa samo: <code>{firma}</code>, <code>{mesto}</code>, <code>{remeslo}</code>, <code>{nasa_firma}</code>, <code>{podpis}</code>.
          Pätička s odosielateľom a odkazom na odhlásenie sa pridá vždy.${UI.tip(
          '{firma} = názov firmy, {mesto} = jej mesto, {remeslo} = čím sa zaoberá, {nasa_firma} a {podpis} = názov našej firmy z Nastavení. Pätička: naša firma, IČO, USt-IdNr, telefón, e-mail a odkaz „Keine weiteren E-Mails". Kto naň klikne, je odhlásený a už mu nič nepošleme.')}</p>
        <div class="form-section">Komu${UI.tip('Zaškrtnite, ktorým firmám poslať, podľa ich stavu. Firmy, ktoré sa odhlásili, nemajú záujem alebo nemajú e-mail, sa vynechajú vždy. Tá istá adresa dostane e-mail len raz.')}</div>
        <div class="chk-grid">${LL().STATUS.filter(s => !['won', 'unsubscribed', 'rejected'].includes(s[0])).map(([k, l]) =>
          `<label class="chk"><input type="checkbox" name="st" value="${k}" ${k === 'new' ? 'checked' : ''}><span>${l}</span></label>`).join('')}
          <label class="chk"><input type="checkbox" name="partners" value="1"><span>Aj naši odberatelia${UI.tip('Pošle sa aj firmám, s ktorými už spolupracujete (ak majú e-mail). Dostanú ten istý text — pri predstavovacom e-maile to väčšinou nechcete.')}</span></label></div>
        <div id="cf-count" class="card-note"></div>
        <div class="form-section">Ukážka${UI.tip('Takto e-mail uvidí prvá firma zo zoznamu adresátov. Odkaz na odhlásenie je tu skrátený (…), skutočný bude mať každá firma vlastný.')}</div>
        <pre id="cf-preview" class="cf-preview"></pre>
        <div class="regimebox">V Nemecku sa obchodný e-mail smie poslať firme, pri ktorej sa dá predpokladať záujem (§ 7 UWG).
          Píšte firmám, ktoré robia to, na čo dodávame ľudí, a vždy s možnosťou odhlásenia — tá je v každom e-maile.</div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
          <span style="display:inline-flex;align-items:center;"><button type="button" class="btn btn-outline" onclick="Camp.save(false)">Uložiť ako návrh</button>${UI.tip('Návrh: e-mail aj zoznam adresátov sa uložia a nič neodíde, odoslať ho môžete neskôr z karty. Adresáti sa vyberú teraz — firmy pridané neskôr v ňom nebudú.')}</span>
          <button type="button" class="btn btn-primary" id="cf-go" onclick="Camp.save(true)">${Icon('mail', 14)} Odoslať</button>
        </div></form>`, { wide: true });
      this.preview();
    },

    audience() {
      const f = document.getElementById('cf-form');
      const st = [...f.querySelectorAll('input[name=st]:checked')].map(i => i.value);
      const zLeads = Lead.rows.filter(r => st.includes(r.status)).map(r => ({ ...r, lead_id: r.id }));
      const zP = f.querySelector('input[name=partners]').checked
        ? Lead.partners.filter(p => p.email).map(p => ({ ...p, partner_id: p.id, status: 'won' })) : [];
      const optouts = this._optouts || [];
      return LL().recipients([...zLeads, ...zP], optouts);
    },

    async preview() {
      if (!this._optouts) {
        const { data } = await DB.list('email_optout', { limit: 20000 });
        this._optouts = data || [];
      }
      const f = document.getElementById('cf-form');
      if (!f) return;
      const d = UI.formData(f);
      const a = this.audience();
      const prvy = a.ok[0] || { name: 'Muster Bau GmbH', city: 'Ulm' };
      const s = Danubra.supplier();
      const odhl = `${location.origin}/.netlify/functions/danubra-unsubscribe?t=…`;
      const box = document.getElementById('cf-preview');
      if (box) box.textContent = `Predmet: ${LL().fill(d.subject, prvy, s)}\n\n${LL().fill(d.body, { ...prvy, unsubscribe: odhl }, s)}\n${LL().footer(s, odhl)}`;
      const c = document.getElementById('cf-count');
      const preskoci = a.skip.length;
      if (c) c.innerHTML = `Odíde <b>${a.ok.length}</b> ${Shell.plural(a.ok.length, 'e-mail', 'e-maily', 'e-mailov')}${
        preskoci ? ` · ${preskoci} sa preskočí (${[...new Set(a.skip.map(x => x.why))].join(', ')})` : ''}.`;
      const go = document.getElementById('cf-go');
      if (go) { go.disabled = !a.ok.length; go.innerHTML = `${Icon('mail', 14)} Odoslať ${a.ok.length}`; }
    },

    async save(send) {
      const d = UI.formData(document.getElementById('cf-form'));
      if (!String(d.subject || '').trim() || !String(d.body || '').trim()) return UI.toast('Doplňte predmet a text', 'err');
      const a = this.audience();
      if (send && !a.ok.length) return UI.toast('Nie je komu poslať', 'err');
      if (send && !await UI.confirm(`Odoslať ${a.ok.length} ${Shell.plural(a.ok.length, 'e-mail', 'e-maily', 'e-mailov')} z Vašej schránky?`)) return;
      const { data: c, error } = await DB.insert('campaigns', { name: d.name || 'E-mail', subject: d.subject, body: d.body, lang: 'de', status: 'draft' });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const rnd = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`);
      const rows = a.ok.map(r => ({ campaign_id: c.id, lead_id: r.lead_id || null, partner_id: r.partner_id || null,
        email: r.email, name: r.name || null, token: rnd() }));
      if (rows.length) {
        const { error: e2 } = await DB.insertMany('campaign_sends', rows);
        if (e2) return UI.toast('E-mail sa uložil, adresáti nie: ' + e2.message, 'err');
      }
      UI.closeModal();
      this.loaded = false;
      if (send) return this.run(c.id);
      UI.toast('Uložené ako návrh', 'ok');
      Danubra.renderRoute();
    },

    async run(id) {
      const t = await token();
      await DB.update('campaigns', id, { status: 'sending', error: null });
      fetch('/.netlify/functions/danubra-email-send-background', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ campaign_id: id, limit: 40 }) }).catch(() => {});
      UI.toast('Posielam — po dávkach, s pauzou medzi e-mailmi', 'ok');
      this.loaded = false;
      if (Danubra.route !== 'campaigns') return Danubra.go('campaigns');
      Danubra.renderRoute();
    },

    poll() {
      clearTimeout(this._poll);
      this._poll = setTimeout(() => {
        if (Danubra.route !== 'campaigns') return;
        this.loaded = false; Danubra.renderRoute();
      }, 8000);
    },
  };

  window.Lead = Lead;
  window.Camp = Camp;
  Danubra.views.leads = function (el) { return Lead.view(el); };
  Danubra.views.campaigns = function (el) { return Camp.view(el); };
})();
