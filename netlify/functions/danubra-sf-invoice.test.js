// ============================================================================
// Testy serverovej funkcie pre SuperFaktúru
// Spustenie:  node netlify/functions/danubra-sf-invoice.test.js
// ============================================================================
// Bez siete a bez kľúča. Testuje sa to, na čom funkcia stojí: že sa
// schvaľovanie nedá obísť requestom a že doklad nevznikne dvakrát.
// ============================================================================
const Module = require('module');
const path = require('path');

// ── Falošná Supabase ────────────────────────────────────────────────────────
let INVOICE = null;
const updates = [];

const fakeClient = {
  from() {
    const q = {
      _update: null,
      select() { return q; },
      eq() { return q; },
      maybeSingle: async () => ({ data: INVOICE, error: null }),
      update(payload) { q._update = payload; updates.push(payload); return q; },
      then(resolve) { return Promise.resolve({ data: null, error: null }).then(resolve); },
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

const call = async (fn, body, method = 'POST') =>
  fn({ httpMethod: method, body: JSON.stringify(body) });
const parse = (res) => ({ code: res.statusCode, ...JSON.parse(res.body) });

console.log('SuperFaktúra — serverová funkcia');

(async () => {
  const fnPath = path.join(__dirname, 'danubra-sf-invoice.js');

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
