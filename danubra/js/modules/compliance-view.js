// ============================================================================
// DANUBRA — Compliance register (firemné povolenia a doklady)
// ============================================================================
// Firemné položky s platnosťami: §48b, USt-IdNr, SOKA-BAU, Handwerksrolle,
// poistenie. Plus prehľad A1 pracovníkov, ktoré končia.
// ============================================================================
(function () {
  const KINDS = [
    ['freistellung_48b', 'Freistellungsbescheinigung §48b', 'Bez nej odberateľ zrazí 15 % z faktúry. Vybavenie 4–8 týždňov cez ELSTER.'],
    ['ust_idnr', 'USt-IdNr', 'Nutné pre reverse charge §13b pri fakturácii nemeckým odberateľom.'],
    ['soka_registration', 'Registrácia SOKA-BAU', 'Povinná pri stavebných prácach nad 50 % pracovného času.'],
    ['handwerksrolle', 'Dienstleistungsanzeige §9 HwO', 'Pri zápisových remeslách, oznámenie na HWK pred prvým výkonom.'],
    ['insurance', 'Betriebshaftpflicht', 'Poistenie zodpovednosti — odberatelia ho spravidla vyžadujú.'],
    ['other', 'Iné', ''],
  ];
  const STATUS = [['active', 'Platné', 'green'], ['pending', 'Vybavuje sa', 'amber'],
    ['expiring', 'Čoskoro vyprší', 'amber'], ['expired', 'Neplatné', 'red'],
    ['not_required', 'Netýka sa nás', 'gray']];

  const Cmp = {
    items: [], workerDocs: [], workers: [], loaded: false,

    async load() {
      const [c, d, w] = await Promise.all([
        DB.list('compliance', { limit: 300 }),
        DB.list('worker_documents', { limit: 2000 }),
        DB.list('workers', { select: 'id,full_name,status', limit: 500 }),
      ]);
      this.items = c.data || []; this.workerDocs = d.data || []; this.workers = w.data || [];
      this.loaded = true;
    },

    kindLabel(k) { const x = KINDS.find(y => y[0] === k); return x ? x[1] : k; },
    workerOf(id) { return this.workers.find(w => w.id === id); },

    /** Prepočíta stav podľa platnosti. */
    state(item) {
      const today = new Date().toISOString().slice(0, 10);
      return DanubraCompliance.docState(item, today, 45);
    },
    stateBadge(st) {
      const map = { valid: ['Platné', 'green'], expiring: ['Čoskoro vyprší', 'amber'],
        expired: ['Neplatné', 'red'], missing: ['Chýba', 'red'], not_yet: ['Ešte neplatí', 'gray'] };
      const m = map[st] || map.missing;
      return UI.badge(m[0], m[1]);
    },

    async view(el) {
      Danubra.setActions(`<button class="btn btn-primary btn-sm" onclick="Cmp.form()">${Icon('plus')} Pridať položku</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const today = new Date().toISOString().slice(0, 10);

      const company = this.items.filter(i => i.scope === 'company');
      const problems = company.filter(i => ['expired', 'missing'].includes(this.state(i)));
      const expiring = company.filter(i => this.state(i) === 'expiring');

      // A1 pracovníkov, ktoré končia alebo chýbajú
      const a1 = this.workerDocs.filter(d => d.kind === 'a1');
      const a1ByWorker = new Map();
      for (const d of a1) {
        const cur = a1ByWorker.get(d.worker_id);
        if (!cur || String(d.valid_to || '') > String(cur.valid_to || '')) a1ByWorker.set(d.worker_id, d);
      }
      const activeWorkers = this.workers.filter(w => ['ready', 'deployed'].includes(w.status));
      const a1Problems = activeWorkers.map(w => ({ worker: w, doc: a1ByWorker.get(w.id) }))
        .map(x => ({ ...x, st: DanubraCompliance.docState(x.doc, today, 45) }))
        .filter(x => x.st !== 'valid');

      // ktoré povinné položky vôbec chýbajú
      const missing = KINDS.filter(k => k[0] !== 'other')
        .filter(k => !company.some(c => c.kind === k[0]));

      el.innerHTML = Danubra.header('Compliance',
        `${company.length} firemných položiek · ${a1Problems.length} problémov s A1`) +
        (problems.length ? `<div class="warnbox" style="margin-bottom:14px;">
          ${Icon('alert', 14)} ${problems.length} ${problems.length === 1 ? 'položka je' : 'položiek je'}
          neplatných — bez nich sa nesmie vysielať ani fakturovať.</div>` : '') + `

        <div class="kpi-grid" style="margin-bottom:16px;">
          <div class="kpi"><div class="kpi-label">Platné položky</div>
            <div class="kpi-value" style="color:var(--green);">${company.filter(i => this.state(i) === 'valid').length}</div>
            <div class="kpi-delta">v poriadku</div></div>
          <div class="kpi"><div class="kpi-label">Čoskoro vypršia</div>
            <div class="kpi-value" style="color:${expiring.length ? 'var(--amber)' : 'var(--green)'};">${expiring.length}</div>
            <div class="kpi-delta">do 45 dní</div></div>
          <div class="kpi"><div class="kpi-label">Neplatné</div>
            <div class="kpi-value" style="color:${problems.length ? 'var(--red)' : 'var(--green)'};">${problems.length}</div>
            <div class="kpi-delta">blokujú prácu</div></div>
          <div class="kpi"><div class="kpi-label">Problémy s A1</div>
            <div class="kpi-value" style="color:${a1Problems.length ? 'var(--red)' : 'var(--green)'};">${a1Problems.length}</div>
            <div class="kpi-delta">u aktívnych ľudí</div></div>
        </div>

        <div class="form-section">Firemné povolenia a doklady</div>
        ${company.length ? company.map(i => this.row(i)).join('')
          : '<div style="color:var(--ink-mute);font-size:13px;">Zatiaľ nič nezaevidované.</div>'}

        ${missing.length ? `
        <div class="form-section">Čo ešte chýba zaevidovať</div>
        ${missing.map(k => `<div class="list-row" style="cursor:default;align-items:flex-start;">
          <span class="dot amber" style="margin-top:5px;"></span>
          <span style="flex:1;font-size:13px;"><strong>${UI.esc(k[1])}</strong>
            ${k[2] ? `<span style="display:block;color:var(--ink-mute);font-size:12px;">${UI.esc(k[2])}</span>` : ''}</span>
          <button class="btn btn-ghost btn-sm" onclick="Cmp.form(null,'${k[0]}')">${Icon('plus', 15)}</button>
        </div>`).join('')}` : ''}

        ${a1Problems.length ? `
        <div class="form-section">A1 pracovníkov</div>
        ${a1Problems.map(x => `<div class="list-row" style="cursor:default;">
          <span class="dot ${x.st === 'expiring' ? 'amber' : 'red'}"></span>
          <span style="flex:1;font-size:13px;"><strong>${UI.esc(x.worker.full_name)}</strong>
            <span style="display:block;color:var(--ink-mute);font-size:12px;">
              ${x.st === 'missing' ? 'nemá zaevidované A1' :
                x.st === 'expired' ? `A1 skončilo ${UI.date(x.doc.valid_to)}` :
                `A1 platí do ${UI.date(x.doc.valid_to)}`}
              · vystavenie trvá až 45 dní</span></span>
          ${this.stateBadge(x.st)}
        </div>`).join('')}` : ''}`;
    },

    row(i) {
      const st = this.state(i);
      const kind = KINDS.find(k => k[0] === i.kind);
      return `
        <div class="list-row" onclick="Cmp.form('${i.id}')" style="align-items:flex-start;">
          <span class="dot ${st === 'valid' ? 'green' : st === 'expiring' ? 'amber' : 'red'}" style="margin-top:5px;"></span>
          <span style="flex:1;font-size:13px;">
            <strong>${UI.esc(this.kindLabel(i.kind))}</strong>
            ${i.reference ? `<span style="color:var(--ink-mute);"> · ${UI.esc(i.reference)}</span>` : ''}
            <span style="display:block;color:var(--ink-mute);font-size:12px;">
              ${i.valid_from ? UI.date(i.valid_from) : '—'} – ${i.valid_to ? UI.date(i.valid_to) : 'bez konca'}
              ${i.responsible ? ` · ${UI.esc(i.responsible)}` : ''}</span>
            ${kind?.[2] && st !== 'valid' ? `<span style="display:block;color:var(--blue);font-size:12px;">→ ${UI.esc(kind[2])}</span>` : ''}
          </span>
          ${this.stateBadge(st)}
        </div>`;
    },

    form(id, presetKind) {
      const i = id ? this.items.find(x => x.id === id) || {} : {};
      const body = `
        <form id="cmp-form" onsubmit="event.preventDefault();Cmp.save('${id || ''}')">
          <div class="form-grid">
            ${UI.field('kind', 'Typ', { value: i.kind || presetKind || 'freistellung_48b',
              options: KINDS.map(k => [k[0], k[1]]) })}
            ${UI.field('reference', 'Číslo / referencia', { value: i.reference })}
            ${UI.field('valid_from', 'Platí od', { type: 'date', value: i.valid_from })}
            ${UI.field('valid_to', 'Platí do', { type: 'date', value: i.valid_to })}
            ${UI.field('status', 'Stav', { value: i.status || 'active', options: STATUS.map(s => [s[0], s[1]]) })}
            ${UI.field('responsible', 'Kto to rieši', { value: i.responsible, placeholder: 'Michaela / účtovník' })}
          </div>
          ${UI.field('file_url', 'Odkaz na dokument', { type: 'url', value: i.file_url })}
          ${UI.field('notes', 'Poznámka', { type: 'textarea', rows: 2, value: i.notes })}
          <div class="regimebox">Pri položkách s obmedzenou platnosťou žiadaj o predĺženie
          s predstihom — §48b sa vybavuje 4 až 8 týždňov, A1 až 45 dní.</div>
          <div class="modal-actions">
            ${id ? `<button type="button" class="btn btn-danger btn-sm" onclick="Cmp.del('${id}')">Zmazať</button>` : ''}
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Pridať'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť položku' : 'Nová položka', body, { wide: true });
    },

    async save(id) {
      const d = UI.formData(document.getElementById('cmp-form'));
      const payload = { ...d, scope: 'company', entity_id: null };
      ['valid_from', 'valid_to'].forEach(k => { if (payload[k] === '') payload[k] = null; });
      const res = id ? await DB.update('compliance', id, payload) : await DB.insert('compliance', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast(id ? 'Uložené' : 'Pridané', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    async del(id) {
      if (!confirm('Zmazať túto položku?')) return;
      await DB.remove('compliance', id);
      this.items = this.items.filter(x => x.id !== id);
      UI.closeModal(); Danubra.renderRoute();
    },
  };

  window.Cmp = Cmp;
  Danubra.views.compliance = function (el) { Cmp.view(el); };
})();
