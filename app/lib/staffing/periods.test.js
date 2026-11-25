// ============================================================================
// Testy uzávierky obdobia
// Spustenie:  node app/lib/staffing/periods.test.js
// ============================================================================
global.window = global;
const M = require('../money.js');
const P = require('./periods');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

// Nasadenia: fakturujeme 34 €/h, platíme 26 €/h.
const ASG = [
  { id: 'a1', worker_id: 'w1', charge_rate: 34, worker_rate: 26 },
  { id: 'a2', worker_id: 'w2', charge_rate: 34, worker_rate: 24 },
];
const ts = (id, asg, worker, date, hours, kind, approved = true, extra = {}) =>
  ({ id, assignment_id: asg, worker_id: worker, work_date: date, hours,
     activity_type: kind, approved, ...extra });

console.log('Uzávierka obdobia');

// ── Hranice obdobia ─────────────────────────────────────────────────────────
{
  const t = ts('t', 'a1', 'w1', '2026-09-15', 8, 'construction');
  ok(P.inPeriod(t, '2026-09-01', '2026-09-30'), 'v strede obdobia');
  ok(P.inPeriod(ts('t', 'a1', 'w1', '2026-09-01', 8, 'construction'), '2026-09-01', '2026-09-30'),
    'prvý deň patrí do obdobia');
  ok(P.inPeriod(ts('t', 'a1', 'w1', '2026-09-30', 8, 'construction'), '2026-09-01', '2026-09-30'),
    'aj posledný');
  ok(!P.inPeriod(ts('t', 'a1', 'w1', '2026-08-31', 8, 'construction'), '2026-09-01', '2026-09-30'),
    'deň pred už nie');
  ok(!P.inPeriod(ts('t', 'a1', 'w1', '2026-10-01', 8, 'construction'), '2026-09-01', '2026-09-30'),
    'ani deň po');
  ok(!P.inPeriod(null, '2026-09-01', '2026-09-30'), 'prázdny výkaz nezhodí');
  ok(!P.inPeriod({ work_date: null }, '2026-09-01', '2026-09-30'), 'výkaz bez dátumu nepatrí nikam');
}

// ── Čo sa zavrie ────────────────────────────────────────────────────────────
{
  const rows = [
    ts('1', 'a1', 'w1', '2026-09-05', 8, 'construction'),
    ts('2', 'a1', 'w1', '2026-09-06', 4.5, 'travel'),
    ts('3', 'a2', 'w2', '2026-09-05', 8, 'construction'),
    ts('4', 'a1', 'w1', '2026-09-07', 8, 'construction', false),   // neschválené
    ts('5', 'a1', 'w1', '2026-10-01', 8, 'construction'),          // mimo obdobia
    ts('6', 'a1', 'w1', '2026-09-08', 8, 'construction', true, { period_id: 'iné' }),
  ];
  const p = P.preview({ timesheets: rows, assignments: ASG,
    from: '2026-09-01', to: '2026-09-30' });

  eq(p.hours.construction, 16, 'stavebné hodiny');
  eq(p.hours.travel, 4.5, 'cesta zvlášť — pri kontrole je to rozdiel');
  eq(p.totalHours, 20.5, 'spolu');
  eq(p.workers, 2, 'dvaja ľudia');

  // (8 + 4.5) × 34 + 8 × 34 = 697
  eq(M.format(p.charged), '697,00 €', 'fakturujeme');
  // (8 + 4.5) × 26 + 8 × 24 = 517
  eq(M.format(p.cost), '517,00 €', 'náklad');
  eq(M.format(p.margin), '180,00 €', 'marža');
  eq(p.marginPct, 25.8, 'marža v percentách');

  eq(p.included.map(t => t.id), ['1', '2', '3'], 'do podkladu idú len schválené a voľné');
  eq(p.unapproved.map(t => t.id), ['4'], 'neschválené sa vyčlenia');
  eq(p.alreadyClosed.map(t => t.id), ['6'], 'hodiny iného obdobia sa nezarátajú dvakrát');
  eq(p.noRate, [], 'sadzby sedia');
}

// ── Okrajové prípady ────────────────────────────────────────────────────────
{
  const empty = P.preview({ timesheets: [], assignments: ASG, from: '2026-09-01', to: '2026-09-30' });
  eq(empty.totalHours, 0, 'prázdne obdobie');
  eq(empty.charged, 0, 'nula fakturácie');
  eq(empty.marginPct, null, 'bez fakturácie sa percento nepočíta');
  eq(P.preview({ from: '2026-09-01', to: '2026-09-30' }).totalHours, 0, 'bez vstupu nezhodí');
  eq(P.preview({ timesheets: [null], assignments: ASG, from: '2026-09-01', to: '2026-09-30' })
    .totalHours, 0, 'prázdny riadok sa preskočí');

  // Neznámy druh činnosti sa nestratí — spadne do „iné".
  const odd = P.preview({
    timesheets: [ts('1', 'a1', 'w1', '2026-09-05', 6, 'nieco_ine')],
    assignments: ASG, from: '2026-09-01', to: '2026-09-30',
  });
  eq(odd.hours.other, 6, 'neznámy druh spadne do „iné"');
  eq(odd.totalHours, 6, 'a do celku sa počíta');

  // Chýbajúci druh znamená stavebné práce — tak to robí aj SQL.
  const noKind = P.preview({
    timesheets: [{ id: '1', assignment_id: 'a1', worker_id: 'w1',
      work_date: '2026-09-05', hours: 8, approved: true }],
    assignments: ASG, from: '2026-09-01', to: '2026-09-30',
  });
  eq(noKind.hours.construction, 8, 'chýbajúci druh je stavebná práca');

  // Nasadenie, ktoré v zozname nie je — hodiny sa nesmú stratiť.
  const orphan = P.preview({
    timesheets: [ts('1', 'neznamy', 'w1', '2026-09-05', 8, 'construction')],
    assignments: ASG, from: '2026-09-01', to: '2026-09-30',
  });
  eq(orphan.hours.construction, 8, 'hodiny bez nasadenia sa zarátajú');
  eq(orphan.charged, 0, 'ale suma z nich nevyjde');
  eq(orphan.noRate.length, 1, 'a povie sa to');

  // `rate_used` má prednosť pred sadzbou nasadenia — presne preto existuje.
  const frozen = P.preview({
    timesheets: [ts('1', 'a1', 'w1', '2026-09-05', 10, 'construction', true, { rate_used: 20 })],
    assignments: ASG, from: '2026-09-01', to: '2026-09-30',
  });
  eq(M.format(frozen.cost), '200,00 €', 'zmrazená sadzba prebije sadzbu nasadenia');
  eq(M.format(frozen.charged), '340,00 €', 'fakturačná sadzba sa nemení');

  // Desatinné hodiny sa nesmú stratiť.
  const frac = P.preview({
    timesheets: [ts('1', 'a1', 'w1', '2026-09-05', 7.25, 'construction')],
    assignments: ASG, from: '2026-09-01', to: '2026-09-30',
  });
  eq(M.format(frac.charged), '246,50 €', '7,25 h × 34 € sedí na cent');
}

// ── Dá sa uzavrieť? ─────────────────────────────────────────────────────────
{
  const rows = [ts('1', 'a1', 'w1', '2026-09-05', 8, 'construction')];
  const clean = P.review({ timesheets: rows, assignments: ASG,
    from: '2026-09-01', to: '2026-09-30' });
  eq(clean.ok, true, 'obdobie so schválenými hodinami sa dá uzavrieť');
  eq(clean.warnings, [], 'bez upozornení');

  // Prázdne obdobie
  const empty = P.review({ timesheets: [], assignments: ASG,
    from: '2026-09-01', to: '2026-09-30' });
  eq(empty.ok, false, 'prázdne obdobie sa neuzatvára');
  eq(empty.reasons.map(r => r.rule), ['period_empty'], 'a povie sa prečo');
  ok(empty.reasons[0].detail.includes('Nie je čo'), 'bez výkazov je to jasné');

  // Prázdne, ale len preto, že nikto neschválil — to je iná situácia.
  const allUnapproved = P.review({
    timesheets: [ts('1', 'a1', 'w1', '2026-09-05', 8, 'construction', false)],
    assignments: ASG, from: '2026-09-01', to: '2026-09-30',
  });
  eq(allUnapproved.ok, false, 'samé neschválené hodiny sa uzavrieť nedajú');
  ok(allUnapproved.reasons[0].detail.includes('čaká na schválenie'),
    'a povie sa, že stačí schváliť');

  // Neschválené hodiny neblokujú, ale sú to peniaze na stole.
  const partial = P.review({
    timesheets: [...rows, ts('2', 'a1', 'w1', '2026-09-06', 6, 'construction', false)],
    assignments: ASG, from: '2026-09-01', to: '2026-09-30',
  });
  eq(partial.ok, true, 'neschválené hodiny uzávierku neblokujú');
  eq(partial.warnings.map(w => w.rule), ['period_unapproved'], 'ale upozornia');
  ok(partial.warnings[0].detail.includes('6 hodín'), 'a povedia koľko hodín');

  // Chýbajúca sadzba
  const noRate = P.review({
    timesheets: [ts('1', 'a3', 'w3', '2026-09-05', 8, 'construction')],
    assignments: ASG, from: '2026-09-01', to: '2026-09-30',
  });
  ok(noRate.warnings.some(w => w.rule === 'period_missing_rate'), 'chýbajúca sadzba upozorní');

  // Záporná marža na podklade — na zákazke sa reálne prerába.
  const loss = P.review({
    timesheets: [ts('1', 'aL', 'w1', '2026-09-05', 10, 'construction')],
    assignments: [{ id: 'aL', charge_rate: 20, worker_rate: 26 }],
    from: '2026-09-01', to: '2026-09-30',
  });
  ok(loss.warnings.some(w => w.rule === 'period_negative_margin'), 'strata upozorní');
  ok(loss.warnings.find(w => w.rule === 'period_negative_margin').label.includes('60,00'),
    'a povie koľko');

  // Prekrývajúce sa obdobia
  const overlap = P.review({
    timesheets: [...rows, ts('2', 'a1', 'w1', '2026-09-06', 8, 'construction', true, { period_id: 'x' })],
    assignments: ASG, from: '2026-09-01', to: '2026-09-30',
  });
  ok(overlap.warnings.some(w => w.rule === 'period_overlap'), 'prekryv období upozorní');
}

// ── Riadky do prehľadu ──────────────────────────────────────────────────────
{
  const p = P.preview({
    timesheets: [ts('1', 'a1', 'w1', '2026-09-05', 10, 'construction'),
                 ts('2', 'a1', 'w1', '2026-09-06', 2, 'travel')],
    assignments: ASG, from: '2026-09-01', to: '2026-09-30',
  });
  const lines = P.sumLines(p);
  eq(lines.reduce((s, l) => s + (l.kind === 'minus' ? -l.cents : l.cents), 0), p.margin,
    'súčet riadkov dá maržu');

  const hl = P.hourLines(p);
  eq(hl.map(x => x.key), ['construction', 'travel'], 'nulové druhy sa nevypisujú');
  eq(hl[0].hours, 10, 'hodiny sedia');
}

// ── Návrh nasledujúceho obdobia ─────────────────────────────────────────────
{
  // Podľa šablóny Rahmenvertrag sa nemeckému odberateľovi fakturuje týždenne
  // po kalendárnych týždňoch (KW, pondelok až nedeľa) — to je predvolené.
  eq(P.nextPeriod([], '2026-11-18'), { from: '2026-11-16', to: '2026-11-22' },
    'prvé obdobie je týždeň (KW), v ktorom je dnešok');
  eq(P.nextPeriod([{ period_to: '2026-11-22' }], '2026-11-25'),
    { from: '2026-11-23', to: '2026-11-29' }, 'ďalšie nadväzuje bez diery, ďalší KW');
  eq(P.nextPeriod([{ period_to: '2026-11-08' }, { period_to: '2026-11-22' }], '2026-11-25'),
    { from: '2026-11-23', to: '2026-11-29' }, 'rozhoduje posledné, nie prvé');
  // Odberateľ so 14/14 — dva KW naraz.
  eq(P.nextPeriod([{ period_to: '2026-11-22' }], '2026-11-25', { days: 14 }),
    { from: '2026-11-23', to: '2026-12-06' }, '14 dní = dva KW');
  // Prechod z mesačného obdobia: nové sa zarovná na koniec KW (stará data ostávajú).
  eq(P.nextPeriod([{ period_to: '2026-10-31' }], '2026-11-02'),
    { from: '2026-11-01', to: '2026-11-08' }, 'po mesačnom období sa ďalšie dorovná na nedeľu');
  // Mesačná fakturácia ostáva ako možnosť pri odberateľovi.
  eq(P.nextPeriod([], '2026-09-17', { days: 30 }), { from: '2026-09-01', to: '2026-09-30' },
    'mesačne: prvé obdobie je celý mesiac');
  eq(P.nextPeriod([{ period_to: '2026-09-30' }], '2026-10-17', { days: 31 }),
    { from: '2026-10-01', to: '2026-10-31' }, 'mesačne: ďalšie nadväzuje');
  eq(P.nextPeriod([{ period_to: '2026-12-31' }], '2027-01-05', { days: 30 }),
    { from: '2027-01-01', to: '2027-01-31' }, 'mesačne: nový rok nadväzuje správne');
  eq(P.nextPeriod([{ period_to: '2026-12-27' }], '2027-01-05'),
    { from: '2026-12-28', to: '2027-01-03' }, 'týždeň cez prelom roka (KW 53)');

  // Február aj prestupný rok
  eq(P.lastOfMonth('2026-02-10'), '2026-02-28', 'február má 28 dní');
  eq(P.lastOfMonth('2028-02-10'), '2028-02-29', 'v prestupnom roku 29');
  eq(P.lastOfMonth('2026-12-01'), '2026-12-31', 'december');
  eq(P.firstOfMonth('2026-09-17'), '2026-09-01', 'prvý deň mesiaca');
  eq(P.addDays('2026-12-31', 1), '2027-01-01', 'deň po Silvestri');
  eq(P.addDays('2026-02-28', 1), '2026-03-01', 'deň po februári');
}

// ── Kalendárne týždne (KW) ──────────────────────────────────────────────────
{
  eq(P.isoWeek('2026-11-25'), { week: 48, year: 2026 }, '25. 11. 2026 je KW 48');
  eq(P.isoWeek('2026-12-31'), { week: 53, year: 2026 }, '2026 má KW 53');
  eq(P.isoWeek('2027-01-04'), { week: 1, year: 2027 }, '4. 1. 2027 je KW 1');
  eq(P.isoWeek('2026-09-21'), { week: 39, year: 2026 }, 'KW 39 ako vo vzore faktúry');
  eq(P.mondayOf('2026-11-22'), '2026-11-16', 'pondelok týždňa (nedeľa patrí k predchádzajúcemu pondelku)');
  eq(P.kwLabel('2026-11-16', '2026-11-22'), 'KW 47 · 16.11.–22.11.2026', 'popis týždenného obdobia');
  eq(P.kwLabel('2026-11-09', '2026-11-22'), 'KW 46–47 · 09.11.–22.11.2026', 'popis dvoch týždňov');
  eq(P.kwLabel('2026-10-01', '2026-10-31'), '01.10.–31.10.2026', 'mesačné obdobie bez KW');
}

// ── Živnostník fakturuje za 2 KW ────────────────────────────────────────────
{
  const per = (id, from, to) => ({ id, period_from: from, period_to: to });
  const w = P.workerWindows([
    per('c', '2026-11-16', '2026-11-22'), per('a', '2026-11-02', '2026-11-08'),
    per('b', '2026-11-09', '2026-11-15'), per('e', '2026-12-07', '2026-12-13'),
  ]);
  eq(w.map(x => x.periods.map(p => p.id).join('')), ['ab', 'c', 'e'], 'po sebe idúce týždne sa spoja po dvoch, medzera začne nové okno');
  eq(w.map(x => [x.from, x.to, x.complete]), [['2026-11-02', '2026-11-15', true], ['2026-11-16', '2026-11-22', false],
    ['2026-12-07', '2026-12-13', false]], 'okno vie, či má plné 2 týždne');
  eq(P.workerWindows([per('a', '2026-11-02', '2026-11-08'), per('b', '2026-11-09', '2026-11-15')], { days: 7 })
    .map(x => x.periods.length), [1, 1], 'pri 7 dňoch každý týždeň zvlášť');
  eq(P.workerWindows([per('m', '2026-10-01', '2026-10-31')]).map(x => x.periods.length), [1], 'staré mesačné obdobie ostane samo');
  eq(P.workerWindows([]), [], 'bez období nič');
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
