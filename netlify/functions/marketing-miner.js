/**
 * ADLIFY - Marketing Miner API Proxy
 * Bezpečné API volania cez server (API kľúč nie je na frontende)
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase klient
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// MM API Base URL
const MM_API_BASE = 'https://profilers-api.marketingminer.com';

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers, 
      body: JSON.stringify({ error: 'Method not allowed' }) 
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { action, params } = body;

    // Získať API kľúč z DB (settings tabuľka)
    const apiKey = await getApiKey();
    
    if (!apiKey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Marketing Miner API kľúč nie je nakonfigurovaný. Nastavte ho v Admin → Integrácie.' 
        })
      };
    }

    let result;

    switch (action) {
      case 'keywords_suggestions':
        result = await getKeywordsSuggestions(apiKey, params);
        break;
        
      case 'search_volume':
        result = await getSearchVolume(apiKey, params);
        break;
        
      case 'domain_stats':
        result = await getDomainStats(apiKey, params);
        break;
        
      case 'test_connection':
        result = await testConnection(apiKey);
        break;
        
      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Unknown action: ' + action })
        };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data: result })
    };

  } catch (error) {
    console.error('Marketing Miner API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error' 
      })
    };
  }
};

/**
 * Získať API kľúč z settings tabuľky
 */
async function getApiKey() {
  // Najprv skúsime env variable (pre produkciu)
  if (process.env.MARKETING_MINER_API_KEY) {
    return process.env.MARKETING_MINER_API_KEY;
  }
  
  // Potom z DB
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'integration_marketing_miner')
    .single();

  if (error || !data?.value) {
    return null;
  }

  try {
    const config = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return config.credentials?.api_key || null;
  } catch {
    return null;
  }
}

/**
 * Test pripojenia k MM API
 */
async function testConnection(apiKey) {
  const url = `${MM_API_BASE}/keywords/suggestions?lang=sk&keyword=test&api_token=${apiKey}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MM API error: ${response.status} - ${text}`);
  }
  
  const data = await response.json();
  
  // MM API môže vrátiť rôzne formáty - ošetríme všetky
  let keywords = [];
  
  if (Array.isArray(data)) {
    keywords = data;
  } else if (data && typeof data === 'object') {
    // Skúsiť nájsť pole v odpovedi
    if (Array.isArray(data.data)) {
      keywords = data.data;
    } else if (Array.isArray(data.keywords)) {
      keywords = data.keywords;
    } else if (Array.isArray(data.results)) {
      keywords = data.results;
    } else if (Array.isArray(data.items)) {
      keywords = data.items;
    }
  }
  
  return { 
    connected: true, 
    message: 'Pripojenie úspešné',
    sample: keywords.slice(0, 2) // Ukážka prvých 2 výsledkov
  };
}

/**
 * Získať návrhy kľúčových slov
 * @param {string} apiKey 
 * @param {object} params - { keyword, lang }
 */
async function getKeywordsSuggestions(apiKey, params) {
  const { keyword, lang = 'sk' } = params;
  
  if (!keyword) {
    throw new Error('Parameter "keyword" je povinný');
  }

  const url = `${MM_API_BASE}/keywords/suggestions?lang=${lang}&keyword=${encodeURIComponent(keyword)}&api_token=${apiKey}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MM API error: ${response.status} - ${text}`);
  }
  
  const data = await response.json();
  
  // MM API môže vrátiť rôzne formáty
  let keywords = [];
  
  if (Array.isArray(data)) {
    keywords = data;
  } else if (data && typeof data === 'object') {
    if (Array.isArray(data.data)) {
      keywords = data.data;
    } else if (Array.isArray(data.keywords)) {
      keywords = data.keywords;
    } else if (Array.isArray(data.results)) {
      keywords = data.results;
    } else if (Array.isArray(data.items)) {
      keywords = data.items;
    }
  }
  
  // Transformovať dáta do nášho formátu
  return keywords.map(item => ({
    keyword: item.keyword || item.term || item.query || '',
    searchVolume: item.search_volume || item.searchVolume || item.volume || 0,
    cpc: item.cpc || item.avg_cpc || 0,
    difficulty: item.difficulty || item.competition || item.kd || 0,
    yoyChange: item.yoy_change || item.yoyChange || null,
    trend: item.trend || null
  }));
}

/**
 * Získať search volume pre konkrétne keywords
 * @param {string} apiKey 
 * @param {object} params - { keywords: string[], lang }
 */
async function getSearchVolume(apiKey, params) {
  const { keywords, lang = 'sk' } = params;
  
  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    throw new Error('Parameter "keywords" musí byť neprázdne pole');
  }

  // MM API podporuje viacero keywords v jednom requeste
  const keywordParams = keywords.map(k => `keyword=${encodeURIComponent(k)}`).join('&');
  const url = `${MM_API_BASE}/keywords/search-volume-data?lang=${lang}&${keywordParams}&api_token=${apiKey}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MM API error: ${response.status} - ${text}`);
  }
  
  const data = await response.json();
  
  // MM API môže vrátiť rôzne formáty
  let keywordsData = [];
  
  if (Array.isArray(data)) {
    keywordsData = data;
  } else if (data && typeof data === 'object') {
    if (Array.isArray(data.data)) {
      keywordsData = data.data;
    } else if (Array.isArray(data.keywords)) {
      keywordsData = data.keywords;
    } else if (Array.isArray(data.results)) {
      keywordsData = data.results;
    }
  }
  
  return keywordsData.map(item => ({
    keyword: item.keyword || item.term || '',
    searchVolume: item.search_volume || item.searchVolume || 0,
    cpc: item.cpc || 0,
    difficulty: item.difficulty || 0,
    trend: item.trend || null
  }));
}

/**
 * Získať štatistiky domény
 * @param {string} apiKey 
 * @param {object} params - { domain, lang, type }
 */
async function getDomainStats(apiKey, params) {
  const { domain, lang = 'sk', type = 'domain' } = params;
  
  if (!domain) {
    throw new Error('Parameter "domain" je povinný');
  }

  // Očistiť doménu
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  
  const url = `${MM_API_BASE}/websites/stats?lang=${lang}&target=${encodeURIComponent(cleanDomain)}&type=${type}&api_token=${apiKey}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MM API error: ${response.status} - ${text}`);
  }
  
  const rawData = await response.json();
  
  // MM API môže vrátiť dáta v rôznych formátoch
  const data = rawData?.data || rawData || {};
  
  // Získať top keywords - môžu byť v rôznych formátoch
  let topKeywords = [];
  if (Array.isArray(data.top_keywords)) {
    topKeywords = data.top_keywords;
  } else if (Array.isArray(data.topKeywords)) {
    topKeywords = data.topKeywords;
  } else if (Array.isArray(data.keywords)) {
    topKeywords = data.keywords;
  }
  
  return {
    domain: cleanDomain,
    visibility: data.visibility || data.organic_visibility || 0,
    estimatedTraffic: data.estimated_traffic || data.estimatedTraffic || data.traffic || 0,
    keywords: data.keywords_count || data.keywords || data.organic_keywords || 0,
    topKeywords: topKeywords.slice(0, 10).map(kw => ({
      keyword: kw.keyword || kw.term || kw.query || '',
      position: kw.position || kw.rank || 0,
      searchVolume: kw.search_volume || kw.searchVolume || kw.volume || 0
    })),
    organicShare: data.organic_share || 0,
    paidShare: data.paid_share || 0
  };
}
