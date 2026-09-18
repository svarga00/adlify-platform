// ============================================================================
// Testy partií
// Spustenie:  node danubra/lib/staffing/crews.test.js
// ============================================================================
global.window = global;
const C = require('./crews');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

const TODAY = '2026-09-17';
const m = (worker_id, joined_at, left_at = null, role = 'member') =>
  ({ worker_id, joined_at, left_at, role });

console.log('Partie');

// ── Kto je v partii a kedy ──────────────────────────────────────────────────
{
  const members = [
    m('w1', '2026-01-01', null, 'leader'),
    m('w2', '2026-01-01'),
    m('w3', '2026-03-01', '2026-06-01'),      // odišiel
    m('w3', '2026-08-01'),                     // a vrátil sa
    m('w4', '2026-12-01'),                     // nastúpi až neskôr
  ];

  eq(C.activeMembers(members).map(x => x.worker_id), ['w1', 'w2', 'w3', 'w4'],
    'aktívni sú tí, čo neodišli');
  eq(C.membersOn(members, TODAY).map(x => x.worker_id), ['w1', 'w2', 'w3'],
    'k dnešku bez toho, kto ešte nenastúpil');
  eq(C.membersOn(members, '2026-04-01').map(x => x.worker_id), ['w1', 'w2', 'w3'],
    'v apríli bol w3 prvýkrát v partii');
  eq(C.membersOn(members, '2026-07-01').map(x => x.worker_id), ['w1', 'w2'],
    'v júli bol w3 preč');
  eq(C.membersOn(members, '2026-06-01').map(x => x.worker_id), ['w1', 'w2'],
    'deň odchodu už do partie nepatrí');
  eq(C.membersOn(members, '2025-01-01'), [], 'pred vznikom partie nikto');
  eq(C.membersOn(members, '2027-01-01').map(x => x.worker_id), ['w1', 'w2', 'w3', 'w4'],
    'o rok už bude aj w4');

  eq(C.leaderOf(members).worker_id, 'w1', 'predák');
  eq(C.leaderOf([m('w1', '2026-01-01')]), null, 'partia bez predáka');
  eq(C.leaderOf([]), null, 'prázdna partia nemá predáka');

  // Toto je dôvod, prečo sa členstvo nemaže: pri fakturácii treba vedieť,
  // kto bol v partii v čase, keď sa robili hodiny.
  ok(C.wasMember(members, 'w3', '2026-04-01', '2026-04-30'), 'w3 bol v partii v apríli');
  ok(!C.wasMember(members, 'w3', '2026-07-01', '2026-07-31'), 'w3 nebol v partii v júli');
  ok(C.wasMember(members, 'w3', '2026-09-01', '2026-09-30'), 'w3 je v partii v septembri');
  ok(C.wasMember(members, 'w3', '2026-05-15', '2026-08-15'), 'obdobie sa prekrýva oboma úsekmi');
  ok(!C.wasMember(members, 'w9', '2026-01-01', '2026-12-31'), 'cudzí človek nikdy');
  ok(C.wasMember(members, 'w1', '2026-05-01'), 'bez konca sa berie jeden deň');

  eq(C.activeMembers(null), [], 'chýbajúci zoznam nezhodí');
  eq(C.membersOn([null, m('w1', '2026-01-01')], TODAY).length, 1, 'prázdny riadok sa preskočí');
}

// ── Zloženie partie ─────────────────────────────────────────────────────────
{
  const workers = [
    { id: 'w1', full_name: 'Ján', german_level: 'dobry', driving_licence: true, legal_form: 'szco' },
    { id: 'w2', full_name: 'Peter', german_level: 'ziadny', driving_licence: false, legal_form: 'szco' },
  ];
  const crew = { id: 'c1', leader_worker_id: 'w1', usual_size: 2 };
  const members = [m('w1', '2026-01-01', null, 'leader'), m('w2', '2026-01-01')];

  const good = C.review({ crew, members, workers, today: TODAY });
  eq(good.ok, true, 'zdravá partia nemá prekážky');
  eq(good.warnings, [], 'ani upozornenia');
  eq(good.size, 2, 'dvaja členovia');

  // Prázdna partia
  const empty = C.review({ crew: { id: 'c1' }, members: [], workers, today: TODAY });
  eq(empty.ok, false, 'prázdna partia sa nenasadzuje');
  eq(empty.reasons.map(r => r.rule), ['crew_empty'], 'a povie sa prečo');
  eq(empty.warnings, [], 'prázdnej partii netreba vyčítať, že nemá predáka');

  // Bez predáka — upozornenie, nie prekážka. Partia sa dá poslať aj tak.
  const noLeader = C.review({ crew: { id: 'c1' }, members: [m('w1', '2026-01-01')], workers, today: TODAY });
  eq(noLeader.ok, true, 'partia bez predáka sa dá nasadiť');
  eq(noLeader.warnings.map(r => r.rule), ['crew_no_leader'], 'ale je z toho upozornenie');

  // Dvaja predáci — databáza to drží triggerom, ale dáta mohli vzniknúť inak.
  const twoLeaders = C.review({
    crew, workers, today: TODAY,
    members: [m('w1', '2026-01-01', null, 'leader'), m('w2', '2026-01-01', null, 'leader')],
  });
  eq(twoLeaders.ok, false, 'dvaja predáci sú chyba');
  ok(twoLeaders.reasons.some(r => r.rule === 'crew_two_leaders'), 'a povie sa koľko ich je');

  // Predák, ktorý v partii nie je
  const ghost = C.review({
    crew: { id: 'c1', leader_worker_id: 'w9' }, members, workers, today: TODAY,
  });
  eq(ghost.ok, false, 'predák mimo partie je chyba');
  ok(ghost.reasons.some(r => r.rule === 'crew_leader_not_member'), 'a je jasné, čo s tým');

  // Praktické veci, ktoré sa na stavbe ukážu až neskoro.
  const noGerman = C.review({
    crew, members, today: TODAY,
    workers: workers.map(w => ({ ...w, german_level: 'ziadny' })),
  });
  ok(noGerman.warnings.some(r => r.rule === 'crew_no_german'),
    'nikto po nemecky — upozornenie');
  eq(noGerman.ok, true, 'ale neblokuje to');

  const noDriver = C.review({
    crew, members, today: TODAY,
    workers: workers.map(w => ({ ...w, driving_licence: false })),
  });
  ok(noDriver.warnings.some(r => r.rule === 'crew_no_driver'), 'nikto s vodičákom');

  // Zamestnanec v partii živnostníkov — iný právny režim.
  const mixed = C.review({
    crew, members, today: TODAY,
    workers: [workers[0], { ...workers[1], legal_form: 'employee' }],
  });
  ok(mixed.warnings.some(r => r.rule === 'crew_mixed_forms'), 'miešané formy spolupráce');

  // Neúplná partia
  const small = C.review({
    crew: { ...crew, usual_size: 4 }, members, workers, today: TODAY,
  });
  ok(small.warnings.some(r => r.rule === 'crew_undersized'), 'partia je pod obvyklým počtom');
  ok(small.warnings.find(r => r.rule === 'crew_undersized').label.includes('2 z 4'),
    'a povie sa koľko z koľkých');

  eq(C.review({}).ok, false, 'bez vstupu je partia prázdna, nie v poriadku');
}

// ── Fakturácia: R5 ──────────────────────────────────────────────────────────
{
  const workers = [
    { id: 'w1', full_name: 'Ján Novák', company_name: 'Ján Novák — živnosť',
      company_id: '11111111', bank_iban: 'SK31', hourly_cost: 26.5 },
    { id: 'w2', full_name: 'Peter Malý', company_id: '22222222', bank_iban: 'SK32', hourly_cost: 24 },
    { id: 'w3', full_name: 'Eva Krátka', hourly_cost: 25 },   // bez IČO a IBAN
  ];
  const members = [m('w1', '2026-01-01', null, 'leader'), m('w2', '2026-01-01'), m('w3', '2026-01-01')];
  const plan = C.invoicePlan({ members, workers });

  // Toto je tvrdé pravidlo R5 a nesmie sa dať prepnúť.
  eq(plan.perMember, true, 'za partiu fakturuje každý sám');
  eq(plan.lines.length, 3, 'jeden riadok na člena, nie jedna faktúra za partiu');
  ok(plan.note.includes('Arbeitnehmerüberlassung'), 'a je napísané prečo');

  eq(plan.lines[0].company_name, 'Ján Novák — živnosť', 'meno na živnosti');
  eq(plan.lines[1].company_name, 'Peter Malý', 'bez mena na živnosti platí celé meno');
  eq(plan.lines.map(l => l.ready), [true, true, false], 'kto má čím fakturovať');

  const gaps = C.billingGaps({ members, workers });
  eq(gaps.map(l => l.name), ['Eva Krátka'], 'chýbajúce fakturačné údaje sa pomenujú');

  // Kto odišiel, ten nefakturuje.
  eq(C.invoicePlan({
    members: [...members.slice(0, 2), m('w3', '2026-01-01', '2026-08-01')], workers,
  }).lines.length, 2, 'bývalý člen v pláne nie je');

  eq(C.invoicePlan({ members: [], workers }).lines, [], 'prázdna partia nefakturuje');
  eq(C.invoicePlan({ members, workers: [] }).lines.length, 3,
    'neznámy človek sa nestratí, len nemá údaje');
  eq(C.invoicePlan({ members, workers: [] }).lines[0].name, '(neznámy)',
    'a je to vidieť');
}

// ── Skloňovanie ─────────────────────────────────────────────────────────────
{
  eq(C.plural(1, 'deň', 'dni', 'dní'), 'deň', 'jeden');
  eq(C.plural(3, 'deň', 'dni', 'dní'), 'dni', 'tri');
  eq(C.plural(8, 'deň', 'dni', 'dní'), 'dní', 'osem');
  eq(C.plural(0, 'deň', 'dni', 'dní'), 'dní', 'nula');
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
