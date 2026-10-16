// ============================================================================
// Testy rámcovej zmluvy s nemeckým odberateľom
// Spustenie:  node app/lib/documents/framework-de.test.js
// ============================================================================
// Dvojjazyčná zmluva má jednu slabinu, ktorú bežný test nevidí: **jedna
// verzia sa zmení a druhá nie.** Potom obe strany podpíšu papier, na ktorom
// každá číta niečo iné — a zistí sa to až pri spore.
//
// Preto sa tu pri každom odstavci kontroluje, že existujú obe verzie, že ani
// jedna nie je kratučká a že čísla v nich sedia.
// ============================================================================
global.window = global;
const F = require('./framework-de.js');

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

console.log('Rámcová zmluva s nemeckým odberateľom');

const FIRMA = { name: 'Partner und Service s. r. o.', address: 'Nové Zámky',
  company_id: '57 553 921', register: 'OR OS Nitra', iban: 'SK67 1100',
  vat_id: 'SK2122816839', tax_number_de: '214/633/08265' };
const KLIENT = { name: 'Kulzer GmbH', address: 'Straubing', ust_idnr: 'DE 164 536 345' };

const vsetky = (z) => z.clanky.flatMap(c => c.body);
const clanok = (z, rim) => z.clanky.find(c => c.rim === rim);

// ── Obe verzie musia existovať a hovoriť to isté ────────────────────────────
{
  const z = F.build({ supplier: FIRMA, client: KLIENT, signedAt: '2026-10-15',
    number: '2026-018' });

  eq(z.clanky.length, 7, 'má sedem článkov (I. sú zmluvné strany na papieri)');
  eq(z.clanky.map(c => c.rim), ['II.', 'III.', 'IV.', 'V.', 'VI.', 'VII.', 'VIII.'],
    'a idú po poradí od druhého');
  ok(z.clanky.every(c => c.sk && c.de), 'každý článok má nadpis v oboch jazykoch');

  // **Toto je to, čo sa pri dvojjazyčnom dokumente pokazí najľahšie.**
  const body = vsetky(z);
  ok(body.length >= 25, `odstavcov je ${body.length}`);
  const bezPary = body.filter(p => !p.sk || !p.de);
  ok(bezPary.length === 0, 'každý odstavec má slovenskú aj nemeckú verziu',
    JSON.stringify(bezPary));
  const kratke = body.filter(p => p.sk.length < 40 || p.de.length < 40);
  ok(kratke.length === 0, 'ani jedna verzia nie je odfláknutá',
    kratke.map(p => p.sk.slice(0, 40)).join(' | '));

  // Čísla musia sedieť v oboch jazykoch — to je presne to, na čom sa stavia spor.
  for (const p of body) {
    const cisla = (t) => (t.match(/\d+(?:[.,]\d+)?/g) || [])
      .map(x => x.replace(',', '.')).sort();
    const a = cisla(p.sk), b = cisla(p.de);
    ok(JSON.stringify(a) === JSON.stringify(b),
      `čísla sedia v oboch verziách: ${p.sk.slice(0, 45)}…`, `${a} vs ${b}`);
  }

  ok(!/\{\{/.test(JSON.stringify(z.clanky)), 'nezostala nevyplnená značka');
}

// ── Rozhodné právo je slovenské. To je zámer, nie prehliadnutie ─────────────
{
  const z = F.build({ supplier: FIRMA, client: KLIENT });
  const vii = clanok(z, 'VII.');
  ok(/Slovenskej republiky/.test(vii.body[0].sk), 'rozhodné právo je slovenské');
  ok(/Slowakischen Republik/.test(vii.body[0].de), 'aj v nemeckej verzii');
  ok(/593\/2008/.test(vii.body[0].sk) && /593\/2008/.test(vii.body[0].de),
    's odkazom na nariadenie Rím I');
  ok(/1215\/2012/.test(vii.body[1].sk) && /1215\/2012/.test(vii.body[1].de),
    'a Brusel I bis pri súdnej príslušnosti');
  ok(/súdov Slovenskej republiky/.test(vii.body[1].sk), 'príslušné sú slovenské súdy');
}

// ── Prázdne miesto v podpísanej zmluve ──────────────────────────────────────
// V origináli je „...... € za každú osobu a každý deň prestojov" — prázdne
// miesto. Prestoj je pritom to, čo firmu stojí najviac: ľudia sú na stavbe,
// platia sa, a nerobia, lebo chýba materiál.
{
  const bez = F.build({ supplier: FIRMA, client: KLIENT });
  eq(bez.prestojChyba, true, 'bez sumy appka vie, že údaj chýba');
  const v = clanok(bez, 'V.').body[4];
  ok(/………/.test(v.sk) && /………/.test(v.de),
    'a na papieri je to vidieť ako chýbajúci údaj, nie prázdno');
  ok(!/0 €/.test(v.sk), 'nula sa nevydáva za dohodnutú sumu — prestoj nie je zadarmo');

  const so = F.build({ supplier: FIRMA, client: KLIENT, rules: { prestoj_pokuta: 180 } });
  eq(so.prestojChyba, false, 'so sumou je to v poriadku');
  ok(/180 €/.test(clanok(so, 'V.').body[4].sk), 'suma je v slovenskej verzii');
  ok(/180 €/.test(clanok(so, 'V.').body[4].de), 'aj v nemeckej');
}

// ── Lehoty sa prepisujú v Nastaveniach ──────────────────────────────────────
{
  const zakl = F.build({ supplier: FIRMA, client: KLIENT });
  ok(/7 kalendárnych dní/.test(clanok(zakl, 'III.').body[1].sk),
    'predvolená splatnosť je sedem dní');
  ok(/7 Kalendertage/.test(clanok(zakl, 'III.').body[1].de), 'aj po nemecky');
  ok(/0,05 %/.test(clanok(zakl, 'III.').body[3].sk), 'predvolená pokuta za omeškanie');

  const iné = F.build({ supplier: FIRMA, client: KLIENT,
    rules: { splatnost_dni: 14, objednavka_dni: 3 } });
  ok(/14 kalendárnych dní/.test(clanok(iné, 'III.').body[1].sk), 'prepísaná splatnosť');
  ok(/14 Kalendertage/.test(clanok(iné, 'III.').body[1].de), 'v oboch jazykoch');
  ok(/3 pracovných dní/.test(clanok(iné, 'II.').body[2].sk), 'aj lehota na objednávku');
  ok(/3 Werktage/.test(clanok(iné, 'II.').body[2].de), 'v oboch jazykoch');

  const nezmysel = F.build({ rules: { splatnost_dni: 0, vypoved_dni: -3 } });
  ok(/7 kalendárnych dní/.test(clanok(nezmysel, 'III.').body[1].sk), 'nula sa ignoruje');
  ok(/7 Tagen/.test(clanok(nezmysel, 'VI.').body[2].de), 'aj záporné číslo');
}

// ── Čo chýba pred podpisom ──────────────────────────────────────────────────
{
  eq(F.missing({ supplier: FIRMA, client: KLIENT }), [], 'kompletné údaje nič nevyčítajú');
  eq(F.missing({}).length, 10, 'bez údajov chýba desať vecí');

  // Bez USt-IdNr odberateľa sa nedá fakturovať v reverse charge podľa §13b
  // a daň zaplatíme my.
  const bezUst = F.missing({ supplier: FIRMA, client: { ...KLIENT, ust_idnr: '' } });
  eq(bezUst.map(c => c.key), ['ust_idnr'], 'chýbajúce USt-IdNr sa pomenuje');
  const bezSteuer = F.missing({ supplier: { ...FIRMA, tax_number_de: '' }, client: KLIENT });
  eq(bezSteuer.map(c => c.key), ['tax_number_de'], 'aj naša Steuernummer');
  const bezIban = F.missing({ supplier: { ...FIRMA, iban: '' }, client: KLIENT });
  eq(bezIban.map(c => c.key), ['iban'], 'aj IBAN — bez neho nemá kam platiť');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
