// ============================================================================
// DANUBRA — overenie firmy odberateľa v registri (VIES)
// ============================================================================
// Pri nemeckom odberateľovi rozhoduje USt-IdNr o dvoch veciach: či sa dá
// fakturovať v reverse charge podľa §13b, a či firma vôbec existuje tak, ako
// tvrdí. Doteraz sa to overovalo tým, že to niekto odklepol v Nastaveniach.
//
// Funkcia sa pýta oficiálneho registra EU (VIES). Volá sa zo servera, pretože
// VIES neposiela hlavičky, ktoré prehliadač vyžaduje — a aj preto, že volania
// na cudzie služby patria na server, nie do appky.
//
// **Jedno pravidlo, ktoré sa tu ľahko pokazí:** VIES je často mimo prevádzky.
// „Register neodpovedal" nesmie vyzerať ako „firma neexistuje" — prvé znamená
// skúsiť neskôr, druhé znamená nerobiť s nimi. Preto sa ukladá aj
// nedostupnosť, a to ako vlastný stav.
//
// Odpoveď sa zapíše k záznamu (možnosť alebo odberateľ) spolu s časom, aby
// bolo vidieť, kedy sa to pýtalo. Staré overenie nie je overenie.
//
// Premenné prostredia:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   VIES_URL  — voliteľné, na otestovanie proti inému koncovému bodu
// ============================================================================
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

const VIES = process.env.VIES_URL
  || 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms';

// Tvar čísla aj čítanie odpovede sú v knižnici, nie tu. Dve kópie toho istého
// pravidla by sa rozišli — a to pravidlo („neodpovedal" nie je „neexistuje")
// je celý zmysel tejto funkcie.
const V = require('../../app/lib/vies.js');

/**
 * Odpoveď registra v tvare, ktorý appka rozumie.
 *
 * `unavailable` znamená, že sa odpoveď nezískala — nie že je číslo neplatné.
 * Toto rozlíšenie je celý zmysel tejto funkcie.
 */
async function askVies(vat) {
  const parts = V.split(vat);
  if (!parts) return V.badFormat();

  let res, data = null, error = null;
  try {
    res = await fetch(`${VIES}/${parts.country}/vat/${parts.number}`, {
      headers: { accept: 'application/json' },
      // Register býva pomalý. Dvanásť sekúnd je hranica, po ktorej je lepšie
      // povedať „neodpovedal" než nechať človeka čakať.
      signal: AbortSignal.timeout(12000),
    });
  } catch (e) {
    error = (e && e.message) || String(e);
  }
  if (!error && res && res.ok) {
    try { data = await res.json(); } catch { data = null; }
  }

  const out = V.interpret({
    ok: !!(res && res.ok), status: res ? res.status : 0, data, error,
  });
  return { ...out, vat: out.vat || parts.clean, requested_at: new Date().toISOString() };
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { vat, opportunityId, partnerId } = JSON.parse(event.body || '{}');
    if (!vat) throw new Error('Chýba USt-IdNr');

    const result = await askVies(vat);

    // Zápis k záznamu. Nedostupnosť sa zapisuje tiež — inak by sa to isté
    // číslo pýtalo každú minútu a nikde by nebolo, že register nefunguje.
    if (opportunityId) {
      await supabase.from('danubra_opportunities').update({
        verify_result: result,
        verified_at: new Date().toISOString(),
        // Názov z registra sa doplní len vtedy, keď ho tam ešte nikto nenapísal.
        ...(result.valid && result.name ? {} : {}),
      }).eq('id', opportunityId);
    }
    if (partnerId) {
      await supabase.from('danubra_partners').update({
        vies_result: result,
        vies_checked_at: new Date().toISOString(),
      }).eq('id', partnerId);
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify(result) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};

// Tvar čísla sa dá odskúšať aj bez siete — ale v knižnici, nie tu:
// `node app/lib/vies.test.js`.
