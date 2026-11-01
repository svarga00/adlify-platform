// ============================================================================
// DANUBRA — remeslá firiem v prehliadači (087): stĺpec, filter, detail, výber
// Spustenie:  node app/tests/remesla.test.js
// ============================================================================
// „Tu by som potreboval určiť remeslo, ale všade :)"
//
// V skutočnom prehliadači (playwright-core), bez siete: databáza je
// podstrčená. Overuje sa zoznam Nové firmy (stĺpec Remeslo hneď za Firmou,
// filter v lište s počtami, zoradenie, Stĺpce, export), detail firmy (čipy
// v hlavičke, Upraviť remeslá, Vrátiť automaticky, ľudia na remeslo),
// Oslovovanie (Odoslané, Firmy a kontakty, Dnes na rade, Odkazy od kolegov)
// a verejný formulár app/odkazy.html (čipy remesiel → trades v tele).
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

const L = (o) => ({ status: 'new', source: 'outscraper', country: 'DE', created_at: '2026-10-01T08:00:00Z', ...o });
const DATA = {
  leads: [
    L({ id: 'l1', name: 'Maier Innenausbau GmbH', city: 'Augsburg', postal_code: '86150', trade: 'suchá výstavba', categories: ['Trockenbauunternehmen'], score: 92, email: 'info@maier.de' }),
    L({ id: 'l2', name: 'Englhardt Malerei GmbH', city: 'Ingolstadt', postal_code: '85049', trade: 'maliarstvo, omietky, zatepľovanie', score: 80, email: 'info@englhardt.de' }),
    L({ id: 'l3', name: 'Huber GmbH', city: 'Ulm', score: 50 }),
    L({ id: 'l4', name: 'Kaya Fliesen GmbH', city: 'München', categories: ['Fliesenleger'], trade_keys: ['elektrikar'], score: 70, email: 'info@kaya.de' }),
  ],
  trades: [{ key: 'trockenbau', name_sk: 'Sadrokartón', name_de: 'Trockenbauer', sort_order: 1, active: true },
    { key: 'maliar', name_sk: 'Maliar', name_de: 'Maler', sort_order: 2, active: true },
    { key: 'cnc', name_sk: 'CNC operátor', sort_order: 20, active: true }],
  workers: [{ id: 'w1', profession: 'trockenbau', status: 'ready' }, { id: 'w2', profession: 'trockenbau', status: 'deployed' },
    { id: 'w3', profession: 'trockenbau', status: 'inactive' }, { id: 'w4', profession: 'maliar', status: 'candidate' }],
  outreach: [{ id: 'o1', lead_id: 'l2', step: 1, status: 'sent', to_email: 'info@englhardt.de', subject: 'Maler für Ihre Baustellen', sent_at: '2026-10-20T08:00:00Z', created_at: '2026-10-20T08:00:00Z' }],
  lead_tips: [{ id: 't1', company_name: 'Zimmerei Brandl', city: 'Passau', submitted_by_name: 'Jano', status: 'new', created_at: '2026-10-31T08:00:00Z', trade_keys: ['tesar'] },
    { id: 't2', company_name: 'Neznáma GmbH', submitted_by_name: 'Jano', status: 'new', created_at: '2026-10-31T08:00:00Z' }],
  partners: [], subcontracts: [], lead_searches: [], outreach_events: [], email_optout: [], message_templates: [], lead_contacts: [], members: [], mailboxes: [],
  settings: [{ id: 's1', supplier: { name: 'Partner und Service s. r. o.' }, marketing: { tips: { token: 'a1b2c3d4'.repeat(6), enabled: true } } }],
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
    window.__upd = []; window.__csv = null;
    DB.list = async (t) => ({ data: (DATA[t] || []).map(x => ({ ...x })), error: null });
    DB.count = async () => 0;
    DB.update = async (t, id, patch) => { window.__upd.push({ t, id, patch }); return { data: null, error: null }; };
    DB.client = { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } };
    const pf = window.fetch;
    window.fetch = async (u, o) => (String(u).includes('/.netlify/functions/') ? new Response('{}', { status: 202 }) : pf(u, o));
    DanubraExport.download = (rows, name) => { window.__csv = rows; return 'x.csv'; };
    Danubra.user = { id: 'u-1', email: 'test@punds.eu' };
    Danubra.me = { role: 'admin', active: true }; Danubra.members = [{ role: 'admin', active: true }];
    Danubra.cfgRow = DATA.settings[0];
    document.getElementById('login-screen').hidden = true; document.getElementById('app').hidden = false;
    Danubra._buildNav();
    Danubra.route = 'leads'; Lead.loaded = false;
    await Danubra.views.leads.call(Danubra, document.getElementById('view'));
  }, DATA);
  await page.waitForTimeout(250);

  console.log('Nové firmy: stĺpec Remeslo');
  const heads = () => page.evaluate(() => [...document.querySelectorAll('#dl-leads .dl-head .dl-th')]
    .filter(e => getComputedStyle(e).display !== 'none').map(e => (e.className.match(/dl-col-(\w+)/) || [])[1]));
  const h0 = await heads();
  ok(h0[0] === 'firma' && h0[1] === 'remeslo', 'stĺpec Remeslo je hneď za Firmou', h0.join(','));
  const cell = (id) => page.evaluate((id) => {
    const c = document.querySelector(`#dl-leads .dl-row[data-dl-row="${id}"] .dl-col-remeslo`);
    const t = c && c.querySelector('.tr-chips');
    return c ? { text: t ? t.textContent.replace(/\s+/g, ' ').trim() : '', title: (c.querySelector('.tr-chips') || {}).title || '', hand: !!c.querySelector('.is-hand'),
      chips: c.querySelectorAll('.tr-chip:not(.is-more)').length } : null;
  }, id);
  const c1 = await cell('l1'), c2 = await cell('l2'), c3 = await cell('l3'), c4 = await cell('l4');
  ok(c1 && c1.text === 'Sadrokartón', 'kategória Trockenbauunternehmen → Sadrokartón (názov z Remeslá a otázky)', JSON.stringify(c1));
  ok(c2 && /Maľovanie/.test(c2.text) && /Zatepľovanie a fasády/.test(c2.text) && /automaticky/.test(c2.title), 'slovenský text od AI → Maľovanie + Zatepľovanie a fasády (automaticky)', JSON.stringify(c2));
  ok(c3 && c3.text === 'neurčené', 'firma bez remesla: „neurčené"', JSON.stringify(c3));
  ok(c4 && c4.text === 'Elektro' && c4.hand && /ručne/.test(c4.title), 'ručne určené (trade_keys) má prednosť a je odlíšené', JSON.stringify(c4));
  const sub = await page.evaluate(() => document.querySelector('#dl-leads .dl-row[data-dl-row="l2"] .dl-col-firma small').textContent);
  ok(sub === '85049 Ingolstadt', 'podnadpis firmy má len PSČ a mesto (remeslo sa neopakuje)', sub);

  await page.click('#dl-leads .dl-th.dl-col-remeslo [data-dl-a="sort"]');
  const order = await page.evaluate(() => [...document.querySelectorAll('#dl-leads .dl-row')].map(r => r.getAttribute('data-dl-row')));
  ok(order.join() === 'l4,l2,l1,l3', 'zoradenie podľa prvého remesla (neurčené na koniec)', order.join());

  console.log('\nFilter Remeslo v lište');
  const inBar = await page.evaluate(() => !!document.querySelector('#dl-leads .dl-filters details[data-dl-dd="remeslo"]'));
  ok(inBar, 'filter Remeslo je v lište, nie v Ďalších filtroch');
  await page.click('#dl-leads details[data-dl-dd="remeslo"] > summary');
  const opts = await page.evaluate(() => [...document.querySelectorAll('#dl-leads details[data-dl-dd="remeslo"] .dl-chk')].map(l => `${l.querySelector('span').textContent}=${l.querySelector('em').textContent}`));
  ok(opts.includes('Sadrokartón=1') && opts.includes('Maľovanie=1') && opts.includes('Elektro=1') && opts.includes('Neurčené=1') && !opts.some(o => /CNC/.test(o)),
    'možnosti s počtami (len tie, ktoré v zozname sú) + Neurčené', opts.join(', '));
  await page.click('#dl-leads details[data-dl-dd="remeslo"] input[data-v="omietkar"]');
  let vis = await page.evaluate(() => DataList.visible('leads').map(r => r.id));
  ok(vis.join() === 'l2', 'filter Zatepľovanie a fasády → len Englhardt', vis.join());
  await page.click('#dl-leads details[data-dl-dd="remeslo"] input[data-v="__none__"]').catch(async () => {
    await page.evaluate(() => { const i = [...document.querySelectorAll('#dl-leads details[data-dl-dd="remeslo"] input')].find(x => /Neurčené/.test(x.parentNode.textContent)); if (i) i.click(); });
  });
  vis = await page.evaluate(() => DataList.visible('leads').map(r => r.id).sort());
  ok(vis.join() === 'l2,l3', 'viac naraz: + Neurčené', vis.join());
  await page.evaluate(() => DataList.reset('leads'));

  console.log('\nStĺpce a export');
  await page.click('#dl-leads [data-dl-a="cols"]');
  ok(await page.isVisible('#dl-leads [data-dl-a="colvis"][data-k="remeslo"]'), 'stĺpec Remeslo je v paneli Stĺpce');
  await page.click('#dl-leads [data-dl-a="colvis"][data-k="remeslo"]');
  ok(!(await heads()).includes('remeslo'), 'dá sa skryť');
  await page.click('#dl-leads [data-dl-a="colreset"]');
  ok((await heads())[1] === 'remeslo', '„Pôvodné nastavenie" ho vráti');
  await page.click('#dl-leads [data-dl-a="export"]');
  const csv = await page.evaluate(() => window.__csv);
  const hdr = csv && csv[0];
  const row2 = csv && csv.find(r => r[0] === 'Englhardt Malerei GmbH');
  const iSk = hdr ? hdr.indexOf('Remeslo') : -1, iDe = hdr ? hdr.indexOf('Remeslo (DE)') : -1;
  ok(iSk > 0 && iDe > 0 && hdr.includes('Remeslo určené') && hdr.includes('Čím sa zaoberá (AI)'), 'export: Remeslo, Remeslo (DE), Remeslo určené, text od AI', hdr && hdr.join('|'));
  ok(row2 && row2[iSk] === 'Maľovanie, Zatepľovanie a fasády' && row2[iDe] === 'Maler- und Lackierarbeiten, WDVS und Fassade', 'export: slovenské aj nemecké názvy', row2 && `${row2[iSk]} / ${row2[iDe]}`);

  console.log('\nDetail firmy: remeslá v hlavičke a výber');
  await page.evaluate(() => Lead.detail('l1'));
  await page.waitForTimeout(250);
  const hd = await page.evaluate(() => ({ trades: (document.querySelector('.ld-modal .ld-trades') || {}).textContent || '',
    avail: (document.querySelector('.ld-modal .ld-avail') || {}).textContent || '', sub: document.querySelector('.ld-modal .ld-id-sub').textContent.replace(/\s+/g, ' ') }));
  ok(/Sadrokartón/.test(hd.trades) && /Upraviť remeslá/.test(hd.trades) && /automaticky/.test(hd.trades), 'hlavička: čipy remesiel, „Upraviť remeslá", automaticky', hd.trades);
  ok(/Máme k dispozícii: 2 živnostníci na toto remeslo/.test(hd.avail), 'koľko živnostníkov na remeslo máme (bez neaktívnych)', hd.avail);
  ok(!/suchá výstavba/.test(hd.sub), 'slovenský text od AI v hlavičke nie je dvakrát', hd.sub);
  await page.click('.ld-modal .ld-tr-btn');
  const pick = await page.evaluate(() => ({ open: !document.querySelector('[data-ld-trpick]').hidden,
    opts: [...document.querySelectorAll('[data-ld-trpick] .tr-opt')].map(b => `${b.textContent.trim()}${b.getAttribute('aria-pressed') === 'true' ? '*' : ''}`) }));
  ok(pick.open && pick.opts.includes('Sadrokartón*') && pick.opts.includes('CNC operátor') && pick.opts.includes('Zatepľovanie a fasády'), 'výber: všetky remeslá (vstavané aj z tabuľky), súčasné zaškrtnuté', pick.opts.join(', '));
  await page.click('[data-ld-trpick] .tr-opt[data-tr-k="trockenbau"]');
  await page.click('[data-ld-trpick] .tr-opt[data-tr-k="maliar"]');
  await page.click('[data-ld-trpick] .tr-opt[data-tr-k="omietkar"]');
  await page.click('[data-ld-trpick] .btn-primary');
  await page.waitForTimeout(150);
  let st = await page.evaluate(() => ({ upd: window.__upd.slice(-1)[0], head: document.querySelector('.ld-modal .ld-trades').textContent.replace(/\s+/g, ' '),
    closed: document.querySelector('[data-ld-trpick]').hidden, row: (document.querySelector('#dl-leads .dl-row[data-dl-row="l1"] .dl-col-remeslo') || {}).textContent || '',
    pitch: DanubraPitch.pitch({ lead: Lead.rows.find(r => r.id === 'l1') }).trade.key }));
  ok(st.upd && st.upd.t === 'leads' && st.upd.id === 'l1' && JSON.stringify(st.upd.patch) === '{"trade_keys":["maliar","omietkar"]}', 'uloží trade_keys (v poradí výberu)', JSON.stringify(st.upd));
  ok(/Maľovanie/.test(st.head) && /Zatepľovanie/.test(st.head) && /ručne/.test(st.head) && st.closed, 'hlavička: nové remeslá, ručne, výber sa zavrie', st.head);
  ok(/Maľovanie/.test(st.row) && !/Sadrokartón/.test(st.row), 'zoznam sa hneď prekreslí', st.row);
  ok(st.pitch === 'maler', 'e-mail a prezentácia (pitch.js) idú podľa ručného remesla');
  await page.click('.ld-modal .ld-tr-btn');
  await page.click('[data-ld-trpick] button[title*="Zmaže ručný výber"]');
  await page.waitForTimeout(150);
  st = await page.evaluate(() => ({ upd: window.__upd.slice(-1)[0], head: document.querySelector('.ld-modal .ld-trades').textContent.replace(/\s+/g, ' ') }));
  ok(st.upd && st.upd.patch.trade_keys === null && /Sadrokartón/.test(st.head) && /automaticky/.test(st.head), '„Vrátiť automaticky" = null, znova odhad', JSON.stringify(st.upd));
  await page.evaluate(() => UI.closeModal());

  console.log('\nOslovovanie');
  await page.evaluate(async () => { Danubra.route = 'outreach'; Outreach.tab = 'sent'; await Danubra.views.outreach.call(Danubra, document.getElementById('view')); });
  await page.waitForTimeout(200);
  let o = await page.evaluate(() => ({ head: [...document.querySelectorAll('#dl-odoslane .dl-th')].map(e => (e.className.match(/dl-col-(\w+)/) || [])[1]),
    cell: (document.querySelector('#dl-odoslane .dl-col-remeslo.dl-c') || {}).textContent || '', filter: !!document.querySelector('#dl-odoslane .dl-filters details[data-dl-dd="remeslo"]') }));
  ok(o.head[1] === 'remeslo' && /Maľovanie/.test(o.cell) && o.filter, 'Odoslané: stĺpec a filter Remeslo', JSON.stringify(o));
  await page.evaluate(async () => { Outreach.tab = 'firms'; await Danubra.views.outreach.call(Danubra, document.getElementById('view')); });
  await page.waitForTimeout(150);
  o = await page.evaluate(() => ({ head: [...document.querySelectorAll('#dl-firmy-kontakty .dl-th')].map(e => (e.className.match(/dl-col-(\w+)/) || [])[1]),
    filter: !!document.querySelector('#dl-firmy-kontakty details[data-dl-dd="remeslo"]') }));
  ok(o.head[1] === 'remeslo' && o.filter, 'Firmy a kontakty: stĺpec a filter Remeslo', o.head.join(','));
  await page.evaluate(async () => { Outreach.tab = 'today'; await Danubra.views.outreach.call(Danubra, document.getElementById('view')); });
  await page.waitForTimeout(150);
  o = await page.evaluate(() => ({ bar: (document.querySelector('.tr-bar') || {}).textContent || '', rows: document.querySelectorAll('#view .list-row').length }));
  ok(/Remeslo:/.test(o.bar) && /Sadrokartón 1/.test(o.bar.replace(/\s+/g, ' ')) && /Elektro 1/.test(o.bar.replace(/\s+/g, ' ')) && o.rows >= 2, 'Dnes na rade: výber remesla s počtami', o.bar.replace(/\s+/g, ' '));
  await page.evaluate(() => Outreach.todayTrade('elektrikar'));
  await page.waitForTimeout(100);
  o = await page.evaluate(() => [...document.querySelectorAll('#view .list-row strong')].map(e => e.textContent));
  ok(o.length === 1 && /Kaya/.test(o[0]), 'Dnes na rade: len firmy s vybraným remeslom', o.join(','));
  await page.evaluate(() => Outreach.todayTrade(null));
  await page.evaluate(async () => { Outreach.tab = 'tips'; await Danubra.views.outreach.call(Danubra, document.getElementById('view')); });
  await page.waitForTimeout(200);
  o = await page.evaluate(() => ({ t1: (document.querySelector('#dl-odkazy-kolegov .dl-row[data-dl-row="t1"] .dl-col-remeslo') || {}).textContent || '',
    t2: (document.querySelector('#dl-odkazy-kolegov .dl-row[data-dl-row="t2"] .dl-col-remeslo') || {}).textContent || '',
    filter: !!document.querySelector('#dl-odkazy-kolegov details[data-dl-dd="remeslo"]') }));
  ok(/Debnenie|Tesár/.test(o.t1) && /neurčené/.test(o.t2) && o.filter, 'Odkazy od kolegov: stĺpec (zaklikol kolega) a filter', JSON.stringify(o));
  await page.evaluate(() => LeadTips.detail('t2'));
  await page.click('.modal-card .ld-tr-btn');
  await page.click('#lt-trpick .tr-opt[data-tr-k="zvarac"]');
  await page.click('#lt-trpick .btn-primary');
  await page.waitForTimeout(150);
  o = await page.evaluate(() => ({ upd: window.__upd.slice(-1)[0], row: (document.querySelector('#dl-odkazy-kolegov .dl-row[data-dl-row="t2"] .dl-col-remeslo') || {}).textContent || '' }));
  ok(o.upd && o.upd.t === 'lead_tips' && JSON.stringify(o.upd.patch) === '{"trade_keys":["zvarac"]}' && /Zváranie/.test(o.row), 'v detaile odkazu sa remeslo dá upraviť', JSON.stringify(o));
  const lead = await page.evaluate(() => DanubraTips.tipToLead(LeadTips.tip('t2')).trade_keys);
  ok(JSON.stringify(lead) === '["zvarac"]', 'pri pridaní do Nových firiem sa remeslo prenesie');
  await page.evaluate(() => UI.closeModal());

  console.log('\nVerejný formulár (odkazy.html)');
  const pub = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await pub.route(/danubra-lead-tip/, (route) => {
    const b = JSON.parse(route.request().postData() || '{}');
    pub.__body = b;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b.check ? { ok: true } : { ok: true, added: 1, duplicates: 0, results: [{ i: 0, company: 'Brandl', status: 'added' }], mine: { tips: 1 } }) });
  });
  await pub.goto(`http://127.0.0.1:${port}/app/odkazy.html#t=${'a1b2c3d4'.repeat(6)}`, { waitUntil: 'load' });
  await pub.waitForTimeout(200);
  const chips = await pub.evaluate(() => [...document.querySelectorAll('.firm input[data-tr]')].map(i => i.parentNode.textContent.trim()));
  ok(chips.includes('Sadrokartón') && chips.includes('Zatepľovanie a fasády') && chips.includes('Okná a dvere'), 'čipy remesiel so slovenskými názvami (vstavaný zoznam)', chips.join(', '));
  const wide = await pub.evaluate(() => document.documentElement.scrollWidth);
  ok(wide <= 390, 'telefón: nič nepreteká', String(wide));
  await pub.fill('#name', 'Jano');
  await pub.fill('.firm [data-k="company"]', 'Zimmerei Brandl');
  await pub.evaluate(() => ['tesar', 'betonar'].forEach(k => document.querySelector(`.firm input[data-tr][value="${k}"]`).click()));
  await pub.click('#go');
  await pub.waitForTimeout(300);
  const body = pub.__body || {};
  ok(body.firms && JSON.stringify(body.firms[0].trades) === '["tesar","betonar"]', 'odoslané remeslá idú v tele (trades)', JSON.stringify(body.firms && body.firms[0]));
  await pub.close();

  ok(!chyby.length, 'bez chýb v konzole', chyby.join(' | '));
  await browser.close();
  server.close();
  console.log(`\n${passed} prešlo, ${failed} padlo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`  ✗ test spadol: ${e.stack}`); process.exit(1); });
