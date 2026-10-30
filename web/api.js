// ============================================================================
// punds web — príjem formulárov z webov
// ============================================================================
//   punds.sk  apply    prihláška na ponuku        → Kandidáti (zdroj Web, inzerát)
//             contact  „Ozvite sa nám"            → Kandidáti (zdroj Web)
//   punds.eu  enquiry  dopyt nemeckej firmy        → Dopyty (zdroj punds.eu)
//
// Každé odoslanie sa zapíše do danubra_web_submissions (aj spam), aby sa
// dalo dohľadať, čo presne prišlo. Ochrana: pasca na roboty (pole
// „website"), najviac 6 odoslaní z jednej adresy za 10 minút, povinný
// súhlas, kontrola polí, len z našich stránok (Origin).
// Osobné údaje v tomto zázname databáza po lehote anonymizuje (migrácia
// 073, denný cron) — údaj sám je už v Kandidátoch alebo Dopytoch.
// ============================================================================
'use strict';

const crypto = require('crypto');
const PROF = require('./shared/professions');
const { COLS } = require('./shared/jobs');
const { SPOKEN } = require('./shared/sites');

const FORMS = { sk: ['apply', 'contact'], eu: ['enquiry'] };
// Jazyk webu → danubra_candidates.language (čeština je v appke „cs").
const LANG_DB = { sk: 'sk', cz: 'cs', hu: 'hu', de: 'de', en: 'en', ro: 'ro', pl: 'pl', bg: 'bg' };
const ORIGIN_OK = /^https?:\/\/(([a-z0-9-]+\.)*punds\.(sk|eu)|adlify-app\.netlify\.app|[a-z0-9-]+--adlify-app\.netlify\.app|localhost(:\d+)?|127\.0\.0\.1(:\d+)?)$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const json = (status, body) => ({ status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const str = (v, max = 300) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const phoneOk = (p) => String(p || '').replace(/\D/g, '').length >= 7;

/** Skontroluje a očistí polia formulára. @returns {{ ok, data, errors: [field] }} */
function validate(form, b = {}) {
  const errors = [];
  const d = {
    name: str(b.name, 120), phone: str(b.phone, 40), email: str(b.email, 160).toLowerCase(),
    note: str(b.note || b.message, 3000), consent: b.consent === true || b.consent === 'on' || b.consent === 'true',
    lang: LANG_DB[str(b.lang, 5)] ? str(b.lang, 5) : null, page: str(b.page, 300), website: str(b.website, 200),
  };
  // „Ktorými jazykmi hovoríte?" — len známe kódy (shared/sites.js → SPOKEN), bez duplicít.
  // Vo formulári je pole povinné (site.js); server ho nevyžaduje, aby prihláška
  // zo stránky, ktorú CDN ešte drží bez tohto poľa, neskončila chybou.
  if (form === 'apply' || form === 'contact') {
    const raw = Array.isArray(b.languages) ? b.languages : (b.languages ? [b.languages] : []);
    d.languages = [...new Set(raw.map((x) => str(x, 10)).filter((k) => SPOKEN.includes(k)))];
  }
  if (form === 'apply') {
    d.job = str(b.job, 120);
    if (!d.name) errors.push('name');
    if (!phoneOk(d.phone)) errors.push('phone');
    if (d.email && !EMAIL.test(d.email)) errors.push('email');
  } else if (form === 'contact') {
    d.profession = str(b.profession, 120);
    d.topic = str(b.topic, 120);
    if (!d.name) errors.push('name');
    if (!phoneOk(d.phone)) errors.push('phone');
    if (d.email && !EMAIL.test(d.email)) errors.push('email');
  } else if (form === 'enquiry') {
    d.company = str(b.company, 160);
    d.trades = (Array.isArray(b.trades) ? b.trades : (b.trades ? [b.trades] : [])).map((x) => str(x, 40)).filter((k) => PROF.byKey(k)).slice(0, 12);
    if (b.trade) {
      const t = PROF.byKey(str(b.trade, 40)) || PROF.PROFESSIONS.find((p) => p.eu && Object.values(p.eu.slug).includes(str(b.trade, 60)));
      if (t && !d.trades.includes(t.key)) d.trades.unshift(t.key);
    }
    d.headcount = Math.max(0, Math.min(500, parseInt(String(b.headcount || '').replace(/\D/g, ''), 10) || 0)) || null;
    d.location = str(b.location, 160);
    d.start = str(b.start, 60);
    d.model = ['werkvertrag', 'aueg', 'open'].includes(b.model) ? b.model : null;
    if (!d.company) errors.push('company');
    if (!d.name) errors.push('name');
    if (!EMAIL.test(d.email)) errors.push('email');
    if (d.phone && !phoneOk(d.phone)) errors.push('phone');
  } else errors.push('form');
  if (!d.consent) errors.push('consent');
  return { ok: !errors.length, data: d, errors };
}

/** Začiatok z voľného textu: 2026-11-03, 3.11.2026, 11/2026, 2026-11 → YYYY-MM-DD (alebo null). */
function startDate(s) {
  const t = String(s || '').trim();
  let m;
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = t.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if ((m = t.match(/^(\d{4})-(\d{2})$/))) return `${m[1]}-${m[2]}-01`;
  if ((m = t.match(/^(\d{1,2})\s*[/.]\s*(\d{4})$/))) return `${m[2]}-${m[1].padStart(2, '0')}-01`;
  return null;
}

/**
 * Automatické e-maily — chyba v nich nesmie pokaziť uloženú prihlášku.
 * Funkcia na Netlify smie bežať ~10 s: keby sme na e-maily čakali dlhšie,
 * návštevník by dostal chybu, hoci je prihláška uložená, a poslal by ju znova.
 * Preto najviac 6 s; nestihnutý e-mail sa zapíše do logu ako „časový limit".
 */
const MAIL_WAIT_MS = 6000;
async function mailAfter(notify, o, supabase, logId) {
  if (!notify) return;
  try {
    const r = await Promise.race([notify(o), new Promise((ok) => setTimeout(() => ok({ skipped: 'časový limit' }), MAIL_WAIT_MS))]);
    const err = r && (r.confirmError || r.teamError || (r.skipped === 'časový limit' ? 'e-mail: časový limit' : null));
    if (logId && r) await supabase.from('danubra_web_submissions').update({ error: err || null }).eq('id', logId);
  } catch (e) { console.error('[punds-web mail]', e); }
}

const MODEL = { werkvertrag: 'Werkvertrag', aueg: 'Arbeitnehmerüberlassung', open: 'noch offen' };

// ── Odtlačok IP adresy (ochrana proti zahlteniu) ───────────────────────────
// IP sa neukladá, len jej odtlačok — a ten musí byť s tajným kľúčom (HMAC).
// Obyčajný SHA-256 sa dá spätne zistiť: IPv4 má len ~4 miliardy adries,
// prejdú sa všetky za pár minút a odtlačok sa tak zmení späť na adresu.
// Kľúč: IP_HASH_SECRET; kým nie je nastavený, iné tajomstvo, ktoré server
// už má (MAIL_SECRET, kľúč service role). Bez akéhokoľvek tajomstva sa IP
// neukladá vôbec (ip_hash = null) a limit odoslaní sa drží len v pamäti
// funkcie. Zmena kľúča nič nepokazí — odtlačok sa porovnáva len 10 minút.
const ipSecret = (env = process.env) => [env.IP_HASH_SECRET, env.MAIL_SECRET, env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_SERVICE_KEY]
  .map((x) => String(x || '').trim()).find(Boolean) || null;
const ipOf = (ip) => String(ip || '').split(',')[0].trim();
/** HMAC-SHA256 adresy, alebo null (bez adresy alebo bez tajného kľúča). */
function ipHash(ip, secret = ipSecret()) {
  const a = ipOf(ip);
  if (!a || !secret) return null;
  return crypto.createHmac('sha256', secret).update(`punds-web:ip:${a}`).digest('hex').slice(0, 32);
}
let warnedNoSecret = false;
/** Limit odoslaní bez databázy (keď sa odtlačok neukladá): len v pamäti tejto inštancie funkcie. */
const MEM_HITS = new Map();
function memCount(ip, nowMs, windowMs) {
  const key = ipOf(ip);
  const hits = (MEM_HITS.get(key) || []).filter((t) => t > nowMs - windowMs);
  MEM_HITS.set(key, hits);
  if (MEM_HITS.size > 5000) for (const [k, v] of MEM_HITS) if (!v.some((t) => t > nowMs - windowMs)) MEM_HITS.delete(k);
  return { count: hits.length, add: () => hits.push(nowMs) };
}

/**
 * @param {Object} site  SITES.sk | SITES.eu
 * @param {string} name  apply | contact | enquiry
 * @param {Object} req   { method, body, ip, origin, userAgent }
 * @param {Object} deps  { supabase, now }
 */
async function handle(site, name, req, { supabase, now = () => new Date(), notify = null } = {}) {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  if (!(FORMS[site.key] || []).includes(name)) return json(404, { error: 'not found' });
  if (req.origin && !ORIGIN_OK.test(req.origin)) return json(403, { error: 'origin' });
  if (String(req.body || '').length > 20000) return json(413, { error: 'too large' });
  let body;
  try { body = JSON.parse(req.body || '{}'); } catch (e) { return json(400, { error: 'json' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'json' });

  const v = validate(name, body);
  const hash = ipHash(req.ip);
  const spam = !!v.data.website;
  const WINDOW = 10 * 60 * 1000;
  if (hash) {
    const since = new Date(now().getTime() - WINDOW).toISOString();
    const { count } = await supabase.from('danubra_web_submissions').select('id', { count: 'exact', head: true })
      .eq('ip_hash', hash).gte('created_at', since);
    if ((count || 0) >= 6) return json(429, { error: 'too many' });
  } else {
    if (!ipSecret() && !warnedNoSecret) {
      warnedNoSecret = true;
      console.warn('[punds-web api] chýba IP_HASH_SECRET (ani iné tajomstvo) — IP adresa sa neukladá, limit odoslaní platí len v pamäti funkcie');
    }
    const mem = memCount(req.ip, now().getTime(), WINDOW);
    if (mem.count >= 6) return json(429, { error: 'too many' });
    mem.add();
  }

  const { website, ...clean } = v.data;
  const log = { site: site.key, form: name, lang: v.data.lang, page: v.data.page, payload: clean, ip_hash: hash,
    user_agent: str(req.userAgent, 300), spam };
  // Bez súhlasu (alebo od robota) sa osobné údaje neukladajú — len to, že niečo prišlo.
  if (spam) {                     // robotovi povieme, že to prešlo — nech neskúša ďalej
    await supabase.from('danubra_web_submissions').insert({ ...log, payload: {} });
    return json(200, { ok: true });
  }
  if (!v.ok) {
    await supabase.from('danubra_web_submissions').insert({ ...log, payload: {}, error: `invalid: ${v.errors.join(',')}` });
    return json(400, { error: 'invalid', fields: v.errors });
  }

  const d = v.data, at = now().toISOString();
  try {
    if (name === 'enquiry') {
      const tr = d.trades.map((k) => PROF.byKey(k));
      const tradeNames = tr.map((p) => (p.eu ? p.eu.name.de : PROF.nameOf(p, 'de'))).join(', ');
      const brief = [
        d.note,
        tradeNames && `Gewerke: ${tradeNames}`,
        d.headcount && `Anzahl: ${d.headcount}`,
        d.location && `Einsatzort: ${d.location}`,
        d.start && `Start: ${d.start}`,
        d.model && `Vertragsform: ${MODEL[d.model]}`,
        `Sprache: ${d.lang || 'de'} · Seite: ${d.page || '—'}`,
      ].filter(Boolean).join('\n');
      const row = {
        title: `${d.company}${tradeNames ? ` — ${tradeNames}` : ''}`.slice(0, 200),
        brief, company_name: d.company, company_country: 'DE',
        contact_name: d.name, contact_phone: d.phone || null, contact_email: d.email,
        city: d.location || null, country: 'DE', trade_key: (tr[0] && tr[0].app[0]) || null,
        headcount: d.headcount, start_date: startDate(d.start), source: 'punds.eu', status: 'new', consent_at: at,
      };
      const { data, error } = await supabase.from('danubra_opportunities').insert(row).select('id').single();
      if (error) throw error;
      const { data: lg } = await supabase.from('danubra_web_submissions').insert({ ...log, opportunity_id: data.id }).select('id').single();
      await mailAfter(notify, { site, kind: name, data: d, id: data.id }, supabase, lg && lg.id);
      return json(200, { ok: true });
    }

    // punds.sk — prihláška alebo kontakt → kandidát
    let ad = null;
    if (name === 'apply' && d.job) {
      const { data } = await supabase.from('danubra_ads').select(`${COLS},plan_id`).eq('web_slug', d.job).maybeSingle();
      ad = data || null;
    }
    const prof = ad ? (PROF.byKey(ad.web_prof) || PROF.fromApp(ad.trade_key))
      : PROF.PROFESSIONS.find((p) => Object.values(p.name).concat(Object.values(p.one)).some((n) => n.toLowerCase() === (d.profession || '').toLowerCase()));
    const what = ad ? (ad.web_title || ad.title) : (name === 'apply' ? `ponuka ${d.job || '?'}` : 'kontaktný formulár');
    const row = {
      full_name: d.name, phone: d.phone, email: d.email || null, language: LANG_DB[d.lang] || 'sk',
      languages: d.languages && d.languages.length ? d.languages : null,     // migrácia 084
      profession: (ad && ad.trade_key) || (prof && prof.app[0]) || null,
      source: 'web', source_detail: `punds.sk · ${what}`.slice(0, 200), status: 'new', type: 'individual',
      notes: [d.topic && `Téma: ${d.topic}`, d.note, d.profession && !prof && `Profesia: ${d.profession}`].filter(Boolean).join('\n') || null,
      ad_id: ad ? ad.id : null, plan_id: ad ? ad.plan_id : null,
      city: null, received_at: at, consent_at: at,
    };
    const { data, error } = await supabase.from('danubra_candidates').insert(row).select('id').single();
    if (error) throw error;
    const { data: lg } = await supabase.from('danubra_web_submissions').insert({ ...log, candidate_id: data.id }).select('id').single();
    await mailAfter(notify, { site, kind: name, data: d, ad, id: data.id }, supabase, lg && lg.id);
    return json(200, { ok: true });
  } catch (e) {
    await supabase.from('danubra_web_submissions').insert({ ...log, error: String(e.message || e).slice(0, 300) });
    console.error('[punds-web api]', name, e);
    return json(500, { error: 'server' });
  }
}

module.exports = { handle, validate, startDate, ipHash, ipSecret, ORIGIN_OK, FORMS };
