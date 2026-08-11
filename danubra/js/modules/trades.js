// ============================================================================
// DANUBRA — Príručka remesiel a skríningových otázok
// ============================================================================
// Čo mám o remesle vedieť, kým začnem naberať, a podľa čoho spoznám, že ho
// kandidát v skutočnosti nerobil. Otázky sa dajú upravovať a dopĺňať —
// po každom nábore sa ukáže, ktorá otázka niečo naozaj odhalila.
// ============================================================================
(function () {
  const KIND = {
    knowledge: ['Odborná', 'blue', 'Overuje znalosť remesla.'],
    hidden: ['Overovacia', 'brand', 'Znie ako bežná otázka, ale kandidát netuší, že sa ňou preveruje. Nedá sa na ňu pripraviť.'],
    legal: ['Právna', 'red', 'Bez správnej odpovede sa nedá nasadiť.'],
    logistics: ['Logistika', 'gray', 'Doprava, ubytovanie, termín.'],
    motivation: ['Motivácia', 'amber', 'Peniaze, ochota, dôvod odchodu.'],
  };
  const PHASE = { phone: 'Telefón', interview: 'Pohovor', onsite: 'Na stavbe' };

  const Trades = {
    trades: [], questions: [], loaded: false, tab: 'trades', filterTrade: '',

    async load() {
      const [t, q] = await Promise.all([
        DB.list('trades', { order: { column: 'sort_order', ascending: true }, limit: 100 }),
        DB.list('screening_questions', { order: { column: 'sort_order', ascending: true }, limit: 500 }),
      ]);
      this.trades = t.data || []; this.questions = q.data || [];
      this.loaded = true;
    },

    tradeName(key) { return this.trades.find(t => t.key === key)?.name_sk || (key ? key : 'Univerzálna'); },

    async view(el) {
      Danubra.setActions(`
        <button class="btn btn-outline btn-sm" onclick="Trades.qForm()">${Icon('plus')} Otázka</button>
        <button class="btn btn-primary btn-sm" onclick="Trades.tForm()">${Icon('plus')} Remeslo</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }

      const hidden = this.questions.filter(q => q.kind === 'hidden');
      el.innerHTML = Danubra.header('Remeslá a otázky',
        `${this.trades.length} remesiel · ${this.questions.length} otázok · ${hidden.length} overovacích`) + `
        <div class="pillbar" style="margin-bottom:14px;width:max-content;">
          <button class="pill${this.tab === 'trades' ? ' active' : ''}" onclick="Trades.setTab('trades')">Remeslá</button>
          <button class="pill${this.tab === 'questions' ? ' active' : ''}" onclick="Trades.setTab('questions')">Otázky</button>
        </div>
        ${this.tab === 'trades' ? this.tradesHtml() : this.questionsHtml()}`;
    },

    setTab(t) { this.tab = t; Danubra.renderRoute(); },
    setFilter(v) { this.filterTrade = v; Danubra.renderRoute(); },

    /** Pásmo marže z rozdielu sadzieb; ak sadzby chýbajú, radšej nič než NaN. */
    marginSpan(t) {
      const lo = Number(t.rate_client_min) - Number(t.rate_worker_max);
      const hi = Number(t.rate_client_max) - Number(t.rate_worker_min);
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return '';
      return `<span style="font-size:12.5px;color:${lo > 0 ? 'var(--green)' : 'var(--red)'};font-weight:700;white-space:nowrap;">
        ${lo.toFixed(0)}–${hi.toFixed(0)} €/h marža</span>`;
    },

    tradesHtml() {
      if (!this.trades.length) {
        return UI.empty('wrench', 'Žiadne remeslá',
          'Spusti migráciu 009 — príručka sa naplní sama.',
          `<button class="btn btn-primary" onclick="Trades.tForm()">${Icon('plus')} Pridať remeslo</button>`);
      }
      return this.trades.map(t => {
        const qn = this.questions.filter(q => q.trade_key === t.key).length;
        return `<div class="list-row" onclick="Trades.detail('${t.key}')" style="align-items:flex-start;">
          <span class="dot ${t.regulated ? 'amber' : ''}" style="margin-top:5px;"></span>
          <span style="flex:1;font-size:13px;">
            <strong>${UI.esc(t.name_sk)}</strong>
            <span style="color:var(--ink-mute);"> · ${UI.esc(t.name_de || '')}</span>
            ${t.regulated ? UI.badge('regulované', 'amber') : ''}
            <span style="display:block;color:var(--ink-mute);font-size:12px;">
              ${t.lohngruppe || '—'} · pýta si ${t.rate_worker_min}–${t.rate_worker_max} €/h ·
              fakturujeme ${t.rate_client_min}–${t.rate_client_max} €/h · ${qn} odborných otázok</span>
          </span>
          ${this.marginSpan(t)}
        </div>`;
      }).join('');
    },

    questionsHtml() {
      const rows = this.questions.filter(q => !this.filterTrade
        || (this.filterTrade === '_univ' ? !q.trade_key : q.trade_key === this.filterTrade));
      return `
        <div class="filterbar">
          <select onchange="Trades.setFilter(this.value)">
            <option value="">Všetky otázky</option>
            <option value="_univ" ${this.filterTrade === '_univ' ? 'selected' : ''}>Univerzálne</option>
            ${this.trades.map(t => `<option value="${t.key}" ${this.filterTrade === t.key ? 'selected' : ''}>${UI.esc(t.name_sk)}</option>`).join('')}
          </select>
        </div>
        ${rows.map(q => this.qRow(q)).join('') || UI.empty('note', 'Žiadne otázky', 'Pridaj prvú otázku.')}`;
    },

    qRow(q) {
      const k = KIND[q.kind] || KIND.knowledge;
      return `<div class="list-row" onclick="Trades.qForm('${q.id}')" style="align-items:flex-start;">
        <span style="flex:1;font-size:13px;">
          <strong>${UI.esc(q.question_sk)}</strong>
          <span style="display:block;color:var(--ink-mute);font-size:12px;margin-top:2px;">
            ${UI.esc(this.tradeName(q.trade_key))} · ${PHASE[q.phase] || q.phase}${q.weight >= 3 ? ' · kľúčová' : ''}</span>
          ${q.good_answer ? `<span style="display:block;color:var(--green);font-size:12px;">✓ ${UI.esc(q.good_answer)}</span>` : ''}
          ${q.red_flag_answer ? `<span style="display:block;color:var(--red);font-size:12px;">! ${UI.esc(q.red_flag_answer)}</span>` : ''}
        </span>
        ${UI.badge(k[0], k[1])}
      </div>`;
    },

    detail(key) {
      const t = this.trades.find(x => x.key === key);
      if (!t) return;
      const qs = this.questions.filter(q => q.trade_key === key);
      const list = (label, arr) => (arr && arr.length)
        ? `<div class="form-section">${label}</div>
           <ul style="margin:0 0 0 18px;font-size:13px;color:var(--ink-sub);">
           ${arr.map(x => `<li>${UI.esc(x)}</li>`).join('')}</ul>` : '';

      UI.modal(t.name_sk, `
        ${t.regulated ? `<div class="warnbox">${Icon('alert', 14)} ${UI.esc(t.legal_note || '')}</div>` : ''}
        <div class="notebox">${UI.esc(t.summary || '')}</div>
        <div class="kv" style="margin-top:10px;">
          <div><span>Nemecky</span><strong>${UI.esc(t.name_de || '—')}</strong></div>
          <div><span>Mzdová skupina</span><strong>${UI.esc(t.lohngruppe || '—')}</strong></div>
          <div><span>Pýta si</span><strong>${t.rate_worker_min}–${t.rate_worker_max} €/h</strong></div>
          <div><span>Fakturujeme</span><strong>${t.rate_client_min}–${t.rate_client_max} €/h</strong></div>
        </div>
        ${list('Čo na stavbe robí', t.work_scope)}
        ${list('S čím pracuje', t.materials)}
        ${list('Vlastné náradie', t.tools)}
        ${list('Musí doložiť', t.certificates)}
        ${list('Podľa čoho spoznám, že to nerobil', t.red_flags)}
        ${t.daily_output ? `<div class="regimebox" style="margin-top:10px;">
          <b>Reálny denný výkon:</b> ${UI.esc(t.daily_output)}</div>` : ''}
        <div class="form-section">Odborné otázky (${qs.length})</div>
        ${qs.map(q => this.qRow(q)).join('') || '<div style="font-size:13px;color:var(--ink-mute);">Zatiaľ žiadne.</div>'}
        <div class="modal-actions">
          <button class="btn btn-outline btn-sm" onclick="Trades.qForm(null,'${t.key}')">${Icon('plus')} Pridať otázku</button>
          <button class="btn btn-primary btn-sm" onclick="Trades.tForm('${t.key}')">${Icon('edit')} Upraviť remeslo</button>
        </div>`, { wide: true });
    },

    // ── Formuláre ─────────────────────────────────────────────────────────
    tForm(key) {
      const t = key ? this.trades.find(x => x.key === key) || {} : {};
      const arr = a => (a || []).join('\n');
      UI.modal(key ? 'Upraviť remeslo' : 'Nové remeslo', `
        <form id="trade-form" onsubmit="event.preventDefault();Trades.tSave('${key || ''}')">
          <div class="form-grid">
            ${UI.field('key', 'Kľúč (bez diakritiky)', { value: t.key, required: true, placeholder: 'trockenbau' })}
            ${UI.field('name_sk', 'Názov', { value: t.name_sk, required: true })}
            ${UI.field('name_de', 'Nemecky', { value: t.name_de })}
            ${UI.field('lohngruppe', 'Mzdová skupina', { value: t.lohngruppe || 'LG2', options: [['LG1', 'LG1'], ['LG2', 'LG2']] })}
            ${UI.field('rate_worker_min', 'Pýta si od €/h', { type: 'number', value: t.rate_worker_min })}
            ${UI.field('rate_worker_max', 'Pýta si do €/h', { type: 'number', value: t.rate_worker_max })}
            ${UI.field('rate_client_min', 'Fakturujeme od €/h', { type: 'number', value: t.rate_client_min })}
            ${UI.field('rate_client_max', 'Fakturujeme do €/h', { type: 'number', value: t.rate_client_max })}
          </div>
          ${UI.field('summary', 'Čo mám o remesle vedieť', { type: 'textarea', rows: 3, value: t.summary })}
          <div class="chk-row">
            ${UI.field('regulated', '', { type: 'checkbox', value: t.regulated, placeholder: 'Regulované remeslo (§9 HwO)' })}
          </div>
          ${UI.field('legal_note', 'Právna poznámka', { type: 'textarea', rows: 2, value: t.legal_note })}
          <div class="form-section">Zoznamy — každá položka na nový riadok</div>
          ${UI.field('work_scope', 'Čo na stavbe robí', { type: 'textarea', rows: 4, value: arr(t.work_scope) })}
          ${UI.field('materials', 'S čím pracuje', { type: 'textarea', rows: 3, value: arr(t.materials) })}
          ${UI.field('tools', 'Vlastné náradie', { type: 'textarea', rows: 3, value: arr(t.tools) })}
          ${UI.field('certificates', 'Musí doložiť', { type: 'textarea', rows: 2, value: arr(t.certificates) })}
          ${UI.field('red_flags', 'Podľa čoho spoznám, že to nerobil', { type: 'textarea', rows: 3, value: arr(t.red_flags) })}
          ${UI.field('daily_output', 'Reálny denný výkon', { type: 'textarea', rows: 2, value: t.daily_output })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${key ? 'Uložiť' : 'Pridať'}</button>
          </div>
        </form>`, { wide: true });
    },

    async tSave(key) {
      const d = UI.formData(document.getElementById('trade-form'));
      if (!d.key || !d.name_sk) return UI.toast('Kľúč a názov sú povinné', 'err');
      const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
      const num = v => (v === '' || v == null ? null : Number(v));
      const payload = {
        key: d.key, name_sk: d.name_sk, name_de: d.name_de || null,
        lohngruppe: d.lohngruppe, regulated: !!d.regulated, legal_note: d.legal_note || null,
        summary: d.summary || null, daily_output: d.daily_output || null,
        rate_worker_min: num(d.rate_worker_min), rate_worker_max: num(d.rate_worker_max),
        rate_client_min: num(d.rate_client_min), rate_client_max: num(d.rate_client_max),
        work_scope: lines(d.work_scope), materials: lines(d.materials), tools: lines(d.tools),
        certificates: lines(d.certificates), red_flags: lines(d.red_flags),
      };
      const existing = this.trades.find(x => x.key === (key || d.key));
      const res = existing ? await DB.update('trades', existing.id, payload)
                           : await DB.insert('trades', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast('Uložené', 'ok');
      await this.load(); if (window.Hire) Hire.loaded = false;
      Danubra.renderRoute();
    },

    qForm(id, tradeKey) {
      const q = id ? this.questions.find(x => x.id === id) || {} : {};
      UI.modal(id ? 'Upraviť otázku' : 'Nová otázka', `
        <form id="q-form" onsubmit="event.preventDefault();Trades.qSave('${id || ''}')">
          <div class="form-grid">
            ${UI.field('trade_key', 'Pre remeslo', { value: q.trade_key || tradeKey || '',
              options: [['', 'Univerzálna — pre všetkých'], ...this.trades.map(t => [t.key, t.name_sk])] })}
            ${UI.field('kind', 'Typ otázky', { value: q.kind || 'knowledge',
              options: Object.entries(KIND).map(([k, v]) => [k, v[0]]) })}
            ${UI.field('phase', 'Kedy sa pýtam', { value: q.phase || 'phone',
              options: Object.entries(PHASE).map(([k, v]) => [k, v]) })}
            ${UI.field('weight', 'Váha (3 = kľúčová)', { type: 'number', value: q.weight || 1 })}
            ${UI.field('sort_order', 'Poradie', { type: 'number', value: q.sort_order || 0 })}
          </div>
          ${UI.field('question_sk', 'Otázka', { type: 'textarea', rows: 2, value: q.question_sk, required: true })}
          ${UI.field('question_de', 'Nemecky (voliteľné)', { type: 'textarea', rows: 2, value: q.question_de })}
          ${UI.field('good_answer', 'Čo chcem počuť', { type: 'textarea', rows: 2, value: q.good_answer })}
          ${UI.field('red_flag_answer', 'Pri čom zbystriť', { type: 'textarea', rows: 2, value: q.red_flag_answer })}
          <div class="regimebox">Overovacia otázka má znieť ako bežná odborná — kandidát nesmie tušiť,
          že sa ňou preveruje. Najlepšie fungujú konkrétne čísla a názvy, ktoré si človek z praxe
          pamätá, ale z inzerátu sa ich nenaučí.</div>
          <div class="modal-actions">
            ${id ? `<button type="button" class="btn btn-danger btn-sm" onclick="Trades.qDel('${id}')">Zmazať</button>` : ''}
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Pridať'}</button>
          </div>
        </form>`, { wide: true });
    },

    async qSave(id) {
      const d = UI.formData(document.getElementById('q-form'));
      if (!d.question_sk) return UI.toast('Otázka je povinná', 'err');
      const payload = {
        trade_key: d.trade_key || null, kind: d.kind, phase: d.phase,
        question_sk: d.question_sk, question_de: d.question_de || null,
        good_answer: d.good_answer || null, red_flag_answer: d.red_flag_answer || null,
        weight: Number(d.weight) || 1, sort_order: Number(d.sort_order) || 0,
      };
      if (!id) payload.code = `own_${Date.now().toString(36)}`;
      const res = id ? await DB.update('screening_questions', id, payload)
                     : await DB.insert('screening_questions', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast('Uložené', 'ok');
      await this.load(); if (window.Hire) Hire.loaded = false;
      Danubra.renderRoute();
    },

    async qDel(id) {
      if (!confirm('Zmazať túto otázku? Odpovede kandidátov na ňu sa stratia.')) return;
      await DB.remove('screening_questions', id);
      this.questions = this.questions.filter(x => x.id !== id);
      UI.closeModal(); Danubra.renderRoute();
    },
  };

  window.Trades = Trades;
  Danubra.views.trades = function (el) { Trades.view(el); };
})();
