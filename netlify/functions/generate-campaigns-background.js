// Generuje kampaňový návrh z onboardingu — Netlify Background Function náhrada
// pôvodnej Supabase Edge funkcie (tá vyžadovala manuálny redeploy po každej
// zmene; tu sa nasadí automaticky cez git push).
//
// Background function = postfix `-background` v názve. Vráti hneď 202 Accepted,
// beží do 15 minút. Frontend pollne `campaign_projects.status` zo Supabase
// kým sa nezmení z 'generating' na 'internal_review' alebo späť na 'draft'
// (pri chybe sa do `notes` zapíše presná hláška).
//
// POST { project_id, onboarding_id, platforms: ['google_search', 'meta_facebook'] }
// → 202 Accepted (žiadne výsledky v response, sleduj DB)
//
// Env (Netlify): ANTHROPIC_API_KEY, MARKETINGMINER_API_KEY (opt), SERPER_API_KEY (opt),
//                SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

// ───── Helpers ─────

async function fetchMarketingMinerKeywords(apiKey, seeds) {
  const collected = [];
  for (const seed of seeds.slice(0, 5)) {
    try {
      const url = `https://profilers-api.marketingminer.com/keywords/suggestions?api_token=${apiKey}&lang=sk&keyword=${encodeURIComponent(seed)}`;
      const r = await fetch(url);
      if (!r.ok) continue;
      const j = await r.json();
      let suggestions = j.keywords || j.data || [];
      if (!Array.isArray(suggestions)) suggestions = [];
      collected.push(...suggestions.slice(0, 20).map(s => ({
        keyword: typeof s === 'string' ? s : s.keyword,
        seed,
      })));
    } catch (e) { console.error('MM suggest error:', e.message); }
  }
  return collected;
}

async function enrichKeywordVolumes(apiKey, keywords) {
  if (keywords.length === 0) return [];
  const uniq = [...new Set(keywords)].slice(0, 50);
  const chunks = [];
  for (let i = 0; i < uniq.length; i += 10) chunks.push(uniq.slice(i, i + 10));
  const map = new Map();
  const results = await Promise.all(chunks.map(async (chunk) => {
    try {
      const url = `https://profilers-api.marketingminer.com/keywords/search-volume-data?api_token=${apiKey}&lang=sk&${chunk.map(k => `keyword=${encodeURIComponent(k)}`).join('&')}`;
      const r = await fetch(url);
      if (!r.ok) return [];
      const j = await r.json();
      return j.data || [];
    } catch (e) {
      console.error('MM volume chunk error:', e.message);
      return [];
    }
  }));
  for (const vols of results) {
    for (const v of vols) if (v?.keyword) map.set(v.keyword, v);
  }
  return uniq.map(kw => {
    const vol = map.get(kw) || {};
    return {
      keyword: kw,
      search_volume: vol.search_volume || 0,
      cpc: vol.cpc || 0,
      competition: vol.competition || null,
    };
  }).sort((a, b) => b.search_volume - a.search_volume);
}

async function fetchSerperSERP(apiKey, query, location = 'Slovakia') {
  try {
    const r = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'sk', hl: 'sk', location, num: 10 }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.error('Serper error:', e.message);
    return null;
  }
}

function extractCompetitorsFromSERP(serpResults) {
  const domains = new Map();
  for (const serp of serpResults) {
    if (!serp) continue;
    const ads = serp.ads || [];
    const organic = (serp.organic || []).slice(0, 5);
    for (const item of ads) {
      try {
        const url = new URL(item.link);
        const domain = url.hostname.replace(/^www\./, '');
        if (!domains.has(domain)) domains.set(domain, { domain, titles: [], count: 0, is_paid: true });
        const d = domains.get(domain);
        d.count += 1; d.is_paid = true;
        if (item.title && d.titles.length < 3) d.titles.push(item.title);
      } catch {}
    }
    for (const item of organic) {
      try {
        const url = new URL(item.link);
        const domain = url.hostname.replace(/^www\./, '');
        if (!domains.has(domain)) domains.set(domain, { domain, titles: [], count: 0, is_paid: false });
        const d = domains.get(domain);
        d.count += 1;
        if (item.title && d.titles.length < 3) d.titles.push(item.title);
      } catch {}
    }
  }
  return Array.from(domains.values()).sort((a, b) => b.count - a.count).slice(0, 8);
}

function extractPaidAdsInsights(serpResults) {
  const ads = [];
  for (const serp of serpResults) {
    if (!serp || !serp.ads) continue;
    for (const ad of serp.ads.slice(0, 3)) {
      ads.push({
        query: serp.searchParameters?.q,
        title: ad.title,
        snippet: ad.snippet,
        domain: (() => { try { return new URL(ad.link).hostname.replace(/^www\./, ''); } catch { return ad.link; } })(),
      });
    }
  }
  return ads.slice(0, 15);
}

function parseClaudeJSON(content) {
  try { return JSON.parse(content); } catch {}
  const m = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  const s = content.indexOf('{');
  const e = content.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('No JSON object in Claude output');
  let raw = content.slice(s, e + 1);
  try { return JSON.parse(raw); } catch {}
  raw = raw.replace(/[“”„]/g, '"').replace(/[‘’]/g, "'").replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(raw); } catch {}
  let repaired = raw;
  const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 === 1) repaired += '"';
  const opens = (repaired.match(/[{[]/g) || []).length;
  const closes = (repaired.match(/[}\]]/g) || []).length;
  if (opens > closes) {
    const stack = [];
    for (const ch of repaired) {
      if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if (ch === '}' || ch === ']') stack.pop();
    }
    repaired += stack.reverse().join('');
  }
  return JSON.parse(repaired);
}

async function deleteOldDraftCampaigns(projectId) {
  const { data: oldCampaigns } = await supabase
    .from('campaigns').select('id')
    .eq('project_id', projectId).eq('ai_generated', true).eq('status', 'draft');
  if (!oldCampaigns?.length) return 0;
  const campaignIds = oldCampaigns.map(c => c.id);
  const { data: oldGroups } = await supabase
    .from('ad_groups').select('id').in('campaign_id', campaignIds);
  const groupIds = (oldGroups || []).map(g => g.id);
  if (groupIds.length) {
    await supabase.from('ads').delete().in('ad_group_id', groupIds);
    await supabase.from('ad_groups').delete().in('id', groupIds);
  }
  await supabase.from('campaigns').delete().in('id', campaignIds);
  return campaignIds.length;
}

function buildSeedKeywords(onboarding) {
  const seeds = new Set();
  if (onboarding.selected_keywords?.length) {
    onboarding.selected_keywords.slice(0, 3).forEach(k => seeds.add(k));
  }
  (onboarding.products_services || []).slice(0, 3).forEach(p => {
    if (p?.name) seeds.add(p.name);
  });
  if (onboarding.company_industry) seeds.add(onboarding.company_industry);
  return Array.from(seeds).filter(Boolean).slice(0, 5);
}

// ───── Main worker (runs after 202 response) ─────

async function runGeneration({ project_id, onboarding_id, platforms }) {
  console.log('[generate-campaigns] start project', project_id);

  // 1. Load onboarding
  const { data: onboarding, error: oErr } = await supabase
    .from('onboarding_responses').select('*').eq('id', onboarding_id).single();
  if (oErr || !onboarding) throw new Error('Onboarding not found: ' + (oErr?.message || 'no row'));

  // 2. KEYWORDS
  const MM_KEY = process.env.MARKETINGMINER_API_KEY;
  let keywordData = [];
  if (MM_KEY) {
    if (onboarding.selected_keywords?.length > 0) {
      keywordData = await enrichKeywordVolumes(MM_KEY, onboarding.selected_keywords);
    } else {
      const seeds = buildSeedKeywords(onboarding);
      if (seeds.length > 0) {
        const suggestions = await fetchMarketingMinerKeywords(MM_KEY, seeds);
        const kws = suggestions.map(s => s.keyword).filter(Boolean);
        keywordData = await enrichKeywordVolumes(MM_KEY, kws);
      }
    }
  }
  if (keywordData.length === 0 && onboarding.selected_keywords?.length) {
    keywordData = onboarding.selected_keywords.map(k => ({ keyword: k, search_volume: 0, cpc: 0 }));
  }

  // 3. SERP
  const SERPER_KEY = process.env.SERPER_API_KEY;
  let serpResults = [], competitors = [], paidAdsInsights = [];
  if (SERPER_KEY) {
    const topKeywords = keywordData.slice(0, 5).map(k => k.keyword).filter(Boolean);
    const location = onboarding.company_location || 'Slovakia';
    serpResults = (await Promise.all(topKeywords.map(kw => fetchSerperSERP(SERPER_KEY, kw, location)))).filter(Boolean);
    competitors = extractCompetitorsFromSERP(serpResults);
    paidAdsInsights = extractPaidAdsInsights(serpResults);
  }

  const onboardingCompetitors = (onboarding.competitors || []).map(c => ({
    domain: typeof c === 'string' ? c : (c.website || c.name),
    from_onboarding: true,
  }));
  const allCompetitors = [...onboardingCompetitors, ...competitors].slice(0, 10);

  const researchData = {
    keywords: keywordData,
    competitors: allCompetitors,
    paid_ads_seen: paidAdsInsights,
    serp_queries_analyzed: serpResults.length,
    generated_at: new Date().toISOString(),
  };

  // 4. CLAUDE
  const monthlyBudget = Number(onboarding.monthly_budget_max || onboarding.monthly_budget_min || 300) || 300;
  const dailyBudget = Math.round(monthlyBudget / 30);

  const prompt = `Si senior PPC stratég pre slovenskú marketingovú agentúru Adlify. Pripravuješ návrh kampane pre klienta po onboardingu. Píš ako skúsený človek — NIKDY nespomínaj AI ani automatizáciu.

## ONBOARDING KLIENTA
Názov: ${onboarding.company_name || '—'}
Web: ${onboarding.company_website || '—'}
Odvetvie: ${onboarding.company_industry || '—'}
Lokalita: ${onboarding.company_location || 'Slovensko'}
Popis: ${onboarding.company_description || '—'}

Produkty/služby:
${(onboarding.products_services || []).map(p => `- ${p.name}: ${p.description || ''}`).join('\n') || '—'}

USP: ${(onboarding.unique_selling_points || []).join(', ') || '—'}
Výhody: ${onboarding.competitive_advantages || '—'}

Cieľovka: B2B=${onboarding.target_audience?.b2b ? 'áno' : 'nie'}, B2C=${onboarding.target_audience?.b2c ? 'áno' : 'nie'}, vek ${onboarding.target_audience?.demographics?.age_from || 18}-${onboarding.target_audience?.demographics?.age_to || 65}, pohlavie ${onboarding.target_audience?.demographics?.gender || 'všetci'}, lokácie ${(onboarding.target_audience?.locations || ['Slovensko']).join(', ')}
Ideálny zákazník: ${onboarding.ideal_customer_description || '—'}

Ciele: ${(onboarding.primary_goals || []).join(', ') || '—'}
Očakávané CPA: ${onboarding.expected_cpa || '—'}€

Rozpočet: ${monthlyBudget}€/mes (~${dailyBudget}€/deň)

## RESEARCH DÁTA
Top KW (${keywordData.length}): ${keywordData.slice(0, 20).map(k => `"${k.keyword}" (${k.search_volume}/mes, CPC ${(k.cpc || 0).toFixed(2)}€)`).join(', ') || '(nedostupné)'}

Konkurencia: ${allCompetitors.map(c => c.domain).join(', ') || '(nedostupná)'}

Reklamné texty konkurentov: ${paidAdsInsights.slice(0, 5).map(a => `[${a.query}] "${a.title}"`).join(' | ') || '(žiadne)'}

## PLATFORMY: ${platforms.join(', ')}

## VÝSTUP — strict JSON, žiadny markdown, žiadny text okolo:

{
  "business_analysis": { "summary": "2-3 vety", "key_insights": ["3 insights"], "challenges": ["2 výzvy"], "opportunities": ["2 príležitosti"] },
  "strategy_summary": "3-5 viet",
  "research_insights": { "market_analysis": "2-3 vety", "competitor_analysis": "2-3 vety", "keyword_strategy": "2 vety", "recommended_approach": "krátky odsek" },
  "campaigns": [
    {
      "name": "Názov",
      "platform": "google" | "meta",
      "campaign_type": "search" | "display" | "pmax" | "traffic" | "conversions" | "awareness" | "video",
      "objective": "cieľ",
      "rationale": "1-2 vety",
      "daily_budget": 10,
      "targeting": { "locations": ["Slovensko"], "age_from": 18, "age_to": 65, "gender": "all|male|female", "keywords": ["KW"], "interests": ["záujmy"], "audiences": [] },
      "ad_groups": [
        {
          "name": "Názov AG",
          "theme": "1 veta",
          "keywords": ["KW"],
          "negative_keywords": ["neg"],
          "ads": [
            {
              "type": "responsive",
              "headlines": ["max 30 znakov", "..."],
              "descriptions": ["max 90 znakov", "..."],
              "call_to_action": "CTA",
              "final_url": "https://klient.sk/page",
              "path1": "max-15",
              "path2": "max-15",
              "image_prompt": "EN prompt pre DALL·E (len pre display/meta/video, search ads = null)",
              "image_aspect_ratio": "1:1 | 1.91:1 | 4:5 | 9:16 | null"
            }
          ]
        }
      ],
      "estimated_results": { "impressions": 0, "clicks": 0, "ctr": 0, "conversions": 0, "cpa": 0 }
    }
  ],
  "budget_breakdown": { "total_monthly": 0, "by_platform": [], "by_campaign": [], "reasoning": "1-2 vety" },
  "expected_results": { "day_30": {}, "day_90": {}, "day_180": {}, "notes": "1-2 vety" },
  "timeline": { "phases": [{ "name": "Príprava", "duration_days": 7, "activities": ["..."] }] },
  "next_steps": { "client_needs_to_provide": ["..."], "our_next_actions": ["..."], "launch_readiness": ["..."] }
}

PRAVIDLÁ:
- Všetko v slovenčine, vykáme
- Min 2 kampane (Google + Meta ak obe v platforms)
- Každá kampaň 2-3 ad groups, každá ad group 2-3 reklamy
- Headlines max 30 znakov, descriptions max 90 znakov
- Pre search ads image_prompt = null, image_aspect_ratio = null
- Pre display/meta povinne image_prompt v angličtine (Photo/Illustration + konkrétna scéna + "no text, no logos" + aspect ratio na konci)
- final_url konkrétna stránka (base ${onboarding.company_website || 'klient.sk'})
- Žiadne výmysly — používaj len konkrétne dáta z onboardingu a research
- LEN JSON, nič okolo`;

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) throw new Error('Missing ANTHROPIC_API_KEY env var na Netlify');

  console.log('[generate-campaigns] calling Claude...');
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const claudeJson = await claudeRes.json();
  if (claudeJson.error) throw new Error('Claude API: ' + claudeJson.error.message);
  if (!claudeJson.content?.[0]?.text) throw new Error('Claude vrátil prázdny content');

  const doc = parseClaudeJSON(claudeJson.content[0].text);
  const campaignsArr = doc.campaigns || [];
  if (campaignsArr.length === 0) throw new Error('Claude nevygeneroval žiadne kampane');

  // 5. Re-run guard + save
  await deleteOldDraftCampaigns(project_id);

  // Načítaj client_id z projektu (potrebné pre campaigns.client_id)
  const { data: projRow } = await supabase
    .from('campaign_projects').select('client_id').eq('id', project_id).single();
  const clientId = projRow?.client_id || null;

  let campaignsGenerated = 0;
  for (const c of campaignsArr) {
    const { data: savedCampaign, error: cErr } = await supabase
      .from('campaigns').insert({
        project_id,
        client_id: clientId,
        name: c.name,
        platform: c.platform,
        campaign_type: c.campaign_type,
        objective: c.objective,
        budget_daily: Number(c.daily_budget) || 0,
        status: 'draft',
        targeting: c.targeting || {},
        metrics: { estimated: c.estimated_results || {}, rationale: c.rationale || '' },
        ai_generated: true,
      }).select().single();
    if (cErr) { console.error('Campaign insert:', cErr.message); continue; }
    campaignsGenerated++;

    for (const g of (c.ad_groups || [])) {
      const { data: savedAG, error: gErr } = await supabase
        .from('ad_groups').insert({
          campaign_id: savedCampaign.id,
          name: g.name,
          keywords: g.keywords || [],
          negative_keywords: g.negative_keywords || [],
          status: 'draft',
        }).select().single();
      if (gErr) { console.error('AG insert:', gErr.message); continue; }

      for (const ad of (g.ads || [])) {
        const isSearchAd = (c.campaign_type || '').toLowerCase() === 'search';
        const { error: adErr } = await supabase.from('ads').insert({
          ad_group_id: savedAG.id,
          ad_type: ad.type || 'responsive',
          headlines: ad.headlines || [],
          descriptions: ad.descriptions || [],
          call_to_action: ad.call_to_action,
          final_url: ad.final_url || onboarding.company_website || null,
          path1: ad.path1 || null,
          path2: ad.path2 || null,
          image_prompt: isSearchAd ? null : (ad.image_prompt || null),
          image_aspect_ratio: isSearchAd ? null : (ad.image_aspect_ratio || '1:1'),
          image_status: isSearchAd ? 'skipped' : 'pending',
          status: 'draft',
        });
        if (adErr) console.error('Ad insert:', adErr.message);
      }
    }
  }

  // 6. Update project — povýš na internal_review
  const { data: currentProject } = await supabase
    .from('campaign_projects').select('proposal_version').eq('id', project_id).maybeSingle();
  const nextVersion = (currentProject?.proposal_version || 0) + 1;

  await supabase.from('campaign_projects').update({
    status: 'internal_review',
    strategy_summary: doc.strategy_summary || null,
    business_analysis: doc.business_analysis || null,
    research_data: { ...researchData, insights: doc.research_insights || null, model_used: 'claude-sonnet-4-6', generator_version: 3, runtime: 'netlify' },
    expected_results: doc.expected_results || null,
    timeline: doc.timeline || null,
    budget_breakdown: doc.budget_breakdown || null,
    next_steps: doc.next_steps || null,
    total_monthly_budget: doc.budget_breakdown?.total_monthly || monthlyBudget,
    proposal_version: nextVersion,
    notes: null,  // vyčisti prípadný predošlý error
  }).eq('id', project_id);

  console.log(`[generate-campaigns] DONE project ${project_id} — ${campaignsGenerated} campaigns`);
  return { campaigns_generated: campaignsGenerated };
}

// ───── Netlify Background Function entry ─────

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: cors, body: 'Bad JSON' }; }

  const { project_id, onboarding_id, platforms = ['google_search', 'meta_facebook'] } = payload;
  if (!project_id || !onboarding_id) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing project_id or onboarding_id' }) };
  }

  // Background function — beží do 15 min po vrátení response. Worker beží v rámci
  // tej istej invocation, nie asynchronne — Netlify mu dá 15 minút na dobehnutie.
  try {
    await runGeneration({ project_id, onboarding_id, platforms });
    return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true }) };
  } catch (error) {
    console.error('[generate-campaigns] error:', error);
    // Reset projektu na draft s error notes
    try {
      await supabase.from('campaign_projects')
        .update({ status: 'draft', notes: `AI error: ${error.message}`.slice(0, 500) })
        .eq('id', project_id)
        .eq('status', 'generating');
    } catch (resetErr) {
      console.error('Status reset failed:', resetErr.message);
    }
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: error.message }) };
  }
};
