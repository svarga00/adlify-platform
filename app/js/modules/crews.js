// ============================================================================
// DANUBRA — Partie
// ============================================================================
// Partia je organizačná skupina, nie právny subjekt. Nasadzuje sa naraz, ale
// každý člen fakturuje sám za seba (R5) — preto tu nie je a nebude tlačidlo
// „vystaviť faktúru za partiu".
//
// Členstvo má trvanie: odchod sa zapisuje, nemaže. Inak by sa spätne nedalo
// povedať, kto na ktorej stavbe bol.
//
// Logika je v lib/staffing/crews.js a má testy; tento modul ju vykresľuje.
// ============================================================================
(function () {
  const Crews = {
    items: [], members: [], loaded: false,
    filters: { status: 'active', q: '' },

    async load() {
      const [c, m] = await Promise.all([
        DB.list('crews', { order: { column: 'created_at', ascending: false }, limit: 300 }),
        DB.list('crew_members', { limit: 2000 }),
        Enums.load(),
      ]);
      this.items = c.data || []; this.members = m.data || [];
      this.loaded = true;
      if (!Wrk.loaded) await Wrk.load();
    },

    membersOf(crewId) { return this.members.filter(m => m.crew_id === crewId); },
    workerOf(id) { return Wrk.items.find(w => w.id === id) || null; },
    // Záloha, kým sa číselník nenačíta (rovnaké názvy ako v migrácii 015).
    STATUS: [['active', 'Aktívna'], ['paused', 'Pozastavená'], ['disbanded', 'Rozpustená']],
    statusOptions() { const o = Enums.options('crew_status'); return o && o.length ? o : this.STATUS; },
    statusLabel(s) {
      const l = Enums.label('crew_status', s);
      return (l && l !== s) ? l : ((this.STATUS.find(x => x[0] === s) || [])[1] || l || s);
    },
    statusKind(s) { return s === 'active' ? 'green' : s === 'paused' ? 'amber' : 'gray'; },

    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const today = new Date().toISOString().slice(0, 10);
      const rows = this.items.map(c => this.listRow(c, today));

      // Hlavná akcia patrí do horného pruhu — rovnako ako na ostatných
      // obrazovkách. Keď je raz tam a raz v hlavičke, hľadá sa zakaždým znova.
      Danubra.setActions(
        `<button class="btn btn-primary btn-sm" onclick="Crews.form()">${Icon('plus')} Nová partia</button>`);
      // Zoznam je spoločný komponent (`DataList`). Dovtedy tu boli karty
      // s filtrom len podľa stavu — nebolo vidieť, kde partia robí a či majú
      // všetci doklady.
      const bad = rows.filter(r => r.problem && r.c.status === 'active').length;
      el.innerHTML = Danubra.header(Danubra.labelOf('crews'),
        `Chodia spolu, fakturuje každý sám za seba · ${rows.filter(r => r.c.status === 'active').length} aktívnych${
          bad ? ` · ${bad} na pozretie` : ''}`)
        + DataList.html(this.listConfig(rows));
    },

    /** Riadok zoznamu: partia, predák, členovia, kde robia a či majú doklady. */
    listRow(c, today) {
      const members = this.membersOf(c.id);
      const active = DanubraCrews.activeMembers(members);
      const leader = DanubraCrews.leaderOf(members);
      const lw = (leader && this.workerOf(leader.worker_id))
        || (c.leader_worker_id && this.workerOf(c.leader_worker_id)) || null;
      const rev = DanubraCrews.review({ crew: c, members, workers: Wrk.items });
      // Doklady: tá istá kontrola ako v detaile partie (stavba).
      const noDocs = [];
      for (const m of active) {
        const w = this.workerOf(m.worker_id);
        const ready = DanubraDocs.readiness({ docs: w ? Wrk.docsOf(w.id) : [], workType: 'construction',
          regulated: !!(w && w.regulated_trade) });
        if (!ready.ok) noDocs.push(w ? w.full_name : '(neznámy)');
      }
      // Kde sú nasadení: bežiace nasadenia členov (alebo nasadenia partie).
      const ids = new Set(active.map(m => m.worker_id));
      const asg = (Wrk.assignments || []).filter(a => (a.crew_id === c.id || ids.has(a.worker_id))
        && a.status !== 'cancelled' && a.status !== 'completed'
        && (!a.date_to || String(a.date_to).slice(0, 10) >= today));
      const subIds = [...new Set(asg.map(a => a.subcontract_id).filter(Boolean))];
      const subOf = (id) => (Wrk.subs || []).find(s => s.id === id) || null;
      const problems = rev.reasons.length + rev.warnings.length;
      return {
        id: c.id, c, active, lw, rev, problems, noDocs, subIds,
        subs: subIds.map(subOf).filter(Boolean),
        deployed: asg.length,
        problem: problems > 0 || noDocs.length > 0,
        name: c.name || '', trade: c.trade_key ? Wrk.professionLabel(c.trade_key) : '',
        memberNames: active.map(m => (this.workerOf(m.worker_id) || {}).full_name).filter(Boolean),
      };
    },

    /** Konfigurácia zoznamu partií pre `DataList`. */
    listConfig(rows) {
      const statuses = this.statusOptions();
      const statusIdx = (k) => { const i = statuses.findIndex(s => s[0] === k); return i < 0 ? 99 : i; };
      const docsCell = (r) => {
        if (!r.active.length) return '';
        if (!r.noDocs.length) return `<span class="dl-ok">${Icon('check', 13)} v poriadku</span>`;
        const why = `Bez dokladov na stavbu: ${r.noDocs.join(', ')}`;
        return `<button type="button" class="tip-btn dl-flag" data-tip="${UI.esc(why)}" aria-label="${UI.esc(why)}">${Icon('alert', 12)} ${
          r.noDocs.length} ${DanubraCrews.plural(r.noDocs.length, 'bez dokladov', 'bez dokladov', 'bez dokladov')}</button>`;
      };
      const reviewCell = (r) => {
        if (!r.problems) return `<span class="dl-ok">${Icon('check', 13)} sedí</span>`;
        const list = [...r.rev.reasons, ...r.rev.warnings].map(x => x.label).filter(Boolean).join(' · ');
        return `<button type="button" class="tip-btn dl-flag${r.rev.reasons.length ? '' : ' is-amber'}" data-tip="${UI.esc(list)}"
          aria-label="Na pozretie: ${UI.esc(list)}">${r.problems} ${DanubraCrews.plural(r.problems, 'vec', 'veci', 'vecí')}</button>`;
      };
      const sitesCell = (r) => {
        if (!r.subs.length) return '<span class="dl-note is-mute">nenasadení</span>';
        const s = r.subs[0];
        return `<span class="dl-two"><b title="${UI.esc(r.subs.map(x => x.title).join(', '))}">${UI.esc(s.title)}</b><small>${
          UI.esc([s.site_city, r.subs.length > 1 ? `+${r.subs.length - 1} ${DanubraCrews.plural(r.subs.length - 1, 'ďalšia', 'ďalšie', 'ďalších')}` : ''].filter(Boolean).join(' · '))}</small></span>`;
      };

      return {
        id: 'partie', storageKey: 'partie', label: 'Partie',
        noun: ['partia', 'partie', 'partií'],
        rows,
        rowClick: (r) => Crews.detail(r.id),
        rowClass: (r) => (r.c.status !== 'active' ? 'is-muted' : r.rev.reasons.length ? 'is-hot' : r.problem ? 'is-warn' : ''),
        rowLabel: (r) => `Partia ${r.name}`,
        rowActions: [{ ico: 'chevron', label: 'Otvoriť partiu', run: (r) => Crews.detail(r.id) }],
        columns: [
          { key: 'nazov', label: 'Partia', width: 'minmax(160px, 1.5fr)', mobile: 'title',
            render: (r) => `<span class="dl-title"><b>${UI.esc(r.name)}</b>${
              r.trade || r.c.phone ? `<small>${UI.esc([r.trade, r.c.phone].filter(Boolean).join(' · '))}</small>` : ''}</span>`,
            sortValue: (r) => r.name, sortLabel: 'Názov' },
          { key: 'predak', label: 'Predák', width: 'minmax(130px, 1fr)', mobileLabel: 'predák',
            render: (r) => (r.lw ? Danubra.link('worker', r.lw.id, r.lw.full_name, { ico: 'user' }) : '<span class="dl-note is-amber">bez predáka</span>'),
            sortValue: (r) => (r.lw ? r.lw.full_name : null), csv: (r) => (r.lw ? r.lw.full_name : '') },
          { key: 'clenovia', label: 'Členovia', width: '92px', mobileLabel: 'členov',
            render: (r) => `<span class="dl-num" title="${UI.esc(r.memberNames.join(', '))}"><b${
              r.c.usual_size && r.active.length < r.c.usual_size ? ' class="is-short"' : ''}>${r.active.length}</b>${r.c.usual_size ? ` / ${r.c.usual_size}` : ''}</span>`,
            tip: 'Aktívni členovia / obvyklý počet ľudí partie.',
            sortValue: (r) => r.active.length, sortDir: -1 },
          { key: 'kde', label: 'Kde sú nasadení', width: 'minmax(150px, 1.4fr)', mobile: 'line', render: sitesCell,
            sortValue: (r) => (r.subs[0] ? r.subs[0].title : null), csv: (r) => r.subs.map(s => s.title).join(', ') },
          { key: 'doklady', label: 'Doklady', width: '118px',
            tip: 'Majú všetci aktívni členovia doklady na stavbu (A1, zmluva, GDPR…)? Ukážte myšou na štítok — povie, kto nie.',
            render: docsCell, sortValue: (r) => -r.noDocs.length, csv: (r) => (r.noDocs.length ? r.noDocs.join(', ') : 'v poriadku') },
          { key: 'pozriet', label: 'Na pozretie', width: '104px', hideBelow: 1050,
            tip: 'Čo na partii nesedí: nemá predáka, predák nie je členom, partia je prázdna, chýbajú fakturačné údaje…',
            render: reviewCell,
            // Čo horí hore: aktívne s blokujúcou vecou, potom s upozornením
            // alebo bez dokladov, potom ostatné; neaktívne na koniec.
            sortValue: (r) => [r.c.status === 'active' ? 0 : 1, r.rev.reasons.length ? 0 : 1, r.problem ? 0 : 1, -r.problems, r.name],
            sortLabel: 'Čo treba pozrieť', csv: (r) => [...r.rev.reasons, ...r.rev.warnings].map(x => x.label).join(' · ') },
          { key: 'stav', label: 'Stav', width: '92px', mobile: 'badge',
            render: (r) => UI.badge(this.statusLabel(r.c.status), this.statusKind(r.c.status)),
            sortValue: (r) => statusIdx(r.c.status), csv: (r) => this.statusLabel(r.c.status) },
        ],
        sort: { key: 'pozriet', dir: 1 },
        groups: [
          { key: 'stav', label: 'Stav', value: (r) => r.c.status, labelOf: (k) => this.statusLabel(k),
            tone: (k) => this.statusKind(k), order: statuses.map(s => s[0]) },
          { key: 'remeslo', label: 'Remeslo', value: 'trade', labelOf: (k) => k || 'Bez remesla' },
        ],
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať partiu, predáka, remeslo…', label: 'Hľadať partiu, predáka, člena alebo remeslo',
            fields: ['name', 'trade', 'c.phone', 'c.trade_key', (r) => (r.lw ? r.lw.full_name : ''), (r) => r.memberNames.join(' '),
              (r) => r.subs.map(s => s.title).join(' ')] },
          // Predvolene aktívne — rovnako ako doteraz filter „Stav".
          { key: 'stav', type: 'multi', label: 'Stav', value: (r) => r.c.status, default: ['active'],
            options: statuses, sortOptions: false, allLabel: 'Všetky' },
          { key: 'remeslo', type: 'select', label: 'Remeslo', value: (r) => r.c.trade_key,
            optionLabel: (v) => Wrk.professionLabel(v), emptyLabel: 'Bez remesla', allLabel: 'Všetky remeslá' },
          { key: 'zakazka', type: 'select', label: 'Zákazka', value: (r) => (r.subIds.length ? r.subIds : ''),
            optionLabel: (v) => ((Wrk.subs || []).find(s => s.id === v) || {}).title || v, emptyLabel: 'Nenasadení', allLabel: 'Všetky zákazky' },
          { key: 'problem', type: 'toggle', label: 'Len s problémom', test: (r) => r.problem,
            hint: 'Partie, kde niečo nesedí (prázdna, bez predáka, predák mimo partie, fakturačné údaje) alebo niekto z členov nemá doklady na stavbu.' },
          { key: 'doklady', type: 'toggle', label: 'Niekto bez dokladov', test: (r) => r.noDocs.length > 0, more: true },
          { key: 'predak', type: 'toggle', label: 'Bez predáka', test: (r) => !r.lw, more: true },
          { key: 'volni', type: 'toggle', label: 'Nenasadené', test: (r) => !r.subs.length, more: true,
            hint: 'Partie, ktorých členovia teraz nemajú bežiace nasadenie.' },
        ],
        empty: { ico: 'workers', title: 'Zatiaľ žiadna partia', sub: 'Partia je skupina, ktorá chodí na stavby spolu.',
          cta: `<button class="btn btn-primary" onclick="Crews.form()">${Icon('plus')} Nová partia</button>` },
        export: { name: ['partie'] },
      };
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    detail(id) {
      const c = this.items.find(x => x.id === id);
      if (!c) return UI.toast('Nenájdené', 'err');
      const members = this.membersOf(id);
      const active = DanubraCrews.activeMembers(members);
      const past = members.filter(m => m.left_at);
      const rev = DanubraCrews.review({ crew: c, members, workers: Wrk.items });
      const plan = DanubraCrews.invoicePlan({ members, workers: Wrk.items });

      const memberRow = (m) => {
        const w = this.workerOf(m.worker_id);
        const docs = w ? Wrk.docsOf(w.id) : [];
        const ready = DanubraDocs.readiness({
          docs, workType: 'construction', regulated: !!(w && w.regulated_trade),
        });
        return `<div class="list-row" role="button" tabindex="0" onclick="UI.closeModal();Wrk.detail('${m.worker_id}')">
          <span class="dot ${ready.ok ? 'green' : 'red'}"></span>
          <span style="flex:1;font-size:13px;">
            <strong>${UI.esc(w ? w.full_name : '(neznámy)')}</strong>
            ${m.role === 'leader' ? UI.badge('predák', 'blue') : ''}
            <span style="display:block;color:var(--ink-mute);font-size:12px;">
              ${w && w.profession ? UI.esc(Wrk.professionLabel(w.profession)) + ' · ' : ''}
              v partii od ${UI.date(m.joined_at)}
              ${ready.ok ? '' : (() => {
                // Zapísaný, ale nenahratý doklad (067) nie je „chýba" — stačí ho nahrať.
                const sken = ready.reasons.filter(r => r.rule === 'missing_scan').length;
                const chyba = ready.reasons.length - sken;
                return [chyba ? ` · ${chyba} ${DanubraCrews.plural(chyba, 'doklad chýba', 'doklady chýbajú', 'dokladov chýba')}` : '',
                  sken ? ` · ${sken} ${DanubraCrews.plural(sken, 'doklad nie je nahratý', 'doklady nie sú nahraté', 'dokladov nie je nahratých')}` : ''].join('');
              })()}</span>
          </span>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();Crews.leave('${m.id}')"
            title="Ukončiť členstvo">${Icon('logout', 15)}</button>
        </div>`;
      };

      const pastRow = (m) => {
        const w = this.workerOf(m.worker_id);
        return `<div class="list-row" style="opacity:.7;">
          <span class="dot"></span>
          <span style="flex:1;font-size:13px;">
            <strong>${UI.esc(w ? w.full_name : '(neznámy)')}</strong>
            <span style="display:block;color:var(--ink-mute);font-size:12px;">
              ${UI.date(m.joined_at)} – ${UI.date(m.left_at)}</span>
          </span>
        </div>`;
      };

      const gaps = plan.lines.filter(l => !l.ready);

      const body = `
        <div class="detail-head">
          ${UI.badge(this.statusLabel(c.status), this.statusKind(c.status))}
          <select class="verif-sel" onchange="Crews.setStatus('${c.id}',this.value)">
            ${Enums.options('crew_status').map(([k, l]) =>
              `<option value="${k}" ${c.status === k ? 'selected' : ''}>${UI.esc(l)}</option>`).join('')}
          </select>
        </div>

        ${(rev.reasons.length || rev.warnings.length) ? `
          <div class="form-section">Čo na partii nesedí</div>
          ${Shell.blocker({ reasons: [...rev.reasons, ...rev.warnings] })}` : ''}

        <div class="kv">
          ${c.trade_key ? `<div><span>Remeslo</span><strong>${UI.esc(Wrk.professionLabel(c.trade_key))}</strong></div>` : ''}
          ${c.usual_size ? `<div><span>Obvyklý počet</span><strong>${c.usual_size}</strong></div>` : ''}
          ${c.phone ? `<div><span>Telefón</span><strong>${UI.esc(c.phone)}</strong></div>` : ''}
          <div><span>Aktívnych členov</span><strong>${active.length}</strong></div>
        </div>
        ${c.notes ? `<div class="notebox">${UI.esc(c.notes)}</div>` : ''}

        <div class="form-section">Členovia</div>
        ${active.length ? active.map(memberRow).join('')
          : '<div class="js-empty">Partia nemá členov.</div>'}
        <div class="btn-row">
          <button class="btn btn-outline btn-sm" onclick="Crews.addMemberForm('${c.id}')">
            ${Icon('plus')} Pridať člena</button>
        </div>

        ${past.length ? `
          <div class="form-section">Boli v partii</div>
          ${past.map(pastRow).join('')}` : ''}

        <div class="form-section">Fakturácia</div>
        <div class="regimebox">${UI.esc(plan.note)}</div>
        ${gaps.length ? Shell.blocker({
          reasons: gaps.map(l => ({
            rule: 'missing_billing_data',
            label: `${l.name} nemá fakturačné údaje`,
            detail: 'Bez IČO a IBAN-u sa jeho faktúra nedá zaúčtovať.',
            severity: 'block',
          })),
        }) : '<div class="muted">Všetci členovia majú čím fakturovať.</div>'}

        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          <button class="btn btn-primary" onclick="Crews.form('${c.id}')">Upraviť</button>
        </div>`;
      UI.modal(c.name, body, { wide: true });
    },

    // ── Formuláre ─────────────────────────────────────────────────────────
    form(id) {
      const c = id ? this.items.find(x => x.id === id) || {} : {};
      const inCrew = id ? DanubraCrews.activeMembers(this.membersOf(id)) : [];
      const leaderOptions = [['', '— zatiaľ nikto —'], ...inCrew.map(m => {
        const w = this.workerOf(m.worker_id);
        return [m.worker_id, w ? w.full_name : m.worker_id];
      })];

      const body = `
        <form id="crew-form" onsubmit="event.preventDefault();Crews.save('${id || ''}')">
          <div class="form-grid">
            ${UI.field('name', 'Názov partie', { value: c.name, required: true,
              placeholder: 'napr. Novákovci — sadrokartón' })}
            ${UI.field('trade_key', 'Remeslo', { value: c.trade_key, add: 'trade',
              options: [['', '—'], ...Wrk.professions()] })}
            ${UI.field('usual_size', 'Obvyklý počet ľudí', { type: 'number', value: c.usual_size })}
            ${UI.field('phone', 'Telefón na partiu', { value: c.phone })}
            ${UI.field('status', 'Stav', { value: c.status || 'active',
              options: Enums.options('crew_status') })}
            <!-- add: false — predák musí byť zároveň členom partie, takže
                 vyberať sa dá len z členov. Novo založený človek by medzi
                 nimi nebol a výber by po založení vyzeral pokazený. -->
            ${id ? UI.field('leader_worker_id', 'Predák', { add: false,
              value: c.leader_worker_id, options: leaderOptions }) : ''}
          </div>
          ${id ? '' : `<div class="regimebox">Predáka vyberiete, keď budú v partii členovia —
            predák musí byť zároveň členom.</div>`}
          ${UI.field('notes', 'Poznámka', { type: 'textarea', value: c.notes })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Založiť'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť partiu' : 'Nová partia', body, { wide: true });
    },

    async save(id) {
      const d = UI.formData(document.getElementById('crew-form'));
      if (!d.name) return UI.toast('Názov je povinný', 'err');
      const payload = { ...d };
      payload.usual_size = d.usual_size === '' ? null : Number(d.usual_size);
      if (payload.leader_worker_id === '') payload.leader_worker_id = null;
      const res = id ? await DB.update('crews', id, payload) : await DB.insert('crews', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast(id ? 'Uložené' : 'Partia založená', 'ok');
      this.loaded = false; await this.load(); Danubra.renderRoute();
    },

    async setStatus(id, status) {
      const { error } = await DB.update('crews', id, { status });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const c = this.items.find(x => x.id === id); if (c) c.status = status;
      UI.toast('Stav uložený', 'ok');
    },

    addMemberForm(crewId) {
      const inCrew = new Set(DanubraCrews.activeMembers(this.membersOf(crewId)).map(m => m.worker_id));
      // Živnostníci, ktorí ešte v tejto partii nie sú.
      const free = Wrk.items
        .filter(w => !inCrew.has(w.id) && !['blacklist', 'inactive'].includes(w.status))
        .map(w => [w.id, `${w.full_name}${w.profession ? ' — ' + Wrk.professionLabel(w.profession) : ''}`]);

      const body = free.length ? `
        <form id="cm-form" onsubmit="event.preventDefault();Crews.addMember('${crewId}')">
          <div class="form-grid">
            ${UI.field('worker_id', 'Kto', { value: '', options: free, required: true, add: 'worker' })}
            ${UI.field('joined_at', 'V partii od', { type: 'date',
              value: new Date().toISOString().slice(0, 10) })}
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="Crews.detail('${crewId}')">Zrušiť</button>
            <button type="submit" class="btn btn-primary">Pridať</button>
          </div>
        </form>`
        : `${UI.empty('workers', 'Nikoho voľného niet',
            'Všetci z kartotéky sú už v tejto partii.')}
           <div class="modal-actions">
             <button class="btn btn-ghost" onclick="Crews.detail('${crewId}')">Zavrieť</button>
           </div>`;
      UI.modal('Pridať člena', body);
    },

    async addMember(crewId) {
      const d = UI.formData(document.getElementById('cm-form'));
      if (!d.worker_id) return UI.toast('Vyberte človeka', 'err');
      const { error } = await DB.insert('crew_members', {
        crew_id: crewId, worker_id: d.worker_id,
        joined_at: d.joined_at || new Date().toISOString().slice(0, 10),
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast('Člen pridaný', 'ok');
      this.loaded = false; await this.load(); this.detail(crewId);
    },

    /**
     * Ukončenie členstva. Zapíše sa dátum odchodu — riadok sa nemaže, aby sa
     * spätne dalo povedať, kto na ktorej stavbe bol.
     */
    async leave(memberId) {
      const m = this.members.find(x => x.id === memberId);
      if (!m) return;
      const w = this.workerOf(m.worker_id);
      if (!await UI.confirm(`Ukončiť členstvo — ${w ? w.full_name : 'tento človek'}?\n\n`
        + 'Záznam zostane v histórii partie.')) return;
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await DB.update('crew_members', memberId, { left_at: today });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      // Odišiel predák: partia ho ďalej nesmie mať ako predáka — inak hlási
      // „Predák nie je členom partie" a na stavbe nevieme, kto za ňu hovorí.
      const crew = this.items.find(x => x.id === m.crew_id);
      let e2 = null;
      if (crew && crew.leader_worker_id === m.worker_id) {
        ({ error: e2 } = await DB.update('crews', crew.id, { leader_worker_id: null }));
        if (!e2) crew.leader_worker_id = null;
      }
      if (e2) UI.toast('Členstvo je ukončené, ale predáka sa nepodarilo zrušiť: ' + e2.message, 'err');
      else UI.toast('Členstvo ukončené, záznam zostal', 'ok');
      this.loaded = false; await this.load(); this.detail(m.crew_id);
    },
  };

  window.Crews = Crews;
  Danubra.views.crews = function (el) { return Crews.view(el); };
})();
