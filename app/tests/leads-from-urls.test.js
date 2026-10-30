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
    search: { ...search }, updates: [], inserted: [], prog: [], cancelReads: 0, ex: null,
    async getSearch(id) { return id === db.search.id ? { ...db.search } : null; },
    // Priebeh (080): zápisy, „Zastaviť", príklady na učenie.
    async progress(id, patch) { db.prog.push(patch); },
    async isCancelled() { db.cancelReads++; return !!db.search.cancel_requested; },
    async examples() { return db.ex || { leads: [], partners: [], outreach: [] }; },
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

  // ── Bez kľúča Outscraperu: AI s web search, a v hľadaní je to napísané ─────
  {
    const fin2 = db.updates[db.updates.length - 1];
    eq([fin2.source, fin2.stats && fin2.stats.note, fin2.stats && fin2.stats.saved], ['ai', 'bez Outscraperu (chýba kľúč)', 4],
      'bez OUTSCRAPER_API_KEY: zdroj ai, „bez Outscraperu (chýba kľúč)", počty');
    ok(db.updates.some(u => u.seeds && u.source === 'ai' && u.stats.note), 'poznámka je v hľadaní už počas behu');
    // Priebeh pri AI s web search.
    const kroky = db.prog.map(x => x.stage).filter((x, i, a) => i === 0 || a[i - 1] !== x);
    eq(kroky, ['read_seeds', 'web', 'filter', 'impressum', 'save', 'done'], 'AI: priebeh má kroky AI (web namiesto Máp)');
    eq(db.prog[db.prog.length - 1].stage_label, 'Hotovo – uložené 4 firmy', 'AI: koniec s počtom');
    ok(db.prog[0].log[0].text === 'Začínam: 3 zadané firmy, AI na webe', 'AI: prvý riadok logu', JSON.stringify(db.prog[0].log));
  }
  // Zastaviť ešte pred prvým volaním modelu: nič sa neplatí, stav cancelled.
  {
    const dbx = mkDb({ ...SEARCH, cancel_requested: true });
    const { d: dx, calls: cx } = deps({ db: dbx });
    const r = parse(await F.handle(ev({ search_id: 's1' }), dx));
    eq([r.status, dbx.search.status, cx.length, dbx.inserted.length], ['cancelled', 'cancelled', 0, 0], 'Zastaviť hneď na začiatku: model sa nevolá, nič sa neuloží');
  }
  // Zastaviť počas volania modelu: volanie sa preruší (AbortSignal), nie je to chyba.
  {
    const dby = mkDb(SEARCH);
    let ty = 1000;
    const { d: dy } = deps({ db: dby, now: () => (ty += 10) });
    let n = 0;
    dy.setInterval = (fn) => { dy._beat = fn; return 1; };
    dy.clearInterval = () => {};
    dy.callModel = async (b, o) => {
      n++;
      if (n === 1) return PROFILES;
      dby.search.cancel_requested = true;
      ty += 10000;
      dy._beat();                                    // heartbeat zistí „Zastaviť" a preruší volanie
      await new Promise((res, rej) => { if (o.signal.aborted) rej(new Error('aborted')); o.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))); });
      return LEADS;
    };
    const r = parse(await F.handle(ev({ search_id: 's1' }), dy));
    eq([r.status, dby.search.status, dby.search.error], ['cancelled', 'cancelled', null], 'Zastaviť počas hľadania AI: volanie sa preruší, stav cancelled (nie chyba)');
  }

  // ── S kľúčom: Google Mapy cez Outscraper ──────────────────────────────────
  {
    const MAPS_SITES = {
      'https://maier-innenausbau.de/': SITES['https://maier-innenausbau.de/'],
      'https://maier-innenausbau.de/impressum.html': SITES['https://maier-innenausbau.de/impressum.html'],
      'https://keller-akustik.de/': SITES['https://keller-akustik.de/'],
      'https://keller-akustik.de/impressum': SITES['https://keller-akustik.de/impressum'],
    };
    const fp2 = async (url) => {
      url = new URL(url).href; fetched.push(url);
      if (SITES[url] && !/maier|keller/.test(url)) return { ok: true, url, html: SITES[url] };
      return MAPS_SITES[url] ? { ok: true, url, html: MAPS_SITES[url] } : { ok: false, url, error: 'Stránka vrátila chybu 404.' };
    };
    const place = (o) => ({ query: 'Trockenbau, Augsburg', country_code: 'DE', business_status: 'OPERATIONAL', state: 'Bayern', ...o });
    const PLACES = [[
      place({ name: 'Maier Innenausbau GmbH', site: 'https://maier-innenausbau.de/', place_id: 'pl-maier', google_id: 'g-maier', city: 'Augsburg',
        postal_code: '86150', street: 'Lindenstraße 3', phone: '+49 821 445500', subtypes: 'Trockenbauunternehmen, Innenausbau', rating: 4.7, reviews: 41,
        latitude: 48.37, longitude: 10.89 }),
      place({ name: 'Keller Akustik GmbH', site: 'https://keller-akustik.de', place_id: 'pl-keller', google_id: 'g-keller', city: 'München',
        postal_code: '80331', category: 'Akustikbau', rating: 4.1, reviews: 9 }),
      place({ name: 'Zatvorená GmbH', site: 'https://zatvorena-bau.de', place_id: 'pl-z', business_status: 'CLOSED_PERMANENTLY' }),
      place({ name: 'Baumarkt Süd', site: 'https://baumarkt-sued.de', place_id: 'pl-bm', category: 'Baumarkt', postal_code: '86152' }),
    ], [
      place({ query: 'Bauunternehmen, Augsburg', name: 'Müller Bau GmbH', site: 'https://mueller-bau.de', place_id: 'pl-mu', city: 'Ulm' }),
      place({ query: 'Bauunternehmen, Augsburg', name: 'Maier Innenausbau GmbH', site: 'https://maier-innenausbau.de/', place_id: 'pl-maier' }),
      place({ query: 'Bauunternehmen, Augsburg', name: 'Ohne Web Bau', site: '', place_id: 'pl-nw' }),
      place({ query: 'Bauunternehmen, Augsburg', name: 'Pauza Bau GmbH', site: 'https://pauza-bau.de', place_id: 'pl-p', business_status: 'CLOSED_TEMPORARILY',
        postal_code: '86153', city: 'Augsburg' }),
    ]];
    const QUERIES_R = tool('report_maps_queries', { categories: ['Trockenbauunternehmen', 'Bauunternehmen'], locations: ['Augsburg'],
      queries: ['Trockenbau, Augsburg', 'Bauunternehmen, Augsburg', 'Innenausbau, Augsburg'], avoid: ['Baumarkt'] });
    const SCORE_BY = { 'Maier Innenausbau GmbH': 90, 'Keller Akustik GmbH': 75, 'Baumarkt Süd': 10, 'Pauza Bau GmbH': 60 };

    const runMaps = async ({ mode, count = 10, min = 50, ex = null, hook = null }) => {
      process.env.OUTSCRAPER_API_KEY = 'test-kluc-123';
      process.env.OUTSCRAPER_MAX_RECORDS = '200';
      const os = { maps: [], requests: [], contacts: [], keys: [] };
      const mkRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
      const fetchMock = async (u, o) => {
        const url = new URL(u);
        ok(url.hostname === 'api.app.outscraper.com', `volá sa len api.app.outscraper.com (${url.pathname})`);
        os.keys.push(o.headers['X-API-KEY']);
        if (url.pathname === '/maps/search-v3') {
          os.maps.push(url);
          if (hook) hook('maps', db);
          return mode === 'async' ? mkRes(202, { id: 'req-test-async', status: 'Pending' })
            : mkRes(200, { id: 'req-test-sync', status: 'Success', data: PLACES });
        }
        if (url.pathname.startsWith('/requests/')) {
          os.requests.push(url.pathname);
          return mkRes(200, os.requests.length < 2 ? { id: 'req-test-async', status: 'Pending' } : { id: 'req-test-async', status: 'Success', data: PLACES });
        }
        if (url.pathname === '/emails-and-contacts') {
          os.contacts.push(url.searchParams.getAll('query'));
          return mkRes(200, { status: 'Success', data: [[{ query: 'keller-akustik.de', emails: [{ value: 'p.keller@keller-akustik.de' }, { value: 'info@keller-akustik.de' }, { value: 'seo@agentur.de' }],
            phones: [{ value: '+49 89 7777' }] }]] });
        }
        return mkRes(404, {});
      };
      const models = [];
      const db = mkDb({ ...SEARCH, params: { urls: SEARCH.params.urls, region: 'Augsburg', count, min_score: min } });
      db.ex = ex;
      const { d } = deps({ db, fetchPage: fp2 });
      d.callModel = async (b) => {
        models.push(b);
        const name = b.tools[b.tools.length - 1].name;
        if (hook) hook(name, db);
        if (name === 'report_profiles') return PROFILES;
        if (name === 'report_maps_queries') return QUERIES_R;
        const firms = JSON.parse(b.messages[0].content.match(/<firmy>\n([\s\S]*?)\n<\/firmy>/)[1]);
        return tool('report_scores', { scores: firms.map(f => ({ id: f.id, score: SCORE_BY[f.name] ?? 0, why: `Ako ${f.name}.`,
          similar_to_url: 'https://www.huber-trockenbau.de/', trade: 'suchá výstavba' })) });
      };
      d.fetch = fetchMock;
      d.sleep = async () => {};
      d.resolveMx = async (dom) => { if (dom === 'maier-innenausbau.de') return [{ exchange: 'mx.maier.de', priority: 10 }]; const e = new Error('x'); e.code = 'ENODATA'; throw e; };
      fetched.length = 0;
      const res = parse(await F.handle(ev({ search_id: 's1' }), d));
      delete process.env.OUTSCRAPER_API_KEY;
      delete process.env.OUTSCRAPER_MAX_RECORDS;
      return { res, db, os, models };
    };

    // Synchrónne.
    const { res: rs, db: dbs, os: oss, models: ms } = await runMaps({ mode: 'sync' });
    eq([rs.code, rs.status, rs.source], [200, 'done', 'outscraper'], 'Outscraper: hľadanie skončí');
    eq(ms.map(b => b.tools.map(t => t.name).join('+')), ['web_search+report_profiles', 'report_maps_queries', 'report_scores'],
      'Claude: profil → dotazy na Mapy → skóre jedným volaním (dotazy a skóre bez web search)');
    ok(ms[1].messages[0].content.includes('Augsburg') && ms[1].messages[0].content.includes('Suchá výstavba pre bytové domy.'),
      'dotazy sa navrhujú z profilov a z oblasti od používateľa');
    const mq = oss.maps[0];
    eq([mq.searchParams.getAll('query'), mq.searchParams.get('language'), mq.searchParams.get('region'), mq.searchParams.get('async')],
      [['Trockenbau, Augsburg', 'Bauunternehmen, Augsburg', 'Innenausbau, Augsburg'], 'de', 'DE', 'false'], 'GET /maps/search-v3: dotazy, de, DE, synchrónne');
    eq(mq.searchParams.get('limit'), '10', 'limit na dotaz = počet × 3 / počet dotazov (10 × 3 / 3)');
    ok(oss.keys.every(k => k === 'test-kluc-123'), 'kľúč ide len v hlavičke X-API-KEY');
    ok(!JSON.stringify(dbs.updates).includes('test-kluc-123') && !JSON.stringify(rs).includes('test-kluc-123'), 'kľúč nie je v hľadaní ani v odpovedi');
    ok(!fetched.some(u => /zatvorena|mueller-bau/.test(u)), 'weby zatvorených a známych firiem sa nesťahujú');
    eq(oss.contacts, [['keller-akustik.de', 'pauza-bau.de']], 'kontakty z Outscraperu len pre vybrané firmy bez e-mailu v Impressum');

    const ins = dbs.inserted;
    eq(ins.map(x => [x.name, x.score]), [['Maier Innenausbau GmbH', 90], ['Keller Akustik GmbH', 75], ['Pauza Bau GmbH', 60]],
      'uložia sa firmy nad prahom, zoradené podľa skóre');
    const m = ins[0];
    eq([m.source, m.google_place_id, m.rating, m.reviews_count, m.business_status, m.lat, m.lng, m.categories],
      ['outscraper', 'pl-maier', 4.7, 41, 'OPERATIONAL', 48.37, 10.89, ['Trockenbauunternehmen', 'Innenausbau']], 'údaje z Máp');
    eq([m.email, m.email_mx_ok, m.contact_person, m.vat_id, m.phone, m.web_ok, m.data_source.email, m.data_source.phone],
      ['info@maier-innenausbau.de', true, 'Thomas Maier', 'DE811222333', '+49 821 445500', true, 'impressum', 'maps'],
      'e-mail z Impressum s MX, konateľ a USt-IdNr z Impressum, telefón z Máp');
    ok(!!m.verified_at && m.closed_at === null && m.seed_search_id === 's1', 'verified_at, z ktorého hľadania');
    const k2 = ins[1];
    eq([k2.email, k2.email_mx_ok, k2.data_source.email, k2.profile.email_source], ['info@keller-akustik.de', false, 'outscraper_contacts', 'outscraper_contacts'],
      'e-mail z kontaktov Outscraperu (firemný z vlastnej domény), MX chýba → neoverený');
    const pz = ins[2];
    eq([pz.business_status, pz.profile.temp_closed, pz.web_ok, pz.email], ['CLOSED_TEMPORARILY', true, false, null], 'dočasne zatvorená sa označí, web nefunguje');

    const fs2 = dbs.updates[dbs.updates.length - 1];
    eq([fs2.status, fs2.source, fs2.found, fs2.added], ['done', 'outscraper', 8, 3], 'hľadanie: zdroj, koľko vrátil Outscraper, koľko uložené');
    eq(fs2.stats.dropped, { no_name: 0, closed: 1, foreign: 0, no_web: 1, duplicate: 1, known: 1, seed: 0, optout: 0, low_score: 1, over_count: 0 },
      'vyradené podľa dôvodu');
    eq([fs2.stats.returned, fs2.stats.records_estimate, fs2.stats.temp_closed, fs2.stats.saved, fs2.stats.contacts_lookups, fs2.stats.mx_missing, fs2.stats.queries.length],
      [8, 8, 1, 3, 2, 1, 3], 'počty: vrátené (= odhad spotreby), dočasne zatvorené, uložené, kontakty, bez MX, dotazy');
    eq(fs2.stats.avoid, ['Baumarkt'], 'čo AI odporúča nebrať, sa zapíše');

    // ── Priebeh (080) ──────────────────────────────────────────────────────
    {
      const pr = dbs.prog;
      ok(pr.length > 5 && pr[0].started_at && pr[0].progress === 0, 'priebeh: prvý zápis má started_at a 0 %', JSON.stringify(pr[0]));
      ok(pr.every(x => x.heartbeat_at), 'každý zápis má heartbeat_at');
      const kroky = pr.map(x => x.stage).filter((x, i, a) => i === 0 || a[i - 1] !== x);
      eq(kroky, ['read_seeds', 'plan', 'maps', 'filter', 'impressum', 'score', 'contacts', 'save', 'done'], 'kroky idú v poradí, žiadny sa nevynechá');
      ok(pr.every((x, i) => i === 0 || x.progress >= pr[i - 1].progress), 'percentá nikdy neklesnú', pr.map(x => x.progress).join(','));
      const fin = pr[pr.length - 1];
      eq([fin.progress, fin.stage, fin.stage_label], [100, 'done', 'Hotovo – uložené 3 firmy'], 'koniec: 100 % a koľko sa uložilo');
      const texty = fin.log.map(x => x.text);
      ok(texty.includes('Dotaz 1 z 3 – Trockenbau, Augsburg: 4 firmy') && texty.includes('Dotaz 2 z 3 – Bauunternehmen, Augsburg: 4 firmy'),
        'log: koľko firiem vrátil každý dotaz', texty.join(' | '));
      ok(texty.some(t => /^Vyradené: 1 zatvorená, 1 už máme, 1 bez webu, 1 duplicita – ostáva 4 firmy$/.test(t)), 'log: čo sa vyradilo a prečo', texty.join(' | '));
      ok(texty.includes('AI hodnotí podobnosť (dávka 1 z 1)') && texty.some(t => /^Impressum sa našlo pri 2 z 4 webov, e-mail pri 1$/.test(t)), 'log: Impressum a skóre po dávkach', texty.join(' | '));
      ok(fin.log.length <= 50 && fin.log.every(x => x.at && x.text), 'log má najviac 50 udalostí, každá s časom');
      ok(pr.length < 40, `zápisy sú obmedzené (${pr.length} zápisov)`);
      ok(dbs.cancelReads > 0, 'hľadanie sa pýta, či ho niekto nezastavil');
      const st = fs2.stats;
      eq(st.learning, { positive: 0, negative: 0 }, 'bez hodnotení: 0 príkladov');
      ok(Array.isArray(st.insights) && st.insights.length >= 2 && /Vyradených bolo/.test(st.insights.join(' ')), '„Čo AI zistila" je v stats.insights', JSON.stringify(st.insights));
    }

    // Asynchrónne (a prah 70).
    const { res: ra, db: dba, os: osa } = await runMaps({ mode: 'async', min: 70 });
    eq([ra.status, osa.requests.length, osa.requests[0]], ['done', 2, '/requests/req-test-async'], 'asynchrónne: čaká sa cez /requests/<id>');
    eq(dba.inserted.map(x => x.name), ['Maier Innenausbau GmbH', 'Keller Akustik GmbH'], 'prah 70 nechá len dve');
    const fa = dba.updates[dba.updates.length - 1];
    eq([fa.stats.async, fa.stats.polls, fa.stats.dropped.low_score], [true, 2, 2], 'v hľadaní: async, počet čakaní, nízke skóre');

    // Učenie: príklady z hodnotení idú do plánovania dotazov aj do skóre.
    {
      const ex = { leads: [
        { id: 'g1', name: 'Dobrá Bau GmbH', website: 'https://dobra-bau.de', city: 'Augsburg', categories: ['Trockenbauunternehmen'], relevance: 1, relevance_at: '2026-10-20T08:00:00Z' },
        { id: 'z1', name: 'Baustoff Zlý KG', website: 'https://zly.de', categories: ['Baustoffhandel'], relevance: -1, relevance_note: 'dodávateľ materiálu', relevance_at: '2026-10-21T08:00:00Z' },
        { id: 'o1', name: 'Odpísala GmbH', website: 'https://odpisala.de', status: 'contacted' }],
        partners: [{ name: 'GU Ulm GmbH', city: 'Ulm', website: 'https://gu-ulm.de' }], outreach: [{ lead_id: 'o1', replied_at: '2026-10-22T08:00:00Z' }] };
      const { db: dbe, models: me } = await runMaps({ mode: 'sync', ex });
      const q = me[1].messages[0].content, sc = me[2].messages[0].content;
      ok(/DOBRÉ \(\+\)/.test(q) && q.includes('Dobrá Bau GmbH') && q.includes('Odpísala GmbH') && q.includes('GU Ulm GmbH') && q.includes('palec dole: dodávateľ materiálu'),
        'plánovanie dotazov dostane dobré aj zlé príklady (palec, odpoveď, odberateľ)');
      ok(/vyššie skóre/.test(sc) && sc.includes('Baustoff Zlý KG'), 'aj skóre: „podobné ako dobré +, ako zlé −"');
      ok(!/DOBRÉ/.test(me[0].messages[0].content), 'profil zadaných firiem príklady nepotrebuje');
      const fe = dbe.updates[dbe.updates.length - 1];
      eq(fe.stats.learning, { positive: 3, negative: 1 }, 'v stats je, koľko príkladov sa použilo');
      ok(/použila 3 dobré príklady a 1 zlý/.test(fe.stats.insights.join(' ')), '„Čo AI zistila" to povie', fe.stats.insights.join(' '));
      ok(dbe.prog.some(x => x.log.some(l => /Príklady z Vašich hodnotení: 3 dobré, 1 zlý/.test(l.text))), 'aj v logu priebehu');
    }

    // Zastaviť: po Google Mapách — nič sa neohodnotí ani neuloží, stav „cancelled".
    {
      const { res: rc, db: dbc, models: mc } = await runMaps({ mode: 'sync', hook: (name, db) => { if (name === 'maps') db.search.cancel_requested = true; } });
      eq([rc.status, dbc.search.status, dbc.search.found, dbc.search.added], ['cancelled', 'cancelled', 8, 0], 'Zastaviť po Mapách: stav cancelled, našlo 8, uložené 0');
      ok(!mc.some(b => b.tools.some(t => t.name === 'report_scores')), 'AI už nehodnotí (nič sa neplatí navyše)');
      eq(dbc.inserted.length, 0, 'nič sa neuloží');
      ok(!fetched.some(u => /maier-innenausbau\.de\/impressum/.test(u)), 'Impressum sa už nesťahuje');
      const lp = dbc.prog[dbc.prog.length - 1];
      eq([lp.stage, lp.stage_label], ['cancelled', 'Zastavené – uložených 0 firiem'], 'priebeh: „Zastavené – uložených 0 firiem"');
      ok(lp.progress < 60 && !!dbc.search.finished_at && dbc.search.stats.cancelled === true, 'percentá ostanú, kde sa zastavilo; čas konca; stats.cancelled');
    }
    // Zastaviť počas skóre: ohodnotené firmy sa uložia, kontakty z Outscraperu sa už nedopytujú.
    {
      fetched.length = 0;
      const { res: rc2, db: dbc2, os: osc2 } = await runMaps({ mode: 'sync', hook: (name, db) => { if (name === 'report_scores') db.search.cancel_requested = true; } });
      eq([rc2.status, rc2.added, dbc2.search.status], ['cancelled', 3, 'cancelled'], 'Zastaviť počas skóre: ohodnotené firmy nad prahom sa uložia');
      eq(dbc2.inserted.map(x => x.name), ['Maier Innenausbau GmbH', 'Keller Akustik GmbH', 'Pauza Bau GmbH'], 'tie isté firmy ako bez zastavenia');
      eq(osc2.contacts.length, 0, 'kontakty z Outscraperu (platené) sa už nedopytujú');
      eq(dbc2.prog[dbc2.prog.length - 1].stage_label, 'Zastavené – uložené 3 firmy', '„Zastavené – uložené 3 firmy"');
    }

    // Chyba Outscraperu (bez kreditu).
    {
      process.env.OUTSCRAPER_API_KEY = 'k';
      const db3 = mkDb(SEARCH);
      const { d } = deps({ db: db3, models: [PROFILES, QUERIES_R] });
      d.fetch = async () => ({ ok: false, status: 402, json: async () => ({ errorMessage: 'Payment required' }) });
      await F.handle(ev({ search_id: 's1' }), d);
      delete process.env.OUTSCRAPER_API_KEY;
      ok(db3.search.status === 'error' && /kredit/.test(db3.search.error), 'bez kreditu → chyba hľadania s vetou', db3.search.error);
    }
  }

  // ── Databáza bez migrácie 079 ─────────────────────────────────────────────
  {
    const calls = [];
    const fake = { from: (t) => ({
      update: (patch) => ({ eq: async () => { calls.push(['update', Object.keys(patch).sort().join(',')]);
        return { error: 'stats' in patch ? { code: 'PGRST204', message: "Could not find the 'stats' column" } : null }; } }),
      insert: async (row) => { calls.push(['insert', row.source]);
        return { error: row.source === 'outscraper' ? { code: '23514', message: 'violates check constraint "danubra_leads_source_check"' } : null }; },
    }) };
    const sdb = F.supabaseDb(() => fake);
    await sdb.updateSearch('s1', { status: 'done', stats: {}, source: 'outscraper' });
    eq(calls.slice(0, 2), [['update', 'source,stats,status'], ['update', 'status']], 'bez 079 sa stav hľadania zapíše aj tak (bez source a stats)');
    const r2 = await sdb.insertLead({ name: 'X', source: 'outscraper', google_place_id: 'p', profile: {} });
    eq([r2.error, calls[3]], [null, ['insert', 'urls']], 'a firma z Máp sa uloží ako „podľa webov"');
  }
  // ── Databáza bez migrácie 080 ─────────────────────────────────────────────
  {
    const calls = [];
    const fake = { from: () => ({
      update: (patch) => ({ eq: async () => { calls.push(Object.keys(patch).sort().join(',') + (patch.status ? `=${patch.status}` : ''));
        if ('progress' in patch || 'heartbeat_at' in patch) return { error: { code: '42703', message: 'column "progress" does not exist' } };
        if (patch.status === 'cancelled') return { error: { code: '23514', message: 'violates check constraint "danubra_lead_searches_status_check"' } };
        return { error: null }; } }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: '42703', message: 'column cancel_requested does not exist' } }) }) }),
    }) };
    const sdb = F.supabaseDb(() => fake);
    await sdb.progress('s1', { progress: 5, heartbeat_at: 'x' });
    await sdb.progress('s1', { progress: 9, heartbeat_at: 'y' });
    eq(calls.length, 1, 'bez 080: priebeh sa po prvej chybe už nezapisuje (hľadanie beží ďalej)');
    eq(await sdb.isCancelled('s1'), false, 'a „Zastaviť" sa nečíta');
    calls.length = 0;
    await sdb.updateSearch('s1', { status: 'cancelled', added: 0 });
    eq(calls, ['added,status=cancelled', 'added,error,status=error'], 'stav „cancelled" bez 080 → chyba „Hľadanie ste zastavili."');
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
