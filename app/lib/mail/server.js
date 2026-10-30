// ============================================================================
// DANUBRA — Pošta: spoločné veci pre serverové funkcie (len Node)
// ============================================================================
// Kto volá (prihlásený používateľ appky), smie do schránky (admin alebo
// pridelený prístup), pripojenie k IMAP/SMTP s rozšifrovaným heslom a
// nájdenie priečinka „Odoslané".
// ============================================================================
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const S = require('./secret.js');
const Perm = require('../perm.js');

module.exports = function server(supabase) {
  async function userFrom(event) {
    const h = (event && event.headers) || {};
    const jwt = String(h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return null;
    const { data } = await supabase.auth.getUser(jwt);
    return (data && data.user) || null;
  }

  /**
   * Členovia appky a ja medzi nimi — rovnaké pravidlo ako server-guard.js
   * a databáza (Perm). Keď sa zoznam nedá prečítať, nepustí sa nikto:
   * predtým chyba vyzerala ako „prázdna appka" a pustila každého.
   */
  async function whoAmI(userId) {
    const { data, error } = await supabase.from('danubra_members')
      .select('user_id,role,modules,active').limit(1000);
    if (error || !Array.isArray(data)) return null;
    return { members: data, me: data.find(m => m.user_id === userId && m.active !== false) || null };
  }

  /** Admin appky. Kým nie je založený nikto, smie prvý prihlásený (ako inde v appke). */
  async function isAdmin(userId) {
    const w = await whoAmI(userId);
    return !!w && Perm.isAdmin(w.me, w.members);
  }

  /**
   * Smie do schránky? Admin do všetkých. Ostatní len aktívny člen s právom na
   * Správy (perm.js: mail → messages) a s prideleným prístupom ku schránke —
   * vypnutý človek ani ten, komu admin Správy vzal, už neodošle nič.
   */
  async function canUse(userId, mailboxId) {
    const w = await whoAmI(userId);
    if (!w) return false;
    if (Perm.isAdmin(w.me, w.members)) return true;
    if (!w.me || !Perm.can(w.me, 'mail', w.members)) return false;
    const { data } = await supabase.from('danubra_mailbox_access').select('active')
      .eq('mailbox_id', mailboxId).eq('user_id', userId).maybeSingle();
    return !!(data && data.active);
  }

  async function mailbox(id) {
    const { data } = await supabase.from('danubra_mailboxes').select('*').eq('id', id).maybeSingle();
    return data || null;
  }

  function imap(mb, password) {
    return new ImapFlow({
      host: mb.imap_host, port: Number(mb.imap_port) || 993, secure: mb.imap_secure !== false,
      auth: { user: mb.username || mb.email, pass: password }, logger: false,
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 60000,
    });
  }

  function smtp(mb, password) {
    const port = Number(mb.smtp_port) || 465;
    return nodemailer.createTransport({
      // 465 = šifrované od začiatku, 587 = STARTTLS (šifrovanie je povinné).
      // Bez šifrovania len keď ho niekto v schránke výslovne vypne.
      host: mb.smtp_host, port, secure: port === 465 && mb.smtp_secure !== false,
      requireTLS: port !== 465 && mb.smtp_secure !== false, ignoreTLS: mb.smtp_secure === false,
      auth: { user: mb.username || mb.email, pass: password },
      connectionTimeout: 8000, greetingTimeout: 8000,
    });
  }

  /** Priečinok „Odoslané" — podľa označenia servera, inak podľa bežných názvov. */
  async function findSent(client) {
    const list = await client.list();
    const special = list.find(f => f.specialUse === '\\Sent');
    if (special) return special.path;
    const mena = ['Sent', 'INBOX.Sent', 'Sent Items', 'Sent Messages', 'Odoslané', 'INBOX.Odoslané', 'Gesendet', 'Gesendete Elemente'];
    const f = list.find(x => mena.some(m => m.toLowerCase() === String(x.path).toLowerCase()));
    return f ? f.path : null;
  }

  function password(mb) { return S.decrypt(mb.secret_enc); }

  const casovac = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('časový limit')), ms));
  const msgIdOf = (raw) => (String(raw).match(/^Message-ID:\s*(<[^>]+>)/mi) || [])[1] || null;

  /**
   * Odošle e-mail zo schránky a zapíše ho — jedna cesta pre Správy
   * (danubra-mail-send) aj oslovovanie firiem (danubra-outreach-send):
   *
   *   1. správa sa poskladá raz (MailComposer) a odíde cez SMTP schránky,
   *   2. kópia ide do priečinka Odoslané (IMAP APPEND) — keď nevyjde, e-mail
   *      je aj tak odoslaný. `copy` = iná podoba kópie s tým istým
   *      Message-ID (oslovenie: bez sledovacieho obrázka, aby sa otvorenie
   *      vlastnej kópie v Outlooku nerátalo ako otvorenie u firmy),
   *   3. riadok v danubra_mail_messages s Message-ID (podľa neho sa potom
   *      spáruje odpoveď), priradený k človeku / odberateľovi / firme,
   *   4. firma z marketingu: posledný kontakt a z „Nová" na „Oslovená".
   *
   * @param {Object} mb  schránka (riadok danubra_mailboxes)
   * @param {Object} o   { user, to, cc, bcc (adresy {address,name}), subject, text, html,
   *                       inReplyTo, references, attachments (nodemailer), attachmentsMeta,
   *                       headers, links: { worker_id, partner_id, lead_id }, copy: { html, text },
   *                       store: { html_body, text_body } }
   * @returns {Promise<{ id, messageId, sentAt, sentFolder, row }>}
   */
  async function sendAndStore(mb, o = {}) {
    const MailComposer = require('nodemailer/lib/mail-composer');
    const M = require('./mail.js');
    const pass = password(mb);
    const to = o.to || [], cc = o.cc || [], bcc = o.bcc || [];
    const subject = String(o.subject || '').slice(0, 500);
    const text = String(o.text || '');
    const mail = {
      from: { name: mb.display_name || mb.name || '', address: mb.email },
      to: to.map(M.fmtAddress), cc: cc.map(M.fmtAddress), bcc: bcc.map(M.fmtAddress),
      subject, text, html: o.html,
      inReplyTo: o.inReplyTo || undefined, references: o.references || undefined,
      attachments: o.attachments || [], headers: o.headers || undefined,
    };
    // Správa sa poskladá raz: tá istá ide cez SMTP aj do Odoslaných.
    const raw = await new MailComposer(mail).compile().build();
    const messageId = msgIdOf(raw);
    const envelope = { from: mb.email, to: [...to, ...cc, ...bcc].map(a => a.address) };
    await smtp(mb, pass).sendMail({ envelope, raw });
    const sentAt = new Date().toISOString();

    let sentFolder = null;
    try {
      const kopia = o.copy && messageId
        ? await new MailComposer({ ...mail, messageId, html: o.copy.html, text: o.copy.text != null ? o.copy.text : text }).compile().build()
        : raw;
      const client = imap(mb, pass);
      await Promise.race([client.connect(), casovac(5000)]);
      const folder = mb.sent_folder || await findSent(client);
      if (folder) { await Promise.race([client.append(folder, kopia, ['\\Seen']), casovac(5000)]); sentFolder = folder; }
      await client.logout();
    } catch (e) { /* bez kópie v Odoslaných */ }

    const links = o.links || {};
    const auto = M.matchEntities([...to, ...cc], await (async () => {
      const [w, p, l] = await Promise.all([
        // Service role — archivovaní (migrácia 066) sa k e-mailu nepriradia.
        supabase.from('danubra_workers').select('id,email').not('email', 'is', null).is('archived_at', null).limit(5000),
        supabase.from('danubra_partners').select('id,email').not('email', 'is', null).is('archived_at', null).limit(5000),
        supabase.from('danubra_leads').select('id,email').not('email', 'is', null).limit(10000),
      ]);
      return { workers: w.data || [], partners: p.data || [], leads: l.data || [] };
    })());
    const store = o.store || {};
    const row = {
      mailbox_id: mb.id, folder: sentFolder || mb.sent_folder || 'Sent', uid: null, direction: 'out', seen: true,
      message_id: messageId, in_reply_to: o.inReplyTo || null, refs: o.references || null,
      thread_key: M.threadKey({ references: o.references, inReplyTo: o.inReplyTo, messageId, subject }),
      from_email: mb.email, from_name: mb.display_name || mb.name, to_list: to, cc_list: cc,
      subject: subject || '(bez predmetu)', sent_at: sentAt, snippet: M.snippet(store.text_body != null ? store.text_body : text),
      text_body: store.text_body != null ? store.text_body : text, html_body: store.html_body || null,
      attachments: o.attachmentsMeta || [],
      worker_id: links.worker_id || auto.worker_id, partner_id: links.partner_id || auto.partner_id,
      lead_id: links.lead_id || auto.lead_id, created_by: o.user ? o.user.id : null,
    };
    const { data: saved } = await supabase.from('danubra_mail_messages').insert(row).select('id').single();
    if (row.lead_id) {
      await supabase.from('danubra_leads').update({ last_contact_at: sentAt }).eq('id', row.lead_id);
      await supabase.from('danubra_leads').update({ status: 'contacted' }).eq('id', row.lead_id).eq('status', 'new');
    }
    return { id: (saved && saved.id) || null, messageId, sentAt, sentFolder, row };
  }

  /** Chyba zo SMTP zrozumiteľne (zlé heslo → kam ísť ho opraviť). */
  function smtpError(e) {
    const t = String((e && (e.responseText || e.message)) || e);
    return /auth|535|534|credentials/i.test(t) ? 'Schránka odmietla prihlásenie — skontrolujte heslo v Nastaveniach → Schránky.' : t.slice(0, 300);
  }

  return { userFrom, isAdmin, canUse, mailbox, imap, smtp, findSent, password, sendAndStore, smtpError };
};
