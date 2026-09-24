// ============================================================================
// Testy vydanej faktúry
// Spustenie:  node danubra/lib/billing/invoice.test.js
// ============================================================================
global.window = global;
const M = require('../money.js');
const I = require('./invoice');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

const PARTNER = {
  id: 'p1', name: 'Bauer Bau GmbH', ust_idnr: 'DE811234567',
  country: 'DE', city: 'Leipzig', postal_code: '04329',
  address: 'Industriestraße 12', email: 'bauer@bauerbau.de',
};
const SUB = { id: 's1', title: 'Sadrokartónové práce — Leipzig',
  work_type: 'construction', freistellung_verified: false };
const PERIOD = { id: 'per1', status: 'closed', period_from: '2026-09-01',
  period_to: '2026-09-30', hours_construction: 312, amount_charged: 8736 };
const INV = {
  id: 'i1', invoice_number: '2026042', partner_id: 'p1', period_id: 'per1',
  total: 8736, withholding_pct: 15, vat_regime: 'reverse_charge',
  currency: 'EUR', issue_date: '2026-10-01', due_date: '2026-10-31',
  status: 'draft',
};

console.log('Vydaná faktúra');

// ── Schvaľovací tok ─────────────────────────────────────────────────────────
{
  // Musí sedieť s triggerom danubra_invoice_approval_flow().
  ok(I.canGo('draft', 'pending_approval'), 'rozpracovaná ide na schválenie');
  ok(I.canGo('pending_approval', 'approved'), 'schváliť sa dá');
  ok(I.canGo('approved', 'issued'), 'schválená sa vystaví');
  ok(I.canGo('issued', 'sent'), 'vystavená sa odošle');
  ok(I.canGo('sent', 'paid'), 'odoslaná sa uhradí');

  // Toto je tvrdé pravidlo zo zadania.
  ok(!I.canGo('draft', 'issued'), 'rozpracovaná sa nevystaví rovno');
  ok(!I.canGo('pending_approval', 'issued'), 'ani čakajúca na schválenie');
  ok(!I.canGo('approved', 'sent'), 'schválená sa neodošle bez vystavenia');
  ok(!I.canGo('draft', 'paid'), 'a už vôbec nie rovno uhradená');

  // Vystavený doklad je v účtovníctve — späť sa nevracia.
  ok(!I.canGo('issued', 'draft'), 'vystavená sa nevracia do rozpracovaných');
  ok(!I.canGo('issued', 'approved'), 'ani do schválených');
  ok(!I.canGo('paid', 'sent'), 'uhradená je koniec');
  eq(I.FLOW.paid, [], 'z uhradenej sa nikam nejde');
  eq(I.FLOW.cancelled, [], 'zo stornovanej tiež nie');

  // Vrátenie na prepracovanie je povolené, kým doklad nevznikol.
  ok(I.canGo('pending_approval', 'draft'), 'čakajúca sa dá vrátiť');
  ok(I.canGo('approved', 'pending_approval'), 'aj schválená sa dá vrátiť');

  eq(I.nextSteps({ status: 'approved' }), ['issued', 'pending_approval'],
    'storno sa medzi bežné kroky nepočíta');
  eq(I.nextSteps({ status: 'paid' }), [], 'z uhradenej niet kam');
  eq(I.nextSteps({ status: 'nieco' }), [], 'neznámy stav nezhodí');
  ok(!I.canGo('nieco', 'issued'), 'z neznámeho stavu sa nikam nedostane');
}

// ── §48b ────────────────────────────────────────────────────────────────────
{
  // Príklad z docs/v2/03_superfaktura.md, kapitola 6.
  const w = I.withholding(INV);
  eq(M.format(w.gross), '8 736,00 €', 'fakturovaná suma');
  eq(M.format(w.withheld), '1 310,40 €', 'zrážka 15 %');
  eq(M.format(w.net), '7 425,60 €', 'na účet príde zvyšok');
  eq(w.gross, w.withheld + w.net, 'zrážka a zvyšok dajú presne celok');

  eq(I.withholding({ total: 1000, withholding_pct: 0 }).withheld, 0, 'nulové percento');
  eq(I.withholding({ total: 1000 }).withheld, 0, 'chýbajúce percento je nula');
  eq(I.withholding({}).gross, 0, 'prázdna faktúra');

  // Kedy sa zrážka vôbec uplatňuje.
  ok(I.withholdingApplies(SUB), 'stavba bez Freistellung → zrážka');
  ok(!I.withholdingApplies({ ...SUB, freistellung_verified: true }),
    's Freistellungom zrážka nie je');
  ok(!I.withholdingApplies({ ...SUB, work_type: 'workshop' }),
    'dielenské práce zrážke nepodliehajú');
  ok(!I.withholdingApplies({}), 'bez typu prác sa zrážka neuplatní');

  const lines = I.sumLines(INV);
  eq(lines.length, 2, 'dva riadky');
  eq(lines[1].kind, 'minus', 'zrážka sa odčítava');
  eq(I.sumLines({ total: 100 }).length, 1, 'bez zrážky je riadok jeden');
}

// ── Čo musí platiť pred schválením ──────────────────────────────────────────
{
  const clean = I.reviewBeforeApproval({
    invoice: INV, partner: PARTNER, subcontract: SUB, period: PERIOD,
  });
  eq(clean.ok, true, 'faktúra z podkladu sa dá schváliť');
  eq(clean.reasons, [], 'žiadne prekážky');
  // Zrážka nie je chyba, ale musí byť vidieť pred kliknutím.
  ok(clean.warnings.some(w => w.rule === 'invoice_withholding'),
    'zrážka §48b sa ukáže ako upozornenie');
  ok(clean.warnings.find(w => w.rule === 'invoice_withholding').label.includes('7\u00a0425,60'),
    'a povie, koľko reálne príde');

  // Reverse charge bez USt-IdNr nie je reverse charge.
  const noVat = I.reviewBeforeApproval({
    invoice: INV, partner: { ...PARTNER, ust_idnr: null }, subcontract: SUB, period: PERIOD,
  });
  eq(noVat.ok, false, 'reverse charge bez USt-IdNr blokuje');
  ok(noVat.reasons.some(r => r.rule === 'invoice_no_ustidnr'), 'a pomenuje sa');
  eq(I.reviewBeforeApproval({
    invoice: { ...INV, vat_regime: 'standard' },
    partner: { ...PARTNER, ust_idnr: null }, subcontract: SUB, period: PERIOD,
  }).ok, true, 'pri bežnom režime USt-IdNr netreba');

  // Suma faktúry musí sedieť s podkladom — rozdiel znamená ručný zásah.
  const mismatch = I.reviewBeforeApproval({
    invoice: { ...INV, total: 9000 }, partner: PARTNER, subcontract: SUB, period: PERIOD,
  });
  eq(mismatch.ok, false, 'suma mimo podkladu blokuje');
  ok(mismatch.reasons.some(r => r.rule === 'invoice_amount_mismatch'), 'a povie sa to');
  ok(mismatch.reasons.find(r => r.rule === 'invoice_amount_mismatch').detail.includes('264,00'),
    'aj s rozdielom');

  // Otvorené obdobie
  const openPeriod = I.reviewBeforeApproval({
    invoice: INV, partner: PARTNER, subcontract: SUB,
    period: { ...PERIOD, status: 'open' },
  });
  eq(openPeriod.ok, false, 'faktúra z otvoreného obdobia sa neschvaľuje');
  ok(openPeriod.reasons.some(r => r.rule === 'invoice_period_open'), 'a vie sa prečo');

  // Nula a chýbajúce základy
  eq(I.reviewBeforeApproval({ invoice: { ...INV, total: 0 }, partner: PARTNER,
    subcontract: SUB, period: { ...PERIOD, amount_charged: 0 } })
    .reasons.map(r => r.rule), ['invoice_zero'], 'faktúra na nulu blokuje');
  ok(I.reviewBeforeApproval({ invoice: {}, partner: {} }).reasons
    .map(r => r.rule).includes('invoice_no_partner'), 'bez odberateľa to nejde');
  ok(I.reviewBeforeApproval({ invoice: { ...INV, invoice_number: null }, partner: PARTNER,
    subcontract: SUB, period: PERIOD }).reasons
    .some(r => r.rule === 'invoice_no_number'), 'bez čísla to nejde');

  // Stavba bez Freistellungu, ale zrážka nula — na to treba upozorniť.
  const noWh = I.reviewBeforeApproval({
    invoice: { ...INV, withholding_pct: 0 }, partner: PARTNER,
    subcontract: SUB, period: PERIOD,
  });
  eq(noWh.ok, true, 'nulová zrážka neblokuje');
  ok(noWh.warnings.some(w => w.rule === 'invoice_missing_withholding'),
    'ale upozorní, že odberateľ pravdepodobne zrazí aj tak');

  ok(I.reviewBeforeApproval({ invoice: INV, partner: { ...PARTNER, email: null },
    subcontract: SUB, period: PERIOD }).warnings
    .some(w => w.rule === 'invoice_no_email'), 'odberateľ bez e-mailu upozorní');
}

// ── Payload pre SuperFaktúru ────────────────────────────────────────────────
{
  const p = I.sfPayload({ invoice: INV, partner: PARTNER, subcontract: SUB,
    period: PERIOD, supplier: { name: 'Štefan Varga' } });

  eq(p.InvoiceItem.length, 1, 'jedna položka');
  eq(p.InvoiceItem[0].quantity, 312, 'hodiny z podkladu');
  eq(p.InvoiceItem[0].unit, 'h', 'jednotka z číselníka');
  eq(p.InvoiceItem[0].unit_price, 28, 'sadzba dopočítaná zo sumy');
  // Súčet položky musí sedieť s faktúrou na cent.
  eq(Math.round(p.InvoiceItem[0].quantity * p.InvoiceItem[0].unit_price * 100), 873600,
    'položka dá presne fakturovanú sumu');

  // Reverse charge = nulová sadzba a povinná veta po nemecky.
  eq(p.InvoiceItem[0].tax, 0, 'reverse charge má nulovú sadzbu');
  ok(p.Invoice.comment.includes('Steuerschuldnerschaft des Leistungsempfängers'),
    'povinná veta §13b');
  ok(p.Invoice.comment.includes('§48b'), 'a poznámka o zrážke');
  ok(p.Invoice.comment.includes('1.310,40'), 'v nemeckom zápise čísla');
  ok(p.Invoice.comment.includes('7.425,60'), 'aj s tým, koľko príde na účet');

  eq(p.Client.country_id, 63, 'Nemecko má svoje číslo');
  eq(p.Client.ic_dph, 'DE811234567', 'USt-IdNr ide do ic_dph');
  eq(p.Client.update_addressbook, 1, 'odberateľ sa uloží do adresára');
  eq(p.InvoiceSetting.language, 'deu', 'doklad pre partnera je po nemecky');
  eq(p.Invoice.variable, '2026042', 'variabilný symbol na párovanie s bankou');

  // Bežný režim → DPH namiesto nuly.
  const std = I.sfPayload({ invoice: { ...INV, vat_regime: 'standard' },
    partner: PARTNER, subcontract: SUB, period: PERIOD });
  eq(std.InvoiceItem[0].tax, 20, 'bez reverse charge sa účtuje DPH');
  ok(!String(std.Invoice.comment || '').includes('§13b'), 'a veta §13b tam nie je');

  // Keď zaokrúhlenie sadzby rozhodí súčet, ide paušálna položka s presnou
  // sumou — inak by SuperFaktúra vyrátala iné číslo než podklad.
  const odd = I.sfPayload({
    invoice: { ...INV, total: 1000 }, partner: PARTNER, subcontract: SUB,
    period: { ...PERIOD, hours_construction: 3, amount_charged: 1000 },
  });
  eq(odd.InvoiceItem[0].unit, 'pausal', 'nedeliteľná suma ide ako paušál');
  eq(odd.InvoiceItem[0].unit_price, 1000, 'so sumou presne z podkladu');
  ok(odd.InvoiceItem[0].description.includes('3 h'), 'a hodinami v popise');

  // Bez hodín (paušálna zákazka)
  const noHours = I.sfPayload({ invoice: INV, partner: PARTNER, subcontract: SUB,
    period: { ...PERIOD, hours_construction: 0 } });
  eq(noHours.InvoiceItem[0].unit, 'pausal', 'bez hodín je to paušál');
  eq(noHours.InvoiceItem[0].unit_price, 8736, 's plnou sumou');

  // Do SuperFaktúry ide plná suma — zrážka nie je zľava.
  eq(p.InvoiceItem[0].quantity * p.InvoiceItem[0].unit_price, 8736,
    'zrážka §48b sa od dokladu neodpočítava');

  // Hodiny sa sčítavajú cez všetky druhy.
  const mixed = I.sfPayload({ invoice: { ...INV, total: 1020 }, partner: PARTNER,
    subcontract: SUB,
    period: { hours_construction: 20, hours_travel: 10, period_from: '2026-09-01' } });
  eq(mixed.InvoiceItem[0].quantity, 30, 'cesta sa do fakturovaných hodín počíta');
  eq(mixed.InvoiceItem[0].unit_price, 34, 'a sadzba z toho vyjde');

  eq(I.sfPayload({}).InvoiceItem[0].unit_price, 0, 'prázdny vstup nezhodí');
  eq(I.sfPayload({ invoice: INV, partner: { name: 'X', country: 'SK' } }).Client.country_id, 191,
    'Slovensko má tiež svoje číslo');
  eq(I.sfPayload({ invoice: INV, partner: { name: 'X', country: 'xx' } }).Client.country_id,
    undefined, 'neznáma krajina sa neposiela vymyslená');
}

// ── Nemecký zápis čísla ─────────────────────────────────────────────────────
{
  eq(I.fmtDe(131040), '1.310,40', 'tisíce bodkou, desatiny čiarkou');
  eq(I.fmtDe(100), '1,00', 'jedno euro');
  eq(I.fmtDe(0), '0,00', 'nula');
  eq(I.fmtDe(123456789), '1.234.567,89', 'milióny');
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
