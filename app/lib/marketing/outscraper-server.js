// ============================================================================
// DANUBRA — Outscraper API (len server, netlify/functions)
// ============================================================================
// Volania na https://api.app.outscraper.com s hlavičkou X-API-KEY. Kľúč je
// len v env OUTSCRAPER_API_KEY — do prehliadača ani do odpovede funkcie sa
// nedostane; chybové vety ho nikdy neobsahujú.
//
//   GET /maps/search-v3      firmy z Google Máp (query viackrát, limit na
//                            dotaz, language=de, region=DE)
//   GET /emails-and-contacts e-maily a telefóny z webu domény
//   GET /requests/<id>       výsledok asynchrónnej požiadavky
//
// Synchrónne (async=false) Outscraper počká a vráti `data`. Asynchrónne
// (async=true, alebo keď server sám odpovie „Pending") vráti `id` a appka sa
// každých 5 s pýta na /requests/<id>, kým stav nie je „Success" — najviac do
// `deadline` (funkcia na pozadí má 15 minút).
//
// Čisté pravidlá (parametre, čítanie odpovede, mapovanie) sú v outscraper.js.
// Testy: node app/lib/marketing/outscraper.test.js (fetch je podstrčený)
// ============================================================================
const O = require('./outscraper.js');

const POLL_MS = 5000;
const REQUEST_MAX_MS = 5 * 60 * 1000;

/**
 * @param {{ key: string, fetch?: Function, sleep?: Function, now?: Function, base?: string, pollMs?: number }} o
 */
function client({ key, fetch: fetchImpl = (...a) => fetch(...a), sleep = (ms) => new Promise(r => setTimeout(r, ms)),
  now = () => Date.now(), base, pollMs = POLL_MS } = {}) {
  if (!key) throw new Error('Chýba OUTSCRAPER_API_KEY.');
  const root = O.apiBase(base);
  let calls = 0;

  async function call(path, params, deadline) {
    const left = deadline - now();
    if (left < 3000) throw new Error('Outscraper: na odpoveď už nezostal čas.');
    const qs = O.queryString(params || {});
    const url = `${root}${path}${qs ? `?${qs}` : ''}`;
    let res;
    calls++;
    try {
      res = await fetchImpl(url, {
        method: 'GET',
        headers: { 'X-API-KEY': key, Accept: 'application/json', client: 'DANUBRA Hub' },
        signal: AbortSignal.timeout(Math.min(left, REQUEST_MAX_MS)),
      });
    } catch (e) {
      const t = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
      throw new Error(t ? 'Outscraper neodpovedal včas.' : 'Outscraper sa nedá zastihnúť (sieť).');
    }
    let json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    if (!res.ok && res.status !== 202) throw new Error(O.httpError(res.status, json));
    return O.readResponse(json, res.status);
  }

  /** Počká na hotovú odpoveď (sync hneď, async cez /requests/<id>). */
  async function settle(first, deadline) {
    let r = first;
    let polls = 0;
    const id = r.kind === 'pending' ? r.id : r.id || null;
    while (r.kind === 'pending') {
      if (now() + pollMs > deadline - 3000) throw new Error('Outscraper hľadá dlhšie, ako funkcia smie bežať. Skúste menší počet firiem.');
      await sleep(pollMs);
      polls++;
      r = await call(`/requests/${encodeURIComponent(r.id)}`, {}, deadline);
    }
    if (r.kind === 'error') throw new Error(r.message);
    return { data: r.data, polls, requestId: id, async: polls > 0 };
  }

  /**
   * Firmy z Google Máp.
   * @returns {Promise<{ groups: Array<Object[]>, places: Object[], requestId, async, polls }>}
   */
  async function mapsSearch(queries, { limit = 20, language = 'de', region = 'DE', async = false, deadline } = {}) {
    const qs = (queries || []).filter(Boolean);
    if (!qs.length) return { groups: [], places: [], requestId: null, async: false, polls: 0 };
    const dl = deadline || now() + 10 * 60 * 1000;
    const first = await call('/maps/search-v3', O.mapsParams({ queries: qs, limit, language, region, async }), dl);
    const r = await settle(first, dl);
    return { groups: O.groups(r.data, qs), places: O.flatten(r.data, qs), requestId: r.requestId, async: !!async || r.async, polls: r.polls };
  }

  /**
   * E-maily a telefóny z webov domén (jedna požiadavka pre všetky).
   * @returns {Promise<Map<string, { emails: string[], phones: string[] }>>}
   */
  async function contacts(domains, { deadline } = {}) {
    const list = [...new Set((domains || []).filter(Boolean))].slice(0, 100);
    if (!list.length) return new Map();
    const dl = deadline || now() + 5 * 60 * 1000;
    const first = await call('/emails-and-contacts', { query: list, async: false }, dl);
    const r = await settle(first, dl);
    return O.readContacts(r.data);
  }

  return { mapsSearch, contacts, get calls() { return calls; } };
}

/** Klient z env, alebo null (bez kľúča sa Outscraper nepoužije). */
function fromEnv(env = process.env, deps = {}) {
  const key = String(env.OUTSCRAPER_API_KEY || '').trim();
  if (!key) return null;
  return client({ key, base: env.OUTSCRAPER_API_URL, ...deps });
}

module.exports = { client, fromEnv, POLL_MS };
