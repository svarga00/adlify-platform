// ============================================================================
// DANUBRA — Odkazy od kolegov: príjem z verejného formulára (bez prihlásenia)
// ============================================================================
// „Potrebujem formulár, kde kolegovia aj bez prihlásenia pridajú odkazy na
// firmy, a v appke sa to zbiera…" — stránka app/odkazy.html#t=<kľúč>.
//
//   POST { t, check: true }  → 200 { ok } alebo 403 — platí odkaz? (pri otvorení stránky)
//   POST { t, name, firms: [{ company, link, city, relation, what, contact, unsure }], website }
//     → 200 { ok, added, duplicates, results: [{ i, company, status, why }], mine, rank, team }
//     → 400 { error, field? , errors: [{ i, field, error }] }   nič sa neuloží
//     → 403 odkaz neplatí (zlý kľúč alebo vypnutý zber — tá istá veta)
//     → 429 priveľa z jednej siete
//
// Ochrana:
//   * tajný kľúč z danubra_settings.marketing.tips = { token, enabled }
//     (porovnanie v konštantnom čase); kľúč je na stránke v kotve (#t=…),
//     do servera ide len v tele požiadavky — nie je v logoch ani v Referer,
//   * len POST, len z našej stránky (Origin = tá istá adresa, ako pri
//     formulároch punds.sk), najviac 30 kB,
//   * pasca na roboty (skryté pole „website") — robot dostane „ok", nič sa
//     neuloží,
//   * najviac 30 firiem za hodinu z jednej siete. IP sa neukladá, len jej
//     odtlačok HMAC s IP_HASH_SECRET (inak iné tajomstvo servera); bez
//     tajomstva sa neukladá nič a limit platí len v pamäti funkcie,
//   * najviac 20 firiem naraz, dĺžky polí obmedzené, odkazy overené
//     (lib/marketing/tips.js — https, bez sledovacích parametrov, žiadne
//     lokálne adresy).
//
// Duplicity: firma, ktorú už máme (doména webu alebo e-mailu, alebo meno
// firmy s mestom — medzi odberateľmi, novými firmami aj skoršími odkazmi),
// sa uloží so stavom 'duplicate' a odkazom na to, čo máme — kolega vidí
// „už ju máme" a odkaz sa mu do rebríčka započíta.
//
// Potom sa na pozadí (danubra-lead-tips-enrich-background, podpísané
// HMAC) stiahne web firmy a Impressum. Len skutočné weby — profily
// (LinkedIn, Facebook…) a Mapy nie. Zadarmo: bez Outscraperu, bez AI.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, IP_HASH_SECRET, URL (Netlify)
// ============================================================================
'use strict';
const crypto = require('crypto');
const T = require('../../app/lib/marketing/tips.js');

const MAX_BODY = 30000;
const WINDOW_MS = 60 * 60 * 1000;
const PER_WINDOW = 30;
const TRIGGER_MS = 2500;
const ENRICH_FN = '/.netlify/functions/danubra-lead-tips-enrich-background';
// Rovnaký zoznam ako pri formulároch webov (web/api.js) + adresa, na ktorej beží funkcia.
const ORIGIN_OK = /^https?:\/\/(([a-z0-9-]+\.)*punds\.(sk|eu)|adlify-app\.netlify\.app|[a-z0-9-]+--adlify-app\.netlify\.app|localhost(:\d+)?|127\.0\.0\.1(:\d+)?)$/i;
const GONE = 'Tento odkaz na zber firiem už neplatí. Požiadajte prosím o nový toho, kto Vám ho poslal.';

const H = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const out = (statusCode, body) => ({ statusCode, headers: H, body: JSON.stringify(body) });
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

// ── Tajomstvá servera ───────────────────────────────────────────────────────
const secretOf = (env = process.env) => [env.IP_HASH_SECRET, env.MAIL_SECRET, env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_SERVICE_KEY]
  .map((x) => String(x || '').trim()).find(Boolean) || null;
const hdr = (event, name) => { const h = (event && event.headers) || {}; const k = Object.keys(h).find(x => x.toLowerCase() === name); return k ? String(h[k] || '') : ''; };
const ipOf = (event) => (hdr(event, 'x-nf-client-connection-ip') || hdr(event, 'x-forwarded-for') || hdr(event, 'client-ip')).split(',')[0].trim();
/** HMAC odtlačok IP (nie samotná IP), alebo null. */
function ipHash(ip, secret) {
  if (!ip || !secret) return null;
  return crypto.createHmac('sha256', secret).update(`danubra-tip:ip:${ip}`).digest('hex').slice(0, 32);
}
/** Porovnanie kľúčov v konštantnom čase (aj pri rôznej dĺžke). */
function sameToken(a, b) {
  const x = crypto.createHash('sha256').update(String(a || '')).digest();
  const y = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(x, y) && !!a && !!b;
}
/** Podpis volania funkcie na pozadí (len server ho vie vyrobiť). */
function sign(ids, secret) {
  return secret ? crypto.createHmac('sha256', secret).update(`danubra-tips-enrich:${[].concat(ids || []).join(',')}`).digest('hex') : null;
}
function signOk(ids, sig, secret) {
  const good = sign(ids, secret);
  if (!good || !/^[a-f0-9]{64}$/.test(String(sig || ''))) return false;
  return crypto.timingSafeEqual(Buffer.from(good, 'hex'), Buffer.from(String(sig), 'hex'));
}

/** Limit bez databázy (keď nie je tajomstvo na odtlačok) — len v pamäti tejto inštancie. */
const MEM = new Map();
function memCount(ip, now) {
  const hits = (MEM.get(ip) || []).filter(t => t > now - WINDOW_MS);
  MEM.set(ip, hits);
  if (MEM.size > 5000) for (const [k, v] of MEM) if (!v.length) MEM.delete(k);
  return { count: hits.length, add: (n) => { for (let i = 0; i < n; i++) hits.push(now); } };
}

function originOk(event) {
  const o = hdr(event, 'origin');
  if (!o) return true;                       // rovnaký pôvod niektoré prehliadače neposielajú
  const host = hdr(event, 'host');
  if (host && (o === `https://${host}` || o === `http://${host}`)) return true;
  return ORIGIN_OK.test(o);
}

// ── Databáza ────────────────────────────────────────────────────────────────
function supabaseDb() {
  let sb = null;
  const c = () => {
    if (!sb) {
      const { createClient } = require('@supabase/supabase-js');
      sb = createClient(process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
    }
    return sb;
  };
  return {
    client: c,
    async settings() {
      const { data, error } = await c().from('danubra_settings').select('id,marketing').limit(1);
      if (error) throw error;
      return (data || [])[0] || null;
    },
    async countIp(hash, sinceIso) {
      const { count, error } = await c().from('danubra_lead_tips').select('id', { count: 'exact', head: true })
        .eq('ip_hash', hash).gte('created_at', sinceIso);
      if (error) throw error;
      return count || 0;
    },
    async known() {
      const [l, p, t] = await Promise.all([
        c().from('danubra_leads').select('id,name,city,website,email,status,partner_id,archived_at').limit(20000),
        c().from('danubra_partners').select('id,name,city,website,email').limit(5000),
        c().from('danubra_lead_tips').select('id,company_name,city,domain,url,kind,status,lead_id,duplicate_of_lead_id,duplicate_of_partner_id,submitted_by_name,created_at,archived_at')
          .is('archived_at', null).limit(20000),
      ]);
      for (const r of [l, p, t]) if (r.error) throw r.error;
      return { leads: l.data || [], partners: p.data || [], tips: t.data || [] };
    },
    async insertTips(rows) {
      const { data, error } = await c().from('danubra_lead_tips').insert(rows).select('id,company_name,website,status');
      if (error) throw error;
      return data || [];
    },
  };
}

/** Spustí doplnenie údajov z webov na pozadí. Chyba nevadí — appka to vie spustiť aj sama. */
async function trigger(ids, event, env = process.env) {
  if (!ids.length) return false;
  const base = String(env.URL || env.DEPLOY_PRIME_URL || (hdr(event, 'host') ? `https://${hdr(event, 'host')}` : '')).replace(/\/+$/, '');
  if (!base) return false;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), TRIGGER_MS) : null;
  try {
    const r = await fetch(`${base}${ENRICH_FN}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tip_ids: ids, sig: sign(ids, secretOf(env)) }), signal: ctl ? ctl.signal : undefined });
    return r.ok || r.status === 202;
  } catch (e) { return false; } finally { if (timer) clearTimeout(timer); }
}

const defaults = { db: null, now: () => Date.now(), env: null, trigger: null, warn: (m) => console.warn(m) };
let warnedNoSecret = false;

async function handle(event, deps = {}) {
  const d = { ...defaults, ...deps };
  const env = d.env || process.env;
  if (!d.db) d.db = supabaseDb();
  if (!d.trigger) d.trigger = (ids) => trigger(ids, event, env);
  const method = (event && event.httpMethod) || 'GET';
  if (method === 'OPTIONS') return { statusCode: 204, headers: { 'Cache-Control': 'no-store' }, body: '' };
  if (method !== 'POST') return out(405, { error: 'Nepovolená metóda.' });
  if (!originOk(event)) return out(403, { error: 'Formulár sa dá odoslať len z našej stránky.' });
  const raw = String((event && event.body) || '');
  if (raw.length > MAX_BODY) return out(413, { error: 'Priveľa textu naraz. Pošlite firmy v menších dávkach.' });
  let b;
  try { b = JSON.parse(raw || '{}'); } catch (e) { return out(400, { error: 'Neplatné údaje formulára.' }); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return out(400, { error: 'Neplatné údaje formulára.' });

  // Pasca na roboty: človek skryté pole nevidí. Robotovi „ok", nech neskúša ďalej.
  if (clean(b.website, 200)) return out(200, { ok: true, added: 0, duplicates: 0, results: [] });

  // Kľúč odkazu — zlý aj vypnutý zber dostanú tú istú vetu.
  if (!T.tokenOk(b.t)) return out(403, { error: GONE });
  let cfg;
  try { cfg = await d.db.settings(); } catch (e) { return out(503, { error: 'Zber teraz nefunguje. Skúste to prosím o chvíľu.' }); }
  const tips = (cfg && cfg.marketing && cfg.marketing.tips) || {};
  if (!tips.enabled || !T.tokenOk(tips.token) || !sameToken(b.t, tips.token)) return out(403, { error: GONE });
  // Stránka sa pri otvorení len spýta, či odkaz ešte platí (nech kolega nevypĺňa zbytočne).
  if (b.check === true) return out(200, { ok: true });

  const name = clean(b.name, T.LIMITS.name);
  if (name.length < 2) return out(400, { error: 'Napíšte prosím svoje meno.', field: 'name', errors: [] });
  const p = T.parseFirms(b.firms);
  if (!p.ok) return out(400, { error: p.error, errors: p.errors });

  // Limit z jednej siete (odtlačok IP, nie IP).
  const now = d.now();
  const secret = secretOf(env);
  const ip = ipOf(event);
  const hash = ipHash(ip, secret);
  let mem = null;
  try {
    if (hash) {
      const n = await d.db.countIp(hash, new Date(now - WINDOW_MS).toISOString());
      if (n + p.firms.length > PER_WINDOW) return out(429, { error: `Za hodinu sa dá z jednej siete poslať najviac ${PER_WINDOW} firiem. Skúste to prosím neskôr.` });
    } else {
      if (!secret && !warnedNoSecret) { warnedNoSecret = true; d.warn('[danubra-lead-tip] chýba IP_HASH_SECRET — limit odoslaní platí len v pamäti funkcie'); }
      if (ip) {
        mem = memCount(ip, now);
        if (mem.count + p.firms.length > PER_WINDOW) return out(429, { error: `Za hodinu sa dá z jednej siete poslať najviac ${PER_WINDOW} firiem. Skúste to prosím neskôr.` });
      }
    }
  } catch (e) { return out(503, { error: 'Zber teraz nefunguje. Skúste to prosím o chvíľu.' }); }

  let known;
  try { known = await d.db.known(); } catch (e) { return out(503, { error: 'Zber teraz nefunguje. Skúste to prosím o chvíľu.' }); }

  const at = new Date(now).toISOString();
  const batch = crypto.randomUUID();
  const rows = [], why = [];
  const sofar = [...known.tips];
  for (const f of p.firms) {
    const dup = T.duplicateOf(f, { leads: known.leads, partners: known.partners, tips: sofar });
    const row = {
      batch_id: batch, company_name: f.company_name, url: f.url, kind: f.kind, website: f.website, domain: f.domain,
      profile_url: f.profile_url, city: f.city, relation: f.relation, what_we_did: f.what_we_did, contact: f.contact,
      unsure: f.unsure, submitted_by_name: name, status: dup ? 'duplicate' : 'new',
      duplicate_of_lead_id: dup ? (dup.kind === 'lead' ? dup.id : dup.lead_id || null) : null,
      duplicate_of_partner_id: dup ? (dup.kind === 'partner' ? dup.id : dup.partner_id || null) : null,
      duplicate_of_tip_id: dup && dup.kind === 'tip' ? dup.id : null,
      meta: f.maps ? { name: f.maps.name, lat: f.maps.lat, lng: f.maps.lng, short: f.maps.short } : null,
      ip_hash: hash, created_at: at,
    };
    rows.push(row);
    why.push(dup ? dup.why : null);
    sofar.push({ ...row, id: `new-${rows.length}` });
  }

  let saved;
  try { saved = await d.db.insertTips(rows); } catch (e) {
    console.error('[danubra-lead-tip] insert', e && e.message);
    return out(500, { error: 'Uložiť sa to nepodarilo. Skúste to prosím o chvíľu znova — text ostal vo formulári.' });
  }
  if (mem) mem.add(rows.length);

  const results = p.firms.map((f, k) => ({ i: f.i, company: f.company_name, status: rows[k].status === 'duplicate' ? 'duplicate' : 'added', why: why[k] }))
    .concat(p.repeated.map(i => ({ i, company: clean((b.firms[i] || {}).company, 200), status: 'repeated', why: 'v zozname je dvakrát' })))
    .sort((x, y) => x.i - y.i);
  const board = T.leaderboard([...known.tips, ...rows], known.leads);
  const mineRow = board.find(r => r.key === T.personKey(name)) || { tips: 0, fresh: 0, added: 0 };

  const enrich = (saved || []).filter(r => r.status === 'new' && r.website).map(r => r.id).filter(Boolean);
  try { await d.trigger(enrich); } catch (e) { /* appka to spustí sama */ }

  return out(200, {
    ok: true, added: rows.filter(r => r.status === 'new').length, duplicates: rows.filter(r => r.status === 'duplicate').length,
    results, mine: { tips: mineRow.tips, fresh: mineRow.fresh, added: mineRow.added }, rank: T.rankOf(board, name), team: board.length,
  });
}

exports.handle = handle;
exports.handler = (event) => handle(event);
exports.ipHash = ipHash;
exports.secretOf = secretOf;
exports.sign = sign;
exports.signOk = signOk;
exports.sameToken = sameToken;
exports.LIMITS = { WINDOW_MS, PER_WINDOW, MAX_BODY };
