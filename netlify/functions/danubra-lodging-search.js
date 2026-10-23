// ============================================================================
// DANUBRA — ubytovanie v okolí stavby (server)
// ============================================================================
// Vstup:  POST { lat, lng, radiusKm }  alebo  { address, radiusKm }
// Výstup: { origin: {lat,lng,label}, places: [...], source: 'osm' }
//
// Ubytovanie hľadá v OpenStreetMap cez Overpass API (verejné, bez kľúča).
// Keď stavba nemá súradnice, adresa sa najprv nájde cez Nominatim. Obe
// služby chcú, aby sa aplikácia predstavila — preto to volá server.
// Čisté funkcie: app/lib/lodging/nearby.js, app/lib/route.js (s testami).
// ============================================================================
const N = require('../../app/lib/lodging/nearby.js');
const R = require('../../app/lib/route.js');

const UA = 'DANUBRA-Hub/1.0 (info@punds.eu)';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const H = {
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json',
};
const out = (code, body) => ({ statusCode: code, headers: H, body: JSON.stringify(body) });

async function geocode(address) {
  for (const q of R.variants(address).slice(0, 3)) {
    const res = await fetch(R.geocodeUrl(q), { headers: { 'User-Agent': UA, 'Accept-Language': 'de,sk;q=0.8' } });
    if (res.ok) {
      const p = R.pickPlace(await res.json());
      if (p) return p;
    }
    await new Promise(r => setTimeout(r, 1000));   // Nominatim: jeden dotaz za sekundu
  }
  return null;
}

async function overpass(query) {
  let last = null;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(query)}` });
      if (res.ok) return await res.json();
      last = new Error(`Mapa ubytovaní neodpovedala (${res.status})`);
    } catch (e) { last = e; }
  }
  throw last || new Error('Mapa ubytovaní neodpovedala');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return out(405, { error: 'Nepovolená metóda' });
  try {
    const { lat, lng, address, radiusKm = 10 } = JSON.parse(event.body || '{}');
    let origin = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && (lat || lng)
      ? { lat: Number(lat), lng: Number(lng), label: address || '' } : null;
    if (!origin && String(address || '').trim()) origin = await geocode(address);
    if (!origin) return out(200, { notFound: true, places: [] });

    const json = await overpass(N.overpassQuery({ lat: origin.lat, lng: origin.lng, radiusKm }));
    return out(200, { origin, places: N.parse(json, origin), source: 'osm' });
  } catch (e) {
    return out(500, { error: (e && e.message) || 'Chyba' });
  }
};
