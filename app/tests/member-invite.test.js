// ============================================================================
// DANUBRA — pozvánky kolegov (danubra-member-invite): účet, odkaz, stav
// Spustenie:  node app/tests/member-invite.test.js
// ============================================================================
// Bez siete: Supabase je v pamäti (fake-supabase.js), Auth admin API je
// podvrhnuté nižšie, pošta (mail/server.js) tiež. Stráži sa:
//   * smie len prihlásený aktívny administrátor (nie člen bez roly admin,
//     nie vypnutý admin, nie „prázdna appka"),
//   * invite: bez účtu ho založí (bez hesla, e-mail potvrdený) a prepojí;
//     s účtom len prepojí; cudziemu účtu (Adlify) odkaz nevydá,
//   * odkaz vedie do appky s kódom za # a návrat je /app/?heslo=1,
//   * reset len pre prepojený účet, ktorý založila appka,
//   * status nevracia nič tajné, send pošle len náš odkaz a uloží ho bez neho.
// ============================================================================
const Module = require('module');
const path = require('path');
const F = require('./fake-supabase.js');
const P = require('../lib/prihlasenie.js');

process.env.APP_URL = 'https://adlify-app.netlify.app';

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}

// ── Podvrhnuté Auth admin API ───────────────────────────────────────────────
const A = { users: [], calls: [], seq: 0 };
const admin = {
  listUsers: async ({ page = 1, perPage = 50 } = {}) => {
    A.calls.push(['listUsers', page]);
    return { data: { users: A.users.slice((page - 1) * perPage, page * perPage).map(u => JSON.parse(JSON.stringify(u))) }, error: null };
  },
  getUserById: async (id) => {
    const u = A.users.find(x => x.id === id);
    return u ? { data: { user: JSON.parse(JSON.stringify(u)) }, error: null } : { data: { user: null }, error: { message: 'User not found', status: 404 } };
  },
  createUser: async (attrs) => {
    A.calls.push(['createUser', attrs]);
    if (A.users.some(u => u.email.toLowerCase() === String(attrs.email).toLowerCase())) return { data: { user: null }, error: { message: 'A user with this email address has already been registered', status: 422 } };
    const u = { id: `auth-${++A.seq}`, email: attrs.email, app_metadata: { provider: 'email', ...(attrs.app_metadata || {}) },
      user_metadata: attrs.user_metadata || {}, email_confirmed_at: attrs.email_confirm ? new Date().toISOString() : null, last_sign_in_at: null,
      encrypted_password: attrs.password ? 'hash' : '', recovery_token: '' };
    A.users.push(u);
    return { data: { user: JSON.parse(JSON.stringify(u)) }, error: null };
  },
  updateUserById: async (id, attrs) => {
    A.calls.push(['updateUserById', id, attrs]);
    const u = A.users.find(x => x.id === id);
    if (attrs.app_metadata) u.app_metadata = { ...u.app_metadata, ...attrs.app_metadata };
    return { data: { user: u }, error: null };
  },
  generateLink: async (p) => {
    A.calls.push(['generateLink', p]);
    if (A.failLink) return { data: { properties: null, user: null }, error: { message: 'For security purposes, you can only request this after 60 seconds.', status: 429 } };
    const u = A.users.find(x => x.email === p.email);
    u.recovery_token = `hash${A.seq}abcdef0123456789`;
    return { data: { properties: { action_link: `https://eidkljfaeqvvegiponwl.supabase.co/auth/v1/verify?token=${u.recovery_token}&type=recovery`,
      hashed_token: u.recovery_token, email_otp: '864209', redirect_to: p.options.redirectTo, verification_type: 'recovery' }, user: u }, error: null };
  },
};

const mails = [];
const holder = { sb: null };
const proxy = {
  from: (...a) => holder.sb.from(...a), rpc: (...a) => holder.sb.rpc(...a),
  auth: { getUser: (...a) => holder.sb.auth.getUser(...a), admin },
};
const origLoad = Module._load;
Module._load = function (request) {
  if (request === '@supabase/supabase-js') return { createClient: () => proxy };
  if (/mail\/server\.js$/.test(request)) {
    return () => ({
      sendAndStore: async (mb, o) => { if (A.failMail) throw new Error('535 Authentication failed'); mails.push({ mb, o }); return { id: 'mm1' }; },
      smtpError: () => 'Schránka odmietla prihlásenie — skontrolujte heslo v Nastaveniach → Schránky.',
    });
  }
  return origLoad.apply(this, arguments);
};
const fn = require(path.join(__dirname, '..', '..', 'netlify', 'functions', 'danubra-member-invite.js'));

function reset(members, users) {
  A.users = users || []; A.calls = []; A.failLink = false; A.failMail = false; mails.length = 0;
  holder.sb = F.create({
    danubra_members: members || [
      { id: 'm1', user_id: 'u-admin', role: 'admin', active: true, full_name: 'Štefan Varga', email: 'stefan@punds.eu' },
      { id: 'm2', user_id: null, role: 'custom', active: true, full_name: 'Jana Kováčová', email: 'Jana@Punds.eu' },
      { id: 'm3', user_id: null, role: 'custom', active: true, full_name: 'Peter Horák', email: 'peter@punds.eu' },
      { id: 'm4', user_id: 'u-rec', role: 'recruiter', active: true, full_name: 'Nábor', email: 'nabor@punds.eu' },
      { id: 'm5', user_id: 'u-old', role: 'admin', active: false, full_name: 'Starý admin', email: 'old@punds.eu' },
      { id: 'm6', user_id: null, role: 'custom', active: false, full_name: 'Vypnutý', email: 'off@punds.eu' },
    ],
    danubra_mailboxes: [{ id: 'b1', name: 'Info', email: 'info@punds.eu', active: true, created_at: '2026-01-01' }],
    danubra_settings: [{ id: 's1', supplier: { name: 'Partner und Service s. r. o.' } }],
  }, { users: { admin: { id: 'u-admin', email: 'stefan@punds.eu' }, rec: { id: 'u-rec' }, old: { id: 'u-old' }, cudzi: { id: 'u-cudzi' } } });
  return holder.sb;
}
const call = async (body, jwt = 'admin') => {
  const r = await fn.handler({ httpMethod: 'POST', headers: jwt ? { authorization: `Bearer ${jwt}` } : {}, body: JSON.stringify(body) });
  return { code: r.statusCode, raw: r.body, ...JSON.parse(r.body) };
};
const member = (id) => holder.sb.db.danubra_members.find(m => m.id === id);
const authUser = (o) => ({ app_metadata: { provider: 'email' }, user_metadata: {}, last_sign_in_at: null, ...o });

(async () => {
  console.log('Kto smie');
  reset();
  ok((await call({ action: 'status' }, null)).code === 401, 'bez prihlásenia 401');
  ok((await call({ action: 'invite', member_id: 'm2' }, 'rec')).code === 403, 'člen bez roly admin: 403');
  ok((await call({ action: 'invite', member_id: 'm2' }, 'old')).code === 403, 'vypnutý administrátor: 403');
  ok((await call({ action: 'status' }, 'cudzi')).code === 403, 'prihlásený, ale nie je v zozname (napr. z Adlify): 403');
  reset([{ id: 'x', user_id: null, role: 'admin', active: false, email: 'a@b.sk' }]);
  ok((await call({ action: 'status' }, 'cudzi')).code === 403, '„prázdna appka" z nikoho admina nerobí');
  ok(A.calls.length === 0 && mails.length === 0, 'odmietnutý nič nezaložil ani neposlal');
  reset();
  ok((await call({ action: 'bla' })).code === 400, 'neznáma akcia: 400');

  console.log('\nPozvať: bez účtu');
  reset();
  const inv = await call({ action: 'invite', member_id: 'm2' });
  const created = A.calls.find(c => c[0] === 'createUser');
  ok(inv.code === 200 && inv.ok && inv.created === true, 'pozvánka prešla a účet je založený', inv.raw);
  ok(created && created[1].email === 'Jana@Punds.eu' && created[1].email_confirm === true && !('password' in created[1])
    && created[1].user_metadata.full_name === 'Jana Kováčová' && created[1].app_metadata.danubra_invited === true,
  'účet bez hesla, e-mail potvrdený, meno v user_metadata, značka „založila appka"', JSON.stringify(created && created[1]));
  ok(member('m2').user_id === A.users[0].id, 'človek je prepojený s účtom (user_id)');
  const gl = A.calls.find(c => c[0] === 'generateLink');
  ok(gl && gl[1].type === 'recovery' && gl[1].options.redirectTo === 'https://adlify-app.netlify.app/app/?heslo=1', 'odkaz typu recovery, návrat na /app/?heslo=1', JSON.stringify(gl && gl[1]));
  ok(inv.link === P.setLink('https://adlify-app.netlify.app', A.users[0].recovery_token) && inv.link.startsWith('https://adlify-app.netlify.app/app/?heslo=1#k='),
    'admin dostane náš odkaz do appky (kód za #), nie odkaz zo Supabase', inv.link);
  ok(inv.email === 'Jana@Punds.eu' && /obmedzený čas/.test(inv.expires_hint) && inv.app_url === 'https://adlify-app.netlify.app/app/', 'vráti e-mail, upozornenie na platnosť a adresu appky');
  ok(!/supabase\.co|verify\?token|email_otp|864209|password/.test(inv.raw), 'odpoveď neobsahuje odkaz Supabase, kód z e-mailu ani heslo', inv.raw);
  ok(A.users[0].app_metadata.danubra_link_at, 'zapíše sa, kedy dostal odkaz');
  ok(mails.length === 0, 'nič sa neposlalo samo');
  const znova = await call({ action: 'invite', member_id: 'm2' });
  ok(znova.code === 429, 'hneď druhý odkaz pre toho istého: počkajte pár sekúnd');
  ok(A.calls.filter(c => c[0] === 'createUser').length === 1, 'účet sa druhýkrát nezakladá');

  console.log('\nPozvať: účet už existuje');
  reset(null, [authUser({ id: 'auth-p', email: 'peter@punds.eu', app_metadata: { provider: 'email', danubra_invited: true } })]);
  const ex = await call({ action: 'invite', member_id: 'm3' });
  ok(ex.code === 200 && ex.link && !A.calls.some(c => c[0] === 'createUser') && member('m3').user_id === 'auth-p',
    'existujúci účet (založený appkou): len prepojí, nezakladá, dá odkaz', ex.raw);
  reset(null, [authUser({ id: 'auth-adlify', email: 'jana@punds.eu', last_sign_in_at: '2026-10-01T08:00:00Z' })]);
  const ad = await call({ action: 'invite', member_id: 'm2' });
  ok(ad.code === 200 && ad.link === null && ad.existing && member('m2').user_id === 'auth-adlify' && /Zabudli ste heslo/.test(ad.message),
    'cudzí účet (Adlify, iné veľké písmená v e-maile): prepojí, odkaz na heslo nevydá', ad.raw);
  ok(!A.calls.some(c => c[0] === 'generateLink' || c[0] === 'createUser'), 'cudziemu účtu sa odkaz ani nevytvorí');
  reset(null, [authUser({ id: 'u-rec', email: 'peter@punds.eu', app_metadata: { danubra_invited: true } })]);
  const taken = await call({ action: 'invite', member_id: 'm3' });
  ok(taken.code === 409 && /Nábor/.test(taken.error) && member('m3').user_id === null, 'účet patrí inému človeku v zozname: 409, nič sa neprepojí', taken.raw);
  reset();
  ok((await call({ action: 'invite', member_id: 'm6' })).code === 400, 'vypnutý človek sa pozvať nedá');
  ok((await call({ action: 'invite', member_id: 'nie-je' })).code === 404, 'neznámy človek: 404');
  holder.sb.db.danubra_members.push({ id: 'm7', user_id: null, active: true, full_name: 'Bez mailu', email: null });
  ok((await call({ action: 'invite', member_id: 'm7' })).code === 400, 'bez e-mailu: 400');
  reset(); A.failLink = true;
  const lim = await call({ action: 'invite', member_id: 'm3' });
  ok(lim.code === 429 && /60 sekúnd/.test(lim.error), 'limit Supabase sa povie po slovensky', lim.raw);

  console.log('\nNový odkaz na heslo');
  reset();
  const r1 = await call({ action: 'reset', member_id: 'm2' });
  ok(r1.code === 400 && /Pozvať do appky/.test(r1.error), 'bez prepojeného účtu: najprv pozvať', r1.raw);
  reset([
    { id: 'm1', user_id: 'u-admin', role: 'admin', active: true, full_name: 'Štefan', email: 'stefan@punds.eu' },
    { id: 'm2', user_id: 'auth-j', role: 'custom', active: true, full_name: 'Jana', email: 'jana@punds.eu' },
    { id: 'm3', user_id: 'auth-x', role: 'custom', active: true, full_name: 'Cudzí', email: 'x@punds.eu' },
    { id: 'm4', user_id: 'auth-zmazany', role: 'custom', active: true, full_name: 'Zmazaný', email: 'z@punds.eu' },
  ], [
    authUser({ id: 'auth-j', email: 'jana@punds.eu', app_metadata: { danubra_invited: true, danubra_link_at: '2026-01-01T00:00:00Z' }, last_sign_in_at: '2026-11-01T08:00:00Z' }),
    authUser({ id: 'auth-x', email: 'x@punds.eu' }),
  ]);
  const r2 = await call({ action: 'reset', member_id: 'm2' });
  ok(r2.code === 200 && r2.link && r2.link.includes('#k=') && A.calls.some(c => c[0] === 'generateLink' && c[1].email === 'jana@punds.eu'), 'prepojený účet: nový odkaz', r2.raw);
  const r3 = await call({ action: 'reset', member_id: 'm3' });
  ok(r3.code === 409 && /Zabudli ste heslo/.test(r3.error), 'cudzí účet: odkaz z bezpečnosti nevydá', r3.raw);
  ok((await call({ action: 'reset', member_id: 'm4' })).code === 404, 'účet medzitým zmizol: 404 (pozvať znova)');

  console.log('\nStav');
  reset(null, [
    authUser({ id: 'u-admin', email: 'stefan@punds.eu', last_sign_in_at: '2026-11-05T07:00:00Z', phone: '+421900111222', confirmation_token: 'tajne-1', encrypted_password: 'tajne-2' }),
    authUser({ id: 'auth-j', email: 'jana@punds.eu', app_metadata: { danubra_invited: true, danubra_link_at: '2026-11-04T09:00:00Z' }, recovery_token: 'tajne-3' }),
  ]);
  member('m2').user_id = 'auth-j';
  const st = await call({ action: 'status' });
  const by = Object.fromEntries((st.members || []).map(x => [x.member_id, x]));
  ok(st.code === 200 && st.members.length === 6, 'stav pre každého v zozname', st.raw.slice(0, 200));
  ok(by.m1.state === 'active' && by.m1.last_sign_in_at === '2026-11-05T07:00:00Z' && by.m1.linked, 'admin: Aktívny, posledné prihlásenie');
  ok(by.m2.state === 'invited' && by.m2.invited_at === '2026-11-04T09:00:00Z' && by.m2.has_account, 'Jana: Pozvaný (čaká na heslo)');
  ok(by.m3.state === 'none' && !by.m3.has_account, 'Peter: Nemá účet');
  ok(!/tajne|\+421|encrypted|token|app_metadata|user_metadata|hash/.test(st.raw), 'stav neobsahuje heslá, kódy, telefón ani metadáta', st.raw);
  ok(JSON.stringify(Object.keys(by.m1).sort()) === JSON.stringify(['external', 'has_account', 'invited_at', 'last_sign_in_at', 'linked', 'member_id', 'password_set_at', 'pending', 'state']),
    'len vybrané polia', Object.keys(by.m1).join(','));

  console.log('\nPoslať e-mailom');
  reset();
  const link = (await call({ action: 'invite', member_id: 'm2' })).link;
  ok((await call({ action: 'send', member_id: 'm2', link: 'https://zly.sk/x' })).code === 400, 'cudzí odkaz sa neposiela');
  ok((await call({ action: 'send', member_id: 'm2', link: `${link}"><script>` })).code === 400, 'pokazený odkaz sa neposiela');
  const sent = await call({ action: 'send', member_id: 'm2', link });
  const m = mails[0];
  ok(sent.code === 200 && sent.sent_to === 'Jana@Punds.eu' && sent.mailbox === 'info@punds.eu', 'odíde zo schránky firmy človeku z appky', sent.raw);
  ok(m && m.o.to[0].address === 'Jana@Punds.eu' && m.o.text.includes(link) && /Dobrý deň, Jana Kováčová/.test(m.o.text) && /S pozdravom\nŠtefan Varga/.test(m.o.text),
    'e-mail: oslovenie, odkaz, podpis admina', m && m.o.text);
  ok(m && m.o.subject === 'Prístup do firemnej appky — Partner und Service s. r. o.', 'predmet s názvom firmy z Nastavení', m && m.o.subject);
  ok(m && !m.o.store.text_body.includes('#k=') && m.o.store.text_body.includes('neukladá'), 'do Správ sa uloží text bez odkazu');
  A.failMail = true;
  const zle = await call({ action: 'send', member_id: 'm2', link });
  ok(zle.code === 502 && /Schránky/.test(zle.error), 'chyba schránky po slovensky');

  console.log(`\n${passed} prešlo, ${failed} padlo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`  ✗ test spadol: ${e.stack}`); console.log('\n0 prešlo, 1 padlo'); process.exit(1); });
