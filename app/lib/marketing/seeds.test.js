// Testy: nové firmy podľa webov zadaných firiem · node app/lib/marketing/seeds.test.js
global.window = global;
const S = require('./seeds.js');
let passed = 0, failed = 0;
function eq(a, e, msg) {
  const x = JSON.stringify(a), y = JSON.stringify(e);
  if (x === y) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${y}\n    dostal:    ${x}`); }
}
const ok = (c, m, extra) => { if (c) { passed++; console.log(`  ✓ ${m}`); } else { failed++; console.log(`  ✗ ${m}${extra ? `\n    ${extra}` : ''}`); } };

console.log('\nDOMÉNY');
{
  eq(S.hostOf('https://www.Mueller-Bau.de/leistungen?x=1'), 'mueller-bau.de', 'host bez www, malými');
  eq(S.hostOf('mueller-bau.de'), 'mueller-bau.de', 'bez https');
  eq(S.hostOf('info@mueller-bau.de'), 'mueller-bau.de', 'z e-mailu');
  eq(S.hostOf('www2.firma.de'), 'firma.de', 'aj www2.');
  eq(S.hostOf('nieco bez bodky'), '', 'nezmysel → prázdne');
  eq(S.baseDomain('https://shop.mueller-bau.de'), 'mueller-bau.de', 'subdoména → doména firmy');
  eq(S.baseDomain('https://www.bau.co.at'), 'bau.co.at', 'co.at má tri časti');
  ok(S.isFreemail('t-online.de') && S.isFreemail('x@web.de') && !S.isFreemail('mueller-bau.de'), 'bezplatné schránky');
}

console.log('\nSSRF — kam server nesmie');
{
  const zle = ['http://localhost/', 'http://127.0.0.1/', 'http://127.1/', 'http://2130706433/', 'http://0x7f000001/',
    'http://0177.0.0.1/', 'http://10.0.0.5/', 'http://172.16.3.4/', 'http://172.31.255.255/', 'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/', 'http://100.64.0.1/', 'http://0.0.0.0/', 'http://[::1]/', 'http://[::]/',
    'http://[fd00::1]/', 'http://[fe80::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:7f00:1]/', 'http://[::ffff:10.0.0.1]/',
    'http://intranet/', 'http://server.local/', 'http://db.internal/', 'http://app.localhost/', 'http://router.lan/',
    'ftp://firma.de/', 'file:///etc/passwd', 'javascript:alert(1)', 'http://user:pass@firma.de/', 'http://firma.de:8080/',
    'http://firma.de:22/', 'gopher://firma.de/', 'http://8.8.8.8/'];
  const pustene = zle.filter(u => S.checkUrl(u).ok);
  eq(pustene, [], `zablokuje ${zle.length} nebezpečných adries (localhost, súkromné siete, metadáta, IPv6, porty, schémy, IP)`);
  ok(/IP/.test(S.checkUrl('http://8.8.8.8/').reason), 'verejná IP: povie, nech zadajú doménu');
  ok(S.checkUrl('https://mueller-bau.de/impressum').ok && S.checkUrl('http://www.firma-xy.de:80/').ok && S.checkUrl('https://firma.de:443/').ok,
    'bežný web prejde (aj s portom 80/443)');
  ok(S.checkUrl('https://xn--mller-bau-q9a.de/').ok, 'punycode doména prejde');
  ok(!S.checkUrl('https://firma.123/').ok, 'číselná koncovka nie');

  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.0.10', '169.254.169.254', '100.100.100.100', '0.0.0.0',
    '224.0.0.1', '255.255.255.255', '198.18.0.1', '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::abcd', '::ffff:192.168.1.1',
    '::ffff:c0a8:0101', '64:ff9b::a00:1', 'ff02::1', '2001:db8::1']) {
    ok(S.isPrivateIp(ip), `DNS na ${ip} → zablokované`);
  }
  for (const ip of ['8.8.8.8', '85.13.140.1', '172.32.0.1', '100.128.0.1', '2a01:4f8::1', '::ffff:8.8.8.8']) {
    ok(!S.isPrivateIp(ip), `verejná ${ip} prejde`);
  }
  ok(S.isPrivateIp('nezmysel'), 'neznámy tvar adresy → radšej zablokovať');
  eq(S.parseIPv4('0x7f.1'), 2130706433, 'IPv4 v šestnástkovom tvare');
  eq(S.parseIPv4('256.1.1.1'), null, 'neplatná IPv4');
  eq(S.parseIPv6('::ffff:127.0.0.1'), [0, 0, 0, 0, 0, 65535, 32512, 1], 'IPv6 s IPv4 na konci');
}

console.log('\nZADANÉ ADRESY');
{
  const r = S.parseSeeds(`https://www.mueller-bau.de/leistungen#top
huber-trockenbau.de – sadrokartón
  http://Schmidt-Ausbau.de/
www.mueller-bau.de
ftp://zle.de
localhost:3000
https://bau.example.com/,  https://elektro-weber.de;https://shop.mueller-bau.de`);
  eq(r.seeds.map(s => s.domain), ['mueller-bau.de', 'huber-trockenbau.de', 'schmidt-ausbau.de', 'bau.example.com', 'elektro-weber.de'],
    'jedna na riadok aj s čiarkou, doména bez www, slová bez bodky sa preskočia');
  eq(r.seeds[0].url, 'https://www.mueller-bau.de/leistungen', 'URL bez #kotvy');
  eq(r.seeds[1].url, 'https://huber-trockenbau.de/', 'bez https → doplní sa https');
  eq(r.duplicates, ['www.mueller-bau.de', 'https://shop.mueller-bau.de'], 'tá istá firma druhýkrát (aj subdoména) je duplicita');
  eq(r.invalid.map(x => x.input), ['ftp://zle.de', 'localhost:3000'], 'nepovolené adresy sa ukážu');
  ok(r.ok && r.error === null, 'päť firiem je v poriadku');
  const malo = S.parseSeeds('a-bau.de\nb-bau.de');
  ok(!malo.ok && /aspoň 3/.test(malo.error), 'dve firmy sú málo', malo.error);
  const vela = S.parseSeeds(Array.from({ length: 11 }, (_, i) => `firma${i}.de`).join('\n'));
  ok(!vela.ok && /Najviac 10/.test(vela.error), 'jedenásť je priveľa', vela.error);
  eq(S.parseSeeds('').seeds, [], 'prázdne pole');
  eq([S.clampCount(5), S.clampCount(30), S.clampCount(500), S.clampCount('x')], [10, 30, 50, 20], 'počet 10 až 50, predvolene 20');
}

console.log('\nSTRÁNKA → TEXT');
{
  const html = `<html><head><title>X</title><style>.a{}</style><script>var mail="fake@spam.de"</script></head>
    <body><nav><a href="/">Start</a> <a href="/impressum.html">Impressum</a> <a href="https://facebook.com/x">FB</a>
    <a href="kontakt/">Kontakt</a> <a href="/ueber-uns">Über uns</a> <a href="/datenschutz">Datenschutz</a>
    <a href="mailto:info&#64;mueller-bau.de?subject=Hi">Schreiben Sie uns</a> <a href="tel:+497311234">Anrufen</a>
    <a href="https://www.mueller-bau.de/impressum.html#a">Impressum unten</a> <a href="/plan.pdf">Impressum PDF</a></nav>
    <p>M&uuml;ller&nbsp;Bau&nbsp;GmbH<br>Hauptstra&szlig;e 5</p><!-- info@kommentar.de --></body></html>`;
  const t = S.htmlToText(html);
  ok(t.includes('Müller Bau GmbH') && t.includes('Hauptstraße 5'), 'entity aj nbsp sa prevedú', t);
  ok(t.includes('info@mueller-bau.de') && t.includes('Tel: +497311234'), 'mailto a tel z odkazov sú v texte');
  ok(!t.includes('fake@spam.de') && !t.includes('kommentar.de') && !t.includes('.a{}'), 'script, style a komentáre von');
  const l = S.impressumLinks(html, 'https://www.mueller-bau.de/');
  eq(l.map(x => [x.url, x.kind]), [['https://www.mueller-bau.de/impressum.html', 'impressum'],
    ['https://www.mueller-bau.de/kontakt/', 'kontakt'], ['https://www.mueller-bau.de/ueber-uns', 'about']],
  'Impressum, Kontakt, Über uns — len vlastný web, bez PDF a bez duplicít');
  eq(S.guessPages('https://www.mueller-bau.de/x/y'), ['https://www.mueller-bau.de/impressum', 'https://www.mueller-bau.de/kontakt'], 'bežné adresy Impressum');
  ok(S.looksLikeImpressum('Angaben gemäß § 5 TMG') && S.looksLikeImpressum('Geschäftsführer: X') && !S.looksLikeImpressum('Willkommen'), 'rozozná Impressum');
  eq(S.decodeEntities('a&#x40;b&#64;c&period;d &Auml;'), 'a@b@c.d Ä', 'číselné aj pomenované entity');
  ok(S.htmlToText('x'.repeat(100), { max: 10 }).length === 10, 'text sa oreže');
}

console.log('\nE-MAILY');
{
  eq(S.extractEmails('Mail: info [at] mueller-bau [dot] de'), ['info@mueller-bau.de'], '„info [at] firma [dot] de"');
  eq(S.extractEmails('info(at)huber-bau.de'), ['info@huber-bau.de'], '„info(at)firma.de"');
  eq(S.extractEmails('E-Mail: kontakt (ät) schmidt-ausbau (punkt) de'), ['kontakt@schmidt-ausbau.de'], '„(ät) … (punkt)"');
  eq(S.extractEmails('E-Mail: buero at weber-elektro dot de'), ['buero@weber-elektro.de'], '„at … dot" bez zátvoriek (na riadku s E-Mail)');
  eq(S.extractEmails('info{at}firma[.]de'), ['info@firma.de'], 'zložené a hranaté zátvorky');
  eq(S.extractEmails('Wir sind at home dot com'), [], 'veta s „at" a „dot" bez e-mailu nič nevyrobí');
  eq(S.extractEmails('INFO@Mueller-Bau.DE. Und info@mueller-bau.de'), ['info@mueller-bau.de'], 'malými, bez bodky na konci, raz');
  eq(S.extractEmails('logo@2x.png max.mustermann@firma.de name@domain.de test@example.com 3f2a9c8d7e6b5a4f3e2d1c0b@sentry.io'), [],
    'obrázky, vzorové a technické adresy von');

  eq(S.emailKind('info@x.de'), 'generic', 'info@ je firemný');
  eq(S.emailKind('buero@x.de'), 'generic', 'buero@ je firemný');
  eq(S.emailKind('h.mueller@x.de'), 'personal', 'meno je osobný');
  eq(S.emailKind('datenschutz@x.de'), 'never', 'datenschutz nikdy');
  eq(S.emailKind('noreply@x.de'), 'never', 'noreply nikdy');
  eq(S.emailKind('bewerbung@x.de'), 'never', 'bewerbung nikdy');

  const w = 'https://www.mueller-bau.de';
  eq(S.pickEmail(['h.mueller@mueller-bau.de', 'info@mueller-bau.de'], { website: w, trusted: ['h.mueller@mueller-bau.de'] }),
    { email: 'info@mueller-bau.de', kind: 'generic', domain_match: true }, 'firemný pred osobným');
  eq(S.pickEmail(['info@webdesign-agentur.de', 'kontakt@mueller-bau.de'], { website: w }),
    { email: 'kontakt@mueller-bau.de', kind: 'generic', domain_match: true }, 'webdizajnér (cudzia doména) sa preskočí');
  eq(S.pickEmail(['info@webdesign-agentur.de'], { website: w }), null, 'len cudzia doména → nič');
  eq(S.pickEmail(['mueller.bau@t-online.de'], { website: w, trusted: ['mueller.bau@t-online.de'] }),
    { email: 'mueller.bau@t-online.de', kind: 'personal', domain_match: false }, 'bezplatná schránka z Impressum prejde');
  eq(S.pickEmail(['h.mueller@mueller-bau.de'], { website: w }), null, 'osobný mimo Impressum nie');
  eq(S.pickEmail(['datenschutz@mueller-bau.de', 'noreply@mueller-bau.de'], { website: w, trusted: ['datenschutz@mueller-bau.de'] }), null,
    'datenschutz ani noreply nikdy');
  eq(S.pickEmail(['info@t-online.de', 'buero@mueller-bau.de'], { website: w }).email, 'buero@mueller-bau.de', 'vlastná doména pred bezplatnou');
  eq(S.pickEmail(['info@hocico.de'], {}).email, 'info@hocico.de', 'bez webu sa doména neporovnáva');
}

console.log('\nTELEFÓN');
{
  eq(S.extractPhones('Tel.: +49 (0) 731 / 123 45-6'), ['+49 731 123456'], '+49 (0) 731 / 123 45-6');
  eq(S.extractPhones('Telefon 0049 89 1234567'), ['+49 89 1234567'], '0049');
  eq(S.extractPhones('Fon: (0731) 12345'), ['+49 731 12345'], '(0731) 12345');
  eq(S.extractPhones('T 089-12 34 56 0'), ['+49 89 1234560'], '089-12 34 56 0');
  eq(S.extractPhones('Mobil: 0171 1234567'), ['+49 171 1234567'], 'mobil');
  eq(S.extractPhones('Telefon: 0731 9876 | Fax: 0731 9877'), ['+49 731 9876'], 'fax na tom istom riadku sa vynechá');
  eq(S.extractPhones('Telefax: 0731 9877'), [], 'len fax → nič');
  eq(S.extractPhones('USt-IdNr.: DE 012345678\nHRB 01234 Amtsgericht Ulm\nStand 01.02.2024'), [], 'USt-IdNr, HRB a dátum nie sú telefón');
  eq(S.extractPhones('Zentrale 0821 4455\nTel: 0821 4456'), ['+49 821 4455', '+49 821 4456'], 's označením, bez opakovania');
  eq(S.normPhone('+4973112345'), '+49 73112345', 'bez medzier ostane spolu');
  eq(S.normPhone('12345'), null, 'bez predvoľby nie');
}

console.log('\nUSt-IdNr');
{
  eq(S.extractVat('Umsatzsteuer-Identifikationsnummer gemäß § 27 a UStG: DE 123 456 789'), 'DE123456789', 'dlhý tvar s medzerami');
  eq(S.extractVat('USt-IdNr.: DE987654321'), 'DE987654321', 'USt-IdNr.:');
  eq(S.extractVat('USt.-ID: DE-111222333'), 'DE111222333', 'USt.-ID s pomlčkou');
  eq(S.extractVat('IBAN: DE89 3704 0044 0532 0130 00'), null, 'IBAN nie je USt-IdNr');
  eq(S.extractVat('Steuernummer: 123/456/78901'), null, 'Steuernummer nie je USt-IdNr');
  eq(S.extractVat('VAT ID DE 135 246 357'), 'DE135246357', 'VAT ID');
}

console.log('\nKONATEĽ');
{
  eq(S.extractManager('Geschäftsführer: Hans Müller, Peter Schmidt'), 'Hans Müller, Peter Schmidt', 'dvaja konatelia');
  eq(S.extractManager('Geschäftsführerin:\nDipl.-Ing. Anna Weber'), 'Dipl.-Ing. Anna Weber', 'meno na ďalšom riadku, s titulom');
  eq(S.extractManager('Inhaber: Herr Karl Huber'), 'Karl Huber', 'Inhaber, bez „Herr"');
  eq(S.extractManager('Vertretungsberechtigter Geschäftsführer: Thomas Bauer Registergericht: Amtsgericht Ulm'), 'Thomas Bauer',
    'skončí pri Registergericht');
  eq(S.extractManager('Vertreten durch die Müller Verwaltungs GmbH, diese vertreten durch den Geschäftsführer Jürgen Müller'), 'Jürgen Müller',
    'komplementár GmbH → človek za ňou');
  eq(S.extractManager('Geschäftsführung: Maria Schneider und Klaus Fischer'), 'Maria Schneider, Klaus Fischer', '„und"');
  eq(S.extractManager('Geschäftsführer: siehe Handelsregister'), null, 'bez mena nič');
  eq(S.extractManager('Kontakt: Hans Müller'), null, 'bez označenia konateľa nič');
  ok(S.isPersonName('Hans-Peter von Müller') && !S.isPersonName('Müller Bau GmbH') && !S.isPersonName('Hans'), 'rozozná meno človeka');
}

console.log('\nADRESA');
{
  eq(S.extractAddress('Müller Bau GmbH\nHauptstraße 5\n89073 Ulm\nTel. 0731 1'), { address: 'Hauptstraße 5', postal_code: '89073', city: 'Ulm' },
    'ulica a PSČ na dvoch riadkoch');
  eq(S.extractAddress('Müller Bau GmbH, Industriestr. 12a, D-86150 Augsburg, Deutschland'),
    { address: 'Industriestr. 12a', postal_code: '86150', city: 'Augsburg' }, 'na jednom riadku, D-, Deutschland');
  eq(S.extractAddress('Am Bahnhof 3-5 · 80331 München · Tel 089 1'), { address: 'Am Bahnhof 3-5', postal_code: '80331', city: 'München' },
    'bodky medzi časťami');
  eq(S.extractAddress('Postfach\n01067 Dresden'), { address: null, postal_code: '01067', city: 'Dresden' }, 'PSČ bez ulice — aspoň mesto');
  eq(S.extractAddress('HRB 12345 Amtsgericht Ulm'), null, 'HRB nie je PSČ');
  eq(S.extractAddress('Frankfurt am Main\nMainzer Landstraße 200\n60327 Frankfurt am Main'),
    { address: 'Mainzer Landstraße 200', postal_code: '60327', city: 'Frankfurt am Main' }, 'viacslovné mesto');
}

console.log('\nIMPRESSUM CELÉ (nemecké príklady)');
{
  const imp1 = S.htmlToText(`<h1>Impressum</h1><p>Angaben gemäß § 5 DDG</p>
    <p>Huber Trockenbau GmbH<br>Gewerbering 14<br>85221 Dachau</p>
    <p><strong>Vertreten durch:</strong><br>Geschäftsführer: Josef Huber, Maria Huber</p>
    <p>Kontakt<br>Telefon: +49 (0) 8131 / 55 66-0<br>Telefax: +49 (0) 8131 / 55 66-99<br>
    E-Mail: info [at] huber-trockenbau [dot] de</p>
    <p>Registereintrag: Eintragung im Handelsregister. Registergericht: Amtsgericht München, Registernummer: HRB 123456</p>
    <p>Umsatzsteuer-ID: Umsatzsteuer-Identifikationsnummer gemäß §27 a Umsatzsteuergesetz: DE 812 345 678</p>
    <p>Webdesign: Pixel Agentur, hallo@pixel-agentur.de</p>`);
  eq(S.parseImpressum(imp1, { website: 'https://www.huber-trockenbau.de' }), {
    company: 'Huber Trockenbau GmbH', emails: ['info@huber-trockenbau.de', 'hallo@pixel-agentur.de'],
    email: 'info@huber-trockenbau.de', email_kind: 'generic', email_domain_match: true,
    phone: '+49 8131 55660', phones: ['+49 8131 55660'], vat_id: 'DE812345678', contact_person: 'Josef Huber, Maria Huber',
    address: 'Gewerbering 14', postal_code: '85221', city: 'Dachau',
  }, 'GmbH: všetko z Impressum, e-mail webdizajnéra nie');

  const imp2 = S.htmlToText(`<div class="impressum"><b>Elektro Weber e.K.</b> | Inhaber: Stefan Weber<br>
    Lindenallee 7 | 90402 Nürnberg<br>Tel 0911-223344 · Mobil 0170 9988776<br>
    Mail: <a href="mailto:s.weber@elektro-weber.de">s.weber@elektro-weber.de</a><br>
    USt-IdNr.: DE298765432<br>Zuständige Kammer: Handwerkskammer für Mittelfranken</div>`);
  const p2 = S.parseImpressum(imp2, { website: 'elektro-weber.de' });
  eq([p2.email, p2.email_kind, p2.contact_person, p2.phone, p2.city, p2.vat_id],
    ['s.weber@elektro-weber.de', 'personal', 'Stefan Weber', '+49 911 223344', 'Nürnberg', 'DE298765432'],
    'e.K.: osobný e-mail z Impressum je kontakt, Inhaber, PSČ za zvislou čiarou');

  const imp3 = S.htmlToText(`<p>Impressum</p><p>Bauunternehmung Schmidt GmbH &amp; Co. KG</p><p>Am Hafen 2, 28217 Bremen</p>
    <p>Persönlich haftende Gesellschafterin: Schmidt Verwaltungs GmbH, vertreten durch den Geschäftsführer Dr. Frank Schmidt</p>
    <p>E-Mail: datenschutz@schmidt-bau.de, bewerbung@schmidt-bau.de, zentrale@schmidt-bau.de</p><p>Tel.: 0421 / 33 44 55</p>`);
  const p3 = S.parseImpressum(imp3, { website: 'https://schmidt-bau.de' });
  eq([p3.company, p3.email, p3.contact_person, p3.address, p3.phone],
    ['Bauunternehmung Schmidt GmbH & Co. KG', 'zentrale@schmidt-bau.de', 'Dr. Frank Schmidt', 'Am Hafen 2', '+49 421 334455'],
    'GmbH & Co. KG: konateľ komplementára, zentrale@ pred datenschutz/bewerbung');

  const p4 = S.parseImpressum('Willkommen auf unserer Seite', { website: 'x.de' });
  eq([p4.email, p4.phone, p4.vat_id, p4.contact_person, p4.city], [null, null, null, null, null], 'prázdna stránka → nič si nevymyslí');
}

console.log('\nAI + IMPRESSUM');
{
  const ai = { name: 'Huber Trockenbau', website: 'https://huber-trockenbau.de', email: 'info@huber-trockenbau.de', phone: '08131 1', city: 'Dachau' };
  const imp = { company: 'Huber Trockenbau GmbH', email: 'kontakt@huber-trockenbau.de', email_kind: 'generic', phone: '+49 8131 55660',
    vat_id: 'DE812345678', contact_person: 'Josef Huber', postal_code: '85221', city: 'Dachau', address: 'Gewerbering 14' };
  const m = S.merge(ai, imp, { fetched: true, pageText: '' });
  eq([m.name, m.email, m.email_source, m.phone, m.vat_id, m.address], ['Huber Trockenbau GmbH', 'kontakt@huber-trockenbau.de', 'impressum',
    '+49 8131 55660', 'DE812345678', 'Gewerbering 14'], 'Impressum má prednosť, celý názov s právnou formou');
  const n = S.merge(ai, { email: null }, { fetched: true, pageText: 'Schreiben Sie an info@huber-trockenbau.de' });
  eq([n.email, n.email_source], ['info@huber-trockenbau.de', 'web'], 'e-mail od AI, ktorý je na webe → „web"');
  const o = S.merge(ai, { email: null }, { fetched: true, pageText: 'nič' });
  eq(o.email, null, 'e-mail od AI, ktorý na stiahnutom webe nie je → zahodí sa');
  const p = S.merge(ai, null, { fetched: false });
  eq([p.email, p.email_source], ['info@huber-trockenbau.de', 'ai'], 'web sa nedal stiahnuť → e-mail od AI so značkou „ai"');
  const q = S.merge({ ...ai, email: 'info@iny-web.de' }, null, { fetched: false });
  eq(q.email, null, 'e-mail od AI z cudzej domény sa neberie');
}

console.log('\nSKÓRE A DUPLICITY');
{
  eq([S.score(87.4), S.score(140), S.score(-5), S.score('x'), S.score(null), S.score('55')], [87, 100, 0, null, null, 55], 'skóre 0–100');
  eq(S.rank([{ name: 'B', score: 50 }, { name: 'A', score: 90 }, { name: 'C', score: 50, email: 'x@c.de' }, { name: 'D' }]).map(x => x.name),
    ['A', 'C', 'B', 'D'], 'zoradenie: skóre, potom s e-mailom');

  const found = [
    { name: 'Nová Firma GmbH', city: 'Ulm', website: 'https://nova-firma.de' },
    { name: 'Inak Napísaná', city: 'Ulm', website: 'https://www.mueller-bau.de/kontakt' },          // doména už je medzi firmami
    { name: 'Müller-Bau GmbH & Co. KG', city: 'Ulm', website: 'https://ina.de' },                   // meno + mesto
    { name: 'Müller Bau', city: 'Berlin', website: 'https://berlin-mueller.de' },                   // iné mesto → iná firma
    { name: 'GU Ulm', city: '', website: 'https://gu-ulm-neu.de' },                                 // odberateľ, mesto neznáme
    { name: 'Zadaná AG', website: 'https://shop.huber-trockenbau.de' },                             // zadaná firma
    { name: 'Odhlásená GmbH', website: 'https://odhlasena.de', email: 'info@odhlasena.de' },
    { name: 'Odhlásená doména', website: 'https://off-firma.de' },                                  // iný e-mail tej istej domény sa odhlásil
    { name: 'Freemail OK', website: 'https://freemail-ok.de', email: 'freemail@t-online.de' },      // odhlásený iný t-online neblokuje doménu
    { name: 'Nová Firma GmbH', city: 'Ulm', website: 'https://nova-firma.de/impressum' },           // dvakrát v tom istom výsledku
    { name: '', website: 'https://bezmena.de' },
  ];
  const d = S.dedupe(found, {
    leads: [{ name: 'Müller Bau GmbH', city: 'Ulm', website: 'mueller-bau.de' }],
    partners: [{ name: 'GU Ulm GmbH', city: 'Ulm', email: 'bau@gu-ulm.de' }],
    optouts: [{ email: 'info@odhlasena.de' }, { email: 'chef@off-firma.de' }, { email: 'iny@t-online.de' }],
    seeds: [{ url: 'https://huber-trockenbau.de/' }],
  });
  eq(d.fresh.map(x => x.name), ['Nová Firma GmbH', 'Müller Bau', 'Freemail OK'], 'ostanú len nové firmy');
  eq(d.known.map(k => k.why), ['už je medzi novými firmami', 'už je medzi novými firmami', 'už je odberateľ', 'je to zadaná firma',
    'odhlásila sa', 'odhlásila sa', 'dvakrát v tom istom výsledku', 'bez mena'], 'a pri každej vyradenej je dôvod');
}

console.log('\nRIADOK DO DATABÁZY');
{
  const seeds = [{ url: 'https://www.huber-trockenbau.de/', domain: 'huber-trockenbau.de' }];
  const r = S.toLead({
    name: '  Weber   Ausbau GmbH ', city: 'Augsburg', website: 'weber-ausbau.de/leistungen', email: 'INFO@weber-ausbau.de',
    email_source: 'impressum', score: 91.6, why: 'Robí suchú výstavbu ako Huber.', similar_to_url: 'huber-trockenbau.de',
    contact_person: 'Max Weber', impressum_url: 'https://weber-ausbau.de/impressum', vat_id: 'DE 123456789', employees: '20–50',
    region: 'Bayern', summary: 'Trockenbau, Akustikdecken', trade: 'Suchá výstavba',
  }, { searchId: 's1', seeds });
  eq([r.name, r.website, r.email, r.source, r.status, r.score, r.seed_search_id, r.vat_id, r.source_ref, r.country],
    ['Weber Ausbau GmbH', 'https://weber-ausbau.de', 'info@weber-ausbau.de', 'urls', 'new', 92, 's1', 'DE123456789',
      'https://weber-ausbau.de/impressum', 'DE'], 'očistené, zdroj „urls", skóre celé číslo');
  eq(r.profile, { summary: 'Trockenbau, Akustikdecken', similar_to_url: 'https://www.huber-trockenbau.de/', email_source: 'impressum', email_kind: 'generic' },
    'profil: zhrnutie, ktorej zadanej sa podobá, odkiaľ je e-mail');
  const z = S.toLead({ name: 'X', website: 'http://localhost', email: 'zly', similar_to_url: 'iny.de', vat_id: 'ATU123' }, { seeds });
  eq([z.website, z.email, z.profile.similar_to_url, z.vat_id, z.profile.email_source], [null, null, null, null, null],
    'nedovolený web, zlý e-mail, nezadaná firma ani cudzia DIČ sa neuložia');
  ok(S.toLead({ name: 'x'.repeat(500), why: 'y'.repeat(900) }).name.length === 200, 'dlhé texty sa orežú');
  eq(S.searchLabel({ kind: 'urls', created_at: '2026-10-30T10:00:00Z', seeds: [{ domain: 'a.de' }, { domain: 'b.de' }, { domain: 'c.de' }] }),
    '30. 10. · a.de, b.de +1', 'popis hľadania do filtra');
  eq(S.searchLabel({ kind: 'urls', params: { urls: ['https://x.de/', 'y.de'] } }), 'x.de, y.de', 'aj zo zadaných adries');
  eq(S.searchLabel({ kind: 'ai' }), 'podľa odberateľov', 'hľadanie podľa odberateľov');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
