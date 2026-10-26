// ============================================================================
// DANUBRA — Weby punds.sk a punds.eu: správa obsahu (Marketing → Weby)
// ============================================================================
// „Z kade sa bude administrovať stránky?" — odtiaľto:
//   Prehľad   čo z webov prišlo (prihlášky, správy, dopyty), zverejnené ponuky
//   Kontakty  telefóny, e-maily, WhatsApp, konateľ (Impressum)
//   Tím       mená, funkcie po jazykoch, fotky (O nás / Über uns)
//   Fotky     výmena fotiek z WordPressu za vlastné
//   Texty     každý text každej stránky v každom jazyku + preklad
// Ponuky práce sa spravujú v Inzerátoch (Zverejniť na punds.sk).
//
// Uloženie: danubra_web_content (kľúč → hodnota). Web si ho načíta do minúty,
// stránky drží CDN ďalších 5 minút. Popis textov dáva web (/punds-sk/api/schema).
// ============================================================================
(function () {
  const PAGE_SK = {
    common: 'Spoločné (menu, päta, hlásenia)', home: 'Úvod', jobs: 'Ponuky — zoznam', job: 'Ponuka — detail',
    professions: 'Profesie', about: 'O nás', how: 'Ako to funguje', contact: 'Kontakt', privacy: 'Ochrana osobných údajov',
    cookies: 'Cookies', notFound: 'Stránka nenájdená',
  };
  const PAGE_EU = {
    common: 'Spoločné (menu, päta, hlásenia)', home: 'Startseite', trade: 'Remeslo — spoločné texty', about: 'Über uns',
    contact: 'Kontakt / Anfrage', imprint: 'Impressum', privacy: 'Datenschutz', notFound: 'Stránka nenájdená',
  };
  const TRADE = { zvarac: 'Schweißen', zamocnik: 'Metallbau', sadrokarton: 'Trockenbau', maliar: 'Maler', zateplovac: 'WDVS',
    okna: 'Fenster & Türen', nabytok: 'Möbelmontage', pomocnik: 'Bauhelfer' };
  const LANG = { sk: 'Slovensky', cz: 'Česky', hu: 'Maďarsky', de: 'Nemecky', en: 'Anglicky' };
  const SRC = { sk: 'sk', eu: 'de' };                   // jazyk, z ktorého sa prekladá
  const webUrl = (site, lang) => `${location.origin}/punds-${site}/${lang || SRC[site]}/`;
  const val = (rows, key, def) => (rows[key] != null ? rows[key] : def);

  const Web = {
    tab: 'overview', loaded: false, rows: {}, schema: null, stats: [], published: 0, cfg: {},
    tx: { site: 'sk', page: 'home', lang: 'sk', q: '' },

    async load() {
      const [r, s, a] = await Promise.all([
        DB.list('web_content', { limit: 500 }),
        Promise.resolve(DB.rpc('web_stats', { days: 30 })).catch(() => ({ data: [] })),
        DB.list('ads', { select: 'id,web_published,active', limit: 500 }),
      ]);
      this.rows = Object.fromEntries((r.data || []).map((x) => [x.key, x.value]));
      this.stats = (s && s.data) || [];
      this.published = (a.data || []).filter((x) => x.web_published && x.active).length;
      const row = await Danubra.loadCfg();
      this.cfg = row.web || {};
      if (!this.schema) {
        try { this.schema = await (await fetch('/punds-sk/api/schema', { cache: 'no-store' })).json(); }
        catch (e) { this.schema = null; }
      }
      this.loaded = true;
    },

    async save(key, value) {
      const { error } = await DB.client.from('danubra_web_content').upsert({ key, value, updated_at: new Date().toISOString(),
        updated_by: (Danubra.user && Danubra.user.id) || null }, { onConflict: 'key' });
      if (error) { UI.toast('Chyba: ' + error.message, 'err'); return false; }
      this.rows[key] = value;
      return true;
    },

    setTab(t) { this.tab = t; Danubra.renderRoute(); },

    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      Danubra.setActions(`<a class="btn btn-outline btn-sm" target="_blank" rel="noopener" href="${webUrl('sk')}">${Icon('site', 14)} punds.sk</a>
        <a class="btn btn-outline btn-sm" target="_blank" rel="noopener" href="${webUrl('eu')}">${Icon('site', 14)} punds.eu</a>`);
      const tabs = [['overview', 'Prehľad', 'chart'], ['contacts', 'Kontakty a firma', 'phone'], ['team', 'Tím', 'workers'],
        ['photos', 'Fotky', 'upload'], ['texts', 'Texty', 'edit']];
      el.innerHTML = Danubra.header(Danubra.labelOf('website'), 'Obsah webov punds.sk a punds.eu — zmeny sú na webe do 5 minút')
        + `<div class="sec-tabs" role="tablist">${tabs.map(([k, l, i]) => `<button role="tab" class="sec-tab${this.tab === k ? ' on' : ''}" onclick="Web.setTab('${k}')">${Icon(i, 14)} ${l}</button>`).join('')}</div>
        <div id="web-body" style="margin-top:14px;">${this[`${this.tab}Html`]()}</div>`;
      if (this.tab === 'texts') this.paintTexts();
    },

    // ── Prehľad ───────────────────────────────────────────────────────────
    overviewHtml() {
      const sum = (f) => this.stats.filter(f).reduce((n, x) => n + Number(x.total || 0) - Number(x.spam || 0) - Number(x.failed || 0), 0);
      const apply = sum((x) => x.site === 'sk' && x.form === 'apply');
      const contact = sum((x) => x.site === 'sk' && x.form === 'contact');
      const enquiry = sum((x) => x.site === 'eu' && x.form === 'enquiry');
      const spam = this.stats.reduce((n, x) => n + Number(x.spam || 0), 0);
      const mailErr = this.stats.reduce((n, x) => n + Number(x.mail_error || 0), 0);
      const byLang = {};
      this.stats.filter((x) => x.site === 'sk').forEach((x) => { byLang[x.lang] = (byLang[x.lang] || 0) + Number(x.total || 0) - Number(x.spam || 0) - Number(x.failed || 0); });
      const tile = (n, l, href, ico) => `<a class="web-tile" href="${href}"><span>${Icon(ico, 18)}</span><b>${n}</b><small>${l}</small></a>`;
      return `<div class="web-tiles">
          ${tile(apply, 'prihlášok na ponuky', '#/candidates', 'user')}
          ${tile(contact, 'správ z kontaktného formulára', '#/candidates', 'mail')}
          ${tile(enquiry, 'dopytov od firiem (punds.eu)', '#/opportunities', 'clients')}
          ${tile(this.published, 'ponúk zverejnených na punds.sk', '#/ads', 'marketing')}
        </div>
        <p class="card-note">Za posledných 30 dní. ${spam ? `Odfiltrovaný spam: ${spam}. ` : ''}${Object.keys(byLang).length ? `Podľa jazyka: ${Object.entries(byLang).map(([l, n]) => `${l.toUpperCase()} ${n}`).join(' · ')}.` : ''}</p>
        ${mailErr ? `<div class="warnbox">${Icon('alert', 14)} ${mailErr}× sa nepodarilo poslať automatický e-mail — skontrolujte schránku v Nastavenia → Schránky.</div>` : ''}
        <div class="cards" style="margin-top:12px;">
          ${['sk', 'eu'].map((s) => `<div class="card card-pad"><div class="card-head"><div class="card-title">${s === 'sk' ? 'punds.sk — remeselníci' : 'punds.eu — firmy v Nemecku'}${Help.btn('screen.website', { size: 13 })}</div>${UI.badge('skúšobná adresa', 'amber')}</div>
            <p class="card-note" style="margin:0 0 10px;">${s === 'sk' ? 'Jazyky SK, CZ, HU, DE, EN. Ponuky sú z Inzerátov.' : 'Jazyky DE, EN. Dopyty idú do Dopytov.'}</p>
            <div class="js-acts">${(s === 'sk' ? ['sk', 'cz', 'hu', 'de', 'en'] : ['de', 'en']).map((l) => `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${webUrl(s, l)}">${l.toUpperCase()}</a>`).join('')}</div></div>`).join('')}
          <div class="card card-pad"><div class="card-head"><div class="card-title">Automatické e-maily${Help.btn('card.mailboxes.web', { size: 13 })}</div>${this.cfg.confirm ? UI.badge('zapnuté', 'green') : UI.badge('vypnuté', 'gray')}</div>
            <p class="card-note" style="margin:0 0 10px;">Potvrdenie uchádzačovi a firme a upozornenie Vám.</p>
            <button class="btn btn-outline btn-sm" onclick="Danubra.go('mailboxes')">${Icon('settings', 14)} Nastaviť</button></div>
        </div>`;
    },

    // ── Kontakty a firma ──────────────────────────────────────────────────
    contactsHtml() {
      const D = (this.schema && this.schema.defaults && this.schema.defaults.contacts) || { sk: {}, eu: {} };
      const c = val(this.rows, 'contacts', {}), co = val(this.rows, 'company', {});
      const v = (s, k) => (c[s] && c[s][k]) || '';
      return `<div class="card card-pad"><form id="web-contacts" onsubmit="event.preventDefault();Web.saveContacts()">
        <div class="form-section">punds.sk</div>
        <div class="form-grid">
          ${UI.field('sk_phone1', 'Telefón (hlavný)', { value: v('sk', 'phone1'), placeholder: D.sk.phone1 })}
          ${UI.field('sk_phone2', 'Telefón (druhý)', { value: v('sk', 'phone2'), placeholder: D.sk.phone2 })}
          ${UI.field('sk_email', 'E-mail', { type: 'email', value: v('sk', 'email'), placeholder: D.sk.email })}
          ${UI.field('whatsapp', 'WhatsApp', { value: c.whatsapp || '', placeholder: D.whatsapp })}
        </div>
        <div class="form-section">punds.eu</div>
        <div class="form-grid">
          ${UI.field('eu_phone', 'Telefón', { value: v('eu', 'phone'), placeholder: D.eu.phone })}
          ${UI.field('eu_email', 'E-mail', { type: 'email', value: v('eu', 'email'), placeholder: D.eu.email })}
        </div>
        <div class="form-section">Firma</div>
        ${UI.field('md', 'Konateľ (Impressum, Geschäftsführer)', { value: co.md || '', placeholder: 'Meno a priezvisko' })}
        <p class="card-note">Prázdne pole = pôvodná hodnota (sivá). Otváracie hodiny a ostatné vety sú v záložke Texty.</p>
        <div class="modal-actions" style="justify-content:flex-start;"><button type="submit" class="btn btn-primary">Uložiť</button></div>
      </form></div>`;
    },
    async saveContacts() {
      const d = UI.formData(document.getElementById('web-contacts'));
      const contacts = { sk: { phone1: d.sk_phone1, phone2: d.sk_phone2, email: d.sk_email }, eu: { phone: d.eu_phone, email: d.eu_email }, whatsapp: d.whatsapp };
      if (await this.save('contacts', contacts) && await this.save('company', { ...val(this.rows, 'company', {}), md: d.md })) {
        UI.toast('Uložené — na webe do 5 minút', 'ok');
      }
    },

    // ── Tím ───────────────────────────────────────────────────────────────
    team() { return Array.isArray(this.rows.team) ? this.rows.team : []; },
    teamHtml() {
      const t = this.team();
      return `<div class="js-acts" style="margin-bottom:12px;"><button class="btn btn-primary btn-sm" onclick="Web.member()">${Icon('plus', 14)} Pridať človeka</button></div>
        ${t.length ? `<div class="cards">${t.map((m) => `<div class="card card-pad web-member${m.active === false ? ' is-off' : ''}">
          <div class="web-member-ph">${m.photo ? `<img src="${UI.esc(m.photo)}" alt="">` : Icon('user', 28)}</div>
          <div><div class="acc-name">${UI.esc(m.name)}</div><div class="acc-loc">${UI.esc((m.role && m.role.sk) || '')}${m.langs ? ` · ${UI.esc(m.langs)}` : ''}</div>
            <div class="acc-loc">${(m.sites || ['sk', 'eu']).map((s) => `punds.${s}`).join(', ')}${m.active === false ? ' · skrytý' : ''}</div></div>
          <div class="js-acts"><button class="btn btn-outline btn-sm" onclick="Web.member('${m.id}')">${Icon('edit', 14)} Upraviť</button></div></div>`).join('')}</div>`
          : UI.empty('workers', 'Zatiaľ nikto', 'Ľudia sa ukážu na stránkach O nás (punds.sk) a Über uns (punds.eu). Kým tu nikto nie je, na webe je táto časť skrytá.')}`;
    },
    member(id) {
      const m = (id && this.team().find((x) => x.id === id)) || { id: `t${Date.now().toString(36)}`, role: {}, sites: ['sk', 'eu'], active: true };
      this._m = { ...m };
      UI.modal(id ? `Upraviť — ${m.name}` : 'Pridať človeka', `<form id="web-m" onsubmit="event.preventDefault();Web.saveMember()">
        <div class="form-grid">
          ${UI.field('name', 'Meno a priezvisko', { value: m.name || '', required: true })}
          ${UI.field('langs', 'Jazyky', { value: m.langs || '', placeholder: 'SK · DE' })}
        </div>
        <div class="form-section">Funkcia</div>
        <div class="form-grid">${Object.entries(LANG).map(([l, n]) => UI.field(`role_${l}`, n, { value: (m.role && m.role[l]) || '' })).join('')}</div>
        <div class="js-acts"><button type="button" class="btn btn-outline btn-sm" id="web-m-tr" onclick="Web.translateRole()">${Icon('repeat', 14)} Preložiť zo slovenčiny</button></div>
        <div class="form-section">Kde sa ukáže</div>
        <div class="form-grid">
          ${UI.field('site_sk', 'punds.sk (O nás)', { type: 'checkbox', value: (m.sites || []).includes('sk') })}
          ${UI.field('site_eu', 'punds.eu (Über uns)', { type: 'checkbox', value: (m.sites || []).includes('eu') })}
          ${UI.field('sort', 'Poradie', { type: 'number', value: m.sort || 0 })}
          ${UI.field('active', 'Zobrazovať na webe', { type: 'checkbox', value: m.active !== false })}
        </div>
        <div class="form-grid">
          ${UI.field('photo', 'Fotka (adresa)', { value: m.photo || '' })}
          <label class="fld"><span>Nahrať fotku</span><input type="file" accept="image/jpeg,image/png,image/webp" onchange="Web.upload(this,'photo','tim')"></label>
        </div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
          <button type="submit" class="btn btn-primary">Uložiť</button></div></form>`, { wide: true });
    },
    async saveMember() {
      const d = UI.formData(document.getElementById('web-m'));
      if (!d.name) return UI.toast('Vyplňte meno', 'err');
      const m = { ...this._m, name: d.name, langs: d.langs, photo: d.photo || null, sort: Number(d.sort) || 0, active: !!d.active,
        sites: [d.site_sk && 'sk', d.site_eu && 'eu'].filter(Boolean),
        role: Object.fromEntries(Object.keys(LANG).map((l) => [l, d[`role_${l}`] || ''])) };
      const list = this.team().filter((x) => x.id !== m.id).concat(m);
      if (await this.save('team', list)) { UI.closeModal(); UI.toast('Uložené — na webe do 5 minút', 'ok'); Danubra.renderRoute(); }
    },
    async translateRole() {
      const f = document.getElementById('web-m');
      const sk = f.querySelector('[name=role_sk]').value.trim();
      if (!sk) return UI.toast('Najprv napíšte funkciu po slovensky', 'err');
      const r = await this.translate({ role: sk }, 'sk', ['cz', 'hu', 'de', 'en'], document.getElementById('web-m-tr'));
      if (r) for (const [l, x] of Object.entries(r)) if (x.role) f.querySelector(`[name=role_${l}]`).value = x.role;
    },

    // ── Fotky ─────────────────────────────────────────────────────────────
    photosHtml() {
      const imgs = (this.schema && this.schema.images) || [];
      const map = val(this.rows, 'images', {});
      if (!imgs.length) return UI.empty('upload', 'Zoznam fotiek sa nenačítal', 'Skúste obnoviť stránku.');
      return `<p class="card-note" style="margin:0 0 12px;">Fotky sú zatiaľ z doterajšieho webu punds.eu (WordPress). Pred prepnutím domény ich nahraďte vlastnými —
        inak po vypnutí WordPressu zmiznú. Fotka konkrétnej ponuky sa nahráva v Inzerátoch.</p>
        <div class="web-photos">${imgs.map((im, i) => {
          const cur = map[im.url] || im.url;
          return `<div class="card web-photo"><img src="${UI.esc(cur)}" alt="" loading="lazy">
            <div class="card-pad"><div class="acc-loc">${UI.esc(im.label)}</div>
            <div class="js-acts">${map[im.url] ? UI.badge('vlastná', 'green') : UI.badge('z WordPressu', 'amber')}
              <label class="btn btn-outline btn-sm" style="cursor:pointer;">${Icon('upload', 14)} Nahradiť<input type="file" hidden accept="image/jpeg,image/png,image/webp" onchange="Web.replacePhoto(${i}, this)"></label>
              ${map[im.url] ? `<button class="btn btn-ghost btn-sm" onclick="Web.resetPhoto(${i})">Pôvodná</button>` : ''}</div></div></div>`;
        }).join('')}</div>`;
    },
    async upload(input, field, folder) {
      const url = await this.uploadFile(input.files && input.files[0], folder);
      if (url) input.closest('form').querySelector(`[name=${field}]`).value = url;
    },
    async uploadFile(file, folder) {
      if (!file) return null;
      if (file.size > 5 * 1024 * 1024) { UI.toast('Fotka môže mať najviac 5 MB', 'err'); return null; }
      const ext = (file.name.match(/\.(jpe?g|png|webp)$/i) || ['.jpg'])[0].toLowerCase();
      const path = `${folder}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}${ext}`;
      const { error } = await DB.client.storage.from('punds-web').upload(path, file, { contentType: file.type, upsert: false });
      if (error) { UI.toast('Fotka sa nenahrala: ' + error.message, 'err'); return null; }
      return DB.client.storage.from('punds-web').getPublicUrl(path).data.publicUrl;
    },
    async replacePhoto(i, input) {
      const im = this.schema.images[i];
      const url = await this.uploadFile(input.files && input.files[0], 'web');
      if (!url) return;
      if (await this.save('images', { ...val(this.rows, 'images', {}), [im.url]: url })) { UI.toast('Fotka vymenená — na webe do 5 minút', 'ok'); Danubra.renderRoute(); }
    },
    async resetPhoto(i) {
      const im = this.schema.images[i];
      const map = { ...val(this.rows, 'images', {}) }; delete map[im.url];
      if (await this.save('images', map)) Danubra.renderRoute();
    },

    // ── Texty ─────────────────────────────────────────────────────────────
    pagesOf(site) {
      const s = (this.schema && this.schema.sites && this.schema.sites[site]) || {};
      const names = site === 'sk' ? PAGE_SK : PAGE_EU;
      return Object.keys(s).map((k) => [k, k.startsWith('trade:') ? `Remeslo: ${TRADE[k.slice(6)] || k.slice(6)}` : (names[k] || k)]);
    },
    textsHtml() {
      if (!this.schema) return UI.empty('edit', 'Texty sa nenačítali', 'Skúste obnoviť stránku.');
      const x = this.tx;
      const g = this.schema.sites[x.site][x.page] || this.schema.sites[x.site].home;
      if (!g.langs.includes(x.lang)) x.lang = g.langs[0];
      return `<div class="card card-pad">
        <div class="form-grid">
          ${UI.field('site', 'Web', { value: x.site, options: [['sk', 'punds.sk'], ['eu', 'punds.eu']], onchange: "Web.setTx('site', this.value)" })}
          ${UI.field('page', 'Stránka', { value: x.page, options: this.pagesOf(x.site), onchange: "Web.setTx('page', this.value)" })}
          ${UI.field('lang', 'Jazyk', { value: x.lang, options: g.langs.map((l) => [l, LANG[l] || l]), onchange: "Web.setTx('lang', this.value)" })}
          <label class="fld"><span>Hľadať</span><input type="search" value="${UI.esc(x.q)}" placeholder="slovo z textu…" oninput="Web.tx.q=this.value;Web.paintTexts()"></label>
        </div>
        <p class="card-note">Prepíšte, čo treba. Prázdne = pôvodný text. Značky ako &lt;b&gt;, &lt;br&gt; a {PHONE} nechajte tak.
          ${x.lang === SRC[x.site] ? 'Po uložení môžete zmeny preložiť do ostatných jazykov.' : ''}</p>
        <div class="js-acts"><button class="btn btn-primary btn-sm" onclick="Web.saveTexts()">Uložiť texty</button>
          ${x.lang === SRC[x.site] ? `<button class="btn btn-outline btn-sm" id="web-tr" onclick="Web.translatePage()">${Icon('repeat', 14)} Preložiť zmeny do ostatných jazykov</button>` : ''}
          <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${webUrl(x.site, x.lang)}">${Icon('site', 14)} Otvoriť web</a></div>
        <div id="web-fields" class="web-fields"></div></div>`;
    },
    setTx(k, v) { this.tx[k] = v; if (k === 'site') { this.tx.page = 'home'; this.tx.lang = SRC[v]; } Danubra.renderRoute(); },
    overKey() { return `texts:${this.tx.site}:${this.tx.page}`; },
    paintTexts() {
      const box = document.getElementById('web-fields');
      if (!box || !this.schema) return;
      const x = this.tx;
      const g = this.schema.sites[x.site][x.page];
      const base = (g && g.fields[x.lang]) || {};
      const over = (val(this.rows, this.overKey(), {})[x.lang]) || {};
      const q = x.q.trim().toLowerCase();
      const items = Object.entries(base).filter(([p, t]) => !q || t.toLowerCase().includes(q) || String(over[p] || '').toLowerCase().includes(q) || p.toLowerCase().includes(q));
      box.innerHTML = items.length ? items.map(([p, t]) => {
        const long = t.length > 90 || /<|\n/.test(t);
        const v = over[p] != null ? over[p] : t;
        return `<label class="web-field${over[p] != null && over[p] !== t ? ' is-changed' : ''}"><span class="web-path">${UI.esc(p)}</span>
          ${long ? `<textarea data-path="${UI.esc(p)}" rows="${Math.min(8, Math.ceil(t.length / 90) + 1)}">${UI.esc(v)}</textarea>`
            : `<input data-path="${UI.esc(p)}" value="${UI.esc(v)}">`}
          ${over[p] != null && over[p] !== t ? `<small class="web-orig">Pôvodne: ${UI.esc(t)}</small>` : ''}</label>`;
      }).join('') : '<div class="js-empty">Nič sa nenašlo.</div>';
    },
    async saveTexts() {
      const x = this.tx;
      const base = this.schema.sites[x.site][x.page].fields[x.lang] || {};
      const all = { ...(val(this.rows, this.overKey(), {})) };
      const cur = { ...(all[x.lang] || {}) };
      document.querySelectorAll('#web-fields [data-path]').forEach((el) => {
        const p = el.getAttribute('data-path'), v = el.value;
        if (!v.trim() || v === base[p]) delete cur[p]; else cur[p] = v;
      });
      all[x.lang] = cur;
      if (await this.save(this.overKey(), all)) { UI.toast(`Uložené (${Object.keys(cur).length} zmenených textov) — na webe do 5 minút`, 'ok'); this.paintTexts(); }
    },
    async translatePage() {
      const x = this.tx;
      await this.saveTexts();
      const all = { ...(val(this.rows, this.overKey(), {})) };
      const src = all[x.lang] || {};
      if (!Object.keys(src).length) return UI.toast('V tomto jazyku zatiaľ nie je nič zmenené', 'err');
      const langs = this.schema.sites[x.site][x.page].langs.filter((l) => l !== x.lang);
      const r = await this.translate(src, x.lang, langs, document.getElementById('web-tr'));
      if (!r) return;
      for (const [l, t] of Object.entries(r)) all[l] = { ...(all[l] || {}), ...t };
      if (await this.save(this.overKey(), all)) UI.toast(`Preložené do: ${Object.keys(r).map((l) => l.toUpperCase()).join(', ')} — skontrolujte`, 'ok');
    },

    /** Preklad cez Claude (punds-translate, režim texty). */
    async translate(texts, from, langs, btn) {
      const label = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Prekladám…'; }
      try {
        const { data: s } = await DB.client.auth.getSession();
        const res = await fetch('/.netlify/functions/punds-translate', { method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(s && s.session && s.session.access_token) || ''}` },
          body: JSON.stringify({ texts, from, langs }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.texts) throw new Error(j.error || `Chyba ${res.status}`);
        return j.texts;
      } catch (e) { UI.toast(e.message, 'err'); return null; }
      finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
    },
  };

  window.Web = Web;
  Danubra.views.website = function (el) { return Web.view(el); };
})();
