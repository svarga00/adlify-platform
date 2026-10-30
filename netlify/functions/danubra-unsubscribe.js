// ============================================================================
// DANUBRA — odhlásenie z e-mailov (verejné, bez prihlásenia)
// ============================================================================
// Odkaz je v pätičke každého e-mailu z marketingu: ?t=KĽÚČ. Funguje aj
// „jedným klikom" z poštového programu (List-Unsubscribe-Post → POST).
// Adresa sa zapíše do `danubra_email_optout` a firma dostane stav
// „Odhlásená". Ďalší e-mail jej už appka nepošle.
//
// Kľúč z kampane (danubra_campaign_sends) odhlási hneď. Kľúč z e-mailu
// oslovenia (danubra_outreach, 078) sa pri otvorení odkazu najprv opýta
// a odhlási až tlačidlom alebo jedným klikom (POST) — skenery pošty odkazy
// otvárajú samy. Odhlásenie z oslovenia sa zapíše aj na časovú os firmy.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, IP_HASH_SECRET (odtlačok IP)
// ============================================================================
const { createClient } = require('@supabase/supabase-js');
// E-maily oslovenia (078) majú vlastný kľúč v danubra_outreach.
const O = require('../../app/lib/marketing/outreach.js');
const OS = require('../../app/lib/marketing/outreach-server.js');

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
  if (!s && O.tokenOk(t)) {
    // E-mail oslovenia (078). Na otvorenie odkazu (GET) sa len opýta — bezpečnostné
    // skenery pošty odkazy otvárajú samy a firmu by tak odhlásili bez jej vedomia.
    // Odhlási tlačidlo (POST) alebo „jedným klikom" z poštového programu (POST).
    if (String(event.httpMethod || 'GET').toUpperCase() !== 'POST') {
      return page('Abmelden?', `Möchten Sie keine weiteren E-Mails von uns erhalten?</p>
        <form method="post" action="?t=${t}" style="margin-top:16px"><button type="submit" style="font:inherit;padding:10px 16px;
        border:0;border-radius:6px;background:#1E4FD8;color:#fff;cursor:pointer">Abmelden bestätigen</button></form><p>`);
    }
    const h = event.headers || {};
    const r = await OS.unsubscribe(supabase, t, { ip: String(h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || '').split(',')[0].trim(),
      ua: h['user-agent'] || '', secret: O.secretOf() }).catch(() => null);
    if (r) return page('Abmeldung bestätigt', `Die Adresse ${r.email.replace(/</g, '')} erhält von uns keine weiteren E-Mails.`);
  }
  if (!s) return page('Link ungültig', 'Dieser Abmeldelink ist ungültig oder abgelaufen.');
  const email = String(s.email || '').toLowerCase();
  await supabase.from('danubra_email_optout').upsert({ email, source: 'link' }, { onConflict: 'email', ignoreDuplicates: true });
  if (s.lead_id) await supabase.from('danubra_leads').update({ status: 'unsubscribed' }).eq('id', s.lead_id);
  return page('Abmeldung bestätigt', `Die Adresse ${email.replace(/</g, '')} erhält von uns keine weiteren E-Mails.`);
};
