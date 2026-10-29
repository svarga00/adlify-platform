// ============================================================================
// DANUBRA — Správy: e-mailový klient (viac schránok, podpis, prístupy)
// ============================================================================
// „Správy som myslel ako plnohodnotný mailový klient s viacerými schránkami,
// podpisom atď."
//
//   Schránky   každý vidí len tie, ktoré mu admin pridelil (Nastavenia → Schránky)
//   Priečinky  Doručené a Odoslané; nové e-maily sa sťahujú každých 10 minút
//              a tlačidlom Obnoviť hneď
//   Čítanie    HTML v izolovanom okne, obrázky z webu len na kliknutie
//   Písanie    odpoveď, odpoveď všetkým, preposlanie, podpis podľa schránky,
//              prílohy z Dokumentov aj z počítača
//   Prepojenie e-mail sa sám priradí k živnostníkovi / odberateľovi / novej
//              firme podľa adresy; pri nich je zoznam ich e-mailov
//
// Heslá schránok a pripojenie k serverom sú len na serveri
// (danubra-mail-account, -sync-background, -send). Logika: lib/mail/mail.js.
// ============================================================================
(function () {
  const MM = () => window.DanubraMail;
  const COLS = 'id,mailbox_id,folder,direction,from_email,from_name,to_list,cc_list,subject,sent_at,snippet,seen,flagged,'
    + 'attachments,worker_id,partner_id,lead_id,message_id,refs,in_reply_to,archived_at';

  async function token() {
    try { const { data } = await DB.client.auth.getSession(); return (data && data.session && data.session.access_token) || ''; }
    catch (e) { return ''; }
  }
  async function call(fn, body) {
    const res = await fetch(`/.netlify/functions/${fn}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: JSON.stringify(body) });
    let data = {};
    try { data = await res.json(); } catch (e) { data = { error: 'Server neodpovedal.' }; }
    if (!res.ok || data.error) throw new Error(data.error || `Chyba ${res.status}`);
    return data;
  }

  const Mail = {
    boxes: [], messages: [], contacts: [], loaded: false,
    box: null, folder: 'in', openId: null, q: '', unread: false, images: new Set(), cache: new Map(),

    async load() {
      const [b, m] = await Promise.all([
        DB.list('mailboxes', { select: 'id,name,email,display_name,signature,signature_card,sent_folder,last_sync_at,sync_error,active', limit: 100 }),
        DB.list('mail_messages', { select: COLS, order: { column: 'sent_at', ascending: false }, limit: 1500 }),
      ]);
      this.boxes = (b.data || []).filter(x => x.active !== false);
      this.messages = (m.data || []).filter(x => !x.archived_at);
      if (!this.box || !this.boxes.some(x => x.id === this.box)) this.box = (this.boxes[0] || {}).id || null;
      this.loaded = true;
    },

    boxOf(id) { return this.boxes.find(b => b.id === id) || {}; },
    unreadIn(boxId) { return this.messages.filter(m => m.mailbox_id === boxId && m.direction === 'in' && !m.seen).length; },
    setF(k, v) { this[k] = v; if (k === 'box' || k === 'folder') this.openId = null; Danubra.renderRoute(); },

    rows() {
      const q = String(this.q || '').toLowerCase();
      return this.messages.filter(m => m.mailbox_id === this.box && m.direction === this.folder
        && (!this.unread || !m.seen)
        && (!q || `${m.subject} ${m.from_name || ''} ${m.from_email || ''} ${m.snippet || ''} ${(m.to_list || []).map(a => a.address).join(' ')}`.toLowerCase().includes(q)));
    },

    async view(el) {
      Danubra.setActions(`
        <button class="btn btn-outline btn-sm" onclick="Mail.sync()">${Icon('repeat', 14)} Obnoviť</button>
        <button class="btn btn-primary btn-sm" onclick="Mail.compose()">${Icon('plus', 14)} Napísať</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const nep = this.boxes.reduce((n, b) => n + this.unreadIn(b.id), 0);
      const head = Danubra.header(Danubra.labelOf('mail'), this.boxes.length
        ? `${this.boxes.length} ${Shell.plural(this.boxes.length, 'schránka', 'schránky', 'schránok')} · ${nep} ${Shell.plural(nep, 'neprečítaný', 'neprečítané', 'neprečítaných')}`
        : 'E-maily zo všetkých firemných schránok na jednom mieste');
      const now = Shell.now(this.nowOf(), { help: 'screen.mail', ...this.nowAction() });
      if (!this.boxes.length) {
        el.innerHTML = head + now + UI.empty('mail', 'Zatiaľ žiadna schránka',
          Danubra.isAdmin() ? 'Pridajte firemnú schránku (info@, fakturacia@…) — stačí e-mail a heslo, servery Websupportu a Forpsi sa doplnia samy.'
            : 'Nemáte pridelenú žiadnu schránku. Požiadajte administrátora (Nastavenia → Schránky).',
          Danubra.isAdmin() ? `<button class="btn btn-primary" onclick="Danubra.go('mailboxes')">${Icon('plus')} Pridať schránku</button>` : '');
        return;
      }
      const b = this.boxOf(this.box);
      const rows = this.rows();
      const open = this.openId ? this.messages.find(m => m.id === this.openId) : null;
      el.innerHTML = head + now + `
        <div class="mail-wrap${open ? ' has-open' : ''}">
          <aside class="mail-side">
            ${this.boxes.map(x => `<div class="mail-box${x.id === this.box ? ' on' : ''}">
              <div class="mail-box-h" title="${UI.esc(x.email)}">${Icon('mail', 14)} <b>${UI.esc(x.name || x.email)}</b></div>
              <button class="mail-fold${x.id === this.box && this.folder === 'in' ? ' on' : ''}" onclick="Mail.go('${x.id}','in')">
                Doručené ${this.unreadIn(x.id) ? `<em>${this.unreadIn(x.id)}</em>` : ''}</button>
              <button class="mail-fold${x.id === this.box && this.folder === 'out' ? ' on' : ''}" onclick="Mail.go('${x.id}','out')">Odoslané</button>
            </div>`).join('')}
            <p class="card-note">${b.last_sync_at ? `Stiahnuté ${UI.esc(MM().fmtDate(b.last_sync_at))}` : 'Ešte nestiahnuté — kliknite Obnoviť.'}</p>
          </aside>
          <section class="mail-list">
            <div class="mail-tools">
              <input type="search" placeholder="Hľadať v e-mailoch…" value="${UI.esc(this.q)}" onchange="Mail.setF('q', this.value)">
              <label class="chk"><input type="checkbox" ${this.unread ? 'checked' : ''} onchange="Mail.setF('unread', this.checked)"> Neprečítané</label>
            </div>
            ${rows.length ? rows.slice(0, 300).map(m => this.rowHtml(m)).join('')
              : `<div class="js-empty" style="padding:16px;">${this.messages.some(m => m.mailbox_id === this.box) ? 'Nič tu nie je.' : 'Zatiaľ žiadne e-maily — kliknite Obnoviť.'}</div>`}
          </section>
          <section class="mail-read" id="mail-read">${open ? UI.loading() : `<div class="mail-empty">${Icon('mail', 28)}<span>Vyberte e-mail zo zoznamu</span></div>`}</section>
        </div>`;
      if (open) this.paintOpen(open);
    },

    /** Jedna veta „čo teraz": chyba schránky, neprečítané, alebo nič. */
    nowOf() {
      if (!this.boxes.length) {
        return Danubra.isAdmin()
          ? { key: 'setup', title: 'Pridajte firemnú schránku', what: 'Stačí e-mail a heslo — servery Websupportu a Forpsi sa doplnia samy.' }
          : { key: 'none', title: 'Nemáte pridelenú žiadnu schránku', what: 'Požiadajte administrátora (Nastavenia → Schránky).' };
      }
      const zla = this.boxes.find(b => b.sync_error);
      if (zla) {
        return { key: 'error', hot: true, title: `Schránka ${zla.email} sa nepripojila`, why: zla.sync_error,
          what: Danubra.isAdmin() ? 'Skontrolujte heslo v Nastaveniach → Schránky.' : 'Dajte vedieť administrátorovi.' };
      }
      const nep = this.messages.filter(m => m.direction === 'in' && !m.seen);
      if (nep.length) {
        return { key: 'unread', title: `${nep.length} ${Shell.plural(nep.length, 'neprečítaný e-mail', 'neprečítané e-maily', 'neprečítaných e-mailov')}`,
          what: `Najnovší: ${nep[0].from_name || nep[0].from_email || ''} — ${nep[0].subject || '(bez predmetu)'}` };
      }
      return { key: 'ok', title: 'Všetko prečítané', what: 'Nové e-maily sa sťahujú samy každých 10 minút.' };
    },
    nowAction() {
      const n = this.nowOf();
      if (n.key === 'error' && Danubra.isAdmin()) return { action: { label: 'Otvoriť schránky', ico: 'settings', onclick: "Danubra.go('mailboxes')" } };
      if (n.key === 'unread') {
        const m = this.messages.find(x => x.direction === 'in' && !x.seen);
        return { action: { label: 'Otvoriť', ico: 'mail', onclick: `Mail.box='${m.mailbox_id}';Mail.folder='in';Mail.open('${m.id}')` } };
      }
      return {};
    },

    go(box, folder) { this.box = box; this.folder = folder; this.openId = null; Danubra.renderRoute(); },

    rowHtml(m) {
      const kto = this.folder === 'out'
        ? `Komu: ${(m.to_list || []).map(a => a.name || a.address).join(', ')}` : (m.from_name || m.from_email || '—');
      const pril = (m.attachments || []).length;
      return `<button class="mail-row${m.seen ? '' : ' unread'}${m.id === this.openId ? ' on' : ''}" onclick="Mail.open('${m.id}')">
        <span class="mail-row-top"><b>${UI.esc(kto)}</b><time>${UI.esc(this.shortDate(m.sent_at))}</time></span>
        <span class="mail-row-subj">${pril ? Icon('doc', 12) : ''}${UI.esc(m.subject || '(bez predmetu)')}</span>
        <span class="mail-row-snip">${UI.esc(m.snippet || '')}</span>
      </button>`;
    },

    shortDate(d) {
      const x = new Date(d); if (isNaN(x)) return '';
      const dnes = new Date();
      return x.toDateString() === dnes.toDateString()
        ? `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`
        : `${x.getDate()}. ${x.getMonth() + 1}.${x.getFullYear() !== dnes.getFullYear() ? ` ${x.getFullYear()}` : ''}`;
    },

    async open(id) {
      this.openId = id;
      Danubra.renderRoute();
      const m = this.messages.find(x => x.id === id);
      if (m && !m.seen) {
        m.seen = true;
        call('danubra-mail-send', { action: 'seen', id, seen: true }).catch(() => DB.update('mail_messages', id, { seen: true }));
      }
    },

    async full(id) {
      if (this.cache.has(id)) return this.cache.get(id);
      const { data } = await DB.list('mail_messages', { select: `${COLS},text_body,html_body`, filters: { id }, limit: 1 });
      const m = (data || [])[0] || this.messages.find(x => x.id === id);
      this.cache.set(id, m);
      return m;
    },

    async paintOpen(row) {
      const box = document.getElementById('mail-read');
      const m = await this.full(row.id);
      if (!box || this.openId !== row.id || !m) return;
      const adr = (l) => (l || []).map(a => UI.esc(a.name ? `${a.name} <${a.address}>` : a.address)).join(', ');
      const ent = [m.worker_id && Danubra.link('worker', m.worker_id, 'Živnostník'), m.partner_id && Danubra.link('partner', m.partner_id, 'Odberateľ'),
        m.lead_id && `<button class="link-chip" onclick="Danubra.go('leads')">${Icon('marketing', 13)}<span>Nová firma</span></button>`].filter(Boolean).join('');
      const imgs = this.images.has(m.id);
      box.innerHTML = `
        <div class="mail-read-acts">
          <button class="btn btn-ghost btn-sm mail-back" onclick="Mail.openId=null;Danubra.renderRoute()">${Icon('back', 14)} Späť</button>
          <button class="btn btn-primary btn-sm" onclick="Mail.reply('${m.id}')">${Icon('back', 14)} Odpovedať</button>
          <button class="btn btn-outline btn-sm" onclick="Mail.reply('${m.id}', true)">Všetkým</button>
          <button class="btn btn-outline btn-sm" onclick="Mail.forward('${m.id}')">Preposlať</button>
          <span class="mail-read-more">
            <button class="btn btn-ghost btn-sm" onclick="Mail.assign('${m.id}')">${Icon('user', 14)} Priradiť</button>
            <button class="btn btn-ghost btn-sm" onclick="Mail.unreadMark('${m.id}')">Neprečítané</button>
            <button class="btn btn-ghost btn-sm" onclick="Mail.hide('${m.id}')" title="Skryť zo zoznamu (v schránke zostane)">${Icon('x', 14)} Skryť</button>
          </span>
        </div>
        <h2 class="mail-subj">${UI.esc(m.subject || '(bez predmetu)')}</h2>
        <div class="mail-meta">
          <div><b>${UI.esc(m.from_name || m.from_email || '')}</b> ${m.from_name ? `<span>&lt;${UI.esc(m.from_email)}&gt;</span>` : ''}</div>
          <div>Komu: ${adr(m.to_list)}${(m.cc_list || []).length ? ` · Kópia: ${adr(m.cc_list)}` : ''}</div>
          <div>${UI.esc(MM().fmtDate(m.sent_at))}</div>
          ${ent ? `<div class="link-row" style="margin-top:6px;">${ent}</div>` : ''}
        </div>
        ${MM().hasRemoteImages(m) && !imgs ? `<div class="notebox" style="margin:8px 0;">Obrázky z webu sú skryté (môžu slúžiť na sledovanie).
          <button class="link-chip" onclick="Mail.images.add('${m.id}');Mail.paintOpen({id:'${m.id}'})">Zobraziť obrázky</button></div>` : ''}
        <iframe class="mail-body" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" title="Text e-mailu"></iframe>
        ${(m.attachments || []).length ? `<div class="mail-att">${m.attachments.map((a, i) => a.storage_path
          ? `<button class="link-chip" onclick="Mail.att('${m.id}', ${i})">${Icon('doc', 13)}<span>${UI.esc(a.name)}${a.size ? ` · ${Math.max(1, Math.round(a.size / 1024))} kB` : ''}</span></button>`
          : `<span class="link-chip is-static">${UI.esc(a.name)} (príliš veľká)</span>`).join('')}</div>` : ''}`;
      const fr = box.querySelector('iframe.mail-body');
      fr.addEventListener('load', () => {
        try { fr.style.height = `${Math.min(4000, fr.contentDocument.body.scrollHeight + 24)}px`; } catch (e) { fr.style.height = '600px'; }
      });
      fr.srcdoc = MM().viewerDoc(m, { images: imgs });
    },

    async att(id, i) {
      const m = await this.full(id);
      const a = m && (m.attachments || [])[i];
      if (!a) return;
      const w = window.open('', '_blank');
      const { url } = await DB.signedDocUrl(a.storage_path, 600);
      if (!url) { if (w) w.close(); return UI.toast('Príloha sa nedá otvoriť', 'err'); }
      if (w) w.location.href = url; else location.href = url;
    },

    async unreadMark(id) {
      const m = this.messages.find(x => x.id === id); if (m) m.seen = false;
      this.openId = null; Danubra.renderRoute();
      call('danubra-mail-send', { action: 'seen', id, seen: false }).catch(() => {});
    },

    /** Skryť zo zoznamu — v schránke na serveri e-mail zostáva, nič sa nemaže. */
    async hide(id) {
      const { error } = await DB.update('mail_messages', id, { archived_at: new Date().toISOString() });
      if (error) return UI.toast('Nepodarilo sa skryť: ' + error.message, 'err');
      this.messages = this.messages.filter(x => x.id !== id);
      this.openId = null; Danubra.renderRoute();
    },

    async assign(id) {
      const [w, p] = await Promise.all([
        DB.list('workers', { select: 'id,full_name', limit: 2000 }), DB.list('partners', { select: 'id,name', limit: 1000 })]);
      const m = await this.full(id);
      UI.modal('Priradiť e-mail', `<form id="ma-form" onsubmit="event.preventDefault();Mail.saveAssign('${id}')">
        <div class="form-grid">
          ${UI.field('worker_id', 'Živnostník', { value: m.worker_id || '', add: false, options: [['', '—'], ...(w.data || []).map(x => [x.id, x.full_name])] })}
          ${UI.field('partner_id', 'Odberateľ', { value: m.partner_id || '', add: false, options: [['', '—'], ...(p.data || []).map(x => [x.id, x.name])] })}
        </div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
          <button type="submit" class="btn btn-primary">Uložiť</button></div></form>`);
    },
    async saveAssign(id) {
      const d = UI.formData(document.getElementById('ma-form'));
      const patch = { worker_id: d.worker_id || null, partner_id: d.partner_id || null };
      const { error } = await DB.update('mail_messages', id, patch);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      Object.assign(this.messages.find(x => x.id === id) || {}, patch);
      this.cache.delete(id); UI.closeModal(); Danubra.renderRoute();
    },

    /** Stiahnuť nové e-maily hneď (inak sa sťahujú samy každých 10 minút). */
    async sync() {
      const pred = this.boxes.map(b => b.last_sync_at || '').join('|');
      UI.toast('Sťahujem nové e-maily…', 'ok');
      fetch('/.netlify/functions/danubra-mail-sync-background', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: '{}' }).catch(() => {});
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const { data } = await DB.list('mailboxes', { select: 'id,last_sync_at,sync_error', limit: 100 });
        if ((data || []).map(b => b.last_sync_at || '').join('|') !== pred) break;
      }
      this.loaded = false;
      if (Danubra.route === 'mail') Danubra.renderRoute();
    },

    // ── Písanie ───────────────────────────────────────────────────────────
    // Podpis schránky: vlastný text, inak z grafickej vizitky (DanubraMail.sigOf).
    sig(boxId) { const s = MM().sigOf(this.boxOf(boxId)); return s ? `\n\n-- \n${s}` : ''; },

    async ensure() {
      if (!this.loaded) await this.load();
      if (!this.contacts.length) {
        const [w, p, l] = await Promise.all([
          DB.list('workers', { select: 'full_name,email', limit: 3000 }), DB.list('partners', { select: 'name,email', limit: 2000 }),
          DB.list('leads', { select: 'name,email', limit: 5000 })]);
        this.contacts = [...(w.data || []).map(x => ({ name: x.full_name, address: x.email })), ...(p.data || []).map(x => ({ name: x.name, address: x.email })),
          ...(l.data || []).map(x => ({ name: x.name, address: x.email }))].filter(x => x.address && MM().emailOk(x.address));
      }
    },

    /**
     * Nový e-mail. Volá sa odkiaľkoľvek: zo Správ, z karty človeka, firmy,
     * z Dokumentov (s prílohami).
     * @param {Object} d { to, cc, subject, body, sign, mailbox_id, in_reply_to, references, attachments, links }
     */
    async compose(d = {}) {
      await this.ensure();
      if (!this.boxes.length) {
        return UI.toast(Danubra.isAdmin() ? 'Najprv pridajte schránku (Nastavenia → Schránky)' : 'Nemáte pridelenú schránku', 'err');
      }
      const boxId = d.mailbox_id && this.boxes.some(b => b.id === d.mailbox_id) ? d.mailbox_id : (this.box || this.boxes[0].id);
      this._draft = { ...d, mailbox_id: boxId, attachments: [...(d.attachments || [])] };
      const fmt = (l) => MM().parseAddresses(l || []).map(MM().fmtAddress).join(', ');
      const body = d.body != null ? `${d.body}${d.sign ? this.sig(boxId) : ''}` : this.sig(boxId);
      UI.modal(d.in_reply_to ? 'Odpoveď' : 'Nový e-mail', `<form id="mc-form" onsubmit="event.preventDefault();Mail.send()">
        <div class="form-grid">
          ${UI.field('mailbox_id', 'Od', { value: boxId, add: false, options: this.boxes.map(b => [b.id, `${b.display_name || b.name} <${b.email}>`]) })}
          ${UI.field('to', 'Komu', { value: fmt(d.to), required: true, placeholder: 'meno@firma.de, …' })}
          ${UI.field('cc', 'Kópia', { value: fmt(d.cc) })}
          ${UI.field('bcc', 'Skrytá kópia', { value: fmt(d.bcc) })}
          <div class="fld-full">${UI.field('subject', 'Predmet', { value: d.subject || '' })}</div>
          <div class="fld-full">${UI.field('text', 'Text', { type: 'textarea', rows: 14, value: body })}</div>
        </div>
        <datalist id="mc-contacts">${this.contacts.slice(0, 3000).map(c => `<option value="${UI.esc(MM().fmtAddress(c))}">`).join('')}</datalist>
        <div class="form-section">Prílohy</div>
        <div id="mc-att" class="link-row"></div>
        <div class="btn-row">
          <button type="button" class="btn btn-outline btn-sm" onclick="Mail.pickDocs()">${Icon('doc', 14)} Z Dokumentov</button>
          <label class="btn btn-outline btn-sm">${Icon('upload', 14)} Z počítača
            <input type="file" multiple hidden onchange="Mail.upload(this.files)"></label>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
          <button type="submit" class="btn btn-primary" id="mc-go">${Icon('mail', 14)} Odoslať</button>
        </div></form>`, { wide: true });
      const f = document.getElementById('mc-form');
      ['to', 'cc', 'bcc'].forEach(n => { const i = f.querySelector(`[name=${n}]`); if (i) i.setAttribute('list', 'mc-contacts'); });
      // Iná schránka = iný podpis.
      f.querySelector('[name=mailbox_id]').addEventListener('change', (e) => {
        const t = f.querySelector('[name=text]');
        // Hľadá sa „-- \n podpis" bez úvodných riadkov — textarea prvý
        // prázdny riadok zahodí.
        const podpis = (id) => MM().sigOf(this.boxOf(id));
        const stary = podpis(this._draft.mailbox_id), novy = podpis(e.target.value);
        if (stary && t.value.includes(`-- \n${stary}`)) {
          t.value = novy ? t.value.replace(`-- \n${stary}`, `-- \n${novy}`) : t.value.replace(new RegExp(`\\n*-- \\n${stary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '');
        } else if (!stary && novy) t.value = MM().withSignature(t.value, novy);
        this._draft.mailbox_id = e.target.value;
      });
      this.paintAtt();
    },

    paintAtt() {
      const box = document.getElementById('mc-att');
      if (!box) return;
      const a = this._draft.attachments || [];
      box.innerHTML = a.length ? a.map((x, i) => `<span class="link-chip">${Icon('doc', 13)}<span>${UI.esc(x.name)}</span>
        <button type="button" class="icon-btn" title="Odobrať" onclick="Mail._draft.attachments.splice(${i},1);Mail.paintAtt()">${Icon('x', 12)}</button></span>`).join('')
        : '<span class="js-empty">Bez príloh.</span>';
    },

    async pickDocs() {
      await Docs.load();
      const rows = DanubraArchive.latest(Docs.rows).slice(0, 300);
      const div = document.createElement('div');
      div.className = 'mc-docs';
      div.innerHTML = `<label class="fld"><input type="search" placeholder="Hľadať dokument…" aria-label="Hľadať dokument"
          oninput="this.closest('.mc-docs').querySelectorAll('.mf-row').forEach(r=>r.hidden=!r.dataset.n.includes(this.value.toLowerCase()))"></label>
        <div class="mf-list">${rows.map(r => `<label class="mf-row" data-n="${UI.esc(r.file_name.toLowerCase())}">
          <input type="checkbox" value="${r.id}"><span class="mf-main"><b>${UI.esc(r.file_name)}</b></span></label>`).join('') || '<div class="js-empty">Žiadne dokumenty.</div>'}</div>
        <div class="btn-row"><button type="button" class="btn btn-primary btn-sm" onclick="Mail.addDocs(this)">Pridať vybrané</button></div>`;
      const host = document.getElementById('mc-att');
      if (host && !document.querySelector('.mc-docs')) host.after(div);
    },
    addDocs(btn) {
      const ids = [...document.querySelectorAll('.mc-docs input:checked')].map(i => i.value);
      for (const r of Docs.rows.filter(x => ids.includes(x.id))) {
        this._draft.attachments.push({ storage_path: r.storage_path, name: r.file_name, type: 'application/pdf' });
      }
      document.querySelector('.mc-docs')?.remove();
      this.paintAtt();
    },

    async upload(files) {
      for (const f of Array.from(files || [])) {
        if (f.size > 15 * 1024 * 1024) { UI.toast(`${f.name}: najviac 15 MB`, 'err'); continue; }
        const path = `mail-out/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}/${DanubraArchive.slug(f.name.replace(/\.[^.]+$/, ''))}${(f.name.match(/\.[^.]+$/) || [''])[0].toLowerCase()}`;
        const { error } = await DB.client.storage.from(DB.DOCS_BUCKET).upload(path, f, { contentType: f.type || 'application/octet-stream' });
        if (error) { UI.toast(`${f.name}: ${error.message}`, 'err'); continue; }
        this._draft.attachments.push({ storage_path: path, name: f.name, type: f.type });
      }
      this.paintAtt();
    },

    async send() {
      const f = document.getElementById('mc-form');
      const d = UI.formData(f);
      const to = MM().parseAddresses(d.to);
      if (!to.length) return UI.toast('Zadajte adresáta', 'err');
      const bad = [...to, ...MM().parseAddresses(d.cc), ...MM().parseAddresses(d.bcc)].filter(a => !MM().emailOk(a.address));
      if (bad.length) return UI.toast(`Neplatná adresa: ${bad[0].address}`, 'err');
      const go = document.getElementById('mc-go'); if (go) { go.disabled = true; go.textContent = 'Odosielam…'; }
      try {
        await call('danubra-mail-send', { action: 'send', mailbox_id: d.mailbox_id, to, cc: MM().parseAddresses(d.cc), bcc: MM().parseAddresses(d.bcc),
          subject: d.subject, text: d.text, in_reply_to: this._draft.in_reply_to || null, references: this._draft.references || null,
          attachments: this._draft.attachments, links: this._draft.links || {} });
        UI.closeModal();
        UI.toast('E-mail odoslaný', 'ok');
        this.loaded = false;
        if (Danubra.route === 'mail') Danubra.renderRoute(); else if (window.Docs) Docs.fill(document);
      } catch (e) {
        if (go) { go.disabled = false; go.innerHTML = `${Icon('mail', 14)} Odoslať`; }
        UI.toast(e.message, 'err');
      }
    },

    async reply(id, all) {
      const m = await this.full(id);
      const d = MM().replyDraft(m, { mailbox: this.boxOf(m.mailbox_id), all });
      return this.compose({ ...d, links: { worker_id: m.worker_id, partner_id: m.partner_id, lead_id: m.lead_id } });
    },
    async forward(id) {
      const m = await this.full(id);
      return this.compose(MM().forwardDraft(m, { mailbox: this.boxOf(m.mailbox_id) }));
    },

    // ── E-maily pri človeku a firme ───────────────────────────────────────
    slot(type, id, email) {
      return `<div class="mail-slot" data-type="${type}" data-id="${UI.esc(id)}" data-email="${UI.esc(email || '')}"><div class="js-empty">Načítavam e-maily…</div></div>`;
    },
    async fill(root) {
      const slots = [...(root || document).querySelectorAll('.mail-slot')];
      if (!slots.length) return;
      if (!this.loaded) { try { await this.load(); } catch (e) { return; } }
      const col = { worker: 'worker_id', partner: 'partner_id', lead: 'lead_id' };
      for (const s of slots) {
        const k = col[s.dataset.type];
        const list = this.messages.filter(m => m[k] === s.dataset.id).slice(0, 30);
        const napisat = this.boxes.length && s.dataset.email
          ? `<button class="btn btn-outline btn-sm" data-to="${UI.esc(s.dataset.email)}" data-id="${UI.esc(s.dataset.id)}" onclick="Mail.compose({to:this.dataset.to,links:{${k}:this.dataset.id}})">${Icon('mail', 14)} Napísať e-mail</button>` : '';
        s.innerHTML = (list.length ? list.map(m => `<button class="mail-row${m.seen ? '' : ' unread'}" onclick="Danubra.go('mail');setTimeout(()=>{Mail.box='${m.mailbox_id}';Mail.folder='${m.direction}';Mail.open('${m.id}')},300)">
          <span class="mail-row-top"><b>${Icon(m.direction === 'out' ? 'upload' : 'download', 13)} ${UI.esc(m.subject || '(bez predmetu)')}</b><time>${UI.esc(this.shortDate(m.sent_at))}</time></span>
          <span class="mail-row-snip">${UI.esc(m.snippet || '')}</span></button>`).join('')
          : `<div class="js-empty">${this.boxes.length ? 'Zatiaľ žiadne e-maily.' : 'E-maily sa tu ukážu, keď bude pridaná schránka.'}</div>`)
          + (napisat ? `<div class="js-acts">${napisat}</div>` : '');
      }
    },
  };

  // ── Nastavenia → Schránky ────────────────────────────────────────────────
  const Mbx = {
    rows: [], members: [], access: [], loaded: false,
    async load() {
      const [b, m, a] = await Promise.all([
        DB.list('mailboxes', { select: 'id,name,email,display_name,imap_host,imap_port,imap_secure,smtp_host,smtp_port,smtp_secure,username,signature,signature_card,sent_folder,last_sync_at,sync_error,active', limit: 100 }),
        DB.list('members', { select: 'id,user_id,email,full_name,role,active', limit: 200 }),
        DB.list('mailbox_access', { limit: 2000 }),
      ]);
      this.rows = b.data || []; this.members = (m.data || []).filter(x => x.active !== false && x.user_id); this.access = a.data || [];
      this.loaded = true;
    },
    whoHas(id) {
      const u = new Set(this.access.filter(a => a.mailbox_id === id && a.active).map(a => a.user_id));
      return this.members.filter(m => u.has(m.user_id) || m.role === 'admin');
    },
    async view(el) {
      const admin = Danubra.isAdmin();
      Danubra.setActions(admin ? `<button class="btn btn-primary btn-sm" onclick="Mbx.form()">${Icon('plus', 14)} Pridať schránku</button>` : '');
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      el.innerHTML = Danubra.header(Danubra.labelOf('mailboxes'), 'Firemné e-mailové schránky v Správach — kto ich vidí a aký majú podpis')
        + (this.rows.length ? `<div class="cards">${this.rows.map(b => `<div class="acc-card card">
          <div class="acc-card-head"><div style="min-width:0;"><div class="acc-name">${UI.esc(b.name)}</div>
            <div class="acc-loc">${UI.esc(b.email)}</div></div>${b.active === false ? UI.badge('vypnutá', 'gray') : b.sync_error ? UI.badge('chyba', 'red') : UI.badge('beží', 'green')}</div>
          ${b.sync_error ? `<div class="warnbox">${UI.esc(b.sync_error)}</div>` : ''}
          <div class="acc-meta"><span>${Icon('repeat', 14)} ${b.last_sync_at ? UI.esc(DanubraMail.fmtDate(b.last_sync_at)) : 'ešte nestiahnutá'}</span>
            <span>${Icon('workers', 14)} ${this.whoHas(b.id).map(m => UI.esc(m.full_name || m.email)).join(', ') || 'len admin'}</span></div>
          ${b.signature ? `<pre class="cf-preview" style="max-height:90px;">${UI.esc(b.signature)}</pre>` : ''}
          ${admin ? `<div class="js-acts"><button class="btn btn-outline btn-sm" onclick="Mbx.form('${b.id}')">${Icon('edit', 14)} Upraviť</button>
            <button class="btn btn-ghost btn-sm" onclick="Mbx.test('${b.id}')">Otestovať</button>
            ${b.active !== false ? `<button class="btn btn-ghost btn-sm" onclick="Mbx.off('${b.id}')">Vypnúť</button>` : ''}</div>` : ''}
        </div>`).join('')}</div>`
          : UI.empty('mail', 'Zatiaľ žiadna schránka', 'Pridajte firemnú schránku — e-mail, heslo a podpis. Servery Websupportu a Forpsi sa doplnia samy.',
            admin ? `<button class="btn btn-primary" onclick="Mbx.form()">${Icon('plus')} Pridať schránku</button>` : ''))
        + (admin ? await this.webCard() : '');
    },

    /**
     * Automatické e-maily z webov punds.sk / punds.eu: potvrdenie uchádzačovi
     * alebo firme a upozornenie nám. Posiela sa zo zvolenej schránky.
     */
    async webCard() {
      const row = await Danubra.loadCfg();
      const w = row.web || {};
      const opts = [['', '— neposielať —'], ...this.rows.filter(b => b.active !== false).map(b => [b.id, `${b.name} <${b.email}>`])];
      return `<div class="card card-pad" style="margin-top:16px;">
        <div class="card-head"><div class="card-title">E-maily z webov punds.sk a punds.eu${Help.btn('card.mailboxes.web', { size: 13 })}</div></div>
        <p class="card-note" style="margin:0 0 10px;">Keď je zvolená schránka, príde Vám upozornenie na každú prihlášku a dopyt — vždy.
          Potvrdenie odosielateľovi v jeho jazyku sa posiela, len keď je zapnuté. Prihláška sa do appky uloží vždy.</p>
        <form id="web-mail" onsubmit="event.preventDefault();Mbx.saveWeb()">
          ${UI.field('confirm', 'Posielať potvrdenie odosielateľovi (uchádzačovi alebo firme)', { type: 'checkbox', value: !!w.confirm })}
          <div class="form-grid">
            ${UI.field('mailbox_sk', 'punds.sk — posielať zo schránky', { value: w.mailbox_sk || '', options: opts })}
            ${UI.field('notify_sk', 'punds.sk — upozornenie na adresu', { type: 'email', value: w.notify_sk || '', placeholder: 'info@punds.sk' })}
            ${UI.field('mailbox_eu', 'punds.eu — posielať zo schránky', { value: w.mailbox_eu || '', options: opts })}
            ${UI.field('notify_eu', 'punds.eu — upozornenie na adresu', { type: 'email', value: w.notify_eu || '', placeholder: 'info@punds.eu' })}
            ${UI.field('contact_eu', 'punds.eu — meno kontaktnej osoby v potvrdení', { value: w.contact_eu || '', placeholder: 'napr. Štefan Varga' })}
            ${UI.field('phone_eu', 'punds.eu — telefón v potvrdení', { value: w.phone_eu || '', placeholder: '+421 910 523 958' })}
          </div>
          <div class="modal-actions"><button type="submit" class="btn btn-primary">Uložiť</button></div>
        </form></div>`;
    },

    async saveWeb() {
      const d = UI.formData(document.getElementById('web-mail'));
      if (d.confirm && !d.mailbox_sk && !d.mailbox_eu) return UI.toast('Vyberte schránku, z ktorej sa má posielať', 'err');
      const row = await Danubra.loadCfg();
      const web = { ...(row.web || {}), confirm: !!d.confirm, mailbox_sk: d.mailbox_sk || null, mailbox_eu: d.mailbox_eu || null,
        notify_sk: d.notify_sk || null, notify_eu: d.notify_eu || null, contact_eu: d.contact_eu || null, phone_eu: d.phone_eu || null };
      const { error } = row.id ? await DB.update('settings', row.id, { web }) : { error: { message: 'Nastavenia sa nenačítali' } };
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      await Danubra.loadCfg(true);
      UI.toast('Uložené — platí do minúty', 'ok');
    },

    form(id) {
      const b = id ? this.rows.find(x => x.id === id) || {} : { imap_port: 993, smtp_port: 465 };
      const P = DanubraMail.PRESETS;
      const preset = Object.keys(P).find(k => P[k].imap_host && P[k].imap_host === b.imap_host) || (id ? 'custom' : 'websupport');
      const maPristup = new Set(this.access.filter(a => a.mailbox_id === id && a.active).map(a => a.user_id));
      UI.modal(id ? `Upraviť schránku ${b.email}` : 'Pridať schránku', `<form id="mb-form" onsubmit="event.preventDefault();Mbx.save(${id ? `'${id}'` : ''})">
        <div class="form-grid">
          ${UI.field('preset', 'Hosting', { value: preset, options: Object.entries(P).map(([k, v]) => [k, v.label]) })}
          ${UI.field('email', 'E-mailová adresa', { value: b.email || '', required: true, placeholder: 'info@punds.eu' })}
          ${UI.field('name', 'Názov v appke', { value: b.name || '', placeholder: 'napr. Info, Fakturácia' })}
          ${UI.field('display_name', 'Meno odosielateľa', { value: b.display_name || '', placeholder: 'Partner und Service s. r. o.' })}
          ${UI.field('password', id ? 'Heslo (prázdne = nemeniť)' : 'Heslo schránky', { type: 'password', required: !id })}
          ${UI.field('username', 'Prihlasovacie meno (ak nie je e-mail)', { value: b.username && b.username !== b.email ? b.username : '' })}
        </div>
        <details class="more-block" ${preset === 'custom' ? 'open' : ''}><summary>Servery (pri Websupporte a Forpsi netreba meniť)</summary>
          <div class="form-grid">
            ${UI.field('imap_host', 'IMAP server', { value: b.imap_host || '' })}
            ${UI.field('imap_port', 'IMAP port', { type: 'number', value: b.imap_port || 993 })}
            ${UI.field('smtp_host', 'SMTP server', { value: b.smtp_host || '' })}
            ${UI.field('smtp_port', 'SMTP port', { type: 'number', value: b.smtp_port || 465 })}
          </div></details>
        <div class="form-section">Podpis</div>
        ${(() => { const c = b.signature_card || {}; return `
        <div class="form-grid">
          <div class="fld-full">${UI.field('sig_enabled', 'Grafický podpis punds (logo, meno, kontakty)', { type: 'checkbox', value: !!c.enabled })}</div>
          ${UI.field('sig_name', 'Meno', { value: c.name || '', placeholder: 'Štefan Varga' })}
          ${UI.field('sig_role', 'Funkcia', { value: c.role || '', placeholder: 'Koordinátor projektov' })}
          ${UI.field('sig_phone', 'Telefón', { value: c.phone || '', placeholder: '+421 910 523 858' })}
          ${UI.field('sig_lang', 'Jazyk podpisu', { value: c.lang || 'sk', options: [['sk', 'Slovensky (punds.sk)'], ['de', 'Nemecky (punds.eu)']] })}
          ${UI.field('sig_cta_label', 'Odkaz pod podpisom (text)', { value: c.cta_label || '', placeholder: 'prázdne = podľa jazyka' })}
          ${UI.field('sig_cta_url', 'Odkaz pod podpisom (adresa)', { value: c.cta_url || '', placeholder: 'https://punds.sk' })}
          <div class="sig-preview fld-full" id="sig-preview"></div>
          <div class="fld-full">${UI.field('signature', 'Vlastný textový podpis (namiesto grafického)', { type: 'textarea', rows: 4, value: b.signature || '',
            placeholder: 'Prázdne = z grafického podpisu. Text sa použije v textovej verzii e-mailu.' })}</div>
        </div>`; })()}
        <div class="form-section">Kto vidí túto schránku</div>
        <div class="chk-grid">${this.members.filter(m => m.role !== 'admin').map(m => `<label class="chk"><input type="checkbox" name="acc" value="${m.user_id}" ${maPristup.has(m.user_id) ? 'checked' : ''}>
          <span>${UI.esc(m.full_name || m.email)}</span></label>`).join('') || '<span class="js-empty">Iní používatelia zatiaľ nie sú — administrátor vidí všetky schránky.</span>'}</div>
        <p class="card-note">Heslo sa uloží zašifrované kľúčom, ktorý je len na serveri. Do prehliadača sa už nikdy nevráti.</p>
        <div id="mb-test"></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
          <button type="button" class="btn btn-outline" onclick="Mbx.test(${id ? `'${id}'` : 'null'}, true)">Otestovať pripojenie</button>
          <button type="submit" class="btn btn-primary">Uložiť</button>
        </div></form>`, { wide: true });
      const f = document.getElementById('mb-form');
      const apply = () => {
        const p = P[f.preset.value];
        if (!p || !p.imap_host) return;
        f.imap_host.value = p.imap_host; f.imap_port.value = p.imap_port; f.smtp_host.value = p.smtp_host; f.smtp_port.value = p.smtp_port;
      };
      f.preset.addEventListener('change', apply);
      if (!id) apply();
      // Náhľad grafického podpisu — mení sa pri písaní.
      const nahlad = () => {
        const d = UI.formData(f);
        const box = document.getElementById('sig-preview');
        if (!box) return;
        const mb = { email: d.email || 'info@punds.eu', signature_card: this.cardOf(d) };
        box.innerHTML = mb.signature_card.enabled && mb.signature_card.name
          ? `<div class="sig-frame">${MM().sigHtml(mb, `${location.origin}/web/public`)}</div>` : '';
      };
      f.addEventListener('input', nahlad); f.addEventListener('change', nahlad); nahlad();
    },

    cardOf(d) {
      return { enabled: !!d.sig_enabled, name: d.sig_name || '', role: d.sig_role || '', phone: d.sig_phone || '',
        lang: d.sig_lang === 'de' ? 'de' : 'sk', cta_label: d.sig_cta_label || '', cta_url: d.sig_cta_url || '' };
    },

    payload(id) {
      const f = document.getElementById('mb-form');
      const d = UI.formData(f);
      return {
        mailbox: { id: id || undefined, name: d.name || d.email, email: d.email, display_name: d.display_name || null,
          username: d.username || d.email, imap_host: d.imap_host, imap_port: Number(d.imap_port) || 993, imap_secure: true,
          smtp_host: d.smtp_host, smtp_port: Number(d.smtp_port) || 465, smtp_secure: true, signature: d.signature || null,
          signature_card: this.cardOf(d) },
        password: d.password || undefined,
        access: [...f.querySelectorAll('input[name=acc]:checked')].map(i => i.value),
      };
    },

    async save(id) {
      try {
        await call('danubra-mail-account', { action: 'save', ...this.payload(id) });
        UI.closeModal(); UI.toast('Schránka uložená — e-maily sa začnú sťahovať', 'ok');
        this.loaded = false; Mail.loaded = false;
        fetch('/.netlify/functions/danubra-mail-sync-background', { method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: '{}' }).catch(() => {});
        Danubra.renderRoute();
      } catch (e) { UI.toast(e.message, 'err'); }
    },

    async test(id, zFormulara) {
      const box = document.getElementById('mb-test');
      const body = zFormulara ? { action: 'test', ...this.payload(id) } : { action: 'test', mailbox: { id } };
      if (box) box.innerHTML = '<div class="nb-wait">Skúšam pripojenie…</div>';
      try {
        const r = await call('danubra-mail-account', body);
        const t = `Prijímanie (IMAP): ${r.imap.ok ? 'v poriadku' : `chyba — ${r.imap.error}`} · Odosielanie (SMTP): ${r.smtp.ok ? 'v poriadku' : `chyba — ${r.smtp.error}`}`;
        if (box) box.innerHTML = `<div class="${r.imap.ok && r.smtp.ok ? 'regimebox' : 'warnbox'}">${UI.esc(t)}</div>`;
        else UI.toast(t, r.imap.ok && r.smtp.ok ? 'ok' : 'err');
      } catch (e) {
        if (box) box.innerHTML = `<div class="warnbox">${UI.esc(e.message)}</div>`; else UI.toast(e.message, 'err');
      }
    },

    async off(id) {
      if (!await UI.confirm('Vypnúť schránku? E-maily v appke zostanú, nové sa prestanú sťahovať.')) return;
      try { await call('danubra-mail-account', { action: 'deactivate', id }); this.loaded = false; Mail.loaded = false; Danubra.renderRoute(); }
      catch (e) { UI.toast(e.message, 'err'); }
    },
  };

  window.Mail = Mail;
  window.Mbx = Mbx;
  Danubra.views.mail = function (el) { return Mail.view(el); };
  Danubra.views.mailboxes = function (el) { return Mbx.view(el); };
})();
