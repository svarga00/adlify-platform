// ============================================================================
// DANUBRA — SuperFaktúra v prehliadači: Nastavenia a Vydané faktúry
// Spustenie:  node app/tests/sf-ui.test.js
// ============================================================================
// Karta „SuperFaktúra" v Nastaveniach (SANDBOX / PRODUKCIA, Otestovať
// spojenie, mapovanie) a stav dokladu pri faktúre („V SuperFaktúre:
// vystavená / odoslaná / uhradená"). Serverová funkcia je podstrčená —
// test overuje, čo sa jej pošle a čo sa ukáže, nie SuperFaktúru.
//
// Samostatný súbor (nie browser.test.js), aby sa dal spustiť rýchlo sám.
// Bez playwright-core alebo Chromia sa preskočí.
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
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(REPO, rel);
      if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(''); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? '\n    ' + extra : ''}`); }
}

console.log('SuperFaktúra — rozhranie');

(async () => {
  const exe = findChromium();
  if (!exe) {
    console.log('Prehliadačový test preskočený — Chromium sa nenašiel.');
    console.log('\n0 prešlo, 0 padlo (preskočené)');
    process.exit(0);
  }
  const { server, port } = await serve();
  const url = `http://127.0.0.1:${port}/app/`;
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

  /** Stránka s podstrčenou databázou a serverovou funkciou. */
  const USAGE = { available: true, day: '2026-11-06', limit: 1000, hard_cap: 950, margin: 50, used: 123, remaining: 827,
    sync_used: 80, sync_budget: 300, sync_remaining: 220, write_used: 43, write_reserve: 100, blocked: false };
  async function open(role = 'admin', env = 'sandbox', usage = USAGE) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const chyby = [];
    page.on('pageerror', e => chyby.push(e.message));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await page.evaluate(({ role, env, usage }) => {
      const DATA = {
        partners: [{ id: 'p1', name: 'GU Ulm GmbH', country: 'DE', ust_idnr: 'DE287451936', email: 'bau@gu-ulm.de', invoice_language: 'de' }],
        invoices: [
          { id: 'i1', invoice_number: '2026042', partner_id: 'p1', status: 'sent', kind: 'invoice', issue_date: '2026-11-02', due_date: '2026-12-02',
            total: 8736, amount_net: 8736, vat_regime: 'reverse_charge', sf_invoice_id: 777, sf_number: '2026042', sf_environment: 'sandbox',
            sf_check: 'ok', sf_sent_at: '2026-11-03T08:00:00Z', sf_status: 'sent', sf_total: 8736, approved_at: '2026-11-02', approved_by: 'uid-0' },
          { id: 'i2', invoice_number: '2026043', partner_id: 'p1', status: 'approved', kind: 'invoice', issue_date: '2026-11-04', due_date: '2026-12-04',
            total: 1200, vat_regime: 'reverse_charge', approved_at: '2026-11-04T10:00:00Z', approved_by: 'uid-0' },
          { id: 'i3', invoice_number: '2026044', partner_id: 'p1', status: 'issued', kind: 'invoice', issue_date: '2026-11-05', due_date: '2026-12-05',
            total: 500, vat_regime: 'reverse_charge', sf_invoice_id: 778, sf_environment: 'sandbox', sf_check: 'mismatch',
            sf_check_note: 'Suma v SuperFaktúre je 600,00 €, v appke 500,00 €.', approved_at: '2026-11-05', approved_by: 'uid-0' },
        ],
        activities: [{ id: 'a1', entity_type: 'invoice', entity_id: 'i1', type: 'superfaktura', body: 'Faktúra 2026042 vystavená v SuperFaktúre (id 777, sandbox).',
          channel_meta: { ok: true }, created_at: '2026-11-02T09:00:00Z' }],
        subcontracts: [], periods: [], compliance: [], invoice_items: [], overrides: [], clients: [], orders: [], invoice_reminders: [], archive: [],
        settings: [{ id: 's1', supplier: { name: 'Partner und Service s. r. o.', iban: 'SK3112000000198742637541', address: 'Nové Zámky', company_id: '1' },
          superfaktura: {} }],
      };
      window.__T = { calls: [], updates: [], DATA };
      DB.list = async (t, o = {}) => {
        let r = (DATA[t] || []).map(x => ({ ...x }));
        for (const [k, v] of Object.entries(o.filters || {})) if (v != null) r = r.filter(x => x[k] === v);
        return { data: r, error: null };
      };
      DB.count = async () => 0;
      DB.getById = async (t, id) => ({ data: (DATA[t] || []).find(x => x.id === id) || null, error: null });
      DB.update = async (t, id, patch) => {
        __T.updates.push([t, id, patch]);
        const row = (DATA[t] || []).find(x => x.id === id); if (row) Object.assign(row, patch);
        return { data: row, error: null };
      };
      Danubra.loadCfg = async () => DATA.settings[0];
      const STATUS = { ok: true, environment: env, sandbox: env !== 'production',
        base: env === 'production' ? 'https://moja.superfaktura.sk' : 'https://sandbox.superfaktura.sk',
        configured: true, email_set: true, key_set: true, company_set: false, account: 's…@punds.eu', usage };
      window.fetch = async (u, o = {}) => {
        const b = o.body ? JSON.parse(o.body) : {};
        __T.calls.push(b);
        const R = (code, j) => new Response(JSON.stringify(j), { status: code, headers: { 'Content-Type': 'application/json' } });
        if (b.action === 'status') return R(200, STATUS);
        if (b.action === 'ping') return R(200, { ok: true, environment: env, company: 'Partner und Service s. r. o.', account: 's…@punds.eu' });
        if (b.action === 'sync') return R(200, { ok: true, checked: 2, paid: 1, partial: 0, mismatch: 0, errors: [], requests: 1, skipped_recent: 3 });
        if (b.action === 'issue') return R(200, { ok: true, sf_invoice_id: 901, check: 'ok' });
        if (b.action === 'cancel') return R(200, { ok: true, credit_note_id: 'cn1', invoice_number: '2026099' });
        return R(400, { error: 'Neznáma akcia.', hint: 'x' });
      };
      Danubra.user = { id: 'uid-0', email: 'stefan@punds.eu' };
      Danubra.me = { id: 'u0', user_id: 'uid-0', role, active: true, full_name: 'Štefan' };
      Danubra.members = [{ id: 'u0', user_id: 'uid-0', role, active: true }, { id: 'ux', user_id: 'uid-x', role: 'admin', active: true }];
      Danubra.cfgRow = DATA.settings[0];
      document.getElementById('login-screen').hidden = true; document.getElementById('app').hidden = false;
      Danubra._buildNav();
    }, { role, env, usage });
    return { page, chyby };
  }
  const txt = (page, sel) => page.evaluate((s) => { const n = document.querySelector(s); return n ? n.innerText.replace(/\s+/g, ' ') : ''; }, sel);

  try {
    // ── Nastavenia → SuperFaktúra ─────────────────────────────────────────
    {
      const { page, chyby } = await open('admin', 'sandbox');
      await page.evaluate(async () => { Cfg.loaded = false; Danubra.route = 'settings'; await Danubra.renderRoute(); });
      await page.waitForTimeout(400);
      const card = await txt(page, '#sf-card');
      ok(/SuperFaktúra/.test(card) && /SANDBOX/.test(card), 'v Nastaveniach je karta SuperFaktúra s odznakom SANDBOX', card.slice(0, 200));
      ok(/Skúšobný účet \(sandbox\)/.test(card) && /sandbox\.superfaktura\.sk/.test(card), 'stav: prostredie a adresa');
      ok(/API kľúč nastavené/i.test(card) && /s…@punds\.eu/i.test(card) && !/stefan@/.test(card), 'kľúč len „nastavené", e-mail skrátene', card.slice(0, 400));
      const lang = await page.$eval('#cfg-superfaktura [name=default_language]', el => el.value);
      const own = await page.$eval('#cfg-superfaktura [name=use_own_number]', el => el.checked);
      ok(lang === 'deu' && own, 'predvolene: doklad po nemecky (deu), číslo z appky');
      ok(/Dnes použité: 123 z 1000 \(synchronizácia 80 z 300\)/.test(card), 'počítadlo: Dnes použité: 123 z 1000 (synchronizácia 80 z 300)', card.slice(0, 600));
      const bar = await page.evaluate(() => { const b = document.querySelector('#sf-card .sf-usage-bar > span'); return b ? b.style.width : null; });
      ok(bar === '12%', 'a pásik podľa použitia (12 %)', String(bar));
      await page.click('#sf-ping');
      await page.waitForTimeout(300);
      const ping = await txt(page, '#sf-ping-out');
      ok(/Spojenie funguje/.test(ping) && /Partner und Service s\. r\. o\./.test(ping), 'Otestovať spojenie ukáže firmu v účte', ping);
      await page.selectOption('#cfg-superfaktura [name=default_language]', 'eng');
      await page.fill('#cfg-superfaktura [name=bank_account_id]', '12');
      await page.click('#cfg-superfaktura button[type=submit]');
      await page.waitForTimeout(300);
      const up = await page.evaluate(() => __T.updates.find(u => u[0] === 'settings'));
      ok(up && up[2].superfaktura && up[2].superfaktura.default_language === 'eng' && up[2].superfaktura.bank_account_id === 12
        && up[2].superfaktura.use_own_number === true, 'uloží sa do nastavení superfaktura (čísla ako čísla)', JSON.stringify(up && up[2]));
      const calls = await page.evaluate(() => __T.calls.map(c => c.action));
      ok(calls.includes('status') && calls.includes('ping'), 'stav aj test idú cez serverovú funkciu', calls.join(','));
      ok(calls.lastIndexOf('status') > calls.indexOf('ping'), 'po teste spojenia sa počítadlo načíta znova', calls.join(','));
      ok(chyby.length === 0, 'nič nespadne', chyby.join('; '));
      await page.close();
    }
    {
      const { page } = await open('admin', 'production');
      await page.evaluate(async () => { Cfg.loaded = false; Danubra.route = 'settings'; await Danubra.renderRoute(); });
      await page.waitForTimeout(400);
      const card = await txt(page, '#sf-card');
      ok(/PRODUKCIA/.test(card) && !/SANDBOX/.test(card), 'pri SF_ENV=production svieti PRODUKCIA', card.slice(0, 120));
      await page.close();
    }
    {
      const { page } = await open('accountant');
      await page.evaluate(async () => { Cfg.loaded = false; Danubra.route = 'settings'; await Danubra.renderRoute(); });
      await page.waitForTimeout(300);
      ok(!(await page.$('#sf-card')), 'nie-admin kartu SuperFaktúry nevidí');
      await page.close();
    }

    // ── Vydané faktúry: zoznam, detail, akcie ─────────────────────────────
    {
      const { page, chyby } = await open('admin', 'sandbox');
      await page.evaluate(async () => { Inv.loaded = false; Inv.v2.loaded = false; SFUI.status = null; Danubra.route = 'invoices'; await Danubra.renderRoute(); });
      await page.waitForTimeout(500);
      const akcie = await txt(page, '.sf-bar');
      ok(/SANDBOX/.test(akcie) && /Vystaviť schválené v SuperFaktúre \(1\)/.test(akcie) && /Synchronizovať so SuperFaktúrou/.test(akcie)
        && /1 nesúhlasí/.test(akcie), 'nad zoznamom: SANDBOX, Vystaviť schválené (1), Synchronizovať, počet nesúhlasiacich', akcie);
      const req = await page.evaluate(() => { const n = document.querySelector('.sf-bar .sf-req'); return n ? [n.textContent, n.getAttribute('data-tip')] : null; });
      ok(req && /dnes 123\/1000/.test(req[0]) && /Dnes zostáva 827 z 1000 požiadaviek na SuperFaktúru \(synchronizácia 220 z 300\)/.test(req[1]),
        'v páse: požiadavky dnes, zostatok v tooltipe', JSON.stringify(req));
      const syncOff = await page.evaluate(() => { const b = document.querySelector('.sf-bar .sf-sync-btn'); return b ? b.disabled : null; });
      ok(syncOff === false, 'synchronizácia je zapnutá, kým má rozpočet');
      const zoznam = await txt(page, '#dl-faktury');
      ok(/SF · sandbox/.test(zoznam) && /SF · nesúhlasí/.test(zoznam), 'v zozname značka SF (a nesúhlasí)', zoznam.slice(0, 300));

      await page.evaluate(() => Inv.detail('i1'));
      await page.waitForTimeout(400);
      const d = await txt(page, '#ui-modal');
      ok(/V SuperFaktúre:/.test(d) && /vystavená/.test(d) && /odoslaná/.test(d) && /SANDBOX/.test(d), 'detail: V SuperFaktúre: vystavená, odoslaná, SANDBOX', d.slice(0, 600));
      ok(/Stiahnuť PDF zo SuperFaktúry/.test(d) && /Synchronizovať/.test(d) && /Stornovať dobropisom/.test(d), 'tlačidlá PDF, Synchronizovať, Stornovať dobropisom');
      ok(/História v SuperFaktúre \(1\)/.test(d), 'história zo SuperFaktúry pri faktúre');

      await page.evaluate(() => Inv.detail('i3'));
      await page.waitForTimeout(300);
      const m = await txt(page, '#ui-modal');
      ok(/nesúhlasí so SuperFaktúrou/.test(m) && /600,00/.test(m), 'nesúhlasiaca faktúra je červeno označená aj s dôvodom', m.slice(0, 400));
      const send = await page.evaluate(() => { const b = [...document.querySelectorAll('#ui-modal .modal-actions button')].find(x => /Odoslať/.test(x.textContent)); return b ? b.disabled : null; });
      ok(send === true, 'a „Odoslať odberateľovi" je vypnuté');

      // Dobropis: dôvod je povinný.
      await page.evaluate(() => SFUI.cancelForm('i1'));
      await page.fill('#sf-cancel [name=reason]', 'krátko');
      await page.evaluate(() => SFUI.cancel('i1'));
      await page.waitForTimeout(150);
      let n = await page.evaluate(() => __T.calls.filter(c => c.action === 'cancel').length);
      ok(n === 0, 'krátky dôvod → dobropis sa nepýta');
      await page.fill('#sf-cancel [name=reason]', 'Faktúra na nesprávnu zákazku');
      await page.evaluate(() => SFUI.cancel('i1'));
      await page.waitForTimeout(300);
      const c = await page.evaluate(() => __T.calls.find(x => x.action === 'cancel'));
      ok(c && c.invoice_id === 'i1' && c.reason === 'Faktúra na nesprávnu zákazku', 'dobropis s dôvodom ide na server');

      // Hromadne: len schválené, každá zvlášť.
      await page.evaluate(() => SFUI.bulkIssue());
      await page.waitForTimeout(200);
      const bulk = await txt(page, '#ui-modal');
      ok(/2026043/.test(bulk) && !/2026042/.test(bulk) && /schválená administrátorom/.test(bulk), 'hromadné vystavenie ponúkne len schválenú', bulk.slice(0, 300));
      await page.evaluate(() => SFUI.runBulk());
      await page.waitForTimeout(400);
      const iss = await page.evaluate(() => __T.calls.filter(x => x.action === 'issue').map(x => x.invoice_id));
      ok(JSON.stringify(iss) === '["i2"]', 'vystaví sa po jednej cez server (ten overí schválenie)', JSON.stringify(iss));
      ok(/Vystavené 1 z 1/.test(await txt(page, '#ui-modal')), 'a povie výsledok');

      await page.evaluate(() => SFUI.sync());
      await page.waitForTimeout(300);
      const sync = await page.evaluate(() => __T.calls.filter(x => x.action === 'sync'));
      ok(sync.length === 1 && !sync[0].invoice_id, 'Synchronizovať so SuperFaktúrou = všetky naraz');
      const statusPo = await page.evaluate(() => __T.calls.map(c => c.action).lastIndexOf('status') > __T.calls.map(c => c.action).lastIndexOf('sync'));
      ok(statusPo, 'po synchronizácii sa počítadlo načíta znova');
      ok(chyby.length === 0, 'nič nespadne', chyby.join('; '));
      await page.close();
    }
    {
      // Rozpočet synchronizácie je na dnes minutý: tlačidlá vypnuté s vysvetlením.
      const { page, chyby } = await open('admin', 'sandbox', { ...USAGE, used: 380, remaining: 570, sync_used: 300, sync_remaining: 0 });
      await page.evaluate(async () => { Inv.loaded = false; Inv.v2.loaded = false; SFUI.status = null; Danubra.route = 'invoices'; await Danubra.renderRoute(); });
      await page.waitForTimeout(500);
      const b = await page.evaluate(() => { const x = document.querySelector('.sf-bar .sf-sync-btn'); return x ? [x.disabled, x.parentElement.innerHTML] : null; });
      ok(b && b[0] === true && /Synchronizácia je na dnes vyčerpaná \(300 z 300 požiadaviek\)/.test(b[1]) && /vyhradenú rezervu/.test(b[1]),
        'vyčerpaná synchronizácia: „Synchronizovať so SuperFaktúrou" vypnuté a vysvetlené', b && b[1].slice(0, 300));
      const tip = await page.evaluate(() => { const n = document.querySelector('.sf-bar .sf-req'); return n ? n.getAttribute('data-tip') : ''; });
      ok(/Dnes zostáva 570 z 1000/.test(tip) && /synchronizácia 0 z 300/.test(tip), 'tooltip: zostáva 570, synchronizácia 0', tip);
      await page.evaluate(() => Inv.detail('i1'));
      await page.waitForTimeout(300);
      const d = await page.evaluate(() => { const x = document.querySelector('#ui-modal .sf-panel .sf-sync-btn'); return x ? x.disabled : null; });
      ok(d === true, 'aj v detaile faktúry je „Synchronizovať" vypnuté');
      const iss = await page.evaluate(() => { const x = [...document.querySelectorAll('.sf-bar button')].find(y => /Vystaviť schválené/.test(y.textContent)); return x ? x.disabled : null; });
      ok(iss === false, 'vystavovanie zostáva zapnuté (má rezervu)');
      await page.evaluate(async () => { Cfg.loaded = false; Danubra.route = 'settings'; await Danubra.renderRoute(); });
      await page.waitForTimeout(400);
      const card = await txt(page, '#sf-card');
      ok(/Dnes použité: 380 z 1000 \(synchronizácia 300 z 300\)/.test(card) && /pokračuje zajtra/i.test(card), 'v Nastaveniach: 380 z 1000 a že synchronizácia pokračuje zajtra', card.slice(0, 700));
      ok(chyby.length === 0, 'nič nespadne', chyby.join('; '));
      await page.close();
    }
    {
      const { page } = await open('accountant');
      await page.evaluate(async () => { Inv.loaded = false; Inv.v2.loaded = false; Danubra.route = 'invoices'; await Danubra.renderRoute(); await Inv.detail('i2'); });
      await page.waitForTimeout(300);
      const b = await page.evaluate(() => { const x = [...document.querySelectorAll('#ui-modal .modal-actions button')].find(y => /Vystaviť v SuperFaktúre/.test(y.textContent)); return x ? x.disabled : null; });
      ok(b === true, 'nie-admin: „Vystaviť v SuperFaktúre" je vypnuté');
      const akcie = await txt(page, '.sf-bar');
      ok(!/Vystaviť schválené/.test(akcie) && /Synchronizovať/.test(akcie), 'a hromadné vystavenie nevidí (synchronizovať áno)', akcie);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${passed} prešlo, ${failed} padlo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log(`  ✗ test spadol: ${e.message}`);
  console.log('\n0 prešlo, 1 padlo');
  process.exit(1);
});
