// ============================================================================
// Testy: nové firmy z Google Máp (Outscraper) a ich aktuálnosť
// Spustenie:  node app/lib/marketing/outscraper.test.js
// ============================================================================
// Bez siete: čisté pravidlá (outscraper.js) a klient (outscraper-server.js)
// s podstrčeným fetch. Skutočné API Outscraperu sa tu nikdy nevolá.
// ============================================================================
const O = require('./outscraper.js');
const OS = require('./outscraper-server.js');

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

console.log('Outscraper — Google Mapy a aktuálnosť');

// ── Limity a odhad ──────────────────────────────────────────────────────────
eq([O.maxRecords(undefined), O.maxRecords('500'), O.maxRecords('3'), O.maxRecords('x'), O.maxRecords(99999)], [200, 500, 10, 200, 5000],
  'OUTSCRAPER_MAX_RECORDS: predvolene 200, 10 až 5000');
eq([O.minScore(''), O.minScore('70'), O.minScore(150), O.minScore('abc')], [50, 70, 100, 50], 'prah skóre: predvolene 50, 0 až 100');
eq([O.budget({ count: 20 }), O.budget({ count: 50 }), O.budget({ count: 50, max: 500 }), O.budget({ count: 10, max: 20 })], [60, 150, 150, 20],
  'rozpočet = počet × 3, najviac strop');
eq(O.estimate({ count: 30, max: 200 }), 90, 'odhad do okna: 30 firiem → cca 90 záznamov');

// ── Dotazy ──────────────────────────────────────────────────────────────────
eq(O.combine(['Trockenbau', 'Bauunternehmen'], ['München', 'Augsburg']),
  ['Trockenbau, München', 'Bauunternehmen, München', 'Trockenbau, Augsburg', 'Bauunternehmen, Augsburg'], 'kategórie × lokality');
eq(O.combine(['Fliesenleger'], []), ['Fliesenleger, Deutschland'], 'bez lokality celé Nemecko');
{
  const p = O.planQueries({ queries: ['Trockenbau, München', 'trockenbau,  münchen', 'x', 'Maler\n<b>betrieb</b>, Ulm'],
    categories: ['Trockenbau', 'Bauunternehmen'], locations: ['München', 'Augsburg', 'Dachau', 'Freising', 'Erding', 'Landshut'], count: 20 });
  eq(p.queries.length, 10, 'najviac 10 dotazov');
  eq(p.queries.slice(0, 2), ['Trockenbau, München', 'Maler betrieb, Ulm'], 'dotazy od AI prvé, bez duplicít a bez značiek');
  eq([p.perQuery, p.estimate, p.budget], [6, 60, 60], 'limit na dotaz tak, aby spolu neprekročili počet × 3');
  const small = O.planQueries({ categories: ['Maler', 'Fliesen', 'Elektro', 'Metallbau'], locations: ['Ulm', 'Köln', 'Bonn'], count: 10, max: 20 });
  ok(small.queries.length * small.perQuery <= 20 && small.queries.length === 4 && small.perQuery === 5, 'malý strop → menej dotazov, nie menej ako 5 na dotaz', JSON.stringify(small));
  eq(O.planQueries({}).queries, [], 'bez kategórií žiadny dotaz');
}

// ── Požiadavka ──────────────────────────────────────────────────────────────
{
  const qs = O.queryString(O.mapsParams({ queries: ['Trockenbau, München', 'Maler & Co, Ulm'], limit: 6 }));
  eq(qs, 'query=Trockenbau%2C%20M%C3%BCnchen&query=Maler%20%26%20Co%2C%20Ulm&limit=6&organizationsPerQueryLimit=6&language=de&region=DE&dropDuplicates=false&async=false',
    'parametre Maps search: query viackrát, limit, de/DE, async');
  eq([O.apiBase(''), O.apiBase('https://api.app.outscraper.cloud/x'), O.apiBase('https://evil.example/'), O.apiBase('http://api.app.outscraper.com')],
    ['https://api.app.outscraper.com', 'https://api.app.outscraper.cloud', 'https://api.app.outscraper.com', 'https://api.app.outscraper.com'],
    'kľúč ide len na domény Outscraperu cez https');
}

// ── Odpoveď ─────────────────────────────────────────────────────────────────
eq(O.readResponse({ id: 'a1b2c3d4', status: 'Success', data: [[{ name: 'A' }]] }).kind, 'done', 'synchrónna odpoveď → hotovo');
eq(O.readResponse({ id: 'a1b2c3d4e5', status: 'Pending', results_location: 'https://x' }), { kind: 'pending', id: 'a1b2c3d4e5' }, 'asynchrónna → čakať na id');
eq(O.readResponse({ id: '../../etc', status: 'Pending' }).kind, 'error', 'id s cestou sa nepoužije');
ok(/kredit|Outscraper: Not enough/.test(O.readResponse({ error: true, errorMessage: 'Not enough credits' }).message), 'chyba z tela odpovede sa povie');
eq(O.readResponse({ status: 'Failed' }).kind, 'error', 'zlyhaná požiadavka');
eq(O.readResponse([[{ name: 'A' }]]).kind, 'done', 'holé pole výsledkov');
ok(!/sk-/.test(O.httpError(401, {})) && /OUTSCRAPER_API_KEY/.test(O.httpError(401, {})), '401 → skontrolujte kľúč (bez kľúča v texte)');
ok(/kredit/.test(O.httpError(402, {})), '402 → kredit');
eq(O.groups([[{ name: 'A' }], [{ name: 'B' }, { name: 'C' }]], ['q1', 'q2']).map(g => g.length), [1, 2], 'výsledky po dotazoch');
eq(O.groups([{ name: 'A', query: 'q2' }, { name: 'B', query: 'q1' }], ['q1', 'q2']).map(g => g.map(x => x.name)), [['B'], ['A']],
  'jedno pole → skupiny podľa poľa query');
eq(O.flatten([[{ name: 'A' }], [{ name: 'B' }]], ['q1', 'q2']).map(x => [x.name, x._q]), [['A', 0], ['B', 1]], 'všetky firmy spolu');

// ── Firma ───────────────────────────────────────────────────────────────────
const RAW = {
  query: 'Trockenbau, München', name: 'Huber Ausbau GmbH', full_address: 'Gewerbering 14, 85221 Dachau', street: 'Gewerbering 14',
  postal_code: '85221', city: 'Dachau', state: 'Bayern', country_code: 'de', latitude: 48.26, longitude: 11.43,
  phone: '+49 8131 123456', site: 'https://www.huber-ausbau.de/?utm_source=gmb', category: 'Trockenbauunternehmen',
  subtypes: 'Trockenbauunternehmen, Bauunternehmen, trockenbauunternehmen', rating: 4.64, reviews: 38,
  business_status: 'OPERATIONAL', place_id: 'ChIJ_huber_123', google_id: '0x479e:0x1', verified: true,
  location_link: 'https://www.google.com/maps/place/Huber/@48.26,11.43', description: 'Trockenbau seit 1990',
};
{
  const p = O.normPlace(RAW);
  eq([p.name, p.website, p.domain, p.phone, p.address, p.postal_code, p.city, p.region, p.country_code],
    ['Huber Ausbau GmbH', 'https://www.huber-ausbau.de', 'huber-ausbau.de', '+49 8131 123456', 'Gewerbering 14', '85221', 'Dachau', 'Bayern', 'DE'],
    'mapovanie polí: názov, web (bez parametrov), doména, telefón, adresa');
  eq([p.rating, p.reviews_count, p.business_status, p.lat, p.lng, p.verified, p.key], [4.6, 38, 'OPERATIONAL', 48.26, 11.43, true, 'ChIJ_huber_123'],
    'hodnotenie, recenzie, stav, súradnice, place_id');
  eq(p.categories, ['Trockenbauunternehmen', 'Bauunternehmen'], 'kategórie bez opakovania');
  eq(p.maps_url, 'https://www.google.com/maps/place/Huber/@48.26,11.43', 'odkaz na Mapy');
  const s = O.normPlace({ name: 'X', site: 'https://www.facebook.com/xbau', phone: '0821 / 44 55-0', rating: 9, reviews: -1, location_link: 'javascript:alert(1)', place_id: 'ChIJabc' });
  eq([s.website, s.social, s.phone, s.rating, s.reviews_count], [null, 'https://www.facebook.com', '+49 821 44550', null, null],
    'Facebook nie je web firmy; nemecký telefón sa zjednotí; nezmysly preč');
  ok(/place_id:ChIJabc/.test(s.maps_url), 'zlý odkaz na Mapy sa nahradí odkazom podľa place_id');
  eq(['OPERATIONAL', 'closed temporarily', 'Closed_Permanently', 'open', 'x', null].map(O.normStatus),
    ['OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY', 'OPERATIONAL', null, null], 'business_status');
}

// ── Vyradenie a duplicity ──────────────────────────────────────────────────
const P = (o) => O.normPlace({ ...RAW, ...o });
{
  const places = [
    P({}),                                                                              // ostáva
    P({ place_id: 'ChIJ_huber_123', name: 'Huber Ausbau GmbH' }),                       // duplicita (place_id)
    P({ place_id: 'p2', google_id: 'g2', name: 'Inak Huber', site: 'huber-ausbau.de' }), // duplicita (doména)
    P({ place_id: 'p3', google_id: 'g3', name: 'Zatvorená GmbH', site: 'zatvorena.de', business_status: 'CLOSED_PERMANENTLY' }),
    P({ place_id: 'p4', google_id: 'g4', name: 'Pauza Bau', site: 'pauza-bau.de', business_status: 'CLOSED_TEMPORARILY' }),
    P({ place_id: 'p5', google_id: 'g5', name: 'Bez Webu Bau', site: '' }),
    P({ place_id: 'p6', google_id: 'g6', name: 'Wien Bau', site: 'wien-bau.at', country_code: 'AT' }),
    P({ place_id: 'p7', google_id: 'g7', name: 'Müller Bau GmbH', site: 'mueller-bau.de', city: 'Ulm' }),   // už máme (doména)
    P({ place_id: 'p8', google_id: 'g8', name: 'Odhlásená GmbH', site: 'odhlasena.de' }),                  // odhlásená
    P({ place_id: 'p9', google_id: 'g9', name: 'Vzor GmbH', site: 'www.vzor-firma.de' }),                  // zadaná
    P({ place_id: 'known-1', google_id: 'g10', name: 'Známa podľa Máp', site: 'znama.de' }),               // už máme (place_id)
    P({ place_id: 'p11', google_id: 'g11', name: 'Huber Ausbau', site: 'iny-huber.de', postal_code: '85221' }), // meno + PSČ
    P({ place_id: 'p12', google_id: 'g12', name: '' }),
  ];
  const f = O.filterPlaces(places, {
    leads: [{ name: 'Müller Bau GmbH', city: 'Ulm', website: 'mueller-bau.de' }], partners: [],
    optouts: [{ email: 'info@odhlasena.de' }], seeds: [{ url: 'https://vzor-firma.de/' }], placeIds: ['known-1'],
  });
  eq(f.kept.map(x => x.name), ['Huber Ausbau GmbH', 'Pauza Bau'], 'ostanú len nové fungujúce firmy s webom');
  eq(f.stats, { no_name: 1, closed: 1, foreign: 1, no_web: 1, duplicate: 3, known: 2, seed: 1, optout: 1, low_score: 0, over_count: 0 },
    'každý dôvod vyradenia sa počíta');
  eq(f.tempClosed, 1, 'dočasne zatvorená ostáva, len sa označí');
  const g = O.filterPlaces([P({ site: '' })], { withoutWeb: true });
  eq(g.kept.length, 1, '„aj firmy bez webu" ich nechá');
}

// ── E-mail a kontakty ───────────────────────────────────────────────────────
{
  const c = O.readContacts([[{ query: 'huber-ausbau.de', emails: [{ value: 'h.huber@huber-ausbau.de' }, { value: 'info@huber-ausbau.de' },
    { value: 'kontakt@webdesign-agentur.de' }], phones: [{ value: '+49 8131 99' }, { value: '089 1234567' }] }]]);
  eq(c.get('huber-ausbau.de').emails.length, 3, 'kontakty z Outscraperu sa prečítajú (aj pole polí)');
  eq(O.pickContactEmail(c.get('huber-ausbau.de').emails, 'https://huber-ausbau.de').email, 'info@huber-ausbau.de', 'firemný e-mail z vlastnej domény má prednosť');
  eq(O.pickContactEmail(['h.huber@huber-ausbau.de', 'info@agentur.de'], 'https://huber-ausbau.de').email, 'h.huber@huber-ausbau.de',
    'osobný len z vlastnej domény, cudzia doména nie');
  eq(O.pickContactEmail(['noreply@huber-ausbau.de'], 'https://huber-ausbau.de'), null, 'noreply nikdy');
  eq(O.readContacts([{ domain: 'a.de', emails: ['Info@A.de'] }]).get('a.de').emails, ['info@a.de'], 'aj jednoduchý tvar so stringami');
}

// ── Skóre a výber ───────────────────────────────────────────────────────────
{
  const cands = ['A', 'B', 'C', 'D', 'E'].map((n, i) => ({ id: `f${i + 1}`, place: { name: n, reviews_count: i } }));
  const s = O.selectScored(cands, [{ id: 'f1', score: 80 }, { id: 'f2', score: 49 }, { id: 'f3', score: 95, why: 'Robí to isté.' },
    { id: 'f4', score: 80 }, { id: 'x', score: 100 }], { min: 50, count: 2 });
  eq(s.selected.map(x => [x.place.name, x.score]), [['C', 95], ['D', 80]], 'nad prahom, zoradené (pri zhode viac recenzií), najviac počet');
  eq([s.low.map(x => x.place.name), s.over.map(x => x.place.name)], [['B', 'E'], ['A']], 'pod prahom aj bez skóre = nízke; zvyšok nad počet');
}

// ── Riadok ──────────────────────────────────────────────────────────────────
{
  const c = { place: P({ business_status: 'CLOSED_TEMPORARILY' }), site: { ok: true, impressumUrl: 'https://www.huber-ausbau.de/impressum' },
    imp: { contact_person: 'Karl Huber', vat_id: 'DE 123 456 789', phone: '+49 8131 1', address: 'Iná 1', postal_code: '85221', city: 'Dachau' },
    email: { email: 'Info@huber-ausbau.de', kind: 'generic', source: 'impressum' }, mx: true,
    score: 88, why: 'Suchá výstavba.', similar_to_url: 'vzor-firma.de', trade: 'suchá výstavba' };
  const r = O.toLead(c, { searchId: 's1', seeds: [{ url: 'https://vzor-firma.de/' }], now: new Date('2026-10-30T10:00:00Z') });
  eq([r.source, r.status, r.name, r.email, r.phone, r.address, r.contact_person, r.vat_id, r.score, r.seed_search_id],
    ['outscraper', 'new', 'Huber Ausbau GmbH', 'info@huber-ausbau.de', '+49 8131 123456', 'Gewerbering 14', 'Karl Huber', 'DE123456789', 88, 's1'],
    'riadok: zdroj outscraper, telefón a adresa z Máp, konateľ a USt-IdNr z Impressum');
  eq([r.google_place_id, r.rating, r.reviews_count, r.business_status, r.verified_at, r.closed_at, r.web_ok, r.email_mx_ok],
    ['ChIJ_huber_123', 4.6, 38, 'CLOSED_TEMPORARILY', '2026-10-30T10:00:00.000Z', null, true, true], 'údaje z Máp a overenia');
  eq([r.data_source.phone, r.data_source.address, r.data_source.email, r.data_source.contact_person, r.data_source.maps_query],
    ['maps', 'maps', 'impressum', 'impressum', 'Trockenbau, München'], 'data_source: odkiaľ ktorý údaj je');
  eq([r.profile.similar_to_url, r.profile.temp_closed, r.profile.email_source], ['https://vzor-firma.de/', true, 'impressum'], 'profil: podobná firma, dočasne zatvorená');
  const legacy = O.legacyRow(r);
  ok(legacy.source === 'urls' && !('google_place_id' in legacy) && legacy.profile.maps.place_id === 'ChIJ_huber_123',
    'bez migrácie 079 sa uloží ako „podľa webov" s údajmi z Máp v profile');
}

// ── Aktuálnosť ──────────────────────────────────────────────────────────────
{
  eq(O.refreshQuery({ google_place_id: 'ChIJ_huber_123', name: 'X' }), { q: 'ChIJ_huber_123', byId: true }, 'overenie podľa place_id');
  eq(O.refreshQuery({ name: 'Huber Ausbau GmbH', postal_code: '85221', city: 'Dachau' }), { q: 'Huber Ausbau GmbH, 85221 Dachau', byId: false },
    'bez place_id podľa mena a mesta');
  eq(O.refreshQuery({ name: '' }), null, 'bez mena nič');
  const lead = { name: 'Huber Ausbau GmbH', postal_code: '85221', city: 'Dachau', website: 'https://huber-ausbau.de' };
  const cand = [P({ name: 'Huber Elektro', site: 'huber-elektro.de', place_id: 'q1' }), P({})];
  eq(O.matchPlace(lead, cand).place_id, 'ChIJ_huber_123', 'spáruje sa podľa domény a mena');
  eq(O.matchPlace({ name: 'Iná Firma', city: 'Köln' }, cand), null, 'cudziu firmu radšej nie');
  eq(O.matchPlace({ google_place_id: 'old-id', name: 'Huber' }, [P({ place_id: 'new-id' })], { byId: true }).place_id, 'new-id',
    'dotaz podľa id s jedným výsledkom sa berie');

  const now = new Date('2026-11-02T06:00:00Z');
  const L = { id: 'l1', name: 'Huber Ausbau GmbH', phone: '+49 8131 1', website: 'https://huber-ausbau.de', business_status: 'OPERATIONAL',
    rating: 4.2, reviews_count: 20, closed_at: null, data_source: { name: 'maps' } };
  const a = O.refreshPatch(L, P({ business_status: 'CLOSED_PERMANENTLY', site: 'https://huber-neu.de' }), { now, webOk: false, mxOk: true });
  eq([a.patch.business_status, a.patch.closed_at, a.patch.verified_at, a.patch.phone, a.patch.website, a.patch.rating, a.patch.reviews_count, a.patch.web_ok],
    ['CLOSED_PERMANENTLY', '2026-11-02T06:00:00.000Z', '2026-11-02T06:00:00.000Z', '+49 8131 123456', 'https://huber-neu.de', 4.6, 38, false],
    'zatvorená → closed_at, nový telefón, web, hodnotenie, overené');
  ok(!('status' in a.patch), 'stav firmy (Nová, Oslovená…) sa nemení');
  eq(a.patch.data_source.previous, { phone: '+49 8131 1', website: 'https://huber-ausbau.de' }, 'staré hodnoty sa odložia');
  const b = O.refreshPatch({ ...L, closed_at: '2026-10-01T00:00:00Z', business_status: 'CLOSED_PERMANENTLY' }, P({}), { now });
  eq([b.patch.closed_at, b.changes.includes('znova funguje')], [null, true], 'keď znova funguje, štítok Zatvorená zmizne');
  const c = O.refreshPatch(L, null, { now });
  eq([c.patch.verified_at != null, c.patch.data_source.maps_found, 'business_status' in c.patch], [true, false, false],
    'nenájdená na Mapách: nič sa neprepíše, len príznak');
  const d = O.refreshPatch(L, null, { now, webOk: true, mapsChecked: false });
  eq(['verified_at' in d.patch, d.patch.web_ok], [false, true], 'bez Outscraperu len web a MX, verified_at sa nemení');
}

// ── MX (mock DNS) ───────────────────────────────────────────────────────────
(async () => {
  eq([O.mxVerdict([{ exchange: 'mx.firma.de', priority: 10 }]), O.mxVerdict([{ exchange: '.', priority: 0 }]), O.mxVerdict([])], [true, false, false],
    'MX záznam áno / „null MX" nie / žiadny nie');
  const dnsMock = async (d) => {
    if (d === 'firma.de') return [{ exchange: 'mx1.firma.de', priority: 10 }];
    const e = new Error('x'); e.code = d === 'neexistuje.de' ? 'ENOTFOUND' : d === 'bezmx.de' ? 'ENODATA' : 'ETIMEOUT'; throw e;
  };
  eq(await Promise.all(['info@firma.de', 'a@neexistuje.de', 'a@bezmx.de', 'a@pomaly.de', 'zly'].map(e => O.checkMx(e, dnsMock))),
    [true, false, false, null, null], 'MX: má / neexistuje / bez MX / výpadok DNS = nevieme / zlý e-mail');

  // ── Týždenné overenie ──────────────────────────────────────────────────
  const now = new Date('2026-11-02T06:00:00Z');
  const leads = [
    { id: 'a', status: 'new', verified_at: '2026-10-30T00:00:00Z' },   // nedávno
    { id: 'b', status: 'new', verified_at: null },
    { id: 'c', status: 'contacted', verified_at: '2026-09-01T00:00:00Z' },
    { id: 'd', status: 'won', verified_at: null },
    { id: 'e', status: 'new', closed_at: '2026-10-01T00:00:00Z' },
    { id: 'f', status: 'new', verified_at: '2026-10-20T00:00:00Z' },
    { id: 'g', status: 'new', archived_at: 'x' },
  ];
  eq(O.pickStale(leads, { now, limit: 2 }).map(x => x.id), ['b', 'c'], 'najdlhšie neoverené, bez odberateľov, zatvorených a archívu');
  eq([O.isRefreshDay('2026-11-02'), O.isRefreshDay('2026-11-03')], [true, false], 'overuje sa v pondelok');
  eq([O.weeklyLimit(undefined), O.weeklyLimit('0'), O.weeklyLimit('900')], [50, 0, 500], 'OUTSCRAPER_REFRESH_WEEKLY');

  // ── Pre appku ──────────────────────────────────────────────────────────
  eq(O.stateOf({ business_status: 'OPERATIONAL' }), ['ok', 'Funguje', 'green'], 'stav Funguje');
  eq(O.stateOf({ business_status: 'OPERATIONAL', closed_at: 'x' })[1], 'Zatvorená', 'closed_at má prednosť');
  eq([O.verifiedLabel('2026-11-02T01:00:00Z', now), O.verifiedLabel('2026-11-01T01:00:00Z', now), O.verifiedLabel('2026-10-20T01:00:00Z', now), O.verifiedLabel(null, now)],
    ['Overené dnes', 'Overené včera', 'Overené pred 13 dňami', null], '„Overené pred X dňami"');
  eq(O.flags({ business_status: 'CLOSED_TEMPORARILY', website: 'x.de', web_ok: false, email: 'a@x.de', email_mx_ok: false }).map(f => f.label),
    ['Dočasne zatvorená', 'Web nefunguje', 'E-mail neoverený'], 'štítky pri firme');
  eq([O.ratingLabel({ rating: 4.6, reviews_count: 38 }), O.ratingLabel({ rating: 5 }), O.ratingLabel({})], ['4,6 · 38', '5,0', ''], 'hodnotenie „4,6 · 38"');
  eq(O.dropSummary({ dropped: { closed: 2, known: 0, low_score: 5 } }), [['natrvalo zatvorená', 2], ['nízke skóre', 5]], 'prehľad vyradených');

  // ── Klient (podstrčený fetch) ──────────────────────────────────────────
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  {
    const calls = [];
    const c = OS.client({ key: 'tajny-kluc', fetch: async (u, o) => { calls.push({ u, o }); return json(200, { id: 'req-sync-1', status: 'Success', data: [[RAW], [{ ...RAW, name: 'B', place_id: 'b' }]] }); },
      sleep: async () => {}, now: () => 0 });
    const r = await c.mapsSearch(['Trockenbau, München', 'Maler, Ulm'], { limit: 5, deadline: 600000 });
    eq([r.places.length, r.groups.length, r.async], [2, 2, false], 'synchrónne: výsledky hneď');
    ok(calls[0].u.startsWith('https://api.app.outscraper.com/maps/search-v3?query=') && calls[0].o.headers['X-API-KEY'] === 'tajny-kluc',
      'GET /maps/search-v3 s hlavičkou X-API-KEY', calls[0].u);
    ok(!calls[0].u.includes('tajny-kluc'), 'kľúč nie je v adrese');
  }
  {
    const calls = [];
    let n = 0;
    const c = OS.client({ key: 'k', fetch: async (u) => {
      calls.push(u);
      if (u.includes('/maps/search-v3')) return json(202, { id: 'req-async-77', status: 'Pending', results_location: 'https://api.app.outscraper.com/requests/req-async-77' });
      n++;
      return json(200, n < 3 ? { id: 'req-async-77', status: 'Pending' } : { id: 'req-async-77', status: 'Success', data: [[RAW]] });
    }, sleep: async () => {}, now: () => 0, pollMs: 1 });
    const r = await c.mapsSearch(['Trockenbau, München'], { limit: 5, async: true, deadline: 600000 });
    eq([r.places.length, r.async, r.polls, r.requestId], [1, true, 3, 'req-async-77'], 'asynchrónne: čaká sa cez /requests/<id>');
    ok(calls[0].includes('async=true') && calls.slice(1).every(u => u === 'https://api.app.outscraper.com/requests/req-async-77'), 'pýta sa na správnu adresu');
  }
  {
    let t = 0;
    const c = OS.client({ key: 'k', fetch: async () => json(200, { id: 'req-slow-1', status: 'Pending' }), sleep: async (ms) => { t += ms; }, now: () => t, pollMs: 5000 });
    let err = null;
    try { await c.mapsSearch(['x y z'], { deadline: 20000 }); } catch (e) { err = e; }
    ok(err && /dlhšie/.test(err.message), 'keď async trvá dlhšie ako funkcia smie, skončí s vetou', err && err.message);
  }
  {
    const c = OS.client({ key: 'tajny', fetch: async () => json(401, { errorMessage: 'Invalid API key tajny' }), sleep: async () => {}, now: () => 0 });
    let err = null;
    try { await c.mapsSearch(['abc'], { deadline: 60000 }); } catch (e) { err = e; }
    ok(err && /OUTSCRAPER_API_KEY/.test(err.message) && !/tajny/.test(err.message), 'zlý kľúč → veta bez kľúča', err && err.message);
  }
  {
    const urls = [];
    const c = OS.client({ key: 'k', fetch: async (u) => { urls.push(u); return json(200, { status: 'Success', data: [{ query: 'a.de', emails: [{ value: 'info@a.de' }] }] }); },
      sleep: async () => {}, now: () => 0 });
    const m = await c.contacts(['a.de', 'a.de', 'b.de'], { deadline: 60000 });
    ok(urls[0].startsWith('https://api.app.outscraper.com/emails-and-contacts?query=a.de&query=b.de'), 'kontakty: GET /emails-and-contacts, domény raz', urls[0]);
    eq(m.get('a.de').emails, ['info@a.de'], 'a vrátia sa po doménach');
  }
  eq(OS.fromEnv({}), null, 'bez OUTSCRAPER_API_KEY žiadny klient');

  console.log(`\n${passed} prešlo, ${failed} padlo\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('  ✗ Error', e); process.exit(1); });
