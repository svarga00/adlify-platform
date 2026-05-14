// netlify/functions/track-click.js
// Zapíše CTA/link klik a presmeruje na cieľovú URL.
// Query: ?audit=<prospect.audit_token>&to=<encoded url>

const { createClient } = require('@supabase/supabase-js');
const { getClientIp, getUserAgent, detectBot, lookupGeo } = require('./_tracking-helpers');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const STAGE_ORDER = {
  pending: 0, email_sent: 1, email_opened: 2, email_clicked: 3,
  audit_requested: 4, audit_delivered: 5, audit_viewed: 6,
  call_booked: 7, converted: 8,
};

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const auditToken = q.audit;
  const target = q.to ? decodeURIComponent(q.to) : null;

  const redirect = (url) => ({
    statusCode: 302,
    headers: { Location: url, 'Cache-Control': 'no-store' },
    body: '',
  });

  if (!target || !/^https?:\/\//i.test(target)) return redirect('/');
  if (!auditToken) return redirect(target);

  try {
    const { data: prospect } = await supabase
      .from('prospects')
      .select('id, outreach_stage, outreach_email_opened_at, outreach_email_open_count, outreach_email_human_open')
      .eq('audit_token', auditToken)
      .maybeSingle();

    if (prospect) {
      const ip = getClientIp(event);
      const ua = getUserAgent(event);
      const { isBot, vendor } = detectBot(ua);
      const geo = await lookupGeo(ip);

      await supabase.from('prospect_events').insert({
        prospect_id: prospect.id,
        event_type: 'email_click',
        ip,
        user_agent: ua,
        is_bot: isBot,
        bot_vendor: vendor,
        geo_country: geo.country || null,
        geo_region: geo.region || null,
        geo_city: geo.city || null,
        geo_isp: geo.isp || null,
        link_url: target,
        referrer: event.headers?.referer || event.headers?.referrer || null,
      });

      if (!isBot) {
        const patch = {
          outreach_email_human_open: true,
          outreach_email_last_opened_at: new Date().toISOString(),
          outreach_email_open_count: (prospect.outreach_email_open_count || 0) + 1,
        };
        if (!prospect.outreach_email_opened_at) patch.outreach_email_opened_at = patch.outreach_email_last_opened_at;
        const curr = STAGE_ORDER[prospect.outreach_stage || 'pending'] ?? 0;
        if (curr < STAGE_ORDER.email_clicked) patch.outreach_stage = 'email_clicked';
        await supabase.from('prospects').update(patch).eq('id', prospect.id);
      }

      console.log('[track-click]', prospect.id, isBot ? `bot(${vendor})` : 'human', '→', target);
    }
  } catch (err) {
    console.error('[track-click] error:', err);
  }

  return redirect(target);
};
