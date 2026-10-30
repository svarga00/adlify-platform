// ============================================================================
// DANUBRA — termín ďalšieho kroku z poznámky (SK aj DE)
// Spustenie:  node app/lib/marketing/followup.test.js
// ============================================================================
const F = require('./followup.js');

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}
// Piatok 30. 10. 2026 dopoludnia.
const NOW = new Date('2026-10-30T09:00:00Z');
const d = (t) => { const r = F.parse(t, { now: NOW }); return r ? r.date : null; };
const eq = (t, want, msg) => { const got = d(t); ok(got === want, `${msg || t} → ${want}`, `dostal som ${got}`); };

console.log('Relatívne termíny');
eq('Ozvite sa za 2-3 týždne', '2026-11-13', 'rozsah 2–3 týždne berie skorší koniec (2 týždne)');
eq('ozvite sa o 2 až 3 týždne', '2026-11-13', '„2 až 3 týždne"');
eq('o 3 týždne', '2026-11-20');
eq('Zavolajte o mesiac', '2026-11-30', 'o mesiac (bez čísla)');
eq('za 2-3 mesiace', '2026-12-30', 'rozsah mesiacov → 2 mesiace');
eq('o pol roka', '2027-04-30');
eq('o 9 dní', '2026-11-09', 'nedeľa sa posunie na pondelok');
eq('o pár dní', '2026-11-02', 'pár dní = 3 dni, sobota → pondelok');
eq('Melden Sie sich in zwei Monaten wieder', '2026-12-30', 'DE: in zwei Monaten');
eq('in 10 Tagen bitte anrufen', '2026-11-09', 'DE: in 10 Tagen');
eq('in zwei bis drei Wochen', '2026-11-13', 'DE: zwei bis drei Wochen → 2 týždne');
eq('in einer Woche', '2026-11-06', 'DE: in einer Woche');
eq('nächste Woche', '2026-11-02', 'DE: nächste Woche → pondelok');
eq('budúci týždeň', '2026-11-02', 'budúci týždeň → pondelok');
eq('budúci mesiac', '2026-11-02', 'budúci mesiac → 1. deň (nedeľa → pondelok)');
eq('zajtra', '2026-11-02', 'zajtra je sobota → pondelok');
{
  const r = F.parse('o 9 dní', { now: NOW });
  ok(r.shifted && /víkend/.test(r.note), 'posun z víkendu sa povie', JSON.stringify(r));
  const z = F.parse('za 2-3 týždne', { now: NOW });
  ok(/skorší/.test(z.note) && z.confidence === 'high', 'pri rozsahu povie, že berie skorší termín', JSON.stringify(z));
}

console.log('\nMesiace, dátumy, dni');
eq('ozvite sa v marci', '2027-03-01', 'mesiac, ktorý už bol → budúci rok, 1. deň');
eq('začiatkom februára', '2027-02-01');
eq('koncom januára', '2027-01-20', 'koniec mesiaca → 20. (aby sme stihli)');
eq('v polovici novembra', '2026-11-16', 'polovica = 15., nedeľa → pondelok');
eq('Mitte März', '2027-03-15', 'DE: Mitte März');
eq('im Dezember', '2026-12-01', 'DE: im Dezember');
eq('Anfang März 2028', '2028-03-01', 'mesiac s rokom');
eq('ešte v októbri', '2026-11-06', 'ten istý mesiac, ktorý už beží → o týždeň');
eq('Termin am 15. März', '2027-03-15', 'deň a mesiac slovom');
eq('ozvať sa 15. 3.', '2027-03-15', 'dátum bez roka');
eq('do 15.03.2027', '2027-03-15', 'dátum s rokom');
eq('KW 3', '2027-01-18', 'kalendárny týždeň → pondelok');
eq('am Freitag', '2026-11-06', 'piatok, keď je dnes piatok → budúci');
eq('v pondelok', '2026-11-02');
eq('volal som 28.10., ozvite sa o týždeň', '2026-11-06', 'nedávny dátum je odkaz na minulosť, termín je „o týždeň"');

console.log('\nSviatky a sezóna');
eq('po Novom roku', '2027-01-08', 'po Novom roku → 8. 1.');
eq('nach Neujahr', '2027-01-08');
eq('nach Weihnachten', '2027-01-08');
eq('nach Ostern', '2027-03-30', 'Veľká noc 2027 je 28. 3. → utorok 30. 3.');
eq('po Veľkej noci', '2027-03-30');
eq('na jar', '2027-03-01');
eq('im Frühjahr', '2027-03-01');
eq('po sezóne', '2026-11-02', 'po sezóne → 2. novembra');
eq('nach den Sommerferien', '2027-09-01');
ok(F.parse('na jar', { now: NOW }).confidence === 'medium', 'odhad obdobia má nižšiu istotu');

console.log('\nNič nevymýšľa');
ok(d('pred 2 týždňami sme volali, nemá záujem') === null, 'minulosť nie je termín');
ok(d('Guten Morgen, kein Bedarf') === null, '„Guten Morgen" nie je zajtra');
ok(d('') === null && d(null) === null, 'prázdny text');
ok(d('Firma má 2 zamestnancov') === null, 'číslo bez jednotky času');
ok(F.hasIntent('ozvite sa neskôr', { now: NOW }) && F.hasIntent('Rufen Sie mich nochmal an') && !F.hasIntent('nemá záujem, nevolať'),
  'hasIntent: „ozvite sa" áno, „nemá záujem" nie');

console.log('\nPomocné');
ok(F.easter(2026) === '2026-04-05' && F.easter(2027) === '2027-03-28' && F.easter(2030) === '2030-04-21', 'Veľká noc');
ok(F.workday('2026-10-31') === '2026-11-02' && F.workday('2026-11-03') === '2026-11-03', 'víkend → pondelok');
ok(F.validDate('2027-02-28') && !F.validDate('2027-02-30') && !F.validDate('30.10.2026'), 'platný dátum');
ok(F.addMonths('2026-01-31', 1) === '2026-02-28', 'koniec mesiaca pri pripočítaní');
ok(F.today(new Date('2026-10-30T23:30:00Z')) === '2026-10-31', 'dnešok v Bratislave, nie v UTC');
ok(/^o 2 týždne \(piatok 13\. 11\.\)$/.test(F.label('2026-11-13', NOW)), 'popis termínu', F.label('2026-11-13', NOW));

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
