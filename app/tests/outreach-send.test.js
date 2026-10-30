// ============================================================================
// DANUBRA — oslovenie firmy e-mailom (danubra-outreach-send) a návrh (draft)
// Spustenie:  node app/tests/outreach-send.test.js
// ============================================================================
// Bez siete: Supabase je v pamäti (fake-supabase.js), SMTP a IMAP sú
// podvrhnuté a odoslaná správa sa rozoberie mailparserom. Stráži sa to,
// na čom oslovovanie stojí právne aj prakticky:
//   * len člen s Marketingom a so schránkou,
//   * odhlásený sa znova neosloví, denný limit, Impressum v pätičke,
//   * v e-maile je odhlásenie (odkaz aj List-Unsubscribe), sledovanie podľa
//     nastavení, kópia v Odoslaných bez sledovacieho obrázka,
//   * Message-ID sa uloží (podľa neho sa spáruje odpoveď), pripomenutie ide
//     v tom istom vlákne a uzavrie úlohu „Pripomenúť sa".
// ============================================================================
const Module = require('module');
const path = require('path');
const { simpleParser } = require('mailparser');
const F = require('./fake-supabase.js');

process.env.MAIL_SECRET = 'test-mail-secret';
process.env.IP_HASH_SECRET = 'test-ip-secret';
process.env.URL = 'https://hub.example';
delete process.env.ANTHROPIC_API_KEY;
const S = require('../lib/mail/secret.js');
const O = require('../lib/marketing/outreach.js');

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}

// ── Podvrhnuté moduly ───────────────────────────────────────────────────────
const holder = { sb: null };
const proxy = {
  from: (...a) => holder.sb.from(...a), rpc: (...a) => holder.sb.rpc(...a),
  auth: { getUser: (...a) => holder.sb.auth.getUser(...a) }, get storage() { return holder.sb.storage; },
};
const smtp = { sent: [], fail: null };
const imap = { appended: [] };
const origLoad = Module._load;
Module._load = function (request) {
  if (request === '@supabase/supabase-js') return { createClient: () => proxy };
  if (request === 'nodemailer') {
    return { createTransport: () => ({ sendMail: async (o) => { if (smtp.fail) throw new Error(smtp.fail); smtp.sent.push(o); return { messageId: 'x' }; } }) };
  }
  if (request === 'imapflow') {
    return { ImapFlow: class { async connect() {} async list() { return [{ path: 'Sent', specialUse: '\\Sent' }]; }
      async append(folder, raw) { imap.appended.push({ folder, raw }); } async logout() {} } };
  }
  return origLoad.apply(this, arguments);
};

const FN = path.join(__dirname, '..', '..', 'netlify', 'functions');
const send = require(path.join(FN, 'danubra-outreach-send.js')).handler;
const draft = require(path.join(FN, 'danubra-outreach-draft.js')).handler;

const SUPPLIER = { name: 'Partner und Service s. r. o.', address: 'Podzámska 9468/4A, 940 71 Nové Zámky', vat_id: 'SK2122334455',
  company_id: '57553921', phone: '+421 900 000 000', email: 'info@punds.eu' };
function base(over = {}) {
  return {
    danubra_members: [{ user_id: 'u-admin', role: 'admin', active: true }, { user_id: 'u-rec', role: 'recruiter', active: true },
      { user_id: 'u-mkt', role: 'recruiter', active: true, modules: ['marketing', 'messages'] }],
    danubra_mailboxes: [{ id: 'mb1', name: 'Info', email: 'info@punds.eu', display_name: 'Partner und Service', smtp_host: 'smtp.x',
      smtp_port: 465, imap_host: 'imap.x', username: 'info@punds.eu', secret_enc: S.encrypt('heslo'), active: true, sent_folder: 'Sent' }],
    danubra_mailbox_access: [],
    danubra_leads: [{ id: 'l1', name: 'Müller Bau GmbH', city: 'Ulm', email: 'info@mueller-bau.de', trade: 'Trockenbau', status: 'new', archived_at: null }],
    danubra_settings: [{ id: 's1', supplier: SUPPLIER, marketing: { outreach: { daily_limit: 30, followup_days: 5 } } }],
    danubra_outreach: [], danubra_email_optout: [], danubra_mail_messages: [], danubra_workers: [], danubra_partners: [], danubra_tasks: [],
    danubra_message_templates: [],
    ...over,
  };
}
function reset(db) {
  holder.sb = F.create(db, { users: { admin: { id: 'u-admin' }, rec: { id: 'u-rec' }, mkt: { id: 'u-mkt' } } });
  smtp.sent = []; smtp.fail = null; imap.appended = [];
  return holder.sb;
}
const BODY = { lead_id: 'l1', mailbox_id: 'mb1', step: 1, lang: 'de', subject: 'Zusätzliche Fachkräfte für Müller Bau GmbH?',
  body: 'Sehr geehrte Damen und Herren,\n\nwir stellen Handwerker. Referenzen: https://punds.eu/referenzen\n\nMit freundlichen Grüßen' };
const call = async (fn, body, jwt = 'admin') => {
  const r = await fn({ httpMethod: 'POST', headers: jwt ? { authorization: `Bearer ${jwt}` } : {}, body: JSON.stringify(body) });
  return { code: r.statusCode, ...JSON.parse(r.body) };
};

(async () => {
  console.log('Oslovenie firmy — kto smie');
  {
    reset(base());
    ok((await call(send, BODY, null)).code === 401, 'bez prihlásenia nie');
    ok((await call(send, BODY, 'rec')).code === 403, 'náborár bez Marketingu nie');
    const r = await call(send, BODY, 'mkt');
    ok(r.code === 403 && /schránky/.test(r.error), 's Marketingom, ale bez prístupu ku schránke nie', JSON.stringify(r));
    ok(smtp.sent.length === 0, 'a nič neodišlo');
    ok((await call(send, { ...BODY, subject: '' })).code === 400, 'bez predmetu nie');
  }

  console.log('\nOslovenie firmy — pravidlá');
  {
    reset(base({ danubra_settings: [{ id: 's1', supplier: { name: 'P&S' }, marketing: {} }] }));
    const r = await call(send, BODY);
    ok(r.code === 400 && /Impressum/.test(r.error) && /adresa/.test(r.error), 'bez Impressum (adresa, IČ DPH) e-mail neodíde', r.error);
  }
  {
    reset(base({ danubra_email_optout: [{ email: 'info@mueller-bau.de' }] }));
    const r = await call(send, BODY);
    ok(r.code === 409 && /odhlásila/.test(r.error) && smtp.sent.length === 0, 'odhlásená adresa sa znova neosloví', r.error);
  }
  {
    const dnes = new Date().toISOString();
    const db = base({ danubra_settings: [{ id: 's1', supplier: SUPPLIER, marketing: { outreach: { daily_limit: 2 } } }],
      danubra_outreach: [{ id: 'x1', lead_id: 'lx', status: 'sent', sent_at: dnes }, { id: 'x2', lead_id: 'ly', status: 'bounced', sent_at: dnes }] });
    reset(db);
    const r = await call(send, BODY);
    ok(r.code === 409 && /denný limit/.test(r.error), 'denný limit z nastavení', r.error);
  }
  {
    reset(base({ danubra_leads: [{ id: 'l1', name: 'X', email: '', status: 'new' }] }));
    ok((await call(send, BODY)).code === 409, 'firma bez e-mailu nie');
  }

  console.log('\nOslovenie firmy — odoslanie');
  let first;
  {
    const sb = reset(base());
    const r = await call(send, BODY);
    ok(r.code === 200 && r.ok && r.message_id, 'e-mail odišiel', JSON.stringify(r));
    ok(smtp.sent.length === 1 && smtp.sent[0].envelope.to.join() === 'info@mueller-bau.de', 'jednej firme, z adresy schránky');
    const p = await simpleParser(smtp.sent[0].raw);
    const o = sb.db.danubra_outreach[0];
    first = o;
    ok(o && O.tokenOk(o.token), 'oslovenie má vlastný kľúč');
    ok(p.html.includes(`https://hub.example/.netlify/functions/danubra-track?t=${o.token}&amp;k=o`), 'v e-maile je sledovací obrázok');
    ok(/danubra-track\?t=[a-f0-9]{32}&amp;k=c&amp;u=https%3A%2F%2Fpunds.eu%2Freferenzen&amp;s=[a-f0-9]{32}/.test(p.html), 'odkaz ide cez podpísané presmerovanie');
    ok(p.html.includes(`danubra-unsubscribe?t=${o.token}`) && p.text.includes(`danubra-unsubscribe?t=${o.token}`), 'odhlásenie v HTML aj v texte');
    ok(/USt-IdNr\.: SK2122334455/.test(p.text) && /Podzámska/.test(p.text), 'pätička s Impressum (názov, adresa, IČ DPH)');
    const hlav = String(smtp.sent[0].raw).split('\r\n\r\n')[0].replace(/\r\n[ \t]+/g, ' ');
    const lu = (hlav.match(/^List-Unsubscribe: (.*)$/m) || [])[1] || '';
    ok(lu.includes(`danubra-unsubscribe?t=${o.token}`) && /^List-Unsubscribe-Post: List-Unsubscribe=One-Click$/m.test(hlav),
      'hlavička List-Unsubscribe (odhlásenie jedným klikom)', lu);
    ok(imap.appended.length === 1 && imap.appended[0].folder === 'Sent', 'kópia v Odoslaných');
    const kopia = await simpleParser(imap.appended[0].raw);
    ok(!String(kopia.html).includes('danubra-track') && kopia.messageId === p.messageId, 'kópia je bez sledovania a s tým istým Message-ID');
    ok(o.status === 'sent' && o.message_id === p.messageId && o.sent_at && o.step === 1, 'oslovenie je zapísané ako odoslané s Message-ID');
    ok(o.next_followup_at === O.nextFollowup(o.sent_at, 5), 'pripomenutie o 5 dní (bez víkendu)');
    const mm = sb.db.danubra_mail_messages[0];
    ok(mm && mm.message_id === p.messageId && mm.lead_id === 'l1' && mm.direction === 'out' && o.mail_message_id === mm.id,
      'e-mail je aj v Správach, pri firme (odpoveď sa spáruje)');
    ok(!String(mm.html_body).includes('danubra-track'), 'v Správach bez sledovacieho obrázka');
    ok(sb.db.danubra_leads[0].status === 'contacted' && sb.db.danubra_leads[0].last_contact_at, 'firma je Oslovená, s dátumom kontaktu');
    const r2 = await call(send, BODY);
    ok(r2.code === 409 && /Pripomenúť sa/.test(r2.error), 'prvý e-mail tej istej firme druhýkrát nie', r2.error);
  }

  console.log('\nPripomenutie v tom istom vlákne');
  {
    const prev = { ...first, id: 'o-prev', next_followup_at: '2020-01-01T00:00:00Z' };
    const sb = reset(base({ danubra_leads: [{ id: 'l1', name: 'Müller Bau GmbH', email: 'info@mueller-bau.de', status: 'contacted' }],
      danubra_outreach: [prev],
      danubra_tasks: [{ id: 't1', source_key: 'outreach:o-prev:1', status: 'open' }] }));
    const r = await call(send, { ...BODY, step: 2, subject: O.replySubject(prev.subject), body: 'Sehr geehrte Damen und Herren,\n\nich wollte kurz nachfragen.\n\nMit freundlichen Grüßen' });
    ok(r.code === 200, 'pripomenutie odišlo', JSON.stringify(r));
    const p = await simpleParser(smtp.sent[0].raw);
    ok(p.inReplyTo === prev.message_id && /^Re: /.test(p.subject), 'In-Reply-To na prvý e-mail a „Re:"', `${p.inReplyTo} ${p.subject}`);
    const nove = sb.db.danubra_outreach.find(x => x.id !== 'o-prev');
    ok(nove.step === 2 && nove.in_reply_to === prev.message_id, 'zapísané ako krok 2');
    ok(sb.db.danubra_outreach.find(x => x.id === 'o-prev').next_followup_at === null, 'starý termín pripomenutia sa zruší');
    ok(sb.db.danubra_tasks[0].status === 'done', 'úloha „Pripomenúť sa" sa uzavrie');
  }

  console.log('\nKeď SMTP zlyhá');
  {
    const sb = reset(base());
    smtp.fail = '535 Authentication failed';
    const r = await call(send, BODY);
    ok(r.code === 502 && /heslo/.test(r.error), 'zlé heslo schránky povie, kde ho opraviť', r.error);
    ok(sb.db.danubra_outreach[0].status === 'failed' && sb.db.danubra_leads[0].status === 'new', 'oslovenie je „neodišlo", firma zostáva Nová');
  }

  console.log('\nSledovanie vypnuté v nastaveniach');
  {
    reset(base({ danubra_settings: [{ id: 's1', supplier: SUPPLIER, marketing: { outreach: { track_opens: false, track_clicks: false } } }] }));
    const r = await call(send, BODY);
    const p = await simpleParser(smtp.sent[0].raw);
    ok(r.code === 200 && !p.html.includes('danubra-track') && p.html.includes('href="https://punds.eu/referenzen"') && p.html.includes('danubra-unsubscribe'),
      'bez obrázka a bez prepisu odkazov — odhlásenie zostáva');
  }

  console.log('\nNávrh e-mailu');
  {
    reset(base({ danubra_leads: [{ id: 'l1', name: 'Müller Bau GmbH', city: 'Ulm', email: 'info@mueller-bau.de', trade: 'Trockenbau', status: 'new' }] }));
    const r = await call(draft, { lead_id: 'l1', step: 1, lang: 'de' });
    ok(r.code === 200 && r.source === 'template' && /AI nie je zapnutá/.test(r.ai_error), 'bez kľúča k AI sa použije šablóna a povie sa to');
    ok(r.subject === 'Trockenbauer für Ihre Baustellen in Ulm' && /Sehr geehrte Damen und Herren,/.test(r.body) && /in Ulm im Bereich Trockenbau/.test(r.body)
      && !/\{/.test(r.body), 'šablóna má doplnený tím, mesto a remeslo (predmet bez otáznika)', `${r.subject} | ${r.body}`);
    ok(/im Anhang/.test(r.body), 'k prvému e-mailu ide prezentácia → veta o prílohe', r.body);
    const bez = await call(draft, { lead_id: 'l1', step: 1, lang: 'de', attach_presentation: false });
    ok(!/Anhang/.test(bez.body), 'bez prílohy veta o prílohe nie je');
    ok((await call(draft, { lead_id: 'l1' }, 'rec')).code === 403, 'návrh len s Marketingom');
    const en = await call(draft, { lead_id: 'l1', lang: 'en' });
    ok(/Dear Sir or Madam/.test(en.body) && /drywall works/.test(en.body) && /drywall installers/.test(en.subject), 'po anglicky — aj remeslo a tím', `${en.subject} | ${en.body}`);
  }
  {
    // Remeslo z hľadania je po slovensky — do e-mailu ide nemecké.
    reset(base({ danubra_leads: [{ id: 'l1', name: 'Englhardt Malerei GmbH', city: 'Ingolstadt', email: 'info@englhardt.de', trade: 'maliarstvo, omietky, zatepľovanie', status: 'new' }] }));
    const r = await call(draft, { lead_id: 'l1', step: 1, lang: 'de' });
    ok(r.subject === 'Maler für Ihre Baustellen in Ingolstadt' && /Maler-, Putz- und WDVS-Arbeiten/.test(r.body) && !/maliar|omiet|zatep/i.test(r.body),
      'slovenské remeslo z hľadania → „Maler-, Putz- und WDVS-Arbeiten", nie „maliarstvo"', `${r.subject} | ${r.body}`);
  }
  {
    reset(base({ danubra_outreach: [{ ...first, id: 'o1' }] }));
    const r = await call(draft, { lead_id: 'l1', step: 2, lang: 'de' });
    const slov = r.body.split(/\s+/).length;
    ok(r.subject === O.replySubject(first.subject) && /habe ich Ihnen Trockenbauer/.test(r.body) && slov <= 75,
      `pripomenutie: „Re: pôvodný predmet", odkaz na e-mail, krátke (${slov} slov)`, `${r.subject} | ${r.body}`);
    ok(new RegExp(`am ${O.vars({}, { prev: first }).datum}`).test(r.body), 'a s dátumom prvého e-mailu', r.body);
  }
  {
    // AI: odpoveď cez nástroj; v prompte nie je meno nášho odberateľa ako fakt na použitie.
    const { prompt, nearestSite, SLOVAK } = require(path.join(FN, 'danubra-outreach-draft.js'))._test;
    const PI = require('../lib/marketing/pitch.js');
    const lead = { name: 'Englhardt Malerei GmbH', city: 'Ingolstadt', trade: 'maliarstvo, omietky, zatepľovanie', why: 'podobná ako GU Ulm, robí maliarstvo',
      website: 'https://englhardt.example', site_description: 'Malerbetrieb in Ingolstadt seit 1962: Fassaden, Innenräume, WDVS.', categories: ['Malerbetrieb', 'Stuckateur'] };
    const search = { seeds: [{ trade: 'Maler', keywords: ['Fassade'] }], params: { note: 'hľadáme maliarov v Bavorsku' } };
    const pitch = PI.pitch({ lead, search });
    const v = O.vars(lead, { supplier: SUPPLIER, search, attach: true });
    const p = prompt({ lead, v, step: 1, lang: 'de', template: O.pickTemplate([], { step: 1 }), prev: null, pitch, search, near: null, attach: true });
    ok(/Sie-Form/.test(p) && /Nikdy nespomeň, s ktorými firmami spolupracujeme/.test(p) && /Nič si nevymýšľaj/.test(p),
      'AI píše v Sie-forme, bez vymyslených faktov a bez mien našich odberateľov');
    ok(/Remeslo \(nemecky, použi toto označenie\): Maler-, Putz- und WDVS-Arbeiten — Maler- und Lackierarbeiten/.test(p) && /Koho jej ponúkame: Maler\n/.test(p),
      'model dostane nemecké remeslo a tím z pitch.js', p.slice(0, 600));
    const smieDoEmailu = p.slice(p.indexOf('O FIRME'), p.indexOf('INTERNÉ'));
    ok(!/maliarstvo|omietky|zatep/.test(smieDoEmailu), 'slovenský lead.trade nie je medzi faktami, ktoré smú do e-mailu', smieDoEmailu);
    ok(/INTERNÉ \(len pre tvoje pochopenie/.test(p) && p.indexOf('Prečo sme ju vybrali: podobná ako GU Ulm') > p.indexOf('INTERNÉ') && /Poznámka k hľadaniu: hľadáme maliarov/.test(p),
      '„prečo" a poznámka k hľadaniu sú jasne označené ako interné');
    ok(/Popis webu .*Malerbetrieb in Ingolstadt seit 1962/.test(p) && /Kategórie z Google Máp: Malerbetrieb, Stuckateur/.test(p) && /Web: https:\/\/englhardt\.example/.test(p),
      'popis webu, kategórie a web sú tam ako konkrétny detail pre prvú vetu');
    ok(/Prvá veta je o NICH/.test(p) && /Žiadne „Wir sind Firma X/.test(p) && /utorok alebo vo štvrtok dopoludnia, ALEBO odpoveď jedným slovom „Profile"/.test(p),
      'pravidlá: prvá veta o nich, výzva s dvoma možnosťami');
    ok(/bez otáznika/.test(p) && /najviac 60 znakov/.test(p) && /„Maler für Ihre Baustellen in Ingolstadt"/.test(p), 'pravidlá predmetu s príkladom z remesla a mesta', p.slice(-500));
    ok(/Žiadne slovenské slová ani slovenské názvy remesiel/.test(p) && /Vykanie \(Sie\)/.test(p), 'zákaz slovenčiny, vykanie');
    ok(/nemáme bežiacu zákazku — nepíš, že v ich regióne už pracujeme/.test(p), 'bez zákazky v okolí sa „sme v regióne" nesmie tvrdiť');
    ok(/ide príloha: krátka prezentácia PDF/.test(p), 'model vie, že ide príloha');
    const blizko = prompt({ lead, v, step: 1, lang: 'de', template: O.pickTemplate([], { step: 1 }), prev: null, pitch, search, near: { km: 42, city: 'Augsburg' }, attach: false });
    ok(/Bežiaca zákazka do 42 km od firmy \(Augsburg\) — smieš napísať, že v ich regióne už pracujeme; stavbu ani odberateľa nemenuj/.test(blizko) && /nejde žiadna príloha/.test(blizko),
      'so zákazkou do 80 km smie spomenúť región, bez mien; bez prílohy prílohu nespomína');
    const ing = { lat: 48.7665, lng: 11.4258 };
    ok(nearestSite(ing, [{ site_city: 'Augsburg', lat: 48.3705, lng: 10.8978 }, { site_city: 'Hamburg', lat: 53.55, lng: 10.0 }]).city === 'Augsburg'
      && nearestSite(ing, [{ site_city: 'Hamburg', lat: 53.55, lng: 10.0 }]) === null && nearestSite({}, [{ lat: 48.4, lng: 10.9 }]) === null,
      'najbližšia bežiaca zákazka len do 80 km a len so súradnicami firmy');
    ok(SLOVAK.test('Maler für zatepľovanie') && !SLOVAK.test('Maler für Ihre Baustellen in München – Grüße, Straße, Nové Zámky'), 'kontrola slovenských písmen nechytá nemčinu');
    ok(/\/\/ .*INTERN|interné/i.test(require('fs').readFileSync(path.join(FN, 'danubra-outreach-draft.js'), 'utf8')), 'interné údaje sú v kóde označené');
  }

  console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`  ✗ test spadol: ${e.stack}`); console.log('\n0 prešlo, 1 zlyhalo'); process.exit(1); });
