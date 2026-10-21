// ============================================================================
// Testy otázok v hovore
// Spustenie:  node app/lib/recruiting/callq.test.js
// ============================================================================
global.window = global;
const Q = require('./callq.js');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg, detail) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${detail ? `\n    ${detail}` : ''}`); }
}

console.log('Otázky v hovore');

const CHIPS = [
  { id: 'c1', segment: 'intro', label: 'Má aktívnu živnosť', polarity: 'plus' },
  { id: 'c2', segment: 'intro', label: 'Nemá a nechce živnosť', polarity: 'flag' },
  { id: 'c3', segment: 'intro', label: 'Živnosť si založí', polarity: 'neutral' },
  { id: 'c4', segment: 'intro', label: 'Je nadšený z pracovného ponuku', polarity: 'plus' },
  { id: 'c5', segment: 'intro', label: 'Je to partia', polarity: 'neutral' },
  { id: 'c6', segment: 'legal', label: 'Vie, čo je A1', polarity: 'plus' },
  { id: 'c7', segment: 'money', label: 'Pýtal zálohu vopred', polarity: 'flag' },
];

// ── Každá otázka má 2–3 odpovede ────────────────────────────────────────────
{
  for (const [seg, list] of Object.entries(Q.QUESTIONS)) {
    for (const q of list) {
      ok(q.answers.length >= 2 && q.answers.length <= 3, `${seg}/${q.key}: 2–3 odpovede`);
      ok(/\?|\.$/.test(q.q), `${seg}/${q.key}: je to otázka, ktorá sa dá povedať nahlas`);
      // Kandidátom vykáme. („si predstavujete" je zvratné „si", nie tykanie.)
      ok(!/\b(máš|vieš|ti|ideš|hovoríš|pošleš|dopravíš|chceš|potrebuješ|poznáš|predstavuješ|robil si|si robil)\b/i.test(q.q),
        `${seg}/${q.key}: vykáme`, q.q);
    }
  }
  const kluce = Object.values(Q.QUESTIONS).flat().map(q => q.key);
  eq(kluce.length, new Set(kluce).size, 'kľúče otázok sa neopakujú');
  eq(Q.otazky('quick').length, Q.QUICK.length, 'krátky hovor má všetky svoje otázky');
}

// ── Odpovede sa naviažu na polia podľa názvu ────────────────────────────────
{
  const g = Q.group('intro', CHIPS, CHIPS.filter(c => c.segment === 'intro'));
  const z = g.questions.find(q => q.key === 'zivnost');
  eq(z.answers.map(a => a.chip && a.chip.id), ['c1', 'c3', 'c2'], 'živnosť: tri odpovede, tri polia');
  const p = g.questions.find(q => q.key === 'partia');
  eq(p.answers.map(a => a.chip && a.chip.id), [null, 'c5'], '„Sám" nemá pole, „S partiou" áno');
  eq(g.rest.map(c => c.id), ['c4'], 'čo do otázky nepatrí, ostane ako postreh');

  const bezPola = Q.group('intro', [], []);
  ok(bezPola.questions.every(q => q.answers.every(a => a.chip === null)),
    'keď pole v databáze nie je, odpoveď sa dá vybrať aj tak');

  const quick = Q.group('quick', CHIPS, [CHIPS[5], CHIPS[6]]);
  eq(quick.questions.find(q => q.key === 'a1').answers[0].chip.id, 'c6', 'krátky hovor berie polia zo všetkých častí');
  eq(quick.rest, [], 'a postreh, ktorý je v otázke, sa neopakuje');
}

// ── Vybraná odpoveď a poznámka ──────────────────────────────────────────────
{
  const g = Q.group('intro', CHIPS);
  const z = g.questions.find(q => q.key === 'zivnost');
  eq(Q.selected(z, new Set(['c2'])), 2, 'zaškrtnuté pole = vybraná odpoveď');
  eq(Q.selected(z, new Set()), null, 'nič zaškrtnuté = nič vybrané');

  const ans = new Map([['partia', { idx: 0 }], ['zivnost', { idx: 0 }], ['nastup', { other: 'od 1. decembra' }]]);
  eq(Q.noteLines(g.questions, ans), ['Pôjdete sám, alebo s partiou? — Sám',
    'Kedy viete nastúpiť? — od 1. decembra'],
    'do poznámky ide odpoveď bez poľa a vlastné „iné" — nie to, čo je už pole');
  eq(Q.noteLines(g.questions, new Map()), [], 'bez odpovedí prázdne');
}

// ── Odborné otázky z databázy ───────────────────────────────────────────────
{
  const db = { id: 'q1', question_sk: 'Aký systém sanačných omietok ste spracovávali (WTA) a aký bol postup vrstiev?',
    good_answer: 'Spritzbewurf, Porengrundputz, Sanierputz', red_flag_answer: 'Nepozná WTA', weight: 3 };
  const q = Q.fromDbQuestion(db);
  eq(q.key, 'db:q1', 'kľúč sa nebije s pevnými otázkami');
  eq(q.answers.map(a => a.label), ['Odpovedal dobre', 'Čiastočne', 'Zle / nevie'], 'tri hodnotenia');
  ok(q.answers.every(a => a.chip === null), 'bez poľa — ide do poznámky aj do tabuľky odpovedí');
  eq([q.good, q.bad], ['Spritzbewurf, Porengrundputz, Sanierputz', 'Nepozná WTA'], 'čo chceme počuť je pri otázke');

  const lahka = Q.fromDbQuestion({ id: 'q2', question_sk: 'Robíte aj ručne?', weight: 1 });
  const ans = new Map([['db:q1', { idx: 0 }], ['db:q2', { idx: 2 }]]);
  eq(Q.ratingItems([q, lahka, q], ans).map(x => [x.polarity, x.weight]), [['plus', 3], ['minus', 1]],
    'dobrá kľúčová = plus 3, zlá bežná = mínus 1; otázka sa nezráta dvakrát');
  eq(Q.ratingItems([q], new Map([['db:q1', { idx: 1 }]]))[0].polarity, 'neutral', 'čiastočne skóre nehýbe');
  eq(Q.ratingItems([q], new Map([['db:q1', { other: 'neviem' }]])), [], 'iné sa do skóre neráta');
  ok(Q.ratingItems([q], ans)[0].label.length <= 61, 'do zhrnutia ide krátky názov');

  eq(Q.answerRow(q, { idx: 2 }), { question_id: 'q1', answer_text: 'Zle / nevie', rating: 0, flagged: true },
    'zlá odpoveď na kľúčovú otázku je varovanie');
  eq(Q.answerRow(lahka, { idx: 2 }).flagged, false, 'na bežnú nie');
  eq(Q.answerRow(q, { other: ' len vápenná ' }), { question_id: 'q1', answer_text: 'len vápenná', rating: null, flagged: false },
    'vlastná odpoveď sa zapíše slovami');
  eq(Q.answerRow(q, { other: '' }), null, 'prázdne iné sa nezapisuje');
  eq(Q.answerRow({ key: 'zivnost', answers: [] }, { idx: 0 }), null, 'pevné otázky sem nepatria');

  eq(Q.fromRow({ rating: 3 }), { idx: 0 }, 'staré „presné" je dobre');
  eq(Q.fromRow({ rating: 1 }), { idx: 1 }, 'slabé je čiastočne');
  eq(Q.fromRow({ rating: 0 }), { idx: 2 }, 'nevie je zle');
  eq(Q.fromRow({ rating: null, answer_text: 'iba ručne' }), { other: 'iba ručne' }, 'slovami ostane slovami');

  eq(Q.noteLines([q], new Map([['db:q1', { idx: 0 }]])),
    ['Aký systém sanačných omietok ste spracovávali (WTA) a aký bol postup vrstiev? — Odpovedal dobre'],
    'hodnotenie ide aj do poznámky k hovoru');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
