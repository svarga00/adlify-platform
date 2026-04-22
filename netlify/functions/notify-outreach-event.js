// netlify/functions/notify-outreach-event.js
// Pošle email ownerovi (info@adlify.eu alebo settings.notification_email)
// keď prospect prejaví záujem (audit_requested, call_booked, ...).
//
// Body: { prospectId, event, note? }
// Event: 'audit_requested' | 'call_booked' | 'email_replied'

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function getOwnerEmail() {
  try {
    const { data } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['notification_email', 'email_contact']);
    const m = {};
    (data || []).forEach(r => {
      try { m[r.key] = JSON.parse(r.value); } catch { m[r.key] = r.value; }
    });
    return m.notification_email || m.email_contact || 'info@adlify.eu';
  } catch {
    return 'info@adlify.eu';
  }
}

const EVENT_LABELS = {
  audit_requested: { subject: 'požiadal o audit',      emoji: '🎯', color: '#F97316', priority: 'high',   taskDueInDays: 1, taskCategory: 'outreach_followup', action: 'Ozvi sa do 24 hodín a potvrď audit.' },
  call_booked:     { subject: 'rezervoval hovor',      emoji: '📞', color: '#16A34A', priority: 'high',   taskDueInDays: 0, taskCategory: 'outreach_call',     action: 'Pripraviť sa na hovor.' },
  email_replied:   { subject: 'odpovedal na email',    emoji: '💬', color: '#3B82F6', priority: 'high',   taskDueInDays: 0, taskCategory: 'outreach_reply',    action: 'Odpísať hneď ako je to možné.' },
  email_opened_n:  { subject: 'viackrát otvoril email',emoji: '👁', color: '#8B5CF6', priority: 'normal', taskDueInDays: 2, taskCategory: 'outreach_warm',     action: 'Horúci lead — zvážiť follow-up.' },
};

async function createTaskAndNotifications(prospect, event, label, note) {
  const company = prospect.company_name || prospect.domain || 'Prospekt';

  // 1. TASK
  try {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (label.taskDueInDays || 1));
    const descParts = [
      `${company}${prospect.domain ? ` (${prospect.domain})` : ''} — ${label.subject}.`,
      label.action,
      prospect.email ? `Email: ${prospect.email}` : '',
      prospect.phone ? `Telefón: ${prospect.phone}` : '',
      prospect.audit_request_data?.priority ? `Priorita klienta: ${prospect.audit_request_data.priority}` : '',
      note ? `Poznámka: ${note}` : '',
    ].filter(Boolean);
    await supabase.from('tasks').insert({
      title: `${label.emoji} ${company} — ${label.subject}`,
      description: descParts.join('\n'),
      status: 'pending',
      priority: label.priority || 'normal',
      prospect_id: prospect.id,
      due_date: dueDate.toISOString(),
      category: label.taskCategory || 'outreach',
    });
  } catch (err) {
    console.error('[notify] task insert failed:', err);
  }

  // 2. NOTIFICATIONS — pre každého ownera/admina/managera v org
  try {
    const { data: users } = await supabase
      .from('user_profiles')
      .select('id')
      .in('role', ['owner', 'admin', 'manager']);
    if (users?.length) {
      const rows = users.map(u => ({
        user_id: u.id,
        type: 'outreach_activity',
        title: `${label.emoji} ${company} ${label.subject}`,
        message: prospect.audit_request_data?.note || note || `${company} práve ${label.subject}.`,
        entity_type: 'prospect',
        entity_id: prospect.id,
        action_url: '/admin/#outreach',
        email_sent: true,
        email_sent_at: new Date().toISOString(),
      }));
      await supabase.from('notifications').insert(rows);
    }
  } catch (err) {
    console.error('[notify] notifications insert failed:', err);
  }

  // 3. ACTIVITY log
  try {
    await supabase.from('activities').insert({
      entity_type: 'prospect',
      entity_id: prospect.id,
      action: event,
      title: `${label.emoji} ${company} ${label.subject}`,
      description: note || prospect.audit_request_data?.note || null,
      metadata: {
        stage: prospect.outreach_stage,
        priority: prospect.audit_request_data?.priority || null,
      },
    });
  } catch (err) {
    console.error('[notify] activity insert failed:', err);
  }
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method not allowed' };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { prospectId, event: ev, note } = payload;
  if (!prospectId || !ev) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'prospectId a event sú povinné' }) };
  }

  const label = EVENT_LABELS[ev] || { subject: ev, emoji: '📣', color: '#6F6758' };

  try {
    const { data: prospect, error } = await supabase
      .from('prospects')
      .select('id, company_name, domain, contact_person, email, phone, industry, city, audit_requested_at, audit_request_data, outreach_stage')
      .eq('id', prospectId)
      .single();
    if (error || !prospect) throw error || new Error('Prospect nenájdený');

    const ownerEmail = await getOwnerEmail();
    const company = prospect.company_name || prospect.domain || 'Prospekt';
    const adminUrl = `${process.env.URL || 'https://adlify.eu'}/admin/#outreach`;

    const priority = prospect.audit_request_data?.priority;
    const noteFromForm = prospect.audit_request_data?.note;
    const combinedNote = note || noteFromForm || '';

    const textLines = [
      `${label.emoji} ${company} ${label.subject}.`,
      '',
      `Firma: ${company}${prospect.domain ? ` (${prospect.domain})` : ''}`,
      prospect.contact_person ? `Kontakt: ${prospect.contact_person}` : '',
      prospect.email ? `Email: ${prospect.email}` : '',
      prospect.phone ? `Telefón: ${prospect.phone}` : '',
      prospect.industry ? `Odvetvie: ${prospect.industry}` : '',
      prospect.city ? `Mesto: ${prospect.city}` : '',
      priority ? `Priorita: ${priority}` : '',
      combinedNote ? `Poznámka: ${combinedNote}` : '',
      '',
      `Admin: ${adminUrl}`,
    ].filter(Boolean);

    const text = textLines.join('\n');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F7F5F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#14120E;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F5F1;padding:24px 12px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #EAE6DE;">
        <tr><td style="padding:20px 24px;background:${label.color};color:#fff;">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.9;">Outreach alert</div>
          <div style="font-size:22px;font-weight:700;margin-top:4px;">${label.emoji} ${company} ${label.subject}</div>
        </td></tr>
        <tr><td style="padding:22px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${[
              ['Firma', `${company}${prospect.domain ? ` <span style="color:#948B7C;">(${prospect.domain})</span>` : ''}`],
              prospect.contact_person && ['Kontakt', prospect.contact_person],
              prospect.email && ['Email', `<a href="mailto:${prospect.email}" style="color:${label.color};">${prospect.email}</a>`],
              prospect.phone && ['Telefón', `<a href="tel:${prospect.phone.replace(/\s/g,'')}" style="color:${label.color};">${prospect.phone}</a>`],
              prospect.industry && ['Odvetvie', prospect.industry],
              prospect.city && ['Mesto', prospect.city],
              priority && ['Priorita', priority],
            ].filter(Boolean).map(([k,v]) => `
              <tr>
                <td style="padding:6px 0;font-size:12px;color:#948B7C;text-transform:uppercase;letter-spacing:0.5px;width:100px;">${k}</td>
                <td style="padding:6px 0;font-size:14px;color:#14120E;">${v}</td>
              </tr>
            `).join('')}
          </table>
          ${combinedNote ? `
            <div style="margin-top:16px;padding:14px;background:#F7F5F1;border-left:3px solid ${label.color};border-radius:6px;">
              <div style="font-size:12px;color:#948B7C;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Poznámka</div>
              <div style="font-size:14px;color:#3A352B;line-height:1.6;white-space:pre-wrap;">${combinedNote}</div>
            </div>
          ` : ''}
          <div style="margin-top:22px;text-align:center;">
            <a href="${adminUrl}" style="display:inline-block;background:${label.color};color:#fff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;font-size:14px;">Otvoriť v Outreach</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    // Odošleme cez existujúcu send-email funkciu
    const sendRes = await fetch(`${process.env.URL || 'https://adlify.eu'}/.netlify/functions/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: ownerEmail,
        subject: `${label.emoji} ${company} ${label.subject}`,
        htmlBody: html,
        textBody: text,
      }),
    });
    if (!sendRes.ok) {
      const t = await sendRes.text().catch(() => '');
      console.error('[notify] send-email failed:', sendRes.status, t);
    }

    // Paralelne vytvor task + notifikácie + activity log
    await createTaskAndNotifications(prospect, ev, label, note);

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, sentTo: ownerEmail, taskCreated: true }),
    };
  } catch (err) {
    console.error('[notify-outreach-event] error:', err);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message || 'Chyba' }),
    };
  }
};
