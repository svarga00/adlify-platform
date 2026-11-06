// ============================================================================
// Testy knižnice SuperFaktúry (payload, odpovede, chyby, stav)
// Spustenie:  node app/lib/billing/superfaktura.test.js
// ============================================================================
const SF = require('./superfaktura.js');
// Hlavička, chyby a história sú len na serveri (sf-service.js).
const SV = require('./sf-service.js');

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

console.log('SuperFaktúra — knižnica');

// ── Prostredie ──────────────────────────────────────────────────────────────
eq([SF.envOf(), SF.envOf(''), SF.envOf('prod'), SF.envOf('live'), SF.envOf(' PRODUCTION ')],
  ['sandbox', 'sandbox', 'sandbox', 'sandbox', 'production'], 'ostrý účet len pri presnom „production"');
eq([SF.baseUrl('sandbox'), SF.baseUrl('production')], ['https://sandbox.superfaktura.sk', 'https://moja.superfaktura.sk'], 'adresy');
eq(SV.authHeader({ email: 'a+b@x.sk', apiKey: 'k&1', companyId: 7 }),
  'SFAPI email=a%2Bb%40x.sk&apikey=k%261&module=DANUBRA%20Hub&company_id=7', 'hlavička SFAPI, hodnoty enkódované');
eq(SF.maskEmail('stefan@punds.eu'), 's…@punds.eu', 'e-mail účtu sa ukazuje skrátene');

// ── Jazyk ───────────────────────────────────────────────────────────────────
eq([SF.sfLang('de'), SF.sfLang('DE'), SF.sfLang('sk'), SF.sfLang('en'), SF.sfLang(''), SF.sfLang('xx', 'slo'), SF.sfLang('deu')],
  ['deu', 'deu', 'slo', 'eng', 'deu', 'slo', 'deu'], 'dvojpísmenový kód → kód SuperFaktúry, predvolene deu');

// ── Položky ─────────────────────────────────────────────────────────────────
{
  const inv = { total: 8736 };
  const per = { hours_construction: 300, hours_travel: 12 };
  eq(SF.buildItems({ invoice: inv, subcontract: { title: 'Hala', charge_rate: 28 }, period: { ...per, period_from: '2026-10-01' } })
    .map(i => [i.name, i.quantity, i.unit, i.unit_price, i.tax]),
    [['Hala — 10/2026', 312, 'Std.', 28, 0]], 'hodiny × sadzba zo zákazky');
  eq(SF.buildItems({ invoice: { total: 279.13 }, period: { hours_workshop: 7.25 } }).map(i => [i.quantity, i.unit, i.unit_price]),
    [[1, 'Pauschale', 279.13]], '7,25 h × 38,50 € = 279,125 → paušál s presnou sumou (nie iný cent)');
  eq(SF.buildItems({ invoice: { total: 100 } }).map(i => [i.quantity, i.unit_price]), [[1, 100]], 'bez hodín jedna položka');
  eq(SF.buildItems({ items: [{ description: 'A', quantity: 1.5, unit_price: '10.01' }, { description: 'B', quantity: 1, unit_price: 5, removed_at: 'x' }] })
    .map(i => [i.name, i.quantity, i.unit_price]), [['A', 1.5, 10.01]], 'vlastné položky, vyhodená nie');
  eq(SF.itemsCents([{ quantity: 1.5, unit_price: 10.01 }, { quantity: -312, unit_price: 28 }]), 1502 - 873600, 'súčet v centoch (aj záporný)');
  eq(SF.buildItems({ invoice: { total: 50 }, lang: 'slo', period: { hours_workshop: 2 } })[0].unit, 'h', 'po slovensky „h"');
}

// ── Payload ─────────────────────────────────────────────────────────────────
{
  const p = SF.buildInvoice({
    invoice: { id: 'i1', invoice_number: 'FA-2026/042', total: 1000, withholding_amount: 150, withholding_pct: 15,
      vat_regime: 'reverse_charge', issue_date: '2026-11-02', currency: 'EUR' },
    partner: { name: 'X GmbH', country: 'at', ust_idnr: 'ATU1', payment_terms_days: 14 },
    subcontract: { work_type: 'construction' },
    settings: { use_own_number: true, sequence_id: '12', bank_account_id: 3 }, key: 'i1:sandbox',
  });
  eq([p.Invoice.invoice_no_formatted, p.Invoice.variable, p.Invoice.due, p.Invoice.sequence_id, p.Invoice.bank_accounts],
    ['FA-2026/042', '2026042', '2026-11-16', 12, [{ id: 3 }]], 'číslo, VS, splatnosť z karty, rad a účet v SuperFaktúre');
  ok(p.Invoice.comment.includes('Art. 196') && p.Invoice.comment.includes('Bauabzugsteuer gemäß §48b EStG: 150,00 EUR (15 %). Auszahlungsbetrag: 850,00 EUR.'),
    'rakúsky odberateľ: veta podľa smernice; §48b zrážka v poznámke');
  eq([p.Client.country_iso_id, p.Client.ic_dph, p.Client.update_addressbook], ['AT', 'ATU1', 1], 'klient: krajina ISO, IČ DPH');
  eq(p.Invoice.type, 'regular', 'bežná faktúra');
  const own = SF.buildInvoice({ invoice: { invoice_number: '1', total: 1 }, settings: { use_own_number: false, reverse_charge_note: 'Vlastná veta.' },
    partner: {} });
  ok(!('invoice_no_formatted' in own.Invoice), 'bez vlastného čísla — pridelí SuperFaktúra');
  const rc = SF.buildInvoice({ invoice: { total: 1, vat_regime: 'reverse_charge' }, settings: { reverse_charge_note: 'Vlastná veta.' }, partner: {} });
  eq([rc.Invoice.comment, rc.Invoice.vat_transfer], ['Vlastná veta.', 1], 'veta k reverse charge z nastavení');
  const fs = SF.buildInvoice({ invoice: { total: 1 }, subcontract: { work_type: 'construction' }, partner: {},
    freistellung: { reference: 'FS-1', valid_to: '2027-03-31' } });
  ok(/Freistellungsbescheinigung gemäß §48b EStG liegt vor \(Nr\. FS-1, gültig bis 31\.03\.2027\)/.test(fs.Invoice.comment), 'platná Freistellung na doklade');
  const cn = SF.buildInvoice({ invoice: { kind: 'credit_note', invoice_number: '2026099', total: -100, issue_date: '2026-11-06', cancel_reason: 'Zlá zákazka' },
    parent: { invoice_number: '2026042', sf_invoice_id: '777' }, partner: { invoice_language: 'sk' } });
  eq([cn.Invoice.type, cn.Invoice.parent_id, cn.Invoice.due, cn.Invoice.name], ['cancel', 777, '2026-11-06', 'Dobropis k faktúre č. 2026042'], 'dobropis: typ cancel s rodičom');
  ok(/Dôvod: Zlá zákazka/.test(cn.Invoice.comment), 'dôvod na doklade');
  eq(SF.buildClient({ name: 'Y', ust_idnr: 'DE1' }), { Client: { name: 'Y', ic_dph: 'DE1', country_iso_id: 'DE' } }, 'klient pre /clients/create');
}

// ── Odpovede ────────────────────────────────────────────────────────────────
{
  const created = SF.readInvoice({ error: 0, data: { Invoice: { id: '777', token: 't', invoice_no_formatted: '2026042', total: '8736.00' }, Client: { id: '55' } } });
  eq([created.id, created.token, created.number, created.totalCents, created.clientId], [777, 't', '2026042', 873600, 55], 'create: id, token, číslo, suma, klient');
  const view = SF.readInvoice({ Invoice: { id: 1, total: '100.00', due: '2026-10-01', status: '1' },
    InvoicePayment: [{ amount: '30.00', created: '2026-10-05' }, { InvoicePayment: { amount: '20.50', created: '2026-10-09' } }], InvoiceEmail: [{}] });
  eq([view.paidCents, view.paidOn, view.sent], [5050, '2026-10-09', true], 'view: úhrady sa sčítajú v centoch, posledný dátum, odoslaná');
  eq(SF.readInvoice({}).totalCents, null, 'chýbajúca suma je null, nie nula');
  eq(SF.paymentState({ totalCents: 100, paidCents: 100 }), 'paid', 'plne uhradená');
  eq(SF.paymentState({ totalCents: 100, paidCents: 101 }), 'paid', 'preplatená = uhradená');
  eq(SF.paymentState({ totalCents: 100, paidCents: 50 }), 'partial', 'čiastočne');
  eq(SF.paymentState({ totalCents: 100, paidCents: 0, due: '2026-10-01' }, '2026-11-06'), 'overdue', 'po splatnosti');
  eq(SF.paymentState({ status: '3' }), 'paid', 'bez súm podľa kódu stavu');
  eq(SF.reconcile({ invoice: { total: 100, invoice_number: 'A' }, doc: { totalCents: 10000, number: 'A' } }).ok, true, 'zhoda');
  eq(SF.reconcile({ invoice: { total: 100, invoice_number: 'A' }, doc: { totalCents: 12000, number: 'B' } }).problems.map(p => p.key), ['total', 'number'], 'nezhoda sumy aj čísla');
  eq(SF.reconcile({ invoice: { total: 100, invoice_number: 'A' }, doc: { totalCents: 10000, number: 'B' }, settings: { use_own_number: false } }).ok, true,
    'číslo sa nekontroluje, keď ho prideľuje SuperFaktúra');
  eq(SF.reconcile({ invoice: { total: 100 }, doc: {} }).problems.map(p => p.key), ['no_total'], 'bez sumy nie je zhoda');
  eq(SF.findInList({ items: [{ Invoice: { id: 2, invoice_no_formatted: 'X' } }, { Invoice: { id: 3, internal_comment: 'HUB-KEY i1:sandbox' } }] }, { number: 'Y', key: 'i1:sandbox' }).id,
    3, 'doklad sa nájde aj podľa kľúča v internej poznámke');
  eq(SF.findInList([{ Invoice: { id: 2, invoice_no_formatted: 'X' } }], { number: 'Z' }), null, 'iné číslo sa neprevezme');
  eq(SF.findClient({ items: [{ Client: { id: '9', ic_dph: 'de 123' } }] }, { ust_idnr: 'DE123' }), 9, 'klient podľa USt-IdNr (medzery, veľkosť písmen)');
}

// ── Chyby ───────────────────────────────────────────────────────────────────
{
  const c = (status, json, text) => SV.classifyError({ status, json, text });
  eq(c(401, { error: 1, error_message: 'Unauthorized' }).code, 'auth', '401 → prihlásenie');
  eq(c(200, { error: 1, error_message: 'Neplatný API kľúč' }).code, 'auth', 'chyba prihlásenia v tele');
  eq(c(429, null, '').code, 'rate_limit', '429 → limit');
  eq(c(200, { error: 1, error_message: 'Too many requests per minute' }).code, 'rate_limit', 'limit podľa textu');
  eq(c(502, null, '<html>').code, 'server', '5xx → porucha');
  const v = c(200, { error: 1, error_message: { 'Client.name': ['povinné'], items: 'chýbajú' } });
  eq([v.code, v.message], ['validation', 'SuperFaktúra doklad odmietla. Client.name: povinné; items: chýbajú'], 'chyby polí sa zložia do jednej vety');
  ok(/Opravte/.test(v.hint), 's radou');
  eq(c(500, null, '<html><body>chyba</body></html>').message, 'SuperFaktúra má poruchu.', 'HTML sa do hlášky nepíše');
}

// ── Tajomstvá ───────────────────────────────────────────────────────────────
{
  const r = SV.redact({ Authorization: 'SFAPI email=a&apikey=b', apikey: 'x', sf_token: 'y', token: 'z', nested: { api_key: 'q', note: 'apikey=abc&x' }, ok: 1 });
  eq(r, { Authorization: '***', apikey: '***', sf_token: '***', token: '***', nested: { api_key: '***', note: 'apikey=***&x' }, ok: 1 }, 'kľúče, hlavička a token sa nezapíšu');
  const s = SV.summarize({ Invoice: { type: 'regular', invoice_no_formatted: 'A', variable: '1' }, InvoiceItem: [{ quantity: 2, unit_price: 1.5 }], Client: { id: 5, name: 'X' } });
  eq([s.number, s.items, s.items_total, s.client.id], ['A', 1, '3.00', 5], 'krátky prehľad požiadavky do histórie');
}

// ── Čipy ────────────────────────────────────────────────────────────────────
{
  eq(SF.chips({ status: 'approved' }), [], 'bez dokladu žiadne čipy');
  eq(SF.chips({ sf_invoice_id: 1, status: 'sent', sf_environment: 'sandbox' }).map(c => c.label), ['vystavená', 'odoslaná', 'SANDBOX'], 'vystavená, odoslaná, sandbox');
  eq(SF.chips({ sf_invoice_id: 1, status: 'paid', sf_status: 'paid', sf_environment: 'production' }).map(c => c.key), ['issued', 'paid'], 'ostrý účet bez odznaku SANDBOX');
  eq(SF.chips({ sf_invoice_id: 1, status: 'paid', sf_environment: 'production' }).map(c => c.key), ['issued', 'unpaid_sf'], 'zaplatená len v appke');
  eq(SF.chips({ sf_invoice_id: 1, status: 'issued', sf_status: 'partial', sf_paid_amount: 40, sf_check: 'mismatch', sf_environment: 'production' }).map(c => c.key),
    ['issued', 'partial', 'mismatch'], 'čiastočne a nesúhlasí');
}

console.log('\nBase64 pre vyhľadávanie (bezpečné v adrese)');
{
  eq(SF.b64('2026042'), 'MjAyNjA0Mg,,', '„=" → „," (číslo faktúry)');
  eq(SF.b64('ä?>'), 'w6Q_Pg,,', '„/" → „_"');
  eq(SF.b64('>>>'), 'Pj4-', '„+" → „-"');
}

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
