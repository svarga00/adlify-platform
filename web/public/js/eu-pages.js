/* ==========================================================================
   punds.eu — správanie stránok webu pre firmy
   Počítadlo osôb (− / +) v dopyte a text tlačidla podľa počtu
   („Anfrage für 3 Schweißer senden →"). Čipy a prepínač sú čisté CSS.
   ========================================================================== */
(function () {
  'use strict';
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  $$('[data-step]').forEach(function (box) {
    var input = box.querySelector('input');
    var form = box.closest('form');
    var btn = form && form.querySelector('[data-cta-many]');
    var min = Number(input.min) || 1, max = Number(input.max) || 99;
    function label() {
      if (!btn || btn.disabled) return;
      var n = Math.round(Number(input.value)) || 0;
      btn.textContent = n === 1 ? btn.getAttribute('data-cta-one') : btn.getAttribute('data-cta-many').replace('{n}', n > 0 ? n : '…');
    }
    $$('button[data-d]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var n = (Math.round(Number(input.value)) || 0) + Number(b.getAttribute('data-d'));
        input.value = String(Math.min(max, Math.max(min, n)));
        label();
      });
    });
    input.addEventListener('input', label);
    input.addEventListener('change', function () {
      var v = Math.round(Number(input.value));
      if (input.value !== '' && (isNaN(v) || v < min || v > max)) input.value = String(Math.min(max, Math.max(min, v || min)));
      label();
    });
    label();
  });
})();
