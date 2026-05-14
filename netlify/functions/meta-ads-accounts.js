// GET ad accounts cez Meta Graph API. POST { connectionId }.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: cors, body: 'Bad JSON' }; }

  try {
    const { data: conn } = await supabase.from('platform_connections').select('*').eq('id', payload.connectionId).single();
    if (!conn) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Connection not found' }) };

    const fields = 'id,name,account_status,currency,timezone_name,business';
    const r = await fetch(`https://graph.facebook.com/v19.0/me/adaccounts?fields=${fields}&access_token=${encodeURIComponent(conn.access_token)}`);
    const d = await r.json();
    if (!r.ok) throw new Error('Meta: ' + (d.error?.message || JSON.stringify(d)));

    const accounts = (d.data || []).map(a => ({
      id: a.id,                           // napr. "act_123456"
      name: a.name,
      currency: a.currency,
      timezone: a.timezone_name,
      business: a.business?.name,
      status: a.account_status,
    }));

    return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ accounts }) };
  } catch (err) {
    console.error('[meta-ads-accounts]', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
