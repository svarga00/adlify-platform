// ============================================================================
// Testy zdieľaných komponentov
// Spustenie:  node danubra/js/components/shell.test.js
// ============================================================================
global.window = global;
require('../icons.js');
require('../../lib/money.js');
global.UI = {
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  badge(label, kind) { return `<span class="badge badge-${kind}">${this.esc(label)}</span>`; },
  empty(ico, title, sub) { return `<div class="empty"><b>${this.esc(title)}</b><span>${this.esc(sub)}</span></div>`; },
};
const S = require('./shell.js');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }
function throws(fn, msg) {
  try { fn(); failed++; console.log(`  ✗ ${msg} — nevyhodilo chybu`); }
  catch { passed++; console.log(`  ✓ ${msg}`); }
}

console.log('Zdieľané komponenty');

// ── Detail s bočným panelom ─────────────────────────────────────────────────
{
  const h = S.detail({
    title: 'Ján Novák', subtitle: 'sadrokartonár', badges: [['aktívny', 'green']],
    body: '<p>telo</p>', aside: [S.asideBlock('Zákazka', 'Leipzig'), ''],
    asideTitle: 'Súvislosti', back: { label: 'Kandidáti', onclick: 'x()' },
  });
  ok(h.includes('Ján Novák'), 'detail ukáže názov');
  ok(h.includes('<p>telo</p>'), 'detail ukáže telo');
  ok(h.includes('dt-aside'), 'detail má bočný panel');
  ok(h.includes('Leipzig'), 'bočný panel ukáže blok');
  ok(!h.includes('dt-solo'), 'pri paneli nie je jednostĺpcový');
  ok(h.includes('dt-back'), 'detail má tlačidlo späť');

  // Bez panelu sa hlavný stĺpec musí rozprestrieť, nie nechať prázdno.
  const solo = S.detail({ title: 'Bez panelu', body: 'x' });
  ok(solo.includes('dt-solo'), 'bez panelu je jednostĺpcový');
  ok(!solo.includes('dt-aside'), 'bez panelu sa panel nekreslí');

  // Prázdny blok v poli nesmie nechať prázdny rám.
  ok(!S.detail({ title: 't', body: 'b', aside: ['', null] }).includes('dt-aside'),
    'panel len z prázdnych blokov sa nekreslí');

  // Escapovanie — meno s uvozovkou nesmie rozbiť atribút.
  ok(S.detail({ title: 'O\'Brien <script>' }).includes('&lt;script&gt;'),
    'názov sa escapuje');
}

// ── Fakty v paneli ──────────────────────────────────────────────────────────
{
  ok(S.fact('IBAN', 'SK31…').includes('SK31'), 'fakt sa vykreslí');
  eq(S.fact('IBAN', ''), '', 'prázdna hodnota sa vynechá');
  eq(S.fact('IBAN', null), '', 'null sa vynechá');
  eq(S.fact('Hodiny', 0).includes('0'), true, 'nula je platná hodnota, nie prázdno');
}

// ── Filtrovanie ─────────────────────────────────────────────────────────────
{
  const rows = [
    { name: 'Ján Novák', city: 'Žilina', trade: 'sadrokarton', stav: 'aktivny' },
    { name: 'Peter Malý', city: 'Košice', trade: 'zvaranie', stav: 'aktivny' },
    { name: 'Eva Krátka', city: 'Žilina', trade: 'obklady', stav: 'ukonceny' },
  ];
  const f = ['name', 'city', 'trade'];

  eq(S.filterRows(rows, { q: '', fields: f }).length, 3, 'prázdny filter nechá všetko');
  eq(S.filterRows(rows, { q: 'zilina', fields: f }).map(r => r.name),
    ['Ján Novák', 'Eva Krátka'], 'hľadanie bez diakritiky nájde Žilinu');
  eq(S.filterRows(rows, { q: 'ŽILINA', fields: f }).length, 2, 'veľkosť písmen nehrá rolu');
  eq(S.filterRows(rows, { q: 'jan zilina', fields: f }).map(r => r.name), ['Ján Novák'],
    'dve slová musia sedieť obe');
  eq(S.filterRows(rows, { q: 'zilina praha', fields: f }).length, 0,
    'slovo, čo nesedí, vyradí riadok');
  eq(S.filterRows(rows, { q: 'novák', fields: f }).length, 1, 'hľadanie s diakritikou tiež funguje');

  // Rovnostné filtre
  eq(S.filterRows(rows, { equals: { stav: 'aktivny' } }).length, 2, 'filter podľa stavu');
  eq(S.filterRows(rows, { equals: { stav: '' } }).length, 3, 'prázdna voľba znamená „všetko"');
  eq(S.filterRows(rows, { equals: { stav: null } }).length, 3, 'null tiež znamená „všetko"');
  eq(S.filterRows(rows, { q: 'zilina', fields: f, equals: { stav: 'aktivny' } }).map(r => r.name),
    ['Ján Novák'], 'text a stav sa kombinujú');

  // Vnorená cesta
  const nested = [{ name: 'A', partner: { name: 'Bauer Bau' } }, { name: 'B', partner: { name: 'Hochtief' } }];
  eq(S.filterRows(nested, { q: 'bauer', fields: ['partner.name'] }).map(r => r.name), ['A'],
    'hľadá aj vo vnorenom poli');
  eq(S.filterRows(nested, { equals: { 'partner.name': 'Hochtief' } }).map(r => r.name), ['B'],
    'rovnostný filter vie vnorenú cestu');
  eq(S.pluck({ a: { b: null } }, 'a.b.c'), null, 'cesta cez null nezhodí');
  eq(S.pluck({}, 'a.b.c'), undefined, 'chýbajúca cesta nezhodí');

  eq(S.filterRows(null, { q: 'x' }), [], 'chýbajúci zoznam je prázdny');
  // Bez zadaných polí sa hľadá všade — pohodlné, ale nesmie to spadnúť.
  eq(S.filterRows(rows, { q: 'zvaranie' }).length, 1, 'bez zadaných polí hľadá všade');
}

// ── Zoznam ──────────────────────────────────────────────────────────────────
{
  const render = (r) => `<div>${r.name}</div>`;

  // Tri rôzne situácie, tri rôzne hlásenia.
  const full = S.list({ rows: [{ name: 'A' }, { name: 'B' }], total: 2, render });
  ok(full.includes('<div>A</div>'), 'zoznam vykreslí riadky');
  ok(!full.includes('fb-count'), 'keď nič nefiltruje, počet sa nevypisuje');

  const filtered = S.list({ rows: [{ name: 'A' }], total: 9, render });
  ok(filtered.includes('1 z 9'), 'filtrovaný zoznam povie, koľko z koľkých');

  const nothingMatches = S.list({ rows: [], total: 9, render });
  ok(nothingMatches.includes('Filtru nič nesedí'), 'prázdny výsledok filtra sa pozná');
  ok(nothingMatches.includes('9'), 'a povie, koľko je v databáze');

  const reallyEmpty = S.list({ rows: [], total: 0, render, emptyTitle: 'Žiadni kandidáti' });
  ok(reallyEmpty.includes('Žiadni kandidáti'), 'prázdna databáza má vlastné hlásenie');
  ok(!reallyEmpty.includes('Filtru nič nesedí'), 'prázdna databáza nie je prázdny filter');
}

// ── Filtrovací pás ──────────────────────────────────────────────────────────
{
  const h = S.filterbar({
    search: { value: 'žil', oninput: 'x()' },
    selects: [{ value: 'aktivny', options: [['', 'Všetky'], ['aktivny', 'Aktívne']], onchange: 'y()' }],
    chips: [{ label: 'S výnimkou', active: true, onclick: 'z()', count: 3 }],
    total: 10, shown: 4,
  });
  ok(h.includes('value="žil"'), 'hľadaný text zostane v poli');
  ok(h.includes('value="aktivny" selected'), 'zvolená možnosť je označená');
  ok(h.includes('fb-chip active'), 'aktívny chip je označený');
  ok(h.includes('<em>3</em>'), 'chip ukáže počet');
  ok(h.includes('4 z 10'), 'pás ukáže počty');
  ok(S.filterbar({}).includes('filterbar'), 'prázdny pás sa poskladá');
}

// ── Poznámky: len pridávanie ────────────────────────────────────────────────
{
  const rows = [
    { id: '1', body: 'Prvý hovor', author: 'Štefan', created_at: '2026-09-01T08:00:00Z' },
    { id: '2', body: 'Poslal doklady', author: 'Štefan', created_at: '2026-09-10T08:00:00Z' },
  ];
  const h = S.notes({ notes: rows, onAdd: 'add()' });

  // Toto je tvrdé pravidlo zo zadania: nič sa fyzicky nemaže. Komponent
  // teda nesmie tlačidlo na mazanie ani úpravu vôbec nakresliť.
  ok(!h.includes('trash'), 'poznámky nemajú tlačidlo na zmazanie');
  ok(!h.includes('Zmazať'), 'ani textové „Zmazať"');
  ok(!h.includes('Upraviť'), 'ani „Upraviť"');
  ok(h.includes('nič sa nemaže'), 'pravidlo je napísané priamo v hlavičke');

  ok(h.includes('2 záznamy'), 'počet v slovenskom skloňovaní');
  // Najnovšie hore — pri hovore človek potrebuje posledný stav, nie prvý.
  ok(h.indexOf('Poslal doklady') < h.indexOf('Prvý hovor'), 'najnovšia poznámka je prvá');
  ok(h.includes('Pridať'), 'dá sa pridať');

  const ro = S.notes({ notes: rows });
  ok(!ro.includes('Pridať'), 'bez onAdd sa pridávanie neponúka');
  ok(S.notes({ notes: [] }).includes('Zatiaľ žiadna poznámka'), 'prázdne poznámky');
  ok(S.notes({ notes: [{ body: '<img onerror=x>' }] }).includes('&lt;img'), 'telo sa escapuje');
  ok(S.notes({ notes: [{ body: 'x' }] }).includes('neznámy'), 'chýbajúci autor sa nezatají');

  eq(S.plural(0, 'záznam', 'záznamy', 'záznamov'), 'záznamov', 'nula záznamov');
  eq(S.plural(1, 'záznam', 'záznamy', 'záznamov'), 'záznam', 'jeden záznam');
  eq(S.plural(3, 'záznam', 'záznamy', 'záznamov'), 'záznamy', 'tri záznamy');
  eq(S.plural(7, 'záznam', 'záznamy', 'záznamov'), 'záznamov', 'sedem záznamov');
}

// ── Prehľad súm ─────────────────────────────────────────────────────────────
{
  // Príklad z docs/v2/03_superfaktura.md §6 — zrážka §48b.
  const lines = [
    { label: 'Fakturovaná suma', cents: 873600 },
    { label: 'Zrážka §48b (15 %)', cents: 131040, kind: 'minus', hint: 'bez Freistellung' },
  ];
  eq(S.total(lines).total, 742560, 'zrážka sa odčíta');
  const h = S.sums({ lines, totalLabel: 'Na účet príde' });
  ok(h.includes('8 736,00 €'), 'riadok s fakturovanou sumou');
  ok(h.includes('−1 310,40 €'), 'zrážka má mínus');
  ok(h.includes('7 425,60 €'), 'výsledok');
  ok(h.includes('Na účet príde'), 'vlastný názov súčtu');
  ok(h.includes('bez Freistellung'), 'nápoveda k riadku');

  // Informatívny riadok nesmie zmeniť súčet.
  eq(S.total([{ label: 'A', cents: 1000 }, { label: 'Marža', cents: 500, kind: 'info' }]).total,
    1000, 'informatívny riadok sa nepočíta');
  ok(S.sums({ lines: [{ label: 'Marža', cents: 500, kind: 'info' }] }).includes('sum-info'),
    'informatívny riadok je odlíšený');

  eq(S.total([]).total, 0, 'prázdny súčet je nula');
  eq(S.total(null).total, 0, 'chýbajúce riadky sú nula');
  eq(S.total([{ label: 'A', cents: 100 }, null]).total, 100, 'prázdny riadok sa preskočí');
  eq(S.total([{ label: 'A' }]).total, 0, 'riadok bez sumy je nula');

  // Nesmie sa stať, že sa do súčtu dostanú eurá namiesto centov.
  throws(() => S.total([{ label: 'A', cents: 12.5 }]), 'necelé centy sú chyba, nie tichý omyl');
}

// ── Blokátor ────────────────────────────────────────────────────────────────
{
  const reasons = [
    { rule: 'missing_a1', label: 'Chýba formulár A1', detail: 'Pri kontrole Zoll hrozí pokuta.' },
    { rule: 'expired_document', label: 'Živnostenský list expiroval' },
    { rule: 'below_min_wage', label: 'Sadzba je pod stavebnou minimálnou mzdou', severity: 'warn' },
  ];

  // Nič nepovolené → blokuje.
  const v0 = S.evaluate(reasons, [], '2026-09-17');
  eq(v0.ok, false, 'chýbajúce doklady blokujú');
  eq(v0.open.map(r => r.rule), ['missing_a1', 'expired_document'], 'dve otvorené prekážky');
  eq(v0.warnings.map(r => r.rule), ['below_min_wage'], 'upozornenie neblokuje');

  const h0 = S.blocker({ reasons, overrides: [], today: '2026-09-17', onOverride: 'ovr()' });
  ok(h0.includes('Takto to nepustím'), 'blokátor to povie priamo');
  ok(h0.includes('Pri kontrole Zoll hrozí pokuta'), 'blokátor povie, čo sa stane');
  ok(h0.includes('2 veci chýbajú'), 'počet v slovenskom skloňovaní');
  ok(h0.includes('Chcem to povoliť aj tak'), 'ponúkne cestu výnimkou');
  ok(h0.includes('aspoň 5 znakov'), 'povie, že dôvod je povinný');

  // Bez práva na výnimku sa cesta nesmie ponúkať.
  const noOvr = S.blocker({ reasons, today: '2026-09-17' });
  ok(!noOvr.includes('Zapísať výnimku'), 'bez práva sa výnimka neponúka');
  ok(noOvr.includes('len admin'), 'ale povie, kto ju môže povoliť');

  // Živá výnimka prekážku pokryje.
  const live = [{ rule_key: 'missing_a1', valid_until: '2026-12-31' }];
  const v1 = S.evaluate(reasons, live, '2026-09-17');
  eq(v1.open.map(r => r.rule), ['expired_document'], 'výnimka pokryje svoju prekážku');
  eq(v1.waived.map(r => r.rule), ['missing_a1'], 'pokrytá prekážka zostane vidieť');
  ok(S.blocker({ reasons, overrides: live, today: '2026-09-17' }).includes('povolené výnimkou'),
    'v zozname je vidieť, že to prešlo výnimkou, nie že to je v poriadku');

  // Zrušená a expirovaná výnimka neplatí.
  eq(S.evaluate(reasons, [{ rule_key: 'missing_a1', revoked_at: '2026-09-01T00:00:00Z' }],
    '2026-09-17').open.length, 2, 'zrušená výnimka neplatí');
  eq(S.evaluate(reasons, [{ rule_key: 'missing_a1', valid_until: '2026-09-16' }],
    '2026-09-17').open.length, 2, 'expirovaná výnimka neplatí');
  eq(S.evaluate(reasons, [{ rule_key: 'missing_a1', valid_until: '2026-09-17' }],
    '2026-09-17').open.length, 1, 'výnimka platí ešte v posledný deň');
  eq(S.evaluate(reasons, [{ rule_key: 'missing_a1' }], '2026-09-17').open.length, 1,
    'výnimka bez platnosti platí, kým sa nezruší');
  eq(S.evaluate(reasons, [{ rule_key: 'nieco_ine' }], '2026-09-17').open.length, 2,
    'výnimka na iné pravidlo nepomôže');

  // Čisto → pustí to ďalej.
  const v2 = S.evaluate([], [], '2026-09-17');
  eq(v2.ok, true, 'bez prekážok je čisto');
  const okHtml = S.blocker({ reasons: [], action: { label: 'Nasadiť', onclick: 'go()' } });
  ok(okHtml.includes('Nič neblokuje'), 'čistý stav to povie');
  ok(okHtml.includes('Nasadiť'), 'a ponúkne akciu');

  // Samotné upozornenie neblokuje, ale musí byť vidieť.
  const warnOnly = S.blocker({ reasons: [reasons[2]], action: { label: 'Nasadiť', onclick: 'go()' } });
  ok(warnOnly.includes('Nič neblokuje'), 'upozornenie samo neblokuje');
  ok(warnOnly.includes('pod stavebnou minimálnou mzdou'), 'ale je vidieť');
  ok(warnOnly.includes('Nasadiť'), 'akcia zostáva dostupná');

  eq(S.evaluate(null, null).ok, true, 'chýbajúci vstup nezhodí');
  eq(S.evaluate([null, reasons[0]], []).open.length, 1, 'prázdna prekážka sa preskočí');
}

// ── Dôvod výnimky musí prejsť aj v databáze ─────────────────────────────────
{
  // CHECK v migrácii 013: length(btrim(reason)) >= 5. UI nesmie pustiť ďalej
  // to, čo databáza odmietne — inak človek stratí, čo napísal.
  eq(S.REASON_MIN, 5, 'minimum sedí s CHECK v migrácii 013');
  eq(S.reasonValid('ok'), false, 'krátky dôvod neprejde');
  eq(S.reasonValid('     '), false, 'samé medzery neprejdú');
  eq(S.reasonValid('\n\t  '), false, 'ani biele znaky');
  eq(S.reasonValid(''), false, 'prázdny dôvod neprejde');
  eq(S.reasonValid(null), false, 'null neprejde');
  eq(S.reasonValid(undefined), false, 'undefined neprejde');
  eq(S.reasonValid('A1 dobehne v piatok, klient tlačí'), true, 'skutočný dôvod prejde');
  eq(S.reasonValid('  A1 do piatku  '), true, 'medzery navyše nevadia');
  eq(S.reasonValid('12345'), true, 'presne päť znakov prejde');
  eq(S.reasonValid('1234'), false, 'štyri znaky neprejdú');
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
