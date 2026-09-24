// ============================================================================
// Testy peňazí v centoch
// Spustenie:  node danubra/lib/money.test.js
// ============================================================================
global.window = global;
const M = require('./money');

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

console.log('Peniaze v centoch');

// ── Vstup ───────────────────────────────────────────────────────────────────
{
  eq(M.toCents('1234.56'), 123456, 'anglický zápis');
  eq(M.toCents('1234,56'), 123456, 'slovenská desatinná čiarka');
  eq(M.toCents('1 234,56'), 123456, 'medzera v tisícoch');
  eq(M.toCents('1 234,56'), 123456, 'nezlomiteľná medzera v tisícoch');
  eq(M.toCents('1.234,56'), 123456, 'bodka ako oddelovač tisícov');
  eq(M.toCents('1,234.56'), 123456, 'čiarka ako oddelovač tisícov');
  eq(M.toCents('28,00 €'), 2800, 'suma so symbolom eura');
  eq(M.toCents('28 EUR'), 2800, 'suma so skratkou EUR');
  eq(M.toCents('-15,50'), -1550, 'negatívna suma');
  eq(M.toCents(''), 0, 'prázdna hodnota je nula');
  eq(M.toCents(null), 0, 'null je nula');
  eq(M.toCents(28), 2800, 'číslo');
  eq(M.toCents(28.5), 2850, 'desatinné číslo');
  eq(M.toCents('0,005'), 1, 'pol centa sa zaokrúhli nahor');
  eq(M.toCents('-0,005'), -1, 'pol centa dolu sa zaokrúhli od nuly');
  eq(M.toCents(',5'), 50, 'zápis bez celej časti');

  // Preklep nesmie tichúčko prejsť ako nula — inak vznikne faktúra na 0 €.
  throws(() => M.toCents('dvadsaťosem'), 'text nie je suma');
  throws(() => M.toCents('12,3,4'), 'dve desatinné čiarky sú chyba');
  throws(() => M.toCents(NaN), 'NaN je chyba');
  throws(() => M.toCents(Infinity), 'nekonečno je chyba');
}

// ── Výstup ──────────────────────────────────────────────────────────────────
{
  eq(M.toNumeric(123456), '1234.56', 'do databázy ide reťazec, nie float');
  eq(M.toNumeric(5), '0.05', 'pár centov');
  eq(M.toNumeric(0), '0.00', 'nula má dve desatinné miesta');
  eq(M.toNumeric(-1550), '-15.50', 'negatívna suma do databázy');
  eq(M.toNumeric(100), '1.00', 'celé euro');

  eq(M.format(123456), '1 234,56 €', 'slovenský formát');
  eq(M.format(100000000), '1 000 000,00 €', 'milión má dve medzery');
  eq(M.format(-131040), '−1 310,40 €', 'mínus je typografické, nie spojovník');
  eq(M.format(2800, { currency: '' }), '28,00', 'bez meny');
  eq(M.format(2800, { sign: true }), '+28,00 €', 'plus na požiadanie');
  eq(M.format(0, { sign: true }), '0,00 €', 'nula nemá znamienko');
  eq(M.fromCents(123456), 1234.56, 'na eurá ako číslo');

  // Celá cesta formulár → databáza → zobrazenie musí vrátiť to isté.
  for (const s of ['0', '0,01', '28,00', '1 234,56', '-99,99', '8 736,00']) {
    const c = M.toCents(s);
    eq(M.toCents(M.toNumeric(c)), c, `kolobeh nezmení ${s}`);
  }

  throws(() => M.format(12.5), 'formát odmietne necelé centy');
  throws(() => M.toNumeric('123'), 'do databázy nesmie ísť reťazec');
}

// ── Sčítanie a odčítanie ────────────────────────────────────────────────────
{
  // Toto je celý dôvod, prečo tento modul existuje.
  eq(0.1 + 0.2 === 0.3, false, 'float 0,1 + 0,2 sa nerovná 0,3 (preto centy)');
  eq(M.add(10, 20), 30, '0,10 + 0,20 = 0,30 presne');
  eq(M.sum([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), 10, 'desať centov je desať centov');
  eq(M.sub(123456, 23456), 100000, 'odčítanie');
  eq(M.sum([]), 0, 'prázdny súčet je nula');
  eq(M.neg(2800), -2800, 'obrátenie znamienka');
  throws(() => M.add(1, 2.5), 'necelé centy sú chyba');
}

// ── Násobenie: hodiny × sadzba ──────────────────────────────────────────────
{
  eq(M.mul(2800, 312), 873600, '312 h × 28,00 € = 8 736,00 €');
  eq(M.mul(2800, 312.5), 875000, 'polhodiny sa počítajú presne');
  eq(M.mul(2800, 0.25), 700, 'štvrťhodina');
  eq(M.mul(1586, 173.25), 274775, 'LG1 15,86 € × 173,25 h (pol centa nahor)');
  eq(M.mul(333, 3), 999, 'tri krát 3,33 €');
  eq(M.mul(100, 0), 0, 'nulové množstvo');
  eq(M.mul(-2800, 10), -28000, 'negatívna sadzba');
  eq(M.mul(1, 0.5), 1, 'pol centa nahor');
  eq(M.mul(-1, 0.5), -1, 'pol centa od nuly aj dolu');

  // Veľká zákazka nesmie prekročiť presnosť čísla — preto BigInt vnútri.
  eq(M.mul(1000000, 100000), 100000000000, 'desaťtisíc eur × sto tisíc jednotiek');
  ok(Number.isSafeInteger(M.mul(999999, 99999)), 'veľký súčin zostane bezpečné celé číslo');
}

// ── Percentá: DPH a zrážka §48b ─────────────────────────────────────────────
{
  // Príklad z docs/v2/03_superfaktura.md, kapitola 6.
  const gross = M.toCents('8736,00');
  const withheld = M.pct(gross, 15);
  eq(M.format(gross), '8 736,00 €', 'fakturovaná suma');
  eq(M.format(withheld), '1 310,40 €', 'zrážka §48b je 15 %');
  eq(M.format(M.sub(gross, withheld)), '7 425,60 €', 'na účet príde zvyšok');
  eq(M.add(M.sub(gross, withheld), withheld), gross, 'zrážka a zbytok dajú presne celok');

  eq(M.pct(10000, 20), 2000, '20 % zo 100 €');
  eq(M.pct(10000, 14.7), 1470, 'SOKA-BAU 14,7 %');
  eq(M.pct(2350, 14.7), 345, 'SOKA-BAU z nekrúhlej sumy');
  eq(M.pct(1, 50), 1, 'polovica centa nahor');
  eq(M.pct(12345, 0), 0, 'nula percent');
  eq(M.addPct(10000, 20), 12000, 'základ + DPH 20 %');
  eq(M.addPct(2999, 20), 3599, 'DPH z 29,99 €');
  eq(M.pct(-10000, 15), -1500, 'percento z negatívnej sumy');
}

// ── Delenie na rovnaké časti ────────────────────────────────────────────────
{
  eq(M.split(1000, 3), [334, 333, 333], '10 € na tretiny — zvyšok hore');
  eq(M.sum(M.split(1000, 3)), 1000, 'tretiny dajú presne 10 €');
  eq(M.split(100, 100), Array(100).fill(1), 'euro na sto centov');
  eq(M.split(1, 3), [1, 0, 0], 'jeden cent na tri časti');
  eq(M.split(-1000, 3), [-334, -333, -333], 'negatívna suma na tretiny');
  eq(M.sum(M.split(-1000, 3)), -1000, 'negatívne tretiny tiež sedia');
  eq(M.split(900, 3), [300, 300, 300], 'delenie bez zvyšku');
  throws(() => M.split(100, 0), 'nula častí je chyba');
  throws(() => M.split(100, -2), 'negatívny počet častí je chyba');

  // Žiadny počet častí nesmie stratiť ani pridať cent.
  let allOk = true;
  for (let total = -50; total <= 50; total++) {
    for (let n = 1; n <= 7; n++) {
      if (M.sum(M.split(total, n)) !== total) allOk = false;
    }
  }
  ok(allOk, 'súčet dielov sa vždy rovná celku (700 kombinácií)');
}

// ── Delenie v pomere: náklad podľa odrobených hodín ─────────────────────────
{
  eq(M.allocate(100000, [1, 1, 1]), [33334, 33333, 33333], '1 000 € na tretiny');
  eq(M.sum(M.allocate(100000, [1, 1, 1])), 100000, 'pomer nestratí cent');
  eq(M.allocate(90000, [160, 120, 80]), [40000, 30000, 20000], 'ubytovanie podľa hodín');
  eq(M.allocate(1000, [3, 1]), [750, 250], 'pomer 3 : 1');
  eq(M.allocate(1000, [0, 0]), [500, 500], 'nulové váhy sa delia rovno');
  eq(M.allocate(100, []), [], 'prázdny zoznam');
  eq(M.allocate(0, [5, 3]), [0, 0], 'nulová suma');
  eq(M.sum(M.allocate(-1000, [3, 1])), -1000, 'negatívny náklad tiež sedí');
  throws(() => M.allocate(100, [1, -1]), 'negatívna váha je chyba');

  // Najväčší zvyšok dostane cent prvý.
  eq(M.allocate(1000, [1, 1, 1, 1, 1, 1, 1]), [143, 143, 143, 143, 143, 143, 142],
    '10 € medzi sedem ľudí');
  let allOk = true;
  for (const total of [1, 7, 99, 1000, 87361, -5000]) {
    for (const w of [[1], [1, 2], [5, 5, 5], [1, 0, 3, 7], [160, 173.25, 12.5]]) {
      if (M.sum(M.allocate(total, w)) !== total) allOk = false;
      if (M.allocate(total, w).length !== w.length) allOk = false;
    }
  }
  ok(allOk, 'pomerové delenie vždy sedí a má správnu dĺžku');
}

// ── Porovnávanie ────────────────────────────────────────────────────────────
{
  eq(M.cmp(100, 200), -1, 'menšie');
  eq(M.cmp(200, 100), 1, 'väčšie');
  eq(M.cmp(100, 100), 0, 'rovné');
  ok(M.isZero(0), 'nula je nula');
  ok(!M.isZero(1), 'cent nie je nula');
  eq(M.max(100, 500, 200), 500, 'najviac');
  eq(M.min(100, 500, 200), 100, 'najmenej');
  eq(M.max(-100, -500), -100, 'najviac z negatívnych');
}

// ── Reálny prípad: mesačná faktúra partie ───────────────────────────────────
{
  // Traja živnostníci, každý fakturuje sám (R5), ubytovanie sa rozpočíta
  // podľa odrobených hodín a nesmie sa stratiť ani cent.
  const rate = M.toCents('26,50');
  const hours = [173.25, 160, 148.5];
  const lines = hours.map(h => M.mul(rate, h));
  eq(lines, [459113, 424000, 393525], 'tri riadky za hodiny');

  const revenue = M.sum(lines);
  eq(M.format(revenue), '12 766,38 €', 'fakturované spolu');

  const housing = M.toCents('1 450,00');
  const perWorker = M.allocate(housing, hours);
  eq(M.sum(perWorker), housing, 'ubytovanie rozpočítané do posledného centu');
  eq(perWorker, [52146, 48158, 44696], 'podiel na ubytovaní podľa hodín');

  const withheld = M.pct(revenue, 15);
  eq(M.format(withheld), '1 914,96 €', 'zrážka §48b z celej faktúry');
  eq(M.format(M.sub(revenue, withheld)), '10 851,42 €', 'na účet');

  const margin = M.sub(M.sub(revenue, M.sum(lines.map(l => M.pct(l, 88)))), housing);
  ok(margin > 0, `marža po nákladoch je pozitívna (${M.format(margin)})`);
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
