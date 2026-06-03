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

const DEFAULT_MODEL = 'claude-sonnet-4-5'

// ============================================================
// SECTION MODE — generuj len konkrétnu sekciu premium_analysis.
// Každá sekcia je <30s, takže ide sync (žiadny background).
// Frontend môže generovať postupne, upravovať a regenerovať.
// ============================================================

const SECTION_DEFS: Record<string, { label: string; promptKey: string; estimatedSec: number; useWebSearch?: boolean }> = {
  analysis: {
    label: 'Analýza firmy + SWOT + online prítomnosť',
    promptKey: 'analysis',
    estimatedSec: 15,
  },
  keywords: {
    label: 'Kľúčové slová (primary + secondary + long-tail)',
    promptKey: 'keywords',
    estimatedSec: 15,
  },
  strategy: {
    label: 'Stratégia + kanály + creative approach',
    promptKey: 'strategy',
    estimatedSec: 20,
  },
  campaigns: {
    label: 'Reklamné kampane (Google + Meta + IG + LinkedIn)',
    promptKey: 'campaigns',
    estimatedSec: 30,
  },
  budget: {
    label: 'Rozpočet + ROI',
    promptKey: 'budget',
    estimatedSec: 15,
  },
  summary: {
    label: 'Executive summary + unique insight + next steps',
    promptKey: 'summary',
    estimatedSec: 15,
  },
  competitive: {
    label: 'Konkurenčný research (živý web search)',
    promptKey: 'competitive',
    estimatedSec: 60,
    useWebSearch: true,
  },
  audit: {
    label: 'Audit existujúcich kampaní (entry point pre warm leadov)',
    promptKey: 'audit',
    estimatedSec: 8,
  },
}

const SECTION_PROMPTS: Record<string, string> = {
  analysis: `Si senior PPC stratég. Vygeneruj sekciu "ANALÝZA FIRMY + SWOT + ONLINE PRÍTOMNOSŤ + ICP" pre marketingový proposal v slovenčine. Zákaz emoji. Zákaz floskúl (synergie, best practices, atď.). Konkrétne čísla, krátke vety, expert tone.

Vráť VÝLUČNE JSON v tvare:
{
  "company": { "name": "...", "domain": "...", "industry": "...", "city": "...", "services": ["..."], "idealCustomer": "Detailný opis ICP — 2-3 vety, kto presne, demografia, intent, problém" },
  "target_audience": {
    "primary": {
      "demographics": "1-2 vety demografia (vek, pohlavie, rodinný stav, príjem)",
      "interests": ["4-6 záujmov ktoré sledujú/lajknú na webe a social"],
      "behaviors": ["3-5 nákupných správaní (kedy nakupujú, ako sa rozhodujú, čo ich brzdí)"]
    }
  },
  "ourFindings": {
    "strengths": [{ "title": "...", "description": "1-2 vety" }],
    "opportunities": [{ "title": "...", "description": "1-2 vety" }]
  },
  "onlinePresence": {
    "website": { "status": "good|needs_work|critical", "notes": "..." },
    "social": { "status": "good|needs_work|missing", "notes": "...", "facebook": "URL alebo null", "instagram": "URL alebo null", "linkedin": "URL alebo null" },
    "seo": { "status": "good|needs_work|critical", "notes": "..." },
    "ppc": { "status": "none|basic|advanced", "notes": "..." }
  },
  "swot": {
    "strengths": ["3-5"], "weaknesses": ["2-4"],
    "opportunities": ["3-5"], "threats": ["2-4"]
  }
}

DÔLEŽITÉ pre onlinePresence:
- Pozri sa do contextu na blok "DETECTED SIGNALS FROM HTML". Tam sú reálne social linky a tracking pixely extrahované z HTML klienta.
- Ak v "Social profiles" sú nájdené FB/IG/LinkedIn URL → social.status = "good" alebo "needs_work" (nikdy nie "missing"). Vyplň aj facebook/instagram/linkedin URL polia.
- Ak "Social profiles: NONE FOUND" → social.status = "missing".
- Ak v "Ad/tracking pixels" je Meta Pixel alebo Google Ads conversion → ppc.status = "basic" alebo "advanced". Ak iba GA/GTM bez ad pixela → "none" (majú analytics ale neinzerujú).
- Toto má prednosť pred tvojím vlastným odhadom z body textu — HTML scrape vidí veci ktoré v text body nie sú (footer ikony, JS skripty).`,

  keywords: `Si PPC stratég. Vygeneruj sekciu "KĽÚČOVÉ SLOVÁ" pre proposal v slovenčine. Použij Marketing Miner dáta ak sú, inak realistic estimate pre SR (mestá 5-50K: 50-500 hľadaní/mes, CPC 0.20-2.50 €).

Vráť VÝLUČNE JSON:
{
  "keywords": {
    "primary":   [{ "keyword": "...", "search_volume": 1200, "cpc_eur": 0.45, "intent": "buy|info|brand", "priority": "high" }],
    "secondary": [{ "keyword": "...", "search_volume": 300,  "cpc_eur": 0.30, "intent": "info" }],
    "longTail":  [{ "keyword": "...", "search_volume": 50,   "cpc_eur": 0.18 }]
  }
}

Minimum 6 primary, 5 secondary, 5 long-tail keywords. Všetko špecifické k tomuto klientovi (jeho produkty, lokalitu, intent).`,

  strategy: `Si PPC stratég. Vygeneruj sekciu "STRATÉGIA + KANÁLY" pre proposal v slovenčine. Konkrétne čísla, konkrétne kanály, "prečo a ako" pre každý.

Vráť VÝLUČNE JSON:
{
  "strategy": {
    "overview": "1 odstavec — high-level prístup pre tohto klienta a prečo",
    "channels": [
      {
        "name": "Google Ads — Search",
        "monthly_budget_eur": 800,
        "rationale": "3-4 vety prečo presne tento kanál, ako bude vyzerať realizácia, aký výsledok očakávame v 1./3./6. mesiaci",
        "expected_kpi": "konkrétne číslo (napr. 35 leadov/mes pri CPL 22€)"
      }
    ],
    "creativeApproach": "2 odstavce o copy/visual direction — tón, mood, messaging hooky pre tohto klienta. Diferenciátor od konkurencie."
  }
}

Minimum 3 kanály (typicky Google Search + Google Performance Max + Meta).`,

  campaigns: `Si PPC stratég. Vygeneruj sekciu "REKLAMNÉ KAMPANE" pre proposal v slovenčine. Konkrétne kampane s ad copy, headlines, descriptions, audience, landing pages. Copywriter quality, žiadne lorem ipsum.

Vráť VÝLUČNE JSON:
{
  "proposedCampaigns": {
    "google": {
      "searchCampaign": {
        "name": "konkrétny názov", "monthly_budget_eur": 400, "objective": "...",
        "adGroups": [{
          "name": "...", "keywords": ["5-8"], "matchTypes": ["phrase","exact"],
          "adCopy": {
            "headlines": ["3-5 variantov, každý ≤30 znakov"],
            "descriptions": ["2-3 varianty, každý ≤90 znakov"],
            "sitelinks": ["3-4"], "callouts": ["3-4"]
          },
          "landingPage": "...", "rationale": "1-2 vety"
        }]
      },
      "performanceMaxCampaign": {
        "name": "...", "monthly_budget_eur": 300, "audienceSignals": ["3-4"],
        "assetGroups": [{ "theme": "...", "headlines": [...], "descriptions": [...], "imageDirection": "..." }]
      }
    },
    "meta": {
      "campaign": {
        "name": "...", "monthly_budget_eur": 400, "objective": "...",
        "audience": { "primary": "...", "lookalike": "...", "retargeting": "..." },
        "adSets": [{
          "name": "...", "audience": "...", "placements": ["..."],
          "adCopy": {
            "primaryText": "2-4 vety hook + benefit + CTA",
            "headline": "≤40 znakov", "description": "≤30 znakov",
            "cta": "Zistiť viac|Kontaktovať|Objednať teraz",
            "imageDescription": "1-2 vety opis vizuálu"
          },
          "rationale": "2 vety"
        }]
      }
    },
    "instagram": {
      "stories": [{
        "name": "...", "concept": "1-2 vety", "headline": "...", "subtext": "...",
        "imageDescription": "...", "cta": "..."
      }]
    },
    "linkedin": {
      "sponsoredContent": {
        "audience": "B2B targeting — pozície, odvetvie, veľkosť firmy",
        "monthly_budget_eur": 200,
        "adCopy": { "headline": "...", "primaryText": "...", "cta": "..." },
        "rationale": "Prečo LinkedIn (alebo null ak nie je relevantný)"
      }
    }
  }
}`,

  budget: `Si PPC stratég. Vygeneruj sekciu "ROZPOČET + ROI" pre proposal v slovenčine. Matematicky sediaci budget (suma = celok). Realistic ROI assumptions.

Vráť VÝLUČNE JSON:
{
  "budget": {
    "summary": "2-3 vety zhrnutie investičného plánu",
    "monthly_total_eur": 1500, "media_spend_eur": 1200, "agency_fee_eur": 300,
    "allocations": [{ "channel": "Google Ads Search", "amount_eur": 800, "pct": 53, "rationale": "1 veta" }],
    "recommendations": {
      "conservative": { "totalBudget": 1000, "leads": 15, "description": "..." },
      "moderate":     { "totalBudget": 1500, "leads": 30, "description": "..." },
      "aggressive":   { "totalBudget": 2500, "leads": 60, "description": "..." }
    },
    "avgCpc": 0.50,
    "six_month_projection_eur": 9000,
    "scaling_notes": "ako budget škáluje keď začnú výsledky"
  },
  "roi": {
    "explanation": "2-3 vety ako sme prišli k ROI (AOV, conversion rate, repeat purchase)",
    "assumptions": {
      "avg_order_value_eur": 2800,
      "conversion_rate_pct": 5,
      "ltv_multiplier": 1.5,
      "ltv_eur": 4200
    },
    "month_1": { "spend_eur": 1500, "leads": 10, "cpl_eur": 150, "revenue_eur": 3000,  "roi_pct": 100, "explanation": "..." },
    "month_3": { "spend_eur": 1500, "leads": 30, "cpl_eur": 50,  "revenue_eur": 9000,  "roi_pct": 500, "explanation": "..." },
    "month_6": { "spend_eur": 2000, "leads": 60, "cpl_eur": 33,  "revenue_eur": 18000, "roi_pct": 800, "explanation": "..." }
  }
}`,

  summary: `Si senior PPC stratég. Toto je FINÁLNA záverečná sekcia proposalu — píš ako keby si videl všetky predošlé sekcie a teraz to zhrnieš. Slovenčina, ekspertný tón, žiadne floskuly.

DÔLEŽITÉ: Spomeň v executive summary aj že "Pred spustením kampaní spravíme detailný audit existujúcich aktivít (ak nejaké máte) — fee sa odpočítava pri uzavretí spolupráce" — to je entry point pre warm leadov ktorí už niečo bežia.

Vráť VÝLUČNE JSON:
{
  "executive_summary": "4-6 odstavcov. (1) Kto je klient. (2) Situácia na trhu. (3) Naša stratégia v 1 vete + dôvod. (4) Očakávaný výsledok za 3/6 mesiacov s konkrétnymi číslami. (5) Prečo my + audit ako bezplatný entry point pri spolupráci. (6) Investícia a ROI.",
  "ourSolution": {
    "headline": "1 vetový hook prečo my",
    "valueProps": [{ "title": "krátky benefit", "description": "1-2 vety" }]
  },
  "next_steps": ["Konkrétny krok 1", "Krok 2", "Krok 3"],
  "unique_insight": "Jeden veľmi špecifický insight ku konkrétnemu klientovi — niečo čo by konkurent neuvidel. 2-3 vety. Wow moment proposalu."
}`,

  audit: `Si senior PPC stratég. Vygeneruj sekciu "AUDIT EXISTUJÚCICH KAMPANÍ" pre marketingový proposal v slovenčine. Zákaz emoji. Expert tone, konkrétne čísla.

Účel sekcie: klient po zhrnutí svojich existujúcich kampaní (z lead.onlinePresence.ppc) si uvedomí že má zmysel ich auditovať PRED spustením nových. Ak nemá aktívne kampane, audit nepotrebuje — v tom prípade applicable=false a content je odľahčená.

Vráť VÝLUČNE JSON v tvare:
{
  "campaign_audit": {
    "applicable": true | false,
    "headline": "Hook headline (krátky, 5-8 slov) — ak applicable, lákavá ponuka auditu; ak nie, "Audit pred štartom" odľahčená verzia",
    "intro": "1-2 vety personalizované — prečo audit dáva zmysel pre TOHTO klienta (referenciuj jeho odvetvie, ppc status)",
    "scope": "1 veta — čo presne auditujeme (Google Ads + Meta + LinkedIn alebo čo bežiete)",
    "checklist": [
      "Štruktúra kampaní — segmentácia, match types, negatives, Quality Score",
      "Ad copy & creative performance — CTR, conversion rate, kvalita textov",
      "Audience & targeting — relevantnosť, prekrytie, exclusions",
      "Landing pages — load time, message match, mobile UX",
      "Tracking & analytics — pixely, konverzie správne nastavené",
      "Budget allocation — kde tečie, kde scale-up",
      "Konkurenčný benchmark — share of voice, ad copy compare"
    ],
    "requirements": [
      "Email na info@adlify.eu s názvom účtu",
      "Read-only prístup do účtu (alebo NDA + screenshots)",
      "60-min konzultačný call s vaším marketing tímom"
    ],
    "deliverables": [
      "Detailný PDF report (15-20 strán)",
      "Quick wins listing — 3-5 vecí na zlepšenie tento týždeň",
      "Strategické odporúčania na 3-6 mesiacov",
      "Live call review (60 min Zoom debrief)"
    ],
    "turnaround": "5 pracovných dní",
    "pricing": {
      "standalone_eur": 350,
      "credit_note": "Pri 3+ mesačnej spolupráci fee odpočítame z prvého mesiaca → audit zadarmo"
    },
    "cta_text": "Zažiadať o audit",
    "cta_subject": "Záujem o audit kampaní — <názov klienta>"
  }
}

Pravidlá:
- "applicable": true ak lead.onlinePresence.ppc.status je 'basic' alebo 'advanced' (klient už beží kampane). False ak 'none'.
- "intro" — vždy personalizované! Napr. "Vzhľadom na to že už beží Google Ads pre PUR penu, audit odhalí kde tečie budget a kde sú quick wins" alebo "Začnime auditom existujúcich kampaní — máte základ na ktorom môžeme stavať bez zbytočného testovania od nuly."
- Ak applicable=false, sekcia obsahuje LEN intro+headline ako "Pre-launch audit" mini verzia, ostatné polia môžu byť tie isté ale "scope" zmeň na "Pre-launch checklist: web, tracking, analytics setup pred spustením kampaní".`,

  competitive: `Si senior PPC stratég. POUŽIJ web_search tool (max 3 dotazy) na vyhľadanie reálnych konkurentov klienta. Nepoužívaj odhady — len overiteľné dáta z webu.

Search strategy:
1. "<industry> Slovensko top 5" alebo podobné
2. "<industry> <city> konkurencia"
3. Voliteľne: prípadová štúdia / market research SK

Vráť VÝLUČNE JSON:
{
  "competitive_landscape": {
    "main_competitors": [
      { "name": "menovitý konkurent", "their_strength": "...", "our_advantage": "...", "evidence_url": "https://..." }
    ],
    "positioning": "1-2 vety ako sa odlíšime"
  },
  "research_sources": [{ "url": "...", "summary": "1 veta čo sme z neho zistili" }]
}

Citácia URL je POVINNÁ pre každého konkurenta. Ak si neistá názvom alebo dátami, použij webovú stránku ktorú reálne pozrieš.`,
}

// Robustný JSON parsing — Sonnet/Opus občas vracia JSON s drobnými chybami:
// smart quotes, trailing commas, unescaped newlines v stringoch, truncated
// pri max_tokens, atď. Skúsi viacero stratégií opravy.
function tryParseJson(raw: string): any | null {
  // 1) Priamy parse
  try { return JSON.parse(raw) } catch {}

  // 2) Extract { ... } blok (najväčší match)
  const blockMatch = raw.match(/\{[\s\S]*\}/)
  if (blockMatch) {
    try { return JSON.parse(blockMatch[0]) } catch {}

    let candidate = blockMatch[0]
    // 3) Smart quotes → straight quotes
    candidate = candidate
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
    try { return JSON.parse(candidate) } catch {}

    // 4) Trailing commas pred } alebo ]
    candidate = candidate.replace(/,(\s*[}\]])/g, '$1')
    try { return JSON.parse(candidate) } catch {}

    // 5) Truncated JSON — pokus uzavrieť otvorené { a [ na konci
    let opens = 0, closes = 0, openSquare = 0, closeSquare = 0
    let inString = false, escaped = false
    for (const ch of candidate) {
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === '{') opens++
      else if (ch === '}') closes++
      else if (ch === '[') openSquare++
      else if (ch === ']') closeSquare++
    }
    let repaired = candidate
    // Odsekni od posledného poľa/objektu ak je v strings string ktorý nie je uzavretý
    if (inString) {
      // posledný open quote a všetko za ním vyrež
      const lastQuote = repaired.lastIndexOf('"')
      if (lastQuote > 0) repaired = repaired.slice(0, lastQuote)
    }
    // Odsekni trailing comma
    repaired = repaired.replace(/,\s*$/, '')
    // Pridaj chýbajúce ] a }
    while (openSquare > closeSquare) { repaired += ']'; closeSquare++ }
    while (opens > closes)         { repaired += '}'; closes++ }
    try { return JSON.parse(repaired) } catch {}
  }

  return null
}

async function generateSection(
  apiKey: string,
  supabase: any,
  lead: any,
  model: string,
  customNotes: string,
  sectionKey: string,
): Promise<{ partial: any; usage: any } | { error: string }> {
  const def = SECTION_DEFS[sectionKey]
  if (!def) return { error: `Neznáma sekcia: ${sectionKey}` }

  // Pre sekcie ktoré nie sú competitive je scrape len homepage + 1 page (rýchle)
  const useScrape = sectionKey !== 'competitive'
  const scraped = useScrape ? await deepScrape(lead.domain) : ''
  const context = buildSectionContext(lead, scraped, customNotes, sectionKey, def.label)

  const apiBody: any = {
    model,
    max_tokens: sectionKey === 'campaigns' ? 12000 : 6000,
    system: SECTION_PROMPTS[def.promptKey],
    messages: [{ role: 'user', content: context }],
  }
  if (def.useWebSearch) {
    apiBody.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]
    apiBody.max_tokens = 10000
  }

  const abort = new AbortController()
  const timeout = setTimeout(() => abort.abort(), 130000)
  let resp: Response
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: abort.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(apiBody),
    })
    clearTimeout(timeout)
  } catch (e) {
    clearTimeout(timeout)
    return { error: 'Anthropic timeout/network: ' + (e instanceof Error ? e.message : String(e)) }
  }

  const json = await resp.json()
  if (json.error) return { error: json.error.message || 'Anthropic error' }

  const text = (json.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text || '').join('').trim()
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  let partial = tryParseJson(cleaned)
  if (!partial) {
    console.error(`[section ${sectionKey}] Cannot parse JSON. First 500 chars:`, cleaned.slice(0, 500))
    console.error(`[section ${sectionKey}] Last 300 chars:`, cleaned.slice(-300))
    return { error: `JSON parse zlyhal pre sekciu ${sectionKey}. Skús regen — niekedy model vráti truncated alebo invalid JSON.` }
  }

  return { partial, usage: json.usage }
}

function buildSectionContext(lead: any, scrape: string, customNotes: string, sectionKey: string, label: string): string {
  return `LEAD:
Firma: ${lead.company_name || ''}
Doména: ${lead.domain || ''}
Odvetvie: ${lead.industry || lead.analysis?.company?.industry || ''}
Lokalita: ${lead.city || lead.analysis?.company?.city || ''}

PÔVODNÁ ANALÝZA (analyze-lead Edge fn):
${JSON.stringify(lead.analysis || {}, null, 2).slice(0, 6000)}

MARKETING DATA:
${JSON.stringify(lead.marketing_data || {}, null, 2).slice(0, 3000)}

${scrape ? `WEB SCRAPE:\n${scrape}\n` : ''}

${lead.premium_analysis ? `EXISTUJÚCE SEKCIE V PROPOSALI (referenčné pre koherenciu):\n${JSON.stringify(lead.premium_analysis, null, 2).slice(0, 5000)}\n` : ''}

${customNotes ? `CUSTOM POŽIADAVKY: ${customNotes}\n` : ''}

ÚLOHA: Vygeneruj VÝLUČNE sekciu "${label}" pre marketingový proposal. Output je čistý JSON podľa system promptu.`
}


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

// Extrahuj social/PPC stopy priamo z HTML — Claude inak nevidí <a href="...">
// tagy lebo extractPageContent strihá všetky tagy. Bez toho marketingoví signály
// (FB, IG, GA, Pixel...) sú pre LLM neviditeľné aj keď fyzicky v HTML sú.
function extractSocialLinks(html: string): {
  facebook: string | null,
  instagram: string | null,
  linkedin: string | null,
  youtube: string | null,
  tiktok: string | null,
} {
  const find = (re: RegExp) => {
    const m = html.match(re)
    return m ? (m[0].match(/https?:\/\/[^"'<>\s)]+/)?.[0] || null) : null
  }
  return {
    facebook:  find(/https?:\/\/(www\.)?facebook\.com\/[A-Za-z0-9_.\-/]+/i),
    instagram: find(/https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_.\-/]+/i),
    linkedin:  find(/https?:\/\/(www\.)?linkedin\.com\/(company|in)\/[A-Za-z0-9_.\-/]+/i),
    youtube:   find(/https?:\/\/(www\.)?youtube\.com\/(channel|c|user|@)[A-Za-z0-9_.\-/]+/i),
    tiktok:    find(/https?:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9_.\-/]+/i),
  }
}

// Detekuj základné tracking pixely / ad platforms — pomôže Claude správne
// klasifikovať PPC status (basic|advanced vs none).
function detectAdPixels(html: string): string[] {
  const found: string[] = []
  if (/googletagmanager\.com\/gtag\/js|gtag\s*\(/i.test(html)) found.push('Google Analytics (GA4)')
  if (/googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/i.test(html)) found.push('Google Tag Manager')
  if (/connect\.facebook\.net|fbq\s*\(\s*['"]init['"]/i.test(html)) found.push('Meta Pixel')
  if (/static\.ads-twitter\.com|twq\s*\(/i.test(html)) found.push('Twitter/X Pixel')
  if (/snap\.licdn\.com|_linkedin_partner_id/i.test(html)) found.push('LinkedIn Insight Tag')
  if (/analytics\.tiktok\.com|ttq\.load/i.test(html)) found.push('TikTok Pixel')
  if (/googleadservices\.com\/pagead|gtag\(['"]config['"],\s*['"]AW-/i.test(html)) found.push('Google Ads conversion')
  return [...new Set(found)]
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

  const top = [...candidates].slice(0, 3)
  console.log(`[scrape] Homepage + ${top.length} relevant subpages:`, top)

  const results = await Promise.allSettled(top.map(u => fetchPage(u, 6000)))
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) pages.push(r.value)
  }

  // Social linky a ad pixely hľadáme v homepage HTML (footer býva spravidla tam,
  // GTM/GA/Pixel skripty taktiež). Bez tohto Claude social/ppc status uhádne
  // z body textu = nepresné (text často "facebook" neobsahuje, ikona ano).
  const social = extractSocialLinks(homeHtml)
  const adPixels = detectAdPixels(homeHtml)
  const socialFound = Object.entries(social)
    .filter(([, url]) => !!url)
    .map(([net, url]) => `${net}: ${url}`)
  console.log(`[scrape] Social links found: ${socialFound.length}, ad pixels: ${adPixels.length}`)

  const detectedBlock = `DETECTED SIGNALS FROM HTML (extrahované z linkov + scriptov, nie z text body):
Social profiles: ${socialFound.length ? socialFound.join(' | ') : 'NONE FOUND'}
Ad/tracking pixels: ${adPixels.length ? adPixels.join(' | ') : 'NONE FOUND'}`

  return pages.map(p => extractPageContent(p.url, p.html)).join('\n\n---\n\n')
    + '\n\n---\n\n' + detectedBlock
}

// Background worker — beží do 400s cez EdgeRuntime.waitUntil.
// Po dokončení uloží premium_analysis do DB, frontend dostane realtime UPDATE.
async function runPremiumGeneration(
  apiKey: string,
  supabase: any,
  lead: any,
  model: string,
  customNotes: string,
) {
  const leadId = lead.id
  try {
    // Označ status pending v DB — frontend vidí že beží
    await supabase.from('leads').update({
      premium_analysis_status: 'generating',
      premium_analysis_started_at: new Date().toISOString(),
    }).eq('id', leadId)

    console.log(`[premium-bg] Deep scrape ${lead.domain}`)
    const scrapedContent = await deepScrape(lead.domain)
    console.log(`[premium-bg] Scrape done, calling Anthropic`)

    const context = buildContext(lead, scrapedContent, customNotes)

    // Anthropic call s web_search + extended thinking + Opus.
    // Background timeout 380s — pred Supabase Edge background limit 400s.
    const anthropicAbort = new AbortController()
    const anthropicTimeout = setTimeout(() => anthropicAbort.abort(), 380000)
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: anthropicAbort.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 14000,
        // Web search 2 uses — Anthropic call s 2 search ~60-120s typicky,
        // 5 uses bolo ~200-300s = nad Supabase Edge background 400s limit.
        // 2 uses dáva top konkurentov + benchmarky, dostatočná research depth.
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: context }],
      })
    })
    clearTimeout(anthropicTimeout)

    const claudeJson = await claudeRes.json()
    if (claudeJson.error) {
      console.error('[premium-bg] Anthropic error:', claudeJson.error)
      await supabase.from('leads').update({
        premium_analysis_status: 'error',
        premium_analysis_error: claudeJson.error.message || 'Anthropic error',
      }).eq('id', leadId)
      return
    }

    const text = (claudeJson.content || [])
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text || '').join('').trim()
    console.log(`[premium-bg] Got ${text.length} chars + ${(claudeJson.content || []).length} content blocks`)

    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    let premium
    try { premium = JSON.parse(cleaned) }
    catch {
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (!match) {
        console.error('[premium-bg] Cannot parse JSON. Raw:', cleaned.slice(0, 1000))
        await supabase.from('leads').update({
          premium_analysis_status: 'error',
          premium_analysis_error: 'Model nevrátil platný JSON',
        }).eq('id', leadId)
        return
      }
      premium = JSON.parse(match[0])
    }

    const generatedAt = new Date().toISOString()
    console.log(`[premium-bg] Saving to DB for lead ${leadId}`)
    await supabase.from('leads').update({
      premium_analysis: premium,
      premium_analysis_generated_at: generatedAt,
      premium_analysis_model: model,
      premium_analysis_status: 'done',
      premium_analysis_error: null,
      // Backwards compat
      deep_proposal: premium,
      deep_proposal_generated_at: generatedAt,
      deep_proposal_model: model,
    }).eq('id', leadId)

    console.log(`[premium-bg] DONE lead=${leadId}`)
  } catch (err) {
    console.error('[premium-bg] Fatal:', err)
    await supabase.from('leads').update({
      premium_analysis_status: 'error',
      premium_analysis_error: err instanceof Error ? err.message : String(err),
    }).eq('id', leadId)
  }
}

function buildContext(lead: any, scrapedContent: string, customNotes: string): string {
  return `LEAD DATA:
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

DEEP WEB SCRAPE (homepage + 3 relevantné podstránky klienta):
${scrapedContent}

${customNotes ? `CUSTOM POŽIADAVKY OD AGENTÚRY:\n${customNotes}\n` : ''}

ÚLOHA:
Si senior PPC stratég s 10+ rokmi skúseností na slovenskom trhu. Background mode — máš čas (do 6 min). Použij:

1. DETAILNÝ web scrape klientovho webu — extrahuj produkty, služby, ceny, USP, target audience, tone of voice, technologie ktoré používa
2. Pôvodnú AI analýzu — keywords, SWOT, market context
3. **web_search tool** — máš max 2 search dotazy, použij ich strategicky pre dva najdôležitejšie research smery:
   a) Top 3-5 konkurentov v ${lead.industry || 'odvetví'} v lokalite ${lead.city || 'SR'} — meno, web, USP
   b) Aktuálne CPC / market benchmarky pre tento segment na SK trhu

Citácie URL ulož do "research_sources" v output JSON. main_competitors[] majú "evidence_url".

ANTI-AI VOICE: výstup nesmie vyzerať ako vygenerovaný AI. Píš ako skutočný senior konzultant — konkrétne čísla, špecifické pozorovania, nie všeobecné rady. Vyhni sa frázam ako "v dnešnej rýchlo sa meniacej digitálnej krajine", "leveraging synergies", "best practices", "kľúčové aktíva". Krátke vety, konkrétne príklady, taktické postupy.

Output JSON presne podľa system promptu. Premysli si stratégiu HĹBAVO pred vygenerovaním — extended thinking je zapnuté, využij to.`
}

declare const EdgeRuntime: { waitUntil: (promise: Promise<any>) => void } | undefined

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
    const { leadId, model = DEFAULT_MODEL, customNotes = '', section } = body
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

    // ─── SECTION MODE — sync, <30s typicky, vráti partial JSON ────────────
    if (section) {
      if (!SECTION_DEFS[section]) {
        return new Response(JSON.stringify({
          error: `Neznáma sekcia: ${section}. Dostupné: ${Object.keys(SECTION_DEFS).join(', ')}`
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      console.log(`[premium] Section mode: ${section}`)
      const result = await generateSection(apiKey, supabase, lead, model, customNotes, section)
      if ('error' in result) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      // Merge partial do existing premium_analysis v DB
      const merged = { ...(lead.premium_analysis || {}), ...result.partial }
      const generatedAt = new Date().toISOString()
      await supabase.from('leads').update({
        premium_analysis: merged,
        premium_analysis_generated_at: generatedAt,
        premium_analysis_model: model,
        premium_analysis_status: 'done',
        deep_proposal: merged,
        deep_proposal_generated_at: generatedAt,
        deep_proposal_model: model,
      }).eq('id', leadId)
      return new Response(JSON.stringify({
        status: 'section_done',
        section,
        partial: result.partial,
        merged,
        model,
        generated_at: generatedAt,
        usage: result.usage,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    // ─── END SECTION MODE ─────────────────────────────────────────────────

    // Idempotent guard: ak status už je 'generating' a začalo < 6 min,
    // vrátime 409 namiesto spustenia ďalšieho behu paralelne (chráni pred
    // dvojkliku alebo accidental retry).
    if (lead.premium_analysis_status === 'generating' && lead.premium_analysis_started_at) {
      const startedMs = new Date(lead.premium_analysis_started_at).getTime()
      const ageMs = Date.now() - startedMs
      if (ageMs < 6 * 60 * 1000) {
        return new Response(JSON.stringify({
          error: `Generácia už beží (${Math.round(ageMs / 1000)}s). Čakaj na dokončenie alebo skús o pár minút.`,
          status: 'already_running',
          started_at: lead.premium_analysis_started_at,
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      // ageMs >= 6 min → považujeme za zaseknutú/zlyhalú, môžeme spustiť novú
      console.log(`[premium] Previous run stuck (${ageMs}ms old), restarting`)
    }

    // Test mode — vráti mock premium_analysis bez Anthropic call (žiadny kredit).
    // Aktivácia cez { testMode: true } v request body.
    if (body.testMode) {
      console.log(`[premium] TEST MODE — vraciam mock data, žiadny Anthropic call`)
      const mockPremium = {
        company: {
          name: lead.company_name || 'Test Company',
          domain: lead.domain || 'test.sk',
          industry: lead.industry || 'IT služby',
          city: lead.city || 'Bratislava',
          services: ['Testovacia služba 1', 'Testovacia služba 2', 'Testovacia služba 3'],
          idealCustomer: 'Mock ICP popis pre testovanie UI render flow bez Anthropic kreditu.'
        },
        executive_summary: 'TEST MODE — toto je mock executive summary pre testovanie HTML proposal template renderu. Žiadny Anthropic call sa neuskutočnil, žiadny kredit nebol minutý. Slúži na overenie že buildProposalHTML + adapter správne mapuje schema.',
        ourFindings: {
          strengths: [{ title: 'Mock silná stránka', description: 'Test description' }],
          opportunities: [{ title: 'Mock príležitosť', description: 'Test description' }]
        },
        swot: {
          strengths: ['Test S1', 'Test S2'],
          weaknesses: ['Test W1'],
          opportunities: ['Test O1', 'Test O2'],
          threats: ['Test T1']
        },
        keywords: {
          primary: [{ keyword: 'test keyword 1', search_volume: 1200, cpc_eur: 0.45, intent: 'buy', priority: 'high' }],
          secondary: [{ keyword: 'test keyword 2', search_volume: 300, cpc_eur: 0.30, intent: 'info' }],
          longTail: [{ keyword: 'test long tail', search_volume: 50, cpc_eur: 0.18 }]
        },
        strategy: {
          overview: 'Test stratégia overview',
          channels: [{ name: 'Google Ads — Search', monthly_budget_eur: 800, rationale: 'Test rationale', expected_kpi: '20 leadov/mes' }],
          creativeApproach: 'Test creative approach'
        },
        proposedCampaigns: {
          google: { searchCampaign: { name: 'Test Search', monthly_budget_eur: 400, objective: 'Test', adGroups: [{ name: 'AG 1', keywords: ['kw1', 'kw2'], adCopy: { headlines: ['H1', 'H2'], descriptions: ['D1', 'D2'] } }] } },
          meta: { campaign: { name: 'Test Meta', monthly_budget_eur: 300, adSets: [{ name: 'AS 1', adCopy: { primaryText: 'Test text', headline: 'Test', cta: 'Zistiť viac' } }] } }
        },
        budget: {
          summary: 'Test budget summary',
          monthly_total_eur: 1500,
          recommendations: {
            conservative: { totalBudget: 1000, leads: 15, description: 'test' },
            moderate: { totalBudget: 1500, leads: 30, description: 'test' },
            aggressive: { totalBudget: 2500, leads: 60, description: 'test' }
          },
          avgCpc: 0.50,
          six_month_projection_eur: 9000
        },
        roi: {
          explanation: 'Test ROI explanation',
          month_1: { spend_eur: 1500, leads: 10, cpl_eur: 150, revenue_eur: 3000, roi_pct: 100 },
          month_3: { spend_eur: 1500, leads: 30, cpl_eur: 50, revenue_eur: 9000, roi_pct: 500 },
          month_6: { spend_eur: 2000, leads: 60, cpl_eur: 33, revenue_eur: 18000, roi_pct: 800 }
        },
        next_steps: ['Test krok 1', 'Test krok 2'],
        unique_insight: 'TEST MODE — toto je mock unique insight.'
      }
      const generatedAt = new Date().toISOString()
      await supabase.from('leads').update({
        premium_analysis: mockPremium,
        premium_analysis_generated_at: generatedAt,
        premium_analysis_model: 'TEST_MODE',
        premium_analysis_status: 'done',
        deep_proposal: mockPremium,
        deep_proposal_generated_at: generatedAt,
        deep_proposal_model: 'TEST_MODE',
      }).eq('id', leadId)
      return new Response(JSON.stringify({
        status: 'started',
        leadId,
        model: 'TEST_MODE',
        message: 'Test mode — mock data uložené do DB, žiadny kredit',
      }), {
        status: 202,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Spusti background worker — vráti 202 do 1s, generácia beží na pozadí
    // do 6.6 minút (Supabase Edge background limit).
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(runPremiumGeneration(apiKey, supabase, lead, model, customNotes))
    } else {
      // Fallback ak EdgeRuntime nie je dostupný (local dev)
      runPremiumGeneration(apiKey, supabase, lead, model, customNotes).catch(e =>
        console.error('Background fallback error:', e)
      )
    }

    return new Response(JSON.stringify({
      status: 'started',
      leadId,
      model,
      message: 'Generácia spustená na pozadí — výsledok sa zobrazí cez Supabase realtime alebo opätovné načítanie',
    }), {
      status: 202,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[premium] Handler error:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Neočakávaná chyba' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

