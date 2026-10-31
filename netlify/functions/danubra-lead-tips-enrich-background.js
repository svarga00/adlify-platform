// ============================================================================
// DANUBRA — Odkazy od kolegov: údaje z webu firmy (na pozadí)
// ============================================================================
// Spúšťa ju danubra-lead-tip hneď po odoslaní formulára (POST { tip_ids,
// sig } — podpis HMAC, ktorý vie vyrobiť len server) a appka (záložka
// Odkazy od kolegov, prihlásený člen s Marketingom):
//   POST {}                 odkazy s webom, ktoré ešte nemajú údaje (najviac 50)
//   POST { tip_ids: [...] } vybrané (napr. po „Nájsť web" a vložení webu)
//
// Pri každom odkaze so skutočným webom firmy (stĺpec website — nie profil na
// LinkedIn/Facebooku, nie Mapy) sa stiahne úvodná stránka a Impressum tou
// istou cestou ako pri hľadaní podľa webov (danubra-leads-from-urls-
// background: readSite s ochranou proti SSRF, časový limit, limit veľkosti)
// a zapíše sa do meta: titulok, popis, logo, náhľad, názov firmy, e-mail,
// telefón, adresa, mesto, konateľ, USt-IdNr (lib/marketing/sitemeta.js,
// lib/marketing/seeds.js). Keď sa podľa toho ukáže, že firmu už máme
// (meno z Impressum, doména e-mailu), odkaz dostane stav Duplicita.
// Zadarmo: žiadne kredity Outscraperu, žiadne volanie AI.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, IP_HASH_SECRET (podpis)
// ============================================================================
'use strict';
const S = require('../../app/lib/marketing/seeds.js');
const T = require('../../app/lib/marketing/tips.js');
const Urls = require('./danubra-leads-from-urls-background.js');
const Tip = require('./danubra-lead-tip.js');

const TOTAL_MS = 10 * 60 * 1000;
const PARALLEL = 3;
const MAX_IDS = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = 'id,company_name,city,url,kind,website,domain,status,meta,checked_at,lead_id,duplicate_of_lead_id,duplicate_of_partner_id,submitted_by_name,created_at,archived_at';

const out = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

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
    async byIds(ids) {
      const { data, error } = await c().from('danubra_lead_tips').select(COLS).in('id', ids).is('archived_at', null);
      if (error) throw error;
      return data || [];
    },
    async pending(limit) {
      const { data, error } = await c().from('danubra_lead_tips').select(COLS).is('archived_at', null).is('checked_at', null)
        .not('website', 'is', null).order('created_at', { ascending: true }).limit(limit);
      if (error) throw error;
      return data || [];
    },
    async known() {
      const [l, p, t] = await Promise.all([
        c().from('danubra_leads').select('id,name,city,website,email,archived_at').limit(20000),
        c().from('danubra_partners').select('id,name,city,website,email').limit(5000),
        c().from('danubra_lead_tips').select('id,company_name,city,domain,url,kind,status,lead_id,duplicate_of_lead_id,duplicate_of_partner_id,archived_at')
          .is('archived_at', null).limit(20000),
      ]);
      for (const r of [l, p, t]) if (r.error) throw r.error;
      return { leads: l.data || [], partners: p.data || [], tips: t.data || [] };
    },
    async update(id, patch) { const { error } = await c().from('danubra_lead_tips').update(patch).eq('id', id); return { error }; },
  };
}

const defaults = { db: null, guard: null, fetchPage: (url) => Urls.fetchPage(url), now: () => Date.now(), env: null };

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k); }
  }));
}

/** Čo sa z webu a Impressum dá zapísať do meta (len krátke, očistené texty). */
function metaFrom(site, imp, old) {
  const cut = (v, n) => (v == null ? null : String(v).replace(/\s+/g, ' ').trim().slice(0, n) || null);
  const m = site.meta || {};
  return {
    ...(old || {}),
    checked: true,
    error: site.ok ? null : cut(site.error, 200),
    final_url: cut(site.finalUrl, 500),
    title: cut(m.site_title, 200), description: cut(m.site_description, 400),
    logo: m.logo_url || null, og_image: m.og_image || null, embeddable: m.site_embeddable == null ? null : !!m.site_embeddable,
    impressum_url: cut(site.impressumUrl, 300),
    company: imp ? cut(imp.company, 200) : null,
    email: imp && imp.email ? cut(imp.email, 160) : null,
    phone: imp ? cut(imp.phone, 40) : null,
    address: imp ? cut(imp.address, 200) : null,
    postal_code: imp ? cut(imp.postal_code, 12) : null,
    city: imp ? cut(imp.city, 120) : null,
    konatel: imp ? cut(imp.contact_person, 160) : null,
    vat_id: imp ? cut(imp.vat_id, 20) : null,
  };
}

async function run(event, d) {
  let body = {};
  try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return out(400, { error: 'Neplatné telo požiadavky.' }); }
  const ids = Array.isArray(body.tip_ids) ? [...new Set(body.tip_ids.map(String).filter(x => UUID.test(x)))] : null;
  if (ids && ids.length > MAX_IDS) return out(400, { error: `Naraz najviac ${MAX_IDS} odkazov.` });
  // Server (podpis) alebo prihlásený člen s Marketingom.
  const signed = ids && ids.length && body.sig && Tip.signOk(ids, body.sig, Tip.secretOf(d.env || process.env));
  if (!signed) {
    const g = await d.guard(event);
    if (!g || !g.ok) return out((g && g.status) || 403, { error: (g && g.error) || 'Na túto akciu nemáte oprávnenie.' });
  }

  const started = d.now();
  const deadline = started + TOTAL_MS;
  let tips, known;
  try {
    tips = ids ? (ids.length ? await d.db.byIds(ids) : []) : await d.db.pending(MAX_IDS);
    known = await d.db.known();
  } catch (e) { return out(503, { error: String((e && e.message) || e).slice(0, 300) }); }

  const sum = { checked: 0, with_email: 0, duplicates: 0, unreachable: 0, skipped: 0, errors: 0 };
  const todo = tips.filter(t => t.website && !t.archived_at);
  sum.skipped = tips.length - todo.length;
  await pool(todo, PARALLEL, async (t) => {
    if (d.now() > deadline - 20000) return;
    const url = S.siteUrl(t.website);
    if (!url) { sum.skipped++; return; }
    let site;
    try { site = await Urls.readSite(url, d, { deadline }); } catch (e) { site = { ok: false, error: 'Web sa nedá stiahnuť.', finalUrl: url }; }
    const imp = site.impressumText ? S.parseImpressum(site.impressumText, { website: site.finalUrl || url }) : null;
    const meta = metaFrom(site, imp, t.meta);
    const patch = { meta, checked_at: new Date(d.now()).toISOString() };
    sum.checked++;
    if (!site.ok) sum.unreachable++;
    if (meta.email) sum.with_email++;
    // S presným menom z Impressum a doménou e-mailu sa dá duplicita zistiť lepšie.
    if (t.status === 'new') {
      const firm = { id: t.id, company_name: meta.company || t.company_name, city: meta.city || t.city, domain: t.domain, website: t.website, url: t.url, kind: t.kind };
      let dup = T.duplicateOf(firm, { leads: known.leads, partners: known.partners, tips: known.tips.filter(x => x.id !== t.id && String(x.created_at || '') <= String(t.created_at || '~')) });
      if (!dup && meta.email) {
        const ed = S.baseDomain(meta.email.split('@').pop());
        if (ed && !S.isFreemail(ed) && ed !== t.domain) dup = T.duplicateOf({ ...firm, domain: ed }, { leads: known.leads, partners: known.partners, tips: [] });
      }
      if (dup) {
        sum.duplicates++;
        Object.assign(patch, { status: 'duplicate',
          duplicate_of_lead_id: dup.kind === 'lead' ? dup.id : dup.lead_id || null,
          duplicate_of_partner_id: dup.kind === 'partner' ? dup.id : dup.partner_id || null,
          duplicate_of_tip_id: dup.kind === 'tip' ? dup.id : null });
      }
    }
    const { error } = await d.db.update(t.id, patch);
    if (error) sum.errors++;
  });
  console.log('[danubra-lead-tips-enrich]', JSON.stringify(sum));
  return out(200, sum);
}

async function handle(event, deps = {}) {
  const d = { ...defaults, ...deps };
  if (!d.db) d.db = supabaseDb();
  if (!d.guard) {
    const guard = require('../../app/lib/server-guard.js')(d.db.client());
    d.guard = (ev) => guard.check(ev, { key: 'marketing' });
  }
  return run(event || {}, d);
}

exports.handle = handle;
exports.handler = (event) => handle(event);
exports.metaFrom = metaFrom;
