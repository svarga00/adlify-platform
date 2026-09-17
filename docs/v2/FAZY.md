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
