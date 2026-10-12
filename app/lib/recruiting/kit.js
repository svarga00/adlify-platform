// ============================================================================
// DANUBRA — podklady k náboru: kanály, bloky textov, prompty, čo ešte chýba
// ============================================================================
// Ku každému náboru vzniká jeden dokument: zhrnutie zákazky a potom texty na
// priame vloženie — web, Bazoš CZ, Bazoš SK, Facebook CZ, Facebook SK, platená
// reklama, voiceover a prompty na obrázky. Doteraz to žilo mimo appky, takže
// pri ďalšom nábore sa hľadalo, čo sa minule písalo a kam sa to dávalo.
//
// Táto knižnica popisuje **tvar toho dokumentu**: aké bloky ku ktorému kanálu
// patria, ktoré sú povinné a čo v nich ešte nie je doplnené. Texty samotné sú
// v databáze (jeden riadok = jeden blok), nie tu — menia sa pri každej zákazke.
//
// Dve veci, ktoré robia rozdiel medzi zoznamom a použiteľným podkladom:
//
//   * **`[XX]`** je dohodnutá značka pre to, čo sa ešte nevie (sadzba, nástup).
//     Knižnica ich spočíta, takže appka vie povedať „toto ešte nezverejňuj".
//   * **povinné bloky** — kanál bez titulku alebo bez textu inzerátu sa nedá
//     zverejniť, aj keď je ostatné hotové.
//
// Čisté funkcie, žiadny `window`, žiadny DB prístup.
// Testy: node app/lib/recruiting/kit.test.js
// ============================================================================
(function () {
  // Značka pre nedoplnený údaj. Je to to, čo sa už v podkladoch používa —
  // nevymýšľa sa nová.
  const CHYBA = '[XX]';

  /**
   * Kanály v poradí, v akom sa obsadzujú. Web je prvý, pretože z neho vedú
   * odkazy všetky ostatné; platená reklama posledná, lebo stojí peniaze a má
   * zmysel až keď je kam poslať človeka.
   */
  const CHANNELS = [
    { key: 'web', title: 'Web (punds.eu)', lang: 'sk',
      lead: 'Podstránka ponuky. Odtiaľ vedú odkazy zo všetkých ostatných kanálov.' },
    { key: 'bazos_cz', title: 'Bazoš CZ', lang: 'cs',
      lead: 'Práce → Stavebnictví, lokalita Zahraničí. Po pár dňoch topovať, nie pridávať kópie.' },
    { key: 'bazos_sk', title: 'Bazoš SK', lang: 'sk',
      lead: 'Práca → Stavebníctvo, lokalita Zahraničie. Po pár dňoch topovať, nie pridávať kópie.' },
    { key: 'fb_cz', title: 'Facebook CZ', lang: 'cs',
      lead: 'Príspevky do skupín a na stránku. Bez emoji.' },
    { key: 'fb_sk', title: 'Facebook SK', lang: 'sk',
      lead: 'Príspevky do skupín a na stránku. Bez emoji.' },
    { key: 'ads', title: 'Platená reklama', lang: 'cs',
      lead: 'Kampaň s priznanou kategóriou Zamestnanie. Bez nej ju Meta zhodí.' },
    { key: 'images', title: 'Obrázky a prompty', lang: null,
      lead: 'Prompty na generovanie a hotové obrázky. Text sa dopĺňa v Canve.' },
    { key: 'voice', title: 'Voiceover', lang: null,
      lead: 'Skript na nahovorenie. Značky v hranatých zátvorkách sú pre nástroj, nie na prečítanie.' },
  ];

  /**
   * Bloky, ktoré ku kanálu patria. `must: true` znamená, že bez neho sa kanál
   * nedá zverejniť.
   *
   * Zámerne to nie je jeden veľký formulár: každý blok sa kopíruje zvlášť,
   * pretože presne tak sa aj vkladá — titulok do titulku, text do textu.
   */
  const BLOCKS = {
    web: [
      { key: 'title', title: 'Titulok', must: true, hint: 'Pozícia + krajina + mesto.' },
      { key: 'slug', title: 'URL adresa', must: true, hint: 'Bez diakritiky, oddelené spojovníkmi.' },
      { key: 'meta', title: 'Meta description', must: true, hint: 'Jedna až dve vety do výsledkov hľadania.' },
      { key: 'perex', title: 'Krátky perex', must: true, hint: 'Do karty v zozname ponúk.' },
      { key: 'badges', title: 'Pásik výhod', hint: 'Päť krátkych vecí, každá na vlastnom riadku.' },
      { key: 'about', title: 'O pozícii', must: true, hint: 'Čo sa stavia a čo bude robiť.' },
      { key: 'requirements', title: 'Požiadavky', must: true },
      { key: 'offer', title: 'Čo ponúkame', must: true },
      { key: 'facts', title: 'Ďalšie informácie', hint: 'Počet ľudí, nástup, ubytovanie, náradie, sadzba.' },
      { key: 'faq', title: 'Časté otázky', hint: 'Otázky, ktoré prídu tak či tak — radšej hneď.' },
      { key: 'form', title: 'Formulár — nadpis a podtext' },
    ],
    bazos_cz: [
      { key: 'title', title: 'Titulok', must: true },
      { key: 'meta', title: 'Rubrika, lokalita a mzda', must: true },
      { key: 'body', title: 'Text inzerátu', must: true },
      { key: 'keywords', title: 'Kľúčové slová', hint: 'S diakritikou aj bez — ľudia hľadajú oboje.' },
    ],
    bazos_sk: [
      { key: 'title', title: 'Titulok', must: true },
      { key: 'meta', title: 'Rubrika, lokalita a mzda', must: true },
      { key: 'body', title: 'Text inzerátu', must: true },
      { key: 'keywords', title: 'Kľúčové slová', hint: 'S diakritikou aj bez — ľudia hľadajú oboje.' },
    ],
    fb_cz: [
      { key: 'short', title: 'Krátky príspevok do skupín', must: true },
      { key: 'long', title: 'Dlhý príspevok na stránku' },
      { key: 'urgent', title: 'Urgentný príspevok', hint: 'Keď treba obsadiť hneď.' },
    ],
    fb_sk: [
      { key: 'short', title: 'Krátky príspevok do skupín', must: true },
      { key: 'long', title: 'Dlhý príspevok na stránku' },
      { key: 'urgent', title: 'Urgentný príspevok', hint: 'Keď treba obsadiť hneď.' },
    ],
    ads: [
      { key: 'primary1', title: 'Primárny text 1', must: true },
      { key: 'primary2', title: 'Primárny text 2' },
      { key: 'headlines', title: 'Nadpisy', must: true, hint: 'Tri, každý na vlastnom riadku.' },
      { key: 'description', title: 'Popis' },
      { key: 'setup', title: 'Nastavenie kampane', hint: 'Cielenie, denný rozpočet, formáty, tlačidlo.' },
    ],
    images: [
      { key: 'p_1x1', title: 'Prompt 1:1 — bez textu', must: true, kind: 'prompt' },
      { key: 'p_4x5', title: 'Prompt 4:5 — bez textu', must: true, kind: 'prompt' },
      { key: 'p_9x16', title: 'Prompt 9:16 — bez textu', kind: 'prompt' },
      { key: 'pt_1x1', title: 'Prompt 1:1 — s textom', kind: 'prompt' },
      { key: 'pt_4x5', title: 'Prompt 4:5 — s textom', kind: 'prompt' },
      { key: 'pt_9x16', title: 'Prompt 9:16 — s textom', kind: 'prompt' },
      { key: 'canva', title: 'Texty do Canvy', hint: 'K promptom bez textu — nadpis, podnadpis, pruh, pilulky.' },
    ],
    voice: [
      { key: 'script', title: 'Skript', must: true,
        hint: 'Krátke vety. Značky ako [confident] sú pokyny pre nástroj, nie na prečítanie.' },
    ],
  };

  function channel(key) { return CHANNELS.find(c => c.key === key) || null; }
  function blocks(channelKey) { return BLOCKS[channelKey] || []; }

  /** Definícia bloku aj s kanálom — na nadpis nad textom. */
  function blockDef(channelKey, blockKey) {
    return (BLOCKS[channelKey] || []).find(b => b.key === blockKey) || null;
  }

  function text(row) { return String((row && row.body) || ''); }

  /**
   * Nedoplnené údaje v texte. `[XX]` je dohodnutá značka pre to, čo sa ešte
   * nevie — sadzba, nástup, dĺžka práce.
   *
   * Vracia počet, nie `true/false`: tri nedoplnené sadzby v jednom inzeráte sú
   * iný stav než jedna.
   */
  function gaps(body) {
    const s = String(body || '');
    let n = 0, i = 0;
    while ((i = s.indexOf(CHYBA, i)) !== -1) { n++; i += CHYBA.length; }
    return n;
  }

  /**
   * Stav jedného kanála.
   *
   * @param {string} channelKey
   * @param {Array} rows  riadky podkladov { channel, block, body }
   * @returns {{key,title,lead,done:number,total:number,missing:Array,gaps:number,
   *            ready:boolean,state:string,blocks:Array}}
   */
  function channelState(channelKey, rows = []) {
    const def = channel(channelKey);
    const mine = (rows || []).filter(r => r && r.channel === channelKey && !r.archived_at);
    const list = blocks(channelKey).map(b => {
      const row = mine.find(r => r.block === b.key);
      const body = text(row);
      return {
        ...b, row: row || null, body,
        filled: body.trim().length > 0,
        gaps: gaps(body),
      };
    });
    const must = list.filter(b => b.must);
    const missing = must.filter(b => !b.filled).map(b => b.title);
    const gapCount = list.reduce((s, b) => s + b.gaps, 0);
    const done = list.filter(b => b.filled).length;

    return {
      key: channelKey,
      title: def ? def.title : channelKey,
      lead: def ? def.lead : '',
      lang: def ? def.lang : null,
      blocks: list,
      done, total: list.length,
      missing, gaps: gapCount,
      // Zverejniteľné znamená: povinné bloky sú napísané **a** nie je v nich
      // nič nedoplnené. Inzerát so „[XX] €/hod." je horší než žiadny — ľudia
      // zavolajú a nikto im nevie povedať sadzbu.
      ready: missing.length === 0 && gapCount === 0 && done > 0,
      state: missing.length ? (done ? 'rozrobene' : 'prazdne')
        : gapCount ? 'doplnit' : done ? 'hotove' : 'prazdne',
    };
  }

  /** Stav všetkých kanálov naraz. */
  function state(rows = []) { return CHANNELS.map(c => channelState(c.key, rows)); }

  /**
   * Jedna veta: kde podklady stoja. Ide do zoznamu náborov, kde nie je miesto
   * na osem kanálov.
   */
  function summary(rows = []) {
    const st = state(rows);
    const hotove = st.filter(c => c.ready).length;
    const gapCount = st.reduce((s, c) => s + c.gaps, 0);
    const naco = st.filter(c => c.done > 0).length;
    if (!naco) return { text: 'Podklady ešte nie sú', tone: 'todo', ready: 0, gaps: 0 };
    if (gapCount) {
      return { text: `${hotove} z ${st.length} kanálov hotových · ${gapCount} `
        + `${plural(gapCount, 'údaj treba doplniť', 'údaje treba doplniť', 'údajov treba doplniť')}`,
        tone: 'warn', ready: hotove, gaps: gapCount };
    }
    return { text: `${hotove} z ${st.length} kanálov hotových`,
      tone: hotove === st.length ? 'ok' : 'todo', ready: hotove, gaps: 0 };
  }

  /**
   * Čo spraviť pred zverejnením. Nie je to všeobecný zoznam — vzniká z toho,
   * čo v podkladoch naozaj chýba, plus z pravidiel, ktoré platia vždy.
   */
  function checklist(plan = {}, rows = []) {
    const out = [];
    const st = state(rows);
    const gapCount = st.reduce((s, c) => s + c.gaps, 0);

    if (gapCount) {
      out.push({ key: 'gaps', done: false,
        text: `Doplniť ${gapCount} ${plural(gapCount, 'údaj', 'údaje', 'údajov')} `
          + `označených ${CHYBA} (sadzba, nástup, dĺžka)`,
        why: 'Inzerát s nedoplnenou sadzbou priťahuje telefonáty, na ktoré sa nedá odpovedať.' });
    }
    if (!Number(plan.offer_rate)) {
      out.push({ key: 'rate', done: false, text: 'Doplniť ponúkanú sadzbu do náboru',
        why: 'Z nej sa počíta marža aj to, či nie sme pod stavebnou minimálnou mzdou.' });
    }
    if (!plan.start_date) {
      out.push({ key: 'start', done: false, text: 'Doplniť dátum nástupu',
        why: 'Je to prvá otázka v každom telefonáte.' });
    }
    const prazdne = st.filter(c => c.missing.length);
    for (const c of prazdne) {
      out.push({ key: `ch_${c.key}`, done: false,
        text: `${c.title}: chýba ${c.missing.join(', ')}`,
        why: 'Bez toho sa kanál nedá zverejniť.' });
    }
    const hotove = st.filter(c => c.ready);
    for (const c of hotove) {
      out.push({ key: `ok_${c.key}`, done: true, text: `${c.title} — pripravené na vloženie` });
    }
    return out;
  }

  /**
   * Zhrnutie zákazky, ktoré ide na začiatok dokumentu. Polia sú tie, ktoré
   * sa v podkladoch vypisujú vždy — a zoznam je zámerne krátky.
   */
  const FACTS = [
    { key: 'position', title: 'Pozícia', must: true },
    { key: 'place', title: 'Miesto', must: true },
    { key: 'project', title: 'Projekt', must: true,
      hint: 'Čo sa stavia. Toto odlišuje konkrétnu stavbu od „niekde v Nemecku".' },
    { key: 'form', title: 'Forma spolupráce', must: true },
    { key: 'condition', title: 'Podmienka', hint: 'Napríklad vlastné náradie.' },
    { key: 'housing', title: 'Ubytovanie' },
    { key: 'rate', title: 'Sadzba', must: true },
    { key: 'start', title: 'Nástup a dĺžka', must: true },
    { key: 'contact', title: 'Kontakt', must: true },
  ];

  function factsState(analysis = {}) {
    return FACTS.map(f => {
      const body = String((analysis && analysis[f.key]) || '');
      return { ...f, body, filled: body.trim().length > 0, gaps: gaps(body) };
    });
  }

  function plural(n, one, few, many) {
    const a = Math.abs(n);
    if (a === 1) return one;
    if (a >= 2 && a <= 4) return few;
    return many;
  }

  const API = {
    CHYBA, CHANNELS, BLOCKS, FACTS,
    channel, blocks, blockDef, gaps, channelState, state, summary, checklist,
    factsState, plural,
  };
  if (typeof window !== 'undefined') window.DanubraKit = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
