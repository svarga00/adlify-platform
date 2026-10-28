// ============================================================================
// DANUBRA — Pošta: odoslať e-mail zo schránky / označiť prečítané
// ============================================================================
//   POST { action: 'send', mailbox_id, to, cc, bcc, subject, text,
//          in_reply_to, references, attachments: [{ storage_path, name, type }],
//          links: { worker_id, partner_id, lead_id } }
//   POST { action: 'seen', id, seen }
//
// Odošle cez SMTP schránky, uloží kópiu do jej priečinka Odoslané (IMAP
// APPEND — aby ju bolo vidieť aj v telefóne a v Outlooku) a zapíše do appky.
// Podpis už je v texte (pridáva ho appka podľa schránky).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MAIL_SECRET (voliteľné)
// ============================================================================
const { createClient } = require('@supabase/supabase-js');
const MailComposer = require('nodemailer/lib/mail-composer');
const M = require('../../app/lib/mail/mail.js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);
const srv = require('../../app/lib/mail/server.js')(supabase);
const BUCKET = 'danubra-docs';
const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const out = (code, body) => ({ statusCode: code, headers: H, body: JSON.stringify(body) });
const casovac = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('časový limit')), ms));

async function markSeen(row, seen) {
  const mb = await srv.mailbox(row.mailbox_id);
  if (!mb || !row.uid) return;
  const client = srv.imap(mb, srv.password(mb));
  try {
    await Promise.race([client.connect(), casovac(6000)]);
    const lock = await client.getMailboxLock(row.folder);
    try {
      if (seen) await client.messageFlagsAdd(String(row.uid), ['\\Seen'], { uid: true });
      else await client.messageFlagsRemove(String(row.uid), ['\\Seen'], { uid: true });
    } finally { lock.release(); }
  } catch (e) { /* v appke je to označené aj tak */ } finally { try { await client.logout(); } catch (e) { /* */ } }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return out(405, { error: 'Nepovolená metóda' });
  const user = await srv.userFrom(event);
  if (!user) return out(401, { error: 'Neprihlásený používateľ.' });
  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch { return out(400, { error: 'Neplatné telo požiadavky.' }); }

  if (b.action === 'seen') {
    const { data: row } = await supabase.from('danubra_mail_messages').select('id,mailbox_id,folder,uid').eq('id', b.id).maybeSingle();
    if (!row || !await srv.canUse(user.id, row.mailbox_id)) return out(403, { error: 'Bez prístupu.' });
    await supabase.from('danubra_mail_messages').update({ seen: !!b.seen }).eq('id', row.id);
    await markSeen(row, !!b.seen);
    return out(200, { ok: true });
  }
  if (b.action !== 'send') return out(400, { error: 'Neznáma akcia.' });

  const mb = await srv.mailbox(b.mailbox_id);
  if (!mb || !mb.active) return out(404, { error: 'Schránka neexistuje.' });
  if (!await srv.canUse(user.id, mb.id)) return out(403, { error: 'Do tejto schránky nemáte prístup.' });
  const to = M.parseAddresses(b.to || []).filter(a => M.emailOk(a.address));
  const cc = M.parseAddresses(b.cc || []).filter(a => M.emailOk(a.address));
  const bcc = M.parseAddresses(b.bcc || []).filter(a => M.emailOk(a.address));
  if (!to.length) return out(400, { error: 'Zadajte aspoň jedného adresáta.' });

  try {
    const pass = srv.password(mb);
    const attachments = [];
    for (const a of (b.attachments || []).slice(0, 20)) {
      if (!a || !a.storage_path) continue;
      // Funkcia sťahuje so service-role kľúčom, takže cestu stráži sama: žiadne
      // „..", a prílohu z cudzej schránky (mail/<id schránky>/…) priloží len ten,
      // kto do tej schránky smie.
      const sp = String(a.storage_path);
      const casti = sp.split('/');
      if (sp.length > 500 || sp.startsWith('/') || sp.includes('\\') || casti.includes('..')
        || (casti[0] === 'mail' && !(await srv.canUse(user.id, casti[1])))) {
        return out(403, { error: `Prílohu „${a.name || casti[casti.length - 1]}" nemôžete priložiť.` });
      }
      const { data, error } = await supabase.storage.from(BUCKET).download(a.storage_path);
      if (error || !data) return out(400, { error: `Príloha „${a.name || a.storage_path}" sa nenašla.` });
      attachments.push({ filename: a.name || a.storage_path.split('/').pop(), content: Buffer.from(await data.arrayBuffer()),
        contentType: a.type || data.type || undefined });
    }
    const text = String(b.text || '');
    const mail = {
      from: { name: mb.display_name || mb.name || '', address: mb.email },
      to: to.map(M.fmtAddress), cc: cc.map(M.fmtAddress), bcc: bcc.map(M.fmtAddress),
      subject: String(b.subject || '').slice(0, 500), text,
      // Grafický podpis schránky (vizitka) namiesto textového — M.bodyHtml.
      html: M.bodyHtml(text, mb, `${process.env.URL || 'https://adlify-app.netlify.app'}/web/public`),
      inReplyTo: b.in_reply_to || undefined, references: b.references || undefined, attachments,
    };
    // Správa sa poskladá raz: tá istá ide cez SMTP aj do Odoslaných.
    const raw = await new MailComposer(mail).compile().build();
    const messageId = (String(raw).match(/^Message-ID:\s*(<[^>]+>)/mi) || [])[1] || null;
    const envelope = { from: mb.email, to: [...to, ...cc, ...bcc].map(a => a.address) };
    await srv.smtp(mb, pass).sendMail({ envelope, raw });

    // Kópia do Odoslaných — keď nevyjde, e-mail je aj tak odoslaný.
    let uloz = null;
    try {
      const client = srv.imap(mb, pass);
      await Promise.race([client.connect(), casovac(5000)]);
      const folder = mb.sent_folder || await srv.findSent(client);
      if (folder) { await Promise.race([client.append(folder, raw, ['\\Seen']), casovac(5000)]); uloz = folder; }
      await client.logout();
    } catch (e) { /* bez kópie v Odoslaných */ }

    const links = b.links || {};
    const auto = M.matchEntities([...to, ...cc], await (async () => {
      const [w, p, l] = await Promise.all([
        // Service role — archivovaní (migrácia 066) sa k e-mailu nepriradia.
        supabase.from('danubra_workers').select('id,email').not('email', 'is', null).is('archived_at', null).limit(5000),
        supabase.from('danubra_partners').select('id,email').not('email', 'is', null).is('archived_at', null).limit(5000),
        supabase.from('danubra_leads').select('id,email').not('email', 'is', null).limit(10000),
      ]);
      return { workers: w.data || [], partners: p.data || [], leads: l.data || [] };
    })());
    const row = {
      mailbox_id: mb.id, folder: uloz || mb.sent_folder || 'Sent', uid: null, direction: 'out', seen: true,
      message_id: messageId, in_reply_to: b.in_reply_to || null, refs: b.references || null,
      thread_key: M.threadKey({ references: b.references, inReplyTo: b.in_reply_to, messageId, subject: b.subject }),
      from_email: mb.email, from_name: mb.display_name || mb.name, to_list: to, cc_list: cc,
      subject: mail.subject || '(bez predmetu)', sent_at: new Date().toISOString(), snippet: M.snippet(text),
      text_body: text, html_body: null,
      attachments: attachments.map((a, i) => ({ name: a.filename, type: a.contentType, size: a.content.length,
        storage_path: (b.attachments || []).filter(x => x && x.storage_path)[i].storage_path })),
      worker_id: links.worker_id || auto.worker_id, partner_id: links.partner_id || auto.partner_id,
      lead_id: links.lead_id || auto.lead_id, created_by: user.id,
    };
    const { data: saved } = await supabase.from('danubra_mail_messages').insert(row).select('id').single();
    if (row.lead_id) {
      await supabase.from('danubra_leads').update({ last_contact_at: row.sent_at }).eq('id', row.lead_id);
      await supabase.from('danubra_leads').update({ status: 'contacted' }).eq('id', row.lead_id).eq('status', 'new');
    }
    return out(200, { ok: true, id: saved && saved.id, sent_folder: uloz });
  } catch (e) {
    const t = String(e.responseText || e.message || e);
    return out(502, { error: /auth|535|534|credentials/i.test(t) ? 'Schránka odmietla prihlásenie — skontrolujte heslo v Nastaveniach → Schránky.' : t.slice(0, 300) });
  }
};
