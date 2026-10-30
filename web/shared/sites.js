// ============================================================================
// punds web — dva weby, ich jazyky a adresy stránok
// ============================================================================
//   punds.sk  remeselníci hľadajú prácu  · sk (predvolený), cz, hu, de, en, ro, pl, bg
//   punds.eu  nemecké firmy hľadajú ľudí  · de (predvolený), en
//
// Rumunčina, poľština a bulharčina (ro, pl, bg) pribudli neskôr: tím firmy
// nimi nehovorí, preto web v týchto jazykoch pri ponukách pripomína, že vedúci
// partie musí hovoriť po nemecky alebo anglicky (sk/common.js → T.<lang>.langReq).
// Bulharské slová v adrese sú v latinke (rabota, profesii…), nech sa odkaz dá
// prečítať a nadiktovať aj bez cyriliky.
//
// Každý jazyk má vlastnú predponu (punds.sk/sk/…, /cz/…) a vlastné slová
// v adrese — „/sk/ponuky", „/de/jobs". Na skúšobnej adrese beží web pod
// predponou webu: adlify-app.netlify.app/punds-sk/sk/ponuky.
// ============================================================================
'use strict';

const SITES = {
  sk: {
    key: 'sk', prefix: '/punds-sk', hosts: ['punds.sk', 'www.punds.sk'], domain: 'punds.sk',
    langs: ['sk', 'cz', 'hu', 'de', 'en', 'ro', 'pl', 'bg'], defaultLang: 'sk',
    routes: {
      home: { sk: '', cz: '', hu: '', de: '', en: '', ro: '', pl: '', bg: '' },
      jobs: { sk: 'ponuky', cz: 'nabidky', hu: 'allasok', de: 'jobs', en: 'jobs', ro: 'locuri-de-munca', pl: 'oferty', bg: 'rabota' },
      job: { sk: 'ponuky/:slug', cz: 'nabidky/:slug', hu: 'allasok/:slug', de: 'jobs/:slug', en: 'jobs/:slug', ro: 'locuri-de-munca/:slug', pl: 'oferty/:slug', bg: 'rabota/:slug' },
      professions: { sk: 'profesie', cz: 'profese', hu: 'szakmak', de: 'berufe', en: 'trades', ro: 'meserii', pl: 'zawody', bg: 'profesii' },
      about: { sk: 'o-nas', cz: 'o-nas', hu: 'rolunk', de: 'ueber-uns', en: 'about', ro: 'despre-noi', pl: 'o-nas', bg: 'za-nas' },
      how: { sk: 'ako-to-funguje', cz: 'jak-to-funguje', hu: 'hogyan-mukodik', de: 'ablauf', en: 'how-it-works', ro: 'cum-functioneaza', pl: 'jak-to-dziala', bg: 'kak-raboti' },
      contact: { sk: 'kontakt', cz: 'kontakt', hu: 'kapcsolat', de: 'kontakt', en: 'contact', ro: 'contact', pl: 'kontakt', bg: 'kontakt' },
      privacy: { sk: 'ochrana-osobnych-udajov', cz: 'ochrana-osobnich-udaju', hu: 'adatvedelem', de: 'datenschutz', en: 'privacy', ro: 'protectia-datelor', pl: 'ochrona-danych', bg: 'lichni-danni' },
      cookies: { sk: 'cookies', cz: 'cookies', hu: 'cookies', de: 'cookies', en: 'cookies', ro: 'cookies', pl: 'cookies', bg: 'cookies' },
    },
  },
  eu: {
    key: 'eu', prefix: '/punds-eu', hosts: ['punds.eu', 'www.punds.eu'], domain: 'punds.eu',
    langs: ['de', 'en'], defaultLang: 'de',
    routes: {
      home: { de: '', en: '' },
      trade: { de: 'gewerke/:slug', en: 'trades/:slug' },
      about: { de: 'ueber-uns', en: 'about' },
      contact: { de: 'kontakt', en: 'contact' },
      imprint: { de: 'impressum', en: 'imprint' },
      privacy: { de: 'datenschutz', en: 'privacy' },
    },
  },
};

/** Jazyky: kód v adrese → názov, vlajka, kód pre <html lang> a čísla. */
const LANGS = {
  sk: { name: 'Slovenčina', label: 'SK', flag: 'sk', html: 'sk' },
  cz: { name: 'Čeština', label: 'CZ', flag: 'cz', html: 'cs' },
  hu: { name: 'Magyar', label: 'HU', flag: 'hu', html: 'hu' },
  de: { name: 'Deutsch', label: 'DE', flag: 'de', html: 'de' },
  en: { name: 'English', label: 'EN', flag: 'gb', html: 'en' },
  ro: { name: 'Română', label: 'RO', flag: 'ro', html: 'ro' },
  pl: { name: 'Polski', label: 'PL', flag: 'pl', html: 'pl' },
  bg: { name: 'Български', label: 'BG', flag: 'bg', html: 'bg' },
};

/**
 * Jazyky, ktoré uchádzač môže zaškrtnúť vo formulári („Ktorými jazykmi
 * hovoríte?"). Kódy sú tie, čo používa appka pri kandidátoch (cs = čeština),
 * ukladajú sa do danubra_candidates.languages. Názvy sú v sk/common.js → T.<lang>.spoken.
 */
const SPOKEN = ['de', 'en', 'sk', 'cs', 'hu', 'ro', 'pl', 'bg', 'other'];

/**
 * Z adresy (bez predpony webu) zistí jazyk, stránku a parameter.
 * @returns {{lang, route, params}|null}  null = neznáma adresa (404)
 */
function match(site, path) {
  const parts = String(path || '/').replace(/\/+$/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const lang = parts[0];
  if (!site.langs.includes(lang)) return null;
  const rest = parts.slice(1);
  for (const [route, slugs] of Object.entries(site.routes)) {
    const pat = (slugs[lang] || '').split('/').filter(Boolean);
    if (pat.length !== rest.length) continue;
    const params = {};
    if (pat.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = rest[i]), true) : p === rest[i]))) {
      return { lang, route, params };
    }
  }
  return null;
}

/** Adresa stránky v danom jazyku (bez predpony webu): path(site,'sk','job',{slug}) → /sk/ponuky/zvarac-bremen */
function path(site, lang, route, params = {}) {
  const pat = (site.routes[route] || {})[lang];
  if (pat == null) return null;
  const s = pat.split('/').filter(Boolean).map((p) => (p.startsWith(':') ? encodeURIComponent(params[p.slice(1)] || '') : p)).join('/');
  return s ? `/${lang}/${s}` : `/${lang}/`;
}

/** Ktorý web patrí k adrese/hostu. */
function siteFor({ host = '', path: p = '/' } = {}) {
  const h = String(host).toLowerCase().split(':')[0];
  for (const s of Object.values(SITES)) if (s.hosts.includes(h)) return { site: s, base: '', prod: true };
  for (const s of Object.values(SITES)) {
    if (p === s.prefix || p.startsWith(s.prefix + '/')) return { site: s, base: s.prefix, prod: false };
  }
  return null;
}

module.exports = { SITES, LANGS, SPOKEN, match, path, siteFor };
