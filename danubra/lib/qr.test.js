// ============================================================================
// Testy QR kodéra — proti publikovaným vektorom z ISO/IEC 18004
// Spustenie:  node danubra/lib/qr.test.js
// ============================================================================
global.window = global;
global.TextEncoder = require('util').TextEncoder;
const QR = require('./qr');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    expected: ${e}\n    actual:   ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

console.log('QR kodér');

// ── Reed-Solomon proti známemu vektoru ──────────────────────────────────────
// Klasický príklad: "HELLO WORLD", verzia 1, úroveň Q (13 EC kódových slov).
{
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236];
  const expected = [168, 72, 22, 82, 217, 54, 156, 0, 46, 15, 180, 122, 16];
  eq(QR.rsEncode(data, 13), expected, 'Reed-Solomon zodpovedá vektoru „HELLO WORLD" 1-Q');
}

// ── Generátorový polynóm ────────────────────────────────────────────────────
{
  // stupeň 7 → koeficienty (mocniny α): 0,87,229,146,149,238,102,21 → hodnoty
  const g = QR.rsGenerator(7);
  eq(g.length, 8, 'generátor stupňa 7 má 8 koeficientov');
  eq(g[0], 1, 'vedúci koeficient je 1');
  // stupeň 10 tiež musí mať správnu dĺžku
  eq(QR.rsGenerator(10).length, 11, 'generátor stupňa 10 má 11 koeficientov');
}

// ── Formátové informácie proti tabuľke z normy ──────────────────────────────
{
  const bin = (n) => n.toString(2).padStart(15, '0');
  eq(bin(QR.formatBits('L', 0)), '111011111000100', 'formát L/maska 0');
  eq(bin(QR.formatBits('M', 0)), '101010000010010', 'formát M/maska 0');
  eq(bin(QR.formatBits('Q', 0)), '011010101011111', 'formát Q/maska 0');
  eq(bin(QR.formatBits('H', 0)), '001011010001001', 'formát H/maska 0');
  eq(bin(QR.formatBits('M', 4)), '100010111111001', 'formát M/maska 4');
  eq(bin(QR.formatBits('M', 5)), '100000011001110', 'formát M/maska 5');
}

// ── Informácia o verzii proti tabuľke ───────────────────────────────────────
{
  const bin = (n) => n.toString(2).padStart(18, '0');
  eq(bin(QR.versionBits(7)),  '000111110010010100', 'informácia o verzii 7');
  eq(bin(QR.versionBits(10)), '001010010011010011', 'informácia o verzii 10');
  eq(bin(QR.versionBits(8)),  '001000010110111100', 'informácia o verzii 8');
}

// ── Výber verzie a kapacity ─────────────────────────────────────────────────
{
  eq(QR.dataCapacity(1, 'L'), 19, 'verzia 1-L má 19 dátových slov');
  eq(QR.dataCapacity(1, 'M'), 16, 'verzia 1-M má 16 dátových slov');
  eq(QR.dataCapacity(1, 'Q'), 13, 'verzia 1-Q má 13 dátových slov');
  eq(QR.dataCapacity(1, 'H'), 9,  'verzia 1-H má 9 dátových slov');
  eq(QR.dataCapacity(10, 'M'), 216, 'verzia 10-M má 216 dátových slov (346 − 26×5)');
  eq(QR.pickVersion(10, 'M'), 1, '10 bajtov sa zmestí do verzie 1');
  ok(QR.pickVersion(150, 'M') >= 7, '150 bajtov potrebuje aspoň verziu 7');
}

// ── Štruktúra matice ────────────────────────────────────────────────────────
{
  const { modules: m, size: n, version } = QR.encode('DANUBRA', 'M');
  eq(n, version * 4 + 17, 'rozmer zodpovedá verzii');

  // vyhľadávacie vzory v troch rohoch
  const finderOk = (r0, c0) => {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
      const want = (r === 0 || r === 6 || c === 0 || c === 6) || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      if (m[r0 + r][c0 + c] !== want) return false;
    }
    return true;
  };
  ok(finderOk(0, 0), 'vyhľadávací vzor vľavo hore');
  ok(finderOk(0, n - 7), 'vyhľadávací vzor vpravo hore');
  ok(finderOk(n - 7, 0), 'vyhľadávací vzor vľavo dole');

  // časovacie vzory sa striedajú
  let timingOk = true;
  for (let i = 8; i < n - 8; i++) {
    if (m[6][i] !== (i % 2 === 0)) timingOk = false;
    if (m[i][6] !== (i % 2 === 0)) timingOk = false;
  }
  ok(timingOk, 'časovacie vzory sa správne striedajú');

  // tmavý modul
  ok(m[n - 8][8] === true, 'tmavý modul je nastavený');

  // rozumný pomer tmavých modulov (maska to má držať okolo polovice)
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) dark++;
  const pct = (dark * 100) / (n * n);
  ok(pct > 35 && pct < 65, `pomer tmavých modulov je vyvážený (${pct.toFixed(1)} %)`);
}

// ── SEPA reťazec ────────────────────────────────────────────────────────────
{
  const p = QR.sepaPayload({ name: 'DANUBRA s.r.o.', iban: 'SK31 1200 0000 1987 4263 7541',
    amount: 150, reference: '2026001', note: 'Faktura 2026001' });
  const lines = p.split('\n');
  eq(lines[0], 'BCD', 'servisná značka BCD');
  eq(lines[1], '002', 'verzia 002');
  eq(lines[3], 'SCT', 'typ prevodu SCT');
  eq(lines[6], 'SK3112000000198742637541', 'IBAN je bez medzier');
  eq(lines[7], 'EUR150.00', 'suma vo formáte EUR150.00');
  eq(lines[9], '2026001', 'variabilný symbol ako referencia');
  ok(lines.length >= 12, 'reťazec má predpísaný počet riadkov');
}

// ── SVG výstup ──────────────────────────────────────────────────────────────
{
  const s = QR.svg('test', { px: 100 });
  ok(s.startsWith('<svg'), 'SVG začína značkou svg');
  ok(s.includes('width="100"'), 'rešpektuje zadanú veľkosť');
  ok(s.includes('<path'), 'obsahuje cestu s modulmi');
}

// ── Dlhý reťazec (reálna SEPA platba) prejde ────────────────────────────────
{
  const p = QR.sepaPayload({ name: 'DANUBRA s.r.o.', iban: 'SK3112000000198742637541',
    amount: 1234.56, reference: '2026042', note: 'Faktura 2026042 za priebeznu sluzbu 08/2026' });
  const r = QR.encode(p, 'M');
  ok(r.version >= 5, `dlhý reťazec použije vyššiu verziu (${r.version})`);
  ok(r.modules.length === r.size, 'matica je štvorcová');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
