/* ==========================================================================
   punds web — spoločné správanie stránok (oba weby)
   Hlavička (jazyk, mega menu, mobilné menu), animácie pri posúvaní,
   formuláre (prihláška, dopyt, kontakt), zdieľanie, výsuvné panely.
   Bez knižníc. Texty hlásení sú v window.PUNDS.t (podľa jazyka).
   ========================================================================== */
(function () {
  'use strict';
  var P = window.PUNDS || { t: {}, api: '/api' };
  var T = P.t || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ── Výber jazyka ───────────────────────────────────────────────────────
  $$('[data-dropdown]').forEach(function (dd) {
    var btn = dd.querySelector('button');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !dd.classList.contains('open');
      closeAll();
      dd.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  });
  function closeAll() {
    $$('[data-dropdown].open').forEach(function (d) { d.classList.remove('open'); d.querySelector('button').setAttribute('aria-expanded', 'false'); });
  }
  document.addEventListener('click', function (e) { if (!e.target.closest('[data-dropdown]')) closeAll(); });

  // ── Mega menu (desktop: na prejdenie myšou aj na klik) ─────────────────
  var hdr = $('[data-header]'), mega = $('[data-mega]'), mbtn = $('[data-mega-btn]');
  function megaShow(on) {
    if (!mega || !mbtn) return;
    mega.hidden = !on;
    mbtn.setAttribute('aria-expanded', String(on));
  }
  if (mega && mbtn) {
    var hover = window.matchMedia('(hover: hover) and (min-width: 1024px)');
    mbtn.addEventListener('click', function () { megaShow(mega.hidden); closeAll(); });
    mbtn.addEventListener('mouseenter', function () { if (hover.matches) { megaShow(true); closeAll(); } });
    mega.addEventListener('mouseenter', function () { if (hover.matches) megaShow(true); });
    hdr.addEventListener('mouseleave', function () { if (hover.matches) megaShow(false); });
    $$('.nav-a:not([data-mega-btn])', hdr).forEach(function (a) { a.addEventListener('mouseenter', function () { if (hover.matches) megaShow(false); }); });
    document.addEventListener('click', function (e) { if (!e.target.closest('[data-header]')) megaShow(false); });
  }

  // ── Mobilné menu ───────────────────────────────────────────────────────
  var burger = $('[data-burger]'), mnav = $('[data-mnav]');
  if (burger && mnav) {
    burger.addEventListener('click', function () {
      var open = mnav.hidden;
      mnav.hidden = !open;
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? (T.close || 'Close') : (T.menu || 'Menu'));
      document.body.classList.toggle('menu-open', open);
    });
    // Odkaz v menu (aj na kotvu na tej istej stránke) menu zavrie.
    mnav.addEventListener('click', function (e) { if (e.target.closest('a') && !mnav.hidden) burger.click(); });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    closeAll(); megaShow(false);
    if (mnav && !mnav.hidden) burger.click();
    closeSheets();
  });

  // ── Animácie pri posúvaní ──────────────────────────────────────────────
  var rv = $$('.rv');
  if (rv.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    rv.forEach(function (el) { io.observe(el); });
  } else rv.forEach(function (el) { el.classList.add('in'); });

  // ── Výsuvné panely (mobil: filter, prihláška) ──────────────────────────
  function closeSheets() { $$('.sheet-wrap.sheet-open').forEach(function (w) { w.classList.remove('sheet-open'); setTimeout(function () { w.hidden = true; }, 350); }); document.body.classList.remove('menu-open'); }
  document.addEventListener('click', function (e) {
    var o = e.target.closest('[data-sheet-open]');
    if (o) {
      var w = document.getElementById(o.getAttribute('data-sheet-open'));
      if (w) { e.preventDefault(); w.hidden = false; requestAnimationFrame(function () { w.classList.add('sheet-open'); }); document.body.classList.add('menu-open'); }
      return;
    }
    if (e.target.closest('[data-sheet-close]') || e.target.classList.contains('sheet-back')) closeSheets();
  });
  window.PundsSheets = { close: closeSheets };

  // ── Otázky: vždy otvorená len jedna ────────────────────────────────────
  $$('[data-acc-group]').forEach(function (g) {
    $$('details', g).forEach(function (d) {
      d.addEventListener('toggle', function () { if (d.open) $$('details', g).forEach(function (o) { if (o !== d) o.open = false; }); });
    });
  });

  // ── Kopírovať odkaz ────────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var c = e.target.closest('[data-copy]');
    if (!c) return;
    e.preventDefault();
    var url = c.getAttribute('data-copy') || location.href;
    var done = function () { var l = c.querySelector('[data-copy-label]') || c; var o = l.textContent; l.textContent = T.copied || 'Copied ✓'; setTimeout(function () { l.textContent = o; }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, done); else done();
  });

  // ── Formuláre ──────────────────────────────────────────────────────────
  // <form data-form="apply|enquiry|contact"> … <template data-ok>…</template>
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function validate(f) {
    var bad = null;
    $$('.err-msg', f).forEach(function (m) { m.remove(); });
    $$('.field-err', f).forEach(function (x) { x.classList.remove('field-err'); });
    $$('input, textarea, select', f).forEach(function (el) {
      if (el.type === 'hidden' || el.closest('.hp')) return;
      var v = (el.value || '').trim(), msg = '';
      if (el.required && el.type === 'checkbox' && !el.checked) msg = T.consent;
      else if (el.required && !v && el.type !== 'checkbox') msg = T.required;
      else if (v && el.type === 'email' && !EMAIL.test(v)) msg = T.email;
      else if (v && el.type === 'tel' && v.replace(/[^\d]/g, '').length < 7) msg = T.phone;
      if (msg) {
        var target = el.type === 'checkbox' ? el.closest('label') || el : el;
        el.classList.add('field-err');
        var m = document.createElement('div'); m.className = 'err-msg'; m.textContent = msg;
        target.insertAdjacentElement('afterend', m);
        bad = bad || el;
      }
    });
    if (bad) bad.focus();
    return !bad;
  }
  $$('form[data-form]').forEach(function (f) {
    f.setAttribute('novalidate', '');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate(f)) return;
      var btn = f.querySelector('[type=submit]'), label = btn ? btn.innerHTML : '';
      var data = {};
      $$('input, textarea, select', f).forEach(function (el) {
        if (!el.name) return;
        if (el.type === 'checkbox') {
          if (el.name.slice(-2) === '[]') { var k = el.name.slice(0, -2); data[k] = data[k] || []; if (el.checked) data[k].push(el.value); }
          else data[el.name] = el.checked;
        } else if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
        else data[el.name] = el.value;
      });
      data.lang = P.lang; data.page = location.pathname;
      var msg = f.querySelector('.form-msg'); if (msg) msg.textContent = '';
      if (btn) { btn.disabled = true; btn.textContent = T.sending || '…'; }
      fetch(P.api + '/' + f.getAttribute('data-form'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok && j.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error((res.j && res.j.error) || 'error');
          var tpl = f.querySelector('template[data-ok]');
          var box = document.createElement('div');
          box.className = 'form-ok'; box.setAttribute('role', 'status'); box.setAttribute('tabindex', '-1');
          box.innerHTML = tpl ? tpl.innerHTML : '<div class="ok-ico">✓</div>';
          f.replaceWith(box); box.focus();
          document.dispatchEvent(new CustomEvent('punds:sent', { detail: { form: f.getAttribute('data-form') } }));
        })
        .catch(function () {
          if (btn) { btn.disabled = false; btn.innerHTML = label; }
          if (msg) msg.textContent = T.error; else alert(T.error);
        });
    });
  });
})();
