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
const MAX_BATCH = 200;

// ─── COLD OUTREACH SENDING WINDOWS ────────────────────────────────────
// SK timezone (Europe/Bratislava). Cold mail posielame LEN cez pracovné
// hodiny — mimo neho push next_send_at do najbližšieho okna. Mimo okna
// nepostavíme proti spam filtrom (príjemca to nečíta v noci, a "noc"
// posielanie = lacný spam pattern).
const SEND_HOUR_START = 8;   // 08:00 SK
const SEND_HOUR_END   = 18;  // 18:00 SK (posledné odoslanie pred 18:00)
const SKIP_WEEKENDS   = true;

// Per-mail random jitter aby všetky maily neišli presne v rovnaký čas
// (cron beží :05 → bez jitter-u všetko 13:05, 14:05... = predikovateľné).
const JITTER_MAX_SEC  = 540;  // 0-9 minút random offset

// Vráti najbližší prípustný čas odoslania ≥ given Date. Ak vstup je
// uprostred pracovných hodín, vráti ten istý čas. Inak posunie na 8:00
// najbližšieho pracovného dňa.
function nextSendingWindow(d) {
  // Konverzia do SK timezone — JS Date je UTC, použijeme manuálny offset.
  // SK = UTC+1 (winter) / +2 (summer DST). Pre cron-relevant precision
  // si nemusíme drviť DST — používame Intl.DateTimeFormat pre presný hour/day.
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Bratislava',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
    hour12: false,
  }).formatToParts(d);
  const hour = parseInt(fmt.find(p => p.type === 'hour').value, 10);
  const wd = fmt.find(p => p.type === 'weekday').value; // Mon, Tue, ..., Sun
  const isWeekend = wd === 'Sat' || wd === 'Sun';

  // Ak sme v pracovných hodinách a nie je víkend → OK
  if (!isWeekend && hour >= SEND_HOUR_START && hour < SEND_HOUR_END) return d;

  // Inak posuň na najbližší pracovný deň 8:00 SK
  // Najjednoduchšie: prirátaj hodiny dopredu kým nepadne do okna
  let next = new Date(d.getTime());
  for (let i = 0; i < 96; i++) { // max 4 dni dopredu
    next = new Date(next.getTime() + 30 * 60 * 1000); // +30 min iter
    const p = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Bratislava',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
    }).formatToParts(next);
    const h = parseInt(p.find(x => x.type === 'hour').value, 10);
    const m = parseInt(p.find(x => x.type === 'minute').value, 10);
    const w = p.find(x => x.type === 'weekday').value;
    const weekend = w === 'Sat' || w === 'Sun';
    if (!SKIP_WEEKENDS) {
      if (h >= SEND_HOUR_START && h < SEND_HOUR_END) return next;
    } else {
      if (!weekend && h >= SEND_HOUR_START && h < SEND_HOUR_END) return next;
    }
    // Skok cez celé dni keď sme v noci/víkende — efektívnejšie
    if (h < SEND_HOUR_START || h >= SEND_HOUR_END || weekend) {
      // Posuň na 8:00 ďalšieho dňa (UTC približne — fine pre cold mail)
      const tomorrow = new Date(next.getTime() + 24 * 60 * 60 * 1000);
      tomorrow.setUTCHours(7, 0, 0, 0); // 8:00 SK letný čas = 6:00 UTC, zimný = 7:00. Stred ~7:00 UTC.
      next = tomorrow;
    }
  }
  return next;
}

function applyJitter(d) {
  const offsetMs = Math.floor(Math.random() * JITTER_MAX_SEC * 1000);
  return new Date(d.getTime() + offsetMs);
}

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

  // Enrichment-based personalizácia (z Outscraper → prospect.analysis)
  const an = (prospect.analysis && typeof prospect.analysis === 'object') ? prospect.analysis : {};
  // Kontaktné meno: prospect.contact_person ALEBO analysis.full_name z webcrawlu
  const contactName = prospect.contact_person || an.full_name || '';
  const firstName = (contactName || '').trim().split(/\s+/)[0] || '';
  // Reviews hook — len ak má 20+ recenzií s ratingom 4+
  const reviewsHook = (an.reviews >= 20 && an.rating >= 4.0)
    ? `Všimol som si že máte ${an.reviews} recenzií Google s ratingom ${an.rating}★ — pekná stopa.`
    : '';
  // Tracking hook — "už používate" alebo "ešte nemáte"
  const trackingHook = (an.has_gtm || an.has_fb_pixel)
    ? `Vidím že máte ${[an.has_gtm ? 'GTM' : '', an.has_fb_pixel ? 'FB Pixel' : ''].filter(Boolean).join(' + ')} nasadený — postavíme na tom.`
    : '';
  // Lokácia hook
  const cityHook = prospect.city ? ` ${prospect.city}` : '';

  const vars = {
    greeting: firstName ? `Dobrý deň, ${firstName}` : 'Dobrý deň',
    contact_name: contactName,
    first_name: firstName,
    company,
    domain: prospect.domain || '',
    industry: prospect.industry || '',
    industry_hook: industryHook ? ` — ${industryHook}` : '',
    city: prospect.city || '',
    city_hook: cityHook,
    reviews_hook: reviewsHook,
    tracking_hook: trackingHook,
    enrichment_hook: [reviewsHook, trackingHook].filter(Boolean).join(' '),
    audit_token: prospect.audit_token || '',
    audit_request_url: prospect.audit_token ? `${BASE_URL}/audit-request.html?t=${prospect.audit_token}` : '',
    audit_url: prospect.audit_token ? `${BASE_URL}/audit.html?t=${prospect.audit_token}` : '',
    unsubscribe_url: prospect.audit_token ? `${BASE_URL}/unsubscribe.html?t=${prospect.audit_token}` : `${BASE_URL}/unsubscribe.html`,
    sender_name: s.sender_name || 'Štefan Varga',
    sender_title: s.sender_title || s.company_name || 'Adlify',
    sender_email_reply: 'info@adlify.eu',
    sender_phone: s.email_phone || '+421 944 184 045',
    sender_domain_marketing: 'adlify-agency.online',
    sender_domain_main: 'adlify.eu',
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

async function sendEmail(to, subject, html, text, sender, prospect) {
  const auditToken = prospect?.audit_token || null;
  // Gmail provider — cez Gmail API
  if (sender?.provider === 'gmail') {
    const res = await fetch(`${BASE_URL}/.netlify/functions/gmail-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: sender.id,
        to, subject, htmlBody: html, textBody: text,
        unsubscribeToken: auditToken,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`gmail-send ${res.status}: ${t}`);
    }
    return;
  }

  // Default: Resend cez send-email
  const payload = {
    to, subject, htmlBody: html, textBody: text,
    unsubscribeToken: auditToken,
    prospectId: prospect?.id || null,
  };
  if (sender?.email) {
    payload.fromEmail = sender.email;
    payload.fromName = sender.name;
    if (sender.reply_to) payload.replyTo = sender.reply_to;
  }
  const res = await fetch(`${BASE_URL}/.netlify/functions/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`send-email ${res.status}: ${t}`);
  }
}

// Vyberie najvhodnejšieho sendera (is_active, sent_today<warmup_current,
// last_sent_at starší ako throttle_seconds).
async function pickSender() {
  const { data: senders } = await supabase
    .from('outreach_senders')
    .select('*')
    .eq('is_active', true);
  if (!senders?.length) return null;

  const now = Date.now();
  // Reset sent_today ak uplynulo >24h
  for (const s of senders) {
    const reset = s.sent_today_reset_at ? new Date(s.sent_today_reset_at).getTime() : 0;
    if (now - reset >= 24 * 60 * 60 * 1000) {
      s.sent_today = 0;
      s.sent_today_reset_at = new Date().toISOString();
      await supabase.from('outreach_senders').update({
        sent_today: 0, sent_today_reset_at: s.sent_today_reset_at,
      }).eq('id', s.id);
    }
  }

  // Filter available — zostávajúca kapacita + dodržaný throttle
  const available = senders.filter(s => {
    const limit = s.warmup_current || s.daily_limit || 40;
    if ((s.sent_today || 0) >= limit) return false;
    const lastMs = s.last_sent_at ? new Date(s.last_sent_at).getTime() : 0;
    const gapMs = (s.throttle_seconds || 60) * 1000;
    if (now - lastMs < gapMs) return false;
    return true;
  });
  if (!available.length) return null;
  // Round-robin: vyber s najstarším last_sent_at
  available.sort((a, b) => (new Date(a.last_sent_at || 0).getTime()) - (new Date(b.last_sent_at || 0).getTime()));
  return available[0];
}

async function bumpSenderCounters(senderId) {
  const nowIso = new Date().toISOString();
  const { data: s } = await supabase
    .from('outreach_senders')
    .select('sent_today, total_sent')
    .eq('id', senderId).maybeSingle();
  if (!s) return;
  await supabase.from('outreach_senders').update({
    sent_today: (s.sent_today || 0) + 1,
    total_sent: (s.total_sent || 0) + 1,
    last_sent_at: nowIso,
  }).eq('id', senderId);
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

  // 2b. Vyber variant (A/B testing) — ak step má template_variants, weighted random
  const variantSlug = pickVariant(step);
  if (!variantSlug) {
    console.error('[scheduler] no template for step', step.id);
    return { sent: false, error: 'no_template' };
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

  // 3b. Business hours / weekend window — ak sme mimo, push do okna a return
  const now = new Date();
  const windowStart = nextSendingWindow(now);
  if (windowStart.getTime() > now.getTime() + 60 * 1000) {
    const withJitter = applyJitter(windowStart);
    await supabase.from('outreach_campaign_enrollments').update({
      next_send_at: withJitter.toISOString(),
    }).eq('id', enrollment.id);
    return { sent: false, skipped: true, reason: 'outside_window', next_at: withJitter.toISOString() };
  }

  // 4. Pošli email
  let senderId = null;
  try {
    const sender = await pickSender();
    // Ak existujú sendrovia a žiadny nie je dostupný → skip do ďalšieho runu
    const { count: activeCount } = await supabase.from('outreach_senders').select('id', { count: 'exact', head: true }).eq('is_active', true);
    if ((activeCount || 0) > 0 && !sender) {
      // Všetci sú na dnešnom limite alebo throttled. Posuň next_send_at o 5 min.
      await supabase.from('outreach_campaign_enrollments').update({
        next_send_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      }).eq('id', enrollment.id);
      return { sent: false, skipped: true, reason: 'sender_throttled' };
    }
    const email = await renderEmailFromTemplate(variantSlug, prospect);
    await sendEmail(prospect.email, email.subject, email.html, email.text, sender, prospect);
    if (sender?.id) {
      senderId = sender.id;
      await bumpSenderCounters(sender.id);
    }
    await supabase.from('prospect_events').insert({
      prospect_id: prospect.id,
      event_type: 'email_sent',
      sender_id: senderId,
      meta: {
        campaign_id: campaign.id,
        step_order: nextStepOrder,
        variant_slug: variantSlug,
        sender_email: sender?.email || null,
      },
    });
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
  const variantHistoryPatch = { ...(enrollment.variant_history || {}), [`step_${nextStepOrder}`]: variantSlug };
  let enrollPatch;
  if (futureStep) {
    const delayMs = (futureStep.delay_days || 0) * 24 * 60 * 60 * 1000;
    // Cieľový čas + window check + jitter (aby každý prospekt mal mierne iný plán)
    const targetTime = new Date(now.getTime() + delayMs);
    const inWindow = nextSendingWindow(targetTime);
    const scheduled = applyJitter(inWindow);
    enrollPatch = {
      current_step: nextStepOrder,
      last_sent_at: now.toISOString(),
      next_send_at: scheduled.toISOString(),
      variant_history: variantHistoryPatch,
      last_sender_id: senderId,
    };
  } else {
    enrollPatch = {
      current_step: nextStepOrder,
      last_sent_at: now.toISOString(),
      status: 'completed',
      completed_at: now.toISOString(),
      next_send_at: null,
      variant_history: variantHistoryPatch,
      last_sender_id: senderId,
    };
  }
  await supabase.from('outreach_campaign_enrollments').update(enrollPatch).eq('id', enrollment.id);

  return { sent: true, step: nextStepOrder, variant: variantSlug };
}

function pickVariant(step) {
  const variants = Array.isArray(step.template_variants) ? step.template_variants.filter(v => v.slug) : [];
  if (variants.length === 0) return step.template_slug;
  if (variants.length === 1) return variants[0].slug;
  const totalWeight = variants.reduce((s, v) => s + (Number(v.weight) || 0), 0);
  if (totalWeight <= 0) {
    return variants[Math.floor(Math.random() * variants.length)].slug;
  }
  let r = Math.random() * totalWeight;
  for (const v of variants) {
    r -= (Number(v.weight) || 0);
    if (r <= 0) return v.slug;
  }
  return variants[variants.length - 1].slug;
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
