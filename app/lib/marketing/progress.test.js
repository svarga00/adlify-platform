// ============================================================================
// Testy: priebeh hľadania firiem (percentá, kroky, log, obmedzenie zápisov)
// Spustenie:  node app/lib/marketing/progress.test.js
// ============================================================================
const P = require('./progress.js');

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

console.log('Priebeh hľadania');

(async () => {
  // ── Kroky a percentá ──────────────────────────────────────────────────────
  eq(P.plan('outscraper').map(s => s.key), ['read_seeds', 'plan', 'maps', 'filter', 'impressum', 'score', 'contacts', 'save'],
    'Google Mapy: osem krokov v poradí');
  eq(P.plan('ai').map(s => s.key), ['read_seeds', 'web', 'filter', 'impressum', 'save'], 'AI s web search: päť krokov');
  {
    const k = P.plan('outscraper');
    ok(k[0].from === 0 && k[k.length - 1].to === 100 && k.every((s, i) => i === 0 || s.from === k[i - 1].to),
      'rozsahy idú za sebou od 0 do 100 bez medzier');
    const a = P.plan('ai');
    ok(a[0].from === 0 && a[a.length - 1].to === 100 && a.every((s, i) => i === 0 || s.from === a[i - 1].to), 'aj pri AI');
  }
  eq([P.pct('read_seeds', 0), P.pct('read_seeds', [1, 2]), P.pct('maps', [3, 8]), P.pct('impressum', [12, 40]), P.pct('score', 1), P.pct('save', 0.5)],
    [0, 5, 30, 66, 92, 99], 'krok + podiel → percento (dotaz 3 z 8 = 30 %, Impressum 12 z 40 = 66 %)');
  eq([P.pct('maps', 7), P.pct('maps', -1), P.pct('maps', [5, 0]), P.pct('nieco'), P.pct('done')], [55, 15, 15, null, 100],
    'podiel sa oreže na 0–1, delenie nulou = 0, neznámy krok null, hotovo 100');
  eq(P.pct('web', 0.5, 'ai'), 36, 'AI: polovica hľadania na webe = 36 %');
  eq(P.sourceOf({ source: 'ai' }), 'ai', 'zdroj z hľadania');
  eq(P.sourceOf({ params: { outscraper: false } }), 'ai', 'kým server zdroj nezapíše, berie sa z appky');

  // ── Log ───────────────────────────────────────────────────────────────────
  {
    let log = [];
    for (let i = 0; i < 60; i++) log = P.addLog(log, `Udalosť ${i}`, Date.UTC(2026, 9, 30, 8, 0, i));
    eq(log.length, 50, 'log drží posledných 50 udalostí');
    eq([log[0].text, log[49].text], ['Udalosť 10', 'Udalosť 59'], 'najstaršie odpadnú');
    ok(/^2026-10-30T08:00:59/.test(log[49].at), 'každá má čas');
    eq(P.addLog(log, 'Udalosť 59').length, 50, 'rovnaký text hneď za sebou sa nezopakuje');
    eq(P.addLog([], '   ').length, 0, 'prázdny text sa nepridá');
    eq(P.addLog([], 'x'.repeat(500))[0].text.length, 240, 'dlhý text sa skráti');
  }

  // ── Obmedzenie ────────────────────────────────────────────────────────────
  {
    let t = 0;
    const g = P.gate({ minMs: 1500, now: () => t });
    const r = [g.ready()];
    t = 500; r.push(g.ready());
    t = 1400; r.push(g.ready(true));
    t = 2000; r.push(g.ready());
    t = 3000; r.push(g.ready());
    eq(r, [true, false, true, false, true], 'zápis najviac raz za 1,5 s, s force hneď');
  }

  eq(P.filterLine({ closed: 9, known: 12, no_web: 1, duplicate: 0 }), 'Vyradené: 9 zatvorených, 12 už máme, 1 bez webu', 'veta o vyradení');
  eq(P.filterLine({}), 'Nič sa nevyradilo', 'bez vyradených');
  eq(P.filterLine({ closed: 2, duplicate: 1, optout: 3 }), 'Vyradené: 2 zatvorené, 1 duplicita, 3 odhlásené', 'skloňovanie');

  // ── Reporter ──────────────────────────────────────────────────────────────
  {
    let t = 1000;
    const writes = [];
    let cancel = false, reads = 0;
    const rep = P.reporter({ write: async (p) => { writes.push(p); }, readCancel: async () => { reads++; return cancel; },
      now: () => t, source: 'outscraper' });
    await rep.start('Začínam');
    eq(writes.length, 1, 'start sa zapíše hneď');
    ok(writes[0].started_at && writes[0].heartbeat_at && writes[0].progress === 0 && writes[0].stage === 'read_seeds', 'so started_at, heartbeat a 0 %');
    t += 100; await rep.step('read_seeds', { frac: [1, 3], label: 'Čítam web firmy a.de (1 z 3)', log: true });
    t += 100; await rep.step('read_seeds', { frac: [2, 3], label: 'Čítam web firmy b.de (2 z 3)', log: true });
    eq(writes.length, 1, 'pod-kroky do 1,5 s sa nezapíšu');
    t += 100; await rep.step('plan', { label: 'AI pripravuje hľadanie' });
    eq(writes.length, 2, 'zmena kroku sa zapíše hneď');
    eq([writes[1].stage, writes[1].progress, writes[1].stage_label], ['plan', 10, 'AI pripravuje hľadanie'], 'krok, percentá a veta');
    eq(writes[1].log.map(x => x.text), ['Začínam', 'Čítam web firmy a.de (1 z 3)', 'Čítam web firmy b.de (2 z 3)', 'AI pripravuje hľadanie'],
      'log má aj pod-kroky, ktoré sa medzitým nezapísali');
    t += 2000; await rep.step('maps', { frac: 0, label: 'Google Mapy' });
    t += 200; await rep.step('read_seeds', { frac: 0 });
    ok(rep.state.progress === 15, 'percentá nikdy neklesnú', String(rep.state.progress));
    t += 300; await rep.beat();
    t += 1600; await rep.beat();
    const hb = writes[writes.length - 1];
    ok(hb.progress > 15 && hb.progress < 55 && Date.parse(hb.heartbeat_at) === t, 'heartbeat: percentá pomaly pribúdajú, nikdy nedosiahnu koniec kroku', JSON.stringify(hb));
    for (let i = 0; i < 100; i++) { t += 2000; await rep.beat(); }
    eq(rep.state.progress, 54, 'ani po dlhom čakaní nepresiahne koniec kroku');

    // Zastaviť
    eq(await rep.checkCancel(), false, 'kým človek neklikol Zastaviť, beží ďalej');
    cancel = true;
    t += 1000;
    eq([await rep.checkCancel(), reads], [false, 1], 'databáza sa pýta najviac raz za 3 s');
    t += 2500;
    eq([await rep.checkCancel(), rep.stopped, reads], [true, true, 2], 'po klepnutí na Zastaviť to vie');
    t += 10;
    eq([await rep.checkCancel(), reads], [true, 2], 'a ďalej sa už nepýta');

    const before = writes.length;
    t += 10; await rep.step('impressum', { frac: [1, 40], label: 'Overujem Impressum 1 z 40' });
    t += 10; await rep.step('impressum', { frac: [2, 40], label: 'Overujem Impressum 2 z 40' });
    t += 10; await rep.flush();
    eq(writes.length, before + 2, 'flush zapíše, čo čaká');
    eq(writes[writes.length - 1].stage_label, 'Overujem Impressum 2 z 40', 'posledný stav');
    await rep.finish('cancelled', 'Zastavené – uložených 3 firiem');
    const fin = writes[writes.length - 1];
    eq([fin.stage, fin.stage_label, fin.progress < 100], ['cancelled', 'Zastavené – uložených 3 firiem', true], 'koniec: zastavené (percentá ostanú)');
    await rep.finish('done', 'Hotovo');
    eq(writes[writes.length - 1].progress, 100, 'hotovo = 100 %');
  }
  {
    const rep = P.reporter({ write: async () => { throw new Error('db spadla'); }, readCancel: async () => { throw new Error('x'); } });
    await rep.start();
    await rep.step('plan', { label: 'x' });
    eq([await rep.checkCancel(true), rep.writes], [false, 2], 'chyba zápisu ani čítania hľadanie nezastaví');
  }

  // ── Pre appku ─────────────────────────────────────────────────────────────
  eq([P.duration(40e3), P.duration(3 * 60e3 + 5e3), P.duration(65 * 60e3), P.duration(120 * 60e3)], ['40 s', '3 min', '1 h 5 min', '2 h'], 'trvanie');
  {
    const now = Date.parse('2026-10-30T10:00:00Z');
    const iso = (min) => new Date(now - min * 60e3).toISOString();
    ok(!P.isStale({ status: 'running', heartbeat_at: iso(1) }, now), 'ozvalo sa pred minútou → beží');
    ok(P.isStale({ status: 'running', heartbeat_at: iso(4) }, now), 'neozvalo sa 4 min → zrejme sa prerušilo');
    ok(!P.isStale({ status: 'done', heartbeat_at: iso(60) }, now), 'hotové hľadanie sa neprerušilo');
    ok(!P.isStale({ status: 'running', created_at: iso(10) }, now) && P.isStale({ status: 'running', created_at: iso(17) }, now),
      'bez heartbeat (pred 080): prerušené až po 16 min');
    ok(P.isStale({ status: 'pending', started_at: null, heartbeat_at: null, created_at: iso(20) }, now), 'nikdy sa nespustilo');

    const m = P.model({ id: 's1', status: 'running', source: 'outscraper', progress: 46, stage: 'impressum', stage_label: 'Overujem Impressum 12 z 40',
      started_at: iso(3), heartbeat_at: iso(0), log: [1, 2, 3, 4, 5, 6].map(i => ({ at: iso(0), text: `riadok ${i}` })) }, now);
    eq([m.pct, m.label, m.elapsed, m.running, m.stale], [46, 'Overujem Impressum 12 z 40', 'beží 3 min', true, false], 'model pásu: percentá, veta, ako dlho beží');
    eq(m.stages.map(s => s.state), ['done', 'done', 'done', 'done', 'active', 'todo', 'todo', 'todo'], 'kroky: hotové, aktuálny, budúce');
    eq(m.log.map(x => x.text), ['riadok 3', 'riadok 4', 'riadok 5', 'riadok 6'], 'posledné štyri riadky logu');
    const d = P.model({ id: 's2', status: 'done', source: 'ai', found: 30, added: 12, started_at: iso(8), finished_at: iso(2),
      stats: { dropped: { known: 10, closed: 8 }, learning: { positive: 3, negative: 1 }, insights: ['a', 'b', 'c', 'd'] } }, now);
    eq([d.pct, d.elapsed, d.summary, d.insights], [100, 'trvalo 6 min', { found: 30, saved: 12, dropped: 18, examples: 4 }, ['a', 'b', 'c']],
      'hotové: 100 %, ako dlho trvalo, súhrn a najviac tri vety „Čo AI zistila"');
    ok(d.stages.every(s => s.state === 'done'), 'hotové: všetky kroky sú hotové');
    const c = P.model({ id: 's3', status: 'cancelled', progress: 62, stage: 'impressum', cancel_requested: true }, now);
    eq([c.stages[4].state, c.stages[5].state, c.cancelRequested], ['stopped', 'todo', true], 'zastavené: krok, kde sa zastavilo');
    const old = P.model({ id: 's4', status: 'running', created_at: iso(2) }, now);
    eq([old.pct, old.hasProgress], [null, false], 'bez 080 (server nezapisuje priebeh): bez percent');
    const pend = P.model({ id: 's5', status: 'pending', created_at: iso(0) }, now);
    ok(pend.stages.every(s => s.state === 'todo') && /Čakám/.test(pend.label), 'čaká na server: všetky kroky sivé');
  }

  console.log(`\n${passed} prešlo, ${failed} padlo\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('  ✗ Error', e); process.exit(1); });
