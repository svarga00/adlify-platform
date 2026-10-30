// ============================================================================
// Testy serverovej funkcie danubra-leads-refresh-background
// (overenie, či sú údaje nových firiem aktuálne)
// Spustenie:  node app/tests/leads-refresh.test.js
// ============================================================================
// Bez siete a bez databázy: Outscraper (fetch), weby, DNS aj databáza sa
// podstrčia cez `handle(event, deps)`. Skutočné API sa nevolá.
// Test zámerne NEleží v `netlify/functions/` (pozri sf-invoice.test.js).
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

process.env.MAIL_SECRET = 'test-secret-na-podpis';
const F = require(path.join(__dirname, '..', '..', 'netlify', 'functions', 'danubra-leads-refresh-background.js'));
const Secret = require(path.join(__dirname, '..', 'lib', 'mail', 'secret.js'));

const ID = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const LEADS = [
  { id: ID(1), name: 'Huber Ausbau GmbH', city: 'Dachau', postal_code: '85221', website: 'https://huber-ausbau.de', email: 'info@huber-ausbau.de',
    phone: '+49 8131 1', status: 'new', google_place_id: 'ChIJ_huber_1234', business_status: 'OPERATIONAL', rating: 4.2, reviews_count: 20,
    verified_at: '2026-09-01T00:00:00Z', data_source: { name: 'maps' } },
  { id: ID(2), name: 'Keller Akustik GmbH', city: 'München', postal_code: '80331', website: 'https://keller-akustik.de', email: 'info@keller-akustik.de',
    status: 'contacted', verified_at: null },
  { id: ID(3), name: 'Nikde GmbH', city: 'Köln', website: null, email: null, status: 'new', verified_at: null, data_source: null },
];

function mkDb() {
  const db = {
    updates: [],
    async leadsByIds(ids) { return LEADS.filter(l => ids.includes(l.id)).map(l => ({ ...l })); },
    async staleCandidates() { return LEADS.map(l => ({ ...l })); },
    async updateLead(id, patch) { db.updates.push({ id, patch }); return { error: null }; },
    client() { return null; },
  };
  return db;
}

const mkRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function outscraperFetch(log) {
  return async (u, o) => {
    const url = new URL(u);
    log.push({ host: url.hostname, path: url.pathname, q: url.searchParams.getAll('query'), limit: url.searchParams.get('limit'), key: o.headers['X-API-KEY'] });
    const qs = url.searchParams.getAll('query');
    const data = qs.map((q) => {
      if (q === 'ChIJ_huber_1234') {
        return [{ name: 'Huber Ausbau GmbH', place_id: 'ChIJ_huber_1234', business_status: 'CLOSED_PERMANENTLY', phone: '+49 8131 999',
          site: 'https://huber-ausbau.de', rating: 4.0, reviews: 25, postal_code: '85221', city: 'Dachau', country_code: 'DE' }];
      }
      if (/Keller/.test(q)) {
        return [{ name: 'Keller Bau', place_id: 'other', site: 'https://keller-bau.de', city: 'Berlin' },
          { name: 'Keller Akustik GmbH', place_id: 'pl-keller', google_id: 'g-k', business_status: 'OPERATIONAL', site: 'https://keller-akustik.de',
            postal_code: '80331', city: 'München', rating: 4.8, reviews: 12, latitude: 48.1, longitude: 11.5 }];
      }
      return [];
    });
    return mkRes(200, { id: 'req-refresh-1', status: 'Success', data });
  };
}

const ev = (body, headers = { authorization: 'Bearer x' }) => ({ httpMethod: 'POST', headers, body: JSON.stringify(body) });
const parse = (r) => ({ code: r.statusCode, ...JSON.parse(r.body) });

function deps(over = {}) {
  const pages = [];
  return {
    pages,
    d: {
      db: mkDb(),
      guard: async () => ({ ok: true, user: { id: 'u1' } }),
      fetchPage: async (url) => { pages.push(url); return /huber/.test(url) ? { ok: false, url, error: 'Stránka vrátila chybu 503.' } : { ok: true, url, html: '<p>x</p>' }; },
      resolveMx: async (dom) => { if (dom === 'huber-ausbau.de') return [{ exchange: 'mx.huber.de', priority: 10 }]; const e = new Error('x'); e.code = 'ENOTFOUND'; throw e; },
      sleep: async () => {},
      ...over,
    },
  };
}

console.log('Overenie aktuálnosti firiem — serverová funkcia');

(async () => {
  ok(typeof F.handler === 'function' && typeof F.handle === 'function', 'exportuje handler aj handle');

  // ── Kto volá ──────────────────────────────────────────────────────────────
  {
    const { d } = deps({ guard: async () => ({ ok: false, status: 403, error: 'Na túto akciu nemáte oprávnenie.' }) });
    const r = parse(await F.handle(ev({ lead_ids: [ID(1)] }), d));
    ok(r.code === 403 && !d.db.updates.length, 'bez práva na Marketing → 403 a nič sa nezmení');
  }
  {
    const { d } = deps();
    eq(parse(await F.handle(ev({ lead_ids: ['zle-id'] }), d)).code, 400, 'neplatné id → 400');
    eq(parse(await F.handle(ev({ lead_ids: Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) }), d)).code, 400,
      'viac ako 50 naraz → 400');
    eq(parse(await F.handle({ body: '{zle' }, d)).code, 400, 'neplatný JSON → 400');
  }
  {
    // Cron: podpísaný kľúč s účelom leads-refresh platí, kľúč synchronizácie pošty nie.
    let guardCalls = 0;
    const { d } = deps({ guard: async () => { guardCalls++; return { ok: false, status: 401, error: 'x' }; }, outscraper: null });
    const r1 = parse(await F.handle(ev({}, { 'x-danubra-cron': Secret.cronToken(new Date(), undefined, 'leads-refresh') }), d));
    ok(r1.code === 200 && r1.cron && guardCalls === 0, 'cron s podpísaným kľúčom ide bez prihlásenia', JSON.stringify(r1));
    const r2 = parse(await F.handle(ev({}, { 'x-danubra-cron': Secret.cronToken() }), d));
    eq(r2.code, 401, 'kľúč synchronizácie pošty overovanie nespustí');
    eq(r1.checked, 3, 'cron vezme najdlhšie neoverené (aj nikdy neoverené)');
    process.env.OUTSCRAPER_REFRESH_WEEKLY = '0';
    const r3 = parse(await F.handle(ev({}, { 'x-danubra-cron': Secret.cronToken(new Date(), undefined, 'leads-refresh') }), d));
    delete process.env.OUTSCRAPER_REFRESH_WEEKLY;
    ok(/vypnuté/.test(r3.skipped || ''), 'OUTSCRAPER_REFRESH_WEEKLY=0 → vypnuté');
  }

  // ── S Outscraperom ────────────────────────────────────────────────────────
  {
    process.env.OUTSCRAPER_API_KEY = 'refresh-kluc';
    const log = [];
    const { d, pages } = deps({ fetch: outscraperFetch(log) });
    const r = parse(await F.handle(ev({ lead_ids: [ID(1), ID(2), ID(3)] }), d));
    delete process.env.OUTSCRAPER_API_KEY;
    eq([r.code, r.checked, r.updated, r.closed, r.not_found, r.web_bad, r.mx_bad, r.outscraper], [200, 3, 3, 1, 1, 1, 1, true], 'súhrn overenia');
    ok(!JSON.stringify(r).includes('refresh-kluc'), 'kľúč nie je v odpovedi');
    eq(log.map(x => [x.host, x.path, x.q, x.limit]), [
      ['api.app.outscraper.com', '/maps/search-v3', ['ChIJ_huber_1234'], '1'],
      ['api.app.outscraper.com', '/maps/search-v3', ['Keller Akustik GmbH, 80331 München', 'Nikde GmbH, Köln'], '3'],
    ], 'podľa place_id (1 výsledok), inak meno + PSČ a mesto (3 výsledky)');
    ok(log.every(x => x.key === 'refresh-kluc'), 'kľúč v hlavičke X-API-KEY');

    const u1 = d.db.updates.find(x => x.id === ID(1)).patch;
    eq([u1.business_status, !!u1.closed_at, u1.phone, u1.rating, u1.reviews_count, u1.web_ok, u1.email_mx_ok, !!u1.verified_at],
      ['CLOSED_PERMANENTLY', true, '+49 8131 999', 4, 25, false, true, true], 'natrvalo zatvorená → closed_at, telefón a hodnotenie z Máp, web nefunguje');
    ok(!('status' in u1), 'stav firmy sa nemení (ostáva Nová)');
    eq(u1.data_source.previous, { phone: '+49 8131 1' }, 'starý telefón sa odloží');
    const u2 = d.db.updates.find(x => x.id === ID(2)).patch;
    eq([u2.google_place_id, u2.business_status, u2.rating, u2.lat, u2.web_ok, u2.email_mx_ok], ['pl-keller', 'OPERATIONAL', 4.8, 48.1, true, false],
      'správna firma z viacerých (meno + PSČ), doplní place_id; e-mail bez MX');
    const u3 = d.db.updates.find(x => x.id === ID(3)).patch;
    eq([u3.data_source.maps_found, 'business_status' in u3, u3.web_ok, u3.email_mx_ok], [false, false, undefined, undefined],
      'nenájdená: nič sa neprepíše; bez webu a e-mailu sa nekontroluje');
    ok(pages.includes('https://huber-ausbau.de') && pages.includes('https://keller-akustik.de'), 'web sa overí stiahnutím úvodnej stránky');
  }

  // ── Bez kľúča: len web a MX ───────────────────────────────────────────────
  {
    delete process.env.OUTSCRAPER_API_KEY;
    let fetchCalls = 0;
    const { d } = deps({ fetch: async () => { fetchCalls++; return mkRes(500, {}); } });
    const r = parse(await F.handle(ev({ lead_ids: [ID(1)] }), d));
    const u = d.db.updates[0].patch;
    eq([r.outscraper, fetchCalls, 'verified_at' in u, u.web_ok, u.email_mx_ok], [false, 0, false, false, true], 'bez OUTSCRAPER_API_KEY: Outscraper sa nevolá, len web a MX');
  }

  // ── Outscraper zlyhá: web a MX sa overia aj tak ───────────────────────────
  {
    process.env.OUTSCRAPER_API_KEY = 'k';
    const { d } = deps({ fetch: async () => mkRes(402, { errorMessage: 'Payment required' }) });
    const r = parse(await F.handle(ev({ lead_ids: [ID(2)] }), d));
    delete process.env.OUTSCRAPER_API_KEY;
    ok(/kredit/.test(r.maps_error || '') && r.updated === 1 && !('verified_at' in d.db.updates[0].patch), 'chyba Outscraperu sa povie, web a MX sa zapíšu', JSON.stringify(r));
  }

  console.log(`\n${passed} prešlo, ${failed} padlo\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('  ✗ Error', e); process.exit(1); });
