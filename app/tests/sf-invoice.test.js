// ============================================================================
// Testy serverovej funkcie pre SuperFaktúru
// Spustenie:  node app/tests/sf-invoice.test.js
// ============================================================================
// Bez siete a bez kľúča. Testuje sa to, na čom funkcia stojí: že sa
// schvaľovanie nedá obísť requestom a že doklad nevznikne dvakrát.
//
// Test zámerne NEleží v `netlify/functions/`. Netlify z každého súboru v tom
// priečinku robí funkciu a názov „danubra-sf-invoice.test" obsahuje bodku,
// ktorú nepovoľuje — celý deploy potom spadne. Stálo to jeden červený build.
// ============================================================================
const Module = require('module');
const path = require('path');

// ── Falošná Supabase ────────────────────────────────────────────────────────
let INVOICE = null;
let CLAIM = [{ id: 'i1' }];
const updates = [];

// Kto volá: kľúč „ok" = admin appky, „rec" = náborár (na faktúry nesmie).
let MEMBERS = [{ user_id: 'u1', role: 'admin', active: true }, { user_id: 'u2', role: 'recruiter', active: true }];
const fakeClient = {
  auth: {
    getUser: async (jwt) => ({ data: { user: jwt === 'ok' ? { id: 'u1' } : jwt === 'rec' ? { id: 'u2' } : null } }),
  },
  from() {
    const q = {
      _update: null,
      select() { return q; },
      limit: async () => ({ data: MEMBERS, error: null }),
      eq() { return q; },
      // Filtre `.is('archived_at', null)` (migrácia 066) — mock ich len prepustí.
      is() { return q; },
      maybeSingle: async () => ({ data: INVOICE, error: null }),
      update(payload) { q._update = payload; updates.push(payload); return q; },
      // Zámok pri vystavení: `update(...).select('id')` vráti zabrané riadky.
      // CLAIM = [] znamená, že faktúru medzitým zabrala iná požiadavka.
      then(resolve) {
        const data = q._update && String(q._update.sf_error || '').startsWith('VYSTAVUJE SA') ? CLAIM : null;
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return q;
  },
};

// Podstrčíme falošného klienta ešte pred načítaním funkcie.
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@supabase/supabase-js') return { createClient: () => fakeClient };
  return origLoad.apply(this, arguments);
};

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg) { eq(!!c, true, msg); }

const call = async (fn, body, method = 'POST', jwt = 'ok') =>
  fn({ httpMethod: method, body: JSON.stringify(body), headers: jwt ? { authorization: `Bearer ${jwt}` } : {} });
const parse = (res) => ({ code: res.statusCode, ...JSON.parse(res.body) });

console.log('SuperFaktúra — serverová funkcia');

(async () => {
  const fnPath = path.join(__dirname, '..', '..', 'netlify', 'functions', 'danubra-sf-invoice.js');

  // ── Bez kľúča sa nič nerozbije ────────────────────────────────────────────
  {
    delete process.env.SF_API_KEY;
    delete process.env.SF_EMAIL;
    delete require.cache[fnPath];
    const { handler } = require(fnPath);

    const r = parse(await call(handler, { invoice_id: 'x', action: 'issue' }));
    eq(r.code, 200, 'bez kľúča funkcia nespadne');
    eq(r.skipped, true, 'len ticho skončí');
    eq(r.reason, 'no_sf_credentials', 'a povie, čo chýba');
    ok(r.message.includes('SF_EMAIL'), 'menovite');
    ok(r.message.includes('schválená'), 'a čo sa s faktúrou stane');

    eq(parse(await call(handler, {}, 'GET')).code, 405, 'GET sa odmieta');
  }

  // ── Kto smie volať ────────────────────────────────────────────────────────
  // Funkcia beží so service-role kľúčom — bez prihláseného člena s právom
  // na faktúry nesmie urobiť nič.
  {
    delete require.cache[fnPath];
    const { handler } = require(fnPath);
    eq(parse(await call(handler, { invoice_id: 'x', action: 'issue' }, 'POST', '')).code, 401,
      'bez prihlásenia nič');
    eq(parse(await call(handler, { invoice_id: 'x', action: 'issue' }, 'POST', 'rec')).code, 403,
      'náborár bez práva na faktúry nič');
  }

  // ── S kľúčom: stav sa číta z databázy ─────────────────────────────────────
  process.env.SF_EMAIL = 'test@danubra.eu';
  process.env.SF_API_KEY = 'testovaci-kluc';
  process.env.SF_ENV = 'sandbox';
  delete require.cache[fnPath];
  const { handler } = require(fnPath);

  {
    eq(parse(await call(handler, { action: 'issue' })).code, 400, 'bez invoice_id nič');
    eq(parse(await call(handler, { invoice_id: 'x', action: 'nieco' })).code, 400,
      'neznáma akcia sa odmieta');

    INVOICE = null;
    eq(parse(await call(handler, { invoice_id: 'x', action: 'issue' })).code, 404,
      'neexistujúca faktúra');
  }

  // ── Schvaľovanie sa nedá obísť requestom ──────────────────────────────────
  // Toto je celý dôvod, prečo funkcia číta stav z databázy a nie z tela
  // požiadavky. Keby stačilo poslať {action:'issue'}, dalo by sa schválenie
  // preskočiť jedným volaním z konzoly prehliadača.
  {
    for (const status of ['draft', 'pending_approval', 'sent', 'paid', 'cancelled']) {
      INVOICE = { id: 'i1', status, total: 100, approved_by: 'u1', approved_at: 'x' };
      const r = parse(await call(handler, { invoice_id: 'i1', action: 'issue' }));
      eq(r.code, 409, `faktúru v stave „${status}" funkcia nevystaví`);
      ok(r.error.includes(status), 'a povie, v akom stave je');
    }

    // Schválená, ale bez zápisu kto a kedy — tiež nie.
    INVOICE = { id: 'i1', status: 'approved', total: 100, approved_by: null, approved_at: null };
    const noWho = parse(await call(handler, { invoice_id: 'i1', action: 'issue' }));
    eq(noWho.code, 409, 'schválená bez zápisu kto a kedy sa nevystaví');
    ok(noWho.error.includes('kto a kedy'), 'a povie prečo');
  }

  // ── Doklad nevznikne dvakrát ──────────────────────────────────────────────
  {
    INVOICE = { id: 'i1', status: 'approved', total: 100,
      approved_by: 'u1', approved_at: 'x', sf_invoice_id: 12345 };
    const r = parse(await call(handler, { invoice_id: 'i1', action: 'issue' }));
    eq(r.code, 409, 'už vystavená faktúra sa nevystaví znova');
    ok(r.error.includes('12345'), 'a povie sa jej id v SuperFaktúre');
  }

  // ── Dvojklik nevystaví dva doklady ────────────────────────────────────────
  {
    const SCHVALENA = { id: 'i1', status: 'approved', total: 1000, vat_regime: 'standard',
      invoice_number: '2026042', approved_by: 'u1', approved_at: 'x', sf_invoice_id: null, sf_error: null,
      partner: { name: 'GU Ulm GmbH', ust_idnr: 'DE1', country: 'DE' }, period: {}, subcontract: {}, items: [] };
    const sent = [];
    const origFetch = global.fetch;
    global.fetch = async (url, opt) => {
      sent.push({ url, body: JSON.parse(opt.body || 'null') });
      return { ok: true, status: 200, text: async () => JSON.stringify({ error: 0, data: { Invoice: { id: 777, token: 't' } } }) };
    };

    // Druhá požiadavka, ktorá príde, kým prvá ešte beží.
    INVOICE = { ...SCHVALENA, sf_error: `VYSTAVUJE SA ${new Date().toISOString()}` };
    const busy = parse(await call(handler, { invoice_id: 'i1', action: 'issue' }));
    eq(busy.code, 409, 'kým sa faktúra vystavuje, druhé vystavenie sa odmietne');
    eq(sent.length, 0, 'a do SuperFaktúry nič neodíde');

    // Obe prečítali „schválená, bez id", ale zámok zabrala tá druhá.
    INVOICE = { ...SCHVALENA };
    CLAIM = [];
    const lost = parse(await call(handler, { invoice_id: 'i1', action: 'issue' }));
    eq(lost.code, 409, 'požiadavka, ktorá zámok nezabrala, nevystavuje');
    eq(sent.length, 0, 'ani do SuperFaktúry nevolá');

    // Stará značka (spadnutý pokus) faktúru navždy nezamkne.
    CLAIM = [{ id: 'i1' }];
    INVOICE = { ...SCHVALENA, sf_error: 'VYSTAVUJE SA 2026-01-01T00:00:00.000Z' };
    const ok1 = parse(await call(handler, { invoice_id: 'i1', action: 'issue' }));
    eq(ok1.code, 200, 'po starej značke sa vystaviť dá');
    eq(sent.length, 1, 'práve raz');
    ok(String(sent[0].url).startsWith('https://sandbox.superfaktura.sk/'), 'a proti sandboxu, kým SF_ENV nie je production');
    eq(sent[0].body.InvoiceItem.map(i => i.tax), [0], 'bez DPH aj pri „bežnom" režime — nie sme platiteľ DPH');
    ok(updates.some(u => u.sf_invoice_id === 777 && u.status === 'issued'), 'id dokladu sa zapíše');
    global.fetch = origFetch;
  }

  // ── Odoslanie je samostatné rozhodnutie ───────────────────────────────────
  {
    for (const status of ['draft', 'pending_approval', 'approved']) {
      INVOICE = { id: 'i1', status, sf_invoice_id: 1, partner: { email: 'a@b.de' } };
      const r = parse(await call(handler, { invoice_id: 'i1', action: 'send' }));
      eq(r.code, 409, `faktúru v stave „${status}" funkcia neodošle`);
    }
    // Schválená faktúra sa neodošle sama ani cez akciu send.
    INVOICE = { id: 'i1', status: 'issued', sf_invoice_id: null, partner: { email: 'a@b.de' } };
    eq(parse(await call(handler, { invoice_id: 'i1', action: 'send' })).code, 409,
      'bez id v SuperFaktúre sa neodosiela');

    INVOICE = { id: 'i1', status: 'issued', sf_invoice_id: 1, partner: { email: null } };
    const noMail = parse(await call(handler, { invoice_id: 'i1', action: 'send' }));
    eq(noMail.code, 409, 'bez e-mailu odberateľa sa neodosiela');
    ok(noMail.error.includes('e-mail'), 'a povie prečo');
  }

  // ── Úhrada ────────────────────────────────────────────────────────────────
  {
    INVOICE = { id: 'i1', status: 'draft', total: 100 };
    eq(parse(await call(handler, { invoice_id: 'i1', action: 'pay' })).code, 409,
      'rozpracovaná faktúra sa neoznačí ako uhradená');

    // Bez sf_invoice_id sa do SuperFaktúry nevolá, ale stav sa zapíše.
    INVOICE = { id: 'i1', status: 'issued', total: 100, sf_invoice_id: null };
    const r = parse(await call(handler, { invoice_id: 'i1', action: 'pay' }));
    eq(r.code, 200, 'vystavená faktúra bez dokladu v SF sa dá uhradiť lokálne');
    ok(updates.some(u => u.status === 'paid'), 'a stav sa zapíše');
  }

  console.log(`\n${passed} prešlo, ${failed} padlo`);
  process.exit(failed ? 1 : 0);
})();
