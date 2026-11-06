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
// Väčšie hľadanie (po kolách): mapsStart pošle dotazy po častiach (najviac
// 10 v jednej požiadavke, všetky async) a vráti úlohy { id, queries };
// mapsCollect sa na ne pýta najviac do `stopAt` — čo nie je hotové, ostane
// a ďalšie kolo funkcie sa opýta znova (Outscraper výsledky drží hodiny).
// Kontakty idú po 100 doménach v jednej požiadavke.
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

  /**
   * Počká na hotovú odpoveď (sync hneď, async cez /requests/<id>).
   * `onPoll(n)` sa zavolá pri každom čakaní — priebeh hľadania (080).
   */
  async function settle(first, deadline, onPoll) {
    let r = first;
    let polls = 0;
    const id = r.kind === 'pending' ? r.id : r.id || null;
    while (r.kind === 'pending') {
      if (now() + pollMs > deadline - 3000) throw new Error('Outscraper hľadá dlhšie, ako funkcia smie bežať. Skúste menší počet firiem.');
      await sleep(pollMs);
      polls++;
      if (typeof onPoll === 'function') { try { await onPoll(polls); } catch (e) { /* priebeh hľadanie nezastaví */ } }
      r = await call(`/requests/${encodeURIComponent(r.id)}`, {}, deadline);
    }
    if (r.kind === 'error') throw new Error(r.message);
    return { data: r.data, polls, requestId: id, async: polls > 0 };
  }

  /**
   * Firmy z Google Máp.
   * @returns {Promise<{ groups: Array<Object[]>, places: Object[], requestId, async, polls }>}
   */
  async function mapsSearch(queries, { limit = 20, language = 'de', region = 'DE', async = false, deadline, onPoll } = {}) {
    const qs = (queries || []).filter(Boolean);
    if (!qs.length) return { groups: [], places: [], requestId: null, async: false, polls: 0 };
    const dl = deadline || now() + 10 * 60 * 1000;
    const first = await call('/maps/search-v3', O.mapsParams({ queries: qs, limit, language, region, async }), dl);
    const r = await settle(first, dl, onPoll);
    return { groups: O.groups(r.data, qs), places: O.flatten(r.data, qs), requestId: r.requestId, async: !!async || r.async, polls: r.polls };
  }

  /**
   * Väčšie hľadanie: dotazy po častiach (najviac `per` v jednej požiadavke),
   * všetky asynchrónne. Úloha, ktorú Outscraper vráti hneď, má `data`.
   * @returns {Promise<Array<{ id, queries: string[], done: boolean, data? }>>}
   */
  async function mapsStart(queries, { limit = 20, language = 'de', region = 'DE', deadline, per = O.QUERIES_PER_REQUEST } = {}) {
    const dl = deadline || now() + 10 * 60 * 1000;
    const jobs = [];
    for (const qs of O.chunkQueries(queries, per)) {
      const r = await call('/maps/search-v3', O.mapsParams({ queries: qs, limit, language, region, async: true }), dl);
      if (r.kind === 'error') throw new Error(r.message);
      jobs.push(r.kind === 'pending' ? { id: r.id, queries: qs, done: false } : { id: r.id || null, queries: qs, done: true, data: r.data });
    }
    return jobs;
  }

  /**
   * Čaká na úlohy z mapsStart najviac do `stopAt`. Nehotové ostanú nehotové
   * (ďalšie kolo sa opýta znova), hotové majú `data`.
   * `onPoll(n, hotových, spolu)` pri každom čakaní — priebeh hľadania.
   * @returns {Promise<{ jobs, done: boolean, polls: number }>}
   */
  async function mapsCollect(jobs, { stopAt, onPoll } = {}) {
    const list = (jobs || []).map(j => ({ ...j }));
    const until = stopAt || now() + 10 * 60 * 1000;
    let polls = 0;
    for (;;) {
      for (const j of list.filter(x => !x.done)) {
        if (!O.requestIdOk(j.id)) throw new Error('Outscraper nevrátil číslo požiadavky.');
        const r = await call(`/requests/${encodeURIComponent(j.id)}`, {}, until + 5000);
        if (r.kind === 'error') throw new Error(r.message);
        if (r.kind === 'done') { j.done = true; j.data = r.data; }
      }
      const open = list.filter(x => !x.done).length;
      if (!open || now() + pollMs > until) break;
      await sleep(pollMs);
      polls++;
      if (typeof onPoll === 'function') { try { await onPoll(polls, list.length - open, list.length); } catch (e) { /* priebeh nezastaví */ } }
    }
    return { jobs: list, done: list.every(x => x.done), polls };
  }

  /**
   * E-maily a telefóny z webov domén (po 100 doménach v požiadavke, spolu
   * najviac `max`).
   * @returns {Promise<Map<string, { emails: string[], phones: string[] }>>}
   */
  async function contacts(domains, { deadline, max = 1000, per = 100 } = {}) {
    const list = [...new Set((domains || []).filter(Boolean))].slice(0, max);
    const out = new Map();
    if (!list.length) return out;
    const dl = deadline || now() + 5 * 60 * 1000;
    for (let i = 0; i < list.length; i += per) {
      const first = await call('/emails-and-contacts', { query: list.slice(i, i + per), async: false }, dl);
      const r = await settle(first, dl);
      for (const [k, v] of O.readContacts(r.data)) out.set(k, v);
    }
    return out;
  }

  return { mapsSearch, mapsStart, mapsCollect, contacts, get calls() { return calls; } };
}

/** Klient z env, alebo null (bez kľúča sa Outscraper nepoužije). */
function fromEnv(env = process.env, deps = {}) {
  const key = String(env.OUTSCRAPER_API_KEY || '').trim();
  if (!key) return null;
  return client({ key, base: env.OUTSCRAPER_API_URL, ...deps });
}

module.exports = { client, fromEnv, POLL_MS };
