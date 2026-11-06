// ============================================================================
// DANUBRA — SuperFaktúra: denný limit požiadaviek (migrácia 093)
// Spustenie:  node app/tests/sf-limit.test.js
// ============================================================================
// Účet SuperFaktúry má 1000 požiadaviek na deň. Test stráži, že appka:
//   * počíta každú požiadavku, ktorá naozaj odíde (aj opakovaný pokus),
//     a rezervuje ju PRED odoslaním,
//   * synchronizácii nedá viac než jej rozpočet a vystavovaniu vždy nechá
//     rezervu, a pri tvrdom strope neodošle nič,
//   * na vyčerpaný rozpočet sa neopakuje,
//   * počíta po dňoch v Europe/Bratislava (nie UTC),
//   * pri synchronizácii všetkých preskočí čerstvo synchronizované a číta
//     zoznam po 100 dokladoch (stránkovanie), view len keď treba,
//   * z cronu synchronizuje len raz za deň,
//   * v `status` ukáže počítadlo, ale nič tajné.
// Bez siete a databázy: SuperFaktúra je falošný fetch, databáza je
// fake-supabase.js s RPC počítadla (rovnaké pravidlá ako SQL v 093).
// ============================================================================
const Module = require('module');
const fs = require('fs');
const path = require('path');
const F = require('./fake-supabase.js');
const Budget = require('../lib/billing/sf-budget.js');
const SF = require('../lib/billing/superfaktura.js');
const { createService } = require('../lib/billing/sf-service.js');

const KEY = 'tajny-kluc-limit-456';
const MAIL = 'fakturacia@punds.eu';
const ENV = { SF_EMAIL: MAIL, SF_API_KEY: KEY, SF_RETRY_DELAY_MS: '0' };

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}\n    čakal som: ${e}\n    dostal:    ${a}`); }
}
function ok(c, msg, extra) { if (c) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.log(`  ✗ ${msg}${extra ? '\n    ' + extra : ''}`); } }

// ── Falošná SuperFaktúra ────────────────────────────────────────────────────
let calls = [];
let routes = [];
const respond = (status, body, headers) => ({
  ok: status >= 200 && status < 300, status,
  headers: headers ? new Headers(headers) : undefined,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  arrayBuffer: async () => { const b = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); },
});
const fetch = async (url, opt = {}) => {
  calls.push({ url, method: opt.method, body: opt.body ? JSON.parse(opt.body) : null });
  for (const [match, fn] of routes) {
    if (typeof match === 'string' ? url.includes(match) : match.test(url)) return fn(url);
  }
  return respond(404, { error: 1, error_message: 'nenájdené' });
};
const sfCalls = (part) => calls.filter(c => c.url.includes(part));

// ── Databáza ────────────────────────────────────────────────────────────────
const db = {};
const sb = F.create(db, { rpc: { ...F.sfUsageRpc() } });
const PARTNER = { id: 'p1', name: 'GU Ulm GmbH', ust_idnr: 'DE287451936', country: 'DE', email: 'bau@gu-ulm.de', invoice_language: 'de',
  sf_client_id: 55, sf_client_env: 'sandbox' };
const APPROVED = { id: 'i1', kind: 'invoice', status: 'approved', total: 100, amount_net: 100, vat_regime: 'reverse_charge', currency: 'EUR',
  invoice_number: '2026042', issue_date: '2026-11-02', due_date: '2026-12-02', approved_by: 'u1', approved_at: '2026-11-02T08:00:00Z',
  partner_id: 'p1', sf_invoice_id: null, sf_error: null, sf_environment: null };
const SENT = { status: 'sent', sf_invoice_id: 777, sf_environment: 'sandbox', sf_check: 'ok', sf_token: 'tk', sent_at: '2026-11-03' };

let clockAt = new Date('2026-11-06T09:00:00Z');
function reset(invs = [{}], usage = null) {
  db.danubra_invoices = invs.map((x, i) => ({ ...APPROVED, id: `i${i + 1}`, ...x }));
  db.danubra_partners = [{ ...PARTNER }];
  db.danubra_subcontracts = []; db.danubra_periods = []; db.danubra_invoice_items = [];
  db.danubra_settings = [{ id: 's1', superfaktura: {}, supplier: { iban: 'SK3112000000198742637541' } }];
  db.danubra_activities = []; db.danubra_tasks = []; db.danubra_archive = []; db.danubra_bank_transactions = []; db.danubra_compliance = [];
  db.danubra_sf_usage = usage ? [{ day: Budget.todaySk(clockAt), used: 0, by_kind: {}, sf_used: null, blocked_at: null, cron_sync_at: null, ...usage }] : [];
  calls = []; routes = [];
}
const svc = (env = {}) => createService({ supabase: sb, fetch, env: { ...ENV, ...env }, sleep: async () => {}, clock: () => clockAt });
const usageRow = (day = Budget.todaySk(clockAt)) => (db.danubra_sf_usage || []).find(r => r.day === day) || {};
const inv = (id = 'i1') => db.danubra_invoices.find(x => x.id === id);
const VIEW = (id, extra = {}) => respond(200, { Invoice: { id, total: '100.00', amount_paid: '0.00', ...extra } });

console.log('SuperFaktúra — denný limit požiadaviek');

(async () => {
  // ── Limity z premenných prostredia ────────────────────────────────────────
  {
    const L = Budget.limits({});
    eq([L.limit, L.margin, L.hard, L.sync, L.writeReserve, L.syncCap], [1000, 50, 950, 300, 100, 850],
      'predvolene: limit 1000, strop 950, synchronizácia 300, rezerva pre zápis 100');
    const M = Budget.limits({ SF_DAILY_LIMIT: '3000', SF_SAFETY_MARGIN: '100', SF_SYNC_BUDGET: '1000', SF_WRITE_RESERVE: '200' });
    eq([M.limit, M.hard, M.sync, M.syncCap], [3000, 2900, 1000, 2700], 'nastaviteľné premennými SF_DAILY_LIMIT, SF_SAFETY_MARGIN, SF_SYNC_BUDGET, SF_WRITE_RESERVE');
    const Z = Budget.limits({ SF_DAILY_LIMIT: 'abc', SF_SYNC_BUDGET: '-5', SF_SAFETY_MARGIN: '' });
    eq([Z.limit, Z.sync, Z.margin], [1000, 300, 50], 'nezmysel v premennej → predvolená hodnota');
  }

  // ── Počíta sa každá požiadavka, aj opakovaný pokus ────────────────────────
  {
    reset([SENT]);
    let n = 0;
    routes.push(['/invoices/view/777.json', () => (++n < 3 ? respond(503, 'Service Unavailable') : VIEW(777))]);
    const s = svc();
    const r = await s.sync('i1');
    eq([r.status, sfCalls('/invoices/view').length], [200, 3], 'synchronizácia jednej faktúry prešla na tretí pokus');
    eq([usageRow().used, usageRow().by_kind.sync, s.stats.sent], [3, 3, 3], 'počítadlo: 3 požiadavky (aj dva neúspešné pokusy), druh sync');
    ok(!!inv().sf_synced_at, 'zapíše sa, kedy bola faktúra synchronizovaná');
  }
  {
    reset([SENT]);
    routes.push(['/invoices/view/777.json', () => VIEW(777)]);
    await svc().sync('i1');
    eq([sfCalls('/invoices/view').length, usageRow().used], [1, 1], 'tlačidlo „Synchronizovať" pri jednej faktúre = 1 požiadavka');
  }

  // ── Rezerva pred odoslaním; na vyčerpaný rozpočet sa neopakuje ────────────
  {
    reset([SENT], { used: 299, by_kind: { sync: 299 } });
    routes.push(['/invoices/view/777.json', () => respond(503, 'Service Unavailable')]);
    const r = await svc().sync('i1');
    eq([r.status, r.body.code], [429, 'budget'], 'rozpočet sa minul počas opakovania → 429, code budget');
    eq(sfCalls('/invoices/view').length, 1, 'odišiel len pokus, na ktorý ešte bola rezerva — ďalší nie');
    eq(usageRow().by_kind.sync, 300, 'synchronizácia sa zastavila presne na 300');
    ok(/Dnešný limit požiadaviek na SuperFaktúru je vyčerpaný \(300 z 1000\)\. Synchronizácia pokračuje zajtra; vystavovanie a odosielanie má vyhradenú rezervu\./.test(r.body.error),
      'veta po slovensky: koľko z koľko, synchronizácia zajtra, rezerva na vystavovanie', r.body.error);
  }
  {
    reset([SENT], { used: 300, by_kind: { sync: 300 } });
    routes.push(['/invoices/view/777.json', () => VIEW(777)]);
    const r = await svc().sync('i1');
    eq([r.status, r.body.code, calls.length], [429, 'budget', 0], 'vyčerpaná synchronizácia → do SuperFaktúry nejde nič');
  }

  // ── Vystavenie má rezervu, ktorú synchronizácia nezje ─────────────────────
  {
    reset([{}], { used: 300, by_kind: { sync: 300 } });
    routes.push(['/invoices/create', () => respond(200, { error: 0, data: { Invoice: { id: 901, token: 't', invoice_no_formatted: '2026042', total: '100.00' } } })]);
    const r = await svc().issue('i1');
    eq([r.status, r.body.sf_invoice_id, inv().status], [200, 901, 'issued'], 'pri vyčerpanej synchronizácii sa faktúra vystaví');
    eq([usageRow().used, usageRow().by_kind.write], [301, 1], 'vystavenie sa ráta do rezervy (write)');
  }
  {
    // Celkovo 850 (synchronizácia sama len 100): synchronizácia nesmie siahnuť na posledných 100 pod stropom.
    reset([SENT], { used: 850, by_kind: { sync: 100, write: 750 } });
    routes.push(['/invoices/view/777.json', () => VIEW(777)]);
    const r = await svc().sync('i1');
    eq([r.status, r.body.code, calls.length], [429, 'budget', 0], 'synchronizácia nesiahne na rezervu pre vystavovanie (850 z 950)');
    const st = await svc().usage();
    eq([st.used, st.remaining, st.sync_remaining], [850, 100, 0], 'stav: zostáva 100 na vystavovanie, synchronizácii 0');
  }

  // ── Tvrdý strop: nič neodíde, faktúra zostane schválená ───────────────────
  {
    reset([{}], { used: 950, by_kind: { sync: 300, write: 650 } });
    routes.push(['/invoices/create', () => respond(200, { error: 0, data: { Invoice: { id: 1 } } })]);
    const r = await svc().issue('i1');
    eq([r.status, r.body.code, calls.length], [429, 'budget', 0], 'strop 950 → vystavenie sa nepošle');
    ok(/vyčerpaný \(950 z 1000\)\. Vystavenie skúste zajtra\./.test(r.body.error), 'veta: … vystavenie skúste zajtra', r.body.error);
    ok(inv().status === 'approved' && !String(inv().sf_error).startsWith('NEISTÉ') && !inv().sf_invoice_id,
      'faktúra zostala schválená, nie je „neistá" — zajtra sa dá vystaviť');
    eq(usageRow().used, 950, 'odmietnutá rezerva sa nezapočíta');
  }
  {
    // Posledná požiadavka padne na hľadanie odberateľa — doklad sa už nezaloží.
    reset([{}], { used: 949, by_kind: { write: 949 } });
    db.danubra_partners[0].sf_client_id = null;
    routes.push(['/clients/index.json', () => respond(200, { items: [] })]);
    routes.push(['/clients/create', () => respond(200, { error: 0, data: { Client: { id: 5 } } })]);
    routes.push(['/invoices/create', () => respond(200, { error: 0, data: { Invoice: { id: 1 } } })]);
    const r = await svc().issue('i1');
    eq([r.body.code, sfCalls('/clients/index').length, sfCalls('/clients/create').length, sfCalls('/invoices/create').length], ['budget', 1, 0, 0],
      'strop počas vystavenia: odberateľ sa hľadal, ale nezaloží sa ani doklad');
    eq(inv().status, 'approved', 'faktúra zostala schválená');
  }
  {
    reset([{ status: 'issued', sf_invoice_id: 777, sf_environment: 'sandbox', sf_check: 'ok' }], { used: 950 });
    routes.push(['/invoices/send', () => respond(200, { error: 0 })]);
    const r = await svc().send('i1');
    ok(r.status === 429 && /Odoslanie skúste zajtra/.test(r.body.error) && calls.length === 0, 'odoslanie pri strope: neodíde, veta „Odoslanie skúste zajtra"', r.body.error);
  }

  // ── PDF: na odoslanie z rezervy, inak z rozpočtu synchronizácie ───────────
  {
    const PDF = Buffer.from('%PDF-1.4\n%x\n');
    reset([{ status: 'issued', sf_invoice_id: 777, sf_token: 'tok', sf_environment: 'sandbox' }], { used: 300, by_kind: { sync: 300 } });
    sb.storage = { from: () => ({ upload: async () => ({ error: null }), createSignedUrl: async (p) => ({ data: { signedUrl: `https://s/${p}` }, error: null }) }) };
    routes.push(['/invoices/pdf/777', () => respond(200, PDF)]);
    const a = await svc().pdf('i1');
    eq([a.status, a.body.code], [429, 'budget'], 'PDF na prezretie pri vyčerpanej synchronizácii nie');
    const b = await svc().pdf('i1', { purpose: 'send' });
    eq([b.status, usageRow().by_kind.write], [200, 1], 'PDF na odoslanie z našej schránky ide z rezervy na odosielanie');
  }

  // ── Počítadlo SuperFaktúry (hlavičky X-RateLimit-*) ───────────────────────
  {
    reset([{}]);
    routes.push(['/users/getUserCompaniesData', () => respond(200, [{ Company: { id: 1, name: 'PUNDS' } }],
      { 'X-RateLimit-DailyLimit': '1000', 'X-RateLimit-DailyRemaining': '40', 'X-RateLimit-DailyReset': '07.11.2026 00:00:00',
        'X-RateLimit-MonthlyRemaining': '20000' })]);
    const r = await svc().ping();
    eq([r.status, usageRow().used, usageRow().sf_used, usageRow().sf_reset], [200, 1, 960, '07.11.2026 00:00:00'],
      'SuperFaktúra hlási zostatok 40 → zapíše sa jej počet (960) a čas vynulovania');
    const again = await svc().ping();
    eq([again.status, again.body.code, calls.length], [429, 'budget', 1], 'platí prísnejšie počítadlo: ďalší test spojenia už neodíde');
  }
  {
    reset([{}]);
    routes.push(['/users/getUserCompaniesData', () => respond(200, [], { 'X-RateLimit-DailyRemaining': '500', 'X-RateLimit-MonthlyRemaining': '30' })]);
    await svc().ping();
    eq(usageRow().sf_used, 970, 'mesačný zostatok menší než denný → platí mesačný');
  }
  {
    reset([SENT]);
    routes.push(['/invoices/view/777.json', () => respond(429, { error: 1, error_message: 'You have exceeded a daily limit of 1000 API requests. You have already made 1000 requests today.' },
      { 'X-RateLimit-Message': 'You have exceeded a daily limit of 1000 API requests.', 'X-RateLimit-DailyRemaining': '0' })]);
    const r = await svc().sync('i1');
    eq([r.status, r.body.code, sfCalls('/invoices/view').length], [429, 'budget', 1], 'SuperFaktúra hlási prekročený limit → budget, bez opakovania');
    ok(!!usageRow().blocked_at, 'deň sa zablokuje — do polnoci sa nič neposiela');
    routes = [['/invoices/view/777.json', () => VIEW(777)]];
    const b = await svc().sync('i1');
    eq([b.body.code, sfCalls('/invoices/view').length], ['budget', 1], 'ďalšia požiadavka v ten deň neodíde');
  }
  {
    reset([SENT]);
    routes.push(['/invoices/view/777.json', () => respond(200, { error: 1, error_message: 'You have exceeded a daily limit of 1000 API requests.' })]);
    const r = await svc().sync('i1');
    eq([r.body.code, sfCalls('/invoices/view').length], ['budget', 1], 'veta o prekročení limitu v tele odpovede → budget, bez opakovania');
  }

  // ── Počítadlo nedostupné → nič neodíde ────────────────────────────────────
  {
    reset([{}]);
    const bez = F.create(db, { rpc: {} });
    routes.push(['/users/getUserCompaniesData', () => respond(200, [])]);
    const r = await createService({ supabase: bez, fetch, env: ENV, sleep: async () => {} }).ping();
    eq([r.status, r.body.code, calls.length], [429, 'budget', 0], 'bez migrácie 093 (RPC chýba) sa do SuperFaktúry nevolá');
    ok(/Počítadlo požiadaviek na SuperFaktúru nie je dostupné/.test(r.body.error) && /093/.test(r.body.hint), 'a povie prečo (migrácia 093)', r.body.hint);
  }

  // ── Deň podľa Bratislavy ──────────────────────────────────────────────────
  {
    eq(Budget.todaySk(new Date('2026-11-06T22:59:00Z')), '2026-11-06', '23:59 v Bratislave (zima, UTC+1) je ešte 6. 11.');
    eq(Budget.todaySk(new Date('2026-11-06T23:01:00Z')), '2026-11-07', '00:01 v Bratislave je už 7. 11. (v UTC ešte 6. 11.)');
    eq(Budget.todaySk(new Date('2026-07-01T22:30:00Z')), '2026-07-02', 'v lete (UTC+2) sa deň mení o 22:00 UTC');
    clockAt = new Date('2026-11-06T22:59:00Z');
    reset([SENT], { used: 950, by_kind: { sync: 300, write: 650 } });
    routes.push(['/invoices/view/777.json', () => VIEW(777)]);
    eq((await svc().sync('i1')).body.code, 'budget', 'o 23:59 je dnešný limit vyčerpaný');
    clockAt = new Date('2026-11-06T23:01:00Z');
    const r = await svc().sync('i1');
    eq([r.status, usageRow('2026-11-07').used, usageRow('2026-11-06').used], [200, 1, 950], 'o 00:01 (Bratislava) sa počíta nový deň');
    clockAt = new Date('2026-11-06T09:00:00Z');
  }

  // ── Synchronizácia všetkých: preskočí čerstvé, číta zoznam po stranách ────
  const H = (h) => new Date(clockAt.getTime() - h * 3600 * 1000).toISOString();
  const listItem = (id, extra = {}) => ({ Invoice: { id: String(id), invoice_no_formatted: `N${id}`, amount_paid: '0.00', due: '2026-12-31', status: '1', ...extra },
    Summary: { invoice_total: 100 }, InvoicePayment: [], InvoiceEmail: [] });
  {
    reset([
      { ...SENT, sf_invoice_id: 801, issue_date: '2026-10-01', sf_synced_at: H(2) },
      { ...SENT, sf_invoice_id: 802, issue_date: '2026-09-15', sf_synced_at: H(30) },
      { ...SENT, sf_invoice_id: 803, issue_date: '2026-11-01', sf_synced_at: null },
      { ...SENT, sf_invoice_id: 804, issue_date: '2026-10-20', sf_synced_at: H(25) },
    ]);
    routes.push([/\/invoices\/index\.json\/.*page:1\//, () => respond(200, { itemCount: 250, pageCount: 3, page: 1, perPage: 100,
      items: [listItem(990), listItem(803, { amount_paid: '100.00', status: '3' }), listItem(802)] })]);
    routes.push([/\/invoices\/index\.json\/.*page:2\//, () => respond(200, { itemCount: 250, pageCount: 3, page: 2, perPage: 100,
      items: [listItem(804), listItem(801)] })]);
    routes.push([/\/invoices\/index\.json\/.*page:3\//, () => respond(200, { pageCount: 3, page: 3, items: [] })]);
    const s = svc();
    const r = await s.syncAll({});
    const b = r.body;
    eq([b.checked, b.skipped_recent, b.paid, b.pages, b.views, b.requests], [3, 1, 1, 2, 0, 2],
      'preskočí faktúru synchronizovanú pred 2 h; 3 ostatné z 2 strán zoznamu = 2 požiadavky, žiadny view');
    eq(sfCalls('/invoices/index.json').length, 2, 'tretia strana sa nečíta — všetky hľadané sa našli');
    const u = sfCalls('/invoices/index.json')[0].url;
    ok(/listinfo:1\/per_page:100\/page:1\/type:regular\/created:3\/created_since:2026-09-15\/created_to:2026-11-06/.test(u),
      'zoznam: 100 na stranu, len faktúry, od najstaršieho vystavenia, ktoré treba', u);
    eq(sfCalls('/invoices/view').length, 0, 'jednotlivé /invoices/view sa nevolali');
    eq([inv('i3').status, inv('i3').sf_status], ['paid', 'paid'], 'plná úhrada zo zoznamu → zaplatená');
    eq(inv('i1').sf_synced_at, H(2), 'čerstvo synchronizovaná faktúra sa nezmenila');
    ok(b.usage && b.usage.sync_used === 2 && b.usage.used === 2, 'výsledok obsahuje dnešné počítadlo');

    const f = await svc().syncAll({ force: true });
    // i3 je už zaplatená na oboch stranách — tá sa nesynchronizuje vôbec.
    eq([f.body.skipped_recent, f.body.checked, f.body.views], [0, 3, 0], 'force: aj čerstvo synchronizované (zaplatená na oboch stranách nie)');
    const second = await svc().syncAll({});
    eq([second.body.checked, second.body.skipped_recent, second.body.requests], [0, 3, 0], 'hneď druhý beh: všetko čerstvé → 0 požiadaviek');
  }
  {
    // Doklad v zozname nie je (alebo bez sumy) → view len preň.
    reset([{ ...SENT, sf_invoice_id: 811 }, { ...SENT, sf_invoice_id: 812 }]);
    routes.push(['/invoices/index.json', () => respond(200, { pageCount: 1, page: 1, items: [listItem(811)] })]);
    routes.push(['/invoices/view/812.json', () => VIEW(812)]);
    const r = await svc().syncAll({});
    eq([r.body.checked, r.body.pages, r.body.views, r.body.requests], [2, 1, 1, 2], 'chýbajúci v zozname sa dočíta cez view (1 navyše)');
  }
  {
    // Rozpočet synchronizácie: zostáva 1 požiadavka.
    reset([{ ...SENT, sf_invoice_id: 821 }, { ...SENT, sf_invoice_id: 822 }, { ...SENT, sf_invoice_id: 823 }], { used: 299, by_kind: { sync: 299 } });
    routes.push([/page:1\//, () => respond(200, { pageCount: 2, page: 1, items: [listItem(821)] })]);
    routes.push([/page:2\//, () => respond(200, { pageCount: 2, page: 2, items: [listItem(822), listItem(823)] })]);
    const r = await svc().syncAll({});
    eq([r.status, r.body.checked, r.body.pending, r.body.requests, r.body.budget_stopped], [200, 1, 2, 1, true],
      'zostala 1 požiadavka: prvá strana sa spracuje, zvyšok počká na zajtra');
    ok(/Synchronizácia pokračuje zajtra/.test(r.body.message), 'a povie to', r.body.message);
    eq(sfCalls('/invoices/view').length, 0, 'bez rozpočtu sa nečíta ani po jednom');
    const z = await svc().syncAll({});
    eq([z.status, z.body.code, z.body.pending, calls.length], [429, 'budget', 2, 1], 'vyčerpaný rozpočet hneď na začiatku → 429 budget, nič neodíde');
  }
  {
    // Najdlhšie nesynchronizované idú prvé (keď rozpočet nestačí na všetky).
    reset([{ ...SENT, sf_invoice_id: 831, sf_synced_at: H(21) }, { ...SENT, sf_invoice_id: 832, sf_synced_at: null }, { ...SENT, sf_invoice_id: 833, sf_synced_at: H(48) }],
      { used: 299, by_kind: { sync: 299 } });
    const r = await svc().syncAll({});   // zoznam nie je (404) → view, rozpočet na jeden
    eq([r.body.checked, r.body.pending, sfCalls('/invoices/view').length], [0, 3, 0], 'zoznam 404 zjedol posledný kus rozpočtu → nič ďalšie');
    reset([{ ...SENT, sf_invoice_id: 831, sf_synced_at: H(21) }, { ...SENT, sf_invoice_id: 832, sf_synced_at: null }, { ...SENT, sf_invoice_id: 833, sf_synced_at: H(48) }],
      { used: 298, by_kind: { sync: 298 } });
    routes.push(['/invoices/view/', (u) => VIEW(Number(u.match(/view\/(\d+)/)[1]))]);
    await svc().syncAll({});
    eq(sfCalls('/invoices/view').map(c => c.url.match(/view\/(\d+)/)[1]), ['832'], 'prvá na rade je nikdy nesynchronizovaná');
  }

  // ── readList / readInvoice v tvare zoznamu (dokumentácia SuperFaktúry) ─────
  {
    const L = SF.readList({ itemCount: 2, pageCount: 2, page: 1, perPage: 1, items: [
      { '0': { to_pay: '12.000000', total: '12.00' }, Invoice: { id: '1', amount: '10.00', amount_paid: '0.00', due: '2050-01-01',
        invoice_no_formatted: '2020001', status: '1', token: 'c3b05c50' }, InvoiceEmail: [], InvoicePayment: [], Summary: { invoice_total: 12 } }] });
    eq([L.page, L.pageCount, L.items.length, L.items[0].id, L.items[0].totalCents, L.items[0].paidCents, L.items[0].number],
      [1, 2, 1, 1, 1200, 0, '2020001'], 'zoznam: suma zo Summary.invoice_total, úhrada z Invoice.amount_paid');
    eq(SF.readInvoice({ '0': { total: '55.50' }, Invoice: { id: '2' } }).totalCents, 5550, 'suma aj z kľúča „0" (getInvoiceDetails)');
  }

  // ── status: počítadlo bez tajomstiev ──────────────────────────────────────
  const origLoad = Module._load;
  Module._load = function (request) {
    if (request === '@supabase/supabase-js') return { createClient: () => sb };
    return origLoad.apply(this, arguments);
  };
  const realNow = new Date();
  {
    db.danubra_members = [{ user_id: 'u1', role: 'admin', active: true }];
    sb.auth = { getUser: async (jwt) => ({ data: { user: jwt === 'ok' ? { id: 'u1' } : null } }) };
    reset([{}], null);
    db.danubra_members = [{ user_id: 'u1', role: 'admin', active: true }];
    db.danubra_sf_usage = [{ day: Budget.todaySk(realNow), used: 123, by_kind: { sync: 80, write: 43 }, sf_used: 120, sf_reset: '07.11.2026 00:00:00' }];
    Object.assign(process.env, ENV);
    const fnPath = path.join(__dirname, '..', '..', 'netlify', 'functions', 'danubra-sf-invoice.js');
    delete require.cache[fnPath];
    const { handler } = require(fnPath);
    global.fetch = fetch;
    const res = await handler({ httpMethod: 'POST', body: JSON.stringify({ action: 'status' }), headers: { authorization: 'Bearer ok' } });
    const j = JSON.parse(res.body);
    const u = j.usage || {};
    eq([res.statusCode, u.used, u.limit, u.sync_used, u.sync_budget, u.remaining, u.sync_remaining, u.hard_cap],
      [200, 123, 1000, 80, 300, 827, 220, 950], 'status: dnes 123 z 1000, synchronizácia 80 z 300, zostáva 827 (do stropu 950)');
    eq(SF.usageText(u), 'Dnes použité: 123 z 1000 (synchronizácia 80 z 300)', 'text pre Nastavenia');
    eq(calls.length, 0, 'status do SuperFaktúry nevolá');
    ok(!res.body.includes(KEY) && !res.body.includes('SFAPI') && !res.body.includes(MAIL) && !/apikey/i.test(res.body),
      'v odpovedi nie je kľúč, hlavička ani celý e-mail účtu');
  }

  // ── Denný cron: synchronizácia raz za deň ─────────────────────────────────
  {
    reset([{ ...SENT, sf_invoice_id: 841 }], null);
    db.danubra_settings = [{ id: 's1', superfaktura: {} }];
    delete process.env.OUTSCRAPER_API_KEY; delete process.env.CRON_SECRET;
    routes.push(['/invoices/index.json', () => respond(200, { pageCount: 1, page: 1, items: [listItem(841)] })]);
    const cronPath = path.join(__dirname, '..', '..', 'netlify', 'functions', 'danubra-cron-daily.js');
    delete require.cache[cronPath];
    const cron = require(cronPath);
    const log = console.log, err = console.error; console.log = () => {}; console.error = () => {};
    const r1 = JSON.parse((await cron.handler({ headers: {} })).body);
    // Faktúra by bola po 20 h znova na rade — aj tak sa v ten istý deň nesynchronizuje druhýkrát.
    db.danubra_invoices[0].sf_synced_at = null;
    const r2 = JSON.parse((await cron.handler({ headers: {} })).body);
    console.log = log; console.error = err;
    ok(r1.sfSync && r1.sfSync.checked === 1 && r1.sfSync.requests === 1, 'prvý beh cronu: synchronizácia jednou požiadavkou (zoznam)', JSON.stringify(r1.sfSync));
    eq(r2.sfSync, 'dnes už prebehla', 'druhý beh v ten istý deň synchronizáciu nespustí');
    eq(sfCalls('/invoices/').length, 1, 'do SuperFaktúry išla za oba behy 1 požiadavka');
    ok(!!usageRow(Budget.todaySk(new Date())).cron_sync_at, 'v počítadle je zapísané, kedy dnes cron synchronizoval');
    ok(cron.config && cron.config.schedule === '0 4 * * *', 'cron je naplánovaný raz denne');
  }
  Module._load = origLoad;

  // ── Migrácia 093 ──────────────────────────────────────────────────────────
  {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations', '093_sf_limit.sql'), 'utf8').replace(/--.*$/gm, '');
    ok(/create table if not exists danubra_sf_usage \(\s*day date primary key,\s*used int not null default 0/.test(sql)
      && /by_kind jsonb/.test(sql) && /updated_at timestamptz/.test(sql), 'tabuľka danubra_sf_usage(day, used, by_kind, updated_at)');
    ok(/insert into danubra_sf_usage as u[\s\S]*on conflict \(day\) do update\s+set used = u\.used \+ p_n[\s\S]*where u\.blocked_at is null[\s\S]*<= p_cap/.test(sql),
      'rezerva: jeden príkaz insert … on conflict do update set used = used + n … where (strop)');
    ok((sql.match(/security definer set search_path = public/g) || []).length === 2, 'obe funkcie security definer s pevnou search_path');
    ok(/revoke all on function danubra_sf_usage_take\(date, text, int, int, int\) from public, anon, authenticated/.test(sql)
      && /grant execute on function danubra_sf_usage_take\(date, text, int, int, int\) to service_role/.test(sql)
      && /revoke all on function danubra_sf_usage_report\(date, int, int, text, boolean\) from public, anon, authenticated/.test(sql)
      && /grant execute on function danubra_sf_usage_report\(date, int, int, text, boolean\) to service_role/.test(sql),
    'funkcie smie len service role (anon a authenticated nie)');
    ok(/alter table danubra_sf_usage enable row level security/.test(sql) && /revoke all on danubra_sf_usage from public, anon, authenticated/.test(sql)
      && !/create policy/.test(sql), 'tabuľka: RLS bez politiky, anon ani authenticated k nej nesmú');
    ok(/add column if not exists sf_synced_at timestamptz/.test(sql), 'sf_synced_at pri faktúre (ak by chýbal)');
    const svcSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'billing', 'sf-budget.js'), 'utf8');
    ok(/rpc\('danubra_sf_usage_take', \{\s*p_day: d, p_kind: k, p_n: n,\s*p_cap:[^}]*p_kind_cap:/.test(svcSrc), 'server volá RPC s tými istými parametrami ako SQL');
  }

  console.log(`\n${passed} prešlo, ${failed} padlo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log(`  ✗ test spadol: ${e.stack || e.message}`);
  console.log('\n0 prešlo, 1 padlo');
  process.exit(1);
});
