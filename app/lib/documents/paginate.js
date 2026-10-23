// ============================================================================
// DANUBRA — rozdelenie dokumentu na strany A4 pred PDF
// ============================================================================
// „Aby bolo všetko vidieť pri exporte PDF, aby to bolo A4 a nech sa nič
// neoreže."
//
// Knižnica na PDF (html2pdf) robila z celého dokumentu jeden obrázok a ten
// krájala na strany. Dve chyby z toho:
//   * na iPhone má obrázok v prehliadači strop (~16 mil. bodov) — dlhšia
//     zmluva ho prekročila a koniec dokumentu chýbal,
//   * strih padol kamkoľvek — aj cez stred riadku alebo podpisu.
//
// Tu sa dokument rozloží na strany ešte v HTML: každá strana je samostatný
// blok presne na šírku a výšku A4 (bez okrajov) a do PDF sa kreslí po jednej.
// Nič sa nekrája — odsek, bod zoznamu, riadok tabuľky ani podpisy sa
// nerozdelia; nadpis nezostane sám na konci strany; pri tabuľke sa hlavička
// zopakuje a číslovaný zoznam pokračuje správnym číslom.
// ============================================================================
(function () {
  const MM = 96 / 25.4;                     // CSS px na milimeter
  /** Šírka a výška obsahu strany A4 v px pri daných okrajoch (mm). */
  function pageBox(marginMm = 14) {
    const width = Math.floor((210 - 2 * marginMm) * MM);
    // Výška z tej istej šírky a pomeru strany, ako ju ráta knižnica, a pár bodov
    // rezervy — inak by sa o 1 px vyššia strana rozdelila na dve a vznikla by prázdna.
    const height = Math.floor(width * (297 - 2 * marginMm) / (210 - 2 * marginMm)) - 8;
    return { width, height };
  }

  // Čo sa nikdy nedelí. Všetko ostatné sa smie rozdeliť medzi strany, ak je vysoké.
  const ATOM = 'p,li,tr,h1,h2,h3,h4,h5,h6,img,svg,canvas,pre,blockquote,.sigs,.sig,.bil,.ss-row,.total,.total-box,'
    + '.pay,.note,.code,.codes,.head,.cols,.stamp-inv,.foot,.kv,.row,.edit-hint';
  const HEAD = 'h1,h2,h3,h4,h5,h6,.ss-h,.lbl,.form-section,.par-h';
  const SPLIT = new Set(['DIV', 'SECTION', 'ARTICLE', 'OL', 'UL', 'TABLE', 'TBODY', 'MAIN']);

  /**
   * @param {Document} doc     dokument okna
   * @param {Element}  source  obsah dokumentu (.pf-main)
   * @param {Object}   o       { width, height } strany v px
   * @returns {{ pages: Element[], stage: Element }} strany (v skrytom „pódiu")
   */
  function paginate(doc, source, o = pageBox()) {
    const W = o.width, H = o.height;
    const stage = doc.createElement('div');
    stage.className = 'pdf-stage';
    stage.setAttribute('aria-hidden', 'true');
    stage.style.cssText = `position:absolute;left:-20000px;top:0;width:${W}px;background:#fff;`;
    doc.body.appendChild(stage);

    // Zdroj na meranie — rovnaká šírka ako strana.
    const flow = doc.createElement('div');
    flow.style.cssText = `width:${W}px;`;
    flow.innerHTML = source.innerHTML;
    stage.appendChild(flow);

    // 1. Ploché poradie blokov, každý s cestou predkov (na naklonovanie).
    const win = doc.defaultView || window;
    /**
     * Smie sa prvok rozdeliť medzi strany? Len „škatuľa" pod sebou uložených
     * blokov: žiadny voľný text (ten by sa pri delení stratil), žiadne prvky
     * v riadku a nie flex/grid (stĺpce vedľa seba by sa rozsypali pod seba).
     */
    const canSplit = (ch) => {
      if (!SPLIT.has(ch.tagName) || !ch.children.length || ch.matches(ATOM)) return false;
      if (Array.from(ch.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())) return false;
      const disp = win.getComputedStyle(ch).display;
      if (/flex|grid/.test(disp)) return false;
      return Array.from(ch.children).every((x) => {
        const d = win.getComputedStyle(x).display;
        return !/^inline/.test(d) || x.tagName === 'BR';
      });
    };
    const blocks = [];
    const walk = (el, path) => {
      for (const ch of Array.from(el.children)) {
        if (ch.tagName === 'THEAD' || ch.tagName === 'COLGROUP' || ch.tagName === 'CAPTION') continue;
        const vyska = ch.getBoundingClientRect().height;
        const zoznam = ['OL', 'UL', 'TABLE', 'TBODY'].includes(ch.tagName);
        const rozdelit = canSplit(ch) && (zoznam || vyska > Math.min(220, H * 0.25));
        if (rozdelit) walk(ch, [...path, ch]);
        else blocks.push({ el: ch, path, head: ch.matches(HEAD), h: vyska });
      }
    };
    walk(flow, []);

    // 2. Skladanie strán.
    const pages = [];
    let page = null, chainSrc = [], chainDst = [], placed = 0;
    const newPage = () => {
      page = doc.createElement('div');
      page.className = 'pdf-page';
      // Bez overflow:hidden — blok vyšší než strana (veľmi zriedka) sa radšej
      // prenesie na ďalšiu stranu knižnicou, než aby sa orezal.
      page.style.cssText = `width:${W}px;background:#fff;display:flow-root;`;
      stage.appendChild(page);
      pages.push(page);
      chainSrc = []; chainDst = []; placed = 0;
    };
    /** Zabezpečí na strane tých istých predkov, ako má blok (plytké kópie). */
    const ensure = (path) => {
      let i = 0;
      while (i < chainSrc.length && i < path.length && chainSrc[i] === path[i]) i++;
      chainSrc.length = i; chainDst.length = i;
      for (let k = i; k < path.length; k++) {
        const src = path[k];
        const c = src.cloneNode(false);
        if (src.tagName === 'TABLE') {
          const th = src.querySelector(':scope > thead');
          if (th) c.appendChild(th.cloneNode(true));       // hlavička tabuľky na každej strane
        }
        (chainDst[k - 1] || page).appendChild(c);
        chainSrc.push(src); chainDst.push(c);
      }
      return chainDst[chainDst.length - 1] || page;
    };
    /** Číslovaný zoznam pokračuje správnym číslom aj na ďalšej strane. */
    const fixOl = (li) => {
      const ol = li.parentElement && chainDst.includes(li.parentElement) ? li.parentElement : null;
      if (!ol || ol.tagName !== 'OL' || ol.children.length !== 1) return;
      const src = chainSrc[chainDst.indexOf(ol)];
      const start = Number(src.getAttribute('start') || 1);
      const idx = Array.from(src.children).filter(x => x.tagName === 'LI').indexOf(li.__src);
      if (idx > 0) ol.setAttribute('start', String(start + idx));
    };
    const place = (b) => {
      const host = ensure(b.path);
      const c = b.el.cloneNode(true);
      c.__src = b.el;
      host.appendChild(c);
      if (c.tagName === 'LI') fixOl(c);
      return c;
    };

    newPage();
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      let c = place(b);
      placed++;
      if (page.scrollHeight > H && placed > 1) {
        c.remove();
        // Prázdne obaly, ktoré zostali po vybratí bloku, sa odstránia.
        for (let k = chainDst.length - 1; k >= 0; k--) {
          const d = chainDst[k];
          const len = d.tagName === 'TABLE' ? d.querySelectorAll(':scope > :not(thead)').length : d.childNodes.length;
          if (!len) d.remove(); else break;
        }
        newPage();
        c = place(b);
        placed = 1;
      }
      // Nadpis nezostane sám na spodku strany — ak sa za ním nič nezmestí, ide na novú.
      if (b.head && blocks[i + 1] && placed > 1) {
        const n = place(blocks[i + 1]);
        const nevojde = page.scrollHeight > H;
        n.remove();
        if (nevojde) {
          c.remove();
          newPage();
          place(b);
          placed = 1;
        }
      }
    }
    flow.remove();
    return { pages: pages.filter(p => p.textContent.trim() || p.querySelector('img,svg')), stage };
  }

  const API = { paginate, pageBox, ATOM };
  if (typeof window !== 'undefined') window.DanubraPaginate = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
