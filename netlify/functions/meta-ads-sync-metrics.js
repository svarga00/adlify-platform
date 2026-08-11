// Sync metrics pre Meta kampane (posledných 30 dní).

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

    const adAccountId = conn.account_id;
    if (!adAccountId || adAccountId === 'pending') {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'No ad account selected' }) };
    }

    const fields = 'campaign_id,campaign_name,impressions,clicks,spend,ctr,cpc,actions';
    const url = `https://graph.facebook.com/v19.0/${adAccountId}/insights?level=campaign&fields=${fields}&date_preset=last_30d&access_token=${encodeURIComponent(conn.access_token)}`;
    const r = await fetch(url);
    const d = await r.json();
    if (!r.ok) throw new Error('Meta: ' + (d.error?.message || JSON.stringify(d)));

    const rows = d.data || [];
    let synced = 0;
    const today = new Date().toISOString().slice(0, 10);
    for (const row of rows) {
      const conversions = (row.actions || []).filter(a => /lead|purchase|complete_registration/i.test(a.action_type))
        .reduce((s, a) => s + Number(a.value || 0), 0);
      const cost = Number(row.spend || 0);
      const clicks = Number(row.clicks || 0);
      const metrics = {
        impressions: Number(row.impressions || 0),
        clicks,
        cost,
        conversions,
        ctr: Number(row.ctr || 0) / 100,
        avg_cpc: Number(row.cpc || 0),
        cpa: conversions > 0 ? cost / conversions : 0,
      };
      const { data: upserted } = await supabase.from('campaigns').upsert({
        platform: 'meta',
        external_id: row.campaign_id,
        name: row.campaign_name,
        status: 'active',
        client_id: conn.client_id || null,
        platform_connection_id: conn.id,
        metrics,
        metrics_updated_at: new Date().toISOString(),
      }, { onConflict: 'platform,external_id' }).select('id').single();

      if (upserted?.id) {
        await supabase.from('campaign_metrics_daily').upsert({
          campaign_id: upserted.id,
          client_id: conn.client_id || null,
          snapshot_date: today,
          impressions: metrics.impressions,
          clicks: metrics.clicks,
          cost: metrics.cost,
          conversions: metrics.conversions,
          ctr: metrics.ctr,
          avg_cpc: metrics.avg_cpc,
          cpa: metrics.cpa,
          source: 'meta_ads',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'campaign_id,snapshot_date' });
      }
      synced++;
    }

    await supabase.from('platform_connections').update({
      last_sync_at: new Date().toISOString(), last_error: null,
    }).eq('id', conn.id);

    return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ synced }) };
  } catch (err) {
    console.error('[meta-ads-sync]', err);
    await supabase.from('platform_connections').update({ last_error: err.message }).eq('id', payload.connectionId);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
