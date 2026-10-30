// ============================================================================
// Testy serverovej funkcie danubra-leads-from-urls-background
// (nové firmy podľa webov zadaných firiem)
// Spustenie:  node app/tests/leads-from-urls.test.js
// ============================================================================
// Bez siete, bez databázy a bez kľúča k modelu: overenie volajúceho, databáza,
// sťahovanie stránok a model sa podstrčia cez `handle(event, deps)`.
// Knižnica seeds.js je skutočná — Impressum sa číta naozaj.
//
// Test zámerne NEleží v `netlify/functions/` — Netlify by z neho robil
// funkciu a bodka v názve zhodí deploy (pozri sf-invoice.test.js).
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

const F = require(path.join(__dirname, '..', '..', 'netlify', 'functions', 'danubra-leads-from-urls-background.js'));

// ── Podstrčené weby ─────────────────────────────────────────────────────────
const html = (body, links = '') => `<html><body><nav>${links}</nav>${body}</body></html>`;
const SITES = {
  'https://www.huber-trockenbau.de/': html('<h1>Trockenbau und Innenausbau in Bayern</h1>', '<a href="/impressum">Impressum</a>'),
  'https://www.huber-trockenbau.de/impressum': html('<p>Impressum</p><p>Huber Trockenbau GmbH</p><p>Gewerbering 14, 85221 Dachau</p>'),
  'https://schmidt-ausbau.de/': html('<h1>Schmidt Ausbau — Akustikdecken, Trockenbau</h1>'),
  'https://schmidt-ausbau.de/impressum': html('<p>Angaben gemäß § 5 DDG</p><p>Schmidt Ausbau GmbH</p>'),
  // weber-bau.de sa stiahnuť nedá (žiadny záznam) → model ho dohľadá.

  // Nájdené firmy:
  'https://maier-innenausbau.de/': html('<p>Maier Innenausbau</p>', '<a href="/impressum.html">Impressum</a>'),
  'https://maier-innenausbau.de/impressum.html': html(`<p>Impressum</p><p>Maier Innenausbau GmbH</p><p>Lindenstraße 3</p><p>86150 Augsburg</p>
    <p>Geschäftsführer: Thomas Maier</p><p>Tel.: +49 (0) 821 / 44 55-0</p><p>Fax: 0821 445599</p>
    <p>E-Mail: info [at] maier-innenausbau [dot] de</p><p>USt-IdNr.: DE 811 222 333</p>
    <p>Webdesign: hallo@pixel-agentur.de</p>`),
  'https://keller-akustik.de/': html('<p>Keller Akustik. Kontakt: keine Adresse hier</p>'),
  'https://keller-akustik.de/impressum': html('<p>Impressum</p><p>Keller Akustik GmbH</p><p>Inhaber: Paul Keller</p>'),
  'https://redirect-bau.de/': { redirect: 'http://169.254.169.254/latest/meta-data/' },
};
const fetched = [];
const fetchPage = async (url) => {
  url = new URL(url).href;
  fetched.push(url);
  const s = SITES[url];
  if (!s) return { ok: false, url, error: 'Stránka vrátila chybu 404.' };
  if (s.redirect) return F.fetchPage(url, { request: async () => ({ status: 302, location: s.redirect }) });
  return { ok: true, url, html: s };
};

// ── Podstrčený model ────────────────────────────────────────────────────────
const tool = (name, input, stop = 'tool_use') => ({ stop_reason: stop, content: [{ type: 'tool_use', id: 't', name, input }] });
const PROFILES = tool('report_profiles', { profiles: [
  { url: 'https://www.huber-trockenbau.de/', name: 'Huber Trockenbau GmbH', trade: 'suchá výstavba', typical_jobs: ['priečky', 'podhľady'],
    region: 'Dachau, Bayern', size: '20–50', keywords: ['Trockenbau', 'Innenausbau'], summary: 'Suchá výstavba pre bytové domy.' },
  { url: 'https://schmidt-ausbau.de/', name: 'Schmidt Ausbau GmbH', trade: 'akustické podhľady', typical_jobs: ['Akustikdecken'],
    region: 'Bayern', size: null, keywords: ['Akustik'], summary: 'Akustické podhľady.' },
  { url: 'https://weber-bau.de/', name: 'Weber Bau', trade: 'stavebná firma', typical_jobs: [], region: null, size: null, keywords: [], summary: null },
] });
const LEAD = (o) => ({ name: 'X', website: null, city: null, postal_code: null, region: 'Bayern', trade: 'suchá výstavba', employees: '20–50',
  email: null, phone: null, contact_person: null, why: 'Robí to isté.', score: 80, similar_to_url: 'https://www.huber-trockenbau.de/',
  source_url: null, summary: 'Trockenbau.', ...o });
const LEADS = tool('report_leads', { leads: [
  LEAD({ name: 'Maier Innenausbau', website: 'maier-innenausbau.de', city: 'Augsburg', email: 'm.maier@maier-innenausbau.de', score: 93.6 }),
  LEAD({ name: 'Keller Akustik GmbH', website: 'https://keller-akustik.de', email: 'info@keller-akustik.de', score: 140,
    similar_to_url: 'schmidt-ausbau.de' }),
  LEAD({ name: 'Bauer Bau GmbH', website: 'https://bauer-bau.de', email: 'info@bauer-bau.de', score: 70 }),          // web nejde → e-mail „ai"
  LEAD({ name: 'Inak Müller', website: 'https://www.mueller-bau.de/' }),                                          // už je medzi firmami (doména)
  LEAD({ name: 'GU Ulm GmbH', city: 'Ulm', website: 'https://gu-ulm-2.de' }),                                      // odberateľ (meno + mesto)
  LEAD({ name: 'Odhlásená GmbH', website: 'https://odhlasena.de', email: 'info@odhlasena.de' }),                   // odhlásená
  LEAD({ name: 'Huber Trockenbau', website: 'https://huber-trockenbau.de' }),                                      // zadaná firma
  LEAD({ name: 'Redirect Bau', website: 'https://redirect-bau.de', email: 'info@iny.de', similar_to_url: 'https://cudzia.de' }),
  LEAD({ name: '', website: 'https://bezmena.de' }),
] });

const USER = { id: 'u1' };
function mkDb(search) {
  const db = {
    search: { ...search }, updates: [], inserted: [],
    async getSearch(id) { return id === db.search.id ? { ...db.search } : null; },
    async updateSearch(id, patch) { db.updates.push(patch); Object.assign(db.search, patch); },
    async known() {
      return {
        leads: [{ name: 'Müller Bau GmbH', city: 'Ulm', website: 'mueller-bau.de' }],
        partners: [{ name: 'GU Ulm GmbH', city: 'Ulm', email: 'bau@gu-ulm.de' }],
        optouts: [{ email: 'info@odhlasena.de' }],
      };
    },
    async insertLead(row) {
      if (db.inserted.some(r => r.name === row.name)) return { error: { message: 'duplicate key' } };
      db.inserted.push(row); return { error: null };
    },
  };
  return db;
}
const SEARCH = { id: 's1', kind: 'urls', status: 'pending',
  params: { urls: ['https://www.huber-trockenbau.de/', 'schmidt-ausbau.de', 'weber-bau.de'], region: 'Bayern', count: 20 } };

function deps(over = {}) {
  const models = over.models || [PROFILES, LEADS];
  const calls = [];
  let t = 1000;
  return {
    calls,
    d: {
      db: over.db || mkDb(SEARCH),
      guard: over.guard || (async () => ({ ok: true, user: USER })),
      fetchPage: over.fetchPage || fetchPage,
      callModel: async (body, opt) => { calls.push({ body, opt }); const m = models[calls.length - 1]; if (m instanceof Error) throw m; return m || LEADS; },
      now: over.now || (() => (t += 10)),
    },
  };
}
const ev = (body) => ({ httpMethod: 'POST', headers: { authorization: 'Bearer x' }, body: JSON.stringify(body) });
const parse = (r) => ({ code: r.statusCode, ...JSON.parse(r.body) });

console.log('Nové firmy podľa webov — serverová funkcia');

(async () => {
  ok(typeof F.handler === 'function' && typeof F.handle === 'function', 'exportuje handler aj handle');

  // ── Kto volá ──────────────────────────────────────────────────────────────
  {
    const { d, calls } = deps({ guard: async () => ({ ok: false, status: 403, error: 'Na túto akciu nemáte oprávnenie.' }) });
    const r = parse(await F.handle(ev({ search_id: 's1' }), d));
    eq(r.code, 403, 'bez práva na Marketing → 403');
    ok(!calls.length && !d.db.updates.length, 'a nič sa nevolá ani nezapíše');
  }
  {
    const { d } = deps();
    eq(parse(await F.handle({ body: '{zle' }, d)).code, 400, 'neplatný JSON → 400');
    eq(parse(await F.handle(ev({}), d)).code, 400, 'bez search_id → 400');
    eq(parse(await F.handle(ev({ search_id: 'iny' }), d)).code, 404, 'neznáme hľadanie → 404');
  }
  {
    const db = mkDb({ ...SEARCH, status: 'done' });
    const { d, calls } = deps({ db });
    eq(parse(await F.handle(ev({ search_id: 's1' }), d)).code, 409, 'hľadanie, ktoré už skončilo, sa nespustí znova');
    ok(!calls.length, 'model sa nevolá');
  }

  // ── Zlé adresy ────────────────────────────────────────────────────────────
  {
    const db = mkDb({ ...SEARCH, params: {} });
    const { d, calls } = deps({ db });
    fetched.length = 0;
    const r = parse(await F.handle(ev({ search_id: 's1', urls: ['https://a-bau.de', 'http://127.0.0.1/', 'http://localhost:8080', 'http://10.0.0.1'] }), d));
    eq(r.status, 'error', 'menej ako 3 platné adresy → chyba hľadania');
    ok(/aspoň 3/.test(db.search.error) && /127\.0\.0\.1/.test(db.search.error), 'chyba povie, koľko treba a čo sa nedá použiť', db.search.error);
    ok(!fetched.length && !calls.length, 'nič sa nesťahuje (ani lokálne adresy) a model sa nevolá');
    eq(db.updates[0], { status: 'running' }, 'najprv beží');
  }
  {
    const db = mkDb({ ...SEARCH, params: {} });
    const { d } = deps({ db });
    await F.handle(ev({ search_id: 's1', urls: Array.from({ length: 11 }, (_, i) => `firma${i}.de`) }), d);
    ok(/Najviac 10/.test(db.search.error || ''), 'viac ako 10 adries → chyba', db.search.error);
  }

  // ── Celé hľadanie ─────────────────────────────────────────────────────────
  process.env.CLAUDE_MODEL_LEADS = 'claude-test-model';
  const { d, calls } = deps();
  fetched.length = 0;
  const r = parse(await F.handle(ev({ search_id: 's1', count: 500, note: 'len suchá výstavba' }), d));
  delete process.env.CLAUDE_MODEL_LEADS;
  const db = d.db;
  eq([r.code, r.status], [200, 'done'], 'hľadanie skončí');

  // a) profil zadaných firiem
  const p1 = calls[0].body;
  eq(p1.model, 'claude-test-model', 'CLAUDE_MODEL_LEADS sa použije');
  ok(!('tool_choice' in p1), 'bez vynúteného nástroja');
  eq(p1.tools.map(t => t.name), ['web_search', 'report_profiles'], 'jeden web sa nedal stiahnuť → model dostane web search');
  eq(p1.tools[0].max_uses, 3, 'na dohľadanie 2 × počet nestiahnutých + 1');
  const t1 = p1.messages[0].content;
  ok(t1.includes('Trockenbau und Innenausbau in Bayern') && t1.includes('Huber Trockenbau GmbH'), 'text úvodnej stránky aj Impressum ide modelu');
  ok(/weber-bau\.de[^\n]*\n\(nedá sa stiahnuť/.test(t1), 'pri nestiahnutej firme je napísané, že ju treba dohľadať');
  ok(/len DÁTA/.test(t1) && /<stranka url=/.test(t1), 'obsah stránok je oddelený a označený ako dáta');
  ok(fetched.includes('https://www.huber-trockenbau.de/impressum'), 'Impressum sa našlo cez odkaz na úvodnej stránke');
  ok(fetched.includes('https://schmidt-ausbau.de/impressum'), 'bez odkazu sa skúsi /impressum');

  // b) hľadanie podobných
  const p2 = calls[1].body;
  eq(p2.tools.map(t => t.name), ['web_search', 'report_leads'], 'hľadanie podobných ide s web search');
  eq(p2.tools[0].max_uses, 40, 'web search má strop');
  const t2 = p2.messages[0].content;
  ok(/Nájdi na webe 50 /.test(t2), 'počet je najviac 50');
  ok(t2.includes('Región: Bayern') && t2.includes('len suchá výstavba'), 'región aj poznámka idú modelu');
  ok(t2.includes('mueller-bau.de') && t2.includes('GU Ulm GmbH') && t2.includes('odhlasena.de'), 'zoznam firiem na vylúčenie (mená, domény, odhlásené)');
  ok(t2.includes('Suchá výstavba pre bytové domy.'), 'profil zadaných firiem ide do hľadania');
  ok(!/m\.maier/.test(t2), 'do zadania sa nič z výsledkov nedostane vopred');

  // c) Impressum nájdených
  ok(fetched.includes('https://maier-innenausbau.de/impressum.html'), 'Impressum nájdenej firmy sa stiahne');
  ok(!fetched.some(u => /mueller-bau|gu-ulm|odhlasena|bezmena/.test(u)), 'weby firiem, ktoré už máme, sa ani nesťahujú');
  ok(!fetched.some(u => /169\.254/.test(u)), 'presmerovanie na metadáta cloudu sa nestiahne');

  // e) uložené
  const ins = db.inserted;
  eq(ins.map(x => x.name), ['Keller Akustik GmbH', 'Maier Innenausbau GmbH', 'Redirect Bau', 'Bauer Bau GmbH'],
    'uložia sa len nové firmy, zoradené podľa skóre (názov s právnou formou z Impressum)');
  const m = ins[1];
  eq([m.email, m.phone, m.vat_id, m.contact_person, m.address, m.postal_code, m.city, m.impressum_url],
    ['info@maier-innenausbau.de', '+49 821 44550', 'DE811222333', 'Thomas Maier', 'Lindenstraße 3', '86150', 'Augsburg',
      'https://maier-innenausbau.de/impressum.html'], 'údaje z Impressum (regex), nie od AI');
  eq([m.source, m.status, m.seed_search_id, m.score, m.website, m.country], ['urls', 'new', 's1', 94, 'https://maier-innenausbau.de', 'DE'],
    'zdroj „urls", stav Nová, z ktorého hľadania, skóre');
  eq(m.profile, { summary: 'Trockenbau.', similar_to_url: 'https://www.huber-trockenbau.de/', email_source: 'impressum', email_kind: 'generic' },
    'profil: ktorej zadanej sa podobá, e-mail z Impressum');
  const k = ins[0];
  eq([k.email, k.score, k.contact_person, k.profile.similar_to_url], [null, 100, 'Paul Keller', 'https://schmidt-ausbau.de/'],
    'e-mail od AI, ktorý na ich webe nie je, sa neuloží; skóre najviac 100');
  const b = ins.find(x => x.name === 'Bauer Bau GmbH');
  eq([b.email, b.profile.email_source], ['info@bauer-bau.de', 'ai'], 'web sa nedal stiahnuť → e-mail od AI so značkou „ai"');
  const rd = ins.find(x => x.name === 'Redirect Bau');
  eq([rd.email, rd.profile.similar_to_url], [null, null], 'e-mail cudzej domény ani nezadaná „podobná" firma sa neuložia');

  const fin = db.updates[db.updates.length - 1];
  eq([fin.status, fin.found, fin.added, fin.error], ['done', 9, 4, null], 'hľadanie: hotovo, koľko našlo a koľko pribudlo');
  eq(fin.seeds.map(s => [s.domain, s.fetched, s.trade]), [['huber-trockenbau.de', true, 'suchá výstavba'],
    ['schmidt-ausbau.de', true, 'akustické podhľady'], ['weber-bau.de', false, 'stavebná firma']], 'seeds: zadané weby a ich profil');
  ok(db.updates.some(u => u.seeds && !u.status), 'profily sa uložia hneď po prvom kroku');

  // ── Model a chyby ─────────────────────────────────────────────────────────
  {
    const pause = { stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', id: 'w1', name: 'web_search', input: { query: 'x' } }] };
    const { d: d2, calls: c2 } = deps({ models: [PROFILES, pause, LEADS] });
    await F.handle(ev({ search_id: 's1' }), d2);
    eq(c2.length, 3, 'pause_turn → pokračuje sa tým istým rozhovorom');
    eq(c2[2].body.messages.length, 2, 'a prerušená odpoveď sa pošle späť');
    eq(d2.db.search.status, 'done', 'a hľadanie dobehne');
  }
  {
    const { d: d3 } = deps({ models: [PROFILES, { stop_reason: 'refusal', content: [] }] });
    await F.handle(ev({ search_id: 's1' }), d3);
    ok(d3.db.search.status === 'error' && /odmietol/.test(d3.db.search.error), 'odmietnutie → chyba s vetou', d3.db.search.error);
  }
  {
    const { d: d4 } = deps({ models: [new Error('Your credit balance is too low')] });
    await F.handle(ev({ search_id: 's1' }), d4);
    eq([d4.db.search.status, d4.db.search.error], ['error', 'Your credit balance is too low'], 'chyba modelu sa zapíše do hľadania');
    ok(!!d4.db.search.finished_at, 'aj s časom konca');
  }
  {
    const { d: d5 } = deps({ models: [PROFILES, { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Neviem.' }] }] });
    await F.handle(ev({ search_id: 's1' }), d5);
    ok(/nevrátil/.test(d5.db.search.error || ''), 'odpoveď bez firiem → chyba', d5.db.search.error);
  }
  {
    // Čas: po druhom volaní modelu je limit takmer minutý — weby nájdených sa už nesťahujú, uloží sa to, čo je.
    let t = 0, n = 0;
    const { d: d6 } = deps({ now: () => t });
    const cm = d6.callModel;
    d6.callModel = async (b, o) => { n++; const x = await cm(b, o); if (n === 2) t = 13 * 60 * 1000 - 1000; return x; };
    fetched.length = 0;
    await F.handle(ev({ search_id: 's1' }), d6);
    eq(d6.db.search.status, 'done', 'keď dochádza čas, hľadanie aj tak skončí');
    ok(!fetched.some(u => /maier|keller/.test(u)), 'a weby nájdených sa už nesťahujú');
    const kel = d6.db.inserted.find(x => /Keller/.test(x.name));
    eq([kel.email, kel.profile.email_source], ['info@keller-akustik.de', 'ai'], 'e-mail od AI z ich domény ostane so značkou „ai" (neoverený)');
    eq(d6.db.inserted.find(x => /Maier/.test(x.name)).email, null, 'osobný e-mail od AI bez Impressum nie');
  }

  // ── Sťahovanie: SSRF a presmerovania ──────────────────────────────────────
  {
    const req = [];
    const r1 = await F.fetchPage('http://localhost/', { request: async (u) => { req.push(u); return { status: 200, body: 'x' }; } });
    ok(!r1.ok && !req.length, 'localhost sa vôbec nestiahne');
    const r2 = await F.fetchPage('https://firma.de/', { request: async (u) => { req.push(u); return { status: 301, location: 'http://192.168.0.1/admin' }; } });
    ok(!r2.ok && /súkromná/.test(r2.error) && req.length === 1, 'presmerovanie do súkromnej siete sa zastaví', r2.error);
    let hop = 0;
    const r3 = await F.fetchPage('https://a.de/', { request: async () => ({ status: 302, location: `https://a.de/${++hop}` }) });
    ok(!r3.ok && /Priveľa/.test(r3.error) && hop === 4, 'najviac 3 presmerovania', `${hop} ${r3.error}`);
    const r4 = await F.fetchPage('https://a.de/', { request: async () => ({ status: 302, location: '/impressum' }) });
    ok(!r4.ok && /Priveľa/.test(r4.error), 'presmerovanie samo na seba skončí');
    const r5 = await F.fetchPage('https://a.de/', { request: async () => ({ status: 200, type: 'application/pdf', body: '%PDF' }) });
    ok(!r5.ok && /webová stránka/.test(r5.error), 'PDF nie je stránka');
    const r6 = await F.fetchPage('https://a.de/', { request: async () => ({ status: 200, type: 'text/html; charset=utf-8', body: '<p>Hi</p>' }) });
    eq([r6.ok, r6.html], [true, '<p>Hi</p>'], 'bežná stránka prejde');
    const r7 = await F.fetchPage('https://a.de/', { request: async () => ({ status: 503 }) });
    ok(!r7.ok && /503/.test(r7.error), 'chyba servera sa povie');
    const r8 = await F.fetchPage('https://a.de/', { request: async () => ({ status: 302, location: 'ftp://a.de/x' }) });
    ok(!r8.ok, 'presmerovanie na ftp:// nie');
  }
  {
    const lookup = (ips) => (host, opts, cb) => cb(null, ips.map(a => ({ address: a, family: a.includes(':') ? 6 : 4 })));
    const run = (ips, opts = {}) => new Promise(res => F.makeSafeLookup(lookup(ips))('firma.de', opts, (e, a, f) => res({ e, a, f })));
    const x1 = await run(['10.0.0.7']);
    ok(x1.e && x1.e.code === 'EBLOCKED', 'meno, ktoré sa preloží na súkromnú IP, sa zablokuje (DNS rebinding)');
    const x2 = await run(['85.13.140.1', '127.0.0.1']);
    ok(x2.e && x2.e.code === 'EBLOCKED', 'stačí jedna súkromná IP medzi viacerými');
    const x3 = await run(['85.13.140.1']);
    eq([x3.e, x3.a, x3.f], [null, '85.13.140.1', 4], 'verejná IP prejde');
    const x4 = await run(['2a01:4f8::1'], { all: true });
    eq(x4.a, [{ address: '2a01:4f8::1', family: 6 }], 's all: true vráti zoznam');
    const x5 = await run(['::1']);
    ok(x5.e && x5.e.code === 'EBLOCKED', 'IPv6 localhost sa zablokuje');
  }

  // ── Skutočné stiahnutie (lokálny server, len requestOnce — fetchPage by
  //    127.0.0.1 správne nepustil) ───────────────────────────────────────────
  {
    const http = require('http');
    const zlib = require('zlib');
    const srv = http.createServer((req, res) => {
      if (req.url === '/gzip') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Encoding': 'gzip' }); return res.end(zlib.gzipSync('<p>Müller Straße</p>')); }
      if (req.url === '/latin') { res.writeHead(200, { 'Content-Type': 'text/html; charset=iso-8859-1' }); return res.end(Buffer.from('<p>M\xfcller Stra\xdfe</p>', 'latin1')); }
      if (req.url === '/big') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('x'.repeat(5000)); }
      if (req.url === '/slow') { return setTimeout(() => { try { res.end('neskoro'); } catch (e) { /* zavreté */ } }, 1500); }
      if (req.url === '/redir') { res.writeHead(302, { Location: '/gzip' }); return res.end(); }
      res.writeHead(404); res.end();
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${srv.address().port}`;
    const g = await F.requestOnce(`${base}/gzip`);
    eq([g.status, g.body], [200, '<p>Müller Straße</p>'], 'gzip sa rozbalí');
    const l = await F.requestOnce(`${base}/latin`);
    eq(l.body, '<p>Müller Straße</p>', 'stránka v ISO-8859-1 sa prečíta správne');
    const b = await F.requestOnce(`${base}/big`, { maxBytes: 1000 });
    eq(b.body.length, 1000, 'veľká stránka sa oreže na limit');
    const t = await F.requestOnce(`${base}/slow`, { timeoutMs: 200 });
    ok(t.status === 0 && /včas/.test(t.error), 'pomalá stránka → časový limit', JSON.stringify(t));
    const rr = await F.requestOnce(`${base}/redir`);
    eq([rr.status, rr.location], [302, '/gzip'], 'presmerovanie sa nenasleduje samo (rozhoduje fetchPage)');
    srv.close();
  }

  console.log(`\n${passed} prešlo, ${failed} padlo\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('  ✗ Error', e); process.exit(1); });
