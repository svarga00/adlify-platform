// ============================================================================
// Testy úloh a pravidiel
// Spustenie:  node app/lib/tasks.test.js
// ============================================================================
global.window = global;
const T = require('./tasks');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

const TODAY = '2026-09-17';
const task = (id, due, extra = {}) =>
  ({ id, title: 'Úloha ' + id, due_date: due, status: 'open', priority: 'normal', ...extra });

console.log('Úlohy a pravidlá');

// ── Do ktorej skupiny úloha patrí ───────────────────────────────────────────
{
  eq(T.bucketOf(task('a', '2026-09-10'), TODAY), 'overdue', 'včerajšok horí');
  eq(T.bucketOf(task('a', '2026-09-17'), TODAY), 'today', 'dnešok je dnes');
  eq(T.bucketOf(task('a', '2026-09-20'), TODAY), 'week', 'o tri dni');
  eq(T.bucketOf(task('a', '2026-09-24'), TODAY), 'week', 'presne o sedem dní ešte tento týždeň');
  eq(T.bucketOf(task('a', '2026-09-25'), TODAY), 'later', 'o osem dní už neskôr');
  eq(T.bucketOf(task('a', null), TODAY), 'later', 'bez termínu je to neskôr');
  eq(T.bucketOf(null, TODAY), 'later', 'prázdna úloha nezhodí');
}

// ── Odloženie nie je zmazanie ───────────────────────────────────────────────
{
  ok(T.isActive(task('a', '2026-09-17'), TODAY), 'bežná úloha je aktívna');
  ok(!T.isActive(task('a', '2026-09-17', { status: 'done' }), TODAY),
    'vybavená úloha už nie');
  ok(!T.isActive(task('a', '2026-09-17', { postponed_to: '2026-10-01' }), TODAY),
    'odložená na október sa dnes neukáže');
  ok(T.isActive(task('a', '2026-09-17', { postponed_to: '2026-09-17' }), TODAY),
    'odložená na dnes sa vráti');
  ok(T.isActive(task('a', '2026-09-17', { postponed_to: '2026-09-01' }), TODAY),
    'odloženie, ktorému uplynul deň, už neplatí');
}

// ── Triedenie ───────────────────────────────────────────────────────────────
{
  const rows = [
    task('1', '2026-09-20'),
    task('2', '2026-09-10'),
    task('3', '2026-09-17'),
    task('4', '2026-12-01'),
    task('5', '2026-09-17', { status: 'done' }),
    task('6', '2026-09-17', { postponed_to: '2026-11-01' }),
  ];
  const g = T.group(rows, TODAY);
  eq(g.map(x => x.key), ['overdue', 'today', 'week', 'later'], 'štyri skupiny v poradí');
  eq(g[0].tasks.map(t => t.id), ['2'], 'po splatnosti');
  eq(g[1].tasks.map(t => t.id), ['3'], 'dnes — vybavená a odložená sa nepočítajú');
  eq(g[2].tasks.map(t => t.id), ['1'], 'tento týždeň');
  eq(g[3].tasks.map(t => t.id), ['4'], 'neskôr');

  // Prázdne skupiny sa nekreslia — zoznam má byť krátky.
  eq(T.group([task('1', '2026-09-10')], TODAY).map(x => x.key), ['overdue'],
    'prázdne skupiny sa vynechajú');
  eq(T.group([], TODAY), [], 'bez úloh niet skupín');
  eq(T.group(null, TODAY), [], 'chýbajúci zoznam nezhodí');

  // Vnútri skupiny rozhoduje priorita, nie poradie vzniku.
  const p = T.group([
    task('nizka', '2026-09-17', { priority: 'low' }),
    task('vysoka', '2026-09-17', { priority: 'high' }),
    task('bezna', '2026-09-17'),
    task('urgent', '2026-09-17', { priority: 'urgent' }),
  ], TODAY);
  eq(p[0].tasks.map(t => t.id), ['urgent', 'vysoka', 'bezna', 'nizka'],
    'priorita rozhoduje');

  // Pri rovnakej priorite rozhoduje termín.
  const d = T.group([
    task('neskor', '2026-09-23'),
    task('skor', '2026-09-19'),
  ], TODAY);
  eq(d[0].tasks.map(t => t.id), ['skor', 'neskor'], 'potom termín');

  eq(T.group([task('x', '2026-09-17', { priority: 'nieco' })], TODAY)[0].tasks.length, 1,
    'neznáma priorita nezhodí');
}

// ── Jedna veta na dashboard ─────────────────────────────────────────────────
{
  // Toto je to, čo má človek prečítať ako prvé.
  eq(T.headline([], TODAY).tone, 'ok', 'bez úloh je pokoj');
  ok(T.headline([], TODAY).text.includes('Nič nehorí'), 'a povie sa to po ľudsky');

  const overdue = T.headline([task('1', '2026-09-10'), task('2', '2026-09-17')], TODAY);
  eq(overdue.tone, 'bad', 'po splatnosti je to zlé');
  ok(overdue.text.includes('1 vec mala byť hotová'), 'skloňovanie pre jednu');
  ok(overdue.text.includes('1 je na dnes'), 'a pripomenie sa aj dnešok');

  const many = T.headline([task('1', '2026-09-01'), task('2', '2026-09-02'),
    task('3', '2026-09-03'), task('4', '2026-09-04'), task('5', '2026-09-05')], TODAY);
  ok(many.text.includes('5 vecí malo byť hotových'), 'skloňovanie pre päť');

  const todayOnly = T.headline([task('1', '2026-09-17')], TODAY);
  eq(todayOnly.tone, 'warn', 'dnešok je upozornenie');
  ok(todayOnly.text.includes('1 vec je na dnes'), 'a povie koľko');

  const weekOnly = T.headline([task('1', '2026-09-20')], TODAY);
  eq(weekOnly.tone, 'ok', 'tento týždeň nehorí');
  ok(weekOnly.text.includes('Dnes nič nehorí'), 'ale povie sa, že niečo príde');
  ok(weekOnly.text.includes('1 vec'), 'aj koľko');

  // Odložené a vybavené sa do vety nepočítajú.
  eq(T.headline([task('1', '2026-09-10', { status: 'done' })], TODAY).tone, 'ok',
    'vybavené úlohy vetu nemenia');
}

// ── Počty do odznakov ───────────────────────────────────────────────────────
{
  const c = T.counts([
    task('1', '2026-09-10'),
    task('2', '2026-09-17'),
    task('3', '2026-09-20'),
    task('4', '2026-12-01'),
    task('5', '2026-09-17', { postponed_to: '2026-11-01' }),
    task('6', '2026-09-17', { status: 'done' }),
  ], TODAY);
  eq(c.total, 4, 'aktívne úlohy');
  eq(c.overdue, 1, 'po splatnosti');
  eq(c.today, 1, 'dnes');
  eq(c.week, 1, 'tento týždeň');
  eq(c.later, 1, 'neskôr');
  eq(c.snoozed, 1, 'odložené sa počítajú zvlášť — nie sú stratené');
  eq(T.counts([], TODAY).total, 0, 'prázdny zoznam');
}

// ── Pravidlo v ľudskej reči ─────────────────────────────────────────────────
{
  const d = T.describeRule({
    source_table: 'danubra_worker_documents', date_field: 'valid_to',
    filter: { kind: 'a1' }, days_before: 60,
    task_title_template: 'Vybaviť nové A1 pre {label} — končí {date}',
  });
  eq(d.what, 'doklad pracovníka', 'tabuľka po slovensky');
  ok(d.when.includes('60 dní pred'), 'kedy sa spustí');
  eq(d.filters, 'kind = a1', 'na čo sa vzťahuje');
  ok(d.example.includes('Ján Novák'), 'ukážka s menom');
  ok(d.example.includes('31.12.2026'), 'aj s dátumom');

  eq(T.describeRule({ source_table: 'danubra_periods', date_field: 'period_to',
    days_before: 0 }).when, 'keď nastane period_to', 'nula dní znamená v deň');
  eq(T.describeRule({}).filters, null, 'bez filtra');
  eq(T.describeRule({ source_table: 'nieco_ine' }).what, 'nieco_ine',
    'neznáma tabuľka sa vypíše, ako je');
}

// ── Čo na pravidle nesedí ───────────────────────────────────────────────────
{
  const good = T.reviewRule({
    key: 'a1_expiry', source_table: 'danubra_worker_documents',
    date_field: 'valid_to', task_title_template: 'Vybaviť A1 pre {label}',
    days_before: 60,
  });
  eq(good.ok, true, 'poriadne pravidlo prejde');
  eq(good.warnings, [], 'bez upozornení');

  eq(T.reviewRule({}).reasons.map(r => r.rule).sort(),
    ['rule_bad_key', 'rule_no_source', 'rule_no_title'],
    'prázdne pravidlo má tri prekážky');

  ok(T.reviewRule({ key: 'Ab Cd', source_table: 'x', date_field: 'valid_to',
    task_title_template: 'z {label}' }).reasons.some(r => r.rule === 'rule_bad_key'),
    'veľké písmená a medzery v kľúči neprejdú');
  ok(T.reviewRule({ key: 'ab', source_table: 'x', date_field: 'valid_to',
    task_title_template: 'z {label}' }).reasons.some(r => r.rule === 'rule_bad_key'),
    'dva znaky sú málo');

  // Statický text znamená, že sa úlohy nedajú rozlíšiť.
  const staticTitle = T.reviewRule({
    key: 'test_rule', source_table: 'x', date_field: 'valid_to',
    task_title_template: 'Pozri sa na to',
  });
  eq(staticTitle.ok, true, 'statický text neblokuje');
  ok(staticTitle.warnings.some(w => w.rule === 'rule_static_title'),
    'ale upozorní, že sa úlohy nedajú rozlíšiť');

  ok(T.reviewRule({ key: 'test_rule', source_table: 'x', date_field: 'valid_to',
    task_title_template: '{label}', days_before: 365 }).warnings
    .some(w => w.rule === 'rule_far_ahead'),
    'rok dopredu je príliš ďaleko');

  // Motor skladá WHERE z kľúčov filtra. Databáza to kontroluje tiež, ale
  // človek to má vidieť, kým píše — nie dostať chybu z Postgresu po uložení.
  const zlyFilter = T.reviewRule({
    key: 'test_rule', source_table: 'x', date_field: 'valid_to',
    task_title_template: '{label}', filter: { "status'; drop table": 'x' },
  });
  ok(zlyFilter.reasons.some(r => r.rule === 'rule_bad_filter'),
    'podstrčený názov stĺpca vo filtri neprejde');
  ok(T.reviewRule({
    key: 'test_rule', source_table: 'x', date_field: 'valid_to',
    task_title_template: '{label}', filter: { status: 'active' },
  }).ok, 'bežný filter prejde');

  ok(T.reviewRule({ key: 'test_rule', source_table: 'x', date_field: 'ab',
    task_title_template: '{label}' }).reasons.some(r => r.rule === 'rule_bad_date_field'),
    'krátky názov dátumového stĺpca neprejde');
}

// ── Pravidlá vo formulári ───────────────────────────────────────────────────
// Formulár ponúka tabuľky a stĺpce z databázy. Preklad názvu tabuľky je ale
// v appke — a keby sa rozišiel so zoznamom, ktorý databáza povolí, človek by
// v rozbaľovacom zozname videl „danubra_bills" namiesto „prijatá faktúra".
{
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, 'database', 'migrations');
  const migDir = fs.existsSync(dir) ? dir
    : path.join(__dirname, '..', 'database', 'migrations');
  const sql = fs.readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()
    .map(f => fs.readFileSync(path.join(migDir, f), 'utf8'))
    // Nestačí hľadať meno CHECK-u: spomína ho aj migrácia, ktorá ho len
    // číta. Platí tá posledná, ktorá ho **definuje**.
    .filter(x => /check \(source_table in \(/.test(x))
    .pop();
  ok(sql, 'zoznam povolených tabuliek je v migráciách');

  const blok = /check \(source_table in \(([\s\S]*?)\)\)/.exec(sql || '');
  ok(blok, 'a dá sa z CHECK-u prečítať');
  const db = (blok ? blok[1] : '').split(',')
    .map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);

  eq(db.slice().sort(), Object.keys(T.RULE_TABLES).sort(),
    'appka prekladá presne tie tabuľky, ktoré databáza povolí');

  ok(Object.values(T.RULE_TABLES).every(v => v && !v.startsWith('danubra_')),
    'a každá má slovenský názov');
  eq(T.tableLabel('danubra_bills'), 'prijatá faktúra', 'preklad sedí');
  eq(T.tableLabel('nieco_cudzie'), 'nieco_cudzie', 'neznáma vráti sama seba');

  ok(T.RULE_VARS.length >= 3, 'text úlohy má vysvetlené premenné');
  ok(T.RULE_VARS.find(v => v[0] === '{days}')[1].includes('záporné'),
    'a pri {days} je napísané aj to nepríjemné');
}

// ── Kto čo má na starosti ───────────────────────────────────────────────────
// Zoznam dvadsiatich úloh je stena, z ktorej sa nedá prečítať, či na niekom
// visí všetko a na inom nič. Toto je odpoveď na „kto čo robí".
{
  const D = '2026-09-28';
  const tasks = [
    { id: '1', title: 'A', status: 'open', due_date: '2026-09-20', assigned_name: 'Štefan' },
    { id: '2', title: 'B', status: 'open', due_date: '2026-09-28', assigned_name: 'Štefan' },
    { id: '3', title: 'C', status: 'open', due_date: '2026-10-01', assigned_name: 'Michaela' },
    { id: '4', title: 'D', status: 'open', due_date: '2026-09-25' },
    { id: '5', title: 'E', status: 'open', due_date: '2026-09-25', assigned_name: '  ' },
    { id: '6', title: 'F', status: 'done', due_date: '2026-09-01', assigned_name: 'Štefan' },
  ];
  const rows = T.byPerson(tasks, D);
  eq(rows.map(r => r.name), [T.UNASSIGNED, 'Štefan', 'Michaela'],
    'nepriradené je prvé — úloha, ktorú nikto nemá, je horšia než úloha po termíne');
  eq(rows.find(r => r.name === T.UNASSIGNED).total, 2,
    'prázdne meno aj samé medzery znamenajú „nikto"');
  eq(rows.find(r => r.name === 'Štefan').total, 2, 'hotová úloha sa nikomu nepočíta');
  eq(rows.find(r => r.name === 'Štefan').overdue, 1, 'po termíne sa počíta zvlášť');
  eq(rows.find(r => r.name === 'Štefan').today, 1, 'aj dnešok');
  eq(rows.find(r => r.name === 'Michaela').week, 1, 'aj tento týždeň');
  eq(T.byPerson([], D), [], 'bez úloh prázdno');
  eq(T.byPerson(null, D), [], 'a bez vstupu tiež');

  eq(T.people(tasks), ['Michaela', 'Štefan'], 'mená na výber bez duplicít a prázdnych');
  eq(T.people(null), [], 'a bez úloh prázdno');

  ok(T.isFor(tasks[0], 'Štefan'), 'úloha patrí tomu, kto je na nej napísaný');
  ok(!T.isFor(tasks[0], 'Michaela'), 'a nie inému');
  ok(T.isFor(tasks[3], T.UNASSIGNED), 'úloha bez mena patrí „nikomu"');
  ok(T.isFor(tasks[4], T.UNASSIGNED), 'aj tá s medzerami');
  ok(!T.isFor(tasks[0], T.UNASSIGNED), 'a priradená už nie');
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
