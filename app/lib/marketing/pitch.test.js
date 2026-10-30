// ============================================================================
// DANUBRA — o čom firme písať: remeslo, región, oslovenie, texty z webu
// Spustenie:  node app/lib/marketing/pitch.test.js
// ============================================================================
const P = require('./pitch.js');

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}

console.log('Remeslo firmy');
{
  const key = (lead, search) => (P.detect(lead, search)[0] || {}).trade && P.detect(lead, search)[0].trade.key;
  ok(key({ trade: 'Trockenbau' }) === 'trockenbau', 'Trockenbau z remesla');
  ok(key({ categories: ['Fliesenleger', 'Bauunternehmen'] }) === 'fliesen', 'Fliesen z kategórií Google Máp');
  ok(key({ name: 'Huber Malerbetrieb GmbH' }) === 'maler', 'Maler z mena firmy');
  ok(key({ profile: { summary: 'Stahlbetonbau und Schalungsarbeiten im Hochbau' } }) === 'schalung', 'Schalung z profilu');
  ok(key({ trade: 'Bewehrungsarbeiten / Eisenflechter' }) === 'bewehrung', 'Bewehrung');
  ok(key({ trade: 'Elektroinstallation' }) === 'elektro', 'Elektro');
  ok(key({ name: 'Bau GmbH' }, { seeds: [{ trade: 'Trockenbau', keywords: ['Akustikbau'] }] }) === 'trockenbau', 'keď firma nič nehovorí, rozhodne hľadanie (zadané weby)');
  ok(key({ trade: 'Fliesen' }, { seeds: [{ trade: 'Trockenbau', keywords: ['Trockenbau'] }] }) === 'fliesen', 'firma má prednosť pred hľadaním');
  ok(P.detect({ name: 'Müller GmbH' }).length === 0 && P.pitch({ lead: { name: 'Müller GmbH' } }).trade.key === 'bau', 'neznáme remeslo → všeobecný text, nič nevymyslené');
  ok(P.detect({ trade: 'Trockenbau' }, null, { offered: ['maler'] }).length === 0, 'Nastavenia môžu obmedziť ponúkané remeslá');
}

console.log('\nRegión');
ok(P.region({ region: 'Bayern', city: 'Ulm' }).phrase === 'in Bayern', 'spolková krajina z firmy');
ok(P.region({ city: 'Augsburg' }).phrase === 'in Augsburg und Umgebung', 'inak mesto');
ok(P.region({}, { params: { region: 'Bavorsko' } }).name === 'Bayern', 'slovenský názov z hľadania sa preloží');
ok(P.region({}, { params: { region: 'okolie Žiliny' } }).name === '', 'slovenský text sa do nemeckého e-mailu nedostane');
ok(P.region({}).phrase === '', 'bez regiónu prázdne');

console.log('\nOslovenie');
const eq = (a, b, m) => ok(a === b, `${m}: ${b}`, `dostal som ${a}`);
eq(P.salutation('Herr Hans Müller'), 'Sehr geehrter Herr Müller,', 'Herr');
eq(P.salutation('Frau Dipl.-Ing. Anna Schmidt'), 'Sehr geehrte Frau Schmidt,', 'Frau a titul');
eq(P.salutation('Dr. Peter von Berg'), 'Sehr geehrter Herr Dr. von Berg,', 'Dr. a „von" (pohlavie z krstného mena)');
eq(P.salutation('Sabine Huber'), 'Sehr geehrte Frau Huber,', 'ženské krstné meno');
eq(P.salutation('Alex Kowalski'), 'Guten Tag Alex Kowalski,', 'neznáme pohlavie → neutrálne s menom');
eq(P.salutation('Hans Müller, Petra Müller'), 'Sehr geehrter Herr Müller,', 'dvaja konatelia → prvý');
eq(P.salutation(''), 'Sehr geehrte Damen und Herren,', 'bez mena');
eq(P.salutation('Müller Bau GmbH'), 'Sehr geehrte Damen und Herren,', 'firma namiesto osoby');
eq(P.salutation('Herr Hans Müller', 'en'), 'Dear Mr Müller,', 'po anglicky');

console.log('\nPosolstvo');
{
  const p = P.pitch({ lead: { name: 'Müller Trockenbau GmbH', region: 'Bayern', trade: 'Trockenbau', categories: ['Malerbetrieb'] } });
  ok(p.headline === 'Trockenbauer für Ihre Baustellen in Bayern', 'nadpis z remesla a regiónu', p.headline);
  ok(p.title === 'punds – Ihr Partner für Trockenbau in Bayern', 'titul prezentácie', p.title);
  ok(p.points.length === 3 && /Ständerwerk/.test(p.points[0].text) && /Maler/.test(p.points[0].text), 'tri body: remeslo (aj ďalšie)', p.points[0].text);
  ok(/§ 48b EStG/.test(p.points[1].text) && /Bayern/.test(p.points[2].text), 'doklady a jeden kontakt s regiónom');
  ok(!/\d+\s?(€|EUR|Euro)/.test(JSON.stringify(p)) && !/Referenz/.test(JSON.stringify(p.points)), 'žiadne ceny ani referencie, ktoré nemáme');
  ok(p.fileName === 'punds-trockenbau-bayern.pdf', 'meno súboru');
  const s = P.pitch({ lead: { trade: 'Trockenbau' }, marketing: { presentation: { prices: 'ab 38 EUR/Std.', cta_url: 'javascript:x', trades: { trockenbau: { tasks: ['Nur Akustikdecken'] } } } } });
  ok(s.texts.prices === 'ab 38 EUR/Std.' && s.cta.url === 'https://punds.eu' && s.trade.tasks[0] === 'Nur Akustikdecken', 'Nastavenia prepíšu ceny a úlohy, zlý odkaz nie');
}

console.log('\nTexty sedia s webom punds.eu');
{
  const TRADE = require('../../../web/eu/pages/trade.js');
  const T = require('../../../web/eu/pages/trade.js').TRADES || null;
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', '..', 'web', 'eu', 'pages', 'trade.js'), 'utf8');
  const zle = [];
  for (const t of P.TRADES.filter(x => x.web)) {
    for (const task of t.tasks) if (!src.includes(`'${task}'`)) zle.push(`${t.key}: ${task}`);
  }
  ok(typeof TRADE === 'function' || T || src.length > 0, 'web sa dá prečítať');
  ok(zle.length === 0, 'úlohy remesiel sú doslova z web/eu/pages/trade.js', zle.join('; '));
  const about = require('fs').readFileSync(require('path').join(__dirname, '..', '..', '..', 'web', 'eu', 'pages', 'about.js'), 'utf8');
  ok(about.includes(P.TEXT.about) && P.TEXT.values.every(([h, x]) => about.includes(`'${h}', '${x}'`)), 'o nás a zásady sú z web/eu/pages/about.js');
  const fs = require('fs'), path = require('path');
  const prof = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'web', 'shared', 'professions.js'), 'utf8');
  ok(P.TRADES.filter(t => t.slug).every(t => prof.includes(`de: '${t.slug}'`)), 'odkazy na remeslá existujú na punds.eu');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
