// ============================================================================
// Testy náboru krok za krokom
// Spustenie:  node app/lib/recruiting/flow.test.js
// ============================================================================
// Najdôležitejší test je ten o poradí: appka musí povedať **jednu vec**, ktorá
// sa má spraviť teraz — a musí to byť tá, ktorá najviac horí. Keby to bol len
// „prvý nehotový krok", appka by poslala človeka pripravovať inzerát, kým na
// telefóne čaká dvadsať minút niekto, kto sa ozval na ten predošlý.
// ============================================================================
global.window = global;
const F = require('./flow');

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

const NOW = Date.parse('2026-10-03T12:00:00Z');
const predMinutami = (m) => new Date(NOW - m * 60000).toISOString();
const krok = (steps, key) => steps.find(s => s.key === key);

console.log('Nábor krok za krokom');

// ── Prázdna appka vedie od začiatku ─────────────────────────────────────────
{
  const s = F.state({ now: NOW });
  eq(s.map(x => x.key), ['plan', 'ad', 'call', 'docs', 'site'],
    'päť krokov v poradí, v akom sa dejú');
  ok(!krok(s, 'plan').done, 'bez náboru nie je prvý krok hotový');
  eq(krok(s, 'plan').action.label, 'Potrebujem ľudí',
    'a appka povie, čím začať');
  eq(F.next(s).key, 'plan', 'ďalší krok je ten prvý');
  ok(F.headline(s).title.includes('Koho potrebujem'),
    'veta nad obrazovkou povie, čo teraz');
  eq(F.progress(s).done, 0, 'prázdna appka nemá nič hotové — ani hovory, ani doklady');
}

// ── Nábor beží, ale nikde nie je napísané, kam sa ozvať ─────────────────────
// Toto je najčastejšia tichá diera: človek si povie, že naberá, a inzerát
// nikde nebeží.
{
  const s = F.state({
    plans: [{ id: 'p1', status: 'active', headcount: 4 }],
    now: NOW,
  });
  ok(krok(s, 'plan').done, 'bežiaci nábor je hotový krok');
  ok(krok(s, 'plan').detail.includes('treba 4 ľudí'), 'a je vidieť, koľko ľudí treba');
  ok(!krok(s, 'ad').done, 'ale inzerát chýba');
  eq(F.next(s).key, 'ad', 'appka teda vedie na inzerát');
  eq(krok(s, 'ad').action.label, 'Pripraviť inzerát', 'a povie, čo spraviť');

  const sInzeratom = F.state({
    plans: [{ id: 'p1', status: 'active', headcount: 4 }],
    ads: [{ id: 'a1', plan_id: 'p1', active: true }],
    now: NOW,
  });
  ok(krok(sInzeratom, 'ad').done, 's inzerátom je krok hotový');
}

// ── Telefón má prednosť pred všetkým ────────────────────────────────────────
// Toto je jadro veci. Keď niekto čaká na linke, nemá zmysel posielať človeka
// pripravovať inzerát — hoci je ten krok v poradí skôr.
{
  const s = F.state({
    plans: [{ id: 'p1', status: 'active', headcount: 4 }],
    ads: [],                                   // inzerát chýba — krok 2 horí
    candidates: [{ id: 'c1', full_name: 'Ján Novák', received_at: predMinutami(25) }],
    now: NOW,
  });
  eq(F.next(s).key, 'call', 'hovor má prednosť pred prípravou inzerátu');
  const h = F.headline(s);
  ok(h.title.includes('Ján Novák'), 'a je v tom meno, nie „kandidát"');
  ok(h.sub.includes('25 min'), 'aj to, ako dlho čaká');
  ok(h.hot, 'nad desať minút je to naliehavé');
  ok(krok(s, 'call').action.onclick.includes('continueCall'),
    'tlačidlo vedie rovno do hovoru');
  eq(krok(s, 'call').action.label, 'Zavolať',
    'a meno na ňom nie je druhýkrát — je už vo vete nad ním');

  // Kto čaká dlhšie, ide prvý.
  const viacerí = F.state({
    candidates: [
      { id: 'c1', full_name: 'Prvý', received_at: predMinutami(5) },
      { id: 'c2', full_name: 'Druhý', received_at: predMinutami(40) },
    ],
    now: NOW,
  });
  ok(F.headline(viacerí).title.includes('Druhý'), 'prvý ide ten, kto čaká najdlhšie');

  // Do desiatich minút sa to ešte stíha a appka to má povedať inak.
  const stiha = F.state({
    candidates: [{ id: 'c1', full_name: 'Tretí', received_at: predMinutami(3) }],
    now: NOW,
  });
  ok(!F.headline(stiha).hot, 'do desiatich minút to nie je naliehavé');
  ok(F.headline(stiha).sub.includes('Stíhaš'), 'a povie sa to');
}

// ── Doklady a nasadenie ─────────────────────────────────────────────────────
{
  const s = F.state({
    candidates: [
      { id: 'c1', full_name: 'Po hovore', status: 'contacted', first_contact_at: predMinutami(60) },
      { id: 'c2', full_name: 'Pripravený', status: 'ready', first_contact_at: predMinutami(60) },
    ],
    now: NOW,
  });
  ok(!krok(s, 'docs').done, 'kto je po hovore a nie je pripravený, drží doklady');
  ok(krok(s, 'docs').detail.includes('1 človek čaká'), 'a je ich spočítané');
  eq(krok(s, 'site').count, 1, 'pripravený je v poslednom kroku');
  ok(krok(s, 'site').action.label.includes('Nasadiť'), 'a dá sa nasadiť');

  // Nikto nečaká na hovor, takže sa vedie na doklady — človek zaseknutý na
  // dokladoch je konkrétna prekážka, nie poznámka.
  eq(F.next(s).key, 'docs', 'keď telefón nehorí, vedie sa na zaseknuté doklady');
}

// ── Uzavretý kandidát už do náboru nepatrí ──────────────────────────────────
// Zamietnutý alebo stratený človek nesmie navždy držať krok otvorený.
{
  const s = F.state({
    candidates: [
      { id: 'c1', full_name: 'Zamietnutý', outcome: 'rejected' },
      { id: 'c2', full_name: 'Stratený', outcome: 'lost', received_at: predMinutami(300) },
    ],
    now: NOW,
  });
  eq(krok(s, 'call').count, 0, 'uzavretý kandidát nečaká na hovor');
  eq(krok(s, 'docs').count, 0, 'ani na doklady');
}

// ── Keď netreba nič ─────────────────────────────────────────────────────────
{
  const s = F.state({
    plans: [{ id: 'p1', status: 'active', headcount: 2 }],
    ads: [{ id: 'a1', plan_id: 'p1', active: true }],
    candidates: [{ id: 'c1', full_name: 'Na stavbe', status: 'placed',
      plan_id: 'p1', first_contact_at: predMinutami(600) }],
    now: NOW,
  });
  eq(F.next(s), null, 'keď niet čo robiť, appka nič nevymýšľa');
  ok(F.headline(s).title.includes('Nábor beží'), 'a povie, že je pokoj');
  ok(F.progress(s).done >= 4, 'takmer všetko je hotové', JSON.stringify(F.progress(s)));
}

// ── Čas po slovensky ────────────────────────────────────────────────────────
{
  eq(F.cas(1), '1 min', 'minúta');
  eq(F.cas(45), '45 min', 'minúty');
  eq(F.cas(60), '1 hodinu', 'hodina');
  eq(F.cas(180), '3 hodiny', 'hodiny');
  eq(F.cas(60 * 30), '1 deň', 'deň');
  eq(F.cas(60 * 24 * 3), '3 dni', 'dni');
  eq(F.cas(null), '', 'bez údaja nič');
}

// ── Nič z toho nesmie spadnúť na chýbajúcich dátach ─────────────────────────
{
  ok(F.state().length === 5, 'bez vstupu to nezhodí');
  ok(F.state({ plans: null, ads: null, candidates: null }).length === 5,
    'ani s prázdnymi zoznamami');
  ok(F.state({ candidates: [null, undefined] }).length === 5, 'ani s dierami v dátach');
  eq(F.next(null), null, 'a bez krokov niet čo navrhnúť');
  eq(F.progress(null), { done: 0, total: 0, pct: 0 }, 'postup je vtedy nulový');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
