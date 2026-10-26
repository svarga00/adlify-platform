// ============================================================================
// DANUBRA — tlačoviny punds: vizitky a obálka DL (návrh 1a–1c, 2b)
// ============================================================================
// Rozmery sú v milimetroch, so spadávkou 3 mm na každej strane — tak to
// chce tlačiareň. Vizitka 85 × 55 mm → súbor 91 × 61 mm; obálka DL
// 220 × 110 mm (bez spadávky, tlačí sa na hotovú obálku).
//
// Návrh je kreslený v px pri 6 px = 1 mm (vizitka 510 × 330 px) a 3 px = 1 mm
// (obálka 660 × 330 px); hodnoty sú prepočítané.
// ============================================================================
(function () {
  const INK = '#0E1626', OR = '#F07F1A', STEEL = '#8C97AD', T2 = '#4A5570', T3 = '#6F7A92';
  const BLEED = 3;
  const CARD = { w: 85, h: 55 };
  const DL = { w: 220, h: 110 };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mm = (px, k = 6) => `${Math.round((px / k) * 100) / 100}mm`;

  /** Znak punds; w = šírka v mm (napr. '10.67mm'). */
  const mark = (w, a = INK, b = OR, op = 1) => {
    // Priehľadnosť cez stroke-opacity — opacity na <svg> knižnica PDF ignoruje.
    const o = op < 1 ? ` stroke-opacity="${op}"` : '';
    return `<svg viewBox="2.25 7.25 43.5 33.5" width="${w}" height="${(parseFloat(w) * 33.5 / 43.5).toFixed(2)}mm" fill="none" style="display:block">`
      + `<path d="M6 34 V20 A9 9 0 0 1 24 20 V28" stroke="${a}" stroke-width="7.5" stroke-linecap="round"${o}/>`
      + `<path d="M24 28 A9 9 0 0 0 42 28 V14" stroke="${b}" stroke-width="7.5" stroke-linecap="round"${o}/></svg>`;
  };

  const FONT = "'Hanken Grotesk',Inter,Arial,sans-serif", HEAD = "Outfit,'Hanken Grotesk',Arial,sans-serif";

  /** Obal jednej strany so spadávkou. Obsah je posunutý o spadávku. */
  function face(w, h, bg, inner, { bleed = BLEED } = {}) {
    return `<div class="pw-face" style="position:relative;width:${w + 2 * bleed}mm;height:${h + 2 * bleed}mm;background:${bg};overflow:hidden;font-family:${FONT};">`
      + `<div style="position:absolute;left:${bleed}mm;top:${bleed}mm;width:${w}mm;height:${h}mm;">${inner}</div></div>`;
  }

  const wordmark = (size, color, tagColor) => `<div style="display:flex;flex-direction:column;gap:${mm(13)};">`
    + `<span style="font:700 ${mm(size)}/.8 ${HEAD};letter-spacing:-.045em;color:${color};">punds</span>`
    + `<span style="font:500 ${mm(size * 0.2)}/1 ${FONT};letter-spacing:.26em;color:${tagColor};">PARTNER UND SERVICE</span></div>`;

  /**
   * Vizitka — líce a rub.
   * @param {Object} p { name, role, phone, email, web, address, lang ('sk'|'de'), variant ('dark'|'orange') }
   * @returns {{ w, h, faces: [html, html] }}  rozmery v mm (so spadávkou)
   */
  function card(p = {}) {
    const v = p.variant === 'orange' ? 'orange' : 'dark';
    const web = p.web || (p.lang === 'de' ? 'punds.eu' : 'punds.sk');
    const W = CARD.w, H = CARD.h;
    const logoRow = (markColor, word, tag) => `<div style="display:flex;align-items:center;gap:${mm(18)};">${mark(mm(64), markColor)}${wordmark(42, word, tag)}</div>`;
    let front, back;
    if (v === 'dark') {
      // Bleed: tmavé pozadie aj veľký znak idú cez okraj.
      front = face(W, H, INK, `
        <div style="position:absolute;right:${mm(-70)};bottom:${mm(-80)};">${mark(mm(330), '#fff', '#fff', 0.07)}</div>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">${logoRow('#fff', '#fff', STEEL)}</div>
        <span style="position:absolute;left:${mm(30)};bottom:${mm(24)};font:500 ${mm(13)} ${FONT};color:${STEEL};letter-spacing:.04em;">${esc(web)}</span>
        <span style="position:absolute;right:${mm(30)};bottom:${mm(30)};width:${mm(34)};height:${mm(5)};border-radius:${mm(3)};background:${OR};"></span>`);
      const rows = [['T', p.phone], ['E', p.email], ['W', web], ['A', p.address]].filter((r) => r[1]);
      back = face(W, H, '#fff', `
        <div style="position:absolute;inset:0;padding:${mm(34)} ${mm(36)};display:flex;flex-direction:column;justify-content:space-between;color:${INK};">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:${mm(12)};">
            <div style="display:flex;flex-direction:column;gap:${mm(6)};min-width:0;">
              <strong style="font:700 ${mm(27)}/1 ${HEAD};letter-spacing:-.035em;">${esc(p.name || '')}</strong>
              <span style="font:500 ${mm(14.5)} ${FONT};color:${OR};">${esc(p.role || '')}</span></div>
            ${mark(mm(44))}</div>
          <div style="display:grid;grid-template-columns:auto 1fr;column-gap:${mm(14)};row-gap:${mm(5)};font:400 ${mm(14)}/1.35 ${FONT};color:${T2};">
            ${rows.map(([k, val]) => `<span style="font-weight:600;color:${STEEL};font-size:${mm(11.5)};letter-spacing:.1em;padding-top:${mm(2)};">${k}</span><span style="color:${INK};">${esc(val)}</span>`).join('')}
          </div></div>`);
    } else {
      front = face(W, H, '#fff', `
        <div style="position:absolute;left:-${BLEED}mm;top:-${BLEED}mm;bottom:-${BLEED}mm;width:calc(${mm(14)} + ${BLEED}mm);background:${OR};"></div>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">${logoRow(INK, INK, T3)}</div>`);
      back = face(W, H, OR, `
        <div style="position:absolute;inset:0;padding:${mm(34)} ${mm(36)};display:flex;flex-direction:column;justify-content:space-between;color:${INK};">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:${mm(12)};">
            <div style="display:flex;flex-direction:column;gap:${mm(6)};min-width:0;">
              <strong style="font:700 ${mm(27)}/1 ${HEAD};letter-spacing:-.035em;">${esc(p.name || '')}</strong>
              <span style="font:600 ${mm(14.5)} ${FONT};color:#fff;">${esc(p.role || '')}</span></div>
            ${mark(mm(44), INK, '#fff')}</div>
          <div style="display:flex;flex-direction:column;gap:${mm(4)};font:500 ${mm(14)}/1.35 ${FONT};">
            ${p.phone ? `<span>${esc(p.phone)}</span>` : ''}<span>${esc([p.email, web].filter(Boolean).join(' · '))}</span></div></div>`);
    }
    return { w: W + 2 * BLEED, h: H + 2 * BLEED, faces: [front, back] };
  }

  /**
   * Obálka DL (220 × 110 mm). Adresát je v okienku vpravo (110 mm zľava, 50 mm zhora).
   * @param {Object} p { sender: 'Partner und Service s. r. o.\nPodzámska…', to: 'Firma GmbH\nStraße 1\n28195 Bremen\nDeutschland' }
   */
  function envelope(p = {}) {
    const k = 3;
    const sender = String(p.sender || 'Partner und Service s. r. o.\nPodzámska 9468/4A, 940 71 Nové Zámky').split('\n').map(esc).join('<br>');
    const to = String(p.to || '').trim();
    const inner = `
      <div style="position:absolute;left:${mm(40, k)};top:${mm(34, k)};display:flex;align-items:center;gap:${mm(10, k)};">${mark(mm(34, k))}
        <div style="display:flex;flex-direction:column;gap:${mm(7, k)};"><span style="font:700 ${mm(22, k)}/.8 ${HEAD};letter-spacing:-.045em;color:${INK};">punds</span>
        <span style="font:500 ${mm(5, k)}/1 ${FONT};letter-spacing:.26em;color:${T3};">PARTNER UND SERVICE</span></div></div>
      <div style="position:absolute;left:${mm(40, k)};bottom:${mm(34, k)};font:400 ${mm(10, k)}/1.55 ${FONT};color:${T3};">${sender}</div>
      ${to ? `<div style="position:absolute;left:110mm;top:50mm;width:95mm;font:400 3.9mm/1.45 ${FONT};color:${INK};">${to.split('\n').map((l, i) => (i === 0 ? `<strong>${esc(l)}</strong>` : esc(l))).join('<br>')}</div>` : ''}
      <div style="position:absolute;right:0;top:0;bottom:0;width:${mm(8, k)};background:${OR};"></div>`;
    return { w: DL.w, h: DL.h, faces: [face(DL.w, DL.h, '#fff', inner, { bleed: 0 })] };
  }

  /** Názov súboru: „Vizitka – Štefan Varga.pdf" */
  const fileName = (kind, who) => `${kind}${who ? ` – ${String(who).replace(/[\\/:*?"<>|]+/g, ' ').trim()}` : ''}.pdf`;

  const API = { card, envelope, fileName, CARD, DL, BLEED };
  if (typeof window !== 'undefined') window.DanubraPrintwork = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
