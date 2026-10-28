// ============================================================================
// DANUBRA — ľudia, zákazky, hodiny, doklady: opravy pred ostrou prevádzkou
// Spustenie:  node app/tests/ludia-zakazky.test.js
// ============================================================================
// Čo sa tu overuje:
//   * okno „Zapísať hodiny" nezapíše deň dvakrát, nezmení cestu na stavbu,
//     neodschváli a nevymaže časy hodinám, ktoré sa nezmenili, nepíše do
//     uzavretého obdobia, nestratí nedeľu z fotky a pri chybe načítania
//     neuloží nič;
//   * dvojklik na Nasadiť / Nastúpil / Ubytovať / Zapísať = jeden zápis;
//   * chyby z databázy sa nezahadzujú (stav zákazky, Zoll, schválenie hodín);
//   * dodatok k zmluve má hodnotu v tvare, ktorý databáza porovná;
//     podpísaná zmluva sa nevracia medzi rozpracované;
//   * náhľad uzávierky počíta so sadzbou z kartotéky ako databáza;
//   * migrácia 071 drží pravidlá aj v databáze.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..');
let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg, `čakal ${JSON.stringify(b)}, je ${JSON.stringify(a)}`);

// Knižnice sa registrujú aj do `window` (prehliadač) — v Node je to global.
global.window = global;
const HS = require(path.join(APP, 'lib', 'staffing', 'hourscan.js'));
const HSL = require(path.join(APP, 'lib', 'staffing', 'hoursheet.js'));
const P = require(path.join(APP, 'lib', 'staffing', 'periods.js'));

// ── 1. Čo sa z tabuľky týždňa zapíše ────────────────────────────────────────
console.log('Zapísať hodiny — čo sa zapíše');
{
  const D1 = '2026-10-19', D2 = '2026-10-20';
  const asg = { id: 'a1' };
  const base = { dates: [D1, D2], assignmentFor: () => asg, activity: 'construction', now: 'T' };

  // Cesta v ten istý deň nie je v tabuľke a nezmení sa na stavebné hodiny.
  const travel = { id: 't-travel', worker_id: 'w1', work_date: D1, hours: 4, activity_type: 'travel', approved: true };
  eq(HS.cellMinutes([travel], 'w1', D1), 0, 'cesta sa do políčka tabuľky nezaráta');
  let p = HS.planWeek({ ...base, existing: [travel], rows: [{ worker_id: 'w1', name: 'Novák', cells: { [D1]: 480 } }] });
  ok(p.writes.length === 1 && p.writes[0].insert && p.writes[0].insert.activity_type === 'construction'
    && p.writes[0].insert.hours === '8.00', '8 h na stavbe je nový riadok, cesta zostáva');
  ok(!p.writes.some(w => w.id === 't-travel'), '  … riadok cesty sa nemení');

  // Nezmenené hodiny: žiadny zápis (neodschvaľuje sa, časy sa nemažú).
  const done = { id: 't1', worker_id: 'w1', work_date: D1, hours: 8, approved: true, activity_type: 'construction',
    time_from: '07:00:00', time_to: '16:00:00', source: 'manual' };
  p = HS.planWeek({ ...base, existing: [done], rows: [{ worker_id: 'w1', cells: { [D1]: 480 } }], signed: false });
  eq(p.writes, [], 'nezmenené hodiny bez podpisu: nič sa nezapíše (schválenie a časy ostanú)');

  // Nezmenené + podpísané: len schválenie.
  const open = { ...done, approved: false };
  p = HS.planWeek({ ...base, existing: [open], rows: [{ worker_id: 'w1', cells: { [D1]: 480 } }], signed: true });
  eq(p.writes, [{ id: 't1', patch: { approved: true, approved_at: 'T' } }], 'podpísaný list nezmenené hodiny len schváli');

  // Dva riadky v ten deň (Stundennachweis 8 h + Jeden deň 2 h) → políčko 10.
  const sn = { id: 's', worker_id: 'w1', work_date: D1, hours: 8, approved: true, activity_type: 'construction', source: 'stundennachweis' };
  const man = { id: 'm', worker_id: 'w1', work_date: D1, hours: 2, approved: true, activity_type: 'construction', source: 'manual', description: 'montáž' };
  eq(HS.cellMinutes([man, sn], 'w1', D1), 600, 'políčko ukazuje súčet všetkých riadkov práce v ten deň');
  p = HS.planWeek({ ...base, existing: [man, sn], rows: [{ worker_id: 'w1', cells: { [D1]: 600 } }] });
  eq(p.writes, [], '  … a keď sa nezmení, nezapíše sa nič (deň sa nezaráta dvakrát)');
  p = HS.planWeek({ ...base, existing: [man, sn], rows: [{ worker_id: 'w1', cells: { [D1]: 480 } }] });
  ok(p.writes.length === 1 && p.writes[0].id === 's' && p.writes[0].patch.hours === '6.00',
    'zníženie na 8 h ide najprv na riadok zo Stundennachweisu (8 → 6), súčet je 8', JSON.stringify(p.writes));
  p = HS.planWeek({ ...base, existing: [man, sn], rows: [{ worker_id: 'w1', cells: { [D1]: 0 } }] });
  eq(p.writes, [{ id: 's', archive: true }, { id: 'm', archive: true }], 'nula = riadky sa archivujú (nemažú, nevisia ako 0 h)');
  p = HS.planWeek({ ...base, existing: [man, sn], rows: [{ worker_id: 'w1', cells: { [D1]: 660 } }], signed: true });
  ok(p.writes.length === 1 && p.writes[0].id === 's' && p.writes[0].patch.hours === '9.00' && p.writes[0].patch.approved === true,
    'zvýšenie ide na riadok zo Stundennachweisu a podpísaný sa schváli');

  // Uzavreté obdobie.
  const frozen = { ...done, period_id: 'per' };
  p = HS.planWeek({ ...base, existing: [frozen], rows: [{ worker_id: 'w1', name: 'Novák', cells: { [D1]: 540 } }] });
  ok(!p.writes.length && p.locked.length === 1, 'riadok z uzavretého obdobia sa nemení, hlási sa');
  p = HS.planWeek({ ...base, existing: [], closedOn: (d) => d === D2,
    rows: [{ worker_id: 'w1', name: 'Novák', cells: { [D1]: 480, [D2]: 480 } }] });
  ok(p.writes.length === 1 && p.writes[0].insert.work_date === D1 && p.locked.length === 1 && p.locked[0].date === D2,
    'do dňa v uzavretom období sa nový riadok nevloží');

  // Bez nasadenia.
  p = HS.planWeek({ ...base, assignmentFor: () => null, existing: [], rows: [{ worker_id: 'w9', name: 'X', cells: { [D1]: 60 } }] });
  ok(!p.writes.length && p.missing.length === 1, 'deň bez nasadenia sa neuloží a povie sa to');

  // Časy od–do.
  p = HS.planWeek({ ...base, existing: [], days: { [D1]: { span: '7–16:30' } }, rows: [{ worker_id: 'w1', cells: { [D1]: 510 } }] });
  ok(p.writes[0].insert.time_from === '07:00' && p.writes[0].insert.time_to === '16:30', 'čas od–do z listu sa zapíše');
  p = HS.planWeek({ ...base, existing: [{ ...done, hours: 8 }], days: { [D1]: { span: '' } },
    rows: [{ worker_id: 'w1', cells: { [D1]: 540 } }] });
  ok(p.writes.length === 1 && !('time_from' in p.writes[0].patch), 'prázdny čas na liste zapísané časy nemaže');
  p = HS.planWeek({ ...base, existing: [], rows: [{ worker_id: 'w1', cells: { [D1]: 480 } }], activity: 'workshop' });
  eq(p.writes[0].insert.activity_type, 'workshop', 'dielenská zákazka zapisuje dielenské hodiny');
}

// ── 2. Okno „Zapísať hodiny" v prehliadači (stubované) ──────────────────────
function harness(o = {}) {
  const calls = [];
  const fetches = [];
  const resolveAfter = (v) => new Promise(r => setTimeout(() => r(v), 5));
  const chain = (result) => {
    const q = { select() { return q; }, in(k, v) { calls.push(['in', k, v]); return q; }, gte() { return q; },
      lte() { return q; }, limit() { return q; }, eq() { return q; },
      then(res, rej) { return resolveAfter(result()).then(res, rej); } };
    return q;
  };
  const ctx = {
    console, setTimeout, clearTimeout, URL, Promise, JSON, Math, Date, Number, String, Object, Array, Set, Map,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    Icon: () => '',
    UI: {
      modal() {}, toast(m, k) { calls.push(['toast', m, k]); }, confirm: async () => true,
      esc: (s) => String(s == null ? '' : s), date: (s) => String(s || ''), tip: () => '', field: () => '',
      formData: () => ({}), closeModal() {}, dateRange: (a, b) => `${a}–${b}`,
    },
    Danubra: { views: {}, routeAvailable: () => false, renderRoute() {}, supplierReady: () => true, isAdmin: () => false,
      _dayISO: () => '2026-10-28' },
    fetch: async (url, init) => { fetches.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ sheet: o.sheet }) }; },
    DB: {
      from: (t) => chain(() => (o.tsError ? { data: null, error: { message: 'spojenie zlyhalo' } } : { data: o.existing || [], error: null })),
      list: async () => ({ data: [], error: null }),
      insert: async (t, row) => { calls.push(['insert', t, row]); await resolveAfter(); return { data: { id: 'n' }, error: null }; },
      update: async (t, id, patch) => { calls.push(['update', t, id, patch]); return { data: {}, error: (o.updateError && o.updateError(t, patch)) || null }; },
      archive: async (t, id) => { calls.push(['archive', t, id]); return { error: null }; },
      client: { auth: { getSession: async () => ({ data: { session: { access_token: 'x' } } }) },
        storage: { from: () => ({ upload: async () => ({ error: null }) }) } },
      DOCS_BUCKET: 'b',
    },
    Sub: {
      loaded: true,
      items: [{ id: 'sc1', title: 'Stavba', status: 'active', work_type: 'construction' }],
      assignments: o.assignments || [
        { id: 'cancel', subcontract_id: 'sc1', worker_id: 'w1', status: 'cancelled', date_from: '2026-10-01' },
        { id: 'a1', subcontract_id: 'sc1', worker_id: 'w1', status: 'active', date_from: '2026-10-01' },
      ],
      workers: [{ id: 'w1', full_name: 'Ján Novák' }],
      periods: o.periods || [],
      partners: [],
      workerOf(id) { return this.workers.find(w => w.id === id); },
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['lib/staffing/hoursheet.js', 'lib/staffing/hourscan.js', 'js/components/hourentry.js']) {
    vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), ctx, { filename: f });
  }
  return { ctx, calls, fetches, HE: ctx.HourEntry };
}

(async () => {
  console.log('Zapísať hodiny — okno');
  {
    const { HE, calls } = harness({ tsError: true });
    await HE.open({ subcontractId: 'sc1', year: 2026, week: 43 });
    ok(!!HE.st.loadError, 'chyba pri načítaní zapísaných hodín sa nezahodí');
    HE.st.rows[0].cells['2026-10-19'] = 480;
    await HE.save();
    ok(!calls.some(c => c[0] === 'insert'), '  … a uložiť sa nedá (inak by sa týždeň zapísal druhýkrát)');
  }
  {
    const { HE, calls } = harness({ existing: [] });
    await HE.open({ subcontractId: 'sc1', year: 2026, week: 43 });
    ok(calls.some(c => c[0] === 'in' && c[1] === 'assignment_id'), 'zapísané hodiny sa čítajú len pre nasadenia zákazky');
    HE.st.rows[0].cells['2026-10-19'] = 480;
    await Promise.all([HE.save(), HE.save()]);
    const ins = calls.filter(c => c[0] === 'insert' && c[1] === 'timesheets');
    ok(ins.length === 1, 'dvojklik na Uložiť = jeden zápis', `zápisov: ${ins.length}`);
    ok(ins[0] && ins[0][2].assignment_id === 'a1', 'hodiny idú k platnému nasadeniu, nie k zrušenému');
  }
  {
    // Nedeľa z fotky: zarátaná aj uložená.
    const sheet = { kw_from: '2026-10-19', days: [{ weekday: 7, date: '2026-10-25' }], signed: true,
      rows: [{ name_raw: 'Ján Novák', per_day: [{ weekday: 1, date: '2026-10-19', minutes: 600 }, { weekday: 7, date: '2026-10-25', minutes: 300 }] }] };
    const { HE, calls, fetches } = harness({ existing: [], sheet });
    await HE.open({ subcontractId: 'sc1', year: 2026, week: 43 });
    await HE.scan({ name: 'kw43.jpg', type: 'application/pdf', size: 1000 });
    ok(fetches[0] && fetches[0].week_hint === 43, 'funkcii ide číslo KW (nie objekt, ktorý zahodí)');
    ok(HE.st.dates.length === 7 && HE.st.dates[6].date === '2026-10-25', 'nedeľa z listu dostane stĺpec');
    await HE.save();
    const dni = calls.filter(c => c[0] === 'insert' && c[1] === 'timesheets').map(c => c[2].work_date).sort();
    eq(dni, ['2026-10-19', '2026-10-25'], '  … a jej hodiny sa uložia');
  }
  {
    // Predvolený týždeň podľa miestneho dňa (Danubra._dayISO), nie UTC.
    const { HE, ctx } = harness({ existing: [] });
    ctx.Danubra._dayISO = () => '2026-11-02';           // pondelok KW 45
    await HE.open({ subcontractId: 'sc1' });
    ok(HE.st.week === 44 && HE.st.year === 2026 && HE.st.signedOn === '2026-11-02',
      'v pondelok ráno okno ponúkne minulý týždeň podľa miestneho dňa', `KW ${HE.st.week}, ${HE.st.signedOn}`);
    ctx.Danubra._dayISO = () => '2027-01-01';           // piatok, KW 53/2026
    await HE.open({ subcontractId: 'sc1' });
    ok(HE.st.week === 52 && HE.st.year === 2026, 'prelom roka: 1. 1. 2027 je KW 53/2026, minulý týždeň KW 52/2026');
  }
  {
    // Deň v uzavretom období sa nevloží.
    const { HE, calls } = harness({ existing: [], periods: [{ subcontract_id: 'sc1', status: 'closed', period_from: '2026-10-01', period_to: '2026-10-19' }] });
    await HE.open({ subcontractId: 'sc1', year: 2026, week: 43 });
    HE.st.rows[0].cells['2026-10-19'] = 480;
    HE.st.rows[0].cells['2026-10-20'] = 480;
    await HE.save();
    const dni = calls.filter(c => c[0] === 'insert' && c[1] === 'timesheets').map(c => c[2].work_date);
    eq(dni, ['2026-10-20'], 'do uzavretého obdobia sa hodiny nedopíšu');
    ok(calls.some(c => c[0] === 'toast' && /uzavreté/.test(c[1])), '  … a povie sa to');
  }
  {
    // Nezmenené schválené hodiny sa pri uložení neodschvália.
    const existing = [{ id: 't1', worker_id: 'w1', assignment_id: 'a1', work_date: '2026-10-19', hours: 8, approved: true,
      activity_type: 'construction', time_from: '07:00:00', time_to: '16:00:00' }];
    const { HE, calls } = harness({ existing });
    await HE.open({ subcontractId: 'sc1', year: 2026, week: 43 });
    eq(HE.st.rows[0].cells['2026-10-19'], 480, 'zapísané hodiny sú v tabuľke');
    await HE.save();
    ok(!calls.some(c => c[0] === 'update' && c[1] === 'timesheets'), 'uloženie bez zmeny hodiny neodschváli ani im nezmaže časy');
  }

  // ── 3. Dvojklik a chyby z databázy v moduloch ─────────────────────────────
  console.log('Moduly — dvojklik a chyby z databázy');
  const modCtx = (extra = {}) => {
    const calls = [];
    const ctx = {
      console, setTimeout, Promise, JSON, Math, Date, Number, String, Object, Array, Set, Map,
      document: { getElementById: () => ({}), querySelector: () => null, querySelectorAll: () => [] },
      Icon: () => '',
      UI: { toast(m, k) { calls.push(['toast', m, k]); }, modal() {}, closeModal() {}, esc: (s) => String(s), date: (s) => String(s),
        dateRange: (a, b) => `${a}–${b}`, formData: () => (extra.form || {}), confirm: async () => true, tip: () => '', field: () => '' },
      Danubra: { views: {}, renderRoute() {}, isAdmin: () => false, _dayISO: () => '2026-10-28' },
      Shell: { plural: (n, a) => a },
      Enums: { label: (k, v) => v, options: () => [] },
      DB: {
        update: async (t, id, p) => { calls.push(['update', t, id, p]); return { error: extra.updateError || null }; },
        insert: async (t, row) => { calls.push(['insert', t, row]); await new Promise(r => setTimeout(r, 5)); return { data: { id: 'n' }, error: null }; },
        insertMany: async () => ({ error: null }), list: async () => ({ data: [] }),
      },
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    return { ctx, calls };
  };
  const load = (ctx, f) => vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), ctx, { filename: f });

  {
    const { ctx, calls } = modCtx({ form: { assignment_id: 'a1', work_date: '2026-10-20', hours: '8', activity_type: 'travel' } });
    load(ctx, 'js/modules/timesheets.js');
    ctx.Tms.assignments = [{ id: 'a1', worker_id: 'w1', date_from: '2026-10-01', date_to: '2026-10-31' }];
    ctx.Tms.load = async () => {};
    await Promise.all([ctx.Tms.save(), ctx.Tms.save()]);
    eq(calls.filter(c => c[0] === 'insert').length, 1, 'Jeden deň: dvojklik = jeden zápis');
  }
  {
    const { ctx, calls } = modCtx({ form: { assignment_id: 'a1', work_date: '2026-11-05', hours: '8' } });
    load(ctx, 'js/modules/timesheets.js');
    ctx.Tms.assignments = [{ id: 'a1', worker_id: 'w1', date_from: '2026-10-01', date_to: '2026-10-31' }];
    await ctx.Tms.save();
    ok(!calls.some(c => c[0] === 'insert') && calls.some(c => c[0] === 'toast' && /mimo nasadenia/.test(c[1])),
      'Jeden deň: dátum mimo nasadenia sa nezapíše');
  }
  {
    const { ctx, calls } = modCtx({ updateError: { message: 'Hodiny patria do uzavretého obdobia' } });
    load(ctx, 'js/modules/timesheets.js');
    ctx.Tms.items = [{ id: 't1', approved: false }];
    await ctx.Tms.toggleApprove('t1');
    ok(ctx.Tms.items[0].approved === false && calls.some(c => c[2] === 'err'), 'schválenie, ktoré databáza odmietla, sa neprepne');
  }
  {
    const { ctx, calls } = modCtx();
    load(ctx, 'js/modules/subcontracts.js');
    let n = 0;
    ctx.Sub._saveAsg = async () => { n++; await new Promise(r => setTimeout(r, 5)); };
    ctx.Sub._saveStart = async () => { n++; await new Promise(r => setTimeout(r, 5)); };
    ctx.Sub._saveStay = async () => { n++; await new Promise(r => setTimeout(r, 5)); };
    await Promise.all([ctx.Sub.saveAsg('sc'), ctx.Sub.saveAsg('sc')]);
    eq(n, 1, 'Nasadiť: dvojklik = jedno nasadenie');
    await Promise.all([ctx.Sub.saveStart('a'), ctx.Sub.saveStart('a'), ctx.Sub.saveStay('l'), ctx.Sub.saveStay('l')]);
    eq(n, 3, 'Nastúpil a Ubytovať: dvojklik = jeden zápis');
    await ctx.Sub.saveAsg('sc');
    eq(n, 4, '  … a po dokončení sa dá uložiť znova');
    load(ctx, 'js/modules/workorders.js');
    ctx.Ord._save = async () => { n++; await new Promise(r => setTimeout(r, 5)); };
    await Promise.all([ctx.Ord.save('', 'worker', {}), ctx.Ord.save('', 'worker', {})]);
    eq(n, 5, 'Objednávka: dvojklik = jedna objednávka (jedno číslo)');
    void calls;
  }
  {
    const { ctx, calls } = modCtx({ updateError: { message: 'permission denied' } });
    load(ctx, 'js/modules/subcontracts.js');
    ctx.Sub.items = [{ id: 'sc', status: 'won' }];
    ctx.Sub.detail = () => {};
    ctx.UI.ask = async () => 'MID-1';
    await ctx.Sub.setStatus('sc', 'completed');
    ok(ctx.Sub.items[0].status === 'won' && calls.some(c => c[2] === 'err'), 'stav zákazky: chyba z databázy sa ukáže, stav sa nezmení');
    await ctx.Sub.markZoll('sc');
    ok(!ctx.Sub.items[0].zoll_reported_at, 'hlásenie Zoll: neuložené nie je „zaznamenané"');
  }
  {
    const { ctx, calls } = modCtx({ updateError: { message: 'permission denied' } });
    load(ctx, 'js/modules/candidates.js');
    load(ctx, 'js/modules/accommodations.js');
    load(ctx, 'js/modules/workers.js');
    ctx.Cand.items = [{ id: 'k', status: 'new' }];
    await ctx.Cand.setStatus('k', 'interview');
    await ctx.Cand.markContacted('k');
    ok(ctx.Cand.items[0].status === 'new' && !ctx.Cand.items[0].first_contact_at, 'kandidát: neuložený stav sa netvári ako uložený');
    ctx.Acc.items = [{ id: 'u', verification_status: 'new' }];
    await ctx.Acc.setVerif('u', 'verified');
    eq(ctx.Acc.items[0].verification_status, 'new', 'ubytovanie: neuložené overenie sa neprepne');
    ctx.Wrk.items = [{ id: 'w', status: 'ready' }];
    await ctx.Wrk.setStatus('w', 'blacklist');
    eq(ctx.Wrk.items[0].status, 'ready', 'človek: neuložený stav v kartotéke sa neprepne');
    ok(calls.filter(c => c[2] === 'err').length >= 4, '  … a každá chyba sa ukáže');
  }
  {
    const { ctx, calls } = modCtx();
    load(ctx, 'js/modules/crews.js');
    ctx.UI.confirm = async () => true;
    ctx.Crews.items = [{ id: 'c1', leader_worker_id: 'w1' }];
    ctx.Crews.members = [{ id: 'm1', crew_id: 'c1', worker_id: 'w1' }];
    ctx.Crews.load = async () => {};
    ctx.Crews.detail = () => {};
    ctx.Crews.workerOf = () => ({ full_name: 'Ján' });
    await ctx.Crews.leave('m1');
    ok(calls.some(c => c[0] === 'update' && c[1] === 'crews' && c[3].leader_worker_id === null),
      'odišiel predák: partia ho prestane mať ako predáka');
  }

  // ── 4. Zmluva a dodatok ───────────────────────────────────────────────────
  console.log('Zmluva — dodatok a stav');
  {
    const { ctx, calls } = modCtx();
    load(ctx, 'js/modules/contracts.js');
    const C = ctx.Con;
    eq(C.amendValue('charge_rate', '31.50'), { value: '31.5' }, 'sadzba „31.50" sa zapíše ako 31.5 (tak ju vráti databáza)');
    eq(C.amendValue('charge_rate', '31,50 '), { value: '31.5' }, 'aj s desatinnou čiarkou');
    ok(!!C.amendValue('charge_rate', 'tridsať').error, 'nezmysel sa nezapíše');
    eq(C.amendValue('date_to', '31.12.2026'), { value: '2026-12-31' }, 'dátum „31.12.2026" → 2026-12-31');
    ok(!!C.amendValue('date_to', '31.02.2026').error, 'neexistujúci dátum sa nezapíše');
    ok(!!C.amendValue('retention_pct', '50').error, 'zádržné 50 % je preklep');
    C.items = [{ id: 'k1', status: 'signed', charge_rate: 30 }];
    C.detail = () => {};
    await C.setStatus('k1', 'draft');
    ok(!calls.some(c => c[0] === 'update'), 'podpísaná zmluva sa neprepne späť na rozpracovanú');
  }

  // ── 5. Uzávierka: náhľad = databáza ───────────────────────────────────────
  console.log('Uzávierka obdobia');
  {
    const pv = P.preview({
      from: '2026-10-01', to: '2026-10-31',
      timesheets: [{ id: 't', worker_id: 'w1', assignment_id: 'a1', work_date: '2026-10-05', hours: 10, approved: true }],
      assignments: [{ id: 'a1', charge_rate: 40, worker_rate: null }],
      workers: [{ id: 'w1', hourly_cost: 25 }],
    });
    eq([pv.charged, pv.cost, pv.noRate.length], [40000, 25000, 0], 'bez sadzby na nasadení sa berie sadzba z kartotéky (ako danubra_close_period)');
  }

  // ── 6. Migrácia 071 ───────────────────────────────────────────────────────
  console.log('Migrácia 071');
  {
    const sql = fs.readFileSync(path.join(APP, 'database', 'migrations', '071_ludia_zakazky.sql'), 'utf8');
    ok(/v_nastup := coalesce\(new\.status, ''\) = 'active' and coalesce\(old\.status, ''\) <> 'active'/.test(sql)
      && /coalesce\(new\.started_at, new\.date_from, current_date\)/.test(sql),
      'doklady sa kontrolujú aj pri „Nastúpil" (k dňu nástupu)');
    ok(/create trigger danubra_assignment_overlap_guard\s+before insert or update on danubra_assignments/.test(sql),
      'dve prekrývajúce sa nasadenia toho istého človeka na zákazke neprejdú');
    ok(/coalesce\(a\.status, ''\) <> 'cancelled'[\s\S]{0,200}p_date_from <= a\.date_to/.test(sql)
      && /cm\.archived_at is null/.test(sql), 'partia preskočí aj naplánovaných a archivovaných');
    ok(/create trigger danubra_ts_closed_range_trg\s+before insert or update on danubra_timesheets/.test(sql),
      'do uzavretého obdobia sa hodiny nedopíšu ani z importu');
    ok(/before update of status on danubra_contracts/.test(sql), 'podpísaná zmluva sa nevráti medzi rozpracované ani v databáze');
    ok(/from danubra_candidates where id = p_candidate_id for update/.test(sql), 'prevod kandidáta si zamkne riadok');
    ok(/danubra_keep_history\(%L, %L\)/.test(sql) && /'danubra_assignments', 'assignment', 'dates'/.test(sql),
      'prepísaná poznámka a zmena konca sa zapíšu do histórie');
    const hlasky = [...sql.matchAll(/raise exception\s+'([^']*)'/g)].map(m => m[1]).join(' ');
    ok(!/(?<!\p{L})(Vybav|ukonči|Zapíš|otvor ho|oprav to)(?!\p{L})/u.test(hlasky), 'hlášky z databázy vykajú');
    ok(/Vybavte doklad/.test(hlasky) && /najprv ukončite ten pobyt/.test(hlasky), '  … aj tie, čo appka ukazuje pri nasadení a ubytovaní');
    ok(!/\bdelete from\b|\bdrop table\b|\btruncate\b/i.test(sql), 'migrácia nič nemaže');
  }

  console.log(`\n${passed} prešlo, ${failed} padlo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
