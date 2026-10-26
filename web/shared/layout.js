// ============================================================================
// punds web — kostra stránky (<head>, hlavička, päta, skripty)
// ============================================================================
// Stránka (web/<web>/pages/*.js) vráti { title, description, body, css, js,
// bodyClass, status } a tu sa obalí do celého dokumentu.
// ============================================================================
'use strict';

const { esc, each } = require('./h');
const { LANGS, path: pathOf } = require('./sites');

/** Verzia súborov (css/js) — mení sa s každým nasadením, nech prehliadač nedrží staré. */
const VERSION = (process.env.COMMIT_REF || process.env.DEPLOY_ID || 'dev').slice(0, 8);

/**
 * Kontext pre stránky — všetko, čo stránka potrebuje vedieť o adrese a jazyku.
 * @param {Object} o { site, lang, route, params, query, base, prod, jobs, origin }
 */
function context(o) {
  const ctx = {
    ...o,
    html: (LANGS[o.lang] || {}).html || o.lang,
    /** Odkaz na stránku tohto webu: ctx.url('job', { slug }) */
    url: (route, params = {}, lang = o.lang) => {
      const p = pathOf(o.site, lang, route, params);
      return p == null ? null : `${o.base}${p}`;
    },
    /** Statický súbor: ctx.asset('css/base.css') */
    asset: (p) => `/web/public/${p}${/\.(css|js)$/.test(p) ? `?v=${VERSION}` : ''}`,
    /** Absolútna adresa pre <link rel=canonical> a hreflang (vždy produkčná doména). */
    abs: (route, params = {}, lang = o.lang) => `https://${o.site.domain}${pathOf(o.site, lang, route, params)}`,
    /**
     * Parametre tejto stránky v inom jazyku (prepínač jazyka, hreflang).
     * Stránka, ktorej adresa sa v jazykoch líši (remeslo: schweissen /
     * welding), nastaví `ctx.langParams = (lang) => ({ slug: … })`.
     */
    paramsIn: (lang) => (ctx.langParams ? ctx.langParams(lang) : ctx.params),
  };
  return ctx;
}

/**
 * @param {Object} ctx    kontext (context())
 * @param {Object} page   { title, description, body, css: [], js: [], bodyClass, header, footer, image, noindex }
 * @param {Object} chrome { header(ctx, page), footer(ctx, page) } — hlavička a päta webu
 */
async function render(ctx, page, chrome) {
  const langs = ctx.site.langs;
  const alt = page.alternates !== false ? each(langs, (l) => {
    const href = ctx.abs(ctx.route, ctx.paramsIn(l), l);
    return href ? `<link rel="alternate" hreflang="${LANGS[l].html}" href="${esc(href)}">` : '';
  }) + `<link rel="alternate" hreflang="x-default" href="${esc(ctx.abs(ctx.route, ctx.paramsIn(ctx.site.defaultLang), ctx.site.defaultLang))}">` : '';
  const title = page.title ? `${page.title}` : 'punds';
  const desc = page.description || '';
  const css = ['css/base.css', `css/${ctx.site.key}.css`, ...(page.css || [])];
  const js = ['js/site.js', ...(page.js || [])];
  const noindex = !ctx.prod || page.noindex;
  return `<!DOCTYPE html>
<html lang="${esc(ctx.html)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<script>document.documentElement.classList.add('js')</script>
<title>${esc(title)}</title>
${desc ? `<meta name="description" content="${esc(desc)}">` : ''}
${noindex ? '<meta name="robots" content="noindex, nofollow">' : ''}
<link rel="canonical" href="${esc(ctx.abs(ctx.route, ctx.params))}">
${alt}
<meta property="og:type" content="website">
<meta property="og:site_name" content="punds">
<meta property="og:title" content="${esc(title)}">
${desc ? `<meta property="og:description" content="${esc(desc)}">` : ''}
${page.image ? `<meta property="og:image" content="${esc(page.image)}">` : ''}
<meta name="theme-color" content="${ctx.site.key === 'eu' ? '#0E1626' : '#F4F4F1'}">
<link rel="icon" href="${ctx.asset('img/logo/punds-icon.svg')}" type="image/svg+xml">
<link rel="preload" href="${ctx.asset('fonts/outfit-latin.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${ctx.asset('fonts/hanken-latin.woff2')}" as="font" type="font/woff2" crossorigin>
${each(css, (c) => `<link rel="stylesheet" href="${ctx.asset(c)}">`)}
${page.head || ''}
</head>
<body class="site-${ctx.site.key}${page.bodyClass ? ` ${esc(page.bodyClass)}` : ''}" data-lang="${esc(ctx.lang)}" data-base="${esc(ctx.base)}">
<a class="skip" href="#main">${esc((ctx.t && ctx.t.skip) || 'Skip to content')}</a>
${page.header === false ? '' : await chrome.header(ctx, page)}
<main id="main">${page.body || ''}</main>
${page.footer === false ? '' : await chrome.footer(ctx, page)}
${page.after || ''}
<script>window.PUNDS=${JSON.stringify({ lang: ctx.lang, site: ctx.site.key, base: ctx.base, api: `${ctx.base}/api`, t: (ctx.t && ctx.t.js) || {} }).replace(/</g, '\\u003c')}</script>
${each(js, (s) => `<script src="${ctx.asset(s)}" defer></script>`)}
</body>
</html>`;
}

module.exports = { context, render, VERSION };
