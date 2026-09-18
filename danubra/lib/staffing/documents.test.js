// ============================================================================
// Testy dokladov živnostníka
// Spustenie:  node danubra/lib/staffing/documents.test.js
// ============================================================================
global.window = global;
const D = require('./documents');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

const TODAY = '2026-09-17';
const doc = (kind, from, to, extra = {}) =>
  ({ kind, valid_from: from, valid_to: to, ...extra });

console.log('Doklady živnostníka');

// ── Platnosť jedného dokladu ────────────────────────────────────────────────
{
  eq(D.state(null, TODAY), 'missing', 'chýbajúci doklad');
  eq(D.state(doc('a1', '2026-01-01', null), TODAY), 'valid', 'bez konca platnosti platí');
  eq(D.state(doc('a1', '2026-01-01', '2027-01-01'), TODAY), 'valid', 'platný doklad');
  eq(D.state(doc('a1', '2026-01-01', '2026-09-16'), TODAY), 'expired', 'včera skončil');
  eq(D.state(doc('a1', '2026-01-01', '2026-09-17'), TODAY), 'expiring',
    'dnešný posledný deň je ešte platnosť, nie expirácia');
  eq(D.state(doc('a1', '2026-12-01', '2027-12-01'), TODAY), 'not_yet', 'ešte nezačal platiť');

  // A1 má horizont 60 dní, nie 30. Toto je celý dôvod, prečo horizont
  // nie je jedno číslo pre všetko — vybaviť nové A1 trvá až 45 dní.
  eq(D.state(doc('a1', '2026-01-01', '2026-11-01'), TODAY), 'expiring',
    'A1 45 dní dopredu už upozorňuje');
  eq(D.state(doc('medical', '2026-01-01', '2026-11-01'), TODAY), 'valid',
    'zdravotná prehliadka 45 dní dopredu ešte nie');
  eq(D.state(doc('medical', '2026-01-01', '2026-09-25'), TODAY), 'expiring',
    'zdravotná prehliadka osem dní dopredu už áno');

  // Hodnota v databáze má prednosť pred predvoleným horizontom.
  eq(D.state(doc('a1', '2026-01-01', '2026-11-01', { notify_days_before: 7 }), TODAY), 'valid',
    'vlastný horizont z databázy prebije predvolený');
  eq(D.horizonOf(doc('a1')), 60, 'predvolený horizont A1');
  eq(D.horizonOf(doc('nieco_ine')), 30, 'neznámy druh má tridsať dní');
  eq(D.horizonOf(doc('a1', null, null, { notify_days_before: 0 })), 0,
    'nula je platná hodnota, nie chýbajúca');

  eq(D.daysLeft(doc('a1', null, '2026-10-01'), TODAY), 14, 'dní do konca');
  eq(D.daysLeft(doc('a1', null, '2026-09-10'), TODAY), -7, 'po expirácii ide do mínusu');
  eq(D.daysLeft(doc('a1', null, null), TODAY), null, 'bez konca sa dni nepočítajú');
}

// ── Ktorý doklad platí, keď ich je viac ─────────────────────────────────────
{
  const docs = [
    doc('trade_licence', '2020-01-01', '2026-06-01', { id: 'stary' }),
    doc('trade_licence', '2026-01-01', '2028-01-01', { id: 'novy' }),
    doc('trade_licence', '2026-01-01', '2027-01-01', { id: 'prostredny' }),
  ];
  // Rozhoduje najdlhšia platnosť, nie poradie nahrania — človek nahráva
  // doklady v akom poradí mu prídu.
  eq(D.best(docs, 'trade_licence', TODAY).id, 'novy', 'vyhrá najdlhšie platný');
  eq(D.best([docs[0]], 'trade_licence', TODAY).id, 'stary',
    'keď je len expirovaný, vráti sa expirovaný');
  eq(D.best(docs, 'a1', TODAY), null, 'iný druh sa nenájde');
  eq(D.best([], 'a1', TODAY), null, 'prázdny zoznam');
  eq(D.best(null, 'a1', TODAY), null, 'chýbajúci zoznam nezhodí');

  // Platný musí vyhrať nad expirovaným aj keď má kratšiu platnosť.
  eq(D.best([
    doc('a1', '2020-01-01', '2030-01-01', { id: 'nezacal', valid_from: '2027-01-01' }),
    doc('a1', '2026-01-01', '2026-12-01', { id: 'plati' }),
  ], 'a1', TODAY).id, 'plati', 'platný vyhrá nad tým, čo ešte nezačal');

  const grouped = D.byKind(docs, TODAY);
  eq(grouped.trade_licence.length, 3, 'zoskupenie podľa druhu');
  eq(grouped.trade_licence[0].doc.id, 'novy', 'najdlhšie platný je prvý');
  eq(D.byKind([null, { }], TODAY), {}, 'riadky bez druhu sa preskočia');
}

// ── Čo je kde povinné ───────────────────────────────────────────────────────
{
  eq(D.contextsFor({ workType: 'construction' }), ['assignment', 'construction'],
    'stavba pridáva k nasadeniu');
  eq(D.contextsFor({ workType: 'workshop' }), ['assignment', 'workshop'],
    'dielňa má nižšiu reguláciu');
  eq(D.contextsFor({ workType: 'construction', regulated: true }),
    ['assignment', 'construction', 'regulated'], 'regulované remeslo pridáva tretí kontext');
  eq(D.contextsFor({}), ['assignment', 'construction'], 'bez zadania sa predpokladá stavba');

  const reqs = D.requirementsFor(['assignment', 'construction']);
  eq(reqs.map(r => r.kind).sort(),
    ['a1', 'contract', 'id_card', 'insurance', 'medical', 'trade_licence'],
    'stavba žiada šesť druhov dokladov');
  eq(reqs.filter(r => r.blocks).map(r => r.kind).sort(),
    ['a1', 'contract', 'id_card', 'trade_licence'], 'štyri z nich blokujú');

  // Ten istý doklad v dvoch kontextoch — rozhoduje striktnejší, inak by sa
  // požiadavka dala obísť prepnutím typu prác.
  const dual = D.requirementsFor(['workshop', 'construction']);
  eq(dual.filter(r => r.kind === 'a1').length, 1, 'A1 je v zozname raz');
  ok(dual.find(r => r.kind === 'a1').blocks, 'a blokuje');

  eq(D.requirementsFor([]), [], 'bez kontextu nič nepovinné');
  eq(D.requirementsFor(['neznamy_kontext']), [], 'neznámy kontext nezhodí');
}

// ── Pripravenosť na nasadenie ───────────────────────────────────────────────
{
  const full = [
    doc('id_card', '2020-01-01', '2030-01-01'),
    doc('trade_licence', '2019-01-01', null),
    doc('contract', '2026-09-01', '2027-09-01'),
    doc('a1', '2026-09-01', '2027-03-01'),
    doc('insurance', '2026-01-01', '2027-01-01'),
    doc('medical', '2026-05-01', '2027-05-01'),
  ];
  const clean = D.readiness({ docs: full, today: TODAY });
  eq(clean.ok, true, 'komplet doklady nič neblokuje');
  eq(clean.reasons, [], 'žiadne prekážky');
  eq(clean.warnings, [], 'ani upozornenia');
  eq(clean.ready.length, 6, 'šesť dokladov v poriadku');

  // Prázdna kartotéka
  const empty = D.readiness({ docs: [], today: TODAY });
  eq(empty.ok, false, 'bez dokladov sa nenasadzuje');
  eq(empty.reasons.map(r => r.rule).sort(),
    ['missing_a1', 'missing_contract', 'missing_document', 'missing_trade_licence'],
    'štyri blokujúce prekážky s kľúčmi z číselníka');
  eq(empty.warnings.map(r => r.rule), ['missing_document', 'missing_document'],
    'poistenie a prehliadka sú len upozornenia');
  ok(empty.reasons.every(r => r.severity === 'block'), 'prekážky sú blokujúce');
  ok(empty.warnings.every(r => r.severity === 'warn'), 'upozornenia neblokujú');

  // Chýbajúci a expirovaný doklad majú rôzne kľúče — je to iná práca.
  const expired = D.readiness({
    docs: [...full.filter(d => d.kind !== 'a1'), doc('a1', '2025-01-01', '2026-08-01')],
    today: TODAY,
  });
  eq(expired.reasons.map(r => r.rule), ['expired_document'],
    'expirované A1 má kľúč expired_document, nie missing_a1');
  ok(expired.reasons[0].label.startsWith('Expiroval'), 'a hovorí, že expiroval');

  const missingA1 = D.readiness({ docs: full.filter(d => d.kind !== 'a1'), today: TODAY });
  eq(missingA1.reasons.map(r => r.rule), ['missing_a1'], 'chýbajúce A1 má vlastný kľúč');
  ok(missingA1.reasons[0].detail.includes('45 dní'), 'a povie, že to trvá');

  // Blížiaci sa koniec neblokuje — človek je na stavbe a doklad ešte platí.
  const soon = D.readiness({
    docs: [...full.filter(d => d.kind !== 'a1'), doc('a1', '2026-01-01', '2026-10-15')],
    today: TODAY,
  });
  eq(soon.ok, true, 'blížiaci sa koniec nezastaví prácu');
  eq(soon.warnings.length, 1, 'ale je z toho upozornenie');
  ok(soon.warnings[0].detail.includes('28 dní'), 's presným počtom dní');

  // Pas nahrádza občiansky — to isté právne postavenie.
  const withPassport = D.readiness({
    docs: [...full.filter(d => d.kind !== 'id_card'), doc('passport', '2020-01-01', '2030-01-01')],
    today: TODAY,
  });
  eq(withPassport.ok, true, 'pas nahrádza občiansky preukaz');

  // Dielňa nežiada zdravotnú prehliadku.
  const workshop = D.readiness({ docs: [], workType: 'workshop', today: TODAY });
  eq(workshop.reasons.map(r => r.rule).sort(),
    ['missing_a1', 'missing_contract', 'missing_document', 'missing_trade_licence'],
    'dielňa má tie isté blokátory');
  eq(workshop.warnings.map(r => r.kind), ['insurance'],
    'ale zdravotnú prehliadku nežiada');

  // Regulované remeslo pridáva doklad o odbornosti s §9 HwO.
  const regulated = D.readiness({ docs: full, regulated: true, today: TODAY });
  eq(regulated.ok, false, 'regulované remeslo bez certifikátu blokuje');
  eq(regulated.reasons.map(r => r.rule), ['missing_hwo'], 'kľúč ukazuje na §9 HwO');

  const regulatedOk = D.readiness({
    docs: [...full, doc('certificate', '2020-01-01', null)], regulated: true, today: TODAY,
  });
  eq(regulatedOk.ok, true, 's certifikátom je to v poriadku');

  eq(D.readiness({}).ok, false, 'bez vstupu je to blokované, nie povolené');
}

// ── Kľúče musia existovať v číselníku ───────────────────────────────────────
{
  // Zasiate v migráciách 013 a 014. Keby sa tu objavil kľúč, ktorý
  // v číselníku nie je, zapísaná výnimka by ukazovala do prázdna.
  const ENUM_KEYS = [
    'missing_a1', 'missing_trade_licence', 'expired_document', 'missing_contract',
    'below_min_wage', 'missing_zoll', 'missing_hwo', 'missing_document',
    'missing_billing_data',
  ];
  const used = new Set();
  for (const list of Object.values(D.REQUIRED)) for (const r of list) used.add(r.rule);
  used.add('expired_document');   // pridáva sa až pri vyhodnotení
  for (const r of D.billingReady({}).reasons) used.add(r.rule);

  const unknown = [...used].filter(k => !ENUM_KEYS.includes(k));
  eq(unknown, [], 'každý kľúč blokátora je v číselníku override_rule');
}

// ── Fakturačné údaje ────────────────────────────────────────────────────────
{
  const complete = {
    company_name: 'Ján Novák — živnosť', company_id: '12345678',
    bank_iban: 'SK3112000000198742637541',
    business_address: 'Hlavná 1', business_city: 'Žilina', tax_id: '1020304050',
  };
  eq(D.billingReady(complete).ok, true, 'komplet údaje sú v poriadku');
  eq(D.billingReady(complete).missing, [], 'nič nechýba');

  const noIban = { ...complete, bank_iban: '' };
  eq(D.billingReady(noIban).ok, false, 'bez IBAN-u sa faktúra nedá uhradiť');
  eq(D.billingReady(noIban).reasons.map(r => r.field), ['bank_iban'], 'a povie sa ktoré pole');
  eq(D.billingReady(noIban).reasons[0].rule, 'missing_billing_data', 'kľúč z číselníka');

  // DIČ je len upozornenie — faktúra sa bez neho zaúčtovať dá.
  const noTaxId = { ...complete, tax_id: null };
  eq(D.billingReady(noTaxId).ok, true, 'chýbajúce DIČ neblokuje');
  eq(D.billingReady(noTaxId).warnings.map(r => r.field), ['tax_id'], 'ale je z toho upozornenie');

  eq(D.billingReady({}).reasons.length, 5, 'prázdny profil má päť blokujúcich prekážok');
  eq(D.billingReady({}).missing.length, 6, 'a šesť chýbajúcich polí vrátane DIČ');

  // Medzery nie sú vyplnená hodnota.
  eq(D.billingReady({ ...complete, company_id: '   ' }).ok, false,
    'samé medzery sa nepočítajú ako vyplnené');

  // Platiteľ DPH bez IČ DPH je rozpor — na faktúre má byť DPH, ale nie je
  // čím ju identifikovať.
  eq(D.billingReady({ ...complete, vat_payer: true }).ok, false,
    'platiteľ DPH bez IČ DPH je rozpor');
  eq(D.billingReady({ ...complete, vat_payer: true, vat_id: 'SK1020304050' }).ok, true,
    's IČ DPH je to v poriadku');
  eq(D.billingReady({ ...complete, vat_payer: false }).ok, true,
    'neplatiteľ IČ DPH nepotrebuje');
}

// ── Čo treba riešiť naprieč kartotékou ──────────────────────────────────────
{
  const docs = [
    doc('a1', '2020-01-01', '2030-01-01', { id: 'ok' }),
    doc('a1', '2020-01-01', '2026-11-01', { id: 'blizi_sa' }),
    doc('medical', '2020-01-01', '2026-08-01', { id: 'expiroval' }),
    doc('id_card', '2020-01-01', '2026-06-01', { id: 'expiroval_skor' }),
    doc('insurance', '2020-01-01', null, { id: 'bez_konca' }),
  ];
  const att = D.attention(docs, TODAY);
  // Expirované najprv, a v rámci nich to, čo leží najdlhšie.
  eq(att.map(x => x.doc.id), ['expiroval_skor', 'expiroval', 'blizi_sa'],
    'expirované prvé, najstaršie navrchu');
  ok(!att.some(x => x.doc.id === 'ok'), 'platné doklady sa nepripomínajú');
  ok(!att.some(x => x.doc.id === 'bez_konca'), 'doklad bez konca platnosti tiež nie');
  eq(D.attention([], TODAY), [], 'prázdny zoznam');
  eq(D.attention(null, TODAY), [], 'chýbajúci zoznam nezhodí');
}

// ── Stav v SQL a v JS musí dať to isté ──────────────────────────────────────
{
  // Pohľad danubra_v_worker_documents počíta `validity` rovnakými pravidlami.
  // Keby sa rozišli, dashboard by ukazoval iné čísla než detail človeka.
  const cases = [
    [doc('a1', '2026-01-01', '2027-06-01'), 'valid'],
    [doc('a1', '2026-01-01', '2026-11-01'), 'expiring'],
    [doc('a1', '2026-01-01', '2026-09-16'), 'expired'],
    [doc('a1', '2026-01-01', null), 'valid'],
    [doc('a1', '2027-01-01', '2028-01-01'), 'not_yet'],
    [doc('medical', '2026-01-01', '2026-09-25'), 'expiring'],
    [doc('medical', '2026-01-01', '2026-11-01'), 'valid'],
  ];
  for (const [d, expected] of cases) {
    eq(D.state(d, TODAY), expected,
      `${d.kind} ${d.valid_from}→${d.valid_to || '∞'} je ${expected}`);
  }
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
