// ============================================================================
// Testy grafov
// Spustenie:  node app/js/components/chart.test.js
// ============================================================================
// Graf je obrázok, takže sa naň ľahko pozerá a ťažko sa overuje. Testuje sa
// preto to, čo sa dá pokaziť ticho: či stĺpce stoja tam, kde majú, či sa
// prázdne dáta netvária ako nula a či sa dá z grafu prečítať to, čo hovorí
// tabuľka pod ním.
// ============================================================================
global.window = global;
const C = require('./chart.js');

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

/** Obdĺžniky z SVG ako čísla — na to, aby sa dalo overiť, kde stoja. */
function rects(svg) {
  return [...svg.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g)]
    .map(m => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));
}

console.log('Grafy');

// ── Pomer strán ─────────────────────────────────────────────────────────────
// Úzky viewBox sa pri `height:auto` roztiahne do výšky karty a text sa nafúkne
// na dvojnásobok nadpisu. Stalo sa to, preto je to tu napísané ako test.
{
  for (const [name, html] of [
    ['vodopád', C.waterfall({ steps: [{ label: 'A', value: 100, kind: 'level' }] })],
    ['stĺpce okolo nuly', C.diverging({ rows: [{ label: 'A', in: 100, out: 50 }] })],
    ['stĺpce', C.bars({ rows: [{ label: 'A', value: 100 }] })],
  ]) {
    const m = /viewBox="0 0 (\d+) (\d+)"/.exec(html);
    ok(m && +m[1] > +m[2], `${name} je na šírku`, m ? `${m[1]}×${m[2]}` : 'bez viewBoxu');
  }
}

// ── Prázdno ─────────────────────────────────────────────────────────────────
// Prázdny graf nesmie vyzerať ako graf s nulami — to sú dve rôzne správy.
{
  for (const [name, html] of [
    ['vodopád', C.waterfall({ steps: [] })],
    ['stĺpce okolo nuly', C.diverging({ rows: [] })],
    ['stĺpce', C.bars({ rows: [] })],
  ]) {
    ok(html.includes('chart-empty'), `${name} bez dát povie, že nie je čo zobraziť`);
    ok(!html.includes('<rect'), `a ${name} nenakreslí ani jeden stĺpec`);
  }
  ok(C.waterfall().includes('chart-empty'), 'a vodopád nepadne ani úplne bez vstupu');
}

// ── Vodopád ─────────────────────────────────────────────────────────────────
// Celý zmysel vodopádu je poradie: hladina stojí na nule, zmena nadväzuje na
// predchádzajúci stav. Keby zmeny stáli tiež na nule, boli by to obyčajné
// stĺpce a nebolo by z nich vidieť, kedy účet spadne pod nulu.
{
  const html = C.waterfall({
    steps: [
      { label: 'Na účte', value: 100000, kind: 'level' },
      { label: 'Príde', value: 50000, kind: 'delta' },
      { label: 'Odíde', value: -30000, kind: 'delta' },
      { label: 'Zostatok', value: 120000, kind: 'level' },
    ],
  });
  const r = rects(html);
  eq(r.length, 4, 'štyri kroky, štyri stĺpce');

  // Stĺpce idú zľava doprava v poradí krokov.
  ok(r[0].x < r[1].x && r[1].x < r[2].x && r[2].x < r[3].x, 'v poradí, v akom sa dejú');

  // Prvá a posledná hladina majú rovnakú spodnú hranu — obe stoja na nule.
  const spodok = (b) => b.y + b.h;
  ok(Math.abs(spodok(r[0]) - spodok(r[3])) < 0.01, 'obe hladiny stoja na tej istej nule');

  // Zostatok je väčší než počiatočný stav, takže musí byť vyšší stĺpec.
  ok(r[3].h > r[0].h, 'vyšší zostatok je vyšší stĺpec');

  // Príjem visí nad počiatočným stavom: jeho spodná hrana je vrch prvého.
  ok(Math.abs(spodok(r[1]) - r[0].y) < 0.01, 'príjem nadväzuje na stav účtu, nestojí na nule');
  // Výdaj visí pod vrcholom po príjme.
  ok(Math.abs(r[2].y - r[1].y) < 0.01, 'výdaj začína tam, kde príjem skončil');

  ok(html.includes('stroke-dasharray'), 'kroky spája čiarkovaná spojnica');
  ok(html.includes('Stav účtu') && html.includes('Príde') && html.includes('Odíde'),
    'legenda pomenuje všetky tri druhy');
  ok(html.includes('+50,00') || html.includes('+500,00'), 'príjem má znamienko plus');
}

// ── Farby ───────────────────────────────────────────────────────────────────
// Zelená s červenou sa pri najbežnejšej farbosleposti zlejú (ΔE 5,6). Modrá
// s oranžovou nie (ΔE 34,1). Nech to nikto nevráti späť.
{
  const html = C.waterfall({
    steps: [
      { label: 'Stav', value: 100000, kind: 'level' },
      { label: 'Príde', value: 20000, kind: 'delta' },
      { label: 'Odíde', value: -20000, kind: 'delta' },
    ],
  });
  ok(html.includes(C.IN) && html.includes(C.OUT), 'používa modrú a oranžovú');
  ok(!/#[0-9a-f]*(?:00ff00|ff0000)/i.test(html), 'a nie zelenú s červenou');
  ok(html.includes(C.LEVEL), 'stav účtu má vlastnú, tmavú farbu');

  // Účet v mínuse sa nesmie kresliť rovnako ako účet v pluse.
  const minus = C.waterfall({ steps: [{ label: 'Stav', value: -50000, kind: 'level' }] });
  ok(minus.includes(C.OUT), 'záporný stav účtu je farebne odlíšený');
}

// ── Čitateľnosť ─────────────────────────────────────────────────────────────
{
  const html = C.waterfall({
    steps: [{ label: 'Na <b>účte</b>', value: 100000, kind: 'level' }],
    aria: 'Cash-flow',
  });
  ok(html.includes('&lt;b&gt;'), 'popisok sa nevykreslí ako HTML');
  ok(html.includes('aria-label="Cash-flow"'), 'graf má popis pre čítačku');
  ok(html.includes('<title>'), 'a hodnota sa dá prečítať po nabehnutí myšou');

  eq(C.shortMoney(123400), '1,2k', 'na os idú krátke čísla');
  eq(C.shortMoney(45600), '456', 'malé sumy celé');
  eq(C.niceStep(0), 1, 'nulový rozsah nezhodí mierku');
}

// ── Pás rozdelený na časti ──────────────────────────────────────────────────
// Koláč sa na to nehodí: uhly sa porovnávajú horšie než dĺžky. Test drží to,
// že pás má toľko častí, koľko má dát — a že nula nie je časť.
{
  const html = C.split({ parts: [
    { label: 'Ubytovanie', value: 148000 },
    { label: 'Cestovné', value: 21800 },
    { label: 'Nič', value: 0 },
  ] });
  const segs = (html.match(/<span style="flex:/g) || []).length;
  eq(segs, 2, 'nulová časť sa nekreslí — neviditeľný pásik je len šum');
  ok(html.includes('Ubytovanie') && html.includes('Cestovné'), 'legenda pomenuje časti');
  ok(html.includes('flex:148000'), 'časť je široká podľa hodnoty');
  // Slovenské formátovanie oddeľuje tisíce nezlomiteľnou medzerou — porovnať
  // sa to dá len tak, že sa medzery zjednotia.
  ok(/1 480,00/.test(html.replace(/\u00a0/g, ' ')),
    'a v legende je suma, nie len percento');
  ok(C.split({ parts: [] }).includes('chart-empty'), 'bez dát to povie');
  ok(C.split().includes('chart-empty'), 'a bez vstupu nepadne');
  // Záporná hodnota je výdaj — v páse ide o podiel, nie o smer.
  ok(C.split({ parts: [{ label: 'Von', value: -500 }] }).includes('flex:500'),
    'záporná hodnota sa berie ako veľkosť');
}

// ── Čiara bez osí ───────────────────────────────────────────────────────────
{
  const up = C.spark([1, 3, 2, 8]);
  ok(up.includes('<path'), 'nakreslí sa čiara');
  ok(up.includes(C.IN), 'stúpajúci priebeh je modrý');
  ok(C.spark([8, 2, 3, 1]).includes(C.OUT), 'klesajúci oranžový');
  eq(C.spark([5]), '', 'z jedného bodu sa priebeh nedá nakresliť');
  eq(C.spark([]), '', 'ani zo žiadneho');
  eq(C.spark(null), '', 'a bez vstupu nepadne');
  // Rovná čiara nesmie deliť nulou.
  ok(C.spark([4, 4, 4]).includes('<path'), 'rovný priebeh sa nakreslí tiež');
  ok(!/NaN/.test(C.spark([4, 4, 4])), 'a nevyrobí NaN');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
