# DANUBRA Hub v2 — priebeh fáz

Krátke zhrnutie po každej fáze: čo je hotové, čo treba otestovať rukami,
čo zostalo otvorené. Plán fáz je v `01_DANUBRA_Hub_v2_navrh.md`, kapitola 10.

---

## F1 — Základ a archivácia ubytovania

**Stav:** hotová · 17. 9. 2026 · migrácia 013 je aplikovaná v produkcii

### Čo je hotové

**Databáza** (`013_v2_f1_zaklad.sql`)

- `danubra_settings.modules` — jsonb príznak, ktoré agendy sa zobrazujú.
  Nasadené ako `accommodation: false`, ostatné tri `true`.
- `danubra_enums` — číselníky na jednom mieste, 31 hodnôt v štyroch druhoch:
  `worker_document` (9, aj s nemeckými názvami pre dokumenty smerom
  k partnerom), `cost_category` (8), `unit` (7, kľúče idú priamo do
  SuperFaktúry ako `unit`), `override_rule` (7).
- `danubra_overrides` — zapísané obídenia blokátorov. Dôvod je povinný
  (`CHECK length(btrim(reason)) >= 5`) a riadok sa nemaže: RLS má select,
  insert a update, nie delete. Zrušenie výnimky ide cez `revoked_at`.

**Kód**

- `lib/money.js` — aritmetika v celých centoch (R2). Násobenie a percentá
  cez BigInt, takže hodiny × sadzba nepreteče presnosť čísla; delenie sumy
  medzi položky (`split`, `allocate`) nikdy nestratí ani nepridá cent.
  Do databázy sa zapisuje cez `toNumeric`, aby tam nikdy neišiel float.
- `lib/enums.js` — číselníky z databázy s cache a zálohou. Výpadok siete
  nevyprázdni select-y.
- `js/components/shell.js` — päť zdieľaných komponentov zo zadania:
  detail s bočným panelom, zoznam s filtrom, append-only poznámky, prehľad
  súm, blokátor s vysvetlením. Logika, ktorá sa dá pokaziť (filtrovanie,
  súčty, vyhodnotenie blokátora) je v čistých funkciách a má testy.
- `js/app.js` — navigácia rešpektuje `settings.modules`. Vypnutá agenda
  zmizne z prepínača aj z mega menu a **nedá sa otvoriť ani starým odkazom**
  (`routeAvailable` v routeri).
- `js/modules/settings.js` — prepínač agend. Bez neho by sa archivovaná
  agenda dala vrátiť len ručne v SQL.
- `types/supabase.d.ts` — typy zo Supabase, prefiltrované na `danubra_*`.
- `tests/run-all.js` + `npm test` — dovtedy sa testy spúšťali po jednom.

### Čo treba otestovať rukami

1. **Navigácia** — po prihlásení nie je vidieť Dopyty, Ponuky, Objednávky,
   Aktívne pobyty ani Firmy a kontakty. Prepínač agend nad menu zmizol,
   lebo je zapnutá jediná agenda.
2. **Ubytovania zostali** — položka „Ubytovania" je v skupine DATABÁZA
   a otvorí sa. To je zámer (R4): ubytovanie je náklad zákazky.
3. **Starý odkaz** — `#/inquiries` v adresnom riadku musí skončiť na
   dashboarde, nie na archivovanej obrazovke.
4. **Vrátenie agendy** — Nastavenia → Zapnuté agendy → zapnúť
   „Sprostredkovanie ubytovania". Menu sa prestaví okamžite, bez obnovenia
   stránky, a všetky staré záznamy sú na svojom mieste.
5. **Formátovanie súm** — nikde nesmie byť `1234.5 €` namiesto
   `1 234,50 €`. Moduly v1 zatiaľ používajú `UI.money`; prechod na
   `Money.format` sa robí po modulech v ďalších fázach.

### Čo zostalo otvorené

- **Komponenty zatiaľ nepoužíva žiadna obrazovka v1.** Sú postavené
  a otestované, ale zapájať ich znamená prepisovať existujúce obrazovky.
  Robí sa to po module v tej fáze, ktorá daný modul rozširuje — inak by
  F1 prepisovala všetko naraz a rozbila by to, čo dnes beží.
- **`tsc --checkJs --noEmit` ešte nie je v `npm test`.** Typy sú
  vygenerované, ale JSDoc anotácie treba najprv dopísať do modulov, inak
  by kontrola hlásila stovky chýb bez úžitku. Zapne sa v F2 spolu
  s profilom živnostníka.
- **`danubra_overrides` ešte nikto nezapisuje.** Tabuľka aj komponent sú
  hotové; prvé skutočné použitie príde v F5 (nasadenia bez platných
  dokladov).
- **Dve väzby z v1 zostávajú** podľa R4 — `danubra_assignments.accommodation_order_id`
  a `danubra_invoices.client_id`. Nové záznamy ich nepoužívajú.
- **IBAN v `danubra_settings.supplier` je stále `SK00 0000…`**, takže QR
  platba na faktúrach nefunguje. Treba doplniť v Nastaveniach.

### Testy

595 testov v trinástich sadách a smoke test nad 43 súbormi.
Spustenie: `npm test`.

---

## F2 — Živnostníci a doklady

**Stav:** hotová · 17. 9. 2026 · migrácia 014 je aplikovaná v produkcii

### Čo je hotové

**Databáza** (`014_v2_f2_zivnostnici_doklady.sql`)

- `danubra_workers` má fakturačné údaje živnosti: `company_name`,
  `company_id`, `tax_id`, `vat_id`, `vat_payer`, adresu podnikania,
  `trade_licence_from`, `trade_licence_scopes`, `sf_client_id`, `crew_id`
  (cudzí kľúč doplní F3). Zamestnanecké stĺpce z v1 zostávajú — historické
  záznamy sa nemenia.
- `danubra_worker_documents` má `storage_path`, `notify_days_before`
  a `required_for`.
- `danubra_v_worker_documents` — pohľad s dopočítaným `validity`
  (`not_yet` / `valid` / `expiring` / `expired`) a `days_left`.
- `danubra_convert_candidate(uuid, bool, text)` — prevod kandidáta na
  živnostníka v jednej operácii.
- Číselník dostal `training` (školenie BOZP) a dva nové kľúče výnimiek:
  `missing_document` a `missing_billing_data`.

**Kód**

- `lib/staffing/documents.js` — platnosť dokladov, pripravenosť na
  nasadenie a kontrola fakturačných údajov. 84 testov.
- `js/modules/workers.js` — kartotéka je živnostnícka. Detail odpovedá na
  dve otázky priamo: „Smieme ho nasadiť?" a „Môžeme od neho prijať
  faktúru?". Typy dokladov ťahá z číselníka, takže pridanie nového
  nevyžaduje zásah do kódu.
- `js/modules/candidates.js` — prevod ide cez RPC.
- `js/db.js` — pribudol `DB.rpc()`.

### Čo sa cestou opravilo

- **Prevod kandidáta bol dva samostatné zápisy z prehliadača.** Najprv
  vznikol pracovník, potom sa doplnila väzba. Keď druhý zápis nedobehol,
  človek zostal v systéme dvakrát a náborová história sa k nemu nedala
  dohľadať. Teraz je to jedna databázová operácia, idempotentná, a doviaže
  aj pracovníka, ktorý po takom nedokončenom prevode ostal.
- **Jeden horizont upozornenia pre všetky doklady.** A1 vystavuje Sociálna
  poisťovňa až 45 dní, takže upozornenie 30 dní dopredu prišlo neskoro.
  Horizont je teraz podľa typu: A1 60 dní, doklad totožnosti 90,
  zdravotná prehliadka 14.
- **Chýbajúci a expirovaný doklad mali rovnaký kľúč.** Sú to dve rôzne
  práce — jeden treba vybaviť, druhý obnoviť — takže majú dva kľúče.

### Čo treba otestovať rukami

1. **Kartotéka** — otvor živnostníka. Nahor sa vykreslí „Smieme ho
   nasadiť?" so zoznamom toho, čo chýba, a s dôvodom prečo. Pod tým
   „Fakturačné údaje živnosti" s tým istým typom zoznamu.
2. **Doklad s vlastným horizontom** — pridaj A1 s koncom platnosti za
   50 dní. Musí sa ukázať ako „čoskoro vyprší · ešte 50 dní", nie ako
   platný.
3. **Prevod kandidáta** — preveď kandidáta. V jeho poznámkach musí
   pribudnúť záznam o prevode a v kartotéke pracovníka aktivita o tom,
   odkiaľ vznikol. Druhé kliknutie nesmie vyrobiť druhého človeka.
4. **Nastúpenie kandidáta** — pri nastúpení zo šesťkrokového procesu musí
   stav kandidáta zostať „nastúpený", nie spadnúť na „pripravený".

### Čo zostalo otvorené

- **Nahrávanie skenu dokladu ešte nie je.** Stĺpec `storage_path` existuje
  a je zdokumentovaný, ale privátny bucket a podpísané URL pre doklady
  pribudnú spolu s prijatými faktúrami vo F7, aby sa úložisko riešilo raz.
- **`required_for` na doklade nikto nenastavuje.** Zoznam povinných dokladov
  drží zatiaľ kód (`REQUIRED` v `documents.js`). Stĺpec je pripravený na to,
  aby sa dal prepísať z UI, keď sa ukáže, že to treba.
- **Overenie IČO v zrsr.sk nie je automatické.** Je to voľne dostupný
  register, ale jeho rozhranie treba preskúmať; zatiaľ sa IČO zadáva ručne.
- **`crew_id` je zatiaľ bez cudzieho kľúča** — tabuľka partií pribudne vo F3.

### Testy

679 testov v štrnástich sadách a smoke test nad 44 súbormi.

---

## F3 — Partie a odberatelia

**Stav:** hotová · 17. 9. 2026 · migrácia 015 je aplikovaná v produkcii

### Čo je hotové

**Databáza** (`015_v2_f3_partie_odberatelia.sql`)

- `danubra_crews` a `danubra_crew_members` — partia a členstvo s trvaním.
  Odchod sa zapisuje cez `left_at`, riadok sa nemaže: RLS má select, insert
  a update, nie delete.
- Trigger `danubra_crew_leader_is_member()` — predák je vždy aj členom
  a je vždy len jeden. Drží sa to v databáze, nie v UI, lebo partiu môže
  založiť aj import alebo skript.
- `danubra_workers.crew_id` konečne dostal cudzí kľúč (v F2 ostal bez neho,
  lebo tabuľka partií ešte nebola).
- Odberatelia: `sf_client_id`, `default_charge_rate`, `invoice_language`,
  `reverse_charge`, `status`.
- **`danubra_invoices.partner_id`** — chýbajúca väzba, pozri nižšie.
- `danubra_v_partner_payment` — platobná disciplína počítaná v SQL.

**Kód**

- `lib/staffing/crews.js` — kto je v partii **ku dňu**, zloženie partie
  a pravidlo R5. 52 testov.
- `lib/partners/payment.js` — doba inkasy, podiel úhrad načas, návrh
  hodnotenia s dôvodom. 52 testov.
- `js/modules/crews.js` — nová obrazovka Partie.
- `js/modules/partners.js` — platobná disciplína z reálnych dát.

### Čo sa cestou opravilo

**Vydané faktúry nemali väzbu na nemeckého odberateľa.** Modul odberateľov
filtroval faktúry cez `client_id`, ktorý ukazuje na `danubra_clients` —
agendu ubytovania. Panel „Platobná disciplína" preto nikdy nemal čo
zobraziť a ticho ukazoval nulu; vyzeralo to, že odberateľ nemá faktúry.
Pribudol `partner_id`, `client_id` zostáva pre historické záznamy (R4).
Zapísané ako R10.

### Čo treba otestovať rukami

1. **Nová partia** — ĽUDIA → Partie → Nová partia. Predák sa dá zvoliť až
   pri úprave, keď má partia členov.
2. **Predák sa pridá sám** — zvoľ za predáka niekoho, kto v partii je.
   Pri zmene predáka musí ten starý spadnúť na „člen" a predák zostať jeden.
3. **Ukončenie členstva** — človek zmizne z „Členovia" a objaví sa v „Boli
   v partii" aj s obdobím. Nič sa nezmaže.
4. **Fakturácia partie** — v detaile nie je a nesmie pribudnúť tlačidlo na
   spoločnú faktúru. Je tam vysvetlenie prečo a zoznam členov, ktorým chýbajú
   fakturačné údaje.
5. **Odberateľ** — panel platobnej disciplíny. Zatiaľ ukáže „zatiaľ žiadna
   faktúra", lebo jediná faktúra v databáze patrí klientovi z ubytovania.
   Pribudne obsah, keď sa vo F6 začnú vystavovať faktúry cez `partner_id`.

### Čo zostalo otvorené

- **Nasadenie partie na zákazku** ešte nie je — partia sa zatiaľ nedá
  priradiť k zákazke ako celok. Patrí to k nasadeniam vo F5.
- **`default_charge_rate` a `reverse_charge` sa zatiaľ nikde nepoužívajú.**
  Stĺpce sú pripravené pre ponuky (F4) a fakturáciu (F6).
- **Hodnotenie odberateľa sa neprepisuje samo.** Appka navrhne, čo vychádza
  z faktúr, aj s dôvodom — prepísať to treba kliknutím. Je to obchodné
  rozhodnutie, nie výpočet.
- **`crew_id` na pracovníkovi je duplicita** k `danubra_crew_members`.
  Zatiaľ ho nikto nezapisuje; členstvo drží tabuľka, lebo má trvanie.
  Stĺpec sa buď začne plniť ako skratka na aktuálnu partiu, alebo padne —
  rozhodne sa vo F5, keď sa ukáže, ako sa partie nasadzujú.

### Testy

783 testov v šestnástich sadách a smoke test nad 47 súbormi.

Zhodu JS a SQL overili dva testy proti reálnej databáze v transakcii, ktorá
sa zrolovala: trigger predáka a platobná disciplína (5/3/1 faktúr,
3 500 € neuhradených, 31,0 dňa priemer, 67 % načas — identicky v oboch).
