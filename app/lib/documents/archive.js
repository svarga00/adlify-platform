// ============================================================================
// DANUBRA — archív dokumentov: názvy, triedenie, komu patrí
// ============================================================================
// „Keď dám export dokumentov, nešlo by, aby sťahovalo PDF rovno? Alebo rovno
// mať možnosť poslať, aj viac naraz… a niekam k ľuďom a firmám ich aj
// ukladať a rozumne triediť a pomenovávať."
//
// Každý dokument, z ktorého sa spraví PDF, sa uloží do archívu
// (`danubra_archive`) k človeku, k firme a k zákazke. Tu sú čisté funkcie:
// ako sa súbor volá, kam patrí a ako sa zoznam zoradí. Ukladanie a posielanie
// je v `js/services/docs.js`.
//
// Názov súboru je vždy rovnaký tvar, aby sa dal v e-maile aj v počítači
// zoradiť podľa dátumu:   2026-10-23 Rámcová zmluva 2026-093 – Jozef Malý.pdf
//
// Testy: node app/lib/documents/archive.test.js
// ============================================================================
(function () {
  // Druh dokumentu → ako sa volá v názve súboru a v zozname. Dokumenty pre
  // Nemcov majú nemecký názov — súbor dostane on.
  const KINDS = {
    gdpr:         { label: 'Súhlas GDPR',            group: 'gdpr' },
    ramcova:      { label: 'Rámcová zmluva',         group: 'zmluvy' },
    objednavka:   { label: 'Objednávka',             group: 'objednavky' },
    infolist:     { label: 'Infolist na stavbu',     group: 'infolisty' },
    werkvertrag:  { label: 'Werkvertrag',            group: 'zmluvy' },
    rahmen:       { label: 'Rahmenvertrag',          group: 'zmluvy' },
    auftrag:      { label: 'Auftragsbestätigung',    group: 'objednavky' },
    angebot:      { label: 'Angebot',                group: 'ponuky' },
    rechnung:     { label: 'Rechnung',               group: 'faktury' },
    self_invoice: { label: 'Faktúra',                group: 'faktury' },
    mahnung:      { label: 'Upomienka',              group: 'faktury' },
    list:         { label: 'List',                   group: 'ine' },
    ine:          { label: 'Dokument',               group: 'ine' },
  };
  const GROUPS = [
    ['zmluvy', 'Zmluvy'], ['objednavky', 'Objednávky'], ['faktury', 'Faktúry'],
    ['gdpr', 'GDPR'], ['infolisty', 'Infolisty'], ['ponuky', 'Ponuky'], ['ine', 'Ostatné'],
  ];

  const kindOf = (k) => KINDS[k] || KINDS.ine;
  const label = (k) => kindOf(k).label;
  const groupOf = (k) => kindOf(k).group;

  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const day = (d) => {
    const x = d instanceof Date ? d.toISOString() : String(d || '');
    return /^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0, 10) : new Date().toISOString().slice(0, 10);
  };

  /** Znaky, ktoré nesmú byť v názve súboru vo Windows ani na iPhone. */
  function safeFile(s) {
    return clean(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\.+$/, '').slice(0, 150);
  }

  /** ASCII pre cestu v úložisku — bez diakritiky, medzier a lomiek. */
  function slug(s, fallback = 'dokument') {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 80) || fallback;
  }

  /**
   * Názov PDF: dátum, druh, číslo a komu.
   * @param {Object} m { kind, title, number, who, date }
   */
  function fileName(m = {}) {
    const druh = clean(m.title) || label(m.kind);
    const cislo = clean(m.number);
    const kto = clean(m.who);
    const casti = [day(m.date), druh];
    if (cislo && !druh.includes(cislo)) casti.push(cislo);
    return `${safeFile(casti.join(' ') + (kto ? ` – ${kto}` : ''))}.pdf`;
  }

  /** Komu dokument patrí najviac: človek, potom firma, potom zákazka. */
  function ownerOf(m = {}) {
    if (m.worker_id) return { type: 'worker', id: m.worker_id };
    if (m.partner_id) return { type: 'partner', id: m.partner_id };
    if (m.subcontract_id) return { type: 'subcontract', id: m.subcontract_id };
    return { type: 'ine', id: null };
  }

  /** Cesta v úložisku: archiv/<komu>/<id>/<rok-mesiac>/<čas>-<názov>.pdf */
  function storagePath(m = {}, { now = new Date(), rnd = Math.random().toString(36).slice(2, 7) } = {}) {
    const o = ownerOf(m);
    const t = (now instanceof Date ? now : new Date(now)).toISOString();
    return `archiv/${o.type}/${o.id || 'bez-id'}/${t.slice(0, 7)}/${t.slice(0, 19).replace(/[:T]/g, '-')}-${rnd}-${slug(fileName(m).replace(/\.pdf$/, ''))}.pdf`;
  }

  /**
   * Ten istý papier sa stiahne aj trikrát (oprava preklepu). Nič sa nemaže —
   * v zozname je posledná verzia a počet tých starších.
   */
  function latest(rows) {
    const by = new Map();
    const sorted = [...(rows || [])].filter(r => r && !r.archived_at)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    for (const r of sorted) {
      const k = [r.kind, clean(r.number) || clean(r.title), r.worker_id || '', r.partner_id || '', r.subcontract_id || ''].join('|');
      if (!by.has(k)) by.set(k, { ...r, older: [] });
      else by.get(k).older.push(r);
    }
    return [...by.values()];
  }

  /**
   * Zoznam pre obrazovku Dokumenty: podľa toho, komu patrí (ľudia, firmy),
   * v skupine od najnovšieho. Filter podľa druhu a hľadanie v názve.
   */
  function grouped(rows, { names = {}, group = '', q = '' } = {}) {
    const hladaj = clean(q).toLowerCase();
    const list = latest(rows).filter(r => (!group || groupOf(r.kind) === group)
      && (!hladaj || `${r.file_name} ${r.title} ${r.number || ''}`.toLowerCase().includes(hladaj)));
    const out = new Map();
    for (const r of list) {
      const o = ownerOf(r);
      const key = `${o.type}:${o.id}`;
      if (!out.has(key)) {
        out.set(key, { key, type: o.type, id: o.id,
          name: names[key] || ({ worker: 'Živnostník', partner: 'Firma', subcontract: 'Zákazka' }[o.type] || 'Bez priradenia'),
          rows: [] });
      }
      out.get(key).rows.push(r);
    }
    const PORADIE = { worker: 0, partner: 1, subcontract: 2, ine: 3 };
    return [...out.values()].sort((a, b) => (PORADIE[a.type] - PORADIE[b.type])
      || a.name.localeCompare(b.name, 'sk'));
  }

  /** Text správy pri posielaní viacerých dokumentov naraz. */
  function shareText(rows, { lang = 'sk' } = {}) {
    const n = (rows || []).length;
    const zoznam = (rows || []).map(r => `• ${r.file_name.replace(/\.pdf$/, '')}`).join('\n');
    if (lang === 'de') {
      return `Guten Tag,\n\nanbei ${n === 1 ? 'das Dokument' : `${n} Dokumente`}:\n${zoznam}\n\nMit freundlichen Grüßen`;
    }
    return `Dobrý deň,\n\nv prílohe ${n === 1 ? 'posielame dokument' : `posielame ${n} dokumenty`}:\n${zoznam}\n\nS pozdravom`;
  }

  /** Jazyk správy: keď idú všetky dokumenty firme, po nemecky. */
  function langOf(rows) {
    const r = rows || [];
    return r.length && r.every(x => x.lang === 'de') ? 'de' : 'sk';
  }

  const API = { KINDS, GROUPS, label, groupOf, fileName, ownerOf, storagePath, latest,
    grouped, shareText, langOf, slug, safeFile };
  if (typeof window !== 'undefined') window.DanubraArchive = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
