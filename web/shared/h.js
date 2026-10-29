// ============================================================================
// punds web — drobné pomocníky na skladanie HTML
// ============================================================================
// Stránky sa skladajú ako reťazce na serveri (netlify/functions/punds-web.js).
// Všetko, čo prichádza z dát (inzerát, meno mesta…), ide cez esc().
// ============================================================================
'use strict';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Text s jednoduchým formátovaním (právne texty): všetko sa escapuje a späť
 * sa pustia len <b>, </b>, <br>. Text môže prepísať appka (Marketing → Weby),
 * takže iné značky (skript, odkaz, obrázok) sa na stránku nedostanú.
 */
const rich = (s) => esc(s).replace(/&lt;(\/?b|br\s*\/?)&gt;/gi, (m, tag) => `<${tag.toLowerCase().replace(/\s+/g, '')}>`);

/** Atribút: attr('href', url) → ` href="…"`; prázdna hodnota = nič. */
const attr = (name, value) => (value == null || value === false ? '' : value === true ? ` ${name}` : ` ${name}="${esc(value)}"`);

/** Zoznam → HTML (map + join), null/false sa vynechá. */
const each = (list, fn) => (list || []).map(fn).filter((x) => x != null && x !== false).join('');

/** Triedy: cls('a', on && 'b') → "a b". */
const cls = (...a) => a.filter(Boolean).join(' ');

/** Formát čísla podľa jazyka (sk-SK: 12 600, de-DE: 12.600). */
const LOCALE = { sk: 'sk-SK', cz: 'cs-CZ', cs: 'cs-CZ', hu: 'hu-HU', de: 'de-DE', en: 'en-GB' };
const num = (n, lang = 'sk', o = {}) => Number(n || 0).toLocaleString(LOCALE[lang] || 'sk-SK', o);

/**
 * Množné číslo: plural('sk', n, ['ponuka', 'ponuky', 'ponúk']).
 * SK/CZ: 1 / 2–4 / 5+ (a 0); ostatné jazyky: 1 / ostatné.
 */
function plural(lang, n, forms) {
  const k = Math.abs(Number(n) || 0);
  if (lang === 'sk' || lang === 'cz' || lang === 'cs') return k === 1 ? forms[0] : (k >= 2 && k <= 4 ? forms[1] : forms[2] || forms[1]);
  if (lang === 'hu') return forms[0];
  return k === 1 ? forms[0] : forms[forms.length - 1];
}

module.exports = { esc, rich, attr, each, cls, num, plural, LOCALE };
