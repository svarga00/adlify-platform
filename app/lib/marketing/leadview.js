// ============================================================================
// DANUBRA — firma na prvý pohľad: logo, vzdialenosť, „Čo sme zistili"
// ============================================================================
// „Hneď hore musí byť, KDE to je, AKO ĎALEKO je to od nás, telefón, web
// a ďalšie dôležité veci, ideálne s krátkym popisom firmy a tým, čo sa
// nám o nej podarilo zistiť."
//
// Čisté funkcie pre zoznam Nové firmy a detail firmy (js/modules/leads.js):
//
//   initials, hue        náhradné logo: iniciály na farbe podľa mena
//   faviconUrl           ikona webu cez službu Google (s2/favicons, 64 px),
//                        kým firma nemá uložené vlastné logo (082) — keď
//                        služba nič nevráti (16 px glóbus) alebo je
//                        zablokovaná, ostanú iniciály
//   logoSources          poradie zdrojov: uložené logo → favicon → iniciály
//   distances            vzdušnou čiarou od kancelárie (súradnice
//                        z Nastavení) a k najbližšej bežiacej zákazke;
//                        odhad cesty autom = km × 1,3 / 75 km/h („približne")
//   summary              krátky popis a 2–5 viet „Čo sme zistili" z údajov,
//                        ktoré už máme (bez volania AI pri otvorení)
//
// Testy: node app/lib/marketing/leadview.test.js
// ============================================================================
(function () {
  const ROAD = 1.3;          // cesta autom býva o tretinu dlhšia než vzdušná čiara
  const SPEED = 75;          // km/h priemer (diaľnica + okresky)
  const LEGAL = /\b(gmbh|mbh|co|kg|ag|ug|ohg|gbr|e\s?\.?\s?k|e\s?\.?\s?v|haftungsbeschränkt|inh|inhaber|und|&)\b\.?/gi;

  const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const validLL = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

  /** „Maier Innenausbau GmbH" → „MI", „Trockenbau Huber & Söhne" → „TH". */
  function initials(name) {
    const words = String(name || '').replace(LEGAL, ' ').replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/[\s-]+/).filter(Boolean);
    if (!words.length) return '?';
    const a = words[0][0] || '';
    const b = words.length > 1 ? words[1][0] : (words[0][1] || '');
    return `${a}${b}`.toUpperCase();
  }

  /** Farba (odtieň 0–359) podľa mena — tá istá firma má vždy tú istú. */
  function hue(name) {
    let h = 0;
    for (const ch of String(name || '').toLowerCase()) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h % 360;
  }

  /** Doména webu bez www.: „https://www.maier-ausbau.de/kontakt" → „maier-ausbau.de". */
  function domainOf(website) {
    const w = String(website || '').trim();
    if (!w) return '';
    try {
      const u = new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`);
      return u.hostname.replace(/^www\./i, '').toLowerCase();
    } catch (e) { return ''; }
  }

  /** Ikona webu cez Google (bez kľúča, len doména). */
  function faviconUrl(domain, size = 64) {
    const d = String(domain || '').trim().toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return '';
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=${size}`;
  }

  /** Uložené logo (082) → favicon služby → iniciály. */
  function logoSources(lead) {
    const l = lead || {};
    const fav = faviconUrl(domainOf(l.website));
    const own = /^https:\/\//i.test(String(l.logo_url || '')) ? String(l.logo_url) : '';
    return { src: own || fav, fallback: own && fav && own !== fav ? fav : '', initials: initials(l.name), hue: hue(l.name) };
  }

  /** Súradnice kancelárie z Nastavení (supplier.office_coords „48.1, 17.1" alebo office_lat/lng). */
  function officeOf(supplier, parse) {
    const s = supplier || {};
    const lat = num(s.office_lat), lng = num(s.office_lng);
    if (lat != null && lng != null && validLL(lat, lng)) return { lat, lng };
    const t = String(s.office_coords || '').trim();
    if (!t) return null;
    if (typeof parse === 'function') return parse(t);
    const m = t.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
    if (!m) return null;
    const a = Number(m[1].replace(',', '.')), b = Number(m[2].replace(',', '.'));
    return validLL(a, b) ? { lat: a, lng: b } : null;
  }

  function km(a, b) {
    if (!a || !b) return null;
    const la1 = num(a.lat), ln1 = num(a.lng), la2 = num(b.lat), ln2 = num(b.lng);
    if (la1 == null || la2 == null || ln1 == null || ln2 == null || !validLL(la1, ln1) || !validLL(la2, ln2)) return null;
    const R = 6371, rad = Math.PI / 180;
    const h = Math.sin(((la2 - la1) * rad) / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(((ln2 - ln1) * rad) / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /** „cca 4,2 km", „cca 312 km" (pod 10 km na desatiny). */
  function fmtKm(k) {
    if (k == null) return '';
    if (k < 1) return 'menej ako 1 km';
    return `cca ${k < 10 ? String(Math.round(k * 10) / 10).replace('.', ',') : Math.round(k)} km`;
  }
  /** Odhad cesty autom: „približne 1 h 20 min autom". */
  function driveText(k) {
    if (k == null) return '';
    const min = Math.max(5, Math.round(((k * ROAD) / SPEED) * 60 / 5) * 5);
    const h = Math.floor(min / 60), m = min % 60;
    return `približne ${h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`} autom`;
  }

  /**
   * Ako ďaleko je firma: od kancelárie a k najbližšej bežiacej zákazke.
   * @param lead    { lat, lng }
   * @param office  { lat, lng } | null
   * @param sites   [{ id, title, city, lat, lng }] — bežiace zákazky so súradnicami
   * @returns { has, office: {km, text, drive}|null, site: {km, text, drive, id, title, city}|null }
   */
  function distances(lead, { office = null, sites = [] } = {}) {
    const here = lead && num(lead.lat) != null && num(lead.lng) != null ? { lat: num(lead.lat), lng: num(lead.lng) } : null;
    const of = here && office ? km(here, office) : null;
    let best = null;
    if (here) {
      for (const s of sites || []) {
        const d = km(here, s);
        if (d != null && (!best || d < best.km)) best = { km: d, id: s.id, title: s.title || s.name || '', city: s.city || s.site_city || '' };
      }
    }
    const pack = (k) => ({ km: Math.round(k * 10) / 10, text: `${fmtKm(k)} vzdušnou čiarou`, drive: driveText(k) });
    return {
      has: !!here,
      office: of == null ? null : pack(of),
      site: best ? { ...pack(best.km), id: best.id, title: best.title, city: best.city } : null,
    };
  }

  /** Odkaz na Google Mapy: z Outscraperu, inak súradnice, inak adresa. */
  function mapsUrl(lead) {
    const l = lead || {};
    const ds = l.data_source || {};
    if (/^https:\/\/(www\.)?google\.[a-z.]+\/maps\//i.test(String(ds.maps_url || ''))) return ds.maps_url;
    const lat = num(l.lat), lng = num(l.lng);
    if (lat != null && lng != null && validLL(lat, lng)) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    const q = [l.name, l.address, [l.postal_code, l.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : '';
  }

  /** Celá adresa jedným riadkom. */
  function addressLine(lead) {
    const l = lead || {};
    const city = [l.postal_code, l.city].filter(Boolean).join(' ');
    const a = String(l.address || '').trim();
    // Z Google Máp býva adresa celá („Hauptstr. 5, 86150 Augsburg").
    if (a && l.city && a.toLowerCase().includes(String(l.city).toLowerCase())) return a;
    return [a, city].filter(Boolean).join(', ');
  }

  const daysAgo = (iso, now) => {
    const t = Date.parse(iso || '');
    if (!Number.isFinite(t)) return null;
    return Math.floor((now - t) / 86400000);
  };
  const whenText = (d) => (d == null ? '' : d <= 0 ? 'dnes' : d === 1 ? 'včera' : d < 31 ? `pred ${d} dňami` : d < 365 ? `pred ${Math.round(d / 30)} mes.` : 'pred viac ako rokom');
  const plural = (n, a, b, c) => (n === 1 ? a : n >= 2 && n <= 4 ? b : c);
  const dec = (v) => String(Number(v).toFixed(1)).replace('.', ',');
  const cut = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t; };

  /**
   * Krátky popis firmy a „Čo sme zistili" — z uložených údajov.
   * @returns { text: string, found: string[] }
   */
  function summary(lead, { now = Date.now(), emailFrom = {} } = {}) {
    const l = lead || {};
    const p = l.profile || {};
    const text = cut(l.site_description || p.summary || l.why || '', 280);
    const found = [];
    const cats = Array.isArray(l.categories) ? l.categories.filter(Boolean).slice(0, 3) : [];
    const what = [cats.length ? `Na Google Mapách: ${cats.join(', ')}` : (l.trade ? `Remeslo: ${l.trade}` : ''),
      l.employees ? `cca ${l.employees} zamestnancov (odhad)` : ''].filter(Boolean);
    if (what.length) found.push(`${what.join('; ')}.`);
    const r = num(l.rating), n = num(l.reviews_count);
    if (r != null) {
      found.push(`Hodnotenie ${dec(r)} z 5${n != null ? ` (${n} ${plural(n, 'recenzia', 'recenzie', 'recenzií')})` : ''} na Google Mapách${
        l.business_status === 'CLOSED_PERMANENTLY' || l.closed_at ? ' — firma je podľa Máp natrvalo zatvorená' : l.business_status === 'CLOSED_TEMPORARILY' ? ' — dočasne zatvorená' : ''}.`);
    }
    if (l.score != null) {
      const sim = p.similar_to_url ? domainOf(p.similar_to_url) : '';
      found.push(`AI odhadla podobnosť so zadanými firmami na ${Number(l.score)} zo 100${sim ? `, najviac sa podobá na ${sim}` : ''}.`);
    }
    const kontakt = [
      l.email ? `e-mail ${emailFrom[p.email_source] || ''}`.trim() : '',
      l.contact_person ? `konateľ ${l.contact_person}` : '',
      l.vat_id ? `USt-IdNr ${l.vat_id}` : '',
      l.phone ? 'telefón' : '',
    ].filter(Boolean);
    if (kontakt.length) found.push(`Z webu a Impressum máme: ${kontakt.join(', ')}.`);
    if (Number(l.relevance) === 1) found.push('Označili ste ju palcom hore — takéto firmy chceme.');
    else if (Number(l.relevance) === -1) found.push(`Označili ste ju palcom dole${l.relevance_note ? ` (${l.relevance_note})` : ''}.`);
    const ver = [];
    const dv = daysAgo(l.verified_at, now);
    if (dv != null) ver.push(`na Google Mapách overená ${whenText(dv)}`);
    if (l.web_ok === true) ver.push('web odpovedá');
    else if (l.web_ok === false) ver.push('web neodpovedal');
    if (l.email_mx_ok === false) ver.push('doména e-mailu nemá poštový server');
    if (ver.length) found.push(`${ver.join(', ').replace(/^./, c => c.toUpperCase())}.`);
    return { text, found: found.slice(0, 6) };
  }

  const API = { ROAD, SPEED, initials, hue, domainOf, faviconUrl, logoSources, officeOf, km, fmtKm, driveText, distances,
    mapsUrl, addressLine, summary, whenText };
  if (typeof window !== 'undefined') window.DanubraLeadView = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
