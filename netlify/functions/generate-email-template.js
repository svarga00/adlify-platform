// ==========================================
// GENERATE EMAIL TEMPLATE
//
// Vstup: { goal, segment, tone, keyHook, language }
// Výstup: { subject, plainText, suggestedSlug, suggestedName }
//
// Používa Anthropic Claude na vygenerovanie outreach/transakčnej
// šablóny. Výstup dodržiava syntax:
//   {{variables}} na personalizáciu
//   [[Text CTA|{{audit_request_url}}]] na tlačidlo
//
// Env: ANTHROPIC_API_KEY
// ==========================================

const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `Si copywriter píšuci krátke cold outreach emaily pre digitálnu marketingovú agentúru.

POVINNÉ PRAVIDLÁ:
1. Výstup je **plain text** v slovenčine (žiadne markdown, žiadne HTML tagy).
2. Používaj tieto placeholder premenné KDE JE TO VHODNÉ (presne v dvojitých zložených zátvorkách):
   {{greeting}}           — už obsahuje "Pán X" alebo "Dobrý deň", NEpridávaj za to meno
   {{contact_name}}       — iba meno (použi ak sa hodí, inak preskoč)
   {{company}}            — názov firmy
   {{domain}}             — doména
   {{industry}}, {{industry_hook}}, {{city}}
   {{audit_request_url}}  — URL na audit request
   {{sender_name}}, {{sender_title}}
3. CTA tlačidlo napíš v tvare na SAMOSTATNOM riadku:
   [[Text tlačidla|{{audit_request_url}}]]
4. Email má 3-6 odstavcov. Bez floskúl. Krátke vety. Konkrétne čísla ak dávajú zmysel.
5. Podpis vždy:
   S pozdravom,
   {{sender_name}}
   {{sender_title}}
6. Voliteľné P.S. na konci (1 veta, dáva zmysel ak zvyšuje relevanciu).
7. Predmet: maximum 60 znakov, obsahuje aspoň jednu premennú (typicky {{company}}).

Vráť LEN čistý JSON objekt (žiadny text okolo, žiadny markdown code fence) v tvare:
{"subject":"...","plainText":"...","suggestedSlug":"cold_nazov","suggestedName":"Cold – Krátky názov"}`;

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method not allowed' };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY nie je nastavený v Netlify Environment. Dashboard → Site settings → Environment variables.' }),
    };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Neplatný JSON' }) }; }

  const { goal = '', segment = '', tone = 'priamy', keyHook = '' } = payload;
  if (!goal && !segment && !keyHook) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Aspoň jedno z: goal / segment / keyHook je povinné.' }) };
  }

  const userMessage = `Vygeneruj cold outreach email.

Cieľ emailu: ${goal || 'získať audit request'}
Segment / odvetvie: ${segment || 'všeobecné (neznáme)'}
Hlavný hook / uhol: ${keyHook || '(nešpecifikované, vymysli silný úvodný hook)'}
Tón: ${tone} (napr. priamy, priateľský, profesionálny, trochu humorný)

Vráť čistý JSON objekt bez ďalšieho textu.`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = (response.content || []).map(c => c.text || '').join('').trim();
    // Pokus o parse JSON — zbaví sa prípadných ```json ... ``` wrappers
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Model nevrátil platný JSON');
      parsed = JSON.parse(match[0]);
    }

    if (!parsed.subject || !parsed.plainText) {
      throw new Error('Chýba subject alebo plainText v odpovedi modelu');
    }

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: String(parsed.subject).trim(),
        plainText: String(parsed.plainText).trim(),
        suggestedSlug: String(parsed.suggestedSlug || 'cold_ai').trim(),
        suggestedName: String(parsed.suggestedName || 'Cold – AI generovaná').trim(),
        usage: response.usage || null,
      }),
    };
  } catch (err) {
    console.error('generate-email-template error', err);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message || 'Chyba pri generovaní šablóny' }),
    };
  }
};
