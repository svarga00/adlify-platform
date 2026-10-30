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

      const q = M().queueCounts(this.messages);
      const cfg = M().canSend(this.sendCfg());

      Danubra.setActions(
        `<button class="btn btn-primary btn-sm" onclick="Msg.compose()">${Icon('plus')} Nová správa</button>`);

      el.innerHTML = Danubra.header(Danubra.labelOf('messages'),
        `Komunikácia pri zázname, ktorého sa týka${UI.tip('Vlákno = jedna téma: všetky správy a poznámky k nej pod sebou. Nič sa tu nemaže ani neprepisuje — dá sa len pridať ďalšia správa, takže vždy vidíte, čo bolo dohodnuté.')}`)
        + (!cfg.ok ? `<div class="warnbox" style="margin-bottom:14px;">
            ${Icon('alert', 14)} <span><strong>Odosielanie ešte nie je zapnuté.</strong>
            ${UI.esc(cfg.reason)} Interné poznámky a zápis toho, čo už odišlo inou
            cestou, fungujú bez toho.</span></div>` : '')
        + (q.queued || q.failed ? `<div class="regimebox" style="margin-bottom:14px;">
            ${q.queued ? `${q.queued} ${Shell.plural(q.queued, 'správa čaká', 'správy čakajú', 'správ čaká')} vo fronte. ` : ''}
            ${q.failed ? `${q.failed} sa nepodarilo odoslať. ` : ''}
            Nič z toho neodišlo.${UI.tip('Front = správy pripravené na odoslanie. Odídu až keď bude v Nastaveniach zapnuté odosielanie (poskytovateľ a adresa odosielateľa). Dovtedy adresát nič nedostal.')}</div>` : '')
        // Zoznam je spoločný komponent (`DataList`): dovtedy tu boli karty
        // s hľadaním a dvoma výbermi (stav, kanál).
        + DataList.html(this.listConfig(M().threadList(this.threads, this.messages)));
    },

    /** Konfigurácia zoznamu vlákien pre `DataList`. */
    listConfig(rows) {
      const lastOf = (t) => t.last_at || (t.last && t.last.created_at) || null;
      const shortDate = (d) => {
        const x = new Date(d);
        if (!d || isNaN(x)) return '';
        return `${x.getDate()}. ${x.getMonth() + 1}. ${x.getFullYear()} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
      };
      const flag = (t) => (t.failed ? UI.badge('neodoslané', 'red') : t.waiting ? UI.badge('čaká', 'amber') : '');
      return {
        id: 'spravy', storageKey: 'spravy', label: 'Interné poznámky a správy',
        noun: ['vlákno', 'vlákna', 'vlákien'],
        rows,
        rowClick: (t) => Msg.open(t.id),
        rowClass: (t) => (t.failed ? 'is-hot' : t.waiting ? 'is-warn' : t.status === 'done' ? 'is-muted' : ''),
        rowLabel: (t) => `Vlákno ${t.subject || t.party_name || 'bez predmetu'}`,
        rowActions: [{ ico: 'chevron', label: 'Otvoriť vlákno', run: (t) => Msg.open(t.id) }],
        columns: [
          { key: 'vlakno', label: 'Vlákno', width: 'minmax(220px, 2.4fr)', mobile: 'title',
            render: (t) => `<span class="dl-title"><b>${UI.esc(t.subject || t.party_name || 'Bez predmetu')}</b>${
              t.preview ? `<small title="${UI.esc(t.preview)}">${UI.esc(t.preview)}</small>` : ''}</span>`,
            sortValue: (t) => t.subject || t.party_name || '', sortLabel: 'Predmet', csv: (t) => t.subject || '' },
          { key: 'komu', label: 'S kým', width: 'minmax(150px, 1.3fr)', mobileLabel: '',
            render: (t) => (t.party_name || t.to_email || t.to_phone ? `<span class="dl-two"><b>${UI.esc(t.party_name || '—')}</b>${
              t.to_email || t.to_phone ? `<small>${UI.esc(t.to_email || t.to_phone)}</small>` : ''}</span>` : ''),
            sortValue: (t) => t.party_name || null, csv: (t) => [t.party_name, t.to_email, t.to_phone].filter(Boolean).join(' · ') },
          { key: 'kanal', label: 'Kanál', width: '104px', mobile: 'badge',
            render: (t) => UI.badge(channelLabel(t.channel), t.channel === 'internal' ? 'gray' : 'blue'),
            sortValue: (t) => channelLabel(t.channel), csv: (t) => channelLabel(t.channel) },
          { key: 'pocet', label: 'Správ', width: '64px', align: 'right', mobileLabel: 'správ',
            render: (t) => `<span class="dl-num">${t.count}</span>`, sortValue: (t) => t.count, sortDir: -1 },
          { key: 'zaznam', label: 'Týka sa', width: 'minmax(130px, 1fr)', hideBelow: 1100, hideOnMobile: true,
            tip: 'Záznam v appke, ku ktorému vlákno patrí — napr. živnostník, zákazka alebo faktúra. Kliknutím ho otvoríte.',
            render: (t) => (Danubra.canOpen(t.entity_type, t.entity_id) ? Danubra.link(t.entity_type, t.entity_id, t.party_name || '') : ''),
            csv: false },
          { key: 'posledna', label: 'Posledná', width: '128px', mobileLabel: '',
            render: (t) => (lastOf(t) ? `<span class="dl-num">${UI.esc(shortDate(lastOf(t)))}</span>` : ''),
            sortValue: lastOf, sortDir: -1, csv: (t) => lastOf(t) || '' },
          { key: 'stav', label: 'Stav', width: '112px', mobileLabel: '',
            tip: 'Otvorené = ešte riešite, uzavreté = vybavené. Čaká = správa je vo fronte a ešte neodišla. Neodoslané = odoslanie zlyhalo.',
            render: (t) => flag(t) || (t.status === 'done' ? '<span class="dl-note is-mute">uzavreté</span>' : '<span class="dl-note is-green">otvorené</span>'),
            sortValue: (t) => (t.failed ? 0 : t.waiting ? 1 : t.status === 'done' ? 3 : 2),
            csv: (t) => [t.status === 'done' ? 'uzavreté' : 'otvorené', t.failed ? 'neodoslané' : t.waiting ? 'čaká' : ''].filter(Boolean).join(', ') },
        ],
        sort: { key: 'posledna', dir: -1 },
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať predmet, meno, text…', label: 'Hľadať predmet, meno, e-mail alebo text',
            fields: ['subject', 'party_name', 'to_email', 'to_phone', 'preview'] },
          { key: 'stav', type: 'select', label: 'Stav', value: (t) => (t.status === 'done' ? 'done' : 'open'), default: 'open', allLabel: 'Všetky',
            options: [['open', 'Otvorené'], ['done', 'Uzavreté']],
            hint: 'Otvorené = vlákna, ktoré ešte riešite. Uzavreté = vybavené; nič sa z nich nezmazalo a dajú sa znova otvoriť.' },
          { key: 'kanal', type: 'multi', label: 'Kanál', value: 'channel', options: CHANNELS, sortOptions: false, allLabel: 'Všetky kanály',
            hint: 'Ako komunikácia prebieha: interne, e-mail, SMS, WhatsApp.' },
          { key: 'fronta', type: 'toggle', label: 'Čaká alebo neodišlo', test: (t) => t.waiting || t.failed,
            hint: 'Vlákna so správou, ktorá čaká vo fronte na odoslanie, alebo sa ju nepodarilo odoslať. Nič z toho adresátovi neprišlo.' },
          { key: 'kedy', type: 'range-date', label: 'Posledná správa', field: lastOf, more: true },
          { key: 'zaznam', type: 'select', label: 'Týka sa', value: 'entity_type', allLabel: 'Čohokoľvek', emptyLabel: 'Ničoho', more: true,
            optionLabel: (v) => ({ worker: 'Živnostník', partner: 'Odberateľ', subcontract: 'Zákazka', invoice: 'Faktúra', candidate: 'Uchádzač',
              lead: 'Nová firma', opportunity: 'Dopyt', contract: 'Zmluva' }[v] || v) },
        ],
        empty: { ico: 'mail', title: 'Zatiaľ žiadna komunikácia', sub: 'Začnite poznámkou pri zázname alebo novou správou.',
          cta: `<button class="btn btn-primary" onclick="Msg.compose()">${Icon('plus')} Nová správa</button>` },
        export: { name: ['spravy'] },
      };
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
        <span style="display:inline-flex;align-items:center;"><button class="btn btn-outline btn-sm" onclick="Msg.toggleDone('${t.id}')">
          ${Icon(t.status === 'done' ? 'repeat' : 'check', 14)}
          ${t.status === 'done' ? 'Otvoriť znova' : 'Uzavrieť'}</button>${UI.tip(t.status === 'done'
            ? 'Vráti vlákno medzi otvorené. Nič sa nemení ani neposiela.'
            : 'Vlákno sa presunie medzi Uzavreté — správy v ňom ostanú a kedykoľvek ho otvoríte znova. Nikomu sa nič neposiela.')}</span>`);

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
        UI.esc([channelLabel(t.channel), t.to_email, t.party_name].filter(Boolean).join(' · '))
          + UI.tip('Správy sú v poradí, ako pribúdali. Štítok pri správe hovorí, čo sa s ňou stalo, napr. Poznámka = len pre nás, Čaká na odoslanie = ešte neodišla, Odoslané = odišla, Prišlo = prijatá správa.'),
        '', [t.subject || 'Vlákno'])
        + `<div class="msg-thread">
             ${t.messages.length ? t.messages.map(msg).join('')
               : '<p class="card-note">Vo vlákne zatiaľ nič nie je.</p>'}
           </div>
           ${Danubra.canOpen(t.entity_type, t.entity_id)
             ? `<div class="form-section">Čoho sa to týka${UI.tip('Záznam v appke, ku ktorému toto vlákno patrí — napr. živnostník, zákazka alebo faktúra. Kliknutím ho otvoríte.')}</div>
                <span class="link-row">${Danubra.link(t.entity_type, t.entity_id,
                  t.party_name || '')}</span>` : ''}
           <div class="form-section">Odpovedať</div>
           ${!cfg.ok && t.channel !== 'internal' ? `<div class="regimebox" style="margin:0 0 10px;">
             ${UI.esc(cfg.reason)}</div>` : ''}
           <textarea id="msg-reply" class="guide-textarea" rows="4"
             placeholder="${t.channel === 'internal' ? 'Napíšte kolegom…' : 'Napíšte odpoveď…'}"></textarea>
           <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
             <button class="btn btn-outline btn-sm" onclick="Msg.reply('${t.id}','note')">
               ${Icon('note', 14)} Uložiť ako poznámku</button>${UI.tip('Poznámku uvidia len kolegovia v appke, protistrane nikam neodíde. Po uložení sa už nedá upraviť ani zmazať.')}
             ${t.channel !== 'internal' ? `<button class="btn btn-primary btn-sm"
               onclick="Msg.reply('${t.id}','queued')">
               ${Icon('mail', 14)} ${cfg.ok ? 'Odoslať' : 'Zaradiť na odoslanie'}</button>` : ''}
           </div>`;
    },

    async reply(threadId, how) {
      const box = document.getElementById('msg-reply');
      const body = box ? box.value.trim() : '';
      if (!body) return UI.toast('Najprv napíšte text', 'err');
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
          ${!cfg.ok ? `<div class="warnbox">
            ${Icon('alert', 14)} ${UI.esc(cfg.reason)}</div>` : ''}
          <div class="form-grid">
            ${UI.field('channel', 'Kanál', { value: preset.channel || 'email',
              options: CHANNELS,
              tip: 'Interne = poznámka len pre kolegov, nikomu mimo firmy neodíde. E-mail, SMS, WhatsApp = správa pre človeka mimo firmy.' })}
            ${UI.field('party_name', 'Komu', { value: preset.party_name,
              tip: 'Meno človeka alebo firmy. Slúži na hľadanie v zozname správ, nikam sa neposiela.' })}
            ${UI.field('to_email', 'E-mail', { type: 'email', value: preset.to_email,
              tip: 'Adresa, kam správa odíde. Pri kanáli E-mail je povinná, spolu s predmetom.' })}
            ${UI.field('to_phone', 'Telefón', { type: 'tel', value: preset.to_phone, placeholder: '+421 …',
              tip: 'Číslo, kam odíde SMS alebo WhatsApp — s predvoľbou krajiny, napr. +421 alebo +49. Pri e-maile netreba.' })}
            ${UI.field('subject', 'Predmet', { value: preset.subject })}
          </div>
          ${tpl.length ? `<div class="form-section">Šablóna${UI.tip('Kliknutím vložíte hotový text (DE = po nemecky, SK = po slovensky). Prepíše, čo už je v poli Text. Čo appka nevie doplniť, ostane v {{zátvorkách}} a treba to dopísať.')}</div>
            <div class="tpl-row">
              ${tpl.map(x => `<button type="button" class="tpl-chip"
                onclick="Msg.useTemplate('${x.key}')">
                ${UI.esc(x.title)}<em>${x.language === 'de' ? 'DE' : 'SK'}</em></button>`).join('')}
            </div>` : ''}
          ${UI.field('body', 'Text', { type: 'textarea', rows: 10, value: preset.body })}
          <p class="card-note" id="msg-missing"></p>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <span style="display:inline-flex;align-items:center;"><button type="button" class="btn btn-outline" onclick="Msg.saveNew('draft')">
              Uložiť ako koncept</button>${UI.tip('Koncept sa uloží do Správ, ale nikam neodíde ani sa nezaradí do frontu.')}</span>
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
          ? `Doplňte ešte: ${p.missing.map(k => `{{${k}}}`).join(', ')} — inak by odišla veta s dierou.`
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
        to_phone: d.to_phone || null,
      });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');

      const { error: e2 } = await DB.insert('messages', {
        thread_id: thread.id,
        direction: d.channel === 'internal' ? 'note' : 'out',
        channel: d.channel,
        subject: d.subject || null,
        body: d.body,
        to_email: d.to_email || null,
        to_phone: d.to_phone || null,
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
