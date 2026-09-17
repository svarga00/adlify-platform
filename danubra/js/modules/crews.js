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
    statusLabel(s) { return Enums.label('crew_status', s) || s; },
    statusKind(s) { return s === 'active' ? 'green' : s === 'paused' ? 'amber' : 'gray'; },

    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }

      const all = this.items;
      const rows = Shell.filterRows(all, {
        q: this.filters.q,
        fields: ['name', 'trade_key', 'phone'],
        equals: { status: this.filters.status },
      });

      const card = (c) => {
        const active = DanubraCrews.activeMembers(this.membersOf(c.id));
        const leader = DanubraCrews.leaderOf(this.membersOf(c.id));
        const lw = leader && this.workerOf(leader.worker_id);
        const rev = DanubraCrews.review({
          crew: c, members: this.membersOf(c.id), workers: Wrk.items,
        });
        const problems = rev.reasons.length + rev.warnings.length;
        return `
          <div class="card card-pad list-card" onclick="Crews.detail('${c.id}')">
            <div class="card-head">
              <div class="card-title">${UI.esc(c.name)}</div>
              ${UI.badge(this.statusLabel(c.status), this.statusKind(c.status))}
            </div>
            <div class="meta-row">
              <span>${Icon('workers', 14)} ${active.length} ${DanubraCrews.plural(active.length, 'člen', 'členovia', 'členov')}</span>
              ${lw ? `<span>${Icon('user', 14)} ${UI.esc(lw.full_name)}</span>` : ''}
              ${c.trade_key ? `<span>${Icon('wrench', 14)} ${UI.esc(Wrk.professionLabel(c.trade_key))}</span>` : ''}
              ${problems ? `<span style="color:var(--amber);">${Icon('alert', 14)} ${problems} ${DanubraCrews.plural(problems, 'vec', 'veci', 'vecí')} na pozretie</span>` : ''}
            </div>
          </div>`;
      };

      el.innerHTML = Danubra.header('Partie',
        'Chodia spolu, fakturuje každý sám za seba',
        `<button class="btn btn-primary btn-sm" onclick="Crews.form()">${Icon('plus')} Nová partia</button>`)
        + Shell.list({
          rows, total: all.length, render: card, layout: 'cards',
          emptyIcon: 'workers', emptyTitle: 'Zatiaľ žiadna partia',
          emptySub: 'Partia je skupina, ktorá chodí na stavby spolu.',
          filter: {
            search: { value: this.filters.q, placeholder: 'Hľadať partiu, predáka, remeslo…',
              oninput: 'Crews.setF("q", this.value)' },
            selects: [{
              value: this.filters.status, label: 'Stav',
              onchange: 'Crews.setF("status", this.value)',
              options: [['', 'Všetky stavy'], ...Enums.options('crew_status')],
            }],
          },
        });
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
        return `<div class="list-row" onclick="UI.closeModal();Wrk.detail('${m.worker_id}')">
          <span class="dot ${ready.ok ? 'green' : 'red'}"></span>
          <span style="flex:1;font-size:13px;">
            <strong>${UI.esc(w ? w.full_name : '(neznámy)')}</strong>
            ${m.role === 'leader' ? UI.badge('predák', 'blue') : ''}
            <span style="display:block;color:var(--ink-mute);font-size:12px;">
              ${w && w.profession ? UI.esc(Wrk.professionLabel(w.profession)) + ' · ' : ''}
              v partii od ${UI.date(m.joined_at)}
              ${ready.ok ? '' : ` · ${ready.reasons.length} ${DanubraCrews.plural(ready.reasons.length, 'doklad chýba', 'doklady chýbajú', 'dokladov chýba')}`}</span>
          </span>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();Crews.leave('${m.id}')"
            title="Ukončiť členstvo">${Icon('logout', 15)}</button>
        </div>`;
      };

      const pastRow = (m) => {
        const w = this.workerOf(m.worker_id);
        return `<div class="list-row" style="cursor:default;opacity:.7;">
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
          : '<div style="color:var(--ink-mute);font-size:13px;">Partia nemá členov.</div>'}
        <button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="Crews.addMemberForm('${c.id}')">
          ${Icon('plus')} Pridať člena</button>

        ${past.length ? `
          <div class="form-section">Boli v partii</div>
          ${past.map(pastRow).join('')}` : ''}

        <div class="form-section">Fakturácia</div>
        <div class="regimebox" style="margin:0 0 10px;">${UI.esc(plan.note)}</div>
        ${gaps.length ? Shell.blocker({
          reasons: gaps.map(l => ({
            rule: 'missing_billing_data',
            label: `${l.name} nemá fakturačné údaje`,
            detail: 'Bez IČO a IBAN-u sa jeho faktúra nedá zaúčtovať.',
            severity: 'block',
          })),
        }) : '<div style="color:var(--ink-mute);font-size:13px;">Všetci členovia majú čím fakturovať.</div>'}

        <div class="modal-actions">
          <button class="btn btn-outline btn-sm" onclick="Crews.form('${c.id}')">Upraviť</button>
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
            ${UI.field('trade_key', 'Remeslo', { value: c.trade_key,
              options: [['', '—'], ...Wrk.professions()] })}
            ${UI.field('usual_size', 'Obvyklý počet ľudí', { type: 'number', value: c.usual_size })}
            ${UI.field('phone', 'Telefón na partiu', { value: c.phone })}
            ${UI.field('status', 'Stav', { value: c.status || 'active',
              options: Enums.options('crew_status') })}
            ${id ? UI.field('leader_worker_id', 'Predák', {
              value: c.leader_worker_id, options: leaderOptions }) : ''}
          </div>
          ${id ? '' : `<div class="regimebox">Predáka vyberieš, keď budú v partii členovia —
            predák musí byť zároveň členom.</div>`}
          ${UI.field('notes', 'Poznámka', { type: 'textarea', value: c.notes })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Založiť'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť partiu' : 'Nová partia', body);
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
            ${UI.field('worker_id', 'Kto', { value: '', options: free, required: true })}
            ${UI.field('joined_at', 'V partii od', { type: 'date',
              value: new Date().toISOString().slice(0, 10) })}
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="Crews.detail('${crewId}')">Späť</button>
            <button type="submit" class="btn btn-primary">Pridať</button>
          </div>
        </form>`
        : `${UI.empty('workers', 'Nikoho voľného niet',
            'Všetci z kartotéky sú už v tejto partii.')}
           <div class="modal-actions">
             <button class="btn btn-ghost" onclick="Crews.detail('${crewId}')">Späť</button>
           </div>`;
      UI.modal('Pridať člena', body);
    },

    async addMember(crewId) {
      const d = UI.formData(document.getElementById('cm-form'));
      if (!d.worker_id) return UI.toast('Vyber človeka', 'err');
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
      if (!confirm(`Ukončiť členstvo — ${w ? w.full_name : 'tento človek'}?\n\n`
        + 'Záznam zostane v histórii partie.')) return;
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await DB.update('crew_members', memberId, { left_at: today });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast('Členstvo ukončené, záznam zostal', 'ok');
      this.loaded = false; await this.load(); this.detail(m.crew_id);
    },
  };

  window.Crews = Crews;
  Danubra.views.crews = function (el) { return Crews.view(el); };
})();
