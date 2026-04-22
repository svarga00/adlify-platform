// FinStat.sk autocomplete / detail lookup.
// POST { query, mode?: 'autocomplete' | 'detail', ico? }
//
// Vyžaduje FINSTAT_API_KEY + FINSTAT_STATION_ID env.
// Dokumentácia: https://www.finstat.sk/api/documentation

const FS_BASE = 'https://api.finstat.sk/api/v2';

exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const apiKey = process.env.FINSTAT_API_KEY;
  const station = process.env.FINSTAT_STATION_ID;
  if (!apiKey) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'FINSTAT_API_KEY missing v Netlify env.' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: cors, body: 'Bad JSON' }; }

  const { query = '', ico = '', mode = 'autocomplete' } = payload;

  try {
    const auth = 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64');
    let url;
    if (mode === 'detail' && ico) {
      url = `${FS_BASE}/detail?ico=${encodeURIComponent(ico)}&Json=1${station ? '&StationId=' + encodeURIComponent(station) : ''}`;
    } else {
      // Autocomplete — search podľa názvu firmy
      url = `${FS_BASE}/autocomplete?query=${encodeURIComponent(query)}&Json=1${station ? '&StationId=' + encodeURIComponent(station) : ''}`;
    }

    const r = await fetch(url, { headers: { Authorization: auth, Accept: 'application/json' } });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); }
    catch { data = { raw: text.slice(0, 1000) }; }

    if (!r.ok) {
      return { statusCode: r.status, headers: cors, body: JSON.stringify({ error: 'FinStat API: ' + r.status, data }) };
    }

    // Normalizuj výstup
    const results = Array.isArray(data) ? data : (data.results || data.Items || []);
    const prospects = results.map(row => ({
      company_name: row.Name || row.name || row.Nazov || '',
      ico: String(row.Ico || row.ico || row.IcoString || '').replace(/\s/g, ''),
      domain: (row.Web || row.web || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''),
      industry: row.SkNaceText || row.ActivityTypeName || row.ActivityText || '',
      city: row.Address?.City || row.City || '',
      phone: row.Phones?.[0] || row.Phone || '',
      email: row.Emails?.[0] || row.Email || '',
      source: 'finstat',
    }));

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospects, count: prospects.length }),
    };
  } catch (err) {
    console.error('[lead-finder-finstat]', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
