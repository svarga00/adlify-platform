// ============================================================================
// DANUBRA — logo značky všade rovnaké: znak D + písmená ANUBRA
//   node app/tests/danubra-logo.test.js
// ============================================================================
// Logo je „D-znak + ANUBRA": oranžová pilulka a modrý oblúk sú písmeno D.
// Za znak sa preto nikdy nepíše slovo DANUBRA (čítalo by sa DDANUBRA).
// Kontroluje sa:
//   * starý dočasný znak (vlna, cesta „M6 34 V20") už nie je nikde v appke,
//     na webe ani v serverových funkciách,
//   * spoločný zdroj loga (lib/brand-logo.js) má nový znak a farby značky,
//   * prihlásenie, bočný panel, dokumenty, tlačoviny, PDF prezentácia
//     a e-maily ukazujú celé logo, nie znak a slovo DANUBRA,
//   * ikony appky (PNG) majú presnú veľkosť.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const REPO = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
const ok = (c, msg, extra) => {
  if (c) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
};
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const PILL = 'M56.5 57V266.5', CURVE = 'M117 59H189.5A102.5 102.5 0 0 1 189.5 264H117';
// Znak (koniec SVG) a hneď za ním text DANUBRA — len tagy medzi nimi.
const DD = /<\/svg>\s*(<[^>]+>\s*)*DANUBRA/;

console.log('Starý znak nikde');
{
  // Testy smú starý znak spomenúť (overujú, že nie je nikde inde).
  const SKIP = new Set(['node_modules', 'vendor', '.git', 'database', 'tests']);
  const files = [];
  (function walk(dir) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(f.name)) continue;
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.(js|html|css|svg|webmanifest|json|toml)$/.test(f.name) && !/\.test\.js$/.test(f.name)) files.push(p);
    }
  })(REPO);
  const old = files.filter((p) => /M6 34 V20|M24 28 A9 9 0 0 0 42 28/.test(fs.readFileSync(p, 'utf8'))).map((p) => path.relative(REPO, p));
  ok(files.length > 100 && old.length === 0, `starý znak (vlna) nie je v žiadnom z ${files.length} súborov`, old.join(', '));
  const word = files.filter((p) => /class="(logo-word|brand-word)">DANUBRA</.test(fs.readFileSync(p, 'utf8'))).map((p) => path.relative(REPO, p));
  ok(word.length === 0, 'nikde sa za znak nepíše slovo DANUBRA', word.join(', '));
}

console.log('\nSpoločný zdroj loga');
const L = require('../lib/brand-logo.js');
{
  ok(L.COLORS.orange === '#F07E22' && L.COLORS.blue === '#1E4FD8' && L.COLORS.navy === '#0A1B3D', 'farby značky: oranžová, modrá, tmavomodrá');
  const full = L.logo({ h: 30 });
  ok(full.includes(PILL) && full.includes(CURVE) && full.includes('stroke="#F07E22"') && full.includes('stroke="#1E4FD8"')
    && full.includes('fill="#0A1B3D" fill-rule="evenodd"') && /viewBox="32 32 2044 264" width="232.27" height="30"/.test(full), 'celé logo: znak D, písmená ANUBRA, pomer strán', full.slice(0, 200));
  ok(/fill="#fff"/.test(L.logo({ ink: '#fff' })) && !DD.test(full) && !/>DANUBRA</.test(full), 'svetlá verzia a žiadne slovo DANUBRA za znakom');
  const m = L.mark({ h: '5mm' });
  ok(m.includes(PILL) && m.includes(CURVE) && !m.includes(L.LETTERS.slice(0, 40)) && /width="5.54mm" height="5mm"/.test(m), 'samotný znak v mm (tlačoviny)');
  const dl = read('web/public/img/logo/danubra-logo.svg');
  ok(dl.includes(L.LETTERS.slice(0, 200)), 'web a appka kreslia tie isté písmená ANUBRA');
}

console.log('\nAppka');
{
  const html = read('app/index.html');
  ok(/class="login-brand">\s*<img class="logo-full" src="\.\/icons\/danubra-logo\.svg"[^>]*alt="DANUBRA">\s*<\/div>/.test(html), 'prihlásenie: celé logo s tmavými písmenami');
  ok(/class="sidebar-brand">\s*<img class="logo-full" src="\.\/icons\/danubra-logo\.svg"[^>]*alt="DANUBRA">\s*<\/div>/.test(html), 'bočný panel (svetlý): logo s tmavomodrými písmenami');
  ok(html.indexOf('lib/brand-logo.js') > 0 && html.indexOf('lib/brand-logo.js') < html.indexOf('lib/documents/templates.js'), 'brand-logo.js sa načíta pred dokumentmi');
  ok(read('app/icons/danubra-logo.svg').includes('fill="#0A1B3D"') && read('app/icons/danubra-logo-white.svg').includes('fill="#FFFFFF"'), 'súbory loga v appke');
  const icon = read('app/icons/icon.svg');
  ok(icon.includes(PILL) && icon.includes(CURVE) && !/ANUBRA|evenodd/.test(icon), 'ikona appky je znak D');
  const man = JSON.parse(read('app/manifest.webmanifest'));
  ok(man.theme_color === '#0A1B3D' && man.icons.some((i) => i.src === 'icons/icon-512.png'), 'manifest: farba značky a ikony');
  // Rozmer PNG z hlavičky IHDR.
  const size = (rel) => { const b = fs.readFileSync(path.join(REPO, rel)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  ok(size('app/icons/icon-192.png').join('x') === '192x192' && size('app/icons/icon-512.png').join('x') === '512x512', 'ikony 192 a 512 px');
  ok(size('web/public/img/email/danubra-logo-white.png').join('x') === '720x93' && size('web/public/img/email/danubra-mark.png').join('x') === '348x314', 'PNG pre e-maily (2x)');
  const odk = read('app/odkazy.html');
  ok(/<img src="\.\/icons\/danubra-logo\.svg"[^>]*alt="DANUBRA">/.test(odk) && !/<b>DANUBRA<\/b>/.test(odk), 'stránka odkazov: celé logo');
}

console.log('\nDokumenty, tlačoviny, PDF');
{
  global.window = global.window || {};
  const P = require('../lib/documents/templates.js');
  const NASA = { name: 'Partner und Service s. r. o.', email: 'info@danubra.eu' };
  const docs = {
    faktúra: P.invoice({ invoice: { invoice_number: '2026001', total: 100 }, items: [], client: { name: 'GU Ulm GmbH', country: 'DE' }, supplier: NASA }),
    list: P.letter({ supplier: NASA, subject: 'Angebot', body: 'x', lang: 'de' }),
    zmluva: P.ramcovaZmluva({ zmluva: require('../lib/documents/subcontract.js').build({ worker: { full_name: 'Ján Novák' }, supplier: NASA }) }),
  };
  for (const [k, d] of Object.entries(docs)) {
    ok(/<svg[^>]*class="brand-logo"/.test(d) && d.includes(PILL) && !DD.test(d.replace(/<style>[\s\S]*?<\/style>/g, '')), `${k}: celé logo, za znakom nie je slovo DANUBRA`);
  }
  const PW = require('../lib/documents/printwork.js');
  const faces = [...PW.card({ name: 'X' }).faces, ...PW.card({ name: 'X', variant: 'orange' }).faces, ...PW.envelope({}).faces];
  ok(faces.every((f) => !DD.test(f) && !f.includes('M6 34')) && faces.filter((f) => f.includes('fill-rule="evenodd"')).length === 3, 'vizitky a obálka: celé logo, nie znak + slovo');
  const Pres = require('../lib/marketing/presentation.js');
  const pdf = Pres.build({ lead: { name: 'Muster GmbH', trade: 'Trockenbau' } });
  // Prvá strana: písmená ANUBRA ako krivka s vyplnením even-odd (f*), nie text „DANUBRA" vedľa znaku.
  const raw = pdf.buffer.toString('latin1');
  const m = raw.match(/stream\n([\s\S]*?)\nendstream/);
  const ops = m ? zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1') : '';
  const hex = Buffer.from('DANUBRA', 'latin1').toString('hex').toUpperCase();
  ok(/\sf\*\s/.test(ops) && ops.includes('1 J') && !ops.toUpperCase().includes(`<${hex}>`), 'PDF prezentácia: logo krivkami, bez slova DANUBRA za znakom');
}

console.log('\nE-maily');
{
  const OE = require('../lib/marketing/outreach-email.js');
  const P2 = require('../lib/marketing/pitch.js');
  const r = OE.build({ subject: 'Test', body: 'Guten Tag', pitch: P2.pitch({ lead: { name: 'X', trade: 'Trockenbau' } }), supplier: {}, assets: 'https://x.test' });
  const src = read('app/lib/marketing/outreach-email.js') + read('web/emails.js');
  ok(/danubra-logo-white\.png" width="170" height="22" alt="DANUBRA"/.test(src) && !/>DANUBRA<\/div><\/td>/.test(src), 'hlavička e-mailov: celé logo (PNG), nie znak a slovo');
  ok(r.html.includes('https://x.test/img/email/danubra-logo-white.png') && !DD.test(r.html) && !r.html.includes('danubra-mark-white.png'), 'oslovovací e-mail má v hlavičke celé logo');
  const WE = require('../../web/emails.js');
  const en = WE.confirmEnquiry({ lang: 'de', assets: 'https://x.test', contact: { name: 'Štefan' } });
  ok(en.html.includes('danubra-logo-white.png') && !/>DANUBRA<\/div>/.test(en.html), 'potvrdenie dopytu (web): celé logo v hlavičke');
  ok(/danubra-mark\.png" width="48" height="43"/.test(read('app/lib/mail/mail.js')), 'podpis v pošte: znak D v správnom pomere strán');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
