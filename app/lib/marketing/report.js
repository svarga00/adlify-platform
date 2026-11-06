// ============================================================================
// DANUBRA — Marketing: prehľad oslovovania pre vedenie (čistá logika)
// ============================================================================
// „Prehľad oslovovania pre vedenie" — koľko firiem sme našli, oslovili, kto
// reagoval, kde je záujem, stretnutia, ponuky a noví odberatelia; za obdobie,
// v porovnaní s predošlým, po týždňoch (KW), po kolegoch, remeslách,
// regiónoch, zdrojoch a hľadaniach — a čo treba riešiť teraz.
//
// Všetko sa ráta z tabuliek, ktoré už sú (bez migrácie):
//
//   danubra_leads            firma: kedy pridaná, zdroj, hľadanie, remeslá,
//                            región/PSČ, kategória (status) a kto ju zmenil
//   danubra_outreach         e-mail oslovenia: kedy, kto (sent_by), otvorenie
//                            človekom (opened_at — automatické otvorenia sú
//                            zvlášť v auto_opened_at a nepočítajú sa), klik,
//                            odpoveď, nedoručenie, odhlásenie
//   danubra_lead_contacts    hovor / stretnutie / e-mail: kto od nás
//                            (our_member_id), výsledok, dĺžka; oprava je nový
//                            riadok s corrects_id a platí namiesto pôvodného
//   danubra_activities       história kategórie („Kategória: Oslovená → Má záujem",
//                            source lead_status, created_by = kto zmenil)
//   danubra_events           stretnutia v kalendári pri firme (entity lead)
//   danubra_tasks            ďalšie kroky s firmou (úlohy pri firme)
//   danubra_lead_tips        odkazy od kolegov (meno, stav, pridaná firma)
//   danubra_lead_searches    hľadania (z ktorého hľadania firma prišla)
//
// ── Ako sa ráta „firma sa dostala do kroku" ────────────────────────────────
// Kroky: Oslovená (1) → Reagovala (2) → Záujem (3) → Stretnutie (4) →
// Ponuka (5) → Odberateľ (6). Každý dôkaz má krok, čas a kto to urobil:
//   * e-mail odoslaný → 1 (kto poslal), odpoveď človeka na e-mail → 2
//     (pripíše sa tomu, kto e-mail poslal),
//   * hovor, e-mail, stretnutie, LinkedIn zapísaný pri firme → 1; výsledok
//     Zavolať neskôr / Nemá záujem → 2, Má záujem → 3, Stretnutie dohodnuté
//     → 4, Poslať ponuku → 5; stretnutie (druh kontaktu) → 4; kontakt od
//     firmy (smer „in") → 2 (kto kontakt zapísal),
//   * zmena kategórie (história) → podľa novej kategórie (kto zmenil);
//     Ozvať sa neskôr a Nemá záujem sú tiež reakcia (2),
//   * stretnutie v kalendári pri firme → 4 (kto ho zapísal, kedy zapísal),
//   * aktuálna kategória (status_changed_at, status_changed_by) — keď
//     história chýba (staršie firmy), poistka s dátumom posledného kontaktu.
// Firma „sa dostala do kroku K" v čase najskoršieho dôkazu kroku K alebo
// vyššieho (lievik je monotónny: kto má ponuku, prešiel aj záujmom).
// Kto to urobil = autor toho najskoršieho dôkazu.
//
// ── Obdobie a porovnanie ───────────────────────────────────────────────────
// Dátumy sú miestne (Bratislava). Obdobie sa ráta do dneška (bežiaci KW či
// mesiac) a porovnáva sa s rovnako dlhým začiatkom predošlého obdobia —
// pondelok až štvrtok s pondelkom až štvrtkom, 1.–6. 11. s 1.–6. 10.
//
// Testy: node app/lib/marketing/report.test.js
// ============================================================================
(function () {
  const node = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const CAL = () => (node ? require('../calendar.js') : window.DanubraCal);
  const TR = () => (node ? require('./trades.js') : window.DanubraTrades);
  const PITCH = () => (node ? require('./pitch.js') : window.DanubraPitch);
  const SEEDS = () => { try { return node ? require('./seeds.js') : window.DanubraSeeds; } catch (e) { return null; } };

  // ── Kroky ───────────────────────────────────────────────────────────────
  /** [kľúč, rank, názov na dlaždici, názov v lieviku] */
  const STEPS = [
    ['contacted', 1, 'Oslovené', 'Oslovené'], ['replied', 2, 'Reagovali', 'Reagovali'],
    ['interested', 3, 'Záujem', 'Záujem'], ['meeting', 4, 'Stretnutia', 'Stretnutie'],
    ['offer', 5, 'Ponuky', 'Ponuka'], ['won', 6, 'Noví odberatelia', 'Odberateľ'],
  ];
  const RANK = Object.fromEntries(STEPS.map(s => [s[0], s[1]]));
  const KEY_OF_RANK = Object.fromEntries(STEPS.map(s => [s[1], s[0]]));
  /** Kategória firmy → krok (rejected je zároveň „Nemá záujem"). */
  const STATUS_RANK = { contacted: 1, replied: 2, later: 2, rejected: 2, interested: 3, meeting: 4, offer: 5, won: 6 };
  /** Výsledok kontaktu → krok. Nedvíha, Obsadené, Zlé číslo = len oslovenie. */
  const OUTCOME_RANK = { callback: 2, not_interested: 2, interested: 3, meeting_set: 4, send_offer: 5 };
  const TOUCH_KINDS = ['call', 'email', 'meeting', 'linkedin'];
  /** Hovor, pri ktorom sme sa s niekým naozaj bavili. */
  const CONNECTED = (o) => !!o && !['no_answer', 'busy', 'wrong_number'].includes(o);
  /** Firmy, pri ktorých sa už nič nerieši (do „Čo treba riešiť" nepatria). */
  const CLOSED = ['won', 'rejected', 'unsubscribed'];
  const OPEN_STAGES = ['interested', 'meeting', 'offer'];
  /** Názvy kategórií tak, ako ich píše história (spúšťač v migrácii 081b). */
  const STATUS_LABEL = {
    'Nová': 'new', 'Oslovená': 'contacted', 'Odpísala': 'replied', 'Má záujem': 'interested', 'Stretnutie': 'meeting',
    'Ponuka': 'offer', 'Je odberateľ': 'won', 'Ozvať sa neskôr': 'later', 'Nemá záujem': 'rejected',
    'Nedostupná': 'unreachable', 'Odhlásená': 'unsubscribed',
  };
  const SOURCES = [
    ['outscraper', 'Google Mapy (Outscraper)'], ['urls', 'Podľa webov firiem'], ['ai', 'AI na webe'],
    ['osm', 'Mapa (OpenStreetMap)'], ['manual', 'Ručne'], ['kolega', 'Od kolegov'],
  ];
  const SOURCE_LABEL = Object.fromEntries(SOURCES);
  /** Skupina s menej oslovenými firmami sa za „najlepšiu" neoznačí — náhoda. */
  const MIN_SAMPLE = 3;

  // ── Spolkové krajiny ────────────────────────────────────────────────────
  const LANDS = ['Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hessen',
    'Mecklenburg-Vorpommern', 'Niedersachsen', 'Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland', 'Sachsen',
    'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen'];
  /** Veľké mestá, ktoré sa v „regióne" hľadania píšu namiesto krajiny. */
  const CITY_LAND = { 'münchen': 'Bayern', 'nürnberg': 'Bayern', 'augsburg': 'Bayern', 'regensburg': 'Bayern', 'würzburg': 'Bayern',
    'ingolstadt': 'Bayern', 'stuttgart': 'Baden-Württemberg', 'ulm': 'Baden-Württemberg', 'karlsruhe': 'Baden-Württemberg',
    'mannheim': 'Baden-Württemberg', 'freiburg': 'Baden-Württemberg', 'heilbronn': 'Baden-Württemberg', 'köln': 'Nordrhein-Westfalen',
    'düsseldorf': 'Nordrhein-Westfalen', 'dortmund': 'Nordrhein-Westfalen', 'essen': 'Nordrhein-Westfalen', 'bonn': 'Nordrhein-Westfalen',
    'frankfurt': 'Hessen', 'wiesbaden': 'Hessen', 'kassel': 'Hessen', 'leipzig': 'Sachsen', 'dresden': 'Sachsen', 'hannover': 'Niedersachsen',
    'mainz': 'Rheinland-Pfalz', 'erfurt': 'Thüringen', 'magdeburg': 'Sachsen-Anhalt', 'potsdam': 'Brandenburg', 'kiel': 'Schleswig-Holstein' };
  /**
   * Prvé dve číslice PSČ → krajina. Hranice PSČ a krajín sa úplne nekryjú,
   * je to odhad — preto sa použije, len keď firma nemá región.
   */
  const PLZ2 = (() => {
    const m = {};
    const set = (list, land) => list.forEach(p => { m[String(p).padStart(2, '0')] = land; });
    set([1, 2, 4, 8, 9], 'Sachsen'); set([3, 14, 15, 16], 'Brandenburg'); set([6, 39], 'Sachsen-Anhalt'); set([7, 98, 99], 'Thüringen');
    set([10, 12, 13], 'Berlin'); set([17, 18, 19], 'Mecklenburg-Vorpommern'); set([20, 21, 22], 'Hamburg');
    set([23, 24, 25], 'Schleswig-Holstein'); set([26, 27, 29, 30, 31, 37, 38, 49], 'Niedersachsen'); set([28], 'Bremen');
    set([32, 33, 40, 41, 42, 44, 45, 46, 47, 48, 50, 51, 52, 53, 57, 58, 59], 'Nordrhein-Westfalen');
    set([34, 35, 36, 60, 61, 63, 64, 65], 'Hessen'); set([54, 55, 56, 67], 'Rheinland-Pfalz'); set([66], 'Saarland');
    set([68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 88, 89], 'Baden-Württemberg');
    set([80, 81, 82, 83, 84, 85, 86, 87, 90, 91, 92, 93, 94, 95, 96, 97], 'Bayern');
    return m;
  })();
  const COUNTRY = { AT: 'Rakúsko', CH: 'Švajčiarsko', SK: 'Slovensko', CZ: 'Česko', PL: 'Poľsko', NL: 'Holandsko', LU: 'Luxembursko' };

  // ── Pomôcky ─────────────────────────────────────────────────────────────
  const clean = (v) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
  const fold = (s) => clean(s).toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const personKey = (n) => clean(n).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  /** Miestny dátum „YYYY-MM-DD" (Bratislava) z timestamptz alebo dátumu. */
  function dayOf(v) {
    if (!v) return null;
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const l = CAL().localOf(s);
    return l ? l.date : null;
  }
  const inP = (d, p) => !!d && !!p && d >= p.from && d <= p.to;
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
  const ms = (v) => { const t = Date.parse(v || ''); return Number.isNaN(t) ? null : t; };
  const cmpAt = (a, b) => String(a || '').localeCompare(String(b || ''));

  // ── Obdobia ─────────────────────────────────────────────────────────────
  const PRESETS = [
    ['kw', 'Tento KW'], ['lastkw', 'Minulý KW'], ['kw4', 'Posledné 4 KW'],
    ['month', 'Tento mesiac'], ['m3', 'Posledné 3 mesiace'], ['custom', 'Vlastné'],
  ];
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const firstOfMonth = (y, m) => ymd(y, m, 1);
  const endOfMonth = (y, m) => ymd(y, m, lastDay(y, m));

  /**
   * Obdobie. `to` = koniec obdobia, `cut` = koniec, do ktorého sa ráta
   * (najneskôr dnešok). Vlastné obdobie: { from, to }.
   * @returns {{ key, label, from, to, end, title, unit }}
   */
  function period(key, today, custom = {}) {
    const C = CAL();
    const t = dayOf(today) || C.todayIn();
    let from, end, unit;
    if (key === 'lastkw') { const w = C.weekOf(C.addDays(t, -7)); from = w.from; end = w.to; unit = 'week'; }
    else if (key === 'kw4') { const w = C.weekOf(t); from = C.addDays(w.from, -21); end = w.to; unit = 'week4'; }
    else if (key === 'month') { const m = C.monthOf(t); from = firstOfMonth(m.year, m.month); end = endOfMonth(m.year, m.month); unit = 'month'; }
    else if (key === 'm3') {
      const m = C.monthOf(t); const s = C.shiftMonth(m.year, m.month, -2);
      from = firstOfMonth(s.year, s.month); end = endOfMonth(m.year, m.month); unit = 'month3';
    } else if (key === 'custom') {
      let a = dayOf(custom.from), b = dayOf(custom.to);
      if (!C.isDate(a)) a = C.addDays(t, -29);
      if (!C.isDate(b)) b = t;
      if (b < a) { const x = a; a = b; b = x; }
      from = a; end = b; unit = 'days';
    } else { key = 'kw'; const w = C.weekOf(t); from = w.from; end = w.to; unit = 'week'; }
    const to = end < t ? end : t;
    const label = (PRESETS.find(p => p[0] === key) || PRESETS[0])[1];
    return { key, label, from, end, to: to < from ? from : to, unit, title: titleOf(key, from, end) };
  }

  /** „KW 45 · 2.–8. 11. 2026", „November 2026", „2. 11.–29. 11. 2026". */
  function titleOf(key, from, end) {
    const C = CAL();
    if (key === 'kw' || key === 'lastkw') return C.kw(from).label;
    const range = C.rangeText(from, end);
    if (key === 'kw4') return `KW ${C.isoWeek(from).week}–${C.isoWeek(end).week} · ${range}`;
    if (key === 'month') { const m = C.monthOf(from); return C.monthTitle(m.year, m.month); }
    return range;
  }

  /**
   * Predošlé obdobie na porovnanie — rovnako dlhý začiatok predošlej
   * jednotky (KW, mesiaca…), aby sa bežiaci týždeň neporovnával s celým.
   */
  function previous(p) {
    const C = CAL();
    const elapsed = C.diffDays(p.from, p.to);
    let from, end;
    if (p.unit === 'week') { from = C.addDays(p.from, -7); end = C.addDays(p.end, -7); }
    else if (p.unit === 'week4') { from = C.addDays(p.from, -28); end = C.addDays(p.end, -28); }
    else if (p.unit === 'month' || p.unit === 'month3') {
      const n = p.unit === 'month' ? 1 : 3;
      const m = C.monthOf(p.from); const s = C.shiftMonth(m.year, m.month, -n);
      from = firstOfMonth(s.year, s.month);
      const e = C.shiftMonth(s.year, s.month, n - 1); end = endOfMonth(e.year, e.month);
    } else { const len = C.diffDays(p.from, p.end) + 1; from = C.addDays(p.from, -len); end = C.addDays(p.from, -1); }
    let to = C.addDays(from, elapsed);
    if (to > end) to = end;
    return { key: `${p.key}-prev`, label: 'Predošlé obdobie', from, end, to, unit: p.unit, title: C.rangeText(from, to) };
  }

  // ── Ľudia ───────────────────────────────────────────────────────────────
  /**
   * Kto je kto. Kľúč osoby je id člena (danubra_members.id); kto v appke
   * nie je (meno z odkazu od kolegu), má kľúč „n:meno"; neznámy = ''.
   */
  function people(members = []) {
    const byId = new Map(), byUser = new Map(), byName = new Map(), first = new Map();
    for (const m of members || []) {
      if (!m || !m.id) continue;
      byId.set(m.id, m);
      if (m.user_id) byUser.set(m.user_id, m);
      const k = personKey(m.full_name);
      if (k) byName.set(k, m);
      const f = k.split(' ')[0];
      if (f) first.set(f, first.has(f) ? null : m);
    }
    const nameOf = (m) => clean(m && (m.full_name || m.email)) || 'Bez mena';
    return {
      byId, byUser,
      /** { member, user, name } → kľúč osoby */
      key({ member, user, name } = {}) {
        if (member && byId.has(member)) return member;
        if (user && byUser.has(user)) return byUser.get(user).id;
        const k = personKey(name);
        if (!k) return '';
        if (byName.has(k)) return byName.get(k).id;
        // Len krstné meno („Michal" z odkazu od kolegu) — keď je v tíme jediný Michal.
        const f = k.indexOf(' ') < 0 ? first.get(k) : null;
        if (f) return f.id;
        return `n:${k}`;
      },
      label(key, fallback) {
        if (!key) return 'Neuvedené';
        if (byId.has(key)) return nameOf(byId.get(key));
        return clean(fallback) || key.slice(2);
      },
      list() { return [...byId.values()].filter(m => m.active !== false); },
    };
  }

  // ── Kontakty: oprava platí namiesto pôvodného ───────────────────────────
  function effectiveContacts(contacts = []) {
    const live = (contacts || []).filter(c => c && !c.archived_at);
    const fixes = new Map();
    for (const c of live) {
      if (!c.corrects_id) continue;
      const prev = fixes.get(c.corrects_id);
      if (!prev || cmpAt(c.created_at || c.happened_at, prev.created_at || prev.happened_at) > 0) fixes.set(c.corrects_id, c);
    }
    return live.filter(c => !c.corrects_id).map(c => {
      const f = fixes.get(c.id);
      if (!f) return c;
      const o = { ...c };
      for (const k of ['kind', 'direction', 'outcome', 'duration_min', 'our_member_id', 'our_user_id', 'our_member_name', 'happened_at']) {
        if (f[k] != null && f[k] !== '') o[k] = f[k];
      }
      return o;
    });
  }

  /** „Kategória: Oslovená → Má záujem" → { from: 'contacted', to: 'interested' } */
  function parseChange(body) {
    const m = String(body || '').match(/Kategória:\s*(.+?)\s*→\s*(.+?)\s*$/);
    if (!m) return null;
    const k = (s) => STATUS_LABEL[clean(s)] || clean(s);
    return { from: k(m[1]), to: k(m[2]) };
  }

  /** Sú e-maily v riadku oslovenia naozaj odoslané? */
  const sentRow = (o) => !!o && !o.archived_at && ['sent', 'bounced'].includes(o.status) && !!o.sent_at;

  // ── Časová os každej firmy ──────────────────────────────────────────────
  /**
   * @returns {Map<leadId, { reach: {1..6: {at, date, actor, via}}, rejected, firstTouch }>}
   */
  function timelines(data = {}, P = people(data.members)) {
    const leads = (data.leads || []).filter(l => l && l.id && !l.archived_at);
    const ev = new Map(leads.map(l => [l.id, { list: [], rej: [] }]));
    const push = (id, rank, at, actor, via) => {
      const e = ev.get(id);
      if (!e || !rank || !at || ms(at) == null) return;
      e.list.push({ rank, at: String(at), actor: actor || '', via });
    };
    const rej = (id, at, actor, via) => { const e = ev.get(id); if (e && at && ms(at) != null) e.rej.push({ at: String(at), actor: actor || '', via }); };

    for (const o of data.outreach || []) {
      if (!sentRow(o)) continue;
      const who = P.key({ user: o.sent_by });
      // Nedoručený e-mail firmu neoslovil — počíta sa len medzi e-mailmi.
      if (o.status === 'sent' && !o.bounced_at) push(o.lead_id, 1, o.sent_at, who, 'email');
      if (o.replied_at) push(o.lead_id, 2, o.replied_at, who, 'reply');
    }
    for (const c of effectiveContacts(data.contacts)) {
      const who = P.key({ member: c.our_member_id, user: c.our_user_id, name: c.our_member_name });
      const at = c.happened_at || c.created_at;
      if (TOUCH_KINDS.includes(c.kind)) push(c.lead_id, 1, at, who, c.kind);
      if (c.kind === 'meeting') push(c.lead_id, 4, at, who, 'meeting');
      if (c.direction === 'in' && c.kind !== 'note') push(c.lead_id, 2, at, who, 'in');
      const r = OUTCOME_RANK[c.outcome];
      if (r) push(c.lead_id, r, at, who, `outcome:${c.outcome}`);
      if (c.outcome === 'not_interested') rej(c.lead_id, at, who, 'outcome');
    }
    // História kategórie: nová kategória je dôkaz v čase zmeny. Pôvodná
    // („Ponuka → Je odberateľ") hovorí, že firma tam bola už skôr — v čase
    // predošlej zmeny, inak posledného známeho dôkazu pred ňou.
    const hist = new Map();
    for (const a of data.activities || []) {
      if (!a || a.archived_at || (a.entity_type && a.entity_type !== 'lead')) continue;
      if (a.source && a.source !== 'lead_status') continue;
      const ch = parseChange(a.body);
      if (!ch || !ev.has(a.entity_id) || ms(a.created_at) == null) continue;
      if (!hist.has(a.entity_id)) hist.set(a.entity_id, []);
      hist.get(a.entity_id).push({ a, ch });
    }
    const pending = [];
    for (const [id, list] of hist) {
      list.sort((x, y) => ms(x.a.created_at) - ms(y.a.created_at));
      list.forEach(({ a, ch }, i) => {
        const who = P.key({ user: a.created_by });
        push(id, STATUS_RANK[ch.to], a.created_at, who, `status:${ch.to}`);
        if (ch.to === 'rejected') rej(id, a.created_at, who, 'status');
        if (STATUS_RANK[ch.from] && ch.from !== 'rejected' && ch.from !== ch.to) pending.push({ id, rank: STATUS_RANK[ch.from], before: a.created_at, prev: i ? list[i - 1].a : null });
      });
    }
    for (const e of data.events || []) {
      if (!e || e.archived_at || e.entity_type !== 'lead' || (e.kind && e.kind !== 'meeting')) continue;
      push(e.entity_id, 4, e.created_at || e.starts_on, P.key({ user: e.created_by }), 'calendar');
    }
    for (const x of pending) {
      let at = x.prev ? x.prev.created_at : null;
      let who = x.prev ? P.key({ user: x.prev.created_by }) : '';
      if (!at) {
        const known = ev.get(x.id).list.filter(e => ms(e.at) < ms(x.before)).sort((a, b) => ms(b.at) - ms(a.at))[0];
        const l = leads.find(y => y.id === x.id);
        at = known ? known.at : (l && l.created_at) || x.before;
        who = known ? known.actor : '';
      }
      push(x.id, x.rank, at, who, 'status:before');
    }
    // Aktuálna kategória: skutočný dátum zmeny vždy, poistka len keď nič iné nie je.
    for (const l of leads) {
      const e = ev.get(l.id);
      const r = Math.max(STATUS_RANK[l.status] || 0, l.partner_id ? 6 : 0);
      const who = P.key({ user: l.status_changed_by });
      const top = e.list.reduce((m, x) => Math.max(m, x.rank), 0);
      if (r && l.status_changed_at) push(l.id, r, l.status_changed_at, who, 'status');
      else if (r && top < r) push(l.id, r, l.last_contact_at || l.created_at, who, 'status');
      if (l.status === 'rejected' && !e.rej.length) rej(l.id, l.status_changed_at || l.last_contact_at || l.created_at, who, 'status');
    }

    const out = new Map();
    for (const l of leads) {
      const e = ev.get(l.id);
      e.list.sort((a, b) => (ms(a.at) - ms(b.at)) || (b.rank - a.rank));
      const reach = {};
      for (let r = 1; r <= 6; r++) {
        const hit = e.list.find(x => x.rank >= r);
        if (hit) reach[r] = { at: hit.at, date: dayOf(hit.at), actor: hit.actor, via: hit.via };
      }
      e.rej.sort((a, b) => ms(a.at) - ms(b.at));
      const rj = e.rej[0] ? { at: e.rej[0].at, date: dayOf(e.rej[0].at), actor: e.rej[0].actor, via: e.rej[0].via } : null;
      out.set(l.id, { reach, rejected: rj, top: Object.keys(reach).length });
    }
    return out;
  }

  // ── Čísla za obdobie ────────────────────────────────────────────────────
  function emailStats(outreach, p, P) {
    const s = (outreach || []).filter(o => sentRow(o) && inP(dayOf(o.sent_at), p));
    const n = (f) => s.filter(f).length;
    const sent = s.length;
    const opened = n(o => o.opened_at);
    const autoOnly = n(o => !o.opened_at && o.auto_opened_at);
    const clicked = n(o => o.clicked_at), replied = n(o => o.replied_at);
    const bounced = n(o => o.bounced_at || o.status === 'bounced'), unsubscribed = n(o => o.unsubscribed_at);
    const byWho = new Map();
    for (const o of s) { const k = P.key({ user: o.sent_by }); byWho.set(k, (byWho.get(k) || 0) + 1); }
    return { sent, first: n(o => (Number(o.step) || 1) === 1), followups: n(o => (Number(o.step) || 1) > 1),
      opened, autoOnly, clicked, replied, bounced, unsubscribed,
      openRate: pct(opened, sent), clickRate: pct(clicked, sent), replyRate: pct(replied, sent), bounceRate: pct(bounced, sent),
      leadIds: [...new Set(s.map(o => o.lead_id))], byWho };
  }

  function callStats(contacts, p, P) {
    const c = contacts.filter(x => x.kind === 'call' && inP(dayOf(x.happened_at || x.created_at), p));
    const byWho = new Map();
    for (const x of c) {
      const k = P.key({ member: x.our_member_id, user: x.our_user_id, name: x.our_member_name });
      const v = byWho.get(k) || { calls: 0, minutes: 0, name: x.our_member_name };
      v.calls++; v.minutes += Number(x.duration_min) || 0;
      byWho.set(k, v);
    }
    return { calls: c.length, minutes: c.reduce((a, x) => a + (Number(x.duration_min) || 0), 0),
      connected: c.filter(x => CONNECTED(x.outcome)).length, leadIds: [...new Set(c.map(x => x.lead_id))], byWho };
  }

  /** Firmy, ktoré sa v období prvýkrát dostali do kroku `rank` (alebo vyššie). */
  const reachedIn = (T, rank, p) => [...T.entries()].filter(([, t]) => t.reach[rank] && inP(t.reach[rank].date, p)).map(([id]) => id);

  function kpis(data, T, p, ctx) {
    const { P, contacts } = ctx;
    const found = (data.leads || []).filter(l => l && !l.archived_at && inP(dayOf(l.created_at), p)).map(l => l.id);
    const o = {
      found: { n: found.length, ids: found },
      calls: callStats(contacts, p, P),
      emails: emailStats(data.outreach, p, P),
      rejected: { ids: [...T.entries()].filter(([, t]) => t.rejected && inP(t.rejected.date, p)).map(([id]) => id) },
      meetingsCal: (data.events || []).filter(e => e && !e.archived_at && e.entity_type === 'lead' && e.kind === 'meeting' && inP(dayOf(e.starts_on), p)).length,
    };
    o.rejected.n = o.rejected.ids.length;
    for (const [key, rank] of STEPS) { const ids = reachedIn(T, rank, p); o[key] = { n: ids.length, ids }; }
    return o;
  }

  /** Rozdiel oproti predošlému obdobiu. `goodUp` = viac je lepšie. */
  function delta(cur, prev, goodUp = true) {
    const a = Number(cur) || 0, b = Number(prev) || 0;
    const diff = Math.round((a - b) * 10) / 10;
    const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
    const tone = dir === 'same' ? 'same' : (dir === 'up') === goodUp ? 'good' : 'bad';
    return { cur: a, prev: b, diff, dir, tone, pct: b ? Math.round(((a - b) / b) * 100) : null };
  }

  // ── Lievik ──────────────────────────────────────────────────────────────
  /**
   * @param {string} mode  'contacted' = firmy prvýkrát oslovené v období
   *                       (predvolené), 'found' = firmy pridané v období
   */
  function funnel(data, T, p, mode = 'contacted') {
    const found = (data.leads || []).filter(l => l && !l.archived_at && inP(dayOf(l.created_at), p)).map(l => l.id);
    const has = (id, r) => { const t = T.get(id); return !!(t && t.reach[r]); };
    const cohort = mode === 'found' ? found : reachedIn(T, 1, p);
    const steps = [{ key: 'found', label: 'Nájdené', n: found.length, ids: found, conv: null, ofTop: found.length ? 100 : null }];
    if (mode === 'found') {
      let prev = found.length;
      for (const [key, rank, , label] of STEPS) {
        const ids = found.filter(id => has(id, rank));
        steps.push({ key, label, n: ids.length, ids, conv: pct(ids.length, prev), ofTop: pct(ids.length, found.length) });
        prev = ids.length;
      }
    } else {
      // Nájdené je kontext (pridané v období); od Oslovených ďalej je to jedna skupina.
      const ofFound = found.filter(id => has(id, 1)).length;
      let prev = cohort.length;
      for (const [key, rank, , label] of STEPS) {
        const ids = rank === 1 ? cohort : cohort.filter(id => has(id, rank));
        steps.push({ key, label, n: ids.length, ids, conv: rank === 1 ? pct(ofFound, found.length) : pct(ids.length, prev),
          ofTop: pct(ids.length, cohort.length), convNote: rank === 1 ? 'z nájdených v období už oslovených' : null });
        prev = ids.length;
      }
    }
    return { mode, steps, cohort: cohort.length };
  }

  // ── Trend po KW ─────────────────────────────────────────────────────────
  /** Posledných `weeks` KW, ktoré končia týždňom dňa `end`. Aj cez prelom roka. */
  function weeksBack(end, weeks = 12) {
    const C = CAL();
    const last = C.weekOf(end);
    return Array.from({ length: weeks }, (_, i) => {
      const w = C.weekOf(C.addDays(last.from, -7 * (weeks - 1 - i)));
      return { key: w.from, year: w.year, week: w.week, from: w.from, to: w.to, label: `KW ${w.week}` };
    });
  }
  function trend(data, T, end, weeks = 12) {
    const C = CAL();
    const list = weeksBack(end, weeks).map(w => ({ ...w, contacted: 0, replied: 0, meeting: 0, emails: 0 }));
    const by = new Map(list.map(w => [w.key, w]));
    const bucket = (d) => (d ? by.get(C.weekOf(d).from) : null);
    for (const [, t] of T) {
      for (const [k, r] of [['contacted', 1], ['replied', 2], ['meeting', 4]]) {
        const b = t.reach[r] && bucket(t.reach[r].date);
        if (b) b[k]++;
      }
    }
    for (const o of data.outreach || []) { if (!sentRow(o)) continue; const b = bucket(dayOf(o.sent_at)); if (b) b.emails++; }
    return list;
  }

  // ── Po kolegoch ─────────────────────────────────────────────────────────
  function byMember(data, T, p, ctx, todo) {
    const { P, contacts } = ctx;
    const rows = new Map();
    const row = (k, name) => {
      if (!rows.has(k)) {
        rows.set(k, { key: k, name: P.label(k, name), member: P.byId.has(k), contacted: 0, calls: 0, minutes: 0, emails: 0, replied: 0,
          interested: 0, meeting: 0, offer: 0, won: 0, overdue: 0, tipsSent: 0, tipsAdded: 0, ids: { contacted: [], replied: [], meeting: [], offer: [], won: [] } });
      }
      return rows.get(k);
    };
    for (const m of P.list()) row(m.id);
    for (const [id, t] of T) {
      for (const [key, rank] of STEPS) {
        const r = t.reach[rank];
        if (!r || !inP(r.date, p)) continue;
        const x = row(r.actor);
        x[key]++;
        if (x.ids[key]) x.ids[key].push(id);
      }
    }
    const calls = callStats(contacts, p, P);
    for (const [k, v] of calls.byWho) { const x = row(k, v.name); x.calls += v.calls; x.minutes += v.minutes; }
    for (const [k, n] of emailStats(data.outreach, p, P).byWho) row(k).emails += n;
    for (const it of (todo && todo.overdue) || []) row(it.who || '', it.whoName).overdue++;
    for (const t of data.tips || []) {
      if (!t || t.archived_at || !inP(dayOf(t.created_at), p)) continue;
      const x = row(P.key({ name: t.submitted_by_name }), t.submitted_by_name);
      x.tipsSent++;
      if (t.status === 'added' || t.lead_id) x.tipsAdded++;
    }
    const sum = (x) => x.contacted + x.calls + x.emails + x.replied + x.meeting + x.offer + x.won + x.overdue + x.tipsSent;
    return [...rows.values()].filter(x => x.member || sum(x) > 0)
      .map(x => ({ ...x, replyRate: pct(x.replied, x.contacted) }))
      .sort((a, b) => b.contacted - a.contacted || b.calls - a.calls || b.emails - a.emails || a.name.localeCompare(b.name, 'sk'));
  }

  // ── Po skupinách: remeslo, región, zdroj ────────────────────────────────
  /**
   * @param {Function} keysOf  firma → [kľúče skupín] ('' = neurčené)
   * Nájdené = pridané v období; od Oslovených ďalej je to skupina firiem
   * prvýkrát oslovených v období a kam sa doteraz dostali.
   */
  function groupBy(data, T, p, keysOf) {
    const g = new Map();
    const row = (k) => {
      if (!g.has(k)) g.set(k, { key: k, found: 0, contacted: 0, replied: 0, interested: 0, meeting: 0, offer: 0, won: 0, rejected: 0, ids: [] });
      return g.get(k);
    };
    for (const l of data.leads || []) {
      if (!l || l.archived_at) continue;
      const t = T.get(l.id);
      const isFound = inP(dayOf(l.created_at), p);
      const isCohort = !!(t && t.reach[1] && inP(t.reach[1].date, p));
      if (!isFound && !isCohort) continue;
      let keys = keysOf(l);
      keys = Array.isArray(keys) && keys.length ? [...new Set(keys)] : [''];
      for (const k of keys) {
        const x = row(k);
        if (isFound) x.found++;
        if (!isCohort) continue;
        x.contacted++; x.ids.push(l.id);
        for (const [key, rank] of STEPS) if (rank > 1 && t.reach[rank]) x[key]++;
        if (t.rejected) x.rejected++;
      }
    }
    const list = [...g.values()].map(x => ({ ...x, replyRate: pct(x.replied, x.contacted), interestRate: pct(x.interested, x.contacted),
      wonRate: pct(x.won, x.contacted), best: false }));
    const cand = list.filter(x => x.key && x.contacted >= MIN_SAMPLE && x.interested > 0);
    const top = cand.sort((a, b) => b.interestRate - a.interestRate || b.contacted - a.contacted)[0];
    if (top) top.best = true;
    return list.sort((a, b) => b.contacted - a.contacted || b.found - a.found || String(a.key).localeCompare(String(b.key), 'sk'));
  }

  /** Spolková krajina firmy (alebo krajina mimo Nemecka); '' = neurčené. */
  function landOf(lead = {}) {
    const P = PITCH();
    const raw = clean(lead.region);
    if (raw) {
      const g = P && P.germanPlace ? P.germanPlace(raw) : raw;
      const f = fold(g || raw);
      const hit = LANDS.find(x => fold(x) === f) || LANDS.slice().sort((a, b) => b.length - a.length).find(x => f.includes(fold(x)));
      if (hit) return hit;
      const c = Object.keys(CITY_LAND).find(k => f.startsWith(fold(k)));
      if (c) return CITY_LAND[c];
      if (/rakusk|osterreich|austria|wien/.test(f)) return 'Rakúsko';
    }
    const cc = clean(lead.country).toUpperCase();
    if (cc && cc !== 'DE' && COUNTRY[cc]) return COUNTRY[cc];
    const plz = clean(lead.postal_code).replace(/\D/g, '');
    if (plz.length === 5 && (!cc || cc === 'DE')) return PLZ2[plz.slice(0, 2)] || '';
    const city = fold(lead.city);
    const c2 = city && Object.keys(CITY_LAND).find(k => city.startsWith(fold(k)));
    return c2 ? CITY_LAND[c2] : '';
  }
  const cityOf = (lead = {}) => clean(lead.city).replace(/^\d{5}\s+/, '');

  /** Remeslá firmy (ručné, inak zistené z textu a hľadania). */
  function tradesOf(lead, searches) {
    const t = TR();
    if (!t) return [];
    const s = lead && lead.seed_search_id ? (searches || new Map()).get(lead.seed_search_id) : null;
    return t.keysOf(lead, s || null);
  }

  // ── Hľadania: z ktorého prišli firmy so záujmom (od začiatku) ─────────
  function bySearch(data, T) {
    const g = new Map();
    for (const s of data.searches || []) if (s && s.id) g.set(s.id, { key: s.id, search: s, leads: 0, contacted: 0, replied: 0, interested: 0, won: 0, ids: [] });
    for (const l of data.leads || []) {
      if (!l || l.archived_at || !l.seed_search_id) continue;
      if (!g.has(l.seed_search_id)) g.set(l.seed_search_id, { key: l.seed_search_id, search: null, leads: 0, contacted: 0, replied: 0, interested: 0, won: 0, ids: [] });
      const x = g.get(l.seed_search_id);
      const t = T.get(l.id) || { reach: {} };
      x.leads++; x.ids.push(l.id);
      if (t.reach[1]) x.contacted++;
      if (t.reach[2]) x.replied++;
      if (t.reach[3]) x.interested++;
      if (t.reach[6]) x.won++;
    }
    return [...g.values()].filter(x => x.leads > 0)
      .map(x => ({ ...x, label: searchLabel(x.search), at: x.search ? x.search.created_at : null,
        reachRate: pct(x.contacted, x.leads), interestRate: pct(x.interested, x.contacted) }))
      .sort((a, b) => b.interested - a.interested || b.won - a.won || b.contacted - a.contacted || cmpAt(b.at, a.at));
  }
  function searchLabel(s) {
    if (!s) return 'Staršie hľadanie';
    const S = SEEDS();
    if (S && S.searchLabel) return S.searchLabel(s);
    return clean(s.params && (s.params.query || s.params.region)) || 'Hľadanie';
  }

  // ── Čo treba riešiť (teraz, nie za obdobie) ─────────────────────────────
  function todo(data, T, today, ctx) {
    const C = CAL();
    const { P, contacts } = ctx;
    const t0 = dayOf(today) || C.todayIn();
    const leads = new Map((data.leads || []).filter(l => l && !l.archived_at).map(l => [l.id, l]));
    const live = (data.tasks || []).filter(t => t && !t.archived_at && t.entity_type === 'lead' && leads.has(t.entity_id)
      && t.status !== 'done' && t.status !== 'cancelled');
    const openBy = new Set(live.map(t => t.entity_id));
    const effDue = (t) => { const a = dayOf(t.due_date), b = dayOf(t.postponed_to); return a && b ? (a > b ? a : b) : a || b; };
    const lastWho = new Map();
    for (const c of [...contacts].sort((a, b) => cmpAt(a.happened_at, b.happened_at))) {
      lastWho.set(c.lead_id, P.key({ member: c.our_member_id, user: c.our_user_id, name: c.our_member_name }));
    }

    const over = new Map();
    for (const t of live) {
      const d = effDue(t);
      if (!d || d >= t0) continue;
      const prev = over.get(t.entity_id);
      if (prev && prev.due <= d) continue;
      over.set(t.entity_id, { leadId: t.entity_id, kind: 'task', taskId: t.id, text: clean(t.title), due: d, days: C.diffDays(d, t0),
        who: P.key({ user: t.assigned_to, name: t.assigned_name }), whoName: t.assigned_name || '' });
    }
    for (const l of leads.values()) {
      const d = dayOf(l.next_step_at);
      if (!d || d >= t0 || over.has(l.id) || openBy.has(l.id) || CLOSED.includes(l.status)) continue;
      over.set(l.id, { leadId: l.id, kind: 'step', text: clean(l.next_step_text) || 'Dohodnutý ďalší krok', due: d, days: C.diffDays(d, t0),
        who: lastWho.get(l.id) || P.key({ user: l.status_changed_by }), whoName: '' });
    }
    const overdue = [...over.values()].filter(x => !CLOSED.includes((leads.get(x.leadId) || {}).status) || x.kind === 'task')
      .sort((a, b) => b.days - a.days);

    const noStep = [...leads.values()].filter(l => OPEN_STAGES.includes(l.status) && !l.next_step_at && !openBy.has(l.id))
      .map(l => ({ leadId: l.id, status: l.status, since: dayOf(l.status_changed_at), days: l.status_changed_at ? C.diffDays(dayOf(l.status_changed_at), t0) : null }))
      .sort((a, b) => (b.days || 0) - (a.days || 0));

    const wk = C.weekOf(t0);
    const meetings = (data.events || []).filter(e => e && !e.archived_at && e.entity_type === 'lead' && leads.has(e.entity_id)
      && dayOf(e.starts_on) >= wk.from && dayOf(e.starts_on) <= wk.to)
      .map(e => ({ leadId: e.entity_id, eventId: e.id, title: clean(e.title), date: dayOf(e.starts_on), time: e.start_time ? String(e.start_time).slice(0, 5) : null,
        kind: e.kind || 'meeting', place: clean(e.place), past: dayOf(e.starts_on) < t0 }))
      .sort((a, b) => cmpAt(`${a.date} ${a.time || ''}`, `${b.date} ${b.time || ''}`));

    // Odpísali, a my nič: po poslednej odpovedi žiadny kontakt, e-mail ani správa.
    const lastReply = new Map(), lastOut = new Map();
    const later = (m, id, at) => { if (at && (!m.has(id) || ms(at) > ms(m.get(id)))) m.set(id, at); };
    for (const o of data.outreach || []) {
      if (!o || o.archived_at) continue;
      if (o.replied_at) later(lastReply, o.lead_id, o.replied_at);
      if (sentRow(o)) later(lastOut, o.lead_id, o.sent_at);
    }
    for (const c of contacts) if (c.kind !== 'note' || c.direction === 'out') later(lastOut, c.lead_id, c.happened_at || c.created_at);
    for (const m of data.mails || []) if (m && m.direction === 'out' && m.lead_id) later(lastOut, m.lead_id, m.sent_at || m.created_at);
    // Kategóriu zmenil človek (nie server pri spárovaní odpovede) — s firmou sa niekto bavil.
    for (const a of data.activities || []) {
      if (a && !a.archived_at && a.created_by && (!a.entity_type || a.entity_type === 'lead') && (!a.source || a.source === 'lead_status')) later(lastOut, a.entity_id, a.created_at);
    }
    const unanswered = [...lastReply.entries()].filter(([id, at]) => {
      const l = leads.get(id);
      if (!l || CLOSED.includes(l.status)) return false;
      const out = lastOut.get(id);
      return !(out && ms(out) >= ms(at));
    }).map(([id, at]) => ({ leadId: id, at, date: dayOf(at), days: C.diffDays(dayOf(at), t0) }))
      .sort((a, b) => b.days - a.days);

    return { today: t0, week: wk, overdue, noStep, meetings, unanswered,
      count: overdue.length + noStep.length + meetings.filter(m => !m.past).length + unanswered.length };
  }

  // ── Celý prehľad ────────────────────────────────────────────────────────
  /**
   * @param {Object} data   { leads, outreach, contacts, activities, events, tasks, tips, searches, members, mails }
   * @param {Object} o      { period: 'kw'|…, custom: {from,to}, today, funnel: 'contacted'|'found', region: 'land'|'city' }
   */
  function build(data = {}, o = {}) {
    const today = dayOf(o.today) || CAL().todayIn(o.now || new Date());
    const p = o.p || period(o.period || 'kw', today, o.custom || {});
    const prev = previous(p);
    const P = people(data.members);
    const contacts = effectiveContacts(data.contacts);
    const ctx = { P, contacts };
    const T = timelines({ ...data, contacts }, P);
    const searches = new Map((data.searches || []).filter(s => s && s.id).map(s => [s.id, s]));
    const cur = kpis(data, T, p, ctx), old = kpis(data, T, prev, ctx);
    const td = todo(data, T, today, ctx);
    const mode = o.funnel === 'found' ? 'found' : 'contacted';
    const regionMode = o.region === 'city' ? 'city' : 'land';
    const deltas = {
      found: delta(cur.found.n, old.found.n), contacted: delta(cur.contacted.n, old.contacted.n),
      calls: delta(cur.calls.calls, old.calls.calls), minutes: delta(cur.calls.minutes, old.calls.minutes),
      emails: delta(cur.emails.sent, old.emails.sent), replied: delta(cur.replied.n, old.replied.n),
      interested: delta(cur.interested.n, old.interested.n), meeting: delta(cur.meeting.n, old.meeting.n),
      offer: delta(cur.offer.n, old.offer.n), won: delta(cur.won.n, old.won.n),
      rejected: delta(cur.rejected.n, old.rejected.n, false),
      openRate: delta(cur.emails.openRate || 0, old.emails.openRate || 0), replyRate: delta(cur.emails.replyRate || 0, old.emails.replyRate || 0),
      bounceRate: delta(cur.emails.bounceRate || 0, old.emails.bounceRate || 0, false),
    };
    return {
      today, period: p, prev, kpi: cur, prevKpi: old, deltas,
      funnel: funnel(data, T, p, mode),
      trend: trend(data, T, p.to, o.weeks || 12),
      members: byMember(data, T, p, ctx, td),
      trades: groupBy(data, T, p, (l) => tradesOf(l, searches)),
      regions: groupBy(data, T, p, (l) => [regionMode === 'city' ? cityOf(l) : landOf(l)]),
      regionMode,
      sources: groupBy(data, T, p, (l) => [SOURCE_LABEL[l.source] ? l.source : 'manual']),
      searches: bySearch(data, T),
      todo: td,
      timelines: T,
      people: P,
    };
  }

  // ── Export celého prehľadu do CSV (sekcie pod sebou) ────────────────────
  const num1 = (v) => (v == null ? '' : String(v).replace('.', ','));
  /**
   * @param {Object} r     výsledok build()
   * @param {Object} lab   { lead(id) → názov, trade(key) → názov }
   * @returns {Array<Array>} riadky pre DanubraExport.download
   */
  function csvRows(r, lab = {}) {
    const leadName = lab.lead || ((id) => id);
    const tradeName = lab.trade || ((k) => { const t = TR(); return k ? (t ? t.labelSk(k) : k) : 'Neurčené'; });
    const out = [];
    const sec = (title, head, rows) => { out.push([title]); out.push(head); rows.forEach(x => out.push(x)); out.push([]); };
    const k = r.kpi, pk = r.prevKpi;
    out.push(['Prehľad oslovovania pre vedenie']);
    out.push(['Obdobie', `${r.period.from} – ${r.period.to}`, r.period.title]);
    out.push(['Porovnanie s', `${r.prev.from} – ${r.prev.to}`]);
    out.push([]);
    sec('Čísla za obdobie', ['Ukazovateľ', 'Obdobie', 'Predošlé obdobie', 'Rozdiel'], [
      ['Nové firmy', k.found.n, pk.found.n, r.deltas.found.diff],
      ['Oslovené', k.contacted.n, pk.contacted.n, r.deltas.contacted.diff],
      ['Hovory', k.calls.calls, pk.calls.calls, r.deltas.calls.diff],
      ['Minúty hovorov', k.calls.minutes, pk.calls.minutes, r.deltas.minutes.diff],
      ['E-maily odoslané', k.emails.sent, pk.emails.sent, r.deltas.emails.diff],
      ['E-maily otvorené (človek)', k.emails.opened, pk.emails.opened, k.emails.opened - pk.emails.opened],
      ['Otvorené %', num1(k.emails.openRate), num1(pk.emails.openRate), ''],
      ['Kliknuté', k.emails.clicked, pk.emails.clicked, k.emails.clicked - pk.emails.clicked],
      ['Odpovedali na e-mail', k.emails.replied, pk.emails.replied, k.emails.replied - pk.emails.replied],
      ['Nedoručené', k.emails.bounced, pk.emails.bounced, k.emails.bounced - pk.emails.bounced],
      ['Reagovali', k.replied.n, pk.replied.n, r.deltas.replied.diff],
      ['Záujem', k.interested.n, pk.interested.n, r.deltas.interested.diff],
      ['Stretnutia', k.meeting.n, pk.meeting.n, r.deltas.meeting.diff],
      ['Ponuky', k.offer.n, pk.offer.n, r.deltas.offer.diff],
      ['Noví odberatelia', k.won.n, pk.won.n, r.deltas.won.diff],
      ['Nemá záujem', k.rejected.n, pk.rejected.n, r.deltas.rejected.diff],
      ['Ďalšie kroky po termíne (dnes)', r.todo.overdue.length, '', ''],
    ]);
    sec(`Lievik (${r.funnel.mode === 'found' ? 'firmy nájdené v období' : 'firmy prvýkrát oslovené v období'})`,
      ['Krok', 'Firiem', 'Z predošlého kroku %', 'Zo začiatku %'],
      r.funnel.steps.map(s => [s.label, s.n, num1(s.conv), num1(s.ofTop)]));
    sec('Trend po KW', ['KW', 'Od', 'Do', 'Oslovené', 'Reagovali', 'Stretnutia', 'E-maily'],
      r.trend.map(w => [`KW ${w.week}/${w.year}`, w.from, w.to, w.contacted, w.replied, w.meeting, w.emails]));
    sec('Po kolegoch', ['Kolega', 'Oslovené', 'Hovory', 'Minúty', 'E-maily', 'Reagovali', 'Stretnutia', 'Ponuky', 'Odberatelia', 'Kroky po termíne', 'Tipy poslané', 'Tipy pridané'],
      r.members.map(m => [m.name, m.contacted, m.calls, m.minutes, m.emails, m.replied, m.meeting, m.offer, m.won, m.overdue, m.tipsSent, m.tipsAdded]));
    const grp = (title, rows, name) => sec(title, ['Skupina', 'Nájdené', 'Oslovené', 'Reagovali', 'Záujem', 'Stretnutie', 'Ponuka', 'Odberateľ', 'Reakcia %', 'Záujem %'],
      rows.map(g => [name(g.key), g.found, g.contacted, g.replied, g.interested, g.meeting, g.offer, g.won, num1(g.replyRate), num1(g.interestRate)]));
    grp('Po remeslách', r.trades, tradeName);
    grp(r.regionMode === 'city' ? 'Po mestách' : 'Po regiónoch', r.regions, (key) => key || 'Neurčené');
    grp('Po zdrojoch', r.sources, (key) => SOURCE_LABEL[key] || key);
    sec('Hľadania (od začiatku)', ['Hľadanie', 'Firiem', 'Oslovené', 'Reagovali', 'Záujem', 'Odberatelia', 'Záujem z oslovených %'],
      r.searches.map(s => [s.label, s.leads, s.contacted, s.replied, s.interested, s.won, num1(s.interestRate)]));
    const td = r.todo;
    sec('Čo treba riešiť', ['Čo', 'Firma', 'Podrobnosti', 'Dátum', 'Dní'], [
      ...td.overdue.map(x => ['Ďalší krok po termíne', leadName(x.leadId), x.text, x.due, x.days]),
      ...td.noStep.map(x => ['Záujem bez ďalšieho kroku', leadName(x.leadId), x.status, x.since || '', x.days == null ? '' : x.days]),
      ...td.meetings.map(x => ['Stretnutie tento týždeň', leadName(x.leadId), x.title, `${x.date}${x.time ? ` ${x.time}` : ''}`, '']),
      ...td.unanswered.map(x => ['Odpísali, bez odpovede', leadName(x.leadId), '', x.date, x.days]),
    ]);
    while (out.length && !out[out.length - 1].length) out.pop();
    return out;
  }

  const API = {
    STEPS, RANK, KEY_OF_RANK, STATUS_RANK, OUTCOME_RANK, SOURCES, SOURCE_LABEL, LANDS, PLZ2, PRESETS, MIN_SAMPLE, STATUS_LABEL,
    dayOf, period, previous, titleOf, people, effectiveContacts, parseChange, timelines, emailStats, callStats, kpis, delta,
    funnel, weeksBack, trend, byMember, groupBy, landOf, cityOf, tradesOf, bySearch, searchLabel, todo, build, csvRows, pct, personKey,
  };
  if (typeof window !== 'undefined') window.DanubraReport = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
