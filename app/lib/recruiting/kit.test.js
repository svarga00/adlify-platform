// ============================================================================
// Testy: podklady k náboru — kanály, bloky, čo ešte chýba
// Spustenie:  node app/lib/recruiting/kit.test.js
// ============================================================================
global.window = global;
const K = require('./kit');

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

const row = (channel, block, body) => ({ channel, block, body });

/** Kompletný kanál — všetky povinné bloky vyplnené, nič nedoplnené. */
function fullChannel(key) {
  return K.blocks(key).filter(b => b.must).map(b => row(key, b.key, `text ${b.key}`));
}

console.log('\nKANÁLY');
{
  eq(K.CHANNELS.map(c => c.key),
    ['web', 'bazos_cz', 'bazos_sk', 'fb_cz', 'fb_sk',
      'ads_cz', 'ads_sk', 'voice_cz', 'voice_sk', 'images'],
    'desať kanálov v poradí, v akom sa obsadzujú');
  // Reklama a voiceover sú per krajina: text pre Česko má inú reč aj iné
  // cielenie než ten pre Slovensko.
  eq(K.channel('ads_cz').lang, 'cs', 'česká reklama je po česky');
  eq(K.channel('ads_sk').lang, 'sk', 'slovenská po slovensky');
  ok(K.CHANNELS.every(c => c.title && c.lead),
    'každý kanál povie, čo to je a na čo si dať pozor');
  eq(K.channel('bazos_cz').lang, 'cs', 'Bazoš CZ je po česky');
  eq(K.channel('bazos_sk').lang, 'sk', 'Bazoš SK po slovensky');
  eq(K.channel('nic'), null, 'neznámy kanál vráti null, nie pád');
  ok(K.blocks('web').length >= 10, 'web má najviac blokov — je to podstránka, nie inzerát');
  ok(K.blocks('nic').length === 0, 'neznámy kanál nemá bloky');
  ok(K.CHANNELS.every(c => K.blocks(c.key).length > 0), 'každý kanál má aspoň jeden blok');
  ok(K.CHANNELS.every(c => K.blocks(c.key).some(b => b.must)),
    'a každý má aspoň jeden povinný — inak by sa „hotové" nedalo zmerať');
  ok(!!K.blockDef('bazos_sk', 'body'), 'blok sa dá nájsť podľa kanála a kľúča');
  eq(K.blockDef('bazos_sk', 'nic'), null, 'neznámy blok vráti null');
}

console.log('\nNEDOPLNENÉ ÚDAJE');
{
  eq(K.gaps(''), 0, 'prázdny text nemá čo dopĺňať');
  eq(K.gaps('Sadzba [XX] €/hod.'), 1, 'jedna značka');
  eq(K.gaps('Zvárač [XX] €/hod., pripravár [XX] €/hod., nástup [XX]'), 3,
    'tri značky v jednom riadku');
  eq(K.gaps('bez značiek'), 0, 'text bez značiek');
  eq(K.gaps(null), 0, 'null nespadne');
  // Pozor na podobné, ale iné zátvorky — tie sa dopĺňať nemajú.
  eq(K.gaps('[confident] Hľadáme partiu'), 0,
    'značka pre voiceover nie je nedoplnený údaj');
}

console.log('\nSTAV KANÁLA');
{
  const s = K.channelState('bazos_sk', []);
  eq(s.state, 'prazdne', 'bez textov je kanál prázdny');
  ok(!s.ready, 'a nie je zverejniteľný');
  ok(s.missing.length >= 3, 'povie, čo všetko chýba', s.missing.join(', '));
  eq(s.done, 0, 'nič nie je napísané');
}
{
  const s = K.channelState('bazos_sk', [row('bazos_sk', 'title', 'Zvárač WIG – Nemecko')]);
  eq(s.state, 'rozrobene', 's jedným blokom je rozrobený');
  eq(s.done, 1, 'jeden blok hotový');
  ok(!s.ready, 'ale zverejniť sa nedá');
  ok(!s.missing.includes('Titulok'), 'titulok už nechýba', s.missing.join(', '));
}
{
  const s = K.channelState('bazos_sk', fullChannel('bazos_sk'));
  eq(s.state, 'hotove', 's vyplnenými povinnými blokmi je hotový');
  ok(s.ready, 'a dá sa zverejniť');
  eq(s.missing, [], 'nič nechýba');
}
{
  // Toto je ten dôležitý prípad: všetko napísané, ale sadzba nedoplnená.
  const rows = [...fullChannel('bazos_sk'),
    row('bazos_sk', 'body', 'Zvárač [XX] €/hod., nástup [XX]')];
  const s = K.channelState('bazos_sk', rows.filter((r, i, a) =>
    a.findIndex(x => x.block === r.block) === i ? true : false)
    .map(r => r.block === 'body'
      ? row('bazos_sk', 'body', 'Zvárač [XX] €/hod., nástup [XX]') : r));
  eq(s.gaps, 2, 'nedoplnené údaje sa spočítajú');
  eq(s.state, 'doplnit', 'a kanál je „treba doplniť", nie hotový');
  ok(!s.ready, 'inzerát s nedoplnenou sadzbou nie je zverejniteľný',
    'ľudia zavolajú a nikto im nevie povedať sadzbu');
}
{
  // Archivovaný text sa nepočíta — nič sa nemaže, ale staré verzie neplatia.
  const rows = fullChannel('bazos_sk').map(r => ({ ...r, archived_at: '2026-10-01' }));
  eq(K.channelState('bazos_sk', rows).done, 0, 'archivovaný text sa neráta');
}
{
  // Texty iného kanála nesmú kanál „vyplniť".
  eq(K.channelState('bazos_sk', fullChannel('bazos_cz')).done, 0,
    'české texty nevyplnia slovenský Bazoš');
}

console.log('\nVŠETKY KANÁLY NARAZ');
{
  const st = K.state([]);
  eq(st.length, 10, 'desať stavov');
  ok(st.every(c => !c.ready), 'na začiatku nie je zverejniteľný ani jeden');
}
{
  const rows = [...fullChannel('bazos_sk'), ...fullChannel('bazos_cz')];
  const st = K.state(rows);
  eq(st.filter(c => c.ready).map(c => c.key), ['bazos_cz', 'bazos_sk'],
    'hotové sú presne tie dva kanály');
}

console.log('\nJEDNA VETA DO ZOZNAMU');
{
  eq(K.summary([]).text, 'Podklady ešte nie sú', 'bez podkladov sa to povie rovno');
  eq(K.summary([]).tone, 'todo', 'a je to vec na spravenie');
}
{
  const s = K.summary(fullChannel('bazos_sk'));
  ok(/1 z 10 kanálov hotových/.test(s.text), 'inak koľko kanálov je hotových', s.text);
}
{
  const rows = [...fullChannel('bazos_sk'),
    row('bazos_cz', 'title', 'Svářeč [XX] €')];
  const s = K.summary(rows);
  ok(/1 údaj treba doplniť/.test(s.text), 'nedoplnené údaje sú vo vete', s.text);
  eq(s.tone, 'warn', 'a je to upozornenie');
  eq(s.gaps, 1, 'aj v číslach');
}
{
  const vsetko = K.CHANNELS.flatMap(c => fullChannel(c.key));
  const s = K.summary(vsetko);
  eq(s.tone, 'ok', 'keď je hotové všetko, je to v poriadku');
  eq(s.ready, 10, 'desať kanálov');
}

console.log('\nPRED ZVEREJNENÍM');
{
  const ch = K.checklist({}, []);
  ok(ch.some(x => x.key === 'rate'), 'bez sadzby v nábore to pripomenie');
  ok(ch.some(x => x.key === 'start'), 'aj bez dátumu nástupu');
  ok(ch.filter(x => !x.done).length >= 3, 'a vymenuje prázdne kanály');
  ok(ch.every(x => x.text), 'každá položka má text');
  ok(ch.filter(x => !x.done).every(x => x.why), 'a tá nehotová aj dôvod');
}
{
  const plan = { offer_rate: 22, start_date: '2026-11-03' };
  const rows = [...fullChannel('bazos_sk'), row('bazos_sk', 'body', 'od [XX] €')];
  const ch = K.checklist(plan, rows.map(r => r.block === 'body'
    ? row('bazos_sk', 'body', 'od [XX] €') : r));
  ok(!ch.some(x => x.key === 'rate'), 'vyplnená sadzba sa už nepýta');
  const g = ch.find(x => x.key === 'gaps');
  ok(g, 'nedoplnené údaje sú prvé na zozname');
  ok(/sadzba, nástup/.test(g.text), 'a je povedané, čo to býva', g.text);
}
{
  const vsetko = K.CHANNELS.flatMap(c => fullChannel(c.key));
  const ch = K.checklist({ offer_rate: 22, start_date: '2026-11-03' }, vsetko);
  ok(ch.every(x => x.done), 'pri hotovom nábore je celý zoznam odškrtnutý');
  eq(ch.length, 10, 'a je v ňom desať kanálov');
}

console.log('\nZHRNUTIE ZÁKAZKY');
{
  eq(K.FACTS.map(f => f.key),
    ['position', 'place', 'project', 'form', 'condition', 'housing', 'rate', 'start', 'duration', 'contact'],
    'desať polí zhrnutia — nástup a trvanie zvlášť');
  eq(K.isoDatum('26.10.2026'), '2026-10-26', 'slovenský dátum sa prečíta');
  eq(K.isoDatum('2026-10-26'), '2026-10-26', 'aj ISO');
  eq(K.isoDatum('1. 3. 2027'), '2027-03-01', 'aj s medzerami a bez núl');
  eq(K.isoDatum('[XX] (denný začiatok 6:30)'), '', 'čas nie je dátum');
  eq(K.trvanie('8 týždňov'), { weeks: 8, longTerm: false }, 'počet týždňov');
  eq(K.trvanie('dlhodobá'), { weeks: null, longTerm: true }, 'dlhodobá');
  eq(K.trvanie('[XX]'), { weeks: null, longTerm: false }, 'nevyplnené');
  eq(K.trvanieText({ weeks: 1 }), '1 týždeň', 'jeden týždeň');
  eq(K.trvanieText({ weeks: 3 }), '3 týždne', 'tri týždne');
  eq(K.trvanieText({ weeks: 12 }), '12 týždňov', 'dvanásť týždňov');
  eq(K.trvanieText({ longTerm: true, weeks: 5 }), 'dlhodobá', 'dlhodobá má prednosť');
  eq(K.trvanieText({}), '', 'nič');
  ok(K.FACTS.filter(f => f.must).length >= 6, 'väčšina je povinná');
  const st = K.factsState({ position: 'Zvárač WIG (2×)', rate: '[XX] €/hod.' });
  eq(st.find(f => f.key === 'position').filled, true, 'vyplnené pole je vyplnené');
  eq(st.find(f => f.key === 'place').filled, false, 'nevyplnené nie');
  eq(st.find(f => f.key === 'rate').gaps, 1, 'a nedoplnený údaj je vidieť aj tu');
  eq(K.factsState({}).length, 10, 'prázdna analýza nespadne');
  eq(K.factsState().length, 10, 'ani žiadna');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo\n`);
process.exit(failed ? 1 : 0);
