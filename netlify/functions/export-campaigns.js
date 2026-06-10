// Export schválených kampaní projektu do CSV pre Google Ads Editor a Meta
// Ads Manager. Admin si stiahne CSV → otvorí v Editori / Bulk Editori →
// nahrá do reálneho účtu. Polo-automatický push (bez Google Ads API push).
//
// GET /.netlify/functions/export-campaigns?project_id=<uuid>&format=google_editor
// GET /.netlify/functions/export-campaigns?project_id=<uuid>&format=meta_csv
//
// Google Ads Editor formát: jeden CSV obsahuje Campaign + Ad group + Keyword +
// Responsive Search Ad rows (rozlíšené stĺpcom "Row type" alias "Item type").
// Editor je tolerantný — chýbajúce stĺpce ignoruje, ale názvy stĺpcov musia
// matchovať. Viď https://support.google.com/google-ads/editor/answer/24036.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const cors = { 'Access-Control-Allow-Origin': '*' };

function csvEscape(val) {
  if (val == null) return '';
  const s = String(val);
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(values) {
  return values.map(csvEscape).join(',');
}

function googleCampaignType(t) {
  const map = {
    search: 'Search',
    display: 'Display',
    pmax: 'Performance Max',
    video: 'Video',
    shopping: 'Shopping',
    discovery: 'Demand Gen',
  };
  return map[String(t || '').toLowerCase()] || 'Search';
}

function metaObjective(t) {
  // Meta objective mapping (campaign_type → Meta CBO objective)
  const map = {
    traffic: 'OUTCOME_TRAFFIC',
    conversions: 'OUTCOME_SALES',
    awareness: 'OUTCOME_AWARENESS',
    leads: 'OUTCOME_LEADS',
    engagement: 'OUTCOME_ENGAGEMENT',
    video: 'OUTCOME_AWARENESS',
  };
  return map[String(t || '').toLowerCase()] || 'OUTCOME_TRAFFIC';
}

async function loadProjectData(projectId) {
  const { data: project } = await supabase
    .from('campaign_projects')
    .select('*, client:clients!client_id(id, company_name, company_website)')
    .eq('id', projectId)
    .single();
  if (!project) throw new Error('Project not found');

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at');
  if (!campaigns?.length) throw new Error('Žiadne kampane v projekte');

  const campaignIds = campaigns.map(c => c.id);
  const { data: adGroups } = await supabase
    .from('ad_groups')
    .select('*')
    .in('campaign_id', campaignIds);

  const adGroupIds = (adGroups || []).map(g => g.id);
  const { data: ads } = await supabase
    .from('ads')
    .select('*')
    .in('ad_group_id', adGroupIds);

  return { project, campaigns, adGroups: adGroups || [], ads: ads || [] };
}

function buildGoogleEditorCSV({ project, campaigns, adGroups, ads }) {
  // Google Ads Editor CSV — jeden súbor, všetky entity typy. Najdôležitejšie:
  // stĺpec "Campaign" musí byť vo všetkých riadkoch (kampaňou patrí entita).
  const headers = [
    'Campaign', 'Campaign Type', 'Campaign Daily Budget', 'Campaign Status', 'Networks', 'Languages', 'Bid Strategy Type',
    'Ad Group', 'Ad Group Status', 'Max CPC',
    'Keyword', 'Match Type', 'Keyword Status',
    'Ad Status', 'Ad Type', 'Final URL', 'Path 1', 'Path 2',
    ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`),
    ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`),
  ];
  const lines = [csvRow(headers)];

  const googleCampaigns = campaigns.filter(c => c.platform === 'google');

  for (const camp of googleCampaigns) {
    const campRow = {
      Campaign: camp.name,
      'Campaign Type': googleCampaignType(camp.campaign_type),
      'Campaign Daily Budget': camp.budget_daily || '',
      'Campaign Status': 'Paused',
      Networks: 'Google Search;Search Partners',
      Languages: 'Slovak;English',
      'Bid Strategy Type': 'Maximize Conversions',
    };
    lines.push(csvRow(headers.map(h => campRow[h] ?? '')));

    const groups = adGroups.filter(g => g.campaign_id === camp.id);
    for (const grp of groups) {
      const grpRow = {
        Campaign: camp.name,
        'Ad Group': grp.name,
        'Ad Group Status': 'Paused',
        'Max CPC': grp.max_cpc || '',
      };
      lines.push(csvRow(headers.map(h => grpRow[h] ?? '')));

      // Keywords
      const kws = Array.isArray(grp.keywords) ? grp.keywords : [];
      for (const kw of kws) {
        // Detect match type from formatting: "exact" v hranatých, "phrase" v úvodzovkách, inak broad
        let matchType = 'Broad';
        let kwClean = String(kw).trim();
        if (kwClean.startsWith('[') && kwClean.endsWith(']')) { matchType = 'Exact'; kwClean = kwClean.slice(1, -1); }
        else if (kwClean.startsWith('"') && kwClean.endsWith('"')) { matchType = 'Phrase'; kwClean = kwClean.slice(1, -1); }
        lines.push(csvRow(headers.map(h => {
          if (h === 'Campaign') return camp.name;
          if (h === 'Ad Group') return grp.name;
          if (h === 'Keyword') return kwClean;
          if (h === 'Match Type') return matchType;
          if (h === 'Keyword Status') return 'Paused';
          return '';
        })));
      }

      // Negative keywords ako 'Negative Broad' v Editori — pridáme s prefixom v Keyword stĺpci
      const negs = Array.isArray(grp.negative_keywords) ? grp.negative_keywords : [];
      for (const neg of negs) {
        lines.push(csvRow(headers.map(h => {
          if (h === 'Campaign') return camp.name;
          if (h === 'Ad Group') return grp.name;
          if (h === 'Keyword') return `-${neg}`;
          if (h === 'Match Type') return 'Negative Broad';
          if (h === 'Keyword Status') return 'Paused';
          return '';
        })));
      }

      // Ads (responsive search)
      const adRows = ads.filter(a => a.ad_group_id === grp.id);
      for (const ad of adRows) {
        const adRow = {
          Campaign: camp.name,
          'Ad Group': grp.name,
          'Ad Status': 'Paused',
          'Ad Type': 'Responsive search ad',
          'Final URL': ad.final_url || project.client?.company_website || '',
          'Path 1': ad.path1 || '',
          'Path 2': ad.path2 || '',
        };
        const headlines = Array.isArray(ad.headlines) ? ad.headlines : [];
        const descriptions = Array.isArray(ad.descriptions) ? ad.descriptions : [];
        for (let i = 0; i < 15; i++) adRow[`Headline ${i + 1}`] = (headlines[i] || '').slice(0, 30);
        for (let i = 0; i < 4; i++) adRow[`Description ${i + 1}`] = (descriptions[i] || '').slice(0, 90);
        lines.push(csvRow(headers.map(h => adRow[h] ?? '')));
      }
    }
  }

  return lines.join('\n');
}

function buildMetaCSV({ project, campaigns, adGroups, ads }) {
  // Meta Ads Manager Bulk Import — zjednodušený formát (Meta odporúča XLSX,
  // ale CSV s týmito stĺpcami akceptuje cez "Import Multiple Ads" flow).
  const headers = [
    'Campaign Name', 'Campaign Objective', 'Campaign Status', 'Daily Budget',
    'Ad Set Name', 'Ad Set Daily Budget', 'Ad Set Status',
    'Locations', 'Age Min', 'Age Max', 'Gender', 'Interests',
    'Ad Name', 'Ad Status', 'Ad Creative Type',
    'Primary Text', 'Headline', 'Description', 'Call to Action', 'Website URL',
    'Image URL', 'Image Aspect Ratio', 'Image Prompt (notes)',
  ];
  const lines = [csvRow(headers)];

  const metaCampaigns = campaigns.filter(c => c.platform === 'meta');

  for (const camp of metaCampaigns) {
    const groups = adGroups.filter(g => g.campaign_id === camp.id);
    const targeting = camp.targeting || {};
    for (const grp of groups) {
      const adRows = ads.filter(a => a.ad_group_id === grp.id);
      for (const ad of adRows) {
        const row = {
          'Campaign Name': camp.name,
          'Campaign Objective': metaObjective(camp.campaign_type),
          'Campaign Status': 'PAUSED',
          'Daily Budget': camp.budget_daily || '',
          'Ad Set Name': grp.name,
          'Ad Set Daily Budget': '',
          'Ad Set Status': 'PAUSED',
          Locations: (targeting.locations || ['Slovakia']).join(';'),
          'Age Min': targeting.age_from || 18,
          'Age Max': targeting.age_to || 65,
          Gender: targeting.gender || 'all',
          Interests: (targeting.interests || []).join(';'),
          'Ad Name': `${grp.name} — ${(ad.headlines?.[0] || 'ad').slice(0, 30)}`,
          'Ad Status': 'PAUSED',
          'Ad Creative Type': 'SINGLE_IMAGE',
          'Primary Text': (ad.descriptions?.[0] || '').slice(0, 125),
          Headline: (ad.headlines?.[0] || '').slice(0, 40),
          Description: (ad.descriptions?.[1] || '').slice(0, 30),
          'Call to Action': ad.call_to_action || 'LEARN_MORE',
          'Website URL': ad.final_url || project.client?.company_website || '',
          'Image URL': ad.image_url || '',
          'Image Aspect Ratio': ad.image_aspect_ratio || '1:1',
          'Image Prompt (notes)': ad.image_prompt || '',
        };
        lines.push(csvRow(headers.map(h => row[h] ?? '')));
      }
    }
  }

  return lines.join('\n');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const q = event.queryStringParameters || {};
  const projectId = q.project_id;
  const format = q.format || 'google_editor';
  if (!projectId) return { statusCode: 400, headers: cors, body: 'Missing project_id' };

  try {
    const data = await loadProjectData(projectId);
    let csv = '';
    let filename = '';
    const slug = (data.project.client?.company_name || 'kampane').replace(/[^a-z0-9]/gi, '-').toLowerCase();

    if (format === 'google_editor') {
      csv = buildGoogleEditorCSV(data);
      filename = `${slug}-google-ads-editor.csv`;
    } else if (format === 'meta_csv') {
      csv = buildMetaCSV(data);
      filename = `${slug}-meta-bulk.csv`;
    } else {
      return { statusCode: 400, headers: cors, body: 'Unsupported format. Use google_editor or meta_csv' };
    }

    // BOM aby Excel/Google Sheets správne čítal UTF-8 (slovenské znaky)
    const body = '﻿' + csv;

    return {
      statusCode: 200,
      headers: {
        ...cors,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
      body,
    };
  } catch (err) {
    console.error('[export-campaigns] error:', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
