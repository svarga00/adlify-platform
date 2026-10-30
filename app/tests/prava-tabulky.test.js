// ============================================================================
// DANUBRA — práva podľa roly aj v databáze (migrácia 072)
// Spustenie:  node app/tests/prava-tabulky.test.js
// ============================================================================
// Od 072 databáza púšťa k tabuľke len toho, kto má príslušný modul
// (danubra_table_modules → danubra_can). Tento test stráži, aby:
//
//   1. každá tabuľka danubra_* z migrácií mala v mapovaní riadok — nová
//      tabuľka bez riadku by platila „pre každého člena" a nikto by si to
//      nevšimol,
//   2. kľúče v mapovaní boli presne kľúče z perm.js (MODULES) — preklep
//      „invoice" namiesto „invoices" by tabuľku zamkol všetkým okrem admina,
//   3. obrazovka, ktorá do tabuľky zapisuje, na to mala právo aj v databáze —
//      inak by tlačidlo v appke skončilo chybou „row-level security",
//   4. role videli to, čo majú (náborár nie faktúry, banku ani poštu),
//   5. Prehľad neukazoval karty o peniazoch tomu, kto ich dáta nedostane.
// ============================================================================
const fs = require('fs');
const path = require('path');
const P = require('../lib/perm.js');
const D = require('../lib/dashboard.js');

const APP = path.join(__dirname, '..');
const MIG = path.join(APP, 'database', 'migrations');

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}

console.log('Práva podľa roly v databáze');

const files = fs.readdirSync(MIG).filter(f => f.endsWith('.sql')).sort();
const all = files.map(f => fs.readFileSync(path.join(MIG, f), 'utf8')).join('\n');

// ── Tabuľky z migrácií ──────────────────────────────────────────────────────
const IGNORE = new Set(['danubra_members', 'danubra_table_modules']);
const tables = new Set([...all.matchAll(/create table (?:if not exists )?(?:public\.)?(danubra_[a-z0-9_]+)/gi)]
  .map(m => m[1]).filter(t => !IGNORE.has(t)));
ok(tables.size > 60, 'tabuľky sa dajú prečítať z migrácií', `našiel som ${tables.size}`);

// ── Mapovanie (riadky z migrácií, neskoršia prepíše skoršiu) ────────────────
const map = new Map();
const arr = (x) => (x === 'null' ? null : x.replace(/^'\{|\}'$/g, '').split(',').map(s => s.trim()).filter(Boolean));
for (const f of files) {
  const sql = fs.readFileSync(path.join(MIG, f), 'utf8');
  if (!/insert into danubra_table_modules\s*\(table_name/.test(sql)) continue;
  for (const m of sql.matchAll(/\('(danubra_[a-z0-9_]+)',\s*(null|'\{[a-z_,]*\}'),\s*(null|'\{[a-z_,]*\}'),/g)) {
    map.set(m[1], { read: arr(m[2]), write: arr(m[3]), file: f });
  }
}
ok(map.size > 60, 'mapovanie tabuľka → moduly je v migráciách', `riadkov: ${map.size}`);

{
  const bez = [...tables].filter(t => !map.has(t)).sort();
  ok(bez.length === 0, 'každá tabuľka danubra_* má v danubra_table_modules modul',
    `bez modulu: ${bez.join(', ')} — doplňte riadok do mapovania (072 alebo novšia migrácia)`);
  const navyse = [...map.keys()].filter(t => !tables.has(t)).sort();
  ok(navyse.length === 0, 'a mapovanie nepozná tabuľku, ktorá v migráciách nie je',
    `navyše: ${navyse.join(', ')}`);
}

// ── Kľúče sedia s perm.js ───────────────────────────────────────────────────
const MODS = new Set(P.MODULES.map(m => m.key));
{
  const pouzite = new Set();
  const zle = [];
  for (const [t, r] of map) {
    for (const k of [...(r.read || []), ...(r.write || [])]) {
      pouzite.add(k);
      if (!MODS.has(k)) zle.push(`${t}: ${k}`);
    }
  }
  ok(zle.length === 0, 'mapovanie používa len kľúče z perm.js → MODULES', `neznáme: ${zle.join(', ')}`);

  // Prehľad nemá vlastnú tabuľku — skladá sa z ostatných.
  const BEZ_TABULKY = new Set(['dashboard']);
  const nepouzite = [...MODS].filter(k => !pouzite.has(k) && !BEZ_TABULKY.has(k));
  ok(nepouzite.length === 0, 'každý modul z perm.js má v databáze aspoň jednu tabuľku',
    `bez tabuľky: ${nepouzite.join(', ')} — pridelenie takého modulu by v databáze nič neotvorilo`);

  // Obrazovky s odvodeným právom sa pýtajú na kľúč, ktorý musí existovať.
  const ciele = [...new Set(Object.values(P.ROUTE_ALIAS))].filter(k => !MODS.has(k));
  ok(ciele.length === 0, 'odvodené práva obrazoviek (ROUTE_ALIAS) mieria na existujúci modul',
    `neznáme: ${ciele.join(', ')}`);
}

// ── Politiky v 072 ──────────────────────────────────────────────────────────
{
  const m = fs.readFileSync(path.join(MIG, '072_prava_podla_roly.sql'), 'utf8');
  for (const op of ['select', 'insert', 'update', 'delete']) {
    ok(new RegExp(`as restrictive for ${op}[\\s\\S]{0,120}danubra_table_ok\\(`).test(m),
      `reštriktívna politika pre ${op} sa pýta danubra_table_ok`);
  }
  ok(/danubra_can\(k\)/.test(m), 'rozhoduje danubra_can — tie isté predvoľby ako perm.js');
  ok(/\(select danubra_table_ok\(%L, false\)\)/.test(m), 'kontrola beží raz na dotaz (select …), nie pre každý riadok');
  ok(/create trigger danubra_period_reopen_guard_all/.test(m)
    && /security definer[\s\S]{0,40}\$\$\s*select case[\s\S]*danubra_invoices/.test(m),
  'obdobie s faktúrou sa neotvorí ani koordinátorovi, ktorý faktúry nevidí');
}

// ── Kto čo vidí (to isté pravidlo ako danubra_table_ok) ─────────────────────
const vsetci = [{ user_id: 'a', role: 'admin', active: true }];
function smie(member, table, write) {
  const r = map.get(table);
  if (!r) return true;
  const any = (keys) => keys == null || keys.some(k => P.can(member, k, vsetci));
  if (member.role === 'admin') return true;
  if (write) return any(r.write || r.read);
  if (r.read == null) return true;
  return any([...r.read, ...(r.write || [])]);
}
{
  const nabor = { role: 'recruiter', active: true };
  const koord = { role: 'coordinator', active: true };
  const ucto = { role: 'accountant', active: true };
  const admin = { role: 'admin', active: true };

  for (const t of ['danubra_invoices', 'danubra_invoice_items', 'danubra_bills', 'danubra_costs',
    'danubra_advances', 'danubra_bank_transactions', 'danubra_leads']) {
    ok(!smie(nabor, t, false), `náborár nečíta ${t}`);
  }
  // Pošta: modul Správy (mail → messages) a navyše len pridelené schránky (058).
  const bezSprav = { role: 'custom', active: true, modules: ['dashboard', 'candidates'] };
  for (const t of ['danubra_mail_messages', 'danubra_mailboxes', 'danubra_messages']) {
    ok(!smie(bezSprav, t, false), `kto nemá Správy, nečíta ${t}`);
  }
  for (const t of ['danubra_candidates', 'danubra_workers', 'danubra_ads', 'danubra_call_recordings']) {
    ok(smie(nabor, t, false) && smie(nabor, t, true), `náborár číta aj zapisuje ${t}`);
  }
  for (const t of ['danubra_invoices', 'danubra_bank_transactions']) {
    ok(!smie(koord, t, false), `koordinátor nečíta ${t}`);
  }
  ok(smie(koord, 'danubra_costs', true) && smie(koord, 'danubra_bills', true), 'koordinátor zapisuje náklady a prijaté faktúry');
  for (const t of ['danubra_invoices', 'danubra_bills', 'danubra_bank_transactions', 'danubra_timesheets', 'danubra_workers']) {
    ok(smie(ucto, t, false), `účtovníctvo číta ${t}`);
  }
  ok(!smie(ucto, 'danubra_candidates', false), 'účtovníctvo nečíta kandidátov');
  for (const m of [nabor, koord, ucto]) {
    for (const t of ['danubra_settings', 'danubra_tasks', 'danubra_enums', 'danubra_trades', 'danubra_partners', 'danubra_subcontracts']) {
      ok(smie(m, t, false), `${m.role} číta ${t} (Prehľad a mená po celej appke)`);
    }
  }
  ok([...map.keys()].every(t => smie(admin, t, false) && smie(admin, t, true)), 'admin smie všetko');
}

// ── Obrazovka zapisuje len tam, kam smie aj podľa databázy ──────────────────
// Súbor → moduly, z ktorých sa používa (rovnaké kľúče ako perm.js; odvodené
// obrazovky cez ROUTE_ALIAS). Zápis musí prejsť pre **každý** z nich.
const FILE_MODULES = {
  'js/modules/accommodations.js': ['accommodations'],
  'js/modules/ads.js': ['ads'],
  'js/modules/advances.js': ['costs'],
  'js/modules/bank.js': ['bank'],
  'js/modules/candidate-process.js': ['candidates'],
  'js/modules/candidates.js': ['candidates'],
  'js/modules/compliance-view.js': ['compliance'],
  'js/modules/contracts.js': ['contracts'],
  'js/modules/costs.js': ['costs'],
  'js/modules/crews.js': ['crews'],
  'js/modules/hiring.js': ['hiring'],
  'js/modules/hoursheet.js': ['hoursheet'],
  'js/modules/interview.js': ['candidates', 'hiring'],
  'js/modules/invoice-tools.js': ['invoices'],
  'js/modules/invoices.js': ['invoices'],
  'js/modules/leads.js': ['marketing'],
  'js/modules/mail.js': ['messages'],
  'js/modules/marketing.js': ['marketing'],
  // Oslovovanie (078): šablóny oslovenia a nastavenia mení len admin (GATED nižšie).
  'js/modules/outreach.js': ['marketing'],
  'js/modules/members.js': ['settings'],
  'js/modules/messages.js': ['messages'],
  'js/modules/money.js': ['bank'],
  'js/modules/onboarding.js': ['hiring'],
  'js/modules/opportunities.js': ['contracts'],
  'js/modules/partners.js': ['partners'],
  'js/modules/plankit.js': ['hiring', 'contracts'],
  'js/modules/printwork.js': ['marketing'],
  'js/modules/quotes.js': ['quotes'],
  'js/modules/recruiting.js': ['recruiting'],
  'js/modules/settings.js': ['settings'],
  'js/modules/subcontracts.js': ['subcontracts'],
  'js/modules/tasks.js': ['tasks'],
  'js/modules/timesheets.js': ['timesheets'],
  'js/modules/trades.js': ['trades'],
  'js/modules/website.js': ['marketing'],
  'js/modules/workers.js': ['workers'],
  'js/modules/workorders.js': ['contracts'],
  'js/modules/archiv/clients.js': ['invoices'],
  'js/modules/archiv/inquiries.js': ['invoices'],
  'js/modules/archiv/offers.js': ['invoices'],
  'js/modules/archiv/orders.js': ['invoices'],
  'js/components/bundle.js': ['workers', 'subcontracts'],
  'js/components/comm-panel.js': ['workers', 'candidates', 'partners', 'accommodations'],
  'js/components/hourentry.js': ['timesheets', 'hoursheet', 'subcontracts'],
  'js/services/docs.js': ['workers', 'subcontracts', 'invoices', 'contracts'],
  'js/services/invoicing.js': ['invoices'],
  'js/services/orders-service.js': ['invoices'],
};
// Tabuľky, do ktorých zapisuje len admin už podľa skorších pravidiel (030).
const ADMIN_TABLES = new Set(['danubra_settings', 'danubra_members']);
// Zápis, ktorý appka sama pustí len s iným právom (overené nižšie).
const GATED = { 'js/modules/workers.js': { danubra_advances: 'costs' },
  // Šablóny oslovenia upraví len administrátor (Outreach.templateForm → Danubra.isAdmin).
  'js/modules/outreach.js': { danubra_message_templates: 'settings' } };

function jsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(p));
    else if (e.name.endsWith('.js') && !e.name.endsWith('.test.js')) out.push(p);
  }
  return out;
}
{
  const zle = [];
  const nezname = [];
  for (const f of jsFiles(path.join(APP, 'js'))) {
    const rel = path.relative(APP, f).split(path.sep).join('/');
    const src = fs.readFileSync(f, 'utf8');
    const writes = new Set();
    for (const m of src.matchAll(/DB\.(insert|insertMany|update|remove|from)\(\s*['`]([a-z_]+)['`]/g)) {
      const t = m[2].startsWith('danubra_') ? m[2] : `danubra_${m[2]}`;
      if (m[1] === 'from') {
        const tail = src.slice(m.index, m.index + 300).split(';')[0];
        if (!/\.(insert|update|upsert|delete)\(/.test(tail)) continue;
      }
      writes.add(t);
    }
    for (const m of src.matchAll(/client\.from\('(danubra_[a-z_]+)'\)\s*\.(insert|update|upsert|delete)\(/g)) writes.add(m[1]);
    if (!writes.size) continue;
    const mods = FILE_MODULES[rel];
    if (!mods) { nezname.push(rel); continue; }
    for (const t of writes) {
      if (ADMIN_TABLES.has(t)) continue;
      const r = map.get(t);
      if (!r) continue;                          // chýbajúci riadok hlási test vyššie
      const w = r.write || r.read;
      for (const k of mods) {
        const gate = GATED[rel] && GATED[rel][t];
        if (w && !w.includes(k) && !(gate && w.includes(gate))) zle.push(`${rel} (${k}) → ${t}`);
      }
    }
  }
  ok(nezname.length === 0, 'každý súbor, ktorý zapisuje, má v teste povedané, z ktorej obrazovky je',
    `doplňte do FILE_MODULES: ${nezname.join(', ')}`);
  ok(zle.length === 0, 'obrazovka zapisuje len do tabuliek, na ktoré má jej modul právo zápisu',
    `bez práva: ${zle.join('; ')}`);

  const wrk = fs.readFileSync(path.join(APP, 'js', 'modules', 'workers.js'), 'utf8');
  ok(/money\(\) \{ return Danubra\.can\('costs'\); \}/.test(wrk)
    && /if \(!this\.money\(\)\) \{\s*return UI\.toast/.test(wrk),
  'zálohu z karty človeka zapíše len ten, kto smie na náklady (Wrk.money)');
}

// ── Prehľad: karty o peniazoch len s právom ─────────────────────────────────
{
  const can = (m) => (k) => P.can(m, k, vsetci);
  const nabor = D.denied(can({ role: 'recruiter', active: true }));
  for (const k of ['cashflow', 'money', 'weeks', 'margin', 'profit', 'tied', 'cash']) {
    ok(nabor.includes(k), `náborár nevidí na Prehľade kartu „${D.byKey(k).title}"`);
  }
  ok(!nabor.includes('tasks') && !nabor.includes('hiring'), 'ale úlohy a nábor áno');
  ok(D.denied(can({ role: 'admin', active: true })).length === 0, 'admin vidí všetky karty');
  ok(D.denied(can({ role: 'accountant', active: true })).every(k => !['cashflow', 'money', 'cash'].includes(k)),
    'účtovníctvo vidí cash-flow aj pohľadávky');
  const p = D.normalize({ deny: nabor });
  ok(D.pinned(p).length === 0 && D.tabs(p).every(t => t.key !== 'money'),
    'záložka Peniaze a cash-flow sa náborárovi ani nevykreslia');
  ok(D.visible(p).some(c => c.key === 'tasks'), 'a úlohy zostanú');
  ok(!('deny' in D.normalize({})) && !('deny' in D.normalize({ deny: [] })),
    'bez obmedzenia sa nastavenie nemení (deny sa nepridáva)');

  const app = fs.readFileSync(path.join(APP, 'js', 'app.js'), 'utf8');
  for (const t of ['invoices', 'bills', 'costs', 'bank_transactions', 'v_cashflow']) {
    const dash = app.slice(app.indexOf('async _dashLoad()'), app.indexOf('async _dashLoad()') + 4000);
    ok(new RegExp(`_ifCan\\(\\[[^\\]]+\\], \\(\\) => DB\\.list\\('${t}'`).test(dash),
      `Prehľad sa na ${t} pýta len s právom`);
  }
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
