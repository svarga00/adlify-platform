// ============================================================================
// punds web — čiarové ikony (SVG), jediný zdroj pre oba weby
// ============================================================================
// Žiadne emoji ani piktogramy z písma — len tieto ikony. Kreslia sa farbou
// textu (currentColor), veľkosť je 1em (riadi sa font-size rodiča) a sú
// skryté pre čítačky (aria-hidden). Trieda `ico ico-<meno>` (base.css).
//   icon('check')  ·  icon('pin', 'jd-pin')
// Rovnaké cesty kreslí aj public/js/sk-jobs.js (čip mesta, krížik) — pri
// zmene upraviť aj tam.
// ============================================================================
'use strict';

const PATHS = {
  check: '<path d="M3.5 8.4l3 3 6-6.6"/>',
  pin: '<path d="M8 14.5s5-4.6 5-8.3a5 5 0 1 0-10 0c0 3.7 5 8.3 5 8.3Z"/><circle cx="8" cy="6.2" r="1.7"/>',
  alert: '<path d="M8 2.2 14.8 13.8H1.2Z"/><path d="M8 6.6v3.2M8 11.7v.1"/>',
  external: '<path d="M5 11 11 5M6 5h5v5"/>',
  back: '<path d="M13 8H3M7 4 3 8l4 4"/>',
  close: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
};

/** SVG ikona podľa mena; `cls` = trieda navyše. Neznáme meno = ''. */
function icon(name, cls = '') {
  const p = PATHS[name];
  if (!p) return '';
  return `<svg class="ico ico-${name}${cls ? ` ${cls}` : ''}" width="1em" height="1em" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
}

module.exports = { icon, PATHS };
