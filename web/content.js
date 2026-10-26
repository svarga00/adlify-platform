// ============================================================================
// punds web — obsah spravovaný v appke (Marketing → Weby)
// ============================================================================
// Texty stránok sú v kóde (`const T` v každej stránke). Appka ich môže
// prepísať: v databáze (danubra_web_content) je len to, čo sa zmenilo —
//   texts:<web>:<stránka>  { <jazyk>: { "<cesta>": "<nový text>" } }
// Ďalej kontakty (telefóny, e-maily, WhatsApp), firma (konateľ), tím
// a výmena fotiek ({ pôvodná adresa: nová adresa }).
//
// Texty sa prepíšu priamo v objektoch stránok (pred každým skladaním sa
// vrátia do pôvodného stavu a prepíšu nanovo), kontakty a fotky sa nahradia
// v hotovom HTML. Obsah sa drží minútu v pamäti funkcie, stránky ďalšie
// 4–5 minút CDN — zmena z appky je na webe do pár minút.
// ============================================================================
'use strict';

const { SITES } = require('./shared/sites');
const { IMG } = require('./shared/jobs');

const DEFAULTS = {
  contacts: {
    sk: { phone1: '+421 910 523 858', phone2: '+421 910 523 958', email: 'info@punds.sk' },
    eu: { phone: '+421 910 523 958', email: 'info@punds.eu' },
    whatsapp: '+421 910 523 858',
  },
};

/** Fotky, ktoré sa dajú vymeniť (adresa → popis). */
function imageList() {
  let dry = null;
  try { dry = require('./sk/pages/about').DRY; } catch (e) { /* bez nej */ }
  return [
    { url: IMG.weld, label: 'Zvárač — úvod punds.sk a punds.eu, zváranie, ponuky zváračov' },
    { url: IMG.paint, label: 'Maliar — maliari, zatepľovanie, ponuky' },
    { url: IMG.elec, label: 'Elektrikár — elektrikári, vzduchotechnika' },
    { url: IMG.mont, label: 'Montáž — montéri, o nás, ostatné ponuky' },
    dry && { url: dry, label: 'Sadrokartón — profesie, o nás' },
  ].filter(Boolean);
}

// ── Texty: cesty k reťazcom v objektoch stránok ────────────────────────────
/** Všetky reťazce objektu ako { "a.b.0": "text" } (funkcie sa vynechajú). */
function flatten(o, pre = '', out = {}) {
  if (typeof o === 'string') { out[pre] = o; return out; }
  if (Array.isArray(o)) { o.forEach((v, i) => flatten(v, pre ? `${pre}.${i}` : String(i), out)); return out; }
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) flatten(v, pre ? `${pre}.${k}` : k, out);
  return out;
}
/** Hlboká kópia, funkcie zostanú (structuredClone by na nich spadol). */
const clone = (o) => (Array.isArray(o) ? o.map(clone) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, clone(v)])) : o);
/** Nastaví reťazec na ceste — len ak tam reťazec bol (štruktúru appka nemení). */
function setPath(obj, path, value) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) { o = o == null ? null : o[parts[i]]; if (o == null || typeof o !== 'object') return false; }
  const last = parts[parts.length - 1];
  if (typeof o[last] !== 'string' || typeof value !== 'string') return false;
  o[last] = value;
  return true;
}

/**
 * Skupiny textov webu: { "<stránka>": { obj, langs } }. Stránka má `T`
 * ({ jazyk: {…} }); remeslá punds.eu majú svoje texty v TRADES.
 */
function groupsOf(siteKey) {
  const site = SITES[siteKey];
  const pages = require(`./${siteKey}/pages`);
  const common = require(`./${siteKey}/common`);
  const g = { common: { obj: common.T, label: 'Spoločné (menu, päta, hlásenia)' } };
  for (const [route, mod] of Object.entries(pages)) {
    if (mod && mod.T) g[route] = { obj: mod.T, label: route };
    if (mod && mod.TRADES) for (const [k, v] of Object.entries(mod.TRADES)) g[`trade:${k}`] = { obj: v, label: `remeslo ${k}` };
  }
  for (const x of Object.values(g)) x.langs = site.langs.filter((l) => x.obj[l] && typeof x.obj[l] === 'object');
  return g;
}

const PRISTINE = new Map();           // skupina → pôvodný stav (pred prepisom z appky)
function pristineOf(key, obj, langs) {
  if (!PRISTINE.has(key)) PRISTINE.set(key, Object.fromEntries(langs.map((l) => [l, clone(obj[l])])));
  return PRISTINE.get(key);
}

/** Popis všetkých textov pre appku: { sk: { home: { label, langs, fields: { jazyk: { cesta: text } } } }, eu: … } */
function schema() {
  const out = {};
  for (const siteKey of Object.keys(SITES)) {
    out[siteKey] = {};
    for (const [key, g] of Object.entries(groupsOf(siteKey))) {
      const base = pristineOf(`${siteKey}:${key}`, g.obj, g.langs);
      out[siteKey][key] = { label: g.label, langs: g.langs, fields: Object.fromEntries(g.langs.map((l) => [l, flatten(base[l])])) };
    }
  }
  return { sites: out, images: imageList(), defaults: DEFAULTS };
}

/** Vráti texty webu do pôvodného stavu a prepíše ich podľa appky. */
function applyTexts(siteKey, rows) {
  let n = 0;
  for (const [key, g] of Object.entries(groupsOf(siteKey))) {
    const base = pristineOf(`${siteKey}:${key}`, g.obj, g.langs);
    const over = (rows[`texts:${siteKey}:${key}`] || {});
    for (const l of g.langs) {
      g.obj[l] = clone(base[l]);
      for (const [path, val] of Object.entries(over[l] || {})) if (val != null && val !== '' && setPath(g.obj[l], path, String(val))) n++;
    }
  }
  return n;
}

// ── Kontakty a fotky v hotovom HTML ────────────────────────────────────────
const digits = (p) => String(p || '').replace(/[^\d+]/g, '');
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Zoznam náhrad [[z, na]] pre web podľa nastavení kontaktov a fotiek. */
function replacements(siteKey, rows) {
  const c = rows.contacts || {};
  const pairs = [];
  const phone = (from, to) => {
    if (!to || to === from) return;
    pairs.push([from, to], [`tel:${digits(from)}`, `tel:${digits(to)}`]);
  };
  const D = DEFAULTS.contacts;
  if (siteKey === 'sk') {
    phone(D.sk.phone1, c.sk && c.sk.phone1);
    phone(D.sk.phone2, c.sk && c.sk.phone2);
    if (c.sk && c.sk.email && c.sk.email !== D.sk.email) pairs.push([D.sk.email, c.sk.email]);
  } else {
    phone(D.eu.phone, c.eu && c.eu.phone);
    if (c.eu && c.eu.email && c.eu.email !== D.eu.email) pairs.push([D.eu.email, c.eu.email]);
  }
  if (c.whatsapp && digits(c.whatsapp) !== digits(D.whatsapp)) {
    pairs.push([`wa.me/${digits(D.whatsapp).replace('+', '')}`, `wa.me/${digits(c.whatsapp).replace('+', '')}`]);
  }
  for (const [from, to] of Object.entries(rows.images || {})) if (to && /^https:\/\//.test(to) && to !== from) pairs.push([from, to]);
  return pairs;
}
function postProcess(html, pairs) {
  let out = html;
  for (const [a, b] of pairs) out = out.replace(new RegExp(escRe(a), 'g'), b.replace(/\$/g, '$$$$'));
  return out;
}

/** Tím pre web (aktívni, zoradení). */
const teamFor = (siteKey, rows) => (Array.isArray(rows.team) ? rows.team : [])
  .filter((m) => m && m.active !== false && m.name && (!m.sites || !m.sites.length || m.sites.includes(siteKey)))
  .sort((a, b) => (a.sort || 0) - (b.sort || 0))
  .map((m) => ({ ...m, role: m.role && typeof m.role === 'object' ? m.role : {}, langs: m.langs || '' }));

/**
 * Načítanie obsahu z databázy (service role) s minútovou pamäťou.
 * @returns {Function} async () => rows ({ key: value })
 */
function loader(supabase) {
  let cache = null, at = 0;
  return async function rows() {
    if (!cache || Date.now() - at > 60000) {
      try {
        const { data, error } = await supabase.from('danubra_web_content').select('key,value').limit(500);
        if (!error) cache = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
      } catch (e) { /* bez obsahu z appky — pôvodné texty */ }
      cache = cache || {}; at = Date.now();
    }
    return cache;
  };
}

module.exports = { schema, applyTexts, replacements, postProcess, teamFor, loader, flatten, setPath, imageList, DEFAULTS };
