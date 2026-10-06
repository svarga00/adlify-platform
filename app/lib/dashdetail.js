// ============================================================================
// DANUBRA — čo je za číslom na prehľade
// ============================================================================
// Dlaždica na prehľade doteraz ukázala číslo a po kliknutí odišla na inú
// obrazovku. To je zlá výmena: otázka znie „ktoré?", a odpoveď bola „tu máš
// celý modul, nájdi si ich". Človek stratil kontext a na novej obrazovke
// musel ten istý filter nastaviť znova.
//
// Táto knižnica vracia **riadky, z ktorých to číslo je**. Dlaždica si z nich
// číslo spočíta — nie z iného zdroja. Preto sa číslo a zoznam nemôžu rozísť,
// čo je chyba, ktorá sa v takýchto prehľadoch objaví skôr či neskôr: pohľad
// v databáze počíta jedno, obrazovka druhé a nikto nevie, ktoré platí.
//
// Nič sa tu nenačítava. Dostane hotové polia a vráti riadky — takže sa to dá
// celé otestovať bez prehliadača a bez databázy.
//
// Peniaze sú v centoch (rozhodnutie R2). Dátumy sú 'YYYY-MM-DD'.
//
// Testy: node app/lib/dashdetail.test.js
// ============================================================================
(function () {
  const M = (typeof module !== 'undefined' && module.exports)
    ? require('./money') : window.Money;

  const day = (s) => (s ? String(s).slice(0, 10) : null);
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  /** Počet dní medzi dvoma dňami. Záporné = `a` je pred `b`. */
  function daysBetween(a, b) {
    if (!a || !b) return null;
    const t = (s) => Date.parse(String(s).slice(0, 10) + 'T00:00:00Z');
    const x = t(a), y = t(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return Math.round((x - y) / 86400000);
  }

  /** Faktúra, ktorá ešte nie je vybavená. Zhodné s outlook.js. */
  const SETTLED = ['paid', 'cancelled', 'draft'];
  const isOpenInvoice = (i) => !!i && !SETTLED.includes(i.status);

  // ── Stavy ────────────────────────────────────────────────────────────────
  // Tri, nie päť. Na dlaždici sa majú rozoznať periférnym videním:
  //   'calm'  — číslo, ktoré nič nepýta (koľko ľudí je na stavbách)
  //   'watch' — niekto to má dnes vziať do ruky
  //   'bad'   — toto už malo byť vybavené a stojí to peniaze alebo pokutu
  const CALM = 'calm', WATCH = 'watch', BAD = 'bad';

  // ── Pomocné ──────────────────────────────────────────────────────────────
  const by = (fn) => (a, b) => {
    const x = fn(a), y = fn(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return x < y ? -1 : x > y ? 1 : 0;
  };

  /**
   * Text, podľa ktorého sa v okne hľadá. Skladá sa zo všetkých textových
   * buniek — človek hľadá meno alebo číslo faktúry a nemá rozmýšľať, v ktorom
   * stĺpci to je.
   */
  function searchKey(cells) {
    return Object.values(cells || {})
      .filter(v => typeof v === 'string' && v)
      .join(' ').toLowerCase();
  }

  function mkRow(o) {
    return { ...o, search: searchKey(o.cells) };
  }

  // ── Jednotlivé čísla ─────────────────────────────────────────────────────
  // Každé má: čo to je (`title`), prečo to má zaujímať (`lead`), stĺpce
  // zoznamu a funkciu, ktorá ten zoznam poskladá.
  //
  // `x` je balík z prehľadu. Všetko je voliteľné — chýbajúce pole znamená
  // prázdny zoznam, nie výnimku. Prehľad, ktorý spadne, lebo sa jeden dotaz
  // nepodaril, je horší než prehľad s jedným prázdnym číslom.

  const KPIS = [
    // ── Ľudia na stavbách ──────────────────────────────────────────────────
    // Počíta sa rovnako ako v pohľade `v_subcontract_status`: aktívne
    // nasadenia na aktívnych zákazkách. Keby sa to počítalo z celej tabuľky
    // nasadení, číslo by bolo vyššie než to, čo ukazuje zákazka — a nikto by
    // nevedel, ktoré je správne.
    {
      key: 'deployed',
      title: 'Ľudia na stavbách',
      lead: 'Kto je práve nasadený a za akú sadzbu.',
      ico: 'workers',
      go: 'workers',
      unit: '',
      cols: [
        { k: 'worker', label: 'Živnostník' },
        { k: 'site', label: 'Zákazka' },
        // Nie „odberateľ" a „živnostník" — v jednej tabuľke by boli dva
        // stĺpce rovnakého mena ako ten prvý. V CSV sa to už nedá rozlíšiť.
        { k: 'charge', label: 'Fakturujeme', kind: 'money', align: 'right' },
        { k: 'cost', label: 'Platíme', kind: 'money', align: 'right' },
        { k: 'margin', label: 'Marža/h', kind: 'money', align: 'right' },
      ],
      rows(x) {
        const activeSites = new Set((x.subcontracts || [])
          .filter(s => s.status === 'active').map(s => s.id));
        return (x.assignments || [])
          .filter(a => a.status === 'active' && activeSites.has(a.subcontract_id))
          .map((a) => {
            const charge = a.charge_rate == null ? null : M.toCents(a.charge_rate);
            const cost = a.worker_rate == null ? null : M.toCents(a.worker_rate);
            const margin = (charge == null || cost == null) ? null : charge - cost;
            // Nasadenie, na ktorom sa nezarába, nie je vec, ktorú treba hľadať
            // v exporte — je to vec, ktorá má byť vidieť hneď.
            const tone = margin == null ? 'warn' : margin <= 0 ? 'bad' : '';
            return mkRow({
              id: a.id,
              open: { type: 'worker', id: a.worker_id },
              tone,
              why: margin == null ? 'Sadzba nie je zadaná, maržu sa nedá spočítať.'
                : margin < 0 ? 'Platíme viac, než fakturujeme.'
                  : margin === 0 ? 'Nulová marža.' : '',
              cells: {
                worker: x.workerName ? (x.workerName(a.worker_id) || '—') : '—',
                site: x.siteName ? (x.siteName(a.subcontract_id) || '—') : '—',
                charge, cost, margin,
              },
            });
          })
          .sort(by(r => r.cells.worker));
      },
      total: (rows) => rows.length,
      state: (rows) => (rows.some(r => r.tone === 'bad') ? WATCH : CALM),
      sub(rows, x) {
        const sites = new Set(rows.map(r => r.cells.site));
        const bad = rows.filter(r => r.tone === 'bad').length;
        if (!rows.length) return 'nikto nie je nasadený';
        if (bad) return `${bad} ${plural(bad, 'nasadenie bez marže', 'nasadenia bez marže', 'nasadení bez marže')}`;
        return `${sites.size} ${plural(sites.size, 'zákazka', 'zákazky', 'zákaziek')}${
          x.crewsOut ? ` · ${x.crewsOut} ${plural(x.crewsOut, 'partia', 'partie', 'partií')}` : ''}`;
      },
    },

    // ── Nezúčtované hodiny ─────────────────────────────────────────────────
    // Zoskupené podľa človeka a zákazky. Zoznam tristo riadkov výkazu nie je
    // odpoveď — odpoveď je „Ján Novák na Feuerbachu má 42 hodín, najstaršia
    // je spred troch týždňov".
    {
      key: 'hours',
      title: 'Nezúčtované hodiny',
      lead: 'Odrobené hodiny, ktoré ešte nie sú v uzavretom období. Kým sa obdobie neuzavrie, faktúra z nich nevznikne.',
      ico: 'clock',
      go: 'timesheets',
      unit: 'h',
      cols: [
        { k: 'worker', label: 'Živnostník' },
        { k: 'site', label: 'Zákazka' },
        { k: 'days', label: 'Dní', kind: 'num', align: 'right' },
        { k: 'hours', label: 'Hodín', kind: 'num', align: 'right' },
        { k: 'oldest', label: 'Najstarší deň', kind: 'date', align: 'right' },
      ],
      rows(x) {
        const activeSites = new Set((x.subcontracts || [])
          .filter(s => s.status === 'active').map(s => s.id));
        const siteOfAsg = new Map((x.assignments || []).map(a => [a.id, a.subcontract_id]));
        const groups = new Map();
        for (const t of (x.timesheets || [])) {
          if (t.period_id) continue;                 // už je v období
          const siteId = siteOfAsg.get(t.assignment_id) || null;
          if (!activeSites.has(siteId)) continue;    // rovnaká hranica ako v pohľade
          const key = `${t.worker_id}|${siteId}`;
          let g = groups.get(key);
          if (!g) {
            g = { workerId: t.worker_id, siteId, hours: 0, days: new Set(), oldest: null };
            groups.set(key, g);
          }
          g.hours += num(t.hours);
          const d = day(t.work_date);
          if (d) {
            g.days.add(d);
            if (!g.oldest || d < g.oldest) g.oldest = d;
          }
        }
        const today = x.today || null;
        return [...groups.values()].map(g => mkRow({
          id: `${g.workerId}|${g.siteId}`,
          open: { type: 'worker', id: g.workerId },
          // Dva týždne je hranica, po ktorej sa to prestáva dať vysvetliť
          // odberateľovi aj živnostníkovi.
          tone: (today && g.oldest && daysBetween(today, g.oldest) >= 14) ? 'warn' : '',
          why: (today && g.oldest && daysBetween(today, g.oldest) >= 14)
            ? `Najstaršia hodina je spred ${daysBetween(today, g.oldest)} dní.` : '',
          cells: {
            worker: x.workerName ? (x.workerName(g.workerId) || '—') : '—',
            site: x.siteName ? (x.siteName(g.siteId) || '—') : '—',
            days: g.days.size,
            hours: Math.round(g.hours * 10) / 10,
            oldest: g.oldest,
          },
        })).sort(by(r => r.cells.oldest));
      },
      total: (rows) => Math.round(rows.reduce((s, r) => s + num(r.cells.hours), 0)),
      state: (rows, x) => ((x.periodsDue || []).length ? WATCH : rows.length ? CALM : CALM),
      sub(rows, x) {
        if (!rows.length) return 'všetko zúčtované';
        const due = (x.periodsDue || []).length;
        if (due) return `${due} ${plural(due, 'obdobie čaká', 'obdobia čakajú', 'období čaká')} na uzavretie`;
        return 'čakajú na uzavretie obdobia';
      },
    },

    // ── Faktúry na schválenie ──────────────────────────────────────────────
    {
      key: 'approve',
      title: 'Faktúry na schválenie',
      lead: 'Bez schválenia sa faktúra nevystaví ani neodošle. Toto je jediné miesto, kde to viazne na nás.',
      ico: 'invoices',
      go: 'invoices',
      unit: '',
      cols: [
        { k: 'number', label: 'Faktúra' },
        { k: 'partner', label: 'Odberateľ' },
        { k: 'amount', label: 'Suma', kind: 'money', align: 'right' },
        { k: 'due', label: 'Splatnosť', kind: 'date', align: 'right' },
      ],
      rows(x) {
        return (x.invoices || [])
          .filter(i => i.status === 'pending_approval')
          .map(i => mkRow({
            id: i.id,
            open: { type: 'invoice', id: i.id },
            tone: 'warn',
            cells: {
              number: i.invoice_number || '—',
              partner: x.partnerName ? (x.partnerName(i.partner_id) || '—') : '—',
              amount: i.total == null ? null : M.toCents(i.total),
              due: day(i.due_date),
            },
          }))
          .sort(by(r => r.cells.due));
      },
      total: (rows) => rows.length,
      state: (rows) => (rows.length ? WATCH : CALM),
      sub(rows) {
        if (!rows.length) return 'žiadne nečakajú';
        const sum = M.sum(rows.map(r => r.cells.amount || 0));
        return `spolu ${M.format(sum)}`;
      },
    },

    // ── Po splatnosti ──────────────────────────────────────────────────────
    {
      key: 'overdue',
      title: 'Faktúry po splatnosti',
      lead: 'Zavolať skôr, než sa to natiahne na ďalší mesiac. Po tridsiatich dňoch sa vymáha ťažšie.',
      ico: 'alert',
      go: 'invoices',
      unit: '',
      cols: [
        { k: 'number', label: 'Faktúra' },
        { k: 'partner', label: 'Odberateľ' },
        { k: 'amount', label: 'Suma', kind: 'money', align: 'right' },
        { k: 'due', label: 'Splatnosť', kind: 'date', align: 'right' },
        { k: 'late', label: 'Mešká', kind: 'days', align: 'right' },
      ],
      rows(x) {
        const today = x.today;
        return (x.invoices || [])
          .filter(i => isOpenInvoice(i) && i.due_date && day(i.due_date) < today)
          .map((i) => {
            const late = daysBetween(today, i.due_date);
            return mkRow({
              id: i.id,
              open: { type: 'invoice', id: i.id },
              tone: late != null && late >= 30 ? 'bad' : 'warn',
              why: late != null && late >= 30 ? 'Mešká viac než mesiac.' : '',
              cells: {
                number: i.invoice_number || '—',
                partner: x.partnerName ? (x.partnerName(i.partner_id) || '—') : '—',
                amount: i.total == null ? null : M.toCents(i.total),
                due: day(i.due_date),
                late,
              },
            });
          })
          .sort((a, b) => num(b.cells.late) - num(a.cells.late));
      },
      total: (rows) => rows.length,
      state: (rows) => (rows.length ? BAD : CALM),
      sub(rows) {
        if (!rows.length) return 'nič nemešká';
        return `${M.format(M.sum(rows.map(r => r.cells.amount || 0)))} na účte chýba`;
      },
    },

    // ── Doklady ────────────────────────────────────────────────────────────
    // V zozname sú aj doklady, ktorým platnosť **čoskoro skončí**. Na dlaždici
    // je len číslo tých, ktoré už neplatia — ale vybavuje sa oboje naraz,
    // a kto otvorí zoznam, ide dokladom aj tak zavolať.
    {
      key: 'docs',
      // Na dlaždici je číslo tých, ktoré **už neplatia** — tak sa aj volá.
      // V okne je aj to, čomu platnosť čoskoro skončí, preto tam širší názov.
      tile: 'Doklady po platnosti',
      title: 'Doklady a ich platnosť',
      lead: 'Bez platného A1 alebo živnostenského nesmie nikto na stavbu. Vybavenie A1 trvá až 45 dní.',
      ico: 'shield',
      go: 'compliance',
      unit: '',
      cols: [
        { k: 'worker', label: 'Živnostník' },
        { k: 'doc', label: 'Doklad' },
        { k: 'validTo', label: 'Platí do', kind: 'date', align: 'right' },
        // Nie „Zostáva: −12 dní". Pri doklade, ktorý už neplatí, nezostáva
        // nič — ubehlo. Preto vlastný tvar, ktorý povie, čo sa stalo.
        { k: 'left', label: 'Platnosť', kind: 'validity', align: 'right' },
      ],
      rows(x) {
        return (x.documents || [])
          .filter(d => d.validity === 'expired' || d.validity === 'expiring')
          .map(d => mkRow({
            id: d.id,
            open: { type: 'worker', id: d.worker_id },
            tone: d.validity === 'expired' ? 'bad' : 'warn',
            why: d.validity === 'expired' ? 'Po platnosti — nasadiť sa nedá.' : '',
            cells: {
              worker: d.worker_name || (x.workerName ? x.workerName(d.worker_id) : '') || '—',
              doc: x.docLabel ? x.docLabel(d.kind) : String(d.kind || '—'),
              validTo: day(d.valid_to),
              left: d.days_left == null ? null : Number(d.days_left),
            },
          }))
          .sort((a, b) => {
            if (a.tone !== b.tone) return a.tone === 'bad' ? -1 : 1;
            return num(a.cells.left) - num(b.cells.left);
          });
      },
      // Na dlaždici je len to, čo už neplatí. „Blíži sa koniec" je varovanie,
      // nie prekážka, a keby sa to zrátalo dokopy, číslo by strašilo zbytočne.
      total: (rows) => rows.filter(r => r.tone === 'bad').length,
      state: (rows) => (rows.some(r => r.tone === 'bad') ? BAD
        : rows.length ? WATCH : CALM),
      sub(rows) {
        const soon = rows.filter(r => r.tone === 'warn').length;
        if (!rows.length) return 'všetko platí';
        if (!soon) return 'po platnosti';
        return `${soon} ${plural(soon, 'sa blíži', 'sa blížia', 'sa blíži')} ku koncu`;
      },
      note: 'V zozname sú aj doklady, ktorým platnosť čoskoro skončí — vybavuje sa to naraz.',
    },

    // ── Nábor ──────────────────────────────────────────────────────────────
    {
      key: 'hiring',
      title: 'Treba dobrať ľudí',
      lead: 'Koľko ľudí chýba na bežiacich náboroch a dokedy.',
      ico: 'zap',
      go: 'hiring',
      unit: '',
      cols: [
        { k: 'title', label: 'Nábor' },
        { k: 'city', label: 'Mesto' },
        { k: 'trade', label: 'Remeslo' },
        { k: 'need', label: 'Treba', kind: 'num', align: 'right' },
        { k: 'deadline', label: 'Termín', kind: 'date', align: 'right' },
      ],
      rows(x) {
        const today = x.today;
        return (x.plans || [])
          .filter(p => p.status === 'active')
          .map((p) => {
            const dl = day(p.deadline) || day(p.start_date);
            const left = dl ? daysBetween(dl, today) : null;
            return mkRow({
              id: p.id,
              open: p.subcontract_id ? { type: 'subcontract', id: p.subcontract_id } : null,
              tone: left == null ? '' : left < 0 ? 'bad' : left <= 14 ? 'warn' : '',
              why: left == null ? '' : left < 0 ? 'Termín je za nami.'
                : left <= 14 ? `Zostáva ${left} ${plural(left, 'deň', 'dni', 'dní')}.` : '',
              cells: {
                title: p.title || '—',
                city: p.city || '—',
                trade: x.tradeLabel ? (x.tradeLabel(p.trade_key) || '—') : (p.trade_key || '—'),
                need: num(p.headcount),
                deadline: dl,
              },
            });
          })
          .sort(by(r => r.cells.deadline));
      },
      total: (rows) => rows.reduce((s, r) => s + num(r.cells.need), 0),
      state: (rows) => (rows.some(r => r.tone === 'bad') ? BAD
        : rows.length ? WATCH : CALM),
      sub(rows) {
        if (!rows.length) return 'žiadny nábor nebeží';
        const late = rows.filter(r => r.tone === 'bad').length;
        if (late) return `${late} ${plural(late, 'nábor mešká', 'nábory meškajú', 'náborov mešká')}`;
        return `${rows.length} ${plural(rows.length, 'bežiaci nábor', 'bežiace nábory', 'bežiacich náborov')}`;
      },
    },
  ];

  /** Slovenské množné číslo. Rovnaké pravidlo ako v Shell.plural. */
  function plural(n, one, few, many) {
    const k = Math.abs(Number(n) || 0);
    if (k === 1) return one;
    if (k >= 2 && k <= 4) return few;
    return many;
  }

  const BY_KEY = new Map(KPIS.map(k => [k.key, k]));

  /** Definícia podľa kľúča. */
  function def(key) { return BY_KEY.get(key) || null; }

  /**
   * Celé jedno číslo aj so zoznamom, z ktorého je.
   *
   * @param {string} key  kľúč dlaždice
   * @param {Object} x    balík dát z prehľadu
   * @returns {Object|null}
   */
  function detail(key, x) {
    const d = def(key);
    if (!d) return null;
    const data = x || {};
    let rows = [];
    try { rows = d.rows(data) || []; } catch { rows = []; }
    return {
      key: d.key, title: d.title, tile: d.tile || d.title,
      lead: d.lead, ico: d.ico, go: d.go,
      unit: d.unit || '', cols: d.cols, note: d.note || '',
      rows,
      total: d.total(rows, data),
      state: d.state(rows, data),
      sub: d.sub(rows, data),
    };
  }

  /** Všetky dlaždice v poradí, v akom sa kreslia. */
  function all(x) { return KPIS.map(d => detail(d.key, x)).filter(Boolean); }

  // ── Zoznam v okne ────────────────────────────────────────────────────────
  /** Hľadanie naprieč stĺpcami. Prázdny vstup vráti všetko. */
  function filter(rows, text) {
    const q = String(text || '').trim().toLowerCase();
    if (!q) return rows || [];
    // Viac slov znamená „a zároveň" — „novák feuerbach" nájde ten jeden riadok.
    const parts = q.split(/\s+/);
    return (rows || []).filter(r => parts.every(p => (r.search || '').includes(p)));
  }

  /**
   * Zoradenie podľa stĺpca. Text sa radí po slovensky, čísla a dátumy podľa
   * hodnoty — `localeCompare` na čísle by dalo 10 pred 9.
   */
  function sort(rows, colKey, dir = 'asc') {
    const list = (rows || []).slice();
    if (!colKey) return list;
    const sign = dir === 'desc' ? -1 : 1;
    list.sort((a, b) => {
      const x = a.cells ? a.cells[colKey] : null;
      const y = b.cells ? b.cells[colKey] : null;
      if (x == null && y == null) return 0;
      if (x == null) return 1;      // prázdne vždy dole, bez ohľadu na smer
      if (y == null) return -1;
      if (typeof x === 'number' && typeof y === 'number') return sign * (x - y);
      return sign * String(x).localeCompare(String(y), 'sk');
    });
    return list;
  }

  /** Riadky pre CSV: hlavička zo stĺpcov, potom hodnoty tak, ako sú. */
  function table(detailObj) {
    if (!detailObj) return [];
    const cols = detailObj.cols || [];
    return [
      cols.map(c => c.label),
      ...(detailObj.rows || []).map(r => cols.map((c) => {
        const v = r.cells[c.k];
        if (v == null) return '';
        if (c.kind === 'money') return (Number(v) || 0) / 100;
        return v;
      })),
    ];
  }

  const API = {
    KPIS, CALM, WATCH, BAD,
    def, detail, all, filter, sort, table,
    daysBetween, plural, isOpenInvoice,
  };
  if (typeof window !== 'undefined') window.DanubraDetail = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
