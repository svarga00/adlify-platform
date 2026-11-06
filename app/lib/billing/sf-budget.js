// ============================================================================
// DANUBRA — SuperFaktúra: denný limit požiadaviek (migrácia 093)
// ============================================================================
// Len Node (sf-service.js, denný cron). Účet SuperFaktúry má tvrdý limit
// požiadaviek na deň (PUNDS: 1000) a 30 000 na mesiac. Keď sa minie,
// SuperFaktúra ďalšie odmieta — a vtedy by nešlo vystaviť ani odoslať faktúru.
//
// Pravidlá:
//
//   1. Každá požiadavka, ktorá naozaj odíde do SuperFaktúry (aj opakovaný
//      pokus), sa najprv **zarezervuje** v databáze (danubra_sf_usage, RPC
//      danubra_sf_usage_take). Keď rezerva nevyjde, požiadavka neodíde.
//      Rezervácia je jeden príkaz `insert … on conflict do update … where`,
//      takže ani dve funkcie naraz limit neprekročia.
//   2. Strop = SF_DAILY_LIMIT − SF_SAFETY_MARGIN (predvolene 1000 − 50 = 950).
//   3. Synchronizácia, PDF a ostatné čítanie (druh `sync`) smie najviac
//      SF_SYNC_BUDGET za deň (300) a nikdy nesmie siahnuť na posledných
//      SF_WRITE_RESERVE (100) pod stropom. Vystavenie, odoslanie, úhrada,
//      test spojenia (druh `write`) majú zvyšok — vždy aspoň strop − 300.
//   4. Deň je kalendárny deň v Europe/Bratislava. SuperFaktúra v hlavičke
//      X-RateLimit-DailyReset píše „24.12.2030 00:00:00" bez časového pásma;
//      ako slovenská služba zrejme počíta podľa slovenského času. Hlavičky
//      X-RateLimit-DailyRemaining / MonthlyRemaining sa preto pri každej
//      odpovedi zapíšu a platí prísnejšie z oboch počítadiel (naše a jej).
//   5. Kým sa počítadlo nedá overiť (chýba migrácia 093, databáza neodpovedá),
//      do SuperFaktúry nejde nič. Radšej nevystaviť dnes, než zablokovať účet.
//
// Testy: node app/tests/sf-limit.test.js
// ============================================================================

const TABLE = 'danubra_sf_usage';

/** Dnešný deň na Slovensku (server beží v UTC — po polnoci by bol včerajšok). */
function todaySk(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const g = (t) => p.find(x => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

function int(v, d, min = 0) {
  if (v === undefined || v === null || String(v).trim() === '') return d;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min ? n : d;
}

/** Limity z premenných prostredia (s predvolenými hodnotami). */
function limits(env = {}) {
  const limit = int(env.SF_DAILY_LIMIT, 1000, 1);
  const margin = Math.min(int(env.SF_SAFETY_MARGIN, 50, 0), limit - 1);
  const hard = limit - margin;
  const sync = Math.min(int(env.SF_SYNC_BUDGET, 300, 0), hard);
  const writeReserve = Math.min(int(env.SF_WRITE_RESERVE, 100, 0), hard);
  // Synchronizácia sa zastaví aj vtedy, keby jej vlastný rozpočet ešte zostal,
  // ale celkovo by siahla na rezervu pre vystavovanie.
  return { limit, margin, hard, sync, writeReserve, syncCap: Math.max(0, hard - writeReserve) };
}

const kindOf = (k) => (k === 'sync' ? 'sync' : 'write');

/** Riadok danubra_sf_usage → stav pre obrazovku (bez tajomstiev). */
function summarize(row, L, day) {
  const r = row || {};
  const by = (r.by_kind && typeof r.by_kind === 'object') ? r.by_kind : {};
  const ours = int(r.used, 0);
  const sfUsed = r.sf_used != null ? int(r.sf_used, 0) : null;
  const used = Math.max(ours, sfUsed || 0);
  const syncUsed = int(by.sync, 0);
  const writeUsed = int(by.write, 0);
  const blocked = !!r.blocked_at;
  return {
    available: true, day,
    limit: L.limit, hard_cap: L.hard, margin: L.margin,
    used, counted: ours, sf_used: sfUsed, sf_limit: r.sf_limit != null ? int(r.sf_limit, null) : null,
    sf_reset: r.sf_reset || null,
    remaining: blocked ? 0 : Math.max(0, L.hard - used),
    sync_used: syncUsed, sync_budget: L.sync,
    sync_remaining: blocked ? 0 : Math.max(0, Math.min(L.sync - syncUsed, L.syncCap - used)),
    write_used: writeUsed, write_reserve: L.writeReserve,
    blocked, cron_sync_at: r.cron_sync_at || null,
  };
}

/**
 * Hlavičky X-RateLimit-* z odpovede SuperFaktúry. `sf_used` je prepočet na
 * náš limit: limit − zostatok (denný alebo mesačný, ktorý je menší) — strop
 * potom drží rovnakú rezervu aj podľa jej počítadla.
 */
function readHeaders(h, L) {
  if (!h) return null;
  const get = (k) => {
    if (typeof h.get === 'function') return h.get(k);
    const f = Object.keys(h).find(x => x.toLowerCase() === k.toLowerCase());
    return f ? h[f] : null;
  };
  const n = (k) => { const v = get(k); if (v == null || String(v).trim() === '') return null; const x = Number(v); return Number.isFinite(x) ? x : null; };
  const dLimit = n('X-RateLimit-DailyLimit');
  const dLeft = n('X-RateLimit-DailyRemaining');
  const mLeft = n('X-RateLimit-MonthlyRemaining');
  const msg = get('X-RateLimit-Message');
  if (dLimit == null && dLeft == null && mLeft == null && !msg) return null;
  let left = dLeft;
  if (mLeft != null) left = left == null ? mLeft : Math.min(left, mLeft);
  return {
    sf_limit: dLimit, remaining: left, monthly_remaining: mLeft,
    sf_used: left != null ? Math.max(0, (L ? L.limit : (dLimit || 0)) - left) : null,
    reset: get('X-RateLimit-DailyReset') ? String(get('X-RateLimit-DailyReset')).slice(0, 40) : null,
    exceeded: !!(msg && String(msg).trim()) || (left != null && left <= 0),
  };
}

const NOUN = { issue: 'Vystavenie', send: 'Odoslanie', mark_sent: 'Zápis odoslania', pay: 'Zápis úhrady',
  ping: 'Test spojenia', pdf: 'Stiahnutie PDF' };

/** Veta o vyčerpanom limite. `kind` sync / write. */
function message(kind, used, limit, action) {
  const head = `Dnešný limit požiadaviek na SuperFaktúru je vyčerpaný (${used} z ${limit}).`;
  if (kindOf(kind) === 'sync') return `${head} Synchronizácia pokračuje zajtra; vystavovanie a odosielanie má vyhradenú rezervu.`;
  return `${head} ${NOUN[action] || 'Vystavenie'} skúste zajtra.`;
}
function hint(kind, L) {
  if (kindOf(kind) === 'sync') {
    return `SuperFaktúra povoľuje ${L.limit} požiadaviek denne. Synchronizácia a PDF smú najviac ${L.sync}, `
      + 'zvyšok appka drží na vystavovanie a odosielanie faktúr. Počítadlo sa vynuluje o polnoci (slovenský čas).';
  }
  return `SuperFaktúra povoľuje ${L.limit} požiadaviek denne. Appka si necháva rezervu ${L.margin}, aby SuperFaktúra `
    + 'účet nezablokovala. Počítadlo sa vynuluje o polnoci (slovenský čas).';
}
const UNAVAILABLE = {
  message: 'Počítadlo požiadaviek na SuperFaktúru nie je dostupné — požiadavka sa radšej neposlala.',
  hint: 'V databáze chýba migrácia 093 (danubra_sf_usage) alebo databáza práve neodpovedá. Kým sa počítadlo '
    + 'nedá overiť, appka do SuperFaktúry nevolá, aby neprekročila denný limit 1000 požiadaviek.',
};

const missing = (err) => !!err && (err.code === 'PGRST202' || err.code === 'PGRST205' || err.code === '42P01' || err.code === '42883'
  || /does not exist|Could not find the (function|table)|schema cache/i.test(err.message || ''));

/**
 * @param {{ supabase, env?, clock?:()=>Date }} o
 */
function createBudget({ supabase, env = process.env, clock } = {}) {
  const L = limits(env);
  const now = clock || (() => new Date());
  const day = () => todaySk(now());

  /**
   * Zarezervuje `n` požiadaviek daného druhu na dnes. Nevyjde → { ok:false }.
   * @returns {Promise<{ok:boolean, used?:number, kind_used?:number, blocked?:boolean, unavailable?:boolean, day:string}>}
   */
  async function take(kind, n = 1) {
    const k = kindOf(kind);
    const d = day();
    let res;
    try {
      res = await supabase.rpc('danubra_sf_usage_take', {
        p_day: d, p_kind: k, p_n: n,
        p_cap: k === 'sync' ? L.syncCap : L.hard,
        p_kind_cap: k === 'sync' ? L.sync : null,
      });
    } catch (e) { return { ok: false, unavailable: true, day: d, error: e.message }; }
    if (!res || res.error || !res.data) {
      return { ok: false, unavailable: true, missing: missing(res && res.error), day: d, error: res && res.error ? res.error.message : 'prázdna odpoveď' };
    }
    const r = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    return { ok: !!r.ok, used: int(r.used, 0), kind_used: int(r.kind_used, 0), blocked: !!r.blocked, day: d };
  }

  /** Stav podľa hlavičiek SuperFaktúry. Chyba zápisu nič nezastaví. */
  async function report(info) {
    if (!info) return;
    try {
      await supabase.rpc('danubra_sf_usage_report', {
        p_day: day(), p_sf_used: info.sf_used, p_sf_limit: info.sf_limit, p_reset: info.reset, p_blocked: !!info.exceeded,
      });
    } catch (e) { /* len doplnková informácia */ }
  }

  /** Dnešný stav pre obrazovku a pre rozpočet jedného behu synchronizácie. */
  async function read() {
    const d = day();
    try {
      const { data, error } = await supabase.from(TABLE).select('*').eq('day', d).maybeSingle();
      if (error) return { available: false, day: d, missing: missing(error), limit: L.limit, sync_budget: L.sync, hard_cap: L.hard };
      return summarize(data, L, d);
    } catch (e) {
      return { available: false, day: d, limit: L.limit, sync_budget: L.sync, hard_cap: L.hard };
    }
  }

  /**
   * Denná synchronizácia z cronu beží raz za deň: kto prvý zapíše
   * cron_sync_at, ten synchronizuje. Ďalší beh v ten istý deň nič nerobí.
   * @returns {Promise<{ok:boolean, reason?:string}>}
   */
  async function claimCron() {
    const d = day();
    try {
      const up = await supabase.from(TABLE).upsert({ day: d }, { onConflict: 'day', ignoreDuplicates: true });
      if (up && up.error) return { ok: false, reason: missing(up.error) ? 'missing' : 'db', error: up.error.message };
      const { data, error } = await supabase.from(TABLE).update({ cron_sync_at: now().toISOString() })
        .eq('day', d).is('cron_sync_at', null).select('day');
      if (error) return { ok: false, reason: missing(error) ? 'missing' : 'db', error: error.message };
      return Array.isArray(data) && data.length ? { ok: true } : { ok: false, reason: 'done' };
    } catch (e) { return { ok: false, reason: 'db', error: e.message }; }
  }

  return { limits: L, day, take, report, read, claimCron,
    message: (kind, used, action) => message(kind, used, L.limit, action), hint: (kind) => hint(kind, L) };
}

module.exports = { createBudget, limits, summarize, readHeaders, message, hint, todaySk, UNAVAILABLE, TABLE };
