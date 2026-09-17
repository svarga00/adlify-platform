// ============================================================================
// DANUBRA — doklady živnostníka: platnosť, pripravenosť, blokátory
// ============================================================================
// Odpovedá na tri otázky, ktoré sa v praxi pýtajú stále:
//
//   1. Je tento doklad platný, a ako dlho ešte?
//   2. Smie tento človek ísť na túto stavbu?
//   3. Môžeme od neho prijať faktúru?
//
// Kľúče blokátorov sú tie isté, aké sú zasiate v `danubra_enums` ako
// `override_rule` (migrácia 013). Vďaka tomu blokátor, zapísaná výnimka
// a číselník hovoria tým istým jazykom a dá sa dohľadať, ktoré pravidlo
// sa obchádza najčastejšie.
//
// Čistá logika, žiadny prístup do databázy. Vstupy sa vkladajú.
//
// Testy: node danubra/lib/staffing/documents.test.js
// ============================================================================
(function () {
  const day = (s) => (s ? String(s).slice(0, 10) : null);
  const today0 = () => new Date().toISOString().slice(0, 10);
  const daysBetween = (a, b) =>
    Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);

  // ── Koľko dopredu upozorniť ───────────────────────────────────────────────
  // Nie je to kozmetika. A1 vystavuje Sociálna poisťovňa a trvá to až 45 dní;
  // upozornenie tridsať dní dopredu je vtedy neskoro. Hodnoty sedia s tým,
  // čo migrácia 014 nastavila v databáze.
  const HORIZON = {
    a1: 60,
    id_card: 90,
    passport: 90,
    trade_licence: 60,
    medical: 14,
    certificate: 30,
    insurance: 30,
    contract: 30,
  };
  const HORIZON_DEFAULT = 30;

  function horizonOf(doc) {
    if (doc && doc.notify_days_before != null) return Number(doc.notify_days_before);
    return HORIZON[doc && doc.kind] || HORIZON_DEFAULT;
  }

  // ── Čo je kde povinné ─────────────────────────────────────────────────────
  // `blocks: true` znamená, že bez toho sa nenasadzuje. Ostatné je
  // upozornenie — vidieť to treba, ale nezastavuje to prácu.
  //
  // Dielenské práce majú výrazne nižšiu reguláciu než stavba, preto ich
  // biznis plán odporúča ako vstupný segment.
  // `rule` platí, keď doklad chýba alebo ešte neplatí. Expirovaný doklad má
  // vždy `expired_document` — je to iný problém a rieši sa inak (obnoviť,
  // nie vybaviť od začiatku).
  const REQUIRED = {
    assignment: [
      { kind: 'id_card', rule: 'missing_document', blocks: true,
        label: 'Doklad totožnosti', why: 'Bez neho sa človek na stavbu nedostane.',
        alt: ['passport'] },
      { kind: 'trade_licence', rule: 'missing_trade_licence', blocks: true,
        label: 'Živnostenský list', why: 'Bez nej to nie je subdodávka, ale zamestnávanie.' },
      { kind: 'contract', rule: 'missing_contract', blocks: true,
        label: 'Zmluva o dielo', why: 'Dielo, nie hodiny — inak hrozí skrytá Arbeitnehmerüberlassung.' },
      { kind: 'insurance', rule: 'missing_document', blocks: false,
        label: 'Poistenie', why: 'Betriebshaftpflicht žiada väčšina nemeckých generálov.' },
    ],
    construction: [
      { kind: 'a1', rule: 'missing_a1', blocks: true,
        label: 'Formulár A1', why: 'Pri kontrole Zoll hrozí pokuta. Vybaviť trvá až 45 dní.' },
      { kind: 'medical', rule: 'missing_document', blocks: false,
        label: 'Zdravotná prehliadka', why: 'Na väčších stavbách ju kontrolujú pri vstupe.' },
    ],
    workshop: [
      { kind: 'a1', rule: 'missing_a1', blocks: true,
        label: 'Formulár A1', why: 'Platí aj pri dielenských prácach.' },
    ],
    regulated: [
      { kind: 'certificate', rule: 'missing_hwo', blocks: true,
        label: 'Doklad o odbornosti', why: 'Regulované remeslo žiada oznámenie §9 HwO.' },
    ],
  };

  /** Kontexty pre daného človeka a zákazku. Stavba pridáva k nasadeniu. */
  function contextsFor({ workType = 'construction', regulated = false } = {}) {
    const out = ['assignment'];
    out.push(workType === 'workshop' ? 'workshop' : 'construction');
    if (regulated) out.push('regulated');
    return out;
  }

  /** Všetky požiadavky pre dané kontexty, bez duplikátov podľa druhu. */
  function requirementsFor(contexts) {
    const seen = new Map();
    for (const ctx of (contexts || [])) {
      for (const req of (REQUIRED[ctx] || [])) {
        // Ak ten istý doklad blokuje v jednom kontexte a v druhom nie,
        // rozhoduje ten striktnejší — inak by sa dala požiadavka obísť
        // zmenou typu prác.
        const prev = seen.get(req.kind);
        if (!prev || (req.blocks && !prev.blocks)) seen.set(req.kind, { ...req, context: ctx });
      }
    }
    return [...seen.values()];
  }

  // ── Platnosť jedného dokladu ──────────────────────────────────────────────

  /**
   * @returns {'missing'|'not_yet'|'valid'|'expiring'|'expired'}
   */
  function state(doc, today = today0()) {
    if (!doc) return 'missing';
    const from = day(doc.valid_from), to = day(doc.valid_to);
    if (from && from > today) return 'not_yet';
    if (!to) return 'valid';                     // bez konca platnosti
    if (to < today) return 'expired';
    if (daysBetween(today, to) <= horizonOf(doc)) return 'expiring';
    return 'valid';
  }

  /** Koľko dní platnosti zostáva. `null` pri doklade bez konca. */
  function daysLeft(doc, today = today0()) {
    const to = doc && day(doc.valid_to);
    return to ? daysBetween(today, to) : null;
  }

  /** Doklad so stavom a dňami — to, čo chce vykresliť UI. */
  function describe(doc, today = today0()) {
    const st = state(doc, today);
    return { doc, kind: doc && doc.kind, state: st, daysLeft: daysLeft(doc, today),
      horizon: horizonOf(doc) };
  }

  /**
   * Najlepší doklad daného druhu. Keď má človek dva živnostenské listy,
   * rozhoduje ten, ktorý platí najdlhšie — nie ten, čo bol nahraný naposledy.
   */
  function best(docs, kind, today = today0()) {
    const rank = { valid: 4, expiring: 3, not_yet: 2, expired: 1, missing: 0 };
    let pick = null, pickRank = -1, pickTo = null;
    for (const d of (docs || [])) {
      if (!d || d.kind !== kind) continue;
      const st = state(d, today);
      const r = rank[st] || 0;
      const to = day(d.valid_to) || '9999-12-31';
      if (r > pickRank || (r === pickRank && to > pickTo)) {
        pick = d; pickRank = r; pickTo = to;
      }
    }
    return pick;
  }

  /** Doklady podľa druhu, každý so stavom. Na výpis v kartotéke. */
  function byKind(docs, today = today0()) {
    const out = {};
    for (const d of (docs || [])) {
      if (!d || !d.kind) continue;
      (out[d.kind] = out[d.kind] || []).push(describe(d, today));
    }
    for (const list of Object.values(out)) {
      list.sort((a, b) => String(b.doc.valid_to || '9999').localeCompare(String(a.doc.valid_to || '9999')));
    }
    return out;
  }

  // ── Pripravenosť človeka na nasadenie ─────────────────────────────────────

  /**
   * @param {Object} o
   *   docs      doklady daného človeka
   *   workType  'construction' | 'workshop'
   *   regulated regulované remeslo podľa §9 HwO
   *   today
   * @returns {{ ok:boolean, reasons:Array, warnings:Array, ready:Array, items:Array }}
   *   `reasons` ide priamo do Shell.blocker; `rule` sedí s override_rule.
   */
  function readiness(o = {}) {
    const today = o.today || today0();
    const reqs = requirementsFor(contextsFor(o));
    const reasons = [], warnings = [], ready = [], items = [];

    for (const req of reqs) {
      // Pas nahrádza občiansky a naopak — to isté právne postavenie.
      const kinds = [req.kind, ...(req.alt || [])];
      let doc = null, st = 'missing';
      for (const k of kinds) {
        const cand = best(o.docs, k, today);
        const cs = state(cand, today);
        if (!doc || rankOf(cs) > rankOf(st)) { doc = cand; st = cs; }
      }

      const item = { ...req, doc, state: st, daysLeft: daysLeft(doc, today) };
      items.push(item);

      if (st === 'valid') { ready.push(item); continue; }

      // Chýbajúci a expirovaný doklad sú dva rôzne problémy a človek
      // s nimi robí dve rôzne veci: jeden treba vybaviť, druhý obnoviť.
      const rule = st === 'expired' ? 'expired_document' : req.rule;

      const entry = {
        rule,
        label: st === 'missing' ? `Chýba: ${req.label}`
          : st === 'expired' ? `Expiroval: ${req.label}`
          : st === 'not_yet' ? `Zatiaľ neplatí: ${req.label}`
          : `Blíži sa koniec: ${req.label}`,
        detail: st === 'expiring'
          ? `Platí ešte ${item.daysLeft} ${plural(item.daysLeft, 'deň', 'dni', 'dní')}. ${req.why}`
          : req.why,
        severity: (req.blocks && st !== 'expiring') ? 'block' : 'warn',
        kind: req.kind, state: st,
      };
      (entry.severity === 'block' ? reasons : warnings).push(entry);
    }

    return { ok: reasons.length === 0, reasons, warnings, ready, items };
  }

  function rankOf(st) {
    return { valid: 4, expiring: 3, not_yet: 2, expired: 1, missing: 0 }[st] || 0;
  }

  function plural(n, one, few, many) {
    const a = Math.abs(Number(n) || 0);
    if (a === 1) return one;
    if (a >= 2 && a <= 4) return few;
    return many;
  }

  // ── Môžeme od neho prijať faktúru? ────────────────────────────────────────
  // Iná otázka než nasadenie a v praxi sa na ňu zabúda: človek odrobí mesiac
  // a potom sa zistí, že nevieme, na koho faktúru zaúčtovať.

  const BILLING_FIELDS = [
    ['company_name', 'Meno na živnosti', true],
    ['company_id', 'IČO', true],
    ['bank_iban', 'IBAN', true],
    ['business_address', 'Adresa podnikania', true],
    ['business_city', 'Mesto', true],
    ['tax_id', 'DIČ', false],
  ];

  /**
   * @returns {{ ok:boolean, missing:Array, reasons:Array, warnings:Array }}
   */
  function billingReady(worker = {}) {
    const missing = [], reasons = [], warnings = [];
    for (const [field, label, required] of BILLING_FIELDS) {
      const v = worker[field];
      if (v !== null && v !== undefined && String(v).trim() !== '') continue;
      missing.push({ field, label, required });
      const entry = {
        rule: 'missing_billing_data', label: `Chýba: ${label}`,
        detail: 'Bez toho sa jeho faktúra nedá zaúčtovať ani zapísať do SuperFaktúry.',
        severity: required ? 'block' : 'warn', field,
      };
      (required ? reasons : warnings).push(entry);
    }
    // Platiteľ DPH bez IČ DPH je rozpor — na faktúre má byť DPH, ale nie je
    // čím ju identifikovať.
    if (worker.vat_payer && !String(worker.vat_id || '').trim()) {
      reasons.push({
        rule: 'missing_billing_data', label: 'Platiteľ DPH bez IČ DPH',
        detail: 'Buď doplň IČ DPH, alebo zruš príznak platiteľa.', severity: 'block',
        field: 'vat_id',
      });
    }
    return { ok: reasons.length === 0, missing, reasons, warnings };
  }

  // ── Čo treba riešiť naprieč kartotékou ────────────────────────────────────

  /**
   * Doklady, ktoré expirovali alebo sa im blíži koniec, najurgentnejšie prvé.
   * Toto je vstup pre dashboard a pre úlohy vo F9.
   */
  function attention(docs, today = today0()) {
    return (docs || [])
      .map(d => describe(d, today))
      .filter(x => x.state === 'expired' || x.state === 'expiring')
      .sort((a, b) => {
        if (a.state !== b.state) return a.state === 'expired' ? -1 : 1;
        return (a.daysLeft ?? 0) - (b.daysLeft ?? 0);
      });
  }

  const API = {
    state, daysLeft, describe, best, byKind, horizonOf,
    contextsFor, requirementsFor, readiness,
    billingReady, attention,
    HORIZON, HORIZON_DEFAULT, REQUIRED, BILLING_FIELDS,
  };
  window.DanubraDocs = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
