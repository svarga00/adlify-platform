// ============================================================================
// DANUBRA — inzerát na web punds.sk
// ============================================================================
// Inzerát v appke je aj ponukou na punds.sk, keď má zaškrtnuté „Zverejniť
// na punds.sk". Tu sú pravidlá, ako sa z formulára stanú polia pre web
// (danubra_ads.web_*), aby ich Inzeráty aj testy brali rovnako.
//
// Profesie sú tie isté ako na webe (web/shared/professions.js — kľúče
// musia sedieť; kontroluje to web/tests/web.test.js).
// ============================================================================
(function () {
  const WEB_PROFESSIONS = [
    ['elektrikar', 'Elektrikári'], ['zvarac', 'Zvárači'], ['zamocnik', 'Zámočníci'], ['sadrokarton', 'Sadrokartonisti'],
    ['maliar', 'Maliari a tapetári'], ['zateplovac', 'Zatepľovači'], ['okna', 'Montéri okien a dverí'],
    ['nabytok', 'Montéri nábytku'], ['vzduchotechnik', 'Vzduchotechnici'], ['pomocnik', 'Pomocní pracovníci'], ['ine', 'Ďalšie remeslá'],
  ];
  // Remeslo v appke → profesia na webe (keď ju človek nevyberie sám).
  const FROM_TRADE = { elektrikar: 'elektrikar', zvarac: 'zvarac', zamocnik: 'zamocnik', trockenbau: 'sadrokarton', maliar: 'maliar',
    omietkar: 'zateplovac', montaznik: 'okna', pomocnik: 'pomocnik' };
  // Jazyky webu okrem slovenčiny — rovnaké ako web/shared/sites.js → SITES.sk.langs
  // a netlify/functions/punds-translate.js → NAMES.
  const LANGS = [['cz', 'Čeština'], ['hu', 'Maďarčina'], ['de', 'Nemčina'], ['en', 'Angličtina'], ['ro', 'Rumunčina'], ['pl', 'Poľština'], ['bg', 'Bulharčina']];

  const lines = (t) => String(t || '').split('\n').map((s) => s.trim().replace(/^[-•*]\s*/, '')).filter(Boolean);
  /** „Otázka? | Odpoveď" na riadok → [{ q, a }] */
  const faqParse = (t) => lines(t).map((l) => { const i = l.indexOf('|'); return i > 0 ? { q: l.slice(0, i).trim(), a: l.slice(i + 1).trim() } : null; })
    .filter((x) => x && x.q && x.a);
  const faqText = (arr) => (arr || []).map((f) => `${f.q} | ${f.a}`).join('\n');

  const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  /** Adresa ponuky na webe: zvarac-mig-mag-135-bremen (+ kúsok id, nech je jedinečná). */
  const slugFor = (title, city, id) => [slugify(title), slugify(city)].filter(Boolean).join('-') + (id ? `-${String(id).replace(/-/g, '').slice(0, 4)}` : '');

  const num = (v) => (v === '' || v == null ? null : (Number.isFinite(Number(String(v).replace(',', '.'))) ? Number(String(v).replace(',', '.')) : null));
  const int = (v) => { const n = num(v); return n == null ? null : Math.round(n); };

  /**
   * Polia pre web z formulára inzerátu.
   * @param {Object} d   UI.formData z formulára
   * @param {Object} x   pôvodný inzerát (alebo {})
   * @param {Object} o   { i18n, now }
   * @returns {Object}   časť záznamu danubra_ads
   */
  function payload(d, x = {}, { i18n, now = new Date() } = {}) {
    const pub = !!d.web_published;
    const title = String(d.web_title || '').trim();
    const out = {
      web_published: pub,
      web_title: title || null,
      web_prof: d.web_prof || FROM_TRADE[d.trade_key] || null,
      web_body: String(d.web_body || '').trim() || null,
      rate_max: num(d.rate_max),
      start_now: !!d.start_now,
      duration: String(d.duration || '').trim() || null,
      hours_week: int(d.hours_week),
      rotation: String(d.rotation || '').trim() || null,
      accommodation: d.accommodation !== false,
      headcount: int(d.headcount),
      country: d.country || x.country || 'DE',
      image_url: String(d.image_url || '').trim() || null,
      duties: lines(d.duties), requirements: lines(d.requirements), benefits: lines(d.benefits),
      faq: faqParse(d.faq),
    };
    if (i18n) out.i18n = i18n;
    // Adresa ponuky sa po zverejnení nemení (odkazy, Google) — len keď ešte nie je.
    if (pub && !x.web_slug && title) out.web_slug = slugFor(title, d.city || x.city, x.id || Math.random().toString(36).slice(2, 8));
    if (pub && !x.published_at) out.published_at = now.toISOString();
    // Mesto sa zmenilo → súradnice pre mapu na webe treba nanovo.
    if ((d.city || '') !== (x.city || '')) { out.lat = null; out.lng = null; }
    return out;
  }

  /** Čo chýba, aby ponuka na webe dávala zmysel. */
  function missing(d) {
    const m = [];
    if (!String(d.web_title || '').trim()) m.push('verejný názov pozície');
    if (!String(d.city || '').trim()) m.push('mesto');
    if (num(d.rate_offered) == null) m.push('sadzba');
    return m;
  }

  /** Ktoré jazyky majú preklad. */
  const translated = (i18n) => LANGS.filter(([l]) => i18n && i18n[l] && i18n[l].title).map(([l]) => l);

  const API = { WEB_PROFESSIONS, FROM_TRADE, LANGS, lines, faqParse, faqText, slugify, slugFor, payload, missing, translated };
  if (typeof window !== 'undefined') window.DanubraWebAd = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
