// ============================================================================
// DANUBRA — Cenník a pravidlá + Nastavenia
// ============================================================================
// Dve obrazovky nad jedným riadkom nastavení:
//   Cenník a pravidlá — sadzby, poplatky a prahy, ktoré vstupujú do výpočtov
//   Nastavenia        — fakturačné údaje, číselné rady, automatizácie, retencia
// ============================================================================
(function () {
  const Cfg = {
    row: null, loaded: false,

    async load() {
      const { data } = await DB.list('settings', { limit: 1 });
      this.row = (data && data[0]) || null;
      if (!this.row) {
        const { data: created } = await DB.insert('settings', {});
        this.row = created;
      }
      this.loaded = true;
    },

    j(key) { return (this.row && this.row[key]) || {}; },

    async patch(key, values) {
      const merged = { ...this.j(key), ...values };
      const { error } = await DB.update('settings', this.row.id, { [key]: merged });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      this.row[key] = merged;
      UI.toast('Uložené', 'ok');
      Danubra.renderRoute();
    },

    /** Formulár nad jedným JSON stĺpcom. */
    section(title, note, key, fields) {
      const v = this.j(key);
      const formId = `cfg-${key}`;
      return `
        <div class="card card-pad" style="margin-bottom:16px;">
          <div class="card-head"><div class="card-title">${UI.esc(title)}</div></div>
          ${note ? `<div class="regimebox" style="margin:0 0 12px;">${note}</div>` : ''}
          <form id="${formId}" onsubmit="event.preventDefault();Cfg.saveSection('${key}','${formId}')">
            <div class="form-grid">
              ${fields.map(f => UI.field(f[0], f[1], {
                type: f[2] || 'text', value: v[f[0]] ?? f[3] ?? '',
                placeholder: f[4] || '', options: f[5],
              })).join('')}
            </div>
            <div style="display:flex;justify-content:flex-end;margin-top:12px;">
              <button type="submit" class="btn btn-primary btn-sm">${Icon('check')} Uložiť</button>
            </div>
          </form>
        </div>`;
    },

    async saveSection(key, formId) {
      const form = document.getElementById(formId);
      const d = UI.formData(form);
      // čísla ulož ako čísla, nie reťazce
      const out = {};
      for (const [k, val] of Object.entries(d)) {
        const el = form.querySelector(`[name="${k}"]`);
        if (el && el.type === 'number') out[k] = val === '' ? null : Number(val);
        else if (el && el.type === 'checkbox') out[k] = !!val;
        else out[k] = val;
      }
      await this.patch(key, out);
    },

    // ── Cenník a pravidlá ─────────────────────────────────────────────────
    async rulesView(el) {
      Danubra.setActions('');
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      el.innerHTML = Danubra.header('Cenník a pravidlá',
        'Sadzby a prahy, ktoré vstupujú do výpočtov marže, faktúr a compliance') +

        this.section('Ubytovanie — poplatky',
          'Predvolené hodnoty pri tvorbe ponuky. Pri konkrétnej ponuke sa dajú prepísať.',
          'pricing', [
          ['fee_individual', 'Poplatok — jednotlivec €', 'number', 150],
          ['fee_crew', 'Poplatok — parta €', 'number', 250],
          ['fee_company', 'Poplatok — firma €', 'number', 400],
          ['urgent_percent', 'Príplatok za súrnosť %', 'number', 20],
          ['ongoing_service_rate_default', 'Priebežná služba €/os./deň', 'number', 1.5],
          ['retainer_individual', 'Retainer — jednotlivec €', 'number', 50],
          ['retainer_company', 'Retainer — firma €', 'number', 200],
        ]) +

        this.section('Subdodávky — mzdové náklady',
          'Vstupujú do výpočtu marže na pracovníka. SOKA-BAU sa účtuje len pri stavebných prácach.',
          'staffing', [
          ['employer_contrib_pct', 'Odvody zamestnávateľa SR %', 'number', 36.2],
          ['per_diem_de', 'Diéty Nemecko €/deň', 'number', 45],
          ['soka_pct', 'SOKA-BAU %', 'number', 14.7],
        ]) +

        this.section('Subdodávky — nemecké minimálne mzdy',
          'Kontrola pri nasadení. Pod týmito sadzbami compliance zákazku zablokuje — '
          + 'rozhodujúci je tarifný nárok, aj keď sa reálne vyplatilo menej.',
          'staffing', [
          ['bau_min_lg1', 'Bau-Mindestlohn LG1 €/h', 'number', 15.86],
          ['bau_min_lg2', 'Bau-Mindestlohn LG2 €/h', 'number', 17.34],
          ['general_min_wage', 'Všeobecný Mindestlohn €/h', 'number', 13.90],
          ['withholding_pct', 'Zrážka bez §48b %', 'number', 15],
        ]) +

        this.section('Prahy pre rozhodovanie',
          'Keď sa prekročia, aplikácia to ohlási na dashboarde. Podľa biznis plánu je '
          + 'likvidita najpravdepodobnejší dôvod zlyhania, nie nedostatok dopytu.',
          'staffing', [
          ['target_margin_per_worker', 'Minimálna marža na pracovníka €', 'number', 1000],
          ['dso_alert_days', 'Doba inkasa, nad ktorou neškálovať (dní)', 'number', 45],
        ]);
    },

    // ── Nastavenia ────────────────────────────────────────────────────────
    async settingsView(el) {
      Danubra.setActions('');
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const inv = this.j('invoice_series'), ord = this.j('order_series'), sub = this.j('subcontract_series');
      const sup = this.j('supplier');

      el.innerHTML = Danubra.header('Nastavenia', 'Fakturačné údaje, číselné rady a automatizácie') +

        (!sup.iban ? `<div class="warnbox" style="margin-bottom:14px;">
          ${Icon('alert', 14)} Bez IBAN sa na faktúrach nevykreslí QR platba.</div>` : '') +

        this.section('Fakturačné údaje',
          'Objavujú sa na faktúrach a ostatných dokumentoch.',
          'supplier', [
          ['name', 'Názov firmy', 'text', 'DANUBRA s.r.o.'],
          ['iban', 'IBAN', 'text', '', 'SK00 0000 0000 0000 0000 0000'],
          ['company_id', 'IČO', 'text'],
          ['vat_id', 'IČ DPH', 'text'],
          ['email', 'E-mail', 'email'],
          ['phone', 'Telefón', 'text'],
          ['address', 'Adresa', 'text'],
          ['vat_note', 'Poznámka k DPH', 'text', 'Nie sme platiteľmi DPH.'],
        ]) +

        `<div class="card card-pad" style="margin-bottom:16px;">
          <div class="card-head"><div class="card-title">Číselné rady</div></div>
          <div class="regimebox" style="margin:0 0 12px;">
            Čísla prideľuje databáza transakčne, takže nikdy nevznikne diera ani duplicita.
            Pri zmene roka sa rad automaticky vynuluje.</div>
          <div class="kv">
            <div><span>Objednávky</span><strong class="mono">OBJ-${ord.year || '—'}-${String(ord.current || 0).padStart(4, '0')}</strong></div>
            <div><span>Faktúry</span><strong class="mono">${inv.year || '—'}${String(inv.current || 0).padStart(3, '0')}</strong></div>
            <div><span>Zákazky</span><strong class="mono">ZAK-${sub.year || '—'}-${String(sub.current || 0).padStart(4, '0')}</strong></div>
          </div>
        </div>` +

        this.section('Automatizácie',
          'Čo smie systém robiť sám. Faktúry za priebežnú službu sa neodosielajú '
          + 'automaticky nikdy — bez ohľadu na toto nastavenie.',
          'automations', [
          ['payment_reminders', 'Pripomienky platby', 'checkbox', true],
          ['ending_soon_alert', 'Upozornenie na blížiaci sa koniec pobytu', 'checkbox', true],
          ['sms_pre_arrival', 'SMS s pokynmi dva dni pred nástupom', 'checkbox', false],
          ['review_request', 'Žiadosť o hodnotenie po ukončení', 'checkbox', false],
        ]) +

        this.section('Marketing a SMS',
          '',
          'marketing', [
          ['monthly_budget', 'Mesačný rozpočet na marketing €', 'number', 300],
          ['sms_monthly_limit', 'Mesačný limit SMS (segmentov)', 'number', 200],
        ]) +

        this.section('AI nábor',
          'Nahrávanie hovoru je zákonné len s výslovným súhlasom oboch strán daným pred '
          + 'začiatkom — na Slovensku podľa §377 Trestného zákona, v Nemecku podľa §201 StGB. '
          + 'Požiadavku na súhlas nie je možné vypnúť.',
          'recruiting', [
          ['retention_days', 'Uchovávať nahrávky (dní)', 'number', 180],
          ['consent_script_sk', 'Znenie otázky na súhlas — slovensky', 'textarea'],
          ['consent_script_de', 'Znenie otázky na súhlas — nemecky', 'textarea'],
        ]);
    },
  };

  window.Cfg = Cfg;
  Danubra.views.rules = function (el) { Cfg.rulesView(el); };
  Danubra.views.settings = function (el) { Cfg.settingsView(el); };
})();
