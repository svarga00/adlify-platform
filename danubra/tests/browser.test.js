// ============================================================================
// DANUBRA — test v skutočnom prehliadači
// Spustenie:  node danubra/tests/browser.test.js
// ============================================================================
// `smoke.js` načíta skripty v stubovanom prostredí a overí, že sa appka
// poskladá. Jednu vec ale chytiť nevie: **či sa niečo vôbec zobrazí.**
//
// Prihlasovacia obrazovka aj appka sú v HTML skryté a odkrýva ich až kód.
// Keď sa predtým čokoľvek pokazí, stránka zostane úplne biela a bez hlášky.
// Presne to sa stalo v prevádzke, keď sa nenačítal klient Supabase.
//
// Tento test teda spustí naozajstný prehliadač a pozrie sa, či je tam text.
//
// Bez `playwright-core` sa preskočí — nie je to dôvod zhodiť `npm test`
// na stroji, kde prehliadač nie je.
// ============================================================================
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');

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

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
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

  const { server, port } = await serve();
  const url = `http://127.0.0.1:${port}/index.html`;
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
