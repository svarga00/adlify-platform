// ==========================================
// GENERATE DEEP PROPOSAL — premium_analysis JSON
//
// Vstup:  { leadId, model?, customNotes? }
// Output: { premium_analysis: {...}, model, generated_at, usage }
//
// Vracia OBohatený analysis schema KOMPATIBILNÝ s existing
// buildProposalHTML template (12-sekcií page-based proposal s ad
// mockupmi pre Google/Meta/Instagram/LinkedIn).
//
// Cieľ: zachovať krásny design pôvodného proposalu, len nahradiť
// generický obsah hlbokým, personalizovaným, profesionálnym
// content od Claude Opus.
//
// Deploy: `supabase functions deploy generate-deep-proposal`
// Env (Edge Function secrets): ANTHROPIC_API_KEY, SUPABASE_URL,
//                              SUPABASE_SERVICE_ROLE_KEY
// ==========================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DEFAULT_MODEL = 'claude-opus-4-5'

const SYSTEM_PROMPT = `Si senior PPC stratég v slovenskej digitálnej marketingovej agentúre s 10+ rokmi skúseností (Google Ads, Meta Ads, LinkedIn, performance marketing).

Tvoja úloha: pre konkrétneho leada vygenerovať **podrobný, profesionálny, unikátny premium marketingový návrh**, ktorý bude pitch dokument pripravený na podpis kontraktu. Klient po prečítaní by mal hneď chcieť spolupracovať.

POVINNÉ PRAVIDLÁ:

1. **Slovenčina vždy.** Profesionálny ale ľudský tón. ZÁKAZ floskúl typu "synergie", "best practices", "leveraging", "kľúčové aktíva". Konkrétne čísla a kroky.

2. **ZÁKAZ EMOJI.** Žiadne ✅ 🚀 🎯 💡 📊 atď. nikde v texte. Používame iba slová.

3. **Extrémna personalizácia.** Použi názov firmy, doménu, mestá, biz model, konkrétne produkty/služby. Ak je to e-shop záhradnej techniky → spomeň konkrétne produktové kategórie. Ak je B2B služba → konkrétny ICP s rolami. Nikdy "vaša firma" generic.

4. **Reálne čísla.** Marketing Miner search volume + CPC ak sú. Inak realistické estimate pre SR (mestá 5-50K obyvateľov: 50-500 hľadaní/mes, CPC 0.20-2.50 €). Budget musí sedieť matematicky (suma = celok).

5. **Detailné "prečo" a "ako" v každej sekcii.** Nielen "Google Ads Search 800€/mes" — ale aj 2-3 vety prečo tento kanál pre tohto klienta, ako bude vyzerať realizácia, čo očakávame.

6. **Reklamné kreatívy konkrétne.** Pre každú reklamu — headline, description, primary text, CTA. Pre Meta — aj predstaviteľný vizuál (1-2 vety opis obrázka). Pre Instagram Story — full-screen koncept.

7. **Výstup je VÝLUČNE JSON.** Žiadny text okolo, žiadne markdown wrappery.

Tvar JSON odpovede (presne tieto kľúče):

{
  "company": {
    "name": "presný názov firmy",
    "domain": "doména",
    "industry": "konkrétne odvetvie",
    "city": "mesto/región",
    "services": ["3-6 konkrétnych služieb/produktových kategórií"],
    "idealCustomer": "Detailný opis ICP — kto presne, demografia, intent, problém ktorý rieši. 2-3 vety."
  },
  "executive_summary": "4-6 odstavcov. (1) Kto je klient — biz model, lokalita, USP. (2) Situácia na trhu — prečo PPC práve teraz. (3) Naša stratégia v 1 vete + dôvod. (4) Očakávaný výsledok za 3/6 mesiacov s konkrétnymi číslami. (5) Prečo my agentúra — diferenciátor. (6) Investícia a ROI.",
  "ourFindings": {
    "strengths": [
      { "title": "krátky názov silnej stránky", "description": "1-2 vety prečo je to silná stránka a ako ju využijeme v reklame" }
    ],
    "opportunities": [
      { "title": "krátky názov príležitosti", "description": "1-2 vety čo presne urobíme a aký výsledok očakávame" }
    ]
  },
  "onlinePresence": {
    "website": { "status": "good|needs_work|critical", "notes": "konkrétne čo funguje a čo chýba na webe" },
    "social": { "status": "good|needs_work|missing", "notes": "social presence assessment" },
    "seo": { "status": "good|needs_work|critical", "notes": "SEO stav" },
    "ppc": { "status": "none|basic|advanced", "notes": "PPC histora ak je" }
  },
  "swot": {
    "strengths": ["3-5 silných stránok firmy z marketing perspectívy"],
    "weaknesses": ["2-4 slabostí ktoré treba ošetriť"],
    "opportunities": ["3-5 trhových príležitostí"],
    "threats": ["2-4 hrozby (konkurencia, regulácie, trend)"]
  },
  "keywords": {
    "primary": [
      { "keyword": "...", "search_volume": 1200, "cpc_eur": 0.45, "intent": "buy|info|brand", "priority": "high" }
    ],
    "secondary": [
      { "keyword": "...", "search_volume": 300, "cpc_eur": 0.30, "intent": "info" }
    ],
    "longTail": [
      { "keyword": "...", "search_volume": 50, "cpc_eur": 0.18 }
    ]
  },
  "strategy": {
    "overview": "1 odstavec — high-level prístup pre tohto klienta a prečo.",
    "channels": [
      {
        "name": "Google Ads — Search",
        "monthly_budget_eur": 800,
        "rationale": "3-4 vety prečo presne tento kanál pre tohto klienta, ako bude vyzerať realizácia (typy kampaní, audience), aký výsledok očakávame v 1./3./6. mesiaci",
        "expected_kpi": "konkrétne číslo (napr. 35 leadov/mes pri CPL 22€)"
      }
    ],
    "creativeApproach": "2 odstavce o copy/visual direction — tón, mood, hlavné messaging hooky pre tohto klienta. Diferenciátor od konkurencie."
  },
  "proposedCampaigns": {
    "google": {
      "searchCampaign": {
        "name": "konkrétny názov (napr. 'Search Brand — Ra-ga.sk' alebo 'Search Generic — PUR pena Trenčín')",
        "monthly_budget_eur": 400,
        "objective": "1 veta konkrétny cieľ",
        "adGroups": [
          {
            "name": "Názov ad group (napr. 'PUR pena strecha')",
            "keywords": ["5-8 cielených kľúčových slov"],
            "matchTypes": ["phrase", "exact"],
            "adCopy": {
              "headlines": ["3-5 headline variantov — každý 30 znakov max"],
              "descriptions": ["2-3 description varianty — každý 90 znakov max"],
              "sitelinks": ["3-4 sitelink extensions"],
              "callouts": ["3-4 callout extensions"]
            },
            "landingPage": "URL alebo opis ideálnej landing page",
            "rationale": "1-2 vety prečo táto kombinácia KW + copy + LP"
          }
        ]
      },
      "performanceMaxCampaign": {
        "name": "Performance Max — názov",
        "monthly_budget_eur": 300,
        "audienceSignals": ["3-4 audience signals"],
        "assetGroups": [
          {
            "theme": "téma asset groupu",
            "headlines": ["headlines"],
            "descriptions": ["descriptions"],
            "imageDirection": "1 veta o vizuáloch"
          }
        ]
      }
    },
    "meta": {
      "campaign": {
        "name": "Meta — názov",
        "monthly_budget_eur": 400,
        "objective": "konkrétny cieľ (leads/conversions/traffic)",
        "audience": {
          "primary": "demografia + záujmy + behaviors",
          "lookalike": "z akého source",
          "retargeting": "od koho retargetujeme"
        },
        "adSets": [
          {
            "name": "Ad set — názov",
            "audience": "konkrétna audience",
            "placements": ["Facebook Feed", "Instagram Feed", "Reels"],
            "adCopy": {
              "primaryText": "Hlavný text reklamy — 2-4 vety, hook + benefit + CTA",
              "headline": "Bold headline 40 znakov max",
              "description": "Sub-text 30 znakov max",
              "cta": "Zistiť viac | Kontaktovať | Objednať teraz",
              "imageDescription": "1-2 vety opis vizuálu (čo bude na obrázku/videu)"
            },
            "rationale": "Prečo tento ad set — 2 vety"
          }
        ]
      }
    },
    "instagram": {
      "stories": [
        {
          "name": "Story — názov konceptu",
          "concept": "1-2 vety celkový koncept",
          "headline": "Bold text na story (krátky)",
          "subtext": "Doplnkový text",
          "imageDescription": "Opis vizuálu — full-screen vertical",
          "cta": "Zistiť viac | Swipe up"
        }
      ]
    },
    "linkedin": {
      "sponsoredContent": {
        "audience": "B2B targeting — pracovné pozície, odvetvie, veľkosť firmy",
        "monthly_budget_eur": 200,
        "adCopy": {
          "headline": "B2B headline",
          "primaryText": "B2B primary text — odbornejší tón",
          "cta": "Stiahnuť | Zaregistrovať sa"
        },
        "rationale": "Prečo LinkedIn (alebo prečo nie pre tohto klienta — nullable)"
      }
    },
    "googleDisplay": {
      "banner": {
        "concept": "1-2 vety vizuálny koncept",
        "headline": "Headline na banneri",
        "description": "Sub-text",
        "cta": "CTA button text",
        "targeting": "audiences (in-market, affinity, custom)"
      }
    }
  },
  "budget": {
    "summary": "2-3 vety zhrnutie celkového investičného plánu a logiky rozdelenia",
    "monthly_total_eur": 1500,
    "media_spend_eur": 1200,
    "agency_fee_eur": 300,
    "allocations": [
      { "channel": "Google Ads Search", "amount_eur": 800, "pct": 53, "rationale": "1 veta prečo najviac sem" }
    ],
    "recommendations": {
      "conservative": { "total_eur": 1000, "leads_expected": 15, "description": "konzervatívna verzia s nižším rizikom" },
      "moderate":     { "total_eur": 1500, "leads_expected": 30, "description": "odporúčaná" },
      "aggressive":   { "total_eur": 2500, "leads_expected": 60, "description": "agresívna škálovacia" }
    },
    "avgCpc": 0.50,
    "six_month_projection_eur": 9000,
    "scaling_notes": "ako budget škáluje keď začnú výsledky"
  },
  "roi": {
    "explanation": "2-3 vety ako sme prišli k ROI číslam (assumptions: avg order value, conversion rate, repeat purchase, atď.)",
    "month_1": { "spend_eur": 1500, "leads": 10, "cpl_eur": 150, "revenue_eur": 3000, "roi_pct": 100, "explanation": "1 veta" },
    "month_3": { "spend_eur": 1500, "leads": 30, "cpl_eur": 50,  "revenue_eur": 9000, "roi_pct": 500, "explanation": "1 veta" },
    "month_6": { "spend_eur": 2000, "leads": 60, "cpl_eur": 33,  "revenue_eur": 18000, "roi_pct": 800, "explanation": "1 veta" }
  },
  "timeline": {
    "weeks": [
      { "week": "1", "milestone": "Onboarding + audit", "deliverables": ["3-4 konkrétne deliverables"], "duration_hours": 12 },
      { "week": "2", "milestone": "Setup", "deliverables": ["..."], "duration_hours": 18 },
      { "week": "3-4", "milestone": "Pilot launch", "deliverables": ["..."], "duration_hours": 20 },
      { "week": "5-8", "milestone": "Optimalizácia & scaling", "deliverables": ["..."], "duration_hours": 32 }
    ],
    "totalHoursMonth1": 82,
    "recurringMonthlyHours": 40
  },
  "ourSolution": {
    "headline": "1 vetový hook prečo my",
    "valueProps": [
      { "title": "krátky benefit", "description": "1-2 vety detail" }
    ]
  },
  "competitive_landscape": {
    "main_competitors": [
      { "name": "menovitý konkurent", "their_strength": "...", "our_advantage": "..." }
    ],
    "positioning": "1-2 vety ako sa odlíšime"
  },
  "risks": [
    { "risk": "konkrétne riziko", "mitigation": "ako ho ošetríme" }
  ],
  "next_steps": [
    "Konkrétny ďalší krok 1",
    "Konkrétny ďalší krok 2",
    "Konkrétny ďalší krok 3"
  ],
  "unique_insight": "Jeden veľmi špecifický insight ku konkrétnemu klientovi — niečo čo by konkurent neuvidel. 2-3 vety. Toto je 'wow moment' v proposale."
}

PRIPOMENUTIE:
- Žiadne emoji. Žiadne ${'```'}json wrappery.
- Personalizácia až do detailov produktov, miest, ICP.
- Reklamné kreatívy musia byť naozaj použiteľné — copywriter quality, žiadne lorem ipsum.
- Pre každú sekciu min. 1-2 vety "prečo" a "ako".
- Output JSON musí byť syntakticky validný (žiadne trailing commas).`

async function fetchPage(url: string, timeoutMs = 8000): Promise<{ url: string; html: string } | null> {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Adlify-Proposal-Bot/1.0)' }
    })
    clearTimeout(t)
    if (!resp.ok) return null
    return { url, html: await resp.text() }
  } catch {
    return null
  }
}

function extractPageContent(url: string, html: string): string {
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || ''
  const desc = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1]
            || html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i)?.[1]
            || ''
  const h1s = [...html.matchAll(/<h1[^>]*>([^<]+)<\/h1>/gi)].map(m => m[1].trim()).slice(0, 5)
  const h2s = [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/gi)].map(m => m[1].trim()).slice(0, 10)
  const h3s = [...html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/gi)].map(m => m[1].trim()).slice(0, 15)
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000)
  return `URL: ${url}
Title: ${title}
Description: ${desc}
H1: ${h1s.join(' | ')}
H2: ${h2s.join(' | ')}
H3: ${h3s.join(' | ')}
Body: ${bodyText}`
}

// Multi-page scrape — homepage + relevantné internal linky (sluzby/produkty/o-nas/referencie/cennik)
async function deepScrape(domain: string): Promise<string> {
  if (!domain) return ''
  const base = domain.startsWith('http') ? domain : `https://${domain}`
  const baseUrl = new URL(base)
  const origin = baseUrl.origin

  const homepage = await fetchPage(base, 10000)
  if (!homepage) return ''

  const pages: { url: string; html: string }[] = [homepage]
  const homeHtml = homepage.html

  // Extract internal links — hľadáme tie ktoré obsahujú relevantné keywords
  const relevantKeywords = [
    'sluzb', 'service', 'produkt', 'product', 'o-nas', 'about',
    'referenc', 'portfolio', 'cennik', 'pricing', 'kontakt', 'contact',
    'projekt', 'realizac', 'galer', 'gallery', 'blog'
  ]
  const linkMatches = [...homeHtml.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)]
  const candidates = new Set<string>()
  for (const m of linkMatches) {
    let href = m[1].trim()
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue
    try {
      const u = href.startsWith('http') ? new URL(href) : new URL(href, origin)
      if (u.origin !== origin) continue
      const path = u.pathname.toLowerCase()
      if (path === '/' || path === '') continue
      if (relevantKeywords.some(kw => path.includes(kw))) {
        candidates.add(u.origin + u.pathname)
      }
    } catch {}
  }

  const top = [...candidates].slice(0, 4)
  console.log(`[scrape] Homepage + ${top.length} relevant subpages:`, top)

  const results = await Promise.allSettled(top.map(u => fetchPage(u, 8000)))
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) pages.push(r.value)
  }

  return pages.map(p => extractPageContent(p.url, p.html)).join('\n\n---\n\n')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY chýba v Supabase Edge secrets' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const body = await req.json()
    const { leadId, model = DEFAULT_MODEL, customNotes = '' } = body
    if (!leadId) {
      return new Response(JSON.stringify({ error: 'leadId je povinný' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[premium] Loading lead ${leadId}`)
    const { data: lead, error: leadErr } = await supabase
      .from('leads').select('*').eq('id', leadId).single()
    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: 'Lead nenájdený: ' + (leadErr?.message || '') }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[premium] Deep scrape ${lead.domain}`)
    const scrapedContent = await deepScrape(lead.domain)

    const context = `LEAD DATA:
Firma: ${lead.company_name || 'neuvedené'}
Doména: ${lead.domain || 'neuvedená'}
Email: ${lead.email || '—'}
Telefón: ${lead.phone || '—'}
Odvetvie: ${lead.industry || lead.analysis?.company?.industry || 'neuvedené'}
Mesto / lokalita: ${lead.city || lead.analysis?.company?.city || lead.analysis?.company?.location || 'neuvedené'}

PÔVODNÁ AI ANALÝZA (od analyze-lead Edge function):
${JSON.stringify(lead.analysis || {}, null, 2).slice(0, 10000)}

MARKETING DATA (Marketing Miner):
${JSON.stringify(lead.marketing_data || {}, null, 2).slice(0, 5000)}

DEEP WEB SCRAPE (homepage + relevantné podstránky klienta):
${scrapedContent}

${customNotes ? `CUSTOM POŽIADAVKY OD AGENTÚRY:\n${customNotes}\n` : ''}

ÚLOHA:
Si senior PPC stratég. Použij DOSTUPNÝ web_search tool na vyhľadanie:
1. Top 3-5 konkurentov v ${lead.industry || 'tomto odvetví'} na slovenskom trhu (najmä v lokalite ${lead.city || ''})
2. Aktuálne ceny / trendy / market data v odvetví na SK trhu
3. Bench-marky pre Google Ads / Meta Ads v tomto segmente (avg CPC, CTR, conversion rate)
4. Špecifické insights ku klientovi (existuje case study, špecifický problém ICP, atď.)

Maximálne 6 web search dotazov. Citácie URL ulož do "research_sources" v output JSON.

Použij EXTENDED THINKING — premysli si stratégiu hĺbavo pred vygenerovaním JSON output.

Vygeneruj PREMIUM marketingový návrh — extrémne podrobný, personalizovaný, s konkrétnymi reklamnými kreatívami pre Google Ads, Meta (FB+IG), Instagram Stories, LinkedIn, Display. Klient po prečítaní musí mať pocit "presne to potrebujem, kde mám podpísať". Žiadne emoji.

Output JSON podľa system promptu + navyše:
"research_sources": [{"url": "...", "summary": "1 veta čo sme z neho zistili"}]
"competitive_landscape.main_competitors[].evidence_url": "URL kde sme našli údaje o konkurentovi"`

    console.log(`[premium] Calling Anthropic with model ${model} + web_search + extended thinking`)
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 20000,
        thinking: { type: 'enabled', budget_tokens: 10000 },
        tools: [{ type: 'web_search_20250604', max_uses: 6 }],
        // Prompt caching — system prompt sa cache-uje (rovnaký pre každého
        // klienta), pri opakovaných volaniach ušetríme ~90% input ceny
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: context }],
      })
    })

    const claudeJson = await claudeRes.json()
    if (claudeJson.error) {
      console.error('[premium] Anthropic error:', claudeJson.error)
      return new Response(JSON.stringify({ error: claudeJson.error.message || 'Anthropic API chyba' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Output content array može obsahovať: thinking blocks, tool_use blocks (web_search),
    // tool_result blocks, a finálne text bloky s JSON output. Extrahujeme len text bloky.
    const text = (claudeJson.content || [])
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text || '').join('').trim()
    console.log(`[premium] Got ${text.length} chars text + ${(claudeJson.content || []).length} content blocks`)
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    let premium
    try { premium = JSON.parse(cleaned) }
    catch {
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (!match) {
        console.error('[premium] Cannot parse JSON. Raw text:', cleaned.slice(0, 1000))
        throw new Error('Model nevrátil platný JSON')
      }
      premium = JSON.parse(match[0])
    }

    const generatedAt = new Date().toISOString()
    console.log(`[premium] Saving to DB for lead ${leadId}`)
    const { error: updateErr } = await supabase.from('leads').update({
      premium_analysis: premium,
      premium_analysis_generated_at: generatedAt,
      premium_analysis_model: model,
      // Zachováme aj starý deep_proposal stĺpec pre backwards compat
      deep_proposal: premium,
      deep_proposal_generated_at: generatedAt,
      deep_proposal_model: model,
    }).eq('id', leadId)

    if (updateErr) {
      console.error('[premium] DB update error:', updateErr)
    }

    return new Response(JSON.stringify({
      premium_analysis: premium,
      proposal: premium, // alias pre frontend backwards compat
      model,
      generated_at: generatedAt,
      usage: claudeJson.usage || null,
      db_saved: !updateErr,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[premium] Fatal error:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Neočakávaná chyba' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
