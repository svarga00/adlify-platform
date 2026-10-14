// ============================================================================
// Testy: USt-IdNr a čítanie odpovede registra (VIES)
// Spustenie:  node app/lib/vies.test.js
// ============================================================================
global.window = global;
const V = require('./vies');

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

console.log('\nTVAR ČÍSLA');
{
  // Ľudia ho píšu rôzne. Register prijme jeden tvar.
  eq(V.split('DE123456789'), { country: 'DE', number: '123456789', clean: 'DE123456789' },
    'čisté číslo');
  eq(V.split('DE 123 456 789').clean, 'DE123456789', 'medzery sa zahodia');
  eq(V.split('de123456789').country, 'DE', 'malé písmená sa zväčšia');
  eq(V.split('DE-123.456.789').clean, 'DE123456789', 'bodky a spojovníky tiež');
  eq(V.split('SK2122816839').country, 'SK', 'slovenské číslo tiež');
  eq(V.split('ATU12345678').number, 'U12345678', 'rakúske má v čísle písmeno');

  eq(V.split(''), null, 'prázdne nie je číslo');
  eq(V.split(null), null, 'ani null');
  eq(V.split('123456789'), null, 'bez kódu štátu to nie je USt-IdNr');
  eq(V.split('DE1'), null, 'príliš krátke nie');
  eq(V.split('DE123456789012345'), null, 'ani príliš dlhé');
  eq(V.split('DEUTSCHLAND'), null, 'ani slovo — v čísle musia byť aspoň dve číslice');
  eq(V.split('NLB12345678B01').number, 'B12345678B01', 'holandské číslo s písmenami prejde');
}

console.log('\nREGISTER ODPOVEDAL');
{
  const r = V.interpret({ ok: true, status: 200, data: {
    isValid: true, countryCode: 'DE', vatNumber: '123456789',
    name: 'GU Ulm GmbH', address: 'Industriestr. 1, Ulm' } });
  eq(r.valid, true, 'platné číslo je platné');
  eq(r.name, 'GU Ulm GmbH', 'názov z registra');
  eq(r.address, 'Industriestr. 1, Ulm', 'aj adresa');
  eq(r.vat, 'DE123456789', 'a číslo tak, ako ho register pozná');
  eq(r.source, 'vies', 'je zapísané, odkiaľ to je');
}
{
  const r = V.interpret({ ok: true, status: 200, data: { isValid: false } });
  eq(r.valid, false, 'neplatné číslo je neplatné');
  ok(!r.unavailable, 'a nie je to nedostupnosť');
}
{
  // VIES pri niektorých štátoch neposiela názov — píše '---'.
  const r = V.interpret({ ok: true, status: 200, data: {
    isValid: true, name: '---', address: '   ' } });
  eq(r.name, null, 'tri spojovníky nie sú názov firmy');
  eq(r.address, null, 'a prázdne miesto nie je adresa');
}

console.log('\nREGISTER NEODPOVEDAL');
{
  // Toto je to pravidlo, ktoré sa ľahko pokazí a ktoré má celé toto testovanie
  // chrániť: nedostupnosť nie je neplatné číslo.
  const siet = V.interpret({ error: 'fetch failed' });
  ok(siet.unavailable, 'chyba siete je nedostupnosť');
  eq(siet.valid, undefined, 'a NIE neplatné číslo');
  eq(siet.reason, 'network', 'je zapísané, čo sa stalo');

  const chyba = V.interpret({ ok: false, status: 503 });
  ok(chyba.unavailable, 'HTTP chyba je nedostupnosť');
  eq(chyba.valid, undefined, 'tiež nie neplatné');
  eq(chyba.reason, 'http_503', 'aj s kódom');
  ok(/nie je to to isté ako neplatné/i.test(chyba.note),
    'a je to napísané aj slovom', chyba.note);

  const neprecitane = V.interpret({ ok: true, status: 200, data: null });
  ok(neprecitane.unavailable, 'nečitateľná odpoveď je nedostupnosť');
  eq(neprecitane.reason, 'parse', 'so svojím dôvodom');

  const bezOdpovede = V.interpret({ ok: true, status: 200, data: { foo: 'bar' } });
  ok(bezOdpovede.unavailable, 'odpoveď bez `isValid` je nedostupnosť');
  eq(bezOdpovede.valid, undefined, 'a nie neplatné číslo');
  eq(bezOdpovede.reason, 'no_answer', 'so svojím dôvodom');

  // `isValid` ako text nie je odpoveď — register posiela boolean.
  ok(V.interpret({ ok: true, status: 200, data: { isValid: 'true' } }).unavailable,
    'text „true" nie je odpoveď registra');

  eq(V.interpret({}).unavailable, true, 'prázdny vstup je tiež nedostupnosť, nie platnosť');
}

console.log('\nZLÝ TVAR ČÍSLA');
{
  const r = V.badFormat();
  eq(r.valid, false, 'číslo v nesprávnom tvare je neplatné — register sa ani nepýta');
  ok(!r.unavailable, 'a nie je to nedostupnosť registra');
  ok(/dve písmená štátu/.test(r.note), 'povie sa, aký tvar sa čaká', r.note);
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo\n`);
process.exit(failed ? 1 : 0);
