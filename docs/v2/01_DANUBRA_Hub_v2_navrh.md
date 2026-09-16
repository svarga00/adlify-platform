# DANUBRA Hub v2 — funkčný návrh

Verzia 1 · 16. 9. 2026 · autor: Claude, na schválenie Štefanovi

Tento dokument hovorí **čo** má appka robiť a **prečo**. Technológiu rieši
`DECISIONS.md`, dátový model `02_DANUBRA_Hub_v2_schema.sql`, fakturáciu
`03_DANUBRA_Hub_v2_superfaktura.md`.

---

## 1. Kontext a cieľ

DANUBRA vysiela slovenských a maďarských **živnostníkov** na stavby a do dielní
v Nemecku. Zarába na rozdiele medzi tým, čo fakturuje nemeckému odberateľovi,
a tým, čo zaplatí živnostníkovi.

v1 obsluhoval nábor a rozpracované subdodávky. Od v2 sa appka rozširuje na celý
obchodný cyklus vrátane peňazí:

```
inzerát → hovor → kandidát → živnostník s dokladmi
                                      ↓
odberateľ → ponuka → zmluva → zákazka → nasadenie → výkaz hodín
                                                          ↓
                                    vydaná faktúra ← podklad
                                          ↓
                          prijatá faktúra od živnostníka
                                          ↓
                                 banka → cash-flow
```

**Modul ubytovania sa archivuje** (kapitola 9). Nezaniká — ubytovanie je naďalej
náklad zákazky a argument v inzeráte, ale prestáva byť samostatným biznisom.

**Používatelia:** Štefan (operatíva, nábor, zákazky) a Michaela (nemecká
komunikácia, doklady, fakturácia). Rovnaké práva okrem schvaľovania faktúr —
to má len admin. Appka nie je verejná.

---

## 2. UX pravidlá

Platia všade. Pochádzajú z v1, kde sa overili v reálnej prevádzke.

1. **Klepnutie je vidieť okamžite.** Obrazovka sa prekreslí pred zápisom do
   databázy, nie po ňom. Keď zápis zlyhá, stav sa vráti späť a povie sa to.
2. **Žiadne tlačidlo „uložiť"**, ktoré sa dá zabudnúť stlačiť. Zmena sa ukladá
   pri zadaní.
3. **Prekresľuje sa len to, čo sa zmenilo.** Rozpísaný text a miesto v zozname
   sa nesmú stratiť.
4. **Kontext po boku.** Pri práci na zázname je vpravo vidieť, čoho sa týka
   (zákazka, odberateľ, sumy) a čo z nej zatiaľ vyplynulo.
5. **Mobil je rovnocenný.** Kde sa bočný panel nezmestí, nahradí ho lišta so
   zhrnutím. Nič nesmie byť dostupné len na desktope.
6. **Ikony, nie emoji.** SVG sada z `js/icons.js`.
7. **Slovenčina, vykanie ku kandidátom.** Dokumenty pre nemeckých odberateľov
   po nemecky.
8. **Celé eurá v prehľadoch, centy na dokladoch.**
9. **Prázdny stav vždy povie, čo spraviť ďalej**, nie „žiadne záznamy".
10. **Blokátor vysvetlí dôvod aj nápravu.** Nikdy len „nie je možné".

---

## 3. Moduly

### 3.1 Živnostníci (`danubra_workers`, rozšírenie)

Profil človeka, ktorý pre nás pracuje. Nadväzuje na kandidáta z náboru.

- osobné a kontaktné údaje, jazyk, remeslo, zaradenie (LG1/LG2)
- **forma spolupráce**: živnostník (predvolené) alebo zamestnanec
- fakturačné údaje živnosti: IČO, DIČ, IČ DPH, adresa, IBAN
- hodinová sadzba, ktorú nám fakturuje
- **doklady s platnosťou** (`danubra_worker_documents`): OP/pas, živnostenský
  list, A1, zdravotná prehliadka, certifikáty, zmluva o dielo
- stav: kandidát → pripravený → nasadený → neaktívny → blacklist
- história nasadení, odpracovaných hodín a prijatých faktúr

**Kľúčové pravidlo:** doklad má `valid_to`. Appka sama hlási, čo expiruje
(kapitola 8).

### 3.2 Partie (`danubra_crews`, nové)

Skupina živnostníkov, ktorá chodí spolu. Má vedúceho (kontaktnú osobu) a
členov. Nasadzuje sa ako celok, ale **fakturuje každý sám za seba** — partia
nie je právny subjekt a spoločná fakturácia by vyzerala ako zamestnávanie.

- názov, vedúci, členovia s dátumom vstupu a odchodu
- remeslo, obvyklý počet ľudí
- nasadenie partie vytvorí nasadenie pre každého člena

### 3.3 Odberatelia (`danubra_partners`, rozšírenie)

Nemecké firmy, ktorým fakturujeme.

- názov, USt-IdNr, Handelsregister, adresa, kontaktná osoba
- splatnosť, hodnotenie platobnej disciplíny
- stavebná firma áno/nie → rozhoduje o SOKA, §48b a Bau-Mindestlohn
- **väzba na SuperFaktúru** (`sf_client_id`)
- prehľad: čo sme im fakturovali, čo je po splatnosti, aká je ich doba inkasa

### 3.4 Ponuky (`danubra_quotes`, nové)

Čo sme odberateľovi ponúkli, kým z toho bola zmluva.

- remeslo, počet ľudí, sadzba, termín, miesto
- platnosť ponuky, stav: pripravená → odoslaná → prijatá → odmietnutá → expirovaná
- **prepočet marže** ešte pred odoslaním: koľko nám z toho zostane po nákladoch
  na živnostníkov, ubytovanie a dopravu
- prijatá ponuka sa jedným klikom mení na zmluvu — údaje sa prenesú

### 3.5 Zmluvy (`danubra_contracts`, nové)

Rámcová zmluva alebo zmluva o dielo s odberateľom.

- číslo, odberateľ, predmet (dielo, nie hodiny — §Werkvertrag)
- platnosť od–do, sadzby, splatnosť
- **dodatky** (`danubra_contract_amendments`): každá zmena koncového dátumu
  alebo sadzby je samostatný záznam s pôvodnou a novou hodnotou
- súbory: podpísané PDF

### 3.6 Zákazky (`danubra_subcontracts`, rozšírenie)

Konkrétna stavba alebo dielňa. Prakticky beží dnes, dopĺňa sa väzba na zmluvu.

- miesto, termín, rozsah, typ prác (stavba/dielňa)
- compliance stavy: Zoll, §48b, SOKA, §9 HwO
- naviazané ubytovanie a doprava (zostáva z v1)
- prehľad: kto je nasadený, koľko sa odrobilo, čo je vyfakturované

### 3.7 Nasadenia (`danubra_assignments`, rozšírenie)

Konkrétny človek na konkrétnej zákazke od–do.

- sadzba, ktorú mu platíme, a sadzba, ktorú za neho fakturujeme
- rola: predák / pracovník (predák je dôkaz proti skrytej ANÜ)
- náklady: ubytovanie, doprava, diéty
- **checklist pred nástupom** — bez neho sa nasadenie nespustí (kapitola 8)

### 3.8 Výkazy hodín (`danubra_timesheets`, rozšírenie)

- deň, hodiny, typ činnosti (stavba / dielňa / cesta)
- schválenie — len schválené hodiny idú do fakturácie
- **uzávierka obdobia**: hodiny za mesiac sa uzavrú a vznikne z nich podklad
- oddelene stavba vs. dielňa kvôli pravidlu >50 % (SOKA-BAU)

### 3.9 Vydané faktúry (`danubra_invoices`, prestavba)

Faktúra odberateľovi za odpracované hodiny alebo dielo.

- vzniká **z podkladu** (uzavreté hodiny), nie ručným písaním položiek
- stavy: návrh → **čaká na schválenie** → schválená → vystavená → odoslaná →
  uhradená / po splatnosti / stornovaná
- **vystavuje sa cez SuperFaktúru**, nie vlastným generátorom
- reverse charge §13b pri nemeckých odberateľoch s USt-IdNr
- §48b: ak nemáme Freistellungsbescheinigung, odberateľ zráža 15 % — appka to
  na faktúre počíta a hlási

### 3.10 Prijaté faktúry (`danubra_bills`, nové)

Faktúra od živnostníka nám.

- za aké obdobie a ktoré nasadenie
- appka vie, koľko hodín má schválených → **kontrola, či sedí suma**
- stavy: prijatá → skontrolovaná → schválená na úhradu → uhradená
- prepis do SuperFaktúry ako výdavok

### 3.11 Náklady (`danubra_costs`, nové)

Všetko ostatné, čo zákazku stojí: ubytovanie, doprava, náradie, poistenie,
SOKA, poplatky.

- naviazané na zákazku alebo na firmu ako réžia
- opakované náklady (mesačné ubytovanie) sa generujú automaticky

### 3.12 Banka (`danubra_bank_transactions`, nové)

- import výpisu (CSV/XML) alebo ručné pridanie
- **párovanie**: variabilný symbol → faktúra, suma → prijatá faktúra
- nespárované položky sa nezahodia, čakajú v zozname

### 3.13 Cash-flow

Nie nový modul, ale pohľad naprieč. Rozširuje v1 panel.

- koľko nám dlhujú odberatelia a odkedy (DSO)
- koľko dlhujeme živnostníkom a kedy to treba zaplatiť
- **prah škálovania**: nad akú dobu inkasa sa nesmie pridávať ďalší človek
  bez faktoringu
- výhľad 30/60/90 dní

### 3.14 Úlohy so systémovými pravidlami (`danubra_tasks`, rozšírenie)

v1 má ručné aj automatické úlohy. v2 pridáva **pravidlá ako dáta**
(`danubra_task_rules`) namiesto pravidiel zadrôtovaných v crone.

Pravidlo = čo sledovať, koľko dní dopredu, akú úlohu vytvoriť, komu ju dať.
Nové pravidlo sa pridá bez zásahu do kódu.

---

## 4. Prepojenia

Všetko musí byť preklikateľné oboma smermi:

| Z | Na |
|---|---|
| živnostník | jeho nasadenia, hodiny, prijaté faktúry, doklady, kandidát, z ktorého vznikol |
| zákazka | odberateľ, zmluva, nasadení ľudia, hodiny, vydané faktúry, náklady, marža |
| vydaná faktúra | zákazka, podklad s hodinami, odberateľ, platba z banky |
| prijatá faktúra | živnostník, nasadenie, schválené hodiny, úhrada |
| odberateľ | zmluvy, zákazky, faktúry, doba inkasa |

Na každej obrazovke detailu je **bočný panel s kontextom** — čoho sa záznam týka
a čo z neho vyplynulo.

---

## 5. Stavy a prechody

### Ponuka
`draft → sent → accepted → contract` · `sent → rejected` · `sent → expired`

### Zákazka
`draft → negotiation → won → active → completed` · kedykoľvek `cancelled`
Prechod na `active` je **blokovaný** compliance kontrolou (kapitola 8).

### Nasadenie
`planned → active → ended` · `planned → cancelled`
Prechod na `active` blokovaný platnosťou dokladov.

### Vydaná faktúra
`draft → pending_approval → approved → issued → sent → paid`
`issued → overdue` · `approved → cancelled`
**Z `pending_approval` ďalej len rukou admina.** Nikdy automaticky.

### Prijatá faktúra
`received → checked → approved → paid` · `received → disputed`

---

## 6. Tvrdé pravidlá

Nesmú sa obísť ani konfiguráciou, ani „len teraz výnimočne".

1. **Faktúra sa nevystaví ani neodošle bez schválenia adminom.** Cron ani
   integrácia nesmú preskočiť stav `pending_approval`.
2. **Peniaze sú `numeric` v databáze.** V JS sa počíta v celých centoch
   (celé čísla), nie v desatinných číslach. Zaokrúhľuje sa až na výstupe.
3. **Zmena koncového dátumu = samostatný záznam** (predĺženie zákazky, dodatok
   zmluvy) s pôvodnou aj novou hodnotou. Nikdy tichý prepis stĺpca.
4. **Nasadenie bez platných dokladov len s výnimkou admina** — a výnimka sa
   zapíše: kto, kedy, prečo.
5. **Poznámky sú append-only.** Nič sa fyzicky nemaže; oprava je nový záznam.
   Vynútené na úrovni RLS, nie dohodou.
6. **API kľúče len v premenných prostredia**, volania len zo servera. Nikdy
   z prehliadača.
7. **Adresa a kontakt sa odberateľovi/klientovi neposielajú, kým nie je
   zaplatené** (dedené z v1, platí pre ubytovanie).
8. **Nahrávanie hovoru len s výslovným súhlasom** oboch strán daným vopred
   (SR §377 TZ, DE §201 StGB).

---

## 7. Dôsledky nemeckej legislatívy

Appka ich nemá „vedieť" — má ich **vynucovať**.

| Vec | Kedy | Čo appka robí |
|---|---|---|
| A1 | vždy | bez platného A1 nasadenie neprejde |
| §48b Freistellung | stavebné práce | bez nej počíta 15 % zrážku na faktúre a hlási to |
| SOKA-BAU 14,7 % | >50 % stavebných hodín | počíta podiel hodín a upozorní pred prekročením |
| Bau-Mindestlohn | stavba | sadzba pod LG1 15,86 / LG2 17,34 €/h sa nedá uložiť |
| §9 HwO | regulované remeslá | elektrikár bez oznámenia sa nenasadí |
| Zoll hlásenie | stavba, pred začiatkom | blokátor spustenia zákazky |
| §13b reverse charge | DE odberateľ s USt-IdNr | faktúra bez DPH s poznámkou |
| skrytá ANÜ | vždy | test rizika, varovanie pri zákazke bez predáka |

---

## 8. Obchodné pravidlá na otestovanie

Toto sú veci, ktoré musia mať jednotkové testy.

### Výpočty
1. **Marža nasadenia** = fakturovaná sadzba − (sadzba živnostníka + réžia/h).
   Pri zamestnancovi sa pripočítajú odvody (koeficient 1,362).
2. **Suma faktúry** = Σ (hodiny × sadzba) po položkách, zaokrúhlené na centy
   až na konci. Kontrola: súčet položiek = hlavička.
3. **Zrážka §48b** = 15 % z fakturovanej sumy, ak `freistellung_verified = false`
   a zákazka je stavebná.
4. **Podiel stavebných hodín** = stavba / (stavba + dielňa) za obdobie.
   Nad 50 % → SOKA povinná.
5. **DSO** = priemer (dátum úhrady − dátum vystavenia) za posledných 90 dní.
6. **Potrebný kapitál** = mesačné záväzky voči živnostníkom × (DSO / 30).

### Pravidlá
7. Faktúru v stave `pending_approval` **nie je možné** odoslať ani vystaviť.
8. Sadzbu pod minimálnu mzdu **nie je možné** uložiť na stavebnej zákazke.
9. Nasadenie s expirovaným dokladom **neprejde** do `active` bez výnimky.
10. Zmena `date_to` **vytvorí** záznam predĺženia.
11. Prijatá faktúra, ktorej suma nesedí so schválenými hodinami, sa označí
    ako sporná a **nedá sa schváliť** bez poznámky.
12. Poznámku **nie je možné** zmazať ani prepísať.

---

## 9. Čo sa archivuje

Ubytovacia agenda zostáva v databáze a v kóde, len sa **skryje z navigácie**
a označí ako archivovaná. Dôvody: sú v nej reálne dáta, faktúry na ne odkazujú,
a ubytovanie ako náklad zákazky zostáva.

| Tabuľka | Čo s ňou |
|---|---|
| `danubra_accommodations` | ponechať — ubytovanie je naďalej náklad zákazky |
| `danubra_subcontract_accommodations` | **ponechať aktívne** — väzba ubytovania na zákazku |
| `danubra_inquiries`, `_offers`, `_offer_variants` | archivovať |
| `danubra_orders`, `_order_persons`, `_order_requests`, `_order_service_periods`, `_order_extensions` | archivovať |
| `danubra_clients` | archivovať, ale **nechať FK z faktúr** |

**Dve väzby, ktoré treba vyriešiť pri F1:**
- `danubra_assignments.accommodation_order_id` → `danubra_orders`
- `danubra_invoices.client_id` → `danubra_clients`

Riešenie: obe zostanú, ale nové záznamy ich nepoužívajú. Vydané faktúry v2
budú viazané na `partner_id`; `client_id` zostane pre historické.

---

## 10. Fázy

Každá fáza končí funkčným celkom, ktorý sa dá používať. Žiadna fáza nenechá
appku v nepoužiteľnom stave.

### F1 — Základ a archivácia ubytovania
- migrácia: príznak archivácie, číselníky, spoločné stĺpce
- vygenerované typy zo Supabase
- spoločné komponenty: detail s bočným panelom, zoznam s filtrom, append-only
  poznámky, prehľad súm, blokátor s vysvetlením
- ubytovanie zmizne z navigácie, dáta zostanú
- **Výstup:** appka vyzerá ako v2, funguje ako v1

### F2 — Živnostníci a doklady
- rozšírenie profilu o fakturačné údaje živnosti
- doklady s platnosťou a upozorneniami
- prevod kandidáta na živnostníka bez straty histórie
- **Výstup:** kompletná kartotéka ľudí

### F3 — Partie a odberatelia
- partie s členmi a vedúcim
- rozšírenie odberateľov, prehľad platobnej disciplíny
- **Výstup:** vie sa, koho a komu posielame

### F4 — Ponuky a zmluvy
- ponuka s prepočtom marže, prechod na zmluvu
- zmluvy a dodatky
- **Výstup:** obchodná časť pred zákazkou

### F5 — Zákazky, nasadenia, výkazy hodín
- naviazanie zákazky na zmluvu
- nasadenie partie naraz
- uzávierka obdobia → podklad na fakturáciu
- **Výstup:** od zmluvy po podklad

### F6 — Vydané faktúry + SuperFaktúra
- faktúra z podkladu, schvaľovací tok
- integrácia **len proti sandboxu**
- **Výstup:** vystavená faktúra so schválením

### F7 — Prijaté faktúry a náklady
- faktúry od živnostníkov s kontrolou na hodiny
- náklady vrátane opakovaných
- výdavky do SuperFaktúry
- **Výstup:** obe strany peňazí

### F8 — Banka a cash-flow
- import výpisu, párovanie
- cash-flow panel s výhľadom a prahom škálovania
- **Výstup:** vie sa, či je na výplaty

### F9 — Úlohy a dashboard
- pravidlá ako dáta
- dashboard podľa toho, čo dnes treba spraviť
- **Výstup:** appka hovorí, čo robiť

---

## 11. Čo v2 zámerne nerieši

- viac firiem v jednej appke (je to interný nástroj pre dvoch ľudí)
- mzdy zamestnancov (model je živnostnícky)
- offline režim
- verejný portál pre živnostníkov
