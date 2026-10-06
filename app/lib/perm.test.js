// ============================================================================
// Testy práv
// Spustenie:  node app/lib/perm.test.js
// ============================================================================
// Najdôležitejší test v tomto súbore je ten posledný: porovnáva zoznam práv
// v appke s tým v databáze. Ochrana je v databáze — appka len skrýva to, na
// čo človek nemá. Keby sa tie dva zoznamy rozišli, appka by ponúkala niečo,
// čo databáza odmietne, a vyzeralo by to ako chyba appky, nie ako pravidlo.
// ============================================================================
global.window = global;
const fs = require('fs');
const path = require('path');
const P = require('./perm');

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

const admin = { role: 'admin', active: true };
const koord = { role: 'coordinator', active: true };
const nabor = { role: 'recruiter', active: true };
const ucto = { role: 'accountant', active: true };
const vsetci = [admin, koord];

console.log('Práva');

// ── Prázdna appka ───────────────────────────────────────────────────────────
// Kým nie je založený ani jeden člen, smie každý. Inak by sa prvý človek
// zamkol von a nemal by ako sa dostať dnu.
{
  ok(P.bootstrap([]), 'appka bez ľudí je otvorená');
  ok(P.bootstrap(null), 'a bez zoznamu tiež');
  ok(P.can(null, 'invoices', []), 'v prázdnej appke smie každý všade');
  ok(P.isAdmin(null, []), 'a je administrátorom');
  ok(!P.bootstrap([{ role: 'coordinator', active: true }]), 'prvý člen ju zamkne');
  ok(!P.bootstrap([admin]), 'aj administrátor');
  // Vypnutý človek sa neráta — inak by vypnutie posledného otvorilo appku.
  ok(P.bootstrap([{ role: 'admin', active: false }]),
    'vypnutý člen je, akoby tam nebol');
}

// ── Administrátor ───────────────────────────────────────────────────────────
{
  ok(P.can(admin, 'invoices', vsetci), 'administrátor smie na faktúry');
  ok(P.can(admin, 'invoice.approve', vsetci), 'a smie ich aj schváliť');
  ok(P.can(admin, 'deploy.override', vsetci), 'aj povoliť výnimku');
  ok(P.can(admin, 'settings', vsetci), 'aj do nastavení');
  ok(P.isAdmin(admin, vsetci), 'a vie sa o ňom, že je administrátor');
  eq(P.modulesOf(admin).length, P.MODULES.length + P.ADMIN_ONLY.length,
    'má všetky obrazovky aj právomoci');
}

// ── Tvrdé pravidlá zo zadania ───────────────────────────────────────────────
// Toto sú veci, ktoré sa nedajú dať nikomu inému — ani vlastným zoznamom.
{
  for (const [key] of P.ADMIN_ONLY) {
    ok(!P.can(koord, key, vsetci), `koordinátor nesmie „${key}"`);
    ok(!P.can(ucto, key, vsetci), `účtovníctvo nesmie „${key}"`);
  }
  const chytrak = { role: 'custom', active: true,
    modules: ['dashboard', 'invoice.approve', 'deploy.override', 'members.manage'] };
  ok(!P.can(chytrak, 'invoice.approve', vsetci),
    'schválenie faktúry sa nedá prideliť ani vlastným zoznamom');
  ok(!P.can(chytrak, 'deploy.override', vsetci), 'ani výnimku pri nasadení');
  ok(P.can(chytrak, 'dashboard', vsetci), 'ale zvyšok zoznamu platí');
  ok(!P.modulesOf(chytrak).includes('members.manage'),
    'a právomoc sa do zoznamu ani nedostane');
}

// ── Predvoľby rolí ──────────────────────────────────────────────────────────
{
  ok(P.can(koord, 'subcontracts', vsetci), 'koordinátor má zákazky');
  ok(P.can(koord, 'timesheets', vsetci), 'aj hodiny');
  ok(!P.can(koord, 'invoices', vsetci), 'ale nie vydané faktúry');
  ok(!P.can(koord, 'bank', vsetci), 'ani banku');

  ok(P.can(nabor, 'candidates', vsetci), 'náborár má kandidátov');
  ok(P.can(nabor, 'ads', vsetci), 'aj inzeráty');
  ok(!P.can(nabor, 'invoices', vsetci), 'ale k peniazom sa nedostane');
  ok(!P.can(nabor, 'costs', vsetci), 'ani k nákladom');

  ok(P.can(ucto, 'invoices', vsetci), 'účtovníctvo má faktúry');
  ok(P.can(ucto, 'bank', vsetci), 'aj banku');
  ok(!P.can(ucto, 'candidates', vsetci), 'ale nie kandidátov');
  ok(!P.can(ucto, 'settings', vsetci), 'ani nastavenia');

  // Prehľad má každý — bez neho by po prihlásení nebolo kam ísť.
  for (const m of [koord, nabor, ucto]) ok(P.can(m, 'dashboard', vsetci), 'prehľad má každý');
}

// ── Vlastný zoznam ──────────────────────────────────────────────────────────
// „Moduly, ak sú zadané, platia; inak predvoľba roly."
{
  const navyse = { role: 'recruiter', active: true, modules: ['dashboard', 'invoices'] };
  ok(P.can(navyse, 'invoices', vsetci), 'vlastný zoznam prebije predvoľbu');
  ok(!P.can(navyse, 'candidates', vsetci),
    'a to, čo v ňom nie je, už neplatí, aj keď to rola dávala');
  eq(P.modulesOf({ role: 'coordinator', active: true, modules: [] }).length,
    P.PRESETS.coordinator.length, 'prázdny zoznam znamená predvoľbu');
  eq(P.modulesOf({ role: 'custom', active: true }), [],
    'rola na mieru bez zoznamu nemá nič');
}

// ── Vypnutý a nepozvaný ─────────────────────────────────────────────────────
{
  ok(!P.can({ role: 'admin', active: false }, 'dashboard', vsetci),
    'vypnutý administrátor nesmie nikam');
  ok(!P.can(null, 'dashboard', vsetci), 'a kto nie je pozvaný, tiež nie');
  eq(P.modulesOf(null), [], 'nepozvaný nemá nič');
}

// ── Reč pre človeka ─────────────────────────────────────────────────────────
{
  eq(P.roleLabel('accountant'), 'Účtovníctvo', 'rola má slovenský názov');
  eq(P.roleLabel('nieco'), 'nieco', 'neznáma vráti sama seba');
  ok(P.describe(admin).includes('všetkému'), 'o administrátorovi sa to povie');
  ok(P.describe(null).includes('Nie je pozvaný'), 'aj o nepozvanom');
  ok(P.describe({ role: 'coordinator', active: false }).includes('vypnutý'),
    'aj o vypnutom');
  ok(P.describe({ role: 'recruiter', active: true, modules: ['dashboard'] }).includes('na mieru'),
    'a o tom, kto to má na mieru');
  ok(P.grouped().length > 3, 'moduly sa dajú vykresliť po skupinách');
  ok(P.grouped().every(g => g.items.length), 'a žiadna skupina nie je prázdna');
}

// ── Appka a databáza musia hovoriť to isté ──────────────────────────────────
// Ochrana je v databáze. Toto porovnáva, či appka ponúka presne to, čo
// databáza povolí — inak by sa človek preklikal niekam, kde dostane chybu.
{
  // Funkcia sa dá predefinovať neskoršou migráciou, takže platí tá posledná,
  // ktorá ju obsahuje — nie tá, ktorá ju založila.
  const dir = path.join(__dirname, '..', 'database', 'migrations');
  const sql = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
    .map(f => fs.readFileSync(path.join(dir, f), 'utf8'))
    .filter(x => /function danubra_can\(/.test(x))
    .pop();
  ok(sql, 'definícia práv je v migráciách');

  // Právomoci len pre administrátora
  const dbOnly = (/if p_key in \(([^)]+)\)/.exec(sql) || [, ''])[1]
    .split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
  eq(dbOnly.sort(), P.ADMIN_ONLY.map(p => p[0]).sort(),
    'právomoci len pre administrátora sedia s databázou');

  // Predvoľby rolí
  for (const role of ['coordinator', 'recruiter', 'accountant']) {
    const m = new RegExp(`when '${role}' then p_key in \\(([\\s\\S]*?)\\)`).exec(sql);
    ok(m, `v databáze je predvoľba pre rolu ${role}`);
    if (!m) continue;
    const db = m[1].split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
    eq(db.slice().sort(), P.PRESETS[role].slice().sort(),
      `predvoľba roly ${role} sedí s databázou`);
  }

  // Každá obrazovka v appke musí byť skutočná obrazovka v navigácii.
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const nav = app.slice(app.indexOf('navGroups:'), app.indexOf('groupOf(key)'));
  const routes = new Set([...nav.matchAll(/\['([a-z]+)', '[^']+', '[a-z]+'/g)].map(x => x[1]));
  const chybne = P.MODULES.map(m => m.key).filter(k => !routes.has(k));
  ok(chybne.length === 0, 'každé právo sa viaže na obrazovku, ktorá existuje',
    `neznáme: ${chybne.join(', ')}`);

  // A naopak: obrazovka, ktorá nie je ani v právach, ani medzi právomocami,
  // by bola pre každého okrem administrátora ticho neviditeľná.
  const staffing = [...nav.matchAll(/\['([a-z]+)', '[^']+', '[a-z]+', 'staffing'/g)]
    .map(m => m[1]);
  const vsade = ['dashboard', 'tasks', 'rules', 'settings', 'accommodations', 'members'];
  // Obrazovka s odvodeným právom je krytá tiež — len sa pýta na cudzie.
  const kryte = new Set([...P.MODULES.map(m => m.key),
    ...Object.keys(P.ROUTE_POWER), ...Object.keys(P.ROUTE_ALIAS)]);
  const zabudnute = [...new Set([...staffing, ...vsade])].filter(r => !kryte.has(r));
  ok(zabudnute.length === 0, 'každá obrazovka má povedané, kto na ňu smie',
    `bez práva: ${zabudnute.join(', ')}`);

  // Obrazovka, ktorá je len iným pohľadom na inú, nesmie mať vlastné právo —
  // inak vznikne nastavenie, pri ktorom človek vidí prehľad, ale nie mapu
  // k nemu. Preto sa jej právo odvodí od tej, ktorú zobrazuje.
  for (const [route, cieľ] of Object.entries(P.ROUTE_ALIAS)) {
    eq(P.keyOf(route), cieľ, `obrazovka ${route} sa pýta na právo ${cieľ}`);
    ok(!P.MODULES.some(m => m.key === route),
      `a nemá vlastné právo, ktoré by niekto musel prideľovať (${route})`);
    const kto = { role: 'custom', active: true, modules: [cieľ] };
    ok(P.can(kto, route, vsetci),
      `kto smie na ${cieľ}, smie aj na ${route}`);
    ok(!P.can({ role: 'custom', active: true, modules: [] }, route, vsetci),
      `a kto nesmie na ${cieľ}, nesmie ani na ${route}`);
  }

  // Správa používateľov je obrazovka aj právomoc — a prideliť sa nedá.
  eq(P.keyOf('members'), 'members.manage', 'používatelia sú právomoc, nie modul');
  ok(!P.can({ role: 'custom', active: true, modules: ['members'] }, 'members', vsetci),
    'a zaškrtnutím sa nedá obísť');
  ok(P.can(admin, 'members', vsetci), 'administrátor na ňu smie');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
