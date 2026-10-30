// ============================================================================
// DANUBRA — e-mail oslovenia v dizajne punds
// Spustenie:  node app/lib/marketing/outreach-email.test.js
// ============================================================================
const E = require('./outreach-email.js');
const P = require('./pitch.js');
const O = require('./outreach.js');
const M = require('../mail/mail.js');

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{25A0}-\u{25FF}\u{2190}\u{2191}\u{2193}-\u{21FF}]/u;
const SUP = { name: 'Partner und Service s. r. o.', address: 'Podzámska 9468/4A, 940 71 Nové Zámky', vat_id: 'SK2122816839', company_id: '57553921' };
const UNSUB = 'https://hub.example/.netlify/functions/danubra-unsubscribe?t=0123456789abcdef0123456789abcdef';
const lead = { name: 'Müller <b>Bau</b> GmbH', region: 'Bayern', trade: 'Trockenbau', contact_person: 'Herr Hans Müller' };
const pitch = P.pitch({ lead });
const body = 'Sehr geehrter Herr Müller,\n\nwir sind ein Nachunternehmer aus der Slowakei. <script>alert(1)</script> Mehr: https://punds.eu/de/gewerke/trockenbau\n\nDarf ich Sie kurz anrufen?\n\nMit freundlichen Grüßen';

console.log('Rozloženie');
const r = E.build({ subject: 'Trockenbauer für Müller', body, pitch, supplier: SUP, signature: { text: 'Štefan Varga\n+421 910 523 958' },
  replyTo: 'stefan@punds.eu', unsubscribeUrl: UNSUB, assets: 'https://hub.example/web/public', attachment: { name: 'punds-trockenbau-bayern.pdf', pages: 4 } });
ok(/^<!DOCTYPE html>/.test(r.html) && /role="presentation"/.test(r.html) && /max-width:600px/.test(r.html), 'tabuľkové rozloženie, šírka 600 px');
ok(/<meta name="color-scheme" content="light dark">/.test(r.html) && /prefers-color-scheme:dark/.test(r.html) && /\[data-ogsc\]/.test(r.html), 'tmavý režim (Apple Mail aj Outlook.com)');
ok(/<!--\[if mso\]>/.test(r.html) && /bgcolor="#F07F1A"/.test(r.html), 'Outlook: podmienené štýly a tlačidlo s pozadím na bunke');
ok(/@media \(max-width:620px\)/.test(r.html), 'mobil: menšie okraje a nadpis');
ok(r.html.includes('punds-mark-white.png') && r.html.includes('Trockenbauer für Ihre Baustellen in Bayern'), 'logo a nadpis podľa remesla a regiónu');
ok(r.html.includes('Ständerwerk') && r.html.includes('§ 48b EStG'), 'tri body');
ok(r.html.includes('href="https://punds.eu"') && /Antworten Sie einfach auf diese E-Mail/.test(r.html), 'jedna výzva: odkaz na punds.eu a odpovedať');
ok(r.html.includes('punds-trockenbau-bayern.pdf') && /4 Seiten/.test(r.html), 'príloha je ohlásená');
ok(r.html.indexOf('Mit freundlichen Grüßen') > r.html.indexOf('href="https://punds.eu"'), 'pozdrav ide až za výzvu, nad podpis');
ok(/Štefan Varga<br>\+421 910 523 958/.test(r.html), 'podpis schránky');

console.log('\nBezpečnosť a Impressum');
ok(!r.html.includes('<script>') && r.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'text sa escapuje — skript z textu sa nespustí');
{
  const x = E.build({ body: 'Hallo', pitch: P.pitch({ lead: { name: '"><img src=x onerror=alert(1)>', trade: 'Trockenbau', city: '<i>Ulm</i>' } }), supplier: { ...SUP, name: 'A & B <x>' }, unsubscribeUrl: UNSUB });
  ok(!/<img src=x/.test(x.html) && !/<i>Ulm/.test(x.html) && x.html.includes('A &amp; B &lt;x&gt;'), 'meno firmy, mesto aj Impressum sa escapujú');
}
ok(r.html.includes(`href="${UNSUB}"`) && /Hier abmelden/.test(r.html) && r.text.includes(UNSUB), 'odhlásenie v HTML aj v texte');
ok(/USt-IdNr\.: SK2122816839/.test(r.html) && /Podzámska/.test(r.text), 'Impressum v pätičke');
ok(/Wir schreiben Ihnen, weil Ihr Unternehmen im Bereich Trockenbau tätig ist\./.test(r.html), 'prečo píšeme (B2B, relevancia)');
ok(r.html.includes('href="https://punds.eu/de/gewerke/trockenbau"'), 'odkaz z textu je klikateľný');

console.log('\nTextová podoba');
ok(r.text.startsWith('Trockenbauer für Ihre Baustellen in Bayern') && /Sehr geehrter Herr Müller,/.test(r.text) && /- Vollständige Unterlagen/.test(r.text), 'nadpis, text a body');
ok(/Mehr auf punds\.eu: https:\/\/punds\.eu/.test(r.text) && /Anhang: punds-trockenbau-bayern\.pdf/.test(r.text) && /Mit freundlichen Grüßen\n-- \nŠtefan Varga/.test(r.text), 'výzva, príloha, pozdrav a podpis');
ok(!/<[a-z]/i.test(r.text.replace(/<script>alert\(1\)<\/script>/, '')), 'bez HTML značiek');

console.log('\nBez emoji');
ok(!EMOJI.test(r.html) && !EMOJI.test(r.text), 'ani jeden obrázkový znak v e-maile');
ok(!EMOJI.test(require('fs').readFileSync(require.resolve('./outreach-email.js'), 'utf8')), 'ani v zdrojáku');

console.log('\nPripomenutie');
{
  const f = E.build({ body: 'Guten Tag,\n\nkurze Nachfrage.\n\nMit freundlichen Grüßen', pitch, supplier: SUP, unsubscribeUrl: UNSUB, step: 2 });
  ok(!f.html.includes('Ständerwerk') && !f.html.includes('<h1') && !f.html.includes('href="https://punds.eu"'), 'krátke: bez bodov, nadpisu a tlačidla');
  ok(f.html.includes(UNSUB) && /Impressum|USt-IdNr/.test(f.html), 'odhlásenie a Impressum zostávajú');
}

console.log('\nPodpis zo Správ');
{
  const mb = { email: 'stefan@punds.eu', signature: '', signature_card: { enabled: true, name: 'Štefan Varga', role: 'Projektkoordination', phone: '+421 910', lang: 'sk' } };
  const sig = E.signatureOf(mb, M, '', 'https://hub.example/web/public');
  ok(sig.greeting && /Mit freundlichen Grüßen/.test(sig.html) && !/S pozdravom/.test(sig.html) && /punds\.eu/.test(sig.html), 'vizitka po nemecky (aj keď je nastavená po slovensky)');
  ok(!/Aktuálne pracovné ponuky/.test(sig.html) && !/Fachkräfte anfragen/.test(sig.html), 'bez vlastnej výzvy (výzvu má e-mail)');
  const x = E.build({ body, pitch, supplier: SUP, signature: sig, unsubscribeUrl: UNSUB });
  ok((x.html.match(/Mit freundlichen Grüßen/g) || []).length === 1, 'pozdrav sa nezopakuje');
  ok(/Mit freundlichen Grüßen\n-- \nŠtefan Varga/.test(x.text), 'v texte pozdrav a podpis');
  const sp = E.splitSignature('Text\n\nMit freundlichen Grüßen\n\n-- \nŠtefan');
  ok(sp.text === 'Text\n\nMit freundlichen Grüßen' && sp.signature === 'Štefan', 'text a podpis z okna sa oddelia');
}

console.log('\nSledovanie (compose, framed)');
{
  const c = O.compose({ html: r.html, text: r.text, site: 'https://hub.example', token: '0123456789abcdef0123456789abcdef', secret: 's', cfg: O.DEFAULTS, framed: true });
  ok(/danubra-track\?t=0123456789abcdef0123456789abcdef&amp;k=c&amp;u=https%3A%2F%2Fpunds\.eu/.test(c.html), 'odkaz na punds.eu ide cez sledovanie kliku');
  ok(c.html.includes(`href="${UNSUB}"`), 'odhlásenie sa neprepisuje');
  ok(/k=o"[^>]*><\/body>/.test(c.html.replace(/\s+/g, ' ')) || c.html.indexOf('k=o') < c.html.indexOf('</body>'), 'sledovací obrázok pred </body>');
  ok(!c.copyHtml.includes('danubra-track') && c.copyHtml.includes('<head>') && c.copyHtml.includes('prefers-color-scheme'), 'kópia bez sledovania, štýly zostali');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
