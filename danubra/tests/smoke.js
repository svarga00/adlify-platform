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
t('mega menu ukazuje všetky zapnuté agendy',
  D && D.visibleAreas().every(a => D.megaHtml().includes(a[1])));
// na mobile sa bočný panel neotvára, takže toto musí byť v mega menu
t('mega menu má odhlásenie', D && D.megaHtml().includes('Odhlásiť sa'));

// ── Moduly: archivovaná agenda musí zmiznúť, nie sa len zneprístupniť ──────
if (D) {
  const restore = { ...D.modules };
  const area = D.area;

  // Stav podľa migrácie 013: ubytovanie vypnuté.
  D.modules = { recruiting: true, contracts: true, finance: true, accommodation: false };
  D.area = 'staffing';
  t('vypnutá agenda zmizne z prepínača', D.visibleAreas().length === 1);
  t('pri jedinej agende sa prepínač nekreslí', !D.megaHtml().includes('mega-area'));

  const hidden = ['inquiries', 'offers', 'orders', 'active', 'clients'];
  t('obchodná časť ubytovania nie je v navigácii',
    hidden.every(k => !D.visibleNav().some(n => n[0] === k)));
  t('archivovanú obrazovku nepustí ani odkaz',
    hidden.every(k => !D.routeAvailable(k)));
  t('mega menu neukazuje archivované obrazovky',
    !D.megaHtml().includes('Dopyty') && !D.megaHtml().includes('Aktívne pobyty'));

  // R4: databáza ubytovaní zostáva — ubytovanie je náklad zákazky.
  t('databáza ubytovaní zostáva dostupná (R4)', D.routeAvailable('accommodations'));
  t('databáza ubytovaní je v navigácii (R4)',
    D.visibleNav().some(n => n[0] === 'accommodations'));
  t('zákazky, hodiny a faktúry zostávajú',
    ['subcontracts', 'timesheets', 'invoices', 'candidates'].every(k => D.routeAvailable(k)));

  // Zapnuté ubytovanie musí vrátiť presne to, čo bolo v v1.
  D.modules = { ...D.modules, accommodation: true };
  t('zapnutie príznaku vráti agendu', D.visibleAreas().length === 2);
  t('zapnutie príznaku vráti obchodné obrazovky',
    hidden.every(k => D.routeAvailable(k)));

  // Vypnutie financií je iná os než agenda — nesmie zhodiť zvyšok.
  D.modules = { recruiting: true, contracts: true, finance: false, accommodation: false };
  t('vypnuté financie skryjú faktúry', !D.routeAvailable('invoices'));
  t('vypnuté financie nezhodia nábor', D.routeAvailable('candidates'));

  // Nastavenia sa nesmú dať vypnúť — inak by sa modul nedal zapnúť späť.
  D.modules = { recruiting: false, contracts: false, finance: false, accommodation: false };
  t('nastavenia zostanú dostupné vždy', D.routeAvailable('settings'));
  t('dashboard zostane dostupný vždy', D.routeAvailable('dashboard'));
  t('neznámy kľúč nie je obrazovka', !D.routeAvailable('nieco-co-neexistuje'));

  D.modules = restore; D.area = area;
}

// ── Peniaze a číselníky ────────────────────────────────────────────────────
t('knižnica Money je načítaná', sandbox.Money);
t('Money počíta v centoch',
  sandbox.Money && sandbox.Money.add(sandbox.Money.toCents('0,1'), sandbox.Money.toCents('0,2')) === 30);
t('knižnica Enums je načítaná', sandbox.Enums);
t('Enums majú jednotky aj bez databázy',
  sandbox.Enums && sandbox.Enums.label('unit', 'h') === 'hodina');

// ── Zdieľané komponenty ────────────────────────────────────────────────────
const Sh = sandbox.Shell;
t('komponenty Shell sú načítané', Sh);
if (Sh) {
  t('detail sa poskladá s bočným panelom',
    Sh.detail({ title: 'x', body: 'b', aside: 'a' }).includes('dt-aside'));
  t('poznámky nemajú ako zmazať',
    !Sh.notes({ notes: [{ body: 'x' }], onAdd: 'f()' }).includes('trash'));
  t('súčty formátujú sumy cez Money',
    Sh.sums({ lines: [{ label: 'x', cents: 873600 }] }).includes('8 736,00'));
  t('blokátor povie prečo',
    Sh.blocker({ reasons: [{ rule: 'missing_a1', label: 'Chýba A1' }] }).includes('Chýba A1'));
  t('dôvod výnimky sedí s CHECK v migrácii 013', Sh.REASON_MIN === 5);
}

// ── Prepínač agend v nastaveniach ──────────────────────────────────────────
// Ak sa agenda dá vypnúť len v SQL, nikto ju nezapne späť.
const Cfg = sandbox.Cfg;
t('nastavenia vedia prepínať agendy', Cfg && typeof Cfg.toggleModule === 'function');
t('prepínač pozná všetky agendy',
  Cfg && D && Cfg.MODULES.length === Object.keys(D.modules).length);
t('každá agenda z prepínača má význam v navigácii',
  Cfg && D && Cfg.MODULES.every(([k]) =>
    D.allNav().some(n => D.moduleOf(n) === k) || D.areas.some(a => a[0] === k)));

let bad = 0;
for (const [name, ok] of checks) { console.log((ok ? '  ✓ ' : '  ✗ ') + name); if (!ok) bad++; }
for (const f of failures) console.log('  ! ' + f);
console.log(bad ? `\n${bad} zlyhalo\n` : `\nrozhranie sa poskladá (${loaded} súborov)\n`);
process.exit(bad ? 1 : 0);
