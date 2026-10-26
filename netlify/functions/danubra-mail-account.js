// ============================================================================
// DANUBRA — Pošta: schránky (pridať, upraviť, otestovať, prístupy)
// ============================================================================
// Len administrátor appky. Heslo príde raz, zašifruje sa (lib/mail/secret.js)
// a do prehliadača sa už nikdy nevráti.
//
//   POST { action: 'save', mailbox: {...}, password?, access?: [userId] }
//   POST { action: 'test', mailbox: {...} | { id }, password? }
//   POST { action: 'deactivate', id }
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MAIL_SECRET (voliteľné)
// ============================================================================
const { createClient } = require('@supabase/supabase-js');
const S = require('../../app/lib/mail/secret.js');
const M = require('../../app/lib/mail/mail.js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);
const srv = require('../../app/lib/mail/server.js')(supabase);

const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const out = (code, body) => ({ statusCode: code, headers: H, body: JSON.stringify(body) });

const POLIA = ['name', 'email', 'display_name', 'imap_host', 'imap_port', 'imap_secure', 'smtp_host', 'smtp_port',
  'smtp_secure', 'username', 'signature', 'sent_folder', 'signature_card'];

function clean(mb = {}) {
  const r = {};
  for (const k of POLIA) if (mb[k] !== undefined) r[k] = mb[k];
  if (r.email) r.email = String(r.email).trim().toLowerCase();
  if (!r.username && r.email) r.username = r.email;
  ['imap_port', 'smtp_port'].forEach(k => { if (r[k] != null) r[k] = Number(r[k]) || null; });
  // Vizitka do podpisu — len známe polia, krátke texty.
  if (r.signature_card != null) {
    const c = r.signature_card || {};
    const t = (v, n = 120) => String(v == null ? '' : v).trim().slice(0, n);
    r.signature_card = { enabled: !!c.enabled, name: t(c.name), role: t(c.role), phone: t(c.phone, 40), lang: c.lang === 'de' ? 'de' : 'sk',
      web: t(c.web, 80), cta_label: t(c.cta_label, 80), cta_url: /^https?:\/\//.test(String(c.cta_url || '')) ? t(c.cta_url, 300) : '', cta: c.cta !== false };
  }
  return r;
}

const casovac = (ms, co) => new Promise((_, rej) => setTimeout(() => rej(new Error(`${co}: server neodpovedal včas`)), ms));

async function test(mb, password) {
  const res = { imap: { ok: false }, smtp: { ok: false }, sent_folder: null };
  const client = srv.imap(mb, password);
  try {
    await Promise.race([client.connect(), casovac(8000, 'IMAP')]);
    res.sent_folder = await srv.findSent(client).catch(() => null);
    res.imap.ok = true;
  } catch (e) {
    res.imap.error = /auth|login|credentials|AUTHENTICATIONFAILED/i.test(`${e.message || ''} ${e.responseText || ''}`)
      ? 'Nesprávne meno alebo heslo.' : String(e.responseText || e.message || e).slice(0, 200);
  } finally { try { await client.logout(); } catch (e) { /* už je zavreté */ } }
  try {
    await Promise.race([srv.smtp(mb, password).verify(), casovac(8000, 'SMTP')]);
    res.smtp.ok = true;
  } catch (e) {
    res.smtp.error = /auth|535|534|credentials/i.test(String(e.message)) ? 'Nesprávne meno alebo heslo.' : String(e.message || e).slice(0, 200);
  }
  return res;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return out(405, { error: 'Nepovolená metóda' });
  const user = await srv.userFrom(event);
  if (!user) return out(401, { error: 'Neprihlásený používateľ.' });
  if (!await srv.isAdmin(user.id)) return out(403, { error: 'Schránky spravuje len administrátor.' });
  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch { return out(400, { error: 'Neplatné telo požiadavky.' }); }

  try {
    if (b.action === 'deactivate') {
      await supabase.from('danubra_mailboxes').update({ active: false }).eq('id', b.id);
      return out(200, { ok: true });
    }

    if (b.action === 'test') {
      const stored = b.mailbox && b.mailbox.id ? await srv.mailbox(b.mailbox.id) : null;
      const mb = { ...(stored || {}), ...clean(b.mailbox || {}) };
      const pass = b.password || (stored && stored.secret_enc ? S.decrypt(stored.secret_enc) : '');
      if (!pass) return out(400, { error: 'Zadajte heslo schránky.' });
      const r = await test(mb, pass);
      if (stored && r.sent_folder && !stored.sent_folder) {
        await supabase.from('danubra_mailboxes').update({ sent_folder: r.sent_folder }).eq('id', stored.id);
      }
      return out(200, r);
    }

    if (b.action === 'save') {
      const row = clean(b.mailbox || {});
      if (!M.emailOk(row.email)) return out(400, { error: 'Neplatná e-mailová adresa.' });
      if (!row.imap_host || !row.smtp_host) return out(400, { error: 'Doplňte server IMAP aj SMTP (alebo vyberte hosting).' });
      if (!row.name) row.name = row.email;
      if (b.password) row.secret_enc = S.encrypt(b.password);
      let id = b.mailbox && b.mailbox.id;
      if (id) {
        const { error } = await supabase.from('danubra_mailboxes').update({ ...row, active: true }).eq('id', id);
        if (error) throw error;
      } else {
        if (!b.password) return out(400, { error: 'Zadajte heslo schránky.' });
        const { data, error } = await supabase.from('danubra_mailboxes').insert({ ...row, active: true, created_by: user.id }).select('id').single();
        if (error) throw error;
        id = data.id;
      }
      if (Array.isArray(b.access)) {
        const { data: old } = await supabase.from('danubra_mailbox_access').select('user_id').eq('mailbox_id', id);
        const chce = new Set(b.access.filter(Boolean));
        const rows = [...new Set([...chce, ...(old || []).map(o => o.user_id)])]
          .map(u => ({ mailbox_id: id, user_id: u, active: chce.has(u) }));
        if (rows.length) {
          const { error } = await supabase.from('danubra_mailbox_access').upsert(rows, { onConflict: 'mailbox_id,user_id' });
          if (error) throw error;
        }
      }
      return out(200, { ok: true, id });
    }
    return out(400, { error: 'Neznáma akcia.' });
  } catch (e) {
    return out(500, { error: String((e && e.message) || e).slice(0, 300) });
  }
};
