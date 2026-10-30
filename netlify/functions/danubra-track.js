// ============================================================================
// DANUBRA — sledovanie e-mailov oslovenia (verejné, bez prihlásenia)
// ============================================================================
//   GET ?t=KĽÚČ&k=o                     sledovací obrázok 1×1 → otvorenie
//   GET ?t=KĽÚČ&k=c&u=ADRESA&s=PODPIS   odkaz v e-maile → klik, presmerovanie
//
// Volá to poštový program firmy, nie appka — preto bez prihlásenia. Čo z toho
// plynie:
//   * neznámy alebo zlý kľúč nič neprezradí: obrázok sa vráti vždy, zlý
//     odkaz skončí stránkou „Link ungültig" (404), nikdy chybou servera,
//   * presmeruje sa len na adresu, ktorú sme podpísali (HMAC cez kľúč e-mailu
//     a adresu) — inak by sa táto adresa dala zneužiť ako otvorené
//     presmerovanie na cudzí (podvodný) web,
//   * predčítanie obrázkov (Apple Mail Privacy, Google Image Proxy) a skenery
//     odkazov sa zapíšu ako „pravdepodobne automat", nie ako človek,
//   * ochrana pred zahltením: najviac 120 požiadaviek za 10 minút z jednej
//     adresy (v pamäti funkcie) a v databáze najviac 60 udalostí za hodinu
//     na jeden e-mail; to isté otvorenie do 30 s sa neráta dvakrát,
//   * IP sa neukladá, len odtlačok HMAC (IP_HASH_SECRET, ako formuláre webov).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TRACK_SECRET alebo
//      IP_HASH_SECRET (inak MAIL_SECRET alebo service-role kľúč)
// ============================================================================
const { createClient } = require('@supabase/supabase-js');
const O = require('../../app/lib/marketing/outreach.js');
const OS = require('../../app/lib/marketing/outreach-server.js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

// Priehľadný GIF 1×1.
const GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const NOCACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0', Pragma: 'no-cache', Expires: '0' };
const gif = () => ({ statusCode: 200, headers: { 'Content-Type': 'image/gif', ...NOCACHE }, body: GIF, isBase64Encoded: true });
const invalid = () => ({
  statusCode: 404,
  headers: { 'Content-Type': 'text/html; charset=utf-8', ...NOCACHE },
  body: '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Link ungültig</title><style>body{font-family:system-ui,sans-serif;background:#F7F9FD;color:#0A1B3D;display:flex;'
    + 'min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}.c{background:#fff;border:1px solid #E3EAF7;'
    + 'border-radius:8px;padding:28px;max-width:440px}h1{font-size:20px;margin:0 0 10px}p{margin:0;line-height:1.6;color:#44506B}</style>'
    + '</head><body><div class="c"><h1>Link ungültig</h1><p>Dieser Link ist ungültig oder abgelaufen.</p></div></body></html>',
});

// Ochrana pred zahltením — len v pamäti tejto inštancie funkcie.
const WINDOW = 10 * 60 * 1000;
const MAX_HITS = 120;
const HITS = new Map();
function limited(key, now = Date.now()) {
  if (!key) return false;
  const list = (HITS.get(key) || []).filter(t => t > now - WINDOW);
  list.push(now);
  HITS.set(key, list);
  if (HITS.size > 5000) for (const [k, v] of HITS) if (!v.some(t => t > now - WINDOW)) HITS.delete(k);
  return list.length > MAX_HITS;
}

function clientIp(h = {}) {
  return String(h['x-nf-client-connection-ip'] || h['client-ip'] || h['x-forwarded-for'] || '').split(',')[0].trim();
}

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const h = event.headers || {};
  const kind = q.k === 'c' ? 'click' : 'open';
  const token = String(q.t || '');
  const ip = clientIp(h);
  const ua = h['user-agent'] || h['User-Agent'] || '';
  const secret = O.secretOf();
  const prilis = limited(O.ipHash(ip, secret) || ip);

  if (kind === 'open') {
    if (!O.tokenOk(token) || prilis) return gif();
    try { await OS.recordHit(supabase, { token, kind, ip, ua, method: event.httpMethod, secret }); } catch (e) { /* obrázok vždy */ }
    return gif();
  }

  const url = O.safeTarget(q.u);
  if (!url || !O.tokenOk(token) || !O.verify(token, url, q.s, secret)) return invalid();
  if (!prilis) {
    try { await OS.recordHit(supabase, { token, kind, url, ip, ua, method: event.httpMethod, secret }); } catch (e) { /* presmerovať aj tak */ }
  }
  return { statusCode: 302, headers: { Location: url, 'Referrer-Policy': 'no-referrer', ...NOCACHE }, body: '' };
};

exports._test = { limited, clientIp, HITS };
