// ============================================================================
// Testy: jednotková ekonomika a compliance pre subdodávky (Fáza 2)
// Spustenie:  node danubra/lib/staffing/staffing.test.js
// ============================================================================
global.window = global;
const M = require('./margin');
const C = require('./compliance');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    expected: ${e}\n    actual:   ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }
function near(actual, expected, tol, msg) {
  if (Math.abs(actual - expected) <= tol) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    expected ≈ ${expected} (±${tol})\n    actual:    ${actual}`); }
}

console.log('Jednotková ekonomika (Fáza 2)');

// ── Modelový príklad z biznis plánu ─────────────────────────────────────────
// 160 h × 38 €/h = 6 080 € tržba; hrubá 2 000 € + odvody 36,2 %;
// diéty 45 € × 21 dní; ubytovanie 350 €; doprava 150 €; SOKA 14,7 %
// Plán očakáva maržu ~1 400–1 600 €.
{
  const a = { charge_rate: 38, gross_monthly: 2000, per_diem_daily: 45,
    accommodation_monthly: 350, transport_monthly: 150 };
  const r = M.assignmentMargin(a, { hours: 160, workDays: 21, workType: 'construction' });
  eq(r.revenue, 6080, 'tržba 160 h × 38 € = 6 080 €');
  eq(r.costs.contributions, 724, 'odvody 36,2 % z 2 000 € = 724 €');
  eq(r.costs.perDiem, 945, 'diéty 21 dní × 45 € = 945 €');
  eq(r.costs.soka, 294, 'SOKA-BAU 14,7 % z hrubej = 294 €');
  eq(r.totalCost, 4463, 'náklady spolu 4 463 €');
  eq(r.margin, 1617, 'marža 1 617 €');
  ok(r.margin >= 1400, 'marža sedí na rozpätie z plánu (1 400–1 600 €)');
}

// ── Dielňa: bez SOKA-BAU je marža vyššia pri rovnakých vstupoch ─────────────
{
  const a = { charge_rate: 38, gross_monthly: 2000, per_diem_daily: 45,
    accommodation_monthly: 350, transport_monthly: 150 };
  const stavba = M.assignmentMargin(a, { hours: 160, workDays: 21, workType: 'construction' });
  const dielna = M.assignmentMargin(a, { hours: 160, workDays: 21, workType: 'workshop' });
  eq(dielna.costs.soka, 0, 'dielňa neplatí SOKA-BAU');
  eq(dielna.margin - stavba.margin, 294, 'dielňa má o 294 € vyššiu maržu (ušetrená SOKA)');
}

// ── Zrážka 15 % bez §48b ────────────────────────────────────────────────────
{
  const a = { charge_rate: 38, gross_monthly: 2000, per_diem_daily: 45 };
  const bez = M.assignmentMargin(a, { hours: 160, workDays: 21, workType: 'construction', freistellungOk: false });
  const s = M.assignmentMargin(a, { hours: 160, workDays: 21, workType: 'construction', freistellungOk: true });
  eq(bez.withholding, 912, 'bez §48b sa zrazí 15 % zo 6 080 € = 912 €');
  eq(s.withholding, 0, 's platnou §48b sa nezráža nič');
  eq(bez.netAfterWithholding, bez.margin - 912, 'zrážka znižuje to, čo reálne pritečie');
}

// ── Dielňa sa nezráža ani bez §48b (netýka sa jej) ──────────────────────────
{
  const r = M.assignmentMargin({ charge_rate: 38, gross_monthly: 2000 },
    { hours: 160, workDays: 21, workType: 'workshop', freistellungOk: false });
  eq(r.withholding, 0, 'dielenské práce nepodliehajú Bauabzugsteuer');
}

// ── Minimálna mzda ──────────────────────────────────────────────────────────
console.log('\nMinimálna mzda');
{
  // 2 000 € / 160 h = 12,50 €/h → pod LG1 (15,86)
  const r = M.minWageCheck({ grossMonthly: 2000, hours: 160, workType: 'construction', skillLevel: 'werker' });
  eq(r.required, 15.86, 'LG1 je 15,86 €/h');
  eq(r.effective, 12.5, 'efektívna hodinová mzda 12,50 €');
  ok(!r.ok, 'mzda pod odvetvovým minimom je zachytená');
  near(r.shortfall, 537.6, 0.1, 'doplatok do minima je vyčíslený');
}
{
  const r = M.minWageCheck({ grossMonthly: 2800, hours: 160, workType: 'construction', skillLevel: 'fachwerker' });
  eq(r.required, 17.34, 'LG2 je 17,34 €/h');
  ok(r.ok, '2 800 € pri 160 h (17,50 €/h) vyhovuje LG2');
}
{
  // v dielni platí len všeobecný Mindestlohn 13,90
  const r = M.minWageCheck({ grossMonthly: 2300, hours: 160, workType: 'workshop' });
  eq(r.required, 13.9, 'v dielni platí všeobecný Mindestlohn');
  ok(r.ok, '2 300 € pri 160 h (14,375 €/h) vyhovuje');
}

// ── Podiel stavebných hodín (pravidlo >50 % pre SOKA-BAU) ───────────────────
console.log('\nPodiel stavebných hodín');
{
  const ts = [
    { hours: 60, activity_type: 'construction' },
    { hours: 100, activity_type: 'workshop' },
    { hours: 10, activity_type: 'travel' },
  ];
  const r = M.constructionShare(ts);
  eq(r.totalHours, 160, 'cesta sa do pomeru nepočíta');
  eq(r.pct, 37.5, 'podiel stavebných hodín 37,5 %');
  ok(!r.sokaRequired, 'pod 50 % → SOKA-BAU nevzniká');
}
{
  const r = M.constructionShare([
    { hours: 120, activity_type: 'construction' },
    { hours: 40, activity_type: 'workshop' },
  ]);
  eq(r.pct, 75, 'podiel 75 %');
  ok(r.sokaRequired, 'nad 50 % → SOKA-BAU je povinná');
}
{
  const r = M.constructionShare([
    { hours: 80, activity_type: 'construction' }, { hours: 80, activity_type: 'workshop' },
  ]);
  eq(r.pct, 50, 'presne 50 %');
  ok(!r.sokaRequired, 'pri presne 50 % povinnosť nevzniká (rozhoduje viac ako polovica)');
}

// ── Súhrn portfólia ─────────────────────────────────────────────────────────
{
  const rows = [
    { revenue: 6080, totalCost: 4463, margin: 1617 },
    { revenue: 6080, totalCost: 4463, margin: 1617 },
  ];
  const s = M.portfolioSummary(rows);
  eq(s.workers, 2, 'dvaja pracovníci');
  eq(s.margin, 3234, 'marža spolu');
  eq(s.marginPerWorker, 1617, 'marža na pracovníka');
}

// ── Compliance ──────────────────────────────────────────────────────────────
console.log('\nCompliance');
const TODAY = '2026-08-11';

{
  // stavebná zákazka bez ničoho → samé blokátory
  const r = C.checkSubcontract({
    today: TODAY,
    subcontract: { work_type: 'construction', scope: 'Práce', billing_model: 'hourly' },
    assignments: [{ worker_id: 'w1', status: 'planned', date_from: '2026-09-01', date_to: '2026-11-30' }],
    workers: [{ id: 'w1', full_name: 'Ján Kováč', skill_level: 'werker' }],
    workerDocs: [], companyItems: [],
  });
  ok(!r.ok, 'stavebná zákazka bez dokladov nie je pripravená');
  ok(r.blockers.some(b => b.label.includes('A1')), 'chýbajúce A1 je blokátor');
  ok(r.blockers.some(b => b.label.includes('Zoll')), 'neohlásený Zoll je blokátor');
  ok(r.blockers.some(b => b.label.includes('SOKA')), 'chýbajúca SOKA registrácia je blokátor');
  ok(r.warnings.some(w => w.label.includes('§48b')), 'chýbajúca §48b je upozornenie na zrážku');
  ok(r.warnings.some(w => w.label.includes('predák')), 'chýbajúci predák je signál ANÜ');
}

{
  // dielňa má výrazne menej požiadaviek
  const r = C.checkSubcontract({
    today: TODAY,
    subcontract: { work_type: 'workshop', scope: 'Zváranie oceľových konštrukcií podľa výkresu, 120 kusov', billing_model: 'unit' },
    assignments: [{ worker_id: 'w1', status: 'planned', role: 'predak' }],
    workers: [{ id: 'w1', full_name: 'Ján Kováč' }],
    workerDocs: [{ worker_id: 'w1', kind: 'a1', valid_from: '2026-01-01', valid_to: '2027-01-01' }],
    companyItems: [{ kind: 'ust_idnr', valid_from: '2026-01-01' }, { kind: 'insurance', valid_to: '2027-01-01' }],
  });
  ok(r.ok, 'dielenská zákazka s A1, USt-IdNr a poistením je pripravená');
  eq(r.blockers.length, 0, 'žiadne blokátory');
  ok(!r.items.some(i => i.label.includes('SOKA')), 'dielňa nerieši SOKA-BAU');
  ok(!r.items.some(i => i.label.includes('Zoll')), 'dielňa nerieši hlásenie Zoll');
}

{
  // A1 čoskoro vyprší a nepokrýva nasadenie
  const r = C.checkSubcontract({
    today: TODAY,
    subcontract: { work_type: 'workshop', scope: 'Zváranie konštrukcií podľa výkresovej dokumentácie' },
    assignments: [{ worker_id: 'w1', status: 'planned', role: 'predak', date_to: '2026-12-31' }],
    workers: [{ id: 'w1', full_name: 'Ján Kováč' }],
    workerDocs: [{ worker_id: 'w1', kind: 'a1', valid_to: '2026-09-01' }],
    companyItems: [{ kind: 'ust_idnr' }, { kind: 'insurance' }],
  });
  ok(r.warnings.some(w => w.label.includes('A1 čoskoro')), 'A1 pred vypršaním je upozornenie');
}

{
  // vyslanie nad 24 mesiacov
  const r = C.checkSubcontract({
    today: TODAY,
    subcontract: { work_type: 'workshop', scope: 'Dlhodobá výroba oceľových dielcov podľa zadania' },
    assignments: [{ worker_id: 'w1', status: 'planned', role: 'predak',
      date_from: '2026-01-01', date_to: '2028-12-31' }],
    workers: [{ id: 'w1', full_name: 'Ján Kováč' }],
    workerDocs: [{ worker_id: 'w1', kind: 'a1', valid_to: '2029-01-01' }],
    companyItems: [{ kind: 'ust_idnr' }, { kind: 'insurance' }],
  });
  ok(r.blockers.some(b => b.label.includes('24 mesiacov')), 'vyslanie nad 24 mesiacov je blokátor');
}

{
  // mzda pod minimom sa zachytí aj cez compliance
  const r = C.checkSubcontract({
    today: TODAY, monthlyHours: 160,
    subcontract: { work_type: 'construction', scope: 'Montáž sadrokartónových priečok, 800 m²' },
    assignments: [{ worker_id: 'w1', status: 'planned', role: 'predak', gross_monthly: 1800 }],
    workers: [{ id: 'w1', full_name: 'Ján Kováč', skill_level: 'werker' }],
    workerDocs: [{ worker_id: 'w1', kind: 'a1', valid_to: '2027-01-01' }],
    companyItems: [{ kind: 'ust_idnr' }, { kind: 'insurance' },
      { kind: 'soka_registration' }, { kind: 'freistellung_48b', valid_to: '2027-01-01' }],
  });
  ok(r.blockers.some(b => b.label.includes('pod')), 'mzda pod Bau-Mindestlohn je blokátor');
}

// ── Riziko skrytej ANÜ ──────────────────────────────────────────────────────
console.log('\nRiziko skrytej ANÜ');
{
  eq(C.anuRisk({}).level, 'nizke', 'bez signálov je riziko nízke');
  eq(C.anuRisk({ gu_gives_orders: true }).level, 'zvysene', 'jeden signál zvyšuje riziko');
  const r = C.anuRisk({ gu_gives_orders: true, no_own_lead: true, hours_only: true });
  eq(r.level, 'vysoke', 'tri signály znamenajú vysoké riziko');
  ok(r.advice.includes('okamžite'), 'rada pri vysokom riziku je konať hneď');
  const k = C.anuRisk({ gu_gives_orders: true, no_own_lead: true, hours_only: true,
    gu_badge: true, gu_org_chart: true });
  eq(k.level, 'kriticke', 'päť signálov je kritických');
}

// ── Cash-flow ───────────────────────────────────────────────────────────────
console.log('\nCash-flow');
{
  const inv = [
    { status: 'paid', issue_date: '2026-06-01', paid_at: '2026-07-16', total: 6000 },  // 45 dní
    { status: 'paid', issue_date: '2026-06-10', paid_at: '2026-08-04', total: 6000 },  // 55 dní
    { status: 'overdue', issue_date: '2026-07-01', due_date: '2026-07-31', total: 5000 },
    { status: 'issued', issue_date: '2026-08-01', due_date: '2026-09-01', total: 4000 },
  ];
  const r = C.cashflowCheck({ invoices: inv, monthlyPayroll: 40000, factoring: false, today: TODAY });
  eq(r.outstanding, 9000, 'neuhradené spolu 9 000 €');
  eq(r.overdueSum, 5000, 'po splatnosti 5 000 €');
  eq(r.dso, 50, 'priemerná doba inkasa 50 dní');
  ok(!r.scaleSafe, 'pri 50 dňoch bez faktoringu sa nemá škálovať');
  ok(r.warnings.some(w => w.severity === 'blocker'), 'prekročený prah je blokátor');
  ok(r.workingCapitalNeeded > 60000, 'potreba pracovného kapitálu je vyčíslená');
}
{
  const inv = [{ status: 'paid', issue_date: '2026-07-01', paid_at: '2026-07-21', total: 6000 }];
  const r = C.cashflowCheck({ invoices: inv, monthlyPayroll: 20000, factoring: false, today: TODAY });
  eq(r.dso, 20, 'rýchle inkaso 20 dní');
  ok(r.scaleSafe, 'pri 20 dňoch sa škálovať dá');
}
{
  const inv = [{ status: 'paid', issue_date: '2026-06-01', paid_at: '2026-07-31', total: 6000 }];
  const r = C.cashflowCheck({ invoices: inv, monthlyPayroll: 20000, factoring: true, today: TODAY });
  ok(r.scaleSafe, 's faktoringom je dlhá splatnosť únosná');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
