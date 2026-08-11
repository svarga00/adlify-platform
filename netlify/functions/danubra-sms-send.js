// ============================================================================
// DANUBRA — odoslanie SMS (§9)
// ============================================================================
// Poskytovateľ je abstrahovaný — vyberá sa premennou SMS_PROVIDER.
// Implementované adaptéry: 'twilio', 'log' (vývojový, iba zapíše).
// Pridanie ďalšieho poskytovateľa = jedna funkcia v ADAPTERS.
//
// Každé odoslanie sa zapisuje do danubra_activities so stavom doručenia.
// Rešpektuje mesačný limit z nastavení a prepínače automatizácií.
// ============================================================================
const { createClient } = require('@supabase/supabase-js');
const Sms = require('../../danubra/lib/sms/provider');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

// ── Adaptéry poskytovateľov ─────────────────────────────────────────────────
const ADAPTERS = {
  /** Vývojový režim — nič neodošle, iba vráti úspech a zapíše do logu. */
  async log({ to, body }) {
    console.log(`[sms:log] → ${to}: ${body}`);
    return { id: `log-${Date.now()}`, status: 'logged' };
  },

  async twilio({ to, body, from }) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const sender = from || process.env.SMS_SENDER_ID;
    if (!sid || !token) throw new Error('Chýbajú TWILIO_ACCOUNT_SID alebo TWILIO_AUTH_TOKEN');
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const params = new URLSearchParams({ To: to, Body: body, From: sender });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || `Twilio ${res.status}`);
    return { id: data.sid, status: data.status };
  },
};

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { to, body, country = 'SK', stripDia = true, entity, template } =
      JSON.parse(event.body || '{}');

    const prepared = Sms.prepare({ to, body, country, stripDia });
    if (!prepared.ok) {
      return { statusCode: 400, headers: cors,
        body: JSON.stringify({ error: prepared.warnings.map(w => w.text).join('; ') }) };
    }

    // ── Mesačný limit a prepínače z nastavení ──────────────────────────────
    const { data: settingsRows } = await supabase
      .from('danubra_settings').select('marketing, automations').limit(1);
    const settings = (settingsRows && settingsRows[0]) || {};
    const limit = Number(settings?.marketing?.sms_monthly_limit) || 0;
    if (limit > 0) {
      const monthStart = new Date();
      monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
      const { count } = await supabase
        .from('danubra_activities')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'sms').eq('direction', 'out')
        .gte('created_at', monthStart.toISOString());
      if ((count || 0) + prepared.segments > limit) {
        return { statusCode: 429, headers: cors,
          body: JSON.stringify({ error: `Prekročený mesačný limit SMS (${limit})`, sent: count }) };
      }
    }

    // ── Odoslanie ──────────────────────────────────────────────────────────
    const providerName = process.env.SMS_PROVIDER || 'log';
    const adapter = ADAPTERS[providerName];
    if (!adapter) throw new Error(`Neznámy poskytovateľ SMS: ${providerName}`);

    const result = await adapter({ to: prepared.to, body: prepared.body });

    // ── Záznam do osi ──────────────────────────────────────────────────────
    if (entity?.type && entity?.id) {
      await supabase.from('danubra_activities').insert({
        entity_type: entity.type, entity_id: entity.id,
        type: 'sms', direction: 'out', body: prepared.body,
        channel_meta: {
          provider: providerName, message_id: result.id, status: result.status,
          segments: prepared.segments, encoding: prepared.encoding, to: prepared.to,
          template: template || null,
        },
      }).catch(() => {});
    }

    return { statusCode: 200, headers: cors,
      body: JSON.stringify({ success: true, id: result.id, status: result.status,
        segments: prepared.segments, encoding: prepared.encoding, to: prepared.to }) };
  } catch (err) {
    console.error('[danubra-sms-send]', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
