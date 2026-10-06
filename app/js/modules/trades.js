// ============================================================================
// DANUBRA — Príručka remesiel a skríningových otázok
// ============================================================================
// Čo mám o remesle vedieť, kým začnem naberať, a podľa čoho spoznám, že ho
// kandidát v skutočnosti nerobil. Otázky sa dajú upravovať a dopĺňať —
// po každom nábore sa ukáže, ktorá otázka niečo naozaj odhalila.
// ============================================================================
(function () {
  const KIND = {
    knowledge: ['Odborná', 'blue', 'Overuje znalosť remesla.'],
    hidden: ['Overovacia', 'brand', 'Znie ako bežná otázka, ale kandidát netuší, že sa ňou preveruje. Nedá sa na ňu pripraviť.'],
    legal: ['Právna', 'red', 'Bez správnej odpovede sa nedá nasadiť.'],
    logistics: ['Logistika', 'gray', 'Doprava, ubytovanie, termín.'],
    motivation: ['Motivácia', 'amber', 'Peniaze, ochota, dôvod odchodu.'],
  };
  const PHASE = { phone: 'Telefón', interview: 'Pohovor', onsite: 'Na stavbe' };

  const Trades = {
    trades: [], questions: [], chips: [], ads: [], basics: [],
    loaded: false, tab: 'trades', filterTrade: '',

    // Remeslo je obrazovka, nie okno. Dá sa naň odkázať cez
    // `#/trades/<kľúč>` — na niečo, z čoho sa má človek učiť, musí ísť
    // poslať odkaz.
    openKey: null,
    // Skúšanie: balíček otázok, kde v ňom som a či je odpoveď odhalená.
    quiz: null,

    async load() {
      const [t, q, c, a, b] = await Promise.all([
        DB.list('trades', { order: { column: 'sort_order', ascending: true }, limit: 100 }),
        DB.list('screening_questions', { order: { column: 'sort_order', ascending: true }, limit: 500 }),
        DB.list('call_chips', { limit: 800 }),
        // Otázka môže patriť ku konkrétnemu inzerátu — „v inzeráte bolo, že
        // nástup je do dvoch týždňov, stíhate to?".
        DB.list('ads', { select: 'id,title,active', limit: 200 }),
        // Čo platí na každej nemeckej stavbe bez ohľadu na remeslo
        // (migrácia 037). Ukazuje sa pri každom remesle.
        DB.list('trade_basics', { order: { column: 'sort_order', ascending: true }, limit: 50 }),
      ]);
      this.trades = t.data || []; this.questions = q.data || []; this.chips = c.data || [];
      this.ads = a.data || [];
      this.basics = (b && b.data) || [];
      this.loaded = true;
    },

    pending() { return this.chips.filter(c => c.active === false); },

    tradeName(key) { return this.trades.find(t => t.key === key)?.name_sk || (key ? key : 'Univerzálna'); },

    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      // Otvorené remeslo je celá obrazovka, nie okno v okne. Lekcia má
      // jedenásť sekcií — v modale by sa z toho stal zvitok, v ktorom sa
      // človek po treťom scrollnutí stratí.
      const fromUrl = (location.hash.match(/^#\/trades\/([a-z0-9_-]+)/i) || [])[1];
      if (fromUrl && fromUrl !== this.openKey) this.openKey = fromUrl;
      if (this.openKey) return this.lessonView(el, this.openKey);

      // Tlačidlo sa riadi tým, na ktorej záložke človek je — inak pridá niečo
      // iné, než na čo sa práve pozerá.
      Danubra.setActions(`
        <button class="btn btn-outline btn-sm" onclick="Trades.tForm()">${Icon('plus')} Remeslo</button>
        ${this.tab === 'questions'
          ? `<button class="btn btn-primary btn-sm" onclick="Trades.qForm()">${Icon('plus')} Otázka</button>`
          : `<button class="btn btn-primary btn-sm" onclick="Trades.chipForm()">${Icon('plus')} Pole</button>`}`);

      const pend = this.pending();
      el.innerHTML = Danubra.header(Danubra.labelOf('trades'),
        `${this.trades.length} remesiel · ${this.chips.filter(c => c.active !== false).length} polí`
        + (pend.length ? ` · ${pend.length} čaká na potvrdenie` : '')) +
        (pend.length ? `<div class="warnbox" style="margin-bottom:14px;">
          ${Icon('zap', 14)} Z poznámok vzniklo ${pend.length}
          ${pend.length === 1 ? 'nové pole' : 'nových polí'} — potvrď, čo chceš používať.</div>` : '') + `
        <div class="pillbar" style="margin-bottom:14px;width:max-content;flex-wrap:wrap;">
          <button class="pill${this.tab === 'trades' ? ' active' : ''}" onclick="Trades.setTab('trades')">Remeslá</button>
          <button class="pill${this.tab === 'chips' ? ' active' : ''}" onclick="Trades.setTab('chips')">Polia do hovoru</button>
          <button class="pill${this.tab === 'questions' ? ' active' : ''}" onclick="Trades.setTab('questions')">Otázky do hovoru</button>
        </div>
        ${this.tab === 'trades' ? this.tradesHtml()
          : this.tab === 'chips' ? this.chipsHtml() : this.questionsHtml()}`;
    },

    setTab(t) { this.tab = t; Danubra.renderRoute(); },
    setFilter(v) { this.filterTrade = v; Danubra.renderRoute(); },

    /** Pásmo marže z rozdielu sadzieb; ak sadzby chýbajú, radšej nič než NaN. */
    marginSpan(t) {
      const lo = Number(t.rate_client_min) - Number(t.rate_worker_max);
      const hi = Number(t.rate_client_max) - Number(t.rate_worker_min);
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return '';
      const f = (v) => Money.format(Money.toCents(v)).replace(/\s*€\s*$/, '');
      return `<span style="font-size:12.5px;color:${lo > 0 ? 'var(--green)' : 'var(--red)'};font-weight:700;white-space:nowrap;">
        marža ${f(lo)}–${f(hi)} €/h</span>`;
    },


    // ── Remeslo ako lekcia ────────────────────────────────────────────────
    // Nábor nerobí stavbár. Robí ho človek pri telefóne, ktorý na nemeckej
    // stavbe nikdy nebol — a za pol hodiny má rozoznať sadrokartonára od
    // toho, kto „to už raz robil". Preto je remeslo obrazovka na čítanie
    // a na skúšanie, nie tabuľka polí.

    open(key) {
      this.openKey = key;
      this.quiz = null;
      try { history.replaceState(null, '', `#/trades/${key}`); } catch {}
      Danubra.renderRoute();
    },

    closeLesson() {
      this.openKey = null;
      this.quiz = null;
      try { history.replaceState(null, '', '#/trades'); } catch {}
      Danubra.renderRoute();
    },

    /**
     * Rozpätie sadzby. Sadzba je peniaze, takže sa formátuje ako peniaze —
     * „15.9 €/h" s bodkou je prvá vec, ktorú si človek všimne a poslednou,
     * ktorej uverí.
     */
    rateSpan(t, kind = 'worker') {
      const lo = t[`rate_${kind}_min`], hi = t[`rate_${kind}_max`];
      if (lo == null && hi == null) return '—';
      // `Money.format` dáva pevnú medzeru pred € (U+00A0), takže `replace`
      // s obyčajnou medzerou ju nenájde a zostane „16,00 € €/h".
      const f = (v) => Money.format(Money.toCents(v)).replace(/\s*€\s*$/, '');
      return `${f(lo)}–${f(hi)} €/h`;
    },

    /** Koľko z príručky je hotové — a čo konkrétne chýba. */
    stateOf(t) { return DanubraTrade.completeness(t, this.questions); },

    lessonView(el, key) {
      const t = this.trades.find(x => x.key === key);
      if (!t) { this.openKey = null; return UI.toast('Remeslo sa nenašlo', 'err'); }
      const c = this.stateOf(t);
      const qs = DanubraTrade.deck(this.questions, { tradeKey: key });

      Danubra.setActions(`
        <button class="btn btn-ghost btn-sm" onclick="Trades.closeLesson()">${Icon('back', 15)} Späť</button>
        <button class="btn btn-outline btn-sm" onclick="Trades.tForm('${key}')">${Icon('edit', 14)} Upraviť</button>
        ${qs.length >= DanubraTrade.QUESTIONS_MIN
          ? `<button class="btn btn-primary btn-sm" onclick="Trades.startQuiz('${key}')">
               ${Icon('zap', 14)} Vyskúšaj ma</button>` : ''}`);

      const sec = (x) => {
        if (x.kind === 'text') {
          return `<div class="card card-pad lesson-card">
            <div class="card-title">${UI.esc(x.title)}</div>
            <p class="lesson-text">${UI.esc(x.value)}</p></div>`;
        }
        if (x.kind === 'vocab') {
          return `<div class="card card-pad lesson-card">
            <div class="card-title">${UI.esc(x.title)}</div>
            <div class="vocab-grid">${x.value.map(v => `
              <div class="vocab">
                <b>${UI.esc(v.de)}</b>
                <span>${UI.esc(v.sk)}</span>
                ${v.note ? `<em>${UI.esc(v.note)}</em>` : ''}
              </div>`).join('')}</div></div>`;
        }
        return `<div class="card card-pad lesson-card">
          <div class="card-title">${UI.esc(x.title)}</div>
          <ul class="lesson-list">${(x.value || [])
            .map(v => `<li>${UI.esc(v)}</li>`).join('')}</ul></div>`;
      };

      el.innerHTML = Danubra.header(t.name_sk,
        [t.name_de, t.lohngruppe, t.regulated ? 'regulované remeslo' : null]
          .filter(Boolean).map(UI.esc).join(' · '), '', [t.name_sk])
        + (t.regulated ? `<div class="warnbox" style="margin-bottom:12px;">
            ${Icon('alert', 14)} ${UI.esc(t.legal_note || 'Regulované remeslo podľa §9 HwO.')}</div>` : '')
        + this.stateBar(c)
        // Peniaze idú celé do jednej karty: najprv čísla, pod nimi veta
        // o tom, prečo sú také. Rozdeliť to znamená prečítať vysvetlenie
        // skôr, než človek vie, čo vysvetľuje.
        + `<div class="lesson">${DanubraTrade.lesson(t)
          .filter(x => x.key !== 'pay').map(sec).join('')}</div>`
        + this.payHtml(t)
        + this.basicsHtml()
        + this.quizHtml(t, qs);
    },

    /** Pruh, ktorý povie, či sa podľa príručky dá naberať — alebo čo chýba. */
    stateBar(c) {
      const tone = c.ready ? 'green' : (c.questions < DanubraTrade.QUESTIONS_MIN ? 'red' : 'amber');
      return `<div class="statebar statebar-${tone}">
        <div class="statebar-head">
          <b>${c.done} z ${c.total}</b>
          <span>${UI.esc(DanubraTrade.stateSentence(c))}</span>
        </div>
        <div class="statebar-track"><i style="width:${c.pct}%"></i></div>
        ${c.missing.length ? `<div class="statebar-missing">Chýba: ${
          c.missing.map(UI.esc).join(' · ')}</div>` : ''}
      </div>`;
    },

    /** Peniaze zvlášť — je to jediná sekcia, kde sú čísla aj veta k nim. */
    payHtml(t) {
      const m = this.marginSpan(t);
      return `<div class="card card-pad lesson-card">
        <div class="card-title">Peniaze${Help.btn('card.trades.pay', { size: 13 })}</div>
        <div class="kv" style="margin:0 0 8px;">
          <div><span>Pýta si</span><strong>${this.rateSpan(t)}</strong></div>
          <div><span>Fakturujeme</span><strong>${this.rateSpan(t, 'client')}</strong></div>
          <div><span>Mzdová skupina</span><strong>${UI.esc(t.lohngruppe || '—')}</strong></div>
        </div>
        ${m}
        ${t.pay_note ? `<p class="lesson-text" style="margin-top:10px;">${
          UI.esc(t.pay_note)}</p>` : ''}
      </div>`;
    },

    /** Čo platí na každej stavbe — rovnaké pri každom remesle, preto zvlášť. */
    basicsHtml() {
      if (!this.basics.length) return '';
      return `<div class="form-section">Čo platí na každej nemeckej stavbe</div>
        <div class="lesson">${this.basics.filter(b => b.active !== false).map(b => `
          <details class="card card-pad lesson-card basics">
            <summary>${UI.esc(b.title)}</summary>
            <p class="lesson-text">${UI.esc(b.body)}</p>
          </details>`).join('')}</div>`;
    },

    // ── Skúšanie ──────────────────────────────────────────────────────────
    // Otázka, človek si odpoveď premyslí, až potom odhalí, čo chce počuť
    // a pri čom zbystriť. Ukázať oboje naraz znamená, že si človek prečíta
    // odpoveď a bude si myslieť, že ju vedel.

    startQuiz(key) {
      const d = DanubraTrade.shuffle(DanubraTrade.deck(this.questions, { tradeKey: key }));
      this.quiz = { key, deck: d, i: 0, shown: false, hit: 0 };
      Danubra.renderRoute();
      const el = document.getElementById('quiz');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    revealQuiz() { if (this.quiz) { this.quiz.shown = true; Danubra.renderRoute(); } },

    /** `vedel` zapisuje len to, čo si človek sám povie — nie je to známka. */
    nextQuiz(vedel) {
      if (!this.quiz) return;
      if (vedel) this.quiz.hit += 1;
      this.quiz.i += 1;
      this.quiz.shown = false;
      Danubra.renderRoute();
    },

    stopQuiz() { this.quiz = null; Danubra.renderRoute(); },

    quizHtml(t, qs) {
      if (!this.quiz || this.quiz.key !== t.key) {
        return qs.length >= DanubraTrade.QUESTIONS_MIN
          ? `<div class="card card-pad quiz-cta" id="quiz">
              <div>
                <strong>Vyskúšaj sa z tohto remesla</strong>
                <span>${qs.length} otázok. Otázka sa ukáže, odpoveď si premyslíš
                  a až potom uvidíš, čo chceš počuť a pri čom zbystriť.</span>
              </div>
              <button class="btn btn-primary" onclick="Trades.startQuiz('${t.key}')">
                ${Icon('zap', 15)} Spustiť</button>
            </div>`
          : `<div class="card card-pad" id="quiz">
              <div class="card-title">Skúšanie${Help.btn('card.trades.quiz', { size: 13 })}</div>
              <p class="lesson-text">Na skúšanie treba aspoň
                ${DanubraTrade.QUESTIONS_MIN} otázok; teraz ich je ${qs.length}.
                Doplň ich a remeslo sa bude dať odskúšať.</p>
              <button class="btn btn-outline btn-sm" onclick="Trades.qForm(null,'${t.key}')">
                ${Icon('plus', 14)} Pridať otázku</button>
            </div>`;
      }

      const q = this.quiz;
      const p = DanubraTrade.progress(q.deck.length, q.i);
      if (q.i >= q.deck.length) {
        return `<div class="card card-pad quiz" id="quiz">
          <div class="card-title">Hotovo${Help.btn('card.trades.done', { size: 13 })}</div>
          <p class="lesson-text">Prešiel si ${q.deck.length} ${
            Shell.plural(q.deck.length, 'otázku', 'otázky', 'otázok')}
            a ${q.hit} z nich si vedel. Čo si nevedel, stojí za druhé kolo —
            práve to sú otázky, ktoré kandidátovi položíš najistejšie.</p>
          <div class="link-row">
            <button class="btn btn-primary btn-sm" onclick="Trades.startQuiz('${t.key}')">
              ${Icon('repeat', 14)} Ešte raz</button>
            <button class="btn btn-ghost btn-sm" onclick="Trades.stopQuiz()">Zavrieť</button>
          </div>
        </div>`;
      }

      const card = q.deck[q.i];
      return `<div class="card card-pad quiz" id="quiz">
        <div class="quiz-head">
          <span>Otázka ${p.index + 1} z ${p.total}</span>
          <div class="statebar-track"><i style="width:${p.pct}%"></i></div>
          <button class="btn btn-ghost btn-sm" onclick="Trades.stopQuiz()">Skončiť</button>
        </div>
        <p class="quiz-q">${UI.esc(card.question_sk)}</p>
        ${q.shown ? `
          <div class="quiz-a quiz-good">
            <b>${Icon('check', 14)} Čo chcem počuť</b>
            <span>${UI.esc(card.good_answer)}</span>
          </div>
          ${card.red_flag_answer ? `<div class="quiz-a quiz-bad">
            <b>${Icon('alert', 14)} Pri čom zbystriť</b>
            <span>${UI.esc(card.red_flag_answer)}</span>
          </div>` : ''}
          <div class="link-row" style="margin-top:10px;">
            <button class="btn btn-outline btn-sm" onclick="Trades.nextQuiz(true)">
              ${Icon('check', 14)} Vedel som</button>
            <button class="btn btn-outline btn-sm" onclick="Trades.nextQuiz(false)">
              Nevedel som</button>
          </div>`
        : `<button class="btn btn-primary" onclick="Trades.revealQuiz()">
             Premyslel som si to — ukáž odpoveď</button>`}
      </div>`;
    },

    tradesHtml() {
      if (!this.trades.length) {
        return UI.empty('wrench', 'Žiadne remeslá',
          'Spusti migráciu 009 — príručka sa naplní sama.',
          `<button class="btn btn-primary" onclick="Trades.tForm()">${Icon('plus')} Pridať remeslo</button>`);
      }
      // Karta, nie riadok. Z tejto obrazovky sa má človek učiť — a zoznam
      // tenkých riadkov sa nečíta, ten sa preletí očami.
      const card = (t) => {
        const c = this.stateOf(t);
        const tone = c.ready ? 'green' : (c.questions < DanubraTrade.QUESTIONS_MIN ? 'red' : 'amber');
        return `<div class="card card-pad trade-card" onclick="Trades.open('${t.key}')">
          <div class="card-head">
            <div class="card-title">${UI.esc(t.name_sk)}</div>
            ${t.regulated ? UI.badge('regulované', 'amber') : ''}
          </div>
          <div class="trade-de">${UI.esc(t.name_de || '')}</div>
          <p class="trade-sum">${UI.esc((t.summary || '').slice(0, 120))}${
            (t.summary || '').length > 120 ? '…' : ''}</p>
          <div class="meta-row">
            <span>${Icon('invoices', 13)} ${this.rateSpan(t)}</span>
            <span>${Icon('zap', 13)} ${c.questions} ${
              Shell.plural(c.questions, 'otázka', 'otázky', 'otázok')}</span>
          </div>
          <div class="statebar-track statebar-${tone}"><i style="width:${c.pct}%"></i></div>
          <div class="trade-state">${UI.esc(DanubraTrade.stateSentence(c))}</div>
        </div>`;
      };
      const nehotove = this.trades.filter(t => !this.stateOf(t).ready).length;
      return (nehotove ? `<div class="regimebox" style="margin:0 0 12px;">
          Z ${this.trades.length} remesiel ${nehotove === 1 ? 'má jedno' : `má ${nehotove}`}
          príručku, podľa ktorej sa zatiaľ nedá naberať ani skúšať. Na karte je
          vidieť, čo mu chýba.</div>` : '')
        + `<div class="cards">${this.trades.map(card).join('')}</div>`;
    },

    questionsHtml() {
      const rows = this.questions.filter(q => !this.filterTrade
        || (this.filterTrade === '_univ' ? !q.trade_key : q.trade_key === this.filterTrade));
      return `
        <div class="filterbar">
          <select onchange="Trades.setFilter(this.value)">
            <option value="">Všetky otázky</option>
            <option value="_univ" ${this.filterTrade === '_univ' ? 'selected' : ''}>Univerzálne</option>
            ${this.trades.map(t => `<option value="${t.key}" ${this.filterTrade === t.key ? 'selected' : ''}>${UI.esc(t.name_sk)}</option>`).join('')}
          </select>
        </div>
        ${rows.map(q => this.qRow(q)).join('') || UI.empty('note', 'Žiadne otázky', 'Pridaj prvú otázku.')}`;
    },

    // ── Polia do hovoru ───────────────────────────────────────────────────
    chipsHtml() {
      // Názvy častí hovoru sú v knižnici (`chips.js`). Boli tu prepísané
      // natvrdo na troch miestach, takže premenovanie časti („Overenie" →
      // „Dôkazy") sa do appky nedostalo — tri obrazovky by tvrdili každá niečo iné.
      const SEG = Object.fromEntries(DanubraChips.SEGMENTS.map(s => [s.key, s.title]));
      const rows = this.chips.filter(c => !this.filterTrade
        || (this.filterTrade === '_univ' ? !c.trade_key : c.trade_key === this.filterTrade));
      const pend = rows.filter(c => c.active === false);
      const live = rows.filter(c => c.active !== false);

      const row = (c) => `<div class="list-row" onclick="Trades.chipForm('${c.id}')" style="align-items:center;">
        <span class="chip chip-${c.polarity} on static" style="margin-right:8px;">${UI.esc(c.label)}</span>
        <span style="flex:1;font-size:12px;color:var(--ink-mute);">
          ${SEG[c.segment] || c.segment} · ${UI.esc(this.tradeName(c.trade_key))}
          ${c.use_count ? ` · použité ${c.use_count}×` : ''}
          ${c.source === 'ai' ? ' · návrh z poznámok' : c.source === 'manual' ? ' · pridané pri hovore' : ''}
        </span>
        ${c.active === false ? `
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();Trades.acceptChip('${c.id}')">
            ${Icon('check')} Použiť</button>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();Trades.chipDel('${c.id}', true)">
            Zahodiť</button>` : ''}
      </div>`;

      return `
        <div class="filterbar">
          <select onchange="Trades.setFilter(this.value)">
            <option value="">Všetky polia</option>
            <option value="_univ" ${this.filterTrade === '_univ' ? 'selected' : ''}>Univerzálne</option>
            ${this.trades.map(t => `<option value="${t.key}" ${this.filterTrade === t.key ? 'selected' : ''}>${UI.esc(t.name_sk)}</option>`).join('')}
          </select>
        </div>
        ${pend.length ? `<div class="form-section">Čaká na potvrdenie — ${pend.length}</div>
          ${pend.map(row).join('')}` : ''}
        ${live.length ? `<div class="form-section">Používané — ${live.length}</div>
          ${live.map(row).join('')}`
          : UI.empty('note', 'Žiadne polia', 'Spusti migráciu 012 — polia sa naplnia samy.')}`;
    },

    async acceptChip(id) {
      const { error } = await DB.update('call_chips', id, { active: true });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const c = this.chips.find(x => x.id === id); if (c) c.active = true;
      UI.toast('Pole sa už používa', 'ok');
      Danubra.renderRoute();
    },

    chipForm(id) {
      const c = id ? this.chips.find(x => x.id === id) || {} : {};
      UI.modal(id ? 'Upraviť pole' : 'Nové pole', `
        <form id="chip-form" onsubmit="event.preventDefault();Trades.chipSave('${id || ''}')">
          ${c.suggested_from ? `<div class="regimebox">Návrh vznikol z poznámky:
            „${UI.esc(c.suggested_from)}"</div>` : ''}
          ${UI.field('label', 'Text poľa (2–6 slov)', { value: c.label, required: true,
            placeholder: 'napr. vie rozteč 625' })}
          <div class="form-grid">
            ${UI.field('segment', 'Kde v hovore', { value: c.segment || 'trade',
              options: DanubraChips.SEGMENTS.map(s => [s.key, s.title]) })}
            ${UI.field('trade_key', 'Pre remeslo', { value: c.trade_key || '', add: 'trade',
              options: [['', 'Univerzálne'], ...this.trades.map(t => [t.key, t.name_sk])] })}
            ${UI.field('polarity', 'Znamienko', { value: c.polarity || 'plus', options: [
              ['plus', 'Plus — dobré znamenie'], ['minus', 'Mínus — zlé znamenie'],
              ['flag', 'Varovanie'], ['neutral', 'Bez hodnotenia']] })}
            ${UI.field('weight', 'Váha (3 = rozhodujúce)', { type: 'number', value: c.weight || 1 })}
          </div>
          ${UI.field('hint', 'Nápoveda pre teba', { type: 'textarea', rows: 2, value: c.hint })}
          <div class="regimebox">Varovanie s váhou 3 zamieta kandidáta samo osebe — napríklad
          „tvrdí, že A1 netreba". Používaj ho striedmo.</div>
          <div class="modal-actions">
            ${id ? `<button type="button" class="btn btn-danger btn-sm" onclick="Trades.chipDel('${id}')">Zmazať</button>` : ''}
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Pridať'}</button>
          </div>
        </form>`, { wide: true });
    },

    async chipSave(id) {
      const d = UI.formData(document.getElementById('chip-form'));
      if (!d.label) return UI.toast('Text poľa je povinný', 'err');
      const payload = {
        label: d.label.trim(), segment: d.segment, polarity: d.polarity,
        trade_key: d.trade_key || null, weight: Number(d.weight) || 1,
        hint: d.hint || null, active: true,
      };
      if (!id) payload.source = 'manual';
      const res = id ? await DB.update('call_chips', id, payload)
                     : await DB.insert('call_chips', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast('Uložené', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    async chipDel(id, quiet) {
      if (!quiet && !await UI.confirm('Zmazať toto pole? Zápisy pri kandidátoch zostanú.')) return;
      await DB.remove('call_chips', id);
      this.chips = this.chips.filter(x => x.id !== id);
      UI.closeModal(); Danubra.renderRoute();
    },

    qRow(q) {
      const k = KIND[q.kind] || KIND.knowledge;
      return `<div class="list-row" onclick="Trades.qForm('${q.id}')" style="align-items:flex-start;">
        <span style="flex:1;font-size:13px;">
          <strong>${UI.esc(q.question_sk)}</strong>
          <span style="display:block;color:var(--ink-mute);font-size:12px;margin-top:2px;">
            ${UI.esc(this.tradeName(q.trade_key))} · ${PHASE[q.phase] || q.phase}${q.weight >= 3 ? ' · kľúčová' : ''}</span>
          ${q.good_answer ? `<span style="display:block;color:var(--green);font-size:12px;">✓ ${UI.esc(q.good_answer)}</span>` : ''}
          ${q.red_flag_answer ? `<span style="display:block;color:var(--red);font-size:12px;">! ${UI.esc(q.red_flag_answer)}</span>` : ''}
        </span>
        ${UI.badge(k[0], k[1])}
      </div>`;
    },

    detail(key) {
      const t = this.trades.find(x => x.key === key);
      if (!t) return;
      const qs = this.questions.filter(q => q.trade_key === key);
      const list = (label, arr) => (arr && arr.length)
        ? `<div class="form-section">${label}</div>
           <ul style="margin:0 0 0 18px;font-size:13px;color:var(--ink-sub);">
           ${arr.map(x => `<li>${UI.esc(x)}</li>`).join('')}</ul>` : '';

      UI.modal(t.name_sk, `
        ${t.regulated ? `<div class="warnbox">${Icon('alert', 14)} ${UI.esc(t.legal_note || '')}</div>` : ''}
        <div class="notebox">${UI.esc(t.summary || '')}</div>
        <div class="kv" style="margin-top:10px;">
          <div><span>Nemecky</span><strong>${UI.esc(t.name_de || '—')}</strong></div>
          <div><span>Mzdová skupina</span><strong>${UI.esc(t.lohngruppe || '—')}</strong></div>
          <div><span>Pýta si</span><strong>${this.rateSpan(t)}</strong></div>
          <div><span>Fakturujeme</span><strong>${this.rateSpan(t, 'client')}</strong></div>
        </div>
        ${list('Čo na stavbe robí', t.work_scope)}
        ${list('S čím pracuje', t.materials)}
        ${list('Vlastné náradie', t.tools)}
        ${list('Musí doložiť', t.certificates)}
        ${list('Podľa čoho spoznám, že to nerobil', t.red_flags)}
        ${t.daily_output ? `<div class="regimebox" style="margin-top:10px;">
          <b>Reálny denný výkon:</b> ${UI.esc(t.daily_output)}</div>` : ''}
        <div class="form-section">Odborné otázky (${qs.length})</div>
        ${qs.map(q => this.qRow(q)).join('') || '<div style="font-size:13px;color:var(--ink-mute);">Zatiaľ žiadne.</div>'}
        <div class="modal-actions">
          <button class="btn btn-outline btn-sm" onclick="Trades.qForm(null,'${t.key}')">${Icon('plus')} Pridať otázku</button>
          <button class="btn btn-primary btn-sm" onclick="Trades.tForm('${t.key}')">${Icon('edit')} Upraviť remeslo</button>
        </div>`, { wide: true });
    },

    // ── Formuláre ─────────────────────────────────────────────────────────
    tForm(key) {
      const t = key ? this.trades.find(x => x.key === key) || {} : {};
      const arr = a => (a || []).join('\n');
      UI.modal(key ? 'Upraviť remeslo' : 'Nové remeslo', `
        <form id="trade-form" onsubmit="event.preventDefault();Trades.tSave('${key || ''}')">
          <div class="form-grid">
            ${UI.field('key', 'Kľúč (bez diakritiky)', { value: t.key, required: true, placeholder: 'trockenbau' })}
            ${UI.field('name_sk', 'Názov', { value: t.name_sk, required: true })}
            ${UI.field('name_de', 'Nemecky', { value: t.name_de })}
            ${UI.field('lohngruppe', 'Mzdová skupina', { value: t.lohngruppe || 'LG2', options: [['LG1', 'LG1'], ['LG2', 'LG2']] })}
            ${UI.field('rate_worker_min', 'Pýta si od €/h', { type: 'number', value: t.rate_worker_min })}
            ${UI.field('rate_worker_max', 'Pýta si do €/h', { type: 'number', value: t.rate_worker_max })}
            ${UI.field('rate_client_min', 'Fakturujeme od €/h', { type: 'number', value: t.rate_client_min })}
            ${UI.field('rate_client_max', 'Fakturujeme do €/h', { type: 'number', value: t.rate_client_max })}
          </div>
          ${UI.field('summary', 'Čo mám o remesle vedieť', { type: 'textarea', rows: 3, value: t.summary })}
          <div class="chk-row">
            ${UI.field('regulated', '', { type: 'checkbox', value: t.regulated, placeholder: 'Regulované remeslo (§9 HwO)' })}
          </div>
          ${UI.field('legal_note', 'Právna poznámka', { type: 'textarea', rows: 2, value: t.legal_note })}
          <div class="form-section">Zoznamy — každá položka na nový riadok</div>
          ${UI.field('work_scope', 'Čo na stavbe robí', { type: 'textarea', rows: 4, value: arr(t.work_scope) })}
          ${UI.field('materials', 'S čím pracuje', { type: 'textarea', rows: 3, value: arr(t.materials) })}
          ${UI.field('tools', 'Vlastné náradie', { type: 'textarea', rows: 3, value: arr(t.tools) })}
          ${UI.field('certificates', 'Musí doložiť', { type: 'textarea', rows: 2, value: arr(t.certificates) })}
          ${UI.field('red_flags', 'Podľa čoho spoznám, že to nerobil', { type: 'textarea', rows: 3, value: arr(t.red_flags) })}
          ${UI.field('daily_output', 'Reálny denný výkon', { type: 'textarea', rows: 2, value: t.daily_output })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${key ? 'Uložiť' : 'Pridať'}</button>
          </div>
        </form>`, { wide: true });
    },

    async tSave(key) {
      const d = UI.formData(document.getElementById('trade-form'));
      if (!d.key || !d.name_sk) return UI.toast('Kľúč a názov sú povinné', 'err');
      const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
      const num = v => (v === '' || v == null ? null : Number(v));
      const payload = {
        key: d.key, name_sk: d.name_sk, name_de: d.name_de || null,
        lohngruppe: d.lohngruppe, regulated: !!d.regulated, legal_note: d.legal_note || null,
        summary: d.summary || null, daily_output: d.daily_output || null,
        rate_worker_min: num(d.rate_worker_min), rate_worker_max: num(d.rate_worker_max),
        rate_client_min: num(d.rate_client_min), rate_client_max: num(d.rate_client_max),
        work_scope: lines(d.work_scope), materials: lines(d.materials), tools: lines(d.tools),
        certificates: lines(d.certificates), red_flags: lines(d.red_flags),
      };
      const existing = this.trades.find(x => x.key === (key || d.key));
      const res = existing ? await DB.update('trades', existing.id, payload)
                           : await DB.insert('trades', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast('Uložené', 'ok');
      await this.load(); if (window.Hire) Hire.loaded = false;
      Danubra.renderRoute();
    },

    qForm(id, tradeKey) {
      const q = id ? this.questions.find(x => x.id === id) || {} : {};
      UI.modal(id ? 'Upraviť otázku' : 'Nová otázka', `
        <form id="q-form" onsubmit="event.preventDefault();Trades.qSave('${id || ''}')">
          <div class="form-grid">
            ${UI.field('trade_key', 'Pre remeslo', { value: q.trade_key || tradeKey || '', add: 'trade',
              options: [['', 'Univerzálna — pre všetkých'], ...this.trades.map(t => [t.key, t.name_sk])] })}
            ${UI.field('kind', 'Typ otázky', { value: q.kind || 'knowledge',
              options: Object.entries(KIND).map(([k, v]) => [k, v[0]]) })}
            ${UI.field('phase', 'Kedy sa pýtam', { value: q.phase || 'phone',
              options: Object.entries(PHASE).map(([k, v]) => [k, v]) })}
            ${UI.field('weight', 'Váha (3 = kľúčová)', { type: 'number', value: q.weight || 1 })}
            ${UI.field('sort_order', 'Poradie', { type: 'number', value: q.sort_order || 0 })}
            ${UI.field('segment', 'Kde v hovore', { value: q.segment || '',
              options: [['', 'podľa typu otázky'],
                ...DanubraChips.SEGMENTS.map(s => [s.key, s.title])] })}
            ${UI.field('ad_id', 'Len k inzerátu', { value: q.ad_id || '', add: 'ad',
              options: [['', '— nie, platí všeobecne —'],
                ...(this.ads || []).map(a => [a.id, a.title])] })}
          </div>
          ${UI.field('question_sk', 'Otázka', { type: 'textarea', rows: 2, value: q.question_sk, required: true })}
          ${UI.field('question_de', 'Nemecky (voliteľné)', { type: 'textarea', rows: 2, value: q.question_de })}
          ${UI.field('good_answer', 'Čo chcem počuť', { type: 'textarea', rows: 2, value: q.good_answer })}
          ${UI.field('red_flag_answer', 'Pri čom zbystriť', { type: 'textarea', rows: 2, value: q.red_flag_answer })}
          <div class="regimebox">Overovacia otázka má znieť ako bežná odborná — kandidát nesmie tušiť,
          že sa ňou preveruje. Najlepšie fungujú konkrétne čísla a názvy, ktoré si človek z praxe
          pamätá, ale z inzerátu sa ich nenaučí.</div>
          <div class="modal-actions">
            ${id ? `<button type="button" class="btn btn-danger btn-sm" onclick="Trades.qDel('${id}')">Zmazať</button>` : ''}
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Pridať'}</button>
          </div>
        </form>`, { wide: true });
    },

    async qSave(id) {
      const d = UI.formData(document.getElementById('q-form'));
      if (!d.question_sk) return UI.toast('Otázka je povinná', 'err');
      const payload = {
        trade_key: d.trade_key || null, kind: d.kind, phase: d.phase,
        question_sk: d.question_sk, question_de: d.question_de || null,
        good_answer: d.good_answer || null, red_flag_answer: d.red_flag_answer || null,
        weight: Number(d.weight) || 1, sort_order: Number(d.sort_order) || 0,
        segment: d.segment || null, ad_id: d.ad_id || null,
      };
      if (!id) payload.code = `own_${Date.now().toString(36)}`;
      const res = id ? await DB.update('screening_questions', id, payload)
                     : await DB.insert('screening_questions', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast('Uložené', 'ok');
      await this.load(); if (window.Hire) Hire.loaded = false;
      Danubra.renderRoute();
    },

    async qDel(id) {
      if (!await UI.confirm('Zmazať túto otázku? Odpovede kandidátov na ňu sa stratia.')) return;
      await DB.remove('screening_questions', id);
      this.questions = this.questions.filter(x => x.id !== id);
      UI.closeModal(); Danubra.renderRoute();
    },
  };

  window.Trades = Trades;
  Danubra.views.trades = function (el) { return Trades.view(el); };
})();
