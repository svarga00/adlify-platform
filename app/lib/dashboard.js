// ============================================================================
// DANUBRA — z čoho sa skladá prehľad
// ============================================================================
// Prehľad má jednu vlastnosť, ktorú iné obrazovky nemajú: **každý ho používa
// inak.** Kto rieši peniaze, chce hore cash-flow. Kto naberá ľudí, chce hore
// nábor. Jedno poradie, ktoré sedí obom, neexistuje — tak nech si ho každý
// posunie.
//
// Preferencia sa drží v prehliadači, nie v databáze. Je to údaj o tom, ako sa
// pozerá tento človek na tomto zariadení; do spoločnej tabuľky nepatrí.
//
// Jedna vec je tu dôležitejšia, než vyzerá: **karta, ktorá v appke pribudne,
// sa musí objaviť aj tomu, kto si poradie už menil.** Inak by nová vec zostala
// navždy neviditeľná práve tým, ktorí appku používajú najviac.
//
// Testy: node app/lib/dashboard.test.js
// ============================================================================
(function () {
  /**
   * Skupiny = záložky. Poradie je poradím na obrazovke.
   *
   * „Dnes" je prvé zámerne: prvá otázka rána je, čo treba spraviť, nie koľko
   * je na účte. Peniaze sú hneď za tým a to, čo z nich horí, je aj tak nad
   * záložkami v cash-flow.
   */
  const GROUPS = [
    ['today', 'Dnes'],
    ['money', 'Peniaze'],
    ['work', 'Práca a ľudia'],
  ];

  /** Skupina kariet, ktoré sú nad záložkami — vidieť ich treba vždy. */
  const TOP = 'top';

  /**
   * Karty prehľadu.
   *   key    kľúč do `_dash*Card` a do vysvetliviek
   *   group  do ktorej záložky patrí
   *   wide   ide cez celú šírku (nie do stĺpcov)
   *   fixed  nedá sa skryť — bez nej by záložka stratila zmysel
   */
  const CARDS = [
    // Cash-flow nie je v žiadnej záložke — je nad nimi a vidieť ho treba vždy.
    { key: 'cashflow', title: 'Kompletný cash-flow', group: TOP, wide: true, fixed: true },
    { key: 'money', title: 'Koľko peňazí čakáme', group: 'money' },
    { key: 'weeks', title: 'Príjmy a výdaje', group: 'money' },
    { key: 'margin', title: 'Zarábame na tom?', group: 'money' },
    { key: 'profit', title: 'Očakávaný zisk', group: 'money' },
    { key: 'tied', title: 'Viazne v nákladoch', group: 'money' },
    { key: 'cash', title: 'Bude na výplaty?', group: 'money' },
    { key: 'book', title: 'Čo máme v objednávkach', group: 'work' },
    { key: 'hiring', title: 'Koho treba zohnať', group: 'work' },
    { key: 'tasks', title: 'Čo treba spraviť', group: 'today', fixed: true },
    { key: 'alerts', title: 'Vyžaduje pozornosť', group: 'today' },
    { key: 'actions', title: 'Rýchle akcie', group: 'today' },
  ];

  const byKey = (k) => CARDS.find(c => c.key === k) || null;

  /** Prázdne nastavenie — všetko viditeľné v predvolenom poradí. */
  function defaults() {
    return { hidden: [], order: CARDS.map(c => c.key), tab: 'money' };
  }

  /**
   * Upraví uložené nastavenie na to, čo appka dnes pozná.
   *
   *   * kľúč, ktorý už neexistuje, sa zahodí,
   *   * karta, ktorá pribudla, sa doplní na svoje miesto z predvoleného
   *     poradia — nie na koniec, kde by ju nikto nehľadal,
   *   * karta, ktorá sa nedá skryť, sa odškrtne zo skrytých.
   */
  function normalize(prefs) {
    const p = prefs || {};
    const known = new Set(CARDS.map(c => c.key));
    const order = (Array.isArray(p.order) ? p.order : []).filter(k => known.has(k));
    const seen = new Set(order);

    for (let i = 0; i < CARDS.length; i++) {
      const k = CARDS[i].key;
      if (seen.has(k)) continue;
      // Kam patrí podľa predvoleného poradia: za najbližšiu predchádzajúcu
      // kartu, ktorú človek už má.
      let at = order.length;
      for (let j = i - 1; j >= 0; j--) {
        const prev = order.indexOf(CARDS[j].key);
        if (prev >= 0) { at = prev + 1; break; }
      }
      order.splice(at, 0, k);
      seen.add(k);
    }

    const hidden = (Array.isArray(p.hidden) ? p.hidden : [])
      .filter(k => known.has(k) && !byKey(k).fixed);
    const tab = GROUPS.some(g => g[0] === p.tab) ? p.tab : GROUPS[0][0];
    return { hidden, order, tab };
  }

  /** Karty v poradí, ktoré človek vidí. */
  function visible(prefs) {
    const p = normalize(prefs);
    const hid = new Set(p.hidden);
    return p.order.map(byKey).filter(c => c && !hid.has(c.key));
  }

  /** Karty v jednej záložke. */
  function inGroup(prefs, group) {
    return visible(prefs).filter(c => c.group === group);
  }

  /** Karty nad záložkami. */
  function pinned(prefs) { return inGroup(prefs, TOP); }

  /** Záložky, ktoré majú čo ukázať. Prázdna záložka sa nekreslí. */
  function tabs(prefs) {
    return GROUPS
      .map(([key, label]) => ({ key, label, count: inGroup(prefs, key).length }))
      .filter(t => t.count > 0);
  }

  /** Na ktorej záložke človek stojí. Keď tá jeho zmizla, stojí na prvej. */
  function activeTab(prefs) {
    const t = tabs(prefs);
    if (!t.length) return null;
    const p = normalize(prefs);
    return t.some(x => x.key === p.tab) ? p.tab : t[0].key;
  }

  /** Zapne alebo vypne kartu. Karta označená `fixed` sa vypnúť nedá. */
  function toggle(prefs, key) {
    const p = normalize(prefs);
    const c = byKey(key);
    if (!c || c.fixed) return p;
    const hidden = p.hidden.includes(key)
      ? p.hidden.filter(k => k !== key)
      : [...p.hidden, key];
    return { ...p, hidden };
  }

  /**
   * Posunie kartu o jedno miesto. Posúva sa **v rámci svojej skupiny** —
   * presunúť „Rýchle akcie" medzi peniaze by znamenalo, že karta zmizne
   * z jednej záložky a objaví sa v druhej, čo nikto nečaká.
   */
  function move(prefs, key, dir) {
    const p = normalize(prefs);
    const c = byKey(key);
    if (!c) return p;
    const step = dir === 'up' ? -1 : 1;
    const sameGroup = p.order.filter(k => (byKey(k) || {}).group === c.group);
    const at = sameGroup.indexOf(key);
    const to = at + step;
    if (at < 0 || to < 0 || to >= sameGroup.length) return p;

    // Prehodia sa v rámci skupiny a poradie sa poskladá späť tak, aby miesta
    // ostatných skupín zostali nedotknuté.
    const swapped = sameGroup.slice();
    swapped[at] = sameGroup[to];
    swapped[to] = key;
    let i = 0;
    const order = p.order.map(k => ((byKey(k) || {}).group === c.group ? swapped[i++] : k));
    return { ...p, order };
  }

  function setTab(prefs, tab) {
    const p = normalize(prefs);
    return GROUPS.some(g => g[0] === tab) ? { ...p, tab } : p;
  }

  /** Vrátiť sa k predvolenému. */
  function reset() { return defaults(); }

  /** Zmenil si to človek oproti predvolenému? */
  function isCustom(prefs) {
    const p = normalize(prefs);
    const d = defaults();
    return p.hidden.length > 0 || p.order.join() !== d.order.join();
  }

  const API = {
    GROUPS, TOP, CARDS, defaults, normalize, visible, inGroup, pinned, tabs, activeTab,
    toggle, move, setTab, reset, isCustom, byKey,
  };
  if (typeof window !== 'undefined') window.DanubraDash = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
