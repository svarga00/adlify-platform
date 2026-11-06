// ============================================================================
// Testy serverovej funkcie pre SuperFaktúru
// Spustenie:  node app/tests/sf-invoice.test.js
// ============================================================================
// Bez siete a bez kľúča: SuperFaktúra je falošný `fetch`, databáza je
// falošná Supabase v pamäti (fake-supabase.js). Testuje sa to, na čom
// funkcia stojí: že sa schvaľovanie nedá obísť requestom, že doklad
// nevznikne dvakrát (ani po neistom pokuse), že sa id zapíšu hneď, že sa
// suma po vystavení porovná, a že kľúč neodíde v odpovedi ani do histórie.
//
// Test zámerne NEleží v `netlify/functions/`. Netlify z každého súboru v tom
// priečinku robí funkciu a názov „danubra-sf-invoice.test" obsahuje bodku,
// ktorú nepovoľuje — celý deploy potom spadne. Stálo to jeden červený build.
// ============================================================================
const Module = require('module');
const path = require('path');
const F = require('./fake-supabase.js');

const KEY = 'testovaci-kluc-123';
const MAIL = 'fakturacia@danubra.eu';
process.env.SF_RETRY_DELAY_MS = '0';

// ── Falošná Supabase ────────────────────────────────────────────────────────
const db = {};
const sb = F.create(db, {
  users: { ok: { id: 'u1' }, rec: { id: 'u2' }, acc: { id: 'u3' } },
  rpc: { danubra_next_number: async () => ({ data: '2026099', error: null }) },
});
const uploads = [];
sb.storage = {
  from: (bucket) => ({
    upload: async (p, buf, o) => { uploads.push({ bucket, path: p, size: buf.length, o }); return { data: { path: p }, error: null }; },
    createSignedUrl: async (p, s, o) => ({ data: { signedUrl: `https://signed.example/${p}?d=${o && o.download}` }, error: null }),
  }),
};
// Súbeh: iná požiadavka zmení riadok tesne pred zámkom.
const race = { on: false };
const origFrom = sb.from;
sb.from = (t) => {
  const q = origFrom(t);
  if (t === 'danubra_invoices' && race.on) {
    const u = q.update;
    q.update = (p) => {
      if (String(p.sf_error || '').startsWith('VYSTAVUJE SA')) { race.on = false; db.danubra_invoices[0].sf_error = 'iná požiadavka'; }
      return u(p);
    };
  }
  return q;
};

const origLoad = Module._load;
Module._load = function (request) {
  if (request === '@supabase/supabase-js') return { createClient: () => sb };
  return origLoad.apply(this, arguments);
};

// ── Falošná SuperFaktúra ────────────────────────────────────────────────────
let calls = [];
let routes = [];
const respond = (status, body) => ({
  ok: status >= 200 && status < 300, status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  arrayBuffer: async () => { const b = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); },
});
global.fetch = async (url, opt = {}) => {
  const call = { url, method: opt.method, auth: opt.headers && opt.headers.Authorization, body: opt.body ? JSON.parse(opt.body) : null };
  calls.push(call);
  for (const [match, fn] of routes) {
    if (typeof match === 'string' ? url.includes(match) : match.test(url)) return fn(call);
  }
  return respond(404, { error: 1, error_message: 'nenájdené' });
};
const sfCalls = (part) => calls.filter(c => c.url.includes(part));

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg, extra) { if (c) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.log(`  ✗ ${msg}${extra ? '\n    ' + extra : ''}`); } }

const responses = [];
const call = async (fn, body, method = 'POST', jwt = 'ok') => {
  const res = await fn({ httpMethod: method, body: JSON.stringify(body), headers: jwt ? { authorization: `Bearer ${jwt}` } : {} });
  responses.push(res.body);
  return res;
};
// `code` = HTTP stav; kód chyby SuperFaktúry (auth, rate_limit…) je `sfCode`.
const parse = (res) => { const b = JSON.parse(res.body); return { ...b, code: res.statusCode, sfCode: b.code }; };

// ── Vzorové dáta ────────────────────────────────────────────────────────────
const PARTNER = { id: 'p1', name: 'GU Ulm GmbH', ust_idnr: 'DE287451936', country: 'DE', city: 'Ulm',
  postal_code: '89073', address: 'Hauptstr. 1', email: 'bau@gu-ulm.de', invoice_language: 'de', sf_client_id: null, sf_client_env: null };
const SUB = { id: 's1', title: 'Wohnpark Feuerbach', work_type: 'workshop', charge_rate: 28 };
const PERIOD = { id: 'per1', status: 'invoiced', period_from: '2026-10-01', period_to: '2026-10-31', hours_construction: 312, amount_charged: 8736 };
const APPROVED = { id: 'i1', kind: 'invoice', status: 'approved', total: 8736, amount_net: 8736, vat_regime: 'reverse_charge', currency: 'EUR',
  invoice_number: '2026042', issue_date: '2026-11-02', due_date: '2026-12-02', delivery_date: '2026-10-31',
  approved_by: 'u1', approved_at: '2026-11-02T08:00:00Z', partner_id: 'p1', subcontract_id: 's1', period_id: 'per1',
  sf_invoice_id: null, sf_error: null, sf_environment: null };

function reset(inv = {}, partner = {}) {
  db.danubra_members = [{ user_id: 'u1', role: 'admin', active: true }, { user_id: 'u2', role: 'recruiter', active: true },
    { user_id: 'u3', role: 'accountant', active: true }];
  db.danubra_invoices = [{ ...APPROVED, ...inv }];
  db.danubra_partners = [{ ...PARTNER, ...partner }];
  db.danubra_subcontracts = [{ ...SUB }];
  db.danubra_periods = [{ ...PERIOD }];
  db.danubra_invoice_items = [];
  db.danubra_settings = [{ id: 'st1', superfaktura: { cc: 'uctovnictvo@punds.eu' }, supplier: { name: 'Partner und Service s. r. o.', iban: 'SK3112000000198742637541', bic: 'TATRSKBX' } }];
  db.danubra_compliance = [];
  db.danubra_activities = [];
  db.danubra_tasks = [];
  db.danubra_archive = [];
  db.danubra_bank_transactions = [];
  calls = []; routes = []; uploads.length = 0;
}
const inv = (id = 'i1') => db.danubra_invoices.find(x => x.id === id);
const history = (id = 'i1') => db.danubra_activities.filter(a => a.entity_id === id);

/** SuperFaktúra, ktorá doklad založí a vráti ho späť (suma podľa položiek). */
function sfCreates({ id = 777, total = null, number = null, clientId = 55 } = {}) {
  routes.push(['/clients/index.json', () => respond(200, { items: [] })]);
  routes.push(['/clients/create', () => respond(200, { error: 0, data: { Client: { id: clientId } } })]);
  routes.push(['/invoices/create', (c) => {
    const items = c.body.InvoiceItem;
    const sum = items.reduce((s, i) => s + Math.round(i.unit_price * 100 * i.quantity), 0) / 100;
    return respond(200, { error: 0, data: { Invoice: { id, token: 'tok-abc', invoice_no_formatted: number || c.body.Invoice.invoice_no_formatted,
      total: String(total != null ? total : sum.toFixed(2)) }, Client: { id: c.body.Client.id || clientId } } });
  }]);
}

console.log('SuperFaktúra — serverová funkcia');

(async () => {
  const fnPath = path.join(__dirname, '..', '..', 'netlify', 'functions', 'danubra-sf-invoice.js');

  // ── Bez kľúča sa nič nerozbije ────────────────────────────────────────────
  reset();
  delete process.env.SF_API_KEY;
  delete process.env.SF_EMAIL;
  delete process.env.SF_ENV;
  delete require.cache[fnPath];
  const { handler } = require(fnPath);
  {
    const r = parse(await call(handler, { invoice_id: 'x', action: 'issue' }));
    eq(r.code, 200, 'bez kľúča funkcia nespadne');
    eq(r.skipped, true, 'len ticho skončí');
    eq(r.reason, 'no_sf_credentials', 'a povie, čo chýba');
    ok(r.message.includes('SF_EMAIL'), 'menovite');
    ok(r.message.includes('schválená'), 'a čo sa s faktúrou stane');
    eq(calls.length, 0, 'do SuperFaktúry nič neodíde');

    eq(parse(await call(handler, {}, 'GET')).code, 405, 'GET sa odmieta');

    const st = parse(await call(handler, { action: 'status' }));
    eq([st.code, st.configured, st.environment, st.sandbox], [200, false, 'sandbox', true], 'stav bez kľúča: nenastavené, sandbox');
  }

  // ── Kto smie volať ────────────────────────────────────────────────────────
  {
    eq(parse(await call(handler, { invoice_id: 'x', action: 'issue' }, 'POST', '')).code, 401, 'bez prihlásenia nič');
    eq(parse(await call(handler, { invoice_id: 'x', action: 'issue' }, 'POST', 'rec')).code, 403, 'náborár bez práva na faktúry nič');
    eq(parse(await call(handler, { action: 'status' }, 'POST', 'rec')).code, 403, 'ani stav pripojenia');
  }

  // ── S kľúčom ──────────────────────────────────────────────────────────────
  process.env.SF_EMAIL = MAIL;
  process.env.SF_API_KEY = KEY;
  {
    reset();
    eq(parse(await call(handler, { action: 'issue' })).code, 400, 'bez invoice_id nič');
    eq(parse(await call(handler, { invoice_id: 'x', action: 'nieco' })).code, 400, 'neznáma akcia sa odmieta');
    eq(parse(await call(handler, { invoice_id: 'nie-je', action: 'issue' })).code, 404, 'neexistujúca faktúra');
  }

  // ── Produkcia len na výslovné SF_ENV=production ───────────────────────────
  {
    reset();
    for (const [v, base] of [[undefined, 'https://sandbox.superfaktura.sk'], ['prod', 'https://sandbox.superfaktura.sk'],
      ['Production ', 'https://moja.superfaktura.sk'], ['sandbox', 'https://sandbox.superfaktura.sk']]) {
      if (v === undefined) delete process.env.SF_ENV; else process.env.SF_ENV = v;
      const st = parse(await call(handler, { action: 'status' }));
      eq(st.base, base, `SF_ENV=${JSON.stringify(v)} → ${base}`);
    }
    delete process.env.SF_ENV;
    const st = parse(await call(handler, { action: 'status' }));
    eq([st.configured, st.key_set, st.email_set, st.account], [true, true, true, 'f…@danubra.eu'], 'stav: kľúče nastavené, e-mail len skrátene');
  }

  // ── ping ──────────────────────────────────────────────────────────────────
  {
    reset();
    routes.push(['/users/getUserCompaniesData', () => respond(200, [{ Company: { id: 9, name: 'Partner und Service s. r. o.' } }])]);
    const r = parse(await call(handler, { action: 'ping' }));
    eq([r.code, r.ok, r.company, r.environment], [200, true, 'Partner und Service s. r. o.', 'sandbox'], 'ping vráti názov firmy a prostredie');
    ok(calls[0].url.startsWith('https://sandbox.superfaktura.sk/'), 'proti sandboxu');
    ok(calls[0].auth.startsWith('SFAPI ') && calls[0].auth.includes(`apikey=${KEY}`), 's hlavičkou SFAPI (kľúč ide len do SuperFaktúry)');
    eq(parse(await call(handler, { action: 'ping' }, 'POST', 'acc')).code, 403, 'ping smie len admin');

    reset();
    routes.push(['/users/getUserCompaniesData', () => respond(401, { error: 1, error_message: 'Neplatný API kľúč' })]);
    const bad = parse(await call(handler, { action: 'ping' }));
    eq([bad.code, bad.sfCode], [502, 'auth'], 'zlý kľúč → chyba prihlásenia');
    ok(/SF_API_KEY/.test(bad.hint) && /Nástroje → API/.test(bad.hint), 'rada po slovensky: čo skontrolovať a kde', bad.hint);
    eq(sfCalls('getUserCompaniesData').length, 1, 'chyba prihlásenia sa neopakuje');
  }

  // ── Schvaľovanie sa nedá obísť requestom ──────────────────────────────────
  {
    for (const status of ['draft', 'pending_approval', 'sent', 'paid', 'cancelled']) {
      reset({ status });
      const r = parse(await call(handler, { invoice_id: 'i1', action: 'issue' }));
      eq(r.code, 409, `faktúru v stave „${status}" funkcia nevystaví`);
      ok(r.error.includes(status), 'a povie, v akom stave je');
    }
    reset({ approved_by: null, approved_at: null });
    const noWho = parse(await call(handler, { invoice_id: 'i1', action: 'issue' }));
    eq(noWho.code, 409, 'schválená bez zápisu kto a kedy sa nevystaví');
    ok(noWho.error.includes('kto a kedy'), 'a povie prečo');
    eq(calls.length, 0, 'do SuperFaktúry pri tom nič neodišlo');

    // Účtovníčka má Vydané faktúry, ale vystavuje len admin.
    reset();
    sfCreates();
    for (const action of ['issue', 'send', 'cancel', 'mark_sent']) {
      eq(parse(await call(handler, { invoice_id: 'i1', action, reason: 'Dôvod je dosť dlhý' }, 'POST', 'acc')).code, 403,
        `nie-admin: ${action} → 403`);
    }
    eq(calls.length, 0, 'a do SuperFaktúry nič neodíde');
    eq(inv().status, 'approved', 'faktúra zostala schválená');
  }

  // ── Doklad nevznikne dvakrát ──────────────────────────────────────────────
  {
    reset({ sf_invoice_id: 12345, sf_environment: 'sandbox' });
    const r = parse(await call(handler, { invoice_id: 'i1', action: 'issue' }));
    eq(r.code, 409, 'už vystavená faktúra sa nevystaví znova');
    ok(r.error.includes('12345'), 'a povie sa jej id v SuperFaktúre');

    reset({ sf_error: `VYSTAVUJE SA ${new Date().toISOString()}` });
    sfCreates();
    eq(parse(await call(handler, { invoice_id: 'i1', action: 'issue' })).code, 409, 'kým sa faktúra vystavuje, druhé vystavenie sa odmietne');
    eq(calls.length, 0, 'a do SuperFaktúry nič neodíde');

    reset();
    sfCreates();
    race.on = true;
    eq(parse(await call(handler, { invoice_id: 'i1', action: 'issue' })).code, 409, 'požiadavka, ktorá zámok nezabrala, nevystavuje');
    eq(calls.length, 0, 'ani do SuperFaktúry nevolá');
  }

  // ── Vystavenie: odberateľ, položky, reverse charge, číslo ─────────────────
  {
    reset({ sf_error: 'VYSTAVUJE SA 2026-01-01T00:00:00.000Z' });
    sfCreates({ id: 777, clientId: 55 });
    const r = parse(await call(handler, { invoice_id: 'i1', action: 'issue' }));
    eq([r.code, r.sf_invoice_id, r.environment, r.check], [200, 777, 'sandbox', 'ok'], 'po starej značke sa vystaví — práve raz, sandbox, suma sedí');
    eq(sfCalls('/invoices/create').length, 1, 'jeden doklad');
    ok(sfCalls('/invoices/create')[0].url.startsWith('https://sandbox.superfaktura.sk/'), 'proti sandboxu, kým SF_ENV nie je production');
    eq(sfCalls('/clients/create').length, 1, 'odberateľ bez id v SuperFaktúre sa založí');
    eq([db.danubra_partners[0].sf_client_id, db.danubra_partners[0].sf_client_env], [55, 'sandbox'], 'a jeho id sa zapíše k odberateľovi (s prostredím)');
    const p = sfCalls('/invoices/create')[0].body;
    eq(p.Client.id, 55, 'doklad ide na založeného odberateľa');
    eq([p.Invoice.invoice_no_formatted, p.Invoice.variable], ['2026042', '2026042'], 'zákonné číslo z appky, VS = číslice čísla');
    eq([p.Invoice.vat_transfer, p.InvoiceItem.map(i => i.tax)], [1, [0]], 'reverse charge: prenesenie daňovej povinnosti, sadzba 0 %');
    ok(/Steuerschuldnerschaft des Leistungsempfängers \(§13b UStG\)/.test(p.Invoice.comment), 'nemecká veta §13b na doklade');
    eq(p.InvoiceSetting.language, 'deu', 'jazyk „de" z karty odberateľa → „deu" pre SuperFaktúru');
    eq([p.InvoiceItem[0].quantity, p.InvoiceItem[0].unit_price, p.InvoiceItem[0].unit], [312, 28, 'Std.'], 'položka: hodiny × sadzba zo zákazky');
    eq([p.Invoice.due, p.Invoice.created, p.Invoice.delivery], ['2026-12-02', '2026-11-02', '2026-10-31'], 'splatnosť, vystavenie, dodanie z faktúry');
    eq(p.Invoice.bank_accounts, [{ iban: 'SK3112000000198742637541', swift: 'TATRSKBX' }], 'IBAN a BIC z Fakturačných údajov');
    ok(p.Invoice.internal_comment === 'HUB-KEY i1:sandbox', 'kľúč pokusu v internej poznámke dokladu');
    const x = inv();
    eq([x.status, x.sf_invoice_id, x.sf_token, x.sf_number, x.sf_environment, x.sf_check, x.sf_total, x.sf_error],
      ['issued', 777, 'tok-abc', '2026042', 'sandbox', 'ok', '8736.00', null], 'id, token, číslo a prostredie sa zapíšu hneď; kontrola sumy ok');
    eq(x.sf_idempotency_key, 'i1:sandbox', 'kľúč pokusu je pri faktúre');
    ok(history().some(a => /vystavená v SuperFaktúre/.test(a.body) && a.channel_meta.action === 'issue'), 'vystavenie je v histórii faktúry');
    ok(history().some(a => /založený v SuperFaktúre/.test(a.body)), 'aj založenie odberateľa');
  }

  // ── Odberateľ sa použije znova — ale len z toho istého prostredia ─────────
  {
    reset({}, { sf_client_id: 42, sf_client_env: 'sandbox' });
    sfCreates();
    await call(handler, { invoice_id: 'i1', action: 'issue' });
    eq([sfCalls('/clients/create').length, sfCalls('/clients/index').length], [0, 0], 'známy odberateľ sa nezakladá ani nehľadá');
    eq(sfCalls('/invoices/create')[0].body.Client.id, 42, 'doklad ide na jeho id');

    reset({}, { sf_client_id: 42, sf_client_env: 'production' });
    sfCreates({ clientId: 66 });
    await call(handler, { invoice_id: 'i1', action: 'issue' });
    eq(sfCalls('/invoices/create')[0].body.Client.id, 66, 'id z ostrého účtu sa v sandboxe nepoužije');

    // Nájdený podľa USt-IdNr — nezaloží sa duplicitný.
    reset();
    routes.push(['/clients/index.json', () => respond(200, { items: [{ Client: { id: 31, ic_dph: 'DE 287451936' } }] })]);
    sfCreates();
    await call(handler, { invoice_id: 'i1', action: 'issue' });
    eq([sfCalls('/clients/create').length, sfCalls('/invoices/create')[0].body.Client.id], [0, 31], 'odberateľ nájdený podľa USt-IdNr sa nezakladá druhýkrát');
  }

  // ── Voľná faktúra: vlastné položky; paušál keď hodiny nesedia na cent ─────
  {
    reset({ period_id: null, total: 475 });
    db.danubra_invoice_items = [
      { id: 'L1', invoice_id: 'i1', description: 'Montáž zábradlia', quantity: 12.5, unit: 'h', unit_price: 38 },
      { id: 'L2', invoice_id: 'i1', description: 'Vyhodená', quantity: 1, unit: 'ks', unit_price: 999, removed_at: '2026-10-01' },
    ];
    sfCreates();
    const r = parse(await call(handler, { invoice_id: 'i1', action: 'issue' }));
    const items = sfCalls('/invoices/create')[0].body.InvoiceItem;
    eq(items.map(i => [i.name, i.quantity, i.unit_price]), [['Montáž zábradlia', 12.5, 38]], 'vlastné položky, vyhodená nejde');
    eq(r.check, 'ok', 'súčet sedí');

    reset({ total: 8736.01 });
    db.danubra_periods[0].amount_charged = 8736.01;
    sfCreates();
    await call(handler, { invoice_id: 'i1', action: 'issue' });
    const it = sfCalls('/invoices/create')[0].body.InvoiceItem[0];
    eq([it.quantity, it.unit, it.unit_price], [1, 'Pauschale', 8736.01], 'hodiny × sadzba nesedia na cent → paušál s presnou sumou');
    ok(/312 Std\./.test(it.description), 'hodiny sú v popise');
  }

  // ── Kontrola súm po vystavení ─────────────────────────────────────────────
  {
    reset();
    sfCreates({ total: 10483.2 });   // SuperFaktúra pripočítala DPH
    const r = parse(await call(handler, { invoice_id: 'i1', action: 'issue' }));
    eq([r.code, r.check], [200, 'mismatch'], 'suma v SuperFaktúre iná → vystavená, ale „nesúhlasí"');
    eq([inv().status, inv().sf_invoice_id, inv().sf_check], ['issued', 777, 'mismatch'], 'id je zapísané (appka o doklade vie), stav nesúhlasí');
    ok(/10.483,20/.test(inv().sf_check_note) && /8.736,00/.test(inv().sf_check_note), 'poznámka hovorí obe sumy', inv().sf_check_note);
    ok(history().some(a => a.type === 'alert' && /Nesúhlasí/.test(a.body)), 'upozornenie v histórii');
    ok(db.danubra_tasks.some(t => t.source_key === 'sf-mismatch:i1' && t.priority === 'high'), 'a úloha pre človeka');
    const s = parse(await call(handler, { invoice_id: 'i1', action: 'send' }));
    eq(s.code, 409, 'nesúhlasiaca faktúra sa neodošle');
    ok(/nesúhlasí/.test(s.error), 'a povie prečo');
    eq(sfCalls('/invoices/send').length, 0, 'do SuperFaktúry nejde žiadny e-mail');

    reset();
    sfCreates({ number: 'OF2026001' });
    const n = parse(await call(handler, { invoice_id: 'i1', action: 'issue' }));
    eq([n.check, inv().sf_number], ['mismatch', 'OF2026001'], 'SuperFaktúra pridelila iné číslo → nesúhlasí');

    // Odpoveď bez sumy → dočíta sa cez view.
    reset();
    routes.push(['/clients/', () => respond(200, { error: 0, data: { Client: { id: 5 } }, items: [] })]);
    routes.push(['/invoices/create', () => respond(200, { error: 0, data: { Invoice: { id: 801, token: 't' } } })]);
    routes.push(['/invoices/view/801.json', () => respond(200, { Invoice: { id: 801, total: '8736.00', invoice_no_formatted: '2026042' } })]);
    const v = parse(await call(handler, { invoice_id: 'i1', action: 'issue' }));
    eq([v.check, sfCalls('/invoices/view').length], ['ok', 1], 'suma chýba v odpovedi → dočíta sa a porovná');
  }

  // ── Neistý pokus: doklad sa najprv hľadá, druhý nevznikne ─────────────────
  {
    reset();
    routes.push(['/clients/', () => respond(200, { error: 0, data: { Client: { id: 5 } }, items: [] })]);
    routes.push(['/invoices/create', () => { const e = new Error('The operation was aborted'); e.name = 'AbortError'; throw e; }]);
    const r = parse(await call(handler, { invoice_id: 'i1', action: 'issue' }));
    eq([r.code, r.uncertain, r.sfCode], [502, true, 'timeout'], 'vypršal čas pri zakladaní → neisté');
    ok(/mohol vzniknúť/.test(r.hint) && /nevznikne/.test(r.hint), 'rada: doklad mohol vzniknúť, ďalší pokus ho najprv vyhľadá', r.hint);
    eq(sfCalls('/invoices/create').length, 1, 'zápis sa automaticky neopakuje');
    ok(String(inv().sf_error).startsWith('NEISTÉ'), 'faktúra má značku neistého pokusu');
    eq([inv().status, inv().sf_invoice_id], ['approved', null], 'a zostala schválená');

    // Ďalší pokus: SuperFaktúra doklad má → prevezme sa, nezaloží sa druhý.
    calls = []; routes = [];
    routes.push([/\/invoices\/index\.json\/listinfo:1\/per_page:50\/search:/, () => respond(200, { items: [
      { Invoice: { id: 991, token: 'tk', invoice_no_formatted: '2026041', total: '100.00' } },
      { Invoice: { id: 990, token: 'tk2', invoice_no_formatted: '2026042', total: '8736.00', internal_comment: 'HUB-KEY i1:sandbox' } }] })]);
    routes.push(['/invoices/create', () => respond(200, { error: 0, data: { Invoice: { id: 1 } } })]);
    const r2 = parse(await call(handler, { invoice_id: 'i1', action: 'issue' }));
    eq([r2.code, r2.sf_invoice_id, r2.adopted], [200, 990, true], 'nájdený doklad sa prevezme');
    eq(sfCalls('/invoices/create').length, 0, 'druhý doklad nevznikne');
    eq([inv().status, inv().sf_invoice_id, inv().sf_token], ['issued', 990, 'tk2'], 'id a token nájdeného dokladu sa zapíšu');

    // Neistý pokus a SuperFaktúra sa nedá prehľadať → nezaloží sa nič.
    reset({ sf_error: 'NEISTÉ 2026-11-01T10:00:00Z: neodpovedala', sf_idempotency_key: 'i1:sandbox' });
    routes.push(['/invoices/index.json', () => respond(503, 'Service Unavailable')]);
    sfCreates();
    const r3 = parse(await call(handler, { invoice_id: 'i1', action: 'issue' }));
    eq(r3.code, 409, 'neistý pokus + hľadanie zlyhá → odmietne sa');
    eq(sfCalls('/invoices/create').length, 0, 'a doklad sa nezaloží');
    eq(sfCalls('/invoices/index.json').length, 3, 'hľadanie (čítanie) sa skúsilo trikrát');
    ok(String(inv().sf_error).startsWith('NEISTÉ'), 'značka neistého pokusu zostala');

    // Neistý pokus, hľadanie nič nenašlo → smie sa založiť.
    reset({ sf_error: 'NEISTÉ 2026-11-01T10:00:00Z: neodpovedala', sf_idempotency_key: 'i1:sandbox' });
    routes.push(['/invoices/index.json', () => respond(200, { items: [] })]);
    sfCreates();
    eq(parse(await call(handler, { invoice_id: 'i1', action: 'issue' })).code, 200, 'nenašiel sa → založí sa práve jeden');
    eq(sfCalls('/invoices/create').length, 1, 'práve jeden');
  }

  // ── Chyby SuperFaktúry: formát, limit, bez opakovania zápisu ──────────────
  {
    reset();
    routes.push(['/clients/', () => respond(200, { error: 0, data: { Client: { id: 5 } }, items: [] })]);
    routes.push(['/invoices/create', () => respond(200, { error: 1, error_message: { 'Client.name': ['Názov klienta je povinný'] } })]);
    const r = parse(await call(handler, { invoice_id: 'i1', action: 'issue' }));
    ok(r.code === 502 && /SuperFaktúra doklad odmietla/.test(r.error) && /Názov klienta je povinný/.test(r.error), 'chyba poľa sa prečíta a povie po slovensky', r.error);
    ok(/Opravte údaje/.test(r.hint), 'aj s radou');
    ok(!String(inv().sf_error).startsWith('NEISTÉ') && inv().status === 'approved', 'odmietnutý doklad nie je neistý, faktúra zostala schválená');

    reset();
    routes.push(['/clients/', () => respond(200, { error: 0, data: { Client: { id: 5 } }, items: [] })]);
    routes.push(['/invoices/create', () => respond(429, { error: 1, error_message: 'Too many requests' })]);
    const rl = parse(await call(handler, { invoice_id: 'i1', action: 'issue' }));
    eq([rl.code, sfCalls('/invoices/create').length], [429, 1], 'limit pri zápise → 429, neopakuje sa');
    ok(/Počkajte minútu/.test(rl.hint), 'rada: počkať');
  }

  // ── PDF do Dokumentov ─────────────────────────────────────────────────────
  {
    reset({ status: 'issued', sf_invoice_id: 777, sf_token: 'tok-abc', sf_environment: 'sandbox' });
    const PDF = Buffer.from('%PDF-1.4\n%test\n');
    routes.push(['/deu/invoices/pdf/777/token:tok-abc', () => respond(200, PDF)]);
    const r = parse(await call(handler, { invoice_id: 'i1', action: 'pdf' }));
    eq(r.code, 200, 'PDF sa stiahne');
    eq(uploads.length, 1, 'a nahrá do úložiska');
    ok(uploads[0].bucket === 'danubra-docs' && /^archiv\/partner\/p1\//.test(uploads[0].path), 'do archívu k odberateľovi', uploads[0].path);
    const a = db.danubra_archive[0] || {};
    eq([a.kind, a.invoice_id, a.partner_id, a.number, a.lang], ['rechnung', 'i1', 'p1', '2026042', 'de'], 'záznam v Dokumentoch je pri faktúre');
    ok(/Rechnung 2026042 – GU Ulm GmbH\.pdf$/.test(a.file_name), 'pomenovaný ako ostatné dokumenty', a.file_name);
    ok(/^https:\/\/signed\.example\//.test(r.url), 'vráti podpísaný odkaz');
    const again = parse(await call(handler, { invoice_id: 'i1', action: 'pdf' }));
    eq([again.cached, sfCalls('/invoices/pdf').length, uploads.length], [true, 1, 1], 'druhýkrát z Dokumentov, nesťahuje sa znova');
    eq(parse(await call(handler, { invoice_id: 'i1', action: 'pdf' }, 'POST', 'acc')).code, 200, 'PDF smie aj účtovníčka');

    reset({ status: 'issued', sf_invoice_id: 777, sf_token: 'tok-abc', sf_environment: 'sandbox' });
    routes.push(['/invoices/pdf/', () => respond(200, '<html>Prihláste sa</html>')]);
    const bad = parse(await call(handler, { invoice_id: 'i1', action: 'pdf' }));
    ok(bad.code >= 400 && uploads.length === 0, 'namiesto PDF prišlo HTML → nič sa neuloží');

    reset({ status: 'issued', sf_invoice_id: 777, sf_token: 'tok-abc', sf_environment: 'production' });
    const env = parse(await call(handler, { invoice_id: 'i1', action: 'pdf' }));
    eq(env.code, 409, 'doklad z iného prostredia sa nečíta');
    ok(/sandbox/.test(env.error + env.hint), 'a povie prečo');
  }

  // ── Odoslanie ─────────────────────────────────────────────────────────────
  {
    for (const status of ['draft', 'pending_approval', 'approved']) {
      reset({ status, sf_invoice_id: 1, sf_environment: 'sandbox' });
      eq(parse(await call(handler, { invoice_id: 'i1', action: 'send' })).code, 409, `faktúru v stave „${status}" funkcia neodošle`);
    }
    reset({ status: 'issued', sf_invoice_id: null });
    eq(parse(await call(handler, { invoice_id: 'i1', action: 'send' })).code, 409, 'bez id v SuperFaktúre sa neodosiela');
    reset({ status: 'issued', sf_invoice_id: 1, sf_environment: 'sandbox' }, { email: null });
    const noMail = parse(await call(handler, { invoice_id: 'i1', action: 'send' }));
    eq(noMail.code, 409, 'bez e-mailu odberateľa sa neodosiela');
    ok(noMail.error.includes('e-mail'), 'a povie prečo');

    reset({ status: 'issued', sf_invoice_id: 777, sf_environment: 'sandbox', sf_check: 'ok' });
    routes.push(['/invoices/send', () => respond(200, { error: 0 })]);
    const s = parse(await call(handler, { invoice_id: 'i1', action: 'send', cc: 'bauleiter@gu-ulm.de' }));
    eq(s.code, 200, 'vystavená faktúra sa odošle');
    const e = sfCalls('/invoices/send')[0].body.Email;
    eq([e.invoice_id, e.to, e.cc, e.subject, e.pdf_language], [777, 'bau@gu-ulm.de', ['bauleiter@gu-ulm.de', 'uctovnictvo@punds.eu'], 'Rechnung 2026042', 'deu'],
      'na e-mail odberateľa, kópia z okna aj z nastavení, po nemecky');
    eq([inv().status, !!inv().sf_sent_at, inv().sf_status], ['sent', true, 'sent'], 'stav: odoslaná');
    reset({ status: 'issued', sf_invoice_id: 777, sf_environment: 'sandbox' });
    eq(parse(await call(handler, { invoice_id: 'i1', action: 'send', cc: 'nie-je-email' })).code, 400, 'zlá kópia sa odmietne skôr, než niečo odíde');
    eq(sfCalls('/invoices/send').length, 0, 'nič neodišlo');

    // Odoslané z našej schránky.
    reset({ status: 'issued', sf_invoice_id: 777, sf_environment: 'sandbox' });
    routes.push(['/invoices/mark_as_sent', () => respond(200, { error: 0 })]);
    const m = parse(await call(handler, { invoice_id: 'i1', action: 'mark_sent', to: 'bau@gu-ulm.de' }));
    eq([m.code, inv().status, sfCalls('/invoices/mark_as_sent').length], [200, 'sent', 1], 'z našej schránky: odoslaná, SuperFaktúra to vie');
  }

  // ── Úhrada ────────────────────────────────────────────────────────────────
  {
    reset({ status: 'draft' });
    eq(parse(await call(handler, { invoice_id: 'i1', action: 'pay' })).code, 409, 'rozpracovaná faktúra sa neoznačí ako uhradená');

    reset({ status: 'issued', sf_invoice_id: null });
    const r = parse(await call(handler, { invoice_id: 'i1', action: 'pay' }));
    eq(r.code, 200, 'vystavená faktúra bez dokladu v SF sa dá uhradiť lokálne');
    eq(inv().status, 'paid', 'a stav sa zapíše');
    eq(calls.length, 0, 'do SuperFaktúry sa nevolá');

    reset({ status: 'sent', sf_invoice_id: 777, sf_environment: 'sandbox' });
    routes.push(['/invoices/view/777.json', () => respond(200, { Invoice: { id: 777, total: '8736.00', amount_paid: '1000.00' } })]);
    routes.push(['/invoice_payments/add/ajax:1/api:1', () => respond(200, { error: 0 })]);
    eq(parse(await call(handler, { invoice_id: 'i1', action: 'pay' })).code, 200, 'úhrada sa zapíše do SuperFaktúry');
    const pay = sfCalls('/invoice_payments/add')[0].body.InvoicePayment;
    eq([pay.invoice_id, pay.amount, pay.currency, pay.payment_type], [777, 7736, 'EUR', 'transfer'], 'len zostávajúca suma (nič dvakrát)');
    eq([inv().status, !!inv().sf_paid_at, inv().sf_status], ['paid', true, 'paid'], 'zaplatená aj podľa SuperFaktúry');

    reset({ status: 'paid', sf_invoice_id: 777, sf_environment: 'sandbox', sf_paid_at: null });
    routes.push(['/invoices/view/777.json', () => respond(200, { Invoice: { id: 777, total: '8736.00', amount_paid: '8736.00' } })]);
    routes.push(['/invoice_payments/add', () => respond(200, { error: 0 })]);
    eq(parse(await call(handler, { invoice_id: 'i1', action: 'pay' })).code, 200, 'zaplatená v appke → „Zapísať úhradu do SuperFaktúry"');
    eq(sfCalls('/invoice_payments/add').length, 0, 'v SuperFaktúre už uhradená → nič sa nepridá');
  }

  // ── Synchronizácia ────────────────────────────────────────────────────────
  {
    const issued = { status: 'sent', sf_invoice_id: 777, sf_environment: 'sandbox', sf_check: 'ok', sent_at: '2026-11-03' };
    reset(issued);
    routes.push(['/invoices/view/777.json', () => respond(200, { Invoice: { id: 777, total: '8736.00', amount_paid: '8736.00', status: '3' },
      InvoicePayment: [{ amount: '8736.00', created: '2026-11-05' }] })]);
    const r = parse(await call(handler, { invoice_id: 'i1', action: 'sync' }, 'POST', 'acc'));
    eq([r.code, r.result.state, r.result.changes], [200, 'paid', ['paid']], 'plná úhrada v SuperFaktúre');
    eq([inv().status, String(inv().paid_at).slice(0, 10), inv().sf_status], ['paid', '2026-11-05', 'paid'], 'faktúra je zaplatená k dátumu platby');
    ok(history().some(a => /Zaplatená podľa SuperFaktúry/.test(a.body)), 'zapísané do histórie');

    reset(issued);
    db.danubra_bank_transactions = [{ id: 'tx1', matched_invoice_id: 'i1', match_status: 'auto' }];
    routes.push(['/invoices/view/777.json', () => respond(200, { Invoice: { id: 777, total: '8736.00', amount_paid: '8736.00' } })]);
    const b = parse(await call(handler, { invoice_id: 'i1', action: 'sync' }));
    eq([b.result.changes, inv().status], [['bank'], 'sent'], 'Banka už platbu spárovala → stav sa nemení (rozhoduje Banka)');

    reset(issued);
    routes.push(['/invoices/view/777.json', () => respond(200, { Invoice: { id: 777, total: '8736.00', amount_paid: '4000.00', status: '2' } })]);
    const part = parse(await call(handler, { invoice_id: 'i1', action: 'sync' }));
    eq([part.result.state, inv().status, inv().sf_status, inv().sf_paid_amount], ['partial', 'sent', 'partial', '4000.00'], 'čiastočná úhrada: stav sa nemení, zapíše sa koľko');
    ok(history().some(a => /čiastočná úhrada 4.000,00/.test(a.body)), 'čiastočná úhrada je v histórii');
    const again = parse(await call(handler, { invoice_id: 'i1', action: 'sync' }));
    eq([again.result.changes, history().filter(a => /čiastočná/.test(a.body)).length], [[], 1], 'bez zmeny sa do histórie nepíše znova');

    reset(issued);
    routes.push(['/invoices/view/777.json', () => respond(200, { Invoice: { id: 777, total: '9000.00', amount_paid: '0.00' } })]);
    const mm = parse(await call(handler, { invoice_id: 'i1', action: 'sync' }));
    eq([mm.result.changes, inv().sf_check, inv().status], [['mismatch'], 'mismatch', 'sent'], 'iná suma v SuperFaktúre → nesúhlasí, stav sa nemení');

    reset({ ...issued, status: 'paid', paid_at: '2026-11-04' });
    routes.push(['/invoices/view/777.json', () => respond(200, { Invoice: { id: 777, total: '8736.00', amount_paid: '0.00' } })]);
    const un = parse(await call(handler, { invoice_id: 'i1', action: 'sync' }));
    eq([un.result.changes, inv().status], [['sf_unpaid'], 'paid'], 'v appke zaplatená, v SF nie → len zápis do histórie');

    // Všetky naraz (to isté robí denný cron).
    reset(issued);
    db.danubra_invoices.push({ ...APPROVED, id: 'i2', invoice_number: '2026043', status: 'issued', sf_invoice_id: 778, sf_environment: 'sandbox' },
      { ...APPROVED, id: 'i3', status: 'issued', sf_invoice_id: 779, sf_environment: 'production' },
      { ...APPROVED, id: 'i4', status: 'paid', sf_invoice_id: 780, sf_environment: 'sandbox', sf_status: 'paid' });
    routes.push(['/invoices/view/777.json', () => respond(200, { Invoice: { id: 777, total: '8736.00', amount_paid: '8736.00' } })]);
    routes.push(['/invoices/view/778.json', () => respond(429, { error: 1, error_message: 'Too many requests' })]);
    const all = parse(await call(handler, { action: 'sync' }));
    eq([all.code, all.checked, all.paid, all.errors.length], [200, 1, 1, 1], 'synchronizácia všetkých: zaplatená sa označí, chyba sa povie');
    eq(sfCalls('/invoices/view/779').length + sfCalls('/invoices/view/780').length, 0, 'doklad z ostrého účtu ani uzavretý sa nečíta');
    eq(sfCalls('/invoices/view/778').length, 3, 'čítanie pri limite sa skúsi znova (3×)');
  }

  // ── Dobropis ──────────────────────────────────────────────────────────────
  {
    const issued = { status: 'sent', sf_invoice_id: 777, sf_environment: 'sandbox', sf_token: 't' };
    reset(issued);
    eq(parse(await call(handler, { invoice_id: 'i1', action: 'cancel', reason: 'chyba' })).code, 400, 'bez dôvodu (10 znakov) sa dobropis nepripraví');
    reset({ status: 'approved' });
    eq(parse(await call(handler, { invoice_id: 'i1', action: 'cancel', reason: 'Nesprávna zákazka na faktúre' })).code, 409, 'k faktúre mimo SuperFaktúry dobropis nie je');

    reset(issued);
    const r = parse(await call(handler, { invoice_id: 'i1', action: 'cancel', reason: 'Nesprávna zákazka na faktúre' }));
    eq([r.code, r.invoice_number], [200, '2026099'], 'dobropis sa pripraví s novým číslom');
    const cn = inv(r.credit_note_id);
    eq([cn.kind, cn.parent_invoice_id, cn.status, cn.total, cn.due_date, cn.approved_by == null],
      ['credit_note', 'i1', 'pending_approval', '-8736.00', null, true], 'ako dobropis čakajúci na schválenie, so zápornou sumou');
    const its = db.danubra_invoice_items.filter(i => i.invoice_id === cn.id);
    eq(its.map(i => [i.quantity, i.unit_price, i.total]), [[-312, '28.00', '-8736.00']], 'položky ako pôvodná faktúra, záporné množstvo');
    eq(inv().status, 'sent', 'pôvodná faktúra sa zatiaľ nemení');
    eq(calls.length, 0, 'do SuperFaktúry zatiaľ nič');
    const twice = parse(await call(handler, { invoice_id: 'i1', action: 'cancel', reason: 'Nesprávna zákazka na faktúre' }));
    eq(twice.code, 409, 'druhý dobropis k tej istej faktúre nie');

    // Neschválený dobropis sa nevystaví.
    const nope = parse(await call(handler, { invoice_id: cn.id, action: 'issue' }));
    eq(nope.code, 409, 'dobropis čakajúci na schválenie sa nevystaví');

    // Admin ho schválil (v databáze).
    Object.assign(cn, { status: 'approved', approved_by: 'u1', approved_at: '2026-11-06T09:00:00Z' });
    db.danubra_partners[0].sf_client_id = 55; db.danubra_partners[0].sf_client_env = 'sandbox';
    sfCreates({ id: 900 });
    const iss = parse(await call(handler, { invoice_id: cn.id, action: 'issue' }));
    eq([iss.code, iss.check], [200, 'ok'], 'schválený dobropis sa vystaví a suma sedí');
    const p = sfCalls('/invoices/create')[0].body;
    eq([p.Invoice.type, p.Invoice.parent_id, p.Invoice.invoice_no_formatted, p.Invoice.due === p.Invoice.created],
      ['cancel', 777, '2026099', true], 'v SuperFaktúre ako doklad typu cancel k pôvodnej faktúre (bez splatnosti)');
    ok(/Stornorechnung zur Rechnung Nr\. 2026042/.test(p.Invoice.comment) && /Nesprávna zákazka/.test(p.Invoice.comment), 'na doklade je, ku ktorej faktúre a prečo');
    eq(p.InvoiceItem.map(i => [i.quantity, i.unit_price]), [[-312, 28]], 'položky záporné');
    eq([inv(cn.id).status, inv().status], ['issued', 'cancelled'], 'dobropis vystavený, pôvodná faktúra stornovaná (nezmazaná)');
    ok(history('i1').some(a => /Stornovaná dobropisom 2026099/.test(a.body)), 'v histórii pôvodnej faktúry');
  }

  // ── Kľúč neodíde nikam ────────────────────────────────────────────────────
  {
    const all = responses.join('\n');
    ok(!all.includes(KEY) && !all.includes('SFAPI') && !all.includes(MAIL), 'v žiadnej odpovedi nie je kľúč, hlavička ani celý e-mail účtu');
    const logs = JSON.stringify(db.danubra_activities);
    reset();
    sfCreates();
    await call(handler, { invoice_id: 'i1', action: 'issue' });
    const hist = JSON.stringify(db.danubra_activities) + logs;
    ok(!hist.includes(KEY) && !hist.includes('SFAPI') && !hist.includes('tok-abc'), 'v histórii faktúry nie je kľúč, hlavička ani token dokladu');
  }

  console.log(`\n${passed} prešlo, ${failed} padlo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log(`  ✗ test spadol: ${e.stack || e.message}`);
  console.log('\n0 prešlo, 1 padlo');
  process.exit(1);
});
