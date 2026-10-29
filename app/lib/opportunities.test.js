// ============================================================================
// Testy: Možnosti — potenciálne zákazky
// Spustenie:  node app/lib/opportunities.test.js
// ============================================================================
global.window = global;
const O = require('./opportunities');

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

const DNES = '2026-10-14';
/** Možnosť, ktorej nič nechýba. Testy z nej ubierajú. */
const PLNA = {
  id: 'o1', title: 'Kotolňa Wörthsee', status: 'checking',
  company_name: 'GU Ulm GmbH', company_vat: 'DE123456789',
  contact_name: 'Jasarevic', contact_phone: '+49 170 000000',
  trade_key: 'zvarac', headcount: 4, city: 'Wörthsee',
  rate_client: 34, rate_worker: 22, start_date: '2026-11-03',
  created_at: '2026-10-01T08:00:00Z',
  verify_result: { valid: true, name: 'GU Ulm GmbH', address: 'Ulm' },
};

console.log('\nSTAVY');
{
  eq(O.STATUS.map(s => s[0]), ['new', 'checking', 'offer', 'won', 'lost'],
    'päť stavov — každý ďalší je ďalšie rozhodnutie, ktoré musí niekto spraviť');
  ok(O.STATUS.every(s => s[1] && s[2] && s[3]),
    'každý stav má názov, farbu aj vetu, čo znamená');
  eq(O.statusLabel('offer'), 'Ponuka odišla', 'názov stavu sa dá prečítať');
  eq(O.statusLabel('nic'), 'Nová', 'neznámy stav nespadne');
}

console.log('\nČO CHÝBA');
{
  eq(O.missing(PLNA), [], 'úplnej možnosti nechýba nič');
  const prazdna = O.missing({ title: 'Telefonát' });
  ok(prazdna.length >= 7, `prázdnej chýba takmer všetko (${prazdna.length})`);
  eq(prazdna[0].key, 'company_name', 'prvý je názov firmy');
  eq(prazdna[1].key, 'company_vat', 'druhé USt-IdNr — bez neho sa nedá preveriť ani fakturovať');
  ok(prazdna.every(f => f.why), 'pri každom je napísané, prečo to treba');
  ok(/§13b/.test(prazdna[1].why), 'a pri USt-IdNr aj paragraf', prazdna[1].why);

  // Nula je hodnota, nie prázdno — ale nula ľudí je nezmysel, takže to
  // nekontrolujeme tu, kontroluje to formulár.
  eq(O.missing({ ...PLNA, headcount: 0 }).length, 0, 'nula sa berie ako vyplnené');
  eq(O.missing({ ...PLNA, city: '' }).map(f => f.key), ['city'], 'prázdny text chýba');
  eq(O.missing({}).length, O.CHYBA.length, 'prázdny objekt nespadne');
}

console.log('\nOVERENIE FIRMY');
{
  // Toto je to miesto, ktoré sa ľahko pokazí.
  const neoverene = O.verification({ company_vat: 'DE123' });
  eq(neoverene.state, 'unchecked', 'bez odpovede registra je firma nepreverená');
  ok(/sme sa ešte nepýtali/.test(neoverene.detail), 'a je povedané, že sme sa nepýtali',
    neoverene.detail);
  ok(/Bez USt-IdNr/.test(O.verification({}).detail),
    'bez čísla sa preveriť nedá a je to napísané');

  const mimo = O.verification({ verify_result: { unavailable: true } });
  eq(mimo.state, 'unavailable', 'keď register neodpovie, je to vlastný stav');
  ok(/nie je to to isté ako neplatné/i.test(mimo.detail),
    '„register neodpovedal" nie je „firma neexistuje"', mimo.detail);

  const zle = O.verification({ verify_result: { valid: false } });
  eq(zle.state, 'invalid', 'neplatné číslo je neplatné');
  ok(/reverse charge/.test(zle.detail), 'a je povedané, čo to znamená pre faktúru');

  const dobre = O.verification(PLNA);
  eq(dobre.state, 'valid', 'platné číslo je v poriadku');
  ok(/GU Ulm GmbH/.test(dobre.detail), 'a vo vete je názov z registra', dobre.detail);

  // Odpoveď, ktorá sa nedá prečítať, nie je potvrdenie.
  eq(O.verification({ verify_result: { nieco: 'ine' } }).state, 'unchecked',
    'nečitateľná odpoveď neplatí za overenie');
}

console.log('\nMARŽA');
{
  const m = O.margin(PLNA);
  eq(m.perHour, 1200, '34 − 22 = 12 € na hodinu, v centoch');
  eq(m.pct, 35.3, 'a podiel na sadzbe odberateľa');
  eq(O.margin({ rate_client: 34 }).perHour, null,
    'bez sadzby živnostníka sa marža neráta — nula vyzerá ako zmeraná hodnota');
  eq(O.margin({ rate_worker: 22 }).perHour, null, 'ani bez sadzby odberateľa');
  eq(O.margin({}).perHour, null, 'prázdny vstup nespadne');
}

console.log('\nČO SPRAVIŤ TERAZ');
{
  const nic = O.nowNext([], DNES);
  eq(nic.key, 'ok', 'bez možností nič nečaká');
  ok(/zapíšte to sem/.test(nic.what), 'ale povie sa, že sa to má zapisovať', nic.what);
  ok(/neexistuje/.test(nic.why), 'a prečo', nic.why);
  eq(O.nowNext(undefined, DNES).key, 'ok', 'ani bez vstupu to nespadne');
}
{
  // Nová možnosť je prvá a horí: odberateľ sa pýta viacerých.
  const q = O.nowNext([
    { id: 'a', title: 'Telefonát Mníchov', status: 'new', created_at: '2026-10-12T08:00:00Z' },
    { ...PLNA },
  ], DNES);
  eq(q.key, 'new', 'nová možnosť má prednosť pred všetkým');
  ok(q.hot, 'a horí');
  ok(/kto sa ozve prvý/.test(q.why), 's dôvodom, ktorý nie je o appke', q.why);
  eq(q.opp.id, 'a', 'tlačidlo vedie na tú, čo čaká najdlhšie');
}
{
  // Nepreverená firma pri možnosti, ktorú už riešime.
  const q = O.nowNext([{ ...PLNA, verify_result: null }], DNES);
  eq(q.key, 'verify', 'nepreverená firma je druhá');
  ok(!q.hot, 'nehorí — len to treba spraviť');
  ok(/§13b/.test(q.why), 'a je povedané, čo bez toho nejde', q.why);
}
{
  const q = O.nowNext([{ ...PLNA, verify_result: { valid: false } }], DNES);
  eq(q.key, 'verify', 'neplatné USt-IdNr tiež');
  ok(q.hot, 'a to už horí');
  ok(/nie je v registri/.test(q.what), 'povie sa, čo je zle', q.what);
}
{
  // Firma bez USt-IdNr sa nepýta na overenie — pýta sa na to číslo.
  const q = O.nowNext([{ ...PLNA, company_vat: '', verify_result: null }], DNES);
  eq(q.key, 'fill', 'bez čísla sa nepýta overenie, ale to číslo');
  ok(/USt-IdNr/.test(q.title), 'a je to v nadpise', q.title);
}
{
  const q = O.nowNext([{ ...PLNA, trade_key: null }], DNES);
  eq(q.key, 'fill', 'chýbajúci údaj je tretí');
  ok(/remeslo/.test(q.title), 'povie sa, ktorý', q.title);
  ok(/nábor/.test(q.why), 'aj čo bez neho nejde', q.why);
  eq(q.opp.id, 'o1', 'a vedie na tú možnosť');
}
{
  const q = O.nowNext([{ ...PLNA, status: 'offer' }], DNES);
  eq(q.key, 'followup', 'ponuka, pri ktorej je ticho, je posledná');
  ok(/Ticho neznamená nie/.test(q.why), 's vetou, ktorá to vysvetlí', q.why);
}
{
  const q = O.nowNext([PLNA], DNES);
  eq(q.key, 'ok', 'úplná rozpracovaná možnosť nič nečaká');
  ok(!q.hot, 'a nehorí');
}
{
  // Uzavreté možnosti sa do práce nepočítajú.
  const q = O.nowNext([
    { ...PLNA, id: 'w', status: 'won' },
    { ...PLNA, id: 'l', status: 'lost', trade_key: null },
  ], DNES);
  eq(q.key, 'ok', 'vyhraná ani stratená možnosť už nič nepýta');
}

console.log('\nČÍSLA NAD ZOZNAMOM');
{
  const s = O.summary([
    { status: 'new' }, { status: 'checking' }, { status: 'offer' },
    { status: 'won' }, { status: 'won' }, { status: 'lost' },
  ]);
  eq(s.live, 3, 'rozpracované sa počítajú');
  eq(s.won, 2, 'vyhrané');
  eq(s.lost, 1, 'stratené');
  eq(s.rate, 67, 'a úspešnosť z uzavretých');

  // Úspešnosť má zmysel až vtedy, keď je z čoho počítať.
  eq(O.summary([{ status: 'won' }]).rate, null,
    'z jednej uzavretej sa úspešnosť nepočíta — nula pri nule vyzerá ako meranie');
  eq(O.summary([]).rate, null, 'ani z prázdna');
  eq(O.summary([]).live, 0, 'prázdny vstup nespadne');
}

console.log('\nZ dopytu ponuka a zákazka');
{
  const P = [
    { id: 'p1', name: 'Bauer Ausbau GmbH', ust_idnr: 'DE 111 222 333' },
    { id: 'p2', name: 'GU Ulm GmbH', ust_idnr: null },
  ];
  eq(O.matchPartner({ company_vat: 'de111222333', company_name: 'iný názov' }, P)?.id, 'p1',
    'odberateľ sa nájde podľa USt-IdNr aj s medzerami a malými písmenami');
  eq(O.matchPartner({ company_name: 'gu ulm' }, P)?.id, 'p2',
    'a podľa názvu bez právnej formy');
  eq(O.matchPartner({ company_name: 'Neznáma firma' }, P), null,
    'keď nesedí nič, nevymýšľa sa — človek ho vyberie');
  eq(O.matchPartner({}, P), null, 'prázdny dopyt nespadne');

  const q = O.toQuote(PLNA, 'p2');
  eq([q.title, q.partner_id, q.trade_key, q.headcount, q.site_city, q.date_from, q.charge_rate, q.worker_rate],
    ['Kotolňa Wörthsee', 'p2', 'zvarac', 4, 'Wörthsee', '2026-11-03', 34, 22],
    'ponuka prevezme odberateľa, profesiu, počet ľudí, miesto, termín a sadzby');
  eq(O.toQuote({ id: 'o9', title: 'X' }).opportunity_id, 'o9', 'ponuka si pamätá, z ktorého dopytu je');
  eq(O.toQuote({ title: 'X' }).opportunity_id, null, 'bez dopytu je väzba prázdna');
  eq(O.toQuote({ title: 'X' }).headcount, 1, 'bez počtu ľudí ponuka počíta s jedným');
  ok(/nie je medzi odberateľmi/.test(O.toQuote({ title: 'X', company_name: 'Nová GmbH' }).notes),
    'keď odberateľ nie je v zozname, ponuka to povie v poznámke');

  const s = O.toSubcontract(PLNA, 'p2');
  eq([s.title, s.partner_id, s.trade, s.site_city, s.date_from, s.charge_rate, s.work_type],
    ['Kotolňa Wörthsee', 'p2', 'zvarac', 'Wörthsee', '2026-11-03', 34, 'construction'],
    'zákazka prevezme údaje z dopytu a je stavebná');
  ok(/4 ľudí/.test(s.notes), 'v poznámke zákazky je, koľko ľudí treba');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo\n`);
process.exit(failed ? 1 : 0);
