// ============================================================================
// Testy skladania prehľadu
// Spustenie:  node app/lib/dashboard.test.js
// ============================================================================
// Najdôležitejší test v tomto súbore je ten o novej karte. Keď si niekto
// poradie raz upraví, uloží sa zoznam kľúčov — a od tej chvíle je každá nová
// karta v appke pre neho neviditeľná, ak sa o to niekto nepostará. Postihlo
// by to práve tých, ktorí appku používajú najviac.
// ============================================================================
global.window = global;
const D = require('./dashboard');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

const keys = (arr) => arr.map(c => c.key);

console.log('Skladanie prehľadu');

// ── Predvolené ──────────────────────────────────────────────────────────────
{
  const d = D.defaults();
  eq(d.order.length, D.CARDS.length, 'predvolene sú všetky karty');
  eq(d.hidden, [], 'a nič nie je skryté');
  eq(keys(D.visible(null)), d.order, 'bez nastavenia platí predvolené');
  eq(keys(D.visible(undefined)), d.order, 'a bez ničoho tiež');
  ok(D.CARDS.every(c => c.group === D.TOP || D.GROUPS.some(g => g[0] === c.group)),
    'každá karta patrí do existujúcej záložky alebo je nad nimi');
  eq(D.pinned(null).map(c => c.key), ['cashflow'], 'cash-flow je nad záložkami');
  ok(!D.tabs(null).some(t => t.key === D.TOP), 'a nerobí sa z neho záložka');
  ok(D.CARDS.every(c => c.title && c.key), 'a každá má kľúč aj názov');
  eq(new Set(D.CARDS.map(c => c.key)).size, D.CARDS.length, 'kľúče sú jedinečné');
}

// ── Nová karta v appke ──────────────────────────────────────────────────────
// Toto je ten prípad, kvôli ktorému `normalize` existuje.
{
  const stare = { hidden: [], order: ['cashflow', 'money', 'tasks'], tab: 'money' };
  const p = D.normalize(stare);
  eq(p.order.length, D.CARDS.length, 'chýbajúce karty sa doplnia');
  ok(p.order.indexOf('weeks') > p.order.indexOf('money'),
    'a doplnia sa na svoje miesto z predvoleného poradia, nie na koniec');
  // Doplnené karty sa vsunú medzi, ale vzájomné poradie toho, čo si človek
  // zoradil, sa nesmie zmeniť.
  ok(p.order.indexOf('cashflow') < p.order.indexOf('money')
    && p.order.indexOf('money') < p.order.indexOf('tasks'),
    'to, čo si človek zoradil, zostáva v tom istom poradí');
  eq(p.hidden, [], 'nič sa tým neskryje');
}

// ── Nastavenie z inej verzie ────────────────────────────────────────────────
{
  const p = D.normalize({ order: ['uz-neexistuje', 'money', 'tiez-nie'], hidden: ['nic'] });
  ok(!p.order.includes('uz-neexistuje'), 'neznámy kľúč sa zahodí');
  eq(p.order.length, D.CARDS.length, 'a zvyšok sa doplní');
  eq(p.hidden, [], 'neznáme skryté sa tiež zahodí');
  eq(D.normalize({ tab: 'vymyslena' }).tab, 'today', 'neznáma záložka padne na prvú');
  eq(D.normalize({}).tab, 'today', 'a bez záložky tiež');
}

// ── Skrývanie ───────────────────────────────────────────────────────────────
{
  let p = D.toggle(D.defaults(), 'tied');
  ok(p.hidden.includes('tied'), 'karta sa dá skryť');
  ok(!keys(D.visible(p)).includes('tied'), 'a zmizne z prehľadu');
  p = D.toggle(p, 'tied');
  eq(p.hidden, [], 'a dá sa vrátiť');

  // Cash-flow a úlohy sú kostra prehľadu — bez nich by záložka bola prázdna.
  const fix = D.toggle(D.defaults(), 'cashflow');
  eq(fix.hidden, [], 'pevná karta sa skryť nedá');
  eq(D.toggle(D.defaults(), 'nieco-cudzie').hidden, [], 'neznáma karta nezhodí nastavenie');
}

// ── Poradie ─────────────────────────────────────────────────────────────────
{
  const d = D.defaults();
  const posunute = D.move(d, 'margin', 'up');
  eq(D.inGroup(posunute, 'money').map(c => c.key).slice(0, 3),
    ['money', 'margin', 'weeks'], 'karta sa posunie o jedno miesto hore');

  const dole = D.move(d, 'money', 'down');
  eq(D.inGroup(dole, 'money').map(c => c.key).slice(0, 2), ['weeks', 'money'],
    'a rovnako dole');

  // Na okraji sa nedeje nič — nie chyba, len sa to nepohne.
  eq(D.move(d, 'money', 'up').order, d.order, 'prvá sa vyššie nedostane');
  const last = D.inGroup(d, 'today').slice(-1)[0].key;
  eq(D.move(d, last, 'down').order, d.order, 'ani posledná nižšie');

  // Posúva sa v rámci skupiny: karta nesmie preskočiť do inej záložky.
  const p = D.move(D.move(D.move(d, 'book', 'up'), 'book', 'up'), 'book', 'up');
  eq(D.byKey('book').group, 'work', 'karta zostáva vo svojej skupine');
  eq(D.inGroup(p, 'work').map(c => c.key), ['book', 'hiring'], 'a poradie v nej sedí');
  eq(D.inGroup(p, 'money').length, D.inGroup(d, 'money').length,
    'iná skupina sa tým nezmení');
  eq(D.move(d, 'nieco-cudzie', 'up').order, d.order, 'neznáma karta nič nerozhádže');
}

// ── Záložky ─────────────────────────────────────────────────────────────────
{
  const t = D.tabs(D.defaults());
  eq(t.map(x => x.key), ['today', 'money', 'work'], 'tri záložky v poradí, dnešok prvý');
  ok(t.every(x => x.count > 0), 'a každá má čo ukázať');

  // Keď si človek skryje celú skupinu, záložka zmizne aj s ňou.
  let p = D.defaults();
  for (const c of D.inGroup(p, 'work')) p = D.toggle(p, c.key);
  eq(D.tabs(p).map(x => x.key), ['today', 'money'], 'prázdna záložka sa nekreslí');

  // A keď stál práve na nej, nesmie zostať na prázdne.
  const stal = D.setTab(p, 'work');
  eq(D.activeTab(stal), 'today', 'zo zmiznutej záložky sa spadne na prvú');
  eq(D.activeTab(D.setTab(D.defaults(), 'today')), 'today', 'inak platí tá zvolená');
}

// ── Vrátiť späť ─────────────────────────────────────────────────────────────
{
  const upravene = D.move(D.toggle(D.defaults(), 'tied'), 'margin', 'up');
  ok(D.isCustom(upravene), 'appka vie, že si to človek upravil');
  ok(!D.isCustom(D.defaults()), 'a že predvolené je predvolené');
  eq(D.reset().hidden, [], 'vrátenie späť odkryje všetko');
  eq(D.reset().order, D.defaults().order, 'a vráti poradie');
  // Samotná zmena záložky nie je úprava rozloženia.
  ok(!D.isCustom(D.setTab(D.defaults(), 'today')), 'prepnutie záložky nie je úprava');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
