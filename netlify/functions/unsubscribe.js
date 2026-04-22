// Označí prospecta ako unsubscribed + zastaví všetky jeho aktívne
// campaign enrollments. Prijíma POST { token } alebo GET ?t= / ?audit=.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  let token;
  if (event.httpMethod === 'POST') {
    try { token = JSON.parse(event.body || '{}').token; } catch { token = null; }
  } else {
    const q = event.queryStringParameters || {};
    token = q.t || q.audit;
  }
  if (!token) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing token' }) };
  }

  try {
    const { data: prospect, error } = await supabase
      .from('prospects')
      .select('id, outreach_stage, email')
      .eq('audit_token', token)
      .maybeSingle();
    if (error || !prospect) {
      return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Prospect not found' }) };
    }

    // 1. Prospect stage
    await supabase.from('prospects').update({
      outreach_stage: 'unsubscribed',
    }).eq('id', prospect.id);

    // 2. Stop všetky aktívne enrollments
    await supabase.from('outreach_campaign_enrollments').update({
      status: 'stopped', stop_reason: 'unsubscribed',
    }).eq('prospect_id', prospect.id).eq('status', 'active');

    // 3. Zapíš event
    await supabase.from('prospect_events').insert({
      prospect_id: prospect.id,
      event_type: 'unsubscribed',
      ip: event.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || event.headers?.['x-nf-client-connection-ip'] || null,
      user_agent: event.headers?.['user-agent'] || null,
    });

    console.log('[unsubscribe] prospect', prospect.id, 'opted out');

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error('[unsubscribe] error:', err);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message || 'Server error' }),
    };
  }
};
