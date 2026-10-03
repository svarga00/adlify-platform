// ============================================================================
// Testy zaškolenia
// Spustenie:  node app/lib/recruiting/onboarding.test.js
// ============================================================================
// Dve veci sú tu dôležitejšie než ostatné:
//
//   • **Cvičný hovor musí striedať dobré a zlé odpovede.** Keby prišlo osem
//     dobrých za sebou, človek sa naučí kývať a prejde zaškolením bez toho,
//     aby sa čokoľvek naučil. To je horšie než žiadne zaškolenie, lebo appka
//     mu potom povie, že môže volať.
//   • **Prijať zlú odpoveď a odmietnuť dobrú nie je tá istá chyba.**
//     Prehnaná prísnosť stojí jeden stratený telefonát; prehnaná dôvera stojí
//     človeka na stavbe, ktorý to nevie. Appka to má povedať rôzne.
// ============================================================================
global.window = global;
const O = require('./onboarding');

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

const otazky = (n) => Array.from({ length: n }, (_, i) => ({
  id: `q${i}`, trade_key: 'trockenbau', question_sk: `Otázka ${i}?`,
  good_answer: `Dobrá ${i}`, red_flag_answer: `Zlá ${i}`,
  weight: (i % 3) + 1, active: true,
}));
const krok = (s, key) => s.find(x => x.key === key);

console.log('Zaškolenie náborára');

// ── Cesta ───────────────────────────────────────────────────────────────────
{
  const s = O.state({});
  eq(s.map(x => x.key), ['basics', 'trade', 'quiz', 'call', 'practice'],
    'päť krokov v poradí, v akom sa učí');
  ok(s.every(x => !x.done), 'na začiatku nie je hotové nič');
  eq(O.next(s).key, 'basics', 'začína sa tým, čo vlastne robíme');
  eq(O.totalMinutes(), 60, 'celé to má zabrať hodinu');
  eq(O.progress(s).minutesLeft, 60, 'a na začiatku zostáva hodina');

  ok(O.headline(s).sub.includes('60 minút'), 'povie sa, koľko to zaberie');
  ok(O.headline(s).sub.includes('rozoznať'),
    'aj to, čo bude človek na konci vedieť — nie čo si prečíta');
}

// ── Postup ──────────────────────────────────────────────────────────────────
{
  const s = O.state({ basics: true, trade: 'trockenbau' });
  ok(krok(s, 'basics').done && krok(s, 'trade').done, 'prečítané kroky sú hotové');
  ok(krok(s, 'trade').detail.includes('trockenbau'), 'a je vidieť, čo sa učí');
  eq(O.next(s).key, 'quiz', 'ďalej sa skúša');
  eq(O.progress(s).minutesLeft, 35, 'zostáva zvyšok času');

  // Skúšanie sa nedá odkývať.
  const slabo = O.state({ basics: true, trade: 't', quiz: 55 });
  ok(!krok(slabo, 'quiz').done, '55 % v skúšaní nestačí');
  ok(krok(slabo, 'quiz').detail.includes('treba 70 %'), 'a povie sa, koľko treba');
  const dobre = O.state({ basics: true, trade: 't', quiz: 82 });
  ok(krok(dobre, 'quiz').done, '82 % stačí');
}

// ── Hotové zaškolenie ───────────────────────────────────────────────────────
{
  const s = O.state({ basics: true, trade: 't', quiz: 90, call: true, practice: 88 });
  ok(O.progress(s).ready, 'všetkých päť krokov je hotových');
  eq(O.next(s), null, 'a niet čo ďalej');
  eq(O.headline(s).title, 'Môžeš volať', 'appka to povie jednou vetou');
  ok(O.headline(s).sub.includes('príručka'),
    'a pripomenie, že príručka zostáva po ruke');

  // Cvičný hovor sa tiež nedá odkývať.
  const slabaPrax = O.state({ basics: true, trade: 't', quiz: 90, call: true, practice: 60 });
  ok(!O.progress(slabaPrax).ready, '60 % v cvičnom hovore nestačí na „môžeš volať"');
}

// ── Cvičný hovor strieda dobré a zlé ────────────────────────────────────────
// Toto je tu preto, že inak sa človek naučí kývať a prejde.
{
  const d = O.practiceDeck(otazky(10), { tradeKey: 'trockenbau', rounds: 8, rnd: () => 0 });
  eq(d.length, 8, 'osem kôl');
  const dobre = d.filter(x => x.accept).length;
  ok(Math.abs(dobre - 4) <= 1, 'polovica odpovedí je dobrá a polovica zlá',
    `dobrých ${dobre} z 8`);
  ok(d.every(x => x.question && x.answer), 'každé kolo má otázku aj odpoveď');
  ok(d.every(x => x.why), 'a vysvetlenie, prečo je to tak');
  ok(d.some(x => !x.accept && x.answer.startsWith('Zlá')),
    'zlé kolá naozaj ukazujú tú odpoveď, pri ktorej treba zbystriť');
  ok(d.every(x => x.good_answer), 'a vždy je po ruke, ako znie dobrá odpoveď');

  // Otázka bez protikladu sa do cvičenia nedostane: nedalo by sa z nej
  // spraviť zlé kolo a človek by sa naučil, že všetko je dobré.
  const polovicate = [...otazky(2), { id: 'x', question_sk: 'Bez protikladu?',
    good_answer: 'Áno', red_flag_answer: '', active: true }];
  ok(!O.practiceDeck(polovicate).some(x => x.id === 'x'),
    'otázka bez zlej odpovede sa do cvičenia nedostane');

  eq(O.practiceDeck([]), [], 'bez otázok je cvičenie prázdne');
  eq(O.practiceDeck(null), [], 'a bez vstupu to nezhodí');
  eq(O.practiceDeck(otazky(3), { rounds: 8 }).length, 3,
    'keď je otázok málo, spraví sa ich toľko, koľko ich je');
}

// ── Prijať zlú odpoveď nie je to isté ako odmietnuť dobrú ───────────────────
{
  const vsetko = [
    { accept: true, picked: true }, { accept: true, picked: true },
    { accept: false, picked: false }, { accept: false, picked: false },
  ];
  const s = O.practiceScore(vsetko);
  eq(s.pct, 100, 'všetko správne');
  ok(s.passed, 'a je to zvládnuté');
  ok(s.verdict.includes('vyrovnane'), 'a hodnotenie to povie');

  // Dôverčivý: prijíma, čo sa dá overiť. To je tá drahá chyba.
  const dovercivy = [
    { accept: false, picked: true }, { accept: false, picked: true },
    { accept: false, picked: true }, { accept: true, picked: true },
  ];
  const d = O.practiceScore(dovercivy);
  eq(d.dovercive, 3, 'spočíta sa, koľkokrát prijal zlú odpoveď');
  ok(!d.passed, 'a neprejde');
  ok(d.verdict.includes('doplňujúcu'), 'appka poradí, čo s tým');

  // Prísny: odmieta dobrých. Stojí to stratené telefonáty, nie peniaze.
  const prisny = [
    { accept: true, picked: false }, { accept: true, picked: false },
    { accept: false, picked: false }, { accept: false, picked: false },
  ];
  const p = O.practiceScore(prisny);
  eq(p.prisne, 2, 'spočíta sa aj prehnaná prísnosť');
  ok(p.verdict.includes('odrežeš'), 'a povie sa, čo to stojí');

  eq(O.practiceScore([]).pct, 0, 'bez odpovedí je to nula');
  ok(!O.practiceScore([]).passed, 'a neprejde');
  eq(O.practiceScore(null).verdict, '', 'bez vstupu sa nehodnotí');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
