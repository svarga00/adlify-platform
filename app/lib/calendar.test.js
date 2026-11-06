// ============================================================================
// Testy kalendára: KW (ISO týždeň), mriežky, položky, filtre, pripomienky
// Spustenie:  node app/lib/calendar.test.js
// ============================================================================
const C = require('./calendar.js');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}

console.log('Kalendárny týždeň (ISO 8601)');
{
  eq(C.isoWeek('2026-11-02'), { year: 2026, week: 45 }, 'pondelok 2. 11. 2026 je KW 45');
  eq(C.isoWeek('2026-11-08'), { year: 2026, week: 45 }, 'nedeľa 8. 11. 2026 je ešte KW 45');
  eq(C.isoWeek('2026-11-09'), { year: 2026, week: 46 }, 'ďalší pondelok KW 46');
  eq(C.isoWeek('2025-12-29'), { year: 2026, week: 1 }, '29. 12. 2025 je KW 1/2026');
  eq(C.isoWeek('2026-01-01'), { year: 2026, week: 1 }, '1. 1. 2026 (štvrtok) je KW 1');
  eq(C.isoWeek('2026-12-31'), { year: 2026, week: 53 }, '31. 12. 2026 je KW 53');
  eq(C.isoWeek('2027-01-03'), { year: 2026, week: 53 }, '3. 1. 2027 (nedeľa) patrí ešte do KW 53/2026');
  eq(C.isoWeek('2027-01-04'), { year: 2027, week: 1 }, '4. 1. 2027 je KW 1/2027');
  eq(C.isoWeek('2021-01-01'), { year: 2020, week: 53 }, '1. 1. 2021 je KW 53/2020');
  eq(C.isoWeek('2024-12-30'), { year: 2025, week: 1 }, '30. 12. 2024 je KW 1/2025');
}

console.log('\nRozsah týždňa a text');
{
  const w = C.weekOf('2026-11-05');
  eq([w.from, w.to, w.days.length, w.week], ['2026-11-02', '2026-11-08', 7, 45], 'štvrtok → pondelok až nedeľa');
  eq(C.weekOf('2026-11-08').from, '2026-11-02', 'nedeľa patrí k pondelku pred ňou');
  eq(C.rangeText('2026-11-02', '2026-11-08'), '2.–8. 11. 2026', 'v jednom mesiaci');
  eq(C.rangeText('2026-09-28', '2026-10-04'), '28. 9.–4. 10. 2026', 'cez mesiac');
  eq(C.rangeText('2025-12-29', '2026-01-04'), '29. 12. 2025–4. 1. 2026', 'cez rok');
  const k = C.kw('2026-11-02');
  eq([k.short, k.label, k.title], ['KW 45', 'KW 45 · 2.–8. 11. 2026', 'Kalendárny týždeň 45 · 2.–8. 11. 2026'], 'texty KW');
  eq(C.kw('2026-12-31').title, 'Kalendárny týždeň 53 · 28. 12. 2026–3. 1. 2027', 'KW 53 cez prelom roka');
  eq(C.kw('2025-12-29').short, 'KW 1', '29. 12. 2025 → KW 1');
}

console.log('\nDnešok v Bratislave');
{
  eq(C.todayIn(new Date('2026-11-01T23:30:00Z')), '2026-11-02', 'o 0:30 v Bratislave je už pondelok, hoci UTC je nedeľa');
  eq(C.todayIn(new Date('2026-07-31T22:30:00Z')), '2026-08-01', 'v lete +2 h');
  eq(C.todayIn(new Date('2026-11-02T10:00:00Z')), '2026-11-02', 'cez deň');
  eq(C.localOf('2026-11-04T09:00:00Z'), { date: '2026-11-04', time: '10:00' }, 'timestamptz → miestny čas');
  eq(C.localOf('2026-11-04'), { date: '2026-11-04', time: null }, 'holý dátum ostane');
}

console.log('\nMesiac');
{
  const g = C.monthGrid(2026, 11);
  eq([g.from, g.to, g.rows.length], ['2026-10-26', '2026-12-06', 6], 'november 2026: od pondelka 26. 10. po nedeľu 6. 12.');
  eq(g.rows.map(r => r.week), [44, 45, 46, 47, 48, 49], 'KW pri každom riadku');
  ok(g.rows[0].days[0].inMonth === false && g.rows[0].days[6].inMonth === true && g.rows[0].days[6].d === 1, 'dni mimo mesiaca sú označené');
  const f = C.monthGrid(2027, 2);
  eq([f.from, f.to, f.rows.length], ['2027-02-01', '2027-02-28', 4], 'február 2027 má presne štyri týždne');
  eq(C.monthGrid(2026, 1).rows[0].week, 1, 'január 2026 začína KW 1 (29. 12. 2025)');
  eq(C.monthGrid(2027, 1).rows[0].week, 53, 'január 2027 začína KW 53/2026');
  eq(C.shiftMonth(2026, 12, 1), { year: 2027, month: 1 }, 'z decembra na január');
  eq(C.monthTitle(2026, 11), 'November 2026', 'nadpis mesiaca');
  eq(C.dayLong('2026-11-02', '2026-11-02'), 'pondelok 2. 11.', 'deň slovom');
  eq(C.dayText('2027-01-04', '2026-11-02'), '4. 1. 2027', 'iný rok aj s rokom');
}

console.log('\nPoložky z úloh');
{
  const TODAY = '2026-11-04';
  const t = (id, o) => ({ id, title: `Úloha ${id}`, status: 'open', priority: 'normal', ...o });
  const a = C.fromTask(t('a', { due_date: '2026-11-02' }), TODAY);
  ok(a.layer === 'tasks' && a.overdue && a.movable && a.date === '2026-11-02', 'po termíne je označená a dá sa presunúť');
  const b = C.fromTask(t('b', { due_date: '2026-11-02', postponed_to: '2026-11-06' }), TODAY);
  ok(b.date === '2026-11-06' && b.snoozedFrom === '2026-11-02' && !b.overdue, 'odložená stojí na dni, kam sa odložila');
  const r = C.fromTask(t('r', { due_date: '2026-11-05', due_time: '09:30:00' }), TODAY);
  ok(r.layer === 'reminders' && r.time === '09:30' && !r.allDay, 'úloha s časom je pripomienka');
  ok(C.fromTask(t('e', { due_date: '2026-11-05', source: 'event' }), TODAY).layer === 'reminders', 'pripomienka z udalosti je pripomienka');
  const d = C.fromTask(t('d', { due_date: '2026-11-01', status: 'done' }), TODAY);
  ok(d.done && !d.overdue && !d.movable, 'hotová nie je po termíne a nepresúva sa');
  ok(C.fromTask(t('x', {}), TODAY) === null, 'bez termínu v kalendári nie je');
  eq(C.movePatch({ postponed_to: '2026-11-06' }, '2026-11-09'), { due_date: '2026-11-09', postponed_to: null }, 'presunutie zruší odloženie');
  eq(C.movePatch({}, '2026-11-09'), { due_date: '2026-11-09' }, 'bez odloženia len termín');
}

console.log('\nZostavenie zo všetkých zdrojov');
{
  const TODAY = '2026-11-04';
  const src = {
    tasks: [
      { id: 't1', title: 'Zavolať Müllerovi', status: 'open', due_date: '2026-11-05', entity_type: 'lead', entity_id: 'l1', entity_label: 'Müller Bau', assigned_to: 'u1', assigned_name: 'Štefan Varga' },
      { id: 't2', title: 'Hotové', status: 'done', due_date: '2026-11-03', assigned_to: 'u2' },
      { id: 't3', title: 'Zrušené', status: 'cancelled', due_date: '2026-11-03' },
      { id: 't1', title: 'Duplicita z druhého dotazu', status: 'open', due_date: '2026-11-05' },
    ],
    events: [
      { id: 'e1', title: 'Obhliadka Ulm', kind: 'site_visit', starts_on: '2026-11-04', start_time: '10:00', end_time: '12:00', place: 'Ulm', participants: ['m1'], created_by: 'u2' },
      { id: 'e2', title: 'Montáž', kind: 'other', starts_on: '2026-10-30', ends_on: '2026-11-03', all_day: true, participants: ['m2'], color: '#1F9D57' },
      { id: 'e3', title: 'Mimo', starts_on: '2026-12-20' },
      { id: 'e4', title: 'Porada', kind: 'meeting', starts_on: '2026-11-12', start_time: '08:00' },
    ],
    activities: [
      { id: 'a1', entity_type: 'worker', entity_id: 'w1', body: 'Overiť, či prišlo A1\nďalší riadok', follow_up_at: '2026-11-06T13:00:00Z', done: false, created_by: 'u1' },
      { id: 'a2', body: 'Hotové', follow_up_at: '2026-11-06T13:00:00Z', done: true },
    ],
    leads: [
      { id: 'l1', name: 'Müller Bau', next_step_at: '2026-11-05', next_step_text: 'Zavolať' },
      { id: 'l2', name: 'Huber GmbH', next_step_at: '2026-11-07', next_step_text: 'Poslať ponuku' },
    ],
    outreach: [
      { id: 'o1', lead_id: 'l3', status: 'sent', next_followup_at: '2026-11-06T08:00:00Z' },
      { id: 'o2', lead_id: 'l3', status: 'sent', replied_at: '2026-11-01', next_followup_at: '2026-11-06T08:00:00Z' },
    ],
    docs: [{ id: 'd1', worker_id: 'w1', worker_name: 'Ján Kováčik', kind: 'a1', valid_to: '2026-11-08' }],
    jobs: [{ id: 's1', title: 'Wohnpark Feuerbach', status: 'active', date_from: '2026-11-02', date_to: '2026-12-18' }],
    invoices: [
      { id: 'i1', invoice_number: 'FA-2026-0045', status: 'sent', due_date: '2026-11-06' },
      { id: 'i2', invoice_number: 'FA-2026-0044', status: 'paid', due_date: '2026-11-06' },
    ],
  };
  const items = C.build(src, { today: TODAY, from: '2026-11-02', to: '2026-11-08', leadName: (id) => (id === 'l3' ? 'Keller Akustik' : null) });
  const keys = items.map(i => i.key);
  ok(keys.filter(k => k === 'task:t1').length === 1, 'úloha z dvoch dotazov je raz');
  ok(keys.includes('event:e1') && keys.includes('event:e2') && !keys.includes('event:e3'), 'udalosti v týždni aj viacdňová, ktorá začala skôr; mimo týždňa nie');
  ok(!keys.includes('lead:l1') && keys.includes('lead:l2'), 'ďalší krok firmy sa nezdvojí s úlohou na ten istý deň');
  ok(keys.includes('outreach:o1') && !keys.includes('outreach:o2'), 'pripomenutie e-mailom len keď neodpísali');
  ok(items.find(i => i.key === 'outreach:o1').sub === 'Keller Akustik', 'pri pripomenutí je meno firmy');
  ok(keys.includes('activity:a1') && !keys.includes('activity:a2'), 'poznámka s termínom, vybavená nie');
  const a1 = items.find(i => i.key === 'activity:a1');
  ok(a1.title === 'Overiť, či prišlo A1' && a1.time === '14:00' && a1.open.type === 'worker', 'poznámka: prvý riadok, miestny čas, otvorí záznam');
  ok(keys.includes('doc:d1') && items.find(i => i.key === 'doc:d1').title === 'A1 končí', 'končiace A1');
  ok(keys.includes('job:start:s1') && !keys.includes('job:end:s1'), 'začiatok zákazky v týždni, koniec mimo');
  ok(keys.includes('invoice:i1') && !keys.includes('invoice:i2'), 'splatnosť len nezaplatenej faktúry');
  const order = items.filter(i => i.date === '2026-11-04').map(i => i.key);
  ok(order[order.length - 1] === 'event:e1', 'v rámci dňa celodenné pred tými s časom', order.join());

  console.log('\nFiltre, počty a vrstvy');
  const def = C.filter(items, {});
  ok(!def.some(i => i.key === 'task:t2') && !def.some(i => i.key === 'task:t3'), 'predvolene bez hotových a zrušených');
  ok(C.filter(items, { showDone: true }).some(i => i.key === 'task:t2'), 's „Hotové" aj hotové');
  const me = { memberId: 'm1', userId: 'u1', name: 'Štefan Varga' };
  const mine = C.filter(items, { person: me }).map(i => i.key);
  ok(mine.includes('task:t1') && mine.includes('event:e1') && !mine.includes('event:e2'), 'Len moje: moja úloha, udalosť, kde som účastník; cudzia nie');
  ok(mine.includes('activity:a1') && mine.includes('doc:d1') && mine.includes('invoice:i1') && mine.includes('lead:l2'), 'termíny a ďalšie kroky firiem nie sú nikoho — ostanú');
  ok(C.isFor({ layer: 'tasks', who: { name: 'stefan varga' } }, { name: 'Štefan Varga' }), 'meno sa porovná bez diakritiky');
  ok(C.isFor({ layer: 'events', who: { userId: 'u1', memberIds: [] } }, me), 'udalosť bez účastníkov patrí tomu, kto ju zapísal');
  const off = C.filter(items, { layers: { docs: false, invoices: false } });
  ok(!off.some(i => i.layer === 'docs' || i.layer === 'invoices') && off.some(i => i.layer === 'events'), 'vypnuté vrstvy zmiznú');
  const c = C.counts(items, {});
  ok(c.tasks === 1 && c.events === 2 && c.notes === 3 && c.docs === 1 && c.jobs === 1 && c.invoices === 1, 'počty na prepínačoch', JSON.stringify(c));
  eq(C.normalizeLayers({ docs: false }).docs, false, 'uložená voľba vrstvy platí');
  eq(C.normalizeLayers(null).reminders, true, 'neznáma vrstva je zapnutá');

  console.log('\nPo dňoch a agenda po KW');
  const map = C.byDay(def, '2026-11-02', '2026-11-08');
  ok(map.size === 7 && map.get('2026-11-02').some(i => i.key === 'event:e2' && i.cont && i.more), 'viacdňová udalosť je v každom dni (pokračuje)');
  ok(map.get('2026-11-03').some(i => i.key === 'event:e2' && !i.more), 'posledný deň viacdňovej');
  ok(!map.get('2026-11-04').some(i => i.key === 'event:e2'), 'po konci už nie');
  const ag = C.agenda(C.build(src, { today: TODAY, from: '2026-11-04', to: '2026-12-31' }), '2026-11-04', 30);
  ok(ag.length >= 2 && ag[0].label === 'KW 45 · 2.–8. 11. 2026' && ag[0].days[0].date === '2026-11-04' && ag[1].label.startsWith('KW 46'), 'agenda je po KW, od dneška', JSON.stringify(ag.map(w => w.label)));
  ok(ag.every(w => w.days.every(d => d.items.length)), 'prázdne dni sa vynechajú');
  const sum = C.weekSummary(def, TODAY);
  ok(sum.kw.week === 45 && sum.today.events === 1 && sum.week.tasks === 1 && sum.week.events === 2, 'súhrn na Prehľad dňa', JSON.stringify(sum));
}

console.log('\nUdalosti: kontrola a pripomienka');
{
  ok(!C.validateEvent({}).ok, 'bez názvu a dňa neprejde');
  ok(C.validateEvent({ title: 'Stretnutie', starts_on: '2026-11-05', start_time: '10:00', end_time: '11:00' }).ok, 'platná udalosť');
  ok(!C.validateEvent({ title: 'X', starts_on: '2026-11-05', ends_on: '2026-11-04' }).ok, 'koniec pred začiatkom nie');
  ok(!C.validateEvent({ title: 'X', starts_on: '2026-11-05', start_time: '10:00', end_time: '09:00' }).ok, 'v ten istý deň koniec pred začiatkom nie');
  ok(!C.validateEvent({ title: 'X', starts_on: '2026-11-05', start_time: '25:00' }).ok, 'zlý čas nie');
  ok(!C.validateEvent({ title: 'X', starts_on: '2026-11-05', remind_minutes: 99999 }).ok, 'pripomienka priďaleko nie');
  const row = C.eventRow({ title: ' Obhliadka ', starts_on: '2026-11-05', ends_on: '2026-11-05', start_time: '10:00', kind: 'nieco', remind_minutes: '60', participants: ['m1', ''] });
  ok(row.title === 'Obhliadka' && row.ends_on === null && row.kind === 'other' && row.all_day === false && row.remind_minutes === 60 && row.participants.length === 1, 'riadok z formulára', JSON.stringify(row));
  const allDay = C.eventRow({ title: 'X', starts_on: '2026-11-05', all_day: true, start_time: '10:00' });
  ok(allDay.all_day && allDay.start_time === null, 'celý deň bez časov');
  eq(C.reminderFor({ title: 'Stretnutie Müller', starts_on: '2026-11-05', start_time: '10:00' }, 30),
    { due_date: '2026-11-05', due_time: '09:30', title: 'Pripomienka: Stretnutie Müller (5. 11. o 10:00)' }, '30 minút pred');
  eq(C.reminderFor({ title: 'X', starts_on: '2026-11-05', start_time: '00:15' }, 60).due_date, '2026-11-04', 'cez polnoc na predošlý deň');
  eq(C.reminderFor({ title: 'X', starts_on: '2026-11-05', all_day: true }, 1440), { due_date: '2026-11-04', due_time: '08:00', title: 'Pripomienka: X (5. 11.)' }, 'celodenná: od 8:00, deň pred');
  ok(C.reminderFor({ title: 'X', starts_on: '2026-11-05' }, null) === null, 'bez pripomienky nič');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
