// ============================================================================
// Testy SMS vrstvy (§9)
// Spustenie:  node danubra/lib/sms/sms.test.js
// ============================================================================
global.window = global;
const S = require('./provider');

let passed = 0, failed = 0;
function eq(a, e, msg) {
  const A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    expected: ${E}\n    actual:   ${A}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

console.log('SMS — telefónne čísla');
eq(S.toE164('0905 123 456'), '+421905123456', 'slovenské číslo s nulou a medzerami');
eq(S.toE164('+421905123456'), '+421905123456', 'už v E.164 sa nemení');
eq(S.toE164('00421905123456'), '+421905123456', '00 sa prevedie na +');
eq(S.toE164('905123456'), '+421905123456', 'bez nuly sa doplní predvoľba');
eq(S.toE164('421905123456'), '+421905123456', 'číslo už s predvoľbou sa nezdvojí');
eq(S.toE164('0176 12345678', 'DE'), '+4917612345678', 'nemecké číslo s predvolenou krajinou DE');
eq(S.toE164('+49 176 1234 5678'), '+4917612345678', 'nemecké v medzinárodnom formáte');
eq(S.toE164('(0905) 123-456'), '+421905123456', 'zátvorky a pomlčky sa odstránia');
eq(S.toE164(''), null, 'prázdny vstup je neplatný');
eq(S.toE164('123'), null, 'príliš krátke číslo je neplatné');
eq(S.toE164('abc'), null, 'text bez číslic je neplatný');

console.log('\nSMS — kódovanie a segmenty');
{
  const r = S.countSegments('Ahoj, toto je test.');
  eq(r.encoding, 'gsm7', 'text bez diakritiky je GSM-7');
  eq(r.segments, 1, 'krátka správa je jeden segment');
}
{
  const r = S.countSegments('Ahoj, toto je test s diakritikou — ľúbezné.');
  eq(r.encoding, 'unicode', 'diakritika vynúti Unicode');
  eq(r.segments, 1, 'krátka správa aj v Unicode je jeden segment');
}
{
  const r = S.countSegments('a'.repeat(160));
  eq(r.segments, 1, '160 znakov GSM-7 je presne jeden segment');
  eq(r.remaining, 0, 'nezostáva miesto');
}
{
  const r = S.countSegments('a'.repeat(161));
  eq(r.segments, 2, '161 znakov už potrebuje dva segmenty');
  eq(r.perSegment, 153, 'pri viacerých častiach je kapacita 153');
}
{
  const r = S.countSegments('á'.repeat(70));
  eq(r.segments, 1, '70 Unicode znakov je jeden segment');
  eq(r.segments, S.countSegments('á'.repeat(70)).segments, 'stabilný výsledok');
}
{
  const r = S.countSegments('á'.repeat(71));
  eq(r.segments, 2, '71 Unicode znakov potrebuje dva segmenty');
}
{
  // znaky z rozšírenej GSM tabuľky zaberajú dve pozície
  eq(S.gsm7Length('€'), 2, 'euro je v GSM-7 dvojznakové');
  eq(S.gsm7Length('[]'), 4, 'hranaté zátvorky sú dvojznakové');
  ok(S.isGsm7('€[]'), 'rozšírené znaky sú stále GSM-7');
}
ok(!S.isGsm7('ľ'), 'slovenské ľ nie je v GSM-7');
ok(S.isGsm7('äöñüà'), 'znaky z GSM tabuľky prejdú');

console.log('\nSMS — odstránenie diakritiky');
eq(S.stripDiacritics('Ľubomír Ščasný'), 'Lubomir Scasny', 'slovenská diakritika sa odstráni');
eq(S.stripDiacritics('Žofia Ťapák'), 'Zofia Tapak', 'ž a ť sa prevedú');
eq(S.stripDiacritics('München Straße'), 'Munchen Straße', 'nemecké prehlásky sa prevedú, ß ostáva');
ok(S.isGsm7(S.stripDiacritics('Ľúbezné príďte skôr')), 'po odstránení diakritiky je text GSM-7');

console.log('\nSMS — šablóny');
eq(S.render('Dobrý deň {{meno}}, adresa: {{adresa}}', { meno: 'Ján', adresa: 'Hauptstr. 5' }),
   'Dobrý deň Ján, adresa: Hauptstr. 5', 'premenné sa doplnia');
eq(S.render('Kód {{kod}}', {}), 'Kód ', 'chýbajúca premenná sa nahradí prázdnym reťazcom');

console.log('\nSMS — príprava správy');
{
  const r = S.prepare({ to: '0905123456', body: 'Kod dveri 1234. Nastup 1.9.' });
  ok(r.ok, 'platná správa prejde');
  eq(r.to, '+421905123456', 'číslo je normalizované');
  eq(r.encoding, 'gsm7', 'text bez diakritiky ostáva GSM-7');
  eq(r.warnings.length, 0, 'žiadne varovania');
}
{
  const r = S.prepare({ to: '0905123456', body: 'Kód dverí 1234, nástup skôr.' });
  ok(r.ok, 'správa s diakritikou sa dá odoslať');
  eq(r.encoding, 'unicode', 'diakritika vynúti Unicode');
  ok(r.warnings.some(w => w.severity === 'warning'), 'rozhranie dostane upozornenie na diakritiku');
  ok(r.asciiBody.includes('Kod dveri'), 'ponúkne sa verzia bez diakritiky');
}
{
  const r = S.prepare({ to: '0905123456', body: 'Kód dverí 1234.', stripDia: true });
  eq(r.encoding, 'gsm7', 'po odstránení diakritiky je správa GSM-7');
  eq(r.body, 'Kod dveri 1234.', 'telo je bez diakritiky');
}
{
  const r = S.prepare({ to: 'xyz', body: 'Test' });
  ok(!r.ok, 'neplatné číslo správu zablokuje');
  ok(r.warnings.some(w => w.severity === 'blocker'), 'je to blokátor');
}
{
  const r = S.prepare({ to: '0905123456', body: '' });
  ok(!r.ok, 'prázdna správa sa neodošle');
}
{
  const r = S.prepare({ to: '0905123456', body: 'a'.repeat(500) });
  ok(r.warnings.some(w => w.text.includes('segmentov')), 'dlhá správa upozorní na počet segmentov');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
