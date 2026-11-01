// ============================================================================
// DANUBRA — logo firmy (spoločný štvorček pre celú appku)
// ============================================================================
// „Logo alebo favicon musí byť všade." Kdekoľvek sa v appke ukáže FIRMA
// (nová firma, odberateľ, odkaz od kolegu, odosielateľ e-mailu, dodávateľ…),
// kreslí sa týmto jedným komponentom — rovnaký tvar, rovnaké farby, rovnaké
// správanie. Logika zdrojov je v lib/logo.js (DanubraLogo).
//
//   CompanyLogo.html(firma, { size: 16|20|24|28|32|40, title })
//       firma = čokoľvek, čo sa podobá na firmu: { name | company_name |
//       from_name, logo_url, website | web | url | domain, email | from_email }
//   CompanyLogo.who(firma, '<span class="dl-title">…</span>', { size })
//       logo vedľa mena (bunka zoznamu, riadok, hlavička)
//   CompanyLogo.remember('partner', rows)  /  CompanyLogo.find('partner', id)
//       aby čip odkazu na odberateľa (Danubra.link) vedel, aký má web
//       a nahraté logo — bez ďalšieho volania databázy
//
// Výkon a súkromie:
//   * obrázok je `loading="lazy"`, `decoding="async"`, bez referera
//     a s pevným rozmerom (riadky neposkakujú) — žiadne volania na riadok
//     okrem samotného obrázka,
//   * služba ikon (Google s2) dostane len doménu; firma bez domény
//     (alebo len s gmailom) nevolá nikam — len iniciály,
//   * iniciály sú vždy pod obrázkom a obrázok sa ukáže až po načítaní;
//     keď sa nenačíta, odstráni sa — rozbitý obrázok nikdy nevidno.
// ============================================================================
(function () {
  const LG = () => window.DanubraLogo;
  const esc = (s) => (window.UI && UI.esc ? UI.esc(s) : String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));

  // ── Kto je kto: odberatelia, nové firmy, klienti ───────────────────────
  // Moduly si odberateľov načítavajú samy (často len id a meno). Tu sa
  // zbiera, čo o firme vieme (web, e-mail, nahraté logo), aby čip na inej
  // obrazovke ukázal to isté logo.
  const known = new Map();       // typ → Map(id → firma)
  const indexOf = new WeakMap(); // pole → Map(id → riadok), aby sa nehľadalo stále dokola
  const pick = (r) => {
    const o = {};
    for (const k of ['name', 'company_name', 'website', 'web', 'url', 'domain', 'email', 'logo_url']) if (r[k] != null && r[k] !== '') o[k] = r[k];
    return o;
  };
  /** Polia, ktoré moduly už majú načítané (bez ďalšieho dopytu). */
  const LOADED = {
    partner: () => [window.Prt && Prt.items, window.Sub && Sub.partners, window.Inv && Inv.partners, window.Lead && Lead.partners,
      window.Quo && Quo.partners, window.Con && Con.partners, window.Ord && Ord.partners],
    lead: () => [window.Lead && Lead.rows],
    client: () => [window.Inv && Inv.clients],
  };
  const byId = (arr, id) => {
    if (!Array.isArray(arr) || !arr.length) return null;
    let m = indexOf.get(arr);
    if (!m || m.size !== arr.length) { m = new Map(arr.filter(Boolean).map(r => [r.id, r])); indexOf.set(arr, m); }
    return m.get(id) || null;
  };

  const CompanyLogo = {
    /** Zapamätá si firmy (web, e-mail, logo) pre čipy na iných obrazovkách. */
    remember(type, rows, logoOf) {
      if (!type || !Array.isArray(rows)) return;
      if (!known.has(type)) known.set(type, new Map());
      const m = known.get(type);
      for (const r of rows) {
        if (!r || !r.id) continue;
        const add = pick(r);
        const url = typeof logoOf === 'function' ? logoOf(r) : null;
        if (url) add.logo_url = url;
        m.set(r.id, { ...(m.get(r.id) || {}), ...add });
      }
    },

    /** Firma podľa typu a id — z pamäte a z toho, čo majú moduly načítané. */
    find(type, id) {
      if (!type || !id) return null;
      let out = null;
      const mem = known.get(type);
      if (mem && mem.get(id)) out = { ...mem.get(id) };
      for (const arr of (LOADED[type] ? LOADED[type]() : [])) {
        const r = byId(arr, id);
        if (!r) continue;
        const add = pick(r);
        out = out || {};
        for (const k of Object.keys(add)) if (out[k] == null || out[k] === '') out[k] = add[k];
      }
      return out;
    },

    /**
     * Štvorček s logom. Iniciály na farbe podľa mena sú vždy pod ním,
     * obrázok (logo → favicon) sa ukáže až po načítaní.
     */
    html(firma, opts = {}) {
      const L = LG();
      const z = L ? L.size(opts.size) : (Number(opts.size) || 24);
      const s = L ? L.sources(firma || {}) : { src: '', fallback: '', initials: '?', hue: 215 };
      const img = s.src ? `<img src="${esc(s.src)}" alt="" width="${z}" height="${z}" loading="lazy" decoding="async" referrerpolicy="no-referrer"${
        s.fallback ? ` data-fb="${esc(s.fallback)}"` : ''} onload="CompanyLogo.ok(this)" onerror="CompanyLogo.err(this)">` : '';
      const title = opts.title ? ` title="${esc(opts.title)}"` : '';
      const cls = `co-logo co-z${z}${opts.cls ? ` ${esc(opts.cls)}` : ''}`;
      return `<span class="${cls}" style="--co-h:${Number(s.hue) || 0};--co-z:${z}px" aria-hidden="true"${title} data-co="${esc(s.domain || '')}"><span class="co-ini">${esc(s.initials)}</span>${img}</span>`;
    },

    /** Logo vedľa mena: `<span class="co-who">logo + obsah</span>`. */
    who(firma, inner, opts = {}) {
      return `<span class="co-who${opts.cls ? ` ${esc(opts.cls)}` : ''}">${this.html(firma, { size: 28, ...opts, cls: '' })}${inner || ''}</span>`;
    },

    /**
     * Doplní web a e-mail firiem, na ktoré ukazujú záznamy (úlohy, prehľad),
     * keď ich ešte žiadny modul nenačítal. Jeden dopyt na typ pre všetky
     * chýbajúce naraz — nikdy nie dopyt na riadok. Bez práva sa nepýta.
     * @param refs [{ type: 'partner'|'lead', id }]
     */
    async ensure(refs) {
      if (!window.DB || typeof DB.list !== 'function') return;
      const D = window.Danubra;
      const SRC = { partner: ['partners', 'id,name,website,email'], lead: ['leads', 'id,name,website,email,logo_url'] };
      const jobs = Object.keys(SRC).map((type) => {
        if (D && D.entities && D.entities[type] && D.can && !D.can(D.entities[type].route)) return null;
        const ids = [...new Set((refs || []).filter(r => r && r.type === type && r.id && !this.find(type, r.id)).map(r => r.id))].slice(0, 300);
        if (!ids.length) return null;
        return Promise.resolve().then(() => DB.list(SRC[type][0], { select: SRC[type][1], filters: { id: ids }, limit: 300 }))
          .then(r => { if (r && Array.isArray(r.data)) this.remember(type, r.data); }).catch(() => null);
      }).filter(Boolean);
      await Promise.all(jobs);
    },

    /** Logo firmy podľa typu a id (odberateľ, nová firma) — prázdne, keď ju nepoznáme. */
    of(type, id, opts = {}) {
      const f = this.find(type, id);
      return f ? this.html(f, opts) : '';
    },

    /** Malé logo do čipu odkazu (Danubra.link) — len pre firmy. */
    chip(type, id) {
      if (!['partner', 'lead', 'client'].includes(type)) return '';
      return this.of(type, id, { size: 16, cls: 'co-chip' });
    },

    ok(img) {
      // Google pri neznámej doméne vráti 16 px glóbus — vtedy radšej iniciály.
      const L = LG();
      if (L && L.isPlaceholder(img.currentSrc || img.src, img.naturalWidth)) return this.err(img);
      img.classList.add('is-ok');
      return null;
    },
    err(img) {
      const fb = img.getAttribute('data-fb');
      if (fb) { img.removeAttribute('data-fb'); img.src = fb; return; }
      img.remove();
    },
  };

  window.CompanyLogo = CompanyLogo;
})();
