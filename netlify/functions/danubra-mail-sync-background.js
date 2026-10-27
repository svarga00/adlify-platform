// ============================================================================
// DANUBRA — Pošta: stiahnuť nové e-maily zo schránok (na pozadí)
// ============================================================================
// Pre každú schránku (alebo jednu, keď ju appka pošle) stiahne z priečinkov
// Doručené a Odoslané všetko nové od poslednej synchronizácie (podľa UID).
// Pri prvom pripojení len posledných 150 e-mailov z každého priečinka.
//
// Každý e-mail sa rozoberie (mailparser), prílohy idú do úložiska, e-mail sa
// priradí k živnostníkovi / odberateľovi / novej firme podľa adresy.
// Odoslaný z appky (už je v databáze) sa nezdvojí — spáruje sa podľa
// Message-ID.
//
// Spúšťa ju appka (tlačidlo Obnoviť, s prihlásením) a každých 10 minút
// automat (danubra-mail-sync-cron, s podpísaným kľúčom).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MAIL_SECRET (voliteľné)
// ============================================================================
const { createClient } = require('@supabase/supabase-js');
const { simpleParser } = require('mailparser');
const S = require('../../app/lib/mail/secret.js');
const M = require('../../app/lib/mail/mail.js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);
const srv = require('../../app/lib/mail/server.js')(supabase);
const BUCKET = 'danubra-docs';
const PRVY_RAZ = 150;
const NAJVIAC_NARAZ = 400;
const MAX_PRILOHA = 15 * 1024 * 1024;

const safe = (s) => String(s || 'priloha').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'priloha';

async function entities() {
  const [w, p, l] = await Promise.all([
    // Service role — archivovaní (migrácia 066) sa k e-mailu nepriradia.
    supabase.from('danubra_workers').select('id,email').not('email', 'is', null).is('archived_at', null).limit(5000),
    supabase.from('danubra_partners').select('id,email').not('email', 'is', null).is('archived_at', null).limit(5000),
    supabase.from('danubra_leads').select('id,email').not('email', 'is', null).limit(10000),
  ]);
  return { workers: w.data || [], partners: p.data || [], leads: l.data || [] };
}

async function syncFolder(client, mb, folder, state, ents) {
  const lock = await client.getMailboxLock(folder);
  try {
    const st = state[folder] || {};
    const validity = String(client.mailbox.uidValidity || '');
    let last = st.v === validity ? Number(st.last) || 0 : 0;
    const uids = (await client.search({ uid: `${last + 1}:*` }, { uid: true })) || [];
    let nove = uids.filter(u => u > last).sort((a, b) => a - b);
    if (!last && nove.length > PRVY_RAZ) nove = nove.slice(-PRVY_RAZ);
    nove = nove.slice(0, NAJVIAC_NARAZ);
    let pocet = 0;
    for (const uid of nove) {
      const msg = await client.fetchOne(String(uid), { uid: true, source: true, flags: true }, { uid: true });
      if (!msg || !msg.source) { last = Math.max(last, uid); continue; }
      const parsed = await simpleParser(msg.source);
      const out = folder !== 'INBOX' && mb.sent_folder === folder;
      const row = M.fromParsed(parsed, { mailbox_id: mb.id, folder, uid, direction: out ? 'out' : 'in',
        seen: out || (msg.flags && msg.flags.has('\\Seen')) });
      const protistrana = out ? [...row.to_list, ...row.cc_list] : [{ address: row.from_email }];
      Object.assign(row, M.matchEntities(protistrana, ents));

      // Prílohy do úložiska.
      const att = [];
      for (const [i, a] of (parsed.attachments || []).filter(x => !x.related).entries()) {
        if (!a.content || a.size > MAX_PRILOHA) { att.push({ name: a.filename || 'príloha', type: a.contentType, size: a.size, skipped: true }); continue; }
        const path = `mail/${mb.id}/${safe(folder)}/${uid}-${i}-${safe(a.filename)}`;
        const up = await supabase.storage.from(BUCKET).upload(path, a.content, { contentType: a.contentType || 'application/octet-stream', upsert: true });
        att.push({ name: a.filename || 'príloha', type: a.contentType, size: a.size, storage_path: up.error ? null : path });
      }
      row.attachments = att;

      // Odoslaný z appky už v databáze je (bez UID) — doplní sa mu UID, nezdvojí sa.
      let hotovo = false;
      if (row.message_id) {
        const { data: ex } = await supabase.from('danubra_mail_messages').select('id,uid')
          .eq('mailbox_id', mb.id).eq('message_id', row.message_id).limit(1);
        if (ex && ex[0] && ex[0].uid == null) {
          await supabase.from('danubra_mail_messages').update({ uid, folder }).eq('id', ex[0].id);
          hotovo = true;
        } else if (ex && ex[0] && ex[0].uid != null) hotovo = true;
      }
      if (!hotovo) {
        const { error } = await supabase.from('danubra_mail_messages').insert(row);
        if (error && !/duplicate|unique/i.test(error.message)) throw error;
      }
      last = Math.max(last, uid);
      pocet++;
    }
    state[folder] = { v: validity, last };
    return pocet;
  } finally { lock.release(); }
}

async function syncMailbox(mb, ents) {
  const client = srv.imap(mb, srv.password(mb));
  const state = { ...(mb.sync_state || {}) };
  let pocet = 0;
  try {
    await client.connect();
    if (!mb.sent_folder) {
      mb.sent_folder = await srv.findSent(client).catch(() => null);
      if (mb.sent_folder) await supabase.from('danubra_mailboxes').update({ sent_folder: mb.sent_folder }).eq('id', mb.id);
    }
    for (const f of ['INBOX', mb.sent_folder].filter(Boolean)) pocet += await syncFolder(client, mb, f, state, ents);
    await supabase.from('danubra_mailboxes').update({ sync_state: state, last_sync_at: new Date().toISOString(), sync_error: null }).eq('id', mb.id);
  } catch (e) {
    await supabase.from('danubra_mailboxes').update({ sync_state: state, last_sync_at: new Date().toISOString(),
      sync_error: String(e.responseText || e.message || e).slice(0, 300) }).eq('id', mb.id);
  } finally { try { await client.logout(); } catch (e) { /* zavreté */ } }
  return pocet;
}

exports.handler = async (event) => {
  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch { b = {}; }
  const h = event.headers || {};
  const cron = S.cronOk(h['x-danubra-cron'] || h['X-Danubra-Cron']);
  const user = cron ? null : await srv.userFrom(event);
  if (!cron && !user) return;

  let q = supabase.from('danubra_mailboxes').select('*').eq('active', true);
  if (b.mailbox_id) q = q.eq('id', b.mailbox_id);
  const { data: boxes } = await q;
  const ents = await entities();
  for (const mb of boxes || []) {
    if (!mb.secret_enc) continue;
    if (user && !await srv.canUse(user.id, mb.id)) continue;
    await syncMailbox(mb, ents);
  }
};

exports._test = { syncFolder, syncMailbox };
