// ============================================================================
// DANUBRA — Marketing: oslovovanie firiem po jednom a čo sa s e-mailom stalo
// ============================================================================
// „…budeme ich po jednom oslovovať e-mailom a budeme evidovať komu čo išlo,
// kto sa oslovil, či reagoval, či to videl, otvoril atď."
//
//   Osloviť          okno pri firme: schránka, komu, predmet, text (šablóna
//                    alebo osobný návrh od AI po nemecky / anglicky), náhľad
//                    s pätičkou, upozornenia (bez e-mailu, odhlásená, limit)
//   Pripomenúť sa    krátka správa v tom istom vlákne (Re:, In-Reply-To)
//   časová os        v detaile firmy: každý e-mail a pod ním odoslané,
//                    otvorené, klik, odpoveď, nedoručené, odhlásené
//   zoznam firiem    stĺpec „Oslovenie" a filtre (DataList v leads.js)
//   Oslovovanie      obrazovka v Marketingu: dnes na rade, čísla za 7/30 dní,
//                    šablóny a nastavenia (sledovanie, denný limit…)
//
// Pravidlá sú v lib/marketing/outreach.js (testy). Posiela, sleduje a páruje
// odpovede server (danubra-outreach-send, danubra-track, synchronizácia
// pošty) — heslá schránok ani kľúč k AI nikdy nie sú v prehliadači.
// ============================================================================
(function () {
  const OO = () => window.DanubraOutreach;
  const MM = () => window.DanubraMail;
  const COLS = 'id,lead_id,partner_id,mailbox_id,mail_message_id,step,lang,to_email,subject,status,error,sent_at,sent_by,'
    + 'message_id,opened_at,open_count,last_opened_at,auto_opened_at,auto_open_count,clicked_at,click_count,last_clicked_at,'
    + 'auto_click_count,replied_at,reply_message_id,bounced_at,unsubscribed_at,next_followup_at,created_at,archived_at';

  const LEGAL = 'V Nemecku je nevyžiadaný obchodný e-mail rizikový (§ 7 UWG): bez súhlasu sa smie poslať len tam, kde sa dá rozumne '
    + 'predpokladať záujem firmy o našu službu. Oslovujte po jednom, firmy, ktoré robia to, na čo dodávame ľudí, vecne a bez nátlaku — '
    + 'a podľa rady právnika. Odhlásenie a Impressum sú v každom e-maile a kto sa odhlási, tomu už nič nepošleme.';
  const TRACK_TIP = 'Sledovanie otvorenia nie je 100 %. Apple Mail a Gmail obrázky v e-maile načítajú samy (otvorenie bez človeka — '
    + 'appka ho ukáže ako „možno automaticky"), iné programy obrázky blokujú (človek e-mail čítal, ale otvorenie sa nezapíše). '
    + 'Kliky sú spoľahlivejšie, no aj tie niekedy skúša bezpečnostný skener. Rozhoduje odpoveď firmy.';

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

  const Outreach = {
    rows: [], events: [], optouts: [], templates: [], boxes: [], loaded: false, missing: false,
    tab: 'today', _sum: new Map(), _p: null,

    // ── Dáta ──────────────────────────────────────────────────────────────
    async load() {
      const [o, e, x, t] = await Promise.all([
        DB.list('outreach', { select: COLS, order: { column: 'created_at', ascending: false }, limit: 5000 }),
        DB.list('outreach_events', { select: 'id,outreach_id,lead_id,type,url,at,automated,auto_reason,mail_message_id',
          order: { column: 'at', ascending: false }, limit: 10000 }),
        DB.list('email_optout', { limit: 20000 }),
        DB.list('message_templates', { order: { column: 'sort_order', ascending: true }, limit: 200 }),
      ]);
      // Kým nie je spustená migrácia 078, tabuľky nie sú — appka nespadne, len to povie.
      this.missing = !!(o && o.error);
      this.rows = ((o && o.data) || []).filter(r => !r.archived_at);
      this.events = (e && e.data) || [];
      this.optouts = (x && x.data) || [];
      this.templates = ((t && t.data) || []).filter(r => r.channel === 'outreach');
      this._sum = new Map();
      const by = new Map();
      for (const r of this.rows) { if (!by.has(r.lead_id)) by.set(r.lead_id, []); by.get(r.lead_id).push(r); }
      for (const [id, list] of by) this._sum.set(id, OO().summary(list));
      this.loaded = true;
    },
    /** Načíta raz; chyba nezhodí obrazovku firiem. */
    async ensure(force) {
      if (force) { this.loaded = false; this._p = null; }
      if (this.loaded) return;
      if (!this._p) this._p = this.load().catch(() => { this.loaded = true; }).finally(() => { this._p = null; });
      await this._p;
    },
    async ensureBoxes() {
      if (this._boxes) return;
      const { data } = await DB.list('mailboxes', { select: 'id,name,email,display_name,signature,signature_card,active', limit: 100 });
      // Databáza vráti len schránky, ku ktorým má človek prístup (058).
      this.boxes = (data || []).filter(b => b.active !== false);
      this._boxes = true;
    },
    cfg() { return OO().settings(Danubra.cfg('marketing')); },
    sum(leadId) { return this._sum.get(leadId) || OO().summary([]); },
    ofLead(leadId) { return OO().ofLead(this.rows, leadId); },
    lead(id) { return ((window.Lead && Lead.rows) || []).find(r => r.id === id) || null; },
    who(uid) {
      const m = (Danubra.members || []).find(x => x.user_id === uid);
      return m ? (m.full_name || m.email || '') : '';
    },
    shortDate(d) {
      if (!d) return '';
      const x = new Date(d);
      return `${x.getDate()}. ${x.getMonth() + 1}. ${x.getFullYear()} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
    },
    sentToday() { return OO().sentToday(this.rows); },

    // ── Zoznam firiem: stĺpec a filtre (DataList v leads.js) ─────────────
    cell(r) {
      const s = this.sum(r.id);
      if (!s.count) {
        return s.failed ? '<span class="dl-note is-red">neodišlo</span>' : '<span class="dl-note is-mute">neoslovená</span>';
      }
      const ico = (n, t, c) => `<span title="${UI.esc(t)}" aria-label="${UI.esc(t)}" style="color:${c};display:inline-flex;">${Icon(n, 14)}</span>`;
      const ik = [ico('upload', `Odoslané: ${s.count} ${Shell.plural(s.count, 'e-mail', 'e-maily', 'e-mailov')}`, 'var(--brand)')];
      if (s.opened) ik.push(ico('eye', `Otvoril (${s.opens}×)`, 'var(--green)'));
      else if (s.autoOpened) ik.push(ico('eye', 'Otvorenie (možno automaticky)', 'var(--ink-mute)'));
      if (s.clicked) ik.push(ico('link', `Klikol na odkaz (${s.clicks}×)`, 'var(--green)'));
      if (s.replied) ik.push(ico('back', 'Odpovedal', 'var(--green)'));
      if (s.bounced) ik.push(ico('alert', 'Nedoručené', 'var(--red)'));
      if (s.unsubscribed) ik.push(ico('x', 'Odhlásil sa', 'var(--red)'));
      return `<span class="dl-two"><span style="display:inline-flex;gap:4px;align-items:center;">${ik.join('')}</span>
        <small class="dl-note ${s.waiting ? 'is-amber' : 'is-mute'}">${s.waiting ? 'pripomenúť sa' : UI.date(s.lastAt)}</small></span>`;
    },
    column() {
      return { key: 'oslovenie', label: 'Oslovenie', width: '128px', mobileLabel: 'oslovenie',
        tip: `Čo sa stalo s e-mailmi firme: odoslané, otvorené (sivé oko = možno automaticky), klik, odpoveď, nedoručené, odhlásené — a dátum posledného. ${TRACK_TIP}`,
        render: (r) => this.cell(r), sortValue: (r) => this.sum(r.id).lastAt || null, sortDir: -1,
        csv: (r) => OO().STATES[this.sum(r.id).state][0] };
    },
    filters() {
      return [
        { key: 'oslovenie', type: 'multi', label: 'Oslovenie', value: (r) => OO().flags(this.sum(r.id)), sortOptions: false, allLabel: 'Všetky',
          options: [['sent', 'Oslovené'], ['not_sent', 'Neoslovené'], ['opened', 'Otvoril'], ['clicked', 'Klikol'], ['replied', 'Odpovedal'],
            ['bounced', 'Nedoručené'], ['waiting', 'Čaká na pripomenutie']],
          hint: 'Podľa e-mailov oslovenia. Otvoril zahŕňa aj otvorenie „možno automaticky" (Apple, Gmail predčítajú obrázky). Čaká na pripomenutie = prišiel termín a firma neodpísala.' },
        { key: 'pripomenut', type: 'toggle', label: 'Čaká na pripomenutie', test: (r) => this.sum(r.id).waiting, more: true,
          hint: 'Firmy, ktorým odišiel e-mail, neodpísali a nadišiel termín pripomenutia (Nastavenia oslovovania).' },
      ];
    },

    /** Ďalší krok pre firmu (1 = osloviť, 2+ = pripomenúť sa), alebo 0 = už nie. */
    nextStep(r) {
      if (!r || ['unsubscribed', 'rejected', 'won'].includes(r.status)) return 0;
      const s = this.sum(r.id);
      if (s.replied || s.unsubscribed || s.bounced) return 0;
      const step = s.count ? s.step + 1 : 1;
      return s.count && step > this.cfg().max_steps ? 0 : step;
    },
    /** Akcia v riadku zoznamu firiem (DataList). */
    rowAction() {
      return { ico: 'mail', label: 'Osloviť / pripomenúť sa e-mailom', show: (r) => !!this.nextStep(r) && !this.missing,
        run: (r) => this.compose(r.id, this.nextStep(r)) };
    },
    /** Tlačidlo pri firme: Osloviť / Pripomenúť sa. */
    button(r) {
      const step = this.nextStep(r);
      if (!step || this.missing) return '';
      const s = this.sum(r.id);
      return `<button class="btn ${s.count ? 'btn-outline' : 'btn-primary'} btn-sm" onclick="event.stopPropagation();Outreach.compose('${r.id}', ${step})">${Icon('mail', 14)} ${s.count ? 'Pripomenúť sa' : 'Osloviť'}</button>${UI.tip(s.count
        ? 'Krátka nadväzujúca správa v tom istom vlákne (Re: …). Pošlite ju, keď firma po prvom e-maile neodpísala.'
        : 'Osobný e-mail tejto jednej firme z Vašej schránky — s pätičkou (Impressum), odkazom na odhlásenie a sledovaním, či ho otvorila.')}`;
    },

    // ── Časová os v detaile firmy ─────────────────────────────────────────
    timelineHtml(leadId) {
      if (this.missing) return '';
      const list = this.ofLead(leadId);
      const lead = this.lead(leadId);
      const s = this.sum(leadId);
      const head = `<div class="form-section">Oslovenie${UI.tip(`Každý e-mail, ktorý firme odišiel cez „Osloviť", a čo sa s ním stalo. ${TRACK_TIP}`)}</div>`;
      if (!list.length) {
        return `${head}<div class="js-empty">Firme zatiaľ neodišiel žiadny e-mail oslovenia.</div>
          <div class="js-acts">${this.button(lead)}</div>`;
      }
      const ev = (id) => this.events.filter(e => e.outreach_id === id);
      const li = (ico, tone, text, extra = '') => `<li class="otl-ev"><span class="otl-ico" style="color:${tone};">${Icon(ico, 13)}</span><span>${text}${extra}</span></li>`;
      const mails = list.map((o) => {
        const evs = ev(o.id);
        const st = o.status === 'failed' ? UI.badge('Neodišlo', 'red') : o.status === 'bounced' ? UI.badge('Nedoručené', 'red')
          : o.status === 'draft' ? UI.badge('Rozpísané', 'gray') : UI.badge('Odoslané', 'blue');
        const items = [];
        if (o.sent_at) items.push(li('upload', 'var(--brand)', `Odoslané ${UI.esc(this.shortDate(o.sent_at))} na ${UI.esc(o.to_email)}`));
        if (o.status === 'failed') items.push(li('alert', 'var(--red)', `Neodišlo: ${UI.esc(o.error || '')}`));
        if (o.opened_at) {
          items.push(li('eye', 'var(--green)', `Otvoril ${Number(o.open_count) || 1}× · prvé ${UI.esc(this.shortDate(o.opened_at))}${
            o.last_opened_at && o.last_opened_at !== o.opened_at ? ` · posledné ${UI.esc(this.shortDate(o.last_opened_at))}` : ''}`));
        }
        if (o.auto_opened_at) {
          const why = (evs.find(e => e.type === 'open' && e.automated) || {}).auto_reason;
          items.push(li('eye', 'var(--ink-mute)', `Otvorenie (možno automaticky) ${Number(o.auto_open_count) || 1}× · ${UI.esc(this.shortDate(o.auto_opened_at))}`,
            UI.tip(`${why ? `Prečo: ${why}. ` : ''}Obrázky v e-maile načítal program, nie nutne človek. Neznamená to, že e-mail niekto čítal.`)));
        }
        const kliky = new Map();
        for (const e of evs.filter(x => x.type === 'click')) {
          const k = e.url || '';
          const v = kliky.get(k) || { n: 0, auto: 0, at: e.at };
          if (e.automated) v.auto++; else v.n++;
          kliky.set(k, v);
        }
        for (const [url, v] of kliky) {
          let kam = url;
          try { const u = new URL(url); kam = `${u.hostname}${u.pathname !== '/' ? u.pathname : ''}`; } catch (e) { /* holá adresa */ }
          if (v.n) items.push(li('link', 'var(--green)', `Klikol na ${UI.esc(kam)} (${v.n}×)`));
          if (v.auto) items.push(li('link', 'var(--ink-mute)', `Klik na ${UI.esc(kam)} (možno automaticky, ${v.auto}×)`,
            UI.tip('Odkaz otvoril bezpečnostný skener alebo program hneď po doručení — nie nutne človek.')));
        }
        for (const e of evs.filter(x => x.type === 'reply')) {
          items.push(li('back', e.automated ? 'var(--ink-mute)' : 'var(--green)',
            `${UI.esc(OO().eventLabel(e))} ${UI.esc(this.shortDate(e.at))}`,
            e.mail_message_id ? ` <button class="link-chip" onclick="Outreach.openMail('${UI.esc(e.mail_message_id)}')">${Icon('mail', 12)}<span>Otvoriť e-mail</span></button>` : ''));
        }
        if (o.replied_at && !evs.some(x => x.type === 'reply' && !x.automated)) items.push(li('back', 'var(--green)', `Odpovedal ${UI.esc(this.shortDate(o.replied_at))}`));
        if (o.bounced_at) {
          items.push(li('alert', 'var(--red)', `Nedoručené ${UI.esc(this.shortDate(o.bounced_at))}`,
            UI.tip('Server firmy e-mail vrátil (zlá alebo zrušená adresa, plná schránka). Overte e-mail na webe firmy a opravte ho — na túto adresu sa už nepripomína.')));
        }
        if (o.unsubscribed_at) items.push(li('x', 'var(--red)', `Odhlásil sa ${UI.esc(this.shortDate(o.unsubscribed_at))} — už ho neoslovíme`));
        const kto = this.who(o.sent_by);
        return `<div class="otl-mail">
          <div class="otl-head"><b>${o.step > 1 ? `Pripomenutie ${o.step - 1}` : 'Prvý e-mail'}</b>
            <span class="otl-subj">${UI.esc(o.subject || '')}</span>${st}</div>
          <div class="otl-meta">${kto ? `poslal(a) ${UI.esc(kto)} · ` : ''}${o.lang === 'en' ? 'po anglicky' : 'po nemecky'}</div>
          <ul class="otl-list">${items.join('')}</ul></div>`;
      }).join('');
      const next = s.nextFollowupAt && !s.bounced
        ? `<div class="${s.waiting ? 'warnbox' : 'notebox'}" style="margin-top:8px;">${Icon('clock', 14)} Ďalšie pripomenutie ${
          UI.esc(OO().relDays(s.nextFollowupAt))} (${UI.date(s.nextFollowupAt)})${UI.tip('Keď firma do tohto dňa neodpíše, nočná kontrola založí úlohu „Pripomenúť sa firme …". Pripomenúť sa môžete aj skôr. Keď firma odpíše, pripomenutie sa zruší samo.')}</div>` : '';
      return `${head}<div class="otl">${mails}</div>${next}<div class="js-acts">${this.button(lead)}</div>`;
    },

    async openMail(id) {
      const { data } = await DB.list('mail_messages', { select: 'id,mailbox_id,direction', filters: { id }, limit: 1 });
      const m = (data || [])[0];
      if (!m) return UI.toast('Tento e-mail nevidíte — nemáte prístup k Správam alebo k tejto schránke', 'err');
      UI.closeModal();
      Danubra.go('mail');
      setTimeout(() => { if (window.Mail) { Mail.box = m.mailbox_id; Mail.folder = m.direction; Mail.open(m.id); } }, 300);
    },

    // ── Okno „Osloviť" ─────────────────────────────────────────────────────
    async compose(leadId, step = 1) {
      if (window.Lead && !Lead.loaded) await Lead.load();
      await Promise.all([this.ensure(), this.ensureBoxes()]);
      const lead = this.lead(leadId);
      if (!lead) return UI.toast('Firma sa nenašla', 'err');
      if (this.missing) return UI.toast('Oslovovanie ešte nie je pripravené v databáze (migrácia 078)', 'err');
      if (!this.boxes.length) {
        return UI.toast(Danubra.isAdmin() ? 'Najprv pridajte schránku (Nastavenia → Schránky)' : 'Nemáte pridelenú schránku — požiadajte administrátora', 'err');
      }
      const cfg = this.cfg();
      this._c = { leadId, step: Number(step) || 1, lang: 'de', source: 'template' };
      const tpl = this.tplOptions();
      UI.modal(this._c.step > 1 ? `Pripomenúť sa — ${lead.name}` : `Osloviť — ${lead.name}`, `
        <form id="oc-form" onsubmit="event.preventDefault();Outreach.send()" oninput="Outreach.preview()">
          <div class="form-grid">
            ${UI.field('mailbox_id', 'Od (schránka)', { value: this.boxes[0].id, add: false, onchange: 'Outreach.preview()',
              options: this.boxes.map(b => [b.id, `${b.display_name || b.name} <${b.email}>`]),
              tip: 'Z tejto schránky e-mail odíde a do nej príde odpoveď firmy. Vidíte len schránky, ktoré Vám pridelil administrátor. Podpis schránky sa pridá na koniec.' })}
            ${UI.field('lang', 'Jazyk', { value: 'de', onchange: 'Outreach.useTemplate()', options: [['de', 'Nemecky (Sie)'], ['en', 'Anglicky']],
              tip: 'Nemeckým firmám píšte po nemecky, vykaním (Sie). Anglicky len vtedy, keď viete, že firma komunikuje po anglicky.' })}
            ${UI.field('template', 'Šablóna', { value: tpl[0][0], onchange: 'Outreach.useTemplate()', options: tpl,
              tip: 'Východiskový text. Údaje firmy ({firma}, {mesto}, {konatel}, {remeslo}) sa doplnia samy. Šablóny spravujete v Marketing → Oslovovanie.' })}
            ${UI.field('to', 'Komu', { type: 'email', value: lead.email || '', required: true,
              tip: 'E-mail firmy. Keď ho tu zmeníte, pošle sa na zmenenú adresu — pri firme sa neuloží. Odhlásená adresa sa neosloví.' })}
            <div class="fld-full">${UI.field('subject', 'Predmet', { value: '', required: true })}</div>
            <div class="fld-full">${UI.field('body', 'Text', { type: 'textarea', rows: 13, value: '',
              tip: 'Text si pred odoslaním prečítajte a upravte. Podpis schránky, pätička s Impressum a odkaz na odhlásenie sa pridajú samy.' })}</div>
          </div>
          <div class="btn-row">
            <button type="button" class="btn btn-outline btn-sm" id="oc-ai" onclick="Outreach.aiDraft()">${Icon('zap', 14)} Navrhnúť osobný text (AI)</button>${UI.tip(
              'AI napíše krátky osobný e-mail z profilu firmy (čo robí, mesto, prečo sme ju vybrali) a z nášho portfólia v Nastaveniach oslovovania. Nič si nevymýšľa a nespomína našich odberateľov. Keď AI nie je zapnutá, vloží sa šablóna.')}
            <button type="button" class="btn btn-ghost btn-sm" onclick="Outreach.useTemplate()">${Icon('repeat', 14)} Znova zo šablóny</button>
            <span id="oc-src" class="card-note" style="margin:0;"></span>
          </div>
          <div id="oc-check"></div>
          <div class="form-section">Náhľad${UI.tip('Takto e-mail uvidí firma (text). Odkaz na odhlásenie je tu skrátený (…), skutočný má každý e-mail vlastný.')}</div>
          <pre id="oc-preview" class="cf-preview"></pre>
          <p class="card-note">Sledovanie: otvorenia ${cfg.track_opens ? 'zapnuté' : 'vypnuté'}, kliky ${cfg.track_clicks ? 'zapnuté' : 'vypnuté'}
            · dnes odišlo ${this.sentToday()} z ${cfg.daily_limit}${UI.tip(`${TRACK_TIP} Sledovanie a denný limit sa nastavujú v Marketing → Oslovovanie → Nastavenia.`)}</p>
          <div class="regimebox">Posiela sa jednotlivo, jednej firme. ${UI.esc(LEGAL.split(':')[0])}.${UI.tip(LEGAL)}</div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary" id="oc-go">${Icon('mail', 14)} Odoslať</button>
          </div>
        </form>`, { wide: true });
      this.useTemplate();
    },

    /** Šablóny pre krok (z databázy, inak predvolená). */
    tplOptions() {
      const kind = this._c && this._c.step > 1 ? 'followup' : 'intro';
      const lang = (this._c && this._c.lang) || 'de';
      const z = this.templates.filter(t => t.active !== false && String(t.key || '').includes(kind) && (t.language || 'de') === lang)
        .map(t => [t.key, t.title || t.key]);
      return z.length ? z : [[`outreach_${kind}`, kind === 'followup' ? 'Pripomenutie (predvolené)' : 'Prvý e-mail (predvolené)']];
    },

    _vars(lead, lang) {
      const prev = this._c.step > 1 ? OO().lastSent(this.ofLead(lead.id)) : null;
      return { prev, v: OO().vars(lead, { supplier: Danubra.supplier(), lang, portfolio: this.cfg().portfolio, prev,
        similarName: window.Lead && lead.similar_to ? Lead.partnerName(lead.similar_to) : '' }) };
    },

    useTemplate() {
      const f = document.getElementById('oc-form');
      if (!f || !this._c) return;
      const lead = this.lead(this._c.leadId);
      const lang = f.querySelector('[name=lang]').value === 'en' ? 'en' : 'de';
      if (lang !== this._c.lang) {
        this._c.lang = lang;
        const sel = f.querySelector('[name=template]');
        sel.innerHTML = this.tplOptions().map(([k, l]) => `<option value="${UI.esc(k)}">${UI.esc(l)}</option>`).join('');
      }
      const key = f.querySelector('[name=template]').value;
      const t = OO().pickTemplate(this.templates, { step: this._c.step, lang, key });
      const { v, prev } = this._vars(lead, lang);
      f.querySelector('[name=subject]').value = this._c.step > 1 && prev ? OO().replySubject(prev.subject) : OO().fillTemplate(t.subject, v);
      f.querySelector('[name=body]').value = OO().fillTemplate(t.body, v);
      this._c.source = 'template'; this._c.template_key = t.key;
      const src = document.getElementById('oc-src');
      if (src) src.textContent = 'Text je zo šablóny.';
      this.preview();
    },

    async aiDraft() {
      const f = document.getElementById('oc-form');
      if (!f || !this._c) return;
      const b = document.getElementById('oc-ai');
      if (b) { b.disabled = true; b.textContent = 'Píšem návrh…'; }
      try {
        const r = await call('danubra-outreach-draft', { lead_id: this._c.leadId, step: this._c.step, lang: this._c.lang,
          template_key: f.querySelector('[name=template]').value });
        if (!document.getElementById('oc-form')) return;
        f.querySelector('[name=subject]').value = r.subject || '';
        f.querySelector('[name=body]').value = r.body || '';
        this._c.source = r.source; this._c.template_key = r.template_key;
        const src = document.getElementById('oc-src');
        if (src) src.textContent = r.source === 'ai' ? 'Návrh napísala AI — prečítajte si ho pred odoslaním.' : (r.ai_error || 'Text je zo šablóny.');
        this.preview();
      } catch (e) {
        UI.toast(e.message, 'err');
      } finally {
        if (b && document.body.contains(b)) { b.disabled = false; b.innerHTML = `${Icon('zap', 14)} Navrhnúť osobný text (AI)`; }
      }
    },

    preview() {
      const f = document.getElementById('oc-form');
      if (!f || !this._c) return;
      const d = UI.formData(f);
      const lead = this.lead(this._c.leadId) || {};
      const box = this.boxes.find(x => x.id === d.mailbox_id) || {};
      const sig = MM() ? MM().sigOf(box) : '';
      const cfg = this.cfg();
      const chk = OO().canSend({ lead, email: d.to, optouts: this.optouts, sentToday: this.sentToday(), cfg,
        step: this._c.step, history: this.ofLead(lead.id) });
      const s = Danubra.supplier();
      const chyba = OO().impressumMissing(s);
      const blocks = [...chk.blocks.map(x => x.text), ...(chyba.length ? [`V Nastaveniach → Fakturačné údaje chýba pre Impressum: ${chyba.join(', ')}.`] : [])];
      const nevyplnene = [...new Set((`${d.subject} ${d.body}`.match(/\{[a-z_]+(\|[^{}]*)?\}/g) || []))];
      const warns = [...chk.warns.map(x => x.text),
        ...(nevyplnene.length ? [`V texte zostalo ${nevyplnene.join(', ')} — firma nemá ten údaj. Prepíšte to vlastnými slovami.`] : [])];
      const c = document.getElementById('oc-check');
      if (c) {
        c.innerHTML = (blocks.length ? `<div class="warnbox">${Icon('alert', 14)} ${blocks.map(UI.esc).join('<br>')}</div>` : '')
          + (warns.length ? `<div class="notebox">${warns.map(UI.esc).join('<br>')}</div>` : '');
      }
      const odhl = `${location.origin}/.netlify/functions/danubra-unsubscribe?t=…`;
      const p = document.getElementById('oc-preview');
      if (p) {
        p.textContent = `Komu: ${d.to || '—'}\nPredmet: ${d.subject || ''}\n\n${String(d.body || '').trim()}${sig ? `\n\n-- \n${sig}` : ''}\n${OO().footerText(s, odhl, this._c.lang)}`;
      }
      const go = document.getElementById('oc-go');
      if (go) go.disabled = !!blocks.length || !String(d.subject || '').trim() || String(d.body || '').trim().length < 20;
    },

    async send() {
      const f = document.getElementById('oc-form');
      if (!f || !this._c) return;
      const d = UI.formData(f);
      const box = this.boxes.find(x => x.id === d.mailbox_id) || {};
      const sig = MM() ? MM().sigOf(box) : '';
      const go = document.getElementById('oc-go');
      if (go) { go.disabled = true; go.textContent = 'Odosielam…'; }
      try {
        const r = await call('danubra-outreach-send', {
          lead_id: this._c.leadId, mailbox_id: d.mailbox_id, step: this._c.step, lang: this._c.lang, to: d.to,
          subject: d.subject, body: `${String(d.body || '').replace(/\s+$/, '')}${sig ? `\n\n-- \n${sig}` : ''}`,
          template_key: this._c.template_key || null,
        });
        UI.closeModal();
        UI.toast(r.next_followup_at ? `E-mail odišiel. Pripomenúť sa ${OO().relDays(r.next_followup_at)}, ak firma neodpíše.` : 'E-mail odišiel', 'ok');
        const lead = this.lead(this._c.leadId);
        if (lead && lead.status === 'new') lead.status = 'contacted';
        if (lead) lead.last_contact_at = r.sent_at;
        await this.ensure(true);
        if (window.DataList && window.Lead && Danubra.route === 'leads') DataList.refresh('leads', Lead.rows);
        Danubra.renderRoute();
      } catch (e) {
        if (go && document.body.contains(go)) { go.disabled = false; go.innerHTML = `${Icon('mail', 14)} Odoslať`; }
        UI.toast(e.message, 'err');
      }
    },

    // ── Obrazovka Marketing → Oslovovanie ────────────────────────────────
    setTab(t) { this.tab = t; Danubra.renderRoute(); },

    async view(el) {
      Danubra.setActions(`<button class="btn btn-outline btn-sm" onclick="Danubra.go('leads')">${Icon('marketing', 14)} Nové firmy</button>`);
      if (!this.loaded || !(window.Lead && Lead.loaded)) {
        el.innerHTML = UI.loading();
        await Promise.all([this.ensure(true), window.Lead && !Lead.loaded ? Lead.load() : null]);
      }
      const leads = (window.Lead && Lead.rows) || [];
      const cfg = this.cfg();
      const due = OO().followupsDue(this.rows, leads, new Date(), cfg);
      const fresh = OO().freshLeads(leads, this.rows, this.optouts);
      const dnes = this.sentToday();
      const n = due.length
        ? { key: 'due', hot: true, title: 'Pripomenúť sa firmám',
            what: `${due.length} ${Shell.plural(due.length, 'firma neodpísala', 'firmy neodpísali', 'firiem neodpísalo')} a prišiel termín pripomenutia.`,
            why: 'Krátka správa v tom istom vlákne po pár dňoch často prinesie odpoveď — prvý e-mail sa ľahko stratí.' }
        : fresh.length
          ? { key: 'new', hot: false, title: 'Osloviť nové firmy',
              what: `${fresh.length} ${Shell.plural(fresh.length, 'nová firma má', 'nové firmy majú', 'nových firiem má')} e-mail a ešte im nič neodišlo.`,
              why: 'Po jednom a osobne: radšej päť dobre vybraných firiem denne ako päťdesiat naslepo.' }
          : { key: 'ok', hot: false, title: 'Nič nečaká', what: 'Nikomu netreba pripomenúť a nové firmy s e-mailom sú oslovené.',
              why: 'Nové firmy nájdete v Marketing → Nové firmy cez „Hľadať podobné firmy".' };
      const prvy = due[0] ? due[0].lead : fresh[0];
      el.innerHTML = Danubra.header(Danubra.labelOf('outreach'), `dnes odišlo ${dnes} z ${cfg.daily_limit} · ${this.rows.filter(r => r.status === 'sent' || r.status === 'bounced').length} e-mailov spolu`)
        + Shell.now(n, { help: 'screen.outreach', action: prvy
          ? { label: due[0] ? 'Pripomenúť sa' : 'Osloviť', ico: 'mail', onclick: `Outreach.compose('${prvy.id}', ${due[0] ? (Number(due[0].outreach.step) || 1) + 1 : 1})` } : null })
        + (this.missing ? `<div class="warnbox">${Icon('alert', 14)} Oslovovanie ešte nie je pripravené v databáze — treba spustiť migráciu 078.</div>` : '')
        + this.statsHtml()
        + Shell.tabs([
          ['today', 'Dnes na rade', 'clock', due.length + Math.min(fresh.length, 99)],
          ['sent', 'Odoslané', 'mail', this.rows.length],
          ['templates', 'Šablóny', 'note', this.templates.length],
          ['settings', 'Nastavenia', 'settings', null],
        ], this.tab, k => `Outreach.setTab('${k}')`)
        + (this.tab === 'sent' ? this.sentHtml(leads) : this.tab === 'templates' ? this.templatesHtml()
          : this.tab === 'settings' ? this.settingsHtml() : this.todayHtml(due, fresh, dnes, cfg));
    },

    statsHtml() {
      const a = OO().stats(this.rows, 7), b = OO().stats(this.rows, 30);
      const row = (label, k, pk, tip) => `<tr><td>${label}${tip ? UI.tip(tip) : ''}</td>
        <td class="num">${a[k]}${pk ? ` <small>(${a[pk]} %)</small>` : ''}</td><td class="num">${b[k]}${pk ? ` <small>(${b[pk]} %)</small>` : ''}</td></tr>`;
      return `<div class="card card-pad" style="margin-bottom:14px;">
        <div class="card-head"><div class="card-title">Ako to ide${UI.tip('Počty e-mailov oslovenia odoslaných za posledných 7 a 30 dní a čo sa s nimi stalo. Percentá sú z odoslaných.')}</div></div>
        <table class="otl-stats"><thead><tr><th></th><th class="num">7 dní</th><th class="num">30 dní</th></tr></thead><tbody>
          ${row('Odoslané', 'sent')}
          ${row('Otvorené', 'opened', 'openedPct', TRACK_TIP)}
          ${row('Len otvorenie možno automaticky', 'autoOnly', 'autoPct', 'E-maily, pri ktorých obrázky načítal len program (Apple Mail, Gmail, skener) — nevieme, či ich niekto čítal.')}
          ${row('Klikli na odkaz', 'clicked', 'clickedPct')}
          ${row('Odpovedali', 'replied', 'repliedPct', 'Odpoveď sa spáruje sama, keď príde do schránky, z ktorej e-mail odišiel (synchronizácia Správ každých 10 minút).')}
          ${row('Nedoručené', 'bounced', 'bouncedPct', 'Server firmy e-mail vrátil. Veľa nedoručených = zlé adresy; schránka potom ľahko skončí v spame.')}
          ${row('Odhlásili sa', 'unsubscribed')}
        </tbody></table></div>`;
    },

    todayHtml(due, fresh, dnes, cfg) {
      const riadok = (l, extra, step) => `<div class="list-row" role="button" tabindex="0" onclick="Lead.detail('${l.id}')">
        <span style="flex:1;min-width:0;font-size:13px;"><strong>${UI.esc(l.name)}</strong>
          <span style="color:var(--ink-mute);"> · ${UI.esc([l.city, l.trade].filter(Boolean).join(' · ') || '—')}</span>
          <span style="color:var(--ink-mute);display:block;font-size:12px;">${extra}</span></span>
        <button class="btn ${step > 1 ? 'btn-outline' : 'btn-primary'} btn-sm" onclick="event.stopPropagation();Outreach.compose('${l.id}', ${step})">${Icon('mail', 14)} ${step > 1 ? 'Pripomenúť sa' : 'Osloviť'}</button>
      </div>`;
      const zostava = Math.max(0, cfg.daily_limit - dnes);
      return `${zostava ? '' : `<div class="warnbox">${Icon('alert', 14)} Dnešný limit ${cfg.daily_limit} e-mailov je vyčerpaný. Ďalšie firmy oslovte zajtra.${UI.tip('Denný limit chráni Vašu schránku pred spamovými filtrami a firmy pred hromadným rozosielaním. Mení ho administrátor v záložke Nastavenia.')}</div>`}
        <div class="form-section">Pripomenúť sa (${due.length})${UI.tip('Firmy, ktorým odišiel e-mail, neodpísali, neodhlásili sa a nadišiel termín pripomenutia. K nim vzniká aj úloha v Úlohách.')}</div>
        ${due.length ? due.map(({ outreach: o, lead: l }) => riadok(l, `${o.step > 1 ? `${o.step}. e-mail` : 'prvý e-mail'} ${UI.date(o.sent_at)} · „${UI.esc(o.subject || '')}"`,
          (Number(o.step) || 1) + 1)).join('') : '<div class="js-empty">Nikomu netreba pripomenúť.</div>'}
        <div class="form-section">Nové firmy s e-mailom (${fresh.length})${UI.tip('Nové firmy, ktoré majú e-mail, ešte im nič neodišlo a neodhlásili sa. Najlepšie zhora — sú zoradené podľa skóre podobnosti, ak ho majú.')}</div>
        ${fresh.length ? fresh.slice().sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)).slice(0, 30)
          .map(l => riadok(l, UI.esc(l.email), 1)).join('') : '<div class="js-empty">Všetky nové firmy s e-mailom sú oslovené.</div>'}
        <div class="regimebox" style="margin-top:12px;">${UI.esc(LEGAL)}</div>`;
    },

    // Zoznam odoslaných je spoločný komponent (`DataList`). Dovtedy tu bolo
    // posledných 200 riadkov bez filtrov — nedalo sa zistiť, kto otvoril,
    // kto odpísal, ani čo poslal ktorý kolega.
    sentHtml(leads) {
      const byId = new Map((leads || []).map(l => [l.id, l]));
      const rows = this.rows.filter(r => r.status !== 'draft').map(o => {
        const s = OO().summary([o]);
        const l = byId.get(o.lead_id) || {};
        return { id: o.id, o, s, state: o.status === 'failed' ? 'failed' : s.state, lead: l,
          firm: l.name || 'firma', who: this.who(o.sent_by), at: o.sent_at || o.created_at };
      });
      return DataList.html(this.sentConfig(rows));
    },

    /** Ikonky sledovania jedného e-mailu: otvoril, klik, odpoveď, nedoručené, odhlásil. */
    trackIcons(o) {
      const ico = (n, t, tone) => `<span class="or-ico is-${tone}" title="${UI.esc(t)}" aria-label="${UI.esc(t)}">${Icon(n, 14)}</span>`;
      const ik = [];
      if (o.opened_at) ik.push(ico('eye', `Otvoril (${Number(o.open_count) || 1}×)`, 'green'));
      else if (o.auto_opened_at) ik.push(ico('eye', 'Otvorenie (možno automaticky)', 'mute'));
      if (o.clicked_at) ik.push(ico('link', `Klikol na odkaz (${Number(o.click_count) || 1}×)`, 'green'));
      if (o.replied_at) ik.push(ico('back', 'Odpovedal', 'green'));
      if (o.bounced_at || o.status === 'bounced') ik.push(ico('alert', 'Nedoručené', 'red'));
      if (o.unsubscribed_at) ik.push(ico('x', 'Odhlásil sa', 'red'));
      return ik.length ? `<span class="or-icos">${ik.join('')}</span>` : '';
    },

    /** Konfigurácia zoznamu odoslaných e-mailov pre `DataList`. */
    sentConfig(rows) {
      const ST = OO().STATES;
      const stLabel = (k) => (k === 'failed' ? 'Neodišlo' : (ST[k] || ST.sent)[0]);
      const krok = (o) => (Number(o.step) > 1 ? `Pripomenutie ${o.step - 1}` : 'Prvý e-mail');
      const order = ['failed', 'bounced', 'unsubscribed', 'replied', 'clicked', 'opened', 'auto', 'sent', 'none'];
      return {
        id: 'odoslane', storageKey: 'oslovovanie-odoslane', label: 'Odoslané e-maily oslovenia',
        noun: ['e-mail', 'e-maily', 'e-mailov'],
        rows,
        rowClick: (r) => Lead.detail(r.o.lead_id),
        rowClass: (r) => (['failed', 'bounced'].includes(r.state) ? 'is-hot' : r.state === 'replied' ? '' : r.state === 'unsubscribed' ? 'is-muted' : ''),
        rowLabel: (r) => `E-mail firme ${r.firm}`,
        rowActions: [
          { ico: 'mail', label: 'Pripomenúť sa e-mailom', show: (r) => !this.missing && r.lead.id && this.nextStep(r.lead) > 1
            && OO().lastSent(this.ofLead(r.lead.id)) && OO().lastSent(this.ofLead(r.lead.id)).id === r.o.id,
            run: (r) => this.compose(r.lead.id, this.nextStep(r.lead)) },
          { ico: 'chevron', label: 'Otvoriť firmu', run: (r) => Lead.detail(r.o.lead_id) },
        ],
        columns: [
          { key: 'firma', label: 'Firma', width: 'minmax(160px, 1.4fr)', mobile: 'title',
            render: (r) => `<span class="dl-title"><b>${UI.esc(r.firm)}</b><small>${UI.esc(r.o.to_email || '')}</small></span>`,
            sortValue: (r) => r.firm, csv: (r) => r.firm },
          { key: 'predmet', label: 'Predmet', width: 'minmax(180px, 2fr)', mobile: 'line',
            render: (r) => `<span class="dl-two is-wrap"><b title="${UI.esc(r.o.subject || '')}">${UI.esc(r.o.subject || '—')}</b>${
              r.o.status === 'failed' && r.o.error ? `<small class="dl-note is-red">${UI.esc(r.o.error)}</small>` : ''}</span>`,
            sortValue: (r) => r.o.subject || null, csv: (r) => r.o.subject || '' },
          { key: 'krok', label: 'Krok', width: '112px', mobileLabel: '',
            render: (r) => `<span class="dl-two"><b>${krok(r.o)}</b><small>${r.o.lang === 'en' ? 'po anglicky' : 'po nemecky'}</small></span>`,
            sortValue: (r) => Number(r.o.step) || 1, csv: (r) => krok(r.o) },
          { key: 'kto', label: 'Kto', width: '110px', hideBelow: 1050, mobileLabel: 'poslal(a)',
            render: (r) => (r.who ? UI.esc(r.who) : ''), sortValue: (r) => r.who || null, csv: (r) => r.who },
          { key: 'kedy', label: 'Kedy', width: '128px', mobileLabel: '',
            render: (r) => (r.at ? `<span class="dl-num">${UI.esc(this.shortDate(r.at))}</span>` : ''),
            sortValue: (r) => r.at || null, sortDir: -1, csv: (r) => r.at || '' },
          { key: 'sled', label: 'Sledovanie', width: '104px', mobileLabel: '',
            tip: `Otvoril (sivé oko = možno automaticky), klikol na odkaz, odpovedal, nedoručené, odhlásil sa. Ukážte myšou na ikonku. ${TRACK_TIP}`,
            render: (r) => this.trackIcons(r.o), csv: false },
          { key: 'stav', label: 'Stav', width: '124px', mobile: 'badge',
            tip: 'Najďalší stav e-mailu. Možno automaticky = obrázky načítal program (Apple Mail, Gmail, skener), nie nutne človek.',
            render: (r) => (r.state === 'failed' ? UI.badge('Neodišlo', 'red') : r.state === 'auto' ? UI.badge('Možno automaticky', 'gray')
              : UI.badge(...(ST[r.state] || ST.sent))),
            sortValue: (r) => order.indexOf(r.state), csv: (r) => stLabel(r.state) },
        ],
        sort: { key: 'kedy', dir: -1 },
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať firmu, predmet, e-mail…', label: 'Hľadať firmu, predmet alebo e-mail',
            fields: ['firm', 'o.subject', 'o.to_email', 'lead.city'] },
          { key: 'stav', type: 'multi', label: 'Stav', value: 'state', sortOptions: false, allLabel: 'Všetky',
            options: [['sent', 'Odoslané'], ['auto', 'Otvorenie (možno automaticky)'], ['opened', 'Otvoril'], ['clicked', 'Klikol'],
              ['replied', 'Odpovedal'], ['bounced', 'Nedoručené'], ['unsubscribed', 'Odhlásený'], ['failed', 'Neodišlo']],
            hint: 'Najďalší stav e-mailu: odpoveď je viac ako klik, klik viac ako otvorenie. Neodišlo = server e-mail neodoslal (dôvod je pod predmetom).' },
          { key: 'otvoril', type: 'toggle', label: 'Otvoril', test: (r) => !!(r.o.opened_at || r.o.auto_opened_at),
            hint: 'E-maily, ktoré firma otvorila — aj otvorenie „možno automaticky" (Apple Mail, Gmail predčítajú obrázky).' },
          { key: 'odpovedal', type: 'toggle', label: 'Odpovedal', test: (r) => !!r.o.replied_at,
            hint: 'E-maily, na ktoré firma odpísala (odpoveď sa spáruje sama zo schránky).' },
          { key: 'kto', type: 'select', label: 'Kto poslal', value: (r) => r.o.sent_by, allLabel: 'Všetci',
            optionLabel: (v, r) => (r && r.who) || 'neznámy', emptyLabel: 'Nezistené' },
          { key: 'kedy', type: 'range-date', label: 'Obdobie', field: 'at', more: true },
          { key: 'krok', type: 'select', label: 'Krok', value: (r) => (Number(r.o.step) > 1 ? 'followup' : 'intro'), more: true,
            options: [['intro', 'Prvý e-mail'], ['followup', 'Pripomenutie']], allLabel: 'Všetky kroky' },
          { key: 'klikol', type: 'toggle', label: 'Klikol na odkaz', test: (r) => !!r.o.clicked_at, more: true },
          { key: 'nedorucene', type: 'toggle', label: 'Nedoručené alebo neodišlo', test: (r) => ['bounced', 'failed'].includes(r.o.status) || !!r.o.bounced_at, more: true,
            hint: 'E-maily, ktoré server firmy vrátil, alebo ktoré vôbec neodišli — overte adresu pri firme.' },
          { key: 'jazyk', type: 'select', label: 'Jazyk', value: (r) => (r.o.lang === 'en' ? 'en' : 'de'), more: true,
            options: [['de', 'Nemecky'], ['en', 'Anglicky']], allLabel: 'Oba jazyky' },
        ],
        empty: { ico: 'mail', title: 'Zatiaľ nič neodišlo', sub: 'E-mail firme pošlete tlačidlom „Osloviť" pri firme v zozname Nových firiem.' },
        export: {
          name: ['oslovovanie-odoslane'],
          columns: [
            ['Firma', r => r.firm], ['E-mail', r => r.o.to_email], ['Predmet', r => r.o.subject], ['Krok', r => krok(r.o)],
            ['Jazyk', r => (r.o.lang === 'en' ? 'EN' : 'DE')], ['Poslal(a)', r => r.who], ['Odoslané', r => r.o.sent_at || ''],
            ['Stav', r => stLabel(r.state)], ['Otvorené', r => r.o.opened_at || ''], ['Otvorení', r => r.o.open_count || ''],
            ['Otvorenie možno automaticky', r => r.o.auto_opened_at || ''], ['Klik', r => r.o.clicked_at || ''],
            ['Odpoveď', r => r.o.replied_at || ''], ['Nedoručené', r => r.o.bounced_at || ''], ['Odhlásený', r => r.o.unsubscribed_at || ''],
            ['Chyba', r => r.o.error || ''],
          ],
        },
      };
    },

    // ── Šablóny ───────────────────────────────────────────────────────────
    templatesHtml() {
      const admin = Danubra.isAdmin();
      const list = this.templates;
      return `<div class="regimebox">Premenné: <code>{oslovenie}</code> <code>{firma}</code> <code>{mesto}</code> <code>{konatel}</code> <code>{remeslo}</code>
          <code>{podobna}</code> <code>{portfolio}</code> <code>{nasa_firma}</code> <code>{datum}</code>. Keď firma údaj nemá, použije sa náhrada za čiarou:
          <code>{mesto|Ihrer Region}</code>.${UI.tip('{oslovenie} = „Guten Tag <konateľ>," alebo „Sehr geehrte Damen und Herren,". {podobna} = náš odberateľ, na ktorého sa firma podobá — do e-mailu ho dávajte len výnimočne, s kým robíme, je obchodné tajomstvo. {portfolio} = text z Nastavení oslovovania. {datum} = kedy odišiel predchádzajúci e-mail (pri pripomenutí). Pätičku s Impressum a odhlásením pridá appka vždy sama.')}</div>
        ${admin ? `<div class="btn-row"><button class="btn btn-primary btn-sm" onclick="Outreach.templateForm()">${Icon('plus', 14)} Nová šablóna</button></div>`
          : '<p class="card-note">Šablóny mení administrátor. Pri oslovení si text môžete vždy upraviť.</p>'}
        ${DataList.html(this.templatesConfig(list.map(t => ({ id: t.id, t, title: t.title || t.key || '',
          kind: String(t.key || '').includes('followup') ? 'followup' : 'intro', lang: String(t.language || 'de').toLowerCase() })), admin))}`;
    },

    /** Konfigurácia zoznamu šablón oslovenia pre `DataList`. */
    templatesConfig(rows, admin) {
      const KIND = { intro: 'Prvý e-mail', followup: 'Pripomenutie' };
      const LANG = { de: 'Nemecky', en: 'Anglicky' };
      return {
        id: 'sablony-oslovenia', storageKey: 'sablony-oslovenia', label: 'Šablóny oslovenia',
        noun: ['šablóna', 'šablóny', 'šablón'],
        rows,
        rowClick: admin ? (r) => Outreach.templateForm(r.id) : null,
        rowClass: (r) => (r.t.active === false ? 'is-muted' : ''),
        rowLabel: (r) => `Šablóna ${r.title}`,
        rowActions: admin ? [{ ico: 'edit', label: 'Upraviť šablónu', run: (r) => Outreach.templateForm(r.id) }] : [],
        columns: [
          { key: 'nazov', label: 'Názov', width: 'minmax(170px, 1.4fr)', mobile: 'title',
            render: (r) => `<span class="dl-title"><b>${UI.esc(r.title)}</b><small>${UI.esc(r.t.key || '')}</small></span>`,
            sortValue: (r) => r.title },
          { key: 'druh', label: 'Na čo', width: '120px', mobileLabel: '',
            render: (r) => KIND[r.kind], sortValue: (r) => (r.kind === 'intro' ? 0 : 1), csv: (r) => KIND[r.kind] },
          { key: 'jazyk', label: 'Jazyk', width: '92px', mobileLabel: '',
            render: (r) => LANG[r.lang] || r.lang.toUpperCase(), sortValue: (r) => r.lang, csv: (r) => r.lang.toUpperCase() },
          { key: 'predmet', label: 'Predmet', width: 'minmax(180px, 2fr)', mobile: 'line',
            render: (r) => `<span class="dl-note is-mute">${UI.esc(r.t.subject || '')}</span>`, csv: (r) => r.t.subject || '' },
          { key: 'stav', label: 'Pri oslovení', width: '118px', mobile: 'badge',
            tip: 'Ponúka sa = šablóna je na výber v okne Osloviť. Vypnutá = ostáva uložená, ale nepoužíva sa.',
            render: (r) => (r.t.active === false ? UI.badge('Vypnutá', 'gray') : UI.badge('Ponúka sa', 'green')),
            sortValue: (r) => (r.t.active === false ? 1 : 0), csv: (r) => (r.t.active === false ? 'vypnutá' : 'ponúka sa') },
        ],
        sorts: [{ key: 'poradie', label: 'Poradie', value: (r) => Number(r.t.sort_order) || 0 }],
        sort: { key: 'poradie', dir: 1 },
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať názov, predmet, text…', label: 'Hľadať v šablónach', fields: ['title', 't.subject', 't.body', 't.key'] },
          { key: 'druh', type: 'select', label: 'Na čo', value: 'kind', options: Object.entries(KIND), allLabel: 'Všetky' },
          { key: 'jazyk', type: 'select', label: 'Jazyk', value: 'lang', options: Object.entries(LANG), allLabel: 'Oba jazyky' },
          { key: 'aktivne', type: 'toggle', label: 'Len ponúkané', test: (r) => r.t.active !== false,
            hint: 'Skryje vypnuté šablóny.' },
        ],
        empty: { ico: 'note', title: 'Zatiaľ žiadne šablóny', sub: 'V databáze zatiaľ nie sú šablóny oslovenia — použije sa predvolený text (migrácia 078 pridá štyri).' },
      };
    },

    templateForm(id) {
      if (!Danubra.isAdmin()) return UI.toast('Šablóny mení administrátor', 'err');
      const t = id ? this.templates.find(x => x.id === id) || {} : { language: 'de', active: true };
      const druh = String(t.key || 'outreach_intro').includes('followup') ? 'followup' : 'intro';
      UI.modal(id ? 'Upraviť šablónu oslovenia' : 'Nová šablóna oslovenia', `<form id="ot-form" onsubmit="event.preventDefault();Outreach.saveTemplate('${id || ''}')">
        <div class="form-grid">
          ${UI.field('title', 'Názov (len pre Vás)', { value: t.title || '', required: true })}
          ${UI.field('kind', 'Na čo', { value: druh, options: [['intro', 'Prvý e-mail'], ['followup', 'Pripomenutie']],
            tip: 'Prvý e-mail = predstavenie. Pripomenutie = krátka správa v tom istom vlákne, keď firma neodpísala.' })}
          ${UI.field('language', 'Jazyk', { value: t.language || 'de', options: [['de', 'Nemecky (Sie)'], ['en', 'Anglicky']] })}
          ${UI.field('active', 'Ponúkať pri oslovení', { type: 'checkbox', value: t.active !== false })}
          <div class="fld-full">${UI.field('subject', 'Predmet', { value: t.subject || '', required: true })}</div>
          <div class="fld-full">${UI.field('body', 'Text', { type: 'textarea', rows: 12, value: t.body || '',
            tip: 'Bez podpisu a pätičky — tie sa pridajú samy. Vykajte (Sie) a píšte krátko: dve-tri vety a jedna otázka.' })}</div>
        </div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
          <button type="submit" class="btn btn-primary">${id ? 'Uložiť' : 'Pridať'}</button></div></form>`, { wide: true });
    },

    async saveTemplate(id) {
      const d = UI.formData(document.getElementById('ot-form'));
      if (!String(d.subject || '').trim() || !String(d.body || '').trim()) return UI.toast('Doplňte predmet a text', 'err');
      const t = id ? this.templates.find(x => x.id === id) || {} : {};
      // Kľúč je jedinečný spolu s jazykom a kanálom — predvolená šablóna má
      // „outreach_intro", ďalšie dostanú poradové číslo.
      const zaklad = `outreach_${d.kind === 'followup' ? 'followup' : 'intro'}`;
      const obsadene = new Set(this.templates.filter(x => x.id !== id && (x.language || 'de') === d.language).map(x => x.key));
      let key = t.key && String(t.key).startsWith(zaklad) && !obsadene.has(t.key) ? t.key : zaklad;
      for (let i = 2; obsadene.has(key); i++) key = `${zaklad}_${i}`;
      const row = { key, title: d.title, language: d.language, channel: 'outreach', audience: 'lead', subject: d.subject, body: d.body,
        active: !!d.active, sort_order: t.sort_order || 200 };
      const { error } = id ? await DB.update('message_templates', id, row) : await DB.insert('message_templates', row);
      if (error) return UI.toast('Neuložené: ' + error.message, 'err');
      UI.closeModal(); UI.toast('Uložené', 'ok');
      await this.ensure(true); Danubra.renderRoute();
    },

    // ── Nastavenia oslovovania ────────────────────────────────────────────
    settingsHtml() {
      const c = this.cfg();
      const admin = Danubra.isAdmin();
      return `<div class="card card-pad">
        <div class="card-head"><div class="card-title">Nastavenia oslovovania${Help.btn('screen.outreach', { size: 13 })}</div></div>
        ${admin ? '' : '<div class="notebox" style="margin:0 0 12px;">Nastavenia mení administrátor.</div>'}
        <form id="os-form" onsubmit="event.preventDefault();Outreach.saveSettings()">
          <div class="form-grid">
            ${UI.field('track_opens', 'Sledovať otvorenie (obrázok v e-maile)', { type: 'checkbox', value: c.track_opens,
              tip: `Do e-mailu sa vloží neviditeľný obrázok 1×1. Keď ho poštový program načíta, zapíše sa otvorenie. ${TRACK_TIP}` })}
            ${UI.field('track_clicks', 'Sledovať kliky na odkazy', { type: 'checkbox', value: c.track_clicks,
              tip: 'Odkazy v e-maile vedú cez našu adresu, ktorá klik zapíše a hneď presmeruje na pôvodnú stránku. Presmeruje len na adresy, ktoré sme do e-mailu dali my (podpísané).' })}
            ${UI.field('daily_limit', 'Denný limit e-mailov', { type: 'number', value: c.daily_limit,
              tip: 'Najviac koľko e-mailov oslovenia odíde za deň (všetci spolu). Chráni schránku pred spamovými filtrami. Rozumné je 20–40.' })}
            ${UI.field('followup_days', 'Pripomenúť sa po (dní)', { type: 'number', value: c.followup_days,
              tip: 'Keď firma neodpíše, po toľkých dňoch vznikne úloha „Pripomenúť sa" (sobota a nedeľa sa posunú na pondelok).' })}
            ${UI.field('max_steps', 'Najviac e-mailov jednej firme', { type: 'number', value: c.max_steps,
              tip: 'Prvý e-mail a pripomenutia spolu. Po poslednom sa už nepripomína — viac by bol nátlak. Odporúčame 2–3.' })}
            <div class="fld-full">${UI.field('portfolio', 'Čo ponúkame (veta do e-mailu, po nemecky)', { type: 'textarea', rows: 3, value: c.portfolio,
              placeholder: 'napr. Aktuell verfügbar: Trockenbauer, Maurer und Schweißer, Einsatz ab 2 Wochen.',
              tip: 'Doplní sa namiesto {portfolio} a AI z neho vychádza pri návrhu. Píšte len to, čo naozaj vieme dodať.' })}</div>
          </div>
          ${admin ? `<div style="display:flex;justify-content:flex-end;margin-top:12px;"><button type="submit" class="btn btn-primary btn-sm">${Icon('check')} Uložiť</button></div>` : ''}
        </form>
        <div class="regimebox" style="margin-top:12px;">${UI.esc(LEGAL)}</div>
      </div>`;
    },

    async saveSettings() {
      if (!Danubra.isAdmin()) return UI.toast('Nastavenia mení administrátor', 'err');
      const f = document.getElementById('os-form');
      const d = UI.formData(f);
      const outreach = OO().settings({ outreach: {
        track_opens: !!d.track_opens, track_clicks: !!d.track_clicks, daily_limit: d.daily_limit,
        followup_days: d.followup_days, max_steps: d.max_steps, portfolio: d.portfolio || '' } });
      const row = Danubra.cfgRow || {};
      if (!row.id) return UI.toast('Nastavenia firmy sa nenačítali — otvorte najprv Nastavenia', 'err');
      const { error } = await DB.update('settings', row.id, { marketing: { ...Danubra.cfg('marketing'), outreach } });
      if (error) return UI.toast('Neuložené: ' + error.message, 'err');
      // Overiť, že sa to naozaj uložilo (zápis smie len administrátor — 030).
      const fresh = await Danubra.loadCfg(true);
      const ulozene = OO().settings(fresh && fresh.marketing);
      if (JSON.stringify(ulozene) !== JSON.stringify(outreach)) return UI.toast('Neuložilo sa to — v databáze zostali staré hodnoty', 'err');
      UI.toast('Uložené', 'ok');
      Danubra.renderRoute();
    },
  };

  window.Outreach = Outreach;
  Danubra.views.outreach = function (el) { return Outreach.view(el); };
})();
