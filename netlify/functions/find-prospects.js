// netlify/functions/find-prospects.js
//
// AI-driven lead suggestion. Vstup: { segment, city, count, hints }.
// Výstup: { prospects: [ { company_name, domain, industry, city, reason } ... ] }
//
// Používa Claude na vygenerovanie kandidátov. User si ich preverí a pridá
// výberom cez UI. NIE je to finálny zoznam — je to štartovací bod na
// manuálne overenie (niektoré firmy môžu byť neaktuálne / fake).

const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `Si výskumník lead generácie na Slovensku. Užívateľ ti dá segment a mesto.

Tvoja úloha: vráť zoznam reálnych firiem ktoré môžu byť dobrými prospektmi pre oslovenie marketingovou agentúrou.

POVINNÉ:
- Firmy musia byť reálne existujúce (v SR), malé-stredné (SMB), nie korporáty.
- Pre každú firmu doplň aj typický predpokladaný problém / dôvod prečo by ich to zaujalo (1 krátka veta).
- Ak nepoznáš doménu, vráť prázdny string — radšej neuhádaj.
- Kontaktné osoby, emaily ani telefóny NEVYPĹŇAJ (nepoznáš ich).

VÝSTUP — iba čistý JSON (bez markdown):
{
  "prospects": [
    {
      "company_name": "Názov firmy",
      "domain": "firma.sk",
      "industry": "krátky popis odvetvia",
      "city": "Mesto",
      "reason": "Prečo ich osloviť — 1 veta"
    }
  ]
}`;

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method not allowed' };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY chýba v Netlify env.' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Neplatný JSON' }) }; }

  const { segment = '', city = '', count = 10, hints = '' } = payload;
  if (!segment && !hints) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'segment alebo hints sú povinné.' }) };
  }

  const userMsg = `Vráť ${Math.min(50, Math.max(1, parseInt(count) || 10))} reálnych firiem zo Slovenska.

Segment / odvetvie: ${segment || '(ľubovoľný)'}
Mesto / región: ${city || '(celé Slovensko)'}
Ďalšie kritériá: ${hints || '(žiadne)'}

Vráť čistý JSON, žiadny komentár okolo.`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    });

    const text = (response.content || []).map(c => c.text || '').join('').trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('Model nevrátil platný JSON');
      parsed = JSON.parse(m[0]);
    }

    const prospects = Array.isArray(parsed.prospects) ? parsed.prospects : [];
    // Sanitize
    const cleaned2 = prospects
      .filter(p => p && p.company_name)
      .map(p => ({
        company_name: String(p.company_name).trim().slice(0, 200),
        domain: p.domain ? String(p.domain).trim().toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/.*$/,'').slice(0, 120) : '',
        industry: p.industry ? String(p.industry).trim().slice(0, 120) : '',
        city: p.city ? String(p.city).trim().slice(0, 80) : '',
        reason: p.reason ? String(p.reason).trim().slice(0, 300) : '',
      }));

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospects: cleaned2, usage: response.usage || null }),
    };
  } catch (err) {
    console.error('find-prospects error', err);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message || 'Chyba pri hľadaní' }),
    };
  }
};
