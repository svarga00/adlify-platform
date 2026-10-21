// ============================================================================
// DANUBRA — cesta od kandidáta na stavbu
// ============================================================================
// „Zadám adresu náborovaného a viem mu hneď povedať, koľko trvá cesta."
//
// Prvá otázka, ktorú živnostník v telefóne položí, je „a kde to je?". Druhá
// „koľko sa tam ide?". Kto to vie povedať hneď, pôsobí ako firma, ktorá to
// robí každý týždeň — a kto to musí hľadať, stratí ho.
//
// Adresa → súradnice: OpenStreetMap (Nominatim). Trasa autom: OSRM. Obe
// služby sú verejné a bez kľúča; volá ich server (`danubra-route`), nie
// prehliadač. Tu sú len čisté funkcie — zostavenie adresy dotazu, prečítanie
// odpovede a text pre človeka —, aby sa dali otestovať bez siete.
//
// Testy: node app/lib/route.test.js
// ============================================================================
(function () {
  const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  const OSRM = 'https://router.project-osrm.org/route/v1/driving';
  // Odkiaľ ľudia chodia a kam: SK, CZ, DE, AT, PL, HU. Bez obmedzenia by
  // „Senec" našlo aj niečo na druhom konci sveta.
  const KRAJINY = 'sk,cz,de,at,pl,hu';

  const num = (v) => Number(v);
  const ok = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

  function geocodeUrl(q) {
    const p = new URLSearchParams({ format: 'json', limit: '1', addressdetails: '0',
      countrycodes: KRAJINY, q: String(q || '').trim() });
    return `${NOMINATIM}?${p.toString()}`;
  }

  /**
   * Podoby adresy, ktoré sa skúsia za sebou, kým sa niečo nenájde.
   *
   * „93437 Lixenried b. Furth im Walde, Nemecko" Nominatim nenájde: „b." je
   * skratka (bei) a „Nemecko" je po slovensky. Skúsi sa očistená adresa,
   * potom PSČ s obcou, pôvodný text a nakoniec samotná obec.
   */
  const KRAJINY_SLOVOM = /\b(Nemecko|Nemecku|Rakúsko|Rakúsku|Česko|Česku|Slovensko|Slovensku|Poľsko|Maďarsko|Deutschland|Germany|Österreich|Austria)\b/gi;
  function variants(q) {
    const t = String(q || '').trim();
    if (!t) return [];
    const ciste = t.replace(/\bb\.\s*/gi, 'bei ').replace(/\bi\.\s*/g, 'im ')
      .replace(KRAJINY_SLOVOM, '').replace(/\s*,\s*(,\s*)+/g, ', ')
      .replace(/^[,\s]+|[,\s]+$/g, '').replace(/\s{2,}/g, ' ').trim();
    const psc = (t.match(/\b(\d{4,5})\b/) || [])[1];
    const obec = ciste.replace(/\b\d{4,5}\b/g, '').split(',')[0].trim().split(/\s+/)[0] || '';
    const out = [ciste, psc && obec ? `${psc} ${obec}` : '', t, obec];
    return [...new Set(out.map(x => x.trim()).filter(x => x.length > 1))];
  }

  /** Prvý výsledok Nominatimu → { lat, lng, label } alebo null. */
  function pickPlace(json) {
    const r = Array.isArray(json) ? json[0] : null;
    if (!r) return null;
    const lat = num(r.lat), lng = num(r.lon);
    if (!ok(lat, lng)) return null;
    // „Žilina, okres Žilina, Žilinský kraj, Slovensko" → prvé dve časti stačia.
    const label = String(r.display_name || '').split(',').map(s => s.trim())
      .filter(Boolean).slice(0, 2).join(', ');
    return { lat, lng, label };
  }

  function routeUrl(a, b) {
    return `${OSRM}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=simplified&geometries=geojson`;
  }

  /** Odpoveď OSRM → { km, minutes, line: [[lat,lng]...] } alebo null. */
  function pickRoute(json) {
    const r = json && json.code === 'Ok' && Array.isArray(json.routes) ? json.routes[0] : null;
    if (!r || !Number.isFinite(r.distance) || !Number.isFinite(r.duration)) return null;
    const coords = (r.geometry && Array.isArray(r.geometry.coordinates)) ? r.geometry.coordinates : [];
    return {
      km: Math.round(r.distance / 1000),
      minutes: Math.round(r.duration / 60),
      // GeoJSON je [lng, lat]; mapa chce [lat, lng].
      line: coords.filter(c => Array.isArray(c) && c.length >= 2).map(c => [c[1], c[0]]),
    };
  }

  /** 365 → „6 h 05 min", 45 → „45 min". */
  function durationText(min) {
    const m = Math.max(0, Math.round(Number(min) || 0));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} h ${String(r).padStart(2, '0')} min` : `${h} h`;
  }

  /** Veta do hovoru: „612 km autom, asi 6 h 05 min." */
  function sentence(route) {
    if (!route) return '';
    return `${route.km} km autom, asi ${durationText(route.minutes)}.`;
  }

  /** Odkaz na celú trasu v Google Mapách — na poslanie do správy. */
  function googleDirUrl(from, to) {
    const p = new URLSearchParams({ api: '1', travelmode: 'driving',
      origin: typeof from === 'string' ? from : `${from.lat},${from.lng}`,
      destination: typeof to === 'string' ? to : `${to.lat},${to.lng}` });
    return `https://www.google.com/maps/dir/?${p.toString()}`;
  }

  /**
   * Kam ide: miesto zo zhrnutia zákazky, inak mesto náboru, inak mesto
   * zákazky. Bez krajiny by „Furth" mohol byť ktorýkoľvek.
   */
  function destinationOf(plan = {}, sub = {}) {
    const a = (plan && plan.analysis) || {};
    const miesto = String(a.place || '').trim();
    if (miesto && !miesto.includes('[XX]')) return miesto;
    const mesto = (plan && plan.city) || (sub && (sub.site_address || sub.site_city)) || '';
    if (!mesto) return '';
    const krajina = (plan && plan.country) || 'DE';
    return krajina === 'DE' && !/nemeck|deutschland|germany/i.test(mesto)
      ? `${mesto}, Deutschland` : mesto;
  }

  const API = { KRAJINY, variants, geocodeUrl, pickPlace, routeUrl, pickRoute, durationText,
    sentence, googleDirUrl, destinationOf };
  if (typeof window !== 'undefined') window.DanubraRoute = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
