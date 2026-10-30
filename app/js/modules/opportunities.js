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
    // Zoznam je spoločný komponent (`DataList`): lišta filtrov, čipy toho, čo
    // je zapnuté, a riadky po stĺpcoch. Dovtedy tu boli pilulky stavov a karty
    // — filtrovať sa dalo len podľa stavu a odstránené boli v samostatnej
    // pilulke. Teraz sú „Odstránené" jedna z hodnôt filtra Stav.
    async view(el) {
      Danubra.setActions(`
        <button class="btn btn-outline btn-sm" onclick="Opp.inquiryForm()">
          ${Icon('mail')} Vložiť dopyt</button>
        <button class="btn btn-primary btn-sm" onclick="Opp.form()">
          ${Icon('plus')} Zapísať dopyt</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      if (this.openId) return this.profile(el, this.openId);

      const today = Danubra._dayISO();
      const live = this.live();
      const q = O.nowNext(live, today);
      const s = O.summary(live);

      el.innerHTML = Danubra.header('Dopyty',
        `${s.live} ${Shell.plural(s.live, 'rozpracovaná', 'rozpracované', 'rozpracovaných')}`
        + (s.rate != null ? ` · úspešnosť ${UI.pct(s.rate)}${UI.tip('Z uzavretých dopytov (vyhrané aj stratené) koľko percent sme vyhrali. Ukáže sa až vtedy, keď sú uzavreté aspoň tri.')}` : ''))
        + this.nowHtml(q)
        + DataList.html(this.listConfig(this.rows(today)));
    },

    /** Stavy, s ktorými sa ešte pracuje — predvolený filter zoznamu. */
    OPEN_STATUSES: ['new', 'checking', 'offer'],

    /** Riadky zoznamu — všetky dopyty vrátane odstránených (tie skryje filter Stav). */
    rows(today = Danubra._dayISO()) {
      return this.items.map(x => this.listRow(x, today));
    },

    /** Kompatibilita: nastaví filter zoznamu z kódu (napr. odkaz z prehľadu). */
    setF(k, v) {
      if (k === 'status') return DataList.set('dopyty', 'stav', v ? [v] : []);
      if (k === 'q') return DataList.set('dopyty', 'q', v || '');
      return undefined;
    },

    /**
     * Riadok zoznamu: dopyt a to, čo sa o ňom počíta raz za vykreslenie.
     * Poradie „čo horí" (`rank`) je to isté ako v „Čo spraviť teraz"
     * (`DanubraOpp.nowNext`): nový dopyt bez odpovede, neplatné USt-IdNr,
     * nepreverená firma, chýbajúci údaj, ponuka bez odpovede.
     */
    listRow(x, today) {
      const L = DanubraDataList;
      const v = O.verification(x);
      const chyba = O.missing(x);
      const m = O.margin(x);
      const arch = !!x.archived_at;
      const closed = O.ZAVRETE.includes(x.status);
      const live = !arch && !closed;
      const created = x.created_at ? String(x.created_at).slice(0, 10) : '';
      const age = created ? L.daysBetween(created, today) : null;
      const toStart = x.start_date ? L.daysBetween(today, String(x.start_date).slice(0, 10)) : null;
      let rank = 5;
      if (arch) rank = 9;
      else if (closed) rank = 8;
      else if (x.status === 'new') rank = 0;
      else if (v.state === 'invalid') rank = 1;
      else if (x.company_vat && v.state !== 'valid') rank = 2;
      else if (chyba.length) rank = 3;
      else if (x.status === 'offer') rank = 4;
      return {
        id: x.id, x, v, chyba, m, arch, closed, live, age, toStart, rank, created,
        hot: live && rank <= 1, problem: live && rank <= 3,
        stav: arch ? '__arch' : (x.status || 'new'),
        title: x.title || 'Dopyt',
        company: x.company_name || '',
        trade: x.trade_key ? this.tradeName(x.trade_key) : '',
        city: x.city || '',
        source: x.source || '',
        marza: m.perHour != null ? m.perHour / 100 : null,
      };
    },

    /** Konfigurácia zoznamu dopytov pre `DataList`. */
    listConfig(rows) {
      const L = DanubraDataList;
      const ST = [...O.STATUS.map(s => [s[0], s[1]]), ['__arch', 'Odstránené']];
      const statusIdx = (k) => { const i = ST.findIndex(s => s[0] === k); return i < 0 ? 99 : i; };
      const statusLabel = (k) => (ST.find(s => s[0] === k) || [k, k])[1];
      const dni = (n) => `${n} ${Shell.plural(n, 'deň', 'dni', 'dní')}`;
      const pred = (n) => (n <= 0 ? 'dnes' : n === 1 ? 'včera' : `pred ${n} dňami`);
      const rate = (n) => `${Number(n).toLocaleString('sk-SK', { maximumFractionDigits: 2 })} €/h`;
      const esc = UI.esc;
      const hasArch = rows.some(r => r.arch);

      const firmaCell = (r) => {
        const name = r.company ? `<b>${esc(r.company)}</b>` : '<b class="opp-none">firma nezadaná</b>';
        const st = r.v.state;
        const note = st === 'valid' ? '<span class="dl-note is-green">preverená</span>'
          : st === 'invalid' ? '<span class="dl-note is-red">USt-IdNr neplatné</span>'
            : st === 'unavailable' ? '<span class="dl-note is-amber">register neodpovedal</span>'
              : r.x.company_vat ? '<span class="dl-note is-mute">nepreverená</span>'
                : '<span class="dl-note is-mute">bez USt-IdNr</span>';
        return `<span class="dl-two" title="${esc(r.v.label)}">${name}${note}</span>`;
      };
      const sadzbyCell = (r) => {
        const c = r.x.rate_client, w = r.x.rate_worker;
        if (r.m.perHour != null) {
          return `<span class="dl-two" title="Platia ${esc(rate(c))}, dáme ${esc(rate(w))} — marža ${esc(UI.pct(r.m.pct))} zo sadzby odberateľa">
            <b class="${r.m.pct >= 25 ? 'opp-ok' : 'opp-thin'}">${esc(Money.format(r.m.perHour))}/h</b>
            <small class="dl-num">${esc(rate(c))} → ${esc(String(w).replace('.', ','))}</small></span>`;
        }
        if (c) return `<span class="dl-two"><b>${esc(rate(c))}</b><small>platia, bez našej sadzby</small></span>`;
        return '';
      };
      const nastupCell = (r) => {
        if (!r.x.start_date) return '';
        const t = r.toStart;
        let note = '';
        if (r.live && t != null) {
          if (t < 0) note = `<span class="dl-note is-red">mal byť pred ${dni(-t)}</span>`;
          else if (t === 0) note = '<span class="dl-note is-amber">dnes</span>';
          else if (t <= 30) note = `<span class="dl-note ${t <= 7 ? 'is-amber' : 'is-mute'}">o ${dni(t)}</span>`;
        }
        return `<span class="dl-two"><b>${L.fmtDay(r.x.start_date)}</b>${note}</span>`;
      };
      const prisielCell = (r) => {
        if (!r.created) return r.source ? `<span class="dl-two"><small>${esc(r.source)}</small></span>` : '';
        const hot = r.x.status === 'new' && r.live && r.age >= 1;
        return `<span class="dl-two" title="Zapísané ${L.fmtDay(r.created)}">
          <b class="${hot ? 'opp-wait' : ''}">${pred(r.age)}</b>${r.source ? `<small>${esc(r.source)}</small>` : ''}</span>`;
      };
      const dalejCell = (r) => {
        const x = r.x;
        if (r.arch) {
          return `<span class="dl-note is-mute">Odstránené ${L.fmtDay(x.archived_at)}${
            x.archived_reason ? ` · ${esc(x.archived_reason)}` : ''}</span>`;
        }
        if (x.status === 'won') return `<span class="dl-ok">${Icon('check', 13)} ${x.subcontract_id ? 'Je z neho zákazka' : 'Vyhrali sme'}</span>`;
        if (x.status === 'lost') return `<span class="dl-note is-mute">${x.lost_reason ? esc(x.lost_reason) : 'Stratená — bez dôvodu'}</span>`;
        const n = r.chyba.length;
        const chyba = n ? `chýba ${n} ${Shell.plural(n, 'údaj', 'údaje', 'údajov')}` : '';
        const two = (b, note, tone) => `<span class="dl-two is-wrap"><b class="opp-do is-${tone}">${b}</b>${
          note ? `<span class="dl-note is-mute">${esc(note)}</span>` : ''}</span>`;
        if (r.rank === 0) return two('Ozvať sa', [r.age ? `čaká ${dni(r.age)}` : 'čaká na prvú odpoveď', chyba].filter(Boolean).join(' · '), 'red');
        if (r.rank === 1) return two('USt-IdNr neplatné', 'overte číslo u firmy', 'red');
        if (r.rank === 2) return two(r.v.state === 'unavailable' ? 'Preveriť znova' : 'Preveriť firmu', 'v registri EÚ', 'amber');
        if (r.rank === 3) return two(`Doplniť ${r.chyba[0].title}`, r.chyba.length > 1 ? `a ${r.chyba.slice(1, 3).map(c => c.title).join(', ')}${r.chyba.length > 3 ? '…' : ''}` : '', 'amber');
        if (r.rank === 4) return two('Pripomenúť sa k ponuke', 'ponuka odišla, je ticho', 'mute');
        return `<span class="dl-ok">${Icon('check', 13)} Všetko doplnené</span>`;
      };

      return {
        id: 'dopyty', storageKey: 'dopyty', label: 'Dopyty',
        noun: ['dopyt', 'dopyty', 'dopytov'],
        rows,
        rowClick: (r) => Opp.detail(r.id),
        rowClass: (r) => (r.hot ? 'is-hot' : r.problem ? 'is-warn' : (r.closed || r.arch) ? 'is-muted' : ''),
        rowLabel: (r) => `Dopyt ${r.title}`,
        rowActions: [
          { ico: (r) => (r.arch ? 'repeat' : 'trash'), label: (r) => (r.arch ? 'Vrátiť do zoznamu' : 'Odstrániť dopyt'),
            run: (r) => (r.arch ? Opp.restore(r.id) : Opp.archiveForm(r.id)) },
          { ico: 'chevron', label: 'Otvoriť dopyt', run: (r) => Opp.detail(r.id) },
        ],
        columns: [
          { key: 'dopyt', label: 'O čo ide', width: 'minmax(150px, 1.5fr)', mobile: 'title',
            render: (r) => `<span class="dl-title"><b>${esc(r.title)}</b>${
              r.city ? `<small>${Icon('site', 11)} ${esc(r.city)}</small>` : ''}</span>`,
            sortValue: (r) => r.title, sortLabel: 'Názov' },
          { key: 'firma', label: 'Firma', width: 'minmax(118px, 1fr)', render: firmaCell, sortValue: (r) => r.company },
          { key: 'remeslo', label: 'Remeslo · ľudia', width: '112px', hideBelow: 980,
            render: (r) => (r.trade || r.x.headcount ? `<span class="dl-two">${r.trade ? `<b>${esc(r.trade)}</b>` : '<b class="opp-none">remeslo?</b>'}${
              r.x.headcount ? `<small>${r.x.headcount} ${Shell.plural(Number(r.x.headcount), 'človek', 'ľudia', 'ľudí')}</small>` : ''}</span>` : ''),
            sortValue: (r) => Number(r.x.headcount) || null, sortDir: -1, sortLabel: 'Počet ľudí' },
          { key: 'sadzby', label: 'Marža', width: '104px', mobileLabel: 'marža',
            tip: 'Hore marža na hodinu jedného človeka (čo platí odberateľ mínus čo dáme živnostníkovi, bez DPH). Dole platia → dáme. Zelená od 25 %.',
            render: sadzbyCell, sortValue: (r) => r.m.perHour, sortDir: -1, sortLabel: 'Marža' },
          { key: 'nastup', label: 'Nástup', width: '100px', mobileLabel: 'nástup', render: nastupCell,
            sortValue: (r) => r.x.start_date || null },
          { key: 'stav', label: 'Stav', width: '108px', mobile: 'badge',
            render: (r) => (r.arch ? UI.badge('Odstránený', 'gray') : this.badge(r.x.status)),
            sortValue: (r) => statusIdx(r.stav) },
          { key: 'prisiel', label: 'Prišiel', width: '92px', hideBelow: 1100, mobileLabel: 'prišiel',
            tip: 'Kedy bol dopyt zapísaný a odkiaľ prišiel (zdroj). Nový dopyt, ktorý čaká deň a viac, je oranžový.',
            render: prisielCell, sortValue: (r) => r.x.created_at || null, sortDir: -1 },
          { key: 'dalej', label: 'Čo ďalej', width: 'minmax(150px, 1.4fr)', mobile: 'line',
            tip: 'Čo treba s dopytom spraviť. Poradie je rovnaké ako v „Čo spraviť teraz": najprv nové dopyty bez odpovede, potom neplatné USt-IdNr, nepreverené firmy a chýbajúce údaje.',
            render: dalejCell,
            sortValue: (r) => [r.rank, r.rank <= 2 ? (r.x.created_at || '') : '', r.title],
            sortLabel: 'Čo horí' },
        ],
        sorts: [{ key: 'firmy', label: 'Firma', value: (r) => r.company }],
        sort: { key: 'dalej', dir: 1 },
        groups: [
          { key: 'stav', label: 'Stav', value: 'stav', labelOf: statusLabel, order: ST.map(s => s[0]),
            tone: (k) => ({ new: 'amber', checking: 'blue', offer: 'blue', won: 'green', lost: 'gray', __arch: 'gray' }[k] || 'gray') },
          { key: 'firma', label: 'Firma', value: 'company', emptyLabel: 'Firma nezadaná' },
        ],
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať dopyt…', label: 'Hľadať názov, firmu, mesto, kontakt alebo remeslo',
            fields: ['title', 'company', 'city', 'trade', 'source', 'x.contact_name', 'x.contact_phone', 'x.contact_email', 'x.company_vat'] },
          { key: 'stav', type: 'multi', label: 'Stav', value: 'stav', default: this.OPEN_STATUSES,
            options: ST, sortOptions: false, allLabel: 'Všetky',
            presets: [
              { label: 'Rozpracované', value: this.OPEN_STATUSES, hint: 'Nová, Preverujeme a Ponuka odišla — bez uzavretých a odstránených' },
              { label: 'Uzavreté', value: ['won', 'lost'], hint: 'Vyhrali sme a Stratená' },
              ...(hasArch ? [{ label: 'Odstránené', value: ['__arch'], hint: 'Odložené dopyty — dajú sa vrátiť do zoznamu' }] : []),
            ] },
          { key: 'firma', type: 'select', label: 'Firma', value: 'company', emptyLabel: 'Firma nezadaná', allLabel: 'Všetky firmy' },
          { key: 'remeslo', type: 'select', label: 'Remeslo', value: (r) => r.x.trade_key,
            optionLabel: (v) => this.tradeName(v), emptyLabel: 'Nezadané', allLabel: 'Všetky remeslá' },
          { key: 'problem', type: 'toggle', label: 'Len s problémom', test: (r) => r.problem,
            hint: 'Dopyty, pri ktorých niečo čaká na nás: nový dopyt bez odpovede, neplatné alebo nepreverené USt-IdNr, chýbajúci údaj (firma, telefón, remeslo, počet ľudí, mesto, sadzba, nástup).' },
          { key: 'mesto', type: 'select', label: 'Mesto', value: 'city', emptyLabel: 'Bez mesta', allLabel: 'Všetky mestá', more: true },
          { key: 'zdroj', type: 'select', label: 'Zdroj', value: 'source', emptyLabel: 'Nezadaný', allLabel: 'Všetky zdroje', more: true },
          { key: 'nastup', type: 'range-date', label: 'Nástup', field: 'x.start_date', more: true,
            hint: 'Dopyty s nástupom v zvolenom období. Dopyt bez nástupu sa neukáže.' },
          { key: 'prisiel', type: 'range-date', label: 'Prišiel', field: 'created', more: true },
          { key: 'marza', type: 'range-number', label: 'Marža €/h', value: 'marza', unit: '€', more: true },
        ],
        empty: { ico: 'offers', title: 'Zatiaľ žiadne dopyty',
          sub: 'Keď sa niekto ozve, zapíšte to sem — aj keď o tom viete málo. Dopyt, ktorý nie je zapísaný, neexistuje.',
          cta: `<button class="btn btn-primary" onclick="Opp.form()">${Icon('plus')} Zapísať dopyt</button>` },
        export: {
          name: ['dopyty'],
          columns: [
            ['Dopyt', r => r.title], ['Firma', r => r.company], ['USt-IdNr', r => r.x.company_vat],
            ['Overenie', r => r.v.label], ['Kontakt', r => r.x.contact_name], ['Telefón', r => r.x.contact_phone],
            ['E-mail', r => r.x.contact_email], ['Mesto', r => r.city], ['Remeslo', r => r.trade],
            ['Ľudí', r => r.x.headcount], ['Platia €/h', r => r.x.rate_client], ['Dáme €/h', r => r.x.rate_worker],
            ['Marža €/h', r => r.marza], ['Nástup', r => r.x.start_date], ['Stav', r => statusLabel(r.stav)],
            ['Prišiel', r => r.created], ['Zdroj', r => r.source],
            ['Čo chýba', r => (r.live ? r.chyba.map(c => c.title).join(', ') : '')],
          ],
        },
      };
    },

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

    // ── Pridanie: štyri polia, nič viac ───────────────────────────────────
    /**
     * Formulár má zámerne štyri polia. Kto telefonát prijal, nemá dopisovať
     * pätnásť — zvyšok doplní ten, kto to bude riešiť. Vysoký prah znamená,
     * že sa možnosť nezapíše vôbec, a to je najhoršie, čo sa môže stať.
     */
    form() {
      UI.modal('Nový dopyt', `
        <form id="opp-form" onsubmit="event.preventDefault();Opp.save()">
          <div class="regimebox">Stačí to, čo viete z telefonátu. Ostatné sa dopĺňa potom —
            dopyt, ktorý nie je zapísaný, neexistuje.</div>
          <div class="form-grid">
            <div class="fld-full">${UI.field('title', 'O čo ide', { required: true,
              placeholder: 'napr. Kotolňa Wörthsee — zvárači',
              hint: 'Krátko, aby sa to dalo nájsť v zozname.' })}</div>
            ${UI.field('company_name', 'Firma', { placeholder: 'kto sa ozval' })}
            ${UI.field('contact_phone', 'Telefón', {
              hint: 'E-mail môže ležať tri dni. Telefón je to, čím sa dopyt pohne.' })}
          </div>
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
          <div class="regimebox">Vložte celý e-mail aj s podpisom. Appka z neho vytiahne
            jednotlivé stavby — mesto, počet ľudí, sadzbu a termín — a ukáže Vám ich
            skôr, než sa čokoľvek založí.</div>
          ${UI.field('text', 'E-mail od odberateľa', { type: 'textarea', rows: 12,
            required: true, placeholder: 'Sem vložte celý e-mail, pokojne aj po nemecky.',
            tip: 'Text e-mailu prečíta umelá inteligencia a rozdelí ho na jednotlivé stavby. Po kliknutí sa ešte nič neuloží — najprv uvidíte, čo našla.' })}
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
        return UI.toast('Vložte celý e-mail — z dvoch viet sa stavby vytiahnuť nedajú', 'err');
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

        <div class="form-section">Stavby — odškrtnite, čo nechcete${UI.tip('Zelená bodka = stavba má všetko potrebné. Oranžová = niečo chýba (napr. mesto alebo počet ľudí), založiť sa dá aj tak a doplníte to neskôr.')}</div>
        <div id="inq-stavby">${this.inqRowsHtml()}</div>

        ${q.risks.length ? `<div class="form-section">Na čo si dať pozor</div>
          ${q.risks.map(r => `<div class="list-row" style="align-items:flex-start;">
            <span class="dot amber" style="margin-top:5px;"></span>
            <span style="flex:1;font-size:13px;">${UI.esc(r)}</span></div>`).join('')}` : ''}

        <div class="inq-next">
          <b>${Icon('zap', 15)} Čo sa stane po kliknutí</b>
          <ol>
            <li>Každá stavba sa zapíše ako dopyt (krok 1).</li>
            <li>Ku každej sa založí nábor s termínom podľa plánu (krok 2).</li>
            <li>Appka napíše podklady: texty inzerátov a otázky do telefonátu.</li>
          </ol>
          <span>Nič sa nezverejní samo — texty si pred spustením prečítate.</span>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
          <span style="align-self:center;display:inline-flex;">${UI.tip('Len zapísať dopyty: stavby sa uložia do zoznamu Dopyty a nič viac. Založiť nábor: navyše sa ku každej stavbe založí nábor (zatiaľ ako koncept) a appka napíše texty inzerátov.')}</span>
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
            <b>${UI.esc(opts.title || 'Náborový plán')}${UI.tip('Odhad, koľko ľudí treba nabrať v ktorom týždni, aby boli na stavbe včas. Počíta so stropom, koľko ľudí zvládneme nabrať za týždeň (dá sa zmeniť v Nastaveniach).')}</b>
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
            ? `<span class="inq-when is-late">${Icon('alert', 12)} ľudí budete mať ${UI.date(sp.ready)} —
                o ${sp.lateDays} ${Shell.plural(sp.lateDays, 'deň', 'dni', 'dní')} po nástupe</span>`
            : `<span class="inq-when">${Icon('check', 12)} ľudí budete mať do ${UI.date(sp.ready)}</span>`)
          : '';
        return `
          <div class="list-row" style="align-items:flex-start;">
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
                chýba ${UI.esc(Inq.problems(p).map(x => x.title).join(', '))} — doplníte to po založení</span>` : ''}
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
          zvyčajne 1–2 minúty. Okno môžete zavrieť — podklady sa dopíšu aj tak
          a uvidíte ich v Nábore.</div>`
          : `<div class="headline headline-ok">${Icon('check', 18)}
            <span>Dopyty sú zapísané a ku každému je nábor.</span></div>`}
        <div class="prep-list">${rows.map(x => `
          <div class="prep-row prep-${x.state}">
            <span class="prep-ico">${Icon(IKONA[x.state] || 'clock', 16)}</span>
            <span class="prep-txt">
              <b>${UI.esc(x.title || x.city || 'Nábor')}</b>
              <em>${UI.esc(x.state === 'run' ? 'Pripravujem podklady…'
                : x.state === 'nobrief' ? 'Bez zadania — dopíšte ho v nábore a dajte pripraviť podklady.'
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
            <li>Otvorte nábor a prečítajte texty — opravte, čo nesedí.</li>
            <li>Vložte inzeráty (web, Bazoš, Facebook) a kliknite na „Spustiť nábor".</li>
            <li>Kto sa ozve, tomu zavolajte do desiatich minút.</li>
          </ol>
        </div>` : ''}
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal();Danubra.renderRoute()">Zavrieť</button>
          ${!bezi ? `<button class="btn btn-primary" onclick="UI.closeModal();Danubra.go('hiring')">
            ${Icon('zap')} Otvoriť nábor</button>` : ''}
        </div>`, { wide: true });
      if (hotovo) {
        const ok = rows.filter(x => x.state === 'ok').length;
        UI.toast(`Hotovo — ${rows.length} ${Shell.plural(rows.length, 'nábor', 'nábory', 'náborov')}`
          + (ok ? `, podklady pre ${ok}` : ''), ok === rows.length ? 'ok' : 'warn');
      }
    },

    async save() {
      const d = UI.formData(document.getElementById('opp-form'));
      if (!d.title) return UI.toast('Napíšte aspoň, o čo ide', 'err');
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
      const quotes = await this.quotesOf(x.id);

      el.innerHTML = Danubra.header(x.title,
        [x.company_name, x.city].filter(Boolean).map(UI.esc).join(' · '), '', [x.title]) + `
        <div class="detail-head">
          ${this.badge(x.status)}
          <select class="verif-sel" onchange="Opp.setStatus('${x.id}',this.value)">
            ${O.STATUS.map(s => `<option value="${s[0]}" ${x.status === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('')}
          </select>
          ${UI.tip('Kde dopyt je. ' + O.STATUS.map(s => `${s[1]}: ${s[3].charAt(0).toLowerCase()}${s[3].slice(1)}`).join(' ') + ' Pri „Stratená" sa appka opýta prečo.')}
        </div>

        ${Shell.now({
          title: v.label, what: v.detail, hot: v.state === 'invalid',
          why: x.verified_at ? `Pýtali sme sa ${UI.date(x.verified_at)}. Staré overenie `
            + 'nie je overenie — pri zmene firmy to zopakujte.' : '',
        }, {
          label: 'Firma', help: 'card.opp.verify',
          action: x.company_vat ? { ico: 'shield', onclick: `Opp.verify('${x.id}')`,
            label: x.verify_result ? 'Preveriť znova' : 'Preveriť v registri' } : null,
        })}

        ${chyba.length ? `<div class="form-section">Čo doplniť</div>
          ${chyba.map(c => `<div class="list-row" style="align-items:flex-start;">
            <span class="dot amber" style="margin-top:5px;"></span>
            <span style="flex:1;font-size:13px;"><strong>${UI.esc(c.title)}</strong>
              <span style="display:block;color:var(--ink-mute);font-size:12px;">${UI.esc(c.why)}</span>
            </span></div>`).join('')}` : ''}

        <div class="form-section">Údaje</div>
        <div class="kit-facts">
          ${this.fieldHtml(x, 'company_name', 'Firma')}
          ${this.fieldHtml(x, 'company_vat', 'USt-IdNr', 'text', 'Nemecké IČ DPH firmy (napr. DE123456789). Podľa neho firmu preveríme v registri EÚ a bez platného čísla nemôžeme fakturovať bez DPH (prenesenie daňovej povinnosti, §13b).')}
          ${this.fieldHtml(x, 'contact_name', 'Kontakt')}
          ${this.fieldHtml(x, 'contact_phone', 'Telefón')}
          ${this.fieldHtml(x, 'contact_email', 'E-mail')}
          ${this.fieldHtml(x, 'city', 'Mesto')}
          ${this.fieldHtml(x, 'headcount', 'Koľko ľudí', 'number')}
          ${this.fieldHtml(x, 'rate_client', 'Platia €/h', 'number', 'Koľko nám odberateľ zaplatí za jednu odpracovanú hodinu jedného človeka. Bez DPH.')}
          ${this.fieldHtml(x, 'rate_worker', 'Dáme €/h', 'number', 'Koľko zaplatíme živnostníkovi za jednu jeho hodinu. Bez DPH. Rozdiel oproti „Platia" je naša marža.')}
          ${this.fieldHtml(x, 'start_date', 'Nástup', 'date', 'Deň, od ktorého majú byť ľudia na stavbe. Podľa neho sa plánuje, dokedy treba ľudí nabrať.')}
          <label class="kit-fact"><span>Remeslo</span>
            <select onchange="Opp.setField('${x.id}','trade_key',this.value)">
              <option value="">—</option>
              ${this.trades.map(t => `<option value="${t.key}" ${x.trade_key === t.key ? 'selected' : ''}>${UI.esc(t.name_sk)}</option>`).join('')}
            </select></label>
        </div>
        ${m.perHour != null ? `<div class="kit-sum ${m.pct >= 25 ? 'kit-ok' : 'kit-warn'}">
          Marža ${Money.format(m.perHour)}/h · ${UI.pct(m.pct)} zo sadzby odberateľa${UI.tip('„Platia €/h" mínus „Dáme €/h" = koľko nám ostane z jednej hodiny. Percento je z toho, čo platí odberateľ. Od 25 % je to zelené, menej je oranžové.')}</div>` : ''}

        <div class="form-section">Čo o tom vieme</div>
        <div class="kit-brief">
          <textarea id="opp-brief" rows="6"
            placeholder="Všetko, čo viete — aj neučesané.">${UI.esc(x.brief || '')}</textarea>
          <div class="kit-brief-acts">
            <button class="btn btn-outline btn-sm" onclick="Opp.saveBrief('${x.id}')">
              ${Icon('check', 14)} Uložiť</button>
            <span class="kit-note">Toto sa prenesie do náboru ako zadanie.</span>
          </div>
        </div>

        <div class="form-section">Čo z toho spraviť${UI.tip('Z dopytu sa dá pokračovať tromi smermi a dajú sa robiť aj všetky naraz: nábor = začneme hľadať ľudí; ponuka = pošleme odberateľovi cenu; zákazka = keď je dohodnuté, založí sa spis stavby. Všade sa prenesie, čo je v dopyte zapísané.')}</div>
        ${x.plan_id ? `<div class="regimebox">${Icon('check', 14)}
          Nábor je založený. ${Danubra.link('plan', x.plan_id, 'Otvoriť nábor')}</div>`
          : `<button class="btn btn-primary btn-block" onclick="Opp.makePlan('${x.id}')">
              ${Icon('zap', 17)} Spraviť z toho nábor</button>
             <div class="kit-note" style="margin-top:6px;">Zadanie sa prenesie a analýza
               z neho spraví podklady, otázky do hovoru aj polia náboru.${UI.tip('Založí sa nábor ako koncept — nič sa nezverejní. Dopyt sa prepne na „Preverujeme". Texty inzerátov si potom spustíte v Nábore sami.')}</div>`}
        ${this.quotesHtml(quotes)}
        <div class="opp-next-acts" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">
          <button class="btn btn-outline" onclick="Opp.toQuote('${x.id}')">
            ${Icon('offers', 15)} ${quotes && quotes.length ? 'Spraviť ďalšiu ponuku' : 'Spraviť ponuku'}</button>
          ${x.subcontract_id
            ? `<span class="regimebox" style="margin:0;">${Icon('check', 14)} Zákazka je založená.
                ${Danubra.link('subcontract', x.subcontract_id, 'Otvoriť zákazku')}</span>`
            : `<button class="btn btn-outline" onclick="Opp.toSubcontract('${x.id}')">
                ${Icon('site', 15)} Založiť zákazku</button>`}
          <span style="align-self:center;display:inline-flex;">${UI.tip('Spraviť ponuku: otvorí sa nová ponuka predvyplnená z dopytu (odberateľ, remeslo, počet ľudí, mesto, termín, sadzby). Uloží sa ako koncept, nič sa neodošle samo. Založiť zákazku: otvorí sa formulár zákazky predvyplnený z dopytu; po uložení sa dopyt označí ako vyhraný a zákazka bude vedieť, koľko ľudí treba nasadiť.')}</span>
        </div>`;
    },

    // ── Ponuky z dopytu ───────────────────────────────────────────────────
    /**
     * Ponuky, ktoré vznikli z dopytu (`danubra_quotes.opportunity_id`,
     * migrácia 074). Kto nesmie na ponuky, nedostane nič — `null` znamená
     * „nevieme", nie „žiadna".
     * @returns {Promise<Array|null>}
     */
    async quotesOf(oppId) {
      if (!Danubra.can('quotes')) return null;
      const { data } = await DB.list('quotes', {
        select: 'id,quote_number,title,status,charge_rate,headcount,hours_per_month,created_at',
        filters: { opportunity_id: oppId },
        order: { column: 'created_at', ascending: false }, limit: 50,
      });
      return data || [];
    },

    quotesHtml(list) {
      if (!list || !list.length) return '';
      const kind = (st) => (window.Quo ? Quo.statusKind(st) : 'gray');
      const label = (st) => (window.Enums ? Enums.label('quote_status', st) : st);
      return `<div class="opp-quotes" style="margin-top:10px;">
        <div class="kit-note" style="margin-bottom:4px;">Ponuky z tohto dopytu${UI.tip('Ponuky, ktoré vznikli tlačidlom „Spraviť ponuku" pri tomto dopyte. Kliknutím otvoríte detail ponuky — maržu, stav a PDF. Sadzba je to, čo fakturujeme odberateľovi za hodinu jedného človeka, bez DPH; mesačne = sadzba × ľudia × hodiny mesačne.')}</div>
        ${list.map(q => {
          const mes = q.charge_rate && q.hours_per_month
            ? Number(q.charge_rate) * (Number(q.headcount) || 1) * Number(q.hours_per_month) : null;
          return `<div class="list-row">
            <span style="flex:1;min-width:0;font-size:13px;">
              ${Danubra.link('quote', q.id, q.quote_number || q.title || 'Ponuka')}
              ${UI.badge(label(q.status), kind(q.status))}
              <span style="display:block;color:var(--ink-mute);font-size:12px;">
                ${UI.esc(q.title || '')}${q.charge_rate ? ` · ${UI.money(q.charge_rate)}/h` : ' · bez sadzby'}${
                  q.headcount ? ` · ${q.headcount} ${Shell.plural(Number(q.headcount), 'človek', 'ľudia', 'ľudí')}` : ''}${
                  mes ? ` · ${UI.money(mes)} mesačne` : ''}</span>
            </span>
          </div>`;
        }).join('')}
      </div>`;
    },

    // ── Z dopytu ponuka a zákazka ─────────────────────────────────────────
    /**
     * Odberateľ pre ponuku aj zákazku. Dopyt má len názov firmy a USt-IdNr,
     * ponuka a zákazka potrebujú záznam odberateľa. Keď sa nenájde, ponúkne
     * sa založiť ho z údajov dopytu — nič sa nezakladá bez potvrdenia.
     *
     * @returns {Promise<string|null>} id odberateľa, alebo null (vyberie ručne)
     */
    async partnerFor(x) {
      const { data } = await DB.list('partners', { select: 'id,name,ust_idnr', limit: 500 });
      const found = O.matchPartner(x, data || []);
      if (found) return found.id;
      if (!x.company_name) return null;
      const v = await UI.askFields('Nový odberateľ z dopytu',
        `Firma „${x.company_name}" ešte nie je medzi odberateľmi. Založte ju — údaje sú z dopytu a môžete ich opraviť. Keď zrušíte, odberateľa vyberiete vo formulári sami.`,
        [
          ['name', 'Názov firmy', { required: true, value: x.company_name }],
          ['ust_idnr', 'USt-IdNr', { value: x.company_vat || '', placeholder: 'DE123456789' }],
          ['contact_person', 'Kontaktná osoba', { value: x.contact_name || '' }],
          ['phone', 'Telefón', { value: x.contact_phone || '' }],
          ['email', 'E-mail', { type: 'email', value: x.contact_email || '' }],
          ['country', 'Krajina', { value: x.company_country || 'DE',
            options: [['DE', 'Nemecko'], ['AT', 'Rakúsko'], ['SK', 'Slovensko']] }],
        ], { ok: 'Založiť odberateľa' });
      if (!v) return null;
      const row = { ...v, is_construction: true };
      // Overenie z dopytu sa prenesie — nech sa firma nemusí overovať druhýkrát.
      if (x.verify_result && (v.ust_idnr || '') === (x.company_vat || '')) {
        row.vies_result = x.verify_result; row.vies_checked_at = x.verified_at || null;
      }
      const { data: p, error } = await DB.insert('partners', row);
      if (error) { UI.toast('Odberateľa sa nepodarilo založiť: ' + error.message, 'err'); return null; }
      ['Prt', 'Quo', 'Sub', 'Con'].forEach(g => { if (window[g]) window[g].loaded = false; });
      UI.toast(`Odberateľ ${p.name} je založený`, 'ok');
      return p.id;
    },

    /** „Spraviť ponuku" — nová ponuka predvyplnená z dopytu. */
    async toQuote(id) {
      const x = this.items.find(o => o.id === id);
      if (!x || !window.Quo) return;
      const partnerId = await this.partnerFor(x);
      const pre = { ...O.toQuote(x, partnerId), _fromOpp: true,
        _company: partnerId ? null : (x.company_name || null) };
      await Quo.create(pre);
    },

    /**
     * „Založiť zákazku" — formulár zákazky predvyplnený z dopytu. Väzbu
     * zapíše až po uložení: dopyt dostane `subcontract_id` (podľa neho krok 2
     * zákazky vie, koľko ľudí treba) a stav „Vyhrali sme". Keď z dopytu už
     * je nábor, prepojí sa so zákazkou aj on — prijatého kandidáta z neho
     * potom appka vie rovno nasadiť.
     */
    async toSubcontract(id) {
      const x = this.items.find(o => o.id === id);
      if (!x || !window.Sub) return;
      if (x.subcontract_id) return Danubra.open('subcontract', x.subcontract_id);
      const partnerId = await this.partnerFor(x);
      if (!Sub.loaded) { UI.modal('Pripravujem zákazku', UI.loading()); await Sub.load(); }
      Sub.form(null, {
        values: O.toSubcontract(x, partnerId),
        onCreated: async (sc) => {
          const patch = { subcontract_id: sc.id, status: 'won' };
          const { error } = await DB.update('opportunities', x.id, patch);
          if (error) return UI.toast('Zákazka je založená, ale k dopytu sa nepripojila: ' + error.message, 'err');
          Object.assign(x, patch);
          if (x.plan_id) {
            await DB.update('recruitment_plans', x.plan_id, { subcontract_id: sc.id });
            if (window.Hire) Hire.loaded = false;
          }
          Danubra._chain = null;
          UI.toast('Zákazka je založená a pripojená k dopytu', 'ok');
        },
      });
    },

    /** Jedno pole, ktoré sa ukladá hneď po zmene — bez tlačidla „uložiť". */
    fieldHtml(x, key, label, type = 'text', tip = '') {
      return `<label class="kit-fact"><span>${UI.esc(label)}${tip ? UI.tip(tip) : ''}</span>
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
        <p class="modal-lead"><b>${UI.esc(x.title)}</b></p>
        <div class="regimebox">Zo zoznamu aj z počítadiel zmizne. Nič sa nemaže —
          nájdete ho pod „Odstránené" a dá sa vrátiť.</div>
        <div class="form-section">Prečo</div>
        <div class="opp-why">
          ${DOVODY.map((d, i) => `<label class="opp-why-opt"><input type="radio" name="opp-why"
            value="${UI.esc(d)}" ${i === 0 ? 'checked' : ''}> ${UI.esc(d)}</label>`).join('')}
          <label class="opp-why-opt"><input type="radio" name="opp-why" value="__ine"> Iný dôvod:
            <input id="opp-why-text" class="opp-why-text" placeholder="napíšte krátko"
              onfocus="document.querySelector('input[name=opp-why][value=__ine]').checked=true"></label>
        </div>
        ${x.plan_id ? `<div class="chk-row"><label class="chk" style="display:flex;gap:8px;align-items:flex-start;">
          <input type="checkbox" id="opp-plan-too" checked>
          <span>Zrušiť aj nábor${nabor ? ` „${UI.esc(nabor.title)}"` : ''}, ktorý z neho vznikol.
            <em class="muted-sm" style="display:block;font-style:normal;">
            Nábor sa nezmaže — dostane stav „zrušený" a texty ostanú.</em></span></label></div>` : ''}
        <div class="modal-actions">
          <button class="btn btn-danger" onclick="Opp.archive('${x.id}')">${Icon('trash', 14)} Odstrániť</button>
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
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
      UI.toast('Dopyt je odstránený — nájdete ho pod „Odstránené"', 'ok');
      Danubra._chain = null;
      Danubra.renderRoute();
    },

    async restore(id) {
      const x = this.items.find(o => o.id === id);
      if (!x) return;
      const { error } = await DB.update('opportunities', id, { archived_at: null, archived_reason: null });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      x.archived_at = null; x.archived_reason = null;
      // Posledný vrátený: zoznam „Odstránené" by ostal prázdny — späť na rozpracované.
      const st = window.DataList && DataList.state('dopyty');
      if (!this.archived().length && st && JSON.stringify(st.f.stav) === '["__arch"]') {
        DataList.set('dopyty', 'stav', this.OPEN_STATUSES);
      }
      UI.toast('Dopyt je späť v zozname. Nábor, ak bol zrušený, obnovte v Nábore.', 'ok');
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
      if (!x || !x.company_vat) return UI.toast('Najprv doplňte USt-IdNr', 'err');
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
        return UI.toast('Najprv napíšte, čo o tom vieme — to sa prenesie ako zadanie', 'err');
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

      const { error: e2 } = await DB.update('opportunities', id, { plan_id: data.id, status: 'checking' });
      if (e2) UI.toast('Nábor je založený, ale k dopytu sa nepripojil: ' + e2.message, 'err');
      else { x.plan_id = data.id; x.status = 'checking'; }
      if (window.Hire) Hire.loaded = false;
      if (!e2) UI.toast('Nábor založený — zadanie je v ňom', 'ok');
      Danubra.go('hiring');
      setTimeout(() => window.Hire && Hire.detail(data.id), 300);
    },
  };

  window.Opp = Opp;
  Danubra.views.opportunities = function (el) { return Opp.view(el); };
})();
