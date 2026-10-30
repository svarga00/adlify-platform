// ============================================================================
// DANUBRA — oslovovanie: zápisy na serveri (len Node, netlify/functions)
// ============================================================================
// Čo sa s e-mailom oslovenia stalo, zapisujú tri miesta — a každé z nich
// má len zavolať jednu funkciu odtiaľto, nech pravidlá nie sú na troch
// miestach trochu inak:
//
//   recordHit         otvorenie / klik (danubra-track, verejné)
//   unsubscribe       odhlásenie odkazom z e-mailu (danubra-unsubscribe)
//   onIncoming        prijatý e-mail: odpoveď alebo nedoručenka
//                     (danubra-mail-sync-background, po uložení e-mailu)
//
// Pravidlá (čo je automat, čo je nedoručenka…) sú v outreach.js a majú testy.
// Tu sa len zapisuje. Chyba tu nikdy nezhodí volajúceho — synchronizácia
// pošty ani odhlásenie nesmú spadnúť preto, že nesedí oslovenie.
//
// Testy: node app/tests/track.test.js
// ============================================================================
const O = require('./outreach.js');

/** Firma ďalej v procese sa „Odpísala" neprepíše späť. */
const REPLY_FROM = ['new', 'contacted'];

/**
 * Úloha „Pripomenúť sa firme X" (nočná kontrola, kľúč outreach:…) stráca
 * zmysel, keď firma odpísala, odhlásila sa alebo e-mail nedošiel — uzavrie sa.
 */
async function closeTasks(supabase, leadId, at) {
  if (!leadId) return 0;
  const { data } = await supabase.from('danubra_tasks').select('id,source_key,status')
    .eq('entity_type', 'lead').eq('entity_id', leadId).in('status', ['open', 'in_progress']);
  const ids = (data || []).filter(t => String(t.source_key || '').startsWith('outreach:')).map(t => t.id);
  for (const id of ids) await supabase.from('danubra_tasks').update({ status: 'done', done_at: at }).eq('id', id);
  return ids.length;
}

/**
 * Otvorenie alebo klik. Neznámy kľúč = nič (vráti null), žiadna chyba.
 * @param {Object} supabase  klient so service role
 * @param {Object} o         { token, kind: 'open'|'click', url, ip, ua, method, secret, now }
 */
async function recordHit(supabase, { token, kind = 'open', url = null, ip = null, ua = '', method = 'GET', secret, now = new Date() } = {}) {
  if (!O.tokenOk(token)) return null;
  const { data: row } = await supabase.from('danubra_outreach').select('id,sent_at,status')
    .eq('token', token).maybeSingle();
  if (!row || !['sent', 'bounced'].includes(row.status)) return null;
  let a = O.automated({ ua, kind, sentAt: row.sent_at, at: new Date(now).toISOString() });
  // Skenery odkazov sa často len „pýtajú" (HEAD) — človek klikne cez GET.
  if (!a.auto && String(method).toUpperCase() === 'HEAD') a = { auto: true, reason: 'len overenie odkazu (HEAD)' };
  const { data, error } = await supabase.rpc('danubra_outreach_hit', {
    p_token: token, p_type: kind, p_url: url, p_ip_hash: O.ipHash(ip, secret), p_user_agent: O.shortUa(ua),
    p_automated: a.auto, p_auto_reason: a.reason,
  });
  if (error) throw new Error(error.message);
  return { id: data || row.id, automated: a.auto, reason: a.reason };
}

/**
 * Odhlásenie z e-mailu oslovenia: adresa do danubra_email_optout (tej už
 * nič nepôjde, ani kampaň), firma „Odhlásená", oslovenie bez pripomenutia
 * a udalosť na časovej osi.
 * @returns {Promise<{ email }|null>}  null = kľúč nepatrí osloveniu
 */
async function unsubscribe(supabase, token, { ip = null, ua = '', secret, now = new Date() } = {}) {
  if (!O.tokenOk(token)) return null;
  const { data: o } = await supabase.from('danubra_outreach').select('id,lead_id,to_email,unsubscribed_at')
    .eq('token', token).maybeSingle();
  if (!o) return null;
  const email = String(o.to_email || '').trim().toLowerCase();
  const at = new Date(now).toISOString();
  if (email) await supabase.from('danubra_email_optout').upsert({ email, source: 'outreach' }, { onConflict: 'email', ignoreDuplicates: true });
  if (o.lead_id) await supabase.from('danubra_leads').update({ status: 'unsubscribed' }).eq('id', o.lead_id);
  if (!o.unsubscribed_at) {
    await supabase.from('danubra_outreach').update({ unsubscribed_at: at, next_followup_at: null }).eq('id', o.id);
    // Ani ďalšie e-maily tej istej firme sa už nepripomínajú.
    if (o.lead_id) await supabase.from('danubra_outreach').update({ next_followup_at: null }).eq('lead_id', o.lead_id);
    await supabase.from('danubra_outreach_events').insert({ outreach_id: o.id, lead_id: o.lead_id, type: 'unsubscribe', at,
      ip_hash: O.ipHash(ip, secret), user_agent: O.shortUa(ua) });
    await closeTasks(supabase, o.lead_id, at);
  }
  return { email };
}

/** Text, v ktorom nedoručenka cituje pôvodnú správu (aj prílohy message/rfc822). */
function dsnText(parsed = {}) {
  const casti = [parsed.text || '', parsed.html || ''];
  for (const a of parsed.attachments || []) {
    if (/rfc822|delivery-status|text\/plain/i.test(String(a.contentType || '')) && a.content) {
      casti.push(Buffer.isBuffer(a.content) ? a.content.toString('utf8').slice(0, 200000) : String(a.content).slice(0, 200000));
    }
  }
  return casti.join('\n');
}

function headerMap(parsed = {}) {
  const out = {};
  const h = parsed.headers;
  if (h && typeof h.forEach === 'function') {
    h.forEach((v, k) => { out[String(k).toLowerCase()] = v && typeof v === 'object' && 'value' in v ? v.value : v; });
  }
  return out;
}

/**
 * Prijatý e-mail uložený do danubra_mail_messages — je to odpoveď na
 * oslovenie, alebo nedoručenka? Páruje sa podľa Message-ID (In-Reply-To,
 * References; pri nedoručenke aj z citovanej pôvodnej správy).
 *
 * @param {Object} supabase  klient so service role
 * @param {Object} o         { row (to, čo sa uložilo), id (uložené id), parsed (mailparser) }
 * @returns {Promise<{ type: 'reply'|'bounce'|'auto_reply', outreach_id }|null>}
 */
async function onIncoming(supabase, { row = {}, id = null, parsed = {} } = {}) {
  if (!row || row.direction !== 'in') return null;
  const headers = headerMap(parsed);
  const ct = headers['content-type'] || '';
  const dsn = O.isDsn({ from: row.from_email, subject: row.subject, contentType: ct });
  const ids = dsn ? O.messageIds(row.in_reply_to, row.refs, dsnText(parsed)) : O.replyIds(row);
  if (!ids.length) return null;
  const { data: rows } = await supabase.from('danubra_outreach')
    .select('id,lead_id,step,status,message_id,replied_at,bounced_at').in('message_id', ids.slice(0, 50));
  const hit = O.matchOutreach(ids, rows || []).filter(r => r.status === 'sent' || r.status === 'bounced')
    .sort((a, b) => (Number(a.step) || 1) - (Number(b.step) || 1));
  if (!hit.length) return null;
  // Najnovší e-mail, na ktorý sa to vzťahuje (pripomenutie cituje aj prvý).
  const o = hit[hit.length - 1];
  const at = row.sent_at || new Date().toISOString();

  if (dsn) {
    if (!o.bounced_at) {
      await supabase.from('danubra_outreach').update({ status: 'bounced', bounced_at: at, next_followup_at: null }).eq('id', o.id);
      await supabase.from('danubra_outreach_events').insert({ outreach_id: o.id, lead_id: o.lead_id, type: 'bounce', at, mail_message_id: id });
      await closeTasks(supabase, o.lead_id, at);
    }
    return { type: 'bounce', outreach_id: o.id };
  }

  // E-mail, ktorý sa nepriradil sám (iná adresa v tej istej firme), patrí k firme.
  if (id && o.lead_id && !row.lead_id) await supabase.from('danubra_mail_messages').update({ lead_id: o.lead_id }).eq('id', id);

  if (O.isAutoReply({ subject: row.subject, headers })) {
    // Dovolenka, mimo kancelárie: zapíše sa, ale pripomenutie platí ďalej.
    await supabase.from('danubra_outreach_events').insert({ outreach_id: o.id, lead_id: o.lead_id, type: 'reply', at,
      automated: true, auto_reason: 'automatická odpoveď', mail_message_id: id });
    return { type: 'auto_reply', outreach_id: o.id };
  }

  if (!o.replied_at) {
    await supabase.from('danubra_outreach').update({ replied_at: at, reply_message_id: id, next_followup_at: null }).eq('id', o.id);
    if (o.lead_id) await supabase.from('danubra_outreach').update({ next_followup_at: null }).eq('lead_id', o.lead_id);
    await closeTasks(supabase, o.lead_id, at);
  }
  await supabase.from('danubra_outreach_events').insert({ outreach_id: o.id, lead_id: o.lead_id, type: 'reply', at, mail_message_id: id });
  if (o.lead_id) {
    await supabase.from('danubra_leads').update({ status: 'replied', last_contact_at: at }).eq('id', o.lead_id).in('status', REPLY_FROM);
  }
  return { type: 'reply', outreach_id: o.id };
}

module.exports = { recordHit, unsubscribe, onIncoming, closeTasks, dsnText, headerMap };
