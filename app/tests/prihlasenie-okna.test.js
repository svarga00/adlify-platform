// ============================================================================
// DANUBRA — prihlásenie v prehliadači: Zabudli ste heslo, Nastavte si heslo,
// Používatelia → stav prihlásenia a pozvánka
// Spustenie:  node app/tests/prihlasenie-okna.test.js
// (SHOT_DIR=/cesta uloží snímky obrazoviek)
// ============================================================================
// Supabase Auth je podvrhnutý cez page.route (skutočná supabase-js z vendor/,
// takže sa overí aj čítanie prihlásenia z adresy po návrate zo Supabase).
//   * prihlasovacia stránka: „Zabudli ste heslo?" → resetPasswordForEmail
//     s návratom /app/?heslo=1, vždy tá istá veta (nič neprezradí),
//   * /app/?heslo=1#k=… : heslo 2×, nezhodujú sa, krátke, úspech → verifyOtp
//     + updateUser; vypršaný kód aj chyba v adrese → „Odkaz vypršal…",
//   * návrat zo Supabase s #access_token=…&type=recovery → formulár s e-mailom,
//   * Používatelia: stĺpec Prihlásenie, Pozvať do appky → okno s odkazom,
//     Kopírovať, WhatsApp, Poslať e-mailom; Uložiť a pozvať.
// Bez playwright-core alebo Chromia sa preskočí.
// ============================================================================
const fs = require('fs');
const path = require('path');
const http = require('http');

const REPO = path.join(__dirname, '..', '..');
let chromium;
try { chromium = require('playwright-core').chromium; } catch {
  console.log('Prehliadačový test preskočený — playwright-core nie je nainštalovaný.\n\n0 prešlo, 0 padlo (preskočené)');
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
      if (rel === '/' || rel === '/app') { res.writeHead(301, { Location: '/app/' }); return res.end(); }
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(REPO, rel);
      if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('nenájdené'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}
const shot = (page, name) => (process.env.SHOT_DIR
  ? page.screenshot({ path: path.join(process.env.SHOT_DIR, name) }).catch(() => null) : Promise.resolve());

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'auth-j', email: 'jana@punds.eu', role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.podpis`;
const USER = { id: 'auth-j', aud: 'authenticated', role: 'authenticated', email: 'jana@punds.eu', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-11-01T00:00:00Z' };
const SESSION = { access_token: JWT, refresh_token: 'rt-1', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: USER };

/** Podvrhnutý Supabase: Auth podľa `mode`, REST vždy prázdny. Zapisuje, čo prišlo. */
async function fakeSupabase(page, st) {
  await page.route(/^https:\/\/[a-z0-9]+\.supabase\.co\//, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const body = req.postData() ? (() => { try { return JSON.parse(req.postData()); } catch (e) { return req.postData(); } })() : null;
    st.calls.push({ method: req.method(), path: u.pathname, query: Object.fromEntries(u.searchParams), body });
    const json = (status, o) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname === '/auth/v1/recover') {
      return st.recover === 'rate' ? json(429, { code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' }) : json(200, {});
    }
    if (u.pathname === '/auth/v1/verify') {
      return st.verify === 'expired' ? json(403, { code: 'otp_expired', error_code: 'otp_expired', msg: 'Email link is invalid or has expired' }) : json(200, SESSION);
    }
    if (u.pathname === '/auth/v1/user') {
      if (req.method() === 'PUT') return json(200, { ...USER, user_metadata: (body && body.data) || {} });
      return json(200, USER);
    }
    if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, body: '' });
    if (u.pathname.startsWith('/rest/v1/')) return json(200, []);
    return json(404, {});
  });
}

(async () => {
  const exe = findChromium();
  if (!exe) { console.log('Prehliadačový test preskočený — Chromium sa nenašiel.\n\n0 prešlo, 0 padlo (preskočené)'); process.exit(0); }
  const { server, port } = await serve();
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    console.log('Zabudli ste heslo?');
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      const chyby = []; page.on('pageerror', e => chyby.push(e.message));
      const st = { calls: [] };
      await fakeSupabase(page, st);
      await page.goto(`${base}/app/`, { waitUntil: 'load' });
      await page.waitForSelector('#login-screen:not([hidden])');
      ok(await page.isVisible('#login-forgot') && /Zabudli ste heslo\?/.test(await page.textContent('#login-forgot')), 'na prihlasovacej stránke je „Zabudli ste heslo?"');
      await page.fill('#login-email', 'jana@punds.eu');
      await page.click('#login-forgot');
      ok(await page.isVisible('#forgot-form') && !(await page.isVisible('#login-form')), 'otvorí sa formulár na e-mail');
      ok((await page.inputValue('#forgot-email')) === 'jana@punds.eu', 'e-mail z prihlásenia sa prenesie');
      await page.click('#forgot-btn');
      await page.waitForSelector('#forgot-msg:not([hidden])');
      const rec = st.calls.find(c => c.path === '/auth/v1/recover');
      ok(rec && rec.body.email === 'jana@punds.eu' && rec.query.redirect_to === `${base}/app/?heslo=1`, 'resetPasswordForEmail s návratom na /app/?heslo=1', JSON.stringify(rec));
      const msg = await page.textContent('#forgot-msg');
      ok(/Ak je e-mail v appke, poslali sme odkaz na nastavenie hesla\./.test(msg), 'vždy tá istá veta (nič neprezradí)', msg);
      await shot(page, 'zabudnute-390.png');
      ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'na telefóne sa nevodorovne neposúva');
      st.recover = 'rate';
      await page.fill('#forgot-email', 'neznamy@firma.sk');
      await page.click('#forgot-btn');
      await page.waitForFunction(() => /niekoľko minút/.test(document.getElementById('forgot-msg').textContent));
      ok(true, 'pri limite odosielania: „skúste to o niekoľko minút"');
      await page.click('#forgot-back');
      ok(await page.isVisible('#login-form') && !(await page.isVisible('#forgot-form')), 'Späť na prihlásenie');
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.join('; '));
      await page.close();
    }

    console.log('\nNastavte si heslo (náš odkaz s kódom)');
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      const chyby = []; page.on('pageerror', e => chyby.push(e.message));
      const st = { calls: [] };
      await fakeSupabase(page, st);
      await page.goto(`${base}/app/?heslo=1#k=kod0123456789abcdef`, { waitUntil: 'load' });
      await page.waitForSelector('#heslo-form');
      ok(/Nastavte si heslo/.test(await page.textContent('#heslo-screen')), 'obrazovka „Nastavte si heslo" nad prihlásením');
      ok((await page.evaluate(() => location.hash)) === '', 'kód zmizne z adresy');
      ok(!st.calls.some(c => c.path === '/auth/v1/verify'), 'otvorenie stránky kód nespotrebuje');
      if (process.env.SHOT_DIR) await page.waitForTimeout(900);
      await shot(page, 'heslo-390.png');
      await page.evaluate(() => { window.__po = 0; Heslo.after = () => { window.__po++; }; });
      await page.fill('#heslo-1', 'modra-lavica-1');
      await page.fill('#heslo-2', 'modra-lavica-2');
      await page.click('#heslo-btn');
      ok(/nezhodujú/.test(await page.textContent('#heslo-error')), 'dve rôzne heslá: „nezhodujú sa"');
      await page.fill('#heslo-1', 'kratke'); await page.fill('#heslo-2', 'kratke');
      await page.click('#heslo-btn');
      ok(/aspoň 10 znakov/.test(await page.textContent('#heslo-error')), 'krátke heslo: „aspoň 10 znakov"');
      ok(!st.calls.some(c => c.path === '/auth/v1/verify' || c.method === 'PUT'), 'pri chybe sa nič neodoslalo');
      await page.check('#heslo-show');
      ok((await page.getAttribute('#heslo-1', 'type')) === 'text', 'Ukázať heslo');
      await page.fill('#heslo-1', 'modra-lavica-pri-Dunaji'); await page.fill('#heslo-2', 'modra-lavica-pri-Dunaji');
      await page.click('#heslo-btn');
      await page.waitForSelector('#heslo-done');
      const ver = st.calls.find(c => c.path === '/auth/v1/verify');
      const put = st.calls.find(c => c.path === '/auth/v1/user' && c.method === 'PUT');
      ok(ver && ver.body.token_hash === 'kod0123456789abcdef' && ver.body.type === 'recovery', 'kód sa overí až po kliknutí (verifyOtp, recovery)', JSON.stringify(ver && ver.body));
      ok(put && put.body.password === 'modra-lavica-pri-Dunaji' && put.body.data && put.body.data.danubra_password_set_at, 'updateUser s heslom a časom nastavenia', JSON.stringify(put && put.body));
      await page.waitForFunction(() => window.__po === 1);
      ok(true, 'potom sa pokračuje do appky');
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.join('; '));
      await page.close();
    }

    console.log('\nOdkaz vypršal');
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const st = { calls: [], verify: 'expired' };
      await fakeSupabase(page, st);
      await page.goto(`${base}/app/?heslo=1#k=stary0123456789abc`, { waitUntil: 'load' });
      await page.waitForSelector('#heslo-form');
      await page.fill('#heslo-1', 'modra-lavica-pri-Dunaji'); await page.fill('#heslo-2', 'modra-lavica-pri-Dunaji');
      await page.click('#heslo-btn');
      await page.waitForSelector('#heslo-expired');
      ok((await page.textContent('#heslo-expired')).trim() === 'Odkaz vypršal — požiadajte administrátora o nový.', 'vypršaný kód: „Odkaz vypršal — požiadajte administrátora o nový."');
      ok(!st.calls.some(c => c.method === 'PUT'), 'heslo sa neukladá');
      await page.click('#heslo-login');
      ok(!(await page.$('#heslo-screen')) && await page.isVisible('#login-screen'), 'Späť na prihlásenie');
      await page.goto(`${base}/app/?heslo=1#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`, { waitUntil: 'load' });
      await page.waitForSelector('#heslo-expired');
      ok(true, 'chyba v adrese zo Supabase: rovnaká hláška');
      await page.close();
    }

    console.log('\nNávrat zo Supabase (Zabudli ste heslo)');
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
      const chyby = []; page.on('pageerror', e => chyby.push(e.message));
      const st = { calls: [] };
      await fakeSupabase(page, st);
      await page.goto(`${base}/app/?heslo=1#access_token=${JWT}&refresh_token=rt-1&expires_in=3600&expires_at=${SESSION.expires_at}&token_type=bearer&type=recovery`, { waitUntil: 'load' });
      await page.waitForSelector('#heslo-form', { timeout: 8000 });
      ok(/jana@punds\.eu/.test(await page.textContent('#heslo-screen')), 'supabase-js prečíta prihlásenie z adresy — formulár ukáže e-mail');
      await page.evaluate(() => { window.__po = 0; Heslo.after = () => { window.__po++; }; });
      await page.fill('#heslo-1', 'zelena-lavka-pri-Morave'); await page.fill('#heslo-2', 'zelena-lavka-pri-Morave');
      await page.click('#heslo-btn');
      await page.waitForSelector('#heslo-done');
      const put = st.calls.find(c => c.method === 'PUT');
      ok(put && put.body.password === 'zelena-lavka-pri-Morave' && !st.calls.some(c => c.path === '/auth/v1/verify'), 'rovno updateUser (bez overenia kódu)');
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.join('; '));
      await page.close();
    }

    console.log('\nPrihlásený, ale nie je v tíme');
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      const chyby = []; page.on('pageerror', e => chyby.push(e.message));
      const st = { calls: [] };
      await fakeSupabase(page, st);
      await page.goto(`${base}/app/`, { waitUntil: 'load' });
      await page.waitForSelector('#login-screen:not([hidden])');
      const r = await page.evaluate(async () => {
        const vis = (id) => { const e = document.getElementById(id); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; };
        const txt = (id) => (document.getElementById(id) || {}).textContent || '';
        const res = {};
        Danubra.user = { id: 'u-mt', email: 'm.turocziova@punds.sk' };
        Danubra.members = [{ id: 'm1', user_id: 'u-admin', role: 'admin', active: true }, { id: 'm2', user_id: null, email: 'm.turocziova@punds.sk', role: 'admin', active: true }];
        Danubra.me = null;
        Danubra._render();
        res.bez = { screen: vis('noaccess-screen'), app: vis('app'), login: vis('login-screen'), title: txt('noaccess-title'), text: txt('noaccess-text') };
        Danubra.members = [{ id: 'm1', user_id: 'u-admin', role: 'admin', active: true }, { id: 'm2', user_id: 'u-mt', role: 'custom', active: false }];
        Danubra._render();
        res.vypnuty = { screen: vis('noaccess-screen'), title: txt('noaccess-title') };
        Danubra.members = [];
        Danubra._render();
        res.prazdna = { screen: vis('noaccess-screen') };
        Danubra.members = [{ id: 'm2', user_id: 'u-mt', role: 'custom', active: true, modules: ['tasks'] }];
        Danubra.me = Danubra.members[0];
        Danubra._render();
        res.clen = { screen: vis('noaccess-screen'), app: !document.getElementById('app').hidden };
        Danubra.members = [{ id: 'm1', user_id: 'u-admin', role: 'admin', active: true }];
        Danubra.me = null;
        Danubra._render();
        return res;
      });
      ok(r.bez.screen && !r.bez.app && !r.bez.login, 'neprepojený účet: celá obrazovka so správou namiesto prázdnej appky', JSON.stringify(r.bez));
      ok(r.bez.title === 'Váš účet ešte nie je priradený k tímu.'
        && r.bez.text === 'Požiadajte administrátora, aby Vás pridal v Nastavenia → Používatelia (rovnaký e-mail: m.turocziova@punds.sk).',
      'text: „Váš účet ešte nie je priradený k tímu…" s e-mailom', `${r.bez.title} ${r.bez.text}`);
      ok(r.vypnuty.screen && /prístup do appky je vypnutý/.test(r.vypnuty.title), 'vypnutý človek: „Váš prístup do appky je vypnutý."');
      ok(!r.prazdna.screen, 'prázdna appka (nikto nie je založený) pustí prihláseného');
      ok(!r.clen.screen && r.clen.app, 'aktívny člen: appka, žiadna správa');
      if (process.env.SHOT_DIR) { await page.evaluate(() => Danubra._render()); await page.waitForTimeout(900); }
      await shot(page, 'nepriradeny-390.png');
      await page.click('#noaccess-logout');
      await page.waitForSelector('#login-screen:not([hidden])');
      ok(!(await page.$('#noaccess-screen')) && (await page.evaluate(() => Danubra.user === null)), 'Odhlásiť sa: späť na prihlásenie');
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.join('; '));
      await page.close();
    }

    console.log('\nPoužívatelia: stav prihlásenia a pozvánka');
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const chyby = []; page.on('pageerror', e => chyby.push(e.message));
      await page.route(/^https:\/\/[a-z0-9]+\.supabase\.co\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
      await page.goto(`${base}/app/`, { waitUntil: 'load' });
      await page.waitForTimeout(300);
      const out = await page.evaluate(async () => {
        const LINK = `${location.origin}/app/?heslo=1#k=abc0123456789def`;
        const DATA = {
          members: [
            { id: 'm1', user_id: 'u-admin', email: 'stefan@punds.eu', full_name: 'Štefan Varga', role: 'admin', active: true, created_at: '2026-01-01' },
            { id: 'm2', user_id: 'auth-j', email: 'jana@punds.eu', full_name: 'Jana Kováčová', role: 'custom', modules: ['tasks', 'marketing'], active: true, created_at: '2026-02-01' },
            { id: 'm3', user_id: null, email: 'peter@punds.eu', full_name: 'Peter Horák', role: 'custom', modules: ['tasks'], active: true, created_at: '2026-03-01' },
          ],
          mailboxes: [{ id: 'b1', name: 'Info', email: 'info@punds.eu', active: true }],
          settings: [{ id: 's1', supplier: { name: 'Partner und Service s. r. o.' } }],
        };
        const zapisy = [];
        DB.list = async (t) => ({ data: (DATA[t] || []).map(x => ({ ...x })), error: null });
        DB.count = async () => 0;
        DB.insert = async (t, row) => { zapisy.push(['insert', t, row]); const r = { ...row, id: 'm-new' }; DATA[t].push(r); return { data: r, error: null }; };
        const volania = [];
        window.fetch = async (u, o) => {
          const body = o && o.body ? JSON.parse(o.body) : null;
          volania.push([String(u), body]);
          const res = (x) => new Response(JSON.stringify(x), { status: 200, headers: { 'Content-Type': 'application/json' } });
          if (body && body.action === 'status') {
            return res({ ok: true, app_url: `${location.origin}/app/`, members: [
              { member_id: 'm1', has_account: true, linked: true, state: 'active', last_sign_in_at: '2026-11-05T07:00:00Z', invited_at: null, pending: false },
              { member_id: 'm2', has_account: true, linked: true, state: 'invited', last_sign_in_at: null, invited_at: '2026-11-04T09:00:00Z', pending: true },
              { member_id: 'm3', has_account: false, linked: false, state: 'none', last_sign_in_at: null, invited_at: null, pending: false },
            ] });
          }
          if (body && (body.action === 'invite' || body.action === 'reset')) {
            return res({ ok: true, link: LINK, email: body.member_id === 'm-new' ? 'eva@punds.eu' : 'peter@punds.eu', created: true, linked: true,
              expires_hint: 'Odkaz platí obmedzený čas (podľa nastavenia Supabase: predvolene 1 h, najviac 24 h) a dá sa použiť raz.', app_url: `${location.origin}/app/` });
          }
          if (body && body.action === 'send') return res({ ok: true, sent_to: 'peter@punds.eu', mailbox: 'info@punds.eu' });
          return res({});
        };
        const schranka = [];
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { schranka.push(t); } }, configurable: true });
        window.__v = volania; window.__clip = schranka; window.__zapisy = zapisy;
        UI.confirm = async () => true;
        Danubra.user = { id: 'u-admin', email: 'stefan@punds.eu' };
        Danubra.me = DATA.members[0]; Danubra.members = DATA.members;
        Danubra.cfgRow = DATA.settings[0];
        document.getElementById('login-screen').hidden = true; document.getElementById('app').hidden = false;
        try { localStorage.removeItem('danubra_dl_clenovia'); } catch (e) { /* nič */ }
        Danubra.route = 'members'; Mem.loaded = false; Mem.loginLoaded = false;
        await Danubra.renderRoute();
        const wait = async (fn) => { for (let i = 0; i < 60 && !fn(); i++) await new Promise(r => setTimeout(r, 50)); return fn(); };
        await wait(() => document.querySelector('#dl-clenovia [data-login="active"]'));
        const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
        const row = (name) => [...document.querySelectorAll('#dl-clenovia .dl-row')].find(r => r.textContent.includes(name));
        const res = {};
        res.stlpce = [...document.querySelectorAll('#dl-clenovia .dl-th')].map(x => x.textContent.trim()).filter(Boolean);
        res.stefan = txt(row('Štefan').querySelector('.mem-login'));
        res.jana = txt(row('Jana').querySelector('.mem-login'));
        res.peter = txt(row('Peter').querySelector('.mem-login'));
        res.statusVolanie = volania.find(v => v[1] && v[1].action === 'status');
        return res;
      });
      ok(out.stlpce.includes('Prihlásenie'), 'stĺpec „Prihlásenie"', out.stlpce.join(', '));
      ok(/^Aktívny/.test(out.stefan) && /posledné prihlásenie dňa 5\. 11\. 2026/.test(out.stefan), 'Aktívny (posledné prihlásenie dňa …)', out.stefan);
      ok(/Pozvaný \(čaká na heslo\)/.test(out.jana) && /odkaz poslaný 4\. 11\. 2026/.test(out.jana) && /Poslať nový odkaz na heslo/.test(out.jana), 'Pozvaný (čaká na heslo) + Poslať nový odkaz na heslo', out.jana);
      ok(/Nemá účet/.test(out.peter) && /Pozvať do appky/.test(out.peter), 'Nemá účet + Pozvať do appky', out.peter);
      ok(out.statusVolanie && out.statusVolanie[0] === '/.netlify/functions/danubra-member-invite', 'stav sa pýta servera (auth.users appka nevidí)');
      await shot(page, 'pouzivatelia-1440.png');

      await page.click('#dl-clenovia .dl-row:has-text("Peter") .mem-inv');
      await page.waitForSelector('#mem-invite');
      const m = await page.evaluate(() => {
        const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
        return { link: document.getElementById('mem-inv-link').value, wa: document.getElementById('mem-inv-wa').getAttribute('href'),
          mailto: document.getElementById('mem-inv-mailto').getAttribute('href'), mail: !!document.getElementById('mem-inv-mail'), text: txt(document.getElementById('mem-invite')),
          title: txt(document.querySelector('#ui-modal h3')) };
      });
      const LINK = `${base}/app/?heslo=1#k=abc0123456789def`;
      ok(m.title === 'Pozvánka pre Peter Horák' && m.link === LINK, 'okno s odkazom', JSON.stringify([m.title, m.link]));
      const wa = decodeURIComponent((m.wa || '').replace('https://wa.me/?text=', ''));
      ok(m.wa.startsWith('https://wa.me/?text=') && wa.includes(LINK) && wa.includes(`${base}/app/ e-mailom peter@punds.eu`) && /^Dobrý deň, Peter\./.test(wa),
        'WhatsApp: krátka správa s odkazom a adresou appky', wa);
      ok(/^mailto:peter%40punds\.eu\?subject=/.test(m.mailto) && decodeURIComponent(m.mailto).includes(LINK), 'mailto s odkazom', m.mailto.slice(0, 80));
      ok(m.mail, 'Poslať e-mailom zo schránky firmy');
      ok(/Odkaz platí obmedzený čas/.test(m.text) && /dá sa použiť raz/.test(m.text), 'poznámka o platnosti odkazu');
      if (process.env.SHOT_DIR) await page.waitForTimeout(3500);
      await shot(page, 'pozvanka-1440.png');
      await page.click('#mem-inv-copy');
      await page.waitForTimeout(80);
      ok((await page.evaluate(() => window.__clip[0])) === LINK, 'Kopírovať: odkaz je v schránke');
      await page.click('#mem-inv-mail');
      await page.waitForFunction(() => /E-mail odišiel/.test(document.getElementById('mem-inv-msg').textContent));
      const send = await page.evaluate(() => (window.__v.filter(v => v[1] && v[1].action === 'send').pop() || [])[1]);
      ok(send && send.member_id === 'm3' && send.link === LINK && send.mailbox_id === undefined, 'Poslať e-mailom: server dostane človeka a ten istý odkaz', JSON.stringify(send));
      ok(/E-mail odišiel na peter@punds\.eu zo schránky info@punds\.eu/.test(await page.textContent('#mem-inv-msg')), 'potvrdenie, kam a odkiaľ odišiel');

      // Uložiť a pozvať
      const nov = await page.evaluate(async () => {
        UI.closeModal();
        Mem.form();
        const f = document.getElementById('mem-form');
        const res = { box: f.querySelector('.regimebox').textContent.replace(/\s+/g, ' '), btn: !!document.getElementById('mem-save-invite') };
        f.full_name.value = 'Eva Malá'; f.email.value = 'eva@punds.eu';
        await Mem.save('', true);
        for (let i = 0; i < 40 && !document.getElementById('mem-invite'); i++) await new Promise(r => setTimeout(r, 50));
        res.modal = !!document.getElementById('mem-invite');
        res.ins = (window.__zapisy.find(z => z[0] === 'insert') || [])[2];
        res.inv = (window.__v.filter(v => v[1] && v[1].action === 'invite').pop() || [])[1];
        return res;
      });
      ok(nov.btn && !/Supabase/.test(nov.box) && /Pozvať do appky/.test(nov.box), 'pridanie človeka: bez „Supabase → Authentication", s „Uložiť a pozvať"', nov.box);
      ok(nov.modal && nov.ins && nov.ins.email === 'eva@punds.eu' && nov.inv && nov.inv.member_id === 'm-new', 'Uložiť a pozvať: uloží, pozve nového a ukáže okno s odkazom', JSON.stringify([nov.ins, nov.inv]));
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.join('; '));
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${passed} prešlo, ${failed} padlo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`  ✗ test spadol: ${e.message}`); console.log('\n0 prešlo, 1 padlo'); process.exit(1); });
