// ============================================================================
// DANUBRA — náborový proces kandidáta: definícia krokov a vyhodnotenie
// ============================================================================
// Kroky a otázky sú tu, nie v databáze — verzujú sa cez git spolu s appkou.
// V databáze je len to, čo je zaškrtnuté, kým a kedy.
//
// Položky s `crewOnly: true` sa pýtajú len pri partii; do progresu jednotlivca
// sa nezapočítavajú, inak by nikdy nedosiahol sto percent.
//
// Červené vlajky sú zámerne mimo progresu. Zaškrtnutá vlajka nie je splnený
// krok, ale varovanie — postup dopredu neznamená, že je všetko v poriadku.
// ============================================================================
(function () {
  const STEPS = [
    {
      key: 'k1',
      title: 'Prvý kontakt',
      hint: 'WhatsApp, Messenger alebo telefón. Cieľ je odfiltrovať, nie predávať.',
      items: [
        'Partia alebo jednotlivec? Koľkí sú?',
        'Má živnosť (SK/CZ) alebo je ochotný si ju založiť?',
        'Aké remeselné práce ovláda najlepšie?',
        'Hovorí niekto po nemecky? Akú má úroveň?',
        'Má vlastné auto?',
        'Kedy najskôr môže nastúpiť?',
      ],
    },
    {
      key: 'k2',
      title: 'Telefonický pohovor',
      hint: 'Pätnásť až dvadsať minút. Tu sa ukáže, či prax naozaj má.',
      items: [
        'Kde naposledy pracoval a čo presne robil?',
        'Pracoval už v Nemecku alebo inde v zahraničí? Kde a ako dlho?',
        'Popísal konkrétnu rekonštrukciu a svoju úlohu v nej?',
        'Aké náradie vlastní?',
        'Zvládne pokyny v nemčine bez nemčinára?',
        'Je živnosť aktívna? Aké odbory — voľné či remeselné?',
        'Vie, čo je formulár A1?',
        'Má OP alebo pas platný aspoň šesť mesiacov?',
        'Vyhovuje mu turnus 3+1? Aké má záväzky doma?',
        'Zvládne dlhodobo približne 50 hodín týždenne?',
        'Sedí jeho predstava o hodinovke s našou ponukou?',
        'Sú pre neho zdieľané izby po dvoch až troch v poriadku?',
        'Fajčenie a alkohol — povedané narovinu?',
        'Prečo odišiel z poslednej práce?',
        { text: 'Ako dlho spolu partia robí?', crewOnly: true },
        { text: 'Kto je kontaktná osoba partie?', crewOnly: true },
      ],
    },
    {
      key: 'k3',
      title: 'Overenie',
      hint: 'Jeden až dva dni. Bez tohto kroku ide na stavbu ktokoľvek.',
      items: [
        'Fotky z predchádzajúcich prác — hotové dielo',
        'Referencia — zavolané bývalému objednávateľovi',
        'Živnosť overená v registri (zrsr.sk, rzp.cz)',
        'Kópie dokladov: OP alebo pas, živnostenský list, A1',
        'Videohovor — overenie nemčiny (Michaela)',
      ],
    },
    {
      key: 'k4',
      title: 'Ponuka a podmienky',
      hint: 'Všetko písomne. Čo nie je napísané, to sa o mesiac pamätá inak.',
      items: [
        'Hodinovka a spôsob fakturácie poslané',
        'Turnus 3+1 a približne 50 hodín týždenne potvrdené',
        'Ubytovanie: cena a podmienky (adresa až po platbe)',
        'Zoznam: náradie, pracovné oblečenie, obuv S3',
        'Dátum a miesto nástupu',
        'Kontakt na Michaelu odovzdaný',
        'Písomné potvrdenie: „Súhlasím, nastupujem dňa X"',
      ],
    },
    {
      key: 'k5',
      title: 'Pred nástupom',
      hint: 'Posledná kontrola. Čo tu chýba, to sa už na stavbe nedorieši.',
      items: [
        'Živnosť aktívna a v správnych odboroch',
        'Formulár A1 vybavený alebo aspoň podaný',
        'Zmluva o dielo alebo rámcová zmluva podpísaná',
        'Ubytovanie potvrdené a zaplatené',
        'Doprava dohodnutá — kto a kedy vyráža',
        'Skupinový WhatsApp vytvorený',
        'Prvý deň: kde, o koľkej a komu sa hlásiť',
      ],
    },
    {
      key: 'k6',
      title: 'Prvý týždeň',
      hint: 'Tri telefonáty, ktoré rozhodnú, či zostane.',
      items: [
        'Deň 1: večer zavolané — dorazili? Je ubytovanie v poriadku?',
        'Deň 3: je objednávateľ spokojný s prácou?',
        'Deň 7: obe strany spokojné → dlhodobá spolupráca potvrdená',
      ],
    },
  ];

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
      .map((item, index) => ({ index, text: itemText(item), applies: itemApplies(item, type) }))
      .filter(x => x.applies);
  }

  function checkedSet(checks) {
    const s = new Set();
    for (const c of checks || []) if (c.checked) s.add(`${c.step_key}:${c.item_index}`);
    return s;
  }

  /**
   * Stav jedného kroku.
   * @returns {{key,title,done:number,total:number,complete:boolean,percent:number}}
   */
  function stepProgress(step, checks, type) {
    const items = applicableItems(step, type);
    const set = checkedSet(checks);
    const done = items.filter(i => set.has(`${step.key}:${i.index}`)).length;
    return {
      key: step.key, title: step.title,
      done, total: items.length,
      complete: items.length > 0 && done === items.length,
      percent: items.length ? Math.round((done / items.length) * 100) : 0,
    };
  }

  /**
   * Celkový postup kandidáta cez K1–K6. Vlajky sa do progresu nerátajú.
   * @returns {{steps:Array,done:number,total:number,percent:number,
   *            currentStep:Object|null,complete:boolean,flags:Array,flagCount:number}}
   */
  function candidateProgress(candidate, checks) {
    const type = (candidate && candidate.type) || 'individual';
    const steps = STEPS.map(s => stepProgress(s, checks, type));
    const done = steps.reduce((a, s) => a + s.done, 0);
    const total = steps.reduce((a, s) => a + s.total, 0);
    const current = steps.find(s => !s.complete) || null;

    const set = checkedSet(checks);
    const flags = FLAGS.items
      .map((text, index) => ({ index, text, raised: set.has(`flags:${index}`) }))
      .filter(f => f.raised);

    return {
      steps, done, total,
      percent: total ? Math.round((done / total) * 100) : 0,
      currentStep: current,
      complete: total > 0 && done === total,
      flags, flagCount: flags.length,
    };
  }

  /** Ktorý krok otvoriť po načítaní — prvý nedokončený, inak posledný. */
  function initialOpenStep(candidate, checks) {
    const p = candidateProgress(candidate, checks);
    return p.currentStep ? p.currentStep.key : STEPS[STEPS.length - 1].key;
  }

  /**
   * Smie sa kandidát označiť za nastúpeného?
   * Zákazka je podmienka — bez nej nie je kam ho zapísať.
   */
  function canHire(candidate, checks, subcontractId) {
    const reasons = [];
    if (!subcontractId) reasons.push('Nie je vybraná zákazka.');
    const p = candidateProgress(candidate, checks);
    const preStart = p.steps.find(s => s.key === 'k5');
    if (preStart && !preStart.complete) {
      reasons.push(`Krok „Pred nástupom" nie je hotový (${preStart.done} z ${preStart.total}).`);
    }
    return { ok: reasons.length === 0, blocking: !subcontractId, reasons, flagCount: p.flagCount };
  }

  const API = {
    STEPS, FLAGS,
    itemText, itemApplies, applicableItems,
    stepProgress, candidateProgress, initialOpenStep, canHire,
  };
  if (typeof window !== 'undefined') window.DanubraProcess = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
