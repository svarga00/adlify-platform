// ============================================================================
// Testy: export nájdených firiem (found-export.js)
// Spustenie:  node app/lib/marketing/found-export.test.js
// ============================================================================
const FE = require('./found-export.js');

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

console.log('Export nájdených firiem');

const SEARCH = { id: 's1', kind: 'urls', created_at: '2026-11-02T09:14:00Z', params: { region: 'Augsburg', trades: ['trockenbau'] },
  seeds: [{ url: 'https://www.huber-trockenbau.de/', domain: 'huber-trockenbau.de' }, { domain: 'schmidt-ausbau.de' }, { domain: 'weber-bau.de' }] };
const L = [
  { id: 'l1', name: 'Maier Innenausbau GmbH', city: 'Augsburg', postal_code: '86150', address: 'Lindenstraße 3', website: 'https://maier-innenausbau.de',
    email: 'Info@Maier-Innenausbau.de', phone: '+49 821 445500', contact_person: 'Thomas Maier', vat_id: 'DE811222333', rating: 4.7, reviews_count: 41,
    business_status: 'OPERATIONAL', score: 92, relevance: 1, status: 'contacted', next_step_at: '2026-11-05T00:00:00Z', next_step_text: 'Zavolať',
    source: 'outscraper', seed_search_id: 's1', trade: 'suchá výstavba', categories: ['Trockenbauunternehmen'],
    profile: { email_source: 'impressum' }, data_source: { maps_url: 'https://www.google.com/maps/place/Maier' } },
  { id: 'l2', name: '=HYPERLINK("x");"Keller"', city: 'München', email: 'info@keller.de', score: 61, relevance: -1, relevance_note: 'príliš malá',
    status: 'new', source: 'outscraper', seed_search_id: 's1', business_status: 'CLOSED_TEMPORARILY', profile: { email_source: 'outscraper_contacts' },
    trade_keys: ['maliar', 'obkladac'], lat: 48.1, lng: 11.5 },
  { id: 'l3', name: 'Odhlásená GmbH', email: 'info@maier-innenausbau.de', status: 'unsubscribed', seed_search_id: 's1', score: 70 },
  { id: 'l4', name: 'Iné hľadanie', email: 'x@y.de', seed_search_id: 's2', score: 99 },
  { id: 'l5', name: 'Archív', email: 'a@b.de', seed_search_id: 's1', archived_at: '2026-10-01T00:00:00Z' },
];

const ctx = { searches: [SEARCH], outreach: (r) => (r.id === 'l1' ? 'odoslaný 1. e-mail, otvoril' : '') };
const rows = FE.build(FE.leadsOf(L, 's1'), ctx);
const H = rows[0];
eq(H, ['Firma', 'Remeslo', 'Remeslo (DE)', 'Mesto', 'PSČ', 'Adresa', 'Web', 'E-mail', 'Zdroj e-mailu', 'Telefón', 'Konateľ / kontaktná osoba', 'USt-IdNr',
  'Google hodnotenie', 'Počet recenzií', 'Stav na Google', 'Skóre', 'Vhodná (palec)', 'Kategória', 'Oslovenie', 'Ďalší krok', 'Zdroj', 'Hľadanie', 'Google Mapy'],
'stĺpce: kontakt, remeslo SK aj DE, Google, skóre, palec, kategória, oslovenie, ďalší krok, zdroj, hľadanie, Mapy');
eq(rows.slice(1).map(r => r[0]), ['Maier Innenausbau GmbH', 'Odhlásená GmbH', '=HYPERLINK("x");"Keller"'], 'len firmy tohto hľadania, bez archivovaných, podľa skóre');
const m = Object.fromEntries(H.map((h, i) => [h, rows[1][i]]));
eq([m.Remeslo, m['Remeslo (DE)'], m['Zdroj e-mailu'], m['Google hodnotenie'], m['Počet recenzií'], m['Stav na Google'], m['Vhodná (palec)'], m.Kategória],
  ['Sadrokartón', 'Trockenbau', 'z Impressum', '4,7', 41, 'Funguje', 'áno', 'Oslovená'], 'remeslo SK/DE, odkiaľ e-mail, hodnotenie s čiarkou, stav, palec, kategória');
eq([m.Oslovenie, m['Ďalší krok'], m.Zdroj, m.Hľadanie, m['Google Mapy']],
  ['odoslaný 1. e-mail, otvoril', '2026-11-05 Zavolať', 'Google Mapy', '2026-11-02 · huber-trockenbau.de, schmidt-ausbau.de, weber-bau.de (Augsburg)',
    'https://www.google.com/maps/place/Maier'], 'oslovenie, ďalší krok, zdroj, hľadanie (dátum + vzorové weby), odkaz na Mapy');
const k = Object.fromEntries(H.map((h, i) => [h, rows[3][i]]));
eq([k.Remeslo, k['Remeslo (DE)'], k['Vhodná (palec)'], k['Stav na Google'], k['Zdroj e-mailu'], k['Google Mapy']],
  ['Maľovanie, Obklady a dlažby', 'Maler- und Lackierarbeiten, Fliesenarbeiten', 'nie – príliš malá', 'Dočasne zatvorená', 'z webu (Outscraper)',
    'https://www.google.com/maps/search/?api=1&query=48.1,11.5'], 'ručné remeslá (slovensky aj nemecky), palec dole s dôvodom, Mapy zo súradníc');

// CSV: BOM, bodkočiarky, úvodzovky, vzorec.
const text = FE.csvText(rows);
ok(text.charCodeAt(0) === 0xfeff, 'súbor začína BOM (Excel prečíta diakritiku)');
ok(text.split('\r\n')[0].split(';').length === H.length && text.includes('\r\n'), 'oddeľovač bodkočiarka, riadky CRLF');
ok(text.includes(`"'=HYPERLINK(""x"");""Keller"""`), 'úvodzovky zdvojené, hodnota so „=" sa nevyhodnotí ako vzorec', text.split('\r\n')[3]);
ok(text.includes('Lindenstraße 3') && text.includes('Maľovanie'), 'diakritika a ß ostanú');

// E-maily na skopírovanie.
eq(FE.emails(FE.leadsOf(L, 's1')), ['info@maier-innenausbau.de', 'info@keller.de'], 'e-maily: malými, bez duplicít, bez odhlásených a archivovaných');
eq(FE.emails([{ email: 'zle' }, { email: ' a@b.de ' }, { email: 'a@b.de' }]), ['a@b.de'], 'neplatné a duplicity von');
eq(FE.fileParts(SEARCH), ['nove-firmy', 'hladanie', '2026-11-02', 'huber-trockenbau.de'], 'názov súboru: dátum a prvý vzorový web');
eq(FE.searchText({ kind: 'ai', created_at: '2026-10-01T00:00:00Z' }), '2026-10-01 · podľa odberateľov', 'hľadanie cez AI');
eq(FE.build([], ctx).length, 1, 'bez firiem len nadpisy');

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
