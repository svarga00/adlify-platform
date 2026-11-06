// ============================================================================
// DANUBRA — KW v hornom pruhu a Kalendár v prehliadači (089)
// Spustenie:  node app/tests/kalendar.test.js
// ============================================================================
// V skutočnom prehliadači (playwright-core), bez siete: databáza je
// podstrčená a vie od–do (gte/lte), hodiny sú podvrhnuté (Kal.clock).
// Overuje sa:
//   * KW v hornom pruhu pre daný deň (aj prelom roka) a bublinka s rozsahom,
//     klik otvorí Kalendár; na mobile je KW v tmavej hlavičke,
//   * Týždeň: sedem dní s KW v nadpise, šípky, položky z úloh, udalostí,
//     poznámok, ďalších krokov firiem, dokladov, zákaziek a faktúr; po termíne,
//   * ťahanie úlohy na iný deň zmení termín (DB.update) a dá sa vrátiť,
//   * Mesiac s číslami KW vľavo, Agenda po KW,
//   * vrstvy s počtami (vypnutie sa pamätá pre používateľa), Len moje,
//   * nová udalosť s pripomienkou → riadok v events + úloha v Úlohách,
//   * Úlohy majú „V kalendári", detail úlohy „Pridať do kalendára",
//   * mobil 390 px: týždeň ako zoznam dní s „Presunúť", mesiac kompaktne.
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

// Streda 4. 11. 2026, KW 45 (2.–8. 11.).
const NOW = '2026-11-04T09:00:00Z';
const ME = { id: 'm1', user_id: 'u1', email: 'stefan@punds.eu', full_name: 'Štefan Varga', role: 'admin', active: true };
const DATA = {
  members: [ME, { id: 'm2', user_id: 'u2', email: 'jana@punds.eu', full_name: 'Jana Kováčová', role: 'recruiter', active: true }],
  tasks: [
    { id: 't1', title: 'Zavolať Bauleiterovi Müller', status: 'open', priority: 'high', due_date: '2026-11-05', due_time: null,
      entity_type: 'lead', entity_id: 'l1', entity_label: 'Müller Bau GmbH', assigned_to: 'u1', assigned_name: 'Štefan Varga', source: 'manual', created_at: '2026-11-01T08:00:00Z' },
    { id: 't2', title: 'Poslať rámcovú zmluvu', status: 'open', priority: 'normal', due_date: '2026-11-03', due_time: null,
      assigned_to: 'u2', assigned_name: 'Jana Kováčová', source: 'manual', created_at: '2026-10-30T08:00:00Z' },
    { id: 't3', title: 'Zavolať do Ulmu', status: 'open', priority: 'normal', due_date: '2026-11-06', due_time: '09:30:00',
      assigned_to: 'u1', assigned_name: 'Štefan Varga', source: 'reminder', created_at: '2026-11-01T08:00:00Z' },
    { id: 't4', title: 'Hotová vec', status: 'done', priority: 'normal', due_date: '2026-11-02', due_time: null, assigned_to: 'u1', assigned_name: 'Štefan Varga', done_at: '2026-11-02T10:00:00Z' },
    { id: 't5', title: 'Stará úloha', status: 'open', priority: 'normal', due_date: '2026-10-20', due_time: null, assigned_to: 'u1', assigned_name: 'Štefan Varga' },
  ],
  events: [
    { id: 'e1', title: 'Obhliadka Wohnpark Feuerbach', kind: 'site_visit', starts_on: '2026-11-04', start_time: '10:00:00', end_time: '12:00:00', all_day: false,
      place: 'Ulm', participants: ['m1'], created_by: 'u1', entity_type: 'subcontract', entity_id: 's1', entity_label: 'Wohnpark Feuerbach' },
    { id: 'e2', title: 'Školenie BOZP', kind: 'other', starts_on: '2026-11-09', all_day: true, participants: ['m2'], created_by: 'u2' },
  ],
  activities: [{ id: 'a1', entity_type: 'worker', entity_id: 'w1', type: 'note', body: 'Overiť, či prišlo A1', follow_up_at: '2026-11-06T13:00:00Z', done: false, created_by: 'u1' }],
  leads: [{ id: 'l2', name: 'Huber GmbH', status: 'later', next_step_at: '2026-11-07', next_step_text: 'Poslať ponuku' }],
  outreach: [],
  v_worker_documents: [{ id: 'd1', worker_id: 'w1', worker_name: 'Ján Kováčik', kind: 'a1', valid_to: '2026-11-08' }],
  subcontracts: [{ id: 's1', title: 'Wohnpark Feuerbach', status: 'active', date_from: '2026-11-02', date_to: '2026-12-18' }],
  invoices: [{ id: 'i1', invoice_number: 'FA-2026-0045', status: 'sent', due_date: '2026-11-06', partner_id: 'p1' }],
  task_rules: [], partners: [], workers: [], candidates: [],
  settings: [{ id: 's1', supplier: { name: 'Partner und Service s. r. o.' } }],
};

async function boot(page, port) {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto(`http://127.0.0.1:${port}/app/`, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.evaluate(({ DATA, ME, NOW }) => {
    try { localStorage.clear(); } catch (e) { /* nič */ }
    window.__DATA = DATA; window.__upd = []; window.__ins = []; let seq = 0;
    const match = (r, o) => {
      for (const [k, v] of Object.entries(o.filters || {})) {
        if (v == null) continue;
        if (Array.isArray(v) ? !v.includes(r[k]) : r[k] !== v) return false;
      }
      for (const [k, v] of Object.entries(o.gte || {})) if (v != null && !(r[k] != null && String(r[k]) >= String(v))) return false;
      for (const [k, v] of Object.entries(o.lte || {})) if (v != null && !(r[k] != null && String(r[k]) <= String(v))) return false;
      return true;
    };
    DB.list = async (t, o = {}) => ({ data: (window.__DATA[t] || []).filter(r => match(r, o)).map(x => JSON.parse(JSON.stringify(x))), error: null });
    DB.count = async () => 0;
    DB.update = async (t, id, patch) => {
      window.__upd.push({ t, id, patch });
      const row = (window.__DATA[t] || []).find(r => r.id === id);
      if (row) Object.assign(row, patch);
      return { data: row ? { ...row } : null, error: null };
    };
    DB.insert = async (t, p) => {
      const row = { id: `n${++seq}`, ...p };
      (window.__DATA[t] = window.__DATA[t] || []).push(row);
      window.__ins.push({ t, row });
      return { data: { ...row }, error: null };
    };
    DB.client = { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } };
    window.fetch = async () => new Response('{}', { status: 200 });
    Kal.clock = () => new Date(NOW);
    Danubra.user = { id: 'u1', email: ME.email };
    Danubra.me = ME; Danubra.members = DATA.members;
    Danubra.cfgRow = DATA.settings[0];
    document.getElementById('login-screen').hidden = true; document.getElementById('app').hidden = false;
    Danubra._buildNav();
    Kal.paintBadge();
  }, { DATA, ME, NOW });
}
const go = async (page, route) => {
  await page.evaluate(async (route) => { location.hash = `#/${route}`; await new Promise(r => setTimeout(r, 30)); await Danubra._routeReady; }, route);
  await page.waitForTimeout(200);
};

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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const chyby = [];
  page.on('pageerror', e => chyby.push(e.message));
  await boot(page, port);

  console.log('KW v hornom pruhu');
  const badge = () => page.evaluate(() => { const b = document.getElementById('kw-badge'); return { text: b.textContent.trim(), title: b.title, vis: !!b.offsetParent }; });
  let b = await badge();
  ok(b.text === 'KW 45' && b.vis, 'v hornom pruhu je „KW 45" (streda 4. 11. 2026)', JSON.stringify(b));
  ok(b.title.startsWith('Kalendárny týždeň 45 · 2.–8. 11. 2026'), 'bublinka: Kalendárny týždeň 45 · 2.–8. 11. 2026', b.title);
  await page.evaluate(() => { Kal.clock = () => new Date('2026-12-31T12:00:00Z'); Kal.paintBadge(); });
  b = await badge();
  ok(b.text === 'KW 53' && /28\. 12\. 2026–3\. 1\. 2027/.test(b.title), '31. 12. 2026 je KW 53 (rozsah cez prelom roka)', JSON.stringify(b));
  await page.evaluate(() => { Kal.clock = () => new Date('2025-12-28T23:30:00Z'); Kal.paintBadge(); });
  b = await badge();
  ok(b.text === 'KW 1', 'o pol jednej v noci 29. 12. 2025 v Bratislave je už KW 1/2026', JSON.stringify(b));
  await page.evaluate((NOW) => { Kal.clock = () => new Date(NOW); Kal.paintBadge(); }, NOW);
  await page.click('#kw-badge');
  await page.waitForTimeout(400);
  const r1 = await page.evaluate(() => ({ route: Danubra.route, week: document.querySelectorAll('.kal-week .kal-day').length,
    title: (document.querySelector('.kal-title') || {}).textContent || '', tab: !!document.querySelector('.subtab.active[data-key="kalendar"]'),
    sub: (document.querySelector('.page-sub') || {}).textContent || '' }));
  ok(r1.route === 'kalendar' && r1.week === 7, 'klik na KW otvorí Kalendár — týždeň so siedmimi dňami', JSON.stringify(r1));
  ok(/KW 45 · 2\.–8\. 11\. 2026/.test(r1.title) && /KW 45/.test(r1.sub), 'nadpis týždňa „KW 45 · 2.–8. 11. 2026"', r1.title);
  ok(r1.tab, 'Kalendár je záložka Prehľadu dňa');
  const names = await page.evaluate(() => ({ side: Danubra.itemLabelOf('kalendar'), tabs: Danubra.tabsOf('dashboard').map(t => t[0]),
    mega: Danubra.megaHtml().split('<b>Kalendár</b>').length - 1 }));
  ok(names.side === 'Kalendár' && names.tabs[1] === 'tasks' && names.tabs[2] === 'kalendar' && names.mega === 1, 'to isté meno v menu, záložke aj mega menu, hneď za Úlohami', JSON.stringify(names));

  console.log('\nTýždeň: položky');
  const day = (d) => page.evaluate((d) => [...document.querySelectorAll(`.kal-day[data-date="${d}"] .kal-it`)].map(e => e.dataset.key), d);
  ok((await day('2026-11-05')).includes('task:t1'), 'úloha na štvrtok');
  ok((await day('2026-11-04')).includes('event:e1') && (await day('2026-11-04')).includes('job:start:s1') === false, 'udalosť (obhliadka) v stredu');
  ok((await day('2026-11-02')).includes('job:start:s1'), 'začiatok zákazky');
  const fri = await day('2026-11-06');
  ok(fri.includes('task:t3') && fri.includes('activity:a1') && fri.includes('invoice:i1'), 'piatok: pripomienka 9:30, poznámka s termínom, splatnosť faktúry', fri.join());
  ok((await day('2026-11-07')).includes('lead:l2') && (await day('2026-11-08')).includes('doc:d1'), 'ďalší krok s firmou a končiace A1');
  const late = await page.evaluate(() => ({ t2: !!document.querySelector('.kal-it.is-late[data-key="task:t2"]'), done: !!document.querySelector('[data-key="task:t4"]'),
    note: (document.querySelector('.kal-late') || {}).textContent || '' }));
  ok(late.t2 && !late.done, 'po termíne je zvýraznené, hotové je skryté');
  ok(/1\s+úloha je\s+po termíne z minulých dní/.test(late.note.replace(/\s+/g, ' ')), 'úloha po termíne spred zobrazeného týždňa je v upozornení (tá z tohto týždňa je v ňom)', late.note);
  const rem = await page.evaluate(() => { const e = document.querySelector('[data-key="task:t3"]'); return { cls: e.className, time: (e.querySelector('time') || {}).textContent }; });
  ok(/l-reminders/.test(rem.cls) && rem.time === '09:30', 'úloha s časom je pripomienka s časom', JSON.stringify(rem));
  await page.click('.kal-tog[aria-pressed="false"]:has-text("Hotové")');
  ok(await page.evaluate(() => !!document.querySelector('.kal-it.is-done[data-key="task:t4"]')), '„Hotové" ukáže aj hotové (prečiarknuté)');
  await page.click('.kal-tog:has-text("Hotové")');

  console.log('\nŤahanie úlohy na iný deň');
  ok(await page.evaluate(() => document.querySelector('[data-key="task:t1"]').getAttribute('draggable') === 'true'
    && !document.querySelector('[data-key="event:e1"]').hasAttribute('draggable')), 'úloha sa dá ťahať, udalosť a termíny nie');
  await page.dragAndDrop('.kal-it[data-key="task:t1"]', '.kal-day[data-date="2026-11-06"] .kal-dh');
  await page.waitForTimeout(250);
  let upd = await page.evaluate(() => window.__upd.filter(u => u.t === 'tasks'));
  ok(upd.length === 1 && upd[0].id === 't1' && upd[0].patch.due_date === '2026-11-06', 'pustenie na piatok zmení termín úlohy (DB.update)', JSON.stringify(upd));
  ok((await day('2026-11-06')).includes('task:t1') && !(await day('2026-11-05')).includes('task:t1'), 'úloha je hneď v piatku');
  const hist = await page.evaluate(() => window.__ins.filter(i => i.t === 'activities').map(i => i.row.body));
  ok(hist.some(h => /Presunutá v kalendári na/.test(h)), 'presunutie sa zapíše do histórie úlohy', hist.join());
  await page.click('#toast button');
  await page.waitForTimeout(200);
  upd = await page.evaluate(() => window.__upd.filter(u => u.t === 'tasks'));
  ok(upd.length === 2 && upd[1].patch.due_date === '2026-11-05' && (await day('2026-11-05')).includes('task:t1'), '„Vrátiť" v hláške vráti termín');

  console.log('\nOtvorenie zdroja');
  await page.click('.kal-it[data-key="task:t1"]');
  await page.waitForTimeout(250);
  const md = await page.evaluate(() => ({ title: (document.querySelector('#ui-modal h3') || {}).textContent || '',
    cal: !!document.querySelector('#ui-modal button[onclick*="Tsk.toCalendar"]') }));
  ok(md.title === 'Zavolať Bauleiterovi Müller' && md.cal, 'klik na úlohu otvorí detail úlohy, v ňom „Pridať do kalendára"', JSON.stringify(md));
  await page.click('#ui-modal button[onclick*="Tsk.toCalendar"]');
  await page.waitForTimeout(200);
  const pre = await page.evaluate(() => { const f = document.getElementById('kal-ev-form'); return f ? { title: f.title.value, day: f.starts_on.value,
    type: f.entity_type.value, label: f.entity_label.value } : null; });
  ok(pre && pre.title === 'Zavolať Bauleiterovi Müller' && pre.day === '2026-11-05' && pre.type === 'lead' && pre.label === 'Müller Bau GmbH',
    'z úlohy sa otvorí nová udalosť s rovnakým dňom a firmou', JSON.stringify(pre));
  await page.evaluate(() => UI.closeModal());
  await page.click('.kal-it[data-key="event:e1"]');
  await page.waitForTimeout(250);
  const ed = await page.evaluate(() => (document.querySelector('#ui-modal .kal-detail') || {}).textContent || '');
  ok(/Obhliadka stavby/.test(ed) && /10:00–12:00/.test(ed) && /Ulm/.test(ed) && /Štefan Varga/.test(ed), 'klik na udalosť: druh, čas, miesto, účastníci', ed.replace(/\s+/g, ' '));
  await page.evaluate(() => UI.closeModal());

  console.log('\nVrstvy a Len moje');
  const lay = await page.evaluate(() => [...document.querySelectorAll('.kal-lay')].map(b => `${b.dataset.layer}=${b.querySelector('em').textContent}`));
  ok(lay.join() === 'tasks=2,reminders=1,events=1,notes=2,docs=1,jobs=1,invoices=1', 'prepínače vrstiev s počtami', lay.join());
  await page.click('.kal-lay[data-layer="docs"]');
  ok(!(await day('2026-11-08')).includes('doc:d1'), 'vypnutá vrstva (doklady) zmizne');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('danubra_kal_u1') || '{}'));
  ok(saved.layers && saved.layers.docs === false, 'voľba sa pamätá pre používateľa (localStorage)', JSON.stringify(saved));
  await page.evaluate(async () => { Kal._prefsFor = null; Kal.layers = null; await Danubra.renderRoute(); });
  ok(!(await day('2026-11-08')).includes('doc:d1') && await page.evaluate(() => Kal.layers.docs === false), 'a platí aj po novom otvorení');
  await page.click('.kal-lay[data-layer="docs"]');
  await page.click('.kal-tog:has-text("Len moje")');
  ok(!(await day('2026-11-03')).includes('task:t2') && (await day('2026-11-05')).includes('task:t1') && (await day('2026-11-08')).includes('doc:d1'),
    'Len moje: cudzia úloha zmizne, moja a termíny ostanú');
  await page.click('.kal-tog:has-text("Len moje")');
  await page.selectOption('.kal-sel select', 'm2');
  ok((await day('2026-11-03')).includes('task:t2') && !(await day('2026-11-05')).includes('task:t1'), 'filter kolegu: úlohy Jany');
  await page.selectOption('.kal-sel select', '');

  console.log('\nŠípky, Mesiac a Agenda');
  await page.click('.kal-arrow[aria-label="Ďalší týždeň"]');
  await page.waitForTimeout(250);
  const nx = await page.evaluate(() => ({ t: document.querySelector('.kal-title').textContent, e2: !!document.querySelector('.kal-day[data-date="2026-11-09"] [data-key="event:e2"]') }));
  ok(/KW 46 · 9\.–15\. 11\. 2026/.test(nx.t) && nx.e2, 'šípka: KW 46 a v ňom celodenné školenie', JSON.stringify(nx));
  await page.click('.btn:has-text("Dnes")');
  await page.waitForTimeout(250);
  ok(/KW 45/.test(await page.textContent('.kal-title')), '„Dnes" vráti na tento týždeň');
  await page.click('.kal-mode[data-mode="month"]');
  await page.waitForTimeout(250);
  const mo = await page.evaluate(() => ({ kw: [...document.querySelectorAll('.kal-kw')].map(b => b.textContent), title: document.querySelector('.kal-title').textContent,
    cell: [...document.querySelectorAll('.kal-cell[data-date="2026-11-06"] .kal-it')].length, today: !!document.querySelector('.kal-cell.is-today[data-date="2026-11-04"]') }));
  ok(mo.kw.join() === '44,45,46,47,48,49' && /November 2026/.test(mo.title), 'Mesiac: november 2026 s KW 44–49 v ľavom stĺpci', JSON.stringify(mo));
  ok(mo.cell === 3 && mo.today, 'v bunke najviac tri položky, dnešok je označený', JSON.stringify(mo));
  ok(await page.evaluate(() => Math.max(...[...document.querySelectorAll('.kal-cell')].map(c => c.querySelectorAll('.kal-it').length)) <= 3),
    'žiadna bunka nemá viac než tri položky (zvyšok je „+N ďalšie")');
  await page.click('.kal-kw:has-text("46")');
  await page.waitForTimeout(250);
  ok(/KW 46/.test(await page.textContent('.kal-title')) && await page.evaluate(() => Kal.mode === 'week'), 'klik na číslo KW otvorí ten týždeň');
  await page.click('.kal-mode[data-mode="agenda"]');
  await page.waitForTimeout(250);
  const ag = await page.evaluate(() => ({ heads: [...document.querySelectorAll('.kal-awh')].map(h => h.textContent.replace(/\s+/g, ' ').trim()),
    first: (document.querySelector('.kal-ad') || {}).dataset ? document.querySelector('.kal-ad').dataset.date : '' }));
  ok(ag.heads[0] === 'KW 45 · 2.–8. 11. 2026' && ag.heads.some(h => h.startsWith('KW 46')) && ag.first === '2026-11-04', 'Agenda po KW od dneška', JSON.stringify(ag));

  console.log('\nNová udalosť s pripomienkou');
  await page.click('.kal-mode[data-mode="week"]');
  await page.waitForTimeout(250);
  await page.click('.kal-day[data-date="2026-11-05"]', { position: { x: 40, y: 380 } });
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.getElementById('kal-add-date') && document.getElementById('kal-add-date').value === '2026-11-05'
    && document.querySelectorAll('.kal-addt').length === 3), 'klik na prázdne miesto dňa ponúkne Udalosť / Úlohu / Pripomienku s dňom');
  await page.click('.kal-addt[data-add="event"]');
  await page.waitForTimeout(150);
  await page.fill('#kal-ev-form [name=title]', 'Stretnutie s Bauleiterom Müller');
  await page.fill('#kal-ev-form [name=start_time]', '10:00');
  await page.fill('#kal-ev-form [name=end_time]', '11:00');
  await page.fill('#kal-ev-form [name=place]', 'Ulm, Baustelle');
  await page.selectOption('#kal-ev-form [name=remind_minutes]', '30');
  await page.check('#kal-ev-form input[name=participants][value="m2"]');
  await page.click('#kal-ev-form button[type=submit]');
  await page.waitForTimeout(400);
  const ins = await page.evaluate(() => window.__ins);
  const ev = ins.find(i => i.t === 'events');
  ok(ev && ev.row.starts_on === '2026-11-05' && ev.row.start_time === '10:00' && ev.row.end_time === '11:00' && ev.row.kind === 'meeting'
    && ev.row.remind_minutes === 30 && ev.row.participants.slice().sort().join() === 'm1,m2' && ev.row.all_day === false, 'udalosť sa zapíše do events', JSON.stringify(ev));
  const rt = ins.find(i => i.t === 'tasks' && i.row.source === 'event');
  ok(rt && rt.row.due_date === '2026-11-05' && rt.row.due_time === '09:30' && rt.row.entity_type === 'event' && rt.row.entity_id === ev.row.id
    && rt.row.assigned_to === 'u1' && /Pripomienka: Stretnutie s Bauleiterom Müller/.test(rt.row.title), 'pripomienka 30 min pred = úloha v Úlohách (pre mňa)', JSON.stringify(rt));
  const link = await page.evaluate(() => window.__upd.find(u => u.t === 'events'));
  ok(link && link.patch.reminder_task_id === rt.row.id, 'udalosť si pamätá úlohu s pripomienkou');
  const thu = await day('2026-11-05');
  ok(thu.includes(`event:${ev.row.id}`) && thu.includes(`task:${rt.row.id}`), 'v kalendári je udalosť aj pripomienka', thu.join());
  // Úprava času → tá istá úloha sa posunie, nová nevznikne.
  await page.evaluate((id) => Kal.eventForm(null, id), ev.row.id);
  await page.waitForTimeout(150);
  await page.fill('#kal-ev-form [name=start_time]', '14:00');
  await page.fill('#kal-ev-form [name=end_time]', '15:00');
  await page.click('#kal-ev-form button[type=submit]');
  await page.waitForTimeout(350);
  const after = await page.evaluate((rid) => ({ n: window.__ins.filter(i => i.t === 'tasks' && i.row.source === 'event').length,
    u: window.__upd.filter(u => u.t === 'tasks' && u.id === rid).pop() }), rt.row.id);
  ok(after.n === 1 && after.u && after.u.patch.due_time === '13:30', 'zmena času posunie tú istú pripomienku', JSON.stringify(after));
  // Bez názvu sa neuloží.
  await page.evaluate(() => Kal.eventForm({ starts_on: '2026-11-06' }));
  await page.click('#kal-ev-form button[type=submit]');
  ok(await page.evaluate(() => !!document.getElementById('kal-ev-form')), 'bez názvu sa formulár nezavrie');
  await page.evaluate(() => UI.closeModal());

  console.log('\nPripomienka a úloha z „Pridať"');
  await page.evaluate(() => Kal.addMenu('2026-11-06'));
  await page.click('.kal-addt[data-add="reminder"]');
  await page.fill('#kal-rem-form [name=title]', 'Zavolať Huberovi');
  await page.fill('#kal-rem-form [name=due_time]', '08:15');
  await page.click('#kal-rem-form button[type=submit]');
  await page.waitForTimeout(350);
  const rr = await page.evaluate(() => window.__ins.filter(i => i.t === 'tasks' && i.row.source === 'reminder').pop());
  ok(rr && rr.row.due_date === '2026-11-06' && rr.row.due_time === '08:15' && rr.row.assigned_to === 'u1', 'pripomienka = úloha s časom', JSON.stringify(rr));
  await page.evaluate(() => Kal.addMenu('2026-11-07'));
  await page.click('.kal-addt[data-add="task"]');
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.querySelector('#tsk-form [name=due_date]').value === '2026-11-07'), '„Úloha" otvorí formulár úlohy s dňom');
  await page.evaluate(() => UI.closeModal());

  console.log('\nKontakt s firmou: „Stretnutie dohodnuté"');
  const lc = await page.evaluate(async () => {
    const el = document.createElement('div');
    document.getElementById('view').appendChild(el);
    const lead = { id: 'l1', name: 'Müller Bau GmbH', city: 'Ulm', postal_code: '89073', status: 'contacted', phone: '+49 731 1' };
    const h = await LeadContacts.mount(el, lead);
    const i = h._inst;
    i.open('call', 'meeting_set');
    const f = el.querySelector('[data-lc-form]');
    f.querySelector('[name=summary]').value = 'Hr. Müller: Termin vor Ort, Donnerstag';
    f.querySelector('[name=contact_name]').value = 'Hans Müller';
    f.querySelector('[name=next_step_at]').value = '2026-11-12';
    f.querySelector('[name=next_step_text]').value = 'Stretnutie na stavbe';
    await i.save();
    const offer = el.querySelector('.lc-meet');
    const txt = offer ? offer.textContent.replace(/\s+/g, ' ') : '';
    if (offer) offer.querySelector('[data-lc-a="meetcal"]').click();
    await new Promise(r => setTimeout(r, 150));
    const ff = document.getElementById('kal-ev-form');
    const out = { txt, form: ff ? { title: ff.title.value, day: ff.starts_on.value, type: ff.entity_type.value, label: ff.entity_label.value,
      place: ff.place.value, rem: ff.remind_minutes.value, desc: ff.description.value } : null };
    UI.closeModal(); el.remove();
    return out;
  });
  ok(/Stretnutie dohodnuté/.test(lc.txt) && /Zapísať stretnutie do kalendára/.test(lc.txt), 'po uložení ponuka „Zapísať stretnutie do kalendára"', lc.txt);
  ok(lc.form && lc.form.title === 'Stretnutie: Müller Bau GmbH' && lc.form.day === '2026-11-12' && lc.form.type === 'lead'
    && lc.form.label === 'Müller Bau GmbH' && /Ulm/.test(lc.form.place) && lc.form.rem === '60' && /Hans Müller/.test(lc.form.desc),
  'otvorí udalosť: firma, deň stretnutia, miesto, kontakt, pripomienka hodinu vopred', JSON.stringify(lc.form));

  console.log('\nÚlohy a Prehľad dňa');
  await go(page, 'tasks');
  ok(await page.evaluate(() => [...document.querySelectorAll('#topbar-actions button')].some(x => /V kalendári/.test(x.textContent))), 'Úlohy majú „V kalendári"');
  const dash = await page.evaluate(async () => {
    const box = document.createElement('div');
    box.innerHTML = Kal.dashHtml();
    document.body.appendChild(box);
    await Kal.fillDash();
    const t = box.textContent.replace(/\s+/g, ' ');
    box.remove();
    return t;
  });
  ok(/Tento týždeň \(KW 45\)/.test(dash) && /dnes/.test(dash) && /Otvoriť kalendár/.test(dash), 'Prehľad dňa: „Tento týždeň (KW 45)" s počtami a odkazom', dash);

  ok(!chyby.length, 'bez chýb v prehliadači', chyby.join(' | '));
  await page.close();

  console.log('\nMobil 390 px');
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mob.on('pageerror', e => chyby.push(e.message));
  await boot(mob, port);
  const mb = await mob.evaluate(() => { const b = document.getElementById('kw-badge-m'); return { text: b.textContent.trim(), vis: !!b.offsetParent }; });
  ok(mb.text === 'KW 45' && mb.vis, 'na mobile je KW v hlavičke', JSON.stringify(mb));
  await mob.click('#kw-badge-m');
  await mob.waitForTimeout(400);
  const ml = await mob.evaluate(() => ({ rows: document.querySelectorAll('.kal-days .kal-dayrow').length, grid: !!document.querySelector('.kal-week'),
    move: !!document.querySelector('.kal-dayrow [data-key="task:t1"] .kal-mv'), drag: !!document.querySelector('.kal-days [draggable="true"]'),
    wide: document.documentElement.scrollWidth <= 392 }));
  ok(ml.rows === 7 && !ml.grid, 'týždeň je zoznam siedmich dní', JSON.stringify(ml));
  ok(ml.move && !ml.drag, 'úloha má „Presunúť" namiesto ťahania');
  ok(ml.wide, 'stránka sa nevalí do boku');
  await mob.evaluate(() => { window.UI.ask = async () => '2026-11-07'; });
  await mob.click('.kal-dayrow [data-key="task:t1"] .kal-mv');
  await mob.waitForTimeout(300);
  const mupd = await mob.evaluate(() => window.__upd.filter(u => u.t === 'tasks').pop());
  ok(mupd && mupd.id === 't1' && mupd.patch.due_date === '2026-11-07', '„Presunúť" zmení termín', JSON.stringify(mupd));
  await mob.evaluate(() => Kal.shift(1));
  await mob.waitForTimeout(250);
  ok(/KW 46/.test(await mob.textContent('.kal-title')), 'listovanie na ďalší týždeň');
  await mob.evaluate(() => Kal.setMode('month'));
  await mob.waitForTimeout(250);
  const mm = await mob.evaluate(() => ({ dots: document.querySelectorAll('.kal-cell .kal-dots').length, items: document.querySelectorAll('.kal-cell .kal-it').length,
    list: !!document.getElementById('kal-mday'), wide: document.documentElement.scrollWidth <= 392 }));
  ok(mm.dots > 0 && mm.items === 0 && mm.list && mm.wide, 'mesiac kompaktne: bodky namiesto položiek, zoznam dňa pod mriežkou', JSON.stringify(mm));
  await mob.click('.kal-cell[data-date="2026-11-06"]');
  ok(/piatok 6\. 11\./.test(await mob.textContent('#kal-mday')), 'ťuk na deň ukáže jeho položky pod mriežkou');
  ok(!chyby.length, 'bez chýb v prehliadači (mobil)', chyby.join(' | '));

  await browser.close();
  server.close();
  console.log(`\n${passed} prešlo, ${failed} padlo\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
