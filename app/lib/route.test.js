// ============================================================================
// Testy cesty od kandidáta na stavbu
// Spustenie:  node app/lib/route.test.js
// ============================================================================
global.window = global;
const R = require('./route.js');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg, detail) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${detail ? `\n    ${detail}` : ''}`); }
}

console.log('Cesta na stavbu');

// ── Dotaz na adresu ─────────────────────────────────────────────────────────
{
  const u = R.geocodeUrl('Žilina, Hlinkova 5');
  ok(u.startsWith('https://nominatim.openstreetmap.org/search?'), 'pýta sa OpenStreetMap');
  ok(/countrycodes=sk%2Ccz%2Cde%2Cat%2Cpl%2Chu/.test(u), 'len v krajinách, odkiaľ a kam sa chodí');
  ok(/q=%C5%BDilina/.test(u), 'diakritika ide správne zakódovaná', u);
}

// ── Podoby adresy ───────────────────────────────────────────────────────────
// Lixenried: „93437 Lixenried b. Furth im Walde, Nemecko" sa nenašlo.
{
  eq(R.variants('93437 Lixenried b. Furth im Walde, Nemecko'),
    ['93437 Lixenried bei Furth im Walde', '93437 Lixenried',
      '93437 Lixenried b. Furth im Walde, Nemecko', 'Lixenried'],
    'očistená adresa, PSČ s obcou, pôvodný text, samotná obec');
  eq(R.variants('Nitra'), ['Nitra'], 'jednoduché mesto ostane jedno');
  eq(R.variants('Hammelburg, Deutschland'), ['Hammelburg', 'Hammelburg, Deutschland'],
    'krajina sa skúsi aj bez nej');
  eq(R.variants(''), [], 'prázdne nič');
}

// ── Odpoveď Nominatimu ──────────────────────────────────────────────────────
{
  eq(R.pickPlace([{ lat: '49.2231', lon: '18.7394',
    display_name: 'Žilina, okres Žilina, Žilinský kraj, Slovensko' }]),
    { lat: 49.2231, lng: 18.7394, label: 'Žilina, okres Žilina' }, 'prvý výsledok so skráteným názvom');
  eq(R.pickPlace([]), null, 'nič sa nenašlo');
  eq(R.pickPlace(null), null, 'rozbitá odpoveď nespadne');
  eq(R.pickPlace([{ lat: '0', lon: '0' }]), null, 'nula-nula nie je miesto');
}

// ── Trasa z OSRM ────────────────────────────────────────────────────────────
{
  const u = R.routeUrl({ lat: 49.22, lng: 18.74 }, { lat: 49.31, lng: 12.83 });
  ok(/driving\/18\.74,49\.22;12\.83,49\.31\?/.test(u), 'OSRM chce najprv dĺžku, potom šírku', u);
  const r = R.pickRoute({ code: 'Ok', routes: [{ distance: 612345, duration: 21900,
    geometry: { coordinates: [[18.74, 49.22], [12.83, 49.31]] } }] });
  eq(r.km, 612, 'kilometre zaokrúhlené');
  eq(r.minutes, 365, 'minúty zaokrúhlené');
  eq(r.line, [[49.22, 18.74], [49.31, 12.83]], 'čiara pre mapu je [šírka, dĺžka]');
  eq(R.pickRoute({ code: 'NoRoute' }), null, 'bez trasy nič');
  eq(R.pickRoute(null), null, 'rozbitá odpoveď nespadne');
}

// ── Text do hovoru ──────────────────────────────────────────────────────────
{
  eq(R.durationText(45), '45 min', 'menej ako hodina');
  eq(R.durationText(60), '1 h', 'presne hodina');
  eq(R.durationText(365), '6 h 05 min', 'hodiny a minúty s nulou');
  eq(R.sentence({ km: 612, minutes: 365 }), '612 km autom, asi 6 h 05 min.', 'veta, ktorá sa dá povedať');
  eq(R.sentence(null), '', 'bez trasy prázdne');
  ok(/google\.com\/maps\/dir\/\?api=1/.test(R.googleDirUrl('Žilina', 'Lixenried')), 'odkaz na trasu do správy');
}

// ── Kam ide ─────────────────────────────────────────────────────────────────
{
  eq(R.destinationOf({ analysis: { place: 'Lixenried bei Furth im Walde, 93437, Nemecko' }, city: 'Furth' }),
    'Lixenried bei Furth im Walde, 93437, Nemecko', 'presné miesto zo zhrnutia má prednosť');
  eq(R.destinationOf({ analysis: { place: '[XX]' }, city: 'Hammelburg', country: 'DE' }),
    'Hammelburg, Deutschland', 'nedoplnené miesto sa nepoužije; mesto dostane krajinu');
  eq(R.destinationOf({ city: 'Wien', country: 'AT' }), 'Wien', 'iná krajina sa nedopĺňa');
  eq(R.destinationOf({}, { site_city: 'Ulm' }), 'Ulm, Deutschland', 'inak mesto zákazky');
  eq(R.destinationOf({}, {}), '', 'bez ničoho prázdne');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
