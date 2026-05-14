// Načíta zoznam customer accounts pre pripojený Google Ads OAuth.
// POST { connectionId } → vráti { accounts: [{id, name, currency, timezone}] }

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function getValidToken(connection) {
  if (!connection.refresh_token) return connection.access_token;
  const exp = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (exp > Date.now() + 60000) return connection.access_token;

  // Refresh
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await r.json();
  if (!r.ok || !data.access_token) throw new Error('Token refresh failed: ' + (data.error_description || data.error || 'unknown'));
  const newExp = new Date(Date.now() + (data.expires_in * 1000)).toISOString();
  await supabase.from('platform_connections').update({
    access_token: data.access_token,
    token_expires_at: newExp,
  }).eq('id', connection.id);
  return data.access_token;
}

exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: cors, body: 'Bad JSON' }; }

  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!devToken) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Chýba GOOGLE_ADS_DEVELOPER_TOKEN env var.' }) };
  }

  try {
    const { data: conn } = await supabase.from('platform_connections').select('*').eq('id', payload.connectionId).single();
    if (!conn) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Connection not found' }) };

    const token = await getValidToken(conn);

    // 1. ListAccessibleCustomers
    const r1 = await fetch('https://googleads.googleapis.com/v17/customers:listAccessibleCustomers', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'developer-token': devToken,
      },
    });
    const d1 = await r1.json();
    if (!r1.ok) throw new Error('Google Ads API: ' + (d1.error?.message || JSON.stringify(d1)));

    const resourceNames = d1.resourceNames || [];
    const accounts = [];
    for (const rn of resourceNames) {
      const id = rn.split('/')[1];
      // 2. Query per-account detail
      try {
        const r2 = await fetch(`https://googleads.googleapis.com/v17/customers/${id}/googleAds:search`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'developer-token': devToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1' }),
        });
        const d2 = await r2.json();
        const c = d2.results?.[0]?.customer;
        if (c) {
          accounts.push({ id: c.id, name: c.descriptiveName || id, currency: c.currencyCode, timezone: c.timeZone });
        } else {
          accounts.push({ id, name: id, currency: null, timezone: null });
        }
      } catch {
        accounts.push({ id, name: id, currency: null, timezone: null });
      }
    }

    return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ accounts }) };
  } catch (err) {
    console.error('[google-ads-accounts]', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
