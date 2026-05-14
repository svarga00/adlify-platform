// Google Places Text Search — hľadá firmy podľa query + mesta.
// POST { query, city?, radius_km? } → { prospects: [...] }
//
// Vyžaduje GOOGLE_MAPS_API_KEY env.
// Dokumentácia: https://developers.google.com/maps/documentation/places/web-service/text-search

exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'GOOGLE_MAPS_API_KEY missing v Netlify env.' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: cors, body: 'Bad JSON' }; }

  const { query = '', city = '', maxResults = 20 } = payload;
  if (!query) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'query required' }) };

  const textQuery = city ? `${query} ${city}` : query;

  try {
    // Places API v1 (New) — Text Search
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.types,places.primaryType,places.businessStatus,places.addressComponents',
      },
      body: JSON.stringify({
        textQuery,
        pageSize: Math.min(20, Math.max(1, parseInt(maxResults) || 20)),
        languageCode: 'sk',
        regionCode: 'sk',
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      return { statusCode: r.status, headers: cors, body: JSON.stringify({ error: data.error?.message || 'Places API error', data }) };
    }

    const prospects = (data.places || []).filter(p => p.businessStatus !== 'CLOSED_PERMANENTLY').map(p => {
      const addrComps = p.addressComponents || [];
      const cityComp = addrComps.find(c => c.types?.includes('locality') || c.types?.includes('postal_town'));
      const domain = (p.websiteUri || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
      return {
        company_name: p.displayName?.text || p.displayName || '',
        domain,
        phone: p.nationalPhoneNumber || p.internationalPhoneNumber || '',
        city: cityComp?.longText || cityComp?.shortText || '',
        industry: (p.primaryType || p.types?.[0] || '').replace(/_/g, ' '),
        source: 'google_places',
        metadata: { place_id: p.id, address: p.formattedAddress },
      };
    });

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospects, count: prospects.length }),
    };
  } catch (err) {
    console.error('[lead-finder-places]', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
