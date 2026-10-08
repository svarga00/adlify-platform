// ============================================================================
// Testy: reťazec zákazky — päť krokov od dohody po peniaze
// Spustenie:  node app/lib/staffing/site.test.js
// ============================================================================
global.window = global;
const S = require('./site');

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

// Zákazka, na ktorej je všetko v poriadku. Jednotlivé testy z nej ubierajú.
const SC = {
  id: 'sc1', status: 'active', partner_id: 'p1', scope: 'Sadrokartón 1. NP, 420 m²',
  charge_rate: 34, date_from: '2026-09-01', date_to: '2026-12-31',
  work_type: 'construction',
};
const OK_CHECK = { ok: true, blockers: [], warnings: [] };
const ASG = [
  { id: 'a1', worker_id: 'w1', status: 'active' },
  { id: 'a2', worker_id: 'w2', status: 'active' },
];
const HODINY = [
  { id: 't1', assignment_id: 'a1', worker_id: 'w1', hours: 8, approved: true, period_id: null },
  { id: 't2', assignment_id: 'a2', worker_id: 'w2', hours: 9, approved: true, period_id: null },
];

/** Všetko hotové: hodiny zúčtované, obdobie uzavreté, faktúra zaplatená. */
const HOTOVO = {
  subcontract: SC, partner: { name: 'GU Ulm GmbH' }, check: OK_CHECK,
  assignments: ASG, missingDocs: {}, housed: 2,
  timesheets: HODINY.map(t => ({ ...t, period_id: 'per1' })),
  periods: [{ id: 'per1', status: 'closed' }],
  invoices: [{ id: 'f1', period_id: 'per1', status: 'paid' }],
};

const krok = (steps, key) => steps.find(s => s.key === key);

console.log('\nJEDEN REŤAZEC');
{
  eq(S.STEPS.map(s => s.key), ['deal', 'green', 'people', 'hours', 'money'],
    'päť krokov v poradí, v akom sa robia');
  eq(S.STEPS.map(s => s.title),
    ['Dohodnuté', 'Smie sa začať', 'Ľudia na stavbe', 'Hodiny', 'Peniaze'],
    'každý krok je pomenovaný tak, ako sa o ňom hovorí');
  ok(S.STEPS.every(s => s.lead && s.why),
    'každý krok povie, čo to je aj prečo to je — to je to, čo sa dá naučiť');
  eq(S.STEPS.map(s => s.n), [1, 2, 3, 4, 5], 'a sú očíslované');
}

console.log('\nDOHODNUTÉ');
{
  const s = krok(S.state(HOTOVO), 'deal');
  ok(s.done, 'úplná zákazka má prvý krok hotový');
  ok(/GU Ulm/.test(s.detail), 'a vo vete je odberateľ a sadzba', s.detail);
}
{
  const s = krok(S.state({ ...HOTOVO, subcontract: { ...SC, scope: null } }), 'deal');
  ok(!s.done, 'bez napísaného diela nie je dohodnuté');
  ok(/čo je dielo/.test(s.detail), 'a je povedané, čo chýba', s.detail);
  ok(/fakturovať/.test(s.todo), 'aj prečo to treba', s.todo);
}
{
  // Pevná cena nemá hodinovú sadzbu a nesmie preto viseť na kroku 1.
  const fix = { ...SC, billing_model: 'fixed', charge_rate: null };
  ok(krok(S.state({ ...HOTOVO, subcontract: fix }), 'deal').done,
    'pri pevnej cene sa hodinová sadzba nevyžaduje');
  const hod = { ...SC, billing_model: 'hourly', charge_rate: null };
  ok(!krok(S.state({ ...HOTOVO, subcontract: hod }), 'deal').done,
    'pri fakturácii po hodinách áno');
}

console.log('\nSMIE SA ZAČAŤ');
{
  const check = { ok: false, blockers: [
    { label: 'Chýba A1', fix: 'Podaj A1 za Jozefa Malého' },
    { label: 'Nie je hlásené na Zoll' }], warnings: [] };
  const steps = S.state({ ...HOTOVO, check });
  const s = krok(steps, 'green');
  ok(!s.done, 'blokátor znamená, že sa začať nesmie');
  ok(/Chýba A1/.test(s.detail), 'a je vidieť, ktorý to je', s.detail);
  eq(s.todo, 'Podaj A1 za Jozefa Malého', 'v „čo teraz" je návod, nie názov chyby');
  ok(s.hot, 'keď sú ľudia už na stavbe, horí to');
  eq(S.next(steps, SC).key, 'green', 'a má to prednosť pred všetkým ostatným');
}
{
  // Bez nasadených ľudí je chýbajúci papier ešte len úloha, nie požiar.
  const steps = S.state({ ...HOTOVO, assignments: [], housed: 0,
    check: { ok: false, blockers: [{ label: 'Chýba USt-IdNr' }], warnings: [] } });
  ok(!krok(steps, 'green').hot, 'bez ľudí na stavbe to nehorí');
}
{
  const s = krok(S.state({ ...HOTOVO,
    check: { ok: true, blockers: [], warnings: [{ label: 'A1 sa končí za 20 dní' }] } }), 'green');
  ok(s.done, 'upozornenie nie je prekážka');
  ok(/1 upozornenie/.test(s.detail), 'ale je spočítané', s.detail);
}

console.log('\nĽUDIA NA STAVBE');
{
  const s = krok(S.state({ ...HOTOVO, assignments: [], housed: 0 }), 'people');
  ok(!s.done, 'zákazka bez ľudí nie je v poriadku');
  ok(/nezarába/.test(s.todo), 'a je povedané prečo', s.todo);
}
{
  const steps = S.state({ ...HOTOVO, missingDocs: { w2: 2 } });
  const s = krok(steps, 'people');
  ok(!s.done, 'človek bez dokladu drží krok otvorený');
  ok(/1 bez dokladu/.test(s.detail), 'a je ich spočítané', s.detail);
  ok(/výnimku/.test(s.todo), 's možnosťou zapísať výnimku — nie slepá ulička', s.todo);
  ok(s.hot, 'horí to');
}
{
  // Nezapísané ubytovanie je nedostatok, ale nie blokátor: človek niekde spí,
  // len to nie je v appke.
  const steps = S.state({ ...HOTOVO, housed: 1 });
  const s = krok(steps, 'people');
  ok(s.done, 'nezapísané ubytovanie krok nezhodí');
  ok(/bez zapísaného ubytovania/.test(s.detail), 'ale je to vidieť', s.detail);
  ok(!s.hot, 'a nehorí to');
}

console.log('\nHODINY');
{
  const s = krok(S.state({ ...HOTOVO, timesheets: HODINY }), 'hours');
  ok(s.done, 'zapísané a schválené hodiny sú v poriadku');
  ok(/17 hodín nezúčtovaných/.test(s.detail), 'a je ich vidieť koľko', s.detail);
}
{
  const ts = [HODINY[0], { ...HODINY[1], approved: false }];
  const steps = S.state({ ...HOTOVO, timesheets: ts });
  const s = krok(steps, 'hours');
  ok(!s.done, 'neschválený výkaz drží krok otvorený');
  ok(/9 neschválených/.test(s.detail), 'a vie, koľko hodín to je', s.detail);
  ok(/do podkladu nejdú/.test(s.todo), 'aj čo to znamená', s.todo);
  ok(s.hot, 'sú to peniaze na stole, takže to horí');
}
{
  const s = krok(S.state({ ...HOTOVO, timesheets: [] }), 'hours');
  ok(!s.done, 'bez hodín nie je čo fakturovať');
  ok(/Zapíš odpracované hodiny/.test(s.todo), 'a to je tá vec, ktorú treba spraviť', s.todo);
}
{
  // Ukončená zákazka už hodiny nečaká.
  const s = krok(S.state({ ...HOTOVO, subcontract: { ...SC, status: 'completed' },
    timesheets: [] }), 'hours');
  eq(s.todo, null, 'ukončená zákazka hodiny nepýta');
}

console.log('\nPENIAZE');
{
  const s = krok(S.state(HOTOVO), 'money');
  ok(s.done, 'uzavreté, vyfakturované a zaplatené je hotové');
  ok(/všetky zaplatené/.test(s.detail), 'a je to napísané', s.detail);
}
{
  const steps = S.state({ ...HOTOVO, invoices: [] });
  const s = krok(steps, 'money');
  ok(!s.done, 'uzavreté obdobie bez faktúry nie je hotové');
  ok(/nie je vyfakturované/.test(s.todo), 'a je to tá vec na teraz', s.todo);
}
{
  const steps = S.state({ ...HOTOVO,
    invoices: [{ id: 'f1', period_id: 'per1', status: 'pending_approval' }] });
  ok(/na schválenie/.test(krok(steps, 'money').todo),
    'faktúra čakajúca na schválenie je vidieť', krok(steps, 'money').todo);
  ok(/neodošle/.test(krok(steps, 'money').todo),
    'a je povedané, že bez schválenia neodíde');
}
{
  const steps = S.state({ ...HOTOVO,
    invoices: [{ id: 'f1', period_id: 'per1', status: 'overdue' }] });
  const s = krok(steps, 'money');
  ok(/po splatnosti/.test(s.todo), 'faktúra po splatnosti je vidieť', s.todo);
  ok(s.hot, 'a horí');
  eq(S.next(steps, SC).key, 'money', 'má prednosť pred nezapísanými hodinami');
}
{
  // Hodiny sú, ale nikto nezaložil obdobie — najtichšia diera v reťazci.
  const steps = S.state({ ...HOTOVO, timesheets: HODINY, periods: [], invoices: [] });
  ok(/Uzavri obdobie/.test(krok(steps, 'money').todo),
    'hodiny bez obdobia hovoria, že treba uzavrieť obdobie',
    krok(steps, 'money').todo);
}
{
  const steps = S.state({ ...HOTOVO, timesheets: HODINY,
    periods: [{ id: 'per2', status: 'open' }], invoices: [] });
  ok(/Uzavri ho a fakturuj/.test(krok(steps, 'money').todo),
    'otvorené obdobie s hodinami tiež', krok(steps, 'money').todo);
}
{
  // Zrušená faktúra sa neráta ani ako vystavená, ani ako nezaplatená.
  const steps = S.state({ ...HOTOVO,
    invoices: [{ id: 'f1', period_id: 'per1', status: 'cancelled' }] });
  ok(!krok(steps, 'money').done, 'zrušená faktúra neplatí za vyfakturované');
  ok(/nie je vyfakturované/.test(krok(steps, 'money').todo),
    'a obdobie zostáva nevyfakturované');
}

console.log('\nČO SPRAVIŤ TERAZ');
{
  const n = S.next(S.state(HOTOVO), SC);
  eq(n.key, 'done', 'na zákazke, kde je všetko hotové, nič nečaká');
}
{
  const n = S.next(S.state({ ...HOTOVO, subcontract: { ...SC, status: 'completed' } }),
    { ...SC, status: 'completed' });
  eq(n.key, 'closed', 'ukončená zákazka nemá čo riešiť');
}
{
  // Horí viac vecí naraz: papiere aj faktúra po splatnosti. Papiere sú prvé —
  // pokuta je drahšia než týždeň čakania na platbu.
  const steps = S.state({ ...HOTOVO,
    check: { ok: false, blockers: [{ label: 'Chýba A1', fix: 'Podaj A1' }], warnings: [] },
    invoices: [{ id: 'f1', period_id: 'per1', status: 'overdue' }] });
  eq(S.next(steps, SC).key, 'green', 'papiere majú prednosť pred faktúrou po splatnosti');
}
{
  // Nič nehorí — vtedy je na rade prvý nehotový krok.
  const steps = S.state({ ...HOTOVO, timesheets: [] });
  eq(S.next(steps, SC).key, 'hours', 'inak ide na rade prvý nehotový krok');
  ok(S.next(steps, SC).what, 'a vždy povie konkrétnu vec');
}
{
  const n = S.next([], SC);
  eq(n.key, 'wait', 'bez krokov to nespadne');
}

console.log('\nPOSTUP A VETA DO ZOZNAMU');
{
  eq(S.progress(S.state(HOTOVO)), { done: 5, total: 5, pct: 100 }, 'hotová zákazka je na 100 %');
  const steps = S.state({ ...HOTOVO, timesheets: [], invoices: [] });
  eq(S.progress(steps).done, 3, 'rozrobená má hotové tri kroky');
  eq(S.line(steps, SC), '4/5 · Hodiny', 'veta do zoznamu povie, v ktorom kroku to stojí');
  eq(S.line(S.state(HOTOVO), SC), 'Beží a je zaplatené', 'a pri hotovej to povie slovom');
  eq(S.line(S.state({ ...HOTOVO, subcontract: { ...SC, status: 'lost' } }),
    { ...SC, status: 'lost' }), 'Zákazka je uzavretá', 'prehratá zákazka tiež');
}

console.log('\nPRÁZDNY VSTUP');
{
  const steps = S.state({});
  eq(steps.length, 5, 'prázdny vstup nespadne');
  ok(!steps[0].done, 'a nič nevydáva za hotové');
  eq(S.next(steps, {}).key, 'deal', 'začína sa dohodou');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo\n`);
process.exit(failed ? 1 : 0);
