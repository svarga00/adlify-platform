// Sync metrics pre Google Ads kampane. POST { connectionId, campaignId? }
// Ak campaignId — sync len ten jeden. Inak všetky napojené Google Ads kampane.
// Ukladá do campaigns.metrics JSONB + campaigns.metrics_updated_at.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function refreshIfNeeded(conn) {
  const exp = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (exp > Date.now() + 60000) return conn.access_token;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: conn.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error('Refresh: ' + JSON.stringify(d));
  await supabase.from('platform_connections').update({
    access_token: d.access_token,
    token_expires_at: new Date(Date.now() + d.expires_in * 1000).toISOString(),
  }).eq('id', conn.id);
  return d.access_token;
}

exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: cors, body: 'Bad JSON' }; }

  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!devToken) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'GOOGLE_ADS_DEVELOPER_TOKEN missing' }) };

  try {
    const { data: conn } = await supabase.from('platform_connections').select('*').eq('id', payload.connectionId).single();
    if (!conn) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Connection not found' }) };

    const token = await refreshIfNeeded(conn);
    const customerId = conn.account_id;
    if (!customerId || customerId === 'pending') {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'No account selected on this connection' }) };
    }

    // GAQL query — posledných 30 dní
    const query = `
      SELECT campaign.id, campaign.name, campaign.status,
             metrics.impressions, metrics.clicks, metrics.cost_micros,
             metrics.conversions, metrics.average_cpc, metrics.ctr
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
    `;
    const r = await fetch(`https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'developer-token': devToken,
        'login-customer-id': conn.metadata?.login_customer_id || customerId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error('Google Ads: ' + JSON.stringify(d));

    const results = d.results || [];
    let synced = 0;
    for (const row of results) {
      const c = row.campaign;
      const m = row.metrics;
      const metrics = {
        impressions: Number(m.impressions || 0),
        clicks: Number(m.clicks || 0),
        cost: Number(m.costMicros || 0) / 1000000,
        conversions: Number(m.conversions || 0),
        ctr: Number(m.ctr || 0),
        avg_cpc: Number(m.averageCpc || 0) / 1000000,
      };
      await supabase.from('campaigns').upsert({
        platform: 'google_ads',
        external_id: String(c.id),
        name: c.name,
        status: String(c.status).toLowerCase(),
        platform_connection_id: conn.id,
        metrics,
        metrics_updated_at: new Date().toISOString(),
      }, { onConflict: 'platform,external_id' });
      synced++;
    }

    await supabase.from('platform_connections').update({
      last_sync_at: new Date().toISOString(), last_error: null,
    }).eq('id', conn.id);

    return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ synced, total: results.length }) };
  } catch (err) {
    console.error('[google-ads-sync]', err);
    await supabase.from('platform_connections').update({ last_error: err.message }).eq('id', payload.connectionId);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
