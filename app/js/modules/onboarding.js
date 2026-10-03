// ============================================================================
// DANUBRA — Zaškolenie: posaď tam hocikoho a za hodinu volá
// ============================================================================
// Päť krokov, hodina, a na konci veta „môžeš volať". Nie preto, že si to
// prečítal, ale preto, že si to vyskúšal: posledný krok je cvičný hovor,
// v ktorom appka hovorí za kandidáta a človek rozhoduje, či mu to berie.
//
// Postup sa drží v prehliadači. Je to osobná vec jedného človeka na jednom
// počítači, nie firemný záznam — a keby sa ukladal do databázy, bola by to
// evidencia o ľuďoch, ktorú nikto nepýtal.
// ============================================================================
(function () {
  const O = () => window.DanubraOnboarding;
  const KEY = 'danubra_onboarding';

  const Learn = {
    trades: [], questions: [], basics: [], loaded: false,
    screen: null,          // null = cesta, inak kľúč kroku
    practice: null,        // prebiehajúci cvičný hovor

    saved() {
      try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }
      catch { return {}; }
    },
    save(patch) {
      const next = { ...this.saved(), ...patch };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    },
    reset() {
      try { localStorage.removeItem(KEY); } catch {}
      this.screen = null; this.practice = null;
      Danubra.renderRoute();
    },

    async load() {
      const [t, q, b] = await Promise.all([
        DB.list('trades', { order: { column: 'sort_order', ascending: true }, limit: 100 }),
        DB.list('screening_questions', { order: { column: 'sort_order', ascending: true }, limit: 500 }),
        DB.list('trade_basics', { order: { column: 'sort_order', ascending: true }, limit: 50 }),
      ]);
      this.trades = t.data || []; this.questions = q.data || [];
      this.basics = (b && b.data) || [];
      this.loaded = true;
    },

    tradeOf(key) { return this.trades.find(x => x.key === key) || null; },

    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const kroky = O().state(this.saved());
      Danubra.setActions(`
        <button class="btn btn-ghost btn-sm" onclick="Learn.close()">${Icon('back', 15)} Späť na nábor</button>
        <button class="btn btn-ghost btn-sm" onclick="Learn.reset()">Začať odznova</button>`);

      if (this.screen) return this.stepView(el, this.screen, kroky);

      const h = O().headline(kroky);
      const p = O().progress(kroky);
      const n = O().next(kroky);

      // Hlavička hovorí „Nábor", lebo zaškolenie je jeho časť — človek má
      // vedieť, kde v appke stojí, nie sa ocitnúť na obrazovke odnikiaľ.
      el.innerHTML = Danubra.header('Nábor', 'Zaškolenie · päť krokov, hodina, a vieš volať')
        + `
        <div class="flow-now${p.ready ? ' flow-ready' : ''}">
          <div class="flow-now-txt">
            <b>${UI.esc(h.title)}</b>
            <span>${UI.esc(h.sub)}</span>
          </div>
          ${n ? `<button class="flow-go" onclick="Learn.go('${n.key}')">
            ${Icon('chevron', 22)} ${p.done ? 'Pokračovať' : 'Začať'}</button>` : ''}
        </div>

        <div class="flow-bar"><i style="width:${p.pct}%"></i></div>
        <div class="flow-bar-txt">${p.done} z ${p.total} krokov${
          p.ready ? '' : ` · zostáva ${p.minutesLeft} minút`}</div>

        <div class="flow">${kroky.map(k => `
          <div class="flow-step flow-${k.done ? 'done' : 'idle'}${
            n && n.key === k.key ? ' is-now' : ''}">
            <span class="flow-n">${k.done ? Icon('check', 20) : k.n}</span>
            <span class="flow-txt">
              <b>${UI.esc(k.title)}</b>
              <span>${UI.esc(k.detail)}</span>
              ${n && n.key === k.key ? `<em>${UI.esc(k.lead)}</em>` : ''}
            </span>
            <span style="font-size:12px;color:var(--ink-mute);white-space:nowrap;">${k.minutes} min</span>
            <button class="btn btn-outline btn-sm" onclick="Learn.go('${k.key}')">
              ${k.done ? 'Zopakovať' : 'Otvoriť'}</button>
          </div>`).join('')}</div>`;
    },

    /** Je zaškolenie hotové? Nábor sa podľa toho rozhodne, či ho ponúkne. */
    status() {
      const kroky = O().state(this.saved());
      return { ...O().progress(kroky), kroky };
    },

    open() { Hire.learn = true; Danubra.renderRoute(); },
    close() { Hire.learn = false; this.screen = null; this.practice = null; Danubra.renderRoute(); },

    go(key) {
      this.screen = key;
      if (key === 'practice') this.startPractice();
      Danubra.renderRoute();
      window.scrollTo({ top: 0 });
    },
    back() { this.screen = null; this.practice = null; Danubra.renderRoute(); },

    /** Jeden krok na celú obrazovku. Veľké písmo, jedna vec, jedno tlačidlo. */
    stepView(el, key, kroky) {
      const k = kroky.find(x => x.key === key);
      const hotovo = (patch, hlaska) => {
        this.save(patch); this.screen = null; this.practice = null;
        if (hlaska) UI.toast(hlaska, 'ok');
        Danubra.renderRoute();
      };
      this._hotovo = hotovo;

      const telo = key === 'basics' ? this.basicsHtml()
        : key === 'trade' ? this.tradeHtml()
        : key === 'quiz' ? this.quizHtml()
        : key === 'call' ? this.callHtml()
        : this.practiceHtml();

      el.innerHTML = Danubra.header('Nábor',
        `Zaškolenie · krok ${k.n} z 5 — ${k.title} · ${k.minutes} minút`)
        + `<button class="btn btn-ghost btn-sm" style="margin-bottom:12px;"
             onclick="Learn.back()">${Icon('back', 15)} Späť na zaškolenie</button>`
        + telo;
    },

    // ── 1. Čo vlastne robíme ──────────────────────────────────────────────
    basicsHtml() {
      if (!this.basics.length) {
        return `<div class="card card-pad"><p class="lesson-text">
          Základy sa zatiaľ nenačítali z databázy. Spusti migráciu 037 —
          doplní šesť vecí, ktoré platia na každej nemeckej stavbe.</p>
          <button class="btn btn-primary" onclick="Learn.hotovo('basics')">
            Rozumiem, ďalej</button></div>`;
      }
      return `<div class="card card-pad" style="margin-bottom:12px;">
          <p class="lesson-text">Posielame slovenských živnostníkov na nemecké
          stavby ako <strong>subdodávku</strong> — nie ako požičaných ľudí. Ten
          rozdiel drží celý biznis a je v ňom aj dôvod, prečo sa pýtame na
          živnosť, A1 a prečo má partia vlastného predáka.</p>
        </div>
        <div class="lesson">${this.basics.filter(b => b.active !== false).map(b => `
          <div class="card card-pad lesson-card">
            <div class="card-title">${UI.esc(b.title)}</div>
            <p class="lesson-text">${UI.esc(b.body)}</p>
          </div>`).join('')}</div>
        <button class="flow-go" style="width:100%;justify-content:center;margin-top:14px;"
          onclick="Learn.hotovo('basics')">${Icon('check', 20)} Prečítal som si to</button>`;
    },

    // ── 2. Nauč sa jedno remeslo ──────────────────────────────────────────
    tradeHtml() {
      const vybrane = this.saved().trade;
      const hotove = this.trades.filter(t =>
        window.DanubraTrade && DanubraTrade.completeness(t, this.questions).questions >= 3);
      const zoznam = (hotove.length ? hotove : this.trades);
      return `<div class="card card-pad" style="margin-bottom:12px;">
          <p class="lesson-text">Nemusíš sa učiť všetkých jedenásť. Vyber si to,
          na ktoré budeš volať — zvyšok si doplníš, keď ho budeš potrebovať.
          Príručka zostáva po ruke aj počas hovoru.</p>
        </div>
        <div class="cards">${zoznam.map(t => `
          <button class="card card-pad nav-card${vybrane === t.key ? ' is-picked' : ''}"
            onclick="Learn.pickTrade('${t.key}')">
            <span class="nav-card-ico">${Icon('wrench', 18)}</span>
            <span><b>${UI.esc(t.name_sk)}</b><em>${UI.esc(t.name_de || '')}</em></span>
          </button>`).join('')}</div>
        ${vybrane ? `
          <button class="flow-go" style="width:100%;justify-content:center;margin-top:14px;"
            onclick="Danubra.go('trades');setTimeout(()=>Trades.open('${vybrane}'),300)">
            ${Icon('chevron', 20)} Otvoriť príručku — ${UI.esc(
              this.tradeOf(vybrane)?.name_sk || vybrane)}</button>
          <button class="btn btn-outline" style="width:100%;margin-top:8px;"
            onclick="Learn.hotovo('trade')">Prečítal som si ju, ďalej</button>` : ''}`;
    },

    pickTrade(key) { this.save({ trade: key }); Danubra.renderRoute(); },

    hotovo(key, value) {
      this.save({ [key]: value == null ? true : value });
      this.screen = null; this.practice = null;
      UI.toast('Krok hotový', 'ok');
      Danubra.renderRoute();
    },

    // ── 3. Vyskúšaj sa ────────────────────────────────────────────────────
    quizHtml() {
      const key = this.saved().trade;
      const t = this.tradeOf(key);
      if (!t) {
        return `<div class="card card-pad"><p class="lesson-text">
          Najprv si vyber remeslo v druhom kroku.</p>
          <button class="btn btn-primary" onclick="Learn.go('trade')">Vybrať remeslo</button></div>`;
      }
      const qs = window.DanubraTrade
        ? DanubraTrade.deck(this.questions, { tradeKey: key }) : [];
      return `<div class="card card-pad">
        <p class="lesson-text">Skúšanie je v príručke remesla — otázka sa ukáže,
        odpoveď si premyslíš a až potom uvidíš, čo chceš počuť. Prejdi si ho
        celé a vráť sa sem.</p>
        ${qs.length < 5 ? `<div class="warnbox" style="margin-top:10px;">
          ${Icon('alert', 14)} Toto remeslo má zatiaľ ${qs.length}
          ${Shell.plural(qs.length, 'otázku', 'otázky', 'otázok')} — na skúšanie
          treba aspoň päť. Doplň ich v príručke, inak sa zaškolenie nedá
          dokončiť poctivo.</div>` : ''}
        <button class="flow-go" style="width:100%;justify-content:center;margin-top:14px;"
          onclick="Danubra.go('trades');setTimeout(()=>{Trades.open('${key}');Trades.startQuiz('${key}')},300)">
          ${Icon('zap', 20)} Spustiť skúšanie</button>
        <div class="form-section" style="margin-top:18px;">Keď ho máš za sebou</div>
        <p class="lesson-text">Zapíš, na koľko percent si ho zvládol. Je to na
        teba — nikto to nekontroluje. Pod ${UI.pct(O().QUIZ_PASS)} to ale nemá zmysel
        posúvať ďalej.</p>
        <div class="guide-rate" style="margin-top:10px;">
          ${[50, 70, 85, 100].map(v => `<button class="guide-rb"
            onclick="Learn.hotovo('quiz', ${v})"><b>${UI.pct(v)}</b></button>`).join('')}
        </div>
      </div>`;
    },

    // ── 4. Ako vyzerá hovor ───────────────────────────────────────────────
    callHtml() {
      const casti = window.DanubraChips ? DanubraChips.SEGMENTS : [];
      return `<div class="card card-pad" style="margin-bottom:12px;">
          <p class="lesson-text">Hovor má dva tvary. <strong>Krátky</strong> do
          troch minút rozhodne, či sa oplatí pokračovať: remeslo, papiere, kedy
          môže, peniaze. <strong>Plný pohovor</strong> má šesť častí a ide sa
          naň až vtedy, keď krátky sedí — alebo keď má človek práve čas.</p>
          <p class="lesson-text" style="margin-top:8px;">Prvá otázka je vždy tá
          istá: <strong>na ktorý inzerát voláte</strong>. Od nej sa odvíja
          zvyšok a vďaka nej vieš, čo sme tomu človeku sľúbili.</p>
        </div>
        <div class="lesson">${casti.map((c, i) => `
          <div class="card card-pad lesson-card">
            <div class="card-title">${i + 1}. ${UI.esc(c.title)}</div>
            <p class="lesson-text">${UI.esc(c.lead)}</p>
          </div>`).join('')}</div>
        <div class="card card-pad" style="margin-top:12px;">
          <p class="lesson-text"><strong>Nahrávať hovor sa smie len vtedy, keď
          s tým obe strany vopred výslovne súhlasia.</strong> Bez toho je to
          trestné na Slovensku aj v Nemecku. Preto je v appke zápis, nie
          nahrávka.</p>
        </div>
        <button class="flow-go" style="width:100%;justify-content:center;margin-top:14px;"
          onclick="Learn.hotovo('call')">${Icon('check', 20)} Rozumiem</button>`;
    },

    // ── 5. Cvičný hovor ───────────────────────────────────────────────────
    startPractice() {
      const key = this.saved().trade;
      this.practice = {
        deck: O().practiceDeck(this.questions, { tradeKey: key }),
        i: 0, answers: [], shown: false,
      };
    },

    answerPractice(picked) {
      const p = this.practice;
      if (!p || p.shown) return;
      p.answers.push({ ...p.deck[p.i], picked });
      p.shown = true;
      Danubra.renderRoute();
    },
    nextPractice() {
      const p = this.practice;
      if (!p) return;
      p.i += 1; p.shown = false;
      Danubra.renderRoute();
    },

    practiceHtml() {
      const p = this.practice;
      if (!p || !p.deck.length) {
        return `<div class="card card-pad"><p class="lesson-text">
          Na cvičný hovor treba otázky, ktoré majú aj dobrú odpoveď, aj tú,
          pri ktorej treba zbystriť. Pri tomto remesle také zatiaľ nie sú —
          doplň ich v príručke remesla.</p>
          <button class="btn btn-primary" onclick="Danubra.go('trades')">
            Otvoriť príručku</button></div>`;
      }

      if (p.i >= p.deck.length) {
        const s = O().practiceScore(p.answers);
        return `<div class="card card-pad">
          <div class="flow-now-txt" style="margin-bottom:12px;">
            <b>${UI.pct(s.pct)}</b>
            <span>${s.spravne} z ${s.total} rozhodnutí správne. ${UI.esc(s.verdict)}</span>
          </div>
          ${s.dovercive ? `<div class="warnbox" style="margin-bottom:10px;">
            ${Icon('alert', 14)} ${s.dovercive}× si prijal odpoveď, pri ktorej
            treba zbystriť. To je tá chyba, ktorá stojí peniaze — človek sa
            dostane na stavbu a nevie to.</div>` : ''}
          ${s.prisne ? `<div class="regimebox" style="margin-bottom:10px;">
            ${s.prisne}× si odmietol dobrú odpoveď. Stojí to stratené
            telefonáty, nie peniaze — ale aj tak škoda.</div>` : ''}
          <div class="link-row">
            <button class="flow-go" onclick="Learn.hotovo('practice', ${s.pct})">
              ${Icon('check', 20)} Zapísať a dokončiť</button>
            <button class="btn btn-outline" onclick="Learn.startPractice();Danubra.renderRoute()">
              Skúsiť znova</button>
          </div>
        </div>`;
      }

      const k = p.deck[p.i];
      return `<div class="card card-pad">
        <div class="quiz-head">
          <span>Odpoveď ${p.i + 1} z ${p.deck.length}</span>
          <div class="statebar-track"><i style="width:${
            Math.round((p.i / p.deck.length) * 100)}%"></i></div>
        </div>
        <p style="font-size:14px;color:var(--ink-mute);margin:14px 0 4px;">Pýtaš sa:</p>
        <p class="quiz-q" style="margin-bottom:10px;">${UI.esc(k.question)}</p>
        <p style="font-size:14px;color:var(--ink-mute);margin:0 0 4px;">Kandidát odpovie:</p>
        <div class="practice-answer">${UI.esc(k.answer)}</div>

        ${p.shown ? `
          <div class="quiz-a ${k.accept ? 'quiz-good' : 'quiz-bad'}" style="margin-top:14px;">
            <b>${Icon(k.accept ? 'check' : 'alert', 14)} ${
              p.answers[p.answers.length - 1].picked === k.accept
                ? 'Rozhodol si správne' : 'Toto bolo inak'}</b>
            <span>${UI.esc(k.why)}${k.accept ? ''
              : ` Dobrá odpoveď znie: ${UI.esc(k.good_answer)}`}</span>
          </div>
          <button class="flow-go" style="width:100%;justify-content:center;margin-top:12px;"
            onclick="Learn.nextPractice()">${Icon('chevron', 20)} Ďalšia</button>`
        : `<div class="guide-actions" style="margin-top:18px;">
            <button class="guide-btn guide-btn-yes" onclick="Learn.answerPractice(true)">
              ${Icon('check', 20)} Beriem to</button>
            <button class="guide-btn guide-btn-no" onclick="Learn.answerPractice(false)">
              Pri tomto zbystrím</button>
          </div>`}
      </div>`;
    },
  };

  // Zaškolenie zámerne **nie je** položka v menu. Tých je aj tak priveľa a
  // zaškolenie nie je miesto, kam sa chodí — je to niečo, čím človek raz
  // prejde. Býva teda v Nábore a volá ho `Hire`.
  window.Learn = Learn;
})();
