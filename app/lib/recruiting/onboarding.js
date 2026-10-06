// ============================================================================
// DANUBRA — zaškolenie náborára za hodinu
// ============================================================================
// Zadanie znie: „posadím tam hocikoho a za hodinu vie robiť kvalitné nábory."
// To nie je úloha pre prehľadnejšiu obrazovku. To znamená, že appka musí
// človeka **naučiť**, nie mu len nebrániť.
//
// Čo sa taký človek musí naučiť, aby hovor nebol strata času pre obe strany:
//
//   1. **Čo vlastne robíme** — koho a kam posielame, kto je Polier, čo je A1,
//      prečo sa hlási Zoll. Bez toho nerozumie ani vlastnej otázke.
//   2. **Jedno remeslo poriadne** — nie všetkých jedenásť. Jedno, na ktoré
//      bude volať. Zvyšok si doplní, keď ho bude potrebovať.
//   3. **Overiť si, že to vie** — nie prečítať, ale odpovedať.
//   4. **Ako vyzerá hovor** — čo sa pýtam, v akom poradí a prečo.
//   5. **Cvičný hovor** — toto je tá podstatná časť. Appka ukáže odpoveď
//      kandidáta a človek rozhodne, či ju prijíma. Potom mu povie, či
//      rozhodol správne.
//
// Ten piaty krok je rozdiel medzi „prečítal som si to" a „viem to posúdiť".
// Náborár nepotrebuje vedieť, čo je Q3 — potrebuje vedieť rozoznať človeka,
// ktorý to vie, od človeka, ktorý to hovorí.
//
// Postup sa drží v prehliadači (localStorage), nie v databáze: je to osobná
// vec jedného človeka na jednom počítači, nie firemný záznam.
//
// Testy: node app/lib/recruiting/onboarding.test.js
// ============================================================================
(function () {
  const STEPS = [
    { key: 'basics', n: 1, title: 'Čo vlastne robíme', minutes: 10,
      lead: 'Koho posielame, kam, a čo na tých stavbách platí.',
      kind: 'read' },
    { key: 'trade', n: 2, title: 'Nauč sa jedno remeslo', minutes: 15,
      lead: 'To, na ktoré budeš volať. Ostatné si doplníš, keď ich budeš potrebovať.',
      kind: 'read' },
    { key: 'quiz', n: 3, title: 'Vyskúšaj sa z neho', minutes: 10,
      lead: 'Nie prečítať — odpovedať.', kind: 'quiz' },
    { key: 'call', n: 4, title: 'Ako vyzerá hovor', minutes: 10,
      lead: 'Čo sa pýtam, v akom poradí a prečo.', kind: 'read' },
    { key: 'practice', n: 5, title: 'Cvičný hovor', minutes: 15,
      lead: 'Appka hovorí za kandidáta. Ty rozhoduješ, či mu to beriem.',
      kind: 'practice' },
  ];

  /** Koľko treba zvládnuť, aby to nebolo odkývané. */
  const QUIZ_PASS = 70;        // percent správnych odpovedí v skúšaní
  const PRACTICE_PASS = 75;    // percent správnych rozhodnutí v cvičnom hovore
  const PRACTICE_ROUNDS = 8;   // koľko odpovedí musí posúdiť

  function totalMinutes() { return STEPS.reduce((s, x) => s + x.minutes, 0); }

  /**
   * Stav zaškolenia z uloženého postupu.
   *
   * @param {Object} saved  { basics:true, trade:'trockenbau', quiz:82, call:true, practice:88 }
   */
  function state(saved = {}) {
    const s = saved || {};
    return STEPS.map((x) => {
      let done = false, detail = '';
      if (x.key === 'basics') {
        done = !!s.basics;
        detail = done ? 'Prečítané.' : 'Šesť vecí, ktoré platia na každej stavbe.';
      } else if (x.key === 'trade') {
        done = !!s.trade;
        detail = done ? `Učíš sa ${s.trade}.` : 'Vyber si remeslo a prejdi si jeho príručku.';
      } else if (x.key === 'quiz') {
        done = Number(s.quiz) >= QUIZ_PASS;
        detail = s.quiz == null ? `Treba aspoň ${QUIZ_PASS} %.`
          : done ? `Zvládnuté na ${Math.round(s.quiz)} %.`
            : `Zatiaľ ${Math.round(s.quiz)} % — treba ${QUIZ_PASS} %.`;
      } else if (x.key === 'call') {
        done = !!s.call;
        detail = done ? 'Prečítané.' : 'Šesť častí hovoru a čo sa v nich pýtam.';
      } else {
        done = Number(s.practice) >= PRACTICE_PASS;
        detail = s.practice == null ? `Treba aspoň ${PRACTICE_PASS} %.`
          : done ? `Rozhodol si správne v ${Math.round(s.practice)} %.`
            : `Zatiaľ ${Math.round(s.practice)} % — treba ${PRACTICE_PASS} %.`;
      }
      return { ...x, done, detail };
    });
  }

  /** Ktorý krok je na rade. Ide sa po poradí — je to učenie, nie zoznam úloh. */
  function next(steps) {
    return (steps || []).find(x => !x.done) || null;
  }

  function progress(steps) {
    const s = steps || [];
    const done = s.filter(x => x.done).length;
    const left = s.filter(x => !x.done).reduce((a, x) => a + x.minutes, 0);
    return {
      done, total: s.length,
      pct: s.length ? Math.round((done / s.length) * 100) : 0,
      minutesLeft: left,
      ready: s.length > 0 && done === s.length,
    };
  }

  /** Veta, ktorú človek uvidí najprv. */
  function headline(steps) {
    const p = progress(steps);
    if (p.ready) {
      return { title: 'Môžeš volať', sub: 'Prešiel si celé zaškolenie. '
        + 'Keď si niečím nebudeš istý, príručka remesla je stále po ruke.' };
    }
    const n = next(steps);
    if (!p.done) {
      return { title: 'Zaškolenie za hodinu',
        sub: `Päť krokov, ${totalMinutes()} minút. Na konci budeš vedieť viesť `
          + 'hovor sám a rozoznať človeka, ktorý remeslo robil, od toho, kto o ňom počul.' };
    }
    return { title: n.title, sub: `${n.lead} Zostáva ${p.minutesLeft} minút.` };
  }

  // ── Cvičný hovor ──────────────────────────────────────────────────────────
  /**
   * Z otázok sa poskladajú kolá: otázka, odpoveď kandidáta a pravda o tom,
   * či sa tá odpoveď má prijať.
   *
   * Polovica odpovedí je dobrá, polovica je tá, pri ktorej treba zbystriť —
   * inak sa človek naučí odpovedať „áno" a prejde.
   *
   * @param {Array} questions  otázky s good_answer a red_flag_answer
   * @param {Object} o  { tradeKey, rounds, rnd }
   * @returns {Array} [{ id, question, answer, accept, why }]
   */
  function practiceDeck(questions, { tradeKey = null, rounds = PRACTICE_ROUNDS,
    rnd = Math.random } = {}) {
    const usable = (questions || []).filter(q => q && q.active !== false
      && String(q.question_sk || '').trim()
      && String(q.good_answer || '').trim()
      && String(q.red_flag_answer || '').trim()
      && (!tradeKey || !q.trade_key || q.trade_key === tradeKey));

    // Ťažšie otázky majú prednosť — na tých sa dá naučiť najviac.
    const zoradene = usable.slice().sort((a, b) => (b.weight || 1) - (a.weight || 1));
    const out = [];
    for (let i = 0; i < zoradene.length && out.length < rounds; i++) {
      const q = zoradene[i];
      // Striedavo dobrá a zlá odpoveď, nie náhodne — náhoda vie dať osem
      // dobrých za sebou a človek sa naučí kývať.
      const dobra = out.length % 2 === 0;
      out.push({
        id: q.id, question: q.question_sk,
        answer: dobra ? q.good_answer : q.red_flag_answer,
        accept: dobra,
        why: dobra
          ? 'Takto odpovedá človek, ktorý to robil.'
          : 'Toto je odpoveď, pri ktorej treba zbystriť.',
        good_answer: q.good_answer,
      });
    }
    return shuffle(out, rnd);
  }

  function shuffle(list, rnd = Math.random) {
    const a = (list || []).slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * Vyhodnotenie cvičného hovoru.
   *
   * Zvlášť sa počíta, koľkokrát človek **prijal zlú odpoveď** — to je tá
   * chyba, ktorá stojí peniaze. Prehnaná prísnosť stojí jeden stratený
   * telefonát; prehnaná dôvera stojí človeka na stavbe, ktorý to nevie.
   */
  function practiceScore(answers) {
    const a = (answers || []).filter(Boolean);
    const spravne = a.filter(x => x.picked === x.accept).length;
    const prisne = a.filter(x => x.accept && x.picked === false).length;
    const dovercive = a.filter(x => !x.accept && x.picked === true).length;
    const pct = a.length ? Math.round((spravne / a.length) * 100) : 0;
    return {
      total: a.length, spravne, prisne, dovercive, pct,
      passed: a.length > 0 && pct >= PRACTICE_PASS,
      verdict: !a.length ? ''
        : dovercive > prisne
          ? 'Beriež ľuďom veci, ktoré sa dajú overiť. Pýtaj sa doplňujúcu '
            + 'otázku — kto to robil, odpovie bez váhania.'
          : prisne > dovercive
            ? 'Si prísnejší, než treba. Zopár dobrých ľudí si takto odrežeš '
              + 'hneď na telefóne.'
            : 'Posudzuješ vyrovnane.',
    };
  }

  const API = {
    STEPS, QUIZ_PASS, PRACTICE_PASS, PRACTICE_ROUNDS,
    totalMinutes, state, next, progress, headline,
    practiceDeck, practiceScore, shuffle,
  };
  if (typeof window !== 'undefined') window.DanubraOnboarding = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
