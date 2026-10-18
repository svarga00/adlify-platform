// ============================================================================
// Testy mapy toku
// Spustenie:  node app/lib/chain.test.js
// ============================================================================
// Mapa má jednu úlohu: povedať človeku, ktorý appku nepostavil, **v akom
// poradí sa to robí a kde sa to práve zastavilo**. Preto sa tu nestráži len
// to, či čísla sedia, ale aj to, či sú vety zrozumiteľné a či reťazec drží
// pokope — každý krok musí vedieť, čo je po ňom.
//
// Krokov je sedem a sú to tie, ktoré pomenoval majiteľ. Dovtedy ich bolo
// štrnásť v štyroch dráhach — rozpísané podľa databázy, nie podľa práce.
// ============================================================================
global.window = global;
const F = require('./chain.js');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; return; }
  failed++;
  console.error(`  ✗ ${msg}\n      čakal som: ${e}\n      dostal som: ${a}`);
}
function ok(cond, msg) { eq(!!cond, true, msg); }

const TODAY = '2026-10-05';

/** Appka, v ktorej je všetko vybavené. Od nej sa odvíja každý ďalší prípad. */
const CISTO = {
  today: TODAY,
  opportunities: [{ id: 'o1', status: 'won' }],
  ads: [{ id: 'ad1', active: true }],
  plans: [{ id: 'p1', status: 'active', headcount: 3 }],
  candidates: [{ id: 'c1', status: 'hired', first_contact_at: '2026-09-01T10:00:00Z',
    converted_worker_id: 'w1' }],
  workers: [{ id: 'w1', full_name: 'Ján Novák', status: 'deployed' }],
  documents: [
    { id: 'd1', worker_id: 'w1', kind: 'a1', validity: 'valid' },
    { id: 'd2', worker_id: 'w1', kind: 'gdpr', validity: 'valid' },
    { id: 'd3', worker_id: 'w1', kind: 'contract', validity: 'valid' },
  ],
  partners: [{ id: 'pt1', name: 'Vogel GmbH', country: 'DE', ust_idnr: 'DE812345678' }],
  quotes: [{ id: 'q1', status: 'accepted' }],
  contracts: [{ id: 'z1', status: 'active', signed_at: '2026-08-01' }],
  subcontracts: [{ id: 's1', status: 'active', contract_id: 'z1' }],
  assignments: [{ id: 'a1', subcontract_id: 's1', worker_id: 'w1', status: 'active' }],
  timesheets: [{ id: 't1', assignment_id: 'a1', hours: 8, work_date: '2026-10-03', period_id: null }],
  periods: [{ id: 'pe1', subcontract_id: 's1', status: 'open', period_to: '2026-10-31' }],
  invoices: [{ id: 'i1', status: 'paid', due_date: '2026-09-01' }],
  bills: [{ id: 'b1', status: 'paid' }],
};

/** Jeden krok z balíka, ktorý je `CISTO` so zmenou. */
const krok = (key, zmena = {}) => F.step(key, { ...CISTO, ...zmena });

// ── Čistá appka ─────────────────────────────────────────────────────────────
console.log('Keď je všetko vybavené');
{
  const kroky = F.all(CISTO);
  eq(kroky.length, 7, 'reťazec má sedem krokov');
  eq(kroky.filter(k => k.state !== 'calm').map(k => k.key), [],
    'vo vybavenej appke nič nesvieti');
  eq(kroky.every(k => k.todoText), true,
    'aj vybavený krok povie vetu — prázdne miesto nie je odpoveď');
  const h = F.headline(kroky);
  eq(h.tone, 'calm', 'hlavička je pokojná');
  ok(/priechodný/.test(h.text), 'a povie, že reťazec drží');
  eq(F.summary(kroky), { total: 7, blocked: 0, watch: 0, clear: 7, items: 0 },
    'súhrn sedí');
}

// ── 1 · Dopyt ───────────────────────────────────────────────────────────────
console.log('1 · Dopyt na zákazku');
{
  // Odberateľ, ktorý hľadá ľudí, volá viacerým. Rozhoduje, kto sa ozve prvý.
  const novy = krok('dopyt', { opportunities: [{ id: 'o1', status: 'new' }] });
  eq(novy.state, 'bad', 'nový dopyt bez odpovede horí');
  eq(novy.todo, 1, 'a je to jeden');
  ok(/na prvú odpoveď/.test(novy.todoText), 'veta povie, čo sa čaká');

  const prepadnuta = krok('dopyt', { opportunities: [],
    quotes: [{ id: 'q1', status: 'sent', valid_until: '2026-09-20' }] });
  eq(prepadnuta.state, 'bad', 'ponuka, ktorej prepadla platnosť bez odpovede, horí');

  const caka = krok('dopyt', { opportunities: [],
    quotes: [{ id: 'q1', status: 'sent', valid_until: '2026-11-20' }] });
  eq(caka.state, 'watch', 'ponuka v platnosti je len na sledovanie');
  eq(krok('dopyt', { opportunities: [], quotes: [] }).state, 'calm',
    'bez dopytov a ponúk sa nekričí');
}

// ── 2 · Inzeráty a záujemcovia ──────────────────────────────────────────────
console.log('2 · Inzeráty a záujemcovia');
{
  // Nábor bez inzerátu je najtichšia chyba: nič nehorí, len sa nikto neozýva.
  const bezInzeratu = krok('nabor', { ads: [{ id: 'ad1', active: false }] });
  eq(bezInzeratu.state, 'bad', 'bežiaci nábor bez inzerátu horí');
  ok(/nemá sa kto ozvať/.test(bezInzeratu.todoText), 'a povie prečo');
  eq(krok('nabor', { plans: [], ads: [] }).state, 'calm',
    'bez náboru netreba inzerát — a nekričí sa');

  const caka = krok('nabor', { candidates: [
    { id: 'c1', status: 'new', first_contact_at: null },
    { id: 'c2', status: 'rejected', first_contact_at: null },
  ] });
  eq(caka.todo, 1, 'zamietnutý sa na hovor nepočíta');
  eq(caka.state, 'bad', 'človek, ktorý sa ozval a nikto mu nezavolal, horí');

  const visi = krok('nabor', { candidates: [
    { id: 'c1', status: 'screening', first_contact_at: '2026-10-01T09:00:00Z' },
  ] });
  eq(visi.state, 'watch', 'rozhodnutie po hovore je na sledovanie, nie požiar');
}

// ── 3 · Objednávka a zmluva s Nemcom ────────────────────────────────────────
console.log('3 · Objednávka a zmluva s Nemcom');
{
  const bezZmluvy = krok('nemec', { subcontracts: [
    { id: 's1', status: 'active', contract_id: null },
  ] });
  eq(bezZmluvy.state, 'bad', 'bežiaca stavba bez zmluvy horí');

  const nepodpisana = krok('nemec', { contracts: [
    { id: 'z1', status: 'active', signed_at: null },
  ] });
  eq(nepodpisana.state, 'watch', 'nepodpísaná zmluva je na sledovanie');

  // Bez USt-IdNr sa nedá fakturovať v reverse charge podľa §13b.
  const bezUst = krok('nemec', { partners: [
    { id: 'pt1', country: 'DE', ust_idnr: null },
    { id: 'pt2', country: 'SK', ust_idnr: null },
  ] });
  eq(bezUst.todo, 1, 'slovenský odberateľ USt-IdNr nepotrebuje');
  ok(/faktúra im neodíde/.test(bezUst.todoText), 'veta povie dôsledok');
}

// ── 4 · Súhlas GDPR ─────────────────────────────────────────────────────────
console.log('4 · Súhlas GDPR od živnostníka');
{
  const bezSuhlasu = { documents: CISTO.documents.filter(d => d.kind !== 'gdpr') };

  // Človek, ktorý už stojí na stavbe, je iná naliehavosť než človek v evidencii.
  const naStavbe = krok('gdpr', bezSuhlasu);
  eq(naStavbe.state, 'bad', 'človek na stavbe bez súhlasu horí');
  ok(/na stavbe/.test(naStavbe.todoText), 'a veta to povie');

  const vEvidencii = krok('gdpr', { ...bezSuhlasu, assignments: [] });
  eq(vEvidencii.state, 'watch', 'človek bez nasadenia je len na sledovanie');
  eq(vEvidencii.todo, 1, 'a je to jeden');

  // S kým už nerobíme, toho nemá zmysel doháňať.
  eq(krok('gdpr', { ...bezSuhlasu, assignments: [],
    workers: [{ id: 'w1', status: 'inactive' }] }).state, 'calm',
  'neaktívny živnostník sa nepočíta');
  eq(krok('gdpr', { ...bezSuhlasu, assignments: [],
    workers: [{ id: 'w1', status: 'blacklist' }] }).state, 'calm',
  'ani čierna listina');

  eq(krok('gdpr').have, 1, 'podpísaný súhlas sa počíta');
}

// ── 5 · Zmluva so živnostníkom ──────────────────────────────────────────────
console.log('5 · Zmluva so živnostníkom');
{
  const bezZmluvy = { documents: CISTO.documents.filter(d => d.kind !== 'contract') };
  const naStavbe = krok('zmluva', bezZmluvy);
  eq(naStavbe.state, 'bad', 'človek na stavbe bez zmluvy horí');

  // Rámcová zmluva sa spravidla končí 31. decembra — a to sa nemá zistiť
  // 2. januára, keď už je na stavbe.
  const konci = krok('zmluva', { documents: [
    { id: 'd3', worker_id: 'w1', kind: 'contract', validity: 'expiring' },
  ] });
  eq(konci.state, 'watch', 'končiaca zmluva je na sledovanie');
  ok(/platnosť/.test(konci.todoText), 'a veta povie, že ide o platnosť');

  eq(krok('zmluva').state, 'calm', 'platná zmluva nič nevyžaduje');
}

// ── 6 · Objednávka a papiere ────────────────────────────────────────────────
console.log('6 · Objednávka a papiere v poriadku');
{
  const zleDoklady = krok('objednavka', { documents: [
    { id: 'd1', worker_id: 'w1', kind: 'a1', validity: 'expired' },
    { id: 'd2', worker_id: 'w1', kind: 'medical', validity: 'expired' },
  ] });
  eq(zleDoklady.todo, 1, 'počítajú sa ľudia, nie doklady');
  eq(zleDoklady.state, 'bad', 'bez platných dokladov sa nasadiť nedá');

  const prazdna = krok('objednavka', {
    subcontracts: [{ id: 's1', status: 'active', contract_id: 'z1' },
      { id: 's2', status: 'active', contract_id: 'z1' }],
  });
  eq(prazdna.todo, 1, 'stavba, na ktorej nie je nikto, je úloha');
  eq(prazdna.state, 'bad', 'a horí — stavba nepočká');

  const konci = krok('objednavka', { documents: [
    { id: 'd1', worker_id: 'w1', kind: 'a1', validity: 'expiring' },
  ] });
  eq(konci.state, 'watch', 'končiaci doklad je na sledovanie');
}

// ── 7 · Ubytovanie, hodiny a faktúry ────────────────────────────────────────
console.log('7 · Ubytovanie, hodiny a faktúry');
{
  const meska = krok('stavba', { invoices: [
    { id: 'i1', status: 'sent', due_date: '2026-08-01' },
    { id: 'i2', status: 'paid', due_date: '2026-08-01' },
    { id: 'i3', status: 'draft', due_date: '2026-08-01' },
    { id: 'i4', status: 'sent', due_date: TODAY },
  ] });
  eq(meska.todo, 1, 'zaplatená, rozpracovaná ani dnes splatná nemešká');
  eq(meska.state, 'bad', 'faktúra po splatnosti horí');

  const zrele = krok('stavba', { periods: [
    { id: 'pe1', status: 'open', period_to: '2026-09-30' },
  ] });
  eq(zrele.state, 'bad', 'obdobie po konci čaká na uzavretie');
  ok(/faktúra nevznikne/.test(zrele.todoText), 'a veta povie dôsledok');

  const sporna = krok('stavba', { bills: [{ id: 'b1', status: 'disputed' }] });
  eq(sporna.state, 'bad', 'sporná prijatá faktúra horí');

  const naSchvalenie = krok('stavba', { invoices: [
    { id: 'i1', status: 'pending_approval' },
  ] });
  eq(naSchvalenie.state, 'watch', 'schválenie je na sledovanie');

  const stare = krok('stavba', { timesheets: [
    { id: 't1', hours: 8, work_date: '2026-09-15', period_id: null },
  ] });
  eq(stare.state, 'watch', 'hodiny staršie než dva týždne sú na sledovanie');
  eq(krok('stavba').have, 1, '„zaplatené" sa počíta zvlášť');
}

// ── Hlavička ────────────────────────────────────────────────────────────────
console.log('Prvá veta na obrazovke');
{
  // Keď stojí viac vecí, hlavička ukáže **tú najskoršiu v reťazci**. Opraviť
  // koniec reťazca, kým viazne začiatok, nemá zmysel.
  const kroky = F.all({ ...CISTO,
    candidates: [{ id: 'c1', status: 'new', first_contact_at: null }],
    invoices: [{ id: 'i1', status: 'sent', due_date: '2026-08-01' }],
  });
  const h = F.headline(kroky);
  eq(h.tone, 'bad', 'niečo stojí');
  eq(h.step.key, 'nabor', 'a je to ten najskorší krok, nie posledný');
  ok(/na 2 miestach/.test(h.text), 'povie sa, koľko miest stojí');

  const jedno = F.headline(F.all({ ...CISTO,
    invoices: [{ id: 'i1', status: 'sent', due_date: '2026-08-01' }] }));
  ok(/kroku 7/.test(jedno.text), 'pri jednom mieste sa povie číslo kroku');

  const sledovat = F.headline(F.all({ ...CISTO,
    contracts: [{ id: 'z1', status: 'active', signed_at: null }] }));
  eq(sledovat.tone, 'watch', 'nepodpísaná zmluva je na sledovanie');
  ok(/Nič nehorí/.test(sledovat.text), 'a povie sa to rovno');

  eq(F.headline([]).step, null, 'prázdny zoznam nespadne');
}

// ── Odolnosť ────────────────────────────────────────────────────────────────
console.log('Odolnosť');
{
  const prazdne = F.all({});
  eq(prazdne.length, 7, 'prázdny balík dá všetky kroky');
  eq(prazdne.every(k => k.todoText), true, 'a každý niečo povie');
  eq(F.step('neexistuje', CISTO), null, 'neznámy krok nevráti nič, nespadne');
  // Keď príde jeden dotaz rozbitý, zvyšok mapy musí zostať užitočný.
  eq(F.step('nabor', { candidates: null }).todo, 0, 'chýbajúce pole je prázdny zoznam');
  eq(F.step('stavba', { timesheets: [{ hours: 'x', period_id: null }] }).have, 0,
    'nečíselné hodiny sú nula, nie NaN');
}

// ── Zmluva knižnice ─────────────────────────────────────────────────────────
// Reťazec sa bude dopĺňať. Tieto pravidlá sú to, čo drží, aby z neho nebol
// zoznam obrazoviek bez poradia.
console.log('Zmluva');
{
  const kluce = F.STEPS.map(s => s.key);
  eq(kluce.length, new Set(kluce).size, 'kľúče sa neopakujú');
  eq(F.STEPS.map(s => s.n), F.STEPS.map((_, i) => i + 1),
    'čísla krokov idú po sebe od jednotky — to je celá pointa mapy');
  for (const s of F.STEPS) {
    ok(s.title && s.lead, `${s.key}: má názov aj vetu, čo to je`);
    ok(s.next, `${s.key}: má napísané, čo je po ňom`);
    ok(s.ico, `${s.key}: má ikonu`);
    ok(s.route, `${s.key}: vedie na obrazovku`);
    ok(typeof s.have === 'function' && typeof s.todo === 'function'
      && typeof s.haveText === 'function', `${s.key}: má všetky tri funkcie`);
    // Veta „čo to je" má byť veta, nie nálepka.
    ok(s.lead.length > 30 && /[.!?]$/.test(s.lead), `${s.key}: vysvetlenie je veta`);
  }
  // Je ich sedem zámerne — presne tie, ktoré pomenoval majiteľ. Ôsmy krok
  // znamená, že sa pridal niečí nápad, nie jeho práca.
  eq(F.STEPS.length, 7, 'krokov je sedem, nie viac');
  // Posledný krok reťazec uzatvára — ak pribudne ďalší, toto treba prepísať
  // vedome, nie omylom.
  ok(/uzavrie/.test(F.STEPS[F.STEPS.length - 1].next),
    'posledný krok povie, že tým sa to končí');
}

// ── Kde v reťazci som ───────────────────────────────────────────────────────
console.log('Krok obrazovky');
{
  eq(F.stepOfRoute('opportunities').from, 1, 'Možnosti sú prvý krok');
  eq(F.stepOfRoute('candidates').from, 2, 'Kandidáti sú druhý');
  const w = F.stepOfRoute('workers');
  eq([w.from, w.to], [4, 5], 'na Živnostníkoch sa robí súhlas aj zmluva');
  eq(w.steps.map(s => s.key), ['gdpr', 'zmluva'], 'a oba kroky sú vymenované');
  eq(w.next.n, 6, 'ďalej je objednávka');
  eq(F.stepOfRoute('invoices').next, null, 'za siedmym krokom už nič nie je');
  eq(F.stepOfRoute('settings'), null, 'Nastavenia v reťazci nie sú');
  eq(F.stepOfRoute('tasks'), null, 'ani Úlohy');
  // Každý krok musí mať aspoň jednu obrazovku — inak by sa na neho
  // z pruhu nedalo dostať.
  for (const s of F.STEPS) {
    ok(Object.values(F.ROUTE_STEPS).some(n => n.includes(s.n)), `krok ${s.n} má obrazovku`);
    ok(F.ROUTE_STEPS[s.route] && F.ROUTE_STEPS[s.route].includes(s.n),
      `krok ${s.n} vedie na obrazovku, ktorá o ňom vie`);
  }
}

// ── Tlačidlo a veta pri kroku ───────────────────────────────────────────────
console.log('Tlačidlo pri kroku');
{
  for (const s of F.STEPS) {
    ok(s.hint && s.hint.length > 20 && s.hint.length <= 90 && /[.!?]$/.test(s.hint),
      `${s.key}: jedna krátka veta, čo sa tu robí`, s.hint);
    ok(Array.isArray(s.cta) && s.cta.length === 2 && s.cta.every(Boolean),
      `${s.key}: tlačidlo má text, keď niečo čaká, aj keď je čisto`);
  }
  const caka = F.step('dopyt', { opportunities: [{ status: 'new' }] });
  eq(caka.cta, 'Odpovedať na dopyty', 'keď dopyt čaká, tlačidlo vedie k odpovedi');
  eq(F.step('dopyt', {}).cta, 'Vložiť dopyt', 'keď nečaká nič, ponúkne nový');
}

// ── Čo ešte treba pri jednom človeku ────────────────────────────────────────
console.log('Karta človeka');
{
  const W = { id: 'w1' };
  const T = '2026-10-18';
  const nic = F.personSteps({ worker: W, today: T });
  eq(nic.items.map(i => i.key), ['gdpr', 'zmluva', 'objednavka'], 'tri veci v poradí reťazca');
  eq(nic.next.key, 'gdpr', 'nový človek začína súhlasom');
  eq(nic.left, 3, 'chýbajú mu všetky tri');

  const gd = { worker_id: 'w1', kind: 'gdpr', valid_from: '2026-10-01', status: 'valid' };
  const zm = { worker_id: 'w1', kind: 'contract', valid_from: '2026-10-02',
    valid_to: '2026-12-31', status: 'valid' };
  const poGdpr = F.personSteps({ worker: W, today: T, docs: [gd] });
  eq(poGdpr.next.key, 'zmluva', 'po súhlase ide zmluva');
  ok(/1\. 10\. 2026/.test(poGdpr.items[0].text), 'pri súhlase je dátum podpisu');

  // Vyžiadaný papier ešte nie je papier.
  eq(F.personSteps({ worker: W, today: T,
    docs: [{ ...gd, status: 'requested' }] }).next.key, 'gdpr', 'vyžiadaný súhlas sa nepočíta');
  // Cudzí doklad sa nepočíta.
  eq(F.personSteps({ worker: W, today: T,
    docs: [{ ...gd, worker_id: 'w2' }] }).next.key, 'gdpr', 'ani súhlas iného človeka');

  const poZml = F.personSteps({ worker: W, today: T, docs: [gd, zm] });
  eq(poZml.next.key, 'objednavka', 'po zmluve ide stavba a objednávka');
  eq(poZml.next.needs, 'assign', 'najprv mu treba vybrať stavbu');

  const asg = { id: 'a1', worker_id: 'w1', status: 'planned' };
  const naStavbe = F.personSteps({ worker: W, today: T, docs: [gd, zm], assignments: [asg] });
  eq(naStavbe.next.needs, 'order', 'na stavbe bez objednávky treba objednávku');
  eq(naStavbe.next.assignmentId, 'a1', 'a vie, ku ktorému nasadeniu');

  const hotovo = F.personSteps({ worker: W, today: T, docs: [gd, zm], assignments: [asg],
    orders: [{ kind: 'worker', assignment_id: 'a1', status: 'draft' }] });
  eq(hotovo.done, true, 'so súhlasom, zmluvou a objednávkou je hotovo');
  eq(F.personSteps({ worker: W, today: T, docs: [gd, zm], assignments: [asg],
    orders: [{ kind: 'worker', assignment_id: 'a1', status: 'cancelled' }] }).done, false,
    'zrušená objednávka nie je objednávka');
  eq(F.personSteps({ worker: W, today: T, docs: [gd, zm],
    assignments: [{ ...asg, status: 'ended' }] }).next.needs, 'assign',
    'skončené nasadenie neznamená, že je na stavbe');

  // Zmluva do konca roka sa raz skončí — a appka to má povedať skôr.
  const skoncila = F.personSteps({ worker: W, today: '2027-01-05', docs: [gd, zm] });
  eq(skoncila.next.key, 'zmluva', 'skončená zmluva sa musí obnoviť');
  ok(/Skončila 31\. 12\. 2026/.test(skoncila.items[1].text), 'a povie, kedy skončila');
  const konci = F.personSteps({ worker: W, today: '2026-12-10', docs: [gd, zm] });
  eq(konci.items[1].done, true, 'zmluva, ktorá ešte platí, je v poriadku');
  eq(konci.items[1].warn, true, 'ale mesiac pred koncom sa ozve');
  // Novšia zmluva prebije starú.
  const nova = { ...zm, valid_from: '2027-01-02', valid_to: '2027-12-31' };
  eq(F.personSteps({ worker: W, today: '2027-01-05', docs: [gd, zm, nova] }).items[1].done,
    true, 'nová zmluva prebije skončenú');
  eq(F.personSteps({}).items.length, 3, 'bez údajov nespadne');
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
