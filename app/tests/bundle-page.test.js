// ============================================================================
// Balík dokumentov pre živnostníka — verejná stránka /b/<token>
// Spustenie:  node app/tests/bundle-page.test.js
// ============================================================================
// Funkcia netlify/functions/punds-bundle.js sa testuje bez Supabase: databáza
// a podpísané odkazy sú podstrčené (deps). Overuje sa, že zlý token sa nepýta
// databázy, neplatný/zrušený/prepadnutý odkaz nič neprezradí, text z DB sa
// escapuje a stiahnuť sa dá len dokument, ktorý je v balíku.
// ============================================================================
'use strict';
const path = require('path');
const fn = require(path.join(__dirname, '..', '..', 'netlify', 'functions', 'punds-bundle.js'));

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{25A0}-\u{25FF}\u{2190}\u{2191}\u{2193}-\u{21FF}]/u;
const TOKEN = 'Ab3_dEf-9hIjKlMnOpQr';
const A1 = '11111111-1111-4111-8111-111111111111';
const A2 = '22222222-2222-4222-8222-222222222222';
const A3 = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-10-26T10:00:00Z');

function bundleRow(over) {
  return Object.assign({
    id: 'b-1', token: TOKEN, worker_id: 'w-1',
    title: 'Papiere na nástup — Wohnpark Feuerbach <script>alert(1)</script>',
    items: [{ archive_id: A1, title: 'Infolist <img src=x onerror=alert(2)>', kind: 'infolist' },
      { archive_id: A2, title: 'Vzor faktúry', kind: 'invoice_template' }],
    message: 'Prvý riadok\nDruhý <b>riadok</b> & "úvodzovky"',
    expires_at: '2026-11-25T10:00:00Z', revoked_at: null, opened_at: null, open_count: 0,
  }, over || {});
}

function makeDeps(bundle) {
  const calls = { bundle: [], archive: [], worker: [], settings: 0, touch: [], sign: [] };
  const archive = {
    [A1]: { id: A1, file_name: 'infolist.pdf', storage_path: 'w-1/infolist.pdf', title: 'Infolist' },
    [A2]: { id: A2, file_name: 'vzor-faktury.pdf', storage_path: 'w-1/vzor.pdf', title: 'Vzor' },
    [A3]: { id: A3, file_name: 'cudzi.pdf', storage_path: 'other/cudzi.pdf', title: 'Cudzí' },
  };
  return {
    calls,
    now: () => NOW,
    db: {
      bundle: async (t) => { calls.bundle.push(t); return bundle && bundle.token === t ? bundle : null; },
      archive: async (ids) => { calls.archive.push(ids); return ids.map((i) => archive[i]).filter(Boolean); },
      worker: async (id) => { calls.worker.push(id); return { full_name: 'Ján <i>Novák</i>' }; },
      settings: async () => { calls.settings++; return { supplier: { phone: '+421 900 123 456', email: 'nabor@punds.sk' } }; },
      touch: async (id) => { calls.touch.push(id); },
    },
    signedUrl: async (p, name) => { calls.sign.push([p, name]); return `https://store.example/sign/${p}?download=${name}&token=x`; },
  };
}

const get = (p, deps, ua) => fn.handle({ method: 'GET', path: p, userAgent: ua || 'Mozilla/5.0 (Linux; Android 8.0)' }, deps);
const dbCalls = (c) => c.bundle.length + c.archive.length + c.worker.length + c.settings + c.touch.length;

(async () => {
  console.log('Balík — verejná stránka');

  // ── Hlavičky a tvar tokenu ──
  for (const bad of ['/b/short', '/b/' + 'a'.repeat(65), '/b/abc%27%3Bdrop%20table%20xx', '/b/abcdefghijklmnop.q', '/b/', '/b/' + TOKEN + '/x/y']) {
    const d = makeDeps(bundleRow());
    const r = await get(bad, d);
    ok(r.status === 404 && dbCalls(d.calls) === 0, `zlý tvar tokenu bez dotazu do DB: ${bad.slice(0, 30)}`, `status ${r.status}, db ${dbCalls(d.calls)}`);
    ok(/Odkaz už neplatí/.test(r.body), '  … a priateľská stránka');
  }

  {
    const d = makeDeps(null);
    const r = await get('/b/' + TOKEN, d);
    ok(r.status === 404 && /Odkaz už neplatí — zavolajte nám/.test(r.body), 'neexistujúci token → „Odkaz už neplatí"');
    ok(/href="tel:\+421900123456"/.test(r.body) && /nabor@punds\.sk/.test(r.body), '  … s naším telefónom a e-mailom');
    ok(d.calls.touch.length === 0 && d.calls.archive.length === 0 && d.calls.worker.length === 0, '  … a nič iné sa nečíta ani nezapisuje');
    ok(r.headers['Cache-Control'] === 'no-store' && r.headers['X-Robots-Tag'] === 'noindex, nofollow'
      && r.headers['Referrer-Policy'] === 'no-referrer', '  … hlavičky no-store, noindex, no-referrer');
    const csp = r.headers['Content-Security-Policy'] || '';
    ok(/default-src 'none'/.test(csp) && !/script-src/.test(csp), '  … prísne CSP (žiadne skripty)');
  }

  const invalidBodies = [];
  for (const [label, over] of [['zrušený', { revoked_at: '2026-10-20T00:00:00Z' }], ['prepadnutý', { expires_at: '2026-10-25T00:00:00Z' }]]) {
    const b = bundleRow(over);
    const d = makeDeps(b);
    const r = await get('/b/' + TOKEN, d);
    invalidBodies.push(r.body);
    ok(r.status === 404 && /Odkaz už neplatí/.test(r.body), `${label} odkaz → „Odkaz už neplatí"`);
    ok(!/Feuerbach|Infolist|Ján/.test(r.body), `  … nič z balíka sa neprezradí`);
    ok(d.calls.touch.length === 0, '  … otvorenie sa nepočíta');
    const f = await get(`/b/${TOKEN}/${A1}`, d);
    ok(f.status === 404 && d.calls.sign.length === 0, `  … ani dokument sa z neho nestiahne`);
  }
  {
    const d = makeDeps(null);
    const r = await get('/b/' + TOKEN, d);
    ok(invalidBodies.every((x) => x === r.body), 'neexistujúci, zrušený aj prepadnutý vyzerajú úplne rovnako');
  }
  {
    const d = makeDeps(bundleRow({ token: TOKEN.toLowerCase() }));
    d.db.bundle = async () => bundleRow({ token: TOKEN.toLowerCase() }); // DB by vrátila niečo „podobné"
    const r = await get('/b/' + TOKEN, d);
    ok(r.status === 404, 'token sa porovnáva presne (veľké/malé písmená)');
  }

  // ── Platný balík ──
  {
    const d = makeDeps(bundleRow());
    const r = await get('/b/' + TOKEN, d);
    ok(r.status === 200 && /text\/html/.test(r.headers['Content-Type']), 'platný balík → stránka');
    ok(r.body.includes('Papiere na nástup — Wohnpark Feuerbach &lt;script&gt;alert(1)&lt;/script&gt;'), '  … nadpis z DB je escapovaný');
    ok(!/<script/i.test(r.body), '  … žiadny <script> na stránke');
    ok(!/<img/i.test(r.body) && r.body.includes('Infolist &lt;img src=x onerror=alert(2)&gt;'), '  … názov dokumentu escapovaný');
    ok(r.body.includes('Prvý riadok<br>Druhý &lt;b&gt;riadok&lt;/b&gt; &amp; &quot;úvodzovky&quot;'), '  … správa escapovaná, riadky ako <br>');
    ok(/Dobrý deň, Ján,/.test(r.body) && !/Novák/.test(r.body), '  … oslovenie len krstným menom');
    ok(r.body.includes(`href="/b/${TOKEN}/${A1}"`) && r.body.includes(`href="/b/${TOKEN}/${A2}"`), '  … oba dokumenty v zozname s odkazom');
    ok((r.body.match(/Stiahnuť PDF/g) || []).length === 2, '  … pri každom „Stiahnuť PDF"');
    ok(/Odkaz platí do 25\. 11\. 2026/.test(r.body), '  … „Odkaz platí do 25. 11. 2026"');
    ok(/href="tel:\+421900123456"/.test(r.body) && /href="mailto:nabor@punds\.sk"/.test(r.body), '  … telefón a e-mail v pätičke');
    ok(d.calls.touch.length === 1 && d.calls.touch[0] === 'b-1', '  … otvorenie sa zapíše (touch)');
    ok(!/storage_path|w-1\/infolist/.test(r.body), '  … cesta v úložisku sa neukáže');
    ok(!EMOJI.test(r.body), '  … žiadne emoji ani obrázkové znaky');
    ok(/<svg/.test(r.body), '  … ikony ako SVG');
    ok(!/https?:\/\/(?!www\.w3\.org)/.test(r.body.replace(/xmlns="[^"]*"/g, '')), '  … nič z cudzích serverov (písma, CDN)');
  }
  {
    // Náhľad odkazu vo WhatsAppe sa nepočíta a nič neukáže.
    const d = makeDeps(bundleRow());
    const r = await get('/b/' + TOKEN, d, 'WhatsApp/2.23.20.0 A');
    ok(r.status === 200 && d.calls.touch.length === 0 && !/Feuerbach/.test(r.body), 'náhľad vo WhatsAppe sa nepočíta ako otvorenie a nič neprezradí');
  }
  {
    // Adresa funkcie (prepis z netlify.toml) aj lomka na konci.
    const d = makeDeps(bundleRow());
    const r = await get(`/.netlify/functions/punds-bundle/${TOKEN}/`, d);
    ok(r.status === 200 && /Feuerbach/.test(r.body), 'funguje aj /.netlify/functions/punds-bundle/<token>');
    ok(fn.pickPath({ path: '/.netlify/functions/punds-bundle', rawUrl: `https://x.netlify.app/b/${TOKEN}` }) === `/b/${TOKEN}`, 'cesta sa nájde aj z rawUrl');
    ok(fn.pickPath({ path: `/b/${TOKEN}`, rawUrl: `https://x.netlify.app/.netlify/functions/punds-bundle/${TOKEN}` }) === `/b/${TOKEN}`, 'cesta z event.path má prednosť');
  }

  // ── Stiahnutie ──
  {
    const d = makeDeps(bundleRow());
    const r = await get(`/b/${TOKEN}/${A1}`, d);
    ok(r.status === 302 && r.headers.Location === 'https://store.example/sign/w-1/infolist.pdf?download=infolist.pdf&token=x', 'dokument z balíka → 302 na podpísaný odkaz');
    ok(d.calls.sign.length === 1 && d.calls.sign[0][0] === 'w-1/infolist.pdf' && d.calls.sign[0][1] === 'infolist.pdf', '  … podpisuje sa správna cesta a názov súboru');
    ok(d.calls.touch.length === 0, '  … stiahnutie sa nepočíta');
    ok(r.headers['Cache-Control'] === 'no-store' && r.headers['Referrer-Policy'] === 'no-referrer', '  … no-store, no-referrer');
  }
  {
    const d = makeDeps(bundleRow());
    const r = await get(`/b/${TOKEN}/${A3}`, d);
    ok(r.status === 404 && d.calls.sign.length === 0 && d.calls.archive.length === 0, 'dokument, ktorý nie je v balíku → 404, nič sa nepodpíše');
    const r2 = await get(`/b/${TOKEN}/..%2F..%2Fetc`, d);
    ok(r2.status === 404 && d.calls.sign.length === 0, 'nezmyselné id → 404');
  }
  {
    const d = makeDeps(bundleRow());
    d.signedUrl = async () => { throw new Error('storage down'); };
    const r = await get(`/b/${TOKEN}/${A2}`, d);
    ok(r.status === 502 && /nedá stiahnuť/.test(r.body), 'chyba úložiska → priateľská stránka');
  }
  {
    const d = makeDeps(bundleRow());
    const r = await fn.handle({ method: 'POST', path: '/b/' + TOKEN }, d);
    ok(r.status === 405 && dbCalls(d.calls) === 0, 'POST → 405 bez dotazu do DB');
  }

  console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('  ✗ ' + e.stack); console.log('\n0 prešlo, 1 zlyhalo'); process.exit(1); });
