// ============================================================================
// DANUBRA — Správy
// ============================================================================
// Komunikácia je dnes v troch aplikáciách a v hlave. Toto ju dáva k záznamu,
// ktorého sa týka — k živnostníkovi, k zákazke, k faktúre.
//
// **Čo funguje hneď:** interná komunikácia s kolegami a zápis toho, čo sme
// poslali alebo čo prišlo odinakiaľ.
//
// **Čo čaká:** samotné odosielanie. Kým nie je kľúč poskytovateľa a adresa
// odosielateľa, správa sa uloží do frontu a **neodíde**. Appka to hovorí
// nahlas — povedať „odoslané", keď sa neodoslalo, je horšie, než sa o to
// ani nepokúsiť: človek na to spoľahne a nedovolá sa.
//
// Nič sa nemaže. Vlákno sa uzavrie, správa zostane — pri spore o to, čo bolo
// dohodnuté, je história jediné, čo rozhoduje.
// ============================================================================
(function () {
  const M = () => window.DanubraMsg;

  const CHANNELS = [
    ['internal', 'Interne'], ['email', 'E-mail'],
    ['sms', 'SMS'], ['whatsapp', 'WhatsApp'],
  ];
  const channelLabel = (k) => (CHANNELS.find(c => c[0] === k) || [, k])[1];

  const Msg = {
    threads: [], messages: [], templates: [], loaded: false,
    openId: null,
    filters: { q: '', channel: '', state: 'open' },

    async load() {
      const [t, m, tpl] = await Promise.all([
        DB.list('message_threads', { order: { column: 'last_at', ascending: false }, limit: 300 }),
        DB.list('messages', { order: { column: 'created_at', ascending: true }, limit: 2000 }),
        DB.list('message_templates', { order: { column: 'sort_order', ascending: true }, limit: 100 }),
      ]);
      this.threads = t.data || []; this.messages = m.data || [];
      this.templates = tpl.data || [];
      this.loaded = true;
      if (window.Cfg && !Cfg.loaded) { try { await Cfg.load(); } catch {} }
    },

    /** Nastavenie odosielania. Kým tam nie je, appka to hovorí nahlas. */
    sendCfg() {
      const s = (window.Cfg && Cfg.j('messaging')) || {};
      return { provider: s.provider || '', from: s.from || '' };
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    rows() {
      const f = this.filters;
      let list = M().threadList(this.threads, this.messages);
      if (f.state === 'open') list = list.filter(t => t.status !== 'done');
      if (f.state === 'done') list = list.filter(t => t.status === 'done');
      if (f.channel) list = list.filter(t => t.channel === f.channel);
      return Shell.filterRows(list, {
        q: f.q, fields: ['subject', 'party_name', 'to_email', 'preview'],
      });
    },

    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      if (this.openId) return this.thread(el, this.openId);

      const rows = this.rows();
      const q = M().queueCounts(this.messages);
      const cfg = M().canSend(this.sendCfg());

      Danubra.setActions(
        `<button class="btn btn-primary btn-sm" onclick="Msg.compose()">${Icon('plus')} Nová správa</button>`);

      const card = (t) => `
        <div class="card card-pad list-card" onclick="Msg.open('${t.id}')">
          <div class="card-head">
            <div class="card-title">${UI.esc(t.subject || t.party_name || 'Bez predmetu')}</div>
            ${t.failed ? UI.badge('neodoslané', 'red')
              : t.waiting ? UI.badge('čaká', 'amber')
              : UI.badge(channelLabel(t.channel), t.channel === 'internal' ? 'gray' : 'blue')}
          </div>
          <div class="meta-row">
            ${t.party_name ? `<span>${Icon('user', 14)} ${UI.esc(t.party_name)}</span>` : ''}
            ${t.to_email ? `<span>${Icon('mail', 14)} ${UI.esc(t.to_email)}</span>` : ''}
            <span>${Icon('note', 14)} ${t.count} ${
              Shell.plural(t.count, 'správa', 'správy', 'správ')}</span>
            ${t.last_at ? `<span>${Icon('clock', 14)} ${UI.date(t.last_at)}</span>` : ''}
          </div>
          ${t.preview ? `<p class="card-note">${UI.esc(t.preview)}</p>` : ''}
          ${Danubra.canOpen(t.entity_type, t.entity_id)
            ? `<span class="link-row" style="margin-top:8px;" onclick="event.stopPropagation()">
                 ${Danubra.link(t.entity_type, t.entity_id, t.party_name || '')}</span>` : ''}
        </div>`;

      el.innerHTML = Danubra.header(Danubra.labelOf('messages'),
        'Komunikácia pri zázname, ktorého sa týka')
        + (!cfg.ok ? `<div class="warnbox" style="margin-bottom:14px;">
            ${Icon('alert', 14)} <strong>Odosielanie ešte nie je zapnuté.</strong>
            ${UI.esc(cfg.reason)} Interné poznámky a zápis toho, čo už odišlo inou
            cestou, fungujú bez toho.</div>` : '')
        + (q.queued || q.failed ? `<div class="regimebox" style="margin-bottom:14px;">
            ${q.queued ? `${q.queued} ${Shell.plural(q.queued, 'správa čaká', 'správy čakajú', 'správ čaká')} vo fronte. ` : ''}
            ${q.failed ? `${q.failed} sa nepodarilo odoslať. ` : ''}
            Nič z toho neodišlo.</div>` : '')
        + Shell.list({
          rows, total: this.threads.length, render: card, layout: 'cards',
          emptyIcon: 'mail', emptyTitle: 'Zatiaľ žiadna komunikácia',
          emptySub: 'Začni poznámkou pri zázname alebo novou správou.',
          filter: {
            search: { value: this.filters.q, placeholder: 'Hľadať predmet, meno, text…',
              oninput: 'Msg.setF("q", this.value)' },
            selects: [
              { value: this.filters.state, label: 'Stav',
                onchange: 'Msg.setF("state", this.value)',
                options: [['open', 'Otvorené'], ['done', 'Uzavreté'], ['', 'Všetky']] },
              { value: this.filters.channel, label: 'Kanál',
                onchange: 'Msg.setF("channel", this.value)',
                options: [['', 'Všetky kanály'], ...CHANNELS] },
            ],
          },
        });
    },

    open(id) { this.openId = id; Danubra.renderRoute(); },
    close() { this.openId = null; Danubra.renderRoute(); },

    /** Jedno vlákno: celá história a pole na odpoveď. */
    thread(el, id) {
      const t = M().threadList(this.threads, this.messages).find(x => x.id === id);
      if (!t) { this.openId = null; return UI.toast('Vlákno sa nenašlo', 'err'); }
      const cfg = M().canSend(this.sendCfg());

      Danubra.setActions(`
        <button class="btn btn-ghost btn-sm" onclick="Msg.close()">${Icon('back', 15)} Späť</button>
        <button class="btn btn-outline btn-sm" onclick="Msg.toggleDone('${t.id}')">
          ${Icon(t.status === 'done' ? 'repeat' : 'check', 14)}
          ${t.status === 'done' ? 'Otvoriť znova' : 'Uzavrieť'}</button>`);

      const msg = (m) => `
        <div class="msg msg-${m.direction}">
          <div class="msg-head">
            <strong>${UI.esc(m.direction === 'in' ? (t.party_name || 'Protistrana')
              : (m.author_name || 'My'))}</strong>
            <span>${UI.esc(channelLabel(m.channel))}</span>
            ${UI.badge(M().statusLabel(m.status), M().statusKind(m.status))}
            <em>${m.created_at ? UI.date(m.created_at) : ''}</em>
          </div>
          ${m.subject ? `<div class="msg-subject">${UI.esc(m.subject)}</div>` : ''}
          <div class="msg-body">${UI.esc(m.body)}</div>
          ${m.error ? `<div class="msg-error">${Icon('alert', 13)} ${UI.esc(m.error)}</div>` : ''}
        </div>`;

      el.innerHTML = Danubra.header(t.subject || t.party_name || 'Vlákno',
        [channelLabel(t.channel), t.to_email, t.party_name].filter(Boolean).join(' · '),
        '', [t.subject || 'Vlákno'])
        + `<div class="msg-thread">
             ${t.messages.length ? t.messages.map(msg).join('')
               : '<p class="card-note">Vo vlákne zatiaľ nič nie je.</p>'}
           </div>
           ${Danubra.canOpen(t.entity_type, t.entity_id)
             ? `<div class="form-section">Čoho sa to týka</div>
                <span class="link-row">${Danubra.link(t.entity_type, t.entity_id,
                  t.party_name || '')}</span>` : ''}
           <div class="form-section">Odpovedať</div>
           ${!cfg.ok && t.channel !== 'internal' ? `<div class="regimebox" style="margin:0 0 10px;">
             ${UI.esc(cfg.reason)}</div>` : ''}
           <textarea id="msg-reply" class="guide-textarea" rows="4"
             placeholder="${t.channel === 'internal' ? 'Napíš kolegom…' : 'Napíš odpoveď…'}"></textarea>
           <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
             <button class="btn btn-outline btn-sm" onclick="Msg.reply('${t.id}','note')">
               ${Icon('note', 14)} Uložiť ako poznámku</button>
             ${t.channel !== 'internal' ? `<button class="btn btn-primary btn-sm"
               onclick="Msg.reply('${t.id}','queued')">
               ${Icon('mail', 14)} ${cfg.ok ? 'Odoslať' : 'Zaradiť na odoslanie'}</button>` : ''}
           </div>`;
    },

    async reply(threadId, how) {
      const box = document.getElementById('msg-reply');
      const body = box ? box.value.trim() : '';
      if (!body) return UI.toast('Napíš najprv text', 'err');
      const t = this.threads.find(x => x.id === threadId);
      const channel = how === 'note' ? 'internal' : (t ? t.channel : 'email');

      if (how !== 'note') {
        const v = M().validate({ channel, to_email: t && t.to_email, subject: t && t.subject, body });
        if (!v.ok) return UI.toast(v.problems[0], 'err');
      }
      const cfg = M().canSend(this.sendCfg());
      const status = how === 'note' ? 'note' : 'queued';

      const { data, error } = await DB.insert('messages', {
        thread_id: threadId,
        direction: how === 'note' ? 'note' : 'out',
        channel, body,
        subject: how === 'note' ? null : (t && t.subject) || null,
        to_email: how === 'note' ? null : (t && t.to_email) || null,
        status,
        queued_at: status === 'queued' ? new Date().toISOString() : null,
        author_name: Danubra.me ? (Danubra.me.full_name || Danubra.me.email) : null,
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      this.messages.push(data);
      if (box) box.value = '';
      UI.toast(how === 'note' ? 'Poznámka uložená'
        : (cfg.ok ? 'Zaradené na odoslanie' : 'Uložené do frontu — zatiaľ neodíde'), 'ok');
      Danubra.renderRoute();
    },

    async toggleDone(id) {
      const t = this.threads.find(x => x.id === id);
      if (!t) return;
      const status = t.status === 'done' ? 'open' : 'done';
      const { error } = await DB.update('message_threads', id, { status });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      t.status = status;
      UI.toast(status === 'done' ? 'Vlákno uzavreté' : 'Vlákno otvorené', 'ok');
      Danubra.renderRoute();
    },

    /**
     * Nová správa. Šablóna sa doplní z toho, čo o zázname vieme, a nevyplnené
     * miesto zostane v texte označené — prázdne miesto by sa prehliadlo
     * a odišla by veta s dierou.
     */
    compose(preset = {}) {
      const cfg = M().canSend(this.sendCfg());
      const tpl = M().templatesFor(this.templates,
        { audience: preset.party_type, channel: preset.channel || 'email' });

      UI.modal('Nová správa', `
        <form id="msg-form" onsubmit="event.preventDefault();Msg.saveNew()">
          ${!cfg.ok ? `<div class="warnbox" style="margin:0 0 12px;">
            ${Icon('alert', 14)} ${UI.esc(cfg.reason)}</div>` : ''}
          <div class="form-grid">
            ${UI.field('channel', 'Kanál', { value: preset.channel || 'email',
              options: CHANNELS })}
            ${UI.field('party_name', 'Komu', { value: preset.party_name })}
            ${UI.field('to_email', 'E-mail', { type: 'email', value: preset.to_email })}
            ${UI.field('subject', 'Predmet', { value: preset.subject })}
          </div>
          ${tpl.length ? `<div class="form-section">Šablóna</div>
            <div class="tpl-row">
              ${tpl.map(x => `<button type="button" class="tpl-chip"
                onclick="Msg.useTemplate('${x.key}')">
                ${UI.esc(x.title)}<em>${x.language === 'de' ? 'DE' : 'SK'}</em></button>`).join('')}
            </div>` : ''}
          ${UI.field('body', 'Text', { type: 'textarea', rows: 10, value: preset.body })}
          <p class="card-note" id="msg-missing"></p>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="button" class="btn btn-outline" onclick="Msg.saveNew('draft')">
              Uložiť ako koncept</button>
            <button type="submit" class="btn btn-primary">
              ${cfg.ok ? 'Odoslať' : 'Zaradiť na odoslanie'}</button>
          </div>
        </form>`, { wide: true });
      this._preset = preset;
    },

    /** Vloží šablónu a povie, čo v nej zostalo nevyplnené. */
    useTemplate(key) {
      const t = this.templates.find(x => x.key === key);
      if (!t) return;
      const p = M().preview(t, this._ctx || {});
      const form = document.getElementById('msg-form');
      if (!form) return;
      if (p.subject) form.querySelector('[name=subject]').value = p.subject;
      form.querySelector('[name=body]').value = p.body;
      const note = document.getElementById('msg-missing');
      if (note) {
        note.textContent = p.missing.length
          ? `Doplň ešte: ${p.missing.map(k => `{{${k}}}`).join(', ')} — inak by odišla veta s dierou.`
          : '';
      }
    },

    async saveNew(as) {
      const d = UI.formData(document.getElementById('msg-form'));
      const status = as === 'draft' ? 'draft' : (d.channel === 'internal' ? 'note' : 'queued');
      if (status !== 'draft' && status !== 'note') {
        const v = M().validate(d);
        if (!v.ok) return UI.toast(v.problems[0], 'err');
      }
      if (!String(d.body || '').trim()) return UI.toast('Správa je prázdna', 'err');

      const preset = this._preset || {};
      const { data: thread, error } = await DB.insert('message_threads', {
        subject: d.subject || null,
        channel: d.channel,
        party_name: d.party_name || null,
        party_type: preset.party_type || null,
        party_id: preset.party_id || null,
        entity_type: preset.entity_type || null,
        entity_id: preset.entity_id || null,
        to_email: d.to_email || null,
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');

      const { error: e2 } = await DB.insert('messages', {
        thread_id: thread.id,
        direction: d.channel === 'internal' ? 'note' : 'out',
        channel: d.channel,
        subject: d.subject || null,
        body: d.body,
        to_email: d.to_email || null,
        status,
        queued_at: status === 'queued' ? new Date().toISOString() : null,
        author_name: Danubra.me ? (Danubra.me.full_name || Danubra.me.email) : null,
      });
      if (e2) return UI.toast('Chyba: ' + e2.message, 'err');

      UI.closeModal();
      const cfg = M().canSend(this.sendCfg());
      UI.toast(status === 'draft' ? 'Uložené ako koncept'
        : status === 'note' ? 'Poznámka uložená'
        : (cfg.ok ? 'Zaradené na odoslanie' : 'Uložené do frontu — zatiaľ neodíde'), 'ok');
      this.loaded = false;
      Danubra.renderRoute();
    },
  };

  window.Msg = Msg;
  Danubra.views.messages = function (el) { return Msg.view(el); };
})();
