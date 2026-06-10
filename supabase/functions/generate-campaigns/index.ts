import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ---------- Helpers ----------

async function fetchMarketingMinerKeywords(apiKey: string, seeds: string[]): Promise<any[]> {
  const collected: any[] = []
  for (const seed of seeds.slice(0, 5)) {
    try {
      const url = `https://profilers-api.marketingminer.com/keywords/suggestions?api_token=${apiKey}&lang=sk&keyword=${encodeURIComponent(seed)}`
      const r = await fetch(url)
      if (!r.ok) continue
      const j = await r.json()
      let suggestions = j.keywords || j.data || []
      if (!Array.isArray(suggestions)) suggestions = []
      collected.push(...suggestions.slice(0, 20).map((s: any) => ({
        keyword: typeof s === 'string' ? s : s.keyword,
        seed
      })))
    } catch (e) { console.error('MM suggest error:', e) }
  }
  return collected
}

async function enrichKeywordVolumes(apiKey: string, keywords: string[]): Promise<any[]> {
  if (keywords.length === 0) return []
  const uniq = [...new Set(keywords)].slice(0, 50)
  // Chunkuj po 10 KW — dlhý query string (50× keyword=...) MM API odmieta
  const chunks: string[][] = []
  for (let i = 0; i < uniq.length; i += 10) chunks.push(uniq.slice(i, i + 10))
  const map = new Map<string, any>()
  const results = await Promise.all(chunks.map(async (chunk) => {
    try {
      const url = `https://profilers-api.marketingminer.com/keywords/search-volume-data?api_token=${apiKey}&lang=sk&${chunk.map(k => `keyword=${encodeURIComponent(k)}`).join('&')}`
      const r = await fetch(url)
      if (!r.ok) return []
      const j = await r.json()
      return j.data || []
    } catch (e) {
      console.error('MM volume chunk error:', e)
      return []
    }
  }))
  for (const vols of results) {
    for (const v of vols) if (v?.keyword) map.set(v.keyword, v)
  }
  return uniq.map(kw => {
    const vol: any = map.get(kw) || {}
    return {
      keyword: kw,
      search_volume: vol.search_volume || 0,
      cpc: vol.cpc || 0,
      competition: vol.competition || null
    }
  }).sort((a, b) => b.search_volume - a.search_volume)
}

async function fetchSerperSERP(apiKey: string, query: string, location = 'Slovakia'): Promise<any> {
  try {
    const r = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: query, gl: 'sk', hl: 'sk', location, num: 10 })
    })
    if (!r.ok) return null
    return await r.json()
  } catch (e) {
    console.error('Serper error:', e)
    return null
  }
}

function extractCompetitorsFromSERP(serpResults: any[]): any[] {
  const domains = new Map<string, { domain: string, titles: string[], count: number, is_paid: boolean }>()
  for (const serp of serpResults) {
    if (!serp) continue
    const ads = serp.ads || []
    const organic = (serp.organic || []).slice(0, 5)
    for (const item of ads) {
      try {
        const url = new URL(item.link)
        const domain = url.hostname.replace(/^www\./, '')
        if (!domains.has(domain)) domains.set(domain, { domain, titles: [], count: 0, is_paid: true })
        const d = domains.get(domain)!
        d.count += 1
        d.is_paid = true
        if (item.title && d.titles.length < 3) d.titles.push(item.title)
      } catch {}
    }
    for (const item of organic) {
      try {
        const url = new URL(item.link)
        const domain = url.hostname.replace(/^www\./, '')
        if (!domains.has(domain)) domains.set(domain, { domain, titles: [], count: 0, is_paid: false })
        const d = domains.get(domain)!
        d.count += 1
        if (item.title && d.titles.length < 3) d.titles.push(item.title)
      } catch {}
    }
  }
  return Array.from(domains.values()).sort((a, b) => b.count - a.count).slice(0, 8)
}

function extractPaidAdsInsights(serpResults: any[]): any[] {
  const ads: any[] = []
  for (const serp of serpResults) {
    if (!serp || !serp.ads) continue
    for (const ad of serp.ads.slice(0, 3)) {
      ads.push({
        query: serp.searchParameters?.q,
        title: ad.title,
        snippet: ad.snippet,
        domain: (() => { try { return new URL(ad.link).hostname.replace(/^www\./, '') } catch { return ad.link } })()
      })
    }
  }
  return ads.slice(0, 15)
}

// Viacstupňový JSON parse — Claude občas vráti smart quotes, trailing commas
// alebo orezaný output. Rovnaký prístup ako v generate-deep-proposal.
function parseClaudeJSON(content: string): any {
  // 1. Priamy parse
  try { return JSON.parse(content) } catch { /* continue */ }
  // 2. Code fence
  const m = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (m) { try { return JSON.parse(m[1]) } catch { /* continue */ } }
  // 3. Substring { ... }
  const s = content.indexOf('{')
  const e = content.lastIndexOf('}')
  if (s === -1 || e === -1) throw new Error('No JSON object in Claude output')
  let raw = content.slice(s, e + 1)
  try { return JSON.parse(raw) } catch { /* continue */ }
  // 4. Opravy: smart quotes, trailing commas
  raw = raw
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
  try { return JSON.parse(raw) } catch { /* continue */ }
  // 5. Truncation repair — dorovnaj neuzavreté zátvorky/úvodzovky
  let repaired = raw
  const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length
  if (quoteCount % 2 === 1) repaired += '"'
  const opens = (repaired.match(/[{[]/g) || []).length
  const closes = (repaired.match(/[}\]]/g) || []).length
  if (opens > closes) {
    const stack: string[] = []
    for (const ch of repaired) {
      if (ch === '{') stack.push('}')
      else if (ch === '[') stack.push(']')
      else if (ch === '}' || ch === ']') stack.pop()
    }
    repaired += stack.reverse().join('')
  }
  return JSON.parse(repaired)
}

// Zmaž predošlé AI-generované draft kampane projektu (re-run guard).
// Iba draft + ai_generated — spustené/manuálne kampane nikdy nemažeme.
// ad_groups/ads nemajú garantovaný CASCADE, mažeme explicitne zdola hore.
async function deleteOldDraftCampaigns(supabase: any, projectId: string) {
  const { data: oldCampaigns } = await supabase
    .from('campaigns')
    .select('id')
    .eq('project_id', projectId)
    .eq('ai_generated', true)
    .eq('status', 'draft')
  if (!oldCampaigns?.length) return 0
  const campaignIds = oldCampaigns.map((c: any) => c.id)
  const { data: oldGroups } = await supabase
    .from('ad_groups')
    .select('id')
    .in('campaign_id', campaignIds)
  const groupIds = (oldGroups || []).map((g: any) => g.id)
  if (groupIds.length) {
    await supabase.from('ads').delete().in('ad_group_id', groupIds)
    await supabase.from('ad_groups').delete().in('id', groupIds)
  }
  await supabase.from('campaigns').delete().in('id', campaignIds)
  console.log(`Deleted ${campaignIds.length} old draft campaigns for project ${projectId}`)
  return campaignIds.length
}

function buildSeedKeywords(onboarding: any): string[] {
  const seeds = new Set<string>()
  if (onboarding.selected_keywords?.length) {
    onboarding.selected_keywords.slice(0, 3).forEach((k: string) => seeds.add(k))
  }
  const products = onboarding.products_services || []
  products.slice(0, 3).forEach((p: any) => {
    if (p.name) seeds.add(p.name)
  })
  if (onboarding.company_industry) seeds.add(onboarding.company_industry)
  return Array.from(seeds).filter(Boolean).slice(0, 5)
}

// ---------- Main handler ----------

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Mimo try — catch blok potrebuje supabase klienta a project_id na reset
  // statusu pri chybe (frontend nastavil 'generating' pred volaním; ak user
  // medzitým zavrie tab, projekt by ostal visieť navždy)
  let supabase: any = null
  let projectIdForError: string | null = null

  try {
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    const MARKETINGMINER_API_KEY = Deno.env.get('MARKETINGMINER_API_KEY')
    const SERPER_API_KEY = Deno.env.get('SERPER_API_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY')
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing Supabase config')

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { project_id, onboarding_id, platforms = ['google_search', 'meta_facebook'] } = await req.json()
    if (!project_id || !onboarding_id) throw new Error('Missing project_id or onboarding_id')
    projectIdForError = project_id

    // 1. Load onboarding
    const { data: onboarding, error: oErr } = await supabase
      .from('onboarding_responses').select('*').eq('id', onboarding_id).single()
    if (oErr || !onboarding) throw new Error('Onboarding not found')

    // 2. KEYWORD RESEARCH
    let keywordData: any[] = []
    if (MARKETINGMINER_API_KEY) {
      if (onboarding.selected_keywords?.length > 0) {
        keywordData = await enrichKeywordVolumes(MARKETINGMINER_API_KEY, onboarding.selected_keywords)
      } else {
        const seeds = buildSeedKeywords(onboarding)
        if (seeds.length > 0) {
          const suggestions = await fetchMarketingMinerKeywords(MARKETINGMINER_API_KEY, seeds)
          const kws = suggestions.map(s => s.keyword).filter(Boolean)
          keywordData = await enrichKeywordVolumes(MARKETINGMINER_API_KEY, kws)
        }
      }
    }
    if (keywordData.length === 0 && onboarding.selected_keywords?.length) {
      keywordData = onboarding.selected_keywords.map((k: string) => ({ keyword: k, search_volume: 0, cpc: 0 }))
    }

    // 3. SERP RESEARCH (optional - ak máme Serper)
    let serpResults: any[] = []
    let competitors: any[] = []
    let paidAdsInsights: any[] = []
    if (SERPER_API_KEY) {
      const topKeywords = keywordData.slice(0, 5).map(k => k.keyword).filter(Boolean)
      const location = onboarding.company_location || 'Slovakia'
      const serpPromises = topKeywords.map(kw => fetchSerperSERP(SERPER_API_KEY, kw, location))
      serpResults = (await Promise.all(serpPromises)).filter(Boolean)
      competitors = extractCompetitorsFromSERP(serpResults)
      paidAdsInsights = extractPaidAdsInsights(serpResults)
    }

    // Merge with onboarding-provided competitors
    const onboardingCompetitors = (onboarding.competitors || []).map((c: any) => ({
      domain: typeof c === 'string' ? c : (c.website || c.name),
      from_onboarding: true
    }))
    const allCompetitors = [...onboardingCompetitors, ...competitors].slice(0, 10)

    const researchData = {
      keywords: keywordData,
      competitors: allCompetitors,
      paid_ads_seen: paidAdsInsights,
      serp_queries_analyzed: serpResults.length,
      generated_at: new Date().toISOString()
    }

    // 4. CLAUDE SYNTHESIS
    const monthlyBudget = onboarding.monthly_budget_max || onboarding.monthly_budget_min || 300
    const dailyBudget = Math.round(monthlyBudget / 30)

    const prompt = `Si senior PPC stratég a konzultant špecializujúci sa na Google Ads a Meta Ads pre SMB trh v SK/CZ/HU. Tvojou úlohou je pripraviť obsiahly a profesionálny návrh kampane pre reálneho klienta po onboardingu. Návrh musí byť na úrovni seriózneho strategického dokumentu, nie jednoduchý zoznam kampaní.

DÔLEŽITÉ: Adlify sa prezentuje ako profesionálna marketingová agentúra. NIKDY nespomínaj AI, automatizáciu, algoritmy alebo že návrh bol generovaný strojovo. Píš ako keby to písal skúsený človek.

## ONBOARDING DATA KLIENTA

**Firma:**
- Názov: ${onboarding.company_name || '—'}
- Web: ${onboarding.company_website || '—'}
- Odvetvie: ${onboarding.company_industry || '—'}
- Veľkosť: ${onboarding.company_size || '—'}
- Lokalita: ${onboarding.company_location || 'Slovensko'}
- Popis: ${onboarding.company_description || '—'}

**Produkty/Služby:**
${(onboarding.products_services || []).map((p: any) => `- ${p.name}: ${p.description || ''} (${p.price_range || 'cena neuvedená'})`).join('\n') || '—'}

**USP a konkurenčné výhody:**
- USP: ${(onboarding.unique_selling_points || []).join(', ') || '—'}
- Výhody: ${onboarding.competitive_advantages || '—'}

**Cieľová skupina:**
- B2B: ${onboarding.target_audience?.b2b ? 'áno' : 'nie'}, B2C: ${onboarding.target_audience?.b2c ? 'áno' : 'nie'}
- Vek: ${onboarding.target_audience?.demographics?.age_from || 18} - ${onboarding.target_audience?.demographics?.age_to || 65}
- Pohlavie: ${onboarding.target_audience?.demographics?.gender || 'všetci'}
- Lokácie: ${(onboarding.target_audience?.locations || ['Slovensko']).join(', ')}
- Ideálny zákazník: ${onboarding.ideal_customer_description || '—'}
- CLV: ${onboarding.customer_lifetime_value || '—'}€ | AOV: ${onboarding.average_order_value || '—'}€

**Ciele:**
- Primárne: ${(onboarding.primary_goals || []).join(', ') || '—'}
- Sekundárne: ${(onboarding.secondary_goals || []).join(', ') || '—'}
- Očakávané CPA: ${onboarding.expected_cpa || '—'}€ | ROAS: ${onboarding.expected_roas || '—'}x

**Rozpočet:**
- Mesačný: ${monthlyBudget}€ | Denný: ${dailyBudget}€
- Predchádzajúci: ${onboarding.previous_monthly_budget || '—'}€

**Skúsenosti s reklamou:**
- Predchádzajúce: ${onboarding.previous_ad_experience || '—'}
- Čo fungovalo: ${onboarding.what_worked || '—'}
- Čo nefungovalo: ${onboarding.what_didnt_work || '—'}

**Brand:**
- Tón komunikácie: ${onboarding.brand_tone_of_voice || 'Profesionálny'}
- Preferovaný štýl: ${onboarding.preferred_ad_style || '—'}

**Tracking pripravenosť:**
- GA: ${onboarding.has_google_analytics ? 'áno' : 'nie'} | FB Pixel: ${onboarding.has_facebook_pixel ? 'áno' : 'nie'}
- Google Ads účet: ${onboarding.has_google_ads_account ? 'áno' : 'nie'} | Meta Business: ${onboarding.has_meta_business ? 'áno' : 'nie'}

## RESEARCH DÁTA

**Top kľúčové slová (Marketing Miner):**
${keywordData.slice(0, 25).map(k => `- "${k.keyword}" (${k.search_volume}/mes, CPC: ${(k.cpc || 0).toFixed(2)}€${k.competition ? `, konk: ${k.competition}` : ''})`).join('\n') || '(nedostupné)'}

**Konkurencia (z onboardingu + SERP):**
${allCompetitors.length > 0 ? allCompetitors.map((c: any) => `- ${c.domain}${c.is_paid ? ' [platí reklamy]' : ''}${c.titles?.length ? ` — "${c.titles[0]}"` : ''}`).join('\n') : '(nedostupné)'}

**Čo konkurenti píšu v platených reklamách:**
${paidAdsInsights.length > 0 ? paidAdsInsights.slice(0, 8).map((a: any) => `- [${a.query}] "${a.title}" — ${a.snippet?.substring(0, 100) || ''}`).join('\n') : '(nedostupné - Serper API nie je aktívny alebo nenašiel ads)'}

## PLATFORMY NA SPRACOVANIE
${platforms.join(', ')}

## POŽADOVANÝ VÝSTUP (strict JSON)

{
  "business_analysis": {
    "summary": "2-3 vety - stručný recap kto klient je a čo potrebuje",
    "key_insights": ["insight 1", "insight 2", "insight 3"],
    "challenges": ["výzva 1", "výzva 2"],
    "opportunities": ["príležitosť 1", "príležitosť 2"]
  },
  "strategy_summary": "3-5 viet - celková stratégia prečo tieto kampane, aká taktika, prečo tento mix platforiem",
  "research_insights": {
    "market_analysis": "2-3 vety o trhu a dopyte",
    "competitor_analysis": "2-3 vety o konkurencii, čo robia, kde je priestor",
    "keyword_strategy": "2 vety o keyword mixe - aké témy cielime",
    "recommended_approach": "krátky odsek - odporúčaný prístup"
  },
  "campaigns": [
    {
      "name": "Názov kampane",
      "platform": "google" alebo "meta",
      "campaign_type": "search|display|pmax|traffic|conversions|awareness|video",
      "objective": "konkrétny cieľ tejto kampane",
      "rationale": "1-2 vety prečo práve táto kampaň a akú úlohu v stratégii hrá",
      "daily_budget": číslo v €,
      "targeting": {
        "locations": ["Slovensko"],
        "age_from": 18, "age_to": 65,
        "gender": "all|male|female",
        "keywords": ["kľúčové slová"],
        "interests": ["záujmy (Meta)"],
        "audiences": ["audience segmenty"]
      },
      "ad_groups": [
        {
          "name": "Názov ad group",
          "theme": "1 veta čo táto ad group rieši",
          "keywords": ["kľúčové slová pre túto skupinu"],
          "negative_keywords": ["negatívne kľúčové slová"],
          "ads": [
            {
              "type": "responsive",
              "headlines": ["Max 30 znakov"],
              "descriptions": ["Max 90 znakov"],
              "call_to_action": "CTA"
            }
          ]
        }
      ],
      "estimated_results": {
        "impressions": číslo,
        "clicks": číslo,
        "ctr": percento (číslo),
        "conversions": číslo,
        "cpa": číslo v €
      }
    }
  ],
  "budget_breakdown": {
    "total_monthly": číslo,
    "by_platform": [ { "platform": "google|meta", "monthly": číslo, "percentage": číslo } ],
    "by_campaign": [ { "campaign_name": "...", "monthly": číslo } ],
    "reasoning": "1-2 vety prečo takéto rozdelenie"
  },
  "expected_results": {
    "day_30": { "impressions": číslo, "clicks": číslo, "conversions": číslo, "cpa": číslo, "roas": číslo },
    "day_90": { "impressions": číslo, "clicks": číslo, "conversions": číslo, "cpa": číslo, "roas": číslo },
    "day_180": { "impressions": číslo, "clicks": číslo, "conversions": číslo, "cpa": číslo, "roas": číslo },
    "notes": "1-2 vety o očakávaní - kedy sa začnú prejavovať optimalizácie"
  },
  "timeline": {
    "phases": [
      { "name": "Príprava", "duration_days": číslo, "activities": ["aktivita"] },
      { "name": "Spustenie", "duration_days": číslo, "activities": ["aktivita"] },
      { "name": "Optimalizácia", "duration_days": číslo, "activities": ["aktivita"] },
      { "name": "Škálovanie", "duration_days": číslo, "activities": ["aktivita"] }
    ]
  },
  "next_steps": {
    "client_needs_to_provide": ["čo klient musí dodať - prístupy, materiály..."],
    "our_next_actions": ["čo my spravíme po schválení"],
    "launch_readiness": ["čo musí byť hotové pred spustením"]
  }
}

## PRAVIDLÁ
- Všetko v slovenčine, klient-facing texty v množnom čísle ("pre Vás pripravujeme")
- NIKDY nespomínaj AI alebo automatizáciu
- Headlines max 30 znakov, descriptions max 90 znakov
- Min 2 kampane (aspoň 1 Google + 1 Meta ak obe platformy sú v zozname)
- Každá kampaň 2-3 ad groups, každá ad group 2-3 reklamy
- Rozpočet rozdel realisticky — nezabudni na denný limit per kampaň
- Využi konkrétne data z onboardingu a research, nie generické frázy
- Odpoveď LEN JSON, žiadny text navyše
`

    // 5. Call Claude
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    const claudeJson = await claudeRes.json()
    if (claudeJson.error) throw new Error(claudeJson.error.message)

    // 6. Parse (viacstupňový repair — smart quotes, trailing commas, truncation)
    const content = claudeJson.content[0].text
    const doc: any = parseClaudeJSON(content)

    const campaigns = doc.campaigns || []
    if (campaigns.length === 0) throw new Error('No campaigns generated')

    // 7. Re-run guard: zmaž staré AI draft kampane, inak by re-generácia
    // vytvorila duplicitnú sadu
    await deleteOldDraftCampaigns(supabase, project_id)

    // 8. Save campaigns hierarchy
    let campaignsGenerated = 0
    for (const campaign of campaigns) {
      const { data: savedCampaign, error: cErr } = await supabase
        .from('campaigns')
        .insert({
          project_id,
          name: campaign.name,
          platform: campaign.platform,
          campaign_type: campaign.campaign_type,
          objective: campaign.objective,
          budget_daily: campaign.daily_budget,
          status: 'draft',
          targeting: campaign.targeting,
          metrics: { estimated: campaign.estimated_results, rationale: campaign.rationale },
          ai_generated: true
        })
        .select().single()
      if (cErr) { console.error('Campaign insert:', cErr); continue }
      campaignsGenerated++

      for (const g of (campaign.ad_groups || [])) {
        const { data: savedAG, error: gErr } = await supabase
          .from('ad_groups')
          .insert({
            campaign_id: savedCampaign.id,
            name: g.name,
            keywords: g.keywords || [],
            negative_keywords: g.negative_keywords || [],
            status: 'draft'
          })
          .select().single()
        if (gErr) { console.error('Ad group insert:', gErr); continue }

        for (const ad of (g.ads || [])) {
          const { error: adErr } = await supabase
            .from('ads')
            .insert({
              ad_group_id: savedAG.id,
              ad_type: ad.type || 'responsive',
              headlines: ad.headlines || [],
              descriptions: ad.descriptions || [],
              call_to_action: ad.call_to_action,
              status: 'draft'
            })
          if (adErr) console.error('Ad insert:', adErr)
        }
      }
    }

    // 9. Save strategy document on project
    // proposal_version inkrementuj pri re-rune (debug: ktorú verziu klient videl)
    const { data: currentProject } = await supabase
      .from('campaign_projects')
      .select('proposal_version')
      .eq('id', project_id)
      .maybeSingle()
    const nextVersion = (currentProject?.proposal_version || 0) + 1

    await supabase
      .from('campaign_projects')
      .update({
        status: 'internal_review',
        strategy_summary: doc.strategy_summary || null,
        business_analysis: doc.business_analysis || null,
        research_data: {
          ...researchData,
          insights: doc.research_insights || null,
          model_used: 'claude-sonnet-4-6',
          generator_version: 2
        },
        expected_results: doc.expected_results || null,
        timeline: doc.timeline || null,
        budget_breakdown: doc.budget_breakdown || null,
        next_steps: doc.next_steps || null,
        total_monthly_budget: doc.budget_breakdown?.total_monthly || monthlyBudget,
        proposal_version: nextVersion
      })
      .eq('id', project_id)

    return new Response(
      JSON.stringify({
        success: true,
        campaigns_generated: campaignsGenerated,
        keywords_used: keywordData.length,
        competitors_analyzed: allCompetitors.length,
        serp_queries: serpResults.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('Generate campaigns error:', error)
    // Server-side reset statusu — nezávislé od toho či frontend ešte žije
    if (supabase && projectIdForError) {
      try {
        await supabase
          .from('campaign_projects')
          .update({ status: 'draft', notes: `AI error: ${(error as Error).message}`.slice(0, 500) })
          .eq('id', projectIdForError)
          .eq('status', 'generating')
      } catch (resetErr) {
        console.error('Status reset failed:', resetErr)
      }
    }
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
