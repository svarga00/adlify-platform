// ============================================================================
// Testy balíka papierov na nástup
// Spustenie:  node app/lib/documents/bundle.test.js
// ============================================================================
// Balík je jedna správa namiesto piatich. Stráži sa tu, aby v nej bolo to
// podstatné aj bez otvorenia PDF, aby SMS nebola román, aby sa vykalo
// a aby v nej nebolo nič, čo človek nemá vidieť (emoji, „undefined").
// ============================================================================
global.window = global;
const B = require('./bundle.js');
const A = require('./archive.js');

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

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{25A0}-\u{25FF}]/u;
const TYKA = /(?<!\p{L})(tvoj\p{L}*|máš|zavolaj|pošli|si vezmi|budeš|nástupíš|ťa|ti|teba|nemáš|môžeš|musíš|ozvi)(?!\p{L})/iu;

const SUP = { name: 'Partner und Service s. r. o.', brand: 'punds', phone: '+421 910 523 858', email: 'info@punds.eu' };
const BASE = {
  worker: { full_name: 'Ján Novák', phone: '+421 900 111 111', email: 'jan@novak.sk' },
  subcontract: { title: 'Wohnpark Feuerbach', site_address: 'Stuttgarter Str. 40', site_city: 'Stuttgart',
    work_start: '07:00', meeting_point: 'Brána B, bunka vedľa žeriavu',
    site_contact_name: 'Polier Klaus Berger', site_contact_phone: '+49 171 1234567', date_from: '2026-11-01' },
  assignment: { date_from: '2026-11-02' },
  lodging: { name: 'Pension Lerche', address: 'Lerchenstr. 8', city: 'Stuttgart' },
  items: [
    { title: 'Vzor faktúry', kind: 'invoice_guide' },
    { title: 'Infolist na stavbu', kind: 'infolist' },
    { title: 'Objednávka OBJ-12', kind: 'objednavka' },
    { title: 'Infolist k ubytovaniu', kind: 'infolist_lodging' },
  ],
  link: 'https://punds.eu/b/AbCdEfGhIjKlMnOpQrStUvWx',
  supplier: SUP,
};
const CREW = { crew: { name: 'Partia Malý', phone: '' }, contact: null, people: [
  { name: 'Adam Bača', phone: '+421 900 333 333', role: 'predák', leader: true },
  { name: 'Peter Malý', phone: '+421 900 222 222', role: 'člen partie', leader: false }] };
const KONTAKT = { crew: null, people: [], contact: { name: 'Zoltán Kiss', phone: '+36 30 444 4444', note: 'robí tam od augusta' } };

console.log('\nČO MÔŽE BYŤ V BALÍKU');
{
  eq(B.ITEMS.map(i => i.key), ['infolist', 'ubytovanie', 'objednavka', 'vzor_faktury', 'zmluva', 'gdpr'],
    'poradie: najprv kam a kedy, papiere na podpis na koniec');
  ok(B.ITEMS.every(i => A.KINDS[i.kind]), 'každý druh existuje v archíve',
    B.ITEMS.filter(i => !A.KINDS[i.kind]).map(i => i.kind).join(', '));
  eq(A.groupOf('infolist_lodging'), 'infolisty', 'infolist k ubytovaniu je medzi infolistami');
  eq(A.groupOf('invoice_guide'), 'infolisty', 'aj vzor faktúry');
  eq(A.label('infolist_lodging'), 'Infolist k ubytovaniu', 'a má slovenský názov');
  eq(B.itemOf('invoice_guide').key, 'vzor_faktury', 'definícia sa nájde podľa druhu');
  eq(B.order(BASE.items).map(i => i.kind), ['infolist', 'infolist_lodging', 'objednavka', 'invoice_guide'],
    'prílohy sa zoradia');
}

console.log('\nODKAZ');
{
  const t = B.token();
  eq(t.length, 24, '24 znakov');
  ok(/^[A-Za-z0-9_-]{24}$/.test(t), 'len znaky, ktoré do adresy patria');
  const many = new Set(Array.from({ length: 500 }, () => B.token()));
  eq(many.size, 500, 'neopakujú sa');
}

console.log('\nE-MAIL');
{
  const m = B.texts({ ...BASE, colleagues: CREW });
  ok(/Papiere na nástup — Wohnpark Feuerbach, od 2\. 11\./.test(m.subject), 'predmet: čo, kde a odkedy', m.subject);
  ok(m.email.startsWith('Dobrý deň, Ján,'), 'oslovenie krstným menom');
  ok(/Nástup: pondelok 2\. 11\. 2026 o 07:00/.test(m.email), 'nástup s dňom v týždni a časom (dátum z nasadenia)');
  ok(/Stavba: Wohnpark Feuerbach, Stuttgarter Str\. 40, Stuttgart/.test(m.email), 'stavba');
  ok(/Kde sa hlásiť: Brána B/.test(m.email) && /Za kým ísť: Polier Klaus Berger, \+49 171 1234567/.test(m.email),
    'kde sa hlásiť a za kým ísť');
  ok(/Ubytovanie: Pension Lerche, Lerchenstr\. 8, Stuttgart/.test(m.email), 'adresa ubytovania');
  ok(/Vaša partia: Partia Malý: Adam Bača \(predák\), tel\. \+421 900 333 333; Peter Malý/.test(m.email),
    'partia s predákom a telefónmi');
  const zoznam = m.email.split('V prílohe:')[1] || '';
  ok(zoznam.indexOf('Infolist na stavbu') < zoznam.indexOf('Infolist k ubytovaniu')
    && zoznam.indexOf('Infolist k ubytovaniu') < zoznam.indexOf('Vzor faktúry'), 'prílohy sú vymenované v poradí', zoznam);
  ok(/• Objednávka OBJ-12/.test(m.email), 's ich názvami');
  ok(m.email.includes(BASE.link), 'odkaz aj v e-maile — keby sa prílohy neotvorili');
  ok(/zavolajte nám: \+421 910 523 858/.test(m.email), 'naše číslo');
  ok(/S pozdravom$/.test(m.email), 'podpis pridá schránka');

  const k = B.texts({ ...BASE, colleagues: KONTAKT });
  ok(/Kontaktná osoba na stavbe: Zoltán Kiss, tel\. \+36 30 444 4444 \(robí tam od augusta\)/.test(k.email),
    'kto nie je v partii, dostane kontaktnú osobu', k.email);
  ok(!/partia/i.test(k.email), 'a nepíše sa o partii');
}

console.log('\nWHATSAPP');
{
  const w = B.texts({ ...BASE, colleagues: CREW }).whatsapp;
  ok(/\*Nástup:\* pondelok 2\. 11\. 2026 o 07:00/.test(w), 'tučné popisky');
  ok(w.includes('\n'), 'zalomené riadky');
  eq((w.match(/https?:\/\//g) || []).length, 1, 'jediný odkaz');
  ok(/\*Všetky papiere \(4\):\*\n/.test(w), 'koľko papierov je za odkazom');
  ok(/Infolist na stavbu, Infolist k ubytovaniu, Objednávka OBJ-12, Vzor faktúry/.test(w), 'a ktoré');
  ok(/\*Vaša partia:\* Partia Malý/.test(w), 'partia');
  ok(/\*Kontakt na stavbe:\* Zoltán Kiss/.test(B.texts({ ...BASE, colleagues: KONTAKT }).whatsapp), 'kontaktná osoba');
  ok(/punds$/.test(w), 'podpis značkou');
}

console.log('\nSMS');
{
  const s = B.texts({ ...BASE, colleagues: KONTAKT }).sms;
  ok(s.length <= 300, `najviac 300 znakov (${s.length})`);
  ok(s.includes(BASE.link), 'odkaz je v nej');
  ok(/Nástup 2\. 11\. o 07:00, Stuttgart\./.test(s), 'kedy a kam', s);
  ok(/Na stavbe: Zoltán Kiss \+36 30 444 4444/.test(s), 'komu na stavbe zavolať');
  ok(/Otázky: \+421 910 523 858/.test(s), 'a nám');
  ok(!s.includes('\n'), 'jeden riadok');
  const sp = B.texts({ ...BASE, colleagues: CREW }).sms;
  ok(/Na stavbe: Adam Bača/.test(sp), 'v partii je kontaktom predák');

  // Dlhé názvy: SMS sa skráti, ale odkaz a nástup zostanú.
  const dlhe = B.texts({ ...BASE, colleagues: KONTAKT,
    worker: { full_name: 'Maximilián-Konštantín Dlhomenný' },
    subcontract: { ...BASE.subcontract, site_city: 'Neustadt an der Weinstraße'.repeat(4) },
    link: `https://punds.eu/b/${'x'.repeat(150)}`, supplier: { ...SUP, brand: 'Partner und Service s. r. o. — dlhý názov' } }).sms;
  ok(dlhe.length <= 300, `aj s dlhými údajmi najviac 300 znakov (${dlhe.length})`);
  ok(dlhe.includes('x'.repeat(150)), 'odkaz sa nikdy neskracuje', dlhe);
}

console.log('\nVYKANIE, EMOJI, CHÝBAJÚCE ÚDAJE');
{
  for (const kol of [CREW, KONTAKT, null]) {
    const t = B.texts({ ...BASE, colleagues: kol });
    for (const k of ['subject', 'email', 'whatsapp', 'sms']) {
      ok(!EMOJI.test(t[k]), `${k}: bez emoji`);
      ok(!TYKA.test(t[k]), `${k}: vyká`, (t[k].match(TYKA) || [])[0]);
    }
  }
  const prazdne = B.texts({});
  ok(Object.values(prazdne).every(x => typeof x === 'string' && !/undefined|null|NaN/.test(x)),
    'prázdny vstup nevyrobí „undefined"', JSON.stringify(prazdne));
  ok(prazdne.email.startsWith('Dobrý deň,'), 'bez mena len „Dobrý deň,"');
  ok(!/Nástup:/.test(prazdne.email) && !/Ubytovanie:/.test(prazdne.email), 'chýbajúci údaj sa nevymýšľa');
  const bezNasadenia = B.texts({ ...BASE, assignment: {}, start: null });
  ok(/nedeľa 1\. 11\. 2026/.test(bezNasadenia.email), 'bez dátumu nasadenia platí začiatok zákazky');
  const bezUbytovania = B.texts({ ...BASE, lodging: null });
  ok(!/Ubytovanie/.test(bezUbytovania.email), 'bez ubytovania sa o ňom nepíše');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
