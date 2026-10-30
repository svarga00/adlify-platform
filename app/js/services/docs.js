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
//     v archíve sa dá vybrať viac dokumentov a poslať ich naraz,
//   * „Tlačiť" papier najprv uloží do archívu rovnakou cestou ako „Stiahnuť
//     PDF" a až potom otvorí tlač — inak by vytlačený papier v Dokumentoch
//     chýbal a nedal by sa poslať cez „Poslať všetko naraz".
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
      // Upravený text („Upraviť text") je iný papier, než aký je uložený —
      // ďalšia tlač alebo poslanie ho musí uložiť znova.
      try { okno.document.addEventListener('input', () => { okno.__dirty = true; }); } catch (e) { /* okno zavreté */ }
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
      // List na šírku (Stundennachweis) má na <html> data-orient="landscape".
      const land = d.documentElement.dataset.orient === 'landscape';
      const [PW, PH] = land ? [297, 210] : [210, 297];
      const SW = Math.floor(PW * MM);                     // šírka listu v px
      const SH = Math.floor(SW * PH / PW) - 1;            // výška listu (o bod menej, nech nevznikne prázdna strana)
      // Skrytý rám (renderPdf) je úzky na list na šírku — knižnica by ho orezala.
      if (land && okno.frameElement && okno.frameElement.offsetWidth < SW + 40) {
        okno.frameElement.style.width = `${SW + 40}px`;
      }
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
        jsPDF: { unit: 'mm', format: 'a4', orientation: land ? 'landscape' : 'portrait', compress: true },
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

    /**
     * Tlačidlo v okne dokumentu: 'pdf' = stiahnuť, 'share' = poslať,
     * 'print' = uložiť do dokumentov a vytlačiť.
     */
    async run(okno, mode) {
      const meta = okno.__meta || {};
      const hotovy = okno.__file && !okno.__dirty;
      // Druhé kliknutie na „Poslať" po príprave — súbor je hotový, posiela sa hneď.
      if (mode === 'share' && hotovy) return this.shareFrom(okno, [okno.__file], okno.__row);
      // Tento papier už v dokumentoch je (bez zmien) — druhý raz sa neukladá.
      if (mode === 'print' && hotovy && okno.__row) return this.printNow(okno);
      if (mode === 'pdf' && hotovy && okno.__row) {
        this.download(window, okno.__file);
        return this.msg(okno, `Stiahnuté, v dokumentoch už je: <b>${UI.esc(okno.__file.name)}</b>`);
      }
      if (okno.__busy) return;
      okno.__busy = true;
      this.msg(okno, mode === 'print' ? 'Ukladám do dokumentov, potom sa otvorí tlač…' : 'Pripravujem PDF…');
      try {
        const blob = await this.makePdf(okno);
        const name = A().fileName({ ...meta, date: new Date() });
        const file = new File([blob], name, { type: 'application/pdf' });
        okno.__file = file;
        okno.__dirty = false;
        const row = await this.store(blob, { ...meta, file_name: name });
        okno.__row = row;
        if (mode === 'print') {
          // Keď sa uložiť nepodarilo, `store` to už povedal hláškou; tlač
          // sa aj tak otvorí — papier treba, aj keď archív práve nejde.
          // Hláška sa pri tlači skryje (@media print), na papier nepríde.
          if (row) this.msg(okno, `Uložené do dokumentov: <b>${UI.esc(name)}</b>`);
          this.printNow(okno);
        } else if (mode === 'pdf') {
          // Okno dokumentu nemá vlastnú adresu (about:blank) a prehliadač
          // v ňom názov súboru zahodí — stiahne sa preto z appky.
          this.download(window, file);
          this.msg(okno, `Stiahnuté a uložené do dokumentov: <b>${UI.esc(name)}</b>`);
        } else {
          await this.shareFrom(okno, [file], row);
        }
      } catch (e) {
        console.error('[danubra] PDF', e);
        if (mode === 'print') {
          // Tlač nesmie zlyhať len preto, že sa nepodarilo PDF do archívu.
          this.msg(okno, `Do dokumentov sa papier neuložil: ${UI.esc(e.message || e)}. Tlač sa otvorí aj tak.`);
          this.printNow(okno);
        } else {
          this.msg(okno, `PDF sa nepodarilo spraviť: ${UI.esc(e.message || e)}
            <button class="btn btn-primary btn-sm" onclick="window.print()">Tlačiť namiesto toho</button>`);
        }
      } finally { okno.__busy = false; }
    },

    /** Otvorí tlač prehliadača v okne dokumentu. */
    printNow(okno) {
      try { okno.focus(); okno.print(); } catch (e) { console.error('[danubra] tlač', e); }
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

    /**
     * PDF bez otvárania okna — pre balík, kde treba naraz štyri papiere.
     * Dokument sa vykreslí v neviditeľnom ráme v šírke A4, spraví sa z neho
     * PDF a uloží sa do dokumentov, rovnako ako cez tlačidlo PDF.
     * @returns {Promise<{ row: Object|null, file: File }>}
     */
    async renderPdf(html, meta = {}) {
      const fr = document.createElement('iframe');
      fr.setAttribute('aria-hidden', 'true');
      fr.style.cssText = 'position:fixed;left:-12000px;top:0;width:900px;height:1300px;border:0;visibility:hidden;';
      document.body.appendChild(fr);
      try {
        const okno = fr.contentWindow;
        this.show(okno, html, meta);
        // Rám potrebuje chvíľu na rozloženie a písma.
        await new Promise(r => setTimeout(r, 150));
        const blob = await this.makePdf(okno);
        const name = A().fileName({ ...meta, date: new Date() });
        const file = new File([blob], name, { type: 'application/pdf' });
        const row = await this.store(blob, { ...meta, file_name: name });
        return { row, file };
      } finally {
        fr.remove();
      }
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
      document.querySelectorAll(`.dl-row[data-dl-row="${CSS.escape(id)}"]`).forEach(r => r.classList.toggle('is-picked', !!on));
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
    /** Starý vstup na filter (druh, hľadanie) — teraz nastaví filter zoznamu. */
    setF(k, v) {
      this.filter[k] = v;
      if (window.DataList && DataList._reg.dokumenty && Danubra.route === 'archive') {
        return DataList.set('dokumenty', k === 'group' ? 'druh' : 'q', k === 'group' ? (v ? [v] : []) : v);
      }
      return Danubra.renderRoute();
    },

    async view(el) {
      el.innerHTML = UI.loading();
      await this.load(true);
      const names = await this.names();
      this._viewNames = names;
      const rows = A().latest(this.rows).map(r => this.listRow(r, names));
      const spolu = rows.length;
      // Zoznam je spoločný komponent (`DataList`). Dovtedy tu boli skupiny
      // podľa ľudí a firiem, pilulky druhu a hľadanie v názve — zoskupenie
      // podľa toho, komu dokument patrí, zostalo predvolené.
      el.innerHTML = Danubra.header(Danubra.labelOf('archive'),
        `${spolu} ${Shell.plural(spolu, 'dokument', 'dokumenty', 'dokumentov')} · triedené podľa ľudí a firiem`)
        + this.barHtml()
        + DataList.html(this.listConfig(rows));
    },

    /** Riadok zoznamu Dokumenty: dokument (posledná verzia) a komu patrí. */
    listRow(r, names = {}) {
      const o = A().ownerOf(r);
      const key = `${o.type}:${o.id}`;
      const FALLBACK = { worker: 'Živnostník', partner: 'Firma', subcontract: 'Zákazka' };
      return {
        id: r.id, r, owner: o, ownerKey: key,
        ownerName: names[key] || FALLBACK[o.type] || 'Bez priradenia',
        subName: r.subcontract_id && o.type !== 'subcontract' ? (names[`subcontract:${r.subcontract_id}`] || '') : '',
        partnerName: r.partner_id && o.type === 'worker' ? (names[`partner:${r.partner_id}`] || '') : '',
        name: String(r.file_name || '').replace(/\.pdf$/, ''),
        kind: A().label(r.kind), group: A().groupOf(r.kind),
        date: String(r.created_at || '').slice(0, 10),
      };
    },

    /** Konfigurácia zoznamu Dokumenty pre `DataList`. */
    listConfig(rows) {
      const L = DanubraDataList;
      const LINK = { worker: 'worker', partner: 'partner', subcontract: 'subcontract' };
      const TYPE = [['worker', 'Ľudia'], ['partner', 'Firmy'], ['subcontract', 'Zákazky'], ['ine', 'Bez priradenia']];
      const PORADIE = { worker: 0, partner: 1, subcontract: 2, ine: 3 };
      const tone = { worker: 'blue', partner: 'green', subcontract: 'amber', ine: 'gray' };
      const ownerOrder = [...new Map(rows.map(x => [x.ownerKey, x])).values()]
        .sort((a, b) => (PORADIE[a.owner.type] - PORADIE[b.owner.type]) || a.ownerName.localeCompare(b.ownerName, 'sk'))
        .map(x => x.ownerKey);
      const nameOf = (k) => (rows.find(x => x.ownerKey === k) || {}).ownerName || 'Bez priradenia';
      const kb = (r) => (r.size_bytes ? `${Math.max(1, Math.round(r.size_bytes / 1024))} kB` : '');
      const pick = (x) => `<label class="dc-pick" title="Vybrať na poslanie"><input type="checkbox" ${this.picked.has(x.id) ? 'checked' : ''}
          onchange="Docs.pick('${x.id}', this.checked)" aria-label="Vybrať: ${UI.esc(x.name)}"></label>`;

      return {
        id: 'dokumenty', storageKey: 'dokumenty', label: 'Dokumenty',
        noun: ['dokument', 'dokumenty', 'dokumentov'],
        rows,
        rowClick: (x) => Docs.openFile(x.id),
        rowClass: (x) => (this.picked.has(x.id) ? 'is-picked' : ''),
        rowLabel: (x) => `Dokument ${x.name}`,
        rowActions: [
          { ico: 'edit', label: 'Premenovať', run: (x) => Docs.rename(x.id) },
          { ico: 'x', label: 'Skryť zo zoznamu', run: (x) => Docs.hide(x.id) },
        ],
        columns: [
          { key: 'vyber', label: '', width: '28px', mobile: 'badge', csv: false, render: pick },
          { key: 'nazov', label: 'Dokument', width: 'minmax(220px, 2.2fr)', mobile: 'title',
            render: (x) => `<span class="dl-title"><b>${UI.esc(x.name)}</b><small>${UI.esc([x.r.number, kb(x.r),
              x.r.older && x.r.older.length ? `${x.r.older.length} ${Shell.plural(x.r.older.length, 'staršia verzia', 'staršie verzie', 'starších verzií')}` : '']
              .filter(Boolean).join(' · '))}</small></span>`,
            sortValue: (x) => x.name, sortLabel: 'Názov' },
          { key: 'druh', label: 'Druh', width: '136px',
            render: (x) => `<span class="dl-tag">${Icon('doc', 14)}${UI.esc(x.kind)}</span>`, sortValue: (x) => x.kind },
          { key: 'komu', label: 'Pri kom', width: 'minmax(140px, 1.3fr)', mobile: 'line',
            render: (x) => `<span class="dl-two dc-owner">${LINK[x.owner.type] && x.owner.id
              ? Danubra.link(LINK[x.owner.type], x.owner.id, x.ownerName) : `<b>${UI.esc(x.ownerName)}</b>`}${
              x.subName || x.partnerName ? `<small>${UI.esc([x.partnerName, x.subName].filter(Boolean).join(' · '))}</small>` : ''}</span>`,
            sortValue: (x) => [PORADIE[x.owner.type], x.ownerName], csv: (x) => x.ownerName },
          { key: 'datum', label: 'Dátum', width: '96px',
            render: (x) => `<span class="dl-num">${UI.esc(L.fmtDay(x.date))}</span>`, sortValue: (x) => x.r.created_at, sortDir: -1 },
          { key: 'jazyk', label: 'Jazyk', width: '62px', align: 'center', hideBelow: 980,
            render: (x) => `<span class="dc-lang">${x.r.lang === 'de' ? 'DE' : 'SK'}</span>`, sortValue: (x) => x.r.lang || 'sk' },
          { key: 'odoslane', label: 'Odoslané', width: '96px', hideBelow: 1120,
            render: (x) => (x.r.sent_at ? `<span class="dl-ok">${Icon('check', 13)} ${UI.esc(L.fmtDay(x.r.sent_at, { year: false }))}</span>` : ''),
            sortValue: (x) => x.r.sent_at || null, sortDir: -1, csv: (x) => (x.r.sent_at ? L.fmtDay(x.r.sent_at) : '') },
        ],
        sort: { key: 'datum', dir: -1 },
        groups: [
          { key: 'komu', label: 'Komu patrí', value: 'ownerKey', labelOf: nameOf, order: ownerOrder,
            tone: (k) => tone[String(k).split(':')[0]] || 'gray' },
          { key: 'druh', label: 'Druh', value: 'group', labelOf: (k) => (A().GROUPS.find(g => g[0] === k) || [k, k])[1],
            order: A().GROUPS.map(g => g[0]) },
        ],
        group: 'komu',
        filters: [
          { key: 'q', type: 'search', placeholder: 'Hľadať v názvoch…', label: 'Hľadať v názve, čísle alebo mene',
            fields: ['r.file_name', 'r.title', 'r.number', 'ownerName', 'subName', 'partnerName'] },
          { key: 'druh', type: 'multi', label: 'Druh', value: 'group', options: A().GROUPS, sortOptions: false, allLabel: 'Všetky' },
          { key: 'kcomu', type: 'select', label: 'K čomu', value: (x) => x.owner.type, options: TYPE, allLabel: 'Ľudia, firmy aj zákazky' },
          { key: 'komu', type: 'select', label: 'Pri kom', value: 'ownerKey', optionLabel: (k) => nameOf(k), allLabel: 'Všetci' },
          { key: 'obdobie', type: 'range-date', label: 'Obdobie', field: 'date' },
          { key: 'zakazka', type: 'select', label: 'Zákazka', value: (x) => x.r.subcontract_id, more: true,
            optionLabel: (v) => (this._viewNames || {})[`subcontract:${v}`] || 'Zákazka', allLabel: 'Všetky zákazky' },
          { key: 'jazyk', type: 'select', label: 'Jazyk', value: (x) => (x.r.lang === 'de' ? 'de' : 'sk'), more: true,
            options: [['sk', 'Slovenčina'], ['de', 'Nemčina']], allLabel: 'Oba jazyky' },
          { key: 'neodoslane', type: 'toggle', label: 'Neodoslané', test: (x) => !x.r.sent_at, more: true,
            hint: 'Dokumenty, ktoré sa z appky ešte neposlali („Poslať" alebo e-mailom).' },
        ],
        empty: { ico: 'doc', title: 'Zatiaľ žiadne dokumenty',
          sub: 'Keď pri zmluve, GDPR, objednávke či faktúre kliknete na „Stiahnuť PDF" alebo „Tlačiť", uloží sa sem — k človeku a k firme.' },
        export: {
          name: ['dokumenty'],
          columns: [
            ['Dokument', x => x.name], ['Druh', x => x.kind], ['Číslo', x => x.r.number],
            ['Pri kom', x => x.ownerName], ['Firma', x => x.partnerName], ['Zákazka', x => x.subName],
            ['Dátum', x => x.date], ['Jazyk', x => (x.r.lang === 'de' ? 'DE' : 'SK')],
            ['Odoslané', x => (x.r.sent_at ? String(x.r.sent_at).slice(0, 10) : '')], ['Súbor', x => x.r.file_name],
          ],
        },
      };
    },
  };

  window.Docs = Docs;
  if (window.Danubra && Danubra.views) Danubra.views.archive = function (el) { return Docs.view(el); };
})();
