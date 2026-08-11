// netlify/functions/send-email-mailjet.js
//
// Mailjet REST API v3.1 — bulk-friendly provider pre cold outreach.
// Zachová sa rovnaké rozhranie ako send-email.js (Resend) — payload field
// names identické, takže Compose/scheduler nemusia rozlišovať.
//
// Env vars:
//   MAILJET_API_KEY     = verejný API key
//   MAILJET_API_SECRET  = tajný API key
//   URL                 = base URL platformy (pre unsubscribe link)
//
// Mailjet sender domain musí byť overený v Mailjet console
// (Account Settings → Senders & Domains → Add a Sender → SPF/DKIM).

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

const MAILJET_ENDPOINT = 'https://api.mailjet.com/v3.1/send';

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.MAILJET_API_KEY;
  const apiSecret = process.env.MAILJET_API_SECRET;
  if (!apiKey || !apiSecret) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({
        error: 'MAILJET_API_KEY a MAILJET_API_SECRET musia byť nastavené v Netlify env vars.',
      }),
    };
  }

  try {
    const {
      to,
      cc,
      bcc,
      subject,
      htmlBody,
      textBody,
      replyTo,
      fromEmail: overrideFromEmail,
      fromName: overrideFromName,
      unsubscribeToken,
      unsubscribeUrl,
      prospectId,
      leadId,
      clientId,
      accountId,
    } = JSON.parse(event.body || '{}');

    if (!to || !subject) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'to and subject are required' }) };
    }

    const toAddresses = (Array.isArray(to) ? to : [to]).filter(Boolean);

    // Opt-out guard — globálny suppression list (rovnaký flow ako send-email.js)
    try {
      const recipientEmails = toAddresses.map(e => String(e).toLowerCase());
      const { data: suppressed } = await supabase
        .from('email_suppressions')
        .select('email')
        .in('email', recipientEmails);
      if (suppressed && suppressed.length > 0) {
        console.warn(`🚫 [mailjet] opt-out guard blocked: ${suppressed.map(s => s.email).join(', ')}`);
        return {
          statusCode: 200,
          headers: cors,
          body: JSON.stringify({
            success: false,
            skipped: 'opt_out',
            suppressed_emails: suppressed.map(s => s.email),
          }),
        };
      }
    } catch (e) {
      console.warn('[mailjet] suppression check failed (non-fatal):', e.message);
    }

    // Defaulty + override
    let fromEmail = overrideFromEmail || process.env.MAILJET_FROM || 'info@adlify-agency.online';
    let fromName = overrideFromName || 'Adlify Agency';
    // Parse "Name <email>" form ak je v env
    const m = (process.env.MAILJET_FROM || '').match(/^(.+?)\s*<(.+?)>$/);
    if (m && !overrideFromEmail) { fromName = m[1].trim(); fromEmail = m[2].trim(); }

    // List-Unsubscribe RFC 8058 hlavičky (rovnaké ako Resend flow)
    const baseUrl = process.env.URL || 'https://adlify.eu';
    const optOutUrl = unsubscribeUrl || (unsubscribeToken
      ? `${baseUrl}/.netlify/functions/unsubscribe?t=${encodeURIComponent(unsubscribeToken)}`
      : null);
    const headers = {};
    if (optOutUrl) {
      headers['List-Unsubscribe'] = `<${optOutUrl}>, <mailto:unsubscribe@adlify.eu?subject=unsubscribe>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }

    // Mailjet message payload
    const message = {
      From: { Email: fromEmail, Name: fromName },
      To: toAddresses.map(e => ({ Email: e })),
      Subject: subject,
      TextPart: textBody || undefined,
      HTMLPart: htmlBody || undefined,
      ReplyTo: replyTo ? { Email: replyTo } : undefined,
      Headers: Object.keys(headers).length > 0 ? headers : undefined,
    };
    if (cc) message.Cc = (Array.isArray(cc) ? cc : [cc]).map(e => ({ Email: e }));
    if (bcc) message.Bcc = (Array.isArray(bcc) ? bcc : [bcc]).map(e => ({ Email: e }));

    console.log(`📤 [mailjet] sending from ${fromEmail} to ${toAddresses.join(',')}`);

    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const res = await fetch(MAILJET_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ Messages: [message] }),
    });
    const data = await res.json();

    if (!res.ok || !data?.Messages?.[0]) {
      console.error('[mailjet] API error:', JSON.stringify(data).slice(0, 500));
      throw new Error(data?.ErrorMessage || data?.Messages?.[0]?.Errors?.[0]?.ErrorMessage || `Mailjet ${res.status}`);
    }

    const result = data.Messages[0];
    const messageId = result.To?.[0]?.MessageID || result.To?.[0]?.MessageUUID || `mailjet-${Date.now()}`;
    const status = result.Status;

    if (status !== 'success') {
      const errs = result.Errors || [];
      throw new Error(`Mailjet status=${status}: ${errs.map(e => e.ErrorMessage).join('; ')}`);
    }

    console.log(`✅ [mailjet] sent: ${messageId}`);

    // Ulož do emails (Sent folder) — best-effort
    try {
      await supabase.from('emails').insert({
        account_id: accountId || null,
        message_id: String(messageId),
        folder: 'Sent',
        from_address: fromEmail,
        from_name: fromName,
        to_addresses: toAddresses.map(e => ({ email: e })),
        cc_addresses: cc ? (Array.isArray(cc) ? cc : [cc]).map(e => ({ email: e })) : [],
        subject,
        body_html: htmlBody,
        body_text: textBody,
        snippet: (textBody || '').substring(0, 200),
        date: new Date().toISOString(),
        is_read: true,
        is_sent: true,
        lead_id: leadId || null,
        client_id: clientId || null,
      });
    } catch (dbErr) {
      console.error('[mailjet] DB save error (non-fatal):', dbErr.message);
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        provider: 'mailjet',
        messageId: String(messageId),
        from: fromEmail,
        to: toAddresses,
      }),
    };
  } catch (err) {
    console.error('❌ [mailjet] error:', err.message);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message, provider: 'mailjet' }),
    };
  }
};
