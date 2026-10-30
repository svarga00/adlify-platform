// ============================================================================
// DANUBRA — Archív (Nastavenia → Archív, route `archiv`)
// ============================================================================
// Pravidlo firmy: „nič sa fyzicky nemaže". Tlačidlo „Archivovať" pri zázname
// volá síce DELETE, ale databáza (migrácia 066) ho premení na archiváciu:
// riadok dostane `archived_at`, appka ho prestane vidieť a kaskádne deti
// (napr. nasadenia pri zákazke) sa archivujú spolu s ním.
//
// Táto obrazovka je jediné miesto, kde sú archivované záznamy vidieť, a dá
// sa z nej záznam vrátiť späť. Smie sem len administrátor — chráni to aj
// databáza (`danubra_archived` a `danubra_unarchive` overujú
// `danubra_is_admin()`), toto je len rozhranie.
//
// Pozor na mená: route `archive` sú Dokumenty (PDF) a priečinok
// `modules/archiv/` sú staré obrazovky ubytovacej agendy. Toto je iné.
// ============================================================================
(function () {
  // Druhy záznamov. Kľúč je názov tabuľky bez prefixu `danubra_`, presne ako
  // ho čaká `danubra_archived(p_table)`.
  const KINDS = [
    ['Hlavné záznamy', [
      ['subcontracts', 'Zákazky'],
      ['workers', 'Ľudia'],
      ['candidates', 'Kandidáti'],
      ['partners', 'Odberatelia'],
      ['accommodations', 'Ubytovania'],
      ['recruitment_plans', 'Náborové plány'],
      ['timesheets', 'Hodiny'],
      ['tasks', 'Úlohy'],
      ['worker_documents', 'Doklady ľudí'],
      ['compliance', 'Compliance'],
      ['call_recordings', 'Nahrávky hovorov'],
      ['call_chips', 'Štítky k hovorom'],
      ['screening_questions', 'Otázky na pohovor'],
      ['marketing_listings', 'Marketing – inzeráty'],
      ['marketing_expenses', 'Marketing – výdavky'],
    ]],
    ['Súčasti iných záznamov', [
      ['assignments', 'Nasadenia'],
      ['stays', 'Pobyty'],
      ['subcontract_accommodations', 'Ubytovania pri zákazkách'],
      ['candidate_notes', 'Poznámky ku kandidátom'],
      ['candidate_checks', 'Preverenia kandidátov'],
      ['screening_answers', 'Odpovede na pohovore'],
      ['crew_members', 'Členovia partií'],
    ]],
    ['Stará ubytovacia agenda', [
      ['inquiries', 'Dopyty (staré)'],
      ['offers', 'Ponuky (staré)'],
      ['offer_variants', 'Varianty ponúk (staré)'],
      ['clients', 'Klienti (starí)'],
      ['order_persons', 'Osoby na objednávkach (staré)'],
    ]],
  ];
  const ALL = KINDS.flatMap(g => g[1]);
  const labelOfKind = (k) => (ALL.find(x => x[0] === k) || [k, k])[1];

  // Moduly, ktoré si držia načítaný zoznam. Po vrátení záznamu sa im zoznam
  // zahodí, aby sa vrátený záznam ukázal hneď, nie až po obnovení stránky.
  const CACHED = ['Sub', 'Wrk', 'Cand', 'Prt', 'Acc', 'Hire', 'Tms', 'Tsk', 'Cmp',
    'Rec', 'Trades', 'Mkt', 'Crews', 'Inq', 'Offers', 'Cli', 'Ord'];

  /** 1 záznam, 2 záznamy, 5 záznamov. */
  function zaznamov(n) {
    if (n === 1) return '1 záznam';
    if (n >= 2 && n <= 4) return `${n} záznamy`;
    return `${n} záznamov`;
  }

  function when(ts) {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('sk-SK', { day: '2-digit', month: '2-digit',
        year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return String(ts); }
  }

  const groupOfKind = (k) => (KINDS.find(g => g[1].some(x => x[0] === k)) || ['Ostatné'])[0];

  const Arv = {
    // `table` zostal kvôli `setTable` (starý vstup z inej obrazovky); zoznam
    // teraz načíta všetky druhy naraz a druh je filter.
    table: 'subcontracts',
    rows: [], loadedFor: null, error: null, errors: [],

    /**
     * Archív všetkých druhov naraz. Druh, ktorý sa načítať nepodarí (napr.
     * tabuľka bez archívu v starej databáze), nezastaví ostatné — ukáže sa
     * ako upozornenie nad zoznamom.
     */
    async load() {
      const res = await Promise.all(ALL.map(([k]) => DB.rpc('archived', { p_table: k })
        .then(r => ({ k, r }), e => ({ k, r: { data: null, error: e } }))));
      this.rows = []; this.errors = [];
      for (const { k, r } of res) {
        if (r && r.error) { this.errors.push({ k, msg: r.error.message || String(r.error) }); continue; }
        for (const x of (Array.isArray(r && r.data) ? r.data : [])) this.rows.push({ ...x, _table: k });
      }
      // Keď nejde nič (napr. chýba právo), je to chyba celej obrazovky.
      this.error = this.errors.length === ALL.length ? this.errors[0].msg : null;
      this.loadedFor = 'all';
    },

    /** Starý vstup: otvorí archív s filtrom na jeden druh. */
    async setTable(k) {
      if (!ALL.some(x => x[0] === k)) return;
      this.table = k;
      if (window.DataList && DataList._reg.archiv && Danubra.route === 'archiv') return DataList.set('archiv', 'druh', [k]);
      this._wantKind = k;
      return Danubra.renderRoute();
    },

    /** Kto archivoval — meno z používateľov, inak nič (nie je to podstatné). */
    who(uid) {
      if (!uid) return '';
      const m = (Danubra.members || []).find(x => x.user_id === uid);
      return m ? (m.full_name || m.email || '') : '';
    },

    async view(el) {
      if (!Danubra.isAdmin()) {
        el.innerHTML = Danubra.header('Archív', 'Archivované záznamy')
          + UI.empty('lock', 'Archív vidí len administrátor',
            'Ak potrebujete niečo vrátiť späť, povedzte to administrátorovi.');
        return;
      }
      if (this.loadedFor !== 'all') { el.innerHTML = UI.loading(); await this.load(); }
      Danubra.setActions('');

      const tip = UI.tip('Archív je odložené, nie vyhodené. Keď pri zázname stlačíte „Archivovať", '
        + 'zmizne zo všetkých zoznamov, ale v databáze ostane celý — nič sa nemaže. Tu ho admin nájde '
        + 'a tlačidlom „Vrátiť späť" ho vráti tam, kde bol. Vráti sa aj to, čo sa archivovalo '
        + 'spolu s ním (napríklad nasadenia pri zákazke alebo odpovede pri otázke).');

      const rows = this.rows.map(r => ({
        id: `${r._table}:${r.id}`, r, kind: r._table, kindLabel: labelOfKind(r._table), group: groupOfKind(r._table),
        label: r.label || '—', at: r.archived_at || '', day: String(r.archived_at || '').slice(0, 10),
        whoId: r.archived_by || '', whoName: this.who(r.archived_by),
      }));

      let body;
      if (this.error) {
        body = `<div class="warnbox">${Icon('alert', 14)} Archív sa nepodarilo načítať: ${UI.esc(this.error)}</div>`;
      } else {
        const zle = this.errors.map(e => labelOfKind(e.k));
        // Zoznam je spoločný komponent (`DataList`). Dovtedy sa vyberal jeden
        // druh záznamov a pod ním bola tabuľka bez filtrov.
        body = (zle.length ? `<div class="warnbox" style="margin-bottom:12px;">${Icon('alert', 14)}
            Niektoré druhy sa nenačítali: ${UI.esc(zle.slice(0, 6).join(', '))}${zle.length > 6 ? ` a ďalšie (${zle.length - 6})` : ''}.</div>` : '')
          + DataList.html(this.listConfig(rows));
        if (this._wantKind) { const k = this._wantKind; this._wantKind = null; setTimeout(() => DataList.set('archiv', 'druh', [k]), 0); }
      }

      el.innerHTML = Danubra.header('Archív',
        `Čo bolo archivované — nič sa nemaže a dá sa to vrátiť späť ${tip}`)
        + body;
    },

    /** Konfigurácia zoznamu archívu pre `DataList`. */
    listConfig(rows) {
      const L = DanubraDataList;
      const day30 = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 30); return d.toISOString().slice(0, 10); })();
      return {
        id: 'archiv', storageKey: 'archiv', label: 'Archív',
        noun: ['záznam', 'záznamy', 'záznamov'],
        rows,
        rowLabel: (x) => `${x.kindLabel}: ${x.label}`,
        columns: [
          { key: 'nazov', label: 'Názov', width: 'minmax(200px, 2fr)', mobile: 'title',
            render: (x) => `<span class="dl-title"><b>${UI.esc(x.label)}</b><small>${UI.esc(x.group)}</small></span>`,
            sortValue: (x) => x.label, sortLabel: 'Názov' },
          { key: 'druh', label: 'Druh', width: 'minmax(130px, 1fr)', mobile: 'badge',
            render: (x) => `<span class="dl-tag">${Icon('archive', 14)}${UI.esc(x.kindLabel)}</span>`, sortValue: (x) => x.kindLabel },
          { key: 'kedy', label: 'Archivované', width: '150px',
            render: (x) => `<span class="dl-num">${UI.esc(when(x.at))}</span>`, sortValue: (x) => x.at, sortDir: -1,
            csv: (x) => when(x.at) },
          { key: 'kto', label: 'Kto', width: 'minmax(120px, 1fr)', mobileLabel: 'archivoval',
            render: (x) => (x.whoName ? UI.esc(x.whoName) : ''), sortValue: (x) => x.whoName || null },
          { key: 'akcia', label: '', width: '132px', align: 'right', mobile: 'line', csv: false,
            render: (x) => `<button class="btn btn-outline btn-sm" onclick="Arv.restore('${UI.esc(x.r.id)}', '${UI.esc(x.kind)}')">
              ${Icon('undo', 14)} Vrátiť späť</button>` },
        ],
        sort: { key: 'kedy', dir: -1 },
        groups: [
          { key: 'druh', label: 'Druh', value: 'kindLabel' },
          { key: 'skupina', label: 'Skupina', value: 'group', order: KINDS.map(g => g[0]) },
          { key: 'kto', label: 'Kto archivoval', value: (x) => x.whoName, labelOf: (k) => k || 'Neznámy' },
        ],
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať v archíve…', label: 'Hľadať názov, druh alebo meno',
            fields: ['label', 'kindLabel', 'whoName'] },
          { key: 'druh', type: 'multi', label: 'Druh', value: 'kind',
            options: (rs) => ALL.filter(([k]) => rs.some(x => x.kind === k)).map(([k, l]) => [k, l]), sortOptions: false, allLabel: 'Všetky' },
          { key: 'kto', type: 'select', label: 'Kto', value: 'whoId', optionLabel: (v, x) => (x && x.whoName) || 'Neznámy',
            emptyLabel: 'Neznámy', allLabel: 'Ktokoľvek' },
          { key: 'kedy', type: 'range-date', label: 'Kedy', field: 'day' },
          { key: 'nedavno', type: 'toggle', label: 'Posledných 30 dní', test: (x) => x.day >= day30 },
          { key: 'skupina', type: 'select', label: 'Skupina', value: 'group', more: true,
            options: KINDS.map(g => [g[0], g[0]]), allLabel: 'Všetky skupiny' },
        ],
        empty: { ico: 'archive', title: 'Archív je prázdny',
          sub: 'Keď niečo archivujete, objaví sa to tu a dá sa to vrátiť späť.' },
        export: { name: ['archiv'] },
      };
    },

    async restore(id, table) {
      const r = this.rows.find(x => String(x.id) === String(id) && (!table || x._table === table));
      if (!r) return;
      const t = r._table || this.table;
      const ok = await UI.confirm(`Vrátiť „${r.label || 'záznam'}" späť?`, {
        hint: 'Záznam sa znova objaví v zoznamoch tam, kde bol. Vráti sa aj to, čo sa archivovalo '
          + 'spolu s ním (napríklad nasadenia pri zákazke).',
        ok: 'Vrátiť späť', danger: false,
      });
      if (!ok) return;
      const { data, error } = await DB.rpc('unarchive', { p_table: t, p_id: r.id });
      if (error) return UI.toast('Nepodarilo sa vrátiť: ' + (error.message || error), 'err');
      const n = Number(data) || 0;
      UI.toast(n ? `Vrátené späť: ${zaznamov(n)}` : 'Nič sa nevrátilo — záznam už asi nie je v archíve.',
        n ? 'ok' : 'err');
      for (const h of CACHED) if (window[h] && 'loaded' in window[h]) window[h].loaded = false;
      this.loadedFor = null;
      Danubra.renderRoute();
    },
  };

  window.Arv = Arv;
  Danubra.views.archiv = function (el) { return Arv.view(el); };
})();
