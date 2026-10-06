// ============================================================================
// DANUBRA — výnimky z blokátorov: čo sa obísť dá a čo nie
// ============================================================================
// Zadanie hovorí: „nasadenie bez platných dokladov len s výnimkou admina".
// Z toho ale nevyplýva, že sa dá obísť **všetko**. Sú dva druhy prekážok
// a je dôležité ich nemiešať:
//
//   • **Obchodné riziko** — chýba A1, expiroval živnostenský, sadzba je pod
//     stavebnou minimálnou mzdou. Riziko je reálne a niekto ho môže prevziať.
//     Toto je presne to, na čo výnimka je: zapíše sa, kto ju povolil a prečo.
//
//   • **Nemožnosť alebo klamstvo** — faktúra bez odberateľa, faktúra na nulu,
//     reverse charge bez USt-IdNr, neuzavreté obdobie. Tu nie je čo prevziať:
//     buď to technicky nejde, alebo by výsledkom bol nesprávny doklad.
//     Výnimka by tu bola len tlačidlo „áno, viem, že to je zlé".
//
// Preto blokátor nesmie ponúkať jedno okienko na všetko. Doteraz ponúkal —
// formulár tvrdil, že „povolí, čo práve blokuje", aj pri prekážke, ktorú
// zapísaná výnimka nijako nerieši.
//
// Kľúče sú tie isté ako `override_rule` v `danubra_enums` (migrácia 013)
// a ako `rule` v blokátoroch — blokátor, výnimka a číselník musia hovoriť
// jedným jazykom, inak sa nedá povedať, ktoré pravidlo sa obchádza najčastejšie.
//
// Testy: node app/lib/overrides.test.js
// ============================================================================
(function () {
  /**
   * Prekážky, ktoré sa dajú prevziať na seba.
   *
   * `scope` je to, čoho sa výnimka drží:
   *   'worker'     — vlastnosť človeka (jeho doklady). Platí pre každé jeho
   *                  nasadenie; keby sa viazala na jedno, pri druhom by ju
   *                  niekto písal znova s tým istým dôvodom.
   *   'assignment' — vlastnosť tohto nasadenia (sadzba, hlásenie Zoll).
   *   'invoice'    — vlastnosť tejto faktúry.
   *
   * `risk` je veta do zápisu — čo tým človek na seba berie. Nie je to
   * ozdoba: výnimka bez následku by bola len klik.
   */
  const WAIVABLE = {
    missing_a1: {
      scope: 'worker', label: 'Nasadenie bez platného A1',
      risk: 'Pri kontrole Zoll hrozí pokuta a zastavenie prác na stavbe.',
    },
    missing_trade_licence: {
      scope: 'worker', label: 'Nasadenie bez živnostenského listu',
      risk: 'Bez nej to nie je subdodávka, ale zamestnávanie — s odvodmi dozadu.',
    },
    missing_contract: {
      scope: 'worker', label: 'Nasadenie bez podpísanej zmluvy o dielo',
      risk: 'Hrozí preklasifikovanie na Arbeitnehmerüberlassung.',
    },
    missing_hwo: {
      scope: 'worker', label: 'Regulované remeslo bez dokladu o odbornosti',
      risk: 'Bez oznámenia §9 HwO je výkon remesla neoprávnený.',
    },
    missing_document: {
      scope: 'worker', label: 'Nasadenie bez povinného dokladu',
      risk: 'Na stavbu ho pri kontrole pri vstupe nemusia pustiť.',
    },
    expired_document: {
      scope: 'worker', label: 'Nasadenie s expirovaným dokladom',
      risk: 'Expirovaný doklad je pri kontrole to isté ako žiadny.',
    },
    below_min_wage: {
      scope: 'assignment', label: 'Sadzba pod stavebnou minimálnou mzdou',
      risk: 'Rozhoduje obsah práce, nie názov zmluvy. Doplatok sa vymáha dozadu.',
    },
    missing_zoll: {
      scope: 'assignment', label: 'Začiatok stavebných prác bez hlásenia Zoll',
      risk: 'Hlásenie má byť pred začiatkom prác, nie po kontrole.',
    },
    missing_billing_data: {
      scope: 'worker', label: 'Neúplné fakturačné údaje živnosti',
      risk: 'Bez IČO a IBAN-u sa jeho faktúra nedá zaúčtovať ani uhradiť — '
        + 'schválenie teraz znamená, že to niekto musí dopísať pred platbou.',
    },
    invoice_amount_mismatch: {
      scope: 'invoice', label: 'Suma faktúry nesedí s podkladom',
      risk: 'Faktúra a podklad sa rozídu. Pri kontrole treba vedieť, '
        + 'prečo — preto je dôvod povinný.',
    },
  };

  /**
   * Prečo sa to ostatné obísť nedá. Je to napísané, lebo „nepustím to
   * a nepovedzem prečo" je horšie než zákaz — človek potom hľadá chybu
   * v appke namiesto v doklade.
   */
  const HARD = {
    invoice_no_partner: 'Nie je komu fakturovať. Doplň odberateľa.',
    invoice_zero: 'Faktúra na nulu nie je faktúra. Skontroluj podklad.',
    invoice_no_number: 'Číslo prideľuje databáza pri vytvorení z podkladu — '
      + 'nedá sa dopísať ručne.',
    invoice_no_ustidnr: 'Reverse charge §13b bez USt-IdNr sa neuznáva. '
      + 'Doplň daňové číslo, alebo prepni režim — oboje je jeden klik.',
    invoice_period_open: 'Hodiny sa ešte môžu zmeniť. Uzavri obdobie — '
      + 'potom bude faktúra sedieť s podkladom.',
  };

  function waivable(rule) { return Object.hasOwn(WAIVABLE, rule); }
  function meta(rule) { return WAIVABLE[rule] || null; }
  function scopeOf(rule) { return (WAIVABLE[rule] || {}).scope || null; }
  function riskOf(rule) { return (WAIVABLE[rule] || {}).risk || ''; }
  /** Prečo sa prekážka obísť nedá; prázdne, keď o takej nevieme. */
  function hardWhy(rule) { return HARD[rule] || ''; }

  /**
   * Rozdelí prekážky na tie, ktoré výnimka pokryje, a tie, ktoré nie.
   * Poradie sa zachová — je to poradie, v akom to človek čítal.
   */
  function split(reasons) {
    const can = [], cannot = [];
    for (const r of (reasons || [])) {
      if (!r) continue;
      (waivable(r.rule) ? can : cannot).push(r);
    }
    return { can, cannot };
  }

  /** Živé výnimky — nezrušené a ešte platné. */
  function live(overrides, today = new Date().toISOString().slice(0, 10)) {
    return (overrides || []).filter(o => o && !o.revoked_at
      && (!o.valid_until || String(o.valid_until) >= today));
  }

  /** Výnimky, ktoré sa týkajú daného záznamu. */
  function forEntity(overrides, type, id) {
    return (overrides || []).filter(o => o && o.entity_type === type && o.entity_id === id);
  }

  /**
   * Riadky na zápis. Jeden dôvod na všetko, čo práve blokuje — písať ten istý
   * dôvod päťkrát nikto nebude a skončilo by to pri „viď vyššie".
   *
   * @returns {{ rows: Array, skipped: Array }}
   *   rows    čo zapísať do danubra_overrides
   *   skipped prekážky, ktoré výnimka nepokryje (a teda zostanú blokovať)
   */
  function rowsFor(reasons, { entityType, entityId, reason, validUntil = null } = {}) {
    const { can, cannot } = split(reasons);
    const text = String(reason ?? '').trim();
    const seen = new Set();
    const rows = [];
    for (const r of can) {
      // Pri jednom nasadení môže to isté pravidlo vyjsť z dvoch dokladov
      // (chýba občiansky aj pas). Zapísať ho dvakrát by znamenalo dva
      // riadky s tým istým dôvodom a jedno zrušenie by nestačilo.
      if (seen.has(r.rule)) continue;
      seen.add(r.rule);
      rows.push({
        entity_type: scopeOf(r.rule) === 'worker' && entityType === 'assignment'
          ? 'worker' : entityType,
        entity_id: entityId,
        rule_key: r.rule,
        reason: text,
        valid_until: validUntil || null,
      });
    }
    return { rows, skipped: cannot };
  }

  /** Jedna veta o tom, čo sa práve zapíše. */
  function summary(reasons) {
    const { can, cannot } = split(reasons);
    if (!can.length) {
      return cannot.length
        ? 'Ani jednu z týchto prekážok výnimka nepokryje.'
        : 'Niet čo povoliť — nič neblokuje.';
    }
    const n = can.length;
    const head = `Zapíše sa výnimka na ${n} ${
      n === 1 ? 'pravidlo' : n < 5 ? 'pravidlá' : 'pravidiel'}`;
    return cannot.length
      ? `${head}. ${cannot.length === 1 ? 'Jedna prekážka' : `${cannot.length} prekážky`} `
        + 'zostane — tú výnimka nerieši.'
      : `${head}.`;
  }

  const API = {
    WAIVABLE, HARD,
    waivable, meta, scopeOf, riskOf, hardWhy,
    split, live, forEntity, rowsFor, summary,
  };
  if (typeof window !== 'undefined') window.DanubraOverrides = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
