// Resend inbound webhook — prijíma email odpovede klientov a pridáva ich
// ako reply do príslušného ticketu.
//
// Setup v Resend dashboarde:
//   Inbound → Add domain → support@adlify.eu (alebo iný alias)
//   Forward URL: https://adlify.eu/.netlify/functions/ticket-inbound
//
// Threading: ticket short id (8 znakov) je v Subject ako "[Adlify #abc12345]".
// Reply-To z odoslanej správy je "support+ticket_<full-uuid>@adlify.eu" čo dáva
// druhú možnosť párovania (Resend zachová To: address v inbound payloade).

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const cors = { 'Access-Control-Allow-Origin': '*' };

function parseShortIdFromSubject(subject) {
  if (!subject) return null;
  const m = String(subject).match(/\[Adlify\s*#([a-f0-9]{8})\]/i);
  return m ? m[1].toLowerCase() : null;
}

function parseTicketIdFromTo(toAddresses) {
  if (!toAddresses) return null;
  const list = Array.isArray(toAddresses) ? toAddresses : [toAddresses];
  for (const addr of list) {
    const email = typeof addr === 'string' ? addr : (addr.email || addr.address || '');
    const m = String(email).match(/ticket_([a-f0-9-]{36})@/i);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

function stripReplyChain(text) {
  if (!text) return '';
  // Odstrihni typické quote bloky (gmail/outlook/apple mail)
  const cutPatterns = [
    /\n\s*On\s+.+\s+wrote:\s*\n/i,
    /\n\s*Dňa\s+.+\s+(napísal|napísala|wrote):\s*\n/i,
    /\n-{2,}\s*Original Message\s*-{2,}\n/i,
    /\n>+\s*From:\s*.+\n/i,
    /\nOd:\s*.+\nDátum:\s*/i,
  ];
  let out = text;
  for (const re of cutPatterns) {
    const idx = out.search(re);
    if (idx > 0) out = out.slice(0, idx);
  }
  return out.trim();
}

function htmlToText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

async function findTicketByShortId(shortId) {
  // tickets.short_id je generovaný stĺpec (substring(id::text, 1, 8)) z migrácie 025
  const { data } = await supabase
    .from('tickets')
    .select('id, subject, status, client_id, first_response_at')
    .eq('short_id', shortId)
    .maybeSingle();
  return data;
}

async function findTicketByFullId(fullId) {
  const { data } = await supabase
    .from('tickets')
    .select('id, subject, status, client_id, first_response_at')
    .eq('id', fullId)
    .maybeSingle();
  return data;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: cors, body: 'Bad JSON' }; }

  try {
    // Resend inbound payload má niekoľko možných tvarov podľa verzie API.
    // Skúsime ošetriť bežné varianty: {from, to, subject, text, html, headers}
    // ako aj wrapper {type:'email.received', data:{...}}.
    const data = payload.data || payload;
    // Case-insensitive header lookup — Resend / Postmark / Mailgun majú rôzny case
    const headersLower = {};
    if (data.headers && typeof data.headers === 'object') {
      for (const [k, v] of Object.entries(data.headers)) headersLower[k.toLowerCase()] = v;
    }
    const fromAddr = (typeof data.from === 'string' ? data.from : (data.from?.email || data.from?.address || data.sender || headersLower['from'] || ''))?.toLowerCase().trim();
    const toRaw = data.to || data.recipient || data.envelope?.to || headersLower['to'] || [];
    const subject = data.subject || headersLower['subject'] || '';
    const text = data.text || data.body_plain || '';
    const html = data.html || data.body_html || '';
    const messageId = data.message_id || data.messageId || headersLower['message-id'] || null;
    const inReplyTo = data.in_reply_to || headersLower['in-reply-to'] || null;

    // 1. Pokús sa nájsť ticket cez To: ticket_<uuid>@adlify.eu
    let ticket = null;
    const fullId = parseTicketIdFromTo(toRaw);
    if (fullId) ticket = await findTicketByFullId(fullId);

    // 2. Fallback: subject "[Adlify #shortid]"
    if (!ticket) {
      const shortId = parseShortIdFromSubject(subject);
      if (shortId) ticket = await findTicketByShortId(shortId);
    }

    if (!ticket) {
      console.warn('[ticket-inbound] no ticket matched for', { fromAddr, subject, toRaw });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, matched: false, reason: 'no_ticket' }) };
    }

    // 3. Dedup: ak rovnaký Message-ID už existuje, skip
    if (messageId) {
      const { data: existing } = await supabase
        .from('ticket_replies')
        .select('id')
        .eq('email_message_id', messageId)
        .maybeSingle();
      if (existing) {
        console.log('[ticket-inbound] duplicate message_id, skip:', messageId);
        return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, duplicate: true }) };
      }
    }

    // 4. Vyčisti telo emailu — preferuj text, fallback na HTML
    const rawBody = text || htmlToText(html);
    const cleanBody = stripReplyChain(rawBody) || rawBody.slice(0, 5000);

    if (!cleanBody) {
      console.warn('[ticket-inbound] empty body for ticket', ticket.id);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, empty: true }) };
    }

    // 5. Insert reply
    const { error: insErr } = await supabase
      .from('ticket_replies')
      .insert({
        ticket_id: ticket.id,
        author_name: fromAddr || 'Klient',
        from_email: fromAddr,
        content: cleanBody,
        is_internal: false,
        is_from_client: true,
        email_message_id: messageId,
        email_in_reply_to: inReplyTo
      });

    if (insErr) throw insErr;

    // 6. Update ticket status: klient odpovedal → 'open' (potrebuje pozornosť)
    const ticketUpdate = { updated_at: new Date().toISOString() };
    if (ticket.status === 'waiting' || ticket.status === 'resolved' || ticket.status === 'closed') {
      ticketUpdate.status = 'open';
    }
    await supabase.from('tickets').update(ticketUpdate).eq('id', ticket.id);

    // 7. In-app notifikácia pre všetkých owner/admin/manager (best-effort)
    try {
      const { data: users } = await supabase
        .from('team_members')
        .select('id')
        .in('role', ['owner', 'admin', 'manager']);
      if (users?.length) {
        const rows = users.map(u => ({
          user_id: u.id,
          type: 'ticket_reply',
          title: `💬 Nová odpoveď v ticket #${ticket.id.slice(0, 8)}`,
          message: `${fromAddr || 'Klient'}: ${cleanBody.slice(0, 120)}${cleanBody.length > 120 ? '…' : ''}`,
          entity_type: 'ticket',
          entity_id: ticket.id,
          action_url: '/admin/#tickets',
        }));
        await supabase.from('notifications').insert(rows);
      }
    } catch (notifErr) {
      console.warn('[ticket-inbound] notification insert failed:', notifErr.message);
    }

    console.log('[ticket-inbound] OK ticket', ticket.id, 'from', fromAddr);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, ticket_id: ticket.id }) };

  } catch (err) {
    console.error('[ticket-inbound] error:', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
