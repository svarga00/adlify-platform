// ============================================================================
// DANUBRA — SMS vrstva (§9)
// ============================================================================
// Poskytovateľ je abstrahovaný — rozhranie + adaptéry, konkrétny sa vyberie
// premennou prostredia. Tu je logika, ktorá musí byť správna bez ohľadu na
// providera: normalizácia čísla na E.164, počítanie segmentov (GSM-7 vs
// Unicode) a odstránenie diakritiky, aby sa správa nezdvojnásobila.
// ============================================================================
(function () {
  // ── Znaková sada GSM 03.38 ────────────────────────────────────────────────
  const GSM_BASIC =
    '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?'
    + '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  // znaky, ktoré v GSM-7 zaberajú dva znaky (escape sekvencia)
  const GSM_EXT = '^{}\\[~]|€';

  const GSM_SET = new Set(GSM_BASIC.split(''));
  const GSM_EXT_SET = new Set(GSM_EXT.split(''));

  /** Dá sa text poslať v GSM-7? */
  function isGsm7(text) {
    for (const ch of String(text || '')) {
      if (!GSM_SET.has(ch) && !GSM_EXT_SET.has(ch)) return false;
    }
    return true;
  }

  /** Dĺžka v GSM-7 jednotkách (rozšírené znaky sa počítajú dvakrát). */
  function gsm7Length(text) {
    let n = 0;
    for (const ch of String(text || '')) n += GSM_EXT_SET.has(ch) ? 2 : 1;
    return n;
  }

  /**
   * Spočíta segmenty správy.
   * GSM-7: 160 znakov (pri viacerých častiach 153), Unicode: 70 (66).
   */
  function countSegments(text) {
    const s = String(text || '');
    if (s.length === 0) return { encoding: 'gsm7', length: 0, segments: 0, perSegment: 160, remaining: 160 };
    if (isGsm7(s)) {
      const len = gsm7Length(s);
      const segments = len <= 160 ? 1 : Math.ceil(len / 153);
      const perSegment = segments > 1 ? 153 : 160;
      return { encoding: 'gsm7', length: len, segments,
        perSegment, remaining: segments * perSegment - len };
    }
    // Unicode — počítame kódové jednotky UTF-16 (emoji zaberá dve)
    const len = s.length;
    const segments = len <= 70 ? 1 : Math.ceil(len / 67);
    const perSegment = segments > 1 ? 67 : 70;
    return { encoding: 'unicode', length: len, segments,
      perSegment, remaining: segments * perSegment - len };
  }

  /** Odstráni diakritiku, aby sa text zmestil do GSM-7. */
  function stripDiacritics(text) {
    return String(text || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[ľĽ]/g, 'l').replace(/[ťŤ]/g, 't').replace(/[ďĎ]/g, 'd')
      .replace(/[ňŇ]/g, 'n').replace(/[šŠ]/g, (m) => m === 'š' ? 's' : 'S')
      .replace(/[čČ]/g, (m) => m === 'č' ? 'c' : 'C')
      .replace(/[žŽ]/g, (m) => m === 'ž' ? 'z' : 'Z')
      .replace(/[ýÝ]/g, (m) => m === 'ý' ? 'y' : 'Y')
      .replace(/[ŕŔ]/g, (m) => m === 'ŕ' ? 'r' : 'R')
      .replace(/[ĺĹ]/g, (m) => m === 'ĺ' ? 'l' : 'L')
      .replace(/[őŐűŰ]/g, (m) => 'őŐ'.includes(m) ? (m === 'ő' ? 'o' : 'O') : (m === 'ű' ? 'u' : 'U'));
  }

  /**
   * Normalizuje telefónne číslo na E.164.
   * @param {string} raw
   * @param {string} defaultCountry predvolená predvoľba ('SK'|'DE'|'HU'|'CZ'|'AT')
   */
  const PREFIX = { SK: '421', CZ: '420', HU: '36', DE: '49', AT: '43', PL: '48' };
  function toE164(raw, defaultCountry = 'SK') {
    let s = String(raw || '').replace(/[\s\-()/.]/g, '');
    if (!s) return null;
    if (s.startsWith('00')) s = '+' + s.slice(2);
    if (s.startsWith('+')) {
      const digits = s.slice(1).replace(/\D/g, '');
      return digits.length >= 8 && digits.length <= 15 ? '+' + digits : null;
    }
    const digits = s.replace(/\D/g, '');
    if (!digits) return null;
    const cc = PREFIX[defaultCountry] || PREFIX.SK;
    // domáci formát s vedúcou nulou → nahradíme predvoľbou
    const local = digits.startsWith('0') ? digits.slice(1) : digits;
    // ak už začína predvoľbou krajiny, neduplikujeme ju
    const out = local.startsWith(cc) ? local : cc + local;
    return out.length >= 8 && out.length <= 15 ? '+' + out : null;
  }

  /** Doplní premenné do šablóny: {{meno}} → hodnota. */
  function render(template, vars = {}) {
    return String(template || '').replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi,
      (_, k) => (vars[k] != null ? String(vars[k]) : ''));
  }

  /**
   * Pripraví správu na odoslanie — vráti aj varovania pre rozhranie.
   * @returns {{ to, body, segments, encoding, warnings:[], asciiBody }}
   */
  function prepare({ to, body, country = 'SK', stripDia = false } = {}) {
    const e164 = toE164(to, country);
    const warnings = [];
    if (!e164) warnings.push({ severity: 'blocker', text: 'Telefónne číslo sa nedá previesť na medzinárodný formát' });

    const ascii = stripDiacritics(body);
    const finalBody = stripDia ? ascii : String(body || '');
    const info = countSegments(finalBody);

    if (info.encoding === 'unicode' && !stripDia) {
      const asciiInfo = countSegments(ascii);
      warnings.push({
        severity: 'warning',
        text: `Diakritika zmenšuje kapacitu na ${info.perSegment} znakov — správa má ${info.segments} `
          + `${info.segments === 1 ? 'segment' : 'segmenty'}. Bez diakritiky by stačilo ${asciiInfo.segments}.`,
      });
    }
    if (info.segments > 3) {
      warnings.push({ severity: 'warning', text: `Správa má ${info.segments} segmentov — zvážiť skrátenie.` });
    }
    if (info.length === 0) {
      warnings.push({ severity: 'blocker', text: 'Prázdna správa' });
    }

    return { to: e164, body: finalBody, asciiBody: ascii,
      segments: info.segments, encoding: info.encoding, length: info.length,
      remaining: info.remaining, warnings,
      ok: !warnings.some(w => w.severity === 'blocker') };
  }

  const API = { isGsm7, gsm7Length, countSegments, stripDiacritics, toE164, render, prepare, PREFIX };
  if (typeof window !== 'undefined') window.DanubraSms = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
