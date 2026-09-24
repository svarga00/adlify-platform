// ============================================================================
// Testy platobnej disciplíny odberateľa
// Spustenie:  node danubra/lib/partners/payment.test.js
// ============================================================================
global.window = global;
const M = require('../money.js');
const P = require('./payment');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

const TODAY = '2026-09-17';
const inv = (total, status, issue, due, paid) =>
  ({ total, status, issue_date: issue, due_date: due, paid_at: paid });

console.log('Platobná disciplína');

// ── Súhrn ───────────────────────────────────────────────────────────────────
{
  const rows = [
    inv(1000, 'paid', '2026-05-01', '2026-05-31', '2026-05-20'),   // 19 dní, načas
    inv(2000, 'paid', '2026-06-01', '2026-07-01', '2026-06-25'),   // 24 dní, načas
    inv(1500, 'paid', '2026-07-01', '2026-07-31', '2026-08-20'),   // 50 dní, meškal
    inv(3000, 'sent', '2026-08-01', '2026-08-31', null),           // po splatnosti
    inv(500, 'sent', '2026-09-10', '2026-10-10', null),            // ešte beží
  ];
  const d = P.discipline(rows, { today: TODAY });

  eq(d.total, 5, 'päť faktúr');
  eq(d.paid, 3, 'tri uhradené');
  eq(d.open, 2, 'dve otvorené');
  eq(d.overdue, 1, 'jedna po splatnosti');

  eq(M.format(d.turnover), '8 000,00 €', 'obrat spolu');
  eq(M.format(d.outstanding), '3 500,00 €', 'neuhradené');
  eq(M.format(d.overdueAmount), '3 000,00 €', 'z toho po splatnosti');

  eq(d.avgDaysToPay, 31, 'priemer (19 + 24 + 50) / 3');
  eq(d.onTimePct, 67, 'dve z troch úhrad prišli do splatnosti');
  eq(d.oldestOverdueDays, 17, 'najdlhšie visiaca faktúra');
}

// ── Okrajové prípady ────────────────────────────────────────────────────────
{
  const empty = P.discipline([], { today: TODAY });
  eq(empty.total, 0, 'žiadne faktúry');
  eq(empty.outstanding, 0, 'nula neuhradených');
  eq(empty.avgDaysToPay, null, 'bez úhrad sa priemer nepočíta');
  eq(empty.onTimePct, null, 'ani podiel načas');
  eq(empty.oldestOverdueDays, null, 'ani najstaršia po splatnosti');
  eq(P.discipline(null, { today: TODAY }).total, 0, 'chýbajúci zoznam nezhodí');
  eq(P.discipline([null, inv(100, 'paid', '2026-01-01', '2026-02-01', '2026-01-15')],
    { today: TODAY }).total, 1, 'prázdny riadok sa preskočí');

  // Uhradená faktúra bez dátumu úhrady sa nedá zmerať — nesmie ale zmiznúť
  // z počtu uhradených, inak by sa obrat nezhodoval.
  const partial = P.discipline([
    inv(1000, 'paid', '2026-01-01', '2026-02-01', null),
    inv(1000, 'paid', '2026-01-01', '2026-02-01', '2026-01-20'),
  ], { today: TODAY });
  eq(partial.paid, 2, 'obe sa počítajú ako uhradené');
  eq(partial.avgDaysToPay, 19, 'ale priemer len z tej, ktorá sa dá zmerať');
  eq(partial.onTimePct, 100, 'a podiel načas tiež');

  // Faktúra bez splatnosti nemôže byť po splatnosti.
  eq(P.discipline([inv(1000, 'sent', '2026-01-01', null, null)], { today: TODAY }).overdue, 0,
    'bez splatnosti sa nemešká');

  // Deň splatnosti ešte nie je meškanie.
  eq(P.discipline([inv(1, 'sent', '2026-08-01', TODAY, null)], { today: TODAY }).overdue, 0,
    'v deň splatnosti sa ešte nemešká');
  eq(P.discipline([inv(1, 'sent', '2026-08-01', '2026-09-16', null)], { today: TODAY }).overdue, 1,
    'deň po splatnosti už áno');
  eq(P.discipline([inv(1, 'paid', '2026-08-01', '2026-09-01', '2026-09-01')],
    { today: TODAY }).onTimePct, 100, 'úhrada v deň splatnosti je načas');

  // Desatinné sumy sa nesmú stratiť v centoch.
  eq(M.format(P.discipline([inv(1234.56, 'sent', '2026-01-01', '2026-12-01', null)],
    { today: TODAY }).outstanding), '1 234,56 €', 'centy sedia');
  eq(M.format(P.discipline([
    inv(0.1, 'sent', '2026-01-01', '2026-12-01', null),
    inv(0.2, 'sent', '2026-01-01', '2026-12-01', null),
  ], { today: TODAY }).outstanding), '0,30 €', 'desatiny sa sčítajú presne');
}

// ── Návrh hodnotenia ────────────────────────────────────────────────────────
{
  const rate = (rows, terms = 30) =>
    P.suggestRating(P.discipline(rows, { today: TODAY }), { termsDays: terms });

  // Bez uhradenej faktúry sa o disciplíne nedá povedať nič. Nula uhradených
  // nie je zlé hodnotenie — je to žiadne hodnotenie.
  const nothing = rate([]);
  eq(nothing.rating, null, 'bez úhrad sa nehodnotí');
  eq(nothing.confident, false, 'a nie je to istá informácia');
  ok(nothing.reason.includes('skoro'), 'a povie sa prečo');

  const nothingButOverdue = rate([inv(1000, 'sent', '2026-01-01', '2026-02-01', null)]);
  eq(nothingButOverdue.rating, null, 'ani keď niečo visí');
  ok(nothingButOverdue.reason.includes('po splatnosti'), 'ale je to vidieť v dôvode');

  // A — platí načas
  const good = rate([
    inv(1000, 'paid', '2026-05-01', '2026-05-31', '2026-05-20'),
    inv(1000, 'paid', '2026-06-01', '2026-07-01', '2026-06-20'),
    inv(1000, 'paid', '2026-07-01', '2026-07-31', '2026-07-20'),
  ]);
  eq(good.rating, 'a', 'spoľahlivý platca');
  eq(good.confident, true, 'tri úhrady už niečo hovoria');
  ok(good.reason.includes('19'), 'dôvod obsahuje priemer');

  // Jedna úhrada — hodnotenie áno, istota nie.
  const one = rate([inv(1000, 'paid', '2026-05-01', '2026-05-31', '2026-05-20')]);
  eq(one.rating, 'a', 'aj z jednej úhrady sa dá niečo povedať');
  eq(one.confident, false, 'ale nie s istotou');

  // B — mešká, ale nie dlho
  const ok_ = rate([
    inv(1000, 'paid', '2026-05-01', '2026-05-31', '2026-05-20'),
    inv(1000, 'paid', '2026-06-01', '2026-07-01', '2026-06-20'),
    inv(1000, 'sent', '2026-08-20', '2026-09-10', null),   // 7 dní po splatnosti
  ]);
  eq(ok_.rating, 'b', 'krátke meškanie je béčko');
  ok(ok_.reason.includes('po splatnosti'), 'a vie sa prečo');

  // C — platí vždy až po splatnosti, aj keď nič práve nevisí
  const alwaysLate = rate([
    inv(1000, 'paid', '2026-05-01', '2026-05-31', '2026-06-15'),
    inv(1000, 'paid', '2026-06-01', '2026-07-01', '2026-07-16'),
    inv(1000, 'paid', '2026-07-01', '2026-07-31', '2026-08-15'),
  ]);
  eq(alwaysLate.rating, 'c', 'kto platí vždy po splatnosti, nie je béčko');

  // B — dodrží splatnosť na faktúre, ale tá je oveľa ďalej než dohodnutá.
  // Toto je prípad, ktorý by sa inak stratil: odberateľ vyzerá spoľahlivo,
  // lebo platí „načas", len si na každú faktúru vypýtal dvojnásobnú lehotu.
  const longTerms = rate([
    inv(1000, 'paid', '2026-05-01', '2026-07-01', '2026-06-20'),
    inv(1000, 'paid', '2026-06-01', '2026-08-01', '2026-07-21'),
    inv(1000, 'paid', '2026-07-01', '2026-08-31', '2026-08-20'),
  ], 30);
  eq(longTerms.rating, 'b', 'dlhé lehoty na faktúrach nie sú áčko');
  ok(longTerms.reason.includes('priemerne'), 'dôvod hovorí o priemere');

  // C — dlhé meškanie
  const bad = rate([
    inv(1000, 'paid', '2026-01-01', '2026-01-31', '2026-01-20'),
    inv(5000, 'sent', '2026-06-01', '2026-07-01', null),   // 78 dní
  ]);
  eq(bad.rating, 'c', 'faktúra po splatnosti vyše mesiaca je céčko');
  ok(bad.reason.includes('78'), 'a povie sa koľko dní');

  // C — väčšina úhrad mimo splatnosti
  const unreliable = rate([
    inv(1000, 'paid', '2026-01-01', '2026-01-31', '2026-03-01'),
    inv(1000, 'paid', '2026-02-01', '2026-02-28', '2026-04-01'),
    inv(1000, 'paid', '2026-03-01', '2026-03-31', '2026-03-20'),
  ]);
  eq(unreliable.rating, 'c', 'tretina úhrad načas je céčko');
  ok(unreliable.reason.includes('%'), 'a povie sa podiel');

  // Dlhšia splatnosť mení, čo je pomalé.
  const terms60 = [
    inv(1000, 'paid', '2026-05-01', '2026-06-30', '2026-06-15'),
    inv(1000, 'paid', '2026-06-01', '2026-07-31', '2026-07-16'),
    inv(1000, 'paid', '2026-07-01', '2026-08-30', '2026-08-15'),
  ];
  eq(rate(terms60, 60).rating, 'a', 'pri 60-dňovej splatnosti je 45 dní v poriadku');
  eq(rate(terms60, 30).rating, 'b', 'pri 30-dňovej to isté už nie');
}

// ── Riadky do prehľadu súm ──────────────────────────────────────────────────
{
  const d = P.discipline([
    inv(1000, 'paid', '2026-05-01', '2026-05-31', '2026-05-20'),
    inv(3000, 'sent', '2026-08-01', '2026-08-31', null),
  ], { today: TODAY });
  const lines = P.sumLines(d);

  // Obrat je informatívny — nesmie sa pripočítať k neuhradenému.
  eq(lines[0].kind, 'info', 'obrat sa do súčtu nepočíta');
  eq(lines[1].label, 'Neuhradené', 'neuhradené je hlavný riadok');
  eq(M.format(lines[1].cents), '3 000,00 €', 'so správnou sumou');
  ok(lines[2].hint.includes('17'), 'a je vidieť, ako dlho to visí');

  const clean = P.sumLines(P.discipline([
    inv(1000, 'paid', '2026-05-01', '2026-05-31', '2026-05-20'),
  ], { today: TODAY }));
  eq(clean.length, 2, 'bez meškania sa riadok o meškaní nekreslí');
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
