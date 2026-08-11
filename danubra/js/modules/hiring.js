// ============================================================================
// DANUBRA — Náborový plán: koho, koľko, kam, za koľko a čo si overím
// ============================================================================
// Nábor sa nezačína inzerátom, ale rozhodnutím. Sprievodca vedie piatimi
// krokmi a nepustí ďalej, kým nie je jasné, či sa to vôbec oplatí:
//   1. koho a koľko   2. kam a kedy   3. za koľko   4. čo overím   5. kde zverejním
//
// Krok 3 počíta maržu naživo a kontroluje stavebnú minimálnu mzdu — pod ňu
// sa ísť nedá ani cez živnosť.
// ============================================================================
(function () {
  const S = window.DanubraScreening;

  const STATUS = {
    draft: ['Rozpracovaný', 'gray'], active: ['Beží', 'green'],
    paused: ['Pozastavený', 'amber'], done: ['Uzavretý', 'blue'],
    cancelled: ['Zrušený', 'red'],
  };
  const CHANNELS = [
    ['referral', 'Odporúčania od našich ľudí'], ['meta_ads', 'Meta reklama'],
    ['facebook', 'Facebook skupiny'], ['profesia', 'Profesia.sk'],
    ['tiktok', 'TikTok'], ['web', 'Web a Google'],
  ];

  const Hire = {
    plans: [], trades: [], questions: [], candidates: [], subcontracts: [],
    loaded: false, step: 1, editing: null,

    async load() {
      const [p, t, q, c, s] = await Promise.all([
        DB.list('recruitment_plans', { order: { column: 'created_at', ascending: false }, limit: 200 }),
        DB.list('trades', { order: { column: 'sort_order', ascending: true }, limit: 100 }),
        DB.list('screening_questions', { order: { column: 'sort_order', ascending: true }, limit: 500 }),
        DB.list('candidates', { select: 'id,full_name,plan_id,status,screening_score,screening_verdict', limit: 500 }),
        DB.list('subcontracts', { select: 'id,title,city,number', limit: 200 }),
      ]);
      this.plans = p.data || []; this.trades = t.data || []; this.questions = q.data || [];
      this.candidates = c.data || []; this.subcontracts = s.data || [];
      this.loaded = true;
    },

    trade(key) { return this.trades.find(t => t.key === key); },
    tradeName(key) { return this.trade(key)?.name_sk || key || '—'; },
    badge(s) { const m = STATUS[s] || STATUS.draft; return UI.badge(m[0], m[1]); },

    /** Otázky, ktoré na tomto remesle platia: univerzálne + odborné. */
    questionsFor(tradeKey) {
      return this.questions
        .filter(q => q.active !== false && (!q.trade_key || q.trade_key === tradeKey))
        .sort((a, b) => (a.trade_key ? 1 : 0) - (b.trade_key ? 1 : 0) || (a.sort_order || 0) - (b.sort_order || 0));
    },

    progress(plan) {
      return S.planProgress({ ...plan, screening_count: this.questionsFor(plan.trade_key).length });
    },

    // ── Zoznam ────────────────────────────────────────────────────────────
    async view(el) {
      Danubra.setActions(`<button class="btn btn-primary btn-sm" onclick="Hire.wizard()">${Icon('plus')} Nový nábor</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }

      const active = this.plans.filter(p => p.status === 'active');
      const need = active.reduce((s, p) => s + (p.headcount || 0), 0);
      const placed = active.reduce((s, p) =>
        s + this.candidates.filter(c => c.plan_id === p.id && ['ready', 'placed'].includes(c.status)).length, 0);
      const margins = active.map(p => S.planMargin(p).marginPerHour).filter(x => x > 0);
      const avgMargin = margins.length ? (margins.reduce((a, b) => a + b, 0) / margins.length) : 0;

      el.innerHTML = Danubra.header('Náborové plány',
        `${active.length} ${active.length === 1 ? 'beží' : 'beží'} · treba ${need} ľudí · zatiaľ ${placed}`) + `

        <div class="kpi-grid" style="margin-bottom:16px;">
          <div class="kpi"><div class="kpi-label">Bežiace nábory</div>
            <div class="kpi-value">${active.length}</div>
            <div class="kpi-delta">${this.plans.length} celkovo</div></div>
          <div class="kpi"><div class="kpi-label">Koľko ľudí treba</div>
            <div class="kpi-value">${need}</div>
            <div class="kpi-delta ${placed < need ? 'warn' : ''}">${placed} z toho máme</div></div>
          <div class="kpi"><div class="kpi-label">Priemerná marža</div>
            <div class="kpi-value" style="color:${avgMargin >= 6 ? 'var(--green)' : 'var(--amber)'};">
              ${avgMargin ? avgMargin.toFixed(1) + ' €/h' : '—'}</div>
            <div class="kpi-delta">na človeka a hodinu</div></div>
          <div class="kpi"><div class="kpi-label">Remeslá v ponuke</div>
            <div class="kpi-value">${this.trades.filter(t => t.active !== false).length}</div>
            <div class="kpi-delta"><a href="#/trades" style="color:inherit;">otvoriť príručku</a></div></div>
        </div>

        ${this.plans.length === 0
          ? UI.empty('zap', 'Zatiaľ žiadny náborový plán',
              'Povedz systému, koho a koľko potrebuješ — zvyšok ťa prevedie krok za krokom.',
              `<button class="btn btn-primary" onclick="Hire.wizard()">${Icon('plus')} Nový nábor</button>`)
          : this.plans.map(p => this.row(p)).join('')}`;
    },

    row(p) {
      const pr = this.progress(p);
      const m = S.planMargin(p);
      const mine = this.candidates.filter(c => c.plan_id === p.id);
      const done = mine.filter(c => ['ready', 'placed'].includes(c.status)).length;
      return `<div class="list-row" onclick="Hire.detail('${p.id}')" style="align-items:flex-start;">
        <span class="dot ${p.status === 'active' ? 'green' : p.status === 'paused' ? 'amber' : ''}" style="margin-top:5px;"></span>
        <span style="flex:1;font-size:13px;">
          <strong>${UI.esc(p.title)}</strong>
          <span style="color:var(--ink-mute);"> · ${this.tradeName(p.trade_key)} × ${p.headcount}</span>
          <span style="display:block;color:var(--ink-mute);font-size:12px;">
            ${p.city ? UI.esc(p.city) + ' · ' : ''}${p.start_date ? 'nástup ' + UI.date(p.start_date) + ' · ' : ''}
            ${m.marginPerHour ? `marža ${m.marginPerHour} €/h · ` : ''}${done}/${p.headcount} ľudí
            ${pr.ready ? '' : ` · ${Icon('alert', 11)} chýba: ${pr.next.title.toLowerCase()}`}</span>
        </span>
        ${this.badge(p.status)}
      </div>`;
    },

    // ── Sprievodca ────────────────────────────────────────────────────────
    wizard(id, step) {
      this.editing = id ? { ...this.plans.find(p => p.id === id) } : {
        title: '', trade_key: '', headcount: 1, skill_level: 'fachwerker', legal_form: 'szco',
        country: 'DE', accommodation_provided: true, transport_provided: false,
        advance_possible: false, channels: [], status: 'draft', step: 1,
      };
      this.step = step || this.editing.step || 1;
      UI.modal(id ? 'Nábor krok za krokom' : 'Nový nábor', this.wizardHtml(), { wide: true });
    },

    wizardHtml() {
      const p = this.editing;
      const pr = this.progress(p);
      const steps = S.PLAN_STEPS;
      return `
        <div class="pillbar" style="margin-bottom:16px;flex-wrap:wrap;">
          ${steps.map(s => {
            const st = pr.steps.find(x => x.step === s.step);
            return `<button type="button" class="pill${this.step === s.step ? ' active' : ''}"
              onclick="Hire.goStep(${s.step})">${st.done ? Icon('check', 12) : `${s.step}.`} ${s.title}</button>`;
          }).join('')}
        </div>
        <div id="wiz-body">${this.stepHtml()}</div>`;
    },

    goStep(n) {
      this._collect();
      this.step = n;
      const b = document.getElementById('wiz-body');
      if (b) b.innerHTML = this.stepHtml();
      document.querySelectorAll('#ui-modal .pill').forEach((el, i) =>
        el.classList.toggle('active', i === n - 1));
    },

    /** Prečíta, čo je vo formulári kroku, aby sa nič nestratilo pri preklikaní. */
    _collect() {
      const f = document.getElementById('wiz-form');
      if (!f) return;
      const d = UI.formData(f);
      const num = k => (d[k] === '' || d[k] == null ? null : Number(d[k]));
      const p = this.editing;
      if ('title' in d) p.title = d.title;
      if ('trade_key' in d) p.trade_key = d.trade_key;
      if ('headcount' in d) p.headcount = num('headcount') || 1;
      if ('skill_level' in d) p.skill_level = d.skill_level;
      if ('legal_form' in d) p.legal_form = d.legal_form;
      if ('subcontract_id' in d) p.subcontract_id = d.subcontract_id || null;
      if ('city' in d) p.city = d.city;
      if ('country' in d) p.country = d.country;
      if ('start_date' in d) p.start_date = d.start_date || null;
      if ('deadline' in d) p.deadline = d.deadline || null;
      if ('offer_rate' in d) p.offer_rate = num('offer_rate');
      if ('client_rate' in d) p.client_rate = num('client_rate');
      if ('budget' in d) p.budget = num('budget');
      if ('accommodation_provided' in d) p.accommodation_provided = !!d.accommodation_provided;
      if ('transport_provided' in d) p.transport_provided = !!d.transport_provided;
      if ('advance_possible' in d) p.advance_possible = !!d.advance_possible;
      if ('ad_text' in d) p.ad_text = d.ad_text;
      if ('notes' in d) p.notes = d.notes;
      const ch = [...(f.querySelectorAll('input[data-channel]:checked') || [])].map(x => x.dataset.channel);
      if (f.querySelector('input[data-channel]')) p.channels = ch;
    },

    stepHtml() {
      const p = this.editing;
      const t = this.trade(p.trade_key);
      const nav = (back, next, last) => `
        <div class="modal-actions">
          ${back ? `<button type="button" class="btn btn-ghost" onclick="Hire.goStep(${back})">Späť</button>` : ''}
          <button type="button" class="btn btn-outline" onclick="Hire.savePlan(false)">Uložiť rozpracované</button>
          ${last
            ? `<button type="button" class="btn btn-primary" onclick="Hire.savePlan(true)">${Icon('zap')} Spustiť nábor</button>`
            : `<button type="button" class="btn btn-primary" onclick="Hire.goStep(${next})">Ďalej ${Icon('chevron', 14)}</button>`}
        </div>`;

      if (this.step === 1) {
        return `<form id="wiz-form" onsubmit="return false;">
          <div class="form-grid">
            ${UI.field('trade_key', 'Aké remeslo', { value: p.trade_key, required: true,
              options: [['', '— vyber remeslo —'], ...this.trades.map(t => [t.key, t.name_sk])] })}
            ${UI.field('headcount', 'Koľko ľudí', { type: 'number', value: p.headcount || 1 })}
            ${UI.field('skill_level', 'Zaradenie', { value: p.skill_level, options: [
              ['werker', 'Werker (LG1) — pomocné práce'], ['fachwerker', 'Fachwerker (LG2) — remeselník']] })}
            ${UI.field('legal_form', 'Forma spolupráce', { value: p.legal_form, options: [
              ['szco', 'Živnostník (fakturuje nám)'], ['employee', 'Zamestnanec (mzda + odvody)']] })}
          </div>
          ${UI.field('title', 'Ako si nábor pomenujem', { value: p.title,
            placeholder: 'napr. Sadrokartón München — marec' })}
          <div style="margin-top:8px;">
            <button type="button" class="btn btn-outline btn-sm"
              onclick="Hire.reloadTrade()">${Icon('repeat')} Načítať príručku k remeslu</button>
          </div>
          <div id="trade-card">${this.tradeCard(t)}</div>
          ${nav(null, 2)}
        </form>`;
      }

      if (this.step === 2) {
        return `<form id="wiz-form" onsubmit="return false;">
          <div class="form-grid">
            ${UI.field('subcontract_id', 'Na ktorú zákazku', { value: p.subcontract_id || '',
              options: [['', '— zatiaľ do zásoby —'], ...this.subcontracts.map(s =>
                [s.id, `${s.number ? s.number + ' · ' : ''}${s.title}${s.city ? ' · ' + s.city : ''}`])] })}
            ${UI.field('city', 'Mesto', { value: p.city, required: true, placeholder: 'München' })}
            ${UI.field('country', 'Krajina', { value: p.country || 'DE', options: [['DE', 'Nemecko'], ['AT', 'Rakúsko'], ['SK', 'Slovensko']] })}
            ${UI.field('start_date', 'Nástup', { type: 'date', value: p.start_date })}
            ${UI.field('deadline', 'Dokedy musím mať ľudí', { type: 'date', value: p.deadline })}
          </div>
          <div class="form-section">Čo im ponúkam navyše</div>
          <div class="chk-row">
            ${UI.field('accommodation_provided', '', { type: 'checkbox', value: p.accommodation_provided, placeholder: 'Ubytovanie zabezpečíme' })}
            ${UI.field('transport_provided', '', { type: 'checkbox', value: p.transport_provided, placeholder: 'Doprava zabezpečená' })}
            ${UI.field('advance_possible', '', { type: 'checkbox', value: p.advance_possible, placeholder: 'Možná záloha pred prvou výplatou' })}
          </div>
          <div class="regimebox">Ubytovanie je najsilnejší argument v inzeráte — ľudia sa boja, že skončia
          v aute. Ak ho máš, patrí do prvých troch riadkov.</div>
          ${nav(1, 3)}
        </form>`;
      }

      if (this.step === 3) {
        const m = S.planMargin(p);
        const wage = S.checkOfferRate(p, t);
        return `<form id="wiz-form" onsubmit="return false;">
          <div class="form-grid">
            ${UI.field('offer_rate', 'Čo ponúkam človeku €/h', { type: 'number', value: p.offer_rate,
              placeholder: t ? `${t.rate_worker_min}–${t.rate_worker_max}` : '' })}
            ${UI.field('client_rate', 'Čo fakturujem odberateľovi €/h', { type: 'number', value: p.client_rate,
              placeholder: t ? `${t.rate_client_min}–${t.rate_client_max}` : '' })}
            ${UI.field('budget', 'Rozpočet na reklamu €', { type: 'number', value: p.budget })}
          </div>
          <div style="margin-top:6px;">
            <button type="button" class="btn btn-outline btn-sm" onclick="Hire.recalc()">${Icon('repeat')} Prepočítať</button>
          </div>
          <div id="margin-box">${this.marginBox(p, m, wage, t)}</div>
          ${nav(2, 4)}
        </form>`;
      }

      if (this.step === 4) {
        const qs = this.questionsFor(p.trade_key);
        const hidden = qs.filter(q => q.kind === 'hidden');
        return `<form id="wiz-form" onsubmit="return false;">
          <div class="regimebox">Toto je scenár, podľa ktorého sa budeš pýtať. ${qs.length} otázok,
          z toho <strong>${hidden.length} overovacích</strong> — tie znejú ako bežná odborná otázka,
          ale kandidát netuší, že sa nimi preveruje, či remeslo naozaj robil. Odpovede sa dajú overiť
          a pripraviť sa na ne z inzerátu nedá.</div>
          ${qs.length === 0
            ? `<div class="warnbox" style="margin-top:12px;">${Icon('alert', 14)}
                Najprv vyber remeslo v prvom kroku.</div>`
            : this.questionsPreview(qs)}
          <div style="margin-top:10px;">
            <button type="button" class="btn btn-outline btn-sm"
              onclick="UI.closeModal();Danubra.go('trades')">${Icon('wrench')} Upraviť otázky v príručke</button>
          </div>
          ${nav(3, 5)}
        </form>`;
      }

      // krok 5
      const text = p.ad_text || (t ? S.adText(p, t) : '');
      return `<form id="wiz-form" onsubmit="return false;">
        <div class="form-section">Kde to zverejním</div>
        <div class="chk-row">
          ${CHANNELS.map(([k, label]) => `<label class="chk">
            <input type="checkbox" data-channel="${k}" ${(p.channels || []).includes(k) ? 'checked' : ''}> ${label}</label>`).join('')}
        </div>
        ${UI.field('ad_text', 'Text inzerátu', { type: 'textarea', rows: 14, value: text })}
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-outline btn-sm" onclick="Hire.regenAd()">${Icon('repeat')} Vygenerovať znova</button>
          <button type="button" class="btn btn-outline btn-sm" onclick="Hire.copyAd()">${Icon('copy')} Skopírovať</button>
        </div>
        <div class="regimebox">Odporúčania sú najlacnejší kanál a prinášajú ľudí, ktorí zostanú.
        Ak si ho nezaškrtol, zvyčajne je to premárnená príležitosť — opýtaj sa svojich ľudí.</div>
        ${nav(4, null, true)}
      </form>`;
    },

    tradeCard(t) {
      if (!t) return '';
      const list = (label, arr) => (arr && arr.length)
        ? `<div style="margin-top:8px;"><b style="font-size:12px;color:var(--ink-sub);">${label}</b>
           <ul style="margin:4px 0 0 18px;font-size:12.5px;color:var(--ink-sub);">
           ${arr.map(x => `<li>${UI.esc(x)}</li>`).join('')}</ul></div>` : '';
      return `
        <div class="form-section">Čo mám o remesle vedieť</div>
        ${t.regulated ? `<div class="warnbox">${Icon('alert', 14)} ${UI.esc(t.legal_note || 'Regulované remeslo.')}</div>` : ''}
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
          <b>Reálny denný výkon:</b> ${UI.esc(t.daily_output)}</div>` : ''}`;
    },

    marginBox(p, m, wage, t) {
      return `
        ${!wage.ok && wage.message ? `<div class="warnbox" style="margin-top:12px;">
          ${Icon('alert', 14)} ${UI.esc(wage.message)}</div>` : ''}
        <div class="kpi-grid" style="margin-top:12px;">
          <div class="kpi"><div class="kpi-label">Náklad na hodinu</div>
            <div class="kpi-value">${m.costPerHour || 0} €</div>
            <div class="kpi-delta">${p.legal_form === 'employee' ? 'mzda + odvody' : 'fakturuje živnostník'}</div></div>
          <div class="kpi"><div class="kpi-label">Marža na hodinu</div>
            <div class="kpi-value" style="color:${m.marginPerHour > 0 ? 'var(--green)' : 'var(--red)'};">
              ${m.marginPerHour} €</div>
            <div class="kpi-delta">${m.marginPct} %</div></div>
          <div class="kpi"><div class="kpi-label">Mesačne z tohto náboru</div>
            <div class="kpi-value">${m.monthlyMargin.toLocaleString('sk-SK')} €</div>
            <div class="kpi-delta">${p.headcount} × 174 h</div></div>
        </div>
        ${!m.healthy ? `<div class="warnbox" style="margin-top:12px;">${Icon('alert', 14)}
          Marža pod 15 % neuživí réžiu ani výpadok — pri jednom neodpracovanom týždni si v mínuse.
          ${t ? `Pri tomto remesle sa bežne fakturuje ${t.rate_client_min}–${t.rate_client_max} €/h.` : ''}</div>`
          : `<div class="regimebox" style="margin-top:12px;">Marža je zdravá. Nezabudni, že z nej
             ide ubytovanie, doprava a réžia — počítaj s 2–4 €/h navyše.</div>`}`;
    },

    questionsPreview(qs) {
      const KIND = { knowledge: ['odborná', 'blue'], hidden: ['overovacia', 'brand'],
        legal: ['právna', 'red'], logistics: ['logistika', 'gray'], motivation: ['motivácia', 'amber'] };
      return qs.map(q => {
        const k = KIND[q.kind] || KIND.knowledge;
        return `<div class="list-row" style="cursor:default;align-items:flex-start;">
          <span style="flex:1;font-size:13px;">
            <strong>${UI.esc(q.question_sk)}</strong>
            ${q.good_answer ? `<span style="display:block;color:var(--green);font-size:12px;margin-top:2px;">
              ✓ ${UI.esc(q.good_answer)}</span>` : ''}
            ${q.red_flag_answer ? `<span style="display:block;color:var(--red);font-size:12px;">
              ! ${UI.esc(q.red_flag_answer)}</span>` : ''}
          </span>
          ${UI.badge(k[0], k[1])}${q.weight >= 3 ? UI.badge('kľúčová', 'red') : ''}
        </div>`;
      }).join('');
    },

    reloadTrade() {
      this._collect();
      const box = document.getElementById('trade-card');
      if (box) box.innerHTML = this.tradeCard(this.trade(this.editing.trade_key));
      if (!this.editing.title && this.editing.trade_key) {
        const f = document.querySelector('#wiz-form [name=title]');
        if (f && !f.value) f.value = `${this.tradeName(this.editing.trade_key)} — ${new Date().toLocaleDateString('sk-SK', { month: 'long' })}`;
      }
    },

    recalc() {
      this._collect();
      const p = this.editing, t = this.trade(p.trade_key);
      const box = document.getElementById('margin-box');
      if (box) box.innerHTML = this.marginBox(p, S.planMargin(p), S.checkOfferRate(p, t), t);
    },

    regenAd() {
      this._collect();
      const t = this.trade(this.editing.trade_key);
      if (!t) return UI.toast('Najprv vyber remeslo', 'err');
      const f = document.querySelector('#wiz-form [name=ad_text]');
      if (f) f.value = S.adText(this.editing, t);
    },

    copyAd() {
      const f = document.querySelector('#wiz-form [name=ad_text]');
      if (!f) return;
      navigator.clipboard?.writeText(f.value).then(
        () => UI.toast('Inzerát skopírovaný', 'ok'), () => UI.toast('Nepodarilo sa skopírovať', 'err'));
    },

    async savePlan(activate) {
      this._collect();
      const p = this.editing;
      if (!p.trade_key) { this.goStep(1); return UI.toast('Vyber remeslo', 'err'); }
      if (!p.title) p.title = `${this.tradeName(p.trade_key)} — ${p.city || 'bez miesta'}`;

      if (activate) {
        const pr = this.progress(p);
        if (!pr.ready) { this.goStep(pr.next.step); return UI.toast(`Chýba: ${pr.next.title}`, 'err'); }
        const wage = S.checkOfferRate(p, this.trade(p.trade_key));
        if (!wage.ok) { this.goStep(3); return UI.toast(wage.message, 'err'); }
        p.status = 'active';
      }
      p.step = this.step;

      const payload = { ...p };
      delete payload.id; delete payload.created_at; delete payload.updated_at; delete payload.created_by;
      const res = p.id ? await DB.update('recruitment_plans', p.id, payload)
                       : await DB.insert('recruitment_plans', payload);
      if (res.error) return UI.toast('Chyba: ' + res.error.message, 'err');
      UI.closeModal();
      UI.toast(activate ? 'Nábor beží' : 'Uložené', 'ok');
      await this.load(); Danubra.renderRoute();
    },

    // ── Detail ────────────────────────────────────────────────────────────
    detail(id) {
      const p = this.plans.find(x => x.id === id);
      if (!p) return;
      const t = this.trade(p.trade_key);
      const pr = this.progress(p);
      const m = S.planMargin(p);
      const mine = this.candidates.filter(c => c.plan_id === id);

      UI.modal(p.title, `
        <div class="detail-head">${this.badge(p.status)}
          ${pr.ready ? UI.badge('pripravený', 'green') : UI.badge(`chýba ${pr.total - pr.done} z ${pr.total}`, 'amber')}</div>
        <div class="kv">
          <div><span>Remeslo</span><strong>${this.tradeName(p.trade_key)}</strong></div>
          <div><span>Počet</span><strong>${p.headcount}</strong></div>
          <div><span>Kde</span><strong>${UI.esc(p.city || '—')}</strong></div>
          <div><span>Nástup</span><strong>${p.start_date ? UI.date(p.start_date) : '—'}</strong></div>
          <div><span>Ponúkame</span><strong>${p.offer_rate || '—'} €/h</strong></div>
          <div><span>Fakturujeme</span><strong>${p.client_rate || '—'} €/h</strong></div>
          <div><span>Marža</span><strong style="color:${m.marginPerHour > 0 ? 'var(--green)' : 'var(--red)'};">
            ${m.marginPerHour} €/h · ${m.marginPct} %</strong></div>
          <div><span>Kandidáti</span><strong>${mine.length}</strong></div>
        </div>
        ${!pr.ready ? `<div class="warnbox">${Icon('alert', 14)}
          Ešte chýba: ${pr.steps.filter(s => !s.done).map(s => s.title.toLowerCase()).join(', ')}.</div>` : ''}
        <div class="form-section">Priebeh</div>
        ${pr.steps.map(s => `<div class="list-row" style="cursor:default;">
          <span class="dot ${s.done ? 'green' : ''}"></span>
          <span style="flex:1;font-size:13px;">${s.step}. ${s.title}</span>
          ${s.done ? UI.badge('hotové', 'green') : UI.badge('chýba', 'gray')}</div>`).join('')}
        ${mine.length ? `<div class="form-section">Kandidáti z tohto náboru</div>
          ${mine.map(c => `<div class="list-row" onclick="UI.closeModal();Danubra.go('candidates');setTimeout(()=>Cand.detail('${c.id}'),300)">
            <span style="flex:1;font-size:13px;">${UI.esc(c.full_name)}</span>
            ${c.screening_score != null ? UI.badge(`${Math.round(c.screening_score)} %`,
              c.screening_verdict === 'strong' ? 'green' : c.screening_verdict === 'reject' ? 'red' : 'amber') : UI.badge('bez skríningu', 'gray')}
          </div>`).join('')}` : ''}
        ${t ? this.tradeCard(t) : ''}
        <div class="modal-actions">
          <button class="btn btn-danger btn-sm" onclick="Hire.del('${p.id}')">Zmazať</button>
          ${p.status === 'active'
            ? `<button class="btn btn-outline btn-sm" onclick="Hire.setStatus('${p.id}','done')">Uzavrieť</button>`
            : `<button class="btn btn-outline btn-sm" onclick="Hire.setStatus('${p.id}','active')">Spustiť</button>`}
          <button class="btn btn-primary btn-sm" onclick="Hire.wizard('${p.id}')">${Icon('edit')} Upraviť</button>
        </div>`, { wide: true });
    },

    async setStatus(id, status) {
      await DB.update('recruitment_plans', id, { status });
      const p = this.plans.find(x => x.id === id); if (p) p.status = status;
      UI.closeModal(); UI.toast('Uložené', 'ok'); Danubra.renderRoute();
    },

    async del(id) {
      if (!confirm('Zmazať tento náborový plán?')) return;
      await DB.remove('recruitment_plans', id);
      this.plans = this.plans.filter(x => x.id !== id);
      UI.closeModal(); Danubra.renderRoute();
    },
  };

  window.Hire = Hire;
  Danubra.views.hiring = function (el) { Hire.view(el); };
})();
