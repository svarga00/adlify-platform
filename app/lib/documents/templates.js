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
  // Vzhľad podľa návrhu „PUNDS — Tlačoviny a e-maily": tmavomodrá a oranžová,
  // písmo Outfit na nadpisy a sumy, Hanken Grotesk na text. Rovnaká hlavička
  // a päta na faktúre, výkaze, objednávke aj zmluve — papiere pre nemecké
  // firmy aj pre živnostníkov vyzerajú ako od jednej firmy.
  const BRAND = {
    orange: '#F07F1A', navy: '#0E1626', sub: '#4A5570', mute: '#6F7A92',
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
  /** Text bez diakritiky — pre SMS (GSM-7). */
  const noDia = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Znak punds: dva oblúky, tmavý a oranžový.
  const LOGO = `<svg viewBox="2.25 7.25 43.5 33.5" width="44" height="34" fill="none" style="display:block">
    <path d="M6 34 V20 A9 9 0 0 1 24 20 V28" stroke="${BRAND.navy}" stroke-width="7.5" stroke-linecap="round"/>
    <path d="M24 28 A9 9 0 0 0 42 28 V14" stroke="${BRAND.orange}" stroke-width="7.5" stroke-linecap="round"/>
  </svg>`;

  /**
   * Značka v hlavičke: krátky názov (punds) a pod ním celý názov drobným
   * písmom. Krátky názov je z Nastavení (`brand`); kým tam nie je, pri
   * „Partner und Service" je to punds. Iná firma má v hlavičke celý názov.
   */
  function brandOf(s = {}) {
    const name = String((s && s.name) || '').trim();
    const brand = String((s && s.brand) || '').trim()
      || (/^partner\s+und\s+service\b/i.test(name) ? 'punds' : '');
    const bezFormy = name.replace(/,?\s*(spol\.\s*s\s*r\.\s*o\.|s\.\s*r\.\s*o\.|a\.\s*s\.|GmbH|UG|k\.\s*s\.)\s*$/i, '').trim();
    const sub = String((s && s.tagline) || '').trim() || (brand ? bezFormy : '');
    return { name, brand, sub };
  }

  /** Web firmy: z Nastavení, inak z domény e-mailu (info@punds.eu → punds.eu). */
  function webOf(s = {}) {
    if (s && s.web) return String(s.web).replace(/^https?:\/\//, '').replace(/\/$/, '');
    const d = String((s && s.email) || '').split('@')[1] || '';
    return d && !/^(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|azet|zoznam|centrum|post|atlas|seznam|gmx|web|t-online)\./i.test(d) ? d : '';
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
    .brand-word{font-weight:700;font-size:31px;line-height:.8;letter-spacing:-.045em;color:${BRAND.navy}}
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
  function shell(title, bodyHtml, { toolbar = true, editable = true, lang = 'sk' } = {}) {
    // Písmo Outfit (veľká suma na úhradu) nemá šírku pevnej medzery — „12.400,00€"
    // by sa zlepilo. V tom riadku je preto obyčajná medzera (riadok sa aj tak nezalomí).
    bodyHtml = String(bodyHtml).replace(/<div class="total-row sum">[\s\S]*?<\/div>/g, (m) => m.replace(/\u00a0|\u202f/g, ' '));
    const upravit = editable ? `<button class="tb-2" onclick="(function(b){var p=document.querySelector('.page');`
      + `var on=p.isContentEditable;p.contentEditable=on?'false':'true';document.body.classList.toggle('editing',!on);`
      + `b.textContent=on?'Upraviť text':'Hotovo';if(!on)p.focus();})(this)">Upraviť text</button>` : '';
    return `<!DOCTYPE html><html lang="${lang === 'de' ? 'de' : 'sk'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
${toolbar ? `<div class="toolbar"><span class="tb-title">${esc(title)}</span>
<span class="tb-acts">${upravit}<button class="tb-2 tb-doc" onclick="window.print()">Tlačiť</button><button class="tb-2 tb-doc" onclick="window.__doc&&window.__doc('share')">Poslať</button><button class="tb-doc" onclick="window.__doc&&window.__doc('pdf')">Stiahnuť PDF</button><button class="tb-print-only" onclick="window.print()">Uložiť ako PDF / vytlačiť</button></span></div>
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
    const znacka = b.brand
      ? `<div><div class="brand-word">${esc(b.brand)}</div>${b.sub ? `<div class="brand-sub">${esc(b.sub)}</div>` : ''}</div>`
      : b.name ? `<div><div class="brand-name">${pevne(b.name)}</div>
          ${supplier && supplier.tagline ? `<div class="brand-sub">${esc(supplier.tagline)}</div>` : ''}</div>` : '';
    // „č. 2026-018", ale meno človeka (infolist) bez „č." — nie je to číslo.
    const cisloPopis = { sk: 'č.', de: 'Nr.', both: 'č. / Nr.' }[lang] || 'č.';
    const cislo = number ? `<div class="meta">${/\d/.test(String(number)) ? `${esc(cisloPopis)} ` : ''}<span class="num">${esc(number)}</span></div>` : '';
    const riadok = (m) => {
      const x = String(m).match(/^([^:]{1,40}):\s+(.+)$/);
      return `<div class="meta">${x ? `${esc(x[1])} <b>${esc(x[2])}</b>` : esc(m)}</div>`;
    };
    return `<div class="head">
      <div class="brand">${LOGO}${znacka}</div>
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
  function invoice({ invoice: inv, items, client, supplier, qrSvg, vatNote, lang }) {
    const de = (lang || ((client?.country || 'SK').toUpperCase() === 'SK' ? 'sk' : 'de')) === 'de';
    const L = de ? INV_L.de : INV_L.sk;
    const loc = de ? 'de-DE' : 'sk-SK';
    const p = payable(inv);
    const pct = Number(inv.withholding_pct)
      || (p.total ? Math.round((p.held / p.total) * 100) : 0);

    const rows = (items || []).map(i => `<tr>
      <td>${esc(i.description)}</td>
      <td class="r">${Number(i.quantity || 0).toLocaleString(loc)}</td>
      <td class="r">${esc(i.unit || '')}</td>
      <td class="r">${money(i.unit_price, inv.currency, loc)}</td>
      <td class="r"><strong>${money(i.total, inv.currency, loc)}</strong></td></tr>`).join('');

    const body = `
      ${header(L.title, inv.invoice_number, [
        `${L.issued}: ${date(inv.issue_date)}`,
        `${L.due}: ${date(inv.due_date)}`,
        inv.delivery_date ? `${L.delivery}: ${date(inv.delivery_date)}` : '',
        inv.billing_period_from ? `${L.period}: ${date(inv.billing_period_from)} – ${date(inv.billing_period_to)}` : '',
      ], supplier, de ? 'de' : 'sk')}
      ${parties(supplier, client, [], de ? 'de' : 'sk')}
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
      ${p.held ? `<div class="note">${esc(L.holdNote(pct || 15))}</div>` : ''}
      ${vatNote ? `<div class="note">${esc(vatNote)}</div>` : ''}
      <div class="pay">
        <div style="flex:1">
          <div class="lbl">${esc(L.payInfo)}</div>
          <div class="val" style="line-height:1.9">
            IBAN: <strong style="font-family:ui-monospace,monospace">${esc(supplier?.iban || '—')}</strong><br>
            ${esc(L.ref)}: <strong style="font-family:ui-monospace,monospace">${esc(String(inv.invoice_number || '').replace(/\D/g, ''))}</strong><br>
            ${esc(L.amount)}: <strong>${money(p.net, inv.currency, loc)}</strong><br>
            ${esc(L.due)}: <strong>${date(inv.due_date)}</strong>
          </div>
        </div>
        ${qrSvg ? `<div style="text-align:center">
          <div class="lbl">${esc(L.scan)}</div>${qrSvg}
          <div style="font-size:9.5px;color:#8C97AD;margin-top:4px">SEPA QR</div></div>` : ''}
      </div>
      ${stamp(supplier) ? `<div class="stamp-inv">${stamp(supplier, 'st')}</div>` : ''}
      ${foot(supplier, de ? 'de' : 'sk')}`;
    return shell(`${L.title} ${inv.invoice_number || ''}`, body, { editable: false, lang: de ? 'de' : 'sk' });
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
          ${period ? `Obdobie: ${date(period.period_from)} – ${date(period.period_to)}` : ''}
        </div></div>
      </div>
      <table><thead><tr><th>Popis</th><th class="r">Množstvo</th><th class="r">MJ</th>
        <th class="r">Cena za MJ</th><th class="r">Spolu</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">Bez položiek</td></tr>'}</tbody></table>
      <div class="total"><div class="total-box">
        <div class="total-row sum"><span>Na úhradu</span><span>${money(bill.amount)}</span></div>
      </div></div>
      ${w.vat_payer ? '' : '<div class="note">Dodávateľ nie je platiteľom DPH.</div>'}
      <div class="note">Vyhotovenie faktúry odberateľom: faktúru vyhotovil odberateľ v mene a na účet
        dodávateľa na základe písomnej dohody v rámcovej zmluve o dielo${contractNo ? ` č. ${esc(contractNo)}` : ''}.
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
  function quote({ quote: q, client, supplier, trade, note }) {
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
        Die Abrechnung erfolgt monatlich auf Grundlage des vom Auftraggeber
        <strong>unterschriebenen Stundennachweises</strong>.<br>
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
  function werkvertrag({ contract: c, client, supplier, amendments = [], trade }) {
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
        <p>Zahlungsziel: <strong>${esc(c.payment_terms_days ?? 30)} Tage</strong> ab
        Rechnungseingang.</p>
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
   * **Živnostníkovi** ide objednávka po slovensky. Nie je to formalita: pri
   * Werkvertrag si objednávame **dielo**, nie hodiny, a tento papier je to,
   * čo pri kontrole odpovie na otázku, čo presne mal ten človek urobiť.
   * Preto sú na ňom aj tri vety o tom, že si prácu organizuje sám a fakturuje
   * nám ju — presne tie znaky, podľa ktorých sa dielo odlišuje od prenájmu
   * pracovnej sily.
   */
  /**
   * @param {Object} o
   *   ramcova  { number, signedAt } — rámcová zmluva, na ktorú sa objednávka
   *            odvoláva. **Bez nej to nie je individuálna zmluva o dielo**,
   *            len papier s cenou: článok III. rámcovej zmluvy hovorí, že
   *            individuálna zmluva vzniká práve vystavením objednávky a jej
   *            akceptáciou — a objednávka sa na ňu musí odvolať.
   *   places   ďalšie miesta výkonu. Živnostník nerobí vždy na jednej adrese;
   *            vo vzore ich je sedem plus celé územie oboch štátov.
   */
  function workOrder({ order, supplier, partner, worker, subcontract,
    ramcova = null, places = [] } = {}) {
    const o = order || {};
    const pre = o.kind === 'customer';
    const loc = pre ? 'de-DE' : 'sk-SK';
    const cena = o.price_model === 'fixed'
      ? (o.fixed_price != null ? money(o.fixed_price, o.currency, loc) : '—')
      : o.price_model === 'unit'
        ? (o.unit_price != null
          ? `${money(o.unit_price, o.currency, loc)} / ${esc(o.unit_label || (pre ? 'Einheit' : 'jednotku'))}` : '—')
        : (o.rate != null ? `${money(o.rate, o.currency, loc)} / ${pre ? 'Std.' : 'h'}` : '—');

    const L = pre ? {
      title: 'Auftragsbestätigung', num: 'Unsere Nr.', their: 'Ihre Bestellnummer',
      who: 'Auftraggeber', scope: 'Leistungsumfang', site: 'Baustelle',
      term: 'Ausführungszeitraum', price: 'Preis', note: 'Anmerkung',
      confirm: 'Wir bestätigen den Erhalt Ihrer Bestellung und die Ausführung '
        + 'der oben beschriebenen Leistung zu den genannten Bedingungen.',
      missing: 'Der Leistungsumfang ist noch nicht festgelegt.',
    } : {
      title: 'Objednávka', num: 'Číslo', their: '',
      who: 'Zhotoviteľ', scope: 'Čo je dielo', site: 'Stavba',
      term: 'Termín', price: 'Cena', note: 'Poznámka',
      confirm: '',
      missing: 'Dielo zatiaľ nie je popísané.',
    };

    const protistrana = pre
      ? { name: partner && partner.name, extra: [] }
      : { name: worker && worker.full_name, extra: [] };

    const body = `
      ${header(L.title, o.order_number || '', [
        o.their_ref ? `${L.their}: ${o.their_ref}` : '',
        o.received_at ? (pre ? `Bestellung vom ${date(o.received_at)}`
          : `Prijaté ${date(o.received_at)}`) : '',
      ].filter(Boolean), supplier, pre ? 'de' : 'sk')}

      ${o.their_ref && pre ? `<div class="note info">
        <strong>${esc(L.their)}: ${esc(o.their_ref)}</strong> — bitte bei Rückfragen
        und auf allen Rechnungen angeben.</div>` : ''}

      ${pre
        ? parties(supplier, { name: protistrana.name }, [], 'de')
        // Pri objednávke živnostníkovi sú úlohy opačné než na faktúre: my sme
        // objednávateľ, on zhotoviteľ. Keby tu stálo „Odberateľ: Ján Novák",
        // doklad by tvrdil pravý opak toho, čo má dokazovať.
        : `<div class="cols">
            <div class="col"><div class="lbl">Objednávateľ</div><div class="val">
              <strong>${esc(supplier?.name || '—')}</strong><br>
              ${supplier?.address ? esc(supplier.address) + '<br>' : ''}
              ${supplier?.company_id ? 'IČO: ' + esc(supplier.company_id) + '<br>' : ''}
              ${supplier?.email ? esc(supplier.email) : ''}
            </div></div>
            <div class="col"><div class="lbl">Zhotoviteľ</div><div class="val">
              <strong>${esc(protistrana.name || '—')}</strong><br>
              ${worker && (worker.business_address || worker.address)
                ? esc(worker.business_address || worker.address) + '<br>' : ''}
              ${worker && worker.company_id ? 'IČO: ' + esc(worker.company_id) + '<br>' : ''}
              ${worker && worker.phone ? esc(worker.phone) + '<br>' : ''}
              ${worker && worker.email ? esc(worker.email) + '<br>' : ''}
              <span style="color:#6F7A92">samostatne zárobkovo činná osoba</span>
            </div></div>
          </div>`}

      ${!pre ? (ramcova && ramcova.number ? `<div class="note">
        Objednávateľ si na základe <strong>Rámcovej zmluvy o dielo
        č. ${esc(ramcova.number)}</strong>${ramcova.signedAt
          ? ` uzavretej dňa ${date(ramcova.signedAt)}` : ''} objednáva
        u Zhotoviteľa nasledovný rozsah činností.</div>`
        : `<p class="todo">Objednávka sa neodvoláva na rámcovú zmluvu o dielo —
          doplň jej číslo a dátum, inak to nie je individuálna zmluva o dielo.</p>`) : ''}

      <h2 class="ss-h">${esc(L.scope)}</h2>
      ${o.scope
        ? `<p style="font-size:13px;line-height:1.6;white-space:pre-wrap;margin:0">${esc(o.scope)}</p>`
        : `<p class="todo" style="margin:0">${esc(L.missing)}</p>`}

      <div class="ss-row"><div class="lbl">${esc(L.site)}</div>
        <div class="val">${esc((subcontract && (subcontract.title
          || subcontract.contract_number)) || '—')}</div></div>
      ${(places || []).length ? `<div class="ss-row">
        <div class="lbl">${pre ? 'Weitere Ausführungsorte' : 'Miesta výkonu'}</div>
        <div class="val"><ul class="clean" style="margin:0">${
          places.filter(Boolean).map(x => '<li>' + esc(x) + '</li>').join('')}</ul></div>
      </div>` : ''}
      <div class="ss-row"><div class="lbl">${esc(L.term)}</div>
        <div class="val">${o.date_from ? `${date(o.date_from)} – ${date(o.date_to)}` : '—'}</div></div>
      <div class="ss-row"><div class="lbl">${esc(L.price)}</div>
        <div class="val"><strong>${cena}</strong></div></div>
      ${o.notes ? `<div class="ss-row"><div class="lbl">${esc(L.note)}</div>
        <div class="val">${esc(o.notes)}</div></div>` : ''}

      ${pre ? `<div class="note">${esc(L.confirm)}</div>` : `
      ${o.price_model === 'hourly' ? `<div class="note">
        Cena je dohodnutá za hodinu. Pri Werkvertrag je pevná cena alebo cena za
        jednotku <strong>silnejší doklad</strong> — hodinová sadzba sama osebe
        dielo nespochybní, ale pri kontrole treba vedieť ukázať, že je ohraničené
        rozsahom vyššie.</div>` : ''}
      <h2 class="ss-h">Čo z tejto objednávky platí</h2>
      <ul class="clean">
        <li>Objednáva sa <strong>dielo</strong>, nie hodiny. Rozsah je popísaný vyššie
          a tým je aj ohraničený — čokoľvek nad rámec sa dohodne novou objednávkou.</li>
        <li>Zhotoviteľ si prácu <strong>organizuje sám</strong>: vlastné náradie, vlastný
          postup, vlastné rozvrhnutie času v rámci dohodnutého termínu.</li>
        <li>Za vykonané dielo <strong>vystaví Zhotoviteľ faktúru</strong>. Podkladom je tento
          rozsah a odsúhlasený výkaz; obe sa musia zhodovať.</li>
      </ul>
      <div class="sigs">
        <div class="sig"><div class="line">${stamp(supplier)}</div><div class="who">Za objednávateľa</div></div>
        <div class="sig"><div class="line"></div><div class="who">Zhotoviteľ — prijímam objednávku</div></div>
      </div>`}
      ${pre ? foot(supplier, 'de') : footSigned(supplier)}`;
    return shell(`${L.title} ${o.order_number || ''}`, body, { lang: pre ? 'de' : 'sk' });
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
  function siteSheet({ worker, assignment, subcontract, partner, lodging, supplier,
    trade, state }) {
    const S = (typeof module !== 'undefined' && module.exports)
      ? require('./sitesheet') : window.DanubraSiteSheet;
    const sub = subcontract || {};
    const st = state || S.check({ worker, assignment, subcontract: sub, partner, lodging });
    const v = st.values;
    const chyba = (key) => {
      const m = st.missing.find(x => x.key === key);
      return m ? `<span class="todo">${esc(m.why)} Spýtaj sa u nás, kým nastúpiš.</span>` : '';
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

      <h2 class="ss-h">Ubytovanie</h2>
      ${riadok('Adresa', 'lodging', mapaByt
        ? ` <a href="${esc(mapaByt)}">Otvoriť v mape</a>` : '')}
      ${riadok('Kľúče', 'keys')}
      ${lodging && lodging.house_rules ? `<div class="ss-row">
        <div class="lbl">Čo platí v dome</div>
        <div class="val">${esc(lodging.house_rules)}</div></div>` : ''}

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

  // ── OBJEDNÁVKA OD NEMECKÉHO ODBERATEĽA, DVOJJAZYČNE ──────────────────────
  // Tretí krok, druhý papier. Rámcová zmluva hovorí, **ako** sa spolupracuje;
  // objednávka hovorí, **čo, kde, odkedy a za koľko** — a práve ona je tým,
  // čím individuálna zmluva o dielo vzniká.
  //
  // Dvojjazyčne v dvoch stĺpcoch, rovnako ako zmluva: on podpisuje po nemecky,
  // my čítame po slovensky.

  /** Pevné dvojice popiskov. Oddelene od údajov, nech sa dajú opraviť naraz. */
  const BESTELLUNG_L = {
    title: 'Objednávka / Bestellung',
    scope: ['Rozsah objednaných prác', 'Umfang der bestellten Arbeiten'],
    price: ['Cenové a kvantitatívne podmienky', 'Preis- und Mengenbedingungen'],
    from: ['Termín začatia vykonávania diela', 'Termin für den Beginn der Ausführung'],
    to: ['Termín ukončenia vykonávania diela', 'Termin für die Fertigstellung'],
    place: ['Miesto vykonania diela', 'Ausführungsort'],
    special: ['Osobitné dojednania a podmienky realizácie',
      'Besondere Vereinbarungen und Ausführungsbedingungen'],
    ext: ['s možným predĺžením', 'mit möglicher Verlängerung'],
  };

  /**
   * @param {Object} o
   *   order     { number, scope_sk, scope_de, rate, hours_week, date_from,
   *               date_to, extendable, places, special_sk, special_de }
   *   supplier  naše fakturačné údaje
   *   client    odberateľ
   *   ramcova   { number, signedAt } — zmluva, na ktorú sa objednávka odvoláva
   *   chyba     čo doplniť pred podpisom
   */
  function bestellung({ order = {}, supplier = {}, client = {},
    ramcova = null, chyba = [] } = {}) {
    const o = order;
    const dvoj = (n, sk, de) => `<div class="bil">
      <div class="bil-n">${n}.</div>
      <div class="bil-sk">${sk}</div>
      <div class="bil-de">${de}</div>
    </div>`;
    const riadok = (n, label, hodnota) => dvoj(n,
      `<strong>${esc(label[0])}:</strong><br>${hodnota}`,
      `<strong>${esc(label[1])}:</strong><br>${hodnota}`);

    const sadzba = o.rate != null
      ? `${money(o.rate, o.currency || 'EUR', 'sk-SK')} / `
      : null;
    const cenaSk = o.rate != null
      ? `Odmena za vykonanie diela je stanovená dohodou zmluvných strán vo výške `
        + `<strong>${money(o.rate, o.currency || 'EUR', 'sk-SK')} / hodina</strong>.`
        + (o.hours_week ? ` Predpokladaný časový rozsah: ${esc(o.hours_week)}.` : '')
      : '<span class="todo">Sadzba nie je dohodnutá.</span>';
    const cenaDe = o.rate != null
      ? `Die Vergütung für die Erstellung des Werkes wird durch Vereinbarung der `
        + `Vertragsparteien in Höhe von <strong>${money(o.rate, o.currency || 'EUR', 'de-DE')} `
        + `/ Stunde</strong> festgelegt.`
        + ((o.hours_week_de || o.hours_week)
          ? ` Voraussichtlicher Zeitaufwand: ${esc(o.hours_week_de || o.hours_week)}.` : '')
      : '<span class="todo">Der Satz ist nicht vereinbart.</span>';

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

    const body = header(BESTELLUNG_L.title, o.number || '', [], supplier, 'both') + `
      ${chyba.length ? `<div class="par"><p class="todo">Pred podpisom doplniť /
        Vor Unterzeichnung zu ergänzen: ${esc(chyba.map(c => c.title).join(', '))}.</p></div>` : ''}

      <div class="cols boxed">
        <div class="col"><div class="lbl">Zhotoviteľ / Auftragnehmer</div><div class="val">
          <strong>${esc(supplier.name || '—')}</strong><br>
          ${supplier.address ? esc(supplier.address) + '<br>' : ''}
          ${supplier.company_id ? 'IČO / Ident.-Nr.: ' + esc(supplier.company_id) + '<br>' : ''}
          ${supplier.vat_id ? 'IČ DPH / USt-IdNr.: ' + esc(supplier.vat_id) + '<br>' : ''}
          ${supplier.tax_number_de ? 'Steuernummer: ' + esc(supplier.tax_number_de) + '<br>' : ''}
          ${supplier.iban ? 'IBAN: ' + esc(supplier.iban) : ''}
        </div></div>
        <div class="col"><div class="lbl">Objednávateľ / Auftraggeber</div><div class="val">
          <strong>${esc(client.name || '—')}</strong><br>
          ${client.address ? esc(client.address) + '<br>' : ''}
          ${client.registration_no ? 'Reg.-Nr.: ' + esc(client.registration_no) + '<br>' : ''}
          ${client.ust_idnr ? 'IČ DPH / USt-IdNr.: ' + esc(client.ust_idnr) + '<br>' : ''}
          ${client.contact_person ? 'Zastúpený / Vertreten durch: ' + esc(client.contact_person) : ''}
        </div></div>
      </div>

      <div class="par">
        ${ramcova && ramcova.number
          ? dvoj(1,
            `V nadväznosti na ustanovenia <strong>Rámcovej zmluvy o dielo
             č. ${esc(ramcova.number)}</strong>${ramcova.signedAt
              ? `, uzatvorenej dňa ${date(ramcova.signedAt)}` : ''}, si Objednávateľ
             u Zhotoviteľa objednáva zhotovenie diela podľa nasledujúcej špecifikácie:<br>
             ${o.scope_sk ? '<strong>' + esc(o.scope_sk) + '</strong>'
              : '<span class="todo">Rozsah prác nie je popísaný.</span>'}`,
            `In Anlehnung an die Bestimmungen des <strong>Rahmenwerkvertrages
             Nr. ${esc(ramcova.number)}</strong>${ramcova.signedAt
              ? `, abgeschlossen am ${date(ramcova.signedAt)}` : ''}, bestellt der
             Auftraggeber beim Auftragnehmer die Herstellung des Werkes gemäß folgender
             Spezifikation:<br>
             ${o.scope_de ? '<strong>' + esc(o.scope_de) + '</strong>'
              : '<span class="todo">Der Arbeitsumfang ist nicht beschrieben.</span>'}`)
          : `<p class="todo">Objednávka sa neodvoláva na rámcovú zmluvu o dielo —
             doplň jej číslo a dátum. / Die Bestellung nimmt auf keinen
             Rahmenwerkvertrag Bezug.</p>`}

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
        ${(o.special_sk || o.special_de) ? dvoj(6,
          `<strong>${esc(BESTELLUNG_L.special[0])}:</strong><br>${esc(o.special_sk || '')}`,
          `<strong>${esc(BESTELLUNG_L.special[1])}:</strong><br>${esc(o.special_de || '')}`) : ''}
      </div>

      <div class="par"><p>${esc(mestoZAdresy(supplier) || '…')}, dňa / am ${
        esc(date(o.signed_at || new Date().toISOString().slice(0, 10)))}</p></div>
      <div class="sigs">
        <div class="sig"><div class="line">${stamp(supplier)}</div>
          <div class="who">Zhotoviteľ / Auftragnehmer</div></div>
        <div class="sig"><div class="line"></div>
          <div class="who">Objednávateľ / Auftraggeber</div></div>
      </div>
      ${footSigned(supplier, 'both')}`;

    return shell(`${BESTELLUNG_L.title} ${o.number || ''}`, body);
  }

  // ── RÁMCOVÁ ZMLUVA S NEMECKÝM ODBERATEĽOM ────────────────────────────────
  // Tretí krok. Dvojjazyčne **v dvoch stĺpcoch vedľa seba**, nie slovenský
  // blok a pod ním nemecký: takto je na prvý pohľad vidieť, že obe verzie
  // hovoria to isté — a keď sa jedna zmení a druhá nie, vidieť to tiež.

  function rahmenvertrag({ zmluva, chyba = [] } = {}) {
    if (!zmluva) return shell('Rámcová zmluva o dielo', '<p>Chýbajú údaje.</p>');
    const { supplier = {}, client = {}, clanky = [] } = zmluva;

    const strana = (titul, x, pole) => `<div class="col">
      <div class="lbl">${esc(titul)}</div><div class="val">
        <strong>${esc(x[pole.name] || '—')}</strong><br>
        ${x[pole.address] ? esc(x[pole.address]) + '<br>' : ''}
        ${x[pole.ico] ? 'IČO / Ident.-Nr.: ' + esc(x[pole.ico]) + '<br>' : ''}
        ${x[pole.register] ? esc(x[pole.register]) + '<br>' : ''}
        ${x[pole.vat] ? 'IČ DPH / USt-IdNr.: ' + esc(x[pole.vat]) + '<br>' : ''}
        ${x[pole.steuer] ? 'Steuernummer: ' + esc(x[pole.steuer]) + '<br>' : ''}
        ${x[pole.iban] ? 'IBAN: ' + esc(x[pole.iban]) + '<br>' : ''}
        ${x[pole.phone] ? esc(x[pole.phone]) + '<br>' : ''}
        ${x[pole.email] ? esc(x[pole.email]) + '<br>' : ''}
        ${x[pole.rep] ? 'Zastúpený / Vertreten durch: ' + esc(x[pole.rep]) : ''}
      </div></div>`;

    const body = header('Rámcová zmluva o dielo / Rahmenwerkvertrag', zmluva.number,
      ['uzatvorená podľa § 536 a nasl. zákona č. 513/1991 Zb. Obchodný zákonník',
        'abgeschlossen gemäß § 536 ff. des Gesetzes Nr. 513/1991 Slg. Handelsgesetzbuch'],
      supplier, 'both') + `
      ${chyba.length ? `<div class="par"><p class="todo">Pred podpisom doplniť /
        Vor Unterzeichnung zu ergänzen: ${esc(chyba.map(c => c.title).join(', '))}.</p></div>` : ''}

      <div class="par"><h3><span class="cl">Článok I. / Artikel I.</span>Zmluvné strany / Vertragsparteien</h3></div>
      <div class="cols boxed">
        ${strana('Zhotoviteľ / Auftragnehmer', supplier, { name: 'name', address: 'address',
          ico: 'company_id', register: 'register', vat: 'vat_id', steuer: 'tax_number_de',
          iban: 'iban', phone: 'phone', email: 'email', rep: 'representative' })}
        ${strana('Objednávateľ / Auftraggeber', client, { name: 'name', address: 'address',
          ico: 'registration_no', register: 'register', vat: 'ust_idnr', steuer: 'tax_number',
          iban: '', phone: 'phone', email: 'email', rep: 'contact_person' })}
      </div>

      ${clanky.map(c => `<div class="par">
        <h3><span class="cl">Článok ${esc(c.rim)} / Artikel ${esc(c.rim)}</span>${esc(c.sk)} / ${esc(c.de)}</h3>
        ${c.body.map((p, i) => `<div class="bil">
          <div class="bil-n">${i + 1}.</div>
          <div class="bil-sk">${esc(p.sk)}</div>
          <div class="bil-de">${esc(p.de)}</div>
        </div>`).join('')}
      </div>`).join('')}

      <div class="par"><p>${esc(mestoZAdresy(supplier) || '…')}, dňa / am ${
        esc(date(zmluva.signedAt))}</p></div>
      <div class="sigs">
        <div class="sig"><div class="line">${stamp(supplier)}</div>
          <div class="who">Zhotoviteľ / Auftragnehmer — ${esc(supplier.name || '')}</div></div>
        <div class="sig"><div class="line"></div>
          <div class="who">Objednávateľ / Auftraggeber — ${esc(client.name || '')}</div></div>
      </div>
      ${footSigned(supplier, 'both')}`;

    return shell('Rámcová zmluva / Rahmenwerkvertrag — ' + (client.name || ''), body);
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
    const S = (typeof require !== 'undefined' && typeof module !== 'undefined')
      ? require('./subcontract.js') : window.DanubraSubcontract;

    // Tučné `**takto**` z textu článkov — v zmluve to nesie dôraz, ktorý tam
    // dal právnik, a nemá sa stratiť.
    const tucne = (t) => esc(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    const body = header('Rámcová zmluva o dielo', zmluva.number,
      ['uzavretá podľa § 536 a nasl. Obchodného zákonníka'], supplier) + `
      ${chyba.length ? `<div class="par"><p class="todo">Pred podpisom doplniť:
        ${esc(chyba.map(c => c.title).join(', '))}.</p></div>` : ''}

      <div class="par"><h3><span class="cl">Článok I.</span>Zmluvné strany</h3></div>
      <div class="cols boxed">
        <div class="col"><div class="lbl">Objednávateľ</div><div class="val">
          <strong>${esc(supplier.name || '—')}</strong><br>
          ${supplier.address ? esc(supplier.address) + '<br>' : ''}
          ${supplier.company_id ? 'IČO: ' + esc(supplier.company_id) + '<br>' : ''}
          ${supplier.tax_id ? 'DIČ: ' + esc(supplier.tax_id) + '<br>' : ''}
          ${supplier.register ? esc(supplier.register) + '<br>' : ''}
          ${supplier.phone ? esc(supplier.phone) + '<br>' : ''}
          ${supplier.email ? esc(supplier.email) : ''}
        </div></div>
        <div class="col"><div class="lbl">Zhotoviteľ</div><div class="val">
          ${worker.legal_form === 'sro' && worker.company_name
            ? `<strong>${esc(worker.company_name)}</strong><br>konajúca: ${esc(worker.full_name || '—')}, konateľ<br>`
            : `<strong>${esc(worker.full_name || '—')}</strong><br>`}
          ${worker.business_address || worker.address
            ? esc(worker.business_address || worker.address) + '<br>' : ''}
          ${worker.company_id ? 'IČO: ' + esc(worker.company_id) + '<br>' : ''}
          ${worker.tax_id ? 'DIČ: ' + esc(worker.tax_id) + '<br>' : ''}
          ${worker.bank_iban ? 'IBAN: ' + esc(worker.bank_iban) + '<br>' : ''}
          ${worker.phone ? esc(worker.phone) + '<br>' : ''}
          ${worker.email ? esc(worker.email) : ''}
        </div></div>
      </div>

      ${clanky.map(c => `<div class="par">
        <h3><span class="cl">Článok ${esc(c.rim)}</span>${esc(c.nadpis)}</h3>
        <ol class="par-ol">${c.body.map(x => '<li>' + tucne(x) + '</li>').join('')}</ol>
      </div>`).join('')}

      <div class="par"><p>${esc(mestoZAdresy(supplier) || '…')}, dňa ${
        esc(S ? S.den(zmluva.signedAt) : zmluva.signedAt)}</p></div>
      <div class="sigs">
        <div class="sig"><div class="line">${stamp(supplier)}</div>
          <div class="who">Objednávateľ — ${esc(supplier.name || '')}</div></div>
        <div class="sig"><div class="line"></div>
          <div class="who">Zhotoviteľ — ${esc(worker.legal_form === 'sro' && worker.company_name
            ? `${worker.company_name}, ${worker.full_name || ''}` : (worker.full_name || ''))}</div></div>
      </div>
      ${footSigned(supplier)}`;

    return shell('Rámcová zmluva o dielo — ' + (worker.full_name || ''), body);
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

  window.DanubraPapers = { mark: () => LOGO, brand: brandOf, web: webOf, runFoot, CSS, stamp, invoice, selfInvoice, reminder, payable, siteSheet, workOrder, quote, werkvertrag, orderConfirmation, paymentRequest, ownerConfirmation, handover, gdprConsent, ramcovaZmluva, rahmenvertrag, bestellung, BESTELLUNG_L, GDPR_UCEL, GDPR_PRIJEMCOVIA, GDPR_PRAVA, short, shell, esc, money, date, noDia };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { mark: () => LOGO, brand: brandOf, web: webOf, runFoot, stamp, invoice, selfInvoice, payable, siteSheet, workOrder, quote, werkvertrag, orderConfirmation, paymentRequest, ownerConfirmation, handover, gdprConsent, ramcovaZmluva, rahmenvertrag, bestellung, BESTELLUNG_L, GDPR_UCEL, GDPR_PRIJEMCOVIA, GDPR_PRAVA, short, noDia };
  }
})();
