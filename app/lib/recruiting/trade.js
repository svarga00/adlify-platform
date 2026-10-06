// ============================================================================
// DANUBRA — remeslo ako lekcia
// ============================================================================
// Nábor nerobí stavbár. Robí ho človek pri telefóne, ktorý na nemeckej stavbe
// nikdy nebol — a za pol hodiny má rozoznať sadrokartonára od toho, kto „to
// už raz robil".
//
// Z príručky remesiel teda nestačí urobiť zoznam polí. Musí sa dať **prečítať
// ako lekcia** a musí sa dať **vyskúšať**. Tomu zodpovedá aj poradie sekcií:
// nie podľa toho, ako sú stĺpce v tabuľke, ale podľa toho, v akom poradí to
// človek potrebuje vedieť.
//
//   1. Čo to je            — jedna veta, aby vedel, o čom hovorí
//   2. Deň na stavbe       — aby si to vedel predstaviť
//   3. Slovíčka            — aby rozumel kandidátovi aj Polierovi
//   4. Čo robí             — konkrétne úkony
//   5. S čím pracuje       — materiály, ktoré pozná menom
//   6. Čím pracuje         — vlastné náradie
//   7. Podľa čoho sa meria — normy a stupne kvality
//   8. Koľko toho spraví   — reálny denný výkon
//   9. Čo musí doložiť     — doklady
//  10. Podľa čoho spoznám podvodníka
//  11. Peniaze             — sadzby a prečo sú také
//
// Prázdna sekcia sa nevykreslí, ale **započíta sa do toho, čo chýba** —
// príručka, ktorá o sebe tvrdí, že je hotová, je horšia než tá, o ktorej je
// vidieť, kde má dieru.
//
// Testy: node app/lib/recruiting/trade.test.js
// ============================================================================
(function () {
  /**
   * Poradie lekcie. `need` hovorí, či sekcia patrí do výpočtu úplnosti —
   * nepovinné sekcie (napríklad právna poznámka pri neregulovanom remesle)
   * by inak držali príručku navždy pod sto percentami.
   */
  const SECTIONS = [
    { key: 'summary', title: 'Čo to je', kind: 'text', field: 'summary', need: true },
    { key: 'day', title: 'Deň na stavbe', kind: 'text', field: 'day_in_life', need: true },
    { key: 'vocab', title: 'Slovíčka, ktoré budeš počuť', kind: 'vocab', field: 'vocab', need: true },
    { key: 'scope', title: 'Čo na stavbe robí', kind: 'list', field: 'work_scope', need: true },
    { key: 'materials', title: 'S čím pracuje', kind: 'list', field: 'materials', need: true },
    { key: 'tools', title: 'Čím pracuje — vlastné náradie', kind: 'list', field: 'tools', need: true },
    { key: 'standards', title: 'Podľa čoho sa to meria', kind: 'list', field: 'standards', need: true },
    { key: 'output', title: 'Koľko toho za deň spraví', kind: 'text', field: 'daily_output', need: true },
    { key: 'certificates', title: 'Čo musí doložiť', kind: 'list', field: 'certificates', need: true },
    { key: 'red_flags', title: 'Podľa čoho spoznáš, že to nerobil', kind: 'list', field: 'red_flags', need: true },
    { key: 'pay', title: 'Prečo je sadzba taká, aká je', kind: 'text', field: 'pay_note', need: true },
  ];

  const str = (v) => String(v == null ? '' : v).trim();

  /** Je sekcia vyplnená? Prázdne pole aj pole s pomlčkou sa rátajú ako nie. */
  function filled(trade, s) {
    const v = (trade || {})[s.field];
    if (s.kind === 'list') {
      const arr = (v || []).map(str).filter(x => x && x !== '—' && x !== '-');
      return arr.length > 0;
    }
    if (s.kind === 'vocab') return vocabOf(trade).length > 0;
    return str(v).length > 0;
  }

  /**
   * Slovíčka v tvare, na ktorý sa dá spoľahnúť. Prichádzajú z jsonb, takže
   * to môže byť čokoľvek — a obrazovka nesmie spadnúť na tom, že tam niekto
   * vloží reťazec namiesto objektu.
   */
  function vocabOf(trade) {
    const raw = (trade || {}).vocab;
    const arr = Array.isArray(raw) ? raw
      : (typeof raw === 'string' ? safeParse(raw) : []);
    return (arr || []).map((x) => {
      if (!x) return null;
      if (typeof x === 'string') return { de: x, sk: '', note: '' };
      return { de: str(x.de), sk: str(x.sk), note: str(x.note) };
    }).filter(x => x && x.de);
  }

  function safeParse(s) {
    try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
  }

  /** Lekcia: sekcie, ktoré majú čo povedať, v poradí na čítanie. */
  function lesson(trade) {
    return SECTIONS.filter(s => filled(trade, s)).map(s => ({
      key: s.key, title: s.title, kind: s.kind,
      value: s.kind === 'vocab' ? vocabOf(trade) : (trade || {})[s.field],
    }));
  }

  /**
   * Koľko z príručky je hotové a čo chýba.
   *
   * Otázky sa rátajú zvlášť a majú vlastnú métu: pod päť otázok sa remeslo
   * nedá odskúšať, lebo kandidát ich počuje všetky a druhý už vie, čo príde.
   */
  const QUESTIONS_TARGET = 8;
  const QUESTIONS_MIN = 5;

  function completeness(trade, questions) {
    const need = SECTIONS.filter(s => s.need);
    const missing = need.filter(s => !filled(trade, s)).map(s => s.title);
    const qs = (questions || []).filter(q => q && q.trade_key === (trade || {}).key
      && q.active !== false);

    // Otázky sú jedna „sekcia" navyše — a je najdôležitejšia, lebo bez nich
    // sa z príručky dá len čítať, nie skúšať.
    const total = need.length + 1;
    const done = (need.length - missing.length) + (qs.length >= QUESTIONS_MIN ? 1 : 0);
    if (qs.length < QUESTIONS_MIN) {
      missing.push(qs.length
        ? `Odborné otázky (${qs.length} z ${QUESTIONS_MIN})`
        : 'Odborné otázky');
    }
    return {
      done, total, missing,
      questions: qs.length,
      pct: total ? Math.round((done / total) * 100) : 0,
      ready: missing.length === 0,
    };
  }

  /** Jedna veta o stave príručky — nie percento bez významu. */
  function stateSentence(c) {
    if (!c || !c.total) return '';
    if (c.ready) return 'Príručka je hotová — dá sa podľa nej naberať aj skúšať.';
    if (c.questions < QUESTIONS_MIN) {
      return c.questions
        ? `Chýbajú otázky — ${c.questions} je málo na to, aby sa dalo skúšať.`
        : 'Bez otázok sa toto remeslo nedá odskúšať.';
    }
    const n = c.missing.length;
    return `Chýba ${n} ${n === 1 ? 'časť' : n < 5 ? 'časti' : 'častí'}: ${
      c.missing.slice(0, 3).join(', ').toLowerCase()}${n > 3 ? '…' : '.'}`;
  }

  // ── Skúšanie ──────────────────────────────────────────────────────────────
  /**
   * Balíček na precvičovanie. Otázka bez „čo chcem počuť" sa do neho
   * nedostane — ukázať ju a nemať čím odpoveď porovnať je horšie než ju
   * nedať vôbec: človek si zapamätá vlastný dohad.
   */
  function deck(questions, { tradeKey = null, kinds = null, limit = 0 } = {}) {
    let out = (questions || []).filter(q => q && q.active !== false
      && str(q.question_sk) && str(q.good_answer));
    if (tradeKey) out = out.filter(q => q.trade_key === tradeKey);
    if (kinds && kinds.length) out = out.filter(q => kinds.includes(q.kind));
    out = out.slice().sort((a, b) => (b.weight || 1) - (a.weight || 1)
      || (a.sort_order || 0) - (b.sort_order || 0));
    return limit > 0 ? out.slice(0, limit) : out;
  }

  /**
   * Náhodné poradie. Vždy rovnaké poradie znamená, že sa človek naučí
   * poradie, nie odpovede.
   *
   * `rnd` sa dá odovzdať, aby sa to dalo otestovať — náhoda, ktorá sa nedá
   * zopakovať, sa nedá ani overiť.
   */
  function shuffle(list, rnd = Math.random) {
    const a = (list || []).slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Kde v balíčku som a koľko zostáva. */
  function progress(deckLen, index) {
    const n = Math.max(0, deckLen || 0);
    const i = Math.min(Math.max(0, index || 0), n);
    return { index: i, total: n, left: Math.max(0, n - i), pct: n ? Math.round((i / n) * 100) : 0 };
  }

  const API = {
    SECTIONS, QUESTIONS_TARGET, QUESTIONS_MIN,
    filled, vocabOf, lesson, completeness, stateSentence,
    deck, shuffle, progress,
  };
  if (typeof window !== 'undefined') window.DanubraTrade = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
