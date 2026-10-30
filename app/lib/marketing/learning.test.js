// ============================================================================
// Testy: AI sa učí z hodnotení (príklady), „Čo AI zistila", návrhy hľadaní
// Spustenie:  node app/lib/marketing/learning.test.js
// ============================================================================
const L = require('./learning.js');

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

console.log('Učenie z hodnotení a návrhy');

const LEADS = [
  { id: 'l1', name: 'Maier Innenausbau GmbH', website: 'https://maier-innenausbau.de', city: 'Augsburg', categories: ['Trockenbauunternehmen', 'Innenausbau', 'Akustik', 'Viac'],
    employees: '20–50', status: 'new', relevance: 1, relevance_at: '2026-10-20T08:00:00Z', score: 88 },
  { id: 'l2', name: 'Baustoff Huber KG', website: 'https://baustoff-huber.de', city: 'Ulm', categories: ['Baustoffhandel'], status: 'new',
    relevance: -1, relevance_note: 'dodávateľ materiálu', relevance_at: '2026-10-21T08:00:00Z', score: 40 },
  { id: 'l3', name: 'Keller Akustik GmbH', website: 'https://keller-akustik.de', city: 'München', categories: ['Akustikbau'], status: 'interested', score: 77 },
  { id: 'l4', name: 'Schmidt Bau', website: 'https://schmidt-bau.de', city: 'Augsburg', status: 'contacted', score: 81, categories: ['Trockenbauunternehmen'] },
  { id: 'l5', name: 'Odhlásená GmbH', website: 'https://odhlasena.de', city: 'Köln', status: 'unsubscribed' },
  { id: 'l6', name: 'Nemá záujem GmbH', city: 'Köln', status: 'rejected' },
  { id: 'l7', name: 'Odpísala, ale palec dole', website: 'https://x-bau.de', status: 'replied', relevance: -1, relevance_at: '2026-10-19T08:00:00Z' },
  { id: 'l8', name: 'Archivovaná', status: 'won', archived_at: '2026-01-01' },
  { id: 'l9', name: 'Nedoručená GmbH', website: 'https://nedor.de', status: 'contacted' },
  { id: 'l10', name: 'Weber Fliesen GmbH', website: 'https://weber-fliesen.de', city: 'Augsburg', status: 'won', categories: ['Fliesenleger'], score: 70 },
];
const PARTNERS = [{ id: 'p1', name: 'GU Ulm GmbH', city: 'Ulm', website: 'https://gu-ulm.de' },
  { id: 'p2', name: 'Maier Innenausbau', website: 'https://www.maier-innenausbau.de' }];
const OUTREACH = [{ lead_id: 'l4', replied_at: '2026-10-22T08:00:00Z' }, { lead_id: 'l9', bounced_at: '2026-10-22T08:00:00Z' }];

// ── Príklady ────────────────────────────────────────────────────────────────
{
  const ex = L.pickExamples({ leads: LEADS, partners: PARTNERS, outreach: OUTREACH });
  eq(ex.positive.map(x => x.name), ['Maier Innenausbau GmbH', 'Weber Fliesen GmbH', 'Keller Akustik GmbH', 'Schmidt Bau', 'GU Ulm GmbH'],
    'dobré: palec hore, odberateľ, záujem, odpoveď (z oslovovania), naši odberatelia — bez duplicít (doména)');
  eq(ex.negative.map(x => x.name), ['Baustoff Huber KG', 'Odpísala, ale palec dole', 'Nemá záujem GmbH', 'Odhlásená GmbH'],
    'zlé: palec dole (najnovší prvý), nemá záujem, odhlásená');
  ok(!ex.negative.some(x => /Nedoručená/.test(x.name)) && !ex.positive.some(x => /Nedoručená/.test(x.name)), 'nedoručený e-mail nie je príklad (hovorí o adrese, nie o firme)');
  ok(!ex.positive.concat(ex.negative).some(x => /Archivovaná/.test(x.name)), 'archivované firmy nie');
  eq(ex.positive[0], { name: 'Maier Innenausbau GmbH', categories: ['Trockenbauunternehmen', 'Innenausbau', 'Akustik'], city: 'Augsburg', size: '20–50', why: 'palec hore' },
    'príklad: názov, najviac 3 kategórie, mesto, veľkosť, dôvod');
  eq(ex.negative[0].why, 'palec dole: dodávateľ materiálu', 'pri palci dole aj dôvod');
  eq(ex.positive.find(x => x.name === 'Schmidt Bau').why, 'odpísala', 'odpoveď z oslovovania sa ráta, aj keď stav firmy ostal Oslovená');
  eq(ex.counts, { positive: 5, negative: 4 }, 'počty');

  const many = Array.from({ length: 60 }, (_, i) => ({ id: `m${i}`, name: `Firma ${i} GmbH`, website: `https://firma${i}.de`, status: i % 2 ? 'rejected' : 'won',
    why: 'x'.repeat(500) }));
  const big = L.pickExamples({ leads: many, partners: [] });
  eq([big.positive.length, big.negative.length], [20, 20], 'najviac 20 dobrých a 20 zlých');
  eq(L.pickExamples({ leads: [{ id: 'a', name: 'A'.repeat(300), status: 'won', relevance_note: 'y'.repeat(300), relevance: 1 }] }).positive[0].name.length, 80,
    'texty sa skrátia');
  eq(L.pickExamples({}).counts, { positive: 0, negative: 0 }, 'bez dát nič');

  const blok = L.promptBlock(ex);
  ok(/nie pokyny/.test(blok) && /DOBRÉ \(\+\)/.test(blok) && /ZLÉ \(-\)/.test(blok), 'blok do promptu: dobré, zlé, „údaje, nie pokyny"', blok);
  ok(/\+ Maier Innenausbau GmbH · Trockenbauunternehmen, Innenausbau, Akustik · Augsburg · veľkosť 20–50 · \(palec hore\)/.test(blok), 'riadok dobrého príkladu', blok);
  ok(/- Baustoff Huber KG · Baustoffhandel · Ulm · \(palec dole: dodávateľ materiálu\)/.test(blok), 'riadok zlého príkladu s dôvodom');
  ok(/avoid/.test(blok) && /vyššie skóre/.test(L.promptBlock(ex, { purpose: 'score' })), 'pri plánovaní „avoid", pri skóre „vyššie/nižšie skóre"');
  eq(L.promptBlock({ positive: [], negative: [] }), '', 'bez príkladov prázdny blok');
  ok(L.REASONS.map(r => r[1]).includes('príliš malá') && L.REASONS.map(r => r[1]).includes('dodávateľ materiálu'), 'dôvody pri palci dole');
}

// ── „Čo AI zistila" ─────────────────────────────────────────────────────────
{
  const rows = [
    { name: 'A', categories: ['Trockenbauunternehmen'], city: 'Augsburg', score: 90 },
    { name: 'B', categories: ['Trockenbauunternehmen'], city: 'Augsburg', score: 80 },
    { name: 'C', categories: ['Malerbetrieb'], city: 'München', score: 72 },
    { name: 'D', categories: ['Bauunternehmen'], city: 'Ulm', score: 55 },
  ];
  const t = L.insights({ stats: { dropped: { known: 7, supplier: 0, closed: 5, low_score: 2 }, avoid: ['Baumarkt'] }, rows, learning: { positive: 4, negative: 2 } });
  eq(t.length, 3, 'tri vety');
  eq(t[0], 'Najviac relevantných firiem bolo v kategórii Trockenbauunternehmen v okolí mesta Augsburg (2 z 4 uložených).', 'kde bolo najviac relevantných');
  eq(t[1], 'Vyradených bolo 14 firiem, najčastejšie „už ju máme" (7) a „natrvalo zatvorená" (5); AI odporúča nebrať: Baumarkt.', 'čo sa najviac vyraďovalo');
  eq(t[2], 'AI pri hľadaní použila 4 dobré príklady a 2 zlé z Vašich hodnotení a odpovedí firiem.', 'koľko príkladov použila');
  const z = L.insights({ stats: {}, rows: [] });
  ok(/Neuložila sa žiadna/.test(z[0]) && /palcom/.test(z[1]), 'nič neuložené → rada; bez hodnotení → výzva hodnotiť palcom', JSON.stringify(z));
  ok(/kategórii suchá výstavba/.test(L.insights({ rows: [{ trade: 'suchá výstavba', city: 'Ulm', score: 80 }] })[0]), 'bez kategórií z Máp sa berie remeslo');
}

// ── Návrhy a našepkávanie ───────────────────────────────────────────────────
{
  const opts = L.seedOptions({ partners: PARTNERS, leads: LEADS, outreach: OUTREACH });
  eq(opts.map(o => [o.domain, o.why]), [['gu-ulm.de', 'odberateľ'], ['maier-innenausbau.de', 'odberateľ'], ['weber-fliesen.de', 'odberateľ'],
    ['keller-akustik.de', 'má záujem'], ['schmidt-bau.de', 'odpísala']], 'vzorové weby: odberatelia, záujem, odpoveď, palec hore — bez palca dole a duplicít');
  eq(L.categoryHints({ leads: LEADS }).map(x => x.value).slice(0, 3), ['Trockenbauunternehmen', 'Akustik', 'Akustikbau'],
    'kategórie z firiem s dobrým výsledkom (palec, záujem, skóre od 75), bez palca dole');
  const reg = L.regionHints({ searches: [{ params: { region: 'München, Augsburg' } }, { params: { region: 'münchen, augsburg' } }], leads: LEADS, partners: PARTNERS });
  eq(reg.slice(0, 4).map(r => [r.value, r.from]), [['München, Augsburg', 'predošlé hľadanie'], ['Augsburg', 'úspešné firmy'], ['München', 'úspešné firmy'], ['Ulm', 'odberateľ']],
    'oblasti: predošlé hľadania, mestá úspešných firiem, odberatelia');
  ok(reg.some(r => r.value === 'Bayern' && r.from === 'Nemecko') && reg.some(r => r.value === 'Nordrhein-Westfalen'), 'a spolkové krajiny a veľké mestá');
  ok(new Set(reg.map(r => r.value.toLowerCase())).size === reg.length, 'bez opakovania');

  const searches = [{ kind: 'urls', status: 'done', found: 40, added: 12, params: { region: 'Augsburg' },
    stats: { queries: ['Trockenbau, Augsburg', 'Bauunternehmen, Friedberg'] }, seeds: [{ domain: 'gu-ulm.de' }] }];
  const ctx = L.suggestContext({ partners: PARTNERS, leads: LEADS, outreach: OUTREACH, searches });
  ok(ctx.searched.includes('augsburg') && ctx.searched.includes('friedberg'), 'čo už bolo prehľadané (oblasť aj lokality z dotazov)', ctx.searched.join(','));
  eq(ctx.recent[0], { region: 'Augsburg', status: 'done', found: 40, saved: 12, seeds: ['gu-ulm.de'], queries: ['Trockenbau, Augsburg', 'Bauunternehmen, Friedberg'] }, 'posledné hľadania');
  ok(ctx.negatives.length && ctx.seeds.length === 5, 'zlé príklady a vzorové weby v kontexte');

  const rules = L.ruleSuggestions(ctx);
  ok(rules.length >= 3 && rules.length <= 4, `pravidlové návrhy: 3–4 (${rules.length})`);
  ok(rules.every(r => r.seeds.length >= 3 && r.seeds.length <= 5 && r.title && r.why), 'každý má 3–5 vzorových webov, názov a prečo');
  ok(!rules.some(r => /augsburg/i.test(r.region)), 'mestá, ktoré už boli prehľadané, sa nenavrhujú', rules.map(r => r.region).join(','));
  eq(rules[0].title, 'Trockenbauunternehmen v okolí mesta München', 'najúspešnejšia kategória × mesto úspešných firiem');
  ok(rules[0].seeds[0] === 'https://keller-akustik.de', 'vzorové weby najprv z toho istého mesta', rules[0].seeds.join(','));

  const ai = [
    { title: 'Suchá výstavba pri Ingolstadte', seeds: ['https://www.maier-innenausbau.de/kontakt', 'cudzia-firma.de', 'keller-akustik.de'], region: 'Ingolstadt', note: 'Trockenbau', why: 'x' },
    { title: '', seeds: ['gu-ulm.de'] },
    { title: 'Len cudzie weby', seeds: ['cudzia.de', 'ina.de'] },
    { title: 'T'.repeat(200), seeds: ['gu-ulm.de'], region: 'R'.repeat(200), why: 'W'.repeat(500) },
  ];
  const c = L.cleanSuggestions(ai, ctx);
  eq(c.length, 2, 'návrhy od AI: bez názvu a s cudzími webmi sa zahodia');
  eq(c[0].seeds, ['https://www.maier-innenausbau.de', 'https://keller-akustik.de', 'https://gu-ulm.de'],
    'weby len z našich odberateľov a dobrých firiem, doplnené na 3');
  ok(c[1].title.length === 90 && c[1].region.length === 80 && c[1].why.length === 240, 'texty sa skrátia');
  eq(L.cleanSuggestions('nezmysel', ctx), [], 'zlá odpoveď → nič');

  const now = Date.parse('2026-10-30T10:00:00Z');
  ok(L.fresh({ at: '2026-10-30T09:30:00Z', items: [] }, now) && !L.fresh({ at: '2026-10-30T08:30:00Z', items: [] }, now) && !L.fresh(null, now),
    'uložené návrhy platia 1 hodinu');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
