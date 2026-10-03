// ============================================================================
// Testy dokumentov
// Spustenie:  node app/lib/documents/templates.test.js
// ============================================================================
// Dokumenty doteraz testoval len prehliadač — či sa vôbec vykreslia. To je
// málo: dokument, ktorý sa vykreslí, ale je v ňom zlé číslo alebo zlá veta,
// odíde odberateľovi rovnako ochotne ako ten správny.
//
// Najviac na tom záleží pri zmluve. Je to jediný papier, ktorý pri kontrole
// obhajuje celý model — a zároveň jediný, ktorý sa podpisuje perom.
// ============================================================================
global.window = global;
const fs = require('fs');
const path = require('path');
const P = require('./templates');

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}

const SUPPLIER = { name: 'Partner und Service s. r. o.', email: 'info@ps.sk',
  address: 'Podzámska 9468/4A', city: '940 71 Nové Zámky', ico: '55667788' };
const CLIENT = { name: 'Bauunternehmen Vogel GmbH', vat_id: 'DE811234567', country: 'DE' };
const BASE = {
  contract_number: 'ZML-2026-0007', title: 'Trockenbau Wohnpark',
  scope: 'Lieferung und Montage von Trockenbauwänden.',
  site_name: 'Wohnpark Feuerbach', site_city: 'Stuttgart', site_address: 'Feuerbacher Weg 12',
  date_from: '2026-10-01', date_to: '2027-03-31', payment_terms_days: 30,
};
const doc = (c = {}, amendments = []) => P.werkvertrag({
  contract: { ...BASE, ...c }, client: CLIENT, supplier: SUPPLIER, amendments });

console.log('Dokumenty');

// ── Zmluva je zmluva, nie faktúra ───────────────────────────────────────────
{
  const h = doc({ price_model: 'fixed', fixed_price: 48000 });
  ok(h.includes('Werkvertrag'), 'dokument sa volá Werkvertrag');
  ok(h.includes('ZML-2026-0007'), 'a nesie číslo zmluvy');
  ok(h.includes('Auftragnehmer') && h.includes('Auftraggeber'),
    'strany sú po nemecky');
  ok(h.includes('Wohnpark Feuerbach') && h.includes('Stuttgart'),
    'miesto plnenia je v ňom');

  // Papier, ktorý sa podpisuje, nesmie mať v pätičke „platné bez podpisu".
  ok(!h.includes('platné bez podpisu'),
    'v pätičke nie je veta o tom, že podpis netreba');
  ok(h.includes('Ausfertigungen'), 'ale to, že sú dve rovnopisy');
  ok((h.match(/class="sig"/g) || []).length === 2, 'sú v ňom dva podpisové riadky');
}

// ── Cena podľa toho, ako je dohodnutá ───────────────────────────────────────
{
  const fix = doc({ price_model: 'fixed', fixed_price: 48000 });
  ok(fix.includes('Pauschalpreis'), 'pevná cena je Pauschalpreis');
  ok(/48\s*000,00/.test(fix), 'a je v nej suma so slovenským formátom',
    'nenašiel som 48 000,00');
  ok(fix.includes('13b UStG'), 'so zmienkou o prenose daňovej povinnosti');

  const unit = doc({ price_model: 'unit', unit_price: 24.5, unit_label: 'm²' });
  ok(unit.includes('Einheitspreis') && unit.includes('m²'),
    'cena za jednotku aj s jednotkou');
  ok(unit.includes('Aufmaß'), 'a povie sa, že sa meria spoločne');

  // Hodinová sadzba v zmluve o dielo je riziko. Dokument ju nezakrýva, ale
  // doplní vetu, ktorá hovorí, čím tá sadzba je a čím nie je.
  const hod = doc({ price_model: 'hourly', charge_rate: 31.5 });
  ok(hod.includes('Verrechnungssatz'), 'hodinová je Verrechnungssatz');
  ok(hod.includes('kein Weisungsrecht'),
    'a je pri nej veta, že nezakladá právo dávať pokyny');
}

// ── Čo chráni model pred kontrolou ──────────────────────────────────────────
{
  const h = doc({ price_model: 'fixed', fixed_price: 10000 });
  for (const veta of ['A1-Bescheinigung', 'selbständige Unternehmer',
    'nicht um Arbeitnehmerüberlassung', 'Bau-Mindestlohn']) {
    ok(h.includes(veta), `v zmluve je „${veta}"`);
  }
}

// ── Dodatky sa v nemeckej zmluve nepíšu po slovensky ────────────────────────
// Dôvod dodatku si píšeme pre seba („Rozšírenie o 3. NP"). Do dokumentu, ktorý
// číta odberateľ, patrí nemecký názov zmeneného poľa — a hodnota v tvare,
// v akom bola dohodnutá, nie v akom je v databáze.
{
  const h = doc({ price_model: 'fixed', fixed_price: 52000 }, [
    { amendment_number: 'Dodatok č. 1', field: 'fixed_price', new_value: '52000',
      reason: 'Rozšírenie o 3. NP.', signed_at: '2026-11-05' },
    { amendment_number: 'Dodatok č. 2', field: 'date_to', new_value: '2027-06-30',
      reason: 'Predĺženie stavby.', signed_at: null },
  ]);
  ok(h.includes('Nachträge'), 'dodatky sú v dokumente');
  ok(h.includes('Pauschalpreis') && h.includes('Ausführungszeit'),
    'a sú pomenované po nemecky');
  ok(!h.includes('Rozšírenie o 3. NP'),
    'náš slovenský dôvod sa do nemeckej zmluvy nedostane');
  ok(/52\s*000,00/.test(h), 'suma je naformátovaná, nie surová');
  ok(h.includes('30. 06. 2027') || h.includes('30.06.2027'),
    'aj dátum je dátum, nie 2027-06-30');
  ok(h.includes('05. 11. 2026') || h.includes('05.11.2026'),
    'a je vidieť, ktorý dodatok je podpísaný');
}

// ── Prázdne polia nesmú vyrobiť prázdne paragrafy ───────────────────────────
{
  const h = P.werkvertrag({
    contract: { contract_number: 'ZML-1', title: 'Bez ničoho' },
    client: CLIENT, supplier: SUPPLIER });
  ok(h.length > 1000, 'zmluva bez vyplnených polí sa aj tak vykreslí');
  ok(!h.includes('§ 6 '), 'bez záruky sa paragraf o záruke nevykreslí');
  ok(!h.includes('§ 7 '), 'ani o zmluvnej pokute');
  ok(!h.includes('§ 8 '), 'ani o výpovedi');
  ok(h.includes('§ 9'), 'ale paragraf o postavení osôb tam je vždy');
  ok(h.includes('noch nicht beschrieben'),
    'a chýbajúci predmet diela sa prizná, nie zamlčí');
}

// ── Appka a databáza musia chrániť tie isté polia ───────────────────────────
// Na podpísanej zmluve sa dohodnuté podmienky menia dodatkom. Zoznam je
// v triggeri (migrácia 036) aj v module zmlúv. Keby sa rozišli, appka by
// ponúkla úpravu, ktorú databáza odmietne — alebo, horšie, needitovala by
// pole, ktoré databáza chrániť prestala.
{
  const dir = path.join(__dirname, '..', '..', 'database', 'migrations');
  const sql = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
    .map(f => fs.readFileSync(path.join(dir, f), 'utf8'))
    .filter(x => /function danubra_contract_needs_amendment\(/.test(x))
    .pop();
  ok(sql, 'chránené polia sú v migráciách');

  const m = /foreach f in array array\[([\s\S]*?)\]/.exec(sql || '');
  ok(m, 'a dajú sa z triggeru prečítať');
  const zSql = (m ? m[1] : '').split(',')
    .map(x => x.trim().replace(/'/g, '')).filter(Boolean).sort();

  const js = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'modules', 'contracts.js'), 'utf8');
  const blok = /const LOCKED = \[([\s\S]*?)\];/.exec(js);
  ok(blok, 'a v module zmlúv tiež');
  const zJs = [...(blok ? blok[1] : '').matchAll(/\['([a-z_]+)',/g)]
    .map(x => x[1]).sort();

  eq(zJs, zSql, 'appka chráni presne tie polia, ktoré chráni databáza');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
