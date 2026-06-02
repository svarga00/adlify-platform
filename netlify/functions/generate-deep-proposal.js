// ==========================================
// GENERATE DEEP PROPOSAL
//
// Vstup:  { leadId, model?, customNotes? }
// Output: { proposal: {...12 sekcií...}, model, usage }
//
// Volá Claude Opus 4.8 (default) alebo Sonnet 4.6 s detailným
// promptom. Pred LLM-om scrapne hlavnú stránku klienta (extract
// text z <title>, <meta description>, <h1>, <h2>, prvých 5K znakov
// <body>) pre dodatočný context.
//
// Cena per generácia:
//   Opus 4.8:    ~$0.30-0.80 (input ~10K tokens, output ~5K)
//   Sonnet 4.6:  ~$0.05-0.15
//
// Env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ==========================================

const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const DEFAULT_MODEL = 'claude-opus-4-8';

const SYSTEM_PROMPT = `Si senior PPC stratég v slovenskej digitálnej marketingovej agentúre s 10+ rokmi skúseností (Google Ads, Meta Ads, LinkedIn, performance marketing).

Tvoja úloha: pre konkrétneho leada vygenerovať **podrobný, profesionálny, unikátny** marketingový návrh kampaní, ktorý by mohol byť hneď použitý ako pitch dokument pre klienta.

POVINNÉ PRAVIDLÁ:

1. **Vždy v slovenčine.** Profesionálny, ale ľudský tón. Žiadne floskuly typu "synergie", "leveraging", "best practices". Konkrétne čísla, konkrétne kroky.

2. **Personalizuj všetko.** Použi názov firmy, doménu, lokalitu, biznis model. Ak je e-shop → bav sa o produktoch. Ak je B2B služba → bav sa o lead generation. Nikdy generické "vaša firma".

3. **Reálne čísla z dát.** Ak máš Marketing Miner kľúčové slová s search_volume a CPC, použij ich v keywords sekcii. Ak nemáš → odhadni realistické pre slovenský trh (mestá 5-50K obyvateľov, lokálny biz: 50-500 hľadaní/mesiac, CPC 0.20-1.50 €).

4. **Budget breakdown musí sedieť matematicky.** Súčet kanálov = mesačný budget. Kampane majú konkrétne sumy (nie "vhodný budget").

5. **Štruktúra výstupu — výhradne JSON, žiadny text okolo, žiadne markdown wrappers.**

Tvar JSON odpovede (presne tieto kľúče):
{
  "executive_summary": "2-3 odstavce — kto je klient, prečo PPC, aký výsledok očakávame za 3/6 mesiacov, prečo my",
  "situation_analysis": {
    "current_state": "Aký je dnes online stav firmy (web, SEO, social, reklama). Konkrétne čo funguje a čo chýba.",
    "opportunities": ["3-5 konkrétnych príležitostí, jedna na bullet"],
    "challenges": ["2-4 konkrétne výzvy/prekážky"]
  },
  "competitive_landscape": {
    "main_competitors": [
      { "name": "...", "strength": "...", "weakness_we_exploit": "..." }
    ],
    "positioning": "Ako sa odlíšime od konkurencie v reklame (1-2 odstavce)"
  },
  "target_audience": {
    "primary": {
      "description": "Demografia + psychografia + intent",
      "geo": "konkrétne mestá / regióny",
      "estimated_size": "odhad veľkosti TAM v SR"
    },
    "secondary": { "description": "...", "geo": "..." }
  },
  "keywords": [
    { "keyword": "...", "search_volume": 1200, "cpc_eur": 0.45, "match_type": "exact|phrase|broad", "campaign": "ktorá kampaň", "priority": "high|medium|low" }
  ],
  "strategy": {
    "channels": [
      {
        "channel": "Google Ads — Search",
        "rationale": "prečo tento kanál pre tohto klienta",
        "monthly_budget_eur": 800,
        "expected_kpi": "konkrétny KPI s číslom (napr. 35 leadov/mesiac pri CPL 22€)"
      }
    ],
    "creative_approach": "1-2 odstavce o copy/visual direction — tón, mood, hlavné messaging hooky"
  },
  "campaigns": [
    {
      "name": "konkrétny názov kampane (napr. 'Search — Slovenské mestá: zábradlie eshop')",
      "objective": "konkrétny cieľ",
      "channel": "Google Ads — Search",
      "monthly_budget_eur": 400,
      "key_keywords": ["3-5 kľúčových slov"],
      "ad_groups": ["zoznam ad groupov"],
      "landing_page_recommendation": "URL alebo opis cieľovej stránky",
      "expected_metrics": { "clicks": 850, "ctr_pct": 4.2, "conversions": 22, "cpa_eur": 18 }
    }
  ],
  "budget_breakdown": {
    "monthly_total_eur": 1500,
    "media_spend_eur": 1200,
    "agency_fee_eur": 300,
    "by_channel": [
      { "channel": "Google Ads Search", "amount_eur": 800, "pct": 53 }
    ],
    "six_month_projection_eur": 9000,
    "notes": "ako budget škáluje keď začnú výsledky (mesiac 1-3 testing, 4-6 scale)"
  },
  "kpi_targets": {
    "month_1": { "kpi": "10 leadov", "spend_eur": 1500, "explanation": "..." },
    "month_3": { "kpi": "30 leadov pri CPL <30€", "spend_eur": 1500, "explanation": "..." },
    "month_6": { "kpi": "60 leadov pri CPL <22€", "spend_eur": 2000, "explanation": "..." }
  },
  "timeline": [
    { "week": "1", "milestone": "Onboarding + audit konkurencie", "deliverables": ["..."] },
    { "week": "2", "milestone": "Setup Google Ads konta + tracking", "deliverables": ["..."] },
    { "week": "3-4", "milestone": "Spustenie pilotných kampaní", "deliverables": ["..."] },
    { "week": "5-8", "milestone": "Optimalizácia + scaling", "deliverables": ["..."] }
  ],
  "risks": [
    { "risk": "...", "mitigation": "..." }
  ],
  "next_steps": [
    "Konkrétny ďalší krok 1",
    "Konkrétny ďalší krok 2"
  ],
  "unique_insight": "Jeden veľmi špecifický insight ku konkrétnemu klientovi — niečo čo by konkurent neuvidel. 2-3 vety."
}

DÔLEŽITÉ:
- Vráť LEN ten JSON objekt. Žiadne ${'```'}json wrappers. Žiadne komentáre. Žiadny text pred/za.
- Vždy minimálne 3 kampane, 8-15 keywords, 2-4 kanály.
- Číselné hodnoty ako čísla, nie stringy ("1500" → 1500).`;

async function scrapeWebsite(domain) {
  if (!domain) return '';
  try {
    const url = domain.startsWith('http') ? domain : `https://${domain}`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Adlify-Proposal-Bot/1.0)' }
    });
    if (!resp.ok) return '';
    const html = await resp.text();
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '';
    const desc = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1]
              || html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i)?.[1]
              || '';
    const h1s = [...html.matchAll(/<h1[^>]*>([^<]+)<\/h1>/gi)].map(m => m[1].trim()).slice(0, 5);
    const h2s = [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/gi)].map(m => m[1].trim()).slice(0, 8);
    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);
    return `WEB SCRAPE (${url}):
Title: ${title}
Description: ${desc}
H1: ${h1s.join(' | ')}
H2: ${h2s.join(' | ')}
Body excerpt: ${bodyText}`;
  } catch (e) {
    console.warn('Scrape failed:', e.message);
    return '';
  }
}

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
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY nie je nastavený v Netlify env vars.' }) };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Supabase env vars chýbajú (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Neplatný JSON' }) }; }

  const { leadId, model = DEFAULT_MODEL, customNotes = '' } = payload;
  if (!leadId) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'leadId je povinný' }) };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: lead, error: leadErr } = await supabase
    .from('leads').select('*').eq('id', leadId).single();
  if (leadErr || !lead) {
    return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Lead nenájdený' }) };
  }

  const scrapedContent = await scrapeWebsite(lead.domain);

  const context = `LEAD DATA:
Firma: ${lead.company_name || 'neuvedené'}
Doména: ${lead.domain || 'neuvedená'}
Email: ${lead.email || '—'}
Telefón: ${lead.phone || '—'}
Odvetvie: ${lead.industry || lead.analysis?.company?.industry || 'neuvedené'}
Mesto / lokalita: ${lead.city || lead.analysis?.company?.city || lead.analysis?.company?.location || 'neuvedené'}

AI ANALYSIS (predošlé volanie analyze-lead):
${JSON.stringify(lead.analysis || {}, null, 2).slice(0, 8000)}

MARKETING DATA (Marketing Miner):
${JSON.stringify(lead.marketing_data || {}, null, 2).slice(0, 4000)}

${scrapedContent}

${customNotes ? `CUSTOM POŽIADAVKY OD AGENTÚRY:\n${customNotes}\n` : ''}

ÚLOHA:
Vygeneruj podrobný marketingový návrh pre TOHTO konkrétneho klienta. Buď extrémne personalizovaný, používaj reálne čísla, zmieni doménu/mesto/produktov. Output je JSON podľa system promptu.`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: context }],
    });

    const text = (response.content || []).map(c => c.text || '').join('').trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let proposal;
    try { proposal = JSON.parse(cleaned); }
    catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Model nevrátil platný JSON');
      proposal = JSON.parse(match[0]);
    }

    const generatedAt = new Date().toISOString();
    await supabase.from('leads').update({
      deep_proposal: proposal,
      deep_proposal_generated_at: generatedAt,
      deep_proposal_model: model,
    }).eq('id', leadId);

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposal,
        model,
        generated_at: generatedAt,
        usage: response.usage || null,
      }),
    };
  } catch (err) {
    console.error('generate-deep-proposal error', err);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message || 'Chyba pri generovaní návrhu' }),
    };
  }
};
