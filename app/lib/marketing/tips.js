// ============================================================================
// DANUBRA — Odkazy od kolegov (čistá logika)
// ============================================================================
// „Potrebujem formulár, kde kolegovia aj bez prihlásenia pridajú odkazy na
// firmy, a v appke sa to zbiera — v Oslovovaní ako ‚Odkazy od kolegov'.
// Pošlem im to ako bojovú úlohu."
//
// Tu je všetko, čo sa dá overiť bez siete a databázy — používa to verejná
// stránka (app/odkazy.html), server (danubra-lead-tip, danubra-lead-tips-
// enrich-background) aj appka (js/modules/lead-tips.js):
//
// Kolega vyplní za každú firmu riadok: názov (povinný), odkaz (web alebo
// profil, nepovinný), mesto, vzťah (Spolupracovali sme / Robilo sa u Denisa /
// Len relevantná), čo sme spolu robili, kto bol kontakt, „nie som si istý".
//
//   normalize(vstup)   jeden odkaz → { kind: web | maps | profile, url, domain }
//                      — https, bez sledovacích parametrov (utm_, gclid…),
//                      holá doména („firma.de") aj e-mail („info@firma.de")
//                      = web firmy; Google Mapy (aj maps.app.goo.gl) = 'maps'
//                      s menom a súradnicami z adresy, keď v nej sú;
//                      LinkedIn, Facebook, Xing, northdata… = 'profile'
//                      (nie je to web firmy, nesťahuje sa)
//   parseFirms(rows)   riadky formulára → očistené firmy, chyby pri poliach,
//                      opakované (najviac MAX_URLS naraz)
//   duplicateOf(…)     už ju máme? doména webu/e-mailu alebo meno firmy
//                      (DanubraLeads.normName, s mestom) medzi odberateľmi,
//                      novými firmami a skoršími odkazmi
//   leaderboard(…)     rebríček kolegov: odkazy, nové, pridané, odberatelia
//   tipToLead(tip)     odkaz s tým, čo sme o firme zistili → riadok danubra_leads
//                      (známe dobré firmy s palcom hore — učenie, 080)
//   nameFromTitle()    „Startseite | Müller Bau GmbH" → „Müller Bau GmbH"
//   shareText(link)    správa pre kolegov (bojová úloha, text od majiteľa)
//
// SSRF a sťahovanie stránok sú na serveri (seeds.checkUrl, safeLookup) —
// tu sa nič nesťahuje.
//
// Testy: node app/lib/marketing/tips.test.js
// ============================================================================
(function () {
  const node = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const S = node ? require('./seeds.js') : (typeof window !== 'undefined' ? window.DanubraSeeds : null);
  // Meno firmy na porovnanie: DanubraLeads.normName (verejná stránka ho nemá — vtedy to isté zo seeds.js).
  const L = node ? require('./leads.js') : (typeof window !== 'undefined' ? window.DanubraLeads : null);

  const MAX_URLS = 20;
  const URL_MAX = 1000;
  const LIMITS = { name: 80, company: 200, city: 120, what: 1000, contact: 300 };
  const STATUS = [
    ['new', 'Nový', 'blue'], ['added', 'Pridaný', 'green'], ['duplicate', 'Duplicita', 'amber'], ['rejected', 'Zamietnutý', 'red'],
  ];
  const KINDS = { web: 'web firmy', maps: 'Google Mapy', profile: 'profil firmy', none: 'bez odkazu' };
  /** Vzťah k firme (čipy vo formulári). */
  const RELATIONS = [
    ['past_partner', 'Spolupracovali sme', 'green'], ['via_denis', 'Robilo sa u Denisa', 'blue'], ['relevant', 'Len relevantná / poznám ich', 'gray'],
  ];
  /** Známe dobré firmy — pri pridaní dostanú palec hore a sú najlepším vzorom na hľadanie. */
  const KNOWN_GOOD = ['past_partner', 'via_denis'];

  const clean = (v) => (v == null ? '' : String(v)).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  const cut = (v, n) => clean(v).slice(0, n);

  /** Sledovacie parametre, ktoré s firmou nemajú nič spoločné. */
  const TRACKING = /^(utm_[a-z0-9_]+|gclid|gclsrc|gbraid|wbraid|dclid|fbclid|msclkid|yclid|twclid|ttclid|li_fat_id|mc_cid|mc_eid|_ga|_gl|_hsenc|_hsmi|hsctatracking|mkt_tok|igshid|igsh|srsltid|gad_source|gad_campaignid|ref|ref_src|ref_url|trk|trkcampaign|spm|scid|epik|vero_id|oly_anon_id|oly_enc_id|pk_[a-z_]+|mtm_[a-z_]+|matomo_[a-z_]+|piwik_[a-z_]+|g_ep|g_st|entry|shorturl|coh|skid|ved|ei|sca_esv|sxsrf)$/i;

  /** Stránky, ktoré nie sú webom firmy (profil firmy na cudzom portáli). */
  const PLATFORMS = ['facebook.com', 'fb.com', 'instagram.com', 'linkedin.com', 'xing.com', 'twitter.com', 'x.com', 'youtube.com',
    'youtu.be', 'tiktok.com', 'pinterest.com', 'wlw.de', 'gelbeseiten.de', 'dasoertliche.de', 'dastelefonbuch.de', '11880.com',
    'kununu.com', 'northdata.de', 'northdata.com', 'firmenwissen.de', 'indeed.com', 'indeed.de', 'stepstone.de', 'meinestadt.de',
    'yelp.de', 'yelp.com', 'cylex.de', 'golocal.de', 'werkenntdenbesten.de', 'my-hammer.de', 'check24.de', 'houzz.de', 'houzz.com',
    'unternehmensregister.de', 'handelsregister.de', 'bundesanzeiger.de', 'firmania.de', 'branchenbuch.de', 'google.com', 'google.de',
    'bing.com', 'wa.me', 'whatsapp.com', 'trustpilot.com', 'proven-expert.com', 'provenexpert.com', 'jobs.de', 'arbeitsagentur.de'];

  const isGoogleHost = (h) => /^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(h);

  /** Odkaz na mapu? Google Mapy (aj skrátené), Apple Mapy, OpenStreetMap. */
  function isMapsUrl(u) {
    const h = u.hostname.toLowerCase();
    const p = u.pathname.toLowerCase();
    if (h === 'maps.app.goo.gl' || h === 'g.page' || (h === 'g.co' && p.startsWith('/kgs'))) return true;
    if (h === 'goo.gl' && p.startsWith('/maps')) return true;
    if (/^maps\.google\./.test(h)) return true;
    if (isGoogleHost(h) && p.startsWith('/maps')) return true;
    if (h === 'maps.apple.com' || h === 'www.openstreetmap.org' || h === 'openstreetmap.org') return true;
    return false;
  }
  /** Skrátený odkaz na Mapy — meno a súradnice sú až za presmerovaním. */
  const isShortMaps = (url) => { try { const u = new URL(url); return ['maps.app.goo.gl', 'goo.gl', 'g.page', 'g.co'].includes(u.hostname.toLowerCase()); } catch (e) { return false; } };

  const num = (s) => { const n = Number(s); return Number.isFinite(n) ? n : null; };
  const validLL = (a, b) => a != null && b != null && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0);

  /**
   * Meno a súradnice z adresy na Mapy (bez stiahnutia).
   *   /maps/place/M%C3%BCller+Bau+GmbH/@48.40,9.98,17z/data=!3d48.401!4d9.987
   *   /maps/search/?api=1&query=Müller+Bau   ?q=…   maps.apple.com/?q=…&ll=48.4,9.9
   * @returns {{ name: string|null, lat: number|null, lng: number|null }}
   */
  function parseMaps(url) {
    let u;
    try { u = new URL(url); } catch (e) { return { name: null, lat: null, lng: null }; }
    let name = null, lat = null, lng = null;
    const dec = (s) => { try { return decodeURIComponent(String(s).replace(/\+/g, ' ')); } catch (e) { return String(s).replace(/\+/g, ' '); } };
    const pm = u.pathname.match(/\/maps\/(?:place|search)\/([^/@]+)/i);
    if (pm) name = dec(pm[1]);
    const q = u.searchParams.get('q') || u.searchParams.get('query') || u.searchParams.get('daddr') || '';
    if (!name && q && !/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(q.trim())) name = q;
    const exact = `${u.pathname}${u.search}`.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    const at = u.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    const ll = (u.searchParams.get('ll') || u.searchParams.get('sll') || (/^-?\d/.test(q) ? q : '') || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    for (const m of [exact, at, ll]) {
      if (m && validLL(num(m[1]), num(m[2]))) { lat = num(m[1]); lng = num(m[2]); break; }
    }
    name = name ? cut(name, 160) || null : null;
    if (name && /^-?\d+(\.\d+)?\s*,/.test(name)) name = null;
    return { name, lat, lng };
  }

  const EMAIL = /^[^\s@<>()]+@([a-z0-9äöüß.-]+\.[a-z]{2,24})$/i;
  const stripWrap = (s) => String(s || '').trim().replace(/^[<("'„“‚‘[]+/, '').replace(/[>)"'“”‘’\].,;:!?]+$/, '');

  /**
   * Jeden odkaz → čo to je a kam vedie.
   * @returns {{ ok: true, input, kind: 'web'|'maps'|'other', url, domain, host, name?, lat?, lng?, short? }
   *         | { ok: false, input, error }}
   */
  function normalize(input) {
    const raw = stripWrap(clean(input));
    const bad = (error) => ({ ok: false, input: raw || clean(input), error });
    if (!raw) return bad('Prázdny odkaz.');
    if (raw.length > URL_MAX * 2) return bad('Odkaz je pridlhý.');
    let s = raw;
    const em = !/:\/\//.test(s) && s.match(EMAIL);
    if (em) {
      const d = S.baseDomain(em[1]);
      if (!d) return bad('Neplatný e-mail.');
      if (S.isFreemail(d)) return bad('E-mail z bezplatnej schránky (gmx, t-online…) neprezradí web firmy — vložte radšej web alebo odkaz z Google Máp.');
      s = `https://${d}`;
    }
    if (/^\/\//.test(s)) s = `https:${s}`;
    else if (!/^https?:\/\//i.test(s)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^:]+\.[a-z]{2,24}:\d/i.test(s)) return bad('Len odkazy na web (http:// alebo https://).');
      s = `https://${s}`;
    }
    const c = S.checkUrl(s);
    if (!c.ok) return bad(c.reason || 'Neplatný odkaz.');
    const u = new URL(c.url);
    u.protocol = 'https:';
    u.hash = '';
    u.port = '';
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    const host = u.hostname.toLowerCase().replace(/^www\d?\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    const qs = u.searchParams.toString();
    const url = `https://${u.hostname.toLowerCase()}${path || (qs ? '/' : '')}${qs ? `?${qs}` : ''}`;
    if (url.length > URL_MAX) return bad('Odkaz je pridlhý.');
    const domain = S.baseDomain(host);
    if (isMapsUrl(u)) {
      const m = parseMaps(url);
      return { ok: true, input: raw, kind: 'maps', url, domain, host, name: m.name, lat: m.lat, lng: m.lng, short: isShortMaps(url) };
    }
    if (PLATFORMS.some(p => domain === p || host === p || host.endsWith(`.${p}`))) {
      return { ok: true, input: raw, kind: 'profile', url, domain, host, name: null };
    }
    // Web firmy: na porovnanie stačí doména, na stiahnutie úvodná stránka.
    return { ok: true, input: raw, kind: 'web', url: em ? `https://${domain}` : url, domain, host };
  }

  /** Kľúč odkazu: web = doména firmy, Mapy a profil = celá adresa. */
  const keyOf = (x) => (x.kind === 'web' ? `d:${x.domain}` : `u:${String(x.url || '').replace(/\/$/, '').toLowerCase()}`);

  /** Meno firmy na porovnanie — to isté pravidlo ako DanubraLeads.normName (bez GmbH, bodiek, medzier). */
  const nameKey = (n) => (L && L.normName ? L.normName(n) : S.normName(n));
  const cityKey = (c) => clean(c).toLowerCase();

  /**
   * Jedna firma z formulára → očistený záznam alebo chyby pri poliach.
   *   { company, link, city, relation, what, contact, unsure }
   * Odkaz je nepovinný (niekto si pamätá len meno), ale keď je, musí byť platný.
   * @returns {{ ok: true, firm } | { ok: false, errors: { field: text } }}
   */
  function parseFirm(row) {
    const r = row || {};
    const errors = {};
    const company = cut(r.company, LIMITS.company);
    if (company.length < 2) errors.company = 'Napíšte názov firmy.';
    const linkRaw = cut(r.link, URL_MAX * 2);
    let link = null;
    if (linkRaw) {
      const n = normalize(linkRaw);
      if (!n.ok) errors.link = `Neplatný odkaz: ${n.error}`;
      else link = n;
    }
    const relation = RELATIONS.some(x => x[0] === r.relation) ? r.relation : null;
    if (Object.keys(errors).length) return { ok: false, errors };
    const kind = link ? link.kind : 'none';
    return { ok: true, firm: {
      company_name: company,
      url: link ? link.url : null,
      kind,
      website: kind === 'web' ? origin(link.url) : null,
      domain: kind === 'web' ? link.domain : null,
      profile_url: kind === 'profile' || kind === 'maps' ? link.url : null,
      city: cut(r.city, LIMITS.city) || null,
      relation,
      what_we_did: cut(r.what, LIMITS.what) || null,
      contact: cut(r.contact, LIMITS.contact) || null,
      unsure: r.unsure === true || r.unsure === 'on' || r.unsure === 'true',
      maps: kind === 'maps' ? { name: link.name || null, lat: link.lat, lng: link.lng, short: !!link.short } : null,
    } };
  }

  /**
   * Všetky firmy z jedného odoslania. Prázdne riadky (bez mena aj odkazu)
   * sa ticho preskočia; tá istá firma dvakrát sa zoberie raz.
   * @returns {{ ok, firms, errors: [{ i, field, error }], repeated: number[], error }}
   */
  function parseFirms(rows, { max = MAX_URLS } = {}) {
    const firms = [], errors = [], repeated = [];
    const seen = new Set();
    (Array.isArray(rows) ? rows : []).slice(0, max * 3).forEach((row, i) => {
      if (!row || (!clean(row.company) && !clean(row.link) && !clean(row.what) && !clean(row.contact))) return;
      const p = parseFirm(row);
      if (!p.ok) { for (const [field, error] of Object.entries(p.errors)) errors.push({ i, field, error }); return; }
      const keys = [`n:${nameKey(p.firm.company_name)}|${cityKey(p.firm.city)}`, p.firm.domain ? `d:${p.firm.domain}` : null].filter(Boolean);
      if (keys.some(k => seen.has(k))) { repeated.push(i); return; }
      keys.forEach(k => seen.add(k));
      firms.push({ ...p.firm, i });
    });
    let error = null;
    if (errors.length) error = 'Niektoré polia treba opraviť — sú označené červenou.';
    else if (firms.length > max) error = `Naraz najviac ${max} firiem (vyplnených ${firms.length}). Zvyšok pošlite v ďalšom kole.`;
    else if (!firms.length) error = 'Vyplňte aspoň jednu firmu.';
    return { ok: !error, firms, errors, repeated, error };
  }

  /** Domény webu a firemného e-mailu záznamu (nová firma, odberateľ). */
  function domainsOf(r) {
    const out = [];
    const w = r && r.website ? S.baseDomain(r.website) : '';
    if (w) out.push(w);
    const e = r && r.email ? S.baseDomain(String(r.email).split('@').pop()) : '';
    if (e && !S.isFreemail(e)) out.push(e);
    return out;
  }
  /** To isté meno; keď majú obe strany mesto, musí sedieť aj mesto. */
  function sameFirm(nk, city, r, rName, rCity) {
    if (!nk || nk.length < 3) return false;
    if (nameKey(rName) !== nk) return false;
    const a = cityKey(city), b = cityKey(rCity);
    return !a || !b || a === b;
  }

  /**
   * Už túto firmu máme? Poradie: odberateľ, nová firma, skorší odkaz.
   * Zhoda: doména webu (aj firemného e-mailu) alebo meno firmy (bez GmbH,
   * bodiek…; keď majú obe strany mesto, musí sedieť) alebo tá istá adresa
   * profilu / Máp.
   * @param {{ company_name, city, domain, url, kind, id? }} firm
   * @returns {null | { kind: 'partner'|'lead'|'tip', id, name, why, lead_id?, partner_id? }}
   */
  function duplicateOf(firm, { leads = [], partners = [], tips = [] } = {}) {
    if (!firm) return null;
    const d = firm.domain || (firm.website ? S.baseDomain(firm.website) : '');
    const nk = nameKey(firm.company_name);
    const mapsName = firm.maps && firm.maps.name ? nameKey(firm.maps.name) : '';
    const hit = (r, name, city) => (d && domainsOf(r).includes(d)) || sameFirm(nk, firm.city, r, name, city)
      || (mapsName && mapsName.length >= 3 && nameKey(name) === mapsName);
    for (const p of partners) if (p && hit(p, p.name, p.city)) return { kind: 'partner', id: p.id, name: p.name || '', why: 'už je náš odberateľ' };
    for (const l of leads) if (l && hit(l, l.name, l.city)) return { kind: 'lead', id: l.id, name: l.name || '', why: 'už je medzi novými firmami' };
    const u = firm.url && firm.kind !== 'web' ? keyOf(firm) : '';
    for (const t of tips) {
      if (!t || t.archived_at || (firm.id && t.id === firm.id) || t.status === 'rejected') continue;
      const td = t.domain || '';
      if ((d && td === d) || sameFirm(nk, firm.city, t, t.company_name, t.city) || (u && t.url && keyOf(t) === u)) {
        return { kind: 'tip', id: t.id, name: t.company_name || '', why: 'už ju poslal kolega',
          lead_id: t.lead_id || t.duplicate_of_lead_id || null, partner_id: t.duplicate_of_partner_id || null };
      }
    }
    return null;
  }

  // ── Rebríček ────────────────────────────────────────────────────────────
  /** „Jano", „ jano " a „Jáno" sú ten istý kolega. */
  const personKey = (n) => clean(n).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  /**
   * Rebríček kolegov z odkazov. Poradie: odberatelia, pridané do Nových
   * firiem, nové (nie duplicita ani zamietnuté), všetky odkazy.
   * @param {Array} tips   riadky danubra_lead_tips
   * @param {Array} leads  danubra_leads (na „stala sa odberateľom")
   * @returns {Array<{ key, name, tips, fresh, added, won, last_at }>}
   */
  function leaderboard(tips, leads = []) {
    const byLead = new Map((leads || []).map(l => [l.id, l]));
    const won = (id) => { const l = id && byLead.get(id); return !!(l && (l.status === 'won' || l.partner_id)); };
    const by = new Map();
    for (const t of tips || []) {
      if (!t || t.archived_at) continue;
      const k = personKey(t.submitted_by_name);
      if (!k) continue;
      if (!by.has(k)) by.set(k, { key: k, name: clean(t.submitted_by_name), tips: 0, fresh: 0, added: 0, won: 0, last_at: null });
      const r = by.get(k);
      r.tips++;
      if (!['duplicate', 'rejected'].includes(t.status)) r.fresh++;
      if (t.status === 'added' || t.lead_id) r.added++;
      if (won(t.lead_id)) r.won++;
      if (!r.last_at || String(t.created_at || '') > r.last_at) { r.last_at = t.created_at || r.last_at; r.name = clean(t.submitted_by_name) || r.name; }
    }
    return [...by.values()].sort((a, b) => b.won - a.won || b.added - a.added || b.fresh - a.fresh || b.tips - a.tips
      || a.name.localeCompare(b.name, 'sk'));
  }
  /** Poradie kolegu v rebríčku (1 = prvý), 0 = ešte nič neposlal. */
  function rankOf(board, name) {
    const k = personKey(name);
    const i = (board || []).findIndex(r => r.key === k);
    return i < 0 ? 0 : i + 1;
  }

  // ── Meno firmy ──────────────────────────────────────────────────────────
  const GENERIC = /^(startseite|home|homepage|willkommen|herzlich willkommen|index|start|aktuelles|news|impressum|kontakt|über uns|ueber uns|unternehmen|wir über uns|offizielle (web)?seite|website|webseite)$/i;
  const LEGAL = /\b(GmbH|AG|KG|OHG|UG|GbR|e\.\s?K\.|mbH|SE|PartG|Inh\.)\b/;

  /** Titulok webu → meno firmy. „Startseite | Müller Bau GmbH – Trockenbau in Ulm" → „Müller Bau GmbH". */
  function nameFromTitle(title) {
    const t = clean(title);
    if (!t) return null;
    const parts = t.split(/\s+[|–—·•:»«-]\s+|\s*\|\s*/).map(p => p.trim()).filter(p => p && !GENERIC.test(p));
    if (!parts.length) return null;
    const legal = parts.find(p => LEGAL.test(p));
    const pick = legal || parts.find(p => p.length >= 3 && p.length <= 60) || parts[0];
    return cut(pick, 120) || null;
  }

  /** Meno firmy: z Impressum (s právnou formou), inak ako ho napísal kolega. */
  function tipName(tip) {
    const t = tip || {};
    const m = t.meta || {};
    const own = clean(t.company_name);
    const imp = clean(m.company);
    // Impressum má presný názov s GmbH; použije sa, keď je to tá istá firma.
    if (imp && own && (nameKey(imp).includes(nameKey(own)) || nameKey(own).includes(nameKey(imp)))) return cut(imp, 200);
    return cut(own || imp || nameFromTitle(m.title) || (t.domain || ''), 200) || null;
  }

  const origin = (url) => { try { const u = new URL(url); return `https://${u.hostname.toLowerCase()}`; } catch (e) { return null; } };
  const fmtDay = (d) => { const x = d ? new Date(d) : null; return x && !Number.isNaN(x.getTime()) ? `${x.getDate()}. ${x.getMonth() + 1}.` : ''; };
  const relationOf = (k) => RELATIONS.find(r => r[0] === k) || null;

  /** Veta pri firme: „Tip od: Jano, 31. 10." */
  function tipLabel(by, at) {
    const n = clean(by);
    if (!n) return '';
    const d = fmtDay(at);
    return `Tip od: ${n}${d ? `, ${d}` : ''}`;
  }

  /** Dôvod palca hore pri známej firme (učenie, 080). */
  const RELEVANCE_NOTE = { past_partner: 'Tip od kolegu: spolupráca v minulosti', via_denis: 'Tip od kolegu: robilo sa u Denisa' };

  /**
   * Odkaz → riadok danubra_leads (zdroj „kolega"). Údaje z Impressum
   * a z úvodnej stránky (meta) sa prenesú; vzťah, čo sme robili a kontakt
   * idú do poznámok firmy. Firmy, s ktorými sme robili (sami alebo u Denisa),
   * dostanú palec hore — sú to známe dobré firmy a AI sa z nich učí.
   * @param {Object} tip  riadok danubra_lead_tips
   * @param {{ by?: string, now?: Date }} o  kto pridáva (relevance_by), kedy
   */
  function tipToLead(tip, { by = null, now = new Date() } = {}) {
    const t = tip || {};
    const m = t.meta || {};
    const name = tipName(t);
    if (!name) return null;
    const email = clean(m.email).toLowerCase();
    const okMail = S.emailOk ? S.emailOk(email) : /@/.test(email);
    const vat = String(m.vat_id || '').replace(/\s/g, '');
    const rel = relationOf(t.relation);
    const notes = [
      tipLabel(t.submitted_by_name, t.created_at),
      rel ? `Vzťah: ${rel[1]}${t.unsure ? ' (kolega si nie je úplne istý)' : ''}` : (t.unsure ? 'Kolega si nie je úplne istý.' : ''),
      t.what_we_did ? `Čo sme spolu robili: ${clean(t.what_we_did)}` : '',
      t.contact ? `Kontakt: ${clean(t.contact)}` : '',
      t.profile_url ? `Profil / Mapy: ${t.profile_url}` : '',
    ].filter(Boolean).join('\n');
    const lat = num(m.lat), lng = num(m.lng);
    const website = t.website ? origin(t.website) : (t.kind === 'web' && t.url ? origin(t.url) : null);
    const row = {
      name, website: m.final_url ? origin(m.final_url) || website : website,
      email: okMail ? email : null, phone: cut(m.phone, 40) || null,
      address: cut(m.address, 200) || null, postal_code: cut(m.postal_code, 12) || null, city: cut(m.city || t.city, 120) || null,
      country: 'DE', contact_person: cut(m.konatel, 160) || null, impressum_url: cut(m.impressum_url, 300) || null,
      vat_id: /^DE\d{9}$/.test(vat) ? vat : null,
      why: cut([tipLabel(t.submitted_by_name, t.created_at), rel && rel[1], t.what_we_did].filter(Boolean).join(' · '), 400) || null,
      source: 'kolega', source_ref: cut(t.url || t.website, 300) || null, status: 'new',
      source_tip_id: t.id || null, tip_by: cut(t.submitted_by_name, 80) || null,
      notes: notes || null,
      profile: {
        summary: cut(m.description, 600) || null,
        email_source: okMail ? 'impressum' : null,
        tip: { by: cut(t.submitted_by_name, 80), at: t.created_at || null, relation: t.relation || null,
          what_we_did: cut(t.what_we_did, 1000) || null, contact: cut(t.contact, 300) || null,
          unsure: !!t.unsure, url: t.url || null, profile_url: t.profile_url || null },
      },
    };
    if (validLL(lat, lng)) { row.lat = lat; row.lng = lng; }
    if (m.checked) {
      row.logo_url = m.logo || null; row.og_image = m.og_image || null; row.site_title = cut(m.title, 200) || null;
      row.site_description = cut(m.description, 400) || null; row.site_embeddable = m.embeddable == null ? null : !!m.embeddable;
      row.site_checked_at = t.checked_at || null;
    }
    if (KNOWN_GOOD.includes(t.relation)) {
      row.relevance = 1;
      row.relevance_note = RELEVANCE_NOTE[t.relation];
      row.relevance_at = (now instanceof Date ? now : new Date(now)).toISOString();
      row.relevance_by = by || null;
    }
    return row;
  }

  /** Google hľadanie webu firmy („Nájsť web") — len odkaz, nič sa neplatí a nič sa nesťahuje. */
  function searchUrl(tip) {
    const t = tip || {};
    const q = [clean(t.company_name), clean(t.city)].filter(Boolean).join(' ');
    return `https://www.google.com/search?q=${encodeURIComponent(q || clean(t.url))}`;
  }

  // ── Odkaz pre kolegov ───────────────────────────────────────────────────
  const tokenOk = (t) => /^[A-Za-z0-9_-]{32,128}$/.test(String(t || ''));
  /** Nový tajný kľúč (48 hex znakov = 192 bitov) z crypto.getRandomValues. */
  function makeToken(getRandomValues) {
    const b = new Uint8Array(24);
    getRandomValues(b);
    return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  /** Kľúč je v kotve (#t=…) — neodchádza na server v adrese, nie je v logoch ani v Referer. */
  const linkFor = (base, token) => `${String(base || '').replace(/\/+$/, '')}/app/odkazy.html#t=${token}`;
  /** Správa pre kolegov (bojová úloha) — text od majiteľa, [ODKAZ NA FORMULÁR] = skutočný odkaz. */
  const MESSAGE = 'Ahojte, mám pre vás bojovú úlohu.\n\n'
    + 'Potrebujeme dať dokopy zoznam firiem, s ktorými sme v minulosti spolupracovali alebo boli pre nás relevantné, vrátane tých, s ktorými sa robilo u Denisa. '
    + 'Ku každej firme prosím napíšte názov, odkaz (web alebo profil) a ak viete, aj krátku poznámku, čo sme spolu robili alebo kto bol kontakt.\n\n'
    + 'Netreba stovky, stačí každý, kto vám napadne, aj keď si nie ste úplne istí. Michal, na teba sa spolieham najviac, máš na to najlepšiu pamäť.\n\n'
    + 'Zapisujte sem: [ODKAZ NA FORMULÁR]\n\n'
    + 'Vďaka.';
  const shareText = (link) => MESSAGE.replace('[ODKAZ NA FORMULÁR]', String(link || ''));
  const whatsappUrl = (text) => `https://wa.me/?text=${encodeURIComponent(String(text || ''))}`;

  const statusOf = (k) => STATUS.find(s => s[0] === k) || STATUS[0];
  const plural = (n, a, b, c) => (n === 1 ? a : n >= 2 && n <= 4 ? b : c);
  /** „pridané 3 firmy" na úspešnej obrazovke. */
  function addedText(n) {
    const k = Number(n) || 0;
    return `${plural(k, 'pridaná', 'pridané', 'pridaných')} ${k} ${plural(k, 'firma', 'firmy', 'firiem')}`;
  }

  const API = { MAX_URLS, URL_MAX, LIMITS, STATUS, KINDS, RELATIONS, KNOWN_GOOD, RELEVANCE_NOTE, TRACKING, PLATFORMS, MESSAGE,
    normalize, parseMaps, isShortMaps, keyOf, nameKey, parseFirm, parseFirms, domainsOf, duplicateOf,
    personKey, leaderboard, rankOf, nameFromTitle, tipName, tipLabel, tipToLead, origin, relationOf, searchUrl,
    tokenOk, makeToken, linkFor, shareText, whatsappUrl, statusOf, plural, addedText, fmtDay };
  if (typeof window !== 'undefined') window.DanubraTips = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
