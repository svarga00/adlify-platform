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
// Testy: node danubra/lib/tasks.test.js
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

  // ── Pravidlá ──────────────────────────────────────────────────────────────

  /**
   * Náhľad pravidla v ľudskej reči. Bez toho je riadok v tabuľke pravidiel
   * len súbor stĺpcov a nikto nevie, čo spraví.
   */
  function describeRule(rule = {}) {
    const what = {
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
    }[rule.source_table] || rule.source_table;

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
    return { ok: reasons.length === 0, reasons, warnings };
  }

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
    BUCKETS, PRIORITY_RANK,
    bucketOf, isActive, group, headline, counts,
    describeRule, reviewRule, addDays, plural,
  };
  window.DanubraTasks = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
