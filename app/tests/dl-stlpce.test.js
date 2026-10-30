// ============================================================================
// DANUBRA — zoznamy: stĺpce podľa seba, posúvanie len tabuľky, okno firmy
// Spustenie:  node app/tests/dl-stlpce.test.js
// ============================================================================
// „Nech sa posúva len tabuľka, nie celá stránka, a chcem si tabuľku vedieť
// prispôsobiť podľa seba." + „Nevidím logá" + veľké okno firmy so záložkami.
//
// V skutočnom prehliadači (playwright-core), bez siete: databáza je
// podstrčená, obrázky z cudzích adries vrátia 404 (logo → iniciály).
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

const L = (o) => ({ status: 'new', source: 'outscraper', country: 'DE', created_at: '2026-10-01T08:00:00Z', business_status: 'OPERATIONAL',
  verified_at: '2026-10-29T08:00:00Z', web_ok: true, site_checked_at: '2026-10-29T08:00:00Z', ...o });
const DATA = {
  leads: [
    L({ id: 'l1', name: 'Maier Innenausbau GmbH', city: 'Augsburg', postal_code: '86150', address: 'Haunstetter Str. 112, 86150 Augsburg', region: 'Bayern',
      trade: 'suchá výstavba', score: 92, email: 'info@maier-innenausbau.de', phone: '+49 821 4507730', website: 'https://www.maier-innenausbau.de',
      rating: 4.7, reviews_count: 41, categories: ['Trockenbauunternehmen'], contact_person: 'Thomas Maier', vat_id: 'DE811222333', lat: 48.3517, lng: 10.8845,
      profile: { email_source: 'impressum' }, logo_url: 'https://www.maier-innenausbau.de/apple-touch-icon.png', og_image: 'https://www.maier-innenausbau.de/og.jpg',
      site_title: 'Maier Innenausbau – Trockenbau in Augsburg', site_description: 'Ihr Partner für Trockenbau in Augsburg.', site_embeddable: true,
      next_step_at: '2026-11-04', next_step_text: 'Zavolať p. Maierovi' }),
    L({ id: 'l2', name: 'Keller Akustik GmbH', city: 'München', email: 'info@keller-akustik.de', website: 'keller-akustik.de', score: 80, site_embeddable: false }),
    L({ id: 'l3', name: 'Bez webu Bau', city: 'Ulm', score: 50, site_checked_at: null }),
  ],
  partners: [], subcontracts: [{ id: 's1', title: 'Hala Pasing', status: 'active', site_city: 'München', lat: 48.1497, lng: 11.4614 }],
  lead_searches: [], outreach: [], outreach_events: [], email_optout: [], message_templates: [], lead_contacts: [], members: [], mailboxes: [],
  settings: [{ id: 's1', supplier: { name: 'Partner und Service s. r. o.', address: 'Nové Zámky', office_coords: '47.98544, 18.16195' }, marketing: {} }],
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
  // Bez siete: cudzie adresy (logá, favicony, náhľady) = 404.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto(`http://127.0.0.1:${port}/app/`, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  const boot = async (user = 'u-1') => page.evaluate(async ({ DATA, user }) => {
    window.__calls = [];
    DB.list = async (t) => ({ data: (DATA[t] || []).map(x => ({ ...x })), error: null });
    DB.count = async () => 0;
    DB.update = async () => ({ data: null, error: null });
    DB.client = { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } };
    const pf = window.fetch;
    window.fetch = async (u, o) => {
      const url = String(u);
      if (url.includes('/.netlify/functions/')) { window.__calls.push({ url, body: o && o.body }); return new Response('{}', { status: 202 }); }
      return pf(u, o);
    };
    Danubra.user = { id: user, email: 'test@punds.eu' };
    Danubra.me = { role: 'admin', active: true }; Danubra.members = [{ role: 'admin', active: true }];
    Danubra.cfgRow = DATA.settings[0];
    document.getElementById('login-screen').hidden = true; document.getElementById('app').hidden = false;
    Danubra._buildNav();
    Danubra.route = 'leads'; Lead.loaded = false;
    await Danubra.views.leads.call(Danubra, document.getElementById('view'));
  }, { DATA, user });

  console.log('Stĺpce podľa seba');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* nič */ } });
  await boot();
  await page.waitForTimeout(300);
  const heads = () => page.evaluate(() => [...document.querySelectorAll('#dl-leads .dl-head .dl-th')]
    .filter(e => getComputedStyle(e).display !== 'none').map(e => e.className.match(/dl-col-(\w+)/)).filter(Boolean).map(m => m[1]));
  const h0 = await heads();
  ok(h0[0] === 'firma' && h0.includes('email') && !h0.includes('vzdialenost'), 'predvolené stĺpce (Od nás je predvolene skrytý)', h0.join(','));
  await page.click('#dl-leads [data-dl-a="cols"]');
  ok(await page.isVisible('#dl-leads .dl-cols'), 'tlačidlo „Stĺpce" otvorí panel');
  ok(await page.isDisabled('#dl-leads [data-dl-a="colvis"][data-k="firma"]'), 'prvý stĺpec (Firma) sa skryť nedá');
  await page.click('#dl-leads [data-dl-a="colvis"][data-k="email"]');
  await page.click('#dl-leads [data-dl-a="colvis"][data-k="vzdialenost"]');
  await page.click('#dl-leads [data-dl-a="colmove"][data-k="skore"][data-v="-1"]');
  const h1 = await heads();
  ok(!h1.includes('email') && h1.includes('vzdialenost') && h1.indexOf('skore') < h1.indexOf('stav'), 'skrytie, zapnutie a posun šípkou sa hneď prejavia', h1.join(','));
  const rowCells = await page.evaluate(() => [...document.querySelectorAll('#dl-leads .dl-row[data-dl-row="l1"] .dl-c')].map(e => (e.className.match(/dl-col-(\w+)/) || [])[1]).filter(Boolean));
  ok(!rowCells.includes('email') && rowCells.indexOf('skore') < rowCells.indexOf('stav'), 'riadky majú rovnaké stĺpce ako hlavička', rowCells.join(','));
  const km = await page.evaluate(() => (document.querySelector('#dl-leads .dl-row[data-dl-row="l1"] .dl-col-vzdialenost') || {}).textContent || '');
  ok(/541 km/.test(km), 'stĺpec Od nás: vzdialenosť od kancelárie', km);
  await page.click('#dl-leads [data-dl-a="density"][data-v="compact"]');
  ok(await page.evaluate(() => document.getElementById('dl-leads').classList.contains('is-compact')), 'hustota Kompaktné');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('danubra_dlc_u-1_leads') || 'null'));
  ok(saved && saved.hidden.includes('email') && saved.density === 'compact', 'nastavenie sa uloží pre používateľa a zoznam', JSON.stringify(saved));

  // Šírka ťahaním za okraj hlavičky.
  const box = await page.evaluate(() => { const h = document.querySelector('#dl-leads .dl-th.dl-col-stav .dl-rsz'); h.scrollIntoView({ block: 'center' }); const r = h.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.move(box.x, box.y); await page.mouse.down(); await page.mouse.move(box.x + 80, box.y, { steps: 4 }); await page.mouse.up();
  const w = await page.evaluate(() => (JSON.parse(localStorage.getItem('danubra_dlc_u-1_leads') || '{}').widths || {}).stav);
  ok(w >= 170 && w <= 200, `šírka stĺpca ťahaním (Stav ${w} px)`);

  // Iný používateľ = vlastné stĺpce; po návrate ostanú.
  await boot('u-2');
  ok((await heads()).includes('email'), 'iný používateľ má svoje (pôvodné) stĺpce');
  await boot('u-1');
  ok(!(await heads()).includes('email'), 'po prihlásení ostanú Vaše stĺpce');
  if (!(await page.isVisible('#dl-leads .dl-cols'))) await page.click('#dl-leads [data-dl-a="cols"]');
  await page.click('#dl-leads [data-dl-a="colreset"]');
  ok((await heads()).includes('email') && !(await page.evaluate(() => localStorage.getItem('danubra_dlc_u-1_leads'))), '„Pôvodné nastavenie" vráti všetko a zmaže uložené');

  console.log('\nPosúva sa len tabuľka, nie stránka');
  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => {
      const t = document.querySelector('#dl-leads .dl-table');
      return { page: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth, tw: t.clientWidth, bar: document.querySelector('#dl-leads .dl-bar').getBoundingClientRect().right };
    });
    ok(m.page <= m.vw && m.bar <= m.vw, `${width} px: stránka sa do boku neposúva`, JSON.stringify(m));
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  if (!(await page.isVisible('#dl-leads .dl-cols'))) await page.click('#dl-leads [data-dl-a="cols"]');
  for (const k of ['vzdialenost', 'kontakt']) await page.click(`#dl-leads [data-dl-a="colvis"][data-k="${k}"]`);
  const sc = await page.evaluate(() => {
    const t = document.querySelector('#dl-leads .dl-table');
    t.scrollLeft = 200; t.dispatchEvent(new Event('scroll'));
    const first = t.querySelector('.dl-row .dl-c:first-child').getBoundingClientRect().left - t.getBoundingClientRect().left;
    return { scroll: t.scrollWidth > t.clientWidth, left: t.scrollLeft, first: Math.round(first), page: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth, cls: t.classList.contains('is-scrolled') };
  });
  ok(sc.scroll && sc.left > 0 && sc.page <= sc.vw, 'veľa stĺpcov: tabuľka sa posúva vo svojej karte', JSON.stringify(sc));
  ok(Math.abs(sc.first) <= 2 && sc.cls, 'prvý stĺpec pri posúvaní ostane stáť (s tieňom)', JSON.stringify(sc));
  await page.click('#dl-leads [data-dl-a="colreset"]');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const mob = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, row: getComputedStyle(document.querySelector('#dl-leads .dl-row')).display }));
  ok(mob.page <= 390 && mob.row === 'flex', 'telefón: karty, nič nepreteká', JSON.stringify(mob));
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log('\nLogo firmy');
  await page.waitForTimeout(400);
  const logo = await page.evaluate(() => {
    const l = document.querySelector('#dl-leads .dl-row[data-dl-row="l1"] .ld-logo');
    return { ini: (l.querySelector('.ld-ini') || {}).textContent, img: !!l.querySelector('img'), broken: [...document.querySelectorAll('.ld-logo img')].filter(i => i.complete && !i.naturalWidth && i.classList.contains('is-ok')).length };
  });
  ok(logo.ini === 'MI' && !logo.img && logo.broken === 0, 'logo sa nenačítalo (ani favicon) → iniciály, žiadny rozbitý obrázok', JSON.stringify(logo));

  console.log('\nOkno firmy');
  await page.evaluate(() => { try { localStorage.removeItem('danubra_ld_tab_u-1'); } catch (e) { /* nič */ } Lead.detail('l1'); });
  await page.waitForTimeout(200);
  const d = await page.evaluate(() => {
    const card = document.querySelector('.modal-card');
    const g = [...document.querySelectorAll('.ld-glance .ld-g-l')].map(e => e.textContent.trim());
    return { cls: card.classList.contains('ld-modal'), w: Math.round(card.getBoundingClientRect().width), g,
      glance: document.querySelector('.ld-glance').textContent.replace(/\s+/g, ' '),
      tabs: [...document.querySelectorAll('.ld-tab')].map(t => t.textContent.trim()), sel: (document.querySelector('.ld-tab[aria-selected="true"]') || {}).textContent,
      slot: !!document.getElementById('lead-contacts-slot'), head: document.querySelector('.ld-id').textContent.replace(/\s+/g, ' '),
      bar: document.querySelector('.ld-bar').textContent.replace(/\s+/g, ' '), found: (document.querySelector('.ld-found') || {}).textContent || '' };
  });
  ok(d.cls && d.w > 1000, `veľké okno na počítači (${d.w} px)`);
  ok(JSON.stringify(d.g) === '["Kde","Ako ďaleko","Telefón","Web","E-mail","Google"]', 'hore: kde, ako ďaleko, telefón, web, e-mail, Google', d.g.join(', '));
  ok(/Augsburg, Bayern/.test(d.glance) && /cca 541 km/.test(d.glance) && /vzdušnou čiarou/.test(d.glance) && /K zákazke Hala Pasing/.test(d.glance)
    && /približne/.test(d.glance) && /\+49 821 4507730/.test(d.glance) && /4,7/.test(d.glance), 'vzdialenosť od kancelárie aj k zákazke, telefón, hodnotenie', d.glance.slice(0, 400));
  ok(/Maier Innenausbau GmbH/.test(d.head) && /skóre 92/.test(d.head) && /4\. 11\. 2026/.test(d.head) && /Ihr Partner für Trockenbau/.test(d.head), 'hlavička: meno, etapa, skóre, ďalší krok, popis z webu', d.head);
  ok(/Osloviť|Poznámka/.test(d.bar) && /Overiť znova/.test(d.bar) && /Urobiť odberateľa/.test(d.bar) && /Archivovať/.test(d.bar) && /Upraviť/.test(d.bar), 'lišta akcií', d.bar);
  ok(JSON.stringify(d.tabs) === '["Prehľad","Kontakty a oslovenie","Podrobnosti","Web"]' && d.sel === 'Prehľad', 'záložky, predvolene Prehľad', d.tabs.join(','));
  ok(d.slot && /Čo sme zistili/.test(d.found) && /Hodnotenie 4,7 z 5/.test(d.found), 'slot pre kontakty a „Čo sme zistili"', d.found.slice(0, 200));
  await page.click('.ld-tab[data-ld-tab="web"]');
  ok(await page.evaluate(() => localStorage.getItem('danubra_ld_tab_u-1')) === 'web', 'posledná záložka sa zapamätá');
  await page.click('.ld [data-ld-panel="web"] .ld-web-bar .btn-primary');
  const fr = await page.evaluate(() => { const f = document.querySelector('.ld-frame iframe'); return f ? { sb: f.getAttribute('sandbox'), src: f.getAttribute('src') } : null; });
  ok(fr && /allow-scripts/.test(fr.sb) && fr.src === 'https://www.maier-innenausbau.de', 'web sa dá vložiť → „Zobraziť web tu" = iframe sandbox', JSON.stringify(fr));
  await page.evaluate(() => { UI.closeModal(); Lead.detail('l2'); });
  const w2 = await page.evaluate(() => ({ sel: (document.querySelector('.ld-tab[aria-selected="true"]') || {}).textContent, txt: document.querySelector('[data-ld-panel="web"]').textContent.replace(/\s+/g, ' '), frame: !!document.querySelector('.ld-frame') }));
  ok(w2.sel === 'Web' && /nedovoľuje/.test(w2.txt) && !w2.frame, 'web, ktorý to zakazuje, sa neponúkne vložiť (len otvoriť v novom okne)', JSON.stringify(w2));
  await page.keyboard.press('Escape');
  await page.evaluate(() => UI.closeModal());

  console.log('\nObnoviť logá a náhľady');
  const calls = await page.evaluate(async () => {
    window.__calls = [];
    try { localStorage.removeItem('danubra_sm_auto_u-1'); } catch (e) { /* nič */ }
    Lead._sm = null; Lead._smAutoDone = false;
    Lead.rows.push({ id: 'l9', name: 'Neu GmbH', website: 'https://neu.de', site_checked_at: null });
    Lead.autoSiteMeta();
    await new Promise(r => setTimeout(r, 50));
    const first = window.__calls.filter(c => c.url.includes('danubra-leads-sitemeta-background')).length;
    const band = (document.getElementById('ld-sm') || {}).textContent || '';
    Lead.smStop(); Lead.autoSiteMeta();
    await new Promise(r => setTimeout(r, 50));
    return { first, band: band.replace(/\s+/g, ' '), again: window.__calls.filter(c => c.url.includes('danubra-leads-sitemeta-background')).length };
  });
  ok(calls.first === 1 && /Dopĺňam logá a náhľady k 1 firme/.test(calls.band), 'firmy bez náhľadu: appka ho doplní sama a povie to', JSON.stringify(calls));
  ok(calls.again === 1, 'najviac raz za 30 minút (nie pri každom otvorení)');

  ok(chyby.length === 0, 'v prehliadači nič nespadlo', chyby.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
  console.log(`\n${passed} prešlo, ${failed} padlo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`  ✗ test spadol: ${e.stack}`); console.log('\n0 prešlo, 1 padlo'); process.exit(1); });
