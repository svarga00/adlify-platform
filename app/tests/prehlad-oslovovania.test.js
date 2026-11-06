// ============================================================================
// DANUBRA — Marketing → Prehľad pre vedenie v prehliadači
// Spustenie:  node app/tests/prehlad-oslovovania.test.js
// ============================================================================
// V skutočnom prehliadači (playwright-core), bez siete: databáza je
// podstrčená (vie filters / gte / lte), hodiny sú podvrhnuté (Rep.clock).
// Overuje sa:
//   * záložka „Prehľad pre vedenie" v Marketingu (rovnaké meno v menu,
//     na záložke aj v nadpise), právo: admin a člen s modulom Marketing áno,
//     náborár nie,
//   * dlaždice s číslami a šípkou rozdielu, klik → okno so zoznamom firiem
//     (s logom), klik na firmu otvorí jej detail,
//   * lievik (počty a percentá, prepínač Nájdené v období),
//   * trend po KW (SVG s 12 KW, tabuľka s číslami),
//   * tabuľka kolegov (DataList) s exportom a súčtom,
//   * prepnutie obdobia (Minulý KW, Vlastné) zmení čísla a pamätá sa,
//   * Čo treba riešiť, Export CSV (sekcie), Tlačiť / PDF (trieda pre tlač),
//   * mobil 390 px bez vodorovného posúvania.
// Bez playwright-core alebo Chromia sa test preskočí.
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

// Piatok 6. 11. 2026, KW 45 (2.–8. 11.).
const NOW = '2026-11-06T12:00:00Z';
const ME = { id: 'm1', user_id: 'u1', email: 'stefan@punds.eu', full_name: 'Štefan Varga', role: 'admin', active: true };
const JANA = { id: 'm2', user_id: 'u2', email: 'jana@punds.eu', full_name: 'Jana Kováčová', role: 'custom', modules: ['marketing'], active: true };
const REC = { id: 'm3', user_id: 'u3', email: 'eva@punds.eu', full_name: 'Eva Nováková', role: 'recruiter', active: true };
const L = (id, name, o = {}) => ({ id, name, city: 'Ulm', postal_code: '89073', country: 'DE', website: `https://${id.toLowerCase()}.de`, status: 'new',
  source: 'outscraper', created_at: '2026-10-01T08:00:00Z', trade_keys: ['trockenbau'], ...o });
const DATA = {
  members: [ME, JANA, REC],
  leads: [
    L('L1', 'Müller Bau GmbH', { created_at: '2026-11-02T08:00:00Z', status: 'interested', status_changed_at: '2026-11-05T09:00:00Z', status_changed_by: 'u2' }),
    L('L2', 'Huber Innenausbau', { city: 'München', postal_code: '80331', status: 'meeting', status_changed_at: '2026-11-03T10:15:00Z', status_changed_by: 'u1', trade_keys: ['maliar'] }),
    L('L3', 'Keller Maler', { city: 'Stuttgart', postal_code: '70173', status: 'contacted', status_changed_at: '2026-10-28T10:00:00Z', status_changed_by: 'u1', trade_keys: ['maliar'] }),
    L('L4', 'Brandl Fliesen', { created_at: '2026-11-03T08:00:00Z', source: 'kolega', tip_by: 'Jana', trade_keys: ['obkladac'] }),
    L('L5', 'Schmid Elektro', { status: 'won', partner_id: 'p1', status_changed_at: '2026-10-29T08:00:00Z', status_changed_by: 'u1', trade_keys: ['elektrikar'] }),
    L('L6', 'Wagner Trockenbau', { status: 'replied', status_changed_at: '2026-11-03T15:00:00Z', created_at: '2026-10-20T08:00:00Z' }),
  ],
  outreach: [
    { id: 'o1', lead_id: 'L1', step: 1, status: 'sent', sent_at: '2026-11-02T09:00:00Z', sent_by: 'u1', opened_at: '2026-11-02T11:00:00Z', replied_at: '2026-11-03T08:00:00Z' },
    { id: 'o3', lead_id: 'L3', step: 1, status: 'sent', sent_at: '2026-10-28T09:00:00Z', sent_by: 'u2', auto_opened_at: '2026-10-28T09:00:20Z' },
    { id: 'o5', lead_id: 'L5', step: 1, status: 'sent', sent_at: '2026-10-27T09:00:00Z', sent_by: 'u1', opened_at: '2026-10-27T10:00:00Z' },
    { id: 'o6', lead_id: 'L6', step: 1, status: 'sent', sent_at: '2026-11-02T10:00:00Z', sent_by: 'u2', replied_at: '2026-11-03T14:00:00Z' },
  ],
  lead_contacts: [
    { id: 'c1', lead_id: 'L2', kind: 'call', direction: 'out', outcome: 'meeting_set', our_member_id: 'm2', our_member_name: 'Jana Kováčová',
      happened_at: '2026-11-03T10:00:00Z', duration_min: 12, created_at: '2026-11-03T10:10:00Z' },
    { id: 'c2', lead_id: 'L5', kind: 'call', direction: 'out', outcome: 'interested', our_member_id: 'm1', happened_at: '2026-10-28T10:00:00Z', duration_min: 8 },
  ],
  activities: [
    { id: 'a1', entity_type: 'lead', entity_id: 'L1', source: 'lead_status', body: 'Kategória: Odpísala → Má záujem', created_at: '2026-11-05T09:00:00Z', created_by: 'u2' },
    { id: 'a2', entity_type: 'lead', entity_id: 'L5', source: 'lead_status', body: 'Kategória: Má záujem → Je odberateľ', created_at: '2026-10-29T08:00:00Z', created_by: 'u1' },
  ],
  events: [{ id: 'e1', entity_type: 'lead', entity_id: 'L2', kind: 'meeting', title: 'Stretnutie Huber', starts_on: '2026-11-06', start_time: '14:00:00', place: 'München', created_at: '2026-11-03T10:20:00Z', created_by: 'u2' }],
  tasks: [{ id: 't1', entity_type: 'lead', entity_id: 'L3', status: 'open', title: 'Zavolať Kellerovi', due_date: '2026-11-03', assigned_to: 'u2', assigned_name: 'Jana Kováčová' }],
  lead_tips: [{ id: 'tp1', submitted_by_name: 'Jana', status: 'added', lead_id: 'L4', created_at: '2026-11-03T07:00:00Z' }],
  lead_searches: [], mail_messages: [], trades: [], partners: [], subcontracts: [], task_rules: [], workers: [], candidates: [],
  settings: [{ id: 's1', supplier: { name: 'Partner und Service s. r. o.' } }],
};

async function boot(page, port, me = ME) {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto(`http://127.0.0.1:${port}/app/`, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.evaluate(({ DATA, ME, NOW }) => {
    try { localStorage.clear(); } catch (e) { /* nič */ }
    window.__DATA = DATA; window.__lists = [];
    const match = (r, o) => {
      for (const [k, v] of Object.entries(o.filters || {})) {
        if (v == null) continue;
        if (Array.isArray(v) ? !v.includes(r[k]) : r[k] !== v) return false;
      }
      for (const [k, v] of Object.entries(o.gte || {})) if (v != null && !(r[k] != null && String(r[k]) >= String(v))) return false;
      for (const [k, v] of Object.entries(o.lte || {})) if (v != null && !(r[k] != null && String(r[k]) <= String(v))) return false;
      return true;
    };
    DB.list = async (t, o = {}) => { window.__lists.push({ t, o }); return { data: (window.__DATA[t] || []).filter(r => match(r, o)).map(x => JSON.parse(JSON.stringify(x))), error: null }; };
    DB.count = async () => 0;
    DB.update = async () => ({ data: null, error: null });
    DB.client = { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } };
    window.fetch = async () => new Response('{}', { status: 200 });
    Rep.clock = () => new Date(NOW);
    if (window.Kal) Kal.clock = () => new Date(NOW);
    window.__csv = null;
    DanubraExport.download = (rows, name) => { window.__csv = { rows, name }; return 'prehlad.csv'; };
    window.__printed = null;
    DanubraExport.printArea = (cls) => { window.__printed = cls; };
    Danubra.user = { id: ME.user_id, email: ME.email };
    Danubra.me = ME; Danubra.members = DATA.members;
    Danubra.cfgRow = DATA.settings[0];
    document.getElementById('login-screen').hidden = true; document.getElementById('app').hidden = false;
    Danubra._buildNav();
  }, { DATA, ME: me, NOW });
}
const go = async (page, route) => {
  await page.evaluate(async (route) => {
    if (location.hash === `#/${route}`) await Danubra.renderRoute();
    else { location.hash = `#/${route}`; await new Promise(r => setTimeout(r, 30)); await Danubra._routeReady; }
  }, route);
  await page.waitForTimeout(250);
};
const kpi = (page, k) => page.$eval(`.rp-kpi[data-kpi="${k}"] .rp-kpi-v`, e => e.textContent.trim()).catch(() => null);

(async () => {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(REPO, rel);
    if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(''); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const errors = [];
  try {
    // ── Počítač ───────────────────────────────────────────────────────────
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', e => errors.push(e.message));
    await boot(page, port);
    await go(page, 'leads');
    const tabs = await page.$$eval('.subtab', els => els.map(e => [e.dataset.key, e.querySelector('b').textContent.trim()]));
    ok(tabs.some(t => t[0] === 'vedenie' && t[1] === 'Prehľad pre vedenie'), 'Marketing má záložku „Prehľad pre vedenie"', JSON.stringify(tabs));
    await page.click('.subtab[data-key="vedenie"]');
    await page.waitForTimeout(400);
    ok(await page.evaluate(() => location.hash) === '#/vedenie', 'záložka otvorí #/vedenie');
    ok(await page.$eval('.page-title', e => e.textContent.trim()) === 'Prehľad pre vedenie', 'nadpis je to isté meno ako záložka');
    ok(await page.evaluate(() => Danubra.itemLabelOf('vedenie')) === 'Prehľad pre vedenie', 'aj v menu (itemLabelOf)');
    ok(await page.$eval('.page-sub', e => /KW 45/.test(e.textContent)), 'podnadpis: KW 45');

    // Dlaždice (Tento KW: 2.–6. 11.)
    ok(await page.$$eval('.rp-kpi', els => els.length) === 11, 'jedenásť dlaždíc');
    ok(await kpi(page, 'found') === '2', 'Nové firmy: 2 (L1, L4)');
    ok(await kpi(page, 'contacted') === '3', 'Oslovené: 3 (L1, L6 e-mailom, L2 hovorom)');
    ok(await kpi(page, 'calls') === '1', 'Hovory: 1');
    ok(await page.$eval('.rp-kpi[data-kpi="calls"] .rp-kpi-s', e => /12 min/.test(e.textContent)), 'Hovory: 12 minút');
    ok(await kpi(page, 'emails') === '2', 'E-maily: 2 odoslané v KW 45');
    ok(await page.$eval('.rp-kpi[data-kpi="emails"] .rp-kpi-s', e => /otvorené 50 %/.test(e.textContent)), 'E-maily: otvorené 50 % (len človekom)');
    ok(await kpi(page, 'replied') === '3', 'Reagovali: 3');
    ok(await kpi(page, 'meeting') === '1', 'Stretnutia: 1');
    ok(await kpi(page, 'won') === '0', 'Noví odberatelia v KW 45: 0 (L5 v KW 44)');
    ok(await kpi(page, 'overdue') === '1', 'Ďalšie kroky po termíne: 1 (dnešný stav)');
    ok(await page.$('.rp-kpi[data-kpi="contacted"] .rp-d.is-good .rp-arr') != null, 'oslovené: zelená šípka hore (viac ako minulý KW)');
    ok(await page.$eval('.rp-kpi[data-kpi="won"] .rp-kpi-d', e => /predtým 1/.test(e.textContent)), 'odberatelia: menej ako predtým (1)');
    ok(await page.$('.rp-kpi[data-kpi="won"] .rp-d.is-bad') != null, 'menej odberateľov = červená');

    // Klik na číslo → zoznam firiem s logom
    await page.click('.rp-kpi[data-kpi="contacted"] .rp-kpi-v');
    await page.waitForTimeout(250);
    const modal = await page.$$eval('#ui-modal .dl-row', els => els.map(e => e.textContent));
    ok(modal.length === 3, 'okno ukáže 3 oslovené firmy', String(modal.length));
    ok(await page.$('#ui-modal .dl-row .clogo, #ui-modal .dl-row [class*="logo"]') != null, 'firmy sú s logom (iniciálami)');
    ok(modal.some(t => /Jana Kováčová/.test(t)), 'pri firme je, kto ju oslovil');
    await page.click('#ui-modal .dl-row');
    await page.waitForTimeout(500);
    ok(await page.$eval('#ui-modal .modal-card', e => e.classList.contains('ld-modal')).catch(() => false), 'klik na firmu otvorí jej detail nad prehľadom');
    ok(await page.evaluate(() => location.hash) === '#/vedenie', 'a obrazovka sa neprepne');
    await page.evaluate(() => UI.closeModal());

    // Lievik
    const fun = await page.$$eval('.rp-fs', els => els.map(e => [e.querySelector('.rp-fs-l').textContent.trim(), e.querySelector('.rp-fs-n').textContent.trim(), e.querySelector('.rp-fs-c').textContent.trim()]));
    ok(fun.length === 7, 'lievik má 7 krokov', JSON.stringify(fun));
    ok(fun.map(f => f[1]).join(',') === '2,3,3,2,1,0,0', 'lievik: nájdené 2, oslovené 3, reagovali 3, záujem 2, stretnutie 1', fun.map(f => f[1]).join(','));
    ok(/50 % z nájdených/.test(fun[1][2]), 'z nájdených v období je oslovená polovica', fun[1][2]);
    ok(/66,7 % z predošlého/.test(fun[3][2]), 'Reagovali → Záujem 66,7 %', fun[3][2]);
    ok(await page.$eval('#rp-lievik .tip-btn', e => /prvýkrát/.test(e.dataset.tip)), 'otáznik vysvetľuje skupinu (prvýkrát oslovené)');
    await page.click('#rp-lievik .rp-seg button:nth-child(2)');
    await page.waitForTimeout(300);
    const fun2 = await page.$$eval('.rp-fs .rp-fs-n', els => els.map(e => e.textContent.trim()).join(','));
    ok(fun2 === '2,1,1,1,0,0,0', 'prepínač „Nájdené v období" zmení skupinu', fun2);
    await page.click('#rp-lievik .rp-seg button:nth-child(1)');
    await page.waitForTimeout(300);

    // Trend
    ok(await page.$$eval('#rp-chart .rp-g', els => els.length) === 12, 'trend má 12 KW');
    ok(await page.$eval('#rp-chart svg', e => /Trend po KW/.test(e.getAttribute('aria-label'))), 'graf má popis pre čítačku');
    ok(await page.$$eval('.rp-tbl tbody tr', els => els.length) === 12, 'pod grafom tabuľka s 12 KW');
    await page.hover('#rp-chart .rp-g[data-i="11"] .rp-hit');
    await page.waitForTimeout(100);
    ok(await page.$eval('#rp-tip', e => !e.hidden && /KW 45/.test(e.textContent)), 'prejdenie myšou ukáže čísla KW 45');

    // Kolegovia
    const kol = await page.$$eval('#dl-rp-kolegovia .dl-row', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    ok(kol.length === 3, 'tabuľka kolegov: všetci traja členovia', JSON.stringify(kol));
    ok(await page.$('#dl-rp-kolegovia .dl-foot, #dl-rp-kolegovia [class*="foot"]') != null, 'súčet pod tabuľkou');
    const jana = await page.evaluate(() => Rep.rep.members.find(m => m.key === 'm2'));
    ok(jana.contacted === 2 && jana.calls === 1 && jana.minutes === 12 && jana.emails === 1, 'Jana: oslovila 2 (hovor L2, e-mail L6), 1 hovor 12 min, 1 e-mail', JSON.stringify(jana));
    ok(jana.overdue === 1 && jana.tipsSent === 1 && jana.tipsAdded === 1, 'Jana: 1 krok po termíne, 1 tip pridaný');
    ok(await page.$('#dl-rp-kolegovia [data-dl-a="export"], #dl-rp-kolegovia button[title*="Export"], #dl-rp-kolegovia .dl-right button') != null, 'tabuľka kolegov má Export');
    ok(await page.$('#dl-rp-remesla') != null && await page.$('#dl-rp-regiony') != null && await page.$('#dl-rp-zdroje') != null && await page.$('#dl-rp-hladania') != null,
      'tabuľky remesiel, regiónov, zdrojov a hľadaní');

    // Čo treba riešiť
    const todo = await page.$$eval('.rp-todo-c', els => els.map(e => [e.dataset.todo, e.querySelectorAll('li').length]));
    ok(JSON.stringify(todo) === JSON.stringify([['overdue', 1], ['noStep', 2], ['meetings', 1], ['unanswered', 1]]),
      'Čo treba riešiť: po termíne (L3), záujem bez kroku (L1, L2), stretnutie dnes (L2), odpoveď bez reakcie (L6)', JSON.stringify(todo));

    // Obdobie
    await page.click('.rp-seg button[data-period="lastkw"]');
    await page.waitForTimeout(300);
    ok(await page.$eval('.page-sub', e => /KW 44/.test(e.textContent)), 'Minulý KW: KW 44');
    ok(await kpi(page, 'won') === '1', 'v KW 44 je nový odberateľ (L5)');
    ok(await kpi(page, 'contacted') === '2', 'v KW 44 oslovené 2 (L5, L3)');
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem('danubra_rep_u1')).period) === 'lastkw', 'voľba obdobia sa pamätá');
    await page.click('.rp-seg button[data-period="custom"]');
    ok(await page.$eval('#rp-custom', e => !e.hidden), 'Vlastné ukáže dátumy od–do');
    await page.fill('#rp-from', '2026-10-26'); await page.fill('#rp-to', '2026-11-06');
    await page.click('#rp-custom .btn');
    await page.waitForTimeout(300);
    ok(await kpi(page, 'contacted') === '5' && await kpi(page, 'won') === '1', 'vlastné obdobie 26. 10.–6. 11.: oslovené 5, odberateľ 1');
    await page.click('.rp-seg button[data-period="kw"]');
    await page.waitForTimeout(300);

    // Export a tlač
    await page.evaluate(() => Rep.exportCsv());
    const csv = await page.evaluate(() => window.__csv);
    const titles = csv.rows.filter(r => r.length === 1).map(r => r[0]);
    ok(['Čísla za obdobie', 'Trend po KW', 'Po kolegoch', 'Po remeslách', 'Po regiónoch', 'Po zdrojoch', 'Čo treba riešiť'].every(t => titles.includes(t)),
      'Export CSV má všetky sekcie', titles.join(' | '));
    ok(csv.rows.some(r => r[0] === 'Ďalší krok po termíne' && r[1] === 'Keller Maler'), 'v exporte sú mená firiem');
    ok(csv.name[0] === 'prehlad-oslovovania' && csv.name.includes('2026-11-02'), 'názov súboru s obdobím', JSON.stringify(csv.name));
    await page.evaluate(() => Rep.print());
    await page.waitForTimeout(250);
    ok(await page.evaluate(() => window.__printed) === 'print-rp', 'Tlačiť / PDF tlačí prehľad (trieda print-rp)');
    ok(await page.$$eval('.rp-ptable', els => els.length) >= 5, 'na papier sú obyčajné tabuľky (DataList sa netlačí)');
    await page.evaluate(() => document.documentElement.classList.add('printing', 'print-rp'));
    await page.emulateMedia({ media: 'print' });
    ok(await page.$eval('.rp-bar', e => getComputedStyle(e).display === 'none'), 'pri tlači sa výber obdobia skryje');
    ok(await page.$eval('.print-head', e => getComputedStyle(e).display !== 'none' && /vedenie/.test(e.textContent)), 'pri tlači je hlavička s obdobím');
    ok(await page.$eval('#dl-rp-kolegovia', e => getComputedStyle(e).display === 'none'), 'zoznam kolegov sa pri tlači nahradí tabuľkou');
    await page.emulateMedia({ media: 'screen' });
    await page.close();

    // ── Práva ─────────────────────────────────────────────────────────────
    const pj = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    pj.on('pageerror', e => errors.push(e.message));
    await boot(pj, port, JANA);
    ok(await pj.evaluate(() => Danubra.can('vedenie')), 'člen s modulom Marketing smie na Prehľad pre vedenie');
    await go(pj, 'vedenie');
    ok(await pj.evaluate(() => location.hash) === '#/vedenie' && await pj.$('.rp-kpis') != null, 'a obrazovka sa mu otvorí');
    await pj.evaluate(() => { window.__firstLists = window.__lists.slice(); });
    // Výkon (priamo na prehľad, bez Nových firiem): len potrebné stĺpce, dátumový filter
    const lists = await pj.evaluate(() => window.__firstLists.filter(x => ['outreach', 'lead_tips', 'mail_messages', 'events', 'leads'].includes(x.t)).map(x => ({ t: x.t, s: x.o.select || '*', g: x.o.gte || null })));
    ok(lists.filter(x => x.t === 'outreach').every(x => x.s !== '*' && !/body_html|subject/.test(x.s)), 'oslovenia sa načítajú bez textov e-mailov');
    ok(lists.some(x => x.t === 'outreach' && x.g && x.g.sent_at), 'oslovenia v okne s filtrom dátumu');
    ok(lists.some(x => x.t === 'leads' && x.s !== '*'), 'firmy len s potrebnými stĺpcami');

    await pj.close();
    const pr = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    pr.on('pageerror', e => errors.push(e.message));
    await boot(pr, port, REC);
    ok(!(await pr.evaluate(() => Danubra.can('vedenie'))), 'náborár bez Marketingu nesmie');
    await pr.evaluate(async () => { location.hash = '#/vedenie'; await new Promise(r => setTimeout(r, 30)); await Danubra._routeReady; });
    await pr.waitForTimeout(250);
    ok(await pr.$('.rp-kpis') == null, 'a adresou sa na prehľad nedostane');
    await pr.close();

    // ── Mobil ─────────────────────────────────────────────────────────────
    const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    m.on('pageerror', e => errors.push(e.message));
    await boot(m, port);
    await go(m, 'vedenie');
    const w = await m.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    ok(w[0] <= w[1] + 1, 'mobil 390 px: stránka sa nedá posúvať do strán', JSON.stringify(w));
    ok(await m.$$eval('.rp-kpi', els => new Set(els.map(e => Math.round(e.getBoundingClientRect().left))).size) === 2, 'dlaždice v dvoch stĺpcoch');
    ok(await m.$eval('#rp-chart svg', e => e.getBoundingClientRect().width <= 390), 'graf sa zmestí na šírku');
    await m.close();
  } catch (e) {
    failed++; console.log(`  ✗ test spadol: ${e.stack || e.message}`);
  } finally {
    ok(errors.length === 0, 'žiadna chyba na stránke', errors.slice(0, 3).join(' | '));
    await browser.close();
    server.close();
  }
  console.log(`\n${passed} prešlo, ${failed} padlo\n`);
  process.exit(failed ? 1 : 0);
})();
