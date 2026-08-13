// ============================================================================
// DANUBRA — scenár živého náborového hovoru
// ============================================================================
// Človek zavolá na inzerát a náborujeme ho hneď. Nie je čas prepínať medzi
// checklistom a odbornými otázkami — tu sa z oboch skladá jeden scenár
// v poradí, v akom hovor reálne prebieha:
//
//   1. Úvod        — kto je a čo hľadá (kroky K1)
//   2. Remeslo     — odborné otázky presne na to remeslo
//   3. Overenie    — kde robil, s kým, koľko zvládne (overovacie otázky)
//   4. Papiere     — živnosť, A1, doklady
//   5. Logistika   — nástup, doprava, ubytovanie
//   6. Peniaze     — predstava o zárobku, záloha
//
// Papiere sú zámerne až po odbornosti. Keby sa pýtali hneď, polovica ľudí
// položí telefón skôr, než sa ukáže, či remeslo vôbec vie.
// ============================================================================
(function () {
  const SEGMENTS = [
    { key: 'intro', title: 'Úvod', lead: 'Zisti, kto volá a čo hľadá.' },
    { key: 'trade', title: 'Remeslo', lead: 'Tu sa ukáže, či to naozaj robil.' },
    { key: 'verify', title: 'Overenie', lead: 'Odpovede, ktoré sa dajú preveriť.' },
    { key: 'legal', title: 'Papiere', lead: 'Bez týchto vecí sa nedá nasadiť.' },
    { key: 'logistics', title: 'Logistika', lead: 'Kedy, ako a odkiaľ.' },
    { key: 'money', title: 'Peniaze', lead: 'Nech sa to nedozvie až na stavbe.' },
  ];

  /**
   * Poskladá scenár hovoru pre dané remeslo.
   *
   * @param {Object} opts
   * @param {string} opts.tradeKey     remeslo, na ktoré sa naberá
   * @param {Array}  opts.questions    všetky otázky z databázy
   * @param {Array}  opts.processItems položky kroku K1 ({index, text})
   * @param {string} opts.phase        fáza otázok, predvolene 'phone'
   * @returns {Array} položky scenára v poradí, každá so segmentom
   */
  function buildCallScript({ tradeKey, questions = [], processItems = [], phase = 'phone' }) {
    const active = questions.filter(q => q.active !== false && (!phase || q.phase === phase));
    const bySort = (a, b) => (a.sort_order || 0) - (b.sort_order || 0);

    const script = [];

    // 1. Úvod — kroky K1, odpovedá sa áno/nie
    for (const it of processItems) {
      script.push({ segment: 'intro', type: 'process', index: it.index, text: it.text });
    }

    // 2. Remeslo — len otázky na toto remeslo
    for (const q of active.filter(q => q.trade_key === tradeKey).sort(bySort)) {
      script.push({ segment: 'trade', type: 'question', question: q });
    }

    // 3.–6. Univerzálne otázky rozdelené podľa toho, čoho sa týkajú
    const universal = active.filter(q => !q.trade_key);
    const buckets = [
      ['verify', q => q.kind === 'hidden'],
      ['legal', q => q.kind === 'legal'],
      ['logistics', q => q.kind === 'logistics'],
      ['money', q => q.kind === 'motivation'],
    ];
    for (const [segment, match] of buckets) {
      for (const q of universal.filter(match).sort(bySort)) {
        script.push({ segment, type: 'question', question: q });
      }
    }
    // čo sa nezmestilo do žiadneho koša (napr. vlastný typ otázky)
    const placed = new Set(script.filter(s => s.question).map(s => s.question.id));
    for (const q of universal.filter(q => !placed.has(q.id)).sort(bySort)) {
      script.push({ segment: 'trade', type: 'question', question: q });
    }

    return script;
  }

  /** Zhrnutie segmentov pre ukazovateľ postupu v hlavičke. */
  function segmentSummary(script) {
    return SEGMENTS
      .map(s => ({ ...s, count: script.filter(x => x.segment === s.key).length }))
      .filter(s => s.count > 0);
  }

  function segmentTitle(key) {
    const s = SEGMENTS.find(x => x.key === key);
    return s ? s.title : key;
  }

  /**
   * Výsledok hovoru. Spája odbornosť (hodnotenie otázok) s tým, čo sa zistilo
   * v úvode, a prekladá to do rozhodnutia, čo s človekom ďalej.
   *
   * @returns {{percent,verdict,reason,redFlags,answered,total,nextAction}}
   */
  function callOutcome({ script, answers, scoreFn }) {
    const questions = script.filter(s => s.type === 'question').map(s => s.question);
    const given = [];
    for (const q of questions) {
      const a = answers.get(q.id);
      if (a && (a.value != null || a.flagged)) {
        given.push({ question_id: q.id, rating: a.value, flagged: !!a.flagged });
      }
    }
    const res = scoreFn(questions, given);

    const intro = script.filter(s => s.type === 'process');
    const introDone = intro.filter(s => answers.get(`p${s.index}`)?.value === true).length;

    let nextAction;
    if (res.verdict === 'reject') {
      nextAction = { key: 'reject', label: 'Zamietnuť',
        hint: 'Povedz mu narovinu, že to zatiaľ nevychádza. Dôvod si zapíš — o pol roka sa ozve znova.' };
    } else if (res.verdict === 'strong') {
      nextAction = { key: 'advance', label: 'Ísť na overenie',
        hint: 'Vypýtaj si fotky z prác a kontakt na posledného poliera ešte počas hovoru.' };
    } else if (res.verdict === 'unknown') {
      nextAction = { key: 'continue', label: 'Dokončiť neskôr',
        hint: 'Zodpovedaných je málo na rozhodnutie. Dohodni si druhý telefonát.' };
    } else {
      nextAction = { key: 'advance', label: 'Ísť na overenie',
        hint: 'Slabšie miesta si over referenciou skôr, než mu niečo sľúbiš.' };
    }

    return {
      ...res,
      introDone, introTotal: intro.length,
      nextAction,
    };
  }

  const API = { SEGMENTS, buildCallScript, segmentSummary, segmentTitle, callOutcome };
  if (typeof window !== 'undefined') window.DanubraCallScript = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
