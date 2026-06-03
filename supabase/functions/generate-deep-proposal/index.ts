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

const DEFAULT_MODEL = 'claude-sonnet-4-6'

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
- Toto má prednosť pred tvojím vlastným odhadom z body textu — HTML scrape vidí veci ktoré v text body nie sú (footer ikony, JS skripty).

KRITICKÉ — POUŽI INTERNÉ DÁTA Z AUDITU EXPLICITNE V TEXTE:
Ak v contexte vidíš blok "INTERNÉ DÁTA Z AUDITU", citujte konkrétne čísla a fakty priamo v textoch ako vaše vlastné zistenia. NIKDY nespomeňte zdroj (Marketing Miner / MM / nástroj) — píš ako agentúra ktorá tieto dáta sama analyzovala.

1. ourFindings.opportunities (3-5 položiek) — aspoň 2 musia citovať konkrétne číslo:
   - "Z 6 kľúčových strán Google neindexuje ani jednu — okamžitý SEO blocker, ktorý znemožňuje akýkoľvek organic ranking."
   - "Vaše top KW pokrývajú 12 800 hľadaní mesačne, ale aktuálne v top 10 nemáte ani jedno — odhadom 280-400 leadov tečie ku konkurencii."
   - "Žiadna stránka nemá vyplnenú meta description, čo znižuje CTR v SERPe o 15-25 %."

2. swot.weaknesses (2-4) — aspoň 1 konkrétne číslo:
   - "Žiadna z analyzovaných stránok nemá meta description ani schema markup."
   - "Pre 'vstavané skrine Bratislava' (180 hľadaní/mes, CPC 0,64 €) ste na pozícii 21 = 0 organic návštev."

3. swot.threats (2-4) — aspoň 1 musí menovať konkrétneho konkurenta ako pozorovanie agentúry:
   - "Mojaskrina.sk agresívne inzeruje na vaše top KW (zachytených 8 reklamných variánt) — bez aktívnej PPC tieto leady idú im."
   - "V organickom SERPe pozície 1-3 držia vstavaneskrine.com a rolkom.sk — silne usadená SEO konkurencia."

4. onlinePresence.seo.notes — konkrétne číselne ako pozorovanie:
   "Audit ukázal 6 z 6 strán neindexovaných Googlom, priemerný title score 30/100, žiadna stránka nemá meta description."

5. company.idealCustomer — ak máš KW dáta, použij ich na pomenovanie intentu:
   "Klienti hľadajú výrazy ako 'kuchynské linky' (6 400/mes) a 'vstavané skrine' (5 600/mes) — vysoký commercial intent v rekonštrukčnej fáze."

Ak dáta nie sú v contexte, použij realistic estimate pre SR a v ourFindings spomeň "Hlbší audit odhalí presné metriky." (NIKDY menom konkrétny nástroj).`,

  keywords: `Si PPC stratég. Vygeneruj sekciu "KĽÚČOVÉ SLOVÁ" pre proposal v slovenčine. NIKDY nespomeň zdroj dát menom (Marketing Miner, MM, nástroj XY).

KRITICKÉ PRAVIDLO:
Ak v contexte je "keyword_volumes" s poľom "keywords[]", MUSÍŠ POUŽIŤ EXAKTNE TIETO ČÍSLA — search_volume, cpc_eur, peak_month, yoy_change_pct. NESMIEŠ vymýšľať vlastné odhady ak máš dáta. Tieto čísla sa renderujú aj ako tabuľka v proposale, takže každé musí byť presné.

Postup:
1. Vezmi všetky keywords[] z contextu.
2. Rozdeľ ich do primary/secondary/longTail podľa search_volume:
   - primary: >= 500 (top objem + obchodný intent)
   - secondary: 100-499 (mid-tail, dobrý ROI)
   - longTail: < 100 (špecifické, vysoký intent)
3. Pre KAŽDÝ KW pridaj:
   - intent: "buy" / "info" / "brand"
   - priority: "high" / "medium" / "low"
   - current_ranking: aktuálna pozícia z positions dát (ak existuje)
4. Sezónnosť (z peak_month, volatility_pct, yoy_change_pct):
   "Peak v júli, ročný pokles -17 % — trh sa mierne zmenšuje, treba bojovať agresívnejšie a skoro."

Bez dát: realistic estimate pre SR (mestá 5-50K: 50-500 hľadaní/mes, CPC 0.20-2.50 €), označ "estimated": true.

Vráť VÝLUČNE JSON:
{
  "keywords": {
    "primary":   [{ "keyword": "...", "search_volume": 1200, "cpc_eur": 0.45, "intent": "buy|info|brand", "priority": "high", "current_ranking": "21" | null, "peak_month": "July" | null, "estimated": false }],
    "secondary": [{ "keyword": "...", "search_volume": 300,  "cpc_eur": 0.30, "intent": "info", "estimated": false }],
    "longTail":  [{ "keyword": "...", "search_volume": 50,   "cpc_eur": 0.18, "estimated": false }],
    "totals": { "total_volume_monthly": 12000, "avg_cpc_eur": 0.46, "primary_count": 6 },
    "seasonality_summary": "1-2 vety o sezónnosti — kedy zvýšiť budget, kedy znížiť. Použi peak_month."
  }
}

Minimum 6 primary, 5 secondary, 5 long-tail. Všetko špecifické k tomuto klientovi. Ak máš v dátach viac KW, použij ich VŠETKY (do max 25 total) — render template ich zobrazí ako tabuľku.`,

  strategy: `Si PPC stratég. Vygeneruj sekciu "STRATÉGIA + KANÁLY" pre proposal v slovenčine. Konkrétne čísla, konkrétne kanály, "prečo a ako" pre každý. NIKDY nespomeň zdroj dát menom (Marketing Miner, MM, atď.) — čísla prezentuj ako vlastnú analýzu.

KRITICKÉ — POUŽI INTERNÉ DÁTA Z AUDITU EXPLICITNE:
1. overview MUSÍ obsahovať aspoň 2 konkrétne čísla:
   - Total volume z keyword_volumes: "Vaše top KW pokrývajú X hľadaní mesačne na slovenskom trhu"
   - Avg CPC: "Priemerná cena za klik 0,46 € znamená že pri budgete 1 500 €/mes dostaneme ~3 260 kliknutí"
   - Top konkurenti: "V SERPe pre vaše služby dominuje vstavaneskrine.com a rolkom.sk; v PPC najagresívnejšie inzeruje mojaskrina.sk."

2. Pre KAŽDÝ kanál v channels[] musí "rationale" odkazovať na dáta:
   - Google Search: "V tomto kanáli aktuálne inzeruje mojaskrina.sk so 8 reklamnými variantmi — naša stratégia: {konkrétne taktiky proti tomu}."
   - Performance Max: zohľadni avg_cpc pri budget allocation
   - Meta: ak je v Google PPC silná konkurencia, Meta = priestor pre awareness/retargeting

3. creativeApproach — porovnaj messaging voči konkurentom (parafráza, nie verbatim copy):
   "V kategórii vstavaných skríň konkurencia tlačí cenovú vojnu — 'zľava 50 %' (mojaskrina) a 'slovenská kvalita' (inmainterior). My sa odlišíme dôrazom na rýchlosť dodania (3-4 týždne vs. 6+ mesiacov) a referencie z celého Slovenska."

Vráť VÝLUČNE JSON:
{
  "strategy": {
    "overview": "1 odstavec — high-level prístup s konkrétnymi číslami.",
    "channels": [
      {
        "name": "Google Ads — Search",
        "monthly_budget_eur": 800,
        "rationale": "3-4 vety. Musí menovať konkurenta v kanáli (ako pozorovanie agentúry) a uviesť reálne KW objemy.",
        "expected_kpi": "konkrétne číslo (napr. 35 leadov/mes pri CPL 22 €) — vychádza z reálneho CPC",
        "competitor_context": "1 veta — kto v tomto kanáli inzeruje a aké KPI očakávame voči nemu"
      }
    ],
    "creativeApproach": "2 odstavce. Prvý parafrázuje konkurenčné messaging hooky (názvy konkurentov OK), druhý ako sa odlíšime."
  }
}

Minimum 3 kanály (Google Search + Performance Max + Meta).`,

  campaigns: `Si PPC stratég. Vygeneruj sekciu "REKLAMNÉ KAMPANE" pre proposal v slovenčine. Konkrétne kampane s ad copy, headlines, descriptions, audience, landing pages. Copywriter quality, žiadne lorem ipsum. NIKDY nespomeň zdroj dát menom (Marketing Miner / MM).

KRITICKÉ — POUŽI KONKURENČNÉ DÁTA Z AUDITU:
1. Ak v contexte je ppc_competitors.ads[], analyzuj reálne reklamy konkurencie. Tvoje headlines a descriptions musia:
   - Mať INÝ uhol než dominantný konkurent (napr. ak konkurenti tlačia "zľavu 50 %", ty tlač "rýchle dodanie 3-4 týždne" alebo "10+ rokov skúseností")
   - Spomenúť konkrétny benefit ktorý v konkurenčných reklamách nevidíš
2. Pre KAŽDÚ adGroup pridaj "competitor_benchmark" (interná poznámka pre klienta, prezentovaná ako pozorovanie agentúry):
   "Konkurent mojaskrina.sk tlačí v podobnej reklame 'Bezkonkurenčná zľava 50 %'. Naša ad sa odlišuje dôrazom na {náš USP}."
3. Keywords v adGroups MUSIA byť z keyword_volumes dát (ak existujú) — žiadne vymýšľanie objemov ani fráz.
4. monthly_budget_eur pre Search kampaň: (avg_cpc_eur × cieľový počet kliknutí). Pri 0.46 € a 1 000 kliknutí = 460 €.


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

  budget: `Si PPC stratég. Vygeneruj sekciu "ROZPOČET + ROI" pre proposal v slovenčine. Matematicky sediaci budget (suma = celok). Realistic ROI assumptions. NIKDY nespomeň zdroj dát menom (Marketing Miner / MM).

KRITICKÉ — POUŽI REÁLNY AVG CPC:
Ak v contexte je keyword_volumes.avg_cpc_eur, MUSÍŠ to použiť ako "avgCpc" v output JSON. Toto určuje koľko kliknutí dostane klient za daný budget. Nepoužívaj generic 0.50 € ak máš reálne dáta.

Príklad: ak avg_cpc_eur = 0.46 €:
- "avgCpc": 0.46
- Pri moderate budgete 1 500 € → 1 500/0.46 = ~3 260 kliknutí → pri 3-5 % web-to-lead = 98-163 leadov/mes
- summary text spomenie: "Pri priemernej cene za klik 0,46 € pre vaše top kľúčové slová..."

Ak avg_cpc_eur nie je v dátach, použij 0.50 € a v summary povedz "Vychádzame z konzervatívneho odhadu 0,50 € CPC, presné CPC zistíme v prvom mesiaci kampane".


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

KRITICKÉ — POUŽI KONKRÉTNE ČÍSLA V EXECUTIVE SUMMARY (BEZ ATTRIBUTION ZDROJU):
Z dát v contexte vytiahni 3-5 konkrétnych čísel/faktov ktoré spomenieš ako vlastné zistenia agentúry. NIKDY nespomeň "Marketing Miner", "MM" ani názov nástroja — píš ako "naša analýza ukázala", "auditom sme zistili", "v SERPe sme identifikovali".

Príklady správnych viet (presne v tomto tóne):
- "Naša analýza ukázala, že vaše top kľúčové slová pokrývajú 12 800 hľadaní mesačne, ale aktuálne ste z nich v top 10 iba pre jedno — odhadom 280-400 potenciálnych dopytov mesačne tečie ku konkurencii ako mojaskrina.sk a inmainterior.sk."
- "Pri priemernej cene za klik 0,46 € na vašom trhu mesačný budget 1 500 € prinesie ~3 260 kliknutí a pri konverznej miere 3 % až 98 dopytov."
- "Aktuálny SEO stav je kritický: zo 6 analyzovaných strán Google neindexuje ani jednu — preto neviete ranknúť ani na lokálne kľúčové slová."

Bez dát = generic summary. S dátami = expert summary.

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

  competitive: `Si senior PPC stratég. NIKDY nespomeň zdroj dát menom (Marketing Miner / MM / názov nástroja) — všetky pozorovania prezentuj ako vlastnú analýzu agentúry.

KRITICKÉ — POUŽI INTERNÉ DÁTA Z AUDITU AKO PRIMÁRNY ZDROJ:
1. Ak v contexte sú serp_analysis.top_competitors[] a ppc_competitors.top_competitors[], TIETO SÚ PRIMÁRNE konkurenti — nie tvoj guess z web search.
   - Vezmi UNION top 5 z oboch (deduplicate by domain)
   - Pre každého naformuluj their_strength s konkrétnym číslom:
     "Drží 5 pozícií v top 10 pre vaše kľúčové slová" alebo "V Google PPC má 8 aktívnych reklamných variánt na vaše top KW"
2. web_search použij IBA na enrichment — názov firmy (nie len doména), USP, ich slabiny. Maximálne 3 dotazy.
3. evidence_url = URL ich webu (nie tvoj search query).

Ak interné dáta neexistujú, fallback na web_search.

Search strategy (ak chýbajú dáta):
1. "<industry> Slovensko top 5"
2. "<industry> <city> konkurencia"
3. Voliteľne: prípadová štúdia / market research SK

Vráť VÝLUČNE JSON:
{
  "competitive_landscape": {
    "main_competitors": [
      {
        "name": "menovitý konkurent",
        "domain": "domena.sk",
        "their_strength": "Konkrétne číslo + kontext (2 vety): 'V SERPe drží 5 pozícií v top 10 pre vaše top kľúčové slová.' + 'V Google PPC inzeruje s 8 reklamnými variantmi.'",
        "our_advantage": "1-2 vety prečo my (kontrast s ich slabinou)",
        "evidence_url": "https://..."
      }
    ],
    "positioning": "1-2 vety ako sa odlíšime — konkrétny SERP feature alebo medzera v PPC trhu."
  },
  "research_sources": [{ "url": "...", "summary": "1 veta čo sme z neho zistili" }]
}

Citácia URL je POVINNÁ pre každého konkurenta.`,
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

    // 4b) Escape RAW newlines/tabs/CR vnútri JSON stringov.
    // Najčastejší fail s end_turn (model dokončil ale obsah nie je validný)
    // je že do "field": "viacriadkový\ntext" napíše doslovný newline místo \n.
    // Iterátor: prejdem znak po znaku, sledujem či sme v stringu, a každý
    // raw \n / \r / \t v stringu nahradím escape sekvenciou.
    {
      let inStr = false, esc = false
      let out = ''
      for (let i = 0; i < candidate.length; i++) {
        const ch = candidate[i]
        if (esc) { out += ch; esc = false; continue }
        if (ch === '\\') { out += ch; esc = true; continue }
        if (ch === '"') { inStr = !inStr; out += ch; continue }
        if (inStr) {
          if (ch === '\n') { out += '\\n'; continue }
          if (ch === '\r') { out += '\\r'; continue }
          if (ch === '\t') { out += '\\t'; continue }
        }
        out += ch
      }
      try { const parsed = JSON.parse(out); candidate = out; return parsed } catch { candidate = out }
    }

    // 4c) Unescaped doubles quotes vnútri stringu — najtažšie. Skúsime
    // heuristiku: ak quotes po sebe nasledujú bez čiarky/dvojbodky, sú raw.
    // Toto je risk repair — beží len ak predošlé fail-ly.
    try {
      const fixed = candidate.replace(/(?<=[a-záčďéíľĺňóôŕšťúýžA-Z])"(?=[a-záčďéíľĺňóôŕšťúýž])/g, '\\"')
      const parsed = JSON.parse(fixed)
      candidate = fixed
      return parsed
    } catch {}

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
    // Truncated mid-string → odsekni od posledného open quote
    if (inString) {
      const lastQuote = repaired.lastIndexOf('"')
      if (lastQuote > 0) repaired = repaired.slice(0, lastQuote)
    }
    // Po cutnutí stringu môžeme mať dangling property bez value (napr.
    // `"key":` alebo `"key": "...",`). Odsekni neukončenú property až po
    // posledný validný `,` alebo `{`/`[` na konci.
    // Príklady ktoré opraví:
    //   `..."rationale": "abc def` → `...` (rationale property bez value zmaž)
    //   `..."name": "X",` → `..."name": "X"` (trailing comma)
    //   `..."key":` → `...` (key bez value)
    for (let i = 0; i < 5; i++) {
      const before = repaired
      repaired = repaired
        .replace(/,\s*$/, '')                       // trailing comma
        .replace(/\s*"[^"]*"\s*:\s*$/, '')          // dangling key bez value
        .replace(/\s*"[^"]*"\s*:\s*[\d.eE+-]+\s*,?\s*$/, '') // možný čistý truncate
        .replace(/,\s*"[^"]*"\s*:\s*\{[^{}]*$/, '') // dangling object property
      if (before === repaired) break
    }
    // Pridaj chýbajúce ] a }
    while (openSquare > closeSquare) { repaired += ']'; closeSquare++ }
    while (opens > closes)           { repaired += '}'; closes++ }
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
    // max_tokens — strategy/keywords/audit verbose Slovak responses ľahko
    // prekročia 6K → truncated JSON. 8K je bezpečné pre väčšinu sekcií.
    // campaigns má najviac obsahu (ad copy + 5+ kampaní) → 12K.
    max_tokens: sectionKey === 'campaigns' ? 12000 : 8000,
    system: SECTION_PROMPTS[def.promptKey],
    messages: [{ role: 'user', content: context }],
  }
  if (def.useWebSearch) {
    apiBody.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]
    apiBody.max_tokens = 10000
  }

  // Retry s exponenciálnym backoffom pri 429 (rate limit) — Anthropic vracia
  // retry-after header alebo 60s default. Max 2 retries → user nemusí čakať
  // ručne a klikať znova.
  //
  // Per-section timeout — campaigns produkuje ~12K tokenov verbose Slovak
  // (ad copy + descriptions + audience), competitive používa web_search (3
  // dotazy × ~30s). Default 130s ne stačí.
  const sectionTimeout = sectionKey === 'campaigns' ? 240000
    : sectionKey === 'competitive' ? 200000
    : sectionKey === 'strategy' || sectionKey === 'summary' ? 180000
    : 130000
  const callAnthropic = async (attempt: number): Promise<Response | { error: string }> => {
    const abort = new AbortController()
    const timeout = setTimeout(() => abort.abort(), sectionTimeout)
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: abort.signal,
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(apiBody),
      })
      clearTimeout(timeout)
      return r
    } catch (e) {
      clearTimeout(timeout)
      return { error: 'Anthropic timeout/network: ' + (e instanceof Error ? e.message : String(e)) }
    }
  }

  let resp: Response | undefined
  let lastErr = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await callAnthropic(attempt)
    if ('error' in r) return { error: r.error }
    if (r.status !== 429) { resp = r; break }
    // 429 — počkaj retry-after sekúnd, max 45s (Edge fn time budget)
    const retryAfter = parseInt(r.headers.get('retry-after') || '0', 10)
    const waitSec = Math.min(Math.max(retryAfter, [10, 25, 40][attempt]), 45)
    console.warn(`[section ${sectionKey}] 429 rate limit, retry #${attempt + 1} after ${waitSec}s`)
    lastErr = `Anthropic rate limit (429) — pokus ${attempt + 1}/3`
    await new Promise(res => setTimeout(res, waitSec * 1000))
  }
  if (!resp) return { error: lastErr || 'Anthropic 429 rate limit — skús znova o minútu' }

  const json = await resp.json()
  if (json.error) return { error: json.error.message || 'Anthropic error' }

  const text = (json.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text || '').join('').trim()
  // Strip ``` wrappers — model niekedy obalí JSON markdown blokom napriek
  // promptu. Robíme to aj middle-of-string lebo `^...$` regex zlyhá ak
  // pred/po blocku je text.
  const cleaned = text
    .replace(/^[\s\S]*?```(?:json)?\s*/i, (m) => m.includes('```') ? '' : m)
    .replace(/\s*```[\s\S]*$/i, '')
    .trim()
  const partial = tryParseJson(cleaned)
  if (!partial) {
    const stopReason = json.stop_reason || 'unknown'
    console.error(`[section ${sectionKey}] Cannot parse JSON. stop_reason=${stopReason}, len=${cleaned.length}`)
    console.error(`[section ${sectionKey}] First 500 chars:`, cleaned.slice(0, 500))
    console.error(`[section ${sectionKey}] Last 500 chars:`, cleaned.slice(-500))
    // stop_reason='max_tokens' znamená model bol odseknutý → odporuč user
    // konkrétne — nie generický "skús regen"
    if (stopReason === 'max_tokens') {
      return { error: `Sekcia ${sectionKey} bola odseknutá (model dosiahol token limit). Skús regen — typicky druhý pokus vyjde kratšia odpoveď. Ak persistuje, kontaktuj support.` }
    }
    return { error: `JSON parse zlyhal pre sekciu ${sectionKey} (stop_reason=${stopReason}). Skús regen.` }
  }

  return { partial, usage: json.usage }
}

function buildSectionContext(lead: any, scrape: string, customNotes: string, sectionKey: string, label: string): string {
  // Per-section context — len to čo daná sekcia naozaj potrebuje.
  // Predtým každá sekcia posielala ~10K+ tokenov (lead.analysis 6K + marketing_data
  // 3K + scrape ~15K + premium_analysis 5K) → tier rate-limit 30K/min sa minul
  // pri 2-3 regenerát. Tu trimujeme agresívne podľa sectionKey.

  // Trim lead.analysis na to čo je naozaj užitočné (vyhoď velké poľa keywords/budget
  // pre coherence sekcie, ale nechaj company info a online presence)
  const slimAnalysis = (() => {
    const a = lead.analysis || {}
    const slim: any = {
      company: a.company,
      onlinePresence: a.onlinePresence,
      executive_summary: a.executive_summary,
      unique_insight: a.unique_insight,
    }
    if (sectionKey === 'keywords' || sectionKey === 'strategy' || sectionKey === 'campaigns') {
      slim.target_audience = a.target_audience
      slim.industry = a.industry
    }
    if (sectionKey === 'audit' || sectionKey === 'analysis') {
      slim.swot = a.swot
      slim.ourFindings = a.ourFindings
    }
    return JSON.stringify(slim, null, 2).slice(0, 3000)
  })()

  // Marketing data — preferuj štruktúrované MM reporty (uploadnuté cez admin
  // ako XLSX) pred raw marketing_data dumpom. Reporty obsahujú už spracované
  // pole: contact_finder.social, keyword_volumes.keywords, ppc_competitors.ads,
  // serp_analysis.top_competitors atď. AI tak dostane reálne čísla a názvy
  // konkurentov, nie hádanie zo scrape textu.
  const mm = lead.marketing_data || {}
  const reports = mm.mm_reports || {}

  // Per-section relevance — ktoré MM reporty má daná sekcia vidieť
  const mmRelevance: Record<string, string[]> = {
    analysis:   ['contact_finder', 'web_category', 'tech_detection', 'seo_audit', 'positions'],
    audit:      ['contact_finder', 'web_category', 'tech_detection', 'seo_audit', 'broken_links', 'structured_data', 'validity', 'status_codes', 'positions'],
    keywords:   ['keyword_volumes', 'keyword_suggest', 'serp_analysis', 'positions'],
    strategy:   ['keyword_volumes', 'ppc_competitors', 'serp_analysis', 'web_category', 'positions'],
    campaigns:  ['ppc_competitors', 'keyword_volumes', 'serp_analysis', 'positions'],
    budget:     ['keyword_volumes', 'ppc_competitors', 'positions'],
    competitive: ['ppc_competitors', 'serp_analysis', 'positions'],
    summary:    ['web_category', 'seo_audit', 'positions'],
  }
  // Trimovanie heavy polí — pre tokeny. ppc_competitors.ads môže mať 50+
  // záznamov × 200 chars = 10K char dump. Nechávame iba top 15 ads a stručné
  // top_competitors. Rovnako serp_analysis.results.
  const trimMMReport = (key: string, r: any): any => {
    if (!r) return r
    const t: any = { ...r }
    if (key === 'ppc_competitors' && Array.isArray(t.ads)) {
      t.ads = t.ads.slice(0, 15).map((a: any) => ({
        keyword: a.keyword, competitor_domain: a.competitor_domain,
        ad_title: a.ad_title, ad_description: a.ad_description, ad_rank: a.ad_rank,
      }))
    }
    if (key === 'serp_analysis' && Array.isArray(t.results)) {
      // Iba organické výsledky top 10 + top features
      t.results = t.results.filter((x: any) => x.type === 'Search Results' && x.position && x.position <= 10).slice(0, 30).map((x: any) => ({
        keyword: x.keyword, position: x.position, domain: x.domain, title: x.title,
      }))
    }
    if (key === 'positions' && Array.isArray(t.positions)) {
      t.positions = t.positions.slice(0, 25)
    }
    if (key === 'seo_audit' && Array.isArray(t.pages)) {
      // Stačí 1 sample page + agregát issues
      t.sample_pages = t.pages.slice(0, 3).map((p: any) => ({
        url: p.url, title: p.title, meta_description: p.meta_description,
        indexability: p.indexability, indexed_by_google: p.indexed_by_google,
      }))
      delete t.pages
    }
    if (key === 'broken_links' && Array.isArray(t.broken_links)) {
      t.broken_links = t.broken_links.slice(0, 10)
    }
    return t
  }

  const relevantKeys = mmRelevance[sectionKey] || []
  const slimMMReports: Record<string, any> = {}
  for (const k of relevantKeys) {
    if (reports[k]) {
      // Slim — vynechaj raw rows + trimuj heavy arrays
      const { rows, ...rest } = reports[k]
      slimMMReports[k] = trimMMReport(k, rest)
    }
  }
  const mmReportsBlock = Object.keys(slimMMReports).length
    ? `INTERNÉ DÁTA Z AUDITU (autoritatívne — MUSÍŠ čísla a fakty citovať v texte ako vlastné zistenia agentúry; NIKDY nespomeň zdroj dát menom):\n${JSON.stringify(slimMMReports, null, 2).slice(0, 6000)}\n`
    : ''

  // Legacy marketing_data — len pre sekcie ktoré nemajú parsované MM reporty
  const needsMM = ['keywords', 'strategy', 'campaigns', 'budget'].includes(sectionKey)
  const legacyMMBlock = needsMM && !mmReportsBlock && (mm.organicTraffic || mm.keywords)
    ? `LEGACY AUTO-SCRAPED DATA:\n${JSON.stringify({
        organicTraffic: mm.organicTraffic,
        organicKeywords: mm.organicKeywords,
        backlinks: mm.backlinks,
      }, null, 2).slice(0, 1000)}\n`
    : ''
  const mmBlock = mmReportsBlock + legacyMMBlock

  // Existujúce sekcie pre coherence — iba reference k tým ktoré majú vplyv na túto sekciu.
  // Predtým dumpovali celé premium_analysis (5K), teraz iba relevantné kľúče.
  const coherenceMap: Record<string, string[]> = {
    audit: ['company'],
    keywords: ['company', 'target_audience'],
    strategy: ['company', 'target_audience', 'keywords'],
    campaigns: ['company', 'target_audience', 'keywords', 'strategy'],
    budget: ['keywords', 'strategy', 'campaigns'],
    summary: ['company', 'strategy', 'budget', 'roi'],
    competitive: ['company'],
    analysis: [],
  }
  const coherenceKeys = coherenceMap[sectionKey] || []
  const coherence: Record<string, any> = {}
  for (const k of coherenceKeys) {
    if (lead.premium_analysis?.[k]) coherence[k] = lead.premium_analysis[k]
  }
  const coherenceBlock = Object.keys(coherence).length
    ? `EXISTUJÚCE SEKCIE (referenčné — zachovaj koherenciu):\n${JSON.stringify(coherence, null, 2).slice(0, 2500)}\n`
    : ''

  // Scrape — competitive nepotrebuje, audit/campaigns/strategy plný, ostatné skrátený
  const scrapeBlock = scrape
    ? `WEB SCRAPE:\n${
        ['analysis', 'audit', 'strategy', 'campaigns'].includes(sectionKey)
          ? scrape.slice(0, 8000)
          : scrape.slice(0, 4000)
      }\n`
    : ''

  return `LEAD:
Firma: ${lead.company_name || ''}
Doména: ${lead.domain || ''}
Odvetvie: ${lead.industry || lead.analysis?.company?.industry || ''}
Lokalita: ${lead.city || lead.analysis?.company?.city || ''}

PÔVODNÁ ANALÝZA (slim):
${slimAnalysis}

${mmBlock}${scrapeBlock}${coherenceBlock}${customNotes ? `CUSTOM POŽIADAVKY: ${customNotes}\n` : ''}

ÚLOHA: Vygeneruj VÝLUČNE sekciu "${label}" pre marketingový proposal.

OUTPUT FORMAT — STRIKT:
- Iba čistý JSON. Žiadny text pred ani po. Žiadne \`\`\` markdown wrappery.
- Žiadne trailing commas pred } alebo ].
- Stringy MUSIA byť na jednom riadku — newlines vnútri string hodnôt nahraď "\\n" alebo " — " (pomlčkou). Žiadny literálny newline v string value.
- Citácie a apostrofy vnútri stringu escapuj cez \\" a \\'.
- Slovenské diakritické znaky OK (žltý, č, š, ť, ž — UTF-8).
- Žiadne komentáre (//) v JSON.
- Začiatok output musí byť '{', koniec '}'.`
}


const SYSTEM_PROMPT = `Si senior PPC stratég v slovenskej digitálnej marketingovej agentúre s 10+ rokmi skúseností (Google Ads, Meta Ads, LinkedIn, performance marketing).

Tvoja úloha: pre konkrétneho leada vygenerovať **podrobný, profesionálny, unikátny premium marketingový návrh**, ktorý bude pitch dokument pripravený na podpis kontraktu. Klient po prečítaní by mal hneď chcieť spolupracovať.

POVINNÉ PRAVIDLÁ:

1. **Slovenčina vždy.** Profesionálny ale ľudský tón. ZÁKAZ floskúl typu "synergie", "best practices", "leveraging", "kľúčové aktíva". Konkrétne čísla a kroky.

2. **ZÁKAZ EMOJI.** Žiadne ✅ 🚀 🎯 💡 📊 atď. nikde v texte. Používame iba slová.

3. **Extrémna personalizácia.** Použi názov firmy, doménu, mestá, biz model, konkrétne produkty/služby. Ak je to e-shop záhradnej techniky → spomeň konkrétne produktové kategórie. Ak je B2B služba → konkrétny ICP s rolami. Nikdy "vaša firma" generic.

4. **Reálne čísla — POVINNÉ ak v contexte existujú dáta.** Ak v contexte je blok "INTERNÉ DÁTA Z AUDITU", všetky search volumes, CPCs, pozície, mená konkurentov MUSÍŠ brať odtiaľ — NIKDY vlastné odhady ak máš reálne dáta. Inak realistic estimate pre SR (mestá 5-50K obyvateľov: 50-500 hľadaní/mes, CPC 0.20-2.50 €). Budget musí sedieť matematicky (suma = celok).

**KRITICKÉ — ZÁKAZ ZDROJU V TEXTE:** NIKDY v output texte nespomeň zdroj dát menom — žiadne "podľa Marketing Miner", "z MM reportov", "data_source", "podľa nášho nástroja XY". Čísla sa prezentujú ako vlastná analýza agentúry. Píš: "naša analýza ukazuje", "z dát o vyhľadávaní na slovenskom trhu", "auditom sme zistili", "v SERPe sme identifikovali" — alebo proste len fakt bez attribution ("Vaše top KW majú 12 800 hľadaní mesačne.").

4b. **Dáta v texte = expert level.** V každej sekcii cite konkrétne čísla:
- analysis: stránky neindexované, social URL, identifikované problémy
- keywords: volume + CPC + sezónnosť — ideálne v tabuľke (output template ich renderuje)
- strategy: top_competitors menovite v rationale (ako vlastné pozorovanie)
- campaigns: konkurenčné reklamy ako benchmark (parafrázuj, neopisuj)
- competitive: main_competitors[] s konkrétnymi metrikami (počet ich top10 pozícií, ad coverage)
- summary: agregátne čísla bez attribution zdroju

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
        max_tokens: 16000,
        // web_search vypnutý — Anthropic web_search 2 uses zaberie 60-120s
        // čo prekračuje Supabase Edge background task limit (na tomto
        // projekte cca 60-90s podľa logov). Bez search Haiku/Sonnet dokončia
        // call za 20-60s — bezpečne v limite.
        // Konkurenti sa berú z MM dát (presnejšie aj tak), ak admin dodal.
        // tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
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
    console.log(`[premium-bg] Got ${text.length} chars + ${(claudeJson.content || []).length} content blocks · stop_reason=${claudeJson.stop_reason}`)

    // Robustný parse — rovnaký repair pipeline ako v section mode (smart
    // quotes, trailing commas, raw newlines v stringoch, unescaped quotes,
    // truncated repair). Predtým full mode používal len basic JSON.parse →
    // veľa zbytočných fail-ov pri verbose Slovak output.
    const cleaned = text
      .replace(/^[\s\S]*?```(?:json)?\s*/i, (m: string) => m.includes('```') ? '' : m)
      .replace(/\s*```[\s\S]*$/i, '')
      .trim()
    const premium = tryParseJson(cleaned)
    if (!premium) {
      console.error(`[premium-bg] JSON parse fail. stop_reason=${claudeJson.stop_reason}, len=${cleaned.length}`)
      console.error(`[premium-bg] First 800 chars:`, cleaned.slice(0, 800))
      console.error(`[premium-bg] Last 800 chars:`, cleaned.slice(-800))
      await supabase.from('leads').update({
        premium_analysis_status: 'error',
        premium_analysis_error: `Model nevrátil platný JSON (stop_reason=${claudeJson.stop_reason || 'unknown'}). Skús regen — typicky druhý pokus vyjde stabilný.`,
      }).eq('id', leadId)
      return
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
  // MM reporty uploadnuté cez admin (XLSX) — preferuj pred raw marketing_data dumpom
  const mm = lead.marketing_data || {}
  const reports = mm.mm_reports || {}

  // Inline trim — rovnaký ako v buildSectionContext, ale ponecháme všetky reporty (full mode)
  const trim = (key: string, r: any): any => {
    if (!r) return r
    const t: any = { ...r }
    if (key === 'ppc_competitors' && Array.isArray(t.ads)) {
      t.ads = t.ads.slice(0, 20).map((a: any) => ({
        keyword: a.keyword, competitor_domain: a.competitor_domain,
        ad_title: a.ad_title, ad_description: a.ad_description,
      }))
    }
    if (key === 'serp_analysis' && Array.isArray(t.results)) {
      t.results = t.results.filter((x: any) => x.type === 'Search Results' && x.position && x.position <= 10).slice(0, 40).map((x: any) => ({
        keyword: x.keyword, position: x.position, domain: x.domain, title: x.title,
      }))
    }
    if (key === 'positions' && Array.isArray(t.positions)) t.positions = t.positions.slice(0, 30)
    if (key === 'seo_audit' && Array.isArray(t.pages)) {
      t.sample_pages = t.pages.slice(0, 3).map((p: any) => ({
        url: p.url, title: p.title, meta_description: p.meta_description,
        indexability: p.indexability, indexed_by_google: p.indexed_by_google,
      }))
      delete t.pages
    }
    if (key === 'broken_links' && Array.isArray(t.broken_links)) t.broken_links = t.broken_links.slice(0, 15)
    return t
  }

  const slimReports: Record<string, any> = {}
  for (const [k, v] of Object.entries(reports)) {
    const { rows, ...rest } = (v as any) || {}
    slimReports[k] = trim(k, rest)
  }
  const mmReportsBlock = Object.keys(slimReports).length
    ? `INTERNÉ DÁTA Z AUDITU (autoritatívne — MUSÍŠ ich čísla a fakty citovať v texte ako vlastné zistenia agentúry; NIKDY nespomeň zdroj dát menom). V analysis spomeň seo_audit issues, v keywords použij keyword_volumes čísla, v strategy menuj top_competitors, v competitive doplň main_competitors z ppc/serp dát:\n${JSON.stringify(slimReports, null, 2).slice(0, 10000)}\n`
    : ''
  const legacyMMBlock = !mmReportsBlock && (mm.organicTraffic || mm.keywords)
    ? `MARKETING DATA (legacy auto-scraped):\n${JSON.stringify({
        organicTraffic: mm.organicTraffic, organicKeywords: mm.organicKeywords, backlinks: mm.backlinks
      }, null, 2).slice(0, 2000)}\n`
    : ''

  return `LEAD DATA:
Firma: ${lead.company_name || 'neuvedené'}
Doména: ${lead.domain || 'neuvedená'}
Email: ${lead.email || '—'}
Telefón: ${lead.phone || '—'}
Odvetvie: ${lead.industry || lead.analysis?.company?.industry || 'neuvedené'}
Mesto / lokalita: ${lead.city || lead.analysis?.company?.city || lead.analysis?.company?.location || 'neuvedené'}

PÔVODNÁ AI ANALÝZA (od analyze-lead Edge function):
${JSON.stringify(lead.analysis || {}, null, 2).slice(0, 10000)}

${mmReportsBlock}${legacyMMBlock}DEEP WEB SCRAPE (homepage + 3 relevantné podstránky klienta):
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

Output JSON presne podľa system promptu. Premysli si stratégiu HĹBAVO pred vygenerovaním — extended thinking je zapnuté, využij to.

OUTPUT FORMAT — STRIKT:
- Iba čistý JSON. Žiadny text pred ani po. Žiadne \`\`\` markdown wrappery.
- Žiadne trailing commas pred } alebo ].
- Stringy MUSIA byť na jednom riadku — newlines vnútri string hodnôt nahraď "\\n" alebo " — " (pomlčkou). Žiadny literálny newline v string value.
- Citácie a apostrofy vnútri stringu escapuj cez \\" a \\'.
- Slovenské diakritické znaky OK (žltý, č, š, ť, ž — UTF-8).
- Žiadne komentáre (//) v JSON.
- Začiatok output musí byť '{', koniec '}'.
- Ak miestami zostane už málo tokenov a hrozí truncation, radšej skráť obsah individuálnych sekcií než nedokončiť JSON.`
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

