// ============================================================================
// DANUBRA — „Logo alebo favicon musí byť všade" (v prehliadači)
// Spustenie:  node app/tests/logo-vsade.test.js
// ============================================================================
// Ten istý štvorček firmy (components/company-logo.js) na obrazovkách, kde sa
// ukazuje firma:
//   * Oslovovanie: Dnes na rade, Odoslané, Firmy a kontakty, okno firmy,
//   * Odberatelia (zoznam aj karta na telefóne) a detail odberateľa,
//   * Vydané faktúry (logo v čipe odberateľa) a detail faktúry,
//   * Úlohy, ktoré sa týkajú novej firmy alebo odberateľa,
//   * Správy → E-maily: odosielateľ (gmail = len iniciály) a hlavička e-mailu,
//   * hľadanie v hornom pruhu (odberateľ, faktúra).
// Overuje aj, že služba ikon dostane len doménu, nič sa nepýta pre firmu bez
// domény ani pre gmail a že sa nikde neukáže rozbitý obrázok.
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

// Logo ako obrázok bez siete (data: URI) — ako logo nahraté z webu firmy.
const SVG = (c) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="${c}"/></svg>`)}`;
const DNES = new Date().toISOString().slice(0, 10);

const DATA = {
  partners: [
    { id: 'p1', name: 'GU Ulm GmbH', city: 'Ulm', country: 'DE', website: 'https://www.gu-ulm.de', email: 'bau@gu-ulm.de', ust_idnr: 'DE287451936', is_construction: true, payment_terms_days: 30 },
    { id: 'p2', name: 'Hofmann Bau GmbH', city: 'Stuttgart', country: 'DE', email: 'hofmann.bau@gmail.com', is_construction: true },
    { id: 'p3', name: 'Weber Fliesen KG', city: 'Augsburg', country: 'DE', email: 'info@weber-fliesen.de', is_construction: false },
  ],
  leads: [
    { id: 'l1', name: 'Maier Innenausbau GmbH', city: 'Augsburg', status: 'new', email: 'info@maier-innenausbau.de', website: 'https://maier-innenausbau.de', logo_url: 'https://maier-innenausbau.de/logo.png', score: 90, created_at: '2026-10-25T08:00:00Z' },
    { id: 'l2', name: 'Elektro Huber KG', city: 'Ulm', status: 'contacted', email: 'buero@elektro-huber.de', website: 'https://elektro-huber.de', score: 70, created_at: '2026-10-25T08:00:00Z' },
    { id: 'l3', name: 'Kaya Fliesen', city: 'München', status: 'new', email: 'kaya.fliesen@gmx.de', score: 60, created_at: '2026-10-25T08:00:00Z' },
  ],
  invoices: [
    { id: 'i1', invoice_number: 'FA-2026-0042', partner_id: 'p1', status: 'sent', issue_date: '2026-10-01', due_date: '2099-10-31', total: 1200, type: 'standard' },
    { id: 'i2', invoice_number: 'FA-2026-0043', partner_id: 'p2', status: 'sent', issue_date: '2026-10-02', due_date: '2099-11-01', total: 800, type: 'standard' },
  ],
  outreach: [{ id: 'o1', lead_id: 'l2', step: 1, status: 'sent', sent_at: '2026-10-20T09:00:00Z', created_at: '2026-10-20T09:00:00Z', subject: 'Elektriker für Ulm?', to_email: 'buero@elektro-huber.de', mailbox_id: 'b1', lang: 'de' }],
  tasks: [
    { id: 't1', title: 'Zavolať firme Maier', status: 'open', due_date: DNES, entity_type: 'lead', entity_id: 'l1', entity_label: 'Maier Innenausbau GmbH', source: 'manual' },
    { id: 't2', title: 'Pripomenúť faktúru', status: 'open', due_date: DNES, entity_type: 'partner', entity_id: 'p1', entity_label: 'GU Ulm GmbH', source: 'manual' },
    { id: 't3', title: 'Doklady pre Jána', status: 'open', due_date: DNES, entity_type: 'worker', entity_id: 'w1', entity_label: 'Ján Kováčik', source: 'manual' },
  ],
  mailboxes: [{ id: 'b1', name: 'Info', email: 'info@punds.eu', display_name: 'Partner und Service', active: true, last_sync_at: new Date().toISOString() }],
  mail_messages: [
    { id: 'm1', mailbox_id: 'b1', folder: 'INBOX', direction: 'in', from_email: 'hans@gu-ulm.de', from_name: 'Hans Gruber', to_list: [{ address: 'info@punds.eu' }], cc_list: [],
      subject: 'Angebot Wohnpark', sent_at: new Date().toISOString(), snippet: 'Guten Tag', seen: false, attachments: [], partner_id: 'p1', text_body: 'Guten Tag' },
    { id: 'm2', mailbox_id: 'b1', folder: 'INBOX', direction: 'in', from_email: 'peter.novak77@gmail.com', from_name: 'Peter Novák', to_list: [{ address: 'info@punds.eu' }], cc_list: [],
      subject: 'Práca', sent_at: new Date().toISOString(), snippet: 'Dobrý deň', seen: true, attachments: [], text_body: 'Dobrý deň' },
    { id: 'm3', mailbox_id: 'b1', folder: 'INBOX', direction: 'in', from_email: 'anfrage@bau-pasing.de', from_name: 'Bau Pasing', to_list: [{ address: 'info@punds.eu' }], cc_list: [],
      subject: 'Anfrage Trockenbau', sent_at: new Date().toISOString(), snippet: 'Hallo', seen: true, attachments: [], text_body: 'Hallo' },
    { id: 'm4', mailbox_id: 'b1', folder: 'INBOX', direction: 'in', from_email: 'kontakt@neznama-firma.de', from_name: 'Neznáma Firma', to_list: [{ address: 'info@punds.eu' }], cc_list: [],
      subject: 'Dotaz', sent_at: new Date().toISOString(), snippet: 'Hallo', seen: true, attachments: [], text_body: 'Hallo' },
  ],
  members: [{ id: 'u0', user_id: 'uid-0', email: 'stefan@punds.eu', full_name: 'Štefan', role: 'admin', active: true }],
  workers: [{ id: 'w1', full_name: 'Ján Kováčik' }],
  subcontracts: [], outreach_events: [], email_optout: [], message_templates: [], lead_contacts: [], lead_searches: [], lead_tips: [], mailbox_access: [], trades: [],
  settings: [{ id: 's1', supplier: { name: 'Partner und Service s. r. o.' }, marketing: { outreach: { daily_limit: 30 } } }],
};

// Bez siete: služba ikon a weby firiem odpovedajú obrázkom; bau-pasing.de nemá
// ikonu (404 → iniciály), neznama-firma.de dostane 16 px glóbus (→ iniciály).
const ICON = (c, n = 64) => `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${c}"/><circle cx="32" cy="32" r="14" fill="#fff"/></svg>`;
async function setup(page, base) {
  const fav = [];
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => {
    const u = route.request().url();
    if (/google\.com\/s2\/favicons/.test(u)) {
      const d = new URL(u).searchParams.get('domain');
      fav.push(d);
      if (d === 'bau-pasing.de') return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: ICON(d === 'neznama-firma.de' ? '#999' : '#1D4ED8', d === 'neznama-firma.de' ? 16 : 64) });
    }
    if (/\.(png|svg|ico)(\?|$)/.test(u)) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: ICON('#B45309') });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto(`${base}/app/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.evaluate((DATA) => {
    try { localStorage.clear(); } catch (e) { /* bez úložiska */ }
    window.__DATA = DATA;
    DB.list = async (t, o = {}) => {
      let r = (DATA[t] || []).map(x => ({ ...x }));
      const f = o.filters || {};
      for (const [k, v] of Object.entries(f)) if (v != null) r = r.filter(x => (Array.isArray(v) ? v.includes(x[k]) : x[k] === v));
      return { data: r, error: null };
    };
    DB.count = async () => 0;
    DB.update = async () => ({ data: null, error: null });
    DB.signedDocUrls = async () => new Map();
    DB.client = { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } };
    const ROWS = { danubra_partners: DATA.partners, danubra_invoices: DATA.invoices };
    DB.from = (t) => { const k = t.startsWith('danubra_') ? t : `danubra_${t}`; const b = { select() { return b; }, limit() { return Promise.resolve({ data: ROWS[k] || [], error: null }); } }; return b; };
    window.fetch = async () => new Response('{}', { status: 200 });
    Danubra.user = { id: 'uid-0', email: 'stefan@punds.eu' };
    Danubra.me = { id: 'u0', user_id: 'uid-0', role: 'admin', active: true, full_name: 'Štefan' }; Danubra.members = DATA.members;
    Danubra.cfgRow = DATA.settings[0];
    document.getElementById('login-screen').hidden = true; document.getElementById('app').hidden = false;
    Danubra._buildNav();
  }, DATA);
  return fav;
}

const go = (page, route, prep) => page.evaluate(async ({ route, prep }) => {
  if (prep) (new Function(prep))();
  Danubra.route = route; location.hash = `#/${route}`;
  await Danubra.renderRoute();
  await new Promise(r => setTimeout(r, 150));
}, { route, prep });

/** Čo je v kontajneri: koľko log, aké iniciály, obrázky a ich adresy. */
const logos = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(`${sel} .co-logo`)].map(l => ({
  ini: (l.querySelector('.co-ini') || {}).textContent || '', img: l.querySelector('img') ? l.querySelector('img').getAttribute('src') : '',
  shown: !!l.querySelector('img.is-ok'), domain: l.getAttribute('data-co') || '',
  lazy: l.querySelector('img') ? l.querySelector('img').getAttribute('loading') === 'lazy' : null,
  w: l.getBoundingClientRect().width, h: l.getBoundingClientRect().height, chip: !!l.closest('.link-chip'),
})), sel);

(async () => {
  const exe = findChromium();
  if (!exe) { console.log('Prehliadačový test preskočený — Chromium sa nenašiel.\n\n0 prešlo, 0 padlo (preskočené)'); process.exit(0); }
  const { server, port } = await serve();
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const chyby = [];
    page.on('pageerror', e => chyby.push(e.message));
    const fav = await setup(page, base);

    console.log('Oslovovanie');
    await go(page, 'outreach', "Outreach.tab='today'; Outreach.loaded=false; Lead.loaded=false;");
    const dnes = await logos(page, '#view .list-row');
    ok(dnes.length >= 2 && dnes.every(l => l.w === 28 && l.h === 28), 'Dnes na rade: logo pri každej firme, pevná veľkosť 28 px', JSON.stringify(dnes));
    ok(dnes.some(l => l.ini === 'MI' && /maier-innenausbau\.de\/logo\.png/.test(l.img) && l.shown), 'Maier: uložené logo z webu', JSON.stringify(dnes));
    ok(dnes.some(l => l.ini === 'KF' && !l.img), 'Kaya (gmx.de): len iniciály, žiadny obrázok');
    await go(page, 'outreach', "Outreach.tab='sent';");
    const odoslane = await logos(page, '#dl-odoslane-oslovenie, #view .dl');
    ok(odoslane.some(l => l.ini === 'EH' && /s2\/favicons\?domain=elektro-huber\.de/.test(l.img)), 'Odoslané: logo firmy (favicon podľa domény)', JSON.stringify(odoslane));
    await go(page, 'outreach', "Outreach.tab='firms';");
    const firmy = await logos(page, '#dl-firmy-kontakty');
    ok(firmy.length === (await page.evaluate(() => document.querySelectorAll('#dl-firmy-kontakty .dl-row').length)) && firmy.length >= 1, 'Firmy a kontakty: logo pri každej firme', JSON.stringify(firmy));
    await page.evaluate(() => Outreach.detail('l2'));
    await page.waitForTimeout(150);
    ok((await logos(page, '#ui-modal .modal-head')).length === 1, 'okno firmy v Oslovovaní má logo v hlavičke');
    await page.evaluate(() => UI.closeModal());

    console.log('\nOdberatelia');
    await go(page, 'partners', 'Prt.loaded=false;');
    const prt = await logos(page, '#dl-odberatelia');
    ok(prt.length === 3, 'logo pri každom odberateľovi', JSON.stringify(prt));
    ok(prt.some(l => l.ini === 'GU' && /domain=gu-ulm\.de/.test(l.img)), 'GU Ulm: favicon z webu');
    ok(prt.some(l => l.ini === 'HB' && !l.img && !l.domain), 'Hofmann (gmail): iniciály bez obrázka');
    ok(prt.some(l => l.ini === 'WF' && /domain=weber-fliesen\.de/.test(l.img)), 'Weber bez webu: doména firemného e-mailu');
    await page.evaluate(() => Prt.detail('p1'));
    await page.waitForTimeout(150);
    ok((await logos(page, '#ui-modal .modal-head')).length === 1, 'detail odberateľa: logo v hlavičke');
    await page.evaluate(() => UI.closeModal());

    console.log('\nVydané faktúry');
    await go(page, 'invoices', 'Inv.loaded=false;');
    const inv = await logos(page, '#dl-faktury');
    ok(inv.length === 2 && inv.every(l => l.chip && l.w === 16), 'stĺpec Odberateľ: 16 px logo v čipe', JSON.stringify(inv));
    ok(inv.some(l => /domain=gu-ulm\.de/.test(l.img)), 'logo GU Ulm aj na faktúre');
    await page.evaluate(() => Inv.detail('i1'));
    await page.waitForTimeout(200);
    ok((await logos(page, '#ui-modal .modal-head')).length === 1, 'detail faktúry: logo odberateľa v hlavičke');
    await page.evaluate(() => UI.closeModal());

    console.log('\nÚlohy');
    await go(page, 'tasks', "Tsk.loaded=false; Tsk.filters.scope = 'all'; Tsk.filters.status = 'active';");
    const ul = await page.evaluate(() => [...document.querySelectorAll('#view .tk-row')].map(r => ({ t: r.textContent.replace(/\s+/g, ' ').trim().slice(0, 40), logo: !!r.querySelector('.link-chip .co-logo') })));
    ok(ul.find(r => /Maier/.test(r.t)) && ul.find(r => /Maier/.test(r.t)).logo, 'úloha k novej firme: logo v čipe', JSON.stringify(ul));
    ok(ul.find(r => /Pripomenúť faktúru/.test(r.t)) && ul.find(r => /Pripomenúť faktúru/.test(r.t)).logo, 'úloha k odberateľovi: logo v čipe');
    ok(ul.find(r => /Doklady/.test(r.t)) && !ul.find(r => /Doklady/.test(r.t)).logo, 'úloha k človeku: ikonka, nie logo');

    console.log('\nSprávy → E-maily');
    await go(page, 'mail', 'Mail.loaded=false; Mail.openId=null;');
    const mail = await page.evaluate(() => [...document.querySelectorAll('.mail-list .mail-row')].map(r => {
      const l = r.querySelector('.co-logo'); const i = l && l.querySelector('img');
      return { who: (r.querySelector('.mail-row-top b') || {}).textContent, ini: l ? l.querySelector('.co-ini').textContent : '', img: i ? i.getAttribute('src') : '',
        shown: !!(i && i.classList.contains('is-ok')), domain: l ? l.getAttribute('data-co') : '' };
    }));
    ok(mail.length === 4 && mail.every(m => m.ini), 'logo pri každom e-maile', JSON.stringify(mail));
    const hg = mail.find(m => m.who === 'Hans Gruber') || {};
    ok(/domain=gu-ulm\.de/.test(hg.img) && hg.shown, 'odberateľ: jeho logo (podľa webu odberateľa)', JSON.stringify(hg));
    const bp = mail.find(m => m.who === 'Bau Pasing') || {};
    ok(bp.domain === 'bau-pasing.de' && !bp.img && bp.ini === 'BP', 'iná firma: favicon domény odosielateľa — keď ho niet, iniciály (bez rozbitého obrázka)', JSON.stringify(bp));
    const nf = mail.find(m => m.who === 'Neznáma Firma') || {};
    ok(nf.domain === 'neznama-firma.de' && !nf.img && nf.ini === 'NF', '16 px glóbus Googlu sa nahradí iniciálami', JSON.stringify(nf));
    const gm = mail.find(m => m.who === 'Peter Novák') || {};
    ok(gm.ini === 'PN' && !gm.img, 'gmail: len iniciály, nikam sa nevolá', JSON.stringify(gm));
    await page.evaluate(() => Mail.open('m3'));
    await page.waitForTimeout(300);
    ok((await logos(page, '.mail-meta .mail-from')).length === 1, 'hlavička e-mailu: logo odosielateľa');

    console.log('\nHľadanie');
    await page.evaluate(() => { Danubra._sIdx = null; });
    await page.fill('#global-search', 'ulm');
    await page.waitForTimeout(600);
    let hits = await page.evaluate(() => [...document.querySelectorAll('#gs-pop .gs-row')].map(r => ({ t: r.querySelector('b').textContent, logo: !!r.querySelector('.co-logo') })));
    ok(hits.some(h => h.t === 'GU Ulm GmbH' && h.logo), 'výsledok Odberateľ: logo namiesto ikonky', JSON.stringify(hits));
    await page.fill('#global-search', 'FA-2026-004');
    await page.waitForTimeout(500);
    hits = await page.evaluate(() => [...document.querySelectorAll('#gs-pop .gs-row')].map(r => ({ t: r.querySelector('b').textContent, logo: !!r.querySelector('.co-logo') })));
    ok(hits.length === 2 && hits.every(h => h.logo), 'výsledok Faktúra: logo odberateľa', JSON.stringify(hits));
    await page.evaluate(() => Danubra.searchClose());

    console.log('\nSúkromie a výkon');
    const uniq = [...new Set(fav)];
    ok(uniq.length > 0 && uniq.every(d => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)), 'službe ikon ide len doména', JSON.stringify(uniq));
    ok(!uniq.some(d => /gmail|gmx|t-online|web\.de/.test(d)), 'bezplatné schránky sa nepýtajú', JSON.stringify(uniq));
    const allImg = await page.evaluate(() => [...document.querySelectorAll('.co-logo img')].every(i => i.loading === 'lazy' && i.decoding === 'async' && i.referrerPolicy === 'no-referrer'));
    ok(allImg, 'každý obrázok loga je lenivý, asynchrónny a bez referera');
    const broken = await page.evaluate(() => [...document.querySelectorAll('.co-logo img.is-ok')].filter(i => i.complete && !i.naturalWidth).length);
    ok(broken === 0, 'nikde rozbitý obrázok (iniciály zostanú)');

    console.log('\nTelefón');
    await page.setViewportSize({ width: 390, height: 860 });
    await go(page, 'partners', '');
    await page.waitForTimeout(200);
    const mob = await page.evaluate(() => [...document.querySelectorAll('#dl-odberatelia .dl-row')].map(r => {
      const l = r.querySelector('.co-logo'); const b = l && l.getBoundingClientRect();
      return { logo: !!l, visible: !!(b && b.width > 0 && b.height > 0) };
    }));
    ok(mob.length === 3 && mob.every(r => r.logo && r.visible), 'karta odberateľa na telefóne má logo', JSON.stringify(mob));
    const sirka = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    ok(sirka, 'na telefóne sa nič nevodorovne neposúva');
    ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${passed} prešlo, ${failed} padlo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`  ✗ test spadol: ${e.message}`); console.log('\n0 prešlo, 1 padlo'); process.exit(1); });
