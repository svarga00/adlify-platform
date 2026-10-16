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
    fakturacia_dni: 14,         // ako často smie fakturovať
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
    freistellung_poplatok: 50,  // spracovateľský poplatok pri zrážkovej dani
    pokuta_alkohol: 500,
    pokuta_fajcenie: 350,
    pokuta_konkurencia: 10000,
    pokuta_omeskanie_den: 250,
    pokuta_nenastupenie: 2500,
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
   * Trinásť článkov zmluvy. Každý je `{ nadpis, body: [...] }`; `body` sú
   * odstavce, ktoré sa v dokumente číslujú.
   *
   * @param {Object} o  { s } — sumy a lehoty po zlúčení s Nastaveniami
   */
  function clanky({ s = SUMY } = {}) {
    return [
      {
        rim: 'II.', nadpis: 'Predmet zmluvy',
        body: [
          'Predmetom tejto Zmluvy je dohoda Zmluvných strán o podmienkach uzatvárania '
            + 'individuálnych zmlúv o dielo, dohoda o obsahu týchto zmlúv a o právach '
            + 'a povinnostiach Zmluvných strán v individuálnych zmluvách o dielo.',
          'Touto zmluvou sa Zhotoviteľ zaväzuje, že na základe individuálne uzavretých '
            + 'zmlúv bude pre Objednávateľa zhotovovať vo vlastnom mene a na vlastnú '
            + 'zodpovednosť počas doby trvania tejto zmluvy diela, ktorých špecifikácia '
            + 'bude vyplývať z jednotlivých individuálnych zmlúv, resp. objednávok.',
          'Zhotoviteľ berie na vedomie, že Objednávateľ objednáva zhotovenie diela pre '
            + 'svojho ďalšieho zmluvného partnera — iného objednávateľa.',
        ],
      },
      {
        rim: 'III.', nadpis: 'Uzatvorenie individuálnej zmluvy o dielo — objednávka',
        body: [
          'Uzavretím individuálnej zmluvy o dielo sa rozumie vystavenie Objednávky '
            + 'Objednávateľom a jej akceptácia Zhotoviteľom.',
          'Objednávku na jednotlivé diela Objednávateľ doručí Zhotoviteľovi e-mailom na '
            + 'adresu uvedenú v záhlaví tejto Zmluvy, poštou alebo odovzdá osobne.',
          `Zhotoviteľ sa zaväzuje objednávku akýmkoľvek preukázateľným spôsobom akceptovať. `
            + `Pokiaľ ju neakceptuje do ${dni(s.sucin_dni)} od jej doručenia, má sa za to, `
            + `že objednávka bola akceptovaná. Prijatím objednávky Zhotoviteľ vyslovuje `
            + `súhlas s jej obsahom a objednávka sa považuje za platne uzatvorenú `
            + `individuálnu zmluvu o dielo. Výhrady k obsahu objednávky je Zhotoviteľ `
            + `povinný oznámiť písomne najneskôr do ${dni(s.sucin_dni)} od jej doručenia.`,
          'Každá zmena objednávky musí byť urobená písomnou formou, pričom z nej musí '
            + 'vyplývať konkretizácia zmenených podmienok oproti akceptovanej objednávke.',
          'Každá objednávka bude obsahovať odkaz na túto Zmluvu, špecifikáciu diela, '
            + 'miesto zhotovovania, termín začatia a ukončenia a cenu za dielo.',
          'Objednávateľ nie je povinný vystaviť objednávky na celú dobu platnosti tejto '
            + 'Zmluvy; frekvencia objednávok závisí od jeho vyťaženosti.',
        ],
      },
      {
        rim: 'IV.', nadpis: 'Podmienky vykonania diela',
        body: [
          'Zhotoviteľ vyhlasuje, že disponuje zodpovedajúcou odbornosťou a kvalifikáciou '
            + 'a je pripravený poskytnúť požadované služby s potrebnou starostlivosťou.',
          'Zhotoviteľ vykoná jednotlivé diela na vlastné náklady a nebezpečenstvo a v čase '
            + 'stanovenom v objednávke. Zhotovenie diela prostredníctvom subdodávateľa je '
            + 'možné len s predchádzajúcim písomným súhlasom Objednávateľa; v takom prípade '
            + 'zodpovedá Zhotoviteľ, akoby dielo vykonával sám.',
          'Pracovné pomôcky a náradie si Zhotoviteľ zabezpečuje na vlastné náklady.',
          'Náklady na cestu a ubytovanie do miesta realizácie diela znáša Zhotoviteľ.',
          'Pri vykonávaní diel postupuje Zhotoviteľ samostatne; pri určení spôsobu '
            + 'vykonania diela je viazaný pokynmi Objednávateľa alebo ním poverenej osoby.',
          'Zhotoviteľ je povinný bezodkladne písomne informovať Objednávateľa o nevhodnosti '
            + 'pokynov a o všetkých okolnostiach, ktoré môžu mať vplyv na riadne a včasné '
            + 'zhotovenie diela.',
          'Zhotoviteľ je povinný zhotovovať dielo v súlade s časovým harmonogramom prác, '
            + 'ktorý tvorí prílohu objednávky alebo je poskytnutý v mieste projektu '
            + 'kontaktnou osobou.',
        ],
      },
      {
        rim: 'V.', nadpis: 'Cena za dielo a platobné podmienky',
        body: [
          'Cena za jednotlivé individuálne objednávané diela bude dohodnutá v objednávke '
            + 'spôsobom podľa článku III. tejto Zmluvy.',
          `Cenu diela je Zhotoviteľ oprávnený fakturovať každých ${dni(s.fakturacia_dni)} `
            + `trvania objednávky, pozadu za vykonané práce. Podkladom pre fakturáciu je `
            + `**montážny denník**, **súpis vykonaných prác potvrdený Objednávateľom** `
            + `alebo ním určenou osobou a **objednávka** — všetky tri podklady súčasne.`,
          'Súpisy prác je Zhotoviteľ povinný zasielať na potvrdenie priebežne, v týždňových '
            + 'intervaloch, najneskôr do 3. dňa nasledujúceho týždňa. Súpis prác musí byť '
            + 'podpísaný osobou poverenou na stavbe.',
          'Zhotoviteľ má nárok na odmenu len za skutočne zrealizované práce v rozsahu '
            + 'a kvalite požadovanej Objednávateľom.',
          `Splatnosť faktúr je ${dni(s.splatnost_dni)} od ich doručenia Objednávateľovi, `
            + `ak sa Zmluvné strany nedohodli inak.`,
          'Objednávateľ je oprávnený odmietnuť zaplatenie ceny diela, ak Zhotoviteľ '
            + 'nepredloží k faktúre podklady podľa bodu 2 tohto článku.',
          `Ak vznikne odôvodnená obava, že zmluvný partner Objednávateľa odmietne zaplatiť `
            + `cenu za dielo, je Objednávateľ po predchádzajúcom oznámení oprávnený predĺžiť `
            + `lehotu splatnosti faktúry Zhotoviteľa tak, aby bola splatná do 7 dní po tom, `
            + `čo cenu diela obdrží sám. Takéto predĺženie je možné najviac `
            + `o ${mesiace(s.splatnost_predlzenie_mes)}.`,
          'Faktúra musí obsahovať všetky zákonné náležitosti; inak je Objednávateľ oprávnený '
            + 'vrátiť ju na prepracovanie a plynie nová lehota splatnosti.',
        ],
      },
      {
        rim: 'VI.', nadpis: 'Práva a povinnosti zmluvných strán',
        body: [
          `Zhotoviteľ je povinný nastúpiť na zhotovovanie diela v deň a v mieste uvedenom `
            + `v objednávke, pričom objednávka mu bude doručená minimálne `
            + `${dni(s.nastup_oznamenie_dni)} vopred. Ak nemôže nastúpiť, je povinný to `
            + `bezodkladne oznámiť, najneskôr ${dni(s.nastup_oznamenie_dni)} pred dohodnutým `
            + `termínom, a dôvod preukázať.`,
          'Zhotoviteľ sa zaväzuje postupovať s odbornou starostlivosťou, dodržiavať právne '
            + 'predpisy, pracovné predpisy na pracovisku, technické normy a dohodnuté '
            + 'zmluvné podmienky a udržiavať poriadok na pracovisku.',
          'Zhotoviteľ je povinný dodržiavať predpisy bezpečnosti a ochrany zdravia pri práci, '
            + 'požiarnej ochrany a ochrany životného prostredia, ako aj konkrétne bezpečnostné '
            + 'predpisy daného pracoviska. Opakované porušovanie sa považuje za podstatné '
            + 'porušenie zmluvy.',
          `Zhotoviteľ vyhlasuje, že administratívne povinnosti súvisiace s realizáciou diela `
            + `(vystavenie prenosného dokumentu **A1**, prihlásenie na daň v zahraničí — `
            + `**Freistellung** — alebo iné) si splní riadne a včas. Ak si povinnosť `
            + `prihlásenia na daň nesplní a Objednávateľovi vznikne povinnosť odvádzať za `
            + `neho stavebnú zrážkovú daň, je Objednávateľ oprávnený uplatniť si tento výdavok `
            + `v plnej výške a započítať ho oproti faktúre Zhotoviteľa. Zároveň je oprávnený `
            + `účtovať si spracovateľský poplatok ${eur(s.freistellung_poplatok)} za každú `
            + `takúto úhradu.`,
          `Za prechovávanie alebo požitie alkoholu alebo iných omamných a návykových látok `
            + `na pracovisku, prípadne za zdržiavanie sa na pracovisku pod ich vplyvom, je `
            + `Objednávateľ oprávnený požadovať zmluvnú pokutu ${eur(s.pokuta_alkohol)} za `
            + `každý prípad zvlášť. Porušenie sa zároveň považuje za podstatné porušenie `
            + `zmluvy a môže byť dôvodom na odstúpenie.`,
          `Za porušenie zákazu a obmedzenia fajčenia v priestoroch, kde je fajčenie zakázané, `
            + `je Objednávateľ oprávnený požadovať zmluvnú pokutu ${eur(s.pokuta_fajcenie)} `
            + `za každý prípad zvlášť, a to i opakovane.`,
          'Ochranné pracovné prostriedky, pracovné oblečenie a pracovné prostriedky si '
            + 'zabezpečuje Zhotoviteľ sám na vlastné náklady.',
          'Cestovné náklady a náklady na ubytovanie nie sú zahrnuté v cene diela a hradí si '
            + 'ich Zhotoviteľ. Ak ich uhradí Objednávateľ, budú započítané oproti faktúre '
            + 'Zhotoviteľa.',
          'Ak v súvislosti s plnením vznikne potreba absolvovať školenie, vstupný test alebo '
            + 'skúšku a tieto budú spoplatnené, ide o výdavok Zhotoviteľa.',
          'Zhotoviteľ je povinný pred výkonom činnosti uzavrieť a trvale udržiavať v platnosti '
            + 'poistenie všeobecnej zodpovednosti podnikateľa a poistenie zodpovednosti za '
            + 'škody spôsobené tretím osobám a doklady o poistení Objednávateľovi preukázať.',
        ],
      },
      {
        rim: 'VII.', nadpis: 'Zodpovednosť za vady',
        body: [
          'Zhotoviteľ zodpovedá za vady diela v zmysle § 560 a nasl. Obchodného zákonníka.',
          `Zhotoviteľ poskytuje záruku za akosť diela v dĺžke ${mesiace(s.zaruka_mes)}. `
            + `Preberá záruku, že zhotovené dielo si počas záručnej doby zachová obvyklé `
            + `vlastnosti a bude spôsobilé na užívanie pre účel, pre ktorý bolo zhotovené.`,
          'Záručná doba začína plynúť dňom odovzdania celého diela Objednávateľovi alebo '
            + 'dňom ukončenia prác zo strany Zhotoviteľa.',
          'Plynutie záručnej doby na dotknutú časť diela sa preruší dňom uplatnenia práva '
            + 'na odstránenie vád a pokračuje písomným potvrdením odstránenia závady.',
          'Za rovnocenne zaslanú reklamáciu sa považuje aj reklamácia zaslaná e-mailom na '
            + 'adresu uvedenú v záhlaví tejto zmluvy.',
          `Zhotoviteľ sa zaväzuje reklamované vady odstrániť v lehote ${dni(s.reklamacia_dni)} `
            + `odo dňa doručenia reklamácie, ak sa strany nedohodnú inak. Ak ich v tejto `
            + `lehote neodstráni, je Objednávateľ oprávnený zabezpečiť ich odstránenie na `
            + `náklady Zhotoviteľa.`,
        ],
      },
      {
        rim: 'VIII.', nadpis: 'Zmluvné pokuty',
        body: [
          `Zhotoviteľ je povinný zaplatiť zmluvnú pokutu ${eur(s.pokuta_konkurencia)} pre `
            + `prípad porušenia zákazu konkurencie podľa článku IX.`,
          `Zmluvná pokuta ${eur(s.pokuta_omeskanie_den)} za každý deň omeškania pre prípad `
            + `porušenia povinnosti vykonať a dokončiť dielo riadne a včas. Porušením sa `
            + `rozumie najmä svojvoľné prerušenie prác a omeškanie s ukončením diela. Ak `
            + `k porušeniu dôjde konaním viacerých osôb, ktoré Zhotoviteľ zabezpečuje, patrí `
            + `pokuta za konanie každej takejto osoby osobitne.`,
          `Zmluvná pokuta ${eur(s.pokuta_nenastupenie)} pre prípad porušenia povinnosti `
            + `dostaviť sa riadne a včas k realizácii diela, resp. nastúpiť na práce podľa `
            + `objednávky. Pri konaní viacerých osôb patrí pokuta za každú osobitne.`,
          `Zmluvná pokuta ${eur(s.pokuta_mlcanlivost)} za porušenie povinnosti zachovania `
            + `mlčanlivosti o obchodnom tajomstve podľa článku IX.`,
          'Nárok na zaplatenie zmluvnej pokuty je Objednávateľ oprávnený započítať s nárokom '
            + 'Zhotoviteľa na zaplatenie ceny diela.',
          'Uplatnením nároku na zmluvnú pokutu nie je dotknuté právo Objednávateľa na náhradu '
            + 'škody v celom rozsahu.',
        ],
      },
      {
        rim: 'IX.', nadpis: 'Obchodné tajomstvo a zákaz konkurencie',
        body: [
          `Skutočnosti, o ktorých sa Zhotoviteľ dozvedel pri uzatváraní alebo plnení zmluvy, `
            + `sú dôvernými informáciami a tvoria obchodné tajomstvo podľa Obchodného `
            + `zákonníka — vrátane informácií o dohodnutých cenách za dielo. Zhotoviteľ je `
            + `povinný zachovávať o nich mlčanlivosť aj po ukončení zmluvy, najmenej po dobu `
            + `${mesiace(s.mlcanlivost_mes)}.`,
          'Zhotoviteľ sa zaväzuje bez predchádzajúceho písomného súhlasu Objednávateľa '
            + 'neposkytnúť dôverné informácie žiadnej tretej osobe, okrem svojich zamestnancov '
            + 'alebo vopred odsúhlasených subdodávateľov, ktorých zaviaže v rovnakom rozsahu.',
          'Zhotoviteľ zodpovedá za škodu spôsobenú porušením povinnosti mlčanlivosti.',
          `Zhotoviteľ sa zaväzuje, že počas platnosti tejto zmluvy a po dobu `
            + `${roky(s.konkurencia_roky)} od jej skončenia nebude sám ani prostredníctvom `
            + `spriaznených osôb zhotovovať dielo pre zmluvných partnerov Objednávateľa ani `
            + `pre zmluvných partnerov zákazníka Objednávateľa.`,
        ],
      },
      {
        rim: 'X.', nadpis: 'Trvanie a zánik zmluvy',
        body: [
          '{{TRVANIE}}',
          'Zmluva môže zaniknúť písomnou dohodou zmluvných strán. Vypovedať ju možno aj '
            + 'formou elektronickej pošty, prednostne cez kontaktné e-mailové adresy uvedené '
            + 'v článku I.',
          `Každá zo zmluvných strán môže túto zmluvu vypovedať s výpovednou lehotou `
            + `${mesiace(s.vypoved_mes)}, a to aj bez udania dôvodu; lehota začne plynúť prvým `
            + `dňom kalendárneho mesiaca nasledujúceho po mesiaci, v ktorom bola výpoveď `
            + `doručená druhej strane.`,
          'Objednávateľ je oprávnený bez ohľadu na štádium rozpracovanosti okamžite odstúpiť '
            + 'od tejto zmluvy aj od individuálnej zmluvy, ak Zhotoviteľ zhotovuje dielo '
            + 'nekvalitne alebo v takom časovom sklze, že ho zjavne neodovzdá riadne a včas; '
            + 'ak nenastúpi v stanovenom termíne; ak prerušil zhotovovanie bez súhlasu '
            + 'a nezjednal nápravu ani na výzvu; ak neodstráni vadu v určenej lehote; ak '
            + 'podstatne poruší zmluvu; ak zákazník Objednávateľa vysloví nespokojnosť so '
            + 'spôsobom realizácie alebo odmietne jeho prítomnosť na mieste realizácie; ak '
            + 'Objednávateľ nemá dostatok práce určenej pre Zhotoviteľa; ak Zhotoviteľ '
            + 'neuspeje na skúške potrebnej pre vykonávanie prác; alebo ak vykonáva práce '
            + 'v stave vylučujúcom spôsobilosť.',
        ],
      },
      {
        rim: 'XI.', nadpis: 'Súhlas so spracovaním osobných údajov',
        body: [
          'Dotknuté osoby súhlasia so spracovaním osobných údajov v rozsahu použitia podľa '
            + 'tejto zmluvy a v zmysle Nariadenia Európskeho parlamentu a Rady (EÚ) 2016/679 '
            + '(GDPR). Súhlas je vyjadrený podpisom na tejto zmluve. Zákonnosť spracovania je '
            + 'na podklade čl. 6 ods. 1 písm. b) GDPR.',
          'Podrobný rozsah, účel, príjemcovia a doba uchovávania sú uvedené v samostatnom '
            + 'Súhlase so spracovaním osobných údajov, ktorý tvorí prílohu tejto zmluvy.',
        ],
      },
      {
        rim: 'XII.', nadpis: 'Dohoda o rozhodnom práve',
        body: [
          'Táto zmluva a právne vzťahy z nej vyplývajúce sa riadia všeobecne záväznými '
            + 'právnymi predpismi Slovenskej republiky.',
          'Zmluvné strany si dohodli pre všetky spory z tejto zmluvy právomoc a príslušnosť '
            + 'všeobecných súdov Slovenskej republiky.',
        ],
      },
      {
        rim: 'XIII.', nadpis: 'Záverečné ustanovenia',
        body: [
          `Písomnosť sa považuje za doručenú najneskôr na ${s.dorucenie_dni}. kalendárny deň `
            + `odo dňa jej uloženia na pošte, a to aj vtedy, ak sa vráti ako neprevzatá alebo `
            + `nedoručiteľná; písomnosti sa zasielajú doporučene. Strany sa dohodli aj na `
            + `elektronickom doručovaní: písomnosť sa považuje za doručenú v deň jej `
            + `preukázateľného odoslania z e-mailovej adresy uvedenej v záhlaví tejto zmluvy.`,
          'Právne vzťahy vyplývajúce z tejto zmluvy sa spravujú príslušnými ustanoveniami '
            + 'Obchodného zákonníka.',
          'Táto zmluva je vyhotovená v dvoch rovnopisoch, po jednom pre každú zmluvnú stranu.',
          'Zmluvné strany vyhlasujú, že si túto zmluvu prečítali a súhlasia s jej obsahom, že '
            + 'bola uzavretá na základe ich skutočnej, slobodnej a vážnej vôle, nie v tiesni '
            + 'ani za nápadne nevýhodných podmienok, na dôkaz čoho ju podpísali.',
        ],
      },
    ];
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
  function build({ worker = {}, supplier = {}, rules = {}, signedAt, validTo, number } = {}) {
    const s = { ...SUMY };
    for (const k of Object.keys(SUMY)) {
      const v = Number(rules[k]);
      if (Number.isFinite(v) && v > 0) s[k] = v;
    }
    const podpis = String(signedAt || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const koniec = validTo || koniecRoka(podpis);

    const trvanie = `Táto zmluva nadobúda platnosť a účinnosť dňom jej podpísania zmluvnými `
      + `stranami a končí dňom ${den(koniec)}. Zmluva končí uplynutím času, na ktorý bola `
      + `uzavretá.`;

    return {
      number: number || '',
      signedAt: podpis,
      validTo: koniec,
      sumy: s,
      worker, supplier,
      clanky: clanky({ s }).map(c => ({
        ...c, body: c.body.map(p => p.replace('{{TRVANIE}}', trvanie)),
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

  const API = { SUMY, POVINNE, clanky, build, missing, koniecRoka, den, eur, plural };
  if (typeof window !== 'undefined') window.DanubraSubcontract = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
