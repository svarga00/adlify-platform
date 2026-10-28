// ============================================================================
// DANUBRA — návod k appke (obsah)
// ============================================================================
// „Návod k celej aplikácii, ako pre začiatočníka." Pre kolegov v kancelárii,
// ktorí v appke robia každý deň: nábor, stavby, hodiny, faktúry.
//
// Toto sú len dáta — žiadne HTML, žiadny DOM. Vykresľuje ich obrazovka
// Dnes → Návod (js/modules/guide.js), PDF a ťahák (lib/documents/guide-doc.js)
// a sprievodca s bublinami (js/components/tour.js).
//
// Pravidlá textu (stráži ich lib/guide.test.js):
//   * vykanie, krátke vety, žiadne emoji,
//   * názvy tlačidiel v „úvodzovkách" presne tak, ako sú v appke,
//   * popisuje sa len to, čo appka naozaj vie — nie to, čo by vedieť mala,
//   * `open.route` je kľúč obrazovky z `navGroups` v js/app.js,
//   * príklady sú zo vzorových dát (migrácia 064).
//
// Tvar:
//   CHAPTERS  [{ key, title, lead, steps: [{ title, what, how[], open, tip, example }] }]
//   CHEAT     { daily[], weekly[], monthly[], never[] }   — ťahák na jednu stranu
//   TOUR      [{ selector, route, title, text }]           — sprievodca, text smie mať **tučné**
//   GLOSSARY  [{ term, text }]
//
// Testy: node app/lib/guide.test.js
// ============================================================================
(function () {
  const open = (route, label) => ({ route, label });

  const CHAPTERS = [
    // ── 1 ────────────────────────────────────────────────────────────────────
    {
      key: 'orientacia',
      title: 'Ako je appka usporiadaná',
      lead: 'Kde čo nájdete a ako sa v appke nestratiť. Prečítajte si to raz na začiatku — '
        + 'potom už budete vedieť, kam kliknúť.',
      steps: [
        {
          title: 'Prvá obrazovka: Prehľad dňa',
          what: 'Po prihlásení sa otvorí obrazovka „Prehľad dňa" (v menu pod položkou Dnes). '
            + 'Odpovedá na tri otázky: čo treba dnes spraviť, či bude na výplaty a či na tom zarábame.',
          how: [
            'Prihláste sa svojím e-mailom a heslom — otvorí sa „Prehľad dňa".',
            'Navrchu je rámik „Čo spraviť teraz": jedna veta, prečo, a jedno tlačidlo, ktoré Vás tam zavedie.',
            'Pod ním je „Sedem krokov od dopytu po faktúru" — pri každom kroku stav a tlačidlo k práci.',
            'Nižšie sú „Čísla". Kliknite na číslo a ukáže sa zoznam, z ktorého je spočítané.',
            'Úplne dole sú karty v záložkách „Dnes", „Peniaze" a „Práca a ľudia".',
          ],
          open: open('dashboard', 'Otvoriť Prehľad dňa'),
          tip: 'Keď neviete, čím začať, urobte to, čo je v rámiku „Čo spraviť teraz". '
            + 'Appka tam vždy dáva to, čo drží zvyšok práce.',
          example: null,
        },
        {
          title: 'Ľavé menu',
          what: 'Menu odpovedá na štyri otázky: čo dnes (Dnes), ktorá stavba (Zákazky), ktorí ľudia (Ľudia) '
            + 'a aké peniaze (Fakturácia). Pod nimi sú Marketing, Správy a Nastavenia.',
          how: [
            'Kliknite na položku v menu — otvorí sa obrazovka a pod položkou sa rozbalia jej záložky.',
            'Príklad: pod „Zákazky" sú „Všetky zákazky", „Dopyty", „Ponuky", „Odberatelia", „Zmluvy", „Objednávky", „Hodiny", „Výkaz" a „Ubytovania".',
            'Tie isté záložky sú aj pod nadpisom obrazovky (podčiarknuté, s ikonou).',
            'Na počítači stačí na položku ukázať myšou — vysunie sa podmenu aj s tlačidlom na najčastejšiu vec (napríklad „Nová zákazka").',
            'Číslo pri položke menu hovorí, koľko vecí tam čaká na Vás.',
          ],
          open: null,
          tip: 'Pilulky pod záložkami („Všetky", „Prebieha"…) sú filtre, nie záložky. '
            + 'Zúžia zoznam, ale obrazovku neprepnú.',
          example: null,
        },
        {
          title: 'Tlačidlo „Všetko" — keď neviete, kde niečo je',
          what: 'V hornom pruhu vľavo je tlačidlo „Všetko". Ukáže všetky obrazovky naraz '
            + 'a pri každej jednu vetu o tom, čo na nej je.',
          how: [
            'Kliknite hore na „Všetko" — otvorí sa okno „Kam chcete ísť?".',
            'Pri obrazovke, ktorá je záložkou inej, je napísané, kde ju nájdete (napríklad „Záložka v Ľudia").',
            'Kliknite na obrazovku, kam chcete ísť. Klávesom Esc okno zavriete.',
          ],
          open: null,
          tip: null,
          example: 'Partie nie sú samostatne v menu. V okne „Všetko" pri nich stojí, že sú záložkou v „Ľudia".',
        },
        {
          title: 'Hľadanie',
          what: 'Pole „Hľadať mesto, meno, telefón, číslo objednávky…" v hornom pruhu hľadá naprieč appkou: '
            + 'zákazky, ľudí, kandidátov, odberateľov, dopyty, faktúry a objednávky. Netreba vedieť, na ktorej obrazovke záznam je.',
          how: [
            'Napíšte aspoň dve písmená alebo číslice — pod poľom sa ukážu výsledky po skupinách.',
            'Kliknite na výsledok alebo ho vyberte šípkami a stlačte Enter — otvorí sa jeho karta. Esc zoznam zavrie.',
            'Na telefóne je to isté pole v tmavej hlavičke hore.',
            'Každý zoznam má navyše vlastné pole „Hľadať…", ktoré zúži len to, čo je na obrazovke.',
          ],
          open: null,
          tip: 'Diakritika ani medzery v telefóne nevadia: „kosice" nájde Košice a „0905 123" nájde +421 905 123 456.',
          example: 'Napíšte hore „Kováčik" a vo výsledkoch je Ján Kováčik — kliknutím sa otvorí jeho karta.',
        },
        {
          title: 'Tlačidlo „Papiere"',
          what: 'Je hore na každej obrazovke. Vyberiete papier, potom človeka alebo firmu — údaje sa doplnia samy z ich karty.',
          how: [
            'Kliknite hore na „Papiere" — otvorí sa okno „Pripraviť papier".',
            'Vyberte papier: „Rámcová zmluva s Nemcom", „Objednávka od Nemca SK/DE", „Súhlas GDPR", „Rámcová zmluva o dielo", „Objednávka živnostníkovi", „Infolist na stavbu", „Prázdny Stundennachweis" alebo „Všetko naraz na nástup".',
            'Vyberte, pre koho je. Keď v jeho karte niečo chýba (adresa, IČO), appka sa na to spýta a uloží to.',
            'Papier sa otvorí v novej karte. Hore sú tlačidlá „Upraviť text", „Tlačiť", „Poslať" a „Stiahnuť PDF".',
          ],
          open: null,
          tip: 'Papier sa uloží do Dokumentov pri „Stiahnuť PDF" aj pri „Tlačiť". Potom sa dá pridať aj do „Poslať všetko naraz".',
          example: null,
        },
        {
          title: 'Otázniky a vysvetlivky',
          what: 'Pri nadpisoch, číslach a tlačidlách je malý otáznik. Povie, čo to je, ako sa to počíta a na čo si dať pozor.',
          how: [
            'Ukážte myšou alebo ťuknite na otáznik pri poli či tlačidle — zobrazí sa krátke vysvetlenie.',
            'Otáznik pri nadpise obrazovky otvorí celú vysvetlivku.',
            'Otáznik v hornom pruhu („Vysvetlivky") otvorí okno „Postupy a vysvetlivky" — hore sú postupy krok za krokom.',
          ],
          open: null,
          tip: null,
          example: null,
        },
        {
          title: 'Zvonček — čo sa stalo',
          what: 'Zvonček v hornom pruhu hovorí, čo sa stalo, kým ste sa nepozerali: doklad vypršal, faktúra je po splatnosti, ozval sa kandidát.',
          how: [
            'Kliknite na zvonček — otvorí sa „Čo sa stalo". Číslo na zvončeku je počet nových udalostí.',
            'Kliknite na udalosť a otvorí sa záznam, ktorého sa týka.',
            '„Všetko prečítané" vynuluje číslo. Nič sa tým nemaže.',
          ],
          open: null,
          tip: 'Zvonček sa ukáže, až keď je aspoň jedna udalosť. Úlohy (čo treba spraviť) sú v Dnes → Úlohy.',
          example: null,
        },
        {
          title: 'Sedem krokov na obrazovke Dnes',
          what: 'Je to celá cesta firmy od dopytu po zaplatenú faktúru. Pri každom kroku je stav: „Horí", „Čaká", „V poriadku" alebo „Zatiaľ prázdne".',
          how: [
            'Krok, ktorý je na rade, je zväčšený a má veľké tlačidlo.',
            'Tlačidlo pri kroku otvorí obrazovku tak, aby bolo hneď vidieť, čo treba (napríklad ľudí bez súhlasu GDPR).',
            '„Podrobne" vpravo hore otvorí obrazovku „Ako to ide" s číslami ku každému kroku.',
          ],
          open: open('flow', 'Otvoriť Ako to ide'),
          tip: 'Sedem krokov má všade rovnaké čísla aj názvy — na Dnes, v „Ako to ide", v Papieroch aj pri zákazke: '
            + '1 Dopyt a ponuka, 2 Ľudia na stavbu, 3 Zmluva s Nemcom, 4 Papiere ľudí, 5 Zmluvy a objednávky živnostníkom, '
            + '6 Ubytovanie a doprava, 7 Hodiny a faktúra.',
          example: null,
        },
        {
          title: 'Vzorové dáta',
          what: 'Kým je v appke pás „V systéme sú vzorové dáta", sú v nej vymyslené firmy a ľudia (Hofmann Bau GmbH, Partia Kováčik…). Slúžia na nácvik.',
          how: [
            'Na vzorových dátach si môžete vyskúšať všetko z tohto návodu.',
            'E-maily vzorových firiem končia na .example — nikomu nič neodíde.',
          ],
          open: null,
          tip: 'Tlačidlo „Vymazať vzorové dáta" nestláčajte. O tom, kedy sa ide naostro, rozhoduje admin.',
          example: null,
        },
        {
          title: 'Návod a sprievodca',
          what: 'Tento návod je v appke v Dnes → Návod. Dá sa stiahnuť ako PDF alebo ako ťahák na jednu stranu.',
          how: [
            'V menu Dnes kliknite na záložku „Návod".',
            '„Spustiť sprievodcu" Vám v bublinách ukáže, kde čo je.',
            '„Ťahák na A4" je jedna strana — čo robiť každý deň, týždeň a mesiac.',
            '„Návod ako PDF" je celý tento návod na tlač.',
          ],
          open: open('navod', 'Otvoriť Návod'),
          tip: null,
          example: null,
        },
      ],
    },

    // ── 2 ────────────────────────────────────────────────────────────────────
    {
      key: 'zakazka',
      title: 'Nová zákazka od dopytu po zmluvu',
      lead: 'Nemecká firma sa ozve, že potrebuje ľudí. Kapitola ide od prvého telefonátu cez ponuku '
        + 'a zmluvu až po založenú zákazku.',
      steps: [
        {
          title: 'Dopyt od nemeckej firmy',
          what: 'Každý dopyt sa zapíše hneď, aj keď o ňom viete málo. Odberateľ volá viacerým — rozhoduje, kto sa ozve prvý.',
          how: [
            'V menu Zákazky → Dopyty kliknite na „Zapísať dopyt".',
            'Vyplňte „O čo ide", „Firma", „Telefón" a do „Čo potrebujú" napíšte, čo viete. Kliknite „Zapísať".',
            'Prišiel e-mail? Kliknite „Vložiť dopyt", vložte celý text a kliknite „Rozdeliť na stavby".',
            'Appka ukáže stavby, ktoré v e-maili našla. Odškrtnite, čo nechcete, a až potom sa dopyty založia.',
          ],
          open: open('opportunities', 'Otvoriť Dopyty'),
          tip: 'Stačia štyri polia. Dopyt, ktorý nie je zapísaný, neexistuje — zvyšok sa doplní neskôr.',
          example: 'Dopyt „Elektroinstallation Wohnbau Erlangen" prišiel z webu pred dvomi hodinami a má stav „Nová" — treba sa ozvať.',
        },
        {
          title: 'Doplniť a preveriť dopyt',
          what: 'V otvorenom dopyte doplníte firmu, sadzby a termín. Appka hneď ukáže maržu a čo ešte chýba.',
          how: [
            'Kliknite na dopyt v zozname.',
            'Vyplňte polia v časti „Údaje" — každé sa uloží hneď po zmene (Firma, USt-IdNr, Kontakt, Koľko ľudí, „Platia €/h", „Dáme €/h", Nástup, Remeslo).',
            'Keď je vyplnené USt-IdNr, kliknite „Preveriť v registri" — appka firmu overí v registri EÚ.',
            'Stav zmeňte vo výbere hore: „Nová", „Preverujeme", „Ponuka odišla", „Vyhrali sme", „Stratená".',
          ],
          open: open('opportunities', 'Otvoriť Dopyty'),
          tip: 'Marža pod 25 % zo sadzby odberateľa svieti oranžovo. Pri „Stratená" sa appka spýta prečo — hodí sa to o pol roka.',
          example: 'Dopyt „Trockenbau Schulzentrum Fürth" (Baugesellschaft Mittelfranken GmbH): platia 38 €/h, dáme 21 €/h, firma preverená v registri.',
        },
        {
          title: 'Čo z dopytu spraviť: ponuka, zákazka, nábor',
          what: 'V otvorenom dopyte je dole časť „Čo z toho spraviť". Odtiaľ idete ďalej — údaje z dopytu sa prenesú, nič sa nepíše druhýkrát.',
          how: [
            '„Spraviť ponuku" otvorí novú ponuku predvyplnenú z dopytu (odberateľ, remeslo, počet ľudí, miesto, termín, sadzby). Skontrolujte ju a uložte.',
            '„Založiť zákazku" otvorí novú zákazku predvyplnenú z dopytu. Po uložení je zákazka s dopytom prepojená a dopyt prejde na „Vyhrali sme".',
            '„Spraviť z toho nábor" — keď ľudí treba hľadať. Nábor vznikne ako koncept, nič sa nezverejní. Ďalej pokračujte v kapitole 3.',
            'Ak odberateľ ešte nemá kartu, appka sa spýta, či ju má založiť z údajov dopytu.',
          ],
          open: open('opportunities', 'Otvoriť Dopyty'),
          tip: 'Zákazku zakladajte z dopytu, nie od nuly. Iba tak zákazka vie, koľko ľudí odberateľ chce, a krok 2 to ukáže.',
          example: null,
        },
        {
          title: 'Odberateľ v Nemecku',
          what: 'Firma, ktorej fakturujeme, má vlastnú kartu. Bez nej sa nedá spraviť ponuka, zmluva ani faktúra.',
          how: [
            'V menu Zákazky → Odberatelia kliknite „Pridať odberateľa".',
            'Vyplňte „Názov firmy", „USt-IdNr", „Kontaktná osoba", adresu a „Splatnosť (dní)".',
            'Vo formulároch ponuky alebo zákazky sa dá odberateľ založiť aj priamo — tlačidlom plus vedľa výberu.',
            'Rámcovú zmluvu s Nemcom vytlačíte v karte odberateľa tlačidlom „Rámcová zmluva SK/DE".',
            'V karte odberateľa v časti „Overenie firmy" kliknite „Preveriť USt-IdNr v registri" — appka firmu overí v registri EÚ a výsledok si zapamätá.',
          ],
          open: open('partners', 'Otvoriť Odberateľov'),
          tip: 'Bez USt-IdNr sa nedá fakturovať bez DPH (§13b) a faktúra sa neschváli. Zapíšte ho hneď.',
          example: 'Hofmann Bau GmbH, München — USt-IdNr DE287451936, kontakt Herr Markus Hofmann, splatnosť 30 dní.',
        },
        {
          title: 'Ponuka odberateľovi',
          what: 'V ponuke je sadzba pre odberateľa, čo dáme živnostníkovi a réžia. Marža je vidieť skôr, než ponuka odíde.',
          how: [
            'V menu Zákazky → Ponuky kliknite „Nová ponuka".',
            'Vyplňte odberateľa, remeslo, počet ľudí, „Typ prác", miesto, termín a „Ponuka platí do".',
            'V časti „Peniaze" vyplňte „Fakturujeme €/h", „Živnostníkovi €/h" a „Réžia €/h". Marža sa prepočíta pri písaní. Kliknite „Vytvoriť".',
            'Otvorte ponuku a kliknite „Angebot (PDF)" — ponuka po nemecky. Pošlite ju a kliknite „Označiť ako odoslanú".',
            'Keď odberateľ odpovie, kliknite „Odberateľ prijal", „Odberateľ odmietol" alebo „Prepadla".',
          ],
          open: open('quotes', 'Otvoriť Ponuky'),
          tip: 'Réžiu (ubytovanie, doprava) nenechávajte na nule — marža by vyzerala lepšie, než je. '
            + 'Ponuka so zápornou maržou alebo pod minimálnou mzdou sa nedá označiť ako odoslaná.',
          example: 'PON-VZOR-2026-003 (Krüger Innenausbau, Klinikum Nord, 37 €/h) je odoslaná a platnosť jej končí o 5 dní — treba zavolať pani Krügerovej.',
        },
        {
          title: 'Zmluva o dielo s odberateľom',
          what: 'Zmluva o dielo (Werkvertrag) je dvojjazyčná. Musí opisovať dielo, nie hodiny — inak to vyzerá ako požičiavanie ľudí.',
          how: [
            'V prijatej ponuke kliknite „Spraviť zmluvu" — otvorí sa nová zmluva predvyplnená z ponuky.',
            'Do „Predmet diela" napíšte dielo (napríklad „montáž sadrokartónových priečok na 2. NP"), nie počet ľudí a hodín. Kliknite „Vytvoriť".',
            'V Zákazky → Zmluvy otvorte zmluvu a kliknite „Zmluva ako dokument" — zmluva po nemecky na tlač.',
            'Keď príde podpísaná, prepnite stav na „Podpísaná" a nahrajte podpísaný originál.',
            'Po podpise sa koniec platnosti a cena menia už len cez „Nový dodatok".',
          ],
          open: open('contracts', 'Otvoriť Zmluvy'),
          tip: 'Ak ste zmluvu založili z ponuky, pri zákazke ju nezakladajte druhýkrát. V zákazke v kroku 3 kliknite '
            + '„Priradiť existujúcu zmluvu" (alebo ju vyberte v úprave zákazky v poli „Zmluva o dielo").',
          example: 'ZML-VZOR-2026-004 (Klinikum Nord) je odoslaná na podpis. ZML-VZOR-2026-001 (Wohnanlage Isarauen) je podpísaná a predĺžená dodatkom DOD-VZOR-001.',
        },
        {
          title: 'Založiť zákazku',
          what: 'Zákazka je jedna konkrétna stavba. Pri nej sa robí všetko ďalšie — ľudia, papiere, ubytovanie, hodiny a faktúra.',
          how: [
            'V menu Zákazky kliknite „Nová zákazka".',
            'Vyplňte „Názov zákazky", „Odberateľ", „Typ prác", „Remeslo", „Od" a „Do".',
            'V „Miesto výkonu" vyplňte adresu stavby a do „Odkaz z máp" vložte odkaz z Google Máp — appka z neho vezme polohu.',
            'Vyplňte „Sadzba pre odberateľa €/h" a „Definícia diela". Ak už je zmluva o dielo, vyberte ju v poli „Zmluva o dielo". Kliknite „Vytvoriť zákazku".',
            'Kliknite na zákazku v zozname — otvorí sa sedem krokov pod sebou a ten, ktorý je na rade, je otvorený.',
          ],
          open: open('subcontracts', 'Otvoriť Zákazky'),
          tip: '„Typ prác" vyberte podľa pravdy. Stavebné práce znamenajú A1, hlásenie Zoll, SOKA-BAU a zrážku §48b — '
            + 'prepnutie na dielňu „aby to prešlo" je porušenie.',
          example: 'ZAK-VZOR-2026-001 „Wohnanlage Isarauen — Trockenbau" (Hofmann Bau GmbH, München, 38,50 €/h) práve prebieha.',
        },
        {
          title: 'Objednávka od odberateľa',
          what: 'Odberateľ často pošle k zmluve aj vlastnú objednávku s číslom. Zapíšte ju k zákazke — číslo sa potom objaví na faktúre.',
          how: [
            'V zákazke otvorte krok 3 „Zmluva s Nemcom".',
            'Kliknite „Zapísať jeho objednávku" a vyplňte „Jeho číslo objednávky".',
            'Ak treba objednávku poslať my, použite „Papiere" → „Objednávka od Nemca SK/DE".',
          ],
          open: open('orders', 'Otvoriť Objednávky'),
          tip: 'Objednávka od odberateľa je nepovinná. Keď ju pošle, zapíšte jej číslo — inak sa naň na faktúre zabudne.',
          example: 'Hofmann Bau poslal k Wohnanlage Isarauen objednávku 4500-2026-8871 (v appke OBJ-VZOR-0001).',
        },
        {
          title: 'Stav zákazky',
          what: 'Stav sa mení vo výbere hore na zákazke: „Príprava", „Rokovanie", „Získaná", „Prebieha", „Ukončená", „Prehratá", „Zrušená".',
          how: [
            'Keď je dohodnuté, prepnite zákazku na „Získaná".',
            'Na „Prebieha" sa dá prepnúť, až keď zákazka spĺňa podmienky (A1, hlásenie Zoll, USt-IdNr…). Inak appka povie, čo chýba.',
            'Po odovzdaní diela prepnite na „Ukončená".',
          ],
          open: open('subcontracts', 'Otvoriť Zákazky'),
          tip: null,
          example: 'ZAK-VZOR-2026-004 „Klinikum Nord — Fliesenarbeiten" je „Získaná" — ľudia nastupujú o dva týždne.',
        },
      ],
    },

    // ── 3 ────────────────────────────────────────────────────────────────────
    {
      key: 'ludia',
      title: 'Nábor a ľudia',
      lead: 'Ako nájsť ľudí, ako z kandidáta spraviť živnostníka a čo musí mať v karte, '
        + 'aby smel ísť na stavbu.',
      steps: [
        {
          title: 'Nábor',
          what: 'Nábor je zadanie: koho hľadáme, koľko ľudí, kam a za koľko. Z neho vzniknú texty inzerátov a otázky do telefonátu.',
          how: [
            'V menu Ľudia → Nábor kliknite „Nový nábor" (alebo otvorte nábor, ktorý vznikol z dopytu).',
            'Prejdite kroky tlačidlom „Ďalej". Rozpracovaný nábor uložíte cez „Uložiť rozpracované".',
            'Texty a otázky pripraví appka tlačidlom „Pripraviť podklady". Prečítajte ich a opravte, čo nesedí.',
            'Kliknite „Spustiť nábor".',
          ],
          open: open('hiring', 'Otvoriť Nábor'),
          tip: null,
          example: 'Nábor „Obkladači Stuttgart — Klinikum Nord" hľadá troch obkladačov, dvaja už sú. Tretí chýba a termín sa blíži.',
        },
        {
          title: 'Inzeráty',
          what: 'Pri každom inzeráte je zapísané, kde beží a akú sadzbu sme v ňom sľúbili. Keď sa o mesiac povie „veď ste písali 21 €", tu sa to overí.',
          how: [
            'V menu Ľudia → Inzeráty kliknite „Nový inzerát".',
            'Vyplňte názov, kanál (web, Facebook, Bazoš…), sľúbenú sadzbu a zákazku.',
          ],
          open: open('ads', 'Otvoriť Inzeráty'),
          tip: 'Nábor bez jediného inzerátu je najtichšia chyba — nič nehorí, len sa nikto neozve. Na Dnes to svieti v kroku 2.',
          example: null,
        },
        {
          title: 'Kandidát sa ozve',
          what: 'Kto sa ozve na inzerát, je kandidát. Cieľ je zavolať mu do desiatich minút — potom už berie prácu inde.',
          how: [
            'V menu Ľudia → Kandidáti sú noví hore. Na Dnes ich nájdete aj v karte „Vyžaduje pozornosť".',
            'Keď niekto volá práve teraz, kliknite „Zdvihol som telefón — naberať rovno teraz".',
            'Inak kliknite na kandidáta, zavolajte mu a kliknite „Ozval som sa".',
            '„Prejsť hovor" Vás prevedie otázkami k jeho remeslu. Čo zaznie, odklikáte.',
            'Kandidáta bez zápisu pridáte cez „Nový kandidát".',
          ],
          open: open('candidates', 'Otvoriť Kandidátov'),
          tip: null,
          example: 'Peter Mráz (obkladač, Topoľčany) sa prihlásil cez reklamu na Stuttgart pred 25 minútami a ešte mu nikto nevolal.',
        },
        {
          title: 'Z kandidáta živnostník',
          what: 'Keď kandidát prejde, prevedie sa medzi živnostníkov. Appka potom sama ponúkne ďalšie kroky: súhlas GDPR a zmluvu.',
          how: [
            'V kandidátovi prejdite „Náborový proces" — pri každom kroku odškrtnite, čo je hotové.',
            'Kliknite „Prijať – previesť medzi ľudí", prípadne vyberte zákazku a predpokladaný nástup a potvrďte.',
            'Kandidát sa stane živnostníkom v stave „Pripravený". Appka hneď ponúkne „Nasadiť teraz na zákazku" alebo „Najprv papiere".',
            'Ak nepôjde, kliknite „Zamietnuť" a napíšte dôvod.',
          ],
          open: open('candidates', 'Otvoriť Kandidátov'),
          tip: 'Prijatie ho na zákazku ešte nenasadí. Nasadený je, až keď kliknete „Nasadiť teraz na zákazku" (alebo na zákazke „Nasadiť človeka", kapitola 4) a nasadenie sa uloží.',
          example: 'Jakub Novotný (obkladač, Brno) bol kandidát z reklamy, teraz je živnostník a nastupuje na Klinikum Nord.',
        },
        {
          title: 'Karta živnostníka',
          what: 'Na karte je celý človek: smie ísť na stavbu, aké má doklady, čo odrobil, čo mu dlhujeme a čo sme mu sľúbili.',
          how: [
            'V menu Ľudia kliknite na meno.',
            'Navrchu je veta o peniazoch a výber stavu („Kandidát", „V preverovaní", „Pripravený", „Vyslaný", „Neaktívny", „Nespolupracovať").',
            'Karta „Papiere od nás — GDPR, zmluva, objednávka" ukazuje, čo chýba. Pri veci, ktorá je na rade, je „teraz toto".',
            'Nižšie sú záložky „Doklady", „Dokumenty", „E-maily", „Peniaze", „O ňom" a „História".',
            '„Upraviť" hore otvorí kartu: telefón, sadzbu a fakturačné údaje (IČO, DIČ, IČ DPH, IBAN, adresa podnikania).',
          ],
          open: open('workers', 'Otvoriť Ľudí'),
          tip: 'Bez IČO, IBAN-u a adresy sa jeho faktúra nedá zaúčtovať. Doplňte ich skôr, než odrobí prvý mesiac.',
          example: 'V zozname Ľudia vyberte filter „Doklady" → „Chýba súhlas GDPR" a ostanú len tí, ktorým chýba súhlas.',
        },
        {
          title: 'Doklady: A1, živnosť, totožnosť',
          what: 'Bez platných dokladov appka človeka na stavbu nepustí. Platnosť sa posudzuje k dňu nástupu, nie k dnešku.',
          how: [
            'Na karte živnostníka otvorte záložku „Doklady".',
            'V „Doklady a platnosti" kliknite „Pridať", vyberte druh (A1, živnostenský list, občiansky…), číslo a platnosť.',
            'Pri doklade kliknite „Nahrať sken" a nahrajte fotku alebo PDF.',
            'Karta „Smieme ho nasadiť?" hneď povie, či je všetko v poriadku.',
          ],
          open: open('workers', 'Otvoriť Ľudí'),
          tip: 'Doklad, ktorý končí do 30 dní, svieti oranžovo. Vybavte nový hneď, nie v deň, keď vyprší.',
          example: 'Gáborovi Nagyovi vypršalo A1 pred tromi dňami (nové je podané). Petrovi Balážovi končí A1 o 20 dní. Igor Šimko má A1 po platnosti a ako elektrikár potrebuje oznámenie §9 HwO.',
        },
        {
          title: 'Súhlas GDPR a rámcová zmluva',
          what: 'Každý živnostník podpíše súhlas so spracovaním údajov a rámcovú zmluvu o dielo (zvyčajne do konca roka).',
          how: [
            'Na karte v „Papiere od nás" kliknite „Vytlačiť súhlas". Keď ho podpíše, kliknite „Zapísať podpísaný".',
            'Potom kliknite „Vytlačiť zmluvu". Keď ju podpíše, kliknite „Zapísať podpísanú" a doplňte dátum.',
            'Ak za neho budeme vystavovať faktúry, najprv v „Upraviť" zaškrtnite „Faktúry zaňho vystavujeme my" — až potom tlačte zmluvu.',
          ],
          open: open('workers', 'Otvoriť Ľudí'),
          tip: 'Vytlačiť ešte neznamená podpísať. „Zapísať podpísaný" kliknite, až keď podpis naozaj máte.',
          example: 'Michal Horváth (murár, Komárno) je „V preverovaní" — chýba mu A1 aj podpísaná zmluva.',
        },
        {
          title: 'Partia',
          what: 'Partia je skupina, ktorá chodí na stavby spolu a má jeden týždenný výkaz hodín. Fakturuje však každý sám za seba.',
          how: [
            'V menu Ľudia → Partie kliknite „Nová partia" a napíšte názov.',
            'V partii kliknite „Pridať člena" a vyberte živnostníkov. Jeden z nich je vedúci.',
            'Na zákazku potom nasadíte celú partiu naraz (kapitola 4).',
          ],
          open: open('crews', 'Otvoriť Partie'),
          tip: null,
          example: 'Partia Kováčik: Ján Kováčik (vedúci), Peter Baláž a Marek Hudec — sadrokartonári z Nitrianskeho kraja.',
        },
      ],
    },

    // ── 4 ────────────────────────────────────────────────────────────────────
    {
      key: 'nastup',
      title: 'Nasadenie a papiere na nástup',
      lead: 'Ako dostať ľudí na zákazku a poslať im všetko, čo potrebujú na prvý deň — v jednej správe.',
      steps: [
        {
          title: 'Nasadiť jednotlivca',
          what: 'Nasadenie hovorí, kto ide na ktorú zákazku, odkedy a za akú sadzbu. Z neho sa potom píšu hodiny aj faktúra.',
          how: [
            'Otvorte zákazku a krok 2 „Ľudia". Kliknite „Nasadiť človeka".',
            'Vyberte „Pracovník" a „Rola" (Pracovník alebo „Predák (vedie práce)").',
            'Skontrolujte „Od", „Do" a „Fakturačná sadzba €/h". Doplňte ubytovanie a dopravu za mesiac.',
            'V časti „Smieme ho nasadiť?" uvidíte, či má platné doklady k dňu nástupu. Kliknite „Nasadiť".',
            'Človek je teraz „nasadený, ešte nenastúpil". Keď naozaj začne robiť, kliknite pri ňom v kroku 2 „Nastúpil" a zadajte deň nástupu.',
            'Keď zo stavby odíde, kliknite „Odišiel" a zadajte posledný deň a dôvod. Nasadenie, ktoré sa nekonalo, zrušíte krížikom — nič sa nemaže.',
          ],
          open: open('subcontracts', 'Otvoriť Zákazky'),
          tip: 'V zozname sú len ľudia v stave „Pripravený" alebo „Vyslaný" — pod výberom appka napíše, koľko ďalších ľudí sa nezobrazuje a prečo. '
            + 'Bez platných dokladov to appka nepustí — výnimku smie zapísať len admin. Aspoň jeden nasadený má byť predák. '
            + 'Kým nekliknete „Nastúpil", človek sa nepočíta medzi ľudí na stavbe.',
          example: 'Jakub Novotný je nasadený na Klinikum Nord od dňa nástupu, sadzba pre odberateľa 37 €/h.',
        },
        {
          title: 'Nasadiť partiu',
          what: 'Celú partiu nasadíte jedným kliknutím. Kto nemá doklady, ten sa preskočí a appka napíše, kto a prečo.',
          how: [
            'V zákazke v kroku 2 kliknite „Nasadiť partiu".',
            'Vyberte partiu a „Od". Sadzby nechajte prázdne, ak platia sadzby zo zákazky a z kariet.',
            'Vyplňte „Réžia €/h" (ubytovanie a doprava na hodinu). Kliknite „Nasadiť partiu".',
          ],
          open: open('subcontracts', 'Otvoriť Zákazky'),
          tip: 'Keď sa ukáže okno „Nasadení nie všetci", doplňte chýbajúci doklad v karte človeka a partiu nasaďte znova — kto už na zákazke je, sa preskočí.',
          example: 'Partia Kováčik je nasadená na Wohnanlage Isarauen, Ján Kováčik ako predák.',
        },
        {
          title: 'Papiere ľudí a podmienky vyslania',
          what: 'Krok 4 zákazky ukazuje pri každom človeku súhlas GDPR a doklady a pod tým podmienky celej zákazky (Zoll, SOKA-BAU, §48b).',
          how: [
            'Otvorte krok 4 „Papiere ľudí". Kto nemá GDPR, má tlačidlá „Vytlačiť GDPR" a „Podpísaný".',
            'Komu chýba doklad, kliknite „Doplniť doklad" — otvorí sa jeho karta.',
            'Pri stavbe kliknite „Zapísať hlásenie Zoll" a vložte Meldungs-ID z meldeportal-mindestlohn.de.',
            '„Test rizika ANÜ" overí, či zákazka nevyzerá ako požičiavanie ľudí.',
            'Rozbaľte „Checklist pred nástupom (po ľuďoch)". Ručne sa odškrtáva len odovzdanie pokynov — ostatné appka vie sama.',
          ],
          open: open('compliance', 'Otvoriť Compliance'),
          tip: 'Keď sú ľudia už na stavbe a papiere nie sú, krok svieti červeno. Pokutu za to platí firma.',
          example: 'Wohnanlage Isarauen má hlásenie Zoll MLD-2026-0841177.',
        },
        {
          title: 'Zmluva a objednávka každému',
          what: 'Krok 5 zákazky: každý nasadený potrebuje platnú rámcovú zmluvu a objednávku na túto zákazku. Bez objednávky to nie je dielo.',
          how: [
            'Otvorte krok 5 „Zmluvy a objednávky živnostníkom".',
            'Komu chýba zmluva: „Vytlačiť zmluvu" a po podpise „Podpísaná".',
            'Komu chýba objednávka: „Vystaviť objednávku" — sadzba a termín sa predvyplnia z nasadenia.',
            'Objednávka sa uloží v Zákazky → Objednávky. Stav zmeníte, keď ju živnostník potvrdí.',
          ],
          open: open('orders', 'Otvoriť Objednávky'),
          tip: null,
          example: 'Objednávka OBJ-VZOR-0007 pre Jakuba Novotného (obklady Klinikum Nord, 21 €/h) je „Odoslaná".',
        },
        {
          title: 'Ubytovanie a doprava',
          what: 'Krok 6 zákazky: kde ľudia budú spať a kto ich vezie. Ubytovanie sa potom objaví na infoliste.',
          how: [
            'Otvorte krok 6 „Ubytovanie a doprava" — na mape je stavba a ubytovania.',
            'Kliknite „Nájsť ubytovanie": hore sú Vaše overené ubytovania podľa vzdialenosti, pod tým hľadanie na internete.',
            'Čo nájdete, zapíšte v časti „3. Zapísať, čo ste našli" a kliknite „Uložiť a pridať k zákazke".',
            'Pri ubytovaní kliknite „Ubytovať človeka" a vyberte, kto tam býva a odkedy.',
            'Kliknite „Doprava" a zapíšte, kto ľudí vezie.',
          ],
          open: open('accommodations', 'Otvoriť Ubytovania'),
          tip: 'Jeden človek nemôže bývať na dvoch miestach naraz. Keď sa sťahuje, najprv ukončite starý pobyt.',
          example: 'Pension Sonnenhof v Mníchove: Kováčik a Baláž v izbe 1, Hudec v izbe 2. Novotný má izbu 3 od nástupu.',
        },
        {
          title: 'Kontaktná osoba na stavbe',
          what: 'Komu má živnostník zavolať, keď prvý deň nevie, kam ísť. Ukáže sa na infoliste aj v správe.',
          how: [
            'V kroku 5 pri človeku kliknite „Kontakt" — otvorí sa „Kontaktná osoba na stavbe".',
            'Vyberte kolegu zo stavby, alebo „Iná osoba — napíšem ručne" a vyplňte meno a telefón.',
            'Do „Poznámka pre živnostníka" napíšte, čo mu pomôže (napríklad kde je kancelária). Kliknite „Uložiť".',
          ],
          open: open('subcontracts', 'Otvoriť Zákazky'),
          tip: 'Kto je v partii, má kolegov z partie na infoliste sám. Telefón inej osoby dajte len s jej súhlasom.',
          example: 'Jakub Novotný má ako kontakt majstra Herr Uwe Seidel, +49 171 4402 618 — „Rozumie len po nemecky, pomaly a jednoducho."',
        },
        {
          title: 'Poslať všetko naraz',
          what: 'Namiesto piatich správ dostane živnostník jednu: infolist na stavbu, infolist k ubytovaniu, objednávku, vzor faktúry a prázdny Stundennachweis.',
          how: [
            'V kroku 5 pri človeku kliknite „Poslať všetko naraz" (to isté je na jeho karte alebo v „Papiere" → „Všetko naraz na nástup").',
            'Zaškrtnite papiere. Sivý papier sa poslať nedá — pri ňom je napísané prečo.',
            'Vyberte cestu: „E-mail", „WhatsApp", „SMS" (aj viac naraz). Kliknite „Pripraviť papiere".',
            'V okne „Papiere sú pripravené" kliknite „Otvoriť e-mail so všetkými prílohami" — e-mail sa otvorí v Správach, skontrolujete ho a odošlete.',
            'Pri WhatsApp a SMS ide jeden krátky odkaz na všetky papiere. Odkaz platí 30 dní.',
          ],
          open: open('subcontracts', 'Otvoriť Zákazky'),
          tip: 'Najprv dokončite ubytovanie (krok 6) a objednávku. Inak bude „Infolist k ubytovaniu" aj „Objednávka" v balíku sivá a nepošle sa.',
          example: 'Novotnému a Kissovi sa balík posiela týždeň pred nástupom na Klinikum Nord.',
        },
      ],
    },

    // ── 5 ────────────────────────────────────────────────────────────────────
    {
      key: 'hodiny',
      title: 'Hodiny zo Stundennachweisu (každý týždeň)',
      lead: 'Ľudia si na stavbe píšu hodiny na týždenný list a majster ho podpíše. Podľa neho fakturujeme — '
        + 'toto je práca, ktorá sa robí každý týždeň.',
      steps: [
        {
          title: 'Ako to ide na stavbe',
          what: 'Stundennachweis je list na jeden týždeň (KW). Ľudia doň píšu hodiny po dňoch, na konci týždňa ho podpíše majster odberateľa.',
          how: [
            'Prázdny list dostanú ľudia v balíku „Poslať všetko naraz".',
            'Ďalší prázdny list vytlačíte cez „Papiere" → „Prázdny Stundennachweis" alebo v okne hodín „Prázdny list na tlač".',
            'Vedúci partie alebo živnostník pošle do kancelárie fotku podpísaného listu.',
          ],
          open: null,
          tip: 'Podpis majstra je dôkaz pre odberateľa. Bez neho sa o hodiny ľahko sporí.',
          example: 'Hofmann Bau chce podpísaný výkaz každý piatok — podpisuje ho majster Thomas Brandl na Wohnanlage Isarauen.',
        },
        {
          title: 'Zapísať hodiny z listu',
          what: 'Jedno okno na celý list: zákazka, týždeň a tabuľka ľudia × dni. Ľudia zo stavby sú v nej sami.',
          how: [
            'Kliknite „Zapísať hodiny" — v menu Zákazky → Hodiny, v zákazke v kroku 7, vo Výkaze pre odberateľa alebo na Dnes v „Rýchle akcie". Všade sa otvorí to isté okno.',
            'Vyberte „Zákazka". Týždeň (KW) prepnete šípkami — predvolený je minulý týždeň.',
            'Natukajte hodiny z listu. Dá sa písať 8, 7,5 aj 7:30.',
            'Keď robila celá partia rovnako, vyplňte prvý riadok a kliknite „Všetkým ako prvý riadok".',
            'Chýba niekto? Vyberte ho v „+ Pridať človeka…" a kliknite „Pridať".',
          ],
          open: open('timesheets', 'Otvoriť Hodiny'),
          tip: 'Čo už bolo v tom týždni zapísané, sa prepíše tým, čo je v tabuľke.',
          example: null,
        },
        {
          title: 'Fotka namiesto ťukania',
          what: 'Appka vie z fotky listu prečítať dni, časy, mená a hodiny a vyplniť ich do tabuľky.',
          how: [
            'V okne hodín kliknite „Nahrať fotku alebo PDF". Stačí fotka z mobilu, aj otočená.',
            'Počkajte asi 20 sekúnd, kým sa ukáže „Hodiny sú prečítané — skontrolujte ich".',
            'Skontrolujte každé číslo. Meno, ktoré appka nespoznala, priradíte vo výbere „— kto je to? —".',
          ],
          open: null,
          tip: 'Rukopis sa dá prečítať zle. Keď sa fotka čítala ťažko, appka to napíše navrch.',
          example: null,
        },
        {
          title: 'Podpis a uloženie',
          what: 'Podpísané hodiny sa rovno schvália a dajú sa fakturovať. Fotka sa uloží k výkazu ako doklad.',
          how: [
            'Zaškrtnite „Podpísal majster (Kunde)" — len keď je na liste naozaj podpis.',
            'Vyplňte „Meno majstra" a „Spolu na papieri" (číslo Total z listu). Appka ho porovná so súčtom.',
            'Kliknite „Uložiť hodiny".',
            'V okne „Hodiny sú uložené" môžete „Pozrieť hodiny" alebo „Zapísať ďalší list".',
          ],
          open: null,
          tip: 'Hodiny v uzavretom období sa už nezmenia — z neho už vznikla faktúra. Appka napíše, ktoré to sú.',
          example: null,
        },
        {
          title: 'Schváliť hodiny bez podpisu',
          what: 'Hodiny bez podpisu majstra sú neschválené. Do podkladu na faktúru sa nedostanú, kým ich niekto neschváli.',
          how: [
            'V menu Zákazky → Hodiny je navrchu rámik „Schváliť hodiny".',
            'Filtrom vyberte zákazku alebo človeka a skontrolujte hodiny.',
            'Kliknite „Schváliť všetkých …" — schváli sa presne to, čo je vo filtri vidieť.',
            'Jeden riadok schválite fajkou pri ňom.',
          ],
          open: open('timesheets', 'Otvoriť Hodiny'),
          tip: 'Hodiny sa majú zapísať najneskôr do 7 dní po práci (§19 AEntG). Na neschválené hodiny staršie ako 7 dní appka upozorní navrchu obrazovky.',
          example: null,
        },
        {
          title: 'Výkaz pre odberateľa (na tlač)',
          what: 'Výkaz je týždenný list po nemecky za jednu zákazku — celú alebo len jednu partiu z nej. Je len na tlač; hodiny aj podpis v ňom sú tie isté ako v okne „Zapísať hodiny".',
          how: [
            'V menu Zákazky → Výkaz vyberte partiu (alebo „Celá zákazka") a týždeň.',
            'Zákazku appka zistí z nasadení partie v tom týždni. Keď sa to nedá, opýta sa — nehádá.',
            'Kliknite „Tlačiť" a list zaneste na podpis.',
            'Keď je podpísaný, kliknite „Podpísané" — otvorí sa okno hodín a podpis zapíšete tam.',
          ],
          open: open('hoursheet', 'Otvoriť Výkaz'),
          tip: 'Hodiny sa do výkazu nepíšu. Zapisujú sa len cez „Zapísať hodiny", aby podpísaný papier a faktúra tvrdili to isté.',
          example: 'Partia Kováčik má posledné dva týždne podpísané (Thomas Brandl). Výkaz Partie Szabó je pripravený, pán Neumann ho podpíše v piatok.',
        },
        {
          title: 'Výnimka: jeden deň inej práce',
          what: 'Deň, ktorý nebol prácou na stavbe (cesta, dielňa), alebo deň s popisom práce sa zapíše v tom istom okne.',
          how: [
            'Kliknite „Zapísať hodiny" a v okne „Jeden deň inej práce".',
            'Vyberte človeka, deň, hodiny a činnosť.',
          ],
          open: open('timesheets', 'Otvoriť Hodiny'),
          tip: 'Bežné hodiny zo stavby píšte do tabuľky týždňa. „Jeden deň inej práce" je len na výnimky.',
          example: null,
        },
      ],
    },

    // ── 6 ────────────────────────────────────────────────────────────────────
    {
      key: 'fakturacia',
      title: 'Fakturácia odberateľovi',
      lead: 'Z odpracovaných hodín faktúra pre nemeckú firmu. Faktúra sa nikdy nevystaví ani neodošle '
        + 'bez schválenia adminom.',
      steps: [
        {
          title: 'Obdobie — za čo sa fakturuje',
          what: 'Obdobie je úsek dní (zvyčajne kalendárny mesiac), za ktorý sa fakturuje. Hodiny mimo obdobia sa nevyfakturujú.',
          how: [
            'Otvorte zákazku a krok 7 „Hodiny a faktúra". Dole je časť „Obdobia a faktúry".',
            'Kliknite „Nové obdobie …" — appka ponúkne ďalší mesiac.',
            'Ak tam je veta „Mimo obdobia čaká … hodín", tie hodiny ešte nie sú v žiadnom období.',
          ],
          open: open('subcontracts', 'Otvoriť Zákazky'),
          tip: null,
          example: null,
        },
        {
          title: 'Uzavrieť obdobie',
          what: 'Uzavretím sa schválené hodiny aj sadzby zmrazia. Z uzavretého obdobia vznikne podklad na faktúru.',
          how: [
            'Pri otvorenom období kliknite „Uzavrieť".',
            'Skontrolujte náhľad: ľudia, hodiny, koľko fakturujeme, koľko dáme živnostníkom a maržu.',
            'Kliknite „Uzavrieť obdobie".',
          ],
          open: open('subcontracts', 'Otvoriť Zákazky'),
          tip: 'Neschválené hodiny do podkladu nejdú — appka na ne upozorní. Kým z obdobia nie je faktúra, dá sa otvoriť späť (ikona so šípkami) a appka sa spýta na dôvod.',
          example: null,
        },
        {
          title: 'Návrh faktúry',
          what: 'Z uzavretého obdobia vznikne návrh faktúry. Návrh je len v appke — odberateľ o ňom nevie.',
          how: [
            'Pri uzavretom období kliknite „Fakturovať". Návrh sa otvorí vo Vydaných faktúrach.',
            'Alebo: Fakturácia → Vydané → „Nová faktúra" → „Zo zákazky — z odpracovaných hodín" a vyberte obdobie.',
            'Za celý mesiac naraz: „Mesačná fakturácia" → mesiac → „Pripraviť … návrhov". Appka obdobia založí, uzavrie a pripraví návrhy.',
            'Paušál, materiál alebo refakturácia ubytovania: „Nová faktúra" → „Voľná faktúra nemeckej firme".',
          ],
          open: open('invoices', 'Otvoriť Vydané faktúry'),
          tip: null,
          example: 'VZOR-2026-0008 je voľná faktúra pre Krüger Innenausbau — refakturácia ubytovania Ferienwohnung Keller. VZOR-2026-0009 (Stahlbau Neumann) je ešte „Návrh".',
        },
        {
          title: 'Kontrola a poslanie na schválenie',
          what: 'Pred schválením appka faktúru skontroluje: odberateľa, číslo, sumu oproti hodinám a USt-IdNr.',
          how: [
            'Otvorte faktúru v stave „Návrh".',
            '„Zobraziť faktúru (PDF)" ukáže faktúru po nemecky. „Upraviť návrh" zmení dátumy alebo položky.',
            'Pozrite časť „Pred schválením". Kým tam svieti niečo červené, schváliť sa nedá.',
            'Kliknite „Poslať na schválenie".',
          ],
          open: open('invoices', 'Otvoriť Vydané faktúry'),
          tip: 'Bez DPH s vetou o §13b sa fakturuje samo, keď má odberateľ USt-IdNr. Keď odberateľ nemá kópiu našej Freistellung §48b, zrazí si 15 % — na účet príde menej.',
          example: 'VZOR-2026-0007 (Krüger Innenausbau, Neckarpark) čaká na schválenie a je v nej zrážka 15 % (§48b), lebo odberateľ Freistellung neoveril.',
        },
        {
          title: 'Schválenie',
          what: 'Faktúru schvaľuje admin. Po schválení sa už nemení — opravuje sa len dobropisom.',
          how: [
            'Admin otvorí faktúru „Čaká na schválenie" a klikne „Schváliť".',
            'Kto nie je admin, počká. Na Dnes svieti „faktúra čaká na schválenie".',
          ],
          open: open('invoices', 'Otvoriť Vydané faktúry'),
          tip: 'Nikdy neposielajte odberateľovi PDF faktúry, ktorá ešte nie je schválená — ani „na ukážku".',
          example: null,
        },
        {
          title: 'Vystaviť a odoslať',
          what: 'Schválená faktúra sa vystaví v SuperFaktúre (dostane platné číslo) a potom sa odošle odberateľovi e-mailom po nemecky.',
          how: [
            'Otvorte schválenú faktúru a kliknite „Vystaviť v SuperFaktúre".',
            'Potom kliknite „Odoslať odberateľovi". Poslaný e-mail sa nedá vziať späť.',
          ],
          open: open('invoices', 'Otvoriť Vydané faktúry'),
          tip: null,
          example: 'VZOR-2026-0006 je „Vystavená" a čaká na odoslanie. VZOR-2026-0005 (Wohnanlage Isarauen) je „Odoslaná" a čaká na peniaze.',
        },
        {
          title: 'Po splatnosti a upomienky',
          what: 'Keď peniaze do splatnosti neprídu, faktúra dostane stav „Po splatnosti" a svieti na Dnes červeno.',
          how: [
            'Najprv odberateľovi zavolajte. Čo sľúbil, zapíšte (Správy → Interné alebo úloha).',
            'Na Vydaných faktúrach kliknite hore „Upomienky" a pri faktúre „Vytvoriť".',
            'Otvorí sa upomienka po nemecky s QR kódom. Pošlite ju sami — appka ju neodosiela.',
            'Ďalší stupeň sa ponúkne 14 dní po predchádzajúcom. Stupne sú tri.',
          ],
          open: open('invoices', 'Otvoriť Vydané faktúry'),
          tip: null,
          example: 'VZOR-2026-0003 (Hofmann Bau, Lagerhalle Freiham) je po splatnosti, prvá upomienka odišla pred tromi dňami a pán Hofmann sľúbil úhradu do piatku.',
        },
        {
          title: 'Úhrada a banka',
          what: 'Keď peniaze prídu, načítate výpis z banky a platby sa spárujú s faktúrami podľa variabilného symbolu.',
          how: [
            'V menu Fakturácia → Banka kliknite „Načítať výpis".',
            'Nahrajte výpis vo formáte XML (camt.053) z Business Bankingu, prípadne CSV. Kliknite „Uložiť pohyby".',
            'Kliknite „Spárovať automaticky". Čo ostane nespárované, priradíte cez „Spárovať" alebo označíte „Nezaujíma nás".',
            'Spárovaná faktúra sa sama označí ako uhradená.',
          ],
          open: open('bank', 'Otvoriť Banku'),
          tip: 'Variabilný symbol sú číslice z čísla faktúry. Keď ho odberateľ nenapíše, platbu spárujte ručne.',
          example: 'Platba od Hofmann Bau GmbH s VS 20260001 a správou „RE VZOR-2026-0001" sa spárovala s faktúrou VZOR-2026-0001.',
        },
        {
          title: 'Pre účtovníčku',
          what: 'Raz za mesiac pripravíte účtovníčke vydané, prijaté faktúry a náklady naraz.',
          how: [
            'Na Vydaných faktúrach kliknite hore „Pre účtovníčku".',
            'Vyberte mesiac alebo rok a kliknite „Len tabuľky" alebo „Balík so súbormi (ZIP)".',
          ],
          open: open('invoices', 'Otvoriť Vydané faktúry'),
          tip: null,
          example: null,
        },
      ],
    },

    // ── 7 ────────────────────────────────────────────────────────────────────
    {
      key: 'vyplaty',
      title: 'Faktúry od živnostníkov a výplaty',
      lead: 'Živnostníci nám fakturujú za odpracované hodiny. Každú ich faktúru porovnáme s hodinami, '
        + 'schválime a zaplatíme naraz.',
      steps: [
        {
          title: 'Prišla faktúra od živnostníka',
          what: 'Faktúry od živnostníkov aj od dodávateľov (ubytovanie, benzín) sú v Prijatých. Appka ich vie prečítať z PDF aj z fotky.',
          how: [
            'V menu Fakturácia → Prijaté kliknite „Nahrať faktúry" a vyberte PDF alebo fotky. Na mobile je „Odfotiť faktúru" a „Odfotiť bloček".',
            'Faktúru bez súboru zapíšete cez „Zadať ručne".',
            'Nahratá faktúra sa objaví v časti „Na kontrolu".',
          ],
          open: open('costs', 'Otvoriť Prijaté faktúry'),
          tip: null,
          example: null,
        },
        {
          title: 'Skontrolovať, čo appka prečítala',
          what: 'Pri faktúre „Na kontrolu" je vedľa dokladu, čo z neho appka prečítala. Treba to potvrdiť človekom.',
          how: [
            'V „Na kontrolu" otvorte faktúru.',
            'Porovnajte údaje s dokladom a opravte, čo nesedí. Pri faktúre od živnostníka vyberte jeho meno a obdobie.',
            'Bloček zaplatený kartou alebo v hotovosti zaškrtnite „Už zaplatené".',
            'Kliknite „Potvrdiť faktúru".',
          ],
          open: open('costs', 'Otvoriť Prijaté faktúry'),
          tip: 'Ak je na faktúre iný IBAN, než má živnostník na karte, appka upozorní. Overte si to telefonicky, než zaplatíte.',
          example: 'Faktúra Pension Sonnenhof RE-2026-1047 (1 350 €) čaká na kontrolu — appka upozorňuje, že je na nej DPH 7 %.',
        },
        {
          title: 'Porovnať s hodinami',
          what: 'Appka spočíta, koľko by malo byť na faktúre: schválené hodiny v období krát sadzba živnostníka. Rozdiel ukáže.',
          how: [
            'Otvorte faktúru živnostníka. Časť „Porovnanie s hodinami" ukáže výpočet.',
            '„Sedí so schválenými hodinami" — v poriadku. „Rozdiel … oproti podkladu" — treba zistiť prečo.',
            'Keď rozdiel vysvetlí živnostník, opravte faktúru („Upraviť") alebo pokračujte so schválením a dôvodom.',
          ],
          open: open('costs', 'Otvoriť Prijaté faktúry'),
          tip: 'Porovnať sa dá len s uzavretým obdobím. Kým obdobie nie je uzavreté, appka napíše, že sa porovnať nedá.',
          example: 'Marek Hudec (faktúra 3/2026) má o 120 € viac, než dávajú schválené hodiny — fakturoval aj deň u lekára. László Szabó (SZL-2026-09) poslal faktúru skôr, než sa obdobie uzavrelo.',
        },
        {
          title: 'Skontrolovaná a schválená',
          what: 'Prijatá faktúra ide dvoma krokmi: niekto ju skontroluje a potom sa schváli. Až schválená sa dá zaplatiť.',
          how: [
            'V otvorenej faktúre kliknite „Označiť skontrolovanú".',
            'Potom kliknite „Schváliť". Keď suma nesedí s hodinami, appka si vypýta dôvod a zapíše ho k faktúre.',
          ],
          open: open('costs', 'Otvoriť Prijaté faktúry'),
          tip: null,
          example: 'Faktúra Gábora Nagya NG-09/2026 je skontrolovaná a čaká na schválenie.',
        },
        {
          title: 'Samofakturácia — faktúra za živnostníka',
          what: 'Niektorým živnostníkom faktúru vystavujeme my v ich mene. Musí to byť dohodnuté v rámcovej zmluve a živnostník ju vždy potvrdí.',
          how: [
            'Na karte živnostníka kliknite „Upraviť" a zaškrtnite „Faktúry zaňho vystavujeme my". Podpíšte s ním rámcovú zmluvu v tomto znení.',
            'Po uzavretí obdobia: Fakturácia → Prijaté → „Vystaviť za živnostníkov" → „Pripraviť návrhy".',
            'Admin otvorí návrh a klikne „Schváliť a vystaviť" — faktúra dostane číslo z radu živnostníka.',
            'Pošlite ju živnostníkovi tlačidlom „WhatsApp", „SMS" alebo „Kopírovať odkaz". Na odkaze ju potvrdí alebo napíše, s čím nesúhlasí.',
          ],
          open: open('costs', 'Otvoriť Prijaté faktúry'),
          tip: 'Bez potvrdenia živnostníkom sa faktúra neplatí. Platiteľovi DPH sa takto faktúra nevystavuje.',
          example: 'Tomášovi Dvořákovi bola faktúra poslaná na potvrdenie. Za Ondřeja Šťastného (OS Montáže s.r.o.) je pripravený návrh.',
        },
        {
          title: 'Zálohy a preplatenie výdavkov',
          what: 'Záloha je peniaz vopred — odpočíta sa z jeho najbližšej faktúry. Výdavok (materiál, benzín) mu vrátime.',
          how: [
            'Na karte živnostníka kliknite „Záloha / platba".',
            'Vyberte „Dať zálohu" alebo „Preplatiť výdavok" a vyplňte sumu a spôsob (hotovosť alebo prevod).',
            'Prehľad za všetkých je v Fakturácia → Zálohy a výplaty.',
          ],
          open: open('advances', 'Otvoriť Zálohy a výplaty'),
          tip: null,
          example: 'Peter Baláž dostal zálohu 300 € na opravu auta — odpočíta sa z októbrovej faktúry. Jakub Novotný dostal 100 € na lístok na vlak do Stuttgartu.',
        },
        {
          title: 'Zaplatiť naraz',
          what: 'Schválené faktúry zaplatíte jedným súborom pre banku. Appka sama nič neodošle.',
          how: [
            'V Prijatých (alebo v Banke) kliknite „Pripraviť platby".',
            'Zaškrtnite, čo sa má zaplatiť, a kliknite „Stiahnuť súbor pre banku".',
            'Súbor nahrajte v Business Bankingu ako dávku platieb a podpíšte ju.',
            'Po ďalšom „Načítať výpis" sa platby spárujú a faktúry sa označia ako uhradené.',
          ],
          open: open('bank', 'Otvoriť Banku'),
          tip: null,
          example: null,
        },
      ],
    },

    // ── 8 ────────────────────────────────────────────────────────────────────
    {
      key: 'ostatne',
      title: 'Dokumenty, správy a úlohy',
      lead: 'Kde nájdete každé PDF, e-maily, interné poznámky a pripomienky.',
      steps: [
        {
          title: 'Dokumenty',
          what: 'Každé PDF z appky (zmluvy, GDPR, objednávky, infolisty, faktúry) je v Dokumentoch, triedené podľa ľudí a firiem.',
          how: [
            'V menu Dnes kliknite na záložku „Dokumenty".',
            'Zaškrtnite jeden alebo viac dokumentov a kliknite „Stiahnuť", „E-mailom" alebo „Poslať".',
            'Dokumenty jedného človeka sú aj na jeho karte (záložka „Dokumenty"), dokumenty stavby v zákazke („Dokumenty zákazky").',
          ],
          open: open('archive', 'Otvoriť Dokumenty'),
          tip: 'Do Dokumentov sa dostane len papier uložený cez „Stiahnuť PDF".',
          example: null,
        },
        {
          title: 'E-maily',
          what: 'Firemné e-maily z viacerých schránok. E-maily sa samy priradia k ľuďom a firmám podľa adresy.',
          how: [
            'V menu Správy → E-maily vyberte schránku. Nové e-maily stiahnete cez „Obnoviť".',
            'Nový e-mail napíšete cez „Napísať". Prílohu z appky pridáte cez „Z Dokumentov".',
            'E-mail, ktorý sa nepriradil sám, priradíte tlačidlom „Priradiť".',
          ],
          open: open('mail', 'Otvoriť E-maily'),
          tip: 'Vidíte len schránky, ktoré Vám pridelil admin.',
          example: null,
        },
        {
          title: 'Interné poznámky',
          what: 'Poznámky pre kolegov pri zázname, ktorého sa týkajú — aby nikto nemusel držať dohodu v hlave.',
          how: [
            'V menu Správy → Interné kliknite „Nová správa".',
            'Napíšte, čoho sa to týka, a uložte.',
          ],
          open: open('messages', 'Otvoriť Interné poznámky'),
          tip: null,
          example: '„Majster volal, že Bauteil C sa uvoľní až o týždeň. Posunúť nástup posily, inak budú stáť."',
        },
        {
          title: 'Úlohy a pripomienky',
          what: 'Čo treba spraviť a dokedy. Časť úloh vzniká sama z pravidiel (napríklad keď končí platnosť ponuky).',
          how: [
            'V menu Dnes kliknite na záložku „Úlohy". Novú pridáte cez „Nová úloha".',
            'Pri úlohe kliknite „Beriem si to", keď ju robíte Vy, alebo „Odložiť o týždeň".',
            'Úlohy po termíne sú navrchu a svietia aj na Dnes.',
          ],
          open: open('tasks', 'Otvoriť Úlohy'),
          tip: 'Úloha po termíne je vec, ktorú niekto čaká — nie poznámka.',
          example: 'Úloha „Zavolať pánovi Hofmannovi kvôli faktúre VZOR-2026-0003" je s vysokou prioritou po termíne.',
        },
        {
          title: 'Ako to ide',
          what: 'Sedem krokov firmy so živými číslami: koľko toho v kroku je a koľko čaká na Vás.',
          how: [
            'V menu Dnes kliknite na záložku „Ako to ide".',
            'Pri kroku kliknite na šípku vpravo — otvorí sa obrazovka, kde sa to rieši.',
          ],
          open: open('flow', 'Otvoriť Ako to ide'),
          tip: null,
          example: null,
        },
      ],
    },

    // ── 9 ────────────────────────────────────────────────────────────────────
    {
      key: 'admin',
      title: 'Čo robí admin',
      lead: 'Niektoré veci smie len administrátor. Kolegovia v kancelárii ich pripravia a admin ich potvrdí.',
      steps: [
        {
          title: 'Schvaľovanie',
          what: 'Admin schvaľuje všetko, čo ide von alebo stojí peniaze.',
          how: [
            'Vydané faktúry: „Schváliť" — bez toho sa faktúra nevystaví ani neodošle.',
            'Prijaté faktúry: „Schváliť" — až potom sa dajú zaplatiť.',
            'Faktúry za živnostníkov: „Schváliť a vystaviť".',
            'Výnimky: nasadenie bez platných dokladov a rozdiel faktúry oproti podkladu — vždy s napísaným dôvodom.',
          ],
          open: open('invoices', 'Otvoriť Vydané faktúry'),
          tip: 'Výnimka sa nemaže. Zostane pri zázname aj s dôvodom, aby bolo o rok jasné, kto a prečo ju povolil.',
          example: null,
        },
        {
          title: 'Nastavenia',
          what: 'Veci, ktoré sa nastavia raz a potom z nich čerpá celá appka.',
          how: [
            'Nastavenia → „Firma a agendy": fakturačné údaje, pečiatka a podpis, číselné rady, zapnuté agendy.',
            'Nastavenia → „Compliance": firemné doklady, napríklad Freistellung §48b a jej platnosť.',
            'Nastavenia → „Cenník": sadzby a prahy, ktoré vstupujú do výpočtov.',
            'Nastavenia → „Používatelia" a „Schránky": kto smie do appky, na čo a ktoré e-maily vidí.',
            'Nastavenia → „Remeslá": otázky pri nábore pre jednotlivé remeslá.',
            'Nastavenia → „Archív": archivované záznamy; admin ich vie vrátiť späť.',
          ],
          open: open('settings', 'Otvoriť Nastavenia'),
          tip: 'Bez názvu firmy, adresy a IČO v Nastaveniach appka nepustí von žiadny papier — povie, čo chýba.',
          example: null,
        },
        {
          title: 'Archív — vrátiť omylom archivovaný záznam',
          what: 'V appke sa nič nemaže. Tlačidlo „Archivovať" záznam len odloží do archívu — zmizne '
            + 'zo zoznamov, ale admin ho odtiaľ vie vrátiť späť.',
          how: [
            'Nastavenia → „Archív": hore vyberte druh záznamov, napríklad Zákazky alebo Kandidáti.',
            'Pri zázname kliknite „Vrátiť späť" a potvrďte.',
            'Vráti sa aj to, čo sa archivovalo spolu s ním — napríklad nasadenia pri zákazke.',
          ],
          open: open('archiv', 'Otvoriť Archív'),
          tip: 'Odberateľa, na ktorom visia živé zákazky, appka archivovať nepustí. Najprv treba archivovať zákazky.',
          example: null,
        },
        {
          title: 'Vzorové dáta',
          what: 'Pred ostrou prevádzkou admin vzorové dáta vymaže. Ostrých záznamov sa to nedotkne. '
            + 'Je to jediná výnimka, keď sa naozaj maže — vzorové dáta nie sú záznamy firmy.',
          how: [
            'Na Dnes v páse „V systéme sú vzorové dáta" kliknite „Vymazať vzorové dáta".',
            'Na potvrdenie napíšte VYMAZAŤ.',
          ],
          open: open('dashboard', 'Otvoriť Prehľad dňa'),
          tip: null,
          example: null,
        },
      ],
    },
  ];

  // ── Ťahák na jednu stranu ─────────────────────────────────────────────────
  const CHEAT = {
    daily: [
      'Ráno otvorte Dnes a urobte to, čo je v rámiku „Čo spraviť teraz".',
      'Novým kandidátom zavolajte do 10 minút (Ľudia → Kandidáti).',
      'Na nový dopyt sa ozvite ako prví (Zákazky → Dopyty).',
      'Pozrite zvonček a úlohy po termíne.',
      'Doklad po platnosti: človek nejde na stavbu, kým ho nedoplníte.',
      'Prijaté faktúry „Na kontrolu" skontrolujte a potvrďte.',
    ],
    weekly: [
      'Pondelok: Stundennachweis za minulý týždeň — fotka, „Podpísal majster", „Uložiť hodiny".',
      'Neschválené hodiny schváľte (Zákazky → Hodiny).',
      'Pred nástupom: nasadenie, papiere ľudí, ubytovanie, objednávka, „Poslať všetko naraz".',
      'Načítajte výpis z banky a spárujte platby.',
      'Ponukám, ktorým končí platnosť, zavolajte.',
      'A1 a doklady, ktoré končia do 30 dní: vybavte nové.',
    ],
    monthly: [
      'Po skončení mesiaca uzavrite obdobia (alebo „Mesačná fakturácia").',
      'Návrhy faktúr skontrolujte a „Poslať na schválenie".',
      'Po schválení: „Vystaviť v SuperFaktúre" a „Odoslať odberateľovi".',
      'Faktúry živnostníkov porovnajte s hodinami; samofakturácia cez „Vystaviť za živnostníkov".',
      '„Pripraviť platby" a súbor nahrať do banky.',
      'Faktúry po splatnosti: zavolať, potom „Upomienky".',
      '„Pre účtovníčku": balík za mesiac.',
    ],
    never: [
      'Faktúru nikdy neposielajte odberateľovi bez schválenia adminom.',
      'Nikoho nepošlite na stavbu bez platného A1, GDPR a rámcovej zmluvy.',
      'Nezapisujte „podpísané", kým podpis naozaj nemáte.',
      'Neschvaľujte hodiny bez podpisu majstra len preto, aby to prešlo.',
      'Nemeňte typ prác zo stavby na dielňu, aby zmizli podmienky.',
      'Neplaťte na IBAN, ktorý nesedí s kartou, bez overenia telefonicky.',
      'V zmluve nepíšte hodiny a počet ľudí namiesto diela.',
      'Nestláčajte „Vymazať vzorové dáta" — rozhoduje admin.',
    ],
  };

  // ── Sprievodca pre nového kolegu ──────────────────────────────────────────
  // Selektory ukazujú na prvky, ktoré v appke naozaj sú: ľavé menu kreslí
  // `Danubra._buildNav()` (`.nav-item[data-key]`, `.nav-sub-item[data-sub]`),
  // sedem krokov na Dnes je `section.st7`, horný pruh je v index.html.
  const TOUR = [
    { selector: '#sidebar-nav .nav-item[data-key="dashboard"]', route: null,
      title: 'Dnes — tu začína každý deň',
      text: 'Prvá obrazovka po prihlásení — Prehľad dňa. Hore je **jedna vec, ktorú treba spraviť teraz**, a tlačidlo, ktoré Vás k nej zavedie.' },
    { selector: '.st7', route: 'dashboard',
      title: 'Sedem krokov od dopytu po faktúru',
      text: 'Celá cesta firmy na jednom mieste. Pri každom kroku je stav — **Horí**, **Čaká** alebo **V poriadku** — a tlačidlo rovno k práci.' },
    { selector: '#sidebar-nav .nav-item[data-key="subcontracts"]', route: null,
      title: 'Zákazky',
      text: 'Každá stavba je jedna zákazka. Pri nej je **sedem krokov pod sebou**: ľudia, papiere, ubytovanie, hodiny a faktúra. Pod Zákazkami sú aj Dopyty, Ponuky, Odberatelia a Hodiny.' },
    { selector: '#sidebar-nav .nav-item[data-key="workers"]', route: null,
      title: 'Ľudia',
      text: 'Kartotéka živnostníkov: doklady, sadzby, fakturačné údaje. Pod Ľuďmi sú aj Nábor, Kandidáti, Inzeráty a Partie.' },
    { selector: '#sidebar-nav .nav-item[data-key="money"]', route: null,
      title: 'Fakturácia',
      text: 'Vydané faktúry odberateľom, prijaté faktúry od živnostníkov, zálohy a banka. **Žiadna faktúra neodíde bez schválenia adminom.**' },
    { selector: '.mega-btn', route: null,
      title: 'Všetko',
      text: 'Keď niečo v menu nevidíte, kliknite sem. Ukážu sa všetky obrazovky naraz a pri každej jedna veta o tom, čo na nej je.' },
    // Hľadanie v hornom pruhu (`Danubra.searchBind`). Na telefóne je to pole
    // v tmavej hlavičke — preto oba selektory.
    { selector: '.searchbox, .mh-search', route: null,
      title: 'Hľadať',
      text: 'Napíšte mesto, meno, telefón alebo číslo objednávky. Netreba vedieť, na ktorej obrazovke záznam je.' },
    { selector: '#btn-papers', route: null,
      title: 'Papiere na dva kliky',
      text: 'Súhlas GDPR, zmluva, objednávka, infolist: vyberiete papier, vyberiete človeka a údaje sa doplnia samy.' },
    { selector: '#bell-slot', route: null,
      title: 'Zvonček',
      text: 'Čo sa stalo, kým ste sa nepozerali: vypršal doklad, faktúra je po splatnosti, ozval sa kandidát. Kliknutím na udalosť sa otvorí záznam.' },
    { selector: '#btn-help', route: null,
      title: 'Otáznik — keď si nie ste istý',
      text: 'Pri čísle alebo tlačidle, ktorému nerozumiete, hľadajte otáznik. Celý návod je v **Dnes → Návod** — odtiaľ spustíte tohto sprievodcu aj znova.' },
  ];

  // ── Slovníček ─────────────────────────────────────────────────────────────
  const GLOSSARY = [
    { term: 'A1', text: 'Potvrdenie zo Sociálnej poisťovne (CZ: ČSSZ, HU: NEAK), že živnostník je poistený doma. Bez platného A1 nesmie pracovať v Nemecku. Platnosť sa posudzuje k dňu nástupu.' },
    { term: 'Stundennachweis', text: 'Týždenný list s hodinami po dňoch. Na stavbe ho podpíše majster odberateľa a podľa neho fakturujeme.' },
    { term: 'KW (Kalenderwoche)', text: 'Číslo týždňa v roku, tak ako ho počítajú Nemci. Stundennachweis je vždy za jeden KW, od pondelka do nedele.' },
    { term: 'Majster', text: 'Vedúci stavby na strane odberateľa (na Stundennachweise „Kunde"). Dáva pokyny a podpisuje Stundennachweis.' },
    { term: 'Predák', text: 'Náš človek, ktorý na stavbe vedie prácu. Vlastné vedenie prác je dôkaz, že ide o dielo a nie o požičiavanie ľudí.' },
    { term: 'Werkvertrag (zmluva o dielo)', text: 'Zmluva na konkrétny výsledok práce, nie na hodiny. Fakturujeme po hodinách, ale dielo musí byť v zmluve opísané.' },
    { term: 'Rámcová zmluva', text: 'Spoločné podmienky na dlhšiu spoluprácu. S odberateľom (Rahmenvertrag) aj so živnostníkom (zvyčajne do konca roka). Konkrétna práca sa potom objednáva objednávkou.' },
    { term: 'ANÜ (Arbeitnehmerüberlassung)', text: 'Požičiavanie ľudí inej firme. Na to treba v Nemecku osobitné povolenie. Keď zákazka vyzerá ako ANÜ, hrozia vysoké pokuty.' },
    { term: '§13b (reverse charge)', text: 'Prenesenie daňovej povinnosti: faktúra nemeckej firme je bez DPH a daň odvedie odberateľ. Musí mať platné USt-IdNr. My nie sme platitelia DPH.' },
    { term: 'USt-IdNr', text: 'Nemecké IČ DPH odberateľa (napríklad DE287451936). Overuje sa v registri EÚ (VIES).' },
    { term: 'Freistellung §48b', text: 'Potvrdenie nemeckého finančného úradu, že odberateľ nemusí z našej faktúry zrážať 15 % stavebnej dane. Máme ho ako firma; odberateľ by mal mať jeho kópiu.' },
    { term: 'SOKA-BAU', text: 'Nemecká stavebná pokladnica (dovolenky a dôchodky stavbárov). Týka sa nás, keď je viac ako polovica hodín na stavbe.' },
    { term: 'Zoll (hlásenie)', text: 'Pred začiatkom prác na stavbe sa ľudia hlásia colnej správe cez meldeportal-mindestlohn.de. Číslo hlásenia (Meldungs-ID) sa zapíše k zákazke.' },
    { term: 'IČO, DIČ, IČ DPH', text: 'IČO je číslo firmy alebo živnostníka v registri, DIČ je daňové číslo, IČ DPH majú len platitelia DPH. Bez IČO a IBAN-u sa faktúra živnostníka nedá zaúčtovať.' },
    { term: 'Obdobie', text: 'Úsek dní (zvyčajne mesiac), za ktorý sa fakturuje. Uzavretím sa schválené hodiny a sadzby zmrazia a vznikne z nich podklad na faktúru.' },
    { term: 'Samofakturácia', text: 'Faktúru za živnostníka vystavíme my v jeho mene. Musí to byť dohodnuté v rámcovej zmluve a živnostník ju potvrdí cez odkaz.' },
    { term: 'Partia', text: 'Skupina živnostníkov, ktorá chodí na stavby spolu a má jeden týždenný výkaz. Fakturuje každý sám za seba.' },
    { term: 'Kontaktná osoba', text: 'Človek, ktorému živnostník zavolá, keď prvý deň nevie, kam ísť — kolega zo stavby alebo majster odberateľa. Je na infoliste.' },
    { term: 'Balík („Poslať všetko naraz")', text: 'Jedna správa so všetkými papiermi na nástup: infolist na stavbu a k ubytovaniu, objednávka, vzor faktúry a prázdny Stundennachweis.' },
    { term: 'Archív', text: 'Miesto, kam sa odkladá to, čo už v zoznamoch nemá byť. V appke sa nič nemaže: „Archivovať" záznam len skryje a admin ho v Nastaveniach → Archív vie vrátiť späť aj s tým, čo sa archivovalo spolu s ním.' },
    { term: 'Výnimka', text: 'Admin vedome povolí, čo by appka inak nepustila (napríklad nasadenie bez dokladu). Vždy s dôvodom, ktorý zostane zapísaný.' },
  ];

  const API = { CHAPTERS, CHEAT, TOUR, GLOSSARY };
  if (typeof window !== 'undefined') window.DanubraGuide = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
