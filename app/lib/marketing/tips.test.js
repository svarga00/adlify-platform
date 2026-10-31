// ============================================================================
// Testy: Odkazy od kolegov — čistá logika (tips.js)
// Spustenie:  node app/lib/marketing/tips.test.js
// ============================================================================
const T = require('./tips.js');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}

console.log('Odkaz → web, Mapy, profil');
{
  const w = T.normalize('www.Mueller-Bau.de/leistungen/?utm_source=fb&gclid=x&id=3#kontakt');
  eq([w.kind, w.url, w.domain], ['web', 'https://www.mueller-bau.de/leistungen?id=3', 'mueller-bau.de'], 'holá doména: https, bez sledovacích parametrov a kotvy, doména bez www');
  eq(T.normalize('http://shop.mueller-bau.de').domain, 'mueller-bau.de', 'http → https, subdoména → doména firmy');
  eq(T.normalize('http://mueller-bau.de').url, 'https://mueller-bau.de', 'http sa prepíše na https');
  eq(T.normalize('„mueller-bau.de".').url, 'https://mueller-bau.de', 'úvodzovky a bodka na konci sa odstránia');
  const e = T.normalize('info@mueller-bau.de');
  eq([e.kind, e.url], ['web', 'https://mueller-bau.de'], 'firemný e-mail = web firmy');
  ok(!T.normalize('max@gmx.de').ok, 'e-mail z bezplatnej schránky web neprezradí');
  const m = T.normalize('https://www.google.com/maps/place/M%C3%BCller+Bau+GmbH/@48.40,9.98,17z/data=!3d48.4011!4d9.9873?entry=ttu&g_ep=abc');
  eq([m.kind, m.name, m.lat, m.lng, /entry=|g_ep=/.test(m.url)], ['maps', 'Müller Bau GmbH', 48.4011, 9.9873, false], 'Google Mapy: meno a presné súradnice z adresy, bez sledovania');
  const s = T.normalize('https://maps.app.goo.gl/AbCdEf123');
  eq([s.kind, s.short, s.name], ['maps', true, null], 'skrátený odkaz z Máp sa rozpozná');
  eq(T.normalize('https://www.google.de/maps/search/?api=1&query=Schmidt+Ausbau+Ulm').name, 'Schmidt Ausbau Ulm', 'Mapy s hľadaním: meno z query');
  eq(T.normalize('https://www.google.com/maps/@48.1,11.5,15z').lat, 48.1, 'Mapy len so súradnicami');
  for (const u of ['https://www.linkedin.com/company/mueller-bau', 'facebook.com/muellerbau', 'https://www.northdata.de/M%C3%BCller+Bau+GmbH,+Ulm', 'xing.com/pages/mueller']) {
    eq(T.normalize(u).kind, 'profile', `profil nie je web firmy: ${u}`);
  }
  for (const [u, why] of [['localhost', 'lokálna'], ['http://127.0.0.1/admin', 'IP'], ['https://10.0.0.1', 'súkromná'], ['ftp://firma.de', 'schéma'],
    ['javascript:alert(1)', 'javascript'], ['https://user:pw@firma.de', 'heslo v adrese'], ['firma', 'bez domény'], ['https://firma.de:8080', 'port']]) {
    ok(!T.normalize(u).ok, `neplatný odkaz (${why}): ${u}`);
  }
  ok(!T.normalize(`https://firma.de/${'a'.repeat(1200)}`).ok, 'pridlhý odkaz');
}

console.log('\nRiadky formulára');
{
  const p = T.parseFirms([
    { company: '  Müller Bau GmbH ', link: 'mueller-bau.de', city: 'Ulm', relation: 'past_partner', what: 'Trockenbau Wohnpark', contact: 'Hr. Müller 0171', unsure: true },
    { company: 'Müller Bau', city: 'Ulm' },
    { company: 'Schmidt Ausbau', link: 'linkedin.com/company/schmidt', relation: 'via_denis' },
    { company: 'Weber', relation: 'nezmysel' },
    { company: '', link: '', what: '', contact: '' },
  ]);
  ok(p.ok, 'platné riadky prejdú', p.error);
  eq(p.firms.map(f => [f.company_name, f.kind, f.website, f.profile_url ? 'p' : '', f.relation]),
    [['Müller Bau GmbH', 'web', 'https://mueller-bau.de', '', 'past_partner'], ['Schmidt Ausbau', 'profile', null, 'p', 'via_denis'], ['Weber', 'none', null, '', null]],
    'web, profil aj firma len s menom; neznámy vzťah = neuvedené');
  eq(p.repeated, [1], 'tá istá firma (bez GmbH, rovnaké mesto) dvakrát sa zoberie raz');
  eq([p.firms[0].unsure, p.firms[0].what_we_did, p.firms[0].contact], [true, 'Trockenbau Wohnpark', 'Hr. Müller 0171'], 'nie som si istý, čo sme robili, kontakt');
  const bad = T.parseFirms([{ company: 'X', link: 'localhost' }, { company: 'OK GmbH' }]);
  eq([bad.ok, bad.errors.map(e => [e.i, e.field])], [false, [[0, 'company'], [0, 'link']]], 'chyby pri poliach s číslom riadku');
  ok(!T.parseFirms([]).ok && /aspoň jednu/.test(T.parseFirms([]).error), 'aspoň jedna firma');
  const many = T.parseFirms(Array.from({ length: 21 }, (_, i) => ({ company: `Firma ${i} GmbH` })));
  ok(!many.ok && /najviac 20/.test(many.error), 'najviac 20 firiem naraz', many.error);
  eq(T.parseFirms([{ company: 'A'.repeat(500) }]).firms[0].company_name.length, 200, 'dĺžka mena obmedzená');
}

console.log('\nUž ju máme?');
{
  const leads = [{ id: 'l1', name: 'Maier Innenausbau GmbH', city: 'Augsburg', website: 'https://www.maier-ausbau.de' },
    { id: 'l2', name: 'Huber Bau', city: 'München', email: 'info@huber-bau.de' }, { id: 'l3', name: 'Gmail Firma', email: 'firma@gmail.com' }];
  const partners = [{ id: 'p1', name: 'GU Ulm GmbH', city: 'Ulm', website: 'gu-ulm.de' }];
  const tips = [{ id: 't1', company_name: 'Keller Akustik', city: 'Ulm', domain: 'keller.de', submitted_by_name: 'Jano' },
    { id: 't2', company_name: 'Odmietnutá GmbH', status: 'rejected' }];
  const k = { leads, partners, tips };
  const d = (f) => { const x = T.duplicateOf(f, k); return x && [x.kind, x.id]; };
  eq(d({ company_name: 'Iné meno', domain: 'maier-ausbau.de' }), ['lead', 'l1'], 'doména webu medzi novými firmami');
  eq(d({ company_name: 'Iné meno', domain: 'huber-bau.de' }), ['lead', 'l2'], 'doména firemného e-mailu');
  eq(d({ company_name: 'X', domain: 'gmail.com' }), null, 'bezplatná schránka nie je zhoda');
  eq(d({ company_name: 'GU Ulm', city: 'Ulm' }), ['partner', 'p1'], 'meno odberateľa (bez GmbH) a mesto');
  eq(d({ company_name: 'GU Ulm' }), ['partner', 'p1'], 'meno bez mesta stačí');
  eq(d({ company_name: 'GU Ulm', city: 'Hamburg' }), null, 'rovnaké meno v inom meste nie je tá istá firma');
  eq(d({ company_name: 'Keller Akustik GmbH' }), ['tip', 't1'], 'skorší odkaz od kolegu (meno)');
  eq(d({ company_name: 'Iné', domain: 'keller.de' }), ['tip', 't1'], 'skorší odkaz od kolegu (doména)');
  eq(d({ company_name: 'Odmietnutá' }), null, 'zamietnutý odkaz nebráni novému');
  eq(d({ company_name: 'Úplne nová GmbH', domain: 'nova.de' }), null, 'nová firma');
  eq(d({ company_name: 'Iné', kind: 'maps', maps: { name: 'Huber Bau' } }), ['lead', 'l2'], 'Mapy: meno z odkazu');
  eq(T.duplicateOf({ company_name: 'GU Ulm' }, k).why, 'už je náš odberateľ', 'dôvod pre kolegu');
}

console.log('\nRebríček');
{
  const tips = [
    { id: 'a', submitted_by_name: 'Jano', status: 'added', lead_id: 'L1', created_at: '2026-10-30' },
    { id: 'b', submitted_by_name: 'jano ', status: 'duplicate', created_at: '2026-10-31' },
    { id: 'c', submitted_by_name: 'Michal', status: 'new', created_at: '2026-10-31' },
    { id: 'd', submitted_by_name: 'Michal', status: 'new', created_at: '2026-10-31' },
    { id: 'e', submitted_by_name: 'Michal', status: 'rejected', created_at: '2026-10-31' },
    { id: 'f', submitted_by_name: 'Zuzka', status: 'added', lead_id: 'L2', created_at: '2026-10-29' },
    { id: 'g', submitted_by_name: 'Ignác', status: 'new', archived_at: '2026-10-31' },
  ];
  const board = T.leaderboard(tips, [{ id: 'L1', status: 'won' }, { id: 'L2', status: 'new' }]);
  eq(board.map(r => [r.name, r.tips, r.fresh, r.added, r.won]), [['jano', 2, 1, 1, 1], ['Zuzka', 1, 1, 1, 0], ['Michal', 3, 2, 0, 0]],
    'odberatelia > pridané > nové > spolu; „Jano" a „jano " je jeden kolega; archivované sa nerátajú');
  eq([T.rankOf(board, 'Michal'), T.rankOf(board, 'JANO'), T.rankOf(board, 'Nikto')], [3, 1, 0], 'poradie v tíme');
}

console.log('\nNová firma z odkazu');
{
  const tip = { id: 't9', company_name: 'Maier Innenausbau', city: 'Augsburg', kind: 'web', url: 'https://www.maier-ausbau.de/referenzen', website: 'https://www.maier-ausbau.de',
    relation: 'past_partner', what_we_did: 'Trockenbau, Wohnpark Feuerbach 2024', contact: 'Hr. Maier 0171 222', unsure: false,
    submitted_by_name: 'Jano', created_at: '2026-10-31T08:00:00Z', checked_at: '2026-10-31T08:01:00Z',
    meta: { checked: true, company: 'Maier Innenausbau GmbH', email: 'info@maier-ausbau.de', phone: '+49 821 1', postal_code: '86150', city: 'Augsburg',
      konatel: 'Hans Maier', vat_id: 'DE123456789', logo: 'https://www.maier-ausbau.de/logo.png', title: 'Startseite | Maier Innenausbau GmbH', description: 'Trockenbau in Augsburg' } };
  const r = T.tipToLead(tip, { by: 'u1', now: new Date('2026-10-31T09:00:00Z') });
  eq([r.name, r.website, r.email, r.city, r.contact_person, r.vat_id, r.source, r.source_tip_id, r.tip_by],
    ['Maier Innenausbau GmbH', 'https://www.maier-ausbau.de', 'info@maier-ausbau.de', 'Augsburg', 'Hans Maier', 'DE123456789', 'kolega', 't9', 'Jano'],
    'meno z Impressum (s GmbH), web, e-mail, konateľ, zdroj kolega');
  ok(/Tip od: Jano, 31\. 10\./.test(r.notes) && /Vzťah: Spolupracovali sme/.test(r.notes) && /Čo sme spolu robili: Trockenbau/.test(r.notes) && /Kontakt: Hr\. Maier/.test(r.notes),
    'história do poznámok firmy', r.notes);
  eq([r.relevance, r.relevance_note, r.relevance_by, r.relevance_at], [1, 'Tip od kolegu: spolupráca v minulosti', 'u1', '2026-10-31T09:00:00.000Z'],
    'firma, s ktorou sme robili = palec hore (učenie)');
  eq([r.logo_url, r.site_checked_at], ['https://www.maier-ausbau.de/logo.png', '2026-10-31T08:01:00Z'], 'logo a čas kontroly webu');
  eq(T.tipToLead({ ...tip, relation: 'via_denis' }).relevance_note, 'Tip od kolegu: robilo sa u Denisa', 'u Denisa');
  eq(T.tipToLead({ ...tip, relation: 'relevant' }).relevance, undefined, 'len relevantná = bez palca');
  const prof = T.tipToLead({ id: 'x', company_name: 'Schmidt Ausbau', kind: 'profile', url: 'https://linkedin.com/company/s', profile_url: 'https://linkedin.com/company/s', submitted_by_name: 'Zuzka' });
  eq([prof.name, prof.website, /Profil \/ Mapy: https:\/\/linkedin/.test(prof.notes)], ['Schmidt Ausbau', null, true], 'profil: bez webu, odkaz v poznámke');
  const map = T.tipToLead({ id: 'y', company_name: 'Huber', kind: 'maps', meta: { lat: 48.1, lng: 11.5 }, submitted_by_name: 'Z' });
  eq([map.lat, map.lng], [48.1, 11.5], 'Mapy: poloha');
  eq(T.tipToLead({ company_name: '' }), null, 'bez mena nič');
  eq(T.nameFromTitle('Startseite | Müller Bau GmbH – Trockenbau in Ulm'), 'Müller Bau GmbH', 'titulok webu → meno');
  eq(T.nameFromTitle('Home'), null, 'všeobecný titulok nie je meno');
}

console.log('\nOdkaz pre kolegov');
{
  let n = 0;
  const tok = T.makeToken((b) => { for (let i = 0; i < b.length; i++) b[i] = (n++ * 37) & 255; });
  ok(/^[a-f0-9]{48}$/.test(tok) && T.tokenOk(tok), 'kľúč 48 hex znakov', tok);
  ok(!T.tokenOk('kratky') && !T.tokenOk('a'.repeat(31)) && !T.tokenOk('<script>'.repeat(5)), 'krátky alebo divný kľúč neplatí');
  eq(T.linkFor('https://adlify-app.netlify.app/', 'abc'), 'https://adlify-app.netlify.app/app/odkazy.html#t=abc', 'kľúč je v kotve, nie v adrese');
  const msg = T.shareText('https://x/app/odkazy.html#t=abc');
  ok(msg.startsWith('Ahojte, mám pre vás bojovú úlohu.') && msg.includes('Zapisujte sem: https://x/app/odkazy.html#t=abc') && !msg.includes('[ODKAZ') && msg.endsWith('Vďaka.'),
    'správa od majiteľa so skutočným odkazom', msg);
  ok(/^https:\/\/wa\.me\/\?text=Ahojte%2C/.test(T.whatsappUrl(msg)), 'WhatsApp s textom');
  eq(T.searchUrl({ company_name: 'Müller Bau', city: 'Ulm' }), 'https://www.google.com/search?q=M%C3%BCller%20Bau%20Ulm', 'Nájsť web = Google hľadanie mena a mesta');
  eq([T.addedText(1), T.addedText(3), T.addedText(7)], ['pridaná 1 firma', 'pridané 3 firmy', 'pridaných 7 firiem'], 'skloňovanie');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
