// Začne OAuth flow pre vybranú platformu.
// Query: ?platform=google_ads | meta_ads | linkedin_ads | google_analytics
//        &client_id=<uuid>  (optional — connect pre konkrétneho klienta)

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const BASE_URL = process.env.URL || 'https://adlify.eu';

const PLATFORMS = {
  google_ads: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    scopes: ['https://www.googleapis.com/auth/adwords'],
    extra: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
  },
  google_analytics: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    extra: { access_type: 'offline', prompt: 'consent' },
  },
  google_business: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    scopes: ['https://www.googleapis.com/auth/business.manage'],
    extra: { access_type: 'offline', prompt: 'consent' },
  },
  meta_ads: {
    authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    clientIdEnv: 'META_APP_ID',
    scopes: ['ads_management', 'ads_read', 'business_management'],
    extra: {},
  },
  linkedin_ads: {
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    clientIdEnv: 'LINKEDIN_CLIENT_ID',
    scopes: ['r_ads', 'rw_ads', 'r_ads_reporting'],
    extra: {},
  },
  tiktok_ads: {
    authUrl: 'https://business-api.tiktok.com/portal/auth',
    clientIdEnv: 'TIKTOK_APP_ID',
    scopes: [],
    extra: {},
  },
};

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const platform = q.platform;
  const clientId = q.client_id || null;
  const userId = q.user_id || null;

  const cfg = PLATFORMS[platform];
  if (!cfg) {
    return { statusCode: 400, body: 'Unknown platform: ' + platform };
  }
  const oauthClientId = process.env[cfg.clientIdEnv];
  if (!oauthClientId) {
    return {
      statusCode: 500,
      body: `Missing env var: ${cfg.clientIdEnv}. Nakonfiguruj v Netlify → Site settings → Environment variables.`,
    };
  }

  // Uložíme state pre CSRF ochranu
  const state = crypto.randomBytes(24).toString('hex');
  await supabase.from('oauth_states').insert({
    state, platform, client_id: clientId, user_id: userId,
    redirect_uri: q.return_to || '/admin/#clients',
  });

  const redirectUri = `${BASE_URL}/.netlify/functions/oauth-callback`;
  const params = new URLSearchParams({
    client_id: oauthClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: cfg.scopes.join(' '),
    state,
    ...cfg.extra,
  });

  return {
    statusCode: 302,
    headers: { Location: `${cfg.authUrl}?${params.toString()}`, 'Cache-Control': 'no-store' },
    body: '',
  };
};
