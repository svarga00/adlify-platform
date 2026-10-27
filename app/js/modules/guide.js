// ============================================================================
// DANUBRA — Návod k appke (Dnes → Návod)
// ============================================================================
// „Myslíš, že by sme boli schopní napísať návod k celej aplikácii?" Návod je
// v appke, nie v šuplíku: krok za krokom tak, ako ide práca, a pri každom
// kroku tlačidlo, ktoré otvorí presne tú obrazovku. Ten istý obsah sa dá
// stiahnuť ako PDF a ako ťahák na jednu stranu A4.
//
// Obsah je v lib/guide.js (DanubraGuide), papiere v lib/documents/guide-doc.js,
// sprievodca s bublinami v js/components/tour.js.
// ============================================================================
(function () {
  const G = () => window.DanubraGuide || { CHAPTERS: [], CHEAT: {}, GLOSSARY: [] };

  const Navod = {
    ch: 0,
    q: '',

    view(el) {
      const chapters = G().CHAPTERS || [];
      if (this.ch >= chapters.length) this.ch = 0;
      Danubra.setActions(`
        ${window.Tour ? `<button class="btn btn-outline btn-sm" onclick="Tour.start()">${Icon('zap', 14)} Spustiť sprievodcu</button>` : ''}
        <button class="btn btn-outline btn-sm" onclick="Navod.cheat()">${Icon('print', 14)} Ťahák na A4</button>
        <button class="btn btn-primary btn-sm" onclick="Navod.pdf()">${Icon('download', 14)} Návod ako PDF</button>`);
      el.innerHTML = Danubra.header('Návod', 'Krok za krokom tak, ako ide práca — od dopytu po zaplatenú faktúru')
        + `<div class="gd-layout">
          <nav class="gd-nav card card-pad" aria-label="Kapitoly návodu">
            <label class="kpi-search gd-search">${Icon('search', 14)}
              <input type="search" id="gd-q" placeholder="Hľadať v návode…" value="${UI.esc(this.q)}"
                oninput="Navod.search(this.value)" autocomplete="off"></label>
            <ol class="gd-chapters">${chapters.map((c, i) => `
              <li><button type="button" class="gd-ch-btn${i === this.ch && !this.q ? ' active' : ''}" onclick="Navod.go(${i})">
                <span class="gd-num">${i + 1}</span><span>${UI.esc(c.title)}</span></button></li>`).join('')}
              ${(G().GLOSSARY || []).length ? `<li><button type="button" class="gd-ch-btn${this.ch === -1 && !this.q ? ' active' : ''}" onclick="Navod.go(-1)">
                <span class="gd-num">${Icon('help', 13)}</span><span>Slovníček pojmov</span></button></li>` : ''}
            </ol>
          </nav>
          <div class="gd-body" id="gd-body">${this.q ? this.searchHtml() : this.ch === -1 ? this.glossaryHtml() : this.chapterHtml(this.ch)}</div>
        </div>`;
    },

    stepHtml(s, num) {
      const can = s.open && s.open.route && Danubra.routeAvailable(s.open.route);
      return `<article class="gd-step card card-pad">
        <div class="gd-step-head"><span class="gd-step-n">${UI.esc(num)}</span><h3>${UI.esc(s.title)}</h3></div>
        ${s.what ? `<p class="gd-what">${UI.esc(s.what)}</p>` : ''}
        ${(s.how || []).length ? `<ol class="gd-how">${s.how.map(h => `<li>${UI.esc(h)}</li>`).join('')}</ol>` : ''}
        ${s.tip ? `<div class="warnbox gd-tip">${Icon('alert', 14)} <span>${UI.esc(s.tip)}</span></div>` : ''}
        ${s.example ? `<p class="muted-sm gd-ex">${Icon('info', 12)} Príklad zo vzorových dát: ${UI.esc(s.example)}</p>` : ''}
        ${can ? `<div class="btn-row"><button class="btn btn-outline btn-sm" onclick="Danubra.go('${s.open.route}')">
          ${Icon('chevron', 14)} ${UI.esc(s.open.label || `Otvoriť ${Danubra.labelOf(s.open.route)}`)}</button></div>` : ''}
      </article>`;
    },

    chapterHtml(i) {
      const chapters = G().CHAPTERS || [];
      const c = chapters[i];
      if (!c) return UI.empty('help', 'Návod sa pripravuje', 'Obsah návodu sa nenačítal.');
      return `<header class="gd-ch-head"><span class="gd-big">${i + 1}</span>
          <div><h2>${UI.esc(c.title)}</h2>${c.lead ? `<p>${UI.esc(c.lead)}</p>` : ''}</div></header>
        ${(c.steps || []).map((s, si) => this.stepHtml(s, `${i + 1}.${si + 1}`)).join('')}
        <div class="gd-pager">
          ${i > 0 ? `<button class="btn btn-ghost" onclick="Navod.go(${i - 1})">${Icon('back', 14)} ${UI.esc(chapters[i - 1].title)}</button>` : '<span></span>'}
          ${i < chapters.length - 1 ? `<button class="btn btn-primary" onclick="Navod.go(${i + 1})">${UI.esc(chapters[i + 1].title)} ${Icon('chevron', 14)}</button>` : ''}
        </div>`;
    },

    glossaryHtml() {
      return `<header class="gd-ch-head"><span class="gd-big">${Icon('help', 22)}</span>
          <div><h2>Slovníček pojmov</h2><p>Skratky a nemecké slová, ktoré v appke a na stavbe stretnete.</p></div></header>
        <dl class="gd-gloss card card-pad">${(G().GLOSSARY || []).map(g => `<div><dt>${UI.esc(g.term)}</dt><dd>${UI.esc(g.text)}</dd></div>`).join('')}</dl>`;
    },

    searchHtml() {
      const q = this.q.toLowerCase();
      const hits = [];
      (G().CHAPTERS || []).forEach((c, i) => (c.steps || []).forEach((s, si) => {
        const text = [s.title, s.what, ...(s.how || []), s.tip, s.example].join(' ').toLowerCase();
        if (text.includes(q)) hits.push(this.stepHtml(s, `${i + 1}.${si + 1}`));
      }));
      const gl = (G().GLOSSARY || []).filter(g => `${g.term} ${g.text}`.toLowerCase().includes(q));
      return `<p class="muted">Výsledky pre „${UI.esc(this.q)}": ${hits.length + gl.length}</p>
        ${hits.join('')}
        ${gl.length ? `<dl class="gd-gloss card card-pad">${gl.map(g => `<div><dt>${UI.esc(g.term)}</dt><dd>${UI.esc(g.text)}</dd></div>`).join('')}</dl>` : ''}
        ${!hits.length && !gl.length ? UI.empty('search', 'Nič sa nenašlo', 'Skúste iné slovo — napríklad „hodiny", „faktúra" alebo „A1".') : ''}`;
    },

    go(i) { this.ch = i; this.q = ''; Danubra.renderRoute(); window.scrollTo({ top: 0 }); },
    search(v) {
      this.q = String(v || '').trim();
      const b = document.getElementById('gd-body');
      if (b) b.innerHTML = this.q ? this.searchHtml() : (this.ch === -1 ? this.glossaryHtml() : this.chapterHtml(this.ch));
    },

    pdf() {
      const html = DanubraGuideDoc.guidePdf({ guide: G(), supplier: Danubra.supplier() });
      Docs.show(window.open('', '_blank'), html, { kind: 'navod', title: 'Návod k appke', lang: 'sk' });
    },
    cheat() {
      const html = DanubraGuideDoc.cheatSheet({ guide: G(), supplier: Danubra.supplier() });
      Docs.show(window.open('', '_blank'), html, { kind: 'navod', title: 'Ťahák', lang: 'sk' });
    },
  };

  window.Navod = Navod;
  Danubra.views.navod = function (el) { return Navod.view(el); };
})();
