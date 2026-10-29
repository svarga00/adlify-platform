// ============================================================================
// punds web — testy príjmu formulárov (prihláška, kontakt, dopyt)
//   node web/tests/api.test.js
// ============================================================================
'use strict';

// Odtlačok IP je HMAC s tajomstvom z prostredia — testy si ho nastavia samy.
for (const k of ['IP_HASH_SECRET', 'MAIL_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY']) delete process.env[k];
process.env.IP_HASH_SECRET = 'test-tajomstvo';

const crypto = require('crypto');
const api = require('../api');
const { SITES } = require('../shared/sites');
const { notifier } = require('../notify');

let passed = 0, failed = 0;
const ok = (c, name, detail) => { if (c) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${String(detail).slice(0, 300)}` : ''}`); } };

/** Falošná databáza: drží riadky v pamäti, vie to, čo api.js volá. */
function fakeDb(seed = {}) {
  const T = { danubra_web_submissions: [], danubra_candidates: [], danubra_opportunities: [], danubra_ads: [], ...seed };
  let n = 0;
  const from = (table) => {
    const q = { table, filters: [], op: 'select', opts: {} };
    const rows = () => (T[table] || []).filter((r) => q.filters.every(([k, v, op]) => (op === 'gte' ? r[k] >= v : r[k] === v)));
    const api = {
      select(cols, opts = {}) { if (q.op !== 'insert') q.op = 'select'; q.opts = opts; return api; },
      eq(k, v) { q.filters.push([k, v, 'eq']); return api; },
      gte(k, v) { q.filters.push([k, v, 'gte']); return api; },
      insert(row) { q.op = 'insert'; const r = { id: `id-${++n}`, created_at: new Date().toISOString(), ...row }; (T[table] = T[table] || []).push(r); q.row = r; return api; },
      single() { return Promise.resolve({ data: q.row || rows()[0] || null, error: null }); },
      update(patch) { q.op = 'update'; q.patch = patch; return api; },
      maybeSingle() { return Promise.resolve({ data: rows()[0] || null, error: null }); },
      then(res, rej) {
        if (q.op === 'update') { rows().forEach((r) => Object.assign(r, q.patch)); return Promise.resolve({ data: null, error: null }).then(res, rej); }
        const out = q.op === 'insert' ? { data: q.row, error: null } : (q.opts.head ? { count: rows().length, error: null } : { data: rows(), error: null });
        return Promise.resolve(out).then(res, rej);
      },
    };
    return api;
  };
  return { from, T };
}

const req = (body, o = {}) => ({ method: 'POST', body: JSON.stringify(body), ip: o.ip || '1.2.3.4', origin: o.origin === undefined ? 'https://punds.sk' : o.origin, userAgent: 'test' });

(async () => {
  console.log('Kontrola polí');
  const v1 = api.validate('apply', { name: 'Ján', phone: '+421 900 111 222', consent: true, job: 'zvarac-bremen' });
  ok(v1.ok, 'prihláška s menom, telefónom a súhlasom prejde');
  ok(api.validate('apply', { name: 'Ján', phone: '+421 900 111 222' }).errors.includes('consent'), 'bez súhlasu neprejde');
  ok(api.validate('apply', { name: 'Ján', phone: '123', consent: true }).errors.includes('phone'), 'krátky telefón neprejde');
  ok(api.validate('enquiry', { company: 'GU', name: 'Max', email: 'x', consent: true }).errors.includes('email'), 'dopyt bez platného e-mailu neprejde');
  const v2 = api.validate('enquiry', { company: 'GU Ulm', name: 'Max', email: 'max@gu.de', consent: 'on', trades: ['zvarac', 'hack'], trade: 'trockenbau', headcount: '4 Personen', model: 'werkvertrag' });
  ok(v2.ok && v2.data.trades.join() === 'sadrokarton,zvarac' && v2.data.headcount === 4, 'dopyt: remeslá z adresy aj zo zaškrtnutých, neznáme vyhodí, počet ako číslo', JSON.stringify(v2.data.trades));
  ok(api.startDate('3.11.2026') === '2026-11-03' && api.startDate('11/2026') === '2026-11-01' && api.startDate('ab KW 46') === null, 'začiatok z textu na dátum');
  ok(api.ORIGIN_OK.test('https://punds.sk') && api.ORIGIN_OK.test('https://www.punds.eu') && api.ORIGIN_OK.test('https://adlify-app.netlify.app')
    && !api.ORIGIN_OK.test('https://evil.com') && !api.ORIGIN_OK.test('https://punds.sk.evil.com'), 'formulár len z našich stránok');

  console.log('Prihláška z punds.sk → Kandidáti');
  const db = fakeDb({ danubra_ads: [{ id: 'ad1', title: 'Zvárači Bremen FB', web_title: 'Zvárač MIG/MAG', trade_key: 'zvarac', web_slug: 'zvarac-bremen', plan_id: 'pl1' }] });
  const r1 = await api.handle(SITES.sk, 'apply', req({ name: 'Ján Novák', phone: '+421 900 111 222', email: 'jan@x.sk', note: 'Mám certifikát', consent: true, job: 'zvarac-bremen', lang: 'cz', page: '/punds-sk/cz/nabidky/zvarac-bremen' }), { supabase: db });
  const c = db.T.danubra_candidates[0];
  ok(r1.status === 200 && JSON.parse(r1.body).ok, 'prihláška sa prijme', r1.body);
  ok(c && c.full_name === 'Ján Novák' && c.ad_id === 'ad1' && c.plan_id === 'pl1' && c.profession === 'zvarac' && c.source === 'web'
    && c.language === 'cs' && /Zvárač MIG\/MAG/.test(c.source_detail) && c.status === 'new' && c.consent_at, 'kandidát je pri inzeráte, s remeslom, jazykom a súhlasom', JSON.stringify(c));
  ok(db.T.danubra_web_submissions[0].candidate_id === c.id && !db.T.danubra_web_submissions[0].payload.website, 'odoslanie je zapísané s odkazom na kandidáta');

  console.log('Ochrana');
  const sp = await api.handle(SITES.sk, 'contact', req({ name: 'Bot', phone: '+421900000000', consent: true, website: 'http://spam' }), { supabase: db });
  ok(sp.status === 200 && db.T.danubra_candidates.length === 1 && db.T.danubra_web_submissions.some((x) => x.spam), 'robot (vyplnená pasca) dostane „ok", ale kandidát nevznikne');
  ok((await api.handle(SITES.sk, 'apply', req({}, { origin: 'https://evil.com' }), { supabase: db })).status === 403, 'cudzia stránka je odmietnutá');
  ok((await api.handle(SITES.eu, 'apply', req({}), { supabase: db })).status === 404, 'punds.eu neprijíma prihlášky');
  ok((await api.handle(SITES.sk, 'apply', { method: 'GET' }, { supabase: db })).status === 405, 'len POST');
  const bad = await api.handle(SITES.sk, 'apply', req({ name: '', phone: '1', consent: false }), { supabase: db });
  ok(bad.status === 400 && JSON.parse(bad.body).fields.includes('consent'), 'chybné polia vrátia 400 so zoznamom', bad.body);
  const flood = fakeDb();
  let last;
  for (let i = 0; i < 7; i++) last = await api.handle(SITES.sk, 'contact', req({ name: 'A', phone: '+421900000000', consent: true }, { ip: '9.9.9.9' }), { supabase: flood });
  ok(last.status === 429 && flood.T.danubra_candidates.length === 6, 'najviac 6 odoslaní z jednej adresy za 10 minút', `${last.status} ${flood.T.danubra_candidates.length}`);

  console.log('Odtlačok IP adresy');
  const plain = crypto.createHash('sha256').update('punds-web:1.2.3.4').digest('hex').slice(0, 32);
  const h1 = api.ipHash('1.2.3.4'), h2 = api.ipHash('1.2.3.4', 'iny-kluc');
  ok(h1 && h1 === crypto.createHmac('sha256', 'test-tajomstvo').update('punds-web:ip:1.2.3.4').digest('hex').slice(0, 32) && h1 !== plain && h1 !== h2,
    'odtlačok je HMAC s tajným kľúčom (bez kľúča sa nedá spätne zistiť)');
  ok(api.ipHash('1.2.3.4, 10.0.0.1') === h1 && api.ipHash('') === null, 'berie sa prvá adresa z X-Forwarded-For; bez adresy nič');
  ok(db.T.danubra_web_submissions[0].ip_hash === h1 && !JSON.stringify(db.T.danubra_web_submissions).includes('1.2.3.4'), 'do záznamu ide odtlačok, nie adresa');
  ok(api.ipSecret({ IP_HASH_SECRET: '', MAIL_SECRET: 'm', SUPABASE_SERVICE_ROLE_KEY: 's' }) === 'm' && api.ipSecret({ SUPABASE_SERVICE_ROLE_KEY: 's' }) === 's'
    && api.ipSecret({ IP_HASH_SECRET: '  ' }) === null, 'bez IP_HASH_SECRET iné tajomstvo servera, nikdy prázdny reťazec');
  delete process.env.IP_HASH_SECRET;
  const nos = fakeDb();
  let lastNo;
  for (let i = 0; i < 7; i++) lastNo = await api.handle(SITES.sk, 'contact', req({ name: 'A', phone: '+421900000000', consent: true }, { ip: '8.8.4.4' }), { supabase: nos });
  ok(api.ipHash('8.8.4.4') === null && nos.T.danubra_web_submissions.every((x) => x.ip_hash === null) && lastNo.status === 429 && nos.T.danubra_candidates.length === 6,
    'bez tajného kľúča sa IP neukladá vôbec a limit 6 za 10 minút platí ďalej', `${lastNo.status} ${nos.T.danubra_candidates.length}`);
  process.env.IP_HASH_SECRET = 'test-tajomstvo';

  console.log('Dopyt z punds.eu → Dopyty');
  const db2 = fakeDb();
  const r2 = await api.handle(SITES.eu, 'enquiry', req({ company: 'Musterbau GmbH', name: 'Max Mustermann', email: 'max@musterbau.de', phone: '+49 421 123',
    trades: ['zvarac'], headcount: '2', location: 'Bremen', start: '3.11.2026', model: 'aueg', message: 'Halle 3', consent: true, lang: 'de' }, { origin: 'https://punds.eu' }), { supabase: db2 });
  const o = db2.T.danubra_opportunities[0];
  ok(r2.status === 200 && o && o.company_name === 'Musterbau GmbH' && o.trade_key === 'zvarac' && o.headcount === 2 && o.start_date === '2026-11-03'
    && o.source === 'punds.eu' && o.status === 'new' && /Arbeitnehmerüberlassung/.test(o.brief) && /Schweißen/.test(o.title), 'dopyt sa zapíše s remeslom, počtom, termínom a formou spolupráce', JSON.stringify(o));


  console.log('Automatické e-maily');
  const calls = [];
  const db3 = fakeDb({ danubra_ads: [{ id: 'ad9', title: 'FB', web_title: 'Elektrikár', trade_key: 'elektrikar', web_slug: 'elektrikar-augsburg', city: 'Augsburg', rate_offered: 25, rate_max: 28 }] });
  await api.handle(SITES.sk, 'apply', req({ name: 'Peter Malý', phone: '+421900123456', email: 'p@x.sk', consent: true, job: 'elektrikar-augsburg', lang: 'hu' }),
    { supabase: db3, notify: async (o) => { calls.push(o); return { confirm: true, team: true }; } });
  ok(calls.length === 1 && calls[0].kind === 'apply' && calls[0].ad && calls[0].ad.id === 'ad9' && calls[0].data.lang === 'hu' && calls[0].id === db3.T.danubra_candidates[0].id,
    'po prihláške sa pošle potvrdenie (s ponukou a jazykom)', JSON.stringify(calls[0] && { kind: calls[0].kind, lang: calls[0].data.lang }));
  const db4 = fakeDb();
  const r4 = await api.handle(SITES.sk, 'contact', req({ name: 'A', phone: '+421900000000', consent: true }),
    { supabase: db4, notify: async () => { throw new Error('SMTP padlo'); } });
  ok(r4.status === 200 && db4.T.danubra_candidates.length === 1, 'keď e-mail zlyhá, prihláška je aj tak uložená');

  console.log('Upozornenie tímu a potvrdenie odosielateľovi');
  const mkNotify = (web, contacts = {}) => {
    const sent = [];
    const sb = { from: () => ({ select() { return this; }, limit() { return this; }, maybeSingle: async () => ({ data: { web } }) }) };
    const srv = { mailbox: async (id) => (id === 'mb1' ? { id: 'mb1', email: 'info@punds.sk', active: true, secret_enc: 'x' } : null), password: () => 'heslo' };
    const n = notifier(sb, { srv, content: async () => ({ contacts }), send: async (mb, pass, m) => { sent.push(m); } });
    return { n, sent };
  };
  const apply = { site: SITES.sk, kind: 'apply', data: { name: 'Ján Novák', phone: '+421900111222', email: 'jan@x.sk', lang: 'sk' }, id: 'abcdef12-3456' };
  const off = mkNotify({ confirm: false, mailbox_sk: 'mb1', notify_sk: 'tim@punds.sk' });
  const rOff = await off.n(apply);
  ok(rOff.team && !rOff.confirm && off.sent.length === 1 && off.sent[0].to === 'tim@punds.sk' && /Nová prihláška/.test(off.sent[0].subject),
    'potvrdenie vypnuté: tím dostane upozornenie aj tak, odosielateľ nič', JSON.stringify(rOff));
  const on = mkNotify({ confirm: true, mailbox_sk: 'mb1' }, { sk: { phone1: '+421 911 222 333' }, whatsapp: '+421 944 555 666' });
  const rOn = await on.n(apply);
  const conf = on.sent.find((m) => m.to === 'jan@x.sk');
  ok(rOn.team && rOn.confirm && on.sent.length === 2 && on.sent.some((m) => m.to === 'info@punds.sk'), 'potvrdenie zapnuté: obe správy (tím bez vlastnej adresy na schránku)', JSON.stringify(rOn));
  ok(conf && conf.html.includes('+421 911 222 333') && conf.text.includes('+421 911 222 333') && conf.html.includes('wa.me/421944555666') && !conf.html.includes('523 958'),
    'telefón a WhatsApp v potvrdení sú z Kontaktov v appke');
  const eu = mkNotify({ confirm: true, mailbox_eu: 'mb1' }, { eu: { phone: '+49 421 7777' } });
  await eu.n({ site: SITES.eu, kind: 'enquiry', data: { company: 'GU', name: 'Max', email: 'max@gu.de', lang: 'de', trades: ['zvarac'] }, id: 'x' });
  const ce1 = eu.sent.find((m) => m.to === 'max@gu.de');
  ok(ce1 && ce1.text.includes('+49 421 7777'), 'potvrdenie dopytu: telefón z Kontaktov punds.eu (keď v nastavení e-mailov nie je iný)');
  const none = mkNotify({ confirm: true });
  const rNone = await none.n(apply);
  ok(rNone.skipped === 'bez schránky' && none.sent.length === 0, 'bez zvolenej schránky sa neposiela nič');

  const E = require('../emails');
  for (const l of ['sk', 'cz', 'hu', 'de', 'en']) {
    const m = E.confirmApply({ lang: l, name: 'Ján Novák', job: { title: 'Zvárač', city: 'Bremen', rate: '29–30 €', start: 'Od 3. 11.', image: 'https://x/y.jpg' }, ref: 'AB12CD', assets: 'https://a/web/public' });
    ok(m.subject && /Ján/.test(m.html) && !/undefined|NaN/.test(m.html + m.text) && /punds-mark-white\.png/.test(m.html) && m.text.length > 80, `potvrdenie prihlášky — ${l}`, m.subject);
  }
  const ce = E.confirmEnquiry({ lang: 'de', trades: ['zvarac', 'sadrokarton'], headcount: 2, location: 'Hamburg', start: 'ab KW 46', ref: 'X1', assets: 'https://a/web/public', contact: { phone: '+421 910 523 958', email: 'info@punds.eu' } });
  ok(/Schweißen MIG\/MAG\/TIG, Trockenbau/.test(ce.html) && /2 Personen/.test(ce.html) && /Hamburg/.test(ce.text) && !/undefined/.test(ce.html), 'potvrdenie dopytu po nemecky so súhrnom', ce.subject);
  const tm = E.team({ kind: 'apply', data: { name: 'Ján', phone: '+421', note: 'ahoj', lang: 'sk' }, job: { title: 'Zvárač', city: 'Bremen' }, appUrl: 'https://a/app/' });
  ok(/Nová prihláška z punds\.sk: Ján/.test(tm.subject) && /Zvárač · Bremen/.test(tm.text) && /#\/candidates/.test(tm.text), 'upozornenie pre nás');
  console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`  ✗ test spadol: ${e.stack}`); console.log('\n0 prešlo, 1 zlyhalo'); process.exit(1); });
