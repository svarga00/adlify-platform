// ============================================================================
// DANUBRA — kalendár: kalendárny týždeň (KW), mriežky a čo kedy je
// ============================================================================
// „Niekde by som chcel viditeľne zobraziť, aký je teraz KW, s preklikom do
// kalendára, ktorý by mohol byť prepojený s poznámkami a úlohami, napr. aj
// s pripomienkami a udalosťami."
//
// Na nemeckých stavbách sa žije po týždňoch: Stundennachweis je za jeden KW,
// Bauleiter hovorí „ab KW 47". KW je **ISO 8601** — týždeň začína pondelkom
// a prvý týždeň roka je ten, v ktorom je štvrtok (29. 12. 2025 je KW 1/2026,
// 31. 12. 2026 je KW 53). Počíta sa to na jednom mieste, v lib/staffing/
// hoursheet.js — tu sa to len volá, aby výkaz a kalendár nikdy nepovedali
// o tom istom dni iné číslo.
//
// Dnešok je dnešok v Bratislave, nie v UTC: o pol jednej v noci je už nový
// deň, hoci UTC ešte hovorí včera.
//
// Kalendár nemá vlastné dáta okrem udalostí (danubra_events, migrácia 089).
// Všetko ostatné sú pohľady na to, čo appka už má:
//
//   Úlohy         danubra_tasks (termín, odložené na)
//   Pripomienky   úlohy s časom (due_time) alebo z pripomienky udalosti
//   Udalosti      danubra_events — stretnutia, hovory, obhliadky, termíny
//   Poznámky      danubra_activities s follow_up_at, ďalší krok pri firme
//                 (danubra_leads.next_step_at) a pripomenutie e-mailom
//                 (danubra_outreach.next_followup_at)
//   Termíny       končiace doklady (A1…), začiatok a koniec zákazky,
//                 splatnosť vydaných faktúr — len na čítanie
//
// Čisté funkcie, žiadny `window` okrem registrácie, žiadna databáza.
// Testy: node app/lib/calendar.test.js
// ============================================================================
(function () {
  const req = (typeof require !== 'undefined' && typeof module !== 'undefined');
  const H = req ? require('./staffing/hoursheet.js') : (typeof window !== 'undefined' ? window.DanubraHourSheet : null);

  const TZ = 'Europe/Bratislava';
  const DAY = 86400000;

  // ── Dátumy ako text „YYYY-MM-DD" ────────────────────────────────────────
  const day = (s) => (s ? String(s).slice(0, 10) : null);
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
  const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));
  const toMs = (s) => { const [y, m, d] = day(s).split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
  const addDays = (s, n) => ymd(toMs(s) + Math.round(n) * DAY);
  const diffDays = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY);
  /** 1 = pondelok … 7 = nedeľa. */
  const weekday = (s) => ((new Date(toMs(s)).getUTCDay() + 6) % 7) + 1;
  const hhmm = (t) => (t ? String(t).slice(0, 5) : null);

  /** Dátum a čas v danom pásme. Bez Intl (staré prostredie) miestny čas. */
  function partsIn(now = new Date(), tz = TZ) {
    const d = now instanceof Date ? now : new Date(now);
    try {
      const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit',
        day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      const p = {};
      for (const x of f.formatToParts(d)) p[x.type] = x.value;
      return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
    } catch (e) {
      const pad = (n) => String(n).padStart(2, '0');
      return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
    }
  }
  /** Dnešok v Bratislave. */
  function todayIn(now = new Date(), tz = TZ) { return partsIn(now, tz).date; }
  /** `timestamptz` z databázy → miestny dátum a čas. */
  function localOf(iso, tz = TZ) {
    if (!iso) return null;
    const s = String(iso);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { date: s, time: null };
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : partsIn(new Date(t), tz);
  }

  // ── Kalendárny týždeň ───────────────────────────────────────────────────
  /** ISO týždeň — to isté číslo ako na Stundennachweis. */
  function isoWeek(date) { return H.isoWeek(day(date) || date); }

  /** Týždeň, v ktorom je deň: pondelok až nedeľa. */
  function weekOf(date) {
    const d = day(date);
    const from = addDays(d, 1 - weekday(d));
    const to = addDays(from, 6);
    const w = isoWeek(from);
    return { year: w.year, week: w.week, from, to, days: Array.from({ length: 7 }, (_, i) => addDays(from, i)) };
  }

  /** „2.–8. 11. 2026", cez mesiac „28. 9.–4. 10. 2026", cez rok aj s rokmi. */
  function rangeText(from, to) {
    const [y1, m1, d1] = day(from).split('-').map(Number);
    const [y2, m2, d2] = day(to).split('-').map(Number);
    if (y1 === y2 && m1 === m2) return `${d1}.–${d2}. ${m1}. ${y1}`;
    if (y1 === y2) return `${d1}. ${m1}.–${d2}. ${m2}. ${y1}`;
    return `${d1}. ${m1}. ${y1}–${d2}. ${m2}. ${y2}`;
  }

  /**
   * Všetko, čo sa o KW píše: „KW 45", „KW 45 · 2.–8. 11. 2026" a celá veta
   * do bublinky „Kalendárny týždeň 45 · 2.–8. 11. 2026".
   */
  function kw(date) {
    const w = weekOf(date);
    const range = rangeText(w.from, w.to);
    return { ...w, short: `KW ${w.week}`, range, label: `KW ${w.week} · ${range}`,
      title: `Kalendárny týždeň ${w.week} · ${range}` };
  }

  // ── Mesiac ──────────────────────────────────────────────────────────────
  const MONTHS = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august',
    'september', 'október', 'november', 'december'];
  const DAYS_SHORT = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
  const DAYS_LONG = ['pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota', 'nedeľa'];

  function monthOf(date) { const [y, m] = day(date).split('-').map(Number); return { year: y, month: m }; }
  function shiftMonth(year, month, delta) {
    const t = new Date(Date.UTC(year, month - 1 + delta, 1));
    return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1 };
  }
  function monthTitle(year, month) {
    const n = MONTHS[month - 1] || '';
    return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${year}`;
  }

  /**
   * Mriežka mesiaca po týždňoch, s číslom KW pri každom riadku. Začína
   * pondelkom pred prvým a končí nedeľou po poslednom dni mesiaca.
   * @returns {{ from, to, rows: [{ year, week, days: [{ date, d, inMonth }] }] }}
   */
  function monthGrid(year, month) {
    const first = ymd(Date.UTC(year, month - 1, 1));
    const last = ymd(Date.UTC(year, month, 0));
    const from = addDays(first, 1 - weekday(first));
    const to = addDays(last, 7 - weekday(last));
    const rows = [];
    for (let mon = from; mon <= to; mon = addDays(mon, 7)) {
      const w = isoWeek(mon);
      rows.push({ year: w.year, week: w.week, days: Array.from({ length: 7 }, (_, i) => {
        const date = addDays(mon, i);
        return { date, d: Number(date.slice(8)), inMonth: date.slice(0, 7) === first.slice(0, 7) };
      }) });
    }
    return { from, to, rows };
  }

  /** „2. 11.", s rokom, keď nie je tento. */
  function dayText(date, today) {
    const [y, m, d] = day(date).split('-').map(Number);
    return `${d}. ${m}.${today && String(y) !== day(today).slice(0, 4) ? ` ${y}` : ''}`;
  }
  /** „pondelok 2. 11." */
  function dayLong(date, today) { return `${DAYS_LONG[weekday(date) - 1]} ${dayText(date, today)}`; }
  /** „dnes", „zajtra", „včera" — inak prázdne. */
  function dayRel(date, today) {
    const n = diffDays(today, date);
    return n === 0 ? 'dnes' : n === 1 ? 'zajtra' : n === -1 ? 'včera' : '';
  }

  // ── Vrstvy ──────────────────────────────────────────────────────────────
  // [kľúč, názov, ikona, farba, len na čítanie]
  const LAYERS = [
    ['tasks', 'Úlohy', 'tasks', '#1E4FD8', false],
    ['reminders', 'Pripomienky', 'bell', '#6B4FC8', false],
    ['events', 'Udalosti', 'calendar', '#F07E22', false],
    ['notes', 'Poznámky a ďalšie kroky', 'note', '#0E7C86', false],
    ['docs', 'Končiace doklady', 'shield', '#B8336A', true],
    ['jobs', 'Začiatok a koniec zákazky', 'site', '#1F9D57', true],
    ['invoices', 'Splatnosť faktúr', 'invoices', '#8A6A12', true],
  ];
  const LAYER = Object.fromEntries(LAYERS.map(l => [l[0], { key: l[0], label: l[1], icon: l[2], color: l[3], readonly: l[4] }]));
  /** Termíny — vrstvy, ktoré sa len čítajú z iných obrazoviek. */
  const DEADLINES = LAYERS.filter(l => l[4]).map(l => l[0]);

  /** Uložené zapnuté vrstvy → objekt so všetkými kľúčmi (nové sú zapnuté). */
  function normalizeLayers(saved) {
    const out = {};
    for (const [k] of LAYERS) out[k] = !(saved && typeof saved === 'object' && saved[k] === false);
    return out;
  }

  // ── Udalosti ────────────────────────────────────────────────────────────
  // [kľúč, názov, ikona]
  const EVENT_KINDS = [
    ['meeting', 'Stretnutie', 'handshake'],
    ['call', 'Hovor', 'phone'],
    ['site_visit', 'Obhliadka stavby', 'site'],
    ['deadline', 'Termín', 'flag'],
    ['other', 'Iné', 'calendar'],
  ];
  const kindOf = (k) => EVENT_KINDS.find(x => x[0] === k) || EVENT_KINDS[EVENT_KINDS.length - 1];
  const COLORS = ['#F07E22', '#1E4FD8', '#1F9D57', '#6B4FC8', '#B8336A', '#0E7C86', '#8A6A12', '#41557F'];
  // [minúty pred začiatkom, text]. `null` = bez pripomienky.
  const REMIND = [
    [null, 'Bez pripomienky'], [0, 'V čase začiatku'], [15, '15 minút pred'], [30, '30 minút pred'],
    [60, '1 hodinu pred'], [120, '2 hodiny pred'], [1440, '1 deň pred'], [2880, '2 dni pred'], [10080, '1 týždeň pred'],
  ];
  /** Udalosť na celý deň sa pripomína od 8:00 v deň začiatku. */
  const ALL_DAY_AT = '08:00';

  /**
   * Kedy pripomenúť udalosť — deň a čas úlohy, ktorá z pripomienky vznikne.
   * @returns {{ due_date, due_time, title }|null}
   */
  function reminderFor(ev, minutes) {
    const m = minutes == null || minutes === '' ? null : Number(minutes);
    if (!ev || m == null || !Number.isFinite(m) || m < 0 || !isDate(day(ev.starts_on))) return null;
    const at = !ev.all_day && isTime(hhmm(ev.start_time)) ? hhmm(ev.start_time) : ALL_DAY_AT;
    const [h, mi] = at.split(':').map(Number);
    const t = toMs(ev.starts_on) + (h * 60 + mi - m) * 60000;
    const iso = new Date(t).toISOString();
    const when = !ev.all_day && ev.start_time ? `${dayText(ev.starts_on)} o ${hhmm(ev.start_time)}` : dayText(ev.starts_on);
    return { due_date: iso.slice(0, 10), due_time: iso.slice(11, 16),
      title: `Pripomienka: ${String(ev.title || 'Udalosť').trim()} (${when})` };
  }

  /** Čo na udalosti nesedí. Kontroluje sa pred uložením. */
  function validateEvent(e = {}) {
    const errors = [];
    if (!String(e.title || '').trim()) errors.push('Napíšte, čo to je — názov udalosti.');
    if (!isDate(e.starts_on)) errors.push('Vyberte deň, kedy udalosť je.');
    if (e.ends_on && !isDate(e.ends_on)) errors.push('Koniec nie je platný dátum.');
    if (isDate(e.starts_on) && isDate(e.ends_on) && e.ends_on < e.starts_on) errors.push('Koniec je skôr než začiatok.');
    if (!e.all_day) {
      if (e.start_time && !isTime(hhmm(e.start_time))) errors.push('Čas začiatku má tvar 14:30.');
      if (e.end_time && !isTime(hhmm(e.end_time))) errors.push('Čas konca má tvar 14:30.');
      const sameDay = !e.ends_on || e.ends_on === e.starts_on;
      if (sameDay && isTime(hhmm(e.start_time)) && isTime(hhmm(e.end_time)) && hhmm(e.end_time) < hhmm(e.start_time)) {
        errors.push('Koniec je skôr než začiatok.');
      }
    }
    if (e.remind_minutes != null && e.remind_minutes !== '') {
      const m = Number(e.remind_minutes);
      if (!Number.isInteger(m) || m < 0 || m > 20160) errors.push('Pripomienka môže byť najviac 14 dní vopred.');
    }
    if (e.color && !/^#[0-9a-fA-F]{6}$/.test(e.color)) errors.push('Farba nie je platná.');
    return { ok: !errors.length, errors };
  }

  /** Z formulára riadok do danubra_events: prázdne → null, celý deň bez časov. */
  function eventRow(f = {}) {
    const s = (v) => { const t = String(v == null ? '' : v).trim(); return t || null; };
    const allDay = f.all_day === true || f.all_day === 'on' || f.all_day === 'true';
    const starts = s(f.starts_on);
    let ends = s(f.ends_on);
    if (ends && ends === starts) ends = null;
    const rm = f.remind_minutes == null || f.remind_minutes === '' ? null : Number(f.remind_minutes);
    return {
      title: s(f.title), kind: kindOf(f.kind)[0], starts_on: starts, ends_on: ends,
      start_time: allDay ? null : hhmm(s(f.start_time)), end_time: allDay ? null : hhmm(s(f.end_time)),
      all_day: allDay || !s(f.start_time), place: s(f.place), description: s(f.description),
      entity_type: s(f.entity_type), entity_id: s(f.entity_id), entity_label: s(f.entity_label),
      participants: Array.isArray(f.participants) ? f.participants.filter(Boolean) : [],
      remind_minutes: Number.isFinite(rm) ? rm : null, color: s(f.color),
    };
  }

  // ── Položky kalendára ───────────────────────────────────────────────────
  // Jeden tvar pre všetko, čo sa v kalendári ukáže:
  //   { key, layer, kind, id, title, sub, date, end, time, endTime, allDay,
  //     icon, color, overdue, done, cancelled, movable, open: { type, id },
  //     entity: { type, id, label }, who: { userId, name, memberIds } }
  const DOC_KIND = { a1: 'A1', id_card: 'Doklad totožnosti', passport: 'Pas', trade_licence: 'Živnostenský list',
    contract: 'Zmluva o dielo', insurance: 'Poistenie', medical: 'Zdravotná prehliadka', certificate: 'Doklad o odbornosti' };
  const ent = (type, id, label) => (type && id ? { type, id, label: label || '' } : null);
  const firstLine = (s, n = 90) => {
    const t = String(s || '').trim().split('\n')[0];
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
  };

  /** Deň, na ktorom úloha v kalendári stojí: odložená na neskôr stojí tam, kam sa odložila. */
  function taskDate(t) {
    const due = day(t && t.due_date), snz = day(t && t.postponed_to);
    if (snz && (!due || snz > due)) return snz;
    return due;
  }
  /** Pripomienka = úloha s časom, alebo z pripomienky udalosti. */
  const isReminder = (t) => !!(t && (t.due_time || t.source === 'event' || t.source === 'reminder'));

  function fromTask(t, today) {
    const date = taskDate(t);
    if (!t || !date) return null;
    const done = t.status === 'done', cancelled = t.status === 'cancelled';
    const rem = isReminder(t);
    const snoozed = day(t.postponed_to) && date === day(t.postponed_to) && day(t.due_date) && day(t.due_date) !== date;
    return {
      key: `task:${t.id}`, layer: rem ? 'reminders' : 'tasks', kind: 'task', id: t.id,
      title: String(t.title || 'Úloha'), sub: t.entity_label && !/^[0-9a-f]{8}-/i.test(t.entity_label) ? t.entity_label : '',
      date, end: null, time: hhmm(t.due_time), endTime: null, allDay: !t.due_time,
      icon: rem ? 'bell' : 'tasks', color: LAYER[rem ? 'reminders' : 'tasks'].color,
      overdue: !done && !cancelled && date < today, done, cancelled,
      movable: !done && !cancelled, high: t.priority === 'high' || t.priority === 'urgent',
      snoozedFrom: snoozed ? day(t.due_date) : null,
      open: { type: 'task', id: t.id }, entity: ent(t.entity_type, t.entity_id, t.entity_label),
      who: { userId: t.assigned_to || null, name: t.assigned_name || '', memberIds: [] },
    };
  }

  function fromEvent(e, today) {
    if (!e || !isDate(day(e.starts_on))) return null;
    const k = kindOf(e.kind);
    const end = day(e.ends_on) && day(e.ends_on) > day(e.starts_on) ? day(e.ends_on) : null;
    const allDay = !!e.all_day || !e.start_time;
    return {
      key: `event:${e.id}`, layer: 'events', kind: e.kind || 'other', id: e.id,
      title: String(e.title || k[1]), sub: e.place || '', date: day(e.starts_on), end,
      time: allDay ? null : hhmm(e.start_time), endTime: allDay ? null : hhmm(e.end_time), allDay,
      icon: k[2], color: /^#[0-9a-fA-F]{6}$/.test(e.color || '') ? e.color : LAYER.events.color,
      overdue: false, done: false, past: (end || day(e.starts_on)) < today, cancelled: false, movable: false,
      open: { type: 'event', id: e.id }, entity: ent(e.entity_type, e.entity_id, e.entity_label),
      who: { userId: e.created_by || null, name: '', memberIds: Array.isArray(e.participants) ? e.participants : [] },
      remind: e.remind_minutes == null ? null : Number(e.remind_minutes),
    };
  }

  function fromActivity(a, today, tz = TZ) {
    if (!a || !a.follow_up_at || a.done) return null;
    const at = localOf(a.follow_up_at, tz);
    if (!at) return null;
    const time = at.time && at.time !== '00:00' ? at.time : null;
    const e = ent(a.entity_type, a.entity_id);
    return {
      key: `activity:${a.id}`, layer: 'notes', kind: 'activity', id: a.id,
      title: firstLine(a.body) || 'Poznámka', sub: 'Poznámka s termínom', date: at.date, end: null,
      time, endTime: null, allDay: !time, icon: 'note', color: LAYER.notes.color,
      overdue: at.date < today, done: false, cancelled: false, movable: false,
      open: e ? { type: e.type, id: e.id } : { type: 'activity', id: a.id }, entity: e,
      who: { userId: a.created_by || null, name: '', memberIds: [] }, body: a.body || '',
    };
  }

  function fromLead(l, today) {
    const date = day(l && l.next_step_at);
    if (!date || l.status === 'rejected') return null;
    return {
      key: `lead:${l.id}`, layer: 'notes', kind: 'lead', id: l.id,
      title: String(l.next_step_text || 'Ďalší krok s firmou'), sub: l.name || 'Firma', date, end: null,
      time: null, endTime: null, allDay: true, icon: 'flag', color: LAYER.notes.color,
      overdue: date < today, done: false, cancelled: false, movable: false,
      open: { type: 'lead', id: l.id }, entity: ent('lead', l.id, l.name), who: null,
    };
  }

  function fromOutreach(o, today, leadName) {
    const at = o && o.next_followup_at ? localOf(o.next_followup_at) : null;
    if (!at || o.status !== 'sent' || o.replied_at) return null;
    const name = (leadName && leadName(o.lead_id)) || o.to_email || 'Firma';
    return {
      key: `outreach:${o.id}`, layer: 'notes', kind: 'outreach', id: o.id,
      title: 'Pripomenúť sa e-mailom', sub: name, date: at.date, end: null, time: null, endTime: null, allDay: true,
      icon: 'mail', color: LAYER.notes.color, overdue: at.date < today, done: false, cancelled: false, movable: false,
      open: o.lead_id ? { type: 'lead', id: o.lead_id } : null, entity: ent('lead', o.lead_id, name), who: null,
    };
  }

  function fromDoc(d, today) {
    const date = day(d && d.valid_to);
    if (!date) return null;
    const what = DOC_KIND[d.kind] || 'Doklad';
    return {
      key: `doc:${d.id}`, layer: 'docs', kind: 'doc', id: d.id,
      title: `${what} končí`, sub: d.worker_name || '', date, end: null, time: null, endTime: null, allDay: true,
      icon: 'shield', color: LAYER.docs.color, overdue: date < today, done: false, cancelled: false, movable: false,
      open: d.worker_id ? { type: 'worker', id: d.worker_id } : null, entity: ent('worker', d.worker_id, d.worker_name), who: null,
    };
  }

  function fromJob(s) {
    if (!s || ['cancelled', 'archived'].includes(s.status)) return [];
    const name = s.title || 'Zákazka';
    const out = [];
    const mk = (date, which) => ({
      key: `job:${which}:${s.id}`, layer: 'jobs', kind: `job_${which}`, id: s.id,
      title: which === 'start' ? 'Začiatok zákazky' : 'Koniec zákazky', sub: name, date, end: null,
      time: null, endTime: null, allDay: true, icon: which === 'start' ? 'site' : 'flag', color: LAYER.jobs.color,
      overdue: false, done: false, cancelled: false, movable: false,
      open: { type: 'subcontract', id: s.id }, entity: ent('subcontract', s.id, name), who: null,
    });
    if (day(s.date_from)) out.push(mk(day(s.date_from), 'start'));
    if (day(s.date_to)) out.push(mk(day(s.date_to), 'end'));
    return out;
  }

  function fromInvoice(i, today) {
    const date = day(i && i.due_date);
    if (!date || ['paid', 'cancelled', 'draft'].includes(i.status)) return null;
    return {
      key: `invoice:${i.id}`, layer: 'invoices', kind: 'invoice', id: i.id,
      title: `Splatnosť ${i.invoice_number || 'faktúry'}`, sub: i.partner_name || '', date, end: null,
      time: null, endTime: null, allDay: true, icon: 'invoices', color: LAYER.invoices.color,
      overdue: date < today, done: false, cancelled: false, movable: false,
      open: { type: 'invoice', id: i.id }, entity: ent('invoice', i.id, i.invoice_number), who: null,
    };
  }

  const LAYER_RANK = Object.fromEntries(LAYERS.map((l, i) => [l[0], i]));
  function sortItems(list) {
    return list.sort((a, b) => a.date.localeCompare(b.date)
      || (a.time ? 1 : 0) - (b.time ? 1 : 0)
      || String(a.time || '').localeCompare(String(b.time || ''))
      || (LAYER_RANK[a.layer] - LAYER_RANK[b.layer])
      || a.title.localeCompare(b.title, 'sk'));
  }

  /** Prekrýva sa položka s obdobím? Viacdňová udalosť aj keď začala skôr. */
  function inRange(it, from, to) {
    if (!from || !to) return true;
    return it.date <= to && (it.end || it.date) >= from;
  }

  /**
   * Všetky položky z jednotlivých zdrojov, zoradené. Ďalší krok pri firme
   * a pripomenutie e-mailom sa nezdvojí, keď k nim už je úloha (tie isté
   * sa zakladajú ako úlohy v Úlohách).
   *
   * @param {Object} src  { tasks, events, activities, leads, outreach, docs, jobs, invoices }
   * @param {Object} o    { today, from, to, leadName(id), tz }
   */
  function build(src = {}, o = {}) {
    const today = o.today || todayIn();
    const out = [];
    const seen = new Set();
    const push = (it) => {
      if (!it || seen.has(it.key) || !inRange(it, o.from, o.to)) return;
      seen.add(it.key); out.push(it);
    };
    const taskKeys = new Set();
    for (const t of (src.tasks || [])) {
      const it = fromTask(t, today);
      if (it && t.entity_type && t.entity_id && !it.cancelled) taskKeys.add(`${t.entity_type}:${t.entity_id}:${it.date}`);
      push(it);
    }
    for (const e of (src.events || [])) push(fromEvent(e, today));
    for (const a of (src.activities || [])) push(fromActivity(a, today, o.tz));
    for (const l of (src.leads || [])) {
      const it = fromLead(l, today);
      if (it && !taskKeys.has(`lead:${l.id}:${it.date}`)) push(it);
    }
    for (const r of (src.outreach || [])) {
      const it = fromOutreach(r, today, o.leadName);
      if (it && !taskKeys.has(`lead:${r.lead_id}:${it.date}`)) push(it);
    }
    for (const d of (src.docs || [])) push(fromDoc(d, today));
    for (const s of (src.jobs || [])) fromJob(s).forEach(push);
    for (const i of (src.invoices || [])) push(fromInvoice(i, today));
    return sortItems(out);
  }

  // ── Filtre ──────────────────────────────────────────────────────────────
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  /** Vrstvy, pri ktorých sa dá povedať, či sú moje. Termíny nie sú nikoho. */
  const PERSONAL = new Set(['tasks', 'reminders', 'events']);

  /**
   * Patrí položka tomuto človeku? `p` = { memberId, userId, name }.
   * Úloha: riešiteľ. Udalosť: účastník alebo kto ju zapísal.
   * Poznámka: kto ju napísal.
   */
  function isFor(it, p) {
    if (!it || !p) return false;
    const w = it.who || {};
    if (it.layer === 'events') {
      return (!!p.memberId && (w.memberIds || []).map(String).includes(String(p.memberId)))
        || (!(w.memberIds || []).length && !!p.userId && w.userId === p.userId);
    }
    if (it.kind === 'activity') return !!p.userId && w.userId === p.userId;
    return (!!p.userId && w.userId === p.userId) || (!!p.name && !!w.name && fold(w.name) === fold(p.name));
  }
  /** Podlieha položka filtru osoby? Termíny a ďalšie kroky firiem nie. */
  const personal = (it) => PERSONAL.has(it.layer) || it.kind === 'activity';

  /**
   * @param {Object} f  { layers: {kľúč: bool}, showDone, person: { memberId, userId, name } | null }
   */
  function filter(items, f = {}) {
    const layers = f.layers ? normalizeLayers(f.layers) : null;
    return (items || []).filter(it => {
      if (layers && !layers[it.layer]) return false;
      if (it.cancelled && !f.showDone) return false;
      if (it.kind === 'task' && it.done && !f.showDone) return false;
      if (f.person && personal(it) && !isFor(it, f.person)) return false;
      return true;
    });
  }

  /** Počty po vrstvách (na prepínačoch) — po filtri osoby a hotových, pred vrstvami. */
  function counts(items, f = {}) {
    const out = Object.fromEntries(LAYERS.map(l => [l[0], 0]));
    for (const it of filter(items, { ...f, layers: null })) out[it.layer]++;
    return out;
  }

  /**
   * Položky po dňoch. Viacdňová udalosť je v každom svojom dni
   * (`cont` = pokračuje z predošlého, `more` = pokračuje ďalej).
   * @returns {Map<string, Array>}
   */
  function byDay(items, from, to) {
    const map = new Map();
    for (let d = from; d <= to; d = addDays(d, 1)) map.set(d, []);
    for (const it of (items || [])) {
      const a = it.date > from ? it.date : from;
      const b = (it.end || it.date) < to ? (it.end || it.date) : to;
      for (let d = a; d <= b; d = addDays(d, 1)) {
        if (!map.has(d)) continue;
        map.get(d).push(it.end ? { ...it, cont: d > it.date, more: d < it.end } : it);
      }
    }
    return map;
  }

  /**
   * Agenda: najbližšie dni po týždňoch (KW). Prázdne dni sa vynechajú,
   * prázdny týždeň tiež.
   * @returns {[{ year, week, label, days: [{ date, items }] }]}
   */
  function agenda(items, from, days = 30) {
    const to = addDays(from, days - 1);
    const map = byDay(items, from, to);
    const weeks = [];
    let cur = null;
    for (const [date, list] of map) {
      if (!list.length) continue;
      const k = kw(date);
      if (!cur || cur.week !== k.week || cur.year !== k.year) {
        cur = { year: k.year, week: k.week, label: k.label, from: k.from, to: k.to, days: [] };
        weeks.push(cur);
      }
      cur.days.push({ date, items: list });
    }
    return weeks;
  }

  /** Presunutie úlohy na iný deň: termín sa posunie, odloženie sa zruší. */
  function movePatch(t, date) {
    const patch = { due_date: date };
    if (t && t.postponed_to) patch.postponed_to = null;
    return patch;
  }

  /**
   * Súhrn na Prehľad dňa: dnes a tento týždeň.
   * @returns {{ kw, today: { tasks, events }, week: { tasks, events } }}
   */
  function weekSummary(items, today) {
    const k = kw(today);
    const open = (items || []).filter(it => !it.cancelled && !(it.kind === 'task' && it.done));
    const inDay = (it, d) => it.date <= d && (it.end || it.date) >= d;
    const inWeek = (it) => it.date <= k.to && (it.end || it.date) >= k.from;
    const n = (pred, layers) => open.filter(it => layers.includes(it.layer) && pred(it)).length;
    return {
      kw: k,
      today: { tasks: n(it => inDay(it, today), ['tasks', 'reminders']), events: n(it => inDay(it, today), ['events']) },
      week: { tasks: n(inWeek, ['tasks', 'reminders']), events: n(inWeek, ['events']) },
    };
  }

  function plural(n, one, few, many) {
    const a = Math.abs(Number(n) || 0);
    if (a === 1) return one;
    if (a >= 2 && a <= 4) return few;
    return many;
  }

  const API = {
    TZ, LAYERS, LAYER, DEADLINES, EVENT_KINDS, COLORS, REMIND, ALL_DAY_AT, MONTHS, DAYS_SHORT, DAYS_LONG, DOC_KIND,
    day, isDate, isTime, addDays, diffDays, weekday, partsIn, todayIn, localOf,
    isoWeek, weekOf, rangeText, kw, monthOf, shiftMonth, monthTitle, monthGrid, dayText, dayLong, dayRel,
    normalizeLayers, kindOf, reminderFor, validateEvent, eventRow,
    taskDate, isReminder, fromTask, fromEvent, fromActivity, fromLead, fromOutreach, fromDoc, fromJob, fromInvoice,
    build, inRange, isFor, filter, counts, byDay, agenda, movePatch, weekSummary, plural,
  };
  if (typeof window !== 'undefined') window.DanubraCal = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
