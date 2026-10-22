// ============================================================================
// Testy: prijatá faktúra zo súboru
// Spustenie:  node app/lib/billing/extract.test.js
// ============================================================================
global.window = global;
const X = require('./extract.js');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg, detail) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${detail ? `\n    ${detail}` : ''}`); }
}

console.log('Prijatá faktúra zo súboru');

// ── Sumy, dátumy, IBAN ──────────────────────────────────────────────────────
{
  eq(X.money('1 234,56 €'), 1234.56, 'slovenský zápis sumy');
  eq(X.money('1.234,56'), 1234.56, 'nemecký zápis sumy');
  eq(X.money('1,234.56'), 1234.56, 'anglický zápis sumy');
  eq(X.money(1234.567), 1234.57, 'číslo na dve desatinné');
  eq(X.money('—'), null, 'nezmysel nie je nula');
  eq(X.date('21.10.2026'), '2026-10-21', 'dátum s bodkami');
  eq(X.date('1. 2. 2026'), '2026-02-01', 'dátum s medzerami');
  eq(X.date('2026-02-30'), null, 'neexistujúci deň neprejde');
  ok(X.ibanValid('SK31 1200 0000 1987 4263 7541'), 'platný IBAN aj s medzerami');
  ok(!X.ibanValid('SK31 1200 0000 1987 4263 7542'), 'preklep v jednej číslici neprejde');
  eq(X.ibanClean('IBAN: sk31 1200 0000 1987 4263 7541'), 'SK3112000000198742637541', 'IBAN bez medzier a predpony');
}

// ── Jednotný tvar ───────────────────────────────────────────────────────────
{
  const f = X.normalize({
    number: ' 2026/0042 ', variable_symbol: 'VS 20260042', issue_date: '01.10.2026',
    due_date: '15.10.2026', total: '1 210,00', vat: '210,00', currency: 'eur',
    supplier: { name: 'Ján Novák', ico: '12 345 678', iban: 'sk31 1200 0000 1987 4263 7541' },
    customer: { name: 'Partner und Service s. r. o.', ico: '55 555 555' },
  });
  eq([f.number, f.variable_symbol, f.issue_date, f.due_date], ['2026/0042', '20260042', '2026-10-01', '2026-10-15'],
    'číslo, VS a dátumy vyčistené');
  eq([f.total, f.vat, f.base], [1210, 210, 1000], 'základ sa dopočíta zo sumy a DPH');
  eq(f.currency, 'EUR', 'mena veľkými písmenami');
  eq([f.supplier.ico, f.supplier.iban], ['12345678', 'SK3112000000198742637541'], 'IČO a IBAN bez medzier');
  eq(X.normalize({ base: 100, vat: 0 }).total, 100, 'neplatiteľ: spolu = základ');
  eq(X.normalize({ doc_type: 'nieco' }).doc_type, 'invoice', 'neznámy druh dokladu = faktúra');
}

// ── Komu patrí ──────────────────────────────────────────────────────────────
const WORKERS = [
  { id: 'w1', full_name: 'Ján Novák', company_id: '12345678', bank_iban: 'SK31 1200 0000 1987 4263 7541' },
  { id: 'w2', full_name: 'Peter Malý', company_id: '87654321', bank_iban: '' },
  { id: 'w3', full_name: 'Ján Nováková', company_id: '', bank_iban: '' },
];
{
  eq(X.matchWorker(X.normalize({ supplier: { ico: '12345678' } }), WORKERS).by, 'ico', 'podľa IČO');
  eq(X.matchWorker(X.normalize({ supplier: { iban: 'SK3112000000198742637541' } }), WORKERS).worker.id, 'w1',
    'podľa IBAN-u');
  eq(X.matchWorker(X.normalize({ supplier: { name: 'Peter Malý - stavebné práce' } }), WORKERS).worker.id, 'w2',
    'podľa celého mena v názve firmy');
  eq(X.matchWorker(X.normalize({ supplier: { name: 'Novák' } }), WORKERS).worker, null,
    'kúsok mena nestačí');
  eq(X.matchWorker(X.normalize({ supplier: { name: 'Hotel Krone GmbH', ico: '99999999' } }), WORKERS).worker, null,
    'dodávateľ, ktorý nie je živnostník');
}

// ── Čo si overiť ────────────────────────────────────────────────────────────
{
  const f = X.normalize({ number: '42', total: 1000, due_date: '2026-11-01',
    supplier: { ico: '12345678', iban: 'DE89 3704 0044 0532 0130 00' }, customer: { ico: '11111111' } });
  const w = X.warnings(f, { worker: WORKERS[0], company: { ico: '55555555' },
    bills: [{ id: 'b1', bill_number: '42', worker_id: 'w1', status: 'paid' }] });
  ok(w.some(x => /IBAN na faktúre je iný/.test(x)), 'iný IBAN než má živnostník — overiť telefonicky', w.join(' | '));
  ok(w.some(x => /nie je vystavená na našu firmu/.test(x)), 'faktúra nie na nás');
  ok(w.some(x => /už máme/.test(x)), 'dvakrát nahratá faktúra');
  eq(X.warnings(f, { worker: WORKERS[0], company: { ico: '11111111' }, selfId: 'b1',
    bills: [{ id: 'b1', bill_number: '42', worker_id: 'w1' }] }).filter(x => /už máme/.test(x)).length, 0,
    'sama so sebou sa neporovnáva');
  eq(X.warnings(f, { bills: [{ id: 'b2', bill_number: '42', worker_id: 'w1', status: 'discarded' }],
    worker: WORKERS[0] }).filter(x => /už máme/.test(x)).length, 0, 'zahodená sa nepočíta');

  const zle = X.warnings(X.normalize({ number: '1', total: 130, base: 100, vat: 20,
    supplier: { iban: 'SK3112000000198742637542' } }));
  ok(zle.some(x => /kontrolný súčet/.test(x)), 'preklep v IBAN-e');
  ok(zle.some(x => /nedávajú dokopy/.test(x)), 'sumy nesedia');
  ok(zle.some(x => /Chýba splatnosť/.test(x)), 'chýba splatnosť');
  ok(X.warnings(X.normalize({ doc_type: 'proforma', total: 1 })).some(x => /zálohová/.test(x)), 'zálohová faktúra');
  ok(X.warnings(X.normalize({ total: 1, uncertain: ['supplier.iban', 'variable_symbol'] }))
    .some(x => /čitateľné: IBAN, variabilný symbol/.test(x)), 'nečitateľné polia po slovensky');
}

// ── Stĺpce faktúry ──────────────────────────────────────────────────────────
{
  const f = X.normalize({ number: '7', total: 500, supplier: { name: 'Hotel Krone', ico: '99' }, category: 'accommodation' });
  const p = X.billPatch(f);
  eq([p.amount, p.worker_id, p.supplier_name, p.category], [500, null, 'Hotel Krone', 'accommodation'],
    'od dodávateľa: meno a kategória');
  eq(X.billPatch(f, { worker: WORKERS[0] }).category, 'work', 'od živnostníka: práca');
  eq(X.billPatch(X.normalize({})).amount, 0, 'bez sumy nula (dá sa doplniť)');
}

// ── E-faktúra (UBL) ─────────────────────────────────────────────────────────
const UBL = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ID>FA-2026-0815</cbc:ID>
  <cbc:IssueDate>2026-10-01</cbc:IssueDate>
  <cbc:DueDate>2026-10-15</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:InvoicePeriod><cbc:StartDate>2026-09-01</cbc:StartDate><cbc:EndDate>2026-09-30</cbc:EndDate></cac:InvoicePeriod>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyName><cbc:Name>Stavby &amp; Omietky s.r.o.</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:CityName>Nitra</cbc:CityName><cac:Country><cbc:IdentificationCode>SK</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>SK2020123456</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>Stavby &amp; Omietky s.r.o.</cbc:RegistrationName><cbc:CompanyID>12345678</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyName><cbc:Name>Partner und Service s. r. o.</cbc:Name></cac:PartyName>
    <cac:PartyLegalEntity><cbc:RegistrationName>Partner und Service s. r. o.</cbc:RegistrationName><cbc:CompanyID>55555555</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans><cbc:PaymentMeansCode>58</cbc:PaymentMeansCode><cbc:PaymentID>20260815</cbc:PaymentID>
    <cac:PayeeFinancialAccount><cbc:ID>SK3112000000198742637541</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">230.00</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">1000.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">230.00</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>23</cbc:Percent></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="EUR">1000.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">1000.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">1230.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">1230.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="HUR">40</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">1000.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Omietanie — Lixenried</cbc:Name></cac:Item><cac:Price><cbc:PriceAmount currencyID="EUR">25.00</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`;
{
  ok(X.isUbl(UBL), 'spozná e-faktúru');
  ok(!X.isUbl('<html><body>nie</body></html>'), 'iné XML nie je faktúra');
  const f = X.normalize(X.parseUbl(UBL));
  eq([f.number, f.issue_date, f.due_date, f.variable_symbol], ['FA-2026-0815', '2026-10-01', '2026-10-15', '20260815'],
    'číslo, dátumy, VS');
  eq([f.total, f.vat, f.base], [1230, 230, 1000], 'sumy');
  eq([f.supplier.name, f.supplier.ico, f.supplier.ic_dph, f.supplier.iban],
    ['Stavby & Omietky s.r.o.', '12345678', 'SK2020123456', 'SK3112000000198742637541'], 'dodávateľ aj s IBAN-om');
  eq(f.customer.ico, '55555555', 'odberateľ');
  eq([f.period_from, f.period_to], ['2026-09-01', '2026-09-30'], 'obdobie');
  eq(f.items[0], { description: 'Omietanie — Lixenried', quantity: 40, unit: 'HUR', unit_price: 25, total: 1000 },
    'položka');
  ok(!f.reverse_charge, 'bežná DPH, nie prenesenie');
  eq(X.parseUbl('<CreditNote xmlns="x"><ID>D1</ID></CreditNote>').doc_type, 'credit_note', 'dobropis');
}

// ── Druh súboru ─────────────────────────────────────────────────────────────
{
  eq(['a.pdf', 'b.XML', 'c.jpg', 'd.docx'].map(n => X.fileKind({ name: n })), ['pdf', 'xml', 'image', null],
    'PDF, XML, fotka; iné nie');
  eq(X.fileKind({ name: 'scan', type: 'image/heic' }), 'image', 'podľa typu aj bez prípony');
}

// ── Zadanie pre model ───────────────────────────────────────────────────────
{
  const p = X.instructions({ company: { name: 'Partner und Service s. r. o.', ico: '55555555' },
    categories: [['work', 'Práca'], ['fuel', 'Palivo']] });
  ok(p.includes('55555555') && p.includes('work (Práca)'), 'model vie, kto sme a aké sú kategórie');
  ok(X.TOOL.input_schema.required.includes('total'), 'suma je povinná');
}

// ── Bloček ─────────────────────────────────────────────────────────────────
{
  const w = X.warnings(X.normalize({ doc_type: 'receipt', total: 54.3, issue_date: '2026-10-22',
    supplier: { name: 'Shell' } }));
  eq(w, [], 'bloček bez splatnosti nie je chyba ani „nevyzerá ako faktúra"');
  ok(X.warnings(X.normalize({ doc_type: 'other', total: 1, due_date: '2026-11-01' })).some(x => /ani bloček/.test(x)),
    'iný papier sa ohlási');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
