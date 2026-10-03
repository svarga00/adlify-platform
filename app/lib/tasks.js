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
// Rovnaké pravidlá ako pohľad `danubra_v_today` (migrácia 021).
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

  /** Je úloha teraz viditeľná, alebo je odložená na neskôr? */
  function isActive(task, today = today0()) {
    if (!task || task.status === 'done') return false;
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
      snoozed: (tasks || []).filter(t => t && t.status !== 'done' && !isActive(t, today)).length };
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
        detail: 'Vyber tabuľku aj dátumový stĺpec.', severity: 'block',
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
        detail: 'Vyber ho zo zoznamu, ktorý ponúka databáza.', severity: 'block',
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

  const API = {
    BUCKETS, PRIORITY_RANK, UNASSIGNED, RULE_TABLES, RULE_VARS,
    bucketOf, isActive, group, headline, counts, byPerson, people, isFor,
    describeRule, reviewRule, tableLabel, addDays, plural,
  };
  window.DanubraTasks = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
