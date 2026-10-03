// ============================================================================
// DANUBRA — checklist pred nasadením
// ============================================================================
// Čo musí byť hotové, kým človek nastúpi na stavbu. Deväť bodov, ktoré sa
// v1 vypisovali ako voľný text a **odškrtávali rukou**.
//
// Ručné odškrtávanie je pri väčšine z nich horšie než žiadny checklist.
// „Platné A1" sa dá odškrtnúť aj vtedy, keď A1 v kartotéke nie je — a potom
// má appka dve odpovede na tú istú otázku a tá nesprávna je tá, ktorá svieti
// nazeleno. Presne to sa stalo s obsadenosťou ubytovaní, kde bolo ručne
// vypísané číslo: rozišlo sa s realitou hneď, ako niekto odišiel.
//
// Preto sa tu odškrtáva **len to, čo appka vedieť nemôže**. Zvyšok sa číta
// z toho, čo už v systéme je:
//
//   doklady        z kartotéky (rovnaké kľúče pravidiel ako blokátor)
//   §48b a Zoll    zo zákazky
//   ubytovanie     z pobytov — z toho, kto kde býva
//   doprava        zo zákazky
//   pokyny         toto vie len človek, ktorý ich odovzdal
//
// Jediný ručný bod je ten posledný. Zapisuje sa do `danubra_assignment_checks`
// (migrácia 017), ktorá ho viaže na kľúč — nie na voľný text, ktorý sa pri
// preklepe rozdvojí.
//
// Testy: node app/lib/staffing/checks.test.js
// ============================================================================
(function () {
  const day = (s) => (s ? String(s).slice(0, 10) : null);

  /**
   * `source` hovorí, odkiaľ sa odpoveď berie — a tým aj to, či sa dá
   * odškrtnúť. Odškrtnúť sa dá jedine `manual`.
   *
   * `onlyIf` vynechá bod, ktorý na daný prípad nesedí. Vynechať je lepšie
   * než ukazovať ho ako nesplnený: §9 HwO pri maliarovi nikto nevybaví
   * a večne oranžový bod sa po týždni prestane čítať.
   */
  const CHECKS = [
    // Živnostenský list bol v deviatich bodoch z v1 **vynechaný**, hoci je
    // z nich najdôležitejší: bez neho to nie je subdodávka, ale zamestnávanie
    // — s odvodmi dozadu. Chytil to test, ktorý porovnáva body checklistu
    // s pravidlami blokátora.
    { key: 'trade_licence', title: 'Živnostenský list', required: true,
      source: 'doc', rule: 'missing_trade_licence',
      why: 'Bez nej to nie je subdodávka, ale zamestnávanie. Overiteľné '
        + 'v zrsr.sk alebo rzp.cz.' },
    { key: 'contract', title: 'Podpísaná zmluva o dielo', required: true,
      source: 'doc', rule: 'missing_contract',
      why: 'Werkvertrag s definovaným dielom, nie hodinami. Bez nej hrozí '
        + 'preklasifikovanie na prenájom pracovnej sily.' },
    { key: 'id', title: 'Doklad totožnosti', required: true,
      source: 'doc', rule: 'missing_document',
      why: 'Bez neho sa človek na stavbu nedostane ani pri vstupe.' },
    { key: 'a1', title: 'Platné A1', required: true,
      source: 'doc', rule: 'missing_a1',
      why: 'Vystavuje Sociálna poisťovňa, trvá až 45 dní. Pri kontrole Zoll '
        + 'hrozí pokuta.' },
    { key: 'hwo', title: 'Doklad o odbornosti (§9 HwO)', required: true,
      source: 'doc', rule: 'missing_hwo', onlyIf: 'regulated',
      why: 'Len pri regulovanom remesle — napríklad elektrikár. '
        + 'Bez oznámenia Handwerkskammer je výkon remesla neoprávnený.' },
    { key: 'freistellung', title: 'Freistellungsbescheinigung §48b', required: false,
      source: 'subcontract', field: 'freistellung_verified',
      why: 'Bez nej odberateľ zrazí 15 % z faktúry a odvedie ich nemeckému '
        + 'úradu. Neblokuje nástup, ale mení to, koľko príde na účet.' },
    { key: 'zoll', title: 'Hlásenie Zoll pred začiatkom prác', required: true,
      source: 'subcontract', field: 'zoll_reported_at', onlyIf: 'construction',
      why: 'Stavebné práce sa hlásia na meldeportal-mindestlohn.de **pred** '
        + 'začiatkom, nie po kontrole.' },
    { key: 'lodging', title: 'Zabezpečené ubytovanie', required: true,
      source: 'stay',
      why: 'Adresa, kontakt a spôsob prevzatia kľúčov. Číta sa z pobytov — '
        + 'z toho, koho si na ubytovanie zapísal.' },
    { key: 'transport', title: 'Vyriešená doprava na miesto', required: true,
      source: 'transport',
      why: 'Kto vezie, čím a kto hradí cestu tam a späť.' },
    { key: 'instructions', title: 'Odovzdané pokyny pracovníkovi', required: true,
      source: 'manual',
      why: 'Adresa stavby, kontakt na predáka, čas nástupu a čo si priniesť. '
        + 'Toto vie len ten, kto ich odovzdal — preto sa to odškrtáva.' },
  ];

  const byKey = new Map(CHECKS.map(c => [c.key, c]));
  /** Ručné body — tie, ktoré sa zapisujú do danubra_assignment_checks. */
  const MANUAL = CHECKS.filter(c => c.source === 'manual').map(c => c.key);

  function applies(check, { workType = 'construction', regulated = false } = {}) {
    if (check.onlyIf === 'regulated') return !!regulated;
    if (check.onlyIf === 'construction') return workType !== 'workshop';
    return true;
  }

  /** Býva tento človek niekde v čase, keď má byť na stavbe? */
  function hasStay(stays, { workerId, subcontractId, from, to }) {
    const f = day(from), t = day(to);
    return (stays || []).some(s => {
      if (!s || s.worker_id !== workerId) return false;
      if (subcontractId && s.subcontract_id && s.subcontract_id !== subcontractId) return false;
      // Pobyt musí prekrývať nasadenie. Ubytovanie, ktoré skončilo pred
      // nástupom, nie je zabezpečené ubytovanie.
      const sf = day(s.date_from), st = day(s.date_to);
      if (f && st && st < f) return false;
      if (t && sf && sf > t) return false;
      return true;
    });
  }

  /**
   * Zloží checklist pre jedno nasadenie.
   *
   * @param {Object} o
   *   assignment    { id, worker_id, date_from, date_to }
   *   subcontract   { work_type, zoll_reported_at, freistellung_verified, transport_* }
   *   worker        { regulated_trade }
   *   blocking      kľúče pravidiel, ktoré práve blokujú (z blokátora)
   *   waived        kľúče pravidiel, ktoré sú povolené výnimkou
   *   stays         záznamy „kto kde býva"
   *   checks        riadky z danubra_assignment_checks pre toto nasadenie
   * @returns {Array} [{ ...check, state, detail, canTick, row }]
   *   state: 'ok' | 'open' | 'waived'
   */
  function build(o = {}) {
    const a = o.assignment || {};
    const sc = o.subcontract || {};
    const w = o.worker || {};
    const ctx = {
      workType: sc.work_type === 'workshop' ? 'workshop' : 'construction',
      regulated: !!w.regulated_trade,
    };
    const blocking = new Set(o.blocking || []);
    const waived = new Set(o.waived || []);
    const rows = (o.checks || []).filter(c => c && c.assignment_id === a.id);

    return CHECKS.filter(c => applies(c, ctx)).map((c) => {
      let state = 'open', detail = '', row = null;

      if (c.source === 'doc') {
        state = blocking.has(c.rule) ? 'open' : (waived.has(c.rule) ? 'waived' : 'ok');
        detail = state === 'ok' ? 'Doklad je v kartotéke a platí.'
          : state === 'waived' ? 'Povolené zapísanou výnimkou.'
          : 'Chýba alebo neplatí — doplň v kartotéke živnostníka.';
      } else if (c.source === 'subcontract') {
        state = sc[c.field] ? 'ok' : 'open';
        detail = state === 'ok' ? 'Zapísané na zákazke.' : 'Zapíše sa na zákazke.';
      } else if (c.source === 'stay') {
        state = hasStay(o.stays, {
          workerId: a.worker_id, subcontractId: sc.id,
          from: a.date_from, to: a.date_to,
        }) ? 'ok' : 'open';
        detail = state === 'ok' ? 'Má pobyt na celý čas nasadenia.'
          : 'Zapíš ho na ubytovanie v sekcii Ubytovanie a doprava.';
      } else if (c.source === 'transport') {
        state = (sc.transport_provided || String(sc.transport_note || '').trim())
          ? 'ok' : 'open';
        detail = state === 'ok' ? 'Zapísané na zákazke.' : 'Zapíše sa na zákazke.';
      } else {
        row = rows.find(x => x.rule_key === c.key) || null;
        state = row && row.done ? 'ok' : 'open';
        detail = state === 'ok'
          ? `Odškrtnuté${row.done_at ? ` ${day(row.done_at)}` : ''}.`
          : 'Odškrtne ten, kto pokyny odovzdal.';
      }

      return { ...c, state, detail, row, canTick: c.source === 'manual' };
    });
  }

  /** Koľko je hotové a koľko z toho ešte blokuje nástup. */
  function progress(rows) {
    const r = rows || [];
    return {
      total: r.length,
      done: r.filter(x => x.state === 'ok' || x.state === 'waived').length,
      blocking: r.filter(x => x.required && x.state === 'open').length,
    };
  }

  /** Jedna veta na začiatok — nie tabuľka, ktorú treba prečítať celú. */
  function sentence(rows) {
    const p = progress(rows);
    if (!p.total) return '';
    if (!p.blocking) {
      return p.done === p.total
        ? 'Pred nasadením je všetko hotové.'
        : `Nič neblokuje nástup, ${p.total - p.done} ${
          p.total - p.done === 1 ? 'bod je' : 'body sú'} nepovinné.`;
    }
    const chyba = rows.filter(x => x.required && x.state === 'open')
      .map(x => x.title.toLowerCase());
    return `Nástup blokuje ${p.blocking === 1 ? 'jedna vec' : `${p.blocking} veci`}: `
      + `${chyba.join(', ')}.`;
  }

  const API = { CHECKS, MANUAL, applies, hasStay, build, progress, sentence };
  if (typeof window !== 'undefined') window.DanubraChecks = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
