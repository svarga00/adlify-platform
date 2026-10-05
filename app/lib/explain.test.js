// ============================================================================
// Testy vysvetliviek
// Spustenie:  node app/lib/explain.test.js
// ============================================================================
// Vysvetlivka, ktorá sa otvorí prázdna, je horšia než žiadna — človek klikne,
// nedozvie sa nič a druhýkrát už neklikne. Preto sa tu kontroluje dvoje:
//
//   * každá téma má všetky tri časti a nie sú to jednoslovné odbavenia,
//   * každé tlačidlo „?" v kóde ukazuje na tému, ktorá naozaj existuje.
//
// Druhá kontrola je tá dôležitejšia. Kľúč je reťazec v HTML a preklep v ňom
// nespôsobí chybu — len tlačidlo, ktoré nič neotvorí.
// ============================================================================
global.window = global;
const fs = require('fs');
const path = require('path');
const X = require('./explain');

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

console.log('Vysvetlivky');

const KEYS = X.keys();

// ── Tvar ────────────────────────────────────────────────────────────────────
{
  ok(KEYS.length >= 30, `je ich dosť na to, aby to niečo vysvetlilo (${KEYS.length})`);
  eq(X.get('nieco-cudzie'), null, 'neznáma téma vráti null, nie pád');
  eq(X.has('app'), true, 'appka má vysvetlivku ako celok');
  eq(X.text('nieco-cudzie'), '', 'a text z nej je prázdny reťazec');
}

// ── Každá téma povie čo, ako a prečo ────────────────────────────────────────
// „Prečo" je tá časť, ktorá inak nikde nie je — preto sa vyžaduje rovnako
// ako zvyšok.
{
  const bad = [];
  for (const k of KEYS) {
    const t = X.get(k);
    const problems = [];
    if (!t.title || t.title.length < 3) problems.push('nadpis');
    if (!t.lead || t.lead.length < 40) problems.push('úvodná veta');
    for (const part of ['what', 'how', 'why']) {
      if (!Array.isArray(t[part]) || !t[part].length) problems.push(part);
      else if (t[part].some(p => typeof p !== 'string' || p.length < 30)) {
        problems.push(`${part} (odbyté)`);
      }
    }
    if (problems.length) bad.push(`${k}: ${problems.join(', ')}`);
  }
  ok(bad.length === 0, 'každá téma má nadpis, vetu, čo, ako aj prečo',
    bad.slice(0, 6).join('\n    '));
}

// ── Odkazy ──────────────────────────────────────────────────────────────────
// Odkaz v vysvetlivke vedie na obrazovku. Preklep v názve obrazovky by človeka
// poslal na prehľad bez toho, aby to čokoľvek povedalo.
{
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const nav = app.slice(app.indexOf('navGroups:'), app.indexOf("['SYSTÉM'"));
  const tail = app.slice(app.indexOf("['SYSTÉM'"), app.indexOf("['SYSTÉM'") + 400);
  const routes = new Set([...(nav + tail).matchAll(/\['([a-z]+)', '[^']+', '[a-z]+'/g)]
    .map(m => m[1]));
  ok(routes.size > 10, `zoznam obrazoviek sa prečítal (${routes.size})`);

  const bad = [];
  for (const k of KEYS) {
    for (const link of (X.get(k).links || [])) {
      if (!Array.isArray(link) || link.length !== 2) bad.push(`${k}: odkaz nie je dvojica`);
      else if (!routes.has(link[0])) bad.push(`${k} → ${link[0]}`);
      else if (!link[1]) bad.push(`${k} → ${link[0]} bez názvu`);
    }
  }
  ok(bad.length === 0, 'každý odkaz vedie na obrazovku, ktorá existuje',
    bad.slice(0, 6).join(', '));
}

// ── Obrazovky ───────────────────────────────────────────────────────────────
// Vysvetlivka sa k obrazovke pripája sama podľa jej názvu, takže obrazovka
// bez textu má tlačidlo „?" jednoducho bez obsahu — a nikto si to nevšimne.
{
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const nav = app.slice(app.indexOf('navGroups:'), app.indexOf('groupOf(key)'));
  // Obrazovky staffing agendy — ubytovacia je archivovaná (R4) a vysvetlivky
  // k nej sa nevyžadujú.
  const staffing = [...nav.matchAll(/\['([a-z]+)', '[^']+', '[a-z]+', 'staffing'/g)]
    .map(m => m[1]);
  const always = ['dashboard', 'tasks', 'rules', 'settings', 'accommodations'];
  const want = [...new Set([...staffing, ...always])];
  const missing = want.filter(r => !X.has(`screen.${r}`));
  ok(missing.length === 0, `každá obrazovka má vysvetlivku (${want.length})`,
    `chýba: ${missing.join(', ')}`);
}

// ── Tlačidlá v kóde ─────────────────────────────────────────────────────────
// Toto je ten test, kvôli ktorému to celé stojí za to: kľúč je reťazec v HTML
// a preklep v ňom nespôsobí chybu, len tlačidlo, ktoré nič neotvorí.
{
  const dir = path.join(__dirname, '..', 'js');
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) files.push(p);
    }
  })(dir);

  /** Argumenty volania od zátvorky, rozdelené len na najvyššej úrovni. */
  function args(src, at) {
    let depth = 0, cur = '', out = [];
    for (let i = at; i < src.length; i++) {
      const c = src[i];
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) {
        depth--;
        if (depth === 0) { out.push(cur); return out.map(s => s.trim()); }
      }
      if (depth === 1 && c === ',') { out.push(cur); cur = ''; continue; }
      if (!(depth === 1 && c === '(') && i > at) cur += c;
    }
    return null;                                  // nedovretá zátvorka
  }
  /** Reťazcový literál, alebo null (premenná, šablóna, výraz). */
  const literal = (s) => (/^'[^']*'$/.test(s || '') ? s.slice(1, -1) : null);

  const used = new Map();       // kľúč → kde
  for (const f of files) {
    // `help.js` sám vykresľuje tlačidlá zo šablóny — kľúče v ňom sú premenné.
    if (path.basename(f) === 'help.js') continue;
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/Help\.(?:btn|open)\('([^']+)'/g)) {
      if (!used.has(m[1])) used.set(m[1], path.basename(f));
    }
    // `_cardHead(..., exp, ...)` odvodzuje kľúč z exportu — `card.<export>`.
    for (const m of src.matchAll(/_cardHead\(/g)) {
      const a = args(src, m.index + '_cardHead'.length);
      // Definícia funkcie má na prvom mieste názov parametra, nie reťazec.
      if (!a || literal(a[0]) == null) continue;
      const exp = literal(a[3]);
      const key = literal(a[5]) || (exp ? `card.${exp}` : '');
      if (key && !used.has(key)) used.set(key, path.basename(f));
    }
  }

  ok(used.size >= 15, `v kóde sa používa ${used.size} vysvetliviek`);
  const missing = [...used].filter(([k]) => !X.has(k));
  ok(missing.length === 0, 'každé tlačidlo „?" v kóde má obsah',
    missing.map(([k, f]) => `${k} (${f})`).join(', '));
}

// ── Text sa dá prehľadať ────────────────────────────────────────────────────
{
  const t = X.text('card.money');
  ok(t.includes('§48b'), 'text témy obsahuje aj telo, nielen nadpis');
  ok(t.split('\n').length > 5, 'a sú v ňom všetky časti');
  // Pravidlá, ktoré sa nesmú stratiť — keby ich niekto z textu vyhodil,
  // appka by ich robila bez vysvetlenia.
  ok(X.text('kpi.approve').includes('bez schválenia')
    || X.text('kpi.approve').includes('bez\nschválenia'),
    'schvaľovanie faktúr je napísané pri faktúrach na schválenie');
  ok(X.text('kpi.docs').includes('A1'), 'A1 je napísané pri dokladoch');
  ok(X.text('screen.hoursheet').toLowerCase().includes('nemeck'),
    'pri výkaze je napísané, prečo je po nemecky');
  ok(X.text('screen.candidates').includes('súhlas'),
    'pri kandidátoch je napísané pravidlo o nahrávaní hovoru');
}

// ── Kľúče skladané v šablóne ────────────────────────────────────────────────
// `Help.btn(\`flow.${s.key}\`)` a `Help.btn(\`kpi.${d.key}\`)` nie sú reťazcové
// literály, takže ich test tlačidiel vyššie nevidí. Pritom sú to tie najhoršie
// prípady: kľúč sa poskladá za behu, nenájde sa a tlačidlo sa ticho nevykreslí.
// Preto sa porovnávajú priamo so zoznamom krokov a dlaždíc.
{
  const F = require('./chain.js');
  const D = require('./dashdetail.js');

  const chybaKrok = F.STEPS.map(s => s.key).filter(k => !X.has(`flow.${k}`));
  ok(chybaKrok.length === 0,
    `každý krok reťazca má vysvetlivku (${F.STEPS.length})`,
    `chýba: ${chybaKrok.map(k => `flow.${k}`).join(', ')}`);

  // A naopak — vysvetlivka ku kroku, ktorý už neexistuje, je text, ktorý nikto
  // neuvidí a nikto neopraví.
  const kroky = new Set(F.STEPS.map(s => s.key));
  const navyseKrok = KEYS.filter(k => k.startsWith('flow.') && !kroky.has(k.slice(5)));
  ok(navyseKrok.length === 0, 'a žiadna vysvetlivka nevisí pri kroku, ktorý zmizol',
    navyseKrok.join(', '));

  const chybaKpi = D.KPIS.map(d => d.key).filter(k => !X.has(`kpi.${k}`));
  ok(chybaKpi.length === 0, `každá dlaždica prehľadu má vysvetlivku (${D.KPIS.length})`,
    `chýba: ${chybaKpi.map(k => `kpi.${k}`).join(', ')}`);

  const dlazdice = new Set(D.KPIS.map(d => d.key));
  const navyseKpi = KEYS.filter(k => k.startsWith('kpi.') && !dlazdice.has(k.slice(4)));
  ok(navyseKpi.length === 0, 'a žiadna nevisí pri dlaždici, ktorá zmizla',
    navyseKpi.join(', '));

  // Číslo kroku v nadpise vysvetlivky musí sedieť s číslom na obrazovke.
  // Keby sa kroky preusporiadali, nadpis „9 · Nasadenie" by zostal pri inom.
  const zleCislo = F.STEPS.filter(s => {
    const t = X.get(`flow.${s.key}`);
    return t && !new RegExp(`^${s.n} · `).test(t.title);
  }).map(s => `${s.key}: ${X.get(`flow.${s.key}`).title} ≠ ${s.n}`);
  ok(zleCislo.length === 0, 'číslo kroku v nadpise sedí s poradím v reťazci',
    zleCislo.join('; '));
}

// ── Každá vysvetliteľná karta má „?" ────────────────────────────────────────
// `card-title` je v moduloch dvojaké. Raz je to **názov sekcie** („Zálohy",
// „Smieme ho nasadiť?") — tam vysvetlivka patrí. Druhýkrát je to **meno
// záznamu** v zozname (`${UI.esc(w.full_name)}`) — tam by „?" bolo nezmyselné:
// vysvetľovať sa má obrazovka, nie Ján Novák.
//
// Rozoznať sa to dá spoľahlivo: názov sekcie je napísaný v kóde natvrdo, meno
// záznamu sa dosadzuje. Preto sa pravidlo vzťahuje na statické nadpisy — a na
// všetky moduly naraz, nie na zoznam „hotových".
{
  const dir = path.join(__dirname, '..', 'js', 'modules');
  const bad = [];
  let sekcii = 0;
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/class="card-title"[^>]*>([\s\S]{0,250}?)<\/div>/g)) {
      const inner = m[1];
      // Odstráň samotné volanie Help.btn a pozri, či v nadpise zostalo
      // nejaké dosadenie. Keď áno, je to meno záznamu a pravidlo neplatí.
      const bezHelp = inner.replace(/\$\{\s*\n?\s*Help\.btn[^}]*\}/g, '');
      if (/\$\{/.test(bezHelp)) continue;
      sekcii++;
      if (!inner.includes('Help.btn')) {
        bad.push(`${f}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
  }
  ok(bad.length === 0,
    `každá sekcia s natvrdo napísaným nadpisom má „?" (${sekcii})`,
    `bez vysvetlivky: ${bad.join(', ')}`);
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
