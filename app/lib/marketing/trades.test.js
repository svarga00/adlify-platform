// ============================================================================
// DANUBRA — remeslá firiem: zistenie z textu, ručné určenie, názvy
// Spustenie:  node app/lib/marketing/trades.test.js
// ============================================================================
const T = require('./trades.js');
const P = require('./pitch.js');

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('Vstavaný zoznam');
{
  ok(T.KEYS.length === T.BUILTIN.length && new Set(T.KEYS).size === T.KEYS.length, 'kľúče sú jedinečné');
  const app = new Set(P.TRADES.flatMap(t => t.app));
  ok([...app].every(k => T.KEYS.includes(k)), 'každý `app` kľúč z pitch.js TRADES má vstavaný slovenský názov', [...app].join(','));
  ok(T.KEYS.every(k => /^[a-z0-9_-]+$/.test(k)), 'kľúče sú malými písmenami bez diakritiky');
}

console.log('\nZistenie zo slovenského textu od AI');
{
  const k = T.detectKeys({ trade: 'maliarstvo, omietky, zatepľovanie' });
  ok(k.includes('maliar') && k.includes('omietkar') && k[0] === 'maliar', '„maliarstvo, omietky, zatepľovanie" → maliar + omietkar (maliar prvý — spomenutý prvý)', JSON.stringify(k));
  ok(same(T.detectKeys({ trade: 'suchá výstavba' }), ['trockenbau']), '„suchá výstavba" → trockenbau');
  ok(same(T.detectKeys({ trade: 'obklady a dlažby' }), ['obkladac']), '„obklady a dlažby" → obkladac');
  ok(T.detectKeys({ trade: 'zváranie oceľových konštrukcií' }).includes('zvarac'), '„zváranie…" → zvarac');
  ok(T.detectKeys({ trade: 'montáž okien a dverí' }).includes('montaznik'), '„montáž okien a dverí" → montaznik');
  ok(T.detectKeys({ trade: 'debnenie a betonárske práce' }).includes('betonar'), 'debnenie → betonar');
}

console.log('\nZistenie z nemeckých kategórií Google Máp, mena a webu');
{
  ok(same(T.detectKeys({ categories: ['Trockenbauunternehmen', 'Malerbetrieb'] }), ['trockenbau', 'maliar']), 'Trockenbauunternehmen, Malerbetrieb → trockenbau, maliar');
  ok(same(T.detectKeys({ categories: ['Fliesenleger'] }), ['obkladac']), 'Fliesenleger → obkladac');
  ok(T.detectKeys({ categories: ['Elektroinstallateur'] })[0] === 'elektrikar', 'Elektroinstallateur → elektrikar');
  ok(T.detectKeys({ name: 'Zimmerei Huber GmbH' })[0] === 'tesar', 'Zimmerei → tesar');
  ok(T.detectKeys({ name: 'Huber GmbH', site_title: 'Huber – Stuckateur und Fassade' }).includes('omietkar'), 'titulok webu „Stuckateur und Fassade" → omietkar');
  ok(T.detectKeys({ name: 'X', profile: { summary: 'Metallbau und Schlosserei' } })[0] === 'zamocnik', 'profil od AI → zamocnik');
  ok(same(T.detectKeys({ name: 'Müller GmbH' }), []), 'nič sa nedá určiť → [] (neurčené)');
  ok(T.detectKeys({ trade: 'Trockenbau, Fliesen, Maler, Elektro, Maurer, Schweißen' }).length <= 4, 'najviac 4 remeslá');
}

console.log('\nHľadanie, z ktorého firma prišla');
{
  ok(same(T.detectKeys({ name: 'Bau GmbH' }, { params: { trades: ['zvarac', 'neznamy'] } }), ['zvarac']), 'firma nič nehovorí → remeslá zvolené pri hľadaní (len známe)');
  ok(same(T.detectKeys({ name: 'Bau GmbH' }, { seeds: [{ trade: 'Trockenbau', keywords: ['Akustikbau'] }] }), ['trockenbau']), '…inak profily zadaných webov');
  ok(same(T.detectKeys({ trade: 'obklady' }, { params: { trades: ['zvarac'] } }), ['obkladac']), 'text firmy má prednosť pred hľadaním');
}

console.log('\nRučné určenie');
{
  const lead = { trade: 'maliarstvo', trade_keys: ['elektrikar'] };
  ok(same(T.keysOf(lead), ['elektrikar']) && T.isManual(lead), 'trade_keys vyplnené → berie sa ručné');
  ok(same(T.keysOf({ trade: 'maliarstvo', trade_keys: null }), ['maliar']) && !T.isManual({ trade_keys: null }), 'null = automaticky');
  ok(same(T.keysOf({ trade: 'maliarstvo', trade_keys: [] }), ['maliar']), 'prázdne pole = automaticky');
  ok(same(T.valid(['maliar', 'MALIAR', 'x<y', 'neznamy', 'bau']), ['maliar', 'bau']), 'valid: len známe, bez opakovania, malými');
  ok(same(T.valid(['cnc'], { table: [{ key: 'cnc', name_sk: 'CNC' }] }), ['cnc']) && same(T.valid(['cnc']), []), 'valid: kľúč z tabuľky platí len s tabuľkou');
  ok(T.valid(T.KEYS).length === T.MAX, `valid: najviac ${T.MAX}`);
  const fromSearch = { trade_keys: ['maliar'], profile: { trades_from: 'search' } };
  ok(T.source(fromSearch) === 'search' && !T.isManual(fromSearch) && same(T.keysOf(fromSearch), ['maliar']), 'uložené pri hľadaní: platia, ale nie sú „ručne"');
  ok(T.source({ trade_keys: ['maliar'] }) === 'hand' && T.source({}) === 'auto', 'zdroj: ručne / automaticky');
  ok(/určené pri hľadaní/.test(T.chipsHtml(['maliar'], { source: 'search' })) && !/is-hand/.test(T.chipsHtml(['maliar'], { source: 'search' })), 'čipy: „určené pri hľadaní"');
}

console.log('\nNázvy');
{
  const table = [{ key: 'trockenbau', name_sk: 'Sadrokartonár', name_de: 'Trockenbauer', sort_order: 1 }, { key: 'cnc', name_sk: 'CNC operátor', sort_order: 9 },
    { key: 'stary', name_sk: 'Starý', active: false }];
  ok(T.labelSk('trockenbau', table) === 'Sadrokartón' && T.labelSk('trockenbau') === 'Sadrokartón' && T.labelSk('cnc', table) === 'CNC operátor', 'labelSk: vstavaný druh práce, inak z danubra_trades');
  ok(T.labelSk('omietkar', table) === 'Zatepľovanie a fasády' && T.labelSk('bau') === 'Stavba a dokončovacie práce', 'omietkar a všeobecné „bau"');
  ok(T.labelSk('xyz') === 'Xyz' && T.labelSk('') === 'neurčené', 'neznámy kľúč s veľkým písmenom, prázdny = neurčené');
  ok(T.labelDe('maliar') === 'Maler- und Lackierarbeiten' && T.labelDe('omietkar') === 'WDVS und Fassade' && T.labelDe('bau') === 'Bau und Ausbau', 'labelDe z pitch.js');
  ok(T.labelDe('cnc', [{ key: 'cnc', name_de: 'CNC-Bediener' }]) === 'CNC-Bediener' && T.labelDe('cnc') === '', 'labelDe: inak name_de');
  const o = T.options(table);
  ok(o[0].key === 'trockenbau' && o[0].label === 'Sadrokartón' && o.some(x => x.key === 'cnc') && !o.some(x => x.key === 'stary'), 'options: vstavané + aktívne z tabuľky');
  ok(T.sortValue(['maliar']) === 'Maľovanie' && T.sortValue([]) === null, 'zoradenie podľa prvého názvu, neurčené na koniec');
}

console.log('\nČipy do zoznamu');
{
  const h = T.chipsHtml(['maliar', 'omietkar', 'trockenbau']);
  ok((h.match(/class="tr-chip"/g) || []).length === 2 && /\+1/.test(h) && /title="Maľovanie, Zatepľovanie a fasády, Sadrokartón/.test(h), 'najviac 2 + „+N", všetky v title', h);
  ok(/neurčené/.test(T.chipsHtml([])) && /is-none/.test(T.chipsHtml([])), 'bez remesla „neurčené" (sivé)');
  ok(/is-hand/.test(T.chipsHtml(['maliar'], { manual: true })) && /určené ručne/.test(T.chipsHtml(['maliar'], { manual: true })), 'ručne určené sú označené');
  ok(!/<script/.test(T.chipsHtml(['x'], { table: [{ key: 'x', name_sk: '<script>' }] })), 'názov z tabuľky sa escapuje');
}

console.log('\nĽudia na remeslo');
ok(T.workerCount([{ profession: 'maliar', status: 'ready' }, { profession: 'maliar', status: 'inactive' }, { profession: 'maliar', status: 'blacklist' },
  { profession: 'zvarac', status: 'ready' }, { profession: 'maliar', status: 'candidate' }], 'maliar') === 2, 'ráta len aktívnych s tou profesiou');

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
