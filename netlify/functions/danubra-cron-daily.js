// ============================================================================
// DANUBRA — denný cron (§7). Beží ~06:00 Europe/Bratislava.
// ============================================================================
// Robí:
//   - prechody stavov podľa dátumov (in_progress, ending_soon, completed)
//   - pripomienky platby (+2, +5 dní), alert (+7 dní)
//   - faktúry po splatnosti → overdue
//   - marketing_listings.renew_at do 7 dní → to_renew
//   - požiadavky bez odozvy > 24 h → alert
//   - ponuky po valid_until → expired
//
// Idempotentné — opakované spustenie v ten istý deň nesmie duplikovať záznamy
// (upozornenia sa píšu s dennou značkou a pred zápisom sa kontrolujú).
//
// Ochrana: hlavička Authorization: Bearer ${CRON_SECRET}
// ============================================================================
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://eidkljfaeqvvegiponwl.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

function todaySk() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const g = (t) => p.find(x => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
const addDays = (ymd, n) => {
  const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a, b) =>
  Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);

function authorized(event) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const h = event?.headers?.authorization || event?.headers?.Authorization || '';
  return h === `Bearer ${secret}`;
}

/** Zapíše systémový záznam, ak rovnaký dnes ešte nebol (idempotencia). */
async function noteOnce(entityType, entityId, key, body) {
  const today = todaySk();
  const tag = `[${key}:${today}]`;
  const { data: existing } = await supabase
    .from('danubra_activities')
    .select('id')
    .eq('entity_type', entityType).eq('entity_id', entityId)
    .ilike('body', `%${tag}%`).limit(1);
  if (existing && existing.length) return false;
  await supabase.from('danubra_activities').insert({
    entity_type: entityType, entity_id: entityId, type: 'system',
    body: `${body} ${tag}`,
  });
  return true;
}

/** Existuje tabuľka? Migrácie nemusia byť spustené všetky. */
async function tableExists(name) {
  const { error } = await supabase.from(name).select('id', { head: true, count: 'exact' }).limit(1);
  return !error;
}

/** Založí automatickú pripomienku, ak s rovnakým kľúčom ešte neexistuje. */
async function upsertAutoTask(t) {
  const { data: existing } = await supabase
    .from('danubra_tasks').select('id, status').eq('source_key', t.source_key).maybeSingle();
  if (existing) return false;
  const { error } = await supabase.from('danubra_tasks').insert({
    ...t, level: 'auto', source: 'cron', status: 'open',
  });
  return !error;
}

exports.handler = async (event) => {
  if (!authorized(event)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Neautorizované' }) };
  }
  const today = todaySk();
  const s = { today, toInProgress: 0, toEndingSoon: 0, toCompleted: 0,
    paymentReminders: 0, overdue: 0, listings: 0, staleRequests: 0, expiredOffers: 0,
    autoTasks: 0, errors: [] };

  try {
    // ── 1. Prechody stavov podľa dátumov ────────────────────────────────────
    const { data: orders } = await supabase
      .from('danubra_orders').select('*')
      .in('status', ['awaiting_payment', 'paid', 'owner_confirmed', 'in_progress', 'ending_soon']);

    for (const o of orders || []) {
      // pobyt začal
      if (['paid', 'owner_confirmed'].includes(o.status) && o.date_from <= today && o.date_to >= today) {
        await supabase.from('danubra_orders').update({ status: 'in_progress' }).eq('id', o.id);
        await noteOnce('order', o.id, 'in_progress', 'Pobyt začal — zákazka je medzi prebiehajúcimi');
        s.toInProgress++;
        o.status = 'in_progress';
      }
      // končí čoskoro (≤ 7 dní)
      if (o.status === 'in_progress' && daysBetween(today, o.date_to) <= 7 && o.date_to >= today) {
        await supabase.from('danubra_orders').update({ status: 'ending_soon' }).eq('id', o.id);
        await noteOnce('order', o.id, 'ending_soon',
          `Pobyt končí ${o.date_to} — ponúknuť predĺženie`);
        s.toEndingSoon++;
        o.status = 'ending_soon';
      }
      // ukončené
      if (['in_progress', 'ending_soon'].includes(o.status) && o.date_to < today) {
        await supabase.from('danubra_orders').update({ status: 'completed' }).eq('id', o.id);
        // uzavri otvorené segmenty ku dňu odchodu
        const { data: segs } = await supabase
          .from('danubra_order_service_periods').select('id, period_to').eq('order_id', o.id);
        for (const seg of (segs || [])) {
          if (seg.period_to == null) {
            await supabase.from('danubra_order_service_periods')
              .update({ period_to: o.date_to }).eq('id', seg.id);
          }
        }
        await noteOnce('order', o.id, 'completed', 'Pobyt ukončený — segmenty služby uzavreté');
        s.toCompleted++;
        continue;
      }
      // pripomienky platby: +2, +5, alert +7
      if (o.status === 'awaiting_payment' && o.accepted_at) {
        const since = String(o.accepted_at).slice(0, 10);
        const age = daysBetween(since, today);
        if ([2, 5].includes(age)) {
          if (await noteOnce('order', o.id, `payrem${age}`,
            `Pripomienka platby (${age}. deň) — poplatok stále neuhradený`)) s.paymentReminders++;
        } else if (age >= 7) {
          if (await noteOnce('order', o.id, 'payalert',
            `Poplatok neuhradený ${age} dní — rozhodnúť o zrušení`)) s.paymentReminders++;
        }
      }
    }

    // ── 2. Faktúry po splatnosti ────────────────────────────────────────────
    const { data: late } = await supabase
      .from('danubra_invoices').select('id, invoice_number, client_id, due_date, order_id')
      .eq('status', 'issued').lt('due_date', today);
    for (const inv of late || []) {
      await supabase.from('danubra_invoices').update({ status: 'overdue' }).eq('id', inv.id);
      if (inv.order_id) {
        await noteOnce('order', inv.order_id, 'overdue',
          `Faktúra ${inv.invoice_number} je po splatnosti (${inv.due_date})`);
      }
      s.overdue++;
    }

    // ── 3. Inzeráty na obnovenie (do 7 dní) ─────────────────────────────────
    const { data: listings } = await supabase
      .from('danubra_marketing_listings').select('id, platform, renew_at')
      .eq('status', 'active').lte('renew_at', addDays(today, 7));
    for (const l of listings || []) {
      await supabase.from('danubra_marketing_listings').update({ status: 'to_renew' }).eq('id', l.id);
      s.listings++;
    }

    // ── 4. Požiadavky bez odozvy > 24 h ─────────────────────────────────────
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: stale } = await supabase
      .from('danubra_order_requests').select('id, order_id, title, created_at')
      .eq('status', 'new').lt('created_at', cutoff);
    for (const r of stale || []) {
      if (await noteOnce('order', r.order_id, `req${r.id.slice(0, 8)}`,
        `Požiadavka „${r.title}" čaká viac ako 24 hodín`)) s.staleRequests++;
    }

    // ── 4b. Automatické pripomienky (úroveň 2) ──────────────────────────────
    // Generujú sa z dátumových polí naprieč modulmi. Idempotencia je zaistená
    // jedinečným source_key, takže opakované spustenie nič nezduplikuje.
    if (await tableExists('danubra_tasks')) {
      const horizon = addDays(today, 45);

      // A1 pracovníkov, ktoré končia
      const { data: docs } = await supabase
        .from('danubra_worker_documents')
        .select('id, worker_id, kind, valid_to')
        .eq('kind', 'a1').not('valid_to', 'is', null).lte('valid_to', horizon);
      for (const d of (docs || [])) {
        const { data: w } = await supabase
          .from('danubra_workers').select('full_name, status').eq('id', d.worker_id).maybeSingle();
        if (!w || !['ready', 'deployed'].includes(w.status)) continue;
        const expired = d.valid_to < today;
        await upsertAutoTask({
          source_key: `a1:${d.id}:${d.valid_to}`,
          source_field: 'danubra_worker_documents.valid_to',
          title: expired ? `A1 pre ${w.full_name} je neplatné` : `Požiadať o nové A1 pre ${w.full_name}`,
          description: `Platnosť ${expired ? 'skončila' : 'končí'} ${d.valid_to}. `
            + 'Sociálna poisťovňa vystavuje A1 až 45 dní.',
          entity_type: 'worker', entity_id: d.worker_id, entity_label: w.full_name,
          priority: 'high', due_date: expired ? today : addDays(d.valid_to, -45),
        });
      }

      // firemné compliance položky pred koncom platnosti
      const { data: comp } = await supabase
        .from('danubra_compliance').select('id, kind, valid_to, scope')
        .eq('scope', 'company').not('valid_to', 'is', null).lte('valid_to', horizon);
      const KIND_LABEL = {
        freistellung_48b: 'Freistellungsbescheinigung §48b', ust_idnr: 'USt-IdNr',
        soka_registration: 'Registrácia SOKA-BAU', handwerksrolle: 'Oznámenie §9 HwO',
        insurance: 'Betriebshaftpflicht',
      };
      for (const c of (comp || [])) {
        await upsertAutoTask({
          source_key: `compliance:${c.id}:${c.valid_to}`,
          source_field: 'danubra_compliance.valid_to',
          title: `Obnoviť ${KIND_LABEL[c.kind] || c.kind}`,
          description: `Platnosť končí ${c.valid_to}.`,
          entity_type: null, entity_id: null, entity_label: null,
          priority: 'high', due_date: addDays(c.valid_to, -30),
        });
      }

      // inzeráty na obnovenie
      const { data: lst } = await supabase
        .from('danubra_marketing_listings').select('id, platform, renew_at')
        .eq('status', 'to_renew').not('renew_at', 'is', null);
      for (const l of (lst || [])) {
        await upsertAutoTask({
          source_key: `listing:${l.id}:${l.renew_at}`,
          source_field: 'danubra_marketing_listings.renew_at',
          title: `Obnoviť inzerát ${l.platform || ''}`.trim(),
          description: `Platnosť končí ${l.renew_at}.`,
          entity_type: null, entity_id: null, entity_label: null,
          priority: 'normal', due_date: l.renew_at,
        });
      }

      // kandidáti bez prvej reakcie
      if (await tableExists('danubra_candidates')) {
        const { data: cands } = await supabase
          .from('danubra_candidates').select('id, full_name, received_at')
          .eq('status', 'new').is('first_contact_at', null);
        for (const c of (cands || [])) {
          await upsertAutoTask({
            source_key: `candidate:${c.id}`,
            source_field: 'danubra_candidates.first_contact_at',
            title: `Ozvať sa kandidátovi ${c.full_name}`,
            description: 'Cieľ je prvá reakcia do desiatich minút od prijatia.',
            entity_type: 'candidate', entity_id: c.id, entity_label: c.full_name,
            priority: 'high', due_date: today,
          });
        }
      }
    }

    // ── 5. Expirované ponuky ────────────────────────────────────────────────
    const { data: offers } = await supabase
      .from('danubra_offers').select('id').eq('status', 'sent').lt('valid_until', today);
    for (const o of offers || []) {
      await supabase.from('danubra_offers').update({ status: 'expired' }).eq('id', o.id);
      s.expiredOffers++;
    }
  } catch (err) {
    s.fatal = err.message;
    console.error('[danubra-daily]', err);
  }

  console.log('[danubra-cron-daily]', JSON.stringify(s));
  return { statusCode: 200, body: JSON.stringify(s) };
};

// 04:00 UTC ≈ 06:00 SK v lete, 05:00 v zime — pred začiatkom pracovného dňa
exports.config = { schedule: '0 4 * * *' };
