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

const { SITES, match, siteFor } = require('./shared/sites');
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
};

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
      body: `<!DOCTYPE html><meta charset="utf-8"><title>punds</title><p style="font-family:sans-serif;padding:40px">Ospravedlňujeme sa, stránka sa nenačítala. <a href="${esc(base)}/">punds</a></p>` };
  }
  if (!page) {
    ctx.route = 'home'; ctx.params = {};
    page = await pages.notFound(ctx);
    page.status = 404;
  }
  const body = content.postProcess(await render(ctx, page, CHROME[site.key]), content.replacements(site.key, rows));
  const headers = { ...HTML_HEADERS };
  if (page.status && page.status !== 200) headers['Netlify-CDN-Cache-Control'] = 'public, s-maxage=60';
  return { status: page.status || 200, headers, body };
}

module.exports = { handle, SITES };
