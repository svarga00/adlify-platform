// ============================================================================
// DANUBRA — otázky v hovore s odpoveďami na klik
// ============================================================================
// „Toto by som dal ako konkrétne otázky a potom výber, čo povie — 2–3
// možnosti alebo iné a doplníme."
//
// V hovore bolo jedenásť voľných tvrdení vedľa seba („Má aktívnu živnosť",
// „Nemá a nechce živnosť", „Živnosť si založí"…) a náborár si musel sám
// poskladať, čo sa vlastne pýta. Tu je to naopak: **otázka, ktorú povie
// nahlas, a pod ňou odpovede, ktoré môže počuť.**
//
// Odpovede sú naviazané na existujúce polia hovoru (`call_chips`) podľa
// názvu — klik na odpoveď zaškrtne to isté pole ako doteraz, takže skóre,
// varovania aj história kandidáta fungujú bez zmeny. Odpoveď bez poľa
// („Sám", „Nie") sa zapíše do poznámky k časti hovoru.
//
// Kandidátom **vykáme** — otázky sú napísané tak, ako sa majú povedať.
//
// Polia, ktoré do žiadnej otázky nepatria, ostávajú pod otázkami ako
// „ďalšie postrehy" — nič sa nestratí.
//
// Testy: node app/lib/recruiting/callq.test.js
// ============================================================================
(function () {
  const Q = (key, q, answers, alt) => ({ key, q, alt: alt || null, answers: answers.map(([label, chip]) => ({ label, chip: chip || null })) });

  const QUESTIONS = {
    intro: [
      Q('zivnost', 'Máte živnosť?', [
        ['Áno, aktívnu', 'Má aktívnu živnosť'],
        ['Nie, ale založí si', 'Živnosť si založí'],
        ['Nie a nechce', 'Nemá a nechce živnosť']]),
      Q('partia', 'Pôjdete sám, alebo s partiou?', [
        ['Sám'], ['S partiou', 'Je to partia']]),
      Q('nemcina', 'Hovoríte po nemecky?', [
        ['Aspoň základ', 'Vie po nemecky aspoň základ'],
        ['Nikto v partii', 'Nikto v partii nevie po nemecky']]),
      Q('nastup', 'Kedy viete nastúpiť?', [
        ['Do dvoch týždňov', 'Vie nastúpiť do dvoch týždňov'], ['Neskôr']]),
      Q('naradie', 'Máte vlastné náradie?', [
        ['Áno', 'Má vlastné náradie'], ['Nie']]),
      Q('auto', 'Máte auto?', [
        ['Áno', 'Má vlastné auto'], ['Nie']]),
    ],
    verify: [
      Q('referencia', 'Pre koho ste naposledy robili?', [
        ['Dal meno aj číslo', 'Dal meno aj číslo na toho, pre koho robil'],
        ['Nepamätá si', 'Nepamätá si, pre koho robil']]),
      Q('stavba', 'Opíšte mi stavbu, kde ste naposledy robili.', [
        ['Konkrétne', 'Vie opísať konkrétnu stavbu'],
        ['Len všeobecne', 'Prax opisuje len všeobecne']]),
      Q('fotky', 'Pošlete mi fotky svojej práce?', [
        ['Posiela', 'Posiela fotky prác'],
        ['Sľubuje, neposiela', 'Fotky sľubuje, neposiela']]),
      Q('mesiace', 'Čo ste robili posledné mesiace?', [
        ['Robil súvisle', 'Posledné mesiace robil súvisle'],
        ['Má dieru', 'Diera v posledných mesiacoch']]),
    ],
    legal: [
      Q('a1', 'Viete, čo je A1?', [
        ['Vie', 'Vie, čo je A1'],
        ['Tvrdí, že netreba', 'Tvrdí, že A1 netreba'],
        ['Nevie']]),
      Q('doklady', 'Dokedy vám platia doklady?', [
        ['Viac než pol roka', 'Doklad platný viac než pol roka'],
        ['Čoskoro končia', 'Doklad čoskoro končí']]),
      Q('odbory', 'Máte v živnosti odbory na toto remeslo?', [
        ['Áno', 'Má odbory na to remeslo'], ['Nie']]),
      Q('zdravie', 'Zdravotne ste v poriadku — výšky, bremená?', [
        ['Bez obmedzení', 'Zdravotne bez obmedzení'],
        ['Má obmedzenie', 'Zdravotné obmedzenie']]),
    ],
    logistics: [
      Q('dlzka', 'Na ako dlho by ste išli?', [
        ['Dlhodobo, aspoň 3 mesiace', 'Nastúpi dlhodobo, aspoň tri mesiace'],
        ['Len pár týždňov', 'Len na pár týždňov']]),
      Q('doprava', 'Ako sa dopravíte?', [
        ['Vyrieši sám', 'Dopravu si vyrieši sám'],
        ['Nemá ako', 'Nemá ako sa dopraviť']]),
      Q('ubytovanie', 'Vadí vám bývať s ďalšími?', [
        ['Je to v poriadku', 'Zdieľané ubytovanie je v poriadku'],
        ['Chce vlastnú izbu', 'Trvá na vlastnej izbe']]),
      Q('turnus', 'Vyhovuje vám turnus 3 týždne + 1 doma?', [
        ['Vyhovuje', 'Turnus 3+1 mu vyhovuje'], ['Nie']]),
      Q('doma', 'Doma to máte dohodnuté?', [
        ['Áno', 'Doma to má dohodnuté'], ['Ešte nie']]),
    ],
    money: [
      Q('sadzba', 'Koľko si predstavujete na hodinu?', [
        ['Sedí s ponukou', 'Sadzba sedí s ponukou'],
        ['Chce výrazne viac', 'Chce výrazne viac']]),
      Q('hodiny', 'Koľko hodín týždenne chcete robiť?', [
        ['Okolo 50 h', 'Päťdesiat hodín týždenne mu vyhovuje'],
        ['Len 8 h denne', 'Chce len osem hodín denne']]),
      Q('zaloha', 'Potrebujete zálohu?', [
        ['Nepotrebuje', 'Zálohu nepotrebuje'],
        ['Chce zálohu vopred', 'Pýtal zálohu vopred']]),
      Q('kolega', 'Poznáte niekoho, kto by išiel tiež?', [
        ['Áno', 'Má kolegu, ktorý by šiel tiež'], ['Nie']]),
    ],
  };

  // ── Jeden hovor podľa konceptu ───────────────────────────────────────────
  // „Treba ten telefonát zjednodušiť … nech to sedí s konceptom."
  // Koncept (zmluvy z Drive): človek robí **na živnosť** ako dodávateľ diela
  // (rámcová zmluva o dielo + objednávka, nie zamestnanie), hodiny mu každý
  // týždeň potvrdí majster na výkaze, **faktúru vystavuje on za 2 týždne**
  // (alebo ju vystavíme za neho) so splatnosťou od doručenia, ubytovanie
  // mu zabezpečíme a **odpočíta sa z faktúry**, A1 má ako živnostník.
  //
  // Hovor má preto tri veci na jednej obrazovke: čo mu povedať (`offer`),
  // na čo sa opýtať (toto jadro) a overenie remesla (otázky z príručky).
  // „Nemiešajme podrobný a základný pohovor, stačí jeden — ale nech je
  // kvalitný a k veci": pohovor je len tento. Otázka je v ňom vtedy, keď
  // odpoveď mení rozhodnutie (berieme / neberieme / čo treba vybaviť).
  const CORE = [
    Q('zivnost', 'Máte živnosť?', [
      ['Áno, aktívnu', 'Má aktívnu živnosť'],
      ['Nie, ale založí si', 'Živnosť si založí'],
      ['Nie a nechce', 'Nemá a nechce živnosť']]),
    Q('nastup', 'Kedy viete nastúpiť?', [
      ['Do dvoch týždňov', 'Vie nastúpiť do dvoch týždňov'], ['Neskôr']]),
    Q('dlzka', 'Na ako dlho by ste išli?', [
      ['Dlhodobo, aspoň 3 mesiace', 'Nastúpi dlhodobo, aspoň tri mesiace'],
      ['Len pár týždňov', 'Len na pár týždňov']]),
    Q('sadzba', 'Sadzba je {rate} €/h, hodiny každý týždeň potvrdí majster. Sedí Vám to?', [
      ['Sedí', 'Sadzba sedí s ponukou'],
      ['Chce výrazne viac', 'Chce výrazne viac']], 'Koľko si predstavujete na hodinu?'),
    Q('faktura', 'Faktúru vystavujete Vy každé {weeks} týždne, zaplatíme do {due} dní od doručenia. Je to v poriadku?', [
      ['Áno'],
      ['Chce, aby sme ju vystavili my'],
      ['Chce zálohu vopred', 'Pýtal zálohu vopred']]),
    Q('ubytovanie', 'Ubytovanie Vám zabezpečíme, jeho cena sa odpočíta z faktúry. Vadí Vám bývať s ďalšími?', [
      ['Je to v poriadku', 'Zdieľané ubytovanie je v poriadku'],
      ['Chce vlastnú izbu', 'Trvá na vlastnej izbe'],
      ['Ubytovanie má vlastné']]),
    Q('odbory', 'Máte v živnosti zapísané toto remeslo?', [
      ['Áno', 'Má odbory na to remeslo'],
      ['Nie — doplní si'],
      ['Nevie']]),
    Q('a1', 'Máte formulár A1 ako živnostník, alebo viete, čo to je?', [
      ['Vie / má', 'Vie, čo je A1'],
      ['Tvrdí, že netreba', 'Tvrdí, že A1 netreba'],
      ['Nevie — vysvetlíme']]),
    Q('nemcina', 'Hovoríte po nemecky?', [
      ['Aspoň základ', 'Vie po nemecky aspoň základ'],
      ['Nie'],
      ['Nikto v partii', 'Nikto v partii nevie po nemecky']]),
    Q('naradie', 'Máte vlastné náradie?', [
      ['Áno', 'Má vlastné náradie'], ['Nie']]),
    Q('auto', 'Máte auto, viete sa na stavbu dopraviť sám?', [
      ['Áno', 'Má vlastné auto'], ['Nie', 'Nemá ako sa dopraviť']]),
    Q('stavba', 'Opíšte mi poslednú stavbu — čo presne ste tam robili?', [
      ['Konkrétne', 'Vie opísať konkrétnu stavbu'],
      ['Len všeobecne', 'Prax opisuje len všeobecne']]),
    Q('referencia', 'Pre koho ste naposledy robili? Môžem si tam zavolať?', [
      ['Dal meno aj číslo', 'Dal meno aj číslo na toho, pre koho robil'],
      ['Nepamätá si', 'Nepamätá si, pre koho robil']]),
  ];
  // Staré kľúče krátkeho hovoru (kvôli spätnej kompatibilite testov a odkazov).
  const QUICK = CORE.map(q => q.key);

  /** Doplní do textu otázky čísla z ponuky; keď chýbajú, použije náhradné znenie. */
  function fill(q, vars = {}) {
    const need = (String(q.q).match(/\{(\w+)\}/g) || []).map(x => x.slice(1, -1));
    if (need.some(k => vars[k] == null || vars[k] === '')) {
      if (q.alt) return q.alt;
      return String(q.q).replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null || vars[k] === '' ? '…' : vars[k]));
    }
    return String(q.q).replace(/\{(\w+)\}/g, (m, k) => vars[k]);
  }

  /**
   * Čo má náborár povedať — ponuka v piatich vetách, presne podľa zmlúv.
   * @param {Object} o  { plan, ad, trade, terms: { fakturacia_dni, splatnost_dni } }
   * @returns {Array<{key, text}>}
   */
  function offer(o = {}) {
    const p = o.plan || {}, ad = o.ad || {}, t = o.trade || {}, terms = o.terms || {};
    const rate = p.offer_rate != null && p.offer_rate !== '' ? p.offer_rate : ad.rate_offered;
    const city = p.city || ad.city || '';
    const start = p.start_date ? dateText(p.start_date) : '';
    const weeks = Math.max(1, Math.round((Number(terms.fakturacia_dni) || 14) / 7));
    const due = Number(terms.splatnost_dni) || 14;
    const eur = (n) => String(n).replace('.', ',');
    const housing = p.accommodation_provided != null ? !!p.accommodation_provided : (ad.accommodation != null ? !!ad.accommodation : null);
    const out = [];
    out.push({ key: 'praca', text: `Hľadáme ľudí${t.name_sk ? ` na pozíciu ${t.name_sk.toLowerCase()}` : ''} — ${city ? `stavba ${city}` : 'stavby v Nemecku'}${start ? `, nástup ${start}` : ''}.` });
    out.push({ key: 'forma', text: 'Robí sa na živnosť: podpíšeme rámcovú zmluvu o dielo a objednávku. Nie je to zamestnanie.' });
    out.push({ key: 'sadzba', text: rate != null && rate !== ''
      ? `Sadzba je ${eur(rate)} €/h. Hodiny Vám každý týždeň potvrdí majster na výkaze.`
      : 'Platí sa hodinovou sadzbou. Hodiny Vám každý týždeň potvrdí majster na výkaze.' });
    out.push({ key: 'faktura', text: `Faktúru vystavujete každé ${weeks} ${weeks === 1 ? 'týždeň' : 'týždne'}, zaplatíme do ${due} dní od doručenia. Vieme ju vystaviť aj za Vás.` });
    if (housing === true) out.push({ key: 'ubytovanie', text: 'Ubytovanie Vám zabezpečíme. Jeho cena sa odpočíta z Vašej faktúry.' });
    else if (housing === false) out.push({ key: 'ubytovanie', text: 'Ubytovanie si riešite sám.' });
    out.push({ key: 'a1', text: 'Do Nemecka potrebujete formulár A1 ako živnostník — pomôžeme Vám ho vybaviť.' });
    return out;
  }

  /**
   * Sľub z inzerátu, ktorý nesedí so zmluvou — náborár ho má vidieť skôr,
   * než ho zopakuje do telefónu. Vráti vety na upozornenie.
   */
  function offerConflicts(promiseLines = []) {
    const out = [];
    for (const l of promiseLines || []) {
      const x = norm(l);
      if (/ubytovan/.test(x) && /plat[ií]me/.test(x)) out.push(`V inzeráte je „${l}" — podľa zmluvy si ubytovanie platí živnostník (odpočíta sa z faktúry).`);
      if (/v[ýy]plat/.test(x)) out.push(`V inzeráte je „${l}" — živnostník nedostáva výplatu, vystavuje faktúru.`);
      if (/a1/.test(x) && /vybav[ií]me/.test(x) && !/s vami|pom[oô]/.test(x)) out.push(`V inzeráte je „${l}" — A1 si vybavuje živnostník, my mu pomáhame.`);
    }
    return out;
  }

  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

  function otazky(segKey) {
    if (segKey === 'quick') return CORE;
    return QUESTIONS[segKey] || [];
  }

  /**
   * Otázky časti hovoru s odpoveďami naviazanými na polia + polia, ktoré
   * do žiadnej otázky nepatria. `chips` sú polia, ktoré má appka k dispozícii
   * (všetky aktívne); `segChips` tie, ktoré by sa v časti ukázali doteraz.
   */
  function group(segKey, chips = [], segChips = chips, vars = {}) {
    const podlaMena = new Map((chips || []).map(c => [norm(c.label), c]));
    const pouzite = new Set();
    const questions = otazky(segKey).map(q => ({
      key: q.key, q: fill(q, vars),
      answers: q.answers.map((a) => {
        const chip = a.chip ? podlaMena.get(norm(a.chip)) || null : null;
        if (chip) pouzite.add(chip.id);
        return { label: a.label, chip };
      }),
    }));
    const rest = (segChips || []).filter(c => !pouzite.has(c.id));
    return { questions, rest };
  }

  /** Ktorá odpoveď je vybraná podľa zaškrtnutých polí (`ticked`: Set/Map id). */
  function selected(question, ticked) {
    const has = (id) => (ticked && typeof ticked.has === 'function' ? ticked.has(id) : false);
    const i = question.answers.findIndex(a => a.chip && has(a.chip.id));
    return i >= 0 ? i : null;
  }

  // ── Termín ────────────────────────────────────────────────────────────────
  // „Kde sa pýtam na termín alebo dátum, dať aj voľbu termínu." Otázka na
  // „kedy" dostane popri odpovediach aj dátum — s rýchlymi voľbami a hneď
  // s porovnaním, či stihne nástup na nábor.
  const DATUMOVE = /(^|[^\p{L}])(kedy|odkedy|dokedy|term[íi]n|d[áa]tum|nast[úu]p)/iu;
  function isDateQ(q) { return DATUMOVE.test(String((q && q.q) || q || '')); }

  const iso = (d) => d.toISOString().slice(0, 10);
  const den = (s) => new Date(`${String(s).slice(0, 10)}T00:00:00Z`);

  /** „2026-11-03" → „3. 11. 2026" */
  function dateText(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : '';
  }

  /** Rýchle voľby: budúci pondelok, o dva týždne, 1. ďalšieho mesiaca. */
  function quickDates(today) {
    const t = den(today || new Date().toISOString());
    const pon = new Date(t); pon.setUTCDate(t.getUTCDate() + (((8 - t.getUTCDay()) % 7) || 7));
    const dva = new Date(t); dva.setUTCDate(t.getUTCDate() + 14);
    const mes = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1));
    return [
      { label: 'Budúci pondelok', date: iso(pon) },
      { label: 'O 2 týždne', date: iso(dva) },
      { label: '1. ďalšieho mesiaca', date: iso(mes) },
    ];
  }

  /**
   * Stihne nástup? Porovná dátum, ktorý povedal, s nástupom náboru.
   * @returns {{tone:'ok'|'warn'|'bad', text:string}|null}
   */
  function planFit(date, planStart) {
    if (!date || !planStart) return null;
    const dni = Math.round((den(date) - den(planStart)) / 86400000);
    if (dni <= 0) return { tone: 'ok', text: `Stihne nástup ${dateText(planStart)}.` };
    if (dni <= 7) return { tone: 'warn', text: `O ${dni} ${dni === 1 ? 'deň' : dni < 5 ? 'dni' : 'dní'} neskôr, než je nástup (${dateText(planStart)}).` };
    return { tone: 'bad', text: `O ${dni} dní neskôr, než je nástup (${dateText(planStart)}) — na tento nábor nestihne.` };
  }

  /** Riadky do poznámky: odpovede bez poľa, vlastné „iné" a dátum. */
  function noteLines(questions, answers) {
    const out = [];
    for (const q of questions || []) {
      const a = answers && answers.get ? answers.get(q.key) : null;
      if (!a) continue;
      const casti = [];
      if (a.other) casti.push(a.other);
      else if (a.idx != null && q.answers[a.idx] && !q.answers[a.idx].chip) casti.push(q.answers[a.idx].label);
      if (a.date) casti.push(`dátum ${dateText(a.date)}`);
      if (casti.length) out.push(`${q.q} — ${casti.join(' · ')}`);
    }
    return out;
  }

  // ── Odborné otázky z databázy (k remeslu, k inzerátu) ────────────────────
  // „Toto by sme mali vedieť zaškrtnúť." Pri odbornej otázke nie je odpoveď
  // áno/nie — je napísané, čo chceme počuť a pri čom zbystriť. Náborár
  // posúdi, ako odpovedal: dobre, čiastočne, zle. Hodnotenie ide do tabuľky
  // `screening_answers` (rating 0 nevie · 1 slabé · 2 dobré) a do skóre.
  const RATINGS = [
    { label: 'Odpovedal dobre', rating: 2, polarity: 'plus' },
    { label: 'Čiastočne', rating: 1, polarity: 'neutral' },
    { label: 'Zle / nevie', rating: 0, polarity: 'minus' },
  ];

  /** Otázka z databázy v tvare, s ktorým vie hovor pracovať. */
  function fromDbQuestion(q) {
    return {
      key: `db:${q.id}`, dbId: q.id, q: String(q.question_sk || '').trim(),
      good: q.good_answer || '', bad: q.red_flag_answer || '',
      weight: q.weight || 1, ad: !!q.ad_id,
      answers: RATINGS.map(r => ({ label: r.label, chip: null, rating: r.rating, polarity: r.polarity })),
    };
  }

  /** Krátky názov otázky do zhrnutia — celá veta by sa do bočného panela nezmestila. */
  function shortQ(text, max = 60) {
    const t = String(text || '').replace(/\s+/g, ' ').trim().replace(/\?$/, '');
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 20)).replace(/[,\s–-]+$/, '')}…`;
  }

  /**
   * Hodnotenia odborných otázok ako položky do skóre (rovnaký tvar ako pole
   * hovoru). Dobrá odpoveď je plus, zlá mínus, s váhou otázky — kľúčová
   * otázka váži trikrát viac. „Čiastočne" a „iné" skóre nehýbu.
   */
  function ratingItems(questions, answers) {
    const out = [];
    const videne = new Set();
    for (const q of questions || []) {
      if (!q || !q.dbId || videne.has(q.key)) continue;
      videne.add(q.key);
      const a = answers && answers.get ? answers.get(q.key) : null;
      if (!a || a.idx == null || !q.answers[a.idx]) continue;
      const ans = q.answers[a.idx];
      out.push({ id: q.key, label: shortQ(q.q), polarity: ans.polarity, weight: q.weight || 1 });
    }
    return out;
  }

  /** Riadok do `screening_answers` z odpovede v hovore (null = nič na zápis). */
  function answerRow(q, a) {
    if (!q || !q.dbId || !a) return null;
    const datum = a.date ? `dátum ${dateText(a.date)}` : '';
    const spoj = (...x) => x.filter(Boolean).join(' · ');
    if (a.other != null) {
      const txt = String(a.other).trim();
      return txt || datum ? { question_id: q.dbId, answer_text: spoj(txt, datum), rating: null, flagged: false } : null;
    }
    const ans = q.answers[a.idx];
    if (!ans) return datum ? { question_id: q.dbId, answer_text: datum, rating: null, flagged: false } : null;
    return { question_id: q.dbId, answer_text: spoj(ans.label, datum), rating: ans.rating,
      flagged: ans.rating === 0 && (q.weight || 1) >= 3 };
  }

  /** Uložená odpoveď → výber v hovore (pri pokračovaní v hovore). */
  function fromRow(row) {
    if (!row) return null;
    if (row.rating == null) return row.answer_text ? { other: row.answer_text } : null;
    const r = Number(row.rating) >= 2 ? 2 : Number(row.rating);
    const idx = RATINGS.findIndex(x => x.rating === r);
    return idx >= 0 ? { idx } : null;
  }

  const API = { QUESTIONS, QUICK, CORE, offer, offerConflicts, fill, otazky, group, selected, noteLines,
    RATINGS, fromDbQuestion, shortQ, ratingItems, answerRow, fromRow,
    isDateQ, dateText, quickDates, planFit };
  if (typeof window !== 'undefined') window.DanubraCallQ = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
