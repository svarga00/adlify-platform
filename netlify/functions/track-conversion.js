// Konverzný tracker — endpoint ktorý klient pixel volá pri konverzii
// (form submit, click-to-call, purchase, atď.). Loguje do tabuľky
// `conversions` a updateuje campaigns.metrics aby sa live reporty videli.
//
// Endpoint: POST /.netlify/functions/track-conversion
//   alebo: GET /.netlify/functions/track-conversion.gif?p=<project_id>&t=<event>
//
// Body:
//   { project_id, event_type, value?, currency?, source?, medium?, campaign?,
//     client_ref?, page_url?, gclid?, fbclid?, utm_* }

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TRANSPARENT_GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function pickFirst(...vals) {
  for (const v of vals) if (v !== undefined && v !== null && v !== '') return v;
  return null;
}

async function logConversion(payload, request) {
  const project_id = payload.project_id;
  if (!project_id) throw new Error('Missing project_id');

  // Načítaj client_id z projektu (pre denormalizáciu — rýchlejšie filter
  // v reportoch klienta)
  const { data: project } = await supabase
    .from('campaign_projects').select('client_id').eq('id', project_id).maybeSingle();
  const client_id = project?.client_id || null;

  const headers = request?.headers || {};
  const ua = headers['user-agent'] || headers['User-Agent'] || '';
  const referer = headers['referer'] || headers['Referer'] || '';
  const ip = headers['x-nf-client-connection-ip']
    || headers['x-forwarded-for']?.split(',')[0]?.trim()
    || headers['client-ip']
    || null;

  // Insert conversion event
  const row = {
    project_id,
    client_id,
    event_type: payload.event_type || 'conversion',
    event_value: Number(payload.value) || 0,
    currency: payload.currency || 'EUR',
    source: pickFirst(payload.source, payload.utm_source),
    medium: pickFirst(payload.medium, payload.utm_medium),
    campaign: pickFirst(payload.campaign, payload.utm_campaign),
    term: pickFirst(payload.term, payload.utm_term),
    content: pickFirst(payload.content, payload.utm_content),
    page_url: pickFirst(payload.page_url, referer),
    referrer: referer || null,
    user_agent: ua.slice(0, 500),
    ip,
    gclid: payload.gclid || null,
    fbclid: payload.fbclid || null,
    client_ref: payload.client_ref || null,
    meta: payload.meta || {},
  };

  const { error } = await supabase.from('conversions').insert(row);
  if (error) {
    console.error('[track-conversion] insert failed:', error.message);
    throw error;
  }

  // Best-effort: pripočítaj k dnes campaign_metrics_daily, ak je možné určiť
  // ktorá kampaň. Bez gclid/fbclid to nevieme presne — len logujeme.
  return { ok: true };
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    let payload = {};

    if (event.httpMethod === 'POST') {
      payload = JSON.parse(event.body || '{}');
    } else {
      // GET — z query parametrov (pre <img src=...> beacon variant)
      payload = event.queryStringParameters || {};
      // skratky: p=project_id, t=event_type, v=value
      if (payload.p) payload.project_id = payload.p;
      if (payload.t) payload.event_type = payload.t;
      if (payload.v) payload.value = payload.v;
    }

    await logConversion(payload, event);

    // GET → vráť 1×1 GIF (pixel tracker)
    if (event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'image/gif',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
        body: TRANSPARENT_GIF.toString('base64'),
        isBase64Encoded: true,
      };
    }

    // POST → JSON OK
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('[track-conversion] error:', err);
    // Pri GET vráť aj tak GIF (aby sa pixel nikdy nestratil v UI klienta)
    if (event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'image/gif' },
        body: TRANSPARENT_GIF.toString('base64'),
        isBase64Encoded: true,
      };
    }
    return {
      statusCode: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
