// ============================================================================
// DANUBRA — grafy
// ============================================================================
// Kreslené ručne do SVG. Žiadna knižnica: appka nemá ani jednu cudziu
// závislosť okrem klienta Supabase a Leafletu, a obe si nesieme so sebou.
// Graf, ktorý potrebuje 300 kB z cudzieho servera, je zlý obchod.
//
// Pravidlá, ktoré tu nie sú vkusom, ale rozhodnutím:
//
//   * **Modrá a oranžová, nie zelená a červená.** Zelená s červenou sa pri
//     najbežnejšej farbosleposti (deuteranopia, protanopia) zlejú — zmerané
//     ΔE 5,6, čo je pod hranicou rozoznateľnosti. Modrá #1E4FD8 s oranžovou
//     #F07E22 majú ΔE 34,1. Obe farby appka aj tak používa.
//   * **Jedna os.** Dve rôzne veličiny na jednom grafe s dvoma mierkami
//     vyrobia súvislosť, ktorá v dátach nie je. Zostatok preto zostáva
//     v tabuľke pod grafom, nie ako druhá čiara.
//   * **Popisky nenosia farbu dát.** Farbu nesie stĺpec, text zostáva
//     v šedej — inak je svetlá farba na bielom nečitateľná.
//   * **Nie každá hodnota má popisok.** Popisuje sa to, o čom graf je;
//     zvyšok povie os a tabuľka pod ním.
//   * **Graf nie je jediná cesta k číslu.** Pod každým je tabuľka alebo
//     zoznam — kto potrebuje presné číslo, prečíta si ho.
//
// Testy: node danubra/lib/chart.test.js
// ============================================================================
(function () {
  const IN = '#1E4FD8';        // peniaze dnu — studená
  const OUT = '#F07E22';       // peniaze von — teplá
  const GRID = '#EEF2FB';
  const AXIS = '#96A2BA';
  const GRID_TEXT = '#B8C2D6';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  /** Pekné číslo na os: 0, 500, 1 000, 2 500… */
  function niceStep(max, targetLines) {
    if (!(max > 0)) return 1;
    const raw = max / Math.max(1, targetLines);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 2.5, 5, 10]) {
      if (raw <= m * mag) return m * mag;
    }
    return 10 * mag;
  }

  /** Hodnota v eurách, krátko — na os sa dlhé čísla nezmestia. */
  function shortMoney(cents) {
    const v = Math.abs(cents) / 100;
    if (v >= 1000) return `${Math.round(v / 100) / 10}k`.replace('.', ',');
    return String(Math.round(v));
  }

  // ── Stĺpce okolo nuly: čo príde hore, čo odíde dole ──────────────────────
  /**
   * @param {Object} o
   *   rows   [{ label, sub, in: cents, out: cents (záporné alebo kladné) }]
   *   height výška plátna
   *   labelIn / labelOut  názvy sérií do legendy
   */
  function diverging(o = {}) {
    const rows = (o.rows || []).map(r => ({
      label: r.label, sub: r.sub,
      in: Math.max(0, Number(r.in) || 0),
      out: Math.abs(Number(r.out) || 0),
    }));
    if (!rows.length) return empty('Zatiaľ niet čo zobraziť.');

    // Rozmery sú v „pixeloch" viewBoxu. Pomer strán musí byť na šírku —
    // pri úzkom viewBoxe SVG s `height:auto` narastie do výšky karty
    // a text sa nafúkne na dvojnásobok nadpisu. Stalo sa to.
    const H = Number(o.height) || 190;
    const W = Number(o.width) || 620;
    const padTop = 16, padBottom = 30, padLeft = 46, padRight = 10;
    const plotH = H - padTop - padBottom;

    const max = Math.max(1, ...rows.map(r => Math.max(r.in, r.out)));
    const step = niceStep(max, 2);
    const top = Math.ceil(max / step) * step;
    const zeroY = padTop + plotH / 2;
    const half = plotH / 2;
    const y = (v) => (v / top) * half;

    const band = (W - padLeft - padRight) / rows.length;
    // Stĺpec nikdy nevyplní celé pásmo — zvyšok je vzduch. Dve stĺpce v pásme
    // (dnu, von) oddeľuje 2px medzera vo farbe podkladu.
    const barW = Math.min(22, band * 0.34);

    const grid = [];
    for (let v = step; v <= top; v += step) {
      for (const sign of [1, -1]) {
        const gy = zeroY - sign * y(v);
        grid.push(`<line x1="${padLeft}" x2="${W - padRight}" y1="${gy}" y2="${gy}"
          stroke="${GRID}" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
      }
      grid.push(`<text x="${padLeft - 7}" y="${zeroY - y(v) + 4}" text-anchor="end"
        font-size="11" fill="${AXIS}">${shortMoney(v)}</text>`);
      grid.push(`<text x="${padLeft - 7}" y="${zeroY + y(v) + 4}" text-anchor="end"
        font-size="11" fill="${AXIS}">${shortMoney(v)}</text>`);
    }

    const bars = rows.map((r, i) => {
      const cx = padLeft + band * i + band / 2;
      const xIn = cx - barW - 1;                     // 2px medzera medzi nimi
      const xOut = cx + 1;
      const hIn = y(r.in), hOut = y(r.out);
      const tip = (kind, v) => esc(`${r.label}${r.sub ? ` (${r.sub})` : ''} · ${kind}: ${(v / 100).toLocaleString('sk-SK', { style: 'currency', currency: 'EUR' })}`);
      return `
        ${r.in ? `<rect x="${xIn}" y="${zeroY - hIn}" width="${barW}" height="${hIn}"
          rx="3" fill="${IN}"><title>${tip('príde', r.in)}</title></rect>` : ''}
        ${r.out ? `<rect x="${xOut}" y="${zeroY}" width="${barW}" height="${hOut}"
          rx="3" fill="${OUT}"><title>${tip('odíde', r.out)}</title></rect>` : ''}
        <text x="${cx}" y="${H - 12}" text-anchor="middle" font-size="11" fill="${AXIS}">${esc(r.label)}</text>
        ${r.sub ? `<text x="${cx}" y="${H - 2}" text-anchor="middle" font-size="9" fill="${GRID_TEXT}">${esc(r.sub)}</text>` : ''}`;
    }).join('');

    return `
      <div class="chart">
        <svg viewBox="0 0 ${W} ${H}" role="img"
             aria-label="${esc(o.aria || 'Príjmy a výdaje po týždňoch')}">
          ${grid.join('')}
          <line x1="${padLeft}" x2="${W - padRight}" y1="${zeroY}" y2="${zeroY}"
            stroke="${AXIS}" stroke-width="1" vector-effect="non-scaling-stroke"/>
          ${bars}
        </svg>
        <div class="chart-legend">
          <span><i style="background:${IN}"></i>${esc(o.labelIn || 'Príde')}</span>
          <span><i style="background:${OUT}"></i>${esc(o.labelOut || 'Odíde')}</span>
        </div>
      </div>`;
  }

  // ── Stĺpce jednej veličiny ───────────────────────────────────────────────
  /**
   * @param {Object} o
   *   rows   [{ label, value, tip }]
   *   format ako sa hodnota zobrazí v bublinke
   *   color  farba stĺpcov (jedna séria = jedna farba, nie ramp podľa výšky)
   */
  function bars(o = {}) {
    const rows = (o.rows || []).map(r => ({ ...r, value: Number(r.value) || 0 }));
    if (!rows.length || rows.every(r => !r.value)) {
      return empty(o.emptyText || 'Zatiaľ niet čo zobraziť.');
    }

    const H = Number(o.height) || 150;
    const W = Number(o.width) || 620;
    const padTop = 16, padBottom = 26, padLeft = 40, padRight = 10;
    const plotH = H - padTop - padBottom;
    const color = o.color || IN;
    const fmt = o.format || ((v) => String(v));

    const max = Math.max(...rows.map(r => r.value), 1);
    const step = niceStep(max, 2);
    const top = Math.ceil(max / step) * step;
    const y = (v) => (v / top) * plotH;

    const grid = [];
    for (let v = step; v <= top; v += step) {
      const gy = padTop + plotH - y(v);
      grid.push(`<line x1="${padLeft}" x2="${W - padRight}" y1="${gy}" y2="${gy}"
        stroke="${GRID}" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
      grid.push(`<text x="${padLeft - 6}" y="${gy + 4}" text-anchor="end"
        font-size="11" fill="${AXIS}">${esc(o.axis ? o.axis(v) : v)}</text>`);
    }

    const band = (W - padLeft - padRight) / rows.length;
    const barW = Math.min(24, band * 0.6);

    // Popisuje sa len najvyšší stĺpec — číslo nad každým je chaos a nečíta sa.
    const peak = rows.reduce((a, b) => (b.value > a.value ? b : a), rows[0]);

    const marks = rows.map((r, i) => {
      const cx = padLeft + band * i + band / 2;
      const h = y(r.value);
      const tip = esc(r.tip || `${r.label}: ${fmt(r.value)}`);
      return `
        ${r.value ? `<rect x="${cx - barW / 2}" y="${padTop + plotH - h}" width="${barW}"
          height="${h}" rx="3" fill="${color}"><title>${tip}</title></rect>` : ''}
        ${r === peak && r.value ? `<text x="${cx}" y="${padTop + plotH - h - 5}"
          text-anchor="middle" font-size="11" font-weight="700" fill="#6F7C95">${esc(fmt(r.value))}</text>` : ''}
        <text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${AXIS}">${esc(r.label)}</text>`;
    }).join('');

    return `
      <div class="chart">
        <svg viewBox="0 0 ${W} ${H}" role="img"
             aria-label="${esc(o.aria || 'Stĺpcový graf')}">
          ${grid.join('')}
          <line x1="${padLeft}" x2="${W - padRight}" y1="${padTop + plotH}" y2="${padTop + plotH}"
            stroke="${AXIS}" stroke-width="1" vector-effect="non-scaling-stroke"/>
          ${marks}
        </svg>
      </div>`;
  }

  function empty(text) {
    return `<div class="chart chart-empty">${esc(text)}</div>`;
  }

  const API = { diverging, bars, niceStep, shortMoney, IN, OUT };
  if (typeof window !== 'undefined') window.DanubraChart = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
