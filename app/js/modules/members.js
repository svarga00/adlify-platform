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
        rowActions: admin ? [
          { ico: 'lock', label: (m) => (Mem.canReset(m) ? 'Poslať nový odkaz na heslo' : 'Pozvať do appky'),
            show: (m) => m.active !== false && !!m.email, run: (m) => (Mem.canReset(m) ? Mem.reset(m.id) : Mem.invite(m.id)) },
          { ico: 'edit', label: 'Upraviť práva', run: (m) => Mem.form(m.id) }] : [],
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
          { key: 'prihlasenie', label: 'Prihlásenie', width: 'minmax(190px, 1.3fr)', mobileLabel: 'Prihlásenie',
            tip: 'Či má človek účet a heslo. Nemá účet = ešte nebol pozvaný. Pozvaný = dostal odkaz, ale heslo si ešte '
              + 'nenastavil. Aktívny = prihlasuje sa. Stav zisťuje server — appka účty sama nevidí.',
            render: (m) => Mem.loginCell(m, admin),
            sortValue: (m) => ({ active: 0, invited: 1, none: 2 }[(Mem.login[m.id] || {}).state] ?? 3),
            csv: (m) => Mem.loginText(m) },
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
            ['Prístup', m => (m.active === false ? 'vypnutý' : 'má prístup')], ['Prihlásenie', m => Mem.loginText(m)],
            ['Na čo má', m => P().describe(m)],
            ['Obrazovky', m => P().modulesOf(m).map(modName).join(', ')], ['Poznámka', m => m.note || ''],
          ],
        },
      };
    },

    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const admin = Danubra.isAdmin();
      // Stav prihlásenia povie server (auth.users appka nevidí). Zoznam sa
      // ukáže hneď a stĺpec „Prihlásenie" sa doplní, keď server odpovie.
      if (admin && !this.loginLoaded && !this.loginBusy) this.loadLogin();
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
          ${id ? '' : `<div class="regimebox">Človek sa bude prihlasovať týmto e-mailom.
            Po uložení kliknite na <strong>Pozvať do appky</strong> (alebo rovno
            <strong>Uložiť a pozvať</strong>) — appka mu založí účet a dá Vám odkaz,
            cez ktorý si nastaví heslo. Pošlete mu ho cez WhatsApp alebo e-mailom.</div>`}
          <div class="form-grid">
            ${UI.field('full_name', 'Meno', { value: m.full_name, required: true })}
            ${UI.field('email', 'E-mail', { type: 'email', value: m.email,
              placeholder: 'ním sa bude prihlasovať' })}
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
            ${id ? '' : `<button type="button" class="btn btn-ghost" id="mem-save-invite"
              onclick="Mem.save('', true)">${Icon('lock', 14)} Uložiť a pozvať</button>`}
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

    async save(id, andInvite) {
      const form = document.getElementById('mem-form');
      const d = UI.formData(form);
      if (!d.full_name) return UI.toast('Meno je povinné', 'err');
      if (andInvite && !d.email) return UI.toast('Na pozvanie treba e-mail — ním sa bude prihlasovať.', 'err');
      if (andInvite && !d.active) return UI.toast('Človek bez prístupu sa pozvať nedá — zaškrtnite „Má prístup do appky".', 'err');

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

      const { data: saved, error } = id
        ? await DB.update('members', id, payload)
        : await DB.insert('members', payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal();
      UI.toast(id ? 'Uložené' : 'Človek pridaný', 'ok');
      this.loaded = false; this.loginLoaded = false;
      await Danubra._loadMembers();
      Danubra._buildNav();
      await Danubra.renderRoute();
      if (andInvite && saved && saved.id) await this.invite(saved.id);
    },

    // ── Prihlásenie: pozvánka a odkaz na heslo ──────────────────────────────
    // Účty (auth.users) zakladá a číta server: netlify/functions/
    // danubra-member-invite.js. Odkaz sa nikam nepošle sám — admin ho skopíruje,
    // pošle cez WhatsApp alebo e-mailom zo schránky firmy.
    login: {}, loginLoaded: false, loginBusy: false, loginError: null,
    FN: '/.netlify/functions/danubra-member-invite',
    L: () => window.DanubraPrihlasenie,

    async call(body) {
      try {
        const r = await fetch(this.FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        let j = {};
        try { j = await r.json(); } catch (e) { j = {}; }
        if (!r.ok || j.error) return { error: j.error || `Server odpovedal chybou ${r.status}.` };
        return j;
      } catch (e) {
        return { error: 'Spojenie so serverom zlyhalo. Skúste to o chvíľu.' };
      }
    },

    async loadLogin() {
      this.loginBusy = true;
      const r = await this.call({ action: 'status' });
      this.loginBusy = false;
      this.loginLoaded = true;
      if (r.error) { this.loginError = r.error; this.login = {}; }
      else {
        this.loginError = null;
        this.login = Object.fromEntries((r.members || []).map(s => [s.member_id, s]));
        if (r.app_url) this.appUrl = r.app_url;
      }
      if (Danubra.route === 'members' && document.getElementById('dl-clenovia')) DataList.refresh('clenovia');
    },

    /** Má prepojený účet → „Poslať nový odkaz", inak „Pozvať do appky". */
    canReset(m) {
      const s = this.login[m.id];
      return !!(m.user_id && s && s.has_account && s.linked);
    },

    loginState(m) {
      if (this.loginError && this.loginLoaded) return { error: 'server neodpovedal' };
      if (!this.loginLoaded) return null;
      return this.login[m.id] || { state: 'none', has_account: false };
    },

    loginText(m) {
      const l = this.L().loginLabel(this.loginState(m), m);
      return l.sub ? `${l.text} (${l.sub})` : l.text;
    },

    loginCell(m, admin) {
      const l = this.L().loginLabel(this.loginState(m), m);
      const tone = { green: 'is-green', amber: 'is-amber', mute: 'is-mute' }[l.tone] || '';
      const ok = admin && m.active !== false && m.email && this.loginLoaded && !this.loginError;
      const btn = !ok ? '' : this.canReset(m)
        ? `<button type="button" class="btn btn-ghost btn-sm mem-inv" onclick="Mem.reset('${m.id}')">Poslať nový odkaz na heslo</button>`
        : `<button type="button" class="btn btn-ghost btn-sm mem-inv" onclick="Mem.invite('${m.id}')">${Icon('lock', 12)} Pozvať do appky</button>`;
      return `<span class="dl-two is-wrap mem-login" data-login="${UI.esc(l.key)}">
        <b class="dl-note ${tone}">${l.key === 'active' ? Icon('check', 12) + ' ' : ''}${UI.esc(l.text)}</b>${
        l.sub ? `<small>${UI.esc(l.sub)}</small>` : ''}${btn}</span>`;
    },

    async invite(id) { return this.linkFor(id, 'invite'); },
    async reset(id) {
      const m = this.items.find(x => x.id === id) || {};
      const ok = await UI.confirm(`Poslať ${m.full_name || 'človeku'} nový odkaz na nastavenie hesla?`, {
        hint: 'Doterajšie heslo platí, kým si nenastaví nové. Starší odkaz prestane platiť.', ok: 'Vytvoriť odkaz', danger: false });
      if (!ok) return;
      return this.linkFor(id, 'reset');
    },

    async linkFor(id, action) {
      if (!Danubra.isAdmin()) return UI.toast('Pozývať smie len administrátor.', 'err');
      const m = this.items.find(x => x.id === id) || {};
      UI.toast(action === 'invite' ? 'Pripravujem pozvánku…' : 'Pripravujem odkaz…');
      const r = await this.call({ action, member_id: id });
      if (r.error) return UI.toast(r.error, 'err');
      this.loginLoaded = false;
      this.loadLogin();
      if (!r.link) {
        // Účet, ktorý nezaložila appka (napr. z Adlify): len prepojený.
        return UI.modal(m.full_name || 'Pozvánka', `
          <div class="regimebox">${UI.esc(r.message || 'Účet je prepojený.')}</div>
          <div class="modal-actions"><button type="button" class="btn btn-primary" onclick="UI.closeModal()">Rozumiem</button></div>`);
      }
      return this.linkModal(m, r, action);
    },

    async linkModal(m, r, action) {
      const L = this.L();
      const app = r.app_url || this.appUrl || L.appAddress(location.origin);
      const company = (Danubra.supplier && Danubra.supplier().name) || '';
      const msg = { name: m.full_name, email: r.email || m.email, link: r.link, appUrl: app, company };
      this._last = { member: m, link: r.link, msg };
      const wa = `https://wa.me/?text=${encodeURIComponent(L.whatsappText(msg))}`;
      const mailto = `mailto:${encodeURIComponent(msg.email || '')}?subject=${encodeURIComponent(L.mailSubject(company))}&body=${
        encodeURIComponent(L.mailText({ ...msg, from: (Danubra.me && Danubra.me.full_name) || '' }))}`;
      let boxes = [];
      try {
        const { data } = await DB.list('mailboxes', { select: 'id,name,email,active', limit: 50 });
        boxes = (data || []).filter(b => b.active !== false);
      } catch (e) { boxes = []; }
      const boxPick = boxes.length > 1
        ? `<span class="fld" style="display:inline-grid;"><select id="mem-inv-box" aria-label="Z ktorej schránky">${boxes.map(b =>
          `<option value="${UI.esc(b.id)}">${UI.esc(b.email)}</option>`).join('')}</select></span>` : '';
      UI.modal(action === 'invite' ? `Pozvánka pre ${m.full_name || msg.email}` : `Nový odkaz na heslo — ${m.full_name || msg.email}`, `
        <div class="mem-invite" id="mem-invite">
          <p class="card-note" style="margin:0 0 10px;">${action === 'invite' && r.created ? 'Účet je založený. ' : ''}Pošlite
            ${UI.esc(m.full_name || 'človeku')} tento odkaz. Otvorí ho, nastaví si heslo a potom sa prihlasuje
            na <strong>${UI.esc(app)}</strong> e-mailom <strong>${UI.esc(msg.email || '')}</strong>.</p>
          <div class="fld"><span>Odkaz na nastavenie hesla</span>
            <div style="display:flex;gap:8px;align-items:stretch;flex-wrap:wrap;">
              <input id="mem-inv-link" readonly value="${UI.esc(r.link)}" aria-label="Odkaz na nastavenie hesla"
                style="flex:1 1 260px;min-width:0;font-size:12.5px;" onfocus="this.select()">
              <button type="button" class="btn btn-primary" id="mem-inv-copy" onclick="Mem.copyLink()">${Icon('copy', 14)} Kopírovať</button>
            </div></div>
          <div class="mem-inv-acts" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
            <a class="btn btn-ghost" id="mem-inv-wa" href="${UI.esc(wa)}" target="_blank" rel="noopener">${Icon('whatsapp', 14)} Poslať cez WhatsApp</a>
            ${boxes.length ? `<button type="button" class="btn btn-ghost" id="mem-inv-mail" onclick="Mem.sendMail()">${Icon('mail', 14)} Poslať e-mailom</button>${boxPick}` : ''}
            <a class="btn btn-ghost" id="mem-inv-mailto" href="${UI.esc(mailto)}">${Icon('mail', 14)} ${boxes.length ? 'Otvoriť vo vlastnom e-maile' : 'Poslať e-mailom'}</a>
          </div>
          <div class="regimebox" style="margin-top:14px;">${Icon('clock', 13)} ${UI.esc(r.expires_hint || L.MSG.note)}
            Keď vyprší, kliknite pri človeku na „Poslať nový odkaz na heslo".</div>
          <div id="mem-inv-msg" class="muted-sm" role="status" style="margin-top:8px;"></div>
          <div class="modal-actions"><button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Hotovo</button></div>
        </div>`);
    },

    async copyLink() {
      const inp = document.getElementById('mem-inv-link');
      if (!inp) return;
      let ok = false;
      try { await navigator.clipboard.writeText(inp.value); ok = true; } catch (e) {
        try { inp.select(); ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      }
      UI.toast(ok ? 'Odkaz je skopírovaný' : 'Skopírujte odkaz ručne (označený v poli).', ok ? 'ok' : 'err');
    },

    async sendMail() {
      const last = this._last;
      if (!last) return;
      const btn = document.getElementById('mem-inv-mail');
      const box = document.getElementById('mem-inv-box');
      const out = document.getElementById('mem-inv-msg');
      if (btn) { btn.disabled = true; btn.textContent = 'Posielam…'; }
      const r = await this.call({ action: 'send', member_id: last.member.id, link: last.link, mailbox_id: box ? box.value : undefined });
      if (btn) { btn.disabled = false; btn.innerHTML = `${Icon('mail', 14)} Poslať e-mailom`; }
      if (r.error) { if (out) out.textContent = r.error; return UI.toast(r.error, 'err'); }
      if (out) out.textContent = `E-mail odišiel na ${r.sent_to} zo schránky ${r.mailbox}.`;
      UI.toast('E-mail s pozvánkou odišiel', 'ok');
    },
  };

  window.Mem = Mem;
  Danubra.views.members = function (el) { return Mem.view(el); };
})();
