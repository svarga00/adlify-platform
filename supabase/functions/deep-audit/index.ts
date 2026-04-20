// =====================================================
// ADLIFY — deep-audit edge function v1
// =====================================================
// Audit-first outreach flow: trigger po klike na "Chcem audit zadarmo"
//
// Vstup: { audit_token: string }
// Vystup: 200 + audit_findings ulozene v leads.audit_findings
//
// Postup:
//   1. Validacia tokenu, nacitanie leadu
//   2. Paralelne API volania:
//        - Google PageSpeed Insights (mobile + desktop)
//        - HTML fetch homepage + parse (meta, tracking, social, tech)
//        - WHOIS (vek domeny)
//        - Marketing Miner (top keywords pre odvetvie/firmu)
//   3. Claude synteza -> 3 konkretne findings
//   4. Update leads.audit_data + audit_findings
//   5. Poslanie emailu cez Resend
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BASE_URL = Deno.env.get('PUBLIC_BASE_URL') || 'https://adlify.eu'

// =====================================================
// 1. PAGESPEED INSIGHTS
// =====================================================

async function fetchPageSpeed(url: string, strategy: 'mobile' | 'desktop' = 'mobile'): Promise<any> {
  try {
    const apiKey = Deno.env.get('PAGESPEED_API_KEY') || ''
    const params = new URLSearchParams({
      url,
      strategy,
      category: 'performance',
    })
    params.append('category', 'seo')
    params.append('category', 'accessibility')
    params.append('category', 'best-practices')
    if (apiKey) params.append('key', apiKey)

    const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`)
    if (!r.ok) {
      console.warn(`PageSpeed ${strategy} failed: ${r.status}`)
      return null
    }
    const j = await r.json()
    const lh = j.lighthouseResult || {}
    const cats = lh.categories || {}
    const audits = lh.audits || {}
    return {
      strategy,
      scores: {
        performance: Math.round((cats.performance?.score || 0) * 100),
        seo: Math.round((cats.seo?.score || 0) * 100),
        accessibility: Math.round((cats.accessibility?.score || 0) * 100),
        bestPractices: Math.round((cats['best-practices']?.score || 0) * 100),
      },
      metrics: {
        lcp: audits['largest-contentful-paint']?.displayValue || null,
        fcp: audits['first-contentful-paint']?.displayValue || null,
        cls: audits['cumulative-layout-shift']?.displayValue || null,
        tbt: audits['total-blocking-time']?.displayValue || null,
        speedIndex: audits['speed-index']?.displayValue || null,
      },
      issues: extractTopIssues(audits),
    }
  } catch (e) {
    console.error(`PageSpeed ${strategy} error:`, e)
    return null
  }
}

function extractTopIssues(audits: any): any[] {
  const issues: any[] = []
  const importantAudits = [
    'render-blocking-resources',
    'unused-javascript',
    'unused-css-rules',
    'uses-optimized-images',
    'uses-text-compression',
    'modern-image-formats',
    'meta-description',
    'document-title',
    'image-alt',
    'viewport',
    'font-size',
  ]
  for (const key of importantAudits) {
    const a = audits[key]
    if (!a) continue
    if (a.score !== null && a.score < 0.9) {
      issues.push({
        id: key,
        title: a.title,
        score: a.score,
        savings: a.displayValue || null,
      })
    }
  }
  return issues
}

// =====================================================
// 2. HTML FETCH + PARSE
// =====================================================

async function fetchAndParseHTML(domain: string): Promise<any> {
  const url = `https://${domain}`
  const start = Date.now()
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AdlifyAudit/1.0)' },
      signal: AbortSignal.timeout(15000),
    })
    const elapsed = Date.now() - start
    const html = await r.text()

    return {
      available: r.ok,
      status: r.status,
      loadMs: elapsed,
      pageSizeKB: Math.round(html.length / 1024),
      hasSSL: url.startsWith('https'),
      meta: extractMeta(html),
      tracking: detectTracking(html),
      social: extractSocialLinks(html),
      tech: detectTechStack(html, r.headers),
      structure: analyzeStructure(html),
    }
  } catch (e) {
    return { available: false, error: String(e), loadMs: Date.now() - start }
  }
}

function extractMeta(html: string): any {
  const get = (re: RegExp) => {
    const m = html.match(re)
    return m ? m[1].trim() : null
  }
  const title = get(/<title[^>]*>([^<]*)<\/title>/i)
  const desc = get(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)
    || get(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i)
  const ogImage = get(/<meta\s+property=["']og:image["']\s+content=["']([^"']*)["']/i)
  const ogTitle = get(/<meta\s+property=["']og:title["']\s+content=["']([^"']*)["']/i)
  const ogDesc = get(/<meta\s+property=["']og:description["']\s+content=["']([^"']*)["']/i)
  const viewport = get(/<meta\s+name=["']viewport["']\s+content=["']([^"']*)["']/i)
  const canonical = get(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i)
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const h1 = h1Match ? h1Match[1].replace(/<[^>]*>/g, '').trim().slice(0, 200) : null

  return {
    title,
    titleLength: title?.length || 0,
    description: desc,
    descriptionLength: desc?.length || 0,
    ogImage,
    ogTitle,
    ogDescription: ogDesc,
    hasViewport: !!viewport,
    canonical,
    h1,
    hasSchemaOrg: html.includes('application/ld+json') || html.includes('itemtype="http://schema.org'),
  }
}

function detectTracking(html: string): any {
  const out: any = {
    googleAnalytics: false,
    googleAnalyticsId: null,
    googleTagManager: false,
    googleAds: false,
    googleAdsId: null,
    metaPixel: false,
    metaPixelId: null,
    linkedinInsight: false,
    tiktokPixel: false,
    hotjar: false,
    smartlook: false,
  }
  const ga = html.match(/G-[A-Z0-9]{6,}|UA-\d+-\d+/)
  if (ga) { out.googleAnalytics = true; out.googleAnalyticsId = ga[0] }
  if (html.includes('googletagmanager.com/gtm.js') || html.match(/GTM-[A-Z0-9]+/)) out.googleTagManager = true
  const aw = html.match(/AW-\d+/)
  if (aw) { out.googleAds = true; out.googleAdsId = aw[0] }
  if (html.includes('googleadservices.com')) out.googleAds = true
  const fb = html.match(/fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d+)['"]/)
  if (fb) { out.metaPixel = true; out.metaPixelId = fb[1] }
  if (html.includes('connect.facebook.net') || html.includes('fbevents.js')) out.metaPixel = true
  if (html.includes('snap.licdn.com') || html.includes('linkedin.com/px')) out.linkedinInsight = true
  if (html.includes('analytics.tiktok.com')) out.tiktokPixel = true
  if (html.includes('static.hotjar.com')) out.hotjar = true
  if (html.includes('rec.smartlook.com')) out.smartlook = true
  return out
}

function extractSocialLinks(html: string): any {
  const find = (re: RegExp) => {
    const m = html.match(re)
    return m ? m[0].match(/https?:\/\/[^"'<>\s]+/)?.[0] || null : null
  }
  return {
    facebook: find(/https?:\/\/(www\.)?facebook\.com\/[A-Za-z0-9_.\-/]+/i),
    instagram: find(/https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_.\-/]+/i),
    linkedin: find(/https?:\/\/(www\.)?linkedin\.com\/(company|in)\/[A-Za-z0-9_.\-/]+/i),
    youtube: find(/https?:\/\/(www\.)?youtube\.com\/(channel|c|user|@)[A-Za-z0-9_.\-/]+/i),
    tiktok: find(/https?:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9_.\-/]+/i),
  }
}

function detectTechStack(html: string, headers: Headers): any {
  const tech: string[] = []
  const generator = html.match(/<meta\s+name=["']generator["']\s+content=["']([^"']*)["']/i)
  if (generator) tech.push(generator[1])
  if (html.includes('wp-content/') || html.includes('wp-includes/')) tech.push('WordPress')
  if (html.includes('cdn.shopify.com') || html.includes('shopify-section')) tech.push('Shopify')
  if (html.includes('webflow.com') || html.includes('w-mod-')) tech.push('Webflow')
  if (html.includes('cdn.squarespace.com')) tech.push('Squarespace')
  if (html.includes('wix.com') || html.includes('_wixCIDX')) tech.push('Wix')
  if (html.includes('joomla')) tech.push('Joomla')
  if (html.includes('drupal-settings-json')) tech.push('Drupal')
  if (html.includes('nuxt') || html.includes('__NUXT__')) tech.push('Nuxt.js')
  if (html.includes('__NEXT_DATA__')) tech.push('Next.js')
  const server = headers.get('server')
  if (server) tech.push(`Server: ${server}`)
  return { detected: [...new Set(tech)] }
}

function analyzeStructure(html: string): any {
  const h1Count = (html.match(/<h1\b/gi) || []).length
  const h2Count = (html.match(/<h2\b/gi) || []).length
  const h3Count = (html.match(/<h3\b/gi) || []).length
  const imgCount = (html.match(/<img\b/gi) || []).length
  const imgAlt = (html.match(/<img[^>]*\salt=/gi) || []).length
  const linkCount = (html.match(/<a\b[^>]*href=/gi) || []).length
  return {
    h1Count, h2Count, h3Count,
    imgCount, imgWithoutAlt: imgCount - imgAlt,
    linkCount,
  }
}

// =====================================================
// 3. WHOIS — vek domeny
// =====================================================

async function fetchDomainAge(domain: string): Promise<any> {
  try {
    const r = await fetch(`https://rdap.org/domain/${domain}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) return null
    const j = await r.json()
    const events = j.events || []
    const reg = events.find((e: any) => e.eventAction === 'registration')
    if (!reg) return null
    const regDate = new Date(reg.eventDate)
    const ageDays = Math.floor((Date.now() - regDate.getTime()) / (1000 * 60 * 60 * 24))
    const ageYears = Math.floor(ageDays / 365)
    return { registeredAt: reg.eventDate, ageDays, ageYears }
  } catch (e) {
    console.error('WHOIS error:', e)
    return null
  }
}

// =====================================================
// 4. MARKETING MINER — top keywords pre odvetvie
// =====================================================

async function fetchKeywordOpportunities(seeds: string[]): Promise<any[]> {
  const apiKey = Deno.env.get('MARKETING_MINER_API_KEY')
  if (!apiKey || seeds.length === 0) return []

  const collected: any[] = []
  for (const seed of seeds.slice(0, 3)) {
    try {
      const url = `https://profilers-api.marketingminer.com/keywords/suggestions?api_token=${apiKey}&lang=sk&keyword=${encodeURIComponent(seed)}`
      const r = await fetch(url)
      if (!r.ok) continue
      const j = await r.json()
      let suggs = j.keywords || j.data || []
      if (!Array.isArray(suggs)) suggs = []
      collected.push(...suggs.slice(0, 10).map((s: any) => ({
        keyword: typeof s === 'string' ? s : s.keyword,
        seed,
      })))
    } catch (e) { console.error('MM seed:', e) }
  }

  if (collected.length === 0) return []

  // Volume enrich
  try {
    const uniq = [...new Set(collected.map(c => c.keyword))].slice(0, 30)
    const volUrl = `https://profilers-api.marketingminer.com/keywords/search-volume-data?api_token=${apiKey}&lang=sk&${uniq.map(k => `keyword=${encodeURIComponent(k)}`).join('&')}`
    const vr = await fetch(volUrl)
    if (vr.ok) {
      const vj = await vr.json()
      const map = new Map((vj.data || []).map((v: any) => [v.keyword, v]))
      return uniq.map(kw => {
        const v: any = map.get(kw) || {}
        return {
          keyword: kw,
          volume: v.search_volume || 0,
          cpc: v.cpc || 0,
          competition: v.competition || null,
        }
      }).sort((a, b) => b.volume - a.volume).slice(0, 10)
    }
  } catch (e) { console.error('MM volume:', e) }

  return collected.slice(0, 10).map(c => ({ keyword: c.keyword, volume: 0 }))
}

// =====================================================
// 5. CLAUDE SYNTHESIS — 3 konkretne findings
// =====================================================

async function synthesizeFindings(lead: any, audit: any, requestData: any): Promise<any> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    console.warn('No ANTHROPIC_API_KEY, returning fallback findings')
    return fallbackFindings(audit)
  }

  const prompt = buildSynthesisPrompt(lead, audit, requestData)

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!r.ok) {
      const errText = await r.text()
      console.error('Claude API error:', r.status, errText)
      return fallbackFindings(audit)
    }
    const j = await r.json()
    const text = j.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return fallbackFindings(audit)
    return JSON.parse(jsonMatch[0])
  } catch (e) {
    console.error('Claude synthesis error:', e)
    return fallbackFindings(audit)
  }
}

function buildSynthesisPrompt(lead: any, audit: any, requestData: any): string {
  return `Si senior digital marketing konzultant. Pripravujes mini-audit pre potencionalneho klienta na zaklade VEREJNYCH dat z jeho webu a marketingovej infrastruktury.

KLIENT:
- Firma: ${lead.company_name || lead.domain}
- Domena: ${lead.domain}
- Odvetvie: ${lead.industry || 'neuvedene'}
- Mesto: ${lead.city || 'neuvedene'}
- Klientova priorita: ${requestData?.priority || 'neuvedena'}
- Klientova poznamka: ${requestData?.note || 'ziadna'}

ZOZBIERANE DATA:
${JSON.stringify(audit, null, 2)}

ULOHA:
Vygeneruj presne 3 KONKRETNE findings (zistenia) ktore:
- Vychadzaju z realnych dat (cituj cisla, scores, IDs)
- Su zamerane na klientovu prioritu
- Su actionable (klient vidi ze MA co rieshit)
- Pisane PROFESIONALNE, slovensky, bez "AI", "automaticky", "vygenerovane"
- Tom: ako keby ich pisal skuseny konzultant po hlbsom skuseni stranky

KAZDE FINDING ma ZAVAZNE tuto strukturu:
{
  "title": "Kratky vystihujuci nazov (max 80 znakov)",
  "severity": "high" | "medium" | "low",
  "what": "1-2 vety co sme zistili (s konkretnymi datami)",
  "why_it_matters": "1-2 vety preco je to dolezite (impact na biznis)",
  "evidence": ["zoznam konkretnych dotaznikov / metrik z auditu"],
  "recommendation": "1-2 vety co spravit (konkretne)",
  "estimated_impact": "Odhad impactu (napr. '+15-30% rychlost', 'okolo 200-400€/mes navyse na konverziach')"
}

VRAT len validny JSON, nic ine, presne v tomto tvare:
{
  "summary": "1-2 vety celkove zhrnutie stavu",
  "biggest_problem": "1 veta - co je najvacsi problem podla nas",
  "competitive_position": "1 veta - ako je na tom voci konkurencii (mozes hadat ak nemas data)",
  "findings": [
    { ...finding 1... },
    { ...finding 2... },
    { ...finding 3... }
  ],
  "next_step_recommendation": "Co odporucame ako prvy krok (1-2 vety)"
}`
}

function fallbackFindings(audit: any): any {
  const findings: any[] = []

  // Finding 1: Performance
  const ps = audit.pagespeed?.mobile
  if (ps) {
    findings.push({
      title: `Web na mobile dosahuje výkon ${ps.scores.performance}/100`,
      severity: ps.scores.performance < 50 ? 'high' : ps.scores.performance < 80 ? 'medium' : 'low',
      what: `Google PageSpeed Insights meranie ukázalo skóre výkonu ${ps.scores.performance}/100 na mobile, LCP ${ps.metrics.lcp || 'N/A'}.`,
      why_it_matters: 'Pomalý web znižuje konverzie a Google penalizuje pomalé stránky v rebríčkoch.',
      evidence: [`Performance: ${ps.scores.performance}/100`, `LCP: ${ps.metrics.lcp || 'N/A'}`, `CLS: ${ps.metrics.cls || 'N/A'}`],
      recommendation: 'Optimalizácia obrázkov, lazy loading, redukcia JS bundle.',
      estimated_impact: '+10-25 % konverzií pri zlepšení LCP pod 2.5s',
    })
  }

  // Finding 2: Tracking
  const tr = audit.html?.tracking
  if (tr) {
    const missing: string[] = []
    if (!tr.metaPixel) missing.push('Meta Pixel')
    if (!tr.googleAds) missing.push('Google Ads konverzný kód')
    if (!tr.googleAnalytics) missing.push('Google Analytics 4')
    if (missing.length) {
      findings.push({
        title: `Chýbajúce trackovacie nástroje: ${missing.join(', ')}`,
        severity: 'high',
        what: `Na webe sme nenašli ${missing.join(', ')}.`,
        why_it_matters: 'Bez týchto nástrojov nie je možné merať efektivitu reklamy ani retargetovať návštevníkov.',
        evidence: missing.map(m => `Nenašiel sa ${m}`),
        recommendation: 'Nasadiť chýbajúce pixely + nakonfigurovať konverzné udalosti.',
        estimated_impact: 'Bez trackingu = slepá streľba pri Meta/Google Ads',
      })
    }
  }

  // Finding 3: SEO basics
  const meta = audit.html?.meta
  if (meta) {
    const seoIssues: string[] = []
    if (!meta.description) seoIssues.push('Chýba meta description')
    else if (meta.descriptionLength > 160) seoIssues.push(`Meta description ${meta.descriptionLength} znakov (optimum 150-160)`)
    if (!meta.title) seoIssues.push('Chýba title tag')
    else if (meta.titleLength > 65) seoIssues.push(`Title ${meta.titleLength} znakov (optimum 50-60)`)
    if (!meta.h1) seoIssues.push('Chýba H1 nadpis')
    if (!meta.hasSchemaOrg) seoIssues.push('Chýba schema.org markup')
    if (seoIssues.length) {
      findings.push({
        title: `On-page SEO základy potrebujú úpravy`,
        severity: 'medium',
        what: seoIssues.join('. '),
        why_it_matters: 'Slabé on-page SEO znižuje organickú návštevnosť.',
        evidence: seoIssues,
        recommendation: 'Doplniť/skrátiť meta tagy, pridať schema.org pre Local Business.',
        estimated_impact: '+15-40 % organickej návštevnosti za 2-3 mesiace',
      })
    }
  }

  return {
    summary: 'Audit identifikoval niekoľko oblastí na zlepšenie.',
    biggest_problem: findings[0]?.title || 'Chýbajúce dáta na hlbšiu analýzu',
    competitive_position: 'Bez doplnkových dát neporovnateľné',
    findings: findings.slice(0, 3),
    next_step_recommendation: 'Začať trackingom (Meta Pixel + GA4) — bez neho nemerateľné.',
  }
}

// =====================================================
// 6. EMAIL — poslanie auditu cez Resend
// =====================================================

async function sendAuditEmail(lead: any): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    console.warn('No RESEND_API_KEY, skip email')
    return false
  }
  const fromRaw = Deno.env.get('RESEND_FROM') || 'Adlify <info@adlify.eu>'
  const company = lead.company_name || lead.domain
  const greeting = lead.contact_person ? `Pán ${lead.contact_person}` : 'Dobrý deň'
  const auditUrl = `${BASE_URL}/audit.html?t=${lead.audit_token}`

  const subject = `Váš mini-audit pre ${company} je hotový`
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F7F5F1;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#14120E;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F1;padding:32px 12px;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;border:1px solid #EAE6DE;overflow:hidden;">
      <tr><td style="padding:28px 32px 0;">
        <span style="display:inline-block;width:32px;height:32px;border-radius:8px;background:#F97316;color:#fff;font-weight:800;font-size:16px;line-height:32px;text-align:center;">A</span>
        <span style="display:inline-block;font-size:18px;font-weight:700;margin-left:10px;vertical-align:middle;">Adlify</span>
      </td></tr>
      <tr><td style="padding:24px 32px;">
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Audit je pripravený ✓</h1>
        <p style="margin:0 0 16px;font-size:16px;color:#3A352B;line-height:1.6;">${greeting},</p>
        <p style="margin:0 0 16px;font-size:16px;color:#3A352B;line-height:1.6;">podľa sľubu — váš mini-audit pre <strong>${company}</strong> je hotový.</p>
        <p style="margin:0 0 24px;font-size:16px;color:#3A352B;line-height:1.6;">Pozrel som sa na váš web, sociálne siete, aktuálne reklamy a porovnal vás s konkurenciou. V audite nájdete <strong>3 konkrétne body</strong> ktoré ovplyvňujú vašu výkonnosť.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td align="center">
          <a href="${auditUrl}" style="display:inline-block;background:#F97316;color:#fff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 32px;border-radius:12px;">Pozrieť audit →</a>
        </td></tr></table>
        <p style="margin:24px 0 4px;font-size:15px;color:#3A352B;">S pozdravom,</p>
        <p style="margin:0 0 4px;font-size:16px;font-weight:600;">Štefan Varga</p>
        <p style="margin:0;font-size:13px;color:#6F6758;">Adlify · <a href="mailto:info@adlify.eu" style="color:#F97316;text-decoration:none;">info@adlify.eu</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromRaw,
        to: lead.email,
        subject,
        html,
      }),
    })
    if (!r.ok) {
      const t = await r.text()
      console.error('Resend error:', r.status, t)
      return false
    }
    return true
  } catch (e) {
    console.error('Email send error:', e)
    return false
  }
}

// =====================================================
// MAIN HANDLER
// =====================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { audit_token } = await req.json()
    if (!audit_token) {
      return new Response(JSON.stringify({ error: 'audit_token required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Load lead
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('*')
      .eq('audit_token', audit_token)
      .single()

    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: 'Lead not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!lead.domain) {
      return new Response(JSON.stringify({ error: 'Lead has no domain' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const url = `https://${lead.domain}`
    console.log('Starting deep audit for:', lead.domain)

    // 2. Parallel data collection
    const seeds = [lead.industry, lead.company_name].filter(Boolean) as string[]
    const [pagespeedMobile, pagespeedDesktop, htmlData, domainAge, keywords] = await Promise.all([
      fetchPageSpeed(url, 'mobile'),
      fetchPageSpeed(url, 'desktop'),
      fetchAndParseHTML(lead.domain),
      fetchDomainAge(lead.domain),
      fetchKeywordOpportunities(seeds),
    ])

    const auditData = {
      collected_at: new Date().toISOString(),
      url,
      pagespeed: {
        mobile: pagespeedMobile,
        desktop: pagespeedDesktop,
      },
      html: htmlData,
      domain_age: domainAge,
      keywords: keywords,
      screenshot_url: `https://image.thum.io/get/width/1200/crop/800/${url}`,
    }

    // 3. Claude synthesis
    const findings = await synthesizeFindings(lead, auditData, lead.audit_request_data)

    // 4. Save
    const { error: updErr } = await supabase
      .from('leads')
      .update({
        audit_data: auditData,
        audit_findings: findings,
        audit_generated_at: new Date().toISOString(),
        audit_delivered_at: new Date().toISOString(),
        outreach_stage: 'audit_delivered',
      })
      .eq('id', lead.id)

    if (updErr) console.error('Update lead error:', updErr)

    // 5. Email
    const emailSent = lead.email ? await sendAuditEmail(lead) : false

    return new Response(JSON.stringify({
      success: true,
      audit_url: `${BASE_URL}/audit.html?t=${audit_token}`,
      findings_count: findings.findings?.length || 0,
      email_sent: emailSent,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('deep-audit fatal:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
