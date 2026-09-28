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
// Testy: node app/js/components/chart.test.js
// ============================================================================
(function () {
  const IN = '#1E4FD8';        // peniaze dnu — studená
  const OUT = '#F07E22';       // peniaze von — teplá
  const LEVEL = '#0A1B3D';     // stav účtu — nie pohyb, preto tmavá
  // Paleta na rozdelenie jedného čísla na časti. Overená na farbosleposť:
  // susedné dvojice sú rozoznateľné aj pri deuteranopii aj pri protanopii.
  const PALETTE = ['#1E4FD8', '#F07E22', '#0A1B3D', '#7BA0F0', '#C25C0C', '#96A2BA'];
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

  // ── Vodopád: od stavu účtu cez pohyby k výsledku ─────────────────────────
  /**
   * Dva druhy stĺpcov a to je celý trik:
   *   * **hladina** (`level`) stojí na nule — stav účtu dnes a na konci,
   *   * **zmena** (`delta`) visí tam, kde ju nechal predchádzajúci stĺpec.
   *
   * Preto je z grafu vidieť nielen koľko príde a odíde, ale aj **poradie** —
   * teda či niekde po ceste nespadne účet pod nulu. To je v tomto biznise
   * celá otázka: výplaty sa odložiť nedajú.
   *
   * @param {Object} o
   *   steps  [{ label, value: cents, kind: 'level'|'delta' }]
   */
  function waterfall(o = {}) {
    const steps = (o.steps || []).filter(s => s && s.kind);
    if (!steps.length) return empty('Zatiaľ niet čo zobraziť.');

    // Každý stĺpec vie, odkiaľ kam siaha. Hladina začína na nule, zmena
    // nadväzuje na predchádzajúci stav.
    let run = 0;
    const bars = steps.map((s) => {
      const v = Number(s.value) || 0;
      const from = s.kind === 'level' ? 0 : run;
      run = s.kind === 'level' ? v : run + v;
      return { ...s, value: v, from, to: run };
    });

    const H = Number(o.height) || 190;
    const W = Number(o.width) || 620;
    const padTop = 16, padBottom = 34, padLeft = 46, padRight = 10;
    const plotH = H - padTop - padBottom;

    const lo = Math.min(0, ...bars.map(b => Math.min(b.from, b.to)));
    const hi = Math.max(0, ...bars.map(b => Math.max(b.from, b.to)));
    const span = Math.max(1, hi - lo);
    const step = niceStep(span, 3);
    const top = Math.ceil(hi / step) * step;
    const bottom = Math.floor(lo / step) * step;
    const range = Math.max(step, top - bottom);
    const y = (v) => padTop + plotH - ((v - bottom) / range) * plotH;

    const grid = [];
    for (let v = bottom; v <= top + 0.5; v += step) {
      const gy = y(v);
      grid.push(`<line x1="${padLeft}" x2="${W - padRight}" y1="${gy}" y2="${gy}"
        stroke="${v === 0 ? AXIS : GRID}" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
      grid.push(`<text x="${padLeft - 7}" y="${gy + 4}" text-anchor="end"
        font-size="11" fill="${AXIS}">${v < 0 ? '−' : ''}${shortMoney(v)}</text>`);
    }

    const band = (W - padLeft - padRight) / bars.length;
    const barW = Math.min(46, band * 0.56);
    const money = (c) => (c / 100).toLocaleString('sk-SK', { style: 'currency', currency: 'EUR' });

    const cols = bars.map((b, i) => {
      const cx = padLeft + band * i + band / 2;
      const y1 = y(Math.max(b.from, b.to));
      const y2 = y(Math.min(b.from, b.to));
      // Nulová zmena by bola neviditeľná čiara — nech je z nej aspoň vlások.
      const h = Math.max(2, y2 - y1);
      const fill = b.kind === 'level'
        ? (b.to < 0 ? OUT : LEVEL)
        : (b.value >= 0 ? IN : OUT);
      // Spojnica k ďalšiemu stĺpcu — bez nej vodopád vyzerá ako obyčajné
      // stĺpce a poradie sa z neho nedá prečítať.
      const next = bars[i + 1];
      const link = next ? `<line x1="${cx + barW / 2}" x2="${padLeft + band * (i + 1) + band / 2 - barW / 2}"
        y1="${y(b.to)}" y2="${y(b.to)}" stroke="${AXIS}" stroke-width="1"
        stroke-dasharray="2 2" vector-effect="non-scaling-stroke"/>` : '';
      return `
        ${link}
        <rect x="${cx - barW / 2}" y="${y1}" width="${barW}" height="${h}" rx="2" fill="${fill}">
          <title>${esc(`${b.label}: ${money(b.value)}`)}</title>
        </rect>
        <text x="${cx}" y="${H - 16}" text-anchor="middle" font-size="11" fill="${AXIS}">${esc(b.label)}</text>
        <text x="${cx}" y="${H - 4}" text-anchor="middle" font-size="10" fill="${GRID_TEXT}">${
          esc((b.kind === 'delta' && b.value > 0 ? '+' : '') + money(b.value))}</text>`;
    }).join('');

    return `
      <div class="chart">
        <svg viewBox="0 0 ${W} ${H}" role="img"
             aria-label="${esc(o.aria || 'Od stavu účtu cez pohyby k zostatku')}">
          ${grid.join('')}
          ${cols}
        </svg>
        <div class="chart-legend">
          <span><i style="background:${LEVEL}"></i>Stav účtu</span>
          <span><i style="background:${IN}"></i>Príde</span>
          <span><i style="background:${OUT}"></i>Odíde</span>
        </div>
      </div>`;
  }

  // ── Jeden pás rozdelený na časti ─────────────────────────────────────────
  /**
   * Z čoho sa skladá jedno číslo. Koláč sa na to nehodí: uhly sa porovnávajú
   * horšie než dĺžky a pri troch podobných kúskoch sa z neho nedá prečítať nič.
   *
   * @param {Object} o
   *   parts  [{ label, value: cents, color }]
   *   height hrúbka pásu
   */
  function split(o = {}) {
    const parts = (o.parts || [])
      .map(p => ({ ...p, value: Math.abs(Number(p.value) || 0) }))
      .filter(p => p.value > 0);
    if (!parts.length) return empty(o.emptyText || 'Zatiaľ niet čo zobraziť.');

    const total = parts.reduce((s, p) => s + p.value, 0);
    const money = (c) => (c / 100).toLocaleString('sk-SK', { style: 'currency', currency: 'EUR' });
    // Podiel sa vracia rovno ako text. Celé percento nemá desatinné miesto,
    // takže tu nehrozí bodka namiesto čiarky — a kontrola v smoke teste to
    // nemusí hádať z interpolácie.
    const share = (v) => `${Math.round((v / total) * 100)} %`;

    return `
      <div class="chart chart-split">
        <div class="cs-bar" role="img" aria-label="${esc(o.aria || 'Rozdelenie')}">
          ${parts.map((p, i) => `<span style="flex:${p.value};background:${p.color || PALETTE[i % PALETTE.length]}"
            title="${esc(`${p.label}: ${money(p.value)} (${share(p.value)})`)}"></span>`).join('')}
        </div>
        <div class="cs-legend">
          ${parts.map((p, i) => `<span><i style="background:${p.color || PALETTE[i % PALETTE.length]}"></i>
            ${esc(p.label)}<b>${o.format ? esc(o.format(p.value)) : esc(money(p.value))}</b></span>`).join('')}
        </div>
      </div>`;
  }

  // ── Čiara bez osí ────────────────────────────────────────────────────────
  /**
   * Priebeh v malom. Nemá os ani čísla a ani ich mať nemá — hovorí len smer.
   * Presné číslo je vedľa nej v texte; graf, ktorý by sa tváril, že sa z neho
   * dá odčítať hodnota, by klamal.
   */
  function spark(values, o = {}) {
    const vals = (values || []).map(v => Number(v) || 0);
    if (vals.length < 2) return '';
    const W = o.width || 120, H = o.height || 28, pad = 2;
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const span = (hi - lo) || 1;
    const x = (i) => pad + (i / (vals.length - 1)) * (W - pad * 2);
    const y = (v) => H - pad - ((v - lo) / span) * (H - pad * 2);
    const d = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    const area = `${d} L${x(vals.length - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`;
    const color = o.color || (vals[vals.length - 1] >= vals[0] ? IN : OUT);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
      role="img" aria-label="${esc(o.aria || 'Priebeh')}">
      <path d="${area}" fill="${color}" opacity=".12"/>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6"
        stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    </svg>`;
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

  const API = { diverging, bars, waterfall, split, spark,
    niceStep, shortMoney, IN, OUT, LEVEL, PALETTE };
  if (typeof window !== 'undefined') window.DanubraChart = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
