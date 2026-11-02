// ============================================================================
// DANUBRA — marketing: export nájdených firiem (CSV pre Excel)
// ============================================================================
// „Potrebujem tie kontakty vedieť exportovať…"
//
// Jeden zoznam stĺpcov s kontaktmi na troch miestach — nech sú všade rovnaké:
//   * po hľadaní v páse s výsledkom: „Exportovať nájdené (Excel)",
//   * v Histórii hľadaní pri každom hľadaní „Export",
//   * v hlavnom Exporte Nových firiem (tie isté stĺpce na začiatku, za nimi
//     ďalšie údaje zoznamu) — Export berie len vyfiltrované riadky, takže
//     filter Hľadanie + Export = firmy jedného hľadania.
//
// Stĺpce: firma, remeslo (SK, DE), mesto, PSČ, adresa, web, e-mail a odkiaľ
// je, telefón, konateľ / kontaktná osoba, USt-IdNr, hodnotenie a recenzie na
// Google, stav na Google, skóre, vhodná (palec), kategória (stav firmy),
// oslovenie, ďalší krok, zdroj, hľadanie (dátum + vzorové weby), Google Mapy.
//
// CSV ako všade v appke (lib/export.js): UTF-8 s BOM, bodkočiarka, úvodzovky
// zdvojené, hodnota začínajúca „=" sa nevyhodnotí ako vzorec. Desatinná
// čiarka pri hodnotení (4,6).
//
// „Kopírovať e-maily": e-maily firiem hľadania oddelené čiarkou, bez
// duplicít a bez odhlásených.
//
// Čisté funkcie — oslovenie (outreach.js) sa podstrčí cez ctx.outreach.
// Testy: node app/lib/marketing/found-export.test.js
// ============================================================================
(function () {
  const node = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const lib = (file, global) => () => (node ? require(file) : (typeof window !== 'undefined' ? window[global] : null));
  const E = lib('../export.js', 'DanubraExport');
  const TR = lib('./trades.js', 'DanubraTrades');
  const O = lib('./outscraper.js', 'DanubraOutscraper');
  const LV = lib('./leadview.js', 'DanubraLeadView');
  const LL = lib('./leads.js', 'DanubraLeads');
  const SD = lib('./seeds.js', 'DanubraSeeds');

  const EMAIL_FROM = { impressum: 'z Impressum', web: 'z webu firmy', ai: 'neoverený', outscraper_contacts: 'z webu (Outscraper)' };
  const SOURCE = { outscraper: 'Google Mapy', urls: 'podľa webov', kolega: 'od kolegu', ai: 'AI', osm: 'mapa', manual: 'ručne' };
  const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[a-z]{2,}$/i;

  const day = (v) => (v ? String(v).slice(0, 10) : '');
  const statusLabel = (k) => {
    const st = (LL() && LL().STATUS) || [];
    const hit = st.find(s => s[0] === k);
    return hit ? hit[1] : (k || '');
  };

  /** „2026-11-02 · huber-trockenbau.de, schmidt-ausbau.de, weber-bau.de (Augsburg)". */
  function searchText(s) {
    if (!s) return '';
    const host = (u) => (SD() ? SD().hostOf(u) : String(u || '').replace(/^https?:\/\/(www\.)?/i, '').replace(/\/.*$/, ''));
    const seeds = (Array.isArray(s.seeds) && s.seeds.length ? s.seeds : (s.params && s.params.urls) || [])
      .map(x => (typeof x === 'string' ? host(x) : (x && (x.domain || host(x.url))))).filter(Boolean);
    const what = seeds.length ? seeds.join(', ') : s.kind === 'ai' ? 'podľa odberateľov' : 'hľadanie';
    const region = s.params && s.params.region ? ` (${String(s.params.region).trim()})` : '';
    return [day(s.created_at), `${what}${region}`].filter(Boolean).join(' · ');
  }

  /** Remeslá firmy (ručné, inak zistené; pri hľadaní aj zvolené remeslá). */
  function tradeKeys(r, ctx) {
    const t = TR();
    if (!t) return [];
    try { return t.keysOf(r, ctx.searchOf(r)); } catch (e) { return []; }
  }

  /**
   * Stĺpce exportu: [[nadpis, (firma) => hodnota]].
   * @param {{ trades?: Array, searches?: Array, outreach?: (r) => string }} ctx
   */
  function columns(ctx = {}) {
    const searches = Array.isArray(ctx.searches) ? ctx.searches : [];
    const c = {
      ...ctx,
      searchOf: ctx.searchOf || ((r) => (r && r.seed_search_id ? searches.find(s => s.id === r.seed_search_id) || null : null)),
    };
    const table = ctx.trades || null;
    const tk = ctx.tradeKeys || ((r) => tradeKeys(r, c));
    return [
      ['Firma', r => r.name],
      ['Remeslo', r => (TR() ? tk(r).map(k => TR().labelSk(k, table)).filter(Boolean).join(', ') : '')],
      ['Remeslo (DE)', r => (TR() ? tk(r).map(k => TR().labelDe(k, table)).filter(Boolean).join(', ') : '')],
      ['Mesto', r => r.city],
      ['PSČ', r => r.postal_code],
      ['Adresa', r => r.address],
      ['Web', r => r.website],
      ['E-mail', r => r.email],
      ['Zdroj e-mailu', r => (r.email ? EMAIL_FROM[r.profile && r.profile.email_source] || '' : '')],
      ['Telefón', r => r.phone],
      ['Konateľ / kontaktná osoba', r => r.contact_person],
      ['USt-IdNr', r => r.vat_id],
      ['Google hodnotenie', r => (r.rating == null || r.rating === '' || !E() ? '' : E().num(r.rating, 1))],
      ['Počet recenzií', r => (r.reviews_count == null ? '' : r.reviews_count)],
      ['Stav na Google', r => ((O() && O().stateOf(r)) || [])[1] || ''],
      ['Skóre', r => (r.score == null ? '' : r.score)],
      ['Vhodná (palec)', r => (Number(r.relevance) === 1 ? 'áno' : Number(r.relevance) === -1 ? `nie${r.relevance_note ? ` – ${r.relevance_note}` : ''}` : '')],
      ['Kategória', r => statusLabel(r.status)],
      ['Oslovenie', r => { try { return ctx.outreach ? ctx.outreach(r) || '' : ''; } catch (e) { return ''; } }],
      ['Ďalší krok', r => [day(r.next_step_at), r.next_step_text || ''].filter(Boolean).join(' ')],
      ['Zdroj', r => SOURCE[r.source] || r.source || ''],
      ['Hľadanie', r => searchText(c.searchOf(r))],
      ['Google Mapy', r => (LV() ? LV().mapsUrl(r) : '')],
    ];
  }

  /** Firmy → riadky CSV (prvý riadok nadpisy). Archivované nie. */
  function build(leads, ctx = {}) {
    const cols = ctx.columns || columns(ctx);
    const cell = (v) => (Array.isArray(v) ? v.filter(x => x != null && x !== '').join(', ') : v == null ? '' : v);
    return [cols.map(x => x[0]), ...(leads || []).filter(r => r && !r.archived_at).map(r => cols.map(x => cell(x[1](r))))];
  }

  /** Text súboru presne ako ho stiahne appka: BOM + bodkočiarky (lib/export.js). */
  function csvText(rows) { return `﻿${E().csv(rows)}`; }

  /** Firmy uložené jedným hľadaním, zoradené podľa skóre. */
  function leadsOf(leads, searchId) {
    return (leads || []).filter(r => r && !r.archived_at && r.seed_search_id === searchId)
      .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'sk'));
  }

  /** E-maily firiem: oddelené čiarkou, bez duplicít, bez odhlásených a neplatných. */
  function emails(leads) {
    const seen = new Set();
    const out = [];
    for (const r of leads || []) {
      if (!r || r.archived_at || r.status === 'unsubscribed') continue;
      const e = String(r.email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(e) || seen.has(e)) continue;
      seen.add(e);
      out.push(e);
    }
    return out;
  }

  /** Názov súboru: nove-firmy-hladanie-2026-11-02-huber-trockenbau.de.csv (cez lib/export.js filename). */
  function fileParts(s) {
    const first = s && Array.isArray(s.seeds) && s.seeds[0] ? (s.seeds[0].domain || '') : '';
    return ['nove-firmy', 'hladanie', day(s && s.created_at), first].filter(Boolean);
  }

  const API = { EMAIL_FROM, SOURCE, searchText, columns, build, csvText, leadsOf, emails, fileParts };
  if (typeof window !== 'undefined') window.DanubraFoundExport = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
