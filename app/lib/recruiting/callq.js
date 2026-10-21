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
// Polia, ktoré do žiadnej otázky nepatria, ostávajú pod otázkami ako
// „ďalšie postrehy" — nič sa nestratí.
//
// Testy: node app/lib/recruiting/callq.test.js
// ============================================================================
(function () {
  const Q = (key, q, answers) => ({ key, q, answers: answers.map(([label, chip]) => ({ label, chip: chip || null })) });

  const QUESTIONS = {
    intro: [
      Q('zivnost', 'Máš živnosť?', [
        ['Áno, aktívnu', 'Má aktívnu živnosť'],
        ['Nie, ale založí si', 'Živnosť si založí'],
        ['Nie a nechce', 'Nemá a nechce živnosť']]),
      Q('partia', 'Ideš sám, alebo s partiou?', [
        ['Sám'], ['S partiou', 'Je to partia']]),
      Q('nemcina', 'Hovoríš po nemecky?', [
        ['Aspoň základ', 'Vie po nemecky aspoň základ'],
        ['Nikto v partii', 'Nikto v partii nevie po nemecky']]),
      Q('nastup', 'Kedy vieš nastúpiť?', [
        ['Do dvoch týždňov', 'Vie nastúpiť do dvoch týždňov'], ['Neskôr']]),
      Q('naradie', 'Máš vlastné náradie?', [
        ['Áno', 'Má vlastné náradie'], ['Nie']]),
      Q('auto', 'Máš auto?', [
        ['Áno', 'Má vlastné auto'], ['Nie']]),
    ],
    verify: [
      Q('referencia', 'Pre koho si naposledy robil?', [
        ['Dal meno aj číslo', 'Dal meno aj číslo na toho, pre koho robil'],
        ['Nepamätá si', 'Nepamätá si, pre koho robil']]),
      Q('stavba', 'Opíš mi stavbu, kde si naposledy robil.', [
        ['Konkrétne', 'Vie opísať konkrétnu stavbu'],
        ['Len všeobecne', 'Prax opisuje len všeobecne']]),
      Q('fotky', 'Pošleš fotky svojej práce?', [
        ['Posiela', 'Posiela fotky prác'],
        ['Sľubuje, neposiela', 'Fotky sľubuje, neposiela']]),
      Q('mesiace', 'Čo si robil posledné mesiace?', [
        ['Robil súvisle', 'Posledné mesiace robil súvisle'],
        ['Má dieru', 'Diera v posledných mesiacoch']]),
    ],
    legal: [
      Q('a1', 'Vieš, čo je A1?', [
        ['Vie', 'Vie, čo je A1'],
        ['Tvrdí, že netreba', 'Tvrdí, že A1 netreba'],
        ['Nevie']]),
      Q('doklady', 'Dokedy ti platia doklady?', [
        ['Viac než pol roka', 'Doklad platný viac než pol roka'],
        ['Čoskoro končia', 'Doklad čoskoro končí']]),
      Q('odbory', 'Máš v živnosti odbory na toto remeslo?', [
        ['Áno', 'Má odbory na to remeslo'], ['Nie']]),
      Q('zdravie', 'Zdravotne si v poriadku — výšky, bremená?', [
        ['Bez obmedzení', 'Zdravotne bez obmedzení'],
        ['Má obmedzenie', 'Zdravotné obmedzenie']]),
    ],
    logistics: [
      Q('dlzka', 'Na ako dlho by si išiel?', [
        ['Dlhodobo, aspoň 3 mesiace', 'Nastúpi dlhodobo, aspoň tri mesiace'],
        ['Len pár týždňov', 'Len na pár týždňov']]),
      Q('doprava', 'Ako sa dopravíš?', [
        ['Vyrieši sám', 'Dopravu si vyrieši sám'],
        ['Nemá ako', 'Nemá ako sa dopraviť']]),
      Q('ubytovanie', 'Vadí ti bývať s ďalšími?', [
        ['Je to v poriadku', 'Zdieľané ubytovanie je v poriadku'],
        ['Chce vlastnú izbu', 'Trvá na vlastnej izbe']]),
      Q('turnus', 'Vyhovuje ti turnus 3 týždne + 1 doma?', [
        ['Vyhovuje', 'Turnus 3+1 mu vyhovuje'], ['Nie']]),
      Q('doma', 'Doma to máš dohodnuté?', [
        ['Áno', 'Doma to má dohodnuté'], ['Ešte nie']]),
    ],
    money: [
      Q('sadzba', 'Koľko si predstavuješ na hodinu?', [
        ['Sedí s ponukou', 'Sadzba sedí s ponukou'],
        ['Chce výrazne viac', 'Chce výrazne viac']]),
      Q('hodiny', 'Koľko hodín týždenne chceš robiť?', [
        ['Okolo 50 h', 'Päťdesiat hodín týždenne mu vyhovuje'],
        ['Len 8 h denne', 'Chce len osem hodín denne']]),
      Q('zaloha', 'Potrebuješ zálohu?', [
        ['Nepotrebuje', 'Zálohu nepotrebuje'],
        ['Chce zálohu vopred', 'Pýtal zálohu vopred']]),
      Q('kolega', 'Poznáš niekoho, kto by šiel tiež?', [
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

  /** Riadky do poznámky: odpovede bez poľa a vlastné „iné". */
  function noteLines(questions, answers) {
    const out = [];
    for (const q of questions || []) {
      const a = answers && answers.get ? answers.get(q.key) : null;
      if (!a) continue;
      if (a.other) out.push(`${q.q} — ${a.other}`);
      else if (a.idx != null && q.answers[a.idx] && !q.answers[a.idx].chip) {
        out.push(`${q.q} — ${q.answers[a.idx].label}`);
      }
    }
    return out;
  }

  const API = { QUESTIONS, QUICK, otazky, group, selected, noteLines };
  if (typeof window !== 'undefined') window.DanubraCallQ = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
