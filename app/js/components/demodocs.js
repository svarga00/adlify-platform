// ============================================================================
// DANUBRA — dokumenty k vzorovým dátam jedným klikom
// ============================================================================
// „Tie staré dokumenty nie sú tiež vybavené." Vzorové dáta sa vkladajú cez
// databázu, ale PDF vie vyrobiť len prehliadač (rovnako ako tlačidlo PDF
// v okne dokumentu). Toto prejde vzorové záznamy a ku každému vyrobí jeho
// papiere v aktuálnom vzhľade — tými istými funkciami, ktoré appka používa
// pri bežnej tlači. Okná sa neotvárajú: dokument sa vykreslí v neviditeľnom
// ráme (`Docs.renderPdf`) a uloží sa do Dokumentov.
//
// Robí to **len** pre riadky zapísané v evidencii vzorových dát
// (danubra_demo_ledger) — ostrých záznamov sa to nedotkne.
// ============================================================================
(function () {
  const DemoDocs = {
    running: false,

    /** Id vzorových riadkov po tabuľkách: { 'danubra_workers': Set(...) } */
    async ledger() {
      const { data } = await DB.list('demo_ledger', { select: 'table_name,row_id', limit: 5000 });
      const out = {};
      for (const r of data || []) (out[r.table_name] = out[r.table_name] || new Set()).add(r.row_id);
      return out;
    },

    async run() {
      if (this.running) return;
      if (!Danubra.supplierReady('Dokumenty k vzorovým dátam')) return;
      const ok = await UI.confirm('Vyrobiť PDF ku všetkým vzorovým záznamom?', {
        hint: 'Súhlasy GDPR, zmluvy, objednávky, infolisty, vzory faktúr, ponuky a faktúry — v novom vzhľade. '
          + 'Uložia sa do Dokumentov. Trvá to pár minút; nechajte okno otvorené.',
        ok: 'Vyrobiť', danger: false });
      if (!ok) return;
      this.running = true;

      // Kým to beží, `window.open` a `Docs.show` z modulov nevytvárajú okná:
      // každý dokument sa len zaradí do fronty a vykreslí sa neviditeľne.
      const fake = { document: { open() {}, write() {}, close() {} }, close() {}, focus() {}, closed: false };
      const queue = [];
      const origOpen = window.open;
      const origShow = Docs.show;
      window.open = () => fake;
      Docs.show = function (okno, html, meta) {
        if (okno === fake || !okno) { queue.push({ html, meta }); return fake; }
        return origShow.call(Docs, okno, html, meta);
      };

      let made = 0, failed = 0;
      const bar = document.createElement('div');
      bar.className = 'demo-progress';
      document.body.appendChild(bar);
      const say = (t) => { bar.textContent = t; };
      const drain = async () => {
        while (queue.length) {
          const { html, meta } = queue.shift();
          say(`Vyrábam: ${meta.title || meta.kind}${meta.who ? ` — ${meta.who}` : ''} (hotových ${made})`);
          try {
            const { row } = await Docs.renderPdf(html, meta);
            if (row) made++; else failed++;
          } catch (e) { failed++; console.warn('[demo] PDF', meta && meta.kind, e); }
        }
      };
      const job = async (fn) => {
        try { await fn(); } catch (e) { failed++; console.warn('[demo] dokument', e); }
        // Zatvoriť prípadné okno „Chýbajú údaje" — v dávke ho nikto nevyplní.
        UI.closeModal();
        await drain();
      };
      const loadMod = async (M) => { if (M && typeof M.load === 'function') { M.loaded = false; await M.load(); } };

      try {
        say('Načítavam vzorové záznamy…');
        const L = await this.ledger();
        const is = (t, id) => !!(L[`danubra_${t}`] && L[`danubra_${t}`].has(id));

        if (window.Wrk) {
          await loadMod(Wrk);
          for (const w of Wrk.items.filter(x => is('workers', x.id) && x.legal_form !== 'employee')) {
            await job(() => Wrk.gdpr(w.id));
            await job(() => Wrk.zmluva(w.id));
          }
        }
        if (window.Sub) {
          await loadMod(Sub);
          const today = new Date().toISOString().slice(0, 10);
          for (const a of Sub.assignments.filter(x => is('assignments', x.id) && (!x.date_to || x.date_to >= today))) {
            await job(() => Sub.siteSheet(a.id));
            if (window.Bundle) {
              await job(async () => {
                Bundle.ctx = await Bundle.gather(a.id);
                for (const k of ['ubytovanie', 'vzor_faktury']) {
                  if (k === 'ubytovanie' && !Bundle.ctx.lodging) continue;
                  const p = Bundle.paper(k);
                  if (p) queue.push(p);
                }
              });
            }
          }
        }
        if (window.Ord) {
          await loadMod(Ord);
          for (const o of (Ord.rows || []).filter(x => is('work_orders', x.id))) {
            await job(() => (o.kind === 'customer' && Ord.bestellung ? Ord.bestellung(o.id) : Ord.document(o.id)));
          }
        }
        if (window.Prt) {
          await loadMod(Prt);
          for (const p of Prt.items.filter(x => is('partners', x.id))) await job(() => Prt.rahmen(p.id));
        }
        if (window.Quo) {
          await loadMod(Quo);
          for (const q of Quo.items.filter(x => is('quotes', x.id))) await job(() => Quo.document(q.id));
        }
        if (window.Con) {
          await loadMod(Con);
          for (const c of Con.items.filter(x => is('contracts', x.id))) await job(() => Con.document(c.id));
        }
        if (window.Inv) {
          await loadMod(Inv);
          for (const i of Inv.items.filter(x => is('invoices', x.id) && x.partner_id)) {
            await job(() => (Inv.openDocV2 ? Inv.openDocV2(i.id) : Inv.openDoc(i.id)));
          }
        }
      } finally {
        window.open = origOpen;
        Docs.show = origShow;
        bar.remove();
        this.running = false;
      }
      if (window.Docs) await Docs.load(true);
      UI.toast(`Hotovo: ${made} ${made === 1 ? 'dokument' : made < 5 ? 'dokumenty' : 'dokumentov'} v Dokumentoch`
        + (failed ? ` · ${failed} sa nepodarilo (chýbajú im údaje)` : ''), failed ? 'warn' : 'ok');
      Danubra.renderRoute();
    },
  };

  window.DemoDocs = DemoDocs;
})();
