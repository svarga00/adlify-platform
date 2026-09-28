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

    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const rows = this.rows();
      const admin = Danubra.isAdmin();
      const prvy = P().bootstrap(this.items);

      Danubra.setActions(admin
        ? `<button class="btn btn-primary btn-sm" onclick="Mem.form()">${Icon('plus')} Pridať človeka</button>`
        : '');

      const card = (m) => {
        const ja = Danubra.me && Danubra.me.id === m.id;
        const mods = P().modulesOf(m);
        return `
          <div class="card card-pad list-card${m.active === false ? ' is-off' : ''}"
               ${admin ? `onclick="Mem.form('${m.id}')"` : ''}>
            <div class="card-head">
              <div class="card-title">
                <span class="t-who">${UI.esc((m.full_name || m.email || '?').slice(0, 2).toUpperCase())}</span>
                ${UI.esc(m.full_name || m.email || 'bez mena')}${ja ? ' <em class="mem-me">ja</em>' : ''}
              </div>
              ${m.active === false ? UI.badge('vypnutý', 'gray')
                : UI.badge(P().roleLabel(m.role), m.role === 'admin' ? 'red' : 'blue')}
            </div>
            <div class="meta-row">
              ${m.email ? `<span>${Icon('mail', 14)} ${UI.esc(m.email)}</span>` : ''}
              <span>${Icon('shield', 14)} ${UI.esc(P().describe(m))}</span>
            </div>
            ${(m.modules || []).length ? `<div class="ad-promise">
              ${mods.slice(0, 8).map(k => {
                const mm = P().MODULES.find(x => x.key === k);
                return `<span>${UI.esc(mm ? mm.label : k)}</span>`;
              }).join('')}
              ${mods.length > 8 ? `<span>+${mods.length - 8}</span>` : ''}
            </div>` : ''}
            ${m.note ? `<p class="card-note">${UI.esc(m.note)}</p>` : ''}
          </div>`;
      };

      el.innerHTML = Danubra.header(Danubra.labelOf('members'),
        'Kto smie do appky a na čo')
        + (prvy ? `<div class="warnbox" style="margin-bottom:14px;">
            ${Icon('alert', 14)} Zatiaľ tu nie je nikto, takže <strong>každý prihlásený
            má všetko</strong>. Hneď ako pridáš prvého človeka, začnú platiť práva —
            nezabudni pridať aj seba ako administrátora.</div>` : '')
        + (!admin ? `<div class="regimebox" style="margin-bottom:14px;">
            Práva mení len administrátor. Toto je na pozretie, kto čo má.</div>` : '')
        + Shell.list({
          rows, total: this.items.length, render: card, layout: 'cards',
          emptyIcon: 'clients', emptyTitle: 'Zatiaľ žiadny používateľ',
          emptySub: 'Pridaj seba ako administrátora a potom ostatných.',
          filter: {
            search: { value: this.filters.q, placeholder: 'Hľadať meno alebo e-mail…',
              oninput: 'Mem.setF("q", this.value)' },
            selects: [{
              value: this.filters.role, label: 'Rola',
              onchange: 'Mem.setF("role", this.value)',
              options: [['', 'Všetky role'], ...P().ROLES.map(r => [r[0], r[1]])],
            }],
          },
        })
        + `<div class="form-section">Čo môže len administrátor</div>
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
              <span>${UI.esc(x.label)}</span>
            </label>`).join('')}
        </div>`).join('');

      UI.modal(id ? (m.full_name || m.email || 'Používateľ') : 'Pridať človeka', `
        <form id="mem-form" onsubmit="event.preventDefault();Mem.save('${id || ''}')">
          <div class="form-grid">
            ${UI.field('full_name', 'Meno', { value: m.full_name, required: true })}
            ${UI.field('email', 'E-mail', { type: 'email', value: m.email,
              placeholder: 'ten istý, ktorým sa prihlasuje' })}
            ${UI.field('role', 'Rola', { value: role,
              options: P().ROLES.map(r => [r[0], r[1]]) })}
            ${UI.field('active', '', { type: 'checkbox', value: m.active !== false,
              placeholder: 'Má prístup do appky' })}
          </div>
          <p class="card-note" style="margin:0 0 10px;">
            ${P().ROLES.map(r => `<span class="mem-role-note" data-role="${r[0]}"
              ${r[0] === role ? '' : 'hidden'}>${UI.esc(r[2])}</span>`).join('')}
          </p>

          <div class="form-section">Na čo má</div>
          <p class="card-note" style="margin:0 0 10px;">Zaškrtnuté je to, čo dáva rola.
            Keď to zmeníš, uloží sa presne tento zoznam a rola zostane len ako poznámka,
            z čoho sa vychádzalo.</p>
          <div class="mem-modules">${groups}</div>

          ${UI.field('note', 'Poznámka', { type: 'textarea', rows: 2, value: m.note })}

          ${id ? '' : `<div class="regimebox">Človek sa musí do appky prihlásiť tým istým
            e-mailom. Účet mu vytvor v Supabase → Authentication; tu sa nastavuje len to,
            na čo má.</div>`}

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
