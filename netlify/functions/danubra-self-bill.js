// ============================================================================
// DANUBRA — živnostník potvrdí faktúru, ktorú sme vystavili za neho
// ============================================================================
// Verejné, bez prihlásenia: živnostník dostane odkaz s tajným kľúčom
// (`confirm_token`, 64 znakov), pozrie si faktúru a potvrdí ju alebo namietne.
//
//   GET  ?t=KĽÚČ                       → údaje faktúry na zobrazenie
//   POST { t, action: 'confirm' }      → self_sent → approved (pripravená na platbu)
//   POST { t, action: 'object', note } → self_sent → disputed (treba doriešiť)
//
// Inú faktúru sa týmto kľúčom zmeniť nedá a potvrdiť sa dá len raz.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

const H = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const out = (code, body) => ({ statusCode: code, headers: H, body: JSON.stringify(body) });
const tokenOk = (t) => /^[a-f0-9]{48,96}$/.test(String(t || ''));

const COLS = 'id,bill_number,variable_symbol,amount,issue_date,due_date,delivery_date,status,'
  + 'lines,extracted,supplier_iban,period_id,worker_confirmed_at,worker_note';

function view(b, period) {
  const snap = (b.extracted && b.extracted._self) || {};
  return {
    bill: {
      bill_number: b.bill_number, variable_symbol: b.variable_symbol, amount: b.amount,
      issue_date: b.issue_date, due_date: b.due_date, delivery_date: b.delivery_date,
      lines: b.lines || [], supplier_iban: b.supplier_iban, extracted: { _self: snap },
    },
    period: period ? { period_from: period.period_from, period_to: period.period_to } : null,
    status: b.status,
    confirmedAt: b.worker_confirmed_at, note: b.worker_note,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: H, body: '' };
  try {
    let t, action, note;
    if (event.httpMethod === 'GET') t = (event.queryStringParameters || {}).t;
    else if (event.httpMethod === 'POST') ({ t, action, note } = JSON.parse(event.body || '{}'));
    else return out(405, { error: 'Nepovolená metóda' });
    if (!tokenOk(t)) return out(404, { error: 'Odkaz je neplatný.' });

    const { data: b } = await supabase.from('danubra_bills').select(COLS)
      .eq('confirm_token', t).eq('source', 'self_billing').maybeSingle();
    if (!b || !['self_sent', 'approved', 'disputed', 'paid'].includes(b.status)) {
      return out(404, { error: 'Faktúra sa nenašla alebo už neplatí.' });
    }
    const { data: period } = b.period_id
      ? await supabase.from('danubra_periods').select('period_from,period_to').eq('id', b.period_id).maybeSingle()
      : { data: null };

    if (event.httpMethod === 'GET') return out(200, view(b, period));

    if (b.status !== 'self_sent') {
      return out(409, { error: 'Faktúru ste už potvrdili alebo namietli.', ...view(b, period) });
    }
    const now = new Date().toISOString();
    let patch;
    if (action === 'confirm') {
      patch = { status: 'approved', worker_confirmed_at: now };
    } else if (action === 'object') {
      const why = String(note || '').trim().slice(0, 1000);
      if (why.length < 3) return out(400, { error: 'Napíšte prosím, s čím nesúhlasíte.' });
      patch = { status: 'disputed', worker_note: why,
        note: `Námietka živnostníka (${now.slice(0, 10)}): ${why}` };
    } else {
      return out(400, { error: 'Neznáma akcia.' });
    }
    const { data: upd, error } = await supabase.from('danubra_bills').update(patch)
      .eq('id', b.id).eq('status', 'self_sent').select(COLS).maybeSingle();
    if (error) return out(500, { error: error.message });
    if (!upd) return out(409, { error: 'Faktúru medzitým niekto zmenil. Obnovte stránku.' });
    return out(200, view(upd, period));
  } catch (e) {
    return out(500, { error: (e && e.message) || 'Chyba' });
  }
};
