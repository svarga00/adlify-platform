// ============================================================================
// Testy: jednotková ekonomika a compliance pre subdodávky (Fáza 2)
// Spustenie:  node app/lib/staffing/staffing.test.js
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
// ubytovanie 350 €; doprava 150 €; SOKA 14,7 % (diéty neplatíme nikomu)
// Plán očakáva maržu ~1 400–1 600 €.
{
  const a = { legal_form: 'employee', charge_rate: 38, gross_monthly: 2000, per_diem_daily: 45,
    accommodation_monthly: 350, transport_monthly: 150 };
  const r = M.assignmentMargin(a, { hours: 160, workDays: 21, workType: 'construction' });
  eq(r.revenue, 6080, 'tržba 160 h × 38 € = 6 080 €');
  eq(r.costs.contributions, 724, 'odvody 36,2 % z 2 000 € = 724 €');
  eq(r.costs.perDiem, 0, 'diéty neplatíme nikomu — ani keď pri človeku zostala stará hodnota');
  ok(!r.breakdown.some(b => /Diéty/.test(b[0])), 'a v rozpise nie sú');
  eq(r.costs.soka, 294, 'SOKA-BAU 14,7 % z hrubej = 294 €');
  eq(r.totalCost, 3518, 'náklady spolu 3 518 € (mzda, odvody, SOKA, ubytovanie, doprava)');
  eq(r.margin, 2562, 'marža 2 562 €');
  ok(r.margin >= 1400, 'marža sedí na rozpätie z plánu (1 400–1 600 €)');
}

// ── Dielňa: bez SOKA-BAU je marža vyššia pri rovnakých vstupoch ─────────────
{
  const a = { legal_form: 'employee', charge_rate: 38, gross_monthly: 2000, per_diem_daily: 45,
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
  const r = M.assignmentMargin({ legal_form: 'employee', charge_rate: 38, gross_monthly: 2000 },
    { hours: 160, workDays: 21, workType: 'workshop', freistellungOk: false });
  eq(r.withholding, 0, 'dielenské práce nepodliehajú Bauabzugsteuer');
}

// ── Živnostník (SZČO) namiesto zamestnanca ──────────────────────────────────
{
  // 160 h × 38 € = 6 080 tržba; živnostník fakturuje 26 €/h = 4 160
  // žiadne odvody, žiadna SOKA; ubytovanie 350 platíme my
  const a = { charge_rate: 38, legal_form: 'szco', hourly_cost: 26,
    accommodation_monthly: 350, per_diem_daily: 0 };
  const r = M.assignmentMargin(a, { hours: 160, workDays: 21, workType: 'construction' });
  eq(r.revenue, 6080, 'tržba je rovnaká bez ohľadu na formu spolupráce');
  eq(r.costs.subcontractor, 4160, 'živnostník fakturuje 160 h × 26 € = 4 160 €');
  eq(r.costs.contributions, 0, 'pri živnostníkovi sa neplatia odvody');
  eq(r.costs.soka, 0, 'živnostníka sa netýka SOKA-BAU ani na stavbe');
  eq(r.margin, 1570, 'marža 6 080 − 4 160 − 350 = 1 570 €');
  ok(r.breakdown.some(b => b[0].includes('živnostníka')), 'rozpis uvádza fakturáciu živnostníka');
}
{
  // pri rovnakých vstupoch je zamestnanec drahší o odvody a SOKA
  const base = { charge_rate: 38, accommodation_monthly: 350 };
  const szco = M.assignmentMargin({ ...base, legal_form: 'szco', hourly_cost: 26, per_diem_daily: 0 },
    { hours: 160, workDays: 21, workType: 'construction' });
  const emp = M.assignmentMargin({ ...base, legal_form: 'employee', gross_monthly: 2000, per_diem_daily: 45 },
    { hours: 160, workDays: 21, workType: 'construction' });
  ok(emp.costs.contributions > 0 && emp.costs.soka > 0 && szco.costs.contributions === 0 && szco.costs.soka === 0,
    'obe formy sa líšia štruktúrou nákladov — odvody a SOKA len pri zamestnancovi');
  ok(emp.costs.soka > 0 && szco.costs.soka === 0, 'SOKA platí len pri zamestnancovi');
}
{
  // živnostník bez zadanej hodinovej sadzby → náklad nula, marža = celá tržba
  const r = M.assignmentMargin({ charge_rate: 30, legal_form: 'szco' },
    { hours: 100, workDays: 20, workType: 'workshop' });
  eq(r.costs.subcontractor, 0, 'bez sadzby je náklad nula');
  eq(r.margin, 3000, 'marža sa rovná tržbe — treba doplniť sadzbu');
}

// ── Minimálna mzda ──────────────────────────────────────────────────────────
console.log('\nMinimálna mzda');
{
  const r = M.minWageCheck({ legalForm: 'szco', grossMonthly: 0, hours: 160, workType: 'construction' });
  ok(r.ok, 'na živnostníka sa minimálna mzda nevzťahuje');
  ok(r.basis.includes('živnostník'), 'dôvod je uvedený');
}
{
  // 2 000 € / 160 h = 12,50 €/h → pod LG1 (15,86)
  const r = M.minWageCheck({ legalForm: 'employee', grossMonthly: 2000, hours: 160, workType: 'construction', skillLevel: 'werker' });
  eq(r.required, 15.86, 'LG1 je 15,86 €/h');
  eq(r.effective, 12.5, 'efektívna hodinová mzda 12,50 €');
  ok(!r.ok, 'mzda pod odvetvovým minimom je zachytená');
  near(r.shortfall, 537.6, 0.1, 'doplatok do minima je vyčíslený');
}
{
  const r = M.minWageCheck({ legalForm: 'employee', grossMonthly: 2800, hours: 160, workType: 'construction', skillLevel: 'fachwerker' });
  eq(r.required, 17.34, 'LG2 je 17,34 €/h');
  ok(r.ok, '2 800 € pri 160 h (17,50 €/h) vyhovuje LG2');
}
{
  // v dielni platí len všeobecný Mindestlohn 13,90
  const r = M.minWageCheck({ legalForm: 'employee', grossMonthly: 2300, hours: 160, workType: 'workshop' });
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
  // Migrácia 067: A1 je zapísané, ale nie je nahraté — nasadiť sa nesmie.
  const r = C.checkSubcontract({
    today: TODAY,
    subcontract: { work_type: 'workshop', scope: 'Zváranie oceľových konštrukcií podľa výkresu, 120 kusov', billing_model: 'unit' },
    assignments: [{ worker_id: 'w1', status: 'planned', role: 'predak' }],
    workers: [{ id: 'w1', full_name: 'Ján Kováč' }],
    workerDocs: [{ worker_id: 'w1', kind: 'a1', valid_from: '2026-01-01', valid_to: '2027-01-01',
      storage_path: null, file_url: null }],
    companyItems: [{ kind: 'ust_idnr', valid_from: '2026-01-01' }, { kind: 'insurance', valid_to: '2027-01-01' }],
  });
  ok(!r.ok, 'A1 bez skenu zákazku nepustí');
  ok(r.blockers.some(b => b.label === 'Ján Kováč: A1 nie je nahraté' && b.worker_id === 'w1'),
    'blokátor povie, že A1 nie je nahraté, a patrí k človeku');
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
    workers: [{ id: 'w1', full_name: 'Ján Kováč', skill_level: 'werker', legal_form: 'employee' }],
    workerDocs: [{ worker_id: 'w1', kind: 'a1', valid_to: '2027-01-01' }],
    companyItems: [{ kind: 'ust_idnr' }, { kind: 'insurance' },
      { kind: 'soka_registration' }, { kind: 'freistellung_48b', valid_to: '2027-01-01' }],
  });
  ok(r.blockers.some(b => b.label.includes('pod')), 'mzda pod Bau-Mindestlohn je blokátor');
}

// ── Regulované remeslo a §9 HwO ─────────────────────────────────────────────
{
  const base = {
    today: TODAY,
    subcontract: { work_type: 'workshop', scope: 'Elektroinštalácie v hale podľa projektovej dokumentácie' },
    assignments: [{ worker_id: 'w1', status: 'planned', role: 'predak' }],
    workerDocs: [{ worker_id: 'w1', kind: 'a1', valid_to: '2027-06-01' }],
    companyItems: [{ kind: 'ust_idnr' }, { kind: 'insurance' }],
  };
  const bez = C.checkSubcontract({ ...base,
    workers: [{ id: 'w1', full_name: 'Elektrikár Novák', regulated_trade: true }] });
  ok(bez.blockers.some(b => b.label.includes('Handwerkskammer')),
    'regulované remeslo bez oznámenia HWK je blokátor');

  const s = C.checkSubcontract({ ...base,
    workers: [{ id: 'w1', full_name: 'Elektrikár Novák', regulated_trade: true }],
    companyItems: [...base.companyItems, { kind: 'handwerksrolle', valid_to: '2027-01-01' }] });
  ok(!s.blockers.some(b => b.label.includes('Handwerkskammer')),
    's platným oznámením HWK blokátor zmizne');

  const nereg = C.checkSubcontract({ ...base,
    workers: [{ id: 'w1', full_name: 'Zvárač Kováč', regulated_trade: false }] });
  ok(!nereg.items.some(b => b.label.includes('Handwerkskammer')),
    'neregulované remeslo HWK nerieši');
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

// ── Čo spraviť teraz v compliance ───────────────────────────────────────────
// Compliance bola zoznam pravidiel so štyrmi číslami. Z toho sa nedalo
// povedať, čo zastaví stavbu najskôr — a lehoty sú pri tom to podstatné:
// A1 sa vybavuje až 45 dní, Freistellung §48b štyri až osem týždňov.
{
  console.log('\nČo spraviť teraz v compliance');
  const DNES = '2026-10-14';
  const VSETKO = ['ust_idnr', 'soka_registration', 'handwerksrolle', 'freistellung_48b']
    .map(kind => ({ scope: 'company', kind, valid_to: '2027-06-30' }));
  const clovek = (id, name, status = 'deployed') => ({ id, full_name: name, status });
  const a1 = (worker_id, valid_to) => ({ kind: 'a1', worker_id, valid_to });

  // Prázdna appka: povolenia ešte nikto nezaevidoval.
  eq(C.nowNext({ today: DNES }).key, 'company', 'bez zaevidovaných povolení sa pýtajú povolenia');
  ok(C.nowNext({}).key, 'bez vstupu to nespadne');

  // Človek na stavbe bez A1 je prvý — padne to na firmu, nie na neho.
  const bezA1 = C.nowNext({ today: DNES, items: VSETKO,
    workers: [clovek('w1', 'Jozef Malý')], workerDocs: [] });
  eq(bezA1.key, 'a1', 'chýbajúce A1 u nasadeného človeka je prvé');
  ok(bezA1.hot, 'a horí');
  ok(/Jozef Malý/.test(bezA1.what), 'vo vete je meno', bezA1.what);
  ok(/padne na nás/.test(bezA1.why), 'aj to, na koho to padne', bezA1.why);
  ok(/45 dní/.test(bezA1.why), 'a koľko trvá vybavenie', bezA1.why);

  // Kto ešte nie je na stavbe, je tiež problém — ale nehorí tak.
  const pripraveny = C.nowNext({ today: DNES, items: VSETKO,
    workers: [clovek('w1', 'Jozef Malý', 'ready')], workerDocs: [] });
  eq(pripraveny.key, 'a1', 'aj u pripraveného človeka');
  ok(!pripraveny.hot, 'ale nehorí — ešte nie je na stavbe');
  ok(/nasadiť nedá/.test(pripraveny.why), 'a je povedané, čo to blokuje', pripraveny.why);

  // Neplatné firemné povolenie je druhé.
  const zleUst = C.nowNext({ today: DNES,
    items: [...VSETKO.filter(i => i.kind !== 'ust_idnr'),
      { scope: 'company', kind: 'ust_idnr', valid_to: '2026-09-30' }],
    workers: [clovek('w1', 'Jozef Malý')], workerDocs: [a1('w1', '2027-01-01')] });
  eq(zleUst.key, 'company', 'neplatné povolenie je na rade po A1');
  ok(zleUst.hot, 'a horí');
  ok(/USt-IdNr/.test(zleUst.what), 'povie sa menom, nie kľúčom', zleUst.what);
  ok(/reverse charge/.test(zleUst.why), 'aj čo to spôsobí', zleUst.why);

  // A1, ktoré sa končí do 45 dní, znamená „podaj to dnes".
  const konci = C.nowNext({ today: DNES, items: VSETKO,
    workers: [clovek('w1', 'Jozef Malý')], workerDocs: [a1('w1', '2026-11-10')] });
  eq(konci.key, 'a1soon', 'A1 pred koncom platnosti');
  ok(!konci.hot, 'nehorí, ale treba to podať');
  ok(/podajte to dnes/.test(konci.why), 'a je povedané prečo', konci.why);

  // Povolenie, ktorému sa končí platnosť, je posledné.
  const konciFirma = C.nowNext({ today: DNES,
    items: [...VSETKO.filter(i => i.kind !== 'freistellung_48b'),
      { scope: 'company', kind: 'freistellung_48b', valid_to: '2026-11-01' }],
    workers: [clovek('w1', 'Jozef Malý')], workerDocs: [a1('w1', '2027-01-01')] });
  eq(konciFirma.key, 'companysoon', 'povolenie pred koncom platnosti je posledné');
  ok(/4–8 týždňov/.test(konciFirma.why), 's lehotou, ktorá naozaj platí', konciFirma.why);
  ok(/15 %/.test(konciFirma.why), 'a čo to stojí', konciFirma.why);

  // Všetko v poriadku sa povie tiež.
  const dobre = C.nowNext({ today: DNES, items: VSETKO,
    workers: [clovek('w1', 'Jozef Malý')], workerDocs: [a1('w1', '2027-01-01')] });
  eq(dobre.key, 'ok', 'keď je všetko platné, povie sa to');
  ok(!dobre.hot, 'a nehorí');

  // Novší doklad prekryje starší, nie naopak.
  const dvaDoklady = C.nowNext({ today: DNES, items: VSETKO,
    workers: [clovek('w1', 'Jozef Malý')],
    workerDocs: [a1('w1', '2026-01-01'), a1('w1', '2027-01-01')] });
  eq(dvaDoklady.key, 'ok', 'starý doklad vedľa nového nerobí problém');

  // Človek, ktorý u nás nerobí, sa do compliance nepočíta.
  eq(C.nowNext({ today: DNES, items: VSETKO,
    workers: [clovek('w9', 'Bývalý', 'archived')], workerDocs: [] }).key, 'ok',
    'archivovaný človek už A1 nepotrebuje');
}

// ── Freistellung §48b je firemná ────────────────────────────────────────────
{
  const D = '2026-10-22';
  const fb = (o) => ({ kind: 'freistellung_48b', scope: 'company', status: 'active', ...o });
  eq(C.freistellung([fb({ valid_to: '2027-12-31', reference: '12/345' })], D).ok, true, 'platná Freistellung = zrážka sa neuplatní');
  eq(C.freistellung([fb({ status: 'pending' })], D).ok, false, 'podaná žiadosť ešte nie je Freistellung');
  eq(C.freistellung([fb({ valid_to: '2026-01-31' })], D).ok, false, 'po platnosti nie');
  eq(C.freistellung([], D).state, 'missing', 'bez záznamu chýba');
  eq(C.freistellung([fb({ valid_to: '2026-11-10' })], D).ok, true, 'čoskoro vyprší, ale ešte platí');
  const sc = { work_type: 'construction', partner_id: 'p1' };
  const sPlatnou = C.checkSubcontract({ subcontract: sc, partner: { ust_idnr: 'DE1' },
    companyItems: [fb({ valid_to: '2027-12-31' })], workers: [], assignments: [], today: D });
  ok(!sPlatnou.items.some(i => /zrazí odberateľ 15/.test(i.label)), 's platnou Freistellung sa zrážka v compliance nehlási');
  const bez = C.checkSubcontract({ subcontract: sc, partner: { ust_idnr: 'DE1' },
    companyItems: [fb({ status: 'pending' })], workers: [], assignments: [], today: D });
  ok(bez.items.some(i => /zrazí odberateľ 15/.test(i.label)), 'bez nej áno');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
