// ============================================================================
// Testy peňazí: kde čakajú a koľko sa dá minúť
// Spustenie:  node app/lib/money/position.test.js
// ============================================================================
// Toto je obrazovka, podľa ktorej sa rozhodne, či sa naberú ďalší ľudia a či
// sa kúpi materiál. Keď číslo klame, klame smerom k míňaniu — preto sa tu
// stráži hlavne to, čo sa do voľných peňazí **nesmie** započítať:
//
//   * faktúra po splatnosti (mala prísť a neprišla),
//   * odrobené hodiny bez uzavretého obdobia (nemajú termín),
//   * zrážka §48b (vráti sa, ale nie tento mesiac).
//
// A druhá vec: „voľné" je najnižší bod výhľadu, nie zostatok na konci.
// Kto sa pozerá na koniec, minie to, čo bude v treťom týždni chýbať.
// ============================================================================
global.window = global;
const M = require('../money.js');
const P = require('./position.js');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; return; }
  failed++;
  console.error(`  ✗ ${msg}\n      čakal som: ${e}\n      dostal som: ${a}`);
}
function ok(cond, msg) { eq(!!cond, true, msg); }
const eur = (n) => M.toCents(n);

const TODAY = '2026-10-06';

const X = {
  today: TODAY,
  subcontracts: [
    { id: 's1', title: 'Wohnpark Feuerbach', status: 'active', charge_rate: '34' },
    { id: 's2', title: 'Stará hala', status: 'completed', charge_rate: '30' },
  ],
  assignments: [
    { id: 'a1', subcontract_id: 's1', worker_id: 'w1', status: 'active', charge_rate: '34' },
    { id: 'a2', subcontract_id: 's2', worker_id: 'w2', status: 'active', charge_rate: '30' },
  ],
  timesheets: [
    { id: 't1', assignment_id: 'a1', hours: 8, work_date: '2026-10-01', period_id: null },
    { id: 't2', assignment_id: 'a1', hours: 2, work_date: '2026-10-02', period_id: null },
    // V uzavretom období — už je to inde v reťazci.
    { id: 't3', assignment_id: 'a1', hours: 100, work_date: '2026-08-01', period_id: 'p1' },
    // Na ukončenej zákazke — do bežiacej práce nepatrí.
    { id: 't4', assignment_id: 'a2', hours: 50, work_date: '2026-10-01', period_id: null },
  ],
  periods: [
    { id: 'p1', subcontract_id: 's1', status: 'closed', period_from: '2026-08-01',
      period_to: '2026-08-31', amount_charged: '3400' },
    { id: 'p2', subcontract_id: 's1', status: 'open', period_from: '2026-10-01',
      period_to: '2026-10-31', amount_charged: '0' },
  ],
  invoices: [
    { id: 'i1', invoice_number: '2026020', status: 'pending_approval', total: '1000',
      amount_net: '850', withholding_amount: '150', due_date: '2026-11-05', partner_id: 'pt1' },
    { id: 'i2', invoice_number: '2026021', status: 'sent', total: '2000',
      amount_net: '1700', withholding_amount: '300', due_date: '2026-10-20', partner_id: 'pt1' },
    { id: 'i3', invoice_number: '2026022', status: 'sent', total: '500',
      amount_net: '500', withholding_amount: '0', due_date: '2026-09-01', partner_id: 'pt2' },
    { id: 'i4', invoice_number: '2026019', status: 'paid', total: '9000',
      amount_net: '9000', due_date: '2026-09-15', partner_id: 'pt1' },
  ],
  costs: [
    { id: 'c1', description: 'Ubytovanie 10/2026', amount: '800', cost_date: '2026-10-01',
      rebillable: true, rebilled_invoice_id: null, subcontract_id: 's1' },
    { id: 'c2', description: 'Nafta', amount: '120', cost_date: '2026-10-02',
      rebillable: true, rebilled_invoice_id: 'i2', subcontract_id: 's1' },
    { id: 'c3', description: 'Réžia', amount: '300', cost_date: '2026-10-02',
      rebillable: false, subcontract_id: 's1' },
  ],
  partnerName: (id) => ({ pt1: 'Vogel GmbH', pt2: 'Hartmann KG' }[id] || null),
  siteName: (id) => ({ s1: 'Wohnpark Feuerbach', s2: 'Stará hala' }[id] || null),
};

const st = (key) => P.stages(X).find(s => s.key === key);

// ── Štádiá ──────────────────────────────────────────────────────────────────
console.log('Kde čakajú peniaze');
{
  const all = P.stages(X);
  eq(all.length, P.STAGES.length, 'každé štádium sa vráti, aj prázdne');
  eq(all.map(s => s.key),
    ['unbilled', 'toinvoice', 'approval', 'due', 'overdue', 'withheld', 'tied'],
    'a v poradí reťazca — čo sa dá pohnúť vlastnou rukou, je hore');

  // 1. Odrobené, obdobie otvorené: 10 h × 34 € na bežiacej zákazke.
  const u = st('unbilled');
  eq(u.cents, eur(340), '10 hodín po 34 € — hodiny z ukončenej zákazky ani z uzavretého obdobia sa nerátajú');
  eq(u.count, 1, 'zoskupené podľa zákazky, nie po riadkoch výkazu');
  eq(u.rows[0].title, 'Wohnpark Feuerbach', 'a je vidieť, ktorej zákazky sa to týka');
  eq(u.rows[0].sub, '10 h', 'aj koľko hodín za tým je');
  eq(u.dated, false, 'nemá termín — do týždenného výhľadu nepatrí');

  // 2. Uzavreté obdobie bez faktúry.
  const f = st('toinvoice');
  eq(f.cents, eur(3400), 'uzavreté obdobie, z ktorého ešte nie je faktúra');
  eq(f.count, 1, 'otvorené obdobie sa sem neráta');
  ok(/Vystaviť faktúru/.test(f.todo), 'a je napísané, čo s tým');

  // 3. Na schválenie — celá suma, lebo ešte nie je čo zrážať.
  eq(st('approval').cents, eur(1000), 'faktúra na schválenie');
  eq(st('approval').count, 1, 'jedna');

  // 4. V splatnosti — to, čo naozaj príde na účet, teda po zrážke.
  const d = st('due');
  eq(d.cents, eur(1700), 'v splatnosti sa počíta suma po zrážke §48b, nie fakturovaná');
  eq(d.count, 1, 'faktúra na schválenie sem nepatrí — ešte neodišla');

  // 5. Po splatnosti.
  const o = st('overdue');
  eq(o.cents, eur(500), 'po splatnosti');
  eq(o.state, 'bad', 'a je to červené');
  ok(/mešká 35 dní/.test(o.rows[0].sub), 'povie sa, o koľko mešká');
  ok(/Zavolať/.test(o.todo), 'aj čo s tým');

  // 6. Zrážka — len z otvorených faktúr. Zo zaplatenej sa už nečaká nič.
  eq(st('withheld').cents, eur(450), 'zrážka z faktúry na schválenie aj z odoslanej');
  eq(st('withheld').count, 2, 'zo zaplatenej faktúry sa už nič nečaká');

  // 7. Viazne — refakturovateľné, ktoré ešte nie sú na faktúre.
  const t = st('tied');
  eq(t.cents, eur(800), 'náklad, ktorý už je na faktúre, neviazne');
  eq(t.count, 1, 'a nerefakturovateľná réžia sem nepatrí vôbec');
}

// ── Súhrn ───────────────────────────────────────────────────────────────────
console.log('Súhrn');
{
  const s = P.summary(P.stages(X));
  eq(s.ours, eur(340 + 3400 + 1000),
    '„stojí na nás" je to, čo sa dá pohnúť bez toho, aby niekto iný niečo spravil');
  eq(s.oursCount, 3, 'a koľko krokov to je');
  eq(s.theirs, eur(1700 + 500), '„stojí na nich" sú odoslané faktúry');
  eq(s.overdue, eur(500), 'po splatnosti zvlášť');
  eq(s.withheld, eur(450), 'zrážka zvlášť — vráti sa, ale nie teraz');
  eq(s.tied, eur(800), 'viazne zvlášť');
  eq(s.total, eur(340 + 3400 + 1000 + 1700 + 500 + 450 + 800), 'a spolu');

  const prazdny = P.summary(P.stages({}));
  eq(prazdny.total, 0, 'prázdna appka nespadne');
  eq(P.stages({}).length, P.STAGES.length, 'a vráti všetky štádiá');
}

// ── Koľko sa dá minúť ───────────────────────────────────────────────────────
console.log('Koľko sa dá minúť');
{
  const items = [
    // Príde o dva týždne.
    { expected_on: '2026-10-20', amount: '1700', source: 'invoice' },
    // Malo prísť pred mesiacom — nespoľahlivé.
    { expected_on: '2026-09-01', amount: '500', source: 'invoice' },
    // Odíde o týždeň.
    { expected_on: '2026-10-12', amount: '-2000', source: 'bill' },
    // Odíde o tri týždne.
    { expected_on: '2026-10-27', amount: '-900', source: 'cost' },
  ];
  const sp = P.spendable({ today: TODAY, balance: eur(3000), items, weeks: 5,
    reserve: eur(1000) });

  eq(sp.rows.length, 5, 'päť týždňov');
  eq(sp.rows[0].unreliable, eur(500),
    'faktúra po splatnosti je zvlášť — do zostatku sa nepočíta');
  // Prvý týždeň je 6.–12. 10., takže záväzok splatný 12. 10. doň ešte spadá.
  eq(sp.rows[0].balance, eur(1000), 'prvý týždeň: odišlo 2 000 živnostníkovi');
  eq(sp.rows[1].balance, eur(1000), 'druhý: nič');
  eq(sp.rows[2].balance, eur(2700), 'tretí: prišlo 1 700 z faktúry');
  eq(sp.rows[3].balance, eur(1800), 'štvrtý: odišlo 900 na náklady');
  eq(sp.worst.week, 1, 'najnižší bod je hneď prvý týždeň');

  // Toto je to číslo, kvôli ktorému to celé je.
  eq(sp.free, 0, 'minúť sa dá len po najnižší bod mínus rezerva — nie po koniec');
  ok(sp.end > sp.free, 'zostatok na konci je vyšší, a práve preto sa naň nedá pozerať');

  const v = P.verdict(sp);
  eq(v.tone, 'watch', 'tesné, ale nie záporné');
  ok(/0,00/.test(v.text), 'a veta povie koľko');
  ok(/1\. týždni/.test(v.text), 'aj kedy to bude najhoršie');
}

// ── Keď to nevyjde ──────────────────────────────────────────────────────────
console.log('Keď to nevyjde');
{
  const sp = P.spendable({ today: TODAY, balance: eur(500), weeks: 4, reserve: eur(1000),
    items: [{ expected_on: '2026-10-12', amount: '-2000', source: 'bill' }] });
  eq(sp.rows[0].balance, eur(-1500), 'účet ide pod nulu');
  ok(sp.free < 0, 'voľné nie je nič');
  const v = P.verdict(sp);
  eq(v.tone, 'bad', 'a je to červené');
  ok(/nevyjde/.test(v.text), 'veta to povie rovno');
  ok(/chýba/.test(v.text), 'aj koľko chýba');
  eq(v.week, 1, 'a v ktorom týždni');
}

// ── Opatrnosť ───────────────────────────────────────────────────────────────
// Každé z týchto pravidiel existuje preto, aby číslo neklamalo smerom
// k míňaniu. Keby sa niektoré stratilo, appka by povedala, že peniaze sú.
console.log('Opatrnosť');
{
  const zaklad = { today: TODAY, balance: eur(1000), weeks: 4, reserve: 0 };

  const poSplatnosti = P.spendable({ ...zaklad,
    items: [{ expected_on: '2026-08-01', amount: '5000', source: 'invoice' }] });
  eq(poSplatnosti.free, eur(1000),
    'faktúra po splatnosti nezvýši, koľko sa dá minúť');
  eq(poSplatnosti.unreliable, eur(5000), 'ale je vidieť, že tam je');

  const dlhPoSplatnosti = P.spendable({ ...zaklad,
    items: [{ expected_on: '2026-08-01', amount: '-400', source: 'bill' }] });
  eq(dlhPoSplatnosti.free, eur(600),
    'dlh po splatnosti sa naopak počíta — nezmizne tým, že je starý');

  const zaHorizontom = P.spendable({ ...zaklad,
    items: [{ expected_on: '2027-01-01', amount: '9000', source: 'invoice' }] });
  eq(zaHorizontom.free, eur(1000), 'čo príde za horizontom, sa do voľných nepočíta');

  const bezTerminu = P.spendable({ ...zaklad,
    items: [{ expected_on: null, amount: '9000', source: 'invoice' }] });
  eq(bezTerminu.free, eur(1000), 'ani to, čo termín nemá');

  // Rezerva z Nastavení je spodná hranica, pod ktorú sa nejde.
  const sRezervou = P.spendable({ ...zaklad, reserve: eur(400) });
  eq(sRezervou.free, eur(600), 'rezerva sa odráta');
}

// ── Odolnosť ────────────────────────────────────────────────────────────────
console.log('Odolnosť');
{
  eq(P.spendable({}).rows.length, 8, 'bez vstupu osem týždňov');
  eq(P.spendable({ today: TODAY, items: null }).free, 0, 'chýbajúce položky nespadnú');
  eq(P.spendable({ today: TODAY, balance: eur(100),
    items: [{ expected_on: '2026-10-07', amount: 'nezmysel' }] }).rows[0].balance, eur(100),
    'rozbitá suma z databázy sa počíta ako nula, nie ako NaN');
  eq(P.stages({ timesheets: null, invoices: null }).every(s => s.cents === 0), true,
    'chýbajúce polia sú prázdny zoznam');
  eq(P.verdict(null).text, '', 'verdikt bez dát je prázdny, nie vymyslený');

  // Zmluva knižnice — každé štádium musí vedieť povedať, čo to je.
  for (const s of P.STAGES) {
    ok(s.key && s.label && s.lead, `${s.key}: má názov aj vysvetlenie`);
    ok(s.lead.length > 40, `${s.key}: vysvetlenie je veta, nie nálepka`);
    ok(typeof s.dated === 'boolean', `${s.key}: vie, či má termín`);
    ok(typeof s.rows === 'function', `${s.key}: vie poskladať riadky`);
  }
  const kluce = P.STAGES.map(s => s.key);
  eq(kluce.length, new Set(kluce).size, 'kľúče sa neopakujú');
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
