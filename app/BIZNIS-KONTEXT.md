# DANUBRA — biznis kontext pre vývoj

Zhrnutie toho, čo aplikácia obsluhuje a prečo je postavená tak, ako je.
Slúži ako pamäť projektu — pri ďalších úpravách sa treba držať týchto pravidiel.

## Dve fázy, dva biznisy

**Fáza 1 — sprostredkovanie ubytovania** (beží od začiatku, cash-flow neutrálne).
Firmám a partiám zo SR a HU zháňame ubytovanie v Nemecku. Príjem je
sprostredkovateľský poplatok plus voliteľná priebežná služba 1–2 €/os./deň.

**Fáza 2 — subdodávky do Nemecka** (primárna agenda).
Nemeckému odberateľovi zhotovujeme dielo (Rahmenvertrag + Bestellung SK_DE)
prostredníctvom **slovenských živnostníkov** — samostatne zárobkovo činných
osôb, s ktorými máme rámcovú zmluvu o dielo podľa Obchodného zákonníka.
**Nevysielame vlastných zamestnancov.** Živnostník má vlastné A1 (ako SZČO),
vlastnú Freistellung (§48b) a nám fakturuje sám. Príjem je marža medzi
hodinovou sadzbou odberateľovi a hodinovou sadzbou živnostníka.

Sú to oddelené biznisy s odlišnými klientmi — preto vlastné tabuľky
(`danubra_clients` vs. `danubra_partners`) a oddelené sekcie v navigácii,
ale spoločné prihlásenie, nastavenia, faktúry a komunikačné záznamy.

## Čo firmu môže položiť

Podľa plánu nie dopyt, ale tieto dve veci:

**Likvidita.** Odberateľovi fakturujeme **týždenne po kalendárnych týždňoch
(KW)** so splatnosťou 7 dní (Rahmenvertrag 7/7; niektorí odberatelia 14/14),
živnostník nám fakturuje **za 2 KW** so splatnosťou **14 dní od doručenia**.
Keď odberateľ mešká, medzera rastie s každým človekom na stavbe. Preto má
dashboard cash-flow panel s dobou inkasa a prahom, nad ktorým sa nemá škálovať
bez faktoringu. Rámcová zmluva so živnostníkom dovoľuje predĺžiť jeho
splatnosť, kým nezaplatí odberateľ (čl. V bod 8, najviac 3 mesiace).

**Compliance.** Skrytá Arbeitnehmerüberlassung, chýbajúca §48b alebo neohlásený
Zoll dokážu položiť inak zdravú zákazku. Preto je compliance vlastné výpočtové
jadro s tvrdými blokátormi — zákazku nemožno spustiť, kým nie sú splnené.

## Model zmlúv a fakturácie (podľa šablón firmy na Google Drive)

Šablóny sú v Drive „01 - PUNDS - MAIN" (04 Zmluvy EÚ, 05 Subdodávatelia,
vzor faktúry V1.3). Appka ich generuje doslovne; sumy a lehoty sú
v Nastaveniach.

**Odberateľ (Nemecko):**
1. **Rahmenvertrag SK_DE** — dvojjazyčná rámcová zmluva o dielo, **bez čísla**;
   objednávka 5 pracovných dní vopred, fakturácia v 7-dňových intervaloch,
   splatnosť 7 dní od vystavenia, výpoveď 7 dní, slovenské právo a súdy.
2. **Bestellung SK_DE „Nr. N"** — číslovaná v rade odberateľa; činnosť,
   sadzba €/h, počet pracovníkov, rozsah „X–Y h / týždeň / osoba", termín
   (spravidla do 31.12.), miesto, osobitné dojednania.
3. **Stundennachweis** týždenne, podpisuje majster/stavbyvedúci → podklad
   k faktúre za KW.

**Živnostník:**
1. **GDPR súhlas** → **Rámcová zmluva o dielo RRRR-NNN** (do 31.12.; pokuty
   300 €/deň omeškania, 3 000 € nenastúpenie; čl. X bod 6 písm. a) až i)
   okamžité odstúpenie) → **Objednávka č. N** (číslovaná v rade živnostníka;
   jedna činnosť zo Zoznamu činností, odplata €/h, deň skončenia 31.12.,
   miesta výkonu vrátane adresy v SR a „celé územie Nemeckej / Slovenskej
   republiky") → **Stavby** (zoznam miest výkonu k dátumu) → A1 (ako SZČO)
   a Freistellung.
2. **Faktúra živnostníka** za 2 KW podľa **vzoru V1.3** (verzia A neplatiteľ,
   B platiteľ DPH; text o §16 / §13b; KW s dátumami; adresa stavby; činnosť
   z objednávky; ŽR; SWIFT; odpočet ubytovania a zálohy; posiela sa na e-mail
   na faktúry z Nastavení). Splatnosť 14 dní od doručenia.
   **Možnosť:** faktúru vyhotovíme v jeho mene my (samofakturácia) — rámcová
   zmluva to dovoľuje v čl. V bodoch 10 až 14, zapína sa na karte živnostníka.
3. **Ukončenie Zmluvy o dielo a Objednávky** — list s odkazom na čl. X bod 6
   (typicky 6g „nemá dostatok práce"); pri b) / c) prichádza do úvahy pokuta.

Ubytovanie a dopravu, ktoré živnostníkovi sprostredkujeme, platí on — strhávajú
sa z jeho faktúry (rámcová zmluva čl. VI bod 9).

## Kľúčové čísla (stav 2026)

Odvody, diéty a SOKA-BAU sa týkajú len vlastných zamestnancov — pri
živnostníkoch (dnešný model) sú nulové; appka ich ráta len pri starých
záznamoch zamestnancov.

| Položka | Hodnota |
|---|---|
| Odvody zamestnávateľa SR (len zamestnanci) | 36,2 % hrubej mzdy |
| Diéty Nemecko (len zamestnanci) | 45 €/deň pri pobyte nad 12 h |
| SOKA-BAU (ULAK, západ; len zamestnanci) | 14,7 % hrubej od 1. 7. 2026 |
| Bau-Mindestlohn LG1 | 15,86 €/h |
| Bau-Mindestlohn LG2 | 17,34 €/h od 1. 4. 2026 |
| Všeobecný Mindestlohn | 13,90 €/h od 1. 1. 2026 |
| Bauabzugsteuer bez §48b | 15 % z fakturovanej sumy |
| Minimálna mzda SR | 915 €/mes |
| Fakturačná sadzba subdodávok | 30–45 €/h (zahraničné tímy) |

Modelová marža na pracovníka a mesiac vychádza okolo 1 600 € pri stavbe,
v dielni je vyššia o ušetrenú SOKA-BAU. Pod 1 000 € treba prehodnotiť sadzbu
alebo segment.

## Pravidlá, ktoré sa nesmú porušiť

1. **Adresa a kontakt na ubytovateľa** sa klientovi nezobrazia ani neodošlú,
   kým objednávka nie je aspoň `paid`. V ponuke je len mesto a typ.
2. **Faktúry za priebežnú službu** sa nikdy neodosielajú automaticky — cron
   vytvorí len návrh na schválenie.
3. **`orders.date_to`** sa mení výhradne cez `order_extensions` so záznamom
   pôvodnej hodnoty.
4. **Priebežná služba** sa počíta len z nepozastavených segmentov.
5. **Fakturačný režim** sa určuje z krajiny a IČ DPH klienta, nikdy ručne.
6. **Peniaze** v `numeric`, zaokrúhlenie až na výstupe.
7. **Dátumy** v Europe/Bratislava, crony rátajú s letným časom.
8. **Nahrávanie hovoru** len s výslovným súhlasom oboch strán daným pred
   začiatkom — SR §377 Trestného zákona, DE §201 StGB (bez súhlasu trestné).

## Vstupný segment

Plán odporúča začať **dielenskými a kovoobrábacími prácami**, nie stavbou:
odpadá SOKA-BAU aj Bau-Mindestlohn, jednoduchší Werkvertrag a rýchlejší
cash-flow. Aplikácia to rozlišuje — pri dielni je zoznam požiadaviek výrazne
kratší.

## Signály skrytej ANÜ

Rozhoduje skutočný výkon prác, nie znenie zmluvy. Pri živnostníkoch je to
otázka **Scheinselbständigkeit** aj ANÜ: živnostník má mať vlastné A1 ako
SZČO, vlastnú Freistellung, vlastné náradie a vlastné faktúry podľa výkazu.
Riziko rastie, keď pokyny
dáva priamo odberateľ, chýba náš predák, pracuje sa výhradne s cudzím náradím,
dovolenky sa hlásia odberateľovi, naši ľudia nosia menovky odberateľa alebo sú
zaradení v jeho štruktúre. Aplikácia má na to interaktívny test.

## Nábor je hlavný biznis, nie doplnok

Vysielanie ľudí na stavby je od augusta 2026 **primárna agenda** — prepínač
agend ju má prvú a aplikácia sa v nej otvára. Ubytovanie ju dopĺňa (vlastné
ubytovanie znižuje náklad na vyslaného človeka a je najsilnejší argument
v inzeráte), nie naopak.

Agendy sa volajú **Nábor a stavby** a **Ubytovanie**. V hornej lište je
**mega menu**, ktoré ukáže obe naraz — prepínač totiž vždy schová polovicu
appky a hľadať sa v nej potom nedá. Na mobile mega menu nahrádza bočný panel,
takže v ňom musí byť aj prepínač agend a odhlásenie.

Nábor sa nezačína inzerátom, ale rozhodnutím — preto **náborový plán**
(`danubra_recruitment_plans`) v piatich krokoch: koho a koľko · kam a kedy ·
za koľko · čo si overím · kde to zverejním. Plán sa nedá spustiť, kým
sadzba nie je nad stavebnou minimálnou mzdou a kým nie je jasná marža.

## Ako sa overuje, či človek remeslo naozaj vie

Príručka remesiel (`danubra_trades`) drží pre každé remeslo to, čo musí vedieť
ten, kto naberá: čo sa na stavbe reálne robí, s akým materiálom, aké náradie má
mať vlastné, čo musí doložiť a **reálny denný výkon** ako meradlo na kontrolu
nafúknutých tvrdení.

Otázky (`danubra_screening_questions`) majú päť typov; kľúčový je typ
**`hidden` — overovacia otázka**. Znie ako bežná odborná otázka, kandidát
netuší, že sa ňou preveruje, a odpoveď sa buď dá overiť (meno poliera), alebo
ju z inzerátu nenaučíš (rozteč profilov 625, zelená GKBI, číslo zváracej metódy
na certifikáte). Nové otázky sa majú držať toho istého princípu — konkrétne
číslo alebo názov, ktorý si človek z praxe pamätá.

**Pri živom hovore sa neznámkuje.** Človek zavolá na inzerát a naberá sa hneď —
na hodnotenie dvadsiatich otázok stupnicou tam nie je čas. Preto zaškrtávacie
polia (`danubra_call_chips`): krátke tvrdenia so znamienkom (plus, mínus,
varovanie), jedna obrazovka na segment hovoru a pod tým voľná poznámka.
Skóre vzniká ako pomer dobrých a zlých znamení, nie ako percento zo splnených
otázok — kto sa nestihol opýtať na všetko, nesmie tým byť potrestaný.

Polia sa učia: čo zaškrtávaš často, ide nabudúce hore; vlastné pole si pridáš
počas hovoru; z poznámok ich navrhne Claude, ale **nič sa nepridá samo** —
návrh je neaktívny, kým ho nepotvrdíš. Zoznam polí je to, podľa čoho sa
rozhoduje o ľuďoch, takže doň nesmie pribudnúť nič, čo si nevidel.

Otázky s nápovedami (migrácie 009 a 011) zostávajú ako referencia v príručke —
čo sa pýtať a čo chcem počuť.

Pri vyhodnotení sú dve pravidlá tvrdé:
- **rozhodujúce varovanie zamieta bez ohľadu na skóre** (kto tvrdí, že A1
  netreba, sa nedá nasadiť, aj keby remeslo vedel dokonale),
- **málo zaškrtnutého nie je zlý kandidát** — pod štyri polia sa verdikt
  nevynáša, aby sa nezamietali ľudia, ktorých sme sa nedopýtali.

## Deľba práce

Michaela komunikuje s nemeckými odberateľmi po nemecky, Štefan rieši operatívu,
nábor a koordináciu na SK/HU. Preto sú dokumenty pre odberateľov v nemčine
a rozhranie po slovensky.
