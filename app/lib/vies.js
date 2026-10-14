// ============================================================================
// DANUBRA — USt-IdNr: tvar čísla a čítanie odpovede registra (VIES)
// ============================================================================
// Čistá časť overovania firmy. Samotné volanie registra je v serverovej
// funkcii `danubra-verify-company` — sem patrí len to, čo sa dá odskúšať bez
// siete, a to je presne to, čo sa pri tom najčastejšie pokazí:
//
//   * **tvar čísla.** Ľudia ho píšu s medzerami, bodkami aj malými písmenami.
//     Register prijme jeden tvar.
//   * **„register neodpovedal" ≠ „firma neexistuje".** VIES je často mimo
//     prevádzky. Keby sa nedostupnosť čítala ako neplatné číslo, appka by
//     tvrdila, že odberateľ neexistuje — a to je horšie než nevedieť nič.
//
// Testy: node app/lib/vies.test.js
// ============================================================================
(function () {
  /**
   * Rozdelí USt-IdNr na kód štátu a číslo.
   * @returns {{country,number,clean}|null} null, keď to nemá tvar USt-IdNr
   */
  function split(vat) {
    const clean = String(vat || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const m = clean.match(/^([A-Z]{2})([A-Z0-9]{2,14})$/);
    if (!m) return null;
    // V čísle musia byť aspoň dve číslice. Bez tejto podmienky prejde ako
    // USt-IdNr aj slovo („DEUTSCHLAND" = DE + UTSCHLAND) a register by sa
    // pýtal na nezmysel. Písmená v čísle sú pritom bežné — rakúske číslo
    // začína na U, holandské má v sebe B.
    if ((m[2].match(/\d/g) || []).length < 2) return null;
    return { country: m[1], number: m[2], clean };
  }

  /**
   * Prečíta odpoveď registra.
   *
   * @param {Object} o { ok, status, data, error }
   *   ok      či HTTP odpoveď prišla v poriadku
   *   status  HTTP kód
   *   data    rozparsované telo (alebo null, keď sa nedalo prečítať)
   *   error   chyba siete, keď sa nedovolalo vôbec
   * @returns {Object} výsledok v tvare, ktorý appka rozumie
   */
  function interpret(o = {}) {
    if (o.error) {
      return { unavailable: true, reason: 'network', note: String(o.error) };
    }
    if (!o.ok) {
      return { unavailable: true, reason: `http_${o.status || 0}`,
        note: 'Register odpovedal chybou. Nie je to to isté ako neplatné číslo.' };
    }
    if (!o.data || typeof o.data !== 'object') {
      return { unavailable: true, reason: 'parse',
        note: 'Odpoveď registra sa nedala prečítať.' };
    }
    // VIES vracia `isValid`. Keď chýba, nevieme nič — a to nie je „neplatné".
    if (typeof o.data.isValid !== 'boolean') {
      return { unavailable: true, reason: 'no_answer',
        note: 'Register neposlal odpoveď na otázku, či je číslo platné.' };
    }

    const txt = (v) => (v && String(v).trim() && String(v).trim() !== '---'
      ? String(v).trim() : null);
    return {
      valid: o.data.isValid,
      vat: txt(o.data.countryCode && o.data.vatNumber
        ? `${o.data.countryCode}${o.data.vatNumber}` : null),
      name: txt(o.data.name),
      address: txt(o.data.address),
      source: 'vies',
    };
  }

  /** Výsledok pre číslo, ktoré nemá tvar USt-IdNr. Register sa ani nepýta. */
  function badFormat() {
    return { valid: false, reason: 'format',
      note: 'Číslo nemá tvar USt-IdNr (dve písmená štátu a potom číslo).' };
  }

  const API = { split, interpret, badFormat };
  if (typeof window !== 'undefined') window.DanubraVies = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
