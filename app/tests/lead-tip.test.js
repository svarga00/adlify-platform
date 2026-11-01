// ============================================================================
// DANUBRA — Odkazy od kolegov: verejný príjem a údaje z webu (bez siete)
// Spustenie:  node app/tests/lead-tip.test.js
// ============================================================================
// danubra-lead-tip je verejná adresa bez prihlásenia. Stráži sa:
//   * zlý aj vypnutý kľúč = tá istá veta, nič sa neuloží; len POST, len z nás,
//   * pasca na roboty, limit 30 firiem za hodinu z jednej siete (odtlačok,
//     nikdy samotná IP), najviac 20 firiem naraz, chyby pri poliach,
//   * odkazy: web (aj holá doména), Mapy, profil; bez sledovacích parametrov,
//   * „už ju máme" proti novým firmám, odberateľom aj skorším odkazom
//     (doména aj meno) — duplicita sa uloží s odkazom na to, čo máme,
//   * funkcia na pozadí sa spustí len s podpisom servera alebo s prihlásením
//     a stiahne len skutočné weby (nie profily), Impressum → meta.
// ============================================================================
const path = require('path');

process.env.IP_HASH_SECRET = 'test-ip-secret';
const FN = path.join(__dirname, '..', '..', 'netlify', 'functions');
const Tip = require(path.join(FN, 'danubra-lead-tip.js'));
const Enrich = require(path.join(FN, 'danubra-lead-tips-enrich-background.js'));

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}

const TOKEN = 'a1b2c3d4'.repeat(6);
const IP = '203.0.113.7';
function mkDb({ enabled = true, token = TOKEN, leads = [], partners = [], tips = [] } = {}) {
  const db = {
    tips: tips.map(t => ({ ...t })), inserts: [], counts: [],
    async settings() { return { id: 's1', marketing: { tips: { token, enabled } } }; },
    async countIp(hash, since) { db.counts.push(hash); return db.tips.filter(t => t.ip_hash === hash && t.created_at >= since).length; },
    async known() { return { leads, partners, tips: db.tips.filter(t => !t.archived_at) }; },
    async insertTips(rows) {
      const saved = rows.map((r, i) => ({ ...r, id: `00000000-0000-4000-8000-${String(db.tips.length + i + 1).padStart(12, '0')}` }));
      db.tips.push(...saved); db.inserts.push(...saved);
      return saved;
    },
  };
  return db;
}
const NOW = Date.parse('2026-10-31T10:00:00Z');
async function call(db, body, { method = 'POST', origin = 'https://adlify-app.netlify.app', ip = IP, raw = null, trig = [] } = {}) {
  const r = await Tip.handle({ httpMethod: method, headers: { origin, host: 'adlify-app.netlify.app', 'x-nf-client-connection-ip': ip },
    body: raw != null ? raw : JSON.stringify(body) }, { db, now: () => NOW, trigger: async (ids) => { trig.push(ids); return true; }, warn: () => {} });
  let j = {};
  try { j = JSON.parse(r.body || '{}'); } catch (e) { j = {}; }
  return { code: r.statusCode, headers: r.headers || {}, ...j };
}
const firm = (company, link, extra = {}) => ({ company, link, ...extra });

(async () => {
  console.log('Prístup');
  {
    const db = mkDb();
    let r = await call(db, { t: 'x'.repeat(48), name: 'Jano', firms: [firm('A GmbH')] });
    const zly = r.error;
    ok(r.code === 403 && !db.inserts.length, 'zlý kľúč → 403, nič sa neuloží');
    r = await call(mkDb({ enabled: false }), { t: TOKEN, name: 'Jano', firms: [firm('A GmbH')] });
    ok(r.code === 403 && r.error === zly, 'vypnutý zber → tá istá veta (neprezradí, že kľúč je správny)', r.error);
    r = await call(mkDb({ token: null }), { t: TOKEN, name: 'Jano', firms: [firm('A GmbH')] });
    ok(r.code === 403, 'bez nastaveného kľúča nič');
    r = await call(db, { t: 'kratky', name: 'Jano', firms: [firm('A GmbH')] });
    ok(r.code === 403, 'kľúč v zlom tvare');
    ok((await call(db, { t: TOKEN, check: true })).code === 200 && (await call(db, { t: 'z'.repeat(48), check: true })).code === 403, 'stránka si overí kľúč pri otvorení');
    ok((await call(db, {}, { method: 'GET' })).code === 405, 'len POST');
    ok((await call(db, { t: TOKEN, name: 'Jano', firms: [firm('A GmbH')] }, { origin: 'https://evil.example' })).code === 403, 'z cudzej stránky nie');
    ok((await call(db, null, { raw: 'x'.repeat(31000) })).code === 413, 'priveľké telo');
    ok((await call(db, null, { raw: '{zle' })).code === 400, 'zlý JSON');
    const h = (await call(db, { t: TOKEN, check: true })).headers;
    ok(!h['Access-Control-Allow-Origin'] && /no-store/.test(h['Cache-Control']), 'žiadne CORS pre cudzie weby, bez cache');
    ok(!db.inserts.length, 'a nič sa pri tom neuložilo');
  }

  console.log('\nPasca a limit');
  {
    const db = mkDb();
    const r = await call(db, { t: TOKEN, name: 'Robot', website: 'http://spam', firms: [firm('Spam GmbH', 'spam.de')] });
    ok(r.code === 200 && r.ok && !db.inserts.length, 'robot (vyplnená pasca) dostane ok, nič sa neuloží');
    const many = Array.from({ length: 20 }, (_, i) => firm(`Firma ${i} GmbH`, `firma${i}.de`));
    ok((await call(db, { t: TOKEN, name: 'Jano', firms: many })).code === 200, '20 firiem naraz prejde');
    const r2 = await call(db, { t: TOKEN, name: 'Jano', firms: many.slice(0, 11).map((f, i) => firm(`Iná ${i} GmbH`, `ina${i}.de`)) });
    ok(r2.code === 429 && db.inserts.length === 20, 'nad 30 firiem za hodinu z jednej siete → 429', JSON.stringify(r2));
    const r3 = await call(db, { t: TOKEN, name: 'Zuzka', firms: [firm('Z GmbH')] }, { ip: '198.51.100.9' });
    ok(r3.code === 200, 'iná sieť môže ďalej');
    ok(db.inserts.every(t => /^[a-f0-9]{32}$/.test(t.ip_hash) && !JSON.stringify(t).includes(IP) && !JSON.stringify(t).includes('198.51.100.9')),
      'uloží sa len odtlačok IP, nikdy samotná adresa');
    ok(Tip.ipHash(IP, 'a') !== Tip.ipHash(IP, 'b') && Tip.ipHash(IP, null) === null, 'odtlačok je s tajným kľúčom; bez kľúča nič');
    const r4 = await call(db, { t: TOKEN, name: 'Jano', firms: Array.from({ length: 21 }, (_, i) => firm(`F${i} GmbH`)) }, { ip: '192.0.2.1' });
    ok(r4.code === 400 && /najviac 20/.test(r4.error), 'najviac 20 firiem naraz', r4.error);
  }

  console.log('\nPolia a odkazy');
  {
    const db = mkDb();
    let r = await call(db, { t: TOKEN, name: '', firms: [firm('A GmbH')] });
    ok(r.code === 400 && r.field === 'name', 'meno kolegu je povinné');
    r = await call(db, { t: TOKEN, name: 'Jano', firms: [firm('A GmbH', 'localhost'), firm('', 'b.de')] });
    ok(r.code === 400 && JSON.stringify(r.errors.map(e => [e.i, e.field])) === '[[0,"link"],[1,"company"]]' && !db.inserts.length,
      'neplatný odkaz a chýbajúci názov — chyby pri poliach, nič sa neuloží', JSON.stringify(r.errors));
    const trig = [];
    r = await call(db, { t: TOKEN, name: '  Jano  ', firms: [
      firm('Müller Bau GmbH', 'www.mueller-bau.de/?utm_source=wa&fbclid=1', { city: 'Ulm', relation: 'past_partner', what: 'Trockenbau 2024', contact: 'Hr. Müller', unsure: true }),
      firm('Huber Ausbau', 'https://www.google.com/maps/place/Huber+Ausbau/@48.1,11.5,17z?entry=ttu', { relation: 'via_denis' }),
      firm('Schmidt GmbH', 'linkedin.com/company/schmidt'),
      firm('Len meno KG', '', { city: 'Augsburg' }),
      firm('Müller Bau', '', { city: 'Ulm' }),
    ] }, { trig });
    ok(r.code === 200 && r.added === 4, 'uložené 4 firmy (piata sa opakuje)', JSON.stringify(r));
    const [a, b, c, d] = db.inserts;
    ok(a.url === 'https://www.mueller-bau.de' && a.website === 'https://www.mueller-bau.de' && a.domain === 'mueller-bau.de' && a.kind === 'web',
      'holá doména → https web bez sledovania', JSON.stringify(a));
    ok(a.relation === 'past_partner' && a.what_we_did === 'Trockenbau 2024' && a.contact === 'Hr. Müller' && a.unsure === true && a.submitted_by_name === 'Jano' && a.city === 'Ulm',
      'vzťah, čo sme robili, kontakt, istota, kto poslal');
    ok(b.kind === 'maps' && !b.website && b.meta && b.meta.lat === 48.1 && !/entry=/.test(b.url), 'Mapy: bez webu, poloha z adresy', JSON.stringify(b));
    ok(c.kind === 'profile' && !c.website && c.profile_url === 'https://linkedin.com/company/schmidt', 'profil nie je web');
    ok(d.kind === 'none' && !d.url, 'firma len s menom');
    ok(r.results.find(x => x.i === 4).status === 'repeated', 'opakovaná firma sa vráti ako „dvakrát"');
    ok(JSON.stringify(trig) === JSON.stringify([[a.id]]), 'na pozadí sa sťahuje len skutočný web (nie Mapy ani profil)', JSON.stringify(trig));
    ok(new Set(db.inserts.map(t => t.batch_id)).size === 1, 'jedno odoslanie = jedna dávka');
    ok(r.mine.tips === 4 && r.rank === 1 && r.team === 1, 'kolega vidí, koľko poslal, a poradie v tíme', JSON.stringify([r.mine, r.rank]));
  }

  console.log('\nUž ju máme');
  {
    const db = mkDb({ leads: [{ id: 'L1', name: 'Maier Innenausbau GmbH', city: 'Augsburg', website: 'https://www.maier-ausbau.de' }],
      partners: [{ id: 'P1', name: 'GU Ulm GmbH', city: 'Ulm', website: 'gu-ulm.de', email: 'info@gu-ulm.de' }],
      tips: [{ id: 'T0', company_name: 'Keller Akustik', domain: 'keller.de', submitted_by_name: 'Zuzka', status: 'new', created_at: '2026-10-30T10:00:00Z' }] });
    const r = await call(db, { t: TOKEN, name: 'Michal', firms: [
      firm('Maier', 'maier-ausbau.de/referenzen'), firm('GU Ulm', '', { city: 'Ulm' }), firm('Keller Akustik GmbH', 'keller.de'), firm('Nová Firma GmbH', 'nova-firma.de'),
    ] });
    const st = r.results.map(x => [x.status, x.why]);
    ok(JSON.stringify(st) === JSON.stringify([['duplicate', 'už je medzi novými firmami'], ['duplicate', 'už je náš odberateľ'], ['duplicate', 'už ju poslal kolega'], ['added', null]]),
      'doména novej firmy, meno odberateľa, skorší odkaz kolegu; nová firma pridaná', JSON.stringify(st));
    const [a, b, c] = db.inserts;
    ok(a.status === 'duplicate' && a.duplicate_of_lead_id === 'L1' && b.duplicate_of_partner_id === 'P1' && c.duplicate_of_tip_id === 'T0',
      'duplicita sa uloží (kolega má kredit) s odkazom na to, čo máme');
    ok(r.added === 1 && r.duplicates === 3, 'počty pre úspešnú obrazovku');
  }

  console.log('\nÚdaje z webu (na pozadí)');
  {
    const tips = [
      { id: '00000000-0000-4000-8000-000000000001', company_name: 'Müller Bau', city: 'Ulm', kind: 'web', website: 'https://mueller-bau.de', domain: 'mueller-bau.de', status: 'new', created_at: '2026-10-31T10:00:00Z' },
      { id: '00000000-0000-4000-8000-000000000002', company_name: 'Schmidt', kind: 'profile', url: 'https://linkedin.com/company/s', status: 'new', created_at: '2026-10-31T10:00:00Z' },
      { id: '00000000-0000-4000-8000-000000000003', company_name: 'Huber Bau', kind: 'web', website: 'https://huber-neu.de', domain: 'huber-neu.de', status: 'new', created_at: '2026-10-31T10:00:00Z' },
    ];
    const PAGES = {
      'https://mueller-bau.de': { ok: true, url: 'https://mueller-bau.de/', headers: {}, html: '<head><title>Startseite | Müller Bau GmbH</title><link rel="apple-touch-icon" href="/a.png"><meta name="description" content="Trockenbau in Ulm"></head><body><a href="/impressum">Impressum</a></body>' },
      'https://mueller-bau.de/impressum': { ok: true, url: 'https://mueller-bau.de/impressum', html: '<body><h1>Impressum</h1><p>Müller Bau GmbH<br>Hauptstraße 5<br>89073 Ulm</p><p>Telefon: 0731 123456<br>E-Mail: info@mueller-bau.de</p><p>Geschäftsführer: Hans Müller</p><p>Registergericht: Amtsgericht Ulm HRB 1234</p><p>USt-IdNr.: DE123456789</p></body>' },
      'https://huber-neu.de': { ok: true, url: 'https://huber-neu.de/', headers: {}, html: '<head><title>Huber</title></head><body><a href="/impressum">Impressum</a></body>' },
      'https://huber-neu.de/impressum': { ok: true, url: 'https://huber-neu.de/impressum', html: '<body>Impressum Huber Bau GmbH, Bahnhofstr. 1, 80331 München, E-Mail: info@huber-bau.de, Geschäftsführer: Max Huber</body>' },
    };
    const fetched = [];
    const updates = [];
    const db = {
      async byIds(ids) { return tips.filter(t => ids.includes(t.id)); },
      async pending() { return tips.filter(t => t.website && !t.checked_at); },
      async known() { return { leads: [{ id: 'L9', name: 'Huber Bau GmbH', city: 'München', email: 'info@huber-bau.de' }], partners: [], tips }; },
      async update(id, patch) { updates.push({ id, patch }); return { error: null }; },
      client() { return null; },
    };
    const deps = (guardOk) => ({ db, now: () => NOW, env: { IP_HASH_SECRET: 'test-ip-secret' },
      fetchPage: async (u) => { fetched.push(u); return PAGES[String(u).replace(/\/$/, '')] || { ok: false, url: u, error: '404' }; },
      guard: async () => (guardOk ? { ok: true } : { ok: false, status: 401, error: 'Neprihlásený používateľ.' }) });
    const ids = tips.map(t => t.id);
    let r = await Enrich.handle({ body: JSON.stringify({ tip_ids: ids, sig: 'f'.repeat(64) }) }, deps(false));
    ok(r.statusCode === 401 && !fetched.length, 'bez podpisu servera a bez prihlásenia nič');
    r = await Enrich.handle({ body: JSON.stringify({ tip_ids: ids, sig: Tip.sign(ids, 'test-ip-secret') }) }, deps(false));
    const s = JSON.parse(r.body);
    ok(r.statusCode === 200 && s.checked === 2 && s.skipped === 1, 's podpisom servera prejde; profil sa nesťahuje', r.body);
    ok(!fetched.some(u => /linkedin/.test(u)), 'LinkedIn sa nestiahol');
    const m = (updates.find(u => u.id === ids[0]) || {}).patch || {};
    const meta = m.meta || {};
    ok(meta.checked && meta.email === 'info@mueller-bau.de' && meta.company === 'Müller Bau GmbH' && meta.city === 'Ulm' && meta.konatel === 'Hans Müller'
      && meta.vat_id === 'DE123456789' && /731 123456/.test(meta.phone || '') && meta.logo === 'https://mueller-bau.de/a.png' && m.checked_at,
    'z webu a Impressum: meno, e-mail, telefón, mesto, konateľ, USt-IdNr, logo', JSON.stringify(m));
    const h = (updates.find(u => u.id === ids[2]) || {}).patch || {};
    ok(h.status === 'duplicate' && h.duplicate_of_lead_id === 'L9', 'podľa Impressum (meno, doména e-mailu) sa ukáže, že firmu už máme', JSON.stringify(h));
    updates.length = 0; fetched.length = 0;
    r = await Enrich.handle({ body: JSON.stringify({ tip_ids: [ids[0]] }) }, deps(true));
    ok(r.statusCode === 200 && fetched.length >= 1, 'prihlásený člen s Marketingom (appka, „Uložiť web")');
    ok(Tip.signOk(ids, Tip.sign(ids, 'k'), 'k') && !Tip.signOk(ids.slice(1), Tip.sign(ids, 'k'), 'k'), 'podpis platí len pre tie isté odkazy');
  }

  console.log(`\n${passed} prešlo, ${failed} padlo\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`  ✗ test spadol: ${e.stack}`); process.exit(1); });
