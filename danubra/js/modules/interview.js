// ============================================================================
// DANUBRA — sprievodca pohovorom: jedna otázka na obrazovke
// ============================================================================
// Toto sa používa s telefónom pri uchu. Preto celá obrazovka, jedna otázka
// veľkým písmom a tlačidlá, ktoré sa dajú trafiť palcom bez pozerania.
//
// Dva režimy v tom istom plášti:
//   process   — kroky K1–K6 (áno / zatiaľ nie)
//   screening — odborné a overovacie otázky (hodnotenie 0–3 s nápovedou)
//
// Odpoveď sa ukladá hneď po klepnutí. Keď hovor spadne, nič sa nestratí.
// ============================================================================
(function () {
  const P = window.DanubraProcess;

  const Guide = {
    mode: null,          // 'process' | 'screening'
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
      return this.items.filter(it => this.answers.has(this.mode === 'screening' ? it.id : it.index)).length;
    },

    render() {
      const el = document.getElementById('guide');
      if (!el) return;
      const done = this.pos >= this.items.length;
      el.innerHTML = `
        <div class="guide-head">
          <button class="guide-x" onclick="Guide.close()" aria-label="Zavrieť">${Icon('x', 20)}</button>
          <div class="guide-who">
            <strong>${UI.esc(this.cand.full_name)}</strong>
            <span>${UI.esc(this.title)}</span>
          </div>
          <div class="guide-count">${done ? '' : `${this.pos + 1}/${this.items.length}`}</div>
        </div>
        <div class="guide-bar"><span style="width:${Math.round((Math.min(this.pos, this.items.length) / this.items.length) * 100)}%"></span></div>
        <div class="guide-body">${done ? this.summaryHtml() : this.questionHtml()}</div>`;
      if (!done) setTimeout(() => document.getElementById('guide-note')?.focus({ preventScroll: true }), 30);
    },

    questionHtml() {
      const it = this.items[this.pos];
      return this.mode === 'screening' ? this.screeningHtml(it) : this.processHtml(it);
    },

    // ── Režim: kroky procesu ──────────────────────────────────────────────
    processHtml(it) {
      const a = this.answers.get(it.index);
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
      const q = this.items[this.pos];
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
      if (this.mode === 'screening' && ['0', '1', '2', '3'].includes(e.key)) {
        e.preventDefault(); return this.answer(Number(e.key));
      }
      if (this.mode === 'process' && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault(); return this.answer(true);
      }
      if (this.mode === 'process' && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault(); return this.answer(false);
      }
    },

    // ── Záver ─────────────────────────────────────────────────────────────
    summaryHtml() {
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
