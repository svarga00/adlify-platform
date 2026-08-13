// ============================================================================
// DANUBRA — Náborová pipeline (kandidáti)
// ============================================================================
// Kandidát prechádza pipeline až po konverziu na pracovníka. Sleduje sa zdroj,
// aby bolo vidieť, ktorý kanál naozaj prináša ľudí, a čas prvej reakcie —
// cieľ je ozvať sa do desiatich minút.
// ============================================================================
(function () {
  const STAGES = [
    ['new', 'Nový', 'amber'], ['contacted', 'Kontaktovaný', 'blue'],
    ['interview', 'Pohovor', 'blue'], ['documents', 'Doklady', 'brand'],
    ['ready', 'Pripravený', 'green'], ['placed', 'Nasadený', 'green'],
    ['rejected', 'Odmietnutý', 'red'], ['lost', 'Stratený', 'gray'],
  ];
  const PIPELINE = ['new', 'contacted', 'interview', 'documents', 'ready'];
  const SOURCES = [
    ['referral', 'Odporúčanie'], ['meta_ads', 'Meta reklama'], ['profesia', 'Profesia.sk'],
    ['facebook', 'Facebook skupiny'], ['web', 'Web'], ['ine', 'Iné'],
  ];
  // Záložný zoznam; keď je načítaná príručka remesiel, má prednosť ona.
  const PROFESSIONS = [
    ['trockenbau', 'Sadrokartonár'], ['maliar', 'Maliar'], ['obkladac', 'Obkladač'],
    ['murar', 'Murár'], ['betonar', 'Betonár a železiar'], ['tesar', 'Tesár'],
    ['zvarac', 'Zvárač'], ['zamocnik', 'Zámočník'], ['elektrikar', 'Elektrikár'],
    ['montaznik', 'Montážnik'], ['pomocnik', 'Pomocný pracovník'], ['cnc', 'CNC operátor'],
  ];
  const REGULATED = ['elektrikar'];   // §9 HwO — nutné oznámenie Handwerkskammer
  const VERDICT = {
    strong: ['Sedí', 'green'], ok: ['Použiteľný', 'blue'], weak: ['Slabý', 'amber'],
    reject: ['Nebrať', 'red'], unknown: ['Nedokončené', 'gray'],
  };
  const PHASE_LABEL = { phone: 'Telefonát', interview: 'Pohovor', onsite: 'Na stavbe' };
  const KIND_LABEL = { knowledge: ['odborná', 'blue'], hidden: ['overovacia', 'brand'],
    legal: ['právna', 'red'], logistics: ['logistika', 'gray'], motivation: ['motivácia', 'amber'] };

  const Cand = {
    items: [], loaded: false, view_: 'kanban', filters: { source: '', q: '', outcome: 'active' },
    questions: [], answers: [], plans: [], playbookLoaded: false,
    allChecks: [],

    async load() {
      const [c, ch] = await Promise.all([
        DB.list('candidates', { order: { column: 'received_at', ascending: false }, limit: 500 }),
        DB.list('candidate_checks', { select: 'candidate_id,step_key,item_index,checked', limit: 5000 }),
      ]);
      this.items = c.data || [];
      this.allChecks = ch.data || [];
      this.loaded = true;
    },

    checksOf(id) { return this.allChecks.filter(x => x.candidate_id === id); },

    /** Postup kandidáta cez šesť krokov. Bez knižnice vráti prázdny stav. */
    progressOf(c) {
      if (!window.DanubraProcess) return { percent: 0, flagCount: 0, currentStep: null, done: 0, total: 0 };
      return DanubraProcess.candidateProgress(c, this.checksOf(c.id));
    },

    /** Otázky a plány sa načítajú, až keď treba — nezdržujú zoznam kandidátov. */
    async loadPlaybook() {
      if (this.playbookLoaded) return;
      const [q, p] = await Promise.all([
        DB.list('screening_questions', { order: { column: 'sort_order', ascending: true }, limit: 500 }),
        DB.list('recruitment_plans', { select: 'id,title,trade_key,status', limit: 200 }),
      ]);
      this.questions = q.data || []; this.plans = p.data || [];
      this.playbookLoaded = true;
    },

    questionsFor(tradeKey) {
      return this.questions
        .filter(q => q.active !== false && (!q.trade_key || q.trade_key === tradeKey))
        .sort((a, b) => (a.trade_key ? 1 : 0) - (b.trade_key ? 1 : 0) || (a.sort_order || 0) - (b.sort_order || 0));
    },

    stageMeta(s) { return STAGES.find(x => x[0] === s) || STAGES[0]; },
    badge(s) { const m = this.stageMeta(s); return UI.badge(m[1], m[2]); },
    professionLabel(p) { const x = PROFESSIONS.find(y => y[0] === p); return x ? x[1] : (p || '—'); },
    sourceLabel(s) { const x = SOURCES.find(y => y[0] === s); return x ? x[1] : (s || 'neuvedený'); },

    /** Koľko minút trvalo ozvať sa. null ak zatiaľ nie. */
    responseMinutes(c) {
      if (!c.first_contact_at || !c.received_at) return null;
      return Math.round((new Date(c.first_contact_at) - new Date(c.received_at)) / 60000);
    },

    filtered() {
      const f = this.filters;
      return this.items.filter(c => {
        if (f.outcome === 'active' && c.outcome) return false;
        if (f.outcome === 'hired' && c.outcome !== 'hired') return false;
        if (f.outcome === 'rejected' && c.outcome !== 'rejected') return false;
        if (f.source && c.source !== f.source) return false;
        if (f.q) {
          const hay = `${c.full_name} ${c.phone || ''} ${c.city || ''} ${this.professionLabel(c.profession)}`.toLowerCase();
          if (!hay.includes(f.q.toLowerCase())) return false;
        }
        return true;
      });
    },

    async view(el) {
      Danubra.setActions(`
        <button class="btn btn-outline btn-sm" onclick="Cand.form()">${Icon('plus')} Nový kandidát</button>
        <button class="btn btn-primary btn-sm" onclick="Guide.startCall()">${Icon('phone')} Zdvihol som telefón</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const rows = this.filtered();

      const waiting = this.items.filter(c => c.status === 'new' && !c.first_contact_at);
      const times = this.items.map(c => this.responseMinutes(c)).filter(x => x != null);
      const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
      const placed = this.items.filter(c => c.status === 'placed').length;
      const conv = this.items.length ? Math.round((placed / this.items.length) * 100) : 0;

      el.innerHTML = Danubra.header('Nábor',
        `${this.items.length} kandidátov · ${placed} nasadených · konverzia ${conv} %`) +
        (waiting.length ? `<div class="warnbox" style="margin-bottom:14px;">
          ${Icon('alert', 14)} ${waiting.length} ${waiting.length === 1 ? 'kandidát čaká' : 'kandidátov čaká'}
          na prvý kontakt — cieľ je ozvať sa do desiatich minút.</div>` : '') + `

        <div class="kpi-grid" style="margin-bottom:16px;">
          <div class="kpi"><div class="kpi-label">V pipeline</div>
            <div class="kpi-value">${this.items.filter(c => PIPELINE.includes(c.status)).length}</div>
            <div class="kpi-delta">rozpracovaní</div></div>
          <div class="kpi"><div class="kpi-label">Priemerná reakcia</div>
            <div class="kpi-value" style="color:${avg == null ? 'var(--ink-mute)' : avg <= 10 ? 'var(--green)' : 'var(--amber)'};">
              ${avg == null ? '—' : avg + ' min'}</div>
            <div class="kpi-delta">cieľ do 10 minút</div></div>
          <div class="kpi"><div class="kpi-label">Nasadení</div>
            <div class="kpi-value" style="color:var(--green);">${placed}</div>
            <div class="kpi-delta">konverzia ${conv} %</div></div>
          <div class="kpi"><div class="kpi-label">Odmietnutí a stratení</div>
            <div class="kpi-value">${this.items.filter(c => ['rejected', 'lost'].includes(c.status)).length}</div>
            <div class="kpi-delta">mimo pipeline</div></div>
        </div>

        <button class="btn btn-primary btn-block call-cta" onclick="Guide.startCall()">
          ${Icon('phone', 18)} Zdvihol som telefón — naberať rovno teraz</button>

        <div class="filterbar">
          <input class="fb-search" placeholder="Hľadať meno, telefón, mesto…" value="${UI.esc(this.filters.q)}"
            oninput="Cand.setF('q',this.value)">
          <select onchange="Cand.setF('outcome',this.value)">
            ${[['active', 'V procese'], ['hired', 'Nastúpení'], ['rejected', 'Zamietnutí'], ['', 'Všetci']]
              .map(([v, l]) => `<option value="${v}" ${this.filters.outcome === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <select onchange="Cand.setF('source',this.value)">
            <option value="">Všetky zdroje</option>
            ${SOURCES.map(s => `<option value="${s[0]}" ${this.filters.source === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('')}
          </select>
          <div class="pillbar" style="margin-left:auto;">
            <button class="pill${this.view_ === 'kanban' ? ' active' : ''}" onclick="Cand.setView('kanban')">Kanban</button>
            <button class="pill${this.view_ === 'table' ? ' active' : ''}" onclick="Cand.setView('table')">Zoznam</button>
          </div>
        </div>

        ${rows.length === 0
          ? UI.empty('workers', 'Žiadni kandidáti', 'Pridaj prvého kandidáta do pipeline.',
              `<button class="btn btn-primary" onclick="Cand.form()">${Icon('plus')} Nový kandidát</button>`)
          : this.view_ === 'kanban' ? this.kanban(rows) : this.table(rows)}

        ${this.closedHtml()}
        ${this.sourcesHtml()}`;
    },

    kanban(rows) {
      return `<div class="kanban">${PIPELINE.map(st => {
        const meta = this.stageMeta(st);
        const items = rows.filter(c => c.status === st);
        return `<div class="kanban-col">
          <div class="kanban-head">
            <span>${meta[1]}</span><span class="kanban-count">${items.length}</span>
          </div>
          <div class="kanban-body">
            ${items.map(c => this.kanbanCard(c)).join('')
              || '<div class="kanban-empty">prázdne</div>'}
          </div>
        </div>`;
      }).join('')}</div>`;
    },

    kanbanCard(c) {
      const mins = this.responseMinutes(c);
      const waiting = c.status === 'new' && !c.first_contact_at;
      const pr = this.progressOf(c);
      return `<div class="kanban-card${c.outcome ? ' is-closed' : ''}" onclick="Cand.detail('${c.id}')">
        <div style="font-weight:700;font-size:13px;">
          ${UI.esc(c.full_name)}
          ${c.type === 'crew' ? UI.badge(`partia ${c.crew_size || ''}`.trim(), 'blue') : ''}
          ${pr.flagCount ? `<span style="color:var(--red);font-weight:700;">${Icon('alert', 12)} ${pr.flagCount}</span>` : ''}
        </div>
        <div style="font-size:12px;color:var(--ink-mute);margin-top:2px;">
          ${this.professionLabel(c.profession)}${c.city ? ` · ${UI.esc(c.city)}` : ''}</div>
        ${pr.total ? `<div style="display:flex;align-items:center;gap:6px;margin-top:6px;">
          <span class="stay-bar" style="flex:1;height:5px;">
            <span class="stay-fill" style="display:block;height:5px;width:${pr.percent}%;
              background:${pr.flagCount ? 'var(--red)' : pr.percent === 100 ? 'var(--green)' : 'var(--brand)'};"></span>
          </span>
          <span style="font-size:11px;color:var(--ink-mute);">${pr.percent} %</span>
        </div>
        <div style="font-size:11.5px;color:var(--ink-mute);margin-top:3px;">
          ${c.outcome === 'hired' ? 'nastúpil' : c.outcome === 'rejected' ? 'zamietnutý'
            : pr.currentStep ? UI.esc(pr.currentStep.title) : 'proces hotový'}</div>` : ''}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;font-size:11.5px;align-items:center;">
          <span style="color:var(--ink-sub);">${this.sourceLabel(c.source)}</span>
          ${c.screening_score != null ? UI.badge(`${Math.round(c.screening_score)} %`,
            c.screening_verdict === 'strong' ? 'green' : c.screening_verdict === 'reject' ? 'red'
              : c.screening_verdict === 'ok' ? 'blue' : 'amber') : ''}
          ${waiting ? `<span style="color:var(--amber);font-weight:700;">čaká na kontakt</span>`
            : mins != null ? `<span style="color:${mins <= 10 ? 'var(--green)' : 'var(--ink-mute)'};">${mins} min</span>` : ''}
        </div>
      </div>`;
    },

    table(rows) {
      return rows.map(c => {
        const mins = this.responseMinutes(c);
        const pr = this.progressOf(c);
        return `<div class="list-row${c.outcome ? ' is-closed' : ''}" onclick="Cand.detail('${c.id}')">
          <span class="dot ${pr.flagCount ? 'red' : ['ready', 'placed'].includes(c.status) ? 'green'
            : c.status === 'new' && !c.first_contact_at ? 'amber' : ''}"></span>
          <span style="flex:1;font-size:13px;">
            <strong>${UI.esc(c.full_name)}</strong>
            ${c.type === 'crew' ? UI.badge(`partia ${c.crew_size || ''}`.trim(), 'blue') : ''}
            <span style="color:var(--ink-mute);"> · ${this.professionLabel(c.profession)}</span>
            <span style="display:block;color:var(--ink-mute);font-size:12px;">
              ${this.sourceLabel(c.source)} · ${UI.date(c.received_at)}
              ${mins != null ? ` · reakcia ${mins} min` : ' · zatiaľ bez reakcie'}
              ${pr.total ? ` · ${pr.percent} %${pr.currentStep && !c.outcome ? ` · ${UI.esc(pr.currentStep.title)}` : ''}` : ''}</span>
          </span>
          ${pr.flagCount ? UI.badge(`${pr.flagCount} 🚩`.replace('🚩', 'vlajky'), 'red') : ''}
          ${c.outcome === 'hired' ? UI.badge('nastúpil', 'green')
            : c.outcome === 'rejected' ? UI.badge('zamietnutý', 'gray') : this.badge(c.status)}
        </div>`;
      }).join('');
    },

    /** Uzavretí kandidáti — vizuálne stlmení, ale dohľadateľní. */
    closedHtml() {
      if (this.filters.outcome !== 'active') return '';
      const closed = this.items.filter(c => c.outcome);
      if (!closed.length) return '';
      const hired = closed.filter(c => c.outcome === 'hired').length;
      return `<div class="form-section">Uzavretí — ${hired} nastúpených, ${closed.length - hired} zamietnutých</div>
        <div style="opacity:.62;">${this.table(closed)}</div>`;
    },

    /** Ktorý kanál koľko priniesol — na vyhodnotenie marketingu. */
    sourcesHtml() {
      if (!this.items.length) return '';
      const by = new Map();
      for (const c of this.items) {
        const k = c.source || 'ine';
        if (!by.has(k)) by.set(k, { total: 0, placed: 0 });
        const g = by.get(k);
        g.total++;
        if (c.status === 'placed') g.placed++;
      }
      const rows = [...by.entries()].sort((a, b) => b[1].total - a[1].total);
      const max = Math.max(...rows.map(r => r[1].total));
      return `<div class="form-section">Odkiaľ kandidáti prichádzajú</div>
        ${rows.map(([k, g]) => `
          <div class="list-row" style="cursor:default;">
            <span style="flex:0 0 130px;font-size:13px;font-weight:600;">${UI.esc(this.sourceLabel(k))}</span>
            <span style="flex:1;">
              <span class="stay-bar" style="display:block;">
                <span class="stay-fill" style="display:block;width:${Math.round((g.total / max) * 100)}%;background:var(--brand);"></span>
              </span>
            </span>
            <span style="font-size:12.5px;color:var(--ink-sub);white-space:nowrap;">
              ${g.total} · nasadených ${g.placed}</span>
          </div>`).join('')}`;
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },
    setView(v) { this.view_ = v; Danubra.renderRoute(); },

    async detail(id) {
      const c = this.items.find(x => x.id === id);
      if (!c) return UI.toast('Nenájdené', 'err');
      const mins = this.responseMinutes(c);
      const regulated = REGULATED.includes(c.profession);

      const rows = [
        ['Typ', c.type === 'crew' ? `Partia${c.crew_size ? ` — ${c.crew_size} ľudí` : ''}` : 'Jednotlivec'],
        ['Živnosť', { active: 'Aktívna', willing: 'Ochotný si založiť', none: 'Nemá' }[c.trade_license_status] || null],
        ['Nemčina v partii', c.german_speaker == null ? null : c.german_speaker ? 'Áno' : 'Nie'],
        ['Vlastné auto', c.has_car == null ? null : c.has_car ? 'Áno' : 'Nie'],
        ['Možný nástup', c.expected_start ? UI.date(c.expected_start) : null],
        ['Profesia', this.professionLabel(c.profession)],
        ['Forma spolupráce', c.legal_form === 'szco' ? 'Živnostník' : 'Zamestnanec'],
        ['Telefón', c.phone], ['E-mail', c.email], ['Mesto', c.city],
        ['Zdroj', this.sourceLabel(c.source) + (c.source_detail ? ` · ${c.source_detail}` : '')],
        ['Prijaté', c.received_at ? new Date(c.received_at).toLocaleString('sk-SK') : null],
        ['Prvý kontakt', c.first_contact_at
          ? `${new Date(c.first_contact_at).toLocaleString('sk-SK')} (${mins} min)` : '— zatiaľ žiadny'],
        ['Predstava sadzby', c.expected_rate ? UI.money(c.expected_rate) : null],
        ['Dostupný od', c.available_from ? UI.date(c.available_from) : null],
        ['Nemčina', c.german_level],
      ].filter(r => r[1] != null && r[1] !== '');

      const body = `
        <div class="detail-head">
          ${this.badge(c.status)}
          <select class="verif-sel" onchange="Cand.setStatus('${c.id}',this.value)">
            ${STAGES.map(s => `<option value="${s[0]}" ${c.status === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('')}
          </select>
        </div>
        ${!c.first_contact_at && c.status === 'new' ? `<div class="warnbox">
          ${Icon('clock', 14)} Kandidát ešte nebol kontaktovaný. Prvá reakcia do desiatich minút
          výrazne zvyšuje šancu, že nastúpi.</div>` : ''}
        ${regulated ? `<div class="warnbox">${Icon('alert', 14)}
          Regulované remeslo — pred nasadením treba oznámenie Handwerkskammer podľa §9 HwO.</div>` : ''}
        ${c.outcome ? `<div class="regimebox">
          ${c.outcome === 'hired' ? 'Kandidát nastúpil.' : 'Kandidát bol zamietnutý.'}
          ${c.outcome_reason ? UI.esc(c.outcome_reason) : ''}
          <button class="btn btn-ghost btn-sm" style="margin-left:6px;"
            onclick="CandProc.reopen('${c.id}')">Vrátiť do procesu</button></div>` : ''}
        ${CommPanel.render({ contact: { phone: c.phone, email: c.email, whatsapp: c.whatsapp, name: c.full_name }, entity: { type: 'candidate', id: c.id } })}

        <div class="form-section">Náborový proces</div>
        <div id="cand-process">${UI.loading()}</div>

        <div class="form-section">Údaje</div>
        <div class="kv">${rows.map(r => `<div><span>${r[0]}</span><strong>${UI.esc(r[1])}</strong></div>`).join('')}</div>
        ${c.screening_score != null ? `<div class="form-section">Skríning</div>
          <div class="kpi-grid">
            <div class="kpi"><div class="kpi-label">Skóre</div>
              <div class="kpi-value" style="color:${c.screening_score >= 80 ? 'var(--green)' : c.screening_score >= 60 ? 'var(--ink)' : 'var(--amber)'};">
                ${Math.round(c.screening_score)} %</div>
              <div class="kpi-delta">${UI.esc((VERDICT[c.screening_verdict] || VERDICT.unknown)[0])}</div></div>
            <div class="kpi"><div class="kpi-label">Overené u poliera</div>
              <div class="kpi-value" style="color:${c.reference_checked ? 'var(--green)' : 'var(--amber)'};">
                ${c.reference_checked ? 'áno' : 'nie'}</div>
              <div class="kpi-delta">${UI.esc(c.last_foreman || 'meno neuvedené')}</div></div>
          </div>` : ''}
        ${c.notes ? `<div class="notebox">${UI.esc(c.notes)}</div>` : ''}
        ${c.converted_worker_id ? `<div class="regimebox">
          Kandidát bol prevedený medzi pracovníkov ${UI.date(c.converted_at)}.</div>` : ''}
        <div class="modal-actions">
          <button class="btn btn-danger btn-sm" onclick="Cand.del('${c.id}')">Zmazať</button>
          <button class="btn btn-outline btn-sm" onclick="Cand.form('${c.id}')">Upraviť</button>
          ${!c.first_contact_at ? `<button class="btn btn-outline btn-sm" onclick="Cand.markContacted('${c.id}')">
            ${Icon('check')} Ozval som sa</button>` : ''}
          <button class="btn btn-outline btn-sm" onclick="Guide.startScreening('${c.id}')">
            ${Icon('shield')} ${c.screening_score != null ? 'Skríning znova' : 'Odborný skríning'}</button>
          ${c.screening_score != null ? `<button class="btn btn-ghost btn-sm" onclick="Cand.screening('${c.id}')">
            Prehľad odpovedí</button>` : ''}
          ${!c.outcome ? `
            <button class="btn btn-outline btn-sm" onclick="CandProc.rejectForm()">Zamietnuť</button>
            <button class="btn btn-primary btn-sm" onclick="CandProc.hireForm()">
              ${Icon('check')} Nastúpený</button>` : ''}
        </div>`;
      UI.modal(c.full_name, body, { wide: true });

      // proces sa dotiahne až po otvorení, nech sa modal zobrazí okamžite
      await CandProc.load(id);
      CandProc.open = null;
      CandProc.rerender();
    },

    // ── Skríning ──────────────────────────────────────────────────────────
    // Scenár otázok pre dané remeslo. Hodnotí sa 0–3; overovacie otázky majú
    // vyššiu váhu, lebo práve tie odhalia vymyslenú prax.
    async screening(id) {
      const c = this.items.find(x => x.id === id);
      if (!c) return;
      await this.loadPlaybook();
      const qs = this.questionsFor(c.profession);
      if (!qs.length) {
        return UI.modal('Chýbajú otázky', `<div class="warnbox">${Icon('alert', 14)}
          Pre toto remeslo zatiaľ nie sú žiadne otázky. Spusti migráciu 009 alebo ich doplň v príručke.</div>
          <div class="modal-actions">
            <button class="btn btn-primary" onclick="UI.closeModal();Danubra.go('trades')">
              ${Icon('wrench')} Otvoriť príručku</button></div>`);
      }
      const { data } = await DB.list('screening_answers', { filters: { candidate_id: id }, limit: 500 });
      this.answers = data || [];
      this._renderScreening(c, qs);
    },

    _renderScreening(c, qs) {
      const byQ = new Map(this.answers.map(a => [a.question_id, a]));
      const groups = ['phone', 'interview', 'onsite'].filter(p => qs.some(q => q.phase === p));
      const S = window.DanubraScreening;
      const res = S.scoreScreening(qs, this.answers);

      const rows = groups.map(ph => `
        <div class="form-section">${PHASE_LABEL[ph]} — ${qs.filter(q => q.phase === ph).length} otázok</div>
        ${qs.filter(q => q.phase === ph).map(q => {
          const a = byQ.get(q.id) || {};
          const k = KIND_LABEL[q.kind] || KIND_LABEL.knowledge;
          return `<div class="scr-q" data-q="${q.id}" style="padding:10px 0;border-bottom:1px solid var(--line);">
            <div style="display:flex;gap:8px;align-items:flex-start;">
              <span style="flex:1;font-size:13px;font-weight:600;">${UI.esc(q.question_sk)}</span>
              ${UI.badge(k[0], k[1])}${q.weight >= 3 ? UI.badge('kľúčová', 'red') : ''}
            </div>
            ${q.good_answer ? `<div style="font-size:12px;color:var(--green);margin-top:3px;">✓ ${UI.esc(q.good_answer)}</div>` : ''}
            ${q.red_flag_answer ? `<div style="font-size:12px;color:var(--red);">! ${UI.esc(q.red_flag_answer)}</div>` : ''}
            <div style="display:flex;gap:8px;align-items:center;margin-top:7px;flex-wrap:wrap;">
              <select class="verif-sel scr-rating">
                <option value="" ${a.rating == null ? 'selected' : ''}>— nehodnotené —</option>
                <option value="0" ${a.rating === 0 ? 'selected' : ''}>0 · nevie</option>
                <option value="1" ${a.rating === 1 ? 'selected' : ''}>1 · slabé</option>
                <option value="2" ${a.rating === 2 ? 'selected' : ''}>2 · dobré</option>
                <option value="3" ${a.rating === 3 ? 'selected' : ''}>3 · presné</option>
              </select>
              <label class="chk" style="font-size:12px;">
                <input type="checkbox" class="scr-flag" ${a.flagged ? 'checked' : ''}> varovná odpoveď</label>
              <input class="scr-answer" placeholder="čo odpovedal" value="${UI.esc(a.answer_text || '')}"
                style="flex:1;min-width:180px;">
            </div>
          </div>`;
        }).join('')}`).join('');

      UI.modal(`Skríning — ${c.full_name}`, `
        <div id="scr-summary">${this._screeningSummary(res)}</div>
        <div class="form-grid" style="margin-top:12px;">
          <label class="fld"><span>Posledná stavba</span>
            <input id="scr-site" value="${UI.esc(c.last_site || '')}" placeholder="mesto, firma"></label>
          <label class="fld"><span>Polier, ktorý ho potvrdí</span>
            <input id="scr-foreman" value="${UI.esc(c.last_foreman || '')}" placeholder="meno a telefón"></label>
        </div>
        <label class="chk" style="margin-top:8px;">
          <input type="checkbox" id="scr-refcheck" ${c.reference_checked ? 'checked' : ''}>
          Referenciu som si overil — volal som poliera</label>
        <div id="scr-body">${rows}</div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          <button type="button" class="btn btn-outline" onclick="Cand.recalcScreening('${c.id}')">${Icon('repeat')} Prepočítať</button>
          <button type="button" class="btn btn-primary" onclick="Cand.saveScreening('${c.id}')">Uložiť skríning</button>
        </div>`, { wide: true });
    },

    _screeningSummary(res) {
      const v = VERDICT[res.verdict] || VERDICT.unknown;
      return `
        <div class="kpi-grid">
          <div class="kpi"><div class="kpi-label">Skóre</div>
            <div class="kpi-value" style="color:${res.percent >= 80 ? 'var(--green)' : res.percent >= 60 ? 'var(--ink)' : 'var(--amber)'};">
              ${res.percent} %</div>
            <div class="kpi-delta">zodpovedaných ${res.answered} z ${res.total}</div></div>
          <div class="kpi"><div class="kpi-label">Odporúčanie</div>
            <div class="kpi-value" style="font-size:20px;">${v[0]}</div>
            <div class="kpi-delta">${UI.esc(res.reason)}</div></div>
          <div class="kpi"><div class="kpi-label">Varovania</div>
            <div class="kpi-value" style="color:${res.redFlags.length ? 'var(--red)' : 'var(--green)'};">
              ${res.redFlags.length}</div>
            <div class="kpi-delta">${res.redFlags.length ? 'pozri nižšie' : 'čisté'}</div></div>
        </div>
        ${res.redFlags.length ? `<div class="warnbox" style="margin-top:12px;">
          ${Icon('alert', 14)} ${res.redFlags.map(f => UI.esc(f.question)).join(' · ')}</div>` : ''}`;
    },

    /** Prečíta formulár do poľa odpovedí — bez zápisu do databázy. */
    _collectAnswers(candidateId) {
      const out = [];
      document.querySelectorAll('#scr-body .scr-q').forEach(el => {
        const rating = el.querySelector('.scr-rating').value;
        const answer = el.querySelector('.scr-answer').value.trim();
        const flagged = el.querySelector('.scr-flag').checked;
        if (rating === '' && !answer && !flagged) return;
        out.push({
          candidate_id: candidateId, question_id: el.dataset.q,
          rating: rating === '' ? null : Number(rating),
          answer_text: answer || null, flagged,
        });
      });
      return out;
    },

    recalcScreening(id) {
      const c = this.items.find(x => x.id === id);
      this.answers = this._collectAnswers(id);
      const res = window.DanubraScreening.scoreScreening(this.questionsFor(c.profession), this.answers);
      const box = document.getElementById('scr-summary');
      if (box) box.innerHTML = this._screeningSummary(res);
    },

    async saveScreening(id) {
      const c = this.items.find(x => x.id === id);
      const rows = this._collectAnswers(id);
      if (rows.length) {
        const { error } = await DB.from('screening_answers')
          .upsert(rows, { onConflict: 'candidate_id,question_id' });
        if (error) return UI.toast('Chyba: ' + error.message, 'err');
      }
      this.answers = rows;
      const res = window.DanubraScreening.scoreScreening(this.questionsFor(c.profession), rows);
      const patch = {
        screening_score: res.answered ? res.percent : null,
        screening_verdict: res.verdict,
        screening_done_at: new Date().toISOString(),
        last_site: document.getElementById('scr-site')?.value.trim() || null,
        last_foreman: document.getElementById('scr-foreman')?.value.trim() || null,
        reference_checked: !!document.getElementById('scr-refcheck')?.checked,
      };
      const { error } = await DB.update('candidates', id, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      Object.assign(c, patch);
      UI.closeModal();
      UI.toast(`Skríning uložený — ${res.percent} %, ${(VERDICT[res.verdict] || VERDICT.unknown)[0].toLowerCase()}`, 'ok');
      Danubra.renderRoute();
    },

    async markContacted(id) {
      const c = this.items.find(x => x.id === id);
      const patch = { first_contact_at: new Date().toISOString() };
      if (c.status === 'new') patch.status = 'contacted';
      await DB.update('candidates', id, patch);
      Object.assign(c, patch);
      UI.toast(`Zaznamenané — reakcia za ${this.responseMinutes(c)} min`, 'ok');
      this.detail(id);
    },

    async setStatus(id, status) {
      const c = this.items.find(x => x.id === id);
      const patch = { status };
      if (status !== 'new' && !c.first_contact_at) patch.first_contact_at = new Date().toISOString();
      await DB.update('candidates', id, patch);
      Object.assign(c, patch);
      UI.toast('Stav uložený', 'ok');
      Danubra.renderRoute();
    },

    /** Prevedie kandidáta na pracovníka a zachová väzbu. */
    async convert(id, { silent = false } = {}) {
      const c = this.items.find(x => x.id === id);
      if (!c) return;
      if (!silent && !confirm(`Previesť ${c.full_name} medzi pracovníkov?`)) return;
      const payload = {
        full_name: c.full_name, phone: c.phone, email: c.email, whatsapp: c.whatsapp,
        language: c.language, city: c.city, country: c.country,
        profession: c.profession, skill_level: c.skill_level, german_level: c.german_level,
        driving_licence: c.driving_licence, own_tools: c.own_tools,
        legal_form: c.legal_form || 'szco',
        hourly_cost: c.expected_rate ?? null,
        regulated_trade: REGULATED.includes(c.profession),
        status: 'ready', available_from: c.available_from,
        source: c.source, candidate_id: c.id,
        cooperating_since: new Date().toISOString().slice(0, 10),
        notes: c.notes,
      };
      const { data: w, error } = await DB.insert('workers', payload);
      if (error) { UI.toast('Chyba: ' + error.message, 'err'); return null; }
      // pri nastúpení stav prepisuje volajúci — nezhadzuj 'placed' späť na 'ready'
      const patch = { converted_worker_id: w.id, converted_at: new Date().toISOString() };
      if (!silent) patch.status = 'ready';
      await DB.update('candidates', id, patch);
      Object.assign(c, patch);
      if (window.Wrk) { Wrk.loaded = false; }
      if (silent) return w;
      UI.closeModal();
      UI.toast(`${c.full_name} je medzi pracovníkmi`, 'ok');
      await this.load(); Danubra.renderRoute();
    },

    async form(id) {
      await this.loadPlaybook();
      const c = id ? this.items.find(x => x.id === id) || {} : {};
      const openPlans = this.plans.filter(p => p.status === 'active' || p.id === c.plan_id);
      const body = `
        <form id="cand-form" onsubmit="event.preventDefault();Cand.save('${id || ''}')">
          <div class="form-grid">
            ${UI.field('full_name', 'Meno alebo názov partie', { value: c.full_name, required: true })}
            ${UI.field('type', 'Typ', { value: c.type || 'individual',
              options: [['individual', 'Jednotlivec'], ['crew', 'Partia']] })}
            ${UI.field('crew_size', 'Koľkí sú (pri partii)', { type: 'number', value: c.crew_size })}
            ${UI.field('status', 'Stav', { value: c.status || 'new', options: STAGES.map(s => [s[0], s[1]]) })}
            ${UI.field('phone', 'Telefón', { value: c.phone })}
            ${UI.field('email', 'E-mail', { type: 'email', value: c.email })}
            ${UI.field('profession', 'Profesia', { value: c.profession, options: [['', '—'], ...PROFESSIONS] })}
            ${UI.field('skill_level', 'Zaradenie', { value: c.skill_level, options: [['', '—'], ['werker', 'Werker (LG1)'], ['fachwerker', 'Fachwerker (LG2)']] })}
            ${UI.field('legal_form', 'Forma spolupráce', { value: c.legal_form || 'szco', options: [['szco', 'Živnostník'], ['employee', 'Zamestnanec']] })}
            ${UI.field('city', 'Mesto', { value: c.city })}
            ${UI.field('source', 'Zdroj', { value: c.source, options: [['', '—'], ...SOURCES] })}
            ${UI.field('source_detail', 'Podrobnosť k zdroju', { value: c.source_detail, placeholder: 'kampaň, kto odporučil…' })}
            ${UI.field('expected_rate', 'Predstava sadzby €/h', { type: 'number', value: c.expected_rate })}
            ${UI.field('available_from', 'Dostupný od', { type: 'date', value: c.available_from })}
            ${UI.field('german_level', 'Nemčina', { value: c.german_level, options: [['', '—'], ['ziadny', 'Žiadna'], ['zaklad', 'Základ'], ['dobry', 'Dobrá']] })}
            ${UI.field('language', 'Jazyk', { value: c.language, options: [['', '—'], ['sk', 'SK'], ['hu', 'HU'], ['cs', 'CS'], ['ua', 'UA']] })}
            ${UI.field('plan_id', 'Na ktorý nábor', { value: c.plan_id || '',
              options: [['', '— žiadny konkrétny —'], ...openPlans.map(p => [p.id, p.title])] })}
            ${UI.field('last_site', 'Posledná stavba', { value: c.last_site, placeholder: 'mesto, firma' })}
            ${UI.field('last_foreman', 'Polier, ktorý ho potvrdí', { value: c.last_foreman, placeholder: 'meno a telefón' })}
            ${UI.field('trade_license_status', 'Živnosť', { value: c.trade_license_status || '',
              options: [['', '—'], ['active', 'Aktívna'], ['willing', 'Ochotný si založiť'], ['none', 'Nemá']] })}
            ${UI.field('expected_start', 'Možný nástup', { type: 'date', value: c.expected_start })}
          </div>
          <div class="chk-row">
            ${UI.field('whatsapp', '', { type: 'checkbox', value: c.whatsapp, placeholder: 'Má WhatsApp' })}
            ${UI.field('driving_licence', '', { type: 'checkbox', value: c.driving_licence, placeholder: 'Vodičský preukaz' })}
            ${UI.field('own_tools', '', { type: 'checkbox', value: c.own_tools, placeholder: 'Vlastné náradie' })}
            ${UI.field('german_speaker', '', { type: 'checkbox', value: c.german_speaker, placeholder: 'Hovorí po nemecky' })}
            ${UI.field('has_car', '', { type: 'checkbox', value: c.has_car, placeholder: 'Má vlastné auto' })}
          </div>
          ${UI.field('notes', 'Poznámka', { type: 'textarea', value: c.notes })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Pridať'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť kandidáta' : 'Nový kandidát', body, { wide: true });
    },

    async save(id) {
      const d = UI.formData(document.getElementById('cand-form'));
      if (!d.full_name) return UI.toast('Meno je povinné', 'err');
      const payload = { ...d };
      payload.expected_rate = d.expected_rate === '' ? null : Number(d.expected_rate);
      if (payload.available_from === '') payload.available_from = null;
      if (payload.plan_id === '') payload.plan_id = null;
      if (payload.expected_start === '') payload.expected_start = null;
      if (payload.trade_license_status === '') payload.trade_license_status = null;
      payload.crew_size = d.crew_size === '' ? null : Number(d.crew_size);
      if (payload.type !== 'crew') payload.crew_size = null;
      const res = id ? await DB.update('candidates', id, payload) : await DB.insert('candidates', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast(id ? 'Uložené' : 'Pridané', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    async del(id) {
      if (!confirm('Zmazať tohto kandidáta?')) return;
      await DB.remove('candidates', id);
      this.items = this.items.filter(x => x.id !== id);
      UI.closeModal(); Danubra.renderRoute();
    },
  };

  window.Cand = Cand;
  Danubra.views.candidates = function (el) { Cand.view(el); };
})();
