// ============================================================================
// DANUBRA — Pracovníci (Fáza 2: vlastní zamestnanci na vyslanie)
// ============================================================================
(function () {
  const STATUS = [
    ['candidate', 'Kandidát', 'gray'], ['screening', 'V preverovaní', 'amber'],
    ['ready', 'Pripravený', 'blue'], ['deployed', 'Vyslaný', 'green'],
    ['inactive', 'Neaktívny', 'gray'], ['blacklist', 'Nespolupracovať', 'red'],
  ];
  const PROFESSIONS = [
    ['trockenbau', 'Sadrokartón'], ['maliar', 'Maliar'], ['obkladac', 'Obkladač'],
    ['murar', 'Murár'], ['zamocnik', 'Zámočník'], ['zvarac', 'Zvárač'],
    ['cnc', 'CNC operátor'], ['montaznik', 'Montážnik'], ['pomocnik', 'Pomocný pracovník'],
  ];
  const SKILL = [['werker', 'Werker (LG1)'], ['fachwerker', 'Fachwerker (LG2)']];
  const DOC_KINDS = [
    ['a1', 'A1 (vyslanie)'], ['passport', 'Pas'], ['id_card', 'Občiansky'],
    ['medical', 'Lekárska prehliadka'], ['certificate', 'Certifikát / preukaz'],
    ['training', 'Školenie BOZP'], ['contract', 'Pracovná zmluva'],
  ];

  const Wrk = {
    items: [], docs: [], loaded: false,
    filters: { status: '', profession: '', q: '' },

    async load() {
      const [w, d] = await Promise.all([
        DB.list('workers', { order: { column: 'created_at', ascending: false }, limit: 500 }),
        DB.list('worker_documents', { limit: 2000 }),
      ]);
      this.items = w.data || []; this.docs = d.data || [];
      this.loaded = true;
    },

    docsOf(id) { return this.docs.filter(d => d.worker_id === id); },
    statusBadge(s) { const m = STATUS.find(x => x[0] === s) || STATUS[0]; return UI.badge(m[1], m[2]); },
    professionLabel(p) { const x = PROFESSIONS.find(y => y[0] === p); return x ? x[1] : (p || '—'); },

    /** Stav dokladov pracovníka — A1 je kritické pre vyslanie. */
    docStatus(workerId) {
      const today = new Date().toISOString().slice(0, 10);
      const a1 = this.docsOf(workerId).filter(d => d.kind === 'a1')
        .sort((a, b) => String(b.valid_to || '').localeCompare(String(a.valid_to || '')))[0];
      const st = DanubraCompliance.docState(a1, today);
      return { a1, state: st };
    },

    filtered() {
      const f = this.filters;
      return this.items.filter(w => {
        if (f.status && w.status !== f.status) return false;
        if (f.profession && w.profession !== f.profession) return false;
        if (f.q) {
          const hay = `${w.full_name} ${w.phone || ''} ${w.city || ''} ${this.professionLabel(w.profession)}`.toLowerCase();
          if (!hay.includes(f.q.toLowerCase())) return false;
        }
        return true;
      });
    },

    async view(el) {
      Danubra.setActions(`<button class="btn btn-primary btn-sm" onclick="Wrk.form()">${Icon('plus')} Pridať pracovníka</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const rows = this.filtered();
      const ready = this.items.filter(w => w.status === 'ready').length;
      const deployed = this.items.filter(w => w.status === 'deployed').length;
      // koľkým chýba alebo končí A1
      const a1Issues = this.items.filter(w => ['deployed', 'ready'].includes(w.status))
        .filter(w => ['missing', 'expired', 'expiring'].includes(this.docStatus(w.id).state)).length;

      el.innerHTML = Danubra.header('Pracovníci',
        `${this.items.length} v databáze · ${ready} pripravených · ${deployed} vyslaných`) +
        (a1Issues ? `<div class="warnbox" style="margin-bottom:14px;">
          ${Icon('alert', 14)} ${a1Issues} ${a1Issues === 1 ? 'pracovník má problém' : 'pracovníkov má problém'} s dokladom A1 —
          bez platného A1 sa nesmie vyslať.</div>` : '') + `
        <div class="pillbar" style="margin-bottom:14px;width:max-content;max-width:100%;overflow-x:auto;">
          <button class="pill${!this.filters.status ? ' active' : ''}" onclick="Wrk.setF('status','')">Všetci</button>
          ${STATUS.map(s => {
            const n = this.items.filter(w => w.status === s[0]).length;
            return n ? `<button class="pill${this.filters.status === s[0] ? ' active' : ''}" onclick="Wrk.setF('status','${s[0]}')">${s[1]} ${n}</button>` : '';
          }).join('')}
        </div>
        <div class="filterbar">
          <input class="fb-search" placeholder="Hľadať meno, telefón, mesto…" value="${UI.esc(this.filters.q)}"
            oninput="Wrk.setF('q',this.value)">
          <select onchange="Wrk.setF('profession',this.value)">
            <option value="">Všetky profesie</option>
            ${PROFESSIONS.map(p => `<option value="${p[0]}" ${this.filters.profession === p[0] ? 'selected' : ''}>${p[1]}</option>`).join('')}
          </select>
        </div>
        <div class="count-line">${rows.length} ZÁZNAMOV</div>
        ${rows.length === 0
          ? UI.empty('workers', 'Žiadni pracovníci', 'Pridaj prvého pracovníka do databázy.',
              `<button class="btn btn-primary" onclick="Wrk.form()">${Icon('plus')} Pridať pracovníka</button>`)
          : `<div class="cards">${rows.map(w => this.card(w)).join('')}</div>`}`;
    },

    card(w) {
      const ds = this.docStatus(w.id);
      const a1Warn = ['missing', 'expired'].includes(ds.state) ? 'red'
        : ds.state === 'expiring' ? 'amber' : null;
      return `
        <div class="acc-card card" onclick="Wrk.detail('${w.id}')">
          <div class="acc-card-head">
            <div>
              <div class="acc-name">${UI.esc(w.full_name)}</div>
              <div class="acc-loc">${this.professionLabel(w.profession)}${w.skill_level ? ` · ${w.skill_level === 'fachwerker' ? 'LG2' : 'LG1'}` : ''}${w.city ? ` · ${UI.esc(w.city)}` : ''}</div>
            </div>
            ${this.statusBadge(w.status)}
          </div>
          <div class="acc-meta">
            ${w.phone ? `<span>${Icon('phone', 14)} ${UI.esc(w.phone)}</span>` : ''}
            ${w.gross_monthly ? `<span>${Icon('euro', 14)} ${UI.money(w.gross_monthly)}</span>` : ''}
            ${w.available_from ? `<span>${Icon('calendar', 14)} od ${UI.date(w.available_from)}</span>` : ''}
            ${a1Warn ? `<span style="color:var(--${a1Warn === 'red' ? 'red' : 'amber'});font-weight:700;">
              ${Icon('alert', 14)} A1 ${ds.state === 'missing' ? 'chýba' : ds.state === 'expired' ? 'neplatné' : 'končí'}</span>` : ''}
          </div>
        </div>`;
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    async detail(id) {
      const w = this.items.find(x => x.id === id);
      if (!w) return UI.toast('Nenájdené', 'err');
      const docs = this.docsOf(id);
      const today = new Date().toISOString().slice(0, 10);

      const rows = [
        ['Profesia', this.professionLabel(w.profession)],
        ['Zaradenie', w.skill_level ? (SKILL.find(s => s[0] === w.skill_level) || [, w.skill_level])[1] : null],
        ['Telefón', w.phone], ['E-mail', w.email],
        ['Mesto', w.city], ['Jazyk', (w.language || '').toUpperCase()],
        ['Nemčina', w.german_level], ['Vodičský', w.driving_licence ? 'Áno' : null],
        ['Vlastné náradie', w.own_tools ? 'Áno' : null],
        ['Hrubá mzda', w.gross_monthly ? UI.money(w.gross_monthly) : null],
        ['Diéty', w.per_diem_daily ? `${UI.money(w.per_diem_daily)} / deň` : null],
        ['Dostupný od', w.available_from ? UI.date(w.available_from) : null],
        ['Zdroj', w.source],
      ].filter(r => r[1] != null && r[1] !== '');

      const docRow = (d) => {
        const st = DanubraCompliance.docState(d, today);
        const color = st === 'expired' ? 'red' : st === 'expiring' ? 'amber' : st === 'valid' ? 'green' : '';
        const label = { valid: 'platné', expiring: 'čoskoro vyprší', expired: 'neplatné', not_yet: 'ešte neplatí', missing: 'chýba' }[st];
        return `<div class="list-row" style="cursor:default;">
          <span class="dot ${color}"></span>
          <span style="flex:1;font-size:13px;">
            <strong>${(DOC_KINDS.find(k => k[0] === d.kind) || [, d.kind])[1]}</strong>
            ${d.reference ? `<span style="color:var(--ink-mute);"> · ${UI.esc(d.reference)}</span>` : ''}
            <span style="color:var(--ink-mute);display:block;font-size:12px;">
              ${d.valid_from ? UI.date(d.valid_from) : '—'} – ${d.valid_to ? UI.date(d.valid_to) : 'bez konca'} · ${label}</span>
          </span>
          <button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="Wrk.delDoc('${d.id}')">${Icon('x', 15)}</button>
        </div>`;
      };

      const body = `
        <div class="detail-head">
          ${this.statusBadge(w.status)}
          <select class="verif-sel" onchange="Wrk.setStatus('${w.id}',this.value)">
            ${STATUS.map(s => `<option value="${s[0]}" ${w.status === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('')}
          </select>
        </div>
        ${CommPanel.render({ contact: { phone: w.phone, email: w.email, whatsapp: w.whatsapp, name: w.full_name }, entity: { type: 'worker', id: w.id } })}
        <div class="kv">${rows.map(r => `<div><span>${r[0]}</span><strong>${UI.esc(r[1])}</strong></div>`).join('')}</div>
        ${(w.skills || []).length ? `<div class="chips">${w.skills.map(x => `<span class="chip">${UI.esc(x)}</span>`).join('')}</div>` : ''}
        ${w.notes ? `<div class="notebox">${UI.esc(w.notes)}</div>` : ''}

        <div class="form-section">Doklady a platnosti</div>
        ${docs.length ? docs.map(docRow).join('') : '<div style="color:var(--ink-mute);font-size:13px;">Žiadne doklady — bez platného A1 sa nesmie vyslať.</div>'}
        <button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="Wrk.addDoc('${w.id}')">${Icon('plus')} Pridať doklad</button>

        <div class="modal-actions">
          <button class="btn btn-danger btn-sm" onclick="Wrk.del('${w.id}')">Zmazať</button>
          <button class="btn btn-outline btn-sm" onclick="Wrk.form('${w.id}')">Upraviť</button>
        </div>`;
      UI.modal(w.full_name, body, { wide: true });
    },

    async setStatus(id, status) {
      await DB.update('workers', id, { status });
      const w = this.items.find(x => x.id === id); if (w) w.status = status;
      UI.toast('Stav uložený', 'ok');
    },

    form(id) {
      const w = id ? this.items.find(x => x.id === id) || {} : {};
      const body = `
        <form id="wrk-form" onsubmit="event.preventDefault();Wrk.save('${id || ''}')">
          <div class="form-grid">
            ${UI.field('full_name', 'Meno a priezvisko', { value: w.full_name, required: true })}
            ${UI.field('status', 'Stav', { value: w.status || 'candidate', options: STATUS.map(s => [s[0], s[1]]) })}
            ${UI.field('phone', 'Telefón', { value: w.phone })}
            ${UI.field('email', 'E-mail', { type: 'email', value: w.email })}
            ${UI.field('profession', 'Profesia', { value: w.profession, options: [['', '—'], ...PROFESSIONS] })}
            ${UI.field('skill_level', 'Zaradenie', { value: w.skill_level, options: [['', '—'], ...SKILL] })}
            ${UI.field('city', 'Mesto', { value: w.city })}
            ${UI.field('language', 'Jazyk', { value: w.language, options: [['', '—'], ['sk', 'SK'], ['hu', 'HU'], ['cs', 'CS'], ['ua', 'UA']] })}
            ${UI.field('german_level', 'Nemčina', { value: w.german_level, options: [['', '—'], ['ziadny', 'Žiadna'], ['zaklad', 'Základ'], ['dobry', 'Dobrá']] })}
            ${UI.field('available_from', 'Dostupný od', { type: 'date', value: w.available_from })}
          </div>
          <div class="form-section">Odmeňovanie</div>
          <div class="form-grid">
            ${UI.field('gross_monthly', 'Hrubá mzda €/mes', { type: 'number', value: w.gross_monthly })}
            ${UI.field('per_diem_daily', 'Diéty €/deň', { type: 'number', value: w.per_diem_daily ?? 45 })}
            ${UI.field('employment_type', 'Pracovný pomer', { value: w.employment_type, options: [['', '—'], ['tpp', 'TPP'], ['dohoda', 'Dohoda'], ['zivnost', 'Živnosť']] })}
            ${UI.field('source', 'Zdroj', { value: w.source, placeholder: 'referral, profesia.sk, FB…' })}
          </div>
          <div class="chk-row">
            ${UI.field('whatsapp', '', { type: 'checkbox', value: w.whatsapp, placeholder: 'Má WhatsApp' })}
            ${UI.field('driving_licence', '', { type: 'checkbox', value: w.driving_licence, placeholder: 'Vodičský preukaz' })}
            ${UI.field('own_tools', '', { type: 'checkbox', value: w.own_tools, placeholder: 'Vlastné náradie' })}
          </div>
          ${UI.field('skills_csv', 'Zručnosti (čiarkou)', { value: (w.skills || []).join(', ') })}
          ${UI.field('notes', 'Poznámka', { type: 'textarea', value: w.notes })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Pridať'}</button>
          </div>
        </form>`;
      UI.modal(id ? 'Upraviť pracovníka' : 'Nový pracovník', body, { wide: true });
    },

    async save(id) {
      const d = UI.formData(document.getElementById('wrk-form'));
      if (!d.full_name) return UI.toast('Meno je povinné', 'err');
      const payload = { ...d };
      ['gross_monthly', 'per_diem_daily'].forEach(k => { payload[k] = d[k] === '' ? null : Number(d[k]); });
      if (payload.available_from === '') payload.available_from = null;
      payload.skills = (d.skills_csv || '').split(',').map(s => s.trim()).filter(Boolean);
      delete payload.skills_csv;
      const res = id ? await DB.update('workers', id, payload) : await DB.insert('workers', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal(); UI.toast(id ? 'Uložené' : 'Pridané', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    async del(id) {
      if (!confirm('Zmazať tohto pracovníka?')) return;
      const { error } = await DB.remove('workers', id);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal(); UI.toast('Zmazané', 'ok');
      this.items = this.items.filter(x => x.id !== id); Danubra.renderRoute();
    },

    // ── Doklady ───────────────────────────────────────────────────────────
    addDoc(workerId) {
      const body = `
        <form id="doc-form" onsubmit="event.preventDefault();Wrk.saveDoc('${workerId}')">
          <div class="form-grid">
            ${UI.field('kind', 'Typ dokladu', { value: 'a1', options: DOC_KINDS })}
            ${UI.field('reference', 'Číslo / referencia', {})}
            ${UI.field('valid_from', 'Platí od', { type: 'date' })}
            ${UI.field('valid_to', 'Platí do', { type: 'date' })}
          </div>
          ${UI.field('notes', 'Poznámka', { type: 'textarea' })}
          <div class="regimebox">A1 vystavuje Sociálna poisťovňa do 45 dní a platí najviac 24 mesiacov —
          žiadaj s predstihom, inak sa nedá vyslať.</div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="Wrk.detail('${workerId}')">Späť</button>
            <button type="submit" class="btn btn-primary">Pridať doklad</button>
          </div>
        </form>`;
      UI.modal('Nový doklad', body);
    },

    async saveDoc(workerId) {
      const d = UI.formData(document.getElementById('doc-form'));
      const payload = {
        worker_id: workerId, kind: d.kind, reference: d.reference || null,
        valid_from: d.valid_from || null, valid_to: d.valid_to || null,
        notes: d.notes || null,
      };
      const { error } = await DB.insert('worker_documents', payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast('Doklad pridaný', 'ok');
      await this.load(); this.detail(workerId);
    },

    async delDoc(docId) {
      const doc = this.docs.find(d => d.id === docId);
      if (!confirm('Zmazať tento doklad?')) return;
      await DB.remove('worker_documents', docId);
      this.docs = this.docs.filter(d => d.id !== docId);
      if (doc) this.detail(doc.worker_id);
    },
  };

  window.Wrk = Wrk;
  Danubra.views.workers = function (el) { Wrk.view(el); };
})();
