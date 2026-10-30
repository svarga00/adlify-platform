// ============================================================================
// DANUBRA — úlohy: čo dnes treba spraviť
// ============================================================================
// Dashboard nemá byť zoznam všetkého, ale zoznam toho, čo je dnes na rade.
// Zoznam, v ktorom je päťdesiat položiek, sa neprezerá — prezerá sa zoznam,
// v ktorom je päť.
//
// Preto sa úlohy triedia podľa toho, **čo horí**, nie podľa dátumu vzniku:
//
//   po splatnosti → dnes → tento týždeň → neskôr
//
// Odložená úloha zmizne a vráti sa sama, keď dôjde jej deň. Odloženie nie je
// zmazanie — to je rozdiel, ktorý sa v praxi pletie.
//
// Rovnaké pravidlá ako pohľad `danubra_v_today` (migrácia 021) — s jedným
// rozdielom: zrušená úloha tu aktívna nie je. Pohľad stav nevracia a zrušenú
// pustí ďalej; kým sa nezmení, počíta ju prehľad v odznaku pri „Úlohy".
//
// Testy: node app/lib/tasks.test.js
// ============================================================================
(function () {
  const day = (s) => (s ? String(s).slice(0, 10) : null);
  const today0 = () => new Date().toISOString().slice(0, 10);

  const BUCKETS = [
    ['overdue', 'Malo byť hotové', 'red'],
    ['today', 'Dnes', 'amber'],
    ['week', 'Tento týždeň', 'blue'],
    ['later', 'Neskôr', 'gray'],
  ];

  const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };

  /** Do ktorej skupiny úloha patrí. */
  function bucketOf(task, today = today0()) {
    const due = day(task && task.due_date);
    if (!due) return 'later';
    if (due < today) return 'overdue';
    if (due === today) return 'today';
    if (due <= addDays(today, 7)) return 'week';
    return 'later';
  }

  /**
   * Je úloha teraz viditeľná, alebo je odložená na neskôr? Vybavená ani
   * zrušená nie je — zrušená je vec, ktorú netreba robiť, a v zozname toho,
   * čo treba spraviť, nemá čo hľadať (nájde sa vo filtri „Zrušené").
   */
  function isActive(task, today = today0()) {
    if (!task || task.status === 'done' || task.status === 'cancelled') return false;
    const snooze = day(task.postponed_to);
    return !snooze || snooze <= today;
  }

  /**
   * Úlohy roztriedené a zoradené. Vnútri skupiny rozhoduje priorita, potom
   * dátum — nie poradie, v akom vznikli.
   *
   * @returns {Array} [{ key, label, tone, tasks }]
   */
  function group(tasks, today = today0()) {
    const active = (tasks || []).filter(t => isActive(t, today));
    const out = BUCKETS.map(([key, label, tone]) => ({ key, label, tone, tasks: [] }));
    const byKey = new Map(out.map(g => [g.key, g]));

    for (const t of active) {
      byKey.get(bucketOf(t, today)).tasks.push(t);
    }
    for (const g of out) {
      g.tasks.sort((a, b) =>
        (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2)
        || String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'))
        || String(a.title || '').localeCompare(String(b.title || ''), 'sk'));
    }
    return out.filter(g => g.tasks.length);
  }

  /**
   * Jedna veta na dashboard. Nie graf, nie počet — veta, z ktorej je jasné,
   * či treba niečo robiť.
   */
  function headline(tasks, today = today0()) {
    const active = (tasks || []).filter(t => isActive(t, today));
    if (!active.length) return { tone: 'ok', text: 'Nič nehorí. Dnes nie je čo doháňať.' };

    const overdue = active.filter(t => bucketOf(t, today) === 'overdue');
    const now = active.filter(t => bucketOf(t, today) === 'today');

    if (overdue.length) {
      return {
        tone: 'bad',
        text: `${overdue.length} ${plural(overdue.length, 'vec mala byť hotová', 'veci mali byť hotové', 'vecí malo byť hotových')}`
          + (now.length ? ` a ${now.length} ${plural(now.length, 'je', 'sú', 'je')} na dnes.` : '.'),
        count: overdue.length,
      };
    }
    if (now.length) {
      return {
        tone: 'warn',
        text: `${now.length} ${plural(now.length, 'vec je', 'veci sú', 'vecí je')} na dnes.`,
        count: now.length,
      };
    }
    const week = active.filter(t => bucketOf(t, today) === 'week');
    return {
      tone: 'ok',
      text: week.length
        ? `Dnes nič nehorí. Tento týždeň ${week.length} ${plural(week.length, 'vec', 'veci', 'vecí')}.`
        : 'Dnes nič nehorí.',
      count: 0,
    };
  }

  /** Počty do odznakov v navigácii. */
  function counts(tasks, today = today0()) {
    const active = (tasks || []).filter(t => isActive(t, today));
    const c = { total: active.length, overdue: 0, today: 0, week: 0, later: 0,
      snoozed: (tasks || []).filter(t => t && t.status !== 'done' && t.status !== 'cancelled'
        && !isActive(t, today)).length };
    for (const t of active) c[bucketOf(t, today)]++;
    return c;
  }

  /** Úloha bez mena. Nie je to prázdno — je to stav, ktorý treba vyriešiť. */
  const UNASSIGNED = '__nikto__';

  /**
   * Kto čo má na starosti. Bez tohto je zoznam dvadsiatich úloh stena,
   * z ktorej sa nedá prečítať, či na niekom visí všetko a na inom nič.
   *
   * Nepriradené je vlastný riadok a je prvé, keď niečo obsahuje: úloha, ktorú
   * nikto nemá, je horšia než úloha po termíne — tá aspoň niekoho tlačí.
   */
  function byPerson(tasks, today = today0()) {
    const map = new Map();
    for (const t of (tasks || [])) {
      if (!t || !isActive(t, today)) continue;
      const key = (t.assigned_name || '').trim() || UNASSIGNED;
      if (!map.has(key)) {
        map.set(key, { name: key, total: 0, overdue: 0, today: 0, week: 0, later: 0 });
      }
      const row = map.get(key);
      row.total++;
      row[bucketOf(t, today)]++;
    }
    return [...map.values()].sort((a, b) =>
      (a.name === UNASSIGNED ? -1 : 0) - (b.name === UNASSIGNED ? -1 : 0) ||
      b.overdue - a.overdue || b.total - a.total ||
      String(a.name).localeCompare(String(b.name), 'sk'));
  }

  /** Mená, ktoré sa dajú ponúknuť pri priraďovaní. Bez duplicít a prázdnych. */
  function people(tasks) {
    const set = new Set();
    for (const t of (tasks || [])) {
      const n = t && (t.assigned_name || '').trim();
      if (n) set.add(n);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'sk'));
  }

  /** Patrí úloha tomuto človeku? `UNASSIGNED` znamená „nikomu". */
  function isFor(task, name) {
    const has = ((task && task.assigned_name) || '').trim();
    return name === UNASSIGNED ? !has : has === name;
  }

  // ── Pravidlá ──────────────────────────────────────────────────────────────

  /**
   * Náhľad pravidla v ľudskej reči. Bez toho je riadok v tabuľke pravidiel
   * len súbor stĺpcov a nikto nevie, čo spraví.
   */
  /**
   * Čo ktorá tabuľka znamená po slovensky. Zoznam **povolených** tabuliek
   * dáva databáza (`danubra_rule_tables()` číta CHECK z migrácie 021) — toto
   * je len preklad. Keby bol zoznam aj tu, rozišiel by sa pri prvej zmene
   * a formulár by ponúkal tabuľku, ktorú databáza odmietne.
   */
  const RULE_TABLES = {
    danubra_worker_documents: 'doklad pracovníka',
    danubra_workers: 'pracovník',
    danubra_assignments: 'nasadenie',
    danubra_subcontracts: 'zákazka',
    danubra_contracts: 'zmluva',
    danubra_quotes: 'ponuka',
    danubra_invoices: 'faktúra',
    danubra_bills: 'prijatá faktúra',
    danubra_periods: 'obdobie',
    danubra_candidates: 'kandidát',
    danubra_crews: 'partia',
  };
  function tableLabel(t) { return RULE_TABLES[t] || t; }

  function describeRule(rule = {}) {
    const what = tableLabel(rule.source_table);

    const filters = Object.entries(rule.filter || {})
      .map(([k, v]) => `${k} = ${v}`).join(', ');
    const days = Number(rule.days_before) || 0;

    return {
      what,
      when: days === 0
        ? `keď nastane ${rule.date_field}`
        : `${days} ${plural(days, 'deň', 'dni', 'dní')} pred ${rule.date_field}`,
      filters: filters || null,
      example: String(rule.task_title_template || '')
        .replace('{label}', 'Ján Novák')
        .replace('{date}', '31.12.2026')
        .replace('{days}', '14'),
    };
  }

  /** Čo na pravidle nesedí. Kontroluje sa pred uložením. */
  function reviewRule(rule = {}) {
    const reasons = [], warnings = [];
    if (!String(rule.key || '').match(/^[a-z][a-z0-9_]{2,40}$/)) {
      reasons.push({
        rule: 'rule_bad_key', label: 'Kľúč pravidla je neplatný',
        detail: 'Malé písmená, číslice a podčiarkovníky, aspoň tri znaky.',
        severity: 'block',
      });
    }
    if (!rule.source_table || !rule.date_field) {
      reasons.push({
        rule: 'rule_no_source', label: 'Pravidlo nevie, čo má sledovať',
        detail: 'Vyberte tabuľku aj dátumový stĺpec.', severity: 'block',
      });
    }
    if (!String(rule.task_title_template || '').trim()) {
      reasons.push({
        rule: 'rule_no_title', label: 'Pravidlo nemá text úlohy',
        detail: 'Bez neho by vznikla úloha bez názvu.', severity: 'block',
      });
    }
    if (rule.task_title_template && !String(rule.task_title_template).includes('{')) {
      warnings.push({
        rule: 'rule_static_title', label: 'Text úlohy nepoužíva žiadny údaj',
        detail: 'Bez {label} alebo {date} budú všetky úlohy z tohto pravidla '
          + 'vyzerať rovnako a nepôjde ich rozlíšiť.', severity: 'warn',
      });
    }
    const days = Number(rule.days_before);
    if (days > 180) {
      warnings.push({
        rule: 'rule_far_ahead', label: `Upozornenie ${days} dní dopredu je ďaleko`,
        detail: 'Úloha, ktorá visí pol roka, sa prestane čítať.', severity: 'warn',
      });
    }

    // Motor skladá WHERE z kľúčov filtra. Databáza to kontroluje tiež
    // (migrácia 021), ale človek má vidieť, čo je zle, kým to píše — nie
    // dostať chybu z Postgresu po uložení.
    for (const k of Object.keys(rule.filter || {})) {
      if (!/^[a-z_]{2,40}$/.test(k)) {
        reasons.push({
          rule: 'rule_bad_filter', label: `Filter „${k}" nie je názov stĺpca`,
          detail: 'Malé písmená a podčiarkovníky, aspoň dva znaky.',
          severity: 'block',
        });
      }
    }
    if (!/^[a-z_]{3,40}$/.test(String(rule.date_field || 'xxx'))) {
      reasons.push({
        rule: 'rule_bad_date_field', label: 'Dátumový stĺpec nie je názov stĺpca',
        detail: 'Vyberte ho zo zoznamu, ktorý ponúka databáza.', severity: 'block',
      });
    }
    return { ok: reasons.length === 0, reasons, warnings };
  }

  /**
   * Čo sa dá napísať do textu úlohy. Je to zoznam pre človeka, nie pre kód —
   * preto je pri `{days}` napísané aj to nepríjemné: po termíne je záporný.
   */
  const RULE_VARS = [
    ['{label}', 'názov záznamu — meno, číslo faktúry, názov zákazky'],
    ['{date}', 'dátum, ktorý pravidlo sleduje'],
    ['{days}', 'koľko dní do neho zostáva; po termíne je to záporné číslo'],
  ];

  function addDays(d, n) {
    const t = new Date(day(d) + 'T00:00:00Z');
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  }

  function plural(n, one, few, many) {
    const a = Math.abs(Number(n) || 0);
    if (a === 1) return one;
    if (a >= 2 && a <= 4) return few;
    return many;
  }

  // ── Agenda podľa času ─────────────────────────────────────────────────────
  // Obrazovka Úlohy je zoznam po sekciách: čo je po termíne, čo je dnes,
  // zajtra, tento týždeň, neskôr a čo termín nemá. Prázdna sekcia sa nekreslí.

  const SECTIONS = [
    ['overdue', 'Po termíne', 'red'],
    ['today', 'Dnes', 'amber'],
    ['tomorrow', 'Zajtra', 'blue'],
    ['week', 'Tento týždeň', 'gray'],
    ['later', 'Neskôr', 'gray'],
    ['nodate', 'Bez termínu', 'gray'],
  ];

  /** Do ktorej sekcie agendy úloha patrí. „Tento týždeň" = najbližších 7 dní. */
  function sectionOf(task, today = today0()) {
    const due = day(task && task.due_date);
    if (!due) return 'nodate';
    if (due < today) return 'overdue';
    if (due === today) return 'today';
    if (due === addDays(today, 1)) return 'tomorrow';
    if (due <= addDays(today, 7)) return 'week';
    return 'later';
  }

  /**
   * Poradie v zozname. Predvolene priorita, potom termín — vysoká úloha
   * na piatok je pred bežnou na stredu. `nameOf(t)` dáva meno riešiteľa
   * pri zoradení podľa „Rieši".
   * @param {'prio'|'due'|'who'} key
   * @param {1|-1} dir
   */
  function sortTasks(tasks, key = 'prio', dir = 1, nameOf) {
    const prio = (t) => PRIORITY_RANK[t.priority] ?? 2;
    const due = (t) => String(day(t.due_date) || '9999-99-99');
    const who = (t) => {
      const n = String((nameOf ? nameOf(t) : t.assigned_name) || '').trim();
      return n ? n : '￿';               // nepriradené na koniec
    };
    const title = (a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'sk');
    const cmp = {
      prio: (a, b) => prio(a) - prio(b) || due(a).localeCompare(due(b)) || title(a, b),
      due: (a, b) => due(a).localeCompare(due(b)) || prio(a) - prio(b) || title(a, b),
      who: (a, b) => who(a).localeCompare(who(b), 'sk') || prio(a) - prio(b)
        || due(a).localeCompare(due(b)) || title(a, b),
    }[key] || ((a, b) => prio(a) - prio(b));
    return (tasks || []).filter(Boolean).slice().sort((a, b) => dir * cmp(a, b));
  }

  /**
   * Aktívne úlohy po sekciách. Prázdne sekcie vynechá.
   * @returns {Array} [{ key, label, tone, tasks }]
   */
  function agenda(tasks, today = today0(), o = {}) {
    const out = SECTIONS.map(([key, label, tone]) => ({ key, label, tone, tasks: [] }));
    const byKey = new Map(out.map(s => [s.key, s]));
    for (const t of (tasks || [])) {
      if (isActive(t, today)) byKey.get(sectionOf(t, today)).tasks.push(t);
    }
    for (const s of out) s.tasks = sortTasks(s.tasks, o.sort || 'prio', o.dir || 1, o.nameOf);
    return out.filter(s => s.tasks.length);
  }

  /** Súhrn nad zoznamom: po termíne, dnes, tento týždeň (zajtra + 7 dní). */
  function summary(tasks, today = today0()) {
    const c = { overdue: 0, today: 0, week: 0, later: 0, total: 0 };
    for (const t of (tasks || [])) {
      if (!isActive(t, today)) continue;
      c.total++;
      const s = sectionOf(t, today);
      if (s === 'overdue') c.overdue++;
      else if (s === 'today') c.today++;
      else if (s === 'tomorrow' || s === 'week') c.week++;
      else c.later++;
    }
    return c;
  }

  /** Hotové za posledných `days` dní, najčerstvejšie navrchu. */
  function recentDone(tasks, today = today0(), days = 7) {
    const from = addDays(today, -days);
    return (tasks || [])
      .filter(t => t && t.status === 'done' && day(t.done_at) && day(t.done_at) >= from)
      .sort((a, b) => String(b.done_at).localeCompare(String(a.done_at)));
  }

  // ── Termín po ľudsky ──────────────────────────────────────────────────────
  const IN_DAY = ['v nedeľu', 'v pondelok', 'v utorok', 'v stredu', 'vo štvrtok', 'v piatok', 'v sobotu'];

  function weekday(d) { return new Date(day(d) + 'T00:00:00Z').getUTCDay(); }
  function daysBetween(a, b) {
    return Math.round((Date.parse(day(b) + 'T00:00:00Z') - Date.parse(day(a) + 'T00:00:00Z')) / 86400000);
  }

  /**
   * „pred 6 dňami", „včera", „dnes", „zajtra", „v piatok", „o 12 dní".
   * Ďalej než dva mesiace je to už dátum — „o 143 dní" nikto neprepočíta.
   * @returns {{ text: string, tone: 'late'|'today'|'soon'|''|'none', days: number|null }}
   */
  function relDue(due, today = today0()) {
    const d = day(due);
    if (!d) return { text: 'bez termínu', tone: 'none', days: null };
    const n = daysBetween(today, d);
    if (n < -1) return { text: `pred ${-n} dňami`, tone: 'late', days: n };
    if (n === -1) return { text: 'včera', tone: 'late', days: n };
    if (n === 0) return { text: 'dnes', tone: 'today', days: 0 };
    if (n === 1) return { text: 'zajtra', tone: 'soon', days: 1 };
    if (n <= 6) return { text: IN_DAY[weekday(d)], tone: 'soon', days: n };
    if (n <= 60) return { text: `o ${n} ${plural(n, 'deň', 'dni', 'dní')}`, tone: '', days: n };
    const [y, m, dd] = d.split('-');
    return { text: `${Number(dd)}. ${Number(m)}. ${y}`, tone: '', days: n };
  }

  // ── Odloženie ─────────────────────────────────────────────────────────────
  /**
   * Na kedy sa úloha odloží. Posúva sa od pôvodného termínu, keď je ešte pred
   * nami; inak od dneška — úloha po termíne odložená „o deň" je na zajtra,
   * nie na deň po starom termíne.
   * @param {'1d'|'3d'|'week'|'monday'} kind
   */
  function snoozeDate(task, kind = 'week', today = today0()) {
    const due = day(task && task.due_date);
    const base = due && due > today ? due : today;
    if (kind === '1d') return addDays(base, 1);
    if (kind === '3d') return addDays(base, 3);
    if (kind === 'monday') {
      const n = (8 - weekday(today)) % 7 || 7;
      return addDays(today, n);
    }
    return addDays(base, 7);
  }

  // ── Rýchle zapísanie ──────────────────────────────────────────────────────
  // „Zavolať Hofmannovi zajtra !" → úloha na zajtra s vysokou prioritou.
  // Rozpoznáva sa málo a naisto: dnes, zajtra, pozajtra, dni v týždni
  // (aj „do piatku", „v stredu") a výkričník. Nič iné sa z textu neberie.

  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const DAY_WORDS = {
    pondelok: 1, pondelka: 1, utorok: 2, utorka: 2, streda: 3, stredu: 3, stredy: 3,
    stvrtok: 4, stvrtka: 4, piatok: 5, piatku: 5, sobota: 6, sobotu: 6, soboty: 6,
    nedela: 0, nedelu: 0, nedele: 0,
  };
  const PREPS = new Set(['v', 'vo', 'do', 'na', 'cez']);
  const QUICK_HELP = 'Napíšte, čo treba spraviť, a stlačte Enter. Úloha sa priradí Vám '
    + 's termínom dnes. Termín sa dá napísať rovno do textu: „dnes", „zajtra", '
    + '„pozajtra" alebo deň v týždni („v piatok", „do stredy" = najbližší taký deň). '
    + 'Výkričník „!" znamená vysokú prioritu. Všetko ostatné nastavíte cez „Viac…".';

  /**
   * @returns {{ title: string, due_date: string, priority: 'high'|'normal',
   *             when: string|null, high: boolean }}
   *   `when` je slovo, z ktorého sa vzal termín (null = predvolený dnešok).
   */
  function parseQuick(text, today = today0()) {
    let high = false;
    const tokens = String(text || '').trim().split(/\s+/).filter(Boolean)
      .map((w) => {
        if (/!/.test(w) && /^[^!]*!+$/.test(w)) { high = true; return w.replace(/!+$/, ''); }
        return w;
      })
      .filter(Boolean);

    let due = null, when = null;
    for (let i = 0; i < tokens.length && !due; i++) {
      const w = fold(tokens[i]).replace(/[.,;:]+$/, '');
      let d = null;
      if (w === 'dnes') d = today;
      else if (w === 'zajtra') d = addDays(today, 1);
      else if (w === 'pozajtra') d = addDays(today, 2);
      else if (w in DAY_WORDS) d = addDays(today, ((DAY_WORDS[w] - weekday(today) + 7) % 7) || 7);
      if (!d) continue;
      due = d;
      const from = i > 0 && PREPS.has(fold(tokens[i - 1])) ? i - 1 : i;
      when = tokens.slice(from, i + 1).join(' ').replace(/[.,;:]+$/, '');
      tokens.splice(from, i - from + 1);
    }
    const title = tokens.join(' ').replace(/\s+([.,;:])/g, '$1').replace(/[\s,;:–—-]+$/, '').trim();
    return { title, due_date: due || today, priority: high ? 'high' : 'normal', when, high };
  }

  // ── Ľudia = členovia appky ────────────────────────────────────────────────
  // Kto môže mať úlohu na starosti, je zoznam používateľov (danubra_members),
  // nie mená, ktoré sa kedysi ručne napísali do úloh. Úloha si meno pamätá
  // v `assigned_name` (tak ho píšu aj pravidlá) a pri priradení aj `assigned_to`.

  function memberName(m) { return String((m && (m.full_name || m.email)) || '').trim(); }

  /**
   * Člen k menu z úlohy. Presná zhoda, inak krstné meno („Štefan" →
   * „Štefan Varga") — ale len keď je v appke jediný taký Štefan.
   */
  function findMember(name, members) {
    const n = fold(name).trim();
    if (!n) return null;
    const list = (members || []).filter(Boolean);
    const exact = list.find(m => fold(memberName(m)) === n
      || (m.email && fold(m.email) === n));
    if (exact) return exact;
    const first = list.filter(m => fold(memberName(m)).split(/\s+/)[0] === n);
    return first.length === 1 ? first[0] : null;
  }

  /**
   * Kto úlohu rieši.
   * @returns {{ kind: 'member'|'outside'|'none', name: string, member: Object|null }}
   *   `outside` = meno v úlohe, ktoré nie je medzi používateľmi appky.
   */
  function ownerOf(task, members) {
    const raw = String((task && task.assigned_name) || '').trim();
    if (raw) {
      const m = findMember(raw, members);
      return m ? { kind: 'member', name: memberName(m), member: m }
        : { kind: 'outside', name: raw, member: null };
    }
    const uid = task && task.assigned_to;
    const m = uid ? (members || []).find(x => x && x.user_id === uid) : null;
    return m ? { kind: 'member', name: memberName(m), member: m } : { kind: 'none', name: '', member: null };
  }

  /**
   * Patrí úloha do zvoleného rozsahu?
   * @param {string} scope  'all' | 'none' | 'm:<id člena>' | 'x:<meno mimo appky>'
   */
  function inScope(task, scope, members) {
    if (!scope || scope === 'all') return true;
    const o = ownerOf(task, members);
    if (scope === 'none') return o.kind === 'none';
    if (scope.startsWith('m:')) return o.kind === 'member' && String(o.member.id) === scope.slice(2);
    if (scope.startsWith('x:')) return o.kind === 'outside' && o.name === scope.slice(2);
    return true;
  }

  /** Mená v úlohách, ktoré nepatria nikomu z appky (staré dáta). */
  function outsideNames(tasks, members) {
    const set = new Set();
    for (const t of (tasks || [])) {
      const o = ownerOf(t, members);
      if (o.kind === 'outside') set.add(o.name);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'sk'));
  }

  /** Čo zapísať do úlohy pri priradení členovi (null = nikomu). */
  function assignPatch(member) {
    if (!member) return { assigned_name: null, assigned_to: null };
    return { assigned_name: memberName(member) || null, assigned_to: member.user_id || null };
  }

  /** Iniciály do krúžku: „Štefan Varga" → „ŠV". */
  function initials(name) {
    const w = String(name || '').trim().split(/[\s@.]+/).filter(Boolean);
    return w.slice(0, 2).map(x => x[0]).join('').toUpperCase();
  }

  const API = {
    BUCKETS, SECTIONS, PRIORITY_RANK, UNASSIGNED, RULE_TABLES, RULE_VARS, QUICK_HELP,
    bucketOf, isActive, group, headline, counts, byPerson, people, isFor,
    sectionOf, sortTasks, agenda, summary, recentDone, relDue, snoozeDate, parseQuick,
    memberName, findMember, ownerOf, inScope, outsideNames, assignPatch, initials,
    describeRule, reviewRule, tableLabel, addDays, plural,
  };
  window.DanubraTasks = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
