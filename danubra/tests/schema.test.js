// ============================================================================
// DANUBRA — appka si nesmie pýtať stĺpce, ktoré v databáze nie sú
// Spustenie:  node danubra/tests/schema.test.js
// ============================================================================
// Toto je test, ktorý mal existovať skôr. Prehľad si pýtal
// `v_worker_documents.doc_type` a `v_quote_margin.total` — ani jeden
// z nich neexistuje. Appka to poctivo ohlásila ako „časť údajov sa
// nenačítala", ale až v prevádzke, na obrazovke, pred človekom.
//
// Stubované testy to chytiť nevedia: fixtúra vráti, čo si vymyslíš.
// Preto sa tu nečíta fixtúra, ale **migrácie** — jediný zdroj pravdy o tom,
// aké stĺpce v databáze naozaj sú.
//
// Čo sa kontroluje:
//   * `DB.list('tabuľka', { select: 'a,b,c' })`
//   * `DB.list('tabuľka', { filters: { stĺpec: … } })`
//   * `DB.list('tabuľka', { order: { column: 'stĺpec' } })`
//
// Čo sa nekontroluje a prečo: stĺpce v `insert`/`update` sa skladajú
// z formulárov za behu a staticky sa prečítať nedajú. Tie stráži databáza
// sama — chybný názov skončí hláškou, nie tichým prázdnom.
// ============================================================================
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const migDir = path.join(root, 'database', 'migrations');

let passed = 0, failed = 0;
function t(name, ok) {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}`); }
}

console.log('Stĺpce proti migráciám');

// ── Schéma z migrácií ───────────────────────────────────────────────────────
const sql = fs.readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()
  .map(f => fs.readFileSync(path.join(migDir, f), 'utf8')).join('\n');

/** table → Set(stĺpce) */
const schema = new Map();
const add = (table, col) => {
  if (!table || !col) return;
  if (!schema.has(table)) schema.set(table, new Set());
  schema.get(table).add(col);
};

// `create table … ( … )`
for (const m of sql.matchAll(/create table if not exists\s+(danubra_\w+)\s*\(([\s\S]*?)\n\);/g)) {
  const [, table, body] = m;
  for (let line of body.split('\n')) {
    line = line.replace(/--.*$/, '').trim();
    if (!line) continue;
    // Obmedzenia a kľúče nie sú stĺpce.
    if (/^(constraint|primary key|unique|foreign key|check)\b/i.test(line)) continue;
    // Na jednom riadku býva viac stĺpcov:
    //   `postal_code text, address text, lat numeric, lng numeric,`
    // Zátvorky a reťazce sa najprv vyhodia, nech sa neláme na čiarke
    // vnútri `default now()` alebo `array['a','b']`.
    const flat = line.replace(/'[^']*'/g, "''").replace(/\([^()]*\)/g, '()');
    for (const part of flat.split(',')) {
      const col = part.trim().match(/^([a-z_][a-z0-9_]*)\s+\S/i);
      if (col && !/^(constraint|primary|unique|foreign|check|not|default|references)$/i.test(col[1])) {
        add(table, col[1]);
      }
    }
  }
}

// `alter table … add column [if not exists] <stĺpec>`
for (const m of sql.matchAll(/alter table\s+(danubra_\w+)\s+add column(?:\s+if not exists)?\s+([a-z_][a-z0-9_]*)/gi)) {
  add(m[1], m[2]);
}

// Pohľady. `x.*` zdedí stĺpce základnej tabuľky, `… as alias` pridá alias.
for (const m of sql.matchAll(/create or replace view\s+(danubra_\w+)\s+as\s+([\s\S]*?);\s*\n/g)) {
  const [, view, body] = m;
  add(view, 'id');                        // pohľady v tomto projekte id vždy nesú
  // `from danubra_x alias` / `join danubra_x alias`
  const aliases = new Map();
  for (const f of body.matchAll(/\b(?:from|join)\s+(danubra_\w+)\s+(?:as\s+)?([a-z][a-z0-9_]*)/gi)) {
    aliases.set(f[2].toLowerCase(), f[1]);
  }
  for (const star of body.matchAll(/\b([a-z][a-z0-9_]*)\.\*/gi)) {
    const base = aliases.get(star[1].toLowerCase());
    if (base && schema.has(base)) for (const c of schema.get(base)) add(view, c);
  }
  for (const a of body.matchAll(/\bas\s+([a-z_][a-z0-9_]*)\b/gi)) {
    // `as` sa používa aj pri aliasoch tabuliek — tie sú v `aliases`.
    if (!aliases.has(a[1].toLowerCase())) add(view, a[1]);
  }
  // Holé stĺpce v zozname: `  x.stlpec,`
  for (const c of body.matchAll(/^\s{2,}[a-z][a-z0-9_]*\.([a-z_][a-z0-9_]*)\s*,?\s*$/gim)) {
    add(view, c[1]);
  }
}

t(`schéma prečítaná (${schema.size} tabuliek a pohľadov)`, schema.size > 20);

// ── Čo si appka pýta ────────────────────────────────────────────────────────
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor') walk(p); }
    else if (e.name.endsWith('.js')) files.push(p);
  }
})(path.join(root, 'js'));

const PREFIX = 'danubra_';
const full = (name) => (name.startsWith(PREFIX) ? name : PREFIX + name);

const problems = [];
const checked = { select: 0, filter: 0, order: 0 };

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file);

  // DB.list('tabuľka', { … })  — berieme telo až po zodpovedajúcu zátvorku
  for (const m of src.matchAll(/DB\.list\(\s*'([a-z_]+)'\s*,\s*\{([\s\S]{0,600}?)\}\s*\)/g)) {
    const table = full(m[1]);
    const body = m[2];
    const cols = schema.get(table);
    if (!cols) { problems.push(`${rel}: neznáma tabuľka ${table}`); continue; }

    const sel = body.match(/select:\s*'([^']+)'/);
    if (sel) {
      for (const col of sel[1].split(',').map(x => x.trim()).filter(Boolean)) {
        checked.select++;
        if (!cols.has(col)) problems.push(`${rel}: ${table}.${col} (select)`);
      }
    }
    const ord = body.match(/order:\s*\{\s*column:\s*'([a-z_]+)'/);
    if (ord) {
      checked.order++;
      if (!cols.has(ord[1])) problems.push(`${rel}: ${table}.${ord[1]} (order)`);
    }
    const flt = body.match(/filters:\s*\{([^}]*)\}/);
    if (flt) {
      for (const f of flt[1].matchAll(/([a-z_][a-z0-9_]*)\s*:/g)) {
        checked.filter++;
        if (!cols.has(f[1])) problems.push(`${rel}: ${table}.${f[1]} (filter)`);
      }
    }
  }
}

t(`skontrolovaných ${checked.select} stĺpcov v select, ${checked.filter} vo filtri, ${checked.order} v zoradení`,
  checked.select > 50);

if (problems.length) {
  console.log('\n  Chýbajúce stĺpce:');
  for (const p of [...new Set(problems)]) console.log(`    · ${p}`);
}
t('appka si nepýta nič, čo v databáze nie je', problems.length === 0);

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
