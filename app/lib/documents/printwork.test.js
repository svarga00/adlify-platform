// Testy: tlačoviny punds (vizitka, obálka DL, hlavičkový list).   node app/lib/documents/printwork.test.js
global.window = global.window || {};
const PW = require('./printwork.js');
const P = require('./templates.js');
let passed = 0, failed = 0;
const ok = (c, n, d) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };

const c = PW.card({ name: 'Štefan <Varga>', role: 'Koordinátor', phone: '+421 910 523 858', email: 's@punds.sk', address: 'Nové Zámky' });
ok(c.w === 91 && c.h === 61 && c.faces.length === 2, 'vizitka 85 × 55 mm + spadávka 3 mm, líce a rub');
ok(/Štefan &lt;Varga&gt;/.test(c.faces[1]) && !/<Varga>/.test(c.faces[1]), 'údaje sú ošetrené');
ok(/punds\.sk/.test(c.faces[0]) && /#0E1626/.test(c.faces[0]) && /stroke-opacity="0.07"/.test(c.faces[0]), 'tmavé líce: web, farba, veľký priesvitný znak');
ok(/>T</.test(c.faces[1]) && /Nové Zámky/.test(c.faces[1]), 'rub s T/E/W/A');
const o = PW.card({ name: 'X', variant: 'orange', lang: 'de', email: 'x@punds.eu' });
ok(/background:#F07F1A/.test(o.faces[1]) && /punds\.eu/.test(o.faces[1]), 'oranžový variant, nemecký web');
const e = PW.envelope({ to: 'Musterbau GmbH\nStraße 1\n28195 Bremen' });
ok(e.w === 220 && e.h === 110 && /<strong>Musterbau GmbH<\/strong>/.test(e.faces[0]) && /left:110mm;top:50mm/.test(e.faces[0]), 'obálka DL s adresátom v okienku');
ok(PW.fileName('Vizitka', 'Ján/Novák') === 'Vizitka – Ján Novák.pdf', 'názov súboru bez zakázaných znakov');
const l = P.letter({ supplier: { name: 'Partner und Service s. r. o.', address: 'Podzámska 9468/4A, 940 71 Nové Zámky', company_id: '57553921', email: 'info@punds.sk' },
  to: 'Firma GmbH\nMusterstraße 12', subject: 'Ponuka', body: 'Dobrý deň,\n\nposielame ponuku.', signer: 'Štefan Varga', lang: 'sk' });
ok(/Vec: Ponuka/.test(l) && /<strong>Firma GmbH<\/strong>/.test(l) && /NOVÉ ZÁMKY/.test(l) && /S pozdravom/.test(l) && /class="runfoot"/.test(l), 'hlavičkový list: adresát, miesto, vec, pozdrav, päta');
ok(/Betreff: Angebot/.test(P.letter({ supplier: {}, subject: 'Angebot', body: 'x', lang: 'de' })), 'nemecký list');

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
