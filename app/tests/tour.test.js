// ============================================================================
// Sprievodca pre nového kolegu (js/components/tour.js)
// Spustenie:  node app/tests/tour.test.js
// ============================================================================
// Statické kontroly: čo komponent vystavuje, že pamäť „už videl" nepadne
// v súkromnom okne, že je zapojený v index.html, v app.js aj v „?", a že
// v ňom nie sú emoji. K tomu pár kontrol správania bez prehliadača.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const src = read('js/components/tour.js');
const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}

console.log('Sprievodca');

// ── Čo vystavuje ────────────────────────────────────────────────────────────
ok(/window\.Tour\s*=\s*Tour/.test(code), 'vystavuje window.Tour');
for (const fn of ['start', 'maybeAutoStart', 'reset', 'go', 'next', 'back', 'skip', 'isDone']) {
  ok(new RegExp(`\\n\\s{4}${fn}\\s*\\(`).test(code), `Tour.${fn}()`);
}
ok(/DanubraGuide\.TOUR/.test(code), 'kroky berie z DanubraGuide.TOUR');
ok(/FALLBACK\s*=\s*\[/.test(code), 'má náhradné kroky, kým lib/guide.js nie je');

// ── localStorage len v try/catch ────────────────────────────────────────────
ok(/'danubra_tour_done_'/.test(code), "kľúč 'danubra_tour_done_<userId>'");
{
  const uses = [...code.matchAll(/localStorage\.\w+\(/g)];
  const bare = uses.filter(m => {
    const before = code.slice(Math.max(0, m.index - 60), m.index);
    return !/try\s*\{[^}]*$/.test(before);
  });
  ok(uses.length >= 3 && !bare.length, `localStorage je vždy v try/catch (${uses.length}×)`,
    bare.map(m => code.slice(m.index - 40, m.index + 30).replace(/\s+/g, ' ')).join(' | '));
}

// ── Prístupnosť a správanie ─────────────────────────────────────────────────
ok(/role="dialog"/.test(src) && /aria-modal="true"/.test(src), 'bublina je role="dialog" aria-modal');
ok(/'Escape'/.test(code) && /'ArrowRight'/.test(code) && /'ArrowLeft'/.test(code), 'Esc, ← a → fungujú');
ok(/'Tab'/.test(code), 'fokus zostáva v bubline (Tab)');
ok(/prefers-reduced-motion/.test(code), 'rešpektuje obmedzenie pohybu');
ok(/addEventListener\('resize'/.test(code) && /addEventListener\('scroll'/.test(code), 'pri zmene veľkosti a rolovaní sa presunie');
ok(/AUTO_MIN_W\s*=\s*700/.test(code), 'sám sa spúšťa len od 700 px');
ok(/#ui-modal/.test(code), 'sám sa nespustí cez otvorené okno');
for (const t of ['Späť', 'Ďalej', 'Hotovo', 'Preskočiť sprievodcu', 'Krok ${i + 1} z ${n}']) {
  ok(src.includes(t), `text „${t}"`);
}

// ── Zapojenie ───────────────────────────────────────────────────────────────
const html = read('index.html');
const iTour = html.indexOf('./js/components/tour.js');
ok(iTour > 0, 'index.html načíta tour.js');
ok(iTour > html.indexOf('./js/components/help.js') && iTour > html.indexOf('./js/app.js'),
  'tour.js ide po app.js a ostatných komponentoch');
ok(/Tour\.maybeAutoStart\(\)/.test(read('js/app.js')), 'app.js ho po vykreslení spustí pri prvom prihlásení');
const help = read('js/components/help.js');
ok(help.includes('Prejsť appku so sprievodcom') && /UI\.closeModal\(\);Tour\.start\(\)/.test(help),
  '„?" má tlačidlo, ktoré zavrie okno a spustí sprievodcu');
const css = read('app.css');
ok(/\.tour-card\s*\{/.test(css) && /\.tour-spot\s*\{/.test(css), 'app.css má blok Sprievodca');
{
  const m = css.match(/\.tour\s*\{[^}]*z-index:\s*(\d+)/);
  ok(m && Number(m[1]) > 200, `sprievodca je nad oknami a otáznikom (z-index ${m && m[1]})`);
}

// ── Bez emoji ───────────────────────────────────────────────────────────────
// Rovnaké pravidlo ako no-emoji.test.js: typografická šípka → smie zostať.
const BAD = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{25A0}-\u{25FF}\u{2190}\u{2191}\u{2193}-\u{21FF}]/u;
ok(!BAD.test(src), 'tour.js je bez emoji a obrázkových znakov');

// ── Správanie bez prehliadača ───────────────────────────────────────────────
{
  const store = {};
  let broken = false;
  const ls = {
    getItem(k) { if (broken) throw new Error('SecurityError'); return k in store ? store[k] : null; },
    setItem(k, v) { if (broken) throw new Error('SecurityError'); store[k] = String(v); },
    removeItem(k) { if (broken) throw new Error('SecurityError'); delete store[k]; },
  };
  const sb = { console, localStorage: ls, innerWidth: 1440, setTimeout, clearTimeout };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(src, sb, { filename: 'tour.js' });
  const T = sb.Tour;
  ok(T && typeof T.start === 'function', 'načíta sa bez DOM');
  ok(T.FALLBACK.length >= 6 && T.FALLBACK.every(s => s.selector && s.title && s.text),
    `náhradné kroky majú selektor, nadpis a text (${T.FALLBACK.length})`);
  ok(T.isDone() === false, 'bez prihláseného človeka nie je nič „hotové"');
  ok(T.maybeAutoStart() === false, 'bez prihláseného človeka sa sám nespustí');

  sb.Danubra = { user: { id: 'u1', email: 'a@b.sk' } };
  ok(T.isDone() === false, 'nový človek ho ešte nevidel');
  store.danubra_tour_done_u1 = '2026-10-27';
  ok(T.isDone() === true, 'zapamätá sa podľa id človeka');
  ok(T.maybeAutoStart() === false, 'kto ho už videl, tomu sa sám nespustí');
  T.reset();
  ok(T.isDone() === false, 'reset() ho dovolí znova');

  sb.innerWidth = 390;
  ok(T.maybeAutoStart() === false, 'na telefóne sa sám nespustí');

  broken = true;
  let threw = false;
  try { T.isDone(); T.reset(); } catch { threw = true; }
  ok(!threw, 'v súkromnom okne (localStorage hádže) nespadne');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
