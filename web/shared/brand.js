// ============================================================================
// punds web — logo (znak „∩∪" + slovo punds)
// ============================================================================
// Znak = jedna vlna „un" z p-un-ds: tmavý horný oblúk, oranžový dolný.
// Pri načítaní stránky sa nakreslí (stroke-dashoffset 1 → 0, oranžový o .6 s
// neskôr) — CSS trieda `.lg-draw` v base.css.
// ============================================================================
'use strict';

const INK = '#0E1626', OR = '#F07F1A';
const P1 = 'M6 34 V20 A9 9 0 0 1 24 20 V28';
const P2 = 'M24 28 A9 9 0 0 0 42 28 V14';

/** Samotný znak. @param {Object} o { w, light, draw, title } */
function mark({ w = 40, light = false, draw = false, title = '' } = {}) {
  const h = Math.round(w * 33.5 / 43.5 * 10) / 10;
  const pl = draw ? ' pathLength="1"' : '';
  return `<svg class="lg-mark${draw ? ' lg-draw' : ''}" width="${w}" height="${h}" viewBox="2.25 7.25 43.5 33.5" fill="none"${title ? ` role="img" aria-label="${title}"` : ' aria-hidden="true"'}>`
    + `<path d="${P1}"${pl} stroke="${light ? '#fff' : INK}" stroke-width="7.5" stroke-linecap="round"/>`
    + `<path d="${P2}"${pl} stroke="${OR}" stroke-width="7.5" stroke-linecap="round"/></svg>`;
}

/** Celé logo ako odkaz. @param {Object} o { href, light, size } */
function logo({ href = '/', light = false, size = 40, draw = true, label = 'punds — Partner und Service' } = {}) {
  return `<a class="logo${light ? ' logo-light' : ''}" href="${href}" aria-label="${label}">${mark({ w: size, light, draw })}`
    + `<span class="logo-txt"><span class="logo-word">punds</span><span class="logo-tag">PARTNER UND SERVICE</span></span></a>`;
}

module.exports = { mark, logo, INK, OR };
