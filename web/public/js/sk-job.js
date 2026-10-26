/* ==========================================================================
   punds.sk — detail ponuky: kalkulačka zárobku, odkazy na zdieľanie
   Spodná lišta a panel s prihláškou idú cez site.js (data-sheet-open).
   ========================================================================== */
(function () {
  'use strict';
  var P = window.PUNDS || {};
  var LOC = { sk: 'sk-SK', cz: 'cs-CZ', hu: 'hu-HU', de: 'de-DE', en: 'en-GB' }[P.lang] || 'sk-SK';
  var fmt = function (n) { return Number(n).toLocaleString(LOC); };

  // ── Kalkulačka: hodiny × týždne × sadzba ───────────────────────────────
  var calc = document.querySelector('[data-calc]');
  if (calc) {
    var rmin = +calc.getAttribute('data-rmin'), rmax = +calc.getAttribute('data-rmax');
    var unit = calc.getAttribute('data-unit'), rate = calc.getAttribute('data-rate');
    var h = calc.querySelector('[data-in="h"]'), w = calc.querySelector('[data-in="w"]');
    var out = function (k) { return Array.prototype.slice.call(document.querySelectorAll('[data-out="' + k + '"]')); };
    var update = function () {
      var hv = +h.value, wv = +w.value, tot = hv * wv;
      out('h').forEach(function (e) { e.textContent = hv + ' h'; });
      out('w').forEach(function (e) { e.textContent = wv; });
      out('sum').forEach(function (e) { e.textContent = fmt(tot * rmin) + ' – ' + fmt(tot * rmax) + ' €'; });
      out('tot').forEach(function (e) { e.textContent = fmt(tot).replace(/ /g, ' ') + ' ' + unit + ' × ' + rate; });
    };
    h.addEventListener('input', update);
    w.addEventListener('input', update);
  }

  // ── Zdieľanie: adresa tejto stránky (bez parametrov) ───────────────────
  var here = location.origin + location.pathname;
  var fb = document.querySelector('[data-share="fb"]'), wa = document.querySelector('[data-share="wa"]');
  if (fb) fb.href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(here);
  if (wa) wa.href = 'https://wa.me/?text=' + encodeURIComponent((wa.getAttribute('data-text') || document.title) + ' ' + here);
  var cp = document.querySelector('[data-copy]');
  if (cp) cp.setAttribute('data-copy', here);
})();
