// ============================================================================
// DANUBRA — remeslá firiem (Marketing): jeden zoznam pre celú appku
// ============================================================================
// „Tu by som potreboval určiť remeslo, ale všade :)"
//
// Firma (danubra_leads) má jedno alebo viac remesiel ako kľúče tabuľky
// danubra_trades („Remeslá a otázky" — tie isté, podľa ktorých naberáme
// ľudí): trockenbau, maliar, obkladac, omietkar, elektrikar, betonar, tesar,
// murar, zvarac, zamocnik, montaznik, pomocnik; „bau" = všeobecne stavba.
//
//   lead.trade_keys  text[] (migrácia 087) — určené remeslá (ručne, alebo
//                    ich uložilo hľadanie: profile.trades_from = 'search');
//                    null = automaticky z textu firmy
//   detectKeys(lead, search)  kľúče z textu firmy: remeslo od AI (slovensky,
//                    „maliarstvo, omietky, zatepľovanie"), kategórie z Google
//                    Máp (nemecky), profil, titulok a popis webu, meno.
//                    Cez pitch.js TRADES (`kw` → `app`) + slovenské a nemecké
//                    slová navyše. Keď firma nič nehovorí: remeslá zvolené
//                    pri hľadaní, potom zadané weby hľadania. Nič → [].
//   keysOf(lead, search)  ručné, inak zistené
//   labelSk(key, table)   name_sk z danubra_trades, inak vstavaný názov
//   labelDe(key, table)   nemecký názov z pitch.js (do e-mailu), inak name_de
//   options(table)        čo ponúknuť vo výbere (vstavané + z tabuľky)
//   valid(keys, { table }) len známe kľúče (server overuje proti vstavaným)
//   chipsHtml(keys, …)    čipy do zoznamu (najviac 2 + „+N", „neurčené")
//
// Verejná stránka app/odkazy.html nemá databázu — používa vstavané názvy.
// Testy: node app/lib/marketing/trades.test.js
// ============================================================================
(function () {
  const node = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const pitch = () => (node ? require('./pitch.js') : (typeof window !== 'undefined' ? window.DanubraPitch : null));

  /** Vstavané remeslá (kľúč danubra_trades, slovenský názov) v poradí, v akom sa ponúkajú. */
  const BUILTIN = [
    ['trockenbau', 'Sadrokartón'], ['obkladac', 'Obklady a dlažby'], ['maliar', 'Maľovanie'],
    ['omietkar', 'Zatepľovanie a fasády'], ['elektrikar', 'Elektro'], ['tesar', 'Tesárstvo a debnenie'], ['betonar', 'Betonárske práce a armovanie'],
    ['murar', 'Murovanie'], ['zvarac', 'Zváranie'], ['zamocnik', 'Zámočníctvo'], ['montaznik', 'Okná a dvere'],
    ['pomocnik', 'Pomocné práce'], ['bau', 'Stavba a dokončovacie práce'],
  ];
  const GENERIC_KEY = 'bau';
  const KEYS = BUILTIN.map(x => x[0]);
  const BY = new Map(BUILTIN);
  const NONE = 'neurčené';
  const MAX = 6;

  const fold = (s) => String(s == null ? '' : s).toLowerCase().replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const keyOk = (k) => typeof k === 'string' && /^[a-z0-9_-]{2,40}$/.test(k);

  /**
   * Slová navyše k pitch.js (tam sú hlavne nemecké): slovenský text od AI
   * („zatepľovanie", „suchá výstavba", „obklady a dlažby") a nemecké
   * kategórie Google Máp, ktoré pitch nepozná („Zimmerei", „Putz").
   */
  const EXTRA = {
    trockenbau: /sucha vystavb|suchej vystavb|suchou vystavb|podhlad|akustik|innenausbau/,
    fliesen: /obklad|dlazb|dlazdi|fliesenleger/,
    maler: /maliar|malovan|malir|natier|nater|tapet|lakovan|malerei|malerbetrieb/,
    wdvs: /zateplov|zatepl|fasad|omietk|omiet|putz|stuck|wdvs/,
    elektro: /elektr|electric/,
    schalung: /debnen|betonar|betonov|zelezobet|hruba stavb|hrubej stavb|hrubu stavb/,
    bewehrung: /armovan|zeleziar|eisenbieg|betonstahl/,
    maurer: /murov|murar|mauer|maurer/,
    schweissen: /zvar|schweis/,
    metallbau: /zamoc|kovov|ocelov|stahlbau|schlosser|metallbau|metallverarb/,
    fenster: /okn[ao]|okien|dvere|dveri|fenster|turen|tueren|turbau|rolllad/,
  };
  /** Pravidlá rovno na kľúč (bez remesla v pitch.js). */
  const DIRECT = [
    ['tesar', /tesar|tesarstv|zimmerei|zimmerer|holzbau|krov/],
    ['pomocnik', /pomocn[eya]|bauhelfer/],
  ];

  /** Kľúč → slovenský názov: vstavaný (druh práce), inak z tabuľky danubra_trades, inak kľúč s veľkým písmenom. */
  function labelSk(key, table) {
    const k = String(key || '');
    if (!k) return NONE;
    // Pri firme sa píše druh práce („Maľovanie"), nie profesia človeka
    // („Maliar") — rovnako v appke aj vo formulári pre kolegov. Názov
    // z Remeslá a otázky len pre remeslá, ktoré vstavaný zoznam nepozná.
    if (BY.has(k)) return BY.get(k);
    const row = Array.isArray(table) ? table.find(t => t && t.key === k) : null;
    if (row && String(row.name_sk || '').trim()) return String(row.name_sk).trim();
    return k.charAt(0).toUpperCase() + k.slice(1);
  }

  /** Remeslo z pitch.js pre kľúč (prvé, ktoré ho má v `app`); „bau" = všeobecné. */
  function pitchTrade(key) {
    const P = pitch();
    if (!P) return null;
    if (key === GENERIC_KEY) return P.GENERIC;
    return P.TRADES.find(t => (t.app || []).includes(key)) || null;
  }
  /** Kľúč → nemecký názov (ako v e-maile), inak name_de z tabuľky. */
  function labelDe(key, table) {
    const t = pitchTrade(key);
    if (t) return t.label;
    const row = Array.isArray(table) ? table.find(x => x && x.key === key) : null;
    return row && row.name_de ? String(row.name_de) : '';
  }

  /** Čo ponúknuť vo výbere: vstavané (v poradí) + ďalšie aktívne z danubra_trades. */
  function options(table) {
    const out = BUILTIN.map(([key]) => ({ key, label: labelSk(key, table) }));
    const extra = (Array.isArray(table) ? table : []).filter(t => t && keyOk(t.key) && !BY.has(t.key) && t.active !== false)
      .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.name_sk || '').localeCompare(String(b.name_sk || ''), 'sk'));
    return out.concat(extra.map(t => ({ key: t.key, label: labelSk(t.key, table) })));
  }

  /** Len známe kľúče (vstavané, alebo z tabuľky), bez opakovania, najviac `max`. */
  function valid(keys, { table = null, max = MAX } = {}) {
    const known = new Set([...KEYS, ...(Array.isArray(table) ? table.map(t => t && t.key).filter(keyOk) : [])]);
    const out = [];
    for (const k of Array.isArray(keys) ? keys : []) {
      const v = String(k == null ? '' : k).trim().toLowerCase();
      if (keyOk(v) && known.has(v) && !out.includes(v)) out.push(v);
      if (out.length >= max) break;
    }
    return out;
  }

  /** Uložené remeslá firmy (prázdne pole = automaticky). */
  const manual = (lead) => (lead && Array.isArray(lead.trade_keys) ? lead.trade_keys.filter(keyOk) : []);
  /**
   * Odkiaľ sú remeslá: 'hand' = určil človek, 'search' = uložilo ich hľadanie
   * (profile.trades_from = 'search'), 'auto' = nič uložené, odhad z textu.
   */
  const source = (lead) => (!manual(lead).length ? 'auto'
    : lead.profile && typeof lead.profile === 'object' && lead.profile.trades_from === 'search' ? 'search' : 'hand');
  const isManual = (lead) => source(lead) === 'hand';
  const SOURCE_LABEL = { hand: 'ručne', search: 'pri hľadaní', auto: 'automaticky' };

  /**
   * Skóre kľúčov z textov. Každý zdroj sa ráta raz (nie počet výskytov),
   * s váhou; pri zhode vyhrá remeslo spomenuté skôr.
   * @param {Array<[string, number]>} sources  [text, váha]
   */
  function score(sources) {
    const P = pitch();
    const sc = new Map(), pos = new Map();
    const add = (k, w, at) => {
      sc.set(k, (sc.get(k) || 0) + w);
      if (!pos.has(k) || at < pos.get(k)) pos.set(k, at);
    };
    let offset = 0;
    for (const [raw, w] of sources) {
      const txt = fold(raw);
      if (!txt.trim()) continue;
      const first = (re) => { const m = txt.match(re); return m ? offset + m.index : -1; };
      for (const t of P ? P.TRADES : []) {
        const a = first(t.kw), b = EXTRA[t.key] ? first(EXTRA[t.key]) : -1;
        const at = [a, b].filter(x => x >= 0).sort((x, y) => x - y)[0];
        if (at == null) continue;
        for (const k of t.app || []) add(k, w, at);
      }
      for (const [k, re] of DIRECT) { const at = first(re); if (at >= 0) add(k, w, at); }
      offset += txt.length + 1;
    }
    return [...sc.entries()].sort((x, y) => y[1] - x[1] || pos.get(x[0]) - pos.get(y[0])).map(x => x[0]);
  }

  /**
   * Remeslá firmy z toho, čo o nej vieme. Firma: remeslo od AI, kategórie
   * Google Máp, meno (váha 3), profil a web (2), prečo (1). Keď firma nič
   * nehovorí: remeslá zvolené pri hľadaní (`search.params.trades`), potom
   * profily zadaných webov hľadania.
   * @returns {string[]} kľúče danubra_trades, najviac 4; [] = neurčené
   */
  function detectKeys(lead = {}, search = null) {
    const l = lead || {};
    const p = l.profile && typeof l.profile === 'object' ? l.profile : {};
    const cats = Array.isArray(l.categories) ? l.categories.join(', ') : '';
    const own = score([[l.trade, 3], [cats, 3], [l.name, 3], [p.summary, 2], [l.site_title, 2], [l.site_description, 2], [l.why, 1]]);
    if (own.length) return own.slice(0, 4);
    if (!search) return [];
    const chosen = valid(search.params && search.params.trades);
    if (chosen.length) return chosen.slice(0, 4);
    const seeds = Array.isArray(search.seeds) ? search.seeds : [];
    return score([...seeds.map(s => [[s && s.trade, ...((s && s.keywords) || []), ...((s && s.typical_jobs) || [])].filter(Boolean).join(', '), 1]),
      [search.params && search.params.note, 1]]).slice(0, 4);
  }

  /** Remeslá firmy: ručne určené, inak zistené. */
  function keysOf(lead, search = null) {
    const m = manual(lead);
    return m.length ? m : detectKeys(lead, search);
  }

  /** Slovenské názvy kľúčov. */
  const labels = (keys, table) => (keys || []).map(k => labelSk(k, table));

  /** Hodnota do zoradenia podľa remesla (prvý názov; neurčené na koniec). */
  const sortValue = (keys, table) => ((keys && keys.length) ? labelSk(keys[0], table) : null);

  /**
   * Čipy do zoznamu: najviac `max` + „+N", všetky v title. Bez remesla
   * „neurčené" (sivé). `manual` = značka, že remeslo určil človek.
   */
  function chipsHtml(keys, { table = null, max = 2, manual: hand = false, source: src = null } = {}) {
    const list = (keys || []).filter(Boolean);
    if (!list.length) return `<span class="tr-chips is-none" title="Remeslo sa z údajov firmy nedá určiť — doplňte ho v detaile firmy"><span class="tr-chip is-none">${NONE}</span></span>`;
    const all = labels(list, table);
    const rest = all.length - max;
    const from = src || (hand ? 'hand' : 'auto');
    hand = from === 'hand';
    return `<span class="tr-chips" title="${esc(`${all.join(', ')} (${from === 'hand' ? 'určené ručne' : from === 'search' ? 'určené pri hľadaní' : 'automaticky'})`)}">${
      all.slice(0, max).map(l => `<span class="tr-chip${hand ? ' is-hand' : ''}">${esc(l)}</span>`).join('')}${
      rest > 0 ? `<span class="tr-chip is-more">+${rest}</span>` : ''}</span>`;
  }

  /** Koľko ľudí v kartotéke robí toto remeslo (danubra_workers.profession), bez neaktívnych a „nespolupracovať". */
  function workerCount(workers, key) {
    return (workers || []).filter(w => w && w.profession === key && !['inactive', 'blacklist'].includes(w.status) && !w.archived_at).length;
  }

  const API = { BUILTIN, KEYS, GENERIC_KEY, NONE, MAX, EXTRA, DIRECT, fold, labelSk, labelDe, pitchTrade, options, valid,
    manual, source, isManual, SOURCE_LABEL, detectKeys, keysOf, labels, sortValue, chipsHtml, workerCount };
  if (typeof window !== 'undefined') window.DanubraTrades = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
