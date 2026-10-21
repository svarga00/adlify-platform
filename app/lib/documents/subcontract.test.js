// ============================================================================
// Testy rámcovej zmluvy o dielo so živnostníkom
// Spustenie:  node app/lib/documents/subcontract.test.js
// ============================================================================
// Je to jediný papier, ktorý drží celý model: bez neho to nie je subdodávka,
// ale zamestnávanie — a pri kontrole to nesie firma, nie živnostník.
//
// Preto sa tu nestráži len to, či sa text poskladá, ale aj to, čo by sa dalo
// stratiť ticho: že sumy a lehoty sa dajú prepísať v Nastaveniach, že sa
// nikam nedostane prázdne miesto a že zmluva naozaj končí koncom roka.
// ============================================================================
global.window = global;
const S = require('./subcontract.js');

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

console.log('Rámcová zmluva o dielo');

const CLOVEK = { full_name: 'Cyril Demeter', company_id: '53941870',
  address: 'Brekov 81, 066 01 Brekov', bank_iban: 'SK89 0000' };
const FIRMA = { name: 'Partner und Service s. r. o.', company_id: '57 553 921',
  address: 'Podzámska 9468/4A, 940 71 Nové Zámky', tax_id: '2122816839',
  register: 'Obchodný register Okresného súdu Nitra, odd. Sro, vl. č. 69265/N' };

const text = (z) => z.clanky.map(c => c.body.join(' ')).join(' ');
const clanok = (z, rim) => z.clanky.find(c => c.rim === rim);

// ── Stavba zmluvy ───────────────────────────────────────────────────────────
{
  const z = S.build({ worker: CLOVEK, supplier: FIRMA, signedAt: '2026-10-16',
    number: '2026-093' });

  eq(z.clanky.length, 12, 'má dvanásť článkov (I. sú zmluvné strany na papieri)');
  eq(z.clanky.map(c => c.rim),
    ['II.', 'III.', 'IV.', 'V.', 'VI.', 'VII.', 'VIII.', 'IX.', 'X.', 'XI.', 'XII.', 'XIII.'],
    'a idú po poradí od druhého');
  ok(z.clanky.every(c => c.nadpis && c.body.length), 'každý má nadpis aj obsah');
  ok(!/\{\{/.test(text(z)), 'v texte nezostala žiadna nevyplnená značka');

  // „Zvyčajne do konca kalendárneho roka."
  eq(z.validTo, '2026-12-31', 'zmluva končí koncom roka, v ktorom sa podpisuje');
  ok(/31\. 12\. 2026/.test(clanok(z, 'X.').body[0]),
    'a je to napísané v článku o trvaní', clanok(z, 'X.').body[0].slice(0, 90));
  eq(S.build({ signedAt: '2027-03-01' }).validTo, '2027-12-31', 'v inom roku iný koniec');
  eq(S.build({ signedAt: '2026-10-16', validTo: '2027-06-30' }).validTo, '2027-06-30',
    'a dá sa prepísať na iný dátum');
}

// ── Sumy a lehoty sa prepisujú v Nastaveniach ───────────────────────────────
// Toto je celý dôvod, prečo je zmluva dáta a nie HTML: právnik opraví vetu,
// majiteľ zdvihne pokutu a nikto nemá siahať do kódu.
{
  const zakl = S.build({ worker: CLOVEK, supplier: FIRMA });
  ok(/250 €/.test(clanok(zakl, 'VIII.').body[1]), 'predvolená pokuta za deň omeškania');
  ok(/50 €/.test(clanok(zakl, 'VI.').body[3]), 'predvolený poplatok pri zrážkovej dani');
  ok(/500 €/.test(clanok(zakl, 'VI.').body[4]), 'predvolená pokuta za alkohol');

  const iné = S.build({ worker: CLOVEK, supplier: FIRMA,
    rules: { pokuta_omeskanie_den: 300, freistellung_poplatok: 80, splatnost_dni: 30 } });
  ok(/300 €/.test(clanok(iné, 'VIII.').body[1]), 'prepísaná pokuta sa prejaví v texte');
  ok(/80 €/.test(clanok(iné, 'VI.').body[3]), 'aj prepísaný poplatok');
  ok(/30 dní/.test(clanok(iné, 'V.').body[4]), 'aj prepísaná splatnosť');
  ok(!/250 €/.test(text(iné)), 'a stará hodnota v zmluve nikde nezostala');

  // Nezmysel z Nastavení sa neberie — nula dní splatnosti nie je dohoda.
  const nezmysel = S.build({ rules: { splatnost_dni: 0, zaruka_mes: -5, pokuta_alkohol: 'veľa' } });
  ok(/14 dní/.test(clanok(nezmysel, 'V.').body[4]), 'nula sa ignoruje');
  ok(/24 mesiacov/.test(clanok(nezmysel, 'VII.').body[1]), 'záporné číslo tiež');
  ok(/500 €/.test(clanok(nezmysel, 'VI.').body[4]), 'a text namiesto čísla tiež');
}

// ── Veci, ktoré si firma vyskúšala na vlastnej koži ─────────────────────────
// Toto nie je vzor z internetu. Keby niektorá z týchto viet zo zmluvy vypadla,
// firma by na to doplatila — doslova.
{
  const z = S.build({ worker: CLOVEK, supplier: FIRMA });
  const t = text(z);

  ok(/A1/.test(t) && /Freistellung/.test(t),
    'A1 aj Freistellung sú v zmluve menovite');
  ok(/stavebnú zrážkovú daň/.test(t),
    'aj to, čo sa stane, keď si Freistellung nevybaví');
  ok(/montážny denník/.test(t) && /súpis vykonaných prác/.test(t),
    'podklady k faktúre sú vymenované');
  ok(/všetky tri podklady súčasne/.test(t),
    'a je povedané, že musia byť všetky tri naraz');
  ok(/3\. dňa nasledujúceho týždňa/.test(t), 'aj dokedy sa posielajú súpisy');
  ok(/poistenie všeobecnej zodpovednosti/.test(t), 'poistenie je povinné');
  ok(/ubytovanie/i.test(t), 'ubytovanie si platí on');
  ok(/zákaz(u)? konkurencie/i.test(t), 'zákaz konkurencie tam je');

  // Dielo, nie hodiny — na tom stojí celý model.
  ok(/individuálnych zmlúv o dielo/.test(t), 'je to zmluva o dielo, nie o práci');
  ok(!/pracovn(ý|ého) pomer/i.test(t), 'a nikde sa nespomína pracovný pomer');
}

// ── Skloňovanie ─────────────────────────────────────────────────────────────
// Zmluva, v ktorej stojí „1 dni", vyzerá ako vygenerovaná — a to je presne
// ten dojem, aký nemá robiť.
{
  eq(S.plural(1, 'deň', 'dni', 'dní'), 'deň', 'jeden deň');
  eq(S.plural(2, 'deň', 'dni', 'dní'), 'dni', 'dva dni');
  eq(S.plural(5, 'deň', 'dni', 'dní'), 'dní', 'päť dní');
  const jeden = S.build({ rules: { vypoved_mes: 1, sucin_dni: 1 } });
  ok(/1 mesiac(?!e|ov)/.test(clanok(jeden, 'X.').body[2]), 'výpoveď na jeden mesiac');
  ok(/1 deň/.test(clanok(jeden, 'III.').body[2]), 'akceptácia do jedného dňa');
}

// ── Čo chýba pred podpisom ──────────────────────────────────────────────────
{
  eq(S.missing({ worker: CLOVEK, supplier: FIRMA }), [], 'kompletné údaje nič nevyčítajú');

  const chyba = S.missing({ worker: {}, supplier: {} });
  eq(chyba.length, 7, 'bez údajov chýba sedem vecí');
  ok(chyba.every(c => c.title && c.title.length > 3), 'a každá je pomenovaná po slovensky');

  // Zmluva bez IČO zhotoviteľa nie je zmluva so živnostníkom.
  const bezIco = S.missing({ worker: { ...CLOVEK, company_id: '' }, supplier: FIRMA });
  eq(bezIco.map(c => c.key), ['company_id'], 'chýbajúce IČO živnostníka sa pomenuje');
  const bezRegistra = S.missing({ worker: CLOVEK, supplier: { ...FIRMA, register: '' } });
  eq(bezRegistra.map(c => c.key), ['register'], 'aj chýbajúci zápis v registri');
  eq(S.missing({ worker: { ...CLOVEK, company_id: '   ' }, supplier: FIRMA }).length, 1,
    'samé medzery nie sú údaj');
}

// ── Dátum po slovensky ──────────────────────────────────────────────────────
{
  eq(S.den('2026-10-16'), '16. 10. 2026', 'dátum sa píše po slovensky');
  eq(S.den('2026-01-05'), '5. 1. 2026', 'bez vedúcich núl');
  eq(S.den(''), '', 'prázdny dátum nespadne');
  eq(S.den('nezmysel'), 'nezmysel', 'a nezmysel sa nevydáva za dátum');
  eq(S.koniecRoka('2026-02-02'), '2026-12-31', 'koniec roka sa počíta z podpisu');
  eq(S.eur(2500), '2 500 €'.replace(/ /, ' '), 'suma je po slovensky');
}

// ── Číslo zmluvy ────────────────────────────────────────────────────────────
// Navrhuje sa z už zapísaných zmlúv, nie z počítadla faktúr.
{
  eq(S.nextNumber([], 2026), '2026-001', 'prvá zmluva v roku');
  eq(S.nextNumber(['2026-093', '2026-012'], 2026), '2026-094', 'ďalšia po najvyššej');
  eq(S.nextNumber(['2025-140', '2026-002'], 2026), '2026-003', 'minulý rok sa nepočíta');
  eq(S.nextNumber(['2026/7', ' 2026-008 '], 2026), '2026-009', 'lomka aj medzery sa znesú');
  eq(S.nextNumber(['ZoD-12', null, '', 'abc'], 2026), '2026-001', 'cudzie tvary sa ignorujú');
  eq(S.nextNumber(['2026-999'], 2026), '2026-1000', 'za 999 to nespadne');
}

// ── Vyhotovovanie faktúr za živnostníka ────────────────────────────────────
{
  const bez = S.build({ worker: { full_name: 'Ján' }, supplier: {} });
  ok(!/Vyhotovovanie faktúr Objednávateľom/.test(text(bez)), 'bez dohody v zmluve nie je');
  const s = S.build({ worker: { full_name: 'Ján', self_billing: true }, supplier: {} });
  const v = clanok(s, 'V.');
  ok(v.body.some(p => /Vyhotovovanie faktúr Objednávateľom/.test(p)), 'so živnostníkom, za ktorého fakturujeme, je v článku V.');
  ok(/do 5 dní od doručenia nevznesie námietku/.test(text(s)), 'lehota na námietku');
  ok(/samostatnom číselnom rade Zhotoviteľa/.test(text(s)), 'vlastný číselný rad');
  ok(/zodpovedá Zhotoviteľ/.test(text(s)), 'za údaje zodpovedá živnostník');
  eq(s.clanky.length, bez.clanky.length, 'počet článkov sa nemení — číslovanie sedí');
  ok(S.build({ worker: { self_billing: true }, selfBilling: false }).selfBilling === false, 'dá sa vypnúť');
  ok(/do 7 dní od doručenia/.test(text(S.build({ worker: { self_billing: true }, rules: { samofakt_namietka_dni: 7 } }))),
    'lehota sa berie z Nastavení');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
