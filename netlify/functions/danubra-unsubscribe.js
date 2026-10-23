// ============================================================================
// DANUBRA — odhlásenie z e-mailov (verejné, bez prihlásenia)
// ============================================================================
// Odkaz je v pätičke každého e-mailu z marketingu: ?t=KĽÚČ. Funguje aj
// „jedným klikom" z poštového programu (List-Unsubscribe-Post → POST).
// Adresa sa zapíše do `danubra_email_optout` a firma dostane stav
// „Odhlásená". Ďalší e-mail jej už appka nepošle.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

const page = (title, text) => ({
  statusCode: 200,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  body: `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>body{font-family:system-ui,sans-serif;background:#F7F9FD;color:#0A1B3D;display:flex;min-height:100vh;
align-items:center;justify-content:center;margin:0;padding:16px}.c{background:#fff;border:1px solid #E3EAF7;border-radius:8px;
padding:28px;max-width:440px}h1{font-size:20px;margin:0 0 10px}p{margin:0;line-height:1.6;color:#44506B}</style></head>
<body><div class="c"><h1>${title}</h1><p>${text}</p></div></body></html>`,
});

exports.handler = async (event) => {
  const t = String((event.queryStringParameters || {}).t || '').trim();
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(t)) return page('Link ungültig', 'Dieser Abmeldelink ist ungültig.');
  const { data: s } = await supabase.from('danubra_campaign_sends').select('id,email,lead_id').eq('token', t).maybeSingle();
  if (!s) return page('Link ungültig', 'Dieser Abmeldelink ist ungültig oder abgelaufen.');
  const email = String(s.email || '').toLowerCase();
  await supabase.from('danubra_email_optout').upsert({ email, source: 'link' }, { onConflict: 'email', ignoreDuplicates: true });
  if (s.lead_id) await supabase.from('danubra_leads').update({ status: 'unsubscribed' }).eq('id', s.lead_id);
  return page('Abmeldung bestätigt', `Die Adresse ${email.replace(/</g, '')} erhält von uns keine weiteren E-Mails.`);
};
