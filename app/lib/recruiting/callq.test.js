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

// ── Termín ──────────────────────────────────────────────────────────────────
{
  ok(Q.isDateQ({ q: 'Kedy viete reálne nastúpiť a na ako dlho?' }), 'otázka na kedy je dátumová');
  ok(Q.isDateQ({ q: 'Dokedy vám platia doklady?' }), 'dokedy tiež');
  ok(Q.isDateQ({ q: 'Aký termín nástupu vám vyhovuje?' }), 'termín aj nástup');
  ok(!Q.isDateQ({ q: 'Máte vlastné náradie?' }), 'bežná otázka nie');
  ok(!Q.isDateQ({ q: 'Niekedy robíte aj v noci?' }), '„niekedy" nie je otázka na dátum');
  eq(Q.dateText('2026-11-03'), '3. 11. 2026', 'dátum po slovensky');

  // 22. 10. 2026 je štvrtok
  eq(Q.quickDates('2026-10-22').map(x => x.date), ['2026-10-26', '2026-11-05', '2026-11-01'],
    'budúci pondelok, o 2 týždne, 1. ďalšieho mesiaca');
  eq(Q.quickDates('2026-10-26')[0].date, '2026-11-02', 'v pondelok je „budúci pondelok" o týždeň');

  eq(Q.planFit('2026-10-26', '2026-10-26').tone, 'ok', 'v deň nástupu stihne');
  eq(Q.planFit('2026-10-29', '2026-10-26').text, 'O 3 dni neskôr, než je nástup (26. 10. 2026).', 'pár dní neskôr');
  eq(Q.planFit('2026-11-16', '2026-10-26').tone, 'bad', 'o tri týždne nestihne');
  eq(Q.planFit('2026-11-16', null), null, 'bez nástupu náboru sa neporovnáva');

  const g = Q.group('intro', CHIPS, []);
  const nastup = g.questions.find(x => x.key === 'nastup');
  eq(Q.noteLines(g.questions, new Map([['nastup', { idx: 1, date: '2026-11-03' }]])),
    ['Kedy viete nastúpiť? — Neskôr · dátum 3. 11. 2026'], 'dátum ide do poznámky');
  eq(Q.noteLines([nastup], new Map([['nastup', { date: '2026-11-03' }]])),
    ['Kedy viete nastúpiť? — dátum 3. 11. 2026'], 'aj keď je zadaný len dátum');

  const db = Q.fromDbQuestion({ id: 'q9', question_sk: 'Kedy viete reálne nastúpiť?', weight: 3 });
  eq(Q.answerRow(db, { idx: 0, date: '2026-11-03' }).answer_text, 'Odpovedal dobre · dátum 3. 11. 2026',
    'odborná otázka: hodnotenie aj dátum');
  eq(Q.answerRow(db, { date: '2026-11-03' }), { question_id: 'q9', answer_text: 'dátum 3. 11. 2026', rating: null, flagged: false },
    'len dátum, bez hodnotenia');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
