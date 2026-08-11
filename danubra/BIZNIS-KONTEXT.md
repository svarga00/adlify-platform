# DANUBRA — biznis kontext pre vývoj

Zhrnutie toho, čo aplikácia obsluhuje a prečo je postavená tak, ako je.
Slúži ako pamäť projektu — pri ďalších úpravách sa treba držať týchto pravidiel.

## Dve fázy, dva biznisy

**Fáza 1 — sprostredkovanie ubytovania** (beží od začiatku, cash-flow neutrálne).
Firmám a partiám zo SR a HU zháňame ubytovanie v Nemecku. Príjem je
sprostredkovateľský poplatok plus voliteľná priebežná služba 1–2 €/os./deň.

**Fáza 2 — subdodávky do Nemecka** (štart do 6–10 týždňov).
Vysielame vlastných zamestnancov ako Werkvertrag nemeckým odberateľom.
Príjem je marža medzi fakturačnou sadzbou a nákladom na pracovníka.

Sú to oddelené biznisy s odlišnými klientmi — preto vlastné tabuľky
(`danubra_clients` vs. `danubra_partners`) a oddelené sekcie v navigácii,
ale spoločné prihlásenie, nastavenia, faktúry a komunikačné záznamy.

## Čo firmu môže položiť

Podľa plánu nie dopyt, ale tieto dve veci:

**Likvidita.** Mzdy a diéty sa platia mesačne dopredu, nemecké faktúry sa
inkasujú 30–60 dní. Pri 15 ľuďoch treba preklenúť 60–90 tisíc eur. Preto má
dashboard cash-flow panel s dobou inkasa a prahom, nad ktorým sa nemá škálovať
bez faktoringu.

**Compliance.** Skrytá Arbeitnehmerüberlassung, chýbajúca §48b alebo neohlásený
Zoll dokážu položiť inak zdravú zákazku. Preto je compliance vlastné výpočtové
jadro s tvrdými blokátormi — zákazku nemožno spustiť, kým nie sú splnené.

## Kľúčové čísla (stav 2026)

| Položka | Hodnota |
|---|---|
| Odvody zamestnávateľa SR | 36,2 % hrubej mzdy |
| Diéty Nemecko | 45 €/deň pri pobyte nad 12 h |
| SOKA-BAU (ULAK, západ) | 14,7 % hrubej od 1. 7. 2026 |
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

Rozhoduje skutočný výkon prác, nie znenie zmluvy. Riziko rastie, keď pokyny
dáva priamo odberateľ, chýba náš predák, pracuje sa výhradne s cudzím náradím,
dovolenky sa hlásia odberateľovi, naši ľudia nosia menovky odberateľa alebo sú
zaradení v jeho štruktúre. Aplikácia má na to interaktívny test.

## Nábor je hlavný biznis, nie doplnok

Vysielanie ľudí na stavby je od augusta 2026 **primárna agenda** — prepínač
oblastí ju má prvú a aplikácia sa v nej otvára. Ubytovanie ju dopĺňa (vlastné
ubytovanie znižuje náklad na vyslaného človeka a je najsilnejší argument
v inzeráte), nie naopak.

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

Skóre je vážený podiel z maxima za zodpovedané otázky. Dve pravidlá sú tvrdé:
- **právne varovanie = zamietnutie** bez ohľadu na skóre (bez A1 alebo živnosti
  sa nedá nasadiť, aj keby remeslo vedel dokonale),
- **nedokončený skríning nie je zlý skríning** — pri pokrytí pod polovicu sa
  nevynáša verdikt, aby sa nezamietali ľudia, ktorých sme sa nedopýtali.

## Deľba práce

Michaela komunikuje s nemeckými odberateľmi po nemecky, Štefan rieši operatívu,
nábor a koordináciu na SK/HU. Preto sú dokumenty pre odberateľov v nemčine
a rozhranie po slovensky.
