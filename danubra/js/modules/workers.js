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
    items: [], docs: [], overrides: [], crews: [], assignments: [], subs: [], loaded: false,
    filters: { status: '', profession: '', q: '' },

    // Ktorý profil je otvorený. Profil je **obrazovka**, nie modálne okno:
    // je na ňom celý človek — doklady, hodiny, zálohy, zárobok, sľuby — a to
    // sa do okna veľkosti dlane nezmestí. Navyše sa naň dá odkázať
    // adresou `#/workers/<id>`.
    openId: null,
    // Dáta, ktoré potrebuje len profil. Načítajú sa až pri jeho otvorení,
    // aby zoznam nečakal na štyri dotazy navyše.
    acc: { workerId: null, bills: [], advances: [], timesheets: [], promises: [], loaded: false },

    async load() {
      // Partie a nasadenia sa načítavajú spolu s ľuďmi zámerne: bez nich je
      // kartotéka len zoznam mien a človek musí inde zisťovať, kde ten človek
      // vlastne je a s kým chodí.
      const [w, d, o, c, a, s] = await Promise.all([
        DB.list('workers', { order: { column: 'created_at', ascending: false }, limit: 500 }),
        DB.list('worker_documents', { limit: 2000 }),
        DB.list('overrides', { filters: { entity_type: 'worker' }, limit: 1000 }),
        DB.list('crews', { select: 'id,name,status', limit: 200 }),
        DB.list('assignments', { select: 'id,worker_id,subcontract_id,crew_id,status,date_from,date_to', limit: 1000 }),
        DB.list('subcontracts', { select: 'id,title,contract_number,partner_id,status,site_city', limit: 300 }),
        Enums.load(),
      ]);
      this.items = w.data || []; this.docs = d.data || [];
      this.overrides = o.data || [];
      this.crews = c.data || []; this.assignments = a.data || []; this.subs = s.data || [];
      this.loaded = true;
    },

    /** Partia, v ktorej človek je teraz. `crew_id` drží trigger v databáze. */
    crewOf(w) { return this.crews.find(c => c.id === w.crew_id) || null; },

    /** Stavba, na ktorej je teraz — z aktívneho nasadenia, nie z domnienky. */
    siteOf(workerId) {
      const a = this.assignments.find(x => x.worker_id === workerId && x.status === 'active');
      return a ? (this.subs.find(s => s.id === a.subcontract_id) || null) : null;
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
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      if (this.openId) return this.profile(el, this.openId);
      Danubra.setActions(`<button class="btn btn-primary btn-sm" onclick="Wrk.form()">${Icon('plus')} Pridať pracovníka</button>`);
      const rows = this.filtered();
      const ready = this.items.filter(w => w.status === 'ready').length;
      const deployed = this.items.filter(w => w.status === 'deployed').length;
      // koľkým chýba alebo končí A1
      const a1Issues = this.items.filter(w => ['deployed', 'ready'].includes(w.status))
        .filter(w => ['missing', 'expired', 'expiring'].includes(this.docStatus(w.id).state)).length;

      // Nadpis sa musí volať rovnako ako položka v menu. Keď menu hovorí
      // „Živnostníci" a obrazovka „Pracovníci", človek nevie, či je tam, kam
      // klikol.
      el.innerHTML = Danubra.header(Danubra.labelOf('workers'),
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
      const crew = this.crewOf(w);
      const site = this.siteOf(w.id);
      const rate = w.legal_form === 'szco' ? w.hourly_cost : null;

      // Partia a stavba sú odkazy, nie text. Toto je ten rozdiel medzi
      // kartotékou a appkou, v ktorej sa dá pohybovať.
      const links = [
        crew ? Danubra.link('crew', crew.id, crew.name) : '',
        site ? Danubra.link('subcontract', site.id, site.title || site.contract_number) : '',
      ].filter(Boolean).join('');

      return `
        <div class="acc-card card" onclick="Wrk.detail('${w.id}')">
          <div class="acc-card-head">
            <div style="min-width:0;">
              <div class="acc-name">${UI.esc(w.full_name)}</div>
              <div class="acc-loc">${this.professionLabel(w.profession)}${w.skill_level ? ` · ${w.skill_level === 'fachwerker' ? 'LG2' : 'LG1'}` : ''}${w.city ? ` · ${UI.esc(w.city)}` : ''}</div>
            </div>
            ${this.statusBadge(w.status)}
          </div>
          ${links ? `<div class="link-row" style="margin-bottom:9px;">${links}</div>` : ''}
          <div class="acc-meta">
            ${w.phone ? `<span>${Icon('phone', 14)} ${UI.esc(w.phone)}</span>` : ''}
            ${rate ? `<span>${Icon('euro', 14)} ${UI.money(rate)} / h</span>` : ''}
            ${!rate && w.gross_monthly ? `<span>${Icon('euro', 14)} ${UI.money(w.gross_monthly)}</span>` : ''}
            ${w.available_from ? `<span>${Icon('calendar', 14)} od ${UI.date(w.available_from)}</span>` : ''}
            ${a1Warn ? `<span style="color:var(--${a1Warn === 'red' ? 'red' : 'amber'});font-weight:700;">
              ${Icon('alert', 14)} A1 ${ds.state === 'missing' ? 'chýba' : ds.state === 'expired' ? 'neplatné' : 'končí'}</span>` : ''}
          </div>
        </div>`;
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    // ── Profil ────────────────────────────────────────────────────────────
    // `detail()` zostáva ako vstupný bod, lebo naň odkazuje celá appka
    // (Danubra.entities, partie, úlohy, prehľad). Neotvára však okno —
    // prepne obrazovku na profil.
    async detail(id) {
      if (!this.items.find(x => x.id === id)) {
        if (!this.loaded) await this.load();
        if (!this.items.find(x => x.id === id)) return UI.toast('Nenájdené', 'err');
      }
      this.openId = id;
      this.acc = { workerId: null, bills: [], advances: [], timesheets: [], promises: [], loaded: false };
      if (Danubra.route !== 'workers') { Danubra.go('workers'); return; }
      // Adresa nech sedí s tým, čo je na obrazovke, aby sa dala poslať.
      try { history.replaceState(null, '', `#/workers/${id}`); } catch {}
      return Danubra.renderRoute();
    },

    /** Späť na zoznam. */
    closeProfile() {
      this.openId = null;
      try { history.replaceState(null, '', '#/workers'); } catch {}
      Danubra.renderRoute();
    },

    /** Dáta, ktoré potrebuje len profil. */
    async loadAccount(workerId) {
      const [b, a, t, p] = await Promise.all([
        DB.list('bills', { filters: { worker_id: workerId },
          order: { column: 'issue_date', ascending: false }, limit: 300 }),
        DB.list('advances', { filters: { worker_id: workerId },
          order: { column: 'paid_on', ascending: false }, limit: 300 }),
        DB.list('timesheets', { filters: { worker_id: workerId },
          order: { column: 'work_date', ascending: false }, limit: 1000 }),
        DB.list('promises', { filters: { subject_type: 'worker', subject_id: workerId },
          order: { column: 'created_at', ascending: false }, limit: 200 }),
      ]);
      this.acc = {
        workerId, bills: b.data || [], advances: a.data || [],
        timesheets: t.data || [], promises: p.data || [], loaded: true,
      };
    },

    /**
     * Celý človek na jednej obrazovke: smieme ho nasadiť, čo odrobil, čo mu
     * dlhujeme, aké má doklady, čo sme mu sľúbili a kde je.
     */
    async profile(el, id) {
      const w = this.items.find(x => x.id === id);
      if (!w) { this.openId = null; return UI.toast('Nenájdené', 'err'); }
      const docs = this.docsOf(id);
      const today = new Date().toISOString().slice(0, 10);
      const isTrade = w.legal_form === 'szco';

      Danubra.setActions(`
        <button class="btn btn-ghost btn-sm" onclick="Wrk.closeProfile()">${Icon('back', 15)} Späť</button>
        <button class="btn btn-outline btn-sm" onclick="Wrk.form('${w.id}')">${Icon('edit', 14)} Upraviť</button>`);

      // Účet sa načíta až tu — zoznam ľudí naň nečaká.
      if (!this.acc.loaded || this.acc.workerId !== id) {
        el.innerHTML = Danubra.header(w.full_name, '', '', [w.full_name]) + UI.loading();
        await this.loadAccount(id);
        if (this.openId !== id) return;            // medzitým sa prepol iný človek
      }

      const crew = this.crewOf(w);
      const site = this.siteOf(w.id);
      const acct = DanubraAccount.summary({
        worker: w, assignments: this.assignments.filter(a => a.worker_id === id),
        timesheets: this.acc.timesheets, bills: this.acc.bills,
        advances: this.acc.advances, today,
      });
      const head = DanubraAccount.headline(acct);

      // Smieme ho nasadiť? Stavba je striktnejšia než dielňa, tak sa
      // posudzuje podľa nej — kto prejde na stavbu, prejde všade.
      const ready = DanubraDocs.readiness({
        docs, workType: 'construction', regulated: !!w.regulated_trade, today,
      });
      // Môžeme od neho prijať faktúru? Iná otázka než nasadenie a v praxi sa
      // na ňu zabúda — človek odrobí mesiac a potom sa zistí, že nevieme,
      // na koho faktúru zaúčtovať.
      const billing = isTrade ? DanubraDocs.billingReady(w) : null;

      const sub = [
        this.professionLabel(w.profession),
        w.skill_level ? (w.skill_level === 'fachwerker' ? 'LG2' : 'LG1') : null,
        w.city,
      ].filter(Boolean).map(UI.esc).join(' · ');

      // Tretí argument hlavičky je cesta — vďaka nej sa „Živnostníci"
      // stanú odkazom späť na zoznam aj na mobile, kde horný pruh nie je.
      el.innerHTML = Danubra.header(w.full_name, sub, '', [w.full_name]) + `
        <div class="headline headline-${head.tone === 'bad' ? 'bad' : head.tone === 'warn' ? 'warn' : 'ok'}">
          ${Icon(head.tone === 'bad' ? 'alert' : head.tone === 'warn' ? 'clock' : 'check', 18)}
          <span>${UI.esc(head.text)}</span>
        </div>

        <div class="detail-head">
          ${this.statusBadge(w.status)}
          <select class="verif-sel" onchange="Wrk.setStatus('${w.id}',this.value)">
            ${STATUS.map(s => `<option value="${s[0]}" ${w.status === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('')}
          </select>
          <div class="link-row" style="margin-left:auto;">
            ${crew ? Danubra.link('crew', crew.id, crew.name) : ''}
            ${site ? Danubra.link('subcontract', site.id, site.title || site.contract_number) : ''}
          </div>
        </div>
        ${CommPanel.render({ contact: { phone: w.phone, email: w.email, whatsapp: w.whatsapp, name: w.full_name }, entity: { type: 'worker', id: w.id } })}

        <div class="profile-cols">
          ${this.accountCard(w, acct)}
          ${this.readinessCard(w, ready)}
          ${this.docsCard(w, docs, today)}
          ${this.advancesCard(w, acct)}
          ${this.hoursCard(w, acct)}
          ${this.promisesCard(w)}
          ${isTrade ? this.billingCard(w, billing) : ''}
          ${this.aboutCard(w)}
        </div>

        <div class="form-section">História nasadení</div>
        <div id="wrk-history">${UI.loading()}</div>`;

      this.renderHistory(id);
    },

    /** Koľko mu dlhujeme. Číslo, kvôli ktorému celá karta existuje. */
    accountCard(w, a) {
      const line = (label, cents, extra = '') =>
        `<div><span>${label}</span><strong style="${extra}">${Money.format(cents)}</strong></div>`;
      return `<div class="card card-pad">
        <div class="card-head">
          <div class="card-title">Zárobok a čo mu dlhujeme</div>
          ${a.payable > 0 ? UI.badge('na vyplatenie', 'amber')
            : a.overpaid > 0 ? UI.badge('preplatené', 'red') : UI.badge('vyrovnané', 'green')}
        </div>
        <div class="kv" style="margin:0;">
          ${line('Odrobil (odhad z hodín)', a.earned)}
          ${line('Vyfakturoval', a.billed)}
          ${line('Z toho uhradené', a.paid)}
          ${line('Zálohy nevyrovnané', a.advancesOpen, a.advancesOpen ? 'color:var(--amber);' : '')}
          ${line('Dlhujeme', a.owed, a.owed < 0 ? 'color:var(--red);' : '')}
        </div>
        <p style="margin:10px 0 0;font-size:12.5px;color:var(--ink-mute);">
          „Odrobil" je odhad z hodín a sadzby — záväzok vzniká až jeho faktúrou.
          ${a.disputed ? `Sporných ${Money.format(a.disputed)} sa sem neráta.` : ''}
          ${a.notBilledYet > 0 ? `Nevyfakturoval ešte ${Money.format(a.notBilledYet)}.` : ''}
          ${a.notBilledYet < 0 ? `<strong style="color:var(--amber);">Fakturoval o ${
            Money.format(-a.notBilledYet)} viac, než sedí z hodín.</strong>` : ''}
        </p>
      </div>`;
    },

    readinessCard(w, ready) {
      return `<div class="card card-pad">
        <div class="card-head"><div class="card-title">Smieme ho nasadiť?</div></div>
        ${Shell.blocker({
          reasons: [...ready.reasons, ...ready.warnings],
          overrides: this.overridesOf(w.id),
          onOverride: `Wrk.grantOverride('${w.id}')`,
          okHtml: '<p style="margin:6px 0 0;font-size:13px;color:var(--ink-sub);">'
            + 'Doklady na stavbu sú v poriadku.</p>',
        })}
        ${this.overridesHtml(w.id)}
      </div>`;
    },

    docsCard(w, docs, today) {
      const row = (d) => {
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
        return `<div class="list-row" style="cursor:default;align-items:flex-start;">
          <span class="dot ${color}" style="margin-top:6px;"></span>
          <span style="flex:1;font-size:13px;min-width:0;">
            <strong>${UI.esc(this.docLabel(d.kind))}</strong>
            ${d.reference ? `<span style="color:var(--ink-mute);"> · ${UI.esc(d.reference)}</span>` : ''}
            <span style="color:var(--ink-mute);display:block;font-size:12px;">
              ${d.valid_from ? UI.date(d.valid_from) : '—'} – ${d.valid_to ? UI.date(d.valid_to) : 'bez konca'} · ${label}${dni}</span>
            <span class="link-row" style="margin-top:6px;">
              ${d.storage_path
                ? `<button class="link-chip" onclick="Wrk.openScan('${d.id}')">${Icon('doc', 13)}<span>Otvoriť sken</span></button>`
                : `<label class="link-chip" style="cursor:pointer;">${Icon('upload', 13)}<span>Nahrať sken</span>
                     <input type="file" hidden accept="application/pdf,image/*"
                       onchange="Wrk.uploadScan('${d.id}', this)"></label>`}
            </span>
          </span>
          <button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="Wrk.delDoc('${d.id}')">${Icon('x', 15)}</button>
        </div>`;
      };
      return `<div class="card card-pad">
        <div class="card-head">
          <div class="card-title">Doklady a platnosti</div>
          <button class="btn btn-ghost btn-sm" onclick="Wrk.addDoc('${w.id}')">${Icon('plus', 14)} Pridať</button>
        </div>
        ${docs.length ? docs.map(row).join('')
          : '<div style="color:var(--ink-mute);font-size:13px;">Žiadne doklady — bez platného A1 sa nesmie vyslať.</div>'}
      </div>`;
    },

    advancesCard(w, a) {
      const rows = this.acc.advances;
      const row = (v) => {
        const open = DanubraAccount.isOpenAdvance(v);
        return `<div class="list-row" style="cursor:default;align-items:flex-start;">
          <span class="dot ${v.voided_at ? '' : open ? 'amber' : 'green'}" style="margin-top:6px;"></span>
          <span style="flex:1;font-size:13px;min-width:0;">
            <strong style="${v.voided_at ? 'text-decoration:line-through;opacity:.55;' : ''}">${
              Money.format(Money.toCents(v.amount))}</strong>
            <span style="color:var(--ink-mute);"> · ${UI.date(v.paid_on)} · ${
              UI.esc(Enums.label('advance_method', v.method) || v.method || '')}</span>
            <span style="color:var(--ink-mute);display:block;font-size:12px;">
              ${v.voided_at ? `zrušená — ${UI.esc(v.void_reason || '')}`
                : open ? 'nevyrovnaná — odpočíta sa z najbližšej faktúry'
                : 'vyrovnaná'}${v.note ? ` · ${UI.esc(v.note)}` : ''}</span>
          </span>
          ${open ? `<button class="btn btn-ghost btn-sm" title="Zrušiť zálohu"
            style="color:var(--red);" onclick="Wrk.voidAdvance('${v.id}')">${Icon('x', 15)}</button>` : ''}
        </div>`;
      };
      return `<div class="card card-pad">
        <div class="card-head">
          <div class="card-title">Zálohy</div>
          <button class="btn btn-ghost btn-sm" onclick="Wrk.advanceForm('${w.id}')">${Icon('plus', 14)} Vyplatiť</button>
        </div>
        ${rows.length ? rows.map(row).join('')
          : '<div style="color:var(--ink-mute);font-size:13px;">Žiadna záloha.</div>'}
        ${a.advancesOpen ? `<p style="margin:10px 0 0;font-size:12.5px;color:var(--ink-mute);">
          Nevyrovnané spolu ${Money.format(a.advancesOpen)}. Záloha sa nemaže — omyl sa ruší
          s dôvodom, aby sa dalo dohľadať, čo sa stalo.</p>` : ''}
      </div>`;
    },

    hoursCard(w, a) {
      const rows = this.acc.timesheets.slice(0, 8);
      return `<div class="card card-pad">
        <div class="card-head">
          <div class="card-title">Odpracované hodiny</div>
          <button class="btn btn-ghost btn-sm" onclick="Danubra.go('timesheets')">Všetky</button>
        </div>
        <div class="kv" style="margin:0 0 10px;">
          <div><span>Tento mesiac</span><strong>${a.thisMonth.hours} h · ${Money.format(a.thisMonth.cents)}</strong></div>
          <div><span>Celkom</span><strong>${a.hours} h · ${Money.format(a.earned)}</strong></div>
        </div>
        ${rows.length ? rows.map(t => `
          <div class="list-row" style="cursor:default;">
            <span class="dot ${t.period_id ? 'green' : ''}"></span>
            <span style="flex:1;font-size:13px;">
              <strong>${t.hours} h</strong>
              <span style="color:var(--ink-mute);"> · ${UI.date(t.work_date)}</span>
              <span style="color:var(--ink-mute);display:block;font-size:12px;">
                ${UI.esc(Tms.actMeta(t.activity_type)[1])}${
                  t.period_id ? ' · už zúčtované' : ' · ešte nezúčtované'}</span>
            </span>
          </div>`).join('')
          : '<div style="color:var(--ink-mute);font-size:13px;">Zatiaľ žiadne hodiny.</div>'}
        ${this.acc.timesheets.length > 8 ? `<div style="color:var(--ink-mute);font-size:12.5px;padding:8px 2px 0;">
          a ďalších ${this.acc.timesheets.length - 8}</div>` : ''}
      </div>`;
    },

    /**
     * Čo sme mu sľúbili. Zapisuje sa to pri náborovom hovore (F4 v1)
     * a dovtedy sa to nikde nezobrazovalo — sľub ležal v databáze a nikto
     * ho nevidel. Presne na toto sa zabúda.
     */
    promisesCard(w) {
      const rows = this.acc.promises;
      const KIND = {
        wage: 'mzda', accommodation: 'ubytovanie', start_date: 'nástup',
        transport: 'doprava', per_diem: 'diéty', working_hours: 'pracovný čas',
        equipment: 'náradie', other: 'iné',
      };
      const TONE = { open: 'amber', fulfilled: 'green', broken: 'red', disputed: 'red', cancelled: '' };
      const row = (p) => `
        <div class="list-row" style="cursor:default;align-items:flex-start;">
          <span class="dot ${TONE[p.status] || ''}" style="margin-top:6px;"></span>
          <span style="flex:1;font-size:13px;min-width:0;">
            <strong>${UI.esc(p.statement || '')}</strong>
            <span style="color:var(--ink-mute);display:block;font-size:12px;">
              ${UI.esc(KIND[p.kind] || p.kind || '')}${p.value_text ? ` · ${UI.esc(p.value_text)}` : ''}${
                p.due_date ? ` · do ${UI.date(p.due_date)}` : ''}</span>
          </span>
          ${p.status === 'open' ? `<div style="display:flex;gap:4px;">
            <button class="btn btn-ghost btn-sm" title="Splnené" style="color:var(--green);"
              onclick="Wrk.setPromise('${p.id}','fulfilled')">${Icon('check', 15)}</button>
            <button class="btn btn-ghost btn-sm" title="Nesplnené" style="color:var(--red);"
              onclick="Wrk.setPromise('${p.id}','broken')">${Icon('x', 15)}</button>
          </div>` : UI.badge({ fulfilled: 'splnené', broken: 'nesplnené',
              disputed: 'sporné', cancelled: 'zrušené' }[p.status] || p.status,
              TONE[p.status] || 'gray')}
        </div>`;
      const open = rows.filter(p => p.status === 'open').length;
      return `<div class="card card-pad">
        <div class="card-head">
          <div class="card-title">Čo sme mu sľúbili</div>
          ${open ? UI.badge(`${open} otvorených`, 'amber') : ''}
        </div>
        ${rows.length ? rows.map(row).join('')
          : `<div style="color:var(--ink-mute);font-size:13px;">
               Zatiaľ nič. Sľuby sa zapisujú pri náborovom hovore.</div>`}
      </div>`;
    },

    billingCard(w, billing) {
      const rows = [
        ['Meno na živnosti', w.company_name],
        ['IČO', w.company_id], ['DIČ', w.tax_id],
        ['IČ DPH', w.vat_id], ['Platiteľ DPH', w.vat_payer ? 'Áno' : 'Nie'],
        ['Adresa podnikania', [w.business_address, w.business_zip, w.business_city]
          .filter(Boolean).join(', ') || null],
        ['IBAN', w.bank_iban],
        ['Živnosť od', w.trade_licence_from ? UI.date(w.trade_licence_from) : null],
        ['Odbory', (w.trade_licence_scopes || []).join(', ') || null],
      ].filter(r => r[1] != null && r[1] !== '');
      return `<div class="card card-pad">
        <div class="card-head"><div class="card-title">Fakturačné údaje živnosti</div></div>
        ${billing.ok
          ? '<div class="regimebox" style="margin:0 0 10px;">Údaje sú komplet — jeho faktúru vieme zaúčtovať.</div>'
          : Shell.blocker({ reasons: [...billing.reasons, ...billing.warnings] })}
        ${rows.length
          ? `<div class="kv" style="margin:10px 0 0;">${rows.map(r =>
              `<div><span>${r[0]}</span><strong>${UI.esc(r[1])}</strong></div>`).join('')}</div>`
          : ''}
      </div>`;
    },

    aboutCard(w) {
      const rows = [
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
      return `<div class="card card-pad">
        <div class="card-head"><div class="card-title">O človeku</div></div>
        <div class="kv" style="margin:0;">${rows.map(r =>
          `<div><span>${r[0]}</span><strong>${UI.esc(r[1])}</strong></div>`).join('')}</div>
        ${(w.skills || []).length ? `<div class="chips">${w.skills.map(x => `<span class="chip">${UI.esc(x)}</span>`).join('')}</div>` : ''}
        ${w.notes ? `<div class="notebox">${UI.esc(w.notes)}</div>` : ''}
      </div>`;
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

    // ── Skeny dokladov ────────────────────────────────────────────────────
    // Bucket aj politiky existujú od F7; chýbala len cesta z rozhrania.
    // Súbor ide do privátneho úložiska a von sa dostane výlučne krátkodobo
    // podpísaným odkazom — cesta sa nikdy nedáva do stránky.
    async uploadScan(docId, input) {
      const file = input && input.files && input.files[0];
      if (!file) return;
      const doc = this.docs.find(d => d.id === docId);
      if (!doc) return UI.toast('Doklad sa nenašiel', 'err');

      // Prah drží aj bucket (25 MB), ale povedať to treba skôr, než sa
      // súbor začne posielať cez mobilné dáta.
      if (file.size > 25 * 1024 * 1024) {
        return UI.toast('Súbor má viac než 25 MB — zmenši ho alebo odfoť nanovo.', 'err');
      }
      UI.toast('Nahrávam…');
      const { path, error } = await DB.uploadDoc(file, { folder: 'worker', entityId: doc.worker_id });
      if (error) return UI.toast('Nahrávanie zlyhalo: ' + error.message, 'err');

      const { error: e2 } = await DB.update('worker_documents', docId, { storage_path: path });
      if (e2) {
        // Súbor je nahratý, ale väzba nevznikla — nenechávaj v úložisku smeti.
        await DB.removeDoc(path).catch(() => {});
        return UI.toast('Sken sa nepodarilo priradiť: ' + e2.message, 'err');
      }
      doc.storage_path = path;
      UI.toast('Sken nahratý', 'ok');
      Danubra.renderRoute();
    },

    async openScan(docId) {
      const doc = this.docs.find(d => d.id === docId);
      if (!doc || !doc.storage_path) return UI.toast('Sken tu nie je', 'err');
      const { url, error } = await DB.signedDocUrl(doc.storage_path, 300);
      if (error || !url) return UI.toast('Odkaz sa nepodarilo vytvoriť', 'err');
      window.open(url, '_blank', 'noopener');
    },

    // ── Zálohy ────────────────────────────────────────────────────────────
    advanceForm(workerId) {
      const w = this.items.find(x => x.id === workerId);
      const sites = this.assignments.filter(a => a.worker_id === workerId)
        .map(a => this.subs.find(s => s.id === a.subcontract_id)).filter(Boolean);
      const body = `
        <form id="adv-form" onsubmit="event.preventDefault();Wrk.saveAdvance('${workerId}')">
          <div class="form-grid">
            ${UI.field('amount', 'Suma €', { type: 'number', step: '0.01', required: true, placeholder: '300,00' })}
            ${UI.field('paid_on', 'Vyplatené dňa', { type: 'date',
              value: new Date().toISOString().slice(0, 10) })}
            ${UI.field('method', 'Ako', { value: 'bank',
              options: Enums.options('advance_method') })}
            ${sites.length ? UI.field('subcontract_id', 'Na zákazku', {
              options: [['', '— nepriradené —'],
                ...sites.map(s => [s.id, s.title || s.contract_number])] }) : ''}
          </div>
          ${UI.field('note', 'Poznámka', { type: 'textarea', rows: 2 })}
          <div class="regimebox">Záloha sa odpočíta z najbližšej schválenej faktúry
            od ${UI.esc(w ? w.full_name : 'tohto živnostníka')}. Kým sa tak nestane, znižuje
            to, čo mu dlhujeme — takže sa na ňu nedá zabudnúť.</div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Späť</button>
            <button type="submit" class="btn btn-primary">Zapísať zálohu</button>
          </div>
        </form>`;
      UI.modal('Vyplatiť zálohu', body);
    },

    async saveAdvance(workerId) {
      const d = UI.formData(document.getElementById('adv-form'));
      const amount = Number(String(d.amount).replace(',', '.'));
      if (!(amount > 0)) return UI.toast('Suma musí byť väčšia než nula', 'err');
      const { error } = await DB.insert('advances', {
        worker_id: workerId, amount,
        paid_on: d.paid_on || new Date().toISOString().slice(0, 10),
        method: d.method || 'bank',
        subcontract_id: d.subcontract_id || null,
        note: d.note || null,
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal();
      UI.toast('Záloha zapísaná', 'ok');
      await this.loadAccount(workerId);
      Danubra.renderRoute();
    },

    /**
     * Záloha sa nemaže. Omyl sa ruší s dôvodom, rovnako ako výnimka
     * z blokátora — inak by sa spätne nedalo povedať, čo sa stalo.
     * Prah piatich znakov drží aj CHECK v databáze (migrácia 022).
     */
    async voidAdvance(advanceId) {
      const reason = prompt('Prečo sa záloha ruší? (aspoň 5 znakov — zostane to zapísané)');
      if (reason == null) return;
      if (!Shell.reasonValid(reason)) {
        return UI.toast(`Dôvod musí mať aspoň ${Shell.REASON_MIN} znakov.`, 'err');
      }
      const { error } = await DB.update('advances', advanceId, {
        voided_at: new Date().toISOString(), void_reason: reason.trim(),
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast('Záloha zrušená', 'ok');
      await this.loadAccount(this.openId);
      Danubra.renderRoute();
    },

    // ── Sľuby ─────────────────────────────────────────────────────────────
    async setPromise(promiseId, status) {
      const patch = { status };
      if (status === 'fulfilled') patch.fulfilled_at = new Date().toISOString();
      const { error } = await DB.update('promises', promiseId, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast(status === 'fulfilled' ? 'Označené ako splnené' : 'Označené ako nesplnené', 'ok');
      await this.loadAccount(this.openId);
      Danubra.renderRoute();
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
