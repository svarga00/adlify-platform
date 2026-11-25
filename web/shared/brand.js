// ============================================================================
// DANUBRA web — logo (znak D + písmená ANUBRA)
// ============================================================================
// Znak je písmeno D: oranžová zvislá pilulka a modrý oblúk. Za ním sú písmená
// ANUBRA ako krivky (nie písmo), takže logo vyzerá všade rovnako. Za znak sa
// nikdy nepíše slovo DANUBRA — čítalo by sa „DDANUBRA". Bez podtitulku.
// Krivky sú z app/lib/brand-logo.js (jeden zdroj pre appku, dokumenty aj web).
// Pri načítaní stránky sa znak nakreslí (stroke-dashoffset 1 -> 0, oblúk
// o chvíľu neskôr) a písmená sa objavia — CSS trieda `.lg-draw` v base.css.
// ============================================================================
'use strict';

const L = require('../../app/lib/brand-logo.js');

const { orange: OR, blue: BLUE, navy: INK } = L.COLORS;

/**
 * Samotný znak D.
 * @param {Object} o { w (šírka v px), mono (jedna farba — veľký priesvitný znak
 *   v pozadí), draw, title }. Na tmavom pozadí ostávajú farby znaku rovnaké.
 */
function mark({ w = 40, mono = '', draw = false, title = '' } = {}) {
  const h = Math.round(w / L.MARK_RATIO * 10) / 10;
  const c = draw ? ' class="lg-s" pathLength="1"' : '';
  return `<svg class="lg-mark${draw ? ' lg-draw' : ''}" width="${w}" height="${h}" viewBox="${L.MARK_VB}" fill="none"${title ? ` role="img" aria-label="${title}"` : ' aria-hidden="true"'}>`
    + `<path d="${L.PILL}"${c} stroke="${mono || OR}" stroke-width="${L.PILL_W}" stroke-linecap="round"/>`
    + `<path d="${L.CURVE}"${c} stroke="${mono || BLUE}" stroke-width="${L.CURVE_W}" stroke-linecap="round"/></svg>`;
}

/**
 * Celé logo ako odkaz. Na tmavom pozadí (`light`) sú písmená biele.
 * @param {Object} o { href, light, size (výška v px), draw, label }
 */
function logo({ href = '/', light = false, size = 26, draw = true, label = 'DANUBRA' } = {}) {
  return `<a class="logo${light ? ' logo-light' : ''}" href="${href}" aria-label="${label}">`
    + L.logo({ h: size, ink: light ? '#fff' : INK, title: '', cls: `lg-logo${draw ? ' lg-draw' : ''}`, draw })
    + '</a>';
}

module.exports = { mark, logo, INK, OR, BLUE };
