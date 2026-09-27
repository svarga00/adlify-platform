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
