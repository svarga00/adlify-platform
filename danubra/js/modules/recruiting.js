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

      el.innerHTML = Danubra.header('AI nábor',
        `${this.promises.length} zachytených dohôd · ${open.length} otvorených · ${this.recordings.length} hovorov`) +
        (noConsent.length ? `<div class="warnbox" style="margin-bottom:14px;">
          ${Icon('alert', 14)} ${noConsent.length} ${noConsent.length === 1 ? 'nahrávka nemá' : 'nahrávok nemá'}
          potvrdený súhlas — nedajú sa spracovať a mali by sa zmazať.</div>` : '') +
        (broken.length ? `<div class="warnbox" style="margin-bottom:14px;">
          ${Icon('alert', 14)} ${broken.length} ${broken.length === 1 ? 'sľub je označený' : 'sľubov je označených'}
          ako nesplnený — to je najčastejší dôvod odchodu pracovníka.</div>` : '') + `

        <div class="kpi-grid" style="margin-bottom:16px;">
          <div class="kpi"><div class="kpi-label">Otvorené sľuby</div>
            <div class="kpi-value">${open.length}</div>
            <div class="kpi-delta ${overdue.length ? 'warn' : ''}">${overdue.length ? `${overdue.length} po termíne` : 'v termíne'}</div></div>
          <div class="kpi"><div class="kpi-label">Splnené</div>
            <div class="kpi-value" style="color:var(--green);">${this.promises.filter(p => p.status === 'fulfilled').length}</div>
            <div class="kpi-delta">dodržali sme</div></div>
          <div class="kpi"><div class="kpi-label">Nesplnené</div>
            <div class="kpi-value" style="color:${broken.length ? 'var(--red)' : 'var(--green)'};">${broken.length}</div>
            <div class="kpi-delta">riziko odchodu</div></div>
          <div class="kpi"><div class="kpi-label">Platné súhlasy</div>
            <div class="kpi-value">${this.consents.filter(c => c.granted && !c.revoked_at).length}</div>
            <div class="kpi-delta">s nahrávaním</div></div>
        </div>

        <div class="pillbar" style="margin-bottom:14px;width:max-content;">
          <button class="pill${this.tab === 'promises' ? ' active' : ''}" onclick="Rec.setTab('promises')">Dohody ${this.promises.length}</button>
          <button class="pill${this.tab === 'calls' ? ' active' : ''}" onclick="Rec.setTab('calls')">Hovory ${this.recordings.length}</button>
          <button class="pill${this.tab === 'consents' ? ' active' : ''}" onclick="Rec.setTab('consents')">Súhlasy ${this.consents.length}</button>
        </div>
        ${this.tab === 'promises' ? this.promisesHtml()
          : this.tab === 'calls' ? this.callsHtml() : this.consentsHtml()}`;
    },

    promisesHtml() {
      if (!this.promises.length) {
        return UI.empty('note', 'Žiadne zachytené dohody',
          'Pridaj nahrávku hovoru — systém z nej vytiahne, čo sa sľúbilo.',
          `<button class="btn btn-primary" onclick="Rec.uploadForm()">${Icon('upload')} Pridať hovor</button>`);
      }
      return this.promises.map(p => {
        const w = this.workerOf(p.subject_id);
        const late = p.status === 'open' && p.due_date && p.due_date < new Date().toISOString().slice(0, 10);
        const lowConf = p.confidence != null && p.confidence < 0.6;
        return `
        <div class="list-row" style="cursor:default;align-items:flex-start;">
          <span class="dot ${p.status === 'fulfilled' ? 'green' : p.status === 'broken' ? 'red' : 'amber'}"
            style="margin-top:5px;"></span>
          <span style="flex:1;font-size:13px;">
            <strong>${UI.esc(PROMISE_KIND[p.kind] || p.kind)}</strong>
            ${w ? `<span style="color:var(--ink-mute);"> · ${UI.esc(w.full_name)}</span>` : ''}
            ${lowConf ? UI.badge('overiť', 'amber') : ''}
            ${late ? UI.badge('po termíne', 'red') : ''}
            <span style="display:block;color:var(--ink-sub);margin-top:2px;">${UI.esc(p.statement)}</span>
            ${p.value_text ? `<span style="display:block;color:var(--ink-mute);font-size:12px;">
              Hodnota: ${UI.esc(p.value_text)}${p.due_date ? ` · termín ${UI.date(p.due_date)}` : ''}</span>` : ''}
          </span>
          <select class="verif-sel" onchange="Rec.setPromiseStatus('${p.id}',this.value)">
            ${Object.entries(PROMISE_STATUS).map(([k, v]) =>
              `<option value="${k}" ${p.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}
          </select>
        </div>`;
      }).join('');
    },

    callsHtml() {
      if (!this.recordings.length) {
        return UI.empty('phone', 'Žiadne hovory', 'Nahrávku pridáš až keď máš zaznamenaný súhlas.',
          `<button class="btn btn-primary" onclick="Rec.uploadForm()">${Icon('upload')} Pridať hovor</button>`);
      }
      return this.recordings.map(r => {
        const w = this.workerOf(r.subject_id);
        const n = this.promises.filter(p => p.recording_id === r.id).length;
        return `
        <div class="list-row" onclick="Rec.callDetail('${r.id}')" style="align-items:flex-start;">
          <span class="dot ${r.status === 'done' ? 'green' : r.status === 'failed' || !r.consent_confirmed ? 'red' : 'amber'}"
            style="margin-top:5px;"></span>
          <span style="flex:1;font-size:13px;">
            <strong>${UI.esc(w?.full_name || r.subject_name || r.subject_phone || 'Hovor')}</strong>
            <span style="color:var(--ink-mute);"> · ${UI.date(r.recorded_at)}</span>
            <span style="display:block;color:var(--ink-mute);font-size:12px;">
              ${!r.consent_confirmed ? 'bez potvrdeného súhlasu · ' : ''}${n ? `${n} dohôd · ` : ''}${r.summary ? UI.esc(r.summary.slice(0, 90)) + '…' : ''}</span>
          </span>
          ${this.recBadge(r.status)}
        </div>`;
      }).join('');
    },

    consentsHtml() {
      if (!this.consents.length) {
        return UI.empty('shield', 'Žiadne súhlasy',
          'Súhlas s nahrávaním musí byť daný pred hovorom — v SR aj v Nemecku je to podmienka zákonnosti.',
          `<button class="btn btn-primary" onclick="Rec.consentForm()">${Icon('shield')} Zaznamenať súhlas</button>`);
      }
      return this.consents.map(c => {
        const w = this.workerOf(c.subject_id);
        const active = c.granted && !c.revoked_at;
        return `
        <div class="list-row" style="cursor:default;align-items:flex-start;">
          <span class="dot ${active ? 'green' : 'red'}" style="margin-top:5px;"></span>
          <span style="flex:1;font-size:13px;">
            <strong>${UI.esc(w?.full_name || c.subject_name || c.subject_phone || '—')}</strong>
            <span style="display:block;color:var(--ink-mute);font-size:12px;">
              ${c.granted ? `udelený ${UI.date(c.granted_at)}` : 'neudelený'}
              ${c.method ? ` · ${UI.esc(c.method)}` : ''}
              ${c.revoked_at ? ` · odvolaný ${UI.date(c.revoked_at)}` : ''}
              ${c.retention_until ? ` · uchovať do ${UI.date(c.retention_until)}` : ''}</span>
          </span>
          ${active ? `<button class="btn btn-ghost btn-sm" style="color:var(--red);"
            onclick="Rec.revoke('${c.id}')">Odvolať</button>` : ''}
        </div>`;
      }).join('');
    },

    setTab(t) { this.tab = t; Danubra.renderRoute(); },

    // ── Súhlas ────────────────────────────────────────────────────────────
    async consentForm() {
      const s = await this._settings();
      const script = s?.recruiting?.consent_script_sk
        || 'Tento hovor by sme si radi nahrali, aby sme mali presne zapísané, na čom sa dohodneme. Súhlasíte?';
      const retention = Number(s?.recruiting?.retention_days) || 180;
      const until = new Date(Date.now() + retention * 86400000).toISOString().slice(0, 10);

      UI.modal('Zaznamenať súhlas s nahrávaním', `
        <div class="warnbox" style="margin-bottom:14px;">
          ${Icon('alert', 14)} Súhlas musí byť daný <strong>pred</strong> začiatkom hovoru a musí byť
          výslovný. Samotné oznámenie „hovor môže byť nahrávaný" nestačí.
        </div>
        <div class="form-section">Znenie, ktorým sa pýtame</div>
        <div class="notebox" id="consent-script">${UI.esc(script)}</div>
        <button class="btn btn-outline btn-sm" style="margin-top:8px;"
          onclick="Rec.copyScript()">${Icon('copy')} Skopírovať znenie</button>

        <form id="consent-form" onsubmit="event.preventDefault();Rec.saveConsent()" style="margin-top:16px;">
          <div class="form-grid">
            ${UI.field('subject_id', 'Pracovník', { options: [['', '— nie je v databáze —'],
              ...this.workers.map(w => [w.id, w.full_name])] })}
            ${UI.field('subject_name', 'Meno (ak nie je v databáze)', {})}
            ${UI.field('subject_phone', 'Telefón', {})}
            ${UI.field('method', 'Ako bol súhlas daný', { value: 'verbal_recorded', options: [
              ['verbal_recorded', 'Ústne, zaznamenané na začiatku nahrávky'],
              ['sms', 'SMS'], ['email', 'E-mail'], ['written', 'Písomne'], ['app', 'V aplikácii']] })}
            ${UI.field('language', 'Jazyk', { value: 'sk', options: [['sk', 'SK'], ['hu', 'HU'], ['cs', 'CS'], ['de', 'DE']] })}
            ${UI.field('retention_until', 'Uchovávať do', { type: 'date', value: until })}
          </div>
          ${UI.field('evidence_note', 'Ako presne súhlas znel', { type: 'textarea', rows: 2,
            placeholder: 'napr. „Áno, súhlasím s nahrávaním" — zaznelo v 0:12 nahrávky' })}
          <label class="chk" style="margin-top:12px;">
            <input type="checkbox" name="granted" required>
            Potvrdzujem, že osoba dala výslovný súhlas pred začiatkom hovoru</label>
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
        return UI.toast('Uveď aspoň meno alebo telefón', 'err');
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
      const reason = prompt('Dôvod odvolania súhlasu:');
      if (reason === null) return;
      await DB.update('consents', id, { revoked_at: new Date().toISOString(), revoke_reason: reason || null });
      UI.toast('Súhlas odvolaný — súvisiace nahrávky treba zmazať', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    // ── Nahrávka ──────────────────────────────────────────────────────────
    uploadForm() {
      const withConsent = this.consents.filter(c => c.granted && !c.revoked_at);
      if (!withConsent.length) {
        return UI.modal('Najprv súhlas', `
          <div class="warnbox">${Icon('alert', 14)}
            Zatiaľ nie je zaznamenaný žiadny súhlas s nahrávaním. Bez neho sa nahrávka nesmie
            spracovať — v Slovenskej republike aj v Nemecku je nahrávanie bez súhlasu trestné.</div>
          <div class="modal-actions">
            <button class="btn btn-primary" onclick="Rec.consentForm()">${Icon('shield')} Zaznamenať súhlas</button>
          </div>`);
      }
      UI.modal('Pridať nahrávku hovoru', `
        <form id="rec-form" onsubmit="event.preventDefault();Rec.saveRecording()">
          <div class="form-grid">
            ${UI.field('consent_id', 'Súhlas', { required: true, options: withConsent.map(c => {
              const w = this.workerOf(c.subject_id);
              return [c.id, `${w?.full_name || c.subject_name || c.subject_phone} · ${UI.date(c.granted_at)}`];
            }) })}
            ${UI.field('recorded_at', 'Kedy sa volalo', { type: 'date', value: new Date().toISOString().slice(0, 10) })}
            ${UI.field('language', 'Jazyk hovoru', { value: 'sk', options: [['sk', 'SK'], ['hu', 'HU'], ['cs', 'CS'], ['de', 'DE']] })}
            ${UI.field('duration_seconds', 'Dĺžka (sekundy)', { type: 'number' })}
          </div>
          ${UI.field('audio_url', 'Odkaz na nahrávku', { type: 'url', required: true,
            placeholder: 'https://… (súbor v Supabase Storage alebo iné dostupné úložisko)' })}
          <div class="regimebox">Po uložení sa nahrávka prepíše a systém z nej vytiahne,
          čo sa sľúbilo — mzda, ubytovanie, termín nástupu, diéty a doprava.</div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">Uložiť a spracovať</button>
          </div>
        </form>`, { wide: true });
    },

    async saveRecording() {
      const d = UI.formData(document.getElementById('rec-form'));
      const consent = this.consents.find(c => c.id === d.consent_id);
      if (!consent) return UI.toast('Vyber súhlas', 'err');
      const payload = {
        subject_type: 'worker', subject_id: consent.subject_id || null,
        subject_name: consent.subject_name || null, subject_phone: consent.subject_phone || null,
        consent_id: consent.id, consent_confirmed: true,
        audio_url: d.audio_url, language: d.language,
        duration_seconds: d.duration_seconds === '' ? null : Number(d.duration_seconds),
        recorded_at: d.recorded_at ? new Date(d.recorded_at).toISOString() : new Date().toISOString(),
        delete_after: consent.retention_until || null,
        status: 'uploaded',
      };
      const { data: rec, error } = await DB.insert('call_recordings', payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
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
          ${r.delete_after ? `<div><span>Zmazať po</span><strong>${UI.date(r.delete_after)}</strong></div>` : ''}
        </div>
        ${r.summary ? `<div class="form-section">Zhrnutie</div><div class="notebox">${UI.esc(r.summary)}</div>` : ''}
        ${oq.length ? `<div class="form-section">Zostalo nedohodnuté</div>
          ${oq.map(q => `<div class="list-row" style="cursor:default;">
            <span class="dot amber"></span><span style="flex:1;font-size:13px;">${UI.esc(q)}</span></div>`).join('')}` : ''}
        ${prom.length ? `<div class="form-section">Zachytené dohody (${prom.length})</div>
          ${prom.map(p => `<div class="list-row" style="cursor:default;">
            <span style="flex:1;font-size:13px;"><strong>${UI.esc(PROMISE_KIND[p.kind] || p.kind)}</strong>
            <span style="display:block;color:var(--ink-sub);">${UI.esc(p.statement)}</span></span>
            ${this.prBadge(p.status)}</div>`).join('')}` : ''}
        ${r.transcript ? `<div class="form-section">Prepis</div>
          <div class="notebox" style="max-height:220px;overflow:auto;">${UI.esc(r.transcript)}</div>` : ''}
        <div class="modal-actions">
          <button class="btn btn-danger btn-sm" onclick="Rec.delRecording('${r.id}')">Zmazať nahrávku</button>
          ${['uploaded', 'failed'].includes(r.status)
            ? `<button class="btn btn-primary btn-sm" onclick="UI.closeModal();Rec.process('${r.id}')">Spracovať</button>` : ''}
        </div>`, { wide: true });
    },

    async setPromiseStatus(id, status) {
      const patch = { status };
      if (status === 'fulfilled') patch.fulfilled_at = new Date().toISOString();
      await DB.update('promises', id, patch);
      const p = this.promises.find(x => x.id === id); if (p) Object.assign(p, patch);
      UI.toast('Uložené', 'ok');
    },

    async delRecording(id) {
      if (!confirm('Zmazať nahrávku aj s prepisom? Zachytené dohody ostanú zapísané.')) return;
      await DB.remove('call_recordings', id);
      this.recordings = this.recordings.filter(x => x.id !== id);
      UI.closeModal(); UI.toast('Nahrávka zmazaná', 'ok');
      Danubra.renderRoute();
    },

    async _settings() {
      if (this._set) return this._set;
      const { data } = await DB.list('settings', { limit: 1 });
      this._set = (data && data[0]) || {};
      return this._set;
    },
  };

  window.Rec = Rec;
  Danubra.views.recruiting = function (el) { Rec.view(el); };
})();
