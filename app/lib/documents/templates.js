// ============================================================================
// DANUBRA — Dokumenty (§8): jedna HTML šablóna, viac variantov
//
// Globálne sa to volá `DanubraPapers`, nie `DanubraDocs`. Ten názov si totiž
// brala aj knižnica o dokladoch živnostníka (`lib/staffing/documents.js`),
// ktorá sa načítava neskôr — a ticho tú túto prepísala. Tlač faktúry,
// potvrdenia objednávky aj pokynov na ubytovanie preto v prehliadači padala
// na „DanubraDocs.invoice is not a function", hoci v testoch všetko prešlo:
// tam sa načítava cez `require`, kde sa nič neprepisuje.
// ============================================================================
// Varianty: offer, order_confirmation, payment_request, owner_confirmation (DE),
//           handover, invoice
// Každý dokument má aj skrátenú textovú verziu pre SMS/WhatsApp.
//
// KRITICKÉ (§5.1): adresa a kontakt na ubytovateľa smú byť len v handover
// (ktorý vzniká až po úhrade) — nikdy v offer ani order_confirmation.
// ============================================================================
(function () {
  // Vzhľad podľa návrhu „Tlačoviny a e-maily": tmavomodrá a oranžová,
  // písmo Outfit na nadpisy a sumy, Hanken Grotesk na text. Rovnaká hlavička
  // a päta na faktúre, výkaze, objednávke aj zmluve — papiere pre nemecké
  // firmy aj pre živnostníkov vyzerajú ako od jednej firmy.
  // Farby značky DANUBRA: oranžová #F07E22, modrá #1E4FD8 a tmavomodrá #0A1B3D.
  const BRAND = {
    orange: '#F07E22', blue: '#1E4FD8', navy: '#0A1B3D', sub: '#4A5570', mute: '#6F7A92',
    lbl: '#8C97AD', line: '#E6E8EC', soft: '#F4F4F1',
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /**
   * Suma. Nemecký doklad číta Nemec, takže aj čísla majú byť v tvare, aký
   * pozná: 5.280,00 € a nie 5 280,00 €. Je to drobnosť, ktorá rozhoduje
   * o tom, či doklad vyzerá ako od domácej firmy alebo ako preklad.
   */
  const money = (n, cur = 'EUR', loc = 'sk-SK') => Number(n || 0).toLocaleString(loc,
    { style: 'currency', currency: cur, minimumFractionDigits: 2 });
  const date = (d) => d ? new Date(d).toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  /** Merná jednotka v jazyku dokladu (mes → Monat). Bez knižnice faktúr ostane, ako je. */
  function unitOut(unit, lang) {
    const IV = (typeof window !== 'undefined' && window.DanubraInvoice)
      || (typeof require !== 'undefined' && typeof module !== 'undefined' ? require('../billing/invoice.js') : null);
    return IV && IV.unitFor ? IV.unitFor(unit || '', lang) : String(unit || '');
  }
  /** Text bez diakritiky — pre SMS (GSM-7). */
  const noDia = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Logo DANUBRA (lib/brand-logo.js): znak D (oranžová pilulka a modrý oblúk)
  // a písmená ANUBRA. Znak je písmeno D, preto sa za neho slovo DANUBRA nepíše.
  const DL = (typeof window !== 'undefined' && window.DanubraBrandLogo)
    || (typeof require !== 'undefined' && typeof module !== 'undefined' ? require('../brand-logo.js') : null);
  /** Celé logo v hlavičke dokumentu — výška ako kedysi znak so slovom. */
  const LOGO = DL ? DL.logo({ h: 30, ink: BRAND.navy, cls: 'brand-logo', style: 'display:block' }) : '';
  /** Len znak D — keď v Nastaveniach ešte nie je firma. */
  const MARK = DL ? DL.mark({ h: 34, cls: 'brand-mark', style: 'display:block' }) : '';
  /** Značka je naša (DANUBRA)? Iná firma má v hlavičke svoj názov, nie naše logo. */
  const nasa = (b) => /^danubra$/i.test(String((b && b.brand) || ''));

  /**
   * Obsah bloku `.brand` v hlavičke: naša firma má celé logo, iná firma so
   * značkou jej slovo (a pod ním celý názov), firma bez značky `bezZnacky`
   * (jej celý názov). Bez firmy zostane len znak D.
   */
  function brandHtml(b, bezZnacky = '') {
    const sub = b.sub ? `<div class="brand-sub">${esc(b.sub)}</div>` : '';
    if (nasa(b)) return sub ? `<div>${LOGO}${sub}</div>` : LOGO;
    if (b.brand) return `<div><div class="brand-word">${esc(b.brand)}</div>${sub}</div>`;
    return bezZnacky || MARK;
  }

  /**
   * Značka v hlavičke: krátky názov (DANUBRA). Krátky názov je z Nastavení
   * (`brand`); kým tam nie je, pri našej firme („Partner und Service" alebo
   * „DANUBRA") je to DANUBRA. Pod slovom DANUBRA sa celý názov nepíše —
   * právny názov je v údajoch strán a v päte. Iná firma so zadanou značkou
   * má pod ňou celý názov drobným písmom, bez značky celý názov v hlavičke.
   */
  function brandOf(s = {}) {
    const name = String((s && s.name) || '').trim();
    // Stará značka uložená v Nastaveniach (punds) sa píše ako DANUBRA.
    const brand = String((s && s.brand) || '').trim().replace(/^punds$/i, 'DANUBRA')
      || (/^(partner\s+und\s+service|danubra)\b/i.test(name) ? 'DANUBRA' : '');
    const bezFormy = name.replace(/,?\s*(spol\.\s*s\s*r\.\s*o\.|s\.\s*r\.\s*o\.|a\.\s*s\.|GmbH|UG|k\.\s*s\.)\s*$/i, '').trim();
    const sub = String((s && s.tagline) || '').trim() || (brand && !/^danubra$/i.test(brand) ? bezFormy : '');
    return { name, brand, sub };
  }

  /** Stará doména punds.* sa na dokumentoch píše ako danubra.* (punds.eu je teraz danubra.eu). */
  const novaDomena = (d) => String(d || '').replace(/(^|[.@/])punds\.(sk|eu)\b/gi, (m, a, tld) => `${a}danubra.${tld.toLowerCase()}`);

  /** Web firmy: z Nastavení, inak z domény e-mailu (info@danubra.eu na danubra.eu). */
  function webOf(s = {}) {
    if (s && s.web) return novaDomena(String(s.web).replace(/^https?:\/\//, '').replace(/\/$/, ''));
    const d = String((s && s.email) || '').split('@')[1] || '';
    return d && !/^(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|azet|zoznam|centrum|post|atlas|seznam|gmx|web|t-online)\./i.test(d) ? novaDomena(d) : '';
  }

  const CSS = `
    *{box-sizing:border-box}
    html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{margin:0;padding:0;background:#E9EAEC;color:${BRAND.navy};
      font-family:'Hanken Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12.5px;line-height:1.55}
    h1,h2,h3,.brand-word,.brand-name{font-family:Outfit,'Hanken Grotesk',Arial,sans-serif}
    /* Na obrazovke je dokument biely list A4 s oranžovým pruhom dole. */
    .page{position:relative;max-width:794px;margin:22px auto;padding:44px 53px 34px;background:#fff;
      box-shadow:0 1px 2px rgba(14,22,38,.08),0 16px 40px rgba(14,22,38,.14)}
    .page::after{content:'';position:absolute;left:0;right:0;bottom:0;height:6px;background:${BRAND.orange}}
    .page:has(.runfoot.plain)::after{display:none}
    .head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:26px}
    .brand{display:flex;align-items:center;gap:12px;flex:0 0 auto;min-width:0}
    .brand svg{flex:none}
    .brand-word{font-weight:700;font-size:27px;line-height:.8;letter-spacing:.02em;color:${BRAND.navy};white-space:nowrap}
    /* „Partner und Service s. r. o." sa nesmie zlomiť na „s. r." a „o." —
       názov firmy na doklade vyzerá potom ako preklep. */
    .brand-name{font-weight:700;font-size:19px;line-height:1.15;letter-spacing:-.02em;text-wrap:balance;max-width:300px}
    .brand-sub{font-size:6.8px;font-weight:500;letter-spacing:.26em;color:${BRAND.mute};text-transform:uppercase;line-height:1.2;margin-top:9px}
    .doc-title{text-align:right;flex:1 1 auto;min-width:0;display:flex;flex-direction:column;align-items:flex-end;gap:3px}
    .doc-title h1{margin:0 0 3px;font-size:26px;font-weight:700;line-height:1.08;letter-spacing:-.03em;text-wrap:balance}
    .doc-title .meta{font-size:10.5px;color:${BRAND.mute};line-height:1.45}
    .doc-title .meta b,.doc-title .num{color:${BRAND.navy};font-weight:600}
    .cols{display:flex;gap:28px;margin:22px 0}
    .col{flex:1;min-width:0}
    .cols.boxed{gap:14px}
    .cols.boxed .col{background:${BRAND.soft};border-radius:8px;padding:13px 15px}
    .lbl{font-size:8.5px;letter-spacing:.16em;text-transform:uppercase;color:${BRAND.lbl};font-weight:600;margin-bottom:5px}
    .val{font-size:11.5px;color:${BRAND.sub};line-height:1.6;overflow-wrap:anywhere}
    .val strong{font-size:13px;color:${BRAND.navy};font-weight:600}
    table{width:100%;border-collapse:collapse;margin:16px 0}
    th{text-align:left;font-size:8.8px;letter-spacing:.1em;text-transform:uppercase;color:${BRAND.mute};font-weight:600;
      padding:9px 8px;background:${BRAND.soft}}
    td{padding:9px 8px;border-bottom:1px solid ${BRAND.line};font-size:11.5px;vertical-align:top;color:${BRAND.navy}}
    td.r,th.r{text-align:right;font-variant-numeric:tabular-nums}
    td strong{font-weight:600}
    .total{display:flex;justify-content:flex-end;margin-top:4px}
    .total-box{min-width:300px;display:flex;flex-direction:column;gap:2px}
    .total-row{display:flex;justify-content:space-between;align-items:baseline;gap:18px;padding:4px 2px;font-size:11.5px;
      color:${BRAND.sub};font-variant-numeric:tabular-nums}
    .total-row.sum{margin-top:6px;padding:11px 14px;background:${BRAND.navy};color:#fff;border-radius:7px;font-weight:600;font-size:12.5px}
    .total-row.sum span:last-child{white-space:nowrap;font-family:Outfit,Arial,sans-serif;font-weight:700;font-size:20px;color:${BRAND.orange};letter-spacing:-.01em}
    .pay{display:flex;gap:26px;align-items:flex-start;background:${BRAND.soft};border-radius:10px;padding:16px 18px;margin-top:20px}
    .pay .val strong{font-size:12px}
    .note{background:${BRAND.soft};border-left:3px solid ${BRAND.orange};border-radius:0 6px 6px 0;padding:11px 14px;margin:16px 0;
      font-size:11px;line-height:1.6;color:${BRAND.sub}}
    .note strong{color:${BRAND.navy}}
    .note.info{border-left-color:${BRAND.navy}}
    /* Záverečná veta dokumentu (napr. že platí po podpise). Údaje firmy sú v päte. */
    .foot{margin-top:26px;font-size:9.5px;color:${BRAND.lbl};text-align:center}
    .runfoot{margin-top:28px;padding-top:11px;border-top:1px solid ${BRAND.line};display:grid;
      grid-template-columns:1.35fr 1fr 1fr;gap:16px;font-size:9px;line-height:1.55;color:${BRAND.mute}}
    .runfoot>div{display:flex;flex-direction:column;min-width:0;overflow-wrap:anywhere}
    .runfoot strong{color:${BRAND.navy};font-weight:600}
    ul.clean{margin:8px 0;padding-left:18px;color:${BRAND.sub}}
    ul.clean li{margin:4px 0}
    ul.clean li::marker{color:${BRAND.orange}}
    ul.clean strong{color:${BRAND.navy}}
    /* Zmluva má paragrafy a podpisy — dokument, ktorý sa podpisuje perom,
       potrebuje miesto na to pero. */
    .par{margin:14px 0 0}
    .par h3{font-size:13px;font-weight:600;margin:0 0 5px;letter-spacing:-.01em;color:${BRAND.navy}}
    .par h3 .cl{color:${BRAND.orange};font-weight:700;margin-right:6px}
    .par p{margin:0 0 6px;font-size:11.5px;line-height:1.6;color:${BRAND.sub}}
    .par p strong{color:${BRAND.navy}}
    /* Odstavce zmluvy sú číslované — v spore sa odkazuje na „čl. V bod 2". */
    .par-ol{margin:0;padding-left:22px;font-size:11.5px;line-height:1.6;color:${BRAND.sub}}
    .par-ol li{margin:0 0 5px}
    .par-ol li::marker{color:${BRAND.mute};font-weight:600}
    .par-ol strong{color:${BRAND.navy}}
    .par-sub{margin:4px 0 0;padding-left:20px}
    .par-sub li{margin:0 0 3px}
    ol.par-sub{list-style:lower-alpha}
    ol.par-sub li::marker{content:counter(list-item, lower-alpha) ") "}
    /* Dvojjazyčný odstavec: vľavo slovensky, vpravo nemecky, pod sebou číslo.
       Takto je vidieť, že obe verzie hovoria to isté. */
    .bil{display:grid;grid-template-columns:22px 1fr 1fr;gap:0 14px;margin:0 0 9px;page-break-inside:avoid}
    .bil-n{font-family:Outfit,Arial,sans-serif;font-size:11px;color:${BRAND.orange};font-weight:700;padding-top:1px}
    .bil-sk,.bil-de{font-size:10.8px;line-height:1.55;color:${BRAND.navy}}
    .bil-de{color:${BRAND.sub}}
    @media print{.bil{grid-template-columns:22px 1fr 1fr}}
    .sigs{display:flex;gap:40px;margin-top:36px;page-break-inside:avoid}
    .sig{flex:1}
    .sig .line{border-bottom:1px solid ${BRAND.navy};height:46px;position:relative}
    .sig .stamp{position:absolute;left:8px;bottom:2px;max-height:92px;max-width:210px;object-fit:contain}
    .stamp-inv{display:flex;justify-content:flex-end;margin-top:-6px}
    .stamp-inv img{max-height:100px;max-width:220px;object-fit:contain}
    .sig .who{font-size:9.5px;color:${BRAND.mute};margin-top:6px}
    .ss-h{font-size:13.5px;font-weight:600;letter-spacing:-.01em;color:${BRAND.navy};margin:24px 0 8px;
      padding-left:10px;border-left:3px solid ${BRAND.orange};line-height:1.25;page-break-after:avoid}
    .ss-row{display:flex;gap:18px;padding:8px 0;border-bottom:1px solid ${BRAND.line};page-break-inside:avoid}
    .ss-row .lbl{flex:0 0 150px;margin:0;padding-top:3px}
    .ss-row .val{flex:1;min-width:0;color:${BRAND.navy}}
    /* Chýbajúci údaj sa nevynechá potichu — prázdny riadok vyzerá ako „netreba". */
    .todo{color:#C25C0C;font-weight:600}
    .codes{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}
    .code{background:${BRAND.soft};border-radius:8px;padding:11px 14px}
    .code .v{font-family:Outfit,Arial,sans-serif;font-size:20px;font-weight:700;letter-spacing:.03em}
    a{color:${BRAND.navy};text-decoration:underline;text-decoration-color:${BRAND.orange};text-underline-offset:2px}
    .toolbar{position:sticky;top:0;z-index:5;background:${BRAND.navy};color:#fff;padding:10px 20px;
      display:flex;justify-content:space-between;align-items:center;gap:12px;font-family:'Hanken Grotesk',Arial,sans-serif}
    .toolbar button{background:${BRAND.orange};color:#fff;border:0;border-radius:8px;
      padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
    .tb-title{font-size:13px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .tb-acts{display:flex;gap:8px;flex:none}
    .toolbar .tb-2{background:transparent;border:1.5px solid rgba(255,255,255,.5)}
    .edit-hint{display:none;background:#FFF4EA;color:${BRAND.navy};font-size:12.5px;padding:8px 20px;text-align:center}
    body.editing .edit-hint{display:block}
    body.editing .page{outline:2px dashed ${BRAND.orange};outline-offset:4px}
    body.editing .page:focus{outline-style:solid}
    @media (max-width:640px){body:not(.pdf-mode){background:#fff}
      body:not(.pdf-mode) .page{margin:0;padding:22px 16px 28px;box-shadow:none}body:not(.pdf-mode) .cols{flex-direction:column;gap:14px}
      body:not(.pdf-mode) .sigs{flex-direction:column;gap:24px}.toolbar{padding:8px 12px}.toolbar button{padding:8px 10px;font-size:12px}
      .tb-title{display:none}.toolbar{justify-content:flex-end;flex-wrap:wrap}.tb-acts{flex-wrap:wrap;justify-content:flex-end}
      body:not(.pdf-mode) .total-box{min-width:0;width:100%}
      body:not(.pdf-mode) .runfoot{grid-template-columns:1fr;gap:8px}
      body:not(.pdf-mode) .head{flex-direction:column;gap:14px}
      body:not(.pdf-mode) .doc-title{text-align:left;align-items:flex-start}}
    /* Rám na tlač: hlavička a päta tabuľky sa opakujú na každej strane, takže
       okraj je aj na druhej strane — a @page môže mať nulový okraj. Pri
       nulovom okraji Chrome nemá kam dať adresu stránky a dátum. */
    table.pf{margin:0;width:100%}
    table.pf>thead>tr>td,table.pf>tbody>tr>td,table.pf>tfoot>tr>td{padding:0;border:0}
    .pf-sp,.pf-sp-b{height:0}
    .tb-doc{display:none}
    body.has-doc .tb-doc{display:inline-block}
    body.has-doc .tb-print-only{display:none}
    /* Počas výroby PDF nesmie byť v dokumente lišta ani rámik úprav. */
    body.pdf-mode .page{outline:0}
    /* Strana PDF (Docs.makePdf): päta a oranžový pruh na každej strane. */
    .pdf-sheet{position:relative;background:#fff;overflow:hidden}
    .pdf-sheet .runfoot{position:absolute;margin:0}
    .pdf-sheet .pdf-bar{position:absolute;left:0;right:0;bottom:0;height:6px;background:${BRAND.orange}}
    .pdf-sheet .pdf-pno{position:absolute;font-size:8.5px;color:${BRAND.mute}}
    .letter-head{margin-bottom:58px}
    .letter-head .doc-title{gap:2px}
    .letter-addr{display:flex;justify-content:space-between;gap:24px;margin-bottom:40px}
    .letter-addr .val{font-size:12px}
    .letter-date{text-align:right}
    .letter-subj{font-size:19px;font-weight:700;letter-spacing:-.02em;margin:0 0 16px;line-height:1.3}
    .letter-body p{margin:0 0 12px;font-size:12px;line-height:1.7;color:${BRAND.sub}}
    .letter-sig{margin-top:18px;display:flex;flex-direction:column;font-size:12px;color:${BRAND.sub};page-break-inside:avoid}
    .letter-sig p{margin:0 0 4px}
    .letter-sig strong{color:${BRAND.navy};font-weight:600}
    .letter-stamp img{max-height:90px;max-width:200px;object-fit:contain;margin:4px 0}
    .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
    .tb-msg{display:none;background:#FFF4EA;color:${BRAND.navy};font-size:13px;padding:9px 20px;text-align:center}
    .tb-msg.on{display:block}
    .tb-msg button{margin-left:10px;background:${BRAND.orange};color:#fff;border:0;border-radius:8px;
      padding:6px 12px;font-weight:700;font-family:inherit;cursor:pointer}
    /* Tlač: päta a pruh sú na každej strane (position:fixed sa pri tlači
       opakuje), miesto pre ne drží prázdna päta rámu. */
    @media print{body{background:#fff}.toolbar,.edit-hint,.tb-msg{display:none!important}
      .page{margin:0;padding:0 14mm;outline:0!important;max-width:none;box-shadow:none;position:static}
      .page::after{position:fixed;left:0;right:0;bottom:0;height:6px}
      .runfoot{position:fixed;left:14mm;right:14mm;bottom:8mm;margin:0;background:#fff}
      .pf-sp{height:12mm}.pf-sp-b{height:30mm}@page{size:A4;margin:0}}
  `;

  /**
   * Obal dokumentu. „Upraviť text" dovolí pred uložením do PDF prepísať
   * hocičo priamo v dokumente (zmluva, objednávka, infolist…). Zmena sa
   * neukladá do appky — platí pre tento výtlačok. Faktúra sa takto upravovať
   * nedá (`editable: false`): vystavený doklad sa nemení.
   */
  // List na šírku (Stundennachweis). `data-orient` na <html> číta Docs.makePdf
  // a otočí stranu PDF; @page to isté povie tlači.
  const CSS_LANDSCAPE = `
    .page{max-width:1123px}
    @media print{@page{size:A4 landscape;margin:0}}`;

  function shell(title, bodyHtml, { toolbar = true, editable = true, lang = 'sk', orient = 'portrait', css = '' } = {}) {
    const land = orient === 'landscape';
    // Písmo Outfit (veľká suma na úhradu) nemá šírku pevnej medzery — „12.400,00€"
    // by sa zlepilo. V tom riadku je preto obyčajná medzera (riadok sa aj tak nezalomí).
    bodyHtml = String(bodyHtml).replace(/<div class="total-row sum">[\s\S]*?<\/div>/g, (m) => m.replace(/\u00a0|\u202f/g, ' '));
    const upravit = editable ? `<button class="tb-2" onclick="(function(b){var p=document.querySelector('.page');`
      + `var on=p.isContentEditable;p.contentEditable=on?'false':'true';document.body.classList.toggle('editing',!on);`
      + `b.textContent=on?'Upraviť text':'Hotovo';if(!on)p.focus();})(this)">Upraviť text</button>` : '';
    return `<!DOCTYPE html><html lang="${lang === 'de' ? 'de' : 'sk'}"${land ? ' data-orient="landscape"' : ''}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}${land ? CSS_LANDSCAPE : ''}${css}</style></head><body>
${toolbar ? `<div class="toolbar"><span class="tb-title">${esc(title)}</span>
<span class="tb-acts">${upravit}<button class="tb-2 tb-doc" onclick="window.__doc?window.__doc('print'):window.print()">Tlačiť</button><button class="tb-2 tb-doc" onclick="window.__doc&&window.__doc('share')">Poslať</button><button class="tb-doc" onclick="window.__doc&&window.__doc('pdf')">Stiahnuť PDF</button><button class="tb-print-only" onclick="window.print()">Uložiť ako PDF / vytlačiť</button></span></div>
<div class="tb-msg" id="tb-msg"></div>
${editable ? '<div class="edit-hint">Kliknite do textu a prepíšte, čo treba. Zmena platí pre tento dokument — potom „Stiahnuť PDF".</div>' : ''}` : ''}
<div class="page"><table class="pf"><thead><tr><td><div class="pf-sp"></div></td></tr></thead>
<tbody><tr><td><div class="pf-main">${bodyHtml}</div></td></tr></tbody>
<tfoot><tr><td><div class="pf-sp-b"></div></td></tr></tfoot></table></div></body></html>`;
  }

  /**
   * Hlavička dokumentu: vľavo značka, vpravo názov dokumentu, číslo a údaje
   * („Datum: 24.10.2026" sa vypíše ako popis a tučná hodnota). Meno firmy
   * je z Nastavení — keď tam nie je, zostane len znak. Vymyslené meno na
   * doklade je horšie než žiadne.
   *
   * @param {string} lang  'sk' | 'de' | 'both' — popis pri čísle (č. / Nr.)
   */
  function header(docTitle, number, meta = [], supplier = null, lang = 'sk') {
    const b = brandOf(supplier || {});
    const pevne = (t) => esc(t).replace(/\b(s\.|r\.|o\.|a\.|spol\.|GmbH|UG)\s/g, (m) => m.trim() + '&nbsp;');
    const znacka = brandHtml(b, b.name ? `<div><div class="brand-name">${pevne(b.name)}</div>
          ${supplier && supplier.tagline ? `<div class="brand-sub">${esc(supplier.tagline)}</div>` : ''}</div>` : '');
    // „č. 2026-018", ale meno človeka (infolist) bez „č." — nie je to číslo.
    const cisloPopis = { sk: 'č.', de: 'Nr.', both: 'č. / Nr.' }[lang] || 'č.';
    const cislo = number ? `<div class="meta">${/\d/.test(String(number)) ? `${esc(cisloPopis)} ` : ''}<span class="num">${esc(number)}</span></div>` : '';
    const riadok = (m) => {
      const x = String(m).match(/^([^:]{1,40}):\s+(.+)$/);
      return `<div class="meta">${x ? `${esc(x[1])} <b>${esc(x[2])}</b>` : esc(m)}</div>`;
    };
    return `<div class="head">
      <div class="brand">${znacka}</div>
      <div class="doc-title"><h1>${esc(docTitle)}</h1>${cislo}${(meta || []).filter(Boolean).map(riadok).join('')}</div>
    </div>`;
  }

  /**
   * Strany zmluvy. `lang: 'de'` prepne popisky — na nemeckom dokumente by
   * „Dodávateľ" nad nemeckým textom vyzeralo ako preklep. `boxed` = strany
   * v sivých rámikoch (zmluvy).
   */
  function parties(supplier, client, extra = [], lang = 'sk', { boxed = false } = {}) {
    const L = lang === 'de'
      ? { od: 'Auftragnehmer', pre: 'Auftraggeber', ico: 'Reg.-Nr.', dph: 'USt-IdNr.' }
      : { od: 'Dodávateľ', pre: 'Odberateľ', ico: 'IČO', dph: 'IČ DPH' };
    return `<div class="cols${boxed ? ' boxed' : ''}">
      <div class="col"><div class="lbl">${esc(L.od)}</div><div class="val">
        <strong>${esc(supplier?.name || '—')}</strong><br>
        ${supplier?.address ? esc(supplier.address) + '<br>' : ''}
        ${supplier?.company_id ? esc(L.ico) + ': ' + esc(supplier.company_id) + '<br>' : ''}
        ${supplier?.vat_id ? esc(L.dph) + ': ' + esc(supplier.vat_id) + '<br>' : ''}
        ${supplier?.email ? esc(supplier.email) : ''}
      </div></div>
      <div class="col"><div class="lbl">${esc(L.pre)}</div><div class="val">
        <strong>${esc(client?.name || '—')}</strong><br>
        ${client?.address ? esc(client.address) + '<br>' : ''}
        ${client?.contact_person ? esc(client.contact_person) + '<br>' : ''}
        ${client?.company_id ? esc(L.ico) + ': ' + esc(client.company_id) + '<br>' : ''}
        ${client?.vat_id ? esc(L.dph) + ': ' + esc(client.vat_id) + '<br>' : ''}
        ${client?.country ? esc(client.country) : ''}
      </div></div>
      ${extra.map(e => `<div class="col"><div class="lbl">${esc(e[0])}</div><div class="val">${e[1]}</div></div>`).join('')}
    </div>`;
  }

  /**
   * Päta s údajmi firmy — v troch stĺpcoch ako na hlavičkovom papieri:
   * názov a adresa · IČO a daňové čísla · účet a kontakt. V PDF a pri tlači
   * je na každej strane (Docs.makePdf, @media print).
   *
   * @param {Object} s     firma (Nastavenia) alebo živnostník pri jeho faktúre
   * @param {string} lang  'sk' | 'de' | 'both'
   * @param {Object} o     { plain } — bez oranžového pruhu (doklad nie je náš)
   */
  function runFoot(s = {}, lang = 'sk', { plain = false } = {}) {
    if (!s || !(s.name || s.address || s.company_id)) return '';
    const de = lang === 'de';
    const web = plain ? '' : webOf(s);
    const st1 = [s.name && `<strong>${esc(s.name)}</strong>`, s.address && esc(s.address),
      s.register && !de && esc(s.register)];
    const st2 = [s.company_id && `IČO ${esc(s.company_id)}`,
      de ? s.vat_id && `USt-IdNr. ${esc(s.vat_id)}` : s.tax_id && `DIČ ${esc(s.tax_id)}`,
      de ? s.tax_number_de && `Steuernummer ${esc(s.tax_number_de)}` : s.vat_id && `IČ DPH ${esc(s.vat_id)}`];
    const st3 = [s.iban && `IBAN ${esc(s.iban)}${s.bic ? ` · BIC ${esc(s.bic)}` : ''}`,
      [web, s.phone].filter(Boolean).map(esc).join(' · '), s.email && esc(s.email)];
    const col = (a) => `<div>${a.filter(Boolean).map(x => `<span>${x}</span>`).join('')}</div>`;
    return `<div class="runfoot${plain ? ' plain' : ''}" data-lang="${esc(lang)}">${col(st1)}${col(st2)}${col(st3)}</div>`;
  }

  /**
   * Pätička dokumentu, ktorý sa **podpisuje perom**. Obyčajná pätička tvrdí
   * „vystavené elektronicky, platné bez podpisu" — na súhlase alebo zmluve
   * je to presne naopak a papier by si protirečil.
   */
  function footSigned(supplier, lang = 'sk', veta) {
    const t = veta || { sk: 'Platné po podpise oboma stranami', de: 'Gültig nach Unterzeichnung durch beide Parteien',
      both: 'Platné po podpise oboma stranami / Gültig nach Unterzeichnung durch beide Parteien' }[lang];
    return `<div class="foot">${esc(t)}</div>${runFoot(supplier, lang)}`;
  }

  /**
   * Mesto z adresy — bez PSČ a bez krajiny. „Podzámska 9468/4A, 940 71 Nové
   * Zámky" → „Nové Zámky". Používa sa vo vete „V …, dňa …".
   */
  function mestoZAdresy(supplier) {
    if (supplier && supplier.city) return String(supplier.city).trim();
    const časti = String((supplier && supplier.address) || '').split(',');
    for (let i = časti.length - 1; i >= 0; i--) {
      const t = časti[i].replace(/\b\d{3}\s?\d{2}\b/g, '').trim();
      // Posledná časť býva krajina; mesto je to, čo zostane po odstránení PSČ.
      if (t && !/^(slovensko|slovakia|slowakei|nemecko|deutschland|sr|sk|de)$/i.test(t)) {
        return t;
      }
    }
    return '';
  }

  /**
   * Naša pečiatka (a podpis) z Nastavení — obrázok s priehľadným pozadím.
   * Ide do nášho podpisového poľa a na vydanú faktúru. Keď nie je nahratá,
   * nič sa nekreslí.
   */
  function stamp(supplier, cls = 'stamp') {
    const src = supplier && supplier.stamp;
    return src && /^data:image\/(png|jpeg|webp);base64,/.test(src)
      ? `<img class="${cls}" src="${src}" alt="Pečiatka">` : '';
  }

  function foot(supplier, lang = 'sk') {
    const t = { sk: 'Vystavené elektronicky, platné bez podpisu', de: 'Elektronisch erstellt, ohne Unterschrift gültig',
      both: 'Vystavené elektronicky / Elektronisch erstellt' }[lang] || 'Vystavené elektronicky, platné bez podpisu';
    return `<div class="foot">${esc(t)}</div>${runFoot(supplier, lang)}`;
  }

  // ── FAKTÚRA ───────────────────────────────────────────────────────────────
  /** Koľko sa z faktúry naozaj prevedie na účet. Pozri `payable()` nižšie. */
  function payable(inv = {}) {
    const total = Number(inv.total) || 0;
    const held = Number(inv.withholding_amount) || 0;
    // `amount_net` je už vypočítané v databáze; ak chýba, dopočíta sa.
    const net = inv.amount_net != null ? Number(inv.amount_net) : total - held;
    return { total, held, net: held ? net : total };
  }

  const INV_L = {
    sk: {
      title: 'Faktúra', desc: 'Popis', qty: 'Množstvo', unit: 'MJ',
      price: 'Cena/MJ', sum: 'Spolu',
      issued: 'Vystavená', due: 'Splatnosť', delivery: 'Dodanie', period: 'Obdobie',
      gross: 'Fakturovaná suma', hold: 'Zrážka §48b', pay: 'Na úhradu',
      payInfo: 'Platobné údaje', ref: 'Variabilný symbol', amount: 'Suma',
      scan: 'Zaplatiť naskenovaním', empty: 'Bez položiek',
      vs: 'Variabilný symbol', ks: 'Konštantný symbol', bic: 'SWIFT / BIC', bank: 'Banka',
      order: 'Objednávka č.', payWay: 'Forma úhrady', issuedBy: 'Vystavil',
      sId: 'IČO', sTax: 'DIČ', sVat: 'IČ DPH', sTaxDe: 'Steuernummer', phone: 'Tel.',
      recap: (c) => `Rekapitulácia DPH v ${c}`, base: 'Základ', rate: 'Sadzba', vat: 'DPH', gesamt: 'Spolu',
      holdNote: (pct) => `Odberateľ zrazí ${pct} % podľa §48 EStG a odvedie ich nemeckému `
        + 'finančnému úradu. Neexistuje potvrdenie o oslobodení podľa §48b EStG. '
        + 'Prevádza sa teda suma po zrážke.',
    },
    de: {
      title: 'Rechnung', desc: 'Bezeichnung', qty: 'Menge', unit: 'Einheit',
      price: 'Einzelpreis', sum: 'Gesamt',
      issued: 'Rechnungsdatum', due: 'Fällig am', delivery: 'Leistungsdatum',
      period: 'Leistungszeitraum',
      gross: 'Rechnungsbetrag', hold: 'Bauabzugsteuer §48 EStG', pay: 'Zahlbetrag',
      payInfo: 'Zahlungsinformationen', ref: 'Verwendungszweck', amount: 'Betrag',
      scan: 'Zahlen per Scan', empty: 'Keine Positionen',
      vs: 'Variables Symbol', ks: 'Konstantes Symbol', bic: 'SWIFT / BIC', bank: 'Bank',
      order: 'Bestellung Nr.', payWay: 'Zahlungsart', issuedBy: 'Ausgestellt von',
      sId: 'Id.-Nr. (IČO)', sTax: 'St.-Nr. (DIČ)', sVat: 'USt-IdNr.', sTaxDe: 'Steuernummer', phone: 'Tel.',
      recap: (c) => `Zusammenfassung in ${c}`, base: 'Grundlage', rate: '% USt.', vat: 'USt.', gesamt: 'Gesamt',
      holdNote: (pct) => `Der Auftraggeber behält ${pct} % Bauabzugsteuer gemäß §48 EStG `
        + 'ein und führt sie an das zuständige Finanzamt ab. Eine Freistellungs'
        + 'bescheinigung nach §48b EStG liegt nicht vor. Zu überweisen ist der Zahlbetrag.',
    },
  };

  /**
   * Faktúra.
   *
   * Dve veci, ktoré tu predtým neboli a stáli peniaze:
   *
   * 1. **Zrážka §48b sa na doklade neukazovala.** Databáza ju počíta, appka ju
   *    pri schvaľovaní zobrazí — ale na papieri, ktorý išiel odberateľovi,
   *    stálo len „Na úhradu" s celou sumou. Odberateľ pritom 15 % zráža
   *    a odvádza nemeckému finančnému úradu, takže na účet príde menej.
   *    Bez rozpisu to vyzerá ako nedoplatok a dohaduje sa to pri urgencii.
   *
   * 2. **Faktúra pre nemeckého odberateľa bola po slovensky.** Ponuka aj
   *    zmluva sú po nemecky; faktúra nie, hoci ju číta ten istý človek.
   *    Jazyk sa odvodí od krajiny odberateľa a dá sa prebiť.
   */
  /** Veta o úroku z omeškania — doslova ako na faktúrach z Pohody. */
  const INV_LATE = 'Dovoľujeme si Vás upozorniť, že v prípade nedodržania termínu splatnosti uvedeného '
    + 'na faktúre, Vám môžeme účtovať úrok z omeškania v dohodnutej, resp. zákonnej výške a zmluvnú '
    + 'pokutu (ak bola dohodnutá).';
  /** Sadzby v rekapitulácii (ako na faktúrach z Pohody). Firma fakturuje 0 %. */
  const INV_RATES = [0, 5, 19, 23];
  const INV_PAY = {
    transfer: { sk: 'Prevodom', de: 'Überweisung' }, cash: { sk: 'V hotovosti', de: 'Barzahlung' },
    card: { sk: 'Kartou', de: 'Kartenzahlung' }, cod: { sk: 'Dobierka', de: 'Nachnahme' },
    offset: { sk: 'Zápočtom', de: 'Verrechnung' },
  };
  const INV_CSS = `
    .inv-recap{width:auto;margin:14px 0 0 auto;font-size:11.5px}
    .inv-recap caption{caption-side:top;text-align:left;font-weight:600;color:#55607A;padding:0 0 4px;font-size:11px}
    .inv-recap th,.inv-recap td{padding:3px 10px;text-align:right}
    .inv-issued{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-top:14px}
    .inv-issued .lbl{margin-bottom:2px}
    .inv-small{margin-top:14px;font-size:10px;line-height:1.5;color:#55607A}
    .inv-small p{margin:0 0 4px}`;

  function invoice({ invoice: inv, items, client, supplier, qrSvg, vatNote, lang }) {
    const de = (lang || ((client?.country || 'SK').toUpperCase() === 'SK' ? 'sk' : 'de')) === 'de';
    const L = de ? INV_L.de : INV_L.sk;
    const loc = de ? 'de-DE' : 'sk-SK';
    const p = payable(inv);
    const pct = Number(inv.withholding_pct)
      || (p.total ? Math.round((p.held / p.total) * 100) : 0);
    const sup = supplier || {};
    const vs = String(inv.variable_symbol || '').replace(/\D/g, '') || String(inv.invoice_number || '').replace(/\D/g, '');
    const ks = String(inv.constant_symbol || '').trim();
    const platba = (INV_PAY[inv.payment_method || 'transfer'] || INV_PAY.transfer)[de ? 'de' : 'sk'];
    const cur = inv.currency || 'EUR';

    // Jednotka sa ukladá, ako ju človek napísal („mes"); na nemecký doklad
    // ide „Monat" — ten istý preklad ako v SuperFaktúre (invoice.js unitFor).
    const rows = (items || []).map(i => `<tr>
      <td>${esc(i.description)}</td>
      <td class="r">${Number(i.quantity || 0).toLocaleString(loc)}</td>
      <td class="r">${esc(unitOut(i.unit, de ? 'de' : 'sk'))}</td>
      <td class="r">${money(i.unit_price, inv.currency, loc)}</td>
      <td class="r"><strong>${money(i.total, inv.currency, loc)}</strong></td></tr>`).join('');

    // Dodávateľ s daňovými číslami ako na faktúre z Pohody: IČO, DIČ, IČ DPH
    // (a nemecká Steuernummer, keď ju máme). Odberateľ s USt-IdNr. a krajinou.
    const riadky = (a) => a.filter(Boolean).map(x => `${x}<br>`).join('');
    const strany = `<div class="cols">
      <div class="col"><div class="lbl">${esc(de ? 'Lieferant' : 'Dodávateľ')}</div><div class="val">
        <strong>${esc(sup.name || '—')}</strong><br>
        ${riadky([sup.address && esc(sup.address),
          sup.company_id && `${esc(L.sId)}: ${esc(sup.company_id)}`,
          sup.tax_id && `${esc(L.sTax)}: ${esc(sup.tax_id)}`,
          sup.vat_id && `${esc(L.sVat)}: ${esc(sup.vat_id)}`,
          de && sup.tax_number_de && `${esc(L.sTaxDe)}: ${esc(sup.tax_number_de)}`,
          sup.phone && `${esc(L.phone)} ${esc(sup.phone)}`])}${sup.email ? esc(sup.email) : ''}
      </div></div>
      <div class="col"><div class="lbl">${esc(de ? 'Abnehmer' : 'Odberateľ')}</div><div class="val">
        <strong>${esc(client?.name || '—')}</strong><br>
        ${riadky([client?.address && esc(client.address), client?.contact_person && esc(client.contact_person),
          client?.company_id && `${esc(L.sId)}: ${esc(client.company_id)}`,
          client?.tax_id && `${esc(L.sTax)}: ${esc(client.tax_id)}`,
          client?.vat_id && `${esc(L.sVat)}: ${esc(client.vat_id)}`])}${client?.country ? esc(client.country) : ''}
      </div></div>
    </div>`;

    // Rekapitulácia DPH: celá suma je v sadzbe 0 % (reverse charge / neplatiteľ).
    const nula = money(0, cur, loc);
    const recap = `<table class="inv-recap"><caption>${esc(L.recap(cur))}</caption>
      <thead><tr><th>${esc(L.base)}</th><th>${esc(L.rate)}</th><th>${esc(L.vat)}</th><th>${esc(L.gesamt)}</th></tr></thead>
      <tbody>${INV_RATES.map(r => `<tr><td>${r === 0 ? money(p.total, cur, loc) : nula}</td><td>${r} %</td>
        <td>${nula}</td><td>${r === 0 ? money(p.total, cur, loc) : nula}</td></tr>`).join('')}</tbody></table>`;

    const male = [String(sup.invoice_footer || '').trim() || INV_LATE, sup.register]
      .filter(Boolean).map(t => `<p>${esc(t)}</p>`).join('');

    const body = `
      ${header(L.title, inv.invoice_number, [
        `${L.issued}: ${date(inv.issue_date)}`,
        `${L.due}: ${date(inv.due_date)}`,
        inv.delivery_date ? `${L.delivery}: ${date(inv.delivery_date)}` : '',
        inv.billing_period_from ? `${L.period}: ${date(inv.billing_period_from)} – ${date(inv.billing_period_to)}` : '',
        inv.order_reference ? `${L.order}: ${inv.order_reference}` : '',
        `${L.payWay}: ${platba}`,
      ], supplier, de ? 'de' : 'sk')}
      ${strany}
      <table><thead><tr>
        <th>${esc(L.desc)}</th><th class="r">${esc(L.qty)}</th><th class="r">${esc(L.unit)}</th>
        <th class="r">${esc(L.price)}</th><th class="r">${esc(L.sum)}</th>
      </tr></thead><tbody>${rows || `<tr><td colspan="5">${esc(L.empty)}</td></tr>`}</tbody></table>
      <div class="total"><div class="total-box">
        ${p.held ? `
          <div class="total-row"><span>${esc(L.gross)}</span>
            <span>${money(p.total, inv.currency, loc)}</span></div>
          <div class="total-row" style="color:#C25C0C">
            <span>${esc(L.hold)}${pct ? ` (${pct} %)` : ''}</span>
            <span>− ${money(p.held, inv.currency, loc)}</span></div>` : ''}
        <div class="total-row sum"><span>${esc(L.pay)}</span>
          <span>${money(p.net, inv.currency, loc)}</span></div>
      </div></div>
      ${recap}
      ${p.held ? `<div class="note">${esc(L.holdNote(pct || 15))}</div>` : ''}
      ${String(vatNote || '').split('\n').map(t => t.trim()).filter(Boolean)
        .map(t => `<div class="note">${esc(t)}</div>`).join('')}
      ${inv.note ? `<div class="note">${esc(inv.note)}</div>` : ''}
      <div class="pay">
        <div style="flex:1">
          <div class="lbl">${esc(L.payInfo)}</div>
          <div class="val" style="line-height:1.9">
            ${sup.bank_name ? `${esc(L.bank)}: <strong>${esc(sup.bank_name)}</strong><br>` : ''}
            IBAN: <strong style="font-family:ui-monospace,monospace">${esc(sup.iban || '—')}</strong><br>
            ${sup.bic ? `${esc(L.bic)}: <strong style="font-family:ui-monospace,monospace">${esc(sup.bic)}</strong><br>` : ''}
            ${esc(L.vs)}: <strong style="font-family:ui-monospace,monospace">${esc(vs)}</strong><br>
            ${ks ? `${esc(L.ks)}: <strong style="font-family:ui-monospace,monospace">${esc(ks)}</strong><br>` : ''}
            ${esc(L.amount)}: <strong>${money(p.net, inv.currency, loc)}</strong><br>
            ${esc(L.due)}: <strong>${date(inv.due_date)}</strong>
          </div>
        </div>
        ${qrSvg ? `<div style="text-align:center">
          <div class="lbl">${esc(L.scan)}</div>${qrSvg}
          <div style="font-size:9.5px;color:#8C97AD;margin-top:4px">SEPA QR (GiroCode)</div></div>` : ''}
      </div>
      ${sup.issued_by || stamp(supplier) ? `<div class="inv-issued">
        <div><div class="lbl">${esc(L.issuedBy)}</div><div class="val">${esc(sup.issued_by || '')}</div></div>
        ${stamp(supplier) ? `<div class="stamp-inv">${stamp(supplier, 'st')}</div>` : ''}
      </div>` : ''}
      <div class="inv-small">${male}</div>
      ${foot(supplier, de ? 'de' : 'sk')}`;
    return shell(`${L.title} ${inv.invoice_number || ''}`, body, { editable: false, lang: de ? 'de' : 'sk', css: INV_CSS });
  }

  // ── FAKTÚRA ZA ŽIVNOSTNÍKA (vyhotovenie faktúry odberateľom) ─────────────
  /**
   * Faktúra v mene a na účet živnostníka, ktorú vyhotovujeme my podľa dohody
   * v rámcovej zmluve (článok V.). Dodávateľ je on, odberateľ my — preto bez
   * nášho loga v hlavičke: doklad je jeho, nie náš.
   *
   * Údaje sa berú z momentky pri vystavení (`bill.extracted._self`), nie
   * z karty — vystavený doklad sa nemení, keď niekto neskôr opraví adresu.
   *
   * @param {Object} o { bill, worker, company, period }
   */
  function selfInvoice({ bill = {}, worker = {}, company = {}, period = null, contractNo = '' } = {}) {
    const snap = (bill.extracted && bill.extracted._self) || {};
    const w = { ...worker, ...(snap.worker || {}) };
    const c = { ...company, ...(snap.company || {}) };
    const lines = Array.isArray(bill.lines) ? bill.lines : [];
    const ACT = { construction: 'stavebné práce', workshop: 'dielenské práce', travel: 'cesta' };
    const draft = !bill.bill_number;
    const rows = lines.map(l => `<tr>
      <td>${esc(l.description || 'Práce')}${l.activity ? ` — ${esc(ACT[l.activity] || l.activity)}` : ''}
        ${l.from ? `<div style="font-size:11px;color:#6F7A92">${date(l.from)} – ${date(l.to)}</div>` : ''}</td>
      <td class="r">${Number(l.hours || 0).toLocaleString('sk-SK')}</td>
      <td class="r">h</td>
      <td class="r">${money(l.rate)}</td>
      <td class="r"><strong>${money(l.total)}</strong></td></tr>`).join('');
    const meno = w.company_name || w.full_name || '—';
    const adresa = [w.address, [w.zip, w.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const vs = bill.variable_symbol || String(bill.bill_number || '').replace(/\D/g, '').slice(-10);
    const body = `
      <div class="head">
        <div class="brand"><div><div class="brand-name">${esc(meno)}</div>
          ${w.company_name && w.full_name && w.company_name !== w.full_name
            ? `<div class="brand-sub">${esc(w.full_name)}</div>` : ''}</div></div>
        <div class="doc-title"><h1>Faktúra</h1>
          <div class="meta">${bill.bill_number ? 'č. ' : ''}<span class="num">${esc(bill.bill_number || 'NÁVRH — ešte nevystavená')}</span></div>
          <div class="meta">vyhotovenie faktúry odberateľom</div>
        </div></div>
      ${draft ? '<p class="todo">Návrh. Číslo dostane faktúra až pri vystavení — po schválení administrátorom.</p>' : ''}
      <div class="cols">
        <div class="col"><div class="lbl">Dodávateľ</div><div class="val">
          <strong>${esc(meno)}</strong><br>
          ${adresa ? esc(adresa) + '<br>' : ''}
          ${w.company_id ? 'IČO: ' + esc(w.company_id) + '<br>' : ''}
          ${w.tax_id ? 'DIČ: ' + esc(w.tax_id) + '<br>' : ''}
          ${w.vat_id ? 'IČ DPH: ' + esc(w.vat_id) + '<br>' : ''}
        </div></div>
        <div class="col"><div class="lbl">Odberateľ</div><div class="val">
          <strong>${esc(c.name || '—')}</strong><br>
          ${c.address ? esc(c.address) + '<br>' : ''}
          ${c.company_id ? 'IČO: ' + esc(c.company_id) + '<br>' : ''}
          ${c.tax_id ? 'DIČ: ' + esc(c.tax_id) + '<br>' : ''}
          ${c.vat_id ? 'IČ DPH: ' + esc(c.vat_id) + '<br>' : ''}
        </div></div>
        <div class="col"><div class="lbl">Údaje</div><div class="val" style="font-size:12px;">
          Vystavená: <strong>${date(bill.issue_date)}</strong><br>
          Dodanie: <strong>${date(bill.delivery_date || (period && period.period_to))}</strong><br>
          Splatnosť: <strong>${date(bill.due_date)}</strong><br>
          ${period ? `Obdobie: ${(kwRiadky(period.period_from, period.period_to).map(esc).join('<br>'))
            || `${date(period.period_from)} – ${date(period.period_to)}`}` : ''}
        </div></div>
      </div>
      <table><thead><tr><th>Popis</th><th class="r">Množstvo</th><th class="r">MJ</th>
        <th class="r">Cena za MJ</th><th class="r">Spolu</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">Bez položiek</td></tr>'}</tbody></table>
      <div class="total"><div class="total-box">
        <div class="total-row sum"><span>Na úhradu</span><span>${money(bill.amount)}</span></div>
      </div></div>
      <div class="note">${w.vat_payer ? 'Prenesenie daňovej povinnosti – Steuerschuldnerschaft des Leistungsempfängers.'
        : 'Dodávateľ nie je platiteľom DPH.'}<br>
        Dodané služby uskutočnené na území Nemecka, nie sú predmetom DPH na Slovensku v zmysle §16 ods. 1
        zák. 222/2004. Artikel 194 und 199 MwStSystRL i.V.m §13b Absatz 2 UstG</div>
      <div class="note">Vyhotovenie faktúry odberateľom: faktúru vyhotovil odberateľ v mene a na účet
        dodávateľa na základe písomnej dohody v rámcovej zmluve o dielo${contractNo ? ` č. ${esc(contractNo)}` : ''}
        (čl. V. body 10 až 14).
        Podkladom sú súpisy prác potvrdené odberateľom.</div>
      <div class="pay"><div style="flex:1">
        <div class="lbl">Platobné údaje</div>
        <div class="val" style="line-height:1.9">
          IBAN: <strong style="font-family:ui-monospace,monospace">${esc(w.iban || bill.supplier_iban || '—')}</strong><br>
          Variabilný symbol: <strong style="font-family:ui-monospace,monospace">${esc(vs || '—')}</strong><br>
          Suma: <strong>${money(bill.amount)}</strong>
        </div></div></div>
      <div class="foot">Vystavené elektronicky, platné bez podpisu</div>
      ${runFoot({ name: meno, address: adresa, company_id: w.company_id, tax_id: w.tax_id, vat_id: w.vat_id,
        iban: w.iban || bill.supplier_iban, phone: w.phone, email: w.email }, 'sk', { plain: true })}`;
    return shell(`Faktúra ${bill.bill_number || '(návrh)'} — ${meno}`, body, { editable: false });
  }

  // ── PONUKA PRE ODBERATEĽA (nemecky) ───────────────────────────────────────
  /**
   * Angebot. Po nemecky, lebo ho číta a rozhoduje sa podľa neho Nemec —
   * to je to isté pravidlo ako pri výkaze hodín.
   *
   * Dve veci, ktoré na ňom musia byť a inde sa na ne zabúda:
   *
   *   * **Platnosť ponuky.** Bez nej sa o pol roka niekto odvolá na sadzbu,
   *     ktorá medzitým prestala platiť.
   *   * **Že sú to živnostníci s A1 a účtuje sa podľa podpísaného výkazu.**
   *     Toto je rozdiel medzi Werkvertrag a skrytou Arbeitnehmerüberlassung
   *     a odberateľ to chce mať čierne na bielom.
   */
  /** Lehoty fakturácie odberateľovi — Rahmenvertrag (framework-de.js), inak 7 / 7 dní. */
  function lehotyDe(terms) {
    const F = (typeof module !== 'undefined' && module.exports)
      ? require('./framework-de') : (typeof window !== 'undefined' && window.DanubraFrameworkDe);
    const base = (F && F.SUMY) || { fakturacia_dni: 7, splatnost_dni: 7 };
    const out = { fakturacia_dni: base.fakturacia_dni, splatnost_dni: base.splatnost_dni };
    for (const k of Object.keys(out)) {
      const v = Number(terms && terms[k]);
      if (Number.isFinite(v) && v > 0) out[k] = v;
    }
    return out;
  }

  function quote({ quote: q, client, supplier, trade, note, terms }) {
    const L7 = lehotyDe(terms);
    const rate = q.charge_rate ? money(q.charge_rate) : '—';
    const perMonth = (Number(q.charge_rate) || 0) * (Number(q.hours_per_month) || 0)
      * (Number(q.headcount) || 1);
    const body = `
      ${header('Angebot', q.quote_number, [], supplier, 'de')}
      ${parties(supplier, client, [['Angebot', `
        <div style="font-size:12px;">
          Datum: <strong>${date(q.created_at)}</strong><br>
          ${q.valid_until ? `Gültig bis: <strong>${date(q.valid_until)}</strong><br>` : ''}
          ${q.date_from ? `Einsatz ab: <strong>${date(q.date_from)}</strong>` : ''}
        </div>`]], 'de')}

      <div class="lbl">Leistung</div>
      <div class="val" style="font-size:15px;font-weight:700;margin-bottom:10px">
        ${esc(q.title || '')}</div>

      <table><thead><tr>
        <th>Position</th><th class="r">Anzahl</th><th class="r">Stunden/Monat</th>
        <th class="r">Stundensatz</th>
      </tr></thead><tbody>
        <tr>
          <td>${esc(trade || 'Fachkraft')}${q.site_city ? ` — ${esc(q.site_city)}` : ''}</td>
          <td class="r">${esc(q.headcount || 1)}</td>
          <td class="r">${esc(q.hours_per_month || '—')}</td>
          <td class="r"><strong>${rate}</strong></td>
        </tr>
      </tbody></table>

      ${perMonth ? `<div class="total"><div class="total-box">
        <div class="total-row sum"><span>Richtwert pro Monat</span><span>${money(perMonth)}</span></div>
      </div></div>` : ''}

      <div class="note">
        <strong>Leistungsumfang und Abrechnung</strong><br>
        Alle eingesetzten Personen sind <strong>selbständige Unternehmer</strong> mit
        gültiger <strong>A1-Bescheinigung</strong> und eigenem Gewerbe.<br>
        Die Abrechnung erfolgt ${L7.fakturacia_dni === 7 ? '<strong>wöchentlich</strong> (nach Kalenderwochen)'
          : `in <strong>${L7.fakturacia_dni}-Tages-Intervallen</strong>`} auf Grundlage des vom Auftraggeber
        <strong>unterschriebenen Stundennachweises</strong>; Zahlungsziel ${L7.splatnost_dni} Kalendertage
        ab Rechnungsdatum.<br>
        ${q.work_type === 'workshop'
          ? 'Werkstattarbeiten — keine SOKA-BAU-Pflicht.'
          : 'Bauleistung im Sinne des AEntG; der Bau-Mindestlohn wird eingehalten.'}
        ${q.valid_until ? `<br>Dieses Angebot ist gültig bis <strong>${date(q.valid_until)}</strong>.` : ''}
      </div>
      ${note ? `<div class="note">${esc(note)}</div>` : ''}
      ${foot(supplier, 'de')}`;
    return shell(`Angebot ${q.quote_number || ''}`, body, { lang: 'de' });
  }

  // ── WERKVERTRAG ───────────────────────────────────────────────────────────
  // Zmluva o dielo po nemecky. Číta ju a podpisuje odberateľ, takže je to
  // jediný jazyk, ktorý dáva zmysel.
  //
  // Dokument je zároveň to, čo pri kontrole obhajuje celý biznis model. Preto
  // sú v ňom veci, ktoré by sa inak zabudli:
  //
  //   • **cena za dielo, nie za hodinu** — hodinová sadzba v zmluve o dielo
  //     je jeden z hlavných znakov skrytej Arbeitnehmerüberlassung. Keď je
  //     v zmluve hodinová, dokument to nezakrýva, ale doplní vetu o tom, že
  //     sadzba je podkladom pre výpočet odmeny za dielo, nie odmenou za čas;
  //   • **§ o postavení nasadených osôb** — samostatní podnikatelia s A1
  //     a vlastnou živnosťou, vlastné vedenie prác, vlastné náradie;
  //   • **dodatky v samotnom dokumente** — kto ho číta o rok, má vidieť
  //     dohodnutý stav, nie pôvodný.
  function werkvertrag({ contract: c, client, supplier, amendments = [], trade, terms }) {
    // Predvolené lehoty ako v Rahmenvertrag (7-dňové intervaly, splatnosť 7 dní).
    const L7 = lehotyDe(terms);
    const L = {
      hourly: 'Stundensatz', fixed: 'Pauschalpreis', unit: 'Einheitspreis',
    };
    const model = c.price_model || 'hourly';
    const verguetung = model === 'fixed'
      ? `<p><strong>Pauschalpreis: ${money(c.fixed_price)}</strong> zzgl. gesetzlicher
         Umsatzsteuer, sofern nicht die Steuerschuldnerschaft des Leistungs&shy;empfängers
         nach § 13b UStG greift.</p>`
      : model === 'unit'
        ? `<p><strong>Einheitspreis: ${money(c.unit_price)} je ${esc(c.unit_label || 'Einheit')}</strong>.
           Abgerechnet wird nach gemeinsamem Aufmaß.</p>`
        : `<p><strong>Verrechnungssatz: ${money(c.charge_rate)} je Stunde.</strong>
           Der Satz ist Berechnungsgrundlage für die Vergütung des Werks; er begründet
           keine Vergütung für Arbeitszeit und kein Weisungsrecht des Auftraggebers
           gegenüber den eingesetzten Personen.</p>`;

    // „§ 4" oranžovo, názov paragrafu za ním — ako „Článok I." v zmluve so živnostníkom.
    const par = (title, html) => `<div class="par"><h3>${esc(title)
      .replace(/^(§\s*\d+)\s+/, '<span class="cl">$1</span>')}</h3>${html}</div>`;

    const body = `
      ${header('Werkvertrag', c.contract_number, [], supplier, 'de')}
      ${parties(supplier, client, [['Vertrag', `
        <div style="font-size:12px;">
          ${c.date_from ? `Beginn: <strong>${date(c.date_from)}</strong><br>` : ''}
          ${c.date_to ? `Ende: <strong>${date(c.date_to)}</strong><br>` : ''}
          ${c.signed_at ? `Unterschrieben: <strong>${date(c.signed_at)}</strong>` : ''}
        </div>`]], 'de', { boxed: true })}

      <div class="lbl">Gegenstand</div>
      <div class="val" style="font-size:15px;font-weight:700;margin-bottom:4px">
        ${esc(c.title || '')}</div>

      ${par('§ 1 Vertragsgegenstand', c.scope
        ? `<p>${esc(c.scope)}</p>`
        : `<p><em>Der Leistungsgegenstand ist im Vertrag noch nicht beschrieben.</em></p>`)}

      ${par('§ 2 Leistungsort', `<p>${
        [c.site_name, c.site_address, c.site_city].filter(Boolean).map(esc).join(', ')
          || '<em>Baustelle nicht angegeben.</em>'}</p>`)}

      ${par('§ 3 Ausführungszeit', `<p>${
        c.date_from
          ? `Beginn ${date(c.date_from)}${c.date_to ? `, Fertigstellung ${date(c.date_to)}` : ''}.`
          : 'Nach gesonderter Vereinbarung.'}</p>`)}

      ${par(`§ 4 Vergütung (${L[model]})`, verguetung)}

      ${par('§ 5 Zahlungsbedingungen', `
        <p>Abrechnung ${L7.fakturacia_dni === 7 ? '<strong>wöchentlich</strong> (nach Kalenderwochen)'
          : `in <strong>${L7.fakturacia_dni}-Tages-Intervallen</strong>`}. Zahlungsziel:
        <strong>${esc(c.payment_terms_days ?? L7.splatnost_dni)} Tage</strong> ab Rechnungsdatum.</p>
        ${c.retention_pct ? `<p>Sicherheitseinbehalt:
          <strong>${esc(c.retention_pct)} %</strong> der Netto-Auftragssumme bis zum
          Ablauf der Gewährleistungsfrist.</p>` : ''}
        <p>Grundlage der Abrechnung ist der vom Auftraggeber
        <strong>unterschriebene Stundennachweis</strong> bzw. das gemeinsame Aufmaß.</p>`)}

      ${c.warranty_months ? par('§ 6 Gewährleistung',
        `<p><strong>${esc(c.warranty_months)} Monate</strong> ab Abnahme.</p>`) : ''}

      ${c.penalty_note ? par('§ 7 Vertragsstrafe', `<p>${esc(c.penalty_note)}</p>`) : ''}

      ${c.notice_days ? par('§ 8 Kündigung',
        `<p>Kündigungsfrist: <strong>${esc(c.notice_days)} Tage</strong>.</p>`) : ''}

      ${par('§ 9 Status der eingesetzten Personen', `
        <p>Der Auftragnehmer erbringt die Leistung als selbständiges Unternehmen.
        Die eingesetzten Personen sind <strong>selbständige Unternehmer</strong> mit
        eigenem Gewerbe und gültiger <strong>A1-Bescheinigung</strong>. Sie unterliegen
        <strong>keinem Weisungsrecht</strong> des Auftraggebers; die Arbeitsleitung
        obliegt dem Auftragnehmer.</p>
        <p>Es handelt sich um einen Werkvertrag und
        <strong>nicht um Arbeitnehmerüberlassung</strong>. ${
          trade ? `Gewerk: ${esc(trade)}. ` : ''}Der Bau-Mindestlohn nach AEntG wird
        eingehalten.</p>`)}

      ${amendments.length ? par('Nachträge', `
        <table><thead><tr><th>Nachtrag</th><th>Gegenstand</th><th class="r">Neu</th>
          <th class="r">Unterschrieben</th></tr></thead><tbody>
          ${amendments.map(a => `<tr>
            <td>${esc(a.amendment_number || '—')}</td>
            <td>${esc(AMEND_DE[a.field] || a.field)}</td>
            <td class="r">${esc(amendValue(a.field, a.new_value))}</td>
            <td class="r">${a.signed_at ? date(a.signed_at) : '—'}</td>
          </tr>`).join('')}
        </tbody></table>
        <p style="margin-top:6px;">Maßgeblich ist der durch die Nachträge geänderte
        Stand.</p>`) : ''}

      <div class="sigs">
        <div class="sig"><div class="line">${stamp(supplier)}</div>
          <div class="who">${esc(supplier?.name || 'Auftragnehmer')} · Ort, Datum</div></div>
        <div class="sig"><div class="line"></div>
          <div class="who">${esc(client?.name || 'Auftraggeber')} · Ort, Datum</div></div>
      </div>

      ${footSigned(supplier, 'de', 'Zwei gleichlautende Ausfertigungen')}`;
    return shell(`Werkvertrag ${c.contract_number || ''}`, body, { lang: 'de' });
  }

  // Dodatok mení jedno pole zmluvy. V nemeckom dokumente musí byť nemecký
  // názov toho poľa — nie náš vnútorný kľúč a nie slovenský dôvod, ktorý
  // sme si k nemu napísali pre seba.
  const AMEND_DE = {
    date_to: 'Ausführungszeit (Ende)',
    charge_rate: 'Verrechnungssatz',
    fixed_price: 'Pauschalpreis',
    unit_price: 'Einheitspreis',
    retention_pct: 'Sicherheitseinbehalt',
  };

  /** Hodnota dodatku v tvare, v akom patrí do zmluvy, nie v akom je v databáze. */
  function amendValue(field, value) {
    if (value == null || value === '') return '—';
    if (field === 'date_to') return date(value);
    if (field === 'retention_pct') return `${String(value).replace('.', ',')} %`;
    if (field === 'charge_rate') return `${money(value)} / Std.`;
    if (field === 'fixed_price' || field === 'unit_price') return money(value);
    return String(value);
  }

  // ── POTVRDENIE OBJEDNÁVKY (bez adresy! §5.1) ──────────────────────────────
  function orderConfirmation({ order, client, accommodation, supplier }) {
    const body = `
      ${header('Potvrdenie objednávky', order.order_number, [date(order.accepted_at || order.created_at)], supplier)}
      ${parties(supplier, client)}
      <table><thead><tr><th>Položka</th><th class="r">Podrobnosti</th></tr></thead><tbody>
        <tr><td>Ubytovanie</td><td class="r">${esc(accommodation?.city || '—')}${accommodation?.type ? ' · ' + esc(accommodation.type) : ''}</td></tr>
        <tr><td>Termín</td><td class="r">${date(order.date_from)} – ${date(order.date_to)}${order.nights ? ` (${order.nights} nocí)` : ''}</td></tr>
        <tr><td>Počet osôb</td><td class="r">${esc(order.persons)}</td></tr>
        <tr><td>Cena za lôžko a noc</td><td class="r">${money(order.price_per_bed_night)}</td></tr>
        <tr><td>Ubytovanie spolu</td><td class="r">${money(order.total_accommodation)}</td></tr>
        <tr><td>Sprostredkovateľský poplatok</td><td class="r">${money(order.service_fee)}</td></tr>
        ${order.urgent_surcharge ? `<tr><td>Príplatok za súrne vybavenie</td><td class="r">${money(order.urgent_surcharge)}</td></tr>` : ''}
        ${order.ongoing_service_enabled ? `<tr><td>Priebežná služba počas pobytu</td><td class="r">${money(order.ongoing_service_rate)} / osoba / deň</td></tr>` : ''}
      </tbody></table>
      <div class="note"><strong>Adresa ubytovania.</strong> Presnú adresu, kontakt na ubytovateľa
      a pokyny na prevzatie odovzdávame po úhrade sprostredkovateľského poplatku.</div>
      <div class="note"><strong>Storno podmienky.</strong> Pri zrušení viac ako 7 dní pred nástupom
      vraciame poplatok v plnej výške. Pri zrušení neskôr poplatok prepadá.</div>
      ${foot(supplier)}`;
    return shell(`Potvrdenie ${order.order_number || ''}`, body);
  }

  // ── VÝZVA NA PLATBU ───────────────────────────────────────────────────────
  function paymentRequest({ order, client, supplier, qrSvg, dueDate }) {
    const amount = (Number(order.service_fee) || 0) + (Number(order.urgent_surcharge) || 0);
    const vs = String(order.order_number || '').replace(/\D/g, '');
    const body = `
      ${header('Výzva na platbu', order.order_number, [], supplier)}
      ${parties(supplier, client)}
      <table><thead><tr><th>Popis</th><th class="r">Suma</th></tr></thead><tbody>
        <tr><td>Sprostredkovateľský poplatok · objednávka ${esc(order.order_number)}</td><td class="r">${money(order.service_fee)}</td></tr>
        ${order.urgent_surcharge ? `<tr><td>Príplatok za súrne vybavenie</td><td class="r">${money(order.urgent_surcharge)}</td></tr>` : ''}
      </tbody></table>
      <div class="total"><div class="total-box">
        <div class="total-row sum"><span>Na úhradu</span><span>${money(amount)}</span></div>
      </div></div>
      <div class="pay">
        <div style="flex:1">
          <div class="lbl">Platobné údaje</div>
          <div class="val" style="line-height:1.9">
            IBAN: <strong style="font-family:ui-monospace,monospace">${esc(supplier?.iban || '—')}</strong><br>
            Variabilný symbol: <strong style="font-family:ui-monospace,monospace">${esc(vs)}</strong><br>
            Suma: <strong>${money(amount)}</strong><br>
            Splatnosť: <strong>${date(dueDate)}</strong>
          </div>
        </div>
        ${qrSvg ? `<div style="text-align:center"><div class="lbl">Zaplatiť naskenovaním</div>${qrSvg}
          <div style="font-size:9.5px;color:#8C97AD;margin-top:4px">SEPA QR platba</div></div>` : ''}
      </div>
      <div class="note">Po pripísaní platby vám obratom pošleme adresu ubytovania,
      kontakt na ubytovateľa a pokyny na prevzatie.</div>
      ${foot(supplier)}`;
    return shell(`Výzva na platbu ${order.order_number || ''}`, body, { editable: false });
  }

  // ── UPOMIENKA (nemecky) ───────────────────────────────────────────────────
  /**
   * Zahlungserinnerung / Mahnung k vydanej faktúre. Text listu podľa stupňa
   * dodá `billing/dunning.js` (`paragraphs`) — tu je len papier: kto, komu,
   * ktorá faktúra, koľko a dokedy, a platobné údaje s QR.
   */
  function reminder({ invoice: inv = {}, client, supplier, title, paragraphs = [], deadline, qrSvg }) {
    const loc = 'de-DE';
    const p = payable(inv);
    const vs = String(inv.invoice_number || '').replace(/\D/g, '');
    const body = `
      ${header(title || 'Zahlungserinnerung', inv.invoice_number, [`Datum: ${date(new Date().toISOString())}`], supplier, 'de')}
      ${parties(supplier, client, [], 'de')}
      ${paragraphs.map(t => `<p class="par" style="font-size:13px;line-height:1.6">${esc(t)}</p>`).join('')}
      <table><thead><tr><th>Rechnung</th><th>Datum</th><th>Fällig am</th><th class="r">Offener Betrag</th></tr></thead><tbody>
        <tr><td>${esc(inv.invoice_number || '—')}</td><td>${date(inv.issue_date)}</td><td>${date(inv.due_date)}</td>
          <td class="r"><strong>${money(p.net, inv.currency, loc)}</strong></td></tr>
      </tbody></table>
      <div class="total"><div class="total-box">
        <div class="total-row sum"><span>Zu zahlen bis ${date(deadline)}</span><span>${money(p.net, inv.currency, loc)}</span></div>
      </div></div>
      <div class="pay">
        <div style="flex:1">
          <div class="lbl">Bankverbindung</div>
          <div class="val" style="line-height:1.9">
            IBAN: <strong style="font-family:ui-monospace,monospace">${esc(supplier?.iban || '—')}</strong><br>
            Verwendungszweck: <strong style="font-family:ui-monospace,monospace">${esc(vs)}</strong><br>
            Betrag: <strong>${money(p.net, inv.currency, loc)}</strong>
          </div>
        </div>
        ${qrSvg ? `<div style="text-align:center"><div class="lbl">Scannen und zahlen</div>${qrSvg}</div>` : ''}
      </div>
      <p class="par" style="font-size:13px">Mit freundlichen Grüßen<br><strong>${esc(supplier?.name || '')}</strong></p>
      ${foot(supplier, 'de')}`;
    return shell(`${title || 'Zahlungserinnerung'} ${inv.invoice_number || ''}`, body, { editable: true, lang: 'de' });
  }

  // ── POTVRDENIE MAJITEĽOVI (nemecky, §8) ───────────────────────────────────
  function ownerConfirmation({ order, accommodation, persons, supplier }) {
    const body = `
      ${header('Buchungsbestätigung', order.order_number, [], supplier, 'de')}
      <div class="cols">
        <div class="col"><div class="lbl">Vermittler</div><div class="val">
          <strong>${esc(supplier?.name || '—')}</strong><br>
          ${supplier?.email ? esc(supplier.email) + '<br>' : ''}${supplier?.phone ? esc(supplier.phone) : ''}
        </div></div>
        <div class="col"><div class="lbl">Unterkunft</div><div class="val">
          <strong>${esc(accommodation?.name || '—')}</strong><br>
          ${accommodation?.address ? esc(accommodation.address) + '<br>' : ''}
          ${esc(accommodation?.city || '')}<br>
          ${accommodation?.owner_name ? 'z. H. ' + esc(accommodation.owner_name) : ''}
        </div></div>
      </div>
      <table><thead><tr><th>Position</th><th class="r">Angabe</th></tr></thead><tbody>
        <tr><td>Zeitraum</td><td class="r">${date(order.date_from)} – ${date(order.date_to)}${order.nights ? ` (${order.nights} Nächte)` : ''}</td></tr>
        <tr><td>Anzahl Personen</td><td class="r">${esc(order.persons)}</td></tr>
        <tr><td>Preis pro Bett und Nacht</td><td class="r">${money(order.price_per_bed_night)}</td></tr>
        <tr><td>Gesamtbetrag Unterkunft</td><td class="r"><strong>${money(order.total_accommodation)}</strong></td></tr>
        <tr><td>Zahlungsart</td><td class="r">Auf Rechnung</td></tr>
      </tbody></table>
      ${(persons || []).length ? `<div class="lbl" style="margin-top:16px">Gäste</div>
        <ul class="clean">${persons.map(p => `<li>${esc(p.full_name)}${p.phone ? ' · ' + esc(p.phone) : ''}</li>`).join('')}</ul>` : ''}
      <div class="note">Bitte bestätigen Sie die Buchung kurz per E-Mail oder WhatsApp.
      Die Rechnung senden Sie bitte an die oben genannte Adresse des Vermittlers.</div>
      ${foot(supplier, 'de')}`;
    return shell(`Buchungsbestätigung ${order.order_number || ''}`, body, { toolbar: true, lang: 'de' });
  }

  // ── ODOVZDÁVACÍ PROTOKOL (obsahuje adresu — až po úhrade!) ────────────────
  // ── OBJEDNÁVKA ────────────────────────────────────────────────────────────
  /**
   * Dva doklady v jednom, lebo sú to dve strany tej istej práce.
   *
   * **Odberateľovi** ide *Auftragsbestätigung* po nemecky a hore na ňom je
   * **jeho** číslo objednávky. To je to, čo jeho účtovné oddelenie hľadá ako
   * prvé — bez neho sa doklad vracia.
   *
   * **Živnostníkovi** ide „Objednávka č. N" po slovensky — doslovne podľa
   * firemnej šablóny na Drive: číslo je poradové **v rade živnostníka** (č. 1,
   * č. 2 …), rozsah je jedna činnosť zo Zoznamu činností do Objednávky, odplata
   * za hodinu, deň začatia a skončenia (spravidla 31.12., koniec rámcovej
   * zmluvy), miesta výkonu vrátane adresy v SR a „celé územie" oboch štátov
   * a riadok pre iné špecifické podmienky. Nič navyše: vnútorné rady
   * (o hodinovej sadzbe, „organizuje si prácu sám") do dokladu pre
   * živnostníka nepatria a čiastočne odporovali čl. IV. rámcovej zmluvy.
   */
  /**
   * @param {Object} o
   *   ramcova  { number, signedAt } — rámcová zmluva, na ktorú sa objednávka
   *            odvoláva. **Bez nej to nie je individuálna zmluva o dielo**,
   *            len papier s cenou: článok III. rámcovej zmluvy hovorí, že
   *            individuálna zmluva vzniká práve vystavením objednávky a jej
   *            akceptáciou — a objednávka sa na ňu musí odvolať.
   *   places   miesta výkonu (DanubraSubcontract.miesta) — keď chýbajú, berú
   *            sa z objednávky (`order.places`).
   *   seq      poradové číslo u živnostníka (č. N); inak `order.seq_no`.
   */
  function workOrder({ order, supplier, partner, worker, subcontract,
    ramcova = null, places = [], seq = null } = {}) {
    const o = order || {};
    if (o.kind !== 'customer') {
      return workOrderZivnostnik({ o, supplier: supplier || {}, worker: worker || {}, subcontract,
        ramcova, places, seq });
    }
    const loc = 'de-DE';
    const cena = o.price_model === 'fixed'
      ? (o.fixed_price != null ? money(o.fixed_price, o.currency, loc) : '—')
      : o.price_model === 'unit'
        ? (o.unit_price != null
          ? `${money(o.unit_price, o.currency, loc)} / ${esc(o.unit_label || 'Einheit')}` : '—')
        : (o.rate != null ? `${money(o.rate, o.currency, loc)} / Std.` : '—');

    const L = {
      title: 'Auftragsbestätigung', their: 'Ihre Bestellnummer',
      scope: 'Leistungsumfang', site: 'Baustelle',
      term: 'Ausführungszeitraum', price: 'Preis', note: 'Anmerkung',
      confirm: 'Wir bestätigen den Erhalt Ihrer Bestellung und die Ausführung '
        + 'der oben beschriebenen Leistung zu den genannten Bedingungen.',
      missing: 'Der Leistungsumfang ist noch nicht festgelegt.',
    };

    const body = `
      ${header(L.title, o.order_number || '', [
        o.their_ref ? `${L.their}: ${o.their_ref}` : '',
        o.received_at ? `Bestellung vom ${date(o.received_at)}` : '',
      ].filter(Boolean), supplier, 'de')}

      ${o.their_ref ? `<div class="note info">
        <strong>${esc(L.their)}: ${esc(o.their_ref)}</strong> — bitte bei Rückfragen
        und auf allen Rechnungen angeben.</div>` : ''}

      ${parties(supplier, { name: partner && partner.name }, [], 'de')}

      <h2 class="ss-h">${esc(L.scope)}</h2>
      ${o.scope
        ? `<p style="font-size:13px;line-height:1.6;white-space:pre-wrap;margin:0">${esc(o.scope)}</p>`
        : `<p class="todo" style="margin:0">${esc(L.missing)}</p>`}

      <div class="ss-row"><div class="lbl">${esc(L.site)}</div>
        <div class="val">${esc((subcontract && (subcontract.title
          || subcontract.contract_number)) || '—')}</div></div>
      ${(places || []).length ? `<div class="ss-row">
        <div class="lbl">Weitere Ausführungsorte</div>
        <div class="val"><ul class="clean" style="margin:0">${
          places.filter(Boolean).map(x => '<li>' + esc(x) + '</li>').join('')}</ul></div>
      </div>` : ''}
      <div class="ss-row"><div class="lbl">${esc(L.term)}</div>
        <div class="val">${o.date_from ? `${date(o.date_from)} – ${date(o.date_to)}` : '—'}</div></div>
      <div class="ss-row"><div class="lbl">${esc(L.price)}</div>
        <div class="val"><strong>${cena}</strong></div></div>
      ${o.notes ? `<div class="ss-row"><div class="lbl">${esc(L.note)}</div>
        <div class="val">${esc(o.notes)}</div></div>` : ''}
      <div class="note">${esc(L.confirm)}</div>
      ${foot(supplier, 'de')}`;
    return shell(`${L.title} ${o.order_number || ''}`, body, { lang: 'de' });
  }

  /** „20,- €/ hod." ako v šablóne; desatinná sadzba „20,50 €/ hod.". */
  function sadzbaHod(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return '';
    return Number.isInteger(v) ? `${v},- €/ hod.` : `${v.toFixed(2).replace('.', ',')} €/ hod.`;
  }

  /** Koniec roka, v ktorom objednávka začína — „Deň skončenia: 31.12.2026". */
  function koniecRokaOd(d) {
    const y = String(d || new Date().toISOString()).slice(0, 4);
    return /^\d{4}$/.test(y) ? `${y}-12-31` : '';
  }

  /** Strana zmluvy v tvare zo šablón: popis „Sídlo:", „IČO:", „Štatutárny orgán:" … */
  function stranaRiadky(rows) {
    return rows.filter(r => r[1]).map(([l, v], i) => (i === 0
      ? `<strong>${esc(v)}</strong><br>` : `${esc(l)}: ${esc(v)}<br>`)).join('');
  }

  function workOrderZivnostnik({ o, supplier, worker, subcontract, ramcova, places, seq }) {
    const w = worker;
    const cislo = seq != null && seq !== '' ? seq : o.seq_no;
    const cinnost = String(o.activity || w.activity || '').trim();
    const miestaList = ((places && places.length) ? places : (o.places || [])).filter(Boolean);
    const koniec = o.date_to || koniecRokaOd(o.date_from);
    const sro = w.legal_form === 'sro' && w.company_name;
    const sadzba = o.price_model === 'fixed'
      ? (o.fixed_price != null ? `${money(o.fixed_price, o.currency)} (pevná cena)` : '')
      : o.price_model === 'unit'
        ? (o.unit_price != null ? `${money(o.unit_price, o.currency)} / ${esc(o.unit_label || 'jednotku')}` : '')
        : sadzbaHod(o.rate);
    const dnaOd = o.issued_at || o.created_at || o.received_at || new Date().toISOString();
    const riadok = (lbl, val) => `<div class="wo-row"><span class="wo-l">${esc(lbl)}</span> ${val}</div>`;

    const body = `
      ${header('Objednávka', cislo != null && cislo !== '' ? String(cislo) : '',
        [o.order_number ? `Evidenčné číslo: ${o.order_number}` : ''].filter(Boolean), supplier)}
      ${cislo == null || cislo === '' ? '<p class="todo">Objednávka ešte nemá poradové číslo u tohto zhotoviteľa (č. 1, č. 2 …).</p>' : ''}

      <div class="cols boxed">
        <div class="col"><div class="lbl">Objednávateľ</div><div class="val">${stranaRiadky([
          ['Obchodné meno', supplier.name || '—'], ['Sídlo', supplier.address], ['IČO', supplier.company_id],
          ['DIČ', supplier.tax_id], ['Zap.', supplier.register], ['Štatutárny orgán', supplier.statutory],
          ['Tel.', supplier.phone], ['E-mail', supplier.email]])}
          <span class="wo-as">(ďalej ako „Objednávateľ")</span></div></div>
        <div class="col"><div class="lbl">Zhotoviteľ</div><div class="val">${stranaRiadky([
          ['Obchodné meno', (sro ? w.company_name : (w.company_name || w.full_name)) || '—'],
          ['Sídlo', w.business_address || w.address], ['IČO', w.company_id],
          ['Štatutárny orgán', w.statutory || w.full_name], ['Tel.', w.phone], ['E-mail', w.email]])}
          <span class="wo-as">(ďalej ako „Zhotoviteľ")</span></div></div>
      </div>

      ${ramcova && (ramcova.number || ramcova.signedAt)
        ? `<p class="wo-lead">Objednávateľ si na základe Rámcovej zmluvy o dielo${ramcova.number
          ? ` č. <strong>${esc(ramcova.number)}</strong>` : ''}${ramcova.signedAt
          ? ` uzavretej dňa ${date(ramcova.signedAt)}` : ''} objednáva u zhotoviteľa nasledovný rozsah činností:</p>`
        : `<p class="todo">Objednávka sa neodvoláva na rámcovú zmluvu o dielo —
          doplňte jej číslo a dátum, inak to nie je individuálna zmluva o dielo.</p>`}

      <ol class="wo-ol">
        <li>${cinnost ? `<strong>${esc(cinnost)}</strong>`
          : '<span class="todo">Vyberte činnosť zo Zoznamu činností do Objednávky.</span>'}
          <div class="wo-pd">podľa projektovej dokumentácie, ktorá sa nachádza v mieste realizácie zákazky</div>
          ${o.scope && o.scope.trim() !== cinnost ? `<div class="wo-pd">${esc(o.scope)}</div>` : ''}</li>
      </ol>

      ${riadok('Odplata za vykonávanie činností podľa bodu 1:', sadzba
        ? `<strong>${esc(sadzba)}</strong>` : '<span class="todo">doplňte sadzbu</span>')}
      ${riadok('Deň začatia vykonávania činností:', o.date_from ? `<strong>${esc(date(o.date_from))}</strong>` : '<span class="todo">—</span>')}
      ${riadok('Deň skončenia vykonávania činností:', koniec ? `<strong>${esc(date(koniec))}</strong>` : '<span class="todo">—</span>')}
      <div class="wo-row"><span class="wo-l">Miesto vykonania činností:</span>
        ${miestaList.length ? `<ul class="wo-places">${miestaList.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
          : '<span class="todo">doplňte miesta výkonu</span>'}</div>
      ${riadok('Iné špecifické podmienky vykonávania činnosti:', o.notes ? esc(o.notes) : '......................')}

      <p class="wo-place">${esc(mestoZAdresy(supplier) || '…')}, dňa ${esc(date(dnaOd))}</p>
      <div class="sigs">
        <div class="sig"><div class="line">${stamp(supplier)}</div><div class="who">Objednávateľ</div></div>
        <div class="sig"><div class="line"></div><div class="who">Zhotoviteľ</div></div>
      </div>
      ${footSigned(supplier)}`;
    const css = `.wo-as{color:${BRAND.mute};font-size:11px}
      .wo-lead{font-size:12.5px;line-height:1.6;margin:14px 0 6px}
      .wo-ol{margin:0 0 10px;padding-left:22px;font-size:12.5px;line-height:1.6}
      .wo-pd{color:${BRAND.sub};font-size:12px}
      .wo-row{font-size:12.5px;line-height:1.6;margin:6px 0}
      .wo-l{color:${BRAND.sub}}
      .wo-places{margin:2px 0 0;padding-left:20px}
      .wo-place{margin:18px 0 0;font-size:12.5px}`;
    return shell(`Objednávka${cislo != null && cislo !== '' ? ` č. ${cislo}` : ''} — ${w.full_name || ''}`.trim(), body, { css });
  }

  // ── INFOLIST NA STAVBU ────────────────────────────────────────────────────
  /**
   * Jedna strana, ktorú živnostník dostane pred nástupom. Po slovensky —
   * číta ju Slovák. Adresy a nemecké vety sú v nemčine: preklad adresy
   * nikomu nepomôže, preložená veta „som subdodávateľ firmy X" áno.
   *
   * Údaj, ktorý nie je vyplnený, sa **nevynechá potichu**. Napíše sa, že
   * chýba, a u koho sa dá zistiť. Prázdny riadok na papieri vyzerá ako
   * „netreba" a práve pre to sa potom volá v nedeľu večer.
   */
  /** Telefón ako odkaz — na mobile sa naň ťukne a volá sa. */
  const telLink = (p) => {
    const t = String(p || '').trim();
    return t ? `<a href="tel:${esc(t.replace(/[^\d+]/g, ''))}">${esc(t)}</a>` : '';
  };

  /**
   * Kolegovia a kontakt — z `DanubraSiteSheet.colleagues()`. Partia, alebo
   * kontaktná osoba, alebo aspoň veta, že sa volá nám. Nikdy prázdne miesto.
   */
  function colleaguesBlock(kol, supplier) {
    const k = kol || {};
    const nase = supplier && supplier.phone ? ` na ${telLink(supplier.phone)}` : '';
    let out = '';
    if (k.crew) {
      out += `<div class="ss-row"><div class="lbl">Vaša partia</div>
        <div class="val"><strong>${esc(k.crew.name)}</strong>${k.crew.phone ? ` · ${telLink(k.crew.phone)}` : ''}
        ${(k.people || []).length
          ? `<ul class="clean" style="margin:6px 0 0">${k.people.map(p => `<li><strong>${esc(p.name)}</strong>`
            + `${p.role ? ` — ${esc(p.role)}` : ''}${p.phone ? ` · ${telLink(p.phone)}` : ''}</li>`).join('')}</ul>`
          : '<br><span style="color:#6F7A92">Ďalších členov partie zatiaľ nemáme zapísaných.</span>'}
        </div></div>`;
    }
    if (k.contact) {
      out += `<div class="ss-row"><div class="lbl">Kontaktná osoba</div>
        <div class="val"><strong>${esc(k.contact.name)}</strong>${k.contact.phone ? ` · ${telLink(k.contact.phone)}` : ''}
        ${k.contact.note ? `<br>${esc(k.contact.note)}` : ''}
        <br><span style="color:#6F7A92">Keď na stavbe niečo neviete, ozvite sa najprv tejto osobe.</span></div></div>`;
    }
    if (!out) {
      out = `<div class="ss-row"><div class="lbl">Na stavbe</div>
        <div class="val">Na tejto stavbe zatiaľ nemáte zapísaného kolegu. Keď niečo neviete,
        zavolajte nám${nase} — spojíme Vás s tým, kto to vie.</div></div>`;
    }
    return out;
  }

  /**
   * @param {Object} o  … ako doteraz, navyše:
   *   colleagues    výsledok `DanubraSiteSheet.colleagues()`
   *   lodgingSheet  true, keď ide spolu aj infolist k ubytovaniu — tu sa
   *                 potom ubytovanie len spomenie a odkáže sa naň
   */
  function siteSheet({ worker, assignment, subcontract, partner, lodging, supplier,
    trade, state, colleagues = null, lodgingSheet = false }) {
    const S = (typeof module !== 'undefined' && module.exports)
      ? require('./sitesheet') : window.DanubraSiteSheet;
    const sub = subcontract || {};
    const st = state || S.check({ worker, assignment, subcontract: sub, partner, lodging });
    const v = st.values;
    const chyba = (key) => {
      const m = st.missing.find(x => x.key === key);
      return m ? `<span class="todo">${esc(m.why)} Spýtajte sa u nás, kým nastúpite.</span>` : '';
    };
    const riadok = (label, key, extra) => `<div class="ss-row">
      <div class="lbl">${esc(label)}</div>
      <div class="val">${v[key] ? esc(v[key]) : chyba(key)}${extra || ''}</div>
    </div>`;

    const mapaStavby = S.mapUrl(sub);
    const mapaByt = lodging ? S.mapUrl(lodging) : '';
    const vety = S.phrases({ supplier, partner, worker, trade });

    const body = `
      ${header('Infolist na stavbu', (worker && worker.full_name) || '', [
        sub.title || '', sub.contract_number || ''].filter(Boolean), supplier)}

      <div class="note info">
        Toto si prosím vezmite so sebou. Keď niečo nesedí, <strong>zavolajte nám skôr,
        než niečo podpíšete alebo začnete robiť</strong> — na stavbe sa to potom rieši ťažko.
      </div>

      <h2 class="ss-h">Kam a kedy</h2>
      ${riadok('Stavba', 'site', mapaStavby
        ? ` <a href="${esc(mapaStavby)}">Otvoriť v mape</a>` : '')}
      <!-- Dátum po slovensky. check() vracia 'YYYY-MM-DD', lebo to je tvar na
           porovnávanie; na papier pre človeka patrí 12. 10. 2026. -->
      <div class="ss-row"><div class="lbl">Prvý deň</div>
        <div class="val">${v.start ? esc(date(v.start)) : chyba('start')}</div></div>
      ${riadok('Začiatok práce', 'time')}
      ${riadok('Kde sa hlásiť', 'meeting')}
      ${riadok('Za kým ísť', 'contact')}
      ${sub.site_note ? `<div class="ss-row"><div class="lbl">Ešte k stavbe</div>
        <div class="val">${esc(sub.site_note)}</div></div>` : ''}

      <h2 class="ss-h">Kolegovia a kontakt</h2>
      ${colleaguesBlock(colleagues, supplier)}

      <h2 class="ss-h">Ubytovanie</h2>
      ${riadok('Adresa', 'lodging', mapaByt
        ? ` <a href="${esc(mapaByt)}">Otvoriť v mape</a>` : '')}
      ${lodgingSheet && lodging ? `<p style="margin:8px 0 0;color:#4A5570">
        Podrobnosti o ubytovaní sú na samostatnom liste.</p>` : `
      ${riadok('Kľúče', 'keys')}
      ${lodging && lodging.house_rules ? `<div class="ss-row">
        <div class="lbl">Čo platí v dome</div>
        <div class="val">${esc(lodging.house_rules)}</div></div>` : ''}`}

      <h2 class="ss-h">Čo si priniesť</h2>
      <table><thead><tr><th>Vec</th><th>Prečo</th></tr></thead><tbody>
        ${S.BRING.map(b => `<tr><td><strong>${esc(b.what)}</strong></td>
          <td style="color:#6F7A92">${esc(b.why)}</td></tr>`).join('')}
      </tbody></table>

      <h2 class="ss-h">Ako sa hlásia hodiny</h2>
      <ul class="clean">
        <li>Hodiny zapisujte <strong>každý deň</strong>, nie na konci týždňa — spätne sa
          nikto nespomenie, kedy sa začalo a kedy skončilo.</li>
        <li>Na konci týždňa podpíše odberateľ výkaz (<em>Stundennachweis</em>).
          <strong>Nič iné nepodpisujte</strong>, kým sa neozvete nám.</li>
        <li>Z tých istých hodín vzniká Vaša faktúra nám aj naša faktúra odberateľovi.
          Preto sa musia zhodovať.</li>
      </ul>

      <h2 class="ss-h">Nemecké vety, ktoré sa Vám zídu</h2>
      <table><thead><tr><th>Po slovensky</th><th>Po nemecky</th></tr></thead><tbody>
        ${vety.map(f => `<tr><td style="color:#6F7A92">${esc(f.sk)}</td>
          <td><strong>${esc(f.de)}</strong></td></tr>`).join('')}
      </tbody></table>

      <h2 class="ss-h">Keď je problém</h2>
      <ul class="clean">
        <li><strong>Nepustia Vás na stavbu</strong> alebo chcú doklad, ktorý nemáte —
          zavolajte nám hneď, neriešte to sami.</li>
        <li><strong>Kontrola (Zoll, FKS)</strong> — ukážte A1 a živnostenský list,
          buďte slušný, nič nepodpisujte a zavolajte nám.</li>
        <li><strong>Úraz</strong> — najprv 112, potom nám. Aj drobný úraz treba nahlásiť
          v ten istý deň.</li>
        <li><strong>Chcú od Vás prácu mimo dohody</strong> — povedzte, že sa musíte
          spýtať, a zavolajte nám. Nie je to nezdvorilosť, je to zmluva.</li>
      </ul>

      ${supplier && (supplier.phone || supplier.email) ? `<div class="pay">
        <div style="flex:1">
          <div class="lbl">Na nás sa dovoláte tu</div>
          <div class="val" style="line-height:1.9">
            ${supplier.phone ? `Telefón: <strong>${esc(supplier.phone)}</strong><br>` : ''}
            ${supplier.email ? `E-mail: <strong>${esc(supplier.email)}</strong>` : ''}
          </div>
        </div>
      </div>` : ''}
      ${foot(supplier)}`;
    return shell(`Infolist — ${(worker && worker.full_name) || 'stavba'}`, body);
  }

  // ── INFOLIST K UBYTOVANIU ─────────────────────────────────────────────────
  /**
   * Druhý list k infolistu na stavbu. Kde bude bývať, ako sa dostane dnu,
   * s kým býva a komu volať, keď niečo nefunguje. Rovnaké pravidlo ako na
   * stavbe: chýbajúci údaj sa napíše, nevynechá.
   *
   * Majiteľ ubytovania je na liste **len keď je zapísaný telefón**, a len ako
   * záloha — problémy s ubytovaním riešime my. Keď ich ľudia riešia priamo
   * s majiteľom, o polovici sa dozvieme až z faktúry za škodu.
   *
   * @param {Object} o
   *   lodging        ubytovanie zákazky (danubra_subcontract_accommodations)
   *   accommodation  celý záznam ubytovania (kódy, Wi-Fi, check-in…) alebo null
   *   stay           jeho pobyt (date_from, date_to, note) alebo null
   *   roommates      mená ľudí, ktorí tam bývajú s ním
   *   colleagues     výsledok `DanubraSiteSheet.colleagues()`
   */
  function lodgingSheet({ worker, assignment, subcontract, lodging, accommodation, stay,
    roommates = [], colleagues = null, supplier } = {}) {
    const S = (typeof module !== 'undefined' && module.exports)
      ? require('./sitesheet') : window.DanubraSiteSheet;
    const l = lodging || {}, acc = accommodation || {}, sub = subcontract || {};
    const st = S.checkLodging({ lodging, accommodation, stay });
    const v = st.values;
    const t = (x) => (x == null ? '' : String(x).trim());
    const chyba = (key) => {
      const m = st.missing.find(x => x.key === key);
      return m ? `<span class="todo">${esc(m.why)} Spýtajte sa u nás, kým vycestujete.</span>` : '';
    };
    const row = (label, html) => (html ? `<div class="ss-row"><div class="lbl">${esc(label)}</div>
      <div class="val">${html}</div></div>` : '');

    const od = v.from ? esc(date(v.from)) : chyba('from');
    const doo = v.to ? esc(date(v.to)) : '<span style="color:#6F7A92">dátum odchodu zatiaľ nie je zapísaný</span>';
    const kody = [[t(acc.access_door_code), 'Kód dverí'], [t(acc.gate_code), 'Kód brány']].filter(x => x[0]);
    const kluce = t(l.keys_note) || t(acc.access_key_location)
      ? [t(l.keys_note), t(l.keys_note) !== t(acc.access_key_location) ? t(acc.access_key_location) : '']
        .filter(Boolean).map(esc).join('<br>') : '';
    const pravidla = [t(l.house_rules), t(acc.house_rules) !== t(l.house_rules) ? t(acc.house_rules) : '']
      .filter(Boolean);
    const spolu = (roommates || []).map(t).filter(Boolean);
    const kol = colleagues || {};
    const predak = kol.people && kol.people.find(p => p.leader);

    const body = `
      ${header('Infolist k ubytovaniu', (worker && worker.full_name) || '', [
        v.name || '', sub.title || ''].filter(Boolean), supplier)}

      <div class="note info">
        Tu je všetko o tom, kde budete bývať. Keď niečo nesedí — kľúče nie sú tam, kde
        majú byť, alebo je izba obsadená — <strong>zavolajte najprv nám</strong>, nie majiteľovi.
      </div>

      <h2 class="ss-h">Kde budete bývať</h2>
      ${row('Ubytovanie', v.name ? `<strong>${esc(v.name)}</strong>` : '')}
      <div class="ss-row"><div class="lbl">Adresa</div>
        <div class="val">${v.address ? esc(v.address) : chyba('address')}${v.map
          ? ` <a href="${esc(v.map)}">Otvoriť v mape</a>` : ''}</div></div>
      ${row('Poschodie / izba', [t(acc.floor) && `poschodie ${esc(t(acc.floor))}`,
        t(acc.room_number) && `izba ${esc(t(acc.room_number))}`].filter(Boolean).join(', '))}
      <div class="ss-row"><div class="lbl">Od – do</div>
        <div class="val">${v.from ? `${od} – ${doo}` : `${od}${v.to ? `<br>Do ${doo}` : ''}`}</div></div>
      ${row('Poznámka', esc(t(stay && stay.note) || t(l.note)))}

      <h2 class="ss-h">Ako sa dostanete dnu</h2>
      ${kluce || kody.length ? `${row('Kľúče', kluce)}
        ${kody.length ? `<div class="codes">${kody.map(([kod, lbl]) => `<div class="code">
          <div class="lbl">${esc(lbl)}</div><div class="v">${esc(kod)}</div></div>`).join('')}</div>` : ''}`
        : `<div class="ss-row"><div class="lbl">Kľúče</div><div class="val">${chyba('access')}</div></div>`}

      <h2 class="ss-h">Príchod a odchod</h2>
      <div class="ss-row"><div class="lbl">Príchod</div>
        <div class="val">${v.checkin ? esc(v.checkin) : chyba('checkin')}</div></div>
      <div class="ss-row"><div class="lbl">Odchod</div>
        <div class="val">${t(acc.checkout_info) ? esc(t(acc.checkout_info))
          : 'Pred odchodom sa nám ozvite — povieme Vám, komu a kedy odovzdať kľúče.'}</div></div>

      ${t(acc.wifi_ssid) ? `<h2 class="ss-h">Wi-Fi</h2>
        <div class="codes"><div class="code"><div class="lbl">Sieť</div><div class="v">${esc(t(acc.wifi_ssid))}</div></div>
        <div class="code"><div class="lbl">Heslo</div><div class="v">${esc(t(acc.wifi_password) || '—')}</div></div></div>` : ''}

      <h2 class="ss-h">S kým bývate</h2>
      ${spolu.length ? `<ul class="clean">${spolu.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`
        : '<p style="margin:0;color:#4A5570">Zatiaľ tu nemáme zapísaného nikoho ďalšieho.</p>'}

      <h2 class="ss-h">Čo platí v dome</h2>
      ${pravidla.length ? `<p style="margin:0 0 6px;white-space:pre-wrap">${esc(pravidla.join('\n'))}</p>` : ''}
      <ul class="clean">
        <li><strong>Nočný pokoj</strong> od 22:00 do 6:00. Susedia aj kolegovia ráno vstávajú.</li>
        <li><strong>Poriadok</strong> v izbe, kuchyni aj kúpeľni. Odpadky prosím triedte tak, ako je to v dome zvykom.</li>
        <li><strong>Žiadni ďalší hostia.</strong> Prespávať smú len ľudia, ktorí sú na ubytovaní zapísaní.</li>
        <li><strong>Keď sa niečo pokazí</strong>, dajte nám vedieť ešte v ten deň. Škodu uhrádza ten,
          kto ju spôsobil — preto nám prosím hneď po príchode nahláste aj to, čo pokazené už bolo.</li>
      </ul>

      <h2 class="ss-h">Komu volať, keď je problém</h2>
      <div class="pay"><div style="flex:1">
        <div class="lbl">Najprv nám</div>
        <div class="val" style="line-height:1.9">
          ${supplier && supplier.phone ? `Telefón: <strong>${telLink(supplier.phone)}</strong><br>` : ''}
          ${supplier && supplier.email ? `E-mail: <strong>${esc(supplier.email)}</strong>` : ''}
          ${!(supplier && (supplier.phone || supplier.email)) ? '<span class="todo">Naše číslo nie je zapísané v Nastaveniach.</span>' : ''}
        </div>
      </div>
      ${t(acc.owner_phone) ? `<div style="flex:1">
        <div class="lbl">Majiteľ — len keď sa nám nedovoláte</div>
        <div class="val" style="line-height:1.9">${t(acc.owner_name) ? `${esc(t(acc.owner_name))}<br>` : ''}
          <strong>${telLink(acc.owner_phone)}</strong></div>
      </div>` : ''}</div>
      ${kol.contact ? `<p style="margin:10px 0 0;color:#4A5570">Na stavbe: ${esc(kol.contact.name)}${kol.contact.phone
        ? ` · ${telLink(kol.contact.phone)}` : ''}</p>`
        : predak ? `<p style="margin:10px 0 0;color:#4A5570">Predák partie: ${esc(predak.name)}${predak.phone
          ? ` · ${telLink(predak.phone)}` : ''}</p>` : ''}
      ${foot(supplier)}`;
    return shell(`Ubytovanie — ${(worker && worker.full_name) || v.name || 'infolist'}`, body);
  }

  // ── VZOR FAKTÚRY ──────────────────────────────────────────────────────────
  const MESIACE = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august',
    'september', 'október', 'november', 'december'];
  function monthLabel(m) {
    const s = m instanceof Date ? m.toISOString() : String(m || '').trim();
    const x = s.match(/^(\d{4})-(\d{2})/);
    if (x && Number(x[2]) >= 1 && Number(x[2]) <= 12) return `${MESIACE[Number(x[2]) - 1]} ${x[1]}`;
    return s || 'obdobie podľa výkazu';
  }
  /** „18,5" / 18.5 / „18.50" → 1850. Bez sčítavania desatinných čísel. */
  function toCents(v) {
    if (v == null || v === '') return null;
    const s = String(v).trim().replace(/\s|€/g, '').replace(',', '.');
    const x = s.match(/^(\d+)(?:\.(\d+))?$/);
    if (!x) return null;
    const frac = (x[2] || '').padEnd(3, '0');
    const c = Number(x[1]) * 100 + Number(frac.slice(0, 2)) + (Number(frac[2]) >= 5 ? 1 : 0);
    return c > 0 ? c : null;
  }
  /** 296000 → „2 960,00 €" (pevná medzera, desatinná čiarka). */
  function centsText(c) {
    const e = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    return `${e},${String(c % 100).padStart(2, '0')}\u00a0€`;
  }

  const dniText = (n) => `${n} ${n === 1 ? 'deň' : n >= 2 && n <= 4 ? 'dni' : 'dní'}`;

  /** ISO kalendárny týždeň (KW) dňa „YYYY-MM-DD": { week, year, monday, sunday }. */
  function isoKw(d) {
    const t = new Date(`${String(d).slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(t.getTime())) return null;
    const den = (t.getUTCDay() + 6) % 7; // pondelok = 0
    const pon = new Date(t); pon.setUTCDate(t.getUTCDate() - den);
    const ned = new Date(pon); ned.setUTCDate(pon.getUTCDate() + 6);
    const stv = new Date(pon); stv.setUTCDate(pon.getUTCDate() + 3);
    const jan4 = new Date(Date.UTC(stv.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((stv - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
    return { week, year: stv.getUTCFullYear(), monday: pon.toISOString().slice(0, 10), sunday: ned.toISOString().slice(0, 10) };
  }

  /**
   * Kalendárne týždne obdobia v tvare zo vzoru faktúry V1.3:
   * „KW 39 (21.09.–27.09.2026)". Krajný týždeň sa oreže na hranicu obdobia.
   */
  function kwRiadky(from, to) {
    const f = String(from || '').slice(0, 10), tt = String(to || from || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(tt) || tt < f) return [];
    const dm = (x) => `${x.slice(8, 10)}.${x.slice(5, 7)}.`;
    const out = [];
    let k = isoKw(f);
    for (let i = 0; k && i < 60; i++) {
      const od = k.monday < f ? f : k.monday;
      const po = k.sunday > tt ? tt : k.sunday;
      out.push(`KW ${k.week} (${dm(od)}–${dm(po)}${po.slice(0, 4)})`);
      if (k.sunday >= tt) break;
      const dalsi = new Date(`${k.sunday}T12:00:00Z`); dalsi.setUTCDate(dalsi.getUTCDate() + 1);
      k = isoKw(dalsi.toISOString().slice(0, 10));
    }
    return out;
  }

  /**
   * Vzor faktúry pre živnostníka — **podľa firemného vzoru V1.3** (Google
   * Drive, „Vzor_faktury_zivnostnici V1.3"): verzia A pre neplatiteľa DPH,
   * verzia B pre platiteľa DPH (prenesenie daňovej povinnosti). Body 1 až 14
   * (B: 1 až 15) sú tie isté ako vo vzore, pevné texty o DPH doslovne.
   *
   * Rozhodnutie majiteľa: splatnosť je **14 dní od doručenia** (ako v rámcovej
   * zmluve čl. V bod 5), nie „od vystavenia" ako vo V1.3.
   *
   * E-mail na faktúry je z Nastavení (`supplier.invoice_inbox`, inak
   * `supplier.email`) — nikdy nie zapísaný v kóde.
   *
   * Peniaze sa tu nesčítavajú v desatinných číslach. Sadzba sa prevedie na
   * centy (celé číslo) a príklad sa počíta v centoch.
   *
   * Pri samofakturácii (faktúry zaňho vyhotovujeme my) je list iný a krátky:
   * faktúru vystavujeme my v jeho mene, on ju len potvrdí cez odkaz.
   *
   * @param {Object} o
   *   period   { from, to } — fakturované obdobie (2 KW); bez neho prvé dva
   *            týždne nasadenia (ako príklad)
   *   month    'YYYY-MM' — staré volanie; mení sa na týždne toho mesiaca
   *   order    objednávka živnostníka (činnosť, miesta)
   *   deductions { ubytovanie, ubytovanieMesiac, zaloha } — sumy v €, ak sú známe
   *   terms    lehoty z Nastavení (oddiel subcontract) — inak ako v rámcovej zmluve
   */
  function invoiceGuide({ worker, assignment, subcontract, supplier, month, period, order, deductions, terms } = {}) {
    const w = worker || {}, a = assignment || {}, sub = subcontract || {}, s = supplier || {};
    const o = order || {};
    const SC = (typeof module !== 'undefined' && module.exports)
      ? require('./subcontract') : (typeof window !== 'undefined' && window.DanubraSubcontract);
    const lehoty = { ...((SC && SC.SUMY) || { splatnost_dni: 14, samofakt_namietka_dni: 5 }), ...(terms || {}) };
    const t = (x) => (x == null ? '' : String(x).trim());
    const doplnte = '<span class="todo">doplňte</span>';
    const sadzba = toCents(a.worker_rate != null && a.worker_rate !== '' ? a.worker_rate : w.hourly_cost);
    const sadzbaText = sadzba ? `${centsText(sadzba)}/h` : '';
    const meno = t(w.company_name) || t(w.full_name);
    const adresa = t(w.business_address)
      ? [t(w.business_address), [t(w.business_zip), t(w.business_city)].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      : t(w.address);
    const kam = t(s.invoice_inbox) || t(s.email);
    const volajte = s.phone ? ` na ${telLink(s.phone)}` : '';
    const vykaz = '<li><strong>Priložte podpísaný výkaz hodín</strong> (<em>Stundennachweis</em>). '
      + 'Bez neho faktúru nemôžeme uhradiť — hodiny na faktúre sa musia zhodovať s výkazom.</li>';

    const jehoSelf = `<strong>${meno ? esc(meno) : doplnte}</strong><br>
      ${adresa ? esc(adresa) : `Adresa: ${doplnte}`}<br>
      IČO: ${t(w.company_id) ? esc(t(w.company_id)) : doplnte}<br>
      DIČ: ${t(w.tax_id) ? esc(t(w.tax_id)) : doplnte}<br>
      ${t(w.vat_id) ? `IČ DPH: ${esc(t(w.vat_id))}<br>` : ''}
      IBAN: ${t(w.bank_iban) ? esc(t(w.bank_iban)) : doplnte}`;

    const samofakt = w.self_billing === true || (w.self_billing == null && !!t(w.self_billing_prefix));
    if (samofakt) {
      const body = `
        ${header('Ako fakturujeme za Vás', meno || '', ['Samofakturácia', t(sub.title)].filter(Boolean), s)}
        <div class="note info">
          Faktúry za Vašu prácu <strong>vystavujeme my — vo Vašom mene a na Váš účet</strong>
          (samofakturácia — vyhotovenie faktúry odberateľom, rámcová zmluva čl. V. body 10 až 14).
          Vlastnú faktúru nám za tieto obdobia preto neposielajte.
        </div>
        <h2 class="ss-h">Ako to prebieha</h2>
        <ul class="clean">
          <li>Po skončení obdobia (spravidla 2 kalendárne týždne) pripravíme faktúru z podpísaného výkazu hodín${sadzbaText
            ? ` so sadzbou <strong>${sadzbaText}</strong>` : ''}.</li>
          <li>Pošleme Vám odkaz (SMS, e-mail alebo WhatsApp). Faktúru si pozriete a <strong>potvrdíte ju
            cez ten odkaz</strong>. Keď niečo nesedí, napíšte nám do ${dniText(lehoty.samofakt_namietka_dni)}.</li>
          ${vykaz}
        </ul>
        <h2 class="ss-h">Skontrolujte svoje údaje</h2>
        <div class="cols boxed"><div class="col"><div class="lbl">Na faktúre budete ako dodávateľ</div>
          <div class="val">${jehoSelf}</div></div></div>
        <p style="margin:0;color:#4A5570">Za správnosť týchto údajov zodpovedáte Vy. Keď sa niečo zmení
          — účet, adresa, alebo sa stanete platiteľom DPH — zavolajte nám${volajte} hneď.</p>
        ${foot(s)}`;
      return shell(`Samofakturácia — ${meno || 'živnostník'}`, body);
    }

    // ── Verzia A / B podľa toho, či je platiteľ DPH ──
    const platitel = !!w.vat_payer || /^SK\d/i.test(t(w.vat_id));
    const ver = platitel ? 'B' : 'A';
    const rok = String(new Date().getFullYear());

    // Obdobie: zadané, alebo z mesiaca, alebo prvé dva týždne nasadenia.
    let od = period && period.from, po = period && period.to, priklad = false;
    if (!od && month) {
      const m = String(month).match(/^(\d{4})-(\d{2})/);
      if (m) { od = `${m[1]}-${m[2]}-01`; po = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).toISOString().slice(0, 10); }
    }
    if (!od) {
      priklad = true;
      const start = t(a.date_from) || new Date().toISOString().slice(0, 10);
      const k = isoKw(start);
      if (k) {
        od = start;
        const k2 = new Date(`${k.sunday}T12:00:00Z`); k2.setUTCDate(k2.getUTCDate() + 7);
        po = k2.toISOString().slice(0, 10);
      }
    }
    const kw = kwRiadky(od, po);
    const dodanie = po || '';

    const stavba = (SC && SC.adresaStavby) ? SC.adresaStavby(sub) : [t(sub.site_address), t(sub.site_city)].filter(Boolean).join(', ');
    const cinnost = t(o.activity) || t(w.activity);
    const zr = t(w.trade_register);
    const bic = t(w.bank_bic);
    const ub = toCents(deductions && deductions.ubytovanie);
    const zal = toCents(deductions && deductions.zaloha);
    const ubMes = t(deductions && deductions.ubytovanieMesiac) || (dodanie ? MESIACE[Number(dodanie.slice(5, 7)) - 1] : '');
    const H = 945; // príklad 94,5 h ako vo vzore V1.3 (desatiny hodiny)
    const prace = sadzba ? Math.round((H * sadzba) / 10) : null;
    const spolu = prace != null ? prace - (ub || 0) - (zal || 0) : null;
    const minus = (c, label) => (c ? `−${centsText(c)}` : `<span class="todo">−${label}</span>`);
    const DPH_A = 'Dodávateľ nie je platiteľom DPH.';
    const DPH_B = 'Prenesenie daňovej povinnosti – Steuerschuldnerschaft des Leistungsempfängers.';
    const DPH_16 = 'Dodané služby uskutočnené na území Nemecka, nie sú predmetom DPH na Slovensku v zmysle §16 ods. 1 '
      + 'zák. 222/2004. Artikel 194 und 199 MwStSystRL i.V.m §13b Absatz 2 UstG';

    const n = (k) => `<span class="iv-n">${k}</span>`;
    const riadok = (k, lbl, val, sub2) => `<div class="iv-row">${n(k)}<div class="iv-l">${esc(lbl)}${sub2
      ? `<small>${esc(sub2)}</small>` : ''}</div><div class="iv-v">${val}</div></div>`;
    const odberatel = `<strong>${esc(s.name || '—')}</strong><br>
      ${s.address ? esc(s.address) + '<br>' : ''}
      ${[s.company_id && `IČO ${esc(s.company_id)}`, s.tax_id && `DIČ ${esc(s.tax_id)}`].filter(Boolean).join(' · ')}
      ${platitel ? `<br>IČ DPH: ${s.vat_id ? esc(s.vat_id) : doplnte}` : ''}`;
    const dodavatel = `<strong>${meno ? esc(meno) : doplnte}</strong><br>
      ${adresa ? esc(adresa) : `Adresa: ${doplnte}`}<br>
      IČO ${t(w.company_id) ? esc(t(w.company_id)) : doplnte} · DIČ ${t(w.tax_id) ? esc(t(w.tax_id)) : `${doplnte} <small>(ak nemáte DIČ, rodné číslo)</small>`}
      ${platitel ? `<br>IČ DPH: ${t(w.vat_id) ? esc(t(w.vat_id)) : doplnte}` : ''}`;

    const vzor = `
      <div class="iv">
        <div class="iv-head"><b>Faktúra č. ${esc(rok)}001</b><span>VZOR${platitel ? ' · PLATITEĽ DPH' : ''}</span></div>
        ${riadok(1, 'Číslo faktúry', `<strong>${esc(rok)}001</strong>`, 'rok + trojmiestne poradové číslo bez lomky')}
        ${riadok(2, 'Dátumy', `Vystavenie: deň vystavenia · Dodanie: <strong>${dodanie ? esc(date(dodanie)) : 'posledný deň obdobia'}</strong> · Splatnosť: <strong>${esc(dniText(lehoty.splatnost_dni))} od doručenia</strong>`)}
        <div class="cols boxed iv-cols">
          <div class="col"><div class="lbl">${n(3)} Dodávateľ — Vy</div><div class="val">${dodavatel}</div>
            <div class="val iv-zr">${n(4)} Zapísaný v Živnostenskom registri: ${zr ? esc(zr) : `${doplnte} <small>(Okresný úrad …, č. ŽR …)</small>`}</div></div>
          <div class="col"><div class="lbl">${n(5)} Odberateľ — my</div><div class="val">${odberatel}</div>
            <div class="lbl" style="margin-top:8px">Dodacia adresa odberateľa</div><div class="val">${odberatel}</div></div>
        </div>
        ${riadok(6, 'Platobné údaje', `Spôsob úhrady: <strong>bezhotovostne</strong> · IBAN: ${t(w.bank_iban) ? `<strong>${esc(t(w.bank_iban))}</strong>` : doplnte}
          · SWIFT (BIC): ${bic ? `<strong>${esc(bic)}</strong>` : doplnte} · Variabilný symbol = číslo faktúry`)}
        ${riadok(7, 'Položka', cinnost ? `<strong>${esc(cinnost)}</strong>` : `${doplnte} <small>(činnosť z Vašej objednávky)</small>`, 'činnosť podľa platnej objednávky')}
        ${riadok(8, 'Obdobie', kw.length ? kw.map(esc).join('<br>') : doplnte, priklad ? 'napr. prvé dva týždne — vždy podľa výkazu' : 'kalendárne týždne s dátumami')}
        ${riadok(9, 'Projekt – miesto výkonu', stavba ? `<strong>${esc(stavba)}</strong>` : `${doplnte} <small>(presná adresa stavby)</small>`, 'dve stavby v jednom období = dve faktúry')}
        ${platitel ? `
          ${riadok(10, 'Realizované práce', sadzba ? `94,5 h × ${centsText(sadzba)}/h (cena bez DPH) = <strong>${centsText(prace)}</strong>` : 'hodiny × hodinová sadzba bez DPH', 'počet hodín × sadzba podľa výkazu')}
          <div class="iv-row">${n(11)}<div class="iv-l">Rozpis DPH</div><div class="iv-v">
            <table class="iv-t"><thead><tr><th>Sadzba DPH</th><th class="r">Základ dane</th><th class="r">DPH</th><th class="r">Spolu</th></tr></thead>
            <tbody><tr><td>Prenesenie daňovej povinnosti</td><td class="r">${prace != null ? centsText(prace) : '…'}</td><td class="r">—</td><td class="r">${prace != null ? centsText(prace) : '…'}</td></tr></tbody></table></div></div>
          ${riadok(12, `Započítanie: ubytovanie ${ubMes}`, minus(ub, 'suma podľa nášho vyúčtovania'), 'až pod rozpisom DPH — základ dane ostáva celá suma prác')}
          ${riadok(13, 'Odpočet uhradenej zálohy', minus(zal, 'ak ste dostali zálohu'), 'ak ste zálohu nedostali, riadok vynechajte')}
          ${riadok(14, 'Celkom k úhrade', spolu != null && (ub || zal) ? `<strong>${centsText(spolu)}</strong>` : 'spolu za faktúru mínus ubytovanie a záloha')}
          ${riadok(15, 'Text o DPH', `<strong>${esc(DPH_B)}</strong><br>${esc(DPH_16)}`, 'povinný pevný text — prepíšte presne')}`
        : `
          ${riadok(10, 'Realizované práce (celková suma)', sadzba ? `napr. 94,5 h × ${centsText(sadzba)}/h = <strong>${centsText(prace)}</strong>` : 'celková suma za obdobie podľa výkazu', 'bez DPH — nič nepripočítavajte')}
          ${riadok(11, `Sprostredkovanie ubytovania – ${ubMes || '[mesiac]'}`, minus(ub, 'suma podľa nášho vyúčtovania'), 'so znamienkom mínus')}
          ${riadok(12, 'Záloha', minus(zal, 'ak ste dostali zálohu'), 'ak ste zálohu nedostali, riadok vynechajte')}
          ${riadok(13, 'Celkom k úhrade', spolu != null && (ub || zal) ? `<strong>${centsText(spolu)}</strong>` : 'realizované práce mínus ubytovanie a záloha')}
          ${riadok(14, 'Text o DPH', `<strong>${esc(DPH_A)}</strong><br>${esc(DPH_16)}`, 'povinný pevný text — prepíšte presne')}`}
        <div class="iv-row iv-sign">Vystavil: ${meno ? esc(meno) : doplnte}</div>
      </div>`;

    const chyby = platitel
      ? ['pripočítaná slovenská DPH 23 %', 'chýba IČ DPH dodávateľa alebo odberateľa',
        'ubytovanie alebo záloha odpočítané zo základu dane', 'chýba „Prenesenie daňovej povinnosti"',
        'chýbajú týždne s dátumami alebo adresa stavby', 'IBAN na inú osobu']
      : ['pripočítaná DPH 23 %', 'chýbajú týždne s dátumami alebo adresa stavby', 'činnosť nesedí s objednávkou',
        'zmenený alebo vynechaný text o DPH', 'neodpočítané ubytovanie alebo záloha', 'chýba DIČ (alebo rodné číslo) či SWIFT'];
    const kontrola = platitel
      ? ['v rozpise nie je žiadna DPH (—)', 'hodiny × sadzba sedia s výkazom', 'obe IČ DPH aj SWIFT sú vyplnené',
        'záloha je odpočítaná (ak bola)', `posielate ju na ${kam || 'náš e-mail na faktúry'}`]
      : ['sumy sedia s výkazom hodín', 'číslo faktúry ste ešte nepoužili', 'záloha je odpočítaná (ak bola)',
        'sú vyplnené všetky body 1 – 14', `posielate ju na ${kam || 'náš e-mail na faktúry'}`];

    const body = `
      ${header('Vzor faktúry', meno || '', ['Pokyny pre živnostníkov', `Verzia ${ver} · ${platitel ? 'platiteľ DPH' : 'neplatiteľ DPH'}`].filter(Boolean), s)}
      <div class="note info">
        Za odpracované obdobie vystavujete faktúru firme <strong>${esc(s.name || 'objednávateľ')}</strong>
        — spravidla za <strong>2 kalendárne týždne</strong> (KW), po podpise výkazu hodín.
        ${platitel
          ? 'Ste platiteľ DPH (máte IČ DPH SK…), preto použite <strong>verziu B</strong>: slovenskú DPH 23 % k prácam v Nemecku nepripočítavate — DPH tam za Vás odvádza odberateľ (prenesenie daňovej povinnosti).'
          : 'Nie ste platiteľ DPH (máte IČO a DIČ, nemáte IČ DPH), preto použite <strong>verziu A</strong>. Ak Vám daňový úrad pridelí IČ DPH (SK…), ozvite sa nám — platí verzia B.'}
        Pevné texty zo vzoru (najmä text o DPH) prepíšte presne tak, ako sú.
      </div>
      <div class="iv-mail">${kam
        ? `Faktúry posielajte <strong>výhradne na ${esc(kam)}</strong> · ako PDF, nie fotku · jedna faktúra = jeden e-mail`
        : '<span class="todo">E-mail na faktúry nie je zapísaný v Nastaveniach. Spýtajte sa u nás, kam faktúru poslať.</span>'}</div>
      ${vzor}
      <h2 class="ss-h">Najčastejšie chyby</h2>
      <ul class="clean iv-bad">${chyby.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <h2 class="ss-h">Pred odoslaním skontrolujte</h2>
      <ul class="clean">${kontrola.map(x => `<li>${esc(x)}</li>`).join('')}
        ${vykaz}
        <li>Faktúru vystavte až po podpise výkazu — nie vopred.</li></ul>
      <p style="margin:6px 0 0;color:#4A5570">Faktúru s chybou musíme vrátiť na opravu, čím sa posunie aj platba.
        Ak si nie ste istí, ozvite sa nám${volajte} radšej pred odoslaním.${platitel
          ? ' Ako platiteľ DPH túto faktúru uvádzate aj vo svojom DPH priznaní — postup Vám potvrdí Váš účtovník.' : ''}</p>
      ${foot(s)}`;
    const css = `.iv{border:1px solid ${BRAND.line};border-radius:10px;padding:12px 14px;margin:12px 0}
      .iv-head{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 8px}
      .iv-head b{font-family:Outfit,Arial,sans-serif;font-size:16px;color:${BRAND.navy}}
      .iv-head span{color:${BRAND.orange};font-weight:700;font-size:11px;letter-spacing:.08em}
      .iv-row{display:grid;grid-template-columns:22px 190px 1fr;gap:6px;padding:5px 0;border-top:1px solid ${BRAND.line};font-size:12px;line-height:1.5}
      .iv-n{display:inline-block;min-width:18px;height:18px;border-radius:9px;background:${BRAND.orange};color:#fff;font-size:10.5px;font-weight:700;text-align:center;line-height:18px;padding:0 4px}
      .iv-l{color:${BRAND.sub}}
      .iv-l small{display:block;color:${BRAND.mute};font-size:10.5px}
      .iv-cols{margin:6px 0}
      .iv-cols .lbl .iv-n{margin-right:4px}
      .iv-zr{margin-top:6px;font-size:11.5px}
      .iv-t{margin:0;font-size:11.5px}
      .iv-sign{display:block;color:${BRAND.sub}}
      .iv-mail{background:${BRAND.navy};color:#fff;border-radius:8px;padding:8px 12px;font-size:12.5px;margin:8px 0}
      .iv-mail strong{color:#fff}
      .iv-bad li::marker{color:#C62828}
      @media (max-width:560px){.iv-row{grid-template-columns:22px 1fr}.iv-row .iv-v{grid-column:2}}`;
    return shell(`Vzor faktúry — ${meno || 'živnostník'}`, body, { css });
  }

  // ── OBJEDNÁVKA OD NEMECKÉHO ODBERATEĽA, DVOJJAZYČNE ──────────────────────
  // Tretí krok, druhý papier. Rámcová zmluva hovorí, **ako** sa spolupracuje;
  // objednávka hovorí, **čo, kde, odkedy a za koľko** — a práve ona je tým,
  // čím individuálna zmluva o dielo vzniká.
  //
  // Text bodov 1 až 6 je doslovne podľa firemnej šablóny „Bestellung SK_DE"
  // (Google Drive). Dvojjazyčne v dvoch stĺpcoch, rovnako ako zmluva: on
  // podpisuje po nemecky, my čítame po slovensky.

  /** Pevné dvojice popiskov. Oddelene od údajov, nech sa dajú opraviť naraz. */
  const BESTELLUNG_L = {
    title: 'Objednávka / Bestellung',
    scope: ['Rozsah objednaných prác', 'Umfang der bestellten Arbeiten'],
    price: ['Cenové a kvantitatívne podmienky', 'Preis- und Mengenbedingungen'],
    from: ['Termín začatia vykonávania diela', 'Termin für den Beginn der Ausführung des Werkes'],
    to: ['Termín ukončenia vykonávanie diela', 'Termin für die Fertigstellung des Werkes'],
    place: ['Miesto vykonania diela', 'Ausführungsort'],
    special: ['Osobitné dojednania a špecifické podmienky realizácie',
      'Besondere Vereinbarungen und spezifische Ausführungsbedingungen'],
    ext: ['s možným predĺžením', 'mit möglicher Verlängerung'],
    count: ['Počet pracovníkov', 'Anzahl der Mitarbeiter'],
  };

  /** „29- €" ako v šablóne (celé eurá), inak „29,50 €". */
  function sadzbaBestellung(n, de) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '';
    if (Number.isInteger(v)) return de ? `${v},- €` : `${v}- €`;
    return `${v.toFixed(2).replace('.', ',')} €`;
  }
  /** „45-55" hodín — rozsah od–do; jedno číslo, keď je len jedno. */
  function rozsahHodin(min, max) {
    const f = (x) => String(x).replace('.', ',');
    const a = min != null && min !== '' && Number(min) > 0 ? f(Number(min)) : '';
    const b = max != null && max !== '' && Number(max) > 0 ? f(Number(max)) : '';
    if (a && b && a !== b) return `${a}-${b}`;
    return a || b;
  }

  /**
   * Strana zmluvy SK_DE presne v poradí šablóny (Rahmenvertrag aj Bestellung):
   * Obchodné meno, Sídlo, IČO, Zápis v registri, Bankové spojenie, IBAN,
   * SWIFT, Telefonické spojenie, Emailová komunikácia, Steuernummer, IČ DPH,
   * Štatutárny orgán, Zastúpený. Prázdne riadky sa nevypisujú.
   */
  function stranaSkDe(titul, x = {}) {
    const R = [
      ['Obchodné meno / Firmenname', x.name],
      ['Sídlo / Sitz', x.address],
      ['IČO / Identifikationsnummer', x.company_id],
      ['Zápis v registri / Eintragung im Register', x.register],
      ['Bankové spojenie / Bankverbindung', x.bank_name],
      ['IBAN', x.iban],
      ['SWIFT', x.bic],
      ['Telefonické spojenie / Telefonische Verbindung', x.phone],
      ['Emailová komunikácia / E-Mail-Kommunikation', [x.email, x.invoice_email
        ? `Faktúry/Rechnungen: ${x.invoice_email}` : ''].filter(Boolean).join(', ')],
      ['Nemecké daňové číslo / Steuernummer', x.tax_number],
      ['IČ DPH / Umsatzsteuer-Identifikationsnummer', x.vat_id],
      ['Štatutárny orgán / Statutarisches Organ', x.statutory],
      ['Zastúpený / Vertreten durch', x.representative || x.statutory],
    ].filter(r => r[1] != null && String(r[1]).trim() !== '');
    return `<div class="col"><div class="lbl">${esc(titul)}</div><div class="val skde">${R.map(([l, v], i) => (i === 0
      ? `<strong>${esc(v)}</strong><br>` : `<span class="skde-l">${esc(l)}:</span> ${esc(v)}<br>`)).join('')}</div></div>`;
  }
  /** Naša firma do strany SK_DE (Nastavenia). */
  const nasaSkDe = (s = {}) => ({ ...s, tax_number: s.tax_number_de });
  /** Odberateľ do strany SK_DE (danubra_partners + staré názvy polí). */
  const jehoSkDe = (c = {}) => ({ ...c, company_id: c.registration_no || c.company_id, vat_id: c.ust_idnr || c.vat_id,
    statutory: c.statutory_body || c.statutory, representative: c.representative || c.contact_person });

  /** „V Nové Zámky, dňa 12.10.2026 / In Blaubeuren, am 12.10.2026" — dve miesta podpisu ako v šablóne. */
  function miestoPodpisuSkDe(supplier, client, d) {
    const den = esc(date(d || new Date().toISOString().slice(0, 10)));
    const nase = mestoZAdresy(supplier) || '…';
    const jeho = String((client && client.city) || mestoZAdresy({ address: client && client.address }) || '…');
    return `<div class="par"><p>V ${esc(nase)}, dňa ${den} / In ${esc(jeho)}, am ${den}</p></div>`;
  }

  /**
   * @param {Object} o
   *   order     { number (Nr. N u odberateľa), scope_sk, scope_de, rate, headcount,
   *               hours_week_min, hours_week_max, date_from, date_to, extendable,
   *               places, places_de, special_sk, special_de, signed_at }
   *   supplier  naše fakturačné údaje
   *   client    odberateľ
   *   ramcova   { number, signedAt } — zmluva, na ktorú sa objednávka odvoláva;
   *             šablóna nemá číslo zmluvy, stačí dátum jej uzavretia
   *   chyba     čo doplniť pred podpisom
   */
  function bestellung({ order = {}, supplier = {}, client = {},
    ramcova = null, chyba = [] } = {}) {
    const o = order;
    const dvoj = (n, sk, de) => `<div class="bil">
      <div class="bil-n">${n !== '' ? `${n}.` : ''}</div>
      <div class="bil-sk">${sk}</div>
      <div class="bil-de">${de}</div>
    </div>`;
    const riadok = (n, label, hodnota) => dvoj(n,
      `<strong>${esc(label[0])}:</strong><br>${hodnota}`,
      `<strong>${esc(label[1])}:</strong><br>${hodnota}`);

    // Rozsah od–do (45-55) z objednávky; staré záznamy mali voľný text.
    const rozsah = rozsahHodin(o.hours_week_min, o.hours_week_max);
    const hodSk = rozsah ? `${rozsah} hodín / týždeň / osoba` : String(o.hours_week || '').trim();
    const hodDe = rozsah ? `${rozsah} Stunden / Woche / Person` : String(o.hours_week_de || '').trim();
    const cenaSk = o.rate != null && o.rate !== ''
      ? `<strong>${esc(BESTELLUNG_L.price[0])}:</strong> Odmena za vykonanie diela podľa bodu 1 je stanovená `
        + `dohodou zmluvných strán vo výške: <strong>${esc(sadzbaBestellung(o.rate, false))} / hodina</strong>. `
        + `Predpokladaný časový rozsah potrebný na realizáciu predmetu diela je v rozmedzí `
        + `${hodSk ? `<strong>${esc(hodSk)}</strong>` : '<span class="todo">…… hodín / týždeň / osoba</span>'}.`
      : `<strong>${esc(BESTELLUNG_L.price[0])}:</strong> <span class="todo">Sadzba nie je dohodnutá.</span>`;
    const cenaDe = o.rate != null && o.rate !== ''
      ? `<strong>${esc(BESTELLUNG_L.price[1])}:</strong> Die Vergütung für die Erstellung des Werkes gemäß Punkt 1 `
        + `wird durch Vereinbarung der Vertragsparteien in Höhe von `
        + `<strong>${esc(sadzbaBestellung(o.rate, true))} / Stunde</strong> festgelegt. Der voraussichtliche `
        + `Zeitaufwand für die Realisierung des Vertragsgegenstandes beläuft sich auf `
        + `${hodDe ? `<strong>${esc(hodDe)}</strong>` : '<span class="todo">…… Stunden / Woche / Person</span>'}.`
      : `<strong>${esc(BESTELLUNG_L.price[1])}:</strong> <span class="todo">Der Satz ist nicht vereinbart.</span>`;
    const pocet = o.headcount != null && o.headcount !== '' && Number(o.headcount) > 0 ? String(Number(o.headcount)) : '';

    // Adresa stavby je v oboch stĺpcoch tá istá — ale krajina nie: v nemeckom
    // stĺpci nemá stáť „Nemecko". Keď nemecký variant nie je, použije sa
    // slovenský; je to adresa, nie veta.
    const zoznamMiest = (list) => {
      const m = (list || []).filter(Boolean);
      return m.length
        ? `<ul class="clean" style="margin:4px 0 0">${
          m.map(x => '<li>' + esc(x) + '</li>').join('')}</ul>`
        : '<span class="todo">—</span>';
    };
    const miestaSk = zoznamMiest(o.places);
    const miestaDe = zoznamMiest((o.places_de && o.places_de.length)
      ? o.places_de : o.places);
    const bodky = '..........................................................................';
    const nr = o.number != null && o.number !== '' ? String(o.number) : '';
    const titul = nr ? `Objednávka č. ${nr} / Bestellung Nr. ${nr}` : BESTELLUNG_L.title;
    const odkaz = ramcova && (ramcova.number || ramcova.signedAt);

    const body = header(titul, '', [o.internal_number ? `Evidenčné číslo: ${o.internal_number}` : ''].filter(Boolean),
      supplier, 'both') + `
      ${chyba.length ? `<div class="par"><p class="todo">Pred podpisom doplniť /
        Vor Unterzeichnung zu ergänzen: ${esc(chyba.map(c => c.title).join(', '))}.</p></div>` : ''}

      <div class="cols boxed">
        ${stranaSkDe('Zhotoviteľ / Auftragnehmer', nasaSkDe(supplier))}
        ${stranaSkDe('Objednávateľ / Auftraggeber', jehoSkDe(client))}
      </div>

      <div class="par">
        ${odkaz
          ? dvoj(1,
            `V nadväznosti na ustanovenia Rámcovej zmluvy o dielo${ramcova.number
              ? ` č. ${esc(ramcova.number)}` : ''}${ramcova.signedAt
              ? `, uzatvorenej dňa ${date(ramcova.signedAt)}` : ''}, si Objednávateľ
             u Zhotoviteľa objednáva zhotovenie diela podľa nasledujúcej špecifikácie:<br>
             ${o.scope_sk ? '<strong>' + esc(o.scope_sk) + '</strong>'
              : '<span class="todo">Rozsah prác nie je popísaný.</span>'}`,
            `In Anlehnung an die Bestimmungen des am ${ramcova.signedAt ? date(ramcova.signedAt) : '……'}
             abgeschlossenen Rahmenwerkvertrages${ramcova.number ? ` Nr. ${esc(ramcova.number)}` : ''} bestellt der
             Auftraggeber beim Auftragnehmer die Herstellung des Werkes gemäß der folgenden
             Spezifikation:<br>
             ${o.scope_de ? '<strong>' + esc(o.scope_de) + '</strong>'
              : '<span class="todo">Der Arbeitsumfang ist nicht beschrieben.</span>'}`)
          : `<p class="todo">Objednávka sa neodvoláva na rámcovú zmluvu o dielo —
             doplňte dátum jej uzavretia. / Die Bestellung nimmt auf keinen
             Rahmenwerkvertrag Bezug.</p>`}
        ${pocet ? dvoj('', `${esc(BESTELLUNG_L.count[0])}: <strong>${esc(pocet)}</strong>`,
          `${esc(BESTELLUNG_L.count[1])}: <strong>${esc(pocet)}</strong>`) : ''}

        ${dvoj(2, cenaSk, cenaDe)}
        ${riadok(3, BESTELLUNG_L.from, o.date_from
          ? date(o.date_from) : '<span class="todo">—</span>')}
        ${riadok(4, BESTELLUNG_L.to, o.date_to
          ? date(o.date_to) + (o.extendable
            ? ` <span style="color:#6F7A92">(${esc(BESTELLUNG_L.ext[0])} / ${
              esc(BESTELLUNG_L.ext[1])})</span>` : '')
          : '<span class="todo">—</span>')}
        ${dvoj(5,
          `<strong>${esc(BESTELLUNG_L.place[0])}:</strong><br>${miestaSk}`,
          `<strong>${esc(BESTELLUNG_L.place[1])}:</strong><br>${miestaDe}`)}
        ${dvoj(6,
          `<strong>${esc(BESTELLUNG_L.special[0])}:</strong><br>${o.special_sk ? esc(o.special_sk) : bodky}`,
          `<strong>${esc(BESTELLUNG_L.special[1])}:</strong><br>${(o.special_de || o.special_sk) ? esc(o.special_de || o.special_sk) : bodky}`)}
      </div>

      ${miestoPodpisuSkDe(supplier, client, o.signed_at)}
      <div class="sigs">
        <div class="sig"><div class="line">${stamp(supplier)}</div>
          <div class="who">Zhotoviteľ / Auftragnehmer</div></div>
        <div class="sig"><div class="line"></div>
          <div class="who">Objednávateľ / Auftraggeber</div></div>
      </div>
      ${footSigned(supplier, 'both')}`;

    return shell(titul, body, { css: CSS_SKDE });
  }

  const CSS_SKDE = `.skde{font-size:11.5px;line-height:1.55}.skde-l{color:${BRAND.mute}}`;

  // ── RÁMCOVÁ ZMLUVA S NEMECKÝM ODBERATEĽOM ────────────────────────────────
  // Tretí krok. Dvojjazyčne **v dvoch stĺpcoch vedľa seba**, nie slovenský
  // blok a pod ním nemecký: takto je na prvý pohľad vidieť, že obe verzie
  // hovoria to isté — a keď sa jedna zmení a druhá nie, vidieť to tiež.
  //
  // Text je doslovne podľa šablóny „Rahmenvertrag SK_DE" (framework-de.js).
  // Šablóna **nemá číslo zmluvy** — keď ho appka nemá, hlavička je bez čísla.

  function rahmenvertrag({ zmluva, chyba = [] } = {}) {
    if (!zmluva) return shell('Rámcová zmluva o dielo', '<p>Chýbajú údaje.</p>');
    const { supplier = {}, client = {}, clanky = [] } = zmluva;
    const zoznam = (l) => (l && l.length ? `<ul class="clean" style="margin:4px 0 0">${l.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '');

    const body = header('Rámcová zmluva o dielo / Rahmenwerkvertrag', zmluva.number || '',
      ['uzatvorená v súlade s ustanoveniami § 536 a nasl. zákona č. 513/1991 Zb. Obchodný zákonník v platnom znení',
        'abgeschlossen gemäß den Bestimmungen der § 536 ff. des Gesetzes Nr. 513/1991 Slg. Handelsgesetzbuch in der geltenden Fassung'],
      supplier, 'both') + `
      ${chyba.length ? `<div class="par"><p class="todo">Pred podpisom doplniť /
        Vor Unterzeichnung zu ergänzen: ${esc(chyba.map(c => c.title).join(', '))}.</p></div>` : ''}

      <div class="par"><h3><span class="cl">Článok I. / Artikel I.</span>Zmluvné strany / Vertragsparteien</h3></div>
      <div class="cols boxed">
        ${stranaSkDe('Zhotoviteľ / Auftragnehmer', nasaSkDe(supplier))}
        ${stranaSkDe('Objednávateľ / Auftraggeber', jehoSkDe(client))}
      </div>

      ${clanky.map(c => `<div class="par">
        <h3><span class="cl">Článok ${esc(c.rim)} / Artikel ${esc(c.rim)}</span>${esc(c.sk)} / ${esc(c.de)}</h3>
        ${c.body.map((p, i) => `<div class="bil">
          <div class="bil-n">${i + 1}.</div>
          <div class="bil-sk">${esc(p.sk)}${zoznam(p.list_sk)}</div>
          <div class="bil-de">${esc(p.de)}${zoznam(p.list_de)}</div>
        </div>`).join('')}
      </div>`).join('')}

      ${miestoPodpisuSkDe(supplier, client, zmluva.signedAt)}
      <div class="sigs">
        <div class="sig"><div class="line">${stamp(supplier)}</div>
          <div class="who">Zhotoviteľ / Auftragnehmer — ${esc(supplier.name || '')}</div></div>
        <div class="sig"><div class="line"></div>
          <div class="who">Objednávateľ / Auftraggeber — ${esc(client.name || '')}</div></div>
      </div>
      ${footSigned(supplier, 'both')}`;

    return shell('Rámcová zmluva / Rahmenwerkvertrag — ' + (client.name || ''), body, { css: CSS_SKDE });
  }

  // ── RÁMCOVÁ ZMLUVA O DIELO SO ŽIVNOSTNÍKOM ───────────────────────────────
  // Piaty krok reťazca. Text je dáta (`lib/documents/subcontract.js`), tu sa
  // z nich robí papier — aby sa pri zmene pokuty nemuselo hrabať v HTML.

  /**
   * @param {Object} o
   *   zmluva    výstup z `DanubraSubcontract.build()`
   *   chyba     zoznam z `DanubraSubcontract.missing()` — vypíše sa na papier
   */
  function ramcovaZmluva({ zmluva, chyba = [] } = {}) {
    if (!zmluva) return shell('Rámcová zmluva o dielo', '<p>Chýbajú údaje.</p>');
    const { worker = {}, supplier = {}, clanky = [] } = zmluva;

    // Tučné `**takto**` z textu článkov — v zmluve to nesie dôraz, ktorý tam
    // dal právnik, a nemá sa stratiť.
    const tucne = (t) => esc(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Bod článku: text, alebo text s vymenovaním pod sebou (čl. III bod 5
    // odrážky, čl. X bod 6 písmená a) až i) — na ne sa odvoláva ukončovací list).
    const bod = (x) => {
      if (typeof x === 'string') return '<li>' + tucne(x) + '</li>';
      const tag = x.letters ? 'ol' : 'ul';
      return `<li>${tucne(x.text || '')}<${tag} class="par-sub">${(x.list || [])
        .map(i => '<li>' + tucne(i) + '</li>').join('')}</${tag}></li>`;
    };
    const sro = worker.legal_form === 'sro' && worker.company_name;
    const meno = sro ? worker.company_name : (worker.company_name || worker.full_name);
    // Štatutárny orgán: pri živnostníkovi on sám, pri s. r. o. konateľ.
    const statutar = worker.statutory || worker.full_name;

    const body = header('Rámcová zmluva o dielo', zmluva.number,
      ['uzavretá podľa ust. § 536 a nasl. Obchodného zákonníka v platnom znení'], supplier) + `
      ${chyba.length ? `<div class="par"><p class="todo">Pred podpisom doplniť:
        ${esc(chyba.map(c => c.title).join(', '))}.</p></div>` : ''}

      <div class="par"><h3><span class="cl">Článok I.</span>Zmluvné strany</h3></div>
      <div class="cols boxed">
        <div class="col"><div class="lbl">Objednávateľ</div><div class="val">
          <strong>${esc(supplier.name || '—')}</strong><br>
          ${supplier.address ? 'Sídlo: ' + esc(supplier.address) + '<br>' : ''}
          ${supplier.company_id ? 'IČO: ' + esc(supplier.company_id) + '<br>' : ''}
          ${supplier.tax_id ? 'DIČ: ' + esc(supplier.tax_id) + '<br>' : ''}
          ${supplier.register ? 'Zap.: ' + esc(supplier.register) + '<br>' : ''}
          ${supplier.statutory ? 'Štatutárny orgán: ' + esc(supplier.statutory) + '<br>' : ''}
          ${supplier.phone ? 'Tel.: ' + esc(supplier.phone) + '<br>' : ''}
          ${supplier.email ? 'E-mail: ' + esc(supplier.email) : ''}
        </div></div>
        <div class="col"><div class="lbl">Zhotoviteľ</div><div class="val">
          <strong>${esc(meno || '—')}</strong><br>
          ${worker.business_address || worker.address
            ? 'Sídlo: ' + esc(worker.business_address || worker.address) + '<br>' : ''}
          ${worker.company_id ? 'IČO: ' + esc(worker.company_id) + '<br>' : ''}
          ${worker.tax_id ? 'DIČ: ' + esc(worker.tax_id) + '<br>' : ''}
          ${statutar ? 'Štatutárny orgán: ' + esc(statutar) + (sro ? ', konateľ' : '') + '<br>' : ''}
          ${worker.bank_iban ? 'IBAN: ' + esc(worker.bank_iban) + '<br>' : ''}
          ${worker.phone ? 'Tel.: ' + esc(worker.phone) + '<br>' : ''}
          ${worker.email ? 'E-mail: ' + esc(worker.email) : ''}
        </div></div>
      </div>

      ${clanky.map(c => `<div class="par">
        <h3><span class="cl">Článok ${esc(c.rim)}</span>${esc(c.nadpis)}</h3>
        <ol class="par-ol">${c.body.map(bod).join('')}</ol>
      </div>`).join('')}

      <div class="par"><p>${esc(mestoZAdresy(supplier) || '…')}, dňa ${
        esc(date(zmluva.signedAt))}</p></div>
      <div class="sigs">
        <div class="sig"><div class="line">${stamp(supplier)}</div>
          <div class="who">Objednávateľ — ${esc(supplier.name || '')}</div></div>
        <div class="sig"><div class="line"></div>
          <div class="who">Zhotoviteľ — ${esc(sro
            ? `${worker.company_name}, ${worker.full_name || ''}` : (worker.full_name || ''))}</div></div>
      </div>
      ${footSigned(supplier)}`;

    return shell('Rámcová zmluva o dielo — ' + (worker.full_name || ''), body);
  }

  // ── UKONČENIE ZMLUVY O DIELO A OBJEDNÁVKY ────────────────────────────────
  /**
   * List živnostníkovi — podľa šablóny „Ukončenie Zmluvy o Dielo, Objednávky"
   * (Google Drive): „k dnešnému dňu ukončujeme vašu Rámcovú zmluvu o dielo
   * 2026-007 aj Objednávku č. 1, na základe Článku X, bod 6g."
   *
   * Dôvod je písmeno z čl. X bod 6 rámcovej zmluvy (a) až i),
   * DanubraSubcontract.DOVODY) — predvolene g) „nemá dostatok práce".
   * Pod vetou zo šablóny je citované aj samotné znenie dôvodu, aby živnostník
   * nemusel hľadať zmluvu.
   *
   * @param {Object} o
   *   worker     živnostník (meno, adresa — adresát)
   *   supplier   naša firma (Nastavenia) — podpis a hlavička
   *   zmluva     { number } — číslo jeho rámcovej zmluvy
   *   objednavky čísla jeho objednávok (č. N), ktoré sa ukončujú
   *   dovod      písmeno a až i (predvolene g)
   *   datum      deň ukončenia (predvolene dnes)
   *   dnes       dnešný deň (kvôli testom)
   */
  function ukoncenie({ worker = {}, supplier = {}, zmluva = {}, objednavky = [], dovod = 'g', datum, dnes } = {}) {
    const SC = (typeof module !== 'undefined' && module.exports)
      ? require('./subcontract') : (typeof window !== 'undefined' && window.DanubraSubcontract);
    const DOV = (SC && SC.DOVODY) || [];
    const bod = (SC && SC.BOD_ODSTUPENIE) || 6;
    const p = String(dovod || 'g').trim().toLowerCase().slice(0, 1);
    const d = DOV.find(x => x.p === p);
    const today = String(dnes || new Date().toISOString()).slice(0, 10);
    const den = String(datum || today).slice(0, 10);
    const kedy = den === today ? 'k dnešnému dňu' : `ku dňu ${date(den)}`;
    const cZmluvy = String((zmluva && zmluva.number) || '').trim();
    const obj = (objednavky || []).map(x => String(x).trim()).filter(Boolean);
    const objText = obj.length === 1 ? ` aj Objednávku č. ${obj[0]}`
      : obj.length > 1 ? ` aj Objednávky č. ${obj.join(', č. ')}` : '';
    const veta = `${kedy} ukončujeme vašu Rámcovú zmluvu o dielo${cZmluvy ? ` ${cZmluvy}` : ''}${objText},`;
    const body = [
      'Dobrý deň,',
      `${veta}\nna základe Článku X, bod ${bod}${p}.`,
      d ? `Článok X, bod ${bod}, písm. ${p}): „${d.text}"` : '',
    ].filter(Boolean).join('\n\n');
    const adresa = [worker.company_name && worker.legal_form === 'sro' ? worker.company_name : (worker.full_name || ''),
      worker.business_address || worker.address || ''].filter(Boolean).join('\n');
    const html = letter({ supplier, to: adresa, date: today, subject: 'Ukončenie Zmluvy o dielo, Objednávky',
      body, closing: 's pozdravom', signer: supplier.name || '', role: '' });
    const chyba = [!cZmluvy && 'číslo rámcovej zmluvy', !d && 'dôvod (písmeno a až i)'].filter(Boolean);
    return chyba.length
      ? html.replace('<div class="letter-body">', `<p class="todo">Doplňte: ${esc(chyba.join(', '))}.</p><div class="letter-body">`)
      : html;
  }

  // ── STAVBY — ZOZNAM MIEST VÝKONU ─────────────────────────────────────────
  /**
   * „Stavby" (šablóna „X-X-X Stavby X-X-X" na Drive): dátum aktualizácie,
   * adresy stavieb s remeslom („/maliari/"), adresa v SR a dva riadky
   * „celé územie Nemeckej / Slovenskej republiky". Živnostník ho dostane
   * pri nástupe spolu so zmluvou a objednávkou; tie isté riadky sú v bloku
   * „Miesto vykonania činností" jeho objednávky (podklad aj k A1).
   *
   * @param {Object} o
   *   worker   pre koho (meno do hlavičky)
   *   miesta   riadky z DanubraSubcontract.miesta({ …, tagy: true })
   *   datum    dátum aktualizácie (predvolene dnes)
   */
  function stavby({ worker = {}, supplier = {}, miesta = [], datum } = {}) {
    const den = String(datum || new Date().toISOString()).slice(0, 10);
    const aktual = /^\d{4}-\d{2}-\d{2}$/.test(den) ? `${den.slice(8, 10)}.${den.slice(5, 7)}.${den.slice(2, 4)}` : den;
    const riadky = (miesta || []).filter(Boolean);
    const body = `
      ${header('Stavby', '', [`Aktualizácia: ${aktual}`, worker.full_name ? `Pre: ${worker.full_name}` : ''].filter(Boolean), supplier)}
      <p style="margin:0 0 8px;color:${BRAND.sub}">Miesta vykonania činností podľa objednávky.</p>
      ${riadky.length ? `<ul class="clean st-list">${riadky.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
        : '<p class="todo">Zatiaľ žiadna stavba — živnostník nie je nasadený.</p>'}
      ${foot(supplier)}`;
    return shell(`Stavby — ${worker.full_name || 'zoznam miest'}`, body,
      { css: '.st-list{font-size:13.5px;line-height:1.7}.st-list li{margin:3px 0}' });
  }

  // ── ZOZNAM ČINNOSTÍ DO OBJEDNÁVKY ────────────────────────────────────────
  /**
   * „Zoznam činností do Objednávky - Platný od 26.04.2026" (Google Drive).
   * Na objednávku živnostníkovi ide práve jedna činnosť, ktorú má v živnosti;
   * ten istý text píše na faktúru.
   *
   * @param {Object} o  { cinnosti: [{ text, remesla }], platnyOd: 'YYYY-MM-DD' }
   */
  function zoznamCinnosti({ supplier = {}, cinnosti = [], platnyOd = '' } = {}) {
    const od = String(platnyOd || '').slice(0, 10);
    const odText = /^\d{4}-\d{2}-\d{2}$/.test(od) ? `${od.slice(8, 10)}.${od.slice(5, 7)}.${od.slice(0, 4)}` : od;
    const body = `
      ${header('Zoznam činností do Objednávky', '', [odText ? `Platný od ${odText}` : ''].filter(Boolean), supplier)}
      <ol class="zc">${(cinnosti || []).map(c => `<li><strong>${esc(c.text)}</strong>${
        c.remesla && c.remesla.length ? `<div>/${esc(c.remesla.join(', '))}/</div>` : ''}</li>`).join('')}</ol>
      <p style="color:${BRAND.sub};font-size:12px">Na objednávku sa vyberá jedna činnosť, ktorá zodpovedá živnostenskému
        oprávneniu zhotoviteľa. Ten istý text uvádza zhotoviteľ na faktúre ako položku.</p>
      ${foot(supplier)}`;
    return shell('Zoznam činností do Objednávky', body,
      { css: `.zc{font-size:13.5px;line-height:1.6;padding-left:22px}.zc li{margin:0 0 10px}.zc div{color:${BRAND.sub};font-size:12.5px}` });
  }

  // ── SÚHLAS SO SPRACOVANÍM OSOBNÝCH ÚDAJOV ────────────────────────────────
  // Štvrtý krok v reťazci. Držíme meno živnostníka, jeho doklad totožnosti,
  // A1, živnostenský list, telefón aj číslo účtu — a posielame ich nemeckému
  // odberateľovi, na stavbu a úradom. Bez jeho súhlasu na to nemáme právo.
  //
  // Text je podľa vzoru, ktorý firma používa. Údaje prevádzkovateľa sa ťahajú
  // z Nastavení: na papieri, ktorý podpisuje človek, nesmie byť nič zapečené
  // v kóde — pri zmene sídla by to nikto nenašiel.

  /** Na čo presne sa súhlas dáva. Je to zoznam, nie veta — má sa dať prečítať. */
  const GDPR_UCEL = [
    'Uzavretie obchodnej dokumentácie (zmluva o dielo, objednávky)',
    'Vybavovanie formulárov A1',
    'Vybavovanie administratívnych úkonov vo vzťahu k inštitúciám v Slovenskej '
      + 'republike a v Nemecku',
    'Príprava a podanie dokumentov príslušným orgánom',
    'Komunikácia s orgánmi verejnej moci, sociálneho a zdravotného zabezpečenia '
      + 'a daňovými orgánmi',
    'Vedenie evidencie zmluvných vzťahov',
    'Iné súvisiace činnosti objednané dotknutou osobou',
  ];

  const GDPR_PRIJEMCOVIA = [
    'Orgánom verejnej moci v Slovenskej republike a v Nemecku',
    'Inštitúciám sociálneho a zdravotného zabezpečenia',
    'Daňovým orgánom',
    'Odberateľovi, na ktorého stavbe sa dielo vykonáva — v rozsahu nutnom na '
      + 'vstup na stavbu a na kontrolu podľa nemeckých predpisov',
    'Zmluvným partnerom prevádzkovateľa (napríklad účtovník, právne služby)',
    'Iným oprávneným subjektom, ak to vyžaduje právny predpis',
  ];

  const GDPR_PRAVA = [
    'Právo na informácie a prístup k osobným údajom',
    'Právo na opravu a na vymazanie osobných údajov',
    'Právo na obmedzenie spracúvania',
    'Právo na oznámenie opravy, vymazania alebo obmedzenia spracúvania',
    'Právo na prenosnosť údajov',
    'Právo namietať a právo nebyť predmetom automatizovaného rozhodovania '
      + 'vrátane profilovania',
    'Právo podať sťažnosť na Úrad na ochranu osobných údajov Slovenskej republiky',
  ];

  /**
   * @param {Object} o
   *   worker    živnostník — meno, adresa, dátum narodenia, IČO
   *   supplier  fakturačné údaje z Nastavení
   *   place     kde sa podpisuje (predvolene sídlo prevádzkovateľa)
   */
  function gdprConsent({ worker = {}, supplier = {}, place = '' } = {}) {
    // Mesto z adresy, bez PSČ: „V 940 71 Nové Zámky" nie je veta, akú by
    // niekto napísal rukou.
    const mesto = place || mestoZAdresy(supplier);
    const zoznam = (items) => '<ul class="clean">'
      + items.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';

    const body = header('Súhlas so spracovaním osobných údajov', '', [], supplier) + `
      <div class="par"><p>V zmysle zákona č. 18/2018 Z. z. o ochrane osobných údajov
        a Nariadenia Európskeho parlamentu a Rady (EÚ) 2016/679 z 27. apríla 2016
        o ochrane fyzických osôb pri spracúvaní osobných údajov a o voľnom pohybe
        takýchto údajov (GDPR).</p></div>

      <div class="cols boxed">
        <div class="col"><div class="lbl">Prevádzkovateľ</div><div class="val">
          <strong>${esc(supplier.name || '—')}</strong><br>
          ${supplier.address ? esc(supplier.address) + '<br>' : ''}
          ${supplier.company_id ? 'IČO: ' + esc(supplier.company_id) + '<br>' : ''}
          ${supplier.tax_id ? 'DIČ: ' + esc(supplier.tax_id) + '<br>' : ''}
          ${supplier.register ? esc(supplier.register) : ''}
        </div></div>
        <div class="col"><div class="lbl">Dotknutá osoba</div><div class="val">
          <strong>${esc(worker.full_name || '—')}</strong><br>
          ${worker.birth_date ? 'dátum narodenia: ' + date(worker.birth_date) + '<br>' : ''}
          ${worker.address ? esc(worker.address) + '<br>' : ''}
          ${worker.city ? esc(worker.city) + '<br>' : ''}
          ${worker.company_id ? 'IČO: ' + esc(worker.company_id) : ''}
        </div></div>
      </div>

      <div class="par"><h3>Vyhlásenie o udelení súhlasu</h3>
        <p>Dotknutá osoba týmto udeľuje prevádzkovateľovi výslovný, slobodný,
          konkrétny a informovaný súhlas so spracovaním svojich osobných údajov
          na účely uvedené nižšie.</p></div>

      <div class="par"><h3>Rozsah spracúvaných osobných údajov</h3>
        <p>Meno a priezvisko, dátum narodenia alebo rodné číslo, bydlisko, štátna
          príslušnosť, doklad totožnosti, údaje o živnostenskom oprávnení, číslo
          bankového účtu, kontaktné údaje a ďalšie údaje potrebné na splnenie
          objednaných služieb.</p></div>

      <div class="par"><h3>Účel spracúvania</h3>
        ${zoznam(GDPR_UCEL)}</div>

      <div class="par"><h3>Príjemcovia osobných údajov</h3>
        ${zoznam(GDPR_PRIJEMCOVIA)}</div>

      <div class="par"><h3>Prenos do zahraničia</h3>
        <p>Osobné údaje môžu byť prenášané v rámci Európskej únie, najmä do
          Spolkovej republiky Nemecko, za účelom vybavenia administratívnych
          úkonov a plnenia povinností na stavbe.</p></div>

      <div class="par"><h3>Doba uchovávania</h3>
        <p>Po dobu nevyhnutnú na splnenie účelu spracúvania, najmenej po dobu
          trvania zmluvného vzťahu, a následne po dobu vyžadovanú právnymi
          predpismi alebo do odvolania súhlasu.</p></div>

      <div class="par"><h3>Práva dotknutej osoby</h3>
        ${zoznam(GDPR_PRAVA)}</div>

      <div class="par"><h3>Odvolanie súhlasu</h3>
        <p>Súhlas je možné kedykoľvek odvolať, a to písomne na adrese sídla
          prevádzkovateľa alebo e-mailom${supplier.email ? ' na ' + esc(supplier.email) : ''}.
          Odvolanie súhlasu nemá vplyv na zákonnosť spracúvania pred jeho
          odvolaním ani na spracúvanie, ktoré prevádzkovateľovi ukladá zákon.</p></div>

      <div class="par"><p>V ${esc(mesto || '…')}, dňa ${date(new Date().toISOString())}</p></div>
      <div class="sigs">
        <div class="sig"><div class="line">${stamp(supplier)}</div>
          <div class="who">${esc(supplier.name || 'Prevádzkovateľ')}</div></div>
        <div class="sig"><div class="line"></div>
          <div class="who">${esc(worker.full_name || 'Dotknutá osoba')}</div></div>
      </div>
      ${footSigned(supplier)}`;

    return shell('Súhlas GDPR — ' + (worker.full_name || ''), body);
  }

  function handover({ order, client, data, supplier }) {
    const d = data || {};
    const code = (l, v) => v ? `<div class="code"><div class="lbl">${esc(l)}</div><div class="v">${esc(v)}</div></div>` : '';
    const maps = (d.lat && d.lng) ? `https://maps.google.com/?q=${d.lat},${d.lng}`
      : d.address ? `https://maps.google.com/?q=${encodeURIComponent(d.address + ', ' + (d.city || ''))}` : null;
    const body = `
      ${header('Pokyny na ubytovanie', order.order_number, [], supplier)}
      ${parties(supplier, client)}
      <div class="lbl">Adresa</div>
      <div class="val" style="font-size:15px;font-weight:700;margin-bottom:6px">
        ${esc(d.address || '—')}${d.city ? ', ' + esc(d.city) : ''}${d.postal_code ? ' ' + esc(d.postal_code) : ''}
      </div>
      ${maps ? `<div style="font-size:12px;margin-bottom:10px"><a href="${maps}">Otvoriť v mapách</a></div>` : ''}
      <div class="codes">
        ${code('Kód dverí', d.access_door_code)}
        ${code('Kód brány', d.gate_code)}
        ${code('WiFi sieť', d.wifi_ssid)}
        ${code('WiFi heslo', d.wifi_password)}
        ${code('Izba', d.room_number)}
        ${code('Poschodie', d.floor)}
      </div>
      <table><tbody>
        <tr><td>Termín</td><td class="r">${date(order.date_from)} – ${date(order.date_to)}</td></tr>
        <tr><td>Počet osôb</td><td class="r">${esc(order.persons)}</td></tr>
        ${d.owner_name || d.owner_phone ? `<tr><td>Kontakt na mieste</td><td class="r">${esc(d.owner_name || '')} ${esc(d.owner_phone || '')}</td></tr>` : ''}
        ${d.access_key_location ? `<tr><td>Kľúče</td><td class="r">${esc(d.access_key_location)}</td></tr>` : ''}
        ${d.checkin_info ? `<tr><td>Príchod</td><td class="r">${esc(d.checkin_info)}</td></tr>` : ''}
        ${d.checkout_info ? `<tr><td>Odchod</td><td class="r">${esc(d.checkout_info)}</td></tr>` : ''}
        ${d.deposit_amount ? `<tr><td>Kaucia</td><td class="r">${money(d.deposit_amount)}</td></tr>` : ''}
      </tbody></table>
      ${d.house_rules ? `<div class="note"><strong>Pravidlá ubytovania.</strong><br>${esc(d.house_rules)}</div>` : ''}
      <div class="note">V prípade akéhokoľvek problému s ubytovaním kontaktujte najprv nás —
      riešime to priamo s majiteľom.</div>
      ${foot(supplier)}`;
    return shell(`Pokyny ${order.order_number || ''}`, body);
  }

  // ── HLAVIČKOVÝ LIST (návrh 2a) ───────────────────────────────────────────
  /**
   * List na hlavičkovom papieri: ponuka, sprievodný list, výzva… Hlavička so
   * značkou a kontaktmi, adresát, miesto a dátum, vec, text, podpis; päta
   * s údajmi firmy a oranžový pruh ako na ostatných dokumentoch.
   *
   * @param {Object} o { supplier, to (viac riadkov), place, date, subject, body, closing, signer, role, lang }
   */
  function letter({ supplier = {}, to = '', place = '', date: d = null, subject = '', body = '', closing = '', signer = '', role = '', lang = 'sk' } = {}) {
    const de = lang === 'de';
    const b = brandOf(supplier);
    const web = webOf(supplier);
    const L = de ? { to: 'Empfänger', subj: 'Betreff', close: 'Mit freundlichen Grüßen' } : { to: 'Adresát', subj: 'Vec', close: 'S pozdravom' };
    const riadky = String(to || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const odst = String(body || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const miesto = place || mestoZAdresy(supplier);
    const body2 = `
      <div class="head letter-head">
        <div class="brand">${brandHtml(b, b.name ? `<div><div class="brand-name">${esc(b.name)}</div></div>` : '')}</div>
        <div class="doc-title">${supplier.phone ? `<div class="meta">${esc(supplier.phone)}</div>` : ''}${supplier.email ? `<div class="meta">${esc(supplier.email)}</div>` : ''}
          ${web ? `<div class="meta" style="color:${BRAND.orange};font-weight:600;">${esc(web)}</div>` : ''}</div>
      </div>
      <div class="letter-addr">
        <div>${riadky.length ? `<div class="lbl">${esc(L.to)}</div><div class="val">${riadky.map((x, i) => (i === 0 ? `<strong>${esc(x)}</strong>` : esc(x))).join('<br>')}</div>` : ''}</div>
        <div class="letter-date">${miesto ? `<div class="lbl">${esc(miesto.toUpperCase())}</div>` : ''}<div class="val">${esc(date(d || new Date().toISOString()))}</div></div>
      </div>
      ${subject ? `<h1 class="letter-subj">${esc(L.subj)}: ${esc(subject)}</h1>` : '<h1 class="letter-subj sr">&nbsp;</h1>'}
      <div class="letter-body">${odst.map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>
      <div class="letter-sig"><p>${esc(closing || L.close)}</p>
        ${stamp(supplier) ? `<div class="letter-stamp">${stamp(supplier, 'st')}</div>` : '<div style="height:34px"></div>'}
        ${signer ? `<strong>${esc(signer)}</strong>` : ''}${role ? `<span>${esc(role)}</span>` : ''}</div>
      ${runFoot(supplier, de ? 'de' : 'sk')}`;
    return shell(`${de ? 'Brief' : 'List'}${subject ? ` – ${subject}` : ''}`, body2, { lang: de ? 'de' : 'sk' });
  }

  // ── STUNDENNACHWEIS (týždenný list na hodiny, na šírku) ───────────────────
  // „Toto im musíme posielať prázdne aj s infolistami… píšu si hodiny
  // a majster ich podpíše… na základe toho fakturujeme."
  //
  // Prázdny list ide ľuďom na stavbu; vyplnený (`filled`) je čistý prepis
  // podpísaného papiera pre odberateľa. Stĺpce Po–So ako na pôvodnom
  // papieri, nedeľa len keď sa v nej robilo. Veľké políčka na písanie
  // rukou, tenké čiary — vytlačí sa dobre aj čiernobielo.
  //
  // Veta pod tabuľkou je tá istá ako na obrazovke výkazu
  // (js/modules/hoursheet.js, LEGAL) — opravené znenie pôvodnej predlohy.
  const STUNDEN_LEGAL = 'Mit der Unterschrift auf diesem Stundennachweis bestätigt der Kunde die '
    + 'Richtigkeit der angegebenen geleisteten Stunden und die mängelfreie Ausführung der Arbeiten.';

  const CSS_HN = `
    .hn-top{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:14px}
    .hn-top .brand{flex:0 0 auto}
    .hn-title{flex:1 1 auto;min-width:0;padding-left:18px;border-left:3px solid ${BRAND.orange}}
    .hn-title h1{margin:0;font-size:27px;font-weight:700;letter-spacing:-.03em;line-height:1.05}
    .hn-title .meta{font-size:10.5px;color:${BRAND.mute};margin-top:3px}
    .hn-kw{flex:0 0 auto;display:flex;align-items:baseline;gap:8px;border:1.5px solid ${BRAND.navy};border-radius:8px;padding:7px 14px;min-width:210px}
    .hn-kw .lbl{margin:0}
    .hn-kw b{font-family:Outfit,Arial,sans-serif;font-size:24px;line-height:1;font-weight:700;min-width:44px;display:inline-block;
      border-bottom:1px solid ${BRAND.lbl};text-align:center}
    .hn-kw .y{font-size:13px;color:${BRAND.sub};font-weight:600}
    .hn-kw small{font-size:10px;color:${BRAND.mute};margin-left:auto;white-space:nowrap}
    .hn-band{display:flex;gap:28px;margin-bottom:12px;align-items:flex-end}
    .hn-fields{flex:1.35;display:grid;grid-template-columns:1.2fr 1fr .9fr;gap:0 20px;align-items:end}
    .hn-sign{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:0 20px;align-items:end}
    .hn-f{min-width:0}
    .hn-f .v{min-height:30px;border-bottom:1px solid ${BRAND.navy};font-size:12.5px;font-weight:600;line-height:1.25;
      padding:4px 2px 3px;display:flex;align-items:flex-end;overflow-wrap:anywhere}
    .hn-f .v.tall{min-height:40px}
    .hn-f .v i{font-weight:500;font-style:italic;color:${BRAND.sub};font-size:10.5px}
    .hn-f .lbl{margin:4px 0 0}
    table.hn{width:100%;border-collapse:collapse;margin:0;table-layout:fixed;border:1.5px solid ${BRAND.navy}}
    table.hn th,table.hn td{border:1px solid ${BRAND.lbl};padding:0 8px;vertical-align:middle;background:none}
    table.hn thead th{background:${BRAND.soft};color:${BRAND.navy};font-size:10px;letter-spacing:.08em;text-transform:uppercase;
      font-weight:700;text-align:center;height:30px;border-bottom:1.5px solid ${BRAND.navy}}
    table.hn .hn-n{width:205px;text-align:left}
    table.hn .hn-s{width:96px;text-align:center;border-left:1.5px solid ${BRAND.navy}}
    table.hn tbody th{text-align:left;font-size:10.5px;font-weight:600;color:${BRAND.sub};text-transform:none;letter-spacing:0;background:none}
    table.hn tr.hn-m td,table.hn tr.hn-m th{height:var(--hn-mh,28px)}
    table.hn tr.hn-m td{text-align:center;font-size:11.5px;color:${BRAND.navy};font-variant-numeric:tabular-nums}
    table.hn tr.hn-m.last td,table.hn tr.hn-m.last th{border-bottom:1.5px solid ${BRAND.navy}}
    table.hn tr.hn-p td,table.hn tr.hn-p th{height:var(--hn-ph,40px)}
    table.hn tr.hn-p td{text-align:center;font-family:Outfit,Arial,sans-serif;font-size:16px;font-weight:600;font-variant-numeric:tabular-nums}
    table.hn tr.hn-p td.hn-n{font-family:'Hanken Grotesk',Arial,sans-serif;font-size:12.5px;font-weight:600;text-align:left;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    table.hn tr.hn-p td.hn-n .no{color:${BRAND.lbl};font-weight:600;font-size:9.5px;margin-right:8px}
    table.hn tfoot td,table.hn tfoot th{height:34px;border-top:1.5px solid ${BRAND.navy};background:${BRAND.soft}}
    table.hn tfoot th{text-align:left;font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:${BRAND.navy}}
    table.hn tfoot td{text-align:center;font-family:Outfit,Arial,sans-serif;font-size:15px;font-weight:700}
    table.hn tfoot td.hn-s{font-size:18px}
    .hn-dash{color:${BRAND.lbl};font-weight:400}
    .hn-unit{float:right;color:${BRAND.lbl};font-size:9px;font-weight:500;letter-spacing:.06em}
    .hn-bottom{display:flex;gap:24px;justify-content:space-between;align-items:flex-start;margin-top:9px}
    .hn-legal{font-size:10px;line-height:1.5;color:${BRAND.sub};max-width:620px}
    .hn-hint{font-size:9.5px;line-height:1.5;color:${BRAND.mute};text-align:right}
    .hn-copy{font-size:9.5px;color:${BRAND.mute};text-align:right}
    @media (max-width:640px){body:not(.pdf-mode) .hn-top,body:not(.pdf-mode) .hn-band{flex-direction:column;align-items:stretch}
      body:not(.pdf-mode) .hn-fields{grid-template-columns:1fr}body:not(.pdf-mode) .page{overflow-x:auto}
      body:not(.pdf-mode) table.hn{min-width:820px}}
  `;

  /** Minúty → hodiny na nemeckom doklade: 600 → „10", 615 → „10,25". */
  function hnHours(min) {
    if (min == null) return '?';
    const v = Math.round(Number(min) || 0);
    if (!v) return '';
    const c = Math.round(v * 5 / 3);
    const s = `${Math.floor(c / 100)},${String(c % 100).padStart(2, '0')}`;
    return s.replace(/,00$/, '').replace(/(,\d)0$/, '$1');
  }
  const hnDate = (s, short) => {
    if (!s) return '';
    const [y, m, d] = String(s).slice(0, 10).split('-');
    return short ? `${d}.${m}.` : `${d}.${m}.${y}`;
  };

  /**
   * Týždenný Stundennachweis na šírku A4, po nemecky.
   *
   * @param {Object} o
   *   supplier     naša firma (Nastavenia) — značka a päta
   *   subcontract  zákazka: title, contract_number, site_name, site_address, site_city
   *   partner      odberateľ (Kunde): name
   *   week         { year, week } (ISO) alebo null — prázdne KW a dátumy
   *   workers      [{ id?, full_name }] mená do riadkov (zvyšok sú prázdne riadky)
   *   rows         koľko riadkov s menami najmenej (predvolene 6)
   *   filled       null = prázdny list; inak list z DanubraHourScan.normalize
   *                (+ matchWorkers) — vypíšu sa hodiny, časy a súčty
   *   signed       true | { name } — podpísané (pri `filled` sa berie aj filled.signed)
   */
  function stundennachweis({ supplier = {}, subcontract = null, partner = null, week = null,
    workers = [], rows = 6, filled = null, signed = null } = {}) {
    const HS = (typeof module !== 'undefined' && module.exports)
      ? require('../staffing/hoursheet') : window.DanubraHourSheet;
    const sub = subcontract || {};
    const f = filled && typeof filled === 'object' ? filled : null;
    const wk = week && week.year && week.week ? week
      : (f && f.year && f.week ? { year: f.year, week: f.week } : null);
    const base = wk ? HS.weekDates(wk.year, wk.week) : HS.DAYS.map(([key, de]) => ({ key, de, date: null }));
    // Nedeľa len vtedy, keď je vo vyplnenom liste.
    const fDays = new Map(((f && f.days) || []).map((d) => [d.weekday, d]));
    const showSun = !!(f && (fDays.has(7) || (f.rows || []).some((r) => (r.per_day || []).some((c) => c.weekday === 7 && c.minutes))));
    const days = base.map((d, i) => ({ weekday: i + 1, de: d.de, date: d.date || (fDays.get(i + 1) || {}).date || null }));
    if (showSun) {
      const sat = days[5].date;
      const t = sat ? new Date(`${sat}T00:00:00Z`) : null;
      if (t) t.setUTCDate(t.getUTCDate() + 1);
      days.push({ weekday: 7, de: 'Sonntag', date: t ? t.toISOString().slice(0, 10) : ((fDays.get(7) || {}).date || null) });
    }

    // Riadky s menami: vyplnený list → jeho riadky; inak ľudia zo zákazky.
    const nameOf = (r) => {
      const w = r.worker_id && (workers || []).find((x) => x && x.id === r.worker_id);
      return (w && w.full_name) || r.name || r.name_raw || '';
    };
    const people = f ? (f.rows || []).map((r) => ({ name: nameOf(r), cells: new Map((r.per_day || []).map((c) => [c.weekday, c.minutes])) }))
      : (workers || []).map((w) => ({ name: String((w && w.full_name) || w || '').trim(), cells: null })).filter((p) => p.name);
    // Čistý prepis má len riadky z papiera; prázdny list aspoň `rows` riadkov na písanie.
    const n = f ? Math.max(people.length, 1) : Math.max(Number(rows) || 0, people.length, 1);
    while (people.length < n) people.push({ name: '', cells: null });
    // Riadky sa zmestia na jednu stranu: čím viac mien, tým nižšie (ale stále sa do nich dá písať).
    const ph = Math.max(26, Math.min(46, Math.floor(312 / n)));

    // Hlavička: projekt, stavba, odberateľ.
    // Číslo zákazky sa nezlomí uprostred („ZAK-2026-" / „0003").
    const cislo = sub.contract_number
      ? `<span style="white-space:nowrap">${sub.title ? `(${esc(sub.contract_number)})` : esc(sub.contract_number)}</span>` : '';
    const projekt = sub.title || cislo
      ? [sub.title ? esc(sub.title) : '', cislo].filter(Boolean).join(' ')
      : esc((f && f.project) || '');
    const baustelle = [sub.site_name, sub.site_address, sub.site_city].filter(Boolean).join(', ') || (f && f.site) || '';
    const kunde = (partner && partner.name) || (f && f.customer) || '';
    const sig = signed != null ? signed : (f ? f.signed : null);
    const signer = (sig && typeof sig === 'object' && sig.name) || (f && f.signer_name) || '';
    const b = brandOf(supplier);
    const field = (label, v, cls = '') => `<div class="hn-f"><div class="v ${cls}"><span>${v}</span></div><div class="lbl">${esc(label)}</div></div>`;

    // Deň bez práce je na prepise pomlčka (na papieri „/"), nie prázdne miesto.
    const cell = (p, d) => {
      if (!p.cells) return '';
      const m = p.cells.has(d.weekday) ? p.cells.get(d.weekday) : 0;
      return m === 0 ? '<span class="hn-dash">–</span>' : esc(hnHours(m));
    };
    const rowSum = (p) => (p.cells ? [...p.cells.values()].reduce((a, m) => a + (Number(m) || 0), 0) : 0);
    const daySum = (d) => people.reduce((a, p) => a + (p.cells ? Number(p.cells.get(d.weekday)) || 0 : 0), 0);
    const grand = people.reduce((a, p) => a + rowSum(p), 0);

    const span = (d) => {
      const x = fDays.get(d.weekday);
      if (f && x && (x.from || x.to)) return `${esc(x.from || '…')} – ${esc(x.to || '…')}`;
      return f ? '' : '<span class="hn-dash">–</span>';
    };
    const pause = (d) => {
      const x = fDays.get(d.weekday);
      if (f && x && x.pause_min != null) return x.pause_min ? `${esc(x.pause_min)} min` : '<span class="hn-dash">–</span>';
      return f ? '' : '<span class="hn-unit">MIN</span>';
    };

    const body = `
      <div class="hn-top">
        <div class="brand">${brandHtml(b, b.name ? `<div><div class="brand-name">${esc(b.name)}</div></div>` : '')}</div>
        <div class="hn-title"><h1>Stundennachweis</h1>
          <div class="meta">${esc(supplier.name || '')}${f ? ` · Abschrift${sig ? ' des vom Kunden unterschriebenen Originals' : ''}` : ''}</div></div>
        <div class="hn-kw"><span class="lbl">KW</span><b>${wk ? esc(wk.week) : '&nbsp;'}</b>${wk ? `<span class="y">${esc(wk.year)}</span>` : '<span class="y">/ 20&nbsp;&nbsp;&nbsp;&nbsp;</span>'}
          ${wk ? `<small>${esc(hnDate(days[0].date, true))} – ${esc(hnDate(days[days.length - 1].date))}</small>` : ''}</div>
      </div>

      <div class="hn-band">
        <div class="hn-fields">
          ${field('Projekt', projekt)}
          ${field('Baustelle', esc(baustelle))}
          ${field('Kunde', esc(kunde))}
        </div>
        <div class="hn-sign">
          ${field('Name in Druckbuchstaben', esc(signer), 'tall')}
          ${field('Unterschrift des Kunden', f && sig ? '<i>im Original unterschrieben</i>' : '', 'tall')}
        </div>
      </div>

      <table class="hn" style="--hn-ph:${ph}px">
        <thead><tr><th class="hn-n"></th>${days.map((d) => `<th>${esc(d.de)}</th>`).join('')}<th class="hn-s">Insgesamt</th></tr></thead>
        <tbody>
          <tr class="hn-m"><th class="hn-n">Datum</th>${days.map((d) => `<td>${esc(hnDate(d.date))}</td>`).join('')}<td class="hn-s"></td></tr>
          <tr class="hn-m" style="--hn-mh:34px"><th class="hn-n">Stunden (von – bis)</th>${days.map((d) => `<td>${span(d)}</td>`).join('')}<td class="hn-s"></td></tr>
          <tr class="hn-m last"><th class="hn-n">Pause</th>${days.map((d) => `<td>${pause(d)}</td>`).join('')}<td class="hn-s"></td></tr>
          ${people.map((p, i) => `<tr class="hn-p"><td class="hn-n"><span class="no">${i + 1}</span>${esc(p.name)}</td>
            ${days.map((d) => `<td>${cell(p, d)}</td>`).join('')}
            <td class="hn-s">${p.cells ? esc(hnHours(rowSum(p))) : ''}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr><th class="hn-n">Gesamt</th>${days.map((d) => `<td>${!f ? '' : daySum(d) ? esc(hnHours(daySum(d))) : '<span class="hn-dash">–</span>'}</td>`).join('')}
          <td class="hn-s">${f ? esc(hnHours(grand)) : ''}</td></tr></tfoot>
      </table>

      <div class="hn-bottom">
        <div class="hn-legal">${esc(STUNDEN_LEGAL)}</div>
        ${f ? `<div class="hn-copy">Stunden in Dezimalstunden (10,25 = 10 Std. 15 Min.)</div>`
          : `<div class="hn-hint">Bitte täglich ausfüllen · Stunden als Zahl, z. B. 9 oder 9,5<br>arbeitsfreier Tag: /</div>`}
      </div>
      ${runFoot(supplier, 'de')}`;

    const title = `Stundennachweis${wk ? ` KW ${wk.week}/${wk.year}` : ''}${sub.title ? ` – ${sub.title}` : ''}`;
    return shell(title, body, { lang: 'de', orient: 'landscape', css: CSS_HN });
  }

  // ── Skrátené textové verzie pre SMS/WhatsApp (§8) ─────────────────────────
  // Meno odosielateľa je z Nastavení. Príjemca musí vedieť, kto mu píše —
  // ale to meno patrí do nastavení firmy, nie do kódu.
  const who = (supplier) => (supplier && supplier.name ? noDia(supplier.name) + ': ' : '');

  const short = {
    payment_request({ order, supplier, amount, dueDate, url }) {
      return noDia(`${who(supplier)}objednavka ${order.order_number}. Na uhradu ${money(amount)}, `
        + `IBAN ${supplier?.iban || ''}, VS ${String(order.order_number || '').replace(/\D/g, '')}, `
        + `splatnost ${date(dueDate)}. Po uhrade posielame adresu.${url ? ' Detail: ' + url : ''}`);
    },
    handover({ order, data, supplier, url }) {
      const d = data || {};
      return noDia(`${who(supplier)}${order.order_number}: ${d.address || ''}${d.city ? ', ' + d.city : ''}. `
        + `${d.access_door_code ? 'Kod dveri ' + d.access_door_code + '. ' : ''}`
        + `${d.wifi_ssid ? 'WiFi ' + d.wifi_ssid + ' / ' + (d.wifi_password || '') + '. ' : ''}`
        + `${d.owner_phone ? 'Kontakt na mieste ' + d.owner_phone + '. ' : ''}`
        + `Nastup ${date(order.date_from)}.${url ? ' Pokyny: ' + url : ''}`);
    },
    invoice({ invoice: inv, supplier, url }) {
      return noDia(`${who(supplier)}faktura ${inv.invoice_number} na ${money(inv.total)}, `
        + `splatnost ${date(inv.due_date)}, IBAN ${supplier?.iban || ''}, VS ${String(inv.invoice_number || '').replace(/\D/g, '')}.`
        + `${url ? ' Detail: ' + url : ''}`);
    },
  };

  window.DanubraPapers = { mark: () => MARK, logo: () => LOGO, brandHtml: (sup) => brandHtml(brandOf(sup || {})), header, foot, footSigned, letter, stundennachweis, STUNDEN_LEGAL, brand: brandOf, web: webOf, runFoot, CSS, stamp, invoice, selfInvoice, reminder, payable, siteSheet, lodgingSheet, invoiceGuide, monthLabel, toCents, centsText, workOrder, quote, werkvertrag, orderConfirmation, paymentRequest, ownerConfirmation, handover, gdprConsent, ramcovaZmluva, rahmenvertrag, bestellung, BESTELLUNG_L, GDPR_UCEL, GDPR_PRIJEMCOVIA, GDPR_PRAVA, short, shell, esc, money, date, noDia, kwRiadky, isoKw, ukoncenie, stavby, zoznamCinnosti };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { mark: () => MARK, logo: () => LOGO, brandHtml: (sup) => brandHtml(brandOf(sup || {})), header, foot, footSigned, shell, esc, letter, stundennachweis, STUNDEN_LEGAL, brand: brandOf, web: webOf, runFoot, stamp, invoice, selfInvoice, payable, siteSheet, lodgingSheet, invoiceGuide, monthLabel, toCents, centsText, workOrder, quote, werkvertrag, orderConfirmation, paymentRequest, ownerConfirmation, handover, gdprConsent, ramcovaZmluva, rahmenvertrag, bestellung, BESTELLUNG_L, GDPR_UCEL, GDPR_PRIJEMCOVIA, GDPR_PRAVA, short, noDia, kwRiadky, isoKw, ukoncenie, stavby, zoznamCinnosti };
  }
})();
