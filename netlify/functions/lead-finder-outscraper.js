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

// Outscraper vracia sociálne siete v rôznych poliach (social_links, social_media,
// alebo arrays). Pokúsi sa extrahovať konkrétnu sieť z čohokoľvek čo prišlo.
function extractSocial(p, network) {
  const needle = network.toLowerCase();
  // Pole social_links (array of objects {type, url})
  if (Array.isArray(p.social_links)) {
    const found = p.social_links.find(s => String(s?.type || s?.network || '').toLowerCase().includes(needle));
    if (found) return found.url || found.link || null;
  }
  // Object social_media s keys
  if (p.social_media && typeof p.social_media === 'object') {
    for (const [k, v] of Object.entries(p.social_media)) {
      if (k.toLowerCase().includes(needle) && v) return typeof v === 'string' ? v : v?.url;
    }
  }
  // Scan všetkých kľúčov pre URLs obsahujúce needle (fallback)
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === 'string' && v.includes(needle + '.com')) return v;
  }
  return null;
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

  const { query = '', city = '', cities = null, maxResults = 20 } = payload;
  if (!query) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'query required' }) };

  // Strop kreditov — nikdy unlimited.
  const limit = Math.min(20, Math.max(1, parseInt(maxResults) || 20));

  // cities[] override single city. Strop 20 miest naraz (ochrana proti
  // nechcenému $$$ pri "všetky okresné mestá" — 79 × 20 = 1580 placeov).
  const citiesList = Array.isArray(cities)
    ? cities.map(c => String(c || '').trim()).filter(Boolean).slice(0, 20)
    : [];
  const queries = citiesList.length > 0
    ? citiesList.map(c => `${query} ${c}`)
    : [city ? `${query} ${city}` : query];

  try {
    // 1. Volaj Outscraper Google Maps search s enrichment pre emaily
    // Multiple query= params → Outscraper paralelne pre každý query
    const params = new URLSearchParams();
    for (const q of queries) params.append('query', q);
    params.set('limit', String(limit));
    params.set('region', 'SK');
    params.set('language', 'sk');
    // NOTE: async=true je default a stabilný — vracia request_id, my poll-neme.
    // async=false občas vracia prázdne výsledky bez chyby, takže to neuvádzame.
    params.set('dropDuplicates', 'true');
    // enrichment pre emaily (Email Validator Service ~$3/1000)
    params.append('enrichment', 'emails_validator_service');

    const url = `https://api.app.outscraper.com/maps/search-v3?${params.toString()}`;
    console.log('[outscraper] start %d queries limit=%d per query', queries.length, limit);
    console.log('[outscraper] queries:', queries.join(' | '));

    const r = await fetch(url, {
      headers: { 'X-API-KEY': apiKey, 'Accept': 'application/json' },
    });
    const initial = await r.json().catch(() => ({}));
    console.log('[outscraper] initial response status=%d keys=%s', r.status, Object.keys(initial || {}).join(','));

    if (!r.ok && r.status !== 202) {
      console.error('[outscraper] error body:', JSON.stringify(initial).slice(0, 500));
      throw new Error('Outscraper API: ' + (initial?.error || initial?.message || `HTTP ${r.status}`));
    }

    // Buď vráti dáta priamo, alebo asynchrónny request_id + results_location
    let job = initial;
    const hasInlineData = Array.isArray(initial.data) && initial.data.length > 0;
    if (!hasInlineData && initial.results_location) {
      // Dlhšie čakanie pri viacerých mestách — Outscraper paralelne ale stále potrebuje čas
      const pollMs = Math.min(24000, 18000 + queries.length * 1000);
      console.log('[outscraper] async job, polling…', initial.id, 'max', pollMs, 'ms');
      job = await pollResults(initial.results_location, apiKey, pollMs);
      console.log('[outscraper] poll done, job keys=%s status=%s', Object.keys(job || {}).join(','), job?.status);
    } else if (!hasInlineData) {
      console.warn('[outscraper] no data and no results_location! response:', JSON.stringify(initial).slice(0, 500));
    }

    // data je 2D pole: [[place1, place2, ...]] (jeden query = jedno pole)
    const flat = [];
    for (const arr of (job.data || [])) {
      if (Array.isArray(arr)) flat.push(...arr);
      else if (arr && typeof arr === 'object') flat.push(arr); // fallback ak je len 1D
    }
    console.log('[outscraper] got %d raw places', flat.length);
    if (flat.length === 0) {
      console.warn('[outscraper] empty — job.data type:', Array.isArray(job.data) ? `array(${job.data.length})` : typeof job.data);
      console.warn('[outscraper] first 500 chars of job:', JSON.stringify(job).slice(0, 500));
    } else {
      // Diagnostika prvého place — aké polia má, či má email/site
      const first = flat[0];
      console.log('[outscraper] sample place keys:', Object.keys(first).join(','));
      console.log('[outscraper] sample name=%s site=%s email_1=%s emails_validator=%s',
        first.name || '?', first.site || first.website || '—',
        first.email_1 || '—', JSON.stringify(first.emails_validator || first.emails || null).slice(0, 200));
    }

    // Štatistika filtra
    let rejNoEmail = 0, rejNoDomain = 0, rejClosed = 0;

    // 2. Mapovanie + filtre
    const prospects = [];
    for (const p of flat) {
      // Filter zatvorené prevádzky
      const status = String(p.business_status || p.businessStatus || '').toUpperCase();
      if (status === 'CLOSED_PERMANENTLY') { rejClosed++; continue; }

      // Web POVINNÝ — bez webu nemáme čo cold-mailovať.
      // Email voliteľný — admin si ho doplní ručne (LinkedIn, hunter.io, manuálne).
      const website = p.site || p.website || p.domain || '';
      const domain = cleanDomain(website);
      if (!domain) { rejNoDomain++; continue; }

      // Email z enrichmentu (rôzne tvary podľa Outscraper)
      let email = pickEmail(p.emails_validator);
      if (!email) email = p.email_1 || p.email_2 || p.email_3 || null;
      if (!email && Array.isArray(p.emails) && p.emails[0]) email = p.emails[0];
      if (!email) rejNoEmail++; // počítame info-only, neodmietame prospekt

      const reviews = Number(p.reviews || p.user_ratings_total || 0);
      const rating = Number(p.rating || 0);
      const tier = sizeTier(reviews);

      // Outscraper vracia social siete v rôznych poliach podľa enrichment kategórie
      const socials = {
        facebook:  p.facebook  || p.facebook_url  || extractSocial(p, 'facebook'),
        instagram: p.instagram || p.instagram_url || extractSocial(p, 'instagram'),
        linkedin:  p.linkedin  || p.linkedin_url  || extractSocial(p, 'linkedin'),
        twitter:   p.twitter   || p.twitter_url   || p.x_url || extractSocial(p, 'twitter'),
        youtube:   p.youtube   || p.youtube_url   || extractSocial(p, 'youtube'),
        tiktok:    p.tiktok    || p.tiktok_url    || extractSocial(p, 'tiktok'),
      };
      // Odstráň prázdne keys
      Object.keys(socials).forEach(k => { if (!socials[k]) delete socials[k]; });

      // Tags pre rýchle vizuálne indikátory v UI
      const tagsList = [`reviews:${reviews}`, `rating:${rating}`, `size:${tier}`];
      if (socials.facebook)  tagsList.push('has:facebook');
      if (socials.instagram) tagsList.push('has:instagram');
      if (socials.linkedin)  tagsList.push('has:linkedin');
      if (p.working_hours || p.opening_hours) tagsList.push('has:hours');
      if (p.description || p.about) tagsList.push('has:description');

      prospects.push({
        company_name: p.name || p.title || '',
        domain,
        email: email ? String(email).toLowerCase().trim() : null,
        phone: p.phone || p.phone_1 || p.international_phone_number || '',
        city: p.city || p.locality || city || '',
        industry: p.subtypes || p.type || p.category || query,
        segment: (query || '').toLowerCase(),
        source: 'outscraper',
        source_url: p.location_link || p.url || (p.google_id ? `https://www.google.com/maps/place/?q=place_id:${p.place_id || p.google_id}` : null),
        // Najčastejšie používaný social → priamy stĺpec (existujúce schema má linkedin_url)
        linkedin_url: socials.linkedin || null,
        tags: tagsList,
        analysis: {
          reviews,
          rating,
          size_tier: tier,
          place_id: p.place_id || p.google_id || null,
          address: p.full_address || p.address || '',
          category: p.category || p.type || '',
          subtypes: p.subtypes || null,
          // Sociálne siete (kompletné z Outscraper enrichmentu)
          socials,
          // Ďalšie obohatené dáta
          description: p.description || p.about || null,
          working_hours: p.working_hours || p.opening_hours || null,
          price_level: p.price_level || null,
          photo: p.photo || p.photos_count || null,
          coordinates: (p.latitude && p.longitude) ? { lat: p.latitude, lng: p.longitude } : null,
          owner_name: p.owner_name || null,
          // Tracking pre debug v UI (vidieť čo Outscraper vrátil)
          outscraper_raw_keys: Object.keys(p),
        },
      });
    }

    // 3. Dedup proti existujúcim doménam v prospects (constraint na domain v tejto DB nie je istý)
    const domains = prospects.map(p => p.domain).filter(Boolean);
    const { data: existing } = domains.length > 0
      ? await supabase.from('prospects').select('domain').in('domain', domains)
      : { data: [] };
    const existingSet = new Set((existing || []).map(x => (x.domain || '').toLowerCase()));

    // 3b. Opt-out (suppression) guard — ak email/domain je na globálnom opt-out
    //     zozname, importujeme ich rovno ako 'unsubscribed' (ostávajú v evidencii
    //     pre audit ale scheduler ani Compose im nepošlú nič).
    const emails = prospects.map(p => (p.email || '').toLowerCase()).filter(Boolean);
    const { data: suppressed } = emails.length > 0
      ? await supabase.from('email_suppressions').select('email').in('email', emails)
      : { data: [] };
    const suppressedSet = new Set((suppressed || []).map(x => (x.email || '').toLowerCase()));

    const toInsert = prospects
      .filter(p => !existingSet.has(p.domain))
      .map(p => suppressedSet.has((p.email || '').toLowerCase())
        ? { ...p, outreach_stage: 'unsubscribed' }
        : p);
    const skipped = prospects.length - toInsert.length;
    const importedAsOptOut = toInsert.filter(p => p.outreach_stage === 'unsubscribed').length;

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

    console.log('[outscraper] filter rejects — noEmail=%d noDomain=%d closed=%d', rejNoEmail, rejNoDomain, rejClosed);
    console.log('[outscraper] done: %d total, %d inserted, %d skipped (dup), %d marked opt-out', prospects.length, inserted, skipped, importedAsOptOut);

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prospects: toInsert,
        count: prospects.length,
        inserted,
        skipped,
        imported_as_opt_out: importedAsOptOut,
        rejected: { noEmail: rejNoEmail, noDomain: rejNoDomain, closed: rejClosed, rawTotal: flat.length },
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
