// ============================================================================
// DANUBRA — Stavový automat objednávky (§6.2)
// ============================================================================
//   new → awaiting_payment → paid → owner_confirmed → in_progress
//       → ending_soon → completed
//   cancelled dosiahnuteľný z každého ne-terminálneho stavu
//
// Ručný override je povolený (§6.2), ale volajúca vrstva MUSÍ zapísať
// activities záznam type='system' s pôvodným a novým stavom.
// ============================================================================

const STATES = [
  'new', 'awaiting_payment', 'paid', 'owner_confirmed',
  'in_progress', 'ending_soon', 'completed', 'cancelled',
];

const TERMINAL = ['completed', 'cancelled'];

// Povolené "prirodzené" prechody (bez override)
const TRANSITIONS = {
  new:             ['awaiting_payment', 'cancelled'],
  awaiting_payment:['paid', 'cancelled'],
  paid:            ['owner_confirmed', 'cancelled'],
  owner_confirmed: ['in_progress', 'cancelled'],
  in_progress:     ['ending_soon', 'completed', 'cancelled'],
  ending_soon:     ['completed', 'cancelled'],
  completed:       [],
  cancelled:       [],
};

// Vedľajšie efekty per cieľový stav (§6.2) — popis pre orchestračnú vrstvu.
// Samotné efekty vykonáva service vrstva, tu je len deklaratívny zoznam.
const SIDE_EFFECTS = {
  awaiting_payment: ['schedule_payment_reminders(+2,+5)', 'alert(+7)'],
  paid:             ['unlock_address', 'generate_owner_confirmation_de', 'generate_handover',
                     'copy_access_codes_to_order', 'create_first_service_period'],
  owner_confirmed:  ['reminder(-2_before_arrival)'],
  in_progress:      ['show_in_active', 'start_service_counting'],
  ending_soon:      ['alert', 'prepare_extension_message'],
  completed:        ['final_partial_month_billing', 'request_review', 'close_service_periods'],
  cancelled:        [],
};

function isTerminal(state) { return TERMINAL.includes(state); }

/** Je prechod povolený bez override? */
function canTransition(from, to) {
  if (!STATES.includes(from) || !STATES.includes(to)) return false;
  return (TRANSITIONS[from] || []).includes(to);
}

/**
 * Vyhodnotí prechod. Vráti { ok, requiresOverride, sideEffects, reason }.
 * - ok=true bez override ak je prechod prirodzený
 * - ok=false + requiresOverride=true ak je to skok (povolený len s override + log)
 * - ok=false + requiresOverride=false ak je zdroj terminálny (nedá sa nič)
 */
function evaluateTransition(from, to) {
  if (!STATES.includes(from) || !STATES.includes(to)) {
    return { ok: false, requiresOverride: false, sideEffects: [], reason: 'unknown_state' };
  }
  if (from === to) {
    return { ok: false, requiresOverride: false, sideEffects: [], reason: 'no_change' };
  }
  if (isTerminal(from)) {
    return { ok: false, requiresOverride: false, sideEffects: [], reason: 'source_terminal' };
  }
  if (canTransition(from, to)) {
    return { ok: true, requiresOverride: false, sideEffects: SIDE_EFFECTS[to] || [], reason: 'natural' };
  }
  // skok mimo prirodzenej postupnosti — povolený len ako override
  return { ok: false, requiresOverride: true, sideEffects: SIDE_EFFECTS[to] || [], reason: 'requires_override' };
}

/** Ďalší prirodzený stav v lineárnej postupnosti (bez cancel). null ak koniec. */
function nextNaturalState(from) {
  const order = ['new', 'awaiting_payment', 'paid', 'owner_confirmed', 'in_progress', 'ending_soon', 'completed'];
  const i = order.indexOf(from);
  if (i < 0 || i === order.length - 1) return null;
  return order[i + 1];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STATES, TERMINAL, TRANSITIONS, SIDE_EFFECTS,
    isTerminal, canTransition, evaluateTransition, nextNaturalState,
  };
}
if (typeof window !== 'undefined') {
  window.DanubraOrderSM = { STATES, canTransition, evaluateTransition, nextNaturalState, isTerminal };
}
