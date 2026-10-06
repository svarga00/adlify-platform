// ============================================================================
// Testy dokumentov
// Spustenie:  node app/lib/documents/templates.test.js
// ============================================================================
// Dokumenty doteraz testoval len prehliadač — či sa vôbec vykreslia. To je
// málo: dokument, ktorý sa vykreslí, ale je v ňom zlé číslo alebo zlá veta,
// odíde odberateľovi rovnako ochotne ako ten správny.
//
// Najviac na tom záleží pri zmluve. Je to jediný papier, ktorý pri kontrole
// obhajuje celý model — a zároveň jediný, ktorý sa podpisuje perom.
// ============================================================================
global.window = global;
const fs = require('fs');
const path = require('path');
const P = require('./templates');

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}

const SUPPLIER = { name: 'Partner und Service s. r. o.', email: 'info@ps.sk',
  address: 'Podzámska 9468/4A', city: '940 71 Nové Zámky', ico: '55667788' };
const CLIENT = { name: 'Bauunternehmen Vogel GmbH', vat_id: 'DE811234567', country: 'DE' };
const BASE = {
  contract_number: 'ZML-2026-0007', title: 'Trockenbau Wohnpark',
  scope: 'Lieferung und Montage von Trockenbauwänden.',
  site_name: 'Wohnpark Feuerbach', site_city: 'Stuttgart', site_address: 'Feuerbacher Weg 12',
  date_from: '2026-10-01', date_to: '2027-03-31', payment_terms_days: 30,
};
const doc = (c = {}, amendments = []) => P.werkvertrag({
  contract: { ...BASE, ...c }, client: CLIENT, supplier: SUPPLIER, amendments });

console.log('Dokumenty');

// ── Zmluva je zmluva, nie faktúra ───────────────────────────────────────────
{
  const h = doc({ price_model: 'fixed', fixed_price: 48000 });
  ok(h.includes('Werkvertrag'), 'dokument sa volá Werkvertrag');
  ok(h.includes('ZML-2026-0007'), 'a nesie číslo zmluvy');
  ok(h.includes('Auftragnehmer') && h.includes('Auftraggeber'),
    'strany sú po nemecky');
  ok(h.includes('Wohnpark Feuerbach') && h.includes('Stuttgart'),
    'miesto plnenia je v ňom');

  // Papier, ktorý sa podpisuje, nesmie mať v pätičke „platné bez podpisu".
  ok(!h.includes('platné bez podpisu'),
    'v pätičke nie je veta o tom, že podpis netreba');
  ok(h.includes('Ausfertigungen'), 'ale to, že sú dve rovnopisy');
  ok((h.match(/class="sig"/g) || []).length === 2, 'sú v ňom dva podpisové riadky');
}

// ── Cena podľa toho, ako je dohodnutá ───────────────────────────────────────
{
  const fix = doc({ price_model: 'fixed', fixed_price: 48000 });
  ok(fix.includes('Pauschalpreis'), 'pevná cena je Pauschalpreis');
  ok(/48\s*000,00/.test(fix), 'a je v nej suma so slovenským formátom',
    'nenašiel som 48 000,00');
  ok(fix.includes('13b UStG'), 'so zmienkou o prenose daňovej povinnosti');

  const unit = doc({ price_model: 'unit', unit_price: 24.5, unit_label: 'm²' });
  ok(unit.includes('Einheitspreis') && unit.includes('m²'),
    'cena za jednotku aj s jednotkou');
  ok(unit.includes('Aufmaß'), 'a povie sa, že sa meria spoločne');

  // Hodinová sadzba v zmluve o dielo je riziko. Dokument ju nezakrýva, ale
  // doplní vetu, ktorá hovorí, čím tá sadzba je a čím nie je.
  const hod = doc({ price_model: 'hourly', charge_rate: 31.5 });
  ok(hod.includes('Verrechnungssatz'), 'hodinová je Verrechnungssatz');
  ok(hod.includes('kein Weisungsrecht'),
    'a je pri nej veta, že nezakladá právo dávať pokyny');
}

// ── Čo chráni model pred kontrolou ──────────────────────────────────────────
{
  const h = doc({ price_model: 'fixed', fixed_price: 10000 });
  for (const veta of ['A1-Bescheinigung', 'selbständige Unternehmer',
    'nicht um Arbeitnehmerüberlassung', 'Bau-Mindestlohn']) {
    ok(h.includes(veta), `v zmluve je „${veta}"`);
  }
}

// ── Dodatky sa v nemeckej zmluve nepíšu po slovensky ────────────────────────
// Dôvod dodatku si píšeme pre seba („Rozšírenie o 3. NP"). Do dokumentu, ktorý
// číta odberateľ, patrí nemecký názov zmeneného poľa — a hodnota v tvare,
// v akom bola dohodnutá, nie v akom je v databáze.
{
  const h = doc({ price_model: 'fixed', fixed_price: 52000 }, [
    { amendment_number: 'Dodatok č. 1', field: 'fixed_price', new_value: '52000',
      reason: 'Rozšírenie o 3. NP.', signed_at: '2026-11-05' },
    { amendment_number: 'Dodatok č. 2', field: 'date_to', new_value: '2027-06-30',
      reason: 'Predĺženie stavby.', signed_at: null },
  ]);
  ok(h.includes('Nachträge'), 'dodatky sú v dokumente');
  ok(h.includes('Pauschalpreis') && h.includes('Ausführungszeit'),
    'a sú pomenované po nemecky');
  ok(!h.includes('Rozšírenie o 3. NP'),
    'náš slovenský dôvod sa do nemeckej zmluvy nedostane');
  ok(/52\s*000,00/.test(h), 'suma je naformátovaná, nie surová');
  ok(h.includes('30. 06. 2027') || h.includes('30.06.2027'),
    'aj dátum je dátum, nie 2027-06-30');
  ok(h.includes('05. 11. 2026') || h.includes('05.11.2026'),
    'a je vidieť, ktorý dodatok je podpísaný');
}

// ── Prázdne polia nesmú vyrobiť prázdne paragrafy ───────────────────────────
{
  const h = P.werkvertrag({
    contract: { contract_number: 'ZML-1', title: 'Bez ničoho' },
    client: CLIENT, supplier: SUPPLIER });
  ok(h.length > 1000, 'zmluva bez vyplnených polí sa aj tak vykreslí');
  ok(!h.includes('§ 6 '), 'bez záruky sa paragraf o záruke nevykreslí');
  ok(!h.includes('§ 7 '), 'ani o zmluvnej pokute');
  ok(!h.includes('§ 8 '), 'ani o výpovedi');
  ok(h.includes('§ 9'), 'ale paragraf o postavení osôb tam je vždy');
  ok(h.includes('noch nicht beschrieben'),
    'a chýbajúci predmet diela sa prizná, nie zamlčí');
}

// ── Appka a databáza musia chrániť tie isté polia ───────────────────────────
// Na podpísanej zmluve sa dohodnuté podmienky menia dodatkom. Zoznam je
// v triggeri (migrácia 036) aj v module zmlúv. Keby sa rozišli, appka by
// ponúkla úpravu, ktorú databáza odmietne — alebo, horšie, needitovala by
// pole, ktoré databáza chrániť prestala.
{
  const dir = path.join(__dirname, '..', '..', 'database', 'migrations');
  const sql = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
    .map(f => fs.readFileSync(path.join(dir, f), 'utf8'))
    .filter(x => /function danubra_contract_needs_amendment\(/.test(x))
    .pop();
  ok(sql, 'chránené polia sú v migráciách');

  const m = /foreach f in array array\[([\s\S]*?)\]/.exec(sql || '');
  ok(m, 'a dajú sa z triggeru prečítať');
  const zSql = (m ? m[1] : '').split(',')
    .map(x => x.trim().replace(/'/g, '')).filter(Boolean).sort();

  const js = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'modules', 'contracts.js'), 'utf8');
  const blok = /const LOCKED = \[([\s\S]*?)\];/.exec(js);
  ok(blok, 'a v module zmlúv tiež');
  const zJs = [...(blok ? blok[1] : '').matchAll(/\['([a-z_]+)',/g)]
    .map(x => x[1]).sort();

  eq(zJs, zSql, 'appka chráni presne tie polia, ktoré chráni databáza');
}

// ── Faktúra ─────────────────────────────────────────────────────────────────
// Dva prípady, ktoré stáli peniaze a na doklade ich nebolo vidieť.
{
  const supplier = { name: 'DANUBRA s.r.o.', iban: 'SK12 1100 0000 0029 1234 5678',
    company_id: '55 123 456', vat_id: 'SK2120123456' };
  const de = { name: 'Vogel GmbH', country: 'DE', vat_id: 'DE812345678' };
  const sk = { name: 'Niekto s.r.o.', country: 'SK' };
  const polozky = [{ description: 'Trockenbau', quantity: 160, unit: 'h',
    unit_price: 33, total: 5280 }];

  // 1. Zrážka §48b sa musí objaviť na doklade — odberateľ zráža 15 % a odvádza
  //    ich nemeckému úradu, takže na účet príde menej. Bez rozpisu to vyzerá
  //    ako nedoplatok a dohaduje sa to až pri urgencii.
  const so = P.invoice({
    invoice: { invoice_number: '2026014', total: 5280, amount_net: 4488,
      withholding_amount: 792, withholding_pct: 15, currency: 'EUR',
      issue_date: '2026-09-30', due_date: '2026-10-30' },
    items: polozky, client: de, supplier,
  });
  ok(so.includes('5.280,00'), 'na faktúre je fakturovaná suma — v nemeckom tvare');
  ok(so.includes('792,00'), 'aj zrážka §48b — predtým na doklade vôbec nebola');
  ok(so.includes('4.488,00'), 'aj suma, ktorá sa naozaj prevedie');
  ok(/Bauabzugsteuer/.test(so), 'zrážka má nemecký názov, nie opis');
  ok(/Freistellungsbescheinigung/.test(so),
    'a je vysvetlené, prečo sa zráža — to je prvá otázka odberateľa');
  // Suma na prevod nesmie byť celá faktúra. Toto je ten rozdiel, pre ktorý
  // by odberateľ poslal o 792 € viac a vracalo by sa to.
  const platba = so.slice(so.indexOf('Zahlungsinformationen'));
  ok(platba.includes('4.488,00'), 'v platobných údajoch je suma po zrážke');
  ok(!platba.includes('5.280,00'), 'a nie celá fakturovaná suma');

  // 2. Bez zrážky sa nič navyše nekreslí — prázdny riadok „zrážka 0 €" by
  //    len mýlil.
  const bez = P.invoice({
    invoice: { invoice_number: '2026015', total: 1000, currency: 'EUR' },
    items: polozky, client: de, supplier,
  });
  ok(!/Bauabzugsteuer/.test(bez), 'bez zrážky sa o nej nepíše');
  ok(bez.includes('1.000,00'), 'a na úhradu je celá suma');

  // 3. Jazyk sa riadi krajinou odberateľa — rovnako ako ponuka a zmluva.
  ok(/Rechnung/.test(so) && !/>Faktúra</.test(so),
    'nemeckému odberateľovi ide faktúra po nemecky');
  ok(/Auftraggeber/.test(so), 'aj popisky strán');
  const slovenska = P.invoice({
    invoice: { invoice_number: '2026016', total: 1000, currency: 'EUR' },
    items: polozky, client: sk, supplier,
  });
  ok(/Faktúra/.test(slovenska), 'slovenskému po slovensky');
  ok(/Variabilný symbol/.test(slovenska), 'aj platobné údaje');
  ok(slovenska.includes('1\u00a0000,00'),
    'a slovenský doklad má slovenský tvar čísel — s nezlomiteľnou medzerou');
  ok(/Verwendungszweck/.test(so), 'a po nemecky je to Verwendungszweck');
  // Dá sa prebiť — odberateľ v Rakúsku môže chcieť nemecký doklad aj tak.
  ok(/Rechnung/.test(P.invoice({
    invoice: { invoice_number: 'x', total: 1, currency: 'EUR' },
    items: [], client: sk, supplier, lang: 'de' })), 'jazyk sa dá určiť ručne');

  // Rozpad sumy je vlastná funkcia, lebo ju potrebuje aj QR kód.
  eq(P.payable({ total: 5280, amount_net: 4488, withholding_amount: 792 }),
    { total: 5280, held: 792, net: 4488 }, 'rozpad sumy');
  eq(P.payable({ total: 1000 }), { total: 1000, held: 0, net: 1000 },
    'bez zrážky je na úhradu celá suma');
  eq(P.payable({ total: 5280, withholding_amount: 792 }),
    { total: 5280, held: 792, net: 4488 }, 'keď chýba amount_net, dopočíta sa');
  eq(P.payable({}), { total: 0, held: 0, net: 0 }, 'prázdna faktúra nespadne');
}

// ── Infolist na stavbu ──────────────────────────────────────────────────────
{
  const zaklad = {
    worker: { full_name: 'Ján Novák' },
    assignment: { date_from: '2026-10-12' },
    subcontract: { title: 'Wohnpark', contract_number: 'ZAK-1',
      site_address: 'Stuttgarter Str. 40', site_city: 'Stuttgart',
      work_start: '07:00', meeting_point: 'Brána B',
      site_contact_name: 'Polier Berger', site_contact_phone: '+49 171 1234567' },
    partner: { name: 'Vogel GmbH' },
    supplier: { name: 'DANUBRA s.r.o.', phone: '+421 900 000 000' },
    trade: 'Trockenbau',
  };
  const h = P.siteSheet({ ...zaklad, lodging: null });

  ok(/Infolist na stavbu/.test(h), 'dokument sa volá podľa toho, načo je');
  ok(h.includes('Ján Novák'), 'a je na ňom, pre koho je');
  ok(/12\. 10\. 2026/.test(h),
    'dátum je po slovensky, nie 2026-10-12 — papier číta človek, nie databáza');
  ok(/Brána B/.test(h) && /Polier Berger/.test(h), 'kam a za kým');
  ok(/Ich bin Subunternehmer/.test(h), 'nemecké vety sú na ňom');
  ok(/A1-Bescheinigung/.test(h), 'vrátane tej o dokladoch');
  ok(/Stundennachweis/.test(h), 'je vysvetlené, čo sa podpisuje');
  ok(/Nepodpisuj nič iné/.test(h), 'a čo nie — to je to, kvôli čomu infolist je');
  ok(/112/.test(h), 'pri úraze je číslo, nie odkaz na niekoho');
  ok(/maps/.test(h), 'adresa stavby má odkaz na mapu');

  // Chýbajúci údaj sa na papieri **nevynechá potichu**.
  const dieravy = P.siteSheet({ ...zaklad, lodging: null,
    subcontract: { ...zaklad.subcontract, meeting_point: null, site_contact_name: null,
      site_contact_phone: null } });
  ok(/Nie je zapísané, kde presne/.test(dieravy),
    'chýbajúce miesto stretnutia je na papieri napísané');
  ok(/Spýtaj sa u nás/.test(dieravy), 'aj to, čo s tým má človek spraviť');
  ok(/todo/.test(dieravy), 'a je to zvýraznené, nie schované v texte');

  // Ubytovanie: keď je, patrí naň aj to, čo platí v dome.
  const sUbytovanim = P.siteSheet({ ...zaklad,
    lodging: { name: 'Pension Lerche', address: 'Lerchenstr. 8', city: 'Stuttgart',
      keys_note: 'Kľúče u správcu.', house_rules: 'Nočný pokoj 22:00–06:00.' } });
  ok(/Pension Lerche/.test(sUbytovanim), 'adresa ubytovania');
  ok(/Kľúče u správcu/.test(sUbytovanim), 'kde sú kľúče');
  ok(/Nočný pokoj/.test(sUbytovanim), 'a čo v dome platí');

  // Bez údajov o firme nesmie vzniknúť veta o firme, ktorú nepoznáme.
  const bezFirmy = P.siteSheet({ worker: {}, assignment: {}, subcontract: {},
    partner: null, lodging: null, supplier: {} });
  ok(!/undefined|null/.test(bezFirmy.replace(/null"/g, '')),
    'prázdny vstup nevyrobí „undefined" na papieri');
  ok(!/arbeite für/.test(bezFirmy), 'ani sľub firmy, ktorú nepoznáme');
}

// ── Objednávka ──────────────────────────────────────────────────────────────
// Objednávka živnostníkovi je doklad, ktorý pri kontrole odpovedá na otázku,
// čo presne mal ten človek urobiť. Preto sa tu stráži nielen obsah, ale aj to,
// kto je na nej kým — obrátené strany by tvrdili pravý opak.
{
  const supplier = { name: 'DANUBRA s.r.o.', address: 'Hlavná 1', company_id: '55' };
  const sc = { title: 'Wohnpark Feuerbach', contract_number: 'ZAK-1' };

  const w = P.workOrder({
    order: { kind: 'worker', order_number: 'OBJ-2026-0008', title: 'Sadrokartón 2. NP',
      scope: 'Montáž priečok, opláštenie, tmelenie Q2.', date_from: '2026-10-13',
      date_to: '2026-12-19', price_model: 'hourly', rate: 22, currency: 'EUR' },
    supplier, worker: { full_name: 'Ján Novák' }, subcontract: sc });

  ok(/Objednávka/.test(w), 'živnostníkovi ide objednávka po slovensky');
  ok(/Objednávateľ/.test(w) && /Zhotoviteľ/.test(w),
    'strany sú objednávateľ a zhotoviteľ');
  ok(!/>Odberateľ</.test(w),
    'nie odberateľ — to by bolo obrátené a doklad by tvrdil opak toho, čo dokazuje');
  ok(/samostatne zárobkovo činná osoba/.test(w), 'a je napísané, že je živnostník');
  ok(/Montáž priečok/.test(w), 'dielo je na doklade');
  ok(/organizuješ sám/.test(w), 'aj to, že si prácu organizuje sám');
  ok(/vystavíš faktúru/.test(w), 'a že nám za dielo fakturuje');
  ok(/nie hodiny/.test(w), 'a že sa objednáva dielo, nie hodiny');
  ok(/prijímam objednávku/.test(w), 'má podpisový riadok pre zhotoviteľa');
  // Hodinová sadzba na objednávke diela je slabšie miesto — nech je to povedané.
  ok(/pevná cena alebo cena za\s+jednotku/.test(w),
    'pri hodinovej sadzbe sa upozorní, že pevná cena je silnejší doklad');
  const pevna = P.workOrder({
    order: { kind: 'worker', title: 'x', price_model: 'fixed', fixed_price: 5000 },
    supplier, worker: { full_name: 'Ján Novák' }, subcontract: sc });
  ok(!/pevná cena alebo cena za\s+jednotku/.test(pevna),
    'pri pevnej cene to upozornenie netreba');

  // Odberateľovi ide nemecké potvrdenie a hore jeho číslo.
  const c = P.workOrder({
    order: { kind: 'customer', order_number: 'OBJ-2026-0007', their_ref: '4500123456',
      title: 'Trockenbau 2. OG', scope: 'Trockenbauwände im 2. OG.',
      received_at: '2026-10-02', price_model: 'hourly', rate: 34, currency: 'EUR' },
    supplier, partner: { name: 'Vogel GmbH' }, subcontract: sc });

  ok(/Auftragsbestätigung/.test(c), 'odberateľovi ide potvrdenie po nemecky');
  ok(/Ihre Bestellnummer/.test(c), 'a jeho číslo je pomenované po nemecky');
  ok(c.includes('4500123456'), 'aj samotné číslo');
  ok(/auf allen Rechnungen/.test(c),
    's vetou, že ho treba uvádzať na faktúrach — kvôli tomu to číslo zapisujeme');
  ok(/Auftragnehmer/.test(c) && /Auftraggeber/.test(c), 'strany po nemecky');
  ok(/34,00/.test(c), 'cena v nemeckom tvare');
  ok(!/organizuješ sám/.test(c), 'vety o diele patria len živnostníkovi');

  // Chýbajúce dielo sa nevynechá potichu ani na jednom.
  const bez = P.workOrder({ order: { kind: 'worker', title: 'x' },
    supplier, worker: { full_name: 'A' }, subcontract: {} });
  ok(/nie je popísané/.test(bez), 'bez popisu diela to doklad napíše');
  ok(/todo/.test(bez), 'a je to zvýraznené');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
