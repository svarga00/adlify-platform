// ============================================================================
// punds web — smerovač (beží v netlify/functions/punds-web.js a v testoch)
// ============================================================================
//   skúšobne:  adlify-app.netlify.app/punds-sk/sk/ponuky   (base = /punds-sk)
//   naostro:   punds.sk/sk/ponuky                          (base = '')
//
// Stránky sa skladajú na serveri a CDN ich drží 5 minút — nový inzerát
// z appky je teda na webe najneskôr o pár minút, bez nového nasadenia.
// ============================================================================
'use strict';

const crypto = require('crypto');
const { SITES, match, siteFor, path: pathOf } = require('./shared/sites');
const PROF = require('./shared/professions');
const { context, render } = require('./shared/layout');
const { toJob } = require('./shared/jobs');
const { esc } = require('./shared/h');
const content = require('./content');

const CHROME = { sk: require('./sk/common'), eu: require('./eu/common') };
const PAGES = { sk: require('./sk/pages'), eu: require('./eu/pages') };

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=300, stale-while-revalidate=86400',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000',
};

/**
 * Content-Security-Policy pre hotovú stránku. Vložené skripty (trieda „js",
 * window.PUNDS) sa povolia podľa odtlačku (sha256) — počíta sa z hotového HTML,
 * takže sedí aj po prepise textov z appky. Iný vložený skript (napr. z textu,
 * ktorý by obišiel escapovanie) prehliadač nespustí.
 * Obrázky: https (fotky z appky, punds.eu, dlaždice mapy CARTO), štýly
 * inline kvôli mape (Leaflet).
 */
function csp(html) {
  const hashes = [];
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    hashes.push(`'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
  }
  return [
    "default-src 'self'", `script-src 'self' ${hashes.join(' ')}`.trim(), "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:", "font-src 'self'", "connect-src 'self'", "object-src 'none'",
    "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * @param {Object} req  { method, host, path, query (Object), body (string), ip }
 * @param {Object} deps { ads: async ({demoIfEmpty}) => rows, api: async (site, name, req) => resp,
 *                        content: async () => ({ key: value }) — obsah z appky (Marketing → Weby) }
 * @returns {Promise<{status, headers, body}>}
 */
async function handle(req, deps) {
  const found = siteFor({ host: req.host, path: req.path });
  if (!found) return { status: 404, headers: { 'Content-Type': 'text/plain' }, body: 'Not found' };
  const { site, base, prod } = found;
  // Predpona webu (/punds-sk) sa odreže vždy — naostro ju pridáva edge funkcia.
  const rest = (req.path.startsWith(site.prefix) ? req.path.slice(site.prefix.length) : req.path) || '/';

  // Popis textov a fotiek pre správu webov v appke (verejné texty, bez osobných údajov).
  if (rest === '/api/schema' && req.method === 'GET') {
    return { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      body: JSON.stringify(content.schema()) };
  }

  // robots.txt a sitemap.xml (naostro na punds.sk/robots.txt; skúšobná adresa má noindex).
  if (rest === '/robots.txt') {
    const host = prod ? `https://${site.domain}` : '';
    return { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
      body: prod ? `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${host}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n' };
  }
  if (rest === '/sitemap.xml') {
    const urls = [];
    const add = (route, paramsFor) => {
      for (const l of site.langs) { const p = pathOf(site, l, route, paramsFor ? paramsFor(l) : {}); if (p) urls.push(`https://${site.domain}${p}`); }
    };
    for (const route of Object.keys(site.routes)) if (!/:/.test(Object.values(site.routes[route])[0])) add(route);
    if (site.key === 'eu') for (const p of PROF.euTrades()) add('trade', (l) => ({ slug: p.eu.slug[l] }));
    if (site.key === 'sk' && deps.ads) {
      for (const a of await deps.ads({ demoIfEmpty: false })) add('job', (l) => ({ slug: toJob(a, l).slug }));
    }
    return { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=3600' },
      body: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>\n` };
  }

  // Formuláre (prihláška, dopyt) — bez cache.
  const api = rest.match(/^\/api\/([a-z-]+)$/);
  if (api) {
    if (!deps.api) return { status: 404, headers: { 'Content-Type': 'application/json' }, body: '{"error":"not found"}' };
    return deps.api(site, api[1], req);
  }

  // Koreň → predvolený jazyk (alebo jazyk prehliadača, ak ho web má).
  if (rest === '/' || rest === '') {
    const want = String(req.acceptLanguage || '').toLowerCase().match(/[a-z]{2}/g) || [];
    const map = { cs: 'cz' };
    const lang = want.map((l) => map[l] || l).find((l) => site.langs.includes(l)) || site.defaultLang;
    return { status: 302, headers: { Location: `${base}/${lang}/`, 'Cache-Control': 'no-cache', Vary: 'Accept-Language' }, body: '' };
  }
  // Adresa bez lomky na konci pri hlavnej stránke jazyka: /punds-sk/sk → /punds-sk/sk/
  if (site.langs.includes(rest.replace(/^\//, ''))) {
    return { status: 301, headers: { Location: `${base}${rest}/` }, body: '' };
  }

  const m = match(site, rest);
  const lang = m ? m.lang : (site.langs.find((l) => rest.startsWith(`/${l}/`)) || site.defaultLang);
  // Texty, kontakty, tím a fotky z appky — pred skladaním stránky.
  const rows = deps.content ? await deps.content() : {};
  content.applyTexts(site.key, rows);
  const t = CHROME[site.key].T[lang];
  let jobsCache = null;
  const ctx = context({
    site, lang, route: m ? m.route : 'home', params: m ? m.params : {}, query: req.query || {}, base, prod, t,
    jobs: async () => {
      if (!jobsCache) {
        const rows = site.key === 'sk' && deps.ads ? await deps.ads({ demoIfEmpty: !prod }) : [];
        jobsCache = rows.map((a) => toJob(a, lang));
      }
      return jobsCache;
    },
    content: { team: content.teamFor(site.key, rows), company: rows.company || {} },
  });

  const pages = PAGES[site.key];
  let page = null;
  try {
    page = m && pages[m.route] ? await pages[m.route](ctx) : null;
  } catch (e) {
    console.error('[punds-web]', req.path, e);
    return { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      body: site.key === 'eu'
        ? `<!DOCTYPE html><html lang="de"><meta charset="utf-8"><title>punds</title><p style="font-family:sans-serif;padding:40px">Die Seite konnte leider nicht geladen werden. Bitte versuchen Sie es später erneut. <a href="${esc(base)}/">punds.eu</a></p>`
        : `<!DOCTYPE html><html lang="sk"><meta charset="utf-8"><title>punds</title><p style="font-family:sans-serif;padding:40px">Ospravedlňujeme sa, stránka sa nenačítala. <a href="${esc(base)}/">punds</a></p>` };
  }
  if (!page) {
    ctx.route = 'home'; ctx.params = {};
    page = await pages.notFound(ctx);
    page.status = 404;
  }
  const body = content.postProcess(await render(ctx, page, CHROME[site.key]), content.replacements(site.key, rows));
  const headers = { ...HTML_HEADERS, 'Content-Security-Policy': csp(body) };
  if (page.status && page.status !== 200) headers['Netlify-CDN-Cache-Control'] = 'public, s-maxage=60';
  return { status: page.status || 200, headers, body };
}

module.exports = { handle, SITES };
