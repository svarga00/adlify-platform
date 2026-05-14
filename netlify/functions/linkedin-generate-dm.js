// Generuje krátku LinkedIn DM správu (max 300 znakov) pre prospekta.
// POST { prospectId, angle? } → { message, connectUrl, messageUrl }

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const SYSTEM = `Si copywriter pre LinkedIn cold outreach na Slovensku.

PRAVIDLÁ:
- Max 280 znakov (LinkedIn DM limit je 300, necháme buffer).
- Slovenčina, neformálny ale profesionálny tón.
- Žiadne kopírovanie typických templates ("Saw your profile and...").
- Priama, personálna, s konkrétnym hook-om z firmy/odvetvia.
- Bez linkov (LinkedIn ich kryje). Žiadne {{vars}}.
- Koniec otázkou alebo jemným CTA ("Mám 2 nápady ak máte chvíľu?").

VRÁŤ LEN JSON:
{"message": "text správy"}`;

exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY missing' }) };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: cors, body: 'Bad JSON' }; }

  const { prospectId, angle = '' } = payload;
  if (!prospectId) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'prospectId required' }) };

  try {
    const { data: prospect } = await supabase.from('prospects')
      .select('company_name, domain, contact_person, industry, city, linkedin_url')
      .eq('id', prospectId).single();
    if (!prospect) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Prospect not found' }) };

    const userMsg = `Napíš LinkedIn DM pre:
- Kontakt: ${prospect.contact_person || 'kontaktná osoba z firmy'}
- Firma: ${prospect.company_name || prospect.domain}
- Odvetvie: ${prospect.industry || '(neznáme)'}
- Mesto: ${prospect.city || '(neznáme)'}
- Angle/hook: ${angle || 'ponuka bezplatného marketingového auditu'}

Vráť čistý JSON { "message": "..." } bez ďalšieho textu.`;

    const client = new Anthropic({ apiKey });
    const r = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    });
    const text = (r.content || []).map(c => c.text || '').join('').trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { message: cleaned };
    }

    const message = String(parsed.message || '').slice(0, 280);

    // Deep link — user klikne a otvorí sa LinkedIn compose
    let messageUrl = null;
    if (prospect.linkedin_url) {
      // Extract profile slug from URL
      const m = prospect.linkedin_url.match(/linkedin\.com\/(?:in|company)\/([^/?#]+)/i);
      if (m) {
        // LinkedIn messaging compose — works on desktop and mobile
        messageUrl = `https://www.linkedin.com/messaging/compose/?recipient=${encodeURIComponent(m[1])}`;
      }
    }

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, messageUrl, characters: message.length }),
    };
  } catch (err) {
    console.error('[linkedin-generate-dm]', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
