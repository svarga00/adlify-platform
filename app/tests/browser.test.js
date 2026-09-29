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
