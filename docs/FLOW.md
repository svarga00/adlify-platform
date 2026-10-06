# Ako to celé ide

Od telefonátu po peniaze na účte. Každý krok má svoj záznam a každý záznam
vie, z čoho vznikol — preto sa dá kedykoľvek povedať, prečo je niečo tak,
ako je.

Stav k 5. 10. 2026.

> Toto je napísaná verzia. **Živá je v appke** pod PREHĽAD → „Ako to ide":
> tie isté kroky, ale pri každom je vidieť, koľko tam práve stojí.

---

## Celý reťazec v desiatich krokoch

```
  INZERÁT ──► TELEFONÁT ──► KANDIDÁT ──► ŽIVNOSTNÍK ──┐
                                                       │
  ODBERATEĽ ──► PONUKA ──► ZMLUVA ──► ZÁKAZKA ─────────┤
                                                       ▼
                                                   NASADENIE
                                                       │
                                                       ▼
                        HODINY ──► VÝKAZ ──► OBDOBIE ──┬──► VYDANÁ FAKTÚRA ──► BANKA
                                                       │
                                                       └──► PRIJATÁ FAKTÚRA (kontrola)
```

Dve vetvy — ľudia a zákazky — sa stretnú v **nasadení**. Odtiaľ je to už
jedna cesta a končí na účte.

---

## 1. Odkiaľ prídu ľudia

**Inzerát** (ĽUDIA → Inzeráty) drží kanál, remeslo, mesto, **sľúbenú sadzbu
a body toho, čo sľuboval**, plus presné znenie. Dobehnutý sa vypne, nemaže —
kto sa ozve o mesiac, čítal to staré znenie a musí sa dať dohľadať.

Pri každom je vidieť, koľko ľudí sa ozvalo, koľkým sme sa **stihli ozvať späť**
a koľko nastúpilo. To posledné je jediné číslo, podľa ktorého sa dajú inzeráty
porovnať — počet ľudí závisí od toho, ako dlho bežal.

## 2. Telefonát

Tlačidlo **„Zdvihol som telefón"** na prehľade. Prvá otázka je **na ktorý
inzerát volá** — od nej sa odvíja zvyšok: predvyplní sa remeslo aj mesto
a vpravo je počas celého hovoru vidieť, čo sme sľúbili.

Hovor má šesť častí: Úvod · Remeslo · Overenie · Papiere · Logistika · Peniaze.
V každej sú **zaškrtávacie polia** (čo zaznelo) a **otázky** (na čo sa opýtať,
s tým, čo chcem počuť a pri čom zbystriť). Odpovede sa píšu vlastnými slovami
do poznámky. Pole aj otázku sa dá pridať rovno pri telefóne.

Na konci je skóre a verdikt — a vznikne **kandidát** naviazaný na inzerát.

> Nahrávať hovor sa smie len vtedy, keď s tým **obe strany vopred výslovne
> súhlasia**. Bez toho je to trestné na Slovensku aj v Nemecku. Preto je
> v appke zápis, nie nahrávka.

## 3. Kandidát a živnostník

Kandidát prejde procesom (preverenie → doklady → rozhodnutie) a stane sa
**živnostníkom**. Jeho karta je celý človek na jednej obrazovke:

- **doklady** s platnosťou a skenom (živnostenský, A1, OP) — s náhľadom,
- **odpracované hodiny**,
- **zálohy** — vyrovnajú sa naviazaním na jeho prijatú faktúru,
- **účet**: čo zarobil − čo nám vyfakturoval − zálohy = čo mu dlhujeme,
- **sľuby z hovorov** — čo sme mu povedali a kedy.

**Compliance** povie, či ho smieme nasadiť: A1, remeslo (§9 HwO), Bau-Mindestlohn,
SOKA-BAU. Bez platných dokladov sa nasadiť nedá — **výnimku môže dať len
administrátor a zostane zapísaná**. Drží to databáza, takže to platí aj pre
import a ručné SQL, a posudzuje sa to **k prvému dňu nasadenia**: doklad,
ktorý dnes platí a do nástupu vyprší, neprejde.

Pri nasadení celej partie sa ten, komu doklad chýba, **preskočí a povie sa to
menom** — jeden človek nezhodí celú partiu, ale nesmie tiež tichšie zmiznúť
zo zoznamu.

**Partia** je skupina, ktorá chodí spolu, býva spolu a má jeden výkaz hodín.

## 4. Odberateľ a ponuka

Pri **odberateľovi** rozhodujú dva údaje o tom, ako bude vyzerať faktúra:

| údaj | čo spôsobí |
|---|---|
| platné USt-IdNr. | reverse charge §13b — faktúra bez DPH |
| potvrdenie o oslobodení | bez neho zrazí odberateľ **15 % podľa §48b** |

**Ponuka** ukazuje maržu už pri zadávaní — nie až keď je odoslaná. Dokument
**Angebot** je po nemecky a je na ňom platnosť ponuky aj to, že ide
o živnostníkov s A1 a účtuje sa podľa podpísaného výkazu.

Prijatá ponuka → **zmluva**. Na podpísanej zmluve sa sadzba ani termín
neprepisujú — **mení sa to dodatkom**.

## 5. Zákazka a nasadenie

**Zákazka** je konkrétna stavba: sadzba, termín, mesto, poloha na mape,
ubytovanie. Zmena koncového dátumu = záznam o predĺžení.

**Nasadenie** spája človeka so zákazkou a nesie **obe sadzby** — čo platíme
jemu a čo fakturujeme odberateľovi. Rozdiel je marža a odtiaľ sa berie do
očakávaného zisku.

## 6. Hodiny a výkaz

**Hodiny** sa zapisujú po dňoch. Sadzba sa uloží k záznamu — neskoršia zmena
cenníka staré hodiny neprepočíta.

**Výkaz (Stundennachweis)** je týždenný papier za partiu, po nemecky, na podpis
na stavbe. Na doklade je jedna potvrdzovacia veta, nie dve — dve znenia toho
istého potvrdenia sa dajú pri spore o hodiny spochybniť. Vypĺňa sa priamo v tabuľke a ukladá do tej istej evidencie, z ktorej
vzniká faktúra — nie je to druhé miesto, kde sa píšu hodiny. **Po podpise sa
obsah zmrazí.**

## 7. Obdobie

**Uzavretie obdobia** je ten zlom, kde sa z práce stanú peniaze. Zmrazí hodiny
a vznikne z nich:

- **podklad na vydanú faktúru** odberateľovi,
- **kontrola prijatej faktúry** od živnostníka.

Uzavreté obdobie sa už nemení.

## 8. Faktúry

**Vydaná faktúra** vznikne ako návrh. **Bez schválenia administrátorom sa
nevystaví ani neodošle** — drží to databáza, nie obrazovka, takže to platí aj
pri importe. Až schválením dostane číslo z číselného radu.

Pred schválením je zoznam toho, čo blokuje — a je v ňom rozdiel medzi dvoma
druhmi prekážok. **Rozdiel voči podkladu** sa dá prevziať na seba (niekedy sa
s odberateľom naozaj dohodne iná suma) a vtedy musí byť zapísané prečo.
**Chýbajúci odberateľ, faktúra na nulu, reverse charge bez USt-IdNr ani
neuzavreté obdobie sa výnimkou obísť nedajú** — tam nie je čo prevziať, iba
by vznikol nesprávny doklad. Blokátor to rozlíši a pri každej takej prekážke
povie, čo namiesto nej.

Na samotnom doklade je **rozpis zrážky §48b**: fakturovaná suma, zrážka
a suma na úhradu. Odberateľ prevádza len tú poslednú — bez rozpisu to vyzerá,
že platí menej, než mal. Rovnaká suma je aj v QR kóde. Faktúra pre nemeckého
odberateľa ide **po nemecky**, rovnako ako ponuka a zmluva.

**Prijatá faktúra** od živnostníka sa porovná so schválenými hodinami. Keď
sedí, schváli sa. Keď nesedí, je **sporná** a bez poznámky sa schváliť nedá —
a do marže sa nerátá, kým sa to nedohodne.

**Náklady** (ubytovanie, doprava, náradie) majú príznak, či sa refakturujú.
Refakturovateľné visia v „viazne v nákladoch", kým sa nedostanú na vydanú
faktúru.

## 9. Banka

Výpis sa načíta zo súboru a pohyby sa párujú podľa variabilného symbolu, sumy
a protistrany. Spárovanie označí faktúru za uhradenú. **Čo sa nespáruje,
skresľuje výhľad** — preto to appka pripomína.

## 10. Prehľad

Hore **kompletný cash-flow**: od stavu účtu cez pohyby k zostatku o osem
týždňov, a zvlášť to, čo **nemá termín** (odrobené bez faktúry, refakturovateľné
náklady). Pod tým záložky **Dnes · Peniaze · Práca a ľudia**.

Rozhoduje **najnižší bod**, nie zostatok na konci: účet môže skončiť v pluse
a v treťom týždni byť pod nulou — a výplaty sa odložiť nedajú.

Šesť čísel hore sa dá **otvoriť**: v okne je zoznam záznamov, z ktorých to
číslo je, s hľadaním, zoradením a prekliknutím na záznam. Číslo aj zoznam
počíta ten istý výpočet, takže sa nemôžu rozísť.

Filtrovať sa dá obdobím, odberateľom a zákazkou, plus prepínač **„len čo treba
riešiť"**, ktorý nechá na obrazovke len to, čo nie je v pokoji.

---

## Čo to drží pokope

**Úlohy z pravidiel.** Pravidlo je riadok v tabuľke, nie kus kódu: končí
platnosť dokladu, skončilo obdobie, faktúra je po splatnosti, blíži sa výročie
zmluvy. Úloha vždy vie, koho sa týka, a má na starosti konkrétneho človeka —
**nepriradené je prvé a oranžové**.

Nové pravidlo sa pridá z appky (Úlohy → Pravidlá), nie riadkom v SQL. Tabuľky
aj stĺpce ponúka databáza, takže sa nedá vybrať niečo, čo neexistuje alebo čo
by databáza odmietla. Pred uložením sa dá pravidlo **skúsiť naprázdno**:
appka povie, koľko úloh by dnes vzniklo a ako by vyzerali — a nič nezapíše.

**Zvonček** hovorí, čo sa stalo, kým si sa nepozeral. Úlohy hovoria, čo treba
spraviť. Sú to dve rôzne otázky, preto sú to dve rôzne miesta.

**Správy** sú vlákno pri zázname, ktorého sa týkajú. Interné poznámky fungujú
hneď; **odosielanie čaká na kľúč** a dovtedy správa zostane vo fronte — appka
nikde netvrdí, že odoslala.

**Práva.** Rola je predvoľba, zaškrtávacie polia výnimka na mieru. Tri veci sa
nedajú dať nikomu okrem administrátora: schválenie faktúry, výnimka pri
nasadení a správa používateľov.

**Vysvetlivky.** Pri každom čísle na prehľade, pri každom kroku v mape toku
a pri každej sekcii v moduloch je „?" — čo to je, ako sa to počíta a prečo je
to takto. Pri poliach, kde zlá hodnota niečo pokazí (typ prác, réžia, zádržné,
§48b), je veta priamo pod poľom. Oboje stráži test: chýbajúca vysvetlivka
zhodí `npm test`.

**Infolist na stavbu.** Ku každému nasadeniu sa dá otvoriť jednostranový papier
pre živnostníka: kam prísť, kedy, za kým, adresa ubytovania a kľúče, čo si
priniesť a prečo, ako sa hlásia hodiny, čo robiť pri kontrole alebo úraze —
a nemecké vety na prvý deň. Údaj, ktorý nie je vyplnený, sa na papieri
nevynechá potichu: napíše sa, že chýba.

---

## Kde sa to najčastejšie zasekne

| zasekne sa na | prejaví sa ako | čo s tým |
|---|---|---|
| neuzavreté obdobie | „nezúčtované hodiny" rastú, faktúra nie je z čoho | uzavrieť obdobie na zákazke |
| neschválená faktúra | visí v „čaká na schválenie", peniaze nejdú | schváliť (len administrátor) |
| nespárovaný pohyb v banke | faktúra sa tvári ako neuhradená, výhľad nesedí | spárovať vo výpise |
| prepadnutý A1 | človeka nesmieme nasadiť | vybaviť, alebo výnimka od admina |
| sporná prijatá faktúra | nerátá sa do marže | dohodnúť rozdiel a zapísať |
| refakturovateľný náklad | visí vo „viazne v nákladoch" | dať ho na vydanú faktúru |
| nábor bez bežiaceho inzerátu | nikto sa neozýva a nič nehorí | spustiť inzerát |
| bežiaca zákazka bez ľudí | termín beží, nič z nej nepribúda | nasadiť alebo posunúť termín |
| chýbajúci údaj na infoliste | človek volá v nedeľu večer | doplniť na zákazke pred nástupom |

---

## Čo ešte nie je napojené

- **Odosielanie správ** — chýba kľúč poskytovateľa a adresa na príjem.
- **SuperFaktúra** — chýbajú `SF_EMAIL` a `SF_API_KEY`; integrácia neprešla
  sandboxom.
- **Názov firmy a IBAN v Nastaveniach** — bez nich nie sú na faktúre platobné
  údaje a nevykreslí sa QR platba. Vymyslené meno sa nikam netlačí: doklad
  radšej mlčí, než by uviedol nesprávny údaj.
- **Steuernummer (DE)** v Nastaveniach — kým nie je, riadok sa na výkaze
  vynechá. (Predtým sa naň tlačilo „wird nachgereicht", čo je na doklade pre
  odberateľa priznanie, že niečo chýba — a pole sa pritom nedalo nikde vyplniť.)
