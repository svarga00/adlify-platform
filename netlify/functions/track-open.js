// netlify/functions/track-open.js
// Tracking pixel pre emaily - vráti 1x1 priehľadný GIF.
//
// Podporuje dva tokeny:
//   ?audit=<prospect.audit_token>  — outreach / prospects flow
//   ?t=<proposals.token>           — starší proposals flow (legacy)

const { createClient } = require('@supabase/supabase-js');

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
    'Pragma': 'no-cache',
    'Expires': '0',
    'Access-Control-Allow-Origin': '*'
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
        .select('id, outreach_stage, outreach_email_opened_at, outreach_email_open_count')
        .eq('audit_token', auditToken)
        .maybeSingle();

      if (prospect) {
        const firstOpen = !prospect.outreach_email_opened_at;
        const patch = {
          outreach_email_open_count: (prospect.outreach_email_open_count || 0) + 1,
          outreach_email_opened_at: prospect.outreach_email_opened_at || new Date().toISOString(),
        };
        if (firstOpen && prospect.outreach_stage === 'email_sent') {
          patch.outreach_stage = 'email_opened';
        }
        await supabase.from('prospects').update(patch).eq('id', prospect.id);
        console.log('[track-open] prospect', prospect.id, firstOpen ? '(first open)' : `(open #${patch.outreach_email_open_count})`);
      } else {
        console.warn('[track-open] prospect not found for audit token:', auditToken);
      }
    } catch (err) {
      console.error('[track-open] prospect tracking error:', err);
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
        await supabase
          .from('leads')
          .update({ proposal_email_opened_at: proposal.email_opened_at || new Date().toISOString() })
          .eq('id', proposal.lead_id);
      }
    } catch (err) {
      console.error('[track-open] proposal tracking error:', err);
    }
  }

  return PIXEL_RESPONSE;
};
