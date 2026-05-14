// OAuth callback — prijme ?code + ?state z providera, vymení code
// za access/refresh tokens, uloží do platform_connections.
// Po uložení redirectne späť do admin UI.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const BASE_URL = process.env.URL || 'https://adlify.eu';

const TOKEN_ENDPOINTS = {
  google_ads:       { url: 'https://oauth2.googleapis.com/token',  clientId: 'GOOGLE_CLIENT_ID',   clientSecret: 'GOOGLE_CLIENT_SECRET' },
  google_analytics: { url: 'https://oauth2.googleapis.com/token',  clientId: 'GOOGLE_CLIENT_ID',   clientSecret: 'GOOGLE_CLIENT_SECRET' },
  google_business:  { url: 'https://oauth2.googleapis.com/token',  clientId: 'GOOGLE_CLIENT_ID',   clientSecret: 'GOOGLE_CLIENT_SECRET' },
  gmail_send:       { url: 'https://oauth2.googleapis.com/token',  clientId: 'GOOGLE_CLIENT_ID',   clientSecret: 'GOOGLE_CLIENT_SECRET' },
  meta_ads:         { url: 'https://graph.facebook.com/v19.0/oauth/access_token', clientId: 'META_APP_ID', clientSecret: 'META_APP_SECRET' },
  linkedin_ads:     { url: 'https://www.linkedin.com/oauth/v2/accessToken',       clientId: 'LINKEDIN_CLIENT_ID', clientSecret: 'LINKEDIN_CLIENT_SECRET' },
};

function html(msg, redirect = null) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Adlify — OAuth</title>
  <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F7F5F1;color:#14120E;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
  .card{background:#fff;border-radius:16px;padding:32px 40px;max-width:440px;box-shadow:0 20px 50px -12px rgba(20,18,14,.1);text-align:center;}
  h1{margin:0 0 8px;font-size:20px;}p{color:#6F6758;line-height:1.6;margin:0 0 16px;}
  a{color:#F97316;text-decoration:none;font-weight:600;}</style>
  ${redirect ? `<meta http-equiv="refresh" content="2;url=${redirect}">` : ''}
  </head><body><div class="card">${msg}${redirect ? `<p style="font-size:12px;color:#948B7C;">Presmerovávam… <a href="${redirect}">klik ak nejde automaticky</a></p>` : ''}</div></body></html>`;
}

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const code = q.code;
  const state = q.state;
  const error = q.error;

  if (error) {
    return { statusCode: 400, headers: { 'Content-Type': 'text/html' }, body: html(`<h1>❌ OAuth zrušené</h1><p>${error}: ${q.error_description || ''}</p>`, '/admin/#clients') };
  }
  if (!code || !state) {
    return { statusCode: 400, headers: { 'Content-Type': 'text/html' }, body: html(`<h1>❌ Chýba code / state</h1>`, '/admin/#clients') };
  }

  // Načítaj state
  const { data: stateRow } = await supabase.from('oauth_states').select('*').eq('state', state).maybeSingle();
  if (!stateRow) {
    return { statusCode: 400, headers: { 'Content-Type': 'text/html' }, body: html(`<h1>❌ Neplatný state</h1><p>Token vypršal alebo CSRF — skús znova.</p>`, '/admin/#clients') };
  }
  await supabase.from('oauth_states').delete().eq('state', state);

  const tk = TOKEN_ENDPOINTS[stateRow.platform];
  if (!tk) {
    return { statusCode: 400, headers: { 'Content-Type': 'text/html' }, body: html(`<h1>❌ Neznáma platforma</h1>`, '/admin/#clients') };
  }
  const clientId = process.env[tk.clientId];
  const clientSecret = process.env[tk.clientSecret];
  if (!clientId || !clientSecret) {
    return { statusCode: 500, headers: { 'Content-Type': 'text/html' }, body: html(`<h1>❌ Chýbajú env vars</h1><p>${tk.clientId} / ${tk.clientSecret}</p>`, '/admin/#clients') };
  }

  const redirectUri = `${BASE_URL}/.netlify/functions/oauth-callback`;

  // Vymeň code za tokens
  const tokenResp = await fetch(tk.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    }),
  });
  const tokenData = await tokenResp.json().catch(() => ({}));
  if (!tokenResp.ok || !tokenData.access_token) {
    console.error('[oauth-callback] token exchange failed:', tokenData);
    return { statusCode: 502, headers: { 'Content-Type': 'text/html' }, body: html(`<h1>❌ Token exchange zlyhala</h1><p>${tokenData.error_description || tokenData.error || 'Unknown'}</p>`, '/admin/#clients') };
  }

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + (Number(tokenData.expires_in) * 1000)).toISOString()
    : null;

  // Upsert connection
  const row = {
    client_id: stateRow.client_id,
    platform: stateRow.platform,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || null,
    token_expires_at: expiresAt,
    scopes: (tokenData.scope || '').split(/[\s,]+/).filter(Boolean),
    metadata: {},
    is_active: true,
    last_sync_at: new Date().toISOString(),
    last_error: null,
    connected_by: stateRow.user_id || null,
  };

  // Pre gmail_send načítame email adresu hneď (je to account identifier)
  if (stateRow.platform === 'gmail_send') {
    try {
      const profRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const prof = await profRes.json();
      if (prof.email) {
        row.account_id = prof.email;
        row.account_name = prof.name ? `${prof.name} <${prof.email}>` : prof.email;
        row.metadata = { email: prof.email, name: prof.name || null, picture: prof.picture || null };
      }
    } catch (e) { console.warn('[oauth-callback] gmail profile failed:', e); }
  }

  row.account_id = row.account_id || 'pending';
  row.account_name = row.account_name || `${stateRow.platform} — pripojené`;

  await supabase.from('platform_connections')
    .delete()
    .eq('platform', stateRow.platform)
    .eq('account_id', 'pending')
    .is('client_id', stateRow.client_id);

  const { data: conn, error: insErr } = await supabase.from('platform_connections').insert(row).select().single();
  if (insErr) {
    console.error('[oauth-callback] DB insert failed:', insErr);
    return { statusCode: 500, headers: { 'Content-Type': 'text/html' }, body: html(`<h1>❌ DB chyba</h1><p>${insErr.message}</p>`, '/admin/#clients') };
  }

  // Pre gmail_send automaticky vytvoriť outreach_sender ak ešte nie je
  if (stateRow.platform === 'gmail_send' && row.metadata?.email) {
    try {
      await supabase.from('outreach_senders').upsert({
        name: row.metadata.name || row.metadata.email,
        email: row.metadata.email,
        provider: 'gmail',
        platform_connection_id: conn.id,
        is_active: true,
        warmup_current: 30,
        daily_limit: 500,
        throttle_seconds: 120,
      }, { onConflict: 'email' });
    } catch (e) { console.warn('[oauth-callback] sender upsert failed:', e); }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: html(`<h1>✅ Pripojené</h1><p>Platforma <strong>${stateRow.platform}</strong> je pripojená${row.metadata?.email ? ` ako <strong>${row.metadata.email}</strong>` : ''}.</p>`, stateRow.redirect_uri || '/admin/#ad-platforms'),
  };
};
