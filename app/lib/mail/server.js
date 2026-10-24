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

module.exports = function server(supabase) {
  async function userFrom(event) {
    const h = (event && event.headers) || {};
    const jwt = String(h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return null;
    const { data } = await supabase.auth.getUser(jwt);
    return (data && data.user) || null;
  }

  /** Admin appky. Kým nie je založený nikto, smie prvý prihlásený (ako inde v appke). */
  async function isAdmin(userId) {
    const { data } = await supabase.from('danubra_members').select('user_id,role,active').limit(500);
    const rows = data || [];
    if (!rows.length) return true;
    return rows.some(m => m.user_id === userId && m.role === 'admin' && m.active !== false);
  }

  async function canUse(userId, mailboxId) {
    if (await isAdmin(userId)) return true;
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

  return { userFrom, isAdmin, canUse, mailbox, imap, smtp, findSent, password };
};
