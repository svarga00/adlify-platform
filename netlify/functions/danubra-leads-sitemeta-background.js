// ============================================================================
// DANUBRA — „Obnoviť logá a náhľady" pri nových firmách (na pozadí)
// ============================================================================
// „Nevidím favicony ani logá, nič. Obnovte prosím aj staré dáta."
//
// Spúšťa sa z obrazovky Nové firmy (tlačidlo „Obnoviť logá a náhľady")
// s prihlásením a právom Marketing (app/lib/server-guard.js):
//   POST {}                       firmy bez site_checked_at alebo staršie
//                                 ako 30 dní (stale_days), najviac 300
//   POST { lead_ids: [...] }      len vybrané (najviac 50)
//
// Pri každej firme s webom sa stiahne LEN jej úvodná stránka (tá istá
// ochrana proti SSRF, časový limit a zdvorilý User-Agent ako pri hľadaní)
// a z <head> sa zapíše logo, og:image, titulok, popis a či sa web smie
// ukázať v okne appky (app/lib/marketing/sitemeta.js, stĺpce z 082).
// Zadarmo: žiadne kredity Outscraperu, žiadne volanie AI. Archivované firmy
// sa vynechajú. Web, ktorý neodpovedá, dostane len site_checked_at — staré
// údaje ostanú a skúsi sa znova o 30 dní.
//
// Popritom (kým je čas): súradnice kancelárie (settings.supplier.office_coords)
// z adresy firmy, keď nie sú zadané, a súradnice firiem bez lat/lng z ich
// adresy — cez Nominatim (OpenStreetMap), najviac 1 dotaz za sekundu
// a najviac 40 firiem na jedno spustenie. Na „ako ďaleko je to od nás".
// Pri vybraných firmách (lead_ids) len tie vybrané, ktoré polohu nemajú.
//
// Appka ho spúšťa aj sama pri otvorení Nových firiem, keď sú firmy bez
// náhľadu (najviac raz za 30 minút na používateľa). Aby dvaja ľudia
// nespustili to isté naraz, beh si zapisuje „žije" do settings.marketing.
// sitemeta_run (heartbeat po každej dávke); kým je čerstvý (do 3 minút),
// ďalšie spustenie celého prechodu skončí hneď (skipped). Vybrané firmy
// (lead_ids) zámok neriešia.
//
// Dávky po 10 firmách, 4 naraz, medzi dávkami krátka pauza. Celé najviac
// ~12 minút (Netlify zastaví funkciu na pozadí po 15). Appka priebeh číta
// z databázy (koľko firiem ešte nemá site_checked_at).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================
const SM = require('../../app/lib/marketing/sitemeta.js');
const R = require('../../app/lib/route.js');
const Urls = require('./danubra-leads-from-urls-background.js');

const TOTAL_MS = 12 * 60 * 1000;
const BATCH = 10;
const PARALLEL = 4;
const MAX_ALL = 300;
const MAX_IDS = 50;
const STALE_DAYS = 30;
const GEO_MAX = 40;
const UA = 'DANUBRA-Hub/1.0 (info@punds.eu)';
const LEAD_COLS = 'id,name,website,address,postal_code,city,country,lat,lng,site_checked_at,archived_at';
const LOCK_MS = 3 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const out = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const NO_082 = 'Logá a náhľady ešte nie sú pripravené v databáze — chýba migrácia 082.';

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
  const fail = (error) => { throw new Error(SM.missing082(error) ? NO_082 : (error.message || String(error))); };
  return {
    client: c,
    async pending({ staleBefore, limit }) {
      const { data, error } = await c().from('danubra_leads').select(LEAD_COLS).is('archived_at', null).not('website', 'is', null)
        .or(`site_checked_at.is.null,site_checked_at.lt.${staleBefore}`)
        .order('site_checked_at', { ascending: true, nullsFirst: true }).limit(limit);
      if (error) fail(error);
      return data || [];
    },
    async byIds(ids) {
      const { data, error } = await c().from('danubra_leads').select(LEAD_COLS).in('id', ids).is('archived_at', null);
      if (error) fail(error);
      return data || [];
    },
    async noCoords(limit) {
      const { data, error } = await c().from('danubra_leads').select(LEAD_COLS).is('archived_at', null).is('lat', null)
        .not('city', 'is', null).order('created_at', { ascending: false }).limit(limit);
      if (error) return [];
      return data || [];
    },
    async updateLead(id, patch) { const { error } = await c().from('danubra_leads').update(patch).eq('id', id); return { error }; },
    async settings() {
      const { data } = await c().from('danubra_settings').select('id,supplier,marketing').limit(1);
      return (data || [])[0] || null;
    },
    /** Zámok behu: settings.marketing.sitemeta_run — prečíta čerstvé marketing a zmení len tento kľúč. */
    async saveRun(id, run) {
      const { data } = await c().from('danubra_settings').select('marketing').eq('id', id).maybeSingle();
      const marketing = { ...((data && data.marketing) || {}), sitemeta_run: run };
      const { error } = await c().from('danubra_settings').update({ marketing }).eq('id', id);
      return { error };
    },
    async saveSupplier(id, supplier) { const { error } = await c().from('danubra_settings').update({ supplier }).eq('id', id); return { error }; },
  };
}

async function nominatim(q, d) {
  const res = await d.fetch(R.geocodeUrl(q), { headers: { 'User-Agent': UA, 'Accept-Language': 'de,sk;q=0.8,en;q=0.5' } });
  if (!res || !res.ok) return null;
  return R.pickPlace(await res.json());
}

const defaults = {
  db: null,
  guard: null,
  fetchPage: (url) => Urls.fetchPage(url),
  fetch: (...a) => fetch(...a),
  sleep: (ms) => new Promise(r => setTimeout(r, ms)),
  now: () => Date.now(),
};

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k); }
  }));
}

const siteUrl = (w) => { const t = String(w || '').trim(); return t ? (/^https?:\/\//i.test(t) ? t : `https://${t}`) : ''; };

async function run(event, d) {
  let body = {};
  try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return out(400, { error: 'Neplatné telo požiadavky.' }); }
  const g = await d.guard(event);
  if (!g || !g.ok) return out((g && g.status) || 403, { error: (g && g.error) || 'Na túto akciu nemáte oprávnenie.' });

  const started = d.now();
  const deadline = started + TOTAL_MS;
  const nowDate = () => new Date(d.now());
  let leads;
  try {
    if (Array.isArray(body.lead_ids)) {
      const ids = [...new Set(body.lead_ids.map(String).filter(x => UUID.test(x)))];
      if (!ids.length) return out(400, { error: 'Chýba zoznam firiem (lead_ids).' });
      if (ids.length > MAX_IDS) return out(400, { error: `Naraz najviac ${MAX_IDS} firiem.` });
      leads = await d.db.byIds(ids);
    } else {
      const days = Math.max(1, Math.min(365, Number(body.stale_days) || STALE_DAYS));
      const staleBefore = new Date(started - days * 86400000).toISOString();
      leads = await d.db.pending({ staleBefore, limit: MAX_ALL });
    }
  } catch (e) {
    return out(503, { error: String((e && e.message) || e).slice(0, 300) });
  }

  // Zámok: celý prechod beží naraz len raz (dvaja ľudia otvoria Nové firmy naraz).
  const all = !Array.isArray(body.lead_ids);
  let cfg = null;
  if (all) {
    try { cfg = await d.db.settings(); } catch (e) { cfg = null; }
    const run = cfg && cfg.marketing && cfg.marketing.sitemeta_run;
    const hb = run && !run.finished_at ? Date.parse(run.heartbeat_at || '') : NaN;
    if (Number.isFinite(hb) && started - hb < LOCK_MS) return out(200, { skipped: 'Logá a náhľady sa už dopĺňajú (iné spustenie beží).' });
  }
  const iso = () => new Date(d.now()).toISOString();
  const runAt = iso();
  const beat = async (extra = {}) => {
    if (!all || !cfg || !d.db.saveRun) return;
    try { await d.db.saveRun(cfg.id, { started_at: runAt, heartbeat_at: iso(), finished_at: null, ...extra }); } catch (e) { /* zámok nie je podstatný */ }
  };
  await beat({ total: leads.length });

  const sum = { checked: 0, updated: 0, with_logo: 0, with_image: 0, with_description: 0, embeddable: 0, unreachable: 0,
    errors: 0, skipped: 0, office: null, geocoded: 0 };
  let stop = null;
  const todo = leads.filter(l => !l.archived_at && siteUrl(l.website));
  sum.skipped = leads.length - todo.length;

  for (let i = 0; i < todo.length && !stop; i += BATCH) {
    if (d.now() > deadline - 30000) break;
    await pool(todo.slice(i, i + BATCH), PARALLEL, async (l) => {
      if (stop || d.now() > deadline - 20000) return;
      let page = null;
      try { page = await d.fetchPage(siteUrl(l.website)); } catch (e) { page = null; }
      const meta = page && page.ok ? SM.extract(page.html, page.url, page.headers) : null;
      sum.checked++;
      if (!meta) sum.unreachable++;
      const { error } = await d.db.updateLead(l.id, SM.leadPatch(meta, nowDate()));
      if (error) {
        if (SM.missing082(error)) stop = NO_082;
        sum.errors++;
        return;
      }
      sum.updated++;
      if (meta && meta.logo_url) sum.with_logo++;
      if (meta && meta.og_image) sum.with_image++;
      if (meta && meta.site_description) sum.with_description++;
      if (meta && meta.site_embeddable) sum.embeddable++;
    });
    await beat({ total: leads.length, done: sum.checked });
    if (!stop && i + BATCH < todo.length) await d.sleep(300);
  }
  if (stop) { await beat({ finished_at: iso(), error: stop }); return out(503, { error: stop, ...sum }); }

  // Súradnice na „ako ďaleko je to od nás" (Nominatim: 1 dotaz za sekundu).
  try {
    const s = d.now() < deadline - 60000 ? (cfg || await d.db.settings()) : null;
    const sup = (s && s.supplier) || {};
    if (s && !String(sup.office_coords || '').trim() && String(sup.address || '').trim()) {
      const p = await nominatim(sup.address, d);
      if (p) {
        const { error } = await d.db.saveSupplier(s.id, { ...sup, office_coords: `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` });
        sum.office = error ? 'neuložené' : 'doplnené';
      } else sum.office = 'nenájdené';
      await d.sleep(1100);
    }
    // Vybrané firmy (napr. práve pridaná z odkazu od kolegu, 085) — len tie,
    // ktoré polohu nemajú a majú mesto; ostatné firmy sa pri tom negeokódujú.
    const geoTodo = Array.isArray(body.lead_ids)
      ? leads.filter(l => !l.archived_at && l.lat == null && String(l.city || '').trim()).slice(0, GEO_MAX)
      : await d.db.noCoords(GEO_MAX);
    {
      for (const l of geoTodo) {
        if (d.now() > deadline - 15000) break;
        const q = [l.address, [l.postal_code, l.city].filter(Boolean).join(' '), 'Deutschland'].filter(Boolean).join(', ');
        const p = await nominatim(q, d).catch(() => null);
        if (p) {
          const { error } = await d.db.updateLead(l.id, { lat: p.lat, lng: p.lng });
          if (!error) sum.geocoded++;
        }
        await beat({ total: leads.length, done: sum.checked, phase: 'coords' });
        await d.sleep(1100);
      }
    }
  } catch (e) { sum.geo_error = String((e && e.message) || e).slice(0, 200); }
  await beat({ finished_at: iso(), done: sum.checked });

  console.log('[danubra-leads-sitemeta]', JSON.stringify(sum));
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
