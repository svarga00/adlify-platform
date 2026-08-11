// ============================================================================
// DANUBRA — Dokumenty (§8): jedna HTML šablóna, viac variantov
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
  const money = (n, cur = 'EUR') => Number(n || 0).toLocaleString('sk-SK',
    { style: 'currency', currency: cur, minimumFractionDigits: 2 });
  const date = (d) => d ? new Date(d).toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  /** Text bez diakritiky — pre SMS (GSM-7). */
  const noDia = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

  const LOGO = `<svg viewBox="6 17.5 94.5 85" width="30" height="30" style="display:block">
    <rect x="6" y="17.5" width="14" height="85" rx="7" fill="${BRAND.navy}"/>
    <path d="M 34 26 L 58 26 A 34 34 0 0 1 58 94 L 34 94" fill="none" stroke="${BRAND.orange}" stroke-width="17" stroke-linecap="round"/>
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
    .total-box{min-width:250px}
    .total-row{display:flex;justify-content:space-between;padding:6px 10px;font-size:13px}
    .total-row.sum{border-top:2px solid ${BRAND.navy};margin-top:5px;padding-top:10px;
      font-size:17px;font-weight:800;font-variant-numeric:tabular-nums}
    .pay{display:flex;gap:26px;align-items:flex-start;background:#F7F9FD;border:1px solid #E3EAF7;
      border-radius:12px;padding:16px 18px;margin-top:22px}
    .note{background:#F7F9FD;border-left:3px solid ${BRAND.orange};padding:11px 15px;margin:18px 0;font-size:12.5px}
    .foot{margin-top:34px;padding-top:14px;border-top:1px solid #E3EAF7;
      font-size:10.5px;color:#96A2BA;display:flex;justify-content:space-between;gap:16px}
    ul.clean{margin:8px 0;padding-left:18px}
    ul.clean li{margin:4px 0}
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

  function header(docTitle, number, meta = []) {
    return `<div class="head">
      <div class="brand">${LOGO}<div>
        <div class="brand-name">DANUBRA</div>
        <div class="brand-sub">UBYTOVANIE PRE PRACOVNÍKOV</div>
      </div></div>
      <div class="doc-title"><h1>${esc(docTitle)}</h1>
        ${number ? `<div class="num">${esc(number)}</div>` : ''}
        ${meta.map(m => `<div style="font-size:11.5px;color:#6F7C95;">${esc(m)}</div>`).join('')}
      </div></div>`;
  }

  function parties(supplier, client, extra = []) {
    return `<div class="cols">
      <div class="col"><div class="lbl">Dodávateľ</div><div class="val">
        <strong>${esc(supplier?.name || 'DANUBRA')}</strong><br>
        ${supplier?.address ? esc(supplier.address) + '<br>' : ''}
        ${supplier?.company_id ? 'IČO: ' + esc(supplier.company_id) + '<br>' : ''}
        ${supplier?.vat_id ? 'IČ DPH: ' + esc(supplier.vat_id) + '<br>' : ''}
        ${supplier?.email ? esc(supplier.email) : ''}
      </div></div>
      <div class="col"><div class="lbl">Odberateľ</div><div class="val">
        <strong>${esc(client?.name || '—')}</strong><br>
        ${client?.contact_person ? esc(client.contact_person) + '<br>' : ''}
        ${client?.company_id ? 'IČO: ' + esc(client.company_id) + '<br>' : ''}
        ${client?.vat_id ? 'IČ DPH: ' + esc(client.vat_id) + '<br>' : ''}
        ${client?.country ? esc(client.country) : ''}
      </div></div>
      ${extra.map(e => `<div class="col"><div class="lbl">${esc(e[0])}</div><div class="val">${e[1]}</div></div>`).join('')}
    </div>`;
  }

  function foot(supplier) {
    return `<div class="foot">
      <span>${esc(supplier?.name || 'DANUBRA')}${supplier?.email ? ' · ' + esc(supplier.email) : ''}${supplier?.phone ? ' · ' + esc(supplier.phone) : ''}</span>
      <span>Vystavené elektronicky, platné bez podpisu</span>
    </div>`;
  }

  // ── FAKTÚRA ───────────────────────────────────────────────────────────────
  function invoice({ invoice: inv, items, client, supplier, qrSvg, vatNote }) {
    const rows = (items || []).map(i => `<tr>
      <td>${esc(i.description)}</td>
      <td class="r">${Number(i.quantity || 0).toLocaleString('sk-SK')}</td>
      <td class="r">${esc(i.unit || '')}</td>
      <td class="r">${money(i.unit_price)}</td>
      <td class="r"><strong>${money(i.total)}</strong></td></tr>`).join('');
    const body = `
      ${header('Faktúra', inv.invoice_number, [])}
      ${parties(supplier, client, [['Údaje', `
        <div style="font-size:12px;">
          Vystavená: <strong>${date(inv.issue_date)}</strong><br>
          Splatnosť: <strong>${date(inv.due_date)}</strong><br>
          ${inv.delivery_date ? `Dodanie: ${date(inv.delivery_date)}<br>` : ''}
          ${inv.billing_period_from ? `Obdobie: ${date(inv.billing_period_from)} – ${date(inv.billing_period_to)}` : ''}
        </div>`]])}
      <table><thead><tr>
        <th>Popis</th><th class="r">Množstvo</th><th class="r">MJ</th>
        <th class="r">Cena/MJ</th><th class="r">Spolu</th>
      </tr></thead><tbody>${rows || '<tr><td colspan="5">Bez položiek</td></tr>'}</tbody></table>
      <div class="total"><div class="total-box">
        <div class="total-row sum"><span>Na úhradu</span><span>${money(inv.total, inv.currency)}</span></div>
      </div></div>
      ${vatNote ? `<div class="note">${esc(vatNote)}</div>` : ''}
      <div class="pay">
        <div style="flex:1">
          <div class="lbl">Platobné údaje</div>
          <div class="val" style="line-height:1.9">
            IBAN: <strong style="font-family:ui-monospace,monospace">${esc(supplier?.iban || '—')}</strong><br>
            Variabilný symbol: <strong style="font-family:ui-monospace,monospace">${esc(String(inv.invoice_number || '').replace(/\D/g, ''))}</strong><br>
            Suma: <strong>${money(inv.total, inv.currency)}</strong><br>
            Splatnosť: <strong>${date(inv.due_date)}</strong>
          </div>
        </div>
        ${qrSvg ? `<div style="text-align:center">
          <div class="lbl">Zaplatiť naskenovaním</div>${qrSvg}
          <div style="font-size:9.5px;color:#96A2BA;margin-top:4px">SEPA QR platba</div></div>` : ''}
      </div>
      ${foot(supplier)}`;
    return shell(`Faktúra ${inv.invoice_number || ''}`, body);
  }

  // ── POTVRDENIE OBJEDNÁVKY (bez adresy! §5.1) ──────────────────────────────
  function orderConfirmation({ order, client, accommodation, supplier }) {
    const body = `
      ${header('Potvrdenie objednávky', order.order_number, [date(order.accepted_at || order.created_at)])}
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
      ${header('Výzva na platbu', order.order_number)}
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
      ${header('Buchungsbestätigung', order.order_number)}
      <div class="cols">
        <div class="col"><div class="lbl">Vermittler</div><div class="val">
          <strong>${esc(supplier?.name || 'DANUBRA')}</strong><br>
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
  function handover({ order, client, data, supplier }) {
    const d = data || {};
    const code = (l, v) => v ? `<div class="code"><div class="lbl">${esc(l)}</div><div class="v">${esc(v)}</div></div>` : '';
    const maps = (d.lat && d.lng) ? `https://maps.google.com/?q=${d.lat},${d.lng}`
      : d.address ? `https://maps.google.com/?q=${encodeURIComponent(d.address + ', ' + (d.city || ''))}` : null;
    const body = `
      ${header('Pokyny na ubytovanie', order.order_number)}
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
  const short = {
    payment_request({ order, supplier, amount, dueDate, url }) {
      return noDia(`DANUBRA: objednavka ${order.order_number}. Na uhradu ${money(amount)}, `
        + `IBAN ${supplier?.iban || ''}, VS ${String(order.order_number || '').replace(/\D/g, '')}, `
        + `splatnost ${date(dueDate)}. Po uhrade posielame adresu.${url ? ' Detail: ' + url : ''}`);
    },
    handover({ order, data, url }) {
      const d = data || {};
      return noDia(`DANUBRA ${order.order_number}: ${d.address || ''}${d.city ? ', ' + d.city : ''}. `
        + `${d.access_door_code ? 'Kod dveri ' + d.access_door_code + '. ' : ''}`
        + `${d.wifi_ssid ? 'WiFi ' + d.wifi_ssid + ' / ' + (d.wifi_password || '') + '. ' : ''}`
        + `${d.owner_phone ? 'Kontakt na mieste ' + d.owner_phone + '. ' : ''}`
        + `Nastup ${date(order.date_from)}.${url ? ' Pokyny: ' + url : ''}`);
    },
    invoice({ invoice: inv, supplier, url }) {
      return noDia(`DANUBRA: faktura ${inv.invoice_number} na ${money(inv.total)}, `
        + `splatnost ${date(inv.due_date)}, IBAN ${supplier?.iban || ''}, VS ${String(inv.invoice_number || '').replace(/\D/g, '')}.`
        + `${url ? ' Detail: ' + url : ''}`);
    },
  };

  window.DanubraDocs = { invoice, orderConfirmation, paymentRequest, ownerConfirmation, handover, short, shell, esc, money, date, noDia };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { invoice, orderConfirmation, paymentRequest, ownerConfirmation, handover, short, noDia };
  }
})();
