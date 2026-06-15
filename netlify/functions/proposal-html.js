// Premium HTML návrh kampane — pre admina (review pred odoslaním) aj klienta
// (PDF stiahnutie). Vrátený HTML je optimalizovaný pre tlač do PDF cez browser
// (Cmd+P → Save as PDF) — bez interaktívnych elementov, jasné page breaks,
// embedded brand styling.
//
// GET /.netlify/functions/proposal-html?project_id=<uuid>
//   alebo
// GET /.netlify/functions/proposal-html?token=<client_portal_token>
//   (pre klienta — bez auth, len ten kto má token)
//
// Response: text/html so štýlmi inline, otvorí sa v browseri, klient klikne
// Print → uloží PDF.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const esc = (s) => {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
};

const fmtMoney = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('sk-SK', { maximumFractionDigits: 0 }).format(Math.round(num)) + ' €';
};

const fmtNum = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('sk-SK').format(Math.round(num));
};

const fmtDate = (d) => {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return d; }
};

async function loadProject(query) {
  // Project podľa id alebo client_portal_token
  let q = supabase.from('campaign_projects').select('*');
  if (query.project_id) q = q.eq('id', query.project_id);
  else if (query.token) q = q.eq('client_portal_token', query.token);
  else throw new Error('Chýba project_id alebo token');

  const { data: project } = await q.maybeSingle();
  if (!project) throw new Error('Projekt nenájdený');

  let client = null;
  if (project.client_id) {
    const { data } = await supabase.from('clients')
      .select('id, company_name, contact_person, email, website, industry')
      .eq('id', project.client_id).maybeSingle();
    client = data;
  }

  const { data: campaigns } = await supabase.from('campaigns')
    .select('*').eq('project_id', project.id).order('platform').order('created_at');

  const campaignIds = (campaigns || []).map(c => c.id);
  const { data: adGroups } = campaignIds.length
    ? await supabase.from('ad_groups').select('*').in('campaign_id', campaignIds).order('created_at')
    : { data: [] };

  const groupIds = (adGroups || []).map(g => g.id);
  const { data: ads } = groupIds.length
    ? await supabase.from('ads').select('*').in('ad_group_id', groupIds).order('created_at')
    : { data: [] };

  // Mapuj hierarchiu
  const adsByGroup = new Map();
  for (const ad of (ads || [])) {
    if (!adsByGroup.has(ad.ad_group_id)) adsByGroup.set(ad.ad_group_id, []);
    adsByGroup.get(ad.ad_group_id).push(ad);
  }
  const groupsByCampaign = new Map();
  for (const g of (adGroups || [])) {
    g.ads = adsByGroup.get(g.id) || [];
    if (!groupsByCampaign.has(g.campaign_id)) groupsByCampaign.set(g.campaign_id, []);
    groupsByCampaign.get(g.campaign_id).push(g);
  }
  for (const c of (campaigns || [])) {
    c.ad_groups = groupsByCampaign.get(c.id) || [];
  }

  return { project, client, campaigns: campaigns || [] };
}

function renderHTML({ project, client, campaigns }) {
  const totalAds = campaigns.reduce((s, c) => s + (c.ad_groups || []).reduce((s2, g) => s2 + (g.ads?.length || 0), 0), 0);
  const totalBudget = campaigns.reduce((s, c) => s + (Number(c.budget_daily) || 0) * 30, 0);
  const ba = project.business_analysis || {};
  const ri = project.research_data?.insights || {};
  const bb = project.budget_breakdown || {};
  const er = project.expected_results || {};
  const tl = project.timeline || {};
  const ns = project.next_steps || {};

  const platformLabel = (p) => p === 'google' ? 'Google Ads' : p === 'meta' ? 'Meta (Facebook + Instagram)' : p;

  return `<!DOCTYPE html>
<html lang="sk">
<head>
<meta charset="UTF-8">
<title>Návrh kampane · ${esc(client?.company_name || project.name)} · Adlify</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  @media print {
    .no-print { display: none !important; }
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
    color: #14120e;
    background: #f7f5f1;
    line-height: 1.55;
    font-size: 12pt;
  }
  .page {
    max-width: 800px;
    margin: 24px auto;
    background: #fff;
    padding: 48px 56px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    page-break-after: always;
  }
  .page:last-child { page-break-after: auto; }
  @media print {
    body { background: white; }
    .page { margin: 0; box-shadow: none; padding: 0; max-width: 100%; }
  }

  /* Toolbar — len pre browser, schované v PDF */
  .toolbar {
    position: sticky; top: 0; z-index: 10;
    background: #14120e; color: white; padding: 12px 24px;
    display: flex; align-items: center; justify-content: space-between;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }
  .toolbar h2 { font-size: 13px; font-weight: 600; }
  .toolbar button {
    background: #FF6B35; color: white; border: none;
    padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px;
    cursor: pointer;
  }
  .toolbar button:hover { background: #E55A2A; }

  /* COVER */
  .cover {
    min-height: 65vh;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 56px 0 24px;
  }
  .cover .brand { font-size: 18pt; font-weight: 700; letter-spacing: -0.02em; color: #FF6B35; }
  .cover .brand-sub { font-size: 9pt; color: #948b7c; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px; }
  .cover .title-section { flex: 1; display: flex; flex-direction: column; justify-content: center; }
  .cover .eyebrow { font-size: 10pt; color: #948b7c; letter-spacing: 2px; text-transform: uppercase; font-weight: 600; margin-bottom: 16px; }
  .cover h1 { font-size: 32pt; font-weight: 700; letter-spacing: -0.025em; line-height: 1.1; margin-bottom: 14px; color: #14120e; }
  .cover .client-name { font-size: 18pt; color: #6b7280; font-weight: 500; }
  .cover .meta-line { display: flex; gap: 24px; font-size: 10pt; color: #6b7280; padding-top: 24px; border-top: 1px solid #eae6de; }
  .cover .meta-line strong { color: #14120e; font-weight: 600; }

  /* Sekcie */
  section { margin-bottom: 32px; }
  section + section { padding-top: 12px; }
  h2.section-title {
    font-size: 9pt; font-weight: 700; color: #FF6B35;
    letter-spacing: 3px; text-transform: uppercase;
    margin-bottom: 6px;
  }
  h3.section-heading {
    font-size: 18pt; font-weight: 700; color: #14120e;
    letter-spacing: -0.015em; line-height: 1.2;
    margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid #eae6de;
  }
  h4 { font-size: 11pt; font-weight: 600; color: #14120e; margin-bottom: 8px; margin-top: 18px; }

  p { font-size: 11pt; line-height: 1.65; color: #374151; margin-bottom: 10px; }
  p strong { color: #14120e; }
  p.lead { font-size: 13pt; line-height: 1.55; color: #14120e; font-weight: 500; }
  ul, ol { padding-left: 0; list-style: none; }
  ul li, ol li {
    font-size: 11pt; line-height: 1.6; color: #374151;
    padding: 6px 0 6px 22px; position: relative;
  }
  ul li::before {
    content: ''; position: absolute; left: 6px; top: 13px;
    width: 5px; height: 5px; border-radius: 50%; background: #FF6B35;
  }

  /* KPI grid */
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 20px 0; }
  .kpi {
    background: #fafaf8; border: 1px solid #eae6de; border-radius: 12px;
    padding: 16px 14px;
  }
  .kpi-label { font-size: 8.5pt; color: #948b7c; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 600; margin-bottom: 6px; }
  .kpi-value { font-size: 18pt; font-weight: 700; color: #14120e; letter-spacing: -0.02em; }

  /* Two col layout */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
  .card {
    background: #fafaf8; border: 1px solid #eae6de; border-radius: 12px;
    padding: 18px;
  }
  .card.outline { background: white; border-color: #d4cebe; }
  .card-eyebrow { font-size: 8pt; color: #948b7c; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-bottom: 8px; }

  /* Tags / chips */
  .chip {
    display: inline-block; background: #f7f5f1; color: #14120e; padding: 4px 12px;
    border-radius: 9999px; font-size: 9.5pt; font-weight: 500;
    margin: 2px; border: 1px solid #eae6de;
  }

  /* Campaign block */
  .campaign-block {
    border: 1px solid #eae6de; border-radius: 14px; overflow: hidden;
    margin-bottom: 16px; page-break-inside: avoid;
  }
  .campaign-header {
    background: #14120e; color: white; padding: 14px 20px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .campaign-platform-badge {
    background: rgba(255,107,53,0.2); color: #FF6B35;
    padding: 3px 10px; border-radius: 9999px; font-size: 8.5pt; font-weight: 700;
    letter-spacing: 0.5px; text-transform: uppercase;
  }
  .campaign-name { font-size: 13pt; font-weight: 700; }
  .campaign-body { padding: 20px; }
  .campaign-meta { display: flex; gap: 24px; flex-wrap: wrap; font-size: 9.5pt; color: #6b7280; margin-bottom: 14px; }
  .campaign-meta strong { color: #14120e; }
  .campaign-rationale { background: #fafaf8; padding: 12px 14px; border-radius: 8px; border-left: 3px solid #FF6B35; font-size: 10.5pt; font-style: italic; color: #4b5563; margin-bottom: 16px; }

  /* Ad group */
  .ad-group { border-top: 1px dashed #eae6de; padding: 14px 0 8px; margin-top: 12px; }
  .ad-group-name { font-size: 10pt; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .ad-group-keywords { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px; }

  /* Ad preview */
  .ad-preview {
    background: white; border: 1px solid #eae6de; border-radius: 10px;
    padding: 14px; margin-bottom: 10px; page-break-inside: avoid;
  }
  .ad-headlines { font-size: 11pt; line-height: 1.4; color: #1a0dab; font-weight: 500; margin-bottom: 4px; }
  .ad-url { font-size: 9pt; color: #006621; margin-bottom: 6px; }
  .ad-desc { font-size: 9.5pt; color: #4b5563; line-height: 1.4; }
  .ad-cta { display: inline-block; margin-top: 8px; padding: 4px 10px; background: #FF6B35; color: white; border-radius: 6px; font-size: 9pt; font-weight: 600; }
  .ad-image-prompt {
    margin-top: 10px; padding: 10px 12px;
    background: #faf5ff; border: 1px solid #ede9fe; border-radius: 8px;
    font-family: monospace; font-size: 8.5pt; color: #581c87;
    white-space: pre-wrap; line-height: 1.4;
  }
  .ad-image { max-width: 200px; max-height: 200px; border-radius: 8px; margin-top: 10px; border: 1px solid #eae6de; }

  /* Timeline */
  .timeline-phase {
    display: grid; grid-template-columns: 120px 1fr; gap: 16px;
    padding: 12px 0; border-bottom: 1px solid #f0ebe2;
  }
  .timeline-phase:last-child { border-bottom: none; }
  .timeline-duration { font-size: 9.5pt; color: #FF6B35; font-weight: 700; padding-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
  .timeline-name { font-size: 11pt; font-weight: 600; color: #14120e; margin-bottom: 4px; }
  .timeline-activities { font-size: 10pt; color: #6b7280; }
  .timeline-activities li { padding: 2px 0 2px 18px; font-size: 10pt; }
  .timeline-activities li::before { top: 10px; }

  /* Budget table */
  .budget-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 10.5pt; }
  .budget-table th { text-align: left; padding: 10px 12px; background: #fafaf8; border-bottom: 2px solid #eae6de; font-size: 9pt; color: #948b7c; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; }
  .budget-table td { padding: 12px; border-bottom: 1px solid #f0ebe2; }
  .budget-table .amount { text-align: right; font-weight: 600; color: #14120e; }
  .budget-table tr.total td { background: #fafaf8; border-top: 2px solid #14120e; border-bottom: 2px solid #14120e; font-weight: 700; font-size: 11pt; }

  /* Expected results trio */
  .results-trio { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 18px 0; }
  .result-period {
    background: #fafaf8; border: 1px solid #eae6de; border-radius: 12px;
    padding: 16px 18px; page-break-inside: avoid;
  }
  .result-period h5 { font-size: 9pt; color: #FF6B35; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 700; margin-bottom: 12px; }
  .result-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 10pt; color: #6b7280; }
  .result-row strong { color: #14120e; font-weight: 600; }

  /* Footer */
  .footer {
    margin-top: 40px; padding-top: 18px; border-top: 1px solid #eae6de;
    display: flex; justify-content: space-between; font-size: 9pt; color: #948b7c;
  }
  .footer .brand-small { font-weight: 700; color: #FF6B35; }

  /* Next steps grid */
  .next-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 16px 0; }

  /* Semantic blocks */
  .block-insights { background: #fafaf8; border-left: 3px solid #FF6B35; padding: 14px 18px; border-radius: 0 8px 8px 0; }
  .block-opportunities { background: #fafaf8; border-left: 3px solid #84cc16; padding: 14px 18px; border-radius: 0 8px 8px 0; }
  .block-challenges { background: #fafaf8; border-left: 3px solid #f59e0b; padding: 14px 18px; border-radius: 0 8px 8px 0; }
</style>
</head>
<body>

<!-- Browser toolbar (skryté pri tlači) -->
<div class="toolbar no-print">
  <h2>📄 Návrh kampane · ${esc(client?.company_name || project.name)}</h2>
  <button onclick="window.print()">🖨️ Stiahnuť PDF</button>
</div>

<!-- ───── COVER PAGE ───── -->
<div class="page">
  <div class="cover">
    <div>
      <div class="brand">Adlify</div>
      <div class="brand-sub">Marketingová stratégia</div>
    </div>
    <div class="title-section">
      <div class="eyebrow">Návrh kampane pre</div>
      <h1>${esc(client?.company_name || project.name)}</h1>
      <div class="client-name">${esc(project.name || '')}</div>
    </div>
    <div class="meta-line">
      <div><strong>Pripravené:</strong> ${fmtDate(project.created_at)}</div>
      ${client?.industry ? `<div><strong>Odvetvie:</strong> ${esc(client.industry)}</div>` : ''}
      ${client?.website ? `<div><strong>Web:</strong> ${esc(client.website)}</div>` : ''}
      <div><strong>Verzia:</strong> ${project.proposal_version || 1}</div>
    </div>
  </div>
</div>

<!-- ───── EXECUTIVE SUMMARY ───── -->
${project.strategy_summary ? `
<div class="page">
  <section>
    <h2 class="section-title">01 · Stratégia</h2>
    <h3 class="section-heading">Náš prístup pre ${esc(client?.company_name || 'vás')}</h3>
    <div style="white-space: pre-line;">
      <p class="lead">${esc(project.strategy_summary)}</p>
    </div>
  </section>

  <!-- KPI summary -->
  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-label">Kampaní</div>
      <div class="kpi-value">${campaigns.length}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Reklám</div>
      <div class="kpi-value">${totalAds}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Rozpočet/mes</div>
      <div class="kpi-value">${fmtMoney(totalBudget)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Predp. ROAS</div>
      <div class="kpi-value">${er.day_90?.roas != null ? er.day_90.roas + 'x' : '—'}</div>
    </div>
  </div>
</div>
` : ''}

<!-- ───── BUSINESS ANALYSIS ───── -->
${(ba.summary || ba.key_insights?.length || ba.opportunities?.length || ba.challenges?.length) ? `
<div class="page">
  <section>
    <h2 class="section-title">02 · Analýza biznisu</h2>
    <h3 class="section-heading">Kto ste a kde sú príležitosti</h3>
    ${ba.summary ? `<p class="lead">${esc(ba.summary)}</p>` : ''}

    ${ba.key_insights?.length ? `
    <h4>Kľúčové zistenia</h4>
    <div class="block-insights">
      <ul>${ba.key_insights.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
    </div>
    ` : ''}

    <div class="two-col">
      ${ba.opportunities?.length ? `
        <div>
          <h4>Príležitosti</h4>
          <div class="block-opportunities">
            <ul>${ba.opportunities.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
          </div>
        </div>
      ` : ''}
      ${ba.challenges?.length ? `
        <div>
          <h4>Výzvy na cestu</h4>
          <div class="block-challenges">
            <ul>${ba.challenges.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
          </div>
        </div>
      ` : ''}
    </div>
  </section>
</div>
` : ''}

<!-- ───── RESEARCH INSIGHTS ───── -->
${(ri.market_analysis || ri.competitor_analysis || ri.keyword_strategy || ri.recommended_approach) ? `
<div class="page">
  <section>
    <h2 class="section-title">03 · Prieskum trhu</h2>
    <h3 class="section-heading">Čo hovoria dáta a konkurencia</h3>
    ${ri.market_analysis ? `<h4>Trh a dopyt</h4><p>${esc(ri.market_analysis)}</p>` : ''}
    ${ri.competitor_analysis ? `<h4>Konkurencia</h4><p>${esc(ri.competitor_analysis)}</p>` : ''}
    ${ri.keyword_strategy ? `<h4>Kľúčové slová</h4><p>${esc(ri.keyword_strategy)}</p>` : ''}
    ${ri.recommended_approach ? `
      <h4>Odporúčaný prístup</h4>
      <div class="card outline">
        <p>${esc(ri.recommended_approach)}</p>
      </div>
    ` : ''}
  </section>
</div>
` : ''}

<!-- ───── KAMPANE ───── -->
<div class="page">
  <section>
    <h2 class="section-title">04 · Kampane</h2>
    <h3 class="section-heading">${campaigns.length} kampaní · ${totalAds} reklám</h3>

    ${campaigns.map(c => `
      <div class="campaign-block">
        <div class="campaign-header">
          <div>
            <div class="campaign-name">${esc(c.name)}</div>
          </div>
          <div class="campaign-platform-badge">${esc(platformLabel(c.platform))}</div>
        </div>
        <div class="campaign-body">
          <div class="campaign-meta">
            <div><strong>Typ:</strong> ${esc(c.campaign_type || '—')}</div>
            <div><strong>Cieľ:</strong> ${esc(c.objective || '—')}</div>
            <div><strong>Denný budget:</strong> ${fmtMoney(c.budget_daily)}</div>
            ${c.targeting?.locations?.length ? `<div><strong>Lokality:</strong> ${esc(c.targeting.locations.join(', '))}</div>` : ''}
          </div>
          ${c.metrics?.rationale ? `<div class="campaign-rationale">${esc(c.metrics.rationale)}</div>` : ''}

          ${(c.ad_groups || []).map(g => `
            <div class="ad-group">
              <div class="ad-group-name">📁 ${esc(g.name)}</div>
              ${g.keywords?.length ? `
                <div class="ad-group-keywords">
                  ${g.keywords.slice(0, 15).map(k => `<span class="chip">${esc(k)}</span>`).join('')}
                </div>
              ` : ''}

              ${(g.ads || []).map(ad => `
                <div class="ad-preview">
                  ${ad.headlines?.length ? `<div class="ad-headlines">${ad.headlines.slice(0, 3).map(h => esc(h)).join(' · ')}</div>` : ''}
                  ${ad.final_url ? `<div class="ad-url">${esc(ad.final_url)}${ad.path1 ? '/' + esc(ad.path1) : ''}${ad.path2 ? '/' + esc(ad.path2) : ''}</div>` : ''}
                  ${ad.descriptions?.[0] ? `<div class="ad-desc">${esc(ad.descriptions[0])}</div>` : ''}
                  ${ad.call_to_action ? `<div class="ad-cta">${esc(ad.call_to_action)}</div>` : ''}
                  ${ad.image_url ? `<img src="${esc(ad.image_url)}" class="ad-image" alt="">` : ad.image_prompt ? `<div class="ad-image-prompt"><strong>Image:</strong> ${esc(ad.image_prompt.slice(0, 220))}${ad.image_prompt.length > 220 ? '…' : ''}</div>` : ''}
                </div>
              `).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  </section>
</div>

<!-- ───── BUDGET BREAKDOWN ───── -->
${bb.total_monthly || bb.by_platform?.length ? `
<div class="page">
  <section>
    <h2 class="section-title">05 · Rozpočet</h2>
    <h3 class="section-heading">Ako rozdelíme ${fmtMoney(bb.total_monthly || totalBudget)} mesačne</h3>

    ${bb.reasoning ? `<p class="lead">${esc(bb.reasoning)}</p>` : ''}

    ${bb.by_platform?.length ? `
      <h4>Rozdelenie podľa platformy</h4>
      <table class="budget-table">
        <thead>
          <tr><th>Platforma</th><th>Mesačne</th><th>Podiel</th><th>Zdôvodnenie</th></tr>
        </thead>
        <tbody>
          ${bb.by_platform.map(p => `
            <tr>
              <td><strong>${esc(platformLabel(p.platform))}</strong></td>
              <td class="amount">${fmtMoney(p.monthly)}</td>
              <td class="amount">${p.percentage || 0}%</td>
              <td>${esc(p.reasoning || '—')}</td>
            </tr>
          `).join('')}
          <tr class="total">
            <td>Spolu</td>
            <td class="amount">${fmtMoney(bb.total_monthly || totalBudget)}</td>
            <td class="amount">100%</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    ` : ''}
  </section>
</div>
` : ''}

<!-- ───── EXPECTED RESULTS ───── -->
${(er.day_30 || er.day_90 || er.day_180) ? `
<div class="page">
  <section>
    <h2 class="section-title">06 · Očakávané výsledky</h2>
    <h3 class="section-heading">Čo predpokladáme po nasadení</h3>

    <div class="results-trio">
      ${['day_30', 'day_90', 'day_180'].map(key => {
        const r = er[key]; if (!r) return '';
        const label = { day_30: 'Po 30 dňoch', day_90: 'Po 90 dňoch', day_180: 'Po 180 dňoch' }[key];
        return `
          <div class="result-period">
            <h5>${label}</h5>
            ${r.impressions != null ? `<div class="result-row"><span>Zobrazenia</span><strong>${fmtNum(r.impressions)}</strong></div>` : ''}
            ${r.clicks != null ? `<div class="result-row"><span>Kliky</span><strong>${fmtNum(r.clicks)}</strong></div>` : ''}
            ${r.conversions != null ? `<div class="result-row"><span>Konverzie</span><strong>${fmtNum(r.conversions)}</strong></div>` : ''}
            ${r.cpa != null ? `<div class="result-row"><span>CPA</span><strong>${fmtMoney(r.cpa)}</strong></div>` : ''}
            ${r.roas != null ? `<div class="result-row"><span>ROAS</span><strong>${r.roas}×</strong></div>` : ''}
            ${r.note ? `<p style="font-size:9pt; color:#948b7c; margin-top:10px; font-style:italic;">${esc(r.note)}</p>` : ''}
          </div>
        `;
      }).join('')}
    </div>

    ${er.notes ? `<div class="card outline" style="margin-top:18px;"><p>${esc(er.notes)}</p></div>` : ''}
  </section>
</div>
` : ''}

<!-- ───── TIMELINE ───── -->
${tl.phases?.length ? `
<div class="page">
  <section>
    <h2 class="section-title">07 · Časový plán</h2>
    <h3 class="section-heading">Ako budeme postupovať</h3>

    ${tl.phases.map(p => `
      <div class="timeline-phase">
        <div class="timeline-duration">${p.duration_days} dní</div>
        <div>
          <div class="timeline-name">${esc(p.name)}</div>
          ${p.activities?.length ? `<ul class="timeline-activities">${p.activities.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
        </div>
      </div>
    `).join('')}
  </section>
</div>
` : ''}

<!-- ───── NEXT STEPS ───── -->
${(ns.client_needs_to_provide?.length || ns.our_next_actions?.length || ns.launch_readiness?.length) ? `
<div class="page">
  <section>
    <h2 class="section-title">08 · Ďalšie kroky</h2>
    <h3 class="section-heading">Čo nás čaká pred spustením</h3>

    <div class="next-grid">
      ${ns.client_needs_to_provide?.length ? `
        <div class="card">
          <div class="card-eyebrow">Potrebujeme od vás</div>
          <ul>${ns.client_needs_to_provide.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
        </div>
      ` : ''}
      ${ns.our_next_actions?.length ? `
        <div class="card">
          <div class="card-eyebrow">My spravíme</div>
          <ul>${ns.our_next_actions.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
        </div>
      ` : ''}
      ${ns.launch_readiness?.length ? `
        <div class="card">
          <div class="card-eyebrow">Pred spustením</div>
          <ul>${ns.launch_readiness.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
        </div>
      ` : ''}
    </div>

    <div class="footer">
      <div><span class="brand-small">Adlify</span> · marketingová agentúra</div>
      <div>${fmtDate(project.created_at)} · v${project.proposal_version || 1}</div>
    </div>
  </section>
</div>
` : ''}

<script>
  // Po načítaní ihneď ponúkni tlač ak ?print=1
  if (new URLSearchParams(location.search).get('print') === '1') {
    window.addEventListener('load', () => setTimeout(() => window.print(), 400));
  }
</script>

</body>
</html>`;
}

exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const query = event.queryStringParameters || {};
    const data = await loadProject(query);
    const html = renderHTML(data);
    return {
      statusCode: 200,
      headers: {
        ...cors,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
      body: html,
    };
  } catch (err) {
    console.error('[proposal-html] error:', err);
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'text/html' },
      body: `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center;">
        <h1>⚠️ Chyba</h1><p>${esc(err.message)}</p></body></html>`,
    };
  }
};
