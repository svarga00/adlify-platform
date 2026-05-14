// Shared tracking helpers for track-open / track-click.
// Bot detection + geo lookup (ipapi.co).

function getClientIp(event) {
  const h = event.headers || {};
  const fwd = h['x-forwarded-for'] || h['X-Forwarded-For'] || '';
  const nfClientConn = h['x-nf-client-connection-ip'] || h['X-Nf-Client-Connection-Ip'];
  if (fwd) return fwd.split(',')[0].trim();
  if (nfClientConn) return String(nfClientConn).trim();
  return null;
}

function getUserAgent(event) {
  const h = event.headers || {};
  return h['user-agent'] || h['User-Agent'] || null;
}

// Rozozná email pre-fetch scanery od reálnych opens.
function detectBot(ua) {
  if (!ua) return { isBot: true, vendor: 'unknown' };
  const s = String(ua);
  if (/GoogleImageProxy|ggpht\.com/i.test(s)) return { isBot: true, vendor: 'gmail' };
  if (/YahooMailProxy/i.test(s)) return { isBot: true, vendor: 'yahoo' };
  if (/BingPreview/i.test(s)) return { isBot: true, vendor: 'bing' };
  if (/Outlook/i.test(s) && /MSOffice/i.test(s)) return { isBot: true, vendor: 'outlook' };
  if (/Applebot|MailChimp|Mandrill|Sendgrid|Litmus|Return Path/i.test(s)) return { isBot: true, vendor: 'mail-scanner' };
  // Apple Mail Privacy Protection — otvára všetko pozadí, UA je cez iCloud/Apple proxy
  if (/iCloud|Mail-Privacy|Apple-MPP/i.test(s)) return { isBot: true, vendor: 'apple-mpp' };
  // Generické bot signatures
  if (/bot|crawler|spider|curl|wget|facebookexternalhit|slack|whatsapp|twitterbot|linkedinbot/i.test(s)) {
    return { isBot: true, vendor: 'generic-bot' };
  }
  return { isBot: false, vendor: null };
}

// Geo lookup cez ipapi.co (1000 free req/day). Timeout 2s, inak prázdne.
async function lookupGeo(ip) {
  if (!ip) return {};
  // Private/local IPs
  if (/^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|127\.|::1|fe80:)/i.test(ip)) return {};
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const r = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return {};
    const j = await r.json();
    return {
      country: j.country_name || j.country || null,
      region: j.region || null,
      city: j.city || null,
      isp: j.org || j.asn || null,
    };
  } catch { return {}; }
}

module.exports = { getClientIp, getUserAgent, detectBot, lookupGeo };
