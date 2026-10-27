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

  const Arv = {
    table: 'subcontracts',
    rows: [], loadedFor: null, error: null,

    async load() {
      const { data, error } = await DB.rpc('archived', { p_table: this.table });
      this.error = error ? (error.message || String(error)) : null;
      this.rows = Array.isArray(data) ? data : [];
      this.loadedFor = this.table;
    },

    async setTable(k) {
      if (!ALL.some(x => x[0] === k)) return;
      this.table = k;
      try { localStorage.setItem('danubra_archiv_table', k); } catch {}
      this.loadedFor = null;
      Danubra.renderRoute();
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
      if (this.loadedFor === null) {
        try { const k = localStorage.getItem('danubra_archiv_table'); if (k && ALL.some(x => x[0] === k)) this.table = k; } catch {}
      }
      if (this.loadedFor !== this.table) { el.innerHTML = UI.loading(); await this.load(); }
      Danubra.setActions('');

      const tip = UI.tip('Archív je odložené, nie vyhodené. Keď pri zázname stlačíte „Archivovať", '
        + 'zmizne zo všetkých zoznamov, ale v databáze ostane celý — nič sa nemaže. Tu ho admin nájde '
        + 'a tlačidlom „Vrátiť späť" ho vráti tam, kde bol. Vráti sa aj to, čo sa archivovalo '
        + 'spolu s ním (napríklad nasadenia pri zákazke alebo odpovede pri otázke).');

      const select = `<label class="fld" style="margin:0;min-width:240px;">
          <span>Druh záznamov</span>
          <select onchange="Arv.setTable(this.value)" aria-label="Druh záznamov">
            ${KINDS.map(([g, items]) => `<optgroup label="${UI.esc(g)}">${items.map(([k, l]) =>
              `<option value="${k}" ${k === this.table ? 'selected' : ''}>${UI.esc(l)}</option>`).join('')}</optgroup>`).join('')}
          </select></label>`;

      const rows = this.rows.slice().sort((a, b) =>
        String(b.archived_at || '').localeCompare(String(a.archived_at || '')));

      let body;
      if (this.error) {
        body = `<div class="warnbox">${Icon('alert', 14)} Archív sa nepodarilo načítať: ${UI.esc(this.error)}</div>`;
      } else if (!rows.length) {
        body = UI.empty('archive', `V archíve nie sú žiadne ${labelOfKind(this.table).toLowerCase()}`,
          'Keď niečo archivujete, objaví sa to tu a dá sa to vrátiť späť.');
      } else {
        body = `<div class="card card-pad"><div class="kpi-table-wrap"><table class="kpi-table">
          <thead><tr><th>Názov</th><th>Archivované</th><th class="ta-r"></th></tr></thead>
          <tbody>${rows.map(r => {
            const kto = this.who(r.archived_by);
            return `<tr style="vertical-align:middle;">
              <td><strong>${UI.esc(r.label || '—')}</strong></td>
              <td class="dim" style="white-space:nowrap;">${UI.esc(when(r.archived_at))}${kto ? `<br>${UI.esc(kto)}` : ''}</td>
              <td class="ta-r"><button class="btn btn-outline btn-sm" onclick="Arv.restore('${UI.esc(r.id)}')">
                ${Icon('undo', 14)} Vrátiť späť</button></td>
            </tr>`;
          }).join('')}</tbody></table></div></div>`;
      }

      el.innerHTML = Danubra.header('Archív',
        `Čo bolo archivované — nič sa nemaže a dá sa to vrátiť späť ${tip}`)
        + `<div class="filterbar" style="align-items:flex-end;">${select}
            <span class="card-note" style="margin:0;">${rows.length ? `V archíve: ${zaznamov(rows.length)}` : ''}</span></div>`
        + body;
    },

    async restore(id) {
      const r = this.rows.find(x => String(x.id) === String(id));
      if (!r) return;
      const ok = await UI.confirm(`Vrátiť „${r.label || 'záznam'}" späť?`, {
        hint: 'Záznam sa znova objaví v zoznamoch tam, kde bol. Vráti sa aj to, čo sa archivovalo '
          + 'spolu s ním (napríklad nasadenia pri zákazke).',
        ok: 'Vrátiť späť', danger: false,
      });
      if (!ok) return;
      const { data, error } = await DB.rpc('unarchive', { p_table: this.table, p_id: r.id });
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
