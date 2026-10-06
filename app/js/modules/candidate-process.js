// ============================================================================
// DANUBRA — nábor kandidáta: päť krokov, poznámky, červené vlajky
// ============================================================================
// Používa sa počas telefonátu, takže všetko musí byť po ruke a odklikateľné
// jedným prstom. Zaškrtnutie sa ukladá okamžite — nikde nie je tlačidlo
// „uložiť", ktoré by sa dalo zabudnúť stlačiť.
//
// Hore je **jedna veta: čo spraviť teraz**. Zoznam krokov je pod ňou. Kto
// nábor nikdy nerobil, nemusí vyberať z piatich krokov — appka mu povie jeden.
//
// Odrážka, ktorá vyplýva z dát (zavolané, nasadený), sa nekliká. Je vidieť ako
// hotová a pod ňou je napísané, odkiaľ sa to vie — inak by to vyzeralo, že ju
// niekto odklikol za mňa.
//
// Poznámky sa neprepisujú. Oprava je nová poznámka, stará zostáva viditeľná
// aj s tým, kto ju napísal a kedy.
// ============================================================================
(function () {
  const P = window.DanubraProcess;

  const CandProc = {
    checks: [], notes: [], subcontracts: [], candidateId: null, open: null,

    async load(candidateId) {
      this.candidateId = candidateId;
      const [c, n, s] = await Promise.all([
        DB.list('candidate_checks', { filters: { candidate_id: candidateId }, limit: 300 }),
        DB.list('candidate_notes', { filters: { candidate_id: candidateId },
          order: { column: 'created_at', ascending: false }, limit: 200 }),
        DB.list('subcontracts', { select: 'id,contract_number,title,site_city,status', limit: 200 }),
      ]);
      this.checks = c.data || []; this.notes = n.data || []; this.subcontracts = s.data || [];
    },

    isChecked(stepKey, index) {
      return this.checks.some(c => c.step_key === stepKey && c.item_index === index && c.checked);
    },
    checkOf(stepKey, index) {
      return this.checks.find(c => c.step_key === stepKey && c.item_index === index);
    },
    notesOf(stepKey) { return this.notes.filter(n => n.step_key === stepKey); },

    /** Meno, ktoré sa zapíše k poznámke — nech sa nemusí dohľadávať cez id. */
    authorName() {
      const email = Danubra.user?.email || '';
      const n = (email.split('@')[0] || '').replace(/[._-]/g, ' ');
      return n ? n.charAt(0).toUpperCase() + n.slice(1) : 'neznámy';
    },

    // ── Vykreslenie ───────────────────────────────────────────────────────
    render(cand) {
      const prog = P.candidateProgress(cand, this.checks);
      if (!this.open) this.open = P.initialOpenStep(cand, this.checks);

      return `
        ${this.nowHtml(cand, prog)}

        ${prog.flagCount ? `<div class="warnbox" style="margin-bottom:12px;">
          ${Icon('alert', 14)} <strong>${prog.flagCount} ${prog.flagCount === 1 ? 'červená vlajka' : 'červené vlajky'}</strong>
          — ${prog.flags.map(f => UI.esc(f.text)).join(' · ')}</div>` : ''}

        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
          <span class="stay-bar" style="flex:1;">
            <span class="stay-fill" style="display:block;width:${prog.percent}%;
              background:${prog.complete ? 'var(--green)' : 'var(--brand)'};"></span>
          </span>
          <span style="font-size:12.5px;font-weight:700;white-space:nowrap;">${UI.pct(prog.percent)}</span>
        </div>
        <div style="font-size:12px;color:var(--ink-mute);margin-bottom:12px;">
          ${prog.done} z ${prog.total} odrážok · celý nábor má päť krokov</div>

        ${P.STEPS.map((step, i) => this.stepHtml(cand, step, prog.steps[i])).join('')}
        ${this.afterHtml(prog.afterPlacement)}
        ${this.flagsHtml(cand)}`;
    },

    /**
     * Čo spraviť teraz — jedna veta a jedno tlačidlo.
     *
     * Toto je celé zjednodušenie náboru: zoznam krokov zostal, ale nikto si
     * z neho nemusí vyberať. Appka povie jednu vec a hneď pod ňou je tlačidlo,
     * ktorým sa dá spraviť.
     */
    nowHtml(cand, prog) {
      const n = prog.next;
      if (!n) return '';
      const ACTION = {
        call: { label: 'Zavolať a prejsť hovor', onclick: `Guide.continueCall('${cand.id}')`, ico: 'phone' },
        proof: { label: 'Pokračovať v preverovaní', onclick: `CandProc.goStep('proof')`, ico: 'check' },
        deal: { label: 'Dohodnúť podmienky', onclick: `CandProc.goStep('deal')`, ico: 'note' },
        papers: { label: 'Dobehnúť papiere', onclick: `CandProc.goStep('papers')`, ico: 'doc' },
        site: { label: 'Nasadiť na zákazku', onclick: 'CandProc.hireForm()', ico: 'site' },
        flags: { label: 'Rozhodnúť — pokračovať či zamietnuť', onclick: 'CandProc.rejectForm()', ico: 'alert' },
      };
      const a = ACTION[n.key];
      return `
        <div class="nowbox${n.hot ? ' nowbox-hot' : ''}">
          <div class="nowbox-label">Čo spraviť teraz${n.n ? ` · krok ${n.n} z 5` : ''}</div>
          <div class="nowbox-title">${UI.esc(n.title)}
            ${n.key !== 'closed' && n.key !== 'done'
              ? Help.btn(`cand.step.${n.key}`, { size: 14 }) : ''}</div>
          <div class="nowbox-sub">${UI.esc(n.what)}</div>
          ${n.why ? `<div class="nowbox-why">${UI.esc(n.why)}</div>` : ''}
          ${a ? `<button type="button" class="btn btn-primary btn-block" style="margin-top:10px;"
            onclick="${a.onclick}">${Icon(a.ico, 17)} ${a.label}</button>` : ''}
        </div>`;
    },

    stepHtml(cand, step, sp) {
      const isOpen = this.open === step.key;
      const items = P.applicableItems(step, cand.type || 'individual');
      const notes = this.notesOf(step.key);
      return `
        <div class="acc${sp.complete ? ' acc-done' : ''}">
          <button type="button" class="acc-head" onclick="CandProc.toggleStep('${step.key}')">
            <span class="acc-mark ${sp.complete ? 'done' : ''}">${sp.complete ? Icon('check', 13) : ''}</span>
            <span style="flex:1;text-align:left;">
              <strong>${step.n}. ${UI.esc(step.title)}</strong>
              <span style="display:block;font-size:12px;color:var(--ink-mute);">
                ${UI.esc(step.lead)}</span>
              <span style="display:block;font-size:11.5px;color:var(--ink-mute);">
                ${sp.done} z ${sp.total}${notes.length ? ` · ${notes.length} ${notes.length === 1 ? 'poznámka' : 'poznámok'}` : ''}</span>
            </span>
            <span style="color:var(--ink-mute);display:flex;transform:rotate(${isOpen ? '90' : '0'}deg);">
              ${Icon('chevron', 15)}</span>
          </button>
          ${isOpen ? `<div class="acc-body">
            <div style="font-size:12px;color:var(--ink-sub);margin-bottom:10px;">
              ${UI.esc(step.why)} ${Help.btn(`cand.step.${step.key}`, { size: 13 })}</div>
            ${items.map(it => this.itemHtml(cand, step, it)).join('')}
            ${this.notesBlock(step.key, notes)}
          </div>` : ''}
        </div>`;
    },

    itemHtml(cand, step, it) {
      const stepKey = typeof step === 'string' ? step : step.key;
      const obj = typeof step === 'string' ? null : step;
      const auto = !!(obj && !P.itemManual(obj, it.index));
      // Pri kroku z definície sa stav počíta z knižnice (odvodené veci aj staré
      // zaškrtnutia), pri zozname bez definície (vlajky, prvý týždeň) stačí
      // zaškrtnutie — a ak si ho volajúci už spočítal, má prednosť.
      const done = obj
        ? P.itemDone(obj, it.index, cand, this.checks)
        : (it.done != null ? !!it.done : this.isChecked(stepKey, it.index));
      const c = this.checkOf(stepKey, it.index);

      // Odvodenú odrážku nikto neodklikol — vyplýva z dát. Keby sa dala
      // odkliknúť, appka by si protirečila: človek je nasadený, ale odrážka
      // odškrtnutá.
      if (auto) {
        return `
          <div style="display:flex;gap:10px;align-items:flex-start;padding:7px 0;">
            <span class="acc-mark ${done ? 'done' : ''}" style="flex:none;margin-top:1px;">
              ${done ? Icon('check', 13) : ''}</span>
            <span style="flex:1;font-size:13.5px;${done ? 'color:var(--ink-mute);' : ''}">
              ${UI.esc(it.text)}
              <span style="display:block;font-size:11.5px;color:var(--ink-mute);">
                ${done ? 'Appka to vie z dát — nekliká sa.' : 'Stane sa samo, keď na to príde rad.'}
                ${it.hint ? ` ${UI.esc(it.hint)}` : ''}</span>
            </span>
          </div>`;
      }

      return `
        <label class="chk chk-lg" style="display:flex;gap:10px;align-items:flex-start;padding:7px 0;">
          <input type="checkbox" ${done ? 'checked' : ''}
            onchange="CandProc.toggle('${stepKey}',${it.index},this.checked)">
          <span style="flex:1;font-size:13.5px;${done ? 'color:var(--ink-mute);' : ''}">
            ${UI.esc(it.text)}
            ${it.hint ? `<span style="display:block;font-size:11.5px;color:var(--ink-mute);">
              ${UI.esc(it.hint)}</span>` : ''}
            ${done && c?.checked_at ? `<span style="display:block;font-size:11.5px;color:var(--ink-mute);">
              ${new Date(c.checked_at).toLocaleString('sk-SK')}</span>` : ''}
          </span>
        </label>`;
    },

    /**
     * Prvý týždeň na stavbe. Nie je to krok náboru — nábor je hotový — ale
     * tri telefonáty, ktoré rozhodnú, či tam ten človek zostane. Preto sa
     * ukazuje až po nasadení a do postupu náboru sa nepočíta.
     */
    afterHtml(after) {
      if (!after || !after.show) return '';
      const isOpen = this.open === after.key;
      return `
        <div class="acc${after.done === after.total ? ' acc-done' : ''}">
          <button type="button" class="acc-head" onclick="CandProc.toggleStep('${after.key}')">
            <span class="acc-mark ${after.done === after.total ? 'done' : ''}">
              ${after.done === after.total ? Icon('check', 13) : ''}</span>
            <span style="flex:1;text-align:left;">
              <strong>${UI.esc(after.title)}</strong>
              <span style="display:block;font-size:12px;color:var(--ink-mute);">
                ${UI.esc(after.hint)}</span>
              <span style="display:block;font-size:11.5px;color:var(--ink-mute);">
                ${after.done} z ${after.total}</span>
            </span>
            <span style="color:var(--ink-mute);display:flex;transform:rotate(${isOpen ? '90' : '0'}deg);">
              ${Icon('chevron', 15)}</span>
          </button>
          ${isOpen ? `<div class="acc-body">
            ${after.items.map(it => this.itemHtml(null, after.key, it)).join('')}
            ${this.notesBlock(after.key, this.notesOf(after.key))}
          </div>` : ''}
        </div>`;
    },

    /** Otvor krok a ukáž ho — z vety „čo spraviť teraz". */
    goStep(key) {
      this.open = key;
      this.rerender();
      document.querySelector('.acc .acc-head')?.scrollIntoView({ block: 'nearest' });
    },

    notesBlock(stepKey, notes) {
      return `
        <div style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px;">
          ${notes.map(n => `<div class="notebox" style="margin-bottom:6px;">
            ${UI.esc(n.body)}
            <span style="display:block;margin-top:4px;font-size:11.5px;color:var(--ink-mute);">
              ${UI.esc(n.author_name || 'neznámy')} · ${new Date(n.created_at).toLocaleString('sk-SK')}</span>
          </div>`).join('')}
          <div style="display:flex;gap:8px;margin-top:6px;">
            <input id="note-${stepKey}" placeholder="Poznámka ku kroku…" style="flex:1;"
              onkeydown="if(event.key==='Enter'){event.preventDefault();CandProc.addNote('${stepKey}')}">
            <button type="button" class="btn btn-outline btn-sm"
              onclick="CandProc.addNote('${stepKey}')">${Icon('plus')} Pridať</button>
          </div>
          <div style="font-size:11.5px;color:var(--ink-mute);margin-top:5px;">
            Poznámky sa neprepisujú — oprava je nová poznámka.</div>
        </div>`;
    },

    flagsHtml(cand) {
      const isOpen = this.open === 'flags';
      const raised = P.FLAGS.items.filter((_, i) => this.isChecked('flags', i)).length;
      return `
        <div class="acc${raised ? ' acc-warn' : ''}">
          <button type="button" class="acc-head" onclick="CandProc.toggleStep('flags')">
            <span class="acc-mark ${raised ? 'warn' : ''}">${raised ? Icon('alert', 13) : ''}</span>
            <span style="flex:1;text-align:left;">
              <strong>${UI.esc(P.FLAGS.title)}</strong>
              <span style="display:block;font-size:12px;color:${raised ? 'var(--red)' : 'var(--ink-mute)'};">
                ${raised ? `${raised} ${raised === 1 ? 'zaškrtnutá' : 'zaškrtnuté'}` : 'žiadna'}</span>
            </span>
            <span style="color:var(--ink-mute);display:flex;transform:rotate(${isOpen ? '90' : '0'}deg);">
              ${Icon('chevron', 15)}</span>
          </button>
          ${isOpen ? `<div class="acc-body">
            <div style="font-size:12px;color:var(--ink-mute);margin-bottom:10px;">${UI.esc(P.FLAGS.hint)}</div>
            ${P.FLAGS.items.map((text, index) =>
              this.itemHtml(cand, 'flags', { index, text })).join('')}
            ${this.notesBlock('flags', this.notesOf('flags'))}
          </div>` : ''}
        </div>`;
    },

    // ── Akcie ─────────────────────────────────────────────────────────────
    toggleStep(key) {
      this.open = this.open === key ? null : key;
      this.rerender();
    },

    rerender() {
      const cand = Cand.items.find(c => c.id === this.candidateId);
      const box = document.getElementById('cand-process');
      if (cand && box) box.innerHTML = this.render(cand);
    },

    async toggle(stepKey, index, checked) {
      const row = {
        candidate_id: this.candidateId, step_key: stepKey, item_index: index,
        checked, checked_at: checked ? new Date().toISOString() : null,
        checked_by: checked ? (Danubra.user?.id || null) : null,
      };
      const { error } = await DB.from('candidate_checks')
        .upsert(row, { onConflict: 'candidate_id,step_key,item_index' });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');

      const existing = this.checkOf(stepKey, index);
      if (existing) Object.assign(existing, row);
      else this.checks.push(row);
      this.rerender();

      if (stepKey === 'flags' && checked) UI.toast('Červená vlajka zaznamenaná', 'err');
    },

    async addNote(stepKey) {
      const input = document.getElementById(`note-${stepKey}`);
      const body = (input?.value || '').trim();
      if (!body) return;
      const row = {
        candidate_id: this.candidateId, step_key: stepKey, body,
        created_by: Danubra.user?.id || null, author_name: this.authorName(),
      };
      const { data, error } = await DB.insert('candidate_notes', row);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      this.notes.unshift(data || { ...row, created_at: new Date().toISOString() });
      input.value = '';
      this.rerender();
    },

    // ── Uzavretie kandidáta ───────────────────────────────────────────────
    hireForm() {
      const cand = Cand.items.find(c => c.id === this.candidateId);
      const open = this.subcontracts.filter(s => ['won', 'active', 'negotiation'].includes(s.status));
      const list = open.length ? open : this.subcontracts;
      if (!list.length) {
        return UI.modal('Chýba zákazka', `<div class="warnbox">${Icon('alert', 14)}
          Nastúpený kandidát sa musí naviazať na zákazku, ale žiadna nie je založená.</div>
          <div class="modal-actions">
            <button class="btn btn-primary" onclick="UI.closeModal();Danubra.go('subcontracts')">
              ${Icon('site')} Založiť zákazku</button></div>`);
      }
      const check = P.canHire(cand, this.checks, 'placeholder');
      UI.modal('Kandidát nastúpil', `
        <form id="hire-form" onsubmit="event.preventDefault();CandProc.hire()">
          ${check.reasons.length ? `<div class="warnbox">${Icon('alert', 14)}
            ${check.reasons.map(r => UI.esc(r)).join(' ')} Môžeš pokračovať, ale over si to.</div>` : ''}
          ${check.flagCount ? `<div class="warnbox">${Icon('alert', 14)}
            Kandidát má ${check.flagCount} ${check.flagCount === 1 ? 'červenú vlajku' : 'červené vlajky'}.</div>` : ''}
          ${UI.field('subcontract_id', 'Na ktorú zákazku nastupuje', { required: true,
            add: 'subcontract',
            options: list.map(s => [s.id,
              `${s.contract_number ? s.contract_number + ' · ' : ''}${s.title}${s.site_city ? ' · ' + s.site_city : ''}`]) })}
          ${UI.field('expected_start', 'Dátum nástupu', { type: 'date',
            value: cand.expected_start || cand.available_from || '' })}
          <div class="regimebox">Kandidát sa objaví v spise zákazky. Ak ešte nie je medzi
          pracovníkmi, prevedieme ho tam automaticky.</div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${Icon('check')} Nastúpený</button>
          </div>
        </form>`, { wide: true });
    },

    async hire() {
      const d = UI.formData(document.getElementById('hire-form'));
      if (!d.subcontract_id) return UI.toast('Vyber zákazku', 'err');
      const cand = Cand.items.find(c => c.id === this.candidateId);

      const patch = {
        outcome: 'hired', outcome_reason: null, status: 'placed',
        subcontract_id: d.subcontract_id,
        expected_start: d.expected_start || null,
      };
      const { error } = await DB.update('candidates', cand.id, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      Object.assign(cand, patch);

      // `keepStatus` — stav sme práve nastavili na 'placed', prevod ho nesmie
      // zhodiť späť na 'ready'.
      if (!cand.converted_worker_id) {
        await Cand.convert(cand.id, { silent: true, keepStatus: true });
      }
      UI.closeModal();
      UI.toast(`${cand.full_name} je nastúpený`, 'ok');
      await Cand.load(); Danubra.renderRoute();
    },

    rejectForm() {
      const cand = Cand.items.find(c => c.id === this.candidateId);
      UI.modal('Zamietnuť kandidáta', `
        <form id="rej-form" onsubmit="event.preventDefault();CandProc.reject()">
          <div class="regimebox">Dôvod sa hodí o pol roka, keď sa ten istý človek ozve znova.</div>
          ${UI.field('outcome_reason', 'Dôvod (voliteľné)', { type: 'textarea', rows: 3,
            placeholder: 'napr. nedodal referencie, pýtal zálohu vopred' })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-danger">Zamietnuť</button>
          </div>
        </form>`);
    },

    async reject() {
      const d = UI.formData(document.getElementById('rej-form'));
      const cand = Cand.items.find(c => c.id === this.candidateId);
      const patch = {
        outcome: 'rejected', outcome_reason: d.outcome_reason || null,
        status: 'rejected', reject_reason: d.outcome_reason || null,
      };
      const { error } = await DB.update('candidates', cand.id, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      Object.assign(cand, patch);
      UI.closeModal(); UI.toast('Kandidát zamietnutý', 'ok');
      await Cand.load(); Danubra.renderRoute();
    },

    async reopen(id) {
      const cand = Cand.items.find(c => c.id === id);
      const patch = { outcome: null, outcome_reason: null, status: 'contacted' };
      await DB.update('candidates', id, patch);
      Object.assign(cand, patch);
      UI.closeModal(); UI.toast('Kandidát je opäť v procese', 'ok');
      await Cand.load(); Danubra.renderRoute();
    },
  };

  window.CandProc = CandProc;
})();
