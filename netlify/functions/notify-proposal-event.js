// Pošle email + in-app notifikáciu vlastníkovi/adminom keď klient
// schváli alebo požiada o revíziu návrhu cez portál.
//
// POST { project_id, event_type: 'client_approved' | 'client_revision',
//        message?, feedback? }
//
// Body sa volá z portal/proposal.html po approveProposal / submitRevision.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BASE_URL = process.env.URL || 'https://adlify.eu';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const EVENTS = {
  client_approved: {
    emoji: '✅',
    title: 'Klient schválil návrh',
    subject: (client, project) => `✅ ${client} schválil návrh "${project}"`,
    body: (client, project) => `Klient <strong>${esc(client)}</strong> schválil návrh kampane <strong>${esc(project)}</strong>.\n\nMôžete pristúpiť k nasadeniu.`,
  },
  client_revision: {
    emoji: '✏️',
    title: 'Klient požiadal o úpravu',
    subject: (client, project) => `✏️ ${client} žiada úpravu návrhu "${project}"`,
    body: (client, project, feedback) => `Klient <strong>${esc(client)}</strong> požiadal o úpravu návrhu kampane <strong>${esc(project)}</strong>.\n\n<strong>Jeho pripomienka:</strong>\n<div style="background:#fff7ed;border-left:3px solid #FF6B35;padding:12px 16px;border-radius:0 8px 8px 0;margin:12px 0;font-style:italic;color:#9a3412;">${esc(feedback || '(žiadny text)')}</div>\nMôžete pregenerovať s pripomienkami v admin paneli.`,
  },
};

function emailHTML({ event, clientName, projectName, feedback, projectUrl }) {
  const e = EVENTS[event];
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f5f1;padding:32px 16px;margin:0;color:#14120e;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,0.04);">
  <div style="background:#14120e;padding:20px 28px;color:white;">
    <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Adlify · notifikácia</div>
    <div style="font-size:18px;font-weight:700;margin-top:6px;">${e.emoji} ${e.title}</div>
  </div>
  <div style="padding:28px;">
    <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 18px;">${e.body(clientName, projectName, feedback)}</p>
    <a href="${projectUrl}" style="display:inline-block;background:#FF6B35;color:white;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;font-size:13px;">Otvoriť projekt →</a>
  </div>
  <div style="padding:16px 28px;background:#fafaf8;border-top:1px solid #eae6de;font-size:11px;color:#9ca3af;">
    Adlify · ${new Date().getFullYear()}
  </div>
</div>
</body></html>`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: cors, body: 'Bad JSON' }; }

  const { project_id, event_type, feedback } = payload;
  if (!project_id || !event_type) return { statusCode: 400, headers: cors, body: 'Missing project_id or event_type' };
  if (!EVENTS[event_type]) return { statusCode: 400, headers: cors, body: 'Unknown event_type: ' + event_type };

  try {
    // Načítaj projekt + klienta
    const { data: project } = await supabase
      .from('campaign_projects')
      .select('id, name, client_id, client_portal_token')
      .eq('id', project_id)
      .single();
    if (!project) throw new Error('Projekt nenájdený');

    let clientName = 'Klient';
    if (project.client_id) {
      const { data: client } = await supabase.from('clients')
        .select('company_name').eq('id', project.client_id).maybeSingle();
      clientName = client?.company_name || clientName;
    }

    // Owner/admin/manager team members
    const { data: users } = await supabase
      .from('team_members')
      .select('id, email, first_name')
      .in('role', ['owner', 'admin', 'manager'])
      .eq('status', 'active');

    const e = EVENTS[event_type];
    const projectUrl = `${BASE_URL}/admin/index.html#project?id=${project.id}`;

    // In-app notifikácie
    if (users?.length) {
      try {
        await supabase.from('notifications').insert(users.map(u => ({
          user_id: u.id,
          type: event_type,
          title: `${e.emoji} ${e.title}`,
          message: feedback
            ? `${clientName}: ${feedback.slice(0, 120)}${feedback.length > 120 ? '…' : ''}`
            : `${clientName} (${project.name})`,
          entity_type: 'project',
          entity_id: project.id,
          action_url: `/admin/index.html#project?id=${project.id}`,
        })));
      } catch (notifErr) {
        console.warn('[notify-proposal] notifications insert failed:', notifErr.message);
      }
    }

    // Emails — len pre tých čo majú email
    const html = emailHTML({ event: event_type, clientName, projectName: project.name, feedback, projectUrl });
    const subject = e.subject(clientName, project.name);
    const sent = [];
    for (const u of (users || [])) {
      if (!u.email) continue;
      try {
        await fetch(`${BASE_URL}/.netlify/functions/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: u.email, subject, htmlBody: html, textBody: `${e.title}: ${clientName} — ${project.name}\n\n${projectUrl}` }),
        });
        sent.push(u.email);
      } catch (mailErr) {
        console.warn('[notify-proposal] email failed for', u.email, mailErr.message);
      }
    }

    console.log(`[notify-proposal] ${event_type} project=${project.id} notified=${users?.length || 0} emailed=${sent.length}`);
    return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, notified: users?.length || 0, emailed: sent.length }) };
  } catch (err) {
    console.error('[notify-proposal] error:', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
