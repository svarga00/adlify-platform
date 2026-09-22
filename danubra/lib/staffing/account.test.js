// ============================================================================
// Testy účtu živnostníka
// Spustenie:  node danubra/lib/staffing/account.test.js
// ============================================================================
// Rovnaké pravidlá ako pohľad `danubra_v_worker_account` (migrácia 022).
// Keď sa niekedy rozídu, rozíde sa aj to, čo appka ukazuje, s tým, čo je
// v databáze — preto sú tu tie isté prípady, ktoré sa overovali v SQL.
// ============================================================================
global.window = global;
const M = require('../money.js');
const A = require('./account');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

const WORKER = { id: 'w1', hourly_cost: 18 };
const ASG = [{ id: 'a1', worker_id: 'w1', worker_rate: 20 }];
const ts = (date, hours, extra = {}) =>
  ({ id: date + hours, worker_id: 'w1', assignment_id: 'a1', work_date: date, hours, ...extra });

console.log('Účet živnostníka');

// ── Sadzba: čo má prednosť ──────────────────────────────────────────────────
// Zapísaná sadzba na výkaze vyhráva nad sadzbou nasadenia aj nad sadzbou
// človeka. Inak by zmena cenníka spätne prepísala, čo už bolo vyfakturované.
{
  eq(A.rateOf({ rate_used: 22 }, { worker_rate: 20 }, { hourly_cost: 18 }), 2200,
    'sadzba z výkazu má prednosť');
  eq(A.rateOf({}, { worker_rate: 20 }, { hourly_cost: 18 }), 2000,
    'potom sadzba nasadenia');
  eq(A.rateOf({}, null, { hourly_cost: 18 }), 1800,
    'a nakoniec sadzba človeka');
  eq(A.rateOf({}, null, null), 0, 'bez sadzby je to nula, nie NaN');
  // Nula je platná sadzba (napr. neplatená cesta) a nesmie prepadnúť nižšie.
  eq(A.rateOf({ rate_used: 0 }, { worker_rate: 20 }, null), 0,
    'nulová sadzba na výkaze platí');
}

// ── Odrobené ────────────────────────────────────────────────────────────────
{
  const e = A.earned({
    worker: WORKER, assignments: ASG,
    timesheets: [ts('2026-09-01', 8), ts('2026-09-02', 8.5), ts('2026-09-03', 7.25)],
  });
  eq(e.hours, 23.75, 'hodiny sa sčítajú aj s polhodinami');
  // 23,75 h × 20 € = 475 €
  eq(e.cents, 47500, 'a ocenia sadzbou nasadenia');
}
{
  // Rôzne sadzby na rôznych dňoch — presne to robí uzávierka.
  const e = A.earned({
    worker: WORKER, assignments: ASG,
    timesheets: [ts('2026-09-01', 10, { rate_used: 18 }), ts('2026-09-02', 10)],
  });
  eq(e.cents, 38000, 'každý deň sa ocení svojou sadzbou (180 + 200)');
}

// ── Mesiac ──────────────────────────────────────────────────────────────────
{
  const o = {
    worker: WORKER, assignments: ASG, today: '2026-09-18',
    timesheets: [ts('2026-08-31', 8), ts('2026-09-01', 8), ts('2026-09-30', 4)],
  };
  const m = A.month(o);
  eq(m.month, '2026-09', 'mesiac sa berie z dnešného dňa');
  eq(m.hours, 12, 'august sa do septembra nepočíta');
  eq(m.cents, 24000, 'a suma sedí');
  eq(A.month(o, '2026-08').hours, 8, 'dá sa spýtať aj na iný mesiac');
}

// ── Zálohy ──────────────────────────────────────────────────────────────────
{
  const open = { id: 'z1', amount: 300, paid_on: '2026-09-05' };
  const settled = { id: 'z2', amount: 200, paid_on: '2026-09-01', settled_at: '2026-09-20' };
  const byBill = { id: 'z3', amount: 100, paid_on: '2026-09-02', settled_bill_id: 'b9' };
  const voided = { id: 'z4', amount: 999, paid_on: '2026-09-03', voided_at: '2026-09-04' };

  ok(A.isOpenAdvance(open), 'nevyrovnaná záloha je otvorená');
  ok(!A.isOpenAdvance(settled), 'vyrovnaná nie je');
  ok(!A.isOpenAdvance(byBill), 'naviazaná na faktúru tiež nie');
  ok(!A.isOpenAdvance(voided), 'a zrušená sa neráta vôbec');
}

// ── Dlhujeme ────────────────────────────────────────────────────────────────
// Ten istý prípad, ktorý sa overoval priamo v databáze:
// schválená faktúra 1000 € − nevyrovnaná záloha 300 € = dlhujeme 700 €.
{
  const s = A.summary({
    worker: WORKER, assignments: ASG, today: '2026-09-18',
    timesheets: [ts('2026-09-01', 50)],
    bills: [{ id: 'b1', amount: 1000, status: 'approved' }],
    advances: [{ id: 'z1', amount: 300, paid_on: '2026-09-05' }],
  });
  eq(s.unpaid, 100000, 'schválená neuhradená faktúra');
  eq(s.advancesOpen, 30000, 'nevyrovnaná záloha');
  eq(s.owed, 70000, 'dlhujeme 700 € — rovnako ako v databáze');
  eq(s.payable, 70000, 'a toľko sa dá vyplatiť');
  eq(s.overpaid, 0, 'nič nie je preplatené');
}

// Záloha väčšia než faktúra: nevypláca sa, odpočíta sa z ďalšej.
{
  const s = A.summary({
    worker: WORKER, assignments: ASG,
    bills: [{ id: 'b1', amount: 200, status: 'approved' }],
    advances: [{ id: 'z1', amount: 500, paid_on: '2026-09-05' }],
  });
  eq(s.owed, -30000, 'dlh je záporný');
  eq(s.payable, 0, 'nevypláca sa nič');
  eq(s.overpaid, 30000, 'a 300 € sa odpočíta z ďalšej faktúry');
}

// Sporná faktúra nie je záväzok.
{
  const s = A.summary({
    worker: WORKER, assignments: ASG,
    bills: [
      { id: 'b1', amount: 1000, status: 'disputed' },
      { id: 'b2', amount: 400, status: 'approved' },
    ],
  });
  eq(s.disputed, 100000, 'sporná suma je vidieť zvlášť');
  eq(s.owed, 40000, 'ale do dlhu sa nepočíta');
  eq(s.billed, 40000, 'ani do vyfakturovaného');
}

// Uhradená faktúra už dlh nezvyšuje.
{
  const s = A.summary({
    worker: WORKER, assignments: ASG,
    bills: [
      { id: 'b1', amount: 1000, status: 'paid' },
      { id: 'b2', amount: 250, status: 'approved' },
    ],
  });
  eq(s.paid, 100000, 'uhradené sa ráta zvlášť');
  eq(s.billed, 125000, 'vyfakturované je oboje');
  eq(s.owed, 25000, 'dlhujeme len tú neuhradenú');
}

// Koľko z odrobeného ešte nevyfakturoval.
{
  const s = A.summary({
    worker: WORKER, assignments: ASG,
    timesheets: [ts('2026-09-01', 50)],          // 50 h × 20 € = 1000 €
    bills: [{ id: 'b1', amount: 600, status: 'approved' }],
  });
  eq(s.earned, 100000, 'odrobil za 1000 €');
  eq(s.notBilledYet, 40000, 'a 400 € ešte nevyfakturoval');
}
{
  // Fakturoval viac, než sedí z hodín — záporné číslo je dôvod pozrieť sa.
  const s = A.summary({
    worker: WORKER, assignments: ASG,
    timesheets: [ts('2026-09-01', 10)],           // 200 €
    bills: [{ id: 'b1', amount: 600, status: 'approved' }],
  });
  eq(s.notBilledYet, -40000, 'fakturoval o 400 € viac, než sedí z hodín');
}

// Prázdny človek nespadne.
{
  const s = A.summary({ worker: WORKER });
  eq([s.hours, s.earned, s.owed, s.advancesOpen], [0, 0, 0, 0],
    'bez dát sú to nuly, nie NaN');
}

// ── Vyrovnanie konkrétnej faktúry ───────────────────────────────────────────
{
  const advances = [
    { id: 'z1', amount: 300, paid_on: '2026-09-05' },
    { id: 'z2', amount: 200, paid_on: '2026-09-01' },
  ];
  const r = A.settlement({ amount: 600 }, advances);
  eq(r.apply.map(a => a.id), ['z2', 'z1'], 'staršia záloha sa odpočíta prvá');
  eq(r.applied, 50000, 'odpočíta sa 500 €');
  eq(r.rest, 10000, 'a 100 € sa vyplatí');
}
{
  // Záloha väčšia než faktúra sa neodpočíta čiastočne — zostane na ďalšiu.
  const r = A.settlement({ amount: 250 }, [{ id: 'z1', amount: 400, paid_on: '2026-09-01' }]);
  eq(r.apply.length, 0, 'záloha väčšia než faktúra sa neodpočíta');
  eq(r.rest, 25000, 'faktúra sa vyplatí celá');
}
{
  const r = A.settlement({ amount: 500 }, [
    { id: 'z1', amount: 500, paid_on: '2026-09-01' },
  ]);
  eq(r.applied, 50000, 'záloha presne na sumu faktúry sa odpočíta celá');
  eq(r.rest, 0, 'a vyplácať sa nemá čo');
}
{
  const r = A.settlement({ amount: 900 }, [
    { id: 'z1', amount: 300, paid_on: '2026-09-01', voided_at: '2026-09-02' },
    { id: 'z2', amount: 300, paid_on: '2026-09-03', settled_at: '2026-09-10' },
    { id: 'z3', amount: 300, paid_on: '2026-09-04' },
  ]);
  eq(r.apply.map(a => a.id), ['z3'],
    'zrušená ani už vyrovnaná záloha sa druhý raz neodpočíta');
}

// ── Veta na kartu ───────────────────────────────────────────────────────────
{
  eq(A.headline(A.summary({ worker: WORKER })).tone, 'ok', 'bez pohybu je pokoj');
  const pay = A.headline(A.summary({
    worker: WORKER,
    bills: [{ amount: 500, status: 'approved' }],
    advances: [{ id: 'z', amount: 100, paid_on: '2026-09-01' }],
  }));
  eq(pay.tone, 'warn', 'keď je čo vyplatiť, je to upozornenie');
  ok(/400,00/.test(pay.text), 'a veta povie koľko po odpočte zálohy');
  ok(/zálohy/i.test(pay.text), 'a spomenie, že sa odpočítala záloha');

  const disp = A.headline(A.summary({
    worker: WORKER, bills: [{ amount: 500, status: 'disputed' }],
  }));
  eq(disp.tone, 'bad', 'spor je vážnejší než výplata');

  const clean = A.headline(A.summary({
    worker: WORKER, bills: [{ amount: 500, status: 'paid' }],
  }));
  eq(clean.tone, 'ok', 'všetko uhradené = vyrovnané');
  ok(/nedlhujeme/.test(clean.text), 'a povie to po ľudsky');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
