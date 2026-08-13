// ============================================================================
// DANUBRA — sprievodca pohovorom: jedna otázka na obrazovke
// ============================================================================
// Toto sa používa s telefónom pri uchu. Preto celá obrazovka, jedna otázka
// veľkým písmom a tlačidlá, ktoré sa dajú trafiť palcom bez pozerania.
//
// Tri režimy v tom istom plášti:
//   call      — živý nábor: človek zavolal na inzerát a rovno ho naberáme
//   process   — kroky K1–K6 (áno / zatiaľ nie)
//   screening — odborné a overovacie otázky (hodnotenie 0–3 s nápovedou)
//
// Odpoveď sa ukladá hneď po klepnutí. Keď hovor spadne, nič sa nestratí.
// ============================================================================
(function () {
  const P = window.DanubraProcess;
  const CS = window.DanubraCallScript;

  const Guide = {
    mode: null,          // 'call' | 'process' | 'screening'
    trades: [], trade: null, script: null, setup: false,
    cand: null,
    stepKey: null,
    items: [],           // { index, text } alebo otázka skríningu
    pos: 0,
    answers: new Map(),  // index/id → { value, flagged }
    notes: [],           // poznámky nazbierané počas behu

    // ── Spustenie ─────────────────────────────────────────────────────────
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
      // začni na prvej nezodpovedanej, nech sa nepreklikáva to, čo už je
      const first = this.items.findIndex(it => !this.answers.has(it.index));
      this.pos = first === -1 ? 0 : first;
      this.notes = [];
      this.open();
    },

    async startScreening(candidateId) {
      const cand = Cand.items.find(c => c.id === candidateId);
      if (!cand) return;
      await Cand.loadPlaybook();
      const qs = Cand.questionsFor(cand.profession);
      if (!qs.length) return UI.toast('Pre toto remeslo nie sú otázky', 'err');

      const { data } = await DB.list('screening_answers', { filters: { candidate_id: candidateId }, limit: 500 });
      Cand.answers = data || [];

      this.mode = 'screening';
      this.cand = cand;
      this.stepKey = null;
      this.items = qs;
      this.title = 'Odborný skríning';
      this.hint = 'Hodnoť, ako odpovedal. Nápovedu vidíš len ty.';

      this.answers = new Map();
      for (const a of Cand.answers) {
        if (a.rating != null || a.flagged) {
          this.answers.set(a.question_id, { value: a.rating, flagged: !!a.flagged, text: a.answer_text || '' });
        }
      }
      const first = this.items.findIndex(q => !this.answers.has(q.id));
      this.pos = first === -1 ? 0 : first;
      this.notes = [];
      this.open();
    },

    // ── Živý nábor ────────────────────────────────────────────────────────
    // Zvoní telefón. Dve klepnutia a si v hovore: remeslo a meno.
    async startCall() {
      await Cand.loadPlaybook();
      if (!Trades.loaded) await Trades.load();
      this.trades = Trades.trades.filter(t => t.active !== false);
      this.mode = 'call';
      this.cand = null;
      this.trade = null;
      this.setup = true;
      this.answers = new Map();
      this.notes = [];
      this.pos = 0;
      this.title = 'Nový hovor';
      this.open();
    },

    pickTrade(key) {
      this.trade = this.trades.find(t => t.key === key) || null;
      this.render();
    },

    /** Založí kandidáta a hneď prejde do scenára — bez medzikrokov. */
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
      await CandProc.load(cand.id);

      this.script = CS.buildCallScript({
        tradeKey: this.trade.key,
        questions: Cand.questions,
        processItems: P.applicableItems(P.STEPS[0], cand.type),
      });
      this.items = this.script;
      this.setup = false;
      this.pos = 0;
      this.answers = new Map();
      this.render();
    },

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
            ? `<b>Čo mu povedať o práci:</b><br>${(this.trade.pitch || []).map(x => '· ' + UI.esc(x)).join('<br>')}`
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

    /** Čo mu povedať o práci — vysunie sa kedykoľvek počas hovoru. */
    togglePitch() {
      this._pitch = !this._pitch;
      this.render();
    },

    pitchHtml() {
      const lines = this.trade?.pitch || [];
      if (!lines.length) return '';
      return `
        <button class="guide-pitch-btn" onclick="Guide.togglePitch()">
          ${Icon('note', 15)} ${this._pitch ? 'Skryť' : 'Čo mu povedať o práci'}
        </button>
        ${this._pitch ? `<div class="guide-hint guide-hint-ok">
          ${lines.map(x => '· ' + UI.esc(x)).join('<br>')}</div>` : ''}`;
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
      // obnov podklad, nech detail ukazuje, čo sa práve odklikalo
      Cand.load().then(() => {
        if (this.cand) CandProc.load(this.cand.id).then(() => {
          CandProc.rerender();
          Danubra.renderRoute();
        });
      });
    },

    answered() {
      return this.items.filter(it => this.answers.has(this.keyOf(it))).length;
    },

    /** Kľúč odpovede: otázky podľa id, položky kroku podľa poradia. */
    keyOf(it) {
      if (this.mode === 'screening') return it.id;
      if (this.mode === 'call') return it.type === 'process' ? `p${it.index}` : it.question.id;
      return it.index;
    },

    render() {
      const el = document.getElementById('guide');
      if (!el) return;

      if (this.setup) {
        el.innerHTML = `
          <div class="guide-head">
            <button class="guide-x" onclick="Guide.close()" aria-label="Zavrieť">${Icon('x', 20)}</button>
            <div class="guide-who"><strong>Zdvihol som telefón</strong>
              <span>nový kandidát z inzerátu</span></div>
          </div>
          <div class="guide-bar"><span style="width:0%"></span></div>
          <div class="guide-body">${this.setupHtml()}</div>`;
        setTimeout(() => document.getElementById('call-name')?.focus({ preventScroll: true }), 30);
        return;
      }

      const done = this.pos >= this.items.length;
      const cur = done ? null : this.items[this.pos];
      const seg = cur && cur.segment ? CS.segmentTitle(cur.segment) : this.title;
      el.innerHTML = `
        <div class="guide-head">
          <button class="guide-x" onclick="Guide.close()" aria-label="Zavrieť">${Icon('x', 20)}</button>
          <div class="guide-who">
            <strong>${UI.esc(this.cand.full_name)}</strong>
            <span>${UI.esc(seg)}</span>
          </div>
          <div class="guide-count">${done ? '' : `${this.pos + 1}/${this.items.length}`}</div>
        </div>
        <div class="guide-bar"><span style="width:${Math.round((Math.min(this.pos, this.items.length) / this.items.length) * 100)}%"></span></div>
        <div class="guide-body">${done ? this.summaryHtml() : this.questionHtml()}</div>`;
      if (!done) setTimeout(() => document.getElementById('guide-note')?.focus({ preventScroll: true }), 30);
    },

    questionHtml() {
      const it = this.items[this.pos];
      if (this.mode === 'call') {
        const seg = CS.SEGMENTS.find(x => x.key === it.segment);
        const lead = seg ? `<div class="guide-lead">${UI.esc(seg.lead)}</div>` : '';
        const body = it.type === 'process'
          ? this.processHtml({ index: it.index, text: it.text })
          : this.screeningHtml(it.question);
        return lead + body + (it.segment === 'trade' ? '' : '');
      }
      return this.mode === 'screening' ? this.screeningHtml(it) : this.processHtml(it);
    },

    // ── Režim: kroky procesu ──────────────────────────────────────────────
    processHtml(it) {
      const a = this.answers.get(this.mode === 'call' ? `p${it.index}` : it.index);
      const isFlags = this.stepKey === 'flags';
      return `
        <div class="guide-q">${UI.esc(it.text)}</div>
        ${isFlags ? `<div class="guide-hint guide-hint-warn">
          ${Icon('alert', 14)} Zaškrtni, len ak to naozaj nastalo. Dve a viac vlajok znamenajú zastaviť sa.</div>` : ''}

        <div class="guide-actions">
          <button class="guide-btn ${isFlags ? 'guide-btn-red' : 'guide-btn-yes'}${a?.value === true ? ' on' : ''}"
            onclick="Guide.answer(true)">
            ${Icon('check', 22)} ${isFlags ? 'Áno, nastalo' : 'Áno, hotové'}
          </button>
          <button class="guide-btn guide-btn-no${a?.value === false ? ' on' : ''}"
            onclick="Guide.answer(false)">
            ${isFlags ? 'Nie' : 'Zatiaľ nie'}
          </button>
        </div>

        <input id="guide-note" class="guide-note" placeholder="Čo povedal? (nepovinné)"
          onkeydown="if(event.key==='Enter'){event.preventDefault();Guide.next()}">

        ${this.navHtml()}`;
    },

    // ── Režim: odborný skríning ───────────────────────────────────────────
    screeningHtml(q) {
      const a = this.answers.get(q.id) || {};
      const KIND = { knowledge: ['odborná', 'blue'], hidden: ['overovacia', 'brand'],
        legal: ['právna', 'red'], logistics: ['logistika', 'gray'], motivation: ['motivácia', 'amber'] };
      const k = KIND[q.kind] || KIND.knowledge;
      return `
        <div class="guide-tags">${UI.badge(k[0], k[1])}${q.weight >= 3 ? UI.badge('kľúčová', 'red') : ''}</div>
        <div class="guide-q">${UI.esc(q.question_sk)}</div>

        ${q.good_answer ? `<div class="guide-hint guide-hint-ok">
          <b>Chcem počuť:</b> ${UI.esc(q.good_answer)}</div>` : ''}
        ${q.red_flag_answer ? `<div class="guide-hint guide-hint-warn">
          <b>Pozor na:</b> ${UI.esc(q.red_flag_answer)}</div>` : ''}

        <div class="guide-rate">
          ${[[0, 'Nevie'], [1, 'Slabé'], [2, 'Dobré'], [3, 'Presné']].map(([v, label]) => `
            <button class="guide-rb rb-${v}${a.value === v ? ' on' : ''}" onclick="Guide.answer(${v})">
              <span class="rb-num">${v}</span><span class="rb-lbl">${label}</span>
            </button>`).join('')}
        </div>

        <input id="guide-note" class="guide-note" value="${UI.esc(a.text || '')}"
          placeholder="Čo odpovedal? (nepovinné)"
          onkeydown="if(event.key==='Enter'){event.preventDefault();Guide.next()}">

        <button class="guide-flag${a.flagged ? ' on' : ''}" onclick="Guide.toggleFlag()">
          ${Icon('alert', 16)} ${a.flagged ? 'Označené ako varovná odpoveď' : 'Označiť ako varovnú odpoveď'}
        </button>

        ${this.navHtml()}`;
    },

    navHtml() {
      return `
        ${this.mode === 'call' ? this.pitchHtml() : ''}
        <div class="guide-nav">
          <button class="guide-nav-btn" onclick="Guide.prev()" ${this.pos === 0 ? 'disabled' : ''}>
            ${Icon('chevron', 16)} Späť</button>
          <span class="guide-nav-mid">${this.answered()} z ${this.items.length} zodpovedaných</span>
          <button class="guide-nav-btn" onclick="Guide.next()">
            ${this.pos === this.items.length - 1 ? 'Ukončiť' : 'Preskočiť'} ${Icon('chevron', 16)}</button>
        </div>`;
    },

    // ── Odpovede ──────────────────────────────────────────────────────────
    async answer(value) {
      const it = this.items[this.pos];
      const text = document.getElementById('guide-note')?.value.trim() || '';

      if (this.mode === 'call') {
        if (it.type === 'process') {
          this.answers.set(`p${it.index}`, { value });
          await CandProc.toggle('k1', it.index, value);
          if (text) await this.saveNote('k1', `${it.text} — ${text}`);
        } else {
          const prev = this.answers.get(it.question.id) || {};
          this.answers.set(it.question.id, { value, flagged: !!prev.flagged, text });
          await this.saveScreening(it.question, value, !!prev.flagged, text);
        }
        return this.next(true);
      }

      if (this.mode === 'process') {
        this.answers.set(it.index, { value });
        await CandProc.toggle(this.stepKey, it.index, value);
        if (text) await this.saveNote(this.stepKey, `${it.text} — ${text}`);
      } else {
        const prev = this.answers.get(it.id) || {};
        this.answers.set(it.id, { value, flagged: !!prev.flagged, text });
        await this.saveScreening(it, value, !!prev.flagged, text);
      }
      this.next(true);
    },

    async toggleFlag() {
      const cur = this.items[this.pos];
      const q = this.mode === 'call' ? cur.question : cur;
      const a = this.answers.get(q.id) || { value: null, text: '' };
      a.flagged = !a.flagged;
      a.text = document.getElementById('guide-note')?.value.trim() || a.text || '';
      this.answers.set(q.id, a);
      await this.saveScreening(q, a.value, a.flagged, a.text);
      this.render();
      if (a.flagged) UI.toast('Označené ako varovná odpoveď', 'err');
    },

    async saveScreening(q, rating, flagged, text) {
      const row = {
        candidate_id: this.cand.id, question_id: q.id,
        rating: rating == null ? null : rating,
        flagged: !!flagged, answer_text: text || null,
      };
      const { error } = await DB.from('screening_answers')
        .upsert(row, { onConflict: 'candidate_id,question_id' });
      if (error) UI.toast('Chyba pri ukladaní: ' + error.message, 'err');
    },

    async saveNote(stepKey, body) {
      const row = {
        candidate_id: this.cand.id, step_key: stepKey, body,
        created_by: Danubra.user?.id || null, author_name: CandProc.authorName(),
      };
      const { error } = await DB.insert('candidate_notes', row);
      if (!error) this.notes.push(body);
    },

    /** Uloží rozpísanú poznámku aj bez klepnutia na odpoveď. */
    async captureNote() {
      const text = document.getElementById('guide-note')?.value.trim();
      if (!text) return;
      const it = this.items[this.pos];
      if (!it) return;

      if (this.mode === 'call') {
        if (it.type === 'process') return this.saveNote('k1', `${it.text} — ${text}`);
        const a = this.answers.get(it.question.id) || {};
        this.answers.set(it.question.id, { ...a, text });
        return this.saveScreening(it.question, a.value ?? null, !!a.flagged, text);
      }
      if (this.mode === 'process') {
        await this.saveNote(this.stepKey, `${it.text} — ${text}`);
      } else {
        const a = this.answers.get(it.id) || {};
        this.answers.set(it.id, { ...a, text });
        await this.saveScreening(it, a.value ?? null, !!a.flagged, text);
      }
    },

    async next(skipCapture) {
      if (!skipCapture) await this.captureNote();
      this.pos = Math.min(this.pos + 1, this.items.length);
      this.render();
    },

    async prev() {
      await this.captureNote();
      this.pos = Math.max(0, this.pos - 1);
      this.render();
    },

    goTo(i) { this.pos = i; this.render(); },

    onKey(e) {
      if (e.key === 'Escape') return this.close();
      if (e.key === 'ArrowRight') { e.preventDefault(); return this.next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); return this.prev(); }
      if (this.pos >= this.items.length) return;
      const it = this.items[this.pos];
      const rating = this.mode === 'screening' || (this.mode === 'call' && it?.type === 'question');
      const yesNo = this.mode === 'process' || (this.mode === 'call' && it?.type === 'process');
      if (rating && ['0', '1', '2', '3'].includes(e.key)) {
        e.preventDefault(); return this.answer(Number(e.key));
      }
      if (yesNo && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); return this.answer(true); }
      if (yesNo && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); return this.answer(false); }
    },

    // ── Záver ─────────────────────────────────────────────────────────────
    summaryHtml() {
      if (this.mode === 'call') return this.callSummary();
      if (this.mode === 'screening') return this.screeningSummary();

      const missing = this.items.filter(it => this.answers.get(it.index)?.value !== true);
      const raised = this.stepKey === 'flags' ? this.items.filter(it => this.answers.get(it.index)?.value === true) : [];
      const nextStep = P.STEPS[P.STEPS.findIndex(s => s.key === this.stepKey) + 1];

      return `
        <div class="guide-done">
          <div class="guide-done-ico ${missing.length ? 'warn' : 'ok'}">
            ${Icon(missing.length ? 'alert' : 'check', 30)}</div>
          <div class="guide-q" style="margin-bottom:6px;">
            ${this.stepKey === 'flags'
              ? (raised.length ? `${raised.length} ${raised.length === 1 ? 'vlajka' : 'vlajky'}` : 'Žiadne vlajky')
              : missing.length ? `Zostáva ${missing.length} ${missing.length === 1 ? 'položka' : 'položiek'}` : 'Krok je hotový'}
          </div>
          ${missing.length && this.stepKey !== 'flags' ? `<div class="guide-missing">
            ${missing.map((m, i) => `<button onclick="Guide.goTo(${this.items.indexOf(m)})">
              ${Icon('chevron', 13)} ${UI.esc(m.text)}</button>`).join('')}
          </div>` : ''}
          ${raised.length ? `<div class="guide-missing">
            ${raised.map(m => `<div class="raised">${Icon('alert', 13)} ${UI.esc(m.text)}</div>`).join('')}
          </div>` : ''}
          ${this.notes.length ? `<div class="guide-hint guide-hint-ok" style="text-align:left;">
            Zapísaných ${this.notes.length} ${this.notes.length === 1 ? 'poznámka' : 'poznámok'}.</div>` : ''}

          <div class="guide-end-actions">
            <button class="guide-btn guide-btn-no" onclick="Guide.close()">Zavrieť</button>
            ${nextStep && this.stepKey !== 'flags'
              ? `<button class="guide-btn guide-btn-yes" onclick="Guide.start('${this.cand.id}','${nextStep.key}')">
                  Ďalší krok: ${UI.esc(nextStep.title)} ${Icon('chevron', 18)}</button>`
              : ''}
          </div>
        </div>`;
    },

    screeningSummary() {
      const answers = [...this.answers.entries()].map(([question_id, a]) =>
        ({ question_id, rating: a.value, flagged: a.flagged }));
      const res = DanubraScreening.scoreScreening(this.items, answers);
      const V = { strong: ['Sedí', 'ok'], ok: ['Použiteľný', 'ok'], weak: ['Slabý', 'warn'],
        reject: ['Nebrať', 'warn'], unknown: ['Nedokončené', 'warn'] };
      const v = V[res.verdict] || V.unknown;
      return `
        <div class="guide-done">
          <div class="guide-done-ico ${v[1]}">${Icon(v[1] === 'ok' ? 'check' : 'alert', 30)}</div>
          <div class="guide-score">${res.percent} %</div>
          <div class="guide-q" style="margin-bottom:6px;">${v[0]}</div>
          <div class="guide-hint" style="text-align:center;">${UI.esc(res.reason)}</div>
          ${res.redFlags.length ? `<div class="guide-missing">
            ${res.redFlags.map(f => `<div class="raised">${Icon('alert', 13)} ${UI.esc(f.question)}</div>`).join('')}
          </div>` : ''}
          <div class="guide-end-actions">
            <button class="guide-btn guide-btn-no" onclick="Guide.close()">Zavrieť</button>
            <button class="guide-btn guide-btn-yes" onclick="Guide.saveVerdict()">
              ${Icon('check', 18)} Uložiť výsledok</button>
          </div>
        </div>`;
    },

    /** Záver hovoru: skóre, varovania a jedno odporúčanie, čo ďalej. */
    callSummary() {
      const r = CS.callOutcome({
        script: this.script, answers: this.answers, scoreFn: DanubraScreening.scoreScreening,
      });
      const good = r.verdict === 'strong' || r.verdict === 'ok';
      return `
        <div class="guide-done">
          <div class="guide-done-ico ${good ? 'ok' : 'warn'}">
            ${Icon(good ? 'check' : 'alert', 30)}</div>
          <div class="guide-score">${r.percent} %</div>
          <div class="guide-q" style="margin-bottom:6px;">${UI.esc(r.nextAction.label)}</div>
          <div class="guide-hint" style="text-align:left;">${UI.esc(r.nextAction.hint)}</div>

          <div class="guide-hint" style="text-align:left;background:var(--field);color:var(--ink-sub);">
            Zodpovedaných ${r.answered} odborných otázok · úvod ${r.introDone} z ${r.introTotal}
            ${r.redFlags.length ? ` · <b style="color:var(--red);">${r.redFlags.length} varovaní</b>` : ''}
          </div>
          ${r.redFlags.length ? `<div class="guide-missing">
            ${r.redFlags.map(f => `<div class="raised">${Icon('alert', 13)} ${UI.esc(f.question)}</div>`).join('')}
          </div>` : ''}

          <div class="guide-end-actions">
            ${r.nextAction.key === 'reject'
              ? `<button class="guide-btn guide-btn-red" onclick="Guide.finishCall('reject')">
                  Zamietnuť a zapísať dôvod</button>`
              : `<button class="guide-btn guide-btn-yes" onclick="Guide.finishCall('advance')">
                  ${Icon('check', 18)} Ísť na overenie</button>`}
            <button class="guide-btn guide-btn-no" onclick="Guide.finishCall('continue')">
              Uložiť a pokračovať neskôr</button>
          </div>
        </div>`;
    },

    async finishCall(action) {
      const r = CS.callOutcome({
        script: this.script, answers: this.answers, scoreFn: DanubraScreening.scoreScreening,
      });
      await DB.update('candidates', this.cand.id, {
        screening_score: r.answered ? r.percent : null,
        screening_verdict: r.verdict,
        screening_done_at: new Date().toISOString(),
        status: action === 'reject' ? 'rejected' : 'interview',
      });
      if (action === 'reject') {
        const reason = prompt('Prečo ho nechceme? (zapíše sa, aby sa o pol roka vedelo)') || null;
        await DB.update('candidates', this.cand.id, { outcome: 'rejected', outcome_reason: reason });
        UI.toast('Zamietnutý a zapísaný', 'ok');
      } else if (action === 'advance') {
        CandProc.open = 'k3';
        UI.toast('Uložené — pokračuj krokom Overenie', 'ok');
      } else {
        UI.toast('Uložené', 'ok');
      }
      const id = this.cand.id;
      this.close();
      setTimeout(() => Cand.detail(id), 260);
    },

    async saveVerdict() {
      const answers = [...this.answers.entries()].map(([question_id, a]) =>
        ({ question_id, rating: a.value, flagged: a.flagged }));
      const res = DanubraScreening.scoreScreening(this.items, answers);
      await DB.update('candidates', this.cand.id, {
        screening_score: res.answered ? res.percent : null,
        screening_verdict: res.verdict,
        screening_done_at: new Date().toISOString(),
      });
      UI.toast(`Uložené — ${res.percent} %`, 'ok');
      this.close();
    },
  };

  window.Guide = Guide;
})();
