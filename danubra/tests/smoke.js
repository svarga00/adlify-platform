// ============================================================================
// DANUBRA — smoke test rozhrania
// Spustenie:  node danubra/tests/smoke.js
// ============================================================================
// Načíta všetky skripty z index.html v stubovanom DOM a overí, že sa appka
// poskladá: moduly sa zaregistrujú, pohľady existujú, knižnice sú na svete.
// Nenahrádza jednotkové testy — chytá to, čo ony nevidia: preklep v názve
// súboru, chýbajúci <script>, výnimku pri načítaní modulu.
// ============================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const listeners = {};
const el = () => ({
  innerHTML: '', style: {}, hidden: false, textContent: '', value: '',
  addEventListener() {}, appendChild() {}, remove() {}, focus() {},
  querySelector() { return null; }, querySelectorAll() { return []; },
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  dataset: {},
});

const sandbox = {
  window: {},
  document: {
    addEventListener(ev, cb) { listeners[ev] = cb; },
    getElementById() { return el(); },
    querySelector() { return el(); },
    querySelectorAll() { return []; },
    createElement() { return el(); },
    body: { appendChild() {}, style: {} },
  },
  location: { hash: '' }, navigator: {},
  addEventListener() {}, removeEventListener() {},
  prompt() { return null; }, confirm() { return true; },
  setTimeout() {}, clearTimeout() {}, console, TextEncoder,
  supabase: {
    createClient() {
      return {
        auth: {
          getUser: async () => ({ data: { user: null } }),
          onAuthStateChange() {}, signInWithPassword: async () => ({}), signOut: async () => ({}),
        },
        rpc: async () => ({}),
        from() {
          return {
            select() { return this; }, eq() { return this; }, order() { return this; },
            limit() { return this; }, in() { return this; }, or() { return this; },
            maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }),
            insert() { return this; }, update() { return this; },
            upsert: async () => ({ error: null }), delete() { return this; },
          };
        },
        storage: { from() { return { upload: async () => ({}), createSignedUrl: async () => ({}), remove: async () => ({}) }; } },
      };
    },
  },
};
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);

// Zoznam súborov berieme z index.html, nech test nikdy nezaostane za appkou.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)].map(m => m[1]);

let loaded = 0;
const failures = [];
for (const f of files) {
  try {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
    loaded++;
  } catch (e) {
    failures.push(`${f} — ${e.message}`);
  }
}
try { listeners.DOMContentLoaded && listeners.DOMContentLoaded(); } catch { /* init bez DOM */ }

const D = sandbox.Danubra;
const checks = [];
const t = (name, ok) => checks.push([name, !!ok]);

t(`načítalo sa všetkých ${files.length} súborov`, loaded === files.length && !failures.length);
t('Danubra existuje', D);
t('router má pohľady', D && Object.keys(D.views).length >= 20);

// každá položka navigácie musí mať svoj pohľad, inak vedie do prázdna
const missing = D ? D.allNav().map(n => n[0]).filter(k => !D.views[k]) : ['(bez Danubra)'];
t(`každá položka menu má pohľad${missing.length ? ' — chýba: ' + missing.join(', ') : ''}`, !missing.length);

for (const [name, obj] of [
  ['Guide', sandbox.Guide], ['Cand', sandbox.Cand], ['CandProc', sandbox.CandProc],
  ['Hire', sandbox.Hire], ['Trades', sandbox.Trades], ['Wrk', sandbox.Wrk], ['Sub', sandbox.Sub],
]) t(`modul ${name}`, obj);

for (const [name, obj] of [
  ['DanubraChips', sandbox.DanubraChips], ['DanubraProcess', sandbox.DanubraProcess],
  ['DanubraScreening', sandbox.DanubraScreening], ['DanubraQR', sandbox.DanubraQR],
  ['DanubraCompliance', sandbox.DanubraCompliance], ['DanubraMargin', sandbox.DanubraMargin],
]) t(`knižnica ${name}`, obj);

t('ikony fungujú', sandbox.Icon && sandbox.Icon('check', 14).startsWith('<svg'));
t('mega menu sa poskladá', D && D.megaHtml().includes('mega-col'));
t('mega menu ukazuje obe agendy',
  D && D.areas.every(a => D.megaHtml().includes(a[1])));
// na mobile sa bočný panel neotvára, takže toto musí byť v mega menu
t('mega menu má prepínač agend', D && D.megaHtml().includes('mega-area'));
t('mega menu má odhlásenie', D && D.megaHtml().includes('Odhlásiť sa'));

let bad = 0;
for (const [name, ok] of checks) { console.log((ok ? '  ✓ ' : '  ✗ ') + name); if (!ok) bad++; }
for (const f of failures) console.log('  ! ' + f);
console.log(bad ? `\n${bad} zlyhalo\n` : `\nrozhranie sa poskladá (${loaded} súborov)\n`);
process.exit(bad ? 1 : 0);
