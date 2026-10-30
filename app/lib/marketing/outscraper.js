// ============================================================================
// DANUBRA — marketing: nové firmy z Google Máp (Outscraper) a ich aktuálnosť
// ============================================================================
// „Ako to hľadá? Už sme také riešili cez Outscraper… chcem, aby bolo všetko
// relevantné a aktuálne."
//
// Outscraper (https://outscraper.com) vracia firmy z Google Máp: názov,
// adresa, telefón, web, kategórie, hodnotenie, počet recenzií a stav
// (funguje / dočasne zatvorená / zatvorená). Volá ho len server
// (`danubra-leads-from-urls-background`, `danubra-leads-refresh-background`)
// s kľúčom OUTSCRAPER_API_KEY — tu sú čisté pravidlá bez siete:
//
//   dotazy       z kategórií a lokalít „Trockenbau, München", najviac 10,
//                limit na dotaz tak, aby spolu nepresiahli počet × 3 a strop
//                OUTSCRAPER_MAX_RECORDS (účtuje sa za vrátený záznam)
//   odpoveď      synchrónna (data) aj asynchrónna (id → /requests/<id>),
//                výsledky po dotazoch (pole polí) aj spolu (jedno pole)
//   firma        mapovanie polí Outscraperu na naše, doména, telefón, stav,
//                kategórie, odkaz na Mapy
//   vyradenie    zatvorené, bez webu, mimo Nemecka, duplicity (place_id,
//                doména, meno + PSČ), už ich máme, odhlásené, zadané firmy
//   e-mail       firemný z vlastnej domény (info@, kontakt@, büro@) pred
//                osobným; kontakty z Outscraperu len keď Impressum nemá nič
//   skóre        výber firiem nad prahom, zoradené, najviac zvolený počet
//   riadok       danubra_leads s údajmi o pôvode (data_source)
//   aktuálnosť   overenie podľa place_id (alebo mena + mesta), zmeny, štítky
//                Zatvorená / Web nefunguje / E-mail neoverený, MX záznam
//
// Testy: node app/lib/marketing/outscraper.test.js
// ============================================================================
(function () {
  const Seeds = () => (typeof window !== 'undefined' && window.DanubraSeeds)
    || (typeof require === 'function' ? require('./seeds.js') : null);

  const API_BASE = 'https://api.app.outscraper.com';
  /** Kam smie ísť kľúč — nikam inam (aj keď by niekto prepísal adresu v env). */
  const API_HOSTS = ['api.app.outscraper.com', 'api.app.outscraper.cloud', 'api.outscraper.net'];
  const DEFAULT_MAX_RECORDS = 200;
  const MAX_QUERIES = 10;
  const RESERVE = 3;
  const MIN_PER_QUERY = 5;
  const MAX_PER_QUERY = 100;
  const MIN_SCORES = [40, 50, 60, 70];
  const DEFAULT_MIN_SCORE = 50;

  const clean = (v) => (v == null ? '' : String(v)).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const cut = (v, n) => clean(v).slice(0, n) || null;
  const lower = (v) => clean(v).toLowerCase();
  const int = (v, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : def; };

  // ── Stav firmy na Mapách ────────────────────────────────────────────────
  const STATUS = {
    OPERATIONAL: ['Funguje', 'green'],
    CLOSED_TEMPORARILY: ['Dočasne zatvorená', 'amber'],
    CLOSED_PERMANENTLY: ['Zatvorená', 'red'],
  };

  /** „operational", „Closed temporarily", „CLOSED_PERMANENTLY" → kľúč, inak null. */
  function normStatus(s) {
    const k = clean(s).toUpperCase().replace(/[\s-]+/g, '_');
    if (STATUS[k]) return k;
    if (/PERMANENT/.test(k)) return 'CLOSED_PERMANENTLY';
    if (/TEMPOR/.test(k)) return 'CLOSED_TEMPORARILY';
    if (/^(OPEN|OPERATING)$/.test(k)) return 'OPERATIONAL';
    return null;
  }

  // ── Limity a odhad spotreby ─────────────────────────────────────────────
  /** OUTSCRAPER_MAX_RECORDS → 10 až 5000, predvolene 200. */
  function maxRecords(v) {
    const n = int(v, NaN);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_RECORDS;
    return Math.min(Math.max(n, 10), 5000);
  }

  /** Prah skóre z okna hľadania: 0 až 100, predvolene 50. */
  function minScore(v) {
    if (v === '' || v == null) return DEFAULT_MIN_SCORE;
    const n = int(v, NaN);
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : DEFAULT_MIN_SCORE;
  }

  /**
   * Koľko záznamov smie Outscraper najviac vrátiť (= účtuje sa): zvolený
   * počet × 3 (rezerva na vyradenie), najviac strop z env.
   */
  function budget({ count = 20, max = DEFAULT_MAX_RECORDS } = {}) {
    return Math.max(1, Math.min(Math.max(1, int(count, 20)) * RESERVE, maxRecords(max)));
  }

  /** Dotaz pre Mapy: jeden riadok, bez riadiacich znakov, 3–100 znakov. */
  function cleanQuery(q) {
    const s = clean(q).replace(/[<>{}"`]/g, '').slice(0, 100).trim();
    return s.length >= 3 ? s : '';
  }

  /** Kategórie × lokality → „Trockenbau, München"; bez lokality „…, Deutschland". */
  function combine(categories = [], locations = []) {
    const cats = uniq((categories || []).map(cleanQuery).filter(Boolean));
    const locs = uniq((locations || []).map(cleanQuery).filter(Boolean));
    if (!cats.length) return [];
    if (!locs.length) return cats.map(c => `${c}, Deutschland`);
    const out = [];
    for (const l of locs) for (const c of cats) out.push(`${c}, ${l}`);
    return out;
  }

  function uniq(list) {
    const seen = new Set();
    return (list || []).filter((x) => { const k = lower(x); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  }

  /**
   * Plán hľadania: najviac 10 dotazov a limit na dotaz, aby spolu
   * nepresiahli rozpočet. Hotové dotazy od AI majú prednosť, doplnia sa
   * kombináciou kategórií a lokalít.
   * @returns {{ queries: string[], perQuery: number, estimate: number, budget: number }}
   */
  function planQueries({ queries = [], categories = [], locations = [], count = 20, max = DEFAULT_MAX_RECORDS, maxQueries = MAX_QUERIES } = {}) {
    const b = budget({ count, max });
    const list = uniq([...(queries || []).map(cleanQuery), ...combine(categories, locations)].filter(Boolean));
    if (!list.length) return { queries: [], perQuery: 0, estimate: 0, budget: b };
    const nq = Math.max(1, Math.min(list.length, maxQueries, Math.floor(b / MIN_PER_QUERY) || 1));
    const perQuery = Math.max(1, Math.min(MAX_PER_QUERY, Math.floor(b / nq)));
    return { queries: list.slice(0, nq), perQuery, estimate: nq * perQuery, budget: b };
  }

  /** Pre okno hľadania: „Outscraper prehľadá cca X záznamov". */
  function estimate({ count = 20, max = DEFAULT_MAX_RECORDS } = {}) {
    return budget({ count, max });
  }

  // ── Požiadavka a odpoveď ────────────────────────────────────────────────
  /** Parametre → query string; pole = parameter viackrát (query=a&query=b). */
  function queryString(params = {}) {
    const parts = [];
    for (const [k, v] of Object.entries(params)) {
      if (v == null || v === '') continue;
      for (const x of Array.isArray(v) ? v : [v]) {
        if (x == null || x === '') continue;
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(typeof x === 'boolean' ? String(x) : x)}`);
      }
    }
    return parts.join('&');
  }

  /**
   * Parametre Google Maps search (GET /maps/search-v3). Limit ide pod oboma
   * menami — `limit` z dokumentácie API, `organizationsPerQueryLimit` ako
   * v oficiálnych knižniciach Outscraperu.
   */
  function mapsParams({ queries = [], limit = 20, language = 'de', region = 'DE', async = false } = {}) {
    return {
      query: queries, limit, organizationsPerQueryLimit: limit, language, region,
      dropDuplicates: false, async: !!async,
    };
  }

  /** Adresa API z env — len známe domény Outscraperu, inak predvolená. */
  function apiBase(v) {
    try {
      const u = new URL(String(v || ''));
      if (u.protocol === 'https:' && API_HOSTS.includes(u.hostname) && !u.username && !u.password) return u.origin;
    } catch (e) { /* predvolená */ }
    return API_BASE;
  }

  /** Id asynchrónnej požiadavky — ide do cesty, takže len bezpečné znaky. */
  const requestIdOk = (id) => /^[A-Za-z0-9_-]{6,120}$/.test(String(id || ''));

  /**
   * Odpoveď Outscraperu → čo ďalej.
   *   { kind: 'done', data }   výsledky (sync, alebo hotová async)
   *   { kind: 'pending', id }  async — pýtať sa na /requests/<id>
   *   { kind: 'error', message }
   */
  function readResponse(json, httpStatus = 200) {
    if (Array.isArray(json)) return { kind: 'done', data: json };
    if (!json || typeof json !== 'object') return { kind: 'error', message: 'Outscraper vrátil prázdnu odpoveď.' };
    if (json.error || json.errorMessage) {
      return { kind: 'error', message: `Outscraper: ${clean(json.errorMessage || (typeof json.error === 'string' ? json.error : '') || 'chyba').slice(0, 300)}` };
    }
    const st = clean(json.status).toLowerCase();
    if (st === 'pending' || st === 'running' || (httpStatus === 202 && !Array.isArray(json.data))) {
      if (!requestIdOk(json.id)) return { kind: 'error', message: 'Outscraper nevrátil číslo požiadavky.' };
      return { kind: 'pending', id: String(json.id) };
    }
    if (/^(failed|error|cancel)/.test(st)) return { kind: 'error', message: `Outscraper požiadavku nedokončil (${clean(json.status)}).` };
    if (Array.isArray(json.data)) return { kind: 'done', data: json.data, id: json.id || null };
    return { kind: 'error', message: 'Outscraper vrátil odpoveď bez výsledkov.' };
  }

  /** HTTP chyba → veta pre človeka. Kľúč sa do nej nikdy nedostane. */
  function httpError(status, json) {
    const m = json && clean(json.errorMessage || (typeof json.error === 'string' ? json.error : '')).slice(0, 200);
    if (status === 401 || status === 403) return 'Outscraper odmietol kľúč — skontrolujte OUTSCRAPER_API_KEY v Netlify.';
    if (status === 402) return 'Na účte Outscraper nie je kredit (402). Doplňte ho v app.outscraper.com → Billing.';
    if (status === 429) return 'Outscraper hlási priveľa požiadaviek naraz (429). Skúste to o chvíľu.';
    if (status >= 500) return `Outscraper má poruchu (${status}). Skúste to o chvíľu.`;
    return `Outscraper vrátil chybu ${status}${m ? `: ${m}` : ''}.`;
  }

  /**
   * Výsledky → skupiny po dotazoch. Outscraper vracia pole polí (jedno na
   * dotaz, v poradí dotazov); pri jednom poli sa skupina určí podľa poľa
   * `query` pri firme.
   * @returns {Array<Array<Object>>} skupina na každý dotaz
   */
  function groups(data, queries = []) {
    const list = Array.isArray(data) ? data : [];
    const n = Math.max(1, (queries || []).length);
    if (list.length && list.every(x => Array.isArray(x))) {
      return Array.from({ length: Math.max(n, list.length) }, (_, i) => (list[i] || []).filter(x => x && typeof x === 'object'));
    }
    const out = Array.from({ length: n }, () => []);
    const idx = new Map((queries || []).map((q, i) => [lower(q), i]));
    for (const p of list) {
      if (!p || typeof p !== 'object') continue;
      const i = idx.has(lower(p.query)) ? idx.get(lower(p.query)) : (n === 1 ? 0 : -1);
      if (i >= 0) out[i].push(p); else out[0].push(p);
    }
    return out;
  }

  /** Všetky firmy spolu (s poradím dotazu v `_q`). */
  function flatten(data, queries = []) {
    return groups(data, queries).flatMap((g, i) => g.map(p => ({ ...p, _q: i })));
  }

  // ── Firma z Máp ─────────────────────────────────────────────────────────
  /** „Web" na sociálnej sieti nie je web firmy — Impressum tam nie je. */
  const SOCIAL = /(^|\.)(facebook\.com|fb\.com|instagram\.com|linkedin\.com|xing\.com|twitter\.com|x\.com|youtube\.com|tiktok\.com|wa\.me|whatsapp\.com|google\.com|goo\.gl|g\.page|business\.site|linktr\.ee|myhammer\.de|check24\.de|gelbeseiten\.de|11880\.com|yelp\.de|yelp\.com|houzz\.de|wlw\.de)$/i;

  function categoriesOf(p) {
    const raw = [];
    const push = (v) => {
      if (Array.isArray(v)) v.forEach(push);
      else if (typeof v === 'string') v.split(/\s*,\s*/).forEach(x => raw.push(x));
    };
    push(p.category); push(p.type); push(p.subtypes); push(p.types);
    return uniq(raw.map(x => clean(x).slice(0, 60)).filter(x => x.length >= 2)).slice(0, 8);
  }

  function phoneOf(v) {
    const s = clean(Array.isArray(v) ? v[0] : v);
    if (!s) return null;
    const S = Seeds();
    if (/^(\+|00)\s?49|^\(?0\d/.test(s) && S) return S.normPhone(s) || cut(s, 40);
    return /\d{5,}/.test(s.replace(/\D/g, '')) ? cut(s, 40) : null;
  }

  function num(v, lo, hi) {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
  }

  const MAPS_URL = /^https:\/\/(www\.)?google\.[a-z.]{2,8}\/maps\//i;

  /**
   * Jedna firma z Outscraperu → náš tvar. Cudzí vstup: všetko sa oreže
   * a overí; web na sociálnej sieti sa neberie ako web firmy.
   */
  function normPlace(raw = {}) {
    const S = Seeds();
    const p = raw || {};
    const siteRaw = clean(p.site || p.website || '');
    let website = siteRaw ? S.siteUrl(siteRaw) : null;
    const social = website && SOCIAL.test(S.hostOf(website)) ? website : null;
    if (social) website = null;
    const placeId = cut(p.place_id, 200);
    const googleId = cut(p.google_id, 200);
    const plz = clean(p.postal_code).replace(/\s/g, '');
    const status = normStatus(p.business_status);
    const rating = num(p.rating, 0, 5);
    const reviews = num(p.reviews, 0, 1e7);
    const lat = num(p.latitude != null ? p.latitude : p.lat, -90, 90);
    const lng = num(p.longitude != null ? p.longitude : p.lng, -180, 180);
    const link = clean(p.location_link);
    const street = cut(p.street, 200)
      || (p.full_address ? cut(String(p.full_address).split(',')[0], 200) : null);
    return {
      key: placeId || googleId || null,
      place_id: placeId, google_id: googleId,
      name: cut(p.name, 200),
      website, domain: website ? S.baseDomain(website) : null, social,
      phone: phoneOf(p.phone),
      address: street && /\d/.test(street) ? street : null,
      postal_code: /^\d{5}$/.test(plz) ? plz : cut(plz, 12),
      city: cut(p.city, 120),
      region: cut(p.state || p.us_state, 80),
      country_code: cut(p.country_code, 4) ? cut(p.country_code, 4).toUpperCase() : null,
      lat, lng,
      rating: rating == null ? null : Math.round(rating * 10) / 10,
      reviews_count: reviews == null ? null : Math.round(reviews),
      business_status: status,
      categories: categoriesOf(p),
      verified: p.verified === true || p.verified === 'true',
      description: cut(p.description, 400),
      maps_url: MAPS_URL.test(link) ? link.slice(0, 500)
        : placeId ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}` : null,
      query: cut(p.query, 120),
    };
  }

  // ── Vyradenie ───────────────────────────────────────────────────────────
  const DROP = {
    no_name: 'bez mena',
    closed: 'natrvalo zatvorená',
    foreign: 'mimo Nemecka',
    no_web: 'bez webu',
    duplicate: 'duplicita vo výsledku',
    known: 'už ju máme',
    seed: 'zadaná firma',
    optout: 'odhlásila sa z e-mailov',
    low_score: 'nízke skóre',
    over_count: 'nad zvolený počet',
  };

  /**
   * Čo z výsledku Máp ide ďalej. Poradie dôvodov je pevné, každá firma má
   * jeden dôvod. Dočasne zatvorená ostáva, len sa označí.
   * @returns {{ kept: Object[], dropped: Array<{ place, code }>, stats: Object, tempClosed: number }}
   */
  function filterPlaces(places, { leads = [], partners = [], optouts = [], seeds = [], placeIds = [], withoutWeb = false, country = 'DE' } = {}) {
    const S = Seeds();
    const stats = Object.fromEntries(Object.keys(DROP).map(k => [k, 0]));
    const dropped = [];
    const drop = (place, code) => { stats[code]++; dropped.push({ place, code }); };
    const knownIds = new Set((placeIds || []).filter(Boolean).map(String));
    const seenIds = new Set(), seenDoms = new Set(), seenNames = new Set();
    const first = [];
    for (const p of places || []) {
      if (!p || !p.name) { drop(p, 'no_name'); continue; }
      if (p.business_status === 'CLOSED_PERMANENTLY') { drop(p, 'closed'); continue; }
      if (country && p.country_code && p.country_code !== country) { drop(p, 'foreign'); continue; }
      if (!p.website && !withoutWeb) { drop(p, 'no_web'); continue; }
      const ids = [p.place_id, p.google_id].filter(Boolean);
      if (ids.some(i => knownIds.has(i))) { drop(p, 'known'); continue; }
      const nk = `${S.normName(p.name)}|${p.postal_code || lower(p.city)}`;
      if (ids.some(i => seenIds.has(i)) || (p.domain && seenDoms.has(p.domain)) || seenNames.has(nk)) { drop(p, 'duplicate'); continue; }
      ids.forEach(i => seenIds.add(i));
      if (p.domain) seenDoms.add(p.domain);
      seenNames.add(nk);
      first.push(p);
    }
    // Už ich máme / odhlásené / zadané — to isté pravidlo ako pri AI (seeds.js).
    const asRow = (p) => ({ name: p.name, city: p.city, website: p.website, email: null, _p: p });
    const { fresh, known } = S.dedupe(first.map(asRow), { leads, partners, optouts, seeds });
    for (const k of known) {
      const code = k.why === 'je to zadaná firma' ? 'seed' : k.why === 'odhlásila sa' ? 'optout'
        : k.why === 'dvakrát v tom istom výsledku' ? 'duplicate' : 'known';
      drop(k.row._p, code);
    }
    const kept = fresh.map(r => r._p);
    const tempClosed = kept.filter(p => p.business_status === 'CLOSED_TEMPORARILY').length;
    return { kept, dropped, stats, tempClosed };
  }

  // ── E-mail a kontakty ───────────────────────────────────────────────────
  const emailsOf = (list) => (Array.isArray(list) ? list : list ? [list] : [])
    .map(e => (typeof e === 'string' ? e : e && (e.value || e.email || e.address)))
    .map(lower).filter(Boolean);

  /**
   * E-mail z kontaktov Outscraperu: firemný z vlastnej domény (info@,
   * kontakt@, büro@) má prednosť; osobný len z vlastnej domény; cudzia
   * doména nie (to býva webdizajnér).
   */
  function pickContactEmail(emails, website) {
    const S = Seeds();
    const list = emailsOf(emails);
    const dom = S.baseDomain(website);
    const trusted = dom ? list.filter(e => S.baseDomain(e) === dom) : [];
    return S.pickEmail(list, { website, trusted });
  }

  /**
   * Odpoveď /emails-and-contacts → doména → { emails, phones }.
   * Berie oba tvary (pole záznamov aj pole polí).
   */
  function readContacts(data) {
    const S = Seeds();
    const out = new Map();
    const walk = (x) => {
      if (Array.isArray(x)) return x.forEach(walk);
      if (!x || typeof x !== 'object') return;
      const d = S.baseDomain(x.domain || x.query || x.site || '');
      if (!d) return;
      const cur = out.get(d) || { emails: [], phones: [] };
      for (const e of emailsOf(x.emails)) if (!cur.emails.includes(e)) cur.emails.push(e);
      for (const ph of (Array.isArray(x.phones) ? x.phones : [])) {
        const v = phoneOf(typeof ph === 'string' ? ph : ph && (ph.value || ph.phone));
        if (v && !cur.phones.includes(v)) cur.phones.push(v);
      }
      out.set(d, cur);
    };
    walk(data);
    return out;
  }

  // ── Skóre a výber ───────────────────────────────────────────────────────
  /**
   * Skóre od AI (jedno volanie na dávku) → vybrané firmy. Bez skóre alebo
   * pod prahom = „nízke skóre"; nad počet = „nad zvolený počet".
   * @param {Array<{ id }>} cands
   * @param {Array<{ id, score, why, similar_to_url, trade }>} scores
   */
  function selectScored(cands, scores, { min = DEFAULT_MIN_SCORE, count = 20 } = {}) {
    const S = Seeds();
    const by = new Map((scores || []).filter(s => s && s.id != null).map(s => [String(s.id), s]));
    const scored = [], low = [];
    for (const c of cands || []) {
      const s = by.get(String(c.id));
      const sc = s ? S.score(s.score) : null;
      const x = { ...c, score: sc, why: s ? cut(s.why, 400) : null, similar_to_url: s ? s.similar_to_url || null : null,
        trade: s ? cut(s.trade, 80) : null };
      if (sc == null || sc < min) low.push(x); else scored.push(x);
    }
    scored.sort((a, b) => (b.score - a.score) || ((b.place.reviews_count || 0) - (a.place.reviews_count || 0))
      || String(a.place.name).localeCompare(String(b.place.name), 'de'));
    return { selected: scored.slice(0, count), low, over: scored.slice(count) };
  }

  // ── Riadok do databázy ──────────────────────────────────────────────────
  /**
   * Firma z Máp (+ Impressum, kontakty, skóre) → riadok `danubra_leads`.
   * Adresa a telefón z Máp (aktuálne), chýbajúce doplní Impressum. Konateľ
   * a USt-IdNr len z Impressum. Pri každom údaji je v `data_source`, odkiaľ je.
   * @param {{ place, imp?, site?, email?, score?, why?, similar_to_url?, trade?, mx? }} c
   */
  function toLead(c = {}, { searchId = null, seeds = [], now = new Date() } = {}) {
    const S = Seeds();
    const p = c.place || {};
    const imp = c.imp || {};
    const at = new Date(now).toISOString();
    const sim = (() => {
      const d = S.baseDomain(c.similar_to_url);
      const s = d && (seeds || []).find(z => S.baseDomain(z.url || z.domain) === d);
      return s ? (s.url || null) : null;
    })();
    const em = c.email && S.emailOk(c.email.email) ? c.email : null;
    const pick = (a, b) => (a ? 'maps' : b ? 'impressum' : null);
    const vat = String(imp.vat_id || '').replace(/\s/g, '');
    const row = {
      name: cut(p.name, 200),
      city: cut(p.city || imp.city, 120), postal_code: cut(p.postal_code || imp.postal_code, 12),
      address: cut(p.address || imp.address, 200), country: 'DE',
      website: p.website || null,
      email: em ? lower(em.email) : null,
      phone: cut(p.phone || imp.phone, 40),
      trade: cut(c.trade || (p.categories || [])[0], 80), why: cut(c.why, 400),
      source: 'outscraper', source_ref: cut(p.maps_url || imp.impressum_url, 300), status: 'new',
      score: S.score(c.score), seed_search_id: searchId || null,
      contact_person: cut(imp.contact_person, 160),
      impressum_url: cut(c.site && c.site.impressumUrl, 300),
      region: cut(p.region, 80),
      vat_id: /^DE\d{9}$/.test(vat) ? vat : null,
      lat: p.lat, lng: p.lng,
      google_place_id: p.place_id || p.google_id || null,
      rating: p.rating, reviews_count: p.reviews_count,
      business_status: p.business_status || null,
      categories: (p.categories || []).length ? p.categories : null,
      verified_at: at, closed_at: null,
      web_ok: p.website ? (c.site ? !!c.site.ok : null) : null,
      email_mx_ok: em && typeof c.mx === 'boolean' ? c.mx : null,
      data_source: {
        name: 'maps', website: p.website ? 'maps' : null,
        address: pick(p.address, imp.address), phone: pick(p.phone, imp.phone),
        email: em ? em.source : null, contact_person: imp.contact_person ? 'impressum' : null,
        vat_id: /^DE\d{9}$/.test(vat) ? 'impressum' : null,
        rating: p.rating != null ? 'maps' : null, maps_query: p.query || null, maps_url: p.maps_url || null,
        social: p.social || null, maps_checked_at: at,
      },
      profile: {
        summary: cut(p.description, 600), similar_to_url: sim,
        email_source: em ? em.source : null, email_kind: em ? (em.kind || S.emailKind(em.email)) : null,
        temp_closed: p.business_status === 'CLOSED_TEMPORARILY' || undefined,
      },
    };
    if (!row.profile.temp_closed) delete row.profile.temp_closed;
    return row;
  }

  /** Stĺpce z 079 — keď migrácia ešte nie je, riadok sa uloží bez nich. */
  const NEW_COLUMNS = ['google_place_id', 'rating', 'reviews_count', 'business_status', 'categories', 'verified_at',
    'closed_at', 'web_ok', 'email_mx_ok', 'data_source'];

  /** Riadok pre databázu bez 079: source 'urls', údaje z Máp v profile. */
  function legacyRow(row) {
    const out = { ...row, source: row.source === 'outscraper' ? 'urls' : row.source,
      profile: { ...(row.profile || {}), maps: {
        place_id: row.google_place_id || null, rating: row.rating ?? null, reviews: row.reviews_count ?? null,
        status: row.business_status || null, categories: row.categories || null } } };
    for (const k of NEW_COLUMNS) delete out[k];
    return out;
  }

  // ── Aktuálnosť ──────────────────────────────────────────────────────────
  /**
   * Čím firmu nájsť na Mapách: place_id (presné) alebo meno + PSČ/mesto.
   * @returns {{ q, byId } | null}
   */
  function refreshQuery(lead = {}) {
    const id = clean(lead.google_place_id);
    if (/^[A-Za-z0-9_:x-]{10,200}$/.test(id)) return { q: id, byId: true };
    const name = clean(lead.name);
    if (name.length < 2) return null;
    const where = [clean(lead.postal_code), clean(lead.city)].filter(Boolean).join(' ');
    return { q: cleanQuery(`${name}, ${where || 'Deutschland'}`) || null, byId: false };
  }

  /**
   * Ktorá z nájdených je naša firma. Podľa place_id presne; inak meno sa
   * musí zhodovať a k tomu PSČ, mesto alebo doména webu. Radšej žiadna
   * (= „na Mapách sa nenašla") než cudzia firma.
   */
  function matchPlace(lead = {}, places = [], { byId = false } = {}) {
    const S = Seeds();
    const list = (places || []).filter(p => p && p.name);
    if (!list.length) return null;
    const id = clean(lead.google_place_id);
    if (id) {
      const hit = list.find(p => p.place_id === id || p.google_id === id);
      if (hit) return hit;
      if (byId && list.length === 1) return list[0];
    }
    const n = S.normName(lead.name);
    const dom = S.baseDomain(lead.website);
    let best = null, bestScore = 0;
    for (const p of list) {
      const pn = S.normName(p.name);
      const nameOk = n && pn && (pn === n || (Math.min(pn.length, n.length) >= 5 && (pn.includes(n) || n.includes(pn))));
      const domOk = dom && p.domain && p.domain === dom;
      const plzOk = lead.postal_code && p.postal_code && String(lead.postal_code) === String(p.postal_code);
      const cityOk = lead.city && p.city && lower(lead.city) === lower(p.city);
      const sc = (domOk ? 4 : 0) + (nameOk ? 2 : 0) + (plzOk ? 2 : 0) + (cityOk ? 1 : 0);
      const ok = domOk || (nameOk && (plzOk || cityOk));
      if (ok && sc > bestScore) { best = p; bestScore = sc; }
    }
    return best;
  }

  /**
   * Zmeny po overení. Údaje z Máp sú aktuálnejšie (telefón, web), staré
   * hodnoty sa odložia do `data_source.previous`. Natrvalo zatvorená →
   * `closed_at` (stav firmy sa nemení); keď znova funguje → `closed_at` null.
   * @param {Object|null} place  normPlace, null = na Mapách sa nenašla
   * @param {{ now, webOk, mxOk, mapsChecked }} o  mapsChecked false = bez kľúča (len web a MX)
   * @returns {{ patch: Object, changes: string[] }}
   */
  function refreshPatch(lead = {}, place = null, { now = new Date(), webOk = null, mxOk = null, mapsChecked = true } = {}) {
    const S = Seeds();
    const at = new Date(now).toISOString();
    const ds = { ...(lead.data_source && typeof lead.data_source === 'object' ? lead.data_source : {}) };
    const prev = { ...(ds.previous || {}) };
    const patch = {};
    const changes = [];
    if (typeof webOk === 'boolean' && webOk !== lead.web_ok) { patch.web_ok = webOk; changes.push(webOk ? 'web funguje' : 'web nefunguje'); }
    else if (typeof webOk === 'boolean') patch.web_ok = webOk;
    if (typeof mxOk === 'boolean') { if (mxOk !== lead.email_mx_ok) changes.push(mxOk ? 'e-mail má poštový server' : 'e-mail bez poštového servera'); patch.email_mx_ok = mxOk; }
    ds.checked_at = at;
    if (mapsChecked) {
      ds.maps_checked_at = at;
      patch.verified_at = at;
      if (!place) {
        ds.maps_found = false;
        if (lead.data_source && lead.data_source.maps_found !== false) changes.push('na Mapách sa nenašla');
      } else {
        ds.maps_found = true;
        if (place.maps_url) ds.maps_url = place.maps_url;
        const id = place.place_id || place.google_id;
        if (id && !lead.google_place_id) patch.google_place_id = id;
        if (place.business_status && place.business_status !== lead.business_status) {
          patch.business_status = place.business_status;
          changes.push(`stav: ${STATUS[place.business_status][0]}`);
        }
        if (place.business_status === 'CLOSED_PERMANENTLY' && !lead.closed_at) patch.closed_at = at;
        if (place.business_status && place.business_status !== 'CLOSED_PERMANENTLY' && lead.closed_at) {
          patch.closed_at = null; changes.push('znova funguje');
        }
        if (place.phone && place.phone !== lead.phone) {
          if (lead.phone) prev.phone = lead.phone;
          patch.phone = place.phone; ds.phone = 'maps'; changes.push('telefón');
        }
        if (place.website && S.baseDomain(place.website) !== S.baseDomain(lead.website)) {
          if (lead.website) prev.website = lead.website;
          patch.website = place.website; ds.website = 'maps'; changes.push('web');
        }
        if (place.rating != null && Number(place.rating) !== Number(lead.rating)) patch.rating = place.rating;
        if (place.reviews_count != null && Number(place.reviews_count) !== Number(lead.reviews_count)) patch.reviews_count = place.reviews_count;
        if ((place.categories || []).length && !(lead.categories || []).length) patch.categories = place.categories;
        if (place.lat != null && lead.lat == null) { patch.lat = place.lat; patch.lng = place.lng; }
      }
    }
    if (Object.keys(prev).length) ds.previous = prev;
    patch.data_source = ds;
    return { patch, changes };
  }

  /** MX záznamy → je kam doručiť? „Null MX" (RFC 7505, bodka) = nie. */
  function mxVerdict(records) {
    const list = (Array.isArray(records) ? records : []).filter(r => r && clean(r.exchange) && clean(r.exchange) !== '.');
    return list.length > 0;
  }

  /** Chyba DNS → false (doména nemá MX / neexistuje), null (nevieme — výpadok). */
  function mxFromError(e) {
    const code = String((e && e.code) || '');
    return ['ENODATA', 'ENOTFOUND', 'NXDOMAIN', 'ENONAME'].includes(code) ? false : null;
  }

  /**
   * Má doména e-mailu poštový server? Nič sa neposiela, len DNS.
   * @param {string} email
   * @param {(domain: string) => Promise<Array<{ exchange, priority }>>} resolveMx
   * @returns {Promise<boolean|null>}
   */
  async function checkMx(email, resolveMx) {
    const S = Seeds();
    const dom = S.hostOf(email);
    if (!dom || typeof resolveMx !== 'function') return null;
    try { return mxVerdict(await resolveMx(dom)); } catch (e) { return mxFromError(e); }
  }

  /**
   * Na týždenné overenie: najdlhšie neoverené firmy, ktoré ešte môžeme
   * osloviť (nie archivované, zatvorené, odberatelia, odhlásené, bez záujmu),
   * overené pred viac ako `minAgeDays` dňami (alebo nikdy).
   */
  function pickStale(leads, { now = new Date(), limit = 50, minAgeDays = 7 } = {}) {
    const t = new Date(now).getTime();
    return (leads || [])
      .filter(l => l && !l.archived_at && !l.closed_at && !['won', 'unsubscribed', 'rejected'].includes(l.status))
      .filter(l => !l.verified_at || t - Date.parse(l.verified_at) >= minAgeDays * 864e5)
      .sort((a, b) => (a.verified_at ? Date.parse(a.verified_at) : 0) - (b.verified_at ? Date.parse(b.verified_at) : 0))
      .slice(0, Math.max(0, limit));
  }

  /** Týždenné overenie beží v pondelok (deň v tvare YYYY-MM-DD). */
  function isRefreshDay(ymd) {
    const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.getUTCDay() === 1;
  }

  /** Koľko firiem overiť týždenne (OUTSCRAPER_REFRESH_WEEKLY): 0 = vypnuté, predvolene 50, najviac 500. */
  function weeklyLimit(v) {
    if (v === '' || v == null) return 50;
    const n = int(v, NaN);
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), 500) : 50;
  }

  // ── Pre appku ───────────────────────────────────────────────────────────
  /** Stav firmy na Mapách → [kľúč, nápis, farba] alebo null (neznámy). */
  function stateOf(lead = {}) {
    if (lead.closed_at || lead.business_status === 'CLOSED_PERMANENTLY') return ['closed', ...STATUS.CLOSED_PERMANENTLY];
    if (lead.business_status === 'CLOSED_TEMPORARILY') return ['temp', ...STATUS.CLOSED_TEMPORARILY];
    if (lead.business_status === 'OPERATIONAL') return ['ok', ...STATUS.OPERATIONAL];
    return null;
  }

  /** Dni od overenia (celé), alebo null. */
  function daysSince(ts, now = new Date()) {
    const t = Date.parse(ts || '');
    if (!Number.isFinite(t)) return null;
    return Math.max(0, Math.floor((new Date(now).getTime() - t) / 864e5));
  }

  /** „Overené dnes / včera / pred 5 dňami" alebo null. */
  function verifiedLabel(ts, now = new Date()) {
    const d = daysSince(ts, now);
    if (d == null) return null;
    if (d === 0) return 'Overené dnes';
    if (d === 1) return 'Overené včera';
    return `Overené pred ${d} dňami`;
  }

  /** Štítky pri firme: Zatvorená, Dočasne zatvorená, Web nefunguje, E-mail neoverený, Na Mapách sa nenašla. */
  function flags(lead = {}) {
    const out = [];
    const st = stateOf(lead);
    if (st && st[0] !== 'ok') out.push({ key: st[0], label: st[1], tone: st[2] });
    if (lead.web_ok === false && lead.website) out.push({ key: 'web', label: 'Web nefunguje', tone: 'amber' });
    if (lead.email_mx_ok === false && lead.email) out.push({ key: 'mx', label: 'E-mail neoverený', tone: 'amber' });
    if (lead.data_source && lead.data_source.maps_found === false) out.push({ key: 'maps', label: 'Na Mapách sa nenašla', tone: 'gray' });
    return out;
  }

  /** „4,6 · 38" (hodnotenie · počet recenzií) alebo ''. */
  function ratingLabel(lead = {}) {
    if (lead.rating == null || lead.rating === '') return '';
    const r = Number(lead.rating);
    if (!Number.isFinite(r)) return '';
    const n = Number(lead.reviews_count);
    return `${r.toFixed(1).replace('.', ',')}${Number.isFinite(n) && lead.reviews_count != null ? ` · ${n}` : ''}`;
  }

  /** Prehľad hľadania pre appku: [[nápis, počet]] vyradených, len nenulové. */
  function dropSummary(stats) {
    const d = (stats && stats.dropped) || {};
    return Object.keys(DROP).filter(k => Number(d[k]) > 0).map(k => [DROP[k], Number(d[k])]);
  }

  const API = {
    API_BASE, API_HOSTS, DEFAULT_MAX_RECORDS, MAX_QUERIES, RESERVE, MIN_SCORES, DEFAULT_MIN_SCORE, STATUS, DROP, NEW_COLUMNS,
    normStatus, maxRecords, minScore, budget, cleanQuery, combine, planQueries, estimate,
    queryString, mapsParams, apiBase, requestIdOk, readResponse, httpError, groups, flatten,
    categoriesOf, normPlace, filterPlaces, pickContactEmail, readContacts, selectScored, toLead, legacyRow,
    refreshQuery, matchPlace, refreshPatch, mxVerdict, mxFromError, checkMx, pickStale, isRefreshDay, weeklyLimit,
    stateOf, daysSince, verifiedLabel, flags, ratingLabel, dropSummary,
  };
  if (typeof window !== 'undefined') window.DanubraOutscraper = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
