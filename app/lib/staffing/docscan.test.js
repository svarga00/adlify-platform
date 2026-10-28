// ============================================================================
// Testy čítania dokladu z fotky
// Spustenie:  node app/lib/staffing/docscan.test.js
// ============================================================================
// Z prečítaného dokladu sa nič neuloží samo — ale predvyplní sa formulár
// a kolega mu bude veriť. Preto sa tu skúša hlavne to, kde by sa dalo
// pomýliť: dátumy v slovenskom tvare, meno v opačnom poradí a bez diakritiky,
// doklad, ktorý už neplatí, a AI, ktorá si nie je istá.
// ============================================================================
global.window = global;
const S = require('./docscan');

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
const codes = (w) => w.map((x) => x.code);
const TODAY = '2026-10-28';

console.log('Doklad z fotky');

// ── Nástroj a zadanie ───────────────────────────────────────────────────────
{
  eq(S.TOOL.name, 'doklad', 'nástroj sa volá doklad');
  eq(S.TOOL.input_schema.properties.kind.enum, S.KINDS, 'druhy v nástroji sú tie isté ako v knižnici');
  eq(S.KINDS, ['a1', 'id_card', 'passport', 'trade_licence', 'contract', 'gdpr',
    'certificate', 'insurance', 'medical', 'other'], 'desať druhov dokladu');
  ok(S.KINDS.every((k) => S.KIND_LABEL[k]), 'každý druh má slovenský názov');
  for (const f of ['reference', 'valid_from', 'valid_to', 'holder_name', 'issuer', 'confidence', 'notes']) {
    ok(S.TOOL.input_schema.properties[f], `nástroj pýta ${f}`);
  }
  const t = S.instructions({ workerName: 'Ján Novák', expectedKind: 'a1', today: TODAY });
  ok(/Ján Novák/.test(t), 'zadanie pozná meno človeka');
  ok(/formulár A1/.test(t), 'aj očakávaný druh');
  ok(/RRRR-MM-DD/.test(t), 'a chce dátumy v jednom tvare');
  ok(/platí papier/.test(t), 'papier má prednosť pred zadaním');
  ok(!/undefined/.test(S.instructions({})), 'bez vstupu zadanie nespadne ani nevypíše „undefined"');
  ok(!/očakávaný|by mal byť/.test(S.instructions({ expectedKind: 'hlupost' })), 'neznámy druh sa do zadania nedostane');
}

// ── Normalizácia ────────────────────────────────────────────────────────────
{
  const r = S.normalize({
    kind: 'A1', reference: '  SK 123 / 2026 ', valid_from: '01.09.2026', valid_to: '2027-08-31',
    holder_name: 'NOVÁK JÁN', issuer: 'Sociálna poisťovňa', confidence: 0.93, notes: '',
  });
  eq(r, { kind: 'a1', reference: 'SK 123 / 2026', valid_from: '2026-09-01', valid_to: '2027-08-31',
    holder_name: 'NOVÁK JÁN', issuer: 'Sociálna poisťovňa', confidence: 0.93, notes: '' },
  'čisté polia: druh malými, dátumy RRRR-MM-DD, orezané medzery');

  eq(S.parseDate('3. 2. 2027'), '2027-02-03', 'slovenský dátum s medzerami');
  eq(S.parseDate('03/02/2027'), '2027-02-03', 'dátum s lomkami (deň prvý)');
  eq(S.parseDate('2027-02-30'), null, 'neexistujúci deň → null');
  eq(S.parseDate('31.13.2027'), null, 'neexistujúci mesiac → null');
  eq(S.parseDate('neviem'), null, 'text → null');
  eq(S.parseDate(null), null, 'null → null');
  eq(S.parseDate('2027-02-03T00:00:00Z'), '2027-02-03', 'dátum s časom sa oreže');

  eq(S.parseConfidence(85), 0.85, 'percentá sa prevedú');
  eq(S.parseConfidence('low'), 0.3, 'slovo „low" je nízka istota');
  eq(S.parseConfidence(7), 0.07, 'číslo do sto je percento');
  eq(S.parseConfidence(-1), 0, 'záporná istota je nula');
  eq(S.parseConfidence(undefined), 0, 'chýbajúca istota je nula, nie istota');

  eq(S.normalize({ kind: 'vodičák', confidence: 1 }).kind, 'other', 'neznámy druh → other');
  eq(S.normalize(null).kind, 'other', 'prázdny výstup nespadne');
  eq(S.normalize({ reference: 'null', holder_name: '—' }).reference, null, '„null" ako text nie je číslo dokladu');
  eq(S.normalize({ reference: 'x'.repeat(200) }).reference.length, 80, 'príliš dlhé číslo sa oreže');
}

// ── Meno na doklade ─────────────────────────────────────────────────────────
{
  eq(S.nameMatch('NOVÁK JÁN', 'Ján Novák').state, 'match', 'opačné poradie a veľké písmená sedia');
  eq(S.nameMatch('Novak Jan', 'Ján Novák').state, 'match', 'bez diakritiky sedí');
  eq(S.nameMatch('Ján Peter Novák', 'Ján Novák').state, 'match', 'druhé krstné meno navyše nevadí');
  eq(S.nameMatch('Nowák Ján', 'Ján Novák').state, 'match', 'jeden preklep v dlhšom slove prejde');
  eq(S.nameMatch('Horváth Peter', 'Ján Novák').state, 'mismatch', 'cudzie meno nesedí');
  eq(S.nameMatch('Novák', 'Ján Novák').state, 'mismatch', 'samotné priezvisko nestačí');
  eq(S.nameMatch('Novák Jozef', 'Ján Novák').state, 'mismatch', 'iné krstné meno nesedí (brat)');
  eq(S.nameMatch('', 'Ján Novák').state, 'unknown', 'bez mena na doklade sa nedá porovnať');
  eq(S.nameMatch('Ján Novák', '').state, 'unknown', 'ani bez mena človeka');
  eq(S.nameMatch('Kovács-Nagy Gábor', 'Gábor Kovács Nagy').state, 'match', 'spojovník v priezvisku');
}

// ── Čo si treba overiť ──────────────────────────────────────────────────────
{
  const dobre = S.normalize({ kind: 'a1', reference: 'A1-77', valid_from: '2026-09-01',
    valid_to: '2027-08-31', holder_name: 'NOVÁK JÁN', confidence: 0.9 });
  eq(S.check(dobre, { workerName: 'Ján Novák', expectedKind: 'a1', today: TODAY }), [],
    'dobrý doklad nemá upozornenia');

  const cudzi = S.check({ ...dobre, holder_name: 'Horváth Peter' }, { workerName: 'Ján Novák', today: TODAY });
  eq(codes(cudzi), ['name_mismatch'], 'cudzie meno sa ohlási');
  ok(/Horváth Peter/.test(cudzi[0].text) && /Ján Novák/.test(cudzi[0].text), 'veta povie obe mená');
  eq(cudzi[0].severity, 'bad', 'a je to vážne');

  const stary = S.check({ ...dobre, valid_to: '2026-10-01' }, { workerName: 'Ján Novák', today: TODAY });
  eq(codes(stary), ['expired'], 'neplatný doklad sa ohlási');
  ok(/1\. 10\. 2026/.test(stary[0].text), 's dátumom po slovensky');

  eq(codes(S.check({ ...dobre, valid_from: '2027-01-01', valid_to: '2028-01-01' },
    { workerName: 'Ján Novák', today: TODAY })), ['not_yet'], 'ešte neplatný doklad sa ohlási');

  eq(codes(S.check({ ...dobre, confidence: 0.4 }, { workerName: 'Ján Novák', today: TODAY })), ['unsure'],
    'nízka istota AI sa ohlási');
  eq(codes(S.check({ ...dobre, confidence: 0.6 }, { workerName: 'Ján Novák', today: TODAY })), [],
    'prah je 0,6 — presne 0,6 už stačí');

  eq(codes(S.check({ ...dobre, kind: 'passport' }, { workerName: 'Ján Novák', expectedKind: 'a1', today: TODAY })),
    ['kind_mismatch'], 'iný druh, než sa čakal, sa ohlási');
  eq(codes(S.check({ ...dobre, kind: 'passport' }, { workerName: 'Ján Novák', expectedKind: 'id_card', today: TODAY })),
    [], 'pas namiesto občianskeho nevadí — pri nasadení sú to isté');

  eq(codes(S.check({ ...dobre, valid_from: '2027-09-01', valid_to: '2027-08-31' },
    { workerName: 'Ján Novák', today: TODAY })), ['not_yet', 'dates_swapped'], 'prehodené dátumy sa ohlásia');

  eq(codes(S.check({ ...dobre, holder_name: null, valid_to: null }, { workerName: 'Ján Novák', today: TODAY })),
    ['name_unread', 'no_valid_to'], 'nečitateľné meno a chýbajúce „do" pri A1 sú len informácia');

  const vela = S.check({ ...dobre, holder_name: 'Horváth Peter', valid_to: '2026-01-01', confidence: 0.2 },
    { workerName: 'Ján Novák', today: TODAY });
  eq(vela.map((w) => w.severity), ['bad', 'bad', 'warn', 'warn'], 'vážne upozornenia sú prvé');
  eq(S.check(null, {}).length, 1, 'prázdny vstup nespadne (len nízka istota)');
}

// ── Formulár a záznam ───────────────────────────────────────────────────────
{
  eq(S.toFields({ kind: 'a1', reference: 'A1-77', valid_from: '2026-09-01', valid_to: null }),
    { kind: 'a1', reference: 'A1-77', valid_from: '2026-09-01' },
    'do formulára idú len vyplnené polia — prázdne neprepíše, čo kolega napísal');
  eq(S.toFields({ kind: 'other' }), {}, '„iný doklad" druh vo formulári nemení');

  const rec = S.record({ kind: 'a1', confidence: 0.9 }, { model: 'm', at: '2026-10-28T10:00:00Z',
    warnings: [{ code: 'unsure' }, {}] });
  eq(rec.model, 'm', 'záznam nesie model');
  eq(rec.read_at, '2026-10-28T10:00:00Z', 'aj čas čítania');
  eq(rec.warnings, ['unsure'], 'a kódy upozornení');
  eq(rec.kind, 'a1', 'a prečítané údaje');
  eq(S.record(null), null, 'bez čítania nie je záznam');
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
