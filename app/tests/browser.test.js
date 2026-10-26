// ============================================================================
// DANUBRA — test v skutočnom prehliadači
// Spustenie:  node app/tests/browser.test.js
// ============================================================================
// `smoke.js` načíta skripty v stubovanom prostredí a overí, že sa appka
// poskladá. Jednu vec ale chytiť nevie: **či sa niečo vôbec zobrazí.**
//
// Prihlasovacia obrazovka aj appka sú v HTML skryté a odkrýva ich až kód.
// Keď sa predtým čokoľvek pokazí, stránka zostane úplne biela a bez hlášky.
//
// Test preto beží nad **nasadeným usporiadaním**: servíruje koreň repozitára
// a uplatní presmerovania z `netlify.toml`, presne ako Netlify. Prvá verzia
// tohto testu načítavala rovno `app/index.html` — a práve preto prehliadla
// chybu, pre ktorú bola stránka biela: koreň „/" sa prepisoval na obsah
// `/app/index.html`, ale adresa zostala „/", takže sa relatívne cesty
// vyhodnotili o úroveň vyššie a **všetko skončilo na 404**.
//
// Testovať treba to, čo je nasadené, nie pohodlný podadresár.
//
// Bez `playwright-core` sa preskočí — nie je to dôvod zhodiť `npm test`
// na stroji, kde prehliadač nie je.
// ============================================================================
const fs = require('fs');
const path = require('path');
const http = require('http');

const APP = path.join(__dirname, '..');           // app/
const REPO = path.join(APP, '..');                // koreň repozitára

let chromium;
try {
  chromium = require('playwright-core').chromium;
} catch {
  console.log('Prehliadačový test preskočený — playwright-core nie je nainštalovaný.');
  console.log('Nainštaluj ho cez `npm i -D playwright-core`, ak ho chceš spúšťať.');
  console.log('\n0 prešlo, 0 padlo (preskočené)');
  process.exit(0);
}

/** Kde je Chromium. Netlify aj tento kontajner ho majú v /opt/pw-browsers. */
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

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png',
  // Písmo. Bez správneho typu ho prehliadač odmietne a test by tvrdil, že
  // rozhranie vyzerá inak, hoci v prevádzke vyzerá správne.
  '.woff2': 'font/woff2',
};

/** Presmerovania z netlify.toml, aby test nebežal na inom nastavení než ostro. */
function readRedirects() {
  const toml = fs.readFileSync(path.join(REPO, 'netlify.toml'), 'utf8');
  const out = [];
  const re = /\[\[redirects\]\][^[]*?from\s*=\s*"([^"]+)"[^[]*?to\s*=\s*"([^"]+)"[^[]*?status\s*=\s*(\d+)/g;
  let m;
  while ((m = re.exec(toml))) out.push({ from: m[1], to: m[2], status: Number(m[3]) });
  return out;
}

/**
 * Pravidlo pre danú cestu, vrátane hviezdičky (`/danubra/*` → `/app/:splat`).
 * Bez nej by test presmerovanie starých odkazov vôbec neoveril.
 */
function matchRedirect(redirects, rel) {
  for (const r of redirects) {
    if (r.from === rel) return { ...r, to: r.to.replace(':splat', '') };
    if (r.from.endsWith('/*')) {
      const base = r.from.slice(0, -1);                 // "/danubra/*" → "/danubra/"
      if (rel.startsWith(base)) {
        return { ...r, to: r.to.replace(':splat', rel.slice(base.length)) };
      }
    }
  }
  return null;
}

function serve(redirects) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);

      const r = matchRedirect(redirects, rel);
      if (r) {
        if (r.status >= 300 && r.status < 400) {
          res.writeHead(r.status, { Location: r.to });
          return res.end();
        }
        rel = r.to;   // prepis (200) — adresa sa nemení
      }
      // Netlify servíruje index.html pre adresár.
      if (rel.endsWith('/')) rel += 'index.html';

      const file = path.join(REPO, rel);
      if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); return res.end('nenájdené');
      }
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

console.log('Prehliadač');

(async () => {
  const exe = findChromium();
  if (!exe) {
    console.log('Prehliadačový test preskočený — Chromium sa nenašiel.');
    console.log('\n0 prešlo, 0 padlo (preskočené)');
    process.exit(0);
  }

  const redirects = readRedirects();
  const { server, port } = await serve(redirects);
  const base = `http://127.0.0.1:${port}`;
  // Vstupná adresa je koreň — presne to, čo si človek napíše do prehliadača.
  const url = `${base}/`;
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

  try {
    // ── Appka sa spustí a niečo ukáže ─────────────────────────────────────
    {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e.message || e)));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      const state = await page.evaluate(() => ({
        text: (document.body.innerText || '').trim(),
        loginHidden: document.getElementById('login-screen').hidden,
        hasDanubra: typeof window.Danubra === 'object',
      }));

      ok(errors.length === 0, 'pri načítaní nie je ani jedna chyba', errors.join('; '));
      ok(state.hasDanubra, 'appka sa zaregistrovala');
      // Toto je ten test, ktorý stubovaný smoke chytiť nevie.
      ok(state.text.length > 0, 'stránka nie je prázdna',
        `body.innerText je prázdny — biela stránka`);
      ok(!state.loginHidden, 'prihlasovacia obrazovka je viditeľná');
      ok(state.text.includes('Prihlásiť sa'), 'a dá sa na nej prihlásiť');
      await page.close();
    }

    // ── Každá vstupná adresa musí fungovať ────────────────────────────────
    // Koreň, adresár bez lomky aj priama cesta. Keď sa relatívne cesty
    // vyhodnotia o úroveň vyššie, stránka je biela a nič to nepovie.
    for (const entry of ['/', '/app', '/app/', '/app/index.html']) {
      const page = await browser.newPage();
      const notFound = [];
      page.on('response', r => { if (r.status() === 404) notFound.push(r.url()); });
      await page.goto(base + entry, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
      const text = (await page.evaluate(() => (document.body.innerText || '').trim()));

      ok(text.includes('Prihlásiť sa'), `adresa „${entry}" appku zobrazí`,
        notFound.length ? `404: ${notFound.slice(0, 3).map(u => u.replace(base, '')).join(', ')}` : 'prázdna stránka');
      ok(notFound.length === 0, `adresa „${entry}" nemá ani jeden 404`,
        notFound.slice(0, 5).map(u => u.replace(base, '')).join(', '));
      await page.close();
    }

    // ── Staré odkazy musia fungovať ──────────────────────────────────────
    // Appka bývala v /danubra/. Ten odkaz má človek v záložkách, v histórii
    // aj v poslanej správe — a keď spadne na „Page not found", vyzerá to, že
    // appka je preč. Presne to sa stalo hneď po premenovaní.
    for (const entry of ['/danubra', '/danubra/', '/danubra/index.html']) {
      const page = await browser.newPage();
      const notFound = [];
      page.on('response', r => { if (r.status() === 404) notFound.push(r.url()); });
      await page.goto(base + entry, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
      const text = (await page.evaluate(() => (document.body.innerText || '').trim()));

      ok(/\/app\//.test(page.url()), `starý odkaz „${entry}" skončí v appke`,
        `skončil som na ${page.url().replace(base, '') || '/'}`);
      ok(text.includes('Prihlásiť sa'), `a „${entry}" naozaj zobrazí appku`,
        notFound.length ? `404: ${notFound.slice(0, 3).map(u => u.replace(base, '')).join(', ')}` : text.slice(0, 60));
      await page.close();
    }

    // ── Koreň musí fungovať aj bez presmerovaní od Netlify ───────────────
    // Presmerovanie z `netlify.toml` je rýchlejšie, lebo sa vybaví na hrane
    // siete. Spoľahnúť sa naň ale nedá: Netlify raz deploy spracoval bez
    // presmerovaní (hlásenie „No redirect rules processed", hoci sa
    // `netlify.toml` medzi commitmi nezmenil) a koreň spadol na Internal
    // Server Error — appka bola nasadená a v poriadku, len sa k nej nedalo
    // dostať.
    //
    // Preto sa tu servíruje **bez** presmerovaní a koreň musí človeka do
    // appky pustiť aj tak, cez statický `index.html` v koreni repozitára.
    {
      const bare = await serve([]);                 // žiadne presmerovania
      const bareUrl = `http://127.0.0.1:${bare.port}`;
      const page = await browser.newPage();
      const notFound = [];
      page.on('response', r => { if (r.status() === 404) notFound.push(r.url()); });

      await page.goto(bareUrl + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      const text = (await page.evaluate(() => (document.body.innerText || '').trim()));
      const where = page.url();

      ok(/\/app\/?$/.test(where), 'koreň pustí do appky aj bez presmerovaní',
        `skončil som na ${where.replace(bareUrl, '') || '/'}`);
      ok(text.includes('Prihlásiť sa'), 'a naozaj sa zobrazí prihlásenie',
        notFound.length ? `404: ${notFound.slice(0, 3).map(u => u.replace(bareUrl, '')).join(', ')}` : text.slice(0, 80));

      await page.close();
      bare.server.close();
    }

    // ── Zlyhaný dotaz sa nesmie tváriť ako prázdna tabuľka ────────────────
    // „Žiadni pracovníci" a „nepodarilo sa spojiť s databázou" sú dve úplne
    // rôzne správy. Keby appka ukázala prvú namiesto druhej, človek by sa
    // rozhodoval podľa dát, ktoré nikdy nedorazili.
    {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        window.__failQueries = true;
      });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
      // Podstrčíme chybu do DB.list a vykreslíme obrazovku znova.
      const text = await page.evaluate(async () => {
        DB.list = async (table) => {
          const err = { message: 'TypeError: Failed to fetch' };
          DB._note(table, err);
          return { data: null, error: err };
        };
        Danubra.user = { email: 'test@danubra.eu' };
        document.getElementById('app').hidden = false;
        Danubra.route = 'workers';
        Danubra.renderRoute();
        await new Promise(r => setTimeout(r, 900));
        return (document.getElementById('view').innerText || '').trim();
      });

      ok(text.includes('nenačítala'), 'zlyhaný dotaz sa ohlási');
      ok(text.includes('neznamená, že záznamy nemáte'),
        'a povie, že prázdno neznamená prázdno');
      ok(text.includes('danubra_workers'), 'aj ktorá tabuľka zlyhala');
      await page.close();
    }

    // ── Spadnutá obrazovka nenechá prázdno ────────────────────────────────
    {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
      const text = await page.evaluate(async () => {
        Danubra.views.workers = () => { throw new Error('umelá chyba obrazovky'); };
        Danubra.user = { email: 'test@danubra.eu' };
        document.getElementById('app').hidden = false;
        Danubra.route = 'workers';
        Danubra.renderRoute();
        await new Promise(r => setTimeout(r, 500));
        return (document.getElementById('view').innerText || '').trim();
      });

      ok(text.includes('nepodarilo zobraziť'), 'spadnutá obrazovka to povie');
      ok(text.includes('umelá chyba obrazovky'), 'aj s textom chyby');
      ok(text.includes('Späť na prehľad'), 'a ponúkne cestu von');
      await page.close();
    }

    // ── Keď chýba knižnica, appka to povie ────────────────────────────────
    // Blokátor reklám, firemná sieť, výpadok — nech je príčina akákoľvek,
    // človek musí vidieť text, nie bielu plochu.
    {
      const page = await browser.newPage();
      await page.route('**/vendor/supabase-js*.js', r => r.abort());
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800);
      const text = (await page.evaluate(() => (document.body.innerText || '').trim()));

      ok(text.length > 0, 'bez knižnice stránka nezostane biela');
      ok(text.includes('nespustila'), 'a povie, že sa appka nespustila');
      ok(text.includes('supabase-js'), 'aj čo presne chýba');
      ok(text.includes('Načítať znova'), 'a ponúkne, čo skúsiť');
      await page.close();
    }

    // ── Keď zlyhá štart, appka to tiež povie ──────────────────────────────
    {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
          if (window.Danubra) {
            window.Danubra.init = async () => { throw new Error('test chyby pri štarte'); };
          }
        }, true);
      });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800);
      const text = (await page.evaluate(() => (document.body.innerText || '').trim()));

      ok(text.includes('nespustila'), 'chyba pri štarte sa ukáže, nezostane biela');
      ok(text.includes('test chyby pri štarte'), 'aj s textom chyby');
      await page.close();
    }

    // ── Appka nevisí na cudzom serveri ────────────────────────────────────
    // Keby ju zhodilo to, že je nedostupný unpkg alebo iná cudzia doména,
    // bola by to tá istá chyba znova.
    {
      const page = await browser.newPage();
      const external = [];
      await page.route('**/*', (route) => {
        const u = route.request().url();
        if (!u.startsWith(`http://127.0.0.1:${port}`) && !u.startsWith('data:')) {
          external.push(u);
          return route.abort();
        }
        route.continue();
      });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      const text = (await page.evaluate(() => (document.body.innerText || '').trim()));

      ok(text.includes('Prihlásiť sa'),
        'appka sa spustí aj bez prístupu na cudzie servery',
        `zablokované: ${external.slice(0, 4).join(', ')}`);
      // Písma sú jediné, čo smie chýbať — bez nich sa použije systémové.
      const scripts = external.filter(u => u.endsWith('.js'));
      ok(scripts.length === 0, 'žiadny skript sa neťahá z cudzieho servera',
        scripts.join(', '));
      await page.close();
    }

    // ── Každá obrazovka sa otvorí ────────────────────────────────────────
    // Testy inak načítavajú knižnice cez `require`, kde sa globálne názvy
    // neprepisujú. Chyba, keď si dve knižnice vezmú to isté meno, preto
    // existuje **len v prehliadači** — a takto sa prejavila: tlač faktúry
    // padala na „DanubraDocs.invoice is not a function", hoci `npm test`
    // bol celý zelený.
    {
      const page = await browser.newPage();
      const chyby = [];
      let kde = 'štart';
      page.on('pageerror', e => chyby.push(`${kde}: ${e.message}`));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);

      // Bez dát, ale s prihláseným človekom — ide o to, či sa obrazovka
      // vôbec poskladá, nie čo je na nej.
      await page.evaluate(() => {
        DB.list = async () => ({ data: [], error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;
      });

      const routes = await page.evaluate(() =>
        Danubra.allNav().map(x => x[0]).filter(r => Danubra.routeAvailable(r)));
      ok(routes.length >= 15, `dá sa prejsť ${routes.length} obrazoviek`);

      for (const r of routes) {
        kde = r;
        await page.evaluate((x) => Danubra.go(x), r);
        await page.waitForTimeout(220);
      }
      ok(chyby.length === 0, 'žiadna obrazovka nespadne',
        chyby.slice(0, 4).join('\n    '));

      // Dokumenty sú to, čo bolo rozbité — každý sa musí dať vykresliť.
      kde = 'dokumenty';
      const docs = await page.evaluate(() => {
        const out = {};
        const sup = { name: 'Firma', iban: 'SK1' }, cli = { name: 'Klient' };
        const skus = (n, f) => {
          try { const h = f(); out[n] = h && h.length > 500 ? 'ok' : 'prázdne'; }
          catch (e) { out[n] = e.message; }
        };
        skus('faktúra', () => DanubraPapers.invoice(
          { invoice: { invoice_number: '1', total: 100 }, items: [], client: cli, supplier: sup }));
        skus('ponuka', () => DanubraPapers.quote(
          { quote: { quote_number: '1', title: 'T', charge_rate: 30, headcount: 2, hours_per_month: 160 },
            client: cli, supplier: sup }));
        skus('zmluva', () => DanubraPapers.werkvertrag(
          { contract: { contract_number: '1', title: 'T', price_model: 'fixed',
            fixed_price: 1000, scope: 'S' }, client: cli, supplier: sup }));
        skus('potvrdenie objednávky', () => DanubraPapers.orderConfirmation(
          { order: { order_number: '1' }, client: cli, accommodation: {}, supplier: sup }));
        skus('výzva na platbu', () => DanubraPapers.paymentRequest(
          { order: { order_number: '1' }, client: cli, supplier: sup, dueDate: '2026-10-01' }));
        skus('pokyny na ubytovanie', () => DanubraPapers.handover(
          { order: { order_number: '1' }, client: cli, data: {}, supplier: sup }));
        skus('potvrdenie majiteľovi', () => DanubraPapers.ownerConfirmation(
          { order: { order_number: '1' }, accommodation: {}, persons: [], supplier: sup }));
        return out;
      });
      const zle = Object.entries(docs).filter(([, v]) => v !== 'ok');
      ok(zle.length === 0, `každý dokument sa vykreslí (${Object.keys(docs).length})`,
        zle.map(([k, v]) => `${k}: ${v}`).join(', '));

      await page.close();
    }

    // ── Vysvetlivky ───────────────────────────────────────────────────────
    // Text je v `lib/explain.js` a testuje sa zvlášť. Tu ide o to, či sa okno
    // naozaj otvorí a či v ňom to „prečo" aj dole vidieť — je to posledná
    // sekcia a práve tá, kvôli ktorej to celé je.
    {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);

      const out = await page.evaluate(() => {
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;
        Help.open('card.money');
        const card = document.querySelector('#ui-modal .modal-card');
        const heads = [...document.querySelectorAll('#ui-modal .hx-sec h4')]
          .map(h => h.textContent.trim());
        return {
          text: card ? card.innerText : '',
          heads,
          btn: Help.btn('screen.workers').length,
          nic: Help.btn('nieco-cudzie').length,
        };
      });

      ok(out.text.length > 400, 'vysvetlivka sa otvorí a má čo povedať',
        `${out.text.length} znakov`);
      ok(out.heads.some(h => h.includes('Čo to je')), 'je v nej „čo to je"');
      ok(out.heads.some(h => h.includes('Ako sa to počíta')), 'aj „ako sa to počíta"');
      ok(out.heads.some(h => h.includes('Prečo je to takto')), 'aj „prečo je to takto"');
      ok(out.btn > 0, 'obrazovka má tlačidlo „?"');
      ok(out.nic === 0, 'a k neznámej téme sa tlačidlo nevykreslí vôbec');

      // Register: jedno miesto, kde je vidieť všetko naraz.
      const idx = await page.evaluate(() => {
        UI.closeModal();
        Help.index();
        return document.querySelectorAll('#ui-modal .hx-item').length;
      });
      ok(idx >= 30, `register ponúka všetky vysvetlivky (${idx})`);
      await page.close();
    }

    // ── Nasadenie bez dokladov ────────────────────────────────────────────
    // Pravidlo drží trigger v databáze (migrácia 033), ale človek sa o ňom má
    // dozvedieť pri výbere človeka, nie až chybou po vyplnení deviatich polí.
    // Tento test overuje presne to, čo sa nedá overiť bez prehliadača:
    // že sa blokátor v okne naozaj vykreslí, že neponúka výnimku tam, kde
    // nepomôže, a že zapísaná výnimka ho odomkne.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(() => {
        const dnes = new Date().toISOString().slice(0, 10);
        const DATA = {
          subcontracts: [{ id: 'sc1', title: 'Stavba Ulm', work_type: 'construction',
            status: 'active', date_from: dnes, partner_id: 'p1' }],
          partners: [{ id: 'p1', name: 'GU Ulm GmbH', country: 'DE' }],
          workers: [{ id: 'w1', full_name: 'Bez dokladov', status: 'ready',
            legal_form: 'szco', regulated_trade: false }],
          worker_documents: [],
          assignments: [], overrides: [],
        };
        DB.list = async (t) => ({ data: DATA[t] || [], error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        const res = {};
        return (async () => {
          await Sub.load();
          Sub.addAsg('sc1');
          const card = document.querySelector('#ui-modal .modal-card');
          res.stop = card.innerText.includes('Takto to nepustím');
          res.a1 = card.innerText.includes('Formulár A1');
          res.ovr = card.innerText.includes('Chcem to povoliť aj tak');
          res.risk = card.innerText.includes('Zoll');

          // Koordinátor výnimku nedostane — právo má len administrátor.
          Danubra.me = { role: 'coordinator', active: true };
          document.getElementById('asg-blocker').innerHTML =
            Sub.asgBlockerHtml('sc1', 'w1', dnes);
          res.koord = !document.getElementById('asg-blocker').innerText
            .includes('Chcem to povoliť aj tak');
          res.komu = document.getElementById('asg-blocker').innerText
            .includes('len administrátor');
          Danubra.me = { role: 'admin', active: true };

          // Zapísaná výnimka blokátor odomkne.
          Sub.overrides = [
            { id: 'o1', entity_type: 'worker', entity_id: 'w1', rule_key: 'missing_a1',
              reason: 'A1 je podané, klient tlačí.' },
            { id: 'o2', entity_type: 'worker', entity_id: 'w1', rule_key: 'missing_document',
              reason: 'A1 je podané, klient tlačí.' },
            { id: 'o3', entity_type: 'worker', entity_id: 'w1', rule_key: 'missing_trade_licence',
              reason: 'A1 je podané, klient tlačí.' },
            { id: 'o4', entity_type: 'worker', entity_id: 'w1', rule_key: 'missing_contract',
              reason: 'A1 je podané, klient tlačí.' },
          ];
          document.getElementById('asg-blocker').innerHTML =
            Sub.asgBlockerHtml('sc1', 'w1', dnes);
          const po = document.getElementById('asg-blocker').innerText;
          res.odomkne = po.includes('Nič neblokuje');
          res.vidno = po.includes('povolené výnimkou');
          UI.closeModal();
          return res;
        })();
      });

      ok(out.stop, 'nasadenie bez dokladov okno zastaví');
      ok(out.a1, 'a povie, že chýba A1');
      ok(out.ovr, 'administrátorovi ponúkne výnimku');
      ok(out.risk, 'aj s tým, čo tým riskuje');
      ok(out.koord, 'koordinátorovi výnimku neponúkne');
      ok(out.komu, 'ale povie mu, kto ju povoliť môže');
      ok(out.odomkne, 'zapísaná výnimka nasadenie odomkne');
      ok(out.vidno, 'a zostane vidieť, že to prešlo výnimkou');
      ok(chyby.length === 0, 'pri tom nič nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }







    // ── Zaškolenie za hodinu ──────────────────────────────────────────────
    // Zadanie: „posadím tam hocikoho a za hodinu vie robiť kvalitné nábory."
    // Podstatná je posledná časť — cvičný hovor. Testuje sa to, čo by inak
    // ticho pokazilo celé zaškolenie: keby appka ukázala samé dobré odpovede,
    // človek sa naučí kývať, prejde a appka mu povie, že môže volať.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(() => {
        const DATA = {
          trades: [{ key: 'trockenbau', name_sk: 'Sadrokartonár', name_de: 'Trockenbauer' }],
          screening_questions: Array.from({ length: 8 }, (_, i) => ({
            id: `q${i}`, trade_key: 'trockenbau', question_sk: `Otázka ${i}?`,
            good_answer: `Dobrá odpoveď ${i}`, red_flag_answer: `Zlá odpoveď ${i}`,
            weight: 2, active: true })),
          trade_basics: [{ code: 'polier', title: 'Kto je Polier',
            body: 'Majster stavby.', sort_order: 1, active: true }],
          recruitment_plans: [], candidates: [], subcontracts: [], ads: [],
        };
        DB.list = async (t) => ({ data: DATA[t] || [], error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;
        try { localStorage.removeItem('danubra_onboarding'); } catch {}

        const res = {};
        return (async () => {
          Hire.loaded = false; Hire.learn = false; Learn.loaded = false;
          Danubra.go('hiring');
          await new Promise(r => setTimeout(r, 400));
          res.vyzva = document.getElementById('view').innerText.replace(/\s+/g, ' ');

          Learn.open();
          await new Promise(r => setTimeout(r, 400));
          res.cesta = document.getElementById('view').innerText.replace(/\s+/g, ' ');
          res.krokov = document.getElementById('view').querySelectorAll('.flow-step').length;

          // Cvičný hovor
          Learn.save({ trade: 'trockenbau' });
          Learn.go('practice');
          await new Promise(r => setTimeout(r, 300));
          res.kola = Learn.practice.deck.length;
          res.dobrych = Learn.practice.deck.filter(x => x.accept).length;
          res.predOdhalenim = document.getElementById('view').innerText.replace(/\s+/g, ' ');

          // Rozhodni zle a over, že to appka povie
          const prve = Learn.practice.deck[0];
          Learn.answerPractice(!prve.accept);
          await new Promise(r => setTimeout(r, 250));
          res.poZlom = document.getElementById('view').innerText.replace(/\s+/g, ' ');

          // Prejdi celé cvičenie so správnymi odpoveďami
          Learn.startPractice();
          await new Promise(r => setTimeout(r, 150));
          while (Learn.practice.i < Learn.practice.deck.length) {
            Learn.answerPractice(Learn.practice.deck[Learn.practice.i].accept);
            Learn.nextPractice();
          }
          await new Promise(r => setTimeout(r, 250));
          res.zaver = document.getElementById('view').innerText.replace(/\s+/g, ' ');
          return res;
        })();
      });

      ok(out.vyzva.includes('Si tu prvýkrát'),
        'nábor ponúkne zaškolenie tomu, kto ním neprešiel', out.vyzva.slice(0, 160));
      ok(out.vyzva.includes('Hodina'), 'a povie, koľko to zaberie');
      ok(out.krokov === 5, 'zaškolenie má päť krokov', `${out.krokov}`);
      ok(out.cesta.includes('Cvičný hovor'), 'vrátane cvičného hovoru');
      ok(out.cesta.includes('zostáva 60 minút'), 'a koľko času zostáva',
        out.cesta.slice(0, 200));

      ok(out.kola === 8, 'cvičný hovor má osem kôl', `${out.kola}`);
      ok(Math.abs(out.dobrych - 4) <= 1,
        'polovica odpovedí je dobrá a polovica zlá — inak sa človek naučí kývať',
        `dobrých ${out.dobrych} z ${out.kola}`);
      ok(out.predOdhalenim.includes('Kandidát odpovie'),
        'ukáže sa odpoveď kandidáta');
      ok(out.predOdhalenim.includes('Beriem to')
        && out.predOdhalenim.includes('zbystrím'),
        'a človek sa rozhoduje, či ju prijíma');
      ok(!out.predOdhalenim.includes('Rozhodli ste správne'),
        'pred rozhodnutím appka neprezradí odpoveď');
      ok(out.poZlom.includes('Toto bolo inak'),
        'pri zlom rozhodnutí to appka povie');

      ok(out.zaver.includes('100 %'), 'na konci je výsledok',
        out.zaver.slice(0, 200));
      ok(out.zaver.includes('vyrovnane'), 'aj to, ako človek posudzuje');
      ok(chyby.length === 0, 'pri tom nič nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Jedno miesto na nábor ─────────────────────────────────────────────
    // Nábor bol rozsypaný na šesť položiek v menu a kto naberal, musel
    // vedieť, na ktorej má byť. „Nábor" je teraz vstup: čo treba teraz,
    // čo beží, koho hľadám — a odtiaľ sa chodí na zvyšok.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(() => {
        const davno = new Date(Date.now() - 45 * 60000).toISOString();
        const DATA = {
          recruitment_plans: [{ id: 'p1', title: 'Murári na Stuttgart', trade_key: 'murar',
            headcount: 4, status: 'active', city: 'Stuttgart', offer_rate: 17, client_rate: 27 }],
          trades: [{ key: 'murar', name_sk: 'Murár', active: true }],
          screening_questions: [],
          candidates: [
            { id: 'c1', full_name: 'Róbert Slávik', status: 'new', received_at: davno, ad_id: 'ad1' },
            { id: 'c2', full_name: 'Dávid Urban', status: 'contacted',
              received_at: davno, first_contact_at: davno },
          ],
          subcontracts: [],
          ads: [{ id: 'ad1', title: 'Murári Stuttgart FB', channel: 'facebook', active: true },
            { id: 'ad2', title: 'Zvárači rezerva', channel: 'portal', active: true }],
        };
        DB.list = async (t) => ({ data: DATA[t] || [], error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        return (async () => {
          Hire.loaded = false;
          Danubra.go('hiring');
          await new Promise(r => setTimeout(r, 500));
          const v = document.getElementById('view');
          return {
            text: v.innerText.replace(/\s+/g, ' '),
            html: v.innerHTML,
            // Názov položky, bez čísla kroku pred ním.
            menu: [...document.querySelectorAll('#sidebar-nav .nav-item .nav-text')]
              .map(x => x.textContent.trim()).filter(Boolean),
            zalozky: [...v.querySelectorAll('.subtabs .subtab .subtab-txt b')]
              .map(x => x.textContent.trim()),
            zalozkaTeraz: (v.querySelector('.subtabs .subtab.active .subtab-txt b') || {}).textContent,
            // A či sa cez záložku naozaj prepne — vrátane toho, že sa zvýrazní
            // tá, na ktorej človek stojí.
            poKliku: await (async () => {
              v.querySelector('.subtabs .subtab[data-key=candidates]')?.click();
              await new Promise(r => setTimeout(r, 400));
              const w = document.getElementById('view');
              return {
                nadpis: (w.querySelector('.page-title') || {}).textContent || '',
                aktivna: ((w.querySelector('.subtabs .subtab.active .subtab-txt b') || {}).textContent || '').trim(),
                menu: [...document.querySelectorAll('#sidebar-nav .nav-item.active .nav-text')]
                  .map(x => x.textContent.trim()),
              };
            })(),
          };
        })();
      });

      // Appka má povedať jednu vec, ktorá sa má spraviť teraz — veľkým
      // písmom a s jedným veľkým tlačidlom. Nie zoznam, z ktorého si človek
      // vyberá sám.
      ok(out.text.includes('Zavolaj — Róbert Slávik'),
        'navrchu je jedna vec, ktorá sa má spraviť teraz', out.text.slice(0, 200));
      ok(out.text.includes('Čaká už 45 min'), 'a ako dlho ten človek čaká');
      ok(out.text.includes('Cieľ je ozvať sa do desiatich minút'),
        'aj to, prečo to horí');
      ok(out.html.includes('Guide.continueCall'), 'tlačidlo vedie rovno do hovoru');
      ok((out.text.match(/Róbert Slávik/g) || []).length === 1,
        'meno je na obrazovke raz, nie v nadpise aj na tlačidle');
      ok(out.html.includes('flow-hot'), 'a nad desať minút je to zvýraznené');

      // Päť krokov pod tým: kde v tom reťazci sme.
      ok((out.html.match(/class="flow-step/g) || []).length === 5,
        'pod tým je päť krokov reťazca');
      ok(out.text.includes('z 5 fáz hotových'), 'a koľko z nich je hotových');
      ok(out.html.includes('is-now'), 'ten, ktorý je na rade, je zvýraznený');
      // Plán je karta: remeslo menom a „0 z 4 nabraných" (nie kľúč „murar × 4").
      ok(out.text.includes('Murár') && /0 z 4 nabraných/.test(out.text) && !/murar ×/.test(out.text),
        'plán ukazuje názov remesla, nie kľúč',
        out.text.slice(0, 300));
      ok(out.html.includes("Danubra.go('trades')") && out.html.includes("Danubra.go('candidates')"),
        'a odtiaľto sa dá ísť na zvyšok náboru');

      // Nábor je záložka **Ľudí** — v menu sú štyri miesta (Dnes, Zákazky,
      // Ľudia, Peniaze). Kandidáti, Inzeráty a Zápisy sú záložky vedľa neho.
      ok(out.menu.some(x => x.startsWith('Ľudia')) && !out.menu.some(x => x.startsWith('Nábor')),
        'nábor je pod Ľuďmi, nie samostatne v menu',
        out.menu.join(' | '));
      ok(!out.menu.some(x => x.startsWith('Kandidáti') || x.startsWith('Inzeráty')
        || x.startsWith('Zápisy') || x.startsWith('Partie')),
        'kandidáti, inzeráty, zápisy ani partie už v menu nie sú',
        out.menu.join(' | '));
      // Inzercia a výdavky (bývalé „Marketing") je tam piata: je to to isté
      // rozhodnutie — kde inzerovať a koľko to stojí.
      ok(out.zalozky.join(',') === 'Živnostníci,Nábor,Kandidáti,Inzeráty,Zápisy,Partie',
        'sú to záložky Ľudí', out.zalozky.join(','));
      ok((out.zalozkaTeraz || '').trim() === 'Nábor',
        'a je vidieť, na ktorej práve stojím', out.zalozkaTeraz);
      ok(/Kandidáti/.test(out.poKliku.nadpis), 'klik na záložku prepne obrazovku',
        out.poKliku.nadpis);
      ok(out.poKliku.aktivna === 'Kandidáti', 'a zvýrazní sa tá, na ktorej stojím',
        out.poKliku.aktivna);
      ok(out.poKliku.menu.join(',') === 'Ľudia',
        'v ľavom menu pritom zostanú zvýraznení Ľudia — je to stále to isté miesto',
        out.poKliku.menu.join(','));
      ok(chyby.length === 0, 'pri tom nič nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Obrazovka kandidátov ──────────────────────────────────────────────
    // Pri štarte vyzerala ako rozbitá: kanban s piatimi stĺpcami, z toho
    // štyri prázdne, to isté tlačidlo dvakrát a metriky svietiace pomlčkou
    // a nulou — akoby appka merala a vyšla jej nula, pritom ešte nie je
    // z čoho počítať.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(() => {
        const DATA = {
          candidates: [
            { id: 'c1', full_name: 'Róbert Slávik', status: 'new', received_at: '2026-10-01' },
            { id: 'c2', full_name: 'Dávid Urban', status: 'new', received_at: '2026-10-01' },
          ],
          candidate_checks: [],
          ads: [{ id: 'ad1', title: 'Sadrokartonári Stuttgart', channel: 'facebook' }],
        };
        DB.list = async (t) => ({ data: DATA[t] || [], error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        const res = {};
        return (async () => {
          Cand.loaded = false; Cand.view_ = null;
          Danubra.go('candidates');
          await new Promise(r => setTimeout(r, 500));
          const v = document.getElementById('view');
          res.text = v.innerText.replace(/\s+/g, ' ');
          res.html = v.innerHTML;
          res.kanbanov = v.querySelectorAll('.kanban-col').length;
          res.cta = (res.html.match(/Guide\.startCall\(\)/g) || []).length
            + (document.getElementById('page-actions')
              ? (document.getElementById('page-actions').innerHTML.match(/Guide\.startCall/g) || []).length
              : 0);

          // S dostatkom ľudí v procese má kanban zmysel a zapne sa sám.
          Cand.items = Array.from({ length: 7 }, (_, i) => ({
            id: `x${i}`, full_name: `Človek ${i}`, status: 'contacted', received_at: '2026-10-01' }));
          Danubra.renderRoute();
          await new Promise(r => setTimeout(r, 300));
          res.kanbanovVela = document.getElementById('view').querySelectorAll('.kanban-col').length;
          return res;
        })();
      });

      ok(out.cta === 1, 'tlačidlo „Zdvihol som telefón" je na obrazovke raz', `${out.cta}×`);
      ok(out.kanbanov === 0, 'pri dvoch kandidátoch sa kanban nekreslí',
        `${out.kanbanov} stĺpcov`);
      ok(out.kanbanovVela > 0, 'pri siedmich sa zapne sám', `${out.kanbanovVela} stĺpcov`);
      ok(out.text.includes('zatiaľ nemeriame'),
        'prázdna metrika povie, že sa ešte nemeria');
      ok(!out.text.includes('konverzia 0 %'),
        'a nikde nesvieti konverzia 0 %', out.text.slice(0, 200));
      ok(out.html.includes('kpi-word'),
        'veta v metrike nemá veľkosť čísla, aby sa nezalomila');
      ok(out.text.includes('väzba vzniká pri hovore'),
        'pri neznámom pôvode sa povie, kde tá väzba vzniká');
      ok(chyby.length === 0, 'pri tom nič nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Krátky hovor a plný pohovor ───────────────────────────────────────
    // Cieľ je ozvať sa do desiatich minút. Keď sa začne dvadsaťminútovým
    // pohovorom, k tretiemu človeku sa náborár v ten deň nedostane.
    //
    // Druhá vec, ktorú to stráži: záver hovoru nesmie povedať dve veci naraz.
    // Prvá verzia ukazovala hore „100 % — Ísť na overenie" a pod tým
    // „Zavolať neskôr, zatiaľ to nie je jasné", lebo sa do rozhodnutia
    // podal zlý objekt.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(() => {
        DB.list = async () => ({ data: [], error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        Guide.ads = [{ id: 'ad1', title: 'Sadrokartonári Stuttgart FB',
          channel: 'facebook', trade_key: 'trockenbau', rate_offered: 18, active: true }];
        Guide.trades = [{ key: 'trockenbau', name_sk: 'Sadrokartonár' }];
        Guide.plans = []; Guide.subcontracts = []; Guide.partners = [];
        Guide.chips = [
          { id: 1, segment: 'trade', label: 'Vie rozteč profilov', polarity: 'plus', weight: 3, active: true },
          { id: 2, segment: 'trade', label: 'Pozná Q2 a Q3', polarity: 'plus', weight: 3, active: true },
          { id: 3, segment: 'legal', label: 'Má aktívnu živnosť', polarity: 'plus', weight: 3, active: true },
          { id: 4, segment: 'legal', label: 'Nemá A1 a nechce ho', polarity: 'flag', weight: 3, active: true },
          { id: 5, segment: 'logistics', label: 'Vie nastúpiť', polarity: 'plus', weight: 2, active: true },
          { id: 6, segment: 'money', label: 'Sadzba sedí', polarity: 'plus', weight: 2, active: true },
          { id: 7, segment: 'intro', label: 'Predstavil som firmu', polarity: 'plus', weight: 1, active: true },
          { id: 8, segment: 'verify', label: 'Vie meno Poliera', polarity: 'plus', weight: 2, active: true },
        ];
        Guide.questions = [
          { id: 'q1', trade_key: 'trockenbau', phase: 'phone', question_sk: 'Rozteč?',
            good_answer: '62,5 cm', weight: 3, active: true },
        ];
        Guide.loaded = true; Guide.setup = true;
        Guide.cand = null; Guide.ad = null; Guide.trade = null; Guide.mode = 'quick';

        const res = {};
        Guide.open();
        Guide.pickAd('ad1');
        res.start = document.getElementById('guide').innerText;

        // Krátky hovor je jedna obrazovka, nie šesť.
        Guide.cand = { id: 'c1', full_name: 'Jozef Malý', ad_id: 'ad1' };
        Guide.trade = { key: 'trockenbau', name_sk: 'Sadrokartonár' };
        Guide.setup = false; Guide.ticked = new Map();
        Guide.segments = Guide.buildSegments('trockenbau', 'ad1');
        res.kratkySegmentov = Guide.segments.length;
        res.kratkyPolia = Guide.segments[0].chips.map(c => c.segment);

        // Plný pohovor má častí viac.
        Guide.mode = 'full';
        res.plnySegmentov = Guide.buildSegments('trockenbau', 'ad1').length;
        Guide.mode = 'quick';

        // Záver: hodnotenie hore a rozhodnutie pod ním si nesmú odporovať.
        Guide.segments = Guide.buildSegments('trockenbau', 'ad1');
        for (const id of [1, 2, 3, 5, 6]) Guide.ticked.set(id, Guide.chips.find(c => c.id === id));
        Guide.segIndex = Guide.segments.length;
        Guide.render();
        res.zaver = document.getElementById('guide').innerText.replace(/\s+/g, ' ');

        // Vylučujúca vec prebije aj vysoké skóre.
        Guide.ticked.set(4, Guide.chips.find(c => c.id === 4));
        Guide.render();
        res.sVlajkou = document.getElementById('guide').innerText.replace(/\s+/g, ' ');

        // Odborná otázka sa dá ohodnotiť — ide do skóre aj do tabuľky odpovedí.
        Guide.ticked = new Map(); Guide.answers = new Map(); Guide.segIndex = 0;
        let ulozene = null;
        DB.from = () => ({ upsert: async (row) => { ulozene = row; return { error: null }; } });
        const kroky = Guide.steps(Guide.segments[0]);
        const iq = kroky.findIndex(k => k.key === 'db:q1');
        res.odbornaKrok = iq;
        Guide.qStep = { quick: iq }; Guide.render();
        res.odbornaText = document.getElementById('guide').innerText.replace(/\s+/g, ' ');
        Guide.answer('quick', 'db:q1', 0);
        res.odbornaSkore = Guide.scoreItems().map(x => `${x.id}:${x.polarity}:${x.weight}`);
        res.ulozene = ulozene;
        Guide.close(true);
        return res;
      });

      ok(out.start.includes('Krátky hovor') && out.start.includes('Plný pohovor'),
        'pred hovorom sa dá vybrať krátky alebo plný');
      ok(out.start.includes('Do troch minút'), 'a je napísané, čím sa líšia');

      ok(out.kratkySegmentov === 1, 'krátky hovor je jedna obrazovka',
        `${out.kratkySegmentov}`);
      ok(!out.kratkyPolia.includes('intro') && !out.kratkyPolia.includes('verify'),
        'bez úvodu a overovania — na to je plný pohovor', out.kratkyPolia.join(','));
      ok(['trade', 'legal', 'logistics', 'money'].every(k => out.kratkyPolia.includes(k)),
        'ale remeslo, papiere, termín aj peniaze tam sú', out.kratkyPolia.join(','));
      ok(out.plnySegmentov > out.kratkySegmentov,
        'plný pohovor má častí viac', `${out.plnySegmentov} vs ${out.kratkySegmentov}`);

      ok(out.zaver.includes('Pokračovať plným pohovorom'),
        'zo záveru krátkeho hovoru sa dá prejsť na plný');
      ok(!out.zaver.includes('Zavolať neskôr'),
        'pri vysokom skóre sa nehovorí „zavolať neskôr"', out.zaver.slice(0, 200));
      ok(out.sVlajkou.includes('Nepokračovať'),
        'vylučujúca vec prebije aj vysoké skóre');
      ok(!out.sVlajkou.includes('Pokračovať plným pohovorom'),
        'a vtedy sa plný pohovor neponúka');
      ok(out.odbornaKrok >= 0, 'odborná otázka je v hovore ako krok, nielen na čítanie');
      ok(/Odpovedal dobre.*Čiastočne.*Zle \/ nevie/.test(out.odbornaText),
        'pri nej sa dá vybrať dobre / čiastočne / zle', out.odbornaText.slice(0, 200));
      ok(out.odbornaText.includes('62,5 cm'), 'a je pri nej vidieť, čo chceme počuť');
      ok(out.odbornaSkore.join() === 'db:q1:plus:3', 'dobrá odpoveď na kľúčovú otázku ide do skóre',
        out.odbornaSkore.join());
      ok(out.ulozene && out.ulozene.question_id === 'q1' && out.ulozene.rating === 2
        && out.ulozene.candidate_id === 'c1', 'hodnotenie sa uloží ku kandidátovi',
        JSON.stringify(out.ulozene));
      ok(chyby.length === 0, 'pri tom nič nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Remeslo ako lekcia a skúšanie ─────────────────────────────────────
    // Nábor nerobí stavbár. Toto je obrazovka, z ktorej sa má človek naučiť
    // remeslo — takže sa testuje presne to: že sa dá otvoriť, že sekcie idú
    // v poradí na čítanie, a že skúšanie **neukáže odpoveď skôr**, než si ju
    // človek premyslí. Odhalená odpoveď vopred znamená, že si prečíta
    // riešenie a bude si myslieť, že ho vedel.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(() => {
        DB.list = async () => ({ data: [], error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        Trades.loaded = true;
        Trades.trades = [
          { key: 'trockenbau', name_sk: 'Sadrokartonár', name_de: 'Trockenbauer',
            lohngruppe: 'LG2', summary: 'Najžiadanejšie remeslo.',
            day_in_life: 'Ráno sa vymeria čiara.',
            vocab: [{ de: 'Ständerwerk', sk: 'nosný rošt', note: 'Kostra priečky.' }],
            work_scope: ['montáž priečok'], materials: ['GKB'], tools: ['skrutkovač'],
            standards: ['Q2 — bežný štandard'], daily_output: '25–35 m²',
            certificates: ['živnostenský list'], red_flags: ['nevie rozteč'],
            pay_note: 'Najtvrdšia konkurencia o ľudí.',
            rate_worker_min: 16, rate_worker_max: 20,
            rate_client_min: 26, rate_client_max: 32 },
          { key: 'montaznik', name_sk: 'Montážnik', name_de: 'Monteur',
            summary: 'Montuje hotové diely.', rate_worker_min: 15.9, rate_worker_max: 18,
            rate_client_min: 25, rate_client_max: 29 },
        ];
        Trades.questions = Array.from({ length: 6 }, (_, i) => ({
          id: `q${i}`, trade_key: 'trockenbau', question_sk: `Otázka číslo ${i}?`,
          good_answer: `Správna odpoveď ${i}`, red_flag_answer: `Zbystri ${i}`,
          kind: 'knowledge', weight: 1, sort_order: i, active: true }));
        Trades.basics = [{ code: 'polier', title: 'Kto je Polier',
          body: 'Majster stavby.', sort_order: 1, active: true }];

        const res = {};
        return (async () => {
          Danubra.go('trades');
          await new Promise(r => setTimeout(r, 300));
          Trades.setTab('trades');
          await new Promise(r => setTimeout(r, 200));
          const zoznam = document.getElementById('view');
          res.karty = zoznam.querySelectorAll('.trade-card').length;
          res.zoznamText = zoznam.innerText.replace(/\s+/g, ' ');

          Trades.open('trockenbau');
          await new Promise(r => setTimeout(r, 300));
          const v = document.getElementById('view');
          res.nadpisy = [...v.querySelectorAll('.lesson-card .card-title')]
            .map(x => x.textContent.trim());
          res.lekcia = v.innerText.replace(/\s+/g, ' ');
          res.hash = location.hash;

          // Skúšanie: odpoveď sa nesmie ukázať skôr, než si ju človek vyžiada.
          Trades.startQuiz('trockenbau');
          await new Promise(r => setTimeout(r, 250));
          const q1 = document.getElementById('quiz').innerText;
          res.predOdhalenim = q1;
          Trades.revealQuiz();
          await new Promise(r => setTimeout(r, 200));
          res.poOdhaleni = document.getElementById('quiz').innerText;
          const prva = Trades.quiz.deck[0].id;
          Trades.nextQuiz(true);
          await new Promise(r => setTimeout(r, 200));
          res.dalsia = Trades.quiz.deck[Trades.quiz.i].id !== prva;
          res.znovaSkryte = !document.getElementById('quiz').innerText.includes('Čo chcem počuť');
          res.skore = Trades.quiz.hit;

          Trades.closeLesson();
          await new Promise(r => setTimeout(r, 250));
          res.hashPoZavreti = location.hash;
          return res;
        })();
      });

      ok(out.karty === 2, 'remeslá sú karty, nie riadky', `našiel som ${out.karty}`);
      ok(out.zoznamText.includes('6 otázok'), 'na karte je počet otázok');
      ok(out.zoznamText.includes('0 otázok'),
        'a nula sa skloňuje správne — „0 otázok", nie „0 otázky"');
      ok(out.zoznamText.includes('15,90'), 'sadzba má desatinnú čiarku, nie bodku',
        out.zoznamText.slice(0, 160));

      const cakane = ['Čo to je', 'Deň na stavbe', 'Slovíčka, ktoré budeš počuť',
        'Čo na stavbe robí', 'S čím pracuje', 'Čím pracuje — vlastné náradie',
        'Podľa čoho sa to meria', 'Koľko toho za deň spraví', 'Čo musí doložiť',
        'Podľa čoho spoznáš, že to nerobil', 'Peniaze'];
      ok(out.nadpisy.join('|') === cakane.join('|'),
        'lekcia ide v poradí na čítanie a peniaze sú na konci',
        out.nadpisy.join(', '));
      ok(out.lekcia.includes('Ständerwerk'), 'slovíčka sú v lekcii');
      ok(out.lekcia.includes('12 z 12'), 'je vidieť, koľko z príručky je hotové');
      ok(out.lekcia.includes('Kto je Polier'), 'a čo platí na každej stavbe');
      ok(out.hash.includes('#/trades/trockenbau'),
        'na remeslo sa dá poslať odkaz', out.hash);

      ok(!out.predOdhalenim.includes('Čo chcem počuť'),
        'odpoveď sa pred premyslením neukáže');
      ok(out.predOdhalenim.includes('Otázka 1 z 6'), 'ale je vidieť, kde v balíčku som');
      ok(out.poOdhaleni.includes('Čo chcem počuť'), 'po vyžiadaní sa odpoveď ukáže');
      ok(out.poOdhaleni.includes('Pri čom zbystriť'), 'aj to, pri čom zbystriť');
      ok(out.dalsia, 'ďalšia otázka je iná než prvá');
      ok(out.znovaSkryte, 'a jej odpoveď je zase skrytá');
      ok(out.skore === 1, 'čo si človek povie, že vedel, sa počíta');
      ok(out.hashPoZavreti === '#/trades', 'zavretím sa vrátiš na zoznam');
      ok(chyby.length === 0, 'pri tom nič nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Zmluva ────────────────────────────────────────────────────────────
    // Zmluva nemala náhľad ani sken a editovať sa dalo sedem polí. Toto
    // overuje presne to, čo sa bez prehliadača otestovať nedá: že tie polia
    // sú vidieť **aj v detaile**, nielen vo formulári — lebo to bola tá istá
    // chyba, akú mal checklist a doklady.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(() => {
        DB.list = async () => ({ data: [], error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        Con.loaded = true;
        Con.partners = [{ id: 'p1', name: 'Vogel GmbH', ust_idnr: 'DE811234567' }];
        Con.items = [{ id: 'c1', contract_number: 'ZML-1', partner_id: 'p1',
          title: 'Trockenbau', kind: 'werkvertrag', status: 'signed',
          scope: 'Montage.', site_name: 'Wohnpark', site_city: 'Stuttgart',
          date_from: '2026-10-01', date_to: '2027-03-31',
          price_model: 'hourly', charge_rate: 31.5, payment_terms_days: 30,
          retention_pct: 5, warranty_months: 48, notice_days: 30,
          contact_name: 'Herr Vogel', contact_email: 'vogel@bau.de',
          signed_at: '2026-09-20', storage_path: null }];
        Con.amendments = [{ id: 'a1', contract_id: 'c1', amendment_number: 'Dodatok č. 1',
          field: 'charge_rate', old_value: '31.5', new_value: '33',
          reason: 'Zdražel materiál.', created_at: '2026-11-01', signed_at: null }];

        Con.detail('c1');
        // Sumy formátuje Intl a medzera pred € je pevná (U+00A0), nie
        // obyčajná. Porovnávať text s pevnou medzerou znamená hľadať znak,
        // ktorý sa nedá napísať — tak sa všetky medzery zrovnajú.
        const norm = (x) => x.replace(/\s+/g, ' ').trim();
        const t = norm(document.querySelector('#ui-modal .modal-card').innerText);
        const html = document.querySelector('#ui-modal .modal-card').innerHTML;

        // Podpísaná zmluva: chránené polia sa needitujú vôbec.
        Con.form('c1');
        const poliaPodpisanej = [...document.querySelectorAll('#con-form [name]')]
          .map(x => x.name);

        // Koncept: editovať sa dá všetko.
        Con.items.push({ ...Con.items[0], id: 'c2', status: 'draft' });
        Con.form('c2');
        const poliaKonceptu = [...document.querySelectorAll('#con-form [name]')]
          .map(x => x.name);
        UI.closeModal();
        return { t, html, poliaPodpisanej, poliaKonceptu };
      });

      ok(out.t.includes('Stuttgart'), 'miesto plnenia je v detaile');
      ok(out.t.includes('31,50 € / h'), 'cena je naformátovaná');
      // Na hodnotu samu sa spoľahnúť nedá — „5 %" je aj vo vete pod tým.
      // Test musí hľadať riadok s názvom, inak nechytí, že políčko zmizlo.
      ok(/<span>Zádržné<\/span><strong>5(\s|&nbsp;)?%/.test(out.html),
        'zádržné má v detaile vlastný riadok', out.html.slice(0, 0));
      ok(/<span>Záruka<\/span><strong>48 mes/.test(out.html), 'aj záruka');
      ok(/<span>Výpovedná lehota<\/span><strong>30 dní/.test(out.html),
        'aj výpovedná lehota');
      ok(out.t.includes('vogel@bau.de'), 'aj kontakt na odberateľa');
      // Fakturuje sa vždy po hodinách — upozornenie „prepni na pevnú cenu" je preč.
      ok(!out.t.includes('prepni to na pevnú cenu'),
        'pri hodinovej cene sa už neozýva upozornenie (vždy po hodinách)');
      ok(out.t.includes('33,00 € / h'), 'dodatok ukazuje sumu, nie surové „33"');
      ok(out.t.includes('Prišiel podpísaný'), 'nepodpísaný dodatok sa dá podpísať');
      ok(out.html.includes('Con.uploadScan'), 'sken originálu sa dá nahrať');
      ok(out.html.includes('Con.document'), 'a zmluva sa dá otvoriť ako dokument');

      for (const f of ['site_name', 'price_model',
        'charge_rate', 'retention_pct', 'warranty_months', 'notice_days',
        'penalty_note', 'contact_name', 'contact_email', 'contact_phone']) {
        ok(out.poliaKonceptu.includes(f), `formulár má pole „${f}"`);
      }
      // Na podpísanej zmluve sa dohodnuté podmienky needitujú vôbec — nie
      // „zakázané po kliknutí", ale rovno bez možnosti písať.
      for (const f of ['charge_rate', 'fixed_price', 'unit_price', 'retention_pct',
        'date_to']) {
        ok(!out.poliaPodpisanej.includes(f),
          `na podpísanej zmluve sa „${f}" needituje`);
      }
      ok(out.poliaPodpisanej.includes('site_name'),
        'ale miesto plnenia sa doplniť dá — to nie je dohodnutá podmienka');
      ok(chyby.length === 0, 'pri tom nič nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Nové pravidlo úloh ────────────────────────────────────────────────
    // Zoznam tabuliek aj stĺpcov dáva databáza, takže formulár sa bez nej
    // nevykreslí správne — a práve to sa bez prehliadača otestovať nedá.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(() => {
        const FIELDS = {
          danubra_worker_documents: [
            { column_name: 'valid_to', data_type: 'date', kind: 'date' },
            { column_name: 'valid_from', data_type: 'date', kind: 'date' },
            { column_name: 'kind', data_type: 'text', kind: 'filter' },
          ],
          danubra_invoices: [
            { column_name: 'due_date', data_type: 'date', kind: 'date' },
            { column_name: 'invoice_number', data_type: 'text', kind: 'label' },
          ],
        };
        DB.list = async () => ({ data: [], error: null });
        DB.count = async () => 0;
        DB.rpc = async (fn, args) => {
          if (fn === 'rule_tables') {
            return { data: ['danubra_worker_documents', 'danubra_invoices'], error: null };
          }
          if (fn === 'rule_fields') return { data: FIELDS[args.p_table] || [], error: null };
          if (fn === 'preview_task_rule') {
            return { data: { count: 3, samples: ['Obnoviť a1 — končí 06.09.2026'] },
              error: null, _args: args };
          }
          return { data: null, error: null };
        };
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        return (async () => {
          Tsk.loaded = false;
          await Tsk.load();
          await Tsk.ruleForm();
          const card = () => document.querySelector('#ui-modal .modal-card');
          const res = {};
          res.otvorene = !!document.getElementById('rule-form');
          res.tabulky = [...document.querySelectorAll('[name=source_table] option')]
            .map(o => o.textContent.trim());
          res.datumy = [...document.querySelectorAll('#rule-date-field option')]
            .map(o => o.value);

          // Zmena tabuľky musí prebrať stĺpce — inak by ostal stĺpec,
          // ktorý v novej tabuľke neexistuje.
          document.querySelector('[name=source_table]').value = 'danubra_invoices';
          await Tsk.ruleChanged();
          res.poZmene = [...document.querySelectorAll('#rule-date-field option')]
            .map(o => o.value);

          // Skúška naprázdno.
          document.querySelector('[name=task_title_template]').value = 'Skontrolovať {label}';
          await Tsk.tryRule();
          res.skuska = document.getElementById('rule-try').innerText;

          // Neplatný kľúč musí byť vidieť hneď, nie až po uložení.
          document.querySelector('[name=key]').value = 'Zlý Kľúč';
          await Tsk.ruleChanged();
          res.problem = document.getElementById('rule-problems').innerText;

          UI.closeModal();
          return res;
        })();
      });

      ok(out.otvorene, 'formulár nového pravidla sa otvorí');
      ok(out.tabulky.includes('doklad pracovníka'),
        'tabuľky sú po slovensky', out.tabulky.join(', '));
      ok(out.datumy.includes('valid_to'), 'ponúka dátumové stĺpce z databázy');
      ok(out.poZmene.includes('due_date') && !out.poZmene.includes('valid_to'),
        'po zmene tabuľky sa stĺpce preberú', out.poZmene.join(', '));
      ok(out.skuska.includes('3'), 'skúška naprázdno povie, koľko úloh vznikne');
      ok(out.skuska.includes('Obnoviť a1'), 'a ukáže, ako budú vyzerať');
      ok(out.problem.toLowerCase().includes('kľúč'),
        'neplatný kľúč je vidieť hneď', out.problem.slice(0, 80));
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Telefón ───────────────────────────────────────────────────────────
    // Hodiny a výkaz sa zapisujú na stavbe, teda na telefóne. Keď sa stránka
    // posúva do boku, nedá sa to používať vôbec: pri každom ťahu prstom
    // odskočí obsah a spodné menu ujde mimo obrazovku.
    //
    // Presne to sa dialo na Úlohách: prepínač stavov mal `width:max-content`
    // bez stropu, roztiahol **celý dokument** na 635 px namiesto 390 a spodné
    // menu, ktoré je `position:fixed` cez šírku dokumentu, sa roztiahlo s ním.
    // V CSS bolo dvadsaťpäť `@media` pravidiel, takže to vyzeralo vyriešene —
    // na skutočnej šírke to nikto neotvoril.
    {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
        isMobile: true, hasTouch: true,
      });
      const page = await ctx.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      await page.evaluate(() => {
        DB.list = async () => ({ data: [], error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;
      });

      const routes = await page.evaluate(() =>
        Danubra.allNav().map(x => x[0]).filter(r => Danubra.routeAvailable(r)));

      const siroke = [];
      for (const r of routes) {
        await page.evaluate((x) => Danubra.go(x), r);
        await page.waitForTimeout(160);
        const o = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          okno: document.documentElement.clientWidth,
          // Čo presne pretieklo — bez toho sa to hľadá po jednom prvku.
          kto: [...document.querySelectorAll('#app *')]
            .filter((el) => {
              const b = el.getBoundingClientRect();
              return b.width && b.height
                && b.right - document.documentElement.clientWidth > 2
                && getComputedStyle(el).position !== 'fixed';
            })
            .map(el => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`)
            .slice(0, 3),
        }));
        if (o.scroll > o.okno + 2) siroke.push(`${r}: ${o.scroll}px (${o.kto.join(', ')})`);
      }
      ok(siroke.length === 0, `žiadna obrazovka sa na telefóne neposúva do boku (${routes.length})`,
        siroke.slice(0, 4).join('\n    '));

      // Na čo sa klepá prstom, musí byť dosť veľké. Odporúčanie je 44 px;
      // 40 je minimum, pod ktoré appka nesmie ísť.
      const male = await page.evaluate(() => {
        Danubra.go('timesheets');
        return new Promise((res) => setTimeout(() => {
          const out = [...document.querySelectorAll('.row-acts .btn')]
            .map(b => b.getBoundingClientRect())
            .filter(r => r.width < 40 || r.height < 40).length;
          res(out);
        }, 300));
      });
      ok(male === 0, 'tlačidlá v riadku sa dajú trafiť prstom', `${male} je menších než 40 px`);

      // Výkaz má dvanásť stĺpcov a na telefóne sa doň pozerá cez okienko
      // široké ako dlaň. Keď sa posunie do boku, meno musí zostať vidieť —
      // inak človek nevie, čí riadok práve číta.
      const meno = await page.evaluate(() => {
        // Výkaz sa bez partie nevykreslí — bez dát by test nemal čo merať.
        const DATA = {
          crews: [{ id: 'c1', name: 'Partia Nitra', status: 'active' }],
          crew_members: [{ crew_id: 'c1', worker_id: 'w1', role: 'leader' },
            { crew_id: 'c1', worker_id: 'w2', role: 'member' }],
          workers: [{ id: 'w1', full_name: 'Ján Novák' }, { id: 'w2', full_name: 'Peter Kováč' }],
          subcontracts: [{ id: 'sc1', title: 'Wohnpark', contract_number: 'ZAK-1',
            site_city: 'Stuttgart', partner_id: 'p1', status: 'active' }],
          partners: [{ id: 'p1', name: 'Vogel GmbH' }],
          hour_sheets: [],
        };
        DB.list = async (t) => ({ data: DATA[t] || [], error: null });
        // Výkaz si hodiny nedoťahuje cez `DB.list`, ale reťazeným dotazom.
        // Bez neho obrazovka zostane na „Načítavam…" a test by meral prázdno.
        const q = new Proxy({}, { get: (_t, k) =>
          (k === 'then' ? ((ok) => ok({ data: [], error: null })) : () => q) });
        DB.from = () => q;
        HS.loaded = false;
        HS.weekLoaded = false;
        Danubra.go('hoursheet');
        // Výkaz si dobieha ešte týždeň zvlášť, tak sa počká na tabuľku,
        // nie na pevný čas — inak test padá podľa rýchlosti stroja.
        const cakaj = (ms) => new Promise((r) => setTimeout(r, ms));
        return (async () => {
          for (let i = 0; i < 40 && !document.querySelector('.hs-table'); i++) await cakaj(100);
          return new Promise((res) => setTimeout(() => {
          const paper = document.querySelector('.hs-paper');
          const cell = document.querySelector('.hs-table .hs-name');
          if (!paper || !cell) return res({ preco: 'výkaz sa nevykreslil: '
            + (document.getElementById('view').innerText || '').slice(0, 120) });
          const pred = Math.round(cell.getBoundingClientRect().left);
          paper.scrollLeft = 200;
          setTimeout(() => res({
            pred, po: Math.round(cell.getBoundingClientRect().left),
            posun: paper.scrollLeft,
          }), 60);
          }, 50));
        })();
      });
      if (meno.preco) {
        ok(false, 'meno vo výkaze zostane vidieť pri posúvaní', meno.preco);
      } else {
        ok(meno.posun === 0 || Math.abs(meno.po - meno.pred) <= 2,
          'meno vo výkaze zostane vidieť aj po posunutí do boku',
          `pred ${meno.pred}px, po ${meno.po}px (posun ${meno.posun})`);
      }

      ok(chyby.length === 0, 'a na telefóne nič nespadne', chyby.slice(0, 3).join('; '));
      await ctx.close();
    }

    // ── Checklist pred nasadením ──────────────────────────────────────────
    // Osem z deviatich bodov sa počíta z dát. To sa dá otestovať aj bez
    // prehliadača; čo sa bez neho otestovať nedá, je či sa v detaile zákazky
    // naozaj vykreslia a **či sa dá klikať len na ten jeden ručný**.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(() => {
        const DATA = {
          subcontracts: [{ id: 'sc1', title: 'Stavba Ulm', work_type: 'construction',
            status: 'active', partner_id: 'p1', date_from: '2026-10-01',
            zoll_reported_at: '2026-09-20T09:00:00Z', transport_provided: true }],
          partners: [{ id: 'p1', name: 'GU Ulm GmbH', country: 'DE' }],
          workers: [{ id: 'w1', full_name: 'Jozef Malý', status: 'deployed',
            legal_form: 'szco' }],
          // Má všetko okrem A1.
          worker_documents: [
            { id: 'd1', worker_id: 'w1', kind: 'id_card', valid_from: '2020-01-01', valid_to: '2030-01-01' },
            { id: 'd2', worker_id: 'w1', kind: 'trade_licence', valid_from: '2020-01-01', valid_to: null },
            { id: 'd3', worker_id: 'w1', kind: 'contract', valid_from: '2026-09-01', valid_to: '2027-01-01' },
          ],
          assignments: [{ id: 'a1', subcontract_id: 'sc1', worker_id: 'w1',
            status: 'active', date_from: '2026-10-01', date_to: '2026-12-31' }],
          overrides: [], assignment_checks: [],
          v_worker_stay: [{ worker_id: 'w1', subcontract_id: 'sc1',
            date_from: '2026-09-28', date_to: null }],
        };
        DB.list = async (t) => ({ data: DATA[t] || [], error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        return (async () => {
          Sub.loaded = false;
          await Sub.load();
          const view = document.getElementById('view');
          // `Sub.detail()` ide cez router a adresu; tu ide o samotnú
          // obrazovku, tak sa vykreslí priamo. Checklist je v kroku 4
          // (Papiere ľudí), zbalený pod zoznamom ľudí.
          Sub.step = 'papiere';
          await Sub.profile(view, 'sc1');
          view.querySelectorAll('details').forEach(d => { d.open = true; });
          const t = view.innerText;
          // Odškrtávacie tlačidlo smie byť jediné — to na pokyny.
          const ticks = [...view.querySelectorAll('button')]
            .filter(b => (b.getAttribute('onclick') || '').includes('toggleCheck'))
            .map(b => b.getAttribute('onclick'));
          Sub.whyCheck('a1');
          const why = document.querySelector('#ui-modal .modal-card');
          const whyText = why ? why.innerText : '';
          UI.closeModal();
          return {
            // `.form-section` je v CSS uppercase a innerText to rešpektuje.
            head: t.toLowerCase().includes('pred nasadením'),
            veta: t.includes('Nástup blokuje'),
            a1: t.includes('Platné A1'),
            zivnost: t.includes('Živnostenský list'),
            zoll: t.includes('Zapísané na zákazke'),
            pobyt: t.includes('Má pobyt na celý čas nasadenia'),
            ticks, whyText,
          };
        })();
      });

      ok(out.head, 'checklist je v detaile zákazky');
      ok(out.veta, 'a začína vetou, čo blokuje nástup');
      ok(out.a1, 'chýbajúce A1 je v ňom vidieť');
      ok(out.zivnost, 'a živnostenský list, ktorý vo v1 chýbal, tiež');
      ok(out.zoll, 'čo je zo zákazky, to povie');
      ok(out.pobyt, 'ubytovanie sa číta z pobytov');
      ok(out.ticks.length === 1, 'odškrtnúť sa dá jediný bod',
        `našiel som ${out.ticks.length}: ${out.ticks.join(', ')}`);
      ok(out.ticks[0] && out.ticks[0].includes('instructions'),
        'a je to ten, ktorý appka vedieť nemôže');
      ok(out.whyText.includes('Sociálna poisťovňa'), 'pri každom bode je „prečo"');
      ok(out.whyText.includes('kartotéky'), 'aj to, odkiaľ sa odpoveď berie');
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Objednávky ────────────────────────────────────────────────────────
    // Formulár skladá číselníky až za behu a pri objednávke živnostníkovi
    // ponúka len nasadenia, ktoré ešte objednávku nemajú. Oboje sa dá pokaziť
    // tak, že sa to v kóde nevidí.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(() => {
        const DATA = {
          partners: [{ id: 'p1', name: 'Vogel GmbH' }],
          workers: [{ id: 'w1', full_name: 'Ján Novák' }, { id: 'w2', full_name: 'Peter Kováč' }],
          subcontracts: [{ id: 's1', title: 'Stavba Ulm', contract_number: 'ZAK-1' }],
          contracts: [],
          assignments: [
            { id: 'a1', subcontract_id: 's1', worker_id: 'w1', status: 'active' },
            { id: 'a2', subcontract_id: 's1', worker_id: 'w2', status: 'active' },
          ],
          work_orders: [
            { id: 'o1', kind: 'customer', order_number: 'OBJ-2026-0001', title: 'Trockenbau',
              partner_id: 'p1', subcontract_id: 's1', their_ref: '4500123456',
              status: 'confirmed', scope: 'Wände 2. OG' },
            // Nasadenie a1 už objednávku má — vo výbere sa nesmie ponúknuť znova.
            { id: 'o2', kind: 'worker', order_number: 'OBJ-2026-0002', title: 'Priečky',
              worker_id: 'w1', assignment_id: 'a1', subcontract_id: 's1', status: 'sent' },
          ],
        };
        DB.list = async (t) => ({ data: DATA[t] || [], error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: 'OBJ-2026-0003', error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        return (async () => {
          const view = document.getElementById('view');
          Danubra.route = 'orders';
          Ord.loaded = false;
          await Danubra.views.orders.call(Danubra, view);
          const odberatel = view.innerText;
          const kariet = view.querySelectorAll('#ord-list .card').length;

          Ord.setKind('worker');
          await new Promise(r => setTimeout(r, 60));
          const zivnostnik = document.getElementById('view').innerText;

          // Formulár pre živnostníka: ponúknu sa len voľné nasadenia.
          Ord.form();
          const sel = document.querySelector('#ui-modal select[name="assignment_id"]');
          const moznosti = sel ? [...sel.options].map(o => o.textContent.trim()) : [];
          const maPlus = !!document.querySelector('#ui-modal select[name="assignment_id"]')
            && !document.querySelector('#ui-modal .fld-pick select[name="assignment_id"]');
          UI.closeModal();

          Ord.setKind('customer');
          await new Promise(r => setTimeout(r, 60));
          Ord.form();
          const maIchCislo = !!document.querySelector('#ui-modal input[name="their_ref"]');
          const hint = (document.querySelector('#ui-modal input[name="their_ref"]')
            ?.closest('.fld')?.querySelector('.fld-hint')?.textContent) || '';
          UI.closeModal();

          return { odberatel, zivnostnik, kariet, moznosti, maPlus, maIchCislo, hint };
        })();
      });

      ok(out.kariet === 1, 'zobrazia sa len objednávky vybranej strany',
        `kariet: ${out.kariet}`);
      ok(/4500123456/.test(out.odberatel),
        'číslo odberateľa je vidieť na karte — kvôli nemu sa zapisuje');
      ok(/ide na faktúru/.test(out.odberatel), 'aj to, načo je');
      ok(/Priečky/.test(out.zivnostnik), 'prepnutie strany ukáže objednávky živnostníkom');

      ok(out.moznosti.length === 2,
        'vo výbere je len nasadenie, ktoré objednávku ešte nemá (plus prázdna voľba)',
        out.moznosti.join(' | '));
      ok(out.moznosti.some(m => /Peter Kováč/.test(m)), 'a je to to voľné');
      ok(!out.moznosti.some(m => /Ján Novák/.test(m)),
        'nasadenie s objednávkou sa neponúkne druhýkrát');
      ok(out.maPlus, 'pri nasadení sa nové nezakladá — vyberá sa z existujúcich');

      ok(out.maIchCislo, 'pri objednávke od odberateľa sa pýta jeho číslo');
      ok(/neprepustí|faktúru/.test(out.hint),
        'a je vysvetlené, prečo naň treba', out.hint);
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Kde sú peniaze ────────────────────────────────────────────────────
    // Obrazovka, podľa ktorej sa rozhodne, či sa naberú ďalší ľudia. Keď
    // klame, klame smerom k míňaniu — preto sa tu kontroluje najmä to, čo sa
    // do voľných peňazí započítať nesmie.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(() => {
        const DATA = {
          subcontracts: [{ id: 's1', title: 'Stavba Ulm', status: 'active', charge_rate: '30' }],
          assignments: [{ id: 'a1', subcontract_id: 's1', worker_id: 'w1',
            status: 'active', charge_rate: '30' }],
          timesheets: [{ id: 't1', assignment_id: 'a1', hours: 10,
            work_date: '2026-10-01', period_id: null }],
          periods: [],
          invoices: [{ id: 'i1', invoice_number: '2026030', status: 'sent', total: '1000',
            amount_net: '850', withholding_amount: '150', due_date: '2026-09-01',
            partner_id: 'p1' }],
          costs: [],
          partners: [{ id: 'p1', name: 'GU Ulm GmbH' }],
          v_cashflow: [
            // Po splatnosti — nesmie zvýšiť voľné peniaze.
            { expected_on: '2026-09-01', amount: '850', source: 'invoice' },
            // Záväzok o dva týždne.
            { expected_on: '2026-10-20', amount: '-600', source: 'bill' },
          ],
          bank_transactions: [{ amount: '2000' }],
        };
        DB.list = async (t) => ({ data: DATA[t] || [], error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        Cfg.row = { id: 'c', staffing: { cash_buffer_min: 500 } };
        Cfg.loaded = true;
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        return (async () => {
          const view = document.getElementById('view');
          Danubra.route = 'money';
          Mon.loaded = false;
          await Danubra.views.money.call(Danubra, view);
          const x = Mon.data();
          const st = DanubraPosition.stages(x);
          const sp = DanubraPosition.spendable({
            today: x.today, balance: Mon.balance, items: Mon.cashflow,
            weeks: 8, reserve: Mon.reserve() });
          return {
            stadii: view.querySelectorAll('.ms').length,
            maTodo: [...view.querySelectorAll('.ms-lead strong')].length,
            tabulka: view.querySelectorAll('.kpi-table tbody tr').length,
            najhorsi: view.querySelectorAll('.kpi-table tr.is-worst').length,
            text: view.innerText,
            unbilled: (st.find(s => s.key === 'unbilled') || {}).cents,
            overdueStage: (st.find(s => s.key === 'overdue') || {}).cents,
            withheld: (st.find(s => s.key === 'withheld') || {}).cents,
            free: sp.free, start: sp.start, unreliable: sp.unreliable,
            rezerva: Mon.reserve(),
          };
        })();
      });

      ok(out.stadii === 7, 'sedem štádií, kde môžu peniaze stáť',
        `našiel som ${out.stadii}`);
      ok(out.maTodo >= 5, 'pri štádiu, ktoré sa dá pohnúť, je napísané čo spraviť',
        `s návodom: ${out.maTodo}`);
      ok(out.unbilled === 30000, '10 hodín po 30 € je odrobené a nevyfakturované',
        String(out.unbilled));
      ok(out.overdueStage === 85000, 'po splatnosti sa počíta suma po zrážke §48b',
        String(out.overdueStage));
      ok(out.withheld === 15000, 'a zrážka je vedená zvlášť', String(out.withheld));

      // Toto je to, kvôli čomu obrazovka vznikla.
      ok(out.start === 200000, 'na účte je 2 000 €', String(out.start));
      ok(out.unreliable === 85000, 'faktúra po splatnosti je vidieť zvlášť',
        String(out.unreliable));
      ok(out.free === 90000,
        'voľné = 2 000 − 600 záväzok − 500 rezerva. Faktúra po splatnosti ich nezvýši',
        String(out.free));
      ok(out.najhorsi === 1, 'najnižší týždeň je v tabuľke zvýraznený');
      ok(/po splatnosti/.test(out.text),
        'a je napísané, že sa faktúry po splatnosti do výhľadu nerátajú');
      // Popisky sú v CSS veľkými písmenami a `innerText` to rešpektuje.
      ok(/stojí na nás/i.test(out.text) && /čaká sa na odberateľa/i.test(out.text),
        'súhrn rozlišuje, čo sa dá pohnúť vlastnou rukou', out.text.slice(0, 200));
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Založiť nový rovno pri výbere ─────────────────────────────────────
    // Celý zmysel je v jednej vete: **rozpísaný formulár sa nesmie stratiť.**
    // Keby sa pri zakladaní zavrel, bolo by to to isté ako ísť do iného modulu
    // — len s menším počtom klikov.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(() => {
        const DATA = {
          partners: [{ id: 'p1', name: 'Vogel GmbH', country: 'DE' }],
          trades: [{ key: 'trockenbau', name_sk: 'Sadrokartón' }],
          quotes: [],
        };
        DB.list = async (t) => ({ data: DATA[t] || [], error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        // Vložka vráti nový záznam tak, ako to robí databáza.
        DB.insert = async (table, payload) => ({
          data: { id: 'novy-1', ...payload }, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        return (async () => {
          Quo.loaded = false;
          await Quo.load();
          Quo.form();
          const nazov = document.querySelector('#ui-modal input[name="title"]');
          if (nazov) nazov.value = 'Rozpísaná ponuka';
          const tlacidiel = document.querySelectorAll('#ui-modal .pick-add').length;

          Danubra.quickAdd('partner', 'partner_id');
          await new Promise(r => setTimeout(r, 120));
          const otvorene = {
            okno: !!document.getElementById('ui-ask'),
            formular: !!document.getElementById('ui-modal'),
            poli: document.querySelectorAll('#ui-ask .fld').length,
          };

          // Povinné pole prázdne — okno sa nesmie zavrieť a zahodiť vypísané.
          document.querySelector('#ui-ask [data-ask=ok]').click();
          await new Promise(r => setTimeout(r, 80));
          const poPrazdnom = !!document.getElementById('ui-ask');

          document.getElementById('ask-f-name').value = 'Neue Bau GmbH';
          document.getElementById('ask-f-city').value = 'Ulm';
          document.querySelector('#ui-ask [data-ask=ok]').click();
          await new Promise(r => setTimeout(r, 400));

          const sel = document.querySelector('#ui-modal select[name="partner_id"]');
          const t2 = document.querySelector('#ui-modal input[name="title"]');
          return {
            tlacidiel, otvorene, poPrazdnom,
            moznosti: sel ? sel.options.length : 0,
            vybrane: sel ? sel.value : null,
            popisVybraneho: sel && sel.selectedIndex >= 0
              ? sel.options[sel.selectedIndex].textContent.trim() : null,
            nazovPrezil: t2 ? t2.value : null,
            formularZostal: !!document.getElementById('ui-modal'),
            oknoZatvorene: !document.getElementById('ui-ask'),
            staleQuo: Quo.loaded,
          };
        })();
      });

      ok(out.tlacidiel >= 2, 'pri výberoch cudzieho záznamu je tlačidlo na založenie',
        `našiel som ${out.tlacidiel}`);
      ok(out.otvorene.okno && out.otvorene.formular,
        'okno sa otvorí nad formulárom a formulár zostane', JSON.stringify(out.otvorene));
      ok(out.otvorene.poli === 3, 'a pýta sa len to podstatné',
        `polí: ${out.otvorene.poli}`);
      ok(out.poPrazdnom,
        'bez povinného poľa sa okno nezavrie a nezahodí, čo je vypísané');
      ok(out.vybrane === 'novy-1', 'založený záznam sa rovno vyberie',
        String(out.vybrane));
      ok(out.popisVybraneho === 'Neue Bau GmbH', 'aj so svojím menom',
        String(out.popisVybraneho));
      ok(out.nazovPrezil === 'Rozpísaná ponuka',
        'a rozpísaný formulár sa nestratil — to je celý dôvod, prečo to vzniklo',
        String(out.nazovPrezil));
      ok(out.formularZostal && out.oknoZatvorene, 'okno sa zavrelo, formulár zostal');
      ok(out.staleQuo === false,
        'modul si zoznam pri najbližšom otvorení dotiahne znova');

      // Každý typ v registri musí vedieť povedať, ako sa volá, čo sa doplní
      // neskôr, a aké polia pýta. Prázdny alebo polovičný záznam by sa založil
      // ticho a hľadalo by sa, prečo nemá meno.
      const register = await page.evaluate(() => Object.entries(Danubra.NEW)
        .map(([k, d]) => ({
          k, what: d.what, lead: (d.lead || '').length,
          povinne: d.fields({}).filter(f => f[2] && f[2].required).length,
          poli: d.fields({}).length,
          maLabel: typeof d.label === 'function',
          stale: (d.stale || []).length,
        })));
      ok(register.length >= 8, 'zakladať sa dá každý druh záznamu, ktorý sa vyberá',
        `v registri je ${register.length}`);
      ok(register.every(r => r.what && r.lead > 30 && r.maLabel),
        'každý má názov, vetu o tom, čo sa doplní neskôr, a vie sa pomenovať',
        JSON.stringify(register.filter(r => !(r.what && r.lead > 30 && r.maLabel))));
      ok(register.every(r => r.povinne >= 1),
        'a aspoň jedno povinné pole — bezmenný záznam sa potom len hľadá',
        JSON.stringify(register.filter(r => !r.povinne)));
      ok(register.every(r => r.poli <= 3),
        'pýta sa najviac tri veci — zvyšok patrí do jeho modulu',
        JSON.stringify(register.filter(r => r.poli > 3)));
      ok(register.every(r => r.stale >= 1),
        'a každý povie, ktorým modulom tým zastaral zoznam',
        JSON.stringify(register.filter(r => !r.stale)));
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Stundennachweis ───────────────────────────────────────────────────
    // Papier, ktorý na stavbe podpisuje nemecký odberateľ. Tri veci na ňom
    // boli zle a žiadna z nich nebola vidieť z kódu:
    //   * dve takmer rovnaké potvrdzovacie vety,
    //   * IČO sa nevytlačilo nikdy (`sup.ico`, kým Nastavenia to pole volajú
    //     `company_id`),
    //   * natvrdo zapísané meno firmy a adresa ako záloha.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(() => {
        const DATA = {
          crews: [{ id: 'c1', name: 'Partia Nitra', status: 'active' }],
          crew_members: [{ crew_id: 'c1', worker_id: 'w1', left_at: null }],
          workers: [{ id: 'w1', full_name: 'Jozef Malý' }],
          subcontracts: [{ id: 's1', title: 'Stavba Ulm', contract_number: 'ZAK-1',
            site_city: 'Ulm', partner_id: 'p1', status: 'active' }],
          partners: [{ id: 'p1', name: 'GU Ulm GmbH' }],
          timesheets: [], hour_sheets: [],
        };
        DB.list = async (t) => ({ data: DATA[t] || [], error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        return (async () => {
          // Nastavenia sú prázdne — doklad si nesmie nič domyslieť. Riadok
          // nastavení drží `Danubra`, nie obrazovka Nastavení: dokument ho má
          // mať aj vtedy, keď na Nastaveniach nikto nebol.
          Danubra.cfgRow = { id: 'cfg', supplier: {} };
          Cfg.row = Danubra.cfgRow; Cfg.loaded = true;
          HS.loaded = false;
          await HS.load();
          const prazdny = HS.paperHtml ? HS.paperHtml() : '';
          const view = document.getElementById('view');
          Danubra.route = 'hoursheet';
          await Danubra.views.hoursheet.call(Danubra, view);
          const html = view.innerHTML;
          const text = view.innerText;
          return {
            html, text, prazdny,
            vety: (html.match(/Mit der Unterschrift/g) || []).length,
            znacka: !!view.querySelector('.hs-brandrow svg'),
          };
        })();
      });

      ok(out.vety === 1, 'na výkaze je jedna potvrdzovacia veta, nie dve takmer rovnaké',
        `našiel som ${out.vety}`);
      const bezKomentarov = out.html.replace(/<!--[\s\S]*?-->/g, '');
      ok(!/wird nachgereicht/.test(bezKomentarov),
        'na doklade pre odberateľa nestojí, že daňové číslo ešte len príde');
      ok(!/Podzámska|Partner und Service/.test(bezKomentarov),
        'pri prázdnych Nastaveniach sa nevytlačí vymyslené meno ani adresa');
      ok(/Gesamt/.test(out.text) && !/\bTotal\b/.test(out.text),
        'súčtový riadok je po nemecky, ako zvyšok dokladu');
      ok(out.znacka, 'výkaz má tú istú značku ako faktúra a zmluva');
      // Pôvodný papier od odberateľa má riadok „Pause" a polier ho hľadá.
      ok(/Pause/.test(out.text), 'na výkaze je riadok Pause, ako na papieri odberateľa');
      // IČO: pole sa musí čítať tam, kam ho Nastavenia ukladajú.
      const ico = await page.evaluate(() => {
        Danubra.cfgRow = { id: 'cfg', supplier: { name: 'Firma s.r.o.', company_id: '55667788' } };
        const view = document.getElementById('view');
        return Danubra.views.hoursheet.call(Danubra, view).then(() => view.innerText);
      });
      ok(/55667788/.test(ico), 'IČO z Nastavení sa na výkaze objaví', ico.slice(-180));

      // Nepodpísaný výkaz sa tlačí a nesie na stavbu na podpis. Pole `number`
      // musí mať hodnotu s bodkou, ale na papier pre Nemca patrí čiarka.
      const tlac = await page.evaluate(async () => {
        // Hodiny do výkazu, nech je čo formátovať. Osem a pol sa po nemecky
        // píše „8,5" — a presne to musí byť na papieri.
        const view = document.getElementById('view');
        const d = DanubraHourSheet.weekDates(HS.year, HS.week)[0].date;
        HS.timesheets = [{ id: 't1', worker_id: 'w1', assignment_id: 'a1',
          work_date: d, hours: 8.5, time_from: '07:00', time_to: '16:30' }];
        HS.assignments = [{ id: 'a1', worker_id: 'w1', subcontract_id: 's1', status: 'active' }];
        // `loadWeek()` si hodiny pri každom prekreslení doťahuje z databázy
        // a prepísal by to, čo sme sem práve dali.
        HS.loadWeek = async () => {};
        await Danubra.views.hoursheet.call(Danubra, view);
        const bunky = [...view.querySelectorAll('.hs-h')];
        const sPolom = bunky.filter(e => e.querySelector('input'));
        const sCiarkou = bunky.find(e => (e.getAttribute('data-h') || '').includes(','));
        return {
          buniek: bunky.length,
          sPolom: sPolom.length,
          bezDataH: sPolom.filter(e => !e.hasAttribute('data-h')).length,
          nemecky: sCiarkou ? sCiarkou.getAttribute('data-h') : null,
          vPoli: sCiarkou ? sCiarkou.querySelector('input').value : null,
          skryteVTlaci: null,
        };
      });
      ok(tlac.sPolom > 0, 'nepodpísaný výkaz sa dá vyplniť priamo v tabuľke');
      ok(tlac.bezDataH === 0,
        'každá vyplniteľná bunka nesie aj nemecký tvar čísla pre tlač',
        `bez neho: ${tlac.bezDataH}`);
      ok(tlac.nemecky === '8,5',
        'na papier ide „8,5", nie „8.5"', String(tlac.nemecky));
      ok(tlac.vPoli === '8.5',
        'kým pole samo musí mať bodku — inak ho prehliadač neprijme',
        String(tlac.vPoli));

      // A pri tlači sa pole schová a ukáže sa to číslo.
      await page.emulateMedia({ media: 'print' });
      const vTlaci = await page.evaluate(() => {
        const td = [...document.querySelectorAll('.hs-h[data-h]')]
          .find(e => (e.getAttribute('data-h') || '').includes(','));
        if (!td) return null;
        return { pole: getComputedStyle(td.querySelector('input')).display,
          text: getComputedStyle(td, '::after').content };
      });
      await page.emulateMedia({ media: 'screen' });
      ok(vTlaci && vTlaci.pole === 'none', 'pri tlači sa vstupné pole nevytlačí',
        JSON.stringify(vTlaci));
      ok(vTlaci && /8,5/.test(vTlaci.text), 'a na jeho mieste je nemecké číslo',
        JSON.stringify(vTlaci));
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Ako to ide ────────────────────────────────────────────────────────
    // Mapa reťazca je obrazovka, ktorá má človeka naučiť poradie práce. Keby
    // sa na nej nevykreslili vety, zostane z nej zoznam čísel — a ten už
    // v appke je. Preto sa tu kontroluje, že vety tam naozaj sú.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(() => {
        const DATA = {
          // Nábor beží, ale inzerát nie — a nikomu sme nezavolali.
          recruitment_plans: [{ id: 'r1', status: 'active', headcount: 4 }],
          ads: [],
          candidates: [{ id: 'c1', status: 'new', first_contact_at: null }],
        };
        DB.list = async (t) => ({ data: DATA[t] || [], error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        return (async () => {
          const view = document.getElementById('view');
          Danubra.route = 'flow';
          await Danubra.views.flow.call(Danubra, view);
          const kroky = [...view.querySelectorAll('.fl-step')].map(e => ({
            n: e.querySelector('.fl-n').textContent.trim(),
            title: e.querySelector('.fl-title').textContent.trim(),
            lead: e.querySelector('.fl-lead').textContent.trim(),
            todo: e.querySelector('.fl-todo').textContent.trim(),
            next: e.querySelector('.fl-next').textContent.trim(),
            help: !!e.querySelector('.help-btn'),
            go: !!e.querySelector('.fl-go'),
            cls: e.className,
          }));
          // Mapa sa kreslí z horného pruhu, nie z ľavého menu — tam sedela
          // medzi dennou prácou a vyzerala ako ďalšia agenda.
          Danubra._buildNav();
          const text = (sel) => [...document.querySelectorAll(sel)]
            .map(e => e.textContent.replace(/\s+/g, ' ').trim());

          return {
            kroky,
            drahy: [...view.querySelectorAll('.fl-lane-head h2')].map(h => h.textContent.trim()),
            headline: view.querySelector('.headline').textContent.replace(/\s+/g, ' ').trim(),
            hore: text('#top-links .top-link'),
            vlavo: text('#sidebar-nav .nav-item .nav-text'),
            horeAktivne: text('#top-links .top-link.active'),
            zalozky: text('#view .subtabs .subtab .subtab-txt b'),
            zalozkaAktivna: text('#view .subtabs .subtab.active .subtab-txt b'),
          };
        })();
      });

      // Sedem krokov tak, ako ich pomenoval majiteľ — nie štrnásť podľa toho,
      // čo je v databáze.
      ok(out.kroky.length === 7, 'mapa má sedem krokov',
        `má ${out.kroky.length}`);
      ok(out.kroky.map(k => k.n).join(',') === '1,2,3,4,5,6,7',
        'a sú očíslované po poradí', out.kroky.map(k => k.n).join(','));
      ok(out.kroky.map(k => k.title).join(' | ')
        === 'Dopyt na zákazku | Inzeráty a záujemcovia | Objednávka a zmluva s Nemcom'
          + ' | Súhlas GDPR od živnostníka | Zmluva so živnostníkom'
          + ' | Objednávka a papiere v poriadku | Ubytovanie, hodiny a faktúry',
      'a sú to jeho kroky, nie názvy tabuliek', out.kroky.map(k => k.title).join(' | '));
      ok(out.drahy.length === 0, 'žiadne dráhy — je to jedna cesta zhora nadol',
        out.drahy.join(' | '));
      ok(out.kroky.every(k => k.lead && k.next),
        'každý krok povie, čo to je aj čo je po ňom');
      ok(out.kroky.every(k => k.help),
        'a každý má vysvetlivku — to je celý zmysel tejto obrazovky');
      ok(out.kroky.every(k => k.go), 'z každého kroku sa dá ísť tam, kde sa rieši');

      // Hlavička musí ukázať najskorší zaseknutý krok, nie posledný.
      ok(/kroku 2/.test(out.headline),
        'hlavička ukáže najskorší zaseknutý krok', out.headline);
      ok(/inzerát/i.test(out.kroky[1].todo) || /ozvať/.test(out.kroky[1].todo),
        'nábor bez inzerátu je vidieť ako chyba', out.kroky[1].todo);
      ok(/fl-bad/.test(out.kroky[1].cls), 'a je červený');

      // Mapa je záložka „Dnes" — je to pohľad na to isté, nie ďalšia agenda.
      ok(out.zalozky.includes('Ako to ide'), '„Ako to ide" je záložka pri Dnes',
        out.zalozky.join(', '));
      ok(!out.vlavo.includes('Ako to ide'), 'a nie v ľavom menu',
        out.vlavo.join(', '));
      ok(out.vlavo.includes('Dnes') && out.vlavo.includes('Zákazky'),
        'ľavé menu je inak celé', out.vlavo.length + ' položiek');
      ok(out.zalozkaAktivna.includes('Ako to ide'),
        'a keď je otvorená, záložka je zvýraznená', out.zalozkaAktivna.join(', '));
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Možnosti: nízky prah a overenie, ktoré nelže ──────────────────────
    // Možnosť je to, čo príde telefonátom. Dve veci sú na nej podstatné:
    // formulár musí byť taký krátky, aby to kolega naozaj zapísal, a overenie
    // firmy nesmie z „register neodpovedal" spraviť „firma neexistuje".
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(async () => {
        const DATA = {
          opportunities: [
            { id: 'o1', title: 'Kotolňa Wörthsee', status: 'new',
              company_name: 'GU Ulm GmbH', created_at: '2026-10-12T08:00:00Z' },
            { id: 'o2', title: 'Hala Pasing', status: 'checking',
              company_name: 'Bau Pasing GmbH', company_vat: 'DE999999999',
              contact_phone: '+49 170 1', trade_key: 'zvarac', headcount: 2,
              city: 'München', rate_client: 34, rate_worker: 22,
              start_date: '2026-12-01', created_at: '2026-10-05T08:00:00Z' },
          ],
          trades: [{ key: 'zvarac', name_sk: 'Zvárač' }],
        };
        DB.list = async (t) => ({ data: (DATA[t] || []).map(x => ({ ...x })), error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        const zapisy = [];
        DB.insert = async (t, row) => { zapisy.push([t, row]); return { data: { id: 'new', ...row }, error: null }; };
        DB.update = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        const view = document.getElementById('view');
        Danubra.route = 'opportunities';
        Opp.loaded = false; Opp.openId = null;
        Opp.filters = { status: '', q: '' };
        await Danubra.views.opportunities.call(Danubra, view);

        const box = view.querySelector('.nowbox');
        const teraz = {
          title: box ? box.querySelector('.nowbox-title').textContent.trim() : '',
          sub: box ? box.querySelector('.nowbox-sub').textContent.trim() : '',
          why: box ? box.querySelector('.nowbox-why').textContent.trim() : '',
          onclick: box && box.querySelector('.btn')
            ? box.querySelector('.btn').getAttribute('onclick') : '',
          hot: !!view.querySelector('.nowbox-hot'),
        };

        // Formulár musí byť krátky, inak to nikto nezapíše.
        Opp.form();
        const polia = [...document.querySelectorAll('#opp-form [name]')].map(e => e.name);
        UI.closeModal();

        // Otvorená možnosť: overenie firmy, keď register neodpovedal.
        Opp.items[1].verify_result = { unavailable: true, reason: 'http_503' };
        Opp.openId = 'o2';
        await Danubra.views.opportunities.call(Danubra, view);
        const firma = {
          label: (view.querySelector('.nowbox-title') || {}).textContent || '',
          detail: (view.querySelector('.nowbox-sub') || {}).textContent || '',
          hot: !!view.querySelector('.nowbox-hot'),
        };

        // A keď register firmu nepozná — to už je iná vec.
        Opp.items[1].verify_result = { valid: false };
        await Danubra.views.opportunities.call(Danubra, view);
        const neplatna = {
          label: (view.querySelector('.nowbox-title') || {}).textContent || '',
          hot: !!view.querySelector('.nowbox-hot'),
        };

        return { teraz, polia, firma, neplatna, zapisy };
      });

      // Nový dopyt je prvý a horí.
      ok(/Ozvať sa na nový dopyt/.test(out.teraz.title),
        'možnosti začínajú tým, že sa treba ozvať', out.teraz.title);
      ok(out.teraz.hot, 'a horí to — odberateľ sa pýta viacerých');
      ok(/kto sa ozve prvý/.test(out.teraz.why),
        's dôvodom, ktorý nie je o appke', out.teraz.why);
      ok(/Opp\.detail\('o1'\)/.test(out.teraz.onclick || ''),
        'tlačidlo vedie na tú, čo čaká najdlhšie', out.teraz.onclick);

      // Nízky prah: štyri polia.
      ok(out.polia.length === 4,
        'formulár má štyri polia — vysoký prah znamená, že sa možnosť nezapíše',
        out.polia.join(', '));
      ok(out.polia.includes('title') && out.polia.includes('contact_phone')
        && out.polia.includes('brief'),
        'a sú to tie, bez ktorých sa možnosť nepohne', out.polia.join(', '));

      // Toto je to podstatné na overovaní.
      ok(/Register neodpovedal/.test(out.firma.label),
        'keď register neodpovie, povie sa to tak', out.firma.label);
      ok(/nie je to to isté/i.test(out.firma.detail),
        'a výslovne, že to nie je „firma neexistuje"', out.firma.detail);
      ok(!out.firma.hot, 'nedostupnosť registra nehorí — treba to skúsiť neskôr');

      ok(/USt-IdNr neplatné/.test(out.neplatna.label),
        'keď register firmu nepozná, povie sa to inak', out.neplatna.label);
      ok(out.neplatna.hot, 'a to už horí');

      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Compliance: najskôr človek na stavbe bez A1 ───────────────────────
    // Obrazovka bola zoznam pravidiel so štyrmi číslami. Z toho sa nedalo
    // povedať, čo zastaví stavbu najskôr — a pri compliance sú lehoty celý
    // problém (A1 až 45 dní, Freistellung §48b štyri až osem týždňov).
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(async () => {
        const dnes = new Date().toISOString().slice(0, 10);
        const posun = (dni) => {
          const d = new Date(dnes + 'T00:00:00Z');
          d.setUTCDate(d.getUTCDate() + dni);
          return d.toISOString().slice(0, 10);
        };
        // Všetky firemné povolenia platné — nech je na rade A1.
        const POVOLENIA = ['ust_idnr', 'soka_registration', 'handwerksrolle', 'freistellung_48b']
          .map((kind, i) => ({ id: `c${i}`, scope: 'company', kind,
            valid_from: posun(-200), valid_to: posun(300), status: 'active' }));
        const DATA = {
          compliance: POVOLENIA,
          workers: [
            { id: 'w1', full_name: 'Jozef Malý', status: 'deployed' },
            { id: 'w2', full_name: 'Milan Starý', status: 'deployed' },
          ],
          // Jozef má A1, Milan nemá vôbec — a je na stavbe.
          worker_documents: [{ id: 'd1', worker_id: 'w1', kind: 'a1',
            valid_from: posun(-100), valid_to: posun(200) }],
        };
        DB.list = async (t) => ({ data: (DATA[t] || []).map(x => ({ ...x })), error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        const view = document.getElementById('view');
        Danubra.route = 'compliance';
        Cmp.loaded = false;
        await Danubra.views.compliance.call(Danubra, view);

        const čítaj = () => {
          const box = view.querySelector('.nowbox');
          return {
            title: box ? box.querySelector('.nowbox-title').textContent.trim() : '',
            sub: box ? box.querySelector('.nowbox-sub').textContent.trim() : '',
            why: box ? box.querySelector('.nowbox-why').textContent.trim() : '',
            onclick: box && box.querySelector('.btn')
              ? box.querySelector('.btn').getAttribute('onclick') : '',
            hot: !!view.querySelector('.nowbox-hot'),
            help: !!(box && box.querySelector('.help-btn')),
          };
        };
        const bezA1 = čítaj();

        // Doplň Milanovi A1 → na rade je povolenie, ktorému sa končí platnosť.
        Cmp.workerDocs = [
          ...DATA.worker_documents,
          { id: 'd2', worker_id: 'w2', kind: 'a1', valid_from: posun(-50), valid_to: posun(200) },
        ];
        Cmp.items = [...POVOLENIA.filter(p => p.kind !== 'freistellung_48b'),
          { id: 'c9', scope: 'company', kind: 'freistellung_48b',
            valid_from: posun(-300), valid_to: posun(20), status: 'active' }];
        await Danubra.views.compliance.call(Danubra, view);
        const konciPovolenie = čítaj();

        return { bezA1, konciPovolenie };
      });

      ok(/bez platného A1/.test(out.bezA1.title),
        'compliance začína človekom na stavbe bez A1', out.bezA1.title);
      ok(out.bezA1.hot, 'a horí to — je už na stavbe');
      ok(/Milan Starý/.test(out.bezA1.sub), 'vo vete je jeho meno', out.bezA1.sub);
      ok(!/Jozef Malý/.test(out.bezA1.sub),
        'a kto A1 má, tam nie je', out.bezA1.sub);
      ok(/padne na nás/.test(out.bezA1.why), 'povie, na koho to pri kontrole padne',
        out.bezA1.why);
      ok(/45 dní/.test(out.bezA1.why), 'aj koľko trvá vybavenie', out.bezA1.why);
      ok(/Danubra\.go\('workers'\)/.test(out.bezA1.onclick || ''),
        'tlačidlo vedie na živnostníkov', out.bezA1.onclick);
      ok(out.bezA1.help, 'a je pri tom vysvetlivka');

      ok(/Obnoviť firemné povolenie/.test(out.konciPovolenie.title),
        'keď majú všetci A1, na rade je povolenie pred koncom platnosti',
        out.konciPovolenie.title);
      ok(/Freistellungsbescheinigung/.test(out.konciPovolenie.sub),
        'povie sa menom, nie kľúčom z databázy', out.konciPovolenie.sub);
      ok(/4–8 týždňov/.test(out.konciPovolenie.why),
        's lehotou, ktorá naozaj platí', out.konciPovolenie.why);
      ok(!out.konciPovolenie.hot, 'a nehorí — ešte je čas');

      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Banka: starý výpis je dôležitejší než pekný výhľad ────────────────
    // Celá obrazovka stojí na jednom čísle — na zostatku z posledného výpisu.
    // Keď je výpis starý, výhľad na osem týždňov je fikcia, a predtým to
    // obrazovka nepovedala vôbec.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(async () => {
        const dnes = new Date().toISOString().slice(0, 10);
        const presun = (dni) => {
          const d = new Date(dnes + 'T00:00:00Z');
          d.setUTCDate(d.getUTCDate() - dni);
          return d.toISOString().slice(0, 10);
        };
        const DATA = {
          bank_transactions: [
            { id: 't1', booked_at: presun(30), amount: 5000, match_status: 'matched',
              counterparty: 'GU Ulm GmbH', note: 'faktúra 2026001' },
          ],
          v_cashflow: [], invoices: [], bills: [], settings: [{ id: 'c', staffing: {} }],
        };
        DB.list = async (t) => ({ data: (DATA[t] || []).map(x => ({ ...x })), error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        Danubra.cfgRow = { staffing: {} };
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        const view = document.getElementById('view');
        Danubra.route = 'bank';
        Bank.loaded = false; Bank.tab = 'cashflow';
        await Danubra.views.bank.call(Danubra, view);

        const čítaj = () => {
          const box = view.querySelector('.nowbox');
          return {
            title: box ? box.querySelector('.nowbox-title').textContent.trim() : '',
            sub: box ? box.querySelector('.nowbox-sub').textContent.trim() : '',
            why: box ? box.querySelector('.nowbox-why').textContent.trim() : '',
            onclick: box && box.querySelector('.btn')
              ? box.querySelector('.btn').getAttribute('onclick') : '',
            hot: !!view.querySelector('.nowbox-hot'),
            help: !!(box && box.querySelector('.help-btn')),
          };
        };
        const stary = čítaj();

        // Svieži výpis, ale jeden pohyb nespárovaný.
        Bank.txs = [
          { id: 't1', booked_at: presun(1), amount: 5000, match_status: 'matched' },
          { id: 't2', booked_at: presun(2), amount: 900, match_status: 'unmatched' },
        ];
        await Danubra.views.bank.call(Danubra, view);
        const parovanie = čítaj();

        return { stary, parovanie };
      });

      ok(/Načítať výpis/.test(out.stary.title),
        'starý výpis je prvá vec, ktorú banka povie', out.stary.title);
      ok(/30 dní/.test(out.stary.sub), 'a povie, aký je starý', out.stary.sub);
      ok(out.stary.hot, 'nad dva týždne to horí');
      ok(/nesprávneho čísla/.test(out.stary.why),
        'aj čo to znamená pre celý výhľad', out.stary.why);
      ok(/Bank\.importForm\(\)/.test(out.stary.onclick || ''),
        'tlačidlo otvorí načítanie výpisu', out.stary.onclick);
      ok(out.stary.help, 'a je pri tom vysvetlivka');

      ok(/Spárovať pohyby/.test(out.parovanie.title),
        'pri sviežom výpise je na rade párovanie', out.parovanie.title);
      ok(/1 pohyb nie je/.test(out.parovanie.sub), 'a koľko ich je', out.parovanie.sub);
      ok(/vyzerá bohatší/.test(out.parovanie.why),
        's dôvodom: nespárovaná platba klame výhľad', out.parovanie.why);
      ok(!out.parovanie.hot, 'nehorí to');

      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Prijaté faktúry: sporné sú hore a nedajú sa len tak schváliť ──────
    // Toto je druhá strana tých istých peňazí. Sporná faktúra sú peniaze,
    // ktoré by sme zaplatili zbytočne; faktúra po splatnosti je to jediné,
    // čo kazí vzťah so živnostníkom.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(async () => {
        const DATA = {
          bills: [
            { id: 'b1', bill_number: 'FA-2026-11', worker_id: 'w1', status: 'received',
              amount: 1800, issue_date: '2026-10-10', due_date: '2026-10-25' },
            { id: 'b2', bill_number: 'FA-2026-12', worker_id: 'w2', status: 'disputed',
              amount: 2400, issue_date: '2026-10-08', due_date: '2026-10-22',
              expected_amount: 1900, variance: 500 },
            { id: 'b3', bill_number: 'FA-2026-13', worker_id: 'w1', status: 'approved',
              amount: 900, issue_date: '2026-09-05', due_date: '2026-10-01' },
            { id: 'b4', bill_number: 'FA-2026-14', worker_id: 'w2', status: 'paid',
              amount: 700, issue_date: '2026-08-05', due_date: '2026-09-01' },
          ],
          workers: [{ id: 'w1', full_name: 'Jozef Malý' }, { id: 'w2', full_name: 'Milan Starý' }],
          costs: [], timesheets: [], assignments: [], periods: [], subcontracts: [],
        };
        DB.list = async (t) => ({ data: (DATA[t] || []).map(x => ({ ...x })), error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        const view = document.getElementById('view');
        Danubra.route = 'costs';
        Cost.loaded = false; Cost.tab = 'bills';
        Cost.filters = { status: '', q: '', category: '', period: 'all', from: '', to: '' };
        await Danubra.views.costs.call(Danubra, view);

        const box = view.querySelector('.nowbox');
        const teraz = {
          title: box ? box.querySelector('.nowbox-title').textContent.trim() : '',
          sub: box ? box.querySelector('.nowbox-sub').textContent.trim() : '',
          why: box ? box.querySelector('.nowbox-why').textContent.trim() : '',
          onclick: box && box.querySelector('.btn')
            ? box.querySelector('.btn').getAttribute('onclick') : '',
          hot: !!view.querySelector('.nowbox-hot'),
          help: !!(box && box.querySelector('.help-btn')),
        };
        // Poradie kariet: sporná prvá, potom neskontrolovaná, potom po splatnosti.
        const poradie = [...view.querySelectorAll('.card-title')].map(e => e.textContent.trim());

        // Ostatné náklady vetu nemajú — nie je tam čo schvaľovať.
        Cost.setTab('costs');
        await Danubra.views.costs.call(Danubra, view);
        const naklady = { box: !!view.querySelector('.nowbox') };

        return { teraz, poradie, naklady };
      });

      ok(/nesedí/.test(out.teraz.title), 'prijaté faktúry začínajú tým, čo nesedí s hodinami',
        out.teraz.title);
      ok(out.teraz.hot, 'a horí to — sú to peniaze zbytočne von');
      ok(/1 faktúra nesedí/.test(out.teraz.sub), 'povie, koľko ich je', out.teraz.sub);
      ok(/nie schváliť/.test(out.teraz.why), 'a že rozdiel sa rieši s človekom', out.teraz.why);
      ok(/Cost\.billDetail\('b2'\)/.test(out.teraz.onclick || ''),
        'tlačidlo vedie na tú spornú', out.teraz.onclick);
      ok(out.teraz.help, 'a je pri tom vysvetlivka');

      ok(out.poradie[0] === 'Milan Starý',
        'sporná faktúra je v zozname prvá', out.poradie.join(' | '));
      ok(out.poradie.indexOf('Jozef Malý') === 1,
        'potom neskontrolovaná', out.poradie.join(' | '));
      ok(!out.naklady.box, 'ostatné náklady vetu „čo teraz" nemajú — nič sa tam neschvaľuje');

      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Faktúry: čo čaká na nás je hore, nie vo filtri ────────────────────
    // Obrazovka faktúr bola zoznam s filtrami. „Čo mám teraz spraviť" sa z nej
    // dalo vyčítať len vtedy, keď človek vedel, ktorý stav čo znamená — a
    // stavy sú dva razy dva, lebo v1 a v2 ich pomenovali inak.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(async () => {
        const DATA = {
          invoices: [
            { id: 'i1', invoice_number: '2026001', status: 'pending_approval',
              total: 5280, currency: 'EUR', partner_id: 'p1', due_date: '2026-11-10',
              issue_date: '2026-10-10' },
            { id: 'i2', invoice_number: '2026002', status: 'sent',
              total: 1200, currency: 'EUR', partner_id: 'p1', due_date: '2026-10-01',
              issue_date: '2026-09-01' },
            { id: 'i3', invoice_number: '2026003', status: 'paid',
              total: 900, currency: 'EUR', partner_id: 'p1', due_date: '2026-09-15',
              issue_date: '2026-08-15' },
            { id: 'i4', invoice_number: '', status: 'draft',
              total: 300, currency: 'EUR', partner_id: 'p1' },
          ],
          partners: [{ id: 'p1', name: 'GU Ulm GmbH', country: 'DE' }],
          invoice_items: [], clients: [], orders: [], overrides: [],
          subcontracts: [], periods: [],
        };
        DB.list = async (t) => ({ data: (DATA[t] || []).map(x => ({ ...x })), error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        const view = document.getElementById('view');
        Danubra.route = 'invoices';
        Inv.loaded = false;
        Inv.filters = { status: '', q: '', period: 'all', from: '', to: '' };
        await Danubra.views.invoices.call(Danubra, view);

        const box = view.querySelector('.nowbox');
        const čítaj = () => ({
          label: box ? box.querySelector('.nowbox-label').textContent.trim() : '',
          title: box ? box.querySelector('.nowbox-title').textContent.trim() : '',
          sub: box ? box.querySelector('.nowbox-sub').textContent.trim() : '',
          why: box ? box.querySelector('.nowbox-why').textContent.trim() : '',
          onclick: box && box.querySelector('.btn')
            ? box.querySelector('.btn').getAttribute('onclick') : '',
          hot: !!view.querySelector('.nowbox-hot'),
          help: !!(box && box.querySelector('.help-btn')),
        });
        const teraz = čítaj();
        const sekcie = [...view.querySelectorAll('.form-section')].map(e => e.textContent.trim());
        const prvaSkupina = [...view.querySelectorAll('.cards')][0];
        const horne = prvaSkupina
          ? [...prvaSkupina.querySelectorAll('.acc-name')].map(e => e.textContent.trim()) : [];

        // Pri zapnutom filtri sa zoznam nedelí — človek si už vybral.
        Inv.filters.status = 'paid';
        await Danubra.views.invoices.call(Danubra, view);
        const vofiltri = {
          sekcie: [...view.querySelectorAll('.form-section')].map(e => e.textContent.trim()),
        };

        return { teraz, sekcie, horne, vofiltri };
      });

      ok(/Čo spraviť teraz/.test(out.teraz.label), 'faktúry hovoria, čo spraviť teraz',
        out.teraz.label);
      ok(/Schváliť/.test(out.teraz.title),
        'a schválenie má prednosť pred faktúrou po splatnosti', out.teraz.title);
      ok(/1 faktúra čaká na schválenie/.test(out.teraz.sub), 'povie, koľko ich je',
        out.teraz.sub);
      ok(/neodíde/.test(out.teraz.why), 'aj prečo to stojí na nás', out.teraz.why);
      ok(!out.teraz.hot, 'nehorí to — je to v našich rukách');
      ok(/Inv\.detail\('i1'\)/.test(out.teraz.onclick || ''),
        'tlačidlo vedie na tú faktúru, ktorá čaká', out.teraz.onclick);
      ok(out.teraz.help, 'a je pri tom vysvetlivka');

      ok(out.sekcie.some(x => /Čaká na Vás \(2\)/.test(x)),
        'hore je to, čo čaká na nás — návrh a rozpracovaný podklad',
        out.sekcie.join(' | '));
      ok(out.sekcie.some(x => /Ostatné \(2\)/.test(x)), 'pod tým ostatné',
        out.sekcie.join(' | '));
      ok(out.horne.includes('2026001'), 'faktúra na schválenie je v hornej skupine',
        out.horne.join(', '));
      ok(!out.horne.includes('2026003'), 'a zaplatená tam nie je', out.horne.join(', '));
      ok(out.vofiltri.sekcie.length === 0,
        'pri zapnutom filtri sa zoznam nedelí', out.vofiltri.sekcie.join(' | '));

      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Nábor: podklady, prompty a kde sme inzerovali na jednom mieste ────
    // Ku každému náboru vzniká jeden dokument: zadanie, zhrnutie zákazky a
    // texty na web, Bazoš CZ a SK, Facebook CZ a SK, reklamu, obrázky a
    // voiceover. Žilo to mimo appky, takže pri ďalšej zákazke nikto nevedel,
    // čo sa minule písalo. Tu sa kontroluje, že to appka drží — a hlavne že
    // **nedoplnený údaj `[XX]` nevydá za hotové**.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(async () => {
        const DATA = {
          recruitment_plans: [{
            id: 'p1', title: 'Zvárači WIG — Wörthsee', trade_key: 'zvarac', status: 'active',
            headcount: 4, city: 'Wörthsee', start_date: '2026-11-03',
            offer_rate: 22, client_rate: 34,
            brief: 'Nová kotolňa na biomasu 850 kW, 2 zvárači WIG + 2 pripravári.',
            analysis: { position: 'Zvárač WIG (2×) a pripravár potrubia (2×)',
              place: '82237 Wörthsee, Bavorsko', rate: 'zvárač [XX] €/hod.' },
          }],
          trades: [{ key: 'zvarac', name_sk: 'Zvárač', active: true }],
          screening_questions: [],
          candidates: [{ id: 'c1', full_name: 'Jozef Malý', plan_id: 'p1', ad_id: 'ad1',
            status: 'new', received_at: '2026-10-10T08:00:00Z' }],
          subcontracts: [],
          ads: [{ id: 'ad1', title: 'Zvárači Bazoš SK', channel: 'bazos', plan_id: 'p1',
            channel_detail: 'Práca → Stavebníctvo', starts_on: '2026-10-11', active: true }],
          plan_assets: [
            // Hotový kanál.
            { id: 'a1', plan_id: 'p1', channel: 'bazos_sk', block: 'title',
              body: 'Zvárač WIG – Nemecko', source: 'human', approved_at: 'x' },
            { id: 'a2', plan_id: 'p1', channel: 'bazos_sk', block: 'meta',
              body: 'Práca → Stavebníctvo, Zahraničie', source: 'human', approved_at: 'x' },
            { id: 'a3', plan_id: 'p1', channel: 'bazos_sk', block: 'body',
              body: 'HĽADÁME PARTIU 2 + 2', source: 'human', approved_at: 'x' },
            // Kanál s nedoplnenou sadzbou — nesmie byť „hotový".
            { id: 'a4', plan_id: 'p1', channel: 'bazos_cz', block: 'title',
              body: 'Svářeč WIG – Německo [XX] €', source: 'ai', approved_at: null },
            { id: 'a5', plan_id: 'p1', channel: 'bazos_cz', block: 'meta',
              body: 'Práce → Stavebnictví', source: 'ai', approved_at: null },
            { id: 'a6', plan_id: 'p1', channel: 'bazos_cz', block: 'body',
              body: 'Svářeč [XX] €/hod., nástup [XX]', source: 'ai', approved_at: null },
          ],
        };
        DB.list = async (t, o) => {
          let rows = (DATA[t] || []).map(x => ({ ...x }));
          const f = (o && o.filters) || {};
          for (const [k, v] of Object.entries(f)) rows = rows.filter(r => r[k] === v);
          return { data: rows, error: null };
        };
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        const zapisy = [];
        DB.insert = async (t, row) => { zapisy.push(['insert', t, row]); return { data: { id: 'new', ...row }, error: null }; };
        DB.update = async (t, id, patch) => { zapisy.push(['update', t, id, patch]); return { data: null, error: null }; };

        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        Danubra.cfgRow = { supplier: { name: 'P&S', address: 'a', company_id: '1' } };
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        const view = document.getElementById('view');
        Danubra.route = 'hiring';
        Hire.loaded = false; Hire.openId = null; Kit.loaded = false; Kit.planId = null;
        await Danubra.views.hiring.call(Danubra, view);

        // Otvor nábor ako obrazovku, nie okno.
        await Hire.detail('p1');
        await new Promise(r => setTimeout(r, 400));

        const text = () => view.innerText.replace(/\s+/g, ' ');
        const kanaly = [...view.querySelectorAll('.acc .acc-head')]
          .map(e => e.textContent.replace(/\s+/g, ' ').trim());
        // Zelená fajka pri kanáli znamená „pripravené na vloženie". Kanál
        // s nedoplnenou sadzbou ju mať nesmie, aj keď sú texty napísané.
        const fajky = [...view.querySelectorAll('.acc')]
          .filter(a => a.className.includes('acc-done'))
          .map(a => a.querySelector('.acc-head').textContent.replace(/\s+/g, ' ').trim());

        // Otvor kanál s nedoplnenou sadzbou a skús z neho kopírovať.
        Kit.toggle('bazos_cz');
        await new Promise(r => setTimeout(r, 200));
        const telo = {
          bloky: [...view.querySelectorAll('.kit-block')].length,
          sGapom: [...view.querySelectorAll('.kit-block.has-gap')].length,
          navrh: view.innerHTML.includes('>návrh<'),
          textarea: !!document.getElementById('kit-bazos_cz-body'),
        };
        let kopirovane = null;
        // `navigator.clipboard` je len na čítanie — priradenie by tichom
        // neprešlo a test by kontroloval nič.
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true, value: { writeText: async (t) => { kopirovane = t; } } });
        Kit.copy('kit-bazos_cz-body');
        await new Promise(r => setTimeout(r, 120));

        return {
          okno: !!document.getElementById('ui-modal'),
          sekcie: [...view.querySelectorAll('.form-section')].map(e => e.textContent.trim()),
          nadpis: (view.querySelector('.page-title') || {}).textContent || '',
          text: text(),
          kanaly, fajky, telo, kopirovane,
          zapisy,
        };
      });

      ok(!out.okno, 'nábor sa otvorí ako obrazovka, nie ako okno');
      ok(/Zvárači WIG/.test(out.nadpis), 's názvom náboru v nadpise', out.nadpis);

      // Všetko na jednom mieste. Nadpisy sekcií sa čítajú z `textContent` —
      // `innerText` na nich uplatní veľké písmená z CSS a hľadanie podľa
      // slova by potom padlo na niečom, čo je v poriadku.
      const ma = (x) => out.sekcie.some(s => s.includes(x));
      ok(ma('Zadanie'), 'je tam zadanie od kolegu', out.sekcie.join(' | '));
      ok(ma('Zhrnutie zákazky'), 'zhrnutie zákazky', out.sekcie.join(' | '));
      ok(ma('Podklady po kanáloch'), 'podklady po kanáloch', out.sekcie.join(' | '));
      ok(ma('Kde sme inzerovali'), 'kde sme inzerovali', out.sekcie.join(' | '));
      ok(ma('Pred zverejnením'), 'aj čo treba pred zverejnením', out.sekcie.join(' | '));
      ok(ma('Kandidáti z tohto náboru'), 'a kandidáti, ktorí sa z neho ozvali',
        out.sekcie.join(' | '));
      ok(/Zvárači Bazoš SK/.test(out.text), 'a je vidieť konkrétny inzerát', out.text.slice(0, 200));

      ok(out.kanaly.length === 10, 'desať kanálov — reklama a voiceover sú per krajina',
        `${out.kanaly.length}: ${out.kanaly.join(' | ')}`);
      ok(out.kanaly.some(k => /Bazoš SK/.test(k) && /hotové/.test(k)),
        'kanál s vyplnenými povinnými blokmi je hotový',
        out.kanaly.find(k => /Bazoš SK/.test(k)));
      // Toto je ten dôležitý: text je napísaný, ale sadzba nie je doplnená.
      ok(out.kanaly.some(k => /Bazoš CZ/.test(k) && /treba doplniť/.test(k)),
        'kanál s nedoplnenou sadzbou sa nevydáva za hotový',
        out.kanaly.find(k => /Bazoš CZ/.test(k)));
      ok(/údaj|údaje|údajov/.test(out.text) && /\[XX\]/.test(out.text),
        'a appka pomenuje, čo treba doplniť');
      ok(out.fajky.some(k => /Bazoš SK/.test(k)),
        'hotový kanál má zelenú fajku', out.fajky.join(' | '));
      ok(!out.fajky.some(k => /Bazoš CZ/.test(k)),
        'a kanál s nedoplnenou sadzbou ju nemá — nie je pripravený na vloženie',
        out.fajky.join(' | '));

      ok(out.telo.bloky >= 4, 'v otvorenom kanáli sú bloky na kopírovanie',
        String(out.telo.bloky));
      ok(out.telo.sGapom >= 2, 'bloky s nedoplneným údajom sú zvýraznené',
        String(out.telo.sGapom));
      ok(out.telo.navrh, 'text od appky je označený ako návrh, nie ako hotové');
      ok(out.kopirovane === 'Svářeč [XX] €/hod., nástup [XX]',
        'tlačidlo Kopírovať vezme presne ten blok', String(out.kopirovane));

      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Údaje z Nastavení: jeden riadok, jedno miesto ─────────────────────
    // Nastavenia sa načítavali na štyroch miestach, každé s vlastnou trvalou
    // pamäťou, a tri obrazovky ich nenačítali vôbec. Dokument preto odišiel
    // odberateľovi bez názvu firmy, bez IČO a bez IBAN-u — a po zmene
    // v Nastaveniach stará hodnota prežila až do obnovenia stránky.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(async () => {
        const SETTINGS = [{
          id: 'cfg1',
          supplier: { name: 'Partner und Service s.r.o.', company_id: '57553921',
            address: 'Podzámska 4A, Nové Zámky', iban: 'SK1111110000001874050003' },
          staffing: { soka_pct: 14.7, withholding_pct: 15 },
          recruiting: { consent_script_sk: 'Dobrý deň, volám z {firma}. Súhlasíte?' },
        }];
        const DATA = {
          settings: SETTINGS,
          work_orders: [{ id: 'o1', kind: 'to_worker', order_number: 'OBJ-2026-0001',
            worker_id: 'w1', subcontract_id: 'sc1', scope: 'Sadrokartón 1. NP',
            price_model: 'unit', status: 'sent' }],
          workers: [{ id: 'w1', full_name: 'Jozef Malý', address: 'Nitra' }],
          subcontracts: [{ id: 'sc1', title: 'Ulm', site_city: 'Ulm' }],
          partners: [], invoices: [], assignments: [],
        };
        DB.list = async (t) => ({ data: (DATA[t] || []).map(x => ({ ...x })), error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        const zapisy = [];
        DB.update = async (t, id, patch) => {
          if (t === 'settings') { Object.assign(SETTINGS[0], patch); zapisy.push(patch); }
          return { data: SETTINGS[0], error: null };
        };

        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        // Toto je to podstatné: na Nastaveniach nikto nebol, obrazovka
        // Nastavení sa ani nenačítala.
        Danubra.cfgRow = null;
        if (window.Cfg) { Cfg.row = null; Cfg.loaded = false; }
        await Danubra.loadCfg(true);

        const prvy = {
          nazov: Danubra.supplier().name || '',
          ico: Danubra.supplier().company_id || '',
          // Oddiel nastavení musí byť objekt, nie funkcia — compliance aj
          // marža z nej čítajú sadzby a z funkcie sa prečítať nedá.
          staffingJeObjekt: typeof Danubra.cfg('staffing') === 'object'
            && Danubra.cfg('staffing').soka_pct === 14.7,
          chybajuciOddiel: JSON.stringify(Danubra.cfg('neexistuje')),
          firmaVTexte: Danubra.fillFirm(SETTINGS[0].recruiting.consent_script_sk),
          pripravene: Danubra.supplierReady('Test'),
        };
        UI.closeModal();

        // Dokument objednávky: názov firmy sa naň musí dostať bez toho, aby
        // niekto predtým otvoril Nastavenia.
        let doklad = '';
        const povodneOpen = window.open;
        window.open = () => ({
          document: { open() {}, write: (h) => { doklad += h; }, close() {} },
          focus() {}, print() {} });
        Ord.rows = DATA.work_orders;
        Ord.workers = DATA.workers; Ord.subcontracts = DATA.subcontracts;
        Ord.partners = [];
        await Ord.document('o1');

        // Zmena v Nastaveniach musí byť na ďalšom doklade vidieť hneď —
        // nie až po obnovení stránky.
        Cfg.row = Danubra.cfgRow;
        await Cfg.patch('supplier', { ...Danubra.supplier(), name: 'P&S Bau GmbH' });
        doklad = '';
        await Ord.document('o1');
        const poZmene = doklad;

        // A bez názvu firmy dokument neodíde vôbec.
        Danubra.cfgRow = { id: 'cfg1', supplier: {} };
        doklad = '';
        await Ord.document('o1');
        const bezFirmy = {
          doklad,
          modal: (document.getElementById('ui-modal') || { textContent: '' })
            .textContent.replace(/\s+/g, ' ').trim(),
        };
        UI.closeModal();
        window.open = povodneOpen;

        return { prvy, prvyDoklad: poZmene, bezFirmy, zapisy };
      });

      ok(out.prvy.nazov === 'Partner und Service s.r.o.',
        'údaje z Nastavení má appka aj bez toho, aby na nich niekto bol', out.prvy.nazov);
      ok(out.prvy.ico === '57553921', 'vrátane IČO', out.prvy.ico);
      ok(out.prvy.staffingJeObjekt,
        'oddiel nastavení je objekt — compliance a marža z neho vedia čítať');
      ok(out.prvy.chybajuciOddiel === '{}',
        'chýbajúci oddiel je prázdny objekt, nie undefined', out.prvy.chybajuciOddiel);
      ok(/volám z Partner und Service/.test(out.prvy.firmaVTexte),
        'názov firmy sa doplní do textu súhlasu, nie je v ňom zapečený',
        out.prvy.firmaVTexte);
      ok(out.prvy.pripravene === true, 'vyplnené údaje prejdú kontrolou');

      ok(/P&amp;S Bau GmbH|P&S Bau GmbH/.test(out.prvyDoklad),
        'zmena v Nastaveniach je na ďalšom doklade hneď, nie po obnovení stránky',
        out.prvyDoklad.slice(0, 200));

      ok(out.bezFirmy.doklad === '',
        'bez názvu firmy sa doklad vôbec nevytlačí', out.bezFirmy.doklad.slice(0, 120));
      ok(/Chýbajú fakturačné údaje/.test(out.bezFirmy.modal),
        'namiesto toho appka povie, čo chýba', out.bezFirmy.modal.slice(0, 160));
      ok(/názov firmy/.test(out.bezFirmy.modal) && /IČO/.test(out.bezFirmy.modal),
        'a vymenuje to konkrétne', out.bezFirmy.modal.slice(0, 200));
      ok(/Otvoriť Nastavenia/.test(out.bezFirmy.modal),
        'a dá sa odtiaľ rovno kliknúť tam, kde sa to doplní');

      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Hodiny: týždeň naraz a schválenie toho, čo je vidieť ──────────────
    // Človek na turnuse odrobí šesť dní. Predtým sa to zapisovalo šesťkrát
    // otvorením okna — a práve preto sa hodiny zapisovali so sklzom, čo je
    // riziko podľa §19 AEntG. Tu sa kontroluje, že týždeň je jedna obrazovka
    // a že hromadné schválenie berie presne to, čo je vo filtri.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(async () => {
        const DATA = {
          // Streda 7. 10. 2026 je už zapísaná — nesmie sa zapísať druhýkrát.
          timesheets: [
            { id: 't1', assignment_id: 'a1', worker_id: 'w1', hours: 10, approved: false,
              work_date: '2026-10-07', activity_type: 'construction', period_id: null },
            { id: 't2', assignment_id: 'a1', worker_id: 'w1', hours: 8, approved: true,
              work_date: '2026-10-06', activity_type: 'construction', period_id: null },
          ],
          assignments: [{ id: 'a1', subcontract_id: 'sc1', worker_id: 'w1', status: 'active' }],
          workers: [{ id: 'w1', full_name: 'Jozef Malý' }],
          subcontracts: [{ id: 'sc1', title: 'Sadrokartón Ulm', work_type: 'construction' }],
        };
        DB.list = async (t) => ({ data: (DATA[t] || []).map(x => ({ ...x })), error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });

        const zapisane = [];
        DB.insertMany = async (t, rows) => { zapisane.push([t, rows]); return { data: rows, error: null }; };
        const updaty = [];
        DB.update = async (t, id, patch) => { updaty.push([t, id, patch]); return { data: null, error: null }; };

        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        const view = document.getElementById('view');
        Danubra.route = 'timesheets';
        Tms.loaded = false;
        Tms.filters = { month: '2026-10', worker_id: '', subcontract_id: '', q: '',
          period: 'all', from: '', to: '' };
        await Danubra.views.timesheets.call(Danubra, view);

        const veta = {
          text: (view.querySelector('.nowbox') || { textContent: '' })
            .textContent.replace(/\s+/g, ' ').trim(),
          hot: !!view.querySelector('.nowbox-hot'),
          help: !!view.querySelector('.nowbox .help-btn'),
        };

        // Týždeň: 7. 10. 2026 je streda — formulár sa musí zarovnať na pondelok.
        Tms.weekForm('a1', '2026-10-07');
        const m = document.getElementById('ui-modal');
        const riadky = [...m.querySelectorAll('.week-row')].length;
        const prvyDen = (m.querySelector('.week-row .week-day em') || {}).textContent || '';
        const hotove = [...m.querySelectorAll('.week-done')]
          .map(e => e.textContent.replace(/\s+/g, ' ').trim());

        Tms.fillWeek(8);
        const vyplnene = [...m.querySelectorAll('.week-h')]
          .map(e => ({ d: e.dataset.date, v: e.value }));
        const sucet = (document.getElementById('week-sum') || {}).textContent || '';

        await Tms.saveWeek();

        // Schválenie toho, čo je vo filtri. Potvrdenie sa preskočí.
        const povodne = UI.confirm;
        UI.confirm = async () => true;
        Tms.filters.worker_id = 'w1';
        await Tms.approveShown();
        UI.confirm = povodne;

        return {
          veta, riadky, prvyDen, hotove, vyplnene, sucet,
          zapisane: zapisane.map(([t, rows]) => ({ t, rows })),
          schvalene: updaty.filter(u => u[2] && u[2].approved === true).map(u => u[1]),
        };
      });

      ok(/Schváliť hodiny/.test(out.veta.text), 'hodiny hovoria, čo spraviť teraz',
        out.veta.text.slice(0, 140));
      ok(/1 výkaz za 10 hodín/.test(out.veta.text), 'a koľko hodín visí na schválení',
        out.veta.text.slice(0, 140));
      ok(out.veta.hot, 'sú to peniaze na stole, takže to horí');
      ok(out.veta.help, 'a je pri tom vysvetlivka');

      // Týždeň na jednej obrazovke.
      ok(out.riadky === 7, 'týždeň má sedem riadkov', String(out.riadky));
      ok(/5\.\s?10\./.test(out.prvyDen), 'a začína pondelkom, aj keď sa klikne na stredu',
        out.prvyDen);
      ok(out.hotove.length === 2 && /10 h už zapísaných/.test(out.hotove.join(' ')),
        'už zapísaný deň sa ukáže ako hotový, nie ako prázdne pole',
        out.hotove.join(' | '));

      // Predvyplnenie: pracovné dni áno, víkend nie.
      const pracovne = out.vyplnene.filter(x => x.v === '8').map(x => x.d);
      const vikend = out.vyplnene.filter(x => x.d === '2026-10-10' || x.d === '2026-10-11');
      ok(pracovne.length === 3, 'predvyplnia sa len pracovné dni, ktoré ešte nie sú zapísané',
        pracovne.join(','));
      ok(vikend.every(x => x.v === ''), 'víkend sa nepredvyplní — nie je to norma',
        JSON.stringify(vikend));
      ok(/24 hodín spolu/.test(out.sucet), 'a je vidieť súčet', out.sucet);

      // Zápis: jeden dotaz, tri dni, správne dátumy.
      ok(out.zapisane.length === 1, 'týždeň sa zapíše jedným dotazom, nie siedmimi',
        String(out.zapisane.length));
      const rows = (out.zapisane[0] || {}).rows || [];
      ok(rows.length === 3, 'zapíšu sa len dni, ktoré majú hodiny', String(rows.length));
      ok(rows.map(r => r.work_date).join(',') === '2026-10-05,2026-10-08,2026-10-09',
        'a už zapísaná streda sa nezapíše druhýkrát',
        rows.map(r => r.work_date).join(','));
      ok(rows.every(r => r.worker_id === 'w1' && r.assignment_id === 'a1'),
        'každý riadok vie, kto a na ktorej zákazke');

      // Hromadné schválenie berie to, čo je vo filtri.
      ok(out.schvalene.join(',') === 't1',
        'schváli sa presne to, čo je vo filtri neschválené', out.schvalene.join(','));

      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Zákazka: päť krokov a jedna veta ──────────────────────────────────
    // Profil zákazky má deväť sekcií a všetko potrebné v nich je — ale nikde
    // nebolo napísané, **čo treba spraviť teraz**. Tu sa kontroluje, že to
    // tam je: jedna veta, päť krokov pod ňou, a v zozname riadok o tom,
    // v ktorom kroku zákazka stojí.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(async () => {
        const DATA = {
          subcontracts: [{
            id: 'sc1', title: 'Sadrokartón Ulm', status: 'active', partner_id: 'p1',
            scope: 'Sadrokartón 1. NP, 420 m²', charge_rate: 34, billing_model: 'hourly',
            date_from: '2026-09-01', date_to: '2026-12-31', work_type: 'construction',
            site_city: 'Ulm',
          }],
          partners: [{ id: 'p1', name: 'GU Ulm GmbH', country: 'DE', ust_id: 'DE123456789' }],
          assignments: [
            { id: 'a1', subcontract_id: 'sc1', worker_id: 'w1', status: 'active',
              charge_rate: 34, worker_rate: 22, date_from: '2026-09-01' },
          ],
          workers: [{ id: 'w1', full_name: 'Jozef Malý', legal_form: 'szco' }],
          // Hodiny sú zapísané a schválené, ale obdobie nikto nezaložil —
          // presne tá tichá diera, ktorú má reťazec ukázať.
          timesheets: [
            { id: 't1', assignment_id: 'a1', worker_id: 'w1', hours: 8,
              approved: true, period_id: null, work_date: '2026-09-10' },
          ],
          periods: [], invoices: [], worker_documents: [], compliance: [],
          overrides: [], assignment_checks: [], subcontract_accommodations: [],
          accommodations: [], crews: [], v_lodging_occupancy: [], v_worker_stay: [],
        };
        DB.list = async (t) => ({ data: DATA[t] || [], error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        const view = document.getElementById('view');
        Danubra.route = 'subcontracts';
        Sub.loaded = false; Sub.openId = null;
        await Danubra.views.subcontracts.call(Danubra, view);

        const zoznam = {
          riadok: [...view.querySelectorAll('.card-now')]
            .map(e => e.textContent.replace(/\s+/g, ' ').trim()),
          hot: !!view.querySelector('.card-now-hot'),
        };

        Sub.openId = 'sc1';
        await Danubra.views.subcontracts.call(Danubra, view);

        const txt = (e) => e.textContent.replace(/\s+/g, ' ').trim();
        return {
          zoznam,
          teraz: txt(view.querySelector('.js-now') || { textContent: '' }),
          kroky: [...view.querySelectorAll('.js-step .js-main b')].map(txt),
          stavy: [...view.querySelectorAll('.js-step')]
            .map(e => (e.className.match(/st-(ok|bad|todo)/) || [])[1]),
          otvorene: [...view.querySelectorAll('.js-step.is-open')].map(e => e.id),
          tlacidla: view.querySelectorAll('.js-step.is-open .js-body .btn').length,
          sekTaby: view.querySelectorAll('.sec-tab').length,
        };
      });

      // Zákazka je sedem krokov pod sebou — nie záložky, ktoré treba preklikať.
      ok(/Teraz · krok \d zo 7/.test(out.teraz), 'navrchu je jedna veta, čo spraviť teraz',
        out.teraz.slice(0, 160));
      ok(out.kroky.length === 7, 'pod tým je sedem krokov',
        `${out.kroky.length}: ${out.kroky.join(' | ')}`);
      ok(out.kroky[0] === '1. Dopyt a dohoda' && out.kroky[6] === '7. Hodiny a faktúra',
        'od dopytu po faktúru', out.kroky.join(' | '));
      ok(out.stavy.filter(s => s === 'ok').length >= 2,
        'čo je hotové, je zelené', out.stavy.join(','));
      ok(out.otvorene.length === 1 && out.otvorene[0] === 'js-papiere',
        'otvorený je ten krok, ktorý je na rade (papiere — ľudia sú na stavbe bez nich)', out.otvorene.join(','));
      ok(out.tlacidla > 0, 'a je v ňom tlačidlo, ktorým sa to dá spraviť', String(out.tlacidla));
      ok(out.sekTaby === 0, 'záložky detailu už nie sú');

      // V zozname musí byť vidieť, v ktorom kroku zákazka stojí. Tu je to
      // krok 2: človek je na stavbe, ale register compliance je prázdny —
      // a to je presne to, čo má mať prednosť pred nezúčtovanými hodinami.
      ok(out.zoznam.riadok.length === 1,
        'v zozname je pri zákazke riadok o tom, kde stojí',
        JSON.stringify(out.zoznam.riadok));
      ok(/^\d\/7 · /.test(out.zoznam.riadok[0] || ''),
        'a koľkatý zo siedmich krokov to je', out.zoznam.riadok[0]);
      ok(/4\/7 · Papiere ľudí/.test(out.zoznam.riadok[0] || ''),
        'chýbajúce papiere majú prednosť pred hodinami', out.zoznam.riadok[0]);
      ok(out.zoznam.hot,
        'a keď sú ľudia na stavbe bez papierov, riadok je červený');

      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Nábor kandidáta: päť krokov a jedna veta ──────────────────────────
    // Nábor mal šesť krokov a päťdesiat odrážok a dve rôzne veci sa v ňom
    // volali „overenie". Tu sa kontroluje to, čo z toho má zostať: **jedna
    // veta, čo spraviť teraz**, päť krokov pod ňou, odvodené veci bez
    // zaškrtávadla — a že staré zaškrtnutia z K1–K6 stále platia.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(async () => {
        const DATA = {
          candidates: [
            // Nikto mu nevolal — má horieť prvý krok.
            { id: 'c1', full_name: 'Jozef Nový', type: 'individual', status: 'new',
              received_at: '2026-10-06T07:00:00Z' },
            // Volané, zapísané, a celý starý krok K3 je zaškrtnutý.
            { id: 'c2', full_name: 'Milan Starý', type: 'individual', status: 'interview',
              first_contact_at: '2026-10-01T09:05:00Z', screening_score: 78,
              screening_verdict: 'ok', received_at: '2026-10-01T09:00:00Z' },
          ],
          candidate_checks: [
            { candidate_id: 'c2', step_key: 'k3', item_index: 0, checked: true },
            { candidate_id: 'c2', step_key: 'k3', item_index: 1, checked: true },
            { candidate_id: 'c2', step_key: 'k3', item_index: 2, checked: true },
            { candidate_id: 'c2', step_key: 'k3', item_index: 4, checked: true },
          ],
          candidate_notes: [], subcontracts: [], ads: [], call_chips: [],
          candidate_chips: [], recruitment_plans: [],
        };
        DB.list = async (t, o) => {
          const rows = DATA[t] || [];
          const id = o && o.filters && o.filters.candidate_id;
          return { data: id ? rows.filter(r => r.candidate_id === id) : rows, error: null };
        };
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        const citaj = () => {
          const m = document.getElementById('ui-modal');
          const t = (sel) => [...m.querySelectorAll(sel)]
            .map(e => e.textContent.replace(/\s+/g, ' ').trim());
          return {
            teraz: (m.querySelector('.nowbox') || {}).textContent
              ? m.querySelector('.nowbox').textContent.replace(/\s+/g, ' ').trim() : '',
            hot: !!m.querySelector('.nowbox-hot'),
            nowHelp: !!m.querySelector('.nowbox .help-btn'),
            // Číslované sú len kroky náboru. Červené vlajky ani prvý týždeň
            // krok nie sú — a práve preto nesmú byť očíslované.
            kroky: t('.acc .acc-head').filter(x => /^\d\./.test(x)),
            neoznacene: t('.acc .acc-head').filter(x => !/^\d\./.test(x)),
            hotove: [...m.querySelectorAll('.acc')]
              .filter(a => a.className.includes('acc-done'))
              .map(a => a.querySelector('.acc-head').textContent.replace(/\s+/g, ' ').trim()),
            telo: (m.querySelector('.acc-body') || { textContent: '' }).textContent
              .replace(/\s+/g, ' ').trim(),
            zaskrtavadla: m.querySelectorAll('.acc-body input[type=checkbox]').length,
            vsetko: m.textContent.replace(/\s+/g, ' ').trim(),
          };
        };

        await Cand.load();
        await Cand.detail('c1');
        await new Promise(r => setTimeout(r, 120));
        const novy = citaj();

        UI.closeModal();
        await Cand.detail('c2');
        await new Promise(r => setTimeout(r, 120));
        const stary = citaj();

        return { novy, stary };
      });

      // Jedna veta hore. Toto je celé zjednodušenie: nikto si nevyberá z piatich
      // krokov, appka povie jeden.
      // „Krok" je v appke len jeden zo siedmich; vnútri náboru sú to fázy.
      ok(/Čo spraviť teraz · fáza 1 z 5/.test(out.novy.teraz),
        'hore je jedna veta — čo spraviť teraz a koľkatý je to krok', out.novy.teraz);
      ok(/Zavolať/.test(out.novy.teraz), 'a je to ten správny krok', out.novy.teraz);
      ok(out.novy.hot, 'nezavolaný človek horí');
      ok(out.novy.nowHelp, 'a pri vete je vysvetlivka — dá sa to naučiť');

      ok(out.novy.kroky.length === 5, 'nábor má päť krokov',
        `má ${out.novy.kroky.length}: ${out.novy.kroky.join(' | ')}`);
      ok(/^1\. Zavolať/.test(out.novy.kroky[0]) && /^5\. Na stavbu/.test(out.novy.kroky[4]),
        'sú očíslované a v poradí, v akom sa robia', out.novy.kroky.join(' | '));
      ok(!/Overenie/.test(out.novy.vsetko),
        'a slovo „overenie" tu už nie je dvakrát — krok sa volá Preveriť');
      ok(/Preveriť/.test(out.novy.kroky[1]), 'druhý krok je Preveriť', out.novy.kroky[1]);
      ok(out.novy.neoznacene.length === 1 && /Červené vlajky/.test(out.novy.neoznacene[0]),
        'červené vlajky sú mimo krokov — nie je to pokrok, je to varovanie',
        out.novy.neoznacene.join(' | '));

      // Odvodená odrážka: nikto ju neodklikol a odkliknúť sa nedá.
      ok(out.novy.zaskrtavadla === 0,
        'v prvom kroku sa nič neodklikáva — vyplýva z hovoru',
        `zaškrtávadiel: ${out.novy.zaskrtavadla}`);
      ok(/nekliká sa|Stane sa samo/.test(out.novy.telo),
        'a je napísané, odkiaľ to appka vie', out.novy.telo.slice(0, 120));

      // Staré zaškrtnutia z K3 platia — preskládanie krokov nikomu nevynulovalo
      // prácu, ktorú už odviedol.
      ok(/krok 3 z 5|Dohodnúť/.test(out.stary.teraz),
        'po hovore a prevereni je na rade dohoda', out.stary.teraz);
      ok(out.stary.hotove.some(h => /Preveriť/.test(h)),
        'starý krok K3 sa počíta ako hotové „Preveriť"', out.stary.hotove.join(' | '));
      ok(out.stary.hotove.some(h => /Zavolať/.test(h)),
        'a hovor je hotový bez jediného kliknutia', out.stary.hotove.join(' | '));
      ok(!/Prvý týždeň/.test(out.stary.vsetko),
        'prvý týždeň sa pred nasadením neukazuje');

      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Prehľad: číslo a zoznam za ním ────────────────────────────────────
    // Dlaždica ukazuje číslo a po kliknutí okno so zoznamom, z ktorého to
    // číslo je. Tie dve veci sa nesmú rozísť. Práve to sa stalo pohľadu
    // `v_subcontract_status` (migrácia 038): spojil tri tabuľky naraz, riadky
    // sa vynásobili a nezúčtované hodiny ukazoval dvojnásobne — a nikto si
    // to roky nevšimol, lebo nebolo s čím porovnať.
    //
    // Preto sa tu nekontroluje, že číslo je „nejaké", ale že sedí s tým, čo
    // je v okne vidieť.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(() => {
        const DATA = {
          subcontracts: [
            { id: 'sc1', title: 'Stavba Ulm', status: 'active', partner_id: 'p1',
              charge_rate: 34, date_from: '2026-09-01', date_to: '2026-12-31' },
            // Ukončená zákazka — jej nasadenia ani hodiny sa počítať nesmú.
            { id: 'sc2', title: 'Stará hala', status: 'completed', partner_id: 'p1' },
          ],
          partners: [{ id: 'p1', name: 'GU Ulm GmbH', country: 'DE' }],
          workers: [{ id: 'w1', full_name: 'Jozef Malý' }, { id: 'w2', full_name: 'Anna Veselá' }],
          assignments: [
            { id: 'a1', subcontract_id: 'sc1', worker_id: 'w1', status: 'active',
              charge_rate: 34, worker_rate: 22 },
            { id: 'a2', subcontract_id: 'sc2', worker_id: 'w2', status: 'active',
              charge_rate: 30, worker_rate: 20 },
          ],
          timesheets: [
            { id: 't1', assignment_id: 'a1', worker_id: 'w1', hours: 8, work_date: '2026-09-10', period_id: null },
            { id: 't2', assignment_id: 'a1', worker_id: 'w1', hours: 9, work_date: '2026-09-11', period_id: null },
            { id: 't3', assignment_id: 'a1', worker_id: 'w1', hours: 50, work_date: '2026-08-01', period_id: 'per1' },
            { id: 't4', assignment_id: 'a2', worker_id: 'w2', hours: 99, work_date: '2026-09-10', period_id: null },
          ],
          v_worker_documents: [
            { id: 'd1', worker_id: 'w1', worker_name: 'Jozef Malý', kind: 'a1',
              validity: 'expired', valid_to: '2026-09-01', days_left: -34 },
            { id: 'd2', worker_id: 'w1', worker_name: 'Jozef Malý', kind: 'trade_licence',
              validity: 'expiring', valid_to: '2026-11-01', days_left: 27 },
          ],
          trades: [{ key: 'trockenbau', name_sk: 'Sadrokartón' }],
        };
        DB.list = async (t) => ({ data: DATA[t] || [], error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        return (async () => {
          const view = document.getElementById('view');
          await Danubra.views.dashboard.call(Danubra, view);

          const tiles = [...view.querySelectorAll('.kpi-grid .kpi')].map(e => ({
            cls: e.className,
            label: e.querySelector('.kpi-label').textContent.trim(),
            value: e.querySelector('.kpi-value').textContent.trim(),
            sub: (e.querySelector('.kpi-sub') || {}).textContent,
            hit: !!e.querySelector('.kpi-hit'),
          }));

          // Dlaždica → okno. Počet riadkov musí sedieť s číslom.
          Danubra.kpiDetail('deployed');
          const riadkov = document.querySelectorAll('#ui-modal .kpi-table tbody tr').length;
          const hlavicky = [...document.querySelectorAll('#ui-modal .kpi-th')]
            .map(b => b.textContent.trim());
          // Hľadanie
          Danubra.kpiSearch('malý');
          const poHladani = document.querySelectorAll('#ui-modal .kpi-table tbody tr').length;
          Danubra.kpiSearch('nikto-taky');
          const prazdne = document.getElementById('kpi-list').innerText;
          Danubra.kpiSearch('');
          UI.closeModal();

          Danubra.kpiDetail('docs');
          const dokl = {
            riadkov: document.querySelectorAll('#ui-modal .kpi-table tbody tr').length,
            poznamka: !!document.querySelector('#ui-modal .kpi-note'),
            text: document.querySelector('#ui-modal .kpi-table').innerText,
          };
          UI.closeModal();

          // Prvá vec na prehľade musí byť jedna veta a jedno tlačidlo —
          // nie šesť čísel, z ktorých sa „čo mám robiť" domýšľa.
          const box = view.querySelector('.nowbox');
          const teraz = {
            prve: view.firstElementChild
              && view.firstElementChild.className.includes('print-head')
              ? (view.children[1] || {}).className || '' : (view.firstElementChild || {}).className || '',
            label: box ? box.querySelector('.nowbox-label').textContent.trim() : '',
            title: box ? box.querySelector('.nowbox-title').textContent.trim() : '',
            sub: box ? box.querySelector('.nowbox-sub').textContent.trim() : '',
            why: box && box.querySelector('.nowbox-why')
              ? box.querySelector('.nowbox-why').textContent.trim() : '',
            help: !!(box && box.querySelector('.help-btn')),
            tlacidlo: box && box.querySelector('.btn')
              ? box.querySelector('.btn').textContent.replace(/\s+/g, ' ').trim() : '',
            onclick: box && box.querySelector('.btn')
              ? box.querySelector('.btn').getAttribute('onclick') : '',
            hot: !!view.querySelector('.nowbox-hot'),
            // Veta o úlohách zostáva len pre papier.
            naPapier: !!view.querySelector('.headline.only-print'),
            vetyNaObrazovke: [...view.querySelectorAll('.headline')]
              .filter(e => !e.className.includes('only-print')).length,
          };

          return { tiles, riadkov, hlavicky, poHladani, prazdne, dokl, teraz };
        })();
      });

      // Prehľad hovorí, čo spraviť teraz — a dá na to jedno tlačidlo.
      ok(/Čo spraviť teraz/.test(out.teraz.label),
        'prvá vec na prehľade je „čo spraviť teraz"', out.teraz.label);
      ok(out.teraz.title.length > 0, 'a je to jedna vec, nie zoznam', out.teraz.title);
      ok(out.teraz.sub.length > 0, 's vetou, čo presne čaká', out.teraz.sub);
      ok(out.teraz.help, 'a s vysvetlivkou');
      ok(/Danubra\.go\('\w+'\)/.test(out.teraz.onclick || ''),
        'tlačidlo vedie presne tam, kde sa to rieši', out.teraz.onclick);
      ok(out.teraz.vetyNaObrazovke === 0,
        'nad číslami nie sú dve vety o tom istom — na obrazovke je jedna',
        String(out.teraz.vetyNaObrazovke));
      ok(out.teraz.naPapier, 'veta o úlohách zostáva pre tlač');

      const tile = (s) => out.tiles.find(t => t.label.includes(s)) || {};
      ok(out.tiles.length === 6, 'prehľad má šesť čísel',
        `našiel som ${out.tiles.length}`);
      ok(out.tiles.every(t => t.hit), 'na každé sa dá kliknúť');
      ok(out.tiles.every(t => t.sub), 'každé má pod sebou vetu, nie len číslo');

      ok(tile('Ľudia').value === '1', 'nasadenie na ukončenej zákazke sa nepočíta',
        `ukazuje ${tile('Ľudia').value}`);
      ok(tile('Nezúčtované').value.startsWith('17'),
        'nezúčtované hodiny sú 8 + 9 — nie hodiny z uzavretého obdobia ani z ukončenej zákazky',
        `ukazuje ${tile('Nezúčtované').value}`);
      ok(/kpi-bad/.test(tile('Doklady').cls), 'doklad po platnosti zafarbí dlaždicu načerveno',
        tile('Doklady').cls);
      ok(/kpi-calm/.test(tile('Ľudia').cls), 'číslo, ktoré nič nepýta, farbu nemá',
        tile('Ľudia').cls);

      ok(out.riadkov === Number(tile('Ľudia').value),
        'v okne je presne toľko riadkov, koľko hovorí dlaždica',
        `okno ${out.riadkov}, dlaždica ${tile('Ľudia').value}`);
      ok(out.hlavicky.length >= 4 && out.hlavicky.every(h => h),
        'zoznam má pomenované stĺpce, na ktoré sa dá kliknúť');
      ok(new Set(out.hlavicky).size === out.hlavicky.length,
        'a žiadne dva sa nevolajú rovnako', out.hlavicky.join(', '));
      ok(out.poHladani === 1, 'hľadanie v okne zúži zoznam',
        `ostalo ${out.poHladani}`);
      ok(/Nič také/.test(out.prazdne), 'a keď nič nenájde, povie to');

      ok(out.dokl.riadkov === 2, 'v okne dokladov je aj to, čo sa blíži ku koncu',
        `riadkov ${out.dokl.riadkov}`);
      ok(out.dokl.poznamka, 'a je vysvetlené, prečo je tam viac než na dlaždici');
      ok(/skončila pred/.test(out.dokl.text),
        'pri expirovanom doklade sa nepíše „−34 dní", ale že platnosť skončila');
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Tlač do PDF ───────────────────────────────────────────────────────
    // PDF sa v appke nerobí knižnicou, ale tlačou prehliadača. To znamená, že
    // o výsledku rozhodujú štýly — a tie sa dajú pokaziť odinakiaľ. Prehľad
    // potrebuje stránku na výšku, výkaz hodín na šírku (má dvanásť stĺpcov)
    // a `@page` sa nedá zúžiť selektorom, takže jedno pravidlo vie prebiť
    // druhé bez toho, aby si to niekto všimol.
    //
    // `page.pdf()` rešpektuje `@page`, takže rozmery strán to povedia priamo.
    {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);

      // Prvý `/MediaBox` v PDF je rozmer prvej strany, v bodoch (1/72").
      const firstPage = (buf) => {
        const m = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/
          .exec(buf.toString('latin1'));
        return m ? { w: Math.round(+m[3] / 72 * 25.4), h: Math.round(+m[4] / 72 * 25.4) } : null;
      };

      const show = (html) => page.evaluate((h) => {
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;
        document.getElementById('view').innerHTML = h;
      }, html);

      await show('<div class="print-head"><strong>Prehľad</strong></div>'
        + '<div class="card card-pad">obsah</div>');
      const a = firstPage(await page.pdf({ preferCSSPageSize: true }));
      ok(a && a.h > a.w, 'bežná obrazovka sa tlačí na výšku',
        a ? `${a.w}×${a.h} mm` : 'rozmer strany sa nedal prečítať');

      await show('<div class="hs-paper">Stundennachweis</div>');
      const b = firstPage(await page.pdf({ preferCSSPageSize: true }));
      ok(b && b.w > b.h, 'výkaz hodín sa tlačí na šírku',
        b ? `${b.w}×${b.h} mm` : 'rozmer strany sa nedal prečítať');

      // Menu, horný pruh ani tlačidlá na papier nepatria. Keby sa vytlačili,
      // PDF pre účtovníčku by bolo z polovice o appke.
      await page.emulateMedia({ media: 'print' });
      await show('<div class="print-head"><strong>Prehľad</strong></div>'
        + '<div class="card card-pad"><div class="card-head">'
        + '<div class="card-title">Karta</div>'
        + '<div class="card-acts"><button class="icon-btn">x</button></div></div></div>');
      const vis = await page.evaluate(() => {
        const shown = (s) => {
          const e = document.querySelector(s);
          return !!(e && e.getClientRects().length);
        };
        return {
          sidebar: shown('.sidebar'), topbar: shown('.topbar'), bell: shown('.bell-wrap'),
          acts: shown('.card-acts'), head: shown('.print-head'), card: shown('.card'),
        };
      });
      ok(!vis.sidebar && !vis.topbar, 'pri tlači zmizne menu aj horný pruh');
      ok(!vis.bell, 'aj zvonček');
      ok(!vis.acts, 'aj tlačidlá na kartách');
      ok(vis.head, 'a pribudne hlavička s obdobím');
      ok(vis.card, 'samotná karta zostáva');
      await page.close();
    }

    // ── Jedna zvýraznená vec na obrazovku ────────────────────────────────
    // „Je tam na mňa veľa vecí, málo zvýraznených." Pravidlo appky je odvtedy
    // jedno: **každá obrazovka v menu začína jednou vetou „čo teraz" a nič
    // iné na nej nekričí.** Toto je test, ktorý padne, keď nová obrazovka
    // vetu nemá — alebo keď na nej budú dve.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(async () => {
        // Dáta sú zámerne také, aby na každej obrazovke niečo chýbalo:
        // prázdna obrazovka by vetu mala tiež, ale nedokázala by, že sa
        // poradie naliehavosti vôbec počíta.
        const DATA = {
          workers: [{ id: 'w1', full_name: 'Jozef Malý', status: 'deployed' }],
          partners: [{ id: 'p1', name: 'GU Ulm GmbH' }],
          trades: [{ key: 'zvarac', name_sk: 'Zvárač', sort_order: 1 }],
          recruitment_plans: [{ id: 'r1', title: 'Wörthsee', status: 'active',
            trade_key: 'zvarac', headcount: 4, city: 'Wörthsee' }],
          candidates: [{ id: 'c1', full_name: 'Marek', status: 'new', plan_id: 'r1',
            received_at: '2026-10-13T07:00:00Z' }],
          settings: [{ id: 's1', supplier: { name: 'Partner und Service s. r. o.' } }],
          subcontracts: [{ id: 'sc1', title: 'Kotolňa', status: 'active' }],
          timesheets: [], assignments: [], periods: [], invoices: [], costs: [],
          bills: [], bank_transactions: [], v_cashflow: [],
        };
        DB.list = async (t) => ({ data: (DATA[t] || []).map(x => ({ ...x })), error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        DB.update = async () => ({ data: null, error: null });
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        Danubra.cfgRow = DATA.settings[0];
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        const view = document.getElementById('view');
        const res = {};
        // Presne tie obrazovky, ktoré stoja v ľavom menu. Zoznam sa berie
        // z appky, nie z tohto testu — nová položka v menu sem pribudne sama.
        // Menu má dnes štyri miesta; obrazovky, ktoré v ňom stáli predtým,
        // sú ich záložkami a musia platiť rovnako.
        const menu = [...new Set([...Danubra.sidebarNav().map(x => x[0]),
          'opportunities', 'partners', 'timesheets', 'hiring', 'compliance'])];
        for (const key of menu) {
          const fn = Danubra.views[key];
          if (typeof fn !== 'function') { res[key] = { chyba: 'obrazovka neexistuje' }; continue; }
          // Moduly si pamätajú otvorený záznam aj načítané dáta — treba ich
          // prinútiť načítať sa znova, inak sa vykreslí detail z iného testu.
          for (const h of Object.values(Danubra.entities)) {
            const m = window[h.handle];
            if (m && 'openId' in m) m.openId = null;
            if (m && 'loaded' in m) m.loaded = false;
          }
          Danubra.route = key;
          view.innerHTML = '';
          try { await fn.call(Danubra, view); } catch (e) { res[key] = { chyba: e.message }; continue; }
          await new Promise(r => setTimeout(r, 60));
          const boxy = [...view.querySelectorAll('.nowbox')];
          res[key] = {
            pocet: boxy.length,
            title: boxy[0] ? boxy[0].querySelector('.nowbox-title').textContent.trim() : '',
            label: boxy[0] ? boxy[0].querySelector('.nowbox-label').textContent.trim() : '',
            why: boxy[0] && boxy[0].querySelector('.nowbox-why')
              ? boxy[0].querySelector('.nowbox-why').textContent.trim() : '',
            tlacidla: boxy[0] ? boxy[0].querySelectorAll('.btn').length : 0,
            // Červené pruhy navyše. Veta „čo teraz" má byť jediná vec, ktorá
            // kričí — pruh nad zoznamom je presne to, čo sa s ňou bije.
            pruhy: view.querySelectorAll('.warnbox').length,
          };
        }
        return { res, menu };
      });

      ok(out.menu.length >= 8, `skúša sa ${out.menu.length} obrazoviek`,
        out.menu.join(', '));
      for (const key of out.menu) {
        const r = out.res[key] || {};
        ok(!r.chyba, `${key} sa vykreslí`, r.chyba);
        if (r.chyba) continue;
        ok(r.pocet === 1, `${key} má práve jednu vetu „čo teraz" (${r.pocet})`,
          `nadpis: ${r.title}`);
        ok(r.title && r.title.length > 3, `${key}: veta nie je prázdna`, r.title);
        ok(r.tlacidla <= 1, `${key}: v nej je najviac jedno tlačidlo (${r.tlacidla})`);
        ok(/^Čo /.test(r.label), `${key}: nadpisok hovorí „Čo…" (${r.label})`);
        ok(r.pruhy === 0, `${key}: a nad zoznamom nie je červený pruh navyše (${r.pruhy})`);
      }
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Papiere na dva kliky ────────────────────────────────────────────────
    // „Keď mám zvoleného živnostníka, nech mi údaje prehodí do zmluvy,
    // objednávky, GDPR." Tlačidlo Papiere → papier → človek → hotový papier.
    // Keď chýba IČO alebo adresa, appka sa spýta, uloží to k nemu a papier
    // otvorí v tom istom kliknutí (inak by ho prehliadač zablokoval).
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(async () => {
        const DATA = {
          workers: [
            { id: 'w1', full_name: 'Cyril Demeter', status: 'ready', legal_form: 'szco',
              city: 'Brekov' },
            { id: 'w2', full_name: 'Jozef Malý', status: 'deployed', legal_form: 'szco',
              company_id: '111', address: 'Žilina 1', hourly_cost: 22 },
          ],
          assignments: [{ id: 'a2', worker_id: 'w2', subcontract_id: 'sc1', status: 'planned',
            date_from: '2026-11-02' }],
          subcontracts: [{ id: 'sc1', title: 'Kotolňa Wörthsee', status: 'active' }],
          worker_documents: [], work_orders: [], partners: [], contracts: [],
          settings: [{ id: 's1', supplier: { name: 'Partner und Service s. r. o.',
            address: 'Nové Zámky', company_id: '57553921', register: 'OR OS Nitra' } }],
        };
        const zapisy = [];
        DB.list = async (t) => ({ data: (DATA[t] || []).map(x => ({ ...x })), error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        DB.update = async (t, id, patch) => { zapisy.push({ t, id, patch }); return { error: null }; };
        DB.signedDocUrls = async () => new Map();
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        Danubra.cfgRow = DATA.settings[0];
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        const okna = [];
        window.open = () => {
          const o = { html: '', document: { open() {}, write(h) { o.html += h; }, close() {} },
            close() { o.zavrete = true; } };
          okna.push(o); return o;
        };

        Danubra._buildNav();
        const tlacidlo = !!document.querySelector('#btn-papers');
        Pap.open();
        const dlazdice = [...document.querySelectorAll('#ui-modal .pap-tile b')]
          .map(b => b.textContent.trim());
        await Pap.pick('zmluva');
        const ludia = [...document.querySelectorAll('#ui-modal .pap-row b')]
          .map(b => b.textContent.trim());
        Pap.setQ('cyril');
        const poHladani = document.querySelectorAll('#ui-modal .pap-row').length;

        // Cyrilovi chýba IČO aj adresa — appka sa spýta.
        Pap.run('w1');
        const pyta = [...document.querySelectorAll('#dop-form input')].map(i => i.name);
        const otvoreneSkor = okna.length;
        document.querySelector('#dop-form [name=company_id]').value = '53941870';
        document.querySelector('#dop-form [name=address]').value = 'Brekov 81';
        Wrk.saveDoplnit();
        await new Promise(r => setTimeout(r, 50));
        const zmluva = okna[0] ? okna[0].html : '';

        // Druhýkrát sa už nepýta.
        UI.closeModal();
        Wrk.zmluva('w1');
        const znova = !document.querySelector('#dop-form');

        // Objednávka: Jozef je na zákazke a objednávku nemá → založí sa predvyplnená.
        await Wrk.paperOrder('w2');
        const obj = {
          nazov: (document.querySelector('#ui-modal [name=title]') || {}).value,
          od: (document.querySelector('#ui-modal [name=date_from]') || {}).value,
          sadzba: (document.querySelector('#ui-modal [name=rate]') || {}).value,
          nasadenie: (document.querySelector('#ui-modal [name=assignment_id]') || {}).value,
        };
        UI.closeModal();
        // Cyril na zákazke nie je — objednávku ani infolist mu appka nevymyslí.
        const pred = okna.length;
        await Wrk.paperSiteSheet('w1');
        return { tlacidlo, dlazdice, ludia, poHladani, pyta, otvoreneSkor, zmluva, zapisy,
          znova, obj, infolistBezZakazky: okna.length === pred, okien: okna.length };
      });

      ok(out.tlacidlo, 'tlačidlo Papiere je v hornom pruhu');
      ok(out.dlazdice.length === 6, `ponúkne šesť papierov (${out.dlazdice.join(', ')})`);
      ok(out.dlazdice[0] === 'Rámcová zmluva s Nemcom' && out.dlazdice[2] === 'Súhlas GDPR',
        'v poradí siedmich krokov', out.dlazdice.join(', '));
      ok(out.ludia.includes('Cyril Demeter') && out.ludia.includes('Jozef Malý'),
        'vyberá sa zo živnostníkov', out.ludia.join(', '));
      ok(out.poHladani === 1, 'a dá sa hľadať');
      ok(out.pyta.join(',') === 'company_id,address', 'keď chýba IČO a adresa, spýta sa len na ne',
        out.pyta.join(','));
      ok(out.otvoreneSkor === 0, 'a papier dovtedy neotvorí');
      ok(/Cyril Demeter/.test(out.zmluva) && /53941870/.test(out.zmluva) && /Brekov 81/.test(out.zmluva),
        'po uložení sa zmluva otvorí s menom, IČO aj adresou');
      ok(out.zapisy.some(z => z.t === 'workers' && z.id === 'w1' && z.patch.company_id === '53941870'),
        'a údaje sa uložia k človeku');
      ok(out.znova, 'nabudúce sa už nepýta');
      ok(out.obj.nasadenie === 'a2' && out.obj.nazov === 'Kotolňa Wörthsee'
        && out.obj.od === '2026-11-02' && Number(out.obj.sadzba) === 22,
        'objednávka sa predvyplní zo zákazky, termínu a jeho sadzby', JSON.stringify(out.obj));
      ok(out.infolistBezZakazky, 'bez zákazky sa infolist neotvorí naprázdno');
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Z dopytu rovno náborový plán a podklady ─────────────────────────────
    // „Z takýchto podkladov potrebujem vypracovať náborový plán a všetky
    // podklady. Cieľ 2–6 ľudí týždenne." E-mail → plán po týždňoch → jedným
    // klikom dopyty, nábory s termínom a podklady pre každý.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(async () => {
        // Podklady sa píšu na pozadí: server odpovie 202 a výsledok zapíše
        // do náboru (`analysis._job`), appka sa naň pýta.
        const joby = {};
        DB.list = async (t, o = {}) => {
          if (t === 'recruitment_plans' && o.filters && o.filters.id) {
            const id = o.filters.id;
            return { data: [{ id, analysis: { _job: { id: joby[id], status: 'done',
              blocks: 6, questions: 4 } } }], error: null };
          }
          return { data: [], error: null };
        };
        DB.count = async () => 0;
        const vlozene = {};
        let n = 0;
        DB.insertMany = async (t, rows) => {
          vlozene[t] = rows;
          return { data: rows.map(r => ({ id: `${t}-${++n}`, ...r })), error: null };
        };
        const zmeny = [];
        DB.update = async (t, id, patch) => { zmeny.push({ t, id, patch }); return { error: null }; };
        const volania = [];
        window.fetch = async (u, o) => {
          const b = JSON.parse(o.body);
          volania.push({ u, planId: b.planId });
          joby[b.planId] = b.job;
          return { ok: false, status: 202, json: async () => ({}) };
        };
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        Danubra._dayISO = () => '2026-10-20';
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        Opp._inq = {
          projects: [
            { title: 'Hammelburg', city: 'Hammelburg', headcount: 5, rate_client: 34,
              start_date: '2026-10-22', brief: 'Trockenbau.', requirements: [] },
            { title: 'Gengenbach', city: 'Gengenbach', headcount: 4, rate_client: 34,
              start_date: '2026-11-30', brief: 'Trockenbau.', requirements: [] },
          ],
          client: { company_name: 'B&M Projekte GmbH' }, payment: '', risks: [], raw: '',
        };
        Opp.inquiryPreview();
        const m = () => document.getElementById('ui-modal');
        const tyzdne = [...m().querySelectorAll('.wplan-week')].map(w => w.innerText.replace(/\s+/g, ' '));
        const neskoro = m().querySelectorAll('.inq-when.is-late').length;
        const tlacidla = [...m().querySelectorAll('.modal-actions .btn')].map(b => b.textContent.trim());

        // Odškrtnutá stavba z plánu vypadne hneď.
        document.getElementById('inq-1').checked = false;
        Opp.inqRepaint();
        const poOdskrtnuti = m().querySelectorAll('.wplan-week').length;
        document.getElementById('inq-1').checked = true;
        Opp.inqRepaint();

        await Opp.saveInquiry(true);
        return { tyzdne, neskoro, tlacidla, poOdskrtnuti, vlozene, zmeny, volania,
          vysledok: m() ? m().innerText : '' };
      });

      ok(out.tyzdne.length === 2, `plán má dva týždne (${out.tyzdne.length})`);
      ok(/Hammelburg 5/.test(out.tyzdne[0]) && /Gengenbach 1/.test(out.tyzdne[0]) && /6 z 6/.test(out.tyzdne[0]),
        'prvý týždeň: Hammelburg 5 a Gengenbach 1 — šesť, viac nevládzeme', out.tyzdne[0]);
      ok(out.neskoro === 1, 'Hammelburg s nástupom o dva dni sa ukáže ako nestihnutý');
      ok(out.tlacidla.some(t => /Založiť nábor a pripraviť podklady/.test(t)),
        'jedno tlačidlo založí nábor aj podklady', out.tlacidla.join(' | '));
      ok(out.tlacidla.some(t => /Len zapísať dopyty/.test(t)), 'a dá sa aj len zapísať');
      ok(out.poOdskrtnuti === 1, 'odškrtnutá stavba z plánu hneď vypadne');
      const plany = out.vlozene.recruitment_plans || [];
      ok((out.vlozene.opportunities || []).length === 2, 'zapíšu sa dva dopyty');
      ok(plany.length === 2, 'a ku každému nábor');
      ok(plany.every(p => p.status === 'draft'), 'nábor je koncept — nič sa nezverejní samo');
      ok(plany[0].deadline === '2026-10-22', 'termín náboru je nástup', plany[0].deadline);
      ok(/týždeň 1 \(20\.–26\. 10\.\) 5 ľudí/.test(plany[0].notes || ''),
        'a v nábore je napísané, ktorý týždeň koľko ľudí', plany[0].notes);
      ok(plany.every(p => p.brief), 'zadanie sa prenesie');
      ok(out.zmeny.filter(z => z.t === 'opportunities' && z.patch.plan_id).length === 2,
        'dopyty sa prepoja s náborom');
      ok(out.volania.length === 2, 'podklady sa pripravia pre oba nábory');
      ok(out.volania.every(v => /analyze-brief-background/.test(v.u)),
        'na pozadí — písanie trvá dlhšie, než bežná funkcia vydrží (504)');
      ok(/Nábor je pripravený/.test(out.vysledok) && /6 textov na inzeráty/.test(out.vysledok),
        'a appka povie, čo pripravila a čo ďalej', out.vysledok.slice(0, 200));
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Prijaté faktúry z PDF ─────────────────────────────────────────────
    // Nahratý súbor ide do úložiska, faktúra vznikne „Na kontrolu" a číta sa
    // na pozadí. Potvrdená musí vedieť, od koho je, a mať sumu.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);

      const out = await page.evaluate(async () => {
        const res = { vlozene: [], volania: [], zmeny: [] };
        DB.list = async () => ({ data: [], error: null });
        DB.uploadDoc = async (f, o) => ({ path: `${o.folder}/x/${f.name}`, error: null });
        DB.insert = async (t, row) => { res.vlozene.push({ t, row }); return { data: { id: 'nova', ...row }, error: null }; };
        DB.update = async (t, id, patch) => { res.zmeny.push({ t, id, patch }); return { data: {}, error: null }; };
        DB.signedDocUrl = async () => ({ url: null });
        window.fetch = async (u, o) => { res.volania.push({ u, body: o && o.body }); return { json: async () => ({}) }; };
        Danubra.user = { id: 'u1' };
        Danubra.route = 'costs';
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;

        await Cost.upload([
          new File(['%PDF-1.4'], 'faktura.pdf', { type: 'application/pdf' }),
          new File(['<Invoice/>'], 'efaktura.xml', { type: '' }),
          new File(['x'], 'tabulka.xlsx', { type: 'application/vnd.ms-excel' }),
        ]);
        clearTimeout(Cost._poll); Cost._poll = null;

        // Kontrola: bez sumy a bez dodávateľa sa nepotvrdí.
        Cost.bills = [{ id: 'r1', status: 'review', extract_status: 'done', amount: 0, source: 'pdf',
          storage_path: 'p.pdf', extracted: { _file: 'faktura.pdf', supplier: {}, uncertain: [] } }];
        Cost.reviewBill('r1');
        await Cost.confirmReview('r1');
        res.bezSumy = res.zmeny.length;
        const form = document.getElementById('br-form');
        form.querySelector('[name="amount"]').value = '540';
        form.querySelector('[name="supplier_name"]').value = 'Hotel Krone';
        form.querySelector('[name="supplier_iban"]').value = 'sk31 1200 0000 1987 4263 7541';
        await Cost.confirmReview('r1');
        res.potvrdena = res.zmeny.find(z => z.id === 'r1');
        res.zoznam = Cost.reviewHtml(DanubraBills.queue([{ id: 'a', status: 'review', extract_status: 'pending',
          amount: 0, extracted: { _file: 'a.pdf' } }], '2026-10-21'));
        UI.closeModal();
        return res;
      });

      const faktury = out.vlozene.filter(v => v.t === 'bills');
      ok(faktury.length === 2, 'PDF aj e-faktúra sa nahrajú, Excel nie', String(faktury.length));
      ok(faktury.every(f => f.row.status === 'review' && f.row.extract_status === 'pending'),
        'nahratá faktúra čaká na kontrolu a číta sa');
      ok(faktury.map(f => f.row.source).join() === 'pdf,xml', 'vie, či je to PDF alebo e-faktúra');
      ok(out.volania.filter(v => /read-bill-background/.test(v.u)).length === 2,
        'číta sa na pozadí, na serveri — kľúč k modelu nie je v prehliadači');
      ok(out.bezSumy === 0, 'bez sumy a dodávateľa sa nepotvrdí');
      const p = (out.potvrdena || {}).patch || {};
      ok(p.status === 'received' && p.amount === 540 && p.supplier_name === 'Hotel Krone',
        'potvrdená ide medzi prijaté', JSON.stringify(p).slice(0, 200));
      ok(p.supplier_iban === 'SK3112000000198742637541', 'IBAN sa uloží bez medzier');
      ok(p.confirmed_by === 'u1', 'zapíše sa, kto ju potvrdil');
      ok(/Na kontrolu/.test(out.zoznam) && /Čítam/.test(out.zoznam), 'karta Na kontrolu ukáže, čo sa ešte číta');
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }

    // ── Faktúry za živnostníkov ───────────────────────────────────────────
    // Návrh zo schválených hodín uzavretého obdobia, vystavuje admin cez
    // databázovú funkciu, živnostníkovi ide odkaz na potvrdenie.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);
      const out = await page.evaluate(async () => {
        const res = { rpc: [], zmeny: [] };
        DB.list = async () => ({ data: [], error: null });
        DB.rpc = async (n, a) => { res.rpc.push({ n, a }); return { data: n === 'self_bill_issue' ? 'NOVAK-2026-001' : 'nova', error: null }; };
        DB.update = async (t, id, patch) => { res.zmeny.push({ t, id, patch }); return { data: {}, error: null }; };
        UI.confirm = async () => true;
        Danubra.user = { id: 'u1' }; Danubra.route = 'costs';
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;
        Cost.loaded = true;
        Cost.workers = [
          { id: 'w1', full_name: 'Ján Novák', self_billing: true, phone: '+421 900 111 222' },
          { id: 'w2', full_name: 'Platiteľ DPH', self_billing: true, vat_payer: true },
          { id: 'w3', full_name: 'Bez dohody' },
        ];
        Cost.periods = [{ id: 'p1', subcontract_id: 's1', status: 'closed', period_from: '2026-10-01', period_to: '2026-10-15' },
          { id: 'p2', subcontract_id: 's1', status: 'open', period_from: '2026-10-16', period_to: '2026-10-31' }];
        Cost.subcontracts = [{ id: 's1', title: 'Lixenried' }];
        Cost.timesheets = [
          { worker_id: 'w1', period_id: 'p1', approved: true, hours: 10 },
          { worker_id: 'w1', period_id: 'p1', approved: true, hours: 9.5 },
          { worker_id: 'w1', period_id: 'p2', approved: true, hours: 8 },
          { worker_id: 'w2', period_id: 'p1', approved: true, hours: 8 },
          { worker_id: 'w3', period_id: 'p1', approved: true, hours: 8 },
        ];
        Cost.bills = [];
        res.kandidati = Cost.selfCandidates().map(c => `${c.worker.id}:${c.period.id}:${c.hours}`);
        Cost.selfForm();
        await Cost.selfDrafts();
        Cost.bills = [{ id: 'b1', source: 'self_billing', status: 'self_draft', worker_id: 'w1', period_id: 'p1', amount: 487.5,
          lines: [{ description: 'Lixenried', hours: 19.5, rate: 25, total: 487.5 }] }];
        Cost.load = async () => {};
        Cost.billDetail('b1');
        res.navrh = document.querySelector('.modal-card').innerText;
        await Cost.selfIssue('b1');
        Cost.bills[0] = { ...Cost.bills[0], status: 'self_sent', bill_number: 'NOVAK-2026-001', confirm_token: 'a'.repeat(64) };
        res.sprava = Cost.selfMessage(Cost.bills[0]);
        res.znova = Cost.selfCandidates().length;
        UI.closeModal();
        return res;
      });
      ok(out.kandidati.join() === 'w1:p1:19.5',
        'navrhne sa len živnostník s dohodou, neplatiteľ DPH, z uzavretého obdobia', out.kandidati.join());
      ok(out.rpc.some(r => r.n === 'self_bill_draft' && r.a.p_worker === 'w1' && r.a.p_period === 'p1'),
        'návrh pripraví databáza zo schválených hodín');
      ok(/Schváliť a vystaviť/.test(out.navrh) && /Lixenried/.test(out.navrh), 'návrh sa dá schváliť a vystaviť', out.navrh.slice(0, 200));
      ok(out.rpc.some(r => r.n === 'self_bill_issue' && r.a.p_bill === 'b1'),
        'vystavenie ide cez databázu — tá pustí len admina');
      ok(/potvrdenie\.html\?t=a{64}/.test(out.sprava) && /vystavili faktúru NOVAK-2026-001/.test(out.sprava),
        'živnostník dostane správu s odkazom na potvrdenie (vykáme)', out.sprava);
      ok(out.znova === 0, 'za obdobie s faktúrou sa ďalší návrh neponúka');
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }
    // ── Dokumenty: PDF rovno a archív ────────────────────────────────────
    // „Keď dám export dokumentov, nešlo by, aby sťahovalo PDF rovno?" Dokument
    // sa otvorí v okne, „Stiahnuť PDF" spraví skutočné PDF (nie tlač Chromu
    // s adresou stránky), uloží ho do úložiska a zapíše do archívu k človeku.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);
      await page.evaluate(() => {
        const DATA = {
          workers: [{ id: 'w1', full_name: 'Jozef Malý', status: 'deployed', legal_form: 'szco',
            company_id: '12345678', address: 'Hlavná 1', city: 'Žilina', zip: '01001',
            business_address: 'Hlavná 1', business_city: 'Žilina', business_zip: '01001',
            birth_date: '1985-03-02', dic: '1234567890', tax_id: '1234567890' }],
          worker_documents: [], work_orders: [], assignments: [], subcontracts: [], crews: [], overrides: [],
          settings: [{ id: 's1', supplier: { name: 'Partner und Service s. r. o.',
            address: 'Nové Zámky', company_id: '57553921', register: 'OR OS Nitra' } }],
        };
        window.__up = []; window.__ins = [];
        DB.list = async (t) => ({ data: (DATA[t] || []).map(x => ({ ...x })), error: null });
        DB.count = async () => 0;
        DB.rpc = async () => ({ data: null, error: null });
        DB.update = async () => ({ data: null, error: null });
        DB.insert = async (t, row) => { window.__ins.push({ t, row }); return { data: { id: 'arch1', ...row }, error: null }; };
        DB.signedDocUrls = async () => new Map();
        DB.client = { storage: { from: () => ({
          upload: async (p, b) => { window.__up.push({ p, size: b.size, type: b.type }); return { data: { path: p }, error: null }; },
        }) } };
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        Danubra.cfgRow = DATA.settings[0];
      });
      await page.evaluate(() => Wrk.load());
      const [okno] = await Promise.all([page.waitForEvent('popup'), page.evaluate(() => Wrk.gdpr('w1'))]);
      await okno.waitForLoadState();
      await okno.waitForFunction(() => !!window.html2pdf, null, { timeout: 20000 });
      const lista = await okno.evaluate(() => [...document.querySelectorAll('.toolbar button')]
        .filter(b => b.offsetParent !== null).map(b => b.textContent.trim()));
      const tlac = await okno.evaluate(() => {
        const css = [...document.querySelectorAll('style')].map(x => x.textContent).join('');
        return /@page\{size:A4;margin:0\}/.test(css) && !!document.querySelector('table.pf thead .pf-sp');
      });
      const dlP = page.waitForEvent('download', { timeout: 40000 }).catch(() => null);
      await okno.click('button.tb-doc:has-text("Stiahnuť PDF")');
      const dl = await dlP;
      let hlavicka = '', mediaBox = [];
      if (dl) {
        const f = await dl.path();
        const buf = require('fs').readFileSync(f);
        hlavicka = buf.slice(0, 5).toString('latin1');
        mediaBox = (buf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/) || []).slice(1).map(Number).map(Math.round);
      }
      await okno.waitForTimeout(500);
      const sprava = await okno.evaluate(() => document.getElementById('tb-msg').textContent.trim());
      const st = await page.evaluate(() => ({ up: window.__up, ins: window.__ins.map(x => ({ t: x.t, ...x.row })) }));

      ok(lista.includes('Stiahnuť PDF') && lista.includes('Poslať') && lista.includes('Tlačiť'),
        'v okne dokumentu je Stiahnuť PDF, Poslať a Tlačiť', lista.join(', '));
      ok(!lista.some(t => /Uložiť ako PDF/.test(t)), 'staré „Uložiť ako PDF / vytlačiť" už nie je');
      ok(tlac, 'tlač má nulový okraj strany — Chrome nemá kam dať adresu a dátum');
      ok(hlavicka === '%PDF-', 'stiahne sa skutočné PDF', hlavicka || 'nič sa nestiahlo');
      ok(mediaBox.join('x') === '595x842', 'strana PDF je presne A4 na výšku', mediaBox.join('x'));
      ok(st.up.length === 1 && /^archiv\/worker\/w1\//.test(st.up[0].p) && st.up[0].type === 'application/pdf',
        'PDF sa nahrá do úložiska k človeku', JSON.stringify(st.up));
      const zaz = st.ins.find(x => x.t === 'archive') || {};
      ok(zaz.kind === 'gdpr' && zaz.worker_id === 'w1' && /^\d{4}-\d{2}-\d{2} Súhlas GDPR – Jozef Malý\.pdf$/.test(zaz.file_name),
        'a zapíše sa do archívu s rozumným názvom', zaz.file_name);
      ok(/uložené do dokumentov/.test(sprava), 'okno povie, že je stiahnuté a uložené', sprava);

      // Strany A4: každá strana sa kreslí zvlášť, nič sa nestratí ani nerozsekne.
      const a4 = await page.evaluate(() => {
        const box = DanubraPaginate.pageBox(14);
        const src = document.createElement('div');
        src.style.cssText = `position:absolute;left:-30000px;top:0;width:${box.width}px;font:13px/1.6 sans-serif`;
        const odst = Array.from({ length: 60 }, (_, i) => `<p>Odsek ${i + 1}: ${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(3)}</p>`).join('');
        const zoznam = `<h3>Článok II</h3><ol>${Array.from({ length: 45 }, (_, i) => `<li>Bod ${i + 1} ${'text zmluvy '.repeat(8)}</li>`).join('')}</ol>`;
        const tab = `<table><thead><tr><th>Deň</th><th>Hodiny</th></tr></thead><tbody>${Array.from({ length: 80 }, (_, i) => `<tr><td>Riadok ${i + 1}</td><td>8</td></tr>`).join('')}</tbody></table>`;
        src.innerHTML = `<div class="head"><b>Hlavička</b></div>${odst}<div>${zoznam}</div>${tab}<div class="sigs"><div>Podpis A</div><div>Podpis B</div></div>`;
        document.body.appendChild(src);
        const { pages, stage } = DanubraPaginate.paginate(document, src, box);
        const text = (el) => el.textContent.replace(/\s+/g, '');
        const vysky = pages.map(p => p.scrollHeight);
        const res = {
          strany: pages.length,
          vysoke: vysky.filter(h => h > box.height).length,
          // Rovnaký text v rovnakom poradí (zopakované hlavičky tabuľky sa nerátajú).
          celyText: text(src).split('DeňHodiny').join('') === pages.map(text).join('').split('DeňHodiny').join(''),
          hlavickaTabulky: pages.filter(p => p.querySelector('tbody tr')).every(p => !!p.querySelector('thead')),
          cislovanie: pages.filter(p => p.querySelector('ol')).map(p => Number(p.querySelector('ol').getAttribute('start') || 1)),
          prvyBod: pages.filter(p => p.querySelector('ol li')).map(p => (p.querySelector('ol li').textContent.match(/Bod (\d+)/) || [])[1]),
          podpisy: pages.filter(p => p.querySelector('.sigs')).length,
        };
        stage.remove(); src.remove();
        return res;
      });
      ok(a4.strany >= 4 && a4.vysoke === 0, `dlhý dokument sa rozdelí na strany A4, žiadna nie je vyššia (${a4.strany} strán)`, JSON.stringify(a4));
      ok(a4.celyText, 'pri delení sa nestratí ani písmeno');
      ok(a4.hlavickaTabulky, 'hlavička tabuľky sa zopakuje na každej strane');
      ok(a4.cislovanie.every((n, i) => String(n) === a4.prvyBod[i]), 'číslovaný zoznam pokračuje správnym číslom na ďalšej strane',
        JSON.stringify([a4.cislovanie, a4.prvyBod]));
      ok(a4.podpisy === 1, 'podpisy sa nerozdelia medzi dve strany');

      // Obrazovka Dokumenty: podľa ľudí a firiem, najnovšie navrchu.
      const arch = await page.evaluate(async () => {
        const R = [
          { id: 'r1', kind: 'ramcova', number: '1', worker_id: 'w1', file_name: '2026-10-23 Rámcová zmluva 1 – Jozef Malý.pdf', created_at: '2026-10-23T10:00:00Z' },
          { id: 'r2', kind: 'werkvertrag', number: 'WV-1', partner_id: 'p1', lang: 'de', file_name: '2026-10-21 Werkvertrag WV-1 – GU Ulm GmbH.pdf', created_at: '2026-10-21T09:00:00Z' },
        ];
        const stare = DB.list;
        DB.list = async (t) => t === 'archive' ? { data: R, error: null }
          : t === 'partners' ? { data: [{ id: 'p1', name: 'GU Ulm GmbH' }], error: null } : stare(t);
        Danubra.route = 'archive';
        await Danubra.views.archive.call(Danubra, document.getElementById('view'));
        const v = document.getElementById('view');
        await Docs.pick('r1', true);
        return {
          skupiny: [...v.querySelectorAll('.arch-head')].map(h => h.textContent.replace(/\s+/g, ' ').trim()),
          lista: (v.querySelector('.arch-bar') || {}).textContent || '',
          zalozka: Danubra.parentOf('archive'),
        };
      });
      ok(arch.skupiny.length === 2 && /Jozef Malý/.test(arch.skupiny[0]) && /GU Ulm/.test(arch.skupiny[1]),
        'Dokumenty sú triedené podľa ľudí a firiem', arch.skupiny.join(' | '));
      ok(/Vybraté: 1/.test(arch.lista) && /Poslať/.test(arch.lista), 'po zaškrtnutí sa dá poslať aj viac naraz', arch.lista.replace(/\s+/g, ' '));
      ok(arch.zalozka === 'dashboard', 'Dokumenty sú záložka pri Dnes');
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }
    // ── Vydané faktúry: vystaviť, pozrieť, upraviť návrh ─────────────────
    // „Ako viem vystavovať faktúry a pozerať ich? Editovať?" Voľná faktúra
    // nemeckej firme vznikne ako návrh s položkami, dá sa upraviť (vyhodená
    // položka sa nemaže, dostane removed_at) a PDF je po nemecky.
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);
      const out = await page.evaluate(async () => {
        const DATA = {
          partners: [{ id: 'p1', name: 'GU Ulm GmbH', country: 'DE', ust_idnr: 'DE123456789', payment_terms_days: 14,
            address: 'Hauptstr. 1', postal_code: '89073', city: 'Ulm' }],
          subcontracts: [], periods: [], compliance: [], invoices: [], invoice_items: [], overrides: [],
          clients: [], orders: [],
          settings: [{ id: 's1', supplier: { name: 'Partner und Service s. r. o.', address: 'Nové Zámky',
            company_id: '57553921', iban: 'SK3112000000198742637541' } }],
        };
        const zapis = [];
        DB.list = async (t) => ({ data: (DATA[t] || []).map(x => ({ ...x })), error: null });
        DB.count = async () => 0;
        DB.rpc = async (n) => ({ data: n === 'next_number' ? '2026101' : null, error: null });
        DB.insert = async (t, row) => { zapis.push({ op: 'insert', t, row }); const r = { id: t + zapis.length, ...row };
          (DATA[t] = DATA[t] || []).push(r); return { data: r, error: null }; };
        DB.insertMany = async (t, rows) => { zapis.push({ op: 'insertMany', t, rows });
          rows.forEach((r, i) => DATA[t].push({ id: `it${i}`, ...r })); return { data: rows, error: null }; };
        DB.update = async (t, id, patch) => { zapis.push({ op: 'update', t, id, patch }); return { data: null, error: null }; };
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true };
        Danubra.members = [{ role: 'admin', active: true }];
        Danubra.cfgRow = DATA.settings[0];
        document.getElementById('login-screen').hidden = true;
        document.getElementById('app').hidden = false;
        Danubra.route = 'invoices'; Inv.loaded = false; Inv.v2.loaded = false;
        await Danubra.renderRoute();

        const res = {};
        await Inv.newInvoice();
        res.volby = [...document.querySelectorAll('#ui-modal .pick-tile b')].map(b => b.textContent.trim());
        UI.closeModal();

        await Inv.freeForm();
        document.querySelector('#man-form [name=partner_id]').value = 'p1';
        Inv._rows = [{ description: 'Montáž zábradlia', quantity: 12.5, unit: 'h', unit_price: 38 },
          { description: 'Doprava', quantity: 1, unit: 'paušál', unit_price: 120 }];
        Inv.renderRows();
        await Inv.saveFree();
        await new Promise(r => setTimeout(r, 400));
        const inv = zapis.find(z => z.op === 'insert' && z.t === 'invoices');
        const pol = zapis.find(z => z.op === 'insertMany' && z.t === 'invoice_items');
        res.faktura = inv && [inv.row.status, inv.row.total, inv.row.invoice_number, inv.row.vat_regime, inv.row.partner_id];
        res.polozky = pol && pol.rows.map(r => [r.description, r.total, !!r.invoice_id]);
        res.detail = (document.querySelector('#ui-modal') || { innerText: '' }).innerText;
        UI.closeModal();

        // Úprava návrhu: druhá položka von, prvá s inou cenou.
        const id = inv && ('invoices' + (zapis.indexOf(inv) + 1));
        Inv.items = [{ id, ...inv.row }];
        Inv.lines = [{ id: 'L1', invoice_id: id, description: 'Montáž zábradlia', quantity: 12.5, unit: 'h', unit_price: 38 },
          { id: 'L2', invoice_id: id, description: 'Doprava', quantity: 1, unit: 'paušál', unit_price: 120 }];
        Inv.load = async () => {};
        await Inv.freeForm(id);
        Inv.delRow(1);
        Inv._rows[0].unit_price = 40;
        Inv.renderRows();
        zapis.length = 0;
        await Inv.saveFree();
        res.uprava = zapis.map(z => [z.op, z.t, z.id || '', JSON.stringify(z.patch || z.row || {})]);
        UI.closeModal();

        // PDF dokument faktúry: po nemecky, s adresou odberateľa a položkami.
        let html = '';
        const stare = window.open;
        window.open = () => ({ document: { open() {}, write(h) { html += h; }, close() {} } });
        Inv.lines = Inv.lines.filter(l => l.id === 'L1').map(l => ({ ...l, unit_price: 40 }));
        Inv.items[0].total = 500;
        await Inv.openDocV2(id);
        window.open = stare;
        res.pdf = { rechnung: /Rechnung/.test(html), adresa: /Hauptstr\. 1/.test(html), riadok: /Montáž zábradlia/.test(html),
          rc: /§13b UStG/.test(html), bezDopravy: !/Doprava/.test(html) };

        // Schválená sa neupravuje.
        Inv.items[0].status = 'approved'; Inv.items[0].approved_at = 'x';
        const t0 = document.querySelectorAll('.toast').length;
        await Inv.freeForm(id);
        res.schvalenaModal = !!document.getElementById('man-form');
        return res;
      });
      ok(out.volby.join('|') === 'Zo zákazky — z odpracovaných hodín|Voľná faktúra nemeckej firme|Za živnostníka (v jeho mene)|Za celý mesiac naraz',
        'Vystaviť faktúru: zo zákazky, voľná Nemcovi, za živnostníka — bez starej ubytovacej agendy', out.volby.join(' | '));
      ok(JSON.stringify(out.faktura) === JSON.stringify(['draft', 595, '2026101', 'reverse_charge', 'p1']),
        'voľná faktúra vznikne ako návrh s číslom, reverse charge', JSON.stringify(out.faktura));
      ok(JSON.stringify(out.polozky) === JSON.stringify([['Montáž zábradlia', 475, true], ['Doprava', 120, true]]),
        'aj s položkami', JSON.stringify(out.polozky));
      ok(/Zobraziť faktúru \(PDF\)/.test(out.detail) && /Upraviť návrh/.test(out.detail) && /Montáž zábradlia/.test(out.detail),
        'po vytvorení sa otvorí detail s položkami, PDF a úpravou', out.detail.slice(0, 200));
      ok(out.uprava.some(z => z[0] === 'update' && z[1] === 'invoice_items' && z[2] === 'L2' && /removed_at/.test(z[3])),
        'vyhodená položka sa nemaže — dostane removed_at', JSON.stringify(out.uprava));
      ok(!out.uprava.some(z => z[0] === 'remove'), 'nič sa nemaže');
      ok(out.uprava.some(z => z[1] === 'invoices' && /"total":500/.test(z[3])), 'suma faktúry sa prepočíta z položiek (12,5 × 40)');
      ok(out.pdf.rechnung && out.pdf.adresa && out.pdf.riadok && out.pdf.rc && out.pdf.bezDopravy,
        'PDF faktúry: po nemecky, s adresou odberateľa, položkami a §13b', JSON.stringify(out.pdf));
      ok(!out.schvalenaModal, 'schválená faktúra sa nedá upraviť');
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }
    // ── Upomienky, mesačná fakturácia, balík pre účtovníčku ──────────────
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);
      const out = await page.evaluate(async () => {
        const dnes = Danubra._dayISO();
        const DATA = {
          partners: [{ id: 'p1', name: 'GU Ulm GmbH', country: 'DE', ust_idnr: 'DE1', address: 'Hauptstr. 1', city: 'Ulm' }],
          invoices: [{ id: 'i1', invoice_number: '2026088', status: 'overdue', total: 9800, amount_net: 9800, partner_id: 'p1',
            issue_date: '2026-08-01', due_date: '2026-09-01', subcontract_id: 's1' }],
          subcontracts: [{ id: 's1', title: 'Wohnpark', status: 'active', partner_id: 'p1' }],
          assignments: [{ id: 'a1', subcontract_id: 's1', worker_id: 'w1', charge_rate: 34, worker_rate: 22 }],
          timesheets: [{ id: 't1', assignment_id: 'a1', worker_id: 'w1', work_date: dnes.slice(0, 7) + '-02', hours: 8, approved: true }],
          periods: [], invoice_reminders: [], invoice_items: [], overrides: [], clients: [], orders: [], compliance: [],
          bills: [{ id: 'b1', supplier_name: 'Shell', amount: 80, issue_date: dnes.slice(0, 7) + '-03', status: 'paid', storage_path: 'x/shell.pdf' }],
          costs: [], workers: [{ id: 'w1', full_name: 'Jozef Malý' }], archive: [],
          settings: [{ id: 's1', supplier: { name: 'Partner und Service s. r. o.', address: 'Nové Zámky', company_id: '1', iban: 'SK3112000000198742637541' } }],
        };
        const zapis = []; const rpc = [];
        DB.list = async (t) => ({ data: (DATA[t] || []).map(x => ({ ...x })), error: null });
        DB.count = async () => 0;
        DB.rpc = async (n, a) => { rpc.push([n, a]); return { data: null, error: null }; };
        DB.insert = async (t, row) => { zapis.push({ t, row }); return { data: { id: 'new' + zapis.length, sent_at: new Date().toISOString(), ...row }, error: null }; };
        DB.update = async () => ({ data: null, error: null });
        DB.client = { storage: { from: () => ({ download: async () => ({ data: new Blob(['%PDF-1.4 test']), error: null }) }) } };
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true }; Danubra.members = [{ role: 'admin', active: true }];
        Danubra.cfgRow = DATA.settings[0];
        document.getElementById('login-screen').hidden = true; document.getElementById('app').hidden = false;
        Danubra.route = 'invoices'; Inv.loaded = false; Inv.v2.loaded = false;
        await Danubra.renderRoute();
        const res = { akcie: (document.getElementById('topbar-actions') || document.body).textContent };
        await Inv.detail('i1');
        res.detail = document.querySelector('#ui-modal').textContent.replace(/\s+/g, ' ');
        let html = '';
        const stare = window.open;
        window.open = () => ({ document: { open() {}, write(h) { html += h; }, close() {} }, close() {} });
        await Inv.remind('i1');
        window.open = stare;
        res.upomienka = { de: /Zahlungserinnerung/.test(html), cislo: /2026088/.test(html), suma: /9\.800,00/.test(html), adr: /Hauptstr/.test(html) };
        res.zapis = zapis.filter(z => z.t === 'invoice_reminders').map(z => [z.row.level, !!z.row.deadline]);
        res.dalsia = DanubraDunning.next(Inv.items[0], Inv.reminders, dnes).reason;
        UI.closeModal();

        await Inv.monthly(dnes.slice(0, 7));
        res.mesiac = [...document.querySelectorAll('#ui-modal .mf-row b')].map(b => b.textContent);
        await Inv.runMonthly();
        res.rpc = rpc.map(r => r[0]);
        res.obdobie = zapis.filter(z => z.t === 'periods').map(z => [z.row.subcontract_id, z.row.period_from.slice(8)]);
        UI.closeModal();

        await Inv.books(dnes.slice(0, 7));
        res.knihy = document.querySelector('#ui-modal').innerText;
        let zip = null;
        const dl = Docs.download;
        Docs.download = (w, f) => { zip = f; };
        await Inv.booksZip(true);
        Docs.download = dl;
        res.zip = zip ? { name: zip.name, size: zip.size, head: [...new Uint8Array(await zip.slice(0, 4).arrayBuffer())] } : null;
        return res;
      });
      ok(/Mesačná fakturácia/.test(out.akcie) && /Upomienky/.test(out.akcie) && /Pre účtovníčku/.test(out.akcie),
        'vo Vydaných sú tlačidlá Mesačná fakturácia, Upomienky, Pre účtovníčku', out.akcie.slice(0, 200));
      ok(/Upomienky/.test(out.detail) && /Pripomienka platby/.test(out.detail), 'faktúra po splatnosti ponúkne pripomienku platby', out.detail.slice(-300));
      ok(out.upomienka.de && out.upomienka.cislo && out.upomienka.suma && out.upomienka.adr, 'upomienka je po nemecky, s číslom, sumou a adresou', JSON.stringify(out.upomienka));
      ok(JSON.stringify(out.zapis) === '[[1,true]]', 'a zapíše sa — stupeň 1 s novou lehotou', JSON.stringify(out.zapis));
      ok(out.dalsia === 'wait', 'ďalšia upomienka sa hneď neponúkne');
      ok(out.mesiac.includes('Wohnpark'), 'mesačná fakturácia ukáže zákazku s hodinami', out.mesiac.join(','));
      ok(JSON.stringify(out.obdobie) === '[["s1","01"]]' && out.rpc.join(',') === 'close_period,invoice_from_period',
        'založí obdobie za mesiac, uzavrie ho a pripraví faktúru', JSON.stringify(out.obdobie) + ' ' + out.rpc.join(','));
      ok(/Vydané faktúry/.test(out.knihy) && /Prijaté faktúry/.test(out.knihy), 'prehľad pre účtovníčku ukáže vydané aj prijaté');
      ok(out.zip && /^Uctovnictvo \d{4}-\d{2}\.zip$/.test(out.zip.name) && out.zip.head.join() === '80,75,3,4',
        'stiahne sa jeden ZIP balík', JSON.stringify(out.zip));
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }
    // ── Marketing: nové firmy z mapy a e-mail firmám ─────────────────────
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);
      const out = await page.evaluate(async () => {
        const DATA = {
          partners: [{ id: 'p1', name: 'GU Ulm GmbH', city: 'Ulm', email: 'bau@gu-ulm.de' }],
          leads: [{ id: 'l0', name: 'Fliesen Huber', city: 'Ulm', email: 'info@huber.de', status: 'new', source: 'osm' },
            { id: 'l9', name: 'Odhlásená GmbH', city: 'Ulm', email: 'off@x.de', status: 'new', source: 'osm' }],
          subcontracts: [], lead_searches: [], campaigns: [], campaign_sends: [], email_optout: [{ email: 'off@x.de' }],
          settings: [{ id: 's1', supplier: { name: 'Partner und Service s. r. o.', address: 'Nové Zámky', company_id: '57553921' } }],
        };
        const zapis = []; const volania = [];
        DB.list = async (t) => ({ data: (DATA[t] || []).map(x => ({ ...x })), error: null });
        DB.count = async () => 0;
        DB.insert = async (t, row) => { zapis.push({ t, row }); return { data: { id: 'n' + zapis.length, ...row }, error: null }; };
        DB.insertMany = async (t, rows) => { zapis.push({ t, rows }); return { data: rows, error: null }; };
        DB.update = async (t, id, patch) => { zapis.push({ t, id, patch }); return { data: null, error: null }; };
        DB.client = { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-123' } } }) } };
        UI.confirm = async () => true;
        const pravy = window.fetch;
        window.fetch = async (u, o) => {
          const url = String(u); volania.push({ url, auth: o && o.headers && o.headers.Authorization });
          if (url.includes('nominatim')) return new Response(JSON.stringify([{ lat: '48.4', lon: '9.98', display_name: 'Ulm, BW' }]));
          if (url.includes('interpreter')) return new Response(JSON.stringify({ elements: [
            { type: 'node', id: 1, lat: 48.4, lon: 9.9, tags: { craft: 'builder', name: 'Müller Bau GmbH', 'addr:city': 'Neu-Ulm', email: 'info@mueller-bau.de' } },
            { type: 'node', id: 2, lat: 48.4, lon: 9.9, tags: { craft: 'tiler', name: 'Fliesen Huber', 'addr:city': 'Ulm' } }] }));
          if (url.includes('danubra-email-status')) return new Response(JSON.stringify({ smtp: true, from: 'P&S <info@punds.eu>' }));
          return new Response('{}');
        };
        Danubra.user = { id: 'test', email: 'test@firma.sk' };
        Danubra.me = { role: 'admin', active: true }; Danubra.members = [{ role: 'admin', active: true }];
        Danubra.cfgRow = DATA.settings[0];
        document.getElementById('login-screen').hidden = true; document.getElementById('app').hidden = false;
        Danubra.route = 'leads'; Lead.loaded = false;
        await Danubra.renderRoute();
        const res = { menu: [...document.querySelectorAll('#sidebar-nav .nav-item .nav-text')].map(x => x.textContent.trim()),
          karty: [...document.querySelectorAll('#view .acc-name')].map(x => x.textContent.trim()) };
        Lead.findForm();
        const sp = window.setTimeout;
        window.setTimeout = (f, ms) => sp(f, Math.min(ms || 0, 5));
        await Lead.searchMap();
        window.setTimeout = sp;
        res.najdene = [...document.querySelectorAll('#find-out .mf-row b')].map(x => x.textContent);
        await Lead.saveFound();
        res.ulozene = zapis.filter(z => z.t === 'leads').map(z => [z.row.name, z.row.source, z.row.email]);

        Danubra.route = 'campaigns'; Camp.loaded = false; Lead.loaded = true;
        await Danubra.renderRoute();
        res.smtp = document.querySelector('#view').textContent.includes('info@punds.eu');
        await Camp.form();
        await Camp.preview();
        res.pocet = document.getElementById('cf-count').textContent.replace(/\s+/g, ' ');
        res.ukazka = document.getElementById('cf-preview').textContent;
        await Camp.save(true);
        await new Promise(r => sp(r, 50));
        const sends = zapis.find(z => z.t === 'campaign_sends');
        res.adresati = sends ? sends.rows.map(r => [r.email, !!r.token && r.token.length >= 16]) : null;
        res.funkcia = volania.filter(v => v.url.includes('email-send')).map(v => v.auth);
        window.fetch = pravy;
        return res;
      });
      ok(out.menu.includes('Marketing') && out.menu.includes('Fakturácia'), 'v menu je Marketing aj Fakturácia', out.menu.join(', '));
      ok(out.karty.includes('Fliesen Huber'), 'Nové firmy ukazujú uložené firmy', out.karty.join(', '));
      ok(JSON.stringify(out.najdene) === '["Müller Bau GmbH"]', 'mapa nájde firmy pri meste odberateľa, už uloženú nie', JSON.stringify(out.najdene));
      ok(JSON.stringify(out.ulozene) === '[["Müller Bau GmbH","osm","info@mueller-bau.de"]]', 'vybraná firma sa uloží aj s e-mailom', JSON.stringify(out.ulozene));
      ok(out.smtp, 'E-maily ukážu, z akej adresy sa posiela');
      ok(/Odíde 1 e-mail/.test(out.pocet) && /odhlásil sa/.test(out.pocet), 'odhlásená adresa sa preskočí a povie sa to', out.pocet);
      ok(/Fliesen Huber/.test(out.ukazka) && /Keine weiteren E-Mails erhalten/.test(out.ukazka) && /57553921/.test(out.ukazka),
        'ukážka: meno firmy doplnené, pätička s odosielateľom a odhlásením', out.ukazka);
      ok(JSON.stringify(out.adresati) === '[["info@huber.de",true]]', 'adresáti sa zapíšu s kľúčom na odhlásenie', JSON.stringify(out.adresati));
      ok(out.funkcia.length === 1 && out.funkcia[0] === 'Bearer jwt-123', 'posielanie volá server s prihlásením (kľúč schránky je len tam)', JSON.stringify(out.funkcia));
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }
    // ── Správy: e-mailový klient (viac schránok, podpis, prístupy) ──────
    {
      const page = await browser.newPage();
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);
      const out = await page.evaluate(async () => {
        const dnes = new Date().toISOString();
        const DATA = {
          mailboxes: [
            { id: 'b1', name: 'Info', email: 'info@punds.eu', display_name: 'Partner und Service', signature: 'Štefan Varga\nP&S', last_sync_at: dnes, active: true },
            { id: 'b2', name: 'Fakturácia', email: 'fakturacia@punds.eu', signature: 'Účtovné oddelenie', last_sync_at: dnes, active: true }],
          mail_messages: [
            { id: 'm1', mailbox_id: 'b1', folder: 'INBOX', direction: 'in', from_email: 'hans@gu-ulm.de', from_name: 'Hans Gruber',
              to_list: [{ address: 'info@punds.eu' }], cc_list: [], subject: 'Angebot Wohnpark', sent_at: dnes, snippet: 'Guten Tag, wir brauchen…',
              seen: false, attachments: [{ name: 'plan.pdf', size: 20480, storage_path: 'mail/b1/INBOX/7-0-plan.pdf' }], partner_id: 'p1',
              message_id: '<abc@gu-ulm.de>', text_body: 'Guten Tag,\nwir brauchen 4 Fliesenleger.',
              html_body: '<p onclick="x()">Guten Tag</p><script>alert(1)</script><img src="https://track.example/p.gif">' },
            { id: 'm2', mailbox_id: 'b1', folder: 'Sent', direction: 'out', from_email: 'info@punds.eu', to_list: [{ address: 'bau@gu-ulm.de' }],
              cc_list: [], subject: 'Ponuka', sent_at: dnes, snippet: 'Dobrý deň', seen: true, attachments: [], partner_id: 'p1' }],
          members: [{ id: 'u1', user_id: 'uid-1', email: 'jana@punds.eu', full_name: 'Jana', role: 'coordinator', active: true },
            { id: 'u0', user_id: 'uid-0', email: 'stefan@punds.eu', full_name: 'Štefan', role: 'admin', active: true }],
          mailbox_access: [{ mailbox_id: 'b1', user_id: 'uid-1', active: true }],
          workers: [], partners: [{ id: 'p1', name: 'GU Ulm GmbH', email: 'bau@gu-ulm.de' }], leads: [],
          settings: [{ id: 's1', supplier: { name: 'Partner und Service s. r. o.' } }],
        };
        const volania = [];
        DB.list = async (t, o = {}) => {
          let r = (DATA[t] || []).map(x => ({ ...x }));
          if (o.filters && o.filters.id) r = r.filter(x => x.id === o.filters.id);
          return { data: r, error: null };
        };
        DB.count = async () => 0;
        DB.update = async () => ({ data: null, error: null });
        DB.client = { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-9' } } }) } };
        const pravy = window.fetch;
        window.fetch = async (u, o) => {
          const url = String(u);
          volania.push({ url, auth: o && o.headers && o.headers.Authorization, body: o && o.body ? JSON.parse(o.body) : null });
          if (url.includes('danubra-mail-send')) return new Response(JSON.stringify({ ok: true, id: 'n1' }));
          if (url.includes('danubra-mail-account')) return new Response(JSON.stringify({ ok: true, id: 'b3', imap: { ok: true }, smtp: { ok: true } }));
          return new Response('{}');
        };
        Danubra.user = { id: 'uid-0', email: 'stefan@punds.eu' };
        Danubra.me = { role: 'admin', active: true }; Danubra.members = [{ role: 'admin', active: true }];
        Danubra.cfgRow = DATA.settings[0];
        document.getElementById('login-screen').hidden = true; document.getElementById('app').hidden = false;
        const tick = () => new Promise(r => setTimeout(r, 30));

        Danubra.route = 'mail'; Mail.loaded = false; Mail.openId = null;
        await Danubra.renderRoute();
        const v = document.getElementById('view');
        const res = {
          menu: [...document.querySelectorAll('#sidebar-nav .nav-item .nav-text')].map(x => x.textContent.trim()),
          tabs: [...document.querySelectorAll('.subtab-txt b')].map(x => x.textContent.trim()),
          schranky: [...v.querySelectorAll('.mail-box-h b')].map(x => x.textContent),
          teraz: (v.querySelector('.nowbox-title') || {}).textContent || '',
          riadky: v.querySelectorAll('.mail-list .mail-row').length,
          neprec: v.querySelectorAll('.mail-list .mail-row.unread').length,
        };
        await Mail.open('m1');
        await tick(); await tick();
        const fr = v.querySelector('iframe.mail-body');
        res.srcdoc = fr ? fr.srcdoc : '';
        res.sandbox = fr ? fr.getAttribute('sandbox') : '';
        res.obrazky = v.textContent.includes('Obrázky z webu sú skryté');
        res.priloha = [...v.querySelectorAll('.mail-att .link-chip')].map(x => x.textContent.trim());
        res.prepojenie = [...v.querySelectorAll('.mail-meta .link-chip')].map(x => x.textContent.trim());
        res.seen = volania.filter(x => x.url.includes('mail-send')).map(x => x.body);

        await Mail.reply('m1');
        const f = document.getElementById('mc-form');
        res.komu = f.querySelector('[name=to]').value;
        res.predmet = f.querySelector('[name=subject]').value;
        res.text1 = f.querySelector('[name=text]').value;
        const od = f.querySelector('[name=mailbox_id]');
        od.value = 'b2'; od.dispatchEvent(new Event('change'));
        res.text2 = f.querySelector('[name=text]').value;
        await Mail.send();
        const posl = volania.filter(x => x.body && x.body.action === 'send');
        res.poslane = posl.map(x => ({ mb: x.body.mailbox_id, to: x.body.to.map(a => a.address), irt: x.body.in_reply_to, p: x.body.links.partner_id, auth: x.auth }));

        // E-maily pri odberateľovi
        const slot = document.createElement('div');
        slot.innerHTML = Mail.slot('partner', 'p1', 'bau@gu-ulm.de');
        document.body.appendChild(slot);
        await Mail.fill(slot);
        res.slot = [...slot.querySelectorAll('.mail-row b')].map(x => x.textContent.trim());
        res.slotBtn = slot.textContent.includes('Napísať e-mail');
        slot.remove();

        // Nastavenia → Schránky
        Danubra.route = 'mailboxes'; Mbx.loaded = false;
        await Danubra.renderRoute();
        res.mbx = [...v.querySelectorAll('.acc-name')].map(x => x.textContent);
        res.vidi = v.textContent.includes('Jana');
        res.hesla = !document.documentElement.outerHTML.includes('secret_enc');
        Mbx.form();
        const g = document.getElementById('mb-form');
        res.imap1 = g.imap_host.value + ':' + g.imap_port.value + ' ' + g.smtp_host.value;
        g.preset.value = 'forpsi'; g.preset.dispatchEvent(new Event('change'));
        res.imap2 = g.imap_host.value;
        g.email.value = 'zakazky@punds.eu'; g.password.value = 'tajne-heslo'; g.signature.value = 'Tím zákaziek';
        g.querySelector('input[name=acc][value="uid-1"]').checked = true;
        await Mbx.save();
        const ul = volania.filter(x => x.body && x.body.action === 'save').map(x => x.body);
        res.ulozenie = ul.map(b => ({ email: b.mailbox.email, host: b.mailbox.imap_host, pass: b.password, access: b.access, sig: b.mailbox.signature }));
        res.zaSync = volania.some(x => x.url.includes('danubra-mail-sync-background') && x.auth === 'Bearer jwt-9');
        window.fetch = pravy;
        return res;
      });
      ok(out.menu.includes('Správy'), 'v menu sú Správy', out.menu.join(', '));
      ok(out.tabs.includes('E-maily') && out.tabs.includes('Interné'), 'Správy majú záložky E-maily a Interné', out.tabs.join(', '));
      ok(JSON.stringify(out.schranky) === '["Info","Fakturácia"]', 'vidno obe schránky', JSON.stringify(out.schranky));
      ok(/1 neprečítaný e-mail/.test(out.teraz), 'veta „čo teraz" povie, koľko je neprečítaných', out.teraz);
      ok(out.riadky === 1 && out.neprec === 1, 'v Doručených je jeden neprečítaný (odoslaný tam nie je)', `${out.riadky}/${out.neprec}`);
      ok(out.srcdoc && !/<script/i.test(out.srcdoc) && !/onclick=/i.test(out.srcdoc) && /Content-Security-Policy/.test(out.srcdoc),
        'HTML e-mailu je bez skriptov a s CSP', out.srcdoc.slice(0, 200));
      ok(out.sandbox && !/allow-scripts/.test(out.sandbox), 'okno e-mailu je izolované a nespúšťa skripty', out.sandbox);
      ok(out.obrazky, 'obrázky z webu sú skryté, kým ich človek nezapne');
      ok(out.priloha.some(x => /plan\.pdf/.test(x)), 'príloha je vidieť', out.priloha.join(','));
      ok(out.prepojenie.some(x => /Odberateľ/.test(x)), 'e-mail je prepojený s odberateľom', out.prepojenie.join(','));
      ok(out.seen.some(b => b && b.action === 'seen' && b.id === 'm1' && b.seen === true), 'otvorený e-mail sa označí ako prečítaný aj na serveri', JSON.stringify(out.seen));
      ok(/hans@gu-ulm\.de/.test(out.komu) && out.predmet === 'Re: Angebot Wohnpark', 'odpoveď: adresát a predmet', `${out.komu} / ${out.predmet}`);
      ok(/-- \nŠtefan Varga/.test(out.text1) && /> wir brauchen 4 Fliesenleger/.test(out.text1), 'odpoveď má podpis schránky a citát', out.text1);
      ok(/Účtovné oddelenie/.test(out.text2) && !/Štefan Varga/.test(out.text2), 'iná schránka = iný podpis', JSON.stringify(out.text2));
      ok(JSON.stringify(out.poslane) === JSON.stringify([{ mb: 'b2', to: ['hans@gu-ulm.de'], irt: '<abc@gu-ulm.de>', p: 'p1', auth: 'Bearer jwt-9' }]),
        'odoslanie ide cez server, z vybranej schránky, ako odpoveď a s prepojením', JSON.stringify(out.poslane));
      ok(out.slot.length === 2 && out.slotBtn, 'pri odberateľovi sú jeho e-maily a tlačidlo Napísať', JSON.stringify(out.slot));
      ok(JSON.stringify(out.mbx) === '["Info","Fakturácia"]' && out.vidi, 'Schránky ukážu schránky a kto ich vidí', JSON.stringify(out.mbx));
      ok(out.hesla, 'zašifrované heslo sa do prehliadača nedostane');
      ok(out.imap1 === 'imap.websupport.sk:993 smtp.websupport.sk' && out.imap2 === 'imap.forpsi.com', 'servery Websupportu a Forpsi sa doplnia samy', `${out.imap1} / ${out.imap2}`);
      ok(JSON.stringify(out.ulozenie) === JSON.stringify([{ email: 'zakazky@punds.eu', host: 'imap.forpsi.com', pass: 'tajne-heslo', access: ['uid-1'], sig: 'Tím zákaziek' }]),
        'uloženie pošle heslo len serveru, s prístupmi a podpisom', JSON.stringify(out.ulozenie));
      ok(out.zaSync, 'po uložení sa e-maily hneď začnú sťahovať');
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
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
