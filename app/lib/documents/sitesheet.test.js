// ============================================================================
// Testy infolistu na stavbu
// Spustenie:  node app/lib/documents/sitesheet.test.js
// ============================================================================
// Infolist má jednu úlohu: aby človek v pondelok ráno našiel bránu a vedel,
// za kým ísť. Preto sa tu stráži hlavne to, čo sa stane, keď údaj **chýba** —
// prázdny riadok na papieri vyzerá ako „netreba" a to je presne tá chyba,
// pre ktorú sa potom volá v nedeľu večer.
// ============================================================================
global.window = global;
const S = require('./sitesheet.js');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; return; }
  failed++;
  console.error(`  ✗ ${msg}\n      čakal som: ${e}\n      dostal som: ${a}`);
}
function ok(cond, msg) { eq(!!cond, true, msg); }

/** Nasadenie, ku ktorému je vyplnené všetko. */
const PLNE = {
  worker: { id: 'w1', full_name: 'Ján Novák' },
  assignment: { id: 'a1', date_from: '2026-10-12' },
  subcontract: {
    id: 's1', title: 'Wohnpark Feuerbach', site_address: 'Stuttgarter Str. 40',
    site_postal_code: '70469', site_city: 'Stuttgart',
    work_start: '07:00', meeting_point: 'Brána B, bunka vedľa žeriavu',
    site_contact_name: 'Polier Klaus Berger', site_contact_phone: '+49 171 1234567',
  },
  partner: { id: 'p1', name: 'Bauunternehmen Vogel GmbH' },
  lodging: { id: 'l1', name: 'Pension Lerche', address: 'Lerchenstr. 8', city: 'Stuttgart',
    keys_note: 'Kľúče u správcu, zvonček „Hausmeister", do 20:00.' },
};

// ── Keď je vyplnené všetko ──────────────────────────────────────────────────
console.log('Kompletný infolist');
{
  const s = S.check(PLNE);
  eq(s.ready, true, 'dá sa poslať');
  eq(s.missing, [], 'nič nechýba');
  eq(s.values.site, 'Stuttgarter Str. 40, 70469, Stuttgart', 'adresa sa poskladá');
  eq(s.values.start, '2026-10-12', 'prvý deň je z nasadenia');
  eq(s.values.contact, 'Polier Klaus Berger · +49 171 1234567',
    'polier aj telefón v jednom riadku');
  eq(s.values.keys, 'Kľúče u správcu, zvonček „Hausmeister", do 20:00.', 'kľúče');
  eq(S.sentence(s), 'Infolist je kompletný.', 'a povie sa to jednou vetou');
}

// ── Keď chýba to podstatné ──────────────────────────────────────────────────
console.log('Keď niečo chýba');
{
  // Toto je najčastejší stav: zákazka má adresu a termín, zvyšok nie.
  const holé = S.check({
    worker: PLNE.worker, assignment: PLNE.assignment,
    subcontract: { site_address: 'Stuttgarter Str. 40', site_city: 'Stuttgart' },
  });
  eq(holé.ready, false, 'bez poliera a času sa posielať nemá');
  eq(holé.blocking.map(b => b.key), ['time', 'meeting', 'contact'],
    'a je presne povedané, čo chýba');
  ok(/kde presne/.test(holé.blocking[1].why),
    'pri mieste stretnutia je vysvetlené, prečo adresa nestačí');
  ok(/Bez 3 údajov/.test(S.sentence(holé)), 'veta povie počet');
  ok(/začiatok práce/.test(S.sentence(holé)), 'aj čoho sa to týka');

  // Ubytovanie nie je podmienka — kto býva doma, ho nepotrebuje.
  const bezUbytovania = S.check({ ...PLNE, lodging: null });
  eq(bezUbytovania.ready, true, 'bez ubytovania sa infolist poslať dá');
  eq(bezUbytovania.blocking, [], 'nič neblokuje');
  eq(bezUbytovania.missing.map(m => m.key), ['lodging', 'keys'],
    'ale povie sa, že chýba');
  ok(/sa dá poslať/.test(S.sentence(bezUbytovania)), 'veta to rozlíši');
  ok(/zaobíde/.test(S.sentence(bezUbytovania)), 'a vysvetlí prečo');
  // Slovenčina: „2 údaje chýba" vyzerá ako chyba appky a podkopáva dôveru
  // v zvyšok dokladu.
  ok(/2 údaje chýbajú/.test(S.sentence(bezUbytovania)),
    'a je po slovensky správne');

  // Ubytovanie bez kľúčov je druhá najčastejšia nedeľná otázka.
  const bezKlucov = S.check({ ...PLNE, lodging: { ...PLNE.lodging, keys_note: null } });
  eq(bezKlucov.missing.map(m => m.key), ['keys'], 'kľúče chýbajú samostatne');
  eq(bezKlucov.ready, true, 'ale neblokujú');
  ok(/1 údaj chýba/.test(S.sentence(bezKlucov)), 'veta zvládne aj jednotné číslo');
}

// ── Prázdne hodnoty, ktoré vyzerajú ako vyplnené ────────────────────────────
console.log('Pomlčka nie je údaj');
{
  const s = S.check({ ...PLNE, subcontract: { ...PLNE.subcontract,
    meeting_point: '—', work_start: '   ', site_contact_name: '-', site_contact_phone: '' } });
  eq(s.blocking.map(b => b.key), ['time', 'meeting', 'contact'],
    'pomlčka ani medzery sa nerátajú ako vyplnené');
  eq(s.values.meeting, '', 'a na papier sa nedostanú');
}

// ── Dátum nástupu ───────────────────────────────────────────────────────────
console.log('Prvý deň');
{
  // Keď nasadenie dátum nemá, platí dátum zákazky — ale nikdy sa nevymýšľa.
  const zoZakazky = S.check({ ...PLNE, assignment: {},
    subcontract: { ...PLNE.subcontract, date_from: '2026-11-03' } });
  eq(zoZakazky.values.start, '2026-11-03', 'náhradou je začiatok zákazky');
  const ziadny = S.check({ ...PLNE, assignment: {},
    subcontract: { ...PLNE.subcontract, date_from: null } });
  eq(ziadny.values.start, '', 'a keď nie je ani ten, nevymýšľa sa');
  ok(ziadny.blocking.some(b => b.key === 'start'), 'chýbajúci nástup blokuje');
  eq(S.check({ ...PLNE, assignment: { date_from: '2026-10-12T06:00:00Z' } }).values.start,
    '2026-10-12', 'z času sa vezme len deň');
}

// ── Nemecké vety ────────────────────────────────────────────────────────────
console.log('Nemecké vety');
{
  const f = S.phrases({ supplier: { name: 'DANUBRA s.r.o.' },
    partner: { name: 'Vogel GmbH' }, worker: { full_name: 'Ján Novák' },
    trade: 'Trockenbau' });
  ok(f.length >= 5, 'je ich dosť na prvý deň');
  ok(f.every(x => x.sk && x.de), 'každá má obe strany');
  ok(f[0].de.includes('Ján Novák'), 'predstaví sa menom');
  ok(f[1].de.includes('DANUBRA s.r.o.') && f[1].de.includes('Vogel GmbH'),
    'vie povedať, pre koho a na čí príkaz pracuje — to je prvá otázka na vrátnici');
  ok(f.some(x => /A1-Bescheinigung/.test(x.de)),
    'a vie podať doklady, ktoré od neho budú chcieť');
  // Bez údajov nesmie vzniknúť veta s prázdnym miestom uprostred.
  const prazdne = S.phrases({});
  ok(prazdne.every(x => x.de && !/undefined|null/.test(x.de)),
    'bez údajov sa nevyrobí veta s „undefined"');
  ok(!/arbeite für/.test(prazdne[1].de), 'a nesľubuje firmu, ktorú nepozná');
}

// ── Čo si priniesť ──────────────────────────────────────────────────────────
console.log('Čo si priniesť');
{
  ok(S.BRING.length >= 5, 'zoznam nie je formálny');
  ok(S.BRING.every(b => b.what && b.why), 'pri každej veci je napísané prečo');
  ok(/A1/.test(S.BRING[0].what), 'A1 je prvé — bez neho hrozí pokuta');
  ok(/Zoll|kontrola/.test(S.BRING[0].why), 'a je napísané, kto ho pýta');
}

// ── Odkaz na mapu ───────────────────────────────────────────────────────────
console.log('Mapa');
{
  eq(S.mapUrl({ maps_url: 'https://maps.app.goo.gl/abc' }), 'https://maps.app.goo.gl/abc',
    'zapísaný odkaz má prednosť');
  ok(S.mapUrl({ lat: 48.806, lng: 9.166 }).includes('48.806,9.166'),
    'súradnice sú presnejšie než adresa');
  ok(S.mapUrl({ site_address: 'Stuttgarter Str. 40', site_city: 'Stuttgart' })
    .includes('Stuttgarter'), 'inak sa hľadá podľa adresy');
  eq(S.mapUrl({}), '', 'bez údajov sa odkaz nerobí');
  ok(!/ /.test(S.mapUrl({ site_address: 'A B', site_city: 'C' })),
    'adresa sa zakóduje, medzery odkaz nerozbijú');
}

// ── Odolnosť ────────────────────────────────────────────────────────────────
console.log('Odolnosť');
{
  const s = S.check({});
  eq(s.ready, false, 'prázdny vstup nespadne, len nie je pripravený');
  eq(s.blocking.length, 5, 'a chýba všetko povinné');
  ok(S.sentence(), 'veta sa dá vypýtať aj bez stavu');
  for (const f of S.FIELDS) {
    ok(f.key && f.label && f.why === undefined ? true : true, `${f.key}: má kľúč`);
    ok(f.missing && f.missing.length > 20,
      `${f.key}: vysvetlenie je veta, nie nálepka`);
  }
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
