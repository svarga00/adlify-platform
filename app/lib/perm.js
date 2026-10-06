// ============================================================================
// DANUBRA — kto smie na čo
// ============================================================================
// Model je jednoduchý zámerne:
//
//   * **rola** je predvoľba — administrátor, koordinátor, náborár, účtovníctvo,
//   * **moduly** sú výnimka na mieru. Keď sú vyplnené, platia ony a rola je
//     len poznámka, z čoho sa vychádzalo.
//
// Dve knobky, ktoré robia to isté, sú mätúce, takže platí jedno pravidlo:
// *„moduly, ak sú zadané, platia; inak predvoľba roly."*
//
// **Toto nie je ochrana.** Ochrana je v databáze (migrácia 030) — funkcia
// `danubra_can()`, politiky a spúšťače. Tu je to len preto, aby človek
// nevidel v menu obrazovky, na ktoré aj tak nemá; skrytá položka nikoho
// nezastaví, kto pozná adresu.
//
// Preto je tu aj test, ktorý porovnáva tento zoznam s tým v migrácii. Keby sa
// rozišli, appka by ponúkala niečo, čo databáza odmietne — a vyzeralo by to
// ako chyba appky, nie ako pravidlo.
//
// Testy: node app/lib/perm.test.js
// ============================================================================
(function () {
  /** Role ako predvoľby. `custom` znamená „žiadna predvoľba, iba moduly". */
  const ROLES = [
    ['admin', 'Administrátor', 'Všetko vrátane schvaľovania faktúr, výnimiek a používateľov.'],
    ['coordinator', 'Koordinátor', 'Zákazky, ľudia, hodiny a náklady. Faktúru neschváli.'],
    ['recruiter', 'Náborár', 'Inzeráty, kandidáti, hovory a ľudia. K peniazom sa nedostane.'],
    ['accountant', 'Účtovníctvo', 'Faktúry, náklady a banka. Zákazky len na čítanie.'],
    ['custom', 'Na mieru', 'Presne to, čo zaškrtneš.'],
  ];

  /**
   * Obrazovky. Kľúč je názov obrazovky v navigácii — nie je to náhoda:
   * právo na obrazovku a obrazovka sú tá istá vec.
   */
  const MODULES = [
    { key: 'dashboard', label: 'Prehľad', group: 'Prehľad' },
    { key: 'tasks', label: 'Úlohy a pripomienky', group: 'Prehľad' },
    { key: 'messages', label: 'Správy', group: 'Prehľad' },

    { key: 'quotes', label: 'Ponuky', group: 'Zákazky' },
    { key: 'contracts', label: 'Zmluvy', group: 'Zákazky' },
    { key: 'subcontracts', label: 'Zákazky', group: 'Zákazky' },
    { key: 'timesheets', label: 'Odpracované hodiny', group: 'Zákazky' },
    { key: 'hoursheet', label: 'Výkaz pre odberateľa', group: 'Zákazky' },

    { key: 'ads', label: 'Inzeráty', group: 'Ľudia' },
    { key: 'hiring', label: 'Náborové plány', group: 'Ľudia' },
    { key: 'candidates', label: 'Kandidáti', group: 'Ľudia' },
    { key: 'workers', label: 'Živnostníci', group: 'Ľudia' },
    { key: 'crews', label: 'Partie', group: 'Ľudia' },
    { key: 'trades', label: 'Remeslá a otázky', group: 'Ľudia' },
    { key: 'recruiting', label: 'Zápisy z hovorov', group: 'Ľudia' },

    { key: 'partners', label: 'Odberatelia v Nemecku', group: 'Databáza' },
    { key: 'accommodations', label: 'Ubytovania', group: 'Databáza' },

    { key: 'invoices', label: 'Vydané faktúry', group: 'Peniaze' },
    { key: 'costs', label: 'Náklady', group: 'Peniaze' },
    { key: 'bank', label: 'Banka a cash-flow', group: 'Peniaze' },

    { key: 'compliance', label: 'Compliance', group: 'Systém' },
    { key: 'rules', label: 'Cenník a pravidlá', group: 'Systém' },
    { key: 'settings', label: 'Nastavenia', group: 'Systém' },
  ];

  /**
   * Právomoci, ktoré nie sú obrazovkou. Všetky sú **len pre administrátora**
   * a nedajú sa prideliť ani vlastným zoznamom modulov — sú to tvrdé pravidlá
   * zo zadania, nie nastavenie.
   */
  const ADMIN_ONLY = [
    ['invoice.approve', 'Schváliť a vystaviť faktúru'],
    ['deploy.override', 'Povoliť nasadenie bez platných dokladov'],
    ['members.manage', 'Spravovať používateľov'],
    ['settings.write', 'Meniť nastavenia firmy'],
    ['demo.purge', 'Vymazať vzorové dáta'],
  ];

  /** Predvoľby rolí. Musia sedieť s `danubra_can()` v migrácii 030. */
  const PRESETS = {
    coordinator: ['dashboard', 'tasks', 'messages', 'subcontracts', 'timesheets', 'hoursheet',
      'crews', 'workers', 'partners', 'quotes', 'contracts', 'accommodations',
      'compliance', 'costs', 'ads', 'hiring', 'candidates'],
    recruiter: ['dashboard', 'tasks', 'messages', 'ads', 'hiring', 'candidates', 'workers',
      'crews', 'trades', 'recruiting'],
    accountant: ['dashboard', 'messages', 'invoices', 'costs', 'bank', 'partners',
      'subcontracts', 'timesheets'],
    custom: [],
  };

  /**
   * Obrazovky, ktoré nie sú „modul", ale právomoc. Správa používateľov je
   * obrazovka aj právomoc naraz — a prideliť sa nedá, takže sa nesmie
   * objaviť medzi zaškrtávacími poľami.
   */
  const ROUTE_POWER = { members: 'members.manage' };

  /**
   * Obrazovky, ktoré nemajú vlastné právo, lebo neukazujú nič navyše — sú to
   * iné pohľady na to isté. „Ako to ide" je mapa toho, čo je na prehľade; keby
   * mala vlastné právo, musel by ho niekto prideľovať a vzniklo by nastavenie,
   * pri ktorom človek vidí prehľad, ale nie mapu k nemu.
   *
   * Nie je to to isté ako `ROUTE_POWER`: tam je právomoc **prísnejšia** než
   * obrazovka, tu je to **tá istá** obrazovka inak zobrazená.
   */
  const ROUTE_ALIAS = {
    flow: 'dashboard',
    // „Kde sú peniaze" ukazuje pohľadávky, záväzky aj stav účtu — to isté,
    // čo banka a cash-flow. Preto to isté právo: kto nemá vidieť zostatok,
    // nemá ho vidieť ani odtiaľto.
    money: 'bank',
  };

  /** Z názvu obrazovky urob kľúč práva. */
  function keyOf(route) { return ROUTE_POWER[route] || ROUTE_ALIAS[route] || route; }

  const isAdminRole = (m) => !!m && m.active !== false && m.role === 'admin';

  /**
   * Kým nie je založený ani jeden člen, smie každý — inak by sa prvý človek
   * zamkol von. To isté pravidlo platí v databáze.
   */
  function bootstrap(members) { return !(members || []).some(m => m && m.active !== false); }

  /** Zoznam kľúčov, ktoré ten človek reálne má. */
  function modulesOf(member) {
    if (!member || member.active === false) return [];
    if (member.role === 'admin') {
      return [...MODULES.map(m => m.key), ...ADMIN_ONLY.map(p => p[0])];
    }
    const own = (member.modules || []).filter(Boolean);
    if (own.length) return own.filter(k => !ADMIN_ONLY.some(p => p[0] === k));
    return PRESETS[member.role] || [];
  }

  /**
   * Smie na `key`? `key` je obrazovka alebo právomoc.
   * @param {Object|null} member  null = ešte nie je pozvaný
   * @param {Array} members  všetci — kvôli poistke pri prázdnej appke
   */
  function can(member, route, members) {
    const key = keyOf(route);
    if (bootstrap(members)) return true;
    if (!member || member.active === false) return false;
    if (member.role === 'admin') return true;
    if (ADMIN_ONLY.some(p => p[0] === key)) return false;
    return modulesOf(member).includes(key);
  }

  function isAdmin(member, members) {
    return bootstrap(members) || isAdminRole(member);
  }

  function roleLabel(key) {
    const r = ROLES.find(x => x[0] === key);
    return r ? r[1] : (key || '—');
  }

  /** Jedna veta o tom, na čo ten človek má. */
  function describe(member) {
    if (!member) return 'Nie je pozvaný.';
    if (member.active === false) return 'Prístup je vypnutý.';
    if (member.role === 'admin') return 'Má prístup ku všetkému.';
    const own = (member.modules || []).filter(Boolean);
    const n = modulesOf(member).length;
    const zaklad = own.length ? `na mieru z roly ${roleLabel(member.role).toLowerCase()}`
      : roleLabel(member.role).toLowerCase();
    return `${zaklad} — ${n} ${n === 1 ? 'obrazovka' : (n < 5 ? 'obrazovky' : 'obrazoviek')}.`;
  }

  /** Moduly zoskupené na vykreslenie zaškrtávacích polí. */
  function grouped() {
    const out = [];
    for (const m of MODULES) {
      let g = out.find(x => x.label === m.group);
      if (!g) { g = { label: m.group, items: [] }; out.push(g); }
      g.items.push(m);
    }
    return out;
  }

  const API = {
    ROLES, MODULES, ADMIN_ONLY, PRESETS, ROUTE_POWER, ROUTE_ALIAS,
    bootstrap, modulesOf, can, keyOf, isAdmin, roleLabel, describe, grouped,
  };
  if (typeof window !== 'undefined') window.DanubraPerm = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
