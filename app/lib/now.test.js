// ============================================================================
// Testy „čo spraviť teraz"
// Spustenie:  node app/lib/now.test.js
// ============================================================================
// Knižnica neráta peniaze ani termíny — rozhoduje o tom, **čo človek na
// obrazovke uvidí ako prvé**. Pokaziť sa dá dvoma spôsobmi a oba sú tiché:
//
//   1. horí všetko → nehorí nič a človek si na červenú zvykne,
//   2. poradie je podľa formulára, nie podľa dôsledku → appka posiela človeka
//      dopĺňať poznámku, kým na stavbe stojí niekto bez IBAN-u.
//
// Preto sa tu testuje hlavne poradie a `hot`.
// ============================================================================
// `money.js` sa hlási do `window` — v Node ho treba mať, inak spadne import.
global.window = global;
const N = require('./now.js');

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

console.log('Čo spraviť teraz');

// ── Tvar odpovede je vždy ten istý ──────────────────────────────────────────
// Vykresľuje to jeden komponent (`Shell.now`). Keby jedna funkcia vrátila iný
// tvar, obrazovka by mlčala — a nikto by nevedel, že niečo čaká.
{
  const vsetky = [
    N.firm({}), N.firm({ name: 'A', address: 'B', company_id: 'C', iban: 'D',
      tax_number_de: 'E', register: 'F' }),
    N.clients([]), N.clients([{ id: 'p1', name: 'GU' }]),
    N.people({}), N.people({ workers: [{ id: 'w1', full_name: 'Ján', status: 'ready', bank_iban: 'SK', phone: '+421', profession: 'zvarac' }] }),
    N.plans({}), N.plans({ plans: [{ id: 'r1', title: 'Wörthsee', brief: 'x', analyzed_at: '2026-10-10' }] }),
    N.trades({}), N.trades({ trades: [{ key: 'zvarac', name_sk: 'Zvárač' }], questions: [{ trade_key: 'zvarac', kind: 'hidden', active: true }] }),
  ];
  for (const n of vsetky) {
    ok(n && typeof n.key === 'string' && n.key !== '', 'veta má kľúč', JSON.stringify(n));
    ok(n && typeof n.title === 'string' && n.title.length > 3, `veta má nadpis (${n && n.key})`,
      JSON.stringify(n));
    ok(n && typeof n.why === 'string' && n.why.length > 20,
      `a dôvod, ktorý nie je o appke (${n && n.key})`, JSON.stringify(n));
    ok(n && typeof n.hot === 'boolean', 'a vie, či to horí');
  }
  // Dôvod nesmie byť o appke. „Pole je povinné" nie je dôvod.
  const zle = vsetky.filter(n => /povinné|vyplň pole|validácia/i.test(n.why));
  ok(!zle.length, 'žiadny dôvod nehovorí o povinnom poli', zle.map(n => n.key).join(', '));
}

// ── Nastavenia: poradie podľa dôsledku, nie podľa formulára ─────────────────
{
  const prazdne = N.firm({});
  eq(prazdne.key, 'name', 'z prázdnych nastavení sa začína názvom firmy');
  ok(prazdne.hot, 'a horí to — bez názvu appka dokument nepustí');
  eq(prazdne.count, 6, 'počíta všetko, čo chýba');
  ok(/5 ďalších údajov/.test(prazdne.what), 'a povie, koľko toho ešte je', prazdne.what);

  const sNazvom = N.firm({ name: 'Partner und Service s. r. o.' });
  eq(sNazvom.key, 'address', 'potom adresa');
  const sTromi = N.firm({ name: 'A', address: 'B', company_id: 'C' });
  eq(sTromi.key, 'iban', 'až po troch blokujúcich príde IBAN');
  ok(!sTromi.hot, 'a ten už nehorí — dokument bez QR platby odíde');
  ok(/QR/.test(sTromi.why), 's dôvodom, ktorý povie, čo sa stane bez neho', sTromi.why);

  const steuer = N.firm({ name: 'A', address: 'B', company_id: 'C', iban: 'D' });
  eq(steuer.key, 'tax_number_de', 'po IBAN-e je nemecké daňové číslo');
  const posledny = N.firm({ name: 'A', address: 'B', company_id: 'C', iban: 'D',
    tax_number_de: 'E' });
  eq(posledny.key, 'register', 'posledný je zápis v obchodnom registri');
  ok(/Je to posledný údaj/.test(posledny.what), 'a vie, že je posledný', posledny.what);
  ok(/GDPR/.test(posledny.why), 's dôvodom, načo je', posledny.why);

  // IČ DPH sa nevyžaduje zámerne: firma nie je platiteľom DPH a appka by
  // hlásila chybu, ktorá nie je chybou.
  const hotovo = N.firm({ name: 'A', address: 'B', company_id: 'C', iban: 'D',
    tax_number_de: 'E', register: 'F' });
  eq(hotovo.key, 'ok', 'bez IČ DPH je to v poriadku');
  ok(!N.FIRMA.some(f => f.key === 'vat_id'), 'IČ DPH nie je medzi vyžadovanými');

  // Medzery nie sú hodnota.
  eq(N.firm({ name: '   ' }).key, 'name', 'samé medzery sa neberú ako názov');
}

// ── Odberatelia: „register neodpovedal" nie je „firma neexistuje" ───────────
{
  const bezCisla = { id: 'p1', name: 'Bau Pasing GmbH' };
  const platny = { id: 'p2', name: 'GU Ulm', ust_idnr: 'DE111111111',
    vies_result: { valid: true, name: 'GU Ulm GmbH' } };
  const neplatny = { id: 'p3', name: 'Hof Bau', ust_idnr: 'DE999999999',
    vies_result: { valid: false } };
  const mimo = { id: 'p4', name: 'Nord Bau', ust_idnr: 'DE222222222',
    vies_result: { unavailable: true, reason: 'http_503' } };

  eq(N.clients([]).key, 'ok', 'bez odberateľov sa nič nevyčíta');

  const n1 = N.clients([platny, mimo, neplatny, bezCisla]);
  eq(n1.key, 'invalid', 'neplatné číslo je prvé');
  ok(n1.hot, 'a horí');
  eq(n1.id, 'p3', 'a vedie na tú firmu');
  ok(/naša daň/.test(n1.why), 'dôvod je o peniazoch, nie o appke', n1.why);

  const n2 = N.clients([platny, mimo, bezCisla]);
  eq(n2.key, 'vat', 'potom firma bez USt-IdNr');
  eq(n2.id, 'p1', 'a vedie na ňu');
  ok(/§13b/.test(n2.why), 's dôvodom podľa zákona', n2.why);

  // **Toto je to miesto, ktoré sa ľahko pokazí.**
  const n3 = N.clients([platny, mimo]);
  eq(n3.key, 'verify', 'nedostupnosť registra nie je neplatné číslo');
  ok(!n3.hot, 'a nehorí — nie je to chyba odberateľa');
  ok(/mimo prevádzky/.test(n3.why), 'povie, že to má skúsiť neskôr', n3.why);

  const n4 = N.clients([platny, { id: 'p5', name: 'Sued Bau', ust_idnr: 'DE333333333' }]);
  eq(n4.key, 'verify', 'nepreverená firma je na preverenie');
  ok(/jedno kliknutie/.test(n4.why), 'a to je jedno kliknutie', n4.why);

  eq(N.clients([platny]).key, 'ok', 'preverená firma nič nevyžaduje');
  ok(/zopakovať/.test(N.clients([platny]).why),
    'ale pripomenie, že overenie má zmysel zopakovať');
}

// ── Živnostníci: najprv ten, kto je na stavbe ───────────────────────────────
{
  const naStavbe = { id: 'w1', full_name: 'Jozef Malý', status: 'deployed' };
  const pripraveny = { id: 'w2', full_name: 'Peter Veľký', status: 'ready' };
  const hotovy = { id: 'w3', full_name: 'Ján Novák', status: 'ready',
    bank_iban: 'SK89', phone: '+421900', profession: 'zvarac' };
  const naCierno = { id: 'w4', full_name: 'Nikto', status: 'blacklist' };

  eq(N.people({}).key, 'ok', 'bez ľudí sa nič nevyčíta');

  const n1 = N.people({ workers: [pripraveny, naStavbe, hotovy] });
  eq(n1.key, 'iban_hot', 'človek na stavbe bez IBAN-u je prvý');
  ok(n1.hot, 'a horí');
  eq(n1.id, 'w1', 'a vedie na neho');
  ok(/nebude sa dať zaplatiť/.test(n1.why), 'dôvod je, že mu nebude kam poslať peniaze', n1.why);

  const n2 = N.people({ workers: [pripraveny, hotovy] });
  eq(n2.key, 'iban', 'pripravený bez IBAN-u je druhý');
  ok(!n2.hot, 'a nehorí — ešte nikde nestojí');

  const n3 = N.people({ workers: [{ ...pripraveny, bank_iban: 'SK99' }, hotovy] });
  eq(n3.key, 'phone', 'potom telefón');
  const n4 = N.people({ workers: [{ ...pripraveny, bank_iban: 'SK99', phone: '+421' }, hotovy] });
  eq(n4.key, 'trade', 'a nakoniec remeslo');

  eq(N.people({ workers: [hotovy] }).key, 'ok', 'kompletný človek nič nevyžaduje');
  ok(/Compliance/.test(N.people({ workers: [hotovy] }).why),
    'a povie, že platnosti dokladov sú zvlášť');

  // Na čiernej listine a neaktívni sa nepočítajú — appka by hlásila chýbajúci
  // IBAN u človeka, s ktorým už nikdy nebudeme robiť.
  eq(N.people({ workers: [hotovy, naCierno] }).key, 'ok', 'čierna listina sa nepočíta');
  eq(N.people({ workers: [hotovy, { ...naStavbe, status: 'inactive' }] }).key, 'ok',
    'ani neaktívni');
}

// ── Živnostníci: A1 je pred všetkým ostatným ────────────────────────────────
{
  const hotovy = { id: 'w3', full_name: 'Ján Novák', status: 'ready',
    bank_iban: 'SK89', phone: '+421900', profession: 'zvarac' };
  const naStavbe = { id: 'w1', full_name: 'Jozef Malý', status: 'deployed' };

  const n1 = N.people({ workers: [naStavbe, hotovy], a1: 2 });
  eq(n1.key, 'a1', 'A1 je pred chýbajúcim IBAN-om');
  ok(n1.hot, 'a horí');
  eq(n1.count, 2, 'a povie, koľkých sa to týka');
  ok(/padne na firmu/.test(n1.why), 'dôvod je, že pokuta padne na firmu', n1.why);
  ok(/2 ľudia majú/.test(n1.what), 'a skloňuje sa správne', n1.what);
  eq(N.people({ workers: [hotovy], a1: 1 }).what.includes('1 človek má'), true,
    'aj pri jednom');

  // Nula nie je problém a nesmie vyzerať ako problém.
  eq(N.people({ workers: [hotovy], a1: 0 }).key, 'ok', 'bez problému s A1 sa nekričí');
  eq(N.people({ workers: [hotovy] }).key, 'ok', 'a chýbajúci počet sa berie ako nula');
}

// ── Kde sú peniaze: najprv účet, potom cudzie peniaze, až potom my ──────────
{
  const stage = (key, count, cents, todo) => ({ key, count, cents, todo,
    label: `${key} label` });
  const zle = { tone: 'bad', text: 'Na účte to nevyjde — v 3. týždni chýba 1 200,00 €.' };
  const hranica = { tone: 'watch', text: 'Minúť sa dá najviac 300,00 €.' };
  const pohoda = { tone: 'calm', text: 'Minúť sa dá najviac 12 000,00 €.' };

  const n1 = N.money({ stages: [stage('overdue', 2, 500000)], verdict: zle });
  eq(n1.key, 'cash', 'účet, ktorý nevyjde, je prvý');
  ok(n1.hot, 'a horí');
  ok(/Výplaty/.test(n1.why), 'dôvod sú výplaty', n1.why);

  const n2 = N.money({
    stages: [stage('overdue', 2, 500000), stage('toinvoice', 5, 900000, 'Vystaviť podklad.')],
    verdict: pohoda,
  });
  eq(n2.key, 'overdue', 'po splatnosti je pred tým, čo stojí na nás');
  ok(n2.hot, 'a horí tiež');
  ok(/5 000,00/.test(n2.what.replace(/\u00A0/g, ' ')), 'so sumou', n2.what);

  // Z toho, čo stojí na nás, sa začína najväčšou sumou — nie poradím v poli.
  const n3 = N.money({
    stages: [stage('unbilled', 1, 100000, 'Zapísať hodiny.'),
      stage('toinvoice', 5, 900000, 'Vystaviť podklad.')],
    verdict: pohoda,
  });
  eq(n3.key, 'toinvoice', 'začína sa najväčšou sumou, ktorá stojí na nás');
  eq(n3.title, 'Vystaviť podklad.', 'a veta je tá, čo patrí k štádiu');
  ok(/vlastnou rukou/.test(n3.why), 'dôvod je, že to vieme pohnúť sami', n3.why);
  ok(!n3.hot, 'ale nehorí to');

  // Štádium bez položiek nie je úloha, aj keď v zozname je.
  eq(N.money({ stages: [stage('toinvoice', 0, 0, 'Vystaviť podklad.')], verdict: pohoda }).key,
    'ok', 'prázdne štádium nie je úloha');

  const n4 = N.money({ stages: [], verdict: hranica });
  eq(n4.key, 'watch', 'hranica rezervy sa povie, keď nič iné nečaká');
  ok(!n4.hot, 'ale nehorí — ešte to vyjde');

  const n5 = N.money({ stages: [], verdict: pohoda });
  eq(n5.key, 'ok', 'a keď je všetko v poriadku, povie sa to');
  ok(/najnižší bod/.test(n5.why), 's vysvetlením, čo to číslo je', n5.why);
  eq(N.money({}).key, 'ok', 'bez dát sa nekričí');
}

// ── Nábor: prvý je ten, kto sa ozval ────────────────────────────────────────
{
  const plan = { id: 'r1', title: 'Wörthsee', brief: 'kotolňa, 4 zvárači',
    analyzed_at: '2026-10-12T10:00:00Z' };
  const bezZadania = { id: 'r2', title: 'Pasing' };
  const bezAnalyzy = { id: 'r3', title: 'Ulm', brief: 'hala' };
  const neozval = { id: 'c1', full_name: 'Marek', status: 'new',
    received_at: '2026-10-13T07:00:00Z' };
  const starsiNeozval = { id: 'c2', full_name: 'Dušan', status: 'new',
    received_at: '2026-10-11T07:00:00Z' };
  const volany = { id: 'c3', full_name: 'Ivan', status: 'screening',
    received_at: '2026-10-10T07:00:00Z', first_contact_at: '2026-10-10T09:00:00Z' };

  const n1 = N.plans({ plans: [plan], candidates: [neozval, starsiNeozval, volany] });
  eq(n1.key, 'call', 'kandidát bez prvého hovoru je prvý');
  ok(n1.hot, 'a horí');
  eq(n1.id, 'c2', 'vedie na toho, kto čaká najdlhšie');
  eq(n1.count, 2, 'a povie, koľko ich je');
  ok(/kto sa ozve prvý/.test(n1.why), 'dôvod je, že volá na viac inzerátov', n1.why);

  // Zamietnutý kandidát nečaká na hovor.
  const n2 = N.plans({ plans: [plan], candidates: [{ ...neozval, status: 'rejected' }] });
  eq(n2.key, 'ok', 'zamietnutý kandidát sa nevolá');

  eq(N.plans({ plans: [], candidates: [] }).key, 'ok', 'bez náborov sa nič nevyčíta');
  ok(/Nábor začína zadaním/.test(N.plans({}).what), 'ale povie, čím nábor začína');

  const n3 = N.plans({ plans: [bezZadania, plan] });
  eq(n3.key, 'brief', 'nábor bez zadania je ďalší');
  eq(n3.id, 'r2', 'a vedie na neho');

  const n4 = N.plans({ plans: [bezAnalyzy, plan] });
  eq(n4.key, 'analyze', 'potom zadanie, z ktorého ešte nič nevzniklo');
  ok(/appka to sama nerobí/.test(n4.why), 'a analýzu spúšťa človek', n4.why);

  const n5 = N.plans({ plans: [plan], candidates: [volany] });
  eq(n5.key, 'ok', 'rozpracovaný nábor nič nevyžaduje');
  ok(/\[XX\]/.test(n5.why), 'ale pripomenie miesta označené [XX]', n5.why);

  // Uzavretý nábor sa nedopĺňa.
  eq(N.plans({ plans: [{ ...bezZadania, status: 'closed' }, plan] }).key, 'ok',
    'uzavretý nábor sa nedopĺňa');
}

// ── Remeslá: bez otázok je hovor improvizácia ───────────────────────────────
{
  const zvarac = { key: 'zvarac', name_sk: 'Zvárač' };
  const maliar = { key: 'maliar', name_sk: 'Maliar' };
  const otazka = (trade, kind, active) => ({ trade_key: trade, kind, active, question_sk: 'x' });

  eq(N.trades({}).key, 'ok', 'bez remesiel sa nič nevyčíta');

  const n1 = N.trades({ trades: [zvarac, maliar],
    questions: [otazka('zvarac', 'hidden', true)] });
  eq(n1.key, 'questions', 'remeslo bez otázok je prvé');
  eq(n1.id, 'maliar', 'a vedie na to remeslo');
  ok(/improvizácia/.test(n1.why), 'dôvod je, že hovor vedie každý inak', n1.why);

  // Vypnutá otázka sa nepočíta ako otázka.
  const n2 = N.trades({ trades: [zvarac],
    questions: [otazka('zvarac', 'knowledge', false)] });
  eq(n2.key, 'questions', 'vypnutá otázka remeslo nepokrýva');

  const n3 = N.trades({ trades: [zvarac],
    questions: [otazka('zvarac', 'hidden', true), otazka('zvarac', 'knowledge', false)] });
  eq(n3.key, 'pending', 'navrhnuté otázky z analýzy čakajú na zapnutie');
  ok(/nikto z nás nečítal/.test(n3.why), 'a appka ich nezapína sama', n3.why);
  ok(/1 otázka čaká/.test(n3.what), 'a povie, čoho sa to týka', n3.what);

  // Polia do hovoru vznikajú zo zápisov rovnako ako otázky z analýzy —
  // je to jedna veta, nie dve.
  const n3b = N.trades({ trades: [zvarac],
    questions: [otazka('zvarac', 'hidden', true)],
    chips: [{ active: false }, { active: false }] });
  eq(n3b.key, 'pending', 'aj polia do hovoru čakajú na zapnutie');
  ok(/2 polia čakajú/.test(n3b.what), 'a počíta sa aj ich', n3b.what);
  const n3c = N.trades({ trades: [zvarac],
    questions: [otazka('zvarac', 'hidden', true), otazka('zvarac', 'knowledge', false)],
    chips: [{ active: false }] });
  ok(/1 otázka a 1 pole čakajú/.test(n3c.what), 'a keď je oboje, povie oboje', n3c.what);

  const n4 = N.trades({ trades: [zvarac],
    questions: [otazka('zvarac', 'knowledge', true)] });
  eq(n4.key, 'hidden', 'remeslo bez overovacej otázky je ďalšie');
  ok(/nevie, že sa ňou preveruje/.test(n4.why), 'a povie, čo overovacia otázka je', n4.why);

  eq(N.trades({ trades: [zvarac], questions: [otazka('zvarac', 'hidden', true)] }).key, 'ok',
    'remeslo s overovacou otázkou je pripravené');
}

// ── Tóny musia sedieť s tým, čo vracia knižnica peňazí ──────────────────────
// `money()` sa rozhoduje podľa `verdict.tone`. Keby `position.js` tie názvy
// premenoval, veta by prestala reagovať na účet, ktorý nevyjde — a nikto by
// si to nevšimol, lebo appka by stále niečo písala.
{
  const P = require('./money/position.js');
  eq(P.BAD, 'bad', 'tón „nevyjde to" sa volá bad');
  eq(P.WATCH, 'watch', 'tón „na hranici" sa volá watch');
  eq(P.CALM, 'calm', 'tón „v pohode" sa volá calm');
  // A štádiá, ktoré stoja na nás, musia v tej knižnici naozaj existovať.
  const kluce = P.STAGES.map(x => x.key);
  for (const k of N.NASE) {
    ok(kluce.includes(k), `štádium ${k} existuje v position.js`, kluce.join(', '));
  }
  ok(kluce.includes('overdue'), 'aj štádium „po splatnosti"');
}

// ── Zložená obrazovka: najnaliehavejšia veta, nie prvá v poli ───────────────
{
  const nic = { key: 'ok', title: 'Nič nečaká', hot: false };
  const caka = { key: 'check', title: 'Skontrolovať', hot: false };
  const hori = { key: 'overdue', title: 'Po splatnosti', hot: true };

  eq(N.pick([]), null, 'bez viet nie je čo vybrať');
  eq(N.pick([nic, caka, hori]).key, 'overdue', 'horí pred nehorí');
  eq(N.pick([nic, caka]).key, 'check', 'čokoľvek pred „nič nečaká"');
  eq(N.pick([nic]).key, 'ok', 'a keď nič nečaká, povie sa to');
  // Poradie záložiek nesmie rozhodovať o tom, čo je naliehavé.
  eq(N.pick([hori, caka]).key, 'overdue', 'poradie v poli nerozhoduje');
  eq(N.pick([null, undefined, caka]).key, 'check', 'prázdne vety sa preskočia');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
