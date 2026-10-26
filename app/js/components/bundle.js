// ============================================================================
// DANUBRA — „Poslať všetko naraz": balík papierov pre živnostníka
// ============================================================================
// „Vedieť to nejak zlúčiť, aby nedostal 5 mailov zvlášť o ubytovaní, stavbe,
// infolist, vzor faktúry atď." Jedno okno, v ktorom sa zaškrtne, čo má ísť,
// a vyberie sa cesta (e-mail, WhatsApp, SMS — aj viac naraz):
//
//   * e-mail: jedna správa, všetky PDF ako prílohy (otvorí sa na kontrolu
//     v Správach a odošle sa z firemnej schránky),
//   * WhatsApp a SMS: jedna správa s krátkym odkazom {web}/b/<token>, kde sú
//     všetky PDF naraz (netlify/functions/punds-bundle.js). Odkaz platí 30 dní.
//
// Infolisty a vzor faktúry sa vždy vyrobia nanovo (údaje sa medzitým mohli
// zmeniť). Objednávka sa vyrobí z uloženej objednávky; zmluva a GDPR sa
// pridajú z dokumentov, ak tam už sú.
// Texty správ skladá `lib/documents/bundle.js`, papiere `lib/documents/templates.js`.
// ============================================================================
(function () {
  const B = () => window.DanubraBundle;
  const S = () => window.DanubraSiteSheet;
  const P = () => window.DanubraPapers;
  const digits = (p) => String(p || '').replace(/[^\d]/g, '');

  const Bundle = {
    ctx: null,

    /** Všetko, čo treba vedieť o jednom nasadení — načíta sa raz pri otvorení. */
    async gather(asgId) {
      if (!Sub.loaded) await Sub.load();
      const a = Sub.assignments.find(x => x.id === asgId);
      if (!a) throw new Error('Nasadenie sa nenašlo.');
      const sc = Sub.items.find(x => x.id === a.subcontract_id) || {};
      const partner = (Sub.partners || []).find(p => p.id === sc.partner_id) || null;

      // Celý záznam človeka (fakturačné údaje, e-mail) — zoznam v zákazkách
      // má len to, čo treba na nasadenie.
      const [wq, cmq] = await Promise.all([
        DB.list('workers', { filters: { id: a.worker_id }, limit: 1 }),
        a.crew_id ? DB.list('crew_members', { filters: { crew_id: a.crew_id }, limit: 100 }) : Promise.resolve({ data: [] }),
      ]);
      const worker = ((wq && wq.data) || [])[0] || Sub.workerOf(a.worker_id) || {};

      // Ubytovanie: rovnako ako infolist — jeho pobyt, inak ubytovanie zákazky.
      const lod = (Sub.lodging || []).filter(l => l.subcontract_id === a.subcontract_id);
      const stay = (Sub.stays || []).find(st => st.worker_id === a.worker_id && lod.some(l => l.id === st.lodging_id)) || null;
      const lodging = stay ? lod.find(l => l.id === stay.lodging_id) : (lod[0] || null);
      let accommodation = null;
      if (lodging && lodging.accommodation_id) {
        try {
          const { data } = await DB.list('accommodations', { filters: { id: lodging.accommodation_id }, limit: 1 });
          accommodation = (data || [])[0] || null;
        } catch (e) { /* bez detailu ubytovania */ }
      }
      const roommates = lodging ? (Sub.stays || [])
        .filter(st => st.lodging_id === lodging.id && st.worker_id !== a.worker_id)
        .map(st => (Sub.workerOf(st.worker_id) || {}).full_name || st.full_name).filter(Boolean) : [];

      const crew = a.crew_id ? (Sub.crews || []).find(c => c.id === a.crew_id) || null : null;
      const colleagues = S().colleagues({
        assignment: a, crew, crewMembers: (cmq && cmq.data) || [], workers: Sub.workers || [],
        contactWorker: a.contact_worker_id ? Sub.workerOf(a.contact_worker_id) : null,
      });

      // Objednávka pre tohto človeka na túto zákazku.
      let order = null;
      try {
        if (window.Ord) {
          if (!Ord.loaded) await Ord.load();
          order = (Ord.rows || []).filter(o => o.kind === 'worker' && o.worker_id === a.worker_id
            && (o.assignment_id === a.id || o.subcontract_id === a.subcontract_id))
            .sort((x, y) => String(y.created_at || '').localeCompare(String(x.created_at || '')))[0] || null;
        }
      } catch (e) { order = null; }

      if (window.Docs) await Docs.load();
      const archived = (kind) => ((window.Docs && Docs.rows) || [])
        .filter(r => r.worker_id === a.worker_id && r.kind === kind && !r.archived_at)[0] || null;

      return { a, sc, partner, worker, lodging, accommodation, stay, roommates, crew, colleagues,
        order, archived, supplier: Danubra.supplier() };
    },

    /** Čo sa dá do balíka dať a v akom stave to je. */
    items(c) {
      const ss = S().check({ worker: c.worker, assignment: c.a, subcontract: c.sc, partner: c.partner, lodging: c.lodging });
      const lc = c.lodging ? S().checkLodging({ lodging: c.lodging, accommodation: c.accommodation, stay: c.stay }) : null;
      const out = [];
      out.push({ key: 'infolist', title: 'Infolist na stavbu', on: true, make: true,
        note: ss.ready ? (ss.missing.length ? S().sentence(ss) : 'Všetko vyplnené.') : S().sentence(ss),
        bad: !ss.ready });
      out.push(c.lodging
        ? { key: 'ubytovanie', title: 'Infolist k ubytovaniu', on: true, make: true,
          note: lc && lc.missing.length ? `Chýba: ${lc.missing.map(m => m.label.toLowerCase()).join(', ')}.` : 'Všetko vyplnené.' }
        : { key: 'ubytovanie', title: 'Infolist k ubytovaniu', on: false, off: true,
          note: 'K zákazke nie je priradené ubytovanie.' });
      out.push(c.order
        ? { key: 'objednavka', title: `Objednávka ${c.order.order_number || ''}`.trim(), on: true, make: true, note: 'Vyrobí sa z uloženej objednávky.' }
        : { key: 'objednavka', title: 'Objednávka', on: false, off: true, note: 'Objednávka ešte nie je vystavená.' });
      out.push({ key: 'vzor_faktury', title: c.worker.self_billing_prefix ? 'Ako fakturujeme za Vás (samofakturácia)' : 'Vzor faktúry — ako nám fakturovať',
        on: c.worker.legal_form !== 'employee', make: true, note: 'S jeho sadzbou a našimi údajmi.' });
      const zml = c.archived('ramcova');
      out.push(zml ? { key: 'zmluva', title: 'Rámcová zmluva', on: false, row: zml, note: 'Z dokumentov — zvyčajne už podpísaná osobne.' }
        : { key: 'zmluva', title: 'Rámcová zmluva', on: false, off: true, note: 'V dokumentoch zatiaľ nie je PDF.' });
      const gd = c.archived('gdpr');
      out.push(gd ? { key: 'gdpr', title: 'Súhlas GDPR', on: false, row: gd, note: 'Z dokumentov.' }
        : { key: 'gdpr', title: 'Súhlas GDPR', on: false, off: true, note: 'V dokumentoch zatiaľ nie je PDF.' });
      return out;
    },

    async open(asgId) {
      let c;
      try { c = await this.gather(asgId); } catch (e) { return UI.toast(e.message || 'Chyba', 'err'); }
      if (!Danubra.supplierReady('Papiere na nástup')) return;
      this.ctx = c;
      const its = this.items(c);
      this._items = its;
      const w = c.worker;
      const phone = w.phone || '';
      const ch = (key, label, ok, why, on) => `<label class="bdl-ch${ok ? '' : ' is-off'}">
        <input type="checkbox" name="ch_${key}" ${ok && on ? 'checked' : ''} ${ok ? '' : 'disabled'}>
        <span>${Icon(key === 'email' ? 'mail' : key === 'whatsapp' ? 'whatsapp' : 'inbox', 16)} <b>${label}</b>
          <em>${UI.esc(ok ? why : 'chýba ' + (key === 'email' ? 'e-mail' : 'telefón'))}</em></span></label>`;
      const kol = c.colleagues || {};
      const kolText = kol.crew ? `Partia ${kol.crew.name} — ${kol.people.length ? kol.people.map(p => p.name).join(', ') : 'bez ďalších členov'}`
        : kol.contact ? `Kontaktná osoba: ${kol.contact.name}${kol.contact.phone ? ` · ${kol.contact.phone}` : ''}` : '';

      UI.modal(`Poslať všetko naraz — ${w.full_name || ''}`, `
        <form id="bdl-form" onsubmit="event.preventDefault();Bundle.run()">
          <p class="modal-lead">Jedna správa namiesto piatich. Zaškrtnite papiere a cestu, akou ich má dostať.
            ${UI.tip('E-mail: jedna správa, všetky PDF ako prílohy. WhatsApp a SMS: jedna správa s krátkym odkazom, za ktorým sú všetky PDF naraz. Odkaz platí 30 dní a nikto iný ho nevidí, kým ho od Vás nedostane.')}</p>
          <div class="form-section">Papiere</div>
          <div class="bdl-list">${its.map(it => `
            <label class="bdl-it${it.off ? ' is-off' : ''}${it.bad ? ' is-bad' : ''}">
              <input type="checkbox" name="it_${it.key}" ${it.on && !it.off ? 'checked' : ''} ${it.off ? 'disabled' : ''}>
              <span class="bdl-ico">${Icon(it.key === 'ubytovanie' ? 'bed' : it.key === 'objednavka' ? 'orders' : it.key === 'vzor_faktury' ? 'invoices' : it.key === 'gdpr' ? 'shield' : 'doc', 17)}</span>
              <span class="bdl-txt"><b>${UI.esc(it.title)}</b><em>${UI.esc(it.note || '')}</em></span>
            </label>`).join('')}</div>
          <div class="form-section">Kolegovia a kontakt ${UI.tip('Na infoliste a v správe uvidí, komu zavolať na stavbe: členov svojej partie, alebo kontaktnú osobu, ktorú mu vyberiete pri nasadení.')}</div>
          <div class="btn-row">
            <span class="muted">${kolText ? UI.esc(kolText) : 'Nie je v partii a nemá kontaktnú osobu — na infoliste bude len naše číslo.'}</span>
            <button type="button" class="btn btn-outline btn-sm" onclick="UI.closeModal();Sub.contactForm('${c.a.id}')">${Icon('phone', 14)} ${kolText ? 'Zmeniť' : 'Pridať kontaktnú osobu'}</button>
          </div>
          <div class="form-section">Ako to poslať</div>
          <div class="bdl-chs">
            ${ch('email', 'E-mail', !!w.email, w.email, !!w.email)}
            ${ch('whatsapp', 'WhatsApp', !!phone, phone, !w.email && !!phone)}
            ${ch('sms', 'SMS', !!phone, phone, false)}
          </div>
          <div id="bdl-progress" class="regimebox" hidden></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary" id="bdl-go">${Icon('check')} Pripraviť papiere</button>
          </div>
        </form>`, { wide: true });
    },

    /** HTML a meta jedného papiera. */
    paper(key) {
      const c = this.ctx;
      const base = { who: c.worker.full_name, lang: 'sk', worker_id: c.a.worker_id,
        subcontract_id: c.a.subcontract_id, partner_id: c.sc.partner_id || null };
      if (key === 'infolist') {
        const state = S().check({ worker: c.worker, assignment: c.a, subcontract: c.sc, partner: c.partner, lodging: c.lodging });
        return { html: P().siteSheet({ worker: c.worker, assignment: c.a, subcontract: c.sc, partner: c.partner,
          lodging: c.lodging, supplier: c.supplier, trade: c.sc.trade || null, state,
          colleagues: c.colleagues, lodgingSheet: !!c.lodging }),
          meta: { ...base, kind: 'infolist', title: 'Infolist na stavbu' } };
      }
      if (key === 'ubytovanie') {
        return { html: P().lodgingSheet({ worker: c.worker, assignment: c.a, subcontract: c.sc, lodging: c.lodging,
          accommodation: c.accommodation, stay: c.stay, roommates: c.roommates, colleagues: c.colleagues, supplier: c.supplier }),
          meta: { ...base, kind: 'infolist_lodging', title: 'Infolist k ubytovaniu' } };
      }
      if (key === 'vzor_faktury') {
        return { html: P().invoiceGuide({ worker: c.worker, assignment: c.a, subcontract: c.sc, supplier: c.supplier }),
          meta: { ...base, kind: 'invoice_guide', title: 'Vzor faktúry' } };
      }
      if (key === 'objednavka' && c.order) {
        const o = c.order;
        return { html: P().workOrder({ order: o, supplier: c.supplier, partner: null, worker: c.worker,
          subcontract: c.sc, ramcova: Ord.ramcovaOf ? Ord.ramcovaOf(o.worker_id) : null }),
          meta: { ...base, kind: 'objednavka', title: 'Objednávka', number: o.order_number } };
      }
      return null;
    },

    async run() {
      const c = this.ctx;
      const d = UI.formData(document.getElementById('bdl-form'));
      const chosen = this._items.filter(it => d[`it_${it.key}`] && !it.off);
      const channels = ['email', 'whatsapp', 'sms'].filter(k => d[`ch_${k}`]);
      if (!chosen.length) return UI.toast('Zaškrtnite aspoň jeden papier', 'err');
      if (!channels.length) return UI.toast('Vyberte, ako to poslať', 'err');
      const btn = document.getElementById('bdl-go');
      const prog = document.getElementById('bdl-progress');
      if (btn) btn.disabled = true;
      const say = (t) => { if (prog) { prog.hidden = false; prog.textContent = t; } };

      const rows = [];
      try {
        for (const [i, it] of chosen.entries()) {
          say(`Pripravujem ${i + 1} / ${chosen.length}: ${it.title}…`);
          if (it.row) { rows.push(it.row); continue; }
          const p = this.paper(it.key);
          if (!p) continue;
          const { row } = await Docs.renderPdf(p.html, p.meta);
          if (!row) throw new Error(`${it.title} sa nepodarilo uložiť.`);
          rows.push(row);
        }
        say('Ukladám balík…');
        const token = B().token();
        const title = `Papiere na nástup — ${c.sc.title || c.sc.site_city || ''}`.trim();
        const items = rows.map(r => ({ archive_id: r.id, title: r.title, kind: r.kind }));
        const link = `${location.origin}/b/${token}`;
        const texts = B().texts({ worker: c.worker, subcontract: c.sc, assignment: c.a, lodging: c.lodging,
          colleagues: c.colleagues, items, link, supplier: c.supplier, start: c.a.date_from || c.sc.date_from });
        const { data: bundle, error } = await DB.insert('bundles', {
          token, worker_id: c.a.worker_id, subcontract_id: c.a.subcontract_id, assignment_id: c.a.id,
          title, items, message: texts.whatsapp, channels, lang: 'sk' });
        if (error) throw error;
        this.done = { rows, texts, link, channels, bundle };
        this.result();
      } catch (e) {
        console.error('[danubra] balík', e);
        say('');
        if (prog) prog.hidden = true;
        if (btn) btn.disabled = false;
        UI.toast('Balík sa nepodarilo pripraviť: ' + (e.message || e), 'err');
      }
    },

    /** Papiere sú hotové — teraz už len odoslať každou zvolenou cestou. */
    result() {
      const { rows, channels, link } = this.done;
      const w = this.ctx.worker;
      const btn = (k, ico, label, primary) => `<button type="button" class="pick-tile" onclick="Bundle.send('${k}')">
        <span class="bdl-ico">${Icon(ico, 18)}</span><span class="bdl-txt"><b>${label}</b><em>${UI.esc(
          k === 'email' ? `${w.email} · ${rows.length} ${rows.length === 1 ? 'príloha' : rows.length < 5 ? 'prílohy' : 'príloh'}`
            : `${w.phone} · s odkazom na všetky papiere`)}</em></span>${primary ? '' : ''}</button>`;
      UI.modal('Papiere sú pripravené', `
        <p class="modal-lead">Všetky papiere sú uložené v dokumentoch pri ${UI.esc(w.full_name || 'človeku')}.
          Teraz ich pošlite — každá cesta je jedna správa.</p>
        <div class="pick-list">
          ${channels.includes('email') ? btn('email', 'mail', 'Otvoriť e-mail so všetkými prílohami', true) : ''}
          ${channels.includes('whatsapp') ? btn('whatsapp', 'whatsapp', 'Otvoriť WhatsApp so správou') : ''}
          ${channels.includes('sms') ? btn('sms', 'inbox', 'Poslať SMS s odkazom') : ''}
        </div>
        <div class="form-section">Odkaz na papiere ${UI.tip('Za odkazom sú všetky papiere z balíka ako PDF. Platí 30 dní. Kto ho nemá, k papierom sa nedostane.')}</div>
        <div class="btn-row"><code class="bdl-link">${UI.esc(link)}</code>
          <button type="button" class="btn btn-outline btn-sm" onclick="Bundle.copy()">${Icon('copy', 14)} Kopírovať</button></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zavrieť</button>
        </div>`, { wide: true });
    },

    async send(k) {
      const { rows, texts } = this.done;
      const c = this.ctx;
      const w = c.worker;
      if (k === 'email') {
        UI.closeModal();
        await Mail.compose({ to: w.email || '', links: { worker_id: c.a.worker_id }, sign: true,
          subject: texts.subject, body: texts.email,
          attachments: rows.map(r => ({ storage_path: r.storage_path, name: r.file_name, type: 'application/pdf' })) });
      } else if (k === 'whatsapp') {
        window.open(`https://wa.me/${digits(w.phone)}?text=${encodeURIComponent(texts.whatsapp)}`, '_blank', 'noopener');
      } else if (k === 'sms') {
        const meta = encodeURIComponent(JSON.stringify({ type: 'worker', id: c.a.worker_id }));
        CommPanel.smsDialog(meta, w.phone || '', texts.sms);
      }
      try { if (window.Docs) await Docs.markSent(rows); } catch (e) { /* len značka */ }
    },

    async copy() {
      try { await navigator.clipboard.writeText(this.done.link); UI.toast('Odkaz je skopírovaný', 'ok'); }
      catch (e) { UI.toast(this.done.link); }
    },
  };

  window.Bundle = Bundle;
})();
