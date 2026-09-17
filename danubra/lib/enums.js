// ============================================================================
// DANUBRA — číselníky z databázy
// ============================================================================
// Typy dokladov, kategórie nákladov a jednotky boli v v1 voľné reťazce
// roztrúsené po moduloch. Od migrácie 013 sedia v `danubra_enums`, takže
// pridanie hodnoty nevyžaduje zásah do kódu.
//
// Načítajú sa raz a držia v pamäti — sú to desiatky riadkov, ktoré sa menia
// raz za mesiac. Ak sa nedajú načítať, appka použije zálohu zapísanú tu, aby
// sa formuláre nerozpadli pri výpadku siete.
//
// Testy: node danubra/lib/enums.test.js
// ============================================================================
(function () {
  // Záloha pre prípad, že sa číselník nedá načítať. Drží len to, bez čoho by
  // formulár nemal ani čo ponúknuť; nie je to druhá kópia pravdy.
  const FALLBACK = {
    unit: [
      { key: 'h', label_sk: 'hodina' }, { key: 'ks', label_sk: 'kus' },
      { key: 'm2', label_sk: 'm²' }, { key: 'm', label_sk: 'bm' },
      { key: 'den', label_sk: 'deň' }, { key: 'mes', label_sk: 'mesiac' },
      { key: 'pausal', label_sk: 'paušál' },
    ],
    worker_document: [
      { key: 'id_card', label_sk: 'Občiansky preukaz' },
      { key: 'trade_licence', label_sk: 'Živnostenský list' },
      { key: 'a1', label_sk: 'Formulár A1' },
      { key: 'other', label_sk: 'Iné' },
    ],
    cost_category: [{ key: 'other', label_sk: 'Iné' }],
    override_rule: [],
  };

  const cache = new Map();   // kind → pole riadkov
  let inflight = null;

  /** Načíta všetky číselníky jedným dotazom. Opakované volanie nič nerobí. */
  async function load({ force = false } = {}) {
    if (!force && cache.size) return;
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const { data, error } = await DB.list('enums', {
          filters: { active: true }, order: { column: 'sort_order', ascending: true },
        });
        if (error) throw error;
        cache.clear();
        for (const row of data || []) {
          if (!cache.has(row.kind)) cache.set(row.kind, []);
          cache.get(row.kind).push(row);
        }
        for (const list of cache.values()) list.sort(byOrder);
      } catch {
        // Zostane, čo už je v pamäti; inak sa použije záloha.
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  function byOrder(a, b) {
    return (a.sort_order || 0) - (b.sort_order || 0) ||
      String(a.label_sk || '').localeCompare(String(b.label_sk || ''), 'sk');
  }

  /** Riadky daného číselníka. Bez načítania vráti zálohu, nie prázdno. */
  function list(kind) {
    const rows = cache.get(kind);
    if (rows && rows.length) return rows;
    return (FALLBACK[kind] || []).map(r => ({ kind, sort_order: 0, active: true, ...r }));
  }

  /** Jeden riadok podľa kľúča. */
  function get(kind, key) {
    return list(kind).find(r => r.key === key) || null;
  }

  /** Slovenský názov hodnoty. Neznámy kľúč vráti sám seba, nie prázdno —
   *  aby sa v zozname dalo vidieť, že tam niečo je, aj keď to nepoznáme. */
  function label(kind, key) {
    if (!key) return '';
    const row = get(kind, key);
    return row ? row.label_sk : String(key);
  }

  /** Nemecký názov pre dokumenty smerom k partnerovi. Chýbajúci padne na SK. */
  function labelDe(kind, key) {
    if (!key) return '';
    const row = get(kind, key);
    return (row && (row.label_de || row.label_sk)) || String(key);
  }

  function hint(kind, key) {
    const row = get(kind, key);
    return (row && row.hint) || '';
  }

  /** Pre `UI.field(..., { options })` — pole dvojíc [hodnota, názov]. */
  function options(kind, { empty = null } = {}) {
    const opts = list(kind).map(r => [r.key, r.label_sk]);
    return empty === null ? opts : [['', empty], ...opts];
  }

  const API = { load, list, get, label, labelDe, hint, options, FALLBACK, _cache: cache };
  window.Enums = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
