// ============================================================================
// DANUBRA — Marketing → Oslovovanie → Odkazy od kolegov
// ============================================================================
// „Potrebujem formulár, kde kolegovia aj bez prihlásenia pridajú odkazy na
// firmy, a v appke sa to zbiera — v Oslovovaní ako ‚Odkazy od kolegov'.
// Pošlem im to ako bojovú úlohu."
//
//   Link pre kolegov  (len admin) adresa verejného formulára app/odkazy.html
//                     s tajným kľúčom v kotve, Kopírovať, WhatsApp, hotová
//                     správa (text od majiteľa), Vypnúť / Zapnúť zber,
//                     Vygenerovať nový link (starý prestane platiť). Kľúč je
//                     v danubra_settings.marketing.tips (zápis len admin, 030).
//   Rebríček          kolegovia podľa toho, koľko firiem poslali, koľko sme
//                     pridali a koľko sa stalo odberateľmi
//   zoznam (DataList) firma, vzťah, čo sme robili a kontakt, kto poslal,
//                     čo sme zistili z webu, stav; filtre vzťah a kolega;
//                     výber viacerých → Pridať vybrané / Použiť ako vzor
//   akcie             Pridať do Nových firiem (zdroj „kolega", známe dobré
//                     firmy s palcom hore), Otvoriť firmu, Zamietnuť (nič sa
//                     nemaže), Nájsť web (len Google hľadanie v novom okne —
//                     nič platené) a vloženie webu, Použiť ako vzor na hľadanie
//
// Logika je v lib/marketing/tips.js (testy). Verejný príjem: danubra-lead-tip,
// údaje z webu: danubra-lead-tips-enrich-background (zadarmo, bez AI).
// ============================================================================
(function () {
  const T = () => window.DanubraTips;
  const SD = () => window.DanubraSeeds;
  const ENRICH = '/.netlify/functions/danubra-lead-tips-enrich-background';
  const COLS = 'id,batch_id,company_name,url,kind,website,domain,profile_url,city,relation,what_we_did,contact,unsure,submitted_by_name,'
    + 'status,reject_reason,lead_id,duplicate_of_lead_id,duplicate_of_partner_id,duplicate_of_tip_id,meta,checked_at,created_at,reviewed_at,reviewed_by,archived_at';

  async function token() {
    try { const { data } = await DB.client.auth.getSession(); return (data && data.session && data.session.access_token) || ''; }
    catch (e) { return ''; }
  }

  const LeadTips = {
    rows: [], loaded: false, missing: false, sel: new Set(),

    async load() {
      try {
        const r = await DB.list('lead_tips', { select: COLS, order: { column: 'created_at', ascending: false }, limit: 5000 });
        this.missing = !!(r && r.error);
        // Kým nie je migrácia 085, tabuľka nie je — nehlási sa to ako „časť údajov sa nenačítala".
        if (r && r.error && Array.isArray(DB.failures)) DB.failures = DB.failures.filter(f => !/lead_tips/.test(f.table));
        this.rows = ((r && r.data) || []).filter(x => !x.archived_at);
      } catch (e) { this.missing = true; this.rows = []; }
      const ids = new Set(this.rows.map(r => r.id));
      this.sel = new Set([...this.sel].filter(id => ids.has(id)));
      this.loaded = true;
    },
    async ensure(force) { if (force || !this.loaded) await this.load(); },
    newCount() { return this.rows.filter(r => r.status === 'new').length; },
    tip(id) { return this.rows.find(r => r.id === id) || null; },
    leads() { return (window.Lead && Lead.rows) || []; },
    partners() { return (window.Lead && Lead.partners) || []; },
    cfg() { return (window.Danubra && Danubra.cfg('marketing').tips) || {}; },
    link() { const c = this.cfg(); return c.token ? T().linkFor(location.origin, c.token) : ''; },
    who(uid) { const m = (Danubra.members || []).find(x => x.user_id === uid); return m ? (m.full_name || m.email || '') : ''; },
    refresh() { if (Danubra.route === 'outreach' && window.Outreach && Outreach.tab === 'tips') Danubra.renderRoute(); },

    // ── Obrazovka (záložka v Oslovovaní) ─────────────────────────────────
    html() {
      if (this.missing) {
        return `<div class="warnbox">${Icon('alert', 14)} Odkazy od kolegov ešte nie sú pripravené v databáze — treba spustiť migráciu 085.</div>`;
      }
      this.autoEnrich();
      return `${Danubra.isAdmin() ? this.adminHtml() : (this.cfg().enabled ? '<p class="card-note">Link na formulár pre kolegov spravuje administrátor.</p>' : '')}
        <div class="lt-top">${this.boardHtml()}</div>
        ${this.seedsHtml()}
        <div id="lt-bulk" aria-live="polite">${this.bulkHtml()}</div>
        ${DataList.html(this.config(this.rows))}`;
    },

    adminHtml() {
      const c = this.cfg();
      if (!c.token) {
        return `<section class="card card-pad lt-admin" aria-label="Link pre kolegov">
          <div class="card-head"><div class="card-title">Link pre kolegov${UI.tip('Verejný formulár bez prihlásenia: kolega zadá svoje meno a firmy (názov, web alebo profil, vzťah, čo sme robili, kontakt). Firmy sa zbierajú tu. Prístup dáva tajný kľúč v odkaze — kto odkaz nemá, formulár neotvorí. Odkaz môžete kedykoľvek vypnúť alebo vymeniť.')}</div></div>
          <p class="card-note">Zber firiem od kolegov ešte nie je zapnutý.</p>
          <div class="btn-row"><button type="button" class="btn btn-primary btn-sm" onclick="LeadTips.enable()">${Icon('link', 14)} Zapnúť zber a vytvoriť link</button></div>
        </section>`;
      }
      const link = this.link();
      const text = T().shareText(link);
      return `<section class="card card-pad lt-admin" aria-label="Link pre kolegov">
        <div class="card-head"><div class="card-title">Link pre kolegov ${c.enabled ? UI.badge('Zber beží', 'green') : UI.badge('Zber je vypnutý', 'gray')}${
          UI.tip('Kľúč je v odkaze za znakom # — prehliadač ho neposiela v adrese, takže nie je v záznamoch servera ani v odkazoch na iné weby. Formulár ho pošle len pri odoslaní. „Vygenerovať nový link" urobí nový kľúč a starý odkaz prestane platiť.')}</div></div>
        <div class="lt-link"><input type="text" readonly value="${UI.esc(link)}" aria-label="Link pre kolegov" onfocus="this.select()">
          <button type="button" class="btn btn-outline btn-sm" data-copy="${UI.esc(link)}" data-what="Link" onclick="LeadTips.copy(this)">${Icon('copy', 14)} Kopírovať</button></div>
        <div class="fld-full lt-msg">${UI.field('lt_text', 'Správa pre kolegov (bojová úloha)', { type: 'textarea', rows: 11, value: text,
          tip: 'Hotový text s Vaším odkazom. Pred odoslaním ho môžete upraviť — úprava sa neukladá, slúži len na skopírovanie alebo WhatsApp.' })}</div>
        <div class="btn-row">
          <button type="button" class="btn btn-primary btn-sm" onclick="LeadTips.copyText()">${Icon('copy', 14)} Kopírovať správu</button>
          <button type="button" class="btn btn-outline btn-sm" onclick="LeadTips.whatsapp()">${Icon('whatsapp', 14)} Poslať cez WhatsApp</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="LeadTips.toggle()">${Icon(c.enabled ? 'stop' : 'check', 14)} ${c.enabled ? 'Vypnúť zber' : 'Zapnúť zber'}</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="LeadTips.rotate()">${Icon('repeat', 14)} Vygenerovať nový link</button>
        </div>
        ${c.created_at ? `<p class="card-note">Link vytvorený ${UI.esc(UI.date(c.created_at))}.</p>` : ''}
      </section>`;
    },

    boardHtml() {
      const board = T().leaderboard(this.rows, this.leads());
      if (!board.length) return '';
      return `<section class="card card-pad lt-board" aria-label="Rebríček kolegov">
        <div class="card-head"><div class="card-title">Rebríček${UI.tip('Kolegovia podľa toho, koľko ich firiem sa stalo odberateľmi, koľko sme pridali do Nových firiem, koľko bolo nových (nie duplicita ani zamietnutá) a koľko poslali spolu. Meno sa berie tak, ako ho kolega napísal do formulára.')}</div></div>
        <table class="otl-stats lt-board-t"><thead><tr><th>#</th><th>Kolega</th><th class="num">Firiem</th><th class="num">Nových</th><th class="num">Pridaných</th><th class="num">Odberatelia</th></tr></thead><tbody>
        ${board.slice(0, 10).map((r, i) => `<tr><td>${i + 1}.</td><td><button type="button" class="lt-who" data-name="${UI.esc(r.name)}" onclick="LeadTips.byPerson(this.dataset.name)">${UI.esc(r.name)}</button></td>
          <td class="num">${r.tips}</td><td class="num">${r.fresh}</td><td class="num">${r.added}</td><td class="num">${r.won}</td></tr>`).join('')}
        </tbody></table></section>`;
    },

    /** Firmy, s ktorými sme robili (aj u Denisa), s webom — najlepší vzor na hľadanie podobných. */
    knownGood() { return this.rows.filter(t => T().KNOWN_GOOD.includes(t.relation) && t.status !== 'rejected' && this.webOf(t)); },
    seedsHtml() {
      const n = this.knownGood().length;
      if (!n) return '';
      return `<div class="btn-row lt-seeds"><button type="button" class="btn btn-outline btn-sm" onclick="LeadTips.useAsSeeds(LeadTips.knownGood().map(t => t.id))">${Icon('star', 14)} Hľadať firmy podobné tým, s ktorými sme robili (${n})</button>${
        UI.tip(`Weby firiem, pri ktorých kolega napísal „Spolupracovali sme" alebo „Robilo sa u Denisa", sa vložia do okna „Hľadať podobné firmy" (najviac ${SD().MAX_SEEDS}). Známe dobré firmy sú najlepší vzor.`)}</div>`;
    },

    bulkHtml() {
      const n = this.sel.size;
      if (!n) return '';
      const tips = [...this.sel].map(id => this.tip(id)).filter(Boolean);
      const add = tips.filter(t => t.status === 'new').length;
      const web = tips.filter(t => this.webOf(t)).length;
      return `<div class="lt-bulk card card-pad"><b>Vybrané: ${n}</b>
        <button type="button" class="btn btn-primary btn-sm" onclick="LeadTips.addSelected()"${add ? '' : ' disabled'}>${Icon('plus', 14)} Pridať vybrané (${add})</button>
        <button type="button" class="btn btn-outline btn-sm" onclick="LeadTips.useAsSeeds([...LeadTips.sel])"${web ? '' : ' disabled'}>${Icon('search', 14)} Použiť ako vzor na hľadanie (${web})</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="LeadTips.clearSel()">Zrušiť výber</button></div>`;
    },
    paintBulk() { const el = document.getElementById('lt-bulk'); if (el) el.innerHTML = this.bulkHtml(); },
    pick(cb) {
      const id = cb.getAttribute('data-tip');
      if (cb.checked) this.sel.add(id); else this.sel.delete(id);
      this.paintBulk();
    },
    clearSel() { this.sel.clear(); this.paintBulk(); document.querySelectorAll('input[data-tip]').forEach(i => { i.checked = false; }); },
    byPerson(name) { DataList.set('odkazy-kolegov', 'kolega', name); },

    webOf(t) { return t ? (t.website || (t.kind === 'web' ? T().origin(t.url) : null)) : null; },
    leadName(id) { const l = this.leads().find(x => x.id === id); return l ? l.name : ''; },
    partnerName(id) { const p = this.partners().find(x => x.id === id); return p ? p.name : ''; },
    targetOf(t) {
      if (t.lead_id) return { kind: 'lead', id: t.lead_id, name: this.leadName(t.lead_id) };
      if (t.duplicate_of_lead_id) return { kind: 'lead', id: t.duplicate_of_lead_id, name: this.leadName(t.duplicate_of_lead_id) };
      if (t.duplicate_of_partner_id) return { kind: 'partner', id: t.duplicate_of_partner_id, name: this.partnerName(t.duplicate_of_partner_id) };
      return null;
    },

    foundHtml(t) {
      const m = t.meta || {};
      if (this.webOf(t) && !t.checked_at) return '<span class="dl-note is-mute">údaje z webu sa sťahujú…</span>';
      if (!this.webOf(t)) {
        return `<span class="dl-two"><span class="dl-note is-mute">${t.kind === 'profile' ? 'len profil, bez webu' : t.kind === 'maps' ? 'len Mapy, bez webu' : 'bez webu'}</span>
          <button type="button" class="btn btn-ghost btn-sm lt-find" onclick="event.stopPropagation();LeadTips.findWeb('${t.id}')">${Icon('search', 12)} Nájsť web</button></span>`;
      }
      const bits = [m.email, m.phone, [m.postal_code, m.city].filter(Boolean).join(' ')].filter(Boolean);
      if (!bits.length) return `<span class="dl-note ${m.error ? 'is-amber' : 'is-mute'}">${m.error ? 'web neodpovedá' : 'na webe sme kontakt nenašli'}</span>`;
      return `<span class="dl-two is-wrap"><b>${UI.esc(bits[0])}</b>${bits.slice(1).map(b => `<small>${UI.esc(b)}</small>`).join('')}${m.konatel ? `<small>konateľ ${UI.esc(m.konatel)}</small>` : ''}</span>`;
    },
    stateHtml(t) {
      const st = T().statusOf(t.status);
      const tg = this.targetOf(t);
      const sub = t.status === 'rejected' ? (t.reject_reason || '') : t.status === 'duplicate'
        ? (t.duplicate_of_partner_id ? `odberateľ ${tg && tg.name ? tg.name : ''}` : tg && tg.name ? `máme: ${tg.name}` : t.duplicate_of_tip_id ? 'už ju poslal kolega' : '')
        : t.status === 'added' && t.reviewed_by ? `pridal(a) ${this.who(t.reviewed_by)}` : '';
      return `<span class="dl-two">${UI.badge(st[1], st[2])}${sub ? `<small>${UI.esc(sub)}</small>` : ''}</span>`;
    },
    logo(t) {
      const m = t.meta || {};
      const fake = { name: T().tipName(t) || t.company_name, website: this.webOf(t), logo_url: m.logo || null };
      return window.Lead && Lead.logoHtml ? Lead.logoHtml(fake, 30) : '';
    },

    /** Konfigurácia zoznamu pre `DataList`. */
    config(rows) {
      const REL = T().RELATIONS;
      const relOf = (k) => T().relationOf(k);
      const host = (t) => (this.webOf(t) ? SD().hostOf(this.webOf(t)) : t.kind === 'maps' ? 'Google Mapy' : t.url ? SD().hostOf(t.url) : '');
      return {
        id: 'odkazy-kolegov', storageKey: 'oslovovanie-odkazy', label: 'Odkazy od kolegov',
        noun: ['firma', 'firmy', 'firiem'],
        rows,
        rowClick: (r) => this.detail(r.id),
        rowClass: (r) => (r.status === 'rejected' ? 'is-muted' : r.status === 'duplicate' ? 'is-muted' : ''),
        rowLabel: (r) => `Firma od kolegu ${r.company_name}`,
        rowActions: [
          { ico: 'plus', label: 'Pridať do Nových firiem', show: (r) => r.status === 'new', run: (r) => this.add(r.id) },
          { ico: 'chevron', label: 'Otvoriť firmu', show: (r) => !!this.targetOf(r), run: (r) => this.open(r.id) },
          { ico: 'star', label: 'Použiť ako vzor na hľadanie', show: (r) => !!this.webOf(r) && T().KNOWN_GOOD.includes(r.relation), run: (r) => this.useAsSeeds([r.id]) },
          { ico: 'search', label: 'Nájsť web (Google)', show: (r) => !this.webOf(r) && r.status !== 'rejected', run: (r) => this.findWeb(r.id) },
          { ico: 'x', label: 'Zamietnuť', show: (r) => ['new', 'duplicate'].includes(r.status), run: (r) => this.reject(r.id) },
        ],
        columns: [
          { key: 'vyber', label: 'Výber', width: '34px', align: 'center', csv: false, mobileLabel: 'výber',
            render: (r) => `<input type="checkbox" data-tip="${UI.esc(r.id)}" aria-label="Vybrať ${UI.esc(r.company_name)}"${this.sel.has(r.id) ? ' checked' : ''} onclick="event.stopPropagation()" onchange="LeadTips.pick(this)">` },
          { key: 'firma', label: 'Firma', width: 'minmax(180px, 1.4fr)', mobile: 'title',
            render: (r) => `<span class="ld-who">${this.logo(r)}<span class="dl-title"><b>${UI.esc(r.company_name)}</b><small>${UI.esc([r.city || (r.meta && r.meta.city), host(r)].filter(Boolean).join(' · ') || '—')}</small></span></span>`,
            sortValue: (r) => r.company_name, csv: (r) => r.company_name },
          { key: 'vztah', label: 'Vzťah', width: '182px', mobileLabel: 'vzťah',
            render: (r) => { const x = relOf(r.relation); return `<span class="dl-two">${x ? UI.badge(x[1], x[2]) : '<span class="dl-note is-mute">neuvedené</span>'}${r.unsure ? '<small class="dl-note is-amber">nie je si istý</small>' : ''}</span>`; },
            sortValue: (r) => (r.relation ? REL.findIndex(x => x[0] === r.relation) : 9), csv: (r) => (relOf(r.relation) || [null, ''])[1] },
          { key: 'robili', label: 'Čo sme robili · kontakt', width: 'minmax(190px, 1.8fr)', mobile: 'line',
            render: (r) => (r.what_we_did || r.contact ? `<span class="dl-two is-wrap">${r.what_we_did ? `<b title="${UI.esc(r.what_we_did)}">${UI.esc(r.what_we_did)}</b>` : ''}${r.contact ? `<small>Kontakt: ${UI.esc(r.contact)}</small>` : ''}</span>` : ''),
            sortValue: (r) => r.what_we_did || null, csv: (r) => [r.what_we_did, r.contact && `Kontakt: ${r.contact}`].filter(Boolean).join(' · ') },
          { key: 'kto', label: 'Kto poslal', width: '108px', mobileLabel: 'poslal',
            render: (r) => `<span class="dl-two"><b>${UI.esc(r.submitted_by_name)}</b><small>${UI.esc(DanubraDataList.fmtDay(r.created_at))}</small></span>`,
            sortValue: (r) => r.created_at, sortDir: -1, csv: (r) => r.submitted_by_name },
          { key: 'zistili', label: 'Čo sme zistili', width: 'minmax(150px, 1.1fr)', hideBelow: 1000, mobileLabel: 'zistili',
            tip: 'Z webu firmy (úvodná stránka a Impressum) appka sama zistí e-mail, telefón, adresu a konateľa — zadarmo, bez AI. Pri profile (LinkedIn, Facebook) alebo Mapách web nemáme: „Nájsť web" otvorí hľadanie Google a web vložíte do odkazu.',
            render: (r) => this.foundHtml(r), csv: (r) => [r.meta && r.meta.email, r.meta && r.meta.phone, r.meta && r.meta.city].filter(Boolean).join(', ') },
          { key: 'stav', label: 'Stav', width: '118px', mobile: 'badge',
            render: (r) => this.stateHtml(r), sortValue: (r) => ['new', 'duplicate', 'added', 'rejected'].indexOf(r.status), csv: (r) => T().statusOf(r.status)[1] },
        ],
        sort: { key: 'kto', dir: -1 },
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať firmu, mesto, kolegu…', label: 'Hľadať firmu',
            fields: ['company_name', 'city', 'domain', 'submitted_by_name', 'what_we_did', 'contact', 'url'] },
          { key: 'stav', type: 'multi', label: 'Stav', value: 'status', options: T().STATUS.map(s => [s[0], s[1]]), sortOptions: false, allLabel: 'Všetky',
            hint: 'Nový = čaká na Vás. Pridaný = je v Nových firmách. Duplicita = firmu už máme (medzi novými firmami, odberateľmi alebo ju poslal iný kolega). Zamietnutý = nechceme.' },
          { key: 'vztah', type: 'multi', label: 'Vzťah', value: (r) => r.relation || 'none', options: [...REL.map(x => [x[0], x[1]]), ['none', 'Neuvedené']], sortOptions: false, allLabel: 'Všetky',
            hint: 'Spolupracovali sme a Robilo sa u Denisa = známe dobré firmy: pri pridaní dostanú palec hore a sú najlepší vzor na hľadanie podobných.' },
          { key: 'kolega', type: 'select', label: 'Kolega', value: 'submitted_by_name', allLabel: 'Všetci kolegovia' },
          { key: 'bezwebu', type: 'toggle', label: 'Bez webu', test: (r) => !this.webOf(r), more: true,
            hint: 'Firmy, pri ktorých kolega nedal web (len názov, profil alebo Mapy). Kliknite „Nájsť web".' },
          { key: 'neisti', type: 'toggle', label: 'Kolega si nie je istý', test: (r) => !!r.unsure, more: true },
        ],
        empty: { ico: 'link', title: 'Zatiaľ žiadne firmy od kolegov', sub: Danubra.isAdmin() ? 'Pošlite kolegom link z rámika hore — firmy, ktoré zadajú, sa objavia tu.' : 'Keď kolegovia pošlú firmy cez formulár, objavia sa tu.' },
        export: { name: ['odkazy-od-kolegov'],
          columns: [['Firma', r => r.company_name], ['Mesto', r => r.city || (r.meta && r.meta.city) || ''], ['Web', r => this.webOf(r) || ''],
            ['Odkaz', r => r.url || ''], ['Vzťah', r => (relOf(r.relation) || [null, ''])[1]], ['Nie je si istý', r => (r.unsure ? 'áno' : '')],
            ['Čo sme robili', r => r.what_we_did || ''], ['Kontakt', r => r.contact || ''], ['Poslal', r => r.submitted_by_name],
            ['Kedy', r => String(r.created_at || '').slice(0, 10)], ['Stav', r => T().statusOf(r.status)[1]],
            ['E-mail (web)', r => (r.meta && r.meta.email) || ''], ['Telefón (web)', r => (r.meta && r.meta.phone) || ''], ['Konateľ', r => (r.meta && r.meta.konatel) || '']] },
      };
    },

    // ── Detail odkazu ────────────────────────────────────────────────────
    detail(id) {
      const t = this.tip(id);
      if (!t) return;
      const rel = T().relationOf(t.relation);
      const m = t.meta || {};
      const web = this.webOf(t);
      const tg = this.targetOf(t);
      const row = (k, v) => (v ? `<div class="lt-kv"><span>${k}</span><b>${v}</b></div>` : '');
      const a = (u) => `<a href="${UI.esc(u)}" target="_blank" rel="noopener noreferrer">${UI.esc(SD().hostOf(u) || u)}</a>`;
      UI.modal(t.company_name, `<div class="lt-detail">
        <div class="lt-kvs">
          ${row('Vzťah', rel ? `${UI.badge(rel[1], rel[2])}${t.unsure ? ' <small class="dl-note is-amber">kolega si nie je úplne istý</small>' : ''}` : '')}
          ${row('Čo sme spolu robili', UI.esc(t.what_we_did || ''))}
          ${row('Kontakt', UI.esc(t.contact || ''))}
          ${row('Mesto', UI.esc(t.city || m.city || ''))}
          ${row('Poslal', UI.esc(T().tipLabel(t.submitted_by_name, t.created_at).replace(/^Tip od: /, '')))}
          ${row('Odkaz', t.url ? a(t.url) : '')}
          ${row('Web firmy', web ? a(web) : '')}
          ${row('Zo stránky', UI.esc([m.company, m.email, m.phone, m.address, [m.postal_code, m.city].filter(Boolean).join(' '), m.konatel && `konateľ ${m.konatel}`].filter(Boolean).join(' · ')))}
          ${row('Stav', this.stateHtml(t))}
        </div>
        ${t.status !== 'rejected' ? `<div class="form-section">Web firmy${UI.tip('Len web firmy (nie LinkedIn ani Facebook). Z neho appka zistí e-mail, telefón, adresu a konateľa — zadarmo. „Nájsť web" otvorí hľadanie Google v novom okne; adresu skopírujte sem.')}</div>
        <form id="lt-web" class="lt-web" onsubmit="event.preventDefault();LeadTips.saveWebsite('${t.id}')">
          <input type="text" name="website" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="napr. mueller-bau.de" value="${UI.esc(web || '')}" aria-label="Web firmy">
          <button type="button" class="btn btn-ghost btn-sm" onclick="window.open(DanubraTips.searchUrl(LeadTips.tip('${t.id}')), '_blank', 'noopener')">${Icon('search', 14)} Nájsť web</button>
          <button type="submit" class="btn btn-outline btn-sm">${Icon('check', 14)} Uložiť web</button>
        </form>` : ''}
        <div class="modal-actions">
          ${t.status === 'new' ? `<button type="button" class="btn btn-primary" onclick="LeadTips.add('${t.id}')">${Icon('plus', 14)} Pridať do Nových firiem</button>` : ''}
          ${tg ? `<button type="button" class="btn btn-outline" onclick="LeadTips.open('${t.id}')">${Icon('chevron', 14)} Otvoriť firmu</button>` : ''}
          ${web ? `<button type="button" class="btn btn-outline" onclick="LeadTips.useAsSeeds(['${t.id}'])">${Icon('star', 14)} Použiť ako vzor na hľadanie</button>` : ''}
          ${['new', 'duplicate'].includes(t.status) ? `<button type="button" class="btn btn-ghost" onclick="LeadTips.reject('${t.id}')">${Icon('x', 14)} Zamietnuť</button>` : ''}
          <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
        </div></div>`, { wide: true });
    },

    findWeb(id) {
      const t = this.tip(id);
      if (!t) return;
      try { window.open(T().searchUrl(t), '_blank', 'noopener'); } catch (e) { /* blokované okno */ }
      this.detail(id);
      const i = document.querySelector('#lt-web [name=website]');
      if (i) i.focus();
    },

    async saveWebsite(id) {
      const t = this.tip(id);
      const f = document.getElementById('lt-web');
      if (!t || !f) return null;
      const n = T().normalize(f.querySelector('[name=website]').value);
      if (!n.ok) return UI.toast(n.error, 'err');
      if (n.kind !== 'web') return UI.toast('To nie je web firmy — vložte adresu ich vlastného webu (nie LinkedIn, Facebook ani Mapy)', 'err');
      const website = T().origin(n.url);
      const patch = { website, domain: n.domain, checked_at: null };
      const dup = t.status === 'new' ? T().duplicateOf({ id: t.id, company_name: t.company_name, city: t.city, domain: n.domain },
        { leads: this.leads(), partners: this.partners(), tips: this.rows }) : null;
      if (dup) Object.assign(patch, { status: 'duplicate', duplicate_of_lead_id: dup.kind === 'lead' ? dup.id : dup.lead_id || null,
        duplicate_of_partner_id: dup.kind === 'partner' ? dup.id : dup.partner_id || null, duplicate_of_tip_id: dup.kind === 'tip' ? dup.id : null });
      const { error } = await DB.update('lead_tips', id, patch);
      if (error) return UI.toast(`Neuložené: ${error.message}`, 'err');
      Object.assign(t, patch);
      UI.closeModal();
      UI.toast(dup ? `Web uložený — firmu už máme (${dup.why})` : 'Web uložený — údaje z webu sa načítajú o chvíľu', 'ok');
      if (!dup) this.enrich([id]);
      this.refresh();
      return null;
    },

    /** Údaje z webov (server, zadarmo). `ids` = vybrané, inak všetky bez údajov. */
    async enrich(ids) {
      try {
        const x = await fetch(ENRICH, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
          body: JSON.stringify(ids ? { tip_ids: ids } : {}) });
        if (!x.ok && x.status !== 202) return;
      } catch (e) { return; }
      clearTimeout(this._enT);
      this._enT = setTimeout(async () => { await this.load(); this.refresh(); }, 15000);
    },
    /** Odkazy s webom bez údajov (napr. server ich po odoslaní nestihol) — doplní sa raz za otvorenie appky. */
    autoEnrich() {
      if (this._autoDone) return;
      const old = Date.now() - 3 * 60000;
      if (!this.rows.some(t => t.website && !t.checked_at && Date.parse(t.created_at || '') < old)) return;
      this._autoDone = true;
      this.enrich(null);
    },

    // ── Pridať do Nových firiem ──────────────────────────────────────────
    /** Jeden odkaz → nová firma. @returns {Promise<{ id?, dup?, error? }>} */
    async addOne(t) {
      const by = (Danubra.user && Danubra.user.id) || null;
      const row = T().tipToLead(t, { by });
      if (!row) return { error: 'Firma nemá názov' };
      const dup = T().duplicateOf({ company_name: row.name, city: row.city, domain: row.website ? SD().baseDomain(row.website) : null },
        { leads: this.leads(), partners: this.partners() });
      const now = new Date().toISOString();
      if (dup) {
        const patch = { status: 'duplicate', duplicate_of_lead_id: dup.kind === 'lead' ? dup.id : null,
          duplicate_of_partner_id: dup.kind === 'partner' ? dup.id : null, reviewed_at: now, reviewed_by: by };
        const { error } = await DB.update('lead_tips', t.id, patch);
        if (!error) Object.assign(t, patch);
        return { dup };
      }
      let r = await DB.insert('leads', row);
      // Databáza bez 082 (logá) — firma sa uloží bez týchto stĺpcov.
      if (r.error && window.DanubraSiteMeta && DanubraSiteMeta.missing082(r.error)) r = await DB.insert('leads', DanubraSiteMeta.without082(row));
      if (r.error) {
        return { error: /duplicate key|23505/.test(`${r.error.code} ${r.error.message}`) ? 'Firma s rovnakým menom a mestom už je medzi novými firmami' : r.error.message };
      }
      const lead = r.data;
      const patch = { status: 'added', lead_id: lead.id, reviewed_at: now, reviewed_by: by };
      const u = await DB.update('lead_tips', t.id, patch);
      if (!u.error) Object.assign(t, patch);
      if (window.Lead && Array.isArray(Lead.rows)) Lead.rows.unshift(lead);
      return { id: lead.id, website: lead.website };
    },

    async add(id) {
      const t = this.tip(id);
      if (!t || t.status !== 'new') return null;
      if (window.Lead && !Lead.loaded) await Lead.load();
      const r = await this.addOne(t);
      if (r.error) return UI.toast(r.error, 'err');
      UI.closeModal();
      if (r.dup) { UI.toast(`Firmu už máme (${r.dup.why}) — odkaz je označený ako duplicita`, 'ok'); this.refresh(); return null; }
      if (r.website && window.Lead && Lead.callSiteMeta) Lead.callSiteMeta({ lead_ids: [r.id] }).catch(() => null);
      UI.toast('Firma je v Nových firmách', 'ok');
      this.refresh();
      if (window.Lead) Lead.detail(r.id);
      return null;
    },

    async addSelected() {
      const tips = [...this.sel].map(id => this.tip(id)).filter(t => t && t.status === 'new');
      if (!tips.length) return UI.toast('Vo výbere nie je žiadna nová firma', 'err');
      if (window.Lead && !Lead.loaded) await Lead.load();
      let added = 0, dups = 0, errs = 0;
      const ids = [];
      for (const t of tips) {
        const r = await this.addOne(t);
        if (r.error) errs++; else if (r.dup) dups++; else { added++; if (r.website) ids.push(r.id); }
      }
      if (ids.length && window.Lead && Lead.callSiteMeta) Lead.callSiteMeta({ lead_ids: ids.slice(0, 50) }).catch(() => null);
      this.sel.clear();
      UI.toast(`Pridané do Nových firiem: ${added}${dups ? ` · už sme mali: ${dups}` : ''}${errs ? ` · nepodarilo sa: ${errs}` : ''}`, errs ? 'err' : 'ok');
      this.refresh();
      return null;
    },

    open(id) {
      const t = this.tip(id);
      const tg = t && this.targetOf(t);
      if (!tg) return;
      UI.closeModal();
      if (tg.kind === 'partner') return Danubra.go('partners');
      if (window.Lead) {
        const go = () => Lead.detail(tg.id);
        if (!Lead.loaded) Lead.load().then(go); else go();
      }
      return null;
    },

    async reject(id) {
      const t = this.tip(id);
      if (!t) return;
      UI.modal(`Zamietnuť: ${t.company_name}`, `<form id="lt-rej" onsubmit="event.preventDefault();LeadTips.saveReject('${t.id}')">
        ${UI.field('reason', 'Prečo (nepovinné)', { placeholder: 'napr. robia len inštalácie, nie sú stavebná firma', tip: 'Odkaz sa nemaže — ostane v zozname so stavom Zamietnutý a dôvodom.' })}
        <div class="modal-actions"><button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Späť</button>
          <button type="submit" class="btn btn-primary">${Icon('x', 14)} Zamietnuť</button></div></form>`);
    },
    async saveReject(id) {
      const f = document.getElementById('lt-rej');
      const reason = f ? String(UI.formData(f).reason || '').trim().slice(0, 300) : '';
      const patch = { status: 'rejected', reject_reason: reason || null, reviewed_at: new Date().toISOString(), reviewed_by: (Danubra.user && Danubra.user.id) || null };
      const { error } = await DB.update('lead_tips', id, patch);
      if (error) return UI.toast(`Neuložené: ${error.message}`, 'err');
      Object.assign(this.tip(id) || {}, patch);
      this.sel.delete(id);
      UI.closeModal();
      UI.toast('Zamietnuté — odkaz ostáva v zozname', 'ok');
      this.refresh();
      return null;
    },

    /** Weby vybraných firiem → okno „Hľadať podobné firmy" (podľa webov). Firmy, s ktorými sme robili, sú najlepší vzor. */
    async useAsSeeds(ids) {
      const tips = (ids || []).map(id => this.tip(id)).filter(Boolean);
      const urls = [...new Set(tips.map(t => this.webOf(t)).filter(Boolean))].slice(0, SD().MAX_SEEDS);
      if (!urls.length) return UI.toast('Vybrané firmy nemajú web — vzor na hľadanie musí byť web firmy', 'err');
      if (!window.Lead) return null;
      if (!Lead.loaded) await Lead.load();
      UI.closeModal();
      Lead._urlsDraft = urls.join('\n');
      Lead._findMode = 'urls';
      Lead.findForm();
      if (urls.length < SD().MIN_SEEDS) UI.toast(`Na hľadanie treba aspoň ${SD().MIN_SEEDS} weby — doplňte ďalšie`, 'ok');
      return null;
    },

    // ── Link pre kolegov (admin) ─────────────────────────────────────────
    async saveCfg(patch) {
      if (!Danubra.isAdmin()) { UI.toast('Link pre kolegov mení administrátor', 'err'); return false; }
      const row = Danubra.cfgRow || {};
      if (!row.id) { UI.toast('Nastavenia firmy sa nenačítali — otvorte najprv Nastavenia', 'err'); return false; }
      const marketing = Danubra.cfg('marketing');
      const tips = { ...(marketing.tips || {}), ...patch };
      const { error } = await DB.update('settings', row.id, { marketing: { ...marketing, tips } });
      if (error) { UI.toast(`Neuložené: ${error.message}`, 'err'); return false; }
      const fresh = await Danubra.loadCfg(true);
      const ulozene = (fresh && fresh.marketing && fresh.marketing.tips) || {};
      if (ulozene.token !== tips.token || !!ulozene.enabled !== !!tips.enabled) { UI.toast('Neuložilo sa to — v databáze zostali staré hodnoty', 'err'); return false; }
      return true;
    },
    newToken() { return T().makeToken((b) => (window.crypto || window.msCrypto).getRandomValues(b)); },
    async enable() {
      if (await this.saveCfg({ token: this.newToken(), enabled: true, created_at: new Date().toISOString() })) {
        UI.toast('Zber je zapnutý — link môžete poslať kolegom', 'ok');
        Danubra.renderRoute();
      }
    },
    async toggle() {
      const on = !this.cfg().enabled;
      if (await this.saveCfg({ enabled: on })) { UI.toast(on ? 'Zber je zapnutý — link znova platí' : 'Zber je vypnutý — formulár nič neprijme', 'ok'); Danubra.renderRoute(); }
    },
    async rotate() {
      const ok = await UI.confirm('Vygenerovať nový link? Starý link prestane platiť — kolegom treba poslať nový.', { ok: 'Vygenerovať nový' });
      if (!ok) return;
      if (await this.saveCfg({ token: this.newToken(), enabled: true, created_at: new Date().toISOString() })) {
        UI.toast('Nový link je hotový — starý už neplatí', 'ok');
        Danubra.renderRoute();
      }
    },
    copy(btn) { return window.Lead && Lead.copy ? Lead.copy(btn) : null; },
    msgText() { const el = document.querySelector('.lt-msg textarea'); return el ? el.value : T().shareText(this.link()); },
    copyText() {
      const b = document.createElement('button');
      b.setAttribute('data-copy', this.msgText()); b.setAttribute('data-what', 'Správa');
      return this.copy(b);
    },
    whatsapp() { window.open(T().whatsappUrl(this.msgText()), '_blank', 'noopener'); },
  };

  window.LeadTips = LeadTips;
})();
