// Testy: oslovovanie firiem a sledovanie · node app/lib/marketing/outreach.test.js
global.window = global;
const O = require('./outreach.js');
let passed = 0, failed = 0;
function eq(a, e, msg) {
  const x = JSON.stringify(a), y = JSON.stringify(e);
  if (x === y) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${y}\n    dostal:    ${x}`); }
}
const ok = (c, m, extra) => { if (c) { passed++; console.log(`  ✓ ${m}`); } else { failed++; console.log(`  ✗ ${m}${extra ? `\n    ${extra}` : ''}`); } };

const SECRET = 'tajne-123';
const SITE = 'https://app.example';
const TOKEN = 'a'.repeat(32);

console.log('\nNASTAVENIA');
{
  eq(O.settings(null), { track_opens: true, track_clicks: true, daily_limit: 30, followup_days: 5, max_steps: 3, portfolio: '' },
    'bez nastavení platia predvolené (sledovanie zapnuté, 30 denne, pripomenúť o 5 dní)');
  const s = O.settings({ outreach: { track_opens: false, track_clicks: 'false', daily_limit: 5000, followup_days: 0, max_steps: '2' } });
  eq([s.track_opens, s.track_clicks, s.daily_limit, s.followup_days, s.max_steps], [false, false, 200, 1, 2],
    'sledovanie sa dá vypnúť, limit a dni majú hranice');
}

console.log('\nŠABLÓNA');
{
  const lead = { name: 'Müller Bau GmbH', city: 'Ulm', trade: 'Trockenbau', contact_name: 'Herr Müller' };
  const v = O.vars(lead, { supplier: { name: 'Partner und Service s. r. o.' }, similarName: 'GU Ulm', portfolio: 'Wir haben 40 Leute.' });
  eq([v.firma, v.mesto, v.konatel, v.remeslo, v.podobna, v.oslovenie], ['Müller Bau GmbH', 'Ulm', 'Herr Müller', 'Trockenbau', 'GU Ulm', 'Guten Tag Herr Müller,'],
    'premenné {firma} {mesto} {konatel} {remeslo} {podobna} a oslovenie');
  eq(O.vars({}, {}).oslovenie, 'Sehr geehrte Damen und Herren,', 'bez konateľa neutrálne oslovenie (Sie-forma)');
  eq(O.vars({}, { lang: 'en' }).oslovenie, 'Dear Sir or Madam,', 'po anglicky');
  eq(O.fillTemplate('Leute für {remeslo|Ihre Projekte} in {mesto|Ihrer Region}', { remeslo: '', mesto: 'Ulm' }),
    'Leute für Ihre Projekte in Ulm', 'chýbajúci údaj nahradí náhrada za |');
  eq(O.fillTemplate('A\n\n{portfolio}\n\nB {nezname}', {}), 'A\n\nB {nezname}', 'prázdny odsek zmizne, neznáma premenná ostane');
  eq(O.missingVars('Hallo {konatel}, {mesto|Region} {firma}', { firma: 'X' }), ['konatel'], 'upozorní na premennú bez hodnoty a bez náhrady');
  const t = O.pickTemplate([], { step: 1, lang: 'de' });
  const filled = O.fillTemplate(t.body, v);
  ok(/Guten Tag Herr Müller,/.test(filled) && /Partner und Service/.test(filled) && /Wir haben 40 Leute/.test(filled) && !/\{/.test(filled),
    'predvolená šablóna DE sa vyplní celá', filled);
  ok(!/\bdu\b|\bdich\b|\bdein/i.test(Object.values(O.TEMPLATES.de).map(x => x.body).join(' ')), 'nemecké šablóny sú v Sie-forme (bez „du")');
  eq(O.pickTemplate([{ key: 'outreach_followup', language: 'de', channel: 'outreach', subject: 'X', body: 'Y' }], { step: 2 }).source, 'db',
    'pripomenutie berie šablónu z databázy');
  eq(O.pickTemplate([{ key: 'outreach_followup', language: 'de', channel: 'email', body: 'Y' }], { step: 2 }).source, 'default',
    'bežné e-mailové šablóny sa do oslovenia nemiešajú');
  eq(O.replySubject('Re: AW: Fachkräfte'), 'Re: Fachkräfte', 'Re: bez opakovania');
}

console.log('\nIMPRESSUM A PÄTIČKA');
{
  eq(O.impressumMissing({ name: 'P&S' }), ['adresa', 'IČ DPH alebo IČO'], 'bez adresy a IČ DPH e-mail neodíde');
  const s = { name: 'Partner und Service s. r. o.', address: 'Podzámska 4A, Nové Zámky', vat_id: 'SK2122334455', company_id: '57553921' };
  const ft = O.footerText(s, 'https://u/x', 'de');
  ok(/Partner und Service/.test(ft) && /USt-IdNr\.: SK2122334455/.test(ft) && /Hier abmelden: https:\/\/u\/x/.test(ft), 'textová pätička: Impressum aj odhlásenie', ft);
  const fh = O.footerHtml({ ...s, name: '<b>X</b>' }, 'https://u/x?a=1&b=2', 'en');
  ok(/&lt;b&gt;X/.test(fh) && /Unsubscribe here/.test(fh) && /a=1&amp;b=2/.test(fh), 'HTML pätička je ošetrená a po anglicky');
}

console.log('\nPODPIS ODKAZOV');
{
  const sig = O.sign(TOKEN, 'https://firma.de/a', SECRET);
  ok(/^[a-f0-9]{32}$/.test(sig), 'podpis je HMAC');
  ok(O.verify(TOKEN, 'https://firma.de/a', sig, SECRET), 'správny podpis prejde');
  ok(!O.verify(TOKEN, 'https://evil.com/', sig, SECRET), 'iná adresa s tým istým podpisom neprejde (nie je to otvorené presmerovanie)');
  ok(!O.verify('b'.repeat(32), 'https://firma.de/a', sig, SECRET), 'podpis patrí ku kľúču e-mailu');
  ok(!O.verify(TOKEN, 'https://firma.de/a', sig, 'ine'), 'bez nášho tajomstva sa podpísať nedá');
  ok(!O.verify(TOKEN, 'https://firma.de/a', '', SECRET) && !O.verify(TOKEN, 'https://firma.de/a', 'x', SECRET), 'prázdny alebo krátky podpis neprejde');
  eq(O.sign(TOKEN, 'x', null), null, 'bez tajomstva sa nepodpisuje');
  ok(O.tokenOk(O.newToken()) && !O.tokenOk('../x'), 'kľúč e-mailu má 32 znakov 0-9a-f');
  ok(O.ipHash('1.2.3.4', SECRET) !== O.ipHash('1.2.3.5', SECRET) && O.ipHash('1.2.3.4', null) === null, 'IP sa neukladá, len odtlačok s tajomstvom');
  eq([O.safeTarget('javascript:alert(1)'), O.safeTarget('https://u:p@x.de/'), O.safeTarget('ftp://x'), O.safeTarget('https://x.de/a b')],
    [null, null, null, 'https://x.de/a%20b'], 'presmerovať sa dá len na http/https bez hesla v adrese');
}

console.log('\nSLEDOVANIE V TELE');
{
  const html = '<p>Viac na <a href="https://punds.eu/referenzen?a=1&amp;b=2">webe</a>, '
    + '<a href="mailto:info@punds.eu">napíšte</a>, <a href="#x">kotva</a>, <a href=\'http://x.de\'>x</a></p>';
  const r = O.rewriteLinks(html, { site: SITE, token: TOKEN, secret: SECRET });
  eq(r.links, ['https://punds.eu/referenzen?a=1&b=2', 'http://x.de/'], 'prepíšu sa len http/https odkazy');
  ok(r.html.includes('mailto:info@punds.eu') && r.html.includes('href="#x"'), 'mailto a kotva zostanú');
  const m = r.html.match(/href="([^"]*danubra-track[^"]*)"/);
  const u = new URL(m[1].replace(/&amp;/g, '&'));
  eq([u.searchParams.get('t'), u.searchParams.get('k'), u.searchParams.get('u')], [TOKEN, 'c', 'https://punds.eu/referenzen?a=1&b=2'], 'odkaz vedie cez sledovanie s pôvodnou adresou');
  ok(O.verify(TOKEN, u.searchParams.get('u'), u.searchParams.get('s'), SECRET), 'a je podpísaný');
  const c = O.compose({ html: '<p>Hallo <a href="https://punds.eu">punds</a></p><script>x()</script><p onclick="y()">z</p>',
    text: 'Hallo https://punds.eu', supplier: { name: 'P&S', address: 'NZ' }, site: SITE, token: TOKEN, secret: SECRET, cfg: O.DEFAULTS });
  ok(c.html.includes(`${SITE}/.netlify/functions/danubra-track?t=${TOKEN}&amp;k=o`) && /width="1" height="1"/.test(c.html), 'pixel na konci e-mailu');
  ok(!/script|onclick/.test(c.html), 'skripty a udalosti z editora sa vyhodia');
  ok(c.html.includes(`danubra-unsubscribe?t=${TOKEN}`) && c.text.includes(`danubra-unsubscribe?t=${TOKEN}`), 'odhlásenie je v HTML aj v texte');
  ok(!c.copyHtml.includes('danubra-track') && c.copyHtml.includes('href="https://punds.eu"'), 'kópia do Odoslaných je bez sledovania (vlastné otvorenie sa neráta)');
  const off = O.compose({ html: '<a href="https://punds.eu">x</a>', supplier: {}, site: SITE, token: TOKEN, secret: SECRET,
    cfg: { track_opens: false, track_clicks: false } });
  ok(!off.html.includes('danubra-track') && off.html.includes('danubra-unsubscribe'), 'vypnuté sledovanie = bez pixelu a prepisu, odhlásenie zostáva');
  ok(!O.compose({ html: '<a href="https://a.de">x</a>', site: SITE, token: TOKEN, secret: null, cfg: O.DEFAULTS }).html.includes('k=c'),
    'bez tajomstva sa odkazy neprepisujú (nepodpísaný odkaz by nefungoval)');
}

console.log('\nAUTOMATY');
{
  eq(O.automated({ ua: 'Mozilla/5.0' }).auto, true, 'Apple Mail Privacy Protection (holé „Mozilla/5.0")');
  ok(/Google/.test(O.automated({ ua: 'Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)' }).reason), 'Gmail proxy obrázkov');
  eq(O.automated({ ua: '' }).auto, true, 'bez identifikácie = automat');
  eq(O.automated({ ua: 'Mimecast Safe Links' }).auto, true, 'bezpečnostný skener odkazov');
  eq(O.automated({ ua: 'python-requests/2.31' }).auto, true, 'program');
  const human = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
  eq(O.automated({ ua: human, sentAt: '2026-10-01T10:00:00Z', at: '2026-10-01T12:00:00Z' }).auto, false, 'bežný prehliadač po dvoch hodinách = človek');
  eq(O.automated({ ua: human, kind: 'click', sentAt: '2026-10-01T10:00:00Z', at: '2026-10-01T10:00:10Z' }).auto, true, 'klik 10 s po odoslaní = skener');
  ok(O.shortUa('x'.repeat(500)).length === 200, 'prehliadač sa ukladá skrátený');
}

console.log('\nODPOVEDE A NEDORUČENIA');
{
  eq(O.replyIds({ in_reply_to: '<a@x>', refs: '<z@y> <a@x>' }), ['<a@x>', '<z@y>'], 'Message-ID z In-Reply-To aj References');
  eq(O.matchOutreach(['<a@x>'], [{ id: 1, message_id: '<a@x>' }, { id: 2, message_id: '<b@x>' }]).map(r => r.id), [1], 'spáruje sa podľa Message-ID');
  ok(O.isDsn({ from: 'MAILER-DAEMON@mx.de', subject: 'Undelivered Mail Returned to Sender' }), 'mailer-daemon');
  ok(O.isDsn({ from: 'postmaster@firma.de', subject: 'x' }), 'postmaster');
  ok(O.isDsn({ from: 'x@y.de', subject: 'Unzustellbar: Fachkräfte' }), 'nemecký predmet „Unzustellbar"');
  ok(O.isDsn({ from: 'x@y.de', subject: 'Delivery Status Notification (Failure)' }), 'Delivery Status Notification');
  ok(O.isDsn({ from: 'x@y.de', subject: 'x', contentType: 'multipart/report; report-type=delivery-status' }), 'multipart/report');
  ok(!O.isDsn({ from: 'postmaster@x.de', subject: 'Delivery Status Notification (Delay)' }), 'oneskorenie nie je nedoručenie');
  ok(!O.isDsn({ from: 'hans@firma.de', subject: 'Re: Fachkräfte' }), 'bežná odpoveď nie je nedoručenka');
  eq(O.messageIds('Original-Message-ID: <abc.1@punds.eu>\nIn-Reply-To: <z@q>'), ['<abc.1@punds.eu>', '<z@q>'], 'Message-ID z textu nedoručenky');
  ok(O.isAutoReply({ subject: 'Abwesenheitsnotiz: Fachkräfte' }) && O.isAutoReply({ subject: 'x', headers: { 'auto-submitted': 'auto-replied' } }),
    'automatická odpoveď (dovolenka) sa rozozná');
  ok(!O.isAutoReply({ subject: 'Re: Fachkräfte', headers: { 'auto-submitted': 'no' } }), 'odpoveď človeka nie je automatická');
}

console.log('\nPRIPOMENUTIE');
{
  eq(O.nextFollowup('2026-10-26T09:00:00Z', 5), '2026-11-02T09:00:00.000Z','pondelok + 5 dní = sobota → pondelok');
  eq(O.nextFollowup('2026-10-27T09:00:00Z', 2), '2026-10-29T09:00:00.000Z', 'v týždni bez posunu');
  const leads = [{ id: 'l1', status: 'contacted' }, { id: 'l2', status: 'contacted' }, { id: 'l3', status: 'interested' },
    { id: 'l4', status: 'contacted' }, { id: 'l5', status: 'contacted' }];
  const now = '2026-11-10T10:00:00Z';
  const rows = [
    { id: 'o1', lead_id: 'l1', step: 1, status: 'sent', sent_at: '2026-11-01T09:00:00Z', next_followup_at: '2026-11-06T09:00:00Z' },
    { id: 'o2', lead_id: 'l2', step: 1, status: 'sent', sent_at: '2026-11-01T09:00:00Z', next_followup_at: '2026-11-06T09:00:00Z', replied_at: '2026-11-02T09:00:00Z' },
    { id: 'o3', lead_id: 'l3', step: 1, status: 'sent', sent_at: '2026-11-01T09:00:00Z', next_followup_at: '2026-11-06T09:00:00Z' },
    { id: 'o4a', lead_id: 'l4', step: 1, status: 'sent', sent_at: '2026-11-01T09:00:00Z', next_followup_at: '2026-11-06T09:00:00Z' },
    { id: 'o4b', lead_id: 'l4', step: 2, status: 'sent', sent_at: '2026-11-07T09:00:00Z', next_followup_at: '2026-11-20T09:00:00Z' },
    { id: 'o5', lead_id: 'l5', step: 1, status: 'bounced', sent_at: '2026-11-01T09:00:00Z', next_followup_at: '2026-11-06T09:00:00Z', bounced_at: '2026-11-01T09:01:00Z' },
  ];
  eq(O.followupsDue(rows, leads, now).map(x => x.outreach.id), ['o1'],
    'pripomenúť len tomu, kto neodpísal, nie je ďalej, nedoručené nie, a podľa posledného e-mailu');
  eq(O.followupsDue([{ ...rows[0], step: 3 }], leads, now).length, 0, 'po treťom e-maile už nie');
  eq(O.relDays('2026-11-13T08:00:00', new Date('2026-11-10T20:00:00')), 'o 3 dni', '„o 3 dni"');
}

console.log('\nČO SA SMIE POSLAŤ');
{
  const lead = { id: 'l1', email: 'info@firma.de', status: 'new' };
  ok(O.canSend({ lead, sentToday: 0 }).ok, 'nová firma s e-mailom áno');
  eq(O.canSend({ lead: { ...lead, email: '' } }).blocks.map(b => b.code), ['no_email'], 'bez e-mailu nie');
  eq(O.canSend({ lead, optouts: [{ email: 'INFO@firma.de' }] }).blocks.map(b => b.code), ['optout'], 'odhlásená adresa sa znova neosloví');
  ok(O.canSend({ lead: { ...lead, status: 'unsubscribed' } }).blocks.some(b => b.code === 'optout'), 'ani odhlásená firma');
  eq(O.canSend({ lead, sentToday: 30 }).blocks.map(b => b.code), ['limit'], 'denný limit');
  ok(O.canSend({ lead, sentToday: 28 }).warns.some(w => w.code === 'near'), 'blízko limitu upozorní');
  const h = [{ status: 'sent', step: 1, sent_at: '2026-11-01T09:00:00Z', to_email: 'info@firma.de' }];
  eq(O.canSend({ lead, history: h, step: 1 }).blocks.map(b => b.code), ['dup'], 'prvý e-mail druhýkrát nie');
  ok(O.canSend({ lead, history: h, step: 2 }).ok, 'pripomenutie áno');
  eq(O.canSend({ lead, history: [{ ...h[0], replied_at: 'x' }], step: 2 }).blocks.map(b => b.code), ['replied'], 'po odpovedi sa nepripomína');
  eq(O.canSend({ lead, step: 2 }).blocks.map(b => b.code), ['no_prev'], 'pripomenutie bez prvého e-mailu nie');
  eq(O.canSend({ lead, history: [{ ...h[0], status: 'bounced', bounced_at: 'x' }], step: 2 }).blocks.map(b => b.code), ['bounced'], 'na nedoručenú adresu nie');
  eq(O.canSend({ lead, history: h, step: 4 }).blocks.map(b => b.code), ['max'], 'najviac tri e-maily');
}

console.log('\nPREHĽAD');
{
  const rows = [
    { lead_id: 'l1', step: 1, status: 'sent', sent_at: '2026-11-01T09:00:00Z', opened_at: '2026-11-01T10:00:00Z', open_count: 2,
      clicked_at: '2026-11-01T10:01:00Z', click_count: 1, next_followup_at: '2026-11-06T09:00:00Z' },
  ];
  const s = O.summary(rows, new Date('2026-11-10T00:00:00Z'));
  eq([s.count, s.state, s.opens, s.clicks, s.waiting], [1, 'clicked', 2, 1, true], 'zhrnutie firmy: klikol, čaká na pripomenutie');
  eq(O.flags(s), ['sent', 'opened', 'clicked', 'waiting'], 'značky pre filtre');
  eq(O.summary([{ status: 'sent', sent_at: 'x', auto_opened_at: 'y', auto_open_count: 1 }]).state, 'auto', 'len automatické otvorenie = „možno automaticky"');
  eq(O.flags(O.summary([])), ['not_sent'], 'neoslovená');
  const now = new Date('2026-11-10T00:00:00Z');
  const st = O.stats([
    { status: 'sent', sent_at: '2026-11-08T00:00:00Z', opened_at: 'x', replied_at: 'x' },
    { status: 'sent', sent_at: '2026-11-07T00:00:00Z', auto_opened_at: 'x' },
    { status: 'bounced', sent_at: '2026-11-07T00:00:00Z', bounced_at: 'x' },
    { status: 'sent', sent_at: '2026-11-06T00:00:00Z', clicked_at: 'x', opened_at: 'x' },
    { status: 'sent', sent_at: '2026-09-01T00:00:00Z', opened_at: 'x' },
    { status: 'failed', sent_at: null },
  ], 7, now);
  eq([st.sent, st.opened, st.openedPct, st.autoOnly, st.clicked, st.replied, st.bounced], [4, 2, 50, 1, 1, 1, 1], 'štatistika za 7 dní');
  eq(O.sentToday([{ status: 'sent', sent_at: new Date().toISOString() }, { status: 'failed', sent_at: new Date().toISOString() },
    { status: 'sent', sent_at: '2020-01-01T00:00:00Z' }]), 1, 'dnes odoslané (len naozaj odoslané)');
  const ds = O.dayStart(new Date('2026-07-15T12:00:00Z'));
  eq(ds, '2026-07-14T22:00:00.000Z', 'deň začína o polnoci v Bratislave (letný čas)');
  eq(O.freshLeads([{ id: 'a', status: 'new', email: 'a@b.de' }, { id: 'b', status: 'new', email: 'x' }, { id: 'c', status: 'new', email: 'c@d.de' },
    { id: 'd', status: 'new', email: 'off@d.de' }], [{ lead_id: 'c', status: 'sent' }], ['off@d.de']).map(l => l.id), ['a'],
  'nové s e-mailom, neoslovené a neodhlásené');
  eq(O.eventLabel({ type: 'open', automated: true }), 'Otvorenie (možno automaticky)', 'popis udalosti');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
