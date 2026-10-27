// ============================================================================
// DANUBRA — Papiere na dva kliky
// ============================================================================
// „Chcem mať všetko na pár klikov — a keď mám zvoleného živnostníka, nech mi
// údaje prehodí do zmluvy, objednávky, GDPR."
//
// Papiere boli rozhodené po obrazovkách: súhlas a zmluva na karte človeka,
// objednávka na Zákazke, infolist pri nasadení, rámcová zmluva s Nemcom pri
// odberateľovi. Kto chcel papier, musel vedieť, kde ho hľadať.
//
// Tu je to opačne: **vyber papier, vyber človeka (alebo firmu) a je hotový.**
// Údaje sa berú z karty človeka; keď niečo chýba, appka sa na to spýta raz,
// uloží to k nemu a papier otvorí (`Wrk.doplnit`).
//
// Tlačidlo „Papiere" je v hornom pruhu na každej obrazovke.
// ============================================================================
(function () {
  // Poradie je poradie krokov: najprv papiere s Nemcom (3), potom so
  // živnostníkom (4–6). Číslo pri papieri je to isté ako v menu.
  const DOCS = [
    { key: 'rahmen', who: 'partner', ico: 'note', krok: 3,
      title: 'Rámcová zmluva s Nemcom', sub: 'Dvojjazyčne SK/DE, s odberateľom.' },
    { key: 'bestellung', who: 'order', ico: 'orders', krok: 3,
      title: 'Objednávka od Nemca SK/DE', sub: 'Konkrétna objednávka k rámcovej zmluve.' },
    { key: 'gdpr', who: 'worker', ico: 'shield', krok: 4,
      title: 'Súhlas GDPR', sub: 'Živnostník podpíše, že smieme držať jeho údaje.' },
    { key: 'zmluva', who: 'worker', ico: 'doc', krok: 5,
      title: 'Rámcová zmluva o dielo', sub: 'So živnostníkom, zvyčajne do konca roka.' },
    { key: 'objednavka', who: 'worker', ico: 'orders', krok: 6,
      title: 'Objednávka živnostníkovi', sub: 'Na konkrétnu zákazku — čo má urobiť a za koľko.' },
    { key: 'infolist', who: 'worker', ico: 'pin', krok: 6,
      title: 'Infolist na stavbu', sub: 'Kam prísť, kedy, za kým a kde bude spať.' },
    // List na hodiny na týždeň — podpíše ho majster, podľa neho sa fakturuje.
    { key: 'stundennachweis', who: 'subcontract', ico: 'clock', krok: 7,
      title: 'Prázdny Stundennachweis', sub: 'List na hodiny na týždeň s menami ľudí zo stavby.' },
    // Všetko k nástupu v jednej správe — e-mailom, cez WhatsApp alebo SMS.
    { key: 'balik', who: 'worker', ico: 'mail', krok: 6,
      title: 'Všetko naraz na nástup', sub: 'Infolist na stavbu aj k ubytovaniu, objednávka a vzor faktúry v jednej správe.' },
  ];

  const Pap = {
    DOCS,
    doc: null, q: '',

    /** Prvé okno: aký papier. */
    open() {
      const dostupne = DOCS.filter(d => this.available(d));
      UI.modal('Pripraviť papier', `
        <p class="modal-lead">Vyberte papier. Potom vyberiete, pre koho je — údaje sa
          doplnia samy z jeho karty.</p>
        <div class="pick-list">
          ${dostupne.map(d => `
            <button class="pick-tile" onclick="Pap.pick('${d.key}')">
              <span class="pick-ico">${Icon(d.ico, 20)}</span>
              <span class="pick-txt">
                <b>${UI.esc(d.title)}</b>
                <em>${UI.esc(d.sub)}</em>
              </span>
              <span class="pap-krok" title="Krok ${d.krok} zo 7">${d.krok}</span>
            </button>`).join('')}
        </div>`, { wide: true });
    },

    available(d) {
      if (d.who === 'worker') return !!window.Wrk && Danubra.routeAvailable('workers');
      if (d.who === 'subcontract') return !!window.HourEntry && Danubra.routeAvailable('subcontracts');
      if (d.who === 'partner') return !!window.Prt && Danubra.routeAvailable('partners');
      if (d.who === 'order') return !!window.Ord && Danubra.routeAvailable('orders');
      return false;
    },

    /** Druhé okno: pre koho. Zoznam sa dá prehľadať. */
    async pick(key) {
      this.doc = DOCS.find(d => d.key === key);
      this.q = '';
      if (!this.doc) return;
      // Stundennachweis patrí zákazke a týždňu — vyberá sa v okne hodín,
      // ktoré má tlačidlo „Prázdny list na tlač".
      if (this.doc.who === 'subcontract') { UI.closeModal(); return HourEntry.open(); }
      const mod = { worker: window.Wrk, partner: window.Prt, order: window.Ord }[this.doc.who];
      if (mod && !mod.loaded) {
        UI.modal(this.doc.title, UI.loading());
        await mod.load();
      }
      const kto = { worker: 'živnostníka', partner: 'odberateľa', order: 'objednávku' }[this.doc.who];
      UI.modal(this.doc.title, `
        <label class="kpi-search pap-search">
          ${Icon('search', 14)}
          <input type="search" id="pap-q" placeholder="Hľadať ${kto}…" autocomplete="off"
            oninput="Pap.setQ(this.value)">
        </label>
        <div id="pap-list" class="pap-list"></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="Pap.open()">${Icon('back', 14)} Iný papier</button>
        </div>`, { wide: true });
      this.paint();
      setTimeout(() => { const i = document.getElementById('pap-q'); if (i) i.focus(); }, 30);
    },

    setQ(v) { this.q = v; this.paint(); },

    rows() {
      const q = String(this.q || '').trim().toLowerCase();
      const has = (parts) => !q || parts.filter(Boolean).join(' ').toLowerCase().includes(q);
      if (this.doc.who === 'worker') {
        return Wrk.items
          .filter(w => !['inactive', 'blacklist'].includes(w.status))
          .filter(w => has([w.full_name, w.city, w.phone, w.company_id]))
          .map(w => ({ id: w.id, title: w.full_name,
            sub: [Wrk.professionLabel(w.profession), w.city].filter(Boolean).join(' · '),
            extra: Wrk.stepChips(w), avatar: Wrk.avatar(w, 34) }));
      }
      if (this.doc.who === 'partner') {
        return Prt.items.filter(p => has([p.name, p.city, p.ust_idnr]))
          .map(p => ({ id: p.id, title: p.name,
            sub: [p.city, p.ust_idnr].filter(Boolean).join(' · ') }));
      }
      return Ord.rows.filter(o => o.kind === 'customer')
        .filter(o => has([o.order_number, o.title, Ord.partnerOf(o.partner_id).name]))
        .map(o => ({ id: o.id, title: `${o.order_number || 'Objednávka'} · ${o.title || ''}`,
          sub: Ord.partnerOf(o.partner_id).name || '' }));
    },

    paint() {
      const el = document.getElementById('pap-list');
      if (!el) return;
      const rows = this.rows();
      el.innerHTML = rows.length ? rows.map(r => `
        <button class="pap-row" onclick="Pap.run('${r.id}')">
          ${r.avatar || `<span class="pap-row-ico">${Icon(this.doc.ico, 16)}</span>`}
          <span class="pap-row-txt">
            <b>${UI.esc(r.title)}</b>
            ${r.sub ? `<em>${UI.esc(r.sub)}</em>` : ''}
            ${r.extra || ''}
          </span>
          <span class="pap-row-go">${Icon('chevron', 16)}</span>
        </button>`).join('')
        : `<div class="js-empty">${this.q ? 'Nič tomu nesedí.' : (this.doc.who === 'order'
          ? 'Zatiaľ žiadna objednávka od odberateľa. Založíte ju na Zákazkách → Objednávky.'
          : 'Zatiaľ tu nikto nie je.')}</div>`;
    },

    /** Otvorí papier pre vybraného. Údaje dopĺňa modul, ktorý ich drží. */
    run(id) {
      const k = this.doc && this.doc.key;
      // Výber sa zavrie; keď papieru chýba údaj, otvorí sa namiesto neho
      // krátky formulár (`Wrk.doplnit`).
      UI.closeModal();
      if (k === 'gdpr') return Wrk.gdpr(id);
      if (k === 'zmluva') return Wrk.zmluva(id);
      if (k === 'objednavka') return Wrk.paperOrder(id);
      if (k === 'infolist') return Wrk.paperSiteSheet(id);
      if (k === 'balik') return Wrk.bundle(id);
      if (k === 'rahmen') return Prt.rahmen(id);
      if (k === 'bestellung') return Ord.bestellung(id);
    },
  };

  window.Pap = Pap;
})();
