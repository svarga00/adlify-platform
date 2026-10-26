// ============================================================================
// punds web — weby punds.sk a punds.eu
// ============================================================================
// Skúšobne beží pod appkou: /punds-sk/* a /punds-eu/* (presmerovanie
// v netlify.toml). Naostro sa punds.sk a punds.eu pridajú k tomuto webu
// v Netlify ako ďalšie domény a edge funkcia punds-host ich sem pošle.
//
// Ponuky čítame z appky (danubra_ads, len zverejnené na web). Prihlášky
// a dopyty zapisuje ./punds-web-api.js do Kandidátov a Dopytov.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================
const { createClient } = require('@supabase/supabase-js');
const { handle } = require('../../web/server.js');
const { loader } = require('../../web/shared/jobs.js');
const api = require('../../web/api.js');
const { notifier } = require('../../web/notify.js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || 'missing'
);
const ads = loader(supabase);
const notify = notifier(supabase);

exports.handler = async (event) => {
  const h = event.headers || {};
  // Pôvodná adresa: pri prepise z netlify.toml je v event.path (alebo rawUrl).
  let path = event.path || '/';
  try { if (event.rawUrl) path = new URL(event.rawUrl).pathname; } catch (e) { /* ponechá event.path */ }
  const host = h['x-forwarded-host'] || h.host || '';
  // Edge funkcia punds-host posiela pôvodný host (punds.sk) v hlavičke.
  const origHost = h['x-punds-host'] || host;
  const res = await handle({
    method: event.httpMethod, host: origHost, path, query: event.queryStringParameters || {},
    body: event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || ''),
    ip: h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || '', acceptLanguage: h['accept-language'] || '',
    userAgent: h['user-agent'] || '', origin: h.origin || '',
  }, { ads, api: (site, name, req) => api.handle(site, name, req, { supabase, notify }) });
  return { statusCode: res.status, headers: res.headers, body: res.body };
};
