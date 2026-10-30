// ============================================================================
// DANUBRA — AI nábor: hovory, súhlasy a zachytené dohody
// ============================================================================
// Rieši „povedalo sa, ale nezapísalo sa". Súhlas je podmienka, nie formalita —
// bez neho sa nahrávka nedá nahrať ani spracovať.
// ============================================================================
(function () {
  const REC_STATUS = {
    awaiting_consent: ['Čaká na súhlas', 'amber'], uploaded: ['Nahraté', 'blue'],
    transcribing: ['Prepisuje sa', 'blue'], transcribed: ['Prepísané', 'blue'],
    extracting: ['Spracúva sa', 'blue'], done: ['Spracované', 'green'],
    failed: ['Zlyhalo', 'red'], deleted: ['Zmazané', 'gray'],
  };
  const PROMISE_KIND = {
    wage: 'Mzda', accommodation: 'Ubytovanie', start_date: 'Termín nástupu',
    transport: 'Doprava', per_diem: 'Diéty', working_hours: 'Pracovný čas',
    equipment: 'Náradie a vybavenie', other: 'Iné',
  };
  const PROMISE_STATUS = {
    open: ['Otvorené', 'amber'], fulfilled: ['Splnené', 'green'],
    broken: ['Nesplnené', 'red'], cancelled: ['Zrušené', 'gray'], disputed: ['Sporné', 'red'],
  };

  const Rec = {
    recordings: [], promises: [], consents: [], workers: [], loaded: false, tab: 'promises',

    async load() {
      const [r, p, c, w] = await Promise.all([
        DB.list('call_recordings', { order: { column: 'recorded_at', ascending: false }, limit: 300 }),
        DB.list('promises', { order: { column: 'created_at', ascending: false }, limit: 500 }),
        DB.list('consents', { order: { column: 'created_at', ascending: false }, limit: 300 }),
        DB.list('workers', { select: 'id,full_name,phone,language,status', limit: 500 }),
      ]);
      this.recordings = r.data || []; this.promises = p.data || [];
      this.consents = c.data || []; this.workers = w.data || [];
      this.loaded = true;
    },

    workerOf(id) { return this.workers.find(w => w.id === id); },
    recBadge(s) { const m = REC_STATUS[s] || REC_STATUS.uploaded; return UI.badge(m[0], m[1]); },
    prBadge(s) { const m = PROMISE_STATUS[s] || PROMISE_STATUS.open; return UI.badge(m[0], m[1]); },

    /** Má osoba platný súhlas s nahrávaním? */
    consentOf(subjectId, phone) {
      return this.consents.find(c =>
        c.kind === 'call_recording' && c.granted && !c.revoked_at &&
        ((subjectId && c.subject_id === subjectId) || (phone && c.subject_phone === phone)));
    },

    async view(el) {
      Danubra.setActions(`
        <button class="btn btn-outline btn-sm" onclick="Rec.consentForm()">${Icon('shield')} Zaznamenať súhlas</button>
        <button class="btn btn-primary btn-sm" onclick="Rec.uploadForm()">${Icon('upload')} Pridať hovor</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }

      const open = this.promises.filter(p => p.status === 'open');
      const broken = this.promises.filter(p => p.status === 'broken');
      const overdue = open.filter(p => p.due_date && p.due_date < new Date().toISOString().slice(0, 10));
      const noConsent = this.recordings.filter(r => !r.consent_confirmed && r.status !== 'deleted');

      el.innerHTML = Danubra.header(Danubra.labelOf('recruiting'),
        `${this.promises.length} zachytených dohôd · ${open.length} otvorených · ${this.recordings.length} hovorov`) +
        (noConsent.length ? `<div class="warnbox" style="margin-bottom:14px;">
          ${Icon('alert', 14)} ${noConsent.length} ${noConsent.length === 1 ? 'nahrávka nemá' : 'nahrávok nemá'}
          potvrdený súhlas — nedajú sa spracovať a mali by sa zmazať.</div>` : '') +
        (broken.length ? `<div class="warnbox" style="margin-bottom:14px;">
          ${Icon('alert', 14)} ${broken.length} ${broken.length === 1 ? 'sľub je označený' : 'sľubov je označených'}
          ako nesplnený — to je najčastejší dôvod odchodu pracovníka.</div>` : '') + `

        <div class="kpi-grid" style="margin-bottom:16px;">
          <div class="kpi"><div class="kpi-label">Otvorené sľuby${UI.tip('Dohody z hovorov (sadzba, ubytovanie, termín…), o ktorých ešte nevieme, či sme ich dodržali. Keď sa splnia alebo nesplnia, zmeňte stav pri dohode v zozname nižšie.')}</div>
            <div class="kpi-value">${open.length}</div>
            <div class="kpi-delta ${overdue.length ? 'warn' : ''}">${overdue.length ? `${overdue.length} po termíne` : 'v termíne'}</div></div>
          <div class="kpi"><div class="kpi-label">Splnené</div>
            <div class="kpi-value" style="color:var(--green);">${this.promises.filter(p => p.status === 'fulfilled').length}</div>
            <div class="kpi-delta">dodržali sme</div></div>
          <div class="kpi"><div class="kpi-label">Nesplnené${UI.tip('Sľuby, ktoré sme človeku dali a nedodržali. Kvôli tomu ľudia najčastejšie odchádzajú, preto to treba riešiť hneď.')}</div>
            <div class="kpi-value" style="color:${broken.length ? 'var(--red)' : 'var(--green)'};">${broken.length}</div>
            <div class="kpi-delta">riziko odchodu</div></div>
          <div class="kpi"><div class="kpi-label">Platné súhlasy${UI.tip('Koľko ľudí nám dalo súhlas s nahrávaním hovoru a neodvolalo ho. Bez súhlasu sa hovor nesmie nahrať ani spracovať.')}</div>
            <div class="kpi-value">${this.consents.filter(c => c.granted && !c.revoked_at).length}</div>
            <div class="kpi-delta">s nahrávaním</div></div>
        </div>

        ${Shell.tabs([
          ['promises', 'Dohody', 'note', this.promises.length],
          ['calls', 'Hovory', 'phone', this.recordings.length],
          ['consents', 'Súhlasy', 'shield', this.consents.length],
        ], this.tab, k => `Rec.setTab('${k}')`)}
        ${this.tab === 'promises' ? this.promisesHtml()
          : this.tab === 'calls' ? this.callsHtml() : this.consentsHtml()}`;
    },

    // ── Zoznamy (DataList) ────────────────────────────────────────────────
    // Dohody, hovory a súhlasy sú spoločné zoznamy s filtrami, zoradením
    // a exportom. Dovtedy to boli riadky pod sebou bez filtra — nesplnený
    // sľub sa hľadal očami.

    promiseRow(p, today) {
      const w = this.workerOf(p.subject_id);
      const late = p.status === 'open' && !!p.due_date && String(p.due_date).slice(0, 10) < today;
      return {
        id: p.id, p, w, late,
        lowConf: p.confidence != null && p.confidence < 0.6,
        kind: PROMISE_KIND[p.kind] || p.kind || '',
        who: (w && w.full_name) || p.subject_name || '',
        statement: p.statement || '',
      };
    },

    promisesHtml() {
      const today = new Date().toISOString().slice(0, 10);
      const ORDER = ['broken', 'disputed', 'open', 'fulfilled', 'cancelled'];
      return DataList.html({
        id: 'dohody', storageKey: 'dohody', label: 'Zachytené dohody',
        noun: ['dohoda', 'dohody', 'dohôd'],
        rows: this.promises.map(p => this.promiseRow(p, today)),
        rowClass: (r) => (r.p.status === 'broken' || r.late ? 'is-hot' : r.p.status === 'disputed' || r.lowConf ? 'is-warn'
          : ['fulfilled', 'cancelled'].includes(r.p.status) ? 'is-muted' : ''),
        columns: [
          { key: 'dohoda', label: 'Dohoda', width: 'minmax(220px, 2.2fr)', mobile: 'title',
            render: (r) => `<span class="dl-title"><b>${UI.esc(r.kind)}${r.lowConf ? ` <button type="button" class="tip-btn dl-flag is-amber" data-tip="Appka si pri tejto dohode z nahrávky nie je istá. Vypočujte si hovor a skontrolujte, či sa to naozaj tak povedalo." aria-label="Overiť: appka si pri tejto dohode nie je istá">overiť</button>` : ''}</b>${
              r.statement ? `<small class="pl-wrap">${UI.esc(r.statement)}</small>` : ''}</span>`,
            sortValue: (r) => r.kind, sortLabel: 'Druh' },
          { key: 'kto', label: 'Komu', width: 'minmax(130px, 1fr)',
            render: (r) => (r.w ? Danubra.link('worker', r.w.id, r.w.full_name) : UI.esc(r.who)),
            sortValue: (r) => r.who },
          { key: 'hodnota', label: 'Hodnota', width: 'minmax(100px, .8fr)', mobileLabel: 'hodnota',
            render: (r) => UI.esc(r.p.value_text || ''), sortValue: (r) => r.p.value_text },
          { key: 'termin', label: 'Termín', width: '116px', mobileLabel: 'termín',
            render: (r) => (r.p.due_date ? `<span class="dl-two"><b>${DanubraDataList.fmtDay(r.p.due_date)}</b>${
              r.late ? '<span class="dl-note is-red">po termíne</span>' : ''}</span>` : ''),
            sortValue: (r) => r.p.due_date },
          { key: 'stav', label: 'Stav', width: '138px', mobile: 'badge',
            tip: 'Zmena stavu sa uloží hneď.',
            render: (r) => `<select class="verif-sel" aria-label="Stav dohody" onchange="Rec.setPromiseStatus('${r.p.id}',this.value)">
              ${Object.entries(PROMISE_STATUS).map(([k, v]) =>
                `<option value="${k}" ${r.p.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>`,
            csv: (r) => (PROMISE_STATUS[r.p.status] || PROMISE_STATUS.open)[0],
            // Čo horí hore: nesplnené, potom po termíne, sporné, otvorené.
            sortValue: (r) => [ORDER.indexOf(r.p.status) === 0 ? 0 : r.late ? 1 : ORDER.indexOf(r.p.status) + 1, r.p.due_date || '9999-12-31'],
            sortLabel: 'Čo horí' },
        ],
        sort: { key: 'stav', dir: 1 },
        sorts: [{ key: 'vznik', label: 'Najnovšie', value: (r) => r.p.created_at, dir: -1 }],
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať v dohodách…', label: 'Hľadať v znení, hodnote a mene',
            fields: ['statement', 'who', 'kind', 'p.value_text'] },
          { key: 'stav', type: 'multi', label: 'Stav', value: (r) => r.p.status || 'open',
            options: ORDER.map(k => [k, PROMISE_STATUS[k][0]]), sortOptions: false, allLabel: 'Všetky',
            presets: [{ label: 'Na riešenie', value: ['open', 'broken', 'disputed'] }] },
          { key: 'druh', type: 'select', label: 'Druh', value: (r) => r.p.kind,
            options: Object.entries(PROMISE_KIND), allLabel: 'Všetky druhy' },
          { key: 'kto', type: 'select', label: 'Komu', value: (r) => r.who, emptyLabel: 'Bez mena', allLabel: 'Všetci' },
          { key: 'neskoro', type: 'toggle', label: 'Po termíne', test: (r) => r.late,
            hint: 'Otvorené dohody, ktorých termín už uplynul.' },
          { key: 'overit', type: 'toggle', label: 'Treba overiť', more: true, test: (r) => r.lowConf,
            hint: 'Dohody, pri ktorých si appka z nahrávky nie je istá.' },
        ],
        empty: { ico: 'note', title: 'Žiadne zachytené dohody',
          sub: 'Pridajte nahrávku hovoru — systém z nej vytiahne, čo sa sľúbilo.',
          cta: `<button class="btn btn-primary" onclick="Rec.uploadForm()">${Icon('upload')} Pridať hovor</button>` },
        export: { name: ['dohody'] },
      });
    },

    callsHtml() {
      return DataList.html({
        id: 'hovory', storageKey: 'hovory', label: 'Hovory',
        noun: ['hovor', 'hovory', 'hovorov'],
        rows: this.recordings.map(r => {
          const w = this.workerOf(r.subject_id);
          return { id: r.id, r, w, who: (w && w.full_name) || r.subject_name || r.subject_phone || 'Hovor',
            n: this.promises.filter(p => p.recording_id === r.id).length, noConsent: !r.consent_confirmed };
        }),
        rowClick: (x) => Rec.callDetail(x.id),
        rowClass: (x) => (x.noConsent && x.r.status !== 'deleted' ? 'is-hot' : x.r.status === 'failed' ? 'is-warn'
          : x.r.status === 'deleted' ? 'is-muted' : ''),
        rowLabel: (x) => `Hovor ${x.who}`,
        rowActions: [{ ico: 'chevron', label: 'Otvoriť hovor', run: (x) => Rec.callDetail(x.id) }],
        columns: [
          { key: 'kto', label: 'S kým', width: 'minmax(160px, 1.3fr)', mobile: 'title',
            render: (x) => `<span class="dl-title"><b>${UI.esc(x.who)}</b>${x.r.recorded_at ? `<small>${UI.date(x.r.recorded_at)}</small>` : ''}</span>`,
            sortValue: (x) => x.who },
          { key: 'suhlas', label: 'Súhlas', width: '120px',
            render: (x) => (x.noConsent ? `<span class="dl-note is-red">${Icon('alert', 12)} nepotvrdený</span>`
              : `<span class="dl-ok">${Icon('check', 13)} potvrdený</span>`),
            sortValue: (x) => (x.noConsent ? 0 : 1) },
          { key: 'dohody', label: 'Dohody', width: '80px', align: 'right', mobileLabel: 'dohody',
            render: (x) => (x.n ? `<span class="dl-num"><b>${x.n}</b></span>` : ''), sortValue: (x) => x.n, sortDir: -1 },
          { key: 'zhrnutie', label: 'Zhrnutie', width: 'minmax(200px, 2fr)', mobile: 'line', hideBelow: 900,
            render: (x) => (x.r.summary ? `<span class="pl-clip">${UI.esc(x.r.summary)}</span>` : ''), csv: (x) => x.r.summary },
          { key: 'stav', label: 'Stav', width: '120px', mobile: 'badge',
            render: (x) => this.recBadge(x.r.status), sortValue: (x) => (REC_STATUS[x.r.status] || REC_STATUS.uploaded)[0] },
        ],
        sorts: [
          { key: 'hori', label: 'Čo horí', value: (x) => [x.r.status === 'deleted' ? 1 : 0, x.noConsent ? 0 : 1,
            x.r.status === 'failed' ? 0 : 1, -(new Date(x.r.recorded_at || 0).getTime() || 0)] },
          { key: 'kedy', label: 'Kedy sa volalo', value: (x) => x.r.recorded_at, dir: -1 },
        ],
        sort: { key: 'hori', dir: 1 },
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať meno, telefón, zhrnutie…', label: 'Hľadať meno, telefón alebo zhrnutie',
            fields: ['who', 'r.subject_phone', 'r.summary'] },
          { key: 'stav', type: 'select', label: 'Stav', value: (x) => x.r.status,
            options: Object.entries(REC_STATUS).map(([k, v]) => [k, v[0]]), allLabel: 'Všetky' },
          { key: 'kto', type: 'select', label: 'S kým', value: 'who', allLabel: 'Všetci' },
          { key: 'bezsuhlasu', type: 'toggle', label: 'Bez súhlasu', test: (x) => x.noConsent && x.r.status !== 'deleted',
            hint: 'Nahrávky bez potvrdeného súhlasu sa nedajú spracovať a mali by sa zmazať.' },
          { key: 'kedy', type: 'range-date', label: 'Kedy sa volalo', more: true, field: 'r.recorded_at' },
        ],
        empty: { ico: 'phone', title: 'Žiadne hovory', sub: 'Nahrávku pridáte, až keď máte zaznamenaný súhlas.',
          cta: `<button class="btn btn-primary" onclick="Rec.uploadForm()">${Icon('upload')} Pridať hovor</button>` },
        export: { name: ['hovory'] },
      });
    },

    consentsHtml() {
      const METHOD = { verbal_recorded: 'ústne, na nahrávke', sms: 'SMS', email: 'e-mail', written: 'písomne', app: 'v aplikácii' };
      return DataList.html({
        id: 'suhlasy', storageKey: 'suhlasy', label: 'Súhlasy',
        noun: ['súhlas', 'súhlasy', 'súhlasov'],
        rows: this.consents.map(c => {
          const w = this.workerOf(c.subject_id);
          const st = c.revoked_at ? 'revoked' : c.granted ? 'active' : 'none';
          return { id: c.id, c, w, st, who: (w && w.full_name) || c.subject_name || c.subject_phone || '—' };
        }),
        rowClass: (x) => (x.st === 'active' ? '' : 'is-muted'),
        columns: [
          { key: 'kto', label: 'Kto', width: 'minmax(160px, 1.4fr)', mobile: 'title',
            render: (x) => `<span class="dl-title"><b>${UI.esc(x.who)}</b>${x.c.subject_phone ? `<small>${UI.esc(x.c.subject_phone)}</small>` : ''}</span>`,
            sortValue: (x) => x.who },
          { key: 'udeleny', label: 'Udelený', width: '120px', mobileLabel: 'udelený',
            render: (x) => (x.c.granted && x.c.granted_at ? UI.date(x.c.granted_at) : ''), sortValue: (x) => x.c.granted_at, sortDir: -1 },
          { key: 'ako', label: 'Ako', width: 'minmax(120px, 1fr)', hideBelow: 900,
            render: (x) => UI.esc(METHOD[x.c.method] || x.c.method || ''), sortValue: (x) => x.c.method },
          { key: 'do', label: 'Uchovať do', width: '120px', mobileLabel: 'do',
            render: (x) => (x.c.retention_until ? UI.date(x.c.retention_until) : ''), sortValue: (x) => x.c.retention_until },
          { key: 'stav', label: 'Stav', width: '120px', mobile: 'badge',
            render: (x) => (x.st === 'active' ? UI.badge('platný', 'green')
              : x.st === 'revoked' ? `<span title="${UI.esc(x.c.revoked_at ? `odvolaný ${UI.date(x.c.revoked_at)}` : '')}">${UI.badge('odvolaný', 'red')}</span>`
              : UI.badge('neudelený', 'gray')),
            sortValue: (x) => ({ active: 0, none: 1, revoked: 2 }[x.st]) },
          { key: 'akcia', label: '', width: '96px', align: 'right', mobile: 'line', csv: false,
            render: (x) => (x.st === 'active' ? `<button class="btn btn-ghost btn-sm" style="color:var(--red);"
              onclick="Rec.revoke('${x.c.id}')" title="Použite, keď človek povie, že už nesúhlasí s nahrávaním. Súhlas prestane platiť a jeho nahrávky treba potom zmazať.">Odvolať</button>` : '') },
        ],
        sort: { key: 'stav', dir: 1 },
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať meno alebo telefón…', fields: ['who', 'c.subject_phone'] },
          { key: 'stav', type: 'select', label: 'Stav', value: 'st',
            options: [['active', 'Platné'], ['revoked', 'Odvolané'], ['none', 'Neudelené']], allLabel: 'Všetky' },
          { key: 'ako', type: 'select', label: 'Ako', value: (x) => x.c.method, optionLabel: (v) => METHOD[v] || v, allLabel: 'Všetky spôsoby' },
          { key: 'konci', type: 'range-date', label: 'Uchovať do', field: 'c.retention_until' },
        ],
        empty: { ico: 'shield', title: 'Žiadne súhlasy',
          sub: 'Súhlas s nahrávaním musí byť daný pred hovorom — v SR aj v Nemecku je to podmienka zákonnosti.',
          cta: `<button class="btn btn-primary" onclick="Rec.consentForm()">${Icon('shield')} Zaznamenať súhlas</button>` },
        export: { name: ['suhlasy'] },
      });
    },

    setTab(t) { this.tab = t; Danubra.renderRoute(); },

    // ── Súhlas ────────────────────────────────────────────────────────────
    async consentForm() {
      const s = await this._settings();
      // Názov firmy bol v tomto texte **zapečený** (migrácia 004), takže appka
      // sa predstavovala menom firmy, ktorá sa medzitým premenovala, a zmena
      // v Nastaveniach to nemala ako prepísať. Text drží `{firma}` a názov sa
      // doplní pri zobrazení.
      const script = Danubra.fillFirm(s?.recruiting?.consent_script_sk
        || 'Dobrý deň, volám z {firma}. Tento hovor by sme si radi nahrali, aby sme mali '
          + 'presne zapísané, na čom sa dohodneme. Súhlasíte?');
      const retention = Number(s?.recruiting?.retention_days) || 180;
      const until = new Date(Date.now() + retention * 86400000).toISOString().slice(0, 10);

      UI.modal('Zaznamenať súhlas s nahrávaním', `
        <div class="warnbox">
          ${Icon('alert', 14)} Súhlas musí byť daný <strong>pred</strong> začiatkom hovoru a musí byť
          výslovný. Samotné oznámenie „hovor môže byť nahrávaný" nestačí.
        </div>
        <div class="form-section">Znenie, ktorým sa pýtame</div>
        <div class="notebox" id="consent-script">${UI.esc(script)}</div>
        <div class="btn-row">
          <button class="btn btn-outline btn-sm"
            onclick="Rec.copyScript()">${Icon('copy')} Skopírovať znenie</button>
        </div>

        <form id="consent-form" onsubmit="event.preventDefault();Rec.saveConsent()" style="margin-top:16px;">
          <div class="form-grid">
            ${UI.field('subject_id', 'Pracovník', { options: [['', '— nie je v databáze —'],
              ...this.workers.map(w => [w.id, w.full_name])],
              tip: 'Kto dal súhlas. Ak ho ešte nemáme v zozname (napr. nový kandidát), nechajte „nie je v databáze" a napíšte meno alebo telefón vedľa.' })}
            ${UI.field('subject_name', 'Meno (ak nie je v databáze)', {})}
            ${UI.field('subject_phone', 'Telefón', {})}
            ${UI.field('method', 'Ako bol súhlas daný', { value: 'verbal_recorded', tip: 'Najlepší dôkaz je, keď súhlas zaznie priamo na začiatku nahrávky. SMS, e-mail alebo podpis sú tiež v poriadku — len to vyberte, aby sa dalo dohľadať.', options: [
              ['verbal_recorded', 'Ústne, zaznamenané na začiatku nahrávky'],
              ['sms', 'SMS'], ['email', 'E-mail'], ['written', 'Písomne'], ['app', 'V aplikácii']] })}
            ${UI.field('language', 'Jazyk', { value: 'sk', options: [['sk', 'SK'], ['hu', 'HU'], ['cs', 'CS'], ['de', 'DE']] })}
            ${UI.field('retention_until', 'Uchovávať do', { type: 'date', value: until,
              tip: 'Do tohto dňa smieme nahrávky tohto človeka držať. Potom sa majú zmazať (GDPR — ochrana osobných údajov). Predvolená dĺžka sa dá zmeniť v Nastaveniach.' })}
          </div>
          ${UI.field('evidence_note', 'Ako presne súhlas znel', { type: 'textarea', rows: 2,
            tip: 'Zapíšte doslova, čo povedal, a ak je to na nahrávke, aj v ktorej minúte. Keby sa niekto neskôr sťažoval, toto je dôkaz.',
            placeholder: 'napr. „Áno, súhlasím s nahrávaním" — zaznelo v 0:12 nahrávky' })}
          <div class="chk-row">
            <label class="chk">
              <input type="checkbox" name="granted" required>
              Potvrdzujem, že osoba dala výslovný súhlas pred začiatkom hovoru</label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">Zaznamenať súhlas</button>
          </div>
        </form>`, { wide: true });
    },

    copyScript() {
      const t = document.getElementById('consent-script')?.textContent || '';
      navigator.clipboard?.writeText(t.trim()).then(
        () => UI.toast('Znenie skopírované', 'ok'), () => UI.toast('Nepodarilo sa skopírovať', 'err'));
    },

    async saveConsent() {
      const d = UI.formData(document.getElementById('consent-form'));
      if (!d.granted) return UI.toast('Bez potvrdenia súhlasu sa nedá pokračovať', 'err');
      if (!d.subject_id && !d.subject_name && !d.subject_phone) {
        return UI.toast('Uveďte aspoň meno alebo telefón', 'err');
      }
      const payload = {
        subject_type: 'worker', subject_id: d.subject_id || null,
        subject_name: d.subject_name || null, subject_phone: d.subject_phone || null,
        kind: 'call_recording', granted: true, granted_at: new Date().toISOString(),
        method: d.method, language: d.language,
        evidence_note: d.evidence_note || null,
        retention_until: d.retention_until || null,
      };
      const { error } = await DB.insert('consents', payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal(); UI.toast('Súhlas zaznamenaný', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    async revoke(id) {
      const reason = await UI.ask('Dôvod odvolania súhlasu:');
      if (reason === null) return;
      const { error } = await DB.update('consents', id, { revoked_at: new Date().toISOString(), revoke_reason: reason || null });
      if (error) return UI.toast('Odvolanie sa neuložilo: ' + error.message, 'err');
      UI.toast('Súhlas odvolaný — súvisiace nahrávky treba zmazať', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    // ── Nahrávka ──────────────────────────────────────────────────────────
    // Tri cesty, ako sa zvuk dostane dnu:
    //   file    — súbor z mobilu (záznamník hovorov, WhatsApp export)
    //   browser — nahrávka priamo tu (hlasitý odposluch, osobný pohovor)
    //   url     — odkaz od VoIP operátora alebo z iného úložiska
    _mode: 'file',
    _blob: null,
    _rec: null,      // MediaRecorder
    _chunks: [],
    _t0: 0,
    _timer: null,

    uploadForm() {
      const withConsent = this.consents.filter(c => c.granted && !c.revoked_at);
      if (!withConsent.length) {
        return UI.modal('Najprv súhlas', `
          <div class="warnbox">${Icon('alert', 14)}
            Zatiaľ nie je zaznamenaný žiadny súhlas s nahrávaním. Bez neho sa nahrávka nesmie
            spracovať — v Slovenskej republike aj v Nemecku je nahrávanie bez súhlasu trestné.</div>
          <div class="modal-actions">
            <button class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button class="btn btn-primary" onclick="Rec.consentForm()">${Icon('shield')} Zaznamenať súhlas</button>
          </div>`);
      }
      this._mode = 'file'; this._blob = null; this._stopRecorder();
      UI.modal('Pridať hovor', `
        <form id="rec-form" onsubmit="event.preventDefault();Rec.saveRecording()">
          <div style="display:flex;align-items:center;gap:4px;margin-bottom:14px;">
          <div class="pillbar" style="width:max-content;">
            <button type="button" class="pill active" data-mode="file" onclick="Rec.setMode('file')">Súbor z mobilu</button>
            <button type="button" class="pill" data-mode="browser" onclick="Rec.setMode('browser')">Nahrať teraz</button>
            <button type="button" class="pill" data-mode="url" onclick="Rec.setMode('url')">Odkaz</button>
          </div>
          ${UI.tip('Súbor z mobilu = nahrávka, ktorú už máte v telefóne. Nahrať teraz = počítač nahráva cez mikrofón (hovor dajte na hlasitý odposluch). Odkaz = nahrávka leží na internete, napr. u telefónneho operátora.')}
          </div>

          <div id="rec-src"></div>

          <div class="form-grid" style="margin-top:14px;">
            ${UI.field('consent_id', 'Súhlas', { required: true, tip: 'Vyberte súhlas človeka, s ktorým je hovor. Ponúkajú sa len platné, neodvolané súhlasy. Nahrávka sa zmaže v deň, do ktorého súhlas platí.', options: withConsent.map(c => {
              const w = this.workerOf(c.subject_id);
              return [c.id, `${w?.full_name || c.subject_name || c.subject_phone} · ${UI.date(c.granted_at)}`];
            }) })}
            ${UI.field('recorded_at', 'Kedy sa volalo', { type: 'date', value: new Date().toISOString().slice(0, 10) })}
            ${UI.field('language', 'Jazyk hovoru', { value: 'sk', options: [['sk', 'SK'], ['hu', 'HU'], ['cs', 'CS'], ['de', 'DE']] })}
            ${UI.field('direction', 'Smer', { value: 'out', options: [['out', 'Volali sme my'], ['in', 'Volali nám']] })}
          </div>

          <div class="regimebox">Po uložení sa nahrávka prepíše a systém z nej vytiahne,
          čo sa sľúbilo — sadzba, ubytovanie, termín nástupu a doprava.
          Súbor leží v privátnom úložisku, verejný odkaz naň nevzniká.</div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary" id="rec-save">Uložiť a spracovať</button>
          </div>
        </form>`, { wide: true });
      this._renderSource();
    },

    setMode(m) {
      if (m !== 'browser') this._stopRecorder();
      this._mode = m; this._blob = null;
      document.querySelectorAll('#rec-form .pill[data-mode]').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === m));
      this._renderSource();
    },

    _renderSource() {
      const box = document.getElementById('rec-src');
      if (!box) return;
      const hint = 'display:block;margin-top:6px;color:var(--ink-mute);font-size:12px;';
      if (this._mode === 'file') {
        box.innerHTML = `
          <label class="fld"><span>Zvukový súbor</span>
            <input type="file" id="rec-file" accept="audio/*,video/mp4" onchange="Rec.pickFile(this)">
          </label>
          <span id="rec-file-info" style="${hint}">
            Vezme sa čokoľvek — m4a, mp3, ogg, opus, wav, aj hlasovka z WhatsAppu.
            Na Androide záznamník hovorov (napr. Cube ACR), na iPhone hovor na hlasitý
            odposluch a nahratie diktafónom.</span>`;
      } else if (this._mode === 'browser') {
        box.innerHTML = `
          <div class="notebox" id="rec-live" style="display:flex;align-items:center;gap:12px;">
            <button type="button" class="btn btn-primary btn-sm" id="rec-toggle"
              onclick="Rec.toggleRecorder()">${Icon('phone')} Spustiť nahrávanie</button>
            <span id="rec-elapsed" style="font-variant-numeric:tabular-nums;color:var(--ink-sub);">0:00</span>
          </div>
          <div id="rec-preview"></div>
          <span style="${hint}">
            Nahráva mikrofón tohto zariadenia — dajte hovor na hlasitý odposluch.
            Súhlas si vypýtajte skôr, než kliknete na spustenie.</span>`;
      } else {
        box.innerHTML = `
          <label class="fld"><span>Odkaz na nahrávku</span>
            <input type="url" id="rec-url" placeholder="https://… (VoIP operátor alebo iné úložisko)">
          </label>
          <span style="${hint}">
            Odkaz musí byť dostupný zo servera — použije sa raz pri prepise a ďalej sa neukladá.</span>`;
      }
    },

    pickFile(input) {
      const f = input.files?.[0];
      this._blob = f || null;
      const info = document.getElementById('rec-file-info');
      if (f && info) {
        info.innerHTML = `${UI.esc(f.name)} · ${(f.size / 1048576).toFixed(1)} MB`;
      }
    },

    async toggleRecorder() {
      if (this._rec && this._rec.state === 'recording') return this._stopRecorder();
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        return UI.toast('Tento prehliadač nevie nahrávať — použite súbor z mobilu', 'err');
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        return UI.toast('Mikrofón nie je dostupný: ' + e.message, 'err');
      }
      this._chunks = [];
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find(m => MediaRecorder.isTypeSupported?.(m)) || '';
      this._rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      this._rec.ondataavailable = e => { if (e.data.size) this._chunks.push(e.data); };
      this._rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        this._blob = new Blob(this._chunks, { type: this._rec.mimeType || 'audio/webm' });
        const prev = document.getElementById('rec-preview');
        if (prev) {
          prev.innerHTML = `<audio controls src="${URL.createObjectURL(this._blob)}"
            style="width:100%;margin-top:10px;"></audio>`;
        }
      };
      this._rec.start();
      this._t0 = Date.now();
      this._timer = setInterval(() => {
        const el = document.getElementById('rec-elapsed');
        if (!el) return;
        const s = Math.floor((Date.now() - this._t0) / 1000);
        el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      }, 500);
      const btn = document.getElementById('rec-toggle');
      if (btn) { btn.innerHTML = `${Icon('x')} Zastaviť nahrávanie`; btn.classList.add('btn-danger'); }
    },

    _stopRecorder() {
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      if (this._rec && this._rec.state === 'recording') this._rec.stop();
      this._rec = null;
      const btn = document.getElementById('rec-toggle');
      if (btn) { btn.innerHTML = `${Icon('phone')} Spustiť nahrávanie`; btn.classList.remove('btn-danger'); }
    },

    _elapsedSeconds() {
      return this._t0 ? Math.round((Date.now() - this._t0) / 1000) : null;
    },

    async saveRecording() {
      this._stopRecorder();
      const d = UI.formData(document.getElementById('rec-form'));
      const consent = this.consents.find(c => c.id === d.consent_id);
      if (!consent) return UI.toast('Vyberte súhlas', 'err');

      const url = document.getElementById('rec-url')?.value.trim() || '';
      if (this._mode === 'url' && !url) return UI.toast('Zadajte odkaz na nahrávku', 'err');
      if (this._mode !== 'url' && !this._blob) {
        return UI.toast(this._mode === 'file' ? 'Vyberte zvukový súbor' : 'Najprv nahrajte hovor', 'err');
      }

      const btn = document.getElementById('rec-save');
      if (btn) { btn.disabled = true; btn.textContent = 'Nahrávam…'; }

      let audio_path = null;
      if (this._blob) {
        const name = this._blob.name || `hovor.${(this._blob.type.split('/')[1] || 'webm').split(';')[0]}`;
        const { path, error } = await DB.uploadCall(this._blob, name);
        if (error) {
          if (btn) { btn.disabled = false; btn.textContent = 'Uložiť a spracovať'; }
          return UI.toast('Nahratie zlyhalo: ' + error.message, 'err');
        }
        audio_path = path;
      }

      const payload = {
        subject_type: 'worker', subject_id: consent.subject_id || null,
        subject_name: consent.subject_name || null, subject_phone: consent.subject_phone || null,
        consent_id: consent.id, consent_confirmed: true,
        audio_path, audio_url: audio_path ? null : url,
        audio_mime: this._blob?.type || null,
        audio_bytes: this._blob?.size || null,
        source: this._mode === 'browser' ? 'browser' : this._mode === 'file' ? 'upload' : 'url',
        direction: d.direction || null,
        language: d.language,
        duration_seconds: this._mode === 'browser' ? this._elapsedSeconds() : null,
        recorded_at: d.recorded_at ? new Date(d.recorded_at).toISOString() : new Date().toISOString(),
        delete_after: consent.retention_until || null,
        status: 'uploaded',
      };
      const { data: rec, error } = await DB.insert('call_recordings', payload);
      if (error) {
        if (btn) { btn.disabled = false; btn.textContent = 'Uložiť a spracovať'; }
        return UI.toast('Chyba: ' + error.message, 'err');
      }
      this._blob = null; this._t0 = 0;
      UI.closeModal();
      UI.toast('Nahrávka uložená, spracúvam…', 'ok');
      await this.load(); Danubra.renderRoute();
      this.process(rec.id);
    },

    async process(id) {
      try {
        const res = await fetch('/.netlify/functions/danubra-process-call', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recordingId: id }),
        });
        const out = await res.json();
        if (!res.ok) throw new Error(out.error || 'Spracovanie zlyhalo');
        UI.toast(`Hotovo — zachytených ${out.promises} ${out.promises === 1 ? 'dohoda' : 'dohôd'}`, 'ok');
      } catch (e) {
        UI.toast('Spracovanie zlyhalo: ' + e.message, 'err');
      }
      await this.load(); Danubra.renderRoute();
    },

    async callDetail(id) {
      const r = this.recordings.find(x => x.id === id);
      if (!r) return;
      const w = this.workerOf(r.subject_id);
      const prom = this.promises.filter(p => p.recording_id === id);
      const oq = r.extraction?.open_questions || [];

      UI.modal(w?.full_name || r.subject_name || 'Hovor', `
        <div class="detail-head">${this.recBadge(r.status)}
          ${r.consent_confirmed ? UI.badge('so súhlasom', 'green') : UI.badge('bez súhlasu', 'red')}</div>
        ${r.error ? `<div class="warnbox">${Icon('alert', 14)} ${UI.esc(r.error)}</div>` : ''}
        <div class="kv">
          <div><span>Kedy</span><strong>${UI.date(r.recorded_at)}</strong></div>
          <div><span>Jazyk</span><strong>${(r.language || '').toUpperCase()}</strong></div>
          ${r.duration_seconds ? `<div><span>Dĺžka</span><strong>${Math.round(r.duration_seconds / 60)} min</strong></div>` : ''}
          ${r.delete_after ? `<div><span>Zmazať po${UI.tip('Do tohto dňa smieme nahrávku držať podľa súhlasu. Potom sa má zmazať.')}</span><strong>${UI.date(r.delete_after)}</strong></div>` : ''}
        </div>
        ${r.audio_path || r.audio_url ? `<div class="form-section">Nahrávka</div>
          <div id="rec-audio-${r.id}"><button class="btn btn-outline btn-sm"
            onclick="Rec.play('${r.id}')">${Icon('phone')} Prehrať</button></div>` : ''}
        ${r.summary ? `<div class="form-section">Zhrnutie</div><div class="notebox">${UI.esc(r.summary)}</div>` : ''}
        ${oq.length ? `<div class="form-section">Zostalo nedohodnuté${UI.tip('Veci, ktoré v hovore zazneli, ale nedohodli sa (napr. „ozveme sa k ubytovaniu"). Treba ich doriešiť ďalším telefonátom.')}</div>
          ${oq.map(q => `<div class="list-row">
            <span class="dot amber"></span><span style="flex:1;font-size:13px;">${UI.esc(q)}</span></div>`).join('')}` : ''}
        ${prom.length ? `<div class="form-section">Zachytené dohody (${prom.length})</div>
          ${prom.map(p => `<div class="list-row">
            <span style="flex:1;font-size:13px;"><strong>${UI.esc(PROMISE_KIND[p.kind] || p.kind)}</strong>
            <span style="display:block;color:var(--ink-sub);">${UI.esc(p.statement)}</span></span>
            ${this.prBadge(p.status)}</div>`).join('')}` : ''}
        ${r.transcript ? `<div class="form-section">Prepis</div>
          <div class="notebox" style="max-height:220px;overflow:auto;">${UI.esc(r.transcript)}</div>` : ''}
        <div class="modal-actions">
          <button class="btn btn-danger" onclick="Rec.delRecording('${r.id}')">${Icon('archive', 14)} Archivovať nahrávku</button>
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          ${['uploaded', 'failed'].includes(r.status)
            ? `<span style="align-self:center;display:inline-flex;">${UI.tip('Spracovať = nahrávka sa prepíše na text a appka z neho vytiahne, čo sa sľúbilo. Trvá to chvíľu. Pri zlyhaní to môžete skúsiť znova.')}</span>
              <button class="btn btn-primary" onclick="UI.closeModal();Rec.process('${r.id}')">Spracovať</button>` : ''}
        </div>`, { wide: true });
    },

    async setPromiseStatus(id, status) {
      const patch = { status };
      if (status === 'fulfilled') patch.fulfilled_at = new Date().toISOString();
      const { error } = await DB.update('promises', id, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const p =this.promises.find(x => x.id === id); if (p) Object.assign(p, patch);
      UI.toast('Uložené', 'ok');
      // Zoznam dohôd prepočíta filtre a poradie s novým stavom.
      if (DataList._reg.dohody) {
        const today = new Date().toISOString().slice(0, 10);
        DataList.refresh('dohody', this.promises.map(x => this.promiseRow(x, today)));
      }
    },

    /** Privátny bucket → krátkodobo podpísaný odkaz, nikdy nie verejná URL. */
    async play(id) {
      const r = this.recordings.find(x => x.id === id);
      const box = document.getElementById(`rec-audio-${id}`);
      if (!r || !box) return;
      let src = r.audio_url;
      if (r.audio_path) {
        const { url, error } = await DB.signedCallUrl(r.audio_path);
        if (error || !url) return UI.toast('Nahrávka sa nedá otvoriť: ' + (error?.message || 'chýba'), 'err');
        src = url;
      }
      box.innerHTML = `<audio controls autoplay src="${UI.esc(src)}" style="width:100%;"></audio>`;
    },

    async delRecording(id) {
      if (!await UI.confirmArchive('Presunúť nahrávku aj s prepisom do archívu? Zachytené dohody ostanú zapísané.')) return;
      // Zvuk ostáva v úložisku (nič sa nemaže) — po vrátení z archívu sa
      // nahrávka dá znova prehrať. Lehotu podľa súhlasu stráži denný cron.
      const { error } = await DB.archive('call_recordings', id);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      this.recordings = this.recordings.filter(x => x.id !== id);
      UI.closeModal(); UI.toast(UI.ARCHIVED, 'ok');
      Danubra.renderRoute();
    },

    /** Nastavenia z jedného miesta — `Danubra.loadCfg()`. */
    async _settings() { return Danubra.loadCfg(); },
  };

  window.Rec = Rec;
  Danubra.views.recruiting = function (el) { return Rec.view(el); };
})();
