// Watchdog — každých 10 minút resetuje campaign_projects ktoré sú zaseknuté
// v statuse 'generating' viac ako 15 minút (background fn padol tvrdo bez
// resetu, alebo bol zabitý timeout).
//
// Cron schedule '*/10 * * * *' = každých 10 min.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async () => {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  try {
    const { data: stuck, error: selectErr } = await supabase
      .from('campaign_projects')
      .select('id, name, updated_at, created_at')
      .eq('status', 'generating')
      .lt('updated_at', cutoff);

    if (selectErr) {
      console.error('[watchdog] select failed:', selectErr.message);
      return { statusCode: 500, body: JSON.stringify({ error: selectErr.message }) };
    }

    if (!stuck?.length) {
      console.log('[watchdog] no stuck projects');
      return { statusCode: 200, body: JSON.stringify({ checked: 0, reset: 0 }) };
    }

    const ids = stuck.map(p => p.id);
    const errorNote = `AI error: Generovanie sa zaseklo (>15 min). Skús znova alebo pozri logy.`;

    // Pokús sa resetnúť s notes; ak notes stĺpec neexistuje (legacy DB),
    // fallback na status-only update.
    let resetErr = null;
    const r1 = await supabase.from('campaign_projects')
      .update({ status: 'draft', notes: errorNote, updated_at: new Date().toISOString() })
      .in('id', ids);
    if (r1.error) {
      resetErr = r1.error;
      const r2 = await supabase.from('campaign_projects')
        .update({ status: 'draft', updated_at: new Date().toISOString() })
        .in('id', ids);
      if (r2.error) {
        console.error('[watchdog] reset failed (both attempts):', r2.error.message);
        return { statusCode: 500, body: JSON.stringify({ error: r2.error.message }) };
      }
    }

    console.log(`[watchdog] reset ${ids.length} stuck projects:`, ids);
    return {
      statusCode: 200,
      body: JSON.stringify({
        checked: stuck.length, reset: ids.length, ids,
        notes_supported: !resetErr,
      }),
    };
  } catch (err) {
    console.error('[watchdog] fatal:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

exports.config = { schedule: '*/10 * * * *' };
