// Testy: node app/lib/server-guard.test.js
const G = require('./server-guard.js');

let passed = 0, failed = 0;
function ok(c, msg) { if (c) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.log(`  ✗ ${msg}`); } }

function fake({ user = { id: 'u1' }, members = [], error = null } = {}) {
  return {
    auth: { getUser: async (jwt) => ({ data: { user: jwt === 'good' ? user : null } }) },
    from: () => ({ select: () => ({ limit: async () => ({ data: error ? null : members, error }) }) }),
  };
}
const ev = (t) => ({ headers: t ? { authorization: `Bearer ${t}` } : {} });

(async () => {
  console.log('Kto smie volať serverovú funkciu');
  const admin = { user_id: 'a', role: 'admin', active: true };
  const rec = { user_id: 'u1', role: 'recruiter', active: true };

  let g = await G(fake()).check(ev(''));
  ok(!g.ok && g.status === 401, 'bez prihlásenia 401');
  g = await G(fake()).check(ev('bad'));
  ok(!g.ok && g.status === 401, 'neplatný kľúč 401');
  g = await G(fake({ members: [admin] })).check(ev('good'));
  ok(!g.ok && g.status === 403, 'prihlásený, ale nie je člen (napr. používateľ Adlify) 403');
  g = await G(fake({ members: [admin, { ...rec, active: false }] })).check(ev('good'));
  ok(!g.ok && g.status === 403, 'vypnutý člen 403');
  g = await G(fake({ members: [] })).check(ev('good'));
  ok(g.ok, 'prázdna appka — prvý prihlásený smie (rovnako ako databáza)');
  g = await G(fake({ members: [admin, rec] })).check(ev('good'));
  ok(g.ok && g.member.role === 'recruiter', 'aktívny člen smie');
  g = await G(fake({ members: [admin, rec] })).check(ev('good'), { key: 'invoices' });
  ok(!g.ok && g.status === 403, 'náborár na faktúry nesmie');
  g = await G(fake({ members: [admin, rec] })).check(ev('good'), { admin: true });
  ok(!g.ok && g.status === 403, 'náborár nie je admin');
  g = await G(fake({ members: [admin, { ...rec, role: 'admin' }] })).check(ev('good'), { admin: true, key: 'invoices' });
  ok(g.ok, 'admin smie všetko');
  g = await G(fake({ members: [admin, rec] })).check(ev('good'), { key: ['invoices', 'candidates'] });
  ok(g.ok, 'zoznam práv: stačí jedno z nich (SMS kandidátovi)');
  g = await G(fake({ members: [admin, rec] })).check(ev('good'), { key: ['invoices', 'bank'] });
  ok(!g.ok && g.status === 403, 'zoznam práv: bez žiadneho z nich 403');
  g = await G(fake({ members: [admin, rec] })).check(ev('good'), { key: 'mail' });
  ok(g.ok, 'odvodené právo (mail → Správy) platí aj na serveri');
  ok(await G(fake({ members: [admin, rec] })).memberUser(ev('good'), { key: 'costs' }) === null,
    'memberUser s právom → null, keď ho člen nemá');
  ok(!!await G(fake({ members: [admin, rec] })).memberUser(ev('good'), { key: ['workers'] }),
    'a používateľ, keď ho má');
  g = await G(fake({ error: { message: 'x' } })).check(ev('good'));
  ok(!g.ok && g.status === 503, 'keď sa členovia nedajú prečítať, nepustí');
  ok(await G(fake({ members: [admin] })).memberUser(ev('good')) === null, 'memberUser → null pre nečlena');

  console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
  process.exit(failed ? 1 : 0);
})();
