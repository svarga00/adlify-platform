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
      ok(text.includes('neznamená, že nemáš záznamy'),
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
      ok(!out.predOdhalenim.includes('Rozhodol si správne'),
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
            menu: [...document.querySelectorAll('#sidebar-nav .nav-item')]
              .map(x => x.textContent.trim()).filter(Boolean),
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
      ok(out.text.includes('z 5 krokov hotových'), 'a koľko z nich je hotových');
      ok(out.html.includes('is-now'), 'ten, ktorý je na rade, je zvýraznený');
      ok(out.text.includes('Murár × 4'), 'plán ukazuje názov remesla, nie kľúč',
        out.text.slice(0, 300));
      ok(out.html.includes("Danubra.go('trades')") && out.html.includes("Danubra.go('candidates')"),
        'a odtiaľto sa dá ísť na zvyšok náboru');

      const i = out.menu.findIndex(x => x.startsWith('Nábor'));
      const k = out.menu.findIndex(x => x.startsWith('Kandidáti'));
      ok(i >= 0 && k > i, 'Nábor je v menu pred Kandidátmi', out.menu.join(' | '));
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
      ok(out.t.includes('Arbeitnehmerüberlassung'),
        'pri hodinovej cene sa ozve upozornenie');
      ok(out.t.includes('33,00 € / h'), 'dodatok ukazuje sumu, nie surové „33"');
      ok(out.t.includes('Prišiel podpísaný'), 'nepodpísaný dodatok sa dá podpísať');
      ok(out.html.includes('Con.uploadScan'), 'sken originálu sa dá nahrať');
      ok(out.html.includes('Con.document'), 'a zmluva sa dá otvoriť ako dokument');

      for (const f of ['site_name', 'price_model', 'fixed_price', 'unit_price',
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
          // obrazovku, tak sa vykreslí priamo.
          await Sub.profile(view, 'sc1');
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
          // Nastavenia sú prázdne — doklad si nesmie nič domyslieť.
          Cfg.row = { id: 'cfg', supplier: {} };
          Cfg.loaded = true;
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
        Cfg.row = { id: 'cfg', supplier: { name: 'Firma s.r.o.', company_id: '55667788' } };
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
          return {
            kroky,
            drahy: [...view.querySelectorAll('.fl-lane-head h2')].map(h => h.textContent.trim()),
            headline: view.querySelector('.headline').textContent.replace(/\s+/g, ' ').trim(),
          };
        })();
      });

      ok(out.kroky.length === 14, 'mapa má štrnásť krokov',
        `má ${out.kroky.length}`);
      ok(out.kroky.map(k => k.n).join(',') === '1,2,3,4,5,6,7,8,9,10,11,12,13,14',
        'a sú očíslované po poradí', out.kroky.map(k => k.n).join(','));
      ok(out.drahy.join(' | ') === 'Ľudia | Zákazky | Tu sa stretnú | Peniaze',
        'v štyroch dráhach', out.drahy.join(' | '));
      ok(out.kroky.every(k => k.lead && k.next),
        'každý krok povie, čo to je aj čo je po ňom');
      ok(out.kroky.every(k => k.help),
        'a každý má vysvetlivku — to je celý zmysel tejto obrazovky');
      ok(out.kroky.every(k => k.go), 'z každého kroku sa dá ísť tam, kde sa rieši');

      // Hlavička musí ukázať najskorší zaseknutý krok, nie posledný.
      ok(/kroku 1/.test(out.headline),
        'hlavička ukáže najskorší zaseknutý krok', out.headline);
      ok(/inzerát/i.test(out.kroky[0].todo) || /ozvať/.test(out.kroky[0].todo),
        'nábor bez inzerátu je vidieť ako chyba', out.kroky[0].todo);
      ok(/fl-bad/.test(out.kroky[0].cls), 'a je červený');
      ok(/čaká na prvý telefonát/.test(out.kroky[1].todo),
        'nezavolaný človek tiež', out.kroky[1].todo);
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

          return { tiles, riadkov, hlavicky, poHladani, prazdne, dokl };
        })();
      });

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
