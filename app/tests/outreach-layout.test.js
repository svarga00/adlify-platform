// ============================================================================
// DANUBRA — e-mail oslovenia v dizajne punds s prezentáciou (odoslanie, náhľad)
// Spustenie:  node app/tests/outreach-layout.test.js
// ============================================================================
// Bez siete (ako outreach-send.test.js). Stráži sa:
//   * odíde HTML v dizajne punds aj textová podoba, s odhlásením a Impressum,
//   * k prvému e-mailu prezentácia PDF (remeslo a región z firmy a hľadania),
//     k pripomenutiu nie; voľba z okna platí; čo išlo v prílohe, sa zapíše,
//   * náhľad a stiahnutie prezentácie = to isté, čo odíde, nič sa neposiela.
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

let passed = 0, failed = 0;
function ok(c, msg, extra) {
  if (c) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}${extra ? `\n    ${extra}` : ''}`); }
}

const holder = { sb: null };
const proxy = { from: (...a) => holder.sb.from(...a), rpc: (...a) => holder.sb.rpc(...a), auth: { getUser: (...a) => holder.sb.auth.getUser(...a) },
  get storage() { return holder.sb.storage; } };
const smtp = { sent: [] };
const origLoad = Module._load;
Module._load = function (request) {
  if (request === '@supabase/supabase-js') return { createClient: () => proxy };
  if (request === 'nodemailer') return { createTransport: () => ({ sendMail: async (o) => { smtp.sent.push(o); return { messageId: 'x' }; } }) };
  if (request === 'imapflow') {
    return { ImapFlow: class { async connect() {} async list() { return [{ path: 'Sent', specialUse: '\\Sent' }]; } async append() {} async logout() {} } };
  }
  return origLoad.apply(this, arguments);
};
const FN = path.join(__dirname, '..', '..', 'netlify', 'functions');
const send = require(path.join(FN, 'danubra-outreach-send.js')).handler;
const preview = require(path.join(FN, 'danubra-outreach-preview.js')).handler;

const SUPPLIER = { name: 'Partner und Service s. r. o.', address: 'Podzámska 9468/4A, 940 71 Nové Zámky', vat_id: 'SK2122816839', company_id: '57553921' };
function base(over = {}) {
  return {
    danubra_members: [{ user_id: 'u-admin', role: 'admin', active: true }, { user_id: 'u-rec', role: 'recruiter', active: true }],
    danubra_mailboxes: [{ id: 'mb1', name: 'Info', email: 'stefan@punds.eu', display_name: 'Štefan Varga · punds', smtp_host: 'smtp.x', smtp_port: 465, imap_host: 'imap.x',
      username: 'stefan@punds.eu', secret_enc: S.encrypt('heslo'), active: true, sent_folder: 'Sent',
      signature_card: { enabled: true, name: 'Štefan Varga', role: 'Projektkoordination DACH', phone: '+421 910 523 958', lang: 'sk' } }],
    danubra_mailbox_access: [],
    danubra_leads: [{ id: 'l1', name: 'Müller Bau GmbH', city: 'Augsburg', email: 'info@mueller-bau.de', status: 'new', archived_at: null,
      contact_person: 'Herr Hans Müller', seed_search_id: 's1', categories: ['Bauunternehmen'] }],
    danubra_lead_searches: [{ id: 's1', params: { region: 'Bavorsko' }, seeds: [{ trade: 'Trockenbau', keywords: ['Trockenbau', 'Akustikdecken'] }] }],
    danubra_settings: [{ id: 's1', supplier: SUPPLIER, marketing: { outreach: { daily_limit: 30 } } }],
    danubra_outreach: [], danubra_email_optout: [], danubra_mail_messages: [], danubra_workers: [], danubra_partners: [], danubra_tasks: [], danubra_message_templates: [],
    ...over,
  };
}
const reset = (db) => { holder.sb = F.create(db, { users: { admin: { id: 'u-admin' }, rec: { id: 'u-rec' } } }); smtp.sent = []; return holder.sb; };
const call = async (fn, body, jwt = 'admin') => {
  const r = await fn({ httpMethod: 'POST', headers: jwt ? { authorization: `Bearer ${jwt}` } : {}, body: JSON.stringify(body) });
  return { code: r.statusCode, ...JSON.parse(r.body) };
};
// Text z okna = text + podpis schránky (ako ho pridá appka).
const BODY = { lead_id: 'l1', mailbox_id: 'mb1', step: 1, lang: 'de', subject: 'Trockenbauer für Müller Bau GmbH?',
  body: 'Sehr geehrter Herr Müller,\n\nwir sind ein Nachunternehmer aus der Slowakei.\n\nDarf ich Sie kurz anrufen?\n\nMit freundlichen Grüßen\n\n-- \nS pozdravom\n\nŠtefan Varga' };

(async () => {
  console.log('Prvý e-mail: dizajn punds a prezentácia');
  {
    const sb = reset(base());
    const r = await call(send, BODY);
    ok(r.code === 200 && r.attachment && r.attachment.kind === 'presentation' && r.trade === 'trockenbau', 'odišiel s prezentáciou, remeslo z hľadania', JSON.stringify(r));
    const p = await simpleParser(smtp.sent[0].raw);
    ok(p.html.includes('Trockenbauer für Ihre Baustellen in Augsburg und Umgebung') && p.html.includes('punds-mark-white.png'), 'HTML v dizajne punds s nadpisom podľa remesla a mesta');
    ok(/Sehr geehrter Herr Müller,/.test(p.html) && (p.html.match(/Mit freundlichen Grüßen/g) || []).length === 1 && /Projektkoordination DACH/.test(p.html) && !/S pozdravom/.test(p.html),
      'text, jeden pozdrav a vizitka schránky po nemecky');
    ok(/danubra-track\?t=[a-f0-9]{32}&amp;k=c&amp;u=https%3A%2F%2Fpunds\.eu/.test(p.html) && /danubra-track\?t=[a-f0-9]{32}&amp;k=o/.test(p.html), 'výzva so sledovaním kliku, obrázok na otvorenie');
    ok(/danubra-unsubscribe\?t=[a-f0-9]{32}/.test(p.html) && /danubra-unsubscribe\?t=[a-f0-9]{32}/.test(p.text) && /USt-IdNr\.: SK2122816839/.test(p.text), 'odhlásenie a Impressum v HTML aj texte');
    ok(p.text.startsWith('Trockenbauer für Ihre Baustellen') && /- Vollständige Unterlagen/.test(p.text), 'textová podoba je kompletná');
    const a = p.attachments[0];
    ok(p.attachments.length === 1 && a.contentType === 'application/pdf' && /^punds-trockenbau-augsburg\.pdf$/.test(a.filename) && a.content.subarray(0, 5).toString() === '%PDF-',
      'príloha PDF s menom podľa remesla a mesta', a && a.filename);
    ok(a.size < 300 * 1024, `príloha je malá (${Math.round(a.size / 1024)} kB)`);
    const o = sb.db.danubra_outreach[0];
    ok(o.status === 'sent' && Array.isArray(o.attachments) && o.attachments[0].name === a.filename && o.attachments[0].trade === 'trockenbau' && o.attachments[0].pages === 4,
      'zapísané, čo išlo v prílohe');
    ok(sb.db.danubra_mail_messages[0].attachments[0].name === a.filename, 'aj v Správach');
    ok(!String(o.body_html).includes('danubra-track') && String(o.body_html).includes('prefers-color-scheme'), 'kópia bez sledovania, so štýlmi');
  }

  console.log('\nVoľba prílohy');
  {
    reset(base());
    await call(send, { ...BODY, attach_presentation: false });
    const p = await simpleParser(smtp.sent[0].raw);
    ok(p.attachments.length === 0 && /Trockenbauer für Ihre Baustellen/.test(p.html), 'bez zaškrtnutia bez prílohy (dizajn zostáva)');
  }
  {
    const prev = { id: 'o-prev', lead_id: 'l1', step: 1, status: 'sent', sent_at: '2026-10-20T09:00:00Z', subject: 'Trockenbauer?', message_id: '<p@punds.eu>', to_email: 'info@mueller-bau.de' };
    reset(base({ danubra_leads: [{ ...base().danubra_leads[0], status: 'contacted' }], danubra_outreach: [prev] }));
    const r = await call(send, { ...BODY, step: 2, subject: 'Re: Trockenbauer?', body: 'Guten Tag,\n\nkurze Nachfrage.\n\nMit freundlichen Grüßen' });
    const p = await simpleParser(smtp.sent[0].raw);
    ok(r.code === 200 && p.attachments.length === 0 && !p.html.includes('Ständerwerk'), 'pripomenutie: bez prílohy a bez bodov', JSON.stringify(r));
  }
  {
    const sb = reset(base({ danubra_settings: [{ id: 's1', supplier: SUPPLIER, marketing: { presentation: { attach_default: false } } }] }));
    await call(send, BODY);
    ok((await simpleParser(smtp.sent[0].raw)).attachments.length === 0 && !sb.db.danubra_outreach[0].attachments, 'v Nastaveniach sa dá prikladanie vypnúť');
  }

  console.log('\nNáhľad a stiahnutie prezentácie');
  {
    const sb = reset(base());
    ok((await call(preview, { lead_id: 'l1', kind: 'pdf' }, 'rec')).code === 403, 'len s Marketingom');
    const pdf = await call(preview, { lead_id: 'l1', kind: 'pdf', mailbox_id: 'mb1' });
    const buf = Buffer.from(pdf.pdf_base64 || '', 'base64');
    ok(pdf.code === 200 && buf.subarray(0, 5).toString() === '%PDF-' && pdf.file_name === 'punds-trockenbau-augsburg.pdf' && pdf.pages === 4, 'PDF na stiahnutie');
    const h = await call(preview, { ...BODY, kind: 'email' });
    ok(h.code === 200 && h.html.includes('Trockenbauer für Ihre Baustellen') && !h.html.includes('danubra-track') && h.html.includes('Hier abmelden') && h.attachment,
      'náhľad e-mailu bez sledovania, s odhlásením a ohlásenou prílohou');
    ok(smtp.sent.length === 0 && sb.log.filter(l => l.op && l.op !== 'select').length === 0, 'náhľad nič neposiela ani nezapisuje');
  }

  console.log(`\n${passed} prešlo, ${failed} zlyhalo`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`  ✗ test spadol: ${e.stack}`); console.log('\n0 prešlo, 1 zlyhalo'); process.exit(1); });
