// ============================================================================
// DANUBRA — Stundennachweis: týždenný výkaz pre odberateľa
// ============================================================================
// Papier, ktorý na stavbe podpisuje Kunde a ktorý je podkladom k faktúre.
// Jeden týždeň, jedna partia.
//
// Hodiny zostávajú v `danubra_timesheets`. Výkaz je pohľad na ne, nie druhé
// miesto, kde sa píšu — inak by sa to rozišlo a podpísaný papier by tvrdil
// niečo iné než faktúra.
//
// Dve veci, na ktorých sa dá popáliť:
//
//   * **KW je ISO týždeň**, nie „koľký týždeň v roku podľa januára".
//     Nemecký odberateľ číta KW ako ISO 8601 — týždeň začína v pondelok
//     a prvý týždeň roka je ten, v ktorom je štvrtok. Prelom roka preto
//     patrí raz do minulého, raz do budúceho roka.
//   * **Sobota tam je.** Na nemeckých stavbách sa v sobotu robí a formulár
//     s ňou počíta; nedeľa nie.
//
// Testy: node app/lib/staffing/hoursheet.test.js
// ============================================================================
(function () {
  /** Dni, ktoré sú na papieri. Nedeľa tam nie je. */
  const DAYS = [
    ['mon', 'Montag', 'Pondelok'],
    ['tue', 'Dienstag', 'Utorok'],
    ['wed', 'Mittwoch', 'Streda'],
    ['thu', 'Donnerstag', 'Štvrtok'],
    ['fri', 'Freitag', 'Piatok'],
    ['sat', 'Samstag', 'Sobota'],
  ];

  // Vždy nová inštancia. Keby sa vracal ten istý objekt, `addDays` by menil
  // dátum, z ktorého sa počíta — a dni týždňa by sa rozliezli po kalendári.
  const iso = (d) => (d instanceof Date
    ? new Date(d.getTime())
    : new Date(String(d).slice(0, 10) + 'T00:00:00Z'));
  const ymd = (d) => iso(d).toISOString().slice(0, 10);

  function addDays(d, n) {
    const t = iso(d);
    t.setUTCDate(t.getUTCDate() + n);
    return t;
  }

  /**
   * ISO 8601 týždeň. Prvý týždeň roka je ten, v ktorom je štvrtok —
   * preto 1. januára môže patriť do 52. alebo 53. týždňa minulého roka.
   */
  function isoWeek(date) {
    const d = iso(date);
    // Posun na štvrtok toho istého týždňa: ten určuje, do ktorého roka patrí.
    const day = (d.getUTCDay() + 6) % 7;            // pondelok = 0
    const thu = addDays(d, 3 - day);
    const year = thu.getUTCFullYear();
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const week = Math.floor((thu - jan1) / 86400000 / 7) + 1;
    return { year, week };
  }

  /** Pondelok daného ISO týždňa. */
  function mondayOf(year, week) {
    // 4. január je vždy v prvom ISO týždni.
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const day = (jan4.getUTCDay() + 6) % 7;
    const week1Monday = addDays(jan4, -day);
    return addDays(week1Monday, (week - 1) * 7);
  }

  /** Dátumy pondelok–sobota pre daný týždeň. */
  function weekDates(year, week) {
    const mon = mondayOf(year, week);
    return DAYS.map(([key, de, sk], i) => ({
      key, de, sk, date: ymd(addDays(mon, i)),
    }));
  }

  /** Koľko týždňov má rok — 52 alebo 53. */
  function weeksInYear(year) {
    return isoWeek(new Date(Date.UTC(year, 11, 28))).week;
  }

  /** Predošlý / nasledujúci týždeň, aj cez prelom roka. */
  function shiftWeek(year, week, delta) {
    const mon = mondayOf(year, week);
    return isoWeek(addDays(mon, delta * 7));
  }

  /**
   * Zostaví výkaz z výkazov hodín.
   *
   * @param {Object} o
   *   year, week        ISO týždeň
   *   workers           [{ id, full_name }]  poradie riadkov
   *   timesheets        [{ worker_id, work_date, hours, time_from, time_to }]
   *   project, site, customer, crewName
   * @returns {Object} riadky, stĺpce, súčty
   */
  function build(o = {}) {
    const days = weekDates(o.year, o.week);
    const dayIndex = new Map(days.map((d, i) => [d.date, i]));

    const rows = (o.workers || []).map(w => ({
      worker_id: w.id,
      name: w.full_name,
      hours: days.map(() => 0),
      total: 0,
    }));
    const byWorker = new Map(rows.map(r => [r.worker_id, r]));

    // Čas od–do je na papieri jeden riadok pre celý deň. Keď sa ľudia
    // rozchádzajú, zapíše sa najskorší začiatok a najneskorší koniec —
    // inak by sa to do jedného riadku nedalo napísať pravdivo.
    const span = days.map(() => ({ from: null, to: null, mixed: false }));

    for (const t of (o.timesheets || [])) {
      if (!t) continue;
      const i = dayIndex.get(String(t.work_date || '').slice(0, 10));
      if (i == null) continue;                      // iný týždeň
      const r = byWorker.get(t.worker_id);
      if (!r) continue;                             // nie je v partii
      const h = Number(t.hours) || 0;
      r.hours[i] += h;
      r.total += h;

      if (t.time_from) {
        if (!span[i].from) span[i].from = t.time_from;
        else if (span[i].from !== t.time_from) {
          span[i].mixed = true;
          if (t.time_from < span[i].from) span[i].from = t.time_from;
        }
      }
      if (t.time_to) {
        if (!span[i].to) span[i].to = t.time_to;
        else if (span[i].to !== t.time_to) {
          span[i].mixed = true;
          if (t.time_to > span[i].to) span[i].to = t.time_to;
        }
      }
    }

    for (const r of rows) {
      r.hours = r.hours.map(h => Math.round(h * 100) / 100);
      r.total = Math.round(r.total * 100) / 100;
    }
    const perDay = days.map((_, i) =>
      Math.round(rows.reduce((n, r) => n + r.hours[i], 0) * 100) / 100);
    const total = Math.round(perDay.reduce((a, b) => a + b, 0) * 100) / 100;

    // ── Pauza ──────────────────────────────────────────────────────────────
    // Na pôvodnom papieri je riadok „Pause" a polier ho čaká. My ho nemáme
    // kde zapísať — ale **dá sa dopočítať**: čas od–do mínus odrobené hodiny
    // je presne prestávka. Keď je od 07:00 do 16:30 zapísaných 9 hodín, pol
    // hodiny chýba a je to pauza.
    //
    // Počíta sa proti **najdlhšiemu** dňu jedného človeka, nie proti súčtu za
    // partiu — súčet by pri troch ľuďoch dal zápornú pauzu.
    //
    // Keď majú ľudia rôzne časy (`mixed`), rozpätie je roztiahnuté od
    // najskoršieho začiatku po najneskorší koniec a pauza z neho vyjde väčšia,
    // než aká bola. Vtedy sa radšej nepíše nič — nesprávne číslo na doklade,
    // ktorý niekto podpisuje, je horšie než prázdne miesto.
    const pause = days.map((_, i) => {
      const sp = span[i];
      if (!sp || sp.mixed || !sp.from || !sp.to) return null;
      const min = (t) => {
        const [h, m] = String(t).slice(0, 5).split(':').map(Number);
        return (Number.isFinite(h) && Number.isFinite(m)) ? h * 60 + m : null;
      };
      const a2 = min(sp.from), b2 = min(sp.to);
      if (a2 == null || b2 == null || b2 <= a2) return null;
      const najdlhsi = rows.reduce((m2, r) => Math.max(m2, r.hours[i] || 0), 0);
      if (!najdlhsi) return null;
      const minut = Math.round((b2 - a2) - najdlhsi * 60);
      return minut > 0 ? minut : null;
    });

    return {
      year: o.year, week: o.week,
      days, rows, span, pause, perDay, total,
      project: o.project || '', site: o.site || '',
      customer: o.customer || '', crewName: o.crewName || '',
      from: days[0].date, to: days[days.length - 1].date,
      empty: total === 0,
    };
  }

  /** Čas na papieri: „07:00 – 16:30". Prázdne, keď sa nezapísal. */
  function spanText(s) {
    if (!s || (!s.from && !s.to)) return '';
    const hhmm = (t) => String(t).slice(0, 5);
    const text = `${s.from ? hhmm(s.from) : '…'} – ${s.to ? hhmm(s.to) : '…'}`;
    return s.mixed ? `${text} *` : text;
  }

  /** Pauza na papieri: „0:30". Keď sa nedá spočítať, nepíše sa nič. */
  function pauseText(minut) {
    const m = Number(minut);
    if (!Number.isFinite(m) || m <= 0) return '';
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  }

  /** Hodiny na papieri: nemecká desatinná čiarka, nula sa nepíše. */
  function hoursText(h) {
    const n = Number(h) || 0;
    if (!n) return '';
    return (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''))
      .replace('.', ',');
  }

  const API = { DAYS, isoWeek, mondayOf, weekDates, weeksInYear, shiftWeek, build, spanText, hoursText, pauseText };
  if (typeof window !== 'undefined') window.DanubraHourSheet = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
