// Pošli email cez Gmail API používa OAuth tokens z platform_connections.
// POST { senderId, to, subject, htmlBody, textBody, inReplyTo?, references?, cc?, bcc? }
//
// Gmail API: POST /gmail/v1/users/me/messages/send
// Body je RFC 2822 MIME message base64url-encoded.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function getValidToken(conn) {
  const exp = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (exp > Date.now() + 60000 && conn.access_token) return conn.access_token;
  if (!conn.refresh_token) {
    throw new Error('OAuth refresh token missing — reconnect Gmail account.');
  }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: conn.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) throw new Error('Token refresh failed: ' + (d.error_description || d.error || 'unknown'));
  const newExp = new Date(Date.now() + (d.expires_in * 1000)).toISOString();
  await supabase.from('platform_connections').update({
    access_token: d.access_token,
    token_expires_at: newExp,
  }).eq('id', conn.id);
  return d.access_token;
}

// Build MIME message (multipart/alternative: text + html)
function buildMime({ from, to, cc, bcc, subject, textBody, htmlBody, inReplyTo, references }) {
  const boundary = '=_adlify_boundary_' + Math.random().toString(36).slice(2);
  const crlf = '\r\n';
  const encodeHeader = (s) => {
    // RFC 2047 encoded-word pre non-ASCII
    if (/^[\x00-\x7F]*$/.test(s)) return s;
    return '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';
  };
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    bcc ? `Bcc: ${bcc}` : null,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    references ? `References: ${references}` : null,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean).join(crlf);

  const body = [
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    textBody || (htmlBody || '').replace(/<[^>]+>/g, ''),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlBody || '',
    '',
    `--${boundary}--`,
    '',
  ].join(crlf);

  return headers + crlf + body;
}

function base64UrlEncode(str) {
  return Buffer.from(str, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: cors, body: 'Bad JSON' }; }

  const { senderId, to, subject, htmlBody, textBody, cc, bcc, inReplyTo, references } = payload;
  if (!senderId || !to || !subject) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'senderId, to, subject required' }) };
  }

  try {
    // Load sender + connection
    const { data: sender } = await supabase.from('outreach_senders')
      .select('id, name, email, provider, signature_html, signature_text, platform_connection_id')
      .eq('id', senderId).single();
    if (!sender) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Sender not found' }) };
    if (sender.provider !== 'gmail') {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Sender provider is not gmail' }) };
    }
    if (!sender.platform_connection_id) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Sender not linked to Gmail connection' }) };
    }

    const { data: conn } = await supabase.from('platform_connections')
      .select('*').eq('id', sender.platform_connection_id).single();
    if (!conn) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Connection not found' }) };

    const token = await getValidToken(conn);

    const fromHeader = sender.name ? `${sender.name} <${sender.email}>` : sender.email;
    const html = (htmlBody || '') + (sender.signature_html ? `<br>${sender.signature_html}` : '');
    const text = (textBody || '') + (sender.signature_text ? `\n${sender.signature_text}` : '');

    const mime = buildMime({
      from: fromHeader, to, cc, bcc, subject,
      htmlBody: html, textBody: text,
      inReplyTo, references,
    });
    const raw = base64UrlEncode(mime);

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[gmail-send] Gmail API error:', data);
      return { statusCode: res.status, headers: cors, body: JSON.stringify({ error: data.error?.message || 'Gmail API error', details: data }) };
    }

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, messageId: data.id, threadId: data.threadId, from: fromHeader }),
    };
  } catch (err) {
    console.error('[gmail-send]', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
