// ============================================================================
// DANUBRA — Inzeráty
// ============================================================================
// Prvá vec, ktorú treba pri telefonáte vedieť, nie je meno. Je to **na ktorý
// inzerát človek volá**. Od toho sa odvíja zvyšok hovoru: aké remeslo, do
// akého mesta, akú sadzbu sme sľúbili a na čo sa treba pýtať.
//
// Preto tu nie je len zoznam textov, ale aj to, čo inzerát sľuboval. Keď sa
// o mesiac na stavbe povie „veď ste písali 18 €", musí byť po ruke, čo tam
// naozaj bolo — v znení, v akom to bežalo.
//
// Druhá vec, ktorú to rieši: **ktorý inzerát prináša ľudí.** Bez toho sa za
// dosah platí naslepo.
// ============================================================================
(function () {
  const A = () => window.DanubraAds;

  const Ads = {
    items: [], perf: [], trades: [], plans: [], subcontracts: [], loaded: false,
    filters: { q: '', channel: '', state: 'running' },

    async load() {
      const [a, p, t, pl, s] = await Promise.all([
        DB.list('ads', { order: { column: 'created_at', ascending: false }, limit: 300 }),
        DB.list('v_ad_performance', { limit: 300 }),
        DB.list('trades', { select: 'key,name_sk', limit: 100 }),
        DB.list('recruitment_plans', { select: 'id,title,trade_key,city,status', limit: 200 }),
        DB.list('subcontracts', { select: 'id,title,site_city,status', limit: 200 }),
      ]);
      this.items = a.data || []; this.perf = p.data || [];
      this.trades = t.data || []; this.plans = pl.data || [];
      this.subcontracts = s.data || [];
      this.loaded = true;
    },

    perfOf(id) { return A().performance(this.perf.find(x => x.id === id) || {}); },
    tradeName(key) {
      const t = this.trades.find(x => x.key === key);
      return t ? t.name_sk : (key || '');
    },

    /** Čo je po filtroch vidieť. Export aj zoznam berú to isté. */
    rows() {
      const f = this.filters;
      const today = new Date().toISOString().slice(0, 10);
      const withState = this.items.map(x => ({
        ...x,
        running: A().isRunning(x, today),
        trade_name: this.tradeName(x.trade_key),
      }));
      const byState = f.state === 'running' ? withState.filter(x => x.running)
        : (f.state === 'ended' ? withState.filter(x => !x.running) : withState);
      return Shell.filterRows(byState, {
        q: f.q,
        fields: ['title', 'channel_detail', 'city', 'trade_name', 'body'],
        equals: { channel: f.channel },
      });
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    exportCsv() {
      Shell.exportCsv(this.rows(), [
        ['Inzerát', x => x.title],
        ['Kanál', x => A().channelLabel(x.channel)],
        ['Kde', x => x.channel_detail],
        ['Remeslo', x => x.trade_name],
        ['Mesto', x => x.city],
        ['Sadzba €/h', x => DanubraExport.num(x.rate_offered)],
        ['Beží', x => (x.running ? 'áno' : 'nie')],
        ['Od', x => x.starts_on],
        ['Do', x => x.ends_on],
        ['Ozvalo sa', x => this.perfOf(x.id).candidates],
        ['Ozvali sme sa', x => this.perfOf(x.id).contacted],
        ['Nastúpilo', x => this.perfOf(x.id).hired],
      ], ['inzeraty']);
    },

    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const rows = this.rows();

      const card = (x) => {
        const p = this.perfOf(x.id);
        const promise = A().promiseLines(x);
        return `
          <div class="card card-pad list-card ad-card${x.running ? ' is-running' : ''}"
               onclick="Ads.detail('${x.id}')">
            <div class="card-head">
              <div class="card-title">${UI.esc(x.title)}</div>
              <span style="display:flex;gap:6px;">${x.web_published ? UI.badge('na webe', 'blue') : ''}${x.running ? UI.badge('beží', 'green') : UI.badge('dobehol', 'gray')}</span>
            </div>
            <div class="meta-row">
              <span>${Icon('marketing', 14)} ${UI.esc(A().channelLabel(x.channel))}${
                x.channel_detail ? ' · ' + UI.esc(x.channel_detail) : ''}</span>
              ${x.trade_name ? `<span>${Icon('wrench', 14)} ${UI.esc(x.trade_name)}</span>` : ''}
              ${x.city ? `<span>${Icon('pin', 14)} ${UI.esc(x.city)}</span>` : ''}
              ${x.rate_offered ? `<span>${Icon('euro', 14)} ${
                UI.esc(String(x.rate_offered).replace('.', ','))} €/h</span>` : ''}
            </div>
            ${promise.length ? `<div class="ad-promise">
              ${promise.map(t => `<span>${UI.esc(t)}</span>`).join('')}</div>` : ''}
            <div class="ad-perf">
              <div><b>${p.candidates}</b><span>ozvalo sa</span></div>
              <div><b>${p.contacted}</b><span>ozvali sme sa</span></div>
              <div><b>${p.hired}</b><span>nastúpilo</span></div>
              ${p.contactRate != null ? `<div class="${p.contactRate < 100 ? 'ad-warn' : ''}">
                <b>${p.contactRate} %</b><span>stihnuté</span></div>` : ''}
            </div>
          </div>`;
      };

      Danubra.setActions(
        `<button class="btn btn-primary btn-sm" onclick="Ads.form()">${Icon('plus')} Nový inzerát</button>`);
      el.innerHTML = Danubra.header(Danubra.labelOf('ads'),
        'Na čo ľudia volajú — a čo sme im v tom sľúbili')
        + Shell.list({
          rows, total: this.items.length, render: card, layout: 'cards',
          emptyIcon: 'marketing', emptyTitle: 'Zatiaľ žiadny inzerát',
          emptySub: 'Založte inzerát skôr, než ho vyvesíte — hovor sa potom začína tým, '
            + 'na čo človek volá, nie otázkou „a čo hľadáte?".',
          emptyHtml: null,
          filter: {
            search: { value: this.filters.q, placeholder: 'Hľadať názov, skupinu, mesto, text…',
              oninput: 'Ads.setF("q", this.value)' },
            selects: [
              { value: this.filters.state, label: 'Stav',
                onchange: 'Ads.setF("state", this.value)',
                options: [['running', 'Bežiace'], ['ended', 'Dobehnuté'], ['', 'Všetky']] },
              { value: this.filters.channel, label: 'Kanál',
                onchange: 'Ads.setF("channel", this.value)',
                options: [['', 'Všetky kanály'], ...A().CHANNELS] },
            ],
            exportCsv: 'Ads.exportCsv()',
          },
        });
    },

    detail(id) {
      const x = this.items.find(i => i.id === id);
      if (!x) return UI.toast('Nenájdené', 'err');
      const p = this.perfOf(id);
      const promise = A().promiseLines(x);

      UI.modal(x.title, `
        <div class="detail-head">
          ${A().isRunning(x) ? UI.badge('beží', 'green') : UI.badge('dobehol', 'gray')}
          <span style="color:var(--ink-mute);font-size:12.5px;">
            ${UI.esc(A().subtitle(x))}</span>
        </div>

        <div class="kv" style="margin:12px 0;">
          <div><span>Ozvalo sa</span><strong>${p.candidates}</strong></div>
          <div><span>Ozvali sme sa</span><strong>${p.contacted}${
            p.contactRate != null ? ` (${p.contactRate} %)` : ''}</strong></div>
          <div><span>Nastúpilo</span><strong>${p.hired}</strong></div>
          <div><span>Beží</span><strong>${x.starts_on ? UI.date(x.starts_on) : 'odkedy'} – ${
            x.ends_on ? UI.date(x.ends_on) : 'dokedy'}</strong></div>
        </div>

        ${promise.length ? `<div class="form-section">Čo sme sľúbili</div>
          <div class="ad-promise">${promise.map(t => `<span>${UI.esc(t)}</span>`).join('')}</div>
          <p style="font-size:12px;color:var(--ink-mute);margin:6px 0 0;">
            Toto je vidieť počas celého hovoru. Nesľubujte nič, čo tu nie je.</p>` : ''}

        ${x.body ? `<div class="form-section">Znenie inzerátu</div>
          <pre class="ad-body">${UI.esc(x.body)}</pre>` : ''}
        ${x.url ? `<p style="margin:10px 0 0;"><a href="${UI.esc(x.url)}"
          target="_blank" rel="noopener noreferrer">${Icon('chevron', 13)} Otvoriť inzerát</a></p>` : ''}
        ${x.note ? `<p style="margin:10px 0 0;color:var(--ink-sub);font-size:13px;">${UI.esc(x.note)}</p>` : ''}
        ${x.web_published ? `<div class="form-section">Web punds.sk</div>
          <p style="margin:0;font-size:13px;">${Icon('check', 13)} Zverejnené ako <strong>${UI.esc(x.web_title || x.title)}</strong>
            ${x.web_slug ? ` · <a href="${UI.esc(this.webUrl(x))}" target="_blank" rel="noopener">otvoriť na webe</a>` : ''}</p>` : ''}

        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="Ads.toggle('${x.id}')">
            ${Icon(x.active ? 'x' : 'check', 14)} ${x.active ? 'Ukončiť inzerát' : 'Znova spustiť'}</button>
          <button class="btn btn-primary" onclick="Ads.form('${x.id}')">
            ${Icon('edit', 14)} Upraviť</button>
        </div>`, { wide: true });
    },

    form(id) {
      const x = id ? this.items.find(i => i.id === id) || {} : {};
      UI.modal(id ? 'Upraviť inzerát' : 'Nový inzerát', `
        <form id="ad-form" onsubmit="event.preventDefault();Ads.save('${id || ''}')">
          <div class="form-grid">
            ${UI.field('title', 'Názov (interný)', { value: x.title, required: true,
              placeholder: 'Murári Stuttgart — FB skupina' })}
            ${UI.field('channel', 'Kanál', { value: x.channel || 'facebook',
              options: A().CHANNELS })}
            ${UI.field('channel_detail', 'Kde presne', { value: x.channel_detail,
              placeholder: 'Práca v Nemecku — skupina' })}
            ${UI.field('url', 'Odkaz na inzerát', { value: x.url, placeholder: 'https://…' })}
            ${UI.field('trade_key', 'Remeslo', { value: x.trade_key, add: 'trade',
              options: [['', 'viac remesiel'], ...this.trades.map(t => [t.key, t.name_sk])] })}
            ${UI.field('city', 'Mesto', { value: x.city })}
            ${UI.field('rate_offered', 'Sľúbená sadzba €/h', { type: 'number', value: x.rate_offered })}
            ${UI.field('plan_id', 'Náborový plán', { value: x.plan_id, add: 'plan',
              options: [['', '— žiadny —'], ...this.plans.filter(p => p.status === 'active')
                .map(p => [p.id, p.title])] })}
            ${UI.field('subcontract_id', 'Zákazka', { value: x.subcontract_id, add: 'subcontract',
              options: [['', '— žiadna —'], ...this.subcontracts.filter(s => s.status === 'active')
                .map(s => [s.id, s.title])] })}
            ${UI.field('starts_on', 'Beží od', { type: 'date', value: x.starts_on })}
            ${UI.field('ends_on', 'Beží do', { type: 'date', value: x.ends_on })}
          </div>

          <div class="form-section">Čo inzerát sľubuje</div>
          <p style="font-size:12.5px;color:var(--ink-mute);margin:0 0 8px;">
            Jeden sľub na riadok. Počas hovoru je to vpravo na očiach, aby sa
            nesľúbilo niečo iné, než čo bolo v inzeráte.</p>
          ${UI.field('promise', '', { type: 'textarea', rows: 4,
            value: (x.promise || []).join('\n'),
            placeholder: 'ubytovanie platíme\nvýplata do 10. dňa\ndoprava zo Slovenska' })}

          <div class="form-section">Presné znenie</div>
          ${UI.field('body', '', { type: 'textarea', rows: 6, value: x.body,
            placeholder: 'Skopírujte sem text inzerátu tak, ako beží.' })}
          ${UI.field('note', 'Interná poznámka', { type: 'textarea', rows: 2, value: x.note })}

          ${this.webSection(x)}

          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">Uložiť</button>
          </div>
        </form>`, { wide: true });
    },

    async save(id) {
      const d = UI.formData(document.getElementById('ad-form'));
      if (!d.title) return UI.toast('Názov je povinný', 'err');
      const payload = {
        ...d,
        rate_offered: d.rate_offered === '' ? null : Number(d.rate_offered),
        plan_id: d.plan_id || null,
        subcontract_id: d.subcontract_id || null,
        trade_key: d.trade_key || null,
        starts_on: d.starts_on || null,
        ends_on: d.ends_on || null,
        promise: String(d.promise || '').split('\n').map(s => s.trim()).filter(Boolean),
      };
      // Časť pre web punds.sk — polia web_*, preklady, adresa ponuky.
      const W = window.DanubraWebAd;
      const x = id ? this.items.find(i => i.id === id) || {} : {};
      if (W) {
        if (d.web_published && W.missing(d).length) {
          return UI.toast(`Na web chýba: ${W.missing(d).join(', ')}`, 'err');
        }
        Object.assign(payload, W.payload(d, x, { i18n: this.webI18n(x) }));
        for (const k of Object.keys(d)) if (/^tr_/.test(k)) delete payload[k];
        // Súradnice pre mapu na webe — pri zverejnení, keď ich ešte nemá alebo sa zmenilo mesto.
        if (payload.web_published && d.city && (payload.lat === null || x.lat == null)) {
          Object.assign(payload, await this.geocode(d.city, payload.country));
        }
      }
      const { error } = id
        ? await DB.update('ads', id, payload)
        : await DB.insert('ads', payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal();
      UI.toast(id ? 'Inzerát upravený' : 'Inzerát založený', 'ok');
      this.loaded = false;
      Danubra.renderRoute();
    },

    // ── Web punds.sk ────────────────────────────────────────────────────
    /** Časť formulára: zverejnenie inzerátu ako ponuky na punds.sk. */
    webSection(x) {
      const W = window.DanubraWebAd;
      if (!W) return '';
      this._i18n = JSON.parse(JSON.stringify(x.i18n || {}));
      const tr = W.translated(this._i18n);
      return `<div class="form-section">Web punds.sk</div>
        <div class="regimebox" style="margin:0 0 10px;">Zverejnená ponuka je na punds.sk do pár minút po uložení.
          Prihlášky z nej prídu do Kandidátov pri tomto inzeráte.</div>
        ${UI.field('web_published', 'Zverejniť na punds.sk', { type: 'checkbox', value: !!x.web_published })}
        <div class="form-grid">
          ${UI.field('web_title', 'Verejný názov pozície', { value: x.web_title || '', placeholder: 'Zvárač MIG/MAG (135)' })}
          ${UI.field('web_prof', 'Profesia na webe', { value: x.web_prof || W.FROM_TRADE[x.trade_key] || '',
            options: [['', '— podľa remesla —'], ...W.WEB_PROFESSIONS] })}
          ${UI.field('country', 'Krajina', { value: x.country || 'DE', options: [['DE', 'Nemecko'], ['AT', 'Rakúsko']] })}
          ${UI.field('rate_max', 'Sadzba do €/h', { type: 'number', value: x.rate_max, hint: '„Sľúbená sadzba" hore je od.' })}
          ${UI.field('hours_week', 'Hodín týždenne', { type: 'number', value: x.hours_week, placeholder: '50' })}
          ${UI.field('rotation', 'Turnus', { value: x.rotation || '', placeholder: '4+1' })}
          ${UI.field('headcount', 'Koľko ľudí hľadáme', { type: 'number', value: x.headcount })}
          ${UI.field('duration', 'Dĺžka projektu', { value: x.duration || '', placeholder: '6 mesiacov / dlhodobo' })}
        </div>
        <div class="form-grid">
          ${UI.field('start_now', 'Nástup ihneď', { type: 'checkbox', value: !!x.start_now })}
          ${UI.field('accommodation', 'Ubytovanie zabezpečené', { type: 'checkbox', value: x.accommodation !== false })}
        </div>
        ${UI.field('web_body', 'Popis pozície na web', { type: 'textarea', rows: 4, value: x.web_body || '',
          placeholder: 'Hľadáme skúsených zváračov MIG/MAG na oceľové konštrukcie pre halu v Bremene…' })}
        <div class="form-grid">
          ${UI.field('duties', 'Náplň práce (riadok = bod)', { type: 'textarea', rows: 4, value: (x.duties || []).join('\n') })}
          ${UI.field('requirements', 'Požiadavky (riadok = bod)', { type: 'textarea', rows: 4, value: (x.requirements || []).join('\n') })}
          ${UI.field('benefits', 'Čo ponúkame (riadok = bod)', { type: 'textarea', rows: 4, value: (x.benefits || []).join('\n') })}
          ${UI.field('faq', 'Otázky (Otázka? | Odpoveď)', { type: 'textarea', rows: 4, value: W.faqText(x.faq),
            placeholder: 'Potrebujem živnosť? | Áno, pomôžeme Vám ju založiť.' })}
        </div>
        <div class="form-grid">
          ${UI.field('image_url', 'Fotka (adresa)', { value: x.image_url || '', placeholder: 'prázdne = fotka podľa profesie' })}
          <label class="fld"><span>Nahrať fotku</span><input type="file" accept="image/jpeg,image/png,image/webp" onchange="Ads.uploadImage(this)"></label>
        </div>
        <div class="js-acts" style="align-items:center;">
          <button type="button" class="btn btn-outline btn-sm" id="ad-tr-btn" onclick="Ads.translate()">${Icon('repeat', 14)} Preložiť do CZ, HU, DE, EN</button>
          <span class="card-note" id="ad-tr-st">${tr.length ? `Preložené: ${tr.map(l => l.toUpperCase()).join(', ')}` : 'Bez prekladu — v ostatných jazykoch sa ukáže slovenský text.'}</span>
          ${x.web_published && x.web_slug ? `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${UI.esc(this.webUrl(x))}">${Icon('chevron', 14)} Otvoriť na webe</a>` : ''}
        </div>
        <div id="ad-tr-edit">${this.trEditor()}</div>`;
    },

    webUrl(x) { return `${location.origin}/punds-sk/sk/ponuky/${encodeURIComponent(x.web_slug || '')}`; },

    /** Preklady na úpravu — po jazykoch, rozbalí sa len na požiadanie. */
    trEditor() {
      const W = window.DanubraWebAd;
      const i = this._i18n || {};
      return W.LANGS.filter(([l]) => i[l]).map(([l, name]) => `<details class="more-block"><summary>${UI.esc(name)} — upraviť preklad</summary>
        <div class="form-grid">
          ${UI.field(`tr_${l}_title`, 'Názov', { value: i[l].title || '' })}
          ${UI.field(`tr_${l}_duration`, 'Dĺžka projektu', { value: i[l].duration || '' })}
        </div>
        ${UI.field(`tr_${l}_body`, 'Popis', { type: 'textarea', rows: 3, value: i[l].body || '' })}
        <div class="form-grid">
          ${UI.field(`tr_${l}_duties`, 'Náplň práce', { type: 'textarea', rows: 3, value: (i[l].duties || []).join('\n') })}
          ${UI.field(`tr_${l}_requirements`, 'Požiadavky', { type: 'textarea', rows: 3, value: (i[l].requirements || []).join('\n') })}
          ${UI.field(`tr_${l}_benefits`, 'Čo ponúkame', { type: 'textarea', rows: 3, value: (i[l].benefits || []).join('\n') })}
          ${UI.field(`tr_${l}_faq`, 'Otázky (Otázka? | Odpoveď)', { type: 'textarea', rows: 3, value: W.faqText(i[l].faq) })}
        </div></details>`).join('');
    },

    /** Preklady z formulára (ručné opravy majú prednosť). */
    webI18n(x) {
      const W = window.DanubraWebAd;
      const f = document.getElementById('ad-form');
      const i = JSON.parse(JSON.stringify(this._i18n || x.i18n || {}));
      if (!f) return i;
      const d = UI.formData(f);
      for (const [l] of W.LANGS) {
        if (!i[l]) continue;
        if (d[`tr_${l}_title`] != null) i[l].title = d[`tr_${l}_title`];
        if (d[`tr_${l}_duration`] != null) i[l].duration = d[`tr_${l}_duration`];
        if (d[`tr_${l}_body`] != null) i[l].body = d[`tr_${l}_body`];
        for (const k of ['duties', 'requirements', 'benefits']) if (d[`tr_${l}_${k}`] != null) i[l][k] = W.lines(d[`tr_${l}_${k}`]);
        if (d[`tr_${l}_faq`] != null) i[l].faq = W.faqParse(d[`tr_${l}_faq`]);
      }
      return i;
    },

    async translate() {
      const W = window.DanubraWebAd;
      const f = document.getElementById('ad-form');
      const d = UI.formData(f);
      if (!d.web_title) return UI.toast('Najprv vyplňte verejný názov pozície', 'err');
      const btn = document.getElementById('ad-tr-btn'), st = document.getElementById('ad-tr-st');
      btn.disabled = true; st.textContent = 'Prekladám… (asi pol minúty)';
      try {
        const { data: s } = await DB.client.auth.getSession();
        const res = await fetch('/.netlify/functions/punds-translate', { method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(s && s.session && s.session.access_token) || ''}` },
          body: JSON.stringify({ ad: { web_title: d.web_title, web_body: d.web_body, duration: d.duration,
            duties: W.lines(d.duties), requirements: W.lines(d.requirements), benefits: W.lines(d.benefits), faq: W.faqParse(d.faq) } }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.i18n) throw new Error(j.error || `Chyba ${res.status}`);
        this._i18n = { ...(this._i18n || {}), ...j.i18n };
        document.getElementById('ad-tr-edit').innerHTML = this.trEditor();
        st.textContent = `Preložené: ${W.translated(this._i18n).map(l => l.toUpperCase()).join(', ')} — skontrolujte a uložte.`;
      } catch (e) {
        st.textContent = e.message;
        UI.toast(e.message, 'err');
      } finally { btn.disabled = false; }
    },

    async uploadImage(input) {
      const file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) return UI.toast('Fotka môže mať najviac 5 MB', 'err');
      const ext = (file.name.match(/\.(jpe?g|png|webp)$/i) || ['.jpg'])[0].toLowerCase();
      const path = `ponuky/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}${ext}`;
      const { error } = await DB.client.storage.from('punds-web').upload(path, file, { contentType: file.type, upsert: false });
      if (error) return UI.toast('Fotka sa nenahrala: ' + error.message, 'err');
      const { data } = DB.client.storage.from('punds-web').getPublicUrl(path);
      const f = document.getElementById('ad-form');
      f.querySelector('[name=image_url]').value = data.publicUrl;
      UI.toast('Fotka nahratá', 'ok');
    },

    /** Súradnice mesta pre mapu na webe (OpenStreetMap). Keď sa nepodarí, web použije známe mestá. */
    async geocode(city, country) {
      if (!city) return {};
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=${(country || 'de').toLowerCase()}&q=${encodeURIComponent(city)}`,
          { headers: { 'Accept-Language': 'de' } });
        const j = await r.json();
        return j && j[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : {};
      } catch (e) { return {}; }
    },

    /**
     * Dobehnutý inzerát sa vypína, nie maže. Kandidáti, ktorí sa naň ozvali,
     * musia zostať naviazaní na to, čo čítali.
     */
    async toggle(id) {
      const x = this.items.find(i => i.id === id);
      if (!x) return;
      const { error } = await DB.update('ads', id, { active: !x.active });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal();
      UI.toast(x.active ? 'Inzerát ukončený' : 'Inzerát znova beží', 'ok');
      this.loaded = false;
      Danubra.renderRoute();
    },
  };

  window.Ads = Ads;
  Danubra.views.ads = function (el) { return Ads.view(el); };
})();
