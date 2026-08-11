// ============================================================================
// Testy pre calculateOngoingService (§6.4, §12)
// Spustenie:  node danubra/lib/billing/ongoing-service.test.js
// Bez frameworku — vlastný mini-harness, nulové dependencies.
// ============================================================================

const { calculateOngoingService, monthlyBillingPeriod } = require('./ongoing-service');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    expected: ${e}\n    actual:   ${a}`); }
}

console.log('calculateOngoingService (§6.4)');

// ── 1. Základ: celý mesiac, 3 osoby, 1.5 €/deň ──────────────────────────────
// pobyt 1.3.–31.3. (31 dní), 3 osoby, 1.5 → 31*3*1.5 = 139.5
{
  const order = { date_from: '2026-03-01', date_to: '2026-03-31' };
  const segs = [{ period_from: '2026-03-01', period_to: null, persons: 3, rate: 1.5, paused: false }];
  const r = calculateOngoingService(order, segs, '2026-03-01', '2026-03-31', '2026-04-15');
  eq(r.total, 139.5, 'celý mesiac 31 dní × 3 os × 1.5 = 139.5');
  eq(r.breakdown[0].days, 31, 'počet dní vrátane oboch krajných = 31');
}

// ── 2. Zmena počtu osôb v polovici mesiaca ──────────────────────────────────
// 1.-15.3. 3 osoby, 16.-31.3. 5 osôb, rate 1.5
// segment A: 1.-15. = 15 dní × 3 × 1.5 = 67.5
// segment B: 16.-31. = 16 dní × 5 × 1.5 = 120
// spolu 187.5
{
  const order = { date_from: '2026-03-01', date_to: '2026-03-31' };
  const segs = [
    { period_from: '2026-03-01', period_to: '2026-03-15', persons: 3, rate: 1.5, paused: false },
    { period_from: '2026-03-16', period_to: null,          persons: 5, rate: 1.5, paused: false },
  ];
  const r = calculateOngoingService(order, segs, '2026-03-01', '2026-03-31', '2026-04-15');
  eq(r.total, 187.5, 'zmena osôb v polovici mesiaca = 67.5 + 120 = 187.5');
  eq(r.breakdown.length, 2, 'dva segmenty v breakdown');
}

// ── 3. Pozastavenie (paused segment sa preskočí) ────────────────────────────
// 1.-10. aktívny 2 os, 11.-20. pozastavený, 21.-31. aktívny 2 os
// A: 10 dní × 2 × 1.5 = 30 ; C: 11 dní × 2 × 1.5 = 33 ; B skip → 63
{
  const order = { date_from: '2026-03-01', date_to: '2026-03-31' };
  const segs = [
    { period_from: '2026-03-01', period_to: '2026-03-10', persons: 2, rate: 1.5, paused: false },
    { period_from: '2026-03-11', period_to: '2026-03-20', persons: 2, rate: 1.5, paused: true, pause_reason: 'odchod na dovolenku' },
    { period_from: '2026-03-21', period_to: null,          persons: 2, rate: 1.5, paused: false },
  ];
  const r = calculateOngoingService(order, segs, '2026-03-01', '2026-03-31', '2026-04-15');
  eq(r.total, 63, 'pozastavený segment sa nefakturuje = 30 + 33 = 63');
  eq(r.breakdown.length, 2, 'len 2 nepozastavené segmenty');
}

// ── 4. Neúplný PRVÝ mesiac (nástup 20.3.) ───────────────────────────────────
// pobyt od 20.3., fakturačné obdobie marec → 20.-31. = 12 dní × 4 × 1.5 = 72
{
  const order = { date_from: '2026-03-20', date_to: '2026-06-30' };
  const segs = [{ period_from: '2026-03-20', period_to: null, persons: 4, rate: 1.5, paused: false }];
  const r = calculateOngoingService(order, segs, '2026-03-01', '2026-03-31', '2026-07-01');
  eq(r.total, 72, 'neúplný prvý mesiac 20.-31.3. = 12 dní × 4 × 1.5 = 72');
  eq(r.breakdown[0].from, '2026-03-20', 'effFrom orezaný na order.date_from');
}

// ── 5. Neúplný POSLEDNÝ mesiac (koniec 10.6.) ───────────────────────────────
// fakturačné obdobie jún, order.date_to = 10.6. → 1.-10. = 10 dní × 4 × 1.5 = 60
{
  const order = { date_from: '2026-03-20', date_to: '2026-06-10' };
  const segs = [{ period_from: '2026-03-20', period_to: null, persons: 4, rate: 1.5, paused: false }];
  const r = calculateOngoingService(order, segs, '2026-06-01', '2026-06-30', '2026-07-01');
  eq(r.total, 60, 'neúplný posledný mesiac 1.-10.6. = 10 dní × 4 × 1.5 = 60');
  eq(r.breakdown[0].to, '2026-06-10', 'effTo orezaný na order.date_to');
}

// ── 6. Dnešok oreže budúcnosť (nefakturuj dopredu) ──────────────────────────
// obdobie marec, ale dnes je 15.3. → fakturuj len 1.-15. = 15 dní × 2 × 1.5 = 45
{
  const order = { date_from: '2026-03-01', date_to: '2026-05-31' };
  const segs = [{ period_from: '2026-03-01', period_to: null, persons: 2, rate: 1.5, paused: false }];
  const r = calculateOngoingService(order, segs, '2026-03-01', '2026-03-31', '2026-03-15');
  eq(r.total, 45, 'dnešok 15.3. oreže → len 15 dní × 2 × 1.5 = 45');
  eq(r.breakdown[0].to, '2026-03-15', 'effTo orezaný na dnešok');
}

// ── 7. Predĺženie: order.date_to sa posunul, otvorený segment pokračuje ──────
// pôvodne do 31.3., predĺžené do 30.4. Fakturačné obdobie apríl → 1.-30. = 30 dní × 3 × 1.5 = 135
{
  const order = { date_from: '2026-03-01', date_to: '2026-04-30' }; // po predĺžení
  const segs = [{ period_from: '2026-03-01', period_to: null, persons: 3, rate: 1.5, paused: false }];
  const r = calculateOngoingService(order, segs, '2026-04-01', '2026-04-30', '2026-05-15');
  eq(r.total, 135, 'predĺženie: apríl 30 dní × 3 × 1.5 = 135');
}

// ── 8. Segment mimo fakturačného obdobia = 0 ────────────────────────────────
{
  const order = { date_from: '2026-01-01', date_to: '2026-12-31' };
  const segs = [{ period_from: '2026-01-01', period_to: '2026-01-31', persons: 2, rate: 1.5, paused: false }];
  const r = calculateOngoingService(order, segs, '2026-06-01', '2026-06-30', '2026-07-01');
  eq(r.total, 0, 'segment mimo obdobia = 0');
  eq(r.breakdown.length, 0, 'prázdny breakdown');
}

// ── 9. Zmena sadzby v polovici (rate 1.5 → 2.0) ─────────────────────────────
// 1.-15. 2 os × 1.5 = 15 dní × 3 = 45 ; 16.-31. 2 os × 2.0 = 16 dní × 4 = 64 → 109
{
  const order = { date_from: '2026-03-01', date_to: '2026-03-31' };
  const segs = [
    { period_from: '2026-03-01', period_to: '2026-03-15', persons: 2, rate: 1.5, paused: false },
    { period_from: '2026-03-16', period_to: null,          persons: 2, rate: 2.0, paused: false },
  ];
  const r = calculateOngoingService(order, segs, '2026-03-01', '2026-03-31', '2026-04-15');
  eq(r.total, 109, 'zmena sadzby: 45 + 64 = 109');
}

// ── 10. monthlyBillingPeriod: bežný mesiac + orezanie na date_to ─────────────
{
  eq(monthlyBillingPeriod(2026, 3, { date_to: '2026-12-31' }),
     { periodFrom: '2026-03-01', periodTo: '2026-03-31' }, 'marec plný = 1.-31.3.');
  eq(monthlyBillingPeriod(2026, 6, { date_to: '2026-06-10' }),
     { periodFrom: '2026-06-01', periodTo: '2026-06-10' }, 'jún orezaný na date_to 10.6.');
  eq(monthlyBillingPeriod(2026, 2, { date_to: '2026-12-31' }),
     { periodFrom: '2026-02-01', periodTo: '2026-02-28' }, 'február 2026 = 28 dní');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
