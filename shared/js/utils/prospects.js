/**
 * ADLIFY — Prospects Helper v1
 *
 * Funkcie pre prácu s `prospects` tabuľkou:
 *   - evaluateConversionRules(prospect, event, settings)
 *       → vráti { shouldConvert, reason } podľa outreach_settings organizácie
 *   - promoteToLead(prospectId, reason)
 *       → vytvorí záznam v `leads` (kopíruje dáta), označí prospect ako 'converted'
 *         a nastaví audit trail na oboch stranách
 *   - getOutreachSettings()
 *       → načíta outreach_settings z organizácie (s default fallbackom)
 *
 * Závislosť: window.Database (supabase client wrapper)
 */

(function () {
  'use strict';

  const DEFAULT_SETTINGS = {
    auto_convert: {
      audit_clicked: true,
      call_booked: true,
      form_submitted: true,
      email_replied: false,
      email_opened_n: false,
      email_open_threshold: 3,
    },
    cooldown_days_after_lost: 90,
    sender_name: 'Štefan Varga',
    sender_title: 'Adlify',
  };

  // ---------------------------------------------------------------
  // Event → pravidlo mapping
  // ---------------------------------------------------------------
  const EVENT_TO_RULE = {
    audit_requested: 'audit_clicked',
    audit_clicked: 'audit_clicked',
    call_booked: 'call_booked',
    form_submitted: 'form_submitted',
    email_replied: 'email_replied',
    email_opened: 'email_opened_n',
  };

  /**
   * Vyhodnotí, či má byť prospect automaticky premenený na lead
   * na základe udalosti a user settings.
   *
   * @param {object} prospect
   * @param {string} event  jeden z: audit_requested | call_booked | form_submitted | email_replied | email_opened
   * @param {object} settings  outreach_settings (auto_convert: {...})
   * @returns {{ shouldConvert: boolean, reason: string | null }}
   */
  function evaluateConversionRules(prospect, event, settings) {
    const cfg = (settings && settings.auto_convert) || DEFAULT_SETTINGS.auto_convert;
    const ruleKey = EVENT_TO_RULE[event];
    if (!ruleKey) return { shouldConvert: false, reason: null };
    if (!cfg[ruleKey]) return { shouldConvert: false, reason: null };

    // Špeciálny prípad: email_opened_n — promote až po N otvoreniach
    if (ruleKey === 'email_opened_n') {
      const threshold = Number(cfg.email_open_threshold) || 3;
      const count = Number(prospect.outreach_email_open_count || 0);
      if (count < threshold) return { shouldConvert: false, reason: null };
      return { shouldConvert: true, reason: `email_opened_${count}x` };
    }

    return { shouldConvert: true, reason: event };
  }

  /**
   * Načíta outreach_settings pre aktuálnu org (alebo prvý org pre single-org setup).
   * Fallback na DEFAULT_SETTINGS ak DB nevráti nič.
   */
  async function getOutreachSettings() {
    if (!window.Database?.client) return DEFAULT_SETTINGS;
    try {
      const { data, error } = await Database.client
        .from('organizations')
        .select('outreach_settings')
        .limit(1)
        .single();
      if (error || !data?.outreach_settings) return DEFAULT_SETTINGS;
      // plytký merge s defaults pre chýbajúce kľúče
      return {
        ...DEFAULT_SETTINGS,
        ...data.outreach_settings,
        auto_convert: {
          ...DEFAULT_SETTINGS.auto_convert,
          ...(data.outreach_settings.auto_convert || {}),
        },
      };
    } catch (e) {
      console.warn('getOutreachSettings fallback → default', e);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Vytvorí záznam v `leads` z prospect dát a označí prospect ako 'converted'.
   *
   * @param {string} prospectId
   * @param {string} reason  napr. 'audit_clicked', 'call_booked', 'manual'
   * @returns {Promise<{ lead: object | null, error: Error | null }>}
   */
  async function promoteToLead(prospectId, reason = 'manual') {
    if (!window.Database?.client) {
      return { lead: null, error: new Error('Database not ready') };
    }

    try {
      // 1. Načítaj prospect
      const { data: prospect, error: fetchErr } = await Database.client
        .from('prospects')
        .select('*')
        .eq('id', prospectId)
        .single();
      if (fetchErr || !prospect) {
        throw new Error(`Prospect ${prospectId} not found: ${fetchErr?.message}`);
      }

      // 2. Ak už je converted, vráť existujúci lead
      if (prospect.converted_to_lead_id) {
        const { data: existingLead } = await Database.client
          .from('leads')
          .select('*')
          .eq('id', prospect.converted_to_lead_id)
          .single();
        if (existingLead) return { lead: existingLead, error: null };
      }

      // 3. Vytvor lead (kopíruje data z prospect + analysis obsahuje kontakt info)
      const leadPayload = {
        org_id: prospect.org_id,
        domain: prospect.domain,
        company_name: prospect.company_name,
        status: 'contacted',
        score: prospect.score,
        source: prospect.source || 'outreach',
        source_url: prospect.source_url,
        tags: prospect.tags,
        notes: prospect.notes,
        assigned_to: prospect.assigned_to,
        converted_from_prospect_id: prospect.id,
        analysis: {
          ...(prospect.analysis || {}),
          contact_person: prospect.contact_person,
          email: prospect.email,
          phone: prospect.phone,
          industry: prospect.industry,
          city: prospect.city,
          segment: prospect.segment,
          promoted_from_outreach: true,
          promotion_reason: reason,
          promoted_at: new Date().toISOString(),
        },
      };

      const { data: lead, error: insertErr } = await Database.client
        .from('leads')
        .insert(leadPayload)
        .select()
        .single();
      if (insertErr) throw insertErr;

      // 4. Update prospect → converted
      await Database.client
        .from('prospects')
        .update({
          outreach_stage: 'converted',
          converted_to_lead_id: lead.id,
          converted_at: new Date().toISOString(),
          conversion_reason: reason,
        })
        .eq('id', prospect.id);

      return { lead, error: null };
    } catch (err) {
      console.error('promoteToLead failed:', err);
      return { lead: null, error: err };
    }
  }

  /**
   * Handler po udalosti (napr. klik na audit): zapíše event na prospect
   * a podľa pravidiel (alebo natvrdo) ho promote-ne na lead.
   *
   * @param {string} prospectId
   * @param {string} event
   * @param {object} [eventData]  extra polia na update (napr. audit_requested_at)
   * @returns {Promise<{ prospect: object, lead: object | null, promoted: boolean }>}
   */
  async function recordEventAndMaybePromote(prospectId, event, eventData = {}) {
    if (!window.Database?.client) {
      return { prospect: null, lead: null, promoted: false };
    }

    // 1. Update prospect (event timestamps, counters)
    const patch = { ...eventData };
    if (event === 'email_opened') {
      // inkrementujeme open count
      const { data: curr } = await Database.client
        .from('prospects')
        .select('outreach_email_open_count')
        .eq('id', prospectId)
        .single();
      patch.outreach_email_open_count = Number(curr?.outreach_email_open_count || 0) + 1;
      if (!patch.outreach_email_opened_at) patch.outreach_email_opened_at = new Date().toISOString();
    }

    const { data: prospect } = await Database.client
      .from('prospects')
      .update(patch)
      .eq('id', prospectId)
      .select()
      .single();

    if (!prospect) return { prospect: null, lead: null, promoted: false };

    // 2. Vyhodnoť pravidlá
    const settings = await getOutreachSettings();
    const { shouldConvert, reason } = evaluateConversionRules(prospect, event, settings);
    if (!shouldConvert) return { prospect, lead: null, promoted: false };

    // 3. Promote
    const { lead } = await promoteToLead(prospectId, reason);
    return { prospect, lead, promoted: !!lead };
  }

  // Export
  window.Prospects = {
    DEFAULT_SETTINGS,
    evaluateConversionRules,
    getOutreachSettings,
    promoteToLead,
    recordEventAndMaybePromote,
  };
})();
