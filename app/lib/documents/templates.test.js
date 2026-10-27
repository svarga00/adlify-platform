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
  // Živnostníkom vykáme — papier, ktorý dostanú do ruky, netyká.
  const tyka = /(?<!\p{L})(si vezmi|zavolaj|nerieš|ukáž|buď slušný|nepodpisuj|budeš|dovoláš|tvoja|ťa|ti dajú|od teba|nemáš|organizuješ|vystavíš)(?!\p{L})/iu;
  ok(!tyka.test(h.replace(/<[^>]+>/g, ' ')), 'infolist vyká', (h.replace(/<[^>]+>/g, ' ').match(tyka) || [])[0]);

  ok(/Infolist na stavbu/.test(h), 'dokument sa volá podľa toho, načo je');
  ok(h.includes('Ján Novák'), 'a je na ňom, pre koho je');
  ok(/12\. 10\. 2026/.test(h),
    'dátum je po slovensky, nie 2026-10-12 — papier číta človek, nie databáza');
  ok(/Brána B/.test(h) && /Polier Berger/.test(h), 'kam a za kým');
  ok(/Ich bin Subunternehmer/.test(h), 'nemecké vety sú na ňom');
  ok(/A1-Bescheinigung/.test(h), 'vrátane tej o dokladoch');
  ok(/Stundennachweis/.test(h), 'je vysvetlené, čo sa podpisuje');
  ok(/Nič iné nepodpisujte/.test(h), 'a čo nie — to je to, kvôli čomu infolist je');
  ok(/112/.test(h), 'pri úraze je číslo, nie odkaz na niekoho');
  ok(/maps/.test(h), 'adresa stavby má odkaz na mapu');

  // Chýbajúci údaj sa na papieri **nevynechá potichu**.
  const dieravy = P.siteSheet({ ...zaklad, lodging: null,
    subcontract: { ...zaklad.subcontract, meeting_point: null, site_contact_name: null,
      site_contact_phone: null } });
  ok(/Nie je zapísané, kde presne/.test(dieravy),
    'chýbajúce miesto stretnutia je na papieri napísané');
  ok(/Spýtajte sa u nás/.test(dieravy), 'aj to, čo s tým má človek spraviť');
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

  // Kolegovia a kontakt: partia, kontaktná osoba, alebo aspoň naše číslo.
  const S = require('./sitesheet.js');
  const text = (x) => x.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const sPartiou = P.siteSheet({ ...zaklad, lodging: null, colleagues: S.colleagues({
    assignment: { worker_id: 'w1' }, crew: { id: 'c1', name: 'Partia Malý', leader_worker_id: 'w3' },
    crewMembers: [{ crew_id: 'c1', worker_id: 'w1' }, { crew_id: 'c1', worker_id: 'w2' },
      { crew_id: 'c1', worker_id: 'w3', role: 'leader' }],
    workers: [{ id: 'w2', full_name: 'Peter Malý', phone: '+421 900 222 222' },
      { id: 'w3', full_name: 'Adam Bača', phone: '+421 900 333 333' }] }) });
  const tp = text(sPartiou);
  ok(/Kolegovia a kontakt/.test(tp), 'infolist má oddiel o kolegoch');
  ok(/Partia Malý/.test(tp) && /Adam Bača — predák/.test(tp) && /Peter Malý/.test(tp),
    'partia s predákom a členmi', tp.slice(tp.indexOf('Kolegovia'), tp.indexOf('Kolegovia') + 200));
  ok(tp.indexOf('Adam Bača') < tp.indexOf('Peter Malý'), 'predák je prvý');
  ok(/href="tel:\+421900333333"/.test(sPartiou), 'telefón je odkaz, na mobile sa naň ťukne');

  const sKontaktom = P.siteSheet({ ...zaklad, lodging: null, colleagues: S.colleagues({
    assignment: { worker_id: 'w1', contact_name: 'Zoltán Kiss', contact_phone: '+36 30 444 4444',
      contact_note: 'Robí tam od augusta.' } }) });
  const tk = text(sKontaktom);
  ok(/Kontaktná osoba/.test(tk) && /Zoltán Kiss/.test(tk) && /Robí tam od augusta/.test(tk),
    'kto nie je v partii, má kontaktnú osobu aj s poznámkou');
  ok(!/Vaša partia/.test(tk), 'a nepíše sa o partii, ktorú nemá');
  ok(!tyka.test(tk), 'vyká', (tk.match(tyka) || [])[0]);

  const bezNikoho = text(P.siteSheet({ ...zaklad, lodging: null, colleagues: S.colleagues({}) }));
  ok(/nemáte zapísaného kolegu/.test(bezNikoho) && /zavolajte nám na \+421 900 000 000/.test(bezNikoho),
    'bez kolegov je aspoň veta, že sa volá nám — s číslom');
  ok(/Kolegovia a kontakt/.test(text(h)) && /zavolajte nám/.test(text(h)),
    'aj keď UI kolegov nepošle, miesto nie je prázdne');

  // Keď ide aj infolist k ubytovaniu, tu je ubytovanie len v skratke.
  const skratka = text(P.siteSheet({ ...zaklad, lodgingSheet: true,
    lodging: { name: 'Pension Lerche', address: 'Lerchenstr. 8', city: 'Stuttgart',
      keys_note: 'Kľúče u správcu.', house_rules: 'Nočný pokoj 22:00–06:00.' } }));
  ok(/Pension Lerche/.test(skratka), 'adresa ubytovania zostane');
  ok(/Podrobnosti o ubytovaní sú na samostatnom liste\./.test(skratka), 'a odkáže sa na samostatný list');
  ok(!/Kľúče u správcu/.test(skratka), 'kľúče a pravidlá sú až tam — nie dvakrát');
  ok(!/samostatnom liste/.test(text(sUbytovanim)), 'bez samostatného listu sa naň neodkazuje');
}

// ── Infolist k ubytovaniu ───────────────────────────────────────────────────
console.log('Infolist k ubytovaniu');
{
  const tyka = /(?<!\p{L})(tvoj\p{L}*|máš|si vezmi|zavolaj|nerieš|ukáž|nepodpisuj|budeš|dovoláš|ťa|ti|od teba|nemáš|vystavíš|pošli|musíš|môžeš)(?!\p{L})/iu;
  const text = (x) => x.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const SUP = { name: 'Partner und Service s. r. o.', phone: '+421 910 523 858', email: 'info@punds.eu' };
  const LOD = { name: 'Pension Lerche', address: 'Lerchenstr. 8', city: 'Stuttgart',
    keys_note: 'Kľúče u správcu, zvonček Hausmeister.', house_rules: 'Fajčí sa len na balkóne.',
    date_from: '2026-10-11', date_to: '2026-12-18' };
  const ACC = { access_door_code: '4711', gate_code: '0815', floor: '2', room_number: '12',
    wifi_ssid: 'Lerche-Gast', wifi_password: 'sommer2026', checkin_info: 'Od 16:00.',
    checkout_info: 'Kľúče nechajte na stole.', owner_name: 'Frau Lerche', owner_phone: '+49 711 123456' };
  const h = P.lodgingSheet({ worker: { full_name: 'Ján Novák' }, subcontract: { title: 'Wohnpark' },
    lodging: LOD, accommodation: ACC, stay: { date_from: '2026-10-12', date_to: '2026-11-30' },
    roommates: ['Peter Malý', 'Adam Bača'], supplier: SUP });
  const t = text(h);
  ok(/Infolist k ubytovaniu/.test(t) && /Ján Novák/.test(t), 'dokument sa volá podľa toho, načo je, a pre koho je');
  ok(/Lerchenstr\. 8/.test(t) && /maps/.test(h), 'adresa s mapou');
  ok(/12\. ?10\. ?2026 – 30\. ?11\. ?2026/.test(t), 'od – do je jeho pobyt, po slovensky', t.slice(0, 600));
  ok(/Kľúče u správcu/.test(t) && /4711/.test(t) && /0815/.test(t), 'ako sa dostane dnu: kľúče a kódy');
  ok(/poschodie 2, izba 12/.test(t), 'poschodie a izba');
  ok(/Od 16:00/.test(t) && /Kľúče nechajte na stole/.test(t), 'príchod a odchod');
  ok(/Lerche-Gast/.test(t) && /sommer2026/.test(t), 'Wi-Fi');
  ok(/Peter Malý/.test(t) && /Adam Bača/.test(t), 's kým býva');
  ok(/Fajčí sa len na balkóne/.test(t), 'domáci poriadok z ubytovania');
  ok(/Nočný pokoj/.test(t) && /hostia/.test(t) && /Škodu uhrádza ten, kto ju spôsobil/.test(t),
    'krátke pravidlá: pokoj, hostia, škody');
  ok(/\+421 910 523 858/.test(t) && /info@punds\.eu/.test(t), 'komu volať: najprv nám');
  ok(/Majiteľ — len keď sa nám nedovoláte/.test(t) && /\+49 711 123456/.test(t),
    'majiteľ len ako záloha a tak je aj označený');
  ok(!tyka.test(t), 'vyká', (t.match(tyka) || [])[0]);

  const bezMajitela = text(P.lodgingSheet({ worker: { full_name: 'Ján' }, lodging: LOD,
    accommodation: { ...ACC, owner_phone: '' }, supplier: SUP }));
  ok(!/Majiteľ/.test(bezMajitela) && !/Frau Lerche/.test(bezMajitela), 'bez telefónu majiteľ na liste nie je');

  // Keď chýba, napíše sa to — a čo s tým.
  const dieravy = P.lodgingSheet({ worker: { full_name: 'Ján' }, lodging: { name: 'Byt' }, supplier: SUP });
  const td = text(dieravy);
  ok(/Ubytovanie nemá zapísanú adresu/.test(td), 'chýbajúca adresa je na papieri napísaná');
  ok(/ako sa dostať dnu/.test(td) && /ako prebieha príchod/.test(td), 'aj vstup a príchod');
  ok(/Spýtajte sa u nás/.test(td) && /class="todo"/.test(dieravy), 'aj čo s tým spraviť, zvýraznené');
  ok(/nikoho ďalšieho/.test(td), 'bez spolubývajúcich sa to povie');
  ok(!/Wi-Fi/.test(td), 'Wi-Fi sa nevymýšľa');
  ok(!/undefined|null/.test(td), 'prázdny vstup nevyrobí „undefined"');
  ok(!tyka.test(td), 'vyká aj pri chýbajúcich údajoch', (td.match(tyka) || [])[0]);

  const sKontaktom = text(P.lodgingSheet({ lodging: LOD, supplier: SUP,
    colleagues: { crew: null, people: [], contact: { name: 'Zoltán Kiss', phone: '+36 30 444', note: '' } } }));
  ok(/Na stavbe: Zoltán Kiss/.test(sKontaktom), 'kontaktná osoba je aj tu');
  ok(typeof P.lodgingSheet() === 'string', 'bez vstupu nespadne');
}

// ── Vzor faktúry ────────────────────────────────────────────────────────────
console.log('Vzor faktúry');
{
  const tyka = /(?<!\p{L})(tvoj\p{L}*|máš|zavolaj|pošli|vystav|nepodpisuj|budeš|ťa|ti|od teba|nemáš|vystavíš|musíš|môžeš|prilož)(?!\p{L})/iu;
  const text = (x) => x.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const SUP = { name: 'Partner und Service s. r. o.', address: 'Podzámska 9468/4A, 940 71 Nové Zámky',
    company_id: '57553921', tax_id: '2122816839', vat_id: 'SK2122816839', iban: 'SK6711000000002948311291',
    email: 'info@punds.eu', phone: '+421 910 523 858' };
  const W = { full_name: 'Ján Novák', business_address: 'Hlavná 1', business_zip: '940 01',
    business_city: 'Nové Zámky', company_id: '12345678', tax_id: '1020304050',
    bank_iban: 'SK3112000000198742637541', hourly_cost: 18.5 };
  const h = P.invoiceGuide({ worker: W, assignment: {}, subcontract: { title: 'Wohnpark', site_city: 'Stuttgart' },
    supplier: SUP, month: '2026-10' });
  const t = text(h);
  ok(/Vzor faktúry/.test(t) && /Ako nám fakturovať/.test(t), 'dokument sa volá podľa toho, načo je');
  ok(/Odberateľ — my/.test(t) && /Partner und Service/.test(t) && /IČO: 57553921/.test(t) && /DIČ: 2122816839/.test(t),
    'odberateľ sme my, s IČO a DIČ');
  ok(/Dodávateľ — Vy/.test(t) && /Hlavná 1, 940 01 Nové Zámky/.test(t) && /IČO: 12345678/.test(t),
    'dodávateľ je on, s adresou podnikania');
  ok(!/doplňte/.test(t.replace(/Svoje skontrolujte a doplňte/, '')), 'keď je všetko vyplnené, nič „doplňte"', t.slice(0, 800));
  ok(/Práce na stavbe Wohnpark, Stuttgart za obdobie október 2026/.test(t), 'predmet a obdobie po slovensky');
  ok(/Odpracované hodiny podľa podpísaného výkazu/.test(t), 'riadok s hodinami podľa výkazu');
  ok(/18,50 €/.test(t), 'sadzba s desatinnou čiarkou a dvoma miestami');
  ok(/160 h × 18,50 € = 2 960,00 €/.test(t), 'príklad 160 hodín', t.match(/Príklad[^.]*/)?.[0]);
  ok(/14 dní od doručenia/.test(t), 'splatnosť podľa rámcovej zmluvy');
  ok(/SK3112000000198742637541/.test(t), 'jeho IBAN');
  ok(/„Nie som platiteľ DPH\."/.test(t) && /Ak ste platiteľom DPH, zavolajte nám na \+421 910 523 858 skôr, než faktúru vystavíte/.test(t),
    'veta o DPH a čo robiť, keď je platiteľ');
  ok(/Čo musí byť na faktúre/.test(t) && /Kam ju poslať/.test(t) && /info@punds\.eu/.test(t), 'čo na nej má byť a kam ju poslať');
  ok(/Stundennachweis/.test(t) && /Priložte podpísaný výkaz hodín/.test(t), 'priložiť podpísaný výkaz');
  ok(!tyka.test(t), 'vyká', (t.match(tyka) || [])[0]);

  // Peniaze: sadzba nasadenia má prednosť a nič sa nesčítava v desatinných číslach.
  const t2 = text(P.invoiceGuide({ worker: W, assignment: { worker_rate: '19,99' }, supplier: SUP }));
  ok(/160 h × 19,99 € = 3 198,40 €/.test(t2), 'sadzba z nasadenia, v centoch (nie 3 198,3999…)', t2.match(/Príklad[^.]*/)?.[0]);
  ok(/obdobie podľa výkazu/.test(t2), 'bez mesiaca „obdobie podľa výkazu"');
  eq(P.toCents('18,5'), 1850, 'sadzba „18,5" sú 1850 centov');
  eq(P.toCents(0.1 + 0.2), 30, 'a desatinný šum zmizne');
  eq(P.toCents('abc'), null, 'nezmysel nie je sadzba');
  eq(P.centsText(123456789), '1 234 567,89 €', 'tisíce oddelené pevnou medzerou');
  eq(P.monthLabel('2026-01-15'), 'január 2026', 'mesiac po slovensky');

  // Chýbajúce údaje sú „doplňte", nie prázdne miesto.
  const holy = P.invoiceGuide({ worker: { full_name: 'Ján Novák' }, supplier: SUP });
  const th = text(holy);
  ok((th.match(/doplňte/g) || []).length >= 5, 'chýbajúca adresa, IČO, DIČ, IBAN aj sadzba sú „doplňte"');
  ok(/Sadzba za hodinu nie je zapísaná/.test(th) && !/Príklad/.test(th), 'bez sadzby sa príklad nevymýšľa');
  ok(!/undefined|null|NaN/.test(th), 'žiadne „undefined" ani NaN');
  ok(/Ak ste platiteľom DPH/.test(text(P.invoiceGuide({ worker: { ...W, vat_id: 'SK1020304050' }, supplier: SUP }))),
    'kto má IČ DPH, ten vetu o volaní vidí tiež');

  // Samofakturácia: faktúru vystavujeme my, on ju len potvrdí.
  const sf = text(P.invoiceGuide({ worker: { ...W, self_billing_prefix: 'JN' }, supplier: SUP,
    subcontract: { title: 'Wohnpark' } }));
  ok(/samofakturácia/i.test(sf) && /vystavujeme my — vo Vašom mene/.test(sf), 'povie jasne, že faktúru vystavujeme my');
  ok(/potvrdíte ju cez ten odkaz/.test(sf), 'on ju len potvrdí cez odkaz');
  ok(/neposielajte/.test(sf), 'a vlastnú nám neposiela');
  ok(/5 dní/.test(sf), 'lehota na námietku z rámcovej zmluvy');
  ok(!/Čo musí byť na faktúre/.test(sf) && !/Príklad: 160/.test(sf), 'bez návodu, ako faktúru vystaviť — je kratší');
  ok(/18,50 €\/h/.test(sf) && /Stundennachweis/.test(sf), 'sadzba a výkaz zostávajú');
  ok(!tyka.test(sf), 'vyká', (sf.match(tyka) || [])[0]);
  ok(typeof P.invoiceGuide() === 'string', 'bez vstupu nespadne');
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
  ok(/organizuje sám/.test(w), 'aj to, že si prácu organizuje sám');
  ok(/vystaví Zhotoviteľ faktúru/.test(w), 'a že nám za dielo fakturuje');
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
  ok(!/organizuje sám/.test(c), 'vety o diele patria len živnostníkovi');

  // Chýbajúce dielo sa nevynechá potichu ani na jednom.
  const bez = P.workOrder({ order: { kind: 'worker', title: 'x' },
    supplier, worker: { full_name: 'A' }, subcontract: {} });
  ok(/nie je popísané/.test(bez), 'bez popisu diela to doklad napíše');
  ok(/todo/.test(bez), 'a je to zvýraznené');
}

// ── Súhlas so spracovaním osobných údajov ───────────────────────────────────
// Štvrtý krok reťazca. Držíme jeho doklad totožnosti, A1, číslo účtu — a
// posielame to nemeckej firme, na stavbu a úradom. Papier musí povedať
// **komu** a **načo**, inak ten súhlas nie je informovaný a neplatí.
console.log('Súhlas GDPR');
{
  const FIRMA = { ...SUPPLIER, company_id: '57 553 921', tax_id: '2122816839',
    register: 'Obchodný register Okresného súdu Nitra, odd. Sro, vl. č. 69265/N',
    address: 'Podzámska 9468/4A, 940 71 Nové Zámky, Slovensko', city: '' };
  const CLOVEK = { full_name: 'Cyril Demeter', address: 'Brekov 81, 066 01 Brekov',
    company_id: '53941870', birth_date: '1985-03-12' };
  const h = P.gdprConsent({ worker: CLOVEK, supplier: FIRMA });

  ok(/Cyril Demeter/.test(h), 'je v ňom meno človeka');
  ok(/Partner und Service/.test(h), 'aj názov prevádzkovateľa');
  ok(/57 553 921/.test(h) && /2122816839/.test(h), 'IČO aj DIČ z Nastavení');
  ok(/69265\/N/.test(h), 'aj zápis v obchodnom registri');
  ok(/12\. 03\. 1985/.test(h), 'dátum narodenia sa vypíše po slovensky');

  // Bez týchto štyroch vecí to podľa GDPR nie je informovaný súhlas.
  ok(/18\/2018/.test(h) && /2016\/679/.test(h), 'odvoláva sa na zákon aj na nariadenie');
  ok(/Účel spracúvania/i.test(h), 'povie, načo to je');
  ok(/Príjemcovia/i.test(h), 'komu sa to posiela');
  ok(/Doba uchovávania/i.test(h), 'ako dlho to držíme');
  ok(/Odvolanie súhlasu/i.test(h), 'a že sa to dá odvolať');
  ok(/Úrad na ochranu osobných údajov/.test(h), 'aj kam sa dá sťažovať');

  // Nemecko sa musí spomenúť menovite: posielame tam jeho údaje.
  ok(/Nemeck/.test(h), 'prenos do Nemecka je pomenovaný');
  ok(/Odberateľovi/.test(h), 'a že údaje ide aj odberateľovi');

  // Papier, ktorý sa podpisuje perom, nesmie tvrdiť, že podpis netreba.
  ok(/Platné po podpise/.test(h), 'pätička hovorí, že platí po podpise');
  ok(!/platné bez podpisu/i.test(h), 'a netvrdí opak');
  ok((h.match(/class="line"/g) || []).length === 2, 'sú tam dve miesta na podpis');

  // „V 940 71 Nové Zámky" nie je veta, akú by niekto napísal rukou.
  const m = h.match(/V ([^,]+), dňa/);
  eq(m && m[1], 'Nové Zámky', 'mesto je bez PSČ a bez krajiny');
  ok(/V Košiciach, dňa/.test(P.gdprConsent({ worker: CLOVEK, supplier: FIRMA,
    place: 'Košiciach' })), 'a dá sa prepísať');

  // Chýbajúce údaje nesmú vyrobiť „undefined" ani vymyslenú firmu.
  const prazdny = P.gdprConsent({});
  ok(!/undefined/.test(prazdny), 'bez údajov tam nie je undefined');
  ok(/Dotknutá osoba/.test(prazdny), 'a papier sa aj tak vykreslí');

  // Zoznamy sú na jednom mieste, aby sa dali doplniť bez hľadania v HTML.
  ok(P.GDPR_UCEL.length >= 5 && P.GDPR_PRIJEMCOVIA.length >= 4
    && P.GDPR_PRAVA.length >= 6, 'účely, príjemcovia a práva sú vymenované');
  for (const x of [...P.GDPR_UCEL, ...P.GDPR_PRIJEMCOVIA, ...P.GDPR_PRAVA]) {
    ok(x.length > 10 && !/undefined/.test(x), `zrozumiteľná položka: ${x.slice(0, 40)}…`);
  }
}

// ── Objednávka živnostníkovi: odkaz na rámcovú zmluvu ───────────────────────
// Článok III. rámcovej zmluvy hovorí, že individuálna zmluva o dielo vzniká
// vystavením objednávky a jej akceptáciou. Objednávka, ktorá sa na rámcovú
// zmluvu neodvolá, je preto len papier s cenou.
console.log('Objednávka živnostníkovi');
{
  const CLOVEK = { full_name: 'Cyril Demeter', company_id: '53941870',
    address: 'Brekov 81, 066 01 Brekov', phone: '+421940920655' };
  const OBJ = { order_number: 'OBJ-2026-0007', kind: 'worker', price_model: 'hourly',
    rate: 27, date_from: '2026-10-19', date_to: '2026-12-31',
    scope: 'Dokončovacie stavebné práce pri realizácii exteriérov a interiérov' };

  const s = P.workOrder({ order: OBJ, supplier: SUPPLIER, worker: CLOVEK,
    ramcova: { number: '2026-093', signedAt: '2026-10-16' } });
  ok(/Rámcovej zmluvy o dielo/.test(s), 'objednávka sa odvoláva na rámcovú zmluvu');
  ok(/2026-093/.test(s), 'aj s jej číslom');
  ok(/16\. 10\. 2026/.test(s), 'aj s dátumom uzavretia');

  // Toto je to, čo sa pri objednávke stratí najľahšie.
  const bez = P.workOrder({ order: OBJ, supplier: SUPPLIER, worker: CLOVEK });
  ok(/neodvoláva na rámcovú zmluvu/.test(bez),
    'bez nej to doklad napíše na papier');
  ok(/todo/.test(bez), 'a je to zvýraznené, nie schované');

  // Zhotoviteľ musí byť identifikovateľný — meno samo nestačí.
  ok(/53941870/.test(s), 'je v nej IČO zhotoviteľa');
  ok(/Brekov 81/.test(s), 'aj jeho adresa');
  ok(/\+421940920655/.test(s), 'aj telefón');

  // Živnostník nerobí vždy na jednej adrese.
  const viac = P.workOrder({ order: OBJ, supplier: SUPPLIER, worker: CLOVEK,
    ramcova: { number: '2026-093' },
    places: ['Multscherstraße 11, 89077 Ulm', 'celé územie Nemeckej republiky', ''] });
  ok(/Miesta výkonu/.test(viac), 'ďalšie miesta výkonu sa vypíšu');
  ok(/89077 Ulm/.test(viac) && /celé územie Nemeckej republiky/.test(viac),
    'aj konkrétna adresa, aj plošná formulácia');
  ok(!/<li><\/li>/.test(viac), 'a prázdne miesto sa nevypíše');
  ok(!/Miesta výkonu/.test(s), 'bez nich sa ten riadok nekreslí');

  // Papier sa podpisuje — nesmie tvrdiť, že podpis netreba.
  ok(/Platné po podpise/.test(s), 'pätička hovorí, že platí po podpise');
  ok(!/platné bez podpisu/i.test(s), 'a netvrdí opak');

  // Potvrdenie objednávky odberateľovi je iný papier: ten sa neposiela
  // na podpis, ale ako potvrdenie — a tam pôvodná pätička sedí.
  const nemcovi = P.workOrder({ order: { ...OBJ, kind: 'customer' },
    supplier: SUPPLIER, partner: CLIENT });
  ok(/Auftragsbestätigung/.test(nemcovi), 'potvrdenie odberateľovi je po nemecky');
  ok(!/Rámcovej zmluvy/.test(nemcovi), 'a neodvoláva sa na zmluvu so živnostníkom');
  ok(/ohne Unterschrift gültig/i.test(nemcovi), 'a pätička je po nemecky');
  ok(/class="runfoot"/.test(nemcovi), 'a dole sú údaje firmy');
}

// ── Dvojjazyčná objednávka pre nemeckého odberateľa ─────────────────────────
// Rámcová zmluva hovorí, **ako** sa spolupracuje; objednávka hovorí **čo, kde,
// odkedy a za koľko** — a práve ňou individuálna zmluva o dielo vzniká.
//
// Najtichšia chyba dvojjazyčného dokladu: slovenské slovo v nemeckom stĺpci.
// Nemec si prečíta „50 – 60 hodín / týždeň" a nerozumie, alebo ešte horšie —
// myslí si, že rozumie.
console.log('Objednávka pre Nemca, dvojjazyčne');
{
  const FIRMA = { name: 'Partner und Service s. r. o.', address: 'Podzámska 9468/4A, Nové Zámky',
    company_id: '57 553 921', vat_id: 'SK2122816839', tax_number_de: '214/633/08265',
    iban: 'SK67 1100' };
  const KLIENT = { name: 'Kulzer GmbH', address: 'Straubing, Deutschland',
    ust_idnr: 'DE 164 536 345', registration_no: 'HRB 10147' };
  const OBJ = {
    number: '1', scope_sk: 'Stavebné práce: Zatepľovanie', scope_de: 'Bauarbeiten: Wärmedämmung',
    rate: 31, hours_week: '50 – 60 hodín / týždeň / osoba',
    hours_week_de: '50 – 60 Stunden / Woche / Person',
    date_from: '2026-10-19', date_to: '2026-11-30', extendable: true,
    places: ['Clemens-Attenkofer-Straße 10, 94315 Straubing, Nemecko'],
    places_de: ['Clemens-Attenkofer-Straße 10, 94315 Straubing, Deutschland'],
    special_sk: 'Skúšobná lehota 3 dni.', special_de: 'Probezeit 3 Tage.',
    signed_at: '2026-10-15',
  };
  const h = P.bestellung({ order: OBJ, supplier: FIRMA, client: KLIENT,
    ramcova: { number: '2026-018', signedAt: '2026-10-15' } });

  const stlpec = (trieda) => [...h.matchAll(new RegExp(
    `<div class="${trieda}">([\\s\\S]*?)</div>`, 'g'))].map(m => m[1]).join(' ');
  const sk = stlpec('bil-sk'), de = stlpec('bil-de');

  ok(sk.length > 200 && de.length > 200, 'oba stĺpce majú obsah');

  // **Toto je ten test, o ktorý tu ide.**
  const slovenske = /\bhodín\b|\btýždeň\b|\bNemecko\b|\bdní\b|\bdohodou\b|\bzmluvn/;
  ok(!slovenske.test(de), 'v nemeckom stĺpci nie je slovenské slovo',
    (de.match(slovenske) || [])[0]);
  ok(/Stunden \/ Woche/.test(de), 'čas je po nemecky');
  ok(/Deutschland/.test(de) && !/Nemecko/.test(de), 'krajina je po nemecky');
  ok(/Nemecko/.test(sk), 'a v slovenskom stĺpci po slovensky');

  // Objednávka bez odkazu na rámcovú zmluvu nie je individuálna zmluva o dielo.
  ok(/Rámcovej zmluvy o dielo/.test(h) && /Rahmenwerkvertrages/.test(h),
    'odvoláva sa na rámcovú zmluvu v oboch jazykoch');
  ok(/2026-018/.test(h), 'aj s jej číslom');
  const bez = P.bestellung({ order: OBJ, supplier: FIRMA, client: KLIENT });
  ok(/neodvoláva na rámcovú zmluvu/.test(bez), 'bez nej to doklad napíše');
  ok(/Rahmenwerkvertrag Bezug/.test(bez), 'a povie to aj po nemecky');

  // Sumy: slovenský doklad píše 31,00 €, nemecký ten istý tvar — ale obe
  // čísla musia byť rovnaké.
  ok(/31,00/.test(sk) && /31,00/.test(de), 'sadzba je v oboch stĺpcoch rovnaká');

  // Chýbajúce údaje sa na papier napíšu, nie zamlčia.
  const prazdna = P.bestellung({ order: { number: '2' }, supplier: FIRMA, client: KLIENT,
    ramcova: { number: '2026-018' } });
  ok(/Sadzba nie je dohodnutá/.test(prazdna), 'chýbajúca sadzba sa pomenuje');
  ok(/Der Satz ist nicht vereinbart/.test(prazdna), 'aj po nemecky');
  ok(!/undefined/.test(prazdna), 'a nikde nie je undefined');

  // Podpisuje sa oboma stranami.
  ok(/Platné po podpise/.test(h), 'pätička hovorí, že platí po podpise');
  ok((h.match(/class="line"/g) || []).length === 2, 'a sú tam dve miesta na podpis');

  // Keď nemecký variant miesta nie je, použije sa slovenský — adresa je adresa.
  const jedno = P.bestellung({ order: { ...OBJ, places_de: [] }, supplier: FIRMA,
    client: KLIENT, ramcova: { number: '2026-018' } });
  ok(/Straubing/.test(stlpec('bil-de')) || /Straubing/.test(jedno),
    'bez nemeckého variantu sa použije slovenský');
}

// ── Faktúra za živnostníka ──────────────────────────────────────────────────
{
  const bill = {
    bill_number: 'OV-2026-001', variable_symbol: '2026001', amount: 4000, issue_date: '2026-10-21',
    due_date: '2026-11-04', delivery_date: '2026-10-19', supplier_iban: 'SK3112000000198742637541',
    lines: [{ description: 'Wohnpark Feuerbach', activity: 'construction', hours: 160, rate: 25, total: 4000,
      from: '2026-10-01', to: '2026-10-19' }],
    extracted: { _self: {
      worker: { full_name: 'Ján Novák', company_id: '12345678', tax_id: '1122334455', address: 'Hlavná 1',
        city: 'Nitra', zip: '949 01', iban: 'SK3112000000198742637541', vat_payer: false },
      company: { name: 'Partner und Service s. r. o.', company_id: '57 553 921', address: 'Podzámska 9468/4A, Nové Zámky' } } },
  };
  const html = P.selfInvoice({ bill, worker: { full_name: 'Iné meno na karte' }, contractNo: '2026-093' });
  const t = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(/Dodávateľ Ján Novák/.test(t) && /Odberateľ Partner und Service/.test(t), 'dodávateľ je živnostník, odberateľ my', t.slice(0, 300));
  ok(!/Iné meno na karte/.test(t), 'údaje z momentky pri vystavení, nie z dnešnej karty');
  ok(/vyhotovenie faktúry odberateľom/.test(t), 'na faktúre je, že ju vyhotovil odberateľ');
  ok(/rámcovej zmluve o dielo č\. 2026-093/.test(t), 'a na základe ktorej zmluvy');
  ok(/nie je platiteľom DPH/.test(t), 'neplatiteľ DPH');
  ok(/OV-2026-001/.test(t) && /2026001/.test(t) && /SK3112000000198742637541/.test(t), 'číslo, VS, IBAN');
  ok(/160/.test(t) && /4\s?000,00/.test(t), 'hodiny a suma');
  ok(!html.includes('<svg viewBox="0 0 100 100"'), 'bez nášho loga — doklad je jeho');
  const navrh = P.selfInvoice({ bill: { amount: 10, lines: [] }, worker: { full_name: 'X' } });
  ok(/NÁVRH/.test(navrh), 'návrh bez čísla je označený');
}

// ── Pečiatka a úprava pred tlačou ──────────────────────────────────────────
{
  const PNG = 'data:image/png;base64,iVBORw0KGgo=';
  const sup = { name: 'Firma s. r. o.', stamp: PNG };
  const W = { full_name: 'Ján Novák' };
  const z = P.ramcovaZmluva({ zmluva: require('./subcontract.js').build({ worker: W, supplier: sup }) });
  ok(z.includes(`<img class="stamp" src="${PNG}"`), 'pečiatka je v našom podpisovom poli zmluvy');
  ok(/Upraviť text/.test(z), 'zmluva sa dá pred tlačou upraviť');
  const f = P.invoice({ invoice: { invoice_number: '1', total: 10 }, items: [], client: { name: 'GU', country: 'DE' }, supplier: sup });
  ok(f.includes(PNG), 'pečiatka je aj na faktúre');
  ok(!/Upraviť text/.test(f), 'vystavená faktúra sa upravovať nedá');
  ok(/ohne Unterschrift gültig/.test(f), 'nemecká faktúra má nemeckú pätičku');
  ok(!P.ramcovaZmluva({ zmluva: require('./subcontract.js').build({ worker: W, supplier: { name: 'X' } }) })
    .includes('class="stamp"'), 'bez nahratej pečiatky sa nič nekreslí');
  ok(P.stamp({ stamp: 'javascript:alert(1)' }) === '', 'do pečiatky sa nedá podstrčiť iný obsah');
}

// ── s.r.o. ako zhotoviteľ ──────────────────────────────────────────────────
{
  const z = P.ramcovaZmluva({ zmluva: require('./subcontract.js').build({
    worker: { full_name: 'Peter Malý', legal_form: 'sro', company_name: 'Malý Stav s.r.o.' }, supplier: { name: 'X' } }) });
  const t = z.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(/Zhotoviteľ Malý Stav s\.r\.o\. konajúca: Peter Malý, konateľ/.test(t), 'pri s.r.o. je zhotoviteľom firma a konateľ', t.slice(0, 400));
}

// ── Vzhľad punds: značka v hlavičke, päta s údajmi firmy ───────────────────
{
  const PUNDS = { name: 'Partner und Service s. r. o.', address: 'Podzámska 9468/4A 940 71 Nové Zámky',
    company_id: '57553921', tax_id: '2122816839', vat_id: 'SK2122816839', iban: 'SK6711000000002948311291',
    email: 'info@punds.eu', phone: '+421 910 523 858', tax_number_de: '214/633/08265',
    register: 'Obchodný register Okresného súdu Nitra, odd. Sro, vl. č. 69265/N' };
  const b = P.brand(PUNDS);
  ok(b.brand === 'punds' && b.sub === 'Partner und Service', 'Partner und Service má v hlavičke značku punds', JSON.stringify(b));
  ok(P.brand({ name: 'Iná firma s. r. o.' }).brand === '', 'iná firma má v hlavičke celý názov');
  ok(P.brand({ ...PUNDS, brand: 'PuS' }).brand === 'PuS', 'značka sa dá zmeniť v Nastaveniach');
  ok(P.web(PUNDS) === 'punds.eu' && P.web({ email: 'jano@gmail.com' }) === '', 'web je z domény e-mailu, nie z Gmailu');

  const f = P.invoice({ invoice: { invoice_number: '2026001', total: 100, issue_date: '2026-10-24', due_date: '2026-11-07' },
    items: [], client: { name: 'GU Ulm GmbH', country: 'DE' }, supplier: PUNDS });
  const t = f.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(/class="brand-word">punds</.test(f), 'na faktúre je značka punds');
  ok(/Nr\. 2026001/.test(t) && /Rechnungsdatum 24\. ?10\. ?2026/.test(t), 'číslo a dátum sú v hlavičke', t.slice(0, 300));
  const pata = (f.match(/<div class="runfoot"[\s\S]*?<\/div><\/div>/) || [''])[0].replace(/<[^>]+>/g, ' ');
  ok(/IČO 57553921/.test(pata) && /USt-IdNr\. SK2122816839/.test(pata) && /IBAN SK67/.test(pata) && /punds\.eu/.test(pata),
    'päta má IČO, USt-IdNr., IBAN a web', pata);
  ok(/Steuernummer 214\/633\/08265/.test(pata), 'na nemeckom doklade aj Steuernummer');
  const z = P.ramcovaZmluva({ zmluva: require('./subcontract.js').build({ worker: { full_name: 'Ján Novák' }, supplier: PUNDS }) });
  const pz = (z.match(/<div class="runfoot"[\s\S]*?<\/div><\/div>/) || [''])[0];
  ok(/DIČ 2122816839/.test(pz) && /IČ DPH SK2122816839/.test(pz) && /69265\/N/.test(pz), 'slovenská päta má DIČ, IČ DPH a zápis v OR', pz);
  ok(/class="cl">Článok I\.</.test(z) && /cols boxed/.test(z), 'články zmluvy majú oranžové číslo a strany sú v rámikoch');
  const self = P.selfInvoice({ bill: { bill_number: 'ZF-1', amount: 10, lines: [] }, worker: { full_name: 'Ján Novák', company_id: '111' }, company: PUNDS });
  ok(/runfoot plain/.test(self) && !/class="brand-word"/.test(self), 'faktúra za živnostníka je jeho — bez našej značky');
}

// ── Stundennachweis (list na hodiny, na šírku) ──────────────────────────────
{
  const SUP = { name: 'Partner und Service s. r. o.', address: 'Podzámska 9468/4A, 940 71 Nové Zámky', company_id: '57553921' };
  const SUB = { title: 'Wohnpark Feuerbach', contract_number: 'ZAK-2026-0003', site_name: 'Haus C', site_city: 'Stuttgart' };
  const strip = (h) => h.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const blank = P.stundennachweis({ supplier: SUP, subcontract: SUB, partner: { name: 'GU Ulm GmbH' },
    week: { year: 2026, week: 43 }, workers: [{ full_name: 'Peter Mynárik' }, { full_name: 'Ákos Papp' }], rows: 6 });
  const t = strip(blank);
  ok(/<html lang="de" data-orient="landscape">/.test(blank), 'list je označený na šírku (pre PDF)');
  ok(/@page\{size:A4 landscape/.test(blank), 'aj pre tlač');
  ok(/Stundennachweis/.test(t) && /KW 43 2026/.test(t) && /19\.10\. – 24\.10\.2026/.test(t), 'KW a dátumy týždňa', t.slice(0, 300));
  ok(/Montag/.test(t) && /Samstag/.test(t) && !/Sonntag/.test(t) && /Insgesamt/.test(t), 'stĺpce Po–So a Insgesamt, nedeľa nie');
  ok(/Stunden \(von – bis\)/.test(t) && /Pause/.test(t) && /Datum/.test(t), 'riadky Datum, von–bis, Pause');
  ok(/Wohnpark Feuerbach/.test(t) && /Haus C, Stuttgart/.test(t) && /GU Ulm GmbH/.test(t), 'Projekt, Baustelle, Kunde sú predvyplnené');
  ok(/1 Peter Mynárik/.test(t) && /2 Ákos Papp/.test(t), 'mená sú v riadkoch');
  eq((blank.match(/<tr class="hn-p">/g) || []).length, 6, 'šesť riadkov — zvyšok prázdny na dopísanie');
  ok(/Name in Druckbuchstaben/.test(t) && /Unterschrift des Kunden/.test(t), 'miesto na meno a podpis odberateľa');
  ok(t.includes(P.STUNDEN_LEGAL), 'veta o potvrdení hodín a bezchybného diela');
  ok(/IČO 57553921/.test(t), 'päta s našimi údajmi');
  const empty = strip(P.stundennachweis({ supplier: SUP }));
  ok(!/\d{2}\.\d{2}\.\d{4}/.test(empty.replace(/IČO \d+/, '')), 'bez týždňa nie sú na liste dátumy');

  const S = require('../staffing/hourscan');
  const raw = {
    days: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, date_text: `${18 + weekday}.10.`, from: '06:00', to: '17:00', pause_min: 45 })),
    rows: [{ name_raw: 'Popović T.', per_day: ['10', '10', '/', '10', '10 STD/15 min', '6'].map((hours_text, i) => ({ weekday: i + 1, hours_text })) }],
    signed: true, signer_name: 'K. Vogel', confidence: 'high',
  };
  const n = S.normalize(raw, { year: 2026 });
  const filled = { ...n, rows: S.matchWorkers(n.rows, [{ id: 'w5', full_name: 'Tihomir Popović' }]) };
  const fh = P.stundennachweis({ supplier: SUP, subcontract: SUB, workers: [{ id: 'w5', full_name: 'Tihomir Popović' }], filled });
  const ft = strip(fh);
  ok(/KW 43 2026/.test(ft), 'vyplnený list berie týždeň z prečítaného');
  ok(/1 Tihomir Popović 10 10 – 10 10,25 6 46,25/.test(ft), 'hodiny po dňoch, voľný deň pomlčkou, súčet riadku', ft.slice(ft.indexOf('Tihomir') - 10, ft.indexOf('Tihomir') + 80));
  ok(/Gesamt 10 10 – 10 10,25 6 46,25/.test(ft), 'súčty po dňoch a spolu');
  ok(/06:00 – 17:00/.test(ft) && /45 min/.test(ft), 'čas od–do a pauza');
  ok(/K\. Vogel/.test(ft) && /im Original unterschrieben/.test(ft) && /Abschrift/.test(ft), 'prepis podpísaného originálu');
  eq((fh.match(/<tr class="hn-p">/g) || []).length, 1, 'prepis má len riadky z papiera');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
