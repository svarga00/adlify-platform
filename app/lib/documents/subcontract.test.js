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

const text = (z) => z.clanky.map(c => c.body.map(S.bodText).join(' ')).join(' ');
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
  // Počty bodov ako v šablóne na Drive (V. má navyše body 10 až 14 o vyhotovení
  // faktúry odberateľom, XI. bod 2 o samostatnom súhlase GDPR).
  eq(z.clanky.map(c => c.body.length), [3, 7, 9, 14, 14, 8, 6, 4, 6, 2, 2, 4],
    'počet bodov v článkoch sedí so šablónou');
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
  // Sumy ako v šablóne na Drive: 300 € za deň omeškania, 3 000 € za nenastúpenie.
  eq(S.SUMY.pokuta_omeskanie_den, 300, 'pokuta za deň omeškania je 300 € (šablóna)');
  eq(S.SUMY.pokuta_nenastupenie, 3000, 'pokuta za nenastúpenie je 3 000 € (šablóna)');
  ok(/vo výške 300 € za každý deň omeškania/.test(clanok(zakl, 'VIII.').body[1]), 'predvolená pokuta za deň omeškania v texte');
  ok(/vo výške 3\s000 € pre prípad porušenia povinnosti dostaviť sa/.test(clanok(zakl, 'VIII.').body[2]),
    'predvolená pokuta za nenastúpenie v texte', clanok(zakl, 'VIII.').body[2].slice(0, 80));
  ok(/článku IX\. bod 4/.test(clanok(zakl, 'VIII.').body[0]), 'zákaz konkurencie odkazuje na čl. IX bod 4');
  ok(/50 €/.test(clanok(zakl, 'VI.').body[4]), 'predvolený poplatok pri zrážkovej dani');
  ok(/500 €/.test(clanok(zakl, 'VI.').body[5]), 'predvolená pokuta za alkohol');
  ok(!/250 €|2\s500 €/.test(text(zakl)), 'staré sumy 250 € a 2 500 € v zmluve nie sú');

  const iné = S.build({ worker: CLOVEK, supplier: FIRMA,
    rules: { pokuta_omeskanie_den: 350, freistellung_poplatok: 80, splatnost_dni: 30 } });
  ok(/350 €/.test(clanok(iné, 'VIII.').body[1]), 'prepísaná pokuta sa prejaví v texte');
  ok(/80 €/.test(clanok(iné, 'VI.').body[4]), 'aj prepísaný poplatok');
  ok(/30 dní/.test(clanok(iné, 'V.').body[4]), 'aj prepísaná splatnosť');
  ok(!/300 € za každý deň/.test(text(iné)), 'a stará hodnota v zmluve nikde nezostala');

  // Nezmysel z Nastavení sa neberie — nula dní splatnosti nie je dohoda.
  const nezmysel = S.build({ rules: { splatnost_dni: 0, zaruka_mes: -5, pokuta_alkohol: 'veľa' } });
  ok(/14 dní/.test(clanok(nezmysel, 'V.').body[4]), 'nula sa ignoruje');
  ok(/24 mesiacov/.test(clanok(nezmysel, 'VII.').body[1]), 'záporné číslo tiež');
  ok(/500 €/.test(clanok(nezmysel, 'VI.').body[5]), 'a text namiesto čísla tiež');
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
  ok(/všetky 3 podklady súčasne/.test(t),
    'a je povedané, že musia byť všetky tri naraz');
  ok(/3-ho dňa nasledujúceho týždňa/.test(t), 'aj dokedy sa posielajú súpisy');
  // Odsek V.7: bez týždenných súpisov (bod 3) sa platiť nemusí.
  ok(/podľa bodu 2 tohto článku alebo si nesplní povinnosti podľa bodu 3/.test(clanok(z, 'V.').body[6]),
    'platbu možno odmietnuť aj bez týždenných súpisov (bod 3)');
  // Nástup sa smie oznámiť aj SMS alebo cez WhatsApp.
  ok(/SMS, Whatsapp alebo inú platformu/.test(clanok(z, 'VI.').body[0]), 'miesto a čas nástupu aj cez SMS/WhatsApp');
  // Ubytovanie a doprava, ktoré sprostredkujeme, sa strhnú z jeho faktúry.
  ok(/sprostredkuje ubytovanie, prípadne dopravu/.test(clanok(z, 'VI.').body[8])
    && /započítané oproti faktúre Zhotoviteľa/.test(clanok(z, 'VI.').body[8]),
    'ubytovanie a doprava od nás sa započítajú oproti jeho faktúre');
  // Viac zhotoviteľov na jednom diele a nevie sa, kto je vinný: rovným dielom.
  ok(/rovným dielom/.test(clanok(z, 'VII.').body[7]), 'zodpovednosť za vady rovným dielom pri viacerých zhotoviteľoch');
  ok(/môže vykonávať diela podľa tejto zmluvy aj prostredníctvom svojich zamestnancov/.test(clanok(z, 'IV.').body[1]),
    'môže robiť aj cez vlastných zamestnancov');
  ok(/viazaný pokynmi Objednávateľa/.test(clanok(z, 'IV.').body[5]), 'pri spôsobe vykonania je viazaný pokynmi');
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
  ok(/mesačnou výpovednou lehotou/.test(clanok(jeden, 'X.').body[3]), 'výpoveď na jeden mesiac (ako v šablóne)');
  ok(/výpovednou lehotou 2 mesiace/.test(clanok(S.build({ rules: { vypoved_mes: 2 } }), 'X.').body[4]),
    'dva mesiace sa skloňujú');
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

// ── Článok X: body 1 až 6, v bode 6 písmená a) až i) ───────────────────────
// Ukončovací list cituje „Článok X, bod 6g". Keby číslovanie nesedelo, list
// by sa odvolával na bod, ktorý v zmluve nie je.
{
  const z = S.build({ worker: CLOVEK, supplier: FIRMA, signedAt: '2026-10-06' });
  const x = clanok(z, 'X.');
  eq(x.body.length, 6, 'článok X má šesť bodov');
  eq(S.BOD_ODSTUPENIE, 6, 'dôvody odstúpenia sú v bode 6');
  const b6 = x.body[S.BOD_ODSTUPENIE - 1];
  ok(b6 && b6.letters === true && Array.isArray(b6.list), 'bod 6 je vymenovanie s písmenami');
  eq(b6.list.length, 9, 'bod 6 má deväť dôvodov');
  eq(S.DOVODY.map(d => d.p).join(''), 'abcdefghi', 'písmená a) až i)');
  eq(S.DOVODY[6].text, 'nemá dostatok práce určený pre zhotoviteľa', 'písmeno g) doslovne ako v šablóne');
  ok(/neuspeje/.test(S.DOVODY[7].text) && /alkoholických/.test(S.DOVODY[8].text), 'h) skúška, i) alkohol');
  ok(/g\) nemá dostatok práce/.test(S.bodText(b6)), 'v texte bodu je písmeno g)');
  ok(/končí dňom 31\. 12\. 2026/.test(x.body[0]), 'bod 1 — trvanie do konca roka');
  eq(x.body[2], 'Zmluva končí uplynutím času, na ktorý bola uzavretá.', 'bod 3 — uplynutie času');
  ok(/Objednávateľ môže túto zmluvu/.test(x.body[3]) && /doručená zhotoviteľovi/.test(x.body[3]), 'bod 4 — výpoveď objednávateľa');
  ok(/Zhotoviteľ môže túto zmluvu/.test(x.body[4]) && /doručená objednávateľovi/.test(x.body[4]), 'bod 5 — výpoveď zhotoviteľa');
}

// ── Vyhotovenie faktúry odberateľom (čl. V. body 10 až 14) ───────────────────
// Rozhodnutie majiteľa: zmluva to dovoľuje vždy, predvolene však fakturuje
// živnostník sám (vzor faktúry V1.3).
{
  const bez = S.build({ worker: { full_name: 'Ján' }, supplier: {} });
  const so = S.build({ worker: { full_name: 'Ján', self_billing: true }, supplier: {} });
  const v = clanok(bez, 'V.');
  eq(v.body.length, 14, 'článok V. má body 1 až 9 zo šablóny a 10 až 14 o vyhotovení faktúry');
  ok(/vyhotovenie faktúry odberateľom/.test(v.body[9]), 'bod 10 dovoľuje vyhotoviť faktúru v jeho mene');
  ok(/oprávnením, nie povinnosťou/.test(v.body[9]), 'je to možnosť, nie povinnosť');
  ok(/vystavuje faktúry Zhotoviteľ podľa bodov 2 až 9/.test(v.body[9]), 'inak fakturuje on sám');
  ok(/222\/2004/.test(v.body[9]), 'odkaz na zákon o DPH');
  ok(/do 5 dní od jej doručenia nevznesie/.test(text(bez)), 'lehota na námietku');
  ok(/samostatnom číselnom rade Zhotoviteľa/.test(text(bez)), 'vlastný číselný rad');
  ok(/zodpovedá Zhotoviteľ/.test(text(bez)), 'za údaje zodpovedá živnostník');
  eq(JSON.stringify(so.clanky), JSON.stringify(bez.clanky), 'text zmluvy je rovnaký so samofakturáciou aj bez nej');
  eq(so.selfBilling, true, 'príznak sa však zachová (vzor faktúry podľa neho vie, kto fakturuje)');
  ok(S.build({ worker: { self_billing: true }, selfBilling: false }).selfBilling === false, 'dá sa vypnúť');
  ok(/do 7 dní od jej doručenia/.test(text(S.build({ rules: { samofakt_namietka_dni: 7 } }))),
    'lehota sa berie z Nastavení');
  // Body 1 až 9 sa nepohli — odkazy „podľa bodu 2/3 tohto článku" platia.
  ok(/každých 14 dní/.test(v.body[1]) && /súpis vykonaných prác/.test(v.body[1]), 'bod 2 — fakturácia a podklady');
  ok(/Súpisy prác/.test(v.body[2]), 'bod 3 — týždenné súpisy');
  ok(/Splatnosť jednotlivých faktúr je 14 dní od ich doručenia/.test(v.body[4]), 'bod 5 — splatnosť 14 dní od doručenia');
}

// ── Zoznam činností do Objednávky ───────────────────────────────────────────
{
  eq(S.CINNOSTI.length, 4, 'štyri činnosti zo zoznamu platného od 26.04.2026');
  eq(S.CINNOSTI_OD, '2026-04-26', 'platný od 26. 4. 2026');
  eq(S.CINNOSTI[0].text, 'Dokončovacie stavebné práce pri realizácii exteriérov a interiérov', 'prvá doslovne');
  ok(S.CINNOSTI[2].remesla.includes('zvárači'), 'zvárači majú kovovýrobu');
  eq(S.cinnosti({}).length, 4, 'bez Nastavení platí predvolený zoznam');
  eq(S.cinnosti({ cinnosti: 'Prvá /maliari, allrounder/\n\n  Druhá  ' }),
    [{ text: 'Prvá', remesla: ['maliari', 'allrounder'] }, { text: 'Druhá', remesla: [] }],
    'zoznam z Nastavení: riadok = činnosť, remeslá za lomkou');
  eq(S.cinnostRiadok(S.CINNOSTI[1]), 'Prípravné práce k realizácii stavby /viazači železa, allrounder/',
    'a späť do riadku Nastavení');
  eq(S.cinnosti({ cinnosti: S.CINNOSTI.map(S.cinnostRiadok).join('\n') }), S.CINNOSTI, 'tam a späť sa nič nestratí');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
