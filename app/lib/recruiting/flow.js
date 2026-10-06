// ============================================================================
// DANUBRA — nábor krok za krokom
// ============================================================================
// Nábor bol rozsypaný na šesť obrazoviek a aj keď som ich spojil do jednej,
// zostal z toho dashboard: štyri karty, z ktorých si človek musí sám vybrať,
// čo spraví. Intuitívne je pravý opak — keď **netreba vyberať**.
//
// Reťazec je pritom vždy ten istý a má päť krokov:
//
//   1. Koho potrebujem      — bez toho sa nedá inzerovať
//   2. Dať o tom vedieť     — bez inzerátu sa nikto neozve
//   3. Ozývajú sa           — ozvať sa späť do desiatich minút
//   4. Doklady              — bez nich sa nedá nasadiť
//   5. Na stavbu            — a to je celé
//
// Táto knižnica z dát spočíta, **v ktorom kroku to viazne**, a vráti jednu
// vec, ktorá sa má spraviť teraz. Obrazovka ju potom ukáže veľkým písmom
// a dá pod ňu jedno veľké tlačidlo.
//
// Poradie krokov nie je len kozmetika: zavolať človeku, ktorý čaká dvadsať
// minút, je naliehavejšie než pripraviť inzerát, ktorý počká do zajtra.
// Preto sa nehľadá „prvý nehotový krok", ale **ten, ktorý najviac horí**.
//
// Testy: node app/lib/recruiting/flow.test.js
// ============================================================================
(function () {
  const STEPS = [
    { key: 'plan', n: 1, title: 'Koho potrebujem',
      lead: 'Koľko ľudí, akého remesla, kam a dokedy.' },
    { key: 'ad', n: 2, title: 'Dať o tom vedieť',
      lead: 'Bez inzerátu sa nikto neozve.' },
    { key: 'call', n: 3, title: 'Ozývajú sa',
      lead: 'Ozvať sa späť do desiatich minút.' },
    { key: 'docs', n: 4, title: 'Doklady',
      lead: 'Bez nich sa nasadiť nedá.' },
    { key: 'site', n: 5, title: 'Na stavbu',
      lead: 'Posledný krok — a to je celé.' },
  ];

  const min = (iso, now) => (iso
    ? Math.max(0, Math.round(((now || Date.now()) - new Date(iso).getTime()) / 60000))
    : null);

  /** Cieľ zo zadania: ozvať sa do desiatich minút od ozvania. */
  const CIEL_MINUT = 10;

  /**
   * Stav všetkých piatich krokov.
   *
   * @param {Object} o
   *   plans       náborové plány
   *   ads         inzeráty
   *   candidates  kandidáti
   *   now         kvôli testovateľnosti
   * @returns {Array} [{ ...krok, done, urgent, count, detail, action }]
   */
  function state({ plans = [], ads = [], candidates = [], now = Date.now() } = {}) {
    const bezia = (plans || []).filter(p => p && p.status === 'active');
    const inzeraty = (ads || []).filter(a => a && a.active !== false);
    const kandidati = (candidates || []).filter(c => c && !c.outcome);

    const cakaju = kandidati
      .filter(c => !c.first_contact_at)
      .map(c => ({ ...c, _min: min(c.received_at, now) }))
      .sort((a, b) => (b._min || 0) - (a._min || 0));

    // Po hovore, ale ešte nie pripravený — chýbajú doklady alebo rozhodnutie.
    const naDoklady = kandidati.filter(c => c.first_contact_at
      && !['ready', 'placed'].includes(c.status));
    const pripraveni = kandidati.filter(c => c.status === 'ready');

    // Plán, ktorý beží a nemá ani jeden inzerát, je najčastejšia tichá diera:
    // človek si povie, že naberá, a nikde nie je napísané kam sa ozvať.
    const bezInzeratu = bezia.filter(p => !inzeraty.some(a => a.plan_id === p.id));
    const treba = bezia.reduce((s, p) => s + (Number(p.headcount) || 0), 0);
    const mame = bezia.reduce((s, p) => s
      + kandidati.filter(c => c.plan_id === p.id && ['ready', 'placed'].includes(c.status)).length, 0);

    const najdlhsie = cakaju[0] ? cakaju[0]._min : null;

    return STEPS.map((s) => {
      if (s.key === 'plan') {
        return { ...s, done: bezia.length > 0, urgent: 0, count: bezia.length,
          detail: bezia.length
            ? `${bezia.length} ${plural(bezia.length, 'nábor beží', 'nábory bežia', 'náborov beží')}`
              + (treba ? `, treba ${treba} ${plural(treba, 'človeka', 'ľudí', 'ľudí')}` : '')
            : 'Zatiaľ nehľadáš nikoho.',
          action: bezia.length
            ? null
            : { label: 'Potrebujem ľudí', onclick: 'Hire.wizard()', kind: 'yes' } };
      }
      if (s.key === 'ad') {
        return { ...s, done: bezInzeratu.length === 0 && inzeraty.length > 0,
          urgent: bezInzeratu.length, count: inzeraty.length,
          detail: !inzeraty.length ? 'Nebeží žiadny inzerát.'
            : bezInzeratu.length
              ? `${bezInzeratu.length} ${plural(bezInzeratu.length, 'nábor nemá', 'nábory nemajú', 'náborov nemá')} inzerát`
              : `${inzeraty.length} ${plural(inzeraty.length, 'inzerát beží', 'inzeráty bežia', 'inzerátov beží')}`,
          action: (!inzeraty.length || bezInzeratu.length)
            ? { label: 'Pripraviť inzerát', onclick: "Danubra.go('ads')", kind: 'yes' } : null };
      }
      if (s.key === 'call') {
        const kto = cakaju[0];
        // „Hotové" musí znamenať, že sa to naozaj stalo. Prázdna appka, kde
        // nikto nečaká, nemá hovory hotové — nemá ich vôbec. Inak by hneď po
        // založení ukazovala dva kroky z piatich ako splnené.
        const volaliSme = kandidati.some(c => c.first_contact_at);
        return { ...s, done: volaliSme && cakaju.length === 0, urgent: cakaju.length,
          count: cakaju.length, who: kto || null,
          detail: cakaju.length
            ? `${cakaju.length} ${plural(cakaju.length, 'čaká', 'čakajú', 'čaká')} na prvý hovor`
              + (najdlhsie != null ? `, najdlhšie ${cas(najdlhsie)}` : '')
            : 'Nikto nečaká na hovor.',
          // Meno je už vo vete nad tlačidlom. Dvakrát na jednej obrazovke
          // vyzerá, akoby appka nevedela, čo už povedala.
          action: kto
            ? { label: 'Zavolať', onclick: `Guide.continueCall('${kto.id}')`, kind: 'yes' } : null };
      }
      if (s.key === 'docs') {
        // Človek zaseknutý na dokladoch je konkrétna prekážka, nie poznámka:
        // kým ich nedodá, nemôže na stavbu. Preto to horí.
        const presli = kandidati.some(c => ['ready', 'placed'].includes(c.status));
        return { ...s, done: presli && naDoklady.length === 0,
          urgent: naDoklady.length, count: naDoklady.length,
          who: naDoklady[0] || null,
          detail: naDoklady.length
            ? `${naDoklady.length} ${plural(naDoklady.length, 'človek čaká', 'ľudia čakajú', 'ľudí čaká')} na doklady alebo rozhodnutie`
            : 'Nikto nečaká na doklady.',
          action: naDoklady[0]
            ? { label: 'Dobehnúť doklady', onclick: `Cand.detail('${naDoklady[0].id}')`, kind: 'no' } : null };
      }
      const naStavbe = kandidati.filter(c => c.status === 'placed').length;
      return { ...s, done: naStavbe > 0 && pripraveni.length === 0,
        urgent: 0, count: pripraveni.length, who: pripraveni[0] || null,
        detail: pripraveni.length
          ? `${pripraveni.length} ${plural(pripraveni.length, 'je pripravený', 'sú pripravení', 'je pripravených')} na nasadenie`
          : (mame ? `${mame} ${plural(mame, 'človek je', 'ľudia sú', 'ľudí je')} na stavbe` : 'Zatiaľ nikto.'),
        action: pripraveni[0]
          ? { label: 'Nasadiť na zákazku', onclick: "Danubra.go('subcontracts')", kind: 'yes' } : null };
    });
  }

  /**
   * Čo spraviť teraz. Jedna vec, nie zoznam.
   *
   * Nehľadá sa prvý nehotový krok, ale ten, ktorý najviac horí: človek, ktorý
   * čaká dvadsať minút na telefón, je naliehavejší než inzerát, ktorý počká
   * do zajtra. Preto má hovor prednosť pred všetkým ostatným.
   */
  // V akom poradí veci horia. Nie je to poradie krokov — je to poradie toho,
  // čo sa stane, keď sa tomu nevenuješ:
  //   call  — človek je na linke teraz a o desať minút už nebude
  //   docs  — konkrétny človek nemôže na stavbu, kým ich nedodá
  //   ad    — nikto nový sa neozve, ale to počká do zajtra
  const NALIEHAVOST = ['call', 'docs', 'ad', 'plan', 'site'];

  function next(steps) {
    const s = steps || [];
    for (const key of NALIEHAVOST) {
      const x = s.find(y => y.key === key && y.urgent > 0 && y.action);
      if (x) return x;
    }
    return s.find(x => !x.done && x.action) || null;
  }

  /** Veta nad celou obrazovkou — čo sa deje, jedným riadkom. */
  function headline(steps) {
    const n = next(steps);
    if (!n) return { title: 'Nábor beží', sub: 'Nič nečaká — ozvania prídu samy.' };
    if (n.key === 'call' && n.who) {
      const m = n.who._min;
      return {
        title: `Zavolaj — ${n.who.full_name || 'kandidát'}`,
        sub: m != null
          ? (m > CIEL_MINUT
            ? `Čaká už ${cas(m)}. Cieľ je ozvať sa do desiatich minút.`
            : `Ozval sa pred ${cas(m)}. Stíhaš to.`)
          : 'Čaká na prvý hovor.',
        hot: m != null && m > CIEL_MINUT,
      };
    }
    return { title: n.title, sub: n.detail, hot: n.urgent > 0 };
  }

  /** Koľko z piatich krokov je hotových — na pruh postupu. */
  function progress(steps) {
    const s = steps || [];
    const done = s.filter(x => x.done).length;
    return { done, total: s.length, pct: s.length ? Math.round((done / s.length) * 100) : 0 };
  }

  function cas(m) {
    if (m == null) return '';
    if (m < 60) return `${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} ${plural(h, 'hodinu', 'hodiny', 'hodín')}`;
    const d = Math.round(h / 24);
    return `${d} ${plural(d, 'deň', 'dni', 'dní')}`;
  }

  function plural(n, one, few, many) {
    const a = Math.abs(n);
    if (a === 1) return one;
    if (a >= 2 && a <= 4) return few;
    return many;
  }

  const API = { STEPS, CIEL_MINUT, NALIEHAVOST, state, next, headline, progress, cas, plural };
  if (typeof window !== 'undefined') window.DanubraFlow = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
