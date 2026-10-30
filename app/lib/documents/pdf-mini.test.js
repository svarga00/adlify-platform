// ============================================================================
// DANUBRA — malý zapisovač PDF a prezentácia punds
// Spustenie:  node app/lib/documents/pdf-mini.test.js
// ============================================================================
// PDF sa overí bez cudzej knižnice: hlavička, tabuľka xref (odkazy sedia na
// bajt), rozbalený obsah strán (zlib) a text v ňom. Keď je na stroji
// poppler (pdftotext), prečíta sa aj ním — ako by ho otvoril človek.
// ============================================================================
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Doc, measure, wrap, encode } = require('./pdf-mini.js');
const Pitch = require('../marketing/pitch.js');
const Pres = require('../marketing/presentation.js');

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}

/** Obsah strán (rozbalený) a kontrola xref. */
function inspect(buf) {
  const s = buf.toString('latin1');
  const xrefAt = Number((s.match(/startxref\n(\d+)\n%%EOF\n$/) || [])[1]);
  const xref = s.slice(xrefAt);
  const offs = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)].map(m => Number(m[1]));
  const okXref = offs.length > 0 && offs.every((o, i) => s.startsWith(`${i + 1} 0 obj`, o));
  const streams = [];
  for (const m of s.matchAll(/<< \/Length (\d+) \/Filter \/FlateDecode >>\nstream\n/g)) {
    const start = m.index + m[0].length;
    streams.push(zlib.inflateSync(buf.subarray(start, start + Number(m[1]))).toString('latin1'));
  }
  return { s, okXref, xrefAt, streams, pages: (s.match(/\/Type \/Page /g) || []).length };
}
/** Text z hex reťazcov v obsahu (naše kódovanie späť na znaky). */
const EXTRA = require('./pdf-mini.js').EXTRA;
function textOf(streams) {
  return streams.join('\n').match(/<([0-9a-f]+)> Tj/g).map(h => Buffer.from(h.slice(1, -4), 'hex'))
    .map(b => [...b].map(c => (c >= 128 && c <= 159 ? EXTRA[c - 128][0] : String.fromCharCode(c))).join('')).join('\n');
}

console.log('Zapisovač PDF');
{
  ok(measure('Hallo', 10) > 20 && measure('Hallo', 10, 'B') > measure('Hallo', 10), 'šírka textu z metrík Helvetica (tučné je širšie)');
  ok(Math.abs(measure('W', 1000) - 944) < 0.01 && Math.abs(measure('i', 1000) - 222) < 0.01, 'presné šírky znakov (W = 944, i = 222)');
  ok(wrap('eins zwei drei vier fünf sechs', 10, 'R', 60).length > 1 && wrap('a\nb', 10, 'R', 500).length === 2, 'zalamovanie riadkov aj \\n');
  ok(JSON.stringify(encode('Grüße čšžľť „x" €')) === JSON.stringify([...encode('Grüße '), 129, 145, 149, 135, 147, 32, 154, 120, 34, 32, 69, 85, 82]),
    'nemecké aj slovenské znaky, € ako EUR');
  ok(encode('\u{1F600}')[0] === 63, 'neznámy znak = otáznik, nie rozbité PDF');
  const d = new Doc({ info: { title: 'Prüfung č' } });
  const p = d.page();
  p.rect(0, 0, 100, 50, { fill: '#F07F1A', r: 8 });
  p.text('Kováčová (Test) \\ ok', 10, 30, { size: 12 });
  p.mark(10, 60, 40).link(0, 0, 50, 20, 'https://punds.eu');
  p.circle(50, 100, 10, { fill: '#000', alpha: 0.2 });
  p.link(0, 0, 10, 10, 'javascript:alert(1)');
  const b = d.toBuffer();
  const x = inspect(b);
  ok(b.subarray(0, 8).toString() === '%PDF-1.6' && x.okXref, 'hlavička a xref sedia na bajt');
  ok(x.streams.length === 1 && /re\b|c\n/.test(x.streams[0]) && /\/GA1 gs/.test(x.streams[0]), 'obsah je skomprimovaný, tvary aj priehľadnosť');
  ok(textOf(x.streams) === 'Kováčová (Test) \\ ok', 'text je v PDF ako text (dá sa vyhľadať)', textOf(x.streams));
  ok(/\/URI \(https:\/\/punds\.eu\)/.test(x.s) && !/javascript/.test(x.s), 'odkaz len http(s) — javascript: sa nezapíše');
  ok(/\/Title <feff/.test(x.s) && /\/Lang \(de-DE\)/.test(x.s), 'názov (aj s diakritikou) a jazyk dokumentu');
}

console.log('\nPrezentácia punds');
const SUP = { name: 'Partner und Service s. r. o.', address: 'Podzámska 9468/4A, 940 71 Nové Zámky', vat_id: 'SK2122816839', company_id: '57553921' };
const lead = { name: 'Müller Trockenbau GmbH', city: 'Augsburg', region: 'Bayern', trade: 'Trockenbau', contact_person: 'Herr Hans Müller' };
const pitch = Pitch.pitch({ lead, search: { seeds: [{ trade: 'Malerarbeiten' }] } });
const r = Pres.build({ pitch, lead, supplier: SUP, contact: { name: 'Štefan Varga', phone: '+421 910 523 958', email: 'stefan@punds.eu' }, date: new Date('2026-10-30') });
const x = inspect(r.buffer);
const txt = textOf(x.streams);
ok(r.pages === 4 && x.pages === 4 && x.okXref, '4 strany, platné PDF');
ok(r.size < 300 * 1024 && r.size < 40 * 1024, `malé — ${Math.round(r.size / 1024)} kB (limit 300 kB)`);
ok(/Ihr Partner für\nTrockenbau\nin Bayern/.test(txt), 'titul: remeslo a región');
ok(/Müller Trockenbau GmbH · Oktober 2026/.test(txt), 'pre koho a kedy');
ok(/Ständerwerk/.test(txt) && /Maler/.test(txt), 'typické práce remesla a ďalšie remeslo z hľadania');
ok(/Werkvertrag, Abrechnung nach Stunden/.test(txt) && /§ 48b/.test(txt) && /Štefan Varga/.test(txt) && /USt-IdNr\.: SK2122816839/.test(txt),
  'podmienky, kontakt a Impressum');
ok(/Konditionen nennen wir Ihnen im Angebot/.test(txt) && !/REFERENZEN/.test(txt) && !/\d+[,.]?\d*\s?(€|EUR)/.test(txt), 'bez cien a referencií, keď nie sú v Nastaveniach');
ok(r.fileName === 'punds-trockenbau-bayern.pdf' && /Trockenbau in Bayern/.test(r.title), 'meno súboru a názov dokumentu');
{
  const p2 = Pitch.pitch({ lead: { name: 'Elektro Weber', trade: 'Elektroinstallation', city: 'Köln' }, marketing: { presentation: { prices: 'Stundensatz nach Absprache', references: 'Bürogebäude Köln (2026)' } } });
  const t2 = textOf(inspect(Pres.build({ pitch: p2, lead: { name: 'Elektro Weber' }, supplier: SUP }).buffer).streams);
  ok(/Elektroinstallation/.test(t2) && /in Köln/.test(t2) && /Stundensatz nach Absprache/.test(t2) && /REFERENZEN/.test(t2) && /Bürogebäude Köln/.test(t2),
    'iné remeslo a mesto; ceny a referencie z Nastavení sa ukážu');
  ok(/Elektrofachkraft/.test(t2), 'pri elektro len práca pod dohľadom Vašej elektrotechnickej osoby (žiadny sľub navyše)');
}
// Ako to otvorí človek (poppler), keď je na stroji.
try {
  const f = path.join(os.tmpdir(), `pdfmini-${process.pid}.pdf`);
  fs.writeFileSync(f, r.buffer);
  const t = execFileSync('pdftotext', [f, '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  fs.unlinkSync(f);
  ok(/Trockenbau/.test(t) && /Nové Zámky/.test(t) && /Štefan Varga/.test(t), 'pdftotext prečíta text aj s diakritikou');
} catch (e) { console.log('  (pdftotext nie je — preskočené)'); }

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
