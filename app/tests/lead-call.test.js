// ============================================================================
// DANUBRA — „Idem volať" a dotazník po hovore v detaile firmy
// Spustenie:  node app/tests/lead-call.test.js
// ============================================================================
// „Na začiatku profilu niečo ako ‚idem volať' a potom jednoduchý dotazník,
// čo sme sa z hovoru dozvedeli — aspoň v bodoch."
//
// V skutočnom prehliadači (playwright-core), bez siete: databáza je
// podstrčená, server (danubra-lead-contact) tiež. Stráži sa:
//   * „Idem volať" otvorí panel (nie okno): koho pýtať, telefón, nemecké
//     vety s remeslom firmy, námietky, upozornenie na nahrávanie, stopky,
//   * „Hovor skončil" zastaví stopky a otvorí záznam s dĺžkou a dotazníkom,
//   * klikanie v dotazníku poskladá súhrn v bodoch a navrhne výsledok,
//   * uloží sa súhrn, výsledok, dĺžka a odpovede; hlavička ukáže posledný hovor,
//   * to isté v Oslovovaní, na telefóne nič nepreteká.
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

const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
const DATA = {
  leads: [{ id: 'l1', name: 'Demirtas Malerbetrieb GmbH', city: 'Augsburg', region: 'Bayern', postal_code: '86150', trade: 'Maler', categories: ['Malerbetrieb'],
    contact_person: 'Herr Ali Demirtas', phone: '+49 821 123456', email: 'info@demirtas.example', status: 'contacted', source: 'outscraper', country: 'DE', created_at: ago(10) }],
  lead_contacts: [{ id: 'c1', lead_id: 'l1', kind: 'call', outcome: 'no_answer', our_member_name: 'Jana Kováčová', happened_at: ago(3), created_at: ago(3) }],
  members: [{ id: 'm1', user_id: 'u-1', full_name: 'Štefan Varga', email: 'stefan@punds.eu', role: 'admin', active: true }],
  partners: [], subcontracts: [], lead_searches: [], outreach: [], outreach_events: [], email_optout: [], message_templates: [], mailboxes: [],
  settings: [{ id: 's1', supplier: { name: 'Partner und Service s. r. o.' }, marketing: {} }],
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
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto(`http://127.0.0.1:${port}/app/`, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  await page.evaluate(async (DATA) => {
    window.__saved = [];
    DB.list = async (t) => ({ data: (DATA[t] || []).map(x => ({ ...x })), error: null });
    DB.count = async () => 0;
    DB.update = async () => ({ data: null, error: null });
    DB.client = { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } };
    const pf = window.fetch;
    window.fetch = async (u, o) => {
      const url = String(u);
      if (url.includes('danubra-lead-contact')) {
        const b = JSON.parse(o.body);
        if (b.action === 'suggest') {
          const p = DanubraFollowup.parse(b.summary);
          return new Response(JSON.stringify({ suggestion: p ? { next_step_at: p.date, next_step_text: 'Poslať profily partií', source: 'rules', matched: p.text, stage_suggestion: 'interested' } : null, ai_error: null }), { status: 200 });
        }
        window.__saved.push(b);
        const contact = { id: 'c-new', lead_id: b.lead_id, kind: b.kind, outcome: b.outcome, summary: b.summary, duration_min: b.duration_min, happened_at: b.happened_at,
          our_member_name: 'Štefan Varga', created_at: new Date().toISOString(), ai_extracted: b.answers ? { answers: b.answers } : null };
        return new Response(JSON.stringify({ ok: true, contact, task: null, lead: { id: b.lead_id, status: 'interested', last_contact_at: b.happened_at } }), { status: 200 });
      }
      if (url.includes('/.netlify/functions/')) return new Response('{}', { status: 202 });
      return pf(u, o);
    };
    Danubra.user = { id: 'u-1', email: 'stefan@punds.eu' };
    Danubra.members = DATA.members; Danubra.me = DATA.members[0];
    Danubra.cfgRow = DATA.settings[0];
    document.getElementById('login-screen').hidden = true; document.getElementById('app').hidden = false;
    Danubra._buildNav();
    Danubra.route = 'leads'; Lead.loaded = false;
    await Danubra.views.leads.call(Danubra, document.getElementById('view'));
    Lead.detail('l1'); Lead.tab('kontakty');
  }, DATA);
  await page.waitForSelector('#lead-contacts-slot [data-lc-a="sheet"]');
  await page.waitForTimeout(150);

  console.log('Hlavička: posledný hovor');
  const head = await page.evaluate(() => (document.querySelector('.ld-modal .ld-id-call') || {}).textContent || '');
  ok(/Posledný hovor: pred 3 dňami · Nedvíha · Jana/.test(head), 'pod menom firmy „Posledný hovor: pred 3 dňami · Nedvíha · Jana"', head);

  console.log('\nIdem volať');
  const order = await page.evaluate(() => {
    const s = document.querySelector('#lead-contacts-slot');
    const call = s.querySelector('[data-lc-a="sheet"]'), outs = s.querySelector('.lc-outs');
    return !!(call && outs && (call.compareDocumentPosition(outs) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  ok(order, 'tlačidlo „Idem volať" je nad tlačidlami „Po hovore"');
  const modals = await page.evaluate(() => document.querySelectorAll('.modal-backdrop').length);
  await page.click('#lead-contacts-slot [data-lc-a="sheet"]');
  const sh = await page.evaluate(() => {
    const s = document.querySelector('.lc-sheet');
    return s ? { txt: s.textContent.replace(/\s+/g, ' '), modals: document.querySelectorAll('.modal-backdrop').length, timer: s.querySelector('[data-lc-timer]').textContent,
      tel: (s.querySelector('a[href^="tel:"]') || {}).getAttribute && s.querySelector('a[href^="tel:"]').getAttribute('href'),
      de: [...s.querySelectorAll('.lc-sc-de')].map(e => e.textContent), rec: /nahrávať|nahrávk|recording|getUserMedia/i.test(s.innerHTML.replace('Hovor nenahrávajte bez súhlasu druhej strany', '')) } : null;
  });
  ok(sh && sh.modals === modals, 'panel sa otvorí v záložke, nie ako ďalšie okno');
  ok(sh && /Koho pýtať/.test(sh.txt) && /Herr Demirtas/.test(sh.txt) && sh.tel === 'tel:+49821123456' && /Kopírovať/.test(sh.txt), 'koho pýtať (konateľ), telefón s tel: a kopírovaním', sh && sh.txt.slice(0, 300));
  ok(sh && sh.de.some(t => /Malerarbeiten in Bayern/.test(t)) && sh.de.some(t => /Werkvertrag/.test(t)) && sh.de.some(t => /Herrn Demirtas sprechen/.test(t)), 'nemecké vety s remeslom a regiónom firmy', sh && sh.de.join(' | ').slice(0, 300));
  ok(sh && /Časté námietky/.test(sh.txt) && /Scheinselbst/.test(sh.txt) && /Konditionen nennen wir Ihnen im Angebot/.test(sh.txt), 'námietky s odpoveďami, cena „im Angebot"');
  ok(sh && /Hovor nenahrávajte bez súhlasu druhej strany/.test(sh.txt) && !sh.rec, 'pripomienka o súhlase, žiadne nahrávanie');
  ok(sh && sh.timer === '00:00', 'stopky bežia od 00:00', sh && sh.timer);
  await page.waitForTimeout(2100);
  const t2 = await page.evaluate(() => document.querySelector('[data-lc-timer]').textContent);
  ok(/^00:0[2-3]$/.test(t2), `stopky idú (${t2})`);
  // tel: by v prehliadači bez telefónu otvoril systémové okno — navigácia sa zastaví, obsluha komponentu beží.
  await page.evaluate(() => window.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a[href^="tel:"]')) e.preventDefault(); }, true));
  await page.click('.lc-sheet a[href^="tel:"]');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => !document.querySelector('[data-lc-form]')), 'klik na číslo počas hovoru záznam ešte neotvorí');

  console.log('\nHovor skončil a dotazník');
  await page.click('[data-lc-a="callend"]');
  await page.waitForTimeout(1200);
  const end = await page.evaluate(() => ({ timer: document.querySelector('[data-lc-timer]').textContent, cls: document.querySelector('[data-lc-timer]').classList.contains('is-done'),
    dur: (document.querySelector('[name=duration_min]') || {}).value, quiz: !!document.querySelector('[data-lc-quiz]'), summary: document.querySelector('[name=summary]').value,
    sites: (document.querySelector('[data-lc-q="sites"]') || {}).value }));
  await page.waitForTimeout(1100);
  ok(end.cls && (await page.evaluate(() => document.querySelector('[data-lc-timer]').textContent)) === end.timer, `stopky stoja (${end.timer})`, JSON.stringify(end));
  ok(end.dur === '1', 'dĺžka hovoru je vo formulári (1 min)', end.dur);
  ok(end.quiz && end.summary === '', 'otvorí sa záznam s dotazníkom „Čo sme sa dozvedeli", text zatiaľ prázdny', JSON.stringify(end));
  ok(end.sites === 'Augsburg, Bayern a okolie', 'stavby predvyplnené z regiónu firmy', end.sites);

  const q = (k, v) => page.click(`[data-lc-a="q"][data-k="${k}"][data-v="${v}"]`);
  await q('right_person', 'yes');
  await q('subcontractors', 'yes');
  await q('trades', 'Maler');
  await q('trades', 'WDVS / Putz');
  await page.fill('[data-lc-q="headcount"]', '4');
  await q('when', 'spring');
  await q('staffed', 'seasonal');
  await q('interest', '4');
  await q('send', 'profiles');
  await q('callback_when', 'o 2 týždne');
  await page.waitForTimeout(1300);
  const filled = await page.evaluate(() => ({ summary: document.querySelector('[name=summary]').value, on: (document.querySelector('.lc-oc.is-on') || {}).dataset,
    head: document.querySelector('[data-lc-form] > b').textContent, auto: document.querySelector('.lc-autoout').textContent.replace(/\s+/g, ' '),
    sug: (document.querySelector('.lc-sug') || {}).textContent || '', chips: document.querySelectorAll('.lc-chip.is-on').length }));
  const lines = filled.summary.split('\n');
  ok(lines[0] === '• Správna osoba: Ali Demirtas' && lines.includes('• Subdodávateľov berú: áno') && lines.includes('• Remeslá: Maler, WDVS / Putz'), 'súhrn v bodoch: správna osoba, subdodávatelia, remeslá', filled.summary);
  ok(lines.includes('• Potrebujú: 4 ľudí, na jar') && lines.includes('• Stavby: Augsburg, Bayern a okolie') && lines.includes('• Záujem: 4/5') && lines.includes('• Poslať: profily partií') && lines.includes('• Ozvať sa: o 2 týždne'),
    'počet a odkedy, stavby, záujem, čo poslať, kedy sa ozvať', filled.summary);
  ok(filled.on && filled.on.v === 'interested' && /Má záujem/.test(filled.head) && /vychádza výsledok Má záujem/.test(filled.auto), 'záujem 4/5 → výsledok Má záujem', JSON.stringify(filled.on) + filled.auto);
  ok(/Návrh appky/.test(filled.sug) && /o 2 týždne/.test(filled.sug), 'návrh ďalšieho kroku zo súhrnu (termín z odpovede)', filled.sug);
  await q('interest', '4');
  ok(await page.evaluate(() => !/Záujem:/.test(document.querySelector('[name=summary]').value)), 'opätovný klik odpoveď zruší');
  await q('interest', '4');

  // Človek vyberie iný výsledok tlačidlom — odpovede ostanú, appka ponúkne prepnutie späť.
  await page.click('.lc-oc[data-v="send_offer"]');
  const sw = await page.evaluate(() => ({ summary: document.querySelector('[name=summary]').value, auto: document.querySelector('.lc-autoout').textContent.replace(/\s+/g, ' ') }));
  ok(/Záujem: 4\/5/.test(sw.summary) && /vybrali ste Poslať ponuku/.test(sw.auto), 'výber výsledku tlačidlom dotazník nezahodí', JSON.stringify(sw));
  await page.click('[data-lc-a="useout"]');

  // Kto radšej píše: vlastný text dotazník neprepíše.
  await page.fill('[name=summary]', '• Záujem: 4/5\nVlastná poznámka: volať Bauleiterovi.');
  await q('staffed', 'no');
  ok(await page.evaluate(() => /Vlastná poznámka/.test(document.querySelector('[name=summary]').value)), 'ručne upravený text sa neprepíše');
  await page.fill('[name=summary]', '');
  await q('staffed', 'seasonal');
  ok(await page.evaluate(() => /Majú dosť ľudí: sezónne/.test(document.querySelector('[name=summary]').value)), 'vymazaný text sa znova poskladá z dotazníka');

  await page.click('[data-lc-a="accept"]');
  await page.click('[data-lc-a="save"]');
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => window.__saved[0]);
  ok(saved && saved.outcome === 'interested' && saved.duration_min === 1 && /^• Správna osoba/.test(saved.summary) && saved.next_step_at, 'uloží výsledok, dĺžku, súhrn a ďalší krok', JSON.stringify(saved));
  ok(saved && saved.answers && saved.answers.interest === 4 && saved.answers.trades.join() === 'Maler,WDVS / Putz' && saved.answers.headcount === 4 && saved.answers.when === 'spring'
    && saved.answers.send.join() === 'profiles', 'odpovede idú na server štruktúrovane', JSON.stringify(saved && saved.answers));
  const after = await page.evaluate(() => ({ form: !!document.querySelector('[data-lc-form]'), sheet: !!document.querySelector('.lc-sheet'), tl: document.querySelector('.lc-tl').textContent,
    head: (document.querySelector('.ld-modal .ld-id-call') || {}).textContent || '' }));
  ok(!after.form && !after.sheet && /Má záujem/.test(after.tl) && /Záujem: 4\/5/.test(after.tl), 'po uložení: záznam v histórii, panel aj formulár zavreté');
  ok(/Posledný hovor: práve teraz · Má záujem · Štefan/.test(after.head), 'hlavička ukáže nový posledný hovor', after.head);

  console.log('\nVoľný text bez dotazníka');
  await page.click('.lc-oc[data-v="callback"]');
  await page.click('[data-lc-a="quiz"][data-v="off"]');
  const off = await page.evaluate(() => ({ quiz: !!document.querySelector('[data-lc-quiz]'), on: !!document.querySelector('[data-lc-a="quiz"][data-v="on"]') }));
  ok(!off.quiz && off.on, '„Radšej napíšem text" dotazník skryje (dá sa vrátiť)');
  await page.click('.lc-oc[data-v="no_answer"]');
  await page.click('[data-lc-a="cancel"]');
  await page.click('.lc-oc[data-v="no_answer"]');
  ok(await page.evaluate(() => !document.querySelector('[data-lc-quiz]') && !!document.querySelector('[data-lc-a="quiz"][data-v="on"]')), 'pri „Nedvíha" je dotazník predvolene skrytý');
  await page.click('[data-lc-a="cancel"]');

  console.log('\nTelefón (390 px)');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#lead-contacts-slot [data-lc-a="sheet"]');
  await page.click('[data-lc-a="callend"]');
  await page.waitForTimeout(200);
  const mob = await page.evaluate(() => {
    const over = [...document.querySelectorAll('.lc-sheet, .lc-quiz, .lc-form, .lc-script li')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).length;
    return { page: document.documentElement.scrollWidth, over, cols: getComputedStyle(document.querySelector('.lc-quiz')).gridTemplateColumns.split(' ').length };
  });
  ok(mob.page <= 390 && mob.over === 0 && mob.cols === 1, 'nič nepreteká, dotazník v jednom stĺpci', JSON.stringify(mob));
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log('\nOslovovanie');
  await page.evaluate(async () => { UI.closeModal(); await Outreach.detail('l1'); });
  await page.waitForSelector('#oc-lc [data-lc-a="sheet"]', { timeout: 4000 }).catch(() => null);
  ok(await page.evaluate(() => !!document.querySelector('#oc-lc [data-lc-a="sheet"]')), 'detail firmy v Oslovovaní má tiež „Idem volať"');
  await page.evaluate(() => UI.closeModal());

  ok(chyby.length === 0, 'v prehliadači nič nespadlo', chyby.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
  console.log(`\n${passed} prešlo, ${failed} padlo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`  ✗ test spadol: ${e.stack}`); console.log('\n0 prešlo, 1 padlo'); process.exit(1); });
