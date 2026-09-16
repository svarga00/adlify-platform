# DANUBRA Hub v2 — rozhodnutia

Sem sa píše všetko, čo bolo v zadaní nejasné a rozhodlo sa to bez pýtania,
aby sa dalo pokračovať. Každý záznam má dôvod, nech sa dá spätne prehodnotiť.

---

## R1 — Stack: vanilla JS zostáva, typy sa pridajú bez prepisu

**Dátum:** 16. 9. 2026
**Zadanie hovorilo:** `app/`, `lib/`, `supabase/migrations/`, „vygeneruj
TypeScript typy zo Supabase", „decimal.js v TS".
**Skutočnosť:** appka je vanilla JS v `<script>` tagoch, bez build kroku,
migrácie sa spúšťajú ručne v SQL editore. Beží v prevádzke, má 360 testov
a reálne dáta.

**Rozhodnutie:** Štefan povedal „A aj B spolu" — teda nechať bežať, čo beží,
ale mať úžitok z typov. Takže:

- **beh zostáva vanilla JS.** Žiadny bundler, žiadny prepis.
- **typy sa generujú zo Supabase** do `danubra/types/supabase.d.ts`.
- **kontrola typov cez JSDoc** + `tsc --checkJs --noEmit` ako súčasť testov.
  Dá to väčšinu úžitku TypeScriptu bez jediného prepísaného súboru.
- ak sa neskôr ukáže, že to nestačí, prechod na skutočný TS je otvorený —
  JSDoc anotácie sa prevedú takmer jedna k jednej.

**Dôsledok:** zadanie hovorí o adresároch, ktoré neexistujú. Držíme sa
skutočných: `danubra/js/`, `danubra/lib/`, `danubra/database/migrations/`.

---

## R2 — Peniaze: celé centy v JS namiesto decimal.js

**Dátum:** 16. 9. 2026
**Zadanie hovorilo:** „peniaze len numeric v DB a decimal.js v TS".

**Rozhodnutie:** `numeric` v databáze zostáva bez debaty. V JS sa ale
decimal.js bez bundlera načítať nedá inak než z CDN, čo pridáva závislosť na
cudzom serveri do appky, ktorá dnes žiadnu nemá.

Namiesto toho: **aritmetika v celých centoch** (integer), delenie a
zaokrúhľovanie až na výstupe, súčty prednostne v SQL. Dosiahne to to isté —
žiadne chyby z desatinných čísel — bez závislosti.

Helper bude `danubra/lib/money.js` s testami.

Ak niekedy pribudne build krok, decimal.js sa doplní a helper sa prepíše zvnútra.

---

## R3 — Migrácie: číslovanie pokračuje, nie dátumové názvy

**Dátum:** 16. 9. 2026
**Zadanie hovorilo:** `supabase/migrations/YYYYMMDD_v2_fX_*.sql`.

**Rozhodnutie:** pokračujeme `danubra/database/migrations/013_...` a ďalej,
s označením fázy v názve, napríklad `013_v2_f1_zaklad.sql`.

Dôvod: dnešných dvanásť migrácií je očíslovaných a poradie je záväzné —
už raz sa stalo, že sa spustili mimo poradia a padlo to. Miešať dva systémy
názvov v jednom adresári by to zhoršilo.

---

## R4 — Ubytovanie sa archivuje, ale nie celé

**Dátum:** 16. 9. 2026
**Zadanie hovorilo:** „vypadáva modul ubytovania (archivovať, nemazať)".

**Rozhodnutie:** archivuje sa **obchodná časť** (dopyty, ponuky, objednávky,
klienti), ale `danubra_accommodations` a `danubra_subcontract_accommodations`
**zostávajú aktívne** — ubytovanie je naďalej náklad zákazky a argument
v náborovom inzeráte.

Dve väzby zostávajú kvôli historickým záznamom a označia sa komentárom:
- `danubra_assignments.accommodation_order_id`
- `danubra_invoices.client_id`

Nové záznamy ich nepoužívajú; faktúry v2 idú cez `partner_id`.

---

## R5 — Partia fakturuje po jednom

**Dátum:** 16. 9. 2026
**Zadanie hovorilo:** „pribúdajú partie" — bez detailu o fakturácii.

**Rozhodnutie:** partia je len organizačná skupina. Nasadzuje sa naraz, ale
**každý živnostník fakturuje sám za seba**.

Dôvod: partia nie je právny subjekt. Jedna spoločná faktúra za skupinu ľudí by
pri kontrole vyzerala ako zamestnávanie alebo ako skrytá
Arbeitnehmerüberlassung — presne to riziko, pred ktorým appka inak varuje.

---

## R6 — Faktúry: SuperFaktúra je zdroj pravdy pre doklad

**Dátum:** 16. 9. 2026

**Rozhodnutie:** číslovanie, PDF a účtovný doklad rieši SuperFaktúra. Appka si
drží, **z čoho** doklad vznikol (obdobie, hodiny, zákazka) a stav
schvaľovania.

Vlastný QR generátor z v1 zostáva pre interné podklady — nie je dôvod ho
zahadzovať, je otestovaný.

---

## R7 — Poradie fáz

**Dátum:** 16. 9. 2026
**Zadanie hovorilo:** „fázami F1 → F9 v poradí z kapitoly 10" a „SuperFaktúru
(F6, F7)".

**Rozhodnutie:** kapitola 10 v `01_navrh.md` je napísaná tak, aby
SuperFaktúra vyšla presne na F6 (vydané) a F7 (prijaté), ako zadanie čakalo.

---

## R8 — Overiť v sandboxe SuperFaktúry

**Dátum:** 16. 9. 2026 · **stav: otvorené**

Dokumentácia to nehovorí jednoznačne:
- číselník `country_id` pre Nemecko,
- či `/invoices/send` vie viac adresátov naraz,
- formát stránkovania v `/invoices/index.json`,
- či sa dá priložiť súbor rovno pri `POST /expenses/add`.

Zistí sa pri F6/F7 a dopíše sem.
