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
 *
 * `supplier` je **naša** strana z Nastavení. Firma je *neplatiteľ DPH
 * registrovaný podľa §7a*: domáce faktúry sú bez DPH, ale na službu do EÚ
 * sa prenáša daňová povinnosť — a to sa dá len s vlastným IČ DPH. Preto:
 *
 *   * **máme IČ DPH** → reverse charge je v poriadku a appka mlčí,
 *   * **nemáme ho** → faktúra by neobstála a appka to povie natvrdo.
 *
 * Dovtedy tu pri každej nemeckej faktúre svietilo „skontroluj registráciu
 * podľa §7a" — aj keď bola registrácia dávno vybavená. Upozornenie, ktoré
 * svieti vždy, sa po treťom raze prestane čítať.
 *
 * @param {Object} client   - { country, vat_id }
 * @param {Object} supplier - { vat_id } z Nastavení (nepovinné)
 * @returns {{ regime:string, note:string, warning:(string|null) }}
 */
function determineBillingRegime(client, supplier) {
  const country = String(client?.country || '').toUpperCase().trim();
  const vatId = String(client?.vat_id || '').trim();
  const nasVatId = String(supplier?.vat_id || '').trim();

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
      // Bez vlastného IČ DPH nie je reverse charge čím podložiť. S ním sa
      // niet na čo pýtať.
      warning: nasVatId ? null
        : 'Nemáme zapísané vlastné IČ DPH — bez registrácie podľa §7a reverse '
          + 'charge neobstojí. Doplňte ho v Nastaveniach.',
    };
  }

  return {
    regime: 'other',
    note: '',
    warning: 'Neznámy fakturačný režim — skontrolujte manuálne (krajina/IČ DPH).',
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { determineBillingRegime, EU_COUNTRIES };
}
if (typeof window !== 'undefined') {
  window.DanubraBillingRegime = { determineBillingRegime };
}
