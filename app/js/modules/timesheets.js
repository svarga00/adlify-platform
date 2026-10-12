// ============================================================================
// DANUBRA — Evidencia odpracovaných hodín (Fáza 2)
// ============================================================================
// Oddelená evidencia dielňa vs. stavba je nutná pre pravidlo >50 % (SOKA-BAU)
// a pre dokumentáciu pracovného času podľa §19 AEntG — najneskôr do 7. dňa
// po výkone práce, v nemčine na požiadanie Finanzkontrolle Schwarzarbeit.
// ============================================================================
(function () {
  const ACTIVITY = [
    ['construction', 'Stavba', 'amber'],
    ['workshop', 'Dielňa', 'blue'],
    ['travel', 'Cesta', 'gray'],
  ];

  const Tms = {
    items: [], assignments: [], workers: [], subcontracts: [], loaded: false,
    filters: { month: '', worker_id: '', subcontract_id: '', q: '', period: 'all', from: '', to: '' },

    async load() {
      const [t, a, w, s] = await Promise.all([
        DB.list('timesheets', { order: { column: 'work_date', ascending: false }, limit: 2000 }),
        DB.list('assignments', { limit: 1000 }),
        DB.list('workers', { select: 'id,full_name,profession,skill_level,gross_monthly', limit: 500 }),
        DB.list('subcontracts', { select: 'id,title,work_type,charge_rate,partner_id,contract_number', limit: 500 }),
      ]);
      this.items = t.data || []; this.assignments = a.data || [];
      this.workers = w.data || []; this.subcontracts = s.data || [];
      this.loaded = true;
      if (!this.filters.month) this.filters.month = new Date().toISOString().slice(0, 7);
    },

    workerOf(id) { return this.workers.find(w => w.id === id); },
    asgOf(id) { return this.assignments.find(a => a.id === id); },
    subOf(id) { return this.subcontracts.find(s => s.id === id); },
    actMeta(a) { return ACTIVITY.find(x => x[0] === a) || ACTIVITY[0]; },

    filtered() {
      const f = this.filters;
      const pre = this.items.filter(t => {
        if (f.month && !String(t.work_date).startsWith(f.month)) return false;
        if (f.worker_id && t.worker_id !== f.worker_id) return false;
        if (f.subcontract_id) {
          const a = this.asgOf(t.assignment_id);
          if (!a || a.subcontract_id !== f.subcontract_id) return false;
        }
        return true;
      });
      // Mesiac je rýchla voľba, obdobie je presná — dajú sa kombinovať, lebo
      // „september, ale len prvý týždeň" je bežná otázka.
      return Shell.filterRows(pre, {
        q: f.q,
        fields: ['description', (t) => (this.workerOf(t.worker_id) || {}).full_name,
          (t) => { const a = this.asgOf(t.assignment_id);
            return a ? (this.subOf(a.subcontract_id) || {}).title : ''; }],
        period: { field: 'work_date', key: f.period, from: f.from, to: f.to },
      });
    },

    exportCsv() {
      const f = this.filters;
      Shell.exportCsv(this.filtered(), [
        ['Dátum', t => t.work_date],
        ['Živnostník', t => (this.workerOf(t.worker_id) || {}).full_name],
        ['Zákazka', t => { const a = this.asgOf(t.assignment_id);
          return a ? (this.subOf(a.subcontract_id) || {}).title : ''; }],
        ['Činnosť', t => this.actMeta(t.activity_type)[1]],
        ['Od', t => t.time_from],
        ['Do', t => t.time_to],
        ['Hodiny', t => DanubraExport.num(t.hours, 2)],
        ['Sadzba', t => DanubraExport.num(t.rate_used)],
        ['Schválené', t => (t.approved ? 'áno' : 'nie')],
        ['Popis', t => t.description],
      ], ['hodiny',
        Shell.periodSlug({ field: 'work_date', key: f.period, from: f.from, to: f.to })]);
    },

    async view(el) {
      // Týždeň je prvý, pretože to je ten bežný prípad: človek odrobí šesť
      // dní a predtým sa to zapisovalo šesťkrát otvorením okna.
      Danubra.setActions(`
        <button class="btn btn-primary btn-sm" onclick="Tms.weekForm()">${Icon('calendar', 14)} Zapísať týždeň</button>
        <button class="btn btn-outline btn-sm" onclick="Tms.form()">${Icon('plus')} Jeden deň</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const rows = this.filtered();
      const share = DanubraMargin.constructionShare(rows);
      const totalHours = rows.reduce((s, t) => s + Number(t.hours || 0), 0);
      const unapproved = rows.filter(t => !t.approved).length;

      // hodiny staršie ako 7 dní bez zápisu sú riziko podľa §19 AEntG
      const today = new Date();
      const late = rows.filter(t => {
        const d = new Date(t.work_date);
        return !t.approved && (today - d) / 86400000 > 7;
      }).length;

      el.innerHTML = Danubra.header('Odpracované hodiny',
        `${Math.round(totalHours)} h za ${this.filters.month || 'obdobie'} · ${unapproved} neschválených`) +
        this.nowHtml(rows) +
        (late ? `<div class="warnbox" style="margin-bottom:14px;">
          ${Icon('alert', 14)} ${late} ${late === 1 ? 'záznam je' : 'záznamov je'} starších ako 7 dní bez schválenia —
          dokumentácia pracovného času sa podľa §19 AEntG vedie do 7 dní po výkone práce.</div>` : '') + `

        <div class="kpi-grid" style="margin-bottom:16px;">
          <div class="kpi"><div class="kpi-label">Hodiny spolu</div>
            <div class="kpi-value">${Math.round(totalHours)}</div>
            <div class="kpi-delta">za vybrané obdobie</div></div>
          <div class="kpi"><div class="kpi-label">Stavba</div>
            <div class="kpi-value" style="color:var(--amber);">${Math.round(share.constructionHours)}</div>
            <div class="kpi-delta">${UI.pct(share.pct)} z produktívnych</div></div>
          <div class="kpi"><div class="kpi-label">Dielňa</div>
            <div class="kpi-value" style="color:var(--blue);">${Math.round(share.totalHours - share.constructionHours)}</div>
            <div class="kpi-delta">bez SOKA-BAU</div></div>
          <div class="kpi"><div class="kpi-label">SOKA-BAU</div>
            <div class="kpi-value" style="color:${share.sokaRequired ? 'var(--red)' : 'var(--green)'};">${share.sokaRequired ? 'Áno' : 'Nie'}</div>
            <div class="kpi-delta">${share.sokaRequired ? 'stavba nad 50 %' : 'pod hranicou 50 %'}</div></div>
        </div>

        ${Shell.filterbar({
          search: { value: this.filters.q, placeholder: 'Hľadať meno, zákazku, popis…',
            oninput: 'Tms.setF("q", this.value)' },
          selects: [
            { value: this.filters.worker_id, label: 'Živnostník',
              onchange: 'Tms.setF("worker_id", this.value)',
              options: [['', 'Všetci pracovníci'], ...this.workers.map(w => [w.id, w.full_name])] },
            { value: this.filters.subcontract_id, label: 'Zákazka',
              onchange: 'Tms.setF("subcontract_id", this.value)',
              options: [['', 'Všetky zákazky'], ...this.subcontracts.map(x => [x.id, x.title])] },
          ],
          period: { field: 'work_date', key: this.filters.period, from: this.filters.from,
            to: this.filters.to, label: 'Odrobené', set: 'Tms.setF' },
          exportCsv: 'Tms.exportCsv()',
          total: this.items.length, shown: rows.length,
        })}
        ${rows.length === 0
          ? (this.items.length
              ? UI.empty('search', 'Filtru nič nesedí',
                  `V databáze je ${this.items.length} záznamov o hodinách, ale ani jeden nevyhovuje.`)
              : UI.empty('clock', 'Žiadne hodiny', 'Zapíš odpracované hodiny pre vybrané obdobie.',
                  `<button class="btn btn-primary" onclick="Tms.form()">${Icon('plus')} Zapísať hodiny</button>`))
          : rows.map(t => this.row(t)).join('')}`;
    },

    /**
     * Čo spraviť teraz — jedna veta a jedno tlačidlo, rovnako ako na nábore
     * a na zákazke.
     *
     * Na tejto obrazovke sú vždy len dve možnosti: buď niečo visí na
     * schválení (a sú to peniaze, ktoré sa nedostanú do podkladu), alebo za
     * vybrané obdobie nie sú zapísané hodiny. Keď je oboje v poriadku,
     * obrazovka mlčí — veta „všetko je v poriadku" nad zoznamom je len šum.
     */
    nowHtml(rows) {
      const nesch = rows.filter(t => !t.approved);
      if (nesch.length) {
        const h = nesch.reduce((s, t) => s + Number(t.hours || 0), 0);
        return `<div class="nowbox nowbox-hot">
          <div class="nowbox-label">Čo spraviť teraz</div>
          <div class="nowbox-title">Schváliť hodiny ${Help.btn('card.hours.approve', { size: 14 })}</div>
          <div class="nowbox-sub">${nesch.length} ${Shell.plural(nesch.length, 'výkaz', 'výkazy', 'výkazov')}
            za ${Math.round(h)} ${Shell.plural(Math.round(h), 'hodinu', 'hodiny', 'hodín')} čaká na schválenie.</div>
          <div class="nowbox-why">Neschválené hodiny sa do podkladu na faktúru nedostanú —
            nie sú stratené, ale v tomto mesiaci sa za ne nevyfakturuje.</div>
          <button type="button" class="btn btn-primary btn-block" style="margin-top:10px;"
            onclick="Tms.approveShown()">${Icon('check', 17)}
            Schváliť všetkých ${nesch.length}</button>
        </div>`;
      }
      // Bez nasadení sa hodiny zapísať nedajú, takže vyzvať na to je nezmysel.
      const asg = this.assignments.filter(a => a.status !== 'cancelled');
      if (!rows.length && asg.length) {
        return `<div class="nowbox">
          <div class="nowbox-label">Čo spraviť teraz</div>
          <div class="nowbox-title">Zapísať hodiny</div>
          <div class="nowbox-sub">Za vybrané obdobie nie je zapísaná ani jedna hodina.</div>
          <div class="nowbox-why">Hodiny, ktoré nikto nezapísal, sa nevyfakturujú —
            a nikto si to nevšimne, nie je s čím porovnať.</div>
          <button type="button" class="btn btn-primary btn-block" style="margin-top:10px;"
            onclick="Tms.weekForm()">${Icon('calendar', 17)} Zapísať týždeň</button>
        </div>`;
      }
      return '';
    },

    /**
     * Schváli to, čo je práve vo filtri — nie všetko v databáze.
     *
     * Toto je rozdiel, ktorý sa nedá uhádnuť, preto to potvrdenie hovorí
     * nahlas: schvaľuje sa presne toľko záznamov, koľko je vidieť.
     */
    async approveShown() {
      const nesch = this.filtered().filter(t => !t.approved);
      if (!nesch.length) return;
      const h = Math.round(nesch.reduce((s, t) => s + Number(t.hours || 0), 0));
      const ok = await UI.confirm(`Schváliť ${nesch.length} `
        + `${Shell.plural(nesch.length, 'výkaz', 'výkazy', 'výkazov')} za ${h} `
        + `${Shell.plural(h, 'hodinu', 'hodiny', 'hodín')}? Schvaľuje sa to, čo je vo filtri vidieť.`);
      if (!ok) return;

      const at = new Date().toISOString();
      let chyby = 0;
      for (const t of nesch) {
        const { error } = await DB.update('timesheets', t.id, { approved: true, approved_at: at });
        if (error) { chyby++; continue; }
        t.approved = true; t.approved_at = at;
      }
      UI.toast(chyby
        ? `Schválených ${nesch.length - chyby} z ${nesch.length} — ${chyby} sa nepodarilo`
        : `Schválené: ${nesch.length}`, chyby ? 'err' : 'ok');
      Danubra.renderRoute();
    },

    row(t) {
      const w = this.workerOf(t.worker_id);
      const a = this.asgOf(t.assignment_id);
      const sc = a ? this.subOf(a.subcontract_id) : null;
      const m = this.actMeta(t.activity_type);
      return `
        <div class="list-row" style="cursor:default;">
          <span class="dot ${m[2] === 'amber' ? 'amber' : m[2] === 'blue' ? '' : ''}"
            style="${m[2] === 'blue' ? 'background:var(--blue);' : ''}"></span>
          <span style="flex:1;font-size:13px;">
            <strong>${UI.esc(w?.full_name || '—')}</strong>
            <span style="color:var(--ink-mute);"> · ${UI.date(t.work_date)}</span>
            <span style="color:var(--ink-mute);display:block;font-size:12px;">
              ${m[1]}${sc ? ` · ${UI.esc(sc.title)}` : ''}${t.description ? ` · ${UI.esc(t.description)}` : ''}</span>
          </span>
          <strong style="font-variant-numeric:tabular-nums;">${Number(t.hours).toLocaleString('sk-SK')} h</strong>
          <span class="row-acts">
            <button class="btn btn-ghost btn-sm tap" onclick="Tms.toggleApprove('${t.id}')"
              title="${t.approved ? 'Schválené' : 'Schváliť'}"
              style="color:${t.approved ? 'var(--green)' : 'var(--ink-mute)'};">${Icon('check', 15)}</button>
            <button class="btn btn-ghost btn-sm tap tap-far" style="color:var(--red);"
              title="Zmazať" onclick="Tms.del('${t.id}')">${Icon('x', 15)}</button>
          </span>
        </div>`;
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    // ── Zápis týždňa ──────────────────────────────────────────────────────
    // Človek na turnuse odrobí šesť dní. Predtým sa to zapisovalo šesťkrát:
    // otvor okno, vyber nasadenie, vyber dátum, zapíš, zatvor. Pri partii
    // štyroch ľudí to bolo dvadsaťštyri okien za týždeň — a práve preto sa
    // hodiny zapisovali s týždňovým sklzom, čo je riziko podľa §19 AEntG.
    //
    // Tu je to jedna obrazovka: jeden človek, jeden týždeň, sedem riadkov.
    // Deň s prázdnymi hodinami sa jednoducho nezapíše.
    DAYS: ['Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota', 'Nedeľa'],

    /** Monday of the week containing `iso`. ISO 8601 — týždeň začína pondelkom. */
    mondayOf(iso) {
      const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) return null;
      const shift = (d.getUTCDay() + 6) % 7;        // nedeľa = 6, nie 0
      d.setUTCDate(d.getUTCDate() - shift);
      return d.toISOString().slice(0, 10);
    },

    addDays(iso, n) {
      const d = new Date(`${iso}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    },

    /** Hodnota poľa v zápise týždňa. `UI.field` dáva poliam `name`, nie `id`. */
    weekField(name) {
      const el = document.querySelector(`#tms-week [name="${name}"]`);
      return el ? el.value : '';
    },

    weekForm(assignmentId, weekFrom) {
      const active = this.assignments.filter(a => a.status !== 'cancelled');
      if (!active.length) return UI.toast('Najprv nasaď pracovníka na zákazku', 'err');
      // Dátum sa vždy zarovná na pondelok — inak by „týždeň od stredy" zapísal
      // dva kusy dvoch týždňov a výkaz pre odberateľa (kalendárny týždeň) by
      // nesedel s tým, čo je v appke.
      const from = this.mondayOf(weekFrom || new Date().toISOString().slice(0, 10));
      const asgId = assignmentId || active[0].id;

      // Čo je za ten týždeň už zapísané, sa nesmie zapísať druhýkrát. Preto
      // sa to načíta a ukáže ako hotový deň, nie ako prázdne pole.
      const uz = new Map();
      for (const t of this.items) {
        if (t.assignment_id !== asgId) continue;
        const d = String(t.work_date).slice(0, 10);
        if (d >= from && d <= this.addDays(from, 6)) uz.set(d, t);
      }

      const rowHtml = (i) => {
        const date = this.addDays(from, i);
        const hotovy = uz.get(date);
        const vikend = i >= 5;
        return `
          <div class="week-row${vikend ? ' is-weekend' : ''}">
            <span class="week-day"><b>${this.DAYS[i]}</b><em>${UI.date(date)}</em></span>
            ${hotovy
              ? `<span class="week-done">${Icon('check', 14)}
                   ${Number(hotovy.hours).toLocaleString('sk-SK')} h už zapísaných</span>`
              : `<input type="number" step="0.25" min="0" max="24" class="week-h"
                   data-date="${date}" placeholder="${vikend ? '' : '0'}"
                   aria-label="Hodiny ${this.DAYS[i]}">
                 <input type="time" class="week-from" data-date="${date}"
                   aria-label="Od ${this.DAYS[i]}">
                 <input type="time" class="week-to" data-date="${date}"
                   aria-label="Do ${this.DAYS[i]}">`}
          </div>`;
      };

      const body = `
        <form id="tms-week" onsubmit="event.preventDefault();Tms.saveWeek()">
          <div class="form-grid">
            ${UI.field('assignment_id', 'Kto a na ktorej zákazke', { value: asgId,
              hint: 'Zmena prepíše týždeň — už zapísané dni sa ukážu ako hotové.',
              onchange: 'Tms.weekForm(this.value, Tms.weekField("week_from"))',
              options: active.map(a => {
                const w = this.workerOf(a.worker_id); const s = this.subOf(a.subcontract_id);
                return [a.id, `${w?.full_name || '—'} · ${s?.title || '—'}`];
              }) })}
            ${UI.field('week_from', 'Týždeň od (pondelok)', { type: 'date', value: from,
              hint: 'Dátum sa sám zarovná na pondelok toho týždňa.',
              onchange: 'Tms.weekForm(Tms.weekField("assignment_id"), this.value)' })}
            ${UI.field('activity_type', 'Činnosť', { value: 'construction',
              hint: 'Platí pre celý týždeň. Jeden deň iného druhu dopíš cez „Jeden deň".',
              options: ACTIVITY.map(a => [a[0], a[1]]) })}
          </div>

          <div class="week-head">
            <span>Deň</span><span>Hodiny</span><span>Od</span><span>Do</span>
          </div>
          ${[0, 1, 2, 3, 4, 5, 6].map(rowHtml).join('')}

          <div class="week-tools">
            <button type="button" class="btn btn-outline btn-sm"
              onclick="Tms.fillWeek(8)">Po–Pia po 8 h</button>
            <button type="button" class="btn btn-outline btn-sm"
              onclick="Tms.fillWeek(10)">Po–Pia po 10 h</button>
            <button type="button" class="btn btn-ghost btn-sm"
              onclick="Tms.fillWeek(null)">Vymazať</button>
            <span class="week-sum" id="week-sum"></span>
          </div>

          ${UI.field('description', 'Popis práce', { type: 'textarea', rows: 2,
            hint: 'Platí pre všetky zapísané dni. Pri Werkvertrag je to doklad o diele.',
            placeholder: 'Čo sa reálne robilo' })}

          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${Icon('check')} Zapísať týždeň</button>
          </div>
        </form>`;
      UI.modal('Zápis týždňa', body, { wide: true });
      this.weekSum();
      for (const el of document.querySelectorAll('#tms-week .week-h')) {
        el.addEventListener('input', () => this.weekSum());
      }
    },

    /** Predvyplní pracovné dni. Víkend zámerne nie — to nie je norma. */
    fillWeek(hours) {
      const fields = [...document.querySelectorAll('#tms-week .week-h')];
      fields.forEach((el, i) => {
        // `i` je poradie **prázdnych** polí, nie dní — hotové dni medzi nimi
        // nie sú. Deň sa preto berie z dátumu, nie z indexu.
        const d = new Date(`${el.dataset.date}T00:00:00Z`);
        const vikend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
        el.value = (hours == null || vikend) ? '' : String(hours);
      });
      this.weekSum();
    },

    weekSum() {
      const el = document.getElementById('week-sum');
      if (!el) return;
      const h = [...document.querySelectorAll('#tms-week .week-h')]
        .reduce((s, x) => s + (Number(x.value) || 0), 0);
      el.textContent = h
        ? `${h.toLocaleString('sk-SK')} ${Shell.plural(h, 'hodina', 'hodiny', 'hodín')} spolu`
        : '';
    },

    async saveWeek() {
      const d = UI.formData(document.getElementById('tms-week'));
      const a = this.asgOf(d.assignment_id);
      if (!a) return UI.toast('Vyber nasadenie', 'err');

      const rows = [];
      for (const el of document.querySelectorAll('#tms-week .week-h')) {
        const hours = Number(el.value);
        if (!hours || hours <= 0) continue;
        if (hours > 24) return UI.toast(`${UI.date(el.dataset.date)}: viac ako 24 hodín`, 'err');
        const date = el.dataset.date;
        const pick = (sel) => {
          const x = document.querySelector(`#tms-week ${sel}[data-date="${date}"]`);
          return x && x.value ? x.value : null;
        };
        rows.push({
          assignment_id: d.assignment_id, worker_id: a.worker_id,
          work_date: date, hours,
          activity_type: d.activity_type || 'construction',
          time_from: pick('.week-from'), time_to: pick('.week-to'),
          description: d.description || null,
        });
      }
      if (!rows.length) return UI.toast('Nie je čo zapísať — doplň hodiny', 'err');

      const { error } = await DB.insertMany('timesheets', rows);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const h = rows.reduce((s, r) => s + r.hours, 0);
      UI.closeModal();
      UI.toast(`Zapísaných ${rows.length} ${Shell.plural(rows.length, 'deň', 'dni', 'dní')}`
        + ` · ${h.toLocaleString('sk-SK')} h`, 'ok');
      await this.load(); Danubra.renderRoute();
    },

    form() {
      const active = this.assignments.filter(a => a.status !== 'cancelled');
      if (!active.length) return UI.toast('Najprv nasaď pracovníka na zákazku', 'err');
      const today = new Date().toISOString().slice(0, 10);
      const body = `
        <form id="tms-form" onsubmit="event.preventDefault();Tms.save()">
          <div class="form-grid">
            ${UI.field('assignment_id', 'Nasadenie', { required: true, options: active.map(a => {
              const w = this.workerOf(a.worker_id); const s = this.subOf(a.subcontract_id);
              return [a.id, `${w?.full_name || '—'} · ${s?.title || '—'}`];
            }) })}
            ${UI.field('work_date', 'Dátum', { type: 'date', value: today, required: true })}
            ${UI.field('hours', 'Hodiny', { type: 'number', value: 8, required: true })}
            ${UI.field('activity_type', 'Činnosť', { value: 'construction', options: ACTIVITY.map(a => [a[0], a[1]]) })}
            ${UI.field('time_from', 'Od', { type: 'time',
              hint: 'Nepovinné. Výkaz pre odberateľa (Stundennachweis) ich tlačí — bez nich tam je „—".' })}
            ${UI.field('time_to', 'Do', { type: 'time' })}
          </div>
          ${UI.field('description', 'Popis práce', { type: 'textarea', rows: 2,
            placeholder: 'Čo sa reálne robilo — slúži aj ako doklad o výkone diela' })}
          <div class="regimebox">Cesta sa nezapočítava do pomeru stavba/dielňa,
          ale eviduje sa kvôli úplnosti dokumentácie pracovného času.</div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">Zapísať</button>
          </div>
        </form>`;
      UI.modal('Zápis hodín', body, { wide: true });
    },

    async save() {
      const d = UI.formData(document.getElementById('tms-form'));
      const a = this.asgOf(d.assignment_id);
      if (!a) return UI.toast('Vyber nasadenie', 'err');
      const payload = {
        assignment_id: d.assignment_id, worker_id: a.worker_id,
        work_date: d.work_date, hours: Number(d.hours),
        activity_type: d.activity_type, description: d.description || null,
        // Prázdne pole je `''`, nie `null` — a prázdny reťazeč databáza pri
        // type `time` odmietne. Výkaz si potom myslí, že časy sú zmiešané.
        time_from: d.time_from || null, time_to: d.time_to || null,
      };
      if (!payload.hours || payload.hours <= 0) return UI.toast('Zadaj počet hodín', 'err');
      const { error } = await DB.insert('timesheets', payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal(); UI.toast('Hodiny zapísané', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    async toggleApprove(id) {
      const t = this.items.find(x => x.id === id);
      if (!t) return;
      const on = !t.approved;
      await DB.update('timesheets', id, { approved: on, approved_at: on ? new Date().toISOString() : null });
      t.approved = on;
      Danubra.renderRoute();
    },

    async del(id) {
      if (!await UI.confirm('Zmazať tento záznam?')) return;
      await DB.remove('timesheets', id);
      this.items = this.items.filter(x => x.id !== id);
      Danubra.renderRoute();
    },
  };

  window.Tms = Tms;
  Danubra.views.timesheets = function (el) { return Tms.view(el); };
})();
