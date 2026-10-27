// ============================================================================
// Testy návodu k appke
// Spustenie:  node app/lib/guide.test.js
// ============================================================================
// Návod číta kolega, ktorý appku nepostavil. Keď v ňom stojí tlačidlo, ktoré
// vedie na neexistujúcu obrazovku, alebo sprievodca ukazuje na prvok, ktorý
// v appke nie je, návod klame — a človek prestane veriť aj zvyšku. Preto sa
// tu stráži:
//   * každé `open.route` je obrazovka z `navGroups` v js/app.js,
//   * žiadne emoji a žiadne tykanie — appka vyká,
//   * každá kapitola má kroky a každý krok má čo robiť,
//   * kroky sprievodcu ukazujú na prvky, ktoré v appke naozaj sú,
//   * ťahák a slovníček majú rozumnú dĺžku.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

global.window = global;
const G = require('./guide.js');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error(`  ✗ ${msg}`);
}

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const APP = read('js/app.js');
const INDEX = read('index.html');

// ── Obrazovky z menu ────────────────────────────────────────────────────────
// Kľúče sa berú priamo zo zdrojáku `navGroups` — keď obrazovka z menu zmizne,
// návod, ktorý na ňu vedie, musí spadnúť tu, nie u človeka.
function navKeys() {
  const start = APP.indexOf('navGroups: [');
  ok(start >= 0, 'v js/app.js je navGroups');
  const end = APP.indexOf('\n  ],', start);
  const block = APP.slice(start, end > start ? end : undefined);
  const keys = new Set();
  const re = /\[\s*'([a-z][a-z-]*)',\s*'/g;
  let m;
  while ((m = re.exec(block))) keys.add(m[1]);
  return keys;
}
const ROUTES = navKeys();
ok(ROUTES.has('dashboard') && ROUTES.has('subcontracts') && ROUTES.has('invoices'),
  'zoznam obrazoviek z navGroups sa dal prečítať');

// ── Pomôcky na text ─────────────────────────────────────────────────────────
// Ten istý vzor ako v app/tests/no-emoji.test.js (šípka → smie zostať).
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{25A0}-\u{25FF}\u{2190}\u{2191}\u{2193}-\u{21FF}]/u;

// Tvary slovies a zámen v druhej osobe jednotného čísla. Kontroluje sa celé
// slovo — „vyberte" je v poriadku, „vyber" nie.
const TYKANIE = new Set([
  'máš', 'chceš', 'môžeš', 'musíš', 'vieš', 'budeš', 'si', 'ty', 'teba', 'tebe', 'ťa', 'ti',
  'tvoj', 'tvoja', 'tvoje', 'tvojho', 'tvojej', 'tvoju', 'tvoji',
  'klikni', 'vyber', 'otvor', 'zapíš', 'napíš', 'pozri', 'skontroluj',
  'daj', 'urob', 'sprav', 'pošli', 'choď', 'spusti', 'nahraj', 'vyplň', 'doplň', 'schváľ', 'zavolaj',
  'oprav', 'odškrtni', 'zaškrtni', 'uzavri', 'vystav', 'priraď', 'stiahni', 'ulož', 'zmeň',
  'pridaj', 'založ', 'nasaď', 'neber', 'poskladaj', 'počkaj', 'vlož', 'skús', 'zadaj',
]);
// Zvratné „si" je v slovenčine bežné aj vo vykaní („pozrite si", „dajte si pozor").
// Preto sa „si" a „ti" nekontrolujú samy, len spolu s tvarom slovesa v 2. osobe.
TYKANIE.delete('si');
TYKANIE.delete('ti');

function words(text) {
  return String(text || '').toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
}
function tykanie(text) {
  return words(text).filter(w => TYKANIE.has(w));
}

/** Všetky texty v návode spolu s miestom, kde sú — kvôli čitateľnej chybe. */
function allTexts() {
  const out = [];
  (G.CHAPTERS || []).forEach((c, ci) => {
    out.push([`kapitola ${ci + 1} názov`, c.title], [`kapitola ${ci + 1} úvod`, c.lead]);
    (c.steps || []).forEach((s, si) => {
      const kde = `krok ${ci + 1}.${si + 1}`;
      out.push([`${kde} názov`, s.title], [`${kde} čo`, s.what],
        [`${kde} tip`, s.tip], [`${kde} príklad`, s.example]);
      (s.how || []).forEach((h, hi) => out.push([`${kde} postup ${hi + 1}`, h]));
      if (s.open) out.push([`${kde} tlačidlo`, s.open.label]);
    });
  });
  for (const [k, list] of Object.entries(G.CHEAT || {})) {
    (list || []).forEach((x, i) => out.push([`ťahák ${k} ${i + 1}`, x]));
  }
  (G.TOUR || []).forEach((t, i) => out.push([`sprievodca ${i + 1} názov`, t.title],
    [`sprievodca ${i + 1} text`, t.text]));
  (G.GLOSSARY || []).forEach((g, i) => out.push([`slovníček ${i + 1}`, g.term],
    [`slovníček ${i + 1} text`, g.text]));
  return out.filter(([, t]) => t != null);
}

// ── Tvar ────────────────────────────────────────────────────────────────────
ok(Array.isArray(G.CHAPTERS) && G.CHAPTERS.length >= 6, 'návod má aspoň šesť kapitol');
const chKeys = new Set();
G.CHAPTERS.forEach((c, ci) => {
  const kde = `kapitola ${ci + 1} (${c.key || '?'})`;
  ok(typeof c.key === 'string' && /^[a-z-]+$/.test(c.key), `${kde}: má kľúč`);
  ok(!chKeys.has(c.key), `${kde}: kľúč je jedinečný`);
  chKeys.add(c.key);
  ok(typeof c.title === 'string' && c.title.trim().length > 3, `${kde}: má názov`);
  ok(typeof c.lead === 'string' && c.lead.trim().length > 20, `${kde}: má úvodnú vetu`);
  ok(Array.isArray(c.steps) && c.steps.length > 0, `${kde}: má kroky`);
  (c.steps || []).forEach((s, si) => {
    const k = `krok ${ci + 1}.${si + 1} (${s.title || '?'})`;
    ok(typeof s.title === 'string' && s.title.trim().length > 3, `${k}: má názov`);
    ok(typeof s.what === 'string' && s.what.trim().length > 20, `${k}: má vetu, čo a prečo`);
    ok(Array.isArray(s.how) && s.how.length >= 1 && s.how.length <= 6, `${k}: má 1 až 6 krokov postupu`);
    (s.how || []).forEach((h, hi) => ok(typeof h === 'string' && h.trim().length > 5,
      `${k}: postup ${hi + 1} nie je prázdny`));
    ok('open' in s && 'tip' in s && 'example' in s, `${k}: má polia open, tip a example (aj keď null)`);
    if (s.open != null) {
      ok(typeof s.open === 'object' && typeof s.open.route === 'string', `${k}: open má route`);
      ok(ROUTES.has(s.open.route), `${k}: obrazovka „${s.open.route}" je v navGroups`);
      ok(typeof s.open.label === 'string' && s.open.label.trim().length > 2, `${k}: tlačidlo má nápis`);
    }
    for (const f of ['tip', 'example']) {
      ok(s[f] === null || (typeof s[f] === 'string' && s[f].trim().length > 5), `${k}: ${f} je text alebo null`);
    }
  });
});

// Kroky, ktoré majiteľ menoval ako 99 % práce, v návode musia byť.
const vsetko = allTexts().map(([, t]) => t).join('\n');
for (const nutne of ['Poslať všetko naraz', 'Hodiny zo Stundennachweisu', 'Uzavrieť obdobie',
  'Poslať na schválenie', 'Odoslať odberateľovi', 'Načítať výpis', 'Porovnanie s hodinami',
  'Vystaviť za živnostníkov', 'Nasadiť partiu', 'Kontaktná osoba na stavbe', 'Upomienky']) {
  ok(vsetko.includes(nutne), `návod spomína „${nutne}"`);
}

// ── Jazyk ───────────────────────────────────────────────────────────────────
for (const [kde, t] of allTexts()) {
  ok(typeof t === 'string', `${kde}: je text`);
  const e = String(t).match(EMOJI);
  ok(!e, `${kde}: bez emoji${e ? ` (našiel som „${e[0]}")` : ''}`);
  const ty = tykanie(t);
  ok(!ty.length, `${kde}: vyká${ty.length ? ` (našiel som „${ty.join('", „')}")` : ''}`);
  ok(!/  /.test(String(t)), `${kde}: bez dvojitých medzier`);
}
// Úvodzovky sú slovenské „…" (dolná otváracia, rovnako ako v celej appke).
// Každá otváracia musí mať svoju zatváraciu — inak je nápis tlačidla useknutý.
for (const [kde, t] of allTexts()) {
  const s = String(t);
  const otv = (s.match(/„/g) || []).length, zatv = (s.match(/"/g) || []).length;
  ok(otv === zatv, `${kde}: úvodzovky sú v pároch („${otv}" otváracích, ${zatv} zatváracích)`);
}
// Tučné písmo (**…**) vie vykresliť len sprievodca. V kapitolách by zostali hviezdičky.
for (const [kde, t] of allTexts()) {
  if (kde.startsWith('sprievodca')) continue;
  ok(!String(t).includes('**'), `${kde}: bez **hviezdičiek**`);
}

// Vlastná kontrola kontroly: vzor na tykanie musí zachytiť tykanie.
ok(tykanie('Klikni na Uložiť a vyber zákazku.').length === 2, 'kontrola tykania funguje');
ok(tykanie('Kliknite na „Uložiť", vyberte zákazku a dajte si pozor.').length === 0,
  'vykanie kontrola nezachytí');
ok(EMOJI.test('Hotovo ✅') && !EMOJI.test('Zákazky → Dopyty'), 'kontrola emoji funguje a šípka smie');

// ── Ťahák ───────────────────────────────────────────────────────────────────
for (const k of ['daily', 'weekly', 'monthly', 'never']) {
  const list = (G.CHEAT || {})[k];
  ok(Array.isArray(list) && list.length >= 3 && list.length <= 10, `ťahák „${k}" má 3 až 10 riadkov`);
  (list || []).forEach((x, i) => ok(typeof x === 'string' && x.length > 10 && x.length <= 130,
    `ťahák „${k}" riadok ${i + 1} je krátky (do 130 znakov)`));
}

// ── Sprievodca ──────────────────────────────────────────────────────────────
ok(Array.isArray(G.TOUR) && G.TOUR.length >= 6 && G.TOUR.length <= 9, 'sprievodca má 6 až 9 krokov');
const SRC = [INDEX, APP,
  ...['js/components/shell.js', 'js/components/tour.js', 'js/ui.js']
    .filter(p => fs.existsSync(path.join(ROOT, p))).map(read)].join('\n');
(G.TOUR || []).forEach((t, i) => {
  const kde = `sprievodca ${i + 1} (${t.title || '?'})`;
  ok(typeof t.selector === 'string' && t.selector.trim().length > 0, `${kde}: má selektor`);
  ok(typeof t.title === 'string' && t.title.trim().length > 2, `${kde}: má nadpis`);
  ok(typeof t.text === 'string' && t.text.trim().length > 20, `${kde}: má text`);
  ok(t.route === null || ROUTES.has(t.route), `${kde}: route je null alebo obrazovka z navGroups`);
  // Každé id a trieda v selektore musí byť niekde v appke (index.html alebo
  // kód, ktorý kreslí menu a hlavičku). Inak by krok ukazoval do prázdna.
  const sel = String(t.selector || '');
  for (const id of sel.match(/#[\w-]+/g) || []) {
    ok(SRC.includes(`id="${id.slice(1)}"`), `${kde}: prvok ${id} v appke je`);
  }
  for (const cls of sel.match(/\.[a-z][\w-]*/gi) || []) {
    const name = cls.slice(1);
    ok(new RegExp(`(^|[^\\w-])${name}([^\\w-]|$)`, 'm').test(SRC), `${kde}: trieda ${cls} v appke je`);
  }
  for (const m of sel.matchAll(/\[data-(key|sub)="?([\w-]+)"?\]/g)) {
    ok(ROUTES.has(m[2]), `${kde}: data-${m[1]}="${m[2]}" je obrazovka z menu`);
  }
});
const tourSel = new Set((G.TOUR || []).map(t => t.selector));
ok(tourSel.size === (G.TOUR || []).length, 'kroky sprievodcu sa neopakujú');

// ── Slovníček ───────────────────────────────────────────────────────────────
ok(Array.isArray(G.GLOSSARY) && G.GLOSSARY.length >= 12 && G.GLOSSARY.length <= 20,
  'slovníček má 12 až 20 pojmov');
const terms = new Set();
(G.GLOSSARY || []).forEach((g, i) => {
  ok(typeof g.term === 'string' && g.term.trim().length > 0, `slovníček ${i + 1}: má pojem`);
  ok(typeof g.text === 'string' && g.text.trim().length > 20, `slovníček ${i + 1}: má vysvetlenie`);
  ok(!terms.has(g.term), `slovníček: „${g.term}" je len raz`);
  terms.add(g.term);
});
for (const p of ['A1', 'Stundennachweis', 'SOKA-BAU', 'Samofakturácia', 'Partia', 'Obdobie']) {
  ok([...terms].some(t => t.includes(p)), `slovníček vysvetľuje „${p}"`);
}

// ── Appka návod naozaj načíta ───────────────────────────────────────────────
ok(/<script src="\.\/lib\/guide\.js"><\/script>/.test(INDEX), 'index.html načítava lib/guide.js');
ok(window.DanubraGuide === G, 'návod je vo window.DanubraGuide');

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
