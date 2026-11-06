// ============================================================================
// Testy prehľadu oslovovania pre vedenie (lib/marketing/report.js)
// Spustenie:  node app/lib/marketing/report.test.js
// ============================================================================
// Stráži sa: obdobia a porovnanie (do dneška, rovnako dlhý začiatok
// predošlého), KW aj cez prelom roka, automatické otvorenia sa nerátajú,
// oprava kontaktu platí namiesto pôvodného, kohorta lievika (prvýkrát
// oslovené v období), kto čo urobil (e-mail podľa sent_by, hovor podľa
// our_member_id, kategória podľa toho, kto ju zmenil), remeslá, regióny,
// zdroje, hľadania, „Čo treba riešiť" a export.
// ============================================================================
const R = require('./report.js');

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
const sorted = (a) => [...a].sort();

// ── Obdobia ─────────────────────────────────────────────────────────────────
console.log('Obdobia a porovnanie');
{
  const kw = R.period('kw', '2026-11-06');
  eq([kw.from, kw.end, kw.to], ['2026-11-02', '2026-11-08', '2026-11-06'], 'tento KW: pondelok až nedeľa, ráta sa do dneška');
  eq(kw.title, 'KW 45 · 2.–8. 11. 2026', 'nadpis s číslom KW');
  const pk = R.previous(kw);
  eq([pk.from, pk.to], ['2026-10-26', '2026-10-30'], 'porovnáva sa s pondelkom až piatkom minulého KW');
  const last = R.period('lastkw', '2026-11-06');
  eq([last.from, last.to], ['2026-10-26', '2026-11-01'], 'minulý KW celý');
  eq([R.previous(last).from, R.previous(last).to], ['2026-10-19', '2026-10-25'], 'a pred ním KW 43');
  const k4 = R.period('kw4', '2026-11-06');
  eq([k4.from, k4.end], ['2026-10-12', '2026-11-08'], 'posledné 4 KW: KW 42 až 45');
  eq(R.previous(k4).from, '2026-09-14', 'porovnanie: 4 KW predtým');
  const m = R.period('month', '2026-11-06');
  eq([m.from, m.to, m.title], ['2026-11-01', '2026-11-06', 'November 2026'], 'tento mesiac do dneška');
  eq([R.previous(m).from, R.previous(m).to], ['2026-10-01', '2026-10-06'], '1.–6. 11. sa porovná s 1.–6. 10.');
  const mar = R.previous(R.period('month', '2026-03-31'));
  eq([mar.from, mar.to], ['2026-02-01', '2026-02-28'], 'kratší predošlý mesiac sa neprelezie');
  const m3 = R.period('m3', '2026-01-15');
  eq([m3.from, m3.end], ['2025-11-01', '2026-01-31'], 'posledné 3 mesiace cez prelom roka');
  const c = R.period('custom', '2026-11-06', { from: '2026-10-10', to: '2026-10-01' });
  eq([c.from, c.to], ['2026-10-01', '2026-10-10'], 'vlastné obdobie s prehodenými dátumami sa otočí');
  eq([R.previous(c).from, R.previous(c).to], ['2026-09-21', '2026-09-30'], 'porovnanie vlastného: rovnako dlho tesne pred ním');
  const f = R.period('custom', '2026-11-06', { from: '2026-11-01', to: '2026-12-31' });
  eq(f.to, '2026-11-06', 'budúcnosť sa nepočíta — koniec je dnešok');
  eq(R.period('nezmysel', '2026-11-06').key, 'kw', 'neznáme obdobie = tento KW');
}

console.log('KW cez prelom roka');
{
  const w = R.weeksBack('2027-01-06', 3);
  eq(w.map(x => `${x.week}/${x.year}`), ['52/2026', '53/2026', '1/2027'], 'KW 52, 53 (2026 má 53 týždňov) a KW 1/2027');
  eq(w[1].to, '2027-01-03', 'KW 53 končí v nedeľu 3. 1. 2027');
  const data = {
    leads: [{ id: 'a', created_at: '2026-12-01T10:00:00Z' }, { id: 'b', created_at: '2026-12-01T10:00:00Z' }, { id: 'c', created_at: '2026-12-01T10:00:00Z' }],
    outreach: [
      { id: 'o1', lead_id: 'a', status: 'sent', step: 1, sent_at: '2026-12-31T10:00:00Z' },
      { id: 'o2', lead_id: 'b', status: 'sent', step: 1, sent_at: '2027-01-02T09:00:00Z' },
      { id: 'o3', lead_id: 'c', status: 'sent', step: 1, sent_at: '2027-01-04T09:00:00Z' },
    ],
  };
  const r = R.build(data, { today: '2027-01-06', period: 'kw' });
  const kw53 = r.trend.find(x => x.week === 53), kw1 = r.trend.find(x => x.week === 1);
  eq([kw53.contacted, kw53.emails], [2, 2], '31. 12. 2026 aj 2. 1. 2027 sú v KW 53');
  eq(kw1.contacted, 1, 'pondelok 4. 1. 2027 je KW 1');
  eq(r.trend.length, 12, 'trend má 12 KW');
  eq(r.trend[11].week, 1, 'posledný stĺpec je KW obdobia');
  // Polnoc v Bratislave: 23:30 UTC 3. 1. je už pondelok 4. 1. miestneho času.
  const r2 = R.build({ leads: [{ id: 'x', created_at: '2026-12-01T10:00:00Z' }],
    outreach: [{ id: 'o', lead_id: 'x', status: 'sent', sent_at: '2027-01-03T23:30:00Z' }] }, { today: '2027-01-06' });
  eq(r2.trend.find(x => x.week === 1).contacted, 1, 'čas sa ráta v Bratislave (23:30 UTC v nedeľu = pondelok)');
}

// ── Vzorové dáta ────────────────────────────────────────────────────────────
const MEMBERS = [
  { id: 'm1', user_id: 'u1', full_name: 'Štefan Varga', active: true },
  { id: 'm2', user_id: 'u2', full_name: 'Jana Kováčová', active: true },
  { id: 'm3', user_id: 'u3', full_name: 'Michal Horváth', active: true },
];
const TODAY = '2026-11-06';
function sample() {
  return {
    members: MEMBERS,
    leads: [
      // L1: nájdená v KW 45, e-mail od Štefana, odpoveď, záujem (Jana zmenila kategóriu)
      { id: 'L1', name: 'Müller Bau GmbH', city: 'Ulm', postal_code: '89073', region: '', source: 'outscraper', seed_search_id: 's1',
        status: 'interested', status_changed_at: '2026-11-05T09:00:00Z', status_changed_by: 'u2', created_at: '2026-11-02T08:00:00Z', trade_keys: ['trockenbau'] },
      // L2: nájdená skôr, hovor Michala v KW 45 so stretnutím, potom ponuka
      { id: 'L2', name: 'Huber Innenausbau', city: 'München', region: 'Bayern', source: 'urls', seed_search_id: 's1',
        status: 'offer', status_changed_at: '2026-11-06T07:00:00Z', status_changed_by: 'u3', created_at: '2026-10-01T08:00:00Z', trade_keys: ['trockenbau'] },
      // L3: oslovená v KW 44 (e-mail), v KW 45 už len pripomenutie — prvé oslovenie nie je v KW 45
      { id: 'L3', name: 'Keller Maler', city: 'Stuttgart', postal_code: '70173', source: 'ai', status: 'contacted',
        status_changed_at: '2026-10-28T10:00:00Z', status_changed_by: 'u1', created_at: '2026-10-20T08:00:00Z', trade_keys: ['maliar'] },
      // L4: od kolegu, nová, nikto ju neoslovil
      { id: 'L4', name: 'Brandl Fliesen', city: 'Augsburg', source: 'kolega', tip_by: 'Michal', status: 'new', created_at: '2026-11-03T08:00:00Z', trade_keys: ['obkladac'] },
      // L5: hovor v KW 45, nemá záujem
      { id: 'L5', name: 'Schmid Elektro', city: 'Köln', postal_code: '50667', source: 'manual', status: 'rejected',
        status_changed_at: '2026-11-04T12:00:00Z', status_changed_by: 'u1', created_at: '2026-09-01T08:00:00Z', trade_keys: ['elektrikar'] },
      // L6: odberateľ (Urobiť odberateľa) v KW 45, oslovená v septembri
      { id: 'L6', name: 'Fischer Bau', city: 'Dresden', postal_code: '01067', source: 'outscraper', status: 'won', partner_id: 'p9',
        status_changed_at: '2026-11-04T08:00:00Z', status_changed_by: 'u1', created_at: '2026-08-01T08:00:00Z', trade_keys: ['bau'] },
      // L7: odpísala na e-mail v KW 45, nik jej neodpovedal
      { id: 'L7', name: 'Wagner Trockenbau', city: 'Ulm', postal_code: '89075', source: 'outscraper', seed_search_id: 's2', status: 'replied',
        status_changed_at: '2026-11-03T15:00:00Z', created_at: '2026-10-25T08:00:00Z', trade_keys: ['trockenbau'] },
    ],
    outreach: [
      { id: 'o1', lead_id: 'L1', step: 1, status: 'sent', sent_at: '2026-11-02T09:00:00Z', sent_by: 'u1', opened_at: '2026-11-02T11:00:00Z',
        clicked_at: '2026-11-02T11:05:00Z', replied_at: '2026-11-03T08:00:00Z' },
      { id: 'o3a', lead_id: 'L3', step: 1, status: 'sent', sent_at: '2026-10-28T09:00:00Z', sent_by: 'u1' },
      // Len automatické otvorenie (Apple Mail) — nepočíta sa ako otvorené
      { id: 'o3b', lead_id: 'L3', step: 2, status: 'sent', sent_at: '2026-11-04T09:00:00Z', sent_by: 'u2', auto_opened_at: '2026-11-04T09:00:30Z', auto_open_count: 1 },
      { id: 'o6', lead_id: 'L6', step: 1, status: 'sent', sent_at: '2026-09-10T09:00:00Z', sent_by: 'u1', opened_at: '2026-09-10T10:00:00Z', replied_at: '2026-09-11T10:00:00Z' },
      { id: 'o7', lead_id: 'L7', step: 1, status: 'sent', sent_at: '2026-10-29T09:00:00Z', sent_by: 'u2', replied_at: '2026-11-03T14:00:00Z' },
      // Nedoručené v KW 45
      { id: 'o8', lead_id: 'L4', step: 1, status: 'bounced', sent_at: '2026-11-05T09:00:00Z', sent_by: 'u2', bounced_at: '2026-11-05T09:01:00Z' },
      // Neodoslané (koncept) — nikde sa nepočíta
      { id: 'o9', lead_id: 'L5', step: 1, status: 'draft', sent_at: null, sent_by: 'u1' },
    ],
    contacts: [
      { id: 'c1', lead_id: 'L2', kind: 'call', direction: 'out', outcome: 'meeting_set', our_member_id: 'm3', our_member_name: 'Michal Horváth',
        happened_at: '2026-11-03T10:00:00Z', duration_min: 12, created_at: '2026-11-03T10:15:00Z' },
      // Oprava: pôvodne „Nedvíha", oprava hovorí „Nemá záujem" a 7 minút
      { id: 'c2', lead_id: 'L5', kind: 'call', direction: 'out', outcome: 'no_answer', our_member_id: 'm1', happened_at: '2026-11-04T11:00:00Z', duration_min: 1, created_at: '2026-11-04T11:02:00Z' },
      { id: 'c2b', lead_id: 'L5', kind: 'call', direction: 'out', outcome: 'not_interested', our_member_id: 'm1', happened_at: '2026-11-04T11:00:00Z', duration_min: 7, corrects_id: 'c2', created_at: '2026-11-04T11:30:00Z' },
      // Poznámka sa za oslovenie nepočíta
      { id: 'c3', lead_id: 'L4', kind: 'note', direction: 'out', our_member_id: 'm2', happened_at: '2026-11-04T08:00:00Z', created_at: '2026-11-04T08:00:00Z' },
      // Archivovaný hovor sa nepočíta
      { id: 'c4', lead_id: 'L3', kind: 'call', direction: 'out', outcome: 'interested', our_member_id: 'm2', happened_at: '2026-11-04T08:00:00Z', archived_at: '2026-11-04T09:00:00Z' },
    ],
    activities: [
      { id: 'a1', entity_type: 'lead', entity_id: 'L1', type: 'change', source: 'lead_status', body: 'Kategória: Oslovená → Odpísala', created_at: '2026-11-03T08:00:00Z', created_by: null },
      { id: 'a2', entity_type: 'lead', entity_id: 'L1', type: 'change', source: 'lead_status', body: 'Kategória: Odpísala → Má záujem', created_at: '2026-11-05T09:00:00Z', created_by: 'u2' },
      { id: 'a3', entity_type: 'lead', entity_id: 'L2', type: 'change', source: 'lead_status', body: 'Kategória: Nová → Stretnutie', created_at: '2026-11-03T10:15:00Z', created_by: 'u3' },
      { id: 'a4', entity_type: 'lead', entity_id: 'L2', type: 'change', source: 'lead_status', body: 'Kategória: Stretnutie → Ponuka', created_at: '2026-11-06T07:00:00Z', created_by: 'u3' },
      { id: 'a5', entity_type: 'lead', entity_id: 'L6', type: 'change', source: 'lead_status', body: 'Kategória: Ponuka → Je odberateľ', created_at: '2026-11-04T08:00:00Z', created_by: 'u1' },
      // Iná poznámka pri firme (nie zmena kategórie) sa ignoruje
      { id: 'a6', entity_type: 'lead', entity_id: 'L4', type: 'note', source: 'marketing', body: 'Kategória: Nová → Je odberateľ', created_at: '2026-11-04T08:00:00Z', created_by: 'u1' },
    ],
    events: [
      { id: 'e1', entity_type: 'lead', entity_id: 'L2', kind: 'meeting', title: 'Stretnutie Huber', starts_on: '2026-11-05', start_time: '10:00:00', created_at: '2026-11-03T10:20:00Z', created_by: 'u3' },
      { id: 'e2', entity_type: 'subcontract', entity_id: 's1', kind: 'meeting', title: 'Iné', starts_on: '2026-11-05' },
    ],
    tasks: [
      { id: 't1', entity_type: 'lead', entity_id: 'L3', status: 'open', title: 'Zavolať Kellerovi', due_date: '2026-11-02', assigned_to: 'u2', assigned_name: 'Jana Kováčová' },
      { id: 't2', entity_type: 'lead', entity_id: 'L1', status: 'done', title: 'Hotové', due_date: '2026-11-01', assigned_to: 'u1' },
      // Odložená na zajtra — nie je po termíne
      { id: 't3', entity_type: 'lead', entity_id: 'L2', status: 'open', title: 'Poslať ponuku', due_date: '2026-11-04', postponed_to: '2026-11-07', assigned_to: 'u3' },
    ],
    tips: [
      { id: 'tp1', submitted_by_name: 'Michal', status: 'added', lead_id: 'L4', created_at: '2026-11-03T07:00:00Z' },
      { id: 'tp2', submitted_by_name: 'Michal', status: 'new', created_at: '2026-11-03T07:00:00Z' },
      { id: 'tp3', submitted_by_name: 'Peter Kolár', status: 'duplicate', created_at: '2026-11-04T07:00:00Z' },
    ],
    searches: [{ id: 's1', kind: 'urls', source: 'outscraper', created_at: '2026-10-01T08:00:00Z', params: { urls: ['https://mueller-bau.de'] } },
      { id: 's2', kind: 'urls', created_at: '2026-10-20T08:00:00Z', params: { urls: ['https://wagner.de'] } }],
  };
}

console.log('Časová os firmy');
{
  const d = sample();
  const T = R.timelines({ ...d, contacts: R.effectiveContacts(d.contacts) }, R.people(d.members));
  eq(T.get('L1').reach[1].date, '2026-11-02', 'L1 oslovená e-mailom 2. 11.');
  eq(T.get('L1').reach[1].actor, 'm1', 'e-mail sa pripíše tomu, kto ho poslal (sent_by → člen)');
  eq(T.get('L1').reach[2].actor, 'm1', 'odpoveď na e-mail tiež odosielateľovi');
  eq(T.get('L1').reach[3].actor, 'm2', 'záujem tomu, kto zmenil kategóriu (Jana)');
  eq([T.get('L2').reach[1].date, T.get('L2').reach[1].actor], ['2026-11-03', 'm3'], 'L2 oslovená hovorom 3. 11.');
  ok(['call', 'outcome:meeting_set'].includes(T.get('L2').reach[1].via), 'hovor sa pripíše našemu človeku z kontaktu (our_member_id)');
  eq(T.get('L2').reach[4].date, '2026-11-03', 'stretnutie dohodnuté pri hovore');
  eq(T.get('L2').reach[5].date, '2026-11-06', 'ponuka z histórie kategórie');
  eq(T.get('L4').reach[1], undefined, 'poznámka ani nedoručený e-mail nie sú oslovenie (L4)');
  eq(T.get('L6').reach[5].date, '2026-09-11', '„Ponuka → Je odberateľ": ponuka bola skôr (posledný známy krok pred zmenou)');
  eq(T.get('L5').rejected.date, '2026-11-04', 'oprava kontaktu „Nemá záujem" platí namiesto „Nedvíha"');
  eq(T.get('L3').reach[3], undefined, 'archivovaný hovor sa nepočíta');
  eq(T.get('L6').reach[1].date, '2026-09-10', 'odberateľ L6 bol oslovený v septembri');
  ok(!T.get('L4').reach[6], 'poznámka v histórii (nie lead_status) nezmení krok');
  eq(R.parseChange('Kategória: Nová → Je odberateľ'), { from: 'new', to: 'won' }, 'história kategórie sa prečíta');
  eq(R.parseChange('niečo iné'), null, 'iný text nie je zmena');
}

console.log('Čísla za KW 45');
{
  const r = R.build(sample(), { today: TODAY, period: 'kw' });
  const k = r.kpi;
  eq(sorted(k.found.ids), ['L1', 'L4'], 'nové firmy: pridané v KW 45');
  eq(sorted(k.contacted.ids), ['L1', 'L2', 'L5'], 'oslovené prvýkrát v KW 45 (L3 už v KW 44 — pripomenutie sa nepočíta; L4 nedoručené)');
  eq([k.calls.calls, k.calls.minutes, k.calls.connected], [2, 19, 2], 'hovory: 2, 19 minút (z opravy), oba sa dovolali');
  eq(k.emails.sent, 3, 'e-maily: odoslané a nedoručené v KW 45, koncept nie');
  eq([k.emails.first, k.emails.followups], [2, 1], 'prvé e-maily a pripomenutia');
  eq(k.emails.opened, 1, 'otvorené len človekom — automatické otvorenie sa nepočíta');
  eq(k.emails.autoOnly, 1, 'automatické otvorenie je zvlášť');
  eq([k.emails.clicked, k.emails.replied, k.emails.bounced], [1, 1, 1], 'klik, odpoveď, nedoručené');
  eq([k.emails.openRate, k.emails.bounceRate], [33.3, 33.3], 'percentá z odoslaných na jedno desatinné miesto');
  eq(sorted(k.replied.ids), ['L1', 'L2', 'L5', 'L7'], 'reagovali v KW 45 (aj „Nemá záujem" je reakcia)');
  eq(sorted(k.interested.ids), ['L1', 'L2'], 'záujem: L1 a L2 (stretnutie znamená aj záujem)');
  eq(k.meeting.ids, ['L2'], 'stretnutia: L2');
  eq(k.offer.ids, ['L2'], 'ponuky: L2');
  eq(k.won.ids, ['L6'], 'noví odberatelia: L6');
  eq(k.rejected.ids, ['L5'], 'nemá záujem: L5');
  eq(k.meetingsCal, 1, 'stretnutia v kalendári pri firme v KW 45');
  eq(sorted(r.prevKpi.contacted.ids), ['L3', 'L7'], 'v porovnávanom období (26.–30. 10.) oslovené L3 a L7');
  eq([r.deltas.contacted.diff, r.deltas.contacted.dir, r.deltas.contacted.tone], [1, 'up', 'good'], 'rozdiel oproti minulému KW');
  eq(r.deltas.rejected.tone, 'bad', 'viac „Nemá záujem" je zlé');
  eq(R.delta(2, 2).dir, 'same', 'rovnako = bez šípky');
  eq(R.delta(5, 0).pct, null, 'z nuly sa percento nerobí');
}

console.log('Lievik');
{
  const r = R.build(sample(), { today: TODAY, period: 'kw' });
  const s = Object.fromEntries(r.funnel.steps.map(x => [x.key, x.n]));
  eq(s, { found: 2, contacted: 3, replied: 3, interested: 2, meeting: 1, offer: 1, won: 0 }, 'kohorta oslovených v KW 45 a kam sa dostali');
  const st = r.funnel.steps;
  eq(st[1].conv, 50, 'Nájdené → Oslovené: z 2 nájdených je oslovená 1');
  eq(st[2].conv, 100, 'Oslovené → Reagovali 3 z 3');
  eq(st[3].conv, 66.7, 'Reagovali → Záujem 2 z 3');
  eq(st[6].conv, 0, 'Ponuka → Odberateľ 0');
  const f = R.build(sample(), { today: TODAY, period: 'kw', funnel: 'found' });
  eq(f.funnel.steps.map(x => x.n), [2, 1, 1, 1, 0, 0, 0], 'kohorta nájdených v KW 45');
  // Odberateľ L6 bol oslovený v septembri — do kohorty KW 45 nepatrí, aj keď sa stal odberateľom teraz.
  ok(!r.funnel.steps[6].ids.includes('L6'), 'odberateľ oslovený skôr nie je v kohorte, je v dlaždici Noví odberatelia');
  const m = R.build(sample(), { today: TODAY, period: 'm3' });
  ok(m.funnel.steps[6].ids.includes('L6'), 'za 3 mesiace je L6 v kohorte aj ako odberateľ');
}

console.log('Po kolegoch');
{
  const r = R.build(sample(), { today: TODAY, period: 'kw' });
  const by = Object.fromEntries(r.members.map(m => [m.key, m]));
  eq([by.m1.contacted, by.m1.emails, by.m1.calls, by.m1.minutes], [2, 1, 1, 7], 'Štefan: L1 e-mailom, L5 hovorom; 1 e-mail, 1 hovor 7 min');
  eq([by.m2.emails, by.m2.contacted, by.m2.interested], [2, 0, 1], 'Jana: 2 e-maily (pripomenutie a nedoručený), nikoho prvýkrát, záujem L1');
  eq([by.m1.replied, by.m2.replied, by.m3.replied], [2, 1, 1], 'reakcie: odpoveď na e-mail tomu, kto ho poslal (L7 Jane), hovor volajúcemu');
  eq([by.m3.calls, by.m3.minutes, by.m3.meeting, by.m3.offer], [1, 12, 1, 1], 'Michal: hovor 12 min, stretnutie a ponuka');
  eq(by.m1.won, 1, 'odberateľa pripíše tomu, kto zmenil kategóriu');
  eq(by.m2.overdue, 1, 'Jana má 1 ďalší krok po termíne (úloha pri L3)');
  eq([by.m3.tipsSent, by.m3.tipsAdded], [2, 1], 'odkazy od „Michal" patria Michalovi Horváthovi (jediný Michal)');
  const peter = r.members.find(m => m.key === 'n:peter kolar');
  ok(peter && peter.tipsSent === 1 && !peter.member, 'kolega mimo appky má vlastný riadok');
  const anon = R.build({ members: MEMBERS, leads: [{ id: 'x', status: 'interested', status_changed_at: '2026-11-04T08:00:00Z', created_at: '2026-10-01T08:00:00Z' }] }, { today: TODAY }).members.find(m => m.key === '');
  eq(anon && [anon.name, anon.interested], ['Neuvedené', 1], 'zmena bez známeho autora (server) je „Neuvedené"');
  eq(r.members.filter(m => m.member).length, 3, 'všetci aktívni členovia sú v tabuľke, aj s nulami');
  const P = R.people(MEMBERS);
  eq(P.key({ user: 'u2' }), 'm2', 'používateľ → člen');
  eq(P.key({ member: 'zz', name: 'Jana Kovacova' }), 'm2', 'meno bez diakritiky → člen');
  eq(P.key({}), '', 'nikto = prázdny kľúč');
}

console.log('Remeslá, regióny, zdroje, hľadania');
{
  const r = R.build(sample(), { today: TODAY, period: 'kw' });
  const tb = r.trades.find(x => x.key === 'trockenbau');
  eq([tb.found, tb.contacted, tb.replied, tb.interested], [1, 2, 2, 2], 'Sadrokartón: nájdená 1, oslovené 2, obe so záujmom');
  eq(tb.interestRate, 100, 'záujem z oslovených 100 %');
  ok(!r.trades.some(x => x.best), 'pri menej ako 3 oslovených sa „najlepšie" neoznačí');
  eq(R.landOf({ region: 'Bavorsko' }), 'Bayern', 'slovenský región → Bayern');
  eq(R.landOf({ region: 'okolie Mnichova' }), 'Bayern', '„okolie Mnichova" → Bayern');
  eq(R.landOf({ postal_code: '89073' }), 'Baden-Württemberg', 'PSČ 89… (Ulm) → Baden-Württemberg');
  eq(R.landOf({ postal_code: '01067' }), 'Sachsen', 'PSČ 01… → Sachsen');
  eq(R.landOf({ country: 'AT', postal_code: '1010' }), 'Rakúsko', 'Rakúsko podľa krajiny');
  eq(R.landOf({ city: 'Augsburg' }), 'Bayern', 'len mesto → krajina');
  eq(R.landOf({}), '', 'nič = neurčené');
  const reg = Object.fromEntries(r.regions.map(x => [x.key, x.contacted]));
  eq(reg.Bayern, 1, 'oslovené v Bayern (L2 München; L4 Augsburg nedoručené)');
  eq(reg['Baden-Württemberg'], 1, 'oslovené v BW (L1 Ulm)');
  const c = R.build(sample(), { today: TODAY, period: 'kw', region: 'city' });
  ok(c.regions.some(x => x.key === 'Ulm') && c.regionMode === 'city', 'región sa dá prepnúť na mestá');
  const src = Object.fromEntries(r.sources.map(x => [x.key, x]));
  eq([src.outscraper.found, src.outscraper.contacted], [1, 1], 'Google Mapy: L1');
  eq(src.kolega.found, 1, 'od kolegov: L4');
  eq(r.searches[0].key, 's1', 'najlepšie hľadanie (najviac firiem so záujmom) je prvé');
  eq([r.searches[0].leads, r.searches[0].contacted, r.searches[0].interested], [2, 2, 2], 'hľadanie s1: 2 firmy, obe oslovené aj so záujmom');
  eq(r.searches[0].interestRate, 100, 'záujem z oslovených');
  // Najlepšia skupina pri dostatku dát
  const many = { leads: [], outreach: [], activities: [] };
  const add = (id, trade, interested) => {
    many.leads.push({ id, created_at: '2026-10-01T08:00:00Z', trade_keys: [trade], status: interested ? 'interested' : 'contacted', status_changed_at: interested ? '2026-11-04T08:00:00Z' : null });
    many.outreach.push({ id: `o${id}`, lead_id: id, status: 'sent', sent_at: '2026-11-03T08:00:00Z' });
  };
  add('a1', 'maliar', true); add('a2', 'maliar', true); add('a3', 'maliar', false);
  add('b1', 'trockenbau', true); add('b2', 'trockenbau', false); add('b3', 'trockenbau', false); add('b4', 'trockenbau', false);
  add('c1', 'murar', true);
  const g = R.build(many, { today: TODAY, period: 'kw' }).trades;
  eq(g.filter(x => x.best).map(x => x.key), ['maliar'], 'najlepšie remeslo: Maľovanie (2 z 3); Murovanie má len 1 osloveného');
}

console.log('Čo treba riešiť');
{
  const r = R.build(sample(), { today: TODAY, period: 'kw' });
  const td = r.todo;
  eq(td.overdue.map(x => [x.leadId, x.days, x.who]), [['L3', 4, 'm2']], 'po termíne: úloha pri L3 (4 dni, Jana); odložená úloha nie');
  eq(td.noStep.map(x => x.leadId), ['L1'], 'záujem bez ďalšieho kroku: L1 (L2 má úlohu)');
  eq(td.meetings.map(x => [x.leadId, x.date, x.time, x.past]), [['L2', '2026-11-05', '10:00', true]], 'stretnutie tento týždeň (už bolo)');
  eq(td.unanswered.map(x => [x.leadId, x.days]), [['L7', 3]], 'odpísala a nik sa neozval: L7 (pri L1 Jana potom zmenila kategóriu na Má záujem)');
}
{
  // Odpoveď, po ktorej sme volali, alebo poslali e-mail zo Správ, nie je „bez odpovede".
  const d = sample();
  d.contacts.push({ id: 'c9', lead_id: 'L7', kind: 'call', direction: 'out', outcome: 'interested', our_member_id: 'm2', happened_at: '2026-11-04T09:00:00Z' });
  d.mails = [{ lead_id: 'L1', direction: 'out', sent_at: '2026-11-03T09:00:00Z' }];
  const td = R.build(d, { today: TODAY }).todo;
  eq(td.unanswered.map(x => x.leadId), [], 'po hovore (L7) a e-maile zo Správ (L1) je odpoveď vybavená');
  const d2 = sample();
  d2.leads.find(l => l.id === 'L3').next_step_at = '2026-11-01';
  d2.tasks = [];
  d2.leads.push({ id: 'L8', name: 'Zavretá', status: 'rejected', next_step_at: '2026-10-01', created_at: '2026-10-01T08:00:00Z' });
  const td2 = R.build(d2, { today: TODAY }).todo;
  eq(td2.overdue.map(x => [x.leadId, x.kind]), [['L3', 'step']], 'ďalší krok pri firme bez úlohy je po termíne; firma „Nemá záujem" nie');
}

console.log('Export');
{
  const r = R.build(sample(), { today: TODAY, period: 'kw' });
  const rows = R.csvRows(r, { lead: (id) => ({ L1: 'Müller Bau GmbH', L3: 'Keller Maler' }[id] || id) });
  const titles = rows.filter(x => x.length === 1).map(x => x[0]);
  ok(['Čísla za obdobie', 'Po kolegoch', 'Po remeslách', 'Po regiónoch', 'Po zdrojoch', 'Hľadania (od začiatku)', 'Čo treba riešiť', 'Trend po KW']
    .every(t => titles.includes(t)), 'CSV má všetky sekcie', titles.join(' | '));
  ok(titles.some(t => /^Lievik/.test(t)), 'aj lievik');
  const k = rows.find(x => x[0] === 'Oslovené');
  eq(k, ['Oslovené', 3, 2, 1], 'riadok Oslovené: obdobie, predošlé, rozdiel');
  ok(rows.some(x => x[0] === 'Ďalší krok po termíne' && x[1] === 'Keller Maler'), 'Čo treba riešiť s menom firmy');
  ok(rows.find(x => x[0] === 'Otvorené %')[1] === '33,3', 'percentá s desatinnou čiarkou');
  ok(rows[rows.length - 1].length > 0, 'na konci nie je prázdny riadok');
}

console.log(`\n${passed} prešlo, ${failed} padlo\n`);
process.exit(failed ? 1 : 0);
