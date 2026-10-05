// ============================================================================
// Testy mapy toku
// Spustenie:  node app/lib/chain.test.js
// ============================================================================
// Mapa má jednu úlohu: povedať človeku, ktorý appku nepostavil, **v akom
// poradí sa to robí a kde sa to práve zastavilo**. Preto sa tu nestráži len
// to, či čísla sedia, ale aj to, či sú vety zrozumiteľné a či reťazec drží
// pokope — každý krok musí vedieť, čo je po ňom, a každá dráha musí mať
// aspoň jeden krok.
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
  ads: [{ id: 'ad1', active: true }],
  plans: [{ id: 'p1', status: 'active', headcount: 3 }],
  candidates: [{ id: 'c1', status: 'hired', first_contact_at: '2026-09-01T10:00:00Z',
    converted_worker_id: 'w1' }],
  workers: [{ id: 'w1', full_name: 'Ján Novák' }],
  documents: [{ id: 'd1', worker_id: 'w1', validity: 'valid' }],
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
  eq(kroky.length, 14, 'reťazec má štrnásť krokov');
  eq(kroky.filter(k => k.state !== 'calm').map(k => k.key), [],
    'vo vybavenej appke nič nesvieti');
  eq(kroky.every(k => k.todoText), true,
    'aj vybavený krok povie vetu — prázdne miesto nie je odpoveď');
  const h = F.headline(kroky);
  eq(h.tone, 'calm', 'hlavička je pokojná');
  ok(/priechodný/.test(h.text), 'a povie, že reťazec drží');
  eq(F.summary(kroky), { total: 14, blocked: 0, watch: 0, clear: 14, items: 0 },
    'súhrn sedí');
}

// ── Ľudia ───────────────────────────────────────────────────────────────────
console.log('Dráha ľudí');
{
  // 1. Nábor beží, ale nemá sa kto ozvať.
  const bezInzeratu = krok('ads', { ads: [{ id: 'ad1', active: false }] });
  eq(bezInzeratu.state, 'bad', 'nábor bez inzerátu je chyba, nie detail');
  eq(bezInzeratu.todo, 1, 'a je ich toľko, koľko beží náborov');
  ok(/nemá sa kto ozvať/.test(bezInzeratu.todoText), 'povie sa to po ľudsky');
  eq(krok('ads', { plans: [], ads: [] }).state, 'calm',
    'žiadny nábor a žiadny inzerát nie je chyba — len sa nenaberá');

  // 2. Telefonát do desiatich minút.
  const caka = krok('call', { candidates: [
    { id: 'c1', status: 'new', first_contact_at: null },
    { id: 'c2', status: 'new', first_contact_at: null },
    // Odmietnutému sa už volať netreba.
    { id: 'c3', status: 'rejected', first_contact_at: null },
  ] });
  eq(caka.todo, 2, 'odmietnutý kandidát sa do čakajúcich neráta');
  eq(caka.state, 'bad', 'nezavolaný človek je červený — do desiatich minút berie prácu inde');
  ok(/čakajú na prvý telefonát/.test(caka.todoText), 'veta hovorí, čo spraviť');

  // 3. Preverenie.
  const visi = krok('screening', { candidates: [
    { id: 'c1', status: 'screening', first_contact_at: '2026-09-20T10:00:00Z' },
    { id: 'c2', status: 'hired', first_contact_at: '2026-09-20T10:00:00Z', converted_worker_id: 'w9' },
    { id: 'c3', status: 'new', first_contact_at: null },
  ] });
  eq(visi.todo, 1, 'visí ten, komu sme volali a nerozhodli sme');
  eq(visi.have, 2, '„preverení" sú tí, s ktorými sme hovorili');
  eq(visi.state, 'watch', 'rozhodnutie je na dnes, nie na včera');

  // 4. Doklady.
  const zleDoklady = krok('workers', { documents: [
    { id: 'd1', worker_id: 'w1', validity: 'expired' },
    { id: 'd2', worker_id: 'w1', validity: 'expired' },
    { id: 'd3', worker_id: 'w2', validity: 'expiring' },
  ] });
  eq(zleDoklady.todo, 1, 'počítajú sa ľudia, nie doklady — dvom dokladom jedného človeka');
  eq(zleDoklady.state, 'bad', 'bez platných dokladov sa nenasadzuje');
  ok(/nasadiť sa nedá/.test(zleDoklady.todoText), 'a je napísané prečo');
}

// ── Zákazky ─────────────────────────────────────────────────────────────────
console.log('Dráha zákaziek');
{
  const bezUst = krok('partners', { partners: [
    { id: 'p1', country: 'DE', ust_idnr: null },
    { id: 'p2', country: 'DE', ust_idnr: 'DE1' },
    // Slovenský odberateľ USt-IdNr nepotrebuje.
    { id: 'p3', country: 'SK', ust_idnr: null },
  ] });
  eq(bezUst.todo, 1, 'USt-IdNr sa pýta len od zahraničného odberateľa');
  ok(/faktúra im neodíde/.test(bezUst.todoText), 'povie sa dôsledok, nie názov stĺpca');

  const prepadnuta = krok('quotes', { quotes: [
    { id: 'q1', status: 'sent', valid_until: '2026-09-20' },
    { id: 'q2', status: 'sent', valid_until: '2026-11-20' },
  ] });
  eq(prepadnuta.state, 'bad', 'ponuka po platnosti bez odpovede je chyba');
  eq(prepadnuta.todo, 1, 'a ráta sa len tá prepadnutá');
  const caka = krok('quotes', { quotes: [{ id: 'q1', status: 'sent', valid_until: '2026-11-20' }] });
  eq(caka.state, 'watch', 'ponuka v platnosti je len na sledovanie');
  eq(krok('quotes', { quotes: [{ id: 'q1', status: 'accepted' }] }).state, 'calm',
    'prijatá ponuka už nečaká');

  const nepodpisana = krok('contracts', { contracts: [
    { id: 'z1', status: 'active', signed_at: null },
    { id: 'z2', status: 'cancelled', signed_at: null },
  ] });
  eq(nepodpisana.todo, 1, 'zrušená zmluva sa nepodpisuje');

  const bezZmluvy = krok('subcontracts', { subcontracts: [
    { id: 's1', status: 'active', contract_id: null },
    { id: 's2', status: 'active', contract_id: 'z1' },
    { id: 's3', status: 'completed', contract_id: null },
  ] });
  eq(bezZmluvy.todo, 1, 'ukončená zákazka bez zmluvy sa už nerieši');
  eq(bezZmluvy.have, 2, '„beží" sú len aktívne');
}

// ── Stretnutie ──────────────────────────────────────────────────────────────
console.log('Kde sa dráhy stretnú');
{
  const prazdna = krok('assignments', {
    subcontracts: [{ id: 's1', status: 'active', contract_id: 'z1' },
      { id: 's2', status: 'active', contract_id: 'z1' }],
    assignments: [{ id: 'a1', subcontract_id: 's1', status: 'active' }],
  });
  eq(prazdna.todo, 1, 'bežiaca zákazka bez ľudí');
  eq(prazdna.state, 'bad', 'je to červené — platíme za stavbu, na ktorej nikto nie je');
  eq(prazdna.have, 1, 'nasadených je jeden');

  // Nasadenie na ukončenej zákazke sa do „ľudí na stavbách" neráta — rovnako
  // ako na prehľade. Keby sa to tu počítalo inak, dve obrazovky by o tej istej
  // veci tvrdili dve rôzne čísla.
  const ukoncena = krok('assignments', {
    subcontracts: [{ id: 's1', status: 'completed' }],
    assignments: [{ id: 'a1', subcontract_id: 's1', status: 'active' }],
  });
  eq(ukoncena.have, 0, 'na ukončenej zákazke nikto „na stavbe" nie je');
}

// ── Peniaze ─────────────────────────────────────────────────────────────────
console.log('Dráha peňazí');
{
  const stare = krok('timesheets', { timesheets: [
    { id: 't1', hours: 8, work_date: '2026-09-01', period_id: null },
    { id: 't2', hours: 8, work_date: '2026-10-04', period_id: null },
    // V uzavretom období — to už nie je „mimo obdobia".
    { id: 't3', hours: 100, work_date: '2026-07-01', period_id: 'pe9' },
  ] });
  eq(stare.have, 16, 'sčítajú sa len hodiny mimo obdobia');
  eq(stare.todo, 1, 'a upozorní sa na tie staršie než dva týždne');

  const zrele = krok('periods', { periods: [
    { id: 'pe1', status: 'open', period_to: '2026-09-30' },
    { id: 'pe2', status: 'open', period_to: '2026-10-31' },
    { id: 'pe3', status: 'closed', period_to: '2026-08-31' },
  ] });
  eq(zrele.todo, 1, 'uzavrieť treba to, čomu uplynul koniec');
  eq(zrele.state, 'bad', 'bez uzavretia nevznikne faktúra — to drží celý zvyšok');

  eq(krok('invoices', { invoices: [{ id: 'i1', status: 'pending_approval' }] }).todo, 1,
    'faktúra na schválenie');
  eq(krok('invoices', { invoices: [{ id: 'i1', status: 'pending_approval' }] }).state, 'watch',
    'čaká na človeka, ale nehorí');

  // Sporná prijatá faktúra má prednosť pred tými na kontrolu — je to iný
  // problém a rieši sa inak.
  const sporna = krok('bills', { bills: [
    { id: 'b1', status: 'disputed' }, { id: 'b2', status: 'received' }] });
  eq(sporna.state, 'bad', 'sporná faktúra je červená');
  eq(sporna.todo, 1, 'a ráta sa len tá sporná');
  eq(krok('bills', { bills: [{ id: 'b2', status: 'received' }] }).state, 'watch',
    'faktúra na kontrolu je oranžová');

  const meska = krok('bank', { invoices: [
    { id: 'i1', status: 'sent', due_date: '2026-09-20' },
    { id: 'i2', status: 'paid', due_date: '2026-08-01' },
    { id: 'i3', status: 'draft', due_date: '2026-08-01' },
    { id: 'i4', status: 'sent', due_date: TODAY },
  ] });
  eq(meska.todo, 1, 'zaplatená, rozpracovaná ani dnes splatná nemešká');
  eq(meska.have, 1, '„zaplatené" sa počíta zvlášť');
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
  eq(h.step.key, 'call', 'a je to ten najskorší krok, nie posledný');
  ok(/na 2 miestach/.test(h.text), 'povie sa, koľko miest stojí');

  const jedno = F.headline(F.all({ ...CISTO,
    invoices: [{ id: 'i1', status: 'sent', due_date: '2026-08-01' }] }));
  ok(/kroku 14/.test(jedno.text), 'pri jednom mieste sa povie číslo kroku');

  const sledovat = F.headline(F.all({ ...CISTO,
    contracts: [{ id: 'z1', status: 'active', signed_at: null }] }));
  eq(sledovat.tone, 'watch', 'nepodpísaná zmluva je na sledovanie');
  ok(/Nič nehorí/.test(sledovat.text), 'a povie sa to rovno');

  eq(F.headline([]).step, null, 'prázdny zoznam nespadne');
}

// ── Dráhy ───────────────────────────────────────────────────────────────────
console.log('Dráhy');
{
  const l = F.lanes(CISTO);
  eq(l.map(x => x.key), ['ludia', 'zakazky', 'spolu', 'peniaze'],
    'štyri dráhy v poradí, v akom sa myslí');
  eq(l.map(x => x.steps.length), [4, 4, 1, 5], 'a kroky v nich');
  eq(l.every(x => x.steps.length > 0), true, 'prázdna dráha by bola chyba v definícii');
  eq(l.every(x => x.label && x.lead), true, 'každá dráha má názov aj vysvetlenie');
}

// ── Odolnosť ────────────────────────────────────────────────────────────────
console.log('Odolnosť');
{
  const prazdne = F.all({});
  eq(prazdne.length, 14, 'prázdny balík dá všetky kroky');
  eq(prazdne.every(k => k.todoText), true, 'a každý niečo povie');
  eq(F.step('neexistuje', CISTO), null, 'neznámy krok nevráti nič, nespadne');
  // Keď príde jeden dotaz rozbitý, zvyšok mapy musí zostať užitočný.
  eq(F.step('call', { candidates: null }).todo, 0, 'chýbajúce pole je prázdny zoznam');
  eq(F.step('timesheets', { timesheets: [{ hours: 'x', period_id: null }] }).have, 0,
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
  const draky = new Set(F.LANES.map(l => l.key));
  for (const s of F.STEPS) {
    ok(s.title && s.lead, `${s.key}: má názov aj vetu, čo to je`);
    ok(s.next, `${s.key}: má napísané, čo je po ňom`);
    ok(s.ico, `${s.key}: má ikonu`);
    ok(s.route, `${s.key}: vedie na obrazovku`);
    ok(draky.has(s.lane), `${s.key}: patrí do existujúcej dráhy`);
    ok(typeof s.have === 'function' && typeof s.todo === 'function'
      && typeof s.haveText === 'function', `${s.key}: má všetky tri funkcie`);
    // Veta „čo to je" má byť veta, nie nálepka.
    ok(s.lead.length > 30 && /[.!?]$/.test(s.lead), `${s.key}: vysvetlenie je veta`);
  }
  // Posledný krok reťazec uzatvára — ak pribudne ďalší, toto treba prepísať
  // vedome, nie omylom.
  ok(/uzavrel/.test(F.STEPS[F.STEPS.length - 1].next),
    'posledný krok povie, že tým sa to končí');
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
