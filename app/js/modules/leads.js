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
//
// Google Mapy (Outscraper, 079): hľadanie podľa webov berie firmy z Máp,
// keď je na serveri OUTSCRAPER_API_KEY (appka sa pýta len áno/nie cez
// danubra-email-status). Pri firme hodnotenie, recenzie, stav (funguje /
// zatvorená), kedy overené; „Overiť znova" a „Overiť zobrazené" volajú
// danubra-leads-refresh-background. Pravidlá: lib/marketing/outscraper.js.
//
// Priebeh hľadania (080): počas hľadania pás „Hľadanie beží" v okne aj na
// obrazovke Nové firmy — percentá, kroky (hotové / práve / ešte nie), veta,
// posledné riadky logu, ako dlho beží, „Zastaviť" (cancel_requested). Číta
// sa každé 2 s; keď sa server 3 min neozve, „Hľadanie sa zrejme prerušilo".
// Po skončení súhrn a „Čo AI zistila". Model pásu: lib/marketing/progress.js.
//
// Učenie (080): palec hore / dole pri firme (v riadku aj na karte), pri palci
// dole voliteľný dôvod; hľadanie z toho berie príklady. Navrhované hľadania
// (danubra-leads-suggest, inak pravidlá), vzorové weby z odberateľov a firiem
// so záujmom, našepkávanie oblasti a kategórií: lib/marketing/learning.js.
//
// Logo a náhľad webu (082): v zozname logo firmy (uložené z jej webu, kým
// nie je, ikona webu cez službu Google s2/favicons; keď nič, iniciály na
// farbe podľa mena — nikdy rozbitý obrázok). „Obnoviť logá a náhľady"
// spustí danubra-leads-sitemeta-background (zadarmo, len stiahnutie webu
// firmy) a priebeh číta z databázy. Detail firmy je veľké okno: hore „na
// prvý pohľad" (kde je, ako ďaleko od nás a od najbližšej zákazky, telefón,
// web, e-mail, Google hodnotenie), krátky popis a „Čo sme zistili"
// (lib/marketing/leadview.js), lišta akcií a záložky Prehľad / Kontakty
// a oslovenie / Podrobnosti / Web (posledná záložka sa pamätá).
//
// Odkazy od kolegov (085): firma pridaná z odkazu má zdroj „od kolegu"
// a v zozname aj v detaile „Tip od: Jano, 31. 10." (js/modules/lead-tips.js).
// ============================================================================
(function () {
  const LL = () => window.DanubraLeads;
  const statusOf = (k) => LL().STATUS.find(s => s[0] === k) || LL().STATUS[0];
  // Hľadanie podľa webov zadaných firiem (lib/marketing/seeds.js, server
  // danubra-leads-from-urls-background).
  const SD = () => window.DanubraSeeds;
  const SOURCE = { outscraper: 'Google Mapy', urls: 'podľa webov', kolega: 'od kolegu', ai: 'AI', osm: 'mapa', manual: 'ručne' };
  /** „Tip od: Jano, 31. 10." pri firme od kolegu (085, lib/marketing/tips.js). */
  const tipLine = (r) => (r && r.tip_by && window.DanubraTips ? DanubraTips.tipLabel(r.tip_by, (r.profile && r.profile.tip && r.profile.tip.at) || r.created_at) : '');
  const OX = () => window.DanubraOutscraper;
  const REFRESH_MAX = 50;
  const EMAIL_FROM = { impressum: 'z Impressum', web: 'z webu firmy', ai: 'neoverený', outscraper_contacts: 'z webu (Outscraper)' };
  const PG = () => window.DanubraProgress;
  const LR = () => window.DanubraLearning;
  const POLL_MS = 2000;
  const SUG_TTL = 60 * 60 * 1000;
  const RUNNING = ['pending', 'running'];
  /** Kategórie z Google Máp, keď ešte nie sú vlastné výsledky. */
  const CATS_DEFAULT = ['Trockenbauunternehmen', 'Bauunternehmen', 'Innenausbau', 'Fliesenleger', 'Malerbetrieb', 'Metallbau', 'Elektroinstallateur', 'Generalunternehmer'];
  const sel = (id) => (window.CSS && CSS.escape ? CSS.escape(id) : String(id).replace(/"/g, ''));
  const LV = () => window.DanubraLeadView;
  const SM_FN = '/.netlify/functions/danubra-leads-sitemeta-background';
  const SM_POLL_MS = 4000;
  /** Bežiace zákazky — na „ako ďaleko je to k najbližšej zákazke". */
  const SITE_ACTIVE = ['active'];
  const TABS = [['prehlad', 'Prehľad'], ['kontakty', 'Kontakty a oslovenie'], ['podrobnosti', 'Podrobnosti'], ['web', 'Web']];

  async function token() {
    try { const { data } = await DB.client.auth.getSession(); return (data && data.session && data.session.access_token) || ''; }
    catch (e) { return ''; }
  }

  const Lead = {
    rows: [], partners: [], subcontracts: [], searches: [], loaded: false,
    filters: { status: '', q: '' }, found: [], osStatus: null,

    /** Je na serveri zapnutý Outscraper? Len áno/nie a strop záznamov — kľúč nikdy. */
    async loadStatus() {
      if (this.osStatus) return this.osStatus;
      if (!this._osLoading) {
        this._osLoading = (async () => {
          let st;
          try {
            const r = await fetch('/.netlify/functions/danubra-email-status');
            const j = r.ok ? await r.json() : {};
            st = { on: j.outscraper === true, max: Number(j.outscraper_max) || OX().DEFAULT_MAX_RECORDS };
          } catch (e) { st = { on: false, max: OX().DEFAULT_MAX_RECORDS, failed: true }; }
          if (!this.osStatus) this.osStatus = st;
          this._osLoading = null;
          return this.osStatus;
        })();
      }
      return this._osLoading;
    },

    async load() {
      const [l, p, s, ls] = await Promise.all([
        DB.list('leads', { order: { column: 'created_at', ascending: false }, limit: 3000 }),
        DB.list('partners', { select: 'id,name,city,country,email,status,website', limit: 1000 }),
        DB.list('subcontracts', { select: 'id,partner_id,trade,title,status,site_city,lat,lng', limit: 1000 }),
        DB.list('lead_searches', { order: { column: 'created_at', ascending: false }, limit: 50 }),
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
        <button class="btn btn-ghost btn-sm" onclick="Lead.refreshSiteMeta()" title="Stiahne úvodné stránky webov firiem a doplní logá, náhľady a popisy. Zadarmo — bez Outscraperu a bez AI.">${Icon('image', 14)} Obnoviť logá a náhľady</button>
        <button class="btn btn-ghost btn-sm" onclick="Lead.refreshVisible()">${Icon('repeat', 14)} Overiť zobrazené</button>
        <button class="btn btn-outline btn-sm" onclick="Lead.form()">${Icon('plus', 14)} Pridať ručne</button>
        <button class="btn btn-primary btn-sm" onclick="Lead.findForm()">${Icon('search', 14)} Hľadať podobné firmy</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      // Oslovenie (stĺpec a filtre) — js/modules/outreach.js.
      if (window.Outreach && !Outreach.loaded) await Outreach.ensure();
      const sEmailom = this.rows.filter(r => r.status === 'new' && LL().emailOk(r.email));
      const bezi = this.searches.find(s => RUNNING.includes(s.status) && !PG().isStale(s));
      // Pás „Hľadanie beží" (aj prerušené hľadanie, nech sa dá spustiť znova).
      const pas = this.searches.find(s => s.kind === 'urls' && RUNNING.includes(s.status));
      const posledne = this.searches[0];
      const n = bezi
        ? (bezi.kind === 'urls' && (bezi.source === 'outscraper' || (bezi.params && bezi.params.outscraper))
          ? { key: 'run', hot: false, title: 'Hľadám podobné firmy na Google Mapách…',
              what: `${bezi.stage_label ? 'Priebeh krok po kroku vidíte nižšie.' : this.phaseText(bezi)} Celé hľadanie trvá 3–10 minút — výsledky sa objavia samy.`,
              why: 'Okno môžete zavrieť aj odísť z obrazovky, hľadá sa na serveri (Outscraper prehľadá Google Mapy, appka stiahne Impressum, AI ohodnotí podobnosť).' }
          : bezi.kind === 'urls'
          ? { key: 'run', hot: false, title: 'Hľadám firmy podobné zadaným webom…',
              what: 'AI číta weby zadaných firiem, hľadá podobné a pri každej sťahuje Impressum. Trvá to 3–10 minút — výsledky sa objavia samy.',
              why: 'Okno môžete zavrieť aj odísť z obrazovky, hľadá sa na serveri.' }
          : { key: 'run', hot: false, title: 'Hľadám nové firmy…', what: 'AI prehľadáva web. Trvá to 1–3 minúty — výsledky sa objavia samy.',
              why: 'Hľadá sa podľa Vašich odberateľov: podobný druh prác, veľkosť a región.' })
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
        + (pas ? this.progressHtml(pas) : this.searchNote(posledne))
        + `<div id="ld-sm" aria-live="polite">${this.smBandHtml()}</div>`
        + DataList.html(this.listConfig(this.rows));
      if (pas) this.watch(pas.id);
      else if (bezi) this.poll();
      this.autoSiteMeta();
    },

    /** Čo hľadanie s Outscraperom práve robí (z `stats.phase`). */
    phaseText(s) {
      const f = s && s.stats && s.stats.phase;
      return f === 'maps' ? 'Outscraper prehľadáva Google Mapy.' : f === 'impressum' ? 'Sťahujem Impressum nájdených firiem a AI hodnotí podobnosť.'
        : 'AI číta weby zadaných firiem a zostavuje dotazy na Google Mapy.';
    },

    /** Stav posledného hľadania (chyba / hotovo za poslednú hodinu) s počtami. */
    searchNote(s) {
      if (!s) return '';
      const co = s.kind === 'urls' ? 'Hľadanie podľa webov firiem' : 'Hľadanie cez AI';
      const st = s.stats || {};
      const odkial = s.source === 'outscraper' ? ' (Google Mapy cez Outscraper)' : s.kind === 'urls' && s.source === 'ai' ? ` (${st.note || 'bez Outscraperu'})` : '';
      if (s.status === 'error') return `<div class="warnbox">${Icon('alert', 14)} ${co}${UI.esc(odkial)} zlyhalo: ${UI.esc(s.error || '')}</div>`;
      if (!['done', 'cancelled'].includes(s.status) || !s.finished_at || Date.now() - Date.parse(s.finished_at) >= 3600e3) return '';
      // Pás s výsledkom: vľavo veta (zalamuje sa), vpravo tlačidlo — nič sa neorezáva.
      const ukaz = s.kind === 'urls' && s.added
        ? `<button type="button" class="btn btn-outline btn-sm" onclick="Lead.showSearch('${s.id}')">${Icon('search', 14)} Ukázať nájdené</button>` : '';
      const band = (ico, text) => `<div class="ls-note card"><div class="ls-note-row"><span class="ls-note-ico">${Icon(ico, 16)}</span>
        <div class="ls-note-txt">${text}</div>${ukaz ? `<div class="ls-note-acts">${ukaz}</div>` : ''}</div>${this.insightsHtml(s)}</div>`;
      if (s.status === 'cancelled') {
        const n = Number(s.added) || 0;
        return band('stop', `${co} ste zastavili — ${PG().plural(n, 'uložená', 'uložené', 'uložených')} ${n} ${Shell.plural(n, 'firma', 'firmy', 'firiem')}.${
          UI.tip('Uložili sa len firmy, ktoré AI stihla ohodnotiť a mali skóre nad prahom. Hľadanie môžete spustiť znova s rovnakými webmi.')}`);
      }
      const vyr = OX().dropSummary(st);
      const spolu = vyr.reduce((a, [, n]) => a + n, 0);
      const detail = st.dropped ? ` Vyradené ${spolu}${vyr.length ? ` (${vyr.map(([l, n]) => `${UI.esc(l)} ${n}`).join(', ')})` : ''}.` : '';
      const spotreba = s.source === 'outscraper' && st.records_estimate != null
        ? ` Outscraper: ${Number(st.records_estimate)} ${Shell.plural(Number(st.records_estimate), 'záznam', 'záznamy', 'záznamov')}${st.contacts_lookups ? `, kontakty pre ${Number(st.contacts_lookups)} ${Shell.plural(Number(st.contacts_lookups), 'web', 'weby', 'webov')}` : ''}.`
        : '';
      const tip = s.source === 'outscraper'
        ? 'Našlo = koľko firiem vrátili Google Mapy (za toľko záznamov účtuje Outscraper). Vyradené: natrvalo zatvorené, bez webu, mimo Nemecka, duplicity, firmy, ktoré už máte, odhlásené, zadané firmy, nízke skóre (pod prahom z okna hľadania) a nad zvolený počet. Uložené = nové firmy v zozname.'
        : 'Nájdené = koľko firiem vrátila AI. Nové = koľko sa uložilo; ostatné ste už mali (meno, mesto alebo doména webu sa zhodujú), boli to zadané firmy alebo sa odhlásili z e-mailov.';
      return band('check', `<b>${co}${UI.esc(odkial)} našlo ${s.found || 0} firiem, uložených ${s.added || 0}.</b>${s.kind === 'urls' ? UI.tip(tip) : ''}${
        detail || spotreba ? `<small>${detail.trim()}${spotreba}</small>` : ''}`);
    },

    /** „Čo AI zistila" — 2–3 vety zo stats hľadania (stats.insights). */
    insightsHtml(s) {
      const list = Array.isArray(s && s.stats && s.stats.insights) ? s.stats.insights.filter(Boolean).slice(0, 3) : [];
      if (!list.length) return '';
      return `<div class="lp-ins"><b>${Icon('spark', 14)} Čo AI zistila</b><ul>${list.map(t => `<li>${UI.esc(t)}</li>`).join('')}</ul></div>`;
    },

    // ── Priebeh hľadania (080) ────────────────────────────────────────────
    /** Pás „Hľadanie beží" — v okne aj na obrazovke Nové firmy. */
    progressHtml(s, { modal = false } = {}) {
      if (!s) return '';
      return `<section class="lp card${modal ? ' is-modal' : ''}" data-lp="${UI.esc(s.id)}" aria-live="polite" aria-label="Priebeh hľadania">${
        this.progressInner(s, PG().model(s, Date.now()))}</section>`;
    },

    /** Režim pásu: beží / prerušené / skončené — pri zmene sa pás prekreslí celý. */
    progressMode(m) { return m.finished ? `end-${m.status}` : m.stale ? 'stale' : `run-${m.pct == null ? 'x' : 'p'}`; },

    progressInner(s, m) {
      if (m.finished) return this.finishedHtml(s, m);
      const id = UI.esc(s.id);
      const co = UI.esc(SD().searchLabel(s));
      if (m.stale) {
        return `<div class="lp-head" data-lp-mode="stale"><div class="lp-title is-warn">${Icon('alert', 16)}<span>Hľadanie sa zrejme prerušilo</span> <small>${co}</small></div></div>
          <p class="lp-text">Server sa neozval viac ako 3 minúty${m.label ? ` (naposledy: ${UI.esc(m.label)})` : ''}. Firmy, ktoré už uložil, sú v zozname.
            Hľadanie môžete spustiť znova s rovnakými webmi a nastaveniami.</p>
          <div class="lp-acts"><button type="button" class="btn btn-primary btn-sm" onclick="Lead.rerun('${id}')">${Icon('repeat', 14)} Spustiť znova</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="Lead.abandon('${id}')">Ukončiť</button>${
            UI.tip('Funkcia na serveri smie bežať najviac 15 minút; keď ju Netlify zastaví alebo spadne spojenie, hľadanie ostane „beží". Spustiť znova = to isté hľadanie odznova (firmy, ktoré už máte, sa neuložia druhýkrát). Ukončiť = len označí hľadanie ako prerušené.')}</div>`;
      }
      const bar = m.pct == null
        ? '<div class="lp-bar is-indet" role="progressbar" aria-label="Priebeh hľadania"><i></i></div>'
        : `<div class="lp-bar" role="progressbar" aria-label="Priebeh hľadania" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${m.pct}" data-lp-el="barbox"><i data-lp-el="bar" style="width:${m.pct}%"></i></div>`;
      const label = m.label || (m.hasProgress ? '' : this.phaseText(s));
      return `<div class="lp-head" data-lp-mode="${this.progressMode(m)}">
          <div class="lp-title"><span class="lp-spin" aria-hidden="true"></span><span>Hľadanie beží</span> <small>${co}</small></div>
          <div class="lp-meta"><span data-lp-el="elapsed">${UI.esc(m.elapsed)}</span><span data-lp-el="cancel">${this.cancelBtnHtml(s, m)}</span></div>
        </div>
        ${bar}
        <div class="lp-now">${m.pct == null ? '' : `<b data-lp-el="pct">${UI.pct(m.pct)}</b>`}<span data-lp-el="label">${UI.esc(label)}</span></div>
        <ol class="lp-steps" data-lp-el="steps">${this.stepsHtml(m)}</ol>
        <div class="lp-log" data-lp-el="log"${m.log.length ? '' : ' hidden'}>${this.logHtml(m)}</div>`;
    },

    stepsHtml(m) {
      return m.stages.map(x => {
        const ico = x.state === 'done' ? Icon('check', 14) : x.state === 'active' ? '<span class="lp-spin" aria-hidden="true"></span>'
          : x.state === 'stopped' ? Icon('stop', 14) : x.state === 'error' ? Icon('alert', 14) : '<span class="lp-dot" aria-hidden="true"></span>';
        const sr = { done: 'hotové', active: 'práve beží', todo: 'ešte nie', stopped: 'zastavené', error: 'chyba' }[x.state];
        return `<li class="is-${x.state}">${ico}<span>${UI.esc(x.label)}</span><span class="sr-only"> — ${sr}</span></li>`;
      }).join('');
    },

    logHtml(m) {
      const hm = (v) => { const d = new Date(v); return isNaN(d) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`; };
      return m.log.map(x => `<div><time>${hm(x.at)}</time><span title="${UI.esc(x.text)}">${UI.esc(x.text)}</span></div>`).join('');
    },

    cancelBtnHtml(s, m) {
      if (m.cancelRequested) return `<span class="lp-stopping">${Icon('stop', 13)} Zastavujem…</span>`;
      return `<button type="button" class="btn btn-ghost btn-sm" onclick="Lead.cancelSearch('${UI.esc(s.id)}')">${Icon('stop', 14)} Zastaviť</button>`;
    },

    /** Po skončení: súhrn, „Čo AI zistila", Ukázať nájdené. */
    finishedHtml(s, m) {
      const x = m.summary || { found: 0, saved: 0, dropped: 0 };
      const id = UI.esc(s.id);
      const head = s.status === 'done' ? ['is-ok', 'check', 'Hľadanie skončilo'] : s.status === 'cancelled' ? ['is-warn', 'stop', 'Hľadanie ste zastavili'] : ['is-err', 'alert', 'Hľadanie zlyhalo'];
      const nums = s.status === 'error' ? `<p class="lp-text">${UI.esc(s.error || 'Neznáma chyba.')}</p>`
        : `<div class="lp-sum"><span><b>${x.found}</b> ${Shell.plural(x.found, 'nájdená', 'nájdené', 'nájdených')}</span><span><b>${x.dropped}</b> ${Shell.plural(x.dropped, 'vyradená', 'vyradené', 'vyradených')}</span><span><b>${x.saved}</b> ${Shell.plural(x.saved, 'uložená', 'uložené', 'uložených')}</span></div>`;
      return `<div class="lp-head" data-lp-mode="${this.progressMode(m)}"><div class="lp-title ${head[0]}">${Icon(head[1], 16)}<span>${head[2]}</span> <small>${UI.esc(SD().searchLabel(s))}</small></div>
          <div class="lp-meta"><span>${UI.esc(m.elapsed)}</span></div></div>
        <div class="lp-bar ${s.status === 'done' ? 'is-done' : 'is-stopped'}" aria-hidden="true"><i style="width:${m.pct == null ? 100 : m.pct}%"></i></div>
        ${nums}${this.insightsHtml(s)}
        <div class="lp-acts">${x.saved ? `<button type="button" class="btn btn-primary btn-sm" onclick="Lead.showFound('${id}')">${Icon('search', 14)} Ukázať nájdené</button>` : ''}${
          s.status !== 'error' && x.saved ? `<span class="lp-hint">${Icon('thumbs-up', 13)} Ohodnoťte nájdené firmy palcom — ďalšie hľadanie sa podľa toho spresní.</span>` : ''}</div>`;
    },

    /** Prekreslí pás: v rovnakom režime len časti (pás sa plynulo posunie), inak celý. */
    paintProgress(el, s) {
      if (!el || !s) return;
      const m = PG().model(s, Date.now());
      const head = el.querySelector('[data-lp-mode]');
      if (!head || head.getAttribute('data-lp-mode') !== this.progressMode(m) || m.finished || m.stale) {
        el.innerHTML = this.progressInner(s, m);
        return;
      }
      const q = (k) => el.querySelector(`[data-lp-el="${k}"]`);
      if (q('bar') && m.pct != null) { q('bar').style.width = `${m.pct}%`; q('barbox').setAttribute('aria-valuenow', String(m.pct)); }
      if (q('pct') && m.pct != null) q('pct').textContent = UI.pct(m.pct);
      if (q('label')) q('label').textContent = m.label || (m.hasProgress ? '' : this.phaseText(s));
      if (q('elapsed')) q('elapsed').textContent = m.elapsed;
      if (q('steps')) q('steps').innerHTML = this.stepsHtml(m);
      if (q('log')) { q('log').innerHTML = this.logHtml(m); q('log').hidden = !m.log.length; }
      if (q('cancel')) q('cancel').innerHTML = this.cancelBtnHtml(s, m);
    },

    /** Sleduje hľadanie každé 2 s, kým je pás na obrazovke alebo v okne. */
    watch(id) {
      if (!id) return;
      if (this._watchId === id && this._pp) return;
      clearTimeout(this._pp);
      this._watchId = id;
      const els = () => [...document.querySelectorAll(`[data-lp="${sel(id)}"]`)];
      const tick = async () => {
        this._pp = null;
        if (this._watchId !== id) return;
        if (!els().length) { this._watchId = null; return; }   // pás nie je vidieť — pri návrate sa sledovanie obnoví
        let s = null;
        try { const { data } = await DB.list('lead_searches', { filters: { id }, limit: 1 }); s = (data || [])[0] || null; } catch (e) { s = null; }
        if (s) {
          const i = this.searches.findIndex(x => x.id === id);
          if (i >= 0) this.searches[i] = { ...this.searches[i], ...s }; else this.searches.unshift(s);
          s = this.searches.find(x => x.id === id);
        } else s = this.searches.find(x => x.id === id);
        els().forEach(el => this.paintProgress(el, s));
        if (s && !RUNNING.includes(s.status)) {
          this._watchId = null;
          // Nájdené firmy do zoznamu; okno so súhrnom ostane otvorené.
          this.loaded = false;
          if (Danubra.route === 'leads') Danubra.renderRoute();
          return;
        }
        this._pp = setTimeout(tick, POLL_MS);
      };
      this._pp = setTimeout(tick, POLL_MS);
    },

    /** „Zastaviť" — s potvrdením; server skončí pri najbližšom kroku. */
    async cancelSearch(id) {
      const s = this.searches.find(x => x.id === id);
      if (!s) return;
      if (!await UI.confirm('Zastaviť hľadanie?', { hint: 'Hľadanie skončí pri najbližšom kroku (do pár sekúnd). Firmy, ktoré AI už ohodnotila, sa uložia, ostatné nie. Spustiť ho môžete znova.',
        ok: 'Zastaviť', cancel: 'Nechať bežať' })) return;
      const { error } = await DB.update('lead_searches', id, { cancel_requested: true });
      if (error) {
        return UI.toast(/cancel_requested|column|schema/i.test(error.message || '') ? 'Zastavenie ešte nie je zapnuté — v databáze chýba migrácia 080'
          : `Chyba: ${error.message}`, 'err');
      }
      s.cancel_requested = true;
      document.querySelectorAll(`[data-lp="${sel(id)}"]`).forEach(el => this.paintProgress(el, s));
      UI.toast('Zastavujem — uloží sa, čo je hotové', 'ok');
    },

    /** Prerušené hľadanie: označiť ako prerušené (a voliteľne spustiť znova). */
    async abandon(id, { quiet = false } = {}) {
      const s = this.searches.find(x => x.id === id);
      if (!s) return null;
      const patch = { status: 'error', error: 'Hľadanie sa prerušilo (server sa neozval).', finished_at: new Date().toISOString() };
      const { error } = await DB.update('lead_searches', id, patch);
      if (error) { UI.toast(`Chyba: ${error.message}`, 'err'); return null; }
      Object.assign(s, patch);
      if (!quiet) Danubra.renderRoute();
      return s;
    },
    async rerun(id) {
      const s = await this.abandon(id, { quiet: true });
      if (!s) return;
      const p = { ...(s.params || {}) };
      if (!Array.isArray(p.urls) || !p.urls.length) p.urls = (Array.isArray(s.seeds) ? s.seeds : []).map(x => x && x.url).filter(Boolean);
      await this.startSearch(p);
    },

    /** „Ukázať nájdené" z okna aj z pásu. */
    showFound(id) {
      UI.closeModal();
      if (Danubra.route !== 'leads') { Danubra.go('leads'); setTimeout(() => this.showSearch(id), 400); return; }
      this.showSearch(id);
    },

    /** Zoznam vyfiltrovaný na jedno hľadanie (odkaz z hlásenia „hotovo"). */
    showSearch(id) {
      DataList.set('leads', 'hladanie', id);
      Danubra.renderRoute();
    },

    searchLabel(id) {
      const s = this.searches.find(x => x.id === id);
      return s ? SD().searchLabel(s) : 'staršie hľadanie';
    },

    /** Ďalší krok (081): dátum (červený = dnes alebo skôr) a text. */
    nextStepCell(r) {
      if (!r.next_step_at && !r.next_step_text) return '';
      const d = r.next_step_at ? String(r.next_step_at).slice(0, 10) : '';
      const dnes = new Date().toISOString().slice(0, 10);
      const tone = d && d <= dnes ? 'is-red' : 'is-amber';
      return `<span class="dl-two">${d ? `<b class="dl-note ${tone}">${UI.esc(DanubraDataList.fmtDay(d))}</b>` : ''}${r.next_step_text ? `<small title="${UI.esc(r.next_step_text)}">${UI.esc(r.next_step_text)}</small>` : ''}</span>`;
    },

    // ── Logo firmy (082) ───────────────────────────────────────────────────
    /** Logo: uložené z webu → ikona webu (Google s2) → iniciály. Nikdy rozbitý obrázok. */
    logoHtml(r, size = 30) {
      const s = LV() ? LV().logoSources(r) : { src: '', fallback: '', initials: '?', hue: 215 };
      const img = s.src ? `<img src="${UI.esc(s.src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"${
        s.fallback ? ` data-fb="${UI.esc(s.fallback)}"` : ''} onload="Lead.logoOk(this)" onerror="Lead.logoErr(this)">` : '';
      return `<span class="ld-logo" style="--ld-h:${Number(s.hue) || 0};--ld-z:${Number(size) || 30}px" aria-hidden="true"><span class="ld-ini">${UI.esc(s.initials)}</span>${img}</span>`;
    },
    logoOk(img) {
      // Google pri neznámej doméne vráti 16 px glóbus — vtedy radšej iniciály.
      if (/google\.com\/s2\/favicons/.test(img.currentSrc || img.src) && img.naturalWidth > 0 && img.naturalWidth <= 16) return this.logoErr(img);
      img.classList.add('is-ok');
      return null;
    },
    logoErr(img) {
      const fb = img.getAttribute('data-fb');
      if (fb) { img.removeAttribute('data-fb'); img.src = fb; return; }
      img.remove();
    },

    // ── Ako ďaleko je to od nás ────────────────────────────────────────────
    /** Kancelária: Nastavenia → Fakturačné údaje → Poloha kancelárie (súradnice alebo odkaz z Máp). */
    office() {
      const sup = (window.Danubra && Danubra.supplier) ? Danubra.supplier() : {};
      const G = window.DanubraGeo;
      return LV() ? LV().officeOf(sup, G ? (t) => G.parseCoords(t) : null) : null;
    },
    activeSites() { return (this.subcontracts || []).filter(s => SITE_ACTIVE.includes(s.status) && s.lat != null && s.lng != null); },
    dist(r) { return LV() && r ? LV().distances(r, { office: this.office(), sites: this.activeSites() }) : null; },

    // ── Detail firmy: veľké okno so záložkami ──────────────────────────────
    detail(id) {
      const r = this.rows.find(x => x.id === id);
      if (!r) return;
      this._openId = id;
      const el = UI.modal(r.name, this.detailHtml(r), { wide: true });
      const card = el && el.querySelector('.modal-card');
      if (card) card.classList.add('ld-modal');
      const h = el && el.querySelector('.modal-head h3');
      if (h) h.outerHTML = this.idHtml(r);
      this.mountContacts(r);
      this.tab(this.lastTab(), { save: false });
    },

    /** Hlavička okna: logo, meno, krátky popis, etapa, skóre, palec. */
    idHtml(r) {
      const st = statusOf(r.status);
      const sum = LV() ? LV().summary(r) : { text: '' };
      const sub = [[r.postal_code, r.city].filter(Boolean).join(' '), r.trade].filter(Boolean).join(' · ');
      return `<div class="ld-id">${this.logoHtml(r, 44)}
        <div class="ld-id-t"><h3>${UI.esc(r.name)}</h3>
          <div class="ld-id-sub">${UI.badge(st[1], st[2])}${r.score != null ? `<span class="ld-score${r.score >= 80 ? ' is-green' : r.score >= 60 ? ' is-amber' : ''}" title="Podobnosť so zadanými firmami 0–100 (odhad AI)">skóre <b>${Number(r.score)}</b></span>` : ''}${
            sub ? `<span>${UI.esc(sub)}</span>` : ''}${r.next_step_at || r.next_step_text ? `<span class="ld-next${r.next_step_at && String(r.next_step_at).slice(0, 10) <= new Date().toISOString().slice(0, 10) ? ' is-due' : ''}"
              title="Dohodnutý ďalší krok — na jeho deň je úloha v Úlohách">${Icon('flag', 12)} ${UI.esc([DanubraDataList.fmtDay(r.next_step_at), r.next_step_text].filter(Boolean).join(' · '))}</span>` : ''}</div>
          ${tipLine(r) ? `<div class="ld-id-call ld-id-tip">${Icon('clients', 12)} ${UI.esc(tipLine(r))}</div>` : ''}
          ${this._lastCall && this._lastCall.id === r.id && this._lastCall.text ? `<div class="ld-id-call">${Icon('phone', 12)} ${UI.esc(this._lastCall.text)}</div>` : ''}
          ${sum.text ? `<p class="ld-id-desc">${UI.esc(sum.text)}</p>` : ''}</div></div>`;
    },

    detailHtml(r) {
      const id = UI.esc(r.id);
      return `<div class="ld" data-ld="${id}">
        ${this.glanceHtml(r)}
        ${this.barHtml(r)}
        <div class="ld-tabs" role="tablist" aria-label="Údaje o firme">${TABS.map(([k, l]) => `<button type="button" role="tab" class="ld-tab" id="ld-tab-${k}"
          data-ld-tab="${k}" aria-selected="false" aria-controls="ld-p-${k}" tabindex="-1" onclick="Lead.tab('${k}')" onkeydown="Lead.tabNav(event)">${l}</button>`).join('')}</div>
        <section class="ld-panel" id="ld-p-prehlad" role="tabpanel" aria-labelledby="ld-tab-prehlad" data-ld-panel="prehlad" hidden>${this.overviewHtml(r)}</section>
        <section class="ld-panel" id="ld-p-kontakty" role="tabpanel" aria-labelledby="ld-tab-kontakty" data-ld-panel="kontakty" hidden>
          <div id="lead-contacts-slot" class="ld-contacts">${window.LeadContacts && LeadContacts.mount ? UI.loading()
            : `<div class="js-empty">${Icon('info', 14)} Záznamy kontaktov sa pripravujú.</div>`}</div>
          ${window.Outreach ? `<div class="ld-otl">${Outreach.timelineHtml(r.id)}</div>` : ''}</section>
        <section class="ld-panel" id="ld-p-podrobnosti" role="tabpanel" aria-labelledby="ld-tab-podrobnosti" data-ld-panel="podrobnosti" hidden>${this.moreHtml(r)}</section>
        <section class="ld-panel" id="ld-p-web" role="tabpanel" aria-labelledby="ld-tab-web" data-ld-panel="web" hidden>${this.webTabHtml(r)}</section>
      </div>`;
    },

    /** Na prvý pohľad: kde, ako ďaleko, telefón, web, e-mail, Google. */
    glanceHtml(r) {
      const V = LV();
      const web = r.website ? (/^https?:/i.test(r.website) ? r.website : `https://${r.website}`) : '';
      const host = web ? (V ? V.domainOf(web) : r.website) : '';
      const maps = V ? V.mapsUrl(r) : '';
      const addr = V ? V.addressLine(r) : (r.address || r.city || '');
      const d = this.dist(r);
      const copy = (v, what) => `<button type="button" class="ld-copy" data-copy="${UI.esc(v)}" data-what="${UI.esc(what)}" onclick="Lead.copy(this)"
        title="Kopírovať ${UI.esc(what.toLowerCase())}" aria-label="Kopírovať ${UI.esc(what.toLowerCase())}">${Icon('copy', 14)}</button>`;
      const cell = (ico, label, body, cls = '') => `<div class="ld-g${cls}"><span class="ld-g-l">${Icon(ico, 14)}${label}</span>${body}</div>`;
      const kde = [r.city, r.region && r.region !== r.city ? r.region : ''].filter(Boolean).join(', ') || addr || '—';
      const ofText = !d || !d.has ? `<span class="ld-g-v is-mute">Poloha firmy zatiaľ nie je známa</span>
          <small>Doplní ju „Obnoviť logá a náhľady" (z adresy) alebo overenie na Google Mapách.</small>`
        : `${d.office ? `<span class="ld-g-v">${UI.esc(V.fmtKm(d.office.km))}</span><small>od kancelárie vzdušnou čiarou · ${UI.esc(d.office.drive)}</small>`
          : `<span class="ld-g-v is-mute">Kancelária nemá polohu</span><small>Doplňte ju v <a href="#/settings" onclick="UI.closeModal()">Nastaveniach</a> (Fakturačné údaje → Poloha kancelárie).</small>`}
          ${d.site ? `<small class="ld-g-site">${Icon('site', 12)} K zákazke ${UI.esc(d.site.title || '')}${d.site.city ? ` (${UI.esc(d.site.city)})` : ''}: <b>${UI.esc(V.fmtKm(d.site.km))}</b> · ${UI.esc(d.site.drive)}</small>` : ''}`;
      const st = OX().stateOf(r);
      const rating = r.rating != null ? `<span class="ld-g-v">${Icon('star', 15)} ${UI.esc(String(Number(r.rating).toFixed(1)).replace('.', ','))}</span>
          <small>${r.reviews_count != null ? `${Number(r.reviews_count)} ${Shell.plural(Number(r.reviews_count), 'recenzia', 'recenzie', 'recenzií')} · ` : ''}${st ? UI.esc(st[1]) : ''}${
            r.verified_at ? ` · ${UI.esc(OX().verifiedLabel(r.verified_at).toLowerCase())}` : ''}</small>`
        : `<span class="ld-g-v is-mute">Bez hodnotenia</span><small>${st ? UI.esc(st[1]) : 'Na Google Mapách sa ešte neoverovala.'}</small>`;
      return `<div class="ld-glance">
        ${cell('pin', 'Kde', `${maps ? `<a class="ld-g-v" href="${UI.esc(maps)}" target="_blank" rel="noopener" title="${UI.esc(addr || kde)} — otvoriť v Google Mapách">${UI.esc(kde)}</a>`
          : `<span class="ld-g-v">${UI.esc(kde)}</span>`}<small>${UI.esc(addr && addr !== kde ? addr : (r.country && r.country !== 'DE' ? r.country : 'Nemecko'))}</small>`)}
        ${cell('route', 'Ako ďaleko', ofText)}
        ${cell('phone', 'Telefón', r.phone ? `<span class="ld-g-row"><a class="ld-g-v" href="tel:${UI.esc(String(r.phone).replace(/[^\d+]/g, ''))}">${UI.esc(r.phone)}</a>${copy(r.phone, 'Telefón')}</span><small>Kliknutím zavoláte</small>`
          : '<span class="ld-g-v is-mute">Bez telefónu</span><small>Nie je na webe ani na Mapách.</small>')}
        ${cell('globe', 'Web', web ? `<span class="ld-g-row"><a class="ld-g-v" href="${UI.esc(web)}" target="_blank" rel="noopener">${UI.esc(host || r.website)}</a>${Icon('external', 13)}</span>
          <small>${r.web_ok === false ? '<span class="dl-note is-red">neodpovedal pri overení</span>' : UI.esc(r.site_title || 'Otvorí sa v novom okne')}</small>`
          : '<span class="ld-g-v is-mute">Bez webu</span>')}
        ${cell('mail', 'E-mail', r.email ? `<span class="ld-g-row"><a class="ld-g-v" href="mailto:${UI.esc(r.email)}">${UI.esc(r.email)}</a>${copy(r.email, 'E-mail')}</span>
          <small>${UI.esc(EMAIL_FROM[r.profile && r.profile.email_source] || '')}${r.email_mx_ok === false ? ' · doména nemá poštový server' : ''}</small>`
          : '<span class="ld-g-v is-mute">Bez e-mailu</span><small>Osloviť sa dá telefonicky alebo cez formulár na webe.</small>')}
        ${cell('star', 'Google', `${rating}${maps ? `<small><a href="${UI.esc(maps)}" target="_blank" rel="noopener">${Icon('pin', 12)} Google Mapy</a></small>` : ''}`)}
      </div>`;
    },

    /** Lišta akcií: stav, palec, osloviť, poznámka, overiť, upraviť, odberateľ, archív. */
    barHtml(r) {
      const id = UI.esc(r.id);
      return `<div class="ld-bar">
        <label class="ld-stage"><span>Stav</span><select class="verif-sel" onchange="Lead.setStatus('${id}', this.value)" aria-label="Stav firmy">
            ${LL().STATUS.filter(s => s[0] !== 'won').map(([k, l]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${l}</option>`).join('')}
            ${r.status === 'won' ? '<option value="won" selected>Je odberateľ</option>' : ''}
          </select>${UI.tip('Stav meníte Vy podľa toho, ako firma reagovala. Podľa stavu potom pri e-maile vyberáte, komu ho poslať. „Je odberateľ" sa nastaví samo tlačidlom Urobiť odberateľa.')}</label>
        <span class="lr-card ld-rate"><span>Vhodná firma?</span>${this.rateHtml(r, { big: true })}${UI.tip('Palec hore = takéto firmy chceme, palec dole = nechceme (s krátkym dôvodom). AI sa z toho učí: pri ďalšom hľadaní hľadá podobné ako dobré a vynecháva podobné ako zlé. Druhý klik na ten istý palec hodnotenie zruší.')}
          <small class="lr-why" data-lr-why="${id}"${Number(r.relevance) === -1 && r.relevance_note ? '' : ' hidden'}>${Number(r.relevance) === -1 && r.relevance_note ? `Dôvod: ${UI.esc(r.relevance_note)}` : ''}</small></span>
        <span class="ld-bar-sp"></span>
        ${window.Outreach && Outreach.button ? `<span class="ld-bar-i">${Outreach.button(r)}</span>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" onclick="Lead.note('${id}')">${Icon('note', 14)} Poznámka</button>
        <span class="ld-bar-i"><button type="button" class="btn btn-ghost btn-sm" onclick="Lead.refresh(['${id}'])">${Icon('repeat', 14)} Overiť znova</button>${UI.tip('Appka overí firmu na Google Mapách (či funguje, telefón, web, hodnotenie), či jej web odpovedá a či má doména e-mailu poštový server. Nič sa neposiela. Výsledok sa ukáže o chvíľu.')}</span>
        <button type="button" class="btn btn-ghost btn-sm" onclick="Lead.edit('${id}')">${Icon('edit', 14)} Upraviť</button>
        ${r.partner_id ? Danubra.link('partner', r.partner_id, 'Odberateľ')
          : `<span class="ld-bar-i"><button type="button" class="btn btn-outline btn-sm" onclick="Lead.toPartner('${id}')">${Icon('clients', 14)} Urobiť odberateľa</button>${UI.tip('Založí firmu v Odberateľoch s jej menom, adresou, e-mailom, telefónom a poznámkami. Tu zostane so stavom Je odberateľ. USt-IdNr a kontaktnú osobu doplníte v Odberateľoch.')}</span>`}
        <button type="button" class="btn btn-ghost btn-sm btn-text-danger" onclick="Lead.archive('${id}')" title="Firma sa presunie do archívu — nič sa nemaže">${Icon('archive', 14)} Archivovať</button>
      </div>`;
    },

    /** Záložka Prehľad: čo sme zistili, hlavné údaje, náhľad webu. */
    overviewHtml(r) {
      const sum = LV() ? LV().summary(r, { emailFrom: EMAIL_FROM }) : { found: [] };
      const kv = (k, v) => (v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : '');
      const kat = Array.isArray(r.categories) ? r.categories.filter(Boolean).slice(0, 5).map(UI.esc).join(', ') : '';
      return `<div class="ld-ov">
        <div class="ld-ov-main">
          ${sum.text ? `<p class="ld-desc-m">${UI.esc(sum.text)}</p>` : ''}
          ${sum.found.length ? `<div class="ld-found"><b>${Icon('spark', 14)} Čo sme zistili</b><ul>${sum.found.map(t => `<li>${UI.esc(t)}</li>`).join('')}</ul></div>` : ''}
          ${r.why ? `<p class="ld-why">${UI.esc(r.why)}${UI.tip(r.source === 'urls' || r.source === 'outscraper'
            ? 'Prečo túto firmu navrhla AI: v čom sa podobá na firmy, ktorých weby ste zadali. Je to len odhad AI, pred oslovením si pozrite jej web.'
            : 'Prečo túto firmu navrhla AI: v čom sa podobá na Vašich odberateľov. Je to len odhad AI, pred oslovením si pozrite jej web.')}</p>` : ''}
          <dl class="ld-kv">
            ${kv('Adresa', UI.esc(LV() ? LV().addressLine(r) : r.address || ''))}
            ${kv('Región', UI.esc(r.region || ''))}
            ${kv('Čím sa zaoberá', UI.esc(r.trade || ''))}
            ${kv('Kategórie', kat)}
            ${kv('Zamestnanci', r.employees ? `${UI.esc(r.employees)} (odhad)` : '')}
            ${kv('Konateľ', UI.esc(r.contact_person || ''))}
            ${kv('USt-IdNr', r.vat_id ? `<span class="mono">${UI.esc(r.vat_id)}</span>` : '')}
            ${kv('Zdroj', `${SOURCE[r.source] || 'ručne'}${r.seed_search_id ? ` · ${UI.esc(this.searchLabel(r.seed_search_id))}` : ''}`)}
            ${kv('Pridaná', UI.esc(DanubraDataList.fmtDay(r.created_at)))}
            ${kv('Posledný kontakt', UI.esc(DanubraDataList.fmtDay(r.last_contact_at)))}
          </dl>
          ${r.notes ? `<div class="form-section">Poznámky</div><div class="notebox" style="white-space:pre-wrap;font-size:12.5px;">${UI.esc(r.notes)}</div>` : ''}
        </div>
        <aside class="ld-ov-side">${this.previewHtml(r)}</aside>
      </div>`;
    },

    /** Karta náhľadu webu: obrázok (og:image), ikona, titulok, popis. */
    previewHtml(r) {
      const id = UI.esc(r.id);
      if (!r.website) return `<div class="ld-pv card"><div class="ld-pv-img is-empty">${Icon('globe', 28)}<span>Firma nemá zapísaný web.</span></div></div>`;
      const web = /^https?:/i.test(r.website) ? r.website : `https://${r.website}`;
      const host = LV() ? LV().domainOf(web) : r.website;
      const img = /^https:\/\//i.test(String(r.og_image || '')) ? r.og_image : '';
      const kedy = r.site_checked_at ? `Náhľad z webu firmy, načítaný ${LV() ? LV().whenText(Math.floor((Date.now() - Date.parse(r.site_checked_at)) / 864e5)) : ''}.`
        : 'Náhľad sa ešte nenačítal — kliknite „Obnoviť náhľad".';
      return `<div class="ld-pv card">
        ${img ? `<a class="ld-pv-img" href="${UI.esc(web)}" target="_blank" rel="noopener"><img src="${UI.esc(img)}" alt="Náhľad webu ${UI.esc(r.name)}" loading="lazy" referrerpolicy="no-referrer"
            onerror="this.parentNode.classList.add('is-empty');this.replaceWith(Object.assign(document.createElement('span'),{textContent:'Obrázok webu sa nenačítal'}))"></a>`
          : `<div class="ld-pv-img is-empty">${Icon('image', 28)}<span>Web nemá náhľadový obrázok</span></div>`}
        <div class="ld-pv-b">
          <div class="ld-pv-h">${this.logoHtml(r, 24)}<span><b>${UI.esc(r.site_title || host)}</b><small>${UI.esc(host)}</small></span></div>
          ${r.site_description ? `<p>${UI.esc(r.site_description)}</p>` : ''}
          <div class="ld-pv-acts">
            <a class="btn btn-outline btn-sm" href="${UI.esc(web)}" target="_blank" rel="noopener">${Icon('external', 14)} Otvoriť web</a>
            ${r.site_embeddable === true ? `<button type="button" class="btn btn-ghost btn-sm" onclick="Lead.tab('web');Lead.showFrame('${id}')">${Icon('globe', 14)} Zobraziť web tu</button>` : ''}
            <button type="button" class="btn btn-ghost btn-sm" onclick="Lead.siteMetaOne('${id}')">${Icon('repeat', 14)} Obnoviť náhľad</button>
          </div>
          <small class="ld-pv-note">${UI.esc(kedy)}</small>
        </div>
      </div>`;
    },

    /** Záložka Podrobnosti: všetko ostatné. */
    moreHtml(r) {
      const ds = r.data_source || {};
      const kv = (k, v) => (v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : '');
      const day = (v) => UI.esc(DanubraDataList.fmtDay(v));
      const s = r.seed_search_id ? this.searches.find(x => x.id === r.seed_search_id) : null;
      const seeds = s && Array.isArray(s.seeds) ? s.seeds.map(x => x && (x.domain || (x.url && SD().hostOf(x.url)))).filter(Boolean) : [];
      return `${this.seedFacts(r)}${this.mapsFacts(r)}
        <dl class="ld-kv is-wide">
          ${kv('USt-IdNr', r.vat_id ? `<span class="mono">${UI.esc(r.vat_id)}</span>` : '')}
          ${kv('Konateľ', UI.esc(r.contact_person || ''))}
          ${kv('Impressum', r.impressum_url ? `<a href="${UI.esc(r.impressum_url)}" target="_blank" rel="noopener">${UI.esc(r.impressum_url)}</a>` : '')}
          ${kv('E-mail odkiaľ', this.emailFrom(r))}
          ${kv('Kategórie (Mapy)', Array.isArray(r.categories) ? r.categories.map(UI.esc).join(', ') : '')}
          ${kv('Hľadanie', s ? UI.esc(SD().searchLabel(s)) : '')}
          ${kv('Vzorové weby', seeds.map(UI.esc).join(', '))}
          ${kv('Podobá sa na', r.similar_to ? UI.esc(this.partnerName(r.similar_to)) : (r.profile && r.profile.similar_to_url ? UI.esc(SD().hostOf(r.profile.similar_to_url)) : ''))}
          ${kv('Zdroj údajov', UI.esc([SOURCE[r.source] || r.source, ds.name, ds.email ? `e-mail: ${EMAIL_FROM[ds.email] || ds.email}` : ''].filter(Boolean).join(' · ')))}
          ${kv('Overené (Mapy)', r.verified_at ? `${day(r.verified_at)} · ${UI.esc(OX().verifiedLabel(r.verified_at))}` : '')}
          ${kv('Zatvorená od', day(r.closed_at))}
          ${kv('Web funguje', r.web_ok == null ? '' : r.web_ok ? 'áno' : 'nie')}
          ${kv('E-mail má poštový server', r.email_mx_ok == null ? '' : r.email_mx_ok ? 'áno' : 'nie')}
          ${kv('Náhľad webu načítaný', day(r.site_checked_at))}
          ${kv('Web sa dá zobraziť v appke', r.site_embeddable == null ? '' : r.site_embeddable ? 'áno' : 'nie (web to zakazuje)')}
          ${kv('Súradnice', r.lat != null && r.lng != null ? `<span class="mono">${UI.esc(Number(r.lat).toFixed(5))}, ${UI.esc(Number(r.lng).toFixed(5))}</span>` : '')}
          ${kv('Google place id', r.google_place_id ? `<span class="mono">${UI.esc(r.google_place_id)}</span>` : '')}
          ${kv('Pridaná', day(r.created_at))}
          ${kv('Stav zmenený', day(r.status_changed_at))}
          ${kv('Ďalší krok', r.next_step_at || r.next_step_text ? UI.esc([DanubraDataList.fmtDay(r.next_step_at), r.next_step_text].filter(Boolean).join(' — ')) : '')}
          ${kv('Hodnotenie palcom', Number(r.relevance) === 1 ? 'relevantná' : Number(r.relevance) === -1 ? `nerelevantná${r.relevance_note ? ` (${UI.esc(r.relevance_note)})` : ''}` : '')}
          ${kv('ID v appke', `<span class="mono">${UI.esc(r.id)}</span>`)}
        </dl>`;
    },

    /** Záložka Web: web priamo v okne, len keď to web dovoľuje. */
    webTabHtml(r) {
      const id = UI.esc(r.id);
      if (!r.website) return `<div class="js-empty">Firma nemá zapísaný web.</div>`;
      const web = /^https?:/i.test(r.website) ? r.website : `https://${r.website}`;
      const open = `<a class="btn btn-outline btn-sm" href="${UI.esc(web)}" target="_blank" rel="noopener">${Icon('external', 14)} Otvoriť web v novom okne</a>`;
      if (r.site_embeddable === true) {
        return `<div class="ld-web" data-ld-web="${id}">
          <div class="ld-web-bar"><span>${Icon('globe', 14)} ${UI.esc(LV() ? LV().domainOf(web) : r.website)}</span>
            <button type="button" class="btn btn-primary btn-sm" onclick="Lead.showFrame('${id}')">${Icon('eye', 14)} Zobraziť web tu</button>${open}</div>
          <div class="ld-frame" data-ld-frame="${id}"><div class="ld-frame-ph">${this.previewHtml(r)}</div></div>
          <p class="card-note">Web sa načíta až po kliknutí, v uzavretom rámiku (bez prístupu k appke). Keď sa nezobrazí, otvorte ho v novom okne.</p>
        </div>`;
      }
      const why = r.site_embeddable === false
        ? 'Web firmy nedovoľuje, aby ho iná stránka ukázala vo svojom okne (hlavička X-Frame-Options alebo CSP). Otvorte ho v novom okne.'
        : 'Ešte sme nezisťovali, či sa web dá ukázať priamo tu. Kliknite „Obnoviť náhľad" — appka to zistí pri najbližšom načítaní webu.';
      return `<div class="ld-web"><div class="notebox">${Icon('info', 14)} ${why}</div>
        <div class="ld-web-bar">${open}<button type="button" class="btn btn-ghost btn-sm" onclick="Lead.siteMetaOne('${id}')">${Icon('repeat', 14)} Obnoviť náhľad</button></div>
        <div class="ld-frame-ph">${this.previewHtml(r)}</div></div>`;
    },

    /** <iframe sandbox> až po kliknutí. */
    showFrame(id) {
      const r = this.rows.find(x => x.id === id);
      const box = document.querySelector(`[data-ld-frame="${sel(id)}"]`);
      if (!r || !box || r.site_embeddable !== true) return;
      const web = /^https?:/i.test(r.website) ? r.website : `https://${r.website}`;
      if (!/^https:\/\//i.test(web)) { box.innerHTML = `<div class="notebox">${Icon('info', 14)} Web nemá zabezpečenú adresu (https), v appke sa ukázať nedá. Otvorte ho v novom okne.</div>`; return; }
      box.innerHTML = `<iframe src="${UI.esc(web)}" title="Web firmy ${UI.esc(r.name)}" loading="lazy" referrerpolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"></iframe>`;
    },

    /** Záložky: Prehľad / Kontakty a oslovenie / Podrobnosti / Web — posledná sa pamätá. */
    tabStoreKey() { return `danubra_ld_tab_${String((Danubra.user && Danubra.user.id) || 'anon').replace(/[^\w-]/g, '')}`; },
    lastTab() {
      let t = '';
      try { t = localStorage.getItem(this.tabStoreKey()) || ''; } catch (e) { t = ''; }
      return TABS.some(x => x[0] === t) ? t : 'prehlad';
    },
    tab(k, { save = true } = {}) {
      if (!TABS.some(x => x[0] === k)) k = 'prehlad';
      document.querySelectorAll('.ld [data-ld-tab]').forEach(b => {
        const on = b.dataset.ldTab === k;
        b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; b.classList.toggle('on', on);
      });
      document.querySelectorAll('.ld [data-ld-panel]').forEach(p => { p.hidden = p.dataset.ldPanel !== k; });
      if (save) { try { localStorage.setItem(this.tabStoreKey(), k); } catch (e) { /* súkromné okno */ } }
    },
    /** Šípky vľavo/vpravo, Home, End medzi záložkami (ARIA tabs). */
    tabNav(e) {
      const keys = TABS.map(x => x[0]);
      const cur = keys.indexOf(e.target.dataset.ldTab);
      const n = e.key === 'ArrowRight' ? cur + 1 : e.key === 'ArrowLeft' ? cur - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? keys.length - 1 : null;
      if (n == null) return;
      e.preventDefault();
      const k = keys[(n + keys.length) % keys.length];
      this.tab(k);
      const b = document.querySelector(`.ld [data-ld-tab="${k}"]`);
      if (b) b.focus();
    },

    /** Kontakty s firmou (js/components/lead-contacts.js), keď je komponent načítaný. */
    mountContacts(r) {
      const slot = document.getElementById('lead-contacts-slot');
      if (!slot || !(window.LeadContacts && LeadContacts.mount)) return;
      // Komponent mení riadok firmy na mieste (etapa, ďalší krok) — zoznam sa len prekreslí.
      let h = null;
      const head = () => {
        // „Posledný hovor: pred 3 dňami · Má záujem · Štefan" z kontaktov, ktoré komponent už načítal.
        this._lastCall = { id: r.id, text: h && h.lastCall ? h.lastCall() : '' };
        const el = document.querySelector('.ld-modal .ld-id');
        if (el && this._openId === r.id) el.outerHTML = this.idHtml(r);
      };
      this._lastCall = null;
      Promise.resolve(LeadContacts.mount(slot, r, { onChange: () => {
        if (Danubra.route === 'leads') DataList.refresh('leads', Lead.rows);
        head();
      } })).then((x) => { h = x; head(); })
        .catch(() => { slot.innerHTML = `<div class="js-empty">${Icon('info', 14)} Záznamy kontaktov sa nepodarilo načítať.</div>`; });
    },

    /** Kopírovať telefón / e-mail. */
    async copy(btn) {
      const v = btn && btn.getAttribute('data-copy');
      if (!v) return;
      let ok = false;
      try { await navigator.clipboard.writeText(v); ok = true; } catch (e) {
        try {
          const t = Object.assign(document.createElement('textarea'), { value: v });
          t.style.position = 'fixed'; t.style.opacity = '0';
          document.body.appendChild(t); t.select(); ok = document.execCommand('copy'); t.remove();
        } catch (e2) { ok = false; }
      }
      UI.toast(ok ? `${btn.getAttribute('data-what') || 'Text'} skopírovaný` : 'Kopírovanie sa nepodarilo — označte text ručne', ok ? 'ok' : 'err');
    },

    /** Upraviť základné údaje firmy. */
    edit(id) {
      const r = this.rows.find(x => x.id === id);
      if (!r) return;
      UI.modal('Upraviť firmu', `<form id="le-form" onsubmit="event.preventDefault();Lead.saveEdit('${UI.esc(id)}')">
        <div class="form-grid">
          ${UI.field('name', 'Názov firmy', { required: true, value: r.name || '' })}
          ${UI.field('trade', 'Čím sa zaoberá', { value: r.trade || '' })}
          ${UI.field('address', 'Ulica', { value: r.address || '' })}
          ${UI.field('postal_code', 'PSČ', { value: r.postal_code || '' })}
          ${UI.field('city', 'Mesto', { value: r.city || '' })}
          ${UI.field('region', 'Región', { value: r.region || '' })}
          ${UI.field('email', 'E-mail', { type: 'email', value: r.email || '' })}
          ${UI.field('phone', 'Telefón', { value: r.phone || '' })}
          ${UI.field('website', 'Web', { value: r.website || '' })}
          ${UI.field('contact_person', 'Konateľ / kontaktná osoba', { value: r.contact_person || '' })}
        </div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" onclick="Lead.detail('${UI.esc(id)}')">Späť</button>
          <button type="submit" class="btn btn-primary">Uložiť</button></div></form>`, { wide: true });
    },
    async saveEdit(id) {
      const d = UI.formData(document.getElementById('le-form'));
      const r = this.rows.find(x => x.id === id);
      if (!r || !String(d.name || '').trim()) return;
      const t = (v) => (String(v || '').trim() || null);
      const patch = { name: String(d.name).trim(), trade: t(d.trade), address: t(d.address), postal_code: t(d.postal_code), city: t(d.city),
        region: t(d.region), email: (t(d.email) || '').toLowerCase() || null, phone: t(d.phone), website: t(d.website), contact_person: t(d.contact_person) };
      const { error } = await DB.update('leads', id, patch);
      if (error) return UI.toast(`Chyba: ${error.message}`, 'err');
      Object.assign(r, patch);
      UI.toast('Uložené', 'ok');
      if (Danubra.route === 'leads') DataList.refresh('leads', this.rows);
      return this.detail(id);
    },

    /** Archív — nič sa nemaže, firma sa len presunie do archívu. */
    async archive(id) {
      const r = this.rows.find(x => x.id === id);
      if (!r) return;
      if (!await UI.confirm(`Archivovať „${r.name}"?`, { hint: 'Firma zmizne zo zoznamu Nové firmy a nepôjde jej žiadny e-mail. Nič sa nemaže — nájdete ju v archíve a môžete ju vrátiť.',
        ok: 'Archivovať', cancel: 'Nechať' })) return;
      const { error } = await DB.archive('leads', id);
      if (error) return UI.toast(`Chyba: ${error.message}`, 'err');
      this.rows = this.rows.filter(x => x.id !== id);
      UI.closeModal();
      UI.toast('Firma je v archíve', 'ok');
      Danubra.renderRoute();
    },

    // ── Obnoviť logá a náhľady (082) ───────────────────────────────────────
    /** Firmy s webom, ktoré ešte náhľad nemajú (alebo ho majú starší ako `since`). */
    smPending(since) {
      return this.rows.filter(r => r.website && (!r.site_checked_at || (since && r.site_checked_at < since))).length;
    },
    smBandHtml() {
      const x = this._sm;
      if (!x) return '';
      const pct = x.total ? Math.min(100, Math.round((x.done / x.total) * 100)) : 0;
      if (x.auto) {
        return `<div class="ld-sm-auto" role="status"><span class="lp-spin" aria-hidden="true"></span>
          <span>Dopĺňam logá a náhľady k ${x.total} ${Shell.plural(x.total, 'firme', 'firmám', 'firmám')}… <b>${x.done}</b> hotových</span>${
          UI.tip('Appka stiahne úvodnú stránku webu každej firmy, ktorá ešte nemá logo a náhľad, a z adresy doplní polohu (na „ako ďaleko je to od nás"). Zadarmo — bez Outscraperu a bez AI. Môžete pracovať ďalej, zoznam sa doplní sám.')}</div>`;
      }
      return `<section class="lp card ld-sm" aria-label="Obnovovanie log a náhľadov">
        <div class="lp-head"><div class="lp-title"><span class="lp-spin" aria-hidden="true"></span><span>Obnovujem logá a náhľady</span>
          <small>${x.done} z ${x.total} ${Shell.plural(x.total, 'firmy', 'firiem', 'firiem')} · zadarmo, len weby firiem</small></div>
          <div class="lp-meta"><button type="button" class="btn btn-ghost btn-sm" onclick="Lead.smStop()">Skryť priebeh</button></div></div>
        <div class="lp-bar" role="progressbar" aria-label="Obnovovanie log a náhľadov" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
      </section>`;
    },
    smPaint() { const el = document.getElementById('ld-sm'); if (el) el.innerHTML = this.smBandHtml(); },
    smStop() { clearTimeout(this._smT); this._sm = null; this.smPaint(); },

    async callSiteMeta(body) {
      const t = await token();
      const x = await fetch(SM_FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify(body || {}) });
      return x.ok || x.status === 202 ? null : `Server obnovenie odmietol (${x.status})`;
    },

    /**
     * Firmy bez náhľadu (staré dáta) sa doplnia samé pri otvorení obrazovky —
     * najviac raz za 30 minút na používateľa (localStorage); server navyše
     * nespustí druhý beh, kým prvý žije. Len weby firiem, nič platené.
     */
    autoSiteMeta() {
      if (this._sm || !this.rows.length || !this.rows.some(r => 'site_checked_at' in r)) return;
      if (!this.rows.some(r => r.website && !r.site_checked_at)) return;
      const key = `danubra_sm_auto_${String((Danubra.user && Danubra.user.id) || 'anon').replace(/[^\w-]/g, '')}`;
      try {
        const last = Number(localStorage.getItem(key)) || 0;
        if (Date.now() - last < 30 * 60000) return;
        localStorage.setItem(key, String(Date.now()));
      } catch (e) { if (this._smAutoDone) return; }
      this._smAutoDone = true;
      this.refreshSiteMeta({ auto: true });
    },

    /** „Obnoviť logá a náhľady": server prejde firmy po dávkach, appka číta priebeh z databázy. */
    async refreshSiteMeta({ auto = false } = {}) {
      if (this._sm) return auto ? null : UI.toast('Logá a náhľady sa už obnovujú', 'ok');
      if (this.rows.length && !this.rows.some(r => 'site_checked_at' in r)) {
        return auto ? null : UI.toast('Logá a náhľady ešte nie sú zapnuté — v databáze chýba migrácia 082', 'err');
      }
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      // Automaticky len firmy, ktoré náhľad ešte nikdy nemali; tlačidlom aj staršie ako 30 dní.
      const total = auto ? this.smPending(null) : this.smPending(since);
      if (!total) return auto ? null : UI.toast('Všetky firmy s webom majú logo a náhľad načítané (za posledných 30 dní)', 'ok');
      let err;
      try { err = await this.callSiteMeta({}); } catch (e) { err = 'Server na obnovenie neodpovedá'; }
      if (err) return auto ? null : UI.toast(`${err} — skúste to znova`, 'err');
      const started = new Date().toISOString();
      this._sm = { total, done: 0, started, last: Date.now(), at: Date.now(), since: auto ? null : since, auto };
      if (!auto) UI.toast(`Obnovujem logá a náhľady pri ${total} ${Shell.plural(total, 'firme', 'firmách', 'firmách')} — stiahnu sa len weby firiem`, 'ok');
      this.smPaint();
      this.smPoll();
      return null;
    },
    smPoll() {
      clearTimeout(this._smT);
      this._smT = setTimeout(async () => {
        const x = this._sm;
        if (!x) return;
        let data = null;
        try {
          ({ data } = await DB.list('leads', { select: 'id,site_checked_at,logo_url,og_image,site_title,site_description,site_embeddable,lat,lng', limit: 3000 }));
        } catch (e) { data = null; }
        if (Array.isArray(data)) {
          const by = new Map(data.map(d => [d.id, d]));
          for (const r of this.rows) { const d = by.get(r.id); if (d) Object.assign(r, d); }
        }
        const left = this.smPending(x.since);
        const done = Math.max(0, x.total - left);
        if (done !== x.done) { x.done = done; x.last = Date.now(); if (Danubra.route === 'leads') DataList.refresh('leads', this.rows); }
        this.smPaint();
        const ticho = Date.now() - x.last > 120000, dlho = Date.now() - x.at > 14 * 60000;
        if (!left || ticho || dlho) {
          const logo = this.rows.filter(r => r.logo_url && r.site_checked_at >= x.started).length;
          this._sm = null;
          this.smPaint();
          if (Danubra.route === 'leads') DataList.refresh('leads', this.rows);
          if (x.auto && !done) return null;
          return UI.toast(!left ? `Logá a náhľady doplnené: ${done} ${Shell.plural(done, 'firma', 'firmy', 'firiem')}, logo z webu pri ${logo}`
            : `Logá a náhľady: hotových ${done} z ${x.total} — zvyšok doplní „Obnoviť logá a náhľady"`, !left ? 'ok' : 'err');
        }
        return this.smPoll();
      }, SM_POLL_MS);
    },

    /** Náhľad jednej firmy (z detailu). */
    async siteMetaOne(id) {
      let err;
      try { err = await this.callSiteMeta({ lead_ids: [id] }); } catch (e) { err = 'Server neodpovedá'; }
      if (err) return UI.toast(`${err} — skúste to znova`, 'err');
      UI.toast('Načítavam náhľad webu — ukáže sa o chvíľu', 'ok');
      clearTimeout(this._smOne);
      this._smOne = setTimeout(async () => {
        try {
          const { data } = await DB.list('leads', { filters: { id }, limit: 1 });
          const r = this.rows.find(x => x.id === id);
          if (r && data && data[0]) Object.assign(r, data[0]);
        } catch (e) { /* nič */ }
        if (Danubra.route === 'leads') DataList.refresh('leads', this.rows);
        if (this._openId === id && document.querySelector(`.ld[data-ld="${sel(id)}"]`)) this.detail(id);
      }, 12000);
    },

    /** Konfigurácia zoznamu firiem pre `DataList`. */
    listConfig(rows) {
      const statusIdx = (k) => { const i = LL().STATUS.findIndex(s => s[0] === k); return i < 0 ? 99 : i; };
      const host = (w) => (w ? SD().hostOf(w) : '');
      const scoreCell = (r) => (r.score == null ? ''
        : `<span class="dl-note ${r.score >= 80 ? 'is-green' : r.score >= 60 ? 'is-amber' : 'is-mute'}"><b class="dl-num">${Number(r.score)}</b></span>`);
      const mailCell = (r) => {
        if (!r.email) return '<span class="dl-note is-mute">bez e-mailu</span>';
        const z = EMAIL_FROM[r.profile && r.profile.email_source];
        return `<span class="dl-two"><a href="mailto:${UI.esc(r.email)}">${UI.esc(r.email)}</a>${
          z ? `<small class="dl-note ${r.profile.email_source === 'ai' ? 'is-amber' : 'is-mute'}">${z}</small>` : ''}</span>`;
      };
      // Google Mapy (079): hodnotenie · recenzie, stav a kedy overené.
      const ratingCell = (r) => {
        const t = OX().ratingLabel(r);
        if (!t) return '';
        const n = Number(r.reviews_count);
        return `<span class="dl-two"><b class="dl-num">${UI.esc(String(Number(r.rating).toFixed(1)).replace('.', ','))}</b>${
          r.reviews_count != null ? `<small>${n} ${Shell.plural(n, 'recenzia', 'recenzie', 'recenzií')}</small>` : ''}</span>`;
      };
      const checkCell = (r) => {
        const st = OX().stateOf(r);
        const kedy = OX().verifiedLabel(r.verified_at);
        const flags = OX().flags(r).filter(f => !['closed', 'temp'].includes(f.key));
        if (!st && !kedy && !flags.length) return '';
        return `<span class="dl-two">${st ? UI.badge(st[1], st[2]) : ''}${kedy ? `<small>${UI.esc(kedy)}</small>` : ''}${
          flags.map(f => `<small class="dl-note ${f.tone === 'gray' ? 'is-mute' : 'is-amber'}">${UI.esc(f.label)}</small>`).join('')}</span>`;
      };
      const dni90 = (r) => { const d = OX().daysSince(r.verified_at); return d != null && d <= 90; };
      return {
        id: 'leads', storageKey: 'leads', label: 'Nové firmy',
        noun: ['firma', 'firmy', 'firiem'],
        rows,
        rowClick: (r) => Lead.detail(r.id),
        rowClass: (r) => (['rejected', 'unsubscribed'].includes(r.status) || r.closed_at ? 'is-muted' : ''),
        rowLabel: (r) => `Firma ${r.name}`,
        rowActions: [...(window.Outreach ? [Outreach.rowAction()] : []),
          { ico: 'repeat', label: 'Overiť znova (Google Mapy, web, e-mail)', run: (r) => Lead.refresh([r.id]) },
          { ico: 'chevron', label: 'Otvoriť firmu', run: (r) => Lead.detail(r.id) }],
        columns: [
          { key: 'firma', label: 'Firma', width: 'minmax(220px, 2fr)', mobile: 'title',
            render: (r) => `<span class="ld-who">${this.logoHtml(r, 30)}<span class="dl-title"><b>${UI.esc(r.name)}</b><small>${UI.esc([[r.postal_code, r.city].filter(Boolean).join(' '),
              r.trade].filter(Boolean).join(' · ') || '—')}</small></span></span>`,
            sortValue: (r) => r.name, sortLabel: 'Názov', csv: (r) => r.name },
          { key: 'stav', label: 'Stav', width: '104px', mobile: 'badge',
            render: (r) => { const st = statusOf(r.status); return UI.badge(st[1], st[2]); }, sortValue: (r) => statusIdx(r.status) },
          { key: 'skore', label: 'Skóre', width: '64px', align: 'right', mobileLabel: 'skóre',
            tip: 'Ako veľmi sa firma podobá na zadané firmy, 0–100 (odhad AI). Len pri hľadaní podľa webov firiem.',
            render: scoreCell, sortValue: (r) => (r.score == null ? null : Number(r.score)), sortDir: -1 },
          { key: 'vhodna', label: 'Vhodná?', width: '76px', align: 'center', mobileLabel: 'vhodná?',
            tip: 'Palec hore = takéto firmy chceme, palec dole = nechceme (s krátkym dôvodom). AI sa z toho učí: pri ďalšom hľadaní hľadá podobné ako firmy s palcom hore a vynecháva podobné ako s palcom dole. Druhý klik na ten istý palec hodnotenie zruší.',
            render: (r) => this.rateHtml(r), sortValue: (r) => (Number(r.relevance) ? Number(r.relevance) : null), sortDir: -1,
            csv: (r) => (Number(r.relevance) === 1 ? 'relevantná' : Number(r.relevance) === -1 ? 'nerelevantná' : '') },
          { key: 'email', label: 'E-mail', width: 'minmax(150px, 1.3fr)', mobileLabel: 'e-mail',
            tip: 'z Impressum = appka ho našla na stránke Impressum firmy. z webu firmy = je uverejnený na ich webe. Neoverený = našla ho AI, ale web firmy sa nedal stiahnuť — pred oslovením si ho overte.',
            render: mailCell, sortValue: (r) => r.email || null, csv: (r) => r.email || '' },
          { key: 'mapy', label: 'Hodnotenie', width: '92px', align: 'right', hideBelow: 1050, mobileLabel: 'hodnotenie',
            tip: 'Hodnotenie na Google Mapách (0–5) a počet recenzií pri poslednom overení. Len pri firmách z Google Máp alebo overených.',
            render: ratingCell, sortValue: (r) => (r.rating == null ? null : [Number(r.rating), Number(r.reviews_count) || 0]), sortDir: -1,
            csv: (r) => OX().ratingLabel(r) },
          { key: 'overenie', label: 'Overenie', width: '150px', hideBelow: 900, mobileLabel: 'overenie',
            tip: 'Funguje / Dočasne zatvorená / Zatvorená = stav na Google Mapách. Pod tým, kedy appka firmu naposledy overila. Web nefunguje = úvodná stránka neodpovedala. E-mail neoverený = doména e-mailu nemá poštový server (MX), e-mail by sa asi nedoručil. Overuje sa raz týždenne samo, alebo tlačidlom „Overiť znova".',
            render: checkCell, sortValue: (r) => r.verified_at || null, sortDir: -1,
            csv: (r) => [((OX().stateOf(r) || [])[1] || ''), OX().verifiedLabel(r.verified_at) || ''].filter(Boolean).join(', ') },
          { key: 'konatel', label: 'Konateľ', width: 'minmax(110px, 1fr)', hideBelow: 1250, mobileLabel: 'konateľ',
            render: (r) => (r.contact_person ? UI.esc(r.contact_person) : ''), sortValue: (r) => r.contact_person || null },
          { key: 'web', label: 'Web', width: '130px', hideBelow: 1200,
            render: (r) => (r.website ? `<a class="ld-weblink" href="${UI.esc(/^https?:/i.test(r.website) ? r.website : `https://${r.website}`)}" target="_blank" rel="noopener" title="${UI.esc(r.website)}">${UI.esc(host(r.website) || r.website)}</a>` : ''),
            sortValue: (r) => host(r.website) || null, csv: (r) => r.website || '' },
          { key: 'vzdialenost', label: 'Od nás', width: '96px', align: 'right', hidden: true, mobileLabel: 'od nás',
            tip: 'Vzdušnou čiarou od kancelárie (súradnice v Nastaveniach → Fakturačné údaje). Po ceste autom to býva asi o tretinu viac.',
            render: (r) => { const d = this.dist(r); return d && d.office ? `<span class="dl-num">${UI.esc(LV().fmtKm(d.office.km).replace('cca ', ''))}</span>` : ''; },
            sortValue: (r) => { const d = this.dist(r); return d && d.office ? d.office.km : null; },
            csv: (r) => { const d = this.dist(r); return d && d.office ? d.office.km : ''; } },
          { key: 'krok', label: 'Ďalší krok', width: 'minmax(130px, 1fr)', hideBelow: 1380, mobileLabel: 'ďalší krok',
            tip: 'Dohodnutý ďalší krok s firmou (z kontaktu v detaile firmy). Na jeho deň je úloha v Úlohách. Červený = dnes alebo skôr.',
            render: (r) => this.nextStepCell(r), sortValue: (r) => r.next_step_at || null,
            csv: (r) => [r.next_step_at ? String(r.next_step_at).slice(0, 10) : '', r.next_step_text || ''].filter(Boolean).join(' ') },
          { key: 'kontakt', label: 'Posledný kontakt', width: '112px', hidden: true, mobileLabel: 'kontakt',
            render: (r) => (r.last_contact_at ? `<span class="dl-num">${UI.esc(DanubraDataList.fmtDay(r.last_contact_at))}</span>` : ''),
            sortValue: (r) => r.last_contact_at || null, sortDir: -1, csv: (r) => (r.last_contact_at ? String(r.last_contact_at).slice(0, 10) : '') },
          { key: 'zdroj', label: 'Zdroj', width: '120px', hideBelow: 1000, mobileLabel: 'zdroj',
            render: (r) => `<span class="dl-two"><span>${SOURCE[r.source] || r.source || ''}</span>${
              r.seed_search_id ? `<small class="dl-note is-mute">${UI.esc(this.searchLabel(r.seed_search_id))}</small>` : ''}${
              tipLine(r) ? `<small class="dl-note is-mute">${UI.esc(tipLine(r))}</small>` : ''}</span>`,
            sortValue: (r) => SOURCE[r.source] || r.source },
          // Oslovenie: odoslané / otvorené / klik / odpoveď / nedoručené + dátum (js/modules/outreach.js).
          ...(window.Outreach ? [Outreach.column()] : []),
        ],
        sort: { key: 'skore', dir: -1 },
        sorts: [{ key: 'pridana', label: 'Pridaná', value: (r) => r.created_at, dir: -1 }],
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať meno, mesto, remeslo…', label: 'Hľadať meno, mesto, remeslo, e-mail alebo konateľa',
            fields: ['name', 'city', 'trade', 'email', 'contact_person', 'region', 'website'] },
          { key: 'stav', type: 'multi', label: 'Stav', value: 'status', options: LL().STATUS.map(s => [s[0], s[1]]), sortOptions: false,
            allLabel: 'Všetky', hint: 'Nová = ešte sme jej nepísali. Oslovená = odišiel jej e-mail (prepne sa samo po odoslaní). Odpísala, Má záujem a Nemá záujem nastavujete Vy. Odhlásená = v e-maile klikla na odhlásenie a už jej nič nepôjde.' },
          { key: 'hladanie', type: 'select', label: 'Hľadanie', value: 'seed_search_id', allLabel: 'Všetky hľadania',
            optionLabel: (id) => this.searchLabel(id), emptyLabel: 'Bez hľadania podľa webov' },
          { key: 'mail', type: 'toggle', label: 'Má e-mail', test: (r) => LL().emailOk(r.email),
            hint: 'Len firmy, ktorým sa dá poslať e-mail.' },
          { key: 'funguje', type: 'toggle', label: 'Len fungujúce', test: (r) => !r.closed_at && !['CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY'].includes(r.business_status),
            hint: 'Skryje firmy, ktoré sú podľa Google Máp zatvorené natrvalo alebo dočasne. Firmy, ktoré ešte overené neboli, ostanú.' },
          { key: 'overene90', type: 'toggle', label: 'Overené za posledných 90 dní', test: dni90, more: true,
            hint: 'Len firmy, ktoré appka za posledných 90 dní overila na Google Mapách (či existujú a údaje sedia).' },
          { key: 'hodnotenie', type: 'range-number', label: 'Hodnotenie od', value: 'rating', more: true,
            hint: 'Hodnotenie na Google Mapách, napr. od 4 — firmy, s ktorými sú zákazníci spokojní.' },
          { key: 'recenzie', type: 'range-number', label: 'Recenzie od', value: 'reviews_count', more: true,
            hint: 'Počet recenzií na Google Mapách, napr. od 10 — väčšie a aktívne firmy.' },
          { key: 'remeslo', type: 'select', label: 'Remeslo', value: 'trade', allLabel: 'Všetky remeslá', emptyLabel: 'Nezadané', more: true },
          { key: 'mesto', type: 'select', label: 'Mesto / región', value: (r) => r.region || r.city, allLabel: 'Všetky', emptyLabel: 'Nezadané', more: true },
          { key: 'zdroj', type: 'select', label: 'Zdroj', value: 'source', allLabel: 'Všetky zdroje', more: true,
            options: Object.entries(SOURCE).map(([k, l]) => [k, l]) },
          { key: 'skore', type: 'range-number', label: 'Skóre od', value: 'score', more: true,
            hint: 'Napr. od 70 — len firmy, ktoré sa na zadané firmy naozaj podobajú.' },
          { key: 'relevancia', type: 'select', label: 'Hodnotenie palcom', more: true, allLabel: 'Všetky', sortOptions: false,
            value: (r) => (Number(r.relevance) === 1 ? 'up' : Number(r.relevance) === -1 ? 'down' : 'none'),
            options: [['up', 'Relevantné'], ['down', 'Nerelevantné'], ['none', 'Nehodnotené']],
            hint: 'Relevantné = palec hore, Nerelevantné = palec dole, Nehodnotené = ešte bez palca. Ohodnotené firmy AI berie ako príklady pri ďalšom hľadaní.' },
          // Oslovené, Otvoril, Klikol, Odpovedal, Nedoručené, Čaká na pripomenutie (js/modules/outreach.js).
          ...(window.Outreach ? Outreach.filters() : []),
        ],
        empty: { ico: 'search', title: 'Zatiaľ žiadne firmy', sub: 'Kliknite na „Hľadať podobné firmy" — appka ich nájde podľa webov firiem, ktoré zadáte, alebo podľa Vašich odberateľov.',
          cta: `<button class="btn btn-primary" onclick="Lead.findForm()">${Icon('search')} Hľadať podobné firmy</button>` },
        export: {
          name: ['nove-firmy'],
          // Kontakty s firmami (lead-contacts.js): firmy s posledným kontaktom a ďalším krokom, všetky hovory a e-maily.
          more: window.LeadContacts && LeadContacts.exportLeads ? [
            { label: 'Firmy s kontaktmi (CSV)', ico: 'clients', title: 'Zobrazené firmy s kategóriou, posledným kontaktom, ďalším krokom a e-mailmi',
              run: (rows) => LeadContacts.exportLeads(rows, { searches: Lead.searches }) },
            { label: 'Všetky kontakty (CSV)', ico: 'phone', title: 'Každý hovor, e-mail, stretnutie a oprava pri všetkých firmách',
              run: () => LeadContacts.exportContacts(Lead.rows) },
          ] : [],
          columns: [
            ['Firma', r => r.name], ['Stav', r => statusOf(r.status)[1]], ['Skóre', r => r.score], ['E-mail', r => r.email],
            ['E-mail odkiaľ', r => EMAIL_FROM[r.profile && r.profile.email_source] || ''], ['Telefón', r => r.phone],
            ['Konateľ', r => r.contact_person], ['USt-IdNr', r => r.vat_id], ['Web', r => r.website], ['Ulica', r => r.address],
            ['PSČ', r => r.postal_code], ['Mesto', r => r.city], ['Región', r => r.region], ['Remeslo', r => r.trade],
            ['Veľkosť', r => r.employees], ['Prečo', r => r.why], ['Zdroj', r => SOURCE[r.source] || r.source],
            ['Hľadanie', r => (r.seed_search_id ? this.searchLabel(r.seed_search_id) : '')], ['Tip od kolegu', r => r.tip_by || ''],
            ['Hodnotenie', r => r.rating], ['Recenzie', r => r.reviews_count],
            ['Stav na Mapách', r => ((OX().stateOf(r) || [])[1] || '')], ['Overené', r => (r.verified_at ? String(r.verified_at).slice(0, 10) : '')],
            ['Web funguje', r => (r.web_ok == null ? '' : r.web_ok ? 'áno' : 'nie')], ['E-mail má MX', r => (r.email_mx_ok == null ? '' : r.email_mx_ok ? 'áno' : 'nie')],
            ['Kategórie (Mapy)', r => (Array.isArray(r.categories) ? r.categories.join(', ') : '')],
            ['Hodnotenie palcom', r => (Number(r.relevance) === 1 ? 'relevantná' : Number(r.relevance) === -1 ? 'nerelevantná' : '')],
            ['Dôvod (palec dole)', r => r.relevance_note || ''],
            ['Posledný kontakt', r => (r.last_contact_at ? String(r.last_contact_at).slice(0, 10) : '')],
            ['Ďalší krok', r => [r.next_step_at ? String(r.next_step_at).slice(0, 10) : '', r.next_step_text || ''].filter(Boolean).join(' ')],
            ['Oslovenie', r => { try { return window.Outreach ? Outreach.column().csv(r) : ''; } catch (e) { return ''; } }],
            ['Od kancelárie (km)', r => { const d = this.dist(r); return d && d.office ? d.office.km : ''; }],
            ['Najbližšia zákazka (km)', r => { const d = this.dist(r); return d && d.site ? `${d.site.km} (${d.site.title})` : ''; }],
            ['Google Mapy', r => LV().mapsUrl(r)],
            ['Popis webu', r => r.site_description || ''],
          ],
        },
      };
    },

    /** Odkiaľ je e-mail (pri hľadaní podľa webov): z Impressum, z webu, neoverený. */
    emailFrom(r) {
      const src = r.profile && r.profile.email_source;
      if (!EMAIL_FROM[src]) return '';
      return `<span class="link-chip is-static">${EMAIL_FROM[src]}</span>${UI.tip(src === 'ai'
        ? 'Tento e-mail našla AI, ale web firmy sa nedal stiahnuť, takže appka ho nevidela na vlastné oči. Pred oslovením si ho overte na ich webe.'
        : 'E-mail je uverejnený na webe firmy (Impressum alebo Kontakt) — appka ho tam našla sama, nevymyslela ho AI.')}`;
    },

    /** Skóre, konateľ, USt-IdNr, veľkosť a čomu sa podobá — z hľadania podľa webov. */
    seedFacts(r) {
      const p = r.profile || {};
      const fakty = [
        r.score != null ? `skóre <b>${Number(r.score)}</b>` : '',
        r.contact_person ? `konateľ ${UI.esc(r.contact_person)}` : '',
        r.vat_id ? `USt-IdNr ${UI.esc(r.vat_id)}` : '',
        r.employees ? `${UI.esc(r.employees)} zamestnancov` : '',
        r.region ? UI.esc(r.region) : '',
        p.similar_to_url ? `ako ${UI.esc(SD().hostOf(p.similar_to_url))}` : '',
      ].filter(Boolean);
      if (!fakty.length && !p.summary && !r.impressum_url) return '';
      return `<div style="font-size:12.5px;margin:0 0 8px;">${fakty.join(' · ')}${fakty.length ? UI.tip(
        'Skóre = ako veľmi sa firma podobá na zadané firmy, 0–100 (odhad AI). Konateľ a USt-IdNr sú z Impressum firmy. Počet zamestnancov je len odhad. „ako …" = ktorej zo zadaných firiem sa podobá najviac.') : ''}
        ${p.summary ? `<div style="color:var(--ink-sub);">${UI.esc(p.summary)}</div>` : ''}
        ${r.impressum_url ? `<a target="_blank" rel="noopener" href="${UI.esc(r.impressum_url)}">Impressum</a>` : ''}</div>`;
    },

    /** Google Mapy pri firme: hodnotenie, stav, kedy overené, štítky, kategórie, odkaz. */
    mapsFacts(r) {
      const ds = r.data_source || {};
      const st = OX().stateOf(r);
      const kedy = OX().verifiedLabel(r.verified_at);
      const flags = OX().flags(r).filter(f => !['closed', 'temp'].includes(f.key));
      const rating = OX().ratingLabel(r);
      const kat = Array.isArray(r.categories) ? r.categories.slice(0, 4) : [];
      if (!st && !kedy && !flags.length && !rating && !kat.length) return '';
      const link = /^https:\/\/(www\.)?google\.[a-z.]+\/maps\//i.test(ds.maps_url || '') ? ds.maps_url : '';
      return `<div class="link-row" style="margin-bottom:8px;">
        ${st ? UI.badge(st[1], st[2]) : ''}
        ${rating ? `<span class="link-chip is-static">Hodnotenie ${UI.esc(rating)}</span>` : ''}
        ${flags.map(f => `<span class="link-chip is-static">${UI.esc(f.label)}</span>`).join('')}
        ${kedy ? `<span class="link-chip is-static">${UI.esc(kedy)}</span>` : ''}
        ${link ? `<a class="link-chip" target="_blank" rel="noopener" href="${UI.esc(link)}">${Icon('pin', 13)}<span>Google Mapy</span></a>` : ''}
        ${UI.tip('Údaje z Google Máp (cez Outscraper): stav firmy, hodnotenie · počet recenzií a kedy ich appka naposledy overila. Zatvorená = firma je na Mapách natrvalo zatvorená, appka jej e-mail nepošle. Web nefunguje = úvodná stránka neodpovedala. E-mail neoverený = doména e-mailu nemá poštový server (MX). Overuje sa raz týždenne samo, alebo tlačidlom „Overiť znova".')}
        ${kat.length ? `<div style="width:100%;font-size:12px;color:var(--ink-sub);">${kat.map(UI.esc).join(' · ')}</div>` : ''}
      </div>`;
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
        ${r.why ? `<div style="font-size:12.5px;color:var(--ink-sub);margin:0 0 8px;">${UI.esc(r.why)}${UI.tip(r.source === 'urls'
          ? 'Prečo túto firmu navrhla AI: v čom sa podobá na firmy, ktorých weby ste zadali. Je to len odhad AI, pred oslovením si pozrite jej web.'
          : 'Prečo túto firmu navrhla AI: v čom sa podobá na Vašich odberateľov. Je to len odhad AI, pred oslovením si pozrite jej web.')}</div>` : ''}
        ${this.seedFacts(r)}
        ${this.mapsFacts(r)}
        <div class="link-row" style="margin-bottom:8px;">
          ${r.email ? `<a class="link-chip" href="mailto:${UI.esc(r.email)}">${Icon('mail', 13)}<span>${UI.esc(r.email)}</span></a>${this.emailFrom(r)}` : `<span class="link-chip is-static">bez e-mailu</span>${UI.tip('Firme bez e-mailu appka hromadný e-mail nepošle. Osloviť ju môžete telefonicky alebo cez formulár na jej webe; e-mail potom doplňte, keď ho zistíte.')}`}
          ${r.phone ? `<a class="link-chip" href="tel:${UI.esc(r.phone.replace(/[^\d+]/g, ''))}">${Icon('phone', 13)}<span>${UI.esc(r.phone)}</span></a>` : ''}
          ${web ? `<a class="link-chip" target="_blank" rel="noopener" href="${UI.esc(web)}">${Icon('site', 13)}<span>Web</span></a>` : ''}
          ${r.similar_to ? `<span class="link-chip is-static">ako ${UI.esc(this.partnerName(r.similar_to))}</span>` : ''}
          <span class="link-chip is-static">${SOURCE[r.source] || 'ručne'}</span>${UI.tip(
            'Odkiaľ sa firma vzala. Google Mapy = našiel ju Outscraper na Google Mapách podľa webov firiem, ktoré ste zadali; kontakty appka vytiahla z jej Impressum. Podľa webov = AI ju našla podľa webov firiem, ktoré ste zadali, a kontakty appka vytiahla z jej Impressum. Mapa = OpenStreetMap, verejná mapa (zadarmo, e-mail býva zriedka). AI = umelá inteligencia ju našla na internete podľa Vašich odberateľov, e-mail vzala z Impressum na webe firmy. Ručne = pridali ste ju Vy. „ako …" = firma sa podobá na tohto Vášho odberateľa.')}
        </div>
        ${r.notes ? `<div class="notebox" style="white-space:pre-wrap;font-size:12.5px;">${UI.esc(r.notes)}</div>` : ''}
        <div class="lr-card"><span>Vhodná firma?</span>${this.rateHtml(r, { big: true })}${UI.tip('Palec hore = takéto firmy chceme, palec dole = nechceme (s krátkym dôvodom). AI sa z toho učí: pri ďalšom hľadaní hľadá podobné ako dobré a vynecháva podobné ako zlé. Druhý klik na ten istý palec hodnotenie zruší.')}
          <small class="lr-why" data-lr-why="${UI.esc(r.id)}"${Number(r.relevance) === -1 && r.relevance_note ? '' : ' hidden'}>${Number(r.relevance) === -1 && r.relevance_note ? `Dôvod: ${UI.esc(r.relevance_note)}` : ''}</small></div>
        <div class="js-acts" style="margin-top:6px;">
          <select class="verif-sel" onchange="Lead.setStatus('${r.id}', this.value)">
            ${LL().STATUS.filter(s => s[0] !== 'won').map(([k, l]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${l}</option>`).join('')}
            ${r.status === 'won' ? '<option value="won" selected>Je odberateľ</option>' : ''}
          </select>${UI.tip('Stav meníte Vy podľa toho, ako firma reagovala. Podľa stavu potom pri e-maile vyberáte, komu ho poslať. „Je odberateľ" sa nastaví samo tlačidlom Urobiť odberateľa.')}
          <button class="btn btn-ghost btn-sm" onclick="Lead.note('${r.id}')">${Icon('note', 14)} Poznámka</button>
          <button class="btn btn-ghost btn-sm" onclick="Lead.refresh(['${r.id}'])">${Icon('repeat', 14)} Overiť znova</button>${UI.tip('Appka overí firmu na Google Mapách (či funguje, telefón, web, hodnotenie), či jej web odpovedá a či má doména e-mailu poštový server. Nič sa neposiela. Výsledok sa ukáže o chvíľu.')}
          ${r.partner_id ? Danubra.link('partner', r.partner_id, 'Odberateľ')
            : `<button class="btn btn-outline btn-sm" onclick="Lead.toPartner('${r.id}')">${Icon('clients', 14)} Urobiť odberateľa</button>${UI.tip('Založí firmu v Odberateľoch s jej menom, adresou, e-mailom, telefónom a poznámkami. Tu zostane so stavom Je odberateľ. USt-IdNr a kontaktnú osobu doplníte v Odberateľoch.')}`}
        </div>
      </div>`;
    },

    /** Overiť firmy (Google Mapy, web, MX) na serveri — najviac 50 naraz. */
    async refresh(ids) {
      const list = [...new Set((ids || []).filter(Boolean))].slice(0, REFRESH_MAX);
      if (!list.length) return UI.toast('Nie je čo overiť', 'err');
      const t = await token();
      try {
        const x = await fetch('/.netlify/functions/danubra-leads-refresh-background', { method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ lead_ids: list }) });
        if (!x.ok && x.status !== 202) return UI.toast(`Server overenie odmietol (${x.status}) — skúste to znova`, 'err');
      } catch (e) { return UI.toast('Server na overenie neodpovedá — skúste to znova', 'err'); }
      // Popri tom aj logo a náhľad webu (zadarmo, len úvodná stránka firmy).
      this.callSiteMeta({ lead_ids: list }).catch(() => null);
      UI.toast(list.length === 1 ? 'Overujem firmu — výsledok sa ukáže o chvíľu' : `Overujem ${list.length} firiem — výsledok sa ukáže o 1–3 minúty`, 'ok');
      clearTimeout(this._refreshPoll);
      const znova = (ms, dalsi) => { this._refreshPoll = setTimeout(() => {
        if (Danubra.route !== 'leads') return;
        this.loaded = false; Danubra.renderRoute();
        if (dalsi) znova(dalsi, null);
      }, ms); };
      znova(list.length === 1 ? 20000 : 60000, list.length === 1 ? 40000 : 120000);
    },

    /** „Overiť zobrazené": firmy, ktoré sú práve vo vyfiltrovanom zozname (najviac 50). */
    async refreshVisible() {
      let rows = [];
      try { rows = (DataList.visible('leads') || []).filter(r => r && r.id); } catch (e) { rows = []; }
      if (!rows.length) return UI.toast('V zozname nie je žiadna firma', 'err');
      const n = Math.min(rows.length, REFRESH_MAX);
      const viac = rows.length > REFRESH_MAX ? ` Zobrazených je ${rows.length} — overí sa prvých ${REFRESH_MAX} v poradí zoznamu.` : '';
      if (!await UI.confirm(`Overiť ${n} ${Shell.plural(n, 'firmu', 'firmy', 'firiem')} na Google Mapách, ich weby a e-maily?${viac} Outscraper účtuje za každú overenú firmu jeden záznam.`)) return;
      return this.refresh(rows.slice(0, REFRESH_MAX).map(r => r.id));
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
        // Z Impressum (hľadanie podľa webov), ak sa našli — inak sa doplnia v Odberateľoch.
        ust_idnr: r.vat_id || null, contact_person: r.contact_person || null,
        source: 'marketing', notes: r.notes || null });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const { error: e2 } = await DB.update('leads', id, { status: 'won', partner_id: data.id });
      if (e2) {
        UI.toast('Odberateľ založený, ale firma sa neoznačila ako získaná: ' + e2.message, 'err');
        return Danubra.renderRoute();
      }
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
      const crafts = Object.entries(LL().CRAFTS);
      const zaklad = ['builder', 'plasterer', 'tiler', 'painter', 'metal_construction', 'electrician', 'carpenter'];
      const mode = this._findMode === 'partners' && this.partners.length ? 'partners' : 'urls';
      UI.modal('Hľadať podobné firmy', `
        <div class="pillbar pillbar-xs" style="margin-bottom:12px;">
          <button type="button" class="pill${mode === 'urls' ? ' active' : ''}" data-fmode="urls" onclick="Lead.findMode('urls')">Podľa webov firiem</button>
          <button type="button" class="pill${mode === 'partners' ? ' active' : ''}" data-fmode="partners" onclick="Lead.findMode('partners')">Podľa našich odberateľov</button>
        </div>
        ${(() => { const b = this.searches.find(x => x.kind === 'urls' && RUNNING.includes(x.status)); return b ? `<div data-fpane="urls"${mode === 'urls' ? '' : ' hidden'}>${this.progressHtml(b, { modal: true })}</div>` : ''; })()}
        ${this.urlsFormHtml(mode !== 'urls')}
        ${this.partners.length ? '' : `<div class="regimebox" data-fpane="partners"${mode === 'partners' ? '' : ' hidden'}>Na hľadanie podľa odberateľov treba mať aspoň jedného odberateľa. Použite hľadanie podľa webov firiem.</div>`}
        <form id="find-form" data-fpane="partners" onsubmit="event.preventDefault()"${mode === 'partners' && this.partners.length ? '' : ' hidden'}>
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
      this.urlPreview();
      this.bindHints();
      this.loadSuggestions(false);
      this.loadStatus().then(() => this.urlEstimate());
      const b = this.searches.find(x => x.kind === 'urls' && RUNNING.includes(x.status));
      if (b) this.watch(b.id);
    },

    /** Prepne okno hľadania: podľa webov firiem / podľa našich odberateľov. */
    findMode(mode) {
      this._findMode = mode;
      document.querySelectorAll('[data-fmode]').forEach(b => b.classList.toggle('active', b.dataset.fmode === mode));
      document.querySelectorAll('[data-fpane]').forEach(p => { p.hidden = p.dataset.fpane !== mode; });
    },

    /** Formulár „Podľa webov firiem": 3–10 adries, región, počet, poznámka. */
    urlsFormHtml(hidden) {
      const SDx = SD();
      return `<form id="find-urls" data-fpane="urls" onsubmit="event.preventDefault();Lead.searchUrls()"${hidden ? ' hidden' : ''}>
        <div class="ls-sug">
          <div class="form-section ls-sug-h">Navrhované hľadania${UI.tip('AI sa pozrie na Vašich odberateľov, firmy s palcom hore, firmy, ktoré odpísali alebo majú záujem, a na predošlé hľadania (čo vyšlo, kde ste už hľadali) — a navrhne, kde a podľa ktorých webov hľadať ďalej. Klik na návrh vyplní formulár; pred hľadaním ho môžete upraviť.')}
            <button type="button" class="btn btn-ghost btn-sm" onclick="Lead.loadSuggestions(true)">${Icon('repeat', 13)} Navrhnúť znova</button></div>
          <div id="find-sug-list" class="ls-cards" aria-live="polite">${this.sugCardsHtml()}</div>
        </div>
        <div class="fld-full">${UI.field('urls', `Weby firiem (${SDx.MIN_SEEDS} až ${SDx.MAX_SEEDS}, jedna na riadok)`, { type: 'textarea', rows: 6,
          placeholder: 'https://www.firma-trockenbau.de\nwww.iny-ausbau.de\nelektro-firma.de', value: this._urlsDraft || '',
          tip: 'Weby nemeckých firiem, aké chcete nájsť — napríklad Vašich najlepších odberateľov alebo firmy, ktoré poznáte. AI z ich webov zistí, čo robia, a nájde podobné. Stačí doména (firma.de), https:// sa doplní samo. Rovnaká firma zadaná dvakrát sa zoberie raz.' })}</div>
        <div class="ls-pick-row"><button type="button" class="btn btn-ghost btn-sm" onclick="Lead.toggleSeedPicker()">${Icon('clients', 14)} Navrhnúť vzorové weby</button>${
          UI.tip('Ponuka webov Vašich odberateľov a firiem, ktoré odpísali, majú záujem alebo majú palec hore. Zaškrtnutím web pridáte do poľa, odškrtnutím ho z poľa vyberiete.')}</div>
        <div id="find-seedpick" class="ls-pick" hidden></div>
        <div id="find-urls-out" class="card-note" aria-live="polite"></div>
        <div class="form-grid">
          ${UI.field('u_region', 'Región / oblasť (nepovinné)', { placeholder: 'napr. München, 86150 Augsburg, Bayern, okolie Stuttgartu',
            tip: 'Mestá, PSČ alebo spolková krajina, kde hľadať — aj viac naraz, oddelené čiarkou. Na Google Mapách sa hľadá v nich a v ich okolí (susedné mestá). Keď je prázdne, hľadá sa v mestách zadaných firiem a v ich okolí.' })}
          ${UI.field('u_count', 'Koľko firiem uložiť', { value: '20', options: SDx.COUNTS.map(c => [String(c), String(c)]), onchange: 'Lead.urlEstimate()',
            tip: 'Koľko firiem sa najviac uloží. Prehľadá sa ich asi trikrát viac, lebo časť sa vyradí (zatvorené, už ich máte, nízke skóre). Viac firiem = dlhšie hľadanie (až 10 minút) a vyššia cena. Firmy, ktoré už máte, sa neuložia znova.' })}
          ${UI.field('u_min', 'Prah skóre', { value: String(OX().DEFAULT_MIN_SCORE), options: OX().MIN_SCORES.map(c => [String(c), `od ${c}`]),
            tip: 'AI dá každej nájdenej firme skóre 0–100 podľa toho, ako sa podobá zadaným firmám (druh prác, veľkosť, typ zákaziek). Uložia sa len firmy so skóre aspoň takýmto. Vyšší prah = menej firiem, ale presnejších.' })}
          ${UI.field('u_noweb', 'Aj firmy bez webu', { type: 'checkbox', value: false,
            tip: 'Predvolene sa firmy bez webu vyraďujú: nedá sa stiahnuť ich Impressum (e-mail, konateľ) a AI má o nich málo údajov. Zaškrtnite, ak chcete aj takéto — budú najmä s telefónom.' })}
          <div class="fld-full">${UI.field('u_note', 'Poznámka (nepovinné)', { placeholder: 'napr. len firmy so suchou výstavbou, nad 20 zamestnancov',
            tip: 'Vlastnými slovami, aké firmy chcete. AI to zoberie do úvahy. Môžete písať po slovensky.' })}</div>
          <div class="fld-full ls-chips" id="find-cats"></div>
        </div>
        <div id="find-urls-os" aria-live="polite">${this.osBoxHtml()}</div>
        <p class="card-note">Pri každej nájdenej firme appka stiahne jej Impressum a vezme z neho e-mail, telefón, adresu, USt-IdNr a konateľa.
          E-mail sa uloží len taký, ktorý je na ich webe — nič sa nevymýšľa.${UI.tip('Impressum = povinná stránka nemeckého webu s údajmi o firme. Prednostne sa berie firemný e-mail (info@, kontakt@, büro@), osobný len keď je v Impressum uvedený ako kontakt. E-mail cudzej domény (napríklad webdizajnéra) sa neberie. Keď Impressum e-mail nemá, pri vybraných firmách sa skúsi Outscraper (kontakty z webu firmy). Hľadá sa na pozadí 3–10 minút, nájdené firmy sa uložia samy a okno môžete zavrieť.')}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
          <button type="submit" class="btn btn-primary" id="find-urls-go">${Icon('search', 14)} Hľadať</button>
        </div>
      </form>`;
    },

    /** Rámik v okne hľadania: je Outscraper zapnutý a koľko záznamov prehľadá. */
    osBoxHtml() {
      const st = this.osStatus;
      if (!st) return '<div class="notebox">Zisťujem, či je zapnuté hľadanie na Google Mapách…</div>';
      if (!st.on) {
        return `<div class="notebox">${Icon('info', 14)} Hľadanie na Google Mapách (Outscraper) nie je zapnuté — chýba kľúč OUTSCRAPER_API_KEY v Netlify. Firmy nájde AI na webe ako doteraz.${
          UI.tip('S Outscraperom appka berie firmy priamo z Google Máp: aktuálne adresy, telefóny, weby, hodnotenie, počet recenzií a či firma ešte funguje. Kľúč sa zadáva v Netlify (Site configuration → Environment variables), nikdy nie v appke.')}</div>`;
      }
      const f = document.getElementById('find-urls');
      const count = f ? SD().clampCount((f.querySelector('[name=u_count]') || {}).value) : 20;
      const x = OX().estimate({ count, max: st.max });
      return `<div class="regimebox">${Icon('check', 14)} Hľadá sa na Google Mapách cez Outscraper. Outscraper prehľadá najviac cca <b>${x}</b> ${Shell.plural(x, 'záznam', 'záznamy', 'záznamov')}.${
        UI.tip(`Outscraper účtuje za každý vrátený záznam (firmu z Google Máp). Prehľadá sa asi trikrát viac firiem, než chcete uložiť, lebo časť sa vyradí; strop jedného hľadania je ${st.max} záznamov (OUTSCRAPER_MAX_RECORDS). Kontakty (e-maily z webu) sa dopytujú len pri vybraných firmách, ktoré nemajú e-mail v Impressum, a účtujú sa zvlášť. Podľa cenníka Outscraperu je prvých 500 záznamov z Máp mesačne zadarmo, potom asi 3 USD za 1 000 — aktuálnu cenu si overte na outscraper.com.`)}</div>`;
    },

    /** Prepočíta odhad po zmene počtu firiem. */
    urlEstimate() {
      const box = document.getElementById('find-urls-os');
      if (box) box.innerHTML = this.osBoxHtml();
    },

    /** Pod poľom s adresami: rozpoznané domény, duplicity, chyby. */
    urlPreview() {
      const f = document.getElementById('find-urls');
      const out = document.getElementById('find-urls-out');
      if (!f || !out) return null;
      const ta = f.querySelector('[name=urls]');
      if (ta && !ta.dataset.bound) { ta.dataset.bound = '1'; ta.addEventListener('input', () => { this._urlsDraft = ta.value; this.urlPreview(); }); }
      const r = SD().parseSeeds(ta ? ta.value : '');
      const nic = !r.seeds.length && !r.invalid.length;
      out.innerHTML = nic ? `Zadajte ${SD().MIN_SEEDS} až ${SD().MAX_SEEDS} webov firiem.` : `
        ${r.seeds.length ? `<div class="link-row">${r.seeds.map(s => `<span class="link-chip is-static">${Icon('site', 13)}<span>${UI.esc(s.domain)}</span></span>`).join('')}</div>` : ''}
        ${r.duplicates.length ? `<div>Zadané dvakrát (berie sa raz): ${r.duplicates.map(UI.esc).join(', ')}</div>` : ''}
        ${r.invalid.length ? `<div style="color:var(--red);">Nedá sa použiť: ${r.invalid.map(x => `${UI.esc(x.input)} (${UI.esc(x.error)})`).join(', ')}</div>` : ''}
        ${r.error ? `<div style="color:var(--red);">${UI.esc(r.error)}</div>` : `<div>${r.seeds.length} ${Shell.plural(r.seeds.length, 'firma', 'firmy', 'firiem')} — môžete hľadať.</div>`}`;
      const go = document.getElementById('find-urls-go');
      if (go) go.disabled = !r.ok;
      return r;
    },

    // ── Navrhované hľadania a našepkávanie (080) ──────────────────────────
    /** Karty „Navrhované hľadania" (z pamäte, alebo čakanie). */
    sugCardsHtml() {
      const x = this._sug;
      if (!x) return `<div class="ls-wait"><span class="lp-spin" aria-hidden="true"></span> AI pripravuje návrhy z Vašich výsledkov…</div>`;
      const list = Array.isArray(x.suggestions) ? x.suggestions : [];
      if (!list.length) {
        return `<div class="ls-empty">${UI.esc(x.reason || 'Zatiaľ nie je z čoho navrhovať. Keď budete mať odberateľov s webom alebo firmy so záujmom či palcom hore, appka navrhne ďalšie hľadania.')}</div>`;
      }
      const src = x.source === 'ai' ? 'Navrhla AI z Vašich odberateľov, hodnotení a predošlých hľadaní.'
        : `Návrhy podľa pravidiel (najúspešnejšie kategórie a mestá, kde ste ešte nehľadali)${x.ai_error ? ` — ${x.ai_error}` : ''}.`;
      return list.map((g, i) => `<button type="button" class="ls-card" data-sug="${i}" onclick="Lead.useSuggestion(${i})">
          <b>${UI.esc(g.title)}</b>
          ${g.region ? `<span class="ls-meta">${Icon('pin', 12)}<span>${UI.esc(g.region)}</span></span>` : ''}
          ${g.why ? `<span class="ls-why">${UI.esc(g.why)}</span>` : ''}
          <span class="ls-seeds">${(g.seeds || []).map(u => `<i>${UI.esc(SD().hostOf(u) || u)}</i>`).join('')}</span>
        </button>`).join('') + `<div class="ls-src">${Icon(x.source === 'ai' ? 'spark' : 'info', 12)} ${UI.esc(src)}</div>`;
    },

    /** Návrhy zo servera (1 h v pamäti); bez servera pravidlá priamo v appke. */
    async loadSuggestions(force) {
      const paint = () => { const box = document.getElementById('find-sug-list'); if (box) box.innerHTML = this.sugCardsHtml(); };
      if (!force && this._sug && Date.now() - this._sug.at < SUG_TTL) return paint();
      if (force) { this._sug = null; paint(); }
      let r = null;
      try {
        const t = await token();
        const x = await fetch('/.netlify/functions/danubra-leads-suggest', { method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ force: !!force }) });
        r = x.ok ? await x.json() : null;
      } catch (e) { r = null; }
      if (!r || !Array.isArray(r.suggestions)) r = { suggestions: this.localSuggestions(), source: 'rules', ai_error: 'server návrhy neposlal' };
      this._sug = { ...r, at: Date.now() };
      paint();
    },
    localSuggestions() {
      const ctx = LR().suggestContext({ partners: this.partners, leads: this.rows, outreach: (window.Outreach && Outreach.rows) || [], searches: this.searches });
      return LR().ruleSuggestions(ctx);
    },

    /** Klik na návrh vyplní formulár (weby, oblasť, poznámka). */
    useSuggestion(i) {
      const g = this._sug && (this._sug.suggestions || [])[i];
      const f = document.getElementById('find-urls');
      if (!g || !f) return;
      const ta = f.querySelector('[name=urls]');
      if (ta) { ta.value = (g.seeds || []).join('\n'); this._urlsDraft = ta.value; }
      const reg = f.querySelector('[name=u_region]');
      if (reg) reg.value = g.region || '';
      const note = f.querySelector('[name=u_note]');
      if (note && g.note) note.value = g.note;
      document.querySelectorAll('#find-sug-list .ls-card').forEach(c => c.classList.toggle('on', c.dataset.sug === String(i)));
      this.urlPreview();
      this.refreshSeedPicker();
      UI.toast('Návrh je vo formulári — skontrolujte ho a kliknite Hľadať', 'ok');
    },

    /** „Navrhnúť vzorové weby": odberatelia a firmy so záujmom — zaškrtnutím do poľa. */
    toggleSeedPicker() {
      const el = document.getElementById('find-seedpick');
      if (!el) return;
      el.hidden = !el.hidden;
      if (!el.hidden) this.refreshSeedPicker();
    },
    refreshSeedPicker() {
      const el = document.getElementById('find-seedpick');
      const ta = document.querySelector('#find-urls [name=urls]');
      if (!el || el.hidden || !ta) return;
      const opts = LR().seedOptions({ partners: this.partners, leads: this.rows, outreach: (window.Outreach && Outreach.rows) || [] });
      if (!opts.length) {
        el.innerHTML = '<div class="ls-empty">Zatiaľ nemáte odberateľov ani firmy so záujmom, ktoré majú zapísaný web.</div>';
        return;
      }
      const have = new Set(SD().parseSeeds(ta.value).seeds.map(x => SD().baseDomain(x.url)));
      el.innerHTML = opts.map(o => `<label><input type="checkbox" value="${UI.esc(o.url)}" ${have.has(o.domain) ? 'checked' : ''} onchange="Lead.seedPick(this)">
        <span><b>${UI.esc(o.name || o.domain)}</b> <em>${UI.esc([o.domain, o.city, o.why].filter(Boolean).join(' · '))}</em></span></label>`).join('');
    },
    seedPick(cb) {
      const ta = document.querySelector('#find-urls [name=urls]');
      if (!ta || !cb) return;
      const dom = SD().baseDomain(cb.value);
      const lines = ta.value.split(/\n+/).map(x => x.trim()).filter(Boolean).filter(x => SD().baseDomain(x) !== dom);
      if (cb.checked) lines.push(cb.value);
      ta.value = lines.join('\n');
      this._urlsDraft = ta.value;
      this.urlPreview();
    },

    /** Našepkávanie: oblasť (datalist) a kategórie z Google Máp (čipy + datalist). */
    bindHints() {
      const f = document.getElementById('find-urls');
      if (!f || !LR()) return;
      const reg = f.querySelector('[name=u_region]');
      if (reg) {
        let dl = document.getElementById('lr-regions');
        if (!dl) { dl = document.createElement('datalist'); dl.id = 'lr-regions'; f.appendChild(dl); }
        dl.innerHTML = LR().regionHints({ searches: this.searches, leads: this.rows, partners: this.partners })
          .map(r => `<option value="${UI.esc(r.value)}" label="${UI.esc(r.from)}"></option>`).join('');
        reg.setAttribute('list', 'lr-regions');
        reg.setAttribute('autocomplete', 'off');
      }
      const own = LR().categoryHints({ leads: this.rows });
      const cats = own.length ? own.map(c => c.value) : CATS_DEFAULT;
      const note = f.querySelector('[name=u_note]');
      if (note) {
        let dl = document.getElementById('lr-cats');
        if (!dl) { dl = document.createElement('datalist'); dl.id = 'lr-cats'; f.appendChild(dl); }
        dl.innerHTML = cats.map(c => `<option value="${UI.esc(c)}"></option>`).join('');
        note.setAttribute('list', 'lr-cats');
        note.setAttribute('autocomplete', 'off');
      }
      const box = document.getElementById('find-cats');
      if (box) {
        box.innerHTML = `<span>${own.length ? 'Kategórie, ktoré mali dobré výsledky:' : 'Časté kategórie na Google Mapách:'}</span>${
          cats.slice(0, 8).map(c => `<button type="button" class="ls-chip" onclick="Lead.addNote(this.textContent)">${UI.esc(c)}</button>`).join('')}${
          UI.tip(own.length ? 'Kategórie z Google Máp pri firmách s palcom hore, so záujmom alebo s vysokým skóre. Klik pridá kategóriu do poznámky — AI podľa nej zostaví dotazy.'
            : 'Keď budete firmy hodnotiť palcom, tu budú kategórie, ktoré u Vás fungujú. Klik pridá kategóriu do poznámky.')}`;
      }
    },
    addNote(text) {
      const note = document.querySelector('#find-urls [name=u_note]');
      const t = String(text || '').trim();
      if (!note || !t) return;
      const cur = note.value.trim();
      if (cur.toLowerCase().includes(t.toLowerCase())) return;
      note.value = cur ? `${cur}, ${t}` : t;
      note.focus();
    },

    // ── Hodnotenie palcom (080) — AI sa učí ───────────────────────────────
    rateHtml(r, { big = false } = {}) {
      const v = Number(r.relevance) || 0;
      const dole = v === -1 && r.relevance_note ? `Nerelevantná: ${r.relevance_note}` : 'Nerelevantná — takéto firmy nechceme';
      return `<span class="lr-th${big ? ' is-big' : ''}" role="group" aria-label="Hodnotenie firmy" data-lr="${UI.esc(r.id)}">
        <button type="button" class="lr-btn is-up${v === 1 ? ' on' : ''}" aria-pressed="${v === 1}" title="Relevantná — takéto firmy chceme"
          aria-label="Relevantná" onclick="Lead.rate('${UI.esc(r.id)}', 1)">${Icon('thumbs-up', big ? 16 : 14)}</button>
        <button type="button" class="lr-btn is-down${v === -1 ? ' on' : ''}" aria-pressed="${v === -1}" title="${UI.esc(dole)}"
          aria-label="Nerelevantná" onclick="Lead.rate('${UI.esc(r.id)}', -1)">${Icon('thumbs-down', big ? 16 : 14)}</button></span>`;
    },

    /** Palec hore / dole; druhý klik na ten istý palec hodnotenie zruší. */
    async rate(id, v) {
      const r = this.rows.find(x => x.id === id);
      if (!r) return;
      const value = (Number(r.relevance) || 0) === v ? null : v;
      let note = null;
      if (value === -1) {
        note = await this.askReason(r);
        if (note === null) return;
      }
      const now = value == null ? null : new Date().toISOString();
      const patch = { relevance: value, relevance_note: value === -1 ? (note || null) : null, relevance_at: now,
        relevance_by: value == null ? null : ((Danubra.user && Danubra.user.id) || null) };
      const { error } = await DB.update('leads', id, patch);
      if (error) {
        return UI.toast(/relevance|column|schema/i.test(error.message || '') ? 'Hodnotenie sa neuložilo — v databáze chýba migrácia 080' : `Chyba: ${error.message}`, 'err');
      }
      Object.assign(r, patch);
      document.querySelectorAll(`[data-lr="${sel(id)}"]`).forEach(el => { el.outerHTML = this.rateHtml(r, { big: el.classList.contains('is-big') }); });
      const why = document.querySelector(`[data-lr-why="${sel(id)}"]`);
      if (why) { why.textContent = value === -1 && patch.relevance_note ? `Dôvod: ${patch.relevance_note}` : ''; why.hidden = !(value === -1 && patch.relevance_note); }
      UI.toast(value === 1 ? 'Relevantná — ďalšie hľadanie bude hľadať podobné' : value === -1 ? 'Nerelevantná — AI bude takéto firmy vynechávať'
        : 'Hodnotenie zrušené', 'ok');
    },

    /** Krátky dôvod pri palci dole (nepovinný). null = zrušené. */
    askReason(r) {
      return UI._sheet({
        title: 'Nerelevantná firma',
        question: `Prečo ${r.name} nie je vhodná? Dôvod je nepovinný.`,
        hint: 'Pri ďalšom hľadaní AI takéto firmy vynechá a dá im nižšie skóre. Dôvod jej pomôže pochopiť prečo.',
        field: `<div class="lr-reasons" role="radiogroup" aria-label="Dôvod">${LR().REASONS.map(([, l]) => `<label class="lr-reason">
            <input type="radio" name="lr-why" value="${UI.esc(l)}"><span>${UI.esc(l)}</span></label>`).join('')}</div>
          <input id="ui-ask-input" type="text" maxlength="120" placeholder="Iný dôvod vlastnými slovami (nepovinné)">`,
        okLabel: 'Uložiť', cancel: 'Zrušiť',
        read: () => {
          const t = String((document.getElementById('ui-ask-input') || {}).value || '').trim();
          const c = document.querySelector('#ui-ask input[name=lr-why]:checked');
          return (t || (c ? c.value : '')).slice(0, 120);
        },
        empty: null,
      });
    },

    async searchUrls() {
      const f = document.getElementById('find-urls');
      if (!f) return;
      const r = this.urlPreview();
      if (!r || !r.ok) return UI.toast((r && r.error) || 'Zadajte weby firiem', 'err');
      const d = UI.formData(f);
      const params = { urls: r.seeds.map(s => s.url), region: String(d.u_region || '').trim().slice(0, 80),
        count: SD().clampCount(d.u_count), note: String(d.u_note || '').trim().slice(0, 500),
        min_score: OX().minScore(d.u_min), without_web: d.u_noweb === true,
        // Len na zobrazenie počas behu — o zdroji rozhoduje server (kľúč v env).
        outscraper: !!(this.osStatus && this.osStatus.on) };
      this._urlsDraft = '';
      return this.startSearch(params);
    },

    /**
     * Založí hľadanie, zavolá server a ukáže priebeh v okne. Okno sa dá
     * zavrieť — priebeh ostane v páse na obrazovke Nové firmy.
     */
    async startSearch(params) {
      const { data, error } = await DB.insert('lead_searches', { kind: 'urls', params });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const t = await token();
      fetch('/.netlify/functions/danubra-leads-from-urls-background', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ search_id: data.id, ...params }) })
        .then(x => { if (!x.ok && x.status !== 202) UI.toast(`Server hľadanie odmietol (${x.status}) — skúste to znova`, 'err'); })
        .catch(() => UI.toast('Server na hľadanie neodpovedá — skúste to znova', 'err'));
      UI.toast(params.outscraper ? 'Hľadám podobné firmy na Google Mapách — potrvá to 3–10 minút' : 'Hľadám podobné firmy — potrvá to 3–10 minút', 'ok');
      const s = { status: 'pending', kind: 'urls', params, created_at: new Date().toISOString(), ...data };
      this.searches.unshift(s);
      UI.modal('Hľadanie podobných firiem', `${this.progressHtml(s, { modal: true })}
        <p class="card-note">Okno môžete zavrieť — hľadá sa na serveri a priebeh uvidíte aj v Marketingu → Nové firmy.</p>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť — hľadá sa ďalej</button></div>`, { wide: true });
      if (Danubra.route === 'leads') Danubra.renderRoute();
      this.watch(s.id);
      return s;
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
          : `<div class="warnbox">${Icon('alert', 14)} <span>Posielanie ešte nie je zapnuté. V Netlify (Site configuration → Environment variables) treba doplniť
              <b>SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS</b> a <b>SMTP_FROM</b> (napr. „Partner und Service &lt;info@punds.eu&gt;"). Kým to nie je,
              e-maily sa dajú pripraviť, ale neodídu.</span>${UI.tip('SMTP = prihlasovacie údaje k e-mailovej schránke (server, port, meno, heslo, adresa odosielateľa). Zadáva ich ten, kto spravuje Netlify — zámerne nie sú v appke, aby sa heslo nedostalo do prehliadača.')}</div>`)
        // Zoznam je spoločný komponent (`DataList`): dovtedy tu boli karty bez
        // filtrov — pri desiatkach e-mailov sa nedalo nájsť, čo ešte čaká.
        + DataList.html(this.listConfig(this.rows.map(c => this.listRow(c))));
      if (this.rows.some(c => c.status === 'sending')) this.poll();
    },

    /** Stavy e-mailu (kampane): [názov, farba]. */
    ST: { draft: ['Návrh', 'gray'], sending: ['Posiela sa', 'blue'], paused: ['Čaká na pokračovanie', 'amber'],
      done: ['Odoslané', 'green'], error: ['Chyba', 'red'] },
    stOf(k) { return this.ST[k] || ['—', 'gray']; },

    /** Riadok zoznamu: e-mail a počty adresátov podľa stavu. */
    listRow(c) {
      const s = this.sendsOf(c.id);
      const n = (k) => s.filter(x => x.status === k).length;
      const last = s.map(x => x.sent_at).filter(Boolean).sort().pop() || null;
      return { id: c.id, c, name: c.name || 'E-mail', subject: c.subject || '', total: s.length,
        sent: n('sent'), queued: n('queued'), failed: n('failed'), skipped: n('skipped'), last };
    },

    /** Konfigurácia zoznamu e-mailov pre `DataList`. */
    listConfig(rows) {
      const L = DanubraDataList;
      const ST = this.ST;
      const progress = (r) => {
        if (!r.total) return '<span class="dl-note is-mute">bez adresátov</span>';
        const pct = Math.round((r.sent / r.total) * 100);
        return `<span class="cmp-prog" title="Odoslané ${r.sent} z ${r.total} adresátov">
          <span class="dl-num"><b>${r.sent}</b> z ${r.total}</span>
          <i class="cmp-bar" aria-hidden="true"><i style="width:${pct}%"></i></i></span>`;
      };
      const failCell = (r) => (r.failed || r.skipped ? `<span class="dl-two">${r.failed ? `<b class="dl-note is-red">chyba ${r.failed}</b>` : ''}${
        r.skipped ? `<small>preskočené ${r.skipped}</small>` : ''}</span>` : '');
      return {
        id: 'kampane', storageKey: 'kampane', label: 'E-maily firmám',
        noun: ['e-mail', 'e-maily', 'e-mailov'],
        rows,
        rowClick: (r) => Camp.detail(r.id),
        rowClass: (r) => (r.c.status === 'error' || r.c.error ? 'is-hot' : r.queued && r.c.status !== 'draft' ? 'is-warn' : r.c.status === 'done' ? 'is-muted' : ''),
        rowLabel: (r) => `E-mail ${r.name}`,
        rowActions: [
          { ico: 'clients', label: 'Adresáti', run: (r) => Camp.detail(r.id) },
        ],
        columns: [
          { key: 'nazov', label: 'E-mail', width: 'minmax(200px, 2fr)', mobile: 'title',
            render: (r) => `<span class="dl-title"><b>${UI.esc(r.name)}</b><small>${UI.esc(r.subject || '—')}</small>${
              r.c.error ? `<small class="dl-note is-red" title="${UI.esc(r.c.error)}">${UI.esc(r.c.error)}</small>` : ''}</span>`,
            sortValue: (r) => r.name, sortLabel: 'Názov' },
          { key: 'stav', label: 'Stav', width: '150px', mobile: 'badge',
            tip: 'Návrh = uložené, nič neodišlo. Posiela sa = server práve posiela. Čaká na pokračovanie = odišla jedna dávka, zvyšok pošlete tlačidlom Pokračovať v stĺpci Čaká. Odoslané = odišlo všetkým.',
            render: (r) => { const st = this.stOf(r.c.status); return UI.badge(st[0], st[1]); },
            sortValue: (r) => Object.keys(ST).indexOf(r.c.status) },
          { key: 'odoslane', label: 'Odoslané', width: '120px', mobileLabel: 'odoslané',
            tip: 'Koľkým adresátom e-mail už odišiel z celkového počtu adresátov.',
            render: progress, sortValue: (r) => r.sent, sortDir: -1, csv: (r) => r.sent },
          { key: 'caka', label: 'Čaká', width: '136px', mobileLabel: '',
            tip: 'Adresáti, ktorým e-mail ešte neodišiel. Tlačidlo ich pošle: naraz odíde najviac 40 e-mailov, každý zvlášť a s pauzou pár sekúnd, aby Vaša schránka neskončila v spame. Ak čaká viac adresátov, po dávke kliknite znova.',
            render: (r) => (r.queued ? `<button type="button" class="btn ${r.c.status === 'draft' ? 'btn-primary' : 'btn-outline'} btn-sm cmp-go"
              onclick="Camp.run('${UI.esc(r.id)}')" title="Poslať ďalšiu dávku (najviac 40)">${Icon('mail', 13)} ${r.c.status === 'draft' ? 'Odoslať' : 'Pokračovať'} ${r.queued}</button>` : ''),
            sortValue: (r) => r.queued, sortDir: -1, csv: (r) => r.queued },
          { key: 'zlyhalo', label: 'Zlyhalo', width: '104px', mobileLabel: '',
            tip: 'Chyba = schránka e-mail neprijala (napr. zlá adresa); dôvod uvidíte v Adresátoch. Preskočené = adresa sa medzitým odhlásila, tak sa jej nič neposlalo.',
            render: failCell, sortValue: (r) => r.failed + r.skipped || null, sortDir: -1, csv: (r) => r.failed },
          { key: 'posledne', label: 'Naposledy', sortLabel: 'Posledné odoslanie', width: '112px', mobileLabel: 'naposledy',
            tip: 'Kedy naposledy odišiel tento e-mail niektorému adresátovi.',
            render: (r) => {
              const x = new Date(r.last);
              if (!r.last || isNaN(x)) return '';
              const hm = `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
              return `<span class="dl-two"><b class="dl-num">${x.getDate()}. ${x.getMonth() + 1}. ${x.getFullYear()}</b><small class="dl-num">${hm}</small></span>`;
            },
            sortValue: (r) => r.last, sortDir: -1, csv: (r) => r.last || '' },
          { key: 'vytvoreny', label: 'Vytvorený', width: '96px', hideBelow: 1100,
            render: (r) => L.fmtDay(r.c.created_at), sortValue: (r) => r.c.created_at, sortDir: -1 },
        ],
        sort: { key: 'vytvoreny', dir: -1 },
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať názov alebo predmet…', label: 'Hľadať názov alebo predmet e-mailu',
            fields: ['name', 'subject'] },
          { key: 'stav', type: 'multi', label: 'Stav', value: (r) => r.c.status, sortOptions: false, allLabel: 'Všetky',
            options: Object.entries(ST).map(([k, v]) => [k, v[0]]),
            presets: [{ label: 'Nedokončené', value: ['draft', 'sending', 'paused', 'error'], hint: 'Návrhy, rozposielané a s chybou — bez hotových' }] },
          { key: 'caka', type: 'toggle', label: 'Čaká na odoslanie', test: (r) => r.queued > 0,
            hint: 'E-maily, v ktorých ešte niektorí adresáti čakajú — pošlete ich tlačidlom v stĺpci Čaká.' },
          { key: 'chyba', type: 'toggle', label: 'So zlyhaním', test: (r) => r.failed > 0 || !!r.c.error,
            hint: 'E-maily, pri ktorých schránka niektoré správy neprijala, alebo rozosielanie skončilo chybou.' },
          { key: 'kedy', type: 'range-date', label: 'Posledné odoslanie', field: 'last', more: true },
          { key: 'vytvoreny', type: 'range-date', label: 'Vytvorený', field: 'c.created_at', more: true },
        ],
        empty: { ico: 'mail', title: 'Zatiaľ žiadny e-mail', sub: 'Napíšte prvý — šablóna po nemecky je pripravená.',
          cta: `<button class="btn btn-primary" onclick="Camp.form()">${Icon('plus')} Nový e-mail</button>` },
        export: {
          name: ['emaily-firmam'],
          columns: [
            ['Názov', r => r.name], ['Predmet', r => r.subject], ['Stav', r => this.stOf(r.c.status)[0]],
            ['Adresáti', r => r.total], ['Odoslané', r => r.sent], ['Čaká', r => r.queued], ['Chyba', r => r.failed],
            ['Preskočené', r => r.skipped], ['Posledné odoslanie', r => r.last || ''], ['Vytvorený', r => String(r.c.created_at || '').slice(0, 10)],
            ['Chyba rozosielania', r => r.c.error || ''],
          ],
        },
      };
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
      const { error } = await DB.update('campaigns', id, { status: 'sending', error: null });
      if (error) return UI.toast('Rozosielanie sa nespustilo: ' + error.message, 'err');
      fetch('/.netlify/functions/danubra-email-send-background', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ campaign_id: id, limit: 40 }) })
        .then(r => { if (!r.ok) UI.toast(`Server rozosielanie odmietol (${r.status}) — skúste to znova`, 'err'); })
        .catch(() => UI.toast('Server na rozosielanie neodpovedá — skúste to znova', 'err'));
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
