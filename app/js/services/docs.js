// ============================================================================
// DANUBRA — dokumenty: PDF rovno, poslať, archív pri ľuďoch a firmách
// ============================================================================
// Dovtedy sa každý papier (zmluva, GDPR, objednávka, infolist, faktúra)
// otvoril v novom okne a PDF sa robilo tlačou prehliadača. Chrome naň pridal
// adresu stránky a dátum, súbor sa volal podľa okna a nikde nezostal.
//
// Teraz:
//   * „Stiahnuť PDF" spraví súbor rovno (html2pdf), s menom
//     `2026-10-23 Rámcová zmluva 2026-093 – Jozef Malý.pdf`,
//   * súbor sa zároveň uloží do archívu k človeku / firme / zákazke,
//   * „Poslať" otvorí na telefóne ponuku zdieľania (Mail, WhatsApp…),
//     v archíve sa dá vybrať viac dokumentov a poslať ich naraz.
//
// Názvy a triedenie sú v `lib/documents/archive.js` (s testami).
// ============================================================================
(function () {
  const PDF_LIB = 'vendor/html2pdf-0.10.1.bundle.min.js';
  const A = () => window.DanubraArchive;

  const Docs = {
    rows: [], loaded: false,
    /** id → File, pripravené na poslanie (zdieľanie musí ísť hneď po kliknutí). */
    files: new Map(),
    picked: new Set(),
    filter: { group: '', q: '' },

    // ── Okno dokumentu ────────────────────────────────────────────────────
    /**
     * Zapíše dokument do okna a pripojí k nemu tlačidlá PDF a Poslať.
     *
     * @param {Window} okno   okno otvorené ešte pri kliknutí (inak ho prehliadač zablokuje)
     * @param {string} html   celý dokument z `DanubraPapers`
     * @param {Object} meta   { kind, title, number, who, lang, worker_id, partner_id, subcontract_id }
     */
    show(okno, html, meta = {}) {
      if (!okno) return UI.toast('Povoľte vyskakovacie okná pre zobrazenie dokumentu', 'err');
      okno.document.open(); okno.document.write(html); okno.document.close();
      // Bez skutočného okna (test, starý prehliadač) zostane obyčajný dokument s tlačou.
      if (!meta || !meta.kind || typeof okno.document.createElement !== 'function') return okno;
      okno.__meta = meta;
      okno.__doc = (mode) => this.run(okno, mode);
      try { okno.document.body.classList.add('has-doc'); } catch (e) { /* okno zavreté */ }
      const sc = okno.document.createElement('script');
      sc.src = new URL(PDF_LIB, location.href).href;
      okno.document.head.appendChild(sc);
      return okno;
    },

    msg(okno, html) {
      const m = okno.document.getElementById('tb-msg');
      if (!m) return;
      m.innerHTML = html || '';
      m.classList.toggle('on', !!html);
    },

    async waitLib(okno) {
      for (let i = 0; i < 100 && !okno.html2pdf; i++) await new Promise(r => setTimeout(r, 100));
      if (!okno.html2pdf) throw new Error('Knižnica na PDF sa nenačítala. Skúste to znova.');
    },

    /** Spraví z okna PDF. Text upravený cez „Upraviť text" v ňom už je. */
    async makePdf(okno) {
      await this.waitLib(okno);
      const d = okno.document;
      const page = d.querySelector('.page');
      if (page && page.isContentEditable) {
        page.contentEditable = 'false';
        d.body.classList.remove('editing');
      }
      const el = d.querySelector('.pf-main') || page;
      // Fonty z Google musia byť načítané, inak by PDF bolo iným písmom.
      try { await d.fonts.ready; } catch (e) { /* bez fontov to pôjde tiež */ }
      d.body.classList.add('pdf-mode');
      okno.scrollTo(0, 0);
      // Strany A4 sa poskladajú vopred (lib/documents/paginate.js) a do PDF sa
      // kreslí každá zvlášť: nič sa nekrája cez riadok a ani dlhý dokument
      // neprekročí strop veľkosti obrázka v prehliadači na iPhone.
      //
      // Každá strana je celý list A4 ako hlavičkový papier: obsah, pod ním
      // päta s údajmi firmy, oranžový pruh na spodnom okraji a pri viacerých
      // stranách aj „Strana 1 / 3". Päta sa preto z toku dokumentu vyberie
      // a na každú stranu sa pridá zvlášť.
      const MM = 96 / 25.4;
      const SW = Math.floor(210 * MM);                    // šírka listu v px
      const SH = Math.floor(SW * 297 / 210) - 1;          // výška listu (o bod menej, nech nevznikne prázdna strana)
      const SIDE = Math.round(14 * MM), TOP = Math.round(12 * MM), BOTTOM = 22, PNO = 16;
      const W = SW - 2 * SIDE;
      const src = d.createElement('div');
      src.innerHTML = el.innerHTML;
      const footEl = src.querySelector('.runfoot');
      let footH = 0;
      if (footEl) {
        footEl.remove();
        const m = d.createElement('div');
        m.style.cssText = `position:absolute;left:-20000px;top:0;width:${W}px;`;
        m.appendChild(footEl);
        d.body.appendChild(m);
        footH = Math.ceil(footEl.getBoundingClientRect().height);
        m.remove();
      }
      const H = SH - TOP - BOTTOM - (footH ? footH + 18 : 0) - PNO;
      const { pages: obsah, stage } = DanubraPaginate.paginate(d, src, { width: W, height: H });
      const lang = (footEl && footEl.getAttribute('data-lang')) || d.documentElement.lang || 'sk';
      const strana = { de: 'Seite', both: 'Strana / Seite' }[lang] || 'Strana';
      const pages = obsah.map((p, i) => {
        const s = d.createElement('div');
        s.className = 'pdf-sheet';
        s.style.cssText = `width:${SW}px;height:${SH}px;padding:${TOP}px ${SIDE}px 0;`;
        s.appendChild(p);
        if (footEl) {
          const f = footEl.cloneNode(true);
          f.style.cssText = `left:${SIDE}px;right:${SIDE}px;bottom:${BOTTOM}px;`;
          s.appendChild(f);
        }
        if (obsah.length > 1) {
          const n = d.createElement('div');
          n.className = 'pdf-pno';
          n.textContent = `${strana} ${i + 1} / ${obsah.length}`;
          n.style.cssText = `right:${SIDE}px;bottom:${BOTTOM + footH + 6}px;`;
          s.appendChild(n);
        }
        // Oranžový pruh je naša značka — na faktúre za živnostníka nie je.
        if (!(footEl && footEl.classList.contains('plain'))) {
          const bar = d.createElement('div');
          bar.className = 'pdf-bar';
          s.appendChild(bar);
        }
        stage.appendChild(s);
        return s;
      });
      // Nastavenia sa musia vytvoriť v okne dokumentu: knižnica sa pýta
      // `instanceof Array` a pole z tohto okna by tam neprešlo.
      const opts = okno.JSON.parse(JSON.stringify({
        margin: [0, 0, 0, 0],
        image: { type: 'jpeg', quality: 0.92 },
        // Bez `windowWidth`: knižnica centruje dokument podľa skutočnej šírky
        // okna, a keby html2canvas počítal s inou, odreže ľavý okraj.
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
        pagebreak: { mode: [] },
      }));
      let blob;
      try {
        let w = okno.html2pdf().set(opts).from(pages[0]).toPdf();
        for (const p of pages.slice(1)) {
          w = w.get('pdf').then((pdf) => { pdf.addPage(); }).from(p).toContainer().toCanvas().toPdf();
        }
        blob = await w.outputPdf('blob');
      } finally {
        stage.remove();
        d.body.classList.remove('pdf-mode');
      }
      // Blob z cudzieho okna sa prevedie sem — okno sa môže medzitým zavrieť.
      return new Blob([await blob.arrayBuffer()], { type: 'application/pdf' });
    },

    /** Tlačidlo v okne dokumentu: 'pdf' = stiahnuť, 'share' = poslať. */
    async run(okno, mode) {
      const meta = okno.__meta || {};
      // Druhé kliknutie na „Poslať" po príprave — súbor je hotový, posiela sa hneď.
      if (mode === 'share' && okno.__file) return this.shareFrom(okno, [okno.__file], okno.__row);
      if (okno.__busy) return;
      okno.__busy = true;
      this.msg(okno, 'Pripravujem PDF…');
      try {
        const blob = await this.makePdf(okno);
        const name = A().fileName({ ...meta, date: new Date() });
        const file = new File([blob], name, { type: 'application/pdf' });
        okno.__file = file;
        const row = await this.store(blob, { ...meta, file_name: name });
        okno.__row = row;
        if (mode === 'pdf') {
          // Okno dokumentu nemá vlastnú adresu (about:blank) a prehliadač
          // v ňom názov súboru zahodí — stiahne sa preto z appky.
          this.download(window, file);
          this.msg(okno, `Stiahnuté a uložené do dokumentov: <b>${UI.esc(name)}</b>`);
        } else {
          await this.shareFrom(okno, [file], row);
        }
      } catch (e) {
        console.error('[danubra] PDF', e);
        this.msg(okno, `PDF sa nepodarilo spraviť: ${UI.esc(e.message || e)}
          <button class="btn btn-primary btn-sm" onclick="window.print()">Tlačiť namiesto toho</button>`);
      } finally { okno.__busy = false; }
    },

    download(win, file) {
      // Odkaz musí vzniknúť v tom okne, v ktorom sa klikne — inak prehliadač
      // zabudne názov súboru a uloží ho ako „download".
      const f = new win.File([file], file.name, { type: 'application/pdf' });
      const url = win.URL.createObjectURL(f);
      const a = win.document.createElement('a');
      a.href = url; a.download = file.name;
      win.document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => win.URL.revokeObjectURL(url), 60000);
    },

    /**
     * Pošle súbory cez ponuku zdieľania (iPhone, Android, Mac, Windows).
     * Keď prehliadač čakanie na PDF neodpustí (zdieľanie musí ísť hneď po
     * kliknutí), ukáže sa tlačidlo „Poslať teraz" — súbor už je hotový.
     */
    async shareFrom(win, files, rows) {
      const list = Array.isArray(rows) ? rows : (rows ? [rows] : []);
      const lang = list.length ? A().langOf(list) : ((win.__meta || {}).lang || 'sk');
      const text = A().shareText(files.map(f => ({ file_name: f.name })), { lang });
      const nav = win.navigator;
      const can = nav.canShare && nav.canShare({ files });
      if (!can) {
        // Počítač bez zdieľania: súbory sa stiahnu a otvorí sa e-mail s textom.
        files.forEach(f => this.download(win, f));
        const subj = files.length === 1 ? files[0].name.replace(/\.pdf$/, '') : `${files.length} dokumenty`;
        const m = win.document.createElement('a');
        m.href = `mailto:?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(text)}`;
        win.document.body.appendChild(m); m.click(); m.remove();
        if (win.document.getElementById('tb-msg')) {
          this.msg(win, 'Súbory sa stiahli — priložte ich do e-mailu, ktorý sa otvoril.');
        } else UI.toast('Súbory sa stiahli — priložte ich do e-mailu', 'ok');
        return this.markSent(list);
      }
      try {
        await nav.share({ files, title: files.length === 1 ? files[0].name : `${files.length} dokumenty`, text });
        this.markSent(list);
        if (win.document.getElementById('tb-msg')) this.msg(win, 'Odoslané.');
      } catch (e) {
        if (e && e.name === 'AbortError') return;          // človek si to rozmyslel
        if (win.document.getElementById('tb-msg')) {
          this.msg(win, `PDF je pripravené. <button class="btn btn-primary btn-sm" onclick="window.__doc('share')">Poslať teraz</button>`);
        } else {
          UI.toast('Dokumenty sú pripravené — kliknite ešte raz na Poslať', 'warn');
        }
      }
    },

    async markSent(rows) {
      const ids = (rows || []).map(r => r && r.id).filter(Boolean);
      if (!ids.length) return;
      const at = new Date().toISOString();
      await Promise.all(ids.map(id => DB.update('archive', id, { sent_at: at })));
      for (const r of this.rows) if (ids.includes(r.id)) r.sent_at = at;
    },

    // ── Archív ────────────────────────────────────────────────────────────
    /** Nahrá PDF do úložiska a zapíše ho do archívu. Chyba nezastaví stiahnutie. */
    async store(blob, meta) {
      try {
        const path = A().storagePath(meta);
        const up = await DB.client.storage.from(DB.DOCS_BUCKET)
          .upload(path, blob, { contentType: 'application/pdf', upsert: false });
        if (up.error) throw up.error;
        const row = {
          kind: meta.kind, title: meta.title || A().label(meta.kind), number: meta.number || null,
          file_name: meta.file_name, storage_path: path, size_bytes: blob.size,
          lang: meta.lang === 'de' ? 'de' : 'sk',
          worker_id: meta.worker_id || null, partner_id: meta.partner_id || null,
          subcontract_id: meta.subcontract_id || null,
        };
        const { data, error } = await DB.insert('archive', row);
        if (error) throw error;
        this.rows.unshift(data);
        return data;
      } catch (e) {
        console.error('[danubra] archív', e);
        UI.toast('PDF je hotové, ale do dokumentov sa neuložilo: ' + (e.message || e), 'err');
        return null;
      }
    },

    async load(force) {
      if (this.loaded && !force) return;
      const { data } = await DB.list('archive', { order: { column: 'created_at', ascending: false }, limit: 2000 });
      this.rows = data || [];
      this.loaded = true;
    },

    /** Mená ľudí, firiem a zákaziek pre nadpisy skupín. */
    async names() {
      if (this._names) return this._names;
      const [w, p, s] = await Promise.all([
        DB.list('workers', { select: 'id,full_name', limit: 2000 }),
        DB.list('partners', { select: 'id,name', limit: 1000 }),
        DB.list('subcontracts', { select: 'id,title', limit: 1000 }),
      ]);
      const n = {};
      for (const x of (w.data || [])) n[`worker:${x.id}`] = x.full_name;
      for (const x of (p.data || [])) n[`partner:${x.id}`] = x.name;
      for (const x of (s.data || [])) n[`subcontract:${x.id}`] = x.title;
      this._names = n;
      setTimeout(() => { this._names = null; }, 60000);
      return n;
    },

    rowHtml(r) {
      const on = this.picked.has(r.id);
      const kb = r.size_bytes ? `${Math.max(1, Math.round(r.size_bytes / 1024))} kB` : '';
      return `<div class="arch-row${on ? ' is-on' : ''}">
        <label class="arch-pick"><input type="checkbox" ${on ? 'checked' : ''}
          onchange="Docs.pick('${r.id}', this.checked)" aria-label="Vybrať"></label>
        <button class="arch-main" onclick="Docs.openFile('${r.id}')">
          <b>${UI.esc(r.file_name.replace(/\.pdf$/, ''))}</b>
          <span>${UI.esc(A().label(r.kind))}${kb ? ` · ${kb}` : ''}${r.sent_at ? ` · odoslané ${UI.date(r.sent_at)}` : ''}${
            r.older && r.older.length ? ` · ${r.older.length} ${Shell.plural(r.older.length, 'staršia verzia', 'staršie verzie', 'starších verzií')}` : ''}</span>
        </button>
        <span class="arch-acts">
          <button class="icon-btn" title="Premenovať" onclick="Docs.rename('${r.id}')">${Icon('edit', 14)}</button>
          <button class="icon-btn" title="Skryť zo zoznamu" onclick="Docs.hide('${r.id}')">${Icon('x', 14)}</button>
        </span>
      </div>`;
    },

    barHtml() {
      const n = this.picked.size;
      return `<div class="arch-bar${n ? ' on' : ''}" id="arch-bar">
        <span>${n ? `Vybraté: <b>${n}</b>` : 'Zaškrtnite dokumenty, ktoré chcete poslať naraz.'}</span>
        ${n ? `<button class="btn btn-ghost btn-sm" onclick="Docs.clearPick()">Zrušiť výber</button>
          <button class="btn btn-outline btn-sm" onclick="Docs.downloadPicked()">${Icon('download', 14)} Stiahnuť</button>
          ${window.Mail ? `<button class="btn btn-outline btn-sm" onclick="Docs.mailPicked()">${Icon('mail', 14)} E-mailom</button>` : ''}
          <button class="btn btn-primary btn-sm" onclick="Docs.sharePicked()">${Icon('upload', 14)} Poslať</button>` : ''}
      </div>`;
    },

    /**
     * Miesto na zozname dokumentov v profile človeka, firmy alebo zákazky.
     * Modul vloží `Docs.slot('worker', id)` a router ho po vykreslení naplní.
     */
    slot(type, id, opts = {}) {
      return `<div class="arch-slot" data-type="${type}" data-id="${UI.esc(id)}"${opts.empty ? ` data-empty="${UI.esc(opts.empty)}"` : ''}>
        <div class="js-empty">Načítavam dokumenty…</div></div>`;
    },

    async fill(root) {
      const slots = [...(root || document).querySelectorAll('.arch-slot')];
      if (!slots.length) return;
      try { await this.load(); } catch (e) { return; }
      const col = { worker: 'worker_id', partner: 'partner_id', subcontract: 'subcontract_id' };
      for (const s of slots) {
        const k = col[s.dataset.type];
        const rows = A().latest(this.rows.filter(r => r[k] === s.dataset.id));
        s.innerHTML = rows.length ? `${rows.map(r => this.rowHtml(r)).join('')}${this.barHtml()}`
          : `<div class="js-empty">${UI.esc(s.dataset.empty || 'Zatiaľ žiadne dokumenty. Každé PDF, ktoré tu spravíte, sa uloží sem.')}</div>`;
      }
    },

    refresh() {
      if (Danubra.route === 'archive') return Danubra.renderRoute();
      document.querySelectorAll('.arch-bar').forEach(b => { b.outerHTML = this.barHtml(); });
      this.fill(document);
    },

    // ── Výber a posielanie viacerých naraz ────────────────────────────────
    async pick(id, on) {
      if (on) this.picked.add(id); else this.picked.delete(id);
      document.querySelectorAll('.arch-bar').forEach(b => { b.outerHTML = this.barHtml(); });
      // Súbor sa stiahne hneď pri zaškrtnutí — poslať sa dá len hneď po
      // kliknutí, takže pri „Poslať" už musí byť pripravený.
      if (on && !this.files.has(id)) this.fetchFile(id).catch(() => {});
    },
    clearPick() { this.picked.clear(); this.refresh(); },

    async fetchFile(id) {
      if (this.files.has(id)) return this.files.get(id);
      const r = this.rows.find(x => x.id === id);
      if (!r) throw new Error('Dokument sa nenašiel');
      const { data, error } = await DB.client.storage.from(DB.DOCS_BUCKET).download(r.storage_path);
      if (error || !data) throw error || new Error('Súbor sa nedal stiahnuť');
      const f = new File([data], r.file_name, { type: 'application/pdf' });
      this.files.set(id, f);
      return f;
    },

    async sharePicked() {
      const ids = [...this.picked];
      const rows = ids.map(id => this.rows.find(r => r.id === id)).filter(Boolean);
      const ready = ids.every(id => this.files.has(id));
      if (!ready) {
        UI.toast('Pripravujem súbory…', 'ok');
        await Promise.all(ids.map(id => this.fetchFile(id)));
        // Po čakaní by prehliadač zdieľanie odmietol — treba kliknúť znova.
        return UI.toast('Súbory sú pripravené — kliknite ešte raz na Poslať', 'warn');
      }
      return this.shareFrom(window, ids.map(id => this.files.get(id)), rows);
    },

    /**
     * Vybraté dokumenty ako prílohy e-mailu z firemnej schránky (Správy).
     * Keď patria jednému človeku alebo jednej firme, doplní sa aj adresát.
     */
    async mailPicked() {
      const rows = [...this.picked].map(id => this.rows.find(r => r.id === id)).filter(Boolean);
      if (!rows.length) return;
      const one = (k) => { const v = [...new Set(rows.map(r => r[k]).filter(Boolean))]; return v.length === 1 ? v[0] : null; };
      const links = { worker_id: one('worker_id'), partner_id: one('partner_id') };
      let to = '';
      try {
        const [t, id] = links.partner_id ? ['partners', links.partner_id] : links.worker_id ? ['workers', links.worker_id] : [];
        if (t) { const { data } = await DB.list(t, { select: 'id,email', filters: { id }, limit: 1 }); to = ((data || [])[0] || {}).email || ''; }
      } catch (e) { /* adresáta doplní človek */ }
      const lang = A().langOf(rows);
      return Mail.compose({ to, links, sign: true,
        subject: rows.length === 1 ? rows[0].file_name.replace(/\.pdf$/, '') : (lang === 'de' ? 'Dokumente' : 'Dokumenty'),
        body: A().shareText(rows, { lang }),
        attachments: rows.map(r => ({ storage_path: r.storage_path, name: r.file_name, type: 'application/pdf' })) });
    },

    async downloadPicked() {
      for (const id of this.picked) {
        try { this.download(window, await this.fetchFile(id)); } catch (e) { UI.toast(e.message || 'Chyba', 'err'); }
      }
    },

    async openFile(id) {
      const r = this.rows.find(x => x.id === id);
      if (!r) return;
      const w = window.open('', '_blank');
      const { url, error } = await DB.signedDocUrl(r.storage_path, 600);
      if (error || !url) { if (w) w.close(); return UI.toast('Súbor sa nedal otvoriť', 'err'); }
      if (w) w.location.href = url; else location.href = url;
    },

    rename(id) {
      const r = this.rows.find(x => x.id === id);
      if (!r) return;
      UI.modal('Premenovať dokument', `
        <form id="arch-ren" onsubmit="event.preventDefault();Docs.saveRename('${id}')">
          ${UI.field('file_name', 'Názov súboru', { value: r.file_name.replace(/\.pdf$/, ''), required: true })}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">Zrušiť</button>
            <button type="submit" class="btn btn-primary">Uložiť</button>
          </div>
        </form>`);
    },
    async saveRename(id) {
      const d = UI.formData(document.getElementById('arch-ren'));
      const name = `${A().safeFile(d.file_name || '') || 'dokument'}.pdf`;
      const { error } = await DB.update('archive', id, { file_name: name });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const r = this.rows.find(x => x.id === id); if (r) r.file_name = name;
      this.files.delete(id);
      UI.closeModal(); this.refresh();
    },

    /** Nič sa nemaže — dokument sa len skryje zo zoznamov. */
    async hide(id) {
      if (!await UI.confirm('Skryť tento dokument zo zoznamu? Súbor zostane uložený.')) return;
      const at = new Date().toISOString();
      const { error } = await DB.update('archive', id, { archived_at: at });
      if (error) return UI.toast('Chyba: ' + error.message, 'err');
      const r = this.rows.find(x => x.id === id); if (r) r.archived_at = at;
      this.picked.delete(id);
      this.refresh();
    },

    // ── Obrazovka Dokumenty ───────────────────────────────────────────────
    setF(k, v) { this.filter[k] = v; Danubra.renderRoute(); },

    async view(el) {
      el.innerHTML = UI.loading();
      await this.load(true);
      const names = await this.names();
      const g = A().grouped(this.rows, { names, ...this.filter });
      const LINK = { worker: 'worker', partner: 'partner', subcontract: 'subcontract' };
      const spolu = A().latest(this.rows).length;
      el.innerHTML = Danubra.header(Danubra.labelOf('archive'),
        `${spolu} ${Shell.plural(spolu, 'dokument', 'dokumenty', 'dokumentov')} · triedené podľa ľudí a firiem`) + `
        <div class="filterbar">
          <div class="pillbar pillbar-xs">
            <button class="pill${!this.filter.group ? ' active' : ''}" onclick="Docs.setF('group','')">Všetky</button>
            ${A().GROUPS.map(([k, l]) => `<button class="pill${this.filter.group === k ? ' active' : ''}"
              onclick="Docs.setF('group','${k}')">${l}</button>`).join('')}
          </div>
          <input type="search" placeholder="Hľadať v názvoch…" value="${UI.esc(this.filter.q)}"
            onchange="Docs.setF('q', this.value)">
        </div>
        ${this.barHtml()}
        ${g.length ? g.map(x => `<div class="card card-pad arch-group">
          <div class="arch-head">${LINK[x.type] && x.id ? Danubra.link(LINK[x.type], x.id, x.name) : `<b>${UI.esc(x.name)}</b>`}
            <em>${x.rows.length}</em></div>
          ${x.rows.map(r => this.rowHtml(r)).join('')}
        </div>`).join('')
          : UI.empty('doc', 'Zatiaľ žiadne dokumenty',
            'Keď pri zmluve, GDPR, objednávke či faktúre kliknete na „Stiahnuť PDF", uloží sa sem — k človeku a k firme.')}`;
    },
  };

  window.Docs = Docs;
  if (window.Danubra && Danubra.views) Danubra.views.archive = function (el) { return Docs.view(el); };
})();
