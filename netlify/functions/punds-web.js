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
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, IP_HASH_SECRET (kľúč k odtlačku
// IP adresy v zázname formulára — pozri web/api.js)
// ============================================================================
const { createClient } = require('@supabase/supabase-js');
const { handle } = require('../../web/server.js');
const { loader } = require('../../web/shared/jobs.js');
const api = require('../../web/api.js');
const { notifier } = require('../../web/notify.js');
const content = require('../../web/content.js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || 'missing'
);
const ads = loader(supabase);
const contentRows = content.loader(supabase);
// Kontakty v potvrdzovacích e-mailoch sú z toho istého obsahu ako na webe.
const notify = notifier(supabase, { content: contentRows });

exports.handler = async (event) => {
  const h = event.headers || {};
  // Pôvodná adresa (/punds-sk/…): pri prepise z netlify.toml je v event.path,
  // v rawUrl môže byť adresa funkcie — vezme sa tá, ktorá patrí webu.
  let raw = '';
  try { if (event.rawUrl) raw = new URL(event.rawUrl).pathname; } catch (e) { /* bez rawUrl */ }
  const cand = [event.path, raw, h['x-nf-original-path']].filter(Boolean);
  let path = cand.find((p) => /^\/punds-(sk|eu)(\/|$)/.test(p)) || cand.find((p) => !p.startsWith('/.netlify/')) || '/';
  // Host rozhoduje, či ide o ostrý web (bez noindex, bez ukážkových ponúk)
  // a stránka sa potom drží v CDN. Hlavičku, ktorú si môže poslať ktokoľvek
  // (x-punds-host — edge funkcia ju nenastavuje), preto neberieme: inak by
  // stačila jedna požiadavka, aby CDN podávala na punds.sk stránku s noindex.
  // Skutočný Host je vždy jedna z domén tohto webu na Netlify.
  const PROD_HOSTS = ['punds.sk', 'www.punds.sk', 'punds.eu', 'www.punds.eu'];
  const bare = (x) => String(x || '').toLowerCase().split(':')[0];
  const origHost = [h.host, h['x-forwarded-host']].find((x) => PROD_HOSTS.includes(bare(x))) || h.host || h['x-forwarded-host'] || '';
  const res = await handle({
    method: event.httpMethod, host: origHost, path, query: event.queryStringParameters || {},
    body: event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || ''),
    ip: h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || '', acceptLanguage: h['accept-language'] || '',
    userAgent: h['user-agent'] || '', origin: h.origin || '',
  }, { ads, content: contentRows, api: (site, name, req) => api.handle(site, name, req, { supabase, notify }) });
  return { statusCode: res.status, headers: res.headers, body: res.body };
};
