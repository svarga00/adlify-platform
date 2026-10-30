// ============================================================================
// DANUBRA — sledovanie oslovenia: otvorenie, klik, odhlásenie, odpoveď,
// nedoručenie a nočná úloha „Pripomenúť sa"
// Spustenie:  node app/tests/track.test.js
// ============================================================================
// danubra-track je verejná adresa — volá ju poštový program firmy. Stráži sa:
//   * obrázok sa vráti vždy (aj pri neznámom kľúči), bez cache,
//   * presmeruje sa len na podpísanú adresu (nie otvorené presmerovanie),
//   * predčítanie (Apple, Gmail, skenery) sa zapíše ako „možno automaticky",
//   * zahltenie z jednej adresy sa nezapisuje,
//   * odhlásenie z oslovenia: najprv otázka (skenery odkazy otvárajú), po
//     potvrdení optout + firma Odhlásená + udalosť,
//   * odpoveď a nedoručenka zo synchronizácie pošty sa spárujú podľa Message-ID,
//   * nočná kontrola založí úlohu pri firme (entity_type 'lead').
// ============================================================================
const Module = require('module');
const path = require('path');
const F = require('./fake-supabase.js');

process.env.IP_HASH_SECRET = 'test-ip-secret';
delete process.env.TRACK_SECRET;
delete process.env.CRON_SECRET;
const O = require('../lib/marketing/outreach.js');
const OS = require('../lib/marketing/outreach-server.js');
const SECRET = O.secretOf();

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}

const holder = { sb: null };
const proxy = {
  from: (...a) => holder.sb.from(...a), rpc: (...a) => holder.sb.rpc(...a),
  auth: { getUser: (...a) => holder.sb.auth.getUser(...a) }, get storage() { return holder.sb.storage; },
};
const origLoad = Module._load;
Module._load = function (request) {
  if (request === '@supabase/supabase-js') return { createClient: () => proxy };
  return origLoad.apply(this, arguments);
};
const FN = path.join(__dirname, '..', '..', 'netlify', 'functions');
const track = require(path.join(FN, 'danubra-track.js'));
const unsub = require(path.join(FN, 'danubra-unsubscribe.js')).handler;

const TOKEN = 'c'.repeat(32);
const HUMAN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

// To isté, čo robí funkcia danubra_outreach_hit v databáze (078).
function hitRpc(args, db) {
  const o = (db.danubra_outreach || []).find(x => x.token === args.p_token && ['sent', 'bounced'].includes(x.status));
  if (!o) return { data: null, error: null };
  (db.danubra_outreach_events = db.danubra_outreach_events || []).push({ outreach_id: o.id, type: args.p_type, url: args.p_url,
    automated: args.p_automated, auto_reason: args.p_auto_reason, ip_hash: args.p_ip_hash, user_agent: args.p_user_agent });
  const auto = args.p_automated;
  if (args.p_type === 'open') {
    if (auto) { o.auto_open_count = (o.auto_open_count || 0) + 1; o.auto_opened_at = o.auto_opened_at || 'now'; }
    else { o.open_count = (o.open_count || 0) + 1; o.opened_at = o.opened_at || 'now'; }
  } else if (auto) o.auto_click_count = (o.auto_click_count || 0) + 1;
  else { o.click_count = (o.click_count || 0) + 1; o.clicked_at = o.clicked_at || 'now'; }
  return { data: o.id, error: null };
}
function reset(over = {}) {
  holder.sb = F.create({
    danubra_outreach: [{ id: 'o1', lead_id: 'l1', token: TOKEN, status: 'sent', step: 1, sent_at: '2026-10-01T08:00:00Z',
      to_email: 'info@mueller-bau.de', message_id: '<abc.1@punds.eu>', next_followup_at: '2026-10-06T08:00:00Z', subject: 'Fachkräfte' }],
    danubra_outreach_events: [], danubra_leads: [{ id: 'l1', name: 'Müller Bau GmbH', city: 'Ulm', status: 'contacted' }],
    danubra_email_optout: [], danubra_campaign_sends: [], danubra_mail_messages: [], danubra_tasks: [], danubra_settings: [{ marketing: {} }],
    ...over,
  }, { rpc: { danubra_outreach_hit: hitRpc } });
  track._test.HITS.clear();
  return holder.sb;
}
const get = (q, ua = HUMAN, ip = '1.2.3.4', method = 'GET') => track.handler({ httpMethod: method, queryStringParameters: q,
  headers: { 'user-agent': ua, 'x-nf-client-connection-ip': ip } });

(async () => {
  console.log('Otvorenie (obrázok)');
  {
    const sb = reset();
    const r = await get({ t: TOKEN, k: 'o' });
    ok(r.statusCode === 200 && r.headers['Content-Type'] === 'image/gif' && r.isBase64Encoded && /no-store/.test(r.headers['Cache-Control']),
      'vráti priehľadný GIF bez cache');
    ok(sb.db.danubra_outreach[0].open_count === 1 && sb.db.danubra_outreach[0].opened_at, 'zapíše otvorenie');
    const ev = sb.db.danubra_outreach_events[0];
    ok(ev && ev.type === 'open' && !ev.automated && ev.ip_hash && ev.ip_hash !== '1.2.3.4', 'udalosť s odtlačkom IP, nie s IP');
    await get({ t: TOKEN, k: 'o' }, 'Mozilla/5.0');
    ok(sb.db.danubra_outreach[0].auto_open_count === 1 && sb.db.danubra_outreach[0].open_count === 1
      && /Apple/.test(sb.db.danubra_outreach_events[1].auto_reason), 'Apple Mail Privacy = otvorenie „možno automaticky", ráta sa zvlášť');
    const n = (await get({ t: 'd'.repeat(32), k: 'o' }));
    const z = (await get({ t: '../x', k: 'o' }));
    ok(n.statusCode === 200 && z.statusCode === 200 && sb.db.danubra_outreach_events.length === 2, 'neznámy aj zlý kľúč: obrázok, nič sa nezapíše');
  }

  console.log('\nKlik (presmerovanie)');
  {
    const sb = reset();
    const url = 'https://punds.eu/referenzen?a=1&b=2';
    const s = O.sign(TOKEN, url, SECRET);
    const r = await get({ t: TOKEN, k: 'c', u: url, s });
    ok(r.statusCode === 302 && r.headers.Location === url, 'presmeruje na pôvodnú adresu');
    ok(sb.db.danubra_outreach[0].click_count === 1 && sb.db.danubra_outreach_events[0].url === url, 'zapíše klik aj s adresou');
    const zly = await get({ t: TOKEN, k: 'c', u: 'https://evil.example/', s });
    ok(zly.statusCode === 404 && !zly.headers.Location && /Link ungültig/.test(zly.body), 'cudzia adresa s naším podpisom: nepresmeruje (nie je to otvorené presmerovanie)');
    ok((await get({ t: TOKEN, k: 'c', u: url })).statusCode === 404, 'bez podpisu nepresmeruje');
    ok((await get({ t: TOKEN, k: 'c', u: 'javascript:alert(1)', s: O.sign(TOKEN, 'javascript:alert(1)', SECRET) })).statusCode === 404,
      'javascript: nikdy');
    const sken = await get({ t: TOKEN, k: 'c', u: url, s }, 'Mimecast Safe Links Scanner');
    ok(sken.statusCode === 302 && sb.db.danubra_outreach[0].auto_click_count === 1 && sb.db.danubra_outreach[0].click_count === 1,
      'skener odkazov sa presmeruje, ale ráta sa ako automat');
    await get({ t: TOKEN, k: 'c', u: url, s }, HUMAN, '9.9.9.9', 'HEAD');
    ok(sb.db.danubra_outreach[0].auto_click_count === 2, 'HEAD (len overenie odkazu) = automat');
  }

  console.log('\nZahltenie');
  {
    const sb = reset();
    for (let i = 0; i < 130; i++) await get({ t: TOKEN, k: 'o' }, HUMAN, '5.5.5.5');
    ok(sb.db.danubra_outreach_events.length === 120, 'z jednej adresy najviac 120 zápisov za 10 minút', String(sb.db.danubra_outreach_events.length));
    const r = await get({ t: TOKEN, k: 'o' }, HUMAN, '5.5.5.5');
    ok(r.statusCode === 200, 'obrázok sa vráti aj tak');
    await get({ t: TOKEN, k: 'o' }, HUMAN, '6.6.6.6');
    ok(sb.db.danubra_outreach_events.length === 121, 'iná adresa sa zapíše');
  }

  console.log('\nOdhlásenie z e-mailu oslovenia');
  {
    const sb = reset();
    const otazka = await unsub({ httpMethod: 'GET', queryStringParameters: { t: TOKEN }, headers: {} });
    ok(/Abmelden bestätigen/.test(otazka.body) && /method="post"/.test(otazka.body), 'otvorenie odkazu sa najprv opýta (skener neodhlási)');
    ok(sb.db.danubra_email_optout.length === 0 && sb.db.danubra_leads[0].status === 'contacted', 'a nič nezapíše');
    const r = await unsub({ httpMethod: 'POST', queryStringParameters: { t: TOKEN }, headers: { 'user-agent': HUMAN }, body: 'List-Unsubscribe=One-Click' });
    ok(/Abmeldung bestätigt/.test(r.body) && /info@mueller-bau\.de/.test(r.body), 'potvrdenie (aj jedným klikom z poštového programu)');
    ok(sb.db.danubra_email_optout[0].email === 'info@mueller-bau.de', 'adresa je medzi odhlásenými — znova sa neosloví');
    ok(sb.db.danubra_leads[0].status === 'unsubscribed', 'firma je Odhlásená');
    ok(sb.db.danubra_outreach[0].unsubscribed_at && sb.db.danubra_outreach[0].next_followup_at === null, 'oslovenie: odhlásené, bez pripomenutia');
    ok(sb.db.danubra_outreach_events.some(e => e.type === 'unsubscribe'), 'udalosť na časovej osi');
    await unsub({ httpMethod: 'POST', queryStringParameters: { t: TOKEN }, headers: {} });
    ok(sb.db.danubra_outreach_events.filter(e => e.type === 'unsubscribe').length === 1, 'druhé kliknutie nič nezdvojí');
  }
  {
    const sb = reset({ danubra_campaign_sends: [{ id: 'c1', email: 'x@y.de', lead_id: 'l1', token: 'abcdefabcdefabcdef12' }] });
    const r = await unsub({ httpMethod: 'GET', queryStringParameters: { t: 'abcdefabcdefabcdef12' }, headers: {} });
    ok(/Abmeldung bestätigt/.test(r.body) && sb.db.danubra_email_optout[0].email === 'x@y.de', 'odhlásenie z kampane funguje ako doteraz');
    const n = await unsub({ httpMethod: 'POST', queryStringParameters: { t: 'e'.repeat(32) }, headers: {} });
    const g = await unsub({ httpMethod: 'GET', queryStringParameters: { t: 'e'.repeat(32) }, headers: {} });
    ok(/Link ungültig/.test(n.body) && /Link ungültig/.test(g.body), 'neznámy kľúč = neplatný odkaz (bez otázky na odhlásenie)');
  }

  console.log('\nOdpoveď a nedoručenie (synchronizácia pošty)');
  {
    const sb = reset({ danubra_tasks: [{ id: 't1', source_key: 'outreach:o1:1', entity_type: 'lead', entity_id: 'l1', status: 'open' },
      { id: 't2', source_key: null, entity_type: 'lead', entity_id: 'l1', status: 'open' }] });
    const row = { direction: 'in', from_email: 'hans@mueller-bau.de', subject: 'Re: Fachkräfte', in_reply_to: '<abc.1@punds.eu>',
      refs: '<abc.1@punds.eu>', sent_at: '2026-10-02T09:00:00Z', lead_id: null };
    const r = await OS.onIncoming(sb, { row, id: 'm9', parsed: { headers: new Map() } });
    const o = sb.db.danubra_outreach[0];
    ok(r && r.type === 'reply' && o.replied_at === row.sent_at && o.reply_message_id === 'm9' && o.next_followup_at === null,
      'odpoveď sa spáruje podľa In-Reply-To, pripomenutie sa zruší');
    ok(sb.db.danubra_leads[0].status === 'replied', 'firma: Odpísala');
    ok(sb.db.danubra_outreach_events.some(e => e.type === 'reply' && e.mail_message_id === 'm9'), 'udalosť s odkazom na e-mail v Správach');
    ok(sb.writes('danubra_mail_messages', 'update').length === 1, 'e-mail z inej adresy firmy sa priradí k firme');
    ok(sb.db.danubra_tasks[0].status === 'done' && sb.db.danubra_tasks[1].status === 'open', 'úloha „Pripomenúť sa" sa uzavrie, ručná úloha zostane');
  }
  {
    const sb = reset({ danubra_leads: [{ id: 'l1', name: 'X', status: 'interested' }] });
    await OS.onIncoming(sb, { row: { direction: 'in', subject: 'Re: x', in_reply_to: '<abc.1@punds.eu>', lead_id: 'l1' }, id: 'm1', parsed: {} });
    ok(sb.db.danubra_leads[0].status === 'interested', 'firmu, ktorá má záujem, odpoveď nevráti na „Odpísala"');
  }
  {
    const sb = reset();
    await OS.onIncoming(sb, { row: { direction: 'in', subject: 'Abwesenheitsnotiz: Fachkräfte', in_reply_to: '<abc.1@punds.eu>' }, id: 'm2', parsed: {} });
    ok(!sb.db.danubra_outreach[0].replied_at && sb.db.danubra_outreach[0].next_followup_at
      && sb.db.danubra_outreach_events[0].automated, 'automatická odpoveď (dovolenka) nezruší pripomenutie');
  }
  {
    const sb = reset();
    const parsed = { text: 'Your message could not be delivered.', headers: new Map([['content-type', { value: 'multipart/report', params: {} }]]),
      attachments: [{ contentType: 'message/rfc822', content: Buffer.from('From: info@punds.eu\r\nMessage-ID: <abc.1@punds.eu>\r\nSubject: Fachkräfte\r\n') }] };
    const r = await OS.onIncoming(sb, { row: { direction: 'in', from_email: 'mailer-daemon@mx.mueller-bau.de', subject: 'Undelivered Mail Returned to Sender',
      sent_at: '2026-10-01T08:01:00Z' }, id: 'm3', parsed });
    const o = sb.db.danubra_outreach[0];
    ok(r && r.type === 'bounce' && o.status === 'bounced' && o.bounced_at && o.next_followup_at === null, 'nedoručenka podľa Message-ID z citovanej správy');
    ok(sb.db.danubra_outreach_events.some(e => e.type === 'bounce') && sb.db.danubra_leads[0].status === 'contacted', 'udalosť Nedoručené, stav firmy sa nemení');
  }
  {
    const sb = reset();
    ok(await OS.onIncoming(sb, { row: { direction: 'in', subject: 'Hallo', in_reply_to: '<cudzi@x.de>' }, id: 'm4', parsed: {} }) === null
      && await OS.onIncoming(sb, { row: { direction: 'out', in_reply_to: '<abc.1@punds.eu>' } }) === null, 'cudzí a odoslaný e-mail nič nemení');
  }

  console.log('\nNočná kontrola — úloha „Pripomenúť sa"');
  {
    const sb = reset({ danubra_outreach: [
      { id: 'o1', lead_id: 'l1', status: 'sent', step: 1, sent_at: '2026-10-01T08:00:00Z', next_followup_at: '2026-10-06T08:00:00Z', subject: 'Fachkräfte' },
      { id: 'o2', lead_id: 'l2', status: 'sent', step: 1, sent_at: '2026-10-01T08:00:00Z', next_followup_at: '2099-01-01T08:00:00Z', subject: 'X' },
    ], danubra_leads: [{ id: 'l1', name: 'Müller Bau GmbH', city: 'Ulm', status: 'contacted' }, { id: 'l2', name: 'Y', status: 'contacted' }] });
    const cron = require(path.join(FN, 'danubra-cron-daily.js')).handler;
    const log = console.log; const err = console.error; console.log = () => {}; console.error = () => {};
    const r = await cron({ headers: {} });
    console.log = log; console.error = err;
    const t = sb.db.danubra_tasks;
    ok(r.statusCode === 200 && t.length === 1, 'jedna úloha — len firme po termíne', JSON.stringify(t));
    ok(t[0] && t[0].source_key === 'outreach:o1:1' && t[0].entity_type === 'lead' && t[0].entity_id === 'l1'
      && /Pripomenúť sa firme Müller Bau GmbH/.test(t[0].title), 'úloha „Pripomenúť sa firme X" pri firme');
    await cron({ headers: {} });
    ok(sb.db.danubra_tasks.length === 1, 'druhý beh ju nezdvojí');
  }

  console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`  ✗ test spadol: ${e.stack}`); console.log('\n0 prešlo, 1 zlyhalo'); process.exit(1); });
