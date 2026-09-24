// ============================================================================
// Testy ponúk
// Spustenie:  node danubra/lib/quotes.test.js
// ============================================================================
global.window = global;
const M = require('./money.js');
const Q = require('./quotes');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

const TODAY = '2026-09-17';
const base = {
  id: 'q1', partner_id: 'p1', title: 'Sadrokartón Leipzig',
  charge_rate: 34, worker_rate: 26, overhead_per_hour: 4,
  hours_per_month: 168, headcount: 4, work_type: 'construction',
  valid_until: '2026-10-31', status: 'draft',
};

console.log('Ponuky');

// ── Marža ───────────────────────────────────────────────────────────────────
{
  const m = Q.margin(base);
  eq(M.format(m.perHour), '4,00 €', 'marža na hodinu je po odpočítaní réžie');
  eq(m.pct, 11.8, 'podiel z fakturovanej sumy');
  eq(M.format(m.perPersonMonth), '672,00 €', 'na človeka a mesiac');
  eq(M.format(m.perMonth), '2 688,00 €', 'na celú partiu');
  eq(M.format(m.revenueMonth), '22 848,00 €', 'mesačná fakturácia');
  eq(M.format(m.costMonth), '20 160,00 €', 'mesačné náklady');
  eq(m.revenueMonth - m.costMonth, m.perMonth, 'tržby mínus náklady dajú maržu');

  // Réžia sa zabúda a bez nej marža klame — toto je ten rozdiel.
  const noOverhead = Q.margin({ ...base, overhead_per_hour: 0 });
  eq(M.format(noOverhead.perHour), '8,00 €', 'bez réžie vyzerá marža dvojnásobne');
  eq(noOverhead.pct, 23.5, 'a percento tiež');

  eq(Q.margin({}).perHour, 0, 'prázdna ponuka má nulovú maržu');
  eq(Q.margin({}).pct, null, 'bez sadzby sa percento nepočíta');
  eq(Q.margin({ charge_rate: 30 }).pct, 100, 'bez nákladov je marža stopercentná');
  eq(Q.margin({ charge_rate: 20, worker_rate: 26 }).perHour, -600, 'záporná marža');

  // Desatinné sadzby a hodiny sa nesmú stratiť.
  eq(M.format(Q.margin({ charge_rate: 28.5, worker_rate: 22.75,
    overhead_per_hour: 3.25, hours_per_month: 173.25, headcount: 1 }).perMonth),
    '433,13 €', 'desatinné sadzby aj hodiny sedia na cent');
  eq(Q.margin({ ...base, headcount: null }).perMonth,
    Q.margin({ ...base, headcount: 1 }).perMonth, 'chýbajúci počet ľudí znamená jedného');
}

// ── Riadky do prehľadu ──────────────────────────────────────────────────────
{
  const lines = Q.sumLines(base);
  eq(lines.map(l => l.kind), [undefined, 'minus', 'minus'], 'náklady sa odčítavajú');
  eq(lines.reduce((s, l) => s + (l.kind === 'minus' ? -l.cents : l.cents), 0),
    Q.margin(base).perHour, 'súčet riadkov dá maržu na hodinu');
}

// ── Kontrola pred odoslaním ─────────────────────────────────────────────────
{
  const clean = Q.review(base, {}, { today: TODAY });
  eq(clean.ok, true, 'zdravá ponuka sa dá odoslať');
  eq(clean.reasons, [], 'žiadne prekážky');

  // Marža 11,8 % je pod cieľom 20 %, ale nad dnom 3 €/h → upozornenie.
  eq(clean.warnings.map(w => w.rule), ['quote_below_target'],
    'nízka marža je upozornenie, nie prekážka');

  // Chýbajúce základy
  eq(Q.review({}, {}, { today: TODAY }).reasons.map(r => r.rule).sort(),
    ['quote_no_partner', 'quote_no_rate'], 'bez odberateľa a sadzby to nejde');

  // Prerábanie je prekážka, nie upozornenie.
  const loss = Q.review({ ...base, charge_rate: 28 }, {}, { today: TODAY });
  eq(loss.ok, false, 'na ponuke so stratou sa nedá pokračovať');
  eq(loss.reasons.map(r => r.rule), ['quote_negative_margin'], 'a povie sa prečo');
  ok(loss.reasons[0].label.includes('2,00'), 'aj s tým, koľko sa prerába');

  // Tenká marža
  const thin = Q.review({ ...base, charge_rate: 32 }, {}, { today: TODAY });
  eq(thin.ok, true, 'tenká marža neblokuje');
  eq(thin.warnings.map(w => w.rule), ['quote_thin_margin'], 'ale upozorní');
  ok(thin.warnings[0].detail.includes('chorý'), 'a povie, čo sa môže stať');

  // Nulová réžia
  const noOh = Q.review({ ...base, overhead_per_hour: 0 }, {}, { today: TODAY });
  ok(noOh.warnings.some(w => w.rule === 'quote_no_overhead'), 'nulová réžia upozorní');

  // Prahy sa dajú prepísať z nastavení.
  eq(Q.review(base, { target_margin_pct: 10 }, { today: TODAY }).warnings.length, 0,
    'nižší cieľ marže upozornenie zruší');
  eq(Q.review({ ...base, charge_rate: 32 }, { min_margin_per_hour: 1 }, { today: TODAY })
    .warnings.map(w => w.rule), ['quote_below_target'],
    'nižšie dno zmení upozornenie na to o cieli');
}

// ── Minimálna mzda je pokuta, nie marža ─────────────────────────────────────
{
  // Sadzba pod stavebnou minimálnou mzdou blokuje, aj keď je marža skvelá.
  const cheap = Q.review({ ...base, worker_rate: 14, charge_rate: 34 }, {}, { today: TODAY });
  eq(cheap.ok, false, 'sadzba pod Bau-Mindestlohn blokuje');
  eq(cheap.reasons.map(r => r.rule), ['below_min_wage'], 'kľúč sedí s číselníkom výnimiek');
  ok(cheap.reasons[0].detail.includes('Zoll'), 'a povie, čo hrozí');
  ok(cheap.reasons[0].detail.includes('15,86'), 'aj aké je minimum');
  ok(cheap.reasons[0].label.includes('stavebnou minimálnou mzdou'),
    'a veta je po slovensky, nie zlepená z kúskov');

  // Dielenské práce majú nižší prah — to je dôvod, prečo ich plán odporúča
  // ako vstupný segment.
  const workshop = Q.review({ ...base, worker_rate: 14, work_type: 'workshop' },
    {}, { today: TODAY });
  eq(workshop.ok, true, 'v dielni je 14 € nad všeobecným Mindestlohnom');

  eq(Q.review({ ...base, worker_rate: 13, work_type: 'workshop' }, {}, { today: TODAY })
    .reasons.map(r => r.rule), ['below_min_wage'], 'pod 13,90 už ani v dielni');

  // Presne na hranici sa nesmie blokovať.
  eq(Q.review({ ...base, worker_rate: 15.86 }, {}, { today: TODAY }).ok, true,
    'presne na minimálnej mzde to prejde');
  eq(Q.review({ ...base, worker_rate: 15.85 }, {}, { today: TODAY }).ok, false,
    'cent pod ňou už nie');

  // Prah sa dá prepísať, keď sa sadzby zmenia zákonom.
  eq(Q.review({ ...base, worker_rate: 16 }, { bau_min_lg1: 17.5 }, { today: TODAY }).ok, false,
    'vyšší prah z nastavení platí');
}

// ── Platnosť a dátumy ───────────────────────────────────────────────────────
{
  const noValid = Q.review({ ...base, valid_until: null }, {}, { today: TODAY });
  ok(noValid.warnings.some(w => w.rule === 'quote_no_validity'), 'chýbajúca platnosť');

  const expired = Q.review({ ...base, valid_until: '2026-08-01' }, {}, { today: TODAY });
  ok(expired.warnings.some(w => w.rule === 'quote_expired'), 'prepadnutá platnosť');

  // Prijatej ponuky sa platnosť už netýka.
  const accepted = Q.review({ ...base, valid_until: '2026-08-01', status: 'accepted' },
    {}, { today: TODAY });
  ok(!accepted.warnings.some(w => w.rule === 'quote_expired'),
    'pri prijatej ponuke sa platnosť nerieši');

  const badDates = Q.review({ ...base, date_from: '2026-10-01', date_to: '2026-09-01' },
    {}, { today: TODAY });
  eq(badDates.ok, false, 'koniec pred začiatkom je chyba');
  ok(badDates.reasons.some(r => r.rule === 'quote_bad_dates'), 'a pomenuje sa');

  eq(Q.review({ ...base, date_from: '2026-10-01', date_to: '2026-10-01' }, {}, { today: TODAY }).ok,
    true, 'jednodňové nasadenie je v poriadku');
}

// ── Stavy ───────────────────────────────────────────────────────────────────
{
  ok(Q.canGo('draft', 'sent'), 'rozpracovaná sa dá odoslať');
  ok(Q.canGo('sent', 'accepted'), 'odoslaná sa dá prijať');
  ok(Q.canGo('sent', 'rejected'), 'aj odmietnuť');
  ok(Q.canGo('expired', 'sent'), 'prepadnutá sa dá poslať znova');

  // Odmietnutá ponuka sa nevracia medzi rozpracované — zahladilo by to,
  // že raz odišla. Namiesto toho sa spraví nová.
  ok(!Q.canGo('rejected', 'draft'), 'odmietnutá sa nevracia do rozpracovaných');
  ok(!Q.canGo('accepted', 'draft'), 'ani prijatá');
  ok(!Q.canGo('accepted', 'rejected'), 'prijatá sa nedá dodatočne odmietnuť');
  ok(!Q.canGo('draft', 'accepted'), 'nedá sa prijať to, čo neodišlo');
  ok(!Q.canGo('neznamy', 'sent'), 'neznámy stav nikam nevedie');
}

// ── Prechod na zmluvu ───────────────────────────────────────────────────────
{
  const c = Q.toContract(base);
  eq(c.partner_id, 'p1', 'odberateľ prejde');
  eq(c.quote_id, 'q1', 'väzba na ponuku zostane');
  eq(c.charge_rate, 34, 'dohodnutá sadzba prejde');
  eq(c.kind, 'werkvertrag', 'predvolene zmluva o dielo');
  eq(c.status, 'draft', 'zmluva začína ako rozpracovaná');

  // Predmet sa nekopíruje z názvu ponuky. Musí sa napísať v reči diela —
  // pri kontrole rozhoduje obsah zmluvy, nie jej názov.
  eq(c.scope, null, 'predmet diela sa nepredvyplní z názvu ponuky');

  eq(Q.toContract({}).partner_id, null, 'prázdna ponuka nezhodí prevod');
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
