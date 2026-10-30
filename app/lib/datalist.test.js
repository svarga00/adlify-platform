// ============================================================================
// Testy zoznamu s filtrami (čistá logika)
// Spustenie:  node app/lib/datalist.test.js
// ============================================================================
global.window = global;
const L = require('./datalist');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

console.log('Zoznam s filtrami');

const ROWS = [
  { id: 1, title: 'Wohnpark Feuerbach', city: 'Stuttgart', status: 'active', partner: { name: 'GU Ulm' }, pid: 'p1', type: 'construction', rate: 34, from: '2026-09-01', to: '2026-12-31', hot: true, tags: ['a', 'b'] },
  { id: 2, title: 'Kotolňa Wörthsee', city: 'Wörthsee', status: 'active', partner: { name: 'GU Ulm' }, pid: 'p1', type: 'construction', rate: 36, from: '2026-10-01', to: null, hot: false, tags: ['b'] },
  { id: 3, title: 'Hala Pasing', city: 'München', status: 'won', partner: { name: 'Bau Pasing' }, pid: 'p2', type: 'workshop', rate: 33, from: '2026-11-15', to: '2027-01-31', hot: false, tags: [] },
  { id: 4, title: 'Sanácia Žilina', city: 'Žilina', status: 'completed', partner: null, pid: null, type: null, rate: null, from: null, to: null, hot: false, tags: [] },
];

const CFG = {
  columns: [
    { key: 'title', label: 'Zákazka', sortValue: r => r.title },
    { key: 'partner', label: 'Odberateľ', sortValue: r => r.partner && r.partner.name },
    { key: 'rate', label: 'Sadzba', sortValue: r => r.rate, sortDir: -1 },
    { key: 'note', label: 'Poznámka' },
  ],
  sorts: [{ key: 'end', label: 'Koniec', value: r => r.to }],
  sort: { key: 'title', dir: 1 },
  filters: [
    { key: 'q', type: 'search', fields: ['title', 'city', 'partner.name'] },
    { key: 'status', type: 'multi', label: 'Stav', default: ['active', 'won'],
      options: [['active', 'Prebieha'], ['won', 'Získaná'], ['completed', 'Ukončená'], ['lost', 'Prehratá']],
      presets: [{ label: 'Otvorené', value: ['active', 'won'] }] },
    { key: 'partner', type: 'select', label: 'Odberateľ', value: 'pid', optionLabel: (v, r) => r.partner.name, emptyLabel: 'Bez odberateľa' },
    { key: 'type', type: 'select', label: 'Typ', options: [['construction', 'Stavba'], ['workshop', 'Dielňa']] },
    { key: 'hot', type: 'toggle', label: 'Len s problémom', test: r => r.hot },
    { key: 'obd', type: 'range-date', label: 'Obdobie', start: 'from', end: 'to' },
    { key: 'rate', type: 'range-number', label: 'Sadzba', value: 'rate', unit: '€/h' },
    { key: 'tag', type: 'multi', label: 'Štítok', value: r => r.tags },
  ],
  groups: [{ key: 'status', label: 'Stav', value: 'status', order: ['active', 'won', 'completed'],
    labelOf: k => ({ active: 'Prebieha', won: 'Získaná', completed: 'Ukončená' }[k] || k) }],
};
const ids = (rows) => rows.map(r => r.id);
const st = (f) => ({ ...L.defaults(CFG).f, ...f });

// ── Predvolený stav ─────────────────────────────────────────────────────────
{
  const d = L.defaults(CFG);
  eq(d.f.status, ['active', 'won'], 'predvolený stav je z konfigurácie');
  eq(d.f.q, '', 'hľadanie je prázdne');
  eq(d.f.hot, false, 'prepínač je vypnutý');
  eq(d.f.obd, { from: '', to: '' }, 'obdobie je prázdne');
  eq(d.sort, { key: 'title', dir: 1 }, 'zoradenie podľa konfigurácie');
  eq(d.group, '', 'bez zoskupenia');
  eq(L.defaults({ columns: CFG.columns, sort: { key: 'rate' } }).sort, { key: 'rate', dir: -1 },
    'zoradenie bez smeru berie smer zo stĺpca (sortDir)');
  eq(L.defaults({ columns: CFG.columns, sort: { key: 'title' } }).sort, { key: 'title', dir: 1 },
    'inak vzostupne');
  eq(L.defaults({ columns: CFG.columns, sort: { key: 'nič' } }).sort.key, 'title',
    'neznámy kľúč zoradenia → prvý stĺpec, ktorý sa dá zoradiť');
  eq(L.sortOptions(CFG).map(s => s.key), ['title', 'partner', 'rate', 'end'],
    'zoradiť sa dá podľa stĺpcov so sortValue a podľa „sorts"; stĺpec bez neho nie');
}

// ── Filtre ──────────────────────────────────────────────────────────────────
{
  eq(ids(L.apply(ROWS, CFG.filters, L.defaults(CFG).f)), [1, 2, 3], 'predvolene len otvorené');
  eq(ids(L.apply(ROWS, CFG.filters, st({ status: [] }))), [1, 2, 3, 4], 'prázdny multi = všetko');
  eq(ids(L.apply(ROWS, CFG.filters, st({ status: [], q: 'zilina' }))), [4], 'hľadanie bez diakritiky');
  eq(ids(L.apply(ROWS, CFG.filters, st({ status: [], q: 'ulm feuer' }))), [1],
    'viac slov = všetky musia sedieť, aj vo vnorenom poli');
  eq(ids(L.apply(ROWS, CFG.filters, st({ partner: 'p1' }))), [1, 2], 'select odberateľa');
  eq(ids(L.apply(ROWS, CFG.filters, st({ status: [], partner: L.NONE }))), [4], 'select „Bez odberateľa"');
  eq(ids(L.apply(ROWS, CFG.filters, st({ type: 'workshop' }))), [3], 'select typu');
  eq(ids(L.apply(ROWS, CFG.filters, st({ hot: true }))), [1], 'prepínač „len s problémom"');
  eq(ids(L.apply(ROWS, CFG.filters, st({ tag: ['a'] }))), [1], 'multi nad riadkom s viacerými štítkami');
  eq(ids(L.apply(ROWS, CFG.filters, st({ tag: ['a', 'b'] }))), [1, 2], 'multi = ktorákoľvek z vybraných');
  eq(ids(L.apply(ROWS, CFG.filters, st({ rate: { min: 34, max: '' } }))), [1, 2], 'číslo od');
  eq(ids(L.apply(ROWS, CFG.filters, st({ status: [], rate: { min: '', max: 33 } }))), [3],
    'číslo do — riadok bez čísla neprejde');
  eq(ids(L.apply(ROWS, CFG.filters, st({ obd: { from: '2026-11-01', to: '2026-11-30' } }))), [1, 2, 3],
    'obdobie: prekryv (aj zákazka bez konca)');
  eq(ids(L.apply(ROWS, CFG.filters, st({ obd: { from: '2027-01-01', to: '' } }))), [2, 3],
    'obdobie od: čo sa skončilo skôr, neprejde');
  eq(ids(L.apply(ROWS, CFG.filters, st({ obd: { from: '', to: '2026-09-30' } }))), [1],
    'obdobie do: čo začína neskôr, neprejde');
  eq(ids(L.apply(ROWS, CFG.filters, st({ status: [], obd: { from: '2026-01-01', to: '' } }))), [1, 2, 3],
    'zákazka bez dátumov pri filtri obdobia neprejde');
  eq(ids(L.apply(ROWS, CFG.filters, st({ status: ['active'] }), { except: 'status' })), [1, 2, 3, 4],
    '`except` vynechá jeden filter (pre počty)');
  ok(L.overlaps('2026-01-01', '2026-01-31', '2026-01-31', '') && !L.overlaps('2026-01-01', '2026-01-31', '2026-02-01', ''),
    'prekryv zahŕňa hraničný deň');
  const single = [{ key: 'd', type: 'range-date', field: 'd' }];
  eq(L.apply([{ d: '2026-05-05' }, { d: '2026-06-01' }, { d: null }], single, { d: { from: '2026-05-01', to: '2026-05-31' } }).length,
    1, 'obdobie nad jedným dátumom');
  const custom = [{ key: 'x', type: 'select', match: (r, v) => r.n > Number(v) }];
  eq(L.apply([{ n: 1 }, { n: 5 }], custom, { x: '2' }).length, 1, 'vlastné `match` má prednosť');
}

// ── Aktívne a čisté hodnoty ─────────────────────────────────────────────────
{
  const by = (k) => CFG.filters.find(f => f.key === k);
  ok(!L.isActive(by('q'), '  '), 'medzery v hľadaní nefiltrujú');
  ok(L.isActive(by('rate'), { min: 0, max: '' }), 'nula je hodnota');
  eq(L.cleanValue(by('status'), 'active'), [], 'multi z reťazca → prázdne');
  eq(L.cleanValue(by('status'), ['won', 'won']), ['won'], 'multi bez duplikátov');
  eq(L.cleanValue(by('obd'), { from: 'včera', to: '2026-02-30T00:00' }), { from: '', to: '2026-02-30' },
    'dátum: zlý text sa zahodí');
  eq(L.cleanValue(by('hot'), 'true'), false, 'prepínač len z true');
  eq(L.cleanValue(by('rate'), { min: 'x', max: '40' }), { min: '', max: 40 }, 'číslo z textu');
}

// ── Zapamätanie ─────────────────────────────────────────────────────────────
{
  const saved = { v: 1, f: { q: 'staré', status: ['completed'], hot: true, zmazany: 1, obd: 5 },
    sort: { key: 'rate', dir: -1 }, group: 'status' };
  const s = L.sanitize(saved, CFG);
  eq(s.f.q, '', 'hľadanie sa nepamätá');
  eq(s.f.status, ['completed'], 'stav sa zapamätá');
  eq(s.f.hot, true, 'prepínač sa zapamätá');
  ok(!('zmazany' in s.f), 'neznámy filter sa zahodí');
  eq(s.f.obd, { from: '', to: '' }, 'pokazená hodnota → prázdna');
  eq(s.f.type, '', 'filter, ktorý v úložisku nebol, má predvolenú hodnotu');
  eq(s.sort, { key: 'rate', dir: -1 }, 'zoradenie sa zapamätá');
  eq(s.group, 'status', 'zoskupenie sa zapamätá');
  eq(L.sanitize({ sort: { key: 'nič' }, group: 'nič' }, CFG).sort, L.defaults(CFG).sort, 'neznáme zoradenie → predvolené');
  eq(L.sanitize({ group: 'nič' }, CFG).group, '', 'neznáme zoskupenie → žiadne');
  eq(L.sanitize(null, CFG), L.defaults(CFG), 'nič uložené → predvolené');
  const p = L.persistable({ ...L.defaults(CFG), f: st({ q: 'tajné' }) }, CFG);
  ok(!('q' in p.f) && p.v === 1, 'do úložiska nejde hľadanie');
  ok(L.isDefault({ f: st({ status: ['won', 'active'] }) }, CFG), 'predvolené aj v inom poradí');
  ok(!L.isDefault({ f: st({ status: [] }) }, CFG), 'bez stavu už nie je predvolené');
}

// ── Možnosti a počty ────────────────────────────────────────────────────────
{
  const by = (k) => CFG.filters.find(f => f.key === k);
  const o = L.options(ROWS, by('status'), L.defaults(CFG).f, CFG.filters);
  eq(o.map(x => [x.value, x.count, x.on]), [['active', 2, true], ['won', 1, true], ['completed', 1, false]],
    'stav: počty pri ostatných filtroch, prázdna možnosť (Prehratá) skrytá');
  const o2 = L.options(ROWS, by('status'), st({ partner: 'p1' }), CFG.filters);
  eq(o2.map(x => [x.value, x.count, x.total]), [['active', 2, 2], ['won', 0, 1], ['completed', 0, 1]],
    'počet je fazetový (pri odberateľovi p1), celkový ostáva');
  const po = L.options(ROWS, by('partner'), st({ status: [] }), CFG.filters);
  eq(po.map(x => [x.value, x.label, x.count]), [['p2', 'Bau Pasing', 1], ['p1', 'GU Ulm', 2], [L.NONE, 'Bez odberateľa', 1]],
    'odberatelia z dát, podľa abecedy, „bez odberateľa" na konci');
  const tg = L.options(ROWS, by('tag'), st({}), CFG.filters);
  eq(tg.map(x => [x.value, x.count]), [['a', 1], ['b', 2]], 'štítky z polí v riadku');
  const sel = L.options(ROWS, by('status'), st({ status: ['lost'] }), CFG.filters);
  ok(sel.some(x => x.value === 'lost' && x.on), 'vybraná možnosť sa ukáže, aj keď je prázdna');
  eq(L.toggleCount(ROWS, by('hot'), L.defaults(CFG).f, CFG.filters), 1, 'počet pri prepínači');
  eq(L.labelOf(by('partner'), 'p2', ROWS), 'Bau Pasing', 'názov hodnoty z dát');
  eq(L.labelOf(by('type'), 'workshop', ROWS), 'Dielňa', 'názov hodnoty zo zoznamu');
  eq(L.presetOf(by('status'), ['won', 'active']).label, 'Otvorené', 'predvoľba sa spozná');
}

// ── Čipy ────────────────────────────────────────────────────────────────────
{
  const c = L.chips(CFG.filters, st({ q: ' ulm ', partner: 'p1', hot: true,
    obd: { from: '2026-11-01', to: '' }, rate: { min: 30, max: 40 } }), ROWS);
  eq(c.map(x => `${x.label}: ${x.text}`), [
    'Hľadanie: „ulm"', 'Stav: Otvorené', 'Odberateľ: GU Ulm', 'Len s problémom: ',
    'Obdobie: od 1. 11. 2026', 'Sadzba: 30 – 40 €/h',
  ], 'čip za každý aktívny filter, predvoľba menom');
  const m = L.chips(CFG.filters, st({ status: ['active', 'won', 'completed'] }), ROWS);
  eq(m[0].text, 'Prebieha, Získaná +1', 'veľa hodnôt sa skráti');
  eq(L.activeCount(CFG.filters, st({ hot: true })), 2, 'počet aktívnych filtrov');
}

// ── Zoradenie ───────────────────────────────────────────────────────────────
{
  eq(ids(L.sortRows(ROWS, CFG, { key: 'title', dir: 1 })), [3, 2, 4, 1], 'podľa názvu (slovenská abeceda)');
  eq(ids(L.sortRows(ROWS, CFG, { key: 'title', dir: -1 })), [1, 4, 2, 3], 'zostupne');
  eq(ids(L.sortRows(ROWS, CFG, { key: 'rate', dir: 1 })), [3, 1, 2, 4], 'čísla ako čísla, prázdne na konci');
  eq(ids(L.sortRows(ROWS, CFG, { key: 'rate', dir: -1 })), [2, 1, 3, 4], 'prázdne na konci aj zostupne');
  eq(ids(L.sortRows(ROWS, CFG, { key: 'end', dir: 1 })), [1, 3, 2, 4], 'podľa konca (bez konca na koniec)');
  eq(ids(L.sortRows(ROWS, CFG, { key: 'partner', dir: 1 })), [3, 1, 2, 4], 'pri zhode drží pôvodné poradie');
  ok(L.compare([0, 2, 'b'], [0, 2, 'a']) > 0 && L.compare([0, 1], [1, 0]) < 0, 'pole = viac kľúčov');
  ok(L.compare('Zákazka 10', 'Zákazka 9') > 0, 'čísla v texte prirodzene');
  ok(L.compare(true, false) > 0, 'áno/nie');
}

// ── Zoskupenie ──────────────────────────────────────────────────────────────
{
  const g = L.groupRows(L.sortRows(ROWS, CFG, { key: 'title', dir: 1 }), CFG.groups[0]);
  eq(g.map(x => [x.key, x.label, ids(x.rows)]), [
    ['active', 'Prebieha', [2, 1]], ['won', 'Získaná', [3]], ['completed', 'Ukončená', [4]],
  ], 'sekcie podľa poradia, vnútri zoradené');
  eq(L.groupRows(ROWS, null).length, 1, 'bez zoskupenia jedna sekcia');
}

// ── Celok a export ──────────────────────────────────────────────────────────
{
  const state = { f: st({}), sort: { key: 'rate', dir: -1 } };
  eq(ids(L.visible(ROWS, CFG, state)), [2, 1, 3], 'vyfiltrované aj zoradené naraz');
  const csv = L.csvRows(L.visible(ROWS, CFG, state), CFG);
  eq(csv[0], ['Zákazka', 'Odberateľ', 'Sadzba', 'Poznámka'], 'CSV: nadpisy zo stĺpcov');
  eq(csv[1], ['Kotolňa Wörthsee', 'GU Ulm', 36, ''], 'CSV: hodnoty vyfiltrovaných riadkov');
  const csv2 = L.csvRows(ROWS.slice(0, 1), { export: { columns: [['Č', r => r.id], ['Štítky', r => r.tags]] } });
  eq(csv2, [['Č', 'Štítky'], [1, 'a b']], 'CSV: vlastné stĺpce, pole sa spojí');
}

// ── Texty ───────────────────────────────────────────────────────────────────
{
  eq(L.rangeText('2026-09-01', '2026-12-31'), '1. 9. – 31. 12. 2026', 'obdobie v jednom roku');
  eq(L.rangeText('2026-12-01', '2027-01-31'), '1. 12. 2026 – 31. 1. 2027', 'obdobie cez rok');
  eq(L.rangeText('2026-09-01', null), 'od 1. 9. 2026', 'bez konca');
  eq(L.rangeText(null, null), '', 'bez dátumov nič');
  eq(L.daysBetween('2026-10-30', '2026-11-02'), 3, 'dni medzi dátumami');
  eq(L.daysBetween('2026-03-28', '2026-03-30'), 2, 'cez zmenu času');
  eq(L.countText(3, 10, ['zákazka', 'zákazky', 'zákaziek']), '3 z 10 zákaziek', '„X z Y"');
  eq(L.countText(2, 2, ['zákazka', 'zákazky', 'zákaziek']), '2 zákazky', 'keď sa nefiltruje, len počet');
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
