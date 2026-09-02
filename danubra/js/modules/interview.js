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

  const Guide = {
    cand: null,
    trades: [], trade: null, chips: [],
    plans: [], plan: null, subcontracts: [], partners: [],
    segments: [], segIndex: 0, setup: false, pickMode: 'plan',
    ticked: new Map(),        // chip_id → chip
    notes: new Map(),         // segment → rozpísaná poznámka

    // ── Živý nábor ────────────────────────────────────────────────────────
    async startCall() {
      await this.loadContext();
      this.cand = null; this.trade = null; this.plan = null;
      this.setup = true; this.segIndex = 0;
      this.pickMode = this.plans.length ? 'plan' : 'trade';
      this.ticked = new Map(); this.notes = new Map();
      this.open();
    },

    /** Všetko, čo treba mať po ruke počas hovoru — naraz, nie po kúskoch. */
    async loadContext() {
      if (!Trades.loaded) await Trades.load();
      this.trades = Trades.trades.filter(t => t.active !== false);
      const [chips, plans, subs, parts] = await Promise.all([
        DB.list('call_chips', { limit: 800 }),
        DB.list('recruitment_plans', { limit: 200 }),
        DB.list('subcontracts', { limit: 200 }),
        DB.list('partners', { select: 'id,name,city,payment_terms_days', limit: 200 }),
      ]);
      this.chips = (chips.data || []).filter(c => c.active !== false);
      this.plans = (plans.data || []).filter(p => p.status === 'active');
      this.subcontracts = subs.data || [];
      this.partners = parts.data || [];
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
      if (!this.trade) return UI.toast('Vyber remeslo', 'err');
      const name = document.getElementById('call-name')?.value.trim();
      if (!name) return UI.toast('Zapíš aspoň meno', 'err');
      const phone = document.getElementById('call-phone')?.value.trim() || null;
      const crew = document.getElementById('call-crew')?.checked;

      const btn = document.getElementById('call-go');
      if (btn) { btn.disabled = true; btn.textContent = 'Zakladám…'; }

      const { data: cand, error } = await DB.insert('candidates', {
        full_name: name, phone, type: crew ? 'crew' : 'individual',
        profession: this.trade.key, legal_form: this.plan?.legal_form || 'szco',
        source: 'inzerat', status: 'contacted',
        plan_id: this.plan?.id || null,
        city: this.plan?.city || null,
        expected_rate: this.plan?.offer_rate ?? null,
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
      this.segments = CH.buildCallSegments({ tradeKey: this.trade.key, chips: this.chips });
      if (!this.segments.length) {
        UI.toast('Pre toto remeslo nie sú žiadne polia', 'err');
        if (btn) { btn.disabled = false; btn.textContent = 'Začať hovor'; }
        return;
      }
      this.setup = false;
      this.segIndex = 0;
      this.render();
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
      this.segments = CH.buildCallSegments({ tradeKey: cand.profession, chips: this.chips });
      this.notes = new Map();
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
          aside: (this.plan || this.trade) ? this.contextHtml() : '',
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
        <div class="guide-cols">
          <div class="guide-body">${body}</div>
          ${aside ? `<aside class="guide-aside">${aside}</aside>` : ''}
        </div>`;
    },

    // ── Bočný panel: o akú zákazku ide a čo z hovoru zatiaľ vyšlo ──────────
    asideHtml() {
      return `<div class="aside-inner">
        ${this.contextHtml()}
        ${this.liveHtml()}
      </div>`;
    },

    contextHtml() {
      const p = this.plan, sub = this.subcontract(), partner = this.partnerOf(sub);
      if (!p && !sub && !this.trade) return '';
      const row = (k, v) => v ? `<div><span>${k}</span><strong>${UI.esc(v)}</strong></div>` : '';
      return `
        <div class="aside-card">
          <div class="aside-title">${Icon('site', 14)} ${UI.esc(p?.title || this.trade?.name_sk || 'Nábor')}</div>
          <div class="aside-kv">
            ${row('Remeslo', this.trade?.name_sk)}
            ${row('Kde', [p?.city || sub?.site_city, p?.country === 'DE' ? 'Nemecko' : p?.country].filter(Boolean).join(', '))}
            ${row('Nástup', p?.start_date ? UI.date(p.start_date) : null)}
            ${row('Treba ľudí', p?.headcount ? String(p.headcount) : null)}
            ${row('Ponúkame', p?.offer_rate ? `${p.offer_rate} €/h` : null)}
            ${row('Forma', p ? (p.legal_form === 'employee' ? 'zamestnanec' : 'živnosť') : null)}
          </div>
          ${p ? `<div class="aside-tags">
            ${p.accommodation_provided ? '<span class="atag">ubytovanie platíme</span>' : ''}
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
      return `
        <div class="guide-q">Na čo volá?</div>
        ${this.plans.length ? `<div class="pillbar" style="margin-bottom:12px;width:max-content;">
          <button class="pill${byPlan ? ' active' : ''}" onclick="Guide.setPickMode('plan')">Bežiaci nábor</button>
          <button class="pill${!byPlan ? ' active' : ''}" onclick="Guide.setPickMode('trade')">Do zásoby</button>
        </div>` : ''}

        ${byPlan ? `<div class="plan-grid">
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
              <span class="tt-rate">${t.rate_worker_min}–${t.rate_worker_max} €/h</span>
            </button>`).join('')}
        </div>`}

        <input id="call-name" class="guide-note" style="margin-top:16px;" placeholder="Ako sa volá?"
          onkeydown="if(event.key==='Enter'){event.preventDefault();Guide.beginCall()}">
        <input id="call-phone" class="guide-note" style="margin-top:10px;" placeholder="Telefón (nepovinné)">
        <label class="chk chk-lg" style="margin-top:12px;display:flex;gap:10px;align-items:center;">
          <input type="checkbox" id="call-crew"> <span style="font-size:15px;">Je to partia, nie jednotlivec</span>
        </label>

        <button class="guide-btn guide-btn-yes" id="call-go" style="margin-top:18px;"
          onclick="Guide.beginCall()">${Icon('phone', 20)} Začať hovor</button>
        ${!this.trade ? `<div class="guide-note-hint">Vyber nábor alebo remeslo — podľa toho sa
          poskladajú polia a vpravo uvidíš, o akú zákazku ide.</div>` : ''}`;
    },

    // ── Jedna obrazovka = jeden segment ───────────────────────────────────
    segmentHtml(seg) {
      const note = this.notes.get(seg.key) || '';
      return `
        <div class="guide-q">${UI.esc(seg.title)}</div>
        <div class="guide-lead">${UI.esc(seg.lead)}</div>

        <div class="chip-list">
          ${seg.chips.map(c => this.chipHtml(c)).join('')}
          <button class="chip chip-add" onclick="Guide.addChipPrompt('${seg.key}')">
            ${Icon('plus', 14)} pridať vlastné</button>
        </div>

        <textarea id="seg-note" class="guide-note guide-textarea" rows="5"
          placeholder="Čo hovorí? Píš vlastnými slovami…"
          oninput="Guide.noteChanged('${seg.key}', this.value)">${UI.esc(note)}</textarea>
        <div class="guide-note-hint">Poznámka sa uloží pri prechode ďalej. Neskôr z nej vieme
          navrhnúť nové polia.</div>

        ${this.pitchHtml()}

        <div class="guide-nav">
          <button class="guide-nav-btn" onclick="Guide.prevSegment()" ${this.segIndex === 0 ? 'disabled' : ''}>
            ${Icon('chevron', 16)} Späť</button>
          <span class="guide-nav-mid">${this.ticked.size} zaškrtnutých</span>
          <button class="guide-nav-btn guide-nav-next" onclick="Guide.nextSegment()">
            ${this.segIndex === this.segments.length - 1 ? 'Ukončiť hovor' : 'Ďalej'} ${Icon('chevron', 16)}</button>
        </div>`;
    },

    chipHtml(c) {
      const on = this.ticked.has(c.id);
      return `<button class="chip chip-${c.polarity}${on ? ' on' : ''}"
        onclick="Guide.toggleChip('${c.id}')" ${c.hint ? `title="${UI.esc(c.hint)}"` : ''}>
        ${on ? Icon('check', 13) : ''}${UI.esc(c.label)}
      </button>`;
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

    // ── Zaškrtávanie ──────────────────────────────────────────────────────
    async toggleChip(chipId) {
      const chip = this.chips.find(c => c.id === chipId);
      if (!chip) return;

      if (this.ticked.has(chipId)) {
        this.ticked.delete(chipId);
        await DB.from('candidate_chips').delete()
          .eq('candidate_id', this.cand.id).eq('chip_id', chipId);
      } else {
        this.ticked.set(chipId, chip);
        const { error } = await DB.from('candidate_chips').upsert({
          candidate_id: this.cand.id, chip_id: chipId,
          label: chip.label, polarity: chip.polarity, weight: chip.weight, segment: chip.segment,
          checked_by: Danubra.user?.id || null,
        }, { onConflict: 'candidate_id,chip_id' });
        if (error) UI.toast('Chyba: ' + error.message, 'err');
        // učenie: čo používaš, ide nabudúce hore
        DB.client.rpc('danubra_chip_used', { p_chip: chipId }).catch(() => {});
        chip.use_count = (chip.use_count || 0) + 1;
        if (chip.polarity === 'flag') UI.toast('Varovanie zaznamenané', 'err');
      }
      this.render();
    },

    /** Vlastné pole priamo počas hovoru — nabudúce ho už máš. */
    async addChipPrompt(segKey) {
      const label = prompt('Čo pridať? (krátko, napr. „vie robiť aj podhľady")');
      if (!label || !label.trim()) return;
      const polarity = prompt('Je to dobré znamenie, zlé alebo varovanie?\n'
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
      await this.toggleChip(data.id);
      UI.toast('Pole pridané — nabudúce ho už máš', 'ok');
    },

    // ── Prechod medzi segmentmi ───────────────────────────────────────────
    async saveNote(segKey) {
      const el = document.getElementById('seg-note');
      const body = (el?.value || this.notes.get(segKey) || '').trim();
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
          ${r.percent != null ? `<div class="guide-score">${r.percent} %</div>` : ''}
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

          <div class="guide-end-actions">
            ${r.nextAction.key === 'reject'
              ? `<button class="guide-btn guide-btn-red" onclick="Guide.finishCall('reject')">
                  Zamietnuť a zapísať dôvod</button>`
              : `<button class="guide-btn guide-btn-yes" onclick="Guide.finishCall('advance')">
                  ${Icon('check', 18)} Ísť na overenie</button>`}
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
        const reason = prompt('Prečo ho nechceme? (zapíše sa, aby sa o pol roka vedelo)')
          || (r.flags[0]?.label ?? null);
        await DB.update('candidates', this.cand.id, { outcome: 'rejected', outcome_reason: reason });
        UI.toast('Zamietnutý a zapísaný', 'ok');
      } else if (action === 'advance') {
        CandProc.open = 'k3';
        UI.toast('Uložené — pokračuj krokom Overenie', 'ok');
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
      if (e.key === 'ArrowRight') { e.preventDefault(); return this.nextSegment(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); return this.prevSegment(); }
    },
  };

  window.Guide = Guide;
})();
