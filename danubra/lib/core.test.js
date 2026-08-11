// ============================================================================
// Testy: state-machine (§6.2), numbering (§6.1 vrátane súbežnosti), regime (§6.3)
// Spustenie:  node danubra/lib/core.test.js
// ============================================================================

const sm = require('./orders/state-machine');
const num = require('./numbering');
const { determineBillingRegime } = require('./billing/regime');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    expected: ${e}\n    actual:   ${a}`); }
}
function ok(cond, msg) { eq(!!cond, true, msg); }

// ── STAVOVÝ AUTOMAT (§6.2) ──────────────────────────────────────────────────
console.log('state-machine (§6.2)');
ok(sm.canTransition('new', 'awaiting_payment'), 'new → awaiting_payment povolené');
ok(sm.canTransition('awaiting_payment', 'paid'), 'awaiting_payment → paid povolené');
ok(sm.canTransition('in_progress', 'ending_soon'), 'in_progress → ending_soon povolené');
ok(!sm.canTransition('new', 'paid'), 'new → paid NEpovolené (skok)');
ok(!sm.canTransition('completed', 'in_progress'), 'z completed sa nedá nikam');
ok(sm.canTransition('in_progress', 'cancelled'), 'in_progress → cancelled povolené');
ok(sm.canTransition('paid', 'cancelled'), 'paid → cancelled povolené');

eq(sm.evaluateTransition('new', 'awaiting_payment').ok, true, 'evaluate: prirodzený prechod ok');
eq(sm.evaluateTransition('new', 'paid').requiresOverride, true, 'evaluate: skok vyžaduje override');
eq(sm.evaluateTransition('completed', 'new').reason, 'source_terminal', 'evaluate: z terminálu source_terminal');
eq(sm.evaluateTransition('paid', 'paid').reason, 'no_change', 'evaluate: rovnaký stav no_change');
eq(sm.evaluateTransition('paid', 'owner_confirmed').sideEffects.includes('unlock_address') ||
   sm.evaluateTransition('awaiting_payment', 'paid').sideEffects.includes('unlock_address'),
   true, 'evaluate: paid má side effect unlock_address');
eq(sm.nextNaturalState('paid'), 'owner_confirmed', 'nextNaturalState paid → owner_confirmed');
eq(sm.nextNaturalState('completed'), null, 'nextNaturalState completed → null');
eq(sm.isTerminal('cancelled'), true, 'cancelled je terminálny');

// side effect paid (§6.2) — kľúčové: odomkni adresu, vytvor prvý service period
eq(sm.SIDE_EFFECTS.paid.includes('unlock_address'), true, 'paid → unlock_address');
eq(sm.SIDE_EFFECTS.paid.includes('create_first_service_period'), true, 'paid → create_first_service_period');

// ── ČÍSELNÉ RADY (§6.1) ─────────────────────────────────────────────────────
console.log('\nnumbering (§6.1)');
eq(num.formatOrderNumber(2026, 42), 'OBJ-2026-0042', 'formát objednávky OBJ-2026-0042');
eq(num.formatInvoiceNumber(2026, 1), '2026001', 'formát faktúry 2026001');
eq(num.formatInvoiceNumber(2026, 137), '2026137', 'formát faktúry 3 číslice 2026137');

// prvý v roku
eq(num.nextOrderNumber({ year: 2026, current: 0 }, 2026).number, 'OBJ-2026-0001', 'prvá objednávka roka');
// inkrement
eq(num.nextOrderNumber({ year: 2026, current: 41 }, 2026).number, 'OBJ-2026-0042', 'inkrement na 42');
// reset pri zmene roka
{
  const r = num.nextOrderNumber({ year: 2025, current: 999 }, 2026);
  eq(r.number, 'OBJ-2026-0001', 'reset série pri novom roku');
  eq(r.newSeries, { year: 2026, current: 1 }, 'nový stav série po resete');
}

// SÚBEŽNOSŤ: simuluj sekvenčné volania (ako by ich serializoval SELECT FOR UPDATE)
// — žiadna diera, žiadna duplicita
{
  let series = { year: 2026, current: 0 };
  const issued = [];
  for (let i = 0; i < 5; i++) {
    const r = num.nextInvoiceNumber(series, 2026);
    issued.push(r.number);
    series = r.newSeries; // stav sa prenáša (transakčne serializované)
  }
  eq(issued, ['2026001', '2026002', '2026003', '2026004', '2026005'], 'súbežnosť: 5 faktúr bez diery/duplicity');
  const unique = new Set(issued);
  eq(unique.size, 5, 'súbežnosť: všetkých 5 čísel unikátnych');
}

// ── FAKTURAČNÝ REŽIM (§6.3) ─────────────────────────────────────────────────
console.log('\nbilling regime (§6.3)');
{
  const r = determineBillingRegime({ country: 'SK', vat_id: null });
  eq(r.regime, 'sk_no_vat', 'SK → sk_no_vat');
  eq(r.note, 'Nie sme platiteľmi DPH.', 'SK poznámka');
  eq(r.warning, null, 'SK bez varovania');
}
{
  const r = determineBillingRegime({ country: 'DE', vat_id: 'DE123456789' });
  eq(r.regime, 'eu_reverse_charge', 'DE + IČ DPH → eu_reverse_charge');
  ok(r.warning && r.warning.includes('§7a'), 'reverse charge → §7a varovanie');
}
{
  const r = determineBillingRegime({ country: 'DE', vat_id: null });
  eq(r.regime, 'other', 'DE bez IČ DPH → other');
  ok(r.warning, 'other → varovanie na manuálnu kontrolu');
}
{
  const r = determineBillingRegime({ country: 'CH', vat_id: 'CHE123' });
  eq(r.regime, 'other', 'CH (ne-EÚ) → other aj s vat_id');
}
{
  const r = determineBillingRegime({ country: 'sk', vat_id: null }); // lowercase
  eq(r.regime, 'sk_no_vat', 'case-insensitive: sk → sk_no_vat');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
