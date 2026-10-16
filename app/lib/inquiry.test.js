// ============================================================================
// Testy dopytu od odberateľa
// Spustenie:  node app/lib/inquiry.test.js
// ============================================================================
// Vzorom je skutočný e-mail od B&M Projekte: tri stavby v jednom e-maile,
// jedna sadzba, nemecké platobné podmienky a trinásť ľudí dokopy. Testy sú
// písané naň — nie na vymyslený prípad.
// ============================================================================
global.window = global;
const I = require('./inquiry.js');

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

console.log('Dopyt od odberateľa');

// Tri stavby z jedného e-mailu, tak ako naozaj prišli.
const HAMMELBURG = {
  title: 'Neubau Schulzentrum Hammelburg', city: 'Hammelburg', country: 'DE',
  trade_key: 'sadrokartonar', headcount: 5, rate_client: 34, start_date: '2026-10-19',
  address: 'Am Hochstein 2–6, 97762 Hammelburg',
  requirements: ['Montáž podhľadov', 'Aspoň jeden v partii hovorí po nemecky'],
};
const FRIESENHEIM = {
  title: 'Friesenheim — suchá výstavba', city: 'Friesenheim', country: 'DE',
  trade_key: 'sadrokartonar', headcount: 4, rate_client: 34, start_date: '2026-10-19',
};
const GENGENBACH = {
  title: 'Gengenbach — suchá výstavba', city: 'Gengenbach', country: 'DE',
  trade_key: 'sadrokartonar', headcount: 4, rate_client: 34, start_date: '2026-10-20',
};
const VSETKY = [HAMMELBURG, FRIESENHEIM, GENGENBACH];

// ── Čo musí mať nájdený projekt ─────────────────────────────────────────────
{
  eq(I.problems(HAMMELBURG), [], 'kompletný projekt nemá čo vyčítať');
  eq(I.usable(HAMMELBURG), true, 'a dá sa z neho založiť možnosť');

  eq(I.problems({ city: 'Hammelburg', headcount: 5 }).map(x => x.key), ['title'],
    'bez názvu to nejde');
  eq(I.problems({ title: 'x', headcount: 5 }).map(x => x.key), ['city'],
    'ani bez mesta — bez neho sa nedá povedať, kam sa ide');
  eq(I.problems({ title: 'x', city: 'y' }).map(x => x.key), ['headcount'],
    'ani bez počtu ľudí — bez neho sa nedá povedať, či to stíhame');
  eq(I.usable({}), false, 'prázdny projekt sa nezaloží');

  // Model vráti, čo vráti. Toto je miesto, kde sa jeho výstup upratuje.
  const n = I.normalize({ title: '  Hammelburg  ', city: 'Hammelburg', country: 'de',
    headcount: 5, rate_client: '34,00', start_date: '2026-10-19' });
  eq(n.title, 'Hammelburg', 'medzery navyše sa orežú');
  eq(n.country, 'DE', 'krajina je veľkými');
  eq(n.rate_client, 34, 'sadzba s čiarkou je číslo');
  eq(I.normalize({ rate_client: 'dohodou' }).rate_client, null,
    'sadzba, ktorá nie je číslo, je prázdna — nie nula');
  eq(I.normalize({ headcount: 'päť' }).headcount, null, 'to isté pri počte ľudí');
  eq(I.normalize({ headcount: 0 }).headcount, null, 'nula ľudí nie je počet');
  eq(I.normalize({ start_date: 'ab Montag' }).start_date, null,
    '„ab Montag" nie je dátum — radšej prázdne než vymyslené');
  eq(I.normalize({ start_date: '2026-10-19' }).start_date, '2026-10-19',
    'poriadny dátum prejde');
  eq(I.normalize({}).country, 'DE', 'keď krajina nie je, je to Nemecko');
  eq(I.normalize({ requirements: ['a', '', null, ' b '] }).requirements, ['a', 'b'],
    'prázdne požiadavky sa vyhodia');
}

// ── Nemecké platobné podmienky ──────────────────────────────────────────────
// „7/10 mit 2% Sconto" je v tom e-maile dvakrát a je to zľava za skoré
// zaplatenie, nie zľava z ceny.
{
  const s = I.skonto('7/10 mit 2% Sconto');
  eq(s.discountDays, 7, 'do siedmich dní so zľavou');
  eq(s.netDays, 10, 'inak desať dní');
  eq(s.discountPct, 2, 'zľava je dve percentá');
  eq(s.terms, 10, 'splatnosť, ktorá sa zapíše odberateľovi, je tá dlhšia');
  ok(/odrátajú 2 %/.test(I.skontoText(s)), 'veta to povie po slovensky', I.skontoText(s));
  ok(/Splatnosť 10 dní/.test(I.skontoText(s)), 'aj so splatnosťou', I.skontoText(s));

  const inak = I.skonto('2% Skonto 7 Tage, netto 10 Tage');
  eq(inak.discountDays, 7, 'rozpísaný tvar sa prečíta rovnako');
  eq(inak.netDays, 10, 'aj netto');
  eq(inak.discountPct, 2, 'aj percentá');

  const bez = I.skonto('14 Tage netto');
  eq(bez.netDays, 14, 'obyčajná splatnosť sa prečíta');
  eq(bez.discountPct, null, 'a žiadna zľava sa nevymyslí');
  eq(bez.terms, 14, 'splatnosť je štrnásť dní');

  eq(I.skonto(''), null, 'prázdny text nedá nič');
  eq(I.skonto('podľa dohody'), null, 'ani text bez čísel');
  eq(I.skontoText(null), '', 'a vtedy sa nekreslí ani veta');
}

// ── Stíhame to? ─────────────────────────────────────────────────────────────
// „Cieľ máme nabrať 2–6 ľudí týždenne, viac ani nevládzeme."
{
  eq(I.KAPACITA, { min: 2, max: 6 }, 'predvolená kapacita je to, čo povedal majiteľ');

  const k = I.capacity({ projects: VSETKY, today: '2026-10-16' });
  eq(k.people, 13, 'trinásť ľudí dokopy');
  eq(k.weeksBest, 3, 'pri šiestich týždenne sú to tri týždne');
  eq(k.weeksWorst, 7, 'pri dvoch týždenne sedem');
  ok(/13 ľudí je pri 2–6 týždenne robota na 3–7 týždňov/.test(k.text),
    'a povie sa to jednou vetou', k.text);

  // Toto je to podstatné: odberateľ chce ľudí od pondelka a my to nestíhame.
  ok(k.late.length > 0, 'nestíhané stavby sú pomenované', JSON.stringify(k.late));
  ok(k.late.every(p => p.meskanie > 0), 'a pri každej je, o koľko dní');
  const posledna = k.late[k.late.length - 1];
  eq(posledna.city, 'Gengenbach', 'najhoršie je na tom tá posledná v poradí');

  // Keď je času dosť, nič sa nevyčíta.
  const pokoj = I.capacity({ projects: VSETKY, today: '2026-08-01' });
  eq(pokoj.late, [], 'pri dostatku času sa nehreší');
  eq(pokoj.people, 13, 'ľudí je stále trinásť');

  // **Toto je celé pravidlo a najľahšie sa stratí:** skorší projekt zoberie
  // kapacitu skôr, takže neskorší čaká na neho. Sám o sebe by sa stihol.
  const rad = I.capacity({
    projects: [
      { city: 'Prvá', headcount: 6, start_date: '2026-10-26' },
      { city: 'Druhá', headcount: 6, start_date: '2026-10-28' },
    ],
    today: '2026-10-16',
  });
  eq(rad.late.map(p => p.city), ['Druhá'],
    'druhá stavba mešká, lebo prvá zobrala kapacitu — sama by sa stihla');
  eq(I.capacity({ projects: [{ city: 'Druhá', headcount: 6, start_date: '2026-10-28' }],
    today: '2026-10-16' }).late, [],
  'a to je overené tým, že sama naozaj mešká');
  eq(rad.late[0].hotovo, '2026-10-30', 'vie sa, kedy to najskôr bude');
  eq(rad.late[0].meskanie, 2, 'aj o koľko dní je to neskoro');

  const poradie = I.capacity({
    projects: [{ city: 'Neskorší', headcount: 6, start_date: '2026-12-01' },
      { city: 'Skorší', headcount: 6, start_date: '2026-11-01' }],
    today: '2026-10-16',
  });
  eq(poradie.weeksBest, 2, 'dvanásť ľudí sú dva týždne');
  eq(poradie.late, [], 'a do novembra sa to stihne');

  // Kapacita sa dá prepísať v Nastaveniach.
  const rychlejsie = I.capacity({ projects: VSETKY, perWeek: { min: 5, max: 13 },
    today: '2026-10-16' });
  eq(rychlejsie.weeksBest, 1, 'pri väčšej kapacite je to týždeň');

  eq(I.capacity({ projects: [] }).people, 0, 'bez projektov sa nič nepočíta');
  ok(/Niet koho hľadať/.test(I.capacity({ projects: [] }).text), 'a povie sa to');
  eq(I.capacity({ projects: VSETKY, perWeek: { min: 0, max: 0 }, today: '2026-10-16' }).weeksBest,
    Math.ceil(13 / 6), 'nulová kapacita sa neberie — delenie nulou nie je odpoveď');
}

// ── Veta nad nájdenými projektmi ────────────────────────────────────────────
{
  const s = I.summary(VSETKY);
  eq(s.count, 3, 'tri stavby');
  eq(s.people, 13, 'trinásť ľudí');
  eq(s.rate, 34, 'jedna spoločná sadzba');
  ok(/3 stavby, 13 ľudí, 34 €\/h/.test(s.text), 'veta to zhrnie', s.text);

  const rozne = I.summary([HAMMELBURG, { ...FRIESENHEIM, rate_client: 36 }]);
  eq(rozne.rate, null, 'pri rôznych sadzbách sa žiadna nevydáva za spoločnú');
  ok(!/€\/h/.test(rozne.text), 'a vo vete nie je', rozne.text);

  eq(I.summary([]).count, 0, 'prázdny zoznam nespadne');
  eq(I.summary([{ title: 'x' }]).people, 0, 'projekt bez počtu ľudí sa počíta ako nula');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
