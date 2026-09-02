// ============================================================================
// DANUBRA — zaškrtávacie polia živého náboru: poradie, skóre, verdikt
// ============================================================================
// Pri hovore sa neznámkuje, len sa odškrtáva, čo zaznelo. Skóre je pomer
// dobrých a zlých znamení, nie percento zo splnených otázok — kto sa nestihol
// opýtať na všetko, nesmie tým byť potrestaný.
//
// Varovanie (flag) váži viac než skóre. Človek môže mať 90 % a aj tak nesmie
// nastúpiť, ak tvrdí, že A1 netreba.
// ============================================================================
(function () {
  const SEGMENTS = [
    { key: 'intro', title: 'Úvod', lead: 'Kto volá a čo hľadá.' },
    { key: 'trade', title: 'Remeslo', lead: 'Tu sa ukáže, či to naozaj robil.' },
    { key: 'verify', title: 'Overenie', lead: 'Odpovede, ktoré sa dajú preveriť.' },
    { key: 'legal', title: 'Papiere', lead: 'Bez týchto vecí sa nedá nasadiť.' },
    { key: 'logistics', title: 'Logistika', lead: 'Kedy, ako a odkiaľ.' },
    { key: 'money', title: 'Peniaze', lead: 'Nech sa to nedozvie až na stavbe.' },
  ];

  function segmentTitle(key) {
    const s = SEGMENTS.find(x => x.key === key);
    return s ? s.title : key;
  }

  /**
   * Poradie polí v segmente: najprv to, čo naozaj používaš, potom zvyšok.
   * Pri rovnakom používaní má prednosť ťažšie pole — na to sa treba pýtať tak či tak.
   */
  function orderChips(chips) {
    return [...chips].sort((a, b) =>
      (b.use_count || 0) - (a.use_count || 0) ||
      (b.weight || 1) - (a.weight || 1) ||
      String(a.label).localeCompare(String(b.label), 'sk'));
  }

  /**
   * Poskladá obrazovky hovoru: jeden segment = jedna obrazovka.
   * Segment bez polí sa vynechá, aby sa nepreklikávalo prázdno.
   */
  function buildCallSegments({ tradeKey, chips = [] }) {
    const usable = chips.filter(c => c.active !== false
      && (!c.trade_key || c.trade_key === tradeKey));
    return SEGMENTS
      .map(s => ({
        ...s,
        chips: orderChips(usable.filter(c => c.segment === s.key)),
      }))
      .filter(s => s.chips.length > 0);
  }

  /**
   * Skóre z toho, čo je zaškrtnuté.
   *
   * @param {Array} ticked polia so znamienkom { id, label, polarity, weight }
   * @returns {{plus,minus,flags,ticked,percent,verdict,reason}}
   */
  function scoreChips(ticked = []) {
    let plus = 0, minus = 0;
    const flags = [];

    for (const c of ticked) {
      const w = c.weight || 1;
      if (c.polarity === 'plus') plus += w;
      else if (c.polarity === 'minus') minus += w;
      else if (c.polarity === 'flag') { flags.push(c); minus += w; }
    }

    const base = plus + minus;
    const percent = base ? Math.round((plus / base) * 100) : null;
    const hardFlag = flags.some(f => (f.weight || 1) >= 3);

    let verdict, reason;
    if (ticked.length === 0) {
      verdict = 'unknown'; reason = 'Zatiaľ nie je zaškrtnuté nič.';
    } else if (hardFlag) {
      verdict = 'reject';
      reason = `Rozhodujúce varovanie: ${flags.find(f => (f.weight || 1) >= 3).label}.`;
    } else if (flags.length >= 2) {
      verdict = 'reject'; reason = `Viacero varovaní (${flags.length}) — riziko je vyššie než prínos.`;
    } else if (ticked.length < 4) {
      verdict = 'unknown'; reason = 'Zaškrtnuté je príliš málo na rozhodnutie.';
    } else if (flags.length === 1) {
      verdict = 'weak'; reason = `Varovanie: ${flags[0].label}. Pred nasadením si to over.`;
    } else if (percent >= 75) {
      verdict = 'strong'; reason = 'Odbornosť aj papiere sedia, bez varovaní.';
    } else if (percent >= 50) {
      verdict = 'ok'; reason = 'Použiteľný, slabšie miesta doučí na stavbe.';
    } else {
      verdict = 'weak'; reason = 'Prevažujú zlé znamenia.';
    }

    return { plus, minus, flags, ticked: ticked.length, percent, verdict, reason };
  }

  /** Skóre a k tomu jedno odporúčanie, čo s človekom ďalej. */
  function callOutcome(ticked = []) {
    const res = scoreChips(ticked);
    let nextAction;
    if (res.verdict === 'reject') {
      nextAction = { key: 'reject', label: 'Zamietnuť',
        hint: 'Povedz mu narovinu, že to zatiaľ nevychádza. Dôvod si zapíš — o pol roka sa ozve znova.' };
    } else if (res.verdict === 'unknown') {
      nextAction = { key: 'continue', label: 'Dokončiť neskôr',
        hint: 'Na rozhodnutie je toho málo. Dohodni si druhý telefonát.' };
    } else if (res.verdict === 'strong') {
      nextAction = { key: 'advance', label: 'Ísť na overenie',
        hint: 'Vypýtaj si fotky prác a kontakt na posledného poliera ešte počas hovoru.' };
    } else {
      nextAction = { key: 'advance', label: 'Ísť na overenie',
        hint: 'Slabšie miesta si over referenciou skôr, než mu niečo sľúbiš.' };
    }
    return { ...res, nextAction };
  }

  /** Čo z hovoru vyšlo dobre a čo zle — na zhrnutie a do zápisu. */
  function summarize(ticked = []) {
    const by = p => ticked.filter(c => c.polarity === p).map(c => c.label);
    return { good: by('plus'), bad: by('minus'), flags: by('flag'), notes: by('neutral') };
  }

  const API = { SEGMENTS, segmentTitle, orderChips, buildCallSegments, scoreChips, callOutcome, summarize };
  if (typeof window !== 'undefined') window.DanubraChips = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
