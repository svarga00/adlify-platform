// ============================================================================
// DANUBRA — Tlačoviny punds: vizitky, obálka DL, hlavičkový list
// ============================================================================
// Podľa návrhu „PUNDS — Tlačoviny a e-maily". Vizitka a obálka sa stiahnu
// ako PDF pre tlačiareň (vizitka so spadávkou 3 mm), list sa otvorí ako
// dokument — dá sa upraviť, stiahnuť, poslať a uloží sa do Dokumentov.
// Rozloženie strán: lib/documents/printwork.js, list: templates.letter().
// ============================================================================
(function () {
  const PW = () => window.DanubraPrintwork;
  const PDF_LIB = './vendor/html2pdf-0.10.1.bundle.min.js';

  async function lib() {
    if (window.html2pdf) return;
    await new Promise((ok, err) => {
      const s = document.createElement('script');
      s.src = PDF_LIB; s.onload = ok; s.onerror = () => err(new Error('Knižnica na PDF sa nenačítala'));
      document.head.appendChild(s);
    });
  }

  const Print = {
    tab: 'card',
    card: null, env: null, letter: null,

    defaults() {
      const sup = Danubra.supplier ? Danubra.supplier() : {};
      const me = (Danubra.members || []).find((m) => Danubra.user && m.user_id === Danubra.user.id) || {};
      if (!this.card) {
        this.card = { name: me.full_name || '', role: 'Koordinátor projektov', phone: sup.phone || '', email: (Danubra.user && Danubra.user.email) || sup.email || '',
          web: 'punds.sk', address: sup.address || '', lang: 'sk', variant: 'dark' };
      }
      if (!this.env) this.env = { sender: `${sup.name || 'Partner und Service s. r. o.'}\n${sup.address || ''}`.trim(), to: '' };
      if (!this.letter) this.letter = { to: '', subject: '', body: '', signer: me.full_name || '', role: '', lang: 'sk', place: '' };
    },

    view(el) {
      this.defaults();
      Danubra.setActions('');
      const tabs = [['card', 'Vizitka', 'user'], ['env', 'Obálka DL', 'mail'], ['letter', 'Hlavičkový list', 'doc']];
      el.innerHTML = Danubra.header(Danubra.labelOf('printwork'), 'Vizitky, obálky a listy v podobe punds — PDF pre tlačiareň')
        + `<div class="sec-tabs" role="tablist">${tabs.map(([k, l, i]) => `<button role="tab" class="sec-tab${this.tab === k ? ' on' : ''}" onclick="Print.setTab('${k}')">${Icon(i, 14)} ${l}</button>`).join('')}</div>
        <div class="pw-grid">
          <div class="card card-pad"><form id="pw-form" onsubmit="event.preventDefault()">${this.formHtml()}</form></div>
          <div class="card card-pad pw-prev-card"><div class="card-head"><div class="card-title">Náhľad${Help.btn('screen.printwork', { size: 13 })}</div></div><div id="pw-prev" class="pw-prev"></div>
            <div class="js-acts">${this.tab === 'letter'
              ? `<button class="btn btn-primary" onclick="Print.openLetter()">${Icon('doc', 15)} Otvoriť list</button>`
              : `<button class="btn btn-primary" id="pw-go" onclick="Print.download()">${Icon('download', 15)} Stiahnuť PDF na tlač</button>${UI.tip(
                'Stiahne PDF pripravené pre tlačiareň: presný rozmer, každá strana zvlášť (pri vizitke líce a rub). Pošlite ho tlačiarni tak, ako je — nič neupravujte ani nezmenšujte.')}`}</div>
            <p class="card-note">${this.tab === 'card' ? `Vizitka 85 × 55 mm, PDF má 91 × 61 mm (spadávka 3 mm).${UI.tip('Spadávka = 3 mm navyše na každej strane. Farba a obrázky idú až cez okraj a tlačiareň ich po tlači odreže — takže na hrane vizitky nikdy neostane biely prúžok.')} Tlačiareň ju oreže na presný rozmer. Odporúčanie: matný papier 400 g, tlač 4/4.${UI.tip('400 g = hrubý, tuhý papier, aký majú bežné vizitky. Tlač 4/4 = farebne z oboch strán (4 farby na líci, 4 na rube). Toto stačí povedať tlačiarni.')}`
              : this.tab === 'env' ? `Obálka DL 220 × 110 mm.${UI.tip('DL je bežná podlhovastá obálka, do ktorej sa zmestí list A4 zložený na tretiny. Tlačí sa bez spadávky, takže sa dá tlačiť aj na hotové obálky.')} Adresát je v mieste okienka vpravo; bez adresáta sa vytlačí len odosielateľ.`
              : `List sa otvorí ako dokument — dá sa ešte upraviť, stiahnuť ako PDF, poslať a uloží sa do Dokumentov.${UI.tip('Hlavičkový list = firemný papier: hore logo punds, telefón, e-mail a web, dole údaje firmy. Berú sa z Nastavení (Fakturačné údaje); ak tam máte nahratú pečiatku, pridá sa nad podpis.')}`}</p></div>
        </div>`;
      const f = document.getElementById('pw-form');
      f.addEventListener('input', () => this.read());
      f.addEventListener('change', () => this.read());
      this.preview();
    },

    setTab(t) { this.tab = t; Danubra.renderRoute(); },

    formHtml() {
      if (this.tab === 'card') {
        const c = this.card;
        return `<div class="form-grid">
          ${UI.field('name', 'Meno a priezvisko', { value: c.name, required: true })}
          ${UI.field('role', 'Funkcia', { value: c.role, placeholder: 'Koordinátor projektov' })}
          ${UI.field('phone', 'Telefón', { value: c.phone })}
          ${UI.field('email', 'E-mail', { type: 'email', value: c.email })}
          ${UI.field('web', 'Web', { value: c.web, options: [['punds.sk', 'punds.sk'], ['punds.eu', 'punds.eu']],
            tip: 'Ktorý web bude na vizitke. punds.sk = pre remeselníkov a uchádzačov, punds.eu = pre nemecké firmy.' })}
          ${UI.field('variant', 'Variant', { value: c.variant, options: [['dark', 'Tmavá (1a/1b)'], ['orange', 'Biela s oranžovým rubom (1c)']],
            tip: 'Tmavá: tmavomodré líce s logom, biely rub s kontaktmi. Biela: biele líce s oranžovým pásom, oranžový rub. 1a–1c sú len čísla z grafického návrhu punds.' })}
        </div>
        ${UI.field('address', 'Adresa', { value: c.address,
          tip: 'Vytlačí sa len na tmavej variante (na rube). Biela s oranžovým rubom adresu nemá — je tam len telefón, e-mail a web.' })}`;
      }
      if (this.tab === 'env') {
        return `${UI.field('sender', 'Odosielateľ', { type: 'textarea', rows: 3, value: this.env.sender,
            tip: 'Vytlačí sa vľavo dole pod logom. Každý riadok tu = nový riadok na obálke.' })}
          ${UI.field('to', 'Adresát (voliteľné)', { type: 'textarea', rows: 5, value: this.env.to, placeholder: 'Firma GmbH\nMusterstraße 12\n28195 Bremen\nDeutschland',
            tip: 'Vytlačí sa vpravo, kde býva okienko; prvý riadok tučne. Ak máte obálky s okienkom, nechajte prázdne. Prázdne = jedno PDF použijete pre všetky obálky.' })}`;
      }
      const l = this.letter;
      return `<div class="form-grid">
          ${UI.field('lang', 'Jazyk listu', { value: l.lang, options: [['sk', 'Slovensky'], ['de', 'Nemecky']],
            tip: 'Podľa jazyka sa napíšu pevné slová listu: Adresát / Empfänger, Vec / Betreff a S pozdravom / Mit freundlichen Grüßen. Samotný text listu píšete sami.' })}
          ${UI.field('place', 'Miesto', { value: l.place, placeholder: 'Nové Zámky',
            tip: 'Mesto, ktoré sa vytlačí vpravo nad dnešným dátumom. Prázdne = mesto z adresy firmy v Nastaveniach.' })}
        </div>
        ${UI.field('to', 'Adresát', { type: 'textarea', rows: 4, value: l.to, placeholder: 'Firma GmbH\nMusterstraße 12\n28195 Bremen\nDeutschland' })}
        ${UI.field('subject', 'Vec', { value: l.subject, placeholder: 'Ponuka na zabezpečenie zváračov MIG/MAG',
          tip: 'Krátko, o čom list je. Vytlačí sa tučne nad textom ako „Vec: …".' })}
        ${UI.field('body', 'Text (odstavce oddeľte prázdnym riadkom)', { type: 'textarea', rows: 9, value: l.body, placeholder: 'Dobrý deň,\n\nďakujeme za Váš dopyt…' })}
        <div class="form-grid">
          ${UI.field('signer', 'Podpis — meno', { value: l.signer })}
          ${UI.field('role', 'Podpis — funkcia', { value: l.role, placeholder: 'Koordinátor projektov' })}
        </div>`;
    },

    read() {
      const d = UI.formData(document.getElementById('pw-form'));
      if (this.tab === 'card') Object.assign(this.card, d, { lang: d.web === 'punds.eu' ? 'de' : 'sk' });
      else if (this.tab === 'env') Object.assign(this.env, d);
      else Object.assign(this.letter, d);
      this.preview();
    },

    /** Strany na tlač podľa záložky. */
    layout() { return this.tab === 'card' ? PW().card(this.card) : PW().envelope(this.env); },

    preview() {
      const box = document.getElementById('pw-prev');
      if (!box) return;
      if (this.tab === 'letter') {
        const html = DanubraPapers.letter({ supplier: Danubra.supplier(), ...this.letter });
        box.innerHTML = '<iframe class="pw-letter" title="Náhľad listu"></iframe>';
        box.querySelector('iframe').srcdoc = html.replace('<div class="toolbar">', '<div class="toolbar" style="display:none">');
        return;
      }
      const L = this.layout();
      // Náhľad zmenšený na šírku stĺpca; strany pod sebou.
      const w = Math.min(box.clientWidth || 520, 560);
      const scale = w / (L.w * 3.7795);
      box.innerHTML = L.faces.map((f, i) => `<div class="pw-face-wrap" style="width:${L.w * 3.7795 * scale}px;height:${L.h * 3.7795 * scale}px">
        <div style="transform:scale(${scale});transform-origin:0 0;">${f}</div></div>
        ${this.tab === 'card' ? `<div class="pw-cap">${i ? 'Rub' : 'Líce'} · ${PW().CARD.w} × ${PW().CARD.h} mm + spadávka</div>` : ''}`).join('');
    },

    async download() {
      const btn = document.getElementById('pw-go');
      if (this.tab === 'card' && !this.card.name) return UI.toast('Vyplňte meno', 'err');
      if (btn) { btn.disabled = true; btn.textContent = 'Pripravujem PDF…'; }
      try {
        await lib();
        try { await document.fonts.ready; } catch (e) { /* bez fontov */ }
        const L = this.layout();
        const stage = document.createElement('div');
        stage.style.cssText = 'position:absolute;left:-20000px;top:0;';
        stage.innerHTML = L.faces.join('');
        document.body.appendChild(stage);
        const pages = [...stage.querySelectorAll('.pw-face')];
        // Strana presne v bodoch, o bod nižšia ako list — inak knižnica
        // zlomok bodu prenesie na ďalšiu stranu a z vizitky sú 4 strany.
        const MM = 96 / 25.4, wpx = Math.floor(L.w * MM), hpx = Math.floor(wpx * L.h / L.w) - 1;
        pages.forEach((el) => { el.style.width = `${wpx}px`; el.style.height = `${hpx}px`; });
        const orient = L.w >= L.h ? 'landscape' : 'portrait';
        const opts = { margin: 0, image: { type: 'jpeg', quality: 0.97 },
          html2canvas: { scale: 5, useCORS: true, backgroundColor: null, logging: false, scrollX: 0, scrollY: 0 },
          jsPDF: { unit: 'mm', format: [L.w, L.h], orientation: orient, compress: true }, pagebreak: { mode: [] } };
        let blob;
        try {
          let w = window.html2pdf().set(opts).from(pages[0]).toPdf();
          for (const p of pages.slice(1)) w = w.get('pdf').then((pdf) => { pdf.addPage([L.w, L.h], orient); }).from(p).toContainer().toCanvas().toPdf();
          blob = await w.outputPdf('blob');
        } finally { stage.remove(); }
        const name = this.tab === 'card' ? PW().fileName('Vizitka', this.card.name) : PW().fileName('Obálka DL', (this.env.to || '').split('\n')[0]);
        Docs.download(window, new File([blob], name, { type: 'application/pdf' }));
        UI.toast('PDF stiahnuté', 'ok');
      } catch (e) {
        console.error('[danubra] tlačoviny', e);
        UI.toast(`PDF sa nepodarilo: ${e.message || e}`, 'err');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = `${Icon('download', 15)} Stiahnuť PDF na tlač`; }
      }
    },

    openLetter() {
      const l = this.letter;
      if (!l.body) return UI.toast('Napíšte text listu', 'err');
      const html = DanubraPapers.letter({ supplier: Danubra.supplier(), ...l });
      Docs.show(window.open('', '_blank'), html, { kind: 'list', title: l.lang === 'de' ? 'Brief' : 'List',
        who: (l.to || '').split('\n')[0] || '', lang: l.lang });
    },
  };

  window.Print = Print;
  Danubra.views.printwork = function (el) { return Print.view(el); };
})();
