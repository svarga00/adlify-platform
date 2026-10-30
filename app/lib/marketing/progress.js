// ============================================================================
// DANUBRA — marketing: priebeh hľadania firiem (percentá, kroky, log)
// ============================================================================
// „Šlo by niekde spraviť aj progress bar, kde by sa zobrazovalo, ako hľadanie
// prebieha?"
//
// Hľadanie podľa webov (`danubra-leads-from-urls-background`) beží na serveri
// 3–10 minút. Pri každom kroku a pod-kroku zapíše do `danubra_lead_searches`
// (080) percentá, kľúč kroku, vetu pre človeka a posledných ~50 udalostí;
// appka to číta každé 2 s a kreslí pás „Hľadanie beží".
//
//   plán krokov     kroky a ich rozsah percent — pri Google Mapách
//                   (Outscraper) iné ako pri AI s web search
//   pct             krok + podiel hotového (3 z 8) → celé percento
//   log             posledných ~50 udalostí [{ at, text }], bez opakovania
//   reporter        zápis priebehu s obmedzením (najviac raz za ~1,5 s,
//                   pri zmene kroku hneď), heartbeat pri každom zápise,
//                   kontrola „Zastaviť" (cancel_requested) najviac raz za ~3 s
//   pre appku       model pásu: percentá, kroky (hotové / práve / ešte nie),
//                   ako dlho beží, či sa hľadanie zrejme neprerušilo
//
// Čisté funkcie bez siete a databázy — zápis a čítanie sa podstrčia.
// Testy: node app/lib/marketing/progress.test.js
// ============================================================================
(function () {
  const MAX_LOG = 50;
  const WRITE_MS = 1500;
  const CANCEL_MS = 3000;
  /** Beží, ale neozvalo sa dlhšie ako 3 min → zrejme sa prerušilo. */
  const STALE_MS = 3 * 60 * 1000;
  /** Bez heartbeat (pred 080): Netlify funkciu na pozadí zastaví po 15 min. */
  const STALE_NO_HEARTBEAT_MS = 16 * 60 * 1000;

  // [kľúč, od %, do %, názov kroku v zozname]
  const PLANS = {
    outscraper: [
      ['read_seeds', 0, 10, 'Weby zadaných firiem'],
      ['plan', 10, 15, 'Plán hľadania (AI)'],
      ['maps', 15, 55, 'Google Mapy'],
      ['filter', 55, 60, 'Vyradenie nevhodných'],
      ['impressum', 60, 80, 'Impressum firiem'],
      ['score', 80, 92, 'Hodnotenie podobnosti (AI)'],
      ['contacts', 92, 97, 'Kontakty a e-maily'],
      ['save', 97, 100, 'Uloženie'],
    ],
    ai: [
      ['read_seeds', 0, 12, 'Weby zadaných firiem'],
      ['web', 12, 60, 'AI hľadá na webe'],
      ['filter', 60, 62, 'Vyradenie nevhodných'],
      ['impressum', 62, 95, 'Impressum firiem'],
      ['save', 95, 100, 'Uloženie'],
    ],
  };
  const END = { done: 'Hotovo', cancelled: 'Zastavené', error: 'Chyba' };

  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const cut = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
  function plural(n, one, few, many) {
    const x = Math.abs(Math.trunc(num(n)));
    return x === 1 ? one : x >= 2 && x <= 4 ? few : many;
  }

  /** Kroky hľadania podľa zdroja: [{ key, from, to, label }]. */
  function plan(source) {
    return (PLANS[source] || PLANS.outscraper).map(([key, from, to, label]) => ({ key, from, to, label }));
  }

  /** Odkiaľ hľadanie berie firmy (z riadku hľadania). */
  function sourceOf(s) {
    if (!s) return 'outscraper';
    if (s.source === 'ai' || s.source === 'outscraper') return s.source;
    if (s.stats && s.stats.source) return s.stats.source === 'ai' ? 'ai' : 'outscraper';
    return s.params && s.params.outscraper === false ? 'ai' : s.params && s.params.outscraper ? 'outscraper' : 'outscraper';
  }

  /**
   * Percento z kroku a podielu hotového. `frac` 0–1, alebo [hotové, spolu].
   * Neznámy krok → null; 'done' → 100.
   */
  function pct(stage, frac = 0, source = 'outscraper') {
    if (stage === 'done') return 100;
    const st = plan(source).find(x => x.key === stage);
    if (!st) return null;
    let f = frac;
    if (Array.isArray(frac)) f = num(frac[1]) > 0 ? num(frac[0]) / num(frac[1]) : 0;
    f = clamp(num(f), 0, 1);
    return Math.round(st.from + (st.to - st.from) * f);
  }

  /** Pridá udalosť do logu; rovnaký text za sebou nie, najviac `max` posledných. */
  function addLog(log, text, at, max = MAX_LOG) {
    const list = Array.isArray(log) ? log.filter(x => x && x.text) : [];
    const t = cut(text, 240);
    if (!t) return list.slice(-max);
    if (list.length && list[list.length - 1].text === t) return list.slice(-max);
    const iso = at instanceof Date ? at.toISOString() : typeof at === 'number' ? new Date(at).toISOString() : (at || new Date().toISOString());
    return [...list, { at: iso, text: t }].slice(-max);
  }

  /**
   * Obmedzenie: `ready()` = áno najviac raz za `minMs` (a vždy pri force).
   * `ready` si čas zapamätá — volá sa tesne pred zápisom.
   */
  function gate({ minMs = WRITE_MS, now = () => Date.now() } = {}) {
    let last = -Infinity;
    return {
      ready(force) {
        const t = now();
        if (!force && t - last < minMs) return false;
        last = t;
        return true;
      },
      get last() { return last; },
    };
  }

  /** „Vyradené: 9 zatvorených, 12 už máme, 3 bez webu" — z počtov podľa dôvodu. */
  function filterLine(dropped) {
    const d = dropped || {};
    const parts = [
      ['closed', (n) => `${n} ${plural(n, 'zatvorená', 'zatvorené', 'zatvorených')}`],
      ['known', (n) => `${n} už máme`],
      ['no_web', (n) => `${n} bez webu`],
      ['duplicate', (n) => `${n} ${plural(n, 'duplicita', 'duplicity', 'duplicít')}`],
      ['foreign', (n) => `${n} mimo Nemecka`],
      ['optout', (n) => `${n} ${plural(n, 'odhlásená', 'odhlásené', 'odhlásených')}`],
      ['seed', (n) => `${n} ${plural(n, 'zadaná firma', 'zadané firmy', 'zadaných firiem')}`],
      ['no_name', (n) => `${n} bez mena`],
      ['low_score', (n) => `${n} s nízkym skóre`],
      ['over_count', (n) => `${n} nad zvolený počet`],
    ].filter(([k]) => num(d[k]) > 0).map(([k, f]) => f(num(d[k])));
    return parts.length ? `Vyradené: ${parts.join(', ')}` : 'Nič sa nevyradilo';
  }

  /**
   * Zápis priebehu. `write(patch)` zapíše do hľadania, `readCancel()` vráti,
   * či človek klikol „Zastaviť". Zápisy idú za sebou (nie naraz), chyba
   * zápisu hľadanie nezastaví.
   */
  function reporter({ write = async () => {}, readCancel = async () => false, now = () => Date.now(), source = 'outscraper',
    minMs = WRITE_MS, cancelMs = CANCEL_MS, maxLog = MAX_LOG } = {}) {
    const g = gate({ minMs, now });
    let cancelAt = -Infinity;
    let stopped = false;
    let dirty = false;
    let chain = Promise.resolve();
    let writes = 0;
    const st = { progress: 0, stage: 'read_seeds', stage_label: '', log: [] };
    const stamp = () => new Date(now()).toISOString();

    function send(extra) {
      const patch = { progress: st.progress, stage: st.stage, stage_label: st.stage_label, log: st.log.slice(), heartbeat_at: stamp(), ...(extra || {}) };
      dirty = false;
      writes++;
      chain = chain.then(() => write(patch)).catch(() => {});
      return chain;
    }
    function maybe(force, extra) {
      if (g.ready(force)) return send(extra);
      dirty = true;
      return chain;
    }

    const api = {
      state: st,
      get stopped() { return stopped; },
      get writes() { return writes; },
      source,
      /** Začiatok: started_at, 0 %, prvý krok. */
      start(label) {
        st.stage = plan(source)[0].key;
        st.stage_label = cut(label || 'Začínam hľadanie', 240);
        st.log = addLog(st.log, st.stage_label, now(), maxLog);
        g.ready(true);
        return send({ started_at: stamp() });
      },
      /**
       * Krok a pod-krok. `frac` 0–1 alebo [hotové, spolu]; `log` = text do logu
       * (true = rovnaký ako label). Zmena kroku sa zapíše hneď.
       */
      step(stage, { frac = 0, label, log, force = false } = {}) {
        // Krok ide len dopredu (rovnako percentá) — neskorý pod-krok staršieho
        // kroku (napr. paralelné sťahovanie) pás nevráti späť.
        const keys = plan(source).map(x => x.key);
        const late = keys.indexOf(stage) >= 0 && keys.indexOf(stage) < keys.indexOf(st.stage);
        if (late) stage = st.stage;
        const changed = stage !== st.stage;
        const p = late ? null : pct(stage, frac, source);
        if (p != null) st.progress = Math.max(st.progress, p);
        st.stage = stage;
        if (label) st.stage_label = cut(label, 240);
        const text = log === true ? label : log;
        if (text) st.log = addLog(st.log, text, now(), maxLog);
        else if (changed && label) st.log = addLog(st.log, label, now(), maxLog);
        return maybe(force || changed);
      },
      /** Len udalosť do logu (bez zmeny percent). */
      note(text, { force = false } = {}) {
        st.log = addLog(st.log, text, now(), maxLog);
        return maybe(force);
      },
      /**
       * „Žijem": pri dlhom volaní (model, Outscraper) percentá pomaly
       * pribúdajú k koncu kroku (nikdy ho nedosiahnu) a zapíše sa heartbeat.
       */
      beat() {
        const s = plan(source).find(x => x.key === st.stage);
        if (s && st.progress < s.to - 1) st.progress = Math.min(s.to - 1, st.progress + Math.max(1, Math.round((s.to - st.progress) * 0.12)));
        return maybe(false);
      },
      /** Zapíše, čo ešte čaká (po obmedzení). */
      flush() { if (dirty) { g.ready(true); return send(); } return chain; },
      /** Klikol človek „Zastaviť"? Databáza sa pýta najviac raz za `cancelMs`. */
      async checkCancel(force) {
        if (stopped) return true;
        const t = now();
        if (!force && t - cancelAt < cancelMs) return false;
        cancelAt = t;
        try { stopped = !!(await readCancel()); } catch (e) { /* bez odpovede beží ďalej */ }
        return stopped;
      },
      /** Zastaviť zvnútra (napr. test alebo chyba pri zápise). */
      markStopped() { stopped = true; },
      /** Koniec: done (100 %), cancelled alebo error — vždy sa zapíše. */
      finish(status, label) {
        st.stage = status === 'done' ? 'done' : status;
        if (status === 'done') st.progress = 100;
        st.stage_label = cut(label || END[status] || 'Hotovo', 240);
        st.log = addLog(st.log, st.stage_label, now(), maxLog);
        g.ready(true);
        return send();
      },
      /** Počká na všetky zápisy. */
      idle() { return chain; },
    };
    return api;
  }

  // ── Pre appku ─────────────────────────────────────────────────────────────
  /** „40 s", „3 min", „1 h 5 min". */
  function duration(ms) {
    const s = Math.max(0, Math.round(num(ms) / 1000));
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    return `${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  }
  const time = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : null; };

  /** Beží (alebo čaká), ale dlho sa neozvalo → zrejme sa prerušilo. */
  function isStale(s, now = Date.now(), ms = STALE_MS) {
    if (!s || !['pending', 'running'].includes(s.status)) return false;
    const hb = time(s.heartbeat_at) || time(s.started_at);
    if (hb != null) return now - hb > ms;
    const c = time(s.created_at);
    return c != null && now - c > STALE_NO_HEARTBEAT_MS;
  }

  /** Súhrn hotového hľadania: našlo, vyradené, uložené. */
  function summary(s) {
    const st = (s && s.stats) || {};
    const dropped = Object.values(st.dropped || {}).reduce((a, n) => a + num(n), 0);
    return { found: num(s && s.found), saved: num(s && s.added), dropped,
      examples: st.learning ? num(st.learning.positive) + num(st.learning.negative) : 0 };
  }

  /**
   * Model pásu „Hľadanie beží": percentá, kroky, veta, posledné riadky logu,
   * ako dlho beží, či sa neprerušilo. `pct` = null, keď server priebeh
   * nezapisuje (pred 080) — appka potom ukáže pás bez percent.
   */
  function model(s, now = Date.now(), { logLines = 4 } = {}) {
    if (!s) return null;
    const source = sourceOf(s);
    const steps = plan(source);
    const running = ['pending', 'running'].includes(s.status);
    const finished = ['done', 'cancelled', 'error'].includes(s.status);
    const hasProgress = s.progress != null || !!s.stage;
    let idx = steps.findIndex(x => x.key === s.stage);
    if (s.status === 'done' || s.stage === 'done') idx = steps.length;
    if (idx < 0 && running) idx = s.status === 'pending' ? -1 : 0;
    const pctV = s.status === 'done' ? 100 : hasProgress ? clamp(Math.round(num(s.progress)), 0, 100) : null;
    const stages = steps.map((x, i) => ({
      key: x.key, label: x.label,
      state: i < idx ? 'done' : i === idx ? (running ? 'active' : s.status === 'cancelled' ? 'stopped' : s.status === 'error' ? 'error' : 'done') : 'todo',
    }));
    const start = time(s.started_at) || time(s.created_at);
    const end = finished ? (time(s.finished_at) || time(s.heartbeat_at)) : now;
    const took = start != null && end != null ? duration(end - start) : '';
    const log = (Array.isArray(s.log) ? s.log : []).filter(x => x && x.text).slice(-logLines);
    const stale = isStale(s, now);
    return {
      id: s.id, status: s.status, source, running, finished, stale, hasProgress,
      pct: pctV, label: s.stage_label || (s.status === 'pending' ? 'Čakám, kým server hľadanie spustí' : ''),
      stages, log, elapsed: took ? (running ? `beží ${took}` : `trvalo ${took}`) : '',
      cancelRequested: !!s.cancel_requested,
      summary: finished ? summary(s) : null,
      insights: Array.isArray(s.stats && s.stats.insights) ? s.stats.insights.filter(Boolean).slice(0, 3) : [],
    };
  }

  const API = {
    MAX_LOG, WRITE_MS, CANCEL_MS, STALE_MS, STALE_NO_HEARTBEAT_MS, PLANS,
    plural, plan, sourceOf, pct, addLog, gate, filterLine, reporter, duration, isStale, summary, model,
  };
  if (typeof window !== 'undefined') window.DanubraProgress = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
