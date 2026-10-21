// ============================================================================
// DANUBRA — Možnosti: potenciálne zákazky, ktoré ešte nie sú zákazkami
// ============================================================================
// Príde telefonát: „máme stavbu pri Mníchove, potrebujeme štyroch zváračov."
// Doteraz to žilo v e-maile a v hlave toho, kto to prijal — a keď z toho nič
// nebolo, nikde nezostalo, že to vôbec bolo.
//
// Celá obrazovka je postavená na jednej veci: **prah musí byť nízky**. Kto to
// prijal, nemá dopisovať formulár s pätnástimi poliami. Zapíše názov, čo
// potrebujú a telefón — a zvyšok doplní ten, kto to bude riešiť. Preto má
// formulár štyri polia a všetko ostatné sa dopĺňa až na otvorenej možnosti.
//
// Z možnosti vznikne **nábor** (zadanie sa prenesie a analýza z neho spraví
// podklady, otázky aj polia náboru) alebo **zákazka**, keď sa dohodne.
// ============================================================================
(function () {
  const O = window.DanubraOpp;
  const Inq = window.DanubraInquiry;

  const Opp = {
    items: [], trades: [], loaded: false, openId: null,
    filters: { status: '', q: '' },

    async load() {
      const [o, t] = await Promise.all([
        DB.list('opportunities', { order: { column: 'created_at', ascending: false }, limit: 300 }),
        DB.list('trades', { select: 'key,name_sk', limit: 100 }),
      ]);
      this.items = o.data || [];
      this.trades = t.data || [];
      this.loaded = true;
    },

    tradeName(key) {
      const t = this.trades.find(x => x.key === key);
      if (t) return t.name_sk;
      if (!key) return '—';
      return String(key).charAt(0).toUpperCase() + String(key).slice(1);
    },
    badge(s) { const m = O.status(s); return UI.badge(m[1], m[2]); },

    // Odstránené dopyty (`archived_at`) v zozname ani v počítadlách nie sú —
    // fyzicky sa ale nemažú a dajú sa vrátiť (migrácia 048).
    live() { return this.items.filter(x => !x.archived_at); },
    archived() { return this.items.filter(x => x.archived_at); },

    // ── Zoznam ────────────────────────────────────────────────────────────
    async view(el) {
      Danubra.setActions(`
        <button class="btn btn-outline btn-sm" onclick="Opp.inquiryForm()">
          ${Icon('mail')} Vložiť e-mail</button>
        <button class="btn btn-primary btn-sm" onclick="Opp.form()">
          ${Icon('plus')} Zapísať dopyt</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      if (this.openId) return this.profile(el, this.openId);

      const live = this.live();
      const q = O.nowNext(live, Danubra._dayISO());
      const s = O.summary(live);
      const rows = this.rows();
      const odlozene = this.archived().length;

      el.innerHTML = Danubra.header('Dopyty',
        `${s.live} ${Shell.plural(s.live, 'rozpracovaná', 'rozpracované', 'rozpracovaných')}`
        + (s.rate != null ? ` · úspešnosť ${UI.pct(s.rate)}` : ''))
        + this.nowHtml(q) + `
        <div class="pillbar" style="margin-bottom:12px;width:max-content;max-width:100%;overflow-x:auto;">
          <button class="pill${!this.filters.status ? ' active' : ''}"
            onclick="Opp.setF('status','')">Všetky</button>
          ${O.STATUS.map(st => {
            const n = live.filter(x => x.status === st[0]).length;
            return n ? `<button class="pill${this.filters.status === st[0] ? ' active' : ''}"
              onclick="Opp.setF('status','${st[0]}')">${st[1]} ${n}</button>` : '';
          }).join('')}
          ${odlozene ? `<button class="pill${this.filters.status === '__arch' ? ' active' : ''}"
            onclick="Opp.setF('status','__arch')">${Icon('trash', 12)} Odstránené ${odlozene}</button>` : ''}
        </div>
        ${rows.length === 0
          ? (live.length || this.filters.status === '__arch'
              ? UI.empty('search', 'Filtru nič nesedí', 'Skús iný stav.')
              : UI.empty('offers', 'Zatiaľ žiadne dopyty',
                  'Keď sa niekto ozve, zapíš to sem — aj keď o tom vieš málo. '
                  + 'Dopyt, ktorý nie je zapísaný, neexistuje.',
                  `<button class="btn btn-primary" onclick="Opp.form()">${Icon('plus')} Zapísať dopyt</button>`))
          : `<div class="cards">${rows.map(x => this.card(x)).join('')}</div>`}`;
    },

    rows() {
      const f = this.filters;
      if (f.status === '__arch') {
        return Shell.filterRows(this.archived(), { q: f.q, fields: ['title', 'company_name', 'city'] });
      }
      return Shell.filterRows(this.live(), {
        q: f.q, fields: ['title', 'company_name', 'city'],
        equals: { status: f.status },
      });
    },
    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    nowHtml(n) {
      const kam = n.opp ? `Opp.detail('${n.opp.id}')` : 'Opp.form()';
      const label = { new: 'Otvoriť dopyt', verify: 'Otvoriť a preveriť',
        fill: 'Otvoriť a doplniť', followup: 'Otvoriť ponuku',
        ok: 'Zapísať dopyt' }[n.key] || 'Otvoriť';
      return Shell.now(n, {
        help: 'card.opp.now',
        action: { label, onclick: kam, ico: n.key === 'new' ? 'phone' : 'chevron' },
      });
    },

    card(x) {
      const v = O.verification(x);
      const chyba = O.missing(x);
      const m = O.margin(x);
      return `
        <div class="acc-card card${x.archived_at ? ' is-archived' : ''}" onclick="Opp.detail('${x.id}')">
          <div class="acc-card-head">
            <div style="min-width:0;">
              <div class="acc-name">${UI.esc(x.title)}</div>
              <div class="acc-loc">${UI.esc(x.company_name || 'firma nezadaná')}</div>
            </div>
            <span class="opp-card-acts">
              ${x.archived_at ? UI.badge('odstránený', 'gray') : this.badge(x.status)}
              ${x.archived_at
                ? `<button class="btn btn-outline btn-sm" title="Vrátiť do zoznamu"
                    onclick="event.stopPropagation();Opp.restore('${x.id}')">${Icon('repeat', 13)} Vrátiť</button>`
                : `<button class="opp-del" title="Odstrániť dopyt" aria-label="Odstrániť dopyt"
                    onclick="event.stopPropagation();Opp.archiveForm('${x.id}')">${Icon('trash', 15)}</button>`}
            </span>
          </div>
          ${x.archived_at ? `<div class="opp-arch-note">Odstránené ${UI.date(x.archived_at)}${
            x.archived_reason ? ` · ${UI.esc(x.archived_reason)}` : ''}</div>` : ''}
          <div class="acc-meta">
            ${x.trade_key ? `<span>${Icon('wrench', 14)} ${UI.esc(this.tradeName(x.trade_key))}</span>` : ''}
            ${x.headcount ? `<span>${Icon('user', 14)} ${x.headcount}</span>` : ''}
            ${x.city ? `<span>${Icon('site', 14)} ${UI.esc(x.city)}</span>` : ''}
            ${m.perHour != null ? `<span>${Icon('euro', 14)} marža ${Money.format(m.perHour)}/h</span>` : ''}
          </div>
          <div class="card-now${v.state === 'invalid' ? ' card-now-hot' : ''}">
            <b>${UI.esc(v.label)}</b>
            <span>${UI.esc(chyba.length
              ? `Chýba: ${chyba.slice(0, 3).map(c => c.title).join(', ')}`
              : 'Všetko potrebné je doplnené.')}</span>
          </div>
        </div>`;
    },

    // ── Pridanie: štyri polia, nič viac ───────────────────────────────────
    /**
     * Formulár má zámerne štyri polia. Kto telefonát prijal, nemá dopisovať
     * pätnásť — zvyšok doplní ten, kto to bude riešiť. Vysoký prah znamená,
     * že sa možnosť nezapíše vôbec, a to je najhoršie, čo sa môže stať.
     */
    form() {
      UI.modal('Nový dopyt', `
        <form id="opp-form" onsubmit="event.preventDefault();Opp.save()">
          <div class="regimebox">Stačí to, čo vieš z telefonátu. Ostatné sa dopĺňa potom —
            dopyt, ktorý nie je zapísaný, neexistuje.</div>
          ${UI.field('title', 'O čo ide', { required: true,
            placeholder: 'napr. Kotolňa Wörthsee — zvárači',
            hint: 'Krátko, aby sa to dalo nájsť v zozname.' })}
          ${UI.field('company_name', 'Firma', { placeholder: 'kto sa ozval' })}
          ${UI.field('contact_phone', 'Telefón', {
            hint: 'E-mail môže ležať tri dni. Telefón je to, čím sa dopyt pohne.' })}
          ${UI.field('brief', 'Čo potrebujú', { type: 'textarea', rows: 4,
            placeholder: 'Čo sa stavia, koľko ľudí, aké remeslo, odkedy, za koľko — '
              + 'aj neučesane, pokojne skopírovaný e-mail.' })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${Icon('check')} Zapísať</button>
          </div>
        </form>`);
    },

    // ── Dopyt od odberateľa: jeden e-mail, viac stavieb ───────────────────
    // Nemecká firma nenapíše „potrebujeme štyroch ľudí". Napíše e-mail, v ktorom
    // sú tri projekty naraz — tri mestá, tri termíny, tri nábory. Dovtedy sa
    // taký e-mail zapísal ako jedna možnosť a všetko ostatné zostalo vo voľnom
    // texte.

    inquiryForm() {
      UI.modal('Vložiť dopyt od odberateľa', `
        <form id="opp-inq" onsubmit="event.preventDefault();Opp.splitInquiry()">
          <div class="regimebox">Vlož celý e-mail aj s podpisom. Appka z neho vytiahne
            jednotlivé stavby — mesto, počet ľudí, sadzbu a termín — a ukáže ti ich
            skôr, než sa čokoľvek založí.</div>
          ${UI.field('text', 'E-mail od odberateľa', { type: 'textarea', rows: 12,
            required: true, placeholder: 'Sem vlož celý e-mail, pokojne aj po nemecky.' })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary" id="opp-inq-btn">
              ${Icon('zap')} Rozdeliť na stavby</button>
          </div>
        </form>`);
    },

    async splitInquiry() {
      const d = UI.formData(document.getElementById('opp-inq'));
      if (!d.text || d.text.trim().length < 40) {
        return UI.toast('Vlož celý e-mail — z dvoch viet sa stavby vytiahnuť nedajú', 'err');
      }
      const btn = document.getElementById('opp-inq-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Čítam dopyt…'; }
      let out;
      try {
        const res = await fetch('/.netlify/functions/danubra-split-inquiry', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: d.text }),
        });
        out = await res.json();
        if (out.error) throw new Error(out.error);
      } catch (e) {
        if (btn) { btn.disabled = false; btn.innerHTML = 'Rozdeliť na stavby'; }
        return UI.toast('Nepodarilo sa: ' + e.message, 'err');
      }
      if (out.skipped) return UI.toast(out.message || 'Nie je to nastavené', 'err');

      this._inq = {
        projects: (out.projects || []).map(p => Inq.normalize(p)),
        client: out.client || {}, payment: out.payment || '', risks: out.risks || [],
        raw: d.text,
      };
      this.inquiryPreview();
    },

    /**
     * Čo sa v dopyte našlo — **pred** tým, než sa čokoľvek založí.
     *
     * Je tu aj veta o tom, či to vôbec stíhame: pri 2–6 ľuďoch týždenne je
     * trinásť ľudí robota na tri týždne a pondelkový nástup je výmysel.
     * Lepšie to vedieť teraz než v pondelok, keď tam nikto nepríde.
     */
    inquiryPreview() {
      const q = this._inq;
      if (!q) return;
      const sum = Inq.summary(q.projects);
      const sk = Inq.skonto(q.payment);
      const zle = q.projects.filter(p => !Inq.usable(p));

      UI.modal(`Našlo sa: ${sum.text}`, `
        <div id="inq-plan">${this.inqPlanHtml()}</div>

        ${sk ? `<div class="regimebox">${UI.esc(Inq.skontoText(sk))}
          Zapísané tak, ako to prišlo: <strong>${UI.esc(q.payment)}</strong></div>` : ''}

        <div class="form-section">Stavby — odškrtni, čo nechceš</div>
        <div id="inq-stavby">${this.inqRowsHtml()}</div>

        ${q.risks.length ? `<div class="form-section">Na čo si dať pozor</div>
          ${q.risks.map(r => `<div class="list-row" style="cursor:default;align-items:flex-start;">
            <span class="dot amber" style="margin-top:5px;"></span>
            <span style="flex:1;font-size:13px;">${UI.esc(r)}</span></div>`).join('')}` : ''}

        <div class="inq-next">
          <b>${Icon('zap', 15)} Čo sa stane po kliknutí</b>
          <ol>
            <li>Každá stavba sa zapíše ako dopyt (krok 1).</li>
            <li>Ku každej sa založí nábor s termínom podľa plánu (krok 2).</li>
            <li>Appka napíše podklady: texty inzerátov a otázky do telefonátu.</li>
          </ol>
          <span>Nič sa nezverejní samo — texty si pred spustením prečítaš.</span>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
          <button type="button" class="btn btn-outline" onclick="Opp.saveInquiry(false)">
            Len zapísať dopyty</button>
          <button type="button" class="btn btn-primary" onclick="Opp.saveInquiry(true)">
            ${Icon('zap')} Založiť nábor a pripraviť podklady</button>
        </div>`, { wide: true });
      if (zle.length) {
        UI.toast(`${zle.length} ${Shell.plural(zle.length, 'stavba nemá', 'stavby nemajú', 'stavieb nemá')} `
          + 'všetko — založiť sa dajú aj tak', 'warn');
      }
    },

    /** Označené stavby — z nich sa robí plán aj zápis. */
    inqChecked() {
      const q = this._inq;
      return q.projects.map((p, i) => ({ ...p, key: i })).filter((_, i) => {
        const el = document.getElementById(`inq-${i}`);
        return el ? el.checked : true;
      });
    },

    inqSchedule() {
      return Inq.schedule({ projects: this.inqChecked(), perWeek: this.kapacita(),
        today: Danubra._dayISO() });
    },

    inqPlanHtml() { return this.planHtml(this.inqSchedule()); },

    /**
     * Plán po týždňoch: ktorý týždeň koľko ľudí na ktorú stavbu. Kreslí sa
     * aj na obrazovke Nábor — preto je to tu ako samostatný kúsok.
     */
    planHtml(sched, opts = {}) {
      if (!sched || !sched.people) {
        return `<div class="regimebox">${UI.esc((sched && sched.text) || 'Niet koho hľadať.')}</div>`;
      }
      const late = sched.late.length;
      return `<div class="wplan${late ? ' is-late' : ''}">
        <div class="wplan-head">
          <span class="wplan-ico">${Icon(late ? 'alert' : 'calendar', 16)}</span>
          <div>
            <b>${UI.esc(opts.title || 'Náborový plán')}</b>
            <span>${UI.esc(sched.text)}</span>
          </div>
        </div>
        <div class="wplan-weeks">
          ${sched.weeks.slice(0, opts.limit || 8).map(w => `
            <div class="wplan-week">
              <div class="wplan-w"><b>Týždeň ${w.n}</b><span>${UI.esc(Inq.weekLabel(w.from, w.to))}</span></div>
              <div class="wplan-items">${w.items.map(x => `
                <span class="wplan-chip">${UI.esc(x.city || x.title)} <b>${x.count}</b></span>`).join('')}</div>
              <div class="wplan-total" title="Najviac ${sched.max} týždenne">
                <span class="wplan-bar"><i style="width:${Math.round(100 * w.total / sched.max)}%"></i></span>
                ${w.total} z ${sched.max}</div>
            </div>`).join('')}
          ${sched.weeks.length > (opts.limit || 8) ? `<div class="wplan-more">
            … a ďalších ${sched.weeks.length - (opts.limit || 8)} týždňov</div>` : ''}
        </div>
      </div>`;
    },

    inqRowsHtml() {
      const q = this._inq;
      const sched = this.inqSchedule();
      return q.projects.map((p, i) => {
        const sp = sched.projects.find(x => x.key === i);
        const kedy = sp && sp.ready
          ? (sp.late
            ? `<span class="inq-when is-late">${Icon('alert', 12)} ľudí budeš mať ${UI.date(sp.ready)} —
                o ${sp.lateDays} ${Shell.plural(sp.lateDays, 'deň', 'dni', 'dní')} po nástupe</span>`
            : `<span class="inq-when">${Icon('check', 12)} ľudí budeš mať do ${UI.date(sp.ready)}</span>`)
          : '';
        return `
          <div class="list-row" style="cursor:default;align-items:flex-start;">
            <span class="dot ${Inq.usable(p) ? 'green' : 'amber'}" style="margin-top:5px;"></span>
            <span style="flex:1;font-size:13px;">
              <strong>${UI.esc(p.title || '(bez názvu)')}</strong>
              <span style="display:block;color:var(--ink-mute);font-size:12px;">
                ${[p.city, p.headcount ? `${p.headcount} ${Shell.plural(p.headcount, 'človek', 'ľudia', 'ľudí')}` : null,
                  p.rate_client ? `${String(p.rate_client).replace('.', ',')} €/h` : null,
                  p.start_date ? `nástup ${UI.date(p.start_date)}` : 'bez termínu',
                ].filter(Boolean).map(UI.esc).join(' · ')}</span>
              ${kedy}
              ${Inq.problems(p).length ? `<span style="display:block;color:var(--amber);font-size:12px;">
                chýba ${UI.esc(Inq.problems(p).map(x => x.title).join(', '))} — doplníš to po založení</span>` : ''}
            </span>
            <label class="chk" title="Založiť túto stavbu">
              <input type="checkbox" id="inq-${i}" checked onchange="Opp.inqRepaint()"></label>
          </div>`;
      }).join('');
    },

    /** Odškrtnutá stavba sa z plánu vypadne hneď — nie až po založení. */
    inqRepaint() {
      const plan = document.getElementById('inq-plan');
      if (plan) plan.innerHTML = this.inqPlanHtml();
      // Riadky sa prekresľujú bez straty zaškrtnutia — len veta „kedy".
      const stav = this._inq.projects.map((_, i) => {
        const el = document.getElementById(`inq-${i}`); return el ? el.checked : true;
      });
      const box = document.getElementById('inq-stavby');
      if (box) {
        box.innerHTML = this.inqRowsHtml();
        stav.forEach((v, i) => { const el = document.getElementById(`inq-${i}`); if (el) el.checked = v; });
      }
    },

    /** Koľko ľudí vieme nabrať za týždeň. Dá sa prepísať v Nastaveniach. */
    kapacita() {
      const s = Danubra.cfg('staffing');
      return {
        min: Number(s.hire_per_week_min) || Inq.KAPACITA.min,
        max: Number(s.hire_per_week_max) || Inq.KAPACITA.max,
      };
    },

    async saveInquiry(sNaborom) {
      const q = this._inq;
      if (!q) return;
      const vybrane = this.inqChecked();
      if (!vybrane.length) return UI.toast('Nič nie je označené', 'err');
      const sched = this.inqSchedule();

      const sk = Inq.skonto(q.payment);
      const rows = vybrane.map(p => ({
        title: p.title || `${p.city} — ${q.client.company_name || 'dopyt'}`,
        city: p.city || null,
        country: p.country || 'DE',
        trade_key: p.trade_key || null,
        headcount: p.headcount,
        rate_client: p.rate_client,
        start_date: p.start_date,
        company_name: q.client.company_name || null,
        company_vat: q.client.company_vat || null,
        contact_name: q.client.contact_name || null,
        contact_phone: q.client.contact_phone || null,
        contact_email: q.client.contact_email || null,
        source: 'e-mail',
        status: 'new',
        // Zadanie pre nábor: čo sa robí, požiadavky a podmienky, ktoré platili
        // na celý e-mail. Z tohto sa potom robia podklady.
        brief: [
          p.brief,
          p.address ? `Adresa stavby: ${p.address}` : null,
          p.hours_week ? `Hodiny: ${p.hours_week}` : null,
          p.duration ? `Trvanie: ${p.duration}` : null,
          p.requirements && p.requirements.length
            ? `Požiadavky:\n- ${p.requirements.join('\n- ')}` : null,
          q.payment ? `Platobné podmienky: ${q.payment}${
            sk ? ` (${Inq.skontoText(sk)})` : ''}` : null,
        ].filter(Boolean).join('\n\n') || null,
        created_by: Danubra.user?.id || null,
      }));

      const { data, error } = await DB.insertMany('opportunities', rows);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      if (Array.isArray(data)) this.items.unshift(...data);
      this._inq = null;
      if (!sNaborom || !Array.isArray(data)) {
        UI.closeModal();
        UI.toast(`Založené: ${rows.length} ${Shell.plural(rows.length, 'dopyt', 'dopyty', 'dopytov')}`, 'ok');
        return Danubra.renderRoute();
      }
      return this.makePlans(vybrane, data, sched);
    },

    // ── Z dopytu rovno nábor a podklady ───────────────────────────────────
    /**
     * „Z takýchto podkladov potrebujem vypracovať náborový plán a všetky
     * podklady k tomu." Ku každej stavbe nábor s termínom podľa plánu, a do
     * každého podklady (texty a otázky) — naraz, nie po jednom.
     *
     * Nábor sa zakladá ako koncept: nič sa nezverejní, kým si texty niekto
     * neprečíta a nábor nespustí.
     */
    async makePlans(vybrane, opps, sched) {
      UI.modal('Zakladám nábor', UI.loading());
      const plans = vybrane.map((p, i) => {
        const o = opps[i] || {};
        const sp = sched.projects.find(x => x.key === p.key) || {};
        return {
          title: o.title || p.title || p.city,
          trade_key: p.trade_key || null,
          headcount: p.headcount || 1,
          city: p.city || null,
          country: p.country || 'DE',
          start_date: p.start_date || null,
          // „Dokedy musím mať ľudí" — do nástupu. Bez nástupu podľa plánu.
          deadline: p.start_date || sp.ready || null,
          client_rate: p.rate_client || null,
          legal_form: 'szco',
          status: 'draft',
          brief: o.brief || null,
          notes: Inq.planText(sp) || null,
          created_by: Danubra.user?.id || null,
        };
      });
      const { data, error } = await DB.insertMany('recruitment_plans', plans);
      if (error || !Array.isArray(data)) {
        UI.closeModal();
        Danubra.renderRoute();
        return UI.toast('Dopyty sú zapísané, ale nábor sa nezaložil: '
          + ((error && error.message) || 'neznáma chyba'), 'err');
      }
      await Promise.all(data.map((pl, i) => opps[i] && DB.update('opportunities', opps[i].id,
        { plan_id: pl.id, status: 'checking' })));
      data.forEach((pl, i) => { const o = this.items.find(x => x.id === (opps[i] || {}).id);
        if (o) { o.plan_id = pl.id; o.status = 'checking'; } });
      if (window.Hire) Hire.loaded = false;

      this._prep = data.map(pl => ({ id: pl.id, title: pl.title, city: pl.city,
        notes: pl.notes, state: pl.brief ? 'run' : 'nobrief', text: '' }));
      this.prepPaint();
      // Podklady pre všetky stavby naraz — každá je samostatné volanie.
      await Promise.all(this._prep.map(x => x.state === 'run' ? this.prepOne(x) : null));
      this.prepPaint(true);
    },

    async prepOne(x) {
      x.state = 'run'; x.text = '';
      try {
        // Na pozadí — písanie trvá dlhšie, než bežná funkcia vydrží (504).
        const out = await Kit.runAnalysis(x.id);
        if (out.skipped) { x.state = 'skipped'; x.text = 'Texty sa nepripravili — na serveri chýba kľúč k modelu.'; }
        else {
          x.state = 'ok';
          x.text = [
            `${out.blocks || 0} ${Shell.plural(out.blocks || 0, 'text', 'texty', 'textov')} na inzeráty`,
            out.questions ? `${out.questions} ${Shell.plural(out.questions, 'otázka', 'otázky', 'otázok')} do telefonátu` : null,
          ].filter(Boolean).join(' · ');
        }
      } catch (e) {
        x.state = 'err'; x.text = `Podklady sa nepripravili (${e.message}).`;
      }
      this.prepPaint();
    },

    /** Zopakuje podklady pre jeden nábor priamo z tohto okna. */
    async prepRetry(id) {
      const x = (this._prep || []).find(r => r.id === id);
      if (!x) return;
      this.prepPaint();
      await this.prepOne(x);
    },

    prepPaint(hotovo) {
      const rows = this._prep || [];
      const bezi = rows.some(x => x.state === 'run');
      const IKONA = { run: 'clock', ok: 'check', err: 'alert', skipped: 'alert', nobrief: 'alert' };
      UI.modal(bezi ? 'Pripravujem podklady…' : 'Nábor je pripravený', `
        ${bezi ? `<div class="regimebox">Píšem texty inzerátov a otázky do telefonátu pre
          ${rows.length} ${Shell.plural(rows.length, 'stavbu', 'stavby', 'stavieb')}. Trvá to
          zvyčajne 1–2 minúty. Okno môžeš zavrieť — podklady sa dopíšu aj tak
          a uvidíš ich v Nábore.</div>`
          : `<div class="headline headline-ok" style="margin-bottom:12px;">${Icon('check', 18)}
            <span>Dopyty sú zapísané a ku každému je nábor.</span></div>`}
        <div class="prep-list">${rows.map(x => `
          <div class="prep-row prep-${x.state}">
            <span class="prep-ico">${Icon(IKONA[x.state] || 'clock', 16)}</span>
            <span class="prep-txt">
              <b>${UI.esc(x.title || x.city || 'Nábor')}</b>
              <em>${UI.esc(x.state === 'run' ? 'Pripravujem podklady…'
                : x.state === 'nobrief' ? 'Bez zadania — dopíš ho v nábore a daj pripraviť podklady.'
                  : x.text)}</em>
              ${x.notes ? `<em class="prep-plan">${UI.esc(x.notes)}</em>` : ''}
            </span>
            ${x.state === 'err' && !bezi ? `<button class="btn btn-primary btn-sm"
              onclick="Opp.prepRetry('${x.id}')">${Icon('repeat', 14)} Skúsiť znova</button>` : ''}
            ${!bezi ? `<button class="btn btn-outline btn-sm"
              onclick="UI.closeModal();Danubra.go('hiring');setTimeout(()=>Hire.detail('${x.id}'),300)">
              Otvoriť</button>` : ''}
          </div>`).join('')}</div>
        ${!bezi ? `<div class="inq-next">
          <b>${Icon('chevron', 15)} Čo teraz</b>
          <ol>
            <li>Otvor nábor a prečítaj texty — oprav, čo nesedí.</li>
            <li>Vlož inzeráty (web, Bazoš, Facebook) a klikni „Spustiť nábor".</li>
            <li>Kto sa ozve, tomu zavolaj do desiatich minút.</li>
          </ol>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal();Danubra.renderRoute()">Zavrieť</button>
          <button class="btn btn-primary" onclick="UI.closeModal();Danubra.go('hiring')">
            ${Icon('zap')} Otvoriť nábor</button>
        </div>` : ''}`, { wide: true });
      if (hotovo) {
        const ok = rows.filter(x => x.state === 'ok').length;
        UI.toast(`Hotovo — ${rows.length} ${Shell.plural(rows.length, 'nábor', 'nábory', 'náborov')}`
          + (ok ? `, podklady pre ${ok}` : ''), ok === rows.length ? 'ok' : 'warn');
      }
    },

    async save() {
      const d = UI.formData(document.getElementById('opp-form'));
      if (!d.title) return UI.toast('Napíš aspoň, o čo ide', 'err');
      const { data, error } = await DB.insert('opportunities', {
        title: d.title,
        company_name: d.company_name || null,
        contact_phone: d.contact_phone || null,
        brief: d.brief || null,
        status: 'new',
        created_by: Danubra.user?.id || null,
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      if (data) this.items.unshift(data);
      UI.closeModal();
      UI.toast('Zapísané — doplniť sa to dá kedykoľvek', 'ok');
      Danubra.renderRoute();
    },

    // ── Otvorená možnosť ──────────────────────────────────────────────────
    async detail(id) {
      if (!this.items.find(x => x.id === id)) {
        if (!this.loaded) await this.load();
        if (!this.items.find(x => x.id === id)) return UI.toast('Nenájdené', 'err');
      }
      this.openId = id;
      UI.closeModal();
      if (Danubra.route !== 'opportunities') { Danubra.go('opportunities'); return; }
      return Danubra.renderRoute();
    },

    closeProfile() { this.openId = null; Danubra.renderRoute(); },

    async profile(el, id) {
      const x = this.items.find(o => o.id === id);
      if (!x) { this.openId = null; return UI.toast('Nenájdené', 'err'); }

      Danubra.setActions(`
        <button class="btn btn-ghost btn-sm" onclick="Opp.closeProfile()">${Icon('back', 15)} Späť</button>
        ${x.archived_at
          ? `<button class="btn btn-outline btn-sm" onclick="Opp.restore('${x.id}')">${Icon('repeat', 14)} Vrátiť do zoznamu</button>`
          : `<button class="btn btn-outline btn-sm" onclick="Opp.archiveForm('${x.id}')">${Icon('trash', 14)} Odstrániť</button>`}`);

      const v = O.verification(x);
      const chyba = O.missing(x);
      const m = O.margin(x);
      const TONE = { valid: 'green', invalid: 'red', unavailable: 'amber', unchecked: 'gray' };

      el.innerHTML = Danubra.header(x.title,
        [x.company_name, x.city].filter(Boolean).map(UI.esc).join(' · '), '', [x.title]) + `
        <div class="detail-head">
          ${this.badge(x.status)}
          <select class="verif-sel" onchange="Opp.setStatus('${x.id}',this.value)">
            ${O.STATUS.map(s => `<option value="${s[0]}" ${x.status === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('')}
          </select>
        </div>

        ${Shell.now({
          title: v.label, what: v.detail, hot: v.state === 'invalid',
          why: x.verified_at ? `Pýtali sme sa ${UI.date(x.verified_at)}. Staré overenie `
            + 'nie je overenie — pri zmene firmy to zopakuj.' : '',
        }, {
          label: 'Firma', help: 'card.opp.verify',
          action: x.company_vat ? { ico: 'shield', onclick: `Opp.verify('${x.id}')`,
            label: x.verify_result ? 'Preveriť znova' : 'Preveriť v registri' } : null,
        })}

        ${chyba.length ? `<div class="form-section">Čo doplniť</div>
          ${chyba.map(c => `<div class="list-row" style="cursor:default;align-items:flex-start;">
            <span class="dot amber" style="margin-top:5px;"></span>
            <span style="flex:1;font-size:13px;"><strong>${UI.esc(c.title)}</strong>
              <span style="display:block;color:var(--ink-mute);font-size:12px;">${UI.esc(c.why)}</span>
            </span></div>`).join('')}` : ''}

        <div class="form-section">Údaje</div>
        <div class="kit-facts">
          ${this.fieldHtml(x, 'company_name', 'Firma')}
          ${this.fieldHtml(x, 'company_vat', 'USt-IdNr')}
          ${this.fieldHtml(x, 'contact_name', 'Kontakt')}
          ${this.fieldHtml(x, 'contact_phone', 'Telefón')}
          ${this.fieldHtml(x, 'contact_email', 'E-mail')}
          ${this.fieldHtml(x, 'city', 'Mesto')}
          ${this.fieldHtml(x, 'headcount', 'Koľko ľudí', 'number')}
          ${this.fieldHtml(x, 'rate_client', 'Platia €/h', 'number')}
          ${this.fieldHtml(x, 'rate_worker', 'Dáme €/h', 'number')}
          ${this.fieldHtml(x, 'start_date', 'Nástup', 'date')}
          <label class="kit-fact"><span>Remeslo</span>
            <select onchange="Opp.setField('${x.id}','trade_key',this.value)">
              <option value="">—</option>
              ${this.trades.map(t => `<option value="${t.key}" ${x.trade_key === t.key ? 'selected' : ''}>${UI.esc(t.name_sk)}</option>`).join('')}
            </select></label>
        </div>
        ${m.perHour != null ? `<div class="kit-sum ${m.pct >= 25 ? 'kit-ok' : 'kit-warn'}">
          Marža ${Money.format(m.perHour)}/h · ${UI.pct(m.pct)} zo sadzby odberateľa</div>` : ''}

        <div class="form-section">Čo o tom vieme</div>
        <div class="kit-brief">
          <textarea id="opp-brief" rows="6"
            placeholder="Všetko, čo vieš — aj neučesané.">${UI.esc(x.brief || '')}</textarea>
          <div class="kit-brief-acts">
            <button class="btn btn-outline btn-sm" onclick="Opp.saveBrief('${x.id}')">
              ${Icon('check', 14)} Uložiť</button>
            <span class="kit-note">Toto sa prenesie do náboru ako zadanie.</span>
          </div>
        </div>

        <div class="form-section">Čo z toho spraviť</div>
        ${x.plan_id ? `<div class="regimebox">${Icon('check', 14)}
          Nábor je založený. ${Danubra.link('plan', x.plan_id, 'Otvoriť nábor')}</div>`
          : `<button class="btn btn-primary btn-block" onclick="Opp.makePlan('${x.id}')">
              ${Icon('zap', 17)} Spraviť z toho nábor</button>
             <div class="kit-note" style="margin-top:6px;">Zadanie sa prenesie a analýza
               z neho spraví podklady, otázky do hovoru aj polia náboru.</div>`}`;
    },

    /** Jedno pole, ktoré sa ukladá hneď po zmene — bez tlačidla „uložiť". */
    fieldHtml(x, key, label, type = 'text') {
      return `<label class="kit-fact"><span>${UI.esc(label)}</span>
        <input type="${type}" value="${UI.esc(x[key] == null ? '' : x[key])}"
          onchange="Opp.setField('${x.id}','${key}',this.value)"></label>`;
    },

    async setField(id, key, value) {
      const x = this.items.find(o => o.id === id);
      const num = ['headcount', 'rate_client', 'rate_worker'].includes(key);
      const val = value === '' ? null : (num ? Number(value) : value);
      const { error } = await DB.update('opportunities', id, { [key]: val });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      if (x) x[key] = val;
      Danubra.renderRoute();
    },

    async saveBrief(id) {
      const el = document.getElementById('opp-brief');
      if (!el) return;
      const { error } = await DB.update('opportunities', id, { brief: el.value });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const x = this.items.find(o => o.id === id); if (x) x.brief = el.value;
      UI.toast('Uložené', 'ok');
    },

    // ── Odstránenie ───────────────────────────────────────────────────────
    /**
     * Okno pred odstránením: prečo a či zrušiť aj nábor, ktorý z dopytu
     * vznikol. Dopyt sa nemaže — odloží sa a dá sa vrátiť.
     */
    archiveForm(id) {
      const x = this.items.find(o => o.id === id);
      if (!x) return;
      const nabor = x.plan_id && window.Hire ? (Hire.plans || []).find(p => p.id === x.plan_id) : null;
      const DOVODY = ['Duplicita — ten istý dopyt je tu dvakrát', 'Zapísané omylom', 'Odberateľ to zrušil'];
      UI.modal('Odstrániť dopyt?', `
        <p style="margin:0 0 12px;font-size:14px;"><b>${UI.esc(x.title)}</b></p>
        <div class="regimebox">Zo zoznamu aj z počítadiel zmizne. Nič sa nemaže —
          nájdeš ho pod „Odstránené" a dá sa vrátiť.</div>
        <div class="form-section">Prečo</div>
        <div class="opp-why">
          ${DOVODY.map((d, i) => `<label class="opp-why-opt"><input type="radio" name="opp-why"
            value="${UI.esc(d)}" ${i === 0 ? 'checked' : ''}> ${UI.esc(d)}</label>`).join('')}
          <label class="opp-why-opt"><input type="radio" name="opp-why" value="__ine"> Iný dôvod:
            <input id="opp-why-text" class="opp-why-text" placeholder="napíš krátko"
              onfocus="document.querySelector('input[name=opp-why][value=__ine]').checked=true"></label>
        </div>
        ${x.plan_id ? `<label class="chk" style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;">
          <input type="checkbox" id="opp-plan-too" checked>
          <span>Zrušiť aj nábor${nabor ? ` „${UI.esc(nabor.title)}"` : ''}, ktorý z neho vznikol.
            <em style="display:block;font-style:normal;color:var(--ink-mute);font-size:12.5px;">
            Nábor sa nezmaže — dostane stav „zrušený" a texty ostanú.</em></span></label>` : ''}
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal()">Nechať</button>
          <button class="btn btn-danger" onclick="Opp.archive('${x.id}')">${Icon('trash', 14)} Odstrániť</button>
        </div>`);
    },

    async archive(id) {
      const x = this.items.find(o => o.id === id);
      if (!x) return;
      const volba = document.querySelector('input[name=opp-why]:checked');
      let dovod = volba ? volba.value : '';
      if (dovod === '__ine') dovod = (document.getElementById('opp-why-text')?.value || '').trim() || 'iný dôvod';
      const ajNabor = !!document.getElementById('opp-plan-too')?.checked;

      const patch = { archived_at: new Date().toISOString(), archived_reason: dovod || null };
      const { error } = await DB.update('opportunities', id, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      Object.assign(x, patch);
      if (ajNabor && x.plan_id) {
        const { error: ep } = await DB.update('recruitment_plans', x.plan_id, { status: 'cancelled' });
        if (ep) UI.toast('Dopyt je odstránený, ale nábor sa nezrušil: ' + ep.message, 'err');
        if (window.Hire) Hire.loaded = false;
      }
      UI.closeModal();
      this.openId = null;
      UI.toast('Dopyt je odstránený — nájdeš ho pod „Odstránené"', 'ok');
      Danubra._chain = null;
      Danubra.renderRoute();
    },

    async restore(id) {
      const x = this.items.find(o => o.id === id);
      if (!x) return;
      const { error } = await DB.update('opportunities', id, { archived_at: null, archived_reason: null });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      x.archived_at = null; x.archived_reason = null;
      if (!this.archived().length && this.filters.status === '__arch') this.filters.status = '';
      UI.toast('Dopyt je späť v zozname. Nábor, ak bol zrušený, obnov v Nábore.', 'ok');
      Danubra._chain = null;
      Danubra.renderRoute();
    },

    async setStatus(id, status) {
      const x = this.items.find(o => o.id === id);
      // Stratená možnosť bez dôvodu je o pol roka nanič — vtedy sa tá istá
      // firma ozve znova a nikto nebude vedieť, čo bolo naposledy.
      let lost_reason = x ? x.lost_reason : null;
      if (status === 'lost') {
        lost_reason = await UI.ask('Prečo z toho nič nebolo? (zapíše sa)');
        if (lost_reason === null) return Danubra.renderRoute();
      }
      const { error } = await DB.update('opportunities', id, { status, lost_reason });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      if (x) { x.status = status; x.lost_reason = lost_reason; }
      UI.toast('Uložené', 'ok');
      Danubra.renderRoute();
    },

    // ── Overenie firmy ────────────────────────────────────────────────────
    /**
     * Pýta sa oficiálneho registra EU (VIES) cez server. Keď register
     * neodpovie, povie sa to tak — nie ako „firma neexistuje".
     */
    async verify(id) {
      const x = this.items.find(o => o.id === id);
      if (!x || !x.company_vat) return UI.toast('Najprv doplň USt-IdNr', 'err');
      UI.toast('Pýtam sa registra…', 'ok');
      let res;
      try {
        res = await fetch('/.netlify/functions/danubra-verify-company', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vat: x.company_vat, opportunityId: id }),
        });
      } catch (e) {
        return UI.toast('Server neodpovedal: ' + (e.message || e), 'err');
      }
      const out = await res.json().catch(() => ({}));
      if (!res.ok) return UI.toast(`Overenie sa nepodarilo: ${out.error || res.status}`, 'err');

      x.verify_result = out;
      x.verified_at = new Date().toISOString();
      // Názov z registra je presnejší než to, čo si niekto zapísal z telefónu —
      // ale prepisovať sa nesmie bez toho, aby to človek videl.
      if (out.valid && out.name && out.name !== x.company_name) {
        if (await UI.confirm(`Register firmu pozná ako „${out.name}". Prepísať názov?`)) {
          await this.setField(id, 'company_name', out.name);
        }
      }
      const v = O.verification(x);
      UI.toast(v.label, v.state === 'valid' ? 'ok' : 'err');
      Danubra.renderRoute();
    },

    // ── Z možnosti nábor ──────────────────────────────────────────────────
    /**
     * Založí nábor a prenesie doň zadanie. Samotnú analýzu nespúšťa — to je
     * rozhodnutie, ktoré patrí človeku, a na obrazovke náboru je na to
     * tlačidlo.
     */
    async makePlan(id) {
      const x = this.items.find(o => o.id === id);
      if (!x) return;
      if (!x.brief || !x.brief.trim()) {
        return UI.toast('Najprv napíš, čo o tom vieme — to sa prenesie ako zadanie', 'err');
      }
      const { data, error } = await DB.insert('recruitment_plans', {
        title: x.title,
        trade_key: x.trade_key || null,
        headcount: x.headcount || null,
        city: x.city || null,
        country: x.country || 'DE',
        start_date: x.start_date || null,
        offer_rate: x.rate_worker || null,
        client_rate: x.rate_client || null,
        legal_form: 'szco',
        status: 'draft',
        brief: x.brief,
        created_by: Danubra.user?.id || null,
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');

      await DB.update('opportunities', id, { plan_id: data.id, status: 'checking' });
      x.plan_id = data.id; x.status = 'checking';
      if (window.Hire) Hire.loaded = false;
      UI.toast('Nábor založený — zadanie je v ňom', 'ok');
      Danubra.go('hiring');
      setTimeout(() => window.Hire && Hire.detail(data.id), 300);
    },
  };

  window.Opp = Opp;
  Danubra.views.opportunities = function (el) { return Opp.view(el); };
})();
