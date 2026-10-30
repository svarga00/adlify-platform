// ============================================================================
// Testy: firma na prvý pohľad — logo, vzdialenosť, „Čo sme zistili"
// Spustenie:  node app/lib/marketing/leadview.test.js
// ============================================================================
const V = require('./leadview.js');

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

console.log('Logo a iniciály');
{
  eq(V.initials('Maier Innenausbau GmbH'), 'MI', 'dve slová bez GmbH');
  eq(V.initials('Trockenbau Huber & Söhne'), 'TH', 'bez &');
  eq(V.initials('Weber GmbH & Co. KG'), 'WE', 'jedno slovo = prvé dve písmená');
  eq(V.initials('Ökobau Süd e.K.'), 'ÖS', 'diakritika ostane');
  eq(V.initials(''), '?', 'bez mena otáznik');
  ok(V.hue('Maier Innenausbau GmbH') === V.hue('Maier Innenausbau GmbH') && V.hue('A') !== V.hue('B'), 'farba podľa mena, stále rovnaká');
  ok(V.hue('x') >= 0 && V.hue('x') < 360, 'odtieň 0–359');
  eq(V.domainOf('https://www.Maier-Ausbau.de/kontakt'), 'maier-ausbau.de', 'doména bez www.');
  eq(V.domainOf('fliesen-bauer.de'), 'fliesen-bauer.de', 'aj bez https://');
  eq(V.domainOf(''), '', 'bez webu nič');
  eq(V.faviconUrl('maier-ausbau.de'), 'https://www.google.com/s2/favicons?domain=maier-ausbau.de&sz=64', 'favicon cez Google, 64 px');
  eq(V.faviconUrl('nie je doména'), '', 'neplatná doména = bez faviconu');
  eq(V.logoSources({ name: 'Maier GmbH', website: 'maier.de', logo_url: 'https://maier.de/logo-192.png' }).src, 'https://maier.de/logo-192.png', 'uložené logo má prednosť');
  eq(V.logoSources({ name: 'Maier GmbH', website: 'maier.de', logo_url: 'https://maier.de/logo-192.png' }).fallback,
    'https://www.google.com/s2/favicons?domain=maier.de&sz=64', 'keď sa nenačíta, favicon');
  eq(V.logoSources({ name: 'Maier GmbH', website: 'maier.de', logo_url: 'http://maier.de/l.png' }).src,
    'https://www.google.com/s2/favicons?domain=maier.de&sz=64', 'logo bez https sa nepoužije');
  eq(V.logoSources({ name: 'Maier GmbH' }), { src: '', fallback: '', initials: 'MA', hue: V.hue('Maier GmbH') }, 'bez webu len iniciály');
}

console.log('\nVzdialenosť');
{
  const augsburg = { lat: 48.3705, lng: 10.8978 };
  const munchen = { lat: 48.1351, lng: 11.582 };
  const nz = { lat: 47.9856, lng: 18.1619 };                 // Nové Zámky
  const k = V.km(augsburg, munchen);
  ok(k > 55 && k < 58, `Augsburg – München cca 56 km (${k && k.toFixed(1)})`);
  eq(V.km(augsburg, null), null, 'bez druhého bodu nič');
  eq(V.km(augsburg, { lat: 0, lng: 0 }), null, 'nula-nula je omyl');
  eq(V.fmtKm(4.24), 'cca 4,2 km', 'pod 10 km na desatiny');
  eq(V.fmtKm(312.6), 'cca 313 km', 'inak celé km');
  eq(V.fmtKm(0.4), 'menej ako 1 km', 'pod kilometer');
  eq(V.driveText(56), 'približne 1 h autom', 'odhad cesty: km × 1,3 / 75 km/h, zaokrúhlené na 5 min');
  eq(V.driveText(10), 'približne 10 min autom', 'krátka cesta v minútach');
  eq(V.driveText(540), 'približne 9 h 20 min autom', 'dlhá cesta v hodinách a minútach');

  const d = V.distances({ ...augsburg }, { office: nz, sites: [
    { id: 's1', title: 'Wohnpark Feuerbach', city: 'Stuttgart', lat: 48.7758, lng: 9.1829 },
    { id: 's2', title: 'Hala Pasing', city: 'München', lat: 48.1497, lng: 11.4614 },
    { id: 's3', title: 'Bez polohy' },
  ] });
  ok(d.has && d.office && d.office.km > 520 && d.office.km < 560 && /vzdušnou čiarou$/.test(d.office.text), 'od kancelárie, s „vzdušnou čiarou"', JSON.stringify(d.office));
  eq(d.site && d.site.id, 's2', 'najbližšia bežiaca zákazka');
  ok(/^cca \d+ km vzdušnou čiarou$/.test(d.site.text) && /^približne/.test(d.site.drive), 'text a odhad autom', JSON.stringify(d.site));
  eq(V.distances({ city: 'Ulm' }, { office: nz }), { has: false, office: null, site: null }, 'firma bez súradníc = nič nepočítame');
  eq(V.distances({ ...augsburg }, {}).office, null, 'bez kancelárie len zákazky');

  eq(V.officeOf({ office_coords: '47.9856, 18.1619' }), { lat: 47.9856, lng: 18.1619 }, 'kancelária zo súradníc v Nastaveniach');
  eq(V.officeOf({ office_coords: '47,9856 18,1619' }), { lat: 47.9856, lng: 18.1619 }, 's desatinnou čiarkou');
  eq(V.officeOf({ office_lat: 48.1, office_lng: 17.1 }), { lat: 48.1, lng: 17.1 }, 'alebo office_lat / office_lng');
  eq(V.officeOf({ office_coords: 'https://maps.google.com/@48.1,17.1,15z' }, () => ({ lat: 48.1, lng: 17.1 })), { lat: 48.1, lng: 17.1 }, 'odkaz z Máp cez parser (DanubraGeo)');
  eq(V.officeOf({}), null, 'nezadaná = nič');
}

console.log('\nAdresa a mapa');
{
  eq(V.addressLine({ address: 'Hauptstr. 5, 86150 Augsburg', city: 'Augsburg', postal_code: '86150' }), 'Hauptstr. 5, 86150 Augsburg', 'celá adresa z Máp');
  eq(V.addressLine({ address: 'Hauptstr. 5', city: 'Augsburg', postal_code: '86150' }), 'Hauptstr. 5, 86150 Augsburg', 'ulica + PSČ a mesto');
  eq(V.addressLine({ city: 'Ulm' }), 'Ulm', 'len mesto');
  eq(V.mapsUrl({ data_source: { maps_url: 'https://www.google.com/maps/place/x' } }), 'https://www.google.com/maps/place/x', 'odkaz z Outscraperu');
  eq(V.mapsUrl({ data_source: { maps_url: 'javascript:alert(1)' }, lat: 48.1, lng: 11.5 }), 'https://www.google.com/maps/search/?api=1&query=48.1,11.5', 'zlý odkaz → súradnice');
  ok(/query=Maier%20GmbH%2C%20Ulm$/.test(V.mapsUrl({ name: 'Maier GmbH', city: 'Ulm' })), 'bez súradníc podľa mena a adresy');
}

console.log('\nČo sme zistili');
{
  const now = Date.parse('2026-10-30T12:00:00Z');
  const s = V.summary({
    name: 'Maier Innenausbau GmbH', site_description: 'Ihr Partner für Trockenbau in Augsburg.', categories: ['Trockenbauunternehmen', 'Innenausbau'],
    employees: '20–50', rating: 4.7, reviews_count: 41, score: 92, profile: { similar_to_url: 'https://www.gu-ulm.de', email_source: 'impressum' },
    email: 'info@maier.de', contact_person: 'Thomas Maier', vat_id: 'DE123', phone: '+49', relevance: 1, verified_at: '2026-10-30T08:00:00Z', web_ok: true,
  }, { now, emailFrom: { impressum: 'z Impressum' } });
  eq(s.text, 'Ihr Partner für Trockenbau in Augsburg.', 'krátky popis z webu firmy');
  eq(s.found, [
    'Na Google Mapách: Trockenbauunternehmen, Innenausbau; cca 20–50 zamestnancov (odhad).',
    'Hodnotenie 4,7 z 5 (41 recenzií) na Google Mapách.',
    'AI odhadla podobnosť so zadanými firmami na 92 zo 100, najviac sa podobá na gu-ulm.de.',
    'Z webu a Impressum máme: e-mail z Impressum, konateľ Thomas Maier, USt-IdNr DE123, telefón.',
    'Označili ste ju palcom hore — takéto firmy chceme.',
    'Na Google Mapách overená dnes, web odpovedá.',
  ], '„Čo sme zistili" z uložených údajov');
  const t = V.summary({ why: 'Robí suchú výstavbu ako Vaši odberatelia.', trade: 'suchá výstavba', rating: 4, reviews_count: 1, business_status: 'CLOSED_PERMANENTLY',
    relevance: -1, relevance_note: 'príliš malá', web_ok: false, email_mx_ok: false }, { now });
  eq(t.text, 'Robí suchú výstavbu ako Vaši odberatelia.', 'bez webu popis z AI');
  ok(t.found.some(x => /natrvalo zatvorená/.test(x)) && t.found.some(x => /palcom dole \(príliš malá\)/.test(x))
    && t.found.some(x => /web neodpovedal, doména e-mailu nemá poštový server/i.test(x)), 'zatvorená, palec dole s dôvodom, nefunkčný web', JSON.stringify(t.found));
  eq(V.summary({}).found, [], 'bez údajov nič');
  eq(V.whenText(0), 'dnes', 'dnes'); eq(V.whenText(5), 'pred 5 dňami', 'pred dňami'); eq(V.whenText(90), 'pred 3 mes.', 'pred mesiacmi');
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
