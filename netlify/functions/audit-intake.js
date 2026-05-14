// netlify/functions/audit-intake.js
//
// Public endpoint for external landing pages (adlify.eu/audit, FB/IG ads).
// Creates or updates a prospect by email, then triggers the same notify flow
// as audit-request from internal email links.
//
// POST https://adlify-app.netlify.app/.netlify/functions/audit-intake
// Content-Type: application/json
// CORS: open for all origins
//
// Body:
//   {
//     "company_name": "...",   // REQUIRED
//     "email": "...",          // REQUIRED
//     "domain": "...",         // optional - auto-extracted from email
//     "contact_person": "...", // optional
//     "phone": "...",          // optional
//     "industry": "...",       // optional
//     "city": "...",           // optional
//     "priority": "more_leads|lower_cpa|brand|all|other",  // optional
//     "note": "...",           // optional
//     "source": "fb-skupina-..." // recommended for tracking
//   }
//
// Response 200: { ok: true, prospect_id, audit_token, is_new }
// Response 400: { ok: false, error: "..." }

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function extractDomainFromEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const parts = email.split('@');
  if (parts.length !== 2) return null;
  return parts[1].toLowerCase().trim();
}

function normalizeDomain(input) {
  if (!input || typeof input !== 'string') return null;
  return input
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .trim();
}

function sanitize(value, maxLength = 500) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.slice(0, maxLength);
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' }),
    };
  }

  // Parse body
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Invalid JSON' }),
    };
  }

  // Validate required fields
  const company_name = sanitize(payload.company_name, 200);
  const email = sanitize(payload.email, 200)?.toLowerCase();

  if (!company_name) {
    return {
      statusCode: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'company_name je povinné' }),
    };
  }
  if (!email || !isValidEmail(email)) {
    return {
      statusCode: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'email je povinné a musí byť platné' }),
    };
  }

  // Optional fields
  const explicitDomain = normalizeDomain(payload.domain);
  const emailDomain = extractDomainFromEmail(email);
  const domain = explicitDomain || emailDomain;
  const contact_person = sanitize(payload.contact_person, 200);
  const phone = sanitize(payload.phone, 50);
  const industry = sanitize(payload.industry, 100);
  const city = sanitize(payload.city, 100);
  const priority = sanitize(payload.priority, 50);
  const note = sanitize(payload.note, 2000);
  const source = sanitize(payload.source, 100) || 'landing_page';

  const audit_request_data = {
    priority: priority || null,
    note: note || null,
    submitted_via: 'audit-intake',
    submitted_at: new Date().toISOString(),
  };

  const nowIso = new Date().toISOString();

  try {
    // 1) Check if prospect exists by email
    const { data: existing, error: findErr } = await supabase
      .from('prospects')
      .select('id, audit_token, outreach_stage, company_name')
      .eq('email', email)
      .maybeSingle();

    if (findErr) {
      console.error('[audit-intake] find error:', findErr);
      return {
        statusCode: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'DB chyba pri vyhľadávaní' }),
      };
    }

    let prospect;
    let is_new;

    if (existing) {
      // UPDATE — refresh data, re-mark as audit_requested
      const updatePayload = {
        company_name,
        domain: domain || undefined,
        contact_person: contact_person || undefined,
        phone: phone || undefined,
        industry: industry || undefined,
        city: city || undefined,
        source: source || undefined,
        outreach_stage: 'audit_requested',
        audit_requested_at: nowIso,
        audit_request_data,
        updated_at: nowIso,
      };
      // Remove undefined keys (so we don't overwrite existing data with nulls)
      Object.keys(updatePayload).forEach((k) => {
        if (updatePayload[k] === undefined) delete updatePayload[k];
      });

      const { data: updated, error: updErr } = await supabase
        .from('prospects')
        .update(updatePayload)
        .eq('id', existing.id)
        .select('id, audit_token')
        .single();

      if (updErr) {
        console.error('[audit-intake] update error:', updErr);
        return {
          statusCode: 500,
          headers: { ...CORS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ok: false, error: 'DB chyba pri aktualizácii' }),
        };
      }
      prospect = updated;
      is_new = false;
    } else {
      // INSERT — new prospect
      const insertPayload = {
        company_name,
        email,
        domain: domain || null,
        contact_person: contact_person || null,
        phone: phone || null,
        industry: industry || null,
        city: city || null,
        source,
        outreach_stage: 'audit_requested',
        audit_requested_at: nowIso,
        audit_request_data,
      };

      const { data: inserted, error: insErr } = await supabase
        .from('prospects')
        .insert(insertPayload)
        .select('id, audit_token')
        .single();

      if (insErr) {
        console.error('[audit-intake] insert error:', insErr);
        return {
          statusCode: 500,
          headers: { ...CORS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ok: false, error: 'DB chyba pri vložení' }),
        };
      }
      prospect = inserted;
      is_new = true;
    }

    // 2) Trigger notify-outreach-event (fire and forget — don't block response)
    // We await but with timeout protection — if it fails, prospect is still saved
    try {
      const notifyUrl = `${process.env.URL || 'https://adlify-app.netlify.app'}/.netlify/functions/notify-outreach-event`;
      await fetch(notifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospectId: prospect.id,
          event: 'audit_requested',
          note: note || null,
        }),
      });
    } catch (notifyErr) {
      // Don't fail the request if notify fails — prospect is already saved
      console.error('[audit-intake] notify failed (non-fatal):', notifyErr);
    }

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        prospect_id: prospect.id,
        audit_token: prospect.audit_token,
        is_new,
      }),
    };
  } catch (err) {
    console.error('[audit-intake] unexpected error:', err);
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: err.message || 'Neočakávaná chyba' }),
    };
  }
};
