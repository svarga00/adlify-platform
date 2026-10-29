// ============================================================================
// DANUBRA — príjem dopytov z webu (danubra-webhook-forms): kto smie poslať
// Spustenie:  node app/tests/webhook-forms.test.js
// ============================================================================
// Bez FORMS_SECRET endpoint doteraz prijal čokoľvek od kohokoľvek. Teraz:
//   * s tajomstvom — len so správnou hlavičkou alebo ?secret=,
//   * bez neho (spätná kompatibilita) — len z našich stránok (Origin/Referer)
//     a do logu ide varovanie,
//   * chyba databázy sa navonok neukáže (len všeobecná veta).
// Databáza sa nevolá — klient Supabase je podvrhnutý.
// ============================================================================
const path = require('path');

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}

const FN = path.join(__dirname, '..', '..', 'netlify', 'functions', 'danubra-webhook-forms.js');
// Podvrhnutý klient: každý dotaz spadne s „interným" textom, ktorý nesmie von.
const SECRET_DETAIL = 'relation "danubra_clients" column phone violates check xyz';
const sbPath = require.resolve('@supabase/supabase-js', { paths: [path.dirname(FN)] });
require.cache[sbPath] = { id: sbPath, filename: sbPath, loaded: true, exports: {
  createClient: () => ({ from: () => { throw new Error(SECRET_DETAIL); } }),
} };

const warns = [];
const origWarn = console.warn, origErr = console.error;
console.warn = (...a) => warns.push(a.join(' '));
console.error = () => {};

const f = require(FN);
const { authorized, originAllowed } = f._test;
const ev = (headers = {}, q = {}) => ({ httpMethod: 'POST', headers, queryStringParameters: q, body: JSON.stringify({ email: 'a@b.sk' }) });

(async () => {
  console.log('Príjem dopytov z webu');
  ok(originAllowed({ origin: 'https://punds.sk' }) && originAllowed({ origin: 'https://www.punds.eu' })
    && originAllowed({ referer: 'https://punds.sk/sk/kontakt' }) && originAllowed({ Origin: 'https://adlify-app.netlify.app' }),
  'naše stránky (Origin aj Referer) prejdú');
  ok(!originAllowed({ origin: 'https://evil.com' }) && !originAllowed({ origin: 'https://punds.sk.evil.com' })
    && !originAllowed({ referer: 'https://evil.com/?punds.sk' }) && !originAllowed({}) && !originAllowed({ origin: 'null' }),
  'cudzia stránka ani požiadavka bez pôvodu neprejde');
  ok(originAllowed({ origin: 'https://danubra.sk' }, 'danubra.sk, https://www.danubra.sk/') && originAllowed({ origin: 'https://www.danubra.sk' }, 'danubra.sk, https://www.danubra.sk/'),
    'ďalšie domény z FORMS_ALLOWED_ORIGINS');

  warns.length = 0;
  ok(authorized(ev({ origin: 'https://punds.eu' }), {}) && !authorized(ev({}), {}) && warns.length === 2 && warns.every((w) => /FORMS_SECRET nie je nastavený/.test(w)),
    'bez FORMS_SECRET: z našej stránky áno, bez pôvodu nie — a vždy varovanie do logu', warns.join(' | '));
  const env = { FORMS_SECRET: 'tajne-heslo' };
  ok(authorized(ev({ 'x-danubra-secret': 'tajne-heslo' }), env) && authorized(ev({}, { secret: 'tajne-heslo' }), env)
    && !authorized(ev({ 'x-danubra-secret': 'zle' }), env) && !authorized(ev({ origin: 'https://punds.sk' }), env) && !authorized(ev({ 'x-danubra-secret': '' }), env),
  's FORMS_SECRET len so správnym tajomstvom (pôvod nestačí)');

  delete process.env.FORMS_SECRET;
  const r401 = await f.handler(ev({}));
  ok(r401.statusCode === 401, 'požiadavka bez tajomstva aj bez pôvodu je odmietnutá', r401.statusCode);
  const r500 = await f.handler(ev({ origin: 'https://punds.sk' }));
  ok(r500.statusCode === 500 && !r500.body.includes(SECRET_DETAIL) && !/danubra_|relation|column/.test(r500.body) && /nepodarilo/.test(JSON.parse(r500.body).error),
    'chyba databázy sa navonok neukáže — len všeobecná veta', r500.body);

  console.warn = origWarn; console.error = origErr;
  console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.warn = origWarn; console.log(`  ✗ test spadol: ${e.stack}`); console.log('\n0 prešlo, 1 zlyhalo'); process.exit(1); });
