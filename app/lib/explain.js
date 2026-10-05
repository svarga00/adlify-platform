// ============================================================================
// DANUBRA — vysvetlivky
// ============================================================================
// Každé číslo v appke je nejaký výpočet a každý výpočet je nejaké rozhodnutie.
// Kým je to rozhodnutie len v hlave toho, kto to písal, appka je čierna
// skrinka: čísla sa buď slepo veria, alebo sa neverí ani jednému.
//
// Preto má každá karta, dlaždica a obrazovka vysvetlivku, ktorá hovorí tri
// veci v tomto poradí:
//
//   1. **Čo to je** — čo to číslo znamená v reči firmy, nie databázy.
//   2. **Ako sa to počíta** — z čoho presne, aby sa to dalo overiť ručne.
//   3. **Prečo je to takto** — ktoré rozhodnutie za tým stojí. Toto je tá
//      časť, ktorá inak nikde nie je, a pritom sa na ňu najčastejšie pýta.
//
// Plus „na čo si dať pozor", keď sa na tom dá pomýliť, a odkazy, kam ísť.
//
// Text je dáta, nie HTML — vykresľuje ho `js/components/help.js`. Vďaka tomu
// sa dá otestovať, že žiadna vysvetlivka nie je prázdna a že každé tlačidlo
// „?" v appke naozaj niečo otvorí.
//
// Testy: node app/lib/explain.test.js
// ============================================================================
(function () {
  /**
   * @typedef {Object} Topic
   * @property {string}   title  nadpis okna
   * @property {string}   lead   jedna veta — to podstatné
   * @property {string[]} what   čo to je
   * @property {string[]} how    ako sa to počíta
   * @property {string[]} why    prečo je to takto
   * @property {string[]} [watch] na čo si dať pozor
   * @property {Array}    [links] [[route, 'Názov obrazovky']]
   */

  const T = {

    // ── Celá appka ──────────────────────────────────────────────────────────
    app: {
      title: 'Ako to celé funguje',
      lead: 'Appka drží jednu vetu: od telefonátu s človekom po peniaze na účte '
        + 'je to jedna cesta a každý krok v nej má svoj záznam.',
      what: [
        'Vľavo je navigácia zoradená podľa toho, ako práca reálne ide: najprv ľudia '
        + '(nábor, kandidáti, živnostníci, partie), potom zákazky (ponuka, zmluva, '
        + 'zákazka, hodiny, výkaz) a nakoniec peniaze (vydané faktúry, náklady, banka).',
        'Prehľad je prvá obrazovka po prihlásení. Neukazuje databázu — odpovedá na '
        + 'tri otázky, ktoré sa v tomto biznise pýtajú každý deň: čo dnes treba '
        + 'spraviť, bude na výplaty a zarábame na tom.',
        'Zvonček hore hovorí, čo sa stalo, kým si sa nepozeral. Úlohy hovoria, čo '
        + 'treba spraviť. Sú to dve rôzne otázky, preto sú to dve rôzne miesta.',
      ],
      how: [
        'Cesta zákazky: odberateľ → ponuka → zmluva → zákazka → nasadení ľudia → '
        + 'odpracované hodiny → uzavreté obdobie → vydaná faktúra → úhrada v banke.',
        'Cesta človeka: kandidát → telefonát a zápis → doklady (živnostenský, A1) → '
        + 'nasadenie na zákazku → hodiny → jeho faktúra nám → úhrada.',
        'Obidve cesty sa stretnú v obdobiach: obdobie zoberie odpracované hodiny, '
        + 'uzavrie ich a z nich vznikne podklad na faktúru odberateľovi aj kontrola '
        + 'faktúry od živnostníka.',
      ],
      why: [
        'Pravidlá nie sú v obrazovkách, ale v databáze — ako kontroly a spúšťače. '
        + 'Takže platia aj pri hromadnom importe a aj vtedy, keď niekto zapisuje '
        + 'priamo do databázy. Obrazovka, ktorá kontroluje, sa dá obísť; tabuľka nie.',
        'Nič sa fyzicky nemaže. Poznámky sa len pripisujú, zrušené záznamy sa '
        + 'označia, nie odstránia. V spore o hodiny alebo o faktúru je história '
        + 'to jediné, čo rozhodne.',
        'Peniaze sú v databáze celé čísla (centy) a v kóde sa počítajú cez knižnicu '
        + 'na presnú aritmetiku. Desatinné číslo v počítači nesedí — pri troch '
        + 'faktúrach to nikto nevidí, pri tristo chýbajú eurá.',
      ],
      links: [['dashboard', 'Prehľad'], ['tasks', 'Úlohy a pripomienky'],
        ['settings', 'Nastavenia']],
    },

    // ── Prehľad ako celok ───────────────────────────────────────────────────
    'screen.dashboard': {
      title: 'Prehľad',
      lead: 'Prvá obrazovka po prihlásení. Má odpovedať na tri otázky, nie ukázať, '
        + 'koľko je v databáze riadkov.',
      what: [
        'Hore je jedna veta o dnešku a šesť dlaždíc, ktoré sa dajú prekliknúť.',
        'Potom peniaze: čo čakáme, čo príde a odíde po týždňoch, očakávaný zisk, '
        + 'čo viazne v nákladoch, či bude na výplaty a aká je marža.',
        'Potom práca a ľudia: čo máme v objednávkach a koho treba zohnať.',
        'Dole to, čo treba spraviť dnes, čo si pýta pozornosť, a rýchle akcie.',
      ],
      how: [
        'Všetko sa načíta jedným behom, aby obrazovka naskočila naraz a nie po '
        + 'kúskoch.',
        'Sumy za obdobie berú filter hore. Stavové čísla — čakáme na účet, viazne '
        + 'v nákladoch, treba dobrať ľudí — filter zámerne neberú: to nie je vec '
        + 'mesiaca, ale toho, ako to stojí teraz.',
        'Keď sa nejaký dotaz nepodarí, príde chybová hláška. Prázdna karta nikdy '
        + 'neznamená „nič tu nemáš" bez toho, aby to appka povedala.',
      ],
      why: [
        'Prehľad, ktorý ukazuje počty riadkov, sa po týždni prestane čítať. Preto '
        + 'je tu každé číslo také, na ktoré sa dá reagovať: buď treba niekam '
        + 'kliknúť, alebo niekomu zavolať.',
        'Karty sú zoradené podľa naliehavosti peňazí, nie podľa abecedy. Najprv '
        + 'to, čo má prísť, potom to, čo má odísť.',
      ],
      links: [['tasks', 'Úlohy a pripomienky'], ['bank', 'Banka a cash-flow']],
    },

    'dash.headline': {
      title: 'Veta na úvod',
      lead: 'Prvá vec na obrazovke je veta, nie číslo. Číslo treba prečítať '
        + 'a porovnať; veta sa dá pochopiť za sekundu.',
      what: [
        'Zelená znamená, že na dnes nič nehorí. Oranžová, že niečo má termín dnes '
        + 'alebo tento týždeň. Červená, že niečo malo byť hotové už dávnejšie.',
        'Keď sú úlohy vybavené, ale niečo iné si pýta pozornosť (doklad, faktúra, '
        + 'obdobie), veta to povie namiesto toho, aby sa tvárila, že je hotovo.',
      ],
      how: [
        'Počítajú sa otvorené úlohy s termínom do dneška vrátane a k nim počet '
        + 'vecí z karty „Vyžaduje pozornosť".',
        'Odložená úloha sa nepočíta — vráti sa sama v deň, na ktorý bola odložená.',
      ],
      why: [
        'Toto je jediné miesto v appke, kde sa dá povedať „dnes je to v poriadku". '
        + 'Bez neho by sa každé ráno začínalo čítaním šiestich kariet.',
      ],
      links: [['tasks', 'Úlohy a pripomienky']],
    },

    'dash.filter': {
      title: 'Filter prehľadu',
      lead: '„Zarábame na tom?" bez obdobia je otázka bez odpovede — za celý čas '
        + 'to vyzerá inak než za tento mesiac a rozhodnutie sa robí podľa toho druhého.',
      what: [
        'Obdobia sú kalendárne: tento mesiac, minulý mesiac, štvrťrok, rok. Nie '
        + '„posledných 30 dní".',
        '„Od–do" je na presné obdobie — napríklad od podpisu zmluvy po dnešok. Stačí '
        + 'zadať jednu hranicu; „od 1. 8." bez konca je zmysluplná otázka.',
        'Filter zákazky zúži všetko na jednu stavbu — hodiny, faktúry, náklady aj maržu.',
      ],
      how: [
        'Obdobie sa uplatní na to, čo sa **stalo**: odpracované hodiny podľa dňa '
        + 'práce, vydané a prijaté faktúry podľa dátumu vystavenia, náklady podľa '
        + 'dátumu nákladu.',
        'Na to, ako to vyzerá **teraz** — čakáme na účet, viazne v nákladoch, treba '
        + 'dobrať ľudí — obdobie nesadá.',
        'Obrátené hranice sa prehodia, nevyjde z toho prázdno. Prázdne „Od–do" to '
        + 'o sebe povie, aby sa netvárilo ako „za celý čas".',
      ],
      why: [
        'Kalendárne obdobia preto, lebo účtovníctvo, faktúry aj odvody idú po '
        + 'mesiacoch a štvrťrokoch. Porovnávať sa dá len to, čo sedí s nimi — '
        + '„posledných 30 dní" nesedí s ničím.',
        'Stavové čísla obdobie neberú preto, že faktúra vystavená v auguste je '
        + 'stále neuhradená aj v septembri. Keby ju filter schoval, výhľad by '
        + 'klamal presne o tie peniaze, ktoré chýbajú.',
      ],
    },

    'dash.export': {
      title: 'Export a PDF',
      lead: 'Z appky sa musí dať dostať von — inak sa čísla prepisujú ručne '
        + 'a pri prepisovaní vznikajú chyby.',
      what: [
        'CSV je na ďalšie počítanie: účtovníčka, Excel, banka. Každá karta má '
        + 'vlastný export, plus sa dá vyviezť celý prehľad naraz.',
        'PDF je na poslanie alebo založenie tak, ako to vyzerá. Exportuje sa presne '
        + 'to, čo je na obrazovke — vrátane zvoleného obdobia a zákazky.',
      ],
      how: [
        'CSV má bodkočiarku ako oddeľovač a na začiatku značku kódovania. Bez toho '
        + 'slovenský a nemecký Excel zlepí celý riadok do jednej bunky a z „Ján" '
        + 'spraví „JÃ¡n".',
        'V názve súboru je obdobie, nech sa dva exporty z rôznych mesiacov nepomiešajú.',
        'PDF sa robí tlačou prehliadača — v dialógu treba vybrať „Uložiť ako PDF". '
        + 'Menu, tlačidlá ani zvonček sa netlačia; navrchu pribudne hlavička '
        + 's obdobím a dátumom.',
      ],
      why: [
        'PDF bez knižnice preto, že knižnica na PDF má v prehliadači 300–800 kB '
        + 'a táto appka nemá ani jednu cudziu závislosť okrem databázy a mapy. Tlač '
        + 'vie každý prehliadač aj telefón, výsledok má vyhľadateľný text '
        + 'a rešpektuje naše štýly.',
        'Hodnota, ktorá v CSV začína znamienkom rovná sa, plus alebo zavináč, sa '
        + 'zneškodní apostrofom. Cez CSV sa dá spustiť kód na cudzom počítači a taký '
        + 'text sa k nám dostane už z názvu firmy alebo z poznámky. Samotné záporné '
        + 'číslo je výnimka — inak by sa výdaj v Exceli nedal sčítať.',
      ],
    },

    'dash.events': {
      title: 'Zvonček — čo sa stalo',
      lead: 'Úlohy hovoria, čo treba spraviť. Zvonček hovorí, čo sa stalo, kým si '
        + 'sa nepozeral. Sú to dve rôzne otázky.',
      what: [
        'Prepadnuté a končiace doklady, faktúry po splatnosti a čakajúce na '
        + 'schválenie, prišlé a sporné faktúry od živnostníkov, obdobia na uzavretie, '
        + 'kandidáti bez prvého telefonátu, nespárované pohyby na účte a úlohy '
        + 's termínom do týždňa.',
        'Zvonček je v hornom pruhu, takže je vidieť z každej obrazovky. Na telefóne '
        + 'je v tmavej hlavičke — horný pruh tam nie je.',
      ],
      how: [
        'Udalosti sa počítajú z dát, ktoré appka aj tak má. Žiadna ďalšia tabuľka '
        + 'a žiadna naplánovaná úloha, ktorá by sa musela trafiť.',
        'Hore je to, čo horí; v rámci rovnakej naliehavosti to najnovšie. Najviac '
        + 'tridsať — viac sa neprečíta.',
        'Nespárované pohyby na účte sú jedna udalosť, nie dvadsať. Inak by zvyšok '
        + 'zvončeka zapadol.',
      ],
      why: [
        'Prečítané sa drží v prehliadači, nie v databáze. Je to údaj o tom, čo videl '
        + 'tento človek na tomto zariadení — do spoločnej tabuľky nepatrí a nemá '
        + 'zmysel kvôli nemu zapisovať pri každom otvorení.',
        'Prečítané nezmizne, len prestane svietiť. Zvonček, ktorý veci odpratáva, '
        + 'sa po prvom omyle prestane používať.',
      ],
      links: [['tasks', 'Úlohy a pripomienky']],
    },

    'dash.demo': {
      title: 'Vzorové dáta',
      lead: 'Prázdna appka sa nedá posúdiť. Vzorové dáta ukazujú, ako vyzerá '
        + 'naplnená — a musí byť vidieť, že sú to ony.',
      what: [
        'Vzorové sú živnostníci, zákazky, hodiny, faktúry aj pohyby na účte. Sú '
        + 'v evidencii, ktorá si pamätá presne to, čo appka sama vložila.',
        'Kým sú v systéme, je hore pás, ktorý to hovorí.',
      ],
      how: [
        'Mazanie ide cez evidenciu, nie cez „vymaž všetko". Takže sa dá spustiť aj '
        + 'vtedy, keď už v systéme sú ostré záznamy — tých sa to nedotkne.',
        'Potvrdzuje sa napísaním slova VYMAZAŤ. Jedno kliknutie na to nestačí.',
      ],
      why: [
        'Bez viditeľného označenia sa raz vystaví faktúra vymyslenému odberateľovi. '
        + 'To je chyba, ktorá sa nedá vziať späť — faktúra má číslo z číselného radu.',
      ],
    },

    // ── Dlaždice ────────────────────────────────────────────────────────────
    'kpi.deployed': {
      title: 'Ľudia na stavbách',
      lead: 'Koľko živnostníkov je práve teraz nasadených na bežiacich zákazkách.',
      what: [
        'Počíta sa nasadenie, nie počet ľudí v databáze. Kto je v evidencii, ale '
        + 'nemá bežiace nasadenie, sa sem neráta.',
        'Pod číslom je, na koľkých zákazkách a v koľkých partiách.',
      ],
      how: [
        'Zo zákaziek v stave „bežiaca" sa zoberú aktívne nasadenia a spočítajú.',
        'Partia je skupina, ktorá chodí spolu a má spoločný výkaz hodín.',
      ],
      why: [
        'Toto číslo je deliteľ skoro všetkého ostatného: tržba na človeka, náklad '
        + 'na človeka, koľko ľudí ešte treba. Preto je prvé.',
      ],
      links: [['workers', 'Živnostníci'], ['crews', 'Partie']],
    },

    'kpi.hours': {
      title: 'Nezúčtované hodiny',
      lead: 'Odpracované hodiny, ktoré ešte nie sú v uzavretom období — takže sa '
        + 'z nich ešte nedá vystaviť faktúra.',
      what: [
        'Sú to hodiny, ktoré už niekto odrobil a niekto zapísal, ale obdobie, do '
        + 'ktorého patria, je stále otvorené.',
        'Sú to naše peniaze, ktoré ešte nie sú na ceste.',
      ],
      how: [
        'Sčítajú sa hodiny zo zákaziek, ktorých obdobie nie je uzavreté.',
        'Uzavretím obdobia sa hodiny zmrazia a vznikne z nich podklad na faktúru '
        + 'odberateľovi aj kontrola faktúry od živnostníka.',
      ],
      why: [
        'Hodiny sa uzatvárajú po obdobiach a nie priebežne preto, že odberateľ '
        + 'podpisuje výkaz za celé obdobie. Keby sa fakturovalo po dňoch, podpisoval '
        + 'by každý deň a nikdy by to nepodpísal.',
      ],
      watch: [
        'Vysoké číslo tu znamená, že peniaze čakajú na jedno kliknutie. Obdobie, '
        + 'ktorému uplynul koniec, je v karte „Vyžaduje pozornosť".',
      ],
      links: [['timesheets', 'Odpracované hodiny'], ['subcontracts', 'Zákazky']],
    },

    'kpi.approve': {
      title: 'Faktúry na schválenie',
      lead: 'Faktúry, ktoré sú pripravené, ale nikto ich zatiaľ neschválil — '
        + 'a kým ich neschváli, neodídu.',
      what: [
        'Appka pripraví návrh faktúry z uzavretého obdobia. Vystavenie a odoslanie '
        + 'je vždy ľudské rozhodnutie.',
      ],
      how: [
        'Sem sa rátajú faktúry v stave „čaká na schválenie".',
        'Schválením dostane faktúra číslo z číselného radu — a od tej chvíle sa už '
        + 'nedá len tak zmeniť.',
      ],
      why: [
        'Toto je tvrdé pravidlo appky: **faktúra sa nikdy nevystaví ani neodošle bez '
        + 'schválenia**. Nie je to nastavenie, ktoré by sa dalo vypnúť — kontroluje '
        + 'to databáza, takže to platí aj pri importe a aj pri priamom zápise.',
        'Automaticky odoslaná faktúra s nesprávnou sumou stojí viac než deň '
        + 'zdržania. Naprávať ju treba dobropisom a vysvetľovaním.',
      ],
      links: [['invoices', 'Vydané faktúry']],
    },

    'kpi.overdue': {
      title: 'Po splatnosti',
      lead: 'Vystavené faktúry, ktorým uplynul dátum splatnosti a nie sú uhradené.',
      what: [
        'Sú to peniaze, ktoré mali byť na účte a nie sú.',
        'Počíta sa každá faktúra, ktorá nie je uhradená, zrušená ani rozpracovaná.',
      ],
      how: [
        'Porovná sa dátum splatnosti s dnešným dňom.',
        'Úhrada sa páruje z bankového výpisu. Kým sa pohyb nespáruje, faktúra tu '
        + 'zostane, aj keď peniaze prišli.',
      ],
      why: [
        'V tomto biznise sa platí za odrobené a výplaty idú ďalej bez ohľadu na to, '
        + 'či odberateľ zaplatil. Jedna faktúra po splatnosti je varovanie, dve sú '
        + 'problém s cash-flow.',
      ],
      watch: [
        'Keď číslo nesedí s realitou, skoro vždy chýba spárovanie v banke. Karta '
        + '„Bude na výplaty?" to počíta tiež.',
      ],
      links: [['invoices', 'Vydané faktúry'], ['bank', 'Banka a cash-flow']],
    },

    'kpi.docs': {
      title: 'Doklady po platnosti',
      lead: 'Bez platného A1 a živnostenského nesmie nikto na nemeckú stavbu. '
        + 'Toto je jediné číslo, ktoré vie zastaviť celú zákazku.',
      what: [
        'Sleduje sa živnostenský list, formulár A1, doklad totožnosti a ďalšie '
        + 'doklady podľa remesla.',
        'Pod číslom je, koľkým dokladom sa koniec platnosti blíži.',
        'V čísle sú len doklady, ktoré už neplatia. Po kliknutí sú v zozname aj tie, '
        + 'ktorým platnosť čoskoro skončí — vybavujú sa naraz, jedným telefonátom.',
      ],
      how: [
        'Doklad je „po platnosti", keď dátum platnosti uplynul, a „čoskoro skončí", '
        + 'keď zostáva menej než nastavený počet dní.',
        'Appka na to sama vyrobí úlohu s termínom, aby sa to nevybavovalo v deň, keď '
        + 'to vyprší.',
      ],
      why: [
        'A1 je potvrdenie, že človek platí odvody na Slovensku. Nemecká finančná '
        + 'kontrola práce ho pri kontrole na stavbe pýta ako prvé. Bez neho hrozí '
        + 'pokuta a zastavenie prác — a to platí odberateľ, nie len my.',
        'Nasadiť človeka bez platných dokladov sa dá len s výnimkou administrátora '
        + 'a tá výnimka zostane zapísaná. Nie preto, aby sa nedalo — preto, aby bolo '
        + 'jasné, kto to rozhodol.',
      ],
      links: [['workers', 'Živnostníci'], ['compliance', 'Compliance']],
    },

    'kpi.hiring': {
      title: 'Treba dobrať ľudí',
      lead: 'Koľko ľudí chýba na to, aby sa dohodnuté zákazky dali odrobiť.',
      what: [
        'Číslo je súčet z bežiacich náborových plánov, nie odhad.',
        'Pod ním je, koľko náborov beží.',
      ],
      how: [
        'Z každého bežiaceho plánu sa zoberie počet ľudí, ktorý ešte nie je obsadený.',
        'Súrne je to, čo má nástup do dvoch týždňov.',
      ],
      why: [
        'Nábor trvá dlhšie, než sa zdá: telefonát, doklady, A1, cesta. Preto sa táto '
        + 'potreba ukazuje na prehľade a nie až v module náboru — v tom momente, keď '
        + 'sa na ňu človek pozrie sám, býva neskoro.',
      ],
      links: [['hiring', 'Náborové plány'], ['candidates', 'Kandidáti']],
    },

    // ── Karty: peniaze ──────────────────────────────────────────────────────
    'card.cashflow': {
      title: 'Kompletný cash-flow',
      lead: 'Celá hotovosť na jednom mieste: čo je na účte, čo má prísť, čo má '
        + 'odísť a čo z toho zostane. Prvá otázka dňa, preto je to prvá karta.',
      what: [
        'Vľavo je stav účtu dnes a pod ním, koľko bude o osem týždňov.',
        'Graf je vodopád: prvý a posledný stĺpec je stav účtu, medzi nimi sú '
        + 'pohyby. Z poradia je vidieť nielen koľko príde a odíde, ale aj **kedy** — '
        + 'teda či niekde po ceste nespadne účet pod nulu.',
        'Tri stĺpce pod grafom: čo príde, čo odíde a **čo je mimo výhľadu**.',
        'Dole je najnižší bod — to je to číslo, ktoré rozhoduje.',
      ],
      how: [
        'Začína sa zostatkom z posledného načítaného bankového výpisu.',
        'Príjmy sú vystavené faktúry podľa dátumu splatnosti, výdaje sú faktúry '
        + 'od živnostníkov a plánované náklady podľa ich termínu.',
        'Všetko po splatnosti sa započíta hneď na začiatku — sú to peniaze, ktoré '
        + 'mali prísť alebo odísť dávno, nie budúcnosť.',
        'Čísla sedia s týždenným výhľadom aj s kartou „Bude na výplaty?" do centa. '
        + 'Je to ten istý výpočet, len ukázaný inak.',
      ],
      why: [
        '**Mimo výhľadu je vlastný stĺpec zámerne.** Odrobené hodiny bez faktúry '
        + 'a refakturovateľné náklady sú takmer isté peniaze, ale nikto nevie kedy '
        + 'prídu. Keby sa prirátali do zostatku, výhľad by vyzeral pokojnejšie, než '
        + 'aký je. Keby sa zamlčali, firma by vyzerala chudobnejšia, než aká je.',
        'Rozhoduje najnižší bod, nie zostatok na konci. Účet môže skončiť v pluse '
        + 'a v treťom týždni byť pod nulou — a výplaty sa odložiť nedajú, faktúra '
        + 'odberateľovi sa o dva týždne posunúť vie.',
        'Osem týždňov preto, že toľko trvá cyklus od nasadenia po úhradu: obdobie, '
        + 'výkaz, faktúra, splatnosť. Kratší výhľad nezachytí celý kruh.',
      ],
      watch: [
        'Nespárované pohyby v banke celý obraz posúvajú. Kým sa nespárujú, zostatok '
        + 'sedí, ale faktúry sa tvária ako neuhradené.',
        'Prázdne „čo príde" pri plnom zozname faktúr znamená, že faktúram chýba '
        + 'dátum splatnosti.',
      ],
      links: [['bank', 'Banka a cash-flow'], ['invoices', 'Vydané faktúry'],
        ['costs', 'Náklady']],
    },

    'card.money': {
      title: 'Koľko peňazí čakáme',
      lead: 'Koľko reálne príde na účet z faktúr, ktoré sú už vystavené — nie koľko '
        + 'je na nich napísané.',
      what: [
        'Veľké číslo je to, čo dorazí na účet.',
        'Pod ním je, koľko z toho je po splatnosti a koľko je odrobené, ale ešte '
        + 'nevyfakturované.',
      ],
      how: [
        'Sčítajú sa vystavené faktúry, ktoré nie sú uhradené, zrušené ani '
        + 'rozpracované.',
        'Od sumy sa odpočíta zrážka podľa §48b nemeckého zákona o dani z príjmu — '
        + '15 % z fakturovanej sumy, ktoré odberateľ pošle nemeckému úradu, nie nám.',
        '„Odrobené, nevyfakturované" je počet hodín za zvolené obdobie krát dohodnutá '
        + 'sadzba pre odberateľa.',
      ],
      why: [
        'Zrážka §48b je tu odpočítaná preto, že inak by číslo klamalo o 15 %. '
        + 'Odberateľ ju zadrží a odvedie ju za nás; my ju dostaneme späť až cez '
        + 'daňové priznanie v Nemecku, prípadne vôbec nie, ak sa o ňu nepožiada.',
        'Zrážke sa dá predísť potvrdením o oslobodení (Freistellungsbescheinigung). '
        + 'Kým ho nemáme, je toto rozdiel medzi „vyfakturovali sme" a „prišlo".',
        'Odrobené, ale nevyfakturované sa do týždenného výhľadu neráta — nemá to '
        + 'termín. Sú to peniaze, ktoré prídu, ale nikto nevie kedy.',
      ],
      links: [['invoices', 'Vydané faktúry'], ['timesheets', 'Odpracované hodiny']],
    },

    'card.weeks': {
      title: 'Príjmy a výdaje',
      lead: 'Čo príde a čo odíde v najbližších týždňoch a čo z toho zostane na účte.',
      what: [
        'Prepínač 1–4 týždne mení, ako ďaleko sa pozeráme. Graf a tabuľka ukazujú to '
        + 'isté — graf na porovnanie, tabuľka na presné čísla.',
        'Posledný stĺpec je priebežný zostatok: koľko bude na účte na konci toho '
        + 'týždňa.',
      ],
      how: [
        'Príjmy sú vystavené faktúry podľa dátumu splatnosti. Výdaje sú faktúry od '
        + 'živnostníkov a plánované náklady podľa ich termínu.',
        'Začína sa zostatkom na účte z posledného bankového výpisu.',
        'Všetko po splatnosti sa započíta hneď v prvom týždni. Sú to peniaze, ktoré '
        + 'mali prísť alebo odísť dávno, nie budúcnosť.',
      ],
      why: [
        'Po týždňoch a nie po mesiacoch preto, že výplaty sa platia priebežne. '
        + 'Mesačný priemer môže byť pekný a účet aj tak spadne v treťom týždni.',
        'Keď výhľad povie, že účet spadne do mínusu, je to varovanie, nie predpoveď — '
        + 'vychádza z termínov, ktoré sú zapísané. Tri nespárované pohyby v banke '
        + 'vedia obraz zmeniť.',
      ],
      links: [['bank', 'Banka a cash-flow']],
    },

    'card.profit': {
      title: 'Očakávaný zisk',
      lead: 'Koľko by z toho malo zostať — rozdelené podľa toho, aké isté to je.',
      what: [
        '**Z odrobeného** je hotová práca, ktorá sa len ešte nevyfakturovala. Tam už '
        + 'sa nič nezmení.',
        '**Z bežiacich zákaziek** je dohodnutá práca, ktorá sa ešte neodrobila.',
        '**Z odoslaných ponúk** je to, čo ešte nikto neprijal.',
      ],
      how: [
        'Zisk je vždy rozdiel medzi sadzbou pre odberateľa a sadzbou, ktorú platíme '
        + 'živnostníkovi, krát hodiny.',
        'Pri bežiacich zákazkách sa hodiny odhadnú z pracovných dní do konca a z ľudí, '
        + 'ktorí sú na zákazke nasadení.',
        '„Pravdepodobne" je súčet prvých dvoch vrstiev — bez ponúk.',
      ],
      why: [
        'Vrstvy sa zámerne nesčítavajú do jedného čísla. Z ponuky, ktorú nikto '
        + 'neprijal, sa zisk počítať nedá, a keby bola v jednom čísle s odrobeným, '
        + 'rozhodovalo by sa podľa niečoho, čo neexistuje.',
        'Nie sú v tom režijné náklady firmy — ubytovanie, doprava a réžia sú '
        + 'v karte „Zarábame na tom?". Toto je hrubá marža z práce.',
      ],
      links: [['quotes', 'Ponuky'], ['subcontracts', 'Zákazky']],
    },

    'card.tied': {
      title: 'Viazne v nákladoch',
      lead: 'Naše peniaze, ktoré sme už vydali a ktoré sa majú vrátiť — najčastejšie '
        + 'ubytovanie.',
      what: [
        'Nie je to strata. Je to suma, ktorú sme zaplatili dopredu a ktorá sa '
        + 'refakturuje odberateľovi.',
        'Filter navrchu karty prepne kategóriu — ubytovanie býva väčšina a občas '
        + 'treba vidieť len zvyšok.',
      ],
      how: [
        'Sčítajú sa náklady označené ako refakturovateľné, ktoré ešte nie sú na '
        + 'žiadnej vydanej faktúre.',
        'Či je náklad refakturovateľný, sa dá nastaviť pri každom zvlášť; keď sa '
        + 'nenastaví, rozhodne kategória.',
        'Keď náklad pribudne na faktúru, z tohto čísla zmizne.',
      ],
      why: [
        'Ubytovanie sa platí dopredu a na mesiac, faktúra odberateľovi ide až po '
        + 'uzavretí obdobia. Medzitým sú to naše peniaze a v cash-flow chýbajú, '
        + 'hoci v účtovníctve nie sú náklad.',
        'Bez tohto čísla vyzerá firma ziskovejšie, než koľko má na účte — a presne '
        + 'na tom sa v tomto biznise stroskotáva.',
      ],
      links: [['costs', 'Náklady'], ['accommodations', 'Ubytovania']],
    },

    'card.book': {
      title: 'Čo máme v objednávkach',
      lead: 'Dohodnutá práca, ktorá sa ešte neodrobila. Tržba, ktorá príde, ak sa nič '
        + 'nezmení.',
      what: [
        'Veľké číslo je zostatok na všetkých bežiacich zákazkách.',
        'Poradie sa dá prepnúť: podľa sumy (kde je najviac peňazí) alebo podľa '
        + 'termínu (čo končí najskôr).',
      ],
      how: [
        'Pre každú zákazku: sadzba pre odberateľa × 8 hodín na deň × pracovné dni do '
        + 'konca × počet nasadených ľudí.',
        'Víkendy sa nerátajú. Sviatky áno — to je zjednodušenie.',
        'Keď termín zákazky už uplynul a zákazka je stále bežiaca, ukáže sa to.',
      ],
      why: [
        'Je to odhad a treba ho tak čítať — preto karta ukazuje aj to, z čoho vyšiel '
        + '(ľudia a dni). Presné to bude až z odpracovaných hodín.',
        'Osem hodín na deň preto, že tak sú postavené aj zmluvy a výkazy. Nadčasy sa '
        + 'zapisujú ako hodiny a objavia sa až v odrobenom.',
      ],
      links: [['subcontracts', 'Zákazky']],
    },

    'card.hiring': {
      title: 'Koho a kam treba zohnať',
      lead: 'Kde chýbajú ľudia, koľko ich chýba a čo z toho je súrne.',
      what: [
        'Zoskupené podľa mesta, lebo tak sa aj hľadá — človek sa pýta, či je ochotný '
        + 'ísť do Stuttgartu, nie na akú zákazku.',
        'Červená značka je nástup do dvoch týždňov.',
      ],
      how: [
        'Z bežiacich náborových plánov sa zoberie neobsadený počet ľudí a mesto '
        + 'zákazky, ku ktorej plán patrí.',
      ],
      why: [
        'Nábor je najpomalšia časť celého procesu. Keď sa naň príde až pri podpise '
        + 'zmluvy, zákazka sa začína s polovičnou partiou.',
      ],
      links: [['hiring', 'Náborové plány'], ['candidates', 'Kandidáti']],
    },

    'card.cash': {
      title: 'Bude na výplaty?',
      lead: 'Otázka, ktorá sa inak rieši pocitom. Výhľad na osem týždňov a jedna veta, '
        + 'či sa dá brať ďalších ľudí.',
      what: [
        '„Na účte dnes" je zostatok z posledného bankového výpisu.',
        '„Najnižší bod" je to najdôležitejšie číslo — nie koniec, ale to najhoršie '
        + 'miesto po ceste.',
      ],
      how: [
        'Berie sa osemtýždňový výhľad a hľadá sa týždeň s najnižším zostatkom.',
        'Verdikt porovná najnižší bod s prahom z Nastavení. Keď je pod ním, appka '
        + 'povie, že ďalších ľudí zatiaľ neber.',
      ],
      why: [
        'Zostatok na konci je zlý ukazovateľ: môže byť pekný a účet pritom v treťom '
        + 'týždni spadne pod nulu. Výplaty sa odložiť nedajú, faktúra odberateľovi '
        + 'sa o dva týždne posunúť vie.',
        'Prah je v Nastaveniach, nie v kóde — každá firma má inú rezervu a mení sa '
        + 'to s veľkosťou.',
      ],
      links: [['bank', 'Banka a cash-flow'], ['settings', 'Nastavenia']],
    },

    'card.margin': {
      title: 'Zarábame na tom?',
      lead: 'Vyfakturované mínus všetko, čo sa na to minulo, za zvolené obdobie.',
      what: [
        'Toto je celá ekonomika firmy na štyroch riadkoch: čo sme vyfakturovali, čo '
        + 'nám vyfakturovali živnostníci, čo stáli ostatné náklady a čo zostalo.',
        'Percento je marža z vyfakturovaného.',
      ],
      how: [
        'Berú sa faktúry podľa dátumu vystavenia, ktoré spadnú do zvoleného obdobia.',
        'Sporné prijaté faktúry sa nerátajú — kým sa rozdiel oproti hodinám '
        + 'nedohodne, nie je to náklad, ale otázka.',
        'Zrážka §48b je vo vyfakturovanom, hoci na účet nepríde. Je to tržba, len '
        + 'peniaze idú okľukou.',
      ],
      why: [
        'Marža pod 8 % je v tomto biznise červená: jeden človek, ktorý ochorie, '
        + 'a jedna faktúra po splatnosti to celé zjedia.',
        'Ubytovanie a doprava sú tu ako náklad, aj keď sa refakturujú. Keď sa vrátia, '
        + 'objavia sa vo vyfakturovanom — takže sa to vyrovná samo a medzitým je '
        + 'vidieť pravdu.',
      ],
      links: [['invoices', 'Vydané faktúry'], ['costs', 'Náklady']],
    },

    'card.tasks': {
      title: 'Čo treba spraviť',
      lead: 'Úlohy s termínom do konca týždňa. Zvyšok je v Úlohách.',
      what: [
        'Rozdelené na to, čo malo byť hotové, čo je na dnes a čo na tento týždeň.',
        'Pod úlohou je čip so záznamom, ktorého sa týka — klikne sa priamo naň.',
      ],
      how: [
        'Väčšina úloh vzniká sama z pravidiel: končiaci doklad, obdobie na uzavretie, '
        + 'faktúra po splatnosti, ročná kontrola zmluvy.',
        'Úloha sa dá odložiť. Odložená sa vráti sama v deň, na ktorý bola odložená — '
        + 'medzitým neprekáža.',
      ],
      why: [
        'Tu je len šesť položiek zámerne. Zoznam, v ktorom je dvadsať úloh, sa '
        + 'neprezerá — a potom sa neprezerá ani ten, v ktorom sú tri.',
      ],
      links: [['tasks', 'Úlohy a pripomienky']],
    },

    'card.alerts': {
      title: 'Vyžaduje pozornosť',
      lead: 'Veci, ktoré sa nedajú prehliadnuť a nie sú úlohou — počítajú sa z dát.',
      what: [
        'Prepadnuté doklady, obdobia na uzavretie, faktúry na schválenie a po '
        + 'splatnosti, sporné a nevybavené prijaté faktúry, kandidáti bez telefonátu.',
        'Pri každej veci je napísané, prečo je to dôležité, a čipy s konkrétnymi '
        + 'záznamami.',
      ],
      how: [
        'Nič z toho nie je uložená úloha — zakaždým sa to prepočíta z aktuálnych dát. '
        + 'Keď sa vec vybaví, zmizne odtiaľto sama.',
        'Hore sú štyri najhoršie veci, zvyšok sa dá rozbaliť.',
      ],
      why: [
        'Úloha sa dá odložiť a zabudnúť. Toto sa odložiť nedá, lebo to nie je úloha — '
        + 'je to stav. Preto sú to dve karty vedľa seba a nie jedna.',
      ],
    },

    'card.actions': {
      title: 'Rýchle akcie',
      lead: 'Šesť vecí, ktoré sa robia najčastejšie, na jedno kliknutie z prehľadu.',
      what: [
        '„Zdvihol som telefón" otvorí sprievodcu hovorom — pýta otázky v poradí '
        + 'a rovno z toho vyrobí kandidáta alebo dopyt.',
        'Ostatné vedú na zápis hodín, novú ponuku, načítanie výpisu z účtu, nový '
        + 'nábor a kontrolu pred nasadením.',
      ],
      how: [
        'Sú to skratky na obrazovky, nie iný spôsob zápisu. To isté sa dá spraviť aj '
        + 'cez menu.',
      ],
      why: [
        'Telefonát je prvý a najdôležitejší — človek, ktorý sa neozve do desiatich '
        + 'minút, berie prácu inde. Preto je to jediné oranžové tlačidlo na obrazovke.',
      ],
    },

    // ── Obrazovky ───────────────────────────────────────────────────────────
    'screen.workers': {
      title: 'Živnostníci',
      lead: 'Karta človeka: doklady, hodiny, zálohy, zárobok a pripomienky na jednom '
        + 'mieste.',
      what: [
        'Zoznam je farebne odlíšený podľa stavu: kto je na stavbe, kto je pripravený, '
        + 'kto je v nábore a s kým sa nespolupracuje.',
        'Červený krúžok pri fotke znamená doklad po platnosti.',
        'V karte je účet živnostníka: koľko zarobil, koľko nám vyfakturoval, koľko '
        + 'dostal na zálohách a koľko mu ešte dlhujeme.',
      ],
      how: [
        'Zárobok sa počíta z odpracovaných hodín krát jeho sadzba.',
        'Zálohy sa evidujú zvlášť a odpočítavajú sa z toho, čo mu patrí.',
        'Doklady majú dátum platnosti; appka z neho sama urobí pripomienku.',
      ],
      why: [
        'Živnostník nie je zamestnanec — fakturuje nám. Preto je tu účet a nie '
        + 'výplatná páska, a preto sa jeho faktúra kontroluje oproti hodinám.',
        'Záloha sa nedá zmazať, dá sa len stornovať s dôvodom. Pri peniazoch daných '
        + 'do ruky je zápis to jediné, čo zostane.',
      ],
      links: [['crews', 'Partie'], ['timesheets', 'Odpracované hodiny'],
        ['compliance', 'Compliance']],
    },

    'screen.crews': {
      title: 'Partie',
      lead: 'Skupina, ktorá chodí spolu, býva spolu a má jeden výkaz hodín.',
      what: [
        'Partia má vedúceho, členov a zákazku, na ktorej je.',
        'Výkaz pre odberateľa sa robí za partiu, nie za jednotlivca.',
      ],
      how: [
        'Človek môže byť naraz v jednej partii. Presun sa zapíše, takže je vidieť, '
        + 'kto kedy kde bol.',
      ],
      why: [
        'Nemecký odberateľ podpisuje jeden výkaz za partiu za týždeň. Keby sa mu '
        + 'nosilo päť výkazov, nepodpíše ani jeden.',
      ],
      links: [['hoursheet', 'Výkaz pre odberateľa'], ['workers', 'Živnostníci']],
    },

    'screen.subcontracts': {
      title: 'Zákazky',
      lead: 'Konkrétna stavba u konkrétneho odberateľa: kto tam je, za koľko a dokedy.',
      what: [
        'Zákazka má sadzbu pre odberateľa, termín, mesto a nasadených ľudí.',
        'Obdobia sú časové úseky, po ktorých sa uzatvárajú hodiny a fakturuje.',
        'Na mape je stavba aj ubytovanie, ktoré k nej patrí.',
      ],
      how: [
        'Nasadenie spája človeka so zákazkou a nesie obe sadzby — čo platíme jemu '
        + 'a čo fakturujeme odberateľovi. Rozdiel je marža.',
        'Uzavretie obdobia zmrazí hodiny a vyrobí podklad na faktúru.',
      ],
      why: [
        'Zmena koncového dátumu nie je úprava — vznikne z nej záznam o predĺžení. '
        + 'Inak by sa po troch mesiacoch nedalo povedať, na čom sme sa dohodli '
        + 'pôvodne, a pri spore je to práve to, čo sa ráta.',
      ],
      links: [['timesheets', 'Odpracované hodiny'], ['invoices', 'Vydané faktúry'],
        ['partners', 'Odberatelia v Nemecku']],
    },

    'screen.partners': {
      title: 'Odberatelia v Nemecku',
      lead: 'Nemecké firmy, ktorým fakturujeme. Ich údaje rozhodujú o tom, ako bude '
        + 'vyzerať faktúra.',
      what: [
        'Pri firme je IČ DPH (USt-IdNr.), adresa, kontakty a či má potvrdenie '
        + 'o oslobodení od zrážky.',
        'Logo sa ťahá z ich webu; keď tam nie je, zostanú iniciály.',
      ],
      how: [
        'Platné nemecké IČ DPH znamená reverse charge podľa §13b — faktúra ide bez '
        + 'DPH a daň odvedie odberateľ.',
        'Bez potvrdenia o oslobodení odberateľ zrazí 15 % podľa §48b a pošle ich '
        + 'nemeckému úradu.',
      ],
      why: [
        'Tieto dva údaje sú dôvod, prečo je odberateľ vlastná obrazovka a nie kolónka '
        + 'v zákazke. Zle zadané IČ DPH znamená nesprávne vystavenú faktúru a tá sa '
        + 'naprávala dobropisom.',
      ],
      links: [['invoices', 'Vydané faktúry'], ['contracts', 'Zmluvy']],
    },

    'screen.quotes': {
      title: 'Ponuky',
      lead: 'Čo sme odberateľovi ponúkli, za koľko a aká by z toho bola marža.',
      what: [
        'Ponuka má sadzbu, počet ľudí, hodiny na mesiac a platnosť.',
        'Marža sa počíta hneď pri zadávaní, takže je vidieť, či sa to oplatí, ešte '
        + 'pred odoslaním.',
      ],
      how: [
        'Marža na mesiac = (sadzba pre odberateľa − sadzba živnostníka) × hodiny '
        + '× počet ľudí.',
        'Prijatá ponuka sa mení na zmluvu a z nej vzniká zákazka.',
      ],
      why: [
        'Dokumenty pre nemeckého partnera sú po nemecky, aj keď je appka po slovensky. '
        + 'Ponuka, ktorej odberateľ nerozumie, sa neprijme.',
      ],
      links: [['contracts', 'Zmluvy'], ['partners', 'Odberatelia v Nemecku']],
    },

    'screen.contracts': {
      title: 'Zmluvy',
      lead: 'Čo je dohodnuté písomne — a čo z toho platí dnes.',
      what: [
        'Zmluva drží sadzby, výpovednú lehotu, platnosť a dodatky.',
        'Dodatok nie je nová zmluva; je to zmena, ktorá sa k nej pripíše.',
      ],
      how: [
        'Predĺženie alebo zmena sadzby sa zapíše ako dodatok s dátumom účinnosti.',
      ],
      why: [
        'Pri spore rozhoduje to, čo bolo dohodnuté v čase, ktorého sa spor týka. '
        + 'Prepísaná sadzba bez histórie znamená, že sa to nedá dokázať.',
      ],
      links: [['quotes', 'Ponuky'], ['subcontracts', 'Zákazky']],
    },

    'screen.timesheets': {
      title: 'Odpracované hodiny',
      lead: 'Základ všetkého: z hodín je faktúra odberateľovi aj kontrola faktúry od '
        + 'živnostníka.',
      what: [
        'Zapisuje sa deň, človek, zákazka a hodiny — prípadne aj od–do.',
        'Hodiny patria do obdobia. Kým je obdobie otvorené, dajú sa opraviť.',
      ],
      how: [
        'Pri zápise sa použije sadzba platná v ten deň a uloží sa k záznamu. Neskoršia '
        + 'zmena sadzby už staré hodiny neprepočíta.',
        'Uzavretím obdobia sa hodiny zmrazia.',
      ],
      why: [
        'Sadzba sa ukladá k hodine preto, že sadzby sa menia — a faktúra spred troch '
        + 'mesiacov sa nesmie po zmene cenníka zmeniť sama.',
      ],
      links: [['hoursheet', 'Výkaz pre odberateľa'], ['subcontracts', 'Zákazky']],
    },

    'screen.hoursheet': {
      title: 'Výkaz pre odberateľa',
      lead: 'Týždenný Stundennachweis po nemecky — jeden za partiu, na podpis na stavbe.',
      what: [
        'Výkaz je za jeden kalendárny týždeň a jednu partiu.',
        'Má nemecké hlavičky, miesto na podpis stavbyvedúceho a našu pätu s adresou.',
      ],
      how: [
        'Hodiny sa ťahajú z modulu hodín; v tabuľke sa dajú doplniť priamo.',
        'Týždne sú podľa ISO — pondelok až nedeľa, číslovanie ako v Nemecku (KW).',
        'Tlačí sa na šírku, má dvanásť stĺpcov.',
      ],
      why: [
        'Podpísaný výkaz je dôkaz. Bez neho je faktúra tvrdenie a pri spore o hodiny '
        + 'stojíme s prázdnymi rukami.',
        'Po nemecky preto, že ho podpisuje Nemec. Appka je po slovensky, dokumenty '
        + 'pre partnerov po nemecky — to je pravidlo, nie náhoda.',
      ],
      links: [['crews', 'Partie'], ['timesheets', 'Odpracované hodiny']],
    },

    'screen.invoices': {
      title: 'Vydané faktúry',
      lead: 'Čo sme vyfakturovali odberateľom — a v akom je to stave.',
      what: [
        'Faktúra vzniká z uzavretého obdobia ako návrh. Až po schválení dostane číslo '
        + 'a dá sa odoslať.',
        'Pri faktúre je QR kód na platbu a doklad v podobe, v akej ide odberateľovi.',
      ],
      how: [
        'Číslo sa berie z číselného radu a nedá sa preskočiť ani použiť dvakrát.',
        'Úhrada sa páruje s pohybom na účte podľa variabilného symbolu a sumy.',
        'Pri nemeckom odberateľovi ide faktúra bez DPH (reverse charge §13b) a so '
        + 'zrážkou §48b, ak nemá potvrdenie o oslobodení.',
      ],
      why: [
        '**Bez schválenia sa faktúra nevystaví ani neodošle.** Kontroluje to databáza, '
        + 'nie obrazovka, takže to platí aj pri importe.',
        'Faktúra za priebežnú službu sa nikdy neodosiela automaticky. Automat, ktorý '
        + 'pošle nesprávnu sumu, stojí viac než deň zdržania.',
      ],
      links: [['bank', 'Banka a cash-flow'], ['subcontracts', 'Zákazky']],
    },

    'screen.costs': {
      title: 'Náklady',
      lead: 'Faktúry od živnostníkov a všetko ostatné, čo firmu stojí peniaze.',
      what: [
        'Prijatá faktúra od živnostníka sa kontroluje oproti schváleným hodinám.',
        'Ostatné náklady sú ubytovanie, doprava, náradie, réžia.',
        'Pri náklade sa dá určiť, či sa refakturuje odberateľovi.',
      ],
      how: [
        'Appka porovná sumu na faktúre s hodinami krát sadzba a ukáže rozdiel.',
        'Keď rozdiel sedí, faktúra sa schváli. Keď nie, označí sa ako sporná a do '
        + 'marže sa nerátá, kým sa to nedohodne.',
        'Refakturovateľný náklad zostane v „Viazne v nákladoch", kým sa nedostane na '
        + 'vydanú faktúru.',
      ],
      why: [
        'Sporná faktúra sa nemaže a neschvaľuje „nech je pokoj". Rozdiel v hodinách '
        + 'je vec na dohodnutie so živnostníkom a zápis o tom je to, čo platí.',
      ],
      links: [['workers', 'Živnostníci'], ['invoices', 'Vydané faktúry']],
    },

    'screen.bank': {
      title: 'Banka a cash-flow',
      lead: 'Čo je na účte, čo príde, čo odíde — a či to vyjde.',
      what: [
        'Výpis sa načíta zo súboru. Appka sa pokúsi pohyby spárovať s faktúrami.',
        'Výhľad ide na osem týždňov a ukazuje najnižší bod.',
      ],
      how: [
        'Páruje sa podľa variabilného symbolu, sumy a protistrany. Čo sa nespáruje, '
        + 'zostane v zozname — a zvonček to pripomenie.',
        'Spárovaná platba označí faktúru ako uhradenú, takže zmizne z „po splatnosti".',
      ],
      why: [
        'Nespárovaný pohyb znamená, že výhľad nesedí. Preto sa to nepočíta ako detail, '
        + 'ale ako vec, ktorá si pýta pozornosť.',
        'Výpis sa načítava ručne a nie cez bankové rozhranie zámerne — prístup do '
        + 'banky je to posledné, čo má appka mať.',
      ],
      links: [['invoices', 'Vydané faktúry'], ['costs', 'Náklady']],
    },

    'screen.tasks': {
      title: 'Úlohy a pripomienky',
      lead: 'Čo treba spraviť a dokedy. Väčšina vzniká sama z pravidiel.',
      what: [
        'Rozdelené na zmeškané, dnešné, tento týždeň a neskôr.',
        'Úloha je vždy naviazaná na záznam — človeka, zákazku, faktúru — takže sa dá '
        + 'z nej prekliknúť tam, kde sa to rieši.',
      ],
      how: [
        'Pravidlá vyrábajú úlohy z dátumov: koniec platnosti dokladu, koniec obdobia, '
        + 'splatnosť faktúry, výročie zmluvy.',
        'Odložená úloha sa vráti sama v deň, na ktorý bola odložená.',
      ],
      why: [
        'Pripomienky sa nedajú nechať na pamäť. V tomto biznise je zabudnutý A1 '
        + 'zastavená stavba a zabudnutá faktúra mesiac bez peňazí.',
      ],
      links: [['rules', 'Cenník a pravidlá']],
    },

    'screen.messages': {
      title: 'Správy',
      lead: 'Komunikácia pri zázname, ktorého sa týka — nie v troch aplikáciách '
        + 'a v hlave.',
      what: [
        'Vlákno sa viaže na živnostníka, zákazku alebo faktúru, takže je vidieť '
        + 'pri nich.',
        '**Interné poznámky pre kolegov fungujú hneď** — na tie netreba nič '
        + 'nastavovať.',
        'Zapísať sa dá aj to, čo odišlo alebo prišlo inou cestou. Potom je to '
        + 'na jednom mieste s ostatným.',
        'Šablóny sú po slovensky pre našich ľudí a po nemecky pre odberateľov.',
      ],
      how: [
        'Zástupné miesta v tvare {{meno}} sa doplnia zo záznamu. **Čo sa '
        + 'nedoplní, zostane v texte označené** — prázdne miesto by sa prehliadlo '
        + 'a odišla by veta „ponúkame  €/h".',
        'Odoslaná ani prijatá správa sa už nedá prepísať. Text, ktorý odišiel, '
        + 'musí zostať v znení, v akom odišiel.',
        'Vlákno sa uzavrie, nemaže. Pri spore o to, čo bolo dohodnuté, je '
        + 'história jediné, čo rozhoduje.',
      ],
      why: [
        '**Odosielanie zatiaľ nie je zapnuté.** Chýba kľúč poskytovateľa '
        + '(Resend, Postmark alebo SMTP) a adresa, z ktorej sa posiela. Kým to '
        + 'nie je, správa sa uloží do frontu a neodíde.',
        'Appka to hovorí nahlas a nikde netvrdí, že odoslala. Povedať „odoslané", '
        + 'keď sa neodoslalo, je horšie, než sa o to ani nepokúsiť — človek na to '
        + 'spoľahne a nedovolá sa.',
        'Kľúč pôjde do premenných prostredia na serveri, nie do appky. Kľúč, '
        + 'ktorý sa dostane do prehliadača, je verejný, aj keď ho nikto nevidí '
        + 'na obrazovke.',
      ],
      links: [['workers', 'Živnostníci'], ['partners', 'Odberatelia v Nemecku'],
        ['candidates', 'Kandidáti']],
    },

    'screen.candidates': {
      title: 'Kandidáti',
      lead: 'Ľudia, ktorí sa ozvali. Rozhoduje sa tu v minútach, nie v dňoch.',
      what: [
        'Kandidát prejde od prvého telefonátu cez preverenie k rozhodnutiu.',
        'Zo zápisu z hovoru sa dá kandidát vyrobiť rovno, bez prepisovania.',
      ],
      how: [
        'Preverenie dá skóre a odporúčanie podľa remesla, praxe a dokladov.',
        'Kto nemá zapísaný prvý telefonát, je v zvončeku aj na prehľade.',
      ],
      why: [
        'Cieľ je ozvať sa do desiatich minút. Kto zavolá neskôr, hovorí s človekom, '
        + 'ktorý už má prácu inde — to nie je o slušnosti, ale o tom, ako tento trh '
        + 'funguje.',
        'Hovor sa dá nahrávať len vtedy, keď s tým obe strany vopred výslovne '
        + 'súhlasia. Bez súhlasu je to trestné na Slovensku aj v Nemecku.',
      ],
      links: [['hiring', 'Náborové plány'], ['workers', 'Živnostníci']],
    },

    'screen.ads': {
      title: 'Inzeráty',
      lead: 'Na čo ľudia volajú — a čo sme im v tom sľúbili. Hovor sa začína '
        + 'inzerátom, nie menom.',
      what: [
        'Inzerát drží kanál (kde beží), remeslo, mesto, sľúbenú sadzbu, body '
        + 'toho, čo sľuboval, a presné znenie.',
        'Pri každom je vidieť, koľko ľudí sa naň ozvalo, koľkým sme sa stihli '
        + 'ozvať späť a koľko z nich nastúpilo.',
        'Dobehnutý inzerát sa vypína, nemaže — kandidáti, ktorí sa naň ozvali, '
        + 'musia zostať naviazaní na to, čo čítali.',
      ],
      how: [
        'V hovore je inzerát prvá otázka. Z neho sa predvyplní remeslo a mesto '
        + 'a vpravo sa počas celého hovoru ukazuje, čo sme v ňom sľúbili.',
        '„Stihnuté" je podiel tých, ktorým sme sa ozvali späť. Cieľ je sto percent.',
      ],
      why: [
        'Sľub sa musí dať dohľadať. Keď sa o mesiac na stavbe povie „veď ste '
        + 'písali 18 €", musí byť po ruke text inzerátu v znení, v akom bežal. '
        + 'Bez toho je to slovo proti slovu a prehráme to my.',
        'A treba vedieť, ktorý inzerát ľudí prináša. Bez toho sa za dosah platí '
        + 'naslepo — počet ľudí sám o sebe nestačí, lebo závisí od toho, ako '
        + 'dlho inzerát bežal.',
        'Poradie otázok v hovore je obrátené oproti tomu, ako sa telefonuje '
        + 'zvyčajne. My sme toho človeka oslovili, takže my máme vedieť čím — '
        + 'nie začínať otázkou „a čo vlastne hľadáte?".',
      ],
      links: [['candidates', 'Kandidáti'], ['hiring', 'Náborové plány'],
        ['trades', 'Remeslá a otázky']],
    },

    'screen.hiring': {
      title: 'Náborové plány',
      lead: 'Koľko ľudí, akého remesla a kam treba zohnať — a dokedy.',
      what: [
        'Plán je naviazaný na zákazku, má počet ľudí, remeslo, mesto a termín nástupu.',
        'Z plánu sa dá spustiť nábor a sledovať, koľko je obsadené.',
      ],
      how: [
        'Neobsadený počet sa prenáša na prehľad do „Treba dobrať ľudí".',
        'Súrne je to, čo má nástup do dvoch týždňov.',
      ],
      why: [
        'Plán existuje preto, aby bolo vidieť potrebu skôr, než sa stane problémom. '
        + 'Bez neho sa nábor začína v deň, keď ľudia mali nastúpiť.',
      ],
      links: [['candidates', 'Kandidáti'], ['subcontracts', 'Zákazky']],
    },

    'screen.compliance': {
      title: 'Compliance',
      lead: 'Čo musí sedieť, aby sa dalo legálne pracovať v Nemecku — a čo z toho '
        + 'práve nesedí.',
      what: [
        'Kontrola pred nasadením prejde človeka aj zákazku a povie, čo chýba.',
        'Sleduje doklady, A1, remeslo a povinnosti voči nemeckým úradom.',
      ],
      how: [
        'A1 potvrdzuje, kde sa platia odvody. Pýta si ho finančná kontrola práce '
        + '(Zoll/FKS) priamo na stavbe.',
        'Niektoré remeslá potrebujú zápis do remeselného registra podľa §9 nemeckého '
        + 'živnostenského zákona.',
        'V stavebníctve platí odvetvová minimálna mzda a odvody do dovolenkovej '
        + 'pokladne SOKA-BAU.',
      ],
      why: [
        'Nasadenie bez platných dokladov sa dá len s výnimkou administrátora a tá '
        + 'zostane zapísaná. Nie je to prekážka pre prekážku — je to o tom, aby bolo '
        + 'zrejmé, kto to rozhodol a kedy.',
        'Pokuta pri kontrole nedopadne len na nás, ale aj na odberateľa. To je '
        + 'najrýchlejší spôsob, ako o odberateľa prísť.',
      ],
      links: [['workers', 'Živnostníci'], ['subcontracts', 'Zákazky']],
    },

    'screen.accommodations': {
      title: 'Ubytovania',
      lead: 'Kde ľudia bývajú, koľko to stojí a koľko z toho sa vráti.',
      what: [
        'Ubytovanie má lôžka, cenu a väzbu na zákazku.',
        'Pobyt hovorí, kto tam kedy býval — z toho sa počíta obsadenosť aj náklad na '
        + 'človeka.',
      ],
      how: [
        'Cena sa rozpočíta na lôžka a dni, takže je vidieť náklad na jedného človeka '
        + 'na noc.',
        'Náklad označený ako refakturovateľný sa objaví v „Viazne v nákladoch", kým '
        + 'sa nedostane na faktúru.',
      ],
      why: [
        'Ubytovanie sa platí dopredu a na celý mesiac, aj keď je poloprázdne. Preto '
        + 'sa sleduje obsadenosť — prázdne lôžko je čistá strata.',
      ],
      links: [['costs', 'Náklady'], ['subcontracts', 'Zákazky']],
    },

    'screen.rules': {
      title: 'Cenník a pravidlá',
      lead: 'Čísla, ktoré rozhodujú o výpočtoch v celej appke — na jednom mieste, nie '
        + 'v kóde.',
      what: [
        'Sadzby, prahy pre cash-flow, počet dní pred koncom platnosti dokladu, '
        + 'pravidlá na automatické úlohy.',
      ],
      how: [
        'Zmena sa prejaví hneď vo výpočtoch, ale spätne nič neprepočíta — hodiny '
        + 'a faktúry si nesú sadzbu, ktorá platila v ten deň.',
      ],
      why: [
        'V kóde by to znamenalo, že zmena ceny je úprava programu. Takto je to '
        + 'nastavenie a je zapísané, kto ho kedy zmenil.',
      ],
      links: [['settings', 'Nastavenia'], ['tasks', 'Úlohy a pripomienky']],
    },

    'screen.members': {
      title: 'Používatelia',
      lead: 'Kto smie do appky a na čo. Rola je predvoľba, zaškrtávacie polia '
        + 'sú výnimka na mieru.',
      what: [
        'Štyri role: administrátor, koordinátor, náborár a účtovníctvo. Plus '
        + '„na mieru", keď ani jedna nesedí.',
        'Zaškrtnuté je to, čo dáva rola. Keď to zmeníš, uloží sa presne ten '
        + 'zoznam a rola zostane len ako poznámka, z čoho sa vychádzalo.',
        'Človek sa nedá zmazať, prístup sa vypne — úlohy a schválenia, ktoré po '
        + 'ňom zostali, musia mať stále meno.',
      ],
      how: [
        'Účet na prihlásenie vzniká v Supabase; tu sa nastavuje len to, na čo má. '
        + 'Spája sa to cez e-mail.',
        'Kým tu nie je nikto, má každý prihlásený všetko — inak by sa prvý človek '
        + 'zamkol von. Hneď ako pribudne prvý, začnú platiť práva.',
      ],
      why: [
        '**Skrytá položka v menu nie je ochrana.** Kto pozná adresu, dostane sa '
        + 'tam; kto pozná verejný kľúč, obíde appku úplne. Preto práva držia '
        + 'politiky a spúšťače v databáze a táto obrazovka len skrýva to, na čo '
        + 'človek aj tak nemá.',
        'Tri veci sa nedajú prideliť nikomu okrem administrátora, ani zaškrtnutím: '
        + 'schválenie faktúry, výnimka pri nasadení bez platných dokladov a správa '
        + 'používateľov a nastavení. Sú to pravidlá zo zadania, nie nastavenie.',
      ],
      watch: [
        'Keď si sám vypneš prístup alebo si zmeníš rolu, appka ti ho naozaj vezme. '
        + 'Vrátiť to vie len iný administrátor — alebo sa to opraví priamo '
        + 'v databáze.',
      ],
      links: [['settings', 'Nastavenia']],
    },

    'screen.settings': {
      title: 'Nastavenia',
      lead: 'Údaje firmy, moduly a prepojenia na okolité služby.',
      what: [
        'Fakturačné údaje dodávateľa, IBAN, číselné rady, zapnuté moduly.',
        'Prepojenie na fakturačnú službu a na mapové podklady.',
      ],
      how: [
        'Údaje odtiaľto idú na každú vydanú faktúru — vrátane IBAN-u v QR kóde.',
      ],
      why: [
        'Prístupové kľúče k službám nie sú v nastaveniach ani v prehliadači, ale '
        + 'v premenných prostredia na serveri, a volá sa odtiaľ. Kľúč, ktorý sa dostane '
        + 'do prehliadača, je verejný — aj keď ho nikto nevidí na obrazovke.',
      ],
      links: [['rules', 'Cenník a pravidlá']],
    },

    'screen.recruiting': {
      title: 'Zápisy z hovorov',
      lead: 'Čo sa v telefóne naozaj povedalo — zapísané tak, aby sa to dalo použiť.',
      what: [
        'Sprievodca hovorom pýta otázky v poradí a z odpovedí rovno vyrobí kandidáta.',
        'Zápis zostáva pri človeku, takže sa k nemu dá vrátiť aj o mesiac.',
      ],
      how: [
        'Otázky sa líšia podľa remesla — murár a zvárač sa pýtajú na iné veci.',
      ],
      why: [
        'Nahrávať hovor sa smie len s výslovným súhlasom oboch strán, daným pred '
        + 'začiatkom hovoru. Preto je tu zápis, nie nahrávka.',
      ],
      links: [['candidates', 'Kandidáti'], ['trades', 'Remeslá a otázky']],
    },

    'screen.trades': {
      title: 'Remeslá a otázky',
      lead: 'Čo sa pýtať pri ktorom remesle a čo pri ňom treba doložiť.',
      what: [
        'Pri každom remesle sú otázky na telefonát a doklady, ktoré sa vyžadujú.',
      ],
      how: [
        'Otázky sa použijú v sprievodcovi hovorom a v preverovaní kandidáta.',
      ],
      why: [
        'Bez toho sa každý telefonát pýta na niečo iné a porovnať dvoch kandidátov '
        + 'sa nedá.',
      ],
      links: [['recruiting', 'Zápisy z hovorov']],
    },

    'screen.onboarding': {
      title: 'Zaškolenie',
      lead: 'Posaď sem hocikoho a za hodinu vie viesť hovor sám.',
      what: [
        'Päť krokov: čo vlastne robíme, jedno remeslo poriadne, skúšanie z neho, '
        + 'ako vyzerá hovor, a cvičný hovor nanečisto.',
        'Postup sa drží v tomto prehliadači. Je to osobná vec jedného človeka, '
        + 'nie firemný záznam o tom, kto čo vie.',
      ],
      how: [
        'Cvičný hovor ukáže odpoveď kandidáta a ty rozhodneš, či ju prijímaš. '
        + 'Appka potom povie, či si rozhodol správne.',
        'Polovica odpovedí je dobrá a polovica je tá, pri ktorej treba zbystriť — '
        + 'inak by sa dalo prejsť tým, že sa na všetko kýve.',
        'Prijať zlú odpoveď a odmietnuť dobrú sa počítajú zvlášť.',
      ],
      why: [
        'Náborár nemusí vedieť, čo je stupeň kvality Q3. Musí vedieť rozoznať '
        + 'človeka, ktorý to robil, od človeka, ktorý o tom počul — a to sa '
        + 'z textu nenaučí, to sa dá len vyskúšať.',
        'Prijatá zlá odpoveď stojí človeka na stavbe, ktorý to nevie. Prehnaná '
        + 'prísnosť stojí jeden stratený telefonát. Nie je to tá istá chyba a '
        + 'appka to hovorí inak.',
      ],
      links: [['trades', 'Príručka remesiel'], ['hiring', 'Nábor']],
    },
  };

  /** Vráti tému, alebo `null`. */
  function get(key) { return T[key] || null; }
  function has(key) { return !!T[key]; }
  function keys() { return Object.keys(T); }

  /**
   * Celý text témy ako jeden reťazec. Je to tu kvôli testom a hľadaniu —
   * vykresľovanie robí `js/components/help.js`.
   */
  function text(key) {
    const t = T[key];
    if (!t) return '';
    return [t.title, t.lead, ...(t.what || []), ...(t.how || []),
      ...(t.why || []), ...(t.watch || [])].join('\n');
  }

  const API = { get, has, keys, text, TOPICS: T };
  if (typeof window !== 'undefined') window.DanubraExplain = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
