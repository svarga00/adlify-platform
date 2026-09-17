// ============================================================================
// Testy číselníkov
// Spustenie:  node danubra/lib/enums.test.js
// ============================================================================
global.window = global;

// Falošná databáza — vráti presne to, čo zasialo migrácia 013.
let respond = () => ({ data: ROWS, error: null });
global.DB = { list: async (...a) => respond(...a) };

const ROWS = [
  { kind: 'unit', key: 'h', label_sk: 'hodina', label_de: 'Stunde', sort_order: 1, active: true },
  { kind: 'unit', key: 'ks', label_sk: 'kus', label_de: 'Stück', sort_order: 2, active: true },
  { kind: 'worker_document', key: 'a1', label_sk: 'Formulár A1', label_de: 'A1-Bescheinigung',
    hint: 'Vystavuje Sociálna poisťovňa, trvá až 45 dní.', sort_order: 4, active: true },
  { kind: 'worker_document', key: 'id_card', label_sk: 'Občiansky preukaz',
    label_de: 'Personalausweis', sort_order: 1, active: true },
  { kind: 'cost_category', key: 'soka', label_sk: 'SOKA-BAU', sort_order: 5, active: true },
];

const E = require('./enums');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

console.log('Číselníky');

(async () => {
  // ── Bez načítania musí formulár mať čo ponúknuť ───────────────────────────
  {
    ok(E.list('unit').length > 0, 'jednotky fungujú aj pred načítaním');
    eq(E.label('unit', 'h'), 'hodina', 'záloha pozná hodinu');
    eq(E.list('nieco_neznama'), [], 'neznámy číselník je prázdny, nie chyba');
  }

  // ── Po načítaní ───────────────────────────────────────────────────────────
  {
    await E.load();
    eq(E.list('unit').map(r => r.key), ['h', 'ks'], 'jednotky z databázy');
    eq(E.label('unit', 'ks'), 'kus', 'slovenský názov');
    eq(E.labelDe('unit', 'ks'), 'Stück', 'nemecký názov pre partnera');

    // Poradie určuje sort_order, nie poradie riadkov z dotazu.
    eq(E.list('worker_document').map(r => r.key), ['id_card', 'a1'],
      'doklady sú v zadanom poradí, nie v poradí z dotazu');

    eq(E.hint('worker_document', 'a1'), 'Vystavuje Sociálna poisťovňa, trvá až 45 dní.',
      'nápoveda sa prenesie');
    eq(E.hint('worker_document', 'id_card'), '', 'chýbajúca nápoveda je prázdny reťazec');
  }

  // ── Neznáme a prázdne hodnoty ─────────────────────────────────────────────
  {
    // Kľúč, ktorý v číselníku nie je, sa musí zobraziť ako je — inak by
    // v zozname zostalo prázdne miesto a nikto by nevedel, že tam niečo je.
    eq(E.label('unit', 'furt'), 'furt', 'neznámy kľúč vráti sám seba');
    eq(E.label('unit', null), '', 'null nemá názov');
    eq(E.label('unit', ''), '', 'prázdna hodnota nemá názov');
    eq(E.get('unit', 'furt'), null, 'neznámy kľúč nemá riadok');
    eq(E.labelDe('cost_category', 'soka'), 'SOKA-BAU', 'bez nemeckého názvu padne na slovenský');
  }

  // ── Voľby do formulára ────────────────────────────────────────────────────
  {
    eq(E.options('unit'), [['h', 'hodina'], ['ks', 'kus']], 'dvojice pre select');
    eq(E.options('unit', { empty: '— vyber —' })[0], ['', '— vyber —'],
      'prázdna voľba je prvá, keď sa vyžiada');
    eq(E.options('unit', { empty: '— vyber —' }).length, 3, 'prázdna voľba sa pripočíta');
  }

  // ── Výpadok siete nesmie vyprázdniť formuláre ─────────────────────────────
  {
    respond = () => ({ data: null, error: { message: 'network' } });
    await E.load({ force: true });
    ok(E.list('unit').length > 0, 'pri chybe zostane čím naplniť select');
    eq(E.label('unit', 'h'), 'hodina', 'pri chybe platí posledná známa hodnota');

    respond = () => { throw new Error('spadlo'); };
    await E.load({ force: true });
    ok(E.list('unit').length > 0, 'výnimka z dotazu appku nezhodí');
  }

  // ── Opakované načítanie ───────────────────────────────────────────────────
  {
    let calls = 0;
    respond = () => { calls++; return { data: ROWS, error: null }; };
    await E.load({ force: true });
    const after = calls;
    await E.load();
    await E.load();
    eq(calls, after, 'druhé volanie load() už do databázy nejde');
  }

  console.log(`\n${passed} prešlo, ${failed} padlo`);
  process.exit(failed ? 1 : 0);
})();
