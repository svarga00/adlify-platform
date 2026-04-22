// Scheduled function — každé 2 hodiny synchronizuje metriky zo všetkých
// aktívnych platform_connections (Google Ads + Meta Ads).

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const BASE_URL = process.env.URL || 'https://adlify.eu';

exports.handler = async () => {
  const summary = { google_ads: 0, meta_ads: 0, errors: 0 };
  try {
    const { data: conns } = await supabase.from('platform_connections')
      .select('id, platform, account_id').eq('is_active', true).neq('account_id', 'pending');

    for (const c of (conns || [])) {
      try {
        let fn;
        if (c.platform === 'google_ads') fn = 'google-ads-sync-metrics';
        else if (c.platform === 'meta_ads') fn = 'meta-ads-sync-metrics';
        else continue;
        const r = await fetch(`${BASE_URL}/.netlify/functions/${fn}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId: c.id }),
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok) summary[c.platform] = (summary[c.platform] || 0) + (d.synced || 0);
        else summary.errors++;
      } catch { summary.errors++; }
    }
  } catch (err) {
    console.error('[ads-scheduled-sync]', err);
    summary.fatal = err.message;
  }
  console.log('[ads-scheduled-sync]', JSON.stringify(summary));
  return { statusCode: 200, body: JSON.stringify(summary) };
};

exports.config = { schedule: '15 */2 * * *' };
