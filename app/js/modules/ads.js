// ============================================================================
// DANUBRA — Inzeráty
// ============================================================================
// Prvá vec, ktorú treba pri telefonáte vedieť, nie je meno. Je to **na ktorý
// inzerát človek volá**. Od toho sa odvíja zvyšok hovoru: aké remeslo, do
// akého mesta, akú sadzbu sme sľúbili a na čo sa treba pýtať.
//
// Preto tu nie je len zoznam textov, ale aj to, čo inzerát sľuboval. Keď sa
// o mesiac na stavbe povie „veď ste písali 18 €", musí byť po ruke, čo tam
// naozaj bolo — v znení, v akom to bežalo.
//
// Druhá vec, ktorú to rieši: **ktorý inzerát prináša ľudí.** Bez toho sa za
// dosah platí naslepo.
// ============================================================================
(function () {
  const A = () => window.DanubraAds;

  const Ads = {
    items: [], perf: [], trades: [], plans: [], subcontracts: [], loaded: false,
    filters: { q: '', channel: '', state: 'running' },

    async load() {
      const [a, p, t, pl, s] = await Promise.all([
        DB.list('ads', { order: { column: 'created_at', ascending: false }, limit: 300 }),
        DB.list('v_ad_performance', { limit: 300 }),
        DB.list('trades', { select: 'key,name_sk', limit: 100 }),
        DB.list('recruitment_plans', { select: 'id,title,trade_key,city,status', limit: 200 }),
        DB.list('subcontracts', { select: 'id,title,site_city,status', limit: 200 }),
      ]);
      this.items = a.data || []; this.perf = p.data || [];
      this.trades = t.data || []; this.plans = pl.data || [];
      this.subcontracts = s.data || [];
      this.loaded = true;
    },

    perfOf(id) { return A().performance(this.perf.find(x => x.id === id) || {}); },
    tradeName(key) {
      const t = this.trades.find(x => x.key === key);
      return t ? t.name_sk : (key || '');
    },

    /** Čo je po filtroch vidieť. Export aj zoznam berú to isté. */
    rows() {
      const f = this.filters;
      const today = new Date().toISOString().slice(0, 10);
      const withState = this.items.map(x => ({
        ...x,
        running: A().isRunning(x, today),
        trade_name: this.tradeName(x.trade_key),
      }));
      const byState = f.state === 'running' ? withState.filter(x => x.running)
        : (f.state === 'ended' ? withState.filter(x => !x.running) : withState);
      return Shell.filterRows(byState, {
        q: f.q,
        fields: ['title', 'channel_detail', 'city', 'trade_name', 'body'],
        equals: { channel: f.channel },
      });
    },

    setF(k, v) { this.filters[k] = v; Danubra.renderRoute(); },

    exportCsv() {
      Shell.exportCsv(this.rows(), [
        ['Inzerát', x => x.title],
        ['Kanál', x => A().channelLabel(x.channel)],
        ['Kde', x => x.channel_detail],
        ['Remeslo', x => x.trade_name],
        ['Mesto', x => x.city],
        ['Sadzba €/h', x => DanubraExport.num(x.rate_offered)],
        ['Beží', x => (x.running ? 'áno' : 'nie')],
        ['Od', x => x.starts_on],
        ['Do', x => x.ends_on],
        ['Ozvalo sa', x => this.perfOf(x.id).candidates],
        ['Ozvali sme sa', x => this.perfOf(x.id).contacted],
        ['Nastúpilo', x => this.perfOf(x.id).hired],
      ], ['inzeraty']);
    },

    async view(el) {
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const rows = this.rows();

      const card = (x) => {
        const p = this.perfOf(x.id);
        const promise = A().promiseLines(x);
        return `
          <div class="card card-pad list-card ad-card${x.running ? ' is-running' : ''}"
               onclick="Ads.detail('${x.id}')">
            <div class="card-head">
              <div class="card-title">${UI.esc(x.title)}</div>
              ${x.running ? UI.badge('beží', 'green') : UI.badge('dobehol', 'gray')}
            </div>
            <div class="meta-row">
              <span>${Icon('marketing', 14)} ${UI.esc(A().channelLabel(x.channel))}${
                x.channel_detail ? ' · ' + UI.esc(x.channel_detail) : ''}</span>
              ${x.trade_name ? `<span>${Icon('wrench', 14)} ${UI.esc(x.trade_name)}</span>` : ''}
              ${x.city ? `<span>${Icon('pin', 14)} ${UI.esc(x.city)}</span>` : ''}
              ${x.rate_offered ? `<span>${Icon('euro', 14)} ${
                UI.esc(String(x.rate_offered).replace('.', ','))} €/h</span>` : ''}
            </div>
            ${promise.length ? `<div class="ad-promise">
              ${promise.map(t => `<span>${UI.esc(t)}</span>`).join('')}</div>` : ''}
            <div class="ad-perf">
              <div><b>${p.candidates}</b><span>ozvalo sa</span></div>
              <div><b>${p.contacted}</b><span>ozvali sme sa</span></div>
              <div><b>${p.hired}</b><span>nastúpilo</span></div>
              ${p.contactRate != null ? `<div class="${p.contactRate < 100 ? 'ad-warn' : ''}">
                <b>${p.contactRate} %</b><span>stihnuté</span></div>` : ''}
            </div>
          </div>`;
      };

      Danubra.setActions(
        `<button class="btn btn-primary btn-sm" onclick="Ads.form()">${Icon('plus')} Nový inzerát</button>`);
      el.innerHTML = Danubra.header(Danubra.labelOf('ads'),
        'Na čo ľudia volajú — a čo sme im v tom sľúbili')
        + Shell.list({
          rows, total: this.items.length, render: card, layout: 'cards',
          emptyIcon: 'marketing', emptyTitle: 'Zatiaľ žiadny inzerát',
          emptySub: 'Založ inzerát skôr, než ho vyvesíš — hovor sa potom začína tým, '
            + 'na čo človek volá, nie otázkou „a čo hľadáte?".',
          emptyHtml: null,
          filter: {
            search: { value: this.filters.q, placeholder: 'Hľadať názov, skupinu, mesto, text…',
              oninput: 'Ads.setF("q", this.value)' },
            selects: [
              { value: this.filters.state, label: 'Stav',
                onchange: 'Ads.setF("state", this.value)',
                options: [['running', 'Bežiace'], ['ended', 'Dobehnuté'], ['', 'Všetky']] },
              { value: this.filters.channel, label: 'Kanál',
                onchange: 'Ads.setF("channel", this.value)',
                options: [['', 'Všetky kanály'], ...A().CHANNELS] },
            ],
            exportCsv: 'Ads.exportCsv()',
          },
        });
    },

    detail(id) {
      const x = this.items.find(i => i.id === id);
      if (!x) return UI.toast('Nenájdené', 'err');
      const p = this.perfOf(id);
      const promise = A().promiseLines(x);

      UI.modal(x.title, `
        <div class="detail-head">
          ${A().isRunning(x) ? UI.badge('beží', 'green') : UI.badge('dobehol', 'gray')}
          <span style="color:var(--ink-mute);font-size:12.5px;">
            ${UI.esc(A().subtitle(x))}</span>
        </div>

        <div class="kv" style="margin:12px 0;">
          <div><span>Ozvalo sa</span><strong>${p.candidates}</strong></div>
          <div><span>Ozvali sme sa</span><strong>${p.contacted}${
            p.contactRate != null ? ` (${p.contactRate} %)` : ''}</strong></div>
          <div><span>Nastúpilo</span><strong>${p.hired}</strong></div>
          <div><span>Beží</span><strong>${x.starts_on ? UI.date(x.starts_on) : 'odkedy'} – ${
            x.ends_on ? UI.date(x.ends_on) : 'dokedy'}</strong></div>
        </div>

        ${promise.length ? `<div class="form-section">Čo sme sľúbili</div>
          <div class="ad-promise">${promise.map(t => `<span>${UI.esc(t)}</span>`).join('')}</div>
          <p style="font-size:12px;color:var(--ink-mute);margin:6px 0 0;">
            Toto je vidieť počas celého hovoru. Nesľubuj nič, čo tu nie je.</p>` : ''}

        ${x.body ? `<div class="form-section">Znenie inzerátu</div>
          <pre class="ad-body">${UI.esc(x.body)}</pre>` : ''}
        ${x.url ? `<p style="margin:10px 0 0;"><a href="${UI.esc(x.url)}"
          target="_blank" rel="noopener noreferrer">${Icon('chevron', 13)} Otvoriť inzerát</a></p>` : ''}
        ${x.note ? `<p style="margin:10px 0 0;color:var(--ink-sub);font-size:13px;">${UI.esc(x.note)}</p>` : ''}

        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="Ads.toggle('${x.id}')">
            ${Icon(x.active ? 'x' : 'check', 14)} ${x.active ? 'Ukončiť inzerát' : 'Znova spustiť'}</button>
          <button class="btn btn-primary" onclick="Ads.form('${x.id}')">
            ${Icon('edit', 14)} Upraviť</button>
        </div>`, { wide: true });
    },

    form(id) {
      const x = id ? this.items.find(i => i.id === id) || {} : {};
      UI.modal(id ? 'Upraviť inzerát' : 'Nový inzerát', `
        <form id="ad-form" onsubmit="event.preventDefault();Ads.save('${id || ''}')">
          <div class="form-grid">
            ${UI.field('title', 'Názov (interný)', { value: x.title, required: true,
              placeholder: 'Murári Stuttgart — FB skupina' })}
            ${UI.field('channel', 'Kanál', { value: x.channel || 'facebook',
              options: A().CHANNELS })}
            ${UI.field('channel_detail', 'Kde presne', { value: x.channel_detail,
              placeholder: 'Práca v Nemecku — skupina' })}
            ${UI.field('url', 'Odkaz na inzerát', { value: x.url, placeholder: 'https://…' })}
            ${UI.field('trade_key', 'Remeslo', { value: x.trade_key,
              options: [['', 'viac remesiel'], ...this.trades.map(t => [t.key, t.name_sk])] })}
            ${UI.field('city', 'Mesto', { value: x.city })}
            ${UI.field('rate_offered', 'Sľúbená sadzba €/h', { type: 'number', value: x.rate_offered })}
            ${UI.field('plan_id', 'Náborový plán', { value: x.plan_id,
              options: [['', '— žiadny —'], ...this.plans.filter(p => p.status === 'active')
                .map(p => [p.id, p.title])] })}
            ${UI.field('subcontract_id', 'Zákazka', { value: x.subcontract_id,
              options: [['', '— žiadna —'], ...this.subcontracts.filter(s => s.status === 'active')
                .map(s => [s.id, s.title])] })}
            ${UI.field('starts_on', 'Beží od', { type: 'date', value: x.starts_on })}
            ${UI.field('ends_on', 'Beží do', { type: 'date', value: x.ends_on })}
          </div>

          <div class="form-section">Čo inzerát sľubuje</div>
          <p style="font-size:12.5px;color:var(--ink-mute);margin:0 0 8px;">
            Jeden sľub na riadok. Počas hovoru je to vpravo na očiach, aby sa
            nesľúbilo niečo iné, než čo bolo v inzeráte.</p>
          ${UI.field('promise', '', { type: 'textarea', rows: 4,
            value: (x.promise || []).join('\n'),
            placeholder: 'ubytovanie platíme\nvýplata do 10. dňa\ndoprava zo Slovenska' })}

          <div class="form-section">Presné znenie</div>
          ${UI.field('body', '', { type: 'textarea', rows: 6, value: x.body,
            placeholder: 'Skopíruj sem text inzerátu tak, ako beží.' })}
          ${UI.field('note', 'Interná poznámka', { type: 'textarea', rows: 2, value: x.note })}

          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">Uložiť</button>
          </div>
        </form>`, { wide: true });
    },

    async save(id) {
      const d = UI.formData(document.getElementById('ad-form'));
      if (!d.title) return UI.toast('Názov je povinný', 'err');
      const payload = {
        ...d,
        rate_offered: d.rate_offered === '' ? null : Number(d.rate_offered),
        plan_id: d.plan_id || null,
        subcontract_id: d.subcontract_id || null,
        trade_key: d.trade_key || null,
        starts_on: d.starts_on || null,
        ends_on: d.ends_on || null,
        promise: String(d.promise || '').split('\n').map(s => s.trim()).filter(Boolean),
      };
      const { error } = id
        ? await DB.update('ads', id, payload)
        : await DB.insert('ads', payload);
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal();
      UI.toast(id ? 'Inzerát upravený' : 'Inzerát založený', 'ok');
      this.loaded = false;
      Danubra.renderRoute();
    },

    /**
     * Dobehnutý inzerát sa vypína, nie maže. Kandidáti, ktorí sa naň ozvali,
     * musia zostať naviazaní na to, čo čítali.
     */
    async toggle(id) {
      const x = this.items.find(i => i.id === id);
      if (!x) return;
      const { error } = await DB.update('ads', id, { active: !x.active });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      UI.closeModal();
      UI.toast(x.active ? 'Inzerát ukončený' : 'Inzerát znova beží', 'ok');
      this.loaded = false;
      Danubra.renderRoute();
    },
  };

  window.Ads = Ads;
  Danubra.views.ads = function (el) { return Ads.view(el); };
})();
