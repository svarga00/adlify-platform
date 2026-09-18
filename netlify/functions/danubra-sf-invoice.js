// ============================================================================
// DANUBRA — vystavenie a odoslanie faktúry cez SuperFaktúru
// ============================================================================
// Frontend volá túto funkciu, nie SuperFaktúru. API kľúč nikdy neopustí
// server.
//
// Dve veci, na ktorých táto funkcia stojí:
//
//   1. **Stav sa overuje v databáze, nie podľa toho, čo poslal prehliadač.**
//      Keby stačilo poslať `{action:'issue'}`, dalo by sa schvaľovanie obísť
//      jedným requestom z konzoly.
//   2. **Nikdy sa nesmie stať, že doklad vznikol v SuperFaktúre a appka
//      o tom nevie.** Preto sa `sf_invoice_id` zapisuje hneď po odpovedi
//      a pri akejkoľvek neistote sa radšej nevystaví druhýkrát.
//
// Premenné prostredia:
//   SF_EMAIL      e-mail účtu v SuperFaktúre
//   SF_API_KEY    API token  — bez neho funkcia ticho skončí a povie to
//   SF_COMPANY_ID voliteľné, keď je pod účtom viac firiem
//   SF_ENV        sandbox | production   (predvolene sandbox)
//
// F6 aj F7 sa robia výhradne proti sandboxu. Na produkciu sa prepína jedinou
// premennou a až po odsúhlasení.
// ============================================================================
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

const SF_ENV = (process.env.SF_ENV || 'sandbox').toLowerCase();
const SF_BASE = SF_ENV === 'production'
  ? 'https://moja.superfaktura.sk'
  : 'https://sandbox.superfaktura.sk';

/** Hlavička podľa dokumentácie SuperFaktúry. Všetko URL-enkódované. */
function authHeader() {
  const parts = [
    `email=${encodeURIComponent(process.env.SF_EMAIL || '')}`,
    `apikey=${encodeURIComponent(process.env.SF_API_KEY || '')}`,
    `module=${encodeURIComponent('DANUBRA')}`,
  ];
  if (process.env.SF_COMPANY_ID) {
    parts.push(`company_id=${encodeURIComponent(process.env.SF_COMPANY_ID)}`);
  }
  return `SFAPI ${parts.join('&')}`;
}

async function sfCall(path, body) {
  const res = await fetch(SF_BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* SuperFaktúra občas vráti HTML */ }
  if (!res.ok) {
    throw new Error(`SuperFaktúra ${res.status}: ${text.slice(0, 500)}`);
  }
  if (json && json.error && json.error !== 0) {
    const msg = Array.isArray(json.error_message)
      ? json.error_message.join('; ')
      : (json.error_message || JSON.stringify(json).slice(0, 500));
    throw new Error(`SuperFaktúra: ${msg}`);
  }
  return json;
}

const reply = (code, obj) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return reply(405, { error: 'Len POST.' });
  }
  if (!process.env.SF_API_KEY || !process.env.SF_EMAIL) {
    // Bez kľúča sa nič nerozbije — funkcia povie, čo chýba, a skončí.
    return reply(200, {
      skipped: true,
      reason: 'no_sf_credentials',
      message: 'SF_EMAIL a SF_API_KEY nie sú nastavené. Faktúra zostala '
        + 'v stave „schválená" a dá sa vystaviť, keď kľúče pribudnú.',
    });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return reply(400, { error: 'Neplatné telo požiadavky.' }); }

  const { invoice_id, action } = body;
  if (!invoice_id) return reply(400, { error: 'Chýba invoice_id.' });
  if (!['issue', 'send', 'pay'].includes(action)) {
    return reply(400, { error: 'Neznáma akcia. Povolené: issue, send, pay.' });
  }

  // ── Stav sa číta z databázy, nie z požiadavky ─────────────────────────────
  const { data: inv, error } = await supabase
    .from('danubra_invoices')
    .select('*, partner:danubra_partners(*), subcontract:danubra_subcontracts(*), period:danubra_periods(*)')
    .eq('id', invoice_id)
    .maybeSingle();

  if (error) return reply(500, { error: 'Databáza: ' + error.message });
  if (!inv) return reply(404, { error: 'Faktúra neexistuje.' });

  try {
    if (action === 'issue') return await issue(inv);
    if (action === 'send') return await send(inv);
    if (action === 'pay') return await pay(inv);
  } catch (e) {
    // Chyba sa zapíše k faktúre celá. Stav sa nemení — faktúra zostane
    // schválená a dá sa skúsiť znova.
    await supabase.from('danubra_invoices')
      .update({ sf_error: String(e.message).slice(0, 2000) })
      .eq('id', invoice_id);
    return reply(502, { error: String(e.message) });
  }
};

// ── Vystavenie ──────────────────────────────────────────────────────────────
async function issue(inv) {
  // Toto je to miesto, kde by sa dalo obísť schvaľovanie. Nedá sa.
  if (inv.status !== 'approved') {
    return reply(409, {
      error: `Vystaviť sa dá len schválená faktúra. Táto je „${inv.status}".`,
    });
  }
  if (!inv.approved_by || !inv.approved_at) {
    return reply(409, { error: 'Faktúra nemá zapísané, kto a kedy ju schválil.' });
  }
  if (inv.sf_invoice_id) {
    return reply(409, {
      error: `Faktúra už je vystavená v SuperFaktúre (id ${inv.sf_invoice_id}). `
        + 'Druhé vystavenie sa odmieta.',
    });
  }

  const payload = buildPayload(inv);
  const res = await sfCall('/invoices/create', payload);

  const sfId = res && res.data && res.data.Invoice && res.data.Invoice.id;
  const sfToken = res && res.data && res.data.Invoice && res.data.Invoice.token;
  if (!sfId) {
    // Doklad možno vznikol, ale nevieme jeho id — to je presne situácia,
    // ktorá sa nesmie zamlčať.
    throw new Error('SuperFaktúra nevrátila id faktúry. Skontroluj ju v SuperFaktúre '
      + 'PREDTÝM, než to skúsiš znova — mohol vzniknúť doklad.');
  }

  // Id a stav sa zapisujú naraz.
  const { error } = await supabase.from('danubra_invoices').update({
    status: 'issued',
    sf_invoice_id: sfId,
    sf_token: sfToken || null,
    sf_environment: SF_ENV,
    sf_synced_at: new Date().toISOString(),
    sf_error: null,
  }).eq('id', inv.id);

  if (error) {
    throw new Error(`Faktúra vznikla v SuperFaktúre (id ${sfId}), ale nepodarilo sa `
      + `to zapísať: ${error.message}. Doplň sf_invoice_id ručne.`);
  }

  return reply(200, { ok: true, sf_invoice_id: sfId, environment: SF_ENV });
}

// ── Odoslanie ───────────────────────────────────────────────────────────────
// Samostatné rozhodnutie. Schválená faktúra sa neodošle sama.
async function send(inv) {
  if (inv.status !== 'issued') {
    return reply(409, {
      error: `Odoslať sa dá len vystavená faktúra. Táto je „${inv.status}".`,
    });
  }
  if (!inv.sf_invoice_id) {
    return reply(409, { error: 'Faktúra nemá id v SuperFaktúre.' });
  }
  const to = inv.partner && inv.partner.email;
  if (!to) return reply(409, { error: 'Odberateľ nemá e-mail.' });

  await sfCall('/invoices/send', {
    Email: {
      invoice_id: inv.sf_invoice_id,
      to,
      cc: [],
      subject: `Rechnung ${inv.invoice_number}`,
      // Dokumenty pre partnerov sú po nemecky.
      message: 'Sehr geehrte Damen und Herren,\n\n'
        + 'anbei senden wir Ihnen unsere Rechnung.\n\n'
        + 'Mit freundlichen Grüßen',
    },
  });

  const { error } = await supabase.from('danubra_invoices').update({
    status: 'sent',
    sent_at: new Date().toISOString(),
    sf_synced_at: new Date().toISOString(),
    sf_error: null,
  }).eq('id', inv.id);
  if (error) throw new Error('Faktúra odišla, ale stav sa nezapísal: ' + error.message);

  return reply(200, { ok: true, sent_to: to });
}

// ── Úhrada ──────────────────────────────────────────────────────────────────
async function pay(inv) {
  if (!['issued', 'sent', 'overdue'].includes(inv.status)) {
    return reply(409, { error: `Uhradiť sa dá vystavená faktúra, nie „${inv.status}".` });
  }
  if (inv.sf_invoice_id) {
    await sfCall('/invoices/pay', {
      InvoicePayment: {
        invoice_id: inv.sf_invoice_id,
        payment_type: 'transfer',
        amount: Number(inv.total),
        currency: inv.currency || 'EUR',
        created: new Date().toISOString().slice(0, 10),
      },
    });
  }
  const { error } = await supabase.from('danubra_invoices').update({
    status: 'paid',
    paid_at: new Date().toISOString(),
    sf_synced_at: new Date().toISOString(),
    sf_error: null,
  }).eq('id', inv.id);
  if (error) throw new Error(error.message);
  return reply(200, { ok: true });
}

// ── Payload ─────────────────────────────────────────────────────────────────
// Rovnaké pravidlá ako `DanubraInvoice.sfPayload()` v prehliadači. Držať to
// na dvoch miestach nie je pekné, ale funkcia nesmie spoliehať na to, čo jej
// pošle frontend — payload si musí poskladať sama z toho, čo je v databáze.
const COUNTRY_ID = { SK: 191, CZ: 57, DE: 63, AT: 15, PL: 168, HU: 97 };

function buildPayload(inv) {
  const partner = inv.partner || {};
  const sub = inv.subcontract || {};
  const period = inv.period || {};
  const reverse = inv.vat_regime === 'reverse_charge';
  const gross = Math.round(Number(inv.total || 0) * 100);
  const withheld = Math.round(Number(inv.withholding_amount || 0) * 100);

  const comments = [];
  if (reverse) comments.push('Steuerschuldnerschaft des Leistungsempfängers (§13b UStG).');
  if (withheld > 0) {
    comments.push(`Bauabzugsteuer gemäß §48b EStG: ${de(withheld)} EUR `
      + `(${Number(inv.withholding_pct)} %). Auszahlungsbetrag: ${de(gross - withheld)} EUR.`);
  }

  const hours = round2(Number(period.hours_construction || 0)
    + Number(period.hours_workshop || 0) + Number(period.hours_travel || 0));
  const total = round2(gross / 100);
  const name = period.period_from
    ? `${sub.title || 'Subdodávateľské práce'} — `
      + `${String(period.period_from).slice(5, 7)}/${String(period.period_from).slice(0, 4)}`
    : (sub.title || 'Subdodávateľské práce');
  const tax = reverse ? 0 : 20;

  let item;
  if (hours > 0) {
    const unitPrice = round2(total / hours);
    item = Math.round(unitPrice * hours * 100) === gross
      ? { name, description: 'Podľa výkazu hodín, príloha',
          quantity: hours, unit: 'h', unit_price: unitPrice, tax }
      : { name, description: `${hours} h podľa výkazu hodín, príloha`,
          quantity: 1, unit: 'pausal', unit_price: total, tax };
  } else {
    item = { name, quantity: 1, unit: 'pausal', unit_price: total, tax };
  }

  return {
    Invoice: {
      name, type: 'regular',
      invoice_currency: inv.currency || 'EUR',
      variable: String(inv.invoice_number || '').replace(/\D/g, '') || undefined,
      created: inv.issue_date || undefined,
      due: inv.due_date || undefined,
      delivery: inv.delivery_date || undefined,
      payment_type: 'transfer',
      comment: comments.join(' ') || undefined,
    },
    Client: {
      name: partner.name,
      ic_dph: partner.ust_idnr || undefined,
      ico: partner.registration_no || undefined,
      address: partner.address || undefined,
      city: partner.city || undefined,
      zip: partner.postal_code || undefined,
      country_id: COUNTRY_ID[String(partner.country || 'DE').toUpperCase()],
      email: partner.email || undefined,
      update_addressbook: 1,
    },
    InvoiceItem: [item],
    InvoiceSetting: {
      language: partner.invoice_language || 'deu',
      bysquare: 1,
      online_payment: 0,
    },
  };
}

function round2(n) { return Math.round(Number(n) * 100) / 100; }
function de(cents) {
  return (cents / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d),)/g, '.');
}
