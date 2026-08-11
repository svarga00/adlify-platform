// Weekly report generator — scheduled každý pondelok 7:00.
// Pre každého klienta s aktívnymi kampaňami:
//   1. Agreguje metriky za posledných 7 dní z campaign_metrics_daily
//   2. Spočíta delta vs. predošlých 7 dní
//   3. Pošle Claude do AI promptu → vyhodnotenie + plán na ďalší týždeň
//   4. Uloží report do tabuľky reports
//   5. Pošle email klientovi s linkom do portálu (záložka Reporty)
//
// Manuálne spustenie pre konkrétneho klienta:
//   POST { client_id: '<uuid>' }
// Bez body → spustí pre všetkých eligible klientov.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const BASE_URL = process.env.URL || 'https://adlify.eu';
const cors = { 'Access-Control-Allow-Origin': '*' };

function dateString(daysAgo = 0) {
  return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
}

function fmtMoney(n) {
  return new Intl.NumberFormat('sk-SK', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) + ' €';
}

function fmtNum(n) {
  return new Intl.NumberFormat('sk-SK').format(Math.round(n || 0));
}

function pct(curr, prev) {
  if (!prev || prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

// Agreguj metriky z campaign_metrics_daily za rozsah dátumov
async function aggregateMetrics(clientId, fromDate, toDate) {
  const { data } = await supabase
    .from('campaign_metrics_daily')
    .select('campaign_id, impressions, clicks, cost, conversions, source')
    .eq('client_id', clientId)
    .gte('snapshot_date', fromDate)
    .lte('snapshot_date', toDate);

  const totals = { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
  const perCampaign = new Map();
  for (const r of (data || [])) {
    totals.impressions += Number(r.impressions || 0);
    totals.clicks += Number(r.clicks || 0);
    totals.cost += Number(r.cost || 0);
    totals.conversions += Number(r.conversions || 0);
    const c = perCampaign.get(r.campaign_id) || { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
    c.impressions += Number(r.impressions || 0);
    c.clicks += Number(r.clicks || 0);
    c.cost += Number(r.cost || 0);
    c.conversions += Number(r.conversions || 0);
    perCampaign.set(r.campaign_id, c);
  }
  totals.ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
  totals.cpa = totals.conversions > 0 ? totals.cost / totals.conversions : 0;
  return { totals, perCampaign };
}

async function generateAIInsights(client, current, previous, campaignNames) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { summary: null, wins: [], issues: [], next_week_plan: [] };

  const deltaConv = pct(current.totals.conversions, previous.totals.conversions);
  const deltaCost = pct(current.totals.cost, previous.totals.cost);
  const deltaCpa = previous.totals.cpa > 0
    ? Math.round(((current.totals.cpa - previous.totals.cpa) / previous.totals.cpa) * 100)
    : 0;

  // Per-campaign breakdown text pre prompt
  const campLines = [];
  for (const [cid, m] of current.perCampaign) {
    const prev = previous.perCampaign.get(cid) || { conversions: 0, cost: 0 };
    const name = campaignNames.get(cid) || cid;
    campLines.push(`- ${name}: ${m.conversions} konv (predtým ${prev.conversions}), náklady ${fmtMoney(m.cost)} (predtým ${fmtMoney(prev.cost)}), CPA ${m.conversions > 0 ? fmtMoney(m.cost / m.conversions) : '—'}`);
  }

  const prompt = `Si performance marketing analyst pre slovenskú agentúru Adlify. Píšeš týždenný report pre klienta ${client.company_name || ''} (odvetvie: ${client.industry || 'neuvedené'}).

DÁTA TENTO TÝŽDEŇ vs. PREDOŠLÝ TÝŽDEŇ:
- Konverzie: ${current.totals.conversions} (delta ${deltaConv >= 0 ? '+' : ''}${deltaConv}%)
- Náklady: ${fmtMoney(current.totals.cost)} (delta ${deltaCost >= 0 ? '+' : ''}${deltaCost}%)
- Kliknutia: ${fmtNum(current.totals.clicks)} (predtým ${fmtNum(previous.totals.clicks)})
- CTR: ${(current.totals.ctr * 100).toFixed(2)}%
- CPA: ${current.totals.cpa > 0 ? fmtMoney(current.totals.cpa) : '—'} (delta ${deltaCpa >= 0 ? '+' : ''}${deltaCpa}%)

Per kampaň:
${campLines.join('\n') || '(žiadne kampane s metrikami)'}

ÚLOHA: Napíš stručný profesionálny report v slovenčine. Vykáme. Vráť LEN JSON v tvare:
{
  "summary": "2-3 vety o celkovom výkone, bez floskúl",
  "wins": ["max 3 konkrétne víťazstvá s číslami"],
  "issues": ["max 2 problémy ktoré treba riešiť, ak žiadne nie sú tak prázdne []"],
  "next_week_plan": ["3-4 konkrétne akcie čo robíme ďalší týždeň — testovať X, optimalizovať Y..."]
}

Pravidlá: žiadny markdown, žiadne emoji, žiadne self-promo. Ak dáta nedávajú zmysel (všetky nuly), summary = "Tento týždeň sme zbierali dáta — výsledky budú vidieť od ďalšieho týždňa." a wins/issues prázdne.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
    // Parse JSON (tolerant — môže byť obalený)
    let parsed;
    try { parsed = JSON.parse(text); }
    catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }
    return parsed || { summary: null, wins: [], issues: [], next_week_plan: [] };
  } catch (e) {
    console.error('[weekly-reports] AI failed:', e);
    return { summary: null, wins: [], issues: [], next_week_plan: [] };
  }
}

function buildEmailHTML(client, current, previous, insights, fromDate, toDate) {
  const deltaConv = pct(current.totals.conversions, previous.totals.conversions);
  const deltaCost = pct(current.totals.cost, previous.totals.cost);
  const arrow = (delta) => delta > 0 ? `<span style="color:#16a34a;">▲ ${delta}%</span>`
                       : delta < 0 ? `<span style="color:#dc2626;">▼ ${Math.abs(delta)}%</span>`
                       : `<span style="color:#6b7280;">—</span>`;
  const fmtDate = (s) => new Date(s).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' });

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Týždenný report</title></head>
<body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f7f5f1;margin:0;padding:24px;color:#1f2937;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
  <div style="background:linear-gradient(135deg,#FF6B35,#E91E63);padding:24px;color:#fff;">
    <div style="font-size:11px;opacity:0.9;text-transform:uppercase;letter-spacing:0.5px;">Týždenný report · ${fmtDate(fromDate)} – ${fmtDate(toDate)}</div>
    <div style="font-size:22px;font-weight:700;margin-top:4px;">${client.company_name || 'Klient'}</div>
  </div>
  <div style="padding:24px;">
    ${insights.summary ? `<p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#374151;">${insights.summary}</p>` : ''}

    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr>
        <td style="padding:12px;background:#f9fafb;border-radius:8px;width:50%;">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Konverzie</div>
          <div style="font-size:24px;font-weight:700;color:#FF6B35;">${fmtNum(current.totals.conversions)}</div>
          <div style="font-size:12px;">vs. minulý týždeň ${arrow(deltaConv)}</div>
        </td>
        <td style="width:8px;"></td>
        <td style="padding:12px;background:#f9fafb;border-radius:8px;width:50%;">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Náklady</div>
          <div style="font-size:24px;font-weight:700;color:#1f2937;">${fmtMoney(current.totals.cost)}</div>
          <div style="font-size:12px;">vs. minulý týždeň ${arrow(deltaCost)}</div>
        </td>
      </tr>
      <tr><td colspan="3" style="height:8px;"></td></tr>
      <tr>
        <td style="padding:12px;background:#f9fafb;border-radius:8px;">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">CPA</div>
          <div style="font-size:18px;font-weight:600;">${current.totals.cpa > 0 ? fmtMoney(current.totals.cpa) : '—'}</div>
        </td>
        <td style="width:8px;"></td>
        <td style="padding:12px;background:#f9fafb;border-radius:8px;">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">CTR</div>
          <div style="font-size:18px;font-weight:600;">${(current.totals.ctr * 100).toFixed(2)}%</div>
        </td>
      </tr>
    </table>

    ${insights.wins?.length ? `
      <div style="margin-bottom:20px;">
        <div style="font-size:13px;font-weight:600;color:#16a34a;margin-bottom:8px;">Čo sa darilo</div>
        <ul style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:1.7;">
          ${insights.wins.map(w => `<li>${w}</li>`).join('')}
        </ul>
      </div>
    ` : ''}

    ${insights.issues?.length ? `
      <div style="margin-bottom:20px;">
        <div style="font-size:13px;font-weight:600;color:#dc2626;margin-bottom:8px;">Na čo sa zameriame</div>
        <ul style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:1.7;">
          ${insights.issues.map(w => `<li>${w}</li>`).join('')}
        </ul>
      </div>
    ` : ''}

    ${insights.next_week_plan?.length ? `
      <div style="margin-bottom:24px;padding:14px;background:#fff7ed;border-left:3px solid #FF6B35;border-radius:6px;">
        <div style="font-size:13px;font-weight:600;color:#9a3412;margin-bottom:8px;">Plán na ďalší týždeň</div>
        <ul style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:1.7;">
          ${insights.next_week_plan.map(w => `<li>${w}</li>`).join('')}
        </ul>
      </div>
    ` : ''}

    <a href="${BASE_URL}/portal/#reports"
       style="display:inline-block;background:#FF6B35;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
      Otvoriť detail v portále →
    </a>
  </div>
  <div style="padding:16px 24px;background:#f9fafb;font-size:11px;color:#6b7280;text-align:center;">
    Adlify · ${new Date().getFullYear()} · <a href="${BASE_URL}" style="color:#FF6B35;text-decoration:none;">adlify.eu</a>
  </div>
</div>
</body></html>`;
}

async function processClient(client) {
  const fromDate = dateString(7);
  const toDate = dateString(1);  // včera (dnes ešte nemá complete data)
  const prevFromDate = dateString(14);
  const prevToDate = dateString(8);

  const [current, previous] = await Promise.all([
    aggregateMetrics(client.id, fromDate, toDate),
    aggregateMetrics(client.id, prevFromDate, prevToDate),
  ]);

  // Skip ak týždeň nemá žiadne dáta (klient ešte nemá aktívne kampane)
  if (current.totals.impressions === 0 && current.totals.cost === 0) {
    console.log(`[weekly-reports] skip ${client.id} — no data this week`);
    return { skipped: true };
  }

  // Získaj názvy kampaní
  const campaignIds = Array.from(current.perCampaign.keys());
  const campaignNames = new Map();
  if (campaignIds.length > 0) {
    const { data: camps } = await supabase
      .from('campaigns').select('id, name').in('id', campaignIds);
    for (const c of (camps || [])) campaignNames.set(c.id, c.name);
  }

  const insights = await generateAIInsights(client, current, previous, campaignNames);

  // Ulož report do DB
  const reportRow = {
    client_id: client.id,
    title: `Týždenný report · ${fromDate} – ${toDate}`,
    period_start: fromDate,
    period_end: toDate,
    highlights: {
      totals: current.totals,
      previous_totals: previous.totals,
      insights,
      generated_at: new Date().toISOString(),
      generator: 'weekly-reports-generator',
    },
  };
  const { data: savedReport } = await supabase.from('reports').insert(reportRow).select('id').single();

  // Email klientovi (best-effort, ak má email)
  const emailHtml = buildEmailHTML(client, current, previous, insights, fromDate, toDate);
  if (client.email) {
    try {
      await fetch(`${BASE_URL}/.netlify/functions/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: client.email,
          subject: `Týždenný report · ${client.company_name || 'Vaše kampane'}`,
          htmlBody: emailHtml,
          textBody: `${insights.summary || 'Týždenný report z vašich kampaní.'}\n\nKonverzie: ${current.totals.conversions}\nNáklady: ${fmtMoney(current.totals.cost)}\n\nDetail: ${BASE_URL}/portal/#reports`,
          clientId: client.id,
        }),
      });
    } catch (e) {
      console.error('[weekly-reports] email failed for', client.id, e.message);
    }
  }

  return { sent: !!client.email, report_id: savedReport?.id };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch {}
  }

  try {
    let clients = [];
    if (body.client_id) {
      const { data } = await supabase
        .from('clients').select('id, company_name, email, industry')
        .eq('id', body.client_id).single();
      if (data) clients = [data];
    } else {
      // Všetci aktívni klienti s aspoň jednou bežiacou kampaňou (deduplikované)
      const { data: campRows } = await supabase
        .from('campaigns')
        .select('client_id')
        .in('status', ['active', 'paused'])
        .not('client_id', 'is', null);
      const clientIds = [...new Set((campRows || []).map(r => r.client_id))];
      if (clientIds.length > 0) {
        const { data } = await supabase
          .from('clients').select('id, company_name, email, industry')
          .in('id', clientIds);
        clients = data || [];
      }
    }

    const results = [];
    for (const c of clients) {
      try {
        const r = await processClient(c);
        results.push({ client_id: c.id, ...r });
      } catch (e) {
        console.error('[weekly-reports] failed for', c.id, e);
        results.push({ client_id: c.id, error: e.message });
      }
    }

    console.log('[weekly-reports] done:', JSON.stringify({ count: clients.length, results }));
    return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ processed: clients.length, results }) };
  } catch (err) {
    console.error('[weekly-reports] fatal:', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};

// Pondelok 7:00 UTC (= 8:00 SK letný čas / 9:00 zimný)
exports.config = { schedule: '0 7 * * 1' };
