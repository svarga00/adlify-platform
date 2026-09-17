// ============================================================================
// DANUBRA — Kartotéka živnostníkov
// ============================================================================
// v1 to bola kartotéka zamestnancov (hrubá mzda, odvody). v2 je živnostnícka:
// človek nám fakturuje, takže okrem kontaktu potrebujeme aj to, na koho
// faktúru vystaví — a či má doklady, s ktorými ho smieme nasadiť.
//
// Zamestnanecké polia z v1 zostávajú, lebo historické záznamy sa nemenia.
//
// Logika platnosti dokladov a pripravenosti je v lib/staffing/documents.js
// a má vlastné testy; tento modul ju len vykresľuje.
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

  const Wrk = {
    items: [], docs: [], overrides: [], loaded: false,
    filters: { status: '', profession: '', q: '' },

    async load() {
      const [w, d, o] = await Promise.all([
        DB.list('workers', { order: { column: 'created_at', ascending: false }, limit: 500 }),
        DB.list('worker_documents', { limit: 2000 }),
        DB.list('overrides', { filters: { entity_type: 'worker' }, limit: 1000 }),
        Enums.load(),
      ]);
      this.items = w.data || []; this.docs = d.data || [];
      this.overrides = o.data || [];
      this.loaded = true;
    },

    /** Zapísané výnimky pre daného človeka. Zrušené sem nepatria. */
    overridesOf(workerId) {
      return this.overrides.filter(o => o.entity_id === workerId);
    },

    /** Typy dokladov z číselníka — pridanie nového nevyžaduje zásah do kódu. */
    docKinds() { return Enums.options('worker_document'); },
    docLabel(kind) { return Enums.label('worker_document', kind); },

    docsOf(id) { return this.docs.filter(d => d.worker_id === id); },
    statusBadge(s) { const m = STATUS.find(x => x[0] === s) || STATUS[0]; return UI.badge(m[1], m[2]); },
    professionLabel(p) { const x = PROFESSIONS.find(y => y[0] === p); return x ? x[1] : (p || '—'); },
    /** Zoznam remesiel pre iné moduly (partie), nech ho nemajú dvakrát. */
    professions() { return PROFESSIONS.slice(); },

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
        ['Forma spolupráce', w.legal_form === 'szco' ? 'Živnostník' : 'Zamestnanec'],
        ['Spolupracuje', this.cooperationLength(w)],
        ['Hrubá mzda', w.legal_form !== 'szco' && w.gross_monthly ? UI.money(w.gross_monthly) : null],
        ['Sadzba živnostníka', w.legal_form === 'szco' && w.hourly_cost ? `${UI.money(w.hourly_cost)} / h` : null],
        ['Diéty', w.per_diem_daily ? `${UI.money(w.per_diem_daily)} / deň` : null],
        ['Dostupný od', w.available_from ? UI.date(w.available_from) : null],
        ['Zdroj', w.source],
      ].filter(r => r[1] != null && r[1] !== '');

      const isTrade = w.legal_form === 'szco';

      const docRow = (d) => {
        const x = DanubraDocs.describe(d, today);
        const color = x.state === 'expired' ? 'red'
          : x.state === 'expiring' ? 'amber' : x.state === 'valid' ? 'green' : '';
        const label = {
          valid: 'platné', expiring: 'čoskoro vyprší', expired: 'neplatné',
          not_yet: 'ešte neplatí', missing: 'chýba',
        }[x.state];
        // Počet dní je to, čo človek potrebuje vedieť: „ešte 12 dní" hovorí
        // viac než „čoskoro vyprší".
        const dni = x.daysLeft == null ? ''
          : x.state === 'expired'
            ? ` · pred ${Math.abs(x.daysLeft)} ${Shell.plural(x.daysLeft, 'dňom', 'dňami', 'dňami')}`
            : ` · ešte ${x.daysLeft} ${Shell.plural(x.daysLeft, 'deň', 'dni', 'dní')}`;
        return `<div class="list-row" style="cursor:default;">
          <span class="dot ${color}"></span>
          <span style="flex:1;font-size:13px;">
            <strong>${UI.esc(this.docLabel(d.kind))}</strong>
            ${d.reference ? `<span style="color:var(--ink-mute);"> · ${UI.esc(d.reference)}</span>` : ''}
            <span style="color:var(--ink-mute);display:block;font-size:12px;">
              ${d.valid_from ? UI.date(d.valid_from) : '—'} – ${d.valid_to ? UI.date(d.valid_to) : 'bez konca'} · ${label}${dni}</span>
          </span>
          <button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="Wrk.delDoc('${d.id}')">${Icon('x', 15)}</button>
        </div>`;
      };

      // Smieme ho nasadiť? Stavba je striktnejšia než dielňa, tak sa
      // posudzuje podľa nej — kto prejde na stavbu, prejde všade.
      const ready = DanubraDocs.readiness({
        docs, workType: 'construction', regulated: !!w.regulated_trade, today,
      });

      // Môžeme od neho prijať faktúru? Iná otázka než nasadenie a v praxi sa
      // na ňu zabúda — človek odrobí mesiac a potom sa zistí, že nevieme,
      // na koho faktúru zaúčtovať.
      const billing = isTrade ? DanubraDocs.billingReady(w) : null;

      const billingRows = isTrade ? [
        ['Meno na živnosti', w.company_name],
        ['IČO', w.company_id], ['DIČ', w.tax_id],
        ['IČ DPH', w.vat_id], ['Platiteľ DPH', w.vat_payer ? 'Áno' : 'Nie'],
        ['Adresa podnikania', [w.business_address, w.business_zip, w.business_city]
          .filter(Boolean).join(', ') || null],
        ['IBAN', w.bank_iban],
        ['Živnosť od', w.trade_licence_from ? UI.date(w.trade_licence_from) : null],
        ['Odbory', (w.trade_licence_scopes || []).join(', ') || null],
      ].filter(r => r[1] != null && r[1] !== '') : [];

      const body = `
        <div class="detail-head">
          ${this.statusBadge(w.status)}
          <select class="verif-sel" onchange="Wrk.setStatus('${w.id}',this.value)">
            ${STATUS.map(s => `<option value="${s[0]}" ${w.status === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('')}
          </select>
        </div>
        ${CommPanel.render({ contact: { phone: w.phone, email: w.email, whatsapp: w.whatsapp, name: w.full_name }, entity: { type: 'worker', id: w.id } })}

        <div class="form-section">Smieme ho nasadiť?</div>
        ${Shell.blocker({
          reasons: [...ready.reasons, ...ready.warnings],
          overrides: this.overridesOf(w.id),
          onOverride: `Wrk.grantOverride('${w.id}')`,
          okHtml: '<p style="margin:6px 0 0;font-size:13px;color:var(--ink-sub);">'
            + 'Doklady na stavbu sú v poriadku.</p>',
        })}
        ${this.overridesHtml(w.id)}

        <div class="kv">${rows.map(r => `<div><span>${r[0]}</span><strong>${UI.esc(r[1])}</strong></div>`).join('')}</div>
        ${(w.skills || []).length ? `<div class="chips">${w.skills.map(x => `<span class="chip">${UI.esc(x)}</span>`).join('')}</div>` : ''}
        ${w.notes ? `<div class="notebox">${UI.esc(w.notes)}</div>` : ''}

        ${isTrade ? `
        <div class="form-section">Fakturačné údaje živnosti</div>
        ${billing.ok
          ? '<div class="regimebox" style="margin:0 0 10px;">Údaje sú komplet — jeho faktúru vieme zaúčtovať.</div>'
          : Shell.blocker({ reasons: [...billing.reasons, ...billing.warnings] })}
        ${billingRows.length
          ? `<div class="kv">${billingRows.map(r => `<div><span>${r[0]}</span><strong>${UI.esc(r[1])}</strong></div>`).join('')}</div>`
          : ''}` : ''}

        <div class="form-section">História nasadení</div>
        <div id="wrk-history">${UI.loading()}</div>

        <div class="form-section">Doklady a platnosti</div>
        ${docs.length ? docs.map(docRow).join('')
          : '<div style="color:var(--ink-mute);font-size:13px;">Žiadne doklady — bez platného A1 sa nesmie vyslať.</div>'}
        <button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="Wrk.addDoc('${w.id}')">${Icon('plus')} Pridať doklad</button>

        <div class="modal-actions">
          <button class="btn btn-danger btn-sm" onclick="Wrk.del('${w.id}')">Zmazať</button>
          <button class="btn btn-outline btn-sm" onclick="Wrk.form('${w.id}')">Upraviť</button>
        </div>`;
      UI.modal(w.full_name, body, { wide: true });
      this.renderHistory(id);
    },

    async renderHistory(workerId) {
      const box = document.getElementById('wrk-history');
      if (!box) return;
      const rows = await this.history(workerId);
      box.innerHTML = rows.length ? rows.map(a => `
        <div class="list-row" style="cursor:default;">
          <span class="dot ${a.status === 'active' ? 'green' : ''}"></span>
          <span style="flex:1;font-size:13px;">
            <strong>${UI.esc(a.sub?.title || 'Zákazka')}</strong>
            ${a.role === 'predak' ? UI.badge('predák', 'blue') : ''}
            <span style="display:block;color:var(--ink-mute);font-size:12px;">
              ${a.date_from ? UI.dateRange(a.date_from, a.date_to) : ''}
              ${a.sub?.site_city ? ` · ${UI.esc(a.sub.site_city)}` : ''}
              ${a.charge_rate ? ` · ${UI.money(a.charge_rate)}/h` : ''}</span>
          </span>
        </div>`).join('')
        : '<div style="color:var(--ink-mute);font-size:13px;">Zatiaľ žiadne nasadenie.</div>';
    },

    /** Ako dlho už s nami spolupracuje. */
    cooperationLength(w) {
      if (!w.cooperating_since) return null;
      const days = Math.floor((Date.now() - new Date(w.cooperating_since)) / 86400000);
      if (days < 31) return `${days} dní`;
      const months = Math.floor(days / 30.44);
      if (months < 12) return `${months} ${months === 1 ? 'mesiac' : months < 5 ? 'mesiace' : 'mesiacov'}`;
      const years = Math.floor(months / 12), rest = months % 12;
      return `${years} ${years === 1 ? 'rok' : years < 5 ? 'roky' : 'rokov'}${rest ? ` a ${rest} mes.` : ''}`;
    },

    /** História nasadení pracovníka. */
    async history(workerId) {
      const [{ data: asg }, { data: subs }] = await Promise.all([
        DB.list('assignments', { filters: { worker_id: workerId }, limit: 200 }),
        DB.list('subcontracts', { select: 'id,title,site_city,contract_number', limit: 500 }),
      ]);
      const byId = new Map((subs || []).map(s => [s.id, s]));
      return (asg || []).map(a => ({ ...a, sub: byId.get(a.subcontract_id) }))
        .sort((x, y) => String(y.date_from || '').localeCompare(String(x.date_from || '')));
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
            ${UI.field('legal_form', 'Forma spolupráce', { value: w.legal_form || 'employee',
              options: [['employee', 'Zamestnanec (mzda + odvody)'], ['szco', 'Živnostník (fakturuje nám)']] })}
            ${UI.field('hourly_cost', 'Sadzba živnostníka €/h', { type: 'number', value: w.hourly_cost })}
            ${UI.field('cooperating_since', 'Spolupracuje od', { type: 'date', value: w.cooperating_since })}
            ${UI.field('source', 'Zdroj', { value: w.source, placeholder: 'odporúčanie, profesia.sk…' })}
          </div>
          <div class="form-section">Fakturačné údaje živnosti</div>
          <div class="regimebox" style="margin:0 0 12px;">
            Bez IČO, IBAN-u a adresy sa jeho faktúra nedá zaúčtovať ani zapísať
            do SuperFaktúry. Platí len pri živnostníkovi.</div>
          <div class="form-grid">
            ${UI.field('company_name', 'Meno na živnosti', { value: w.company_name,
              placeholder: 'ak sa líši od mena človeka' })}
            ${UI.field('company_id', 'IČO', { value: w.company_id, placeholder: '12345678' })}
            ${UI.field('tax_id', 'DIČ', { value: w.tax_id })}
            ${UI.field('vat_id', 'IČ DPH', { value: w.vat_id, placeholder: 'SK1020304050' })}
            ${UI.field('bank_iban', 'IBAN', { value: w.bank_iban })}
            ${UI.field('business_address', 'Adresa podnikania', { value: w.business_address })}
            ${UI.field('business_zip', 'PSČ', { value: w.business_zip })}
            ${UI.field('business_city', 'Mesto', { value: w.business_city })}
            ${UI.field('trade_licence_from', 'Živnosť od', { type: 'date', value: w.trade_licence_from })}
            ${UI.field('scopes_csv', 'Odbory zo živnosti (čiarkou)', {
              value: (w.trade_licence_scopes || []).join(', '),
              placeholder: 'suché stavby, obklady' })}
          </div>
          <div class="chk-row">
            ${UI.field('whatsapp', '', { type: 'checkbox', value: w.whatsapp, placeholder: 'Má WhatsApp' })}
            ${UI.field('driving_licence', '', { type: 'checkbox', value: w.driving_licence, placeholder: 'Vodičský preukaz' })}
            ${UI.field('own_tools', '', { type: 'checkbox', value: w.own_tools, placeholder: 'Vlastné náradie' })}
            ${UI.field('regulated_trade', '', { type: 'checkbox', value: w.regulated_trade, placeholder: 'Regulované remeslo (§9 HwO)' })}
            ${UI.field('vat_payer', '', { type: 'checkbox', value: w.vat_payer, placeholder: 'Platiteľ DPH' })}
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
      ['gross_monthly', 'per_diem_daily', 'hourly_cost'].forEach(k => { payload[k] = d[k] === '' ? null : Number(d[k]); });
      // Prázdny dátum musí ísť do databázy ako null, nie ako prázdny reťazec.
      ['cooperating_since', 'available_from', 'trade_licence_from']
        .forEach(k => { if (payload[k] === '') payload[k] = null; });
      payload.skills = (d.skills_csv || '').split(',').map(s => s.trim()).filter(Boolean);
      payload.trade_licence_scopes = (d.scopes_csv || '').split(',').map(s => s.trim()).filter(Boolean);
      delete payload.skills_csv;
      delete payload.scopes_csv;
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
            ${UI.field('kind', 'Typ dokladu', { value: 'a1', options: this.docKinds() })}
            ${UI.field('reference', 'Číslo / referencia', {})}
            ${UI.field('valid_from', 'Platí od', { type: 'date' })}
            ${UI.field('valid_to', 'Platí do', { type: 'date' })}
            ${UI.field('notify_days_before', 'Upozorniť dní dopredu', { type: 'number',
              value: '', placeholder: 'podľa typu dokladu' })}
          </div>
          ${UI.field('notes', 'Poznámka', { type: 'textarea' })}
          <div class="regimebox">A1 vystavuje Sociálna poisťovňa do 45 dní a platí najviac 24 mesiacov —
          preto sa naň upozorňuje 60 dní dopredu, nie 30. Prázdne pole znamená
          predvolený horizont podľa typu dokladu.</div>
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
        // Prázdne pole = nech platí predvolený horizont podľa typu dokladu.
        notify_days_before: d.notify_days_before === '' ? DanubraDocs.horizonOf({ kind: d.kind })
          : Number(d.notify_days_before),
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


  // ── Výnimky z blokátorov ────────────────────────────────────────────────
  // Admin smie obísť pravidlo, ale musí povedať prečo — a zostane to zapísané.
  // Bez toho by „výnimka" znamenala, že pravidlo neexistuje.
  //
  // Výnimka sa nemaže. Zrušenie je `revoked_at`, takže je aj po roku vidieť,
  // že sa raz povolila a kedy prestala platiť. Drží to RLS (migrácia 013).
  Object.assign(Wrk, {
    overridesHtml(workerId) {
      const list = this.overridesOf(workerId);
      if (!list.length) return '';
      const today = new Date().toISOString().slice(0, 10);
      const row = (o) => {
        const dead = o.revoked_at || (o.valid_until && o.valid_until < today);
        return `<div class="note${dead ? '' : ' note-live'}">
          <div class="note-meta">
            <b>${UI.esc(Enums.label('override_rule', o.rule_key))}</b>
            <span>${o.granted_at ? UI.date(o.granted_at) : ''}</span>
            ${o.revoked_at ? `<em>zrušená ${UI.date(o.revoked_at)}</em>`
              : o.valid_until ? `<em>platí do ${UI.date(o.valid_until)}${
                  o.valid_until < today ? ' — uplynula' : ''}</em>`
              : '<em>platí</em>'}
          </div>
          <div class="note-body">${UI.esc(o.reason)}</div>
          ${!dead ? `<button class="btn btn-ghost btn-sm" style="margin-top:6px;color:var(--red);"
            onclick="Wrk.revokeOverride('${o.id}','${workerId}')">Zrušiť výnimku</button>` : ''}
        </div>`;
      };
      return `
        <div class="form-section">Zapísané výnimky</div>
        <div class="regimebox" style="margin:0 0 10px;">
          Výnimka sa nemaže. Zrušenie sa zapíše, takže je aj po roku vidieť,
          že sa raz povolila.</div>
        <div class="notes-list">${list.map(row).join('')}</div>`;
    },

    /**
     * Zapíše výnimku. Dôvod aj pravidlo sa berú z blokátora — nie z voľného
     * textu, aby sa dalo dohľadať, ktoré pravidlo sa obchádza najčastejšie.
     */
    async grantOverride(workerId) {
      const w = this.items.find(x => x.id === workerId);
      if (!w) return;
      const box = document.getElementById('ovr-reason');
      const reason = box ? box.value : '';
      if (!Shell.reasonValid(reason)) {
        return UI.toast(`Dôvod musí mať aspoň ${Shell.REASON_MIN} znakov`, 'err');
      }

      const ready = DanubraDocs.readiness({
        docs: this.docsOf(workerId), workType: 'construction',
        regulated: !!w.regulated_trade,
      });
      const open = ready.reasons.filter(r =>
        !this.overridesOf(workerId).some(o => o.rule_key === r.rule && !o.revoked_at));
      if (!open.length) return UI.toast('Niet čo povoliť — nič neblokuje', 'err');

      // Povolí sa všetko, čo práve blokuje. Povoliť to po jednom by znamenalo
      // písať ten istý dôvod päťkrát.
      const rows = open.map(r => ({
        entity_type: 'worker', entity_id: workerId,
        rule_key: r.rule, reason: reason.trim(),
      }));
      const { error } = await DB.from('overrides').insert(rows);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');

      UI.toast(`Zapísaná výnimka na ${open.length} ${
        open.length === 1 ? 'pravidlo' : open.length < 5 ? 'pravidlá' : 'pravidiel'}`, 'ok');
      this.loaded = false; await this.load(); this.detail(workerId);
    },

    async revokeOverride(id, workerId) {
      if (!confirm('Zrušiť túto výnimku?\n\nZáznam zostane v histórii.')) return;
      const { error } = await DB.update('overrides', id, {
        revoked_at: new Date().toISOString(),
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast('Výnimka zrušená, záznam zostal', 'ok');
      this.loaded = false; await this.load(); this.detail(workerId);
    },
  });

  window.Wrk = Wrk;
  Danubra.views.workers = function (el) { return Wrk.view(el); };
})();
