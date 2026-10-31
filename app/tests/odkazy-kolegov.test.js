// ============================================================================
// DANUBRA — Odkazy od kolegov v prehliadači: verejný formulár a záložka
// Spustenie:  node app/tests/odkazy-kolegov.test.js
// ============================================================================
// Ako browser.test.js: servíruje koreň repozitára s presmerovaniami
// z netlify.toml (formulár musí byť dostupný na /app/odkazy.html bez
// prihlásenia). Server (danubra-lead-tip) je podstrčený cez page.route.
//   * formulár: kľúč z kotvy, meno sa pamätá, riadky firiem, čipy vzťahu,
//     chyba pri neplatnom odkaze, odoslanie → „Ďakujeme, pridané N firiem",
//     výpadok siete → hláška a text ostane, neplatný odkaz → „neplatí",
//   * záložka Oslovovanie → Odkazy od kolegov: link pre kolegov (admin),
//     správa, rebríček, zoznam, Pridať do Nových firiem, Zamietnuť,
//     Vypnúť zber, Použiť ako vzor na hľadanie.
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
function readRedirects() {
  const toml = fs.readFileSync(path.join(REPO, 'netlify.toml'), 'utf8');
  const out = [];
  const re = /\[\[redirects\]\][^[]*?from\s*=\s*"([^"]+)"[^[]*?to\s*=\s*"([^"]+)"[^[]*?status\s*=\s*(\d+)/g;
  let m;
  while ((m = re.exec(toml))) out.push({ from: m[1], to: m[2], status: Number(m[3]) });
  return out;
}
function serve(redirects) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      const r = redirects.find(x => x.from === rel || (x.from.endsWith('/*') && rel.startsWith(x.from.slice(0, -1))));
      if (r) {
        const to = r.to.replace(':splat', r.from.endsWith('/*') ? rel.slice(r.from.length - 1) : '');
        if (r.status >= 300 && r.status < 400) { res.writeHead(r.status, { Location: to }); return res.end(); }
        if (r.status === 404) { res.writeHead(404); return res.end('nenájdené'); }
        rel = to;
      }
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
const TOKEN = 'c0ffee12'.repeat(6);

(async () => {
  const exe = findChromium();
  if (!exe) { console.log('Prehliadačový test preskočený — Chromium sa nenašiel.\n\n0 prešlo, 0 padlo (preskočené)'); process.exit(0); }
  const { server, port } = await serve(readRedirects());
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    console.log('Verejný formulár');
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 860 } });
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      const posts = [];
      let mode = 'ok';
      await page.route('**/.netlify/functions/danubra-lead-tip', async (route) => {
        const body = JSON.parse(route.request().postData() || '{}');
        posts.push(body);
        if (body.check) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
        if (mode === 'offline') return route.abort('internetdisconnected');
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, added: 2, duplicates: 1,
          results: [{ i: 0, company: 'Müller Bau GmbH', status: 'added' }, { i: 1, company: 'Huber Ausbau', status: 'added' }, { i: 2, company: 'GU Ulm', status: 'duplicate', why: 'už je náš odberateľ' }],
          mine: { tips: 5, fresh: 4, added: 1 }, rank: 2, team: 4 }) });
      });
      const resp = await page.goto(`${base}/app/odkazy.html#t=${TOKEN}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(400);
      ok(resp.status() === 200, '/app/odkazy.html je dostupná bez prihlásenia');
      ok(await page.isVisible('#form') && !(await page.isVisible('#dead')), 's platným kľúčom sa ukáže formulár');
      ok(posts.length === 1 && posts[0].check === true && posts[0].t === TOKEN, 'pri otvorení sa overí kľúč (z kotvy, v tele požiadavky)');
      await page.fill('#name', 'Michal');
      const f = (n, k) => `#firms .firm:nth-child(${n}) [data-k="${k}"]`;
      await page.fill(f(1, 'company'), 'Müller Bau GmbH');
      await page.fill(f(1, 'link'), 'localhost');
      await page.fill(f(1, 'city'), 'Ulm');
      const zla = await page.textContent('#firms .firm:nth-child(1) [data-f="link"]');
      ok(/Lokálna/.test(zla), 'neplatný odkaz hneď ukáže chybu', zla);
      await page.fill(f(1, 'link'), 'www.mueller-bau.de/?utm_source=wa');
      await page.click(f(1, 'city'));
      ok(/Web firmy: mueller-bau\.de/.test(await page.textContent('#firms .firm:nth-child(1) [data-hint]')), 'platný odkaz: „Web firmy: mueller-bau.de"');
      await page.check('#firms .firm:nth-child(1) .chip:nth-child(1) input');
      await page.fill(f(1, 'what'), 'Trockenbau Wohnpark 2024');
      await page.fill(f(1, 'contact'), 'Hr. Müller');
      await page.click('#add');
      await page.fill(f(2, 'company'), 'Huber Ausbau');
      await page.fill(f(2, 'link'), 'https://www.linkedin.com/company/huber');
      await page.press(f(2, 'link'), 'Tab');
      await page.check('#firms .firm:nth-child(2) .chip:nth-child(2) input');
      await page.check(f(2, 'unsure'));
      await page.click('#add');
      await page.fill(f(3, 'company'), 'GU Ulm');
      ok((await page.textContent('#go')) === 'Odoslať 3 firmy', 'tlačidlo hovorí, koľko firiem odíde');
      await page.screenshot({ path: process.env.SHOT_DIR ? path.join(process.env.SHOT_DIR, 'formular-390.png') : '/dev/null', fullPage: true }).catch(() => null);
      mode = 'offline';
      await page.click('#go');
      await page.waitForTimeout(300);
      ok(/skontrolujte pripojenie/.test(await page.textContent('#msg')) && (await page.inputValue(f(2, 'company'))) === 'Huber Ausbau', 'bez siete: hláška a všetko ostane vo formulári');
      mode = 'ok';
      await page.click('#go');
      await page.waitForSelector('#done:not(.hide)');
      const sent = posts[posts.length - 1];
      ok(sent.name === 'Michal' && sent.t === TOKEN && sent.website === '' && sent.firms.length === 3, 'odošle meno, kľúč, prázdnu pascu a 3 firmy');
      ok(sent.firms[0].relation === 'past_partner' && sent.firms[0].what === 'Trockenbau Wohnpark 2024' && sent.firms[1].relation === 'via_denis' && sent.firms[1].unsure === true,
        'vzťah, čo sme robili, neistota', JSON.stringify(sent.firms.slice(0, 2)));
      const hotovo = (await page.innerText('#done')).replace(/\s+/g, ' ');
      ok(/Ďakujeme, pridané 2 firmy/.test(hotovo) && /už ju máme/.test(hotovo) && /5 Vašich firiem spolu/.test(hotovo) && /2\. poradie v tíme z 4/.test(hotovo),
        'úspech: pridané 2 firmy, „už ju máme", Vaše firmy a poradie v tíme', hotovo);
      await page.screenshot({ path: process.env.SHOT_DIR ? path.join(process.env.SHOT_DIR, 'formular-hotovo-390.png') : '/dev/null', fullPage: true }).catch(() => null);
      await page.click('#again');
      ok((await page.$$('#firms .firm')).length === 1 && (await page.inputValue('#name')) === 'Michal', '„Pridať ďalšie": nový prázdny formulár, meno ostane');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);
      ok((await page.inputValue('#name')) === 'Michal', 'meno sa pamätá aj po znovuotvorení');
      const sirka = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      ok(sirka, 'na telefóne sa stránka nevodorovne neposúva');
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.join('; '));
      await page.close();

      const p2 = await browser.newPage();
      await p2.goto(`${base}/app/odkazy.html`, { waitUntil: 'domcontentloaded' });
      await p2.waitForTimeout(200);
      ok(await p2.isVisible('#dead') && !(await p2.isVisible('#form')), 'bez kľúča: „Odkaz je neplatný"');
      await p2.route('**/.netlify/functions/danubra-lead-tip', r => r.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Tento odkaz na zber firiem už neplatí."}' }));
      await p2.goto(`${base}/app/odkazy.html#t=${'d'.repeat(48)}`, { waitUntil: 'domcontentloaded' });
      await p2.reload({ waitUntil: 'domcontentloaded' });
      await p2.waitForTimeout(400);
      ok(await p2.isVisible('#dead') && /už neplatí/.test(await p2.textContent('#dead')), 'vypnutý alebo vymenený odkaz: stránka to povie hneď');
      await p2.close();
    }

    console.log('\nZáložka Odkazy od kolegov');
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
      const chyby = [];
      page.on('pageerror', e => chyby.push(e.message));
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1100);
      const out = await page.evaluate(async ({ TOKEN }) => {
        const T0 = '00000000-0000-4000-8000-0000000000';
        const DATA = {
          partners: [{ id: 'p1', name: 'GU Ulm GmbH', city: 'Ulm', website: 'gu-ulm.de' }], subcontracts: [], lead_searches: [],
          leads: [{ id: 'l1', name: 'Maier Innenausbau GmbH', city: 'Augsburg', website: 'https://www.maier-ausbau.de', status: 'won', source: 'kolega', tip_by: 'Jano', created_at: '2026-10-30T09:00:00Z' }],
          outreach: [], outreach_events: [], email_optout: [], message_templates: [], lead_contacts: [],
          lead_tips: [
            { id: `${T0}01`, company_name: 'Müller Bau GmbH', city: 'Ulm', kind: 'web', url: 'https://www.mueller-bau.de', website: 'https://www.mueller-bau.de', domain: 'mueller-bau.de',
              relation: 'past_partner', what_we_did: 'Trockenbau Wohnpark Feuerbach 2024, 6 ľudí', contact: 'Hr. Müller, 0171 2233', unsure: false, submitted_by_name: 'Michal', status: 'new',
              created_at: '2026-10-31T08:10:00Z', checked_at: '2026-10-31T08:11:00Z',
              meta: { checked: true, company: 'Müller Bau GmbH', email: 'info@mueller-bau.de', phone: '+49 731 123456', postal_code: '89073', city: 'Ulm', konatel: 'Hans Müller', title: 'Müller Bau' } },
            { id: `${T0}02`, company_name: 'Schmidt Ausbau', kind: 'profile', url: 'https://linkedin.com/company/schmidt', profile_url: 'https://linkedin.com/company/schmidt',
              relation: 'via_denis', what_we_did: 'Fasády u Denisa', submitted_by_name: 'Michal', status: 'new', unsure: true, created_at: '2026-10-31T08:12:00Z' },
            { id: `${T0}03`, company_name: 'GU Ulm', city: 'Ulm', kind: 'none', relation: 'relevant', submitted_by_name: 'Zuzka', status: 'duplicate', duplicate_of_partner_id: 'p1', created_at: '2026-10-31T07:00:00Z' },
            { id: `${T0}04`, company_name: 'Maier Innenausbau', kind: 'web', website: 'https://www.maier-ausbau.de', domain: 'maier-ausbau.de', relation: 'past_partner',
              submitted_by_name: 'Jano', status: 'added', lead_id: 'l1', created_at: '2026-10-30T09:00:00Z', checked_at: '2026-10-30T09:01:00Z' },
          ],
          settings: [{ id: 's1', supplier: { name: 'Partner und Service s. r. o.' }, marketing: { outreach: { daily_limit: 30 }, tips: { token: TOKEN, enabled: true, created_at: '2026-10-31T07:00:00Z' } } }],
        };
        const zapisy = [];
        DB.list = async (t) => ({ data: (DATA[t] || []).map(x => ({ ...x })), error: null });
        DB.count = async () => 0;
        DB.insert = async (t, row) => { zapisy.push(['insert', t, row]); const r = { ...row, id: 'l-new', created_at: new Date().toISOString() }; (DATA[t] = DATA[t] || []).push(r); return { data: r, error: null }; };
        DB.update = async (t, id, patch) => {
          zapisy.push(['update', t, id, patch]);
          const r = (DATA[t] || []).find(x => x.id === id); if (r) Object.assign(r, JSON.parse(JSON.stringify(patch)));
          return { data: r || null, error: null };
        };
        DB.client = { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-5' } } }) } };
        const volania = [];
        window.fetch = async (u, o) => { volania.push([String(u), o && o.body ? JSON.parse(o.body) : null]); return new Response('{}', { status: 202 }); };
        window.open = (u) => { volania.push(['open', u]); return null; };
        UI.confirm = async () => true;
        Danubra.user = { id: 'u-admin', email: 'a@firma.sk' };
        Danubra.me = { role: 'admin', active: true }; Danubra.members = [{ user_id: 'u-admin', role: 'admin', active: true, full_name: 'Štefan' }];
        Danubra.cfgRow = DATA.settings[0];
        document.getElementById('login-screen').hidden = true; document.getElementById('app').hidden = false;
        Danubra.route = 'outreach'; Outreach.tab = 'tips'; Lead.loaded = false; Outreach.loaded = false;
        await Danubra.renderRoute();
        for (let i = 0; i < 40 && !document.querySelector('#dl-odkazy-kolegov .dl-row'); i++) await new Promise(r => setTimeout(r, 50));
        const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
        const res = {};
        res.tab = txt([...document.querySelectorAll('.subtab')].find(b => /Odkazy od kolegov/.test(b.textContent)));
        res.link = (document.querySelector('.lt-link input') || {}).value;
        res.sprava = (document.querySelector('.lt-msg textarea') || {}).value;
        res.rebricek = [...document.querySelectorAll('.lt-board-t tbody tr')].map(tr => [...tr.cells].map(td => txt(td)).join('|'));
        res.riadky = [...document.querySelectorAll('#dl-odkazy-kolegov .dl-row .dl-title b')].map(b => b.textContent.trim());
        res.muller = txt([...document.querySelectorAll('#dl-odkazy-kolegov .dl-row')].find(r => r.textContent.includes('Müller')));
        res.schmidt = txt([...document.querySelectorAll('#dl-odkazy-kolegov .dl-row')].find(r => r.textContent.includes('Schmidt')));
        // Filter podľa vzťahu a kolegu
        DataList.set('odkazy-kolegov', 'vztah', ['via_denis']);
        res.filterVztah = [...document.querySelectorAll('#dl-odkazy-kolegov .dl-row .dl-title b')].map(b => b.textContent.trim());
        DataList.reset('odkazy-kolegov');
        DataList.set('odkazy-kolegov', 'kolega', 'Zuzka');
        res.filterKolega = [...document.querySelectorAll('#dl-odkazy-kolegov .dl-row .dl-title b')].map(b => b.textContent.trim());
        DataList.reset('odkazy-kolegov');
        // Nájsť web pri profile
        LeadTips.findWeb(`${T0}02`);
        res.hladanie = (volania.find(v => v[0] === 'open') || [])[1];
        document.querySelector('#lt-web [name=website]').value = 'schmidt-ausbau.de';
        await LeadTips.saveWebsite(`${T0}02`);
        await new Promise(r => setTimeout(r, 60));
        res.web = zapisy.find(z => z[0] === 'update' && z[1] === 'lead_tips' && z[2] === `${T0}02`);
        res.enrich = volania.find(v => /tips-enrich/.test(v[0]));
        // Pridať do Nových firiem
        await LeadTips.add(`${T0}01`);
        await new Promise(r => setTimeout(r, 60));
        res.lead = (zapisy.find(z => z[0] === 'insert' && z[1] === 'leads') || [])[2];
        res.tipAdded = zapisy.find(z => z[0] === 'update' && z[1] === 'lead_tips' && z[2] === `${T0}01`);
        res.sitemeta = volania.find(v => /sitemeta/.test(v[0]));
        res.detail = txt(document.getElementById('ui-modal'));
        UI.closeModal();
        // Zamietnuť
        await LeadTips.reject(`${T0}03`);
        document.querySelector('#lt-rej [name=reason]').value = 'nie je stavebná firma';
        await LeadTips.saveReject(`${T0}03`);
        res.zamietnute = zapisy.find(z => z[0] === 'update' && z[2] === `${T0}03`);
        // Vzor na hľadanie
        await LeadTips.useAsSeeds([`${T0}02`, `${T0}04`]);
        res.vzor = (document.querySelector('#find-urls [name=urls]') || {}).value;
        UI.closeModal();
        // Vypnúť zber
        await LeadTips.toggle();
        res.vypnute = (zapisy.filter(z => z[1] === 'settings').pop() || [])[3];
        await LeadTips.rotate();
        res.novy = ((zapisy.filter(z => z[1] === 'settings').pop() || [])[3] || {}).marketing;
        await new Promise(r => setTimeout(r, 50));
        res.noveLink = (document.querySelector('.lt-link input') || {}).value;
        return res;
      }, { TOKEN });
      ok(/Odkazy od kolegov/.test(out.tab) && /2/.test(out.tab), 'záložka „Odkazy od kolegov" s počtom nových', out.tab);
      ok(out.link === `${base}/app/odkazy.html#t=${TOKEN}`, 'link pre kolegov: kľúč v kotve', out.link);
      ok(/^Ahojte, mám pre vás bojovú úlohu\./.test(out.sprava) && out.sprava.includes(`Zapisujte sem: ${base}/app/odkazy.html#t=${TOKEN}`) && /Michal, na teba/.test(out.sprava),
        'hotová správa od majiteľa so skutočným odkazom', out.sprava);
      ok(out.rebricek[0] === '1.|Jano|1|1|1|1' && out.rebricek[1] === '2.|Michal|2|2|0|0', 'rebríček: odberateľ hore, potom počty', JSON.stringify(out.rebricek));
      ok(out.riadky.length === 4, 'zoznam: všetky firmy od kolegov', JSON.stringify(out.riadky));
      ok(/Spolupracovali sme/.test(out.muller) && /Trockenbau Wohnpark Feuerbach/.test(out.muller) && /Kontakt: Hr\. Müller/.test(out.muller) && /info@mueller-bau\.de/.test(out.muller) && /Michal/.test(out.muller) && /Nový/.test(out.muller),
        'riadok: vzťah, čo sme robili, kontakt, kto poslal, čo sme zistili, stav', out.muller);
      ok(/Robilo sa u Denisa/.test(out.schmidt) && /nie je si istý/.test(out.schmidt) && /Nájsť web/.test(out.schmidt), 'profil bez webu: Nájsť web', out.schmidt);
      ok(JSON.stringify(out.filterVztah) === '["Schmidt Ausbau"]' && JSON.stringify(out.filterKolega) === '["GU Ulm"]', 'filter podľa vzťahu a podľa kolegu', JSON.stringify([out.filterVztah, out.filterKolega]));
      ok(out.hladanie === 'https://www.google.com/search?q=Schmidt%20Ausbau', 'Nájsť web = len Google hľadanie v novom okne', out.hladanie);
      ok(out.web && out.web[3].website === 'https://schmidt-ausbau.de' && out.web[3].domain === 'schmidt-ausbau.de' && out.enrich && out.enrich[1].tip_ids[0].endsWith('02'),
        'vložený web sa uloží a spustí sa doplnenie údajov (s prihlásením)', JSON.stringify([out.web, out.enrich]));
      const L = out.lead || {};
      ok(L.source === 'kolega' && L.tip_by === 'Michal' && L.website === 'https://www.mueller-bau.de' && L.email === 'info@mueller-bau.de' && L.contact_person === 'Hans Müller' && L.source_tip_id.endsWith('01'),
        'Pridať do Nových firiem: zdroj kolega, web, e-mail, konateľ', JSON.stringify(L));
      ok(L.relevance === 1 && /spolupráca v minulosti/.test(L.relevance_note) && L.relevance_by === 'u-admin' && /Čo sme spolu robili: Trockenbau/.test(L.notes),
        'firma, s ktorou sme robili: palec hore a história v poznámke', JSON.stringify([L.relevance, L.relevance_note, L.notes]));
      ok(out.tipAdded && out.tipAdded[3].status === 'added' && out.tipAdded[3].lead_id === 'l-new' && out.tipAdded[3].reviewed_by === 'u-admin', 'odkaz je „Pridaný" a ukazuje na firmu');
      ok(out.sitemeta && JSON.stringify(out.sitemeta[1]) === '{"lead_ids":["l-new"]}', 'spustí sa logo, náhľad a poloha novej firmy');
      ok(/Tip od: Michal, 31\. 10\./.test(out.detail), 'otvorí sa firma s „Tip od: Michal, 31. 10."', out.detail.slice(0, 300));
      ok(out.zamietnute && out.zamietnute[3].status === 'rejected' && out.zamietnute[3].reject_reason === 'nie je stavebná firma', 'Zamietnuť: stav a dôvod, nič sa nemaže');
      ok(out.vzor === 'https://schmidt-ausbau.de\nhttps://www.maier-ausbau.de', 'Použiť ako vzor: weby firiem do hľadania podobných', JSON.stringify(out.vzor));
      ok(out.vypnute && out.vypnute.marketing.tips.enabled === false && out.vypnute.marketing.tips.token === TOKEN && out.vypnute.marketing.outreach.daily_limit === 30,
        'Vypnúť zber: kľúč ostane, ostatné nastavenia marketingu tiež', JSON.stringify(out.vypnute));
      ok(out.novy && out.novy.tips.enabled === true && /^[a-f0-9]{48}$/.test(out.novy.tips.token) && out.novy.tips.token !== TOKEN && out.noveLink.endsWith(out.novy.tips.token),
        'Vygenerovať nový link: nový kľúč, zber zapnutý', JSON.stringify(out.novy && out.novy.tips));
      ok(chyby.length === 0, 'a nič pri tom nespadne', chyby.slice(0, 3).join('; '));
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${passed} prešlo, ${failed} padlo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`  ✗ test spadol: ${e.message}`); console.log('\n0 prešlo, 1 padlo'); process.exit(1); });
