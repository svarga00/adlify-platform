// ============================================================================
// DANUBRA — mesačný cron: návrhy faktúr za priebežnú službu (§7, §6.4)
// ============================================================================
// Beží posledný deň mesiaca ~20:00 Europe/Bratislava.
//
// KRITICKÉ (§5.2): faktúry sa NIKDY neodosielajú automaticky — cron vytvorí
// iba `draft_pending_approval` a odoslanie vyžaduje ľudské potvrdenie.
//
// Idempotentné: opakované spustenie v ten istý mesiac nevytvorí duplicitu
// (kontroluje sa podľa order_id + billing_period_from/to).
//
// Ochrana: hlavička Authorization: Bearer ${CRON_SECRET}
// ============================================================================
const { createClient } = require('@supabase/supabase-js');
const { calculateOngoingService, monthlyBillingPeriod } = require('../../danubra/lib/billing/ongoing-service');
const { determineBillingRegime } = require('../../danubra/lib/billing/regime');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

/** Dnešný dátum v Europe/Bratislava ako 'YYYY-MM-DD' (§5.7 — letný čas). */
function todaySk() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const g = (t) => p.find(x => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

function authorized(event) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // nenastavené → povolené (vývoj)
  const h = event?.headers?.authorization || event?.headers?.Authorization || '';
  return h === `Bearer ${secret}`;
}

/** Je `ymd` posledný deň svojho mesiaca? */
function isLastDayOfMonth(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d === lastDay;
}

exports.handler = async (event) => {
  if (!authorized(event)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Neautorizované' }) };
  }

  const today = todaySk();
  const [year, month] = today.split('-').map(Number);

  // Cron beží 28.–31. (posledný deň sa v cron výraze vyjadriť nedá), takže
  // v ostatné dni skončíme bez práce. Ručné spustenie sa dá vynútiť ?force=1.
  const forced = event?.queryStringParameters?.force === '1';
  if (!isLastDayOfMonth(today) && !forced) {
    return { statusCode: 200, body: JSON.stringify({ skipped: 'nie je posledný deň mesiaca', today }) };
  }
  const summary = { period: `${year}-${String(month).padStart(2, '0')}`, checked: 0, created: 0, skipped: 0, errors: [] };

  try {
    // Objednávky, ktoré v tomto mesiaci bežali alebo skončili
    const { data: orders, error } = await supabase
      .from('danubra_orders')
      .select('*')
      .eq('ongoing_service_enabled', true)
      .in('status', ['in_progress', 'ending_soon', 'completed']);
    if (error) throw error;

    for (const order of orders || []) {
      summary.checked++;
      const { periodFrom, periodTo } = monthlyBillingPeriod(year, month, order);
      if (periodTo < periodFrom) { summary.skipped++; continue; }

      // Idempotencia — už existuje faktúra za rovnaké obdobie?
      const { data: dup } = await supabase
        .from('danubra_invoices')
        .select('id')
        .eq('order_id', order.id)
        .eq('type', 'ongoing_service')
        .eq('billing_period_from', periodFrom)
        .eq('billing_period_to', periodTo)
        .limit(1);
      if (dup && dup.length) { summary.skipped++; continue; }

      const { data: segs } = await supabase
        .from('danubra_order_service_periods')
        .select('*')
        .eq('order_id', order.id);

      const calc = calculateOngoingService(order, segs || [], periodFrom, periodTo, today);
      if (calc.total <= 0) { summary.skipped++; continue; }

      const { data: client } = await supabase
        .from('danubra_clients').select('*').eq('id', order.client_id).maybeSingle();
      const regime = determineBillingRegime(client || {});

      // Číslo faktúry atomicky (§6.1)
      const { data: number, error: numErr } = await supabase.rpc('danubra_next_number', { p_kind: 'invoice' });
      if (numErr) { summary.errors.push(`${order.order_number}: ${numErr.message}`); continue; }

      const due = new Date(today); due.setDate(due.getDate() + 14);
      const { data: inv, error: invErr } = await supabase.from('danubra_invoices').insert({
        invoice_number: number,
        client_id: order.client_id, order_id: order.id,
        type: 'ongoing_service',
        issue_date: today, due_date: due.toISOString().slice(0, 10), delivery_date: periodTo,
        total: calc.total, currency: 'EUR', vat_regime: regime.regime,
        status: 'draft_pending_approval',       // §5.2 — nikdy automaticky odoslané
        billing_period_from: periodFrom, billing_period_to: periodTo,
      }).select().single();
      if (invErr) { summary.errors.push(`${order.order_number}: ${invErr.message}`); continue; }

      const items = calc.breakdown.map(b => ({
        invoice_id: inv.id,
        description: `Priebežná služba ${b.from} – ${b.to} · ${b.persons} os.`,
        quantity: b.days * b.persons, unit: 'os./deň',
        unit_price: b.rate, total: b.amount,
      }));
      await supabase.from('danubra_invoice_items').insert(items);

      // Upozornenie, ak má klient neuhradenú faktúru rovnakého typu (§6.4)
      const { data: unpaid } = await supabase
        .from('danubra_invoices').select('invoice_number')
        .eq('client_id', order.client_id).eq('type', 'ongoing_service')
        .in('status', ['issued', 'overdue']).limit(3);

      await supabase.from('danubra_activities').insert({
        entity_type: 'order', entity_id: order.id, type: 'system',
        body: `Návrh faktúry ${number} za priebežnú službu ${periodFrom} – ${periodTo}: ${calc.total.toFixed(2)} € (čaká na schválenie)`
          + (unpaid && unpaid.length ? ` · pozor: neuhradené ${unpaid.map(u => u.invoice_number).join(', ')}` : ''),
      });

      summary.created++;
    }
  } catch (err) {
    summary.fatal = err.message;
    console.error('[danubra-monthly]', err);
  }

  console.log('[danubra-cron-monthly]', JSON.stringify(summary));
  return { statusCode: 200, body: JSON.stringify(summary) };
};

// Posledný deň mesiaca sa cronom nedá vyjadriť priamo — beží 28.–31. o 20:00
// a sám si overí, či je dnes naozaj posledný deň mesiaca.
exports.config = { schedule: '0 20 28-31 * *' };
