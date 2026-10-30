// ============================================================================
// Strážca: čo sa dá stlačiť, tak aj vyzerá — a čo nie, netvári sa tak.
// „Keď viem, že na niečo viem kliknúť, chcem to vidieť a vedieť — minimálne
//  hover alebo nejaký shadow a zmena kurzoru."
//   node app/tests/clickable.test.js
//
// 1) app.css má poistku: ruka pre [onclick], role="button", summary,
//    label[for], .clickable; „zákaz" pre vypnuté tlačidlá; fokus z klávesnice;
//    zdvih kariet len bez „obmedziť pohyb".
// 2) Statické riadky a karty nemajú ruku ani hover (.list-row a .acc-card
//    ich dostanú až s [onclick] / role="button").
// 3) Klikateľný <div>/<span>/<tr>/<li>/<td> s onclick má role="button"
//    (a tabindex), aby sa dal stlačiť aj z klávesnice — Enter/medzerník
//    rieši jeden handler v ui.js.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let ok = 0, bad = 0;
const check = (cond, msg) => { if (cond) { ok++; console.log(`  ✓ ${msg}`); } else { bad++; console.log(`  ✗ ${msg}`); } };

// ── CSS ────────────────────────────────────────────────────────────────────
const css = fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
// Pravidlá aj vnútri @media: berieme najvnútornejšie „selektor { telo }".
const rules = [];
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  rules.push({ sel: m[1].trim().replace(/\s+/g, ' '), body: m[2] });
}
const ruleWith = (parts, prop) => rules.find(r => parts.every(p => r.sel.includes(p)) && prop.test(r.body));

check(ruleWith(['[onclick]:not(:disabled)', '[role="button"]', 'summary', 'label[for]', '.clickable'], /cursor:\s*pointer/),
  'poistka: [onclick], [role=button], summary, label[for], .clickable → cursor: pointer');
check(ruleWith(['button:disabled', '[aria-disabled="true"]'], /cursor:\s*not-allowed/),
  'vypnuté tlačidlo a aria-disabled → cursor: not-allowed');
check(rules.some(r => /:focus-visible/.test(r.sel) && r.sel.includes('[role="button"]') && /outline:/.test(r.body)),
  'klikateľné prvky majú viditeľný fokus z klávesnice (:focus-visible)');
check(/@media[^{]*prefers-reduced-motion:\s*no-preference[^{]*\{[^@]*translateY\(-1px\)/.test(css),
  'zdvih kariet pod myšou len pri prefers-reduced-motion: no-preference');

// Statické riadky / karty: základné pravidlo nesmie dávať ruku ani hover.
const bare = (cls) => rules.filter(r => r.sel.split(',').map(s => s.trim()).includes(cls));
for (const cls of ['.list-row', '.acc-card', '.mf-row']) {
  check(!bare(cls).some(r => /cursor:\s*pointer/.test(r.body)), `${cls} sám osebe nemá cursor: pointer`);
  check(!bare(`${cls}:hover`).length, `${cls}:hover nie je bez podmienky (statický riadok/karta sa netvári klikateľne)`);
}
check(rules.some(r => r.sel.includes('.list-row:is(') && r.sel.includes('[onclick]') && r.sel.includes(':hover')),
  'klikateľný .list-row má hover');
check(rules.some(r => r.sel.includes('.acc-card:is(') && r.sel.includes(':hover') && /box-shadow/.test(r.body)),
  'klikateľná .acc-card má hover s tieňom');
for (const sel of ['.list-row.is-static', '.pick-tile.is-static']) {
  check(ruleWith([sel], /cursor:\s*default/), `${sel} má cursor: default`);
}
check(rules.some(r => r.sel.includes('.arch-row:hover')) && rules.some(r => r.sel.includes('.arch-main:hover b') && /underline/.test(r.body)),
  'Dokumenty: riadok má hover, názov sa pod myšou podčiarkne');

// Zoznam s filtrami (DataList): riadok sa otvára cez delegovaný klik (nemá
// onclick), preto ruku a podfarbenie musí mať vo vlastnom pravidle.
check(ruleWith(['.dl-row.is-click'], /cursor:\s*pointer/) && rules.some(r => r.sel.includes('.dl-row.is-click:hover') && /background/.test(r.body)),
  'DataList: klikateľný riadok má ruku a hover');
for (const sel of ['.dl-dd-btn', '.dl-tog', '.dl-opt', '.dl-chip button', '.dl-sort', '.dl-act']) {
  check(rules.some(r => r.sel.split(',').map(x => x.trim()).includes(sel) && /cursor:\s*pointer/.test(r.body))
    && rules.some(r => r.sel.split(',').map(x => x.trim()).some(x => x.startsWith(`${sel}:hover`))),
  `DataList: ${sel} má ruku a hover`);
}

// ── JS: klikateľný <div>/<span> má role="button" ──────────────────────────
// Výnimka (zdôvodnená): onclick="event.stopPropagation()" nie je akcia —
// len zastaví klik, aby karta pod odkazmi neotvorila detail. Taký prvok sa
// tlačidlom tváriť nemá (v CSS: .link-row[onclick] { cursor: default }).
const ALLOW = /^"event\.stopPropagation\(\)"/;
const files = [path.join(ROOT, 'index.html')];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith('.js') && !f.name.endsWith('.test.js')) files.push(p);
  }
})(path.join(ROOT, 'js'));

/** Celá otváracia značka od `<` — preskočí `>` vnútri `${…}`. */
function openTag(s, lt) {
  let depth = 0;
  for (let i = lt; i < s.length && i < lt + 3000; i++) {
    if (s[i] === '$' && s[i + 1] === '{') { depth++; i++; continue; }
    if (depth && s[i] === '{') depth++;
    else if (depth && s[i] === '}') depth--;
    else if (!depth && s[i] === '>') return s.slice(lt, i + 1);
  }
  return s.slice(lt, lt + 300);
}

const missing = [], contradict = [];
let scanned = 0;
for (const p of files) {
  const s = fs.readFileSync(p, 'utf8');
  for (const m of s.matchAll(/onclick=/g)) {
    const lt = s.lastIndexOf('<', m.index);
    const tag = openTag(s, lt);
    const name = (tag.match(/^<(\w+)/) || [])[1];
    const where = `${path.relative(ROOT, p)}:${s.slice(0, m.index).split('\n').length}`;
    if (/cursor:\s*default/.test(tag)) contradict.push(where);
    if (!/^(div|span|tr|li|td|p|section|article)$/.test(name || '')) continue;
    scanned++;
    if (ALLOW.test(s.slice(m.index + 8))) continue;
    if (!/role="button"/.test(tag) || !/tabindex="0"/.test(tag)) missing.push(`${where}  <${name}>`);
  }
}
check(!missing.length, `klikateľný <div>/<span>/<tr> má role="button" tabindex="0" (${scanned} prvkov)`
  + (missing.length ? `:\n      ${missing.join('\n      ')}` : ''));
check(!contradict.length, 'prvok s onclick nemá v štýle cursor:default'
  + (contradict.length ? `:\n      ${contradict.join('\n      ')}` : ''));

const ui = fs.readFileSync(path.join(ROOT, 'js', 'ui.js'), 'utf8');
check(/addEventListener\('keydown'[\s\S]{0,400}\[role="button"\]\[onclick\][\s\S]{0,200}\.click\(\)/.test(ui),
  'ui.js: Enter/medzerník stlačí [role="button"][onclick]');

console.log(`\n${ok} prešlo, ${bad} zlyhalo`);
process.exit(bad ? 1 : 0);
