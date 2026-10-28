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
      const [c, n, s, pl] = await Promise.all([
        DB.list('candidate_checks', { filters: { candidate_id: candidateId }, limit: 300 }),
        DB.list('candidate_notes', { filters: { candidate_id: candidateId },
          order: { column: 'created_at', ascending: false }, limit: 200 }),
        DB.list('subcontracts', { select: 'id,contract_number,title,site_city,status,date_from', limit: 200 }),
        // Nábor, na ktorý kandidát prišiel, môže mať zákazku — na tú ho
        // potom appka ponúkne rovno nasadiť.
        DB.list('recruitment_plans', { select: 'id,title,subcontract_id', limit: 300 }),
      ]);
      this.checks = c.data || []; this.notes = n.data || []; this.subcontracts = s.data || [];
      this.plans = (pl && pl.data) || [];
    },

    /**
     * Sú hotové kroky pred nástupom (1–4, vrátane papierov)? Až vtedy je
     * „Prijať" hlavné tlačidlo — papiere idú pred nástupom, nie po ňom.
     */
    readyToHire(cand, checks) {
      const p = P.candidateProgress(cand || {}, checks || this.checks);
      return p.steps.filter(s => s.key !== 'site').every(s => s.complete) && p.flagCount < 2;
    },

    /** Zákazka, na ktorú kandidát patrí — cez nábor, na ktorý prišiel. */
    planSubcontract(cand) {
      const pl = cand && cand.plan_id ? (this.plans || []).find(x => x.id === cand.plan_id) : null;
      return (pl && pl.subcontract_id) || null;
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
          — ${prog.flags.map(f => UI.esc(f.text)).join(' · ')}${UI.tip('Červená vlajka = vážny dôvod na opatrnosť, ktorý ste zaškrtli pri hovore alebo v časti Červené vlajky. Kandidáta sama nevyradí, ale pred nasadením si to preverte.')}</div>` : ''}

        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
          <span class="stay-bar" style="flex:1;">
            <span class="stay-fill" style="display:block;width:${prog.percent}%;
              background:${prog.complete ? 'var(--green)' : 'var(--brand)'};"></span>
          </span>
          <span style="font-size:12.5px;font-weight:700;white-space:nowrap;">${UI.pct(prog.percent)}</span>
        </div>
        <div style="font-size:12px;color:var(--ink-mute);margin-bottom:12px;">
          ${prog.done} z ${prog.total} odrážok · celý nábor má päť krokov${UI.tip('Percento = koľko odrážok zo všetkých krokov je hotových. Niektoré sa zaškrtnú samy z údajov (napr. že ste mu volali), ostatné odškrtávate Vy. Ukladá sa hneď po kliknutí.')}</div>

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
        site: cand.outcome === 'hired'
          ? { label: 'Nasadiť na zákazku', onclick: 'CandProc.hireForm()', ico: 'site' }
          : { label: 'Prijať – previesť medzi ľudí', onclick: 'CandProc.hireForm()', ico: 'check' },
        flags: { label: 'Rozhodnúť — pokračovať či zamietnuť', onclick: 'CandProc.rejectForm()', ico: 'alert' },
      };
      // „Všetko odškrtnuté, zostáva nasadiť" musí mať tlačidlo, ktorým sa to dá.
      if (n.key === 'done' && cand.status !== 'placed' && !cand.subcontract_id) {
        ACTION.done = ACTION.site;
      }
      // Uzavretý kandidát nemá krok, ku ktorému by bola vysvetlivka.
      const hotovo = n.key === 'closed' || n.key === 'done';
      return Shell.now(n, {
        label: `Čo spraviť teraz${n.n ? ` · fáza ${n.n} z 5` : ''}`,
        help: hotovo ? '' : `cand.step.${n.key}`,
        action: ACTION[n.key],
      });
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
      // Tlačidlo „Prijať" v päte okna je hlavné, až keď sú hotové kroky pred
      // nástupom. Po každom odškrtnutí sa to môže zmeniť.
      const btn = document.getElementById('cand-hire-btn');
      if (cand && btn) {
        const ready = this.readyToHire(cand);
        btn.classList.toggle('btn-primary', ready);
        btn.classList.toggle('btn-outline', !ready);
      }
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
    // ── Prijatie a nasadenie ──────────────────────────────────────────────
    // Dve rôzne veci, ktoré tu boli zlepené do jedného tlačidla „Nastúpený":
    //   * **prijať** = z kandidáta sa stane živnostník v zozname Živnostníci,
    //   * **nasadiť** = zapísať ho na konkrétnu zákazku (s kontrolou dokladov).
    // „Nastúpený" ho len previedol, nasadenie nevzniklo — a text pritom
    // tvrdil, že sa objaví v spise zákazky. Teraz sa prijme a hneď potom sa
    // ponúkne skutočné nasadenie. Stav „Nasadený" dostane až po ňom.

    /** Zákazky, na ktoré sa dá nasadiť — najprv bežiace a dohodnuté. */
    openSubcontracts() {
      const open = this.subcontracts.filter(s => ['won', 'active', 'negotiation'].includes(s.status));
      return open.length ? open : this.subcontracts;
    },
    scLabel(s) {
      return `${s.contract_number ? s.contract_number + ' · ' : ''}${s.title}${s.site_city ? ' · ' + s.site_city : ''}`;
    },

    hireForm() {
      const cand = Cand.items.find(c => c.id === this.candidateId);
      if (!cand) return;
      // Už prijatý — zostáva ho nasadiť.
      if (cand.outcome === 'hired' && cand.converted_worker_id) {
        return this.deployOffer(cand.id, this.planSubcontract(cand));
      }
      const list = this.openSubcontracts();
      const zPlanu = this.planSubcontract(cand);
      const check = P.canHire(cand, this.checks, 'placeholder');
      UI.modal('Prijať – previesť medzi ľudí', `
        <form id="hire-form" onsubmit="event.preventDefault();CandProc.hire()">
          ${check.reasons.length ? `<div class="warnbox">${Icon('alert', 14)}
            ${check.reasons.map(r => UI.esc(r)).join(' ')} Prijať ho môžete, ale na stavbu bez dokladov nepôjde.</div>` : ''}
          ${check.flagCount ? `<div class="warnbox">${Icon('alert', 14)}
            Kandidát má ${check.flagCount} ${check.flagCount === 1 ? 'červenú vlajku' : 'červené vlajky'}.</div>` : ''}
          <div class="regimebox">Kandidát sa prevedie medzi živnostníkov a dostane stav Pripravený.
            <strong>Na stavbu ho to ešte nenasadí</strong> — nasadenie Vám appka ponúkne hneď potom.${UI.tip('Prijať = z kandidáta sa stane živnostník v zozname Živnostníci (aj s celou históriou náboru). Nasadiť = zapísať ho na konkrétnu zákazku od konkrétneho dňa; vtedy sa skontrolujú doklady a bez platných dokladov to pustí len s výnimkou admina. „Nastúpil" je až deň, keď naozaj začne robiť.')}</div>
          <div class="form-grid">
            <div class="fld-full">${UI.field('subcontract_id', 'Na ktorú zákazku pôjde (nepovinné)', {
              value: zPlanu || '', add: 'subcontract',
              tip: 'Zákazka = dohodnutá práca pre konkrétneho nemeckého odberateľa na konkrétnej stavbe. Keď ju vyberiete, po prijatí Vám appka ponúkne nasadiť ho na ňu. Ak kandidát prišiel na nábor, ktorý má zákazku, je predvyplnená.',
              options: [['', '— zatiaľ neviem —'], ...list.map(s => [s.id, this.scLabel(s)])] })}</div>
            ${UI.field('expected_start', 'Predpokladaný nástup', { type: 'date',
              value: cand.expected_start || cand.available_from || '',
              tip: 'Deň, keď by mal začať na stavbe robiť. Predvyplní sa z „Možný nástup" alebo „Dostupný od" a prenesie sa do nasadenia.' })}
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${Icon('check')} Prijať – previesť medzi ľudí</button>
          </div>
        </form>`);
    },

    async hire() {
      const d = UI.formData(document.getElementById('hire-form'));
      const cand = Cand.items.find(c => c.id === this.candidateId);
      if (!cand) return;

      // Stav „Nasadený" sa tu nenastavuje — dostane ho, až keď naozaj vznikne
      // nasadenie na zákazke (pozri `deployNow`).
      const patch = {
        outcome: 'hired', outcome_reason: null,
        status: cand.status === 'placed' ? 'placed' : 'ready',
        expected_start: d.expected_start || null,
      };
      const { error } = await DB.update('candidates', cand.id, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      Object.assign(cand, patch);

      if (!cand.converted_worker_id) {
        const r = await Cand.convert(cand.id, { silent: true, keepStatus: true });
        if (!r) return;   // chybu už ohlásil prevod
      }
      UI.closeModal();
      await Cand.load(); Danubra.renderRoute();
      this.deployOffer(cand.id, d.subcontract_id || this.planSubcontract(cand));
    },

    /**
     * Po prijatí: nasadiť teraz, alebo najprv papiere. Keď je zákazka známa
     * (vybraná alebo z náboru), je to jedno tlačidlo; inak sa vyberie tu.
     */
    deployOffer(candId, scId) {
      const cand = Cand.items.find(c => c.id === candId);
      if (!cand) return;
      const sc = scId ? this.subcontracts.find(s => s.id === scId) : null;
      const list = this.openSubcontracts();
      const canSub = window.Sub && Danubra.routeAvailable('subcontracts');
      UI.modal(`Prijatý — ${cand.full_name}`, `
        <div class="headline headline-ok">${Icon('check', 18)}
          <span>${UI.esc(cand.full_name)} je medzi živnostníkmi. Na zákazku zatiaľ nasadený nie je.</span></div>
        ${!canSub ? `<div class="regimebox">Nasadenie robí ten, kto má prístup k Zákazkám.</div>`
          : sc ? `<p class="modal-lead">Patrí k zákazke <strong>${UI.esc(this.scLabel(sc))}</strong>.</p>`
          : list.length ? `<div class="form-grid"><div class="fld-full">${UI.field('dep_sc', 'Na ktorú zákazku', {
              options: list.map(s => [s.id, this.scLabel(s)]),
              tip: 'Zákazka, na ktorú ho chcete zapísať. Na ďalšom okne vyberiete rolu, dátumy a appka skontroluje doklady.' })}</div></div>`
          : `<div class="warnbox">${Icon('alert', 14)} Zatiaľ nie je založená žiadna zákazka — nasadiť ho
              budete môcť, keď ju založíte (napr. z dopytu tlačidlom „Založiť zákazku").</div>`}
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal()">Neskôr</button>
          <span style="align-self:center;display:inline-flex;">${UI.tip('Nasadiť teraz: otvorí sa nasadenie na zákazku s predvyplneným človekom a dátumom. Appka skontroluje doklady (A1, živnosť, zmluva…); bez platných dokladov to pustí len s výnimkou admina. Najprv papiere: ukáže, čo mu ešte chýba (súhlas GDPR, zmluva, objednávka).')}</span>
          <button class="btn btn-outline" onclick="CandProc.papersFirst('${cand.id}')">
            ${Icon('doc', 14)} Najprv papiere</button>
          ${canSub && (sc || list.length) ? `<button class="btn btn-primary" onclick="CandProc.deployNow('${cand.id}','${sc ? sc.id : ''}')">
            ${Icon('site', 14)} Nasadiť teraz na zákazku${sc ? ` ${UI.esc(sc.contract_number || sc.title)}` : ''}</button>` : ''}
        </div>`);
    },

    /** „Najprv papiere" — čo mu ešte chýba (GDPR, zmluva, objednávka). */
    async papersFirst(candId) {
      const cand = Cand.items.find(c => c.id === candId);
      UI.closeModal();
      if (cand) await Cand.offerNext(cand.converted_worker_id, `${cand.full_name} je medzi živnostníkmi.`);
    },

    /**
     * Otvorí nasadenie na zákazku s predvyplneným živnostníkom a dátumom.
     * Stav „Nasadený" a väzba na zákazku sa kandidátovi zapíšu až po uložení
     * nasadenia — keď okno zavrie, nič sa nezmení.
     */
    async deployNow(candId, scId) {
      const cand = Cand.items.find(c => c.id === candId);
      if (!cand || !cand.converted_worker_id) return UI.toast('Kandidát ešte nie je medzi živnostníkmi', 'err');
      const id = scId || (document.querySelector('#ui-modal [name="dep_sc"]') || {}).value;
      if (!id) return UI.toast('Vyberte zákazku', 'err');
      UI.modal('Pripravujem nasadenie', UI.loading());
      // Nový živnostník v zákazkách ešte nie je — treba ich načítať znova.
      await Sub.load();
      const w = (Sub.workers || []).find(x => x.id === cand.converted_worker_id);
      if (!w || !['ready', 'deployed'].includes(w.status)) {
        UI.closeModal();
        return UI.toast('Živnostník nemá stav Pripravený — nastavte ho na jeho karte a potom ho nasaďte', 'err');
      }
      Sub.addAsg(id, {
        worker_id: cand.converted_worker_id,
        date_from: cand.expected_start || null,
        onSaved: async () => {
          const patch = { status: 'placed', subcontract_id: id };
          const { error } = await DB.update('candidates', cand.id, patch);
          if (error) return UI.toast('Nasadený, ale kandidát sa neprepol: ' + error.message, 'err');
          Object.assign(cand, patch);
          Cand.loaded = false;
        },
      });
    },

    rejectForm() {
      const cand = Cand.items.find(c => c.id === this.candidateId);
      UI.modal('Zamietnuť kandidáta', `
        <form id="rej-form" onsubmit="event.preventDefault();CandProc.reject()">
          <div class="regimebox">Dôvod sa hodí o pol roka, keď sa ten istý človek ozve znova.</div>
          ${UI.field('outcome_reason', 'Dôvod (voliteľné)', { type: 'textarea', rows: 3,
            placeholder: 'napr. nedodal referencie, pýtal zálohu vopred',
            tip: 'Po zamietnutí dostane kandidát stav Odmietnutý a zmizne z rozpracovaných. Nič sa nemaže a dá sa vrátiť tlačidlom „Vrátiť do procesu".' })}
          <div class="modal-actions">
            <button type="submit" class="btn btn-danger">Zamietnuť</button>
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
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
      const { error } = await DB.update('candidates', id, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      Object.assign(cand, patch);
      UI.closeModal(); UI.toast('Kandidát je opäť v procese', 'ok');
      await Cand.load(); Danubra.renderRoute();
    },
  };

  window.CandProc = CandProc;
})();
