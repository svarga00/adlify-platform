// ============================================================================
// DANUBRA — sprievodca náborovým hovorom
// ============================================================================
// Toto sa používa s telefónom pri uchu. Nič sa neznámkuje — odškrtáva sa, čo
// zaznelo, a zvyšok sa zapíše vlastnými slovami.
//
// Vľavo prebieha hovor, vpravo je celý čas vidieť, o akú zákazku ide a čo
// z hovoru zatiaľ vyšlo. Nič sa nemusí pamätať ani listovať späť.
//
// Všetko sa ukladá hneď po klepnutí. Keď hovor spadne, nič sa nestratí.
// ============================================================================
(function () {
  const P = window.DanubraProcess;
  const CH = window.DanubraChips;
  const AD = () => window.DanubraAds;

  const Guide = {
    cand: null,
    trades: [], trade: null, chips: [],
    plans: [], plan: null, subcontracts: [], partners: [],
    ads: [], ad: null, questions: [],
    segments: [], segIndex: 0, setup: false, pickMode: 'ad',
    ticked: new Map(),        // chip_id → chip
    notes: new Map(),         // segment → rozpísaná poznámka

    // ── Živý nábor ────────────────────────────────────────────────────────
    async startCall() {
      await this.loadContext();
      this.cand = null; this.trade = null; this.plan = null; this.ad = null;
      this.setup = true; this.segIndex = 0;
      // Inzerát je prvá otázka. Keď žiadny nebeží, pýta sa to po starom.
      this.pickMode = this.ads.some(a => a.running) ? 'ad'
        : (this.plans.length ? 'plan' : 'trade');
      this.ticked = new Map(); this.notes = new Map(); this.answers = new Map();
      this.qStep = {}; this.route = null; this.routeFrom = '';
      // Meno a telefón sa držia tu, nie len v políčku — inak ich každé
      // klepnutie na nábor alebo typ hovoru zmazalo (okno sa prekreslí).
      this.draft = { name: '', phone: '', crew: false };
      this.open();
    },

    /** Všetko, čo treba mať po ruke počas hovoru — naraz, nie po kúskoch. */
    async loadContext() {
      if (!Trades.loaded) await Trades.load();
      this.trades = Trades.trades.filter(t => t.active !== false);
      const [chips, plans, subs, parts, ads, qs] = await Promise.all([
        DB.list('call_chips', { limit: 800 }),
        DB.list('recruitment_plans', { limit: 200 }),
        DB.list('subcontracts', { limit: 200 }),
        DB.list('partners', { select: 'id,name,city,payment_terms_days', limit: 200 }),
        DB.list('ads', { limit: 200 }),
        DB.list('screening_questions', {
          order: { column: 'sort_order', ascending: true }, limit: 500 }),
      ]);
      this.chips = (chips.data || []).filter(c => c.active !== false);
      this.plans = (plans.data || []).filter(p => p.status === 'active');
      this.subcontracts = subs.data || [];
      this.partners = parts.data || [];
      this.ads = AD().forCall(ads.data || []);
      this.questions = qs.data || [];
    },

    /**
     * Inzerát určuje zvyšok hovoru: remeslo, mesto aj to, čo sme sľúbili.
     * Preto sa ním začína a preto sa z neho predvyplní plán aj remeslo.
     */
    pickAd(id) {
      this.ad = this.ads.find(a => a.id === id) || null;
      if (this.ad) {
        this.plan = this.ad.plan_id
          ? this.plans.find(p => p.id === this.ad.plan_id) || null : this.plan;
        const key = this.ad.trade_key || this.plan?.trade_key;
        if (key) this.trade = this.trades.find(t => t.key === key) || this.trade;
      }
      this.render();
    },

    pickTrade(key) {
      this.trade = this.trades.find(t => t.key === key) || null;
      this.plan = null;
      this.render();
    },

    pickPlan(id) {
      this.plan = this.plans.find(p => p.id === id) || null;
      this.trade = this.plan ? this.trades.find(t => t.key === this.plan.trade_key) || null : null;
      this.render();
    },

    setPickMode(m) { this.pickMode = m; this.render(); },

    /**
     * Nábor bez remesla (napríklad omietkár, ktorý v zozname remesiel nie je).
     * Hovor sa dá začať aj tak — so všeobecnými otázkami. Kto chce aj odborné,
     * vyberie najbližšie remeslo; nábor sa tým nemení.
     */
    noTradeHtml() {
      if (this.trade || !(this.plan || this.ad)) return '';
      return `<div class="guide-hint guide-hint-warn" style="margin-top:14px;">
        <b>Tento nábor nemá remeslo.</b> Hovor pôjde so všeobecnými otázkami (papiere,
        kedy môže, peniaze). Ak chceš aj odborné otázky, vyber najbližšie remeslo:
        <div class="trade-grid trade-grid-sm" style="margin-top:8px;">
          ${this.trades.map(t => `<button class="trade-tile"
            onclick="Guide.trade=Guide.trades.find(x=>x.key==='${t.key}');Guide.render()">
            <span class="tt-name">${UI.esc(t.name_sk)}</span></button>`).join('')}
        </div>
      </div>`;
    },

    /**
     * Krátky hovor alebo plný pohovor.
     *
     * Cieľ je ozvať sa do desiatich minút od ozvania. Celý hovor má šesť
     * častí a trvá dvadsať minút — keď sa začne ním, k tretiemu človeku sa
     * náborár v ten deň nedostane. Predvolený je preto krátky; na plný sa
     * dá prejsť jedným klepnutím, aj uprostred hovoru, keď to sedí.
     */
    mode: 'quick',
    setMode(m) {
      this.mode = m === 'full' ? 'full' : 'quick';
      if (!this.setup) {
        this.segments = this.buildSegments(this.trade?.key, this.cand?.ad_id);
        this.segIndex = 0;
      }
      this.render();
    },

    /** Z krátkeho hovoru sa dá prejsť na plný bez toho, aby sa čokoľvek stratilo. */
    goFull() {
      this.mode = 'full';
      this.segments = this.buildSegments(this.trade?.key, this.cand?.ad_id);
      this.segIndex = 0;
      this.render();
      UI.toast('Pokračuješ plným pohovorom — čo si zaškrtol, zostáva', 'ok');
    },

    /** Zákazka, na ktorú sa naberá — cez plán, alebo priamo z kandidáta. */
    subcontract() {
      const id = this.plan?.subcontract_id || this.cand?.subcontract_id;
      return id ? this.subcontracts.find(s => s.id === id) : null;
    },

    partnerOf(sub) {
      return sub?.partner_id ? this.partners.find(p => p.id === sub.partner_id) : null;
    },

    /** Založí kandidáta a hneď prejde do hovoru — bez medzikrokov. */
    async beginCall() {
      // Nábor alebo inzerát bez remesla nie je dôvod hovor nezačať — otázky
      // budú všeobecné. Bez ničoho sa ale nevie, kam človeka zapísať.
      if (!this.trade && !this.plan && !this.ad) {
        return UI.toast('Vyber inzerát, nábor alebo remeslo', 'err');
      }
      const d = this.draft || {};
      const name = (document.getElementById('call-name')?.value || d.name || '').trim();
      if (!name) {
        document.getElementById('call-name')?.focus();
        return UI.toast('Zapíš aspoň meno', 'err');
      }
      const phone = (document.getElementById('call-phone')?.value || d.phone || '').trim() || null;
      const crew = document.getElementById('call-crew')?.checked ?? !!d.crew;

      const btn = document.getElementById('call-go');
      if (btn) { btn.disabled = true; btn.textContent = 'Zakladám…'; }

      const { data: cand, error } = await DB.insert('candidates', {
        full_name: name, phone, type: crew ? 'crew' : 'individual',
        profession: this.trade?.key || null, legal_form: this.plan?.legal_form || 'szco',
        // Zdroj je kanál inzerátu, nie slovo „inzerat". Doteraz sa tu
        // zapisovala hodnota, ktorá nie je v žiadnom číselníku, takže
        // v prehľade zdrojov z nej nebolo čo prečítať.
        source: this.ad?.channel || 'other', status: 'contacted',
        ad_id: this.ad?.id || null,
        plan_id: this.plan?.id || null,
        city: this.plan?.city || this.ad?.city || null,
        expected_rate: this.plan?.offer_rate ?? this.ad?.rate_offered ?? null,
        expected_start: this.plan?.start_date || null,
        received_at: new Date().toISOString(),
        first_contact_at: new Date().toISOString(),
      });
      if (error) {
        if (btn) { btn.disabled = false; btn.textContent = 'Začať hovor'; }
        return UI.toast('Chyba: ' + error.message, 'err');
      }

      Cand.items.unshift(cand);
      this.cand = cand;
      this.segments = this.buildSegments(this.trade?.key || null, cand.ad_id);
      if (!this.segments.length) {
        UI.toast('Pre toto remeslo nie sú žiadne polia', 'err');
        if (btn) { btn.disabled = false; btn.textContent = 'Začať hovor'; }
        return;
      }
      this.draft = { name: '', phone: '', crew: false };
      this.setup = false;
      this.segIndex = 0;
      this.render();
    },

    /**
     * Obrazovky hovoru: zaškrtávacie polia plus otázky, ktoré na tento hovor
     * sedia. Otázky boli doteraz len na čítanie v Remeslách — pri telefóne,
     * kde sú najužitočnejšie, chýbali.
     */
    buildSegments(tradeKey, adId) {
      const qs = AD().questionsFor({
        questions: this.questions, tradeKey, adId: adId || null, phase: 'phone',
      });

      // Krátky hovor je jedna obrazovka: najdôležitejšie z remesla, papierov,
      // termínu a peňazí. Otázky sa doň berú tie najťažšie — na tie sa treba
      // spýtať tak či tak a práve ony odlíšia majstra od toho, kto „to už raz
      // robil".
      if (this.mode !== 'full') {
        const quick = CH.buildQuickSegment({ tradeKey, chips: this.chips });
        const vybrane = qs.slice()
          .sort((a, b) => (b.weight || 1) - (a.weight || 1))
          .slice(0, 3);
        return quick.chips.length || vybrane.length
          ? [{ ...quick, questions: vybrane }] : [];
      }

      const segs = CH.buildCallSegments({ tradeKey, chips: this.chips });
      return AD().withQuestions(segs, qs, CH.SEGMENTS.map(s => s.key))
        .map(s => (s.title === s.key ? { ...s, title: CH.segmentTitle(s.key), lead: '' } : s));
    },

    /** Existujúci kandidát — pokračovanie v hovore alebo druhý telefonát. */
    async continueCall(candidateId) {
      const cand = Cand.items.find(c => c.id === candidateId);
      if (!cand) return;
      await this.loadContext();

      const { data } = await DB.list('candidate_chips', { filters: { candidate_id: candidateId }, limit: 300 });
      this.ticked = new Map();
      for (const t of data || []) {
        const chip = this.chips.find(c => c.id === t.chip_id);
        this.ticked.set(t.chip_id, chip || { id: t.chip_id, label: t.label, polarity: t.polarity, weight: t.weight });
      }

      this.cand = cand;
      this.trade = this.trades.find(t => t.key === cand.profession) || null;
      this.plan = this.plans.find(p => p.id === cand.plan_id) || null;
      this.ad = this.ads.find(a => a.id === cand.ad_id) || null;
      this.segments = this.buildSegments(cand.profession, cand.ad_id);
      this.notes = new Map(); this.answers = new Map();
      this.qStep = {}; this.route = null; this.routeFrom = cand.city || '';
      this.setup = false;
      this.segIndex = 0;
      this.open();
    },

    // ── Plášť ─────────────────────────────────────────────────────────────
    open() {
      this.close(true);
      const el = document.createElement('div');
      el.id = 'guide';
      el.className = 'guide';
      document.body.appendChild(el);
      document.body.style.overflow = 'hidden';
      this._keys = (e) => this.onKey(e);
      document.addEventListener('keydown', this._keys);
      this.render();
    },

    close(silent) {
      document.getElementById('guide')?.remove();
      if (this._keys) { document.removeEventListener('keydown', this._keys); this._keys = null; }
      if (silent) return;
      document.body.style.overflow = '';
      const id = this.cand?.id;
      Cand.load().then(() => {
        if (!id) return Danubra.renderRoute();
        CandProc.load(id).then(() => { CandProc.rerender(); Danubra.renderRoute(); });
      });
    },

    render() {
      const el = document.getElementById('guide');
      if (!el) return;
      if (this.setup) {
        el.innerHTML = this.shell({
          title: 'Zdvihol som telefón', sub: 'nový kandidát z inzerátu',
          progress: 0, body: this.setupHtml(),
          aside: (this.plan || this.trade || this.ad)
            ? this.promiseHtml() + this.contextHtml() : '',
        });
        setTimeout(() => document.getElementById('call-name')?.focus({ preventScroll: true }), 30);
        return;
      }

      const done = this.segIndex >= this.segments.length;
      const seg = done ? null : this.segments[this.segIndex];
      el.innerHTML = this.shell({
        title: this.cand.full_name,
        sub: done ? 'záver hovoru' : seg.title,
        count: done ? '' : `${this.segIndex + 1}/${this.segments.length}`,
        progress: Math.round((Math.min(this.segIndex, this.segments.length) / this.segments.length) * 100),
        body: done ? this.callSummary() : this.segmentHtml(seg),
        aside: this.asideHtml(),
      });
      if (this.route) this.paintRouteMap();
      // V kroku cesty sa píše hneď — kurzor do poľa.
      if (this._stepCtx && this._stepCtx.step.type === 'route' && !this.route) {
        setTimeout(() => document.getElementById('route-from')?.focus({ preventScroll: true }), 30);
      }
    },

    shell({ title, sub, count = '', progress = 0, body, aside }) {
      return `
        <div class="guide-head">
          <button class="guide-x" onclick="Guide.close()" aria-label="Zavrieť">${Icon('x', 20)}</button>
          <div class="guide-who">
            <strong>${UI.esc(title)}</strong>
            <span>${UI.esc(sub)}</span>
          </div>
          <div class="guide-count">${count}</div>
        </div>
        <div class="guide-bar"><span style="width:${progress}%"></span></div>
        ${aside ? `<div class="guide-mini" id="guide-mini">${this.miniHtml()}</div>` : ''}
        <div class="guide-cols">
          <div class="guide-body">${body}</div>
          ${aside ? `<aside class="guide-aside" id="guide-aside">${aside}</aside>` : ''}
        </div>`;
    },

    // ── Bočný panel: o akú zákazku ide a čo z hovoru zatiaľ vyšlo ──────────
    asideHtml() {
      // Priebeh je hore, lebo sa mení pri každom klepnutí. Kontext zákazky
      // sa nemení, takže môže byť pod ním.
      return `<div class="aside-inner">
        ${this.cand ? this.liveHtml() : ''}
        ${this.promiseHtml()}
        ${this.contextHtml()}
      </div>`;
    },

    /**
     * Čo sme v inzeráte sľúbili. Je to vpravo počas celého hovoru, aby sa
     * nesľúbilo niečo iné, než čo bolo napísané — na stavbe sa to zistí
     * najneskôr a stojí to najviac.
     */
    promiseHtml() {
      if (!this.ad) return '';
      const lines = AD().promiseLines(this.ad);
      return `<div class="aside-card aside-promise">
        <div class="aside-title">${Icon('marketing', 14)} ${UI.esc(this.ad.title)}</div>
        ${lines.length
          ? `<ul class="aside-list">${lines.map(t => `<li>${UI.esc(t)}</li>`).join('')}</ul>
             <p class="aside-note">Toto sme sľúbili. Nesľubuj nič navyše.</p>`
          : `<p class="aside-note">Inzerát nemá zapísané, čo sľuboval — doplň to
             v Inzerátoch, nech to nabudúce máš po ruke.</p>`}
      </div>`;
    },

    contextHtml() {
      const p = this.plan, sub = this.subcontract(), partner = this.partnerOf(sub);
      if (!p && !sub && !this.trade && !this.ad) return this.promiseHtml();
      const row = (k, v) => v ? `<div><span>${k}</span><strong>${UI.esc(v)}</strong></div>` : '';
      // Zo zhrnutia zákazky — to, čo sa pri náboru naozaj dohodlo. Nedoplnené
      // [XX] sa nevypisuje: na telefóne by to vyzeralo ako údaj.
      const fakt = (k) => {
        const v = String(((p && p.analysis) || {})[k] || '').trim();
        return v && !v.includes('[XX]') ? v : null;
      };
      return `
        <div class="aside-card">
          <div class="aside-title">${Icon('site', 14)} ${UI.esc(p?.title || this.trade?.name_sk || 'Nábor')}</div>
          <div class="aside-kv">
            ${row('Remeslo', this.trade?.name_sk)}
            ${row('Kde', [p?.city || sub?.site_city, p?.country === 'DE' ? 'Nemecko' : p?.country].filter(Boolean).join(', '))}
            ${row('Nástup', p?.start_date ? UI.date(p.start_date) : null)}
            ${row('Treba ľudí', p?.headcount ? String(p.headcount) : null)}
            ${row('Ponúkame', p?.offer_rate ? `${p.offer_rate} €/h` : fakt('rate'))}
            ${row('Trvanie', fakt('duration'))}
            ${this.route ? row('Cesta', `${this.routeFrom}: ${DanubraRoute.sentence(this.route)}`) : ''}
            ${row('Forma', p ? (p.legal_form === 'employee' ? 'zamestnanec' : 'živnosť') : null)}
            ${row('Podmienky', fakt('condition'))}
            ${row('Ubytovanie', fakt('housing'))}
            ${row('Navyše', ((p?.analysis || {})._extra || {}).benefits || null)}
          </div>
          ${p ? `<div class="aside-tags">
            ${p.accommodation_provided && !fakt('housing') ? '<span class="atag">ubytovanie platíme</span>' : ''}
            ${p.transport_provided ? '<span class="atag">doprava zabezpečená</span>' : ''}
            ${p.advance_possible ? '<span class="atag">záloha možná</span>' : ''}
          </div>` : ''}
        </div>

        ${sub ? `<div class="aside-card">
          <div class="aside-title">${Icon('doc', 14)} ${UI.esc(sub.contract_number || 'Zákazka')}</div>
          <div class="aside-kv">
            ${row('Zákazka', sub.title)}
            ${row('Odberateľ', partner?.name)}
            ${row('Stavba', [sub.site_name, sub.site_address, sub.site_city].filter(Boolean).join(', '))}
            ${row('Termín', sub.date_from ? `${UI.date(sub.date_from)} – ${sub.date_to ? UI.date(sub.date_to) : '…'}` : null)}
            ${row('Fakturujeme', sub.charge_rate ? `${sub.charge_rate} €/h` : null)}
          </div>
          ${sub.work_type === 'construction'
            ? `<div class="aside-note">Stavebné práce — platí Bau-Mindestlohn, SOKA a hlásenie Zoll.</div>` : ''}
        </div>` : ''}

        ${(this.trade?.pitch || []).length ? `<div class="aside-card">
          <div class="aside-title">${Icon('note', 14)} Čo mu povedať</div>
          <ul class="aside-list">${this.trade.pitch.map(x => `<li>${UI.esc(x)}</li>`).join('')}</ul>
        </div>` : ''}`;
    },

    /** Priebežné zhrnutie — vidíš ho celý hovor, netreba listovať späť. */
    liveHtml() {
      const ticked = [...this.ticked.values()];
      const r = CH.scoreChips(ticked);
      const s = CH.summarize(ticked);
      const V = { strong: ['Sedí', 'ok'], ok: ['Použiteľný', 'ok'], weak: ['Slabý', 'warn'],
        reject: ['Nebrať', 'bad'], unknown: ['Zatiaľ nejasné', 'mute'] };
      const v = V[r.verdict] || V.unknown;
      const group = (title, items, cls) => items.length ? `
        <div class="aside-group">
          <b>${title}</b>
          <div class="chip-list" style="margin:6px 0 0;">
            ${items.map(x => `<span class="chip chip-${cls} on static">${UI.esc(x)}</span>`).join('')}
          </div>
        </div>` : '';
      return `
        <div class="aside-card aside-live">
          <div class="aside-title">${Icon('check', 14)} Zatiaľ z hovoru</div>
          <div class="live-score verdict-${v[1]}">
            <span class="ls-num">${r.percent == null ? '—' : r.percent + ' %'}</span>
            <span class="ls-lbl">${v[0]}</span>
          </div>
          ${s.flags.length ? `<div class="aside-flags">
            ${s.flags.map(f => `<div>${Icon('alert', 12)} ${UI.esc(f)}</div>`).join('')}</div>` : ''}
          ${group('Hovorí pre neho', s.good, 'plus')}
          ${group('Hovorí proti', s.bad, 'minus')}
          ${group('Zapísané', s.notes, 'neutral')}
          ${!ticked.length ? `<div class="aside-empty">Zatiaľ nič zaškrtnuté.</div>` : ''}
        </div>`;
    },

    // ── Na aký nábor volá ─────────────────────────────────────────────────
    setupHtml() {
      const byPlan = this.pickMode === 'plan' && this.plans.length;
      if (!this.chips.length) {
        return `<div class="guide-q">Chýbajú polia do hovoru</div>
          <div class="guide-hint guide-hint-warn">
            V databáze nie je ani jedno pole, takže by hovor začal prázdny.
            Spusti migráciu <b>012_call_chips.sql</b> v Supabase SQL editore —
            naplní 90 predpripravených polí.</div>
          <button class="guide-btn guide-btn-no" style="margin-top:16px;"
            onclick="Guide.close()">Zavrieť</button>`;
      }
      const byAd = this.pickMode === 'ad' && this.ads.length;
      return `
        <div class="guide-q">Na ktorý inzerát volá?</div>
        <div class="guide-lead">Od toho sa odvíja zvyšok hovoru — remeslo, mesto
          aj to, čo sme sľúbili.</div>
        <div class="pillbar" style="margin-bottom:12px;width:max-content;max-width:100%;overflow-x:auto;">
          ${this.ads.length ? `<button class="pill${byAd ? ' active' : ''}"
            onclick="Guide.setPickMode('ad')">Inzerát</button>` : ''}
          ${this.plans.length ? `<button class="pill${byPlan ? ' active' : ''}"
            onclick="Guide.setPickMode('plan')">Bežiaci nábor</button>` : ''}
          <button class="pill${!byAd && !byPlan ? ' active' : ''}"
            onclick="Guide.setPickMode('trade')">Do zásoby</button>
        </div>

        ${byAd ? `<div class="plan-grid">
          ${this.ads.map(a => `
            <button class="plan-tile${this.ad?.id === a.id ? ' on' : ''}${a.running ? '' : ' pt-off'}"
              onclick="Guide.pickAd('${a.id}')">
              <span class="pt-name">${UI.esc(a.title)}${a.running ? '' : ' · dobehol'}</span>
              <span class="pt-meta">${UI.esc(AD().subtitle(a))}</span>
              ${AD().promiseLines(a).length ? `<span class="pt-meta pt-promise">${
                AD().promiseLines(a).map(t => UI.esc(t)).join(' · ')}</span>` : ''}
            </button>`).join('')}
        </div>`
        : byPlan ? `<div class="plan-grid">
          ${this.plans.map(p => {
            const t = this.trades.find(x => x.key === p.trade_key);
            const sub = p.subcontract_id ? this.subcontracts.find(s => s.id === p.subcontract_id) : null;
            return `<button class="plan-tile${this.plan?.id === p.id ? ' on' : ''}"
              onclick="Guide.pickPlan('${p.id}')">
              <span class="pt-name">${UI.esc(p.title)}</span>
              <span class="pt-meta">${UI.esc(t?.name_sk || p.trade_key || '')}${p.headcount ? ` · treba ${p.headcount}` : ''}${p.city ? ` · ${UI.esc(p.city)}` : ''}</span>
              <span class="pt-meta">${p.offer_rate ? `${p.offer_rate} €/h` : ''}${p.start_date ? ` · nástup ${UI.date(p.start_date)}` : ''}${sub?.contract_number ? ` · ${UI.esc(sub.contract_number)}` : ''}</span>
            </button>`;
          }).join('')}
        </div>`
        : `<div class="trade-grid">
          ${this.trades.map(t => `
            <button class="trade-tile${this.trade?.key === t.key ? ' on' : ''}"
              onclick="Guide.pickTrade('${t.key}')">
              <span class="tt-name">${UI.esc(t.name_sk)}</span>
              ${t.rate_worker_min || t.rate_worker_max ? `<span class="tt-rate">${
                t.rate_worker_min || '?'}–${t.rate_worker_max || '?'} €/h</span>` : ''}
            </button>`).join('')}
        </div>`}

        ${this.noTradeHtml()}
        <input id="call-name" class="guide-note" style="margin-top:16px;" placeholder="Ako sa volá?"
          value="${UI.esc((this.draft || {}).name || '')}" autocomplete="off"
          oninput="Guide.draft.name=this.value"
          onkeydown="if(event.key==='Enter'){event.preventDefault();Guide.beginCall()}">
        <input id="call-phone" class="guide-note" style="margin-top:10px;" placeholder="Telefón (nepovinné)"
          type="tel" value="${UI.esc((this.draft || {}).phone || '')}" autocomplete="off"
          oninput="Guide.draft.phone=this.value">
        <label class="chk chk-lg" style="margin-top:12px;display:flex;gap:10px;align-items:center;">
          <input type="checkbox" id="call-crew" ${(this.draft || {}).crew ? 'checked' : ''}
            onchange="Guide.draft.crew=this.checked">
          <span style="font-size:15px;">Je to partia, nie jednotlivec</span>
        </label>

        <div class="call-mode">
          <button class="call-mode-btn${this.mode !== 'full' ? ' active' : ''}"
            onclick="Guide.setMode('quick')">
            <b>Krátky hovor</b>
            <span>Do troch minút: remeslo, papiere, kedy môže, peniaze.
              Toľko stačí na rozhodnutie, či sa oplatí pokračovať.</span>
          </button>
          <button class="call-mode-btn${this.mode === 'full' ? ' active' : ''}"
            onclick="Guide.setMode('full')">
            <b>Plný pohovor</b>
            <span>Šesť častí, dvadsať minút. Keď už vieš, že má zmysel sa
              s ním baviť — alebo keď má teraz čas.</span>
          </button>
        </div>

        <button class="guide-btn guide-btn-yes" id="call-go" style="margin-top:14px;"
          onclick="Guide.beginCall()">${Icon('phone', 20)} ${
          this.mode === 'full' ? 'Začať pohovor' : 'Začať hovor'}</button>
        ${!this.trade && !this.plan && !this.ad ? `<div class="guide-note-hint">Vyber inzerát, nábor
          alebo remeslo — podľa toho sa poskladajú polia aj otázky a vpravo uvidíš,
          čo sme sľúbili.</div>` : ''}`;
    },

    // ── Jedna obrazovka = jeden segment ───────────────────────────────────
    segmentHtml(seg) {
      // Otázka po otázke: kým nie sú všetky prejdené, je na obrazovke len
      // jedna — veľká, s odpoveďami na klik alebo na klávesy 1–3.
      const kroky = this.steps(seg);
      const krok = (this.qStep || {})[seg.key] || 0;
      if (kroky.length && krok < kroky.length) return this.stepHtml(seg, kroky, krok);
      this._stepCtx = null;
      const note = this.notes.get(seg.key) || '';
      return `
        ${kroky.length ? this.answeredHtml(seg, kroky) : ''}
        <div class="guide-q">${UI.esc(seg.title)}</div>
        <div class="guide-lead">${UI.esc(seg.lead)}</div>

        ${(() => {
          const g = this.callQ(seg);
          return `${g.questions.length ? `<div class="cq2-list">${g.questions
            .map(q => this.callQHtml(seg.key, q)).join('')}</div>
            <div class="cq2-rest">Ďalšie postrehy — zaškrtni, čo zaznelo</div>` : ''}
          <div class="chip-list">
            ${g.rest.map(c => this.chipHtml(c)).join('')}
            <button class="chip chip-add" onclick="Guide.addChipPrompt('${seg.key}')">
              ${Icon('plus', 14)} pridať vlastné</button>
          </div>`;
        })()}

        ${this.questionsHtml(seg)}

        <textarea id="seg-note" class="guide-note guide-textarea" rows="5"
          placeholder="Čo hovorí? Píš vlastnými slovami…"
          oninput="Guide.noteChanged('${seg.key}', this.value)">${UI.esc(note)}</textarea>
        <div class="guide-note-hint">Poznámka sa uloží pri prechode ďalej. Neskôr z nej vieme
          navrhnúť nové polia.</div>

        ${this.pitchHtml()}

        <div class="guide-nav">
          <button class="guide-nav-btn" onclick="Guide.prevSegment()" ${this.segIndex === 0 ? 'disabled' : ''}>
            ${Icon('chevron', 16)} Späť</button>
          <span class="guide-nav-mid" id="tick-count">${this.ticked.size} zaškrtnutých</span>
          <button class="guide-nav-btn guide-nav-next" onclick="Guide.nextSegment()">
            ${this.segIndex === this.segments.length - 1 ? 'Ukončiť hovor' : 'Ďalej'} ${Icon('chevron', 16)}</button>
        </div>`;
    },

    /**
     * Otázky k tejto časti hovoru. Sú tu na čítanie, nie na odškrtávanie —
     * odpoveď sa zapíše vlastnými slovami do poznámky pod nimi. Odškrtávacie
     * pole je tvrdenie, otázka je otázka; miešať to by znamenalo, že sa
     * zaškrtne „opýtané" namiesto toho, čo zaznelo.
     *
     * „Čo chcem počuť" a „pri čom zbystriť" sú skryté pod klepnutím —
     * pri telefóne treba vidieť otázku, nie odsek textu.
     */
    questionsHtml(seg) {
      const qs = seg.questions || [];
      if (!qs.length) {
        return `<button class="q-add" onclick="Guide.addQuestionPrompt('${seg.key}')">
          ${Icon('plus', 13)} pridať otázku k tejto časti</button>`;
      }
      return `<div class="q-list">
        <div class="q-head">${Icon('help', 13)} Na čo sa opýtať</div>
        ${qs.map(q => `
          <details class="q-item">
            <summary>
              <span class="q-text">${UI.esc(q.question_sk)}</span>
              ${(q.weight || 1) >= 3 ? `<em class="q-key">kľúčová</em>` : ''}
              ${q.ad_id ? `<em class="q-src">k inzerátu</em>`
                : (q.trade_key ? `<em class="q-src">k remeslu</em>` : '')}
            </summary>
            ${q.good_answer ? `<p class="q-good">${Icon('check', 12)} ${UI.esc(q.good_answer)}</p>` : ''}
            ${q.red_flag_answer ? `<p class="q-bad">${Icon('alert', 12)} ${UI.esc(q.red_flag_answer)}</p>` : ''}
            <button class="q-edit" onclick="event.preventDefault();Guide.editQuestion('${q.id}')">
              ${Icon('edit', 12)} upraviť</button>
          </details>`).join('')}
        <button class="q-add" onclick="Guide.addQuestionPrompt('${seg.key}')">
          ${Icon('plus', 13)} pridať otázku</button>
      </div>`;
    },

    /**
     * Nová otázka rovno z hovoru. Čo sa človek pri telefóne opýta druhýkrát,
     * to sa oplatí mať zapísané — a dopisovať to neskôr sa nikdy nestihne.
     */
    async addQuestionPrompt(segment) {
      const text = await UI.ask('Otázka, ktorú sa oplatí pýtať:');
      if (!text || !text.trim()) return;
      const payload = {
        question_sk: text.trim(),
        segment,
        kind: { trade: 'knowledge', verify: 'hidden', legal: 'legal',
          logistics: 'logistics', money: 'motivation' }[segment] || 'knowledge',
        phase: 'phone',
        // Otázka z hovoru platí pre to, na čom práve pracujem — nie pre všetkých.
        trade_key: this.trade?.key || null,
        sort_order: 100,
      };
      const { data, error } = await DB.insert('screening_questions', payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      this.questions.push(data);
      this.segments = this.buildSegments(this.trade?.key, this.cand?.ad_id);
      UI.toast('Otázka pridaná — nabudúce tu bude', 'ok');
      this.render();
    },

    async editQuestion(id) {
      const q = this.questions.find(x => x.id === id);
      if (!q) return;
      const text = await UI.ask('Upraviť otázku:', q.question_sk);
      if (text == null) return;
      if (!text.trim()) return UI.toast('Prázdna otázka sa neuloží', 'err');
      const { error } = await DB.update('screening_questions', id, { question_sk: text.trim() });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      q.question_sk = text.trim();
      this.segments = this.buildSegments(this.trade?.key, this.cand?.ad_id);
      UI.toast('Upravené', 'ok');
      this.render();
    },

    chipHtml(c) {
      const on = this.ticked.has(c.id);
      return `<button class="chip chip-${c.polarity}${on ? ' on' : ''}" id="chip-${c.id}"
        onclick="Guide.toggleChip('${c.id}')" ${c.hint ? `title="${UI.esc(c.hint)}"` : ''}
        >${on ? Icon('check', 13) : ''}${UI.esc(c.label)}</button>`;
    },

    pitchHtml() {
      const lines = this.trade?.pitch || [];
      if (!lines.length) return '';
      return `
        <button class="guide-pitch-btn" onclick="Guide.togglePitch()">
          ${Icon('note', 15)} ${this._pitch ? 'Skryť' : 'Čo mu povedať o práci'}</button>
        ${this._pitch ? `<div class="guide-hint guide-hint-ok">
          ${lines.map(x => '· ' + UI.esc(x)).join('<br>')}</div>` : ''}`;
    },

    togglePitch() { this._pitch = !this._pitch; this.render(); },

    noteChanged(segKey, value) { this.notes.set(segKey, value); },

    // ── Otázka po otázke ──────────────────────────────────────────────────
    // „Aby išla otázka po otázke — rýchlo by som to vedel vyplniť a nezdržiaval."
    // Na obrazovke je vždy jedna otázka. Odpoveď (klik alebo 1–3) hneď posunie
    // na ďalšiu. V úvode je ako prvá „odkiaľ by si cestoval" — s trasou na stavbu.

    /** Kroky časti: (cesta) + otázky s odpoveďami. */
    steps(seg) {
      const g = this.callQ(seg);
      const kam = window.DanubraRoute ? DanubraRoute.destinationOf(this.plan || {}, this.subcontract() || {}) : '';
      const cesta = ['intro', 'quick'].includes(seg.key) && kam ? [{ type: 'route', key: '_route', kam }] : [];
      return [...cesta, ...g.questions.map(q => ({ type: 'q', key: q.key, q }))];
    },

    stepHtml(seg, kroky, i) {
      const k = kroky[i];
      this._stepCtx = { segKey: seg.key, n: kroky.length, step: k };
      const bodky = kroky.map((x, j) => `<button class="qq-dot${j === i ? ' on' : ''}${
        this.stepDone(x) ? ' done' : ''}" onclick="Guide.goStep('${seg.key}',${j})"
        aria-label="Otázka ${j + 1}"></button>`).join('');
      const telo = k.type === 'route' ? this.routeStepHtml(seg, k) : this.questionStepHtml(seg, k.q);
      return `
        <div class="qq-top">
          <span>${UI.esc(seg.title)} · otázka <b>${i + 1}</b> z ${kroky.length}</span>
          <div class="qq-dots">${bodky}</div>
        </div>
        ${telo}
        <div class="qq-nav">
          <button class="guide-nav-btn" onclick="Guide.stepBack('${seg.key}')" ${i === 0 && this.segIndex === 0 ? 'disabled' : ''}>
            ${Icon('chevron', 16)} Späť</button>
          <span class="qq-keys">klávesy <kbd>1</kbd>–<kbd>3</kbd> odpoveď · <kbd>0</kbd> iné · <kbd>→</kbd> preskočiť</span>
          <button class="guide-nav-btn" onclick="Guide.stepNext('${seg.key}')">Preskočiť ${Icon('chevron', 16)}</button>
        </div>`;
    },

    stepDone(k) {
      if (k.type === 'route') return !!this.route;
      const st = this.callQState(k.q);
      return st !== null && st !== undefined;
    },

    questionStepHtml(seg, q) {
      const sel = this.callQState(q);
      const a = this.answers && this.answers.get(q.key);
      return `
        <div class="qq-q">${UI.esc(q.q)}</div>
        <div class="qq-ans">
          ${q.answers.map((ans, i) => `<button class="qq-a pol-${ans.chip ? ans.chip.polarity : 'neutral'}${
            sel === i ? ' on' : ''}" onclick="Guide.answer('${seg.key}','${q.key}',${i})"
            ${ans.chip && ans.chip.hint ? `title="${UI.esc(ans.chip.hint)}"` : ''}>
            <kbd>${i + 1}</kbd><span>${UI.esc(ans.label)}</span></button>`).join('')}
          <button class="qq-a qq-other${sel === 'other' ? ' on' : ''}"
            onclick="Guide.answerOther('${seg.key}','${q.key}')"><kbd>0</kbd><span>Iné…</span></button>
        </div>
        ${sel === 'other' ? `<input class="cq2-other" id="cq2-in-${q.key}" placeholder="Čo povedal? Enter = ďalej"
          value="${UI.esc((a && a.other) || '')}"
          oninput="Guide.answers.set('${q.key}',{other:this.value})"
          onkeydown="if(event.key==='Enter'){event.preventDefault();Guide.stepNext('${seg.key}')}">` : ''}`;
    },

    // ── Cesta na stavbu ───────────────────────────────────────────────────
    routeStepHtml(seg, k) {
      const r = this.route;
      return `
        <div class="qq-q">Odkiaľ by ste cestovali?</div>
        <div class="qq-lead">Napíš mesto alebo adresu — appka povie, koľko je to na stavbu
          (${UI.esc(k.kam)}).</div>
        <div class="qq-route-in">
          <input id="route-from" class="cq2-other" placeholder="napr. Žilina alebo Hlinkova 5, Prešov"
            value="${UI.esc(this.routeFrom || '')}" autocomplete="off"
            oninput="Guide.routeFrom=this.value"
            onkeydown="if(event.key==='Enter'){event.preventDefault();Guide.calcRoute('${seg.key}')}">
          <button class="btn btn-primary" id="route-go" onclick="Guide.calcRoute('${seg.key}')">
            ${Icon('pin', 15)} Vypočítať cestu</button>
        </div>
        <div id="route-box">${r ? this.routeBoxHtml(r) : ''}</div>
        ${r ? `<button class="btn btn-primary qq-continue" onclick="Guide.stepNext('${seg.key}')">
          Ďalšia otázka ${Icon('chevron', 15)}</button>` : ''}`;
    },

    routeBoxHtml(r) {
      if (r.error) return `<div class="warnbox">${Icon('alert', 14)} ${UI.esc(r.error)}</div>`;
      return `<div class="qq-route">
        <div class="qq-route-big">${Icon('pin', 18)} <b>${r.km} km</b> · ${UI.esc(DanubraRoute.durationText(r.minutes))} autom</div>
        <div class="qq-route-say">Povedz mu: „Je to <b>${r.km} km</b>, autom asi
          <b>${UI.esc(DanubraRoute.durationText(r.minutes))}</b>."</div>
        <div class="qq-route-from">${UI.esc(r.from.label)} → ${UI.esc(r.to.label)} ·
          <a href="${UI.esc(r.mapsUrl)}" target="_blank" rel="noopener">trasa v Google Mapách</a></div>
        <div id="route-map" class="qq-map"></div>
      </div>`;
    },

    /** Mapa s trasou. Bez knižnice sa nevykreslí, ale čísla ostanú. */
    paintRouteMap() {
      const r = this.route;
      const el = document.getElementById('route-map');
      if (!el || !r || r.error || typeof L === 'undefined') { if (el) el.remove(); return; }
      if (el._m) { el._m.remove(); }
      const map = L.map(el, { scrollWheelZoom: false, zoomControl: false });
      L.tileLayer(window.DanubraMap ? DanubraMap.tileUrl() : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
      const a = [r.from.lat, r.from.lng], b = [r.to.lat, r.to.lng];
      L.circleMarker(a, { radius: 7, color: '#1E4FD8', fillOpacity: 1 }).addTo(map).bindTooltip(r.from.label);
      L.circleMarker(b, { radius: 7, color: '#F07E22', fillOpacity: 1 }).addTo(map).bindTooltip(r.to.label);
      const line = (r.line && r.line.length > 1) ? r.line : [a, b];
      const pl = L.polyline(line, { color: '#1E4FD8', weight: 4, opacity: .8 }).addTo(map);
      map.fitBounds(pl.getBounds(), { padding: [20, 20] });
      setTimeout(() => { try { map.invalidateSize(); } catch {} }, 60);
      el._m = map;
    },

    async calcRoute(segKey) {
      const from = String(this.routeFrom || document.getElementById('route-from')?.value || '').trim();
      if (!from) return UI.toast('Napíš, odkiaľ ide', 'err');
      const to = DanubraRoute.destinationOf(this.plan || {}, this.subcontract() || {});
      const btn = document.getElementById('route-go');
      if (btn) { btn.disabled = true; btn.textContent = 'Počítam…'; }
      let r;
      try {
        const res = await fetch('/.netlify/functions/danubra-route', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to }),
        });
        r = await res.json();
        if (r.error) throw new Error(r.error);
        if (r.notFound === 'from') throw new Error(`„${from}" som na mape nenašiel — skús mesto bez ulice.`);
        if (r.notFound === 'to') throw new Error(`Miesto stavby „${to}" som na mape nenašiel.`);
        if (r.noRoute) throw new Error('Trasu autom sa nepodarilo vypočítať.');
      } catch (e) {
        r = { error: e.message || 'Cestu sa nepodarilo vypočítať.' };
      }
      this.route = r.error ? null : r;
      this.routeFrom = from;
      // Kde býva, sa zapíše ku kandidátovi — o týždeň to bude treba znova.
      if (!r.error && this.cand) {
        DB.update('candidates', this.cand.id, { city: from }).then(() => {});
        this.cand.city = from;
      }
      this.render();
      if (r.error) {
        const box = document.getElementById('route-box');
        if (box) box.innerHTML = this.routeBoxHtml(r);
      }
    },

    goStep(segKey, j) { this.qStep[segKey] = j; this.render(); },

    stepNext(segKey) {
      this.qStep[segKey] = ((this.qStep || {})[segKey] || 0) + 1;
      this.render();
    },

    stepBack(segKey) {
      const i = (this.qStep || {})[segKey] || 0;
      if (i > 0) { this.qStep[segKey] = i - 1; return this.render(); }
      // Na prvej otázke „Späť" vedie do predchádzajúcej časti, na jej koniec.
      return this.prevSegment();
    },

    /** Po otázkach: čo zaznelo, s možnosťou vrátiť sa ku ktorejkoľvek. */
    answeredHtml(seg, kroky) {
      const riadok = (k, j) => {
        let txt = '—';
        if (k.type === 'route') txt = this.route ? `${this.routeFrom}: ${DanubraRoute.sentence(this.route)}` : '—';
        else {
          const st = this.callQState(k.q);
          const a = this.answers && this.answers.get(k.key);
          txt = st === 'other' ? ((a && a.other) || 'iné') : (st != null ? k.q.answers[st].label : '—');
        }
        const nazov = k.type === 'route' ? 'Odkiaľ cestuje' : k.q.q;
        return `<button class="qq-sum-row${txt === '—' ? ' empty' : ''}" onclick="Guide.goStep('${seg.key}',${j})">
          <span>${UI.esc(nazov)}</span><b>${UI.esc(txt)}</b>${Icon('edit', 12)}</button>`;
      };
      return `<div class="qq-sum">${kroky.map(riadok).join('')}</div>`;
    },

    // ── Otázky s odpoveďami na klik ───────────────────────────────────────
    // „Konkrétne otázky a potom výber, čo povie — 2–3 možnosti alebo iné."
    // Odpovede sú naviazané na polia hovoru, takže klik zaškrtne to isté pole
    // ako doteraz (skóre a varovania sa nemenia). Pozri lib/recruiting/callq.js.
    callQ(seg) {
      const CQ = window.DanubraCallQ;
      if (!CQ) return { questions: [], rest: seg.chips };
      const usable = this.chips.filter(c => !c.trade_key || c.trade_key === this.trade?.key);
      const g = CQ.group(seg.key, usable, seg.chips);
      this._cq = this._cq || {};
      this._cq[seg.key] = g.questions;
      return g;
    },

    callQState(q) {
      const a = this.answers && this.answers.get(q.key);
      if (a) return a.other != null ? 'other' : a.idx;
      return window.DanubraCallQ.selected(q, this.ticked);
    },

    callQHtml(segKey, q) {
      const sel = this.callQState(q);
      const a = this.answers && this.answers.get(q.key);
      return `<div class="cq2" id="cq2-${q.key}">
        <div class="cq2-q">${UI.esc(q.q)}</div>
        <div class="cq2-ans">
          ${q.answers.map((ans, i) => `<button class="cq2-a pol-${ans.chip ? ans.chip.polarity : 'neutral'}${
            sel === i ? ' on' : ''}" onclick="Guide.answer('${segKey}','${q.key}',${i})"
            ${ans.chip && ans.chip.hint ? `title="${UI.esc(ans.chip.hint)}"` : ''}>
            ${sel === i ? Icon('check', 13) : ''}${UI.esc(ans.label)}</button>`).join('')}
          <button class="cq2-a cq2-other-btn${sel === 'other' ? ' on' : ''}"
            onclick="Guide.answerOther('${segKey}','${q.key}')">${Icon('edit', 12)} iné…</button>
        </div>
        ${sel === 'other' ? `<input class="cq2-other" id="cq2-in-${q.key}" placeholder="Čo povedal?"
          value="${UI.esc((a && a.other) || '')}"
          oninput="Guide.answers.set('${q.key}',{other:this.value})">` : ''}
      </div>`;
    },

    /** Prekreslí len jednu otázku — celé okno by pri telefóne skočilo hore. */
    paintCallQ(segKey, q) {
      const el = document.getElementById(`cq2-${q.key}`);
      if (el) el.outerHTML = this.callQHtml(segKey, q);
    },

    answer(segKey, qKey, i) {
      const q = ((this._cq || {})[segKey] || []).find(x => x.key === qKey);
      if (!q) return;
      const vypnut = this.callQState(q) === i;
      // Odpovede na jednu otázku sa vylučujú — iné polia tej istej otázky sa odškrtnú.
      q.answers.forEach((a, j) => {
        if (a.chip && this.ticked.has(a.chip.id) && (vypnut || j !== i)) this.toggleChip(a.chip.id);
      });
      if (vypnut) this.answers.delete(qKey);
      else {
        const a = q.answers[i];
        if (a.chip && !this.ticked.has(a.chip.id)) this.toggleChip(a.chip.id);
        this.answers.set(qKey, { idx: i });
      }
      // Otázka po otázke: odpoveď hneď posunie ďalej (krátko, nech je vidieť, čo sa zvolilo).
      if (this._stepCtx && this._stepCtx.segKey === segKey && !vypnut) {
        this.render();
        clearTimeout(this._stepT);
        this._stepT = setTimeout(() => this.stepNext(segKey), 220);
        return;
      }
      if (this._stepCtx) return this.render();
      this.paintCallQ(segKey, q);
    },

    answerOther(segKey, qKey) {
      const q = ((this._cq || {})[segKey] || []).find(x => x.key === qKey);
      if (!q) return;
      q.answers.forEach((a) => { if (a.chip && this.ticked.has(a.chip.id)) this.toggleChip(a.chip.id); });
      const pred = this.answers.get(qKey);
      this.answers.set(qKey, { other: (pred && pred.other) || '' });
      if (this._stepCtx) this.render();
      else this.paintCallQ(segKey, q);
      setTimeout(() => document.getElementById(`cq2-in-${qKey}`)?.focus(), 20);
    },

    // ── Zaškrtávanie ──────────────────────────────────────────────────────
    /**
     * Klepnutie musí byť vidieť okamžite. Preto sa najprv prekreslí obrazovka
     * a až potom sa to ukladá — pri hovore sa nedá čakať na server. Keby zápis
     * zlyhal, pole sa vráti späť a povie sa to nahlas.
     */
    toggleChip(chipId) {
      const chip = this.chips.find(c => c.id === chipId);
      if (!chip) return;
      const turningOn = !this.ticked.has(chipId);

      if (turningOn) this.ticked.set(chipId, chip);
      else this.ticked.delete(chipId);
      this.paintChip(chip, turningOn);
      this.refreshAside();
      if (turningOn && chip.polarity === 'flag') UI.toast('Varovanie zaznamenané', 'err');

      this.persistChip(chip, turningOn);
    },

    /** Prefarbí jedno pole a prepíše počítadlo — bez prekreslenia obrazovky. */
    paintChip(chip, on) {
      const el = document.getElementById(`chip-${chip.id}`);
      if (el) {
        el.classList.toggle('on', on);
        el.innerHTML = `${on ? Icon('check', 13) : ''}${UI.esc(chip.label)}`;
      }
      const count = document.getElementById('tick-count');
      if (count) count.textContent = `${this.ticked.size} zaškrtnutých`;
    },

    /** Prekreslí priebeh — bočný panel na širokej obrazovke, lištu na mobile. */
    refreshAside() {
      const aside = document.getElementById('guide-aside');
      if (aside) aside.innerHTML = this.asideHtml();
      const mini = document.getElementById('guide-mini');
      if (mini) mini.innerHTML = this.miniHtml();
      for (const el of document.querySelectorAll('.live-score, .mini-score')) {
        el.classList.add('pulse');
        setTimeout(() => el.classList.remove('pulse'), 420);
      }
    },

    /** Úzka lišta pre mobil: skóre, počet zaškrtnutých a varovania. */
    miniHtml() {
      const ticked = [...this.ticked.values()];
      const r = CH.scoreChips(ticked);
      const V = { strong: 'ok', ok: 'ok', weak: 'warn', reject: 'bad', unknown: 'mute' };
      const flags = ticked.filter(c => c.polarity === 'flag').length;
      return `
        <span class="mini-score verdict-${V[r.verdict] || 'mute'}">
          ${r.percent == null ? '—' : r.percent + ' %'}</span>
        <span class="mini-count">${ticked.length} zaškrtnutých</span>
        ${flags ? `<span class="mini-flags">${Icon('alert', 12)} ${flags}</span>` : ''}`;
    },

    async persistChip(chip, on) {
      let error;
      if (on) {
        ({ error } = await DB.from('candidate_chips').upsert({
          candidate_id: this.cand.id, chip_id: chip.id,
          label: chip.label, polarity: chip.polarity, weight: chip.weight, segment: chip.segment,
          checked_by: Danubra.user?.id || null,
        }, { onConflict: 'candidate_id,chip_id' }));
        if (!error) {
          // učenie: čo používaš, ide nabudúce hore
          DB.client.rpc('danubra_chip_used', { p_chip: chip.id }).catch(() => {});
          chip.use_count = (chip.use_count || 0) + 1;
        }
      } else {
        ({ error } = await DB.from('candidate_chips').delete()
          .eq('candidate_id', this.cand.id).eq('chip_id', chip.id));
      }
      if (!error) return;

      // zápis zlyhal — vráť pole do pôvodného stavu, nech obrazovka neklame
      if (on) this.ticked.delete(chip.id); else this.ticked.set(chip.id, chip);
      this.paintChip(chip, !on);
      this.refreshAside();
      UI.toast('Neuložilo sa: ' + error.message, 'err');
    },

    /** Vlastné pole priamo počas hovoru — nabudúce ho už máš. */
    async addChipPrompt(segKey) {
      const label = await UI.ask('Čo pridať? (krátko, napr. „vie robiť aj podhľady")');
      if (!label || !label.trim()) return;
      const polarity = await UI.ask('Je to dobré znamenie, zlé alebo varovanie?\n'
        + 'napíš: plus / minus / varovanie / nic', 'plus');
      const map = { plus: 'plus', minus: 'minus', varovanie: 'flag', nic: 'neutral' };
      const pol = map[(polarity || '').trim().toLowerCase()] || 'neutral';

      const { data, error } = await DB.insert('call_chips', {
        trade_key: segKey === 'trade' ? this.trade?.key || null : null,
        segment: segKey, label: label.trim(), polarity: pol,
        weight: pol === 'flag' ? 2 : 1, source: 'manual',
        created_by: Danubra.user?.id || null,
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      this.chips.push(data);
      this.segments = CH.buildCallSegments({
        tradeKey: this.trade?.key || this.cand?.profession, chips: this.chips,
      });
      this.ticked.set(data.id, data);
      this.render();                      // nové pole sa musí objaviť v zozname
      this.persistChip(data, true);
      UI.toast('Pole pridané — nabudúce ho už máš', 'ok');
    },

    // ── Prechod medzi segmentmi ───────────────────────────────────────────
    async saveNote(segKey) {
      const el = document.getElementById('seg-note');
      // Odpovede bez poľa („Sám", „Nie") a vlastné „iné" idú do poznámky —
      // inak by sa z hovoru stratili.
      const riadky = window.DanubraCallQ
        ? DanubraCallQ.noteLines((this._cq || {})[segKey], this.answers) : [];
      if (this.route && ['intro', 'quick'].includes(segKey)) {
        riadky.unshift(`Cesta: ${this.routeFrom} → ${this.route.to.label}: ${DanubraRoute.sentence(this.route)}`);
      }
      const body = [(el?.value || this.notes.get(segKey) || '').trim(), ...riadky]
        .filter(Boolean).join('\n');
      if (!body || body === this._savedNote?.[segKey]) return;
      const { error } = await DB.insert('candidate_notes', {
        candidate_id: this.cand.id, step_key: segKey, body,
        created_by: Danubra.user?.id || null, author_name: CandProc.authorName(),
      });
      if (!error) {
        this._savedNote = this._savedNote || {};
        this._savedNote[segKey] = body;
      }
    },

    async nextSegment() {
      const seg = this.segments[this.segIndex];
      if (seg) await this.saveNote(seg.key);
      this.segIndex = Math.min(this.segIndex + 1, this.segments.length);
      this.render();
    },

    async prevSegment() {
      const seg = this.segments[this.segIndex];
      if (seg) await this.saveNote(seg.key);
      this.segIndex = Math.max(0, this.segIndex - 1);
      this.render();
    },

    goToSegment(i) { this.segIndex = i; this.render(); },

    // ── Záver hovoru ──────────────────────────────────────────────────────
    callSummary() {
      const r = CH.callOutcome([...this.ticked.values()]);
      const s = CH.summarize([...this.ticked.values()]);
      const good = r.verdict === 'strong' || r.verdict === 'ok';
      return `
        <div class="guide-done">
          <div class="guide-done-ico ${good ? 'ok' : 'warn'}">
            ${Icon(good ? 'check' : 'alert', 30)}</div>
          ${r.percent != null ? `<div class="guide-score">${UI.pct(r.percent)}</div>` : ''}
          <div class="guide-q" style="margin-bottom:6px;">${UI.esc(r.nextAction.label)}</div>
          <div class="guide-hint" style="text-align:left;">${UI.esc(r.nextAction.hint)}</div>

          ${s.flags.length ? `<div class="guide-missing">
            ${s.flags.map(f => `<div class="raised">${Icon('alert', 13)} ${UI.esc(f)}</div>`).join('')}
          </div>` : ''}

          <div class="sum-cols">
            <div><b>Hovorí pre neho</b>${s.good.length
              ? `<ul>${s.good.map(x => `<li>${UI.esc(x)}</li>`).join('')}</ul>`
              : '<p>nič zaškrtnuté</p>'}</div>
            <div><b>Hovorí proti</b>${s.bad.length
              ? `<ul>${s.bad.map(x => `<li>${UI.esc(x)}</li>`).join('')}</ul>`
              : '<p>nič</p>'}</div>
          </div>

          ${this.mode !== 'full' ? `<div class="quick-next">
            ${(() => { const n = CH.quickNext(r); return `
              <b>${UI.esc(n.label)}</b>
              <span>${UI.esc(n.why)}</span>`; })()}
          </div>` : ''}

          ${this.mode !== 'full' && r.nextAction.key !== 'reject'
            ? `<button class="guide-btn guide-btn-yes" style="margin-bottom:10px;"
                 onclick="Guide.goFull()">${Icon('chevron', 18)}
                 Pokračovať plným pohovorom</button>` : ''}

          <div class="guide-end-actions">
            ${r.nextAction.key === 'reject'
              ? `<button class="guide-btn guide-btn-red" onclick="Guide.finishCall('reject')">
                  Zamietnuť a zapísať dôvod</button>`
              : `<button class="guide-btn guide-btn-yes" onclick="Guide.finishCall('advance')">
                  ${Icon('check', 18)} Ísť preveriť</button>`}
            <button class="guide-btn guide-btn-no" onclick="Guide.finishCall('continue')">
              Uložiť a pokračovať neskôr</button>
          </div>
          <button class="guide-nav-btn" style="width:100%;margin-top:10px;justify-content:center;"
            onclick="Guide.goToSegment(${this.segments.length - 1})">
            ${Icon('chevron', 16)} Späť do hovoru</button>
        </div>`;
    },

    async finishCall(action) {
      const ticked = [...this.ticked.values()];
      const r = CH.callOutcome(ticked);
      const patch = {
        screening_score: r.percent,
        screening_verdict: r.verdict,
        screening_done_at: new Date().toISOString(),
        status: action === 'reject' ? 'rejected' : 'interview',
      };
      await DB.update('candidates', this.cand.id, patch);

      if (action === 'reject') {
        const reason = await UI.ask('Prečo ho nechceme? (zapíše sa, aby sa o pol roka vedelo)')
          || (r.flags[0]?.label ?? null);
        await DB.update('candidates', this.cand.id, { outcome: 'rejected', outcome_reason: reason });
        UI.toast('Zamietnutý a zapísaný', 'ok');
      } else if (action === 'advance') {
        CandProc.open = 'proof';
        UI.toast('Uložené — pokračuj krokom Preveriť', 'ok');
      } else {
        UI.toast('Uložené', 'ok');
      }

      // z poznámok sa dajú navrhnúť nové polia; beží na pozadí, hovor nezdržuje
      this.requestSuggestions();

      const id = this.cand.id;
      this.close();
      setTimeout(() => Cand.detail(id), 260);
    },

    /** Požiada server, nech z poznámok navrhne nové polia. Tichý, nepovinný krok. */
    requestSuggestions() {
      const body = JSON.stringify({
        candidateId: this.cand.id,
        tradeKey: this.trade?.key || this.cand?.profession || null,
      });
      fetch('/.netlify/functions/danubra-suggest-chips', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      }).then(r => r.json()).then(d => {
        if (d?.created) UI.toast(`${d.created} nových polí čaká na potvrdenie`, 'ok');
      }).catch(() => {});
    },

    // ── Klávesnica ────────────────────────────────────────────────────────
    onKey(e) {
      if (e.key === 'Escape') return this.close();
      if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      // Otázka po otázke: 1–9 odpoveď, 0 iné, šípky ďalej/späť.
      const c = this._stepCtx;
      if (c && !this.setup) {
        if (c.step.type === 'q' && /^[0-9]$/.test(e.key)) {
          const n = Number(e.key);
          e.preventDefault();
          if (n === 0) return this.answerOther(c.segKey, c.step.key);
          if (n <= c.step.q.answers.length) return this.answer(c.segKey, c.step.key, n - 1);
          return;
        }
        if (e.key === 'ArrowRight') { e.preventDefault(); return this.stepNext(c.segKey); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); return this.stepBack(c.segKey); }
      }
      if (e.key === 'ArrowRight') { e.preventDefault(); return this.nextSegment(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); return this.prevSegment(); }
    },
  };

  window.Guide = Guide;
})();
