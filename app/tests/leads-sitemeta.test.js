// ============================================================================
// Testy serverovej funkcie danubra-leads-sitemeta-background
// („Obnoviť logá a náhľady" pri nových firmách)
// Spustenie:  node app/tests/leads-sitemeta.test.js
// ============================================================================
// Bez siete a bez databázy: weby, Nominatim aj databáza sa podstrčia cez
// `handle(event, deps)`. Test zámerne NEleží v `netlify/functions/`.
// ============================================================================
const path = require('path');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}

const F = require(path.join(__dirname, '..', '..', 'netlify', 'functions', 'danubra-leads-sitemeta-background.js'));
const SM = require(path.join(__dirname, '..', 'lib', 'marketing', 'sitemeta.js'));

const ID = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const NOW = Date.parse('2026-10-30T10:00:00Z');
const LEADS = [
  { id: ID(1), name: 'Maier Innenausbau GmbH', website: 'https://www.maier-innenausbau.de', city: 'Augsburg', postal_code: '86150', lat: 48.37, lng: 10.89, site_checked_at: null },
  { id: ID(2), name: 'Keller Akustik GmbH', website: 'keller-akustik.de', city: 'München', lat: null, lng: null, site_checked_at: null },
  { id: ID(3), name: 'Tot GmbH', website: 'https://tot.example', city: 'Köln', site_checked_at: '2026-01-01T00:00:00Z' },
  { id: ID(4), name: 'Bez webu', website: null, city: 'Ulm', lat: null, site_checked_at: null },
  { id: ID(5), name: 'Archív GmbH', website: 'https://archiv.de', archived_at: '2026-10-01T00:00:00Z', site_checked_at: null },
];
const PAGES = {
  'https://www.maier-innenausbau.de': { ok: true, url: 'https://www.maier-innenausbau.de/', headers: { 'x-frame-options': 'SAMEORIGIN' },
    html: '<head><title>Maier</title><link rel="apple-touch-icon" href="/apple.png"><meta property="og:image" content="/team.jpg"><meta name="description" content="Trockenbau in Augsburg"></head>' },
  'https://keller-akustik.de': { ok: true, url: 'https://keller-akustik.de/', headers: {},
    html: '<head><meta property="og:title" content="Keller Akustik"><link rel="icon" href="https://keller-akustik.de/fav-32.png" sizes="32x32"></head>' },
  'https://tot.example': { ok: false, url: 'https://tot.example', error: 'Stránka neodpovedala včas.' },
};

function mkDb({ fail082 = false, settings = { id: 'cfg', supplier: { name: 'P&S', address: 'Podzámska 9468/4A, 940 71 Nové Zámky' } } } = {}) {
  const db = {
    updates: [], queries: [], supplier: null,
    async pending(q) { db.queries.push(q); return LEADS.filter(l => !l.archived_at && l.website && (!l.site_checked_at || l.site_checked_at < q.staleBefore)).map(l => ({ ...l })); },
    async byIds(ids) { return LEADS.filter(l => ids.includes(l.id) && !l.archived_at).map(l => ({ ...l })); },
    async noCoords() { return LEADS.filter(l => l.lat == null && !l.archived_at && l.city).map(l => ({ ...l })); },
    async updateLead(id, patch) {
      if (fail082 && 'site_checked_at' in patch) return { error: { message: "Could not find the 'site_checked_at' column of 'danubra_leads' in the schema cache" } };
      db.updates.push({ id, patch }); return { error: null };
    },
    async settings() { return settings; },
    async saveSupplier(id, supplier) { db.supplier = { id, supplier }; return { error: null }; },
    runs: [],
    async saveRun(id, run) { db.runs.push(run); settings.marketing = { ...(settings.marketing || {}), sitemeta_run: run }; return { error: null }; },
    client() { return null; },
  };
  return db;
}
function deps(db, extra = {}) {
  const log = { pages: [], geo: [] };
  return { log, d: {
    db, now: () => NOW, sleep: async () => {},
    guard: async (ev) => ((ev.headers || {}).authorization === 'Bearer ok' ? { ok: true } : { ok: false, status: 401, error: 'Prihláste sa.' }),
    fetchPage: async (url) => { log.pages.push(url); return PAGES[url] || { ok: false, url, error: 'nenájdené' }; },
    fetch: async (u, o) => {
      log.geo.push({ q: new URL(u).searchParams.get('q'), ua: o && o.headers && o.headers['User-Agent'] });
      const q = new URL(u).searchParams.get('q');
      const hit = /Nové Zámky/.test(q) ? [{ lat: '47.98544', lon: '18.16195', display_name: 'Nové Zámky' }] : /München/.test(q) ? [{ lat: '48.1351', lon: '11.582' }] : [];
      return { ok: true, json: async () => hit };
    },
    ...extra,
  } };
}
const call = (d, body = {}, auth = 'Bearer ok') => F.handle({ httpMethod: 'POST', headers: auth ? { authorization: auth } : {}, body: JSON.stringify(body) }, d)
  .then(r => ({ code: r.statusCode, ...JSON.parse(r.body) }));

(async () => {
  console.log('Obnoviť logá a náhľady');
  {
    const db = mkDb();
    const { d } = deps(db);
    eq((await call(d, {}, null)).code, 401, 'bez prihlásenia nič (server-guard)');
    eq(db.updates.length, 0, '…a nič sa nezapísalo');
  }
  {
    const db = mkDb();
    const { d, log } = deps(db);
    const r = await call(d, {});
    eq(r.code, 200, 'prebehlo');
    eq(log.pages.sort(), ['https://keller-akustik.de', 'https://tot.example', 'https://www.maier-innenausbau.de'],
      'stiahne sa len úvodná stránka firiem s webom; bez webu a archivované nie; doména dostane https://');
    ok(db.queries[0].staleBefore === '2026-09-30T10:00:00.000Z', 'staršie ako 30 dní sa kontrolujú znova', db.queries[0].staleBefore);
    const maier = db.updates.find(u => u.id === ID(1)).patch;
    eq(maier, { site_checked_at: '2026-10-30T10:00:00.000Z', logo_url: 'https://www.maier-innenausbau.de/apple.png', og_image: 'https://www.maier-innenausbau.de/team.jpg',
      site_title: 'Maier', site_description: 'Trockenbau in Augsburg', site_embeddable: false }, 'logo, obrázok, titulok, popis; SAMEORIGIN = nedá sa vložiť');
    eq(db.updates.find(u => u.id === ID(2)).patch.site_embeddable, true, 'bez hlavičiek sa vložiť dá');
    eq(db.updates.find(u => u.id === ID(3)).patch, { site_checked_at: '2026-10-30T10:00:00.000Z' }, 'nedostupný web: len čas pokusu, staré údaje ostanú');
    eq([r.checked, r.updated, r.with_logo, r.with_image, r.unreachable, r.embeddable], [3, 3, 2, 1, 1, 1], 'súhrn');
    // Súradnice: kancelária a firmy bez lat/lng.
    eq(db.supplier, { id: 'cfg', supplier: { name: 'P&S', address: 'Podzámska 9468/4A, 940 71 Nové Zámky', office_coords: '47.98544, 18.16195' } },
      'súradnice kancelárie z adresy v Nastaveniach (ostatné údaje ostanú)');
    ok(log.geo.every(g => /^DANUBRA-Hub\//.test(g.ua)), 'Nominatim so zdvorilým User-Agent');
    const keller = db.updates.find(u => u.id === ID(2) && 'lat' in u.patch);
    eq(keller && keller.patch, { lat: 48.1351, lng: 11.582 }, 'firma bez súradníc ich dostane z adresy');
    eq(r.geocoded, 1, 'nenájdená adresa sa nezapíše');
  }
  {
    const db = mkDb({ settings: { id: 'cfg', supplier: { address: 'X', office_coords: '48.1, 17.1' } } });
    const { d, log } = deps(db);
    await call(d, {});
    ok(!db.supplier && !log.geo.some(g => g.q === 'X'), 'zadané súradnice kancelárie sa neprepisujú');
  }

  console.log('\nJeden beh naraz (zámok v settings.marketing.sitemeta_run)');
  {
    const db = mkDb();
    const { d } = deps(db);
    await call(d, {});
    const last = db.runs[db.runs.length - 1];
    ok(db.runs.length >= 2 && db.runs[0].started_at && !db.runs[0].finished_at && last.finished_at, 'beh zapíše začiatok, heartbeat a koniec', JSON.stringify(db.runs));
    const busy = mkDb({ settings: { id: 'cfg', supplier: {}, marketing: { outreach: { daily_limit: 30 }, sitemeta_run: { started_at: '2026-10-30T09:58:00Z', heartbeat_at: '2026-10-30T09:59:00Z', finished_at: null } } } });
    const x = deps(busy);
    const r = await call(x.d, {});
    ok(r.code === 200 && /už dopĺňajú/.test(r.skipped) && !x.log.pages.length, 'kým iný beh žije (heartbeat do 3 min), druhý nič nesťahuje', JSON.stringify(r));
    const old = mkDb({ settings: { id: 'cfg', supplier: {}, marketing: { sitemeta_run: { heartbeat_at: '2026-10-30T09:40:00Z', finished_at: null } } } });
    const y = deps(old);
    await call(y.d, {});
    ok(y.log.pages.length === 3, 'beh, ktorý sa 20 minút neozval (spadol), neblokuje');
    const z = deps(busy);
    await call(z.d, { lead_ids: [ID(1)] });
    ok(z.log.pages.length === 1, 'vybrané firmy (z detailu) zámok neriešia');
  }

  console.log('\nVybrané firmy');
  {
    const db = mkDb();
    const { d, log } = deps(db);
    const r = await call(d, { lead_ids: [ID(2), ID(5), 'nie-je-uuid'] });
    eq([r.code, log.pages], [200, ['https://keller-akustik.de']], 'len vybrané a nearchivované');
    eq(log.geo.filter(g => !/Nové Zámky/.test(g.q)).length, 0, 'pri vybraných sa ďalšie firmy negeokódujú');
    eq((await call(d, { lead_ids: ['zle'] })).code, 400, 'neplatné id = chyba');
    eq((await call(d, { lead_ids: Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) })).code, 400, 'najviac 50');
  }

  console.log('\nBez migrácie 082');
  {
    const db = mkDb({ fail082: true });
    const { d } = deps(db);
    const r = await call(d, {});
    ok(r.code === 503 && /migrácia 082/.test(r.error), 'povie, že chýba migrácia 082', JSON.stringify(r));
    ok(!db.supplier, '…a ďalej nepokračuje');
  }

  console.log('\nHľadanie podľa webov ukladá logo a náhľad (danubra-leads-from-urls-background)');
  {
    const Urls = require(path.join(__dirname, '..', '..', 'netlify', 'functions', 'danubra-leads-from-urls-background.js'));
    const pages = { 'https://firma.de': { ok: true, url: 'https://firma.de/', html: '<head><link rel="icon" href="/l.png" sizes="96x96"><title>Firma</title></head><body>Hallo</body>', headers: {} } };
    const site = await Urls.readSite('https://firma.de', { fetchPage: async (u) => pages[u] || { ok: false, url: u, error: 'x' }, now: () => 0 }, { deadline: 1e15 });
    eq(site.meta && site.meta.logo_url, 'https://firma.de/l.png', 'readSite vráti aj logo z úvodnej stránky');
    // insertLead: bez 082 sa uloží bez nových stĺpcov.
    const inserted = [];
    const fake = { from: () => ({ insert: async (row) => { inserted.push(row); return { error: 'logo_url' in row ? { message: "Could not find the 'logo_url' column of 'danubra_leads' in the schema cache" } : null }; } }) };
    const db = Urls.supabaseDb(() => fake);
    const r = await db.insertLead({ name: 'Firma', source: 'urls', ...SM.leadPatch({ logo_url: 'https://firma.de/l.png' }, new Date(NOW)) });
    ok(!r.error && inserted.length === 2 && !('logo_url' in inserted[1]) && !('site_checked_at' in inserted[1]), 'bez 082 sa firma uloží bez loga (nič nespadne)');
  }

  console.log(`\n${passed} prešlo, ${failed} padlo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`  ✗ test spadol: ${e.stack}`); console.log('\n0 prešlo, 1 padlo'); process.exit(1); });
