// netlify/functions/track-open.js
// Tracking pixel pre emaily - vráti 1x1 priehľadný GIF

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

// 1x1 priehľadný GIF
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

exports.handler = async (event) => {
  const token = event.queryStringParameters?.t;
  
  // Vždy vrátiť pixel (aj keď token chýba)
  const headers = {
    'Content-Type': 'image/gif',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Access-Control-Allow-Origin': '*'
  };

  if (token) {
    try {
      // Zavolať RPC funkciu pre tracking
      await supabase.rpc('track_email_open', { proposal_token: token });
      
      // Aktualizovať aj lead
      const { data: proposal } = await supabase
        .from('proposals')
        .select('lead_id, email_opened_at')
        .eq('token', token)
        .single();
      
      if (proposal?.lead_id) {
        await supabase
          .from('leads')
          .update({ 
            proposal_email_opened_at: proposal.email_opened_at || new Date().toISOString()
          })
          .eq('id', proposal.lead_id);
      }
      
      console.log('Email open tracked for token:', token);
    } catch (err) {
      console.error('Track error:', err);
      // Nevrátiť chybu - vždy vrátiť pixel
    }
  }

  return {
    statusCode: 200,
    headers,
    body: PIXEL.toString('base64'),
    isBase64Encoded: true
  };
};
