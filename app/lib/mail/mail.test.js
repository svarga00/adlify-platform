// Testy: Pošta — node app/lib/mail/mail.test.js
global.window = global;
const M = require('./mail.js');
let passed = 0, failed = 0;
function eq(a, e, msg) { const x = JSON.stringify(a), y = JSON.stringify(e);
  if (x === y) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${y}\n    dostal:    ${x}`); } }
const ok = (c, m, x) => { if (c) { passed++; console.log(`  ✓ ${m}`); } else { failed++; console.log(`  ✗ ${m}${x ? `\n    ${x}` : ''}`); } };

console.log('\nADRESY A PREDMET');
eq(M.parseAddresses('Ján Novák <Jan@Firma.sk>, b@y.de; "Bau, GmbH" <info@bau.de>'),
  [{ name: 'Ján Novák', address: 'jan@firma.sk' }, { name: '', address: 'b@y.de' }, { name: 'Bau, GmbH', address: 'info@bau.de' }],
  'mená aj adresy, malými písmenami, čiarka v mene neprekáža');
eq(M.normSubject('AW: Re: WG: Fwd:  Angebot März'), 'Angebot März', 'Re/AW/WG/Fwd sa odstránia');
eq(M.threadKey({ references: ['<a@x>', '<b@x>'], subject: 'x' }), '<a@x>', 'vlákno podľa prvej správy v reťazi');
eq(M.threadKey({ subject: 'Re: Ponuka' }), 'subj:ponuka', 'bez odkazov podľa predmetu');
eq(M.snippet('> citácia\nDobrý deň,\n\nposielam  ponuku.'), 'Dobrý deň, posielam ponuku.', 'náhľad bez citácie');
eq(M.htmlToText('<p>Ahoj<br>svet</p><script>x()</script><div>A&amp;B</div>'), 'Ahoj\nsvet\nA&B', 'HTML → text bez skriptov');

console.log('\nODPOVEĎ A PREPOSLANIE');
const MB = { id: 'mb1', email: 'info@punds.eu', signature: 'Štefan Varga\nPartner und Service s. r. o.' };
const MSG = { mailbox_id: 'mb1', direction: 'in', message_id: '<m2@x>', refs: '<m1@x>', from_email: 'bau@gu-ulm.de', from_name: 'Hans Bauer',
  to_list: [{ address: 'info@punds.eu' }, { address: 'office@punds.eu' }], cc_list: [{ address: 'chef@gu-ulm.de', name: 'Chef' }],
  subject: 'AW: Angebot', sent_at: '2026-10-20T08:30:00Z', text_body: 'Wir brauchen 4 Maurer.\nGruß' };
{
  const r = M.replyDraft(MSG, { mailbox: MB });
  eq(r.to.map(a => a.address), ['bau@gu-ulm.de'], 'odpoveď ide odosielateľovi');
  eq([r.subject, r.in_reply_to, r.references], ['Re: Angebot', '<m2@x>', '<m1@x> <m2@x>'], 'predmet Re:, odkazy na vlákno');
  ok(/-- \nŠtefan Varga/.test(r.body) && r.body.indexOf('-- ') < r.body.indexOf('> Wir brauchen'), 'podpis je nad citáciou', r.body);
  ok(/napísal\(a\):\n> Wir brauchen 4 Maurer\.\n> Gruß/.test(r.body), 'citácia pôvodnej správy');
  const all = M.replyDraft(MSG, { mailbox: MB, all: true });
  eq(all.cc.map(a => a.address), ['office@punds.eu', 'chef@gu-ulm.de'], 'všetkým: ostatní bez vlastnej adresy a bez duplicít');
  const f = M.forwardDraft({ ...MSG, attachments: [{ name: 'a.pdf', storage_path: 'mail/x/a.pdf' }] }, { mailbox: MB });
  ok(f.subject === 'Fwd: Angebot' && /Preposlaná správa/.test(f.body) && f.attachments.length === 1, 'preposlanie s hlavičkou a prílohami');
  const out = M.replyDraft({ ...MSG, direction: 'out', from_email: 'info@punds.eu', to_list: [{ address: 'bau@gu-ulm.de' }] }, { mailbox: MB });
  eq(out.to.map(a => a.address), ['bau@gu-ulm.de'], 'odpoveď na vlastný odoslaný e-mail ide tomu istému adresátovi');
}

console.log('\nKOMU E-MAIL PATRÍ');
{
  const D = { workers: [{ id: 'w1', email: 'Jozef@Gmail.com' }], partners: [{ id: 'p1', email: 'info@gu-ulm.de' }], leads: [{ id: 'l1', email: 'kontakt@bauer.de' }] };
  eq(M.matchEntities([{ address: 'jozef@gmail.com' }], D), { worker_id: 'w1', partner_id: null, lead_id: null }, 'živnostník podľa adresy');
  eq(M.matchEntities('Hans <bau@gu-ulm.de>', D).partner_id, 'p1', 'odberateľ aj podľa domény (iný človek z tej istej firmy)');
  eq(M.matchEntities('x@gmail.com', { partners: [{ id: 'p9', email: 'firma@gmail.com' }] }).partner_id, null, 'verejná doména (gmail) sa nepáruje');
  eq(M.matchEntities('kontakt@bauer.de', D).lead_id, 'l1', 'nová firma z marketingu');
}

console.log('\nZO SCHRÁNKY DO DATABÁZY');
{
  const r = M.fromParsed({ from: { value: [{ address: 'Bau@GU-Ulm.de', name: 'Hans' }] }, to: { value: [{ address: 'info@punds.eu' }] },
    subject: 'Re: Termin', date: new Date('2026-10-21T10:00:00Z'), messageId: '<m3@x>', inReplyTo: '<m2@x>', references: ['<m1@x>', '<m2@x>'],
    text: 'Passt.\n> stará', html: '<p>Passt.</p>', attachments: [{ filename: 'plan.pdf', contentType: 'application/pdf', size: 1200 },
      { filename: 'logo.png', contentType: 'image/png', size: 300, related: true }] }, { mailbox_id: 'mb1', folder: 'INBOX', uid: 42, seen: true });
  eq([r.from_email, r.uid, r.folder, r.seen, r.thread_key, r.snippet], ['bau@gu-ulm.de', 42, 'INBOX', true, '<m1@x>', 'Passt.'], 'odosielateľ, UID, vlákno, náhľad');
  eq(r.attachments.map(a => a.name), ['plan.pdf'], 'príloha áno, obrázok vložený do textu nie');
  eq(M.fromParsed({}, { folder: 'INBOX' }).subject, '(bez predmetu)', 'bez predmetu nespadne');
}

console.log('\nZOBRAZENIE');
{
  const d = M.viewerDoc({ html_body: '<p onclick="x()">Hi</p><script>alert(1)</script><img src="https://track.er/p.gif">' });
  ok(!/<script/i.test(d) && !/onclick/i.test(d), 'skripty a udalosti preč');
  ok(/img-src data:;/.test(d), 'obrázky z webu sa bez dovolenia nenačítajú (sledovanie)');
  ok(/img-src data: https:/.test(M.viewerDoc({ html_body: '<p>x</p>' }, { images: true })), 'po kliknutí „Zobraziť obrázky" áno');
  ok(M.hasRemoteImages({ html_body: '<img src="https://x/a.png">' }), 'vie, že sú v ňom obrázky z webu');
  ok(/white-space:pre-wrap/.test(M.viewerDoc({ text_body: 'a\nb' })), 'čistý text sa zobrazí s riadkami');
}

// ── Grafický podpis ──────────────────────────────────────────────────────
{
  const mb = { email: 'stefan@punds.sk', signature_card: { enabled: true, name: 'Štefan Varga', role: 'Koordinátor projektov', phone: '+421 910 523 858', lang: 'sk' } };
  const t = M.sigOf(mb);
  ok(/^S pozdravom\n\nŠtefan Varga\nKoordinátor projektov · punds\n\+421 910 523 858\nstefan@punds\.sk · punds\.sk$/.test(t), 'textový podpis z vizitky', JSON.stringify(t));
  ok(M.sigOf({ ...mb, signature: 'Vlastný' }) === 'Vlastný', 'vlastný text má prednosť');
  ok(M.sigOf({ email: 'a@b.sk', signature_card: { enabled: false, name: 'X' } }) === '', 'vypnutá vizitka = bez podpisu');
  const de = M.sigHtml({ email: 'name@punds.eu', signature_card: { enabled: true, name: 'Max', lang: 'de' } }, 'https://x/web/public');
  ok(/Mit freundlichen Grüßen/.test(de) && /Fachkräfte anfragen/.test(de) && /punds\.eu/.test(de) && /punds-mark\.png/.test(de), 'nemecký grafický podpis');
  const text = `Dobrý deň,\nposielam ponuku.\n\n-- \n${t}\n\nDňa 1. 1. 2026 Jano napísal(a):\n> otázka`;
  const html = M.bodyHtml(text, mb, 'https://x/web/public');
  ok(/<table/.test(html) && !/-- <br>/.test(html) && /posielam ponuku/.test(html) && /&gt; otázka/.test(html), 'v HTML je grafický podpis namiesto textového, citácia zostane', html.slice(0, 200));
  ok(!/<table/.test(M.bodyHtml('Ahoj\n\n-- \nJano', { email: 'a@b.sk' })), 'bez vizitky je HTML len text');
  const r = M.replyDraft({ from_email: 'x@y.de', subject: 'Hi', text_body: 'q', sent_at: '2026-01-01' }, { mailbox: mb });
  ok(r.body.includes(`-- \n${t}`), 'odpoveď má podpis z vizitky');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
