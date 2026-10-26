// ============================================================================
// DANUBRA — Zálohy a výplaty živnostníkom
// ============================================================================
// „Keď si otvorím človeka a chce zálohu alebo niečo potrebuje zaplatiť, aby
// som to rýchlo vedel zaznamenať." Zálohy boli schované na karte človeka
// v záložke Peniaze a to, čo mu dlhujeme, v Prijatých faktúrach.
//
// Táto obrazovka (Fakturácia → Zálohy a výplaty) ukazuje oboje naraz za
// všetkých ľudí: komu sme dali zálohu, ktorá ešte nie je odpočítaná z faktúry,
// a koho faktúra čaká na výplatu. Zapisuje sa cez `Wrk.payMenu()` — to isté
// okno je aj na karte človeka a v zákazke pri jeho mene.
// ============================================================================
(function () {
  const Adv = {
    advances: [], bills: [], workers: [], loaded: false, q: '',

    async load() {
      const [a, b, w] = await Promise.all([
        DB.list('advances', { order: { column: 'paid_on', ascending: false }, limit: 2000 }),
        DB.list('bills', { select: 'id,worker_id,status,amount,due_date,bill_number,supplier_name,category', limit: 2000 }),
        DB.list('workers', { select: 'id,full_name,phone,bank_iban,status', limit: 1000 }),
      ]);
      this.advances = a.data || []; this.bills = b.data || []; this.workers = w.data || [];
      this.loaded = true;
    },

    nameOf(id) { return (this.workers.find(w => w.id === id) || {}).full_name || '—'; },
    open(a) { return a && !a.voided_at && !a.settled_at; },

    /** Po ľuďoch: nevyrovnané zálohy a schválené, nezaplatené faktúry. */
    perWorker() {
      const by = new Map();
      const row = (id) => {
        if (!by.has(id)) by.set(id, { id, name: this.nameOf(id), adv: [], bills: [], advCents: 0, billCents: 0 });
        return by.get(id);
      };
      for (const a of this.advances.filter(x => this.open(x) && x.worker_id)) {
        const r = row(a.worker_id); r.adv.push(a); r.advCents += Money.toCents(a.amount);
      }
      for (const b of this.bills.filter(x => x.worker_id && x.status === 'approved')) {
        const r = row(b.worker_id); r.bills.push(b); r.billCents += Money.toCents(b.amount);
      }
      return [...by.values()].map(r => ({ ...r, owed: r.billCents - r.advCents }))
        .sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name, 'sk'));
    },

    setQ(v) { this.q = v; Danubra.renderRoute(); },

    async view(el) {
      Danubra.setActions(`<button class="btn btn-primary btn-sm" onclick="Adv.pickWorker()">${Icon('plus')} Záloha / platba</button>`);
      if (!this.loaded) { el.innerHTML = UI.loading(); await this.load(); }
      const ludia = this.perWorker();
      const q = String(this.q || '').trim().toLowerCase();
      const vidno = ludia.filter(r => !q || r.name.toLowerCase().includes(q));
      const zalohy = ludia.reduce((s, r) => s + r.advCents, 0);
      const dlh = ludia.reduce((s, r) => s + Math.max(0, r.owed), 0);
      const posledne = this.advances.filter(a => !a.voided_at).slice(0, 12);

      el.innerHTML = Danubra.header(Danubra.labelOf('advances'),
        `Zálohy nevyrovnané ${Money.format(zalohy)} · na výplatu ${Money.format(dlh)}`) + `
        <div class="mon-acts" style="grid-template-columns:repeat(3,minmax(0,1fr));">
          <button class="mon-act is-main" onclick="Adv.pickWorker('advance')"><span class="pick-ico">${Icon('wallet', 18)}</span>
            <b>Dať zálohu</b><em>Hotovosť alebo prevod — odpočíta sa z jeho najbližšej faktúry</em></button>
          <button class="mon-act" onclick="Adv.pickWorker('expense')"><span class="pick-ico">${Icon('receipt', 18)}</span>
            <b>Preplatiť výdavok</b><em>Kúpil materiál, benzín, náradie — vrátime mu to</em></button>
          <button class="mon-act" onclick="Danubra.go('bank');setTimeout(()=>window.Bank&&Bank.payForm(),350)"><span class="pick-ico">${Icon('euro', 18)}</span>
            <b>Vyplatiť faktúry</b><em>Príkaz na úhradu pre banku za všetkých naraz</em></button>
        </div>

        <div class="card card-pad">
          <div class="card-head"><div class="card-title">Kto čo od nás má dostať${Help.btn('card.adv.list', { size: 13 })}</div>
            <input type="search" class="arch-q" placeholder="Hľadať meno…" value="${UI.esc(this.q)}" onchange="Adv.setQ(this.value)"></div>
          ${vidno.length ? vidno.map(r => `
            <div class="adv-row">
              <div class="adv-who">${Danubra.link('worker', r.id, r.name, { inline: true })}
                <span>${r.bills.length ? `${r.bills.length} ${Shell.plural(r.bills.length, 'faktúra', 'faktúry', 'faktúr')} ${Money.format(r.billCents)}` : 'bez faktúry'}${
                  r.advCents ? ` · zálohy ${Money.format(r.advCents)}` : ''}</span></div>
              <b class="adv-sum${r.owed < 0 ? ' is-neg' : ''}">${r.owed < 0 ? `preplatené ${Money.format(-r.owed)}${
                UI.tip('Preplatené = na zálohách dostal viac, než sú jeho schválené faktúry. Rozdiel sa '
                  + 'odpočíta z jeho ďalšej faktúry.')}` : Money.format(r.owed)}</b>
              <button class="btn btn-outline btn-sm" onclick="Wrk.payMenu('${r.id}')">${Icon('plus', 14)} Záloha / platba</button>
            </div>`).join('')
            : '<div class="js-empty">Nikto nemá nevyrovnanú zálohu ani faktúru na výplatu.</div>'}
          <p class="card-note">Suma = schválené faktúry mínus zálohy, ktoré ešte neboli odpočítané.
            Záloha sa nemaže — omyl sa ruší s dôvodom na karte človeka.</p>
        </div>

        <div class="card card-pad" style="margin-top:12px;">
          <div class="card-head"><div class="card-title">Posledné zálohy${Help.btn('screen.advances', { size: 13 })}</div></div>
          ${posledne.length ? posledne.map(a => `<div class="adv-row">
            <div class="adv-who">${Danubra.link('worker', a.worker_id, this.nameOf(a.worker_id), { inline: true })}
              <span>${UI.date(a.paid_on)} · ${UI.esc(Enums.label('advance_method', a.method) || a.method || '')}${a.note ? ` · ${UI.esc(a.note)}` : ''}</span></div>
            <b class="adv-sum">${Money.format(Money.toCents(a.amount))}</b>
            ${a.settled_at ? UI.badge('odpočítaná', 'green') + UI.tip('Záloha je už odpočítaná z jeho faktúry — vyrovnané.')
              : UI.badge('nevyrovnaná', 'amber') + UI.tip('Zálohu dostal, ale ešte sa neodpočítala z jeho faktúry. '
                + 'Odpočíta sa z najbližšej.')}
          </div>`).join('') : '<div class="js-empty">Zatiaľ žiadne zálohy.</div>'}
        </div>`;
    },

    /** Vyber človeka a hneď otvor, čo s ním treba spraviť. */
    async pickWorker(what) {
      if (!this.loaded) await this.load();
      const aktivni = this.workers.filter(w => !['inactive', 'blacklist'].includes(w.status));
      UI.modal(what === 'expense' ? 'Komu preplatiť výdavok?' : 'Komu?', `
        <label class="kpi-search pick-search">${Icon('search', 15)}<input type="search" placeholder="Hľadať meno…" aria-label="Hľadať meno"
          oninput="document.querySelectorAll('#adv-pick .pick-tile').forEach(b=>b.hidden=!b.dataset.n.includes(this.value.toLowerCase()))"></label>
        <div class="pick-list" id="adv-pick">${aktivni.map(w => `
          <button class="pick-tile" data-n="${UI.esc(String(w.full_name || '').toLowerCase())}"
            onclick="UI.closeModal();${what ? `Wrk.payDo('${w.id}','${what}')` : `Wrk.payMenu('${w.id}')`}">
            <span class="pick-ico">${Icon('user', 18)}</span>
            <span class="pick-txt"><b>${UI.esc(w.full_name)}</b><em>${UI.esc(w.phone || '')}</em></span>
            <span class="pick-go">${Icon('chevron', 16)}</span></button>`).join('') || '<div class="js-empty">Zatiaľ žiadni ľudia.</div>'}</div>`, { wide: true });
    },
  };

  window.Adv = Adv;
  Danubra.views.advances = function (el) { return Adv.view(el); };
})();
