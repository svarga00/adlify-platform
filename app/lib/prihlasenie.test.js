// ============================================================================
// DANUBRA — prihlásenie kolegov: odkaz, heslo, stav účtu, texty pozvánky
// Spustenie:  node app/lib/prihlasenie.test.js
// ============================================================================
const P = require('./prihlasenie.js');

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}

console.log('Odkaz a návrat');
ok(P.redirectTo('https://adlify-app.netlify.app/') === 'https://adlify-app.netlify.app/app/?heslo=1', 'návrat zo Supabase: /app/?heslo=1 (bez # v adrese)');
ok(P.redirectTo('https://adlify-app.netlify.app/app') === 'https://adlify-app.netlify.app/app/?heslo=1', 'adresa s /app sa nezdvojí');
ok(P.setLink('https://x.sk', 'abc123') === 'https://x.sk/app/?heslo=1#k=abc123', 'náš odkaz: kód za #');
ok(P.appAddress('https://x.sk') === 'https://x.sk/app/', 'adresa appky na prihlásenie');
ok(P.parseReturn('?heslo=1', '#k=abc').mode === 'token' && P.parseReturn('?heslo=1', '#k=abc').token === 'abc', '#k= → overí sa až po kliknutí');
ok(P.parseReturn('?heslo=1', '#access_token=x&refresh_token=y&type=recovery').mode === 'session', 'návrat s prihlásením zo Supabase');
ok(P.parseReturn('', '#access_token=x&type=recovery').mode === 'session', 'type=recovery aj bez ?heslo=1');
ok(P.parseReturn('', '#access_token=x&type=signup') === null, 'iné prihlásenie z adresy nie je o hesle');
const e = P.parseReturn('?heslo=1', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
ok(e.mode === 'error' && e.code === 'otp_expired', 'vypršaný odkaz → chyba otp_expired', JSON.stringify(e));
ok(P.parseReturn('?heslo=1', '').mode === 'session', '?heslo=1 bez ničoho → skúsi prihlásenie (inak „vypršal")');
ok(P.parseReturn('', '#/heslo').mode === 'manual', '#/heslo → zmena hesla prihláseného');
ok(P.parseReturn('', '#/workers') === null && P.parseReturn('', '') === null, 'obyčajná obrazovka nič nespustí');

console.log('\nHeslo');
ok(!P.checkPassword('', '').ok, 'prázdne neprejde');
ok(/aspoň 10 znakov/.test(P.checkPassword('kratke', 'kratke').error), 'menej ako 10 znakov', P.checkPassword('kratke', 'kratke').error);
ok(/nezhodujú/.test(P.checkPassword('dlhehesloAB', 'dlhehesloAC').error), 'dve rôzne heslá');
ok(!P.checkPassword(' medzera-na-zaciatku', ' medzera-na-zaciatku').ok, 'medzera na začiatku nie');
ok(!P.checkPassword('aaaaaaaaaaaa', 'aaaaaaaaaaaa').ok, 'jeden znak dookola nie');
ok(P.checkPassword('modra-lavica-1', 'modra-lavica-1').ok, 'dobré heslo prejde');

console.log('\nStav účtu');
ok(P.stateOf(null).state === 'none' && P.stateOf(null).has_account === false, 'bez účtu: Nemá účet');
const pozvany = P.stateOf({ id: 'u', email: 'a@b.sk', app_metadata: { danubra_invited: true, danubra_link_at: '2026-11-02T10:00:00Z' }, last_sign_in_at: null });
ok(pozvany.state === 'invited' && pozvany.invited_at === '2026-11-02T10:00:00Z' && pozvany.pending, 'pozvaný bez prihlásenia: čaká na heslo');
const klikol = P.stateOf({ id: 'u', app_metadata: { danubra_invited: true, danubra_link_at: '2026-11-02T10:00:00Z' }, last_sign_in_at: '2026-11-02T10:05:00Z' });
ok(klikol.state === 'invited', 'klikol na odkaz, heslo nenastavil: stále čaká na heslo');
const aktivny = P.stateOf({ id: 'u', app_metadata: { danubra_invited: true, danubra_link_at: '2026-11-02T10:00:00Z' },
  user_metadata: { danubra_password_set_at: '2026-11-02T10:06:00Z' }, last_sign_in_at: '2026-11-03T08:00:00Z' });
ok(aktivny.state === 'active' && !aktivny.pending && aktivny.last_sign_in_at === '2026-11-03T08:00:00Z', 'heslo nastavené a prihlasuje sa: Aktívny');
const cudzi = P.stateOf({ id: 'u', app_metadata: { provider: 'email' }, last_sign_in_at: '2026-10-01T08:00:00Z' });
ok(cudzi.state === 'active' && cudzi.external, 'účet z Adlify, ktorý sa prihlasuje: Aktívny (cudzí)');
const keys = Object.keys(P.stateOf({ id: 'u', email: 'a@b.sk', phone: '+421', app_metadata: { x: 1 }, user_metadata: { y: 2 }, confirmation_token: 'tajne' }));
ok(JSON.stringify(keys.sort()) === JSON.stringify(['external', 'has_account', 'invited_at', 'last_sign_in_at', 'password_set_at', 'pending', 'state']),
  'stav nevracia nič z účtu navyše', keys.join(','));

console.log('\nStĺpec Prihlásenie');
ok(P.loginLabel(null, { email: 'a@b.sk' }).text === 'zisťujem…', 'kým server neodpovie: zisťujem');
ok(P.loginLabel({ state: 'none' }, { email: 'a@b.sk' }).text === 'Nemá účet', 'Nemá účet');
ok(P.loginLabel(pozvany, { email: 'a@b.sk' }).text === 'Pozvaný (čaká na heslo)' && /odkaz poslaný 2\. 11\. 2026/.test(P.loginLabel(pozvany, { email: 'a@b.sk' }).sub), 'Pozvaný (čaká na heslo), odkaz poslaný dňa');
const la = P.loginLabel(aktivny, { email: 'a@b.sk' });
ok(la.text === 'Aktívny' && /posledné prihlásenie dňa 3\. 11\. 2026/.test(la.sub), 'Aktívny, posledné prihlásenie dňa …', la.sub);
ok(P.loginLabel({ state: 'none' }, { email: '' }).text === 'Bez e-mailu', 'bez e-mailu sa pozvať nedá');

console.log('\nTexty pozvánky');
const wa = P.whatsappText({ name: 'Jana Kováčová', email: 'jana@punds.eu', link: 'https://x.sk/app/?heslo=1#k=abc', appUrl: 'https://x.sk', company: 'Partner und Service' });
ok(/^Dobrý deň, Jana\./.test(wa) && wa.includes('https://x.sk/app/?heslo=1#k=abc') && wa.includes('https://x.sk/app/ e-mailom jana@punds.eu') && /Vám/.test(wa) && /Partner und Service/.test(wa),
  'WhatsApp: oslovenie, odkaz, adresa appky, e-mail, vykanie', wa);
const mail = P.mailText({ name: 'Jana', email: 'jana@punds.eu', link: 'https://x.sk/app/?heslo=1#k=abc', appUrl: 'https://x.sk', from: 'Štefan Varga' });
ok(mail.includes('#k=abc') && /S pozdravom\nŠtefan Varga$/.test(mail) && /nastavte si heslo/.test(mail), 'e-mail s odkazom a podpisom');
const ulozeny = P.mailText({ name: 'Jana', email: 'jana@punds.eu', link: null, appUrl: 'https://x.sk' });
ok(!ulozeny.includes('#k=') && /neukladá/.test(ulozeny), 'verzia na uloženie do appky je bez odkazu');
ok(P.mailSubject('Partner und Service') === 'Prístup do firemnej appky — Partner und Service' && P.mailSubject('') === 'Prístup do firemnej appky', 'predmet s názvom firmy z Nastavení');
ok(/obmedzený čas/.test(P.MSG.note) && /raz/.test(P.MSG.note), 'poznámka: obmedzený čas, dá sa použiť raz');

console.log(`\n${passed} prešlo, ${failed} padlo`);
process.exit(failed ? 1 : 0);
