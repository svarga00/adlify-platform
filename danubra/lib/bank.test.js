// ============================================================================
// Testy importu výpisu a cash-flow
// Spustenie:  node danubra/lib/bank.test.js
// ============================================================================
global.window = global;
const M = require('./money.js');
const B = require('./bank');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

console.log('Banka a cash-flow');

// ── Oddeľovač a rozpad riadku ───────────────────────────────────────────────
{
  eq(B.detectDelimiter('a;b;c'), ';', 'bodkočiarka');
  eq(B.detectDelimiter('a,b,c'), ',', 'čiarka');
  eq(B.detectDelimiter('a\tb\tc'), '\t', 'tabulátor');
  // Oddeľovač vnútri úvodzoviek sa nepočíta — inak by „Novák, Ján" rozhodol zle.
  eq(B.detectDelimiter('"Novák, Ján";"1,00";x'), ';',
    'čiarka v úvodzovkách oddeľovač nerozhodne');
  eq(B.detectDelimiter('bez oddelovaca'), ';', 'bez oddeľovača sa predpokladá bodkočiarka');

  eq(B.splitLine('a;b;c', ';'), ['a', 'b', 'c'], 'jednoduchý riadok');
  eq(B.splitLine('"Novák; Ján";100', ';'), ['Novák; Ján', '100'],
    'oddeľovač v úvodzovkách sa neberie');
  eq(B.splitLine('"a""b";c', ';'), ['a"b', 'c'], 'zdvojené úvodzovky');
  eq(B.splitLine(' a ; b ', ';'), ['a', 'b'], 'medzery navyše sa orežú');
}

// ── Dátumy a sumy ───────────────────────────────────────────────────────────
{
  eq(B.parseDate('2026-09-17'), '2026-09-17', 'ISO');
  eq(B.parseDate('17.09.2026'), '2026-09-17', 'slovenský zápis');
  eq(B.parseDate('1.9.2026'), '2026-09-01', 'bez núl navyše');
  eq(B.parseDate('17/09/2026'), '2026-09-17', 'lomky');
  eq(B.parseDate('2026-09-17 12:30'), '2026-09-17', 's časom');
  eq(B.parseDate('nezmysel'), null, 'nečitateľný dátum');
  eq(B.parseDate(''), null, 'prázdny dátum');

  eq(B.parseAmount('1 234,56'), 123456, 'slovenský zápis');
  eq(B.parseAmount('-1.234,56'), -123456, 'záporná s bodkou v tisícoch');
  eq(B.parseAmount('1234.56'), 123456, 'anglický zápis');
  eq(B.parseAmount('1 234,56 EUR'), 123456, 'so skratkou meny');
  eq(B.parseAmount('-2 600,00'), -260000, 'výdaj má znamienko');
  eq(B.parseAmount('nezmysel'), null, 'nečitateľná suma je null, nie nula');
  eq(B.parseAmount(''), null, 'prázdna suma');

  eq(B.cleanIban('SK31 1200 0000 1987 4263 7541'), 'SK3112000000198742637541',
    'IBAN bez medzier a veľkými');
  eq(B.cleanIban(''), null, 'prázdny IBAN');
}

// ── Rozpoznanie stĺpcov ─────────────────────────────────────────────────────
{
  const m = B.mapColumns(['Dátum zaúčtovania', 'Suma', 'Mena', 'Názov protiúčtu',
    'IBAN protiúčtu', 'VS', 'KS', 'Správa pre príjemcu']);
  eq(m.booked_at, 0, 'dátum');
  eq(m.amount, 1, 'suma');
  eq(m.counterparty_name, 3, 'protistrana');
  eq(m.counterparty_iban, 4, 'IBAN');
  eq(m.variable_symbol, 5, 'variabilný symbol');
  eq(m.message, 7, 'správa');

  // Iná banka, iné názvy — hľadá sa význam, nie poradie.
  const m2 = B.mapColumns(['Amount', 'Date', 'IBAN', 'Popis']);
  eq(m2.amount, 0, 'anglický názov sumy');
  eq(m2.booked_at, 1, 'anglický názov dátumu');
  eq(m2.message, 3, 'popis ako správa');

  // Nemecký výpis
  const m3 = B.mapColumns(['Buchungstag', 'Betrag', 'Verwendungszweck']);
  eq(m3.booked_at, 0, 'nemecký dátum');
  eq(m3.amount, 1, 'nemecká suma');
  eq(m3.message, 2, 'nemecký účel platby');

  eq(B.mapColumns(['nic', 'ine']).amount, undefined, 'čo sa nenájde, chýba');
}

// ── Import celého výpisu ────────────────────────────────────────────────────
{
  const csv = `﻿Dátum zaúčtovania;Suma;Mena;Názov protiúčtu;IBAN protiúčtu;VS;Správa pre príjemcu
05.10.2026;3 400,00;EUR;Bauer Bau GmbH;DE89370400440532013000;2026001;Rechnung 2026001
06.10.2026;-2 600,00;EUR;Ján Novák;SK31 1200 0000 1987 4263 7541;;faktura 5
07.10.2026;nezmysel;EUR;Chyba;;;
08.10.2026;0,00;EUR;Nulovy pohyb;;;
09.10.2026;-145,50;EUR;Ubytovanie s.r.o.;SK9911000000002612345678;99;najom september`;

  const r = B.parseCsv(csv);
  eq(r.delimiter, ';', 'oddeľovač rozpoznaný');
  eq(r.rows.length, 3, 'tri použiteľné pohyby');
  eq(r.skipped.length, 2, 'dva riadky sa nedali prečítať');
  eq(r.skipped.map(s => s.why), ['nečitateľná suma', 'nulová suma'],
    'a povie sa prečo — nezahodia sa ticho');

  eq(r.rows[0].booked_at, '2026-10-05', 'dátum prevedený');
  eq(M.format(r.rows[0].amount), '3 400,00 €', 'príjem kladný');
  eq(r.rows[0].variable_symbol, '2026001', 'variabilný symbol');
  eq(M.format(r.rows[1].amount), '−2 600,00 €', 'výdaj záporný');
  eq(r.rows[1].counterparty_iban, 'SK3112000000198742637541', 'IBAN vyčistený');
  eq(r.rows[1].variable_symbol, null, 'prázdny symbol je null');
  ok(r.rows.every(x => x.import_hash), 'každý pohyb má odtlačok');

  // BOM na začiatku nesmie rozbiť prvý stĺpec.
  ok(r.columns.booked_at === 0, 'BOM neprekáža rozpoznaniu prvého stĺpca');

  const s = B.summary(r.rows);
  eq(s.count, 3, 'počet');
  eq(M.format(s.income), '3 400,00 €', 'príjmy');
  eq(M.format(s.expense), '−2 745,50 €', 'výdaje');
  eq(M.format(s.net), '654,50 €', 'rozdiel');
  eq(s.from, '2026-10-05', 'od');
  eq(s.to, '2026-10-09', 'do');
}

// ── Nepoužiteľný súbor ──────────────────────────────────────────────────────
{
  const bad = B.parseCsv('Zostatok;Mena\n1000;EUR');
  ok(bad.error, 'výpis bez sumy a dátumu skončí chybou');
  ok(bad.error.includes('zostatkov'), 'a poradí, čo to asi je');
  eq(bad.rows, [], 'a nič sa nenaimportuje');

  eq(B.parseCsv('').rows, [], 'prázdny súbor');
  eq(B.parseCsv(null).rows, [], 'chýbajúci súbor nezhodí');
}

// ── Odtlačok pohybu ─────────────────────────────────────────────────────────
{
  const tx = { booked_at: '2026-10-05', amount: 340000, currency: 'EUR',
    counterparty_iban: 'DE89370400440532013000', counterparty_name: 'Bauer Bau GmbH',
    variable_symbol: '2026001', message: 'Rechnung' };

  eq(B.hashRow(tx), B.hashRow({ ...tx }), 'ten istý pohyb dá ten istý odtlačok');
  ok(B.hashRow(tx) !== B.hashRow({ ...tx, amount: 340001 }),
    'iná suma dá iný odtlačok');
  ok(B.hashRow(tx) !== B.hashRow({ ...tx, booked_at: '2026-10-06' }),
    'iný dátum dá iný odtlačok');
  ok(B.hashRow(tx) !== B.hashRow({ ...tx, variable_symbol: '2026002' }),
    'iný symbol dá iný odtlačok');
  // IBAN s medzerami je ten istý IBAN.
  eq(B.hashRow({ ...tx, counterparty_iban: 'DE89 3704 0044 0532 0130 00' }),
    B.hashRow(tx), 'medzery v IBAN-e odtlačok nemenia');

  // Duplicita v jednom súbore sa zachytí hneď pri importe.
  const dup = B.parseCsv(`Datum;Suma;VS
05.10.2026;100,00;1
05.10.2026;100,00;1
06.10.2026;100,00;1`);
  eq(dup.rows.length, 2, 'rovnaký riadok dvakrát sa naimportuje raz');
  eq(dup.skipped.filter(s => s.why === 'duplicita v súbore').length, 1,
    'a povie sa, že to bola duplicita');
}

// ── Cash-flow výhľad ────────────────────────────────────────────────────────
{
  const TODAY = '2026-10-01';
  const items = [
    // Po splatnosti — mali prísť dávno.
    { direction: 'in', expected_on: '2026-09-15', amount: 2000, label: 'staré' },
    // Tento týždeň
    { direction: 'out', expected_on: '2026-10-03', amount: -5000, label: 'výplaty' },
    // O dva týždne
    { direction: 'in', expected_on: '2026-10-16', amount: 8000, label: 'faktúra' },
    // Mimo výhľadu
    { direction: 'in', expected_on: '2027-06-01', amount: 99999, label: 'ďaleko' },
  ];
  const f = B.forecast({ balance: M.toCents(3000), items, weeks: 4, today: TODAY });

  eq(M.format(f.overdue.in), '2 000,00 €', 'po splatnosti sa počíta zvlášť');
  eq(M.format(f.afterOverdue), '5 000,00 €', 'a započíta sa hneď');
  eq(f.buckets.length, 4, 'štyri týždne');
  eq(M.format(f.buckets[0].balance), '0,00 €', 'po výplatách je nula');
  eq(M.format(f.buckets[2].balance), '8 000,00 €', 'faktúra to dvihne');
  eq(M.format(f.endBalance), '8 000,00 €', 'konečný zostatok');
  eq(f.negativeFrom, null, 'do mínusu to nespadne');
  // Pohyb mimo výhľadu sa nezapočíta — inak by budúcnosť vyzerala ružovo.
  ok(!f.buckets.some(b => b.items.some(i => i.label === 'ďaleko')),
    'čo je mimo výhľadu, sa nezapočíta');

  // Prípad, kvôli ktorému to celé je: nebude na výplaty.
  const tight = B.forecast({
    balance: M.toCents(1000), weeks: 4, today: TODAY,
    items: [{ expected_on: '2026-10-03', amount: -5000, label: 'výplaty' }],
  });
  ok(tight.negativeFrom, 'chýbajúce peniaze sa ukážu');
  eq(M.format(tight.lowest.balance), '−4 000,00 €', 'aj ako hlboko');
  eq(tight.lowest.week, 1, 'a v ktorom týždni');

  eq(B.forecast({}).buckets.length, 8, 'predvolene osem týždňov');
  eq(B.forecast({ items: [null] }).endBalance, 0, 'prázdny riadok nezhodí');
}

// ── Smie sa škálovať? ───────────────────────────────────────────────────────
{
  const TODAY = '2026-10-01';
  const healthy = B.forecast({
    balance: M.toCents(20000), weeks: 4, today: TODAY,
    items: [{ expected_on: '2026-10-10', amount: 5000 }],
  });
  eq(B.scaleCheck(healthy, {}).ok, true, 'so zdravým výhľadom sa škálovať dá');
  eq(B.scaleCheck(healthy, {}).warnings, [], 'bez upozornení');

  // Mínus je blokátor — výplaty sa odložiť nedajú.
  const negative = B.forecast({
    balance: M.toCents(1000), weeks: 4, today: TODAY,
    items: [{ expected_on: '2026-10-03', amount: -5000 }],
  });
  const neg = B.scaleCheck(negative, {});
  eq(neg.ok, false, 'pri mínuse sa ďalší ľudia neberú');
  eq(neg.reasons.map(r => r.rule), ['cash_negative'], 'a povie sa prečo');
  ok(neg.reasons[0].detail.includes('výplaty'), 'aj čo je v stávke');

  // Tenká rezerva je upozornenie, nie zákaz.
  const thin = B.forecast({
    balance: M.toCents(3000), weeks: 4, today: TODAY, items: [],
  });
  const t = B.scaleCheck(thin, { cash_buffer_min: 5000 });
  eq(t.ok, true, 'tenká rezerva neblokuje');
  eq(t.warnings.map(w => w.rule), ['cash_thin'], 'ale upozorní');
  ok(t.warnings[0].detail.includes('neskoro'), 'a povie, čo sa môže stať');

  // Prah sa dá prepísať z nastavení.
  eq(B.scaleCheck(thin, { cash_buffer_min: 1000 }).warnings.length, 0,
    'nižší prah upozornenie zruší');

  // Peniaze po splatnosti robia výhľad optimistickejším, než je.
  const withOverdue = B.forecast({
    balance: M.toCents(20000), weeks: 4, today: TODAY,
    items: [{ expected_on: '2026-08-01', amount: 4000 }],
  });
  ok(B.scaleCheck(withOverdue, {}).warnings.some(w => w.rule === 'cash_overdue'),
    'po splatnosti sa pripomenie');
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
