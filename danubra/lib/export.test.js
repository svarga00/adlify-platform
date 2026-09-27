// ============================================================================
// Testy exportu
// Spustenie:  node danubra/lib/export.test.js
// ============================================================================
// Export je to, čo z appky odchádza k účtovníčke a k odberateľovi. Keď sa
// rozsype diakritika alebo sa celý riadok zlepí do jednej bunky, appka
// vyzerá pokazene — aj keď má čísla správne.
// ============================================================================
global.window = global;
const E = require('./export');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

console.log('Export');

// ── Bunka ───────────────────────────────────────────────────────────────────
{
  eq(E.cell('Ján Novák'), 'Ján Novák', 'bežný text zostáva');
  eq(E.cell(null), '', 'prázdna hodnota je prázdna bunka, nie „null"');
  eq(E.cell(0), '0', 'nula je nula, nie prázdno');
  // Bodkočiarka je oddeľovač, takže obsah s ňou musí ísť do úvodzoviek.
  eq(E.cell('Nitra; Stuttgart'), '"Nitra; Stuttgart"', 'bodkočiarka sa uzavrie');
  eq(E.cell('Povedal "áno"'), '"Povedal ""áno"""', 'úvodzovky sa zdvojujú');
  eq(E.cell('prvý\ndruhý'), '"prvý\ndruhý"', 'zalomenie zostane vnútri bunky');
}

// ── Bunka, ktorá by sa v Exceli vykonala ────────────────────────────────────
// Stará a stále funkčná cesta, ako cez CSV spustiť niečo na cudzom počítači.
// Do našej appky sa taký text dostane napríklad z mena firmy alebo poznámky.
{
  ok(E.cell('=SUM(A1)').startsWith("'"), 'vzorec sa zneškodní apostrofom');
  ok(E.cell('+421 903 111 222').startsWith("'"), 'aj telefón so znamienkom plus');
  ok(E.cell('@meno').startsWith("'"), 'aj zavináč na začiatku');
  ok(E.cell('-2+3+cmd|calc').startsWith("'"), 'aj vzorec, ktorý sa začína mínusom');
  eq(E.cell('Suma 5+3'), 'Suma 5+3', 'ale plus uprostred textu je neškodný');
  // Záporné číslo nie je vzorec. S apostrofom by z výdaja bol text a marža
  // v mínuse by sa v Exceli nedala sčítať.
  eq(E.cell('-500'), '-500', 'záporné číslo zostáva číslom');
  eq(E.cell(E.money(-30000)), '-300,00', 'aj suma v mínuse');
}

// ── Čísla pre slovenský Excel ───────────────────────────────────────────────
{
  eq(E.num(1234.5), '1234,50', 'desatinná čiarka, bez oddeľovača tisícov');
  eq(E.num(0), '0,00', 'nula sa vypíše');
  eq(E.num(null), '', 'nič zostane nič');
  eq(E.num('nezmysel'), '', 'nezmysel nedá NaN');
  eq(E.money(196800), '1968,00', 'centy sa prepočítajú na eurá');
  eq(E.money(-30000), '-300,00', 'aj záporné');
  eq(E.num(8.5, 1), '8,5', 'počet desatín sa dá určiť');
}

// ── Celé CSV ────────────────────────────────────────────────────────────────
{
  const out = E.csv([
    ['Meno', 'Mesto', 'Sadzba'],
    ['Ján Novák', 'Nitra', E.num(18)],
    ['Firma; s.r.o.', 'Stuttgart', E.num(19.5)],
  ]);
  const lines = out.split('\r\n');
  eq(lines[0], 'Meno;Mesto;Sadzba', 'hlavička oddelená bodkočiarkou');
  eq(lines[1], 'Ján Novák;Nitra;18,00', 'riadok s číslom');
  eq(lines[2], '"Firma; s.r.o.";Stuttgart;19,50', 'bodkočiarka v názve nerozbije riadok');
  ok(out.includes('\r\n'), 'riadky sú CRLF — tak to chce Excel');
  eq(E.csv([]), '', 'prázdny export je prázdny reťazec, nie pád');
}

// ── Názov súboru ────────────────────────────────────────────────────────────
{
  eq(E.filename(['prehľad', '2026-09-01_2026-09-30']), 'prehlad-2026-09-01_2026-09-30.csv',
    'bez diakritiky a s obdobím v názve');
  eq(E.filename('Živnostníci'), 'zivnostnici.csv', 'diakritika ide preč');
  eq(E.filename(['a/b', 'c d']), 'a-b-c-d.csv', 'lomky a medzery tiež');
  eq(E.filename([]), 'export.csv', 'bez názvu má rozumný náhradný');
  eq(E.filename('prehľad', 'pdf'), 'prehlad.pdf', 'prípona sa dá určiť');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
