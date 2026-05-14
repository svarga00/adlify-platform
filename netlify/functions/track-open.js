// netlify/functions/track-open.js
// Tracking pixel. Zapíše open event (IP, UA, bot, geo) do prospect_events
// a aktualizuje counters + last_opened_at na prospectovi.
//
// Query:
//   ?audit=<prospect.audit_token>  — outreach flow
//   ?t=<proposals.token>           — legacy proposal flow

const { createClient } = require('@supabase/supabase-js');
const { getClientIp, getUserAgent, detectBot, lookupGeo } = require('./_tracking-helpers');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

const PIXEL_RESPONSE = {
  statusCode: 200,
  headers: {
    'Content-Type': 'image/gif',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache', 'Expires': '0',
    'Access-Control-Allow-Origin': '*',
  },
  body: PIXEL.toString('base64'),
  isBase64Encoded: true,
};

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const auditToken = q.audit;
  const proposalToken = q.t;

  if (auditToken) {
    try {
      const { data: prospect } = await supabase
        .from('prospects')
        .select('id, outreach_stage, outreach_email_opened_at, outreach_email_open_count, outreach_email_bot_open_count, outreach_email_human_open')
        .eq('audit_token', auditToken)
        .maybeSingle();

      if (!prospect) {
        console.warn('[track-open] prospect not found:', auditToken);
        return PIXEL_RESPONSE;
      }

      const ip = getClientIp(event);
      const ua = getUserAgent(event);
      const { isBot, vendor } = detectBot(ua);
      const geo = await lookupGeo(ip);
      const now = new Date().toISOString();

      // Event do timeline
      await supabase.from('prospect_events').insert({
        prospect_id: prospect.id,
        event_type: 'email_open',
        ip,
        user_agent: ua,
        is_bot: isBot,
        bot_vendor: vendor,
        geo_country: geo.country || null,
        geo_region: geo.region || null,
        geo_city: geo.city || null,
        geo_isp: geo.isp || null,
      });

      // Prospects counters — rozlíš bot vs human
      const patch = { outreach_email_last_opened_at: now };
      if (isBot) {
        patch.outreach_email_bot_open_count = (prospect.outreach_email_bot_open_count || 0) + 1;
      } else {
        patch.outreach_email_open_count = (prospect.outreach_email_open_count || 0) + 1;
        patch.outreach_email_human_open = true;
        if (!prospect.outreach_email_opened_at) patch.outreach_email_opened_at = now;
        if (prospect.outreach_stage === 'email_sent') patch.outreach_stage = 'email_opened';
      }
      await supabase.from('prospects').update(patch).eq('id', prospect.id);

      console.log('[track-open]', prospect.id, isBot ? `bot(${vendor})` : 'human', geo.city || '—');
    } catch (err) {
      console.error('[track-open] error:', err);
    }
  } else if (proposalToken) {
    try {
      await supabase.rpc('track_email_open', { proposal_token: proposalToken });
      const { data: proposal } = await supabase
        .from('proposals')
        .select('lead_id, email_opened_at')
        .eq('token', proposalToken)
        .single();
      if (proposal?.lead_id) {
        await supabase.from('leads').update({
          proposal_email_opened_at: proposal.email_opened_at || new Date().toISOString(),
        }).eq('id', proposal.lead_id);
      }
    } catch (err) {
      console.error('[track-open] proposal error:', err);
    }
  }

  return PIXEL_RESPONSE;
};
