// ============================================================================
// DANUBRA — ubytovanie v okolí stavby
// ============================================================================
// „Potreboval by som zakomponovať vyhľadávanie ubytovania v okolí."
//
// Zdroj je OpenStreetMap (Overpass API) — verejný, bez kľúča: hotely,
// penzióny, ubytovne, motely, apartmány v okruhu od stavby. Volá ho server
// (`danubra-lodging-search`), tu sú len čisté funkcie: dotaz, prečítanie
// odpovede, vzdialenosť a odkazy na Booking a Monteurzimmer.
//
// OSM nemá ceny ani voľné lôžka — to sa zistí telefonátom. Preto je pri
// každom mieste telefón a web, ak ich OSM pozná.
//
// Testy: node app/lib/lodging/nearby.test.js
// ============================================================================
(function () {
  const TYPES = {
    hotel: 'Hotel', guest_house: 'Penzión', hostel: 'Ubytovňa / hostel', motel: 'Motel',
    apartment: 'Apartmán', chalet: 'Chata',
  };

  /** Dotaz pre Overpass: ubytovanie v okruhu (km) od bodu. */
  // Netlify funkcia smie bežať ~10 s — dotaz musí skončiť skôr.
  const OVERPASS = ['https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];

  function overpassQuery({ lat, lng, radiusKm = 10, limit = 80, timeout = 8 } = {}) {
    const r = Math.round(Math.min(Math.max(Number(radiusKm) || 10, 1), 50) * 1000);
    const la = Number(lat).toFixed(6), ln = Number(lng).toFixed(6);
    return `[out:json][timeout:${timeout}];`
      + `(nwr["tourism"~"^(${Object.keys(TYPES).join('|')})$"](around:${r},${la},${ln}););`
      + `out center tags ${Math.max(1, Math.min(200, limit))};`;
  }

  const toRad = (d) => (d * Math.PI) / 180;
  /** Vzdušná vzdialenosť v km (haversine), na desatinu. */
  function distanceKm(a, b) {
    const R = 6371;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(x)) * 10) / 10;
  }

  const clean = (v) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();

  /**
   * Odpoveď Overpassu → miesta zoradené podľa vzdialenosti. Monteurzimmer
   * (ubytovanie pre robotníkov) idú dopredu — na to sú stavaní a zvyčajne
   * sú lacnejšie a s parkovaním pre dodávku.
   */
  function parse(json, origin) {
    const els = (json && Array.isArray(json.elements)) ? json.elements : [];
    const out = [];
    const videne = new Set();
    for (const e of els) {
      const t = e.tags || {};
      const lat = Number(e.lat != null ? e.lat : e.center && e.center.lat);
      const lng = Number(e.lon != null ? e.lon : e.center && e.center.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const type = TYPES[t.tourism] ? t.tourism : null;
      if (!type) continue;
      const name = clean(t.name);
      const text = `${name} ${clean(t.description)} ${clean(t['name:de'])}`.toLowerCase();
      const monteur = /monteur|arbeiter|handwerker|pension für monteure/.test(text);
      const key = `${name.toLowerCase()}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
      if (videne.has(key)) continue;
      videne.add(key);
      const street = [clean(t['addr:street']), clean(t['addr:housenumber'])].filter(Boolean).join(' ');
      out.push({
        osm: `${e.type}/${e.id}`,
        name: name || `${TYPES[type]} bez názvu`,
        named: !!name,
        type, typeLabel: TYPES[type], monteur,
        lat, lng,
        distanceKm: origin ? distanceKm(origin, { lat, lng }) : null,
        address: street || null,
        postcode: clean(t['addr:postcode']) || null,
        city: clean(t['addr:city']) || null,
        phone: clean(t.phone || t['contact:phone']) || null,
        email: clean(t.email || t['contact:email']) || null,
        website: clean(t.website || t['contact:website'] || t.url) || null,
        stars: clean(t.stars) || null,
        rooms: Number(t.rooms) || null,
        beds: Number(t.beds) || null,
      });
    }
    return out.sort((a, b) => (b.monteur - a.monteur)
      || (b.named - a.named)
      || ((a.distanceKm ?? 999) - (b.distanceKm ?? 999)));
  }

  /** Odkazy, kde hľadať ďalej (OSM nemá všetko a nemá ceny). */
  function links({ city = '', lat, lng, from, to, persons = 1 } = {}) {
    const q = encodeURIComponent;
    const ok = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
    const den = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? d : null);
    const book = new URLSearchParams({ ss: city || '', group_adults: String(Math.max(1, Number(persons) || 1)),
      no_rooms: String(Math.max(1, Math.ceil((Number(persons) || 1) / 2))), lang: 'sk' });
    if (den(from)) book.set('checkin', den(from));
    if (den(to)) book.set('checkout', den(to));
    return [
      { key: 'monteur', label: 'Monteurzimmer v okolí', hint: 'ubytovanie pre robotníkov',
        url: `https://www.google.com/search?q=${q(`Monteurzimmer ${city}`.trim())}` },
      { key: 'maps', label: 'Mapa: Monteurzimmer', hint: 'Google Mapy okolo stavby',
        url: ok ? `https://www.google.com/maps/search/Monteurzimmer/@${Number(lat).toFixed(5)},${Number(lng).toFixed(5)},12z`
          : `https://www.google.com/maps/search/${q(`Monteurzimmer ${city}`.trim())}` },
      { key: 'booking', label: 'Booking.com', hint: from ? 's dátumami zákazky' : '',
        url: `https://www.booking.com/searchresults.html?${book.toString()}` },
    ];
  }

  /** Riadok do databázy ubytovaní z nájdeného miesta. */
  function toAccommodation(p, { fallbackCity = '' } = {}) {
    return {
      name: p.name, type: p.type, country: 'DE',
      city: p.city || fallbackCity || '—', postal_code: p.postcode, address: p.address,
      lat: p.lat, lng: p.lng, owner_phone: p.phone, owner_email: p.email,
      source: 'osm', verification_status: 'new',
      notes: [p.website ? `Web: ${p.website}` : '', p.monteur ? 'Monteurzimmer.' : '',
        `Nájdené cez OpenStreetMap (${p.osm}).`].filter(Boolean).join(' '),
    };
  }

  const API = { TYPES, OVERPASS, overpassQuery, distanceKm, parse, links, toAccommodation };
  if (typeof window !== 'undefined') window.DanubraNearby = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
