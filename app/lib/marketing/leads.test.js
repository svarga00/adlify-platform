// Testy: marketing — nové firmy a e-maily · node app/lib/marketing/leads.test.js
global.window = global;
const L = require('./leads.js');
let passed = 0, failed = 0;
function eq(a, e, msg) { const x = JSON.stringify(a), y = JSON.stringify(e);
  if (x === y) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${y}\n    dostal:    ${x}`); } }
const ok = (c, m, extra) => { if (c) { passed++; console.log(`  ✓ ${m}`); } else { failed++; console.log(`  ✗ ${m}${extra ? `\n    ${extra}` : ''}`); } };

console.log('\nMAPA');
{
  const q = L.overpassQuery({ points: [{ lat: 48.4011, lng: 9.9876 }, { lat: 'x', lng: 1 }], radiusKm: 30, crafts: ['builder', 'tiler', 'x;y'] });
  ok(q.includes('around:30000,48.40110,9.98760') && q.includes('"craft"~"^(builder|tiler)$"'), 'okruh okolo mesta odberateľa, len platné remeslá', q);
  ok(q.includes('"office"="construction_company"'), 'aj stavebné firmy');
  ok((q.match(/around:/g) || []).length === 2, 'neplatný bod sa vynechá');
  ok(L.overpassQuery({ points: [{ lat: 1, lng: 1 }], radiusKm: 500 }).includes('around:100000'), 'najviac 100 km');
}
{
  const r = L.parse({ elements: [
    { type: 'node', id: 1, lat: 48.4, lon: 9.9, tags: { craft: 'builder', name: 'Müller Bau GmbH', 'addr:city': 'Ulm', website: 'mueller-bau.de' } },
    { type: 'node', id: 2, lat: 48.4, lon: 9.9, tags: { craft: 'tiler', name: 'Fliesen Huber', 'addr:city': 'Ulm', email: 'Info@Huber.de', phone: '+49 731 1' } },
    { type: 'node', id: 3, tags: { craft: 'builder', name: 'Müller-Bau GmbH & Co. KG', 'addr:city': 'Ulm' }, lat: 1, lon: 1 },
    { type: 'node', id: 4, tags: { craft: 'builder' } },
  ] });
  eq(r.map(x => x.name), ['Fliesen Huber', 'Müller Bau GmbH'], 's e-mailom navrch, tá istá firma raz, bez mena nie');
  eq([r[0].email, r[0].trade, r[0].source], ['info@huber.de', 'Obkladač', 'osm'], 'e-mail malými, remeslo po slovensky');
}

console.log('\nUŽ ICH MÁME');
{
  eq(L.normName('Müller-Bau GmbH & Co. KG'), L.normName('Müller Bau GmbH'), 'právna forma a pomlčka nerozhodujú');
  const d = L.dedupe([{ name: 'Müller Bau GmbH' }, { name: 'Nová Firma' }, { name: 'GU Ulm GmbH' }],
    { leads: [{ name: 'MÜLLER BAU' }], partners: [{ name: 'GU Ulm' }] });
  eq([d.fresh.map(x => x.name), d.known.length], [['Nová Firma'], 2], 'odberateľ ani uložená firma sa neponúkne znova');
}

console.log('\nOD AI');
{
  const a = L.fromAi({ name: '  Bauer  Bau GmbH ', city: 'Augsburg', website: 'bauer-bau.de', email: 'kontakt@bauer-bau.de',
    why: 'Generalunternehmer ako GU Ulm', source_url: 'https://bauer-bau.de/impressum' }, { similarTo: 'p1' });
  eq([a.name, a.website, a.email, a.source, a.similar_to], ['Bauer Bau GmbH', 'https://bauer-bau.de', 'kontakt@bauer-bau.de', 'ai', 'p1'], 'očistí meno, doplní https');
  eq(L.fromAi({ name: 'X', email: 'nie je e-mail' }).email, null, 'neplatný e-mail sa neuloží');
  eq(L.aiContext([{ id: 'p1', name: 'GU Ulm', city: 'Ulm' }], [{ partner_id: 'p1', trade: 'Sadrokartón' }, { partner_id: 'p1', trade: 'Sadrokartón' }]),
    [{ name: 'GU Ulm', city: 'Ulm', country: 'DE', what: 'Sadrokartón' }], 'AI dostane len meno, mesto a čo pre nich robíme');
}

console.log('\nE-MAILY');
{
  const r = L.recipients([
    { name: 'A', email: 'A@a.de' }, { name: 'B', email: '' }, { name: 'C', email: 'c@c.de' },
    { name: 'D', email: 'a@a.de' }, { name: 'E', email: 'e@e.de', status: 'rejected' }], [{ email: 'c@c.de' }]);
  eq(r.ok.map(x => x.email), ['a@a.de'], 'len platný, neodhlásený, raz');
  eq(r.skip.map(x => x.why), ['bez e-mailu', 'odhlásil sa', 'rovnaký e-mail dvakrát', 'nechce'], 'a povie prečo nie');
  eq(L.recipients([{ name: 'Z', email: 'info@z.de', closed_at: '2026-11-02T06:00:00Z' }]).skip.map(x => x.why), ['firma je zatvorená'],
    'natrvalo zatvorenej firme (Google Mapy) kampaň nejde');
  const t = L.fill('Guten Tag {firma} in {mesto} — {nasa_firma} {nezname}', { name: 'Huber', city: 'Ulm' }, { name: 'P&S' });
  eq(t, 'Guten Tag Huber in Ulm — P&S {nezname}', 'doplní údaje, neznáme nechá');
  const f = L.footer({ name: 'Partner und Service s. r. o.', address: 'Nové Zámky', company_id: '57553921', email: 'info@punds.eu' }, 'https://x/abmelden');
  ok(/Partner und Service s\. r\. o\., Nové Zámky/.test(f) && /57553921/.test(f) && /Keine weiteren E-Mails erhalten: https:\/\/x\/abmelden/.test(f),
    'pätička: kto posiela a ako sa odhlásiť (povinné v Nemecku)', f);
  ok(/Stunden/.test(L.TEMPLATE_DE.body) && /\{mesto\}/.test(L.TEMPLATE_DE.body), 'šablóna: po hodinách, s mestom');
}
console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
