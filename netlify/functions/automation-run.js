// netlify/functions/automation-run.js
//
// Centrálny engine pre automation rules. Zavolá sa s:
//   { prospectId, event, extraContext? }
// Nájde rules pre daný trigger_event, overí podmienky (industry,
// score_min, city, stage) a vykoná definované akcie.
//
// Podporované akcie:
//   { type: 'create_task', title, description, priority, due_days, category }
//   { type: 'notify_email', subject, body }    — pošle ownerovi
//   { type: 'assign_to', user_id }
//   { type: 'add_tag', tag }
//   { type: 'promote_to_lead', reason }
//   { type: 'send_template', template_slug }   — pošle prospektovi
//   { type: 'set_stage', stage }
//   { type: 'add_note', body }

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const BASE_URL = process.env.URL || 'https://adlify.eu';

function matchesConditions(prospect, cond = {}) {
  if (cond.industry && !String(prospect.industry || '').toLowerCase().includes(String(cond.industry).toLowerCase())) return false;
  if (cond.city && !String(prospect.city || '').toLowerCase().includes(String(cond.city).toLowerCase())) return false;
  if (cond.score_min != null && (prospect.score || 0) < Number(cond.score_min)) return false;
  if (cond.score_max != null && (prospect.score || 0) > Number(cond.score_max)) return false;
  if (Array.isArray(cond.stage_in) && !cond.stage_in.includes(prospect.outreach_stage)) return false;
  if (Array.isArray(cond.tags_any) && !(prospect.tags || []).some(t => cond.tags_any.includes(t))) return false;
  return true;
}

async function runAction(action, prospect, event) {
  const type = action.type;
  try {
    if (type === 'create_task') {
      const due = new Date();
      due.setDate(due.getDate() + (action.due_days ?? 1));
      await supabase.from('tasks').insert({
        title: interpolate(action.title || `Ozvať sa: ${prospect.company_name || prospect.domain}`, prospect),
        description: action.description ? interpolate(action.description, prospect) : null,
        status: 'pending',
        priority: action.priority || 'normal',
        prospect_id: prospect.id,
        due_date: due.toISOString(),
        category: action.category || 'automation',
      });
    } else if (type === 'assign_to') {
      await supabase.from('prospects').update({ assigned_to: action.user_id || null }).eq('id', prospect.id);
    } else if (type === 'add_tag') {
      const tags = Array.from(new Set([...(prospect.tags || []), action.tag].filter(Boolean)));
      await supabase.from('prospects').update({ tags }).eq('id', prospect.id);
    } else if (type === 'set_stage') {
      await supabase.from('prospects').update({ outreach_stage: action.stage }).eq('id', prospect.id);
    } else if (type === 'add_note') {
      await supabase.from('prospect_notes').insert({
        prospect_id: prospect.id,
        body: interpolate(action.body || 'Automatická poznámka', prospect),
      });
    } else if (type === 'promote_to_lead') {
      // Vytvor lead z prospectu (jednoduchý copy)
      const { data: existing } = await supabase.from('leads')
        .select('id').eq('domain', prospect.domain || '').maybeSingle();
      if (!existing) {
        const { data: lead } = await supabase.from('leads').insert({
          company_name: prospect.company_name,
          domain: prospect.domain,
          industry: prospect.industry,
          city: prospect.city,
          contact_person: prospect.contact_person,
          email: prospect.email,
          phone: prospect.phone,
          score: prospect.score,
          source: 'automation',
          status: 'ready',
          converted_from_prospect_id: prospect.id,
        }).select().single();
        if (lead) {
          await supabase.from('prospects').update({
            outreach_stage: 'converted',
            converted_to_lead_id: lead.id,
            converted_at: new Date().toISOString(),
            conversion_reason: action.reason || 'automation_rule',
          }).eq('id', prospect.id);
        }
      }
    } else if (type === 'send_template') {
      // Fire-and-forget — využije sa scheduler logika
      await fetch(`${BASE_URL}/.netlify/functions/send-template-to-prospect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId: prospect.id, templateSlug: action.template_slug }),
      }).catch(() => {});
    } else if (type === 'notify_email') {
      await fetch(`${BASE_URL}/.netlify/functions/notify-outreach-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospectId: prospect.id,
          event,
          note: interpolate(action.body || '', prospect),
        }),
      }).catch(() => {});
    }
    return { ok: true, type };
  } catch (err) {
    return { ok: false, type, error: err.message };
  }
}

function interpolate(tpl, prospect) {
  return String(tpl).replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k) => prospect[k] ?? '');
}

exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method not allowed' };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: cors, body: 'Bad JSON' }; }

  const { prospectId, event: ev } = payload;
  if (!prospectId || !ev) return { statusCode: 400, headers: cors, body: 'missing prospectId/event' };

  try {
    const { data: prospect } = await supabase.from('prospects').select('*').eq('id', prospectId).single();
    if (!prospect) return { statusCode: 404, headers: cors, body: 'Prospect not found' };

    const { data: rules } = await supabase.from('automation_rules')
      .select('*').eq('trigger_event', ev).eq('is_active', true);

    const summary = { triggered: 0, skipped: 0, actions: 0, errors: 0 };
    for (const rule of (rules || [])) {
      if (!matchesConditions(prospect, rule.conditions || {})) {
        await supabase.from('automation_runs').insert({
          rule_id: rule.id, prospect_id: prospect.id, trigger_event: ev,
          status: 'skipped', actions_run: null,
        });
        summary.skipped++;
        continue;
      }
      const results = [];
      for (const action of (rule.actions || [])) {
        const r = await runAction(action, prospect, ev);
        results.push(r);
        if (r.ok) summary.actions++; else summary.errors++;
      }
      await supabase.from('automation_runs').insert({
        rule_id: rule.id, prospect_id: prospect.id, trigger_event: ev,
        status: results.every(r => r.ok) ? 'success' : 'error',
        actions_run: results,
        error_message: results.filter(r => !r.ok).map(r => r.error).join('; ') || null,
      });
      await supabase.from('automation_rules').update({
        run_count: (rule.run_count || 0) + 1,
        last_run_at: new Date().toISOString(),
      }).eq('id', rule.id);
      summary.triggered++;
    }
    return {
      statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify(summary),
    };
  } catch (err) {
    console.error('[automation-run] error:', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
