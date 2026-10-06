// ============================================================================
// Testy výnimiek
// Spustenie:  node app/lib/overrides.test.js
// ============================================================================
// Posledné dva testy sú tie dôležité. Prvý porovnáva zoznam obchádzateľných
// pravidiel s číselníkom v migráciách — keby sa rozišli, výnimka by sa
// zapísala pod kľúčom, ktorý appka nevie pomenovať, a v prehľade by bolo
// „missing_a1" namiesto vety. Druhý kontroluje, že každá prekážka, ktorú
// blokátor vie vyrobiť, je zaradená: buď sa obísť dá, alebo je napísané,
// prečo nie. Nezaradená prekážka je tichá diera — človek klikne na výnimku,
// tá sa zapíše a nepustí ho to ďalej, bez vysvetlenia.
// ============================================================================
global.window = global;
const fs = require('fs');
const path = require('path');
const O = require('./overrides');
const Docs = require('./staffing/documents');
const Inv = require('./billing/invoice');

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

const chybaA1 = { rule: 'missing_a1', label: 'Chýba: Formulár A1', severity: 'block' };
const expirovany = { rule: 'expired_document', label: 'Expiroval: Občiansky', severity: 'block' };
const bezCisla = { rule: 'invoice_no_number', label: 'Faktúra nemá číslo', severity: 'block' };
const nesedi = { rule: 'invoice_amount_mismatch', label: 'Suma nesedí', severity: 'block' };

console.log('Výnimky');

// ── Čo sa obísť dá ──────────────────────────────────────────────────────────
{
  ok(O.waivable('missing_a1'), 'A1 sa dá prevziať na seba');
  ok(O.waivable('below_min_wage'), 'aj sadzba pod minimálnou mzdou');
  ok(!O.waivable('invoice_no_partner'), 'faktúra bez odberateľa nie');
  ok(!O.waivable('invoice_period_open'), 'ani neuzavreté obdobie');
  ok(!O.waivable('nieco_nezname'), 'a neznáme pravidlo tiež nie');

  // Výnimka bez následku by bola len klik. Pri každej je napísané, čo sa ňou
  // berie na seba — to je to, čo sa po roku pri kontrole číta.
  for (const [key, m] of Object.entries(O.WAIVABLE)) {
    ok(m.risk && m.risk.length > 20, `„${key}" má napísané, čo tým človek riskuje`);
    ok(['worker', 'assignment', 'invoice'].includes(m.scope),
      `„${key}" sa drží konkrétneho záznamu`);
  }
  for (const [key, why] of Object.entries(O.HARD)) {
    ok(why && why.length > 20, `„${key}" má napísané, prečo sa obísť nedá`);
    ok(!O.waivable(key), `„${key}" nie je v oboch zoznamoch naraz`);
  }
}

// ── Rozdelenie prekážok ─────────────────────────────────────────────────────
{
  const s = O.split([chybaA1, bezCisla, nesedi]);
  eq(s.can.map(r => r.rule), ['missing_a1', 'invoice_amount_mismatch'],
    'obchádzateľné sa oddelia');
  eq(s.cannot.map(r => r.rule), ['invoice_no_number'], 'a zvyšok zostane');
  eq(O.split(null).can, [], 'chýbajúci vstup nezhodí');
  eq(O.split([null, chybaA1]).can.length, 1, 'prázdna prekážka sa preskočí');
}

// ── Živé výnimky ────────────────────────────────────────────────────────────
{
  const all = [
    { rule_key: 'missing_a1' },
    { rule_key: 'missing_contract', revoked_at: '2026-09-01T00:00:00Z' },
    { rule_key: 'below_min_wage', valid_until: '2026-09-16' },
    { rule_key: 'missing_zoll', valid_until: '2026-09-17' },
  ];
  eq(O.live(all, '2026-09-17').map(o => o.rule_key), ['missing_a1', 'missing_zoll'],
    'zrušená a prepadnutá výnimka sa nerátajú');
  eq(O.live(all, '2026-09-16').length, 3, 'v deň platnosti ešte platí');
  eq(O.live(null).length, 0, 'bez zoznamu je to prázdne');
}

// ── Riadky na zápis ─────────────────────────────────────────────────────────
{
  const { rows, skipped } = O.rowsFor([chybaA1, expirovany, bezCisla], {
    entityType: 'assignment', entityId: 'asg-1', reason: 'Klient to chce zajtra, A1 je podané.',
  });
  eq(rows.length, 2, 'zapíšu sa len tie, ktoré výnimka pokryje');
  eq(skipped.map(r => r.rule), ['invoice_no_number'], 'zvyšok sa vráti ako nepokrytý');

  // Doklady sú vlastnosť človeka, nie tohto jedného nasadenia. Keby sa
  // výnimka viazala na nasadenie, pri druhej stavbe by ju niekto písal znova.
  eq(rows.map(r => r.entity_type), ['worker', 'worker'],
    'výnimka na doklad sa drží človeka, aj keď sa zapisuje pri nasadení');

  const sadzba = O.rowsFor([{ rule: 'below_min_wage' }], {
    entityType: 'assignment', entityId: 'asg-1', reason: 'Dohodnuté s partiou.',
  });
  eq(sadzba.rows[0].entity_type, 'assignment', 'sadzba je vlastnosť nasadenia');

  // Chýbajúci občiansky aj chýbajúci pas dajú to isté pravidlo. Dva riadky
  // by znamenali, že jedno zrušenie výnimku nezruší.
  const dva = O.rowsFor([
    { rule: 'missing_document', label: 'Chýba: Doklad totožnosti' },
    { rule: 'missing_document', label: 'Chýba: Poistenie' },
  ], { entityType: 'worker', entityId: 'w-1', reason: 'Dodá v piatok.' });
  eq(dva.rows.length, 1, 'to isté pravidlo sa zapíše raz');

  eq(O.rowsFor([chybaA1], { entityType: 'worker', entityId: 'w-1', reason: '  Dôvod  ' })
    .rows[0].reason, 'Dôvod', 'dôvod sa obstrihá');
  eq(O.rowsFor([chybaA1], { entityType: 'worker', entityId: 'w-1', reason: 'x',
    validUntil: '2026-12-31' }).rows[0].valid_until, '2026-12-31',
    'dočasná výnimka si nesie dátum');
  eq(O.rowsFor([bezCisla], { entityType: 'invoice', entityId: 'i-1', reason: 'x' }).rows,
    [], 'z neobchádzateľnej prekážky nevznikne riadok');
}

// ── Veta pre človeka ────────────────────────────────────────────────────────
{
  ok(O.summary([chybaA1]).includes('1 pravidlo'), 'jedno pravidlo');
  ok(O.summary([chybaA1, expirovany]).includes('2 pravidlá'), 'dve pravidlá');
  ok(O.summary([chybaA1, bezCisla]).includes('zostane'),
    'povie sa, že jedna prekážka zostane');
  ok(O.summary([bezCisla]).includes('nepokryje'), 'a keď nepokryje nič, povie to');
  ok(O.summary([]).includes('Niet čo povoliť'), 'aj keď nič neblokuje');
}

// ── Výnimky podľa záznamu ───────────────────────────────────────────────────
{
  const all = [
    { entity_type: 'worker', entity_id: 'w-1', rule_key: 'missing_a1' },
    { entity_type: 'assignment', entity_id: 'a-1', rule_key: 'below_min_wage' },
    { entity_type: 'worker', entity_id: 'w-2', rule_key: 'missing_a1' },
  ];
  eq(O.forEntity(all, 'worker', 'w-1').length, 1, 'vyberú sa len tie svoje');
  eq(O.forEntity(all, 'assignment', 'w-1').length, 0, 'typ musí sedieť tiež');
}

// ── Appka a číselník musia hovoriť to isté ──────────────────────────────────
// V číselníku je slovenský názov pravidla. Keby tam kľúč chýbal, v zozname
// zapísaných výnimiek by svietilo „missing_a1" namiesto vety.
{
  const dir = path.join(__dirname, 'database', 'migrations');
  const migDir = fs.existsSync(dir) ? dir
    : path.join(__dirname, '..', 'database', 'migrations');
  const sql = fs.readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()
    .map(f => fs.readFileSync(path.join(migDir, f), 'utf8')).join('\n');

  const enumKeys = new Set(
    [...sql.matchAll(/\('override_rule'\s*,\s*'([a-z0-9_]+)'/g)].map(m => m[1]));
  ok(enumKeys.size >= 7, 'číselník pravidiel je v migráciách',
    `našiel som ${enumKeys.size}`);

  const chybne = Object.keys(O.WAIVABLE).filter(k => !enumKeys.has(k));
  ok(chybne.length === 0, 'každé obchádzateľné pravidlo má názov v číselníku',
    `chýba v číselníku: ${chybne.join(', ')}`);

  const navyse = [...enumKeys].filter(k => !O.waivable(k));
  ok(navyse.length === 0, 'a číselník nepozná pravidlo, ktoré appka neponúka',
    `v číselníku navyše: ${navyse.join(', ')}`);
}

// ── Každá prekážka musí byť zaradená ────────────────────────────────────────
// Blokátor vie vyrobiť len tie pravidlá, ktoré sú v knižniciach. Každé z nich
// musí mať povedané, či sa obísť dá — inak človek klikne na výnimku a nič sa
// nestane.
{
  // Doklady: požiadavky plus expirovaný doklad, ktorý vzniká za behu.
  const docRules = new Set(['expired_document']);
  for (const ctx of ['assignment', 'construction', 'workshop', 'regulated']) {
    for (const req of Docs.requirementsFor([ctx])) {
      if (req.blocks) docRules.add(req.rule);
    }
  }
  const nezaradene = [...docRules].filter(r => !O.waivable(r));
  ok(nezaradene.length === 0, 'každá prekážka pri nasadení sa dá prevziať na seba',
    `nezaradené: ${nezaradene.join(', ')}`);

  // Faktúra: prekážky zo skutočného vyhodnotenia, nie z čítania kódu.
  const rev = Inv.reviewBeforeApproval({
    invoice: { vat_regime: 'reverse_charge', amount_net: 0, period_id: 'p-1' },
    partner: {}, period: { status: 'open', amount_charged: 1000 }, subcontract: {},
  });
  ok(rev.reasons.length >= 4, 'prázdna faktúra dá viac prekážok naraz',
    `dostal som ${rev.reasons.length}`);
  const bezZaradenia = rev.reasons
    .map(r => r.rule)
    .filter(r => !O.waivable(r) && !O.hardWhy(r));
  ok(bezZaradenia.length === 0,
    'každá prekážka pri faktúre má povedané, či sa dá obísť',
    `bez zaradenia: ${bezZaradenia.join(', ')}`);

  // A to, čo drží databáza, sa obísť nedá ani výnimkou. Schválenie faktúry
  // nie je pravidlo blokátora — je to právomoc administrátora.
  ok(!O.waivable('invoice.approve'), 'schválenie faktúry nie je výnimka');
  ok(!O.waivable('invoice_period_open'), 'uzavretie obdobia sa neobchádza');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
