// netlify/functions/track-click.js
// Zapíše klik na CTA a presmeruje na cieľovú URL.
//
// Query params:
//   ?audit=<prospect.audit_token>  (povinné)
//   ?to=<encoded target URL>       (povinné — kam presmerovať)
//
// Ak prospect existuje, zapíšeme outreach_stage = 'email_clicked'
// (ak ešte nie je ďalej) a timestamp cez outreach_email_opened_at
// (lebo clicked > opened).

const { createClient } = require('@supabase/supabase-js');

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

  if (!auditToken || !target) {
    return redirect(target || '/');
  }

  // Bezpečnosť: target musí byť http(s)
  if (!/^https?:\/\//i.test(target)) {
    return redirect('/');
  }

  try {
    const { data: prospect } = await supabase
      .from('prospects')
      .select('id, outreach_stage, outreach_email_opened_at, outreach_email_open_count')
      .eq('audit_token', auditToken)
      .maybeSingle();

    if (prospect) {
      const patch = {
        outreach_email_opened_at: prospect.outreach_email_opened_at || new Date().toISOString(),
        outreach_email_open_count: (prospect.outreach_email_open_count || 0) + 1,
      };
      const curr = STAGE_ORDER[prospect.outreach_stage || 'pending'] ?? 0;
      const clickStage = STAGE_ORDER.email_clicked;
      if (curr < clickStage) patch.outreach_stage = 'email_clicked';
      await supabase.from('prospects').update(patch).eq('id', prospect.id);
      console.log('[track-click] prospect', prospect.id, '→', target);
    }
  } catch (err) {
    console.error('[track-click] error:', err);
  }

  return redirect(target);
};
