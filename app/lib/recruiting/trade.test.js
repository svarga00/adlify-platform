// ============================================================================
// Testy lekcie o remesle
// Spustenie:  node app/lib/recruiting/trade.test.js
// ============================================================================
// Dve veci sú dôležitejšie než ostatné:
//
//   • **Príručka nesmie o sebe tvrdiť, že je hotová, keď nie je.** Náborár,
//     ktorý si otvorí remeslo a nevidí, že mu chýbajú otázky, pôjde volať
//     s tým, čo tam je — a nebude vedieť, že mu niečo chýba.
//   • **Do skúšania sa nesmie dostať otázka bez odpovede.** Ukázať otázku
//     a nemať čím odpoveď porovnať znamená, že si človek zapamätá vlastný
//     dohad ako správnu odpoveď.
// ============================================================================
global.window = global;
const T = require('./trade');

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

const PLNE = {
  key: 'trockenbau', name_sk: 'Sadrokartonár',
  summary: 'Najžiadanejšie remeslo na nemeckých stavbách.',
  day_in_life: 'Ráno sa vymeria a vyznačí čiara na podlahe.',
  vocab: [{ de: 'Ständerwerk', sk: 'nosný rošt', note: 'Kostra priečky.' },
    { de: 'Beplankung', sk: 'opláštenie' }],
  work_scope: ['montáž priečok'], materials: ['GKB'], tools: ['aku skrutkovač'],
  standards: ['Q2 — bežný štandard'], daily_output: '25–35 m² za deň',
  certificates: ['živnostenský list'], red_flags: ['nevie rozteč profilov'],
  pay_note: 'Najžiadanejšie, teda najtvrdšia konkurencia.',
};
const OTAZKY = (n, trade = 'trockenbau') => Array.from({ length: n }, (_, i) => ({
  id: `q${i}`, trade_key: trade, question_sk: `Otázka ${i}`,
  good_answer: `Odpoveď ${i}`, red_flag_answer: 'Zbystri', kind: 'knowledge',
  weight: 1, sort_order: i,
}));

console.log('Lekcia o remesle');

// ── Poradie lekcie ──────────────────────────────────────────────────────────
// Nie podľa poradia stĺpcov v tabuľke, ale podľa toho, ako to človek
// potrebuje vedieť: najprv čo to je, potom slovíčka, až nakoniec peniaze.
{
  const l = T.lesson(PLNE);
  eq(l.map(s => s.key),
    ['summary', 'day', 'vocab', 'scope', 'materials', 'tools', 'standards',
      'output', 'certificates', 'red_flags', 'pay'],
    'lekcia ide v poradí na čítanie, nie v poradí stĺpcov');
  ok(l[0].title === 'Čo to je', 'začína sa tým, čo to vôbec je');
  ok(l[l.length - 1].key === 'pay', 'a peniaze sú až na konci');

  // Prázdna sekcia sa nevykreslí — polovica obrazovky s nadpismi bez obsahu
  // vyzerá ako rozbitá appka.
  const chudobne = { key: 'x', summary: 'Len veta.' };
  eq(T.lesson(chudobne).map(s => s.key), ['summary'],
    'prázdne sekcie sa do lekcie nedostanú');
  eq(T.lesson(null), [], 'chýbajúce remeslo nezhodí');
}

// ── Pomlčka nie je obsah ────────────────────────────────────────────────────
// V databáze mal pomocník v materiáloch napísané „—". Zoznam s pomlčkou
// vyzerá ako vyplnený, ale nepovie nič — a práve preto sa to musí počítať
// ako diera.
{
  const s = T.SECTIONS.find(x => x.key === 'materials');
  ok(!T.filled({ materials: ['—'] }, s), 'pomlčka sa neráta ako vyplnené');
  ok(!T.filled({ materials: ['-', ' '] }, s), 'ani pomlčka s medzerou');
  ok(T.filled({ materials: ['GKB'] }, s), 'skutočný materiál áno');
  ok(!T.filled({}, s), 'chýbajúce pole tiež nie');
}

// ── Slovíčka z jsonb, ktorým sa nedá veriť ──────────────────────────────────
{
  eq(T.vocabOf(PLNE).map(v => v.de), ['Ständerwerk', 'Beplankung'],
    'slovíčka sa prečítajú');
  eq(T.vocabOf({ vocab: '[{"de":"Dübel","sk":"kotva"}]' }).map(v => v.de), ['Dübel'],
    'aj keď prídu ako text');
  eq(T.vocabOf({ vocab: 'toto nie je json' }), [], 'pokazený json nezhodí obrazovku');
  eq(T.vocabOf({ vocab: ['Rigips'] })[0], { de: 'Rigips', sk: '', note: '' },
    'holý reťazec sa doplní na tvar');
  eq(T.vocabOf({ vocab: [null, { sk: 'bez nemčiny' }] }), [],
    'slovíčko bez nemeckého výrazu nemá v zozname čo robiť');
  eq(T.vocabOf(null), [], 'chýbajúce remeslo nezhodí');
}

// ── Čo chýba, musí byť vidieť ───────────────────────────────────────────────
{
  const hotove = T.completeness(PLNE, OTAZKY(8));
  eq(hotove.missing, [], 'plná príručka nemá čo doplniť');
  eq(hotove.pct, 100, 'a je na sto percent');
  ok(hotove.ready, 'a je označená za hotovú');
  ok(T.stateSentence(hotove).includes('hotová'), 'povie sa to vetou');

  // Toto je stav, v akom bola väčšina remesiel: text je, otázky nie.
  const bezOtazok = T.completeness(PLNE, []);
  ok(!bezOtazok.ready, 'bez otázok nie je príručka hotová');
  ok(bezOtazok.missing.includes('Odborné otázky'), 'a je to napísané');
  ok(T.stateSentence(bezOtazok).includes('nedá odskúšať'),
    'veta povie, čo to znamená — nie percento');

  const malo = T.completeness(PLNE, OTAZKY(3));
  ok(!malo.ready, 'tri otázky sú málo');
  ok(malo.missing.some(m => m.includes('3 z 5')), 'a povie sa, koľko ich treba');
  ok(T.stateSentence(malo).includes('málo'), 'aj vetou');

  // Otázky iného remesla sa nesmú rátať — inak by sadrokartonár „mal"
  // otázky elektrikára.
  eq(T.completeness(PLNE, OTAZKY(8, 'elektrikar')).questions, 0,
    'otázky iného remesla sa nerátajú');
  // Vypnutá otázka tiež nie.
  const vypnute = OTAZKY(8).map(q => ({ ...q, active: false }));
  eq(T.completeness(PLNE, vypnute).questions, 0, 'ani vypnuté otázky');

  const prazdne = T.completeness({ key: 'x' }, []);
  eq(prazdne.pct, 0, 'prázdne remeslo má nula percent');
  ok(prazdne.missing.length >= 11, 'a vymenuje sa všetko, čo chýba');
}

// ── Do skúšania len to, čo má odpoveď ───────────────────────────────────────
{
  const zmes = [
    ...OTAZKY(2),
    { id: 'x1', trade_key: 'trockenbau', question_sk: 'Bez odpovede?', good_answer: '' },
    { id: 'x2', trade_key: 'trockenbau', question_sk: '', good_answer: 'Odpoveď bez otázky' },
    { id: 'x3', trade_key: 'trockenbau', question_sk: 'Vypnutá?', good_answer: 'Áno',
      active: false },
  ];
  const d = T.deck(zmes, { tradeKey: 'trockenbau' });
  eq(d.map(q => q.id), ['q0', 'q1'],
    'otázka bez odpovede, bez otázky a vypnutá sa do skúšania nedostanú');

  // Ťažšie otázky idú prvé — kto sa doučí dve, nech sa doučí tie, na ktorých
  // záleží.
  const vahy = [
    { id: 'a', trade_key: 't', question_sk: 'A', good_answer: 'a', weight: 1 },
    { id: 'b', trade_key: 't', question_sk: 'B', good_answer: 'b', weight: 3 },
    { id: 'c', trade_key: 't', question_sk: 'C', good_answer: 'c', weight: 2 },
  ];
  eq(T.deck(vahy).map(q => q.id), ['b', 'c', 'a'], 'dôležitejšie otázky idú prvé');
  eq(T.deck(vahy, { limit: 2 }).map(q => q.id), ['b', 'c'], 'dá sa vziať len pár');
  eq(T.deck(vahy, { kinds: ['legal'] }), [], 'dá sa vybrať druh otázky');
  eq(T.deck(null), [], 'bez otázok to nezhodí');
}

// ── Náhodné poradie sa musí dať overiť ──────────────────────────────────────
{
  const list = [1, 2, 3, 4, 5];
  // Pevná „náhoda" — náhoda, ktorá sa nedá zopakovať, sa nedá ani otestovať.
  let i = 0;
  const rnd = () => [0.1, 0.9, 0.3, 0.7][i++ % 4];
  const a = T.shuffle(list, rnd);
  eq(a.slice().sort(), list, 'zamiešaním sa nič nestratí ani nepribudne');
  ok(a.join() !== list.join(), 'a poradie sa naozaj zmení');
  eq(T.shuffle([]), [], 'prázdny zoznam nezhodí');
  eq(T.shuffle(null), [], 'ani chýbajúci');
}

// ── Kde som v skúšaní ───────────────────────────────────────────────────────
{
  eq(T.progress(8, 0), { index: 0, total: 8, left: 8, pct: 0 }, 'na začiatku');
  eq(T.progress(8, 4), { index: 4, total: 8, left: 4, pct: 50 }, 'v polovici');
  eq(T.progress(8, 8), { index: 8, total: 8, left: 0, pct: 100 }, 'na konci');
  eq(T.progress(8, 99).index, 8, 'za koniec sa nedá dostať');
  eq(T.progress(0, 0), { index: 0, total: 0, left: 0, pct: 0 }, 'prázdny balíček');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
