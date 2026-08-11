// ============================================================================
// DANUBRA — príjem dopytov z webu (§10)
// ============================================================================
// Prijme odoslanie formulára z danubra-web (9 variantov SK/CS/HU) a založí
// dopyt. Ak klient podľa e-mailu alebo telefónu už existuje, priradí ho,
// inak založí nového.
//
// Ochrana: hlavička X-Danubra-Secret alebo query ?secret= musí sedieť
// s FORMS_SECRET, inak by endpoint mohol ktokoľvek zaplniť.
// ============================================================================
const { createClient } = require('@supabase/supabase-js');
const Sms = require('../../danubra/lib/sms/provider');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

/** Zoberie prvú neprázdnu hodnotu z viacerých možných názvov polí. */
function pick(data, ...names) {
  for (const n of names) {
    for (const key of Object.keys(data || {})) {
      if (key.toLowerCase().replace(/[\s_-]/g, '') === n.toLowerCase().replace(/[\s_-]/g, '')) {
        const v = data[key];
        if (v != null && String(v).trim() !== '') return String(v).trim();
      }
    }
  }
  return null;
}

function toInt(v) {
  const n = parseInt(String(v ?? '').replace(/\D/g, ''), 10);
  return isNaN(n) ? null : n;
}

/** Dátum z rôznych formátov na YYYY-MM-DD. */
function toDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);   // 1.9.2026 alebo 1/9/2026
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

function authorized(event) {
  const secret = process.env.FORMS_SECRET;
  if (!secret) return true;   // nenastavené → povolené (vývoj)
  const h = event.headers?.['x-danubra-secret'] || event.headers?.['X-Danubra-Secret'];
  const q = event.queryStringParameters?.secret;
  return h === secret || q === secret;
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Danubra-Secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!authorized(event)) {
    return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Neautorizované' }) };
  }

  try {
    let payload = {};
    try { payload = JSON.parse(event.body || '{}'); }
    catch { payload = Object.fromEntries(new URLSearchParams(event.body || '')); }

    // Netlify Forms posiela dáta v payload.data, priame volanie ich má na koreni
    const data = payload.data || payload;
    const formName = payload.form_name || pick(data, 'form', 'form_name') || 'web';

    // ── Mapovanie polí (formuláre majú rôzne názvy podľa jazyka) ───────────
    const name = pick(data, 'name', 'meno', 'nev', 'jmeno', 'firma', 'company');
    const email = pick(data, 'email', 'e-mail', 'mail');
    const phone = pick(data, 'phone', 'telefon', 'telefón', 'tel', 'telefonszam', 'mobil');
    const city = pick(data, 'city', 'mesto', 'varos', 'ort', 'lokalita', 'target_city');
    const persons = toInt(pick(data, 'persons', 'osoby', 'pocet', 'počet', 'letszam', 'people', 'anzahl'));
    const dateFrom = toDate(pick(data, 'date_from', 'od', 'from', 'nastup', 'nástup', 'datum_od'));
    const dateTo = toDate(pick(data, 'date_to', 'do', 'to', 'datum_do'));
    const budget = toInt(pick(data, 'budget', 'rozpocet', 'rozpočet', 'cena'));
    const message = pick(data, 'message', 'sprava', 'správa', 'poznamka', 'poznámka', 'uzenet', 'nachricht');
    const langRaw = (pick(data, 'lang', 'language', 'jazyk') || formName || '').toLowerCase();
    const language = langRaw.includes('hu') ? 'hu' : langRaw.includes('cs') || langRaw.includes('cz') ? 'cs' : 'sk';

    if (!email && !phone) {
      return { statusCode: 400, headers: cors,
        body: JSON.stringify({ error: 'Formulár neobsahuje e-mail ani telefón' }) };
    }

    // ── Klient: nájdi alebo založ ──────────────────────────────────────────
    let client = null;
    if (email) {
      const { data: found } = await supabase.from('danubra_clients')
        .select('*').ilike('email', email).limit(1);
      if (found && found.length) client = found[0];
    }
    if (!client && phone) {
      const e164 = Sms.toE164(phone, language === 'hu' ? 'HU' : language === 'cs' ? 'CZ' : 'SK');
      const digits = String(phone).replace(/\D/g, '').slice(-9);
      if (digits) {
        const { data: found } = await supabase.from('danubra_clients')
          .select('*').ilike('phone', `%${digits}%`).limit(1);
        if (found && found.length) client = found[0];
      }
      if (!client) {
        const { data: created } = await supabase.from('danubra_clients').insert({
          name: name || email || phone, contact_person: name || null,
          email: email || null, phone: e164 || phone || null,
          language, country: language === 'hu' ? 'HU' : language === 'cs' ? 'CZ' : 'SK',
          source: `web:${formName}`, type: 'crew',
        }).select().single();
        client = created;
      }
    }
    if (!client && email) {
      const { data: created } = await supabase.from('danubra_clients').insert({
        name: name || email, contact_person: name || null, email,
        language, source: `web:${formName}`, type: 'crew',
      }).select().single();
      client = created;
    }

    // ── Dopyt ──────────────────────────────────────────────────────────────
    const { data: inquiry, error } = await supabase.from('danubra_inquiries').insert({
      client_id: client?.id || null,
      target_city: city || null,
      date_from: dateFrom, date_to: dateTo,
      persons: persons || null,
      budget_per_bed: budget || null,
      channel: 'web',
      status: 'new',
      received_at: new Date().toISOString(),
      notes: [message, `Formulár: ${formName}`].filter(Boolean).join('\n\n'),
    }).select().single();
    if (error) throw error;

    await supabase.from('danubra_activities').insert({
      entity_type: 'inquiry', entity_id: inquiry.id, type: 'system',
      body: `Dopyt prišiel z webu (${formName}${language ? `, ${language.toUpperCase()}` : ''})`,
      source: 'webhook',
    }).catch(() => {});

    console.log('[danubra-forms] dopyt', inquiry.id, 'klient', client?.id, 'formulár', formName);
    return { statusCode: 200, headers: cors,
      body: JSON.stringify({ success: true, inquiry_id: inquiry.id, client_id: client?.id || null }) };
  } catch (err) {
    console.error('[danubra-webhook-forms]', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
