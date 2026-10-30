// ============================================================================
// DANUBRA — overiť, či sú údaje nových firiem aktuálne (na pozadí)
// ============================================================================
// „…chcem, aby bolo všetko relevantné a aktuálne."
//
// Spúšťa sa:
//   * z denného cronu raz týždenne (pondelok) pre najviac
//     OUTSCRAPER_REFRESH_WEEKLY firiem (predvolene 50), ktoré sú najdlhšie
//     neoverené — hlavička x-danubra-cron (podpísaný kľúč, účel
//     „leads-refresh", platí 2 hodiny),
//   * ručne z appky: „Overiť znova" pri firme a „Overiť zobrazené"
//     { lead_ids: [...] } (najviac 50), s prihlásením a právom Marketing.
//
// Pri každej firme:
//   a) Google Mapy cez Outscraper (GET /maps/search-v3): podľa place_id,
//      inak meno + PSČ/mesto. Aktualizuje stav (funguje / dočasne
//      zatvorená / zatvorená), telefón, web, hodnotenie, počet recenzií,
//      verified_at. Natrvalo zatvorená → closed_at (stav firmy sa NEMENÍ;
//      oslovenie ju odmietne). Keď sa na Mapách nenájde, nič sa neprepíše,
//      len data_source.maps_found = false.
//   b) web: úvodná stránka sa stiahne (rovnaká SSRF ochrana ako pri
//      hľadaní) → web_ok,
//   c) e-mail: MX záznam domény (dns.resolveMx, nič sa neposiela) →
//      email_mx_ok.
// Bez OUTSCRAPER_API_KEY sa urobí len b) a c).
//
// Pravidlá (čo sa mení a ako sa páruje) sú v app/lib/marketing/outscraper.js.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OUTSCRAPER_API_KEY,
//      OUTSCRAPER_REFRESH_WEEKLY (voliteľné), MAIL_SECRET (podpis cronu)
// ============================================================================
const dns = require('dns');
const O = require('../../app/lib/marketing/outscraper.js');
const OS = require('../../app/lib/marketing/outscraper-server.js');
const Secret = require('../../app/lib/mail/secret.js');
const Urls = require('./danubra-leads-from-urls-background.js');

const TOTAL_MS = 13 * 60 * 1000;
const MANUAL_MAX = 50;
const CHUNK = 25;
const PURPOSE = 'leads-refresh';
const LEAD_COLS = 'id,name,city,postal_code,website,email,phone,status,google_place_id,business_status,closed_at,verified_at,'
  + 'rating,reviews_count,categories,lat,lng,web_ok,email_mx_ok,data_source,archived_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const out = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

function supabaseDb() {
  let sb = null;
  const c = () => {
    if (!sb) {
      const { createClient } = require('@supabase/supabase-js');
      sb = createClient(process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
    }
    return sb;
  };
  return {
    client: c,
    async leadsByIds(ids) {
      const { data, error } = await c().from('danubra_leads').select(LEAD_COLS).in('id', ids).is('archived_at', null);
      if (error) throw new Error(/column|schema cache/i.test(error.message || '') ? 'Overovanie ešte nie je pripravené v databáze (migrácia 079).' : error.message);
      return data || [];
    },
    async staleCandidates(n) {
      const { data, error } = await c().from('danubra_leads').select(LEAD_COLS).is('archived_at', null).is('closed_at', null)
        .order('verified_at', { ascending: true, nullsFirst: true }).limit(Math.max(1, n * 3));
      if (error) throw new Error(error.message);
      return data || [];
    },
    async updateLead(id, patch) { const { error } = await c().from('danubra_leads').update(patch).eq('id', id); return { error }; },
  };
}

const defaults = {
  db: null,
  guard: null,
  outscraper: undefined,
  fetch: (...a) => fetch(...a),
  sleep: (ms) => new Promise(r => setTimeout(r, ms)),
  now: () => Date.now(),
  fetchPage: (url) => Urls.fetchPage(url),
  resolveMx: (domain) => dns.promises.resolveMx(domain),
  cronOk: (t) => { try { return Secret.cronOk(t, new Date(), undefined, PURPOSE); } catch (e) { return false; } },
};

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k); }
  }));
}

/** Google Mapy pre všetky firmy naraz (po 25 dotazoch). Vráti počet záznamov. */
async function lookupMaps(items, os, { deadline }) {
  let records = 0;
  for (const [byId, limit] of [[true, 1], [false, 3]]) {
    const group = items.filter(x => x.q && x.q.byId === byId);
    for (let i = 0; i < group.length; i += CHUNK) {
      const chunk = group.slice(i, i + CHUNK);
      const maps = await os.mapsSearch(chunk.map(x => x.q.q), { limit, language: 'de', region: 'DE', async: chunk.length * limit > 50, deadline });
      chunk.forEach((x, k) => { x.places = (maps.groups[k] || []).map(O.normPlace); });
      records += maps.places.length;
    }
  }
  return records;
}

async function run(event, d) {
  let body = {};
  try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return out(400, { error: 'Neplatné telo požiadavky.' }); }
  const h = event.headers || {};
  const cron = !!d.cronOk(h['x-danubra-cron'] || h['X-Danubra-Cron'] || '');
  if (!cron) {
    const g = await d.guard(event);
    if (!g || !g.ok) return out((g && g.status) || 403, { error: (g && g.error) || 'Na túto akciu nemáte oprávnenie.' });
  }

  const started = d.now();
  const deadline = started + TOTAL_MS;
  let leads;
  try {
    if (cron) {
      const limit = O.weeklyLimit(process.env.OUTSCRAPER_REFRESH_WEEKLY);
      if (!limit) return out(200, { skipped: 'vypnuté (OUTSCRAPER_REFRESH_WEEKLY=0)' });
      leads = O.pickStale(await d.db.staleCandidates(limit), { now: new Date(), limit });
    } else {
      const ids = [...new Set((Array.isArray(body.lead_ids) ? body.lead_ids : []).map(String).filter(x => UUID.test(x)))];
      if (!ids.length) return out(400, { error: 'Chýba zoznam firiem (lead_ids).' });
      if (ids.length > MANUAL_MAX) return out(400, { error: `Naraz sa dá overiť najviac ${MANUAL_MAX} firiem.` });
      leads = await d.db.leadsByIds(ids);
    }
  } catch (e) {
    return out(503, { error: String((e && e.message) || e).slice(0, 300) });
  }

  const os = d.outscraper !== undefined ? d.outscraper : OS.fromEnv(process.env, { fetch: d.fetch, sleep: d.sleep, now: d.now });
  const items = leads.map(l => ({ l, q: O.refreshQuery(l), places: null }));
  const sum = { checked: leads.length, updated: 0, closed: 0, reopened: 0, not_found: 0, web_bad: 0, mx_bad: 0,
    records: 0, outscraper: !!os, maps_error: null, errors: 0, cron };
  if (os && items.length) {
    try { sum.records = await lookupMaps(items, os, { deadline: deadline - 3 * 60 * 1000 }); }
    catch (e) { sum.maps_error = String((e && e.message) || e).slice(0, 300); }
  }

  await pool(items, 5, async (x) => {
    if (d.now() > deadline - 20000) return;
    const { l } = x;
    const mapsChecked = Array.isArray(x.places);
    const place = mapsChecked ? O.matchPlace(l, x.places, { byId: !!(x.q && x.q.byId) }) : null;
    const web = (place && place.website) || l.website || null;
    let webOk = null;
    if (web) {
      const url = /^https?:\/\//i.test(web) ? web : `https://${web}`;
      try { webOk = !!(await d.fetchPage(url)).ok; } catch (e) { webOk = false; }
    }
    const mxOk = l.email ? await O.checkMx(l.email, d.resolveMx) : null;
    const { patch } = O.refreshPatch(l, place, { now: new Date(), webOk, mxOk, mapsChecked });
    const { error } = await d.db.updateLead(l.id, patch);
    if (error) { sum.errors++; return; }
    sum.updated++;
    if (patch.closed_at) sum.closed++;
    if ('closed_at' in patch && patch.closed_at === null) sum.reopened++;
    if (mapsChecked && !place) sum.not_found++;
    if (webOk === false) sum.web_bad++;
    if (mxOk === false) sum.mx_bad++;
  });

  console.log('[danubra-leads-refresh]', JSON.stringify(sum));
  return out(200, sum);
}

async function handle(event, deps = {}) {
  const d = { ...defaults, ...deps };
  if (!d.db) d.db = supabaseDb();
  if (!d.guard) {
    const guard = require('../../app/lib/server-guard.js')(d.db.client());
    d.guard = (ev) => guard.check(ev, { key: 'marketing' });
  }
  return run(event || {}, d);
}

exports.handle = handle;
exports.handler = (event) => handle(event);
exports.PURPOSE = PURPOSE;
