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
  const Q = (key, q, answers) => ({ key, q, answers: answers.map(([label, chip]) => ({ label, chip: chip || null })) });

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

  // Krátky hovor: najdôležitejšie otázky zo všetkých častí, do troch minút.
  const QUICK = ['intro:zivnost', 'intro:nastup', 'legal:a1', 'logistics:dlzka',
    'money:sadzba', 'money:zaloha'];

  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

  function otazky(segKey) {
    if (segKey === 'quick') {
      return QUICK.map((id) => {
        const [seg, key] = id.split(':');
        return (QUESTIONS[seg] || []).find(q => q.key === key);
      }).filter(Boolean);
    }
    return QUESTIONS[segKey] || [];
  }

  /**
   * Otázky časti hovoru s odpoveďami naviazanými na polia + polia, ktoré
   * do žiadnej otázky nepatria. `chips` sú polia, ktoré má appka k dispozícii
   * (všetky aktívne); `segChips` tie, ktoré by sa v časti ukázali doteraz.
   */
  function group(segKey, chips = [], segChips = chips) {
    const podlaMena = new Map((chips || []).map(c => [norm(c.label), c]));
    const pouzite = new Set();
    const questions = otazky(segKey).map(q => ({
      key: q.key, q: q.q,
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

  const API = { QUESTIONS, QUICK, otazky, group, selected, noteLines,
    RATINGS, fromDbQuestion, shortQ, ratingItems, answerRow, fromRow,
    isDateQ, dateText, quickDates, planFit };
  if (typeof window !== 'undefined') window.DanubraCallQ = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
