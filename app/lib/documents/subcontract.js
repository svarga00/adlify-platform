// ============================================================================
// DANUBRA — rámcová zmluva o dielo so živnostníkom
// ============================================================================
// Piaty krok v reťazci: „potrebujem spraviť zmluvu so subdodávateľom
// (živnostníkom), zvyčajne do konca kalendárneho roka."
//
// Text je podľa zmluvy, ktorú firma používa — §536 a nasl. Obchodného
// zákonníka, trinásť článkov. Nie je to vzor stiahnutý z internetu: sú v ňom
// veci, ktoré si táto firma vyskúšala na vlastnej koži (Freistellung,
// zrážková daň, nástup na stavbu, alkohol na pracovisku).
//
// **Prečo je to dáta a nie HTML.** Zmluva sa mení: právnik opraví vetu,
// majiteľ zdvihne pokutu, od budúceho roka platí iná splatnosť. Keby bola
// zapísaná ako jeden kus HTML, každá taká zmena by bola zásah do kódu a nikto
// by nevedel, čo sa zmenilo oproti minulému roku. Takto je článok článkom,
// odstavec odstavcom a **sumy a lehoty sú čísla z Nastavení**.
//
// Čisté funkcie, žiadny `window`, žiadny DB prístup.
// Testy: node app/lib/documents/subcontract.test.js
// ============================================================================
(function () {
  /**
   * Sumy a lehoty. Predvolené hodnoty sú tie zo zmluvy, ktorú firma podpisuje
   * dnes; prepíšu sa v Nastaveniach (oddiel `subcontract`).
   *
   * Je to zoznam, nie rozsypané čísla v texte — pri zmene pokuty sa nehľadá
   * v dvanástich odstavcoch.
   */
  const SUMY = {
    fakturacia_dni: 14,         // ako často smie fakturovať (2 kalendárne týždne)
    splatnost_dni: 14,          // splatnosť jeho faktúry
    splatnost_predlzenie_mes: 3, // o koľko sa dá splatnosť predĺžiť pri spore s odberateľom
    sucin_dni: 2,               // do koľkých dní akceptuje objednávku
    nastup_oznamenie_dni: 2,    // koľko dní vopred príde objednávka
    zaruka_mes: 24,             // záruka za akosť diela
    reklamacia_dni: 10,         // dokedy odstráni reklamovanú vadu
    mlcanlivost_mes: 24,        // ako dlho drží obchodné tajomstvo po skončení
    konkurencia_roky: 2,        // zákaz konkurencie po skončení
    vypoved_mes: 1,             // výpovedná lehota
    dorucenie_dni: 5,           // fikcia doručenia poštou
    samofakt_namietka_dni: 5,   // dokedy môže namietať faktúru, ktorú sme vystavili zaňho
    freistellung_poplatok: 50,  // spracovateľský poplatok pri zrážkovej dani
    pokuta_alkohol: 500,
    pokuta_fajcenie: 350,
    pokuta_konkurencia: 10000,
    pokuta_omeskanie_den: 300,  // za každý deň omeškania (šablóna na Drive: 300 €)
    pokuta_nenastupenie: 3000,  // nenastúpenie na práce (šablóna na Drive: 3 000 €)
    pokuta_mlcanlivost: 400,
  };

  const eur = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    return v.toLocaleString('sk-SK', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
  };

  /** Skloňovanie, ktoré v zmluve nesmie škrípať: „2 dni", „5 dní", „1 deň". */
  function plural(n, one, few, many) {
    const k = Math.abs(Number(n) || 0);
    if (k === 1) return one;
    if (k >= 2 && k <= 4) return few;
    return many;
  }
  const dni = (n) => `${n} ${plural(n, 'deň', 'dni', 'dní')}`;
  const mesiace = (n) => `${n} ${plural(n, 'mesiac', 'mesiace', 'mesiacov')}`;
  const roky = (n) => `${n} ${plural(n, 'rok', 'roky', 'rokov')}`;

  /**
   * Koniec platnosti: 31. decembra toho roka, v ktorom sa podpisuje.
   * „Zvyčajne do konca kalendárneho roka" — a zvyčajne to tak aj zostane,
   * ale dá sa prepísať.
   */
  function koniecRoka(dátum) {
    const d = String(dátum || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const rok = Number(d.slice(0, 4)) || new Date().getFullYear();
    return `${rok}-12-31`;
  }

  /**
   * Dôvody okamžitého odstúpenia — článok X. bod 6, písmená a) až i).
   *
   * Doslovne podľa firemnej šablóny „Zmluva o dielo" (Google Drive, 00 -
   * Šablóny). Ukončovací list („Ukončenie Zmluvy o dielo, Objednávky") sa na
   * ne odvoláva písmenom — „na základe Článku X, bod 6g." — preto poradie ani
   * počet sa nesmú meniť bez toho, aby sa zmenil aj list.
   *
   * `kratko` je len popis do výberu v appke; do zmluvy ide `text`.
   */
  const DOVODY = [
    { p: 'a', kratko: 'nekvalitne alebo v sklze',
      text: 'ak zhotoviteľ zhotovuje dielo nekvalitne alebo v takom časovom sklze, že je zrejmé, '
        + 'že dielo nebude vedieť riadne a včas odovzdať objednávateľovi' },
    { p: 'b', kratko: 'nenastúpil v termíne',
      text: 'ak zhotoviteľ nenastúpi na zhotovovanie diela v stanovenom termíne podľa začiatku '
        + 'zhotovovania diela' },
    { p: 'c', kratko: 'prerušil prácu bez súhlasu',
      text: 'ak zhotoviteľ prerušil zhotovovanie diela bez súhlasu objednávateľa a nezriadil '
        + 'nápravu ani na výzvu Objednávateľa' },
    { p: 'd', kratko: 'neodstránil vadu',
      text: 'ak zhotoviteľ neodstráni uplatnenú vadu diela v lehote určenej objednávateľom' },
    { p: 'e', kratko: 'podstatné porušenie zmluvy',
      text: 'ak zhotoviteľ poruší ktorékoľvek ustanovenia tejto zmluvy alebo individuálnej '
        + 'zmluvy podstatným spôsobom' },
    { p: 'f', kratko: 'zákazník je nespokojný alebo ho odmietol',
      text: 'ak zákazník objednávateľa vysloví nespokojnosť so spôsobom realizácie diela '
        + 'zhotoviteľom alebo odmietne prítomnosť zhotoviteľa v mieste realizácie diela.' },
    { p: 'g', kratko: 'nie je dostatok práce',
      text: 'nemá dostatok práce určený pre zhotoviteľa' },
    { p: 'h', kratko: 'neuspel na skúške',
      text: 'zhotoviteľ na skúške potrebnej pre vykonávanie prác neuspeje' },
    { p: 'i', kratko: 'alkohol, omamné látky, ohrozovanie BOZP',
      text: 'zhotoviteľ vykonáva práce v stave vylučujúcom spôsobilosť, vyvolanom požitím '
        + 'alkoholických nápojov, omamných látok alebo psychotropných látok, prípadne '
        + 'zhotoviteľ vykazuje známky správania, ktoré bezprostredne ohrozuje bezpečnosť, '
        + 'plynulosť prác a ochranu zdravia pri práci vlastnú, ako aj iných osôb na '
        + 'pracovisku / stavenisku.' },
  ];

  /** Článok X, bod, v ktorom sú dôvody odstúpenia (ukončovací list ho cituje). */
  const BOD_ODSTUPENIE = 6;

  /**
   * Zoznam činností do Objednávky — „Platný od 26.04.2026" (Google Drive).
   * Sú to názvy voľných živností: text sa musí zhodovať so živnostenským
   * oprávnením živnostníka a ten istý text ide na jeho faktúru (položka
   * „činnosť podľa platnej objednávky"). Spravuje sa v Nastaveniach
   * (oddiel `subcontract`, pole `cinnosti`, jeden riadok = jedna činnosť,
   * remeslá za lomkou v tvare „/maliari, …/"); toto sú predvolené hodnoty.
   */
  const CINNOSTI_OD = '2026-04-26';
  const CINNOSTI = [
    { text: 'Dokončovacie stavebné práce pri realizácii exteriérov a interiérov',
      remesla: ['maliari', 'zatepľovači', 'sadrokartonisti', 'dlaždiči zámkových dlažieb',
        'montéri okien', 'montéri dverí s maximálne 3-bodovým zamykaním', 'allrounder',
        'montéri nábytku', 'vzduchotechnici bez zásahu do elek. častí'] },
    { text: 'Prípravné práce k realizácii stavby', remesla: ['viazači železa', 'allrounder'] },
    { text: 'Výroba a hutnícke spracovanie kovov, výroba a opracovanie jednoduchých kovových výrobkov',
      remesla: ['zvárači', 'zámočníci'] },
    { text: 'Opracovanie drevnej hmoty, výroba komponentov z dreva a výroba jednoduchých výrobkov z dreva, korku, slamy',
      remesla: ['montéri nábytku'] },
  ];

  /** Jedna činnosť do riadku Nastavení: „Text /remeslo, remeslo/". */
  function cinnostRiadok(c) {
    return c.remesla && c.remesla.length ? `${c.text} /${c.remesla.join(', ')}/` : c.text;
  }

  /**
   * Činnosti z Nastavení (`rules.cinnosti` — text, riadok = činnosť), inak
   * predvolené. Riadok „Text /a, b/" sa rozloží na text a remeslá.
   */
  function cinnosti(rules = {}) {
    const raw = rules && rules.cinnosti;
    const riadky = Array.isArray(raw) ? raw : String(raw || '').split(/\r?\n/);
    const out = riadky.map(r => (typeof r === 'object' && r ? r : null)
      || (() => {
        const t = String(r || '').trim();
        if (!t) return null;
        const m = t.match(/^(.*?)\s*\/([^/]*)\/\s*$/);
        return m ? { text: m[1].trim(), remesla: m[2].split(',').map(x => x.trim()).filter(Boolean) }
          : { text: t, remesla: [] };
      })()).filter(c => c && c.text);
    return out.length ? out : CINNOSTI.map(c => ({ ...c, remesla: [...c.remesla] }));
  }

  /**
   * Miesta výkonu činností — blok „Miesto vykonania činností" na objednávke
   * živnostníkovi a dokument „Stavby" (šablóny na Drive): adresy stavieb
   * v Nemecku, adresa na Slovensku a dva pevné riadky o celom území oboch
   * štátov. Celé územie a adresa v SR sú tam kvôli A1 (činnosť vo viacerých
   * štátoch) — preto sa nevynechávajú, ani keď je stavba len jedna.
   */
  const CELE_UZEMIE = ['celé územie Nemeckej republiky', 'celé územie Slovenskej republiky'];

  /** Adresa stavby z karty zákazky: „Ulica 1, 89077 Ulm, Nemecko". */
  function adresaStavby(sc = {}) {
    const ulica = String(sc.site_address || '').trim();
    const mesto = [sc.site_postal_code, sc.site_city].map(x => String(x || '').trim()).filter(Boolean).join(' ');
    const a = [ulica, mesto].filter(Boolean).join(', ') || String(sc.site_name || sc.title || '').trim();
    if (!a) return '';
    return /nemecko|deutschland|slovensko/i.test(a) ? a : `${a}, Nemecko`;
  }

  /**
   * @param {Object} o
   *   stavby    zákazky ({ site_address, site_postal_code, site_city, tag })
   *   miestoSk  adresa v SR (Nastavenia → subcontract.miesto_sk, inak sídlo)
   *   tagy      pripísať remeslo „/maliari/" (dokument Stavby áno, objednávka nie)
   */
  function miesta({ stavby = [], miestoSk = '', tagy = false } = {}) {
    const out = [];
    const videne = new Set();
    for (const s of stavby || []) {
      const a = adresaStavby(s || {});
      if (!a) continue;
      const riadok = tagy && s.tag ? `${a} /${String(s.tag).trim()}/` : a;
      if (videne.has(riadok)) continue;
      videne.add(riadok);
      out.push(riadok);
    }
    const sk = String(miestoSk || '').trim();
    if (sk) out.push(/slovensko|slovakia|slowakei/i.test(sk) ? sk : `${sk}, Slovensko`);
    return [...out, ...CELE_UZEMIE];
  }

  /**
   * Dohoda o vyhotovovaní faktúr objednávateľom (článok V. body 10 až 14).
   *
   * Rozhodnutie majiteľa: predvolene si živnostník vystavuje faktúru sám
   * (vzor faktúry V1.3), ale zmluva má **dovoliť**, aby faktúru vyhotovila
   * naša firma v jeho mene — bez novej zmluvy, keď sa to s ním dohodne.
   * Firemná šablóna takú doložku nemá; text je nový a pred použitím ho má
   * skontrolovať právnik (NA KONTROLU PRÁVNIKOM).
   *
   * Body sú na konci článku V., aby sa nezmenilo číslovanie bodov 1 až 9
   * zo šablóny ani ostatných článkov (ukončovací list cituje čl. X bod 6).
   */
  function samofakturacia(s = SUMY) {
    return [
      'Zmluvné strany sa dohodli, že Objednávateľ je oprávnený vyhotoviť faktúru za dielo podľa '
        + 'tejto Zmluvy v mene a na účet Zhotoviteľa (vyhotovenie faktúry odberateľom v zmysle '
        + 'zákona č. 222/2004 Z. z. o dani z pridanej hodnoty v znení neskorších predpisov). '
        + 'Vyhotovenie faktúry Objednávateľom je jeho oprávnením, nie povinnosťou. Pokiaľ '
        + 'Objednávateľ Zhotoviteľovi vopred písomne, e-mailom alebo správou podľa čl. VI bod 1 '
        + 'neoznámi, že faktúry za určité obdobie vyhotoví sám, vystavuje faktúry Zhotoviteľ podľa '
        + 'bodov 2 až 9 tohto článku.',
      'Podkladom pre faktúru vyhotovenú Objednávateľom sú súpisy vykonaných prác potvrdené podľa '
        + 'bodov 2 a 3 tohto článku a odplata dohodnutá v objednávke. Faktúra obsahuje všetky '
        + 'zákonné náležitosti a údaj „vyhotovenie faktúry odberateľom".',
      'Faktúru vyhotovenú Objednávateľom doručí Objednávateľ Zhotoviteľovi elektronicky na '
        + 'kontakty uvedené v záhlaví tejto Zmluvy (e-mailom, SMS alebo cez Whatsapp). Zhotoviteľ '
        + 'faktúru akceptuje jej potvrdením. Pokiaľ Zhotoviteľ do '
        + `${dni(s.samofakt_namietka_dni)} od jej doručenia nevznesie písomne odôvodnenú námietku, `
        + 'má sa za to, že faktúru akceptoval. Lehota splatnosti podľa bodu 5 tohto článku plynie '
        + 'od doručenia faktúry Zhotoviteľovi.',
      'Faktúry vyhotovené Objednávateľom sa číslujú v samostatnom číselnom rade Zhotoviteľa. Za '
        + 'obdobie, za ktoré Objednávateľ faktúru vyhotovil, Zhotoviteľ vlastnú faktúru '
        + 'nevystavuje. Za správnosť údajov o Zhotoviteľovi uvedených na faktúre (najmä obchodné '
        + 'meno, sídlo, IČO, DIČ a číslo účtu) a za daňové a účtovné spracovanie faktúry zodpovedá '
        + 'Zhotoviteľ; zmenu týchto údajov, ako aj registráciu za platiteľa DPH, je povinný '
        + 'Objednávateľovi oznámiť bez zbytočného odkladu.',
      'Vyhotovovanie faktúr Objednávateľom môže ktorákoľvek zmluvná strana písomne odmietnuť; '
        + 'odmietnutie je účinné od nasledujúceho fakturačného obdobia. Od tej chvíle vystavuje '
        + 'faktúry Zhotoviteľ podľa bodov 2 až 9 tohto článku.',
    ];
  }

  /**
   * Trinásť článkov zmluvy (I. sú zmluvné strany na papieri). Každý je
   * `{ rim, nadpis, body: [...] }`; `body` sú body, ktoré sa v dokumente
   * číslujú 1, 2, 3 …
   *
   * Bod je text, alebo `{ text, list, letters }` — bod s vymenovaním pod
   * sebou (odrážky, pri `letters` písmená a) b) c) …).
   *
   * **Text je doslovne podľa firemnej šablóny** „Zmluva o dielo" (Google
   * Drive, 05 - ŠABLÓNY - Zmluvy - Subdodávatelia / 00 - Šablóny). Sumy
   * a lehoty sú z `SUMY`, teda z Nastavení. Nové sú len body 10 až 14
   * článku V. (vyhotovenie faktúry odberateľom) a bod 2 článku XI.
   *
   * @param {Object} o  { s } — sumy a lehoty po zlúčení s Nastaveniami
   */
  function clanky({ s = SUMY } = {}) {
    return [
      {
        rim: 'II.', nadpis: 'Predmet zmluvy',
        body: [
          'Predmetom tejto Zmluvy je dohoda Zmluvných strán o podmienkach uzatvárania '
            + 'individuálnych zmlúv o dielo, dohoda o obsahu týchto zmlúv a o právach a povinnostiach '
            + 'Zmluvných strán v individuálnych zmluvách o dielo.',
          'Touto zmluvou sa Zhotoviteľ zaväzuje, že na základe individuálne uzavretých zmlúv bude '
            + 'pre objednávateľa zhotovovať vo vlastnom mene a na vlastnú zodpovednosť počas doby '
            + 'trvania tejto zmluvy diela, ktorých špecifikácia bude vyplývať z jednotlivých '
            + 'individuálnych zmlúv, resp. objednávok.',
          'Zhotoviteľ berie na vedomie, že Objednávateľ objednáva zhotovenie diela pre svojho '
            + 'ďalšieho zmluvného partnera - iného objednávateľa.',
        ],
      },
      {
        rim: 'III.', nadpis: 'Uzatvorenie individuálnej zmluvy o dielo - Objednávka',
        body: [
          'Uzavretím individuálnej zmluvy o dielo sa rozumie vystavenie Objednávky Objednávateľom '
            + 'a jej akceptácia Zhotoviteľom.',
          'Objednávku na jednotlivé diela Objednávateľ doručí Zhotoviteľovi e-mailom na jeho adresu '
            + 'uvedenú v záhlaví tejto Zmluvy, poštou alebo odovzdá osobne.',
          `Zhotoviteľ sa zaväzuje objednávku akýmkoľvek preukázateľným spôsobom akceptovať. Pokiaľ `
            + `Zhotoviteľ objednávku neakceptuje do ${dni(s.sucin_dni)} od jej doručenia, má sa za `
            + `to, že objednávka bola akceptovaná v ${poradie(s.sucin_dni)} deň od jej doručenia `
            + `v súlade s touto Zmluvou. Prijatím - akceptáciou objednávky Zhotoviteľ vyslovuje `
            + `súhlas s obsahom objednávky, pričom prijatie objednávky je akceptáciou návrhu `
            + `individuálnej zmluvy o dielo a považuje sa za platné a účinné uzatvorenie `
            + `individuálnej zmluvy o dielo. Pokiaľ má Zhotoviteľ výhrady k obsahu objednávky, je `
            + `povinný tieto objednávateľovi písomne oznámiť v lehote najneskôr do `
            + `${dni(s.sucin_dni)} od doručenia objednávky.`,
          'Každá zmena objednávky musí byť urobená písomnou formou, pričom z nej musí vyplývať '
            + 'konkretizácia zmenených podmienok oproti akceptovanej objednávke Objednávateľa.',
          {
            text: 'Každá objednávka objednávateľa bude obsahovať:',
            list: [
              'odkaz na túto Zmluvu',
              'špecifikáciu individuálneho diela a to popisom, prípadne odkazom na rozpočet, '
                + 'projektovú dokumentáciu alebo inú listinu, z ktorej bude zrejmý predmet '
                + 'individuálneho diela vrátane jeho kvalitatívnych a kvantitatívnych požiadaviek',
              'určenie miesta, kde má byť dielo zhotovované',
              'určenie termínu začatia zhotovovania diela a termínu ukončenia diela',
              'cena za zhotovené dielo',
            ],
          },
          'Zhotoviteľ sa zaväzuje individuálne dielo špecifikované v objednávke Objednávateľa '
            + 'zhotoviť v súlade s požiadavkami Objednávateľa a v súlade s touto Zmluvou.',
          'Objednávateľ nie je povinný vystaviť Zhotoviteľovi objednávky na celú dobu platnosti '
            + 'a účinnosti tejto Zmluvy a Zhotoviteľ berie na vedomie, že frekvencia vystavenia '
            + 'objednávok je v celom rozsahu v kompetencii Objednávateľa a závisí od individuálnej '
            + 'momentálnej vyťaženosti Objednávateľa.',
        ],
      },
      {
        rim: 'IV.', nadpis: 'Podmienky vykonania diela',
        body: [
          'Zhotoviteľ vyhlasuje, že disponuje zodpovedajúcou odbornosťou a kvalifikáciou a je '
            + 'pripravený Objednávateľovi poskytnúť požadované služby s potrebnou odbornosťou, '
            + 'starostlivosťou a kvalifikáciou.',
          'Zhotoviteľ vykoná jednotlivé diela podľa každej objednávky na vlastné náklady '
            + 'a nebezpečenstvo a v čase stanovenom v objednávke. Zhotoviteľ môže vykonávať diela '
            + 'podľa tejto zmluvy aj prostredníctvom svojich zamestnancov so zodpovedajúcimi '
            + 'skúsenosťami a kvalifikáciou. Zhotovenie diela prostredníctvom subdodávateľa je možné '
            + 'len v prípade, ak s tým Objednávateľ vopred súhlasí, pričom tento súhlas musí byť '
            + 'daný v každom konkrétnom prípade, a to písomne. Pre tento prípad má Zhotoviteľ '
            + 'zodpovednosť akoby dielo vykonával sám.',
          'Zhotoviteľ sa touto Zmluvou zaväzuje po prijatí objednávky vyvinúť maximálne úsilie za '
            + 'účelom riadneho, včasného a odborného vykonania objednaného diela.',
          'Pracovné pomôcky a pracovné náradie si Zhotoviteľ zabezpečuje na vlastné náklady.',
          'Náklady na cestu a ubytovanie Zhotoviteľa, resp. zamestnancov Zhotoviteľa alebo iných '
            + 'osôb konajúcich v mene Zhotoviteľa do miesta realizácie diela znáša Zhotoviteľ.',
          'Pri vykonávaní jednotlivých diel postupuje Zhotoviteľ samostatne, avšak je pri určení '
            + 'spôsobu vykonania diela viazaný pokynmi Objednávateľa – zhotoviteľ sa pri poskytovaní '
            + 'služieb zaväzuje plne rešpektovať inštrukcie Objednávateľa alebo ním poverené osoby.',
          'Zhotoviteľ je povinný bezodkladne písomne informovať Objednávateľa o nevhodnosti '
            + 'inštrukcií či príkazov daných mu Objednávateľom v prípade, že túto nevhodnosť je '
            + 'možné zistiť s vynaložením potrebnej odbornej starostlivosti. Zhotoviteľ je ďalej '
            + 'povinný písomne informovať Objednávateľa o všetkých okolnostiach, ktoré môžu mať '
            + 'vplyv na zmenu príkazov či inštrukcií Objednávateľa.',
          'Zhotoviteľ sa zaväzuje bez zbytočného odkladu písomne informovať objednávateľa '
            + 'o akýchkoľvek skutočnostiach, ktoré môžu mať vplyv na riadne a včasné poskytovanie '
            + 'služieb alebo realizáciu diela.',
          'Zhotoviteľ je povinný zhotovovať dielo v súlade s časovým harmonogramom prác, ktorý tvorí '
            + 'prílohu objednávky alebo je poskytnutý v mieste projektu kontaktnou osobou.',
        ],
      },
      {
        rim: 'V.', nadpis: 'Cena za dielo a platobné podmienky',
        body: [
          'Zmluvné strany sa dohodli, že cena za jednotlivé individuálne objednávané diela podľa '
            + 'tejto Zmluvy bude dohodnutá v objednávke spôsobom podľa čl. III. tejto Zmluvy.',
          `Cenu diela je Zhotoviteľ oprávnený fakturovať každých ${dni(s.fakturacia_dni)} trvania `
            + `objednávky, pozadu za vykonané práce na diele a faktúru zašle objednávateľovi, pokiaľ `
            + `sa zmluvné strany nedohodnú inak. Podkladom pre fakturáciu je: a) **montážny denník**, `
            + `b) **súpis vykonaných prác potvrdený objednávateľom**, alebo ním určenou osobou `
            + `c) **objednávka** (všetky 3 podklady súčasne).`,
          'Súpisy prác, ktoré tvoria podklad k fakturácii je povinný Zhotoviteľ zasielať '
            + 'Objednávateľovi na potvrdenie priebežne, v týždňových intervaloch vždy najneskôr do '
            + '3-ho dňa nasledujúceho týždňa po týždni, v ktorom sa práce zhotovovali, a to na '
            + 'základe skutočne zrealizovaných prác. Súpis prác musí byť podpísaný osobou poverenou '
            + 'na stavbe, pričom kontaktné údaje tejto osoby budú pri každej zákazke oznámené '
            + 'Zhotoviteľovi osobitne alebo budú súčasťou objednávky.',
          'Zhotoviteľ má nárok na odmenu len za skutočne zrealizované práce, ktoré boli '
            + 'zrealizované v rozsahu a kvalite požadovanej Objednávateľom. V prípade, že '
            + 'Objednávateľ zistí, že Zhotoviteľ vykázal väčší rozsah prác, ako je skutočne ním '
            + 'vykonaný rozsah, je oprávnený v spornom rozsahu odmietnuť plnenie, a to až doby, kedy '
            + 'sa preukáže skutočný rozsah Zhotoviteľom vykonaných prác.',
          `Splatnosť jednotlivých faktúr je ${dni(s.splatnost_dni)} od ich doručenia `
            + `Objednávateľovi, ak sa Zmluvné strany nedohodli inak.`,
          'Objednávateľ sa zaväzuje cenu diela alebo jej časti vyfakturovanú zhotoviteľom v súlade '
            + 's týmto článkom zmluvy riadne a včas zaplatiť. Cena diela alebo jej časti sa považuje '
            + 'za uhradenú dňom pripísania fakturovanej sumy na bankový účet zhotoviteľa uvedený '
            + 'v záhlaví tejto zmluvy.',
          'Objednávateľ je oprávnený odmietnuť zaplatenie ceny diela a zároveň Zhotoviteľovi '
            + 'nevzniká nárok na zaplatenie ceny diela v prípade, ak Zhotoviteľ nepredloží '
            + 'k faktúre podklady podľa bodu 2 tohto článku alebo si nesplní povinnosti podľa bodu 3 '
            + 'tohto článku.',
          `Ak v priebehu realizácie diela vznikne odôvodnená obava, že zmluvný partner `
            + `Objednávateľa (objednávateľ vo vzťahu k Objednávateľovi) odmietne zaplatiť `
            + `Objednávateľovi riadne a včas cenu za dielo podľa zmluvy o dielo, v ktorej `
            + `Objednávateľ vystupuje v pozícii zhotoviteľa a pokiaľ takáto obava bude vyplývať zo `
            + `spôsobu realizácie diela Zhotoviteľom podľa tejto zmluvy, je po predchádzajúcom `
            + `oznámení tejto skutočnosti Zhotoviteľovi oprávnený Objednávateľ predĺžiť lehotu `
            + `splatnosti faktúry Zhotoviteľa tak, že odmena Zhotoviteľa bude splatná do 7 dní po `
            + `tom, čo za spornú časť diela, ktoré nebolo uhradené v súvislosti s plnením zo strany `
            + `Zhotoviteľa podľa tejto Zmluvy, obdrží zaplatenú cenu diela Objednávateľ. Takéto `
            + `predĺženie splatnosti ceny diela je možné maximálne o dobu `
            + `${mesiace(s.splatnost_predlzenie_mes)}.`,
          'Faktúra vystavená Zhotoviteľom musí obsahovať všetky zákonné náležitosti faktúry. Pokiaľ '
            + 'faktúra tieto náležitosti obsahovať nebude, Objednávateľ je oprávnený faktúru vrátiť '
            + 'na prepracovanie s tým, že po doručení opravenej faktúry plynie nová lehota '
            + 'splatnosti faktúry.',
          ...samofakturacia(s),
        ],
      },
      {
        rim: 'VI.', nadpis: 'Práva a povinnosti zmluvných strán',
        body: [
          `Zhotoviteľ sa zaväzuje, že vykoná dielo podľa tejto zmluvy riadne a včas, v rozsahu, `
            + `kvalite a lehotách dohodnutých v tejto zmluve a v príslušnej objednávke, na vlastnú `
            + `zodpovednosť a vlastné nebezpečenstvo. Zhotoviteľ je povinný nastúpiť na začiatok `
            + `prác pri zhotovovaní diela v deň a v mieste uvedenom v objednávke objednávateľa, `
            + `pričom objednávka bude doručená zhotoviteľovi minimálne ${dni(s.nastup_oznamenie_dni)} `
            + `vopred. Ak nastanú skutočnosti, podľa ktorých zhotoviteľ nemôže nastúpiť na `
            + `zhotovovanie diela podľa objednávky, je povinný to bezodkladne oznámiť `
            + `objednávateľovi, najneskôr však ${dni(s.nastup_oznamenie_dni)} pred dohodnutým `
            + `termínom začiatku vykonávania diela a zároveň nedostavenie sa riadne zdôvodniť a dôvod `
            + `preukázať objednávateľovi. Miesto a čas začatia diela môže byť Zhotoviteľovi oznámené `
            + `aj samostatným oznámením, ktoré bude Zhotoviteľovi zaslané spravidla e-mailom na `
            + `adresu uvedenú v záhlaví tejto Zmluvy alebo formou textovej správy cez SMS, Whatsapp `
            + `alebo inú platformu, cez ktorú Objednávateľ so Zhotoviteľom komunikuje.`,
          'Zhotoviteľ je povinný vykonať dielo spôsobom, ktorý určuje táto zmluva a jednotlivé '
            + 'objednávky uskutočnené na jej základe. Zhotoviteľ berie na vedomie, že pokiaľ nebude '
            + 'mať od Objednávateľa postačujúce podklady na riadnu realizáciu diela, podklady '
            + 'považovať za nedostačujúce alebo nevhodné, bezodkladne túto skutočnosť oznámi '
            + 'Objednávateľovi, inak uvedené skutočnosti nemôže v súvislosti s plnením svojich '
            + 'povinností namietať.',
          'Zhotoviteľ sa zaväzuje postupovať pri plnení predmetu tejto rámcovej zmluvy '
            + 'a individuálnych zmlúv uzatváraných podľa jednotlivých objednávok s odbornou '
            + 'starostlivosťou, dodržiavajúc všeobecne záväzné právne predpisy, pracovné predpisy na '
            + 'pracovisku, technické normy a dohodnuté zmluvné podmienky, zároveň je povinný '
            + 'dodržiavať čistotu a poriadok na pracovisku pri vykonávaní diela.',
          'Zhotoviteľ je povinný pri vykonávaní diela dodržiavať všeobecne platné predpisy '
            + 'bezpečnosti a ochrany zdravia pri práci (ďalej len „BOZP"), požiarnej ochrany (ďalej '
            + 'len „PO") a ochrany životného prostredia (ďalej len „OŽP"), ako aj konkrétne '
            + 'bezpečnostné predpisy daného pracoviska, s ktorými bude oboznámený pred nástupom do '
            + 'práce. Opakované porušovanie predpisov BOZP, PO a OŽP bude považované za podstatné '
            + 'porušenie zmluvy. Zhotoviteľ ďalej prehlasuje, že aj osoby, ktoré sa na pracovisku '
            + 'budú nachádzať so súhlasom zhotoviteľa alebo na základe jeho požiadavky, sú v tejto '
            + 'oblasti preškolené.',
          `Zhotoviteľ vyhlasuje, že pokiaľ bude v súvislosti s realizáciou diela potrebné splniť `
            + `administratívne povinnosti (vystavenie prenosného dokumentu **A1**, prihlásenie na daň `
            + `v zahraničí (**Freistellung**) alebo iné), tieto povinnosti si splní riadne a včas. `
            + `V prípade, že si Zhotoviteľ svoje povinnosti v súvislosti s prihlásením na daň `
            + `v zahraničí (Freistellung) nesplní a Objednávateľovi vznikne povinnosť odvádzať za `
            + `Zhotoviteľa stavebnú zrážkovú daň, je Objednávateľ oprávnený si výdavok v súvislosti `
            + `so stavebnou zrážkovou daňou uplatniť u Zhotoviteľa v plnej výške a započítať si ho `
            + `oproti faktúre Zhotoviteľa. Zároveň je Objednávateľ oprávnený si účtovať u Zhotoviteľa `
            + `sumu ${eur(s.freistellung_poplatok)} ako spracovateľský poplatok v súvislosti `
            + `s úhradou stavebnej zrážkovej dane a podaním daňového priznania, a to za každú takúto `
            + `úhradu.`,
          `Zhotoviteľ sa pri plnení predmetu tejto zmluvy zaväzuje dodržiavať nariadenia súvisiace `
            + `so zákazom prechovávania, požívania a zdržiavania sa pod vplyvom alkoholu alebo iných `
            + `omamných a návykových látok na pracovisku. Za prechovávanie alebo požitie alkoholu `
            + `alebo iných omamných a návykových látok kdekoľvek na pracovisku alebo zdržiavanie sa `
            + `osôb na pracovisku pod vplyvom alkoholu alebo iných omamných a návykových látok, je `
            + `objednávateľ oprávnený požadovať od zhotoviteľa za každý prípad zvlášť zmluvnú pokutu `
            + `vo výške ${eur(s.pokuta_alkohol)}. Porušenie povinností podľa tohto bodu sa zároveň `
            + `považuje za podstatné porušenie zmluvy a môže byť dôvodom na odstúpenie od zmluvy.`,
          `Zhotoviteľ sa pri plnení predmetu tejto zmluvy zaväzuje dodržiavať nariadenia súvisiace `
            + `so zákazom a obmedzením fajčenia v priestoroch prevádzok, kde je fajčenie zakázané. Za `
            + `porušenie týchto nariadení je objednávateľ oprávnený požadovať od zhotoviteľa za každý `
            + `prípad zvlášť, a to i opakovane, zmluvnú pokutu vo výške ${eur(s.pokuta_fajcenie)}.`,
          'Potrebné ochranné pracovné prostriedky, pracovné oblečenie, pracovné prostriedky si '
            + 'zabezpečuje zhotoviteľ sám na vlastné náklady, ak sa zmluvné strany nedohodli inak.',
          'Cestovné náklady na dostavenie sa do miesta plnenia, ako aj náklady na ubytovanie nie sú '
            + 'zahrnuté v cene diela a hradí si ich Zhotoviteľ. Zhotoviteľ sa môže s Objednávateľom '
            + 'dohodnúť, že mu Objednávateľ zabezpečí alebo sprostredkuje ubytovanie, prípadne '
            + 'dopravu do miesta plnenia, v každom prípade však tieto služby budú realizované na '
            + 'náklady Zhotoviteľa a v prípade, že ich uhradí Objednávateľ, budú započítané oproti '
            + 'faktúre Zhotoviteľa.',
          'V prípade, ak v súvislosti s plnením podľa tejto Zmluvy vznikne pre Zhotoviteľa '
            + 'potreba/povinnosť absolvovať školenie, vstupný test, skúšku a tieto budú spoplatnené, '
            + 'Zhotoviteľ berie na vedomie, že takýto výdavok bude jeho výdavkom a zaväzuje sa ho '
            + 'uhradiť Zhotoviteľovi alebo priamo tretej osobe, ktorá požadovanú službu v danom '
            + 'prípade poskytne.',
          'Zhotoviteľ je povinný pred výkonom činnosti uzavrieť a trvale udržovať v platnosti '
            + 'poistenie všeobecnej zodpovednosti podnikateľa a ďalej uzavrieť a udržovať poistenie '
            + 'zodpovednosti za škody spôsobené tretím osobám. Zhotoviteľ je Objednávateľovi povinný '
            + 'preukázať doklady o jeho poistení.',
          'Objednávateľ sa zaväzuje poskytnúť zhotoviteľovi nevyhnutnú a potrebnú súčinnosť pri '
            + 'zhotovovaní diela. Objednávateľ je oprávnený bez obmedzenia kontrolovať vykonávanie '
            + 'diela prostredníctvom svojich zamestnancov, prípadne poverených osôb. Ak objednávateľ '
            + 'zistí, že zhotoviteľ vykonáva dielo v rozpore so svojimi povinnosťami, je objednávateľ '
            + 'oprávnený bezodkladne požadovať nápravu, podať zhotoviteľovi príslušné pokyny '
            + 'a technické inštrukcie za účelom riadneho vykonávania diela, ako aj požadovať '
            + 'odstránenie vád vzniknutých vadným vykonávaním diela.',
          'Ak zhotoviteľ zistí pri vykonávaní diela skryté prekážky týkajúce sa vecí na ktorých '
            + 'alebo ktorými sa má vykonať dielo podľa tejto zmluvy a príslušnej objednávky a tieto '
            + 'prekážky znemožňujú vykonanie diela dohodnutým spôsobom, je zhotoviteľ povinný oznámiť '
            + 'to bez zbytočného odkladu objednávateľovi a požadovať bezodkladné odstránenie '
            + 'takýchto prekážok.',
          'Obidve zmluvné strany sú povinné zachovávať mlčanlivosť o všetkých informáciách, ktoré '
            + 'získali v súvislosti s plnením predmetu tejto zmluvy a takto získané informácie '
            + 'nesmú ďalej ani používať v neprospech druhej zmluvnej strany.',
        ],
      },
      {
        rim: 'VII.', nadpis: 'Zodpovednosť za vady',
        body: [
          'Zhotoviteľ zodpovedá za vady diela v zmysle § 560 a nasl. Obchodného zákonníka.',
          `Zhotoviteľ poskytuje záruku za akosť diela v dĺžke ${mesiace(s.zaruka_mes)}. Zhotoviteľ `
            + `preberá záruku, že ním zhotovené dielo si zachová počas záručnej doby obvyklé `
            + `vlastnosti a bude spôsobilé na užívanie pre účel, pre ktorý bolo zhotovené.`,
          'Záručná doba začína plynúť dňom odovzdania celého zhotoveného diela objednávateľovi '
            + 'alebo dňom ukončenia prác zo strany Zhotoviteľa.',
          'Plynutie záručnej doby na dotknutú časť diela sa preruší dňom uplatnenia práva '
            + 'objednávateľa na odstránenie vád diela. Plynutie záručnej doby pokračuje písomným '
            + 'potvrdením odstránenia závady objednávateľom.',
          'Zhotoviteľ zodpovedá za vady, ktoré má dielo v čase jeho odovzdania objednávateľovi a za '
            + 'vady, ktoré sa vyskytnú v záručnej dobe.',
          'Za rovnocenne zaslanú reklamáciu sa považuje aj zaslanie reklamácie e-mailom na adresu, '
            + 'ktorá je uvedená v záhlaví tejto zmluvy.',
          `Zhotoviteľ sa zaväzuje reklamované vady diela odstrániť v lehote ${dni(s.reklamacia_dni)} `
            + `odo dňa doručenia reklamácie, ak sa individuálne strany zmluvy nedohodnú inak.`,
          'V prípade, že Zhotoviteľ v dohodnutej lehote neodstráni vady z reklamácie po odovzdaní '
            + 'diela, ich odstránenie je oprávnený zabezpečiť objednávateľ na náklady zhotoviteľa. '
            + 'V prípade, že k odstraňovaniu vád podľa tohto bodu dôjde Objednávateľom alebo osobou '
            + 'poverenou Objednávateľom na náklady Zhotoviteľa a na prácach na Diele sa zúčastnili '
            + 'viacerí Zhotovitelia zazmluvnení Objednávateľom a nebude možné jednoznačne určiť, '
            + 'ktorý z nich za reklamované vady Diela zodpovedá, Zhotoviteľ berie na vedomie, že za '
            + 'reklamované vady zodpovedá spolu s ostatnými zhotoviteľmi rovným dielom.',
        ],
      },
      {
        rim: 'VIII.', nadpis: 'Zmluvné pokuty',
        body: [
          `Zmluvné strany sa dohodli, že zhotoviteľ je povinný zaplatiť zmluvnú pokutu vo výške `
            + `${eur(s.pokuta_konkurencia)} pre prípad porušenia zákazu konkurencie podľa článku IX. `
            + `bod 4 tejto zmluvy.`,
          `Zmluvné strany si dohodli zmluvnú pokutu vo výške ${eur(s.pokuta_omeskanie_den)} za každý `
            + `deň omeškania pre prípad porušenia povinnosti zhotoviteľa vykonávať a dokončiť dielo `
            + `uvedené v objednávke riadne a včas. Porušením povinnosti dokončiť dielo riadne a včas `
            + `sa rozumie najmä svojvoľné prerušenie prác a omeškanie s ukončením diela. Pokiaľ `
            + `k porušeniu povinností dôjde konaním viacerých zamestnancov zhotoviteľa alebo `
            + `viacerých osôb, ktoré zhotoviteľ v súvislosti s touto zmluvou zabezpečuje, `
            + `objednávateľ má nárok na zaplatenie zmluvnej pokuty za konanie každej takejto osoby `
            + `osobitne.`,
          `Zmluvné strany si dohodli zmluvnú pokutu vo výške ${eur(s.pokuta_nenastupenie)} pre `
            + `prípad porušenia povinnosti dostaviť sa riadne a včas k realizácii diela, resp. pre `
            + `porušenie povinnosti nastúpiť na práce podľa objednávky. Pokiaľ k porušeniu povinností `
            + `dôjde konaním viacerých zamestnancov zhotoviteľa alebo viacerých osôb, ktoré `
            + `zhotoviteľ v súvislosti s touto zmluvou zabezpečuje, objednávateľ má nárok na `
            + `zaplatenie zmluvnej pokuty za konanie každej takejto osoby osobitne.`,
          `Zmluvné strany si dohodli zmluvnú pokutu vo výške ${eur(s.pokuta_mlcanlivost)} za `
            + `porušenie povinnosti zachovania mlčanlivosti o obchodnom tajomstve podľa čl. IX tejto `
            + `Zmluvy.`,
          'Nárok na zaplatenie zmluvnej pokuty je objednávateľ oprávnený započítať s nárokom '
            + 'zhotoviteľa na zaplatenie ceny diela.',
          'Uplatnením nároku na zaplatenie zmluvných pokút podľa tohto článku zmluvy nie je žiadnym '
            + 'spôsobom dotknuté právo objednávateľa na náhradu škody. V prípade vzniku škody je '
            + 'objednávateľ oprávnený si vzniknutú škodu v celom rozsahu u zhotoviteľa uplatniť, '
            + 'a to bez ohľadu na to, či vo vzťahu k porušeniu zmluvnej povinnosti bol uplatnený aj '
            + 'nárok na zaplatenie zmluvnej pokuty.',
        ],
      },
      {
        rim: 'IX.', nadpis: 'Obchodné tajomstvo a zákaz konkurencie',
        body: [
          `Zhotoviteľ berie na vedomie, že skutočnosti, o ktorých sa dozvedel pri uzatváraní zmluvy `
            + `alebo pri plnení zmluvy sú dôvernými informáciami a tvoria obchodné tajomstvo podľa `
            + `príslušných ustanovení Obchodného zákonníka (ďalej len „obchodné tajomstvo"). Za `
            + `obchodné tajomstvo podľa tejto zmluvy sa považujú všetky informácie, údaje a skúsenosti `
            + `technického, prevádzkového, ekonomického a iného charakteru, ktoré sa týkajú predmetu `
            + `zmluvy vrátane informácií týkajúcich sa dohodnutých cien za dielo. Za obchodné `
            + `tajomstvo sa považujú aj všetky vyššie popísané informácie tretej osoby, o ktorých sa `
            + `zhotoviteľ dozvie v súvislosti s realizáciou zákazky podľa tejto zmluvy alebo `
            + `individuálnej objednávky. Zhotoviteľ je povinný obchodné tajomstvo, ako aj všetky `
            + `poskytnuté doklady a dokumenty chrániť a zachovávať o nich mlčanlivosť aj po ukončení `
            + `tejto zmluvy, a to po dobu minimálne ${mesiace(s.mlcanlivost_mes)}.`,
          'Zhotoviteľ sa zaväzuje, že bez predchádzajúceho písomného súhlasu objednávateľa neporuší '
            + 'mlčanlivosť vo vzťahu k dôverným informáciám, nepoužije dôverné informácie priamo '
            + 'alebo nepriamo inak než pre účel plnenia svojich povinností podľa tejto zmluvy '
            + 'a nezverejní ani inak neposkytne dôverné informácie žiadnej tretej osobe, okrem '
            + 'svojich zamestnancov alebo Objednávateľom vopred písomne odsúhlasených subdodávateľov, '
            + 'ktorých Zhotoviteľ zaviaže v rovnakom rozsahu, ako je sám zaviazaný podľa tejto '
            + 'zmluvy.',
          'Zhotoviteľ zodpovedá za škodu spôsobenú porušením povinnosti zachovávať mlčanlivosť '
            + 'podľa predchádzajúceho bodu ako aj za akúkoľvek škodu, ktorá vznikne v súvislosti '
            + 's vyzradením, zverejnením alebo iným sprístupnením obchodného tajomstva tretej osobe.',
          `Zhotoviteľ sa zaväzuje, že počas doby platnosti tejto zmluvy a po dobu `
            + `${roky(s.konkurencia_roky)} odo dňa ukončenia jej platnosti a účinnosti nebude sám, `
            + `ako ani prostredníctvom iných osôb, ktoré sú s ním spriaznené alebo v ktorých má priamu `
            + `alebo nepriamu majetkovú účasť uzatvárať zmluvy o dielo ani žiadnym iným spôsobom `
            + `zhotovovať dielo (či už priamo alebo prostredníctvom tretej osoby) pre zmluvných `
            + `partnerov objednávateľa alebo pre zmluvných partnerov zákazníka objednávateľa.`,
        ],
      },
      {
        rim: 'X.', nadpis: 'Trvanie a zánik zmluvy',
        body: [
          '{{TRVANIE}}',
          'Táto zmluva môže zaniknúť ako celok písomnou dohodou všetkých zmluvných strán. Zmluvné '
            + 'strany sú oprávnené vypovedať túto zmluvu aj formou elektronickej pošty, prednostne '
            + 'prostredníctvom dohodnutých kontaktných e-mailových adries uvedených v článku I. '
            + 'tejto zmluvy.',
          'Zmluva končí uplynutím času, na ktorý bola uzavretá.',
          `Objednávateľ môže túto zmluvu ako celok vypovedať s ${vypovednaLehota(s.vypoved_mes)}, `
            + `a to aj bez udania dôvodu s tým, že výpovedná lehota začne plynúť prvým dňom `
            + `kalendárneho mesiaca nasledujúceho po mesiaci, v ktorom bola výpoveď doručená `
            + `zhotoviteľovi.`,
          `Zhotoviteľ môže túto zmluvu ako celok vypovedať s ${vypovednaLehota(s.vypoved_mes)}, `
            + `a to aj bez udania dôvodu s tým, že výpovedná lehota začne plynúť prvým dňom `
            + `kalendárneho mesiaca nasledujúceho po mesiaci, v ktorom bola výpoveď doručená `
            + `objednávateľovi.`,
          {
            text: 'Objednávateľ je oprávnený bez ohľadu na štádium rozpracovanosti individuálne '
              + 'zhotovovaného diela okamžite odstúpiť od tejto zmluvy a zároveň od individuálne '
              + 'uzatvorenej zmluvy v prípade, ak:',
            list: DOVODY.map(d => d.text),
            letters: true,
          },
        ],
      },
      {
        rim: 'XI.', nadpis: 'Súhlas so spracovaním osobných údajov',
        body: [
          'V tejto zmluve dotknuté osoby súhlasia so spracovaním osobných údajov, pričom zoznam '
            + 'údajov je daný rozsahom použitia podľa tejto zmluvy, alebo v rozsahu danom v zmysle '
            + 'Nariadenia Európskeho parlamentu a Rady (EÚ) 2016/679 z 27. apríla 2016 o ochrane '
            + 'fyzických osôb pri spracúvaní osobných údajov a o voľnom pohybe takýchto údajov '
            + '(ďalej len „GDPR"). Dotknuté osoby vyhlasujú, že údaje sú úplné, správne a aktuálne '
            + 'a udeľujú súhlas s ich spracovaním na dobu neurčitú, alebo na dobu potrebnú na '
            + 'dosiahnutie účelu zmluvy. Súhlas so spracovaním osobných údajov je vyjadrený podpisom '
            + 'na tejto zmluve. Údaje sa spracúvajú pre účel zverejnenia, archivovania, sprístupnenia '
            + 'tretím subjektom, ako aj na iné účely potrebné na naplnenie predmetu zmluvy. '
            + 'Zákonnosť spracovania osobných údajov je na podklade čl. 6 ods. 1 písm. b) GDPR.',
          'Podrobný rozsah, účel, príjemcovia a doba uchovávania osobných údajov sú uvedené '
            + 'v samostatnom Súhlase so spracovaním osobných údajov.',
        ],
      },
      {
        rim: 'XII.', nadpis: 'Dohoda o rozhodnom práve',
        body: [
          'Táto zmluva a právne vzťahy z nej vyplývajúce sa riadia všeobecne záväznými právnymi '
            + 'predpismi Slovenskej republiky.',
          'Zmluvné strany si dohodli pre všetky spory, ktoré vzniknú z právnych vzťahov '
            + 'vyplývajúcich z tejto zmluvy alebo súvisiacich s touto zmluvou právomoc a príslušnosť '
            + 'všeobecných súdov Slovenskej republiky.',
        ],
      },
      {
        rim: 'XIII.', nadpis: 'Záverečné ustanovenia',
        body: [
          `Za účelom odstránenia prípadných pochybností v doručovaní sa zmluvné strany dohodli, že `
            + `písomnosť ktorejkoľvek zo zmluvných strán sa považuje za doručenú druhej zmluvnej `
            + `strane najneskôr na ${s.dorucenie_dni}. kalendárny deň odo dňa jej uloženia na pošte, `
            + `a to aj vtedy, ak sa písomnosť vráti späť odosielateľovi ako adresátom neprevzatá, `
            + `resp. nedoručiteľná alebo ak adresát oznámil doručovateľovi, že písomnosť odmieta `
            + `prevziať, pričom písomnosti sa budú zasielať výlučne doporučenou formou; to neplatí, `
            + `ak písomnosť bola adresátovi v skutočnosti doručená skôr. Zmluvné strany sa zároveň `
            + `dohodli aj na elektronickom doručovaní písomností, pričom platí, že písomnosť `
            + `ktorejkoľvek zo zmluvných strán sa považuje za doručenú druhej zmluvnej strane v deň `
            + `jej preukázateľného odoslania z emailovej adresy jednej zmluvnej strany, uvedenej `
            + `v záhlaví tejto zmluvy, na emailovú adresu druhej zmluvnej strany, uvedenú v záhlaví `
            + `tejto zmluvy.`,
          'Právne vzťahy vyplývajúce z tejto zmluvy sa spravujú príslušnými ustanoveniami '
            + 'Obchodného zákonníka.',
          'Táto zmluva je vyhotovená v dvoch (2) exemplároch, po jednom vyhotovení pre každú '
            + 'zmluvnú stranu.',
          'Zmluvné strany vyhlasujú, že si túto zmluvu prečítali a súhlasia s jej obsahom, že táto '
            + 'zmluva bola uzavretá na základe ich skutočnej, slobodnej a vážnej vôle bez omylu '
            + 'a výhrad, nie v tiesni za nápadne nevýhodných podmienok, zmluvné prejavy sú dostatočne '
            + 'zrozumiteľné a určité, na dôkaz čoho ju podpísali.',
        ],
      },
    ];
  }

  /** „v druhý deň" — radová číslovka pre akceptáciu objednávky (čl. III bod 3). */
  function poradie(n) {
    const R = ['', 'prvý', 'druhý', 'tretí', 'štvrtý', 'piaty', 'šiesty', 'siedmy'];
    return R[Number(n)] || `${n}.`;
  }

  /** „mesačnou výpovednou lehotou" (šablóna) alebo „výpovednou lehotou 2 mesiace". */
  function vypovednaLehota(n) {
    return Number(n) === 1 ? 'mesačnou výpovednou lehotou' : `výpovednou lehotou ${mesiace(n)}`;
  }

  /** Bod článku ako jeden text — na vyhľadávanie a testy (zoznam za dvojbodkou). */
  function bodText(b) {
    if (typeof b === 'string') return b;
    if (!b) return '';
    return `${b.text || ''} ${(b.list || []).map((x, i) => (b.letters
      ? `${String.fromCharCode(97 + i)}) ${x}` : x)).join(' ')}`.trim();
  }

  /**
   * Zmluva pripravená na vykreslenie: sumy zlúčené s Nastaveniami, dátumy
   * dopočítané a články s doplnenými hodnotami.
   *
   * @param {Object} o
   *   worker     živnostník
   *   supplier   fakturačné údaje z Nastavení
   *   rules      oddiel `subcontract` z Nastavení — prepisuje `SUMY`
   *   signedAt   deň podpisu (predvolene dnes)
   *   validTo    koniec platnosti (predvolene 31. 12. toho roka)
   *   number     číslo zmluvy
   */
  function build({ worker = {}, supplier = {}, rules = {}, signedAt, validTo, number,
    selfBilling = !!(worker && worker.self_billing) } = {}) {
    const s = { ...SUMY };
    for (const k of Object.keys(SUMY)) {
      const v = Number(rules[k]);
      if (Number.isFinite(v) && v > 0) s[k] = v;
    }
    const podpis = String(signedAt || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const koniec = validTo || koniecRoka(podpis);

    // Šablóna: „… a končí dňom 31.12.2026" — bez bodky na konci, doplnená.
    const trvanie = `Táto zmluva nadobúda platnosť a účinnosť dňom jej podpísania zmluvnými `
      + `stranami a končí dňom ${den(koniec)}.`;

    return {
      number: number || '',
      signedAt: podpis,
      validTo: koniec,
      sumy: s,
      worker, supplier,
      // Doložka o vyhotovení faktúry odberateľom je v zmluve vždy (čl. V. body
      // 10 až 14) — `selfBilling` len hovorí, či to so živnostníkom už robíme.
      selfBilling,
      clanky: clanky({ s }).map(c => ({
        ...c, body: c.body.map(p => (typeof p === 'string' ? p.replace('{{TRVANIE}}', trvanie) : p)),
      })),
    };
  }

  function den(d) {
    const t = String(d || '').slice(0, 10);
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : t;
  }

  /**
   * Čo chýba na to, aby sa zmluva dala podpísať. Prázdne miesto v zmluve nie
   * je drobnosť: zmluva bez IČO zhotoviteľa nie je zmluva so živnostníkom.
   */
  const POVINNE = [
    { key: 'full_name', kto: 'worker', title: 'meno živnostníka' },
    { key: 'company_id', kto: 'worker', title: 'IČO živnostníka' },
    { key: 'address', kto: 'worker', title: 'adresu živnostníka' },
    { key: 'name', kto: 'supplier', title: 'názov našej firmy' },
    { key: 'company_id', kto: 'supplier', title: 'naše IČO' },
    { key: 'address', kto: 'supplier', title: 'našu adresu' },
    { key: 'register', kto: 'supplier', title: 'náš zápis v obchodnom registri' },
  ];

  function missing({ worker = {}, supplier = {} } = {}) {
    const zdroj = { worker, supplier };
    return POVINNE.filter(f => {
      const v = zdroj[f.kto][f.key];
      return v === null || v === undefined || String(v).trim() === '';
    });
  }

  /**
   * Ďalšie voľné číslo zmluvy v tvare „2026-093".
   *
   * Zámerne to **nie je** `danubra_next_number`: ten istý počítadlo prideľuje
   * čísla faktúr a každé jeho zavolanie číslo spotrebuje — aj keď sa zmluva
   * nakoniec nepodpíše. Tu sa číslo len navrhne z toho, čo je už zapísané,
   * a v formulári sa dá prepísať. Kto raz napíše 094, ďalšia dostane 095.
   */
  function nextNumber(refs, rok) {
    const y = String(rok || new Date().getFullYear());
    let max = 0;
    for (const r of refs || []) {
      const m = String(r || '').trim().match(/^(\d{4})\s*[-/]\s*(\d{1,5})$/);
      if (m && m[1] === y) max = Math.max(max, Number(m[2]));
    }
    return `${y}-${String(max + 1).padStart(3, '0')}`;
  }

  const API = { SUMY, POVINNE, DOVODY, BOD_ODSTUPENIE, CINNOSTI, CINNOSTI_OD, clanky, samofakturacia,
    build, missing, koniecRoka, den, eur, plural, nextNumber, bodText, cinnosti, cinnostRiadok,
    CELE_UZEMIE, adresaStavby, miesta };
  if (typeof window !== 'undefined') window.DanubraSubcontract = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
