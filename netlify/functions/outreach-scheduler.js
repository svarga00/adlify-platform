// netlify/functions/outreach-scheduler.js
//
// Scheduled function — beží každú hodinu. Pre každú aktívnu kampaň
// s enrolled prospektmi, ktorí majú next_send_at <= NOW, pošle
// nasledujúci krok. Po odoslaní posunie current_step a vypočíta
// next_send_at podľa delay_days ďalšieho kroku. Ak nie je ďalší krok,
// označí enrollment ako completed.
//
// Bezpečnostné stop podmienky:
//   - stop_on_reply + outreach_email_replied_at → stopped
//   - stop_on_audit_request + audit_requested_at → stopped
//   - prospect.outreach_stage IN ('bounced','unsubscribed','converted','lost') → stopped

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const BASE_URL = process.env.URL || 'https://adlify.eu';
const MAX_BATCH = 100;

async function renderEmailFromTemplate(templateSlug, prospect) {
  // 1. Načítať šablónu
  const { data: tpl } = await supabase
    .from('email_templates')
    .select('subject, plain_text, body_text, html_content, body_html')
    .eq('slug', templateSlug)
    .eq('is_active', true)
    .maybeSingle();
  if (!tpl) throw new Error(`Template ${templateSlug} not found or inactive`);

  // 2. Settings pre brand
  const { data: settings } = await supabase.from('settings').select('key, value');
  const s = {};
  (settings || []).forEach(r => {
    try { s[r.key] = JSON.parse(r.value); } catch { s[r.key] = r.value; }
  });

  // 3. Premenné
  const company = prospect.company_name || prospect.domain || '';
  const industryHook = _industryHook(prospect.industry, prospect.city);
  const vars = {
    greeting: prospect.contact_person ? `Pán ${prospect.contact_person}` : 'Dobrý deň',
    contact_name: prospect.contact_person || '',
    company,
    domain: prospect.domain || '',
    industry: prospect.industry || '',
    industry_hook: industryHook ? ` — ${industryHook}` : '',
    city: prospect.city || '',
    audit_token: prospect.audit_token || '',
    audit_request_url: prospect.audit_token ? `${BASE_URL}/audit-request.html?t=${prospect.audit_token}` : '',
    audit_url: prospect.audit_token ? `${BASE_URL}/audit.html?t=${prospect.audit_token}` : '',
    sender_name: s.sender_name || 'Štefan Varga',
    sender_title: s.sender_title || s.company_name || 'Adlify',
  };

  const subject = _substitute(tpl.subject, vars);
  const text = _substitute(tpl.plain_text || tpl.body_text || '', vars);
  const rawHtml = tpl.html_content || tpl.body_html;
  let html;
  if (rawHtml) {
    html = _substitute(rawHtml, vars);
  } else {
    html = _buildHtml(subject, text, prospect.audit_token, s);
  }
  // Link rewrite — všetky http(s) linky cez track-click
  if (prospect.audit_token) {
    html = _rewriteLinks(html, prospect.audit_token, s.email_unsubscribe_url);
  }
  return { subject, html, text };
}

function _substitute(str, vars) {
  return String(str || '').replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi, (_, k) => vars[k] ?? '');
}

function _industryHook(industry, city) {
  if (!industry) return '';
  const ind = String(industry).toLowerCase();
  const cityPart = city ? ` v meste ${city}` : '';
  const map = [
    ['gastro','gastronomická prevádzka'], ['reštau','reštaurácia'], ['kavi','kaviareň'],
    ['fitness','fitness centrum'], ['kader','kaderníctvo'], ['kozmet','kozmetické štúdio'],
    ['stomat','stomatologická ambulancia'], ['zub','stomatológia'], ['real','realitná kancelária'],
    ['eshop','e-shop'], ['hotel','hotel'], ['servis','autoservis'], ['it','IT firma'],
  ];
  for (const [k, l] of map) if (ind.includes(k)) return `${l}${cityPart}`;
  return `firma${cityPart}`;
}

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function _buildHtml(subject, text, auditToken, s) {
  const primary = s.brand_primary_color || '#F97316';
  const brandName = s.company_name || 'Adlify';
  const logoUrl = s.brand_logo_url || '';
  const website = s.email_website || 'adlify.eu';
  const email = s.email_contact || 'info@adlify.eu';
  const phone = s.email_phone || '';
  const address = s.email_company_address || '';
  const unsubscribeUrl = s.email_unsubscribe_url || (auditToken ? `${BASE_URL}/unsubscribe.html?t=${auditToken}` : '');
  const trackPixel = auditToken ? `${BASE_URL}/.netlify/functions/track-open?audit=${auditToken}` : '';

  const paragraphs = String(text || '').split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const body = paragraphs.map(p => {
    const cta = p.match(/^\[\[(.+?)\|(.+?)\]\]$/s);
    if (cta) {
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px 0 22px;">
        <a href="${_esc(cta[2].trim())}" style="display:inline-block;background:${primary};color:#fff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 32px;border-radius:12px;">${_esc(cta[1].trim())}</a>
      </td></tr></table>`;
    }
    const lines = p.split(/\n/).map(l => _esc(l)).join('<br>');
    const withInline = lines.replace(/\[\[(.+?)\|(.+?)\]\]/g, (_, l, u) =>
      `<a href="${_esc(u)}" style="display:inline-block;background:${primary};color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:600;">${_esc(l)}</a>`
    );
    return `<p style="margin:0 0 16px;font-size:16px;color:#3A352B;line-height:1.65;">${withInline}</p>`;
  }).join('');

  const logo = logoUrl
    ? `<img src="${_esc(logoUrl)}" alt="${_esc(brandName)}" style="max-height:40px;max-width:200px;display:block;border:0;">`
    : `<span style="display:inline-block;width:36px;height:36px;border-radius:9px;background:${primary};color:#fff;font-weight:800;font-size:18px;line-height:36px;text-align:center;">${_esc(brandName.charAt(0).toUpperCase())}</span>
       <span style="display:inline-block;font-size:19px;font-weight:700;color:#14120E;margin-left:10px;vertical-align:middle;">${_esc(brandName)}</span>`;

  const footerLines = [
    `${_esc(brandName)}${website ? ` · <a href="https://${_esc(website)}" style="color:#948B7C;">${_esc(website)}</a>` : ''}`,
    `${email ? `<a href="mailto:${_esc(email)}" style="color:#948B7C;">${_esc(email)}</a>` : ''}${phone ? ` · ${_esc(phone)}` : ''}`,
    address ? _esc(address) : '',
  ].filter(Boolean);

  return `<!DOCTYPE html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${_esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F7F5F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F1;padding:32px 12px;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;border:1px solid #EAE6DE;overflow:hidden;">
      <tr><td style="padding:28px 32px 16px;">${logo}</td></tr>
      <tr><td style="padding:0 32px 8px;">${body}</td></tr>
      <tr><td style="padding:20px 32px 24px;background:#F7F5F1;border-top:1px solid #EAE6DE;">
        ${footerLines.map(l => `<p style="margin:0 0 6px;font-size:11px;color:#948B7C;text-align:center;">${l}</p>`).join('')}
        ${unsubscribeUrl ? `<p style="margin:8px 0 0;font-size:11px;color:#948B7C;text-align:center;"><a href="${_esc(unsubscribeUrl)}" style="color:#948B7C;">Odhlásiť z odberu</a></p>` : ''}
      </td></tr>
    </table>
    ${trackPixel ? `<img src="${trackPixel}" width="1" height="1" alt="" style="display:block;border:0;">` : ''}
  </td></tr></table>
</body></html>`;
}

function _rewriteLinks(html, auditToken, unsubscribeUrl) {
  return String(html).replace(/href="(https?:\/\/[^"]+)"/gi, (m, url) => {
    if (unsubscribeUrl && url === unsubscribeUrl) return m;
    if (url.includes('/.netlify/functions/track-click')) return m;
    return `href="${BASE_URL}/.netlify/functions/track-click?audit=${encodeURIComponent(auditToken)}&to=${encodeURIComponent(url)}"`;
  });
}

async function sendEmail(to, subject, html, text) {
  const res = await fetch(`${BASE_URL}/.netlify/functions/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, htmlBody: html, textBody: text }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`send-email ${res.status}: ${t}`);
  }
}

async function processOneEnrollment(enrollment, campaign, steps, prospect) {
  // 1. Stop check
  if (campaign.stop_on_reply && prospect.outreach_email_replied_at) {
    await supabase.from('outreach_campaign_enrollments').update({
      status: 'stopped', stop_reason: 'replied',
    }).eq('id', enrollment.id);
    return { sent: false, stopped: true, reason: 'replied' };
  }
  if (campaign.stop_on_audit_request && prospect.audit_requested_at) {
    await supabase.from('outreach_campaign_enrollments').update({
      status: 'stopped', stop_reason: 'audit_requested',
    }).eq('id', enrollment.id);
    return { sent: false, stopped: true, reason: 'audit_requested' };
  }
  if (['bounced','unsubscribed','converted','lost'].includes(prospect.outreach_stage)) {
    await supabase.from('outreach_campaign_enrollments').update({
      status: 'stopped', stop_reason: prospect.outreach_stage,
    }).eq('id', enrollment.id);
    return { sent: false, stopped: true, reason: prospect.outreach_stage };
  }

  // 2. Určiť ďalší krok
  const nextStepOrder = (enrollment.current_step || 0) + 1;
  const step = steps.find(s => s.step_order === nextStepOrder);
  if (!step) {
    await supabase.from('outreach_campaign_enrollments').update({
      status: 'completed', completed_at: new Date().toISOString(),
    }).eq('id', enrollment.id);
    return { sent: false, completed: true };
  }

  // 3. Gate: send_if_stage_in
  if (step.send_if_stage_in?.length && !step.send_if_stage_in.includes(prospect.outreach_stage || 'pending')) {
    // preskoč tento krok, posuň na ďalší hneď
    await supabase.from('outreach_campaign_enrollments').update({
      current_step: nextStepOrder,
      next_send_at: new Date().toISOString(), // spracuj hneď v ďalšom runu
    }).eq('id', enrollment.id);
    return { sent: false, skipped: true, reason: 'stage_gate' };
  }

  if (!prospect.email) {
    await supabase.from('outreach_campaign_enrollments').update({
      status: 'stopped', stop_reason: 'no_email',
    }).eq('id', enrollment.id);
    return { sent: false, stopped: true, reason: 'no_email' };
  }

  // 4. Pošli email
  try {
    const email = await renderEmailFromTemplate(step.template_slug, prospect);
    await sendEmail(prospect.email, email.subject, email.html, email.text);
  } catch (err) {
    console.error('[scheduler] send failed:', err.message);
    return { sent: false, error: err.message };
  }

  // 5. Aktualizuj prospect + enrollment
  const now = new Date();
  const prospectPatch = {
    outreach_last_contacted_at: now.toISOString(),
  };
  if (nextStepOrder === 1) {
    prospectPatch.outreach_email_sent_at = now.toISOString();
    prospectPatch.outreach_stage = 'email_sent';
  }
  await supabase.from('prospects').update(prospectPatch).eq('id', prospect.id);

  // Určiť kedy bude ďalší krok
  const futureStep = steps.find(s => s.step_order === nextStepOrder + 1);
  let enrollPatch;
  if (futureStep) {
    const delayMs = (futureStep.delay_days || 0) * 24 * 60 * 60 * 1000;
    enrollPatch = {
      current_step: nextStepOrder,
      last_sent_at: now.toISOString(),
      next_send_at: new Date(now.getTime() + delayMs).toISOString(),
    };
  } else {
    enrollPatch = {
      current_step: nextStepOrder,
      last_sent_at: now.toISOString(),
      status: 'completed',
      completed_at: now.toISOString(),
      next_send_at: null,
    };
  }
  await supabase.from('outreach_campaign_enrollments').update(enrollPatch).eq('id', enrollment.id);

  return { sent: true, step: nextStepOrder };
}

exports.handler = async () => {
  const started = Date.now();
  const summary = { processed: 0, sent: 0, stopped: 0, skipped: 0, errors: 0 };

  try {
    // Načítaj splatné enrollments + ich kampane/kroky
    const { data: enrollments, error } = await supabase
      .from('outreach_campaign_enrollments')
      .select(`
        id, campaign_id, prospect_id, current_step, status, next_send_at,
        campaign:outreach_campaigns!inner(id, name, status, stop_on_reply, stop_on_audit_request,
          steps:outreach_campaign_steps(id, step_order, delay_days, template_slug, send_if_stage_in)
        ),
        prospect:prospects!inner(id, email, company_name, domain, contact_person, industry, city,
          audit_token, outreach_stage, outreach_email_sent_at, outreach_email_replied_at,
          audit_requested_at, outreach_email_opened_at, outreach_email_open_count
        )
      `)
      .eq('status', 'active')
      .lte('next_send_at', new Date().toISOString())
      .limit(MAX_BATCH);
    if (error) throw error;

    for (const e of (enrollments || [])) {
      if (e.campaign?.status !== 'active') continue;
      summary.processed++;
      const result = await processOneEnrollment(e, e.campaign, e.campaign.steps || [], e.prospect);
      if (result.sent) summary.sent++;
      else if (result.stopped) summary.stopped++;
      else if (result.skipped) summary.skipped++;
      else if (result.error) summary.errors++;
    }
  } catch (err) {
    console.error('[scheduler] fatal:', err);
    summary.fatal = err.message;
  }

  summary.duration_ms = Date.now() - started;
  console.log('[outreach-scheduler]', JSON.stringify(summary));
  return { statusCode: 200, body: JSON.stringify(summary) };
};

// Netlify scheduled config — beží každú hodinu (na minútu :05)
exports.config = {
  schedule: '5 * * * *',
};
