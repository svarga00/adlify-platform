// ============================================================================
// Testy inzerátov a otázok do hovoru
// Spustenie:  node app/lib/recruiting/ads.test.js
// ============================================================================
// Inzerát je prvá vec, ktorú treba v hovore vedieť. Keď sa z neho stratí, čo
// sme sľúbili, zistí sa to až na stavbe — a to je najdrahšie miesto, kde sa
// dá zistiť nedorozumenie o sadzbe.
// ============================================================================
global.window = global;
const A = require('./ads');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

const TODAY = '2026-09-28';

console.log('Inzeráty');

// ── Beží dnes? ──────────────────────────────────────────────────────────────
{
  ok(A.isRunning({ active: true }, TODAY), 'inzerát bez termínov beží, kým ho niekto nevypne');
  ok(!A.isRunning({ active: false }, TODAY), 'vypnutý nebeží ani v termíne');
  ok(A.isRunning({ active: true, starts_on: '2026-09-01', ends_on: '2026-10-31' }, TODAY),
    'v termíne beží');
  ok(!A.isRunning({ active: true, starts_on: '2026-10-01' }, TODAY), 'pred začiatkom ešte nie');
  ok(!A.isRunning({ active: true, ends_on: '2026-09-27' }, TODAY), 'po konci už nie');
  // Hranice sú vrátane — inzerát platí aj v posledný deň.
  ok(A.isRunning({ active: true, ends_on: TODAY }, TODAY), 'posledný deň ešte platí');
  ok(A.isRunning({ active: true, starts_on: TODAY }, TODAY), 'prvý deň už platí');
  ok(!A.isRunning(null, TODAY), 'nič nebeží');
}

// ── Ponuka do hovoru ────────────────────────────────────────────────────────
{
  const ads = [
    { id: 'stary', title: 'Murári jar', active: false, starts_on: '2026-03-01' },
    { id: 'novy', title: 'Sadrokartón Mníchov', active: true, starts_on: '2026-09-20' },
    { id: 'starsi', title: 'Murári Stuttgart', active: true, starts_on: '2026-08-01' },
  ];
  const out = A.forCall(ads, TODAY);
  eq(out.map(a => a.id), ['novy', 'starsi', 'stary'],
    'bežiace hore, v rámci nich najnovšie');
  // Dobehnutý inzerát sa nevyhadzuje — ozvať sa môže aj o mesiac.
  ok(out.find(a => a.id === 'stary'), 'dobehnutý zostáva na výber');
  eq(out.find(a => a.id === 'stary').running, false, 'ale je označený, že nebeží');
  eq(A.forCall(null, TODAY), [], 'bez inzerátov prázdno, nie pád');
}

// ── Čo sme sľúbili ──────────────────────────────────────────────────────────
// Toto je dôvod, prečo je inzerát vlastný záznam. Keď sa o mesiac povie
// „veď ste písali 18 €", musí byť po ruke, čo tam naozaj bolo.
{
  const ad = { rate_offered: 18.5, promise: ['ubytovanie platíme', 'výplata do 10. dňa', ''] };
  eq(A.promiseLines(ad), ['18,5 €/h', 'ubytovanie platíme', 'výplata do 10. dňa'],
    'sadzba prvá, prázdne body preč');
  eq(A.promiseLines({ promise: ['auto na stavbu'] }), ['auto na stavbu'],
    'inzerát bez sadzby má aspoň zvyšok');
  eq(A.promiseLines({}), [], 'bez sľubov prázdno');
  eq(A.promiseLines(null), [], 'a bez inzerátu tiež');

  eq(A.subtitle({ channel: 'facebook', channel_detail: 'Práca v Nemecku', city: 'Stuttgart', rate_offered: 18 }),
    'Facebook · Práca v Nemecku · Stuttgart · 18 €/h', 'popis pod názvom povie to podstatné');
  eq(A.channelLabel('portal'), 'Pracovný portál', 'kanál má slovenský názov');
  eq(A.channelLabel('nieco'), 'nieco', 'neznámy kanál vráti sám seba');
}

// ── Kam otázka v hovore patrí ───────────────────────────────────────────────
{
  eq(A.questionSegment({ kind: 'knowledge' }), 'trade', 'odborná otázka patrí k remeslu');
  eq(A.questionSegment({ kind: 'hidden' }), 'verify', 'overovacia do overenia');
  eq(A.questionSegment({ kind: 'legal' }), 'legal', 'papiere k papierom');
  eq(A.questionSegment({ kind: 'motivation' }), 'money', 'motivácia k peniazom');
  eq(A.questionSegment({ kind: 'knowledge', segment: 'money' }), 'money',
    'zadané zaradenie má prednosť pred druhom');
  // Nová otázka bez druhu nesmie zmiznúť z hovoru.
  eq(A.questionSegment({}), 'trade', 'bez druhu spadne k remeslu, nie mimo hovoru');
  eq(A.questionSegment(null), 'trade', 'a null nezhodí');
}

// ── Ktoré otázky na tento hovor sedia ───────────────────────────────────────
{
  const questions = [
    { id: 'u', question_sk: 'Univerzálna', weight: 1 },
    { id: 'm', question_sk: 'Murárska', trade_key: 'murar', weight: 1 },
    { id: 's', question_sk: 'Sadrokartonárska', trade_key: 'sadrokartonar' },
    { id: 'i', question_sk: 'K inzerátu', ad_id: 'ad1' },
    { id: 'i2', question_sk: 'K inému inzerátu', ad_id: 'ad2' },
    { id: 'x', question_sk: 'Vypnutá', active: false },
    { id: 'os', question_sk: 'Až na pohovore', phase: 'interview' },
  ];
  const out = A.questionsFor({ questions, tradeKey: 'murar', adId: 'ad1' });
  eq(out.map(q => q.id), ['i', 'm', 'u'],
    'inzerát, potom remeslo, potom univerzálne — od najkonkrétnejšieho');
  ok(!out.find(q => q.id === 'x'), 'vypnutá otázka sa nepýta');
  ok(!out.find(q => q.id === 'os'), 'ani tá, ktorá patrí až na pohovor');
  ok(!out.find(q => q.id === 's'), 'ani otázka k cudziemu remeslu');
  ok(!out.find(q => q.id === 'i2'), 'ani otázka k inému inzerátu');

  eq(A.questionsFor({ questions, tradeKey: null, adId: null }).map(q => q.id), ['u'],
    'bez remesla a inzerátu zostanú len univerzálne');
  eq(A.questionsFor({}).length, 0, 'bez otázok prázdno');

  // Ťažšia otázka ide vyššie — na tú sa treba opýtať tak či tak.
  const vahy = A.questionsFor({
    questions: [
      { id: 'lahka', weight: 1, sort_order: 1 },
      { id: 'tazka', weight: 3, sort_order: 9 },
    ],
  });
  eq(vahy.map(q => q.id), ['tazka', 'lahka'], 'rozhodujúca otázka je vyššie');
}

// ── Otázky prilepené k hovoru ───────────────────────────────────────────────
{
  const ORDER = ['intro', 'trade', 'verify', 'legal', 'logistics', 'money'];
  const segments = [
    { key: 'intro', title: 'Úvod', chips: [{ id: 'c1' }] },
    { key: 'legal', title: 'Papiere', chips: [{ id: 'c2' }] },
  ];
  const questions = [
    { id: 'q1', kind: 'knowledge' },       // → trade, segment bez polí
    { id: 'q2', kind: 'legal' },           // → legal, segment polia má
  ];
  const out = A.withQuestions(segments, questions, ORDER);

  eq(out.map(s => s.key), ['intro', 'trade', 'legal'],
    'segment, ktorý má len otázky, sa doplní na svoje miesto v hovore');
  eq(out.find(s => s.key === 'legal').questions.map(q => q.id), ['q2'],
    'otázka sa prilepí k správnej časti');
  eq(out.find(s => s.key === 'intro').questions, [], 'časť bez otázok má prázdny zoznam');
  eq(out.find(s => s.key === 'trade').chips, [], 'doplnená časť nemá polia, len otázky');
  eq(out.find(s => s.key === 'legal').chips.length, 1, 'a existujúce polia zostanú');

  // Na konci hovoru sa doplnený segment nesmie prelepiť pred úvod.
  const koniec = A.withQuestions(
    [{ key: 'intro', title: 'Úvod', chips: [] }], [{ id: 'q', kind: 'motivation' }], ORDER);
  eq(koniec.map(s => s.key), ['intro', 'money'], 'peniaze idú až za úvod');

  eq(A.withQuestions([], [], ORDER), [], 'bez ničoho prázdno');
  eq(A.withQuestions(null, null, ORDER), [], 'a bez vstupu tiež');
}

// ── Ako sa inzerátu darí ────────────────────────────────────────────────────
{
  const p = A.performance({ candidates: 10, contacted: 8, hired: 2 });
  eq(p.contactRate, 80, 'koľkým sme sa stihli ozvať späť');
  eq(p.hireRate, 20, 'a koľko z nich nastúpilo');
  eq(A.performance({ candidates: 0 }).contactRate, null,
    'bez odpovedí sa percento nepočíta — nula z nuly nie je nula percent');
  eq(A.performance(null).candidates, 0, 'bez dát to nespadne');
}


// ── Odkiaľ ľudia naozaj prišli ──────────────────────────────────────────────
// Obrazovka kandidátov zoskupovala podľa `source` — voľného poľa, ktoré hovor
// nikdy nevyplnil. Na obrazovke preto stálo „Iné: 2" a nedalo sa z toho nič
// prečítať, hoci hovor sa začína otázkou, na ktorý inzerát kandidát volá.
{
  const ads = [
    { id: 'a1', title: 'Murári Stuttgart FB', channel: 'facebook' },
    { id: 'a2', title: 'Sadrokartonári Mníchov', channel: 'portal' },
  ];
  const cands = [
    { ad_id: 'a1', status: 'placed', first_contact_at: '2026-01-01' },
    { ad_id: 'a1', status: 'new' },
    { ad_id: 'a2', status: 'placed', first_contact_at: '2026-01-01' },
    { ad_id: 'a2', status: 'placed' },
    { source: 'referral', status: 'new' },
    { status: 'new' },
  ];
  const f = A.funnel(cands, ads);

  // Rozhoduje, kto nastúpil — nie kto sa ozval. Inzerát, na ktorý sa ozve
  // tridsať ľudí a nikto nenastúpi, nie je lepší než ten s dvoma, čo robia.
  eq(f.map(r => r.label),
    ['Sadrokartonári Mníchov', 'Murári Stuttgart FB', 'Bez inzerátu', 'Odporúčanie'],
    'zoradené podľa nastúpených, nie podľa počtu ozvaní');
  eq(f[0].placed, 2, 'počíta sa, koľkí nastúpili');
  eq(f[0].hireRate, 100, 'aj podiel');
  eq(f[1].contacted, 1, 'a komu sme sa stihli ozvať späť');
  eq(f[1].contactRate, 50, 'aj to v percentách');
  eq(f[0].sub, 'Pracovný portál', 'pri inzeráte je vidieť kanál');

  // Kto prišiel mimo inzerátu, musí byť vidieť zvlášť — inak sa tvári, že
  // vieme, odkiaľ je.
  const bez = f.find(r => r.key === 'src:unknown');
  ok(bez && bez.total === 1, 'kandidát bez inzerátu aj bez zdroja je zvlášť');
  ok(bez.sub.includes('nevieme'), 'a je napísané, že to nevieme');
  eq(f.find(r => r.key === 'src:referral').label, 'Odporúčanie',
    'kto prišiel cez známeho, spadne pod svoj kanál');

  eq(A.funnel([], ads), [], 'bez kandidátov je to prázdne');
  eq(A.funnel(null, null), [], 'a chýbajúce vstupy nezhodia');
  eq(A.funnel([{ ad_id: 'neznamy', status: 'new' }], ads)[0].label, 'Bez inzerátu',
    'odkaz na inzerát, ktorý neexistuje, sa nerozsype');

  // Veta pod grafom
  ok(A.funnelSentence(f).includes('Sadrokartonári Mníchov'),
    'veta povie, ktorý inzerát priviedol ľudí');
  ok(A.funnelSentence(f).includes('1 človeku'), 'a skloňuje správne');
  const nikto = A.funnel([{ status: 'new' }, { status: 'new' }], ads);
  ok(A.funnelSentence(nikto).includes('väzba vzniká pri hovore'),
    'keď nevieme pri nikom, povie sa, kde tá väzba vzniká');
  eq(A.funnelSentence([]), '', 'bez dát niet čo povedať');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
