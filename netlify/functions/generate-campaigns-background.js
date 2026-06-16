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
const crypto = require('crypto');

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

async function runGeneration({ project_id, onboarding_id, platforms, extra_instruction }) {
  console.log('[generate-campaigns] start project', project_id, extra_instruction ? '(s pripomienkami)' : '');

  // 1. Load onboarding
  const { data: onboardingRow, error: oErr } = await supabase
    .from('onboarding_responses').select('*').eq('id', onboarding_id).single();
  if (oErr || !onboardingRow) throw new Error('Onboarding not found: ' + (oErr?.message || 'no row'));

  // Onboarding sa ukladá ako celý formData do JSONB stĺpca `data`
  // (modules/onboarding/onboarding.js: row.data = cleanData).
  // Predchádzajúce verzie tejto funkcie hľadali polia priamo na rootu
  // (onboarding.company_name), čo bolo undefined → Claude dostal prázdny
  // prompt a vrátil placeholder/generický template.
  // Fallback na root rieši aj prípadné staré onboardingy s flat schémou.
  const onboarding = (onboardingRow.data && typeof onboardingRow.data === 'object')
    ? onboardingRow.data
    : onboardingRow;

  // Načítaj brand assets z klienta (per-klient, doplnok ku onboarding)
  let brandAssets = { colors: [], font: null, logo_url: null, voice_notes: null };
  if (onboardingRow.client_id) {
    try {
      const { data: clientRow } = await supabase
        .from('clients')
        .select('brand_colors, brand_font, brand_logo_url, brand_voice_notes')
        .eq('id', onboardingRow.client_id)
        .maybeSingle();
      if (clientRow) {
        brandAssets = {
          colors: Array.isArray(clientRow.brand_colors) ? clientRow.brand_colors : [],
          font: clientRow.brand_font || null,
          logo_url: clientRow.brand_logo_url || null,
          voice_notes: clientRow.brand_voice_notes || null,
        };
      }
    } catch (e) {
      console.warn('[brand] load skipped (migrácia 036 chýba?):', e.message);
    }
  }
  console.log('[brand assets]', {
    colors_count: brandAssets.colors.length,
    has_font: !!brandAssets.font,
    has_logo: !!brandAssets.logo_url,
    has_voice_notes: !!brandAssets.voice_notes,
  });

  console.log('[generate-campaigns] onboarding loaded:', {
    project_id, onboarding_id,
    company: onboarding.company_name,
    industry: onboarding.company_industry,
    has_usp: !!(onboarding.unique_selling_points?.length),
    has_geo: !!(onboarding.target_audience?.geographic?.regions?.length),
    has_products: !!(onboarding.products_services?.length),
    raw_keys: Object.keys(onboarding).slice(0, 30),
  });

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

  // Helper — formátuje pole/object/string konzistentne, dáva '—' pre prázdne
  const fmt = (v) => {
    if (v === null || v === undefined || v === '' || v === '-') return '—';
    if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  // Geografia — onboarding ju má v target_audience.geographic { regions, countries }
  const geo = onboarding.target_audience?.geographic || {};
  const regions = Array.isArray(geo.regions) ? geo.regions : [];
  const countries = Array.isArray(geo.countries) ? geo.countries : ['Slovensko'];
  const geoTargeting = regions.length
    ? `${regions.join(', ')} (${countries.join(', ')})`
    : countries.join(', ');

  // Produkty — formát: pole objektov { name, description, price_range }
  const productsList = (onboarding.products_services || [])
    .map(p => {
      if (typeof p === 'string') return `- ${p}`;
      const name = p?.name || 'Neuvedené';
      const desc = p?.description ? ` — ${p.description}` : '';
      const price = p?.price_range ? ` (${p.price_range})` : '';
      return `- ${name}${desc}${price}`;
    }).join('\n') || '—';

  // Sezónnosť — kritické pre HVAC a podobné biznisy
  const seasonalNote = onboarding.seasonal_business
    ? `SEZÓNNY BIZNIS — peak: ${fmt(onboarding.peak_seasons)}. NÁVRH MUSÍ obsahovať sezónne kampane (rozdelenie podľa ročných období) alebo aspoň upozorniť na potrebu eskalovať budget v špičkách.`
    : 'Celoročný biznis';

  // Pripomienky admina pri pregenerovaní (revízia) — majú NAJVYŠŠIU prioritu
  const revisionBlock = extra_instruction
    ? `\n## ⚠️ PRIPOMIENKY STRATÉGA NA PREPRACOVANIE (NAJVYŠŠIA PRIORITA)\nPredchádzajúci návrh sa prepracúva. Zapracuj DOSLOVA tieto pripomienky, majú prednosť pred všetkým ostatným:\n"${extra_instruction}"\n`
    : '';

  // ─── SPOLOČNÝ KONTEXT (rovnaký pre všetky 3 paralelné prompty) ───
  const clientContext = `## ZÁKLADNÉ INFO
- Firma: ${fmt(onboarding.company_name)}
- Web: ${fmt(onboarding.company_website)}
- Odvetvie: ${fmt(onboarding.company_industry)}
- Veľkosť: ${fmt(onboarding.company_size)} zamestnancov
- Sídlo: ${fmt(onboarding.company_location)}
- Popis: ${fmt(onboarding.company_description)}

## PRODUKTY A SLUŽBY
${productsList}

## USP (cituj DOSLOVA v ad textoch)
${fmt(onboarding.unique_selling_points)}

## KONKURENČNÉ VÝHODY
${fmt(onboarding.competitive_advantages)}

## CIEĽOVÁ SKUPINA
- B2B: ${onboarding.target_audience?.b2b ? 'áno' : 'nie'} | B2C: ${onboarding.target_audience?.b2c ? 'áno' : 'nie'}
- Vek: ${onboarding.target_audience?.demographics?.age_from || 18}-${onboarding.target_audience?.demographics?.age_to || 65}
- Pohlavie: ${onboarding.target_audience?.demographics?.gender || 'všetci'}
- GEOGRAFIA (cieľ kampane): ${geoTargeting}
- Ideálny zákazník (slová klienta): "${fmt(onboarding.ideal_customer_description)}"

## ŠPECIÁLNE POŽIADAVKY KLIENTA
${fmt(onboarding.special_requirements)}

## SEZÓNNOSŤ
${seasonalNote}

## CIELE & METRIKY
- Primárne ciele: ${fmt(onboarding.primary_goals)}
- Očakávané CPA: ${fmt(onboarding.expected_cpa)}€
- AOV: ${fmt(onboarding.average_order_value)}€
- CLV: ${fmt(onboarding.customer_lifetime_value)}€

## ROZPOČET
- Mesačný: ${monthlyBudget}€ (~${dailyBudget}€/deň)
- Predošlý: ${fmt(onboarding.previous_monthly_budget)}€

## PREDOŠLÉ SKÚSENOSTI
- Predošlá reklama: ${fmt(onboarding.previous_ad_experience)}
- Čo fungovalo: ${fmt(onboarding.what_worked)}
- Čo nefungovalo: ${fmt(onboarding.what_didnt_work)}

## BRAND
- Tón: ${fmt(onboarding.brand_tone_of_voice)}
- Štýl reklám: ${fmt(onboarding.preferred_ad_style)}
${brandAssets.colors.length > 0 ? `- BRAND FARBY (POVINNE použij v image_prompt color palette + image_text_overlay color="brand"): ${brandAssets.colors.join(', ')}` : ''}
${brandAssets.font ? `- Brand font: ${brandAssets.font}` : ''}
${brandAssets.logo_url ? `- Logo k dispozícii: ${brandAssets.logo_url} (POZNÁMKA do image_style_notes — dizajnér nechá copy_space na vloženie loga)` : ''}
${brandAssets.voice_notes ? `- Brand voice extra inštrukcie (POVINNE dodržať): ${brandAssets.voice_notes}` : ''}

## RESEARCH DÁTA (Marketing Miner + SERP)
Top kľúčové slová:
${keywordData.slice(0, 25).map(k => `- "${k.keyword}" (${k.search_volume}/mes, CPC ${(k.cpc || 0).toFixed(2)}€${k.competition ? `, konk. ${k.competition}` : ''})`).join('\n') || '(nedostupné)'}

Konkurencia:
${allCompetitors.map(c => `- ${c.domain}${c.is_paid ? ' [platí reklamy]' : ''}${c.titles?.[0] ? ` — "${c.titles[0]}"` : ''}`).join('\n') || '(nedostupná)'}

Ad texty konkurentov (inšpirácia, NEkopírovať):
${paidAdsInsights.slice(0, 8).map(a => `- "${a.title}" — ${(a.snippet || '').substring(0, 80)}`).join('\n') || '(žiadne)'}
${revisionBlock}`;

  // ─── PROMPT 1: STRATÉGIA + ANALÝZA + TIMELINE ───
  const strategyPrompt = `Si senior PPC stratég pre slovenskú marketingovú agentúru Adlify. Pripravuješ STRATEGICKÝ DOKUMENT pre klienta.

ABSOLÚTNE PRAVIDLO: Píšeš ako skúsený človek, NIE AI. Klient si myslí že to píše senior stratég.

${clientContext}

## PLATFORMY V PROJEKTE: ${platforms.join(', ')}

## ÚLOHA
Vygeneruj LEN strategický dokument (kampane sa rieši paralelne v iných promptoch). Strategický text musí byť profesionálny, obsiahly, presvedčivý — klient ho vidí v portáli a v PDF.

## VÝSTUP — strict JSON, žiadny markdown, žiadny text okolo:

{
  "business_analysis": {
    "summary": "3-4 vety čo klient skutočne robí, pre koho, prečo má zmysel u neho robiť PPC. Cituj konkrétnosti z onboardingu.",
    "key_insights": [
      "3-4 konkrétne zistenia o jeho biznise — sezónnosť, lokálnosť, USP, pozícia na trhu",
      "Každý insight je 1-2 vety s konkrétnym odkazom na jeho situáciu"
    ],
    "challenges": [
      "2-3 reálne výzvy — limit budgetu, konkurencia, nepripravený tracking, regionalita",
      "Pre každú vysvetli prečo to je výzva práve u neho"
    ],
    "opportunities": [
      "2-3 príležitosti — neobsadený segment, sezónne špičky, lokálna prevaha, mix platforiem",
      "Konkrétne ako ich využijeme"
    ]
  },
  "strategy_summary": "OBSIAHLY profesionálny strategický text s VIZUÁLNOU ŠTRUKTÚROU. Použi MARKDOWN-LIKE format pre ľahké čítanie:\\n\\n## Východisková situácia\\n\\nÚvod 2-3 vety o tom kde klient teraz je, čo má (USP, cieľovka, regionalita) a čo je hlavná príležitosť na trhu. Odkaz na konkrétne dáta z onboardingu.\\n\\n## Náš strategický prístup\\n\\n2-3 vety zhrnutia prístupu, potom konkrétne body:\\n\\n- **Google Search** — krátky popis úlohy (zachytenie aktívneho dopytu na konkrétne KW)\\n- **Meta Ads** — krátky popis úlohy (budovanie povedomia, remarketing)\\n- **Sezónnosť** — ak je sezónny biznis, ako to riešime\\n- **Regionalita** — ako cielime na konkrétne regióny\\n- **USP komunikácia** — ktoré klientove USP najviac tlačíme a kde\\n\\n## Meranie a škálovanie\\n\\n2 vety o tom čo budeme merať. Potom konkrétne:\\n\\n- **Týždeň 1-2:** sledovanie základných KPI (CTR, CPC, konverzie)\\n- **Mesiac 1-3:** optimalizácia bidding, KW, ad copy podľa dát\\n- **Mesiac 3+:** škálovanie budgetu pri ROAS > X, expanzia segmentov\\n\\nPOUŽI presne tento format: ## pre nadpisy sekcií, ** ** pre tučné slová, - pre bullety, prázdny riadok medzi odsekmi. Píš sebavedomo, konkrétne, s číslami z research. ŽIADNE klišé typu 'optimalizovať pre lepšie výsledky'. NIKDY nespomínaj AI ani automatizáciu.",
  "research_insights": {
    "market_analysis": "3-4 vety o dopyte v jeho odvetví/regióne. Cituj konkrétne kľúčové slová a ich hľadanosť z MM dát.",
    "competitor_analysis": "3-4 vety čo robí konkurencia (z SERP), kde je priestor, ako sa môže klient odlíšiť",
    "keyword_strategy": "3 vety o tom aké KW témy cielime (lokálne, brand, transakčné, informačné) a prečo",
    "recommended_approach": "Odsek 4-5 viet — odporúčaný štart, kedy škálovať, na čo dať pozor, aké rozšírenia neskôr"
  },
  "budget_breakdown": {
    "total_monthly": ${monthlyBudget},
    "by_platform": [
      { "platform": "google", "monthly": 0, "percentage": 0, "reasoning": "1 veta prečo táto suma na Google" },
      { "platform": "meta", "monthly": 0, "percentage": 0, "reasoning": "1 veta prečo táto suma na Meta" }
    ],
    "reasoning": "2-3 vety celkové zdôvodnenie rozdelenia budgetu"
  },
  "expected_results": {
    "day_30": { "impressions": 0, "clicks": 0, "conversions": 0, "cpa": 0, "roas": 0, "note": "1 veta čo očakávať" },
    "day_90": { "impressions": 0, "clicks": 0, "conversions": 0, "cpa": 0, "roas": 0, "note": "1 veta" },
    "day_180": { "impressions": 0, "clicks": 0, "conversions": 0, "cpa": 0, "roas": 0, "note": "1 veta" },
    "notes": "2-3 vety — kedy sa prejavia optimalizácie, ako klient pozná že to funguje. Realistické odhady — NEvymýšľaj si čísla, vychádzaj z budgetu a očakávaného CPA."
  },
  "timeline": {
    "phases": [
      { "name": "Príprava + tracking setup", "duration_days": 7, "activities": ["3-5 konkrétnych aktivít"] },
      { "name": "Spustenie kampaní", "duration_days": 3, "activities": ["..."] },
      { "name": "Optimalizácia (1.-3. mesiac)", "duration_days": 60, "activities": ["..."] },
      { "name": "Škálovanie (od 4. mesiaca)", "duration_days": 90, "activities": ["..."] }
    ]
  },
  "next_steps": {
    "client_needs_to_provide": ["3-5 konkrétnych vecí čo klient musí dodať — prístupy, fotky, USP, atď."],
    "our_next_actions": ["3-4 čo my spravíme po jeho schválení"],
    "launch_readiness": ["checklist 3-5 bodov pred spustením"]
  }
}

PRAVIDLÁ:
- Všetko v slovenčine, vykáme klientovi
- Konkrétne čísla a fakty z onboardingu/research, NIE generické frázy
- ODPOVEĎ LEN JSON, žiadny text okolo`;

  // ─── PROMPT 2: GOOGLE ADS KAMPANE ───
  const googlePrompt = `Si senior Google Ads špecialista pre slovenský trh. Pripravuješ KAMPANE pre klienta agentúry Adlify.

${clientContext}

## PLATFORMA: Google Ads (Search, Display, PMax)

## ÚLOHA
Vygeneruj **2-3 Google kampane** (NIE Meta — Meta sa rieši paralelne). Typicky:
- 1× Google Search (lokálna, hlavné služby) — povinné
- 1× Google Search (brand defense alebo druhá služba)
- 1× Google PMax alebo Display (awareness + remarketing) — voliteľné podľa budgetu

Spolu 2-3 kampane × 2-3 ad groups × 3-4 reklamy.

## VÝSTUP — strict JSON:

{
  "campaigns": [
    {
      "name": "Konkrétny názov vrátane mesta/služby (napr. 'Klimatizácie Liptov — Search')",
      "platform": "google",
      "campaign_type": "search" | "display" | "pmax",
      "objective": "konkrétny cieľ (napr. 'Lead generation cez kontaktný formulár a telefonáty')",
      "rationale": "2-3 vety prečo PRÁVE TÁTO kampaň pre tohto klienta",
      "daily_budget": 10,
      "targeting": {
        "locations": ${JSON.stringify(regions.length ? regions : countries)},
        "age_from": ${onboarding.target_audience?.demographics?.age_from || 28},
        "age_to": ${onboarding.target_audience?.demographics?.age_to || 65},
        "gender": "${onboarding.target_audience?.demographics?.gender || 'all'}",
        "keywords": ["top 5-10 KW z research"],
        "audiences": []
      },
      "ad_groups": [
        {
          "name": "Konkrétny názov AG (téma, nie 'Ad Group 1')",
          "theme": "1 veta čo táto AG rieši",
          "keywords": ["5-10 KW relevantných pre túto AG"],
          "negative_keywords": ["práca", "kariéra", "zamestnanie", "free", "zdarma", "kurz", "DIY", "návod", "..."],
          "ads": [
            {
              "type": "responsive",
              "variant_label": "A",
              "variant_hook": "Krátky popis hook angle (napr. 'Cena + akcia', 'Bezplatná obhliadka')",
              "headlines": ["10-12 unikátnych headlines pre variant A, max 30 znakov"],
              "descriptions": ["3-4 descriptions, max 90 znakov, USP + CTA"],
              "call_to_action": "konkrétna CTA",
              "final_url": "https://klient.sk/konkretna-stranka",
              "path1": "max-15-znakov",
              "path2": "max-15-znakov",
              "image_prompt": "PRE SEARCH KAMPANE: null. PRE DISPLAY/PMAX: 60-100 slovný EN prompt (formát v PRAVIDLÁCH).",
              "image_aspect_ratio": "null pre Search, '1.91:1' pre Display, '1:1' pre PMax",
              "image_text_overlay": { "headline": "2-4 SK slov hook na overlay", "cta": "1-2 SK slov", "position": "top-left|top-right|bottom-left|bottom-right|center", "color": "white|dark|brand" },
              "image_style_notes": "SK tip pre dizajnéra (napr. 'Color grading: teplé tóny')",
              "image_format": "photo|illustration|3d_render|minimal_banner|cinematic|lifestyle"
            },
            {
              "type": "responsive",
              "variant_label": "B",
              "variant_hook": "INÝ angle než A (napr. ak A je 'Cena', B je 'Garancia / Dôvera')",
              "headlines": ["10-12 headlines pre variant B s ÚPLNE INÝM angle"],
              "descriptions": ["3-4 descriptions s odlišným prístupom"],
              "call_to_action": "CTA pre variant B",
              "final_url": "rovnaká URL ako A",
              "path1": "max-15",
              "path2": "max-15",
              "image_prompt": "PRE SEARCH: null. PRE DISPLAY: INÝ vizuál než A.",
              "image_aspect_ratio": "rovnaký ako A",
              "image_text_overlay": { "headline": "iný hook", "cta": "iné CTA", "position": "iná pozícia", "color": "white|dark|brand" },
              "image_style_notes": "SK tip pre úpravy variantu B",
              "image_format": "photo|illustration|3d_render|minimal_banner|cinematic|lifestyle"
            }
          ]
        }
      ],
      "estimated_results": { "impressions": 0, "clicks": 0, "ctr": 0, "conversions": 0, "cpa": 0 }
    }
  ]
}

KRITICKÉ PRAVIDLÁ:
1. PLATFORMA MUSÍ BYŤ "google" pre VŠETKY kampane (žiadne meta!)
2. Headlines MAX 30 znakov, descriptions MAX 90 znakov (Google limit). Skontroluj dĺžku pred zápisom.
3. Min 10 headlines per reklama (Google Responsive Search Ads vyžaduje veľa variantov)
4. Cituj USP klienta DOSLOVA v headlines
5. final_url: konkrétna stránka (base ${onboarding.company_website || 'klient.sk'})
6. Targeting locations: ${JSON.stringify(regions.length ? regions : countries)}
7. KW: kombinuj reálne MM keywords s lokálnymi variantami (s mestami)
8. Pre Search ads: image_prompt = null, image_aspect_ratio = null, image_text_overlay = null, image_style_notes = null, image_format = null
9. Pre Display/PMax ads — všetky tieto polia POVINNÉ:
   - image_text_overlay (vyrob prvé!) { headline: "2-4 SK slov hook na obrázok napr. 'Obhliadka zdarma'", cta: "1-2 SK slov napr. 'Zavolajte'", position: "top-left|top-right|bottom-left|bottom-right|center", color: "white|dark|brand" }
   - image_prompt: 60-100 slovný EN prompt ktorý INCLUDES TEXT OVERLAY priamo v obrázku (Nano Banana 2 generuje text dobre). Format: "[ŠTÝL] Professional advertising photography / illustration, [SCÉNA] konkrétna lokácia + denná doba, [SUBJEKT] hlavný prvok s materiálmi/farbami/detailmi, [TEXT OVERLAY] bold sans-serif text 'HEADLINE_VALUE' positioned [POSITION_FROM_OVERLAY] in [COLOR_FROM_OVERLAY], plus pill button text 'CTA_VALUE' bottom-center, [KOMPOZÍCIA] rule of thirds + text-friendly background area, [LIGHTING] golden hour / soft natural, [KAMERA] shot on Canon EOS R5 50mm f/1.8, [PALETA] 2-3 farby ${brandAssets.colors.length > 0 ? `(POVINNE: ${brandAssets.colors.join(', ')})` : ''}, [MOOD] emócia. NA KONCI: no logos, no watermarks, no people faces visible, --ar 1.91:1". NEUVÁDZAJ "no text" (text je súčasť obrázka).
   - image_style_notes: krátky SK tip pre dizajnéra na úpravy (napr. "Color grading: oranžové vintage tóny", "Text môže mať jemný shadow pre lepšie čitateľnosť")
   - image_format: vyber jeden — "photo" | "illustration" | "3d_render" | "minimal_banner" | "cinematic" | "lifestyle"
10. ODPOVEĎ LEN JSON, žiadny text okolo`;

  // ─── PROMPT 3: META ADS KAMPANE ───
  const metaPrompt = `Si senior Meta Ads (Facebook + Instagram) špecialista pre slovenský trh. Pripravuješ KAMPANE pre klienta agentúry Adlify.

${clientContext}

## PLATFORMA: Meta Ads (Facebook + Instagram)

## ÚLOHA
Vygeneruj **1-2 Meta kampane** (NIE Google — Google sa rieši paralelne). Typicky:
- 1× Conversions/Leads (hlavná, cieli na nákup / kontakt) — povinné
- 1× Awareness/Engagement alebo Remarketing — voliteľné podľa budgetu

Spolu 1-2 kampane × 2-3 ad sets × 3-4 reklamy.

## VÝSTUP — strict JSON:

{
  "campaigns": [
    {
      "name": "Konkrétny názov (napr. 'Klimatizácie — Leto Liptov FB+IG')",
      "platform": "meta",
      "campaign_type": "conversions" | "traffic" | "awareness" | "engagement" | "video",
      "objective": "konkrétny Meta objective (Outcome Sales / Outcome Leads / Outcome Awareness)",
      "rationale": "2-3 vety prečo PRÁVE TÁTO kampaň pre tohto klienta",
      "daily_budget": 10,
      "targeting": {
        "locations": ${JSON.stringify(regions.length ? regions : countries)},
        "age_from": ${onboarding.target_audience?.demographics?.age_from || 28},
        "age_to": ${onboarding.target_audience?.demographics?.age_to || 65},
        "gender": "${onboarding.target_audience?.demographics?.gender || 'all'}",
        "interests": ["5-8 konkrétnych Meta záujmov relevantných pre tohto klienta — napr. 'Home improvement', 'Smart home', 'Energy efficiency'"],
        "audiences": ["lookalike z webu", "remarketing 30d"]
      },
      "ad_groups": [
        {
          "name": "Názov ad setu (napr. 'Majitelia rodinných domov 35-65')",
          "theme": "1 veta čo táto cieľová skupina rieši",
          "keywords": [],
          "negative_keywords": [],
          "ads": [
            {
              "type": "responsive",
              "variant_label": "A",
              "variant_hook": "Hook angle pre variant A — napr. 'Emocionálny benefit' alebo 'Sociálny dôkaz'",
              "headlines": [
                "5 headlines pre variant A, každý max 40 znakov (Meta limit). Cituj USP."
              ],
              "descriptions": [
                "3-4 primary texts (descriptions). Prvý je dlhší (max 125 znakov), ostatné kratšie variácie."
              ],
              "call_to_action": "LEARN_MORE | SHOP_NOW | SIGN_UP | CONTACT_US | GET_QUOTE",
              "final_url": "https://klient.sk/konkretna-stranka",
              "path1": null,
              "path2": null,
              "image_prompt": "60-100 slovný EN prompt pre Nano Banana 2 (formát v PRAVIDLÁCH).",
              "image_text_overlay": {
                "headline": "2-4 SK slov hook ktorý sa pridá NA obrázok ako overlay text (napr. 'Chlaďte za 1 týždeň' alebo 'Obhliadka zdarma')",
                "cta": "1-2 SK slov call to action (napr. 'Objednať', 'Zistite viac', 'Zavolajte')",
                "position": "top-left | top-right | bottom-left | bottom-right | center — vyber podľa copy_space pozície v image_prompte",
                "color": "white | dark | brand — odporúčaná farba textu pre overlay"
              },
              "image_style_notes": "Krátky SK tip pre dizajnéra/admina ako môže obrázok ďalej vylepšiť (napr. 'Pridať jemný light leak v ľavom hornom rohu pre teplý feel', 'Color grading: oranžové vintage tóny', 'Logo klienta umiestniť do pravého dolného rohu')",
              "image_format": "photo | illustration | 3d_render | minimal_banner | cinematic | lifestyle — vyber best fit",
              "image_aspect_ratio": "1:1"
            },
            {
              "type": "responsive",
              "variant_label": "B",
              "variant_hook": "INÝ hook angle pre variant B — napr. ak A je emocionálny, B môže byť racionálny (cena/funkcia)",
              "headlines": [
                "5 headlines pre variant B s ODLIŠNÝM prístupom než A"
              ],
              "descriptions": [
                "3-4 primary texts s odlišným storytelling než variant A"
              ],
              "call_to_action": "iný CTA ak má zmysel",
              "final_url": "rovnaká URL ako A",
              "path1": null,
              "path2": null,
              "image_prompt": "60-100 slov, INÝ vizuálny prístup než A (wide vs close-up, deň vs večer).",
              "image_text_overlay": { "headline": "iný hook než variant A", "cta": "iné CTA", "position": "iná pozícia", "color": "white|dark|brand" },
              "image_style_notes": "Krátky SK tip pre úpravy variantu B",
              "image_format": "photo | illustration | 3d_render | minimal_banner | cinematic | lifestyle",
              "image_aspect_ratio": "1:1"
            }
          ]
        }
      ],
      "estimated_results": { "impressions": 0, "clicks": 0, "ctr": 0, "conversions": 0, "cpa": 0 }
    }
  ]
}

KRITICKÉ PRAVIDLÁ:
1. PLATFORMA MUSÍ BYŤ "meta" pre VŠETKY kampane (žiadne google!)
2. Headlines MAX 40 znakov (Meta limit), primary text max 125 znakov
3. Cituj USP klienta DOSLOVA, ale primary text môže byť emotívnejší než Google (storytelling)
4. final_url: konkrétna stránka
5. Targeting locations: ${JSON.stringify(regions.length ? regions : countries)}
6. interests: konkrétne Meta záujmy v angličtine (Meta používa EN názvy)
7. POVINNÉ polia pre KAŽDÚ Meta reklamu (variant A aj B) — najprv vyrob overlay, potom image_prompt s text-om:
   - image_text_overlay: { headline: "2-4 SK slov hook na obrázok", cta: "1-2 SK slov CTA", position: "top-left|top-right|bottom-left|bottom-right|center", color: "white|dark|brand" } — všetky povinné
   - image_prompt: 60-100 slovný EN prompt ktorý INCLUDES TEXT OVERLAY priamo v obrázku (Nano Banana 2 zvláda text dobre). Format: "[ŠTÝL] Professional advertising photography / cinematic, [SCÉNA] lokácia + denná doba, [SUBJEKT] hlavný prvok s materiálmi/detailmi, [TEXT OVERLAY] bold sans-serif text 'HEADLINE_VALUE' positioned [POSITION_FROM_OVERLAY] in [COLOR_FROM_OVERLAY] color, plus pill button text 'CTA_VALUE' bottom-center, [KOMPOZÍCIA] rule of thirds + text-friendly area, [LIGHTING] soft natural/golden hour, [KAMERA] shot on Canon EOS R5 50mm f/1.8 shallow DOF, [PALETA] ${brandAssets.colors.length > 0 ? `POVINNE brand colors: ${brandAssets.colors.join(', ')}` : '2-3 dominantné farby'}, [MOOD] emócia. NA KONCI: no logos, no watermarks, no people faces visible, --ar 1:1". NEUVÁDZAJ "no text" (text je súčasť obrázka, Nano Banana ho generuje).
   - image_style_notes: SK tip pre dizajnéra (Color grading, text shadow pre čitateľnosť, atď.)
   - image_format: "photo" | "illustration" | "3d_render" | "minimal_banner" | "cinematic" | "lifestyle"
8. image_aspect_ratio: "1:1" pre feed, "4:5" pre vertical feed, "9:16" pre Stories/Reels
9. ODPOVEĎ LEN JSON, žiadny text okolo`;

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) throw new Error('Missing ANTHROPIC_API_KEY env var na Netlify');

  // Helper na 1 paralelné volanie Claude s parsovaním
  async function callClaude(prompt, label) {
    const promptLen = prompt.length;
    const startTs = Date.now();
    console.log(`[generate-campaigns] [${label}] calling Claude — prompt ${promptLen} chars`);
    let r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 12000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
    } catch (fetchErr) {
      console.error(`[generate-campaigns] [${label}] fetch failed:`, fetchErr.message);
      throw new Error(`Network fetch (${label}): ${fetchErr.message}`);
    }
    const elapsed = Date.now() - startTs;
    console.log(`[generate-campaigns] [${label}] HTTP ${r.status} po ${elapsed}ms`);

    let j;
    try { j = await r.json(); }
    catch (jsonErr) {
      console.error(`[generate-campaigns] [${label}] failed to parse response JSON:`, jsonErr.message);
      throw new Error(`Response JSON parse (${label}): ${jsonErr.message}`);
    }

    if (j.error) {
      console.error(`[generate-campaigns] [${label}] Claude API error:`, JSON.stringify(j.error));
      throw new Error(`Claude API (${label}): ${j.error.message || JSON.stringify(j.error)}`);
    }
    if (!j.content?.[0]?.text) {
      console.error(`[generate-campaigns] [${label}] empty content. Full response keys:`, Object.keys(j));
      throw new Error(`Claude vrátil prázdny content (${label}). Stop reason: ${j.stop_reason || 'unknown'}`);
    }

    const outputText = j.content[0].text;
    const usage = j.usage || {};
    console.log(`[generate-campaigns] [${label}] OK — input=${usage.input_tokens || '?'}t output=${usage.output_tokens || '?'}t · response=${outputText.length} chars`);

    try {
      return parseClaudeJSON(outputText);
    } catch (parseErr) {
      console.error(`[generate-campaigns] [${label}] JSON parse failed. First 500 chars of output:`, outputText.slice(0, 500));
      throw new Error(`JSON parse (${label}): ${parseErr.message}. Vidíš prvých 500 znakov v Netlify logoch.`);
    }
  }

  // 3 paralelné volania — Strategy, Google kampane, Meta kampane.
  // Promise.allSettled — partial success je OK, jeden zlyhaný call
  // nezhodí celé generovanie (predtým Promise.all rejectovala všetko ak
  // jeden call zlyhal, čo znamenalo stratu kreditu za 2 úspešné callz).
  const wantsGoogle = platforms.some(p => /google/i.test(p));
  const wantsMeta = platforms.some(p => /meta|facebook/i.test(p));

  console.log(`[generate-campaigns] starting 3 parallel Claude calls — wantsGoogle=${wantsGoogle} wantsMeta=${wantsMeta}`);

  const taskNames = ['strategy'];
  const tasks = [callClaude(strategyPrompt, 'strategy')];
  if (wantsGoogle) { taskNames.push('google'); tasks.push(callClaude(googlePrompt, 'google')); }
  if (wantsMeta) { taskNames.push('meta'); tasks.push(callClaude(metaPrompt, 'meta')); }

  const settled = await Promise.allSettled(tasks);
  let strategyDoc = null, googleDoc = null, metaDoc = null;
  let failedCalls = [];
  for (let i = 0; i < settled.length; i++) {
    const name = taskNames[i];
    const r = settled[i];
    if (r.status === 'fulfilled') {
      console.log(`[generate-campaigns] ✓ ${name} call succeeded`);
      if (name === 'strategy') strategyDoc = r.value;
      else if (name === 'google') googleDoc = r.value;
      else if (name === 'meta') metaDoc = r.value;
    } else {
      console.error(`[generate-campaigns] ✗ ${name} call FAILED:`, r.reason?.message || r.reason);
      failedCalls.push(`${name}: ${r.reason?.message || 'unknown'}`);
    }
  }

  // Ak zlyhali VŠETKY callz, throw — inak partial success
  if (settled.every(r => r.status === 'rejected')) {
    throw new Error('Všetky 3 Claude calls zlyhali: ' + failedCalls.join(' | '));
  }
  if (failedCalls.length > 0) {
    console.warn(`[generate-campaigns] partial success — ${failedCalls.length} calls failed:`, failedCalls);
  }

  // Spojenie do final doc — strategický dokument + kampane z oboch platforiem
  // Ak strategy zlyhal ale Google/Meta prejdú, použij empty strategy fallback
  const doc = {
    ...(strategyDoc || {
      strategy_summary: null,
      business_analysis: null,
      research_insights: null,
      budget_breakdown: null,
      expected_results: null,
      timeline: null,
      next_steps: null,
    }),
    campaigns: [
      ...(googleDoc?.campaigns || []).map(c => ({ ...c, platform: 'google' })),
      ...(metaDoc?.campaigns || []).map(c => ({ ...c, platform: 'meta' })),
    ],
  };
  const campaignsArr = doc.campaigns;
  console.log(`[generate-campaigns] generated: ${(googleDoc?.campaigns || []).length} Google + ${(metaDoc?.campaigns || []).length} Meta = ${campaignsArr.length} total`);
  if (campaignsArr.length === 0) {
    throw new Error('AI nevygenerovala žiadne kampane. Zlyhalo: ' + (failedCalls.join(', ') || 'unknown'));
  }

  // Diagnostika obsahu — ktoré polia AI naozaj vygenerovala (debug pre prípady
  // keď Claude vynechá voliteľné polia ako image_text_overlay)
  let withOverlay = 0, withStyleNotes = 0, withFormat = 0, withVariants = 0, totalAds = 0;
  for (const c of campaignsArr) {
    for (const g of (c.ad_groups || [])) {
      for (const ad of (g.ads || [])) {
        totalAds++;
        if (ad.image_text_overlay && typeof ad.image_text_overlay === 'object') withOverlay++;
        if (ad.image_style_notes) withStyleNotes++;
        if (ad.image_format) withFormat++;
        if (ad.variant_label) withVariants++;
      }
    }
  }
  console.log(`[generate-campaigns] field coverage: ${totalAds} ads | overlay=${withOverlay} | style_notes=${withStyleNotes} | format=${withFormat} | variants=${withVariants}`);

  // 5. Snapshot predošlej verzie do proposal_versions PRED zmazaním kampaní
  // — admin si vie pozrieť čo AI vygenerovala minule a porovnať.
  try {
    const { data: prevProject } = await supabase.from('campaign_projects')
      .select('proposal_version, strategy_summary, business_analysis, research_data, expected_results, timeline, budget_breakdown, next_steps')
      .eq('id', project_id).maybeSingle();

    if (prevProject?.proposal_version > 0 && prevProject?.strategy_summary) {
      // Snapshot existujúcich kampaní + ad_groups + ads ako JSONB
      const { data: oldCampaigns } = await supabase.from('campaigns')
        .select('name, platform, campaign_type, objective, budget_daily, targeting, metrics')
        .eq('project_id', project_id).eq('ai_generated', true);
      const campaignsSnapshot = oldCampaigns || [];
      for (const c of campaignsSnapshot) {
        const { data: groups } = await supabase.from('ad_groups').select('id, name, keywords, negative_keywords')
          .in('campaign_id', (oldCampaigns || []).map(x => x.id || '00000000-0000-0000-0000-000000000000'));
        c.ad_groups = groups || [];
      }

      const snapErr = (await supabase.from('proposal_versions').insert({
        project_id,
        version: prevProject.proposal_version,
        strategy_summary: prevProject.strategy_summary,
        business_analysis: prevProject.business_analysis,
        research_data: prevProject.research_data,
        expected_results: prevProject.expected_results,
        timeline: prevProject.timeline,
        budget_breakdown: prevProject.budget_breakdown,
        next_steps: prevProject.next_steps,
        campaigns_snapshot: campaignsSnapshot,
        trigger: extra_instruction ? 'regenerate' : 'initial',
        feedback: extra_instruction || null,
      })).error;
      if (snapErr) console.warn('[snapshot] failed (migration 030 chýba?):', snapErr.message);
      else console.log(`[snapshot] saved v${prevProject.proposal_version} for project ${project_id}`);
    }
  } catch (e) {
    console.warn('[snapshot] skipped:', e.message);
  }

  // 6. ATOMICKÉ save — najprv overíme že vieme inserovať, AŽ POTOM zmažeme staré.
  // Predtým bug: delete šiel pred insertom, ak insert padol (napr. chýbajúca
  // migrácia 034 → unknown column "image_text_overlay"), staré dáta sa stratili
  // ale nové nevznikli → projekt vyzeral prázdny v draft state.
  //
  // Nový flow:
  //   1) Načítaj clientId
  //   2) Pre prvú kampaň urob "probe insert" — ak prejde, vieme že schéma sedí
  //      a pokračujeme. Ak padne na unknown column, zopakujeme insert BEZ
  //      voliteľných polí (image_text_overlay, image_style_notes, image_format,
  //      variant_*) — fallback pre prípady kde admin nespustil migrácie 032/034.
  //   3) Až keď je prvá kampaň úspešne uložená, mažeme staré (re-run guard).
  //   4) Zvyšok kampaní + ad_groups + ads ide rovnakým atomic spôsobom.

  // Načítaj client_id z projektu
  const { data: projRow } = await supabase
    .from('campaign_projects').select('client_id').eq('id', project_id).single();
  const clientId = projRow?.client_id || null;

  // Helper — insert s automatickým retry bez nepovinných stĺpcov pri PGRST204
  // (column not found). Vracia { data, error }.
  async function insertWithFallback(table, fullRow, optionalCols) {
    let { data, error } = await supabase.from(table).insert(fullRow).select().single();
    if (error && /column .* does not exist|could not find .* column|PGRST204/i.test(error.message || '')) {
      console.warn(`[insertWithFallback] ${table} — chýbajúci stĺpec, retry bez:`, optionalCols, '(spusti chýbajúce migrácie)');
      const minimal = { ...fullRow };
      for (const col of optionalCols) delete minimal[col];
      ({ data, error } = await supabase.from(table).insert(minimal).select().single());
    }
    return { data, error };
  }

  // Helper — orežem textové polia na bezpečnú dĺžku (defenzívny net
  // pre prípad keď schéma má varchar(100) na nejakom stĺpci. Migrácia
  // 035 by mala TEXT, ale fallback je istota).
  const safeTrim = (s, max) => {
    if (s == null) return null;
    const str = String(s).trim();
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  };

  const buildCampaignRow = (c) => ({
    project_id, client_id: clientId,
    name: safeTrim(c.name, 250),
    platform: c.platform,
    campaign_type: safeTrim(c.campaign_type, 80),
    objective: safeTrim(c.objective, 250),
    budget_daily: Number(c.daily_budget) || 0,
    status: 'draft',
    targeting: c.targeting || {},
    metrics: { estimated: c.estimated_results || {}, rationale: c.rationale || '' },
    ai_generated: true,
  });

  // PROBE: skús prvú kampaň — ak prejde, vieme že schéma je OK
  const firstCampaign = campaignsArr[0];
  const firstCampaignRow = buildCampaignRow(firstCampaign);
  const probe = await insertWithFallback('campaigns', firstCampaignRow, ['client_id', 'ai_generated']);
  if (probe.error) {
    throw new Error('Insert kampane zlyhal: ' + probe.error.message + '. Skontroluj že migrácie 028 (campaigns/campaign_projects stĺpce) sú spustené.');
  }

  // ✅ Schéma OK — teraz bezpečne zmaž staré kampane
  await deleteOldDraftCampaigns(project_id);

  // Re-vytvor prvú kampaň (snapshot mohla zostať v staršej verzii, alebo
  // bola v tej istej "draft + ai_generated" sade ktorú sme práve zmazali)
  // POZNÁMKA: deleteOldDraftCampaigns mažed AI draft kampane vrátane tej čo
  // sme práve insertli. Insertujeme ju znova po delete.
  const savedFirst = await insertWithFallback('campaigns', firstCampaignRow, ['client_id', 'ai_generated']);
  if (savedFirst.error) throw new Error('Re-insert prvej kampane zlyhal: ' + savedFirst.error.message);

  let campaignsGenerated = 1;

  // Insert ad_groups + ads pre prvú kampaň
  await insertAdGroupsAndAds(firstCampaign, savedFirst.data, onboarding, insertWithFallback);

  // Insert zostávajúce kampane (i = 1 lebo prvá je už hotová)
  for (let i = 1; i < campaignsArr.length; i++) {
    const c = campaignsArr[i];
    const row = buildCampaignRow(c);
    const saved = await insertWithFallback('campaigns', row, ['client_id', 'ai_generated']);
    if (saved.error) { console.error('Campaign insert:', saved.error.message); continue; }
    campaignsGenerated++;
    await insertAdGroupsAndAds(c, saved.data, onboarding, insertWithFallback);
  }

  // Helper — vloží všetky ad_groups a ads pre danú kampaň (s fallback na
  // chýbajúce voliteľné stĺpce z migrácií 032/034).
  async function insertAdGroupsAndAds(c, savedCampaign, onboarding, insertWithFallback) {
    for (const g of (c.ad_groups || [])) {
      const safeAGName = String(g.name || 'Ad Group').trim().slice(0, 250);
      const agRes = await insertWithFallback('ad_groups', {
        campaign_id: savedCampaign.id,
        name: safeAGName,
        keywords: g.keywords || [],
        negative_keywords: g.negative_keywords || [],
        status: 'draft',
      }, []);
      if (agRes.error) { console.error('AG insert:', agRes.error.message); continue; }
      const savedAG = agRes.data;

      // Variant group ID — všetky varianty v tom istom ad group sú spojené
      const variantGroupId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
            const r = Math.random()*16|0; return (ch==='x'?r:(r&0x3|0x8)).toString(16);
          });

      const adsArr = g.ads || [];
      const hasVariants = adsArr.length > 1 && adsArr.some(a => a.variant_label);

      for (const ad of adsArr) {
        const isSearchAd = (c.campaign_type || '').toLowerCase() === 'search';
        // Hard-limit guard — Claude občas prekročí limity. Pre Google Search
        // máme 30/90, pre Meta 40/125. Ak prekročí, skrátime (lepšie ako
        // odmietnutie v Google Ads Editor / Meta Bulk pri importe).
        const isGoogle = (c.platform || '').toLowerCase() === 'google';
        const headlineLimit = isGoogle ? 30 : 40;
        const descLimit = isGoogle ? 90 : 125;
        const trimList = (arr, limit) => (Array.isArray(arr) ? arr : [])
          .map(s => String(s || '').trim())
          .filter(Boolean)
          .map(s => s.length > limit ? s.slice(0, limit - 1).trimEnd() + '…' : s);
        const safeHeadlines = trimList(ad.headlines, headlineLimit);
        const safeDescriptions = trimList(ad.descriptions, descLimit);

        // Voliteľné stĺpce z mig 032 (variant_*) a 034 (image_text_overlay,
        // image_style_notes, image_format) — ak chýbajú v DB, insertWithFallback
        // ich vyhodí a skúsi insert znova bez nich.
        const adRow = {
          ad_group_id: savedAG.id,
          ad_type: String(ad.type || 'responsive').slice(0, 50),
          headlines: safeHeadlines,
          descriptions: safeDescriptions,
          call_to_action: safeTrim(ad.call_to_action, 100),
          final_url: ad.final_url || onboarding.company_website || null,
          path1: ad.path1 ? String(ad.path1).slice(0, 15) : null,
          path2: ad.path2 ? String(ad.path2).slice(0, 15) : null,
          image_prompt: isSearchAd ? null : (ad.image_prompt || null),
          image_aspect_ratio: isSearchAd ? null : safeTrim(ad.image_aspect_ratio || '1:1', 20),
          image_status: isSearchAd ? 'skipped' : 'pending',
          image_text_overlay: isSearchAd ? null : (ad.image_text_overlay || null),
          image_style_notes: isSearchAd ? null : (ad.image_style_notes || null),
          image_format: isSearchAd ? null : safeTrim(ad.image_format || 'photo', 30),
          variant_label: hasVariants ? (ad.variant_label ? String(ad.variant_label).slice(0, 10) : null) : null,
          variant_group_id: hasVariants ? variantGroupId : null,
          variant_hook: safeTrim(ad.variant_hook, 250),
          status: 'draft',
        };
        const adRes = await insertWithFallback('ads', adRow, [
          'image_text_overlay', 'image_style_notes', 'image_format',
          'variant_label', 'variant_group_id', 'variant_hook',
          'image_prompt', 'image_aspect_ratio', 'image_status',
          'final_url', 'path1', 'path2',
        ]);
        if (adRes.error) console.error('Ad insert:', adRes.error.message);
      }
    }
  }

  // 6. Update project — KRITICKÝ status flip najprv (minimálne stĺpce
  // status + updated_at vždy existujú). Kampane sú už uložené, takže
  // aj keby bohatý update nižšie zlyhal na chýbajúcom stĺpci, projekt
  // sa správne zobrazí v internal_review s kampaňami.
  const { error: statusErr } = await supabase
    .from('campaign_projects')
    .update({ status: 'internal_review', updated_at: new Date().toISOString() })
    .eq('id', project_id);
  if (statusErr) {
    console.error('[generate-campaigns] CRITICAL status update failed:', statusErr.message);
    throw new Error('Status update zlyhal: ' + statusErr.message);
  }

  // 7. Rich data — NEPOVINNÉ. Ak migrácia 028 nebola spustená a stĺpce
  // chýbajú, kampane aj tak existujú a status je správny. Skúšame polia
  // po skupinách aby jedno chýbajúce nezhodilo všetky.
  const { data: currentProject } = await supabase
    .from('campaign_projects').select('proposal_version').eq('id', project_id).maybeSingle();
  const nextVersion = (currentProject?.proposal_version || 0) + 1;

  const richUpdate = {
    strategy_summary: doc.strategy_summary || null,
    business_analysis: doc.business_analysis || null,
    research_data: { ...researchData, insights: doc.research_insights || null, model_used: 'claude-sonnet-4-6', generator_version: 3, runtime: 'netlify' },
    expected_results: doc.expected_results || null,
    timeline: doc.timeline || null,
    budget_breakdown: doc.budget_breakdown || null,
    next_steps: doc.next_steps || null,
    total_monthly_budget: doc.budget_breakdown?.total_monthly || monthlyBudget,
    proposal_version: nextVersion,
    notes: null,
  };
  const { error: richErr } = await supabase
    .from('campaign_projects').update(richUpdate).eq('id', project_id);
  if (richErr) {
    console.warn('[generate-campaigns] rich data update skipped (chýbajúce stĺpce? spusti migráciu 028):', richErr.message);
  }

  console.log(`[generate-campaigns] DONE project ${project_id} — ${campaignsGenerated} campaigns`);
  return { campaigns_generated: campaignsGenerated };
}

// ───── Netlify Background Function entry ─────

exports.handler = async (event) => {
  console.log('[generate-campaigns] ===== HANDLER ENTRY =====', {
    method: event.httpMethod,
    has_body: !!event.body,
    body_len: (event.body || '').length,
    has_anthropic_key: !!process.env.ANTHROPIC_API_KEY,
    has_supabase_url: !!process.env.SUPABASE_URL,
    has_service_key: !!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
  });

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch (e) {
    console.error('[generate-campaigns] bad JSON body:', e.message);
    return { statusCode: 400, headers: cors, body: 'Bad JSON' };
  }

  const { project_id, onboarding_id, platforms = ['google_search', 'meta_facebook'], extra_instruction } = payload;
  console.log('[generate-campaigns] payload:', { project_id, onboarding_id, platforms, has_extra: !!extra_instruction });

  if (!project_id || !onboarding_id) {
    console.error('[generate-campaigns] missing required IDs');
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing project_id or onboarding_id' }) };
  }

  // Background function — beží do 15 min po vrátení response. Worker beží v rámci
  // tej istej invocation, nie asynchronne — Netlify mu dá 15 minút na dobehnutie.
  try {
    await runGeneration({ project_id, onboarding_id, platforms, extra_instruction });
    return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true }) };
  } catch (error) {
    console.error('[generate-campaigns] error:', error);
    // Reset projektu na draft s error notes. Ak notes stĺpec neexistuje
    // (migrácia 028 nespustená), fallback na status-only reset.
    try {
      const { error: resetErr } = await supabase.from('campaign_projects')
        .update({ status: 'draft', notes: `AI error: ${error.message}`.slice(0, 500) })
        .eq('id', project_id)
        .eq('status', 'generating');
      if (resetErr) {
        await supabase.from('campaign_projects')
          .update({ status: 'draft' })
          .eq('id', project_id)
          .eq('status', 'generating');
      }
    } catch (e) {
      console.error('Status reset failed:', e.message);
    }
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: error.message }) };
  }
};
