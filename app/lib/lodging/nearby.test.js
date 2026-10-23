// ============================================================================
// Testy: ubytovanie v okolí stavby
// Spustenie:  node app/lib/lodging/nearby.test.js
// ============================================================================
global.window = global;
const N = require('./nearby.js');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg, detail) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${detail ? `\n    ${detail}` : ''}`); }
}

console.log('Ubytovanie v okolí stavby');

const STAVBA = { lat: 49.3108, lng: 12.8456 };   // Lixenried

{
  const q = N.overpassQuery({ ...STAVBA, radiusKm: 15 });
  ok(q.includes('around:15000,49.310800,12.845600'), 'okruh 15 km okolo stavby', q);
  ok(/hotel\|guest_house\|hostel\|motel\|apartment\|chalet/.test(q), 'hotely, penzióny, ubytovne, motely, apartmány, chaty');
  ok(N.overpassQuery({ ...STAVBA, radiusKm: 500 }).includes('around:50000'), 'okruh najviac 50 km');
  ok(q.includes('[timeout:8]') && N.overpassQuery({ ...STAVBA, timeout: 20 }).includes('[timeout:20]'),
    'server sa pýta krátko (8 s), prehliadač môže dlhšie');
  ok(N.OVERPASS.length >= 2, 'viac zrkadiel mapy naraz');
  eq(N.distanceKm(STAVBA, { lat: 49.2654, lng: 12.8517 }), 5.1, 'vzdialenosť vzdušnou čiarou');
}

const OSM = { elements: [
  { type: 'node', id: 1, lat: 49.2654, lon: 12.8517, tags: { tourism: 'hotel', name: 'Hotel Post',
    'addr:street': 'Stadtplatz', 'addr:housenumber': '12', 'addr:postcode': '93437', 'addr:city': 'Furth im Walde',
    phone: '+49 9973 1234', website: 'https://hotel-post.de' } },
  { type: 'way', id: 2, center: { lat: 49.30, lon: 12.83 }, tags: { tourism: 'guest_house',
    name: 'Monteurzimmer Huber', 'contact:phone': '+49 170 555' } },
  { type: 'node', id: 3, lat: 49.40, lon: 12.90, tags: { tourism: 'apartment' } },
  { type: 'node', id: 4, lat: 49.31, lon: 12.84, tags: { tourism: 'museum', name: 'Drachenmuseum' } },
  { type: 'node', id: 5, lat: 49.2654, lon: 12.8517, tags: { tourism: 'hotel', name: 'Hotel Post' } },
  { type: 'node', id: 6, tags: { tourism: 'hotel', name: 'Bez polohy' } },
] };

{
  const r = N.parse(OSM, STAVBA);
  eq(r.map(x => x.name), ['Monteurzimmer Huber', 'Hotel Post', 'Apartmán bez názvu'],
    'Monteurzimmer dopredu, potom pomenované podľa vzdialenosti; múzeum, duplicita a bez polohy preč');
  ok(r[0].monteur && r[0].typeLabel === 'Penzión' && r[0].phone === '+49 170 555', 'penzión s telefónom z contact:phone');
  eq([r[1].address, r[1].postcode, r[1].city, r[1].website], ['Stadtplatz 12', '93437', 'Furth im Walde', 'https://hotel-post.de'],
    'adresa a web');
  eq(r[1].distanceKm, 5.1, 'vzdialenosť od stavby');
  eq(N.parse(null, STAVBA), [], 'zlá odpoveď nespadne');
}

{
  const l = N.links({ city: 'Lixenried', ...STAVBA, from: '2026-10-26', to: '2026-12-18', persons: 5 });
  const b = l.find(x => x.key === 'booking').url;
  ok(/checkin=2026-10-26/.test(b) && /checkout=2026-12-18/.test(b) && /group_adults=5/.test(b) && /no_rooms=3/.test(b),
    'Booking s dátumami zákazky a počtom ľudí', b);
  ok(/Monteurzimmer\+Lixenried|Monteurzimmer%20Lixenried/.test(l[0].url), 'Monteurzimmer v meste');
  ok(l[1].url.includes('@49.31080,12.84560,12z'), 'mapa okolo stavby');
}

{
  const a = N.toAccommodation(N.parse(OSM, STAVBA)[0], { fallbackCity: 'Lixenried' });
  eq([a.name, a.type, a.city, a.owner_phone, a.source, a.verification_status],
    ['Monteurzimmer Huber', 'guest_house', 'Lixenried', '+49 170 555', 'osm', 'new'],
    'do databázy ubytovaní: mesto zo stavby, keď ho OSM nemá; overiť treba');
  ok(/Monteurzimmer\./.test(a.notes) && /way\/2/.test(a.notes), 'poznámka odkiaľ je');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
