// ============================================================================
// DANUBRA — sprievodca pre nového kolegu (bubliny nad appkou)
// ============================================================================
// Návod (Dnes → Návod) sa číta. Toto sa **ukazuje**: stmaví sa obrazovka,
// zostane svietiť jedno miesto — položka menu, tlačidlo, vyhľadávanie — a pri
// ňom bublina s dvomi vetami, čo to je. Kto appku otvorí prvýkrát, nemusí
// vedieť, kde čo hľadať; po siedmich krokoch to vie.
//
// Kroky sú v `lib/guide.js` (`DanubraGuide.TOUR`): `{ selector, route, title,
// text }`. Kým tam nie sú, platí krátky zoznam nižšie (`FALLBACK`).
//
// Pravidlá:
// - Sám sa spustí **len raz** na človeka a zariadenie (`maybeAutoStart`), len
//   na počítači a tablete (od 700 px) a nikdy cez otvorené okno.
// - Keď prvok na obrazovke nie je, krok sa preskočí. Keď je, ale je skrytý
//   (na telefóne nie je horný pruh), ukáže sa bublina v strede bez výrezu.
// - Na telefóne a tablete je ľavé menu vysúvacie — pre kroky v menu sa
//   vysunie samo a na konci sa zasunie.
// - Esc = preskočiť, šípky = späť a ďalej. Fokus zostáva v bubline.
// ============================================================================
(function () {
  const KEY = 'danubra_tour_done_';
  const NARROW = 860;          // pod týmto je ľavé menu vysúvacie (app.css)
  const AUTO_MIN_W = 700;      // na telefóne sa sám nespúšťa
  const GAP = 14;              // medzera medzi výrezom a bublinou
  const PAD = 6;               // o koľko je výrez väčší než prvok
  const M = 12;                // okraj obrazovky

  // Náhradné kroky. Každý ukazuje na prvok, ktorý v appke naozaj je; pri
  // tlačidlách z horného pruhu je za čiarkou ich obdoba z mobilnej hlavičky.
  const FALLBACK = [
    { selector: '#sidebar-nav .nav-item[data-key="dashboard"]', route: null,
      title: 'Dnes — tu začína každý deň',
      text: 'Prehľad ukáže, čo treba dnes spraviť, čo horí a či bude na výplaty. Keď neviete, kde začať, kliknite sem.' },
    { selector: '#sidebar-nav .nav-item[data-key="subcontracts"]', route: null,
      title: 'Zákazky',
      text: 'Každá stavba v Nemecku je jedna zákazka. Pri nej je **sedem krokov pod sebou** — od zmluvy po faktúru — a pri každom tlačidlo na to, čo treba spraviť.' },
    { selector: '#sidebar-nav .nav-item[data-key="workers"]', route: null,
      title: 'Ľudia',
      text: 'Kartotéka živnostníkov: doklady, sadzby a fakturačné údaje. Odtiaľto sa dostanete aj k náboru a kandidátom.' },
    { selector: '#sidebar-nav .nav-item[data-key="money"]', route: null,
      title: 'Fakturácia',
      text: 'Všetko o peniazoch na jednom mieste: vydané a prijaté faktúry, zálohy a banka. Žiadna faktúra neodíde bez schválenia.' },
    { selector: '.mega-btn, #btn-menu', route: null,
      title: 'Všetko',
      text: 'Ak niečo v menu nevidíte, kliknite sem. Ukážu sa všetky obrazovky naraz, pri každej jedna veta o tom, čo na nej nájdete.' },
    { selector: '#btn-papers, #btn-papers-m', route: null,
      title: 'Papiere na dva kliky',
      text: 'Súhlas GDPR, zmluva, objednávka či infolist: vyberiete papier, vyberiete človeka a údaje sa doplnia samy.' },
    { selector: '#btn-help, #btn-help-m', route: null,
      title: 'Otáznik — keď si nie ste istý',
      text: 'Pri čísle alebo tlačidle, ktorému nerozumiete, hľadajte otáznik. Tu hore je zoznam všetkých vysvetliviek — a odtiaľ spustíte tohto sprievodcu aj znova.' },
  ];

  // Tlačidlá horného pruhu majú na telefóne svoju obdobu v mobilnej hlavičke.
  // Kroky z `lib/guide.js` píšu selektor pre počítač — tu je preklad.
  const MOBILE_ALT = {
    '.mega-btn': '#btn-menu',
    '#btn-papers': '#btn-papers-m',
    '#btn-help': '#btn-help-m',
    '.searchbox': '.mh-search',
    '#global-search': '.mh-search',
    '.bell-wrap': '#bell-slot-m',
    '#bell-slot': '#bell-slot-m',
  };

  const S = {
    on: false, steps: [], i: 0, seq: 0, el: null, center: false, shown: 0,
    root: null, card: null, spot: null, drawer: false, prevFocus: null,
    appInert: false, raf: 0, autoPending: false, autoT: 0,
  };

  // ── Pomocníci ─────────────────────────────────────────────────────────────
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const frame = () => new Promise(r => (window.requestAnimationFrame || setTimeout)(() => r()));
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const narrow = () => window.innerWidth <= NARROW;
  const esc = (s) => (window.UI ? UI.esc(s) : String(s == null ? '' : s));
  const ico = (name, size) => (window.Icon && (!Icon.has || Icon.has(name)) ? Icon(name, size) : '');

  function userId() {
    const u = window.Danubra && Danubra.user;
    if (!u) return '';
    return String(u.id || u.email || 'anon');
  }

  /** Text kroku: odstavce po prázdnom riadku, `**tučné**`, zvyšok zneškodnený. */
  function fmt(text) {
    const parts = Array.isArray(text) ? text : String(text || '').split(/\n\s*\n/);
    return parts.filter(p => String(p).trim()).map(p =>
      `<p>${esc(String(p).trim()).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`).join('');
  }

  async function waitFor(fn, ms) {
    const t0 = Date.now();
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() - t0 >= ms) return null;
      await sleep(60);
    }
  }

  /** Je prvok vidieť? Skrytý predok (`display:none`, `[hidden]`) = nie. */
  function shown(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest && el.closest('[hidden]')) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function query(sel) {
    try { return Array.from(document.querySelectorAll(sel)); } catch { return []; }
  }

  /**
   * Nájde prvok kroku.
   * @returns {{el: Element|null}|null}  `{el}` = ukáž pri ňom; `{el:null}` =
   *   prvok je, ale skrytý, takže bublina v strede; `null` = krok preskoč.
   */
  function resolve(sel) {
    if (!sel) return { el: null };
    const all = query(sel);
    const hit = all.find(shown);
    if (hit) return { el: hit };
    const alt = MOBILE_ALT[String(sel).trim()];
    if (alt) {
      const a = query(alt).find(shown);
      if (a) return { el: a };
    }
    return all.length ? { el: null } : null;
  }

  function blocked() {
    return !!document.querySelector('#ui-modal, #ui-ask, #mega, .modal-backdrop, .fatal')
      || !!(document.getElementById('app') || {}).hidden;
  }

  // ── Ľavé menu na telefóne a tablete ───────────────────────────────────────
  async function openDrawer() {
    const sb = document.querySelector('.sidebar');
    if (!sb || sb.classList.contains('open')) return;
    sb.classList.add('open');
    S.drawer = true;
    await sleep(reduced() ? 30 : 260);   // vysunutie trvá .22 s (app.css)
  }
  function closeDrawer() {
    if (!S.drawer) return;
    document.querySelector('.sidebar')?.classList.remove('open');
    S.drawer = false;
  }

  function bringIntoView(el) {
    // Horný pruh a hlavička sú prilepené — tie sú vidieť vždy.
    if (el.closest('.topbar, .mobile-head, .bottom-nav')) return;
    const r = el.getBoundingClientRect();
    const top = el.closest('.sidebar') ? 0 : 64;   // pod prilepeným pruhom
    if (r.top >= top && r.bottom <= window.innerHeight - M && r.left >= 0 && r.right <= window.innerWidth) return;
    try { el.scrollIntoView({ block: el.closest('.sidebar') ? 'nearest' : 'center', inline: 'nearest' }); }
    catch { el.scrollIntoView(); }
  }

  async function toRoute(route) {
    const D = window.Danubra;
    if (!D || D.route === route) return;
    D.go(route);
    await waitFor(() => D.route === route, 1000);
    try { await D._routeReady; } catch { /* obrazovka si chybu ukáže sama */ }
    await frame();
  }

  // ── Kostra ────────────────────────────────────────────────────────────────
  function mount() {
    const root = document.createElement('div');
    root.id = 'tour';
    root.className = 'tour no-print';
    root.innerHTML = `
      <div class="tour-block"></div>
      <div class="tour-spot" aria-hidden="true"></div>
      <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title"
        aria-describedby="tour-text" tabindex="-1"></div>`;
    document.body.appendChild(root);
    S.root = root;
    S.card = root.querySelector('.tour-card');
    S.spot = root.querySelector('.tour-spot');
    S.card.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tour]');
      if (!b || b.disabled) return;
      const what = b.dataset.tour;
      if (what === 'next') Tour.next();
      else if (what === 'back') Tour.back();
      else if (what === 'skip') Tour.skip();
    });
    // Klik mimo bubliny nič nespraví — len vráti fokus do bubliny. Inak by
    // sa dalo omylom kliknúť na appku pod ňou a sprievodca by ukazoval do prázdna.
    root.querySelector('.tour-block').addEventListener('click', () => focusMain());
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);

    const app = document.getElementById('app');
    if (app) { S.appInert = !!app.inert; app.inert = true; }
  }

  function unmount() {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onScroll, true);
    if (S.raf) cancelAnimationFrame(S.raf);
    S.raf = 0;
    const app = document.getElementById('app');
    if (app) app.inert = S.appInert;
    S.root?.remove();
    S.root = S.card = S.spot = null;
    S.el = null;
    closeDrawer();
  }

  function render(step, i) {
    const n = S.steps.length;
    const last = i >= n - 1;
    S.card.innerHTML = `
      <span class="tour-arrow" aria-hidden="true"></span>
      <div class="tour-head">
        <span class="tour-count">Krok ${i + 1} z ${n}</span>
        <span class="tour-bar" aria-hidden="true"><span style="width:${Math.round(((i + 1) / n) * 100)}%"></span></span>
      </div>
      <div aria-live="polite">
        <h3 id="tour-title">${esc(step.title || '')}</h3>
        <div id="tour-text" class="tour-text">${fmt(step.text)}</div>
      </div>
      <div class="tour-foot">
        <button type="button" class="tour-skip" data-tour="skip">Preskočiť sprievodcu</button>
        <span class="tour-nav">
          <button type="button" class="btn btn-ghost btn-sm" data-tour="back"${i === 0 ? ' disabled' : ''}>
            ${ico('back', 13)} Späť</button>
          <button type="button" class="btn btn-primary btn-sm" data-tour="next">
            ${last ? `${ico('check', 14)} Hotovo` : `Ďalej ${ico('chevron', 13)}`}</button>
        </span>
      </div>`;
  }

  function focusMain() {
    const b = S.card && S.card.querySelector('[data-tour="next"]');
    if (b) { try { b.focus({ preventScroll: true }); } catch { b.focus(); } }
  }

  // ── Umiestnenie ───────────────────────────────────────────────────────────
  function place() {
    const card = S.card, spot = S.spot;
    if (!card) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = card.offsetWidth, h = card.offsetHeight;
    const clampX = (x) => Math.min(Math.max(M, x), vw - w - M);
    const clampY = (y) => Math.min(Math.max(M, y), vh - h - M);

    if (!S.el || !shown(S.el)) {
      S.root.classList.add('is-center');
      card.dataset.side = 'center';
      card.style.left = `${Math.max(M, (vw - w) / 2)}px`;
      card.style.top = `${Math.max(M, (vh - h) / 2)}px`;
      return;
    }
    S.root.classList.remove('is-center');

    const r = S.el.getBoundingClientRect();
    // Výrez sa drží v obrazovke — pri vysokom prvku by inak trčal za okraj.
    const s = {
      left: Math.max(2, r.left - PAD), top: Math.max(2, r.top - PAD),
      right: Math.min(vw - 2, r.right + PAD), bottom: Math.min(vh - 2, r.bottom + PAD),
    };
    s.width = Math.max(0, s.right - s.left); s.height = Math.max(0, s.bottom - s.top);
    Object.assign(spot.style, {
      left: `${s.left}px`, top: `${s.top}px`, width: `${s.width}px`, height: `${s.height}px`,
    });

    const cx = s.left + s.width / 2, cy = s.top + s.height / 2;
    const cand = {
      right:  () => ({ x: s.right + GAP, y: clampY(cy - h / 2), ok: s.right + GAP + w <= vw - M }),
      left:   () => ({ x: s.left - GAP - w, y: clampY(cy - h / 2), ok: s.left - GAP - w >= M }),
      bottom: () => ({ x: clampX(cx - w / 2), y: s.bottom + GAP, ok: s.bottom + GAP + h <= vh - M }),
      top:    () => ({ x: clampX(cx - w / 2), y: s.top - GAP - h, ok: s.top - GAP - h >= M }),
    };
    const step = S.steps[S.i] || {};
    const order = ['right', 'bottom', 'left', 'top'];
    if (step.placement && cand[step.placement]) order.unshift(step.placement);

    let side = null, pos = null;
    for (const k of order) { const p = cand[k](); if (p.ok) { side = k; pos = p; break; } }
    if (!pos) {
      // Nikam sa nezmestí (úzky telefón, veľký prvok): bublina sa prilepí
      // k okraju, ktorý je od prvku ďalej.
      side = 'dock';
      pos = { x: clampX((vw - w) / 2), y: cy > vh / 2 ? M : vh - h - M };
    }
    card.dataset.side = side;
    card.style.left = `${pos.x}px`;
    card.style.top = `${pos.y}px`;
    // Šípka mieri na stred prvku, nie na stred bubliny.
    const ax = side === 'top' || side === 'bottom'
      ? Math.min(Math.max(18, cx - pos.x), w - 18)
      : Math.min(Math.max(18, cy - pos.y), h - 18);
    card.style.setProperty('--ax', `${ax}px`);
  }

  function schedule() {
    if (!S.on || S.raf) return;
    S.raf = requestAnimationFrame(() => { S.raf = 0; place(); });
  }
  function onScroll() { schedule(); }
  function onResize() {
    if (!S.on) return;
    // Po zmene šírky môže prvok zmiznúť (z počítača na telefón zmizne horný
    // pruh) alebo sa môže objaviť jeho obdoba — krok sa preto nájde znova.
    const step = S.steps[S.i];
    const now = step && step.selector ? resolve(step.selector) : { el: null };
    if (now && now.el !== S.el) {
      S.el = now.el;
      if (S.el && narrow() && S.el.closest('.sidebar')) openDrawer().then(schedule);
      else if (!narrow()) closeDrawer();
    }
    schedule();
  }

  function onKey(e) {
    if (!S.on) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation(); Tour.skip();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault(); e.stopImmediatePropagation(); Tour.next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault(); e.stopImmediatePropagation(); Tour.back();
    } else if (e.key === 'Tab' && S.card) {
      // Fokus zostáva v bubline — appka pod ňou je `inert`.
      const f = Array.from(S.card.querySelectorAll('button:not([disabled])'));
      if (!f.length) return;
      const at = f.indexOf(document.activeElement);
      e.preventDefault();
      const nxt = e.shiftKey ? (at <= 0 ? f.length - 1 : at - 1) : (at < 0 || at >= f.length - 1 ? 0 : at + 1);
      f[nxt].focus();
    }
  }

  // ── Krok ──────────────────────────────────────────────────────────────────
  async function show(i, dir) {
    const my = ++S.seq;
    const steps = S.steps;
    if (S.card) S.card.classList.add('is-busy');
    while (i >= 0 && i < steps.length) {
      const st = steps[i] || {};
      const D = window.Danubra;
      if (st.route && D) {
        // Obrazovka, na ktorú človek nemá právo alebo je vypnutá, sa preskočí.
        if (D.routeAvailable && !D.routeAvailable(st.route)) { i += dir; continue; }
        await toRoute(st.route);
        if (my !== S.seq) return;
      }
      const hit = st.selector
        ? await waitFor(() => resolve(st.selector), st.route ? 2500 : 300)
        : { el: null };
      if (my !== S.seq) return;
      if (!hit) { i += dir; continue; }

      if (hit.el && narrow() && hit.el.closest('.sidebar')) await openDrawer();
      else closeDrawer();
      if (my !== S.seq || !S.card) return;
      if (hit.el) bringIntoView(hit.el);

      S.i = i; S.el = hit.el; S.shown++;
      render(st, i);
      place();
      S.card.classList.remove('is-busy');
      // Prvé umiestnenie bez animácie — bublina by inak priletela z rohu.
      if (!S.root.classList.contains('is-ready')) requestAnimationFrame(() => S.root && S.root.classList.add('is-ready'));
      focusMain();
      return;
    }
    // Späť z prvého zobrazeného kroku nevedie nikam — zostane sa na ňom.
    if (i < 0) return show(0, 1);
    finish(S.shown > 0);
  }

  function markDone() {
    const id = userId() || 'anon';
    try { localStorage.setItem(KEY + id, new Date().toISOString()); } catch { /* súkromné okno */ }
  }

  /**
   * Koniec. `mark` = zapamätať si, že ho človek videl (dokončil alebo
   * preskočil). Bez `mark` sa nezobrazil ani jeden krok — taký sprievodca
   * sa nepočíta a pri ďalšom prihlásení sa skúsi znova.
   */
  function finish(mark, { quiet = false } = {}) {
    if (!S.on) return;
    S.on = false;
    S.seq++;
    unmount();
    if (mark) markDone();
    const f = S.prevFocus;
    S.prevFocus = null;
    if (f && f.isConnected && f.focus) { try { f.focus({ preventScroll: true }); } catch { /* nič */ } }
    if (!mark && !quiet && window.UI) UI.toast('Sprievodcu sa na tejto obrazovke nepodarilo ukázať.', 'err');
  }

  function stepsFrom(arg) {
    const list = Array.isArray(arg) && arg.length ? arg
      : (window.DanubraGuide && Array.isArray(DanubraGuide.TOUR) && DanubraGuide.TOUR.length
        ? DanubraGuide.TOUR : FALLBACK);
    return list.filter(s => s && typeof s === 'object' && (s.title || s.text));
  }

  // ── Verejné ───────────────────────────────────────────────────────────────
  const Tour = {
    FALLBACK,

    get running() { return S.on; },
    get index() { return S.i; },

    /** Spustí sprievodcu (od prvého kroku). Bez `steps` z `DanubraGuide.TOUR`. */
    start(steps) {
      const list = stepsFrom(steps);
      if (!list.length || typeof document === 'undefined') return false;
      if (S.on) finish(false, { quiet: true });
      clearTimeout(S.autoT); S.autoPending = false;
      // Sprievodca je nad všetkým, ale cez otvorené okno by ukazoval na
      // tlačidlá, ktoré sa nedajú stlačiť. Okno a menu sa preto zavrú.
      if (window.UI) UI.closeModal();
      if (document.getElementById('mega') && window.Danubra) Danubra.toggleMega(false);
      if (window.UI && UI._tipHide) UI._tipHide();
      S.steps = list; S.i = 0; S.shown = 0; S.on = true;
      S.prevFocus = document.activeElement;
      mount();
      show(0, 1);
      return true;
    },

    /** Skok na krok `i` (0 = prvý). Keď sprievodca nebeží, spustí ho. */
    go(i) {
      if (!S.on) this.start();
      const n = Math.max(0, Math.min(S.steps.length - 1, Number(i) || 0));
      return show(n, n >= S.i ? 1 : -1);
    },

    next() {
      if (!S.on) return;
      if (S.i >= S.steps.length - 1) return finish(true);
      return show(S.i + 1, 1);
    },

    back() {
      if (!S.on || S.i <= 0) return;
      return show(S.i - 1, -1);
    },

    /** Preskočiť = už sa sám neukáže. Znova sa dá spustiť z „?" alebo z Návodu. */
    skip() { finish(true); },
    stop() { finish(true); },

    isDone(id) {
      const u = id || userId();
      if (!u) return false;
      try { return !!localStorage.getItem(KEY + u); } catch { return false; }
    },

    /** Zabudne, že ho človek už videl — pri ďalšom prihlásení sa ukáže znova. */
    reset(id) {
      const u = id || userId() || 'anon';
      try { localStorage.removeItem(KEY + u); } catch { /* súkromné okno */ }
    },

    /**
     * Prvé prihlásenie. Volá sa po vykreslení appky pre prihláseného človeka
     * (`Danubra._render`). Spustí sa len raz na človeka a zariadenie, len od
     * 700 px a nikdy cez otvorené okno — kým je okno otvorené, chvíľu počká.
     */
    maybeAutoStart() {
      if (typeof document === 'undefined' || S.on || S.autoPending) return false;
      const id = userId();
      if (!id || this.isDone(id) || window.innerWidth < AUTO_MIN_W) return false;
      S.autoPending = true;
      let tries = 0;
      const attempt = () => {
        S.autoT = 0;
        if (S.on || !userId() || this.isDone(userId()) || window.innerWidth < AUTO_MIN_W) {
          S.autoPending = false; return;
        }
        if (blocked()) {
          if (++tries < 8) { S.autoT = setTimeout(attempt, 1500); return; }
          S.autoPending = false; return;
        }
        S.autoPending = false;
        this.start();
      };
      Promise.resolve(window.Danubra && Danubra._routeReady)
        .catch(() => {})
        .then(() => { S.autoT = setTimeout(attempt, 800); });
      return true;
    },
  };

  window.Tour = Tour;
  if (typeof module !== 'undefined' && module.exports) module.exports = Tour;
})();
