// ============================================================================
// DANUBRA — väčšie hľadanie a export nájdených kontaktov v prehliadači (088)
// Spustenie:  node app/tests/hladanie-viac.test.js
// ============================================================================
// „Potrebujem tie kontakty vedieť exportovať a hľadať naraz viac ako 50."
//
// V skutočnom prehliadači (playwright-core), bez siete: databáza a server sú
// podstrčené. Overuje sa okno hľadania (počty 10–300, odhad záznamov,
// kontaktov, ceny a času, otázka pred veľkým hľadaním, bez Google Máp
// najviac 50), pás priebehu po kolách („Kolo 2 z ~4", Pokračovať), pás
// s výsledkom (Exportovať nájdené, Kopírovať e-maily), História hľadaní
// a hlavný Export s filtrom Hľadanie.
// Bez playwright-core sa test preskočí.
// ============================================================================
const fs = require('fs');
const path = require('path');
const http = require('http');

const REPO = path.join(__dirname, '..', '..');
let chromium;
try { chromium = require('playwright-core').chromium; } catch {
  console.log('Prehliadačový test preskočený — playwright-core nie je nainštalovaný.');
  console.log('\n0 prešlo, 0 padlo (preskočené)');
  process.exit(0);
}
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(base)) return null;
  for (const dir of fs.readdirSync(base)) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const p = path.join(base, dir, rel);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}
const exe = findChromium();
if (!exe) { console.log('Prehliadačový test preskočený — Chromium sa nenašlo.'); console.log('\n0 prešlo, 0 padlo (preskočené)'); process.exit(0); }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}

const NOW = Date.now();
const ago = (min) => new Date(NOW - min * 60e3).toISOString();
const L = (o) => ({ status: 'new', source: 'outscraper', country: 'DE', created_at: ago(30), business_status: 'OPERATIONAL', ...o });
const DONE = { id: 's1', kind: 'urls', status: 'done', source: 'outscraper', created_at: ago(40), started_at: ago(40), finished_at: ago(5), heartbeat_at: ago(5),
  found: 610, added: 3, progress: 100, stage: 'done', params: { urls: ['https://gu-ulm.de', 'https://bau-pasing.de', 'https://maier-innenausbau.de'], region: 'München', count: 200 },
  seeds: [{ domain: 'gu-ulm.de' }, { domain: 'bau-pasing.de' }, { domain: 'maier-innenausbau.de' }],
  stats: { source: 'outscraper', records_estimate: 610, multi: true, round: 3, rounds: 3, rounds_final: true, dropped: { known: 4, low_score: 9 } } };
const OLD = { id: 's0', kind: 'urls', status: 'done', source: 'outscraper', created_at: ago(5000), finished_at: ago(4990), found: 40, added: 1,
  params: { urls: ['https://alt.de', 'https://alt2.de', 'https://alt3.de'], count: 20 }, seeds: [{ domain: 'alt.de' }, { domain: 'alt2.de' }, { domain: 'alt3.de' }], stats: {} };
const DATA = {
  leads: [
    L({ id: 'l1', name: 'Maier Innenausbau GmbH', city: 'Augsburg', postal_code: '86150', address: 'Lindenstraße 3', website: 'https://maier-innenausbau.de',
      email: 'info@maier-innenausbau.de', phone: '+49 821 445500', contact_person: 'Thomas Maier', vat_id: 'DE811222333', rating: 4.7, reviews_count: 41, score: 92,
      relevance: 1, seed_search_id: 's1', categories: ['Trockenbauunternehmen'], profile: { email_source: 'impressum' }, data_source: { maps_url: 'https://www.google.com/maps/place/Maier' } }),
    L({ id: 'l2', name: 'Keller Akustik GmbH', city: 'München', postal_code: '80331', email: 'info@keller-akustik.de', score: 77, seed_search_id: 's1',
      categories: ['Akustikbau'], profile: { email_source: 'outscraper_contacts' }, status: 'contacted' }),
    L({ id: 'l3', name: 'Bez e-mailu Bau', city: 'Dachau', score: 60, seed_search_id: 's1', categories: ['Bauunternehmen'] }),
    L({ id: 'l4', name: 'Staré hľadanie GmbH', city: 'Ulm', email: 'info@stare.de', score: 70, seed_search_id: 's0' }),
    L({ id: 'l5', name: 'Ručne pridaná', city: 'Passau', email: 'info@rucne.de', source: 'manual', score: null }),
  ],
  lead_searches: [DONE, OLD],
  partners: [], subcontracts: [], outreach: [], outreach_events: [], email_optout: [], message_templates: [], lead_contacts: [], members: [], mailboxes: [], trades: [],
  settings: [{ id: 'set1', supplier: { name: 'Partner und Service s. r. o.' }, marketing: {} }],
};

(async () => {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/') rel = '/app/index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(REPO, rel);
    if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(''); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const chyby = [];
  page.on('pageerror', e => chyby.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto(`http://127.0.0.1:${port}/app/`, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  await page.evaluate(async (DATA) => {
    try { localStorage.clear(); } catch (e) { /* nič */ }
    window.__csv = null; window.__csvName = null; window.__ins = []; window.__calls = []; window.__clip = null; window.__os = { outscraper: true, outscraper_max: 1000 };
    window.DATA_ = DATA;
    DB.list = async (t) => ({ data: (window.DATA_[t] || []).map(x => ({ ...x })), error: null });
    DB.count = async () => 0;
    DB.update = async () => ({ data: null, error: null });
    DB.insert = async (t, row) => { window.__ins.push({ t, row }); return { data: { id: `n${window.__ins.length}`, ...row }, error: null }; };
    DB.client = { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-088' } } }) } };
    const pf = window.fetch;
    window.fetch = async (u, o) => {
      const url = String(u);
      if (url.includes('danubra-email-status')) return new Response(JSON.stringify(window.__os));
      if (url.includes('danubra-leads-suggest')) return new Response(JSON.stringify({ source: 'rules', suggestions: [] }));
      if (url.includes('/.netlify/functions/')) { window.__calls.push({ url, auth: o && o.headers && o.headers.Authorization, body: o && o.body }); return new Response('{}', { status: 202 }); }
      return pf(u, o);
    };
    try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__clip = t; } }, configurable: true }); } catch (e) { /* nič */ }
    DanubraExport.download = (rows, name) => { window.__csv = rows; window.__csvName = name; return 'x.csv'; };
    Danubra.user = { id: 'u-1', email: 'test@punds.eu' };
    Danubra.me = { role: 'admin', active: true }; Danubra.members = [{ role: 'admin', active: true }];
    Danubra.cfgRow = DATA.settings[0];
    document.getElementById('login-screen').hidden = true; document.getElementById('app').hidden = false;
    Danubra._buildNav();
    Danubra.route = 'leads'; Lead.loaded = false;
    await Danubra.views.leads.call(Danubra, document.getElementById('view'));
  }, DATA);
  await page.waitForTimeout(300);

  console.log('Pás s výsledkom hľadania: export');
  const band = await page.evaluate(() => (document.querySelector('.ls-note') || {}).textContent || '');
  ok(/našlo 610 firiem, uložených 3/.test(band) && /Exportovať nájdené \(Excel\)/.test(band) && /Kopírovať e-maily/.test(band), 'pás po hľadaní: Ukázať nájdené, Exportovať nájdené (Excel), Kopírovať e-maily', band.replace(/\s+/g, ' ').slice(0, 300));
  await page.click('.ls-note [data-ls-exp="s1"]');
  await page.waitForTimeout(100);
  const csv = await page.evaluate(() => ({ rows: window.__csv, name: window.__csvName }));
  const H = csv.rows && csv.rows[0];
  ok(H && H.join('|') === 'Firma|Remeslo|Remeslo (DE)|Mesto|PSČ|Adresa|Web|E-mail|Zdroj e-mailu|Telefón|Konateľ / kontaktná osoba|USt-IdNr|Google hodnotenie|Počet recenzií|Stav na Google|Skóre|Vhodná (palec)|Kategória|Oslovenie|Ďalší krok|Zdroj|Hľadanie|Google Mapy',
    'export nájdených: stĺpce s kontaktmi', H && H.join('|'));
  ok(csv.rows && csv.rows.slice(1).map(r => r[0]).join('|') === 'Maier Innenausbau GmbH|Keller Akustik GmbH|Bez e-mailu Bau', 'len firmy tohto hľadania, podľa skóre', csv.rows && csv.rows.slice(1).map(r => r[0]).join('|'));
  const m = csv.rows && Object.fromEntries(H.map((h, i) => [h, csv.rows[1][i]]));
  ok(m && m.Remeslo === 'Sadrokartón' && m['Remeslo (DE)'] === 'Trockenbau' && m['Google hodnotenie'] === '4,7' && m['Vhodná (palec)'] === 'áno'
    && /^\d{4}-\d{2}-\d{2} · gu-ulm\.de, bau-pasing\.de, maier-innenausbau\.de \(München\)$/.test(m.Hľadanie) && m['Google Mapy'] === 'https://www.google.com/maps/place/Maier',
  'riadok: remeslo SK/DE, hodnotenie, palec, hľadanie (dátum + vzorové weby), Mapy', JSON.stringify(m));
  ok(JSON.stringify(csv.name && csv.name.slice(0, 2)) === '["nove-firmy","hladanie"]' && csv.name.includes('gu-ulm.de'), 'názov súboru: nove-firmy-hladanie-dátum-web', JSON.stringify(csv.name));
  await page.click('.ls-note [data-ls-mails="s1"]');
  await page.waitForTimeout(100);
  const clip = await page.evaluate(() => window.__clip);
  ok(clip === 'info@maier-innenausbau.de, info@keller-akustik.de', 'Kopírovať e-maily: e-maily hľadania oddelené čiarkou', clip);

  console.log('\nHistória hľadaní');
  await page.evaluate(() => { window.__csv = null; }); await page.click('#dl-leads details.dl-exp > summary'); await page.click('#dl-leads [data-dl-a="exportx"][data-i="0"]');
  await page.waitForTimeout(150);
  const hist = await page.evaluate(() => [...document.querySelectorAll('.ls-hist-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()));
  ok(hist.length === 2 && /chcené 200 · našlo 610 · uložených 3 · 3 kolá/.test(hist[0]) && /Export/.test(hist[0]) && /alt\.de/.test(hist[1]), 'každé hľadanie: počty, kolá, Ukázať, Export', hist.join(' || '));
  await page.click('.ls-hist-row[data-ls-hist="s0"] .btn-outline');
  await page.waitForTimeout(100);
  const h0 = await page.evaluate(() => window.__csv && window.__csv.slice(1).map(r => r[0]));
  ok(JSON.stringify(h0) === '["Staré hľadanie GmbH"]', 'Export pri staršom hľadaní: len jeho firmy', JSON.stringify(h0));
  await page.evaluate(() => UI.closeModal());

  console.log('\nHlavný Export a filter Hľadanie');
  await page.evaluate(() => { window.__csv = null; DataList.set('leads', 'hladanie', 's1'); });
  await page.waitForTimeout(150);
  await page.click('#dl-leads [data-dl-a="export"]');
  const main = await page.evaluate(() => window.__csv);
  ok(main && main.slice(1).map(r => r[0]).join('|') === 'Maier Innenausbau GmbH|Keller Akustik GmbH|Bez e-mailu Bau', 'Export so zvoleným hľadaním: len jeho firmy', main && main.slice(1).map(r => r[0]).join('|'));
  ok(main && main[0].slice(0, 23).join('|') === H.join('|') && main[0].includes('Popis webu') && main[0].includes('Od kancelárie (km)'), 'Export zoznamu má tie isté kontaktné stĺpce a navyše údaje zoznamu', main && main[0].join('|'));
  await page.evaluate(() => { window.__csv = null; });
  await page.click('#dl-leads [data-dl-a="cols"]');
  await page.click('#dl-leads [data-dl-a="export-visible"]');
  const vis = await page.evaluate(() => window.__csv);
  ok(vis && vis.length === 4 && vis[0][0] === 'Firma', '„Exportovať len zobrazené stĺpce" tiež len vyfiltrované firmy (3)', vis && JSON.stringify(vis.map(r => r[0])));
  await page.evaluate(() => DataList.reset('leads'));

  console.log('\nOkno hľadania: počty, odhad, otázka');
  await page.evaluate(async () => { Lead.osStatus = null; Lead._findMode = 'urls'; Lead.findForm(); await Lead.loadStatus(); Lead.urlEstimate(); });
  await page.waitForTimeout(150);
  const opts = await page.evaluate(() => [...document.querySelectorAll('#find-urls [name=u_count] option')].map(o => o.textContent));
  ok(opts.join('|') === '10|20|30|50|100 — po kolách|200 — po kolách|300 — po kolách', 'počty 10, 20, 30, 50, 100, 200, 300 (nad 50 po kolách)', opts.join('|'));
  await page.selectOption('#find-urls [name=u_count]', '200');
  const box = await page.evaluate(() => document.getElementById('find-urls-os').textContent.replace(/\s+/g, ' '));
  ok(/cca 600 záznamov/.test(box) && /kontakty približne pre 100 webov/.test(box) && /približne 2,1 USD/.test(box) && /približne 30 minút/.test(box) && /po kolách \(~3\)/.test(box),
    '200 firiem: 600 záznamov, kontakty pre 100 webov, ~2,1 USD, ~30 minút, ~3 kolá', box);
  await page.fill('#find-urls [name=urls]', 'huber-trockenbau.de\nschmidt-ausbau.de\nweber-bau.de');
  await page.dispatchEvent('#find-urls [name=urls]', 'input');
  await page.selectOption('#find-urls [name=u_count]', '300');
  await page.click('#find-urls-go');
  await page.waitForSelector('#ui-ask', { timeout: 3000 }).catch(() => null);
  const ask = await page.evaluate(() => (document.getElementById('ui-ask') || {}).textContent || '');
  ok(/Toto hľadanie môže stáť približne 3,2 USD — pokračovať\?/.test(ask) && /900 záznamov/.test(ask), 'nad 600 záznamov: „Toto hľadanie môže stáť približne 3,2 USD — pokračovať?"', ask.replace(/\s+/g, ' ').slice(0, 300));
  await page.click('#ui-ask [data-ask="cancel"]');
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => !window.__ins.some(x => x.t === 'lead_searches')), 'Späť: hľadanie sa nezaloží');
  await page.click('#find-urls-go');
  await page.waitForSelector('#ui-ask', { timeout: 3000 }).catch(() => null);
  await page.click('#ui-ask [data-ask="ok"]');
  await page.waitForTimeout(300);
  const started = await page.evaluate(() => ({ ins: window.__ins.find(x => x.t === 'lead_searches'), call: window.__calls.find(c => c.url.includes('leads-from-urls')) }));
  ok(started.ins && started.ins.row.params.count === 300 && started.ins.row.params.outscraper === true, 'Hľadať: hľadanie 300 firiem sa založí', JSON.stringify(started.ins && started.ins.row.params));
  ok(started.call && started.call.auth === 'Bearer jwt-088' && JSON.parse(started.call.body).count === 300, 'a server sa zavolá s prihlásením a počtom 300');
  await page.evaluate(() => UI.closeModal());
  // 20 firiem: bez otázky.
  await page.evaluate(() => { window.__ins = []; Lead.findForm(); });
  await page.waitForTimeout(100);
  await page.fill('#find-urls [name=urls]', 'huber-trockenbau.de\nschmidt-ausbau.de\nweber-bau.de');
  await page.dispatchEvent('#find-urls [name=urls]', 'input');
  await page.click('#find-urls-go');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !document.getElementById('ui-ask') || document.getElementById('ui-ask').hidden || !document.getElementById('ui-ask').offsetParent) &&
    await page.evaluate(() => window.__ins.some(x => x.t === 'lead_searches' && x.row.params.count === 20)), '20 firiem: hľadá sa hneď, bez otázky');
  await page.evaluate(() => UI.closeModal());
  // Bez Google Máp: najviac 50.
  await page.evaluate(async () => { window.__os = { outscraper: false }; Lead.osStatus = null; Lead.findForm(); await Lead.loadStatus(); Lead.urlEstimate(); });
  await page.waitForTimeout(150);
  const off = await page.evaluate(() => ({ opts: [...document.querySelectorAll('#find-urls [name=u_count] option')].map(o => o.value), box: document.getElementById('find-urls-os').textContent }));
  ok(off.opts.join(',') === '10,20,30,50' && /najviac 50 naraz/.test(off.box), 'bez Outscraperu: počty len do 50 a povie sa to', JSON.stringify(off));
  await page.evaluate(() => { UI.closeModal(); window.__os = { outscraper: true, outscraper_max: 1000 }; Lead.osStatus = { on: true, max: 1000 }; });

  console.log('\nPriebeh po kolách');
  const RUN = { id: 'r2', kind: 'urls', status: 'running', source: 'outscraper', created_at: ago(20), started_at: ago(20), heartbeat_at: ago(0.05), progress: 71,
    stage: 'impressum', stage_label: 'Overujem Impressum 64 z 150', added: 75, found: 610,
    params: { urls: ['https://gu-ulm.de', 'https://bau-pasing.de', 'https://maier-innenausbau.de'], count: 200, outscraper: true },
    seeds: [{ domain: 'gu-ulm.de' }, { domain: 'bau-pasing.de' }], stats: { multi: true, round: 2, rounds: 4, count: 200 }, log: [{ at: ago(1), text: 'Kolo 2 z ~4: 150 firiem na overenie (uložených 75 z 200)' }] };
  await page.evaluate(async (RUN) => {
    window.DATA_.lead_searches = [RUN, ...window.DATA_.lead_searches];
    Lead.loaded = false;
    await Danubra.views.leads.call(Danubra, document.getElementById('view'));
  }, RUN);
  await page.waitForTimeout(200);
  const lp = await page.evaluate(() => { const el = document.querySelector('[data-lp="r2"]'); return el ? { round: (el.querySelector('[data-lp-el="round"]') || {}).textContent, pct: (el.querySelector('[data-lp-el="pct"]') || {}).textContent, text: el.textContent.replace(/\s+/g, ' ') } : null; });
  ok(lp && lp.round === 'Kolo 2 z ~4 · uložených 75 z 200' && /71/.test(lp.pct || ''), 'pás: „Kolo 2 z ~4 · uložených 75 z 200", percentá za celé hľadanie', JSON.stringify(lp));
  const now = await page.evaluate(() => (document.querySelector('.now-card, .shell-now') || document.getElementById('view')).textContent.replace(/\s+/g, ' '));
  ok(/Hľadanie 200 firiem beží po kolách/.test(now), 'hore: „Hľadanie 200 firiem beží po kolách"', now.slice(0, 300));
  // Ďalšie kolo sa nespustilo → Pokračovať.
  await page.evaluate(async () => {
    const s = window.DATA_.lead_searches[0];
    Object.assign(s, { heartbeat_at: new Date(Date.now() - 30e3).toISOString(), stats: { ...s.stats, handoff_at: new Date(Date.now() - 31e3).toISOString(), chain_failed: true } });
    window.__calls = [];
    Lead.loaded = false;
    await Danubra.views.leads.call(Danubra, document.getElementById('view'));
  });
  await page.waitForTimeout(200);
  const st = await page.evaluate(() => (document.querySelector('[data-lp="r2"]') || {}).textContent || '');
  ok(/Ďalšie kolo hľadania sa nespustilo/.test(st) && /Pokračovať/.test(st) && /Uložených je zatiaľ 75 firiem/.test(st), 'ďalšie kolo sa nespustilo: pás ponúkne Pokračovať', st.replace(/\s+/g, ' ').slice(0, 300));
  await page.click('[data-lp="r2"] .btn-primary');
  await page.waitForTimeout(250);
  const res = await page.evaluate(() => window.__calls.find(c => c.url.includes('leads-from-urls')));
  ok(res && res.auth === 'Bearer jwt-088' && JSON.parse(res.body).resume === true && JSON.parse(res.body).search_id === 'r2', 'Pokračovať zavolá server s prihlásením a resume', JSON.stringify(res));
  const st2 = await page.evaluate(() => (document.querySelector('[data-lp="r2"]') || {}).textContent || '');
  ok(/Hľadanie beží/.test(st2), 'po Pokračovať pás znova ukazuje „Hľadanie beží"', st2.replace(/\s+/g, ' ').slice(0, 160));

  ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
  console.log(`\n${passed} prešlo, ${failed} padlo\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('  ✗ Error', e); process.exit(1); });
