// ============================================================================
// DANUBRA — jeden nábor: päť krokov od ozvania po stavbu
// ============================================================================
// Predtým tu bolo šesť krokov a päťdesiat odrážok. Polovica z nich boli otázky
// do telefónu — a tie sa pritom odškrtávajú v hovore (`chips.js`), takže sa
// to isté odklikávalo dvakrát. Druhá polovica miešala dohodu, doklady
// a logistiku dokopy. Kto nábor nerobil, nevedel, čo má spraviť teraz.
//
// Reťazec je pritom vždy ten istý a dá sa povedať jednou vetou:
//
//   Ozve sa → zavoláš → preveríš, či je to pravda → dohodnete sa → papiere → na stavbu
//
// Z toho je päť krokov a štrnásť odrážok. Krok má jeden dôvod, prečo existuje
// (`why`) — to je to, čo sa dá naučiť hocikoho.
//
// „Overenie" sa predtým volali dve rôzne veci: krok K3 aj časť telefonátu.
// Krok sa teraz volá **Preveriť** (preverujeme, čo povedal), časť hovoru
// **Dôkazy** (mená a fotky, ktoré sa dajú potom preveriť). Jedno slovo = jedna
// vec.
//
// Kroky a odrážky sú tu, nie v databáze — verzujú sa cez git spolu s appkou.
// V databáze je len to, čo je zaškrtnuté, kým a kedy.
//
// Odrážka s `auto` sa nezaškrtáva ručne: vyplýva z dát (zavolané, nasadený).
// Odrážka s `crewOnly` sa pýta len pri partii a do progresu jednotlivca sa
// nepočíta, inak by nikdy nedosiahol sto percent.
//
// `old` je väzba na staré kroky K1–K6. Zaškrtnutia v databáze zostali a stále
// platia — nikomu sa postup nevynuloval tým, že sa kroky preskládali.
//
// Červené vlajky sú zámerne mimo progresu. Zaškrtnutá vlajka nie je splnený
// krok, ale varovanie — postup dopredu neznamená, že je všetko v poriadku.
//
// Testy: node app/lib/recruiting/process.test.js
// ============================================================================
(function () {
  const STEPS = [
    {
      key: 'call',
      n: 1,
      title: 'Zavolať',
      lead: 'Ozval sa. Zavolaj mu do desiatich minút.',
      why: 'Kto sa ozve nám, ozve sa aj ďalším trom. Rozhoduje, kto zavolá prvý — '
        + 'nie kto má lepšiu ponuku.',
      items: [
        { text: 'Zavolané — prvý hovor prebehol',
          auto: c => !!c.first_contact_at, oldStep: ['k1'] },
        { text: 'Zapísané, čo v hovore zaznelo',
          auto: c => c.screening_score != null, oldStep: ['k2'],
          hint: 'Odškrtáva sa priamo v hovore. Appka z toho spočíta, či to sedí.' },
      ],
    },
    {
      key: 'proof',
      n: 2,
      title: 'Preveriť',
      lead: 'To, čo povedal do telefónu, si over u niekoho iného.',
      why: 'Toto je krok, ktorý sa predtým volal „overenie". Je tu preto, že do telefónu '
        + 'povie každý všetko. Bez neho ide na nemeckú stavbu človek, ktorého prax nikto '
        + 'nevidel — a prvý, komu to praskne, je náš odberateľ.',
      items: [
        { text: 'Fotky hotovej práce — nie z internetu, jeho vlastné',
          old: [['k3', 0]] },
        { text: 'Zavolané poslednému objednávateľovi alebo polierovi',
          old: [['k3', 1]],
          hint: 'Jedna otázka stačí: „Vzali by ste ho znova?" Zaváhanie je odpoveď.' },
        { text: 'Živnosť nájdená v registri (zrsr.sk, rzp.cz)',
          old: [['k3', 2]] },
        { text: 'Videohovor — ako hovorí po nemecky (Michaela)',
          old: [['k3', 4]],
          hint: 'Nemusí byť dobrý. Musí rozumieť pokynom bez prekladateľa.' },
        { text: 'Partia: kto je kontaktná osoba a ako dlho spolu robia',
          crewOnly: true, old: [['k2', 14]], oldStep: [] },
      ],
    },
    {
      key: 'deal',
      n: 3,
      title: 'Dohodnúť',
      lead: 'Sadzba, turnus a nástup — písomne, nie po telefóne.',
      why: 'Čo nie je napísané, to si o mesiac na stavbe pamätá každý inak. '
        + 'A spor o hodinovku sa vždy rieši vtedy, keď už tam ten človek je.',
      items: [
        { text: 'Sadzba a ako sa fakturuje — poslané písomne',
          old: [['k4', 0]] },
        { text: 'Turnus 3+1 a približne 50 hodín týždenne potvrdené',
          old: [['k4', 1]] },
        { text: 'Písomné „Súhlasím, nastupujem dňa X"',
          old: [['k4', 6]],
          hint: 'Stačí správa vo WhatsApp. Dôležitý je dátum, nie forma.' },
      ],
    },
    {
      key: 'papers',
      n: 4,
      title: 'Papiere',
      lead: 'Živnosť, A1, doklady, zmluva.',
      why: 'Bez týchto štyroch vecí sa nedá nasadiť. Nie preto, že by to appka zakazovala — '
        + 'preto, že pri kontrole na stavbe to padne na nás, nie na neho.',
      items: [
        { text: 'Kópie dokladov: OP alebo pas, živnostenský list',
          old: [['k3', 3]] },
        { text: 'Živnosť aktívna a v správnych odboroch',
          old: [['k5', 0]] },
        { text: 'A1 podané alebo vybavené',
          old: [['k5', 1]],
          hint: 'Podané stačí. Potvrdenie chodí týždne a stavba nepočká.' },
        { text: 'Zmluva o dielo alebo rámcová zmluva podpísaná',
          old: [['k5', 2]] },
      ],
    },
    {
      key: 'site',
      n: 5,
      title: 'Na stavbu',
      lead: 'Zákazka, dátum, a kde sa má prvý deň hlásiť.',
      why: 'Posledný krok, kde sa dá ešte niečo vymyslieť. Čo nie je dohodnuté teraz, '
        + 'to rieši v nedeľu večer pred bránou cudzej stavby.',
      items: [
        { text: 'Nasadený na zákazku',
          auto: c => c.status === 'placed' || !!c.subcontract_id },
        { text: 'Infolist na stavbu odoslaný — adresa, kde sa hlásiť, čo si vziať',
          old: [['k5', 6], ['k4', 3], ['k4', 4]],
          hint: 'Appka ho vygeneruje zo zákazky — nepíše sa ručne.' },
        { text: 'Doprava a ubytovanie dohodnuté',
          old: [['k5', 3], ['k5', 4], ['k4', 2]] },
        { text: 'Skupinový WhatsApp a kontakt na Michaelu odovzdaný',
          old: [['k5', 5], ['k4', 5]] },
      ],
    },
  ];

  // Prvý týždeň nie je krok náboru — človek už je na stavbe. Sú to tri
  // telefonáty, ktoré rozhodnú, či zostane, a preto sa ukazujú až po nasadení
  // a do postupu náboru sa nepočítajú.
  const AFTER = {
    key: 'first_week',
    title: 'Prvý týždeň',
    hint: 'Tri telefonáty, ktoré rozhodnú, či zostane. Nábor je hotový — toto je udržanie.',
    items: [
      'Deň 1: večer zavolané — dorazili? Je ubytovanie v poriadku?',
      'Deň 3: je objednávateľ spokojný s prácou?',
      'Deň 7: obe strany spokojné → dlhodobá spolupráca potvrdená',
    ],
  };

  const FLAGS = {
    key: 'flags',
    title: 'Červené vlajky',
    hint: 'Zaškrtnutie nie je pokrok, ale varovanie. Dve a viac znamenajú zastaviť sa.',
    items: [
      'Pýta zálohu alebo preplatenie cesty vopred',
      'Žiadna fotka práce, žiadna referencia',
      'Vyhýba sa videohovoru (nemčina)',
      'Mení odpovede — živnosť raz má, raz nemá',
      '„Kedy budú peniaze?" ako prvá otázka',
    ],
  };

  /** Text položky bez ohľadu na to, či je zapísaná ako reťazec alebo objekt. */
  function itemText(item) { return typeof item === 'string' ? item : item.text; }

  /** Platí položka pre tohto kandidáta? Otázky pre partie u jednotlivca nie. */
  function itemApplies(item, type) {
    if (typeof item === 'string') return true;
    if (item.crewOnly) return type === 'crew';
    return true;
  }

  /** Položky kroku, ktoré sa daného kandidáta naozaj týkajú, aj s indexom. */
  function applicableItems(step, type) {
    return step.items
      .map((item, index) => ({
        index,
        text: itemText(item),
        hint: (item && item.hint) || null,
        auto: (item && item.auto) || null,
        applies: itemApplies(item, type),
      }))
      .filter(x => x.applies);
  }

  function checkedSet(checks) {
    const s = new Set();
    for (const c of checks || []) if (c.checked) s.add(`${c.step_key}:${c.item_index}`);
    return s;
  }

  /**
   * Je odrážka splnená?
   *
   * Tri cesty, zámerne v tomto poradí:
   *   1. `auto` — vyplýva z dát (zavolané, nasadený). Nedá sa odkliknúť.
   *   2. zaškrtnutie na novom kľúči kroku
   *   3. zaškrtnutie na starom kroku K1–K6, ktoré túto vec pokrývalo
   *
   * Tretia cesta je tu preto, aby preskládanie krokov nikomu nevynulovalo
   * prácu, ktorú už odviedol. Zapisuje sa vždy na nový kľúč.
   */
  function itemDone(step, index, candidate, checks) {
    const item = step.items[index];
    if (!item) return false;
    const c = candidate || {};
    if (typeof item.auto === 'function' && item.auto(c)) return true;

    const set = checkedSet(checks);
    if (set.has(`${step.key}:${index}`)) return true;
    for (const [k, i] of (item.old || [])) if (set.has(`${k}:${i}`)) return true;
    for (const k of (item.oldStep || [])) {
      for (const key of set) if (key.startsWith(`${k}:`)) return true;
    }
    return false;
  }

  /** Dá sa odrážka zaškrtnúť ručne? Odvodené veci nie — tie sa stanú samy. */
  function itemManual(step, index) {
    const item = step.items[index];
    return !!item && typeof item.auto !== 'function';
  }

  /**
   * Stav jedného kroku.
   * @returns {{key,n,title,lead,why,done:number,total:number,complete:boolean,percent:number}}
   */
  function stepProgress(step, checks, type, candidate) {
    const items = applicableItems(step, type);
    const done = items.filter(i => itemDone(step, i.index, candidate, checks)).length;
    return {
      key: step.key, n: step.n, title: step.title, lead: step.lead, why: step.why,
      done, total: items.length,
      complete: items.length > 0 && done === items.length,
      percent: items.length ? Math.round((done / items.length) * 100) : 0,
    };
  }

  /**
   * Celý reťazec kandidáta. Vlajky ani prvý týždeň sa do progresu nerátajú.
   * @returns {{steps:Array,done:number,total:number,percent:number,
   *            currentStep:Object|null,complete:boolean,flags:Array,flagCount:number,
   *            next:Object|null,afterPlacement:Object}}
   */
  function candidateProgress(candidate, checks) {
    const cand = candidate || {};
    const type = cand.type || 'individual';
    const steps = STEPS.map(s => stepProgress(s, checks, type, cand));
    const done = steps.reduce((a, s) => a + s.done, 0);
    const total = steps.reduce((a, s) => a + s.total, 0);
    const current = steps.find(s => !s.complete) || null;

    const set = checkedSet(checks);
    const flags = FLAGS.items
      .map((text, index) => ({ index, text, raised: set.has(`flags:${index}`) }))
      .filter(f => f.raised);

    const afterItems = AFTER.items
      .map((text, index) => ({ index, text, done: set.has(`${AFTER.key}:${index}`)
        || set.has(`k6:${index}`) }));

    return {
      steps, done, total,
      percent: total ? Math.round((done / total) * 100) : 0,
      currentStep: current,
      complete: total > 0 && done === total,
      flags, flagCount: flags.length,
      next: nextThing(cand, steps, flags),
      afterPlacement: {
        ...AFTER,
        items: afterItems,
        done: afterItems.filter(i => i.done).length,
        total: afterItems.length,
        show: cand.status === 'placed' || !!cand.subcontract_id,
      },
    };
  }

  /**
   * Jedna vec, ktorá sa má spraviť teraz. Nie zoznam.
   *
   * Dve a viac červených vlajok majú prednosť pred postupom: pokračovať
   * v nábore človeka, pri ktorom zazneli dve varovania, je drahšie než
   * zastaviť sa a rozhodnúť.
   */
  function nextThing(candidate, steps, flags) {
    const c = candidate || {};
    if (c.outcome === 'rejected') {
      return { key: 'closed', title: 'Zamietnutý', what: 'Dôvod je zapísaný. Nič netreba.' };
    }
    if ((flags || []).length >= 2) {
      return { key: 'flags', title: 'Zastav sa',
        what: `${flags.length} červené vlajky. Rozhodni, či vôbec pokračovať.`, hot: true };
    }
    const step = (steps || []).find(s => !s.complete);
    if (!step) {
      return c.status === 'placed' || c.subcontract_id
        ? { key: 'done', title: 'Je na stavbe', what: 'Nábor je hotový. Ostáva prvý týždeň.' }
        : { key: 'done', title: 'Všetko odškrtnuté', what: 'Zostáva nasadiť ho na zákazku.' };
    }
    return {
      key: step.key, n: step.n, title: step.title, what: step.lead, why: step.why,
      hot: step.key === 'call',
    };
  }

  /** Ktorý krok otvoriť po načítaní — prvý nedokončený, inak posledný. */
  function initialOpenStep(candidate, checks) {
    const p = candidateProgress(candidate, checks);
    return p.currentStep ? p.currentStep.key : STEPS[STEPS.length - 1].key;
  }

  /** V ktorom kroku reťazca človek stojí — na odznak v zozname. */
  function stageOf(candidate, checks) {
    const p = candidateProgress(candidate, checks);
    if ((candidate || {}).outcome === 'rejected') {
      return { key: 'rejected', title: 'Zamietnutý', n: null, percent: p.percent };
    }
    if (!p.currentStep) {
      return { key: 'done', title: 'Na stavbe', n: null, percent: 100 };
    }
    return { ...p.currentStep, percent: p.percent };
  }

  /**
   * Smie sa kandidát označiť za nastúpeného?
   * Zákazka je podmienka — bez nej nie je kam ho zapísať. Papiere nie sú
   * formalita: bez nich to pri kontrole padne na nás.
   */
  function canHire(candidate, checks, subcontractId) {
    const reasons = [];
    if (!subcontractId) reasons.push('Nie je vybraná zákazka.');
    const p = candidateProgress(candidate, checks);
    const papers = p.steps.find(s => s.key === 'papers');
    if (papers && !papers.complete) {
      reasons.push(`Krok „Papiere" nie je hotový (${papers.done} z ${papers.total}).`);
    }
    return { ok: reasons.length === 0, blocking: !subcontractId, reasons, flagCount: p.flagCount };
  }

  const API = {
    STEPS, FLAGS, AFTER,
    itemText, itemApplies, applicableItems, itemDone, itemManual,
    stepProgress, candidateProgress, initialOpenStep, stageOf, canHire,
  };
  if (typeof window !== 'undefined') window.DanubraProcess = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
