// ============================================================================
// DANUBRA — rámcová zmluva s nemeckým odberateľom, dvojjazyčne
// ============================================================================
// Tretí krok: „potrebujem spraviť dvojjazyčnú objednávku a zmluvu s Nemcom."
//
// Dvojjazyčne nie je zdvorilosť. On podpisuje po nemecky, my čítame po
// slovensky — a keď sa raz budú obe strany hádať o to, na čom sa dohodli,
// musí byť vidieť, že obe verzie hovoria to isté. Preto je každý odstavec
// dvojica `{ sk, de }` a nie dva nezávislé texty: keď sa jeden zmení a druhý
// nie, je to vidieť na prvý pohľad, nie až pri spore.
//
// Rozhodné právo je **slovenské** (čl. 3 nariadenia Rím I) a príslušné sú
// **slovenské súdy** (čl. 25 nariadenia Brusel I bis) — aj keď sa dielo
// vykonáva v Nemecku. To je zámer, nie prehliadnutie.
//
// Text je doslovne podľa firemnej šablóny „Rahmenvertrag SK_DE" (Google Drive,
// 04 - ŠABLÓNY - Zmluvy EÚ / 00 - Šablóny). Šablóna nemá číslo zmluvy —
// objednávka (Bestellung) sa na zmluvu odvoláva dátumom jej uzavretia.
//
// Čisté funkcie, žiadny `window`, žiadny DB prístup.
// Testy: node app/lib/documents/framework-de.test.js
// ============================================================================
(function () {
  /**
   * Lehoty a sumy. Predvolené sú tie z podpísanej zmluvy; prepíšu sa
   * v Nastaveniach (oddiel `framework_de`).
   */
  const SUMY = {
    objednavka_dni: 5,            // koľko pracovných dní vopred príde objednávka
    fakturacia_dni: 7,            // v akých intervaloch fakturujeme (šablóna: 7-dňové, po KW)
    splatnost_dni: 7,             // splatnosť našej faktúry
    urok_omeskanie_pct: 0.05,     // zmluvná pokuta za deň omeškania s platbou
    vykaz_namietka_dni: 3,        // dokedy musí namietať nepodpísaný výkaz
    vypoved_dni: 7,               // výpovedná lehota
    odstupenie_omeskanie_dni: 10, // po koľkých dňoch omeškania odstúpime
    dorucenie_dni: 5,             // fikcia doručenia poštou
    // **V podpísanej zmluve je tu prázdne miesto: „...... € za každú osobu
    // a každý deň prestojov".** Prestoj je pritom to, čo firmu stojí najviac:
    // ľudia sú na stavbe, platia sa, a nerobia, lebo chýba materiál. Nula
    // znamená, že sa to na papier napíše ako chýbajúci údaj — nie že prestoj
    // je zadarmo.
    prestoj_pokuta: 0,
  };

  const eur = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return null;
    return v.toLocaleString('sk-SK', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
  };
  const eurDe = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return null;
    return v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
  };
  const pct = (n) => String(n).replace('.', ',');

  /** Radová číslovka slovom, ako v šablóne („v piaty pracovný deň" / „am fünften Werktag"). */
  const PORADIE_SK = ['', 'prvý', 'druhý', 'tretí', 'štvrtý', 'piaty', 'šiesty', 'siedmy', 'ôsmy', 'deviaty', 'desiaty'];
  const PORADIE_DE = ['', 'ersten', 'zweiten', 'dritten', 'vierten', 'fünften', 'sechsten', 'siebten', 'achten', 'neunten', 'zehnten'];
  const porSk = (n) => PORADIE_SK[Number(n)] || `${n}.`;
  const porDe = (n) => PORADIE_DE[Number(n)] || `${n}.`;

  /**
   * Osem článkov, každý odstavec v oboch jazykoch — **doslovne podľa firemnej
   * šablóny „Rahmenvertrag SK_DE"** (Google Drive, 04 - ŠABLÓNY - Zmluvy EÚ /
   * 00 - Šablóny). Lehoty a sumy sú z `SUMY`, teda z Nastavení.
   * Odstavec môže mať vymenovanie pod sebou (`list_sk` / `list_de`).
   * `{{PRESTOJ}}` sa nahrádza sumou alebo značkou chýbajúceho údaja.
   */
  function clanky({ s = SUMY } = {}) {
    return [
      {
        rim: 'II.', sk: 'Predmet zmluvy', de: 'Vertragsgegenstand',
        body: [
          {
            sk: 'Zhotoviteľ sa touto zmluvou zaväzuje realizovať pre Objednávateľa dielo bližšie '
              + 'špecifikované v texte tejto zmluvy, resp. v jednotlivých Objednávkach, ktoré tvoria '
              + 'neoddeliteľnú prílohu tejto zmluvy. Objednávateľ sa zaväzuje riadne zhotovené dielo '
              + 'prevziať a zaplatiť Zhotoviteľovi dohodnutú odmenu v súlade s podmienkami tejto '
              + 'zmluvy a príslušných objednávok.',
            de: 'Der Auftragnehmer verpflichtet sich hiermit, für den Auftraggeber das Werk '
              + 'auszuführen, das im Text dieses Vertrags bzw. in den einzelnen Bestellungen, die '
              + 'einen untrennbaren Bestandteil dieses Vertrags bilden, näher spezifiziert ist. Der '
              + 'Auftraggeber verpflichtet sich, das ordnungsgemäß ausgeführte Werk abzunehmen und '
              + 'dem Auftragnehmer die vereinbarte Vergütung gemäß den Bedingungen dieses Vertrags '
              + 'und der entsprechenden Bestellungen zu zahlen.',
          },
          {
            sk: 'Zhotoviteľ vyhlásil, že vykoná dielo v súlade s parametrami a špecifikáciou '
              + 'definovanou v písomnej Objednávke.',
            de: 'Der Auftragnehmer erklärt, dass er das Werk gemäß den in der schriftlichen '
              + 'Bestellung definierten Parametern und Spezifikationen ausführen wird.',
          },
          {
            sk: `Objednávateľ je povinný predložiť Objednávku Zhotoviteľovi najmenej `
              + `${s.objednavka_dni} pracovných dní pred požadovaným dňom začatia realizácie prác. `
              + `Ak bude Objednávka predložená v kratšej lehote, platí, že Zhotoviteľ je povinný `
              + `nastúpiť na realizáciu diela najskôr v ${porSk(s.objednavka_dni)} pracovný deň `
              + `nasledujúci po dni riadneho doručenia Objednávky.`,
            de: `Der Auftraggeber ist verpflichtet, dem Auftragnehmer die Bestellung mindestens `
              + `${s.objednavka_dni} Werktage vor dem gewünschten Beginn der Arbeiten vorzulegen. `
              + `Wird die Bestellung innerhalb einer kürzeren Frist vorgelegt, gilt, dass der `
              + `Auftragnehmer verpflichtet ist, frühestens am ${porDe(s.objednavka_dni)} Werktag `
              + `nach dem Tag der ordnungsgemäßen Zustellung der Bestellung mit der Ausführung der `
              + `Arbeiten zu beginnen.`,
          },
          {
            sk: 'Každá Objednávka musí obsahovať minimálne nasledujúce údaje:',
            de: 'Jeder Auftrag muss mindestens folgende Angaben enthalten:',
            list_sk: [
              'detailnú špecifikáciu diela (rozsah prác, potrebný počet pracovníkov a kvalitatívne požiadavky),',
              'presné určenie miesta zhotovovania diela,',
              'harmonogram prác (termín začatia a predpokladaný termín ukončenia).',
            ],
            list_de: [
              'eine detaillierte Beschreibung des Werks (Arbeitsumfang, erforderliche Anzahl an Mitarbeitern und Qualitätsanforderungen),',
              'die genaue Angabe des Ortes der Ausführung des Werks,',
              'einen Arbeitsplan (Beginn und voraussichtlicher Abschluss).',
            ],
          },
        ],
      },
      {
        rim: 'III.', sk: 'Odmena a platobné podmienky', de: 'Vergütung und Zahlungsbedingungen',
        body: [
          {
            sk: 'Zmluvné strany sa dohodli na odmene za vykonanie diela vo výške sadzby stanovenej '
              + 'v konkrétnej Objednávke.',
            de: 'Die Vertragsparteien haben sich auf die Vergütung für die Ausführung des Werks in '
              + 'Höhe des in der jeweiligen Bestellung festgelegten Satzes geeinigt.',
          },
          {
            sk: `Zhotoviteľ bude odmenu fakturovať v ${s.fakturacia_dni}-dňových intervaloch na `
              + `základe skutočne odpracovaného času a vykonaných prác. Splatnosť faktúr je stanovená `
              + `na ${s.splatnost_dni} kalendárnych dní odo dňa ich vystavenia.`,
            de: `Der Auftragnehmer stellt die Vergütung in ${s.fakturacia_dni}-Tages-Intervallen auf `
              + `der Grundlage der tatsächlich geleisteten Arbeitszeit und der ausgeführten Arbeiten `
              + `in Rechnung. Die Fälligkeit der Rechnungen beträgt ${s.splatnost_dni} Kalendertage `
              + `ab dem Ausstellungsdatum.`,
          },
          {
            sk: 'Podkladom pre vystavenie faktúry je výkaz vykonaných prác a odpracovaných hodín '
              + '(ďalej len „Výkaz"), ktorý musí byť schválený a potvrdený povereným zástupcom '
              + 'Objednávateľa v súlade s Článkom IV. tejto zmluvy.',
            de: 'Grundlage für die Rechnungsstellung ist die Aufstellung der erbrachten Leistungen '
              + 'und der geleisteten Arbeitsstunden (im Folgenden „Aufstellung"), die von einem '
              + 'bevollmächtigten Vertreter des Auftraggebers gemäß Artikel IV dieses Vertrags '
              + 'genehmigt und bestätigt werden muss.',
          },
          {
            sk: `V prípade omeškania Objednávateľa s úhradou splatnej faktúry vzniká Zhotoviteľovi `
              + `nárok na zmluvnú pokutu vo výške ${pct(s.urok_omeskanie_pct)} % z dlžnej sumy za `
              + `každý, aj začatý deň omeškania.`,
            de: `Bei Zahlungsverzug des Auftraggebers mit der Begleichung einer fälligen Rechnung `
              + `hat der Auftragnehmer Anspruch auf eine Vertragsstrafe in Höhe von `
              + `${pct(s.urok_omeskanie_pct)} % des geschuldeten Betrags für jeden, auch angefangenen `
              + `Tag des Verzugs.`,
          },
          {
            sk: 'Záväzok Objednávateľa zaplatiť odmenu sa považuje za splnený v deň, kedy bola celá '
              + 'fakturovaná suma pripísaná na bankový účet Zhotoviteľa.',
            de: 'Die Verpflichtung des Auftraggebers zur Zahlung der Vergütung gilt als erfüllt an '
              + 'dem Tag, an dem der gesamte Rechnungsbetrag auf dem Bankkonto des Auftragnehmers '
              + 'gutgeschrieben wurde.',
          },
        ],
      },
      {
        rim: 'IV.', sk: 'Realizácia a odovzdanie diela', de: 'Ausführung und Übergabe des Werks',
        body: [
          {
            sk: 'Zhotoviteľ zabezpečí realizáciu prác prostredníctvom odborne spôsobilých osôb, '
              + 'pričom je oprávnený použiť vlastných zamestnancov alebo subdodávateľov.',
            de: 'Der Auftragnehmer sorgt für die Ausführung der Arbeiten durch fachlich '
              + 'qualifizierte Personen und ist dabei berechtigt, eigene Mitarbeiter oder '
              + 'Subunternehmer einzusetzen.',
          },
          {
            sk: 'Zhotoviteľ vykonáva dielo na vlastné náklady a na vlastné nebezpečenstvo, pričom je '
              + 'povinný dodržať časové rámce dohodnuté v zmluve a objednávkach.',
            de: 'Der Auftragnehmer führt die Arbeiten auf eigene Kosten und auf eigenes Risiko aus '
              + 'und ist dabei verpflichtet, die im Vertrag und in den Bestellungen vereinbarten '
              + 'Fristen einzuhalten.',
          },
          {
            sk: 'Objednávateľ sa zaväzuje poskytnúť na mieste výkonu prác všetok potrebný materiál, '
              + 'stroje a prístrojové vybavenie nevyhnutné pre riadny priebeh prác.',
            de: 'Der Auftraggeber verpflichtet sich, am Ort der Leistungserbringung alle '
              + 'erforderlichen Materialien, Maschinen und Geräte bereitzustellen, die für den '
              + 'ordnungsgemäßen Ablauf der Arbeiten notwendig sind.',
          },
          {
            sk: 'Objednávateľ je povinný pravidelne (minimálne raz týždenne) písomne potvrdzovať '
              + 'Výkazy predložené pracovníkmi alebo subdodávateľmi Zhotoviteľa. Podpísaný Výkaz '
              + 'predstavuje potvrdenie o riadnom plnení a slúži ako výhradný podklad pre '
              + 'fakturáciu.',
            de: 'Der Auftraggeber ist verpflichtet, die von den Mitarbeitern oder Subunternehmern '
              + 'des Auftragnehmers vorgelegten Aufstellungen regelmäßig (mindestens einmal '
              + 'wöchentlich) schriftlich zu bestätigen. Die unterzeichnete Aufstellung stellt eine '
              + 'Bestätigung der ordnungsgemäßen Erfüllung dar und dient als alleinige Grundlage für '
              + 'die Rechnungsstellung.',
          },
          {
            sk: `Ak Objednávateľ odmietne Výkaz podpísať, je povinný o dôvodoch odmietnutia písomne `
              + `informovať Zhotoviteľa (e-mailom, SMS alebo poštou) do ${s.vykaz_namietka_dni} `
              + `pracovných dní, pričom v rovnakej lehote predloží dôkazy o namietaných vadách `
              + `(napr. fotodokumentáciu). Ak tak neurobí, dielo sa považuje za riadne vykonané `
              + `a Výkaz za schválený. V takom prípade je Zhotoviteľ oprávnený fakturovať aj na `
              + `základe nepodpísaného Výkazu.`,
            de: `Verweigert der Auftraggeber die Unterzeichnung des Aufstellungsscheins, ist er `
              + `verpflichtet, den Auftragnehmer innerhalb von ${s.vykaz_namietka_dni} Werktagen `
              + `schriftlich (per E-Mail, SMS oder Post) über die Gründe für die Verweigerung zu `
              + `informieren und innerhalb derselben Frist Nachweise für die beanstandeten Mängel `
              + `(z. B. Fotodokumentation) vorzulegen. Tut er dies nicht, gilt das Werk als `
              + `ordnungsgemäß ausgeführt und die Aufstellung als genehmigt. In diesem Fall ist der `
              + `Auftragnehmer berechtigt, auch auf der Grundlage der nicht unterzeichneten `
              + `Aufstellung eine Rechnung zu stellen.`,
          },
          {
            sk: 'Výkaz sa zároveň považuje za doklad o odovzdaní a prevzatí diela (resp. jeho časti).',
            de: 'Die Aufstellung gilt gleichzeitig als Nachweis für die Übergabe und Abnahme des '
              + 'Werks (bzw. eines Teils davon).',
          },
        ],
      },
      {
        rim: 'V.', sk: 'Práva a povinnosti zmluvných strán', de: 'Rechte und Pflichten der Vertragsparteien',
        body: [
          {
            sk: 'Zhotoviteľ je povinný realizovať dielo s odbornou starostlivosťou, v dohodnutom '
              + 'rozsahu a kvalite. Povinnosť nastúpiť na výkon prác je viazaná na termín '
              + 'v objednávke pri rešpektovaní lehoty podľa Čl. II bod 3. O akýchkoľvek prekážkach '
              + 'brániacich nástupu je Zhotoviteľ povinný Objednávateľa ihneď upovedomiť.',
            de: 'Der Auftragnehmer ist verpflichtet, die Arbeiten mit der gebotenen Sorgfalt, im '
              + 'vereinbarten Umfang und in der vereinbarten Qualität auszuführen. Die Verpflichtung '
              + 'zur Aufnahme der Arbeiten ist an den in der Bestellung genannten Termin gebunden, '
              + 'wobei die Frist gemäß Art. II Punkt 3 einzuhalten ist. Über etwaige Hindernisse, '
              + 'die der Aufnahme der Arbeiten entgegenstehen, ist der Auftragnehmer verpflichtet, '
              + 'den Auftraggeber unverzüglich zu informieren.',
          },
          {
            sk: 'Pri výkone činnosti Zhotoviteľ dodržiava platné právne predpisy, technické normy '
              + 'a dohodnuté podmienky, pričom dbá na udržiavanie čistoty na pracovisku.',
            de: 'Bei der Ausführung der Arbeiten hält der Auftragnehmer die geltenden '
              + 'Rechtsvorschriften, technischen Normen und vereinbarten Bedingungen ein und achtet '
              + 'dabei auf die Sauberkeit am Arbeitsplatz.',
          },
          {
            sk: 'Zhotoviteľ zodpovedá za dodržiavanie predpisov BOZP, PO a ochrany životného '
              + 'prostredia, ako aj interných bezpečnostných smerníc pracoviska, s ktorými bol '
              + 'preukázateľne oboznámený.',
            de: 'Der Auftragnehmer ist für die Einhaltung der Vorschriften zu Arbeitssicherheit, '
              + 'Brandschutz und Umweltschutz sowie der internen Sicherheitsrichtlinien des Betriebs '
              + 'verantwortlich, mit denen er nachweislich vertraut gemacht wurde.',
          },
          {
            sk: 'Objednávateľ preberá záväzok poskytnúť Zhotoviteľovi všetku súčinnosť potrebnú na '
              + 'riadnu realizáciu diela. V prípade zistenia postupu Zhotoviteľa, ktorý je v rozpore '
              + 's jeho zmluvnými povinnosťami, prináleží Objednávateľovi právo bezodkladne uplatniť '
              + 'nárok na nápravu. Zistené vady a nedostatky je Objednávateľ povinný notifikovať '
              + 'Zhotoviteľovi písomne, doložiť ich fotodokumentáciou a súčasne udeliť Zhotoviteľovi '
              + 'záväzné pokyny a technické inštrukcie smerujúce k riadnemu zhotoveniu diela '
              + 'a eliminácii vád vzniknutých nesprávnym postupom.',
            de: 'Der Auftraggeber verpflichtet sich, dem Auftragnehmer jede für die '
              + 'ordnungsgemäße Ausführung des Werkes erforderliche Mitwirkung zu gewähren. Stellt '
              + 'der Auftraggeber fest, dass der Auftragnehmer in einer Weise vorgeht, die seinen '
              + 'vertraglichen Verpflichtungen widerspricht, ist er berechtigt, unverzüglich '
              + 'Abhilfe zu verlangen. Der Auftraggeber ist verpflichtet, festgestellte Mängel und '
              + 'Unzulänglichkeiten dem Auftragnehmer schriftlich mitzuteilen, diese durch '
              + 'Fotodokumentation zu belegen und dem Auftragnehmer gleichzeitig verbindliche '
              + 'Anweisungen und technische Hinweise zu erteilen, die auf die ordnungsgemäße '
              + 'Ausführung des Werkes und die Beseitigung der durch unsachgemäße Vorgehensweise '
              + 'entstandenen Mängel abzielen.',
          },
          {
            sk: 'Ak Zhotoviteľ zistí prekážky (v materiáli alebo na mieste výkonu), ktoré bránia '
              + 'riadnemu pokračovaniu prác, bezodkladne to oznámi Objednávateľovi. Ak Objednávateľ '
              + 'prekážky neodstráni a Zhotoviteľ nemôže v prácach pokračovať, má Zhotoviteľ nárok na '
              + 'zmluvnú pokutu vo výške {{PRESTOJ_SK}} za každú osobu a každý deň prestojov.',
            de: 'Stellt der Auftragnehmer Hindernisse (im Material oder am Ausführungsort) fest, '
              + 'die die ordnungsgemäße Fortsetzung der Arbeiten verhindern, teilt er dies dem '
              + 'Auftraggeber unverzüglich mit. Beseitigt der Auftraggeber die Hindernisse nicht und '
              + 'kann der Auftragnehmer die Arbeiten nicht fortsetzen, hat der Auftragnehmer Anspruch '
              + 'auf eine Vertragsstrafe in Höhe von {{PRESTOJ_DE}} pro Person und jeden Tag des '
              + 'Stillstands.',
          },
          {
            sk: 'V prípade omeškania Objednávateľa s akoukoľvek platbou je Zhotoviteľ oprávnený '
              + 'pozastaviť realizáciu diela až do momentu úplného vyrovnania všetkých splatných '
              + 'záväzkov. O dobu tohto prerušenia sa automaticky predlžujú všetky termíny plnenia. '
              + 'Objednávateľ zároveň v plnom rozsahu zodpovedá za škody a sankcie, ktoré '
              + 'Zhotoviteľovi v dôsledku takéhoto prerušenia vzniknú voči zmluvným partnerom '
              + 'Objednávateľa či tretím stranám.',
            de: 'Bei Zahlungsverzug des Auftraggebers ist der Auftragnehmer berechtigt, die '
              + 'Ausführung des Werkes bis zur vollständigen Begleichung aller fälligen '
              + 'Verbindlichkeiten auszusetzen. Alle Leistungsfristen verlängern sich automatisch um '
              + 'die Dauer dieser Unterbrechung. Der Auftraggeber haftet zudem in vollem Umfang für '
              + 'Schäden und Sanktionen, die dem Auftragnehmer infolge einer solchen Unterbrechung '
              + 'gegenüber den Vertragspartnern des Auftraggebers oder Dritten entstehen.',
          },
        ],
      },
      {
        rim: 'VI.', sk: 'Doba trvania a ukončenie zmluvy', de: 'Laufzeit und Beendigung des Vertrags',
        body: [
          {
            sk: 'Zmluva nadobúda platnosť a účinnosť dňom jej podpisu oboma zmluvnými stranami.',
            de: 'Der Vertrag tritt am Tag seiner Unterzeichnung durch beide Vertragsparteien in '
              + 'Kraft und wird wirksam.',
          },
          {
            sk: 'Zmluvný vzťah zaniká dohodou strán, uplynutím doby, na ktorú bol dohodnutý, alebo '
              + 'splnením diela.',
            de: 'Das Vertragsverhältnis erlischt durch Vereinbarung der Parteien, durch Ablauf der '
              + 'vereinbarten Laufzeit oder durch Erfüllung des Werks.',
          },
          {
            sk: `Objednávateľ je oprávnený zmluvu vypovedať aj bez uvedenia dôvodu `
              + `v ${s.vypoved_dni}-dňovej výpovednej lehote, ktorá začína plynúť dňom nasledujúcim `
              + `po odoslaní výpovede. Výpoveď musí byť zaslaná e-mailom.`,
            de: `Der Auftraggeber ist berechtigt, den Vertrag auch ohne Angabe von Gründen mit `
              + `einer Kündigungsfrist von ${s.vypoved_dni} Tagen zu kündigen, die am Tag nach dem `
              + `Versand der Kündigung beginnt. Die Kündigung muss per E-Mail versandt werden.`,
          },
          {
            sk: `Zhotoviteľ je oprávnený zmluvu vypovedať aj bez uvedenia dôvodu `
              + `v ${s.vypoved_dni}-dňovej výpovednej lehote, ktorá začína plynúť dňom nasledujúcim `
              + `po odoslaní výpovede. Výpoveď musí byť zaslaná e-mailom.`,
            de: `Der Auftragnehmer ist berechtigt, den Vertrag auch ohne Angabe von Gründen mit `
              + `einer Kündigungsfrist von ${s.vypoved_dni} Tagen zu kündigen, die am Tag nach dem `
              + `Versand der Kündigung beginnt. Die Kündigung muss per E-Mail versandt werden.`,
          },
          {
            sk: `Zhotoviteľ má právo od zmluvy odstúpiť s okamžitým účinkom, ak je Objednávateľ `
              + `v omeškaní s úhradou platby viac ako ${s.odstupenie_omeskanie_dni} dní a nápravu `
              + `nezjednal ani po dodatočnej výzve.`,
            de: `Der Auftragnehmer hat das Recht, mit sofortiger Wirkung vom Vertrag `
              + `zurückzutreten, wenn der Auftraggeber mit der Zahlung mehr als `
              + `${s.odstupenie_omeskanie_dni} Tage im Verzug ist und auch nach einer zusätzlichen `
              + `Mahnung keine Abhilfe geschaffen hat.`,
          },
        ],
      },
      {
        rim: 'VII.', sk: 'Rozhodné právo a súdna príslušnosť', de: 'Anwendbares Recht und Gerichtsstand',
        body: [
          {
            sk: 'V zmysle Článku 3 Nariadenia Európskeho parlamentu a Rady (ES) č. 593/2008 '
              + 'o rozhodnom práve pre zmluvné záväzky si zmluvné strany volia za rozhodné právo '
              + 'právny poriadok Slovenskej republiky. Tomuto právnemu poriadku podliehajú všetky '
              + 'právne vzťahy, povinnosti a nároky, ktoré vzniknú na základe tejto zmluvy alebo '
              + 'v súvislosti s ňou.',
            de: 'Gemäß Artikel 3 der Verordnung (EG) Nr. 593/2008 des Europäischen Parlaments und '
              + 'des Rates über das auf vertragliche Schuldverhältnisse anzuwendende Recht wählen die '
              + 'Vertragsparteien das Recht der Slowakischen Republik als anwendbares Recht. Dieser '
              + 'Rechtsordnung unterliegen alle Rechtsbeziehungen, Pflichten und Ansprüche, die sich '
              + 'aus diesem Vertrag oder im Zusammenhang mit ihm ergeben.',
          },
          {
            sk: 'V zmysle Článku 25 Nariadenia Európskeho parlamentu a Rady (EÚ) č. 1215/2012 '
              + 'o právomoci a o uznávaní a výkone rozsudkov v občianskych a obchodných veciach sa '
              + 'zmluvné strany dohodli na právomoci súdov Slovenskej republiky pre všetky spory '
              + 'vyplývajúce z tejto zmluvy.',
            de: 'Im Sinne von Artikel 25 der Verordnung (EU) Nr. 1215/2012 des Europäischen '
              + 'Parlaments und des Rates über die gerichtliche Zuständigkeit und die Anerkennung '
              + 'und Vollstreckung von Entscheidungen in Zivil- und Handelssachen vereinbaren die '
              + 'Vertragsparteien die Zuständigkeit der Gerichte der Slowakischen Republik für alle '
              + 'Streitigkeiten, die sich aus diesem Vertrag ergeben.',
          },
        ],
      },
      {
        rim: 'VIII.', sk: 'Spoločné a záverečné ustanovenia', de: 'Allgemeine und Schlussbestimmungen',
        body: [
          {
            sk: `Zmluvné strany sa dohodli, že pre písomný styk platí lehota doručenia `
              + `${s.dorucenie_dni} kalendárnych dní od uloženia zásielky na pošte. Táto lehota platí `
              + `aj pri neúspešnom doručení z dôvodu neprevzatia, nedoručiteľnosti alebo odmietnutia `
              + `zásielky adresátom. Pre úkony smerujúce k zmene alebo ukončeniu zmluvy sa vyžaduje `
              + `doručenie poštou. Pri ostatnej korešpondencii doručovanej elektronickými `
              + `prostriedkami (e-mail, whatsapp) nastávajú účinky doručenia dňom odoslania takejto `
              + `správy.`,
            de: `Die Vertragsparteien haben vereinbart, dass für den Schriftverkehr eine `
              + `Zustellungsfrist von ${s.dorucenie_dni} Kalendertagen ab Einlieferung der Sendung bei `
              + `der Post gilt. Diese Frist gilt auch bei erfolgloser Zustellung aufgrund von `
              + `Nichtannahme, Unzustellbarkeit oder Verweigerung der Annahme durch den Empfänger. Für `
              + `Handlungen, die auf eine Änderung oder Beendigung des Vertrags abzielen, ist die `
              + `Zustellung per Post erforderlich. Bei sonstiger Korrespondenz, die auf elektronischem `
              + `Wege (E-Mail, WhatsApp) übermittelt wird, tritt die Zustellung am Tag des Versands `
              + `einer solchen Nachricht in Kraft.`,
          },
          {
            sk: 'Zmluva je vyhotovená v dvoch rovnopisoch, po jednom pre každú stranu.',
            de: 'Der Vertrag wird in zwei Ausfertigungen erstellt, eine für jede Partei.',
          },
          {
            sk: 'Zmluvné strany potvrdzujú, že sa s textom tejto zmluvy podrobne oboznámili a s jej '
              + 'obsahom súhlasia. Zmluva bola vypracovaná a uzatvorená podľa ich pravej, slobodnej '
              + 'a vážnej vôle, s určitosťou a zrozumiteľnosťou, pričom k jej podpisu nepristupujú '
              + 'v tiesni ani za nápadne nevýhodných podmienok, čo potvrdzujú svojimi vlastnoručnými '
              + 'podpismi.',
            de: 'Die Vertragsparteien bestätigen, dass sie den Wortlaut dieses Vertrags eingehend '
              + 'zur Kenntnis genommen haben und mit seinem Inhalt einverstanden sind. Der Vertrag '
              + 'wurde nach ihrem echten, freien und ernsthaften Willen, mit Bestimmtheit und '
              + 'Verständlichkeit ausgearbeitet und geschlossen, wobei sie ihn weder unter Zwang '
              + 'noch unter offensichtlich nachteiligen Bedingungen unterzeichnen, was sie mit ihren '
              + 'eigenhändigen Unterschriften bestätigen.',
          },
        ],
      },
    ];
  }

  /** Značka chýbajúceho údaja — na papieri má byť vidieť, že tam niečo chýba. */
  const CHYBA_SK = '……… €';
  const CHYBA_DE = '……… €';

  /**
   * Zmluva pripravená na vykreslenie.
   *
   * @param {Object} o
   *   supplier  naše fakturačné údaje z Nastavení
   *   client    odberateľ (danubra_partners)
   *   rules     oddiel `framework_de` z Nastavení — prepisuje `SUMY`
   *   signedAt  deň podpisu
   *   number    číslo zmluvy
   */
  function build({ supplier = {}, client = {}, rules = {}, signedAt, number } = {}) {
    const s = { ...SUMY };
    for (const k of Object.keys(SUMY)) {
      const v = Number(rules[k]);
      if (Number.isFinite(v) && v > 0) s[k] = v;
    }
    const prestojSk = eur(s.prestoj_pokuta) || CHYBA_SK;
    const prestojDe = eurDe(s.prestoj_pokuta) || CHYBA_DE;

    return {
      number: number || '',
      signedAt: String(signedAt || new Date().toISOString().slice(0, 10)).slice(0, 10),
      sumy: s,
      supplier, client,
      prestojChyba: !eur(s.prestoj_pokuta),
      clanky: clanky({ s }).map(c => ({
        ...c,
        body: c.body.map(p => ({
          ...p,
          sk: p.sk.replace('{{PRESTOJ_SK}}', prestojSk),
          de: p.de.replace('{{PRESTOJ_DE}}', prestojDe),
        })),
      })),
    };
  }

  /**
   * Čo chýba pred podpisom. Nemecký odberateľ bez USt-IdNr znamená, že sa mu
   * nedá fakturovať v reverse charge podľa §13b — a daň zaplatíme my.
   */
  const POVINNE = [
    { key: 'name', kto: 'supplier', title: 'názov našej firmy' },
    { key: 'address', kto: 'supplier', title: 'našu adresu' },
    { key: 'company_id', kto: 'supplier', title: 'naše IČO' },
    { key: 'register', kto: 'supplier', title: 'náš zápis v obchodnom registri' },
    { key: 'iban', kto: 'supplier', title: 'náš IBAN' },
    { key: 'vat_id', kto: 'supplier', title: 'naše IČ DPH' },
    { key: 'tax_number_de', kto: 'supplier', title: 'našu Steuernummer' },
    { key: 'name', kto: 'client', title: 'názov odberateľa' },
    { key: 'address', kto: 'client', title: 'adresu odberateľa' },
    { key: 'ust_idnr', kto: 'client', title: 'USt-IdNr odberateľa' },
  ];

  function missing({ supplier = {}, client = {} } = {}) {
    const zdroj = { supplier, client };
    return POVINNE.filter(f => {
      const v = zdroj[f.kto][f.key];
      return v === null || v === undefined || String(v).trim() === '';
    });
  }

  const API = { SUMY, POVINNE, CHYBA_SK, clanky, build, missing };
  if (typeof window !== 'undefined') window.DanubraFrameworkDe = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
