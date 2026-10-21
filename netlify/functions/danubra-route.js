// ============================================================================
// DANUBRA — cesta od kandidáta na stavbu (server)
// ============================================================================
// Adresa → súradnice cez OpenStreetMap (Nominatim), trasa autom cez OSRM.
// Obe služby sú verejné a bez kľúča. Volajú sa odtiaľto, nie z prehliadača:
// Nominatim chce, aby sa aplikácia predstavila (User-Agent), a pravidlo appky
// je, že cudzie služby volá server.
//
// Vstup:  POST { from: "Žilina", to: "Lixenried bei Furth im Walde" }
// Výstup: { from: {lat,lng,label}, to: {...}, km, minutes, line: [[lat,lng]…],
//           sentence, mapsUrl }
// Čisté funkcie sú v app/lib/route.js (aj s testami).
// ============================================================================
const R = require('../../app/lib/route.js');

const UA = 'DANUBRA-Hub/1.0 (info@punds.eu)';

async function geocode(q) {
  const res = await fetch(R.geocodeUrl(q), {
    headers: { 'User-Agent': UA, 'Accept-Language': 'sk,de;q=0.8,en;q=0.5' },
  });
  if (!res.ok) throw new Error(`Mapa adries neodpovedala (${res.status})`);
  return R.pickPlace(await res.json());
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  try {
    const { from, to } = JSON.parse(event.body || '{}');
    if (!String(from || '').trim()) throw new Error('Chýba, odkiaľ ide');
    if (!String(to || '').trim()) throw new Error('Chýba, kam ide — nábor nemá miesto');

    // Nominatim povoľuje jeden dotaz za sekundu — preto za sebou, nie naraz.
    const a = await geocode(from);
    if (!a) return { statusCode: 200, headers: cors, body: JSON.stringify({ notFound: 'from' }) };
    await new Promise(r => setTimeout(r, 1100));
    const b = await geocode(to);
    if (!b) return { statusCode: 200, headers: cors, body: JSON.stringify({ notFound: 'to', from: a }) };

    const res = await fetch(R.routeUrl(a, b), { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`Výpočet trasy neodpovedal (${res.status})`);
    const route = R.pickRoute(await res.json());
    if (!route) return { statusCode: 200, headers: cors, body: JSON.stringify({ noRoute: true, from: a, to: b }) };

    return { statusCode: 200, headers: cors, body: JSON.stringify({
      from: a, to: b, ...route,
      sentence: R.sentence(route),
      mapsUrl: R.googleDirUrl(from, to),
    }) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
