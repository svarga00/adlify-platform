// ============================================================================
// DANUBRA — SuperFaktúra na serveri: volania, databáza, história
// ============================================================================
// Len Node (netlify/functions/danubra-sf-invoice.js a denný cron). Kľúče sú
// len v premenných prostredia a nikdy neodídu v odpovedi ani do histórie.
//
// Pravidlá, ktoré tu platia bez výnimky:
//
//   1. Stav faktúry sa číta z databázy, nie z požiadavky. Vystaviť sa dá len
//      faktúra, ktorú v databáze schválil admin (approved + approved_by/at).
//   2. Doklad nesmie vzniknúť v SuperFaktúre bez toho, aby to appka vedela:
//      zámok pred vystavením, id sa zapisuje hneď po odpovedi, a po neistom
//      pokuse (vypršal čas, výpadok spojenia) sa doklad najprv HĽADÁ podľa
//      čísla — až keď sa isto nenašiel, smie sa zakladať.
//   3. Opakuje sa len čítanie (view, pdf, zoznamy). Zápis (create, send,
//      platba) sa nikdy neopakuje automaticky.
//   4. Synchronizácia nič neprepisuje naslepo: rozdiely sa zapíšu do histórie
//      faktúry a „zaplatená" sa nastaví len pri úplnej úhrade v SuperFaktúre,
//      a to len keď platbu ešte nespárovala Banka.
//   5. Sandbox, kým SF_ENV nie je presne `production`.
//   6. Denný limit požiadaviek (sf-budget.js, migrácia 093): každá
//      požiadavka sa pred odoslaním zarezervuje v databáze — aj opakovaný
//      pokus. Keď rezerva nevyjde, požiadavka neodíde (kód `budget`) a
//      neopakuje sa. Synchronizácia má vlastný menší rozpočet, vystavovanie
//      a odosielanie rezervu, ktorú synchronizácia nezje.
//
// Testy: node app/tests/sf-invoice.test.js, node app/tests/sf-limit.test.js
// ============================================================================
const SF = require('./superfaktura.js');
const M = require('../money.js');
const Archive = require('../documents/archive.js');
const Budget = require('./sf-budget.js');

const DOCS_BUCKET = 'danubra-docs';
const ISSUING = 'VYSTAVUJE SA';
const UNCERTAIN = 'NEISTÉ';
const OPEN = ['issued', 'sent', 'overdue'];

// ── Len server: hlavička, chyby, história ──────────────────────────────────
// Zámerne nie v superfaktura.js — tá sa načítava aj v prehliadači a tam
// nesmie byť ani tvar prihlasovacej hlavičky, ani názvy premenných s kľúčom.

/** Hlavička podľa dokumentácie SuperFaktúry. Hodnoty URL-enkódované. */
function authHeader({ email, apiKey, companyId, module: mod = 'DANUBRA Hub' } = {}) {
  const parts = [
    `email=${encodeURIComponent(email || '')}`,
    `apikey=${encodeURIComponent(apiKey || '')}`,
    `module=${encodeURIComponent(mod)}`,
  ];
  if (companyId) parts.push(`company_id=${encodeURIComponent(companyId)}`);
  return `SFAPI ${parts.join('&')}`;
}

const HINT = {
  auth: 'Skontrolujte v Netlify premenné SF_EMAIL, SF_API_KEY (a SF_COMPANY_ID, ak má účet viac firiem). '
    + 'Kľúč je v SuperFaktúre v Nástroje → API prístup. Sandbox a ostrý účet majú iné kľúče.',
  rate_limit: 'SuperFaktúra dočasne obmedzila počet požiadaviek. Počkajte minútu a skúste to znova.',
  timeout: 'SuperFaktúra neodpovedala včas. Skúste to o chvíľu znova.',
  uncertain: 'Doklad v SuperFaktúre mohol vzniknúť. Ďalší pokus ho najprv vyhľadá podľa čísla faktúry — '
    + 'druhý doklad nevznikne. Ak ho appka nenájde a v SuperFaktúre je, napíšte jeho id k faktúre ručne.',
  network: 'Server sa so SuperFaktúrou nespojil. Skúste to o chvíľu znova.',
  server: 'SuperFaktúra má poruchu. Skúste to o chvíľu znova.',
  not_found: 'Doklad v SuperFaktúre sa nenašiel. Skontrolujte, či ho tam niekto nezmazal, a v akom prostredí (sandbox / ostrý účet) vznikol.',
  validation: 'Opravte údaje, ktoré SuperFaktúra odmietla (zvyčajne odberateľ alebo položky), a skúste to znova.',
  bad_response: 'SuperFaktúra odpovedala inak, než appka čaká. Skontrolujte doklad priamo v SuperFaktúre.',
  budget: 'Denný limit požiadaviek na SuperFaktúru je minutý. Počítadlo sa vynuluje o polnoci (slovenský čas).',
};
const LEAD = {
  auth: 'SuperFaktúra odmietla prihlásenie.',
  rate_limit: 'Priveľa požiadaviek na SuperFaktúru naraz.',
  timeout: 'SuperFaktúra neodpovedala včas.',
  network: 'SuperFaktúra je nedostupná.',
  server: 'SuperFaktúra má poruchu.',
  not_found: 'Doklad v SuperFaktúre neexistuje.',
  validation: 'SuperFaktúra doklad odmietla.',
  bad_response: 'Nečakaná odpoveď SuperFaktúry.',
  budget: 'Dnešný limit požiadaviek na SuperFaktúru je vyčerpaný.',
};

/**
 * HTTP stav + telo → { code, message, hint }. SuperFaktúra vracia
 * `{ error: 1, error_message: … }` — reťazec, pole alebo objekt polí.
 * @param {{ status:number, json?:Object, text?:string }} r
 */
function classifyError({ status, json, text } = {}) {
  const first = (...v) => v.find(x => x !== undefined && x !== null && x !== '');
  const raw = json ? SF.flatMessage(first(json.error_message, json.message, json.errors)) : '';
  let code;
  // „You have exceeded a daily limit of 1000 API requests." — opakovať nemá zmysel.
  if (/exceeded (a |the )?(daily|monthly) limit|prekročil[ia]?\s.{0,30}limit|(denný|mesačný) limit/i.test(raw)) code = 'budget';
  else if (status === 401 || status === 403) code = 'auth';
  else if (status === 429 || /too many|rate limit|limit požiadaviek|príliš veľa/i.test(raw)) code = 'rate_limit';
  else if (status === 404) code = 'not_found';
  else if (status >= 500) code = 'server';
  else if (json && json.error && json.error !== 0 && json.error !== '0') {
    code = /prihl|login|api ?key|unauthor|neplatn[ýé] (api )?kľúč|neautoriz/i.test(raw) ? 'auth' : 'validation';
  } else if (status && status >= 400) code = 'validation';
  else code = 'bad_response';
  const detail = SF.clip(raw || (text && !/^\s*</.test(text) ? text : ''));
  return { code, message: detail ? `${LEAD[code]} ${detail}` : LEAD[code], hint: HINT[code], detail };
}

const SECRET_KEY = /api_?key|apikey|authorization|password|secret|^token$|sf_token|access_token/i;
/**
 * Kópia objektu bez tajomstiev: kľúče, prihlasovacia hlavička a token
 * dokladu (token otvára PDF bez prihlásenia) sa nahradia hviezdičkami.
 */
function redact(v, depth = 0) {
  if (depth > 6) return '…';
  if (typeof v === 'string') return v.replace(/SFAPI\s+\S+/g, '***').replace(/apikey=[^&\s]+/gi, 'apikey=***');
  if (Array.isArray(v)) return v.slice(0, 50).map(x => redact(x, depth + 1));
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = SECRET_KEY.test(k) ? '***' : redact(x, depth + 1);
    return out;
  }
  return v;
}

/** Krátky prehľad požiadavky do histórie — čo išlo von, nie celé telo. */
function summarize(payload = {}) {
  const I = payload.Invoice || {};
  const items = payload.InvoiceItem || [];
  return redact({
    type: I.type, number: I.invoice_no_formatted || null, variable: I.variable || null,
    created: I.created, due: I.due, currency: I.invoice_currency, vat_transfer: I.vat_transfer,
    parent_id: I.parent_id, items: items.length, items_total: items.length ? M.toNumeric(SF.itemsCents(items)) : null,
    client: payload.Client ? { id: payload.Client.id || null, name: payload.Client.name, ic_dph: payload.Client.ic_dph || null } : null,
    language: payload.InvoiceSetting && payload.InvoiceSetting.language,
  });
}

/** Chyba SuperFaktúry s vetou pre človeka a radou, čo spraviť. */
class SfError extends Error {
  constructor(info = {}) {
    super(info.message || 'Chyba SuperFaktúry.');
    this.code = info.code || 'bad_response';
    this.hint = info.hint || HINT[this.code] || '';
    this.http = info.http || null;
    // true = zápis mohol prejsť (vypršal čas, 5xx) → doklad treba najprv hľadať.
    this.uncertain = !!info.uncertain;
  }
}

/** Dnešný deň na Slovensku (server beží v UTC — po polnoci by bol včerajšok). */
const todaySk = Budget.todaySk;

/**
 * Značka „práve sa vystavuje" v sf_error. Platí 10 minút — funkcia beží
 * najviac pár sekúnd, takže staršia značka je po spadnutom pokuse a nesmie
 * faktúru zamknúť navždy.
 */
function issuingNow(sfError, now = Date.now()) {
  const m = String(sfError || '').match(/^VYSTAVUJE SA (\S+)/);
  if (!m) return false;
  const t = Date.parse(m[1]);
  return Number.isFinite(t) && now - t < 10 * 60 * 1000;
}

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const emails = (v) => [].concat(v || []).flatMap(x => String(x || '').split(/[,;\s]+/)).map(s => s.trim()).filter(Boolean);

// Synchronizácia: doklad synchronizovaný pred menej než 20 h sa znova nečíta.
const FRESH_HOURS = 20;
// Zoznam faktúr: 100 dokladov na požiadavku (SuperFaktúra dovolí 200).
const PER_PAGE = 100;
const MAX_PAGES = 50;

function createService({ supabase, fetch: fetchImpl, env: ENV = process.env, sleep, clock } = {}) {
  const doFetch = fetchImpl || ((...a) => global.fetch(...a));
  const wait = sleep || ((ms) => new Promise(r => setTimeout(r, ms)));
  const now = clock || (() => new Date());
  const env = SF.envOf(ENV.SF_ENV);
  const base = SF.baseUrl(env);
  const retryDelay = ENV.SF_RETRY_DELAY_MS != null ? Number(ENV.SF_RETRY_DELAY_MS) : 800;
  const budget = Budget.createBudget({ supabase, env: ENV, clock: now });
  // Koľko požiadaviek táto inštancia naozaj poslala (služba sa skladá pre každú požiadavku).
  const stats = { sent: 0, sync: 0, write: 0 };

  function config() {
    return {
      environment: env, sandbox: env !== 'production', base,
      configured: !!(ENV.SF_EMAIL && ENV.SF_API_KEY),
      email_set: !!ENV.SF_EMAIL, key_set: !!ENV.SF_API_KEY, company_set: !!ENV.SF_COMPANY_ID,
      account: SF.maskEmail(ENV.SF_EMAIL),
    };
  }

  // ── HTTP ───────────────────────────────────────────────────────────────
  /** Rezerva nevyšla → chyba `budget` (bez opakovania). */
  function budgetError(kind, slot, action) {
    if (!slot || slot.unavailable) return new SfError({ code: 'budget', ...Budget.UNAVAILABLE });
    return new SfError({ code: 'budget', message: budget.message(kind, slot.used, action), hint: budget.hint(kind) });
  }

  /**
   * Jedno volanie SuperFaktúry.
   * @param {string} path
   * @param {{ body?:Object, read?:boolean, binary?:boolean, timeoutMs?:number, kind?:'sync'|'write', action?:string }} o
   *   read = bezpečné opakovať (GET). Zápis sa neopakuje nikdy.
   *   kind = z ktorého denného rozpočtu (sync = synchronizácia/PDF, write = vystavenie, odoslanie, úhrada, test).
   */
  async function request(path, o = {}) {
    const read = o.read !== undefined ? o.read : !o.body;
    const kind = o.kind === 'write' || o.kind === 'sync' ? o.kind : (read ? 'sync' : 'write');
    const tries = read ? 3 : 1;
    let last;
    for (let i = 0; i < tries; i++) {
      if (i) await wait(retryDelay * i);
      // Najprv rezerva v databáze, potom požiadavka. Aj opakovaný pokus je požiadavka.
      const slot = await budget.take(kind, 1);
      if (!slot.ok) throw budgetError(kind, slot, o.action);
      stats.sent++; stats[kind]++;
      try {
        return await once(path, o, read, kind);
      } catch (e) {
        last = e;
        const again = read && (e.code === 'rate_limit' || e.code === 'server' || e.code === 'timeout' || e.code === 'network');
        if (!again) throw e;
      }
    }
    throw last;
  }

  async function once(path, o, read, kind) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const ms = o.timeoutMs || (read ? 12000 : 25000);
    const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
    let res;
    try {
      res = await doFetch(base + path, {
        method: o.body ? 'POST' : 'GET',
        headers: {
          Authorization: authHeader({ email: ENV.SF_EMAIL, apiKey: ENV.SF_API_KEY, companyId: ENV.SF_COMPANY_ID }),
          'Content-Type': 'application/json',
          Accept: o.binary ? 'application/pdf' : 'application/json',
        },
        body: o.body ? JSON.stringify(o.body) : undefined,
        signal: ctrl ? ctrl.signal : undefined,
      });
    } catch (e) {
      const timeout = e && (e.name === 'AbortError' || /abort|timeout/i.test(String(e.message)));
      const code = timeout ? 'timeout' : 'network';
      throw new SfError({ code, message: timeout ? 'SuperFaktúra neodpovedala včas.' : 'SuperFaktúra je nedostupná.',
        hint: read ? HINT[code] : HINT.uncertain, uncertain: !read });
    } finally {
      if (timer) clearTimeout(timer);
    }

    // Počítadlo SuperFaktúry (X-RateLimit-*) — platí prísnejšie z oboch.
    const rl = Budget.readHeaders(res.headers, budget.limits);
    if (rl) await budget.report(rl);
    if (rl && rl.exceeded && !res.ok) {
      throw new SfError({ code: 'budget', http: res.status,
        message: budget.message(kind, rl.sf_used != null ? rl.sf_used : budget.limits.limit, o.action), hint: budget.hint(kind) });
    }

    if (o.binary && res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.slice(0, 5).toString('latin1') === '%PDF-') return { buffer: buf, contentType: 'application/pdf' };
      // Namiesto PDF prišla chyba (JSON alebo HTML).
      const text = buf.toString('utf8');
      let json = null; try { json = JSON.parse(text); } catch (e) { /* HTML */ }
      throw new SfError({ ...classifyError({ status: res.status, json, text }), http: res.status });
    }

    const text = typeof res.text === 'function' ? await res.text() : '';
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* SuperFaktúra občas vráti HTML */ }
    if (!res.ok || !json || (json.error && json.error !== 0 && json.error !== '0')) {
      const c = classifyError({ status: res.status, json, text });
      // 5xx pri zápise: požiadavka mohla prejsť.
      const uncertain = !read && (c.code === 'server' || (res.ok && !json));
      throw new SfError({ ...c, http: res.status, uncertain, hint: uncertain ? HINT.uncertain : c.hint });
    }
    return json;
  }

  // ── Databáza ───────────────────────────────────────────────────────────
  const one = async (table, id) => {
    if (!id) return null;
    const { data } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
    return data || null;
  };

  async function loadInvoice(id) {
    const { data: inv, error } = await supabase.from('danubra_invoices').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error('Databáza: ' + error.message);
    if (!inv) return null;
    const [partner, subcontract, period, parent] = await Promise.all([
      one('danubra_partners', inv.partner_id), one('danubra_subcontracts', inv.subcontract_id),
      one('danubra_periods', inv.period_id), one('danubra_invoices', inv.parent_invoice_id),
    ]);
    const { data: items } = await supabase.from('danubra_invoice_items').select('*').eq('invoice_id', id);
    return { inv, partner: partner || {}, subcontract: subcontract || {}, period: period || {},
      parent, items: (items || []).filter(i => !i.removed_at) };
  }

  async function loadSettings() {
    const { data } = await supabase.from('danubra_settings').select('*').limit(1);
    const row = (data || [])[0] || {};
    return { sf: row.superfaktura || {}, supplier: row.supplier || {} };
  }

  async function patchInvoice(id, patch) {
    const { error } = await supabase.from('danubra_invoices').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  }

  /**
   * Záznam do histórie faktúry. Bez kľúčov, hlavičky a tokenu dokladu.
   * Chyba zápisu histórie nezastaví prácu — doklad je dôležitejší.
   */
  async function log(invoiceId, body, meta = {}, actor = null, type = 'superfaktura') {
    try {
      await supabase.from('danubra_activities').insert({
        entity_type: 'invoice', entity_id: invoiceId, type, direction: 'out', source: 'superfaktura',
        body: String(body).slice(0, 2000),
        channel_meta: redact({ env, ...meta }),
        created_by: actor || null,
      });
    } catch (e) { /* história nesmie zhodiť vystavenie */ }
  }

  async function alertTask(inv, text) {
    try {
      await supabase.from('danubra_tasks').insert({
        title: `Faktúra ${inv.invoice_number || ''} nesúhlasí so SuperFaktúrou`.replace(/\s+/g, ' '),
        description: `${text} Faktúra sa neodošle, kým sa to neskontroluje v SuperFaktúre.`,
        entity_type: 'invoice', entity_id: inv.id, entity_label: inv.invoice_number || null,
        priority: 'high', due_date: todaySk(), source: 'system', level: 'auto', status: 'open',
        source_key: `sf-mismatch:${inv.id}`,
      });
    } catch (e) { /* úloha je navyše — záznam v histórii zostáva */ }
  }

  const ok = (body) => ({ status: 200, body: { ok: true, environment: env, ...body } });
  const no = (status, error, extra = {}) => ({ status, body: { error, ...extra } });
  const fromErr = (e) => no(e.code === 'auth' ? 502 : (e.code === 'rate_limit' || e.code === 'budget') ? 429 : 502,
    e.message, { code: e.code, hint: e.hint, uncertain: e.uncertain || undefined });
  // Vystavenie, odoslanie, úhrada, test: z rezervy, ktorú synchronizácia nezje.
  const W = (action, o = {}) => ({ ...o, kind: 'write', action });

  /** Doklad z iného prostredia sa týmto kľúčom nedá čítať ani meniť. */
  function envMismatch(inv) {
    if (!inv.sf_invoice_id) return null;
    if (SF.envOf(inv.sf_environment) === env) return null;
    return no(409, `Doklad vznikol v prostredí „${SF.envOf(inv.sf_environment)}", appka je teraz pripojená na „${env}".`,
      { hint: 'Sandbox a ostrý účet SuperFaktúry sú oddelené. Doklad zo sandboxu je len skúšobný — v appke ho stornujte.' });
  }

  // ── ping ───────────────────────────────────────────────────────────────
  async function ping() {
    try { return await pingRaw(); } catch (e) { if (e instanceof SfError) return fromErr(e); throw e; }
  }
  async function pingRaw() {
    const t0 = Date.now();
    let companies = [];
    try {
      const json = await request('/users/getUserCompaniesData', W('ping', { read: true }));
      const list = Array.isArray(json) ? json : (json && (json.data || json.companies || json.items)) || [];
      companies = (Array.isArray(list) ? list : []).map(x => (x && (x.Company || x)) || {})
        .filter(c => c.name).map(c => ({ id: c.id != null ? String(c.id) : null, name: String(c.name) }));
    } catch (e) {
      if (e.code !== 'not_found') throw e;
      // Starší účet bez tohto volania — overí sa aspoň prihlásenie.
      await request('/clients/index.json/listinfo:1/per_page:1', W('ping', { read: true }));
    }
    const chosen = companies.find(c => ENV.SF_COMPANY_ID && c.id === String(ENV.SF_COMPANY_ID)) || companies[0] || null;
    return ok({ base, account: SF.maskEmail(ENV.SF_EMAIL), company: chosen ? chosen.name : null,
      companies: companies.slice(0, 10).map(c => c.name), ms: Date.now() - t0 });
  }

  // ── Odberateľ v SuperFaktúre ───────────────────────────────────────────
  async function clientId(partner, actor, invId) {
    if (partner.sf_client_id && SF.envOf(partner.sf_client_env) === env && partner.sf_client_env) {
      return { id: partner.sf_client_id, how: 'reuse' };
    }
    let id = null;
    if (partner.ust_idnr) {
      try {
        const json = await request(`/clients/index.json/listinfo:1/per_page:20/search:${SF.b64(partner.ust_idnr)}`, W('issue', { read: true }));
        id = SF.findClient(json, partner);
      } catch (e) {
        if (e.code === 'budget') throw e;   // bez rezervy sa nezakladá ani klient
        /* hľadanie je navyše — klient sa založí */
      }
    }
    let how = 'found';
    if (!id) {
      const res = await request('/clients/create', W('issue', { body: SF.buildClient(partner) }));
      const d = (res && (res.data || res)) || {};
      id = d.Client && d.Client.id != null ? (Number(d.Client.id) || d.Client.id) : null;
      if (!id) throw new SfError({ code: 'bad_response', message: 'SuperFaktúra nevrátila id odberateľa.' });
      how = 'created';
    }
    // Id sa zapíše hneď — ďalšia faktúra (aj po chybe dokladu) ho použije.
    await supabase.from('danubra_partners').update({ sf_client_id: id, sf_client_env: env }).eq('id', partner.id);
    await log(invId, how === 'created' ? `Odberateľ ${partner.name} založený v SuperFaktúre (id ${id}).`
      : `Odberateľ ${partner.name} nájdený v SuperFaktúre (id ${id}).`, { action: 'client', ok: true, sf_client_id: id }, actor);
    return { id, how };
  }

  // ── issue ──────────────────────────────────────────────────────────────
  async function issue(invoiceId, { actor } = {}) {
    const ctx = await loadInvoice(invoiceId);
    if (!ctx) return no(404, 'Faktúra neexistuje.');
    const { inv, partner } = ctx;
    const credit = SF.isCreditNote(inv);
    const co = credit ? 'Dobropis' : 'Faktúra';

    // Toto je to miesto, kde by sa dalo obísť schvaľovanie. Nedá sa.
    if (inv.status !== 'approved') {
      return no(409, `Vystaviť sa dá len schválená faktúra. Táto je „${inv.status}".`,
        { hint: 'Faktúru musí najprv schváliť administrátor.' });
    }
    if (!inv.approved_by || !inv.approved_at) {
      return no(409, 'Faktúra nemá zapísané, kto a kedy ju schválil.', { hint: 'Vráťte ju do návrhu a dajte ju schváliť znova.' });
    }
    if (inv.sf_invoice_id) {
      return no(409, `Faktúra už je vystavená v SuperFaktúre (id ${inv.sf_invoice_id}). Druhé vystavenie sa odmieta.`);
    }
    if (!inv.partner_id || !partner.id) return no(409, 'Faktúra nemá odberateľa.');
    if (credit) {
      if (!ctx.parent || !ctx.parent.sf_invoice_id) {
        return no(409, 'Pôvodná faktúra tohto dobropisu nie je v SuperFaktúre.');
      }
      if (SF.envOf(ctx.parent.sf_environment) !== env) return envMismatch(ctx.parent);
    }

    // ── Zámok: dve kliknutia nesmú vystaviť dva doklady ───────────────────
    if (issuingNow(inv.sf_error)) {
      return no(409, 'Faktúra sa práve vystavuje (začaté pred chvíľou). Počkajte a obnovte stránku — '
        + 'druhé vystavenie by v SuperFaktúre založilo ten istý doklad dvakrát.');
    }
    const key = SF.idempotencyKey(inv, env);
    const retry = !!inv.sf_idempotency_key || String(inv.sf_error || '').startsWith(UNCERTAIN)
      || String(inv.sf_error || '').startsWith(ISSUING);
    let claim = supabase.from('danubra_invoices')
      .update({ sf_error: `${ISSUING} ${new Date().toISOString()}`, sf_idempotency_key: key })
      .eq('id', inv.id).eq('status', 'approved').is('sf_invoice_id', null);
    claim = inv.sf_error == null ? claim.is('sf_error', null) : claim.eq('sf_error', inv.sf_error);
    const { data: claimed, error: claimErr } = await claim.select('id');
    if (claimErr) throw new Error('Faktúru sa nepodarilo zamknúť na vystavenie: ' + claimErr.message);
    if (!Array.isArray(claimed) || !claimed.length) {
      return no(409, 'Faktúru medzitým vystavuje alebo zmenil niekto iný. Obnovte stránku a skontrolujte jej stav.');
    }

    const release = async (msg) => patchInvoice(inv.id, { sf_error: String(msg).slice(0, 2000) }).catch(() => {});
    const t0 = Date.now();
    const { sf: settings, supplier } = await loadSettings();
    let doc = null, payload = null, adopted = false;

    try {
      // Po neistom pokuse sa doklad najprv hľadá. Nájdený = prevezme sa, nezaloží sa druhý.
      if (retry) {
        try {
          const json = await request(`/invoices/index.json/listinfo:1/per_page:50/search:${SF.b64(inv.invoice_number || '')}`, W('issue', { read: true }));
          doc = SF.findInList(json, { number: inv.invoice_number, key });
          if (doc) adopted = true;
        } catch (e) {
          // Bez rezervy sa nesmie ani hľadať, ani zakladať — značka (aj NEISTÉ) zostáva.
          if (e.code === 'budget') { await release(inv.sf_error || e.message); return fromErr(e); }
          if (String(inv.sf_error || '').startsWith(UNCERTAIN)) {
            await release(inv.sf_error);
            return no(409, 'Predchádzajúci pokus o vystavenie skončil neisto a SuperFaktúra sa teraz nedá prehľadať. '
              + 'Doklad sa preto nezaloží.', { code: e.code, hint: 'Skúste to o chvíľu znova. Ak to trvá, pozrite v SuperFaktúre, '
              + `či doklad č. ${inv.invoice_number} existuje.` });
          }
        }
      }

      if (!doc) {
        let freistellung = null;
        if (!credit && ctx.subcontract.work_type === 'construction') {
          // Platná Freistellung §48b (register compliance) — na doklad ide veta, že sa zrážka neuplatňuje.
          const { data: fsRows } = await supabase.from('danubra_compliance')
            .select('reference,valid_from,valid_to,status').eq('kind', 'freistellung_48b').eq('scope', 'company')
            .is('archived_at', null);
          const dnes = todaySk();
          freistellung = (fsRows || []).find(f => !['pending', 'expired', 'not_required'].includes(f.status)
            && (!f.valid_from || f.valid_from <= dnes) && (!f.valid_to || f.valid_to >= dnes)) || null;
        }
        const client = await clientId(partner, actor, inv.id);
        payload = SF.buildInvoice({ invoice: inv, partner, subcontract: ctx.subcontract, period: ctx.period,
          items: ctx.items, freistellung, settings, supplier, sfClientId: client.id, parent: ctx.parent, key });
        const res = await request('/invoices/create', W('issue', { body: payload }));
        doc = SF.readInvoice(res);
        if (!doc.id) {
          // Doklad možno vznikol, ale nevieme jeho id — to sa nesmie zamlčať.
          throw new SfError({ code: 'bad_response', uncertain: true,
            message: 'SuperFaktúra nevrátila id faktúry. Skontrolujte ju v SuperFaktúre PREDTÝM, než to skúsite znova — mohol vzniknúť doklad.' });
        }
        if (!doc.clientId) doc.clientId = client.id;
      }
    } catch (e) {
      const err = e instanceof SfError ? e : new SfError({ code: 'bad_response', message: e.message });
      await release(err.uncertain ? `${UNCERTAIN} ${new Date().toISOString()}: ${err.message}` : err.message);
      await log(inv.id, `${co}: vystavenie v SuperFaktúre zlyhalo — ${err.message}`,
        { action: 'issue', ok: false, code: err.code, http: err.http, uncertain: err.uncertain, ms: Date.now() - t0,
          request: payload ? summarize(payload) : null }, actor);
      return fromErr(err);
    }

    // ── Id a stav sa zapisujú hneď a naraz ─────────────────────────────────
    const now = new Date().toISOString();
    const { error } = await supabase.from('danubra_invoices').update({
      status: 'issued', sf_invoice_id: doc.id, sf_token: doc.token || null, sf_environment: env,
      sf_number: doc.number || null, sf_status: 'issued', sf_synced_at: now, sf_error: null,
    }).eq('id', inv.id);
    if (error) {
      const msg = `Faktúra vznikla v SuperFaktúre (id ${doc.id}), ale nepodarilo sa to zapísať: ${error.message}. Doplňte sf_invoice_id ručne.`;
      await log(inv.id, msg, { action: 'issue', ok: false, sf_invoice_id: doc.id, db_error: error.message }, actor, 'alert');
      throw new Error(msg);
    }

    // ── Kontrola súm: SuperFaktúra vs. appka ───────────────────────────────
    if (doc.totalCents == null) {
      try { const v = SF.readInvoice(await request(`/invoices/view/${doc.id}.json`, W('issue', { read: true }))); doc = { ...doc, ...v, id: doc.id }; }
      catch (e) { /* bez sumy z view ostane kontrola neúplná — zapíše sa */ }
    }
    const rec = SF.reconcile({ invoice: inv, doc, settings });
    const note = rec.problems.map(p => p.text).join(' ');
    await patchInvoice(inv.id, { sf_check: rec.ok ? 'ok' : 'mismatch', sf_check_note: rec.ok ? null : note,
      sf_total: doc.totalCents != null ? M.toNumeric(doc.totalCents) : null });

    await log(inv.id, `${co} ${inv.invoice_number} ${adopted ? 'nájdená v SuperFaktúre po neistom pokuse a prevzatá' : 'vystavená v SuperFaktúre'}`
      + ` (id ${doc.id}${doc.number ? `, č. ${doc.number}` : ''}, ${env}).`,
      { action: 'issue', ok: true, sf_invoice_id: doc.id, sf_number: doc.number, adopted, ms: Date.now() - t0,
        request: payload ? summarize(payload) : null, check: rec.ok ? 'ok' : 'mismatch' }, actor);
    if (!rec.ok) {
      await log(inv.id, `Nesúhlasí so SuperFaktúrou: ${note} Faktúra sa neodošle, kým to niekto neskontroluje.`,
        { action: 'reconcile', ok: false, problems: rec.problems.map(p => p.key) }, actor, 'alert');
      await alertTask(inv, note);
    }

    // Dobropis ruší pôvodnú faktúru. Zaplatená zostane zaplatená — peniaze treba vrátiť.
    if (credit && ctx.parent) {
      const p = ctx.parent;
      if (OPEN.includes(p.status)) {
        await patchInvoice(p.id, { status: 'cancelled' }).catch(() => {});
        await log(p.id, `Stornovaná dobropisom ${inv.invoice_number} (SuperFaktúra id ${doc.id}).`, { action: 'cancel', ok: true, credit_note_id: inv.id }, actor);
      } else {
        await log(p.id, `K faktúre je vystavený dobropis ${inv.invoice_number}. Faktúra je „${p.status}" — ak je zaplatená, peniaze treba vrátiť.`,
          { action: 'cancel', ok: true, credit_note_id: inv.id }, actor);
      }
    }

    return ok({ sf_invoice_id: doc.id, sf_number: doc.number || null, check: rec.ok ? 'ok' : 'mismatch',
      check_note: rec.ok ? undefined : note, adopted: adopted || undefined });
  }

  // ── pdf ────────────────────────────────────────────────────────────────
  /**
   * @param {{ force?:boolean, actor?:string, purpose?:string }} o
   *   purpose 'send' = PDF na odoslanie z našej schránky — ide z rezervy na
   *   odosielanie, nie z rozpočtu synchronizácie. Inak je to čítanie (sync).
   */
  async function pdf(invoiceId, { force, actor, purpose } = {}) {
    const ctx = await loadInvoice(invoiceId);
    if (!ctx) return no(404, 'Faktúra neexistuje.');
    const { inv, partner } = ctx;
    if (!inv.sf_invoice_id || !inv.sf_token) return no(409, 'Faktúra ešte nie je vystavená v SuperFaktúre.');
    const bad = envMismatch(inv); if (bad) return bad;

    const sign = async (path, name) => {
      const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(path, 600, { download: name });
      if (error) throw new Error('Odkaz na PDF sa nepodarilo vytvoriť: ' + error.message);
      return data && data.signedUrl;
    };

    if (!force) {
      const { data: rows } = await supabase.from('danubra_archive').select('*').eq('invoice_id', inv.id).is('archived_at', null)
        .order('created_at', { ascending: false }).limit(1);
      const r = (rows || [])[0];
      if (r) return ok({ url: await sign(r.storage_path, r.file_name), archive_id: r.id, file_name: r.file_name, storage_path: r.storage_path, cached: true });
    }

    const lang = SF.sfLang(partner.invoice_language || partner.language, 'deu');
    const t0 = Date.now();
    let file;
    try {
      file = await request(`/${lang}/invoices/pdf/${inv.sf_invoice_id}/token:${inv.sf_token}`,
        { read: true, binary: true, kind: purpose === 'send' ? 'write' : 'sync', action: 'pdf' });
    } catch (e) {
      const err = e instanceof SfError ? e : new SfError({ message: e.message });
      await log(inv.id, `PDF zo SuperFaktúry sa nepodarilo stiahnuť — ${err.message}`, { action: 'pdf', ok: false, code: err.code }, actor);
      return fromErr(err);
    }
    const credit = SF.isCreditNote(inv);
    const meta = { kind: credit ? 'storno' : 'rechnung', title: credit ? 'Stornorechnung' : 'Rechnung',
      number: inv.invoice_number, who: partner.name, partner_id: inv.partner_id || null,
      subcontract_id: inv.subcontract_id || null, date: todaySk() };
    const fileName = Archive.fileName(meta);
    const path = Archive.storagePath(meta);
    const up = await supabase.storage.from(DOCS_BUCKET).upload(path, file.buffer, { contentType: 'application/pdf', upsert: false });
    if (up && up.error) throw new Error('PDF sa nepodarilo uložiť do Dokumentov: ' + up.error.message);
    const { data: row, error } = await supabase.from('danubra_archive').insert({
      kind: meta.kind, title: meta.title, number: inv.invoice_number || null, file_name: fileName, storage_path: path,
      size_bytes: file.buffer.length, lang: ['slo', 'cze'].includes(lang) ? 'sk' : 'de',
      partner_id: meta.partner_id, subcontract_id: meta.subcontract_id, invoice_id: inv.id,
    }).select().single();
    if (error) throw new Error('PDF je v úložisku, ale nezapísalo sa do Dokumentov: ' + error.message);
    await log(inv.id, `PDF zo SuperFaktúry uložené do Dokumentov (${fileName}).`,
      { action: 'pdf', ok: true, bytes: file.buffer.length, ms: Date.now() - t0 }, actor);
    return ok({ url: await sign(path, fileName), archive_id: row && row.id, file_name: fileName, storage_path: path });
  }

  // ── send ───────────────────────────────────────────────────────────────
  function sendable(inv) {
    const neverSent = inv.status === 'overdue' && !inv.sent_at && !inv.sf_sent_at;
    if (inv.status !== 'issued' && !neverSent) {
      return no(409, `Odoslať sa dá len vystavená faktúra. Táto je „${inv.status}".`);
    }
    if (inv.sf_check === 'mismatch') {
      return no(409, 'Faktúra nesúhlasí so SuperFaktúrou — neodošle sa.',
        { hint: (inv.sf_check_note || '') + ' Skontrolujte doklad v SuperFaktúre a dajte vedieť administrátorovi.' });
    }
    return null;
  }

  async function send(invoiceId, { cc, actor } = {}) {
    const ctx = await loadInvoice(invoiceId);
    if (!ctx) return no(404, 'Faktúra neexistuje.');
    const { inv, partner } = ctx;
    const stop = sendable(inv); if (stop) return stop;
    if (!inv.sf_invoice_id) return no(409, 'Faktúra nemá id v SuperFaktúre.');
    const bad = envMismatch(inv); if (bad) return bad;
    const to = String(partner.email || '').trim();
    if (!to) return no(409, 'Odberateľ nemá e-mail.', { hint: 'Doplňte e-mail na karte odberateľa.' });
    if (!EMAIL.test(to)) return no(409, `E-mail odberateľa „${to}" nie je platný.`, { hint: 'Opravte ho na karte odberateľa.' });
    const { sf: settings } = await loadSettings();
    const copy = [...new Set([...emails(cc), ...emails(settings.cc)])];
    const badCc = copy.find(e => !EMAIL.test(e));
    if (badCc) return no(400, `Kópia „${badCc}" nie je platný e-mail.`);

    const lang = SF.sfLang(partner.invoice_language || partner.language, settings.default_language || 'deu');
    const t = SF.txt(lang);
    const credit = SF.isCreditNote(inv);
    const t0 = Date.now();
    try {
      await request('/invoices/send', W('send', { body: { Email: {
        invoice_id: Number(inv.sf_invoice_id) || inv.sf_invoice_id, to, cc: copy, bcc: [],
        subject: credit ? t.subjectCn(inv.invoice_number) : t.subject(inv.invoice_number),
        message: credit ? t.messageCn : t.message, pdf_language: lang,
      } } }));
    } catch (e) {
      const err = e instanceof SfError ? e : new SfError({ message: e.message });
      await patchInvoice(inv.id, { sf_error: err.message.slice(0, 2000) }).catch(() => {});
      await log(inv.id, `Odoslanie cez SuperFaktúru zlyhalo — ${err.message}`, { action: 'send', ok: false, code: err.code, uncertain: err.uncertain }, actor);
      return fromErr(err);
    }
    const now = new Date().toISOString();
    const patch = { sent_at: now, sf_sent_at: now, sf_synced_at: now, sf_error: null };
    if (inv.status === 'issued') patch.status = 'sent';
    if (inv.sf_status !== 'paid' && inv.sf_status !== 'partial') patch.sf_status = 'sent';
    const { error } = await supabase.from('danubra_invoices').update(patch).eq('id', inv.id);
    if (error) throw new Error('Faktúra odišla, ale stav sa nezapísal: ' + error.message);
    await log(inv.id, `Odoslaná cez SuperFaktúru na ${to}${copy.length ? ` (kópia ${copy.join(', ')})` : ''}.`,
      { action: 'send', ok: true, to, cc: copy, ms: Date.now() - t0 }, actor);
    return ok({ sent_to: to, cc: copy });
  }

  /** Odoslané z našej schránky (Správy) — zapíše sa stav a SuperFaktúra sa to dozvie. */
  async function markSent(invoiceId, { to, actor } = {}) {
    const ctx = await loadInvoice(invoiceId);
    if (!ctx) return no(404, 'Faktúra neexistuje.');
    const { inv, partner } = ctx;
    const stop = sendable(inv); if (stop) return stop;
    const adr = String(to || partner.email || '').trim();
    const now = new Date().toISOString();
    const patch = { sent_at: now, sf_sent_at: inv.sf_invoice_id ? now : null };
    if (inv.status === 'issued') patch.status = 'sent';
    if (inv.sf_invoice_id && !['paid', 'partial'].includes(inv.sf_status)) patch.sf_status = 'sent';
    let sfNote = '';
    if (inv.sf_invoice_id && !envMismatch(inv)) {
      try {
        await request('/invoices/mark_as_sent', W('mark_sent', { body: { InvoiceEmail: { invoice_id: Number(inv.sf_invoice_id) || inv.sf_invoice_id,
          email: adr, subject: SF.txt('deu').subject(inv.invoice_number), message: 'DANUBRA Hub' } } }));
      } catch (e) { sfNote = ' SuperFaktúra si „odoslaná" nezapísala — v appke je to zapísané.'; }
    }
    const { error } = await supabase.from('danubra_invoices').update(patch).eq('id', inv.id);
    if (error) throw new Error(error.message);
    await log(inv.id, `Odoslaná z našej schránky${adr ? ` na ${adr}` : ''}.${sfNote}`, { action: 'mark_sent', ok: true, channel: 'mail' }, actor);
    return ok({ sent_to: adr || null });
  }

  // ── pay ────────────────────────────────────────────────────────────────
  async function pay(invoiceId, { actor } = {}) {
    const ctx = await loadInvoice(invoiceId);
    if (!ctx) return no(404, 'Faktúra neexistuje.');
    const { inv } = ctx;
    if (SF.isCreditNote(inv)) return no(409, 'Dobropis sa neuhrádza — peniaze sa vracajú zo samostatnej platby.');
    const onlySf = inv.status === 'paid' && inv.sf_invoice_id && !inv.sf_paid_at;
    if (!OPEN.includes(inv.status) && !onlySf) {
      return no(409, `Uhradiť sa dá vystavená faktúra, nie „${inv.status}".`);
    }
    const now = new Date().toISOString();
    const patch = { sf_synced_at: now, sf_error: null };
    if (!onlySf) Object.assign(patch, { status: 'paid', paid_at: now });

    if (inv.sf_invoice_id) {
      const bad = envMismatch(inv); if (bad) return bad;
      try {
        // Najprv sa pozrie, čo už v SuperFaktúre zapísané je — úhrada sa nezapíše dvakrát.
        const doc = SF.readInvoice(await request(`/invoices/view/${inv.sf_invoice_id}.json`, W('pay', { read: true })));
        const total = SF.expectedCents(inv);
        const paid = doc.paidCents || 0;
        const left = total - paid;
        if (left > 0) {
          await request('/invoice_payments/add/ajax:1/api:1', W('pay', { body: { InvoicePayment: {
            invoice_id: Number(inv.sf_invoice_id) || inv.sf_invoice_id, payment_type: 'transfer',
            amount: Number(M.toNumeric(left)), currency: inv.currency || 'EUR',
            created: String(inv.paid_at || '').slice(0, 10) || todaySk(),
          } } }));
        }
        Object.assign(patch, { sf_paid_at: now, sf_paid_amount: M.toNumeric(total), sf_status: 'paid' });
        await log(inv.id, left > 0 ? `Úhrada ${M.format(left)} zapísaná do SuperFaktúry.` : 'V SuperFaktúre už bola faktúra uhradená — nič sa nezapisovalo.',
          { action: 'pay', ok: true, amount: M.toNumeric(Math.max(left, 0)) }, actor);
      } catch (e) {
        const err = e instanceof SfError ? e : new SfError({ message: e.message });
        await log(inv.id, `Úhradu sa nepodarilo zapísať do SuperFaktúry — ${err.message}`, { action: 'pay', ok: false, code: err.code }, actor);
        return fromErr(err);
      }
    }
    const { error } = await supabase.from('danubra_invoices').update(patch).eq('id', inv.id);
    if (error) throw new Error(error.message);
    if (!inv.sf_invoice_id) await log(inv.id, 'Označená ako zaplatená (faktúra nie je v SuperFaktúre).', { action: 'pay', ok: true }, actor);
    return ok({ only_sf: onlySf || undefined });
  }

  // ── sync ───────────────────────────────────────────────────────────────
  /**
   * Stav jednej faktúry podľa SuperFaktúry. Mení sa len to, čo je isté:
   * úplná úhrada (a Banka ju ešte nespárovala) → zaplatená. Všetko ostatné
   * sa len zapíše do histórie, raz pri každej zmene.
   */
  async function syncOne(inv, { actor, today = todaySk(now()), doc: given } = {}) {
    const changes = [];
    // Doklad už načítaný zo zoznamu (syncAll) = žiadna ďalšia požiadavka.
    const doc = given || SF.readInvoice(await request(`/invoices/view/${inv.sf_invoice_id}.json`, { read: true, kind: 'sync', action: 'sync' }));
    const state = SF.paymentState(doc, today);
    const patch = { sf_synced_at: now().toISOString() };
    const app = SF.expectedCents(inv);

    if (doc.totalCents != null && doc.totalCents !== app) {
      const text = `Suma v SuperFaktúre je ${M.format(doc.totalCents)}, v appke ${M.format(app)}.`;
      if (inv.sf_check !== 'mismatch' || inv.sf_check_note !== text) {
        Object.assign(patch, { sf_check: 'mismatch', sf_check_note: text, sf_total: M.toNumeric(doc.totalCents) });
        await log(inv.id, `Nesúhlasí so SuperFaktúrou: ${text}`, { action: 'sync', ok: false, problem: 'total' }, actor, 'alert');
        await alertTask(inv, text);
        changes.push('mismatch');
      }
    }

    const paidCents = doc.paidCents || 0;
    const sfStatus = state === 'paid' ? 'paid' : state === 'partial' ? 'partial' : state === 'overdue' ? 'overdue'
      : (doc.sent || inv.sf_sent_at ? 'sent' : 'issued');
    const prevPaid = inv.sf_paid_amount != null ? M.toCents(inv.sf_paid_amount) : null;

    if (state === 'paid' && inv.status !== 'paid' && !SF.isCreditNote(inv)) {
      // Spárovala to už Banka? Potom o úhrade rozhodla ona (a faktúru označila spúšťač).
      const { data: tx } = await supabase.from('danubra_bank_transactions').select('id')
        .eq('matched_invoice_id', inv.id).neq('match_status', 'ignored').limit(1);
      if (tx && tx.length) {
        await log(inv.id, 'SuperFaktúra hlási úhradu a Banka platbu už spárovala — stav sa nemení.', { action: 'sync', ok: true, bank: true }, actor);
        changes.push('bank');
      } else if (OPEN.includes(inv.status)) {
        Object.assign(patch, { status: 'paid', paid_at: doc.paidOn ? `${doc.paidOn}T12:00:00Z` : new Date().toISOString(),
          sf_paid_at: new Date().toISOString() });
        await log(inv.id, `Zaplatená podľa SuperFaktúry (${M.format(paidCents)}${doc.paidOn ? `, ${doc.paidOn}` : ''}).`,
          { action: 'sync', ok: true, paid: M.toNumeric(paidCents) }, actor);
        changes.push('paid');
      }
    } else if (state === 'partial' && prevPaid !== paidCents) {
      await log(inv.id, `V SuperFaktúre je čiastočná úhrada ${M.format(paidCents)} z ${M.format(app)}. Stav faktúry sa nemení — o čiastočnej platbe rozhodne človek.`,
        { action: 'sync', ok: true, partial: M.toNumeric(paidCents) }, actor);
      changes.push('partial');
    } else if (state !== 'paid' && inv.status === 'paid' && inv.sf_status !== sfStatus) {
      await log(inv.id, 'V appke je faktúra zaplatená, v SuperFaktúre úhrada chýba. Zapíšte ju tlačidlom „Zapísať úhradu do SuperFaktúry".',
        { action: 'sync', ok: true, problem: 'sf_unpaid' }, actor);
      changes.push('sf_unpaid');
    }
    if (doc.sent && !inv.sent_at && !inv.sf_sent_at && inv.status === 'issued') {
      await log(inv.id, 'SuperFaktúra hlási, že faktúra odišla e-mailom, appka to nemá zapísané. Stav sa nemení — skontrolujte to.',
        { action: 'sync', ok: true, problem: 'sent_outside' }, actor);
      changes.push('sent_outside');
    }
    if (state === 'paid' && inv.status === 'paid' && !inv.sf_paid_at) patch.sf_paid_at = new Date().toISOString();
    patch.sf_status = sfStatus;
    patch.sf_paid_amount = M.toNumeric(paidCents);
    await patchInvoice(inv.id, patch);
    return { id: inv.id, number: inv.invoice_number, state, changes };
  }

  async function sync(invoiceId, { actor } = {}) {
    const ctx = await loadInvoice(invoiceId);
    if (!ctx) return no(404, 'Faktúra neexistuje.');
    const { inv } = ctx;
    if (!inv.sf_invoice_id) return no(409, 'Faktúra nie je v SuperFaktúre — nie je čo synchronizovať.');
    const bad = envMismatch(inv); if (bad) return bad;
    try {
      return ok({ result: await syncOne(inv, { actor }) });
    } catch (e) {
      const err = e instanceof SfError ? e : new SfError({ message: e.message });
      await log(inv.id, `Synchronizácia so SuperFaktúrou zlyhala — ${err.message}`, { action: 'sync', ok: false, code: err.code }, actor);
      return fromErr(err);
    }
  }

  /**
   * Všetky faktúry v SuperFaktúre (toto prostredie), ktoré ešte nie sú
   * uzavreté na oboch stranách — šetrne k dennému limitu:
   *
   *   1. Faktúra synchronizovaná za posledných 20 h sa preskočí (okrem `force`).
   *   2. Doklady sa čítajú zo zoznamu /invoices/index.json — 100 na jednu
   *      požiadavku, len od najstaršieho dátumu vystavenia, ktorý treba.
   *      Stránkuje sa, kým sa nenájdu všetky hľadané.
   *   3. /invoices/view (1 požiadavka na faktúru) len pre doklad, ktorý
   *      v zozname nebol alebo mu chýba suma.
   *   4. Keď sa minie rozpočet synchronizácie, beh skončí; zvyšok počká na zajtra
   *      (najdlhšie nesynchronizované idú prvé).
   *
   * @param {{ actor?:string, force?:boolean, limit?:number, freshHours?:number }} o
   */
  async function syncAll({ actor, force = false, limit = 1000, freshHours = FRESH_HOURS } = {}) {
    const { data, error } = await supabase.from('danubra_invoices').select('*')
      .not('sf_invoice_id', 'is', null).eq('sf_environment', env)
      .in('status', [...OPEN, 'paid']).limit(1000);
    if (error) throw new Error('Databáza: ' + error.message);
    const open = (data || []).filter(i => (i.kind || 'invoice') === 'invoice' && !(i.status === 'paid' && i.sf_status === 'paid'));
    const t = now().getTime();
    const isFresh = (i) => { const s = Date.parse(i.sf_synced_at || ''); return Number.isFinite(s) && t - s < freshHours * 3600 * 1000; };
    const fresh = force ? [] : open.filter(isFresh);
    // Najdlhšie nesynchronizované prvé — keď sa minie rozpočet, dostanú sa na rad zajtra ostatné.
    const at = (i) => { const s = Date.parse(i.sf_synced_at || ''); return Number.isFinite(s) ? s : 0; };
    const list = open.filter(i => force || !isFresh(i)).sort((a, b) => at(a) - at(b)).slice(0, limit);
    const out = { checked: 0, paid: 0, partial: 0, mismatch: 0, skipped_recent: fresh.length, pending: 0,
      requests: 0, pages: 0, views: 0, budget_stopped: false, errors: [] };
    const sent0 = stats.sent;
    const finish = async (extra = {}) => {
      out.requests = stats.sent - sent0;
      return ok({ ...out, ...extra, usage: await budget.read() });
    };
    if (!list.length) return finish();

    // Rozpočet na tento beh: čo dnes synchronizácii zostáva.
    const u0 = await budget.read();
    if (u0.available === false) {
      return no(503, Budget.UNAVAILABLE.message, { code: 'budget', hint: Budget.UNAVAILABLE.hint, ...out, pending: list.length });
    }
    if (u0.sync_remaining <= 0) {
      return no(429, budget.message('sync', u0.used), { code: 'budget', hint: budget.hint('sync'), ...out, pending: list.length, usage: u0 });
    }

    // ── 1. Zoznam: veľa dokladov jednou požiadavkou ────────────────────────
    const want = new Set(list.map(i => String(i.sf_invoice_id)));
    const docs = new Map();
    const dates = list.map(i => String(i.issue_date || '').slice(0, 10));
    const today = todaySk(now());
    const range = dates.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
      ? `/created:3/created_since:${dates.reduce((a, b) => (a < b ? a : b))}/created_to:${dates.reduce((a, b) => (a > b ? a : b), today)}`
      : '/created:0';
    let stop = null;         // auth / rate_limit / budget → ďalšie by dopadli rovnako
    for (let page = 1, pages = 1; page <= pages && page <= MAX_PAGES && docs.size < want.size; page++) {
      let json;
      try {
        json = await request(`/invoices/index.json/listinfo:1/per_page:${PER_PAGE}/page:${page}/type:regular${range}`,
          { read: true, kind: 'sync', action: 'sync' });
      } catch (e) {
        if (e.code === 'budget') { out.budget_stopped = true; stop = e; break; }
        // Zoznam SuperFaktúra nepozná alebo mu nerozumieme → doklady po jednom (view).
        if (e.code === 'not_found' || e.code === 'bad_response' || e.code === 'validation') break;
        out.errors.push(`zoznam faktúr: ${e.message}`);
        stop = e;
        break;
      }
      out.pages++;
      const L = SF.readList(json);
      for (const d of L.items) if (d.id != null && want.has(String(d.id))) docs.set(String(d.id), d);
      pages = L.pageCount != null ? L.pageCount : (L.items.length >= PER_PAGE ? page + 1 : page);
    }

    // ── 2. Zápis; view len kde zoznam nestačil ─────────────────────────────
    for (const inv of list) {
      let doc = docs.get(String(inv.sf_invoice_id));
      if (!doc || doc.totalCents == null) {
        if (stop) { out.pending++; continue; }
        try {
          doc = SF.readInvoice(await request(`/invoices/view/${inv.sf_invoice_id}.json`, { read: true, kind: 'sync', action: 'sync' }));
          out.views++;
        } catch (e) {
          if (e.code === 'budget') { out.budget_stopped = true; stop = e; out.pending++; continue; }
          out.errors.push(`${inv.invoice_number || inv.id}: ${e.message}`);
          if (e.code === 'auth' || e.code === 'rate_limit') stop = e;   // ďalšie by dopadli rovnako
          continue;
        }
      }
      try {
        const r = await syncOne(inv, { actor, doc });
        out.checked++;
        if (r.changes.includes('paid')) out.paid++;
        if (r.changes.includes('partial')) out.partial++;
        if (r.changes.includes('mismatch')) out.mismatch++;
      } catch (e) {
        out.errors.push(`${inv.invoice_number || inv.id}: ${e.message}`);
      }
    }
    return finish(out.budget_stopped ? { message: stop ? stop.message : budget.message('sync', u0.used), hint: budget.hint('sync') } : {});
  }

  /** Dnešné počítadlo požiadaviek (len databáza, do SuperFaktúry nič nejde). */
  async function usage() { return budget.read(); }
  /** Denná synchronizácia z cronu len raz za deň. */
  async function claimDailySync() { return budget.claimCron(); }

  // ── cancel (dobropis) ──────────────────────────────────────────────────
  /**
   * Pripraví dobropis k vystavenej faktúre. Dobropis vznikne ako
   * **čakajúci na schválenie** — vystaví sa v SuperFaktúre až po schválení
   * adminom, rovnako ako každá faktúra. Pôvodná faktúra sa nemení, kým
   * dobropis nie je vystavený.
   */
  async function cancel(invoiceId, { reason, actor } = {}) {
    const why = String(reason || '').trim();
    if (why.length < 10) return no(400, 'Napíšte dôvod dobropisu (aspoň 10 znakov).', { hint: 'Dôvod sa zapíše na doklad aj do histórie.' });
    const ctx = await loadInvoice(invoiceId);
    if (!ctx) return no(404, 'Faktúra neexistuje.');
    const { inv, partner } = ctx;
    if (SF.isCreditNote(inv)) return no(409, 'Dobropis sa nestornuje ďalším dobropisom.');
    if (!inv.sf_invoice_id) {
      return no(409, 'Faktúra nie je vystavená v SuperFaktúre.', { hint: 'Návrh alebo schválenú faktúru stornujete priamo v appke — dobropis netreba.' });
    }
    const bad = envMismatch(inv); if (bad) return bad;
    if (![...OPEN, 'paid'].includes(inv.status)) return no(409, `K faktúre v stave „${inv.status}" sa dobropis nerobí.`);
    const { data: ex } = await supabase.from('danubra_invoices').select('id,invoice_number,status')
      .eq('parent_invoice_id', inv.id).eq('kind', 'credit_note').neq('status', 'cancelled').limit(1);
    if (ex && ex.length) return no(409, `K faktúre už je dobropis ${ex[0].invoice_number || ''} („${ex[0].status}").`.replace(/\s+\(/, ' ('));

    const { data: num, error: ne } = await supabase.rpc('danubra_next_number', { p_kind: 'invoice' });
    if (ne || !num) throw new Error('Číslo dobropisu sa nepodarilo prideliť: ' + (ne ? ne.message : 'prázdne'));

    // Položky ako na pôvodnom doklade, so záporným množstvom.
    const { sf: settings } = await loadSettings();
    const lang = SF.sfLang(partner.invoice_language || partner.language, settings.default_language || 'deu');
    const src = ctx.items.length ? ctx.items.map(i => ({ description: i.description, quantity: Number(i.quantity) || 0, unit: i.unit, unit_price: i.unit_price }))
      : SF.buildItems({ invoice: inv, subcontract: ctx.subcontract, period: ctx.period, lang })
        .map(i => ({ description: i.description ? `${i.name} — ${i.description}` : i.name, quantity: i.quantity, unit: i.unit, unit_price: i.unit_price }));
    const rows = src.map(i => {
      const price = M.toCents(i.unit_price || 0);
      const q = -Math.abs(Number(i.quantity) || 0);
      return { description: String(i.description || '').slice(0, 250), quantity: q, unit: i.unit || 'ks',
        unit_price: M.toNumeric(price), total: M.toNumeric(M.mul(price, q)) };
    });
    const total = -SF.expectedCents(inv);
    const dnes = todaySk();
    const { data: cn, error } = await supabase.from('danubra_invoices').insert({
      kind: 'credit_note', parent_invoice_id: inv.id, cancel_reason: why,
      invoice_number: num, partner_id: inv.partner_id, subcontract_id: inv.subcontract_id || null,
      contract_id: inv.contract_id || null, type: inv.type || 'standard',
      issue_date: dnes, delivery_date: inv.delivery_date || dnes, due_date: null,
      billing_period_from: inv.billing_period_from || null, billing_period_to: inv.billing_period_to || null,
      total: M.toNumeric(total), amount_net: M.toNumeric(total), withholding_pct: 0, withholding_amount: 0,
      currency: inv.currency || 'EUR', vat_regime: inv.vat_regime, status: 'pending_approval',
      created_by: actor || null,
    }).select().single();
    if (error) {
      if (/idx_dinv_one_credit_note|duplicate/i.test(error.message)) return no(409, 'K faktúre už je dobropis.');
      throw new Error('Dobropis sa nepodarilo založiť: ' + error.message);
    }
    if (rows.length) {
      const { error: ie } = await supabase.from('danubra_invoice_items').insert(rows.map(r => ({ ...r, invoice_id: cn.id })));
      if (ie) await log(cn.id, `Položky dobropisu sa nezapísali (${ie.message}) — doklad pôjde s jednou položkou na celú sumu.`, { action: 'cancel', ok: false }, actor);
    }
    await log(inv.id, `Pripravený dobropis ${num} na ${M.format(-total)}. Dôvod: ${why}. Čaká na schválenie adminom, potom sa vystaví v SuperFaktúre.`,
      { action: 'cancel', ok: true, credit_note_id: cn.id }, actor);
    await log(cn.id, `Dobropis k faktúre ${inv.invoice_number}. Dôvod: ${why}.`, { action: 'cancel', ok: true, parent_id: inv.id }, actor);
    return ok({ credit_note_id: cn.id, invoice_number: num });
  }

  return { env, base, config, request, ping, issue, pdf, send, markSent, pay, sync, syncAll, cancel, usage, claimDailySync,
    stats, limits: budget.limits, SfError };
}

module.exports = { createService, SfError, issuingNow, todaySk, ISSUING, UNCERTAIN,
  authHeader, classifyError, redact, summarize, HINT };
