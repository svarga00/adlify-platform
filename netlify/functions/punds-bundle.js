// ============================================================================
// punds — balík dokumentov pre živnostníka (verejné, len s tokenom)
// ============================================================================
// WhatsApp a SMS nesú jeden krátky odkaz {web}/b/<token>. Tu sa z neho
// poskladá stránka so všetkými papiermi na nástup (danubra_bundles.items).
//
//   GET /b/<token>               stránka balíka (prvé otvorenie sa zapíše)
//   GET /b/<token>/<archive_id>  302 na podpísaný odkaz (60 s) do úložiska
//
// Prepis /b/* → /.netlify/functions/punds-bundle/:splat je v netlify.toml.
// Funkcia rozumie obom tvarom adresy (/b/… aj /.netlify/functions/…).
//
// Bezpečnosť: token sa porovnáva presne a zlý tvar sa odmietne bez dotazu
// do databázy. Neplatný, zrušený aj prepadnutý odkaz dostanú tú istú
// stránku — nikto sa nedozvie, ktorý z nich to bol. Všetko z databázy sa
// escapuje, žiadne HTML z DB. Do logov nejde token ani meno.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================
'use strict';
const { mark } = require('../../web/shared/brand.js');

const BUCKET = 'danubra-docs';
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
// Stroje, ktoré si odkaz stiahnu pre náhľad v správe (WhatsApp, iMessage,
// Telegram…). Úzky zoznam — človek v prehliadači v appke sa sem trafiť nesmie.
const BOT_RE = /^WhatsApp\/|TelegramBot|facebookexternalhit|Facebot|Twitterbot|Slackbot|Discordbot|SkypeUriPreview|LinkedInBot|Googlebot|bingbot|Applebot|crawler|spider/i;

const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Text z DB: escapovaný, riadky ako <br>.
const lines = (s) => esc(String(s || '').replace(/\r\n?/g, '\n').trim()).replace(/\n/g, '<br>');

const telHref = (p) => String(p || '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');

function fmtDate(d) {
  try {
    const parts = new Intl.DateTimeFormat('sk-SK', { timeZone: 'Europe/Bratislava', day: 'numeric', month: 'numeric', year: 'numeric' })
      .formatToParts(d).reduce((o, p) => { o[p.type] = p.value; return o; }, {});
    return `${parts.day}. ${parts.month}. ${parts.year}`;
  } catch (e) {
    return `${d.getUTCDate()}. ${d.getUTCMonth() + 1}. ${d.getUTCFullYear()}`;
  }
}

// ── Cesta ──────────────────────────────────────────────────────────────────
// /b/<token>[/<archive_id>] alebo /.netlify/functions/punds-bundle/<token>[/…]
function parsePath(path) {
  const m = String(path || '').match(/^(?:\/b|\/\.netlify\/functions\/punds-bundle)\/([^/?#]*)(?:\/([^/?#]*))?\/?$/);
  if (!m) return null;
  let token = m[1], file = m[2] || null;
  try { token = decodeURIComponent(token); if (file) file = decodeURIComponent(file); } catch (e) { return { token: '', file: null }; }
  return { token, file };
}

function pickPath(event) {
  const h = event.headers || {};
  let raw = '';
  try { if (event.rawUrl) raw = new URL(event.rawUrl).pathname; } catch (e) { /* bez rawUrl */ }
  const cand = [event.path, raw, h['x-nf-original-path']].filter(Boolean);
  return cand.find((p) => parsePath(p) && parsePath(p).token) || cand[0] || '/';
}

// ── HTML ───────────────────────────────────────────────────────────────────
const ICON_DOC = '<svg class="ic" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg>';
const ICON_DL = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>';
const ICON_TEL = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>';
const ICON_MAIL = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';

const CSS = `*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:#F4F4F1;color:#0E1626;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:17px;line-height:1.5}
.w{max-width:560px;margin:0 auto;padding:20px 16px 32px}
.brand{display:block;margin:4px 0 22px;color:#0E1626;font-weight:800;font-size:22px;letter-spacing:-.02em}
.brand svg{vertical-align:middle;margin-right:8px}.brand span{vertical-align:middle}
h1{font-size:24px;line-height:1.25;margin:0 0 12px;font-weight:800;letter-spacing:-.01em}
.hi{margin:0 0 8px;font-weight:600}.msg{margin:0 0 22px;color:#2E3647}
.list{list-style:none;margin:0 0 26px;padding:0}.list li{margin:0 0 10px}
.doc{display:block;background:#fff;border:1px solid #E2E2DC;border-radius:12px;padding:14px 14px 14px 62px;position:relative;min-height:72px;color:#0E1626;text-decoration:none}
.doc:active,.doc:focus{border-color:#F07F1A;outline:none;box-shadow:0 0 0 3px rgba(240,127,26,.25)}
.doc .ic{position:absolute;left:16px;top:50%;margin-top:-14px;color:#0E1626}
.doc b{display:block;font-size:17px;line-height:1.3;font-weight:700;word-wrap:break-word}
.doc i{display:inline-block;margin-top:6px;font-style:normal;font-weight:700;font-size:15px;color:#C25E07}
.doc i svg{vertical-align:-4px;margin-right:4px}
.box{background:#fff;border:1px solid #E2E2DC;border-radius:12px;padding:22px 18px;margin:0 0 22px}
.box p{margin:0;color:#2E3647}
.foot{border-top:1px solid #E2E2DC;padding-top:18px;font-size:15px;color:#4A5263}
.foot a{display:block;color:#0E1626;font-weight:700;text-decoration:none;padding:12px 0;font-size:17px}
.foot a svg{vertical-align:-4px;margin-right:10px;color:#F07F1A}
.foot p{margin:12px 0 0}`;

function shell(body) {
  return `<!DOCTYPE html><html lang="sk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer"><meta name="format-detection" content="telephone=no">
<title>punds — dokumenty</title><style>${CSS}</style></head>
<body><div class="w"><div class="brand">${mark({ w: 34 })}<span>punds</span></div>${body}</div></body></html>`;
}

function contactHtml(s) {
  const phone = s && s.phone ? String(s.phone) : '';
  const email = s && s.email ? String(s.email) : '';
  let out = '';
  if (phone && telHref(phone)) out += `<a href="tel:${esc(telHref(phone))}">${ICON_TEL}${esc(phone)}</a>`;
  if (email && /^[^\s@<>"']+@[^\s@<>"']+$/.test(email)) out += `<a href="mailto:${esc(email)}">${ICON_MAIL}${esc(email)}</a>`;
  return out;
}

const html = (status, body, extra) => ({
  status, headers: Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, HEADERS, extra || {}), body,
});

function invalidPage(supplier, status) {
  const c = contactHtml(supplier);
  return html(status || 404, shell(`<h1>Odkaz už neplatí — zavolajte nám</h1>
<div class="box"><p>Tento odkaz na dokumenty už nie je platný. Zavolajte nám alebo nám napíšte a pošleme Vám nový.</p></div>
${c ? `<div class="foot">${c}</div>` : ''}`));
}

function errorPage(supplier) {
  const c = contactHtml(supplier);
  return html(502, shell(`<h1>Dokument sa teraz nedá stiahnuť</h1>
<div class="box"><p>Skúste to, prosím, o chvíľu znova. Ak to nepôjde, zavolajte nám.</p></div>
${c ? `<div class="foot">${c}</div>` : ''}`));
}

function bundlePage({ bundle, token, docs, firstName, supplier, expires }) {
  const list = docs.map((d) => {
    const isPdf = /\.pdf$/i.test(d.file_name || '') || !d.file_name;
    return `<li><a class="doc" href="/b/${esc(token)}/${esc(encodeURIComponent(d.id))}">${ICON_DOC}<b>${esc(d.title)}</b>`
      + `<i>${ICON_DL}${isPdf ? 'Stiahnuť PDF' : 'Stiahnuť súbor'}</i></a></li>`;
  }).join('');
  const c = contactHtml(supplier);
  return shell(`<h1>${esc(bundle.title || 'Dokumenty na nástup')}</h1>
<p class="hi">Dobrý deň${firstName ? `, ${esc(firstName)}` : ''},</p>
${bundle.message ? `<p class="msg">${lines(bundle.message)}</p>` : '<p class="msg">posielame Vám dokumenty na nástup.</p>'}
${list ? `<ul class="list">${list}</ul>` : '<div class="box"><p>V balíku teraz nie sú žiadne dokumenty. Zavolajte nám, prosím.</p></div>'}
<div class="foot">${c}<p>Odkaz platí do ${esc(fmtDate(expires))}.</p></div>`);
}

// ── Logika (testovateľná) ──────────────────────────────────────────────────
// deps = { db: { bundle(token), archive(ids), worker(id), settings(), touch(id, bundle) }, signedUrl(path, name), now? }
async function handle(req, deps) {
  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return html(405, shell('<h1>Nepodporovaná požiadavka</h1>'), { Allow: 'GET, HEAD' });

  const p = parsePath(req.path);
  // Zlý tvar tokenu: bez dotazu do databázy.
  if (!p || !TOKEN_RE.test(p.token)) return invalidPage(null);
  if (p.file !== null && !ID_RE.test(p.file)) return invalidPage(null);

  const db = deps.db;
  const now = deps.now ? deps.now() : new Date();
  const loadSupplier = async () => {
    try {
      const s = await db.settings();
      return (s && s.supplier) || null;
    } catch (e) { console.error('punds-bundle: settings', e && e.message); return null; }
  };

  let bundle = null;
  try { bundle = await db.bundle(p.token); } catch (e) { console.error('punds-bundle: bundle', e && e.message); }
  const expires = bundle && bundle.expires_at ? new Date(bundle.expires_at) : null;
  const valid = bundle && bundle.token === p.token && !bundle.revoked_at
    && expires && !isNaN(expires.getTime()) && expires.getTime() > now.getTime();
  if (!valid) return invalidPage(await loadSupplier());

  const items = Array.isArray(bundle.items) ? bundle.items.filter((i) => i && i.archive_id) : [];

  // ── Stiahnutie jedného dokumentu ──
  if (p.file !== null) {
    const item = items.find((i) => String(i.archive_id) === p.file);
    if (!item) return invalidPage(await loadSupplier());
    let row = null;
    try { row = ((await db.archive([p.file])) || []).find((r) => r && String(r.id) === p.file); } catch (e) { console.error('punds-bundle: archive', e && e.message); }
    if (!row || !row.storage_path) return invalidPage(await loadSupplier());
    let url = null;
    try { url = await deps.signedUrl(row.storage_path, row.file_name || `${item.title || 'dokument'}.pdf`); } catch (e) { console.error('punds-bundle: sign', e && e.message); }
    if (!url) return errorPage(await loadSupplier());
    return { status: 302, headers: Object.assign({ Location: url }, HEADERS), body: '' };
  }

  // ── Stránka balíka ──
  // Náhľad odkazu (WhatsApp, Telegram…) sa nepočíta ako otvorenie a nič neuvidí.
  if (BOT_RE.test(String(req.userAgent || ''))) return html(200, shell('<h1>Dokumenty</h1>'));

  const ids = items.map((i) => String(i.archive_id));
  const [rows, worker, supplier] = await Promise.all([
    ids.length ? Promise.resolve(db.archive(ids)).catch((e) => { console.error('punds-bundle: archive', e && e.message); return []; }) : [],
    bundle.worker_id ? Promise.resolve(db.worker(bundle.worker_id)).catch(() => null) : null,
    loadSupplier(),
  ]);
  const byId = new Map((rows || []).filter(Boolean).map((r) => [String(r.id), r]));
  const docs = items.filter((i) => byId.has(String(i.archive_id))).map((i) => {
    const r = byId.get(String(i.archive_id));
    return { id: String(i.archive_id), title: i.title || r.title || r.file_name || 'Dokument', file_name: r.file_name || '' };
  });
  const firstName = worker && worker.full_name ? String(worker.full_name).trim().split(/\s+/)[0] : '';

  if (method === 'GET') {
    try { await db.touch(bundle.id, bundle); } catch (e) { console.error('punds-bundle: touch', e && e.message); }
  }
  return html(200, bundlePage({ bundle, token: p.token, docs, firstName, supplier, expires }));
}

// ── Supabase (service role, len na serveri) ────────────────────────────────
let client = null;
function supabase() {
  if (!client) {
    const { createClient } = require('@supabase/supabase-js');
    client = createClient(
      process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || 'missing',
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return client;
}

function realDeps() {
  const sb = supabase();
  const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  return {
    db: {
      bundle: async (token) => must(await sb.from('danubra_bundles')
        .select('id,token,worker_id,title,items,message,lang,expires_at,revoked_at,opened_at,open_count')
        .eq('token', token).maybeSingle()),
      archive: async (ids) => must(await sb.from('danubra_archive').select('id,file_name,storage_path,kind,title').in('id', ids)),
      worker: async (id) => must(await sb.from('danubra_workers').select('full_name').eq('id', id).maybeSingle()),
      settings: async () => must(await sb.from('danubra_settings').select('supplier').limit(1).maybeSingle()),
      touch: async (id, b) => {
        const patch = { open_count: ((b && b.open_count) || 0) + 1 };
        if (!b || !b.opened_at) patch.opened_at = new Date().toISOString();
        must(await sb.from('danubra_bundles').update(patch).eq('id', id));
      },
    },
    signedUrl: async (path, name) => {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 60, { download: name });
      if (error) throw new Error(error.message);
      return data && data.signedUrl;
    },
  };
}

exports.handler = async (event) => {
  const h = event.headers || {};
  const res = await handle({ method: event.httpMethod, path: pickPath(event), userAgent: h['user-agent'] || '' }, realDeps());
  return { statusCode: res.status, headers: res.headers, body: event.httpMethod === 'HEAD' ? '' : res.body };
};
exports.handle = handle;
exports.parsePath = parsePath;
exports.pickPath = pickPath;
