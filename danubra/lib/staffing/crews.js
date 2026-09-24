// ============================================================================
// DANUBRA — partie
// ============================================================================
// Partia je organizačná skupina, nie právny subjekt. Chodia spolu, ale
// **každý živnostník fakturuje sám za seba** (rozhodnutie R5). Jedna spoločná
// faktúra za skupinu ľudí by pri kontrole vyzerala ako zamestnávanie alebo
// ako skrytá Arbeitnehmerüberlassung — presne to riziko, pred ktorým appka
// inak varuje. Preto je to tu pravidlo, nie odporúčanie.
//
// Členstvo má trvanie. „Kto je v partii" je vždy otázka ku dňu, nie
// k prítomnosti — inak sa spätne nedá povedať, kto na ktorej stavbe bol.
//
// Čistá logika, žiadny prístup do databázy.
//
// Testy: node danubra/lib/staffing/crews.test.js
// ============================================================================
(function () {
  const day = (s) => (s ? String(s).slice(0, 10) : null);
  const today0 = () => new Date().toISOString().slice(0, 10);

  // ── Kto je v partii ───────────────────────────────────────────────────────

  /**
   * Členovia k danému dňu. Bez dátumu znamená dnes.
   * Zohľadňuje `joined_at` aj `left_at`, takže sa dá pozrieť aj do minulosti.
   */
  function membersOn(members, date = today0()) {
    const d = day(date);
    return (members || []).filter(m => {
      if (!m) return false;
      const from = day(m.joined_at);
      const to = day(m.left_at);
      if (from && from > d) return false;
      if (to && to <= d) return false;      // deň odchodu už do partie nepatrí
      return true;
    });
  }

  /** Aktívni členovia — tí, ktorí neodišli. */
  function activeMembers(members) {
    return (members || []).filter(m => m && !m.left_at);
  }

  function leaderOf(members) {
    return activeMembers(members).find(m => m.role === 'leader') || null;
  }

  /**
   * Bol tento človek v partii v danom období? Používa sa pri nasadení,
   * aby sa hodiny nepripísali niekomu, kto vtedy v partii nebol.
   */
  function wasMember(members, workerId, from, to) {
    const f = day(from), t = day(to || from);
    return (members || []).some(m => {
      if (!m || m.worker_id !== workerId) return false;
      const mf = day(m.joined_at) || '0000-01-01';
      const mt = day(m.left_at) || '9999-12-31';
      return mf <= t && mt >= f;            // prekryv období
    });
  }

  // ── Zloženie partie ───────────────────────────────────────────────────────

  /**
   * Čo na partii nesedí. Nie je to blokátor — partia sa dá nasadiť aj bez
   * predáka — ale človek to má vidieť skôr, než ju pošle na stavbu.
   *
   * @param {Object} o { crew, members, workers, today }
   * @returns {{ ok:boolean, reasons:Array, warnings:Array, size:number }}
   */
  function review(o = {}) {
    const crew = o.crew || {};
    const active = activeMembers(o.members);
    const byId = new Map((o.workers || []).map(w => [w.id, w]));
    const reasons = [], warnings = [];

    if (active.length === 0) {
      reasons.push({
        rule: 'crew_empty', label: 'Partia nemá členov',
        detail: 'Prázdnu partiu nemá zmysel nasadzovať.', severity: 'block',
      });
    }

    const leaders = active.filter(m => m.role === 'leader');
    if (active.length && leaders.length === 0) {
      warnings.push({
        rule: 'crew_no_leader', label: 'Partia nemá predáka',
        detail: 'Na stavbe treba jedného človeka, s ktorým sa dá hovoriť.',
        severity: 'warn',
      });
    }
    if (leaders.length > 1) {
      // Databáza to drží triggerom, ale dáta mohli vzniknúť aj inak.
      reasons.push({
        rule: 'crew_two_leaders', label: `Partia má ${leaders.length} predákov`,
        detail: 'Predák je vždy jeden.', severity: 'block',
      });
    }
    if (crew.leader_worker_id && !active.some(m => m.worker_id === crew.leader_worker_id)) {
      reasons.push({
        rule: 'crew_leader_not_member', label: 'Predák nie je členom partie',
        detail: 'Buď ho pridaj medzi členov, alebo zvoľ iného predáka.',
        severity: 'block',
      });
    }

    // Praktické veci, ktoré sa na stavbe ukážu až neskoro.
    const workersOf = active.map(m => byId.get(m.worker_id)).filter(Boolean);
    if (workersOf.length) {
      const speaksGerman = workersOf.some(w =>
        w.german_level && !['ziadny', 'none', ''].includes(String(w.german_level)));
      if (!speaksGerman) {
        warnings.push({
          rule: 'crew_no_german', label: 'V partii nikto nehovorí po nemecky',
          detail: 'Na stavbe sa bude komunikovať cez teba pri každej maličkosti.',
          severity: 'warn',
        });
      }
      if (!workersOf.some(w => w.driving_licence)) {
        warnings.push({
          rule: 'crew_no_driver', label: 'V partii nikto nemá vodičský preukaz',
          detail: 'Treba vyriešiť dopravu na stavbu a z ubytovania.',
          severity: 'warn',
        });
      }
      // Živnostníci — partia zamestnancov by bola iný právny režim.
      const employees = workersOf.filter(w => w.legal_form && w.legal_form !== 'szco');
      if (employees.length) {
        warnings.push({
          rule: 'crew_mixed_forms',
          label: `V partii ${employees.length} ${plural(employees.length, 'človek nie je živnostník', 'ľudia nie sú živnostníci', 'ľudí nie je živnostníkov')}`,
          detail: 'Zamestnanec a subdodávateľ majú iný právny režim. Nemiešaj ich v jednej partii.',
          severity: 'warn',
        });
      }
    }

    if (crew.usual_size && active.length && active.length < crew.usual_size) {
      warnings.push({
        rule: 'crew_undersized',
        label: `Partia je neúplná — ${active.length} z ${crew.usual_size}`,
        detail: 'Odberateľ čaká obvyklý počet ľudí.', severity: 'warn',
      });
    }

    return { ok: reasons.length === 0, reasons, warnings, size: active.length };
  }

  // ── Fakturácia: R5 ────────────────────────────────────────────────────────

  /**
   * Ako sa za partiu fakturuje. Odpoveď je vždy tá istá — po jednom — ale
   * funkcia existuje preto, aby UI nemalo kde ponúknuť spoločnú faktúru,
   * a aby bolo kde vysvetliť prečo.
   *
   * @returns {{ perMember:boolean, lines:Array, note:string }}
   */
  function invoicePlan(o = {}) {
    const active = activeMembers(o.members);
    const byId = new Map((o.workers || []).map(w => [w.id, w]));
    const lines = active.map(m => {
      const w = byId.get(m.worker_id) || {};
      return {
        worker_id: m.worker_id,
        name: w.full_name || '(neznámy)',
        company_name: w.company_name || w.full_name || null,
        company_id: w.company_id || null,
        rate: w.hourly_cost ?? null,
        ready: !!(w.company_id && w.bank_iban),
      };
    });
    return {
      perMember: true,
      lines,
      note: 'Každý člen partie fakturuje sám za seba. Jedna spoločná faktúra '
        + 'za skupinu ľudí by pri kontrole vyzerala ako zamestnávanie alebo '
        + 'ako skrytá Arbeitnehmerüberlassung.',
    };
  }

  /** Kto z partie ešte nemá čím fakturovať. Vstup pre blokátor nasadenia. */
  function billingGaps(o = {}) {
    return invoicePlan(o).lines.filter(l => !l.ready);
  }

  function plural(n, one, few, many) {
    const a = Math.abs(Number(n) || 0);
    if (a === 1) return one;
    if (a >= 2 && a <= 4) return few;
    return many;
  }

  const API = {
    membersOn, activeMembers, leaderOf, wasMember,
    review, invoicePlan, billingGaps, plural,
  };
  window.DanubraCrews = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
