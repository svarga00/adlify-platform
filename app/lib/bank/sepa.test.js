// ============================================================================
// Testy: výpis camt.053 a príkazy pain.001
// Spustenie:  node app/lib/bank/sepa.test.js
// ============================================================================
global.window = global;
require('../money.js');
const S = require('./sepa.js');

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

console.log('Banka: výpis a príkazy');

const CAMT = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
 <BkToCstmrStmt>
  <GrpHdr><MsgId>TB-1</MsgId><CreDtTm>2026-10-21T06:00:00</CreDtTm></GrpHdr>
  <Stmt>
   <Id>1</Id>
   <Acct><Id><IBAN>SK2411000000002612345678</IBAN></Id></Acct>
   <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">10000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-10-20</Dt></Dt></Bal>
   <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">15640.50</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-10-20</Dt></Dt></Bal>
   <Ntry>
    <Amt Ccy="EUR">8360.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts>
    <BookgDt><Dt>2026-10-20</Dt></BookgDt>
    <NtryDtls><TxDtls>
     <Refs><EndToEndId>/VS20260012/SS/KS0308</EndToEndId></Refs>
     <RltdPties><Dbtr><Nm>GU Ulm GmbH</Nm></Dbtr><DbtrAcct><Id><IBAN>DE89370400440532013000</IBAN></Id></DbtrAcct></RltdPties>
     <RmtInf><Ustrd>Rechnung 2026-0012</Ustrd></RmtInf>
    </TxDtls></NtryDtls>
   </Ntry>
   <Ntry>
    <Amt Ccy="EUR">3200.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
    <BookgDt><Dt>2026-10-20</Dt></BookgDt>
    <NtryDtls><TxDtls>
     <Refs><EndToEndId>202614</EndToEndId></Refs>
     <RltdPties><Cdtr><Nm>Ján Novák</Nm></Cdtr><CdtrAcct><Id><IBAN>SK3112000000198742637541</IBAN></Id></CdtrAcct></RltdPties>
     <RmtInf><Ustrd>Faktura 2026/14</Ustrd></RmtInf>
    </TxDtls></NtryDtls>
   </Ntry>
   <Ntry>
    <Amt Ccy="EUR">1280.50</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
    <BookgDt><Dt>2026-10-20</Dt></BookgDt>
    <NtryDtls>
     <TxDtls><AmtDtls><TxAmt><Amt Ccy="EUR">1000.00</Amt></TxAmt></AmtDtls>
      <RltdPties><Cdtr><Nm>Hotel Krone</Nm></Cdtr><CdtrAcct><Id><IBAN>DE89370400440532013000</IBAN></Id></CdtrAcct></RltdPties></TxDtls>
     <TxDtls><AmtDtls><TxAmt><Amt Ccy="EUR">280.50</Amt></TxAmt></AmtDtls>
      <RltdPties><Cdtr><Nm>Shell</Nm></Cdtr></RltdPties><RmtInf><Ustrd>VS 4411 nafta</Ustrd></RmtInf></TxDtls>
    </NtryDtls>
   </Ntry>
   <Ntry><Amt Ccy="EUR">50.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>PDNG</Sts><BookgDt><Dt>2026-10-21</Dt></BookgDt></Ntry>
  </Stmt>
 </BkToCstmrStmt>
</Document>`;

// ── Výpis ───────────────────────────────────────────────────────────────────
{
  ok(S.isCamt(CAMT), 'spozná výpis camt.053');
  ok(!S.isCamt('Dátum;Suma\n1.1.2026;10'), 'CSV nie je camt');
  const r = S.parseCamt(CAMT);
  eq(r.rows.length, 4, 'tri zaúčtované pohyby, z toho jeden hromadný na dva riadky');
  eq(r.skipped.map(x => x.why), ['pohyb ešte nie je zaúčtovaný'], 'nezaúčtovaný sa preskočí a povie sa to');
  const [prijem, vydaj, hotel, shell] = r.rows;
  eq([prijem.amount, prijem.variable_symbol, prijem.constant_symbol, prijem.counterparty_name, prijem.counterparty_iban],
    [836000, '20260012', '308', 'GU Ulm GmbH', 'DE89370400440532013000'], 'príjem: suma v centoch, VS, KS, platiteľ');
  eq([vydaj.amount, vydaj.variable_symbol, vydaj.counterparty_name], [-320000, '202614', 'Ján Novák'],
    'výdaj: záporná suma; číselné EndToEndId je VS');
  eq([hotel.amount, shell.amount], [-100000, -28050], 'hromadný pohyb sa rozdelí na platby');
  eq(shell.variable_symbol, '4411', 'VS aj zo správy');
  eq(r.closing, { cents: 1564050, date: '2026-10-20' }, 'konečný zostatok');
  eq(r.account, 'SK2411000000002612345678', 'náš účet');
  ok(r.rows.every(x => x.import_hash), 'každý pohyb má odtlačok — dvakrát sa nenaimportuje');
  ok(S.parseCamt('<Document/>').error, 'iné XML povie, čo je zle');
}

// ── Symboly ─────────────────────────────────────────────────────────────────
{
  eq(S.symbols('/VS0001234/SS99/KS0308'), { vs: '1234', ss: '99', ks: '308' }, 'slovenský zápis, bez úvodných núl');
  eq(S.symbols('', 'platba VS: 556677'), { vs: '556677', ss: null, ks: null }, 'VS v texte správy');
  eq(S.symbols('VSE OK'), { vs: null, ss: null, ks: null }, 'slovo nie je symbol');
}

// ── Kódovanie ───────────────────────────────────────────────────────────────
{
  const utf = S.decode(new TextEncoder().encode('Ján Novák'));
  eq([utf.text, utf.encoding], ['Ján Novák', 'utf-8'], 'UTF-8');
  // „Ján Novák" vo Windows-1250: á = 0xE1
  const cp = S.decode(new Uint8Array([0x4A, 0xE1, 0x6E, 0x20, 0x4E, 0x6F, 0x76, 0xE1, 0x6B]));
  eq([cp.text, cp.encoding], ['Ján Novák', 'windows-1250'], 'Windows-1250 sa rozpozná samo');
}

// ── Príkazy na úhradu ───────────────────────────────────────────────────────
{
  eq(S.bicOf('SK24 1100 0000 0026 1234 5678'), 'TATRSKBX', 'BIC Tatra banky z IBAN-u');
  eq(S.bicOf('DE89370400440532013000'), null, 'cudzí IBAN bez BIC');
  eq(S.endToEnd({ vs: '2026/14' }), '/VS202614/SS/KS', 'EndToEndId po slovensky');
  eq(S.endToEnd({}), 'NOTPROVIDED', 'bez symbolov');

  const r = S.pain001({
    debtor: { name: 'Partner und Service s. r. o.', iban: 'SK24 1100 0000 0026 1234 5678' },
    date: '2026-10-22', now: '2026-10-21T10:00:00.000Z',
    payments: [
      { id: 'b1', name: 'Ján Novák — Omietky', iban: 'SK31 1200 0000 1987 4263 7541', cents: 320000, vs: '202614', message: 'Faktúra 2026/14' },
      { id: 'b2', name: 'Hotel Krone', iban: 'DE89370400440532013000', cents: 54000, message: 'R-77 & ubytovanie' },
      { id: 'b3', name: 'Bez účtu', iban: '', cents: 100 },
      { id: 'b4', name: 'Preklep', iban: 'SK3112000000198742637542', cents: 100 },
    ],
  });
  eq(r.errors, [], 'bez chýb');
  eq([r.count, r.cents], [2, 374000], 'dve platby, súčet');
  eq(r.skipped.map(x => [x.id, x.why.join()]), [['b3', 'nemá IBAN'], ['b4', 'IBAN má zlý kontrolný súčet']],
    'platby bez IBAN-u a s preklepom sa vynechajú a povie sa prečo');
  ok(r.xml.includes('urn:iso:std:iso:20022:tech:xsd:pain.001.001.03'), 'formát pain.001.001.03');
  ok(r.xml.includes('<NbOfTxs>2</NbOfTxs>') && r.xml.includes('<CtrlSum>3740.00</CtrlSum>'), 'kontrolný súčet');
  ok(r.xml.includes('<ReqdExctnDt>2026-10-22</ReqdExctnDt>'), 'dátum splatnosti príkazu');
  ok(r.xml.includes('<BIC>TATRSKBX</BIC>'), 'náš BIC z IBAN-u');
  ok(r.xml.includes('<EndToEndId>/VS202614/SS/KS</EndToEndId>'), 'VS v EndToEndId');
  ok(r.xml.includes('<Nm>Jan Novak - Omietky</Nm>'), 'meno bez diakritiky a bez dlhej pomlčky', r.xml.match(/<Cdtr><Nm>[^<]*/)[0]);
  ok(r.xml.includes('<Ustrd>R-77 ubytovanie</Ustrd>'), 'nepovolené znaky preč');
  ok(!/[<>&](?![a-zA-Z/#!?])/.test(r.xml.replace(/<[^>]+>/g, '')), 'XML je čisté');

  const bez = S.pain001({ debtor: { name: '', iban: '' }, payments: [] });
  ok(bez.xml === null && bez.errors.length === 3, 'bez našej firmy a bez platieb sa súbor nespraví', bez.errors.join(' | '));
}

// ── Schválené faktúry → platby ──────────────────────────────────────────────
{
  const p = S.billPayments([
    { id: 'b1', status: 'approved', amount: 3200, worker_id: 'w1', bill_number: '2026/14' },
    { id: 'b2', status: 'approved', amount: 540, supplier_name: 'Hotel Krone', supplier_iban: 'DE89 3704 0044 0532 0130 00', variable_symbol: '77' },
    { id: 'b3', status: 'approved', amount: 10, worker_id: 'w1', supplier_iban: 'DE89370400440532013000' },
    { id: 'b4', status: 'received', amount: 99 },
  ], [{ id: 'w1', full_name: 'Ján Novák', bank_iban: 'SK31 1200 0000 1987 4263 7541' }]);
  eq(p.map(x => x.id), ['b1', 'b2', 'b3'], 'len schválené');
  eq([p[0].name, p[0].iban, p[0].vs, p[0].cents], ['Ján Novák', 'SK3112000000198742637541', '202614', 320000],
    'živnostník: IBAN z appky, VS z čísla faktúry');
  eq([p[1].iban, p[1].vs], ['DE89370400440532013000', '77'], 'dodávateľ: IBAN a VS z faktúry');
  ok(p[2].ibanDiffers, 'iný IBAN na faktúre než v appke sa označí');
  eq(p[0].problems, [], 'platba bez problémov');
}

console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
process.exit(failed ? 1 : 0);
