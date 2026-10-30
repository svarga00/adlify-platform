// ============================================================================
// DANUBRA — M6 Faktúry (zoznam, schvaľovanie návrhov, dokument s QR, úhrada)
// ============================================================================
// §5.2: návrhy za priebežnú službu vyžadujú ľudské schválenie pred odoslaním.
// ============================================================================
(function () {
  // Stavy z v1 (`draft_pending_approval`) aj z v2. Faktúry v1 majú vlastný
  // tok a bežia v prevádzke — nové pravidlá sa na ne nevzťahujú.
  // Popisky sú jednotné pre celú fakturáciu (lib/billing/invoice.js):
  // Návrh → Čaká na schválenie → Schválená → Vystavená → Odoslaná → Zaplatená;
  // Po splatnosti; Stornovaná. Hodnoty v databáze sa nemenia.
  const L = (s) => DanubraInvoice.statusLabel(s);
  const STATUS = [
    ['draft', L('draft'), 'gray'],
    ['draft_pending_approval', L('draft_pending_approval'), 'amber'],
    ['pending_approval', L('pending_approval'), 'amber'],
    ['approved', L('approved'), 'blue'],
    ['issued', L('issued'), 'blue'],
    ['sent', L('sent'), 'blue'],
    ['paid', L('paid'), 'green'],
    ['overdue', L('overdue'), 'red'],
    ['cancelled', L('cancelled'), 'gray'],
  ];
  const TYPE = {
    service_fee: 'Sprostredkovanie', ongoing_service: 'Priebežná služba',
    retainer: 'Retainer', other: 'Iné', standard: 'Faktúra odberateľovi',
  };
  const REGIME = {
    sk_no_vat: 'SK bez DPH', eu_reverse_charge: 'Reverse charge', other: 'Na kontrolu',
  };
  // Otáznik pri stave faktúry: čo ten stav znamená a čo bude ďalej.
  const STATUS_TIP = {
    draft: 'Návrh: faktúra je len pripravená a nikto ju ešte neposlal na schválenie. '
      + 'Dá sa voľne upravovať, odberateľ o nej nevie.',
    pending_approval: 'Čaká na schválenie: faktúru musí pozrieť a schváliť administrátor. '
      + 'Faktúra sa nikdy nevystaví ani neodošle bez schválenia adminom.',
    approved: 'Schválená: admin ju odsúhlasil a odteraz sa už nemení. Odberateľ ju ešte nemá — '
      + 'ďalší krok je vystaviť ju v SuperFaktúre.',
    issued: 'Vystavená: faktúra je platný doklad s číslom. Odberateľovi ešte e-mailom neodišla, '
      + 'kým ju neodošlete.',
    sent: 'Odoslaná: faktúra odišla odberateľovi e-mailom. Čaká sa na peniaze; keď prídu na účet '
      + 'a spárujú sa v Banke, faktúra sa označí ako zaplatená.',
    paid: 'Zaplatená: peniaze prišli na účet. Faktúra je uzavretá, už sa s ňou nič nerobí.',
    overdue: 'Po splatnosti: dátum splatnosti uplynul a peniaze neprišli. Appka to označí sama '
      + '(vystavenú aj odoslanú faktúru, nikdy zaplatenú ani stornovanú). '
      + 'Treba odberateľovi zavolať alebo poslať upomienku.',
    cancelled: 'Stornovaná: faktúra je zrušená a nepočíta sa do žiadnych súm.',
  };
  STATUS_TIP.draft_pending_approval = STATUS_TIP.pending_approval;
  const TIP_NUMBER = 'Číslo faktúry pridelí appka sama z číselného radu (Nastavenia → Číselné rady). '
    + 'Jeho číslice sú zároveň variabilný symbol — podľa neho sa platba v Banke spáruje s faktúrou.';
  const TIP_ITEMS = 'Každý riadok je jedna položka: popis, množstvo, MJ (merná jednotka, napr. h, ks, km) '
    + 'a cena za jednu jednotku. Suma riadku = množstvo × cena. DPH sa nepripočítava.';
  /** Dlaždica výberu v okne — rovnaká pri každej voľbe „z čoho". */
  const pickTile = ({ ico, title, sub, action }) => `
    <button class="pick-tile" onclick="${action}">
      ${ico ? `<span class="pick-ico">${Icon(ico, 20)}</span>` : ''}
      <span class="pick-txt"><b>${title}</b>${sub ? `<em>${sub}</em>` : ''}</span>
      <span class="pick-go">${Icon('chevron', 16)}</span></button>`;

  const Inv = {
    items: [], lines: [], clients: [], orders: [], partners: [], overrides: [],
    loaded: false,
    filters: { status: '', q: '', period: 'all', from: '', to: '' },

    async load() {
      // Odberatelia sa načítavajú spolu s faktúrami: v2 faktúra má
      // `partner_id`, nie `client_id`, a v zozname sa preto ukazovala pomlčka
      // namiesto nemeckej firmy, ktorej sa fakturuje.
      const [i, l, c, o, p, ovr] = await Promise.all([
        DB.list('invoices', { order: { column: 'issue_date', ascending: false }, limit: 500 }),
        DB.list('invoice_items', { limit: 3000 }),
        DB.list('clients', { select: 'id,name,country,vat_id,company_id,contact_person,phone,email,whatsapp', limit: 500 }),
        DB.list('orders', { select: 'id,order_number,client_id,service_fee,urgent_surcharge,date_from,date_to,persons,ongoing_service_enabled,ongoing_service_rate,status', limit: 500 }),
        DB.list('partners', { select: 'id,name,city,country,ust_idnr', limit: 300 }),
        DB.list('overrides', { limit: 1000 }),
      ]);
      this.items = i.data || []; this.lines = l.data || [];
      this.clients = c.data || []; this.orders = o.data || [];
      this.partners = p.data || [];
      this.overrides = ovr.data || [];
      this.loaded = true;
      await this._markOverdue();
      if (this.loadReminders) await this.loadReminders();
    },

    /**
     * Faktúry po splatnosti appka označí sama (§7 denný cron robí to isté
     * serverovo). Vystavené aj odoslané — odoslaná je najčastejší prípad,
     * na ktorý sa predtým zabúdalo. Zaplatené a stornované nikdy.
     */
    async _markOverdue() {
      const late = DanubraInvoice.becameOverdue(this.items, Danubra._dayISO());
      for (const x of late) {
        // Keď databáza zmenu odmietne, obrazovka nesmie tvrdiť opak.
        const r = await DB.update('invoices', x.id, { status: 'overdue' }).catch(e => ({ error: e }));
        if (!(r && r.error)) x.status = 'overdue';
      }
    },

    clientOf(id) { return this.clients.find(c => c.id === id); },
    // Položka vyhodená z návrhu sa nemaže, len dostane `removed_at`.
    linesOf(id) { return this.lines.filter(l => l.invoice_id === id && !l.removed_at); },
    badge(s) { const m = STATUS.find(x => x[0] === s) || STATUS[1]; return UI.badge(m[1], m[2]); },
    /** Stav aj s otáznikom — v detaile, kde je miesto na vysvetlenie. */
    badgeTip(s) { return this.badge(s) + UI.tip(STATUS_TIP[s] || ''); },

    async view(el) {
      Danubra.setActions(`
        <button class="btn btn-outline btn-sm" onclick="Inv.monthly()">${Icon('calendar', 14)} Mesačná fakturácia</button>
        <button class="btn btn-outline btn-sm" onclick="Inv.dunningList()">${Icon('alert', 14)} Upomienky${
          this.loaded && this.dunQueue && this.dunQueue().length ? ` (${this.dunQueue().length})` : ''}</button>
        <button class="btn btn-outline btn-sm" onclick="Inv.books()">${Icon('download', 14)} Pre účtovníčku</button>
        <button class="btn btn-primary btn-sm" onclick="Inv.newInvoice()">${Icon('plus')} Nová faktúra</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      // Zákazka v stĺpci zoznamu: názvy zákaziek sú v dátach faktúry v2.
      if (!this.v2.loaded) { try { await this.loadV2(); } catch (e) { /* zoznam pôjde aj bez názvov zákaziek */ } }

      // Stavy v1 a v2 sa volajú inak (`draft_pending_approval` vs
      // `pending_approval`, `issued` vs `sent`). Keď sa vymenúvajú tie, čo
      // sa rátajú, na nový stav sa zabudne a hlavička potichu ukáže nulu —
      // presne to sa stalo. Preto sa vymenúva opak: čo už neuhradené **nie je**.
      const SETTLED = ['paid', 'cancelled', 'draft'];
      const pending = this.items.filter(x =>
        ['draft_pending_approval', 'pending_approval'].includes(x.status));
      const unpaid = this.items.filter(x => !SETTLED.includes(x.status));
      // V centoch: súčet floatov by pri stovkách faktúr ukázal o cent iné číslo.
      const unpaidSum = Money.fromCents(Money.sum(unpaid.map(x => Money.toCents(x.total || 0))));

      // Čo na faktúrach čaká na nás. Zoznam s filtrami nepovie, čo spraviť —
      // povie, čo tam je. Toto povie jedno aj druhé.
      const q = DanubraInvoice.queue(this.items, Danubra._dayISO());

      // Zoznam je spoločný komponent (`DataList`): stĺpce, filtre s počtami,
      // čipy, zoradenie, súčet v päte a na telefóne karty. Dovtedy tu boli
      // pilulky stavov, hľadanie, obdobie a karty v dvoch skupinách — pilulky
      // sú dnes filter „Stav" (s počtami), skupiny „Čaká na Vás / Ostatné"
      // sú zoskupenie „Čo je na rade".
      el.innerHTML = Danubra.header(Danubra.labelOf('invoices'),
        `${this.items.length} celkom · nezaplatené ${UI.money(unpaidSum)}`) +
        this.nowHtml(q) +
        DataList.html(this.listConfig(this.listRows(q)));

      // Odkaz odinakiaľ („Otvoriť návrhy" po mesačnej fakturácii) nastaví
      // `Inv.filters.status` — zoznam si ho prevezme ako filter stavu.
      const pre = this.filters.status;
      if (pre) {
        this.filters.status = '';
        DataList.set('faktury', 'stav', [pre === 'draft_pending_approval' ? 'pending_approval' : pre]);
      }
    },

    /** Stavy, s ktorými sa ešte pracuje — predvolený filter zoznamu („Otvorené"). */
    OPEN_STATUSES: ['draft', 'pending_approval', 'approved', 'issued', 'sent', 'overdue'],

    /**
     * Riadok zoznamu: faktúra a to, čo sa o nej počíta raz za vykreslenie.
     * „Po splatnosti" a „čaká na Vás" berie z tej istej knižnice ako veta
     * hore (`DanubraInvoice.queue`), aby zoznam a veta nehovorili dve veci.
     */
    listRows(q) {
      const today = Danubra._dayISO();
      const DL = DanubraDataList;
      const late = new Set((q.overdue || []).map(x => x.id));
      const nase = new Set([...(q.pending || []), ...(q.drafts || [])].map(x => x.id));
      const subs = new Map(((this.v2 && this.v2.subcontracts) || []).map(s => [s.id, s.title || s.contract_number || 'Zákazka']));
      const OPEN = ['issued', 'sent', 'overdue'];
      return this.items.map(x => {
        const who = this.counterparty(x);
        const st = x.status === 'draft_pending_approval' ? 'pending_approval' : x.status;
        const due = x.due_date ? String(x.due_date).slice(0, 10) : '';
        const open = OPEN.includes(x.status);
        // Suma v centoch. Čo reálne príde (po zrážke §48b), počíta knižnica.
        const w = DanubraInvoice.withholding(x);
        const dun = this.dunQueue ? DanubraDunning.next(x, this.reminders, today) : null;
        return {
          id: x.id, x, st, who,
          number: x.invoice_number || '',
          partner: who ? who.name : '', partnerKey: who ? `${who.type}:${who.id}` : '',
          subTitle: x.subcontract_id ? (subs.get(x.subcontract_id) || 'Zákazka') : '',
          late: late.has(x.id), ours: nase.has(x.id), open,
          days: due ? DL.daysBetween(today, due) : null,
          cents: w.gross, net: w.net, withheld: w.withheld,
          left: open ? w.net : 0,
          currency: x.currency || 'EUR',
          reminders: dun ? dun.count : 0, dun,
          rad: nase.has(x.id) ? 'nas' : late.has(x.id) ? 'late' : open || x.status === 'approved' ? 'wait' : 'done',
        };
      });
    },

    /** Suma v centoch v mene faktúry (Money.format píše vždy €). */
    fmt(cents, currency) {
      return !currency || currency === 'EUR' ? Money.format(cents) : UI.money(Money.fromCents(cents), currency);
    },

    /** Súčet v päte zoznamu: v centoch a po menách (euro a koruna sa nesčítajú). */
    footSums(rows, pick) {
      const by = new Map();
      for (const r of rows) {
        const c = r.currency || 'EUR';
        if (!by.has(c)) by.set(c, []);
        by.get(c).push(pick(r));
      }
      return [...by.entries()].map(([c, list]) => this.fmt(Money.sum(list), c)).join(' + ');
    },

    /** Konfigurácia zoznamu faktúr pre `DataList`. */
    listConfig(rows) {
      const DL = DanubraDataList;
      const dni = (n) => `${n} ${Shell.plural(n, 'deň', 'dni', 'dní')}`;
      // Dátum bez roka, keď je tohtoročný — stĺpce sú užšie a rok je jasný.
      const rok = Danubra._dayISO().slice(0, 4);
      const day = (d) => DL.fmtDay(d, { year: String(d).slice(0, 4) !== rok });
      const statusIdx = (k) => { const i = STATUS.findIndex(s => s[0] === k); return i < 0 ? 99 : i; };
      const RAD = { nas: ['Čaká na Vás', 'amber'], late: ['Po splatnosti', 'red'], wait: ['Čaká na peniaze', 'blue'], done: ['Uzavreté', 'gray'] };
      const admin = Danubra.isAdmin();
      const dueCell = (r) => {
        if (!r.x.due_date) return '';
        const d = `<b>${day(r.x.due_date)}</b>`;
        if (!r.open && r.x.status !== 'approved') return `<span class="dl-two">${d}</span>`;
        let note = '';
        if (r.days != null && r.days < 0) note = `<span class="dl-note is-red">po splatnosti ${dni(-r.days)}</span>`;
        else if (r.days === 0) note = '<span class="dl-note is-amber">splatná dnes</span>';
        else if (r.days != null) note = `<span class="dl-note ${r.days <= 7 ? 'is-amber' : 'is-mute'}">splatná o ${dni(r.days)}</span>`;
        return `<span class="dl-two">${d}${note}</span>`;
      };
      const payCell = (r) => {
        if (r.x.status === 'paid') {
          return `<span class="dl-two"><span class="dl-ok">${Icon('check', 13)} uhradená</span>${
            r.x.paid_at ? `<small>${DL.fmtDay(r.x.paid_at)}</small>` : ''}</span>`;
        }
        if (!r.open) return '';
        return `<span class="dl-two"><b class="dl-num">${this.fmt(r.left, r.currency)}</b><small>zostáva${r.withheld ? ' po §48b' : ''}</small></span>`;
      };
      const dunCell = (r) => {
        const d = r.dun;
        if (!d) return '';
        if (d.due) {
          return `<button type="button" class="tip-btn dl-flag${d.level >= 2 ? '' : ' is-amber'}"
            data-tip="${UI.esc(`Na rade: ${d.meta.sk}. Vytvorí sa v detaile faktúry alebo cez tlačidlo Upomienky.`)}"
            aria-label="Na rade upomienka: ${UI.esc(d.meta.sk)}">${Icon('alert', 12)} na rade ${d.level}.</button>`;
        }
        if (!d.count) return '';
        const last = d.last || {};
        const m = DanubraDunning.meta(last.level) || {};
        return `<span class="dl-two"><b>${d.count}× poslaná</b><small>${UI.esc(m.sk || '')}${last.sent_at ? ` · ${DL.fmtDay(last.sent_at)}` : ''}</small></span>`;
      };

      return {
        id: 'faktury', storageKey: 'faktury', label: 'Vydané faktúry',
        noun: ['faktúra', 'faktúry', 'faktúr'],
        rows,
        rowClick: (r) => Inv.detail(r.id),
        rowClass: (r) => (r.late ? 'is-hot' : r.ours ? 'is-warn' : r.rad === 'done' ? 'is-muted' : ''),
        rowLabel: (r) => `Faktúra ${r.number || 'bez čísla'}${r.partner ? ` — ${r.partner}` : ''}`,
        rowActions: [{ ico: 'chevron', label: 'Otvoriť faktúru', run: (r) => Inv.detail(r.id) }],
        columns: [
          { key: 'cislo', label: 'Faktúra', width: '108px', mobile: 'title',
            tip: TIP_NUMBER,
            // Pod číslom obdobie, za ktoré sa fakturuje; inak typ (okrem bežnej faktúry odberateľovi).
            render: (r) => {
              const sub = r.x.billing_period_from ? DL.rangeText(r.x.billing_period_from, r.x.billing_period_to)
                : r.x.type && r.x.type !== 'standard' ? (TYPE[r.x.type] || r.x.type) : '';
              return `<span class="dl-title">${r.number ? `<b class="mono">${UI.esc(r.number)}</b>`
                : '<b class="dl-nonum">Návrh bez čísla</b>'}${sub ? `<small>${UI.esc(sub)}</small>` : ''}</span>`;
            },
            sortValue: (r) => r.number, sortLabel: 'Číslo' },
          { key: 'odberatel', label: 'Odberateľ', width: 'minmax(120px, 1.2fr)',
            render: (r) => (r.who ? Danubra.link(r.who.type, r.who.id, r.who.name) : ''),
            sortValue: (r) => r.partner },
          { key: 'zakazka', label: 'Zákazka', width: 'minmax(100px, 1fr)', hideBelow: 1020,
            render: (r) => (r.x.subcontract_id ? Danubra.link('subcontract', r.x.subcontract_id, r.subTitle) : ''),
            sortValue: (r) => r.subTitle || null },
          { key: 'vystavena', label: 'Vystavená', width: '72px', mobileLabel: 'vystavená',
            render: (r) => (r.x.issue_date ? `<span class="dl-num">${day(r.x.issue_date)}</span>` : ''),
            sortValue: (r) => r.x.issue_date || null, sortDir: -1 },
          { key: 'splatnost', label: 'Splatnosť', width: '118px', mobileLabel: 'splatná',
            render: dueCell, sortValue: (r) => r.x.due_date || null },
          { key: 'suma', label: 'Suma', width: '100px', align: 'right', mobileLabel: 'suma',
            render: (r) => `<span class="dl-two"><b class="dl-num dl-amt">${this.fmt(r.cents, r.currency)}</b>${
              r.withheld ? `<small title="Zrážka §48b: odberateľ ju pošle nemeckému finančnému úradu, na účet príde ${UI.esc(this.fmt(r.net, r.currency))}">zrážka §48b</small>` : ''}</span>`,
            sortValue: (r) => r.cents, sortDir: -1, csv: false },
          { key: 'uhrada', label: 'Úhrada', width: '94px', align: 'right', mobileLabel: '',
            tip: 'Koľko z faktúry ešte má prísť na účet (po zrážke §48b). Zaplatená faktúra ukáže, kedy prišli peniaze.',
            render: payCell, sortValue: (r) => (r.open ? r.left : null), sortDir: -1, csv: false },
          { key: 'stav', label: 'Stav', width: '126px', mobile: 'badge',
            tip: 'Faktúra ide krokmi: Návrh → Čaká na schválenie → Schválená → Vystavená → '
              + 'Odoslaná → Zaplatená. Mimo poradia sú Po splatnosti (appka označí sama) a Stornovaná. '
              + 'Faktúra sa nikdy nevystaví ani neodošle bez schválenia adminom.',
            render: (r) => this.badge(r.x.status),
            // Predvolené poradie: čo čaká na Vás, po splatnosti, čo čaká na peniaze, uzavreté.
            sortValue: (r) => [['nas', 'late', 'wait', 'done'].indexOf(r.rad), r.x.due_date || '9999', statusIdx(r.st)],
            sortLabel: 'Čo je na rade' },
          { key: 'upomienky', label: 'Upomienky', width: '90px', hideBelow: 1120,
            tip: 'Koľko upomienok už odišlo a či je na rade ďalšia. Upomienka sa vytvára v detaile faktúry.',
            render: dunCell, sortValue: (r) => (r.dun && r.dun.due ? 10 + r.dun.level : r.reminders || null), sortDir: -1 },
        ],
        sort: { key: 'stav', dir: 1 },
        groups: [
          { key: 'rad', label: 'Čo je na rade', value: 'rad', labelOf: (k) => (RAD[k] || ['—'])[0],
            tone: (k) => (RAD[k] || [, 'gray'])[1], order: ['nas', 'late', 'wait', 'done'] },
          { key: 'stav', label: 'Stav', value: 'st', labelOf: (k) => L(k),
            tone: (k) => (STATUS.find(s => s[0] === k) || [, , 'gray'])[2], order: STATUS.map(s => s[0]) },
          { key: 'odberatel', label: 'Odberateľ', value: (r) => r.partner || '—' },
        ],
        group: 'rad',
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať číslo, odberateľa, zákazku…',
            label: 'Hľadať číslo faktúry, odberateľa alebo zákazku',
            fields: ['number', 'partner', 'subTitle', (r) => L(r.st)] },
          { key: 'stav', type: 'multi', label: 'Stav', value: 'st', default: this.OPEN_STATUSES,
            options: STATUS.filter(s => s[0] !== 'draft_pending_approval').map(s => [s[0], s[1]]),
            sortOptions: false, allLabel: 'Všetky',
            hint: 'Faktúra ide krokmi: Návrh → Čaká na schválenie → Schválená → Vystavená → Odoslaná → Zaplatená. '
              + 'Mimo poradia sú Po splatnosti a Stornovaná.',
            presets: [
              { label: 'Otvorené', value: this.OPEN_STATUSES, hint: 'Všetko okrem zaplatených a stornovaných' },
              { label: 'Nezaplatené', value: ['issued', 'sent', 'overdue'], hint: 'Vystavené, odoslané a po splatnosti — čaká sa na peniaze' },
              { label: 'Rozpracované', value: ['draft', 'pending_approval', 'approved'], hint: 'Návrhy, čakajúce na schválenie a schválené, ešte nevystavené' },
            ] },
          { key: 'odberatel', type: 'select', label: 'Odberateľ', value: 'partnerKey',
            optionLabel: (v, r) => (r ? r.partner : v), emptyLabel: 'Bez odberateľa', allLabel: 'Všetci odberatelia' },
          { key: 'late', type: 'toggle', label: 'Po splatnosti', test: (r) => r.late,
            hint: 'Vystavené a odoslané faktúry, ktorých splatnosť uplynula a peniaze neprišli — aj keď ich appka ešte neoznačila.' },
          ...(admin ? [{ key: 'schvalit', type: 'toggle', label: 'Čaká na moje schválenie', more: true,
            test: (r) => r.st === 'pending_approval',
            hint: 'Faktúry, ktoré musí schváliť administrátor. Bez schválenia sa faktúra nevystaví ani neodošle.' }] : []),
          { key: 'zakazka', type: 'select', label: 'Zákazka', value: (r) => r.x.subcontract_id || '', more: true,
            optionLabel: (v, r) => (r ? r.subTitle : v), emptyLabel: 'Bez zákazky', allLabel: 'Všetky zákazky' },
          { key: 'vystavena', type: 'range-date', label: 'Vystavená', field: 'x.issue_date', more: true },
          { key: 'splatnost', type: 'range-date', label: 'Splatnosť', field: 'x.due_date', more: true },
          { key: 'suma', type: 'range-number', label: 'Suma', value: (r) => r.cents / 100, unit: '€', more: true },
          { key: 'typ', type: 'select', label: 'Typ', value: (r) => r.x.type || '', more: true,
            optionLabel: (v) => TYPE[v] || v, allLabel: 'Všetky typy' },
        ],
        empty: { ico: 'invoices', title: 'Žiadne faktúry', sub: 'Vystaviť sa dá z objednávky, z dopytu alebo úplne voľne.',
          cta: `<button class="btn btn-primary" onclick="Inv.newInvoice()">${Icon('plus')} Nová faktúra</button>` },
        // Súčet toho, čo je vidieť — v centoch, nie sčítaním floatov.
        foot: (list) => {
          const open = list.filter(r => r.open);
          return { cells: {
            cislo: `<span class="dl-foot-l">Spolu <em>${list.length} ${Shell.plural(list.length, 'faktúra', 'faktúry', 'faktúr')}</em></span>`,
            suma: `<b class="dl-num" data-sum="suma">${this.footSums(list, r => r.cents)}</b>`,
            uhrada: open.length ? `<span class="dl-two"><b class="dl-num" data-sum="zostava">${this.footSums(open, r => r.left)}</b><small>zostáva</small></span>` : '',
          } };
        },
        export: {
          name: ['faktury'],
          columns: [
            ['Číslo', r => r.number], ['Vystavená', r => r.x.issue_date], ['Splatnosť', r => r.x.due_date],
            ['Odberateľ', r => r.partner], ['Zákazka', r => r.subTitle],
            ['Stav', r => L(r.x.status)], ['Typ', r => TYPE[r.x.type] || r.x.type],
            ['Mena', r => r.currency],
            ['Suma', r => DanubraExport.num(r.x.total)], ['Základ', r => DanubraExport.num(r.x.amount_net)],
            ['Zrážka §48b', r => DanubraExport.num(r.x.withholding_amount)],
            ['Zostáva', r => (r.open ? DanubraExport.num(Money.fromCents(r.left)) : '')],
            ['Zaplatená', r => (r.x.paid_at ? String(r.x.paid_at).slice(0, 10) : '')],
            ['Upomienky', r => r.reminders || ''],
          ],
        },
      };
    },

    /**
     * Jedna veta a jedno tlačidlo. Poradie drží knižnica (`DanubraInvoice.queue`):
     * najprv schválenie, pretože to je jediná vec, ktorá stojí len na nás,
     * potom faktúry po splatnosti, nakoniec rozpracované podklady.
     */
    nowHtml(q) {
      const n = q.next || this.nicNecaka();
      const label = { approve: 'Otvoriť na schválenie', overdue: 'Otvoriť najstaršiu',
        draft: 'Otvoriť návrh' }[n.key] || 'Otvoriť';
      return Shell.now(n, {
        help: 'card.inv.now',
        action: n.invoice ? { label, ico: n.key === 'overdue' ? 'phone' : 'check',
          onclick: `Inv.detail('${n.invoice.id}')` } : null,
      });
    },

    /** Aj „nič nečaká" je veta. Obrazovka nemá nikdy mlčať. */
    nicNecaka() {
      return { key: 'ok', title: 'Nič nečaká',
        what: 'Nič nie je na schválenie ani po splatnosti.',
        why: 'Keď niečo pribudne, bude to tu napísané ako prvé.', hot: false };
    },

    /** Komu sa fakturuje: v2 nemeckému odberateľovi, v1 klientovi z ubytovania. */
    partnerOf(id) { return (this.partners || []).find(p => p.id === id) || null; },
    counterparty(x) {
      const p = this.partnerOf(x.partner_id);
      if (p) return { type: 'partner', id: p.id, name: p.name };
      const c = this.clientOf(x.client_id);
      return c ? { type: 'client', id: c.id, name: c.name } : null;
    },

    /**
     * Filter z kódu (napr. „Inv.setF('status','draft')"). Zoznam má filtre
     * v `DataList`; staré kľúče sa naň len prekladajú.
     */
    setF(k, v) {
      if (k === 'status') this.filters.status = v || '';
      else this.filters[k] = v;
      if (k === 'q' && window.DataList && DataList._reg.faktury) return DataList.set('faktury', 'q', v || '');
      Danubra.renderRoute();
    },

    /** Čo je po filtroch vidieť — to isté, čo vyvezie export. */
    rows() {
      const vid = window.DataList && DataList._reg.faktury ? DataList.visible('faktury') : null;
      return vid ? vid.map(r => r.x) : this.items.slice();
    },

    /** Export do CSV — presne to, čo je v zozname vidieť. */
    exportCsv() {
      const inst = window.DataList && DataList._reg.faktury;
      if (!inst) return Shell.exportCsv(this.items, [['Číslo', x => x.invoice_number]], ['faktury']);
      const btn = document.querySelector('#dl-faktury [data-dl-a="export"]');
      if (btn) btn.click();
    },

    /** Faktúra v2 pozná odberateľa alebo podklad; v1 má klienta z ubytovania. */
    isV2(x) { return !!(x.partner_id || x.period_id || x.subcontract_id); },

    async detail(id) {
      const x = this.items.find(i => i.id === id);
      if (!x) return UI.toast('Nenájdené', 'err');
      if (this.isV2(x)) return this.detailV2(x);
      const c = this.clientOf(x.client_id);
      const items = this.linesOf(id);
      const ord = this.orders.find(o => o.id === x.order_id);
      const regime = REGIME[x.vat_regime] || x.vat_regime || '—';

      const rows = [
        ['Klient', c?.name], ['Typ', TYPE[x.type] || x.type],
        ['Objednávka', ord?.order_number], ['Vystavená', UI.date(x.issue_date)],
        ['Splatnosť', UI.date(x.due_date), 'Do tohto dňa má klient zaplatiť. Keď deň uplynie a peniaze '
          + 'neprídu, faktúra sa označí „Po splatnosti".'],
        ['Režim DPH', regime, '„SK bez DPH" = klient je na Slovensku; nie sme platiteľ DPH, takže ju '
          + 'nepripočítavame. „Reverse charge" = klient v inej krajine EÚ s IČ DPH; daň si odvedie sám.'],
        ['Obdobie', x.billing_period_from ? `${UI.date(x.billing_period_from)} – ${UI.date(x.billing_period_to)}` : null],
        ['Zaplatená', x.paid_at ? new Date(x.paid_at).toLocaleString('sk-SK') : null],
      ].filter(r => r[1] != null && r[1] !== '');

      const body = `
        <div class="detail-head">${this.badgeTip(x.status)}
          <span class="mono doc-no">${UI.esc(x.invoice_number || '')}</span>${x.invoice_number ? UI.tip(TIP_NUMBER) : ''}
        </div>
        ${x.status === 'draft_pending_approval' ? `<div class="warnbox">
          ${Icon('alert', 14)} Toto je návrh — pred odoslaním klientovi ho musíte schváliť.</div>` : ''}
        ${c ? CommPanel.render({ contact: { phone: c.phone, email: c.email, whatsapp: c.whatsapp, name: c.name }, entity: { type: 'client', id: c.id } }) : ''}
        <div class="kv">${rows.map(r => `<div><span>${r[0]}${r[2] ? UI.tip(r[2]) : ''}</span><strong>${UI.esc(r[1])}</strong></div>`).join('')}</div>

        <div class="form-section">Položky</div>
        ${items.map(i => this.lineRow(i)).join('') || '<div class="js-empty">Bez položiek.</div>'}
        <div class="service-total is-neutral">
          <b>Na úhradu</b>
          <span class="st-sum">${UI.money(x.total, x.currency)}</span>
        </div>

        <div class="modal-actions">
          ${x.status === 'draft_pending_approval'
            ? `<button class="btn btn-danger" onclick="Inv.del('${x.id}')">Zahodiť návrh</button>
               <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
               <button class="btn btn-primary" onclick="Inv.approve('${x.id}')">${Icon('check')} Schváliť a vystaviť</button>${
                 UI.tip('Týmto návrh schválite a faktúra sa stane platnou (stav Vystavená). Kým to '
                   + 'nespravíte, klientovi sa nesmie poslať.')}`
            : `<button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
               <button class="btn btn-outline" onclick="Inv.openDoc('${x.id}')">${Icon('doc')} Dokument s QR</button>${
                 UI.tip('Otvorí faktúru na tlač alebo do PDF. QR kód klient naskenuje v mobilnom '
                   + 'bankovníctve a platba sa mu vyplní sama — suma, IBAN aj variabilný symbol.')}
               ${x.status !== 'paid'
                 ? `<button class="btn btn-primary" onclick="Inv.markPaid('${x.id}')">${Icon('check')} Označiť ako zaplatenú</button>${
                   UI.tip('Kliknite, keď peniaze prišli na účet. Faktúra sa uzavrie a zmizne z nezaplatených. '
                     + 'Keď platbu spárujete v Banke, stane sa to samo.')}`
                 : ''}`}
        </div>`;
      UI.modal(`Faktúra ${x.invoice_number || ''}`, body, { wide: true });
    },

    /** Riadok položky v detaile faktúry (len na čítanie). */
    lineRow(i) {
      return `<div class="list-row is-static">
        <span class="lr-main">${UI.esc(i.description)}
          <span class="lr-sub">${Number(i.quantity || 0).toLocaleString('sk-SK')} ${UI.esc(i.unit || '')} × ${UI.money(i.unit_price)}</span>
        </span>
        <strong>${UI.money(i.total)}</strong></div>`;
    },

    async approve(id) {
      const x = this.items.find(i => i.id === id);
      if (!x || this._busy) return;
      // Keď databáza schválenie odmietne (neschvaľuje administrátor), obrazovka
      // nesmie tvrdiť „vystavená". Predtým sa chyba zahodila a stav sa prepísal.
      this._busy = true;
      const { error } = await DB.update('invoices', id, { status: 'issued' });
      this._busy = false;
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      x.status = 'issued';
      UI.toast('Faktúra vystavená', 'ok');
      this.detail(id);
      Danubra.renderRoute();
    },

    async markPaid(id) {
      const x = this.items.find(i => i.id === id);
      if (!x) return;
      const now = new Date().toISOString();
      const { error } = await DB.update('invoices', id, { status: 'paid', paid_at: now });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      Object.assign(x, { status: 'paid', paid_at: now });
      UI.toast('Označená ako zaplatená', 'ok');
      this.detail(id);
      Danubra.renderRoute();
    },

    async openDoc(id) {
      const x = this.items.find(i => i.id === id);
      if (!x) return;
      // Faktúra bez fakturačných údajov je papier, podľa ktorého sa nedá
      // zaplatiť — a odberateľ ju vráti.
      if (this.isV2(x)) return this.openDocV2(id);
      if (!Danubra.supplierReady('Faktúra')) return;
      await Invoicing.openDocument(x, this.linesOf(id), this.clientOf(x.client_id));
    },

    async del(id) {
      if (!await UI.confirm('Zahodiť tento návrh faktúry?\n\nNávrh sa nezmaže — dostane stav Stornovaná a zostane v histórii.')) return;
      // Nič sa fyzicky nemaže: zahodený návrh je stornovaný, nie preč.
      const { error } = await DB.update('invoices', id, { status: 'cancelled' });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const x = this.items.find(i => i.id === id);
      if (x) x.status = 'cancelled';
      UI.closeModal(); UI.toast('Návrh zahodený (stornovaný)', 'ok');
      Danubra.renderRoute();
    },

    // ── Nová faktúra: voľba zdroja ────────────────────────────────────────
    // Faktúra nie je viazaná na predchádzajúci doklad — vystaviť sa dá
    // z objednávky, z dopytu, alebo úplne voľne pre klienta.
    async newInvoice() {
      if (!this.loaded) await this.load();
      const opt = (ico, title, sub, action) => pickTile({ ico, title, sub, action });
      // Objednávky a dopyty z ubytovacej agendy (v1) sa ponúkajú len vtedy,
      // keď nejaké sú — inak by tu stáli dve tlačidlá, ktoré nikam nevedú.
      const stare = this.orders.length;
      UI.modal('Vystaviť faktúru', `
        <div class="pick-list">
          ${opt('site', 'Zo zákazky — z odpracovaných hodín', 'Z uzavretého obdobia. Suma je z hodín, reverse charge §13b. Najčastejšie.', 'Inv.pickPeriod()')}
          ${opt('clients', 'Voľná faktúra nemeckej firme', 'Vlastné položky — paušál, materiál, doprava, čokoľvek. Vyberiete odberateľa a napíšete riadky.', 'Inv.freeForm()')}
          ${opt('calendar', 'Za celý mesiac naraz', 'Všetky zákazky za mesiac: obdobia sa uzavrú a vzniknú návrhy faktúr jedným klikom.', 'Inv.monthly()')}
        </div>
        <div class="notebox inv-self-link">Faktúry za živnostníkov sa vystavujú v Prijatých faktúrach.${
          UI.tip('Faktúra za živnostníka (samofakturácia) je faktúra, ktorú nám vystavuje živnostník — len ju '
            + 'v jeho mene pripravíme my. Pre nás je to prijatá faktúra, preto patrí do Prijatých faktúr '
            + 'a odtiaľ sa aj platí.')}
          <div class="btn-row"><button class="btn btn-outline btn-sm" onclick="Inv.selfBill()">${Icon('receipt', 14)} Otvoriť faktúry za živnostníkov</button></div>
        </div>
        <div class="regimebox">Každá faktúra vznikne ako <b>návrh</b>. Kým ju admin neschváli,
          dá sa upraviť; po schválení sa už nemení.${UI.tip('Faktúra sa nikdy nevystaví ani neodošle bez '
            + 'schválenia adminom. Návrh je len v appke — odberateľ o ňom nevie.')}</div>
        ${stare ? `<details class="more-block"><summary>Staré faktúry z ubytovacej agendy</summary>
          ${opt('orders', 'Z objednávky ubytovania', 'Sprostredkovanie alebo priebežná služba', 'Inv.pickOrder()')}
          ${opt('clients', 'Voľná faktúra klientovi ubytovania', 'Vlastné položky pre klienta z v1', 'Inv.manual()')}
        </details>` : ''}`, { wide: true });
    },

    async pickOrder() {
      const cand = this.orders.filter(o => !['cancelled'].includes(o.status));
      if (!cand.length) return UI.toast('Žiadne objednávky na fakturáciu', 'err');
      UI.modal('Z ktorej objednávky?', `
        <div class="pick-list">
          ${cand.map(o => {
            const c = this.clientOf(o.client_id);
            return pickTile({ ico: 'orders', title: UI.esc(o.order_number || '—'),
              sub: `${c ? UI.esc(c.name) : '—'} · ${UI.money(o.service_fee || 0)}`,
              action: `Inv.chooseType('${o.id}')` });
          }).join('')}
        </div>`, { wide: true });
    },

    async chooseType(orderId) {
      const o = this.orders.find(x => x.id === orderId);
      const canOngoing = o?.ongoing_service_enabled;
      UI.modal('Za čo fakturujeme?', `
        <div class="pick-list">
          ${pickTile({ ico: 'invoices', title: 'Sprostredkovateľský poplatok',
            sub: `${UI.money(o?.service_fee || 0)}${o?.urgent_surcharge ? ` + ${UI.money(o.urgent_surcharge)} súrne` : ''}`,
            action: `Inv.create('${orderId}','service_fee')` })}
          ${canOngoing ? pickTile({ ico: 'calendar', title: 'Priebežná služba za aktuálny mesiac',
            sub: 'Vytvorí sa ako návrh na schválenie', action: `Inv.create('${orderId}','ongoing_service')` }) : ''}
          ${pickTile({ ico: 'edit', title: 'Vlastné položky',
            sub: 'Faktúra naviazaná na objednávku, obsah si určíte sami', action: `Inv.manual(null,'${orderId}')` })}
        </div>`, { wide: true });
    },

    async pickInquiry() {
      const { data: inqs } = await DB.list('inquiries', {
        select: 'id,target_city,persons,date_from,date_to,client_id,budget_per_bed,status',
        order: { column: 'received_at', ascending: false }, limit: 200 });
      const open = (inqs || []).filter(i => !['lost'].includes(i.status));
      if (!open.length) return UI.toast('Žiadne dopyty', 'err');
      UI.modal('Z ktorého dopytu?', `
        <div class="pick-list">
          ${open.map(i => {
            const c = this.clientOf(i.client_id);
            return pickTile({ ico: 'inquiries', title: UI.esc(i.target_city || '—'),
              sub: `${c ? UI.esc(c.name) : 'bez klienta'} · ${i.persons || '?'} os.`,
              action: `Inv.manualFromInquiry('${i.id}')` });
          }).join('')}
        </div>`, { wide: true });
    },

    async manualFromInquiry(inquiryId) {
      const { data: inq } = await DB.getById('inquiries', inquiryId);
      if (!inq) return UI.toast('Dopyt nenájdený', 'err');
      this._srcInquiry = inq;
      const nights = UI.nights(inq.date_from, inq.date_to);
      const desc = `Ubytovanie ${inq.target_city || ''}`
        + (inq.date_from ? ` · ${UI.date(inq.date_from)} – ${UI.date(inq.date_to)}` : '')
        + (nights ? ` · ${nights} nocí` : '');
      this.manual(inq.client_id, null, [{
        description: desc.trim(), quantity: inq.persons || 1, unit: 'os.',
        unit_price: inq.budget_per_bed && nights ? Number(inq.budget_per_bed) * nights : 0,
      }]);
    },

    /** Faktúra zo zákazky — z potvrdených, ešte nefakturovaných hodín. */
    async pickSubcontract() {
      const [{ data: subs }, { data: ts }] = await Promise.all([
        DB.list('subcontracts', { select: 'id,title,contract_number,partner_id,charge_rate,status,work_type', limit: 300 }),
        DB.list('timesheets', { limit: 3000 }),
      ]);
      const { data: asg } = await DB.list('assignments', { select: 'id,subcontract_id', limit: 1000 });
      const asgMap = new Map((asg || []).map(a => [a.id, a.subcontract_id]));
      const openBySub = new Map();
      for (const t of (ts || [])) {
        if (!t.approved || t.invoiced_at) continue;
        const sid = asgMap.get(t.assignment_id);
        if (!sid) continue;
        openBySub.set(sid, (openBySub.get(sid) || 0) + Number(t.hours || 0));
      }
      const cand = (subs || []).filter(s => openBySub.has(s.id));
      if (!cand.length) return UI.toast('Žiadne potvrdené nefakturované hodiny — najprv potvrďte hodiny', 'err');

      this._subs = subs; this._allTs = ts; this._asgMap = asgMap;
      UI.modal('Z ktorej zákazky?', `
        <div class="pick-list">
          ${cand.map(s => pickTile({ ico: 'site', title: UI.esc(s.title),
            sub: `${Math.round(openBySub.get(s.id))} h nefakturovaných${s.charge_rate ? ` · ${UI.money(s.charge_rate)}/h` : ''}`,
            action: `Inv.createFromSubcontract('${s.id}')` })).join('')}
        </div>`, { wide: true });
    },

    async createFromSubcontract(scId) {
      UI.closeModal();
      const sc = (this._subs || []).find(s => s.id === scId);
      if (!sc) return UI.toast('Zákazka nenájdená', 'err');
      const { data: partner } = await DB.getById('partners', sc.partner_id);
      if (!partner) return UI.toast('Zákazka nemá priradeného odberateľa', 'err');
      if (!partner.ust_idnr) {
        if (!await UI.confirm('Odberateľ nemá USt-IdNr — reverse charge §13b sa nedá uplatniť.\nPokračovať?')) return;
      }
      const ts = (this._allTs || []).filter(t => this._asgMap.get(t.assignment_id) === scId);
      try {
        const res = await Invoicing.createSubcontractInvoice({ subcontract: sc, partner, timesheets: ts });
        if (res.skipped) return UI.toast('Nie je čo fakturovať', 'err');
        UI.toast(`Návrh faktúry ${res.invoice.invoice_number} čaká na schválenie`, 'ok');
        await this.load(); Danubra.go('invoices'); Danubra.renderRoute();
      } catch (e) { UI.toast('Chyba: ' + e.message, 'err'); }
    },

    /** Editor voľnej faktúry s vlastnými položkami. */
    manual(clientId, orderId, prefill) {
      this._srcOrder = orderId || null;
      this._rows = (prefill && prefill.length) ? prefill.slice()
        : [{ description: '', quantity: 1, unit: 'ks', unit_price: 0 }];
      const c = clientId || '';
      UI.modal('Voľná faktúra', `
        <form id="man-form" onsubmit="event.preventDefault();Inv.saveManual()">
          <div class="form-grid">
            ${UI.field('client_id', 'Klient', { value: c, required: true,
              options: [['', '— vyberte klienta —'], ...this.clients.map(x => [x.id, x.name])] })}
            ${UI.field('type', 'Typ', { value: 'other',
              tip: 'Za čo fakturujete. Sprostredkovanie = jednorazový poplatok za nájdené ubytovanie; '
                + 'Priebežná služba = starostlivosť počas pobytu; Retainer = pravidelný paušál. '
                + 'Typ sa len zapíše k faktúre, sumu nemení.', options: [
              ['other', 'Iné'], ['service_fee', 'Sprostredkovanie'],
              ['ongoing_service', 'Priebežná služba'], ['retainer', 'Retainer']] })}
            ${UI.field('due_days', 'Splatnosť (dní)', { type: 'number', value: 14,
              tip: 'Koľko dní má klient na zaplatenie, počíta sa od dňa vystavenia. '
                + 'Z toho vznikne dátum splatnosti na faktúre.' })}
          </div>
          <div id="regime-hint" class="regimebox"></div>
          <div class="form-section">Položky${UI.tip(TIP_ITEMS)}</div>
          <div id="item-rows"></div>
          <button type="button" class="btn btn-outline btn-sm" onclick="Inv.addRow()">${Icon('plus')} Pridať položku</button>
          <div class="service-total is-neutral">
            <b>Spolu</b>
            <span id="man-total" class="st-sum">0,00 €</span>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${Icon('check')} Vystaviť faktúru</button>${
              UI.tip('Napriek názvu vznikne najprv návrh. Platná faktúra z neho bude až po schválení.')}
          </div>
        </form>`, { wide: true });
      this.renderRows();
      const form = document.getElementById('man-form');
      form.addEventListener('input', () => { this.syncRows(); this.updateRegime(); });
      this.updateRegime();
    },

    renderRows() {
      const box = document.getElementById('item-rows');
      if (!box) return;
      box.innerHTML = this._rows.map((r, i) => `
        <div class="item-row">
          <input placeholder="Popis položky" data-i="${i}" data-f="description" value="${UI.esc(r.description)}">
          <input type="number" step="0.01" placeholder="Množ." data-i="${i}" data-f="quantity" value="${r.quantity}">
          <input placeholder="MJ" data-i="${i}" data-f="unit" value="${UI.esc(r.unit)}">
          <input type="number" step="0.01" placeholder="Cena" data-i="${i}" data-f="unit_price" value="${r.unit_price}">
          <span class="item-sum">${UI.money(this.rowMoney(r))}</span>
          <button type="button" class="btn btn-ghost btn-sm btn-text-danger"
            onclick="Inv.delRow(${i})" ${this._rows.length === 1 ? 'disabled' : ''}>${Icon('x', 15)}</button>
        </div>`).join('');
      this.updateTotal();
    },

    syncRows() {
      document.querySelectorAll('#item-rows [data-i]').forEach(el => {
        const i = Number(el.dataset.i), f = el.dataset.f;
        if (this._rows[i]) this._rows[i][f] = el.value;
      });
      document.querySelectorAll('#item-rows .item-row').forEach((row, i) => {
        const r = this._rows[i];
        const sum = row.querySelector('.item-sum');
        if (sum && r) sum.textContent = UI.money(this.rowMoney(r));
      });
      this.updateTotal();
    },

    /**
     * Suma riadku tak, ako ju uloží faktúra (Money.mul, obchodné zaokrúhlenie).
     * Predtým okno násobilo floaty: 1,5 × 10,01 ukázalo 15,01 €, ale uložilo
     * sa 15,02 € — človek videl inú sumu, než akú schvaľoval.
     */
    rowMoney(r) {
      try { return Money.fromCents(Money.mul(Money.toCents(r.unit_price || 0), Number(r.quantity) || 0)); }
      catch { return 0; }
    },

    updateTotal() {
      let c = 0;
      try { c = Money.sum(this._rows.map(r => Money.mul(Money.toCents(r.unit_price || 0), Number(r.quantity) || 0))); }
      catch { c = 0; }
      const el = document.getElementById('man-total');
      if (el) el.textContent = UI.money(Money.fromCents(c));
    },

    updateRegime() {
      const sel = document.querySelector('#man-form [name=client_id]');
      const el = document.getElementById('regime-hint');
      if (!sel || !el) return;
      const c = this.clientOf(sel.value);
      if (!c) { el.textContent = 'Vyberte klienta — podľa jeho krajiny a IČ DPH sa určí režim.'; return; }
      const r = Invoicing.regimeFor(c);
      el.innerHTML = `Režim: <strong>${REGIME[r.regime] || r.regime}</strong> — ${UI.esc(r.note || '')}`
        + (r.warning ? ` <span class="tx-warn">${UI.esc(r.warning)}</span>` : '');
    },

    addRow() { this.syncRows(); this._rows.push({ description: '', quantity: 1, unit: 'ks', unit_price: 0 }); this.renderRows(); },
    delRow(i) {
      this.syncRows();
      const [r] = this._rows.splice(i, 1);
      if (r && r.id) (this._removed = this._removed || []).push(r.id);
      this.renderRows();
    },

    async saveManual() {
      this.syncRows();
      const d = UI.formData(document.getElementById('man-form'));
      const client = this.clientOf(d.client_id);
      if (!client) return UI.toast('Vyberte klienta', 'err');
      let order = null;
      if (this._srcOrder) { const { data } = await DB.getById('orders', this._srcOrder); order = data; }
      try {
        const { invoice } = await Invoicing.createManual({
          client, items: this._rows, type: d.type || 'other',
          dueDays: Number(d.due_days) || 14,
          order, inquiry: this._srcInquiry || null,
        });
        UI.closeModal();
        UI.toast(`Návrh faktúry ${invoice.invoice_number} čaká na schválenie`, 'ok');
        this._srcOrder = null; this._srcInquiry = null;
        await this.load(); Danubra.renderRoute();
      } catch (e) { UI.toast('Chyba: ' + e.message, 'err'); }
    },

    async create(orderId, type) {
      UI.closeModal();
      const { data: order } = await DB.getById('orders', orderId);
      if (!order) return UI.toast('Objednávka nenájdená', 'err');
      const client = this.clientOf(order.client_id);
      try {
        if (type === 'service_fee') {
          const { invoice } = await Invoicing.createServiceFee(order, client);
          UI.toast(`Návrh faktúry ${invoice.invoice_number} čaká na schválenie`, 'ok');
        } else {
          const { data: segs } = await DB.list('order_service_periods', { filters: { order_id: orderId } });
          const now = new Date();
          const per = window.DanubraBilling.monthlyBillingPeriod(now.getFullYear(), now.getMonth() + 1, order);
          const res = await Invoicing.createOngoingService(order, client, per.periodFrom, per.periodTo, segs || []);
          if (res.skipped) return UI.toast('Za toto obdobie nie je čo fakturovať', 'err');
          UI.toast(`Návrh ${res.invoice.invoice_number} čaká na schválenie`, 'ok');
        }
        await this.load();
        Danubra.go('invoices');
        Danubra.renderRoute();
      } catch (e) {
        UI.toast('Chyba: ' + e.message, 'err');
      }
    },
  };


  // ── Faktúra v2: podklad → schválenie → vystavenie → odoslanie ───────────
  // Schválenie a odoslanie sú dve samostatné rozhodnutia. Pravdu o tom drží
  // trigger v databáze; tu sa len nekreslí tlačidlo, ktoré by databáza
  // odmietla.
  Object.assign(Inv, {
    v2: { partners: [], subcontracts: [], periods: [], loaded: false },

    async loadV2() {
      if (this.v2.loaded) return;
      const [p, s, per, co] = await Promise.all([
        DB.list('partners', { limit: 300 }),
        DB.list('subcontracts', { select: 'id,title,work_type,freistellung_verified,partner_id', limit: 500 }),
        DB.list('periods', { limit: 500 }),
        DB.list('compliance', { limit: 500 }),
      ]);
      this.v2 = { partners: p.data || [], subcontracts: s.data || [],
        periods: per.data || [], company: (co.data || []).filter(c => c.scope === 'company'), loaded: true };
    },

    ctxOf(x) {
      return {
        invoice: x,
        partner: this.v2.partners.find(p => p.id === x.partner_id) || {},
        subcontract: this.v2.subcontracts.find(s => s.id === x.subcontract_id) || {},
        period: this.v2.periods.find(p => p.id === x.period_id) || {},
        // Freistellung §48b máme ako firma — s platnou sa zrážka neuplatňuje.
        freistellung: window.DanubraCompliance
          ? DanubraCompliance.freistellung(this.v2.company || [], Danubra._dayISO()) : null,
      };
    },

    async detailV2(x) {
      await this.loadV2();
      const ctx = this.ctxOf(x);
      const rev = DanubraInvoice.reviewBeforeApproval({ ...ctx, items: this.linesOf(x.id) });
      const riadky = DanubraInvoice.docItems({ invoice: x, items: this.linesOf(x.id),
        subcontract: ctx.subcontract, period: ctx.period });
      const upravit = DanubraInvoice.editable(x);
      const w = rev.withholding;
      const steps = DanubraInvoice.nextSteps(x);
      // Zapísaná výnimka musí schválenie aj odomknúť — inak by človek napísal
      // dôvod a tlačidlo by zostalo šedé, čo je horšie než keby ho appka
      // neponúkla vôbec.
      const revV = Shell.evaluate(rev.reasons,
        DanubraOverrides.forEntity(this.overrides, 'invoice', x.id));

      // Zo schválenej faktúry vedie krok `pending_approval` naspäť, nie
      // dopredu — tlačidlo „Poslať na schválenie" tam klamalo. Je to návrat
      // a volá sa tak; `draft` z čakajúcej je ten istý návrat.
      const spat = (to) => (to === 'pending_approval' && x.status === 'approved') || to === 'draft';
      const act = (to) => {
        const map = spat(to) ? ['Vrátiť do návrhu', 'btn-ghost'] : {
          pending_approval: ['Poslať na schválenie', 'btn-outline'],
          approved: ['Schváliť', 'btn-primary'],
          issued: ['Vystaviť v SuperFaktúre', 'btn-primary'],
          sent: ['Odoslať odberateľovi', 'btn-primary'],
          paid: ['Označiť ako zaplatenú', 'btn-outline'],
        }[to];
        if (!map) return '';
        // Čo tlačidlo spraví — pri nevratných krokoch hlavne to, že sa to
        // nedá vziať späť.
        const tip = UI.tip(spat(to)
          ? (x.status === 'approved'
            ? 'Faktúra sa vráti do stavu Návrh: schválenie sa zruší, dá sa znova upraviť a potom ju treba '
              + 'poslať na schválenie — admin ju musí schváliť znova. Odberateľ ju ešte nemá, nič sa nestornuje.'
            : 'Faktúra prestane čakať na schválenie a bude znova Návrh — dá sa upraviť a potom znova '
              + 'poslať na schválenie.')
          : {
          pending_approval: 'Faktúra pôjde administrátorovi na kontrolu. Kým ju neschváli, '
            + 'nevystaví sa ani neodošle.',
          approved: 'Schválením faktúru „zamknete" — odteraz sa už nemení, opraviť sa dá len dobropisom '
            + '(opravnou faktúrou). Faktúra sa nikdy nevystaví ani neodošle bez schválenia adminom.',
          issued: 'Faktúra sa zapíše do SuperFaktúry (fakturačný program) a stane sa platným dokladom. '
            + 'Odberateľovi ešte nič nepríde — to je ďalší krok.',
          sent: 'SuperFaktúra pošle faktúru odberateľovi e-mailom (po nemecky). Poslaný e-mail sa nedá '
            + 'vziať späť.',
          paid: 'Zapíše úhradu aj do SuperFaktúry. Použite, keď peniaze naozaj prišli na účet — '
            + 'zvyčajne to za Vás spraví spárovanie v Banke.',
        }[to] || '');
        // Schváliť sa nedá, kým niečo blokuje — okrem toho, čo je povolené
        // zapísanou výnimkou.
        if (to === 'approved' && !revV.ok) {
          return `<button class="btn btn-primary" disabled title="${
            UI.esc(revV.open.map(r => r.label).join(' · '))}">${map[0]}</button>${tip}`;
        }
        const fn = spat(to) ? `Inv.backToDraft('${x.id}')`
          : to === 'issued' ? `Inv.sfAction('${x.id}','issue')`
          : to === 'sent' ? `Inv.sfAction('${x.id}','send')`
          : to === 'paid' ? `Inv.sfAction('${x.id}','pay')`
          : `Inv.setStatusV2('${x.id}','${to}')`;
        return `<button class="btn ${map[1]}" onclick="${fn}">${map[0]}</button>${tip}`;
      };
      // Päta okna: tiché kroky pred hlavnými, hlavné tlačidlo je posledné.
      const RANK = { 'btn-ghost': 0, 'btn-outline': 1, 'btn-primary': 2 };
      const rank = (to) => {
        const cls = spat(to) ? 'btn-ghost' : { pending_approval: 'btn-outline', approved: 'btn-primary',
          issued: 'btn-primary', sent: 'btn-primary', paid: 'btn-outline' }[to];
        return RANK[cls] ?? 1;
      };
      const kroky = steps.slice().sort((a, b) => rank(a) - rank(b));

      const rows = [
        ['Odberateľ', ctx.partner.name],
        ['Zákazka', ctx.subcontract.title],
        ['Obdobie', x.billing_period_from
          ? UI.dateRange(x.billing_period_from, x.billing_period_to) : null,
          'Za ktoré dni sa fakturuje. Z týchto dní sa vzali schválené odpracované hodiny.'],
        ['Vystavená', x.issue_date ? UI.date(x.issue_date) : null],
        ['Splatnosť', x.due_date ? UI.date(x.due_date) : null,
          'Do tohto dňa má odberateľ zaplatiť. Počet dní sa berie z karty odberateľa, inak 30 dní '
            + 'od vystavenia. Potom appka faktúru označí „Po splatnosti".'],
        ['Režim DPH', x.vat_regime === 'reverse_charge'
          ? 'Reverse charge §13b' : 'Bežný',
          x.vat_regime === 'reverse_charge'
            ? 'Reverse charge §13b (prenesenie daňovej povinnosti): na faktúre nie je DPH, nemeckú DPH '
              + 'si odvedie odberateľ sám. Musí na to mať USt-IdNr — nemecké IČ DPH.'
            : 'Odberateľ nemá reverse charge. DPH sa ani tak nepripočítava — nie sme platiteľ DPH.'],
        ['Schválil', x.approved_at
          ? `${new Date(x.approved_at).toLocaleString('sk-SK')}` : null,
          'Kedy faktúru schválil administrátor. Bez tohto záznamu sa nedá vystaviť ani odoslať.'],
        ['V SuperFaktúre', x.sf_invoice_id
          ? `${x.sf_invoice_id} (${x.sf_environment || 'sandbox'})` : null,
          'Číslo dokladu v SuperFaktúre — fakturačnom programe, cez ktorý faktúra odchádza. '
            + '„sandbox" je skúšobný účet: doklad tam nie je ostrý; „production" je ostrý účet.'],
      ].filter(r => r[1] != null && r[1] !== '');

      const body = `
        <div class="detail-head">
          ${this.badgeTip(x.status)}
          <span class="mono doc-no">${UI.esc(x.invoice_number || '')}</span>${x.invoice_number ? UI.tip(TIP_NUMBER) : ''}
        </div>

        ${x.sf_error ? `<div class="warnbox">${Icon('alert', 14)}
          Posledný pokus zlyhal: ${UI.esc(x.sf_error)}</div>` : ''}

        <div class="btn-row">
          <button class="btn btn-outline btn-sm" onclick="Inv.openDocV2('${x.id}')">${Icon('doc', 14)} Zobraziť faktúru (PDF)</button>
          ${upravit ? `<button class="btn btn-outline btn-sm" onclick="Inv.freeForm('${x.id}')">${Icon('edit', 14)} Upraviť návrh</button>` : ''}
        </div>
        ${upravit ? '' : `<p class="muted-sm">Schválená faktúra sa už nemení — opravuje sa dobropisom.${
          UI.tip('Dobropis je opravná faktúra so zápornou sumou. Ruší celú pôvodnú faktúru alebo jej '
            + 'časť — pôvodný doklad sa nikdy neprepisuje.')}</p>`}

        <div class="form-section">Položky</div>
        ${riadky.map(i => this.lineRow(i)).join('') || '<div class="js-empty">Bez položiek.</div>'}

        <div class="form-section">Suma${UI.tip('Fakturovaná suma je celá suma na faktúre. Pri stavebných '
          + 'prácach bez platnej Freistellungsbescheinigung (§48b) odberateľ 15 % zrazí a pošle nemeckému '
          + 'finančnému úradu — na účet nám príde menej.')}</div>
        ${Shell.sums({
          lines: DanubraInvoice.sumLines(x),
          totalLabel: w.withheld ? 'Na účet príde' : 'Na úhradu',
          note: w.withheld
            ? 'Do SuperFaktúry ide plná suma — zrážka nie je zľava, je to '
              + 'daňová povinnosť odberateľa.' : '',
        })}

        <div class="form-section">Pred schválením${UI.tip('Appka tu faktúru skontroluje skôr, než ju admin '
          + 'schváli: odberateľa, číslo, sumu oproti hodinám a USt-IdNr. Kým svieti niečo červené, '
          + 'schváliť sa nedá.')}</div>
        ${Shell.blocker({
          reasons: [...rev.reasons, ...rev.warnings],
          overrides: DanubraOverrides.forEntity(this.overrides, 'invoice', x.id),
          // Pri faktúre sa dá prevziať na seba jedine rozdiel voči podkladu —
          // niekedy sa s odberateľom naozaj dohodne iná suma a vtedy musí byť
          // zapísané prečo. Ostatné prekážky sa neobchádzajú: bez odberateľa
          // niet komu fakturovať a reverse charge bez USt-IdNr nie je prevzaté
          // riziko, ale nesprávny doklad. Blokátor to teraz rozlíši sám.
          onOverride: Danubra.isAdmin() ? `Inv.grantOverride('${x.id}')` : '',
          inputId: 'inv-ovr-reason',
          noOvrNote: 'Rozdiel voči podkladu smie povoliť len administrátor — '
            + 'je to to isté právo ako schválenie faktúry.',
          okHtml: '<p class="muted">'
            + 'Suma sedí s podkladom a odberateľ má všetko, čo treba.</p>',
        })}
        ${this.overridesHtml(x.id)}

        <div class="kv">
          ${rows.map(r => `<div><span>${r[0]}${r[2] ? UI.tip(r[2]) : ''}</span><strong>${UI.esc(r[1])}</strong></div>`).join('')}
        </div>

        ${this.dunningHtml ? this.dunningHtml(x) : ''}

        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          ${kroky.map(act).join('')}
        </div>`;
      UI.modal(`Faktúra ${x.invoice_number || ''}`, body, { wide: true });
    },

    /**
     * Zapísané výnimky pri faktúre. Musia byť vidieť pri doklade, nie len
     * v histórii — kto sa na faktúru pozrie o pol roka, má vedieť, že rozdiel
     * voči podkladu niekto vedome povolil, a prečo.
     */
    overridesHtml(invoiceId) {
      const all = DanubraOverrides.forEntity(this.overrides, 'invoice', invoiceId);
      if (!all.length) return '';
      const row = (o) => {
        const m = DanubraOverrides.meta(o.rule_key);
        const dead = !!o.revoked_at;
        return `<div class="list-row is-static is-top">
          <span class="dot ${dead ? '' : 'amber'}"></span>
          <span class="lr-main${dead ? ' is-dead' : ''}">
            <strong>${UI.esc(m?.label || o.rule_key)}</strong>
            ${dead ? UI.badge('zrušená', 'gray') : ''}
            <span class="lr-sub">${o.granted_at ? UI.date(o.granted_at) : ''} · ${UI.esc(o.reason || '')}</span>
          </span>
          ${dead || !Danubra.isAdmin() ? '' : `<button class="btn btn-ghost btn-sm"
            onclick="Inv.revokeOverride('${o.id}','${invoiceId}')">Zrušiť</button>`}
        </div>`;
      };
      return `<div class="form-section">Zapísané výnimky${UI.tip('Výnimka = admin vedome povolil, že faktúra '
        + 'smie ísť ďalej aj s rozdielom oproti podkladu. Zapisuje sa s dôvodom, aby bolo aj o rok jasné, '
        + 'kto a prečo to povolil.')}</div>
        ${all.map(row).join('')}
        <p class="muted-sm">
          Výnimka sa nemaže. Zrušenie ju len prestane uplatňovať — záznam
          zostane aj s dôvodom.</p>`;
    },

    async grantOverride(invoiceId) {
      const x = this.items.find(i => i.id === invoiceId);
      if (!x) return;
      const box = document.getElementById('inv-ovr-reason');
      const reason = box ? box.value : '';
      if (!Shell.reasonValid(reason)) {
        return UI.toast(`Dôvod musí mať aspoň ${Shell.REASON_MIN} znakov`, 'err');
      }
      const rev = DanubraInvoice.reviewBeforeApproval({ ...this.ctxOf(x), items: this.linesOf(x.id) });
      const open = Shell.evaluate(rev.reasons,
        DanubraOverrides.forEntity(this.overrides, 'invoice', invoiceId)).open;
      const { rows, skipped } = DanubraOverrides.rowsFor(open, {
        entityType: 'invoice', entityId: invoiceId, reason,
      });
      if (!rows.length) {
        return UI.toast(skipped.length
          ? 'Toto výnimka nerieši — opravte to, na čo appka ukazuje'
          : 'Niet čo povoliť — nič neblokuje', 'err');
      }
      const { error } = await DB.from('overrides').insert(rows);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const ovr = await DB.list('overrides', { limit: 1000 });
      this.overrides = ovr.data || this.overrides;
      UI.toast('Výnimka zapísaná', 'ok');
      this.detail(invoiceId);
    },

    async revokeOverride(id, invoiceId) {
      if (!await UI.confirm('Zrušiť túto výnimku?\n\nZáznam zostane v histórii.')) return;
      const { error } = await DB.update('overrides', id, {
        revoked_at: new Date().toISOString(),
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const ovr = await DB.list('overrides', { limit: 1000 });
      this.overrides = ovr.data || this.overrides;
      UI.toast('Výnimka zrušená, záznam zostal', 'ok');
      this.detail(invoiceId);
    },

    /**
     * „Vrátiť do návrhu" — zo schválenej aj z čakajúcej faktúry. Len krok
     * späť: databáza pri ňom schválenie zmaže (trigger 018), takže faktúra
     * musí ísť cez schválenie znova. Zo schválenej vedie povolená cesta cez
     * „Čaká na schválenie" — idú sa preto dva kroky, oba späť. Keď druhý
     * zlyhá, faktúra ostane čakať na schválenie, nikdy nie schválená.
     */
    async backToDraft(id) {
      const x = this.items.find(i => i.id === id);
      if (!x || !['approved', 'pending_approval'].includes(x.status)) {
        return UI.toast('Tento krok sa z aktuálneho stavu nedá spraviť', 'err');
      }
      const msg = x.status === 'approved'
        ? 'Vrátiť schválenú faktúru do návrhu?\n\nSchválenie sa zruší. Po úprave ju treba poslať na schválenie '
          + 'a admin ju musí schváliť znova.'
        : 'Vrátiť faktúru do návrhu?\n\nPrestane čakať na schválenie a dá sa upraviť.';
      if (!await UI.confirm(msg)) return;
      const kroky = x.status === 'approved' ? ['pending_approval', 'draft'] : ['draft'];
      let stav = x.status;
      for (const to of kroky) {
        if (!DanubraInvoice.canGo(stav, to)) break;
        const { error } = await DB.update('invoices', id, { status: to });
        if (error) {
          UI.toast('Chyba: ' + error.message, 'err');
          break;
        }
        stav = to;
      }
      if (stav === 'draft') UI.toast('Faktúra je znova návrh', 'ok');
      else if (stav === 'pending_approval') UI.toast('Schválenie je zrušené — faktúra čaká na schválenie', 'warn');
      this.loaded = false; await this.load();
      this.detail(id); Danubra.renderRoute();
    },

    async setStatusV2(id, to) {
      const x = this.items.find(i => i.id === id);
      if (!x || !DanubraInvoice.canGo(x.status, to)) {
        return UI.toast('Tento krok sa z aktuálneho stavu nedá spraviť', 'err');
      }
      const { error } = await DB.update('invoices', id, { status: to });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast('Stav uložený', 'ok');
      this.loaded = false; await this.load();
      this.detail(id); Danubra.renderRoute();
    },

    /**
     * Vystavenie, odoslanie a úhrada idú cez serverovú funkciu. API kľúč
     * SuperFaktúry nikdy neopustí server a funkcia si stav overí v databáze —
     * poslať `{action:'issue'}` z konzoly schvaľovanie neobíde.
     */
    async sfAction(id, action) {
      // Dvojklik = dve požiadavky. Pri vystavení by vznikli dva doklady, pri
      // odoslaní dva e-maily odberateľovi. Server má vlastný zámok, ale druhá
      // požiadavka nemá z obrazovky vôbec odísť.
      this._sfBusy = this._sfBusy || {};
      if (this._sfBusy[id]) return UI.toast('Už sa na tom pracuje — počkajte prosím', 'warn');
      this._sfBusy[id] = true;
      const vypnute = [...document.querySelectorAll('#ui-modal .modal-actions button:not([disabled])')];
      vypnute.forEach(b => { b.disabled = true; });
      const labels = { issue: 'Vystavujem…', send: 'Odosielam…', pay: 'Zapisujem úhradu…' };
      UI.toast(labels[action] || 'Pracujem…');
      let res, json;
      try {
        res = await fetch('/.netlify/functions/danubra-sf-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoice_id: id, action }),
        });
        json = await res.json();
      } catch (e) {
        return UI.toast('Server neodpovedal: ' + e.message, 'err');
      } finally {
        delete this._sfBusy[id];
        vypnute.forEach(b => { b.disabled = false; });
      }
      if (json && json.skipped) {
        return UI.toast(json.message, 'err');
      }
      if (!res.ok) {
        return UI.toast(json && json.error ? json.error : 'Nepodarilo sa', 'err');
      }
      UI.toast({ issue: 'Faktúra vystavená', send: 'Faktúra odoslaná',
        pay: 'Označená ako zaplatená' }[action] || 'Hotovo', 'ok');
      this.loaded = false; await this.load();
      this.detail(id); Danubra.renderRoute();
    },

    // ── Vystaviť: zo zákazky (obdobie) ────────────────────────────────────
    /** Uzavreté obdobia, z ktorých ešte faktúra nie je. */
    async pickPeriod() {
      await this.loadV2();
      const fakt = new Set(this.items.filter(x => x.status !== 'cancelled' && x.period_id).map(x => x.period_id));
      const cand = this.v2.periods.filter(p => p.status === 'closed' && !fakt.has(p.id))
        .sort((a, b) => String(b.period_to || '').localeCompare(String(a.period_to || '')));
      if (!cand.length) {
        return UI.modal('Zo zákazky', `<div class="regimebox">
          Žiadne uzavreté obdobie nečaká na faktúru. Obdobie sa uzatvára v zákazke —
          <b>krok 7 · Hodiny a faktúra</b>: schváľte hodiny a kliknite „Uzavrieť obdobie".</div>
          <div class="modal-actions"><button class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
          <button class="btn btn-primary" onclick="UI.closeModal();Danubra.go('subcontracts')">${Icon('site', 14)} Otvoriť zákazky</button></div>`);
      }
      const sc = (id) => this.v2.subcontracts.find(x => x.id === id) || {};
      UI.modal('Z ktorého obdobia?', `<div class="pick-list">${cand.map(p => pickTile({ ico: 'clock',
        title: UI.esc(sc(p.subcontract_id).title || 'Zákazka'),
        sub: `${UI.dateRange(p.period_from, p.period_to)}${p.amount_charged != null ? ` · ${UI.money(p.amount_charged)}` : ''}`,
        action: `UI.closeModal();Inv.fromPeriod('${p.id}')` })).join('')}</div>`, { wide: true });
    },

    /**
     * Faktúra za živnostníka patrí do Prijatých faktúr — tam sa aj platí.
     * Vo Vydaných je len odkaz: presmeruje do Prijatých a otvorí tam okno
     * „Vystaviť za živnostníkov".
     */
    async selfBill() {
      UI.closeModal();
      if (Danubra.routeAvailable && !Danubra.routeAvailable('costs')) {
        return UI.toast('Prijaté faktúry nemáte sprístupnené — požiadajte administrátora', 'err');
      }
      if (window.Cost) {
        Cost.tab = 'bills';
        if (!Cost.loaded) await Cost.load();
      }
      Danubra.go('costs');
      // Okno sa otvorí až po prekreslení obrazovky, inak by ho prepínanie zavrelo.
      setTimeout(() => { if (window.Cost) Cost.selfForm(); }, 350);
    },

    // ── Voľná faktúra nemeckej firme / úprava návrhu ──────────────────────
    /**
     * Formulár na novú voľnú faktúru aj na úpravu návrhu. Faktúra z podkladu
     * má sumu z hodín — pri nej sa upravujú len dátumy; suma sa mení v hodinách.
     */
    async freeForm(id) {
      await this.loadV2();
      const x = id ? this.items.find(i => i.id === id) : null;
      if (x && !DanubraInvoice.editable(x)) return UI.toast('Schválená faktúra sa už nemení', 'err');
      const zPodkladu = !!(x && x.period_id);
      this._editId = x ? x.id : null;
      this._rows = x ? this.linesOf(x.id).map(l => ({ id: l.id, description: l.description, quantity: l.quantity,
        unit: l.unit, unit_price: l.unit_price })) : [];
      if (!zPodkladu && !this._rows.length) this._rows = [{ description: '', quantity: 1, unit: 'h', unit_price: 0 }];
      this._removed = [];
      const dnes = Danubra._dayISO();
      UI.modal(x ? `Upraviť návrh ${x.invoice_number || ''}` : 'Voľná faktúra nemeckej firme', `
        <form id="man-form" onsubmit="event.preventDefault();Inv.saveFree()">
          <div class="form-grid">
            ${UI.field('partner_id', 'Odberateľ', { value: x ? x.partner_id : '', required: true, add: 'partner',
              options: [['', '— vyberte firmu —'], ...this.v2.partners.map(p => [p.id, p.name])] })}
            ${UI.field('subcontract_id', 'Zákazka (nepovinné)', { value: x ? x.subcontract_id || '' : '',
              tip: 'Ku ktorej stavbe faktúra patrí. Sumu nemení — faktúra sa potom ukáže aj pri tej zákazke.',
              // Zákazka sa zakladá v Zákazkách so všetkými krokmi — nie z faktúry.
              add: false,
              options: [['', '— bez zákazky —'], ...this.v2.subcontracts.map(z => [z.id, z.title])] })}
            ${UI.field('issue_date', 'Dátum vystavenia', { type: 'date', value: x ? x.issue_date : dnes })}
            ${UI.field('delivery_date', 'Dátum dodania', { type: 'date', value: x ? (x.delivery_date || x.issue_date) : dnes,
              tip: 'Kedy bola práca alebo vec dodaná (pri hodinách posledný deň obdobia). Musí byť '
                + 'na faktúre zo zákona a môže sa líšiť od dátumu vystavenia.' })}
            ${UI.field('due_date', 'Splatnosť', { type: 'date', value: x ? x.due_date : '' ,
              hint: x ? '' : 'Prázdne = podľa odberateľa (inak 30 dní).' })}
          </div>
          <div id="regime-hint" class="regimebox"></div>
          ${zPodkladu ? `<div class="notebox">Suma tejto faktúry je z uzavretého obdobia (${UI.money(x.total)}).${
            UI.tip('Uzavreté obdobie = hodiny za tieto dni sú schválené a zmrazené aj so sadzbou. '
              + 'Kým z neho nie je faktúra, dá sa v zákazke znova otvoriť.')}
            Mení sa v hodinách zákazky, nie tu — inak by faktúra nesedela s výkazom.</div>` : `
          <div class="form-section">Položky${UI.tip(TIP_ITEMS)}</div>
          <div id="item-rows"></div>
          <button type="button" class="btn btn-outline btn-sm" onclick="Inv.addRow()">${Icon('plus')} Pridať položku</button>
          <div class="service-total is-neutral">
            <b>Spolu</b>
            <span id="man-total" class="st-sum">0,00 €</span>
          </div>`}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">${Icon('check')} ${x ? 'Uložiť zmeny' : 'Vytvoriť návrh'}</button>
          </div>
        </form>`, { wide: true });
      if (!zPodkladu) this.renderRows();
      const form = document.getElementById('man-form');
      form.addEventListener('input', () => { if (!zPodkladu) this.syncRows(); this.freeRegime(); });
      form.addEventListener('change', () => this.freeRegime());
      this.freeRegime();
    },

    freeRegime() {
      const sel = document.querySelector('#man-form [name=partner_id]');
      const el = document.getElementById('regime-hint');
      if (!sel || !el) return;
      const p = this.v2.partners.find(z => z.id === sel.value);
      if (!p) { el.textContent = 'Vyberte odberateľa — podľa neho sa určí režim DPH a splatnosť.'; return; }
      el.innerHTML = p.reverse_charge === false
        ? `Režim: <strong>bežný</strong> — odberateľ nemá reverse charge.`
        : `Režim: <strong>reverse charge §13b</strong> — bez DPH, daň odvedie odberateľ.${
          p.ust_idnr ? '' : ' <span class="tx-warn">Odberateľ nemá USt-IdNr — bez neho sa faktúra neschváli.</span>'}`;
    },

    /**
     * Dvojklik na „Vytvoriť návrh" pridelil dve čísla a založil dva návrhy
     * s tými istými položkami. Kým sa ukladá, druhé kliknutie nič nespraví.
     */
    async saveFree() {
      if (this._savingFree) return;
      this._savingFree = true;
      const btn = document.querySelector('#man-form button[type=submit]');
      if (btn) btn.disabled = true;
      try { return await this._saveFree(); }
      finally {
        this._savingFree = false;
        if (btn && document.body.contains(btn)) btn.disabled = false;
      }
    },

    async _saveFree() {
      const form = document.getElementById('man-form');
      if (document.getElementById('item-rows')) this.syncRows();
      const d = UI.formData(form);
      const partner = this.v2.partners.find(p => p.id === d.partner_id);
      if (!partner) return UI.toast('Vyberte odberateľa', 'err');
      const x = this._editId ? this.items.find(i => i.id === this._editId) : null;
      const zPodkladu = !!(x && x.period_id);
      const f = DanubraInvoice.freeInvoice({ partner, items: this._rows, today: d.issue_date || Danubra._dayISO(),
        subcontractId: d.subcontract_id || null });
      if (!zPodkladu && !f.items.length) return UI.toast('Pridajte aspoň jednu položku s popisom a množstvom', 'err');
      const datumy = { issue_date: d.issue_date || f.invoice.issue_date, delivery_date: d.delivery_date || f.invoice.delivery_date,
        due_date: d.due_date || f.invoice.due_date };

      if (!x) {
        const { data: n, error: ne } = await DB.rpc('next_number', { p_kind: 'invoice' });
        if (ne) return UI.toast('Číslo sa nepodarilo prideliť: ' + ne.message, 'err');
        const { data: inv, error } = await DB.insert('invoices', { ...f.invoice, ...datumy, invoice_number: n });
        if (error) return UI.toast('Chyba: ' + error.message, 'err');
        const { error: e2 } = await DB.insertMany('invoice_items', f.items.map(i => ({ ...i, invoice_id: inv.id })));
        if (e2) return UI.toast('Faktúra vznikla, ale položky sa nezapísali: ' + e2.message, 'err');
        UI.closeModal();
        UI.toast(`Návrh faktúry ${n} je pripravený — skontrolujte ho a pošlite na schválenie`, 'ok');
        this.loaded = false; await this.load(); Danubra.renderRoute();
        return setTimeout(() => this.detail(inv.id), 200);
      }

      // Úprava návrhu: hlavička, potom položky — nič sa nemaže, vyhodené dostanú removed_at.
      // Režim sa berie z odberateľa aj pri faktúre z podkladu — keď mu niekto
      // zapne reverse charge, uložený návrh sa tým opraví.
      const patch = { ...datumy, partner_id: partner.id, subcontract_id: d.subcontract_id || null,
        vat_regime: f.invoice.vat_regime };
      if (!zPodkladu) Object.assign(patch, { total: f.invoice.total, amount_net: f.invoice.total });
      const { error } = await DB.update('invoices', x.id, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      if (!zPodkladu) {
        const at = new Date().toISOString();
        const ops = [];
        for (const id of this._removed) ops.push(DB.update('invoice_items', id, { removed_at: at }));
        for (const r of this._rows) {
          const q = Number(r.quantity) || 0;
          const row = { description: String(r.description || '').trim(), quantity: q, unit: r.unit || 'ks',
            unit_price: Number(r.unit_price) || 0,
            total: Money.fromCents(Money.mul(Money.toCents(r.unit_price || 0), q)) };
          if (!row.description || !q) { if (r.id) ops.push(DB.update('invoice_items', r.id, { removed_at: at })); continue; }
          ops.push(r.id ? DB.update('invoice_items', r.id, row) : DB.insert('invoice_items', { ...row, invoice_id: x.id }));
        }
        const res = await Promise.all(ops);
        const chyba = res.find(r => r && r.error);
        if (chyba) return UI.toast('Položky sa neuložili celé: ' + chyba.error.message, 'err');
      }
      UI.closeModal();
      UI.toast('Návrh upravený', 'ok');
      this.loaded = false; await this.load(); Danubra.renderRoute();
      setTimeout(() => this.detail(x.id), 200);
    },

    // ── Dokument faktúry v2 (pre Nemca, po nemecky) ───────────────────────
    async openDocV2(id) {
      const x = this.items.find(i => i.id === id);
      if (!x) return;
      if (!Danubra.supplierReady('Faktúra')) return;
      await this.loadV2();
      const ctx = this.ctxOf(x);
      const p = ctx.partner || {};
      const supplier = Danubra.supplier();
      const items = DanubraInvoice.docItems({ invoice: x, items: this.linesOf(x.id), subcontract: ctx.subcontract, period: ctx.period });
      const notes = [];
      if (x.vat_regime === 'reverse_charge') notes.push('Steuerschuldnerschaft des Leistungsempfängers (§13b UStG).');
      if (ctx.subcontract.work_type === 'construction' && ctx.freistellung && ctx.freistellung.ok && !Number(x.withholding_amount)) {
        notes.push(DanubraInvoice.freistellungNote(ctx.freistellung.doc));
      }
      let qrSvg = '';
      try {
        if (supplier.iban && supplier.name) {
          const { net } = DanubraPapers.payable(x);
          qrSvg = DanubraQR.svg(DanubraQR.sepaPayload({ name: supplier.name, iban: supplier.iban, amount: net,
            reference: String(x.invoice_number || '').replace(/\D/g, ''), note: `Rechnung ${x.invoice_number}` }), { px: 132 });
        }
      } catch (e) { /* bez QR sa dá zaplatiť podľa IBAN */ }
      const client = { name: p.name, country: p.country || 'DE', vat_id: p.ust_idnr, company_id: p.registration_no,
        contact_person: p.contact_person, address: [p.address, [p.postal_code, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') };
      const html = DanubraPapers.invoice({ invoice: x, items, client, supplier, qrSvg, vatNote: notes.join(' '), lang: 'de' });
      Invoicing._openHtml(html, { kind: 'rechnung', title: 'Rechnung', number: x.invoice_number, who: p.name,
        lang: 'de', partner_id: x.partner_id || null, subcontract_id: x.subcontract_id || null });
    },

    /** Faktúra z uzavretého podkladu. Sumy pochádzajú z obdobia, nie z ruky. */
    async fromPeriod(periodId) {
      // Z jedného obdobia jedna faktúra — aj pri dvojkliku. Pravdu drží
      // databáza (zámok obdobia, migrácia 070); tu sa druhé volanie ani nepošle.
      if (this._fromPeriodBusy) return;
      this._fromPeriodBusy = true;
      let data, error;
      try { ({ data, error } = await DB.rpc('invoice_from_period', { p_period_id: periodId })); }
      finally { this._fromPeriodBusy = false; }
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.toast('Návrh faktúry vznikol z podkladu — skontrolujte ho a pošlite na schválenie', 'ok');
      this.loaded = false; this.v2.loaded = false;
      await this.load();
      Danubra.go('invoices');
      const inv = Array.isArray(data) ? data[0] : data;
      if (inv && inv.id) setTimeout(() => this.detail(inv.id), 300);
    },
  });

  window.Inv = Inv;
  Danubra.views.invoices = function (el) { return Inv.view(el); };
})();
