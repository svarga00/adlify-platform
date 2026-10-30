// ============================================================================
// DANUBRA — Používatelia a práva
// ============================================================================
// Rola je predvoľba, zaškrtávacie polia sú výnimka na mieru. Keď človek
// niečo odškrtne, uloží sa presný zoznam a rola zostane len ako poznámka,
// z čoho sa vychádzalo.
//
// **Táto obrazovka nič nechráni.** Ochrana je v databáze (migrácia 030):
// politiky na tabuľkách a spúšťače na schválení faktúry a na výnimke pri
// nasadení. Tu sa práva len nastavujú a je vidieť, kto čo má.
//
// Človeka sa nedá zmazať. Prístup sa vypne — úlohy, poznámky a schválenia,
// ktoré po ňom zostali, musia mať stále meno.
// ============================================================================
(function () {
  const P = () => window.DanubraPerm;

  const Mem = {
    items: [], loaded: false, filters: { q: '', role: '' },

    async load() {
      const { data } = await DB.list('members', {
        order: { column: 'created_at', ascending: true }, limit: 200 });
      this.items = data || [];
      this.loaded = true;
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    rows() {
      const f = this.filters;
      return Shell.filterRows(this.items, {
        q: f.q, fields: ['full_name', 'email', 'note'],
        equals: { role: f.role },
      });
    },

    /** Konfigurácia zoznamu ľudí pre `DataList`. */
    listConfig(items, admin) {
      const modName = (k) => { const mm = P().MODULES.find(x => x.key === k); return mm ? mm.label : k; };
      const roleIdx = (k) => { const i = P().ROLES.findIndex(r => r[0] === k); return i < 0 ? 9 : i; };
      const modsCell = (m) => {
        if (m.active === false) return '<span class="dl-note is-mute">bez prístupu</span>';
        if (m.role === 'admin') return '<span class="dl-note is-green">všetko</span>';
        const mods = P().modulesOf(m);
        if (!mods.length) return '<span class="dl-note is-mute">nič</span>';
        const own = (m.modules || []).filter(Boolean).length > 0;
        return `<span class="mem-mods" title="${UI.esc(mods.map(modName).join(', '))}">${mods.slice(0, 3).map(k => `<span class="dl-tag mem-mod">${UI.esc(modName(k))}</span>`).join('')}${
          mods.length > 3 ? `<span class="mem-more">+${mods.length - 3}</span>` : ''}${own ? '<small class="dl-note is-amber">na mieru</small>' : ''}</span>`;
      };
      return {
        id: 'clenovia', storageKey: 'clenovia', label: 'Používatelia',
        noun: ['človek', 'ľudia', 'ľudí'],
        rows: items,
        rowClick: admin ? (m) => Mem.form(m.id) : null,
        rowClass: (m) => (m.active === false ? 'is-muted' : ''),
        rowLabel: (m) => `Používateľ ${m.full_name || m.email || ''}`,
        rowActions: admin ? [{ ico: 'edit', label: 'Upraviť práva', run: (m) => Mem.form(m.id) }] : [],
        columns: [
          { key: 'meno', label: 'Meno', width: 'minmax(170px, 1.4fr)', mobile: 'title',
            render: (m) => {
              const ja = Danubra.me && Danubra.me.id === m.id;
              return `<span class="mem-who"><span class="t-who">${UI.esc((m.full_name || m.email || '?').slice(0, 2).toUpperCase())}</span>
                <span class="dl-title"><b>${UI.esc(m.full_name || m.email || 'bez mena')}${ja ? ' <em class="mem-me">ja</em>' : ''}</b>${
                  m.note ? `<small title="${UI.esc(m.note)}">${UI.esc(m.note)}</small>` : ''}</span></span>`;
            },
            sortValue: (m) => m.full_name || m.email || '', csv: (m) => m.full_name || '' },
          { key: 'email', label: 'E-mail', width: 'minmax(160px, 1.3fr)', mobileLabel: '',
            render: (m) => (m.email ? `<a href="mailto:${UI.esc(m.email)}">${UI.esc(m.email)}</a>` : ''),
            sortValue: (m) => m.email || null, csv: (m) => m.email || '' },
          { key: 'rola', label: 'Rola', width: '128px', mobile: 'badge',
            tip: 'Rola je hotová predvoľba, na ktoré obrazovky človek smie. Na mieru = upravená zaškrtnutím.',
            render: (m) => UI.badge(P().roleLabel(m.role), m.role === 'admin' ? 'red' : m.role === 'custom' ? 'gray' : 'blue'),
            sortValue: (m) => roleIdx(m.role), csv: (m) => P().roleLabel(m.role) },
          { key: 'moduly', label: 'Na čo má', width: 'minmax(200px, 2fr)', mobile: 'line',
            tip: 'Obrazovky, na ktoré človek smie. Ukážte myšou — povie všetky. Schvaľovanie faktúr, výnimky a používateľov má vždy len administrátor.',
            render: modsCell, sortValue: (m) => (m.active === false ? -1 : P().modulesOf(m).length), sortDir: -1,
            csv: (m) => P().describe(m), sortLabel: 'Počet obrazoviek' },
          { key: 'aktivny', label: 'Prístup', width: '104px', mobileLabel: '',
            tip: 'Vypnutý = do appky sa už nedostane. Nič sa nemaže — jeho úlohy, poznámky a schválenia zostanú aj s menom.',
            render: (m) => (m.active === false ? '<span class="dl-note is-mute">vypnutý</span>' : `<span class="dl-ok">${Icon('check', 13)} má prístup</span>`),
            sortValue: (m) => (m.active === false ? 1 : 0), csv: (m) => (m.active === false ? 'vypnutý' : 'má prístup') },
        ],
        sort: { key: 'rola', dir: 1 },
        sorts: [{ key: 'pridany', label: 'Pridaný', value: (m) => m.created_at || null }],
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať meno alebo e-mail…', label: 'Hľadať meno, e-mail alebo poznámku',
            fields: ['full_name', 'email', 'note'] },
          { key: 'rola', type: 'multi', label: 'Rola', value: 'role', sortOptions: false, allLabel: 'Všetky role',
            options: P().ROLES.map(r => [r[0], r[1]]) },
          { key: 'aktivny', type: 'select', label: 'Prístup', value: (m) => (m.active === false ? 'off' : 'on'), allLabel: 'Všetci',
            options: [['on', 'Má prístup'], ['off', 'Vypnutý']] },
          { key: 'modul', type: 'select', label: 'Má obrazovku', value: (m) => P().modulesOf(m), allLabel: 'Akúkoľvek', more: true,
            options: P().MODULES.map(x => [x.key, x.label]), sortOptions: false,
            hint: 'Kto smie na zvolenú obrazovku (podľa roly alebo zaškrtnutia na mieru).' },
          { key: 'namieru', type: 'toggle', label: 'Práva na mieru', test: (m) => m.role !== 'admin' && (m.modules || []).filter(Boolean).length > 0, more: true,
            hint: 'Ľudia, ktorým niekto upravil zaškrtnutie oproti role.' },
        ],
        empty: { ico: 'clients', title: 'Zatiaľ žiadny používateľ', sub: 'Pridajte seba ako administrátora a potom ostatných.',
          cta: admin ? `<button class="btn btn-primary" onclick="Mem.form()">${Icon('plus')} Pridať človeka</button>` : '' },
        export: {
          name: ['pouzivatelia'],
          columns: [
            ['Meno', m => m.full_name || ''], ['E-mail', m => m.email || ''], ['Rola', m => P().roleLabel(m.role)],
            ['Prístup', m => (m.active === false ? 'vypnutý' : 'má prístup')], ['Na čo má', m => P().describe(m)],
            ['Obrazovky', m => P().modulesOf(m).map(modName).join(', ')], ['Poznámka', m => m.note || ''],
          ],
        },
      };
    },

    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const admin = Danubra.isAdmin();
      const prvy = P().bootstrap(this.items);

      Danubra.setActions(admin
        ? `<button class="btn btn-primary btn-sm" onclick="Mem.form()">${Icon('plus')} Pridať človeka</button>`
        : '');

      el.innerHTML = Danubra.header(Danubra.labelOf('members'),
        'Kto smie do appky a na čo')
        + (prvy ? `<div class="warnbox" style="margin-bottom:14px;">
            ${Icon('alert', 14)} Zatiaľ tu nie je nikto, takže <strong>každý prihlásený
            má všetko</strong>. Hneď ako pridáte prvého človeka, začnú platiť práva —
            nezabudnite pridať aj seba ako administrátora.</div>` : '')
        + (!admin ? `<div class="regimebox" style="margin-bottom:14px;">
            Práva mení len administrátor. Toto je na pozretie, kto čo má.</div>` : '')
        // Zoznam je spoločný komponent (`DataList`): dovtedy tu boli karty
        // s hľadaním a jedným výberom roly, bez stĺpcov a bez filtra prístupu.
        + DataList.html(this.listConfig(this.items, admin))
        + `<div class="form-section">Čo môže len administrátor${UI.tip('Administrátor je rola s plnými právami. '
             + 'Faktúra sa nikdy nevystaví ani neodošle bez schválenia adminom — a toto právo sa nedá dať nikomu inému.')}</div>
           <p class="card-note" style="margin:0 0 8px;">Toto sa nedá prideliť nikomu
             inému — ani zaškrtnutím. Sú to pravidlá zo zadania, nie nastavenie.</p>
           <div class="ad-promise">
             ${P().ADMIN_ONLY.map(([, label]) => `<span>${UI.esc(label)}</span>`).join('')}
           </div>`;
    },

    form(id) {
      if (!Danubra.isAdmin()) return UI.toast('Práva mení len administrátor.', 'err');
      const m = id ? this.items.find(x => x.id === id) || {} : {};
      const own = new Set((m.modules || []).filter(Boolean));
      const role = m.role || 'coordinator';

      // Predvolene je zaškrtnuté to, čo dáva rola — aby bolo vidieť, z čoho
      // sa vychádza, a dalo sa od toho odchýliť.
      const base = own.size ? [...own] : (P().PRESETS[role] || []);
      const checked = new Set(base);

      const groups = P().grouped().map(g => `
        <div class="mem-group">
          <div class="mem-group-head">${UI.esc(g.label)}</div>
          ${g.items.map(x => `
            <label class="mem-check">
              <input type="checkbox" name="mod_${x.key}" ${checked.has(x.key) ? 'checked' : ''}>
              <span>${UI.esc(x.label)}</span>${x.hint ? UI.tip(x.hint) : ''}
            </label>`).join('')}
        </div>`).join('');

      UI.modal(id ? (m.full_name || m.email || 'Používateľ') : 'Pridať človeka', `
        <form id="mem-form" onsubmit="event.preventDefault();Mem.save('${id || ''}')">
          ${id ? '' : `<div class="regimebox">Človek sa musí do appky prihlásiť tým istým
            e-mailom. Účet mu vytvorte v Supabase → Authentication; tu sa nastavuje len to,
            na čo má.</div>`}
          <div class="form-grid">
            ${UI.field('full_name', 'Meno', { value: m.full_name, required: true })}
            ${UI.field('email', 'E-mail', { type: 'email', value: m.email,
              placeholder: 'ten istý, ktorým sa prihlasuje' })}
            ${UI.field('role', 'Rola', { value: role,
              tip: 'Rola je hotová predvoľba, na ktoré obrazovky človek smie. Čo presne dáva, je napísané '
                + 'pod poľom. Nižšie sa to dá upraviť na mieru.',
              options: P().ROLES.map(r => [r[0], r[1]]) })}
            ${UI.field('active', '', { type: 'checkbox', value: m.active !== false,
              placeholder: 'Má prístup do appky',
              tip: 'Keď odškrtnete, človek sa do appky už nedostane. Nič sa nemaže — jeho úlohy, poznámky '
                + 'a schválenia zostanú aj s jeho menom.' })}
          </div>
          <p class="muted-sm">
            ${P().ROLES.map(r => `<span class="mem-role-note" data-role="${r[0]}"
              ${r[0] === role ? '' : 'hidden'}>${UI.esc(r[2])}</span>`).join('')}
          </p>

          <div class="form-section">Na čo má${UI.tip('Každé zaškrtnutie je jedna obrazovka v menu. Schvaľovanie '
            + 'faktúr, výnimky a správa používateľov sa prideliť nedajú — tie má vždy len administrátor.')}</div>
          <p class="muted-sm">Zaškrtnuté je to, čo dáva rola.
            Keď to zmeníte, uloží sa presne tento zoznam a rola zostane len ako poznámka,
            z čoho sa vychádzalo.</p>
          <div class="mem-modules">${groups}</div>

          ${UI.field('note', 'Poznámka', { type: 'textarea', rows: 2, value: m.note })}

          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">Uložiť</button>
          </div>
        </form>`, { wide: true });

      // Zmena roly prekreslí zaškrtnutie na jej predvoľbu — inak by človek
      // menil rolu a nevidel, čo tým spravil.
      const sel = document.querySelector('#mem-form select[name=role]');
      if (sel) {
        sel.addEventListener('change', () => {
          const pre = new Set(P().PRESETS[sel.value] || []);
          const all = sel.value === 'admin';
          for (const x of P().MODULES) {
            const box = document.querySelector(`#mem-form input[name=mod_${x.key}]`);
            if (box) { box.checked = all || pre.has(x.key); box.disabled = all; }
          }
          document.querySelectorAll('#mem-form .mem-role-note').forEach(n => {
            n.hidden = n.dataset.role !== sel.value;
          });
        });
        if (role === 'admin') sel.dispatchEvent(new Event('change'));
      }
    },

    async save(id) {
      const form = document.getElementById('mem-form');
      const d = UI.formData(form);
      if (!d.full_name) return UI.toast('Meno je povinné', 'err');

      const picked = P().MODULES.map(x => x.key).filter(k => d[`mod_${k}`]);
      const preset = P().PRESETS[d.role] || [];
      // Keď sa zaškrtnutie zhoduje s predvoľbou roly, neukladá sa zoznam —
      // nech sa človek vezie na role a nie na kópii, ktorá zastará.
      const same = d.role !== 'custom'
        && picked.length === preset.length && picked.every(k => preset.includes(k));
      const payload = {
        full_name: d.full_name,
        email: d.email || null,
        role: d.role,
        active: !!d.active,
        note: d.note || null,
        modules: (d.role === 'admin' || same) ? null : picked,
      };

      const { error } = id
        ? await DB.update('members', id, payload)
        : await DB.insert('members', payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal();
      UI.toast(id ? 'Uložené' : 'Človek pridaný', 'ok');
      this.loaded = false;
      await Danubra._loadMembers();
      Danubra._buildNav();
      Danubra.renderRoute();
    },
  };

  window.Mem = Mem;
  Danubra.views.members = function (el) { return Mem.view(el); };
})();
