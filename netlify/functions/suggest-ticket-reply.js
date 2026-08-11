// AI návrh odpovede na ticket. Frontend pošle ticketId, funkcia si server-side
// načíta ticket + konverzáciu + klienta zo Supabase a nechá Claude napísať
// profesionálnu odpoveď v slovenčine. Vracia plain text návrh ktorý si admin
// upraví v textarea pred odoslaním.
//
// Model: claude-haiku-4-5-20251001 (rýchlosť + cena ~$0.001 per ticket)
// Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SYSTEM_PROMPT = `Si support špecialista slovenskej digitálnej marketingovej agentúry Adlify. Odpovedáš klientom na ich otázky v tickete.

PRAVIDLÁ:
1. Píš v slovenčine, plain text (bez markdown, bez HTML).
2. Tón: profesionálny ale priateľský, vykáme, krátke vety, bez floskúl.
3. Maximálne 2-4 krátke odstavce. Zameraj sa na podstatu otázky.
4. Konkrétne odpovede pred všeobecnými. Ak otázka má viac častí, odpovedz na všetky stručne.
5. Ak nepoznáš detail (cena konkrétnej služby, termín, stav účtu klienta) → napíš že to overíš s tímom / kolegom a vrátiš sa s odpoveďou v priebehu dňa. NIKDY si nevymýšľaj čísla, dátumy alebo fakty ktoré nemáš v kontexte.
6. Nepodpisuj sa — admin sa podpíše sám pri odoslaní.
7. Bez pozdravu "Dobrý deň" na začiatku, bez "S pozdravom" na konci. Začni rovno odpoveďou na otázku (max 1 krátka uvítacia veta typu "Vďaka za správu" ak to dáva zmysel).
8. Žiadne emoji. Žiadne marketingové slogany. Žiadne self-promo.
9. Ak je otázka technická a nevieš na ňu odpovedať z kontextu, nepokúšaj sa odhadovať — povedz že overíš s tímom.

Vráť IBA návrh odpovede ako plain text. Bez JSON, bez code fence, bez úvodu typu "Tu je návrh:".`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function buildConversationBlock(ticket, client, replies) {
  const lines = [];
  lines.push(`Klient: ${client?.company_name || ticket.contact_name || 'Neznámy'}`);
  if (client?.industry) lines.push(`Odvetvie klienta: ${client.industry}`);
  lines.push('');
  lines.push(`--- PÔVODNÁ OTÁZKA (${new Date(ticket.created_at).toLocaleDateString('sk-SK')}) ---`);
  lines.push(`Predmet: ${ticket.subject}`);
  if (ticket.description) {
    lines.push('');
    lines.push(ticket.description);
  }
  lines.push('');

  const visible = (replies || []).filter(r => !r.is_internal);
  if (visible.length > 0) {
    lines.push('--- HISTÓRIA KONVERZÁCIE ---');
    for (const r of visible) {
      const who = r.is_from_client ? `KLIENT (${r.from_email || 'email'})` : `MY (Adlify tím)`;
      const when = new Date(r.created_at).toLocaleDateString('sk-SK');
      lines.push(`[${when}] ${who}:`);
      lines.push(r.content);
      lines.push('');
    }
  }

  // Posledná správa od klienta = to, na čo treba odpovedať
  const lastFromClient = [...visible].reverse().find(r => r.is_from_client);
  if (lastFromClient) {
    lines.push('--- NAJNOVŠIA SPRÁVA OD KLIENTA (odpovedz na ňu) ---');
    lines.push(lastFromClient.content);
  } else {
    lines.push('--- ÚLOHA ---');
    lines.push('Klient ešte neodpovedal na ticket. Napíš úvodnú odpoveď na jeho pôvodnú otázku (predmet + popis vyššie).');
  }

  return lines.join('\n');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method not allowed' };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY chýba' }) };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Bad JSON' }) }; }

  const { ticketId, extraInstruction } = payload;
  if (!ticketId) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Chýba ticketId' }) };

  try {
    // 1. Load ticket
    const { data: ticket, error: tErr } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', ticketId)
      .single();
    if (tErr || !ticket) throw new Error('Ticket nenájdený');

    // 2. Load client (best-effort)
    let client = null;
    if (ticket.client_id) {
      const { data } = await supabase
        .from('clients')
        .select('id, company_name, email, industry')
        .eq('id', ticket.client_id)
        .maybeSingle();
      client = data;
    }

    // 3. Load replies (chronologicky)
    const { data: replies } = await supabase
      .from('ticket_replies')
      .select('content, created_at, is_internal, is_from_client, from_email, author_name')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    // 4. Build prompt
    let userPrompt = buildConversationBlock(ticket, client, replies);
    if (extraInstruction) {
      userPrompt += `\n\n--- DODATOČNÁ INŠTRUKCIA OD ADMINA ---\n${extraInstruction}`;
    }

    // 5. Call Claude (priamo fetch — bez SDK aby sme nemuseli pridať dep)
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    const claudeJson = await claudeRes.json();
    if (claudeJson.error) throw new Error(claudeJson.error.message || 'Claude API error');

    const suggestion = (claudeJson.content || [])
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n')
      .trim();

    if (!suggestion) throw new Error('Claude vrátil prázdnu odpoveď');

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        suggestion,
        model: 'claude-haiku-4-5-20251001',
        usage: claudeJson.usage,
      }),
    };
  } catch (err) {
    console.error('[suggest-ticket-reply] error:', err);
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};
