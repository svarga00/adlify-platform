// ============================================================================
// DANUBRA — Fakturačný režim (§6.3)
// ============================================================================
//   SK                       → 'sk_no_vat'         "Nie sme platiteľmi DPH."
//   EU krajina + vat_id      → 'eu_reverse_charge' "Prenesenie daňovej povinnosti."
//   inak                     → 'other' + upozornenie na manuálnu kontrolu
//
// Určuje sa VŽDY z clients.country + vat_id, nikdy ručne bez kontroly (§5.5).
// ============================================================================

// EÚ členské štáty (bez SK, ktoré má vlastnú vetvu)
const EU_COUNTRIES = [
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
  'LV','LT','LU','MT','NL','PL','PT','RO','SI','ES','SE',
];

/**
 * Určí fakturačný režim z klienta.
 * @param {Object} client - { country, vat_id }
 * @returns {{ regime:string, note:string, warning:(string|null) }}
 */
function determineBillingRegime(client) {
  const country = String(client?.country || '').toUpperCase().trim();
  const vatId = String(client?.vat_id || '').trim();

  if (country === 'SK') {
    return {
      regime: 'sk_no_vat',
      note: 'Nie sme platiteľmi DPH.',
      warning: null,
    };
  }

  if (EU_COUNTRIES.includes(country) && vatId) {
    return {
      regime: 'eu_reverse_charge',
      note: 'Prenesenie daňovej povinnosti — reverse charge.',
      // §6.3: pri prvom reverse_charge upozorni na §7a registráciu
      warning: 'Skontroluj registráciu podľa §7a pred odoslaním.',
    };
  }

  return {
    regime: 'other',
    note: '',
    warning: 'Neznámy fakturačný režim — skontroluj manuálne (krajina/IČ DPH).',
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { determineBillingRegime, EU_COUNTRIES };
}
if (typeof window !== 'undefined') {
  window.DanubraBillingRegime = { determineBillingRegime };
}
