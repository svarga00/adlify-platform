// ============================================================================
// DANUBRA — sprievodca náborovým hovorom
// ============================================================================
// Toto sa používa s telefónom pri uchu. Nič sa neznámkuje — odškrtáva sa, čo
// zaznelo, a zvyšok sa zapíše vlastnými slovami.
//
// Dva režimy v tom istom plášti:
//   call    — živý nábor: jedna obrazovka na segment, polia + poznámka
//   process — kroky K1–K6 pri už založenom kandidátovi (áno / zatiaľ nie)
//
// Všetko sa ukladá hneď po klepnutí. Keď hovor spadne, nič sa nestratí.
// ============================================================================
(function () {
  const P = window.DanubraProcess;
  const CH = window.DanubraChips;

  const Guide = {
    mode: null,               // 'call' | 'process'
    cand: null,
    // živý nábor
    trades: [], trade: null, segments: [], segIndex: 0, setup: false,
    ticked: new Map(),        // chip_id → chip
    notes: new Map(),         // segment → rozpísaná poznámka
    // kroky procesu
    stepKey: null, items: [], pos: 0, answers: new Map(),

    // ── Živý nábor ────────────────────────────────────────────────────────
    async startCall() {
      if (!Trades.loaded) await Trades.load();
      this.trades = Trades.trades.filter(t => t.active !== false);
      await this.loadChips();

      this.mode = 'call';
      this.cand = null; this.trade = null;
      this.setup = true; this.segIndex = 0;
      this.ticked = new Map(); this.notes = new Map();
      this.open();
    },

    async loadChips() {
      const { data } = await DB.list('call_chips', { limit: 800 });
      this.chips = (data || []).filter(c => c.active !== false);
    },

    pickTrade(key) {
      this.trade = this.trades.find(t => t.key === key) || null;
      this.render();
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
        profession: this.trade.key, legal_form: 'szco',
        source: 'inzerat', status: 'contacted',
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
      this.setup = false;
      this.segIndex = 0;
      this.render();
    },

    /** Existujúci kandidát — pokračovanie v hovore alebo druhý telefonát. */
    async continueCall(candidateId) {
      const cand = Cand.items.find(c => c.id === candidateId);
      if (!cand) return;
      if (!Trades.loaded) await Trades.load();
      this.trades = Trades.trades.filter(t => t.active !== false);
      await this.loadChips();

      const { data } = await DB.list('candidate_chips', { filters: { candidate_id: candidateId }, limit: 300 });
      this.ticked = new Map();
      for (const t of data || []) {
        const chip = this.chips.find(c => c.id === t.chip_id);
        this.ticked.set(t.chip_id, chip || { id: t.chip_id, label: t.label, polarity: t.polarity, weight: t.weight });
      }

      this.mode = 'call';
      this.cand = cand;
      this.trade = this.trades.find(t => t.key === cand.profession) || null;
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
      if (this.mode === 'process') return this.renderProcess(el);

      if (this.setup) {
        el.innerHTML = this.shell({
          title: 'Zdvihol som telefón', sub: 'nový kandidát z inzerátu',
          progress: 0, body: this.setupHtml(),
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
      });
    },

    shell({ title, sub, count = '', progress = 0, body }) {
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
        <div class="guide-body">${body}</div>`;
    },

    // ── Výber remesla ─────────────────────────────────────────────────────
    setupHtml() {
      return `
        <div class="guide-q">Koho hľadá?</div>
        <div class="trade-grid">
          ${this.trades.map(t => `
            <button class="trade-tile${this.trade?.key === t.key ? ' on' : ''}"
              onclick="Guide.pickTrade('${t.key}')">
              <span class="tt-name">${UI.esc(t.name_sk)}</span>
              <span class="tt-rate">${t.rate_worker_min}–${t.rate_worker_max} €/h</span>
            </button>`).join('')}
        </div>
        ${this.trade ? `<div class="guide-hint guide-hint-ok" style="margin-top:14px;">
          ${(this.trade.pitch || []).length
            ? `<b>Čo mu povedať o práci:</b><br>${this.trade.pitch.map(x => '· ' + UI.esc(x)).join('<br>')}`
            : UI.esc(this.trade.summary || '')}</div>` : ''}

        <input id="call-name" class="guide-note" style="margin-top:14px;" placeholder="Ako sa volá?"
          onkeydown="if(event.key==='Enter'){event.preventDefault();Guide.beginCall()}">
        <input id="call-phone" class="guide-note" style="margin-top:10px;" placeholder="Telefón (nepovinné)">
        <label class="chk chk-lg" style="margin-top:12px;display:flex;gap:10px;align-items:center;">
          <input type="checkbox" id="call-crew"> <span style="font-size:15px;">Je to partia, nie jednotlivec</span>
        </label>

        <button class="guide-btn guide-btn-yes" id="call-go" style="margin-top:18px;"
          onclick="Guide.beginCall()">${Icon('phone', 20)} Začať hovor</button>`;
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

    // ── Kroky K1–K6 pri založenom kandidátovi ─────────────────────────────
    async start(candidateId, stepKey) {
      const cand = Cand.items.find(c => c.id === candidateId);
      if (!cand) return;
      if (CandProc.candidateId !== candidateId) await CandProc.load(candidateId);

      const step = stepKey === 'flags' ? P.FLAGS : P.STEPS.find(s => s.key === stepKey);
      if (!step) return;

      this.mode = 'process';
      this.cand = cand;
      this.stepKey = stepKey;
      this.items = stepKey === 'flags'
        ? P.FLAGS.items.map((text, index) => ({ index, text }))
        : P.applicableItems(step, cand.type || 'individual');
      this.title = step.title;
      this.hint = step.hint;

      this.answers = new Map();
      for (const it of this.items) {
        const c = CandProc.checkOf(stepKey, it.index);
        if (c) this.answers.set(it.index, { value: !!c.checked });
      }
      const first = this.items.findIndex(it => !this.answers.has(it.index));
      this.pos = first === -1 ? 0 : first;
      this.open();
    },

    renderProcess(el) {
      const done = this.pos >= this.items.length;
      el.innerHTML = this.shell({
        title: this.cand.full_name, sub: this.title,
        count: done ? '' : `${this.pos + 1}/${this.items.length}`,
        progress: Math.round((Math.min(this.pos, this.items.length) / this.items.length) * 100),
        body: done ? this.processSummary() : this.processHtml(this.items[this.pos]),
      });
      if (!done) setTimeout(() => document.getElementById('guide-note')?.focus({ preventScroll: true }), 30);
    },

    processHtml(it) {
      const a = this.answers.get(it.index);
      const isFlags = this.stepKey === 'flags';
      return `
        <div class="guide-q">${UI.esc(it.text)}</div>
        ${isFlags ? `<div class="guide-hint guide-hint-warn">
          ${Icon('alert', 14)} Zaškrtni, len ak to naozaj nastalo.</div>` : ''}
        <div class="guide-actions">
          <button class="guide-btn ${isFlags ? 'guide-btn-red' : 'guide-btn-yes'}${a?.value === true ? ' on' : ''}"
            onclick="Guide.answerProcess(true)">
            ${Icon('check', 22)} ${isFlags ? 'Áno, nastalo' : 'Áno, hotové'}</button>
          <button class="guide-btn guide-btn-no${a?.value === false ? ' on' : ''}"
            onclick="Guide.answerProcess(false)">${isFlags ? 'Nie' : 'Zatiaľ nie'}</button>
        </div>
        <input id="guide-note" class="guide-note" placeholder="Čo povedal? (nepovinné)"
          onkeydown="if(event.key==='Enter'){event.preventDefault();Guide.nextProcess()}">
        <div class="guide-nav">
          <button class="guide-nav-btn" onclick="Guide.prevProcess()" ${this.pos === 0 ? 'disabled' : ''}>
            ${Icon('chevron', 16)} Späť</button>
          <span class="guide-nav-mid">${this.answers.size} z ${this.items.length}</span>
          <button class="guide-nav-btn guide-nav-next" onclick="Guide.nextProcess()">
            ${this.pos === this.items.length - 1 ? 'Ukončiť' : 'Preskočiť'} ${Icon('chevron', 16)}</button>
        </div>`;
    },

    async answerProcess(value) {
      const it = this.items[this.pos];
      const text = document.getElementById('guide-note')?.value.trim() || '';
      this.answers.set(it.index, { value });
      await CandProc.toggle(this.stepKey, it.index, value);
      if (text) {
        await DB.insert('candidate_notes', {
          candidate_id: this.cand.id, step_key: this.stepKey,
          body: `${it.text} — ${text}`,
          created_by: Danubra.user?.id || null, author_name: CandProc.authorName(),
        });
      }
      this.pos = Math.min(this.pos + 1, this.items.length);
      this.render();
    },

    async nextProcess() {
      const it = this.items[this.pos];
      const text = document.getElementById('guide-note')?.value.trim();
      if (it && text) {
        await DB.insert('candidate_notes', {
          candidate_id: this.cand.id, step_key: this.stepKey,
          body: `${it.text} — ${text}`,
          created_by: Danubra.user?.id || null, author_name: CandProc.authorName(),
        });
      }
      this.pos = Math.min(this.pos + 1, this.items.length);
      this.render();
    },

    prevProcess() { this.pos = Math.max(0, this.pos - 1); this.render(); },
    goTo(i) { this.pos = i; this.render(); },

    processSummary() {
      const missing = this.items.filter(it => this.answers.get(it.index)?.value !== true);
      const nextStep = P.STEPS[P.STEPS.findIndex(s => s.key === this.stepKey) + 1];
      return `
        <div class="guide-done">
          <div class="guide-done-ico ${missing.length ? 'warn' : 'ok'}">
            ${Icon(missing.length ? 'alert' : 'check', 30)}</div>
          <div class="guide-q" style="margin-bottom:6px;">
            ${missing.length ? `Zostáva ${missing.length} ${missing.length === 1 ? 'položka' : 'položiek'}` : 'Krok je hotový'}</div>
          ${missing.length ? `<div class="guide-missing">
            ${missing.map(m => `<button onclick="Guide.goTo(${this.items.indexOf(m)})">
              ${Icon('chevron', 13)} ${UI.esc(m.text)}</button>`).join('')}
          </div>` : ''}
          <div class="guide-end-actions">
            <button class="guide-btn guide-btn-no" onclick="Guide.close()">Zavrieť</button>
            ${nextStep && this.stepKey !== 'flags'
              ? `<button class="guide-btn guide-btn-yes" onclick="Guide.start('${this.cand.id}','${nextStep.key}')">
                  Ďalší krok: ${UI.esc(nextStep.title)} ${Icon('chevron', 18)}</button>` : ''}
          </div>
        </div>`;
    },

    // ── Klávesnica ────────────────────────────────────────────────────────
    onKey(e) {
      if (e.key === 'Escape') return this.close();
      if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (this.mode === 'process') {
        if (e.key === 'ArrowRight') { e.preventDefault(); return this.nextProcess(); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); return this.prevProcess(); }
        if (e.key === 'a' || e.key === 'A') { e.preventDefault(); return this.answerProcess(true); }
        if (e.key === 'n' || e.key === 'N') { e.preventDefault(); return this.answerProcess(false); }
        return;
      }
      if (e.key === 'ArrowRight') { e.preventDefault(); return this.nextSegment(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); return this.prevSegment(); }
    },
  };

  window.Guide = Guide;
})();
