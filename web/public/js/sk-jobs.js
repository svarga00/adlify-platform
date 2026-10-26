/* ==========================================================================
   punds.sk — zoznam ponúk: filter bez načítania stránky, adresa, mapa
   Dáta: <script type="application/json" id="jobs-data"> (web/sk/pages/jobs.js).
   Karty a riadky mapy vykreslí server; tu sa len skrývajú a radia.
   Počet pri možnosti filtra = ponuky, ktoré spĺňajú všetky OSTATNÉ filtre.
   ========================================================================== */
(function () {
  'use strict';
  var el = document.getElementById('jobs-data');
  if (!el) return;
  var D;
  try { D = JSON.parse(el.textContent); } catch (e) { return; }
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var S = D.state, J = D.jobs, t = D.t, MIN = D.min;
  var root = $('.jl');

  // ── Pomocníky ──────────────────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function plural(n) {
    var f = D.forms, k = Math.abs(n);
    if (D.lang === 'sk' || D.lang === 'cz') return k === 1 ? f[0] : (k >= 2 && k <= 4 ? f[1] : f[2] || f[1]);
    if (D.lang === 'hu') return f[0];
    return k === 1 ? f[0] : f[f.length - 1];
  }
  var jobsN = function (n) { return n + ' ' + plural(n); };
  var from = function (n) { return t.from.replace('{n}', n); };
  var ts = function (d) { return d ? (Date.parse(d) || 0) : 0; };
  function has(list, v) { return list.indexOf(v) !== -1; }

  function match(j, skip) {
    return (skip === 'prof' || !S.prof.length || has(S.prof, j.prof))
      && (skip === 'city' || !S.city.length || has(S.city, j.city))
      && (skip === 'now' || !S.now || j.now)
      && (skip === 'min' || S.min <= MIN || (j.rmax != null && j.rmax >= S.min));
  }
  function sortJobs(list) {
    var by = {
      'new': function (a, b) { return ts(b.pub) - ts(a.pub) || a.i - b.i; },
      rate: function (a, b) { return (b.rmax || 0) - (a.rmax || 0) || (b.rmin || 0) - (a.rmin || 0) || a.i - b.i; },
      start: function (a, b) { return (b.now ? 1 : 0) - (a.now ? 1 : 0) || ts(a.sd) - ts(b.sd) || a.i - b.i; },
    }[S.sort] || function (a, b) { return a.i - b.i; };
    return list.slice().sort(by);
  }

  // ── Adresa ─────────────────────────────────────────────────────────────
  function query() {
    var q = [], enc = encodeURIComponent;
    if (S.prof.length) q.push('prof=' + S.prof.map(enc).join(','));
    if (S.city.length) q.push('city=' + S.city.map(enc).join(','));
    if (S.now) q.push('now=1');
    if (S.min > MIN) q.push('min=' + S.min);
    if (S.sort !== 'new') q.push('sort=' + S.sort);
    if (S.view === 'map') q.push('view=map');
    if (S.view === 'map' && S.mapcity) q.push('mapcity=' + enc(S.mapcity));
    return q.length ? '?' + q.join('&') : '';
  }
  function syncUrl() {
    try { history.replaceState(null, '', location.pathname + query() + location.hash); } catch (e) { /* súbor:// a pod. */ }
  }

  // ── Vykreslenie ────────────────────────────────────────────────────────
  var cards = {}, rows = {};
  $$('[data-card]', root).forEach(function (c) { cards[c.getAttribute('data-card')] = c; });
  $$('[data-mrow]', root).forEach(function (r) { rows[r.getAttribute('data-mrow')] = r; });
  var grid = $('[data-list]', root), empty = $('[data-empty]', root);
  var mapList = $('.jl-maplist', root);

  function chipsData() {
    var a = [];
    S.prof.forEach(function (k) { a.push({ rm: 'prof:' + k, t: D.profs[k] || k }); });
    S.city.forEach(function (k) { a.push({ rm: 'city:' + k, t: '📍 ' + k }); });
    if (S.now) a.push({ rm: 'now', t: t.now });
    if (S.min > MIN) a.push({ rm: 'min', t: from(S.min) });
    return a;
  }
  function chipHtml(list, cls) {
    return list.map(function (x) {
      return '<button type="button" class="' + cls + '" data-rm="' + esc(x.rm) + '" aria-label="' + esc(t.remove + ': ' + x.t) + '">' + esc(x.t) + '<span aria-hidden="true">×</span></button>';
    }).join('');
  }

  function render(opts) {
    opts = opts || {};
    var L = sortJobs(J.filter(function (j) { return match(j); }));
    var vis = {};
    L.forEach(function (j) { vis[j.i] = true; });

    // Karty: skryť / zobraziť a zoradiť
    sortJobs(J).forEach(function (j) {
      var c = cards[j.i];
      if (!c) return;
      c.hidden = !vis[j.i];
      grid.insertBefore(c, empty);
    });
    empty.hidden = L.length > 0;

    // Možnosti filtra (zaškrtnutie + počty)
    $$('[data-opt]', root.parentNode).forEach(function (o) {
      var f = o.getAttribute('data-opt'), v = o.getAttribute('data-v');
      var on = has(S[f], v);
      var n = J.filter(function (j) { return j[f] === v && match(j, f); }).length;
      var inp = o.querySelector('input');
      if (inp) inp.checked = on;
      o.classList.toggle('on', on && o.classList.contains('fch'));
      o.classList.toggle('dim', !n && !on);
      var ne = o.querySelector('[data-n]');
      if (ne) ne.textContent = n;
    });
    $$('input[data-f="now"]').forEach(function (r) {
      var on = (r.value === '1') === S.now;
      r.checked = on;
      r.parentNode.classList.toggle('on', on);
    });
    $$('input[data-f="min"]').forEach(function (r) { if (+r.value !== S.min) r.value = S.min; });
    $$('[data-minlabel]').forEach(function (m) { m.textContent = S.min <= MIN ? t.noLimit : from(S.min) + ' ' + t.perH; });
    $$('select[data-f="sort"]').forEach(function (s) { s.value = S.sort; });

    // Aktívne filtre
    var chips = chipsData();
    var dc = $('[data-chips]', root); if (dc) dc.innerHTML = chipHtml(chips, 'jl-chip');
    var mc = $('[data-mchips]', root);
    if (mc) {
      mc.innerHTML = chips.length ? chipHtml(chips, 'jl-mchip') : (D.quick || []).map(function (q) {
        return '<button type="button" class="jl-qchip" data-quick="' + esc(q.q) + '">' + esc(q.t) + '</button>';
      }).join('');
    }
    var badge = $('[data-fbadge]', root);
    if (badge) { badge.hidden = !chips.length; badge.textContent = chips.length; }
    $$('.jl-filter [data-reset]', root).forEach(function (b) { b.classList.toggle('off', !chips.length); });

    // Počty
    $$('[data-count]', root).forEach(function (c) { c.textContent = jobsN(L.length); });
    $$('[data-showlabel]').forEach(function (b) { b.textContent = t.show.replace('{s}', jobsN(L.length)); });

    // Prepínač zobrazenia
    var isMap = S.view === 'map';
    grid.hidden = isMap;
    $('[data-mapview]', root).hidden = !isMap;
    $$('[data-view]', root).forEach(function (b) {
      var on = b.getAttribute('data-view') === S.view;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });

    // Mapa: mesto, ktoré už nemá ponuky, sa zruší
    if (S.mapcity && !L.some(function (j) { return j.city === S.mapcity; })) S.mapcity = null;
    var ml = S.mapcity ? L.filter(function (j) { return j.city === S.mapcity; }) : L;
    var mv = {};
    ml.forEach(function (j) { mv[j.i] = true; });
    L.forEach(function (j) { var r = rows[j.i]; if (r) mapList.appendChild(r); });
    J.forEach(function (j) {
      var r = rows[j.i];
      if (!r) return;
      r.hidden = !mv[j.i];
      r.classList.toggle('hl', !!S.mapcity && j.city === S.mapcity);
    });
    $('[data-maptitle]', root).textContent = S.mapcity ? S.mapcity + ' · ' + jobsN(ml.length) : t.mapAll;
    $('[data-mapall]', root).hidden = !S.mapcity;
    if (isMap) syncMap(L, opts.fit !== false);

    syncUrl();
  }

  // ── Mapa (Leaflet + CARTO) ─────────────────────────────────────────────
  var map = null, layer = null, lastKey = null, lastFit = null, markers = [];
  // Blízke mestá (Ulm – Augsburg): prekrývajúce sa značky sa rozostúpia —
  // západná ide doľava od bodu, východná doprava.
  function declutter() {
    if (!map) return;
    var items = markers.map(function (g) {
      var mk = g.m.getElement() && g.m.getElement().querySelector('.mk');
      if (!mk) return null;
      mk.classList.remove('l', 'r');
      var p = map.latLngToContainerPoint(g.ll);
      return { mk: mk, x: p.x, y: p.y, w: mk.querySelector('.mk-pill').offsetWidth };
    }).filter(Boolean).sort(function (a, b) { return a.x - b.x; });
    for (var i = 0; i < items.length; i++) {
      for (var k = i + 1; k < items.length; k++) {
        var a = items[i], b = items[k];
        if (Math.abs(a.y - b.y) < 36 && (b.x - a.x) < (a.w + b.w) / 2 + 6) { a.mk.classList.add('l'); b.mk.classList.add('r'); }
      }
    }
  }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function syncMap(L, fit) {
    var Lf = window.L, box = document.getElementById('jl-map');
    if (!Lf || !box) return;
    if (!map) {
      map = Lf.map(box, { scrollWheelZoom: false, zoomControl: true, zoomAnimation: !reduce, fadeAnimation: !reduce, markerZoomAnimation: !reduce });
      Lf.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 18 }).addTo(map);
      map.setView([51.1, 10.4], 6);
      layer = Lf.layerGroup().addTo(map);
      setTimeout(function () { if (map) map.invalidateSize(); }, 60);
      map.on('zoomend', declutter);
    } else map.invalidateSize();

    var groups = [], seen = {};
    L.forEach(function (j) {
      if (j.lat == null || j.lng == null) return;
      if (!seen[j.city]) { seen[j.city] = { city: j.city, n: 0, ll: [j.lat, j.lng] }; groups.push(seen[j.city]); }
      seen[j.city].n++;
    });
    var key = JSON.stringify(groups.map(function (g) { return [g.city, g.n, g.city === S.mapcity]; }));
    if (key !== lastKey) {
      lastKey = key;
      layer.clearLayers();
      groups.forEach(function (g) {
        var on = g.city === S.mapcity;
        var html = '<div class="mk' + (on ? ' on' : '') + '"><div class="mk-pill">' + esc(g.city) + '<span>' + g.n + '</span></div><div class="mk-stem"></div><div class="mk-dot"></div></div>';
        var m = Lf.marker(g.ll, { icon: Lf.divIcon({ className: 'mk-ico', html: html, iconSize: [0, 0], iconAnchor: [0, -6] }), title: g.city + ' (' + g.n + ')', alt: g.city, riseOnHover: true, zIndexOffset: on ? 1000 : 0 });
        m.on('click', function () { S.mapcity = S.mapcity === g.city ? null : g.city; render({ fit: false }); });
        m.on('keypress', function (e) { if (e.originalEvent && (e.originalEvent.key === 'Enter' || e.originalEvent.key === ' ')) m.fire('click'); });
        m.addTo(layer);
        g.m = m;
      });
      markers = groups;
    }
    var fitKey = JSON.stringify(groups.map(function (g) { return g.city; }));
    if (fit && fitKey !== lastFit) {
      lastFit = fitKey;
      if (groups.length) map.fitBounds(groups.map(function (g) { return g.ll; }), { padding: [60, 60], maxZoom: 9, animate: !reduce });
      else map.setView([51.1, 10.4], 6);
    }
    declutter();
  }

  // ── Udalosti ───────────────────────────────────────────────────────────
  function reset() { S.prof = []; S.city = []; S.now = false; S.min = MIN; S.mapcity = null; }
  document.addEventListener('change', function (e) {
    var f = e.target.getAttribute && e.target.getAttribute('data-f');
    if (!f || !root.parentNode.contains(e.target)) return;
    if (f === 'prof' || f === 'city') {
      // Stav podľa zaškrtnutia (dve sady políčok: bočný filter aj spodný panel)
      var v = e.target.value;
      S[f] = S[f].filter(function (x) { return x !== v; });
      if (e.target.checked) S[f].push(v);
      S.mapcity = null;
    } else if (f === 'now') { if (!e.target.checked) return; S.now = e.target.value === '1'; S.mapcity = null; }
    else if (f === 'min') { S.min = +e.target.value; S.mapcity = null; }
    else if (f === 'sort') S.sort = e.target.value;
    render();
  });
  document.addEventListener('input', function (e) {
    if (e.target.getAttribute && e.target.getAttribute('data-f') === 'min') { S.min = +e.target.value; S.mapcity = null; render(); }
  });
  document.addEventListener('click', function (e) {
    var b;
    if ((b = e.target.closest('[data-rm]'))) {
      var rm = b.getAttribute('data-rm'), p = rm.indexOf(':');
      if (rm === 'now') S.now = false;
      else if (rm === 'min') S.min = MIN;
      else S[rm.slice(0, p)] = S[rm.slice(0, p)].filter(function (x) { return x !== rm.slice(p + 1); });
      S.mapcity = null; render();
    } else if ((b = e.target.closest('[data-quick]'))) {
      var q = b.getAttribute('data-quick');
      if (q === 'now') S.now = true;
      else if (q.indexOf('min:') === 0) S.min = +q.slice(4);
      else if (q.indexOf('prof:') === 0 && !has(S.prof, q.slice(5))) S.prof.push(q.slice(5));
      render();
    } else if ((b = e.target.closest('[data-reset]'))) {
      e.preventDefault(); reset(); render();
    } else if ((b = e.target.closest('[data-view]'))) {
      e.preventDefault();
      S.view = b.getAttribute('data-view');
      if (S.view !== 'map') S.mapcity = null;
      render();
    } else if ((b = e.target.closest('[data-mapall]'))) {
      S.mapcity = null; render({ fit: false });
    }
  });

  // Prvé vykreslenie: server už vykreslil všetko; JS doplní mapu.
  if (S.view === 'map') render();
})();
