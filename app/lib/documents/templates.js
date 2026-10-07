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
  const BRAND = { orange: '#F07E22', blue: '#1E4FD8', navy: '#0A1B3D' };

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

  // Znak, nie písmeno. Dokument ide odberateľovi a názov na ňom má byť ten
  // z Nastavení — nie natvrdo zapísaný v kóde.
  const LOGO = `<svg viewBox="0 0 100 100" width="28" height="28" style="display:block">
    <rect x="4" y="56" width="24" height="40" rx="2" fill="${BRAND.navy}"/>
    <rect x="38" y="32" width="24" height="64" rx="2" fill="${BRAND.navy}"/>
    <rect x="72" y="4" width="24" height="92" rx="2" fill="${BRAND.orange}"/>
  </svg>`;

  const CSS = `
    *{box-sizing:border-box}
    body{margin:0;padding:0;background:#fff;color:${BRAND.navy};
      font-family:Archivo,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;line-height:1.55}
    .page{max-width:800px;margin:0 auto;padding:38px 44px}
    .head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;
      padding-bottom:18px;border-bottom:2px solid ${BRAND.navy}}
    .brand{display:flex;align-items:center;gap:9px}
    .brand-name{font-size:19px;font-weight:800;letter-spacing:-.02em}
    .brand-sub{font-size:9.5px;letter-spacing:.16em;color:#6F7C95;font-family:ui-monospace,monospace}
    .doc-title{text-align:right}
    .doc-title h1{margin:0;font-size:20px;font-weight:800;letter-spacing:-.02em}
    .doc-title .num{font-family:ui-monospace,monospace;font-size:13px;color:${BRAND.orange};font-weight:700}
    .cols{display:flex;gap:34px;margin:24px 0}
    .col{flex:1}
    .lbl{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#96A2BA;font-weight:700;
      font-family:ui-monospace,monospace;margin-bottom:5px}
    .val{font-size:13px}
    .val strong{font-size:14px}
    table{width:100%;border-collapse:collapse;margin:18px 0}
    th{text-align:left;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#96A2BA;
      font-family:ui-monospace,monospace;padding:8px 10px;border-bottom:1.5px solid #E3EAF7}
    td{padding:10px;border-bottom:1px solid #EEF2FB;font-size:13px;vertical-align:top}
    td.r,th.r{text-align:right;font-variant-numeric:tabular-nums}
    .total{display:flex;justify-content:flex-end;margin-top:6px}
    .total-box{min-width:320px}
    .total-row{display:flex;justify-content:space-between;gap:18px;padding:6px 10px;font-size:13px}
    .total-row.sum{border-top:2px solid ${BRAND.navy};margin-top:5px;padding-top:10px;
      font-size:17px;font-weight:800;font-variant-numeric:tabular-nums}
    .pay{display:flex;gap:26px;align-items:flex-start;background:#F7F9FD;border:1px solid #E3EAF7;
      border-radius:12px;padding:16px 18px;margin-top:22px}
    .note{background:#F7F9FD;border-left:3px solid ${BRAND.orange};padding:11px 15px;margin:18px 0;font-size:12.5px}
    .foot{margin-top:34px;padding-top:14px;border-top:1px solid #E3EAF7;
      font-size:10.5px;color:#96A2BA;display:flex;justify-content:space-between;gap:16px}
    ul.clean{margin:8px 0;padding-left:18px}
    ul.clean li{margin:4px 0}
    /* Zmluva má paragrafy a podpisy — dokument, ktorý sa podpisuje perom,
       potrebuje miesto na to pero. */
    .par{margin:14px 0 0}
    .par h3{font-size:12.5px;margin:0 0 4px;letter-spacing:.04em;text-transform:uppercase;
      color:${BRAND.navy}}
    .par p{margin:0 0 6px;font-size:12.5px;line-height:1.55}
    .sigs{display:flex;gap:40px;margin-top:38px;page-break-inside:avoid}
    .sig{flex:1}
    .sig .line{border-bottom:1px solid #6F7C95;height:46px}
    .sig .who{font-size:11px;color:#6F7C95;margin-top:5px}
    .ss-h{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#96A2BA;
      font-family:ui-monospace,monospace;margin:26px 0 10px;padding-bottom:6px;
      border-bottom:1px solid #E3EAF7;page-break-after:avoid}
    .ss-row{display:flex;gap:18px;padding:7px 0;border-bottom:1px solid #EEF2FB;
      page-break-inside:avoid}
    .ss-row .lbl{flex:0 0 150px;margin:0;padding-top:2px}
    .ss-row .val{flex:1;min-width:0}
    /* Chýbajúci údaj sa nevynechá potichu — prázdny riadok vyzerá ako „netreba". */
    .todo{color:#C25C0C;font-weight:600}
    .codes{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}
    .code{background:#F7F9FD;border:1px solid #E3EAF7;border-radius:10px;padding:11px 14px}
    .code .v{font-family:ui-monospace,monospace;font-size:19px;font-weight:600;letter-spacing:.05em}
    .toolbar{position:sticky;top:0;background:${BRAND.navy};color:#fff;padding:10px 20px;
      display:flex;justify-content:space-between;align-items:center;gap:12px}
    .toolbar button{background:${BRAND.orange};color:#fff;border:0;border-radius:8px;
      padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
    @media print{.toolbar{display:none}.page{padding:0}@page{margin:16mm}}
  `;

  function shell(title, bodyHtml, { toolbar = true } = {}) {
    return `<!DOCTYPE html><html lang="sk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
${toolbar ? `<div class="toolbar"><span style="font-size:13px;font-weight:600;">${esc(title)}</span>
<button onclick="window.print()">Uložiť ako PDF / vytlačiť</button></div>` : ''}
<div class="page">${bodyHtml}</div></body></html>`;
  }

  /**
   * Hlavička dokumentu. Meno firmy je z Nastavení — keď tam nie je, zostane
   * len znak. Vymyslené meno na doklade je horšie než žiadne.
   */
  function header(docTitle, number, meta = [], supplier = null) {
    const name = supplier && supplier.name;
    return `<div class="head">
      <div class="brand">${LOGO}${name ? `<div>
        <div class="brand-name">${esc(name)}</div>
        ${supplier.tagline ? `<div class="brand-sub">${esc(supplier.tagline)}</div>` : ''}
      </div>` : ''}</div>
      <div class="doc-title"><h1>${esc(docTitle)}</h1>
        ${number ? `<div class="num">${esc(number)}</div>` : ''}
        ${meta.map(m => `<div style="font-size:11.5px;color:#6F7C95;">${esc(m)}</div>`).join('')}
      </div></div>`;
  }

  /**
   * Strany zmluvy. `lang: 'de'` prepne popisky — na nemeckom dokumente by
   * „Dodávateľ" nad nemeckým textom vyzeralo ako preklep.
   */
  function parties(supplier, client, extra = [], lang = 'sk') {
    const L = lang === 'de'
      ? { od: 'Auftragnehmer', pre: 'Auftraggeber', ico: 'Reg.-Nr.', dph: 'USt-IdNr.' }
      : { od: 'Dodávateľ', pre: 'Odberateľ', ico: 'IČO', dph: 'IČ DPH' };
    return `<div class="cols">
      <div class="col"><div class="lbl">${esc(L.od)}</div><div class="val">
        <strong>${esc(supplier?.name || '—')}</strong><br>
        ${supplier?.address ? esc(supplier.address) + '<br>' : ''}
        ${supplier?.company_id ? esc(L.ico) + ': ' + esc(supplier.company_id) + '<br>' : ''}
        ${supplier?.vat_id ? esc(L.dph) + ': ' + esc(supplier.vat_id) + '<br>' : ''}
        ${supplier?.email ? esc(supplier.email) : ''}
      </div></div>
      <div class="col"><div class="lbl">${esc(L.pre)}</div><div class="val">
        <strong>${esc(client?.name || '—')}</strong><br>
        ${client?.contact_person ? esc(client.contact_person) + '<br>' : ''}
        ${client?.company_id ? esc(L.ico) + ': ' + esc(client.company_id) + '<br>' : ''}
        ${client?.vat_id ? esc(L.dph) + ': ' + esc(client.vat_id) + '<br>' : ''}
        ${client?.country ? esc(client.country) : ''}
      </div></div>
      ${extra.map(e => `<div class="col"><div class="lbl">${esc(e[0])}</div><div class="val">${e[1]}</div></div>`).join('')}
    </div>`;
  }

  function foot(supplier) {
    return `<div class="foot">
      <span>${esc(supplier?.name || '')}${supplier?.email ? ' · ' + esc(supplier.email) : ''}${supplier?.phone ? ' · ' + esc(supplier.phone) : ''}</span>
      <span>Vystavené elektronicky, platné bez podpisu</span>
    </div>`;
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
      ${header(L.title, inv.invoice_number, [], supplier)}
      ${parties(supplier, client, [[de ? 'Angaben' : 'Údaje', `
        <div style="font-size:12px;">
          ${esc(L.issued)}: <strong>${date(inv.issue_date)}</strong><br>
          ${esc(L.due)}: <strong>${date(inv.due_date)}</strong><br>
          ${inv.delivery_date ? `${esc(L.delivery)}: ${date(inv.delivery_date)}<br>` : ''}
          ${inv.billing_period_from ? `${esc(L.period)}: ${date(inv.billing_period_from)} – ${date(inv.billing_period_to)}` : ''}
        </div>`]], de ? 'de' : 'sk')}
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
          <div style="font-size:9.5px;color:#96A2BA;margin-top:4px">SEPA QR</div></div>` : ''}
      </div>
      ${foot(supplier)}`;
    return shell(`${L.title} ${inv.invoice_number || ''}`, body);
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
      ${header('Angebot', q.quote_number, [], supplier)}
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
      ${foot(supplier)}`;
    return shell(`Angebot ${q.quote_number || ''}`, body);
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

    const par = (title, html) => `<div class="par"><h3>${esc(title)}</h3>${html}</div>`;

    const body = `
      ${header('Werkvertrag', c.contract_number, [], supplier)}
      ${parties(supplier, client, [['Vertrag', `
        <div style="font-size:12px;">
          ${c.date_from ? `Beginn: <strong>${date(c.date_from)}</strong><br>` : ''}
          ${c.date_to ? `Ende: <strong>${date(c.date_to)}</strong><br>` : ''}
          ${c.signed_at ? `Unterschrieben: <strong>${date(c.signed_at)}</strong>` : ''}
        </div>`]], 'de')}

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
        <div class="sig"><div class="line"></div>
          <div class="who">${esc(supplier?.name || 'Auftragnehmer')} · Ort, Datum</div></div>
        <div class="sig"><div class="line"></div>
          <div class="who">${esc(client?.name || 'Auftraggeber')} · Ort, Datum</div></div>
      </div>

      <div class="foot">
        <span>${esc(supplier?.name || '')}${supplier?.email ? ' · ' + esc(supplier.email) : ''}</span>
        <span>Zwei gleichlautende Ausfertigungen</span>
      </div>`;
    return shell(`Werkvertrag ${c.contract_number || ''}`, body);
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
          <div style="font-size:9.5px;color:#96A2BA;margin-top:4px">SEPA QR platba</div></div>` : ''}
      </div>
      <div class="note">Po pripísaní platby vám obratom pošleme adresu ubytovania,
      kontakt na ubytovateľa a pokyny na prevzatie.</div>
      ${foot(supplier)}`;
    return shell(`Výzva na platbu ${order.order_number || ''}`, body);
  }

  // ── POTVRDENIE MAJITEĽOVI (nemecky, §8) ───────────────────────────────────
  function ownerConfirmation({ order, accommodation, persons, supplier }) {
    const body = `
      ${header('Buchungsbestätigung', order.order_number, [], supplier)}
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
      ${foot(supplier)}`;
    return shell(`Buchungsbestätigung ${order.order_number || ''}`, body, { toolbar: true });
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
  function workOrder({ order, supplier, partner, worker, subcontract }) {
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
      ].filter(Boolean), supplier)}

      ${o.their_ref && pre ? `<div class="note" style="border-left-color:#1E4FD8">
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
              <span style="color:#6F7C95">samostatne zárobkovo činná osoba</span>
            </div></div>
          </div>`}

      <h2 class="ss-h">${esc(L.scope)}</h2>
      ${o.scope
        ? `<p style="font-size:13px;line-height:1.6;white-space:pre-wrap;margin:0">${esc(o.scope)}</p>`
        : `<p class="todo" style="margin:0">${esc(L.missing)}</p>`}

      <div class="ss-row"><div class="lbl">${esc(L.site)}</div>
        <div class="val">${esc((subcontract && (subcontract.title
          || subcontract.contract_number)) || '—')}</div></div>
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
        <li>Prácu si <strong>organizuješ sám</strong>: vlastné náradie, vlastný postup,
          vlastné rozvrhnutie času v rámci dohodnutého termínu.</li>
        <li>Za vykonané dielo <strong>vystavíš faktúru</strong>. Podkladom je tento
          rozsah a odsúhlasený výkaz; obe sa musia zhodovať.</li>
      </ul>
      <div class="sigs">
        <div class="sig"><div class="line"></div><div class="who">Za objednávateľa</div></div>
        <div class="sig"><div class="line"></div><div class="who">Zhotoviteľ — prijímam objednávku</div></div>
      </div>`}
      ${foot(supplier)}`;
    return shell(`${L.title} ${o.order_number || ''}`, body);
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

      <div class="note" style="border-left-color:#1E4FD8">
        Toto si vezmi so sebou. Keď niečo nesedí, <strong>zavolaj nám skôr, než
        niečo podpíšeš alebo začneš robiť</strong> — na stavbe sa to potom rieši ťažko.
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
          <td style="color:#6F7C95">${esc(b.why)}</td></tr>`).join('')}
      </tbody></table>

      <h2 class="ss-h">Ako sa hlásia hodiny</h2>
      <ul class="clean">
        <li>Hodiny zapisuj <strong>každý deň</strong>, nie na konci týždňa — spätne sa
          nikto nespomenie, kedy sa začalo a kedy skončilo.</li>
        <li>Na konci týždňa podpíše odberateľ výkaz (<em>Stundennachweis</em>).
          <strong>Nepodpisuj nič iné</strong>, čo ti na stavbe dajú, kým sa neozveš nám.</li>
        <li>Z tých istých hodín vzniká tvoja faktúra nám aj naša faktúra odberateľovi.
          Preto sa musia zhodovať.</li>
      </ul>

      <h2 class="ss-h">Nemecké vety, ktoré budeš potrebovať</h2>
      <table><thead><tr><th>Po slovensky</th><th>Po nemecky</th></tr></thead><tbody>
        ${vety.map(f => `<tr><td style="color:#6F7C95">${esc(f.sk)}</td>
          <td><strong>${esc(f.de)}</strong></td></tr>`).join('')}
      </tbody></table>

      <h2 class="ss-h">Keď je problém</h2>
      <ul class="clean">
        <li><strong>Nepustia ťa na stavbu</strong> alebo chcú doklad, ktorý nemáš —
          zavolaj nám hneď, nerieš to sám.</li>
        <li><strong>Kontrola (Zoll, FKS)</strong> — ukáž A1 a živnostenský list,
          buď slušný, nič nepodpisuj a zavolaj nám.</li>
        <li><strong>Úraz</strong> — najprv 112, potom nám. Aj drobný úraz treba nahlásiť
          v ten istý deň.</li>
        <li><strong>Chcú od teba prácu mimo dohody</strong> — povedz, že sa musíš
          spýtať, a zavolaj. Nie je to nezdvorilosť, je to zmluva.</li>
      </ul>

      ${supplier && (supplier.phone || supplier.email) ? `<div class="pay">
        <div style="flex:1">
          <div class="lbl">Na nás sa dovoláš tu</div>
          <div class="val" style="line-height:1.9">
            ${supplier.phone ? `Telefón: <strong>${esc(supplier.phone)}</strong><br>` : ''}
            ${supplier.email ? `E-mail: <strong>${esc(supplier.email)}</strong>` : ''}
          </div>
        </div>
      </div>` : ''}
      ${foot(supplier)}`;
    return shell(`Infolist — ${(worker && worker.full_name) || 'stavba'}`, body);
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

  window.DanubraPapers = { mark: () => LOGO, invoice, payable, siteSheet, workOrder, quote, werkvertrag, orderConfirmation, paymentRequest, ownerConfirmation, handover, short, shell, esc, money, date, noDia };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { mark: () => LOGO, invoice, payable, siteSheet, workOrder, quote, werkvertrag, orderConfirmation, paymentRequest, ownerConfirmation, handover, short, noDia };
  }
})();
