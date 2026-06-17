// Outscraper Google Maps + Email enrichment.
// POST { query, city?, maxResults? } → { prospects: [...], count, inserted, skipped }
//
// Rozdiel oproti lead-finder-places: vracia EMAILS (enrichment služba ~$3/1000).
// Bez emailu prospekta zahodíme (cold mail bez emailu nemá zmysel).
//
// Outscraper API: https://app.outscraper.com/api-docs
// Endpoint: /maps/search-v3 s enrichment pre emaily.
// Pattern: async=false → buď vráti dáta priamo, alebo request_id na poll.
// Netlify sync limit ~26s → polling cap 22s, potom error a user retry.
//
// Vyžaduje OUTSCRAPER_API_KEY.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const cors = { 'Access-Control-Allow-Origin': '*' };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Normalizuj doménu: strip protokol, www, trailing slash + cesta
function cleanDomain(url) {
  if (!url) return '';
  return String(url)
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
    .trim();
}

// Odhad veľkosti firmy podľa počtu recenzií
function sizeTier(reviews) {
  const n = Number(reviews) || 0;
  if (n < 20) return 'small';
  if (n <= 80) return 'medium';
  return 'large';
}

// Outscraper email enrichment vracia status: RECEIVING | UNKNOWN | INVALID.
// Berieme RECEIVING + UNKNOWN, INVALID zahadzujeme.
function pickEmail(emailsField) {
  if (!Array.isArray(emailsField)) {
    if (typeof emailsField === 'string' && emailsField.includes('@')) return emailsField;
    return null;
  }
  const ok = emailsField.find(e => {
    const status = String(e?.status || '').toUpperCase();
    return status === 'RECEIVING' || status === 'UNKNOWN' || (!status && e?.email);
  });
  return ok?.email || ok?.value || null;
}

async function pollResults(resultsLocation, apiKey, maxMs = 22000) {
  const start = Date.now();
  let delay = 2000;
  while (Date.now() - start < maxMs) {
    await sleep(delay);
    const r = await fetch(resultsLocation, {
      headers: { 'X-API-KEY': apiKey, 'Accept': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    const status = String(j.status || '').toLowerCase();
    if (status === 'success' || status === 'finished' || Array.isArray(j.data)) {
      return j;
    }
    if (status === 'error' || status === 'failed') {
      throw new Error('Outscraper job failed: ' + (j.message || 'unknown'));
    }
    // exponenciálne predlžuj delay (2s, 3s, 4s, ...)
    delay = Math.min(delay + 1000, 4000);
  }
  throw new Error('Outscraper timeout (>22s) — skús menej výsledkov alebo retry');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'OUTSCRAPER_API_KEY missing v Netlify env.' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: cors, body: 'Bad JSON' }; }

  const { query = '', city = '', maxResults = 20 } = payload;
  if (!query) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'query required' }) };

  // Strop kreditov — nikdy unlimited.
  const limit = Math.min(20, Math.max(1, parseInt(maxResults) || 20));
  const textQuery = city ? `${query} ${city}` : query;

  try {
    // 1. Volaj Outscraper Google Maps search s enrichment pre emaily
    const params = new URLSearchParams({
      query: textQuery,
      limit: String(limit),
      region: 'SK',
      language: 'sk',
      async: 'false',
      dropDuplicates: 'true',
    });
    // enrichment pre emaily (Email Validator Service ~$3/1000)
    params.append('enrichment', 'emails_validator_service');

    const url = `https://api.app.outscraper.com/maps/search-v3?${params.toString()}`;
    console.log('[outscraper] start query="%s" limit=%d', textQuery, limit);

    const r = await fetch(url, {
      headers: { 'X-API-KEY': apiKey, 'Accept': 'application/json' },
    });
    const initial = await r.json().catch(() => ({}));

    if (!r.ok && r.status !== 202) {
      throw new Error('Outscraper API: ' + (initial?.error || initial?.message || `HTTP ${r.status}`));
    }

    // Buď vráti dáta priamo, alebo asynchrónny request_id + results_location
    let job = initial;
    if (!Array.isArray(initial.data) && initial.results_location) {
      console.log('[outscraper] async job, polling…', initial.id);
      job = await pollResults(initial.results_location, apiKey);
    }

    // data je 2D pole: [[place1, place2, ...]] (jeden query = jedno pole)
    const flat = [];
    for (const arr of (job.data || [])) {
      if (Array.isArray(arr)) flat.push(...arr);
    }
    console.log('[outscraper] got %d raw places', flat.length);

    // 2. Mapovanie + filtre
    const prospects = [];
    for (const p of flat) {
      // Filter zatvorené prevádzky
      const status = String(p.business_status || p.businessStatus || '').toUpperCase();
      if (status === 'CLOSED_PERMANENTLY') continue;

      const email = pickEmail(p.emails_validator || p.email_1 || p.emails);
      if (!email) continue; // bez emailu nemá zmysel cold mail

      const website = p.site || p.website || p.domain || '';
      const domain = cleanDomain(website);
      if (!domain) continue;

      const reviews = Number(p.reviews || p.user_ratings_total || 0);
      const rating = Number(p.rating || 0);
      const tier = sizeTier(reviews);

      prospects.push({
        company_name: p.name || p.title || '',
        domain,
        email: String(email).toLowerCase().trim(),
        phone: p.phone || p.phone_1 || p.international_phone_number || '',
        city: p.city || p.locality || city || '',
        industry: p.subtypes || p.type || p.category || query,
        segment: (query || '').toLowerCase(),
        source: 'outscraper',
        source_url: p.location_link || p.url || p.google_id ? `https://www.google.com/maps/place/?q=place_id:${p.place_id || p.google_id}` : null,
        tags: [`reviews:${reviews}`, `rating:${rating}`, `size:${tier}`],
        metadata: {
          reviews,
          rating,
          size_tier: tier,
          place_id: p.place_id || p.google_id || null,
          address: p.full_address || p.address || '',
        },
      });
    }

    // 3. Dedup proti existujúcim doménam v prospects (constraint na domain v tejto DB nie je istý)
    const domains = prospects.map(p => p.domain).filter(Boolean);
    const { data: existing } = domains.length > 0
      ? await supabase.from('prospects').select('domain').in('domain', domains)
      : { data: [] };
    const existingSet = new Set((existing || []).map(x => (x.domain || '').toLowerCase()));

    const toInsert = prospects.filter(p => !existingSet.has(p.domain));
    const skipped = prospects.length - toInsert.length;

    let inserted = 0;
    if (toInsert.length > 0) {
      const { error: insErr, count } = await supabase.from('prospects')
        .insert(toInsert, { count: 'exact' });
      if (insErr) {
        console.error('[outscraper] insert error:', insErr.message);
        // fallback: skús po jednom (nejaký záznam môže porušiť constraint)
        for (const row of toInsert) {
          const { error: e } = await supabase.from('prospects').insert(row);
          if (!e) inserted += 1;
        }
      } else {
        inserted = count ?? toInsert.length;
      }
    }

    console.log('[outscraper] done: %d total, %d inserted, %d skipped (dup)', prospects.length, inserted, skipped);

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prospects: toInsert,
        count: prospects.length,
        inserted,
        skipped,
      }),
    };
  } catch (err) {
    console.error('[lead-finder-outscraper]', err);
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
