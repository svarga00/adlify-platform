// ============================================================================
// Testy súradníc a vzdialeností
// Spustenie:  node danubra/lib/geo.test.js
// ============================================================================
global.window = global;
const G = require('./geo');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

console.log('Súradnice a vzdialenosti');

// ── Odkazy z máp ────────────────────────────────────────────────────────────
// Toto je jediný spôsob, akým sa súradnice do appky dostanú — nikam sa
// nevolá. Keby sa niektorý tvar nerozoznal, človek by musel čísla prepisovať
// ručne a väčšinou by to nespravil.
{
  const STUTTGART = { lat: 48.7758, lng: 9.1829 };

  eq(G.parseCoords('https://www.google.com/maps/@48.7758,9.1829,15z'), STUTTGART,
    'Google Mapy: výrez @lat,lng,zoom');
  eq(G.parseCoords('https://maps.google.com/?q=48.7758,9.1829'), STUTTGART,
    'Google Mapy: ?q=lat,lng');
  eq(G.parseCoords('https://www.google.com/maps/place/Schlossplatz/@48.7000,9.1000,17z/data=!3m1!4b1!4m5!3d48.7758!4d9.1829'),
    STUTTGART,
    'Google Mapy: poloha miesta (!3d!4d) má prednosť pred stredom výrezu');
  eq(G.parseCoords('https://www.openstreetmap.org/?mlat=48.7758&mlon=9.1829#map=16/48.7000/9.1000'),
    STUTTGART, 'OpenStreetMap: značka mlat/mlon má prednosť');
  eq(G.parseCoords('https://www.openstreetmap.org/#map=15/48.7758/9.1829'), STUTTGART,
    'OpenStreetMap: #map=zoom/lat/lng');
  eq(G.parseCoords('geo:48.7758,9.1829'), STUTTGART, 'geo: odkaz z telefónu');
}

// ── Holé čísla ──────────────────────────────────────────────────────────────
{
  eq(G.parseCoords('48.7758, 9.1829'), { lat: 48.7758, lng: 9.1829 }, 'dvojica s bodkou');
  eq(G.parseCoords('48.7758,9.1829'), { lat: 48.7758, lng: 9.1829 }, 'bez medzery');
  eq(G.parseCoords('48,7758 9,1829'), { lat: 48.7758, lng: 9.1829 },
    'desatinná čiarka oddelená medzerou — tak to píše väčšina ľudí u nás');
  eq(G.parseCoords('  48.7758 ; 9.1829  '), { lat: 48.7758, lng: 9.1829 },
    'bodkočiarka aj medzery navyše');
  eq(G.parseCoords('-33.8688, 151.2093'), { lat: -33.8688, lng: 151.2093 },
    'záporná šírka (južná pologuľa)');
}

// ── Čo sa rozoznať nesmie ───────────────────────────────────────────────────
// Radšej nič než náhodná poloha. Keď sa ubytovanie objaví na mape o 200 km
// vedľa, nikto tomu už neverí.
{
  eq(G.parseCoords(''), null, 'prázdny text');
  eq(G.parseCoords(null), null, 'nič');
  eq(G.parseCoords('Hlavná 12, Nitra'), null, 'adresa nie sú súradnice');
  eq(G.parseCoords('Hauptstraße 118, 70563 Stuttgart'), null,
    'adresa s číslom domu a PSČ sa nesmie čítať ako dvojica čísel');
  eq(G.parseCoords('0, 0'), null, 'nula-nula je skoro vždy omyl, nie Guinejský záliv');
  eq(G.parseCoords('91.0, 10.0'), null, 'šírka nad 90 neexistuje');
  eq(G.parseCoords('48.0, 181.0'), null, 'dĺžka nad 180 neexistuje');
  eq(G.parseCoords('https://maps.app.goo.gl/AbCdEf123'), null,
    'skrátený odkaz súradnice neobsahuje — appka nehádže tip, povie nič');
  eq(G.parseCoords('48.7758'), null, 'jedno číslo nestačí');
}

// ── Vzdialenosť ─────────────────────────────────────────────────────────────
{
  // Stuttgart – Mníchov je vzdušnou čiarou okolo 190 km.
  const stg = { lat: 48.7758, lng: 9.1829 };
  const muc = { lat: 48.1351, lng: 11.5820 };
  const d = G.distanceKm(stg, muc);
  ok(d > 185 && d < 200, `Stuttgart–Mníchov vyšiel ${d} km`);

  eq(G.distanceKm(stg, stg), 0, 'to isté miesto je nula');
  eq(G.distanceKm(stg, null), null, 'bez druhého bodu sa nepočíta');
  eq(G.distanceKm(stg, { lat: 0, lng: 0 }), null, 'neplatný bod nedá číslo');

  // Ubytovanie kúsok od stavby — toto je ten bežný prípad.
  const site = { lat: 48.7758, lng: 9.1829 };
  const bed = { lat: 48.7840, lng: 9.1910 };
  const near = G.distanceKm(site, bed);
  ok(near > 0.9 && near < 1.5, `ubytovanie pri stavbe vyšlo ${near} km`);
}

// ── Po ľudsky ───────────────────────────────────────────────────────────────
{
  eq(G.distanceText(0.4), '400 m vzdušnou čiarou', 'pod kilometer sa hovorí v metroch');
  eq(G.distanceText(12.3), '12,3 km vzdušnou čiarou', 'a inak v kilometroch s čiarkou');
  eq(G.distanceText(null), null, 'bez vzdialenosti niet čo povedať');
  // „Vzdušnou čiarou" je tam zámerne — po ceste to bude vždy viac.
  ok(/vzdušnou čiarou/.test(G.distanceText(5)), 'a vždy sa povie, že je to vzdušne');
}

// ── Výrez mapy ──────────────────────────────────────────────────────────────
{
  const pts = [
    { lat: 48.7758, lng: 9.1829 },
    { lat: 48.1351, lng: 11.5820 },
    { lat: null, lng: null },
    null,
  ];
  const b = G.bounds(pts);
  eq(b.count, 2, 'body bez súradníc sa do výrezu nerátajú');
  eq([b.south, b.north], [48.1351, 48.7758], 'sever a juh');
  eq([b.west, b.east], [9.1829, 11.582], 'západ a východ');
  eq(G.bounds([]), null, 'bez bodov niet výrezu');
  eq(G.bounds([{ lat: 'x', lng: 'y' }]), null, 'nezmysly sa zahodia');

  const c = G.center(pts);
  ok(c.lat > 48.4 && c.lat < 48.5, 'stred je medzi bodmi');
}

// ── Zápis a odkaz ───────────────────────────────────────────────────────────
{
  eq(G.format(48.7758, 9.1829), '48.775800, 9.182900', 'zápis na šesť desatinných miest');
  eq(G.format(0, 0), '', 'neplatnú polohu nezapisujeme vôbec');
  ok(/48\.7758,9\.1829/.test(G.mapsUrl(48.7758, 9.1829)),
    'odkaz na mapu sa dá poslať vodičovi');
  eq(G.mapsUrl(null, null), null, 'bez polohy niet odkazu');
}

// ── Tam a späť ──────────────────────────────────────────────────────────────
// Čo appka zapíše, musí vedieť aj prečítať.
{
  const p = { lat: 48.7758, lng: 9.1829 };
  eq(G.parseCoords(G.format(p.lat, p.lng)), p, 'zápis sa dá prečítať späť');
  eq(G.parseCoords(G.mapsUrl(p.lat, p.lng)), p, 'aj vlastný odkaz na mapu');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
